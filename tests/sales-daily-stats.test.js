'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {salesDailyStats}=require('../lib/sales-daily-stats');
const day='2026-11-02',dayOf=s=>String(s||'').slice(0,10),at=day+'T12:00:00';
test('آمار روز: واحدها مجزا، لغو، چند سرویس، تعدیلات و فاکتور فاقد ریز',()=>{
 const db={products:[{id:'p',name:'مرغ'},{id:'q',name:'ران'}],orders:[
  {id:'a',createdAt:at,status:'CLOSED',orderType:'REMOTE'},
  {id:'store',createdAt:at,status:'CLOSED',orderType:'STORE'},
  {id:'cancel',createdAt:at,status:'CANCELLED'},
  {id:'old',createdAt:'2026-11-01',status:'CLOSED'},
 ],orderItems:[
  {id:'i',orderId:'a',productId:'p',requestedQty:2,requestedUnit:'کیلوگرم',finalAmount:200,deliveredKg:2,unitPrice:100},
  {id:'j',orderId:'a',productId:'q',requestedQty:3,requestedUnit:'بسته',finalAmount:300},
  {id:'c',orderId:'a',productId:'q',requestedQty:99,requestedUnit:'کیلوگرم',itemStatus:'CANCELLED'},
  {id:'s',orderId:'store',productId:'p',requestedQty:4,requestedUnit:'کیلوگرم'},
  {id:'x',orderId:'cancel',productId:'p',requestedQty:30,requestedUnit:'کیلوگرم'},
 ],payments:[
  {orderId:'a',verifiedAt:at,totalAmount:450},
  {orderId:'store',deliveryRun:1,verifiedAt:at,totalAmount:100,priceLines:[{itemId:'s',amount:120}]},
  {orderId:'store',deliveryRun:2,verifiedAt:at,totalAmount:80,priceLines:[{itemId:'s',amount:80}]},
  {orderId:'old',deliveryRun:1,verifiedAt:at,totalAmount:50},
  {orderId:'cancel',verifiedAt:at,totalAmount:900,priceLines:[{itemId:'x',amount:900}]},
  {orderId:'a',verifiedAt:at,totalAmount:900,archived:true},
 ]};
 const s=salesDailyStats(db,day,dayOf);assert.equal(s.orders.kg,6);assert.equal(s.orders.units['بسته'],3);assert.equal(s.orders.rows.find(r=>r.productId==='p').units['کیلوگرم'],6);
 assert.equal(s.sales.total,680);assert.equal(s.sales.invoices,4);assert.equal(s.sales.rows.find(r=>r.productId==='p').amount,400);assert.equal(s.sales.rows.find(r=>r.productId==='q').amount,300);assert.equal(s.sales.adjustments,-70);assert.equal(s.sales.unallocated,50);assert.equal(s.sales.rows.reduce((n,r)=>n+r.amount,0)+s.sales.adjustments+s.sales.unallocated,s.sales.total);
});
test('فاکتورهای چندگانه بدون snapshot نباید وزن یا مبلغ مشترک را تکرار کنند',()=>{
 const db={orders:[{id:'a',createdAt:at,status:'CLOSED'}],products:[],orderItems:[{id:'i',orderId:'a',finalAmount:100}],payments:[{orderId:'a',verifiedAt:'2026-11-01',totalAmount:100},{orderId:'a',verifiedAt:at,totalAmount:100}]};
 const s=salesDailyStats(db,day,dayOf);assert.equal(s.sales.rows.length,0);assert.equal(s.sales.unallocated,100);
});
