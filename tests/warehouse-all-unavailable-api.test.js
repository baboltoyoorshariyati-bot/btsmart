'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('all-unavailable orders return to sales and do not create deliveries or invoices', {timeout:60000},async()=>{
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
  const v=await visit(1),o=await order(v);
  await ok('POST',`/api/orders/${o.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o.id}/warehouse/start-preparing`,{},wh);
  const body={physicalHandoverConfirmed:false,items:[{itemId:o.items[0].id,outOfStock:true,note:'تمام شد'}]};
  const result=await ok('POST',`/api/orders/${o.id}/warehouse`,body,wh);
  assert.equal(result.allUnavailable,true);assert.equal(result.order.status,'RETURNED_TO_SALES');assert.equal(result.order.items[0].itemStatus,'RETURNED_TO_SALES');assert.equal(result.order.items[0].deliveredKg,null);
  assert.equal(result.order.warehouseDocumentNo,undefined);assert.equal(result.order.warehouseCompletedAt,undefined);assert.equal(result.handover,null);
  assert.match(result.order.warehouseReturn.reason,/ناموجود/);
  assert.equal((await call('POST',`/api/orders/${o.id}/settle`,{items:[],additionsAmount:500,settlementMethods:[{type:'CASH',amount:500}]},sales)).status,409);
  assert.equal((await call('POST',`/api/orders/${o.id}/warehouse`,body,wh)).status,409);
  const list=await ok('GET','/api/orders',null,sales);assert.equal(list.orders.find(x=>x.id===o.id).status,'RETURNED_TO_SALES');
  await ok('POST',`/api/orders/${o.id}/resubmit-sales`,{},sales);
  await ok('POST',`/api/orders/${o.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o.id}/warehouse/start-preparing`,{},wh);
  const delivered=await ok('POST',`/api/orders/${o.id}/warehouse`,{physicalHandoverConfirmed:true,items:[{itemId:o.items[0].id,deliveredKg:5}]},wh);
  assert.equal(delivered.order.status,'SETTLEMENT_PENDING');assert.equal(delivered.order.items[0].deliveredKg,5);assert(delivered.handover);
  assert.equal((await call('POST',`/api/orders/${o.id}/recover-no-goods`,{confirmedNoGoods:true},sales)).status,409,'real physical delivery must never be repaired as no-goods');
  const mixedVisit=await visit(4), mixed=(await ok('POST','/api/orders',{visitId:mixedVisit.id,items:[{productId:'p01',requestedQty:5,requestedUnit:'کیلوگرم'},{productId:'p02',requestedQty:1,requestedUnit:'کیلوگرم'}]},sales)).order;
  await ok('POST',`/api/orders/${mixed.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${mixed.id}/warehouse/start-preparing`,{},wh);
  const mixedResult=await ok('POST',`/api/orders/${mixed.id}/warehouse`,{physicalHandoverConfirmed:true,items:[{itemId:mixed.items[0].id,outOfStock:true},{itemId:mixed.items[1].id,deliveredKg:2}]},wh);
  assert.equal(mixedResult.order.status,'SETTLEMENT_PENDING');assert(mixedResult.handover);
  assert.equal((await call('POST',`/api/orders/${mixed.id}/settle`,{items:[{itemId:mixed.items[1].id,unitPrice:100,cancelled:true}],additionsAmount:500,settlementMethods:[{type:'CASH',amount:500}]},sales)).status,409,'cancelled delivery plus extras cannot create an invoice');
  await ok('POST',`/api/orders/${mixed.id}/settle`,{items:[{itemId:mixed.items[1].id,unitPrice:100}],settlementMethods:[{type:'CASH',amount:200}]},sales);
  const v2=await visit(2),o2=await order(v2);
  await ok('POST',`/api/orders/${o2.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o2.id}/warehouse/start-preparing`,{},wh);
  await ok('POST',`/api/orders/${o2.id}/warehouse`,{items:[{itemId:o2.items[0].id,outOfStock:true}]},wh);
  await ok('POST',`/api/visits/${v2.id}/cancel-onsite`,{reason:'عدم موجودی',confirmedNoGoods:true},sales);
  await ok('POST',`/api/visits/${v2.id}/cancelled-exit`,{confirmedNoGoods:true},gate);
  // Construct an actual persisted pre-fix state with an authentic audit entry.
  const v3=await visit(3),o3=await order(v3);
  await ok('POST',`/api/orders/${o3.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o3.id}/warehouse/start-preparing`,{},wh);
  const script=`const s=require('./lib/store');const db=s.init(),o=db.orders.find(x=>x.id===process.env.OID),i=db.orderItems.find(x=>x.orderId===o.id),now=s.nowIso();Object.assign(i,{itemStatus:'OUT_OF_STOCK',warehouseStatus:'OUT_OF_STOCK',deliveredKg:0});Object.assign(o,{status:'SETTLEMENT_PENDING',warehouseCompletedAt:now,warehouseCompletedBy:'warehouse',warehouseDocumentNo:process.env.DOC||'W-000099'});s.audit(null,'WAREHOUSE_FINALIZE','order',o.id,{warehouseDocumentNo:o.warehouseDocumentNo,items:[{itemId:i.id,status:'OUT_OF_STOCK',deliveredKg:0}]});s.save();`;
  const injected=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,OID:o3.id,ADMIN_INITIAL_PASSWORD:'Initial!2345'},encoding:'utf8'});assert.equal(injected.status,0,injected.stderr);
  const legacy=(await ok('GET',`/api/orders/${o3.id}`,null,sales)).order;assert.equal(legacy.status,'SETTLEMENT_PENDING');
  const bypass=await call('POST',`/api/orders/${o3.id}/settle`,{items:[],additionsAmount:500,settlementMethods:[{type:'CASH',amount:500}]},sales);assert.equal(bypass.status,409);assert.match(bypass.data.error,/هیچ کالای تحویلی/);
  assert.equal((await call('POST',`/api/orders/${o3.id}/recover-no-goods`,{confirmedNoGoods:true},wh)).status,403);
  assert.equal((await call('POST',`/api/orders/${o3.id}/recover-no-goods`,{},sales)).status,400);
  const repaired=(await ok('POST',`/api/orders/${o3.id}/recover-no-goods`,{confirmedNoGoods:true},sales)).order;
  assert.equal(repaired.status,'RETURNED_TO_SALES');assert.equal(repaired.noGoodsRecovery.warehouseDocumentNo,'W-000099');assert.equal(repaired.warehouseDocumentNo,null);
  assert.equal((await call('POST',`/api/orders/${o3.id}/recover-no-goods`,{confirmedNoGoods:true},sales)).status,409);
  await ok('POST',`/api/visits/${v3.id}/cancel-onsite`,{reason:'عدم موجودی',confirmedNoGoods:true},sales);
  await ok('POST',`/api/visits/${v3.id}/cancelled-exit`,{confirmedNoGoods:true},gate);
  const v5=await visit(5),o5=await order(v5);
  await ok('POST',`/api/orders/${o5.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o5.id}/warehouse/start-preparing`,{},wh);
  const second=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,OID:o5.id,DOC:'W-000100',ADMIN_INITIAL_PASSWORD:'Initial!2345'},encoding:'utf8'});assert.equal(second.status,0,second.stderr);
  await ok('POST',`/api/orders/${o5.id}/recover-no-goods`,{confirmedNoGoods:true},sales);
  await ok('POST',`/api/orders/${o5.id}/resubmit-sales`,{},sales);
  await ok('POST',`/api/orders/${o5.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${o5.id}/warehouse/start-preparing`,{},wh);
  const retried=await ok('POST',`/api/orders/${o5.id}/warehouse`,{physicalHandoverConfirmed:true,items:[{itemId:o5.items[0].id,deliveredKg:3}]},wh);
  assert.notEqual(retried.order.warehouseDocumentNo,'W-000100');assert.equal(retried.order.noGoodsRecovery.warehouseDocumentNo,'W-000100');
  assert.equal((await call('POST',`/api/visits/${v5.id}/cancel-onsite`,{reason:'انصراف',confirmedNoGoods:true},sales)).status,409,'a later real delivery is not exempted by legacy recovery');
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
