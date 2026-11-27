'use strict';
// New transport planning data is stored on the order, not in a second queue.
// Therefore the warehouse and transport views derive from one persisted order.
// Available without manual configuration. An explicit 0 is a safety switch.
function enabled(){return process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW!=='0';}
function assertEnabled(){if(!enabled())throw Object.assign(new Error('گردش جدید پخش هنوز فعال نشده است.'),{status:503});}
const MODES=Object.freeze({DELIVERY:'DELIVERY',PICKUP:'PICKUP'});
function deliveryFields(body,orderType,deposit){
  if(!enabled()){
    if(body?.transportWorkflow===true)assertEnabled();
    return {}; // emergency compatibility for the legacy workflow
  }
  if(body?.transportWorkflow===false)throw Object.assign(new Error('ثبت سفارش جدید در مسیر قدیمی مجاز نیست.'),{status:409});
  const deliveryMode=orderType==='STORE'?MODES.DELIVERY:String(body?.deliveryMode||'');
  if(!Object.values(MODES).includes(deliveryMode))throw Object.assign(new Error('روش تحویل را انتخاب کنید: ارسال توسط پخش یا تحویل در انبار.'),{status:400});
  if(deliveryMode===MODES.DELIVERY&&deposit)throw Object.assign(new Error('سفارش دارای بیعانه قابل ارسال توسط پخش نیست.'),{status:409});
  return {deliveryMode,transportWorkflow:1,transportAssignments:{}};
}
function assignment(order,run,driver,vehicle,actor,now){
  if(order.transportWorkflow!==1||order.deliveryMode!==MODES.DELIVERY)throw Object.assign(new Error('این سفارش در مسیر جدید پخش نیست.'),{status:409});
  if(!['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','SETTLEMENT_PENDING'].includes(order.status))throw Object.assign(new Error('سفارش در وضعیت قابل تخصیص نیست.'),{status:409});
  if(order.orderType==='STORE'?!require('./store-order-kind').allowedRuns(order).includes(run):run!==0)throw Object.assign(new Error('شماره سرویس معتبر نیست.'),{status:400});
  if(!driver||driver.isActive===false||!vehicle||vehicle.kind!=='fleet'||vehicle.isActive===false)throw Object.assign(new Error('راننده و خودرو باید فعال و معتبر باشند.'),{status:400});
  const key=String(run),old=order.transportAssignments?.[key];
  if(order.transportHandovers?.[key])throw Object.assign(new Error('پس از تحویل فیزیکی انبار، تغییر تخصیص مجاز نیست.'),{status:409});
  if(old?.departedAt)throw Object.assign(new Error('تغییر راننده یا خودرو پس از خروج مجاز نیست.'),{status:409});
  if(old&&old.driverId===driver.id&&old.vehicleId===vehicle.id)return order.transportAssignments;
  return {...(order.transportAssignments||{}),[key]:{driverId:driver.id,driverName:driver.fullName,driverPhone:driver.phone||'',vehicleId:vehicle.id,vehicleType:vehicle.vehicleType,vehiclePlate:vehicle.plate,assignedAt:now,assignedBy:actor.id}};
}
function handoverToken(order,run,document){
  return require('node:crypto').createHash('sha256').update(JSON.stringify({run,assignment:order.transportAssignments?.[String(run)]||null,document})).digest('hex');
}
function activeAssignments(db){
  return (db.orders||[]).filter(o=>o.transportWorkflow===1&&o.deliveryMode===MODES.DELIVERY&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','SETTLEMENT_PENDING'].includes(o.status)).flatMap(o=>Object.values(o.transportAssignments||{}));
}
function driverHasPlanningHistory(db,id){
  return (db.orders||[]).some(o=>Object.values(o.transportAssignments||{}).some(a=>a.driverId===id)||Object.values(o.transportHandovers||{}).some(h=>h.driverId===id)||(o.transportAssignmentHistory||[]).some(a=>a.driverId===id)) || (db.audit||[]).some(a=>a.action==='TRANSPORT_PLAN_ASSIGNED'&&a.details?.driverId===id);
}
// Workload counts only actionable services, not unread notifications. A second
// store service exists after items move to it (or it was already allocated).
function activePlanningOrders(db){return (db.orders||[]).filter(o=>o.transportWorkflow===1&&o.deliveryMode===MODES.DELIVERY&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','SETTLEMENT_PENDING'].includes(o.status));}
function actualRuns(db,o){
 const second=o.orderType==='STORE'&&((db.orderItems||[]).some(i=>i.orderId===o.id&&i.itemStatus!=='CANCELLED'&&i.movedToR2&&!i.shortageClosed)||o.transportAssignments?.['2']||o.transportHandovers?.['2']||o.storeRunOps?.r2Shipment);
 return o.orderType==='STORE'?(second&&require('./store-order-kind').allowedRuns(o).includes(2)?[1,2]:[1]):[0];
}
function plannedWork(db){
 return activePlanningOrders(db).reduce((total,o)=>total+actualRuns(db,o).filter(run=>run?!o.transportStoreTrips?.[String(run)]:!o.transportDeparture).length,0);
}
function pendingWork(db){
 return activePlanningOrders(db).reduce((total,o)=>{
  return total+actualRuns(db,o).filter(run=>{
   const key=String(run),a=o.transportAssignments?.[key],h=o.transportHandovers?.[key],assigned=!!(a&&(a.driverId||a.driverName)),hand=!!(h&&(h.physicalHandoverConfirmed||h.signedPaperConfirmed));
   const departed=run?!!o.transportStoreTrips?.[key]:!!o.transportDeparture;
   if(departed)return false;
   // Once assigned or physically handed over, the dispatch assignment task is
   // complete; a prepared invoice waits for the gate, not transport.
   return !assigned && !hand;
  }).length;
 },0);
}
module.exports={MODES,enabled,deliveryFields,assignment,assertEnabled,handoverToken,activeAssignments,driverHasPlanningHistory,pendingWork,plannedWork,actualRuns};
