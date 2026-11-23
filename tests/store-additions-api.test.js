'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('partial additions require sales and warehouse approval, merge repeated items and preserve weights',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-addition-')),base=`http://127.0.0.1:${port}`,pass='Changed!2345';
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,url+' '+r.status+' '+JSON.stringify(r.data));return r.data;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:pass},admin);
  for(const [username,roleCode,extra] of [['sales','sales',{}],['warehouse-user','warehouse',{}],['shop','store',{storeName:'فروشگاه'}],['other','store',{storeName:'دیگر'}]])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:pass,mustChangePassword:false,...extra},admin);
  const login=async username=>(await call('POST','/api/login',{username,password:pass})).cookie,sales=await login('sales'),wh=await login('warehouse-user'),shop=await login('shop'),other=await login('other');
  const item=(productId,requestedQty,requestedUnit='کیلوگرم')=>({productId,requestedQty,requestedUnit});
  for(const purpose of ['STOCK','CUSTOMER']){
   const original=(await ok('POST','/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:purpose,...(purpose==='CUSTOMER'?{name:'مشتری',phone:'09121112233'}:{}),items:[item('p01',3),item('p02',1)]},shop)).order;
   const add=`/api/store/orders/${original.id}/addition-requests`,review=`/api/sales/store-orders/${original.id}/additions/review`,accept=`/api/warehouse/store-orders/${original.id}/additions/review`;
   assert.equal((await call('POST',add,{items:[item('p01',1)]},shop)).status,409);
   await ok('POST',`/api/store/orders/${original.id}/quick-send`,{},sales);await ok('POST',`/api/orders/${original.id}/warehouse/accept`,{},wh);
   const id=original.items[0].id;await ok('POST',`/api/orders/${original.id}/store-run/weights`,{run:1,items:[{itemId:id,deliveredKg:2}]},wh);
   assert.equal((await call('POST',add,{items:[item('p01',1,'واحد نامعتبر')]},shop)).status,400);
   assert.equal((await call('POST',add,{items:[item('p01',1)]},other)).status,404);
   const req=(await ok('POST',add,{items:[item('p01',2),item('p03',4)]},shop)).request;
   assert.equal((await call('POST',add,{items:[item('p03',1)]},shop)).status,409);
   assert.equal((await call('POST',accept,{requestId:req.id,decision:'APPROVE'},wh)).status,409);
   assert.equal((await call('POST',review,{requestId:req.id,decision:'APPROVE'},shop)).status,403);
   assert.equal((await call('POST',`/api/orders/${original.id}/store-run/send-run`,{run:1},wh)).status,409);
   assert.equal((await call('POST',`/api/orders/${original.id}/store-run/out-of-stock`,{itemId:original.items[1].id},wh)).status,409);
   let pending=(await ok('GET',`/api/orders/${original.id}`,null,wh)).order;assert.equal(pending.items.length,2);assert.equal(pending.items[0].requestedQty,3);assert.equal(pending.items[0].runR1[0].kg,2);
   await ok('POST',review,{requestId:req.id,decision:'APPROVE'},sales);
   pending=(await ok('GET',`/api/orders/${original.id}`,null,wh)).order;assert.equal(pending.items.length,2);assert.equal(pending.storeAdditionRequests[0].status,'PENDING_WAREHOUSE');
   assert((await ok('GET','/api/notifications',null,wh)).notifications.some(n=>n.entityId===original.id&&n.type==='STORE_ADDITION_APPROVED'&&n.navSection==='stores'));
   assert.equal((await call('POST',`/api/orders/${original.id}/store-run/send-run`,{run:1},wh)).status,409);
   if(purpose==='STOCK'){
    const {DatabaseSync}=require('node:sqlite');let sql=new DatabaseSync(path.join(dir,'baboltoyoor.db'));sql.exec("CREATE TRIGGER addition_fail BEFORE INSERT ON audit WHEN NEW.action='STORE_ADDITION_WAREHOUSE_REVIEWED' BEGIN SELECT RAISE(ABORT,'test addition rollback'); END");sql.close();
    assert.equal((await call('POST',accept,{requestId:req.id,decision:'APPROVE'},wh)).status,500);
    const rolledBack=(await ok('GET',`/api/orders/${original.id}`,null,wh)).order;assert.equal(rolledBack.items.length,2);assert.equal(rolledBack.items[0].requestedQty,3);assert(rolledBack.items[0].runCompleted);assert.equal(rolledBack.storeAdditionRequests[0].status,'PENDING_WAREHOUSE');
    sql=new DatabaseSync(path.join(dir,'baboltoyoor.db'));sql.exec('DROP TRIGGER addition_fail');sql.close();
   }
   const accepted=(await ok('POST',accept,{requestId:req.id,decision:'APPROVE'},wh)).order;assert.equal(accepted.id,original.id);assert.equal(accepted.orderNo,original.orderNo);assert.equal(accepted.items.length,3);
   assert.equal((await ok('GET','/api/notifications',null,wh)).notifications.find(n=>n.entityId===original.id&&n.type==='STORE_ADDITION_APPROVED').navSection,null);
   const storeDetail=(await ok('GET',`/api/store/orders/${original.id}`,null,shop)).order;assert.deepEqual(storeDetail.storeRequestRows.filter(x=>x.itemId===id).map(x=>x.requestedQty),[3,2]);
   const existing=accepted.items.find(i=>i.id===id);assert.equal(existing.requestedQty,5);assert.equal(existing.runR1[0].kg,2);assert(!existing.runCompleted);assert.equal(accepted.items.find(i=>i.productId==='p03').requestedQty,4);
   assert.equal((await call('POST',accept,{requestId:req.id,decision:'APPROVE'},wh)).status,409);
   await ok('POST',`/api/orders/${original.id}/store-run/weights`,{run:1,items:[{itemId:id,deliveredKg:1}]},wh);
   const again=(await ok('GET',`/api/orders/${original.id}`,null,wh)).order;assert.deepEqual(again.items.find(i=>i.id===id).runR1.map(x=>x.kg),[2,1]);assert.equal(again.items.find(i=>i.id===id).deliveredKg,3);
   const reject=(await ok('POST',add,{items:[item('p04',1)]},shop)).request;await ok('POST',review,{requestId:reject.id,decision:'REJECT'},sales);
   assert.equal((await ok('GET',`/api/orders/${original.id}`,null,wh)).order.items.length,3);
   for(const i of again.items.filter(i=>!i.runCompleted))await ok('POST',`/api/orders/${original.id}/store-run/out-of-stock`,{itemId:i.id},wh);
   await ok('POST',`/api/orders/${original.id}/store-run/send-run`,{run:1},wh);
   assert.equal((await call('POST',add,{items:[item('p01',1)]},shop)).status,409);
  }
  // Scheduled orders keep their schedule; the warehouse can decide only once the order arrives.
  const scheduled=(await ok('POST','/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:'STOCK',items:[item('p01',1),item('p02',1)]},shop)).order;
  const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10)+'T12:00';await ok('POST',`/api/store/orders/${scheduled.id}/approve`,{scheduledAt:future},sales);
  const addUrl=`/api/store/orders/${scheduled.id}/addition-requests`,salesUrl=`/api/sales/store-orders/${scheduled.id}/additions/review`,whUrl=`/api/warehouse/store-orders/${scheduled.id}/additions/review`;
  const req=(await ok('POST',addUrl,{items:[item('p03',0.0015)]},shop)).request;await ok('POST',salesUrl,{requestId:req.id,decision:'APPROVE'},sales);
  assert.equal((await call('POST',whUrl,{requestId:req.id,decision:'APPROVE'},wh)).status,409);
  {const {DatabaseSync}=require('node:sqlite'),sql=new DatabaseSync(path.join(dir,'baboltoyoor.db'));sql.prepare("UPDATE orders SET payload=json_set(payload,'$.scheduledAt','2000-01-01T00:00','$.scheduledDate','2000-01-01') WHERE id=?").run(scheduled.id);sql.close();}
  await ok('GET','/api/store/orders',null,shop);
  const rejected=(await ok('POST',whUrl,{requestId:req.id,decision:'REJECT'},wh)).order;assert.equal(rejected.items.length,2);assert.equal(rejected.storeAdditionRequests[0].status,'REJECTED_WAREHOUSE');
  await ok('POST',`/api/orders/${scheduled.id}/warehouse/accept`,{},wh);
  await ok('POST',`/api/orders/${scheduled.id}/store-run/out-of-stock`,{itemId:scheduled.items[0].id},wh);
  const next=(await ok('POST',addUrl,{items:[item('p01',0.0015)]},shop)).request;await ok('POST',salesUrl,{requestId:next.id,decision:'APPROVE'},sales);
  const reopened=(await ok('POST',whUrl,{requestId:next.id,decision:'APPROVE'},wh)).order;assert.equal(reopened.items[0].requestedQty,1.0015);assert(!reopened.items[0].shortageClosed);assert(reopened.storeAdditionRequests[1].changes[0].previousShortage);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
