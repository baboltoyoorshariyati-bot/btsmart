'use strict';
// Sales requests a return; warehouse verifies every returned line and no goods
// remaining with the visitor before the existing no-goods exit is enabled.
const {atomicRoute:route,fail}=require('../http');
const store=require('../store'),validate=require('../validate');
const {createNotification}=require('../domain');
const {createHash}=require('node:crypto');
const documentHash=order=>createHash('sha256').update(JSON.stringify(order.pickupHandover||order.warehouseHandover||null)).digest('hex');
function source(db,id){
 const order=db.orders.find(o=>o.id===id);if(!order)fail(404,'سفارش یافت نشد.');
 if(!['ONSITE','REMOTE'].includes(order.orderType)||!['PICKUP',null,undefined,''].includes(order.deliveryMode)||(order.orderType==='REMOTE'&&order.deliveryMode!=='PICKUP'))fail(409,'این مسیر فقط برای مراجعهٔ مشتری و تحویل در انبار است.');
 const visit=db.visits.find(v=>v.id===order.visitId);
 if(!visit || (order.orderType==='ONSITE'&&(visit.status!=='ORDERED'||db.orders.filter(o=>o.visitId===visit.id).length!==1)) || (order.orderType==='REMOTE'&&(visit.status!=='PICKUP_PRESENT'||visit.orderId!==order.id)))fail(409,'مراجعهٔ باز و مرتبط با سفارش یافت نشد؛ ابتدا وضعیت مراجعه بررسی شود.');
 if(order.dispatch||(order.dispatches||[]).length||order.transportInvoice||order.transportDeparture||Object.keys(order.transportHandovers||{}).length||order.payment||db.payments.some(p=>p.orderId===order.id)||(order.documentEdits||[]).some(e=>['PENDING_WAREHOUSE','PENDING_SALES_REVIEW'].includes(e.status))||order.pickupCancellation||order.settlementCancellation?.status==='CONFIRMED')fail(409,'این سفارش دارای تسویه، پخش، اصلاح سند یا انصراف قبلی است؛ تعیین تکلیف جداگانه لازم است.');
 const handover=order.pickupHandover||order.warehouseHandover;
 const event=[...db.audit].reverse().find(e=>e.entityType==='order'&&e.entityId===order.id&&e.action==='WAREHOUSE_FINALIZE');
 const recorded=handover?.document?.items||event?.details?.items||[];
 const items=db.orderItems.filter(i=>i.orderId===order.id).map(i=>({itemId:i.id,productId:i.productId,productName:recorded.find(r=>r.itemId===i.id)?.productName||db.products.find(p=>p.id===i.productId)?.name||'—',itemStatus:i.itemStatus||null,warehouseStatus:i.warehouseStatus||null,deliveredKg:i.deliveredKg==null?null:Number(i.deliveredKg)})).sort((a,b)=>String(a.itemId).localeCompare(String(b.itemId)));
 if(!order.warehouseCompletedAt||!items.length||items.some(i=>!i.itemId||!i.productId||(i.deliveredKg!==null&&(!Number.isFinite(i.deliveredKg)||i.deliveredKg<0))))fail(409,'سند یا اقلام انبار برای تأیید بازگشت معتبر نیست.');
 if(handover){
  const lines=handover.document?.items;
  if(handover.physicalHandoverConfirmed!==true||!Array.isArray(lines)||handover.document.warehouseDocumentNo!==order.warehouseDocumentNo)fail(409,'سند تحویل فیزیکی معتبر نیست؛ بررسی جداگانه لازم است.');
  const delivered=lines.filter(i=>!i.outOfStock&&Number(i.deliveredKg)>0),actual=items.filter(i=>Number(i.deliveredKg)>0);
  if(delivered.length!==actual.length||delivered.some(i=>!actual.some(a=>a.itemId===i.itemId&&a.productId===i.productId&&a.deliveredKg===Number(i.deliveredKg))))fail(409,'اقلام با سند تحویل فیزیکی مطابقت ندارند؛ بررسی جداگانه لازم است.');
 }
 return {order,visit,items};
}
route('POST','/api/orders/:id/settlement-cancellation',{roles:['sales'],idempotent:true},ctx=>{
 const db=store.get(),{order,visit,items}=source(db,ctx.params.id);
 if(order.status!=='SETTLEMENT_PENDING'||order.settlementCancellation)fail(409,'سفارش دیگر در وضعیت قابل ارجاع برای انصراف نیست.');
 const reason=validate.text(ctx.body.reason,{field:'دلیل انصراف',max:300,required:true}),now=store.nowIso();
 order.settlementCancellation={status:'PENDING_WAREHOUSE',visitId:visit.id,reason,requestedAt:now,requestedBy:ctx.user.id,warehouseDocumentNo:order.warehouseDocumentNo||'',handoverHash:documentHash(order),items};
 order.status='CANCEL_RETURN_PENDING';order.updatedAt=now;
 store.audit(ctx.user,'SETTLEMENT_CANCELLATION_REQUESTED','order',order.id,{visitId:visit.id,reason,warehouseDocumentNo:order.warehouseDocumentNo||''},ctx);
 createNotification('warehouse','SETTLEMENT_CANCELLATION_REQUESTED','order',order.id,`انصراف سفارش ${order.orderNo||'—'} به انبار ارجاع شد؛ بازگشت کالا و عدم وجود کالا نزد مراجعه‌کننده را بررسی کنید.`);
 store.save();return {body:{orderId:order.id,status:order.status}};
});
route('GET','/api/warehouse/settlement-cancellations',{roles:['warehouse']},ctx=>{
 const db=store.get(),offset=Math.max(0,Number.parseInt(ctx.query.get('offset'),10)||0),limit=100;
 const pending=db.orders.filter(o=>o.status==='CANCEL_RETURN_PENDING'&&o.settlementCancellation?.status==='PENDING_WAREHOUSE');
 const rows=pending.map(o=>({id:o.id,orderNo:o.orderNo||'',orderType:o.orderType,customerName:db.customers.find(c=>c.id===o.customerId)?.name||'',reason:o.settlementCancellation.reason,warehouseDocumentNo:o.settlementCancellation.warehouseDocumentNo,requestedAt:o.settlementCancellation.requestedAt,items:o.settlementCancellation.items.map(i=>({...i}))}));
 return {body:{orders:rows.slice(offset,offset+limit),offset,limit,total:rows.length}};
});
route('POST','/api/warehouse/settlement-cancellations/:id/confirm',{roles:['warehouse'],idempotent:true},ctx=>{
 const db=store.get(),{order,visit,items}=source(db,ctx.params.id),request=order.settlementCancellation;
 if(order.status!=='CANCEL_RETURN_PENDING'||request?.status!=='PENDING_WAREHOUSE'||request.visitId!==visit.id||request.warehouseDocumentNo!==(order.warehouseDocumentNo||'')||request.handoverHash!==documentHash(order)||JSON.stringify(request.items)!==JSON.stringify(items))fail(409,'اطلاعات سفارش یا سند تغییر کرده است؛ ابتدا بررسی شود.');
 const returned=items.filter(i=>Number(i.deliveredKg)>0),checked=ctx.body.returnedItems;
 if(ctx.body.confirmedNoGoods!==true||!Array.isArray(checked)||checked.some(x=>typeof x!=='string')||new Set(checked).size!==checked.length||checked.length!==returned.length||returned.some(i=>!checked.includes(i.itemId)))fail(400,'بازگشت همهٔ اقلام و عدم وجود کالا نزد مراجعه‌کننده باید صریحاً تأیید شود.');
 const now=store.nowIso();order.status='CANCELLED';order.cancelReason=request.reason;order.cancelledAt=now;order.cancelledBy=ctx.user.id;order.updatedAt=now;
 order.settlementCancellation={...request,status:'CONFIRMED',confirmedAt:now,confirmedBy:ctx.user.id,returnedItems:checked,confirmedNoGoods:true};
 if(order.deposit?.status==='RECEIVED')order.deposit={...order.deposit,status:Number(order.deposit.amount)>Number(order.deposit.refundedAmount||0)?'REFUND_REQUIRED':'REFUNDED'};
 if(order.orderType==='ONSITE'){
  visit.status='CANCELLED_EXIT_PENDING';visit.onsiteCancellation={reason:request.reason,orderId:order.id,status:'EXIT_PENDING',cancelledAt:now,cancelledBy:ctx.user.id};
  createNotification('gate','ONSITE_CANCELLATION_EXIT','visit',visit.id,'انبار بازگشت کالا را تأیید کرد؛ خروج بدون کالا را کنترل و ثبت کنید.');
 }else{
  order.pickupCancellation={status:'EXIT_APPROVED',visitId:visit.id,reason:request.reason,noGoodsConfirmed:true,approvedAt:now,approvedBy:ctx.user.id};
  createNotification('gate','PICKUP_CANCELLATION_APPROVED','order',order.id,`بازگشت کالای سفارش ${order.orderNo||'—'} تأیید شد؛ خروج بدون کالا را کنترل کنید.`);
 }
 store.audit(ctx.user,'SETTLEMENT_CANCELLATION_CONFIRMED','order',order.id,{visitId:visit.id,warehouseDocumentNo:request.warehouseDocumentNo,returnedItems:checked,confirmedNoGoods:true,depositStatus:order.deposit?.status||null},ctx);
 createNotification('sales','SETTLEMENT_CANCELLATION_CONFIRMED','order',order.id,`بازگشت کالا و انصراف سفارش ${order.orderNo||'—'} ثبت شد${order.deposit?.status==='REFUND_REQUIRED'?'؛ استرداد دستی بیعانه را پیگیری کنید':''}.`);
 store.save();return {body:{orderId:order.id,status:order.status}};
});
