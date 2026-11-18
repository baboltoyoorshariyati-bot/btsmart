'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

test('notification acknowledgements and counts are per user, include all unread and preserve legacy read records', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-notifications-'));
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,PORT:String(port),HOST:'127.0.0.1',ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(proc.exitCode===null){await new Promise(r=>{proc.once('exit',r);proc.kill('SIGTERM');setTimeout(r,3000).unref();});}fs.rmSync(dir,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(timer);resolve()}});proc.on('exit',c=>reject(Error('server exit '+c)));});
  const call=async (method,url,cookie,body)=>{const r=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const json=await r.json();const sid=r.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1];return {status:r.status,json,cookie:sid?`sid=${sid}`:null}};
  let r=await call('POST','/api/login',null,{username:'admin',password:'Initial!2345'});const admin=r.cookie;assert.ok(admin);
  assert.equal((await call('POST','/api/account/password',admin,{currentPassword:'Initial!2345',newPassword:'Changed!2345'})).status,200);
  for(const [username,roleCode] of [['sales1','sales'],['sales2','sales'],['gate1','gate']]){
    r=await call('POST','/api/admin/users',admin,{username,roleCode,fullName:username,position:username,password:'Changed!2345',mustChangePassword:false});assert.equal(r.status,201,JSON.stringify(r.json));
  }
  const sales1=(await call('POST','/api/login',null,{username:'sales1',password:'Changed!2345'})).cookie;
  const sales2=(await call('POST','/api/login',null,{username:'sales2',password:'Changed!2345'})).cookie;
  const gate=(await call('POST','/api/login',null,{username:'gate1',password:'Changed!2345'})).cookie;
  const db=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  const insert=db.prepare('INSERT INTO notifications (id,created_at,is_read,type,payload) VALUES (?,?,?,?,?)');
  for(let i=0;i<82;i++){const n={id:'n'+i,targetRole:'sales',type:'TEST',isRead:false,createdAt:'2026-01-01'};insert.run(n.id,n.createdAt,0,n.type,JSON.stringify(n));}
  for(const n of [{id:'legacy',targetRole:'sales',type:'TEST',isRead:true,createdAt:'2026-01-01'},{id:'gate',targetRole:'gate',type:'TEST',isRead:false,createdAt:'2026-01-01'}]) insert.run(n.id,n.createdAt,n.isRead?1:0,n.type,JSON.stringify(n));
  db.close();
  r=await call('GET','/api/notifications',sales1);assert.equal(r.json.unread,82);assert.equal(r.json.notifications.filter(n=>!n.isRead).length,82);assert.ok(!r.json.notifications.some(n=>n.id==='gate'));
  assert.equal((await call('GET','/api/workload',sales1)).json.counts.notifications,82);
  assert.equal((await call('POST','/api/notifications/read',admin,{id:'n0'})).status,200);
  assert.equal((await call('GET','/api/notifications',sales1)).json.unread,82,'admin opening must not silence sales');
  r=await call('POST','/api/notifications/read',sales1,{id:'n0'});assert.equal(r.status,200);assert.equal(r.json.unread,81);assert.ok(!r.json.notifications.some(n=>n.id==='n0'&&!n.isRead));
  assert.equal((await call('GET','/api/notifications',sales1)).json.unread,81);
  assert.equal((await call('GET','/api/notifications',sales2)).json.unread,82,'another account must still see it');
  r=await call('POST','/api/notifications/read',sales1,{ids:[]});assert.equal(r.json.unread,81,'empty ids must not mark every notice');
  assert.equal((await call('POST','/api/notifications/read',sales1,{ids:['n1','gate']})).status,200);
  assert.equal((await call('GET','/api/notifications',sales1)).json.unread,80);
  assert.equal((await call('GET','/api/notifications',sales2)).json.unread,82);
  assert.equal((await call('GET','/api/notifications',gate)).json.unread,1,'cannot mark another role');
  assert.equal((await call('POST','/api/notifications/read',sales1,{ids:['n2',4]})).status,400);
  assert.equal((await call('POST','/api/notifications/read',sales1,{id:''})).status,400);
  assert.equal((await call('GET','/api/notifications',sales1)).json.unread,80,'invalid batch is atomic');
  await call('POST','/api/notifications/read',sales1,{});
  r=await call('GET','/api/notifications',sales1);assert.equal(r.json.unread,0);assert.ok(r.json.notifications.every(n=>n.isRead));assert.ok(r.json.notifications.every(n=>!('readBy' in n)));
  assert.equal((await call('GET','/api/workload',sales1)).json.counts.notifications,0);
  assert.equal((await call('GET','/api/notifications',sales2)).json.unread,82);
  r=await call('GET','/api/notifications',gate);assert.equal(r.json.unread,1);assert.equal(r.json.notifications[0].id,'gate');
  await call('POST','/api/notifications/read',gate,{id:'n1'});
  assert.equal((await call('GET','/api/notifications',sales2)).json.unread,82);
});
