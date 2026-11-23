'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('store contacts are order-only, reusable, isolated from customer profiles, and survive restart',{timeout:90000},async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-store-contact-')),base=`http://127.0.0.1:${port}`;let proc;
 const start=async()=>{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});};
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}};
 const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
 const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
 try{
  await start();let admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;
  await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  await ok('POST','/api/admin/users',{username:'shop',roleCode:'store',fullName:'فروشگاه',position:'تست',storeName:'تست',password:'Changed!2345',mustChangePassword:false},admin);
  let shop=(await call('POST','/api/login',{username:'shop',password:'Changed!2345'})).cookie;
  const profile=(await ok('POST','/api/customers',{name:'پرونده عادی',phone:'09121112233'},admin)).customer;
  const before=(await ok('GET','/api/customers',null,admin)).customers;
  const items=[{productId:'p01',requestedQty:2,requestedUnit:'کیلوگرم'}];
  const payload={storeOrderKind:'PARTIAL',storePurpose:'CUSTOMER',name:'تماس اول',phone:'09121112233',items};
  const first=(await ok('POST','/api/store/orders',{...payload,customerId:profile.id},shop)).order;
  const second=(await ok('POST','/api/store/orders',{...payload,name:'تماس دوم'},shop)).order;
  const third=(await ok('POST','/api/store/orders',{...payload,name:'شماره تازه',phone:'09121117777'},shop)).order;
  assert.notEqual(first.id,second.id);assert.notEqual(first.orderNo,second.orderNo);
  assert.equal(first.customerId,null);assert.equal(second.customerId,null);assert.deepEqual(first.customer,{name:'تماس اول',phone:'09121112233'});
  assert.equal((await ok('GET','/api/customers',null,admin)).customers.length,before.length);
  assert.equal((await ok('GET','/api/customers?q=09121117777',null,admin)).customers.length,0);
  const profileAfter=(await ok('GET',`/api/customers/${profile.id}`,null,admin)).customer;
  assert.equal(profileAfter.name,'پرونده عادی');assert.equal(profileAfter.phone,'09121112233');assert.equal(profileAfter.lastVisitAt,profile.lastVisitAt);
  const edited=(await ok('PUT',`/api/store/orders/${second.id}`,{...payload,name:'تماس اصلاحی',phone:'09121117777'},shop)).order;
  assert.equal(edited.customerId,null);assert.deepEqual(edited.customer,{name:'تماس اصلاحی',phone:'09121117777'});
  assert.equal((await ok('GET',`/api/store/orders/${first.id}`,null,shop)).order.customer.name,'تماس اول');
  const history=await ok('GET','/api/sales/history?q='+encodeURIComponent('09121117777'),null,admin);
  assert(history.orders.some(o=>o.id===second.id));assert(history.orders.some(o=>o.id===third.id));
  const adminHistory=await ok('GET',`/api/admin/orders/${second.id}/history`,null,admin);assert.match(JSON.stringify(adminHistory),/تماس اصلاحی/);assert.match(JSON.stringify(adminHistory),/09121117777/);
  assert.equal((await call('POST','/api/store/orders',{...payload,phone:'bad'},shop)).status,400);
  const {phone:ignored,...withoutPhone}=payload;
  const noPhone=(await ok('POST','/api/store/orders',{...withoutPhone,name:'بدون شماره'},shop)).order;
  assert.deepEqual(noPhone.customer,{name:'بدون شماره',phone:''});assert.equal(noPhone.customerId,null);
  const cleared=(await ok('PUT',`/api/store/orders/${second.id}`,{...payload,phone:''},shop)).order;assert.equal(cleared.customer.phone,'');
  assert.equal((await call('PUT',`/api/store/orders/${noPhone.id}`,{...withoutPhone,phone:'bad'},shop)).status,400);
  assert.equal((await call('POST','/api/store/orders',{...withoutPhone,name:''},shop)).status,400);
  assert.equal((await call('POST','/api/store/orders',{name:'کلی',items},shop)).status,400,'legacy bulk contact phone remains required');
  await stop();
  // Construct a historical customer-linked store order and verify no automatic migration/deletion.
  const {DatabaseSync}=require('node:sqlite'),sql=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  try{sql.prepare("UPDATE orders SET customer_id=?,payload=json_set(json_remove(payload,'$.customerName','$.customerPhone'),'$.customerId',?) WHERE id=?").run(profile.id,profile.id,third.id);}finally{sql.close();}
  await start();admin=(await call('POST','/api/login',{username:'admin',password:'Changed!2345'})).cookie;shop=(await call('POST','/api/login',{username:'shop',password:'Changed!2345'})).cookie;
  const old=(await ok('GET',`/api/store/orders/${third.id}`,null,shop)).order;assert.equal(old.customerId,profile.id);assert.equal(old.customer.name,'پرونده عادی');
  const editOld=(await ok('PUT',`/api/store/orders/${third.id}`,{...payload,name:'تماس مستقل قدیمی',phone:''},shop)).order;assert.equal(editOld.customerId,profile.id);assert.equal(editOld.customer.name,'تماس مستقل قدیمی');assert.equal(editOld.customer.phone,'');
  assert.equal((await ok('GET',`/api/customers/${profile.id}`,null,admin)).customer.name,'پرونده عادی');
  const dossier=await ok('GET',`/api/admin/orders/${third.id}/history`,null,admin);assert.match(JSON.stringify(dossier),/تماس مستقل قدیمی/);
  const staleSearch=await ok('GET','/api/sales/history?q='+encodeURIComponent('پرونده عادی'),null,admin);assert(!staleSearch.orders.some(o=>o.id===third.id));
  const stock=(await ok('PUT',`/api/store/orders/${third.id}`,{storePurpose:'STOCK',items},shop)).order;assert.equal(stock.customerId,profile.id);assert.equal(stock.customer,null);
  assert.equal((await ok('GET',`/api/customers/${profile.id}`,null,admin)).customer.name,'پرونده عادی');
  assert.equal((await ok('GET',`/api/store/orders/${first.id}`,null,shop)).order.customer.name,'تماس اول');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
