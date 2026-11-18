'use strict';
const SR=require('./store-runs');
// End only after warehouse completion AND the explicit return of documents for
// every actual service. Never create a payment or a debt for a store order.
function canClose(db,order){
 if(order.transportWorkflow!==1||order.orderType!=='STORE'||!order.storeRunOps?.finalizedAt)return false;
 const items=db.orderItems.filter(i=>i.orderId===order.id&&SR.ACTIVE(i));
 if(!items.length||items.some(i=>SR.itemBlocksClose(order,i)))return false;
 const shipments=[1,2].filter(run=>SR.runShipmentOf(order,run));
 return shipments.length>0&&shipments.every(run=>order.transportStoreTrips?.[String(run)]?.status==='CLOSED');
}
function closeIfReady(db,order,now){
 if(!canClose(db,order)||order.status==='CLOSED')return false;
 Object.assign(order,{status:'CLOSED',transportClosedAt:now,updatedAt:now});return true;
}
module.exports={canClose,closeIfReady};
