'use strict';
// Explicit allow-list: the gate verifies cargo, never prices, payments or signatures.
module.exports=function gateOrderView(o){
 const customer=o.customer||{},visit=o.visit||{},storeName=o.orderType==='STORE'?require('./store-name').storeDisplayName(o.storeName,o.branchNo):o.storeName;
 return {id:o.id,orderNo:o.orderNo,orderType:o.orderType,status:o.status,createdAt:o.createdAt,updatedAt:o.updatedAt,exitedAt:o.exitedAt,warehouseCompletedAt:o.warehouseCompletedAt,storeName,storeOrderKind:o.storeOrderKind,
 customer:{name:customer.name,phone:customer.phone,plate:customer.plate},visit:{id:visit.id,status:visit.status,recipient:visit.recipient},
 items:(o.items||[]).map(i=>({id:i.id,itemStatus:i.itemStatus,product:{name:i.product?.name||i.productName||'—'},deliveredKg:i.deliveredKg})),
 dispatch:o.dispatch?{run:o.dispatch.run,status:o.dispatch.status,driverName:o.dispatch.driverName,driverPhone:o.dispatch.driverPhone,driverPlate:o.dispatch.driverPlate,vehicleType:o.dispatch.vehicleType,driverExitAt:o.dispatch.driverExitAt,gateExitAt:o.dispatch.gateExitAt,gateExitBy:o.dispatch.gateExitBy}:null};
};
