'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('تراکنش زنده: شماره، سرویس و حسابرسی با هم ثبت و در خطا با هم بازگردانده می‌شوند',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-stock-live-tx-'));
 process.env.DATA_DIR=dir;process.env.ADMIN_INITIAL_PASSWORD='StockTest!234';
 const store=require('../lib/store'), R=require('../lib/store-stock-service-repository');
 const transaction=require('../lib/transport-transaction'), bridge=require('../lib/store-stock-service-live-transaction');
 const numbers=require('../lib/warehouse-document-numbers');
 try{
  store.init();const sql=store.sql.init();R.initialize(sql);
  const at='2026-01-01T00:00:00.000Z',by='warehouse';
  const order={id:'a',orderNo:'Ba',branchNo:1,storeId:'shop',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,approvalStatus:'PENDING_SALES',transportWorkflow:1,deliveryMode:'DELIVERY',status:'STORE_PENDING_SALES',createdAt:at};
  store.get().orders.push(order);store.get().orderItems.push({id:'a1',orderId:'a',productId:'p01',requestedQty:50,requestedUnit:'کیلوگرم',itemStatus:'PENDING'});store.save();
  assert.throws(()=>bridge.joinApprovedLocked('a',{at,by}),/تراکنش مشترک/);
  const approve=()=>{const current=store.get().orders.find(o=>o.id==='a');Object.assign(current,{approvalStatus:'APPROVED',status:'WAREHOUSE_PENDING'});const result=bridge.joinApprovedLocked('a',{at,by});store.audit(store.get().users[0],'STOCK_APPROVAL_TEST','order','a');return result;};
  sql.exec("CREATE TRIGGER reject_stock_membership BEFORE INSERT ON stock_service_draft_members BEGIN SELECT RAISE(ABORT,'injected membership failure'); END");
  assert.throws(()=>transaction(approve),/injected membership failure/);
  assert.equal(store.get().orders.find(o=>o.id==='a').status,'STORE_PENDING_SALES');assert.equal(sql.prepare('SELECT count(*) AS n FROM stock_service_drafts').get().n,0);assert.equal(store.get().audit.length,0);
  sql.exec('DROP TRIGGER reject_stock_membership');
  let service=transaction(approve);const serviceId=service.id;
  store.get().drivers.push({id:'d',fullName:'راننده',vehicleId:'v',isActive:true});store.get().vehicles.push({id:'v',kind:'fleet',plate:'12ب34567',isActive:true});
  assert.throws(()=>bridge.transitionLocked(serviceId,'assign',{}),/تراکنش مشترک/);
  service=transaction(()=>bridge.transitionLocked(serviceId,'assign',{driverId:'d',vehicleId:'v',expectedRevision:service.revision,at,by}));
  service=transaction(()=>bridge.transitionLocked(serviceId,'weigh',{productId:'p01',itemIds:['a1'],deliveredKg:50,expectedRevision:service.revision,at,by}));
  const opts={expectedRevision:service.revision,at,by,handoverToken:require('../lib/store-stock-transport').handoverToken(service),physicalHandoverConfirmed:true};
  assert.throws(()=>bridge.handoverAssignedLocked(serviceId,opts),/تراکنش مشترک/);
  const originalAudit=store.get().audit.length;
  // The repository has already saved the document before it writes the shared
  // counter. Even an accidentally caught bridge error must abort everything.
  sql.exec("CREATE TRIGGER reject_stock_counter BEFORE INSERT ON counters WHEN NEW.key='warehouseDocumentNumber' BEGIN SELECT RAISE(ABORT,'injected counter failure'); END");
  assert.throws(()=>transaction(()=>{try{bridge.handoverAssignedLocked(serviceId,opts);}catch{} store.audit(store.get().users[0],'TEST_CAUGHT','service',serviceId);}),/injected counter failure/);
  assert.deepEqual(R.read(sql,serviceId),service);assert.equal(store.get().counters.warehouseDocumentNumber,undefined);assert.equal(store.get().audit.length,originalAudit);assert.equal(store.verifyAuditChain().ok,true);
  sql.exec('DROP TRIGGER reject_stock_counter');
  sql.exec("CREATE TRIGGER reject_stock_audit BEFORE INSERT ON audit WHEN NEW.action='STOCK_SERVICE_TEST' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");
  assert.throws(()=>transaction(()=>{bridge.handoverAssignedLocked(serviceId,opts);store.audit(store.get().users[0],'STOCK_SERVICE_TEST','service',serviceId);}),/injected audit failure/);
  assert.deepEqual(R.read(sql,serviceId),service);assert.equal(store.get().counters.warehouseDocumentNumber,undefined);
  assert.equal(store.sql.get("SELECT value FROM counters WHERE key='warehouseDocumentNumber'"),null);assert.equal(store.get().audit.length,originalAudit);assert.equal(store.verifyAuditChain().ok,true);
  sql.exec('DROP TRIGGER reject_stock_audit');
  const closed=transaction(()=>{const result=bridge.handoverAssignedLocked(serviceId,opts);store.audit(store.get().users[0],'STOCK_SERVICE_TEST','service',serviceId,{warehouseDocumentNo:result.handover.document.documentNo});store.save();return result;});
  assert.equal(closed.handover.document.documentNo,'W-000001');assert.equal(store.get().counters.warehouseDocumentNumber,1);
  store.save();assert.equal(store.sql.get("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").value,1);assert.equal(store.verifyAuditChain().ok,true);
  // The existing order allocator must see the issued consolidated document,
  // including when the common counter has been manually set back.
  store.get().counters.warehouseDocumentNumber=0;
  const doc=transaction(()=>{const db=store.get(),ordinary={id:'normal',orderType:'REMOTE',createdAt:at};db.orders.push(ordinary);return numbers.assignWarehouseDocumentNumber(db,db.orders.find(o=>o.id==='normal'));});
  assert.equal(doc,'W-000002');assert.equal(store.get().counters.warehouseDocumentNumber,2);store.save();
  assert.equal(store.sql.get("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").value,2);
  store.get().counters.warehouseDocumentNumber=0;store.reloadFromSql();
  assert.equal(store.get().counters.warehouseDocumentNumber,2,'reload repair sees both ordinary and consolidated documents');
  const storeDoc=transaction(()=>{const db=store.get(),other={id:'other',orderType:'STORE',createdAt:at};db.orders.push(other);return numbers.assignStoreWarehouseDocumentNumber(db,db.orders.find(o=>o.id==='other'),1);});
  assert.equal(storeDoc,'W-000003');assert.equal(store.get().counters.warehouseDocumentNumber,3);
  assert.equal(Object.keys(store.get()).includes('stockDocumentNumbers'),false);
  // Restart recovery must account for a higher consolidated document even
  // when no ordinary document exists at that number.
  transaction(()=>{store.get().orders=store.get().orders.filter(o=>o.id!=='normal'&&o.id!=='other');store.get().counters.warehouseDocumentNumber=0;});
  const {spawnSync}=require('node:child_process');
  const child=spawnSync(process.execPath,['-e',"const s=require('./lib/store');s.init();console.log('COUNTER:'+s.get().counters.warehouseDocumentNumber);s.sql.close();"],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'StockTest!234'},encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/COUNTER:1/);
  store.refresh();assert.equal(store.get().counters.warehouseDocumentNumber,1);
 }finally{store.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});
