'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('API گواهی فقط مدیر با رمز مجاز است و خطاها بدون ارسال درخواست خارجی گزارش می‌شوند',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-tls-api-'));const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('server timeout')),15000);child.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});child.once('exit',c=>reject(Error('server exit '+c)));});
 const call=async(method,url,cookie,body)=>{const r=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const sid=r.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1];return {status:r.status,json:await r.json(),cookie:sid?`sid=${sid}`:null}};
 let r=await call('GET','/api/admin/https');assert.equal(r.status,401);
 r=await call('POST','/api/login',null,{username:'admin',password:'Initial!2345'});const admin=r.cookie;
 await call('POST','/api/account/password',admin,{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
 assert.equal((await call('POST','/api/admin/users',admin,{username:'gate-tls',roleCode:'gate',fullName:'gate',position:'gate',password:'Changed!2345',mustChangePassword:false})).status,201);
 const gate=(await call('POST','/api/login',null,{username:'gate-tls',password:'Changed!2345'})).cookie;
 assert.equal((await call('GET','/api/admin/https',gate)).status,403);assert.equal((await call('POST','/api/admin/https',gate,{domain:'example.com',password:'Changed!2345',terms:true})).status,403);
 r=await call('GET','/api/admin/https',admin);assert.equal(r.status,200);assert.equal(r.json.active,null);assert(!JSON.stringify(r.json).includes('PRIVATE KEY'));
 r=await call('POST','/api/admin/https',admin,{domain:'example.com',password:'wrong',terms:true});assert.equal(r.status,403);
 r=await call('POST','/api/admin/https',admin,{domain:'example.com',password:'Changed!2345',terms:false});assert.equal(r.status,400);
 r=await call('POST','/api/admin/https',admin,{domain:'https://example.com/',password:'Changed!2345',terms:true});assert.equal(r.status,400);
 r=await call('POST','/api/admin/https',admin,{domain:'example.com',password:'Changed!2345',terms:true});assert.equal(r.status,400);assert.match(r.json.error,/۸۰/);
});

test('کوکی نشست HTTPS بر اساس اتصال واقعی Secure است',()=>{
 const sec=require('../lib/security');const sid=sec.createSession('user','127.0.0.1');const session=sec.getSession(sid);
 assert.match(sec.sessionCookie(sid,session,true),/; Secure/);assert.doesNotMatch(sec.sessionCookie(sid,session,false),/; Secure/);sec.destroySession(sid);
});
