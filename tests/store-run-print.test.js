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

test('order contact takes precedence over an old profile and handover snapshots stay immutable',()=>{
 const order={id:'o',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'CUSTOMER',customerId:'c',customerName:'تماس سفارش',customerPhone:'09121117777',storeName:'فروشگاه',transportWorkflow:1,transportAssignments:{'1':{driverName:'راننده'}},storeRunOps:{r1Shipment:{itemIds:['i'],weights:{i:2}}}};
 const db={customers:[{id:'c',name:'پرونده قدیمی',phone:'09121112233'}],payments:[],orderItems:[{id:'i',orderId:'o',productId:'p',runR1:[{kg:2}]}]};
 const doc=warehouseServiceDocument(db,order,1,()=>({name:'مرغ'}));assert.equal(doc.customerName,'تماس سفارش');
 order.transportHandovers={'1':{document:doc}};order.customerName='نام بعدی';assert.equal(warehouseServiceDocument(db,order,1,()=>null).customerName,'تماس سفارش');
 delete order.transportHandovers;delete order.customerName;delete order.customerPhone;assert.equal(warehouseServiceDocument(db,order,1,()=>null).customerName,'پرونده قدیمی');
});

test('partial document keeps individual request rows in immutable handover snapshot',()=>{
 const items=[{id:'i1',orderId:'o',productId:'p',requestedQty:5,requestedUnit:'کیلوگرم',runR1:[{kg:2},{kg:3}]},{id:'i2',orderId:'o',productId:'q',requestedQty:1,requestedUnit:'کیلوگرم',runR1:[{kg:1}]}];
 const order={id:'o',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',storeName:'فروشگاه',transportWorkflow:1,transportAssignments:{'1':{driverName:'راننده'}},storeRunOps:{r1Shipment:{itemIds:['i1','i2'],weights:{i1:5,i2:1}}},storeAdditionRequests:[{status:'ACCEPTED',items:[{productId:'p',productName:'مرغ',requestedQty:2,requestedUnit:'کیلوگرم'}],changes:[{itemId:'i1',productId:'p',before:3,added:2,after:5}]}]};
 const db={customers:[],payments:[],orderItems:items};const doc=warehouseServiceDocument(db,order,1,()=>({name:'مرغ'}));
 assert.deepEqual(doc.requestRows.map(r=>[r.itemId,r.requestedQty,r.source]),[['i1',3,'ORIGINAL'],['i1',2,'ADDITION'],['i2',1,'ORIGINAL']]);assert.equal(doc.lines.length,2);assert.equal(doc.lines[0].deliveredKg,5);
 order.transportHandovers={'1':{document:structuredClone(doc)}};order.storeAdditionRequests[0].items[0].requestedQty=90;items[0].requestedQty=99;
 const saved=warehouseServiceDocument(db,order,1,()=>({name:'تغییر یافته'}));assert.equal(saved.requestRows[1].requestedQty,2);assert.equal(saved.requestRows[0].productName,'مرغ');
});

test('older snapshots can expose recorded accepted request rows without rewriting the snapshot',()=>{
 const saved={orderId:'o',lines:[{itemId:'i',productId:'p',productName:'نام هنگام تحویل',deliveredKg:4}]};
 const order={id:'o',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',transportWorkflow:1,transportHandovers:{'1':{document:saved}},storeAdditionRequests:[{status:'ACCEPTED',items:[{productId:'p',productName:'نام درخواست',requestedQty:2,requestedUnit:'کیلوگرم'}],changes:[{itemId:'i',productId:'p',before:3,added:2,after:5}]}]};
 const db={orderItems:[{id:'i',orderId:'o',productId:'p',requestedQty:5,requestedUnit:'کیلوگرم'}],payments:[]};
 const doc=warehouseServiceDocument(db,order,1,()=>({name:'نام تازه'}));assert.deepEqual(doc.requestRows.map(x=>x.requestedQty),[3,2]);assert.equal(doc.requestRows[0].productName,'نام هنگام تحویل');assert.equal(saved.requestRows,undefined);
});

test('old snapshot recovery prefers the handed-over item identity over later edits',()=>{
 const order={id:'o',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',transportWorkflow:1,transportHandovers:{'1':{document:{lines:[{itemId:'i',productId:'p',productName:'نام هنگام تحویل',requestedQty:5,requestedUnit:'عدد',deliveredKg:4}]}}},storeAdditionRequests:[{status:'ACCEPTED',items:[{productId:'p',productName:'نام درخواست',requestedQty:2,requestedUnit:'عدد'}],changes:[{itemId:'i',before:3,added:2,after:5}]}]};
 const db={orderItems:[{id:'i',orderId:'o',productId:'q',requestedQty:50,requestedUnit:'کارتن'}],payments:[]};
 assert.deepEqual(warehouseServiceDocument(db,order,1,()=>({name:'جدید'})).requestRows.map(r=>[r.productName,r.requestedQty,r.requestedUnit]),[['نام هنگام تحویل',3,'عدد'],['نام درخواست',2,'عدد']]);
});
