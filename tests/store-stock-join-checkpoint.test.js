'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('عضویت در همان تراکنش از زمان اتصال محافظت شده و شکست بلعیده‌شده نیز rollback می‌شود',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-stock-checkpoint-'));
 process.env.DATA_DIR=dir;process.env.ADMIN_INITIAL_PASSWORD='StockTest!234';
 const store=require('../lib/store'),R=require('../lib/store-stock-service-repository');
 const tx=require('../lib/transport-transaction'),bridge=require('../lib/store-stock-service-live-transaction');
 try{
  store.init();const sql=store.sql.init();R.initialize(sql);
  const at='2026-01-01T00:00:00.000Z',by='sales';
  for(const id of ['a','b','c']){
   store.get().orders.push({id,orderNo:'B'+id,branchNo:1,storeId:'shop',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,approvalStatus:'PENDING_SALES',transportWorkflow:1,deliveryMode:'DELIVERY',status:'STORE_PENDING_SALES',createdAt:at});
   store.get().orderItems.push({id:id+'1',orderId:id,productId:id==='c'?'p02':'p01',requestedQty:10,requestedUnit:'کیلوگرم',itemStatus:'PENDING'});
  }
  store.save();
  const state=()=>({orders:store.sql.all('SELECT * FROM orders ORDER BY id'),items:store.sql.all('SELECT * FROM order_items ORDER BY id'),products:store.sql.all('SELECT * FROM products ORDER BY id'),members:store.sql.all('SELECT * FROM stock_service_draft_members ORDER BY order_id'),drafts:store.sql.all('SELECT * FROM stock_service_drafts ORDER BY id'),audit:store.sql.all('SELECT * FROM audit ORDER BY id'),notifications:store.sql.all('SELECT * FROM notifications ORDER BY id')});
  const approve=id=>{Object.assign(store.get().orders.find(o=>o.id===id),{approvalStatus:'APPROVED',status:'WAREHOUSE_PENDING'});return bridge.joinApprovedLocked(id,{at,by});};
  const audit=()=>store.audit(store.get().users[0],'JOIN_TEST','order','a');
  const initial=state();
  const invalid=[
   ()=>{store.get().orders.find(o=>o.id==='a').status='WAREHOUSE_PREPARING';},
   ()=>{store.get().orderItems.find(i=>i.id==='a1').requestedQty=11;},
   ()=>{store.get().orderItems.push({id:'extra',orderId:'a',productId:'p01',requestedQty:5,requestedUnit:'عدد',itemStatus:'PENDING'});},
   ()=>{store.get().products.find(p=>p.id==='p01').name='تغییر نام';},
   ()=>{store.sql.run('DELETE FROM stock_service_draft_members WHERE order_id=?',['a']);},
  ];
  for(const change of invalid){
   assert.throws(()=>tx(()=>{approve('a');audit();store.get().notifications.push({id:'notice',type:'TEST'});change();}),e=>e.status===409&&['STOCK_SERVICE_MEMBER_LOCKED','STOCK_SERVICE_PRODUCT_LOCKED'].includes(e.code));
   assert.deepEqual(state(),initial);assert.equal(store.verifyAuditChain().ok,true);
   assert.equal(store.get().orders.find(o=>o.id==='a').status,'STORE_PENDING_SALES');
  }
  // SQLite may have saved the new service payload before membership insertion
  // fails. Catching the exception in user work must still abort the request.
  sql.exec("CREATE TRIGGER reject_join BEFORE INSERT ON stock_service_draft_members BEGIN SELECT RAISE(ABORT,'join failed'); END");
  assert.throws(()=>tx(()=>{try{approve('a');}catch{} audit();}),/join failed/);
  assert.deepEqual(state(),initial);assert.equal(store.verifyAuditChain().ok,true);sql.exec('DROP TRIGGER reject_join');
  // Work before joining is allowed; the checkpoint reflects authoritative data
  // at the precise join point, not the start of the approval transaction.
  let service=tx(()=>{store.get().orderItems.find(i=>i.id==='a1').requestedQty=12;const result=approve('a');audit();return result;});
  assert.equal(service.sources[0].requestedQty,12);
  const prior=state();
  // Different new members and products in one transaction each retain their
  // own initial checkpoints; a later member cannot replace the first one.
  assert.throws(()=>tx(()=>{approve('b');approve('c');store.get().orderItems.find(i=>i.id==='b1').requestedQty=99;}),e=>e.code==='STOCK_SERVICE_MEMBER_LOCKED');
  assert.deepEqual(state(),prior);
  assert.throws(()=>tx(()=>{approve('b');approve('c');store.get().products.find(p=>p.id==='p02').name='تغییر';}),e=>e.code==='STOCK_SERVICE_PRODUCT_LOCKED');
  assert.deepEqual(state(),prior);
  // Nested transactional helpers join the outer request-owned unit of work;
  // the checkpoint must still be validated only at the outermost commit.
  assert.throws(()=>tx.request(()=>tx(()=>{approve('b');store.get().orderItems.find(i=>i.id==='b1').requestedQty=99;})),e=>e.code==='STOCK_SERVICE_MEMBER_LOCKED');
  assert.deepEqual(state(),prior);
  // Duplicate membership is idempotent but cannot reset the first checkpoint.
  assert.throws(()=>tx(()=>{approve('b');bridge.joinApprovedLocked('b',{at,by});store.get().orderItems.find(i=>i.id==='b1').requestedQty=99;}),e=>e.code==='STOCK_SERVICE_MEMBER_LOCKED');
  assert.deepEqual(state(),prior);
  service=tx(()=>{approve('b');return approve('c');});
  assert.deepEqual(service.orders.map(o=>o.orderId),['a','b','c']);
  assert.equal(store.verifyAuditChain().ok,true);
  assert.throws(()=>tx.checkpointStockMember('a'),/تراکنش مشترک/);
 }finally{store.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});
