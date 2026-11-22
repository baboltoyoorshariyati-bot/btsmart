'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {Worker}=require('node:worker_threads');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../lib/store-stock-service-repository');
const now='2026-01-01T00:00:00.000Z',by='user';
const assignment={driverId:'d',driverName:'راننده',vehicleId:'v',vehiclePlate:'12ب34567'};
const order=id=>({id,orderNo:`B${id}`,branchNo:1,storeId:'s',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,approvalStatus:'APPROVED',transportWorkflow:1,deliveryMode:'DELIVERY',status:'WAREHOUSE_PENDING'});
const item=(id,orderId,qty)=>({id,orderId,productId:'p1',requestedQty:qty,requestedUnit:'کیلوگرم',itemStatus:'PENDING'});
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-stock-repository-')),filename=path.join(dir,'test.db'),db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; CREATE TABLE orders(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE products(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE drivers(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE vehicles(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE counters(key TEXT PRIMARY KEY,value INTEGER NOT NULL);');
 R.initialize(db);db.prepare('INSERT INTO products VALUES(?,?)').run('p1',JSON.stringify({id:'p1',name:'مرغ'}));
 insertOrder(db,'a',50);
 return {dir,filename,db};
}
function insertOrder(db,id,qty,extra={}) {db.prepare('INSERT INTO orders VALUES(?,?)').run(id,JSON.stringify({...order(id),...extra}));db.prepare('INSERT INTO order_items VALUES(?,?,?)').run(id+'1',id,JSON.stringify(item(id+'1',id,qty)));}
const add=(db,s,id)=>R.addOrder(db,s.id,id,{expectedRevision:s.revision,at:now,by});
const weight=(db,s,id,kg)=>R.transition(db,s.id,'weigh',{productId:'p1',itemIds:[id],deliveredKg:kg,expectedRevision:s.revision,at:now,by});
const hand=(db,s)=>R.transition(db,s.id,'handover',{documentNo:'1',assignment,expectedRevision:s.revision,at:now,by});

test('ذخیرهٔ تراکنشی، یکتایی عضویت و rollback در خطای نوشتن',()=>{
 const {dir,db}=setup();try{
  let s=R.create(db,{id:'s1',branchNo:1,createdAt:now,createdBy:by});
  assert.throws(()=>R.create(db,{id:'s2',branchNo:1,createdAt:now,createdBy:by}),/سرویس باز/);
  s=add(db,s,'a');s=weight(db,s,'a1',50);const before=structuredClone(s);
  db.prepare('UPDATE order_items SET payload=? WHERE id=?').run(JSON.stringify(item('a1','a',51)),'a1');
  assert.throws(()=>add(db,s,'b'),/اقلام عضو تغییر/);assert.deepEqual(R.read(db,s.id),before);
  assert.throws(()=>hand(db,s),/اقلام عضو تغییر/);assert.deepEqual(R.read(db,s.id),before);
  db.prepare('UPDATE order_items SET payload=? WHERE id=?').run(JSON.stringify(item('a1','a',50)),'a1');
  insertOrder(db,'b',30,{status:'STORE_PENDING_SALES',approvalStatus:'PENDING_SALES'});
  assert.throws(()=>hand(db,s),/بررسی یا به سرویس افزوده نشده/,'an order awaiting sales approval cannot be silently left out');
  db.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(order('b')),'b');
  assert.throws(()=>hand(db,s),/بررسی یا به سرویس افزوده نشده/,'an approved order cannot be silently left out');
  db.exec("CREATE TRIGGER reject_members BEFORE INSERT ON stock_service_draft_members WHEN NEW.order_id='b' BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  assert.throws(()=>add(db,s,'b'),/injected failure/);assert.deepEqual(R.read(db,s.id),before);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stock_service_draft_members WHERE order_id='b'").get().n,0);
  db.exec('DROP TRIGGER reject_members');s=add(db,s,'b');assert.equal(s.sources.length,2);
  assert.throws(()=>add(db,s,'a'),/قبلاً عضو/);
  assert.throws(()=>hand(db,s),/وزن‌کشی یا عدم موجودی/);
  s=weight(db,s,'b1',30);s=hand(db,s);assert.equal(s.handover.document.lines[0].deliveredKg,80);
  assert.throws(()=>add(db,s,'c'),/بسته/);
  const next=R.create(db,{id:'s2',branchNo:1,createdAt:now,createdBy:by});assert.equal(next.status,'OPEN');
  assert.throws(()=>add(db,next,'a'),/قبلاً عضو/,'a source order cannot be added to another service');
  insertOrder(db,'c',10);const c=add(db,next,'c');assert.equal(c.orders[0].orderId,'c');
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('عضویت خودکار آزمایشی برای هر شعبه، فقط پس از تأیید و تا تحویل',()=>{
 const {dir,db}=setup();try{
  const join=id=>R.joinApproved(db,id,{at:now,by});
  let s=join('a');assert.equal(s.branchNo,1);s=weight(db,s,'a1',50);
  const before=structuredClone(s);assert.deepEqual(join('a'),before,'retry does not duplicate a member or increment revision');
  insertOrder(db,'b',30,{status:'STORE_PENDING_SALES',approvalStatus:'PENDING_SALES'});
  assert.throws(()=>join('b'),/تأییدشده/);assert.throws(()=>hand(db,s),/بررسی یا به سرویس افزوده نشده/);
  db.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(order('b')),'b');
  s=join('b');assert.equal(s.id,before.id);assert.equal(s.weighings[0].kg,50);assert.deepEqual(s.orders.map(o=>o.orderId),['a','b']);
  insertOrder(db,'branch2',20,{branchNo:2});const other=join('branch2');assert.notEqual(other.id,s.id);assert.equal(other.branchNo,2);
  insertOrder(db,'customer',5,{storePurpose:'CUSTOMER',customerId:'cust'});assert.throws(()=>join('customer'),/تکمیل فروشگاه/);
  insertOrder(db,'bulk',5,{storeOrderKind:'BULK'});assert.throws(()=>join('bulk'),/تکمیل فروشگاه/);
  insertOrder(db,'future',5,{status:'SCHEDULED_REMOTE'});assert.throws(()=>join('future'),/تأییدشده/);
  s=weight(db,s,'b1',30);s=R.handoverWithNumber(db,s.id,{assignment,expectedRevision:s.revision,at:now,by});
  assert.equal(s.handover.document.lines[0].deliveredKg,80);assert.throws(()=>join('a'),/تحویل‌شده/);
  insertOrder(db,'later',10);const next=join('later');assert.notEqual(next.id,s.id);assert.equal(next.branchNo,1);assert.deepEqual(next.orders.map(o=>o.orderId),['later']);
  assert.equal(R.read(db,s.id).handover.document.lines[0].deliveredKg,80);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('شناسه‌های متفاوت کالای هم‌نام پس از ذخیره، وزن افزایشی و تحویل حفظ می‌شوند',()=>{
 const {dir,db}=setup();try{
  db.prepare('INSERT INTO products VALUES(?,?)').run('p2',JSON.stringify({id:'p2',name:'مرغ'}));
  let s=R.create(db,{id:'s1',branchNo:1,createdAt:now,createdBy:by});s=add(db,s,'a');s=weight(db,s,'a1',50);
  insertOrder(db,'b',30);db.prepare('UPDATE order_items SET payload=? WHERE id=?').run(JSON.stringify({...item('b1','b',30),productId:'p2'}),'b1');
  s=add(db,s,'b');s=weight(db,s,'b1',30);s=hand(db,s);
  const line=R.read(db,'s1').handover.document.lines[0];
  assert.deepEqual(line.productIds,['p1','p2']);assert.deepEqual(line.sources.map(x=>x.productId),['p1','p2']);
  assert.deepEqual(line.weighings.map(x=>x.kg),[50,30]);assert.equal(line.deliveredKg,80);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('شماره سند آزمایشی از سری مشترک و همراه سرویس اتمی ثبت می‌شود',()=>{
 const {dir,db}=setup();try{
  db.prepare('INSERT INTO counters VALUES(?,?)').run('warehouseDocumentNumber',7);
  db.prepare('INSERT INTO orders VALUES(?,?)').run('regular',JSON.stringify({id:'regular',orderType:'REMOTE',warehouseDocumentNo:'W-000011'}));
  let s=R.create(db,{id:'s1',branchNo:1,createdAt:now,createdBy:by});s=add(db,s,'a');s=weight(db,s,'a1',50);
  const opts={assignment,expectedRevision:s.revision,at:now,by};
  assert.throws(()=>R.handoverWithNumber(db,s.id,{...opts,documentNo:'W-000099'}),/خودکار/);
  db.exec("CREATE TRIGGER reject_counter BEFORE UPDATE ON counters BEGIN SELECT RAISE(ABORT,'injected counter failure'); END");
  assert.throws(()=>R.handoverWithNumber(db,s.id,opts),/injected counter failure/);
  assert.deepEqual(R.read(db,s.id),s);assert.equal(db.prepare("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").get().value,7);
  db.exec('DROP TRIGGER reject_counter');s=R.handoverWithNumber(db,s.id,opts);
  assert.equal(s.handover.document.documentNo,'W-000012');assert.equal(db.prepare("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").get().value,12);
  insertOrder(db,'b',30);let next=R.create(db,{id:'s2',branchNo:1,createdAt:now,createdBy:by});next=add(db,next,'b');next=weight(db,next,'b1',30);
  // Even if the counter has been damaged, the experimental allocator scans
  // both ordinary and previously issued consolidated documents.
  db.prepare("UPDATE counters SET value=0 WHERE key='warehouseDocumentNumber'").run();
  next=R.handoverWithNumber(db,next.id,{assignment,expectedRevision:next.revision,at:now,by});
  assert.equal(next.handover.document.documentNo,'W-000013');assert.equal(db.prepare("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").get().value,13);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('گردش آزمایشی یک سند: تخصیص واقعی، تحویل، بررسی، خروج و دریافت شعبه',()=>{
 const {dir,db}=setup(),T=require('../lib/store-stock-transport');try{
  const driver={id:'d',fullName:'راننده',phone:'09120000000',vehicleId:'v',isActive:true};
  const vehicle={id:'v',kind:'fleet',isActive:true,vehicleType:'وانت',plate:'12ب34567'};
  db.prepare('INSERT INTO drivers VALUES(?,?)').run('d',JSON.stringify(driver));db.prepare('INSERT INTO vehicles VALUES(?,?)').run('v',JSON.stringify(vehicle));
  let s=R.joinApproved(db,'a',{at:now,by});
  assert.throws(()=>R.transition(db,s.id,'assign',{driverId:'bad',vehicleId:'v',driver,expectedRevision:s.revision,at:now,by}),/یافت نشد/);
  s=R.transition(db,s.id,'assign',{driverId:'d',vehicleId:'v',expectedRevision:s.revision,at:now,by});s=weight(db,s,'a1',50);
  const token=T.handoverToken(s),oldRevision=s.revision;insertOrder(db,'b',30);s=R.joinApproved(db,'b',{at:now,by});
  assert.throws(()=>R.handoverAssignedWithNumber(db,s.id,{expectedRevision:oldRevision,at:now,by,handoverToken:token,physicalHandoverConfirmed:true}),/تغییر کرده/);
  assert.throws(()=>R.handoverAssignedWithNumber(db,s.id,{expectedRevision:s.revision,at:now,by,handoverToken:token,physicalHandoverConfirmed:true}),/پیش‌نمایش سند تغییر/);
  s=weight(db,s,'b1',30);const fresh=T.handoverToken(s);
  assert.throws(()=>R.handoverAssignedWithNumber(db,s.id,{expectedRevision:s.revision,at:now,by,handoverToken:fresh}),/تحویل فیزیکی/);
  db.prepare('UPDATE drivers SET payload=? WHERE id=?').run(JSON.stringify({...driver,isActive:false}),'d');
  assert.throws(()=>R.handoverAssignedWithNumber(db,s.id,{expectedRevision:s.revision,at:now,by,handoverToken:fresh,physicalHandoverConfirmed:true}),/راننده یا خودرو تغییر/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM counters').get().n,0);assert.equal(R.read(db,s.id).status,'OPEN');
  db.prepare('UPDATE drivers SET payload=? WHERE id=?').run(JSON.stringify(driver),'d');
  s=R.handoverAssignedWithNumber(db,s.id,{expectedRevision:s.revision,at:now,by,handoverToken:fresh,physicalHandoverConfirmed:true,assignment:{driverId:'fake'}});
  const document=structuredClone(s.handover.document);assert.equal(document.documentNo,'W-000001');assert.equal(document.lines[0].deliveredKg,80);assert.equal(s.handover.assignment.driverName,'راننده');
  assert.throws(()=>R.transition(db,s.id,'depart',{expectedRevision:s.revision,at:now,by,departureConfirmed:true}),/مرحله/);
  assert.throws(()=>R.transition(db,s.id,'review',{expectedRevision:s.revision,at:now,by}),/تأیید صریح/);
  s=R.transition(db,s.id,'review',{expectedRevision:s.revision,at:now,by,reviewConfirmed:true});
  s=R.transition(db,s.id,'depart',{expectedRevision:s.revision,at:now,by,departureConfirmed:true});
  assert.throws(()=>R.transition(db,s.id,'receipt',{expectedRevision:s.revision,at:now,by,branchNo:2,storeId:'s',receiptConfirmed:true}),/مجاز/);
  assert.throws(()=>R.transition(db,s.id,'receipt',{expectedRevision:s.revision,at:now,by,branchNo:1,storeId:'different',receiptConfirmed:true}),/مجاز/);
  const mixedOwners=structuredClone(s);mixedOwners.orders[1].storeId='other';
  assert.throws(()=>T.receipt(mixedOwners,{expectedRevision:mixedOwners.revision,at:now,by,branchNo:1,storeId:'s',receiptConfirmed:true}),/همهٔ درخواست‌ها/);
  s=R.transition(db,s.id,'receipt',{expectedRevision:s.revision,at:now,by,branchNo:1,storeId:'s',receiptConfirmed:true});
  s=R.transition(db,s.id,'returnDocuments',{expectedRevision:s.revision,at:now,by,documentsReturned:true});
  assert.equal(s.transport.stage,'CLOSED');assert.deepEqual(s.handover.document,document);assert.deepEqual(R.read(db,s.id),s);T.validate(s);
  assert.throws(()=>R.transition(db,s.id,'assign',{driverId:'d',vehicleId:'v',expectedRevision:s.revision,at:now,by}),/پس از تحویل/);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('سرویس می‌تواند با عملیات دیگر در تراکنش بیرونی یکجا rollback شود',()=>{
 const {dir,db}=setup();try{
  db.exec('CREATE TABLE test_audit(id TEXT PRIMARY KEY); BEGIN IMMEDIATE');
  let s=R.createLocked(db,{id:'s1',branchNo:1,createdAt:now,createdBy:by});
  s=R.addOrderLocked(db,'s1','a',{expectedRevision:s.revision,at:now,by});
  s=R.transitionLocked(db,'s1','weigh',{productId:'p1',itemIds:['a1'],deliveredKg:50,expectedRevision:s.revision,at:now,by});
  s=R.handoverWithNumberLocked(db,'s1',{assignment,expectedRevision:s.revision,at:now,by});assert.equal(s.handover.document.documentNo,'W-000001');
  db.prepare('INSERT INTO test_audit VALUES (?)').run('audit');db.exec('ROLLBACK');
  assert.equal(R.read(db,'s1'),null);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_service_draft_members').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM test_audit').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM counters').get().n,0);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('دو تخصیص هم‌زمان آزمایشی از سری مشترک سندهای متفاوت می‌گیرند', {timeout:20000},async()=>{
 const {dir,filename,db}=setup();let workers=[];
 try{
  let s=R.create(db,{id:'s1',branchNo:1,createdAt:now,createdBy:by});s=add(db,s,'a');s=weight(db,s,'a1',50);
  db.prepare('INSERT INTO orders VALUES(?,?)').run('normal',JSON.stringify({id:'normal',orderType:'REMOTE'}));
  const shared=new SharedArrayBuffer(4),flag=new Int32Array(shared);
  const source=`const {parentPort,workerData:w}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const R=require(w.repo),N=require(w.numbers);const db=new DatabaseSync(w.filename);db.exec('PRAGMA busy_timeout=5000');parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(w.shared),0,0);try{let number;if(w.action==='stock'){number=R.handoverWithNumber(db,'s1',{assignment:w.assignment,expectedRevision:w.revision,at:w.now,by:'user'}).handover.document.documentNo;}else{db.exec('BEGIN IMMEDIATE');try{const orders=db.prepare('SELECT payload FROM orders').all().map(r=>JSON.parse(r.payload));const row=db.prepare(\"SELECT value FROM counters WHERE key='warehouseDocumentNumber'\").get();const data={orders,counters:{warehouseDocumentNumber:row?row.value:0}};const order=orders.find(o=>o.id==='normal');number=N.assignWarehouseDocumentNumber(data,order);db.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(order),order.id);db.prepare(\"INSERT INTO counters(key,value) VALUES('warehouseDocumentNumber',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value\").run(data.counters.warehouseDocumentNumber);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}parentPort.postMessage({number});}catch(e){parentPort.postMessage({error:e.message});}finally{db.close();}`;
  let ready=0;
  const launch=action=>new Promise((resolve,reject)=>{
   const worker=new Worker(source,{eval:true,workerData:{filename,shared,action,revision:s.revision,now,assignment,repo:path.join(__dirname,'../lib/store-stock-service-repository.js'),numbers:path.join(__dirname,'../lib/warehouse-document-numbers.js')}});workers.push(worker);
   worker.on('message',m=>{if(m.ready){if(++ready===2){Atomics.store(flag,0,1);Atomics.notify(flag,0,2);}}else if(m.error)reject(Error(m.error));else resolve(m.number);});worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('worker exited '+code));});
  });
  const result=await Promise.all([launch('stock'),launch('normal')]);assert.deepEqual([...result].sort(),['W-000001','W-000002']);
  assert.equal(R.read(db,'s1').handover.document.documentNo,result[0]);assert.equal(JSON.parse(db.prepare("SELECT payload FROM orders WHERE id='normal'").get().payload).warehouseDocumentNo,result[1]);
  assert.equal(db.prepare("SELECT value FROM counters WHERE key='warehouseDocumentNumber'").get().value,2);
 }finally{for(const w of workers)await w.terminate();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('ثبت سفارش جدید و تحویل هم‌زمان: عضویت در سرویس باز یا سرویس بعدی بدون گم‌شدن', {timeout:20000},async()=>{
 const {dir,filename,db}=setup();let workers=[];
 try{
  db.prepare('INSERT INTO drivers VALUES(?,?)').run('d',JSON.stringify({id:'d',fullName:'راننده',vehicleId:'v',isActive:true}));
  db.prepare('INSERT INTO vehicles VALUES(?,?)').run('v',JSON.stringify({id:'v',kind:'fleet',plate:'12ب34567',isActive:true}));
  let s=R.joinApproved(db,'a',{at:now,by});s=R.transition(db,s.id,'assign',{driverId:'d',vehicleId:'v',expectedRevision:s.revision,at:now,by});s=weight(db,s,'a1',50);
  const handoverToken=require('../lib/store-stock-transport').handoverToken(s);
  const shared=new SharedArrayBuffer(4),flag=new Int32Array(shared),repo=path.join(__dirname,'../lib/store-stock-service-repository.js');
  const source=`const {parentPort,workerData:w}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const R=require(w.repo);const db=new DatabaseSync(w.filename);db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(w.shared),0,0);try{if(w.action==='new'){db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO orders VALUES(?,?)').run('b',JSON.stringify(w.order));db.prepare('INSERT INTO order_items VALUES(?,?,?)').run('b1','b',JSON.stringify(w.item));const next=R.joinApprovedLocked(db,'b',{at:w.now,by:'user'});db.exec('COMMIT');parentPort.postMessage({action:w.action,ok:true,id:next.id});}catch(e){db.exec('ROLLBACK');throw e;}}else{const next=R.handoverAssignedWithNumber(db,w.serviceId,{handoverToken:w.handoverToken,physicalHandoverConfirmed:true,expectedRevision:w.revision,at:w.now,by:'user'});parentPort.postMessage({action:w.action,ok:true,id:next.id});}}catch(e){parentPort.postMessage({action:w.action,ok:false,error:e.message});}finally{db.close();}`;
  let ready=0;
  const launch=action=>new Promise((resolve,reject)=>{const worker=new Worker(source,{eval:true,workerData:{filename,shared,repo,action,serviceId:s.id,revision:s.revision,now,handoverToken,order:order('b'),item:item('b1','b',30)}});workers.push(worker);worker.on('message',m=>{if(m.ready){if(++ready===2){Atomics.store(flag,0,1);Atomics.notify(flag,0,2);}}else resolve(m);});worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('worker exited '+code));});});
  const results=await Promise.all([launch('new'),launch('hand')]);assert.equal(results[0].ok,true,results[0].error);
  const first=R.read(db,s.id),link=db.prepare('SELECT service_id FROM stock_service_draft_members WHERE order_id=?').get('b');assert.ok(link);
  if(results[1].ok){assert.equal(first.status,'HANDED_OVER');assert.notEqual(link.service_id,s.id);assert.deepEqual(first.handover.document.orderNos,['Ba']);assert.equal(R.read(db,link.service_id).status,'OPEN');}
  else{assert.equal(first.status,'OPEN');assert.equal(link.service_id,s.id);assert.equal(first.sources.find(x=>x.itemId==='b1').resolution,'PENDING');assert.equal(first.weighings[0].kg,50);}
 }finally{for(const worker of workers)await worker.terminate();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('ورود سفارش و تحویل هم‌زمان: یا عضو سرویس می‌شود یا تحویل قبل از آن ثبت می‌شود، نه هر دو', {timeout:20000},async()=>{
 const {dir,filename,db}=setup();let workers=[];
 try{
  let s=R.create(db,{id:'s1',branchNo:1,createdAt:now,createdBy:by});s=add(db,s,'a');s=weight(db,s,'a1',50);insertOrder(db,'b',30);
  const shared=new SharedArrayBuffer(4), flag=new Int32Array(shared), modulePath=path.join(__dirname,'../lib/store-stock-service-repository.js');
  const source=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const R=require(workerData.modulePath);const db=new DatabaseSync(workerData.filename);db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.shared),0,0);try{const o={expectedRevision:workerData.revision,at:workerData.now,by:'user'};if(workerData.action==='add')R.addOrder(db,'s1','b',o);else R.transition(db,'s1','handover',{...o,documentNo:'1',assignment:workerData.assignment});parentPort.postMessage({ok:true,action:workerData.action});}catch(e){parentPort.postMessage({ok:false,action:workerData.action,error:e.message});}finally{db.close();}`;
  const launch=action=>new Promise((resolve,reject)=>{
    const w=new Worker(source,{eval:true,workerData:{modulePath,filename,shared,revision:s.revision,now,assignment,action}});workers.push(w);
    w.on('message',m=>{if(m.ready){if(workers.every(x=>x._ready)){Atomics.store(flag,0,1);Atomics.notify(flag,0,2);}else w._ready=true;if(workers.length===2&&workers.every(x=>x._ready)){Atomics.store(flag,0,1);Atomics.notify(flag,0,2);}}else resolve(m);});w.on('error',reject);w.on('exit',code=>{if(code!==0)reject(new Error('worker exited '+code));});
  });
  const results=await Promise.all([launch('add'),launch('handover')]);assert.equal(results.filter(r=>r.ok).length,1);
  const stored=R.read(db,'s1'),member=db.prepare("SELECT service_id FROM stock_service_draft_members WHERE order_id='b'").get();
  if(stored.status==='HANDED_OVER'){assert.equal(member,undefined);assert.deepEqual(stored.handover.document.orderNos,['Ba']);}
  else{assert.equal(stored.status,'OPEN');assert.equal(member.service_id,'s1');assert.equal(stored.sources.find(x=>x.itemId==='b1').resolution,'PENDING');assert.equal(stored.handover,null);}
 }finally{for(const w of workers)await w.terminate();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
