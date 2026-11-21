'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('staged pickup API: roles, recipient, physical delivery, cancellation and legacy guards',{timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-api-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_PICKUP_STAGING:'true'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  async function call(method,url,body,cookie=''){const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
  async function ok(method,url,body,cookie){const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,`${method} ${url}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  for(const role of ['gate','warehouse','sales'])await ok('POST','/api/admin/users',{username:'pickup-'+role,roleCode:role,fullName:role,position:'تست',password:'Changed!2345',mustChangePassword:false},admin);
  const cookies={};for(const role of ['gate','warehouse','sales'])cookies[role]=(await call('POST','/api/login',{username:'pickup-'+role,password:'Changed!2345'})).cookie;
  const {gate,warehouse:wh,sales}=cookies;const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const create=async(phone,deposit)=> (await ok('POST','/api/orders/remote',{name:'مالک سفارش',phone,deliveryMode:'PICKUP',scheduledTime:'00:00',deliveryDate:day,items:[{productId:'p01',requestedQty:5,requestedUnit:'کیلوگرم'}],...(deposit?{deposit:{type:'CASH',amount:100}}:{})},sales)).order;
  const order=await create('09121112233',false),other=await create('09121112234',true),race=await create('09121112235',false);
  await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{},wh);
  assert.equal((await call('POST',`/api/orders/${order.id}/warehouse`,{items:[{itemId:order.items[0].id,deliveredKg:5}]},wh)).status,409,'new managed order cannot be finalized before entry');
  const person={name:'راننده مشتری',phone:'09121112244',vehicleType:'خودرو',carType:'تریلی یخچال',plate:'12ب34567'};
  // A separate process uses the new entry service while HTTP uses the old
  // cancellation endpoint. Only one may commit, regardless of lock order.
  const workerCode=`const s=require('./lib/store'),p=require('./lib/pickup-transaction-service');s.sql.init();s.reloadFromSql({skipRepair:true});process.send({ready:true});process.on('message',m=>{try{p.entry(m.id,m.person,{user:{id:'gate',roleCode:'gate'}});process.send({ok:true});}catch(e){process.send({ok:false,status:e.status});}process.disconnect();});`;
  const worker=spawn(process.execPath,['-e',workerCode],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir},stdio:['ignore','pipe','pipe','ipc']});
  try{
   await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('exit',code=>reject(Error('pickup worker exited '+code)));});
   const newEntry=new Promise(resolve=>worker.once('message',resolve));worker.send({id:race.id,person});
   const [legacyResult,newResult]=await Promise.all([call('POST',`/api/orders/${race.id}/cancel-remote`,{reason:'انصراف'},sales),newEntry]);
   assert.equal(Number(legacyResult.status===200)+Number(newResult.ok),1,JSON.stringify({legacyResult,newResult}));
   assert.equal(legacyResult.status===200?newResult.status:legacyResult.status,409);
  }finally{if(worker.exitCode===null)worker.kill();}
  assert.equal((await call('GET','/api/pickup/orders?q=مالک',null,wh)).status,403);
  const found=(await ok('GET','/api/pickup/orders?q=مالک',null,gate)).orders;assert(found.some(x=>x.id===order.id));assert(!JSON.stringify(found).includes('deposit'));assert(!JSON.stringify(found).includes('payment'));const searched=found.find(x=>x.id===order.id);assert.equal(searched.items.length,1);assert.equal(searched.items[0].requestedQty,5);assert.equal(searched.items[0].requestedUnit,'کیلوگرم');assert(searched.items[0].productName);assert(!JSON.stringify(searched).includes('unitPrice'));assert(!JSON.stringify(searched).includes('finalAmount'));
  assert.equal((await call('PUT',`/api/pickup/${order.id}/delivery-date`,{deliveryDate:day},gate)).status,403);
  const tomorrow=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1),next=[tomorrow.getFullYear(),String(tomorrow.getMonth()+1).padStart(2,'0'),String(tomorrow.getDate()).padStart(2,'0')].join('-');
  await ok('PUT',`/api/pickup/${order.id}/delivery-date`,{deliveryDate:next},sales);assert.equal((await ok('GET',`/api/orders/${order.id}`,null,sales)).order.scheduledAt,order.scheduledAt);
  assert.equal((await call('POST',`/api/pickup/${order.id}/entry`,person,gate)).status,409,'gate entry is forbidden outside delivery date');
  await ok('PUT',`/api/pickup/${order.id}/delivery-date`,{deliveryDate:day},sales);
  const entryResponse=await ok('POST',`/api/pickup/${order.id}/entry`,person,gate);assert(!JSON.stringify(entryResponse).includes('deposit'));const entered=entryResponse.visit;assert.equal(entered.recipient.name,person.name);assert.notEqual(entered.status,'WAITING_SALES');
  assert.equal((await call('POST',`/api/pickup/${order.id}/entry`,person,gate)).status,409);
  assert.equal((await call('PUT',`/api/pickup/${order.id}/delivery-date`,{deliveryDate:day},sales)).status,409);
  assert.equal((await call('POST',`/api/orders/${order.id}/warehouse`,{items:[{itemId:order.items[0].id,deliveredKg:5}]},wh)).status,409);
  const result=await ok('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,items:[{itemId:order.items[0].id,deliveredKg:5}]},wh);
  assert.equal(result.handover.document.customerName,'مالک سفارش');assert.equal(result.handover.document.recipient.name,person.name);
  const active=(await ok('GET','/api/pickup/active',null,gate)).orders;assert(active.some(x=>x.id===order.id));assert(!JSON.stringify(active).includes('deposit'));
  const doc=(await ok('GET',`/api/warehouse/delivered/${order.id}`,null,wh)).order;assert.equal(doc.recipient.name,person.name);assert.equal(doc.customerName,'مالک سفارش');
  await ok('PUT',`/api/customers/${order.customerId}`,{name:'نام ویرایش‌شده'},sales);
  const archived=(await ok('GET',`/api/warehouse/delivered/${order.id}`,null,wh)).order;assert.equal(archived.customerName,'مالک سفارش');assert.equal(archived.recipient.name,person.name);assert.equal(archived.warehouseDocumentNo,doc.warehouseDocumentNo);
  assert.equal((await call('POST',`/api/pickup/${order.id}/cancellation`,{reason:'انصراف',confirmedNoGoods:true},wh)).status,409);
  await ok('POST',`/api/orders/${order.id}/settle`,{items:[{itemId:order.items[0].id,unitPrice:100}]},sales);
  assert.equal((await call('POST',`/api/orders/${order.id}/exit`,{checkedItems:[order.items[0].id]},gate)).status,409);
  assert.equal((await call('POST',`/api/pickup/${order.id}/goods-exit`,{checkedItems:[]},gate)).status,400);
  await ok('POST',`/api/pickup/${order.id}/goods-exit`,{checkedItems:[order.items[0].id]},gate);
  assert.equal((await ok('GET',`/api/orders/${order.id}`,null,sales)).order.status,'EXITED');
  const owner={recipientIsBuyer:true,name:'مالک سفارش',phone:'09121112234',noVehicle:true};
  assert.equal((await call('POST',`/api/pickup/${other.id}/entry`,{...owner,name:'نام نادرست'},gate)).status,409);
  await ok('PUT',`/api/customers/${other.customerId}`,{name:'مالک تازه'},sales);
  assert.equal((await call('POST',`/api/pickup/${other.id}/entry`,owner,gate)).status,409,'stale buyer data must be refreshed');owner.name='مالک تازه';
  const secondEntry=await ok('POST',`/api/pickup/${other.id}/entry`,owner,gate);assert(!JSON.stringify(secondEntry).includes('deposit'));assert.equal(secondEntry.visit.recipient.name,owner.name);assert.equal(secondEntry.visit.recipient.phone,owner.phone);
  assert.equal((await ok('GET',`/api/orders/${other.id}`,null,sales)).order.customerId,other.customerId);
  assert.equal((await call('POST',`/api/pickup/${other.id}/cancellation-approval`,{},sales)).status,409);
  const cancellation=await ok('POST',`/api/pickup/${other.id}/cancellation`,{reason:'انصراف',confirmedNoGoods:true},wh);assert(!JSON.stringify(cancellation).includes('deposit'));
  assert.equal((await call('POST',`/api/orders/${other.id}/warehouse/accept`,{},wh)).status,409);
  assert.equal((await call('POST',`/api/pickup/${other.id}/cancellation-exit`,{},gate)).status,409);
  await ok('POST',`/api/pickup/${other.id}/cancellation-approval`,{},sales);await ok('POST',`/api/pickup/${other.id}/cancellation-exit`,{},gate);
  const final=(await ok('GET',`/api/orders/${other.id}`,null,sales)).order;assert.equal(final.status,'CANCELLED');assert.equal(final.deposit.status,'REFUND_REQUIRED');assert.equal(final.visit.exitReason,'CANCELLATION');
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
