'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const k=require('../lib/store-order-kind');
test('سفارش فروشگاهی قدیمی کلی است و سرویس‌های آن تغییر نمی‌کنند',()=>{
 const old={orderType:'STORE'};
 assert.equal(k.kind(old),'BULK');assert.equal(k.isPartial(old),false);assert.deepEqual(k.allowedRuns(old),[1,2]);
 assert.deepEqual(k.normalizeNew({}),{storeOrderKind:'BULK',storePurpose:null});
});
test('هدف و نوع سفارش جزئی صریح و معتبر است',()=>{
 assert.deepEqual(k.normalizeNew({storeOrderKind:'PARTIAL',storePurpose:'CUSTOMER'}),{storeOrderKind:'PARTIAL',storePurpose:'CUSTOMER'});
 assert.deepEqual(k.normalizeNew({storeOrderKind:'PARTIAL',storePurpose:'STOCK'}),{storeOrderKind:'PARTIAL',storePurpose:'STOCK'});
 assert.throws(()=>k.normalizeNew({storeOrderKind:'PARTIAL'}),/هدف/);
 assert.throws(()=>k.normalizeNew({storeOrderKind:'PARTIAL',storePurpose:'OTHER'}),/هدف/);
 assert.throws(()=>k.normalizeNew({storeOrderKind:'INVALID'}),/نوع/);
 assert.throws(()=>k.normalizeNew({storeOrderKind:'BULK',storePurpose:'STOCK'}),/هدف/);
 assert.deepEqual(k.allowedRuns({orderType:'STORE',storeOrderKind:'PARTIAL'}),[1]);
});
