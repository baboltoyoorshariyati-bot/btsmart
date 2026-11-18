'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {serviceDocument,warehouseServiceDocument}=require('../lib/store-run-print');
test('سند قدیمی فقط خالص موجود را نشان می‌دهد و وزن ارسالی ناشناخته را اختراع نمی‌کند',()=>{
 const order={id:'o',orderType:'STORE',storeName:'فروشگاه'};
 const db={orderItems:[],payments:[{orderId:'o',deliveryRun:1,priceLines:[{productName:'مرغ',deliveredKg:3,returnKg:4}]}]};
 const doc=serviceDocument(db,order,1,()=>null);
 assert.deepEqual(doc.lines,[{productName:'مرغ',deliveredKg:null,returnKg:4,shortageKg:null,netKg:3}]);
 assert.equal(serviceDocument(db,order,2,()=>null),null);
 const wh=warehouseServiceDocument(db,order,1,()=>null);assert.equal(wh.lines[0].deliveredKg,null);assert.equal(wh.lines[0].requestedQty,null);assert.equal(wh.driverStatus,'UNKNOWN');assert.equal(wh.driverName,'');
});

test('partial warehouse document carries the specific customer and preserves its snapshot',()=>{
 const order={id:'o',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'CUSTOMER',customerId:'c',storeName:'حمزه کلا',transportWorkflow:1,transportAssignments:{'1':{driverName:'راننده'}},storeRunOps:{r1Shipment:{itemIds:['i'],weights:{i:2}}}};
 const db={customers:[{id:'c',name:'مشتری مشخص'}],payments:[],orderItems:[{id:'i',orderId:'o',productId:'p',runR1:[{kg:2}]}]};
 const doc=warehouseServiceDocument(db,order,1,()=>({name:'مرغ'}));assert.equal(doc.customerName,'مشتری مشخص');
 order.transportHandovers={'1':{document:doc}};db.customers[0].name='نام جدید';assert.equal(warehouseServiceDocument(db,order,1,()=>null).customerName,'مشتری مشخص');
 delete order.transportHandovers;order.storePurpose='STOCK';assert.equal(warehouseServiceDocument(db,order,1,()=>null).customerName,'');
});
