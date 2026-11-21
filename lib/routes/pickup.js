'use strict';
// Pickup routes are available by default. An emergency rollback cannot hide
// the workflow while a managed order or a pickup visit is still in flight.
const { atomicRoute: route,fail}=require('../http');
const store=require('../store');
const {normalizePlate}=require('../domain');
const service=require('../pickup-transaction-service');
function staged(){if(!require('../pickup-feature').enabled())fail(404,'مسیر API پیدا نشد.');}
// Service responses for gate and warehouse contain identifiers, visits and
// immutable documents only, never the raw order with its financial fields.
route('GET','/api/pickup/orders',{roles:['gate']},ctx=>{
 staged();const q=normalizePlate(String(ctx.query.get('q')||'').trim().slice(0,80));
 if(q.length<2)return {body:{orders:[]}};
 const db=store.get(),open=new Set(['SCHEDULED_REMOTE','WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES']);
 const rows=db.orders.filter(o=>o.orderType==='REMOTE'&&o.deliveryMode==='PICKUP'&&!o.dispatch&&open.has(o.status)&&!o.warehouseCompletedAt&&!o.pickupCancellation&&!o.pickupHandover).map(o=>{
  const c=db.customers.find(x=>x.id===o.customerId),visit=db.visits.find(v=>v.orderId===o.id&&v.status==='PICKUP_PRESENT');
  return {id:o.id,orderNo:o.orderNo,customerName:c?.name||'',customerPhone:c?.phone||'',deliveryDate:o.deliveryDate||null,status:o.status,hasOpenVisit:!!visit};
 }).filter(o=>[o.orderNo,o.customerName,o.customerPhone].some(v=>normalizePlate(String(v||'')).includes(q))).slice(-20).reverse();
 const ids=new Set(rows.map(o=>o.id)),products=new Map(db.products.map(p=>[p.id,p.name])),items=new Map();
 for(const item of db.orderItems){if(!ids.has(item.orderId)||item.itemStatus==='CANCELLED')continue;const list=items.get(item.orderId)||[];list.push({productName:products.get(item.productId)||'—',requestedQty:item.requestedQty,requestedUnit:item.requestedUnit||'',itemStatus:item.itemStatus});items.set(item.orderId,list);}
 return {body:{orders:rows.map(o=>({...o,items:items.get(o.id)||[]}))}};
});
route('GET','/api/pickup/active',{roles:['gate','warehouse','sales']},ctx=>{
 staged();
 const db=store.get(),offset=Math.max(0,Number.parseInt(ctx.query.get('offset'),10)||0),limit=100;
 const customers=new Map(db.customers.map(c=>[c.id,c]));
 const visits=new Map(db.visits.filter(v=>v.status==='PICKUP_PRESENT').map(v=>[v.id,v]));
 const orders=db.orders.filter(o=>o.orderType==='REMOTE'&&o.deliveryMode==='PICKUP'&&o.visitId)
  .map(o=>({order:o,visit:visits.get(o.visitId)}))
  .filter(({order,visit})=>visit&&visit.orderId===order.id).map(({order:o,visit})=>{
   const c=customers.get(o.customerId);
   return {id:o.id,orderNo:o.orderNo,status:o.status,deliveryDate:o.deliveryDate||null,customerName:c?.name||'',customerPhone:c?.phone||'',recipient:visit.recipient,enteredAt:visit.createdAt,cancellation:o.pickupCancellation?{status:o.pickupCancellation.status,reason:o.pickupCancellation.reason}:null,handover:!!o.pickupHandover,items:(o.pickupHandover?.document?.items||[]).filter(i=>!i.outOfStock&&Number(i.deliveredKg)>0).map(i=>({itemId:i.itemId,productName:i.productName,deliveredKg:i.deliveredKg}))};
  });
 return {body:{orders:orders.slice(offset,offset+limit),offset,limit,total:orders.length}};
});
route('PUT','/api/pickup/:id/delivery-date',{roles:['sales']},ctx=>{staged();return {body:{order:service.changeDate(ctx.params.id,ctx.body.deliveryDate,ctx)}};});
route('POST','/api/pickup/:id/entry',{roles:['gate'],idempotent:true},ctx=>{staged();return {status:201,body:service.entry(ctx.params.id,ctx.body,ctx)};});
route('POST','/api/pickup/:id/cancellation',{roles:['warehouse'],idempotent:true},ctx=>{staged();return {body:service.requestCancellation(ctx.params.id,ctx.body,ctx)};});
route('POST','/api/pickup/:id/cancellation-approval',{roles:['sales'],idempotent:true},ctx=>{staged();return {body:service.approveCancellation(ctx.params.id,ctx)};});
route('POST','/api/pickup/:id/cancellation-exit',{roles:['gate'],idempotent:true},ctx=>{staged();return {body:service.cancellationExit(ctx.params.id,ctx)};});
route('POST','/api/pickup/:id/handover',{roles:['warehouse'],idempotent:true},ctx=>{staged();return {body:service.finalizeHandover(ctx.params.id,ctx.body,ctx)};});
route('POST','/api/pickup/:id/goods-exit',{roles:['gate'],idempotent:true},ctx=>{staged();return {body:service.goodsExit(ctx.params.id,ctx.body,ctx)};});
