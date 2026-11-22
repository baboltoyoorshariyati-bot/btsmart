'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('ویرایش روش تحویل: محدودیت‌ها، صف‌ها و حفظ سوابق',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-edit-mode-')),base=`http://127.0.0.1:${port}`,pass='Changed!2345';
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,`${method} ${url}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:pass},admin);
  const cookies={};for(const role of ['sales','gate','dispatch','warehouse']){await ok('POST','/api/admin/users',{username:'mode-'+role,roleCode:role,fullName:role,position:'آزمون',password:pass,mustChangePassword:false},admin);cookies[role]=(await call('POST','/api/login',{username:'mode-'+role,password:pass})).cookie;}
  const {sales,gate,dispatch,warehouse}=cookies,fmt=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),now=new Date(),day=fmt(now),future=fmt(new Date(now.getFullYear(),now.getMonth(),now.getDate()+3));
  let seq=0;const create=async(overrides={})=>(await ok('POST','/api/orders/remote',{name:'مشتری '+(++seq),phone:'0912666'+String(seq).padStart(4,'0'),scheduledDate:day,scheduledTime:'00:00',deliveryDate:day,deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}],...overrides},sales)).order;
  const change=(id,body,cookie=sales)=>call('PUT',`/api/orders/${id}/remote`,body,cookie);
  const scheduled=await create({scheduledDate:future,deliveryDate:future,scheduledTime:'10:00'});assert.equal(scheduled.status,'SCHEDULED_REMOTE');
  assert.equal((await change(scheduled.id,{deliveryMode:'NO'})).status,400);
  assert.equal((await change(scheduled.id,{deliveryMode:'DELIVERY'})).status,400,'a switch to delivery needs an address');
  const toDelivery=await change(scheduled.id,{deliveryMode:'DELIVERY',expectedDeliveryMode:'PICKUP',dispatchPlace:'بابل'});assert.equal(toDelivery.status,200,JSON.stringify(toDelivery.data));assert.equal(toDelivery.data.order.transportWorkflow,1);assert.equal(toDelivery.data.order.pickupWorkflow,null);assert.equal(toDelivery.data.order.deliveryMode,'DELIVERY');assert.equal(toDelivery.data.order.dispatchPlace,'بابل');
  assert.equal((await change(scheduled.id,{deliveryMode:'PICKUP',expectedDeliveryMode:'PICKUP',deliveryDate:future})).status,409,'stale editor');
  assert.equal((await change(scheduled.id,{deliveryMode:'PICKUP',deliveryDate:''})).status,400);
  const toPickup=await change(scheduled.id,{deliveryMode:'PICKUP',expectedDeliveryMode:'DELIVERY',deliveryDate:future});assert.equal(toPickup.status,200);assert.equal(toPickup.data.order.pickupWorkflow,1);assert.equal(toPickup.data.order.dispatchPlace,'');
  const audit=await ok('GET','/api/admin/audit?action=UPDATE_REMOTE_ORDER&entityId='+scheduled.id,null,admin);assert(audit.audit.some(a=>a.details.before.deliveryMode==='DELIVERY'&&a.details.after.deliveryMode==='PICKUP'));assert(audit.audit.some(a=>a.details.before.deliveryMode==='PICKUP'&&a.details.after.deliveryMode==='DELIVERY'));
  const pending=await create({deliveryMode:'DELIVERY',dispatchPlace:'مرکز'});assert.equal(pending.status,'WAREHOUSE_PENDING');
  const inPlans=async id=>(await ok('GET','/api/transport/plans',null,dispatch)).orders.some(o=>o.id===id);
  assert(await inPlans(pending.id));assert.equal((await change(pending.id,{deliveryMode:'PICKUP',deliveryDate:day})).status,200);assert(!(await inPlans(pending.id)));
  assert((await ok('GET','/api/pickup/orders?q='+encodeURIComponent(pending.orderNo),null,gate)).orders.some(o=>o.id===pending.id));
  assert.equal((await change(pending.id,{deliveryMode:'DELIVERY',dispatchPlace:'بابل'})).status,200);assert(await inPlans(pending.id));
  const notices=(await ok('GET','/api/notifications',null,warehouse)).notifications;assert(notices.some(n=>n.entityId===pending.id&&n.type==='ORDER_DELIVERY_MODE_CHANGED'));
  assert.equal((await change(pending.id,{deliveryMode:'PICKUP',deliveryDate:day},gate)).status,403);
  const driver=(await ok('POST','/api/transport/drivers',{fullName:'راننده',phone:'09121112233'},dispatch)).driver,vehicle=(await ok('POST','/api/transport/vehicles',{vehicleType:'وانت',plate:'12ب34567'},dispatch)).vehicle;
  await ok('PUT',`/api/transport/drivers/${driver.id}/resources`,{vehicleId:vehicle.id,paymentDeviceId:''},dispatch);await ok('POST',`/api/transport/plans/${pending.id}/assign`,{driverId:driver.id,vehicleId:vehicle.id},dispatch);
  assert.equal((await change(pending.id,{deliveryMode:'PICKUP',deliveryDate:day,notes:'نباید ذخیره شود'})).status,409);const assigned=(await ok('GET',`/api/orders/${pending.id}`,null,sales)).order;assert.equal(assigned.deliveryMode,'DELIVERY');assert.equal(assigned.transportAssignments['0'].driverId,driver.id);assert.notEqual(assigned.notes,'نباید ذخیره شود');
  // The assignment and mode switch serialize: exactly one succeeds.
  const race=await create({deliveryMode:'DELIVERY',dispatchPlace:'مرکز'});
  const [switched,allocated]=await Promise.all([change(race.id,{deliveryMode:'PICKUP',deliveryDate:day}),call('POST',`/api/transport/plans/${race.id}/assign`,{driverId:driver.id,vehicleId:vehicle.id},dispatch)]);
  assert.equal(Number(switched.status===200)+Number(allocated.status===200),1,JSON.stringify({switched,allocated}));assert([switched.status,allocated.status].includes(409));
  const raceOrder=(await ok('GET',`/api/orders/${race.id}`,null,sales)).order;assert.equal(raceOrder.deliveryMode==='DELIVERY',!!raceOrder.transportAssignments?.['0']);
  // Both directions reach their actual downstream workflow with no stale route.
  const pickupFlow=await create({deliveryMode:'DELIVERY',dispatchPlace:'بابل'});await ok('PUT',`/api/orders/${pickupFlow.id}/remote`,{deliveryMode:'PICKUP',deliveryDate:day},sales);
  await ok('POST',`/api/pickup/${pickupFlow.id}/entry`,{name:'تحویل گیرنده',phone:'09121112345',noVehicle:true},gate);await ok('POST',`/api/orders/${pickupFlow.id}/warehouse/accept`,{},warehouse);await ok('POST',`/api/orders/${pickupFlow.id}/warehouse/start-preparing`,{},warehouse);
  const picked=await ok('POST',`/api/pickup/${pickupFlow.id}/handover`,{physicalHandoverConfirmed:true,items:[{itemId:pickupFlow.items[0].id,deliveredKg:1}]},warehouse);assert.equal(picked.handover.document.recipient.name,'تحویل گیرنده');
  const deliveryFlow=await create();await ok('PUT',`/api/orders/${deliveryFlow.id}/remote`,{deliveryMode:'DELIVERY',dispatchPlace:'بابل'},sales);
  await ok('POST',`/api/transport/plans/${deliveryFlow.id}/assign`,{driverId:driver.id,vehicleId:vehicle.id},dispatch);await ok('POST',`/api/orders/${deliveryFlow.id}/warehouse/accept`,{},warehouse);await ok('POST',`/api/orders/${deliveryFlow.id}/warehouse`,{items:[{itemId:deliveryFlow.items[0].id,deliveredKg:1}]},warehouse);
  const doc=(await ok('GET',`/api/warehouse/delivered/${deliveryFlow.id}`,null,warehouse)).order;assert.equal(doc.driverName,'راننده');const handed=await ok('POST',`/api/warehouse/transport-handovers/${deliveryFlow.id}`,{physicalHandoverConfirmed:true,handoverToken:doc.handoverToken},warehouse);assert.equal(handed.handover.physicalHandoverConfirmed,true);
  const visit=await create();await ok('POST',`/api/pickup/${visit.id}/entry`,{name:'نماینده',phone:'09121112255',noVehicle:true},gate);assert.equal((await change(visit.id,{deliveryMode:'DELIVERY',dispatchPlace:'بابل'})).status,409);
  const deposit=await create({deposit:{amount:100,type:'CASH'}});assert.equal((await change(deposit.id,{deliveryMode:'DELIVERY',dispatchPlace:'بابل'})).status,409);assert.equal((await ok('GET',`/api/orders/${deposit.id}`,null,sales)).order.deposit.amount,100);
  const accepted=await create();await ok('POST',`/api/orders/${accepted.id}/warehouse/accept`,{},warehouse);assert.equal((await change(accepted.id,{deliveryMode:'DELIVERY',dispatchPlace:'بابل'})).status,409);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});

test('سفارش قدیمی یا گردش غیرفعال خودکار به گردش جدید منتقل نمی‌شود',{timeout:45000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-edit-legacy-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0',BT_PICKUP_STAGING:'false'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  let cookie='';const call=async(method,url,body)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
  await call('POST','/api/login',{username:'admin',password:'Initial!2345'});await call('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const made=await call('POST','/api/orders/remote',{name:'مشتری قدیمی',phone:'09121112233',scheduledTime:'00:00',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]});assert.equal(made.status,201,JSON.stringify(made.data));const id=made.data.order.id;
  assert.equal((await call('PUT',`/api/orders/${id}/remote`,{deliveryMode:'PICKUP'})).status,409);
  const edit=await call('PUT',`/api/orders/${id}/remote`,{notes:'ویرایش قدیمی'});assert.equal(edit.status,200,JSON.stringify(edit.data));assert.equal(edit.data.order.notes,'ویرایش قدیمی');assert.equal(edit.data.order.transportWorkflow,undefined);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
