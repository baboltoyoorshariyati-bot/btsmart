'use strict';
// v37.6.0 — سری شماره‌گذاری مجزای سفارش‌های فروشگاه؛ شعبه ۱ از ۴۱، ۲ از ۴۲، ۳ از ۴۳ (شش‌رقمی)
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ensureOrderNumbers,nextOrderNumber,nextStoreOrderNumber,checkBranchNo}=require('../lib/order-numbers');

test('سری شعبه‌ها: هر شعبه از بازهٔ خودش شروع و سری مستقل می‌شود',()=>{
 const db={orders:[],counters:{}};
 assert.equal(nextStoreOrderNumber(db,1),'B410001');
 assert.equal(nextStoreOrderNumber(db,1),'B410002');
 assert.equal(nextStoreOrderNumber(db,2),'B420001');
 assert.equal(nextStoreOrderNumber(db,3),'B430001');
 assert.equal(nextStoreOrderNumber(db,1),'B410003');
 for(const n of ['B410001','B420001','B430001']) assert.match(n,/^B4[123]\d{4}$/,'پیشوند B + کد شعبه در ابتدای سفارش فروشگاه');
});
test('شعبهٔ نامعتبر پذیرفته نمی‌شود',()=>{
 const db={orders:[],counters:{}};
 assert.throws(()=>nextStoreOrderNumber(db,0),/شعبه/);
 assert.throws(()=>nextStoreOrderNumber(db,60),/شعبه/);
 assert.throws(()=>nextStoreOrderNumber(db,'x'),/شعبه/);
 assert.equal(checkBranchNo('2'),2);
});
test('بازهٔ ۴۱xxxx به بالا در سری مشتریان عادی صادر نمی‌شود',()=>{
 const db={orders:[],counters:{orderNumber:409999}};
 assert.throws(()=>nextOrderNumber(db),/رزرو/);
});
test('ظرفیت هر شعبه ۹۹۹۹ سفارش است و هرگز به بازهٔ شعبهٔ بعد نمی‌رسد',()=>{
 const db={orders:[],counters:{'storeOrder_41':9998}};
 assert.equal(nextStoreOrderNumber(db,1),'B419999');
 assert.throws(()=>nextStoreOrderNumber(db,1),/شعبهٔ 1/);
});
test('مهاجرت: شماره‌های معتبر سری فروشگاه حفظ و دنباله از بزرگترین مقدار همان پیشوند ادامه می‌یابد',()=>{
 const db={orders:[{id:'st1',orderNo:'410007',orderType:'STORE',branchNo:1,createdAt:'2026-10-01'},{id:'st2',orderNo:'420003',orderType:'STORE',branchNo:2,createdAt:'2026-10-02'}],counters:{}};
 assert.equal(ensureOrderNumbers(db),0);
 assert.equal(db.orders[0].orderNo,'410007','شمارهٔ عددی قدیمی سری فروشگاه دست‌نخورده باقی می‌ماند');
 assert.equal(nextStoreOrderNumber(db,1),'B410008');
 assert.equal(nextStoreOrderNumber(db,2),'B420004');
});
test('مهاجرت: سفارش فروشگاه بدون شماره، بر اساس شعبهٔ همان شعبه شماره می‌گیرد و شمارهٔ قبلی legacy ثبت می‌شود',()=>{
 const db={orders:[{id:'st3',orderNo:'OLD-9',orderType:'STORE',branchNo:3,createdAt:'2026-10-01'},{id:'cu',orderNo:'430001',orderType:'ONSITE',createdAt:'2026-10-02'}],counters:{}};
 ensureOrderNumbers(db);
 const st=db.orders.find(o=>o.id==='st3'),cu=db.orders.find(o=>o.id==='cu');
 assert.equal(st.orderNo,'B430001','فروشگاه به سری B شعبهٔ ۳');
 assert.equal(st.legacyOrderNo,'OLD-9','شمارهٔ قبلی فروشگاه در legacy نگه‌داشته می‌شود');
 assert.notEqual(cu.orderNo,'430001','مشتری عادی از بازهٔ رزرو نمی‌گیرد');
 assert.ok(Number(cu.orderNo)<410000);
});
test('سفارش مشتری عادی که سابقاً در بازهٔ رزرو افتاده، تصحیح و تاستانداردش legacy می‌شود',()=>{
 const db={orders:[{id:'odd',orderNo:'420050',orderType:'ONSITE',createdAt:'2026-10-01'}],counters:{orderNumber:100}};
 ensureOrderNumbers(db);
 assert.equal(db.orders[0].orderNo,'000101');
 assert.equal(db.orders[0].legacyOrderNo,'420050');
});
test('سری‌های فروشگاه و مشتری عادی مستقل‌اند',()=>{
 const db={orders:[],counters:{}};
 assert.equal(nextOrderNumber(db),'000001');
 assert.equal(nextStoreOrderNumber(db,1),'B410001');
 assert.equal(nextOrderNumber(db),'000002');
 assert.equal(nextStoreOrderNumber(db,1),'B410002');
});
