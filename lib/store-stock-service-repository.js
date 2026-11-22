'use strict';
// Experimental storage for the unconnected service domain. No production
// route calls this module. All writes must share SQLite's BEGIN IMMEDIATE lock
// with legacy order/handover routes before activation.
const Service = require('./store-stock-service');
const Transport = require('./store-stock-transport');

const { initialize } = require('./store-stock-service-schema');
function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const result=work(); db.exec('COMMIT'); return result; }
  catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}
function read(db,id) {
  const row=db.prepare('SELECT payload FROM stock_service_drafts WHERE id=?').get(id);
  return row ? JSON.parse(row.payload) : null;
}
function save(db,next,previousRevision) {
  const result=db.prepare('UPDATE stock_service_drafts SET branch_no=?,status=?,revision=?,payload=? WHERE id=? AND revision=?')
    .run(next.branchNo,next.status,next.revision,JSON.stringify(next),next.id,previousRevision);
  if (Number(result.changes)!==1) throw new Error('سرویس تغییر کرده است؛ اطلاعات را دوباره بارگذاری کنید.');
  return next;
}
// Locked variants must only be called by an owner of an existing IMMEDIATE
// transaction; they allow the HTTP unit of work to include audit and notices.
function createLocked(db, data) {
  const service=Service.createService(data);
  if (db.prepare("SELECT id FROM stock_service_drafts WHERE branch_no=? AND status='OPEN'").get(service.branchNo)) throw new Error('برای این شعبه سرویس باز وجود دارد.');
  db.prepare('INSERT INTO stock_service_drafts (id,branch_no,status,revision,payload) VALUES (?,?,?,?,?)')
    .run(service.id,service.branchNo,service.status,service.revision,JSON.stringify(service));
  return service;
}
function create(db, data) { return transaction(db,()=>createLocked(db,data)); }
function loadOrder(db, orderId) {
  const row=db.prepare('SELECT payload FROM orders WHERE id=?').get(orderId);
  if (!row) throw new Error('سفارش یافت نشد.');
  const order=JSON.parse(row.payload);
  const items=db.prepare('SELECT payload FROM order_items WHERE order_id=?').all(orderId).map(r=>JSON.parse(r.payload));
  const ids=[...new Set(items.filter(i=>i.itemStatus!=='CANCELLED').map(i=>i.productId))];
  const findProduct=db.prepare('SELECT payload FROM products WHERE id=?');
  const products=ids.map(id=>findProduct.get(id)).filter(Boolean).map(r=>JSON.parse(r.payload));
  return {order,items,products};
}
// Defensive check against changes through any older order route. It prevents a
// stale aggregate from being weighed or handed over, but is NOT a replacement
// for explicit guards and status propagation in those routes.
function assertMembersStable(db, service) {
  for (const member of service.orders) {
    const link=db.prepare('SELECT service_id FROM stock_service_draft_members WHERE order_id=?').get(member.orderId);
    if (!link || link.service_id!==service.id) throw new Error('عضویت سفارش ناسازگار است؛ بررسی لازم است.');
    const live=loadOrder(db,member.orderId);
    const temp=Service.createService({id:'check',branchNo:service.branchNo,createdAt:service.createdAt,createdBy:service.createdBy});
    const checked=Service.addOrder(temp,{...live,expectedRevision:0,at:member.addedAt,by:member.addedBy});
    const shape=source=>({itemId:source.itemId,orderId:source.orderId,orderNo:source.orderNo,productId:source.productId,productName:source.productName,requestedQty:source.requestedQty,requestedUnit:source.requestedUnit,description:source.description});
    const sort=(a,b)=>String(a.itemId).localeCompare(String(b.itemId));
    const before=service.sources.filter(s=>s.orderId===member.orderId).map(shape).sort(sort);
    const after=checked.sources.map(shape).sort(sort);
    if (live.order.storeId!==member.storeId || JSON.stringify(before)!==JSON.stringify(after)) throw new Error('سفارش یا اقلام عضو تغییر کرده‌اند؛ پیش از ادامه بررسی شوند.');
  }
}
// Source-of-truth rows are read only after the write lock is acquired. A caller
// must still add protections to all existing order mutation paths before use.
function addOrderLocked(db, serviceId, orderId, options) {
  const current=read(db,serviceId); if (!current) throw new Error('سرویس یافت نشد.');
  if (current.status!=='OPEN') throw new Error('سرویس بسته شده است.');
  assertMembersStable(db,current);
  if (db.prepare('SELECT service_id FROM stock_service_draft_members WHERE order_id=?').get(orderId)) throw new Error('سفارش قبلاً عضو سرویس دیگری شده است.');
  const next=Service.addOrder(current,{...options,...loadOrder(db,orderId)});
  save(db,next,current.revision);
  db.prepare('INSERT INTO stock_service_draft_members(order_id,service_id) VALUES (?,?)').run(orderId,serviceId);
  return next;
}
function addOrder(db, serviceId, orderId, options) { return transaction(db,()=>addOrderLocked(db,serviceId,orderId,options)); }

// Called only after approval has been persisted within the caller's write lock.
// No HTTP route uses this yet: membership must not be enabled before legacy
// writes and both handover paths are protected by the same lock.
function joinApprovedLocked(db, orderId, {at, by}={}) {
  const source=loadOrder(db,orderId);
  const branchNo=Number(source.order.branchNo);
  // Validate even when a member is already present; a retry must not hide a
  // change to its source or bring an unapproved/future/independent order in.
  const sample=Service.createService({id:'validation',branchNo,createdAt:at,createdBy:by});
  Service.addOrder(sample,{...source,expectedRevision:0,at,by});
  const link=db.prepare('SELECT service_id FROM stock_service_draft_members WHERE order_id=?').get(orderId);
  if (link) {
    const existing=read(db,link.service_id);
    if (!existing || existing.branchNo!==branchNo) throw new Error('عضویت سفارش ناسازگار است؛ بررسی لازم است.');
    if (existing.status!=='OPEN') throw new Error('این سفارش قبلاً در سرویس تحویل‌شده ثبت شده است.');
    assertMembersStable(db,existing);
    return existing;
  }
  const open=db.prepare("SELECT id FROM stock_service_drafts WHERE branch_no=? AND status='OPEN'").get(branchNo);
  const service=open ? read(db,open.id) : createLocked(db,{id:require('node:crypto').randomUUID(),branchNo,createdAt:at,createdBy:by});
  return addOrderLocked(db,service.id,orderId,{expectedRevision:service.revision,at,by});
}
function joinApproved(db,orderId,options) { return transaction(db,()=>joinApprovedLocked(db,orderId,options)); }
// Until automatic membership is connected to approval, never seal a draft if
// another pending-sales or approved, due, unhanded stock request of this branch is outside it.
function assertNoUnjoinedOrders(db, service) {
  const rows=db.prepare('SELECT payload FROM orders').all();
  for (const row of rows) {
    const o=JSON.parse(row.payload);
    const awaitingSales=o.status==='STORE_PENDING_SALES';
    const ready=o.approvalStatus==='APPROVED' && ['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(o.status);
    if (o.orderType!=='STORE' || o.storeOrderKind!=='PARTIAL' || o.storePurpose!=='STOCK' || o.customerId || Number(o.branchNo)!==service.branchNo || (!awaitingSales && !ready) || o.transportHandovers?.['1'] || o.transportStoreTrips?.['1']) continue;
    const member=db.prepare('SELECT service_id FROM stock_service_draft_members WHERE order_id=?').get(o.id);
    if (!member) throw new Error('سفارش تکمیل فروشگاه دیگری برای این شعبه هنوز بررسی یا به سرویس افزوده نشده است.');
  }
}
function transitionLocked(db,id,method,options) {
  const operation={weigh:Service.weigh,unavailable:Service.markUnavailable,handover:Service.handover,assign:Transport.assign,handoverAssigned:Transport.handover,review:Transport.review,depart:Transport.depart,receipt:Transport.receipt,returnDocuments:Transport.returnDocuments}[method];
  if (!operation) throw new Error('عملیات سرویس ناشناخته است.');
  const current=read(db,id); if (!current) throw new Error('سرویس یافت نشد.');
  assertMembersStable(db,current);
  if (method==='handover'||method==='handoverAssigned') assertNoUnjoinedOrders(db,current);
  if (method==='handoverAssigned') {
    const assignment=current.transport?.assignment;
    if (!assignment) throw new Error('ابتدا راننده و خودرو تعیین شوند.');
    const driver=db.prepare('SELECT payload FROM drivers WHERE id=?').get(assignment.driverId),vehicle=db.prepare('SELECT payload FROM vehicles WHERE id=?').get(assignment.vehicleId);
    if (!driver||!vehicle||!Transport.assignmentMatchesResources(assignment,JSON.parse(driver.payload),JSON.parse(vehicle.payload))) throw new Error('اطلاعات راننده یا خودرو تغییر کرده است؛ تخصیص را دوباره بررسی کنید.');
  }
  if (method==='assign') {
    if(typeof options?.driverId!=='string'||typeof options?.vehicleId!=='string'||!options.driverId||!options.vehicleId) throw new Error('راننده یا خودرو معتبر نیست.');
    const driver=db.prepare('SELECT payload FROM drivers WHERE id=?').get(options.driverId),vehicle=db.prepare('SELECT payload FROM vehicles WHERE id=?').get(options.vehicleId);
    if (!driver||!vehicle) throw new Error('راننده یا خودرو یافت نشد.');
    const realDriver=JSON.parse(driver.payload),realVehicle=JSON.parse(vehicle.payload);
    if(realDriver.id!==options.driverId||realVehicle.id!==options.vehicleId) throw new Error('اطلاعات راننده یا خودرو ناسازگار است.');
    options={...options,driver:realDriver,vehicle:realVehicle};
  }
  return save(db,operation(current,options),current.revision);
}
function transition(db,id,method,options) { return transaction(db,()=>transitionLocked(db,id,method,options)); }

// Proof-of-integration only: reserve from the same series as ordinary warehouse
// documents and store the counter and snapshot in one SQLite transaction. It is
// not called by HTTP or production workflows. Activation requires the live
// transaction bridge, guarded legacy order writes and the other safeguards in
// the plan document; direct writes can leave the in-memory counter stale.
function numberedHandoverLocked(db,id,options,{writeCounter}={},method='handover') {
  if (options?.documentNo !== undefined) throw new Error('شماره سند به‌صورت خودکار تخصیص داده می‌شود.');
  const orders=db.prepare('SELECT payload FROM orders').all().map(row=>JSON.parse(row.payload));
  const row=db.prepare("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").get();
  const numbers=db.prepare("SELECT payload FROM stock_service_drafts WHERE status='HANDED_OVER'").all()
    .map(r=>JSON.parse(r.payload)?.handover?.document?.documentNo);
  const data={orders,counters:{warehouseDocumentNumber:row ? row.value : 0}};
  const documentNo=require('./warehouse-document-numbers').reserveStockServiceDocumentNumber(data,numbers);
  const result=transitionLocked(db,id,method,{...options,documentNo});
  const nextCounter=data.counters.warehouseDocumentNumber;
  if (writeCounter) {
    const returned=writeCounter(nextCounter);
    if (returned && typeof returned.then==='function') throw new Error('ثبت شمارنده باید هم‌زمان باشد.');
    const stored=db.prepare("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").get();
    if (!stored || Number(stored.value)!==nextCounter) throw new Error('شمارنده سند انبار ذخیره نشد.');
  } else {
    db.prepare("INSERT INTO counters(key,value) VALUES('warehouseDocumentNumber',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(nextCounter);
  }
  return result;
}
function handoverWithNumberLocked(db,id,options,settings) { return numberedHandoverLocked(db,id,options,settings,'handover'); }
function handoverWithNumber(db,id,options) { return transaction(db,()=>handoverWithNumberLocked(db,id,options)); }
function handoverAssignedWithNumberLocked(db,id,options,settings) { return numberedHandoverLocked(db,id,options,settings,'handoverAssigned'); }
function handoverAssignedWithNumber(db,id,options) { return transaction(db,()=>handoverAssignedWithNumberLocked(db,id,options)); }
module.exports={initialize,read,create,addOrder,transition,createLocked,addOrderLocked,joinApprovedLocked,joinApproved,transitionLocked,handoverWithNumberLocked,handoverWithNumber,handoverAssignedWithNumberLocked,handoverAssignedWithNumber};
