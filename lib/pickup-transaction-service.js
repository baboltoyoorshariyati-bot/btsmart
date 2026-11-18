'use strict';
// Internal building blocks. HTTP routes remain disabled by default and must not
// be enabled for production before parallel paths, UI, documents and end-to-end
// checks are complete.
const store = require('./store');
const workflow = require('./pickup-workflow');
const transaction = require('./transport-transaction');
const { today, createNotification, getProduct } = require('./domain');
const validate = require('./validate');
const { fail } = require('./http');

function current(id) {
  const order = store.get().orders.find(o => o.id === id);
  if (!order) fail(404, 'سفارش یافت نشد.');
  return order;
}
function visitOf(order) { return store.get().visits.find(v => v.id === order.visitId); }
function itemsOf(order) { return store.get().orderItems.filter(i => i.orderId === order.id); }
function openVisit(order) { return store.get().visits.find(v => v.orderId === order.id && v.status === 'PICKUP_PRESENT'); }
function update(order, next) { Object.assign(order, next, {updatedAt:store.nowIso()}); }
function audit(ctx, action, order, details) { store.audit(ctx.user, action, 'order', order.id, details, ctx); }

function changeDate(id, value, ctx) {
 return transaction(() => {
  const order=current(id), before=order.deliveryDate || null;
  const next=workflow.changeDeliveryDate(order,value,ctx.user,today(),openVisit(order));
  update(order,{...next,pickupWorkflow:1});audit(ctx,'PICKUP_DELIVERY_DATE_CHANGED',order,{before,after:next.deliveryDate});
  return {id:order.id,deliveryDate:order.deliveryDate};
 });
}
function entry(id, body, ctx) {
 return transaction(() => {
  const order=current(id), now=store.nowIso();
  if(body?.recipientIsBuyer===true){
   const customer=store.get().customers.find(c=>c.id===order.customerId);
   if(!customer?.name || !customer?.phone) fail(409,'مشخصات صاحب سفارش ناقص است؛ فروش ابتدا آن را اصلاح کند.');
   if(body.name!==customer.name || body.phone!==customer.phone) fail(409,'مشخصات صاحب سفارش تغییر کرده است؛ سفارش را دوباره جست‌وجو و انتخاب کنید.');
   body={...body,name:customer.name,phone:customer.phone};
  }
  const next=workflow.createEntry(order,body,ctx.user,today(),now,store.uid(),openVisit(order));
  update(order,{...next.order,pickupWorkflow:1});store.get().visits.push(next.visit);
  createNotification('warehouse','PICKUP_ENTRY','order',order.id,`تحویل‌گیرنده سفارش ${order.orderNo || '—'} وارد شد.`);
  audit(ctx,'PICKUP_ENTRY',order,{visitId:next.visit.id,recipient:next.visit.recipient});
  return {orderId:order.id,visit:next.visit};
 });
}
function requestCancellation(id, body, ctx) {
 return transaction(() => {
  const order=current(id),visit=visitOf(order),now=store.nowIso();
  const next=workflow.requestCancellation(order,visit,ctx.user,now,body?.reason,body?.confirmedNoGoods,itemsOf(order));
  update(order,next);
  createNotification('sales','PICKUP_CANCELLATION_REQUESTED','order',order.id,`انبار انصراف سفارش ${order.orderNo || '—'} را برای بررسی ثبت کرد.`);
  audit(ctx,'PICKUP_CANCELLATION_REQUESTED',order,{visitId:visit.id,reason:next.pickupCancellation.reason});
  return {orderId:order.id,cancellation:next.pickupCancellation};
 });
}
function approveCancellation(id, ctx) {
 return transaction(() => {
  const order=current(id),visit=visitOf(order),now=store.nowIso();
  const next=workflow.approveCancellation(order,visit,ctx.user,now,itemsOf(order));
  update(order,next);
  createNotification('gate','PICKUP_CANCELLATION_APPROVED','order',order.id,`انصراف سفارش ${order.orderNo || '—'} تأیید شد؛ کنترل خروج انجام شود.`);
  audit(ctx,'PICKUP_CANCELLATION_APPROVED',order,{visitId:visit.id,depositStatus:next.deposit?.status || null});
  return {orderId:order.id,cancellation:next.pickupCancellation};
 });
}
function cancellationExit(id, ctx) {
 return transaction(() => {
  const order=current(id),visit=visitOf(order),now=store.nowIso();
  const next=workflow.cancellationExit(order,visit,ctx.user,now);
  update(order,next.order);Object.assign(visit,next.visit);
  audit(ctx,'PICKUP_CANCELLATION_EXIT',order,{visitId:visit.id});
  return {orderId:order.id,visitId:visit.id};
 });
}
// Record weights and the actual physical handover together. This remains an
// committed atomically with the document, notification and audit records.
function finalizeHandover(id, body, ctx) {
 return transaction(() => {
  const db=store.get(),order=current(id),visit=visitOf(order),now=store.nowIso();
  const next=workflow.recordHandover(order,visit,ctx.user,now,body?.physicalHandoverConfirmed);
  require('./warehouse-weight-draft').checkRevision(order,body?.draftRevision,!!order.warehouseWeightDraft);
  if (order.warehouseCompletedAt) fail(409,'وزن نهایی قبلاً ثبت شده است؛ ابتدا سند و کالا بررسی شود.');
  const active=itemsOf(order).filter(i=>i.itemStatus!=='CANCELLED');
  const inputs=Array.isArray(body?.items)?body.items:[];
  const byId=new Map();
  for(const item of inputs) {
   if(!item || typeof item.itemId!=='string' || byId.has(item.itemId)) fail(400,'اقلام وزن‌کشی نامعتبر یا تکراری است.');
   byId.set(item.itemId,item);
  }
  if(!active.length || byId.size!==active.length) fail(400,'وزن همهٔ اقلام فعال باید ثبت شود.');
  const plan=active.map(item=>{
   const data=byId.get(item.id);
   if(!data) fail(400,'وزن همهٔ اقلام فعال باید ثبت شود.');
   const product=getProduct(item.productId);
   if(!product) fail(409,'محصول سفارش یافت نشد.');
   if(data.outOfStock===true) return {item,status:'OUT_OF_STOCK',kg:0,weighings:null,productName:product.name};
   const weighed=require('./warehouse-weighing').weighingsFor(data.weighings);
   const kg=weighed ? weighed.netKg : validate.number(data.deliveredKg,{field:'وزن تحویلی',min:0.001,max:validate.MAX_QTY});
   return {item,status:'DELIVERED',kg,weighings:weighed?.rows||null,productName:product.name};
  });
  if(!plan.some(p=>p.kg>0)) fail(409,'بدون کالای تحویلی از مسیر انصراف بدون تحویل استفاده کنید.');
  const customer=db.customers.find(c=>c.id===order.customerId);
  if(!customer?.name || !customer?.phone) fail(409,'مشخصات صاحب سفارش ناقص است.');
  const documentNo=require('./warehouse-document-numbers').assignWarehouseDocumentNumber(db,order);
  const lines=plan.map(p=>({itemId:p.item.id,productId:p.item.productId,productName:p.productName,requestedQty:p.item.requestedQty,requestedUnit:p.item.requestedUnit,description:p.item.description||'',deliveredKg:p.kg,weighings:p.weighings,outOfStock:p.status==='OUT_OF_STOCK'}));
  const document={id:order.id,warehouseDocumentNo:documentNo,orderNo:order.orderNo||'—',orderType:order.orderType,deliveryMode:'PICKUP',createdAt:order.createdAt,completedAt:now,completedBy:ctx.user.fullName||ctx.user.username||'',customerName:customer.name,customerPhone:customer.phone,recipient:JSON.parse(JSON.stringify(visit.recipient)),deliveryDate:order.deliveryDate,items:lines,deliveredKg:+lines.reduce((sum,i)=>sum+i.deliveredKg,0).toFixed(3)};
  for(const p of plan) Object.assign(p.item,{itemStatus:p.status,deliveredKg:p.kg,returnReason:'',warehouseStatus:p.status,warehouseWeighings:p.weighings});
  update(order,{...next,status:'SETTLEMENT_PENDING',warehouseDocumentNo:documentNo,warehouseCompletedAt:now,warehouseCompletedBy:ctx.user.id,warehouseWeightDraft:null,pickupHandover:{...next.pickupHandover,document}});
  createNotification('sales','WAREHOUSE_DONE','order',order.id,`تحویل واقعی و وزن نهایی سفارش ${order.orderNo||'—'} ثبت شد؛ تسویه انجام شود.`);
  audit(ctx,'WAREHOUSE_FINALIZE',order,{warehouseDocumentNo:documentNo,items:plan.map(p=>({itemId:p.item.id,status:p.status,deliveredKg:p.kg,weighings:p.weighings,productName:p.productName,requestedQty:p.item.requestedQty,requestedUnit:p.item.requestedUnit,description:p.item.description||''})),pickupVisitId:visit.id,physicalHandoverConfirmed:true});
  audit(ctx,'PICKUP_PHYSICAL_HANDOVER',order,{visitId:visit.id,recipient:document.recipient,warehouseDocumentNo:documentNo});
  return {orderId:order.id,handover:JSON.parse(JSON.stringify(order.pickupHandover))};
 });
}

// Complete exit only after the registered physical handover, a real settlement,
// and exact acknowledgement of every physically delivered document line.
function goodsExit(id, body, ctx) {
 return transaction(() => {
  const db=store.get(),order=current(id),visit=visitOf(order),now=store.nowIso();
  const next=workflow.goodsExit(order,visit,ctx.user,now);
  const document=order.pickupHandover?.document;
  if(!document || !Array.isArray(document.items)) fail(409,'سند ثابت تحویل یافت نشد.');
  if(!db.payments.some(p=>p.orderId===order.id && p.invoiceNumber && p.verifiedAt)) fail(409,'فاکتور تسویه‌شدهٔ این سفارش یافت نشد.');
  const lines=document.items.filter(i=>!i.outOfStock && Number(i.deliveredKg)>0);
  const checked=Array.isArray(body?.checkedItems)?body.checkedItems:[];
  if(!lines.length || checked.length!==lines.length || checked.some(id=>typeof id!=='string') || new Set(checked).size!==checked.length || lines.some(i=>!checked.includes(i.itemId))) fail(400,'همهٔ اقلام تحویلی باید با بار تطبیق داده شوند.');
  const actual=new Map(itemsOf(order).map(i=>[i.id,i]));
  if(lines.some(i=>!actual.has(i.itemId)||actual.get(i.itemId).itemStatus==='CANCELLED'||actual.get(i.itemId).productId!==i.productId||Number(actual.get(i.itemId).deliveredKg)!==Number(i.deliveredKg)) || [...actual.values()].some(i=>i.itemStatus!=='CANCELLED' && Number(i.deliveredKg)>0 && !lines.some(line=>line.itemId===i.id))) fail(409,'اقلام تحویل‌شده با فاکتور مطابقت ندارند؛ ابتدا در فروش تعیین تکلیف شوند.');
  update(order,next.order);Object.assign(visit,next.visit);
  audit(ctx,'PICKUP_GOODS_EXIT',order,{visitId:visit.id,checkedItems:checked,warehouseDocumentNo:document.warehouseDocumentNo});
  return {orderId:order.id,visitId:visit.id};
 });
}
module.exports={changeDate,entry,requestCancellation,approveCancellation,cancellationExit,finalizeHandover,goodsExit};
