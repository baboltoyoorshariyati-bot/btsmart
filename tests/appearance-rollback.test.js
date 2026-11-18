'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('removed appearance editor ignores legacy designs and preserves stored data', {timeout:45000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-appearance-rollback-'));
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=`http://127.0.0.1:${port}`,dbPath=path.join(dir,'baboltoyoor.db');let proc;
 const start=async()=>{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});};
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}};
 const post=async(url,data,cookie='')=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
 try{
  await start();let r=await post('/api/login',{username:'admin',password:'Initial!2345'}),cookie=(r.headers.get('set-cookie')||'').split(';')[0];assert.equal(r.status,200);
  r=await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},cookie);assert.equal(r.status,200);await stop();
  const legacy={version:4,published:{screen:{navigation:{background:'#ff0000'}},print:{warehouseTable:{fontSize:14}},layout:{warehouseSections:['signature','head','products','total']}}};
  let db=new DatabaseSync(dbPath);db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('appearanceDesign',JSON.stringify(legacy));const usersBefore=db.prepare('SELECT COUNT(*) AS n FROM users').get().n;db.close();
  await start();r=await fetch(base+'/api/appearance');assert.equal(r.status,404);r=await fetch(base+'/appearance-runtime.js');assert.equal(r.status,404);r=await fetch(base+'/appearance-editor.js');assert.equal(r.status,404);
  const html=await (await fetch(base+'/')).text();assert.doesNotMatch(html,/appearance-runtime|appearance-editor/);
  r=await post('/api/login',{username:'admin',password:'Changed!2345'});assert.equal(r.status,200);cookie=(r.headers.get('set-cookie')||'').split(';')[0];
  r=await post('/api/admin/users',{username:'testrollback',roleCode:'sales',fullName:'آزمون',position:'فروش',password:'Changed!2345',mustChangePassword:false},cookie);assert.equal(r.status,201);
  await stop();db=new DatabaseSync(dbPath);assert.deepEqual(JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('appearanceDesign').value),legacy);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,usersBefore+1);db.close();
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
