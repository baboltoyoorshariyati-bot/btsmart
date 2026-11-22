'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('settlement pickup return preserves physical handover and deposit',{timeout:60000},async()=>{
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
  const order=await create('09121112233',true);
  await ok('POST',`/api/pickup/${order.id}/entry`,{recipientIsBuyer:true,name:'مالک سفارش',phone:'09121112233',noVehicle:true},gate);
  await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{},wh);
  await ok('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,items:[{itemId:order.items[0].id,deliveredKg:5}]},wh);
  const before=(await ok('GET',`/api/orders/${order.id}`,null,sales)).order;
  await ok('POST',`/api/orders/${order.id}/settlement-cancellation`,{reason:'انصراف'},sales);
  const response=await ok('POST',`/api/warehouse/settlement-cancellations/${order.id}/confirm`,{returnedItems:[order.items[0].id],confirmedNoGoods:true},wh);assert(!JSON.stringify(response).includes('deposit'));
  const cancelled=(await ok('GET',`/api/orders/${order.id}`,null,sales)).order;
  assert.equal(cancelled.deposit.status,'REFUND_REQUIRED');assert.deepEqual(cancelled.pickupHandover,before.pickupHandover);
  assert((await ok('GET','/api/deposit-refunds',null,sales)).orders.some(x=>x.id===order.id));
  assert.equal((await call('POST',`/api/pickup/${order.id}/cancellation-exit`,{},gate)).status,400);
  await ok('POST',`/api/pickup/${order.id}/cancellation-exit`,{confirmedNoGoods:true},gate);
  assert.equal((await ok('GET',`/api/orders/${order.id}`,null,sales)).order.visit.exitReason,'CANCELLATION');
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
