'use strict';
// Sales-only read model over persisted orders, invoices and existing audit trail.
const {route,fail}=require('../http');
const store=require('../store');
const {today,activateDueRemoteOrders}=require('../domain');
const SALES={roles:['admin','sales']};
const dayOf=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
function indexes(db){
 const customers=new Map(db.customers.map(c=>[c.id,c])), visits=new Map(db.visits.map(v=>[v.id,v])), payments=new Map();
 for(const p of db.payments){if(!payments.has(p.orderId))payments.set(p.orderId,[]);payments.get(p.orderId).push(p);}
 return {customers,visits,payments};
}
function summary(idx,o){
 const customer=idx.customers.get(o.customerId||idx.visits.get(o.visitId)?.customerId), payments=idx.payments.get(o.id)||[];
 return {id:o.id,orderNo:o.orderNo,orderType:o.orderType,status:o.status,createdAt:o.createdAt,updatedAt:o.updatedAt,customerName:(o.orderType==='STORE'?require('../store-name').storeDisplayName(o.storeName,o.branchNo):customer?.name||o.storeName)||'—',phone:customer?.phone||'',invoiceCount:payments.length,invoices:payments.map(p=>({number:p.invoiceNumber,total:Number(p.totalAmount||0),verifiedAt:p.verifiedAt||p.createdAt,run:p.deliveryRun||null}))};
}
route('GET','/api/sales/overview',SALES,async()=>{
 activateDueRemoteOrders();const db=store.get();const day=today(),idx=indexes(db),validOrders=new Set(db.orders.filter(o=>o.status!=='CANCELLED').map(o=>o.id)),orders=db.orders.filter(o=>dayOf(o.createdAt)===day),payments=db.payments.filter(p=>dayOf(p.verifiedAt||p.createdAt)===day&&validOrders.has(p.orderId));
 return {status:200,body:{day,updatedAt:store.nowIso(),ordersToday:orders.length,cancelledToday:orders.filter(o=>o.status==='CANCELLED').length,invoicesToday:payments.length,salesTotal:payments.reduce((a,p)=>a+(Number(p.totalAmount)||0),0),pendingSettlement:db.orders.filter(o=>o.status==='SETTLEMENT_PENDING'&&!o.dispatch).length,returned:db.orders.filter(o=>o.status==='RETURNED_TO_SALES').length,recent:db.orders.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,8).map(o=>summary(idx,o))}};
});
route('GET','/api/sales/daily-products',SALES,async()=>{
 const db=store.get();return {status:200,body:require('../sales-daily-stats').salesDailyStats(db,today(),dayOf)};
});
route('GET','/api/sales/history',SALES,async ctx=>{
 const db=store.get(),idx=indexes(db),q=String(ctx.query.get('q')||'').trim().toLowerCase().slice(0,80);
 const {queryOrders,pagination}=require('../order-search'),{limit,offset}=pagination(ctx.query,100,25);
 const page=queryOrders({q,limit,offset,history:true});
 return {status:200,body:{total:page.total,offset,limit,orders:page.orders.map(o=>summary(idx,o))}};
});
route('GET','/api/sales/history/:id',SALES,async ctx=>{
 const db=store.get(),order=db.orders.find(o=>o.id===ctx.params.id);if(!order)fail(404,'سفارش یافت نشد.');
 const events=db.audit.filter(e=>(e.entityType==='order'&&e.entityId===order.id)||(e.entityType==='order_item'&&e.details?.orderId===order.id)).map(e=>({seq:e.seq,action:e.action,username:e.username,createdAt:e.createdAt,details:Object.fromEntries(['invoiceNumber','reason','scheduledAt','deliveryDate','dispatchPlace','itemCount','requestedQty','requestedUnit','total','totalAmount','run'].filter(k=>e.details?.[k]!=null).map(k=>[k,e.details[k]]))})).sort((a,b)=>(a.seq||0)-(b.seq||0));
 return {status:200,body:{order:summary(indexes(db),order),events}};
});

// مدیر سامانه: پروندهٔ کامل یک سفارش و تمام رخدادهای مرتبط از مراجعه/ثبت تا پایان کار.
// v37.50.0 — فهرست سوابق سفارش برای کارتابل مدیر: بدون محدودیت بازهٔ کاری،
// با جستجو و صفحه‌بندی. هر ردیف نوع سفارش، مشتری/فروشگاه، ثبت‌کننده و وضعیت را دارد
// و «جزئیات سفارش» به پروندهٔ کامل با کاربران هر مرحله می‌رسد.
route('GET','/api/admin/orders',{roles:['admin']},async ctx=>{
 const db=store.get(),idx=indexes(db),q=String(ctx.query.get('q')||'').trim().toLowerCase().slice(0,80);
 const {queryOrders,pagination}=require('../order-search'),{limit,offset}=pagination(ctx.query,100,25);
 const page=queryOrders({q,limit,offset,history:true});
 const users=new Map(db.users.map(u=>[u.id,u]));
 const typeLabels={ONSITE:'حضوری',REMOTE:'غیرحضوری',STORE:'فروشگاهی'};
 const rows=page.orders.map(o=>{
  const row=summary(idx,o),owner=users.get(o.createdBy);
  const completed=idx.visits.get(o.visitId),customer=idx.customers.get(o.customerId||completed?.customerId);
  return {...row,
   name:row.customerName,
   phone:customer?.phone||row.phone||'',
   orderTypeLabel:typeLabels[o.orderType]||o.orderType||'—',
   createdByName:owner?.fullName||owner?.username||'—',
   warehouseCompletedAt:o.warehouseCompletedAt||null,
  };
 });
 return {status:200,body:{total:page.total,offset,limit,orders:rows}};
});
route('GET','/api/admin/orders/:id/history',{roles:['admin']},async ctx=>{
 const db=store.get(),order=db.orders.find(o=>o.id===ctx.params.id);if(!order)fail(404,'سفارش یافت نشد.');
 const idx=indexes(db),users=new Map(db.users.map(u=>[u.id,u])),customer=idx.customers.get(order.customerId||idx.visits.get(order.visitId)?.customerId)||null;
 const userOf=(id,fallback='')=>{if(!id)return fallback?{name:fallback,username:fallback}:null;const u=users.get(id);return{id,name:u?.fullName||u?.username||fallback||'—',username:u?.username||fallback||''};};
 const itemRows=db.orderItems.filter(i=>i.orderId===order.id),itemIds=new Set(itemRows.map(i=>i.id));
 const paymentRows=idx.payments.get(order.id)||[],paymentIds=new Set(paymentRows.map(p=>p.id));
 const events=db.audit.filter(e=>
  (e.entityType==='order'&&e.entityId===order.id)
  ||(e.entityType==='order_item'&&(e.details?.orderId===order.id||itemIds.has(e.entityId)))
  ||(e.entityType==='payment'&&(paymentIds.has(e.entityId)||e.details?.orderId===order.id))
  ||(e.entityType==='visit'&&!!order.visitId&&e.entityId===order.visitId)
  ||e.details?.orderId===order.id
 ).sort((a,b)=>Number(a.seq||0)-Number(b.seq||0)||String(a.createdAt||'').localeCompare(String(b.createdAt||''))).map(e=>({
  id:e.id||'',seq:e.seq||0,action:e.action||'',entityType:e.entityType||'',entityId:e.entityId||'',createdAt:e.createdAt||null,
  username:e.username||'',actor:userOf(e.userId,e.username||'سامانه'),details:e.details||{},
 }));
 const productNames=new Map(db.products.map(p=>[p.id,p.name||'—']));
 const items=itemRows.map(i=>({
  id:i.id,productId:i.productId||'',productName:productNames.get(i.productId)||'—',requestedQty:i.requestedQty??null,requestedUnit:i.requestedUnit||'',
  description:i.description||'',itemStatus:i.itemStatus||'',warehouseStatus:i.warehouseStatus||'',deliveredKg:i.deliveredKg??null,
  unitPrice:i.unitPrice??null,finalAmount:i.finalAmount??null,runR1:Array.isArray(i.runR1)?i.runR1:[],runR2:Array.isArray(i.runR2)?i.runR2:[],
  // توضیح انبار برای واحد فروش؛ فقط خواندنی و همراه با ثبت‌کننده و زمان.
  warehouseNote:i.warehouseNote||'',warehouseNoteByName:i.warehouseNoteByName||'',warehouseNoteAt:i.warehouseNoteAt||null,
 }));
 const customerProfile=customer?Object.fromEntries(['id','code','name','phone','phone2','nationalId','company','district','address','plate','vehicleType','carType','notes','createdAt','lastVisitAt'].map(k=>[k,customer[k]??''])):{name:order.customerName||'',phone:order.customerPhone||''};
 const visit=idx.visits.get(order.visitId);
 const typeLabel=({ONSITE:'حضوری',REMOTE:'غیرحضوری',STORE:'فروشگاهی'})[order.orderType]||order.orderType||'—';
 const orderDetails={
  id:order.id,orderNo:order.orderNo||'—',orderType:order.orderType||'',orderTypeLabel:typeLabel,status:order.status||'',source:order.source||'',
  createdAt:order.createdAt||null,createdBy:userOf(order.createdBy)||events.find(e=>['CREATE_ORDER','CREATE_REMOTE_ORDER','CREATE_STORE_ORDER'].includes(e.action))?.actor||null,
  // v37.50.0 — پروندهٔ کامل مدیر: تخصیص ترابری و کاربر هر مرحلهٔ انبار/ارسال هم برمی‌گردد.
  statusAtCreation:order.statusAtCreation||'',warehouseReturn:order.warehouseReturn?{reason:order.warehouseReturn.reason||'',at:order.warehouseReturn.at||null}:null,
  transportAssignments:Object.fromEntries(Object.entries(order.transportAssignments||{}).map(([run,a])=>[run,{run:Number(run),driverName:a?.driverName||'',driverPhone:a?.driverPhone||'',vehicleType:a?.vehicleType||'',vehiclePlate:a?.vehiclePlate||'',assignedAt:a?.assignedAt||null,assignedBy:userOf(a?.assignedBy)}])),
  transportHandoverAt:Object.values(order.transportHandovers||{})[0]?.handedOverAt||null,
  salesFinalizedAt:order.dispatch?.salesFinalizedAt||null,deliveredAt:order.dispatch?.deliveredAt||null,exitedAt:order.exitedAt||null,closedAt:order.closedAt||null,
  updatedAt:order.updatedAt||null,storeName:order.orderType==='STORE'?require('../store-name').storeDisplayName(order.storeName,order.branchNo):(order.storeName||''),
  branchNo:order.branchNo??null,storeOrderKind:order.storeOrderKind||'',storePurpose:order.storePurpose||'',
  deliveryMode:order.deliveryMode||'',scheduledDate:order.scheduledDate||null,scheduledAt:order.scheduledAt||null,deliveryDate:order.deliveryDate||null,
  dispatchPlace:order.dispatchPlace||'',notes:order.notes||'',warehouseDocumentNo:order.warehouseDocumentNo||'',
  warehouseAcceptedAt:order.warehouseAcceptedAt||null,warehouseAcceptedBy:userOf(order.warehouseAcceptedBy),
  warehousePreparationStartedAt:order.warehousePreparationStartedAt||null,warehousePreparationStartedBy:userOf(order.warehousePreparationStartedBy),
  warehouseCompletedAt:order.warehouseCompletedAt||null,warehouseCompletedBy:userOf(order.warehouseCompletedBy||order.storeRunOps?.finalizedBy),
  completedAt:order.closedAt||order.exitedAt||order.dispatch?.salesFinalizedAt||order.dispatch?.deliveredAt||order.warehouseCompletedAt||null,
 };
 const visitDetails=visit?{id:visit.id,status:visit.status||'',purpose:visit.purpose||'',district:visit.district||'',plate:visit.plate||'',vehicleType:visit.vehicleType||'',carType:visit.carType||'',createdAt:visit.createdAt||null,createdBy:userOf(visit.createdBy)}:null;
 return {status:200,body:{order:{...summary(idx,order),...orderDetails,customer:customerProfile,visit:visitDetails},items,events}};
});
