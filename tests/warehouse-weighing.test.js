'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {weighingsFor}=require('../lib/warehouse-weighing');
test('وزن خالص با دو نوع سبد و کارتن، راک، گاری و چند نوبت از گرم محاسبه می‌شود',()=>{
 const r=weighingsFor([{grossKg:'۵۰٫۵',basket18:2,basket25:1,box300:3,box600:2,rackKg:2,cartKg:4},{grossKg:10}]);
 assert.equal(r.rows[0].tareKg,14.2);assert.equal(r.rows[0].netKg,36.3);assert.equal(r.rows[1].netKg,10);assert.equal(r.netKg,46.3);assert.equal(weighingsFor(undefined),null);
 for(const x of [[{grossKg:2,basket25:1}],[{grossKg:1,cartKg:1}],[{grossKg:4,basket18:1.5}],[{grossKg:2.0001}],[{grossKg:10,rackKg:-1}],[],[{grossKg:'garbage'}]])assert.throws(()=>weighingsFor(x));
});
test('سند سرویس فروشگاه فقط جزئیات وزن همان سرویس را می‌گیرد و سوابق قدیمی را جعل نمی‌کند',()=>{
 const {warehouseServiceDocument}=require('../lib/store-run-print');
 const row=(grossKg)=>weighingsFor([{grossKg,basket18:1}]).rows;
 const order={id:'o',orderType:'STORE',orderNo:'1',storeName:'شعبه',storeWarehouseDocumentNos:{1:'W-000001',2:'W-000002'},storeRunOps:{r1Shipment:{run:1,itemIds:['i'],weights:{i:8.2},status:'PENDING_SALES'},r2Shipment:{run:2,itemIds:['i'],weights:{i:9.2},status:'PENDING_SALES'}}};
 const db={payments:[],orderItems:[{id:'i',orderId:'o',productId:'p',requestedQty:20,requestedUnit:'کیلوگرم',runR1:[{kg:8.2,weighings:row(10)}],runR2:[{kg:3,at:'old'},{kg:6.2,weighings:row(8)}]}]};
 const a=warehouseServiceDocument(db,order,1,()=>({name:'کالا'})),b=warehouseServiceDocument(db,order,2,()=>({name:'کالا'}));
 assert.equal(a.lines[0].weighings[0].grossKg,10);assert.equal(a.lines[0].missingWeighings,false);assert.equal(b.lines[0].weighings[0].grossKg,8);assert.equal(b.lines[0].missingWeighings,true);assert.equal(a.lines[0].deliveredKg,8.2);assert.equal(b.lines[0].deliveredKg,9.2);
});
