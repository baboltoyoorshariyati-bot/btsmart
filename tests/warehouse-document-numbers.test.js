'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {ensureWarehouseDocumentNumbers,assignWarehouseDocumentNumber,assignStoreWarehouseDocumentNumber}=require('../lib/warehouse-document-numbers');
test('legacy migration is deterministic and preserves order and audit history',()=>{
 const db={orders:[{id:'b',orderNo:'000002',orderType:'REMOTE',warehouseCompletedAt:'2026-01-02'}, {id:'a',orderNo:'000001',orderType:'ONSITE',warehouseCompletedAt:'2026-01-01'}, {id:'r',orderNo:'000003',orderType:'REMOTE',status:'WAREHOUSE_PREPARING'}, {id:'store',orderType:'STORE',warehouseCompletedAt:'2025-01-01'}, {id:'existing',orderType:'REMOTE',warehouseDocumentNo:'W-000010'}],counters:{orderNumber:100,invoiceNumber:200},audit:[{entityId:'r',action:'WAREHOUSE_FINALIZE',createdAt:'2026-01-03',hash:'immutable'}],payments:[{id:'p',invoiceNumber:'000091',amount:100}]};
 const original=JSON.stringify({audit:db.audit,payments:db.payments,orderNos:db.orders.map(o=>o.orderNo)});
 assert.equal(ensureWarehouseDocumentNumbers(db),true);assert.equal(db.orders[1].warehouseDocumentNo,'W-000011');assert.equal(db.orders[0].warehouseDocumentNo,'W-000012');assert.equal(db.orders[2].warehouseDocumentNo,'W-000013');assert.equal(db.orders[3].warehouseDocumentNo,undefined);assert.equal(db.counters.warehouseDocumentNumber,13);
 assert.equal(JSON.stringify({audit:db.audit,payments:db.payments,orderNos:db.orders.map(o=>o.orderNo)}),original);const once=JSON.stringify(db);assert.equal(ensureWarehouseDocumentNumbers(db),false);assert.equal(JSON.stringify(db),once);
 assert.equal(assignWarehouseDocumentNumber(db,db.orders[0]),'W-000012');const fresh={id:'new',orderType:'REMOTE'};db.orders.push(fresh);assert.equal(assignWarehouseDocumentNumber(db,fresh),'W-000014');assert.equal(db.counters.orderNumber,100);assert.equal(db.counters.invoiceNumber,200);
});
test('duplicates, invalid numbers and capacity fail without renumbering any existing document',()=>{
 for(const db of [{orders:[{id:'a',warehouseDocumentNo:'W-000001'},{id:'b',warehouseDocumentNo:'W-000001'}],counters:{}},{orders:[{id:'a',warehouseDocumentNo:'BAD'}],counters:{}},{orders:[{id:'a',warehouseCompletedAt:'x'}],counters:{warehouseDocumentNumber:999999}}]){
  const before=JSON.stringify(db);assert.throws(()=>ensureWarehouseDocumentNumbers(db));assert.equal(JSON.stringify(db),before);
 }
 const full={orders:[],counters:{warehouseDocumentNumber:999999}}, pending={id:'new'};const old=JSON.stringify({full,pending});assert.throws(()=>assignWarehouseDocumentNumber(full,pending),/ظرفیت/);assert.equal(JSON.stringify({full,pending}),old);
});
test('SQLite legacy migration, restart and restore preserve assignments in the restored data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-warehouse-no-'));
 const run=code=>{const r=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.split('RESULT:')[1].trim());};
 try{
  fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify({meta:{schemaVersion:2},users:[{id:'u1',username:'admin',roleCode:'admin',isActive:true,passwordHash:require('../lib/security').hashPassword('Initial!2345')}],orders:[{id:'a',orderNo:'000001',orderType:'ONSITE',warehouseCompletedAt:'2026-01-01',status:'SETTLEMENT_PENDING'},{id:'b',orderNo:'000002',orderType:'REMOTE',warehouseCompletedAt:'2026-01-02',status:'EXITED'}],counters:{},audit:[],payments:[]}));
  const code="const s=require('./lib/store');s.init();console.log('RESULT:'+JSON.stringify({numbers:s.get().orders.map(o=>o.warehouseDocumentNo),counter:s.get().counters.warehouseDocumentNumber}))";
  const first=run(code),second=run(code);assert.deepEqual(first,second);assert.deepEqual(first.numbers,['W-000001','W-000002']);assert.equal(first.counter,2);
  const restored=run(`const s=require('./lib/store'),p=require('path');s.init();const d=s.get();delete d.orders[0].warehouseDocumentNo;delete d.orders[1].warehouseDocumentNo;delete d.counters.warehouseDocumentNumber;s.save();const f=p.join(process.env.DATA_DIR,'old.db');s.sql.vacuumInto(f);d.orders[0].warehouseDocumentNo='W-000050';d.counters.warehouseDocumentNumber=50;s.save();s.sql.restoreSnapshot(f);s.reloadFromSql();console.log('RESULT:'+JSON.stringify({numbers:s.get().orders.map(o=>o.warehouseDocumentNo),counter:s.get().counters.warehouseDocumentNumber}));`);
  assert.deepEqual(restored,first);assert.deepEqual(run(code),first);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('store services have persistent unique numbers in the common warehouse series',()=>{
 const shop={id:'store',orderType:'STORE',storeRunOps:{r1Shipment:{sentAt:'2026-01-02',itemIds:['a']},r2Shipment:{sentAt:'2026-01-03',itemIds:['b']}}};
 const ordinary={id:'normal',orderType:'REMOTE',warehouseCompletedAt:'2026-01-01',warehouseDocumentNo:'W-000009'};
 const db={orders:[shop,ordinary],payments:[],audit:[],counters:{warehouseDocumentNumber:9},orderItems:[]};
 assert.equal(ensureWarehouseDocumentNumbers(db),true);assert.deepEqual(shop.storeWarehouseDocumentNos,{1:'W-000010',2:'W-000011'});assert.equal(ensureWarehouseDocumentNumbers(db),false);
 assert.equal(assignStoreWarehouseDocumentNumber(db,shop,1),'W-000010');
 const next={id:'next',orderType:'STORE'};db.orders.push(next);assert.equal(assignStoreWarehouseDocumentNumber(db,next,1),'W-000012');assert.equal(assignStoreWarehouseDocumentNumber(db,next,2),'W-000013');
 const duplicate={orders:[{id:'x',warehouseDocumentNo:'W-000001'},{id:'y',orderType:'STORE',storeWarehouseDocumentNos:{1:'W-000001'}}],counters:{},audit:[]};assert.throws(()=>ensureWarehouseDocumentNumbers(duplicate),/تکراری/);
 const full={orders:[],counters:{warehouseDocumentNumber:999999}},last={orderType:'STORE'};assert.throws(()=>assignStoreWarehouseDocumentNumber(full,last,1),/ظرفیت/);assert.equal(last.storeWarehouseDocumentNos,undefined);
});
test('SQLite migrates old store services once and retains their numbers on restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-store-doc-migration-'));
 const run=code=>{const r=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.split('RESULT:')[1].trim());};
 try{
  const audit=[{id:'audit1',action:'STORE_RUN_R1_SEND',hash:'unchanged'}];
  fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify({meta:{schemaVersion:2},users:[{id:'u1',username:'admin',roleCode:'admin',isActive:true,passwordHash:require('../lib/security').hashPassword('Initial!2345')}],orders:[{id:'old-shop',orderNo:'000002',orderType:'STORE',storeRunOps:{r1Shipment:{sentAt:'2026-01-02',itemIds:['i']},r2Shipment:{sentAt:'2026-01-03',itemIds:['j']}}},{id:'old-normal',orderNo:'000001',orderType:'REMOTE',warehouseDocumentNo:'W-000007'}],counters:{warehouseDocumentNumber:7},audit,payments:[]}));
  const code="const s=require('./lib/store');s.init();const d=s.get();console.log('RESULT:'+JSON.stringify({numbers:d.orders[0].storeWarehouseDocumentNos,normal:d.orders[1].warehouseDocumentNo,counter:d.counters.warehouseDocumentNumber,audit:d.audit}));";
  const first=run(code),again=run(code);assert.deepEqual(first,again);assert.deepEqual(first.numbers,{1:'W-000008',2:'W-000009'});assert.equal(first.normal,'W-000007');assert.equal(first.counter,9);assert.deepEqual(first.audit,audit);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('recovered no-goods legacy document remains reserved without creating a replacement on restart',()=>{
 const docs=require('../lib/warehouse-document-numbers');
 const audit={id:'final1',action:'WAREHOUSE_FINALIZE',entityId:'o',details:{warehouseDocumentNo:'W-000099',items:[{itemId:'i',status:'OUT_OF_STOCK',deliveredKg:0}]}};
 const data={orders:[{id:'o',orderType:'ONSITE',status:'RETURNED_TO_SALES',noGoodsRecovery:{warehouseDocumentNo:'W-000099',finalizeAuditId:'final1'}}],audit:[audit],counters:{warehouseDocumentNumber:99},payments:[]};
 docs.ensureWarehouseDocumentNumbers(data);assert.equal(data.orders[0].warehouseDocumentNo,undefined);assert.equal(data.counters.warehouseDocumentNumber,99);
 const next={id:'next',orderType:'ONSITE'};data.orders.push(next);assert.equal(docs.assignWarehouseDocumentNumber(data,next),'W-000100');
 docs.ensureWarehouseDocumentNumbers(data);assert.equal(data.orders[0].warehouseDocumentNo,undefined);
});
