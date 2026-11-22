'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('قفل تراکنش اعضای تجمیعی: قلم و سفارش و عضویت همراه حسابرسی rollback می‌شوند',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-stock-guard-'));
 process.env.DATA_DIR=dir;process.env.ADMIN_INITIAL_PASSWORD='StockTest!234';
 const store=require('../lib/store'),R=require('../lib/store-stock-service-repository'),tx=require('../lib/transport-transaction');
 try{
  store.init();const db=store.sql.init();R.initialize(db);
  const at='2026-01-01T00:00:00.000Z',by='warehouse';
  const order=id=>({id,orderNo:'B'+id,branchNo:1,storeId:'shop',orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,approvalStatus:'APPROVED',transportWorkflow:1,deliveryMode:'DELIVERY',status:'WAREHOUSE_PENDING',createdAt:at});
  const item=(id,orderId)=>({id,orderId,productId:'p01',requestedQty:10,requestedUnit:'کیلوگرم',itemStatus:'PENDING'});
  store.get().orders.push(order('a'),order('b'));store.get().orderItems.push(item('a1','a'),item('b1','b'));store.save();
  let service=R.joinApproved(db,'a',{at,by});
  const getState=()=>({orders:store.sql.all('SELECT * FROM orders ORDER BY id'),items:store.sql.all('SELECT * FROM order_items ORDER BY id'),members:store.sql.all('SELECT * FROM stock_service_draft_members ORDER BY order_id'),audit:store.sql.all('SELECT * FROM audit ORDER BY id')});
  const baseline=getState();
  const attempts=[
   ()=>store.sql.run('UPDATE orders SET status=? WHERE id=?',['CLOSED','a']),
   ()=>store.sql.run('UPDATE order_items SET order_id=? WHERE id=?',['b','a1']),
   ()=>store.sql.run('UPDATE order_items SET order_id=? WHERE id=?',['a','b1']),
   ()=>store.sql.run('DELETE FROM order_items WHERE id=?',['a1']),
   ()=>store.sql.run('INSERT INTO order_items(id,order_id,payload) VALUES(?,?,?)',['extra','a',JSON.stringify(item('extra','a'))]),
   ()=>store.sql.run('DELETE FROM orders WHERE id=?',['a']),
   ()=>store.sql.run('DELETE FROM stock_service_draft_members WHERE order_id=?',['a']),
  ];
  for(const attempt of attempts){
   assert.throws(()=>tx(()=>{store.audit(store.get().users[0],'TEST_GUARD','order','a');attempt();}),e=>e.status===409&&e.code==='STOCK_SERVICE_MEMBER_LOCKED');
   assert.deepEqual(getState(),baseline);assert.equal(store.verifyAuditChain().ok,true);
  }
  const original=store.sql.get('SELECT * FROM products WHERE id=?',['p01']);
  const productAttempts=[
   ()=>store.sql.run('UPDATE products SET name=? WHERE id=?',['تغییر','p01']),
   ()=>{const payload=JSON.parse(original.payload);payload.name='تغییر';store.sql.run('UPDATE products SET payload=? WHERE id=?',[JSON.stringify(payload),'p01']);},
   ()=>store.sql.run('DELETE FROM products WHERE id=?',['p01']),
  ];
  for(const attempt of productAttempts){
   assert.throws(()=>tx(()=>{store.audit(store.get().users[0],'TEST_CATALOG','product','p01');attempt();}),e=>e.status===409&&e.code==='STOCK_SERVICE_PRODUCT_LOCKED');
   assert.deepEqual(store.sql.get('SELECT * FROM products WHERE id=?',['p01']),original);assert.deepEqual(getState(),baseline);assert.equal(store.verifyAuditChain().ok,true);
  }
  tx(()=>{store.get().orders.find(o=>o.id==='b').status='WAREHOUSE_PREPARING';});
  assert.equal(store.get().orders.find(o=>o.id==='b').status,'WAREHOUSE_PREPARING');
  service=tx(()=>R.transitionLocked(db,service.id,'weigh',{expectedRevision:service.revision,at,by,productId:'p01',itemIds:['a1'],deliveredKg:10}));
  assert.equal(R.read(db,service.id).weighings[0].kg,10,'service-only transitions do not touch protected original rows');
 }finally{store.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('محافظ در تعداد بالای عضو همهٔ دسته‌ها را بررسی می‌کند',()=>{
 const db=new DatabaseSync(':memory:'),schema=require('../lib/store-stock-service-schema'),guard=require('../lib/store-stock-legacy-guard');
 try{
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE orders(id TEXT PRIMARY KEY,payload TEXT); CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,payload TEXT); CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,payload TEXT);');schema.initialize(db);
  const sources=Array.from({length:510},(_,i)=>({productId:String(i).padStart(4,'0')}));
  db.prepare('INSERT INTO stock_service_drafts VALUES(?,?,?,?,?)').run('s',1,'OPEN',0,JSON.stringify({sources}));
  const order=db.prepare('INSERT INTO orders VALUES(?,?)'),member=db.prepare('INSERT INTO stock_service_draft_members VALUES(?,?)'),product=db.prepare('INSERT INTO products VALUES(?,?,?)');
  for(const {productId:id} of sources){order.run(id,'{}');member.run(id,'s');product.run(id,id,JSON.stringify({id,name:id}));}
  const sql={all:(statement,params=[])=>db.prepare(statement).all(...params)};
  db.exec('BEGIN IMMEDIATE');const before=guard.capture(sql);db.prepare('UPDATE orders SET payload=? WHERE id=?').run('{"changed":true}','0509');
  assert.throws(()=>guard.assertUnchanged(sql,before),e=>e.code==='STOCK_SERVICE_MEMBER_LOCKED');db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT payload FROM orders WHERE id=?').get('0509').payload,'{}');
  db.exec('BEGIN IMMEDIATE');const productBefore=guard.capture(sql);db.prepare('UPDATE products SET name=? WHERE id=?').run('changed','0509');
  assert.throws(()=>guard.assertUnchanged(sql,productBefore),e=>e.code==='STOCK_SERVICE_PRODUCT_LOCKED');db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT name FROM products WHERE id=?').get('0509').name,'0509');
 }finally{db.close();}
});

test('محافظ نام فقط محصولات سرویس‌های باز و در جریان را نگه می‌دارد',()=>{
 const db=new DatabaseSync(':memory:'),schema=require('../lib/store-stock-service-schema'),guard=require('../lib/store-stock-legacy-guard');
 try{
  db.exec('CREATE TABLE orders(id TEXT PRIMARY KEY,payload TEXT); CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,payload TEXT); CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,payload TEXT);');schema.initialize(db);
  const addService=db.prepare('INSERT INTO stock_service_drafts VALUES(?,?,?,?,?)'),addMember=db.prepare('INSERT INTO stock_service_draft_members VALUES(?,?)'),addProduct=db.prepare('INSERT INTO products VALUES(?,?,?)');
  addService.run('active',1,'HANDED_OVER',0,JSON.stringify({sources:[{productId:'p1'}],transport:{stage:'IN_TRANSIT'}}));
  addService.run('finished',2,'HANDED_OVER',0,JSON.stringify({sources:[{productId:'p2'}],transport:{stage:'CLOSED'}}));
  addMember.run('a','active');addMember.run('b','finished');
  for(const id of ['p1','p2'])addProduct.run(id,id,JSON.stringify({id,name:id}));
  const sql={all:(statement,params=[])=>db.prepare(statement).all(...params)};
  db.exec('BEGIN');const before=guard.capture(sql);
  db.prepare('UPDATE products SET name=?,payload=? WHERE id=?').run('new',JSON.stringify({id:'p2',name:'new'}),'p2');
  guard.assertUnchanged(sql,before);
  db.prepare('UPDATE products SET name=? WHERE id=?').run('new','p1');
  assert.throws(()=>guard.assertUnchanged(sql,before),e=>e.code==='STOCK_SERVICE_PRODUCT_LOCKED');db.exec('ROLLBACK');
 }finally{db.close();}
});
