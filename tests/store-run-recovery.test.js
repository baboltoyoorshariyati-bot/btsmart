'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {recoverUnsentStoreRuns}=require('../lib/store-run-recovery');
test('ترمیم محدود پایان زودهنگام فقط برای سفارش باز و قابل ارسال و با حفظ سابقه',()=>{
 const mk=(id,status='WAREHOUSE_PREPARING',ship={status:'PENDING_SALES'})=>({id,orderType:'STORE',status,warehouseCompletedAt:'t',warehouseCompletedBy:'u',storeRunOps:{finalizedAt:'t',finalizedBy:'u',r1Shipment:{status:'DONE'},r2Shipment:ship}});
 const db={orders:[mk('a'),mk('closed','CLOSED'),mk('assigned','WAREHOUSE_PREPARING',{status:'ASSIGNED'}),mk('good')],orderItems:[]};
 for(const o of db.orders)db.orderItems.push({id:o.id+'i',orderId:o.id,itemStatus:'DELIVERED',runR2:[{kg:15}],sentRun2:o.id==='good'?{at:'t'}:null});
 const changes=[];assert.equal(recoverUnsentStoreRuns(db,(o,details)=>changes.push({id:o.id,details})),1);
 assert.equal(db.orders[0].storeRunOps.finalizedAt,null);assert.equal(db.orders[0].warehouseCompletedAt,null);
 assert.equal(changes[0].details.previous.finalizedAt,'t');assert.equal(changes[0].details.unsent[0].itemId,'ai');
 for(const o of db.orders.slice(1))assert.equal(o.storeRunOps.finalizedAt,'t');
 assert.equal(recoverUnsentStoreRuns(db,()=>assert.fail()),0);
});
