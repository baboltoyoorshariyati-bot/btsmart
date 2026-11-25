'use strict';
// Counts of actionable queues. Historical totals and unread notifications are
// deliberately separate from these numbers.
function counts(db, { pickupEnabled = false } = {}) {
  const orders=db.orders||[],visits=db.visits||[];
  const present=new Map(visits.filter(v=>v.status==='PICKUP_PRESENT').map(v=>[v.id,v]));
  const activePickup=o=>pickupEnabled && o.orderType==='REMOTE' && o.deliveryMode==='PICKUP' && o.visitId && present.get(o.visitId)?.orderId===o.id;
  let gateExit=visits.filter(v=>v.status==='CANCELLED_EXIT_PENDING').length;
  let early=0,cancelReturns=0,incomingRegular=0,preparingRegular=0,stores=0;
  for(const o of orders){
    const pickup=activePickup(o);
    if(pickup){
      if(o.pickupCancellation?.status==='EXIT_APPROVED'||(o.status==='SETTLED'&&o.pickupHandover))gateExit++;
      if(['SCHEDULED_REMOTE','RETURNED_TO_SALES'].includes(o.status)&&!o.pickupCancellation)early++;
    } else if(o.status==='SETTLED'&&!o.dispatch) gateExit++;
    if(o.status==='CANCEL_RETURN_PENDING'&&o.settlementCancellation?.status==='PENDING_WAREHOUSE')cancelReturns++;
    if(o.orderType==='STORE'){
      if(o.status==='WAREHOUSE_PENDING'||(o.status==='WAREHOUSE_PREPARING'&&!o.storeRunOps?.finalizedAt))stores++;
    }else{
      if(o.status==='WAREHOUSE_PENDING')incomingRegular++;
      if(o.status==='WAREHOUSE_PREPARING')preparingRegular++;
    }
  }
  incomingRegular+=early+cancelReturns;
  return {gateExit,warehouseIncomingRegular:incomingRegular,warehousePreparingRegular:preparingRegular,warehouseStores:stores,warehouseActionable:incomingRegular+preparingRegular+stores};
}
module.exports={counts};
