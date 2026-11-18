'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('staged rollout adopts unfinished legacy orders without breaking previously weighed documents',{timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-old-')),base=`http://127.0.0.1:${port}`;let proc,cookie='';
 async function start(flag,transport='1'){proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,HOST:'127.0.0.1',PORT:String(port),ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_PICKUP_STAGING:flag,BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:transport},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});}
 async function stop(){if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}proc=null;}
 async function call(method,url,body){const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});cookie=(r.headers.get('set-cookie')||cookie).split(';')[0];return {status:r.status,data:await r.json()};}
 async function ok(method,url,body){const r=await call(method,url,body);assert(r.status>=200&&r.status<300,`${url} ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
 try{
  await start('false');await ok('POST','/api/login',{username:'admin',password:'Initial!2345'});await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  async function create(name,phone){return (await ok('POST','/api/orders/remote',{name,phone,deliveryMode:'PICKUP',scheduledDate:day,scheduledTime:'00:00',items:[{productId:'p01',requestedQty:3,requestedUnit:'کیلوگرم'}]})).order;}
  const old=await create('سفارش قدیمی باز','09121112235'),done=await create('سفارش قدیمی وزن شده','09121112236');
  await ok('POST',`/api/orders/${old.id}/warehouse/accept`,{});await ok('POST',`/api/orders/${done.id}/warehouse/accept`,{});
  const first=(await ok('POST',`/api/orders/${done.id}/warehouse`,{items:[{itemId:done.items[0].id,deliveredKg:2}]})).order;assert(first.warehouseDocumentNo);
  await stop();cookie='';await start('true');await ok('POST','/api/login',{username:'admin',password:'Changed!2345'});
  const person={name:'راننده مشتری',phone:'09121112244',noVehicle:true};
  assert.equal((await call('POST',`/api/pickup/${done.id}/entry`,person)).status,409);
  await ok('POST',`/api/orders/${done.id}/warehouse/reopen-preparing`,{});
  const again=(await ok('POST',`/api/orders/${done.id}/warehouse`,{items:[{itemId:done.items[0].id,deliveredKg:2.5}]})).order;assert.equal(again.warehouseDocumentNo,first.warehouseDocumentNo);
  assert.equal((await call('POST',`/api/orders/${old.id}/warehouse`,{items:[{itemId:old.items[0].id,deliveredKg:3}]})).status,409);
  assert.equal((await call('POST',`/api/pickup/${old.id}/entry`,person)).status,409);
  await ok('PUT',`/api/pickup/${old.id}/delivery-date`,{deliveryDate:day});await ok('POST',`/api/pickup/${old.id}/entry`,person);
  const hand=(await ok('POST',`/api/pickup/${old.id}/handover`,{physicalHandoverConfirmed:true,items:[{itemId:old.items[0].id,deliveredKg:3}]})).handover;assert.equal(hand.document.customerName,'سفارش قدیمی باز');assert.equal(hand.document.recipient.name,person.name);
  // A rollback switch cannot hide or strand a delivery that is still in flight.
  await stop();cookie='';await start('false','0');await ok('POST','/api/login',{username:'admin',password:'Changed!2345'});assert.equal((await ok('GET','/api/me')).features.pickupStaging,true);
  assert.equal((await call('POST','/api/orders/remote',{name:'سفارش ناامن',phone:'09121112255',scheduledTime:'00:00',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]})).status,503);
  await ok('POST',`/api/orders/${old.id}/settle`,{items:[{itemId:old.items[0].id,unitPrice:100}],settlementMethods:[{type:'CASH',amount:300}]});await ok('POST',`/api/pickup/${old.id}/goods-exit`,{checkedItems:[old.items[0].id]});
  assert.equal((await ok('GET','/api/me')).features.pickupStaging,false);

 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
