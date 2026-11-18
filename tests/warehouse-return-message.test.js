'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const store=require('../lib/store');const {enrichOrder}=require('../lib/domain');
test('legacy returned orders recover the latest audit reason even after line edits',()=>{
 const old=store.get;
 const db={visits:[],customers:[],products:[{id:'p1',name:'محصول'}],payments:[],orderItems:[{id:'i1',orderId:'o1',productId:'p1',itemStatus:'PENDING',returnReason:'ویرایش شد'}],audit:[{action:'RETURN_TO_SALES',entityType:'order',entityId:'o1',createdAt:'first',details:{reason:'پیام قدیمی'}},{action:'RETURN_TO_SALES',entityType:'order',entityId:'o1',createdAt:'last',details:{reason:'پیام آخر',itemId:'i1'}}]};
 try{store.get=()=>db;const order={id:'o1',orderType:'REMOTE',status:'RETURNED_TO_SALES'};assert.equal(enrichOrder(order).warehouseReturn.reason,'پیام آخر');assert.equal(enrichOrder(order,new Map([['o1',db.audit[1]]])).warehouseReturn.itemId,'i1');assert.equal([order,order].map(enrichOrder)[1].warehouseReturn.reason,'پیام آخر');db.audit=[];db.orderItems[0].itemStatus='RETURNED_TO_SALES';db.orderItems[0].returnReason='پیام قدیمی بدون ممیزی';assert.equal(enrichOrder(order).warehouseReturn.reason,'پیام قدیمی بدون ممیزی');assert.equal(enrichOrder({...order,status:'WAREHOUSE_PENDING'}).warehouseReturn,null);}
 finally{store.get=old;}
});
