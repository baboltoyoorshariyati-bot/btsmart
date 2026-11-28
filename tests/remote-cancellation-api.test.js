'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('remote cancellation serializes against delivery, preserves audit and alerts warehouse and transport',{timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-cancel-remote-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'1'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  let cookie='';const call=async(method,url,body)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});cookie=(r.headers.get('set-cookie')||'').split(';')[0]||cookie;return {status:r.status,data:await r.json()};};
  const ok=async(method,url,body)=>{const r=await call(method,url,body);assert(r.status>=200&&r.status<300,`${url} ${r.status} ${JSON.stringify(r.data)}`);return r.data;};
  await ok('POST','/api/login',{username:'admin',password:'Initial!2345'});await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const driver=(await ok('POST','/api/transport/drivers',{fullName:'راننده',phone:'09121112233'})).driver,vehicle=(await ok('POST','/api/transport/vehicles',{vehicleType:'وانت',plate:'12ب34567'})).vehicle;
  await ok('PUT',`/api/transport/drivers/${driver.id}/resources`,{vehicleId:vehicle.id,paymentDeviceId:''});
  const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const make=async()=> (await ok('POST','/api/orders/remote',{name:'مشتری',phone:'09121112234',deliveryMode:'DELIVERY',dispatchPlace:'بابل',scheduledDate:day,scheduledAt:day+'T00:00',items:[{productId:'p01',requestedQty:3,requestedUnit:'کیلوگرم'}]})).order;
  const order=await make();await ok('POST',`/api/transport/plans/${order.id}/assign`,{driverId:driver.id,vehicleId:vehicle.id});await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{});
  assert.equal((await call('POST',`/api/orders/${order.id}/cancel-remote`,{})).status,400);
  const cancelled=(await ok('POST',`/api/orders/${order.id}/cancel-remote`,{confirmedNoGoods:true,reason:'درخواست مشتری'})).order;
  assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.cancelReason,'درخواست مشتری');assert(cancelled.cancelledBy);assert.equal(cancelled.items[0].itemStatus,'CANCELLED');assert.equal(cancelled.transportAssignments['0'].driverId,driver.id);
  assert.equal((await call('POST',`/api/orders/${order.id}/warehouse`,{items:[{itemId:order.items[0].id,deliveredKg:3}]})).status,409);
  const notifs=(await ok('GET','/api/notifications')).notifications;for(const role of ['warehouse','dispatch'])assert(notifs.some(n=>n.type==='REMOTE_ORDER_CANCELLED'&&n.entityId===order.id&&n.targetRole===role));
  assert(!(await ok('GET','/api/transport/plans')).orders.some(o=>o.id===order.id));
  const race=await make();await ok('POST',`/api/orders/${race.id}/warehouse/accept`,{});
  const [a,b]=await Promise.all([call('POST',`/api/orders/${race.id}/cancel-remote`,{confirmedNoGoods:true}),call('POST',`/api/orders/${race.id}/warehouse`,{items:[{itemId:race.items[0].id,deliveredKg:3}]})]);
  assert.equal(Number(a.status===200)+Number(b.status===200),1,JSON.stringify([a,b]));assert.equal(a.status===200?b.status:a.status,409);
  const final=(await ok('GET',`/api/orders/${race.id}`)).order;assert.equal(final.status,a.status===200?'CANCELLED':'SETTLEMENT_PENDING');
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
