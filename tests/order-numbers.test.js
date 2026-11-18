'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {spawnSync}=require('node:child_process');
const {ensureOrderNumbers,nextOrderNumber}=require('../lib/order-numbers');
test('public order labels are six numeric digits with a global monotonic counter',()=>{
 const db={orders:[],counters:{}};ensureOrderNumbers(db);
 assert.equal(nextOrderNumber(db),'000001');assert.equal(nextOrderNumber(db),'000002');
 db.counters.orderNumber=123455;assert.equal(nextOrderNumber(db),'123456');
});
test('legacy orders migrate deterministically, preserve internal IDs and immutable audits',()=>{
 const db={orders:[{id:'b',orderNo:'SO-20251015-0001',createdAt:'2025-10-15'},{id:'a',orderNo:'SO-20251014-0001',createdAt:'2025-10-14'}],counters:{},audit:[{entityId:'a',details:{orderNo:'SO-20251014-0001'},hash:'immutable'}],orderItems:[{id:'it1',orderId:'a'}],dispatchReturns:[{orderId:'a',orderNo:'SO-20251014-0001'}],idempotency:[{body:{order:{id:'a',orderNo:'SO-20251014-0001'}}}]};
 const audit=JSON.stringify(db.audit),items=JSON.stringify(db.orderItems);
 assert.equal(ensureOrderNumbers(db),2);assert.equal(db.orders[0].id,'b');assert.equal(db.orders[0].orderNo,'000002');assert.equal(db.orders[1].orderNo,'000001');
 assert.equal(db.orders[1].legacyOrderNo,'SO-20251014-0001');assert.equal(JSON.stringify(db.audit),audit);assert.equal(JSON.stringify(db.orderItems),items);
 assert.equal(db.dispatchReturns[0].orderNo,'000001');assert.equal(db.idempotency[0].body.order.orderNo,'000001');
 const once=JSON.stringify(db);assert.equal(ensureOrderNumbers(db),0);assert.equal(JSON.stringify(db),once);assert.equal(nextOrderNumber(db),'000003');
});
test('existing valid labels and high persisted counter are preserved, duplicate labels repaired',()=>{
 const db={orders:[{id:'valid',orderNo:'000099'},{id:'dup',orderNo:'000099'},{id:'missing'}],counters:{orderNumber:105}};
 ensureOrderNumbers(db);assert.equal(db.orders[0].orderNo,'000099');
 assert.equal(new Set(db.orders.map(o=>o.orderNo)).size,3);assert.equal(nextOrderNumber(db),'000108');
});
test('six-digit capacity never wraps or emits seven digits',()=>{
 const db={orders:[],counters:{orderNumber:409998}};assert.equal(nextOrderNumber(db),'409999');assert.throws(()=>nextOrderNumber(db),/رزرو|ظرفیت/);
 assert.equal(db.counters.orderNumber,409999);
 const old={orders:[{id:'old',orderNo:'SO-OLD'}],counters:{orderNumber:409999}};
 assert.throws(()=>ensureOrderNumbers(old),/ظرفیت/);assert.equal(old.orders[0].orderNo,'SO-OLD');
});
test('real store migration and restart persist six-digit order labels and sequence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-order-number-'));
 try{
  fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify({meta:{schemaVersion:2},orders:[{id:'stable-id',orderNo:'SO-20260101-0001',createdAt:'2026-01-01'}],counters:{},users:[]}));
  const code="const s=require('./lib/store');s.init();const label=s.nextOrderNumber();s.save();console.log('RESULT:'+JSON.stringify({label,order:s.get().orders[0]}))";
  const run=()=>{const r=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.split('RESULT:')[1].trim())};
  const one=run();assert.equal(one.order.id,'stable-id');assert.equal(one.order.orderNo,'000001');assert.equal(one.label,'000002');
  const two=run();assert.equal(two.order.orderNo,'000001');assert.equal(two.label,'000003');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('historic numeric store labels cannot be reused by customers, including during migration',()=>{
 const db={orders:[{id:'store',orderType:'STORE',orderNo:'000001'},{id:'pending',orderType:'REMOTE',orderNo:'OLD'}],counters:{}};
 ensureOrderNumbers(db);assert.equal(db.orders[0].orderNo,'000001');assert.equal(db.orders[1].orderNo,'000002');assert.equal(nextOrderNumber(db),'000003');
 const data={orders:[{id:'old-store',orderType:'STORE',orderNo:'000002'}],counters:{orderNumber:1}};
 assert.equal(nextOrderNumber(data),'000003');assert.equal(data.orders[0].orderNo,'000002');
});
test('historic equal customer and store labels are preserved and no new order reuses them',()=>{
 for(const orders of [[{id:'s',orderType:'STORE',orderNo:'000001'},{id:'c',orderType:'REMOTE',orderNo:'000001'}],[{id:'c',orderType:'REMOTE',orderNo:'000001'},{id:'s',orderType:'STORE',orderNo:'000001'}]]){
  const db={orders,counters:{}};assert.equal(ensureOrderNumbers(db),0);assert.deepEqual(orders.map(o=>o.orderNo),['000001','000001']);assert.equal(nextOrderNumber(db),'000002');assert.equal(ensureOrderNumbers(db),0);
 }
});
