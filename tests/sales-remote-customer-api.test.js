'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('سفارش غیرحضوری به پرونده موجود متصل می‌شود و شماره یا شناسه متعارض رد می‌شود',{timeout:45000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-remote-customer-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  let cookie='';const call=async(method,url,body)=>{const res=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,data:await res.json()};};
  assert.equal((await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).status,200);await call('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const a=(await call('POST','/api/customers',{name:'مشتری الف',phone:'09121112233'})).data.customer,b=(await call('POST','/api/customers',{name:'مشتری ب',phone:'09121112234'})).data.customer;
  const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),body={name:a.name,phone:'۰۹۱۲۱۱۱۲۲۳۳',deliveryMode:'PICKUP',deliveryDate:day,scheduledDate:day,scheduledTime:'08:00',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]};
  const byPhone=await call('POST','/api/orders/remote',body);assert.equal(byPhone.status,201,JSON.stringify(byPhone.data));assert.equal(byPhone.data.order.customerId,a.id);assert.equal(byPhone.data.order.dispatchPlace,'');
  const byCode=await call('POST','/api/orders/remote',{...body,customerCode:a.code});assert.equal(byCode.status,201);assert.equal(byCode.data.order.customerId,a.id);
  assert.equal((await call('POST','/api/orders/remote',{...body,name:'نام متفاوت'})).status,409);
  assert.equal((await call('POST','/api/orders/remote',{...body,customerId:a.id,phone:b.phone})).status,409);
  assert.equal((await call('POST','/api/orders/remote',{...body,customerId:'unknown'})).status,400);
  assert.equal((await call('POST','/api/orders/remote',{...body,customerCode:'99999'})).status,400);
  assert.equal((await call('POST','/api/orders/remote',{...body,customerId:a.id,customerCode:b.code})).status,409);
  const editUrl='/api/orders/'+byPhone.data.order.id+'/remote';
  const edited=await call('PUT',editUrl,{items:[{productId:'p01',requestedQty:7,requestedUnit:'بسته',description:'اصلاح فروش'}],notes:'بدون دخالت انبار'});assert.equal(edited.status,200,JSON.stringify(edited.data));assert.equal(edited.data.order.items[0].requestedQty,7);assert.equal(edited.data.order.items[0].requestedUnit,'بسته');
  assert.equal((await call('PUT',editUrl,{items:[]})).status,400);assert.equal((await call('GET','/api/orders/'+byPhone.data.order.id)).data.order.items[0].requestedQty,7);
  const now=await call('POST','/api/orders/remote',{...body,scheduledDate:new Date().toISOString().slice(0,10),scheduledTime:'00:00'});assert.equal(now.status,201);const currentUrl='/api/orders/'+now.data.order.id;assert.equal((await call('PUT',currentUrl+'/remote',{items:[{productId:'p01',requestedQty:3,requestedUnit:'عدد'}]})).status,200);
  assert.equal((await call('POST',currentUrl+'/warehouse/accept',{})).status,200);
  assert.equal((await call('PUT',currentUrl+'/remote',{items:[{productId:'p01',requestedQty:9,requestedUnit:'عدد'}]})).status,409);
  const all=await call('GET','/api/customers?q='+encodeURIComponent(a.phone));assert.equal(all.data.customers.length,1);assert.equal(all.data.customers[0].id,a.id);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
