'use strict';
// Called only inside the warehouse's write transaction, after every active line
// has been validated as unavailable. No delivery, invoice or cancellation is
// implied: sales decides whether to edit, resubmit or cancel the order.
const store = require('./store');
const {createNotification, getProduct} = require('./domain');
const {fail} = require('./http');
function returnUnavailable(order, plan, ctx, now) {
 if (!plan.length || plan.some(p => p.status !== 'OUT_OF_STOCK' || p.kg !== 0)) fail(409, 'همه اقلام باید ناموجود باشند.');
 const db = store.get();
 if (order.warehouseCompletedAt || order.warehouseDocumentNo || order.warehouseHandover || order.pickupHandover || order.transportInvoice || order.transportDeparture || order.dispatch || Object.keys(order.transportHandovers || {}).length || order.payment || db.payments.some(p => p.orderId === order.id) || db.orderItems.some(i => i.orderId === order.id && (i.itemStatus === 'DELIVERED' || i.warehouseStatus === 'DELIVERED' || (i.deliveredKg != null && (!Number.isFinite(Number(i.deliveredKg)) || Number(i.deliveredKg) !== 0)))) || db.audit.some(a => a.entityType === 'order' && a.entityId === order.id && (['WAREHOUSE_PHYSICAL_HANDOVER','PICKUP_PHYSICAL_HANDOVER','TRANSPORT_WAREHOUSE_HANDOVER'].includes(a.action) || (a.action === 'WAREHOUSE_FINALIZE' && !require('./no-goods-audit')(order,a)))))
  fail(409, 'این سفارش سابقه سند، تحویل یا تسویه دارد؛ عدم موجودی باید جداگانه بررسی شود.');
 const reason = 'همه اقلام در انبار ناموجود است؛ بررسی و تعیین تکلیف توسط فروش لازم است.';
 const lines = plan.map(p => ({itemId:p.item.id,productId:p.item.productId,productName:getProduct(p.item.productId)?.name || '—',status:'OUT_OF_STOCK',deliveredKg:0,note:p.note || ''}));
 for (const p of plan) {
  Object.assign(p.item, {itemStatus:'RETURNED_TO_SALES',returnReason:reason,deliveredKg:null,warehouseStatus:null,warehouseWeighings:null});
  require('./warehouse-item-note').record(p.item,p.note,ctx.user,now);
 }
 Object.assign(order,{status:'RETURNED_TO_SALES',warehouseReturn:{reason,at:now,itemId:null},warehouseWeightDraft:null,updatedAt:now});
 store.audit(ctx.user,'WAREHOUSE_ALL_UNAVAILABLE','order',order.id,{reason,items:lines},ctx);
 createNotification('sales','RETURN_FROM_WAREHOUSE','order',order.id,`همه اقلام سفارش ${order.orderNo || '—'} ناموجود است؛ برای تعیین تکلیف به فروش برگشت داده شد.`);
 store.save();
 return order;
}
// Explicitly recover only the recognizable legacy bug, preserving its document
// number and audit record. Ambiguous cases remain untouched for manual review.
function recoverLegacy(order, ctx, now) {
 const db=store.get();
 const items=db.orderItems.filter(i=>i.orderId===order.id), active=items.filter(i=>i.itemStatus!=='CANCELLED');
 const events=db.audit.filter(a=>a.entityType==='order' && a.entityId===order.id);
 const finals=events.filter(a=>a.action==='WAREHOUSE_FINALIZE');
 const final=finals[0], lines=final?.details?.items;
 const safeLines=Array.isArray(lines)&&lines.length===active.length&&active.length>0&&active.every(i=>i.itemStatus==='OUT_OF_STOCK'&&i.warehouseStatus==='OUT_OF_STOCK'&&i.deliveredKg!=null&&Number(i.deliveredKg)===0&&lines.some(l=>l.itemId===i.id&&l.status==='OUT_OF_STOCK'&&l.deliveredKg!=null&&Number(l.deliveredKg)===0));
 if (order.orderType==='STORE'||order.status!=='SETTLEMENT_PENDING'||!order.warehouseCompletedAt||!order.warehouseDocumentNo||finals.length!==1||!safeLines||final.details.warehouseDocumentNo!==order.warehouseDocumentNo || order.warehouseHandover||order.pickupHandover||order.transportInvoice||order.transportDeparture||order.dispatch||Object.keys(order.transportHandovers||{}).length||order.payment||db.payments.some(p=>p.orderId===order.id)||items.some(i=>i.itemStatus==='DELIVERED'||i.warehouseStatus==='DELIVERED'||(i.deliveredKg!=null&&(!Number.isFinite(Number(i.deliveredKg))||Number(i.deliveredKg)!==0)))||events.some(a=>['WAREHOUSE_PHYSICAL_HANDOVER','PICKUP_PHYSICAL_HANDOVER','TRANSPORT_WAREHOUSE_HANDOVER'].includes(a.action)))
  fail(409,'سوابق این سفارش برای اصلاح خودکار کافی یا سازگار نیست؛ سند، کالا و وضعیت مالی باید دستی بررسی شوند.');
 const previous={warehouseDocumentNo:order.warehouseDocumentNo,warehouseCompletedAt:order.warehouseCompletedAt,warehouseCompletedBy:order.warehouseCompletedBy,finalizeAuditId:final.id};
 const reason='همه اقلام در انبار ناموجود بوده است؛ بررسی و تعیین تکلیف توسط فروش لازم است.';
 for(const item of active) Object.assign(item,{itemStatus:'RETURNED_TO_SALES',returnReason:reason,deliveredKg:null,warehouseStatus:null,warehouseWeighings:null});
 Object.assign(order,{status:'RETURNED_TO_SALES',warehouseReturn:{reason,at:now,itemId:null},warehouseDocumentNo:null,warehouseCompletedAt:null,warehouseCompletedBy:null,warehouseWeightDraft:null,noGoodsRecovery:previous,updatedAt:now});
 store.audit(ctx.user,'WAREHOUSE_NO_GOODS_RECOVERED','order',order.id,{previous,items:lines},ctx);
 createNotification('sales','RETURN_FROM_WAREHOUSE','order',order.id,`سفارش ${order.orderNo || '—'} بدون کالای تحویلی برای تعیین تکلیف به فروش برگشت.`);
 store.save();
 return order;
}
module.exports = {returnUnavailable,recoverLegacy};
