'use strict';
const { atomicRoute: route,fail}=require('../http');
const store=require('../store');
const {activateDueRemoteOrders,createNotification,getProduct}=require('../domain');
const {assignment,assertEnabled}=require('../transport-planning');
function requireExperimental(){try{assertEnabled();}catch(e){fail(e.status||503,e.message);}}
const READ={roles:['admin','dispatch']};
// Capability discovery avoids treating the intentionally disabled feature as a server failure.
route('GET','/api/transport/capabilities',READ,()=>({body:{experimentalWorkflow:require('../transport-planning').enabled()}}));
function serviceViews(o,db){
 return (o.orderType==='STORE'?require('../store-order-kind').allowedRuns(o):[0]).map(run=>{
  const key=String(run),hand=o.transportHandovers?.[key],trip=o.transportStoreTrips?.[key],departure=o.transportDeparture,invoice=o.transportInvoice;
  const handedOver=!!(hand?.physicalHandoverConfirmed||hand?.signedPaperConfirmed);
  const departed=o.orderType==='STORE'?!!trip:!!departure;
  const active=require('../transport-planning').actualRuns(db,o).includes(run)&&!departed;
  return {run,active,actionable:active&&!o.transportAssignments?.[key]?.driverId&&!o.transportAssignments?.[key]?.driverName&&!handedOver,assignment:o.transportAssignments?.[key]||null,handedOver,departed,tripStatus:trip?.status||null,invoiceNumber:run===0&&invoice?.status==='PREPARED'?invoice.invoiceNumber:null,warehouseDocumentNo:hand?.document?.warehouseDocumentNo||null,canDepart:false,awaitingGate:handedOver&&!departed&&run===0&&o.status==='SETTLEMENT_PENDING'&&invoice?.status==='PREPARED',salesReviewed:!!o.transportStoreReviews?.[key]};
 });
}
route('GET','/api/transport/plans',READ,()=>{
 requireExperimental();activateDueRemoteOrders();const db=store.get();
 const items=new Map();for(const i of db.orderItems){if(i.itemStatus==='CANCELLED')continue;if(!items.has(i.orderId))items.set(i.orderId,[]);items.get(i.orderId).push({productName:getProduct(i.productId)?.name||'—',requestedQty:i.requestedQty,requestedUnit:i.requestedUnit});}
 const customers=new Map(db.customers.map(c=>[c.id,c]));
 const orders=db.orders.filter(o=>o.transportWorkflow===1&&o.deliveryMode==='DELIVERY'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','SETTLEMENT_PENDING'].includes(o.status)).map(o=>({id:o.id,orderNo:o.orderNo,orderType:o.orderType,storeOrderKind:o.storeOrderKind,customerName:o.orderType==='STORE'?require('../store-name').storeDisplayName(o.storeName,o.branchNo):customers.get(o.customerId)?.name||'—',dispatchPlace:o.dispatchPlace||'',createdAt:o.createdAt,warehouseStatus:o.status,assignments:o.transportAssignments||{},services:serviceViews(o,db),items:items.get(o.id)||[]}));
 return {body:{orders}};
});
route('POST','/api/transport/plans/:id/assign',{roles:['admin','dispatch'],idempotent:true},ctx=>require('../transport-transaction')(()=>{
 requireExperimental();const db=store.get(),order=db.orders.find(o=>o.id===ctx.params.id);if(!order)fail(404,'سفارش یافت نشد.');
 const run=Number(ctx.body.run??0),driver=db.drivers.find(d=>d.id===String(ctx.body.driverId||''));
 const vehicleId=driver?.vehicleId||'',requestedVehicle=String(ctx.body.vehicleId||'');
 if(!driver||driver.isActive===false)fail(400,'راننده فعال و معتبر انتخاب کنید.');
 if(!vehicleId||requestedVehicle&&requestedVehicle!==vehicleId)fail(409,'خودروی انتخاب‌شده با خودروی فعلی راننده در خودروهای پخش مطابقت ندارد؛ فهرست را به‌روزرسانی کنید.');
 const vehicle=db.vehicles.find(v=>v.id===vehicleId&&v.kind==='fleet'&&v.isActive!==false);
 if(!vehicle)fail(409,'برای این راننده خودروی فعال در خودروهای پخش تعیین نشده است.');
 let next;try{next=assignment(order,run,driver,vehicle,ctx.user,store.nowIso());}catch(e){fail(e.status||400,e.message);}
 if(next!==order.transportAssignments){const previous=order.transportAssignments?.[String(run)];if(previous)order.transportAssignmentHistory=[...(order.transportAssignmentHistory||[]),{run,...previous,replacedAt:store.nowIso(),replacedBy:ctx.user.id}];order.transportAssignments=next;order.updatedAt=store.nowIso();store.audit(ctx.user,'TRANSPORT_PLAN_ASSIGNED','order',order.id,{run,driverId:driver.id,driverName:driver.fullName,vehicleId:vehicle.id,vehiclePlate:vehicle.plate},ctx);createNotification('warehouse','TRANSPORT_ASSIGNED','order',order.id,`راننده و خودروی سفارش ${order.orderNo||'—'} تعیین شد.`,{run});createNotification('sales','TRANSPORT_ASSIGNED','order',order.id,`راننده و خودروی سفارش ${order.orderNo||'—'} تعیین شد.`,{run});}
 return {body:{assignment:order.transportAssignments[String(run)]}};
}));
