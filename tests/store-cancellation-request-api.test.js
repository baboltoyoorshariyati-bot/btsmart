'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('store cancellation request is owned, deduplicated and reviewed without changing fulfillment', {timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-onsite-cancel-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  async function call(method,url,body,cookie=''){const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
  async function ok(method,url,body,cookie){const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,`${method} ${url}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  for(const role of ['sales','store'])await ok('POST','/api/admin/users',{username:'new-'+role,roleCode:role,fullName:role,position:'تست',password:'Changed!2345',mustChangePassword:false,...(role==='store'?{storeName:'فروشگاه آزمایش'}:{})},admin);
  await ok('POST','/api/admin/users',{username:'other-store',roleCode:'store',fullName:'دیگر',position:'تست',password:'Changed!2345',mustChangePassword:false,storeName:'فروشگاه دیگر'},admin);
  const sales=(await call('POST','/api/login',{username:'new-sales',password:'Changed!2345'})).cookie;
  const shop=(await call('POST','/api/login',{username:'new-store',password:'Changed!2345'})).cookie;
  const other=(await call('POST','/api/login',{username:'other-store',password:'Changed!2345'})).cookie;
  const order=(await ok('POST','/api/store/orders',{name:'مشتری',phone:'09121112211',items:[{productId:'p01',requestedQty:5,requestedUnit:'کیلوگرم'}]},shop)).order;
  const url=`/api/store/orders/${order.id}/cancellation-request`;
  assert.equal((await call('POST',url,{reason:'انصراف'},other)).status,404);
  assert.equal((await call('POST',url,{reason:'انصراف'},shop)).status,409);
  await ok('POST',`/api/store/orders/${order.id}/quick-send`,{},sales);
  const before=(await ok('GET',`/api/store/orders/${order.id}`,null,shop)).order;
  const results=await Promise.all([call('POST',url,{reason:'انصراف'},shop),call('POST',url,{reason:'انصراف'},shop)]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  const pending=(await ok('GET',`/api/store/orders/${order.id}`,null,shop)).order,req=pending.storeCancellationRequests[0];
  assert.equal(pending.status,before.status);assert.deepEqual(pending.items,before.items);
  assert((await ok('GET','/api/notifications',null,sales)).notifications.some(n=>n.entityId===order.id&&n.navSection==='stores'));
  const review=`/api/sales/store-cancellation-requests/${order.id}/review`;
  assert.equal((await call('POST',review,{requestId:req.id,resolution:'بررسی شد'},shop)).status,403);
  await ok('POST',review,{requestId:req.id,resolution:'بررسی شد؛ هماهنگی دستی لازم است'},sales);
  assert.equal((await call('POST',review,{requestId:req.id,resolution:'دوباره'},sales)).status,409);
  const after=(await ok('GET',`/api/store/orders/${order.id}`,null,shop)).order;
  assert.equal(after.status,before.status);assert.equal(after.storeCancellationRequests[0].status,'REVIEWED');assert.deepEqual(after.items,before.items);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
