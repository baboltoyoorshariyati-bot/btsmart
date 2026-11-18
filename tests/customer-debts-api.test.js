'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('حساب معوق مشتری: سفارش جدید، دریافت انتخابی، چک، دسترسی و پایداری', {timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-debts-')),base=`http://127.0.0.1:${port}`;let proc,cookie,gate;
 const start=async()=>{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('server exit '+c));});});};
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}};
 const req=async(method,url,body,opts={})=>{const r=await fetch(base+url,{method,headers:{...((opts.cookie||cookie)?{Cookie:opts.cookie||cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(opts.key?{'Idempotency-Key':opts.key}:{})},body:body?JSON.stringify(body):undefined});const c=r.headers.get('set-cookie')?.match(/sid=([^;]+)/);if(c&&!opts.cookie)cookie=`sid=${c[1]}`;return {status:r.status,json:await r.json(),headers:r.headers};};
 try{
  await start();assert.equal((await req('POST','/api/login',{username:'admin',password:'Initial!2345'})).status,200);assert.equal((await req('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'})).status,200);
  assert.equal((await req('POST','/api/admin/users',{username:'gate1',fullName:'گیت',position:'گیت',roleCode:'gate',password:'Gate!12345',mustChangePassword:false})).status,201);
  const lg=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'gate1',password:'Gate!12345'})});assert.equal(lg.status,200);gate=lg.headers.get('set-cookie').match(/sid=[^;]+/)[0];
  const now=new Date(),day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const make=async()=>{let r=await req('POST','/api/orders/remote',{name:'مشتری بدهکار',phone:'09121112233',dispatchPlace:'بابل',scheduledDate:day,scheduledAt:day+'T00:00',deliveryDate:day,items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]});assert.equal(r.status,201,JSON.stringify(r.json));const o=r.json.order;assert.equal(o.debtTrackingEnabled,true);
   for(const [suffix,body] of [['warehouse/accept',{}],['warehouse/start-preparing',{}],['warehouse',{items:[{itemId:o.items[0].id,deliveredKg:2}]}]])assert.equal((await req('POST',`/api/orders/${o.id}/${suffix}`,body)).status,200);
   r=await req('POST',`/api/orders/${o.id}/settle`,{items:[{itemId:o.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:500},{type:'CREDIT',amount:1500}]});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.order.payment.debtAccount.initial,1500);return r.json.order;
  };
  const first=await make(),second=await make(),cid=first.customerId;assert.equal(second.customerId,cid);

  // Same phone really links a store order to the same customer. A run of more
  // than 30 store orders must not consume the customer history cap.
  assert.equal((await req('POST','/api/admin/users',{username:'store1',fullName:'فروشگاه',position:'فروشگاه',roleCode:'store',storeName:'فروشگاه شعبه 1 حمزه کلا',password:'Shop!12345',mustChangePassword:false})).status,201);
  const shopLogin=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'store1',password:'Shop!12345'})});assert.equal(shopLogin.status,200);const shop=shopLogin.headers.get('set-cookie').match(/sid=[^;]+/)[0];
  const shopIds=[];for(let i=0;i<31;i++){const so=await req('POST','/api/store/orders',{name:'مشتری بدهکار',phone:'09121112233',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]},{cookie:shop,key:`shop-create-${i}`});assert.equal(so.status,201,JSON.stringify(so.json));assert.equal(so.json.order.customerId,cid);assert.match(so.json.order.orderNo,/^B41/);shopIds.push(so.json.order.id);}
  let profile=await req('GET',`/api/customers/${cid}`);assert.equal(profile.status,200);assert.equal(profile.json.customer.orderCount,2);assert.equal(profile.json.customer.lastActivityAt,second.createdAt);assert.deepEqual(profile.json.orders.map(o=>o.id),[second.id,first.id]);
  const customerList=await req('GET','/api/customers?q=09121112233');const row=customerList.json.customers.find(c=>c.id===cid);assert.equal(row.orderCount,2);assert.equal(row.debtBalance,3000);assert.equal(row.lastActivityAt,second.createdAt);
  const shopList=await req('GET','/api/store/orders',undefined,{cookie:shop});assert.equal(shopList.status,200);assert.equal(shopList.json.total,31);assert(shopIds.every(id=>shopList.json.orders.some(o=>o.id===id)));
  const url=`/api/customers/${cid}/debts`,p=first.payment.id,baseReceipt=`${url}/${p}/receipts`;
  let r=await req('GET',url);assert.equal(r.status,200);assert.equal(r.json.balance,3000);assert.equal(r.json.invoices.length,2);assert.equal((await req('GET',url,undefined,{cookie:gate})).status,403);
  assert.equal((await req('POST',baseReceipt,{type:'CASH',amount:100})).status,400); // idempotency key mandatory
  assert.equal((await req('POST',baseReceipt,{type:'CREDIT',amount:100},{key:'receive-01'})).status,400);
  assert.equal((await req('POST',baseReceipt,{type:'CASH',amount:1600},{key:'receive-02'})).status,409);
  const cash={type:'CASH',amount:400,operationId:'cash-operation-01'};r=await req('POST',baseReceipt,cash,{key:'receive-03'});assert.equal(r.status,201,JSON.stringify(r.json));assert.equal(r.json.balance,2600);const cashId=r.json.receipt.id;
  r=await req('POST',baseReceipt,cash,{key:'receive-03'});assert.equal(r.status,201);assert.equal(r.headers.get('idempotent-replayed'),'true');
  assert.equal((await req('POST',baseReceipt,{...cash,amount:300},{key:'receive-03'})).status,409);
  r=await req('POST',baseReceipt,cash,{key:'retry-key-01'});assert.equal(r.status,201);assert.equal(r.json.balance,2600);assert.equal(r.json.invoices.find(x=>x.paymentId===p).receipts.length,1);
  assert.equal((await req('POST',baseReceipt,{...cash,amount:300},{key:'retry-key-02'})).status,409);
  r=await req('POST',baseReceipt,{type:'CHECK',amount:600,bank:'بانک',checkNumber:'123',dueDate:'2026-11-25'},{key:'receive-04'});assert.equal(r.status,201,JSON.stringify(r.json));const check=r.json.receipt.id;assert.equal(r.json.balance,2600);assert.equal(r.json.pending,600);
  assert.equal((await req('POST',baseReceipt,{type:'CASH',amount:501},{key:'receive-05'})).status,409);
  assert.equal((await req('POST',`${baseReceipt}/${check}/resolve`,{status:'CLEARED'},{key:'resolve-01'})).status,200);
  r=await req('GET',url);assert.equal(r.json.balance,2000);assert.equal(r.json.pending,0);
  assert.equal((await req('POST',`${baseReceipt}/${check}/resolve`,{status:'RETURNED'},{key:'resolve-02'})).status,409);
  r=await req('POST',baseReceipt,{type:'CHECK',amount:500,bank:'بانک',checkNumber:'456',dueDate:'2026-12-25'},{key:'receive-06'});assert.equal(r.status,201);const returned=r.json.receipt.id;
  assert.equal((await req('POST',`${baseReceipt}/${returned}/resolve`,{status:'RETURNED'},{key:'resolve-03'})).status,200);
  r=await req('POST',baseReceipt,{type:'CARD_TRANSFER',amount:500,bank:'بانک',reference:'ABC'},{key:'receive-07'});assert.equal(r.status,201);assert.equal(r.json.balance,1500);assert.equal(r.json.invoices.find(x=>x.paymentId===p).balance,0);assert.equal(r.json.invoices.find(x=>x.paymentId===second.payment.id).balance,1500);
  assert.equal((await req('POST','/api/admin/users',{username:'sales1',fullName:'فروش',position:'فروش',roleCode:'sales',password:'Sales!12345',mustChangePassword:false})).status,201);
  const salesLogin=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'sales1',password:'Sales!12345'})});assert.equal(salesLogin.status,200);const sales=salesLogin.headers.get('set-cookie').match(/sid=[^;]+/)[0];
  assert.equal((await req('POST',`${baseReceipt}/${cashId}/resolve`,{status:'REVERSED'},{key:'reverse-sales',cookie:sales})).status,403);
  assert.equal((await req('POST',`${baseReceipt}/${cashId}/resolve`,{status:'REVERSED'},{key:'reverse-01'})).status,200);
  r=await req('GET',url);assert.equal(r.json.balance,1900);assert.equal(r.json.invoices.find(x=>x.paymentId===p).balance,400);
  r=await req('POST',baseReceipt,{type:'CASH',amount:400},{key:'receive-09'});assert.equal(r.status,201);assert.equal(r.json.balance,1500);
  const other=await req('POST','/api/customers',{name:'دیگری',phone:'09120000001'});assert.equal(other.status,201);assert.equal((await req('POST',`/api/customers/${other.json.customer.id}/debts/${p}/receipts`,{type:'CASH',amount:1},{key:'receive-08'})).status,404);
  await stop();await start();cookie=null;assert.equal((await req('POST','/api/login',{username:'admin',password:'Changed!2345'})).status,200);r=await req('GET',url);assert.equal(r.json.balance,1500);assert.equal(r.json.invoices.find(x=>x.paymentId===p).receipts.length,5);profile=await req('GET',`/api/customers/${cid}`);assert.equal(profile.json.customer.orderCount,2);assert.deepEqual(profile.json.orders.map(o=>o.id),[second.id,first.id]);
  r=await req('GET',`/api/orders/${first.id}`);assert.equal(r.json.order.payment.debtAccount.receipts.filter(x=>x.status==='CLEARED').length,3);assert.equal(r.json.order.payment.debtAccount.receipts[0].reference,undefined);
  const third=await make(),thirdUrl=`/api/customers/${cid}/debts/${third.payment.id}/receipts`;
  const concurrent=await Promise.all([req('POST',thirdUrl,{type:'CASH',amount:1000},{key:'race-0001'}),req('POST',thirdUrl,{type:'CASH',amount:1000},{key:'race-0002'})]);assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);
  r=await req('GET',url);assert.equal(r.json.invoices.find(x=>x.paymentId===third.payment.id).balance,500);
  const device=await req('POST','/api/admin/payment-devices',{title:'پوز',terminalNumber:'555',bank:'بانک',model:'PAX'});assert.equal(device.status,201);
  r=await req('POST',thirdUrl,{type:'POS',amount:500,deviceId:device.json.device.id,reference:'P-1'},{key:'receipt-pos'});assert.equal(r.status,201);assert.equal(r.json.receipt.deviceSnapshot.terminalNumber,'555');assert.equal(r.json.receipt.operationKey,undefined);
  r=await req('POST','/api/admin/backups',{});assert.equal(r.status,201,JSON.stringify(r.json));const backup=r.json.name;
  r=await req('POST',`${url}/${second.payment.id}/receipts`,{type:'CASH',amount:300},{key:'backup-test'});assert.equal(r.status,201);assert.equal(r.json.balance,1200);
  r=await req('POST',`/api/admin/backups/${backup}/restore`,{confirm:'RESTORE',password:'Changed!2345'});assert.equal(r.status,200,JSON.stringify(r.json));cookie=null;
  assert.equal((await req('POST','/api/login',{username:'admin',password:'Changed!2345'})).status,200);r=await req('GET',url);assert.equal(r.json.balance,1500);assert.equal(r.json.invoices.find(x=>x.paymentId===third.payment.id).balance,0);


 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('سفارش قدیمی و اطلاعات نامعتبر خودکار وارد حساب نمی‌شوند',()=>{const debt=require('../lib/customer-debts');const db={customers:[{id:'c'}],visits:[]};const methods=[{type:'CREDIT',amount:100}];assert.equal(debt.newAccount(db,{customerId:'c'},methods),null);assert.equal(debt.newAccount(db,{customerId:'c',debtTrackingEnabled:true},methods).initial,100);assert.throws(()=>debt.newAccount(db,{customerId:'missing',debtTrackingEnabled:true},methods));assert.throws(()=>debt.amounts({initial:100,receipts:[{type:'CASH',amount:101,status:'CLEARED'}]}));assert.throws(()=>debt.amounts({initial:100,receipts:[{type:'CASH',amount:50,status:'PENDING'}]}));});
