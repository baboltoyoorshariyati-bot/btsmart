'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../lib/store-stock-service');
const now='2026-05-01T12:00:00.000Z', by='warehouse-user';
const order=(id,extra={})=>({id,orderNo:`B${id}`,branchNo:1,storeId:'s1',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,approvalStatus:'APPROVED',transportWorkflow:1,deliveryMode:'DELIVERY',status:'WAREHOUSE_PENDING',...extra});
const item=(id,orderId,qty,unit='کیلوگرم',productId='p1')=>({id,orderId,productId,requestedQty:qty,requestedUnit:unit,itemStatus:'PENDING'});
const products=[{id:'p1',name:'مرغ'},{id:'p2',name:'ران'}];
const add=(service,o,items,extra={})=>S.addOrder(service,{order:o,items,products,expectedRevision:service.revision,at:now,by,...extra});
const weigh=(service,productId,itemIds,kg,extra={})=>S.weigh(service,{productId,itemIds,deliveredKg:kg,expectedRevision:service.revision,at:now,by,...extra});
const assignment={driverId:'d',driverName:'راننده',vehicleId:'v',vehiclePlate:'12ب34567'};

test('افزودن پس از وزن‌کشی: وزن اول باقی می‌ماند و یک سند مشترک روی جمع ساخته می‌شود',()=>{
 let s=S.createService({id:'service',branchNo:1,createdAt:now,createdBy:by});
 const empty=structuredClone(s);
 s=add(s,order('a'),[item('a1','a',50)]);assert.deepEqual(empty.orders,[]);
 s=weigh(s,'p1',['a1'],50);const first=structuredClone(s.weighings[0]);
 s=add(s,order('b'),[item('b1','b',30)]);
 let line=S.serviceLines(s)[0];assert.equal(line.deliveredKg,50);assert.deepEqual(line.amounts,[{unit:'کیلوگرم',quantity:'80'}]);
 assert.deepEqual(s.weighings[0],first);assert.equal(s.sources.find(x=>x.itemId==='b1').resolution,'PENDING');
 assert.throws(()=>S.handover(s,{documentNo:'000001',assignment,expectedRevision:s.revision,at:now,by}),/وزن‌کشی یا عدم موجودی/);
 s=weigh(s,'p1',['b1'],30);line=S.serviceLines(s)[0];assert.equal(line.deliveredKg,80);assert.deepEqual(line.weighings.map(w=>w.kg),[50,30]);
 s=S.handover(s,{documentNo:'000001',assignment,expectedRevision:s.revision,at:now,by});
 assert.equal(s.status,'HANDED_OVER');assert.equal(s.handover.document.documentNo,'000001');assert.deepEqual(s.handover.document.orderNos,['Ba','Bb']);assert.equal(s.handover.document.lines.length,1);assert.equal(s.handover.document.lines[0].deliveredKg,80);
 const fixed=structuredClone(s);assert.throws(()=>add(s,order('c'),[item('c1','c',1)]),/بسته/);assert.throws(()=>weigh(s,'p1',['a1'],1),/بسته/);assert.deepEqual(s,fixed);
});

test('هم‌نام با شناسهٔ متفاوت: وزن قبلی محفوظ و درخواست جدید مستقل در همان ردیف است',()=>{
 let s=S.createService({id:'service',branchNo:1,createdAt:now,createdBy:by});
 const catalog=[...products,{id:'other',name:'  مرغ '}];
 s=add(s,order('a'),[item('a1','a',50)],{products:catalog});s=weigh(s,'p1',['a1'],50);
 s=add(s,order('b'),[item('b1','b',30,'کیلوگرم','other'),item('b2','b',10,'عدد','other')],{products:catalog});
 assert.equal(S.serviceLines(s)[0].deliveredKg,50);
 s=weigh(s,'p1',['b1','b2'],30);
 const line=S.serviceLines(s)[0];assert.equal(S.serviceLines(s).length,1);
 assert.deepEqual(line.productIds,['p1','other']);assert.deepEqual(line.sources.map(x=>x.productId),['p1','other','other']);
 assert.deepEqual(line.amounts,[{unit:'کیلوگرم',quantity:'80'},{unit:'عدد',quantity:'10'}]);
 assert.deepEqual(line.weighings.map(w=>w.kg),[50,30]);assert.equal(line.deliveredKg,80);
 const closed=S.handover(s,{documentNo:'001',assignment,expectedRevision:s.revision,at:now,by});
 assert.equal(closed.handover.document.lines[0].deliveredKg,80);
});

test('واحدهای مختلف و عدم موجودی بدون تبدیل یا حذف منشأ حفظ می‌شوند',()=>{
 let s=S.createService({id:'service',branchNo:1,createdAt:now,createdBy:by});
 s=add(s,order('a'),[item('i1','a',50),item('i2','a',10,'عدد'),item('i3','a',1,'بسته','p2')]);
 s=weigh(s,'p1',['i1','i2'],60.25);s=S.markUnavailable(s,{productId:'p2',itemIds:['i3'],note:'ناموجود',expectedRevision:s.revision,at:now,by});
 const lines=S.serviceLines(s);assert.deepEqual(lines[0].amounts,[{unit:'کیلوگرم',quantity:'50'},{unit:'عدد',quantity:'10'}]);
 assert.equal(lines[0].deliveredKg,60.25);assert.equal(lines[0].sources.length,2);assert.deepEqual(lines[0].weighings[0].itemIds,['i1','i2']);assert.equal(lines[1].sources[0].resolution,'OUT_OF_STOCK');
 assert.equal(S.handover(s,{documentNo:'12',assignment,expectedRevision:s.revision,at:now,by}).handover.document.lines.length,2);
});

test('نسخهٔ قدیمی، ثبت تکراری وزن، قلم نامرتبط و عملیات روی سفارش نامعتبر رد می‌شوند',()=>{
 let s=S.createService({id:'service',branchNo:1,createdAt:now,createdBy:by});
 s=add(s,order('a'),[item('i1','a',50)]);
 assert.throws(()=>add(s,order('b'),[item('i2','b',30)],{expectedRevision:0}),/تغییر کرده/);
 assert.throws(()=>add(s,order('a'),[item('i1','a',50)]),/قبلاً/);
 assert.throws(()=>add(s,order('b',{branchNo:2}),[item('i2','b',30)]),/شعبه/);
 assert.throws(()=>add(s,order('b',{storePurpose:'CUSTOMER'}),[item('i2','b',30)]),/تکمیل/);
 assert.throws(()=>add(s,order('b',{transportAssignments:{'1':{driverId:'d'}}}),[item('i2','b',30)]),/فعالیت مستقل/);
 assert.throws(()=>add(s,order('b'),[{...item('i2','b',30),runR1:[{kg:5}]}]),/وزن یا تصمیم مستقل/);
 assert.throws(()=>weigh(s,'p2',['i1'],1),/متعلق/);
 assert.throws(()=>weigh(s,'p1',['i1','i1'],1),/فهرست/);
 assert.throws(()=>weigh(s,'p1',['i1'],1.0001),/سه رقم/);
 s=weigh(s,'p1',['i1'],50);assert.throws(()=>weigh(s,'p1',['i1'],30),/تعیین تکلیف/);
});

test('دو عملیات با نسخهٔ یکسان بدون ادغام بی‌صدا روی نتیجهٔ جدید پذیرفته نمی‌شوند',()=>{
 let current=S.createService({id:'service',branchNo:1,createdAt:now,createdBy:by});
 current=add(current,order('a'),[item('a1','a',50)]);current=weigh(current,'p1',['a1'],50);
 const oldRevision=current.revision;
 current=add(current,order('b'),[item('b1','b',30)]);
 const saved=structuredClone(current);
 assert.throws(()=>S.handover(current,{documentNo:'001',assignment,expectedRevision:oldRevision,at:now,by}),/تغییر کرده/);
 assert.deepEqual(current,saved);
 current=weigh(current,'p1',['b1'],30);current=S.handover(current,{documentNo:'001',assignment,expectedRevision:current.revision,at:now,by});
 assert.throws(()=>S.addOrder(current,{order:order('c'),items:[item('c1','c',1)],products,expectedRevision:oldRevision,at:now,by}),/بسته/);
});

test('ناخالصی با قواعد موجود انبار محاسبه و در سند ثابت حفظ می‌شود',()=>{
 let s=S.createService({id:'service',branchNo:1,createdAt:now,createdBy:by});s=add(s,order('a'),[item('i1','a',50)]);
 s=S.weigh(s,{productId:'p1',itemIds:['i1'],weighings:[{grossKg:55,basket25:2}],expectedRevision:s.revision,at:now,by});
 assert.equal(S.serviceLines(s)[0].deliveredKg,50);assert.equal(s.weighings[0].weighings[0].tareKg,5);
 const closed=S.handover(s,{documentNo:'5',assignment,expectedRevision:s.revision,at:now,by});
 assert.equal(closed.handover.document.lines[0].weighings[0].weighings[0].grossKg,55);
});
