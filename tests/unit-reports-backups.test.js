'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-unit-backup-'));
const port = 4294, base = `http://127.0.0.1:${port}`;
const initial = 'Initial!2345', password = 'Changed!2345';
let proc, admin, sales, storeA, storeB, ids = {};
async function call(method, url, cookie, body) {
  const headers = {}; if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const bytes = Buffer.from(await response.arrayBuffer());
  let json; try { json = JSON.parse(bytes.toString()); } catch {}
  const sid = response.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1];
  return { status: response.status, json, bytes, cookie: sid ? `sid=${sid}` : null, headers: response.headers };
}
before(async () => {
  proc = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR:dir, PORT:String(port), HOST:'127.0.0.1', ADMIN_INITIAL_PASSWORD:initial }, stdio:['ignore','pipe','pipe'] });
  await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(new Error('startup timeout')),15000); proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(timer);resolve();}}); proc.on('exit',c=>reject(new Error('exit '+c))); });
  let r=await call('POST','/api/login',null,{username:'admin',password:initial}); assert.equal(r.status,200); admin=r.cookie;
  r=await call('POST','/api/account/password',admin,{currentPassword:initial,newPassword:password}); assert.equal(r.status,200);
  for(const [username,roleCode] of [['sales1','sales'],['store1','store'],['store2','store']]) {
    r=await call('POST','/api/admin/users',admin,{username,roleCode,fullName:username,position:username,password,storeName:roleCode==='store'?username:'',branchNo:1,mustChangePassword:false}); assert.equal(r.status,201, JSON.stringify(r.json)); ids[username]=r.json.user.id;
  }
  sales=(await call('POST','/api/login',null,{username:'sales1',password})).cookie;
  storeA=(await call('POST','/api/login',null,{username:'store1',password})).cookie;
  storeB=(await call('POST','/api/login',null,{username:'store2',password})).cookie;
  const sql = new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  try {
    for (const [id,uid] of [['oa',ids.store1],['ob',ids.store2]]) {
      const o={id,orderNo:id,orderType:'STORE',storeId:uid,storeName:id,status:'STORE_PENDING_SALES',createdAt:'2026-01-01T00:00:00Z'};
      sql.prepare('INSERT INTO orders (id, created_at, order_no, order_type, status, payload) VALUES (?,?,?,?,?,?)').run(id,o.createdAt,o.orderNo,o.orderType,o.status,JSON.stringify(o));
    }
  } finally { sql.close(); }
});
after(async () => { if(proc){const p=proc;await new Promise(resolve=>{p.once('exit',resolve);p.kill('SIGTERM');setTimeout(resolve,3000).unref();});} fs.rmSync(dir,{recursive:true,force:true}); });
test('unit report access is checked on the server and store rows are isolated', async () => {
  let r=await call('GET','/api/unit-reports/store/sources',storeA); assert.equal(r.status,200); assert.ok(r.json.sources.some(s=>s.key==='orders'));
  r=await call('POST','/api/unit-reports/store/query',storeA,{source:'orders'}); assert.equal(r.status,200); assert.deepEqual(r.json.rows.map(x=>x.orderNo),['oa']);
  r=await call('POST','/api/unit-reports/store/query',storeB,{source:'orders'}); assert.deepEqual(r.json.rows.map(x=>x.orderNo),['ob']);
  r=await call('GET','/api/unit-reports/sales/sources',storeA); assert.equal(r.status,403);
  r=await call('POST','/api/unit-reports/store/query',storeA,{source:'users'}); assert.equal(r.status,403);
  r=await call('POST','/api/unit-reports/sales/query',sales,{source:'orders',from:'2027-01-01'}); assert.equal(r.json.total,0);
  r=await call('POST','/api/unit-reports/store/export',storeA,{source:'orders'}); assert.equal(r.status,200); assert.match(r.headers.get('content-type'),/text\/csv/); assert.match(r.bytes.toString(),/oa/); assert.doesNotMatch(r.bytes.toString(),/ob/);
});
test('backup creation and download require admin; restore requires password and invalidates sessions', async () => {
  assert.equal((await call('GET','/api/admin/backups',sales)).status,403);
  let r=await call('POST','/api/admin/backups',admin,{}); assert.equal(r.status,201,JSON.stringify(r.json)); const name=r.json.name;
  r=await call('GET',`/api/admin/backups/${name}/download`,admin); assert.equal(r.status,200); assert.equal(r.bytes.subarray(0,16).toString('binary'),'SQLite format 3\0');
  assert.equal((await call('POST',`/api/admin/backups/${name}/restore`,admin,{confirm:'RESTORE',password:'wrong'})).status,403);
  assert.equal((await call('POST',`/api/admin/backups/not-valid/restore`,admin,{confirm:'RESTORE',password})).status,400);
  const db=new DatabaseSync(path.join(dir,'baboltoyoor.db')); db.prepare("DELETE FROM orders WHERE id='oa'").run(); db.close();
  r=await call('POST',`/api/admin/backups/${name}/restore`,admin,{confirm:'RESTORE',password}); assert.equal(r.status,200,JSON.stringify(r.json)); assert.match(r.json.safety,/before-restore/);
  assert.equal((await call('GET','/api/me',admin)).status,401); assert.equal((await call('GET','/api/me',sales)).status,401);
  admin=(await call('POST','/api/login',null,{username:'admin',password})).cookie; assert.ok(admin);
  r=await call('GET','/api/admin/backups',admin); assert.equal(r.status,200); assert.equal(r.json.backups.length,2);
  r=await call('POST','/api/unit-reports/store/query',admin,{source:'orders'}); assert.deepEqual(new Set(r.json.rows.map(x=>x.orderNo)),new Set(['oa','ob']));
  const verify=await call('GET','/api/admin/audit/verify',admin); assert.equal(verify.status,200); assert.equal(verify.json.ok,true,JSON.stringify(verify.json));
});

test('driver report filters both current and archived services by actual driver ID', () => {
  const unit=require('../lib/unit-reports');
  const db={orders:[{id:'o1',orderNo:'1',dispatch:{driverId:'d2',driverName:'other'},dispatches:[{driverId:'d1',driverName:'mine',sentAt:'2026-01-02'}]},{id:'o2',orderNo:'2',dispatch:{driverId:'d1',driverName:'mine'}},{id:'o3',orderNo:'3',dispatch:{driverId:'d2',driverName:'other'}}]};
  const result=unit.query(db,{roleCode:'driver',driverId:'d1'},'driver',{source:'deliveries'},{});
  assert.deepEqual(result.rows.map(r=>r.orderNo),['1','2']);
  assert.ok(result.rows.every(r=>r.driverName==='mine'));
  assert.equal(unit.query(db,{roleCode:'driver'},'driver',{source:'deliveries'},{}).total,0);
  assert.throws(()=>unit.query(db,{roleCode:'sales'},'driver',{source:'deliveries'},{}),/مجاز نیست/);
});


test('a corrupted snapshot is rejected without replacing the live database', async () => {
  const existing=(await call('GET','/api/admin/backups',admin)).json.backups.find(b=>b.name.includes('-manual-'));
  const bad='baboltoyor-manual-20260101T000000-abcdef123456.db';
  fs.copyFileSync(path.join(dir,'backups',existing.name),path.join(dir,'backups',bad));
  const db=new DatabaseSync(path.join(dir,'backups',bad)); db.prepare("UPDATE orders SET payload='not json' WHERE id='oa'").run(); db.close();
  const r=await call('POST',`/api/admin/backups/${bad}/restore`,admin,{confirm:'RESTORE',password});
  assert.equal(r.status,400,JSON.stringify(r.json));
  assert.equal((await call('GET','/api/me',admin)).status,200);
  const current=await call('POST','/api/unit-reports/store/query',admin,{source:'orders'});
  assert.deepEqual(new Set(current.json.rows.map(x=>x.orderNo)),new Set(['oa','ob']));
});

test('admin can upload a downloaded backup, validate it and restore it; unsafe uploads are rejected', async () => {
  const listing = await call('GET','/api/admin/backups',admin);
  const original = listing.json.backups.find(b=>b.name.includes('-manual-') && !b.name.includes('20260101'));
  const backup = (await call('GET',`/api/admin/backups/${original.name}/download`,admin)).bytes;
  const upload = async (cookie, bytes, headers={'Content-Type':'application/octet-stream','X-Backup-Upload':'1'}) => {
    const res = await fetch(base+'/api/admin/backups/upload',{method:'POST',headers:{...headers,...(cookie ? {Cookie:cookie} : {})},body:bytes});
    return {status:res.status,json:await res.json()};
  };
  const salesCookie = (await call('POST','/api/login',null,{username:'sales1',password})).cookie;
  assert.equal((await upload(null, backup)).status,401);
  assert.equal((await upload(salesCookie, backup)).status,403);
  assert.equal((await upload(admin, backup, {'Content-Type':'application/octet-stream'})).status,415);
  assert.equal((await upload(admin, Buffer.from('not a database'))).status,400);
  const corrupt = fs.readFileSync(path.join(dir,'backups','baboltoyor-manual-20260101T000000-abcdef123456.db'));
  assert.equal((await upload(admin,corrupt)).status,400);
  const altered=path.join(dir,'malicious.db'); fs.writeFileSync(altered,backup);
  const alteredDb=new DatabaseSync(altered); alteredDb.exec('CREATE VIEW malicious_view AS SELECT * FROM users'); alteredDb.close();
  assert.equal((await upload(admin,fs.readFileSync(altered))).status,400);
  const afterBad=await call('GET','/api/admin/backups',admin);
  assert.equal(afterBad.json.backups.filter(b=>b.name.includes('-uploaded-')).length,0);
  assert.equal(fs.readdirSync(path.join(dir,'backups')).filter(n=>n.startsWith('.upload-')).length,0);

  const result=await upload(admin,backup); assert.equal(result.status,201,JSON.stringify(result.json));
  assert.match(result.json.name,/^baboltoyor-uploaded-/);
  fs.unlinkSync(path.join(dir,'backups',original.name));
  const db=new DatabaseSync(path.join(dir,'baboltoyoor.db')); db.prepare("DELETE FROM orders WHERE id='oa'").run(); db.close();
  let r=await call('POST','/api/unit-reports/store/query',admin,{source:'orders'}); assert.deepEqual(r.json.rows.map(x=>x.orderNo),['ob']);
  assert.equal((await call('POST',`/api/admin/backups/${result.json.name}/restore`,admin,{confirm:'RESTORE',password:'wrong'})).status,403);
  r=await call('POST',`/api/admin/backups/${result.json.name}/restore`,admin,{confirm:'RESTORE',password}); assert.equal(r.status,200,JSON.stringify(r.json));
  assert.match(r.json.safety,/before-restore/); assert.equal((await call('GET','/api/me',admin)).status,401);
  admin=(await call('POST','/api/login',null,{username:'admin',password})).cookie;
  r=await call('POST','/api/unit-reports/store/query',admin,{source:'orders'}); assert.deepEqual(new Set(r.json.rows.map(x=>x.orderNo)),new Set(['oa','ob']));
});

test('oversize upload is rejected from the declared size before consuming the body', async () => {
  const http = require('node:http');
  const status = await new Promise((resolve,reject) => {
    const req=http.request(base+'/api/admin/backups/upload',{method:'POST',headers:{Cookie:admin,'Content-Type':'application/octet-stream','X-Backup-Upload':'1','Content-Length':String(512*1024*1024+1)}}, res => {res.resume();resolve(res.statusCode);req.destroy();});
    req.on('error',reject); req.flushHeaders();
  });
  assert.equal(status,413);
});
