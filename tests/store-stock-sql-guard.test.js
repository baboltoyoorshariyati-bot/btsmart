'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('محافظ پایگاه آزمایشی، نوشتن اتصال مستقل و REPLACE را برای اعضا رد می‌کند',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-sql-stock-'));
 process.env.DATA_DIR=dir;process.env.ADMIN_INITIAL_PASSWORD='StockTest!234';
 const store=require('../lib/store'),repo=require('../lib/store-stock-service-repository'),guard=require('../lib/store-stock-sql-guard');
 let external;
 try{
  store.init();const db=store.sql.init();repo.initialize(db);
  const at='2026-01-01T00:00:00.000Z';
  for(const id of ['a','b']){
   store.get().orders.push({id,orderNo:'B'+id,branchNo:1,storeId:'shop',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,approvalStatus:'APPROVED',transportWorkflow:1,deliveryMode:'DELIVERY',status:'WAREHOUSE_PENDING',createdAt:at});
   store.get().orderItems.push({id:id+'1',orderId:id,productId:'p01',requestedQty:10,requestedUnit:'کیلوگرم',itemStatus:'PENDING'});
  }
  store.save();const service=repo.joinApproved(db,'a',{at,by:'test'});
  guard.install(db);
  external=new DatabaseSync(path.join(dir,'baboltoyoor.db'));external.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=OFF; PRAGMA trusted_schema=OFF;');
  const snapshot=()=>({orders:db.prepare('SELECT * FROM orders ORDER BY id').all(),items:db.prepare('SELECT * FROM order_items ORDER BY id').all(),members:db.prepare('SELECT * FROM stock_service_draft_members').all(),drafts:db.prepare('SELECT * FROM stock_service_drafts').all(),products:db.prepare('SELECT * FROM products ORDER BY id').all()});
  const initial=snapshot();
  const attempts=[
   "UPDATE orders SET status='CLOSED' WHERE id='a'",
   "DELETE FROM orders WHERE id='a'",
   "INSERT OR REPLACE INTO orders SELECT * FROM orders WHERE id='a'",
   "UPDATE order_items SET order_id='b' WHERE id='a1'",
   "UPDATE order_items SET order_id='a' WHERE id='b1'",
   "DELETE FROM order_items WHERE id='a1'",
   "INSERT OR REPLACE INTO order_items SELECT * FROM order_items WHERE id='a1'",
   "UPDATE stock_service_draft_members SET service_id='other' WHERE order_id='a'",
   "DELETE FROM stock_service_draft_members WHERE order_id='a'",
   "INSERT OR REPLACE INTO stock_service_draft_members VALUES('a','other')",
   `DELETE FROM stock_service_drafts WHERE id='${service.id}'`,
   `INSERT OR REPLACE INTO stock_service_drafts SELECT * FROM stock_service_drafts WHERE id='${service.id}'`,
  ];
  for(const statement of attempts){assert.throws(()=>external.exec(statement),/STOCK_SERVICE_MEMBER_LOCKED/,statement);assert.deepEqual(snapshot(),initial);}
  for(const statement of ["UPDATE products SET name='new' WHERE id='p01'","UPDATE products SET payload=json_set(payload,'$.name','new') WHERE id='p01'","DELETE FROM products WHERE id='p01'","INSERT OR REPLACE INTO products SELECT id,created_at,quick_code,'new',is_active,default_unit,json_set(payload,'$.name','new') FROM products WHERE id='p01'"]){assert.throws(()=>external.exec(statement),/STOCK_SERVICE_PRODUCT_LOCKED/,statement);assert.deepEqual(snapshot(),initial);}
  // Normal independent records and non-name catalog fields remain writable.
  external.exec("UPDATE orders SET status='WAREHOUSE_PREPARING' WHERE id='b'; UPDATE products SET is_active=0,payload=json_set(payload,'$.isActive',0) WHERE id='p01'; UPDATE products SET name='other' WHERE id='p02';");
  assert.equal(external.prepare("SELECT status FROM orders WHERE id='b'").get().status,'WAREHOUSE_PREPARING');
  // Joining another member and a later legacy write inside the same SQL
  // transaction is rejected before that write reaches the database.
  external.exec('BEGIN IMMEDIATE');
  try{
   const s=repo.joinApprovedLocked(external,'b',{at,by:'test'});assert.equal(s.orders.length,2);
   assert.throws(()=>external.exec("UPDATE orders SET status='CLOSED' WHERE id='b'"),/STOCK_SERVICE_MEMBER_LOCKED/);
  } finally{external.exec('ROLLBACK');}
  assert.equal(external.prepare("SELECT count(*) AS n FROM stock_service_draft_members WHERE order_id='b'").get().n,0);
  // Installation is atomic and does not silently accept existing names.
  assert.throws(()=>guard.install(db),/already exists/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='trigger' AND name LIKE 'stock_sql_guard_%'").get().n,guard.statements.length);
  // Existing security policy rejects backup triggers: activation must first
  // design trusted schema validation and a safe atomic restore, not silently
  // weaken this policy or ship an unrestorable backup.
  const backup=path.join(dir,'guarded-backup.db');store.sql.vacuumInto(backup);
  assert.throws(()=>store.sql.validateSnapshot(backup),/ساختار پشتیبان مجاز نیست/);
  const genuine=Object.assign(new Error('STOCK_SERVICE_MEMBER_LOCKED'),{code:'ERR_SQLITE_ERROR',errcode:1811});
  assert.equal(guard.translate(genuine).status,409);
  const fake=Object.assign(new Error('STOCK_SERVICE_MEMBER_LOCKED'),{code:'ERR_SQLITE_ERROR',errcode:1});assert.equal(guard.translate(fake),fake);
 }finally{if(external)external.close();store.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});
