'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('تاریخ تحویل مستقل از زمان انبار ثبت و ویرایش شده و پس از راه‌اندازی مجدد SQLite باقی می‌ماند', {timeout:40000}, async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-delivery-')),base=`http://127.0.0.1:${port}`;let proc,cookie;
 const start=async()=>{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dataDir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});};
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}};
 const request=async(method,url,body)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const c=r.headers.get('set-cookie')?.match(/sid=([^;]+)/);if(c)cookie=`sid=${c[1]}`;return {status:r.status,json:await r.json()};};
 try{
  await start();assert.equal((await request('POST','/api/login',{username:'admin',password:'Initial!2345'})).status,200);
  assert.equal((await request('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'})).status,200);
  const dateOffset=days=>{const d=new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const future=dateOffset(5),today=dateOffset(0),baseOrder={name:'تاریخ تحویل',phone:'09129991234',dispatchPlace:'بابل',scheduledDate:future,scheduledAt:`${future}T08:45`,items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]};
  for(const deliveryDate of ['2025-02-29','2026-04-31','bad',{},'2028-01-01T08:00']){
   const bad=await request('POST','/api/orders/remote',{...baseOrder,deliveryDate});assert.equal(bad.status,400,JSON.stringify(bad.json));
  }
  let r=await request('POST','/api/orders/remote',{...baseOrder,deliveryDate:'۲۰۲۸-۰۲-۲۹'});assert.equal(r.status,201,JSON.stringify(r.json));let order=r.json.order;
  assert.equal(order.deliveryDate,'2028-02-29');assert.equal(order.scheduledAt,`${future}T08:45`);assert.equal(order.status,'SCHEDULED_REMOTE');
  let bad=await request('PUT',`/api/orders/${order.id}/remote`,{deliveryDate:'2028-02-30'});assert.equal(bad.status,400);
  r=await request('PUT',`/api/orders/${order.id}/remote`,{notes:'به‌روزرسانی قدیمی'});assert.equal(r.status,200);assert.equal(r.json.order.deliveryDate,'2028-02-29');
  r=await request('PUT',`/api/orders/${order.id}/remote`,{deliveryDate:'2028-03-01'});assert.equal(r.status,200);assert.equal(r.json.order.deliveryDate,'2028-03-01');assert.equal(r.json.order.scheduledAt,`${future}T08:45`);
  const old=await request('POST','/api/orders/remote',baseOrder);assert.equal(old.status,201);assert.equal(old.json.order.deliveryDate,null);
  const oldEdit=await request('PUT',`/api/orders/${old.json.order.id}/remote`,{notes:'بدون تاریخ'});assert.equal(oldEdit.status,200);assert.equal(oldEdit.json.order.deliveryDate,null);
  const due=await request('POST','/api/orders/remote',{...baseOrder,scheduledDate:today,scheduledAt:`${today}T00:00`,deliveryDate:'2028-03-02'});assert.equal(due.status,201);assert.equal(due.json.order.status,'WAREHOUSE_PENDING');
  let warehouse=await request('GET','/api/orders?status=WAREHOUSE_PENDING');assert(warehouse.json.orders.some(o=>o.id===due.json.order.id&&o.deliveryDate==='2028-03-02'));
  await stop();await start();cookie=null;assert.equal((await request('POST','/api/login',{username:'admin',password:'Changed!2345'})).status,200);
  r=await request('GET',`/api/orders/${order.id}`);assert.equal(r.status,200);assert.equal(r.json.order.deliveryDate,'2028-03-01');assert.equal(r.json.order.scheduledAt,`${future}T08:45`);
  warehouse=await request('GET','/api/orders?status=WAREHOUSE_PENDING');assert(warehouse.json.orders.some(o=>o.id===due.json.order.id&&o.deliveryDate==='2028-03-02'));
 }finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true});}
});
