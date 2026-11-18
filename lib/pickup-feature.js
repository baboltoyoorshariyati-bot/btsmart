'use strict';
// Available by default. The explicit compatibility switch is for rollback
// testing, not routine configuration. Never strand an in-flight pickup when it
// is set: keep the workflow reachable until all managed orders/visits finish.
function enabled(){
 if(process.env.BT_PICKUP_STAGING!=='false' && process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW!=='0')return true;
 const db=require('./store').get();
 if(!db)return false;
 return db.orders.some(o=>o.orderType==='REMOTE'&&o.deliveryMode==='PICKUP'&&o.pickupWorkflow===1&&(!['EXITED','CANCELLED'].includes(o.status)||o.pickupCancellation?.status==='EXIT_APPROVED')) ||
  db.visits.some(v=>v.status==='PICKUP_PRESENT'&&v.orderId);
}
module.exports={enabled};
