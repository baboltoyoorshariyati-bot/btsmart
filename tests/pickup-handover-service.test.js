'use strict';
// The service is not yet exposed over HTTP or wired to the warehouse UI.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('pickup: atomic physical handover snapshot, no-delivery safety and checked goods exit',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-goods-'));
 try {
  const script=`
const assert=require('node:assert/strict'),s=require('./lib/store'),api=require('./lib/pickup-transaction-service'),{today}=require('./lib/domain');
let db=s.init(),day=today();const gate={user:{id:'g',username:'gate',roleCode:'gate'}},wh={user:{id:'w',username:'warehouse',roleCode:'warehouse'}},sales={user:{id:'s',username:'sales',roleCode:'sales'}};
db.customers.push({id:'buyer',name:'مالک سفارش',phone:'09121112233'});
db.orders.push({id:'o',orderNo:'100',createdAt:new Date().toISOString(),customerId:'buyer',orderType:'REMOTE',deliveryMode:'PICKUP',status:'WAREHOUSE_PREPARING',deliveryDate:day});
db.orderItems.push({id:'i1',orderId:'o',productId:'p01',requestedQty:50,requestedUnit:'کیلوگرم',itemStatus:'PENDING',deliveredKg:null});
db.orderItems.push({id:'i2',orderId:'o',productId:'p02',requestedQty:4,requestedUnit:'کیلوگرم',itemStatus:'PENDING',deliveredKg:null});
const entry=api.entry('o',{name:'راننده مشتری',phone:'09121112244',vehicleType:'خودرو',carType:'تریلی یخچال',plate:'12ب34567'},gate);
const weights=[{itemId:'i1',weighings:[{grossKg:12,basket25:2,cartKg:1}]},{itemId:'i2',outOfStock:true}];
const payload={physicalHandoverConfirmed:true,items:weights};
assert.throws(()=>api.finalizeHandover('o',payload,sales),/دسترسی/);
assert.throws(()=>api.finalizeHandover('o',{items:weights},wh),/واقعی/);
assert.throws(()=>api.finalizeHandover('o',{physicalHandoverConfirmed:true,items:[weights[0]]},wh),/همه/);
assert.throws(()=>api.finalizeHandover('o',{physicalHandoverConfirmed:true,items:[weights[0],weights[0]]},wh),/تکراری/);
s.sql.run("CREATE TRIGGER fail_finalize BEFORE INSERT ON notifications WHEN NEW.type='WAREHOUSE_DONE' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
assert.throws(()=>api.finalizeHandover('o',payload,wh),/test rollback/);s.sql.run('DROP TRIGGER fail_finalize');
assert.equal(s.get().orders.find(x=>x.id==='o').status,'WAREHOUSE_PREPARING');assert.equal(s.get().orders.find(x=>x.id==='o').pickupHandover,undefined);
assert.equal(s.get().orderItems.find(x=>x.id==='i1').deliveredKg,null);assert.equal(s.get().counters.warehouseDocumentNumber||0,0);
const out=api.finalizeHandover('o',payload,wh);assert.equal(out.handover.document.warehouseDocumentNo,'W-000001');
assert.equal(out.handover.document.customerName,'مالک سفارش');assert.equal(out.handover.document.recipient.name,'راننده مشتری');
assert.equal(out.handover.document.items[0].deliveredKg,6);assert.equal(out.handover.document.items[0].weighings[0].cartKg,1);
assert.equal(s.get().orders.find(x=>x.id==='o').status,'SETTLEMENT_PENDING');
assert.throws(()=>api.finalizeHandover('o',payload,wh),/وضعیت|وزن نهایی/);assert.throws(()=>api.requestCancellation('o',{reason:'انصراف',confirmedNoGoods:true},wh),/وزن نهایی/);
s.get().customers.find(c=>c.id==='buyer').name='نام تغییر یافته';s.get().visits.find(v=>v.id===entry.visit.id).recipient.name='نام جدید راننده';s.reloadFromSql();
assert.equal(s.get().orders.find(x=>x.id==='o').pickupHandover.document.customerName,'مالک سفارش');assert.equal(s.get().orders.find(x=>x.id==='o').pickupHandover.document.recipient.name,'راننده مشتری');
assert.throws(()=>api.goodsExit('o',{checkedItems:['i1']},gate),/تسویه/);
s.get().orders.find(x=>x.id==='o').status='SETTLED';assert.throws(()=>api.goodsExit('o',{checkedItems:['i1']},gate),/فاکتور/);
s.get().payments.push({id:'pay',orderId:'o',invoiceNumber:'INV-1',verifiedAt:new Date().toISOString()});
assert.throws(()=>api.goodsExit('o',{checkedItems:[]},gate),/تطبیق/);assert.throws(()=>api.goodsExit('o',{checkedItems:['i2']},gate),/تطبیق/);
assert.throws(()=>api.goodsExit('o',{checkedItems:['i1']},sales),/دسترسی/);
s.get().orderItems.find(i=>i.id==='i1').deliveredKg=5;assert.throws(()=>api.goodsExit('o',{checkedItems:['i1']},gate),/مطابقت/);
s.get().orderItems.find(i=>i.id==='i1').deliveredKg=6;
s.get().orderItems.find(i=>i.id==='i1').productId='p02';assert.throws(()=>api.goodsExit('o',{checkedItems:['i1']},gate),/مطابقت/);s.get().orderItems.find(i=>i.id==='i1').productId='p01';
s.get().orderItems.find(i=>i.id==='i2').deliveredKg=1;assert.throws(()=>api.goodsExit('o',{checkedItems:['i1']},gate),/مطابقت/);s.get().orderItems.find(i=>i.id==='i2').deliveredKg=0;
api.goodsExit('o',{checkedItems:['i1']},gate);s.reloadFromSql();
assert.equal(s.get().orders.find(o=>o.id==='o').status,'EXITED');assert.equal(s.get().visits.find(v=>v.id===entry.visit.id).exitReason,'GOODS');assert.equal(s.verifyAuditChain().ok,true);
console.log('PASS');`;
  const r=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,`${r.stdout}\n${r.stderr}`);assert.match(r.stdout,/PASS/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
