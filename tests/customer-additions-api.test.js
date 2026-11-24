'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('customer additions require warehouse decision and preserve separate weighing rows',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-customer-add-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie,status=200)=>{const r=await call(method,url,body,cookie);assert.equal(r.status,status,`${url} ${JSON.stringify(r.body)}`);return r.body;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  for(const role of ['sales','warehouse','gate'])await ok('POST','/api/admin/users',{username:role,roleCode:role,fullName:role,position:'تست',password:'Changed!2345',mustChangePassword:false},admin,201);
  const login=async username=>(await call('POST','/api/login',{username,password:'Changed!2345'})).cookie;const sales=await login('sales'),wh=await login('warehouse'),gate=await login('gate');
  const line={productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'};
  const visit=(await ok('POST','/api/visits',{name:'مشتری حضوری',phone:'09121112233',noVehicle:true},gate,201)).visit;
  const onsite=(await ok('POST','/api/orders',{visitId:visit.id,deliveryMode:'PICKUP',items:[line]},sales,201)).order;
  const remote=(await ok('POST','/api/orders/remote',{name:'مشتری تلفنی',phone:'09121112234',scheduledTime:'00:00',items:[line]},sales,201)).order;
  for(const order of [onsite,remote]){
   const url=`/api/sales/customer-orders/${order.id}/additions`,review=`/api/warehouse/customer-orders/${order.id}/additions/review`,final=`/api/orders/${order.id}/warehouse`;
   assert.equal((await call('POST',url,{items:[line]},wh)).status,403);
   const req=(await ok('POST',url,{items:[line]},sales,201)).request;
   assert.equal((await call('POST',url,{items:[line]},sales)).status,409);
   assert.equal((await call('POST',review,{requestId:req.id,decision:'APPROVE'},sales)).status,403);
   assert((await ok('GET','/api/notifications',null,wh)).notifications.some(n=>n.type==='CUSTOMER_ADDITION_REQUESTED'&&n.entityId===order.id));
   await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{},wh);
   assert.equal((await call('POST',final,{items:[{itemId:order.items[0].id,deliveredKg:2}]},wh)).status,409);
   const draft=(await ok('POST',`/api/orders/${order.id}/warehouse/draft`,{revision:0,items:[{itemId:order.items[0].id,deliveredKg:2}]},wh)).draft;
   assert.equal(draft.revision,1);
   const result=await ok('POST',review,{requestId:req.id,decision:'APPROVE'},wh);assert.equal(result.order.items.length,2);assert.notEqual(result.order.items[0].id,result.order.items[1].id);
   assert.equal(result.order.warehouseWeightDraft.revision,2);assert.equal(result.order.warehouseWeightDraft.items[0].deliveredKg,2);
   assert.equal((await call('POST',review,{requestId:req.id,decision:'APPROVE'},wh)).status,409);
   assert.equal((await call('POST',final,{draftRevision:1,items:result.order.items.map(i=>({itemId:i.id,deliveredKg:2}))},wh)).status,409);
   const document=(await ok('POST',final,{draftRevision:2,items:result.order.items.map((i,k)=>({itemId:i.id,deliveredKg:k?3:2}))},wh)).order;
   assert.equal(document.items.length,2);assert.deepEqual(document.items.map(x=>x.deliveredKg),[2,3]);
   assert.equal((await call('POST',url,{items:[line]},sales)).status,409);
   assert((await ok('GET','/api/notifications',null,sales)).notifications.some(n=>n.type==='CUSTOMER_ADDITION_RESULT'&&n.entityId===order.id));
  }
  const race=(await ok('POST','/api/orders/remote',{name:'رقابت',phone:'09121112236',scheduledTime:'00:00',items:[line]},sales,201)).order;
  await ok('POST',`/api/orders/${race.id}/warehouse/accept`,{},wh);
  const [a,b]=await Promise.all([call('POST',`/api/sales/customer-orders/${race.id}/additions`,{items:[line]},sales),call('POST',`/api/orders/${race.id}/warehouse`,{items:[{itemId:race.items[0].id,deliveredKg:1}]},wh)]);
  assert.equal(Number(a.status===201)+Number(b.status===200),1,JSON.stringify([a,b]));assert.equal(a.status===201?b.status:a.status,409);
  const product=(await ok('POST','/api/admin/products',{quickCode:'99',name:'قلم بررسی‌شده',defaultUnit:'کیلوگرم'},admin,201)).product;
  const change=(await ok('POST','/api/orders/remote',{name:'تغییر نام',phone:'09121112237',scheduledTime:'00:00',items:[line]},sales,201)).order;
  const changeReq=(await ok('POST',`/api/sales/customer-orders/${change.id}/additions`,{items:[{...line,productId:product.id}]},sales,201)).request;
  assert.equal((await call('DELETE',`/api/admin/products/${product.id}`,{},admin)).status,409);
  await ok('PUT',`/api/admin/products/${product.id}`,{name:'نام تغییر یافته'},admin);
  assert.equal((await call('POST',`/api/warehouse/customer-orders/${change.id}/additions/review`,{requestId:changeReq.id,decision:'APPROVE'},wh)).status,409);
  assert.equal((await ok('GET',`/api/orders/${change.id}`,null,wh)).order.items.length,1);
  await ok('POST',`/api/warehouse/customer-orders/${change.id}/additions/review`,{requestId:changeReq.id,decision:'REJECT'},wh);
  const r=(await ok('POST','/api/orders/remote',{name:'رد درخواست',phone:'09121112235',scheduledTime:'00:00',items:[line]},sales,201)).order;
  const url=`/api/sales/customer-orders/${r.id}/additions`,review=`/api/warehouse/customer-orders/${r.id}/additions/review`;
  const req=(await ok('POST',url,{items:[line]},sales,201)).request;
  const rejected=await ok('POST',review,{requestId:req.id,decision:'REJECT'},wh);assert.equal(rejected.order.items.length,1);assert.equal(rejected.request.status,'REJECTED_WAREHOUSE');
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});

test('staged pickup cannot hand over or cancel while an addition is pending',{timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-customer-add-pickup-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_PICKUP_STAGING:'true',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'1'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie,status=200)=>{const r=await call(method,url,body,cookie);assert.equal(r.status,status,`${url} ${JSON.stringify(r.body)}`);return r.body;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),line={productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'};
  const o=(await ok('POST','/api/orders/remote',{name:'مشتری',phone:'09121112233',deliveryMode:'PICKUP',deliveryDate:day,scheduledTime:'00:00',items:[line]},admin,201)).order;
  await ok('POST',`/api/orders/${o.id}/warehouse/accept`,{},admin);await ok('POST',`/api/pickup/${o.id}/entry`,{name:'مشتری',phone:'09121112233',noVehicle:true},admin,201);
  const req=(await ok('POST',`/api/sales/customer-orders/${o.id}/additions`,{items:[line]},admin,201)).request;
  const final=`/api/pickup/${o.id}/handover`,payload={physicalHandoverConfirmed:true,items:[{itemId:o.items[0].id,deliveredKg:1}]};
  assert.equal((await call('POST',final,payload,admin)).status,409);
  assert.equal((await call('POST',`/api/pickup/${o.id}/cancellation`,{reason:'انصراف',confirmedNoGoods:true},admin)).status,409);
  await ok('POST',`/api/warehouse/customer-orders/${o.id}/additions/review`,{requestId:req.id,decision:'REJECT'},admin);
  const handed=await ok('POST',final,payload,admin);assert.equal(handed.handover.document.items.length,1);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
