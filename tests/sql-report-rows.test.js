'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-sql-reports-'));
process.env.DATA_DIR=root;process.env.SQLITE_FILE=path.join(root,'test.db');process.env.ADMIN_INITIAL_PASSWORD='Synthetic!Reports2026';
const store=require('../lib/store'),reports=require('../lib/reports'),read=require('../lib/sql-report-rows');
test('SQL report joins match legacy rows and never select scoped data globally',t=>{
 t.after(()=>{store.sql.close();fs.rmSync(root,{recursive:true,force:true});});store.init();
 const data=store.sql.load();
 data.customers=[{id:'c1',name:'علی',code:'00001',phone:'09120000000'}];
 data.orders=[{id:'o1',customerId:'c1',orderNo:'000001',orderType:'STORE',storeName:'مرکز',branchNo:2,storeId:'s1',createdAt:'2026-11-11T10:00:00Z'}, {id:'o2',customerId:'missing',orderNo:'000002',createdAt:'2026-11-10T10:00:00Z'}];
 data.orderItems=[{id:'i1',orderId:'o1',productId:data.products[0].id,requestedQty:3},{id:'i2',orderId:'o1',productId:'missing',productName:'نام ثبت‌شده',unit:'عدد'}];
 data.payments=[{id:'p1',orderId:'o1',invoiceNumber:'000001',totalAmount:2500},{id:'p2',orderId:'o2',customerId:'c1',totalAmount:0}];
 store.sql.save(data);require('../lib/sql-repos').clearCache();
 for(const source of ['orders','orderItems','payments'])assert.deepEqual(read.build(source),reports.SOURCES[source].build(data),source);
 assert.equal(read.canonical(store.get()),true);
 const scoped={...data,orders:[],orderItems:[],payments:[]};assert.equal(read.canonical(scoped),false);
 for(const source of ['orders','orderItems','payments'])assert.equal(reports.query(scoped,{source}).total,0);
});
