'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('پشتیبان و بازیابی سرویس تجمیعی آزمایشی و پشتیبان‌های قبل از افزودن جدول‌ها',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-stock-backup-'));
 process.env.DATA_DIR=path.join(dir,'data');process.env.ADMIN_INITIAL_PASSWORD='StockBackup!1234';
 const store=require('../lib/store'),repo=require('../lib/store-stock-service-repository');let other;
 try{
  store.init();other=new DatabaseSync(store.sql.dbFile());other.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  const ordinary=path.join(dir,'ordinary.db');store.sql.vacuumInto(ordinary);
  let check=new DatabaseSync(ordinary,{readOnly:true});assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'stock_service_%'").get().n,0);check.close();
  store.sql.restoreSnapshot(ordinary);assert.equal(other.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'stock_service_%'").get().n,0);
  repo.initialize(other);
  const now='2026-01-01T00:00:00.000Z',by='warehouse';
  const order=id=>({id,orderNo:`B${id}`,branchNo:1,storeId:'s1',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,approvalStatus:'APPROVED',transportWorkflow:1,deliveryMode:'DELIVERY',status:'WAREHOUSE_PENDING',createdAt:now});
  const item=(id,oid,qty)=>({id,orderId:oid,productId:'p01',requestedQty:qty,requestedUnit:'کیلوگرم',itemStatus:'PENDING'});
  for(const [id,n] of [['a',50],['b',30]]){const o=order(id),i=item(id+'1',id,n);other.prepare('INSERT INTO orders(id,order_no,status,order_type,approval_status,payload) VALUES(?,?,?,?,?,?)').run(id,o.orderNo,o.status,o.orderType,o.approvalStatus,JSON.stringify(o));other.prepare('INSERT INTO order_items(id,order_id,product_id,payload) VALUES(?,?,?,?)').run(i.id,id,i.productId,JSON.stringify(i));}
  let service=repo.create(other,{id:'s',branchNo:1,createdAt:now,createdBy:by});service=repo.addOrder(other,'s','a',{expectedRevision:service.revision,at:now,by});service=repo.transition(other,'s','weigh',{expectedRevision:service.revision,at:now,by,productId:'p01',itemIds:['a1'],deliveredKg:50});
  const snapshot=path.join(dir,'with-stock.db');store.sql.vacuumInto(snapshot);store.sql.validateSnapshot(snapshot);
  service=repo.addOrder(other,'s','b',{expectedRevision:service.revision,at:now,by});assert.equal(repo.read(other,'s').orders.length,2);
  other.exec('DROP TABLE stock_service_draft_members; DROP TABLE stock_service_drafts');
  store.sql.restoreSnapshot(snapshot);
  let restored=repo.read(other,'s');assert.equal(restored.orders.length,1);assert.equal(restored.weighings[0].kg,50);
  assert.deepEqual(other.prepare('SELECT order_id FROM stock_service_draft_members ORDER BY order_id').all().map(r=>r.order_id),['a']);
  let closed=repo.addOrder(other,'s','b',{expectedRevision:restored.revision,at:now,by});
  closed=repo.transition(other,'s','weigh',{expectedRevision:closed.revision,at:now,by,productId:'p01',itemIds:['b1'],deliveredKg:30});
  const driver={id:'d',fullName:'راننده',vehicleId:'v',isActive:true},vehicle={id:'v',kind:'fleet',isActive:true,plate:'12ب34567'};
  other.prepare('INSERT INTO drivers(id,payload) VALUES(?,?)').run('d',JSON.stringify(driver));other.prepare('INSERT INTO vehicles(id,payload) VALUES(?,?)').run('v',JSON.stringify(vehicle));
  closed=repo.transition(other,'s','assign',{driverId:'d',vehicleId:'v',expectedRevision:closed.revision,at:now,by});
  const handoverToken=require('../lib/store-stock-transport').handoverToken(closed);
  closed=repo.handoverAssignedWithNumber(other,'s',{expectedRevision:closed.revision,at:now,by,handoverToken,physicalHandoverConfirmed:true});
  assert.equal(closed.handover.document.documentNo,'W-000001');assert.equal(other.prepare("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").get().value,1);
  closed=repo.transition(other,'s','review',{expectedRevision:closed.revision,at:now,by,reviewConfirmed:true});closed=repo.transition(other,'s','depart',{expectedRevision:closed.revision,at:now,by,departureConfirmed:true});
  closed=repo.transition(other,'s','receipt',{expectedRevision:closed.revision,at:now,by,receiptConfirmed:true,branchNo:1,storeId:'s1'});closed=repo.transition(other,'s','returnDocuments',{expectedRevision:closed.revision,at:now,by,documentsReturned:true});
  const completed=path.join(dir,'completed.db');store.sql.vacuumInto(completed);store.sql.validateSnapshot(completed);
  const corrupt=path.join(dir,'corrupt-document.db');fs.copyFileSync(completed,corrupt);let altered=new DatabaseSync(corrupt);const badDoc=JSON.parse(altered.prepare('SELECT payload FROM stock_service_drafts WHERE id=?').get('s').payload);badDoc.handover.document.lines[0].deliveredKg=5;altered.prepare('UPDATE stock_service_drafts SET payload=? WHERE id=?').run(JSON.stringify(badDoc),'s');altered.close();
  assert.throws(()=>store.sql.restoreSnapshot(corrupt),/سند سرویس تجمیعی/);assert.deepEqual(repo.read(other,'s'),closed);
  const brokenTrip=path.join(dir,'bad-trip.db');fs.copyFileSync(completed,brokenTrip);altered=new DatabaseSync(brokenTrip);const badTrip=JSON.parse(altered.prepare('SELECT payload FROM stock_service_drafts WHERE id=?').get('s').payload);delete badTrip.transport.receipt;altered.prepare('UPDATE stock_service_drafts SET payload=? WHERE id=?').run(JSON.stringify(badTrip),'s');altered.close();
  assert.throws(()=>store.sql.restoreSnapshot(brokenTrip),/مراحل ترابری/);assert.deepEqual(repo.read(other,'s'),closed);
  const backward=path.join(dir,'backward-counter.db');fs.copyFileSync(completed,backward);altered=new DatabaseSync(backward);altered.prepare("UPDATE counters SET value=0 WHERE key='warehouseDocumentNumber'").run();altered.close();
  assert.throws(()=>store.sql.restoreSnapshot(backward),/شمارنده/);assert.deepEqual(repo.read(other,'s'),closed);
  const duplicate=path.join(dir,'duplicate-document.db');fs.copyFileSync(completed,duplicate);altered=new DatabaseSync(duplicate);const orderPayload=JSON.parse(altered.prepare('SELECT payload FROM orders WHERE id=?').get('a').payload);orderPayload.warehouseDocumentNo=closed.handover.document.documentNo;altered.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(orderPayload),'a');altered.close();
  assert.throws(()=>store.sql.restoreSnapshot(duplicate),/تکراری/);assert.deepEqual(repo.read(other,'s'),closed);
  store.sql.restoreSnapshot(snapshot);restored=repo.read(other,'s');
  const bad=path.join(dir,'bad.db');fs.copyFileSync(snapshot,bad);let db=new DatabaseSync(bad);db.prepare("UPDATE stock_service_drafts SET payload='{}' WHERE id='s'").run();db.close();
  assert.throws(()=>store.sql.restoreSnapshot(bad),/سرویس تجمیعی/);assert.deepEqual(repo.read(other,'s'),restored);
  const orphan=path.join(dir,'orphan.db');fs.copyFileSync(snapshot,orphan);db=new DatabaseSync(orphan);db.prepare('DELETE FROM stock_service_draft_members WHERE order_id=?').run('a');db.close();
  assert.throws(()=>store.sql.restoreSnapshot(orphan),/عضویت سفارش/);assert.deepEqual(repo.read(other,'s'),restored);
  const incomplete=path.join(dir,'partial.db');fs.copyFileSync(snapshot,incomplete);db=new DatabaseSync(incomplete);db.exec('DROP TABLE stock_service_draft_members');db.close();
  assert.throws(()=>store.sql.validateSnapshot(incomplete),/ناقص/);
  const old=path.join(dir,'old.db');fs.copyFileSync(snapshot,old);db=new DatabaseSync(old);db.exec('DROP TABLE stock_service_draft_members; DROP TABLE stock_service_drafts');db.close();
  store.sql.validateSnapshot(old);store.sql.restoreSnapshot(old);
  assert.equal(other.prepare('SELECT COUNT(*) AS n FROM stock_service_drafts').get().n,0);assert.equal(other.prepare('SELECT COUNT(*) AS n FROM stock_service_draft_members').get().n,0);
  assert.equal(other.prepare('SELECT COUNT(*) AS n FROM orders').get().n,2,'old backup still restores its orders');
 }finally{if(other)other.close();store.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});
