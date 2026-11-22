'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('settlement cancellation preserves warehouse data and requires return confirmation', {timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-onsite-cancel-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  async function call(method,url,body,cookie=''){const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
  async function ok(method,url,body,cookie){const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,`${method} ${url}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  for(const role of ['gate','warehouse','sales'])await ok('POST','/api/admin/users',{username:'cancel-'+role,roleCode:role,fullName:role,position:'تست',password:'Changed!2345',mustChangePassword:false},admin);
  const cookies={};for(const role of ['gate','warehouse','sales'])cookies[role]=(await call('POST','/api/login',{username:'cancel-'+role,password:'Changed!2345'})).cookie;
  const {gate,warehouse:wh,sales}=cookies;
  const visit=async n=>(await ok('POST','/api/visits',{name:'مشتری تست',phone:'091211122'+String(n).padStart(2,'0'),noVehicle:true},gate)).visit;
  const order=async v=>(await ok('POST','/api/orders',{visitId:v.id,items:[{productId:'p01',requestedQty:5,requestedUnit:'کیلوگرم'}]},sales)).order;
  const cancel=v=>`/api/visits/${v.id}/cancel-onsite`, exit=v=>`/api/visits/${v.id}/cancelled-exit`, payload={reason:'انصراف مشتری',confirmedNoGoods:true};
  const v=await visit(1),o=await order(v);
  await ok('POST',`/api/orders/${o.id}/warehouse/accept`,{},wh);
  await ok('POST',`/api/orders/${o.id}/warehouse/start-preparing`,{},wh);
  await ok('POST',`/api/orders/${o.id}/warehouse`,{items:[{itemId:o.items[0].id,deliveredKg:5}]},wh);
  const before=(await ok('GET',`/api/orders/${o.id}`,null,sales)).order;
  const req=`/api/orders/${o.id}/settlement-cancellation`,confirm=`/api/warehouse/settlement-cancellations/${o.id}/confirm`;
  assert.equal((await call('POST',req,{reason:'انصراف'},wh)).status,403);
  await ok('POST',req,{reason:'انصراف'},sales);
  assert.equal((await call('POST',req,{reason:'انصراف'},sales)).status,409);
  assert.equal((await call('POST',`/api/orders/${o.id}/settle`,{items:[{itemId:o.items[0].id,unitPrice:100}]},sales)).status,409);
  assert((await ok('GET','/api/warehouse/settlement-cancellations',null,wh)).orders.some(x=>x.id===o.id));
  assert.equal((await call('POST',confirm,{returnedItems:[],confirmedNoGoods:true},wh)).status,400);
  await ok('POST',confirm,{returnedItems:[o.items[0].id],confirmedNoGoods:true},wh);
  const after=(await ok('GET',`/api/orders/${o.id}`,null,sales)).order;
  assert.equal(after.status,'CANCELLED');assert.equal(after.warehouseDocumentNo,before.warehouseDocumentNo);assert.equal(after.items[0].deliveredKg,5);
  await ok('POST',exit(v),{confirmedNoGoods:true},gate);
  const v2=await visit(2),o2=await order(v2);
  await ok('POST',`/api/orders/${o2.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o2.id}/warehouse/start-preparing`,{},wh);
  await ok('POST',`/api/orders/${o2.id}/warehouse`,{physicalHandoverConfirmed:true,items:[{itemId:o2.items[0].id,deliveredKg:5}]},wh);
  const before2=(await ok('GET',`/api/orders/${o2.id}`,null,sales)).order;
  const [cancelResult,settleResult]=await Promise.all([
    call('POST',`/api/orders/${o2.id}/settlement-cancellation`,{reason:'انصراف'},sales),
    call('POST',`/api/orders/${o2.id}/settle`,{items:[{itemId:o2.items[0].id,unitPrice:100}],settlementMethods:[{type:'CASH',amount:500}]},sales)
  ]);
  assert.equal(Number(cancelResult.status===200)+Number(settleResult.status===200),1,JSON.stringify([cancelResult,settleResult]));
  assert.equal(cancelResult.status===200?settleResult.status:cancelResult.status,409);
  if(cancelResult.status===200){
    const target=`/api/warehouse/settlement-cancellations/${o2.id}/confirm`,body={returnedItems:[o2.items[0].id],confirmedNoGoods:true};
    const results=await Promise.all([call('POST',target,body,wh),call('POST',target,body,wh)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const after2=(await ok('GET',`/api/orders/${o2.id}`,null,sales)).order;
    assert.deepEqual(after2.warehouseHandover,before2.warehouseHandover);
  }
  const v3=await visit(3),o3=await order(v3);
  await ok('POST',`/api/orders/${o3.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o3.id}/warehouse/start-preparing`,{},wh);
  await ok('POST',`/api/orders/${o3.id}/warehouse`,{items:[{itemId:o3.items[0].id,deliveredKg:5}]},wh);
  const [cancel3,reopen]=await Promise.all([call('POST',`/api/orders/${o3.id}/settlement-cancellation`,{reason:'انصراف'},sales),call('POST',`/api/orders/${o3.id}/warehouse/reopen-preparing`,{reason:'بازبینی'},sales)]);
  assert.equal(Number(cancel3.status===200)+Number(reopen.status===200),1,JSON.stringify([cancel3,reopen]));

 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
