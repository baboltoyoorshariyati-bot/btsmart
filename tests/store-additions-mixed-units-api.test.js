'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const group=require('../public/store-document-group');
test('partial additions support duplicate existing products and different requested units; measured kilograms group only on print',{timeout:90000},async()=>{
 const port=await new Promise(resolve=>{const server=net.createServer().listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-mixed-units-')),base=`http://127.0.0.1:${port}`,pass='Changed!2345';
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const res=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:(res.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const res=await call(method,url,body,cookie);assert(res.status>=200&&res.status<300,url+' '+res.status+' '+JSON.stringify(res.body));return res.body;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:pass},admin);
  for(const [username,roleCode,extra] of [['sales','sales',{}],['warehouse','warehouse',{}],['shop','store',{storeName:'فروشگاه'}]])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:pass,mustChangePassword:false,...extra},admin);
  const login=async username=>(await call('POST','/api/login',{username,password:pass})).cookie,sales=await login('sales'),wh=await login('warehouse'),shop=await login('shop');
  const driver=(await ok('POST','/api/transport/drivers',{fullName:'راننده تست',phone:'09121112233'},admin)).driver,vehicle=(await ok('POST','/api/transport/vehicles',{vehicleType:'وانت',plate:'12ب34567'},admin)).vehicle;
  await ok('PUT',`/api/transport/drivers/${driver.id}/resources`,{vehicleId:vehicle.id,paymentDeviceId:''},admin);
  const line=(productId,requestedQty,requestedUnit)=>({productId,requestedQty,requestedUnit});
  for(const purpose of ['STOCK','CUSTOMER']){
   const original=(await ok('POST','/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:purpose,...(purpose==='CUSTOMER'?{name:'تماس',phone:'09121112222'}:{}),items:[line('p01',3,'کیلوگرم'),line('p01',2,'کیلوگرم'),line('p01',5,'عدد'),line('p02',1,'بسته')]},shop)).order;
   const id=original.id,add=`/api/store/orders/${id}/addition-requests`,review=`/api/sales/store-orders/${id}/additions/review`,accept=`/api/warehouse/store-orders/${id}/additions/review`;
   await ok('POST',`/api/store/orders/${id}/quick-send`,{},sales);await ok('POST',`/api/orders/${id}/warehouse/accept`,{},wh);await ok('POST',`/api/transport/plans/${id}/assign`,{run:1,driverId:driver.id,vehicleId:vehicle.id},admin);
   await ok('POST',`/api/orders/${id}/store-run/weights`,{run:1,items:[{itemId:original.items[0].id,deliveredKg:1.5},{itemId:original.items[1].id,deliveredKg:2}]},wh);
   const newRows=[line('p01',2,'کیلوگرم'),line('p01',0.25,'کیلوگرم'),line('p01',7,'عدد'),line('p01',4,'کارتن'),line('p02',3,'عدد')];
   const req=(await ok('POST',add,{items:newRows},shop)).request;
   assert.equal((await call('POST',`/api/orders/${id}/store-run/send-run`,{run:1},wh)).status,409);
   let unmodified=(await ok('GET',`/api/orders/${id}`,null,wh)).order;assert.equal(unmodified.items.length,4);assert.equal(unmodified.items[0].requestedQty,3);
   await ok('POST',review,{requestId:req.id,decision:'APPROVE'},sales);unmodified=(await ok('GET',`/api/orders/${id}`,null,wh)).order;assert.equal(unmodified.items.length,4);
   const order=(await ok('POST',accept,{requestId:req.id,decision:'APPROVE'},wh)).order;assert.equal(order.id,id);assert.equal(order.orderNo,original.orderNo);assert.equal(order.items.length,6);
   const [first,second,byNumber,byPack]=original.items.map(old=>order.items.find(i=>i.id===old.id));
   assert.equal(first.requestedQty,5.25);assert.equal(first.runR1[0].kg,1.5);assert(!first.runCompleted);
   assert.equal(second.requestedQty,2);assert.equal(second.runR1[0].kg,2);assert(second.runCompleted);
   assert.equal(byNumber.requestedQty,12);assert.equal(byNumber.requestedUnit,'عدد');assert.equal(byPack.requestedQty,1);
   assert.equal(order.items.find(i=>i.productId==='p01'&&i.requestedUnit==='کارتن').requestedQty,4);
   assert.equal(order.items.find(i=>i.productId==='p02'&&i.requestedUnit==='عدد').requestedQty,3);
   const detail=(await ok('GET',`/api/store/orders/${id}`,null,shop)).order.storeRequestRows;
   assert.deepEqual(detail.filter(x=>x.itemId===first.id).map(x=>[x.requestedQty,x.requestedUnit]),[[3,'کیلوگرم'],[2,'کیلوگرم'],[0.25,'کیلوگرم']]);
   assert.deepEqual(detail.filter(x=>x.itemId===byNumber.id).map(x=>[x.requestedQty,x.requestedUnit]),[[5,'عدد'],[7,'عدد']]);
   assert.equal(detail.filter(x=>x.itemId===second.id).length,1);assert.equal(detail.length,9);
   const unresolved=order.items.filter(i=>!i.runCompleted);await ok('POST',`/api/orders/${id}/store-run/weights`,{run:1,items:unresolved.map(i=>({itemId:i.id,deliveredKg:2.4}))},wh);
   await ok('POST',`/api/orders/${id}/store-run/send-run`,{run:1},wh);
   const doc=(await ok('GET',`/api/warehouse/store-documents/${id}/1`,null,wh)).document;assert.equal(doc.lines.length,6);assert.equal(doc.requestRows.length,9);
   const grouped=group(doc.lines),p1=grouped.find(i=>i.productId==='p01'),p2=grouped.find(i=>i.productId==='p02');assert.equal(grouped.length,2);assert.equal(p1.deliveredKg,10.7);assert.equal(p2.deliveredKg,4.8);
   assert.equal((await call('POST',add,{items:newRows},shop)).status,409);
  }
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
