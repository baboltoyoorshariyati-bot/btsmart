'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('سرور نشست بدون پیام خروج را پاک می‌کند و زبانه فعال و خروج صریح را حفظ می‌کند',{timeout:60000},async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-heartbeat-api-')),base=`http://127.0.0.1:${port}`;
 const preload=path.join(dir,'clock.cjs');fs.writeFileSync(preload,"const real=Date.now;let offset=0;Date.now=()=>real()+offset;process.on('message',m=>{if(m&&Number.isFinite(m.advance)){offset+=m.advance;process.send({advanced:offset});}});");
 const proc=spawn(process.execPath,['--require',preload,'server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe','ipc']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const advance=ms=>new Promise((resolve,reject)=>{proc.once('message',resolve);proc.send({advance:ms},err=>{if(err)reject(err);});});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r;};
  const admin=(await ok('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;
  await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  await ok('POST','/api/admin/users',{username:'sales',roleCode:'sales',fullName:'فروش',position:'آزمون',password:'Changed!2345',mustChangePassword:false},admin);
  const credentials={username:'sales',password:'Changed!2345',browserSession:true};
  const a='a'.repeat(32),b='b'.repeat(32);
  let sid=(await ok('POST','/api/login',credentials)).cookie;
  await ok('POST','/api/session/presence',{tabId:a},sid);await ok('POST','/api/session/presence',{tabId:b},sid);
  await advance(100000);await ok('POST','/api/session/presence',{tabId:b},sid);await advance(80000);
  assert.equal((await call('POST','/api/login',credentials)).status,409,'one live tab retains the login lock');
  await ok('POST','/api/session/leave',{tabId:b},sid);await advance(8100);
  assert.equal((await call('GET','/api/me',null,sid)).status,401,'the stale tab does not block clean last-tab close');
  sid=(await ok('POST','/api/login',credentials)).cookie;await ok('POST','/api/session/presence',{tabId:a},sid);
  await advance(180001);const next=await ok('POST','/api/login',credentials);
  assert.equal((await call('GET','/api/me',null,sid)).status,401,'missing leave is reclaimed without a timer tick');
  await ok('POST','/api/logout',{},next.cookie);assert.equal((await call('GET','/api/me',null,next.cookie)).status,401);
  const noPresence=(await ok('POST','/api/login',credentials)).cookie;await advance(180001);
  await ok('POST','/api/login',credentials);assert.equal((await call('GET','/api/me',null,noPresence)).status,401,'login without initial ping is reclaimed');
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
