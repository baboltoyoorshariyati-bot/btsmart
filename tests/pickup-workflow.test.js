'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const w = require('../lib/pickup-workflow');
const gate = { id: 'g', roleCode: 'gate' }, warehouse = { id: 'w', roleCode: 'warehouse' }, sales = { id: 's', roleCode: 'sales' };
const today = '2026-11-05', now = '2026-11-05T09:30:00Z';
const order = () => ({ id: 'o', customerId: 'buyer', orderType: 'REMOTE', deliveryMode: 'PICKUP', status: 'WAREHOUSE_PENDING', deliveryDate: today, scheduledAt: '2026-11-06T08:00' });
const items = [{id:'i',orderId:'o',itemStatus:'PENDING',deliveredKg:null}];
const person = { name: 'راننده یخچال', phone: '09121112233', vehicleType: 'خودرو', carType: 'تریلی یخچال', plate: '12ب34567' };

test('only sales changes delivery date, without changing warehouse schedule', () => {
 const old=order();assert.throws(()=>w.changeDeliveryDate(old,'2026-11-06',gate,today),/دسترسی/);
 assert.throws(()=>w.changeDeliveryDate(old,'2026-11-04',sales,today),/قبل/);
 assert.throws(()=>w.changeDeliveryDate(old,'2026-02-30',sales,today),/معتبر/);
 const next=w.changeDeliveryDate(old,'۲۰۲۶-۱۱-۰۶',sales,today);assert.equal(next.deliveryDate,'2026-11-06');assert.equal(next.scheduledAt,old.scheduledAt);assert.equal(old.deliveryDate,today);
});
test('gate registers actual recipient without changing buyer or auto-activating scheduled order', () => {
 const old={...order(),status:'SCHEDULED_REMOTE'};const out=w.createEntry(old,person,gate,today,now,'v1');
 assert.equal(out.order.customerId,'buyer');assert.equal(out.visit.customerId,'buyer');assert.equal(out.order.status,'SCHEDULED_REMOTE');assert.equal(out.order.scheduledAt,old.scheduledAt);
 assert.equal(out.order.pickupRecipient.name,'راننده یخچال');assert.equal(out.visit.recipient.carType,'تریلی یخچال');assert.equal(out.visit.status,'PICKUP_PRESENT');assert.notEqual(out.visit.status,'WAITING_SALES');assert.equal(old.visitId,undefined);
 assert.throws(()=>w.createEntry(old,person,sales,today,now,'v2'),/دسترسی/);
 assert.throws(()=>w.createEntry({...old,deliveryDate:'2026-11-06'},person,gate,today,now,'v2'),/تاریخ تحویل/);
 assert.throws(()=>w.createEntry({...old,deliveryDate:null},person,gate,today,now,'v2'),/ابتدا/);
 assert.throws(()=>w.createEntry({...old,status:'SETTLEMENT_PENDING'},person,gate,today,now,'v2'),/وزن نهایی/);
 assert.throws(()=>w.createEntry({...old,status:'WAREHOUSE_PREPARING',warehouseCompletedAt:now},person,gate,today,now,'v2'),/وزن نهایی/);
 assert.throws(()=>w.createEntry(old,person,gate,today,now,'v2',out.visit),/ورود باز/);
 assert.throws(()=>w.createEntry({...old,deliveryMode:'DELIVERY'},person,gate,today,now,'v2'),/تحویل در انبار/);
});
test('cancellation requires warehouse then sales then gate, without automatic refund', () => {
 const o={...order(),deposit:{amount:100,status:'RECEIVED',type:'CASH'}};const {order:a,visit}=w.createEntry(o,person,gate,today,now,'v');
 assert.throws(()=>w.approveCancellation(a,visit,sales,now,items),/ابتدا/);
 assert.throws(()=>w.requestCancellation(a,visit,gate,now,'انصراف',true,items),/دسترسی/);
 assert.throws(()=>w.requestCancellation(a,visit,warehouse,now,'انصراف',false,items),/عدم تحویل/);
 const b=w.requestCancellation(a,visit,warehouse,now,'انصراف',true,items);assert.equal(b.status,'WAREHOUSE_PENDING');assert.equal(b.pickupCancellation.status,'PENDING_SALES');
 assert.throws(()=>w.cancellationExit(b,visit,gate,now),/تأیید نشده/);
 assert.throws(()=>w.approveCancellation(b,visit,gate,now,items),/دسترسی/);
 const c=w.approveCancellation(b,visit,sales,now,items);assert.equal(c.status,'CANCELLED');assert.equal(c.deposit.status,'REFUND_REQUIRED');assert.equal(o.deposit.status,'RECEIVED');
 const done=w.cancellationExit(c,visit,gate,now);assert.equal(done.order.status,'CANCELLED');assert.equal(done.visit.status,'EXITED');assert.equal(done.visit.exitReason,'CANCELLATION');
 assert.throws(()=>w.cancellationExit(done.order,done.visit,gate,now),/مراجعه/);
});
test('do not allow cancellation after weight finalization or delivery and do not mix visits', () => {
 const {order:a,visit}=w.createEntry(order(),person,gate,today,now,'v');
 assert.throws(()=>w.requestCancellation({...a,status:'SETTLEMENT_PENDING'},visit,warehouse,now,'انصراف',true,items),/وزن نهایی/);
 assert.throws(()=>w.requestCancellation({...a,warehouseCompletedAt:now},visit,warehouse,now,'انصراف',true,items),/وزن نهایی/);
 assert.throws(()=>w.requestCancellation({...a,pickupHandover:{id:'h'}},visit,warehouse,now,'انصراف',true,items),/تحویل/);
 assert.throws(()=>w.requestCancellation(a,{...visit,orderId:'another'},warehouse,now,'انصراف',true,items),/مرتبط/);
 const pending=w.requestCancellation(a,visit,warehouse,now,'انصراف',true,items);
 assert.throws(()=>w.approveCancellation({...pending,warehouseCompletedAt:now},visit,sales,now,items),/وزن نهایی/);
 assert.throws(()=>w.changeDeliveryDate(pending,'2026-11-06',sales,today,visit),/وضعیت/);
});

test('weight or partial delivery prevents cancellation; missing item list fails closed',()=>{
 const {order:a,visit}=w.createEntry(order(),person,gate,today,now,'v');
 assert.throws(()=>w.requestCancellation(a,visit,warehouse,now,'انصراف',true),/اقلام/);
 assert.throws(()=>w.requestCancellation(a,visit,warehouse,now,'انصراف',true,[{...items[0],deliveredKg:1}]),/تحویل/);
 assert.throws(()=>w.requestCancellation(a,visit,warehouse,now,'انصراف',true,[{...items[0],deliveredKg:-1}]),/اقلام/);
 const pending=w.requestCancellation(a,visit,warehouse,now,'انصراف',true,items);
 assert.throws(()=>w.approveCancellation(pending,visit,sales,now,[{...items[0],itemStatus:'DELIVERED'}]),/تحویل/);
});
test('goods handover requires real recipient and physical confirmation; goods exit also requires settlement',()=>{
 const {order:a,visit}=w.createEntry({...order(),status:'WAREHOUSE_PREPARING'},person,gate,today,now,'v');
 assert.throws(()=>w.recordHandover(a,visit,warehouse,now,false),/واقعی/);
 assert.throws(()=>w.recordHandover(a,visit,gate,now,true),/دسترسی/);
 const b=w.recordHandover(a,visit,warehouse,now,true);assert.equal(b.pickupHandover.recipient.name,'راننده یخچال');assert.equal(b.pickupHandover.physicalHandoverConfirmed,true);assert.equal(a.pickupHandover,undefined);
 assert.throws(()=>w.goodsExit(b,visit,gate,now),/تسویه/);
 assert.throws(()=>w.goodsExit({...b,status:'SETTLED'},{...visit,id:'different'},gate,now),/مراجعه/);
 const out=w.goodsExit({...b,status:'SETTLED'},visit,gate,now);assert.equal(out.order.status,'EXITED');assert.equal(out.visit.exitReason,'GOODS');
});

test('a stale or forged visit for the same order cannot authorize cancellation or handover',()=>{
 const {order:a,visit}=w.createEntry(order(),person,gate,today,now,'current');
 const stale={...visit,id:'stale'};
 assert.throws(()=>w.requestCancellation(a,stale,warehouse,now,'انصراف',true,items),/مراجعه/);
 assert.throws(()=>w.recordHandover({...a,status:'WAREHOUSE_PREPARING'},stale,warehouse,now,true),/مراجعه/);
 assert.throws(()=>w.createEntry({...a,pickupHandover:{physicalHandoverConfirmed:true}},person,gate,today,now,'new'),/وضعیت|مجاز/);
});
