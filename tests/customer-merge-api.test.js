'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('admin reviews and atomically merges legacy duplicates without altering records or losing debts', {timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-merge-')),cwd=path.join(__dirname,'..'),env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'};
 let proc,cookie='';
 const start=async()=>{proc=spawn(process.execPath,['server.js'],{cwd,env,stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exited '+c)));});};
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}};
 const req=async(method,url,body,ck=cookie,key)=>{const res=await fetch(`http://127.0.0.1:${port}`+url,{method,headers:{...(ck?{cookie:ck}:{}),...(key?{'idempotency-key':key}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,json:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};
 const seed=script=>{const r=spawnSync(process.execPath,['-e',`const store=require('./lib/store');store.sql.init();require('./lib/transport-transaction')(()=>{const db=store.get();${script};store.save();});`],{cwd,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 try{
  await start();cookie=(await req('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;assert(cookie);
  assert.equal((await req('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'})).status,200);
  assert.equal((await req('POST','/api/admin/users',{username:'merge-sales',fullName:'فروش',position:'فروش',roleCode:'sales',password:'Sales!12345',mustChangePassword:false})).status,201);
  const sales=(await req('POST','/api/login',{username:'merge-sales',password:'Sales!12345'},'')).cookie;
  seed(`db.customers.push({id:'merge-a',code:'80001',name:'علی رضایی',phone:'09121112233',address:'نشانی الف'}, {id:'merge-b',code:'80002',name:'علی رضا',phone:'+989121112233',phone2:'09121114444',notes:'یادداشت محفوظ',address:'نشانی ب'}, {id:'merge-c',code:'80003',name:'شخص دیگر',phone:'09121119999'});
    db.visits.push({id:'visit-a',customerId:'merge-a',createdAt:'2025-01-01',status:'CLOSED'}, {id:'visit-b',customerId:'merge-b',createdAt:'2025-01-02',status:'CLOSED'});
    db.orders.push({id:'order-a',customerId:'merge-a',orderNo:'1',orderType:'REMOTE',status:'DONE'}, {id:'order-b',customerId:'merge-b',orderNo:'2',orderType:'REMOTE',status:'DONE'});
    db.payments.push({id:'pay-a',orderId:'order-a',invoiceNumber:'1',totalAmount:1000,debtAccount:{customerId:'merge-a',initial:1000,receipts:[]}}, {id:'pay-b',orderId:'order-b',invoiceNumber:'2',totalAmount:2000,debtAccount:{customerId:'merge-b',initial:2000,receipts:[{id:'check',type:'CHECK',amount:500,status:'PENDING',bank:'بانک',checkNumber:'1'}]}})`);
  const preview=()=>req('POST','/api/customers/merge-preview',{primaryId:'merge-a',secondaryId:'merge-b'});
  assert.equal((await req('GET','/api/customers/merge-a/merge-candidates',undefined,sales)).status,403);
  assert.equal((await req('POST','/api/customers/merge-preview',{primaryId:'merge-a',secondaryId:'merge-b'},sales)).status,403);
  assert.equal((await req('POST','/api/customers/merge-preview',{primaryId:'merge-a',secondaryId:'merge-c'})).status,409);
  let p=await preview();assert.equal(p.status,200,JSON.stringify(p.json));assert.equal(p.json.secondary.balance,2000);assert.equal(p.json.secondary.pending,500);assert.equal(p.json.secondary.profiles[0].notes,'یادداشت محفوظ');assert.equal(p.json.secondary.orders[0].orderNo,'2');assert.equal(p.json.secondary.debts[0].receipts[0].id,'check');
  assert.equal((await req('POST','/api/customers/merge',{primaryId:'merge-a',secondaryId:'merge-b',revision:p.json.revision})).status,400);
  seed(`db.customers.find(c=>c.id==='merge-b').notes='تغییر پس از بازبینی'`);
  let result=await req('POST','/api/customers/merge',{primaryId:'merge-a',secondaryId:'merge-b',revision:p.json.revision,confirmed:true});assert.equal(result.status,409);assert.equal(result.json.code,'STALE_MERGE_PREVIEW');
  p=await preview();seed(`db.payments.find(p=>p.id==='pay-b').debtAccount.receipts[0].amount=600`);
  assert.equal((await req('POST','/api/customers/merge',{primaryId:'merge-a',secondaryId:'merge-b',revision:p.json.revision,confirmed:true})).status,409);
  p=await preview();const body={primaryId:'merge-a',secondaryId:'merge-b',revision:p.json.revision,confirmed:true};
  const attempts=await Promise.all([req('POST','/api/customers/merge',body),req('POST','/api/customers/merge',body)]);assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);
  assert.deepEqual((await req('GET','/api/customers/duplicate-phones')).json.duplicates,[]);
  let list=(await req('GET','/api/customers?q=80002')).json.customers;assert.equal(list.length,1);assert.equal(list[0].id,'merge-a');assert.equal(list[0].visitCount,2);assert.equal(list[0].orderCount,2);assert.equal(list[0].debtBalance,3000);
  const detail=(await req('GET','/api/customers/merge-b')).json;assert.equal(detail.customer.id,'merge-a');assert.equal(detail.historicalProfiles[0].notes,'تغییر پس از بازبینی');assert.equal(detail.orders.length,2);assert.equal(detail.visits.length,2);
  let debt=(await req('GET','/api/customers/merge-a/debts')).json;assert.equal(debt.balance,3000);assert.equal(debt.pending,600);assert.equal(debt.invoices.length,2);
  const report=await req('POST','/api/admin/reports/query',{source:'customers',fields:['code','visitCount','orderCount']},cookie,'merge-report-1');assert.equal(report.status,200);assert.equal(report.json.rows.filter(r=>r.code==='80001').length,1);assert.equal(report.json.rows.find(r=>r.code==='80001').visitCount,2);assert(!report.json.rows.some(r=>r.code==='80002'));
  assert.equal((await req('DELETE','/api/customers/merge-a',{})).status,409);assert.equal((await req('DELETE','/api/customers/merge-b',{})).status,409);
  assert.equal((await req('POST','/api/customers',{name:'دیگری',phone:'09121114444'})).status,409);
  const visit=await req('POST','/api/visits',{customerCode:'80002',name:'علی رضا',phone:'09121114444',noVehicle:true});assert.equal(visit.status,201,JSON.stringify(visit.json));assert.equal(visit.json.visit.customerId,'merge-a');
  const raw=spawnSync(process.execPath,['-e',`const s=require('./lib/store');s.sql.init();s.reloadFromSql();const d=s.get();console.log(JSON.stringify({order:d.orders.find(o=>o.id==='order-b'),pay:d.payments.find(p=>p.id==='pay-b'),audit:d.audit.filter(a=>a.action==='CUSTOMER_MERGED'),chain:s.verifyAuditChain()}));`],{cwd,env,encoding:'utf8'});assert.equal(raw.status,0,raw.stderr);const state=JSON.parse(raw.stdout.trim());assert.equal(state.order.customerId,'merge-b');assert.equal(state.pay.debtAccount.customerId,'merge-b');assert.equal(state.pay.debtAccount.receipts[0].status,'PENDING');assert.equal(state.audit.length,1);assert.equal(state.chain.ok,true);
  await stop();await start();cookie=(await req('POST','/api/login',{username:'admin',password:'Changed!2345'},'')).cookie;debt=(await req('GET','/api/customers/merge-a/debts')).json;assert.equal(debt.balance,3000);assert.equal(debt.pending,600);
  let received=await req('POST','/api/customers/merge-a/debts/pay-b/receipts',{type:'CASH',amount:200},cookie,'merge-cash-1');assert.equal(received.status,201,JSON.stringify(received.json));assert.equal(received.json.balance,2800);
  let resolved=await req('POST','/api/customers/merge-a/debts/pay-b/receipts/check/resolve',{status:'CLEARED'},cookie,'merge-check-1');assert.equal(resolved.status,200,JSON.stringify(resolved.json));assert.equal(resolved.json.balance,2200);assert.equal(resolved.json.pending,0);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('legacy visit-linked orders, grouped aliases and conflicting national IDs',()=>{
 const core=require('../lib/customer-core'),links=require('../lib/customer-links'),merge=require('../lib/customer-merge'),customers=require('../lib/customers');
 const db={customers:[{id:'a',code:'00001',name:'علی',phone:'09120000001',nationalId:'۱۲۳۴۵۶۷۸۹۰'}, {id:'b',code:'00002',name:'علی',phone:'09120000001',phone2:'09120000002',nationalId:'1234567890'}, {id:'c',code:'00003',name:'علی',phone:'09120000002'}],visits:[{id:'v',customerId:'b'}],orders:[{id:'legacy',visitId:'v',orderType:'ONSITE'}],payments:[{id:'p',orderId:'legacy',totalAmount:300}]};
 let preview=merge.preview(db,'a','b');assert.equal(preview.secondary.orderCount,1);assert.equal(preview.secondary.invoiceCount,1);db.customers[1].mergedInto='a';
 assert.equal(core.findExisting(db,{code:'00002'}).id,'a');assert.equal(core.phoneOwners(db,'09120000002')[0].id,'a');assert.equal(customers.customerOrders(db,'a')[0].id,'legacy');assert.deepEqual(new Set(links.memberIds(db,'b')),new Set(['a','b']));assert.equal(merge.candidates(db,'a')[0].id,'c');
 db.customers[2].nationalId='1111111111';assert.throws(()=>merge.preview(db,'a','c'),/کد ملی/);db.customers[2].nationalId='';preview=merge.preview(db,'a','c');assert.equal(preview.primary.profiles.length,2);assert.equal(preview.primary.orders[0].id,'legacy');
});
