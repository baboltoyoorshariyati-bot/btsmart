'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{once}=require('node:events'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('ورود قدیمی فقط برای مأموریت باز و بسته‌شدن نشست پس از پایان آن',{timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-retire-')),base=`http://127.0.0.1:${port}`,pass='Changed!2345';let proc;
 const start=async legacy=>{const env={...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'};delete env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW;if(legacy)env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});};
 const stop=async()=>{if(proc&&proc.exitCode===null){const done=once(proc,'exit');proc.kill('SIGTERM');await done;}};
 const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
 const ok=async(...args)=>{const r=await call(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r;};
 try{
  await start(true);
  let admin=(await ok('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:pass},admin);
  const driver=(await ok('POST','/api/drivers',{fullName:'راننده قدیمی',phone:'09121112233',vehicleType:'وانت',plate:'12ب34567'},admin)).data.driver;
  const user=(await ok('POST','/api/admin/users',{username:'legacy-driver',fullName:'راننده',position:'راننده',roleCode:'driver',driverId:driver.id,password:pass,mustChangePassword:false},admin)).data.user;
  await ok('POST','/api/admin/users',{username:'legacy-sales',fullName:'فروش',position:'فروش',roleCode:'sales',password:pass,mustChangePassword:false},admin);
  const sales=(await ok('POST','/api/login',{username:'legacy-sales',password:pass})).cookie;
  const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const order=(await ok('POST','/api/orders/remote',{name:'مشتری قدیمی',phone:'09121112234',dispatchPlace:'بابل',scheduledDate:date,scheduledTime:'00:00',items:[{productId:'p01',requestedQty:3,requestedUnit:'کیلوگرم'}]},sales)).data.order;
  await stop();
  // Fixture represents a pre-upgrade assigned shipment; no production data is changed.
  const {DatabaseSync}=require('node:sqlite');let db=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  db.prepare("UPDATE orders SET payload=json_set(payload,'$.dispatch',json(?)) WHERE id=?").run(JSON.stringify({driverId:driver.id,status:'ASSIGNED'}),order.id);db.close();
  await start(false);
  admin=(await ok('POST','/api/login',{username:'admin',password:pass})).cookie;
  assert.equal((await call('POST','/api/admin/users',{username:'newdriver',fullName:'راننده',position:'راننده',roleCode:'driver',driverId:driver.id,password:pass},admin)).status,409);
  assert.equal((await call('DELETE',`/api/admin/users/${user.id}`,{},admin)).status,409);
  const old=(await ok('POST','/api/login',{username:'legacy-driver',password:pass})).cookie;
  assert.equal((await call('GET','/api/me',null,old)).status,200);
  db=new DatabaseSync(path.join(dir,'baboltoyoor.db'));db.prepare("UPDATE orders SET payload=json_set(payload,'$.dispatch.status','DELIVERED') WHERE id=?").run(order.id);db.close();
  assert.equal((await call('GET','/api/me',null,old)).status,403);
  assert.equal((await call('POST','/api/login',{username:'legacy-driver',password:pass})).status,403);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
