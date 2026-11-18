'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('بیعانه: اعتبارسنجی، تفکیک از پخش، کسر در تسویه، استرداد دستی و ماندگاری', {timeout:50000},async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-deposit-')),base=`http://127.0.0.1:${port}`;let proc,cookie;
 const start=async()=>{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});};
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}};
 const req=async(method,url,body)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const c=r.headers.get('set-cookie')?.match(/sid=([^;]+)/);if(c)cookie=`sid=${c[1]}`;return {status:r.status,json:await r.json()};};
 try{
  await start();assert.equal((await req('POST','/api/login',{username:'admin',password:'Initial!2345'})).status,200);await req('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const baseOrder={name:'مشتری بیعانه',phone:'09121112233',dispatchPlace:'بابل',scheduledDate:day(2),scheduledAt:`${day(2)}T08:00`,deliveryDate:day(4),items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]};
  const device=await req('POST','/api/admin/payment-devices',{title:'پوز تست',terminalNumber:'123456',bank:'بانک نمونه',model:'PAX'});assert.equal(device.status,201,JSON.stringify(device.json));
  for(const deposit of [{type:'CREDIT',amount:100},{type:'CHECK',amount:100},{type:'CASH',amount:0},{type:'CASH',amount:1.1},{type:'CASH',amount:1e13},{type:'POS',amount:100,deviceId:'bad'},{type:'CARD_TRANSFER',amount:100,bank:'الف'},{type:'CARD_TRANSFER',amount:100,reference:'123'}]){
   const bad=await req('POST','/api/orders/remote',{...baseOrder,deposit});assert.equal(bad.status,400,JSON.stringify(bad.json));
  }
  let r=await req('POST','/api/orders/remote',{...baseOrder,deposit:{type:'POS',amount:'۲۰۰٬۰۰۰',deviceId:device.json.device.id,reference:'R-123'}});assert.equal(r.status,201,JSON.stringify(r.json));const scheduled=r.json.order;assert.equal(scheduled.deposit.amount,200000);assert.equal(scheduled.deposit.deviceSnapshot.terminalNumber,'123456');assert.equal(scheduled.deposit.reference,'R-123');assert.equal(scheduled.status,'SCHEDULED_REMOTE');assert.equal(scheduled.scheduledAt,baseOrder.scheduledAt);
  r=await req('PUT',`/api/orders/${scheduled.id}/remote`,{notes:'حفظ بیعانه'});assert.equal(r.status,200);assert.equal(r.json.order.deposit.amount,200000);
  r=await req('PUT',`/api/orders/${scheduled.id}/remote`,{deposit:null});assert.equal(r.status,400);
  r=await req('POST',`/api/orders/${scheduled.id}/cancel-remote`,{reason:'انصراف'});assert.equal(r.status,200);assert.equal(r.json.order.deposit.status,'REFUND_REQUIRED');
  r=await req('GET','/api/deposit-refunds');assert(r.json.orders.some(x=>x.id===scheduled.id));
  r=await req('POST',`/api/orders/${scheduled.id}/deposit-refund`,{});assert.equal(r.status,400);
  await stop();await start();cookie=null;await req('POST','/api/login',{username:'admin',password:'Changed!2345'});r=await req('GET','/api/deposit-refunds');assert(r.json.orders.some(x=>x.id===scheduled.id&&x.deposit.status==='REFUND_REQUIRED'));
  r=await req('POST',`/api/orders/${scheduled.id}/deposit-refund`,{reference:'پیگیری بازگشت 456'});assert.equal(r.status,200);assert.equal(r.json.order.deposit.refundReference,'پیگیری بازگشت 456');assert.equal(r.json.order.deposit.status,'REFUNDED');assert.equal((await req('POST',`/api/orders/${scheduled.id}/deposit-refund`,{reference:'دوباره'})).status,409);r=await req('GET','/api/deposit-refunds');assert(!r.json.orders.some(x=>x.id===scheduled.id));
  const makeDue=async amount=>{const made=await req('POST','/api/orders/remote',{...baseOrder,scheduledDate:day(0),scheduledAt:`${day(0)}T00:00`,deposit:{type:'CARD_TRANSFER',amount,bank:'بانک مقصد',reference:'ref-999'}});assert.equal(made.status,201,JSON.stringify(made.json));const o=made.json.order;
   assert.equal((await req('POST',`/api/orders/${o.id}/warehouse/accept`,{})).status,200);assert.equal((await req('POST',`/api/orders/${o.id}/warehouse/start-preparing`,{})).status,200);assert.equal((await req('POST',`/api/orders/${o.id}/warehouse`,{items:[{itemId:o.items[0].id,deliveredKg:2}]})).status,200);return o;};
  const partial=await makeDue(500);r=await req('POST',`/api/orders/${partial.id}/send-dispatch`,{items:[{itemId:partial.items[0].id,unitPrice:1000}],driverId:'driver'});assert.equal(r.status,409);assert.match(r.json.error||r.json.message,/بیعانه/);
  const settlement={signatureData:`data:image/png;base64,${'A'.repeat(300)}`,noFingerprintAllowed:true,items:[{itemId:partial.items[0].id,unitPrice:1000}]};
  assert.equal((await req('POST',`/api/orders/${partial.id}/settle`,settlement)).status,400);
  assert.equal((await req('POST',`/api/orders/${partial.id}/settle`,{...settlement,settlementMethods:[{type:'CASH',amount:2000}]})).status,400);
  r=await req('POST',`/api/orders/${partial.id}/settle`,{...settlement,settlementMethods:[{type:'CASH',amount:1500}]});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.order.payment.totalAmount,2000);assert.equal(r.json.order.payment.depositAmount,500);assert.equal(r.json.order.payment.amountDue,1500);assert.equal(r.json.order.payment.deposit.reference,'ref-999');assert.equal(r.json.order.payment.settlementMethods[0].amount,1500);
  const equal=await makeDue(2000);r=await req('POST',`/api/orders/${equal.id}/settle`,{...settlement,items:[{itemId:equal.items[0].id,unitPrice:1000}],settlementMethods:[]});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.order.payment.amountDue,0);
  const excess=await makeDue(3000);r=await req('POST',`/api/orders/${excess.id}/settle`,{...settlement,items:[{itemId:excess.items[0].id,unitPrice:1000}],settlementMethods:[]});assert.equal(r.status,400);assert.match(r.json.error||r.json.message,/بیعانه/);assert.equal((await req('GET',`/api/orders/${excess.id}`)).json.order.status,'SETTLEMENT_PENDING');
  const refundUrl=`/api/orders/${excess.id}/deposit-partial-refund`;
  assert.equal((await req('POST',refundUrl,{amount:1000,reference:'بازپرداخت'})).status,409);
  assert.equal((await req('POST',refundUrl,{amount:4000,reference:'بازپرداخت',expectedRefundedAmount:0})).status,400);
  assert.equal((await req('POST',refundUrl,{amount:1000,expectedRefundedAmount:0})).status,400);
  r=await req('POST',refundUrl,{amount:1000,reference:'رسید ۲۲',expectedRefundedAmount:0});assert.equal(r.status,200);assert.equal(r.json.order.deposit.refundedAmount,1000);assert.equal(r.json.order.deposit.refunds[0].reference,'رسید ۲۲');
  assert.equal((await req('POST',refundUrl,{amount:1000,reference:'بازپرداخت تکراری',expectedRefundedAmount:0})).status,409);
  assert.equal((await req('POST',`/api/orders/${excess.id}/send-dispatch`,{driverId:'driver'})).status,409);
  r=await req('POST',`/api/orders/${excess.id}/settle`,{...settlement,items:[{itemId:excess.items[0].id,unitPrice:1000}],settlementMethods:[]});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.order.payment.depositAmount,2000);assert.equal(r.json.order.payment.amountDue,0);assert.equal(r.json.order.payment.deposit.refundedAmount,1000);
  const old=await req('POST','/api/orders/remote',baseOrder);assert.equal(old.status,201);assert.equal(old.json.order.deposit,null);
  await stop();await start();cookie=null;await req('POST','/api/login',{username:'admin',password:'Changed!2345'});r=await req('GET',`/api/orders/${partial.id}`);assert.equal(r.json.order.payment.depositAmount,500);assert.equal(r.json.order.payment.amountDue,1500);r=await req('GET',`/api/orders/${scheduled.id}`);assert.equal(r.json.order.deposit.status,'REFUNDED');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
