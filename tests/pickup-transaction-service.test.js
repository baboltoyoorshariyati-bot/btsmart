'use strict';
// Internal service tests only; this is deliberately not an HTTP/UI acceptance test.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('pickup internal transactions persist and roll back order, visit, notification and audit together',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-txn-'));
 try {
  const script=`
const assert=require('node:assert/strict'),s=require('./lib/store'),api=require('./lib/pickup-transaction-service'),{today}=require('./lib/domain');
let db=s.init();const date=today();
const sales={user:{id:'s',username:'sale',roleCode:'sales'}},gate={user:{id:'g',username:'gate',roleCode:'gate'}},wh={user:{id:'w',username:'wh',roleCode:'warehouse'}};
db.customers.push({id:'buyer',name:'مالک سفارش',phone:'09121112233'});
db.orders.push({id:'o',orderNo:'100',customerId:'buyer',orderType:'REMOTE',deliveryMode:'PICKUP',status:'WAREHOUSE_PENDING',deliveryDate:date,scheduledAt:date+'T23:59',deposit:{amount:100,status:'RECEIVED',refundedAmount:0}});
db.orderItems.push({id:'i',orderId:'o',itemStatus:'PENDING',deliveredKg:null});
const person={name:'راننده مشتری',phone:'09121112244',vehicleType:'خودرو',carType:'تریلی یخچال',plate:'12ب34567'};
assert.throws(()=>api.entry('o',person,sales),/دسترسی/);
s.sql.run("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications WHEN NEW.type='PICKUP_ENTRY' BEGIN SELECT RAISE(ABORT,'simulated'); END");
assert.throws(()=>api.entry('o',person,gate),/simulated/);s.sql.run('DROP TRIGGER fail_notice');
assert.equal(s.get().orders.find(o=>o.id==='o').visitId,undefined);assert.equal(s.get().visits.length,0);assert.equal(s.get().audit.filter(x=>x.action==='PICKUP_ENTRY').length,0);
const entry=api.entry('o',person,gate);assert.equal(entry.visit.recipient.name,'راننده مشتری');
assert.equal(s.get().orders.find(o=>o.id==='o').customerId,'buyer');assert.throws(()=>api.entry('o',person,gate),/ورود باز/);
assert.throws(()=>api.changeDate('o',date,sales),/مراجعه/);assert.throws(()=>api.approveCancellation('o',sales),/ابتدا/);
api.requestCancellation('o',{reason:'انصراف مشتری',confirmedNoGoods:true},wh);
assert.throws(()=>api.cancellationExit('o',gate),/تأیید نشده/);
s.get().orderItems.find(i=>i.id==='i').deliveredKg=1;
assert.throws(()=>api.approveCancellation('o',sales),/تحویل/);s.get().orderItems.find(i=>i.id==='i').deliveredKg=null;
s.sql.run("CREATE TRIGGER fail_approval BEFORE INSERT ON notifications WHEN NEW.type='PICKUP_CANCELLATION_APPROVED' BEGIN SELECT RAISE(ABORT,'simulated approval'); END");
assert.throws(()=>api.approveCancellation('o',sales),/simulated approval/);s.sql.run('DROP TRIGGER fail_approval');
assert.equal(s.get().orders.find(o=>o.id==='o').pickupCancellation.status,'PENDING_SALES');assert.equal(s.get().orders.find(o=>o.id==='o').deposit.status,'RECEIVED');
api.approveCancellation('o',sales);assert.equal(s.get().orders.find(o=>o.id==='o').deposit.status,'REFUND_REQUIRED');
api.cancellationExit('o',gate);s.reloadFromSql();
assert.equal(s.get().orders.find(o=>o.id==='o').pickupCancellation.status,'EXITED');assert.equal(s.get().visits.find(v=>v.id===entry.visit.id).exitReason,'CANCELLATION');
assert.equal(s.get().orders.find(o=>o.id==='o').deposit.status,'REFUND_REQUIRED');
assert.equal(s.get().audit.filter(x=>x.action.startsWith('PICKUP_')).length,4);console.log('PASS');`;
  const r=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,`${r.stdout}\n${r.stderr}`);assert.match(r.stdout,/PASS/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
