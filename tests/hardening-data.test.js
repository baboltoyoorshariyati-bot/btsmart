'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('indexed order projection matches the legacy projection and integrity preflight is read-only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-data-check-'));process.env.DATA_DIR=dir;process.env.ADMIN_INITIAL_PASSWORD='DataCheck1234';
 const store=require('../lib/store'),domain=require('../lib/domain'),{inspect}=require('../scripts/check-data-integrity');
 try{
 store.init();const db=store.get();db.customers.push({id:'c',name:'customer',phone:'09123456789'});
 db.visits.push({id:'v',customerId:'c'});db.orders.push({id:'o',visitId:'v',customerId:'c',orderType:'ONSITE',status:'WAREHOUSE_PENDING'});
 db.orderItems.push({id:'i',orderId:'o',productId:db.products[0].id,itemStatus:'PENDING'});store.save();
 const order=store.get().orders[0];assert.deepEqual(domain.enrichOrder(order),domain.enrichOrder(order,undefined,domain.orderReadIndex([order])));
 assert.equal(inspect(store.dbFile()).ok,true);
 db.orderItems.push({id:'orphan',orderId:'missing',productId:'missing'});store.save();
 const before=JSON.stringify(store.sql.load()),result=inspect(store.dbFile());assert.equal(result.ok,false);
 assert(result.findings.some(f=>f.kind==='items-without-order'));assert(result.findings.some(f=>f.kind==='items-without-product'));
 assert.equal(JSON.stringify(store.sql.load()),before);
 }finally{store.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('business timezone is explicit and invalid zones fail before startup',()=>{
 const {spawnSync}=require('node:child_process'),cwd=path.join(__dirname,'..');
 const code="require('./lib/config');console.log(require('./lib/domain').localDayOf('2026-11-11T21:00:00Z'))";
 const result=spawnSync(process.execPath,['-e',code],{cwd,env:{...process.env,TZ:'UTC',BT_TIME_ZONE:'Asia/Tehran'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'2026-11-12');
 const invalid=spawnSync(process.execPath,['-e',"require('./lib/config')"],{cwd,env:{...process.env,BT_TIME_ZONE:'Invalid/Zone'},encoding:'utf8'});assert.notEqual(invalid.status,0);
});
