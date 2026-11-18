'use strict';
// فاز ۳ — قراردادهای «نوشت ردیفبهردیف» روی SQLite.
// هدف: هیچ مسیری کل دیتابیس را ذخیره نکند؛ هر تغییر همان ردیف را با
// INSERT ... ON CONFLICT DO UPDATE یا DELETE در SQL بنویسد.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function child(body, { dir = null } = {}) {
  const dataDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'bt-phase3-'));
  const code = `const fs=require('fs'),path=require('path');
const s=require('./lib/store');
const sql=s.sql;
${body}
`;
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', code], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: 'Phase3!Test12345' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `child failed: ${r.stderr}\n${r.stdout}`);
  assert.ok(r.stdout.includes('RESULT:'), `missing RESULT in: ${r.stdout}\n${r.stderr}`);
  return { dir: dataDir, value: JSON.parse(r.stdout.split('RESULT:')[1].trim()) };
}

test('phase 3: a memory mutation is written to SQL immediately, before store.save()', () => {
  const { value } = child(`
    const db=s.init();
    const { DatabaseSync }=require('node:sqlite');
    const external=new DatabaseSync(sql.dbFile());
    const before=sql.writeStats();
    const product=db.products[0];
    product.name='محصول ویرایششده فاز ۳';
    const row=external.prepare('SELECT name, payload FROM products WHERE id = ?').get(product.id);
    console.log('RESULT:'+JSON.stringify({
      column:row.name,
      payload:JSON.parse(row.payload).name,
      writes:sql.writeStats().upserts-before.upserts,
      products:sql.stats().products,
    }));
  `);
  assert.equal(value.column, 'محصول ویرایششده فاز ۳');
  assert.equal(value.payload, 'محصول ویرایششده فاز ۳');
  assert.equal(value.writes, 1, 'only the changed row must be written');
  assert.ok(value.products >= 90, 'the other catalog rows must not be rewritten');
});

test('phase 3: store.save() is an incremental sync, not a whole-database snapshot', () => {
  const { value } = child(`
    const db=s.init();
    const a=sql.writeStats(); s.save(); const b=sql.writeStats();
    db.products[0].name='ویرایششده';
    const c=sql.writeStats(); s.save(); const d=sql.writeStats();
    console.log('RESULT:'+JSON.stringify({
      products:sql.stats().products,
      idleUpserts:b.upserts-a.upserts, idleDeletes:b.deletes-a.deletes,
      writeThrough:c.upserts-b.upserts,
      saveUpserts:d.upserts-c.upserts, saveDeletes:d.deletes-c.deletes,
    }));
  `);
  assert.ok(value.products >= 90);
  assert.equal(value.idleUpserts, 0, 'an unchanged database must trigger zero INSERT/UPDATE');
  assert.equal(value.idleDeletes, 0, 'an unchanged database must trigger zero DELETE');
  assert.equal(value.writeThrough, 1, 'the mutation itself performs one row-level UPDATE');
  assert.equal(value.saveUpserts, 0, 'store.save() must not rewrite all tables');
});

test('phase 3: an UPDATE keeps its rowid (real UPSERT, not DELETE+INSERT)', () => {
  const { value } = child(`
    const db=s.init();
    const id=db.products[0].id;
    const before=sql.query('SELECT rowid FROM products WHERE id = ?',[id])[0].rowid;
    db.products[0].name='نام جدید';
    const after=sql.query('SELECT rowid FROM products WHERE id = ?',[id])[0].rowid;
    console.log('RESULT:'+JSON.stringify({before,after,name:sql.query('SELECT name FROM products WHERE id = ?',[id])[0].name}));
  `);
  assert.equal(value.before, value.after);
  assert.equal(value.name, 'نام جدید');
});

test('phase 3: INSERT / UPDATE / DELETE at row level, including nested fields', () => {
  const { value } = child(`
    const db=s.init();
    db.customers.push({id:'p3-c1',name:'الف',code:'11111',phone:'0912',tags:['a'],extra:{level:1},createdAt:'2026-01-01'});
    const c=db.customers.find(x=>x.id==='p3-c1');
    c.name='ب'; c.extra.level=2; c.tags.push('b');
    s.save();
    const rows=sql.query("SELECT id, name, code, payload FROM customers WHERE id='p3-c1'");
    const saved=JSON.parse(rows[0].payload);
    db.customers.splice(db.customers.indexOf(c),1);
    s.save();
    console.log('RESULT:'+JSON.stringify({
      name:rows[0].name, code:rows[0].code, level:saved.extra.level, tags:saved.tags,
      left:sql.query('SELECT COUNT(*) AS n FROM customers')[0].n, inMemory:db.customers.length,
    }));
  `);
  assert.equal(value.name, 'ب');
  assert.equal(value.code, '11111');
  assert.equal(value.level, 2, 'a nested field change must update the same SQL row');
  assert.deepEqual(value.tags, ['a', 'b'], 'an inner array push must update the same SQL row');
  assert.equal(value.left, 0, 'splice must DELETE only that row');
  assert.equal(value.inMemory, 0);
});

test('phase 3: weighbridge vehicles, trips and ticket settings have real SQL tables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-phase3-wb-'));
  const first = child(`
    const db=s.init();
    db.vehicles.push({id:'p3-v1',plate:'۱۲۳۴۵',isActive:true,createdAt:'2026-01-01'});
    db.weighTrips.push({id:'p3-t1',plate:'۱۲۳۴۵',status:'DONE',createdAt:'2026-01-01'});
    db.weighTicketSettings={title:'فیش تست فاز ۳',paper:'A4L'};
    s.save();
    console.log('RESULT:'+JSON.stringify({tables:sql.tables(),stats:sql.stats()}));
  `, { dir });
  assert.ok(first.value.tables.includes('vehicles'));
  assert.ok(first.value.tables.includes('weigh_trips'));
  assert.ok(first.value.tables.includes('settings'));
  assert.equal(first.value.stats.vehicles, 1);
  assert.equal(first.value.stats.weigh_trips, 1);

  // یک فرآیند کاملاً تازه: اطلاعات باسکول بعد از ریاستارت هم باید سر جایشان باشند.
  const second = child(`
    const db=s.init();
    console.log('RESULT:'+JSON.stringify({vehicles:db.vehicles,trips:db.weighTrips,settings:db.weighTicketSettings}));
  `, { dir });
  assert.equal(second.value.vehicles.length, 1);
  assert.equal(second.value.vehicles[0].plate, '۱۲۳۴۵');
  assert.equal(second.value.trips.length, 1);
  assert.equal(second.value.trips[0].status, 'DONE');
  assert.equal(second.value.settings.paper, 'A4L');
});

test('phase 3: audit hash chain and idempotency survive row-level writes and restart', () => {
  const first = child(`
    const db=s.init();
    s.audit({id:'u1',username:'admin'},'P3_TEST','order','o1',{a:1},{});
    s.audit({id:'u1',username:'admin'},'P3_TEST2','order','o2',{},{});
    db.idempotency.push({key:'k1',userId:'u1',route:'r1',status:200,body:{ok:true},createdAt:new Date().toISOString()});
    s.save();
    console.log('RESULT:'+JSON.stringify({
      chain:s.verifyAuditChain(),
      audit:sql.query('SELECT COUNT(*) AS n FROM audit')[0].n,
      idem:sql.query('SELECT COUNT(*) AS n FROM idempotency')[0].n,
      json:fs.existsSync(path.join(process.env.DATA_DIR,'db.json')),
    }));
  `);
  assert.equal(first.value.chain.ok, true);
  assert.equal(first.value.chain.checked, 2);
  assert.equal(first.value.audit, 2);
  assert.equal(first.value.idem, 1);
  assert.equal(first.value.json, false, 'no JSON database file may be written');

  const second = child(`
    const db=s.init();
    console.log('RESULT:'+JSON.stringify({chain:s.verifyAuditChain(),idem:sql.query('SELECT COUNT(*) AS n FROM idempotency')[0].n}));
  `, { dir: first.dir });
  assert.equal(second.value.chain.ok, true, 'the audit chain must stay valid after restart');
  assert.equal(second.value.chain.checked, 2);
  assert.equal(second.value.idem, 1);
});

test('phase 3: direct repository writes stay in sync with the in-memory view', () => {
  const { value } = child(`
    const db=s.init();
    const repo=require('./lib/sql-repos');
    repo.repos.customers.insert({id:'p3-direct',name:'مستقیم',code:'22222',phone:'0912',createdAt:'2026-01-01'});
    s.save();
    const inserted=sql.query("SELECT name FROM customers WHERE id='p3-direct'");
    const inMemory=db.customers.some(c=>c.id==='p3-direct');
    repo.repos.customers.replace({id:'p3-direct',name:'جایگزین',code:'22222',phone:'0912',createdAt:'2026-01-01'});
    const replaced=sql.query("SELECT name FROM customers WHERE id='p3-direct'");
    repo.repos.customers.remove('p3-direct');
    s.save();
    console.log('RESULT:'+JSON.stringify({
      inserted:inserted[0]&&inserted[0].name, inMemory,
      replaced:replaced[0]&&replaced[0].name,
      left:sql.query("SELECT COUNT(*) AS n FROM customers WHERE id='p3-direct'")[0].n,
    }));
  `);
  assert.equal(value.inserted, 'مستقیم');
  assert.equal(value.inMemory, true, 'store.save() must not delete a row written directly through SQL');
  assert.equal(value.replaced, 'جایگزین');
  assert.equal(value.left, 0);
});

test('phase 3: weighbridge API rows survive a real server restart (end to end)', async () => {
  const { spawn } = require('node:child_process');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-phase3-api-'));
  const PORT = 4198;
  const BASE = `http://127.0.0.1:${PORT}`;
  const ADMIN = 'Phase3!Api12345';
  const NEWPASS = 'Phase3!Api54321';
  let proc;
  let cookie;

  async function call(method, p, { body, headers = {} } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  async function start() {
    proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'server.js')], {
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: ADMIN },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
      proc.stdout.on('data', (d) => { if (String(d).includes('"listening"')) { clearTimeout(timer); resolve(); } });
      proc.stderr.on('data', (d) => process.stderr.write(d));
      proc.on('exit', (c) => { clearTimeout(timer); reject(new Error(`server exited ${c}`)); });
    });
  }
  async function stop() {
    if (!proc) return;
    const p = proc; proc = null;
    await new Promise((resolve) => { p.once('exit', resolve); p.kill('SIGTERM'); setTimeout(resolve, 3000); });
  }

  try {
    await start();
    const login = await call('POST', '/api/login', { body: { username: 'admin', password: ADMIN } });
    assert.equal(login.status, 200, login.text);
    cookie = `sid=${login.headers.get('set-cookie').match(/sid=([^;]+)/)[1]}`;
    const change = await call('POST', '/api/account/password', { body: { currentPassword: ADMIN, newPassword: NEWPASS } });
    assert.equal(change.status, 200, change.text, 'forced password change must still work with live references');

    const created = await call('POST', '/api/weighbridge/vehicles', {
      body: { plate: '۱۲۳۴۵', driverName: 'راننده تست' },
      headers: { 'Idempotency-Key': 'p3-vehicle-1' },
    });
    assert.equal(created.status, 201, created.text);
    const defaults = await call('GET', '/api/weighbridge/ticket-settings');
    assert.equal(defaults.status, 200, defaults.text);
    const settings = { ...defaults.json.settings, title: 'فیش فاز سه' };
    const saved = await call('PUT', '/api/weighbridge/ticket-settings', { body: { settings } });
    assert.equal(saved.status, 200, saved.text);

    await stop();
    await start();
    const login2 = await call('POST', '/api/login', { body: { username: 'admin', password: NEWPASS } });
    assert.equal(login2.status, 200, login2.text);
    cookie = `sid=${login2.headers.get('set-cookie').match(/sid=([^;]+)/)[1]}`;
    const state = await call('GET', '/api/weighbridge/state');
    assert.equal(state.status, 200, state.text);
    assert.ok(state.json.vehicles.some((v) => v.plate === '12345'), 'vehicle must survive restart (plate digits are normalized)');
    const ticket = await call('GET', '/api/weighbridge/ticket-settings');
    assert.equal(ticket.status, 200, ticket.text);
    assert.equal(ticket.json.settings.title, 'فیش فاز سه', 'ticket settings must survive restart');
    assert.equal(fs.existsSync(path.join(dataDir, 'db.json')), false);
  } finally {
    await stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('phase 3: truncating a live array deletes only the removed rows', () => {
  const { value } = child(`
    const db=s.init();
    for(let i=1;i<=5;i++) db.notifications.push({id:'n'+i,userId:'u1',type:'T',isRead:false,createdAt:'2026-01-01'});
    const before=sql.query('SELECT COUNT(*) AS n FROM notifications')[0].n;
    db.notifications.length=2;
    s.save();
    console.log('RESULT:'+JSON.stringify({
      before, after:sql.query('SELECT COUNT(*) AS n FROM notifications')[0].n,
      ids:sql.query('SELECT id FROM notifications ORDER BY id').map(r=>r.id),
      inMemory:db.notifications.length,
    }));
  `);
  assert.equal(value.before, 5);
  assert.equal(value.after, 2);
  assert.deepEqual(value.ids, ['n1', 'n2']);
  assert.equal(value.inMemory, 2);
});
