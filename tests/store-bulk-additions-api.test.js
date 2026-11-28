'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('bulk additions preserve sent service one and route new independent lines to service two, only before warehouse finalization',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-bulk-add-')),base=`http://127.0.0.1:${port}`,pass='Changed!2345';
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,url+' '+r.status+' '+JSON.stringify(r.data));return r.data;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:pass},admin);
  for(const [username,roleCode,extra] of [['sales','sales',{}],['warehouse1','warehouse',{}],['shop','store',{storeName:'فروشگاه'}],['other','store',{storeName:'دیگر'}]])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:pass,mustChangePassword:false,...extra},admin);
  const login=async username=>(await call('POST','/api/login',{username,password:pass})).cookie,sales=await login('sales'),wh=await login('warehouse1'),shop=await login('shop'),other=await login('other');
  const item=(productId,requestedQty)=>({productId,requestedQty,requestedUnit:'کیلوگرم'});
  const driver=(await ok('POST','/api/transport/drivers',{fullName:'راننده تست',phone:'09121112233'},admin)).driver,vehicle=(await ok('POST','/api/transport/vehicles',{vehicleType:'وانت',plate:'12ب34567'},admin)).vehicle;
  await ok('PUT',`/api/transport/drivers/${driver.id}/resources`,{vehicleId:vehicle.id,paymentDeviceId:''},admin);
  const create=async items=>{const o=(await ok('POST','/api/store/orders',{storeOrderKind:'BULK',items},shop)).order;await ok('POST',`/api/store/orders/${o.id}/quick-send`,{},sales);await ok('POST',`/api/orders/${o.id}/warehouse/accept`,{},wh);return o;};
  const o=await create([item('p01',5),item('p02',10)]),id=o.id,old=o.items[0].id;
  await ok('POST',`/api/transport/plans/${id}/assign`,{run:1,driverId:driver.id,vehicleId:vehicle.id},admin);
  await ok('POST',`/api/orders/${id}/store-run/weights`,{run:1,items:[{itemId:old,deliveredKg:5}]},wh);
  assert.equal((await call('POST',`/api/orders/${id}/store-run/seals`,{run:1,revision:0,hasSeals:true,sealNumbers:['']},wh)).status,400);
  const draft=(await ok('POST',`/api/orders/${id}/store-run/seals`,{run:1,revision:0,hasSeals:true,sealNumbers:['۰۰۰۱','A-02']},wh)).order;assert.deepEqual(draft.storeSealDrafts['1'].sealNumbers,['۰۰۰۱','A-02']);
  assert.equal((await call('POST',`/api/orders/${id}/store-run/send-run`,{run:1,sealRevision:0,physicalHandoverConfirmed:true},wh)).status,409);
  const sent=(await ok('POST',`/api/orders/${id}/store-run/send-run`,{run:1,sealRevision:1,physicalHandoverConfirmed:true},wh)).order;assert.deepEqual(sent.transportHandovers['1'].document.sealNumbers,['۰۰۰۱','A-02']);
  assert.equal((await call('POST',`/api/orders/${id}/store-run/seals`,{run:1,revision:1,hasSeals:true,sealNumbers:['تغییر']},wh)).status,409);
  assert(sent.transportHandovers['1']);assert(!sent.storeRunOps.finalizedAt);
  const prior=JSON.stringify(sent.transportHandovers['1'].document), add=`/api/store/orders/${id}/addition-requests`,salesReview=`/api/sales/store-orders/${id}/additions/review`,whReview=`/api/warehouse/store-orders/${id}/additions/review`;
  assert.equal((await call('POST',add,{items:[item('p01',1)]},other)).status,404);
  const req=(await ok('POST',add,{items:[{...item('p01',2),description:'سفارش اضافه'},item('p03',4)]},shop)).request;
  assert.equal((await call('POST',`/api/orders/${id}/store-run/weights`,{run:1,items:[{itemId:o.items[1].id,deliveredKg:1}]},wh)).status,409);
  assert.equal((await call('POST',`/api/orders/${id}/store-run/complete`,{itemId:old},wh)).status,409);
  assert.equal((await call('POST',`/api/orders/${id}/store-run/send-run`,{run:2},wh)).status,409);
  await ok('POST',salesReview,{requestId:req.id,decision:'APPROVE'},sales);
  const {DatabaseSync}=require('node:sqlite');let db=new DatabaseSync(path.join(dir,'baboltoyoor.db'));db.exec("CREATE TRIGGER bulk_add_fail BEFORE INSERT ON audit WHEN NEW.action='STORE_ADDITION_WAREHOUSE_REVIEWED' BEGIN SELECT RAISE(ABORT,'rollback test'); END");db.close();
  assert.equal((await call('POST',whReview,{requestId:req.id,decision:'APPROVE'},wh)).status,500);
  let afterFailure=(await ok('GET',`/api/orders/${id}`,null,wh)).order;assert.equal(afterFailure.items.length,2);assert.equal(afterFailure.storeAdditionRequests[0].status,'PENDING_WAREHOUSE');assert.equal(JSON.stringify(afterFailure.transportHandovers['1'].document),prior);
  db=new DatabaseSync(path.join(dir,'baboltoyoor.db'));db.exec('DROP TRIGGER bulk_add_fail');db.close();
  const accepted=(await ok('POST',whReview,{requestId:req.id,decision:'APPROVE'},wh)).order;
  assert.equal(accepted.items.length,4);const same=accepted.items.filter(x=>x.productId==='p01');assert.equal(same.length,2);
  const orig=same.find(x=>x.id===old),extra=same.find(x=>x.id!==old);assert.equal(orig.requestedQty,5);assert.equal(orig.runR1[0].kg,5);assert.equal(extra.requestedQty,2);assert.equal(extra.description,'سفارش اضافه');assert.equal(extra.additionTargetRun,2);assert(extra.movedToR2);assert.equal(accepted.items.find(x=>x.productId==='p03').additionTargetRun,2);
  assert.equal(JSON.stringify(accepted.transportHandovers['1'].document),prior);
  assert.equal((await call('POST',`/api/orders/${id}/store-run/weights`,{run:1,items:[{itemId:extra.id,deliveredKg:2}]},wh)).status,409);
  await ok('POST',`/api/orders/${id}/store-run/weights`,{run:2,items:[{itemId:extra.id,deliveredKg:2}]},wh);
  await ok('POST',`/api/orders/${id}/store-run/complete`,{itemId:extra.id},wh);const reopened=await ok('POST',`/api/orders/${id}/store-run/reopen-item`,{itemId:extra.id},wh);assert.equal(reopened.run,2);assert(reopened.order.items.find(x=>x.id===extra.id).movedToR2);assert.equal((await call('POST',`/api/orders/${id}/store-run/weights`,{run:1,items:[{itemId:extra.id,deliveredKg:2}]},wh)).status,409);await ok('POST',`/api/orders/${id}/store-run/weights`,{run:2,items:[{itemId:extra.id,deliveredKg:2}]},wh);
  await ok('POST',`/api/transport/plans/${id}/assign`,{run:2,driverId:driver.id,vehicleId:vehicle.id},admin);
  await ok('POST',`/api/orders/${id}/store-run/send-run`,{run:2,physicalHandoverConfirmed:true,hasSeals:true,sealNumbers:['S-002']},wh);
  const doc2=(await ok('GET',`/api/warehouse/store-documents/${id}/2`,null,wh)).document;assert.deepEqual(doc2.lines.map(x=>x.itemId),[extra.id]);assert.equal(doc2.lines[0].deliveredKg,2);assert.deepEqual(doc2.sealNumbers,['S-002']);assert.deepEqual((await ok('GET',`/api/sales/store-documents/${id}/2`,null,sales)).document.sealNumbers,['S-002']);
  const afterSecond=(await ok('GET',`/api/orders/${id}`,null,wh)).order;assert.equal(JSON.stringify(afterSecond.transportHandovers['1'].document),prior);assert.deepEqual(afterSecond.storeAdditionRequests[0].changes.map(c=>c.run),[2,2]);
  assert.equal((await call('POST',add,{items:[item('p04',1)]},shop)).status,409,'service two already issued');
  // A warehouse-finished bulk order cannot be reopened by a new request.
  const done=await create([item('p01',3)]);await ok('POST',`/api/transport/plans/${done.id}/assign`,{run:1,driverId:driver.id,vehicleId:vehicle.id},admin);await ok('POST',`/api/orders/${done.id}/store-run/weights`,{run:1,items:[{itemId:done.items[0].id,deliveredKg:3}]},wh);
  const finalized=(await ok('POST',`/api/orders/${done.id}/store-run/send-run`,{run:1,physicalHandoverConfirmed:true},wh)).order;assert(finalized.storeRunOps.finalizedAt);assert(finalized.storeAdditionClosedAt);assert.equal((await call('POST',`/api/store/orders/${done.id}/addition-requests`,{items:[item('p04',1)]},shop)).status,409);
  // Competing completion and addition cannot both win: after finalization no request is allowed.
  const race=await create([item('p01',5),item('p02',10)]);await ok('POST',`/api/transport/plans/${race.id}/assign`,{run:1,driverId:driver.id,vehicleId:vehicle.id},admin);await ok('POST',`/api/orders/${race.id}/store-run/weights`,{run:1,items:[{itemId:race.items[0].id,deliveredKg:5},{itemId:race.items[1].id,deliveredKg:5}]},wh);await ok('POST',`/api/orders/${race.id}/store-run/send-run`,{run:1,physicalHandoverConfirmed:true},wh);
  const results=await Promise.all([call('POST',`/api/store/orders/${race.id}/addition-requests`,{items:[item('p03',1)]},shop),call('POST',`/api/orders/${race.id}/store-run/complete`,{itemId:race.items[1].id},wh)]);assert([[201,409],[409,200]].some(pair=>pair.every((status,index)=>results[index].status===status)),JSON.stringify(results));
  const raceOrder=(await ok('GET',`/api/orders/${race.id}`,null,wh)).order;assert(!(raceOrder.storeRunOps?.finalizedAt&&raceOrder.storeAdditionRequests?.some(r=>r.status==='PENDING_SALES')));
  // A rejection never adds items and unblocks normal warehouse work.
  const rejected=await create([item('p01',3)]),rejectedUrl=`/api/store/orders/${rejected.id}/addition-requests`;
  const denied=(await ok('POST',rejectedUrl,{items:[item('p02',2)]},shop)).request;
  await ok('POST',`/api/sales/store-orders/${rejected.id}/additions/review`,{requestId:denied.id,decision:'REJECT'},sales);
  const rejectedOrder=(await ok('GET',`/api/orders/${rejected.id}`,null,wh)).order;assert.equal(rejectedOrder.items.length,1);assert.equal(rejectedOrder.storeAdditionRequests[0].status,'REJECTED_SALES');
  const deniedWh=(await ok('POST',rejectedUrl,{items:[item('p02',2)]},shop)).request;await ok('POST',`/api/sales/store-orders/${rejected.id}/additions/review`,{requestId:deniedWh.id,decision:'APPROVE'},sales);await ok('POST',`/api/warehouse/store-orders/${rejected.id}/additions/review`,{requestId:deniedWh.id,decision:'REJECT'},wh);
  const afterReject=(await ok('GET',`/api/orders/${rejected.id}`,null,wh)).order;assert.equal(afterReject.items.length,1);assert.equal(afterReject.storeAdditionRequests[1].status,'REJECTED_WAREHOUSE');await ok('POST',`/api/orders/${rejected.id}/store-run/weights`,{run:1,items:[{itemId:rejected.items[0].id,deliveredKg:3}]},wh);
  // Before the first shipment, a bulk addition starts in service one.
  const before=await create([item('p01',3)]),url=`/api/store/orders/${before.id}/addition-requests`;
  const r=(await ok('POST',url,{items:[item('p02',2)]},shop)).request;await ok('POST',`/api/sales/store-orders/${before.id}/additions/review`,{requestId:r.id,decision:'APPROVE'},sales);const added=(await ok('POST',`/api/warehouse/store-orders/${before.id}/additions/review`,{requestId:r.id,decision:'APPROVE'},wh)).order;assert(!added.items.find(x=>x.productId==='p02').movedToR2);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
