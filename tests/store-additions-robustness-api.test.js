'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const SR=require('../lib/store-runs');
test('partial non-weight units are never compared to kilograms for completion or shortage',()=>{
 const o={orderType:'STORE',storeOrderKind:'PARTIAL'},piece={id:'i',requestedQty:5,requestedUnit:'عدد',runR1:[{kg:9}],shortageClosed:{note:'کسری'}};
 assert.equal(SR.buildStoreRunView(o,[piece]).items[0].shortageKg,null);
 const kg={...piece,id:'j',requestedQty:12,requestedUnit:'کیلوگرم'};assert.equal(SR.buildStoreRunView(o,[kg]).items[0].shortageKg,3);
 const unresolved={...piece};delete unresolved.shortageClosed;assert.equal(SR.itemBlocksClose(o,unresolved),true);
 const sent={...unresolved,sentRun1:{at:'today'}};assert.equal(SR.itemBlocksClose(o,sent),true);
 assert.equal(SR.itemBlocksClose(o,{...sent,runCompleted:{}}),false);
});
test('pending products cannot disappear; deactivation is caught on review and send/request races stay atomic',{timeout:90000},async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-addition-robust-')),base=`http://127.0.0.1:${port}`,pass='Changed!2345';
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...((body||method==='DELETE')?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):(method==='DELETE'?'{}':undefined)});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,url+' '+r.status+' '+JSON.stringify(r.body));return r.body;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:pass},admin);
  for(const [username,roleCode,extra] of [['sales','sales',{}],['warehouse','warehouse',{}],['shop','store',{storeName:'فروشگاه'}]])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:pass,mustChangePassword:false,...extra},admin);
  const login=async username=>(await call('POST','/api/login',{username,password:pass})).cookie,sales=await login('sales'),wh=await login('warehouse'),shop=await login('shop');
  const line=id=>({productId:id,requestedQty:1,requestedUnit:'کیلوگرم'});
  const original=(await ok('POST','/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:'STOCK',items:[line('p01')]},shop)).order;
  await ok('POST',`/api/store/orders/${original.id}/quick-send`,{},sales);await ok('POST',`/api/orders/${original.id}/warehouse/accept`,{},wh);
  const add=`/api/store/orders/${original.id}/addition-requests`,review=`/api/sales/store-orders/${original.id}/additions/review`,accept=`/api/warehouse/store-orders/${original.id}/additions/review`;
  const req=(await ok('POST',add,{items:[line('p03')]},shop)).request;
  const blocked=await call('DELETE','/api/admin/products/p03',null,admin);assert.equal(blocked.status,409);assert.equal(blocked.body.code,'PENDING_STORE_ADDITION');
  await ok('PUT','/api/admin/products/p03',{isActive:false},admin);
  assert.equal((await call('POST',review,{requestId:req.id,decision:'APPROVE'},sales)).status,409);
  assert.equal((await ok('GET',`/api/store/orders/${original.id}`,null,shop)).order.storeAdditionRequests[0].status,'PENDING_SALES');
  await ok('POST',review,{requestId:req.id,decision:'REJECT'},sales);
  const req2=(await ok('POST',add,{items:[line('p04')]},shop)).request;await ok('POST',review,{requestId:req2.id,decision:'APPROVE'},sales);
  await ok('PUT','/api/admin/products/p04',{isActive:false},admin);assert.equal((await call('DELETE','/api/admin/products/p04',null,admin)).status,409);
  assert.equal((await call('POST',accept,{requestId:req2.id,decision:'APPROVE'},wh)).status,409);
  assert.equal((await ok('GET',`/api/store/orders/${original.id}`,null,shop)).order.items.length,1);
  await ok('POST',accept,{requestId:req2.id,decision:'REJECT'},wh);await ok('DELETE','/api/admin/products/p04',null,admin);
  for(let n=0;n<4;n++){
   const o=(await ok('POST','/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:'STOCK',items:[line('p01')]},shop)).order;
   await ok('POST',`/api/store/orders/${o.id}/quick-send`,{},sales);await ok('POST',`/api/orders/${o.id}/warehouse/accept`,{},wh);
   await ok('POST',`/api/orders/${o.id}/store-run/weights`,{run:1,items:[{itemId:o.items[0].id,deliveredKg:2}]},wh);
   const addUrl=`/api/store/orders/${o.id}/addition-requests`,sendUrl=`/api/orders/${o.id}/store-run/send-run`;
   const [a,b]=await Promise.all([call('POST',addUrl,{items:[line('p02')]},shop),call('POST',sendUrl,{run:1},wh)]);
   assert((a.status===201&&b.status===409)||(a.status===409&&b.status===200),JSON.stringify([a,b]));
   let saved=(await ok('GET',`/api/orders/${o.id}`,null,wh)).order;
   if(a.status===201){assert.equal(saved.storeAdditionRequests[0].status,'PENDING_SALES');assert(!saved.storeRunOps.r1Shipment);await ok('POST',`/api/sales/store-orders/${o.id}/additions/review`,{requestId:a.body.request.id,decision:'REJECT'},sales);await ok('POST',sendUrl,{run:1},wh);}
   else{assert(!saved.storeAdditionRequests?.length);assert(saved.storeRunOps.r1Shipment);}
   saved=(await ok('GET',`/api/orders/${o.id}`,null,wh)).order;assert(saved.storeRunOps.r1Shipment);assert.equal(saved.storeRunOps.r1Shipment.weights[o.items[0].id],2);
  }
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
