'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('creator snapshots and legacy fallback are correct for onsite, remote and store orders',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-order-creator-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,url+' '+r.status+' '+JSON.stringify(r.data));return r.data;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  let salesId;for(const [username,roleCode,fullName,extra] of [['sales','sales','کارشناس فروش',{}],['warehouse','warehouse','کاربر انبار',{}],['gate','gate','نگهبان',{}],['shop','store','ثبت‌کننده فروشگاه',{storeName:'فروشگاه'}]]){const u=(await ok('POST','/api/admin/users',{username,roleCode,fullName,position:'تست',password:'Changed!2345',mustChangePassword:false,...extra},admin)).user;if(username==='sales')salesId=u.id;}
  const login=async username=>(await call('POST','/api/login',{username,password:'Changed!2345'})).cookie;
  const sales=await login('sales'),wh=await login('warehouse'),gate=await login('gate'),shop=await login('shop'),line={productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'};
  const visit=(await ok('POST','/api/visits',{name:'مشتری حضوری',phone:'09121112233',noVehicle:true},gate)).visit;
  const onsite=(await ok('POST','/api/orders',{visitId:visit.id,items:[line]},sales)).order;
  const remote=(await ok('POST','/api/orders/remote',{name:'مشتری تلفنی',phone:'09121112234',scheduledTime:'00:00',items:[line]},sales)).order;
  const store=(await ok('POST','/api/store/orders',{items:[line]},shop)).order;
  for(const o of [onsite,remote])for(const cookie of [sales,wh])assert.equal((await ok('GET','/api/orders/'+o.id,null,cookie)).order.createdByName,'کارشناس فروش');
  await ok('POST','/api/store/orders/'+store.id+'/quick-send',{},sales);
  for(const cookie of [sales,wh])assert.equal((await ok('GET','/api/orders/'+store.id,null,cookie)).order.createdByName,'ثبت‌کننده فروشگاه');
  await ok('PUT','/api/admin/users/'+salesId,{fullName:'نام جدید حساب'},admin);
  assert.equal((await ok('GET','/api/orders/'+onsite.id,null,wh)).order.createdByName,'کارشناس فروش');
  assert.equal((await ok('GET','/api/admin/orders/'+onsite.id+'/history',null,admin)).order.createdBy.name,'کارشناس فروش');
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  db.prepare("UPDATE orders SET payload=json_remove(payload,'$.createdByName') WHERE id=?").run(onsite.id);
  db.prepare("UPDATE orders SET payload=json_set(json_remove(payload,'$.createdByName'),'$.createdBy','deleted-user') WHERE id=?").run(remote.id);db.close();
  assert.equal((await ok('GET','/api/orders/'+onsite.id,null,wh)).order.createdByName,'نام جدید حساب');
  assert.equal((await ok('GET','/api/orders/'+remote.id,null,wh)).order.createdByName,'sales');
  const rows=(await ok('GET','/api/orders',null,wh)).orders;assert.equal(rows.find(x=>x.id===onsite.id).createdByName,'نام جدید حساب');assert.equal(rows.find(x=>x.id===remote.id).createdByName,'sales');
  assert(!JSON.stringify(rows).includes('passwordHash'));
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
