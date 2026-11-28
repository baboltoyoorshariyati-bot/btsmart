'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {counts}=require('../lib/workload-queues');
const {pendingWork,plannedWork}=require('../lib/transport-planning');

test('صف‌های مستقل انبار پایان کار فروشگاه را می‌فهمند و موارد صفر جایگزین نمی‌شوند',()=>{
 const orders=Array.from({length:10},(_,i)=>({id:'s'+i,orderType:'STORE',status:'WAREHOUSE_PREPARING',storeRunOps:{finalizedAt:'2026-01-01'}}));
 const db={orders,visits:[]};let c=counts(db);assert.equal(c.warehousePreparingRegular,0);assert.equal(c.warehouseStores,0);assert.equal(c.warehouseActionable,0);
 orders.push({id:'a',orderType:'REMOTE',status:'WAREHOUSE_PENDING'},{id:'b',orderType:'ONSITE',status:'WAREHOUSE_PREPARING'},{id:'c',orderType:'STORE',status:'WAREHOUSE_PREPARING'});
 c=counts(db);assert.equal(c.warehouseIncomingRegular,1);assert.equal(c.warehousePreparingRegular,1);assert.equal(c.warehouseStores,1);assert.equal(c.warehouseActionable,3);
 orders.find(o=>o.id==='b').status='SETTLEMENT_PENDING';orders.find(o=>o.id==='c').storeRunOps={finalizedAt:'2026-01-01'};
 c=counts(db);assert.equal(c.warehousePreparingRegular,0);assert.equal(c.warehouseStores,0);assert.equal(c.warehouseActionable,1);
});

test('نگهبانی: مراجعه و سفارش یک تحویل فقط یک بار و فقط در صورت آماده بودن شمرده می‌شود',()=>{
 const db={visits:[{id:'v',orderId:'p',status:'PICKUP_PRESENT'},{id:'x',status:'CANCELLED_EXIT_PENDING'}],orders:[{id:'p',orderType:'REMOTE',deliveryMode:'PICKUP',visitId:'v',status:'SETTLED',pickupHandover:{}},{id:'r',orderType:'ONSITE',status:'SETTLED'}]};
 assert.equal(counts(db,{pickupEnabled:true}).gateExit,3);
 db.orders[0].pickupCancellation={status:'EXIT_APPROVED'};assert.equal(counts(db,{pickupEnabled:true}).gateExit,3);
 db.orders[0].status='EXITED';db.orders[0].pickupCancellation.status='DONE';assert.equal(counts(db,{pickupEnabled:true}).gateExit,2);
 db.orders[0].status='SETTLED';db.orders[0].pickupHandover=null;assert.equal(counts(db,{pickupEnabled:true}).gateExit,2);
});

test('ترابری با تخصیص یا تحویل فیزیکی، کار منتظر تخصیص را تمام‌شده می‌شمارد',()=>{
 const order={id:'x',orderType:'REMOTE',deliveryMode:'DELIVERY',transportWorkflow:1,status:'WAREHOUSE_PENDING'},db={orders:[order],orderItems:[]};
 assert.equal(pendingWork(db),1);order.transportAssignments={'0':{driverId:'d'}};assert.equal(pendingWork(db),0);
 order.status='SETTLEMENT_PENDING';order.transportHandovers={'0':{physicalHandoverConfirmed:true}};order.transportInvoice={status:'PREPARED'};assert.equal(pendingWork(db),0);
 delete order.transportAssignments;assert.equal(pendingWork(db),0);order.status='CLOSED';assert.equal(pendingWork(db),0);
});

test('صف ترابری به ازای سرویس فعال شمرده می‌شود و پس از خروج کم می‌شود',()=>{
 const o={id:'s',orderType:'STORE',transportWorkflow:1,deliveryMode:'DELIVERY',status:'WAREHOUSE_PREPARING'},db={orders:[o],orderItems:[]};
 assert.equal(plannedWork(db),1);assert.equal(pendingWork(db),1);db.orderItems.push({orderId:'s',movedToR2:true});assert.equal(plannedWork(db),2);assert.equal(pendingWork(db),2);
 o.transportAssignments={'1':{driverName:'قدیمی'}};assert.equal(pendingWork(db),1);o.transportStoreTrips={'1':{status:'IN_TRANSIT'}};assert.equal(plannedWork(db),1);
 o.transportHandovers={'2':{physicalHandoverConfirmed:true}};assert.equal(pendingWork(db),0);o.transportStoreTrips['2']={status:'CLOSED'};assert.equal(plannedWork(db),0);
});

test('دریافت صفحه‌بندی صف بیش از صد ردیف همه نتایج را می‌خواند',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),src=fs.readFileSync('ui-src/app/08-sales-cache-navigation.js','utf8');const calls=[];
 const entries=Array.from({length:241},(_,i)=>({id:String(i)}));
 const c=vm.createContext({api:async url=>{calls.push(url);const q=new URL('http://test'+url).searchParams,offset=Number(q.get('offset'));return {visits:entries.slice(offset,offset+100),total:entries.length};},URL});
 vm.runInContext(src.slice(0,src.indexOf('async function fetchSalesCache')),c);const result=await c.fetchPagedList('/api/visits?status=WAITING_SALES','visits');assert.equal(result.visits.length,241);assert.equal(calls.length,3);
});
