'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),SR=require('../lib/store-runs');
test('restart selects an available service but never deletes a sent weight',()=>{
 const order={orderType:'STORE',status:'WAREHOUSE_PREPARING',storeRunOps:{}},item={id:'i',runCompleted:{at:'x'},runR1:[{kg:2}],runR2:[{kg:3}],movedToR2:{at:'x'}};
 assert.equal(SR.completionReopenRun(order,item),1);
 order.storeRunOps.r1Shipment={status:'PENDING_SALES',itemIds:['other'],weights:{other:1}};order.transportHandovers={'1':{physicalHandoverConfirmed:true}};assert.equal(SR.completionReopenRun(order,item),2);
 item.sentRun1={at:'x'};assert.equal(SR.completionReopenRun(order,item),null);delete item.sentRun1;
 order.storeRunOps.r1Shipment.weights.i=2;assert.equal(SR.completionReopenRun(order,item),null);delete order.storeRunOps.r1Shipment.weights.i;
 order.transportHandovers['2']={physicalHandoverConfirmed:true};assert.equal(SR.completionReopenRun(order,item),null);delete order.transportHandovers['2'];
 order.storeOrderKind='PARTIAL';assert.equal(SR.completionReopenRun(order,item),null);order.status='CLOSED';assert.equal(SR.completionReopenRun(order,item),null);
});
