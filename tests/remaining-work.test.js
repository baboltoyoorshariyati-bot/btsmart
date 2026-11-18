'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-remaining-'));
process.env.DATA_DIR=path.join(root,'data');process.env.ADMIN_INITIAL_PASSWORD='MigrationTest1234';
const store=require('../lib/store'),{queryOrders,pagination}=require('../lib/order-search');
before(()=>{
 store.init();const data=store.sql.load();
 data.customers=[{id:'c',name:'ÜBER مشتری',phone:'09123456789',plate:'12B345'},{id:'other',name:'another',phone:'0911'}];
 data.visits=[{id:'v',customerId:'c'}];
 data.orders=Array.from({length:12},(_,i)=>({id:'o'+i,orderNo:String(i).padStart(6,'0'),customerId:i===2?'':(i%2?'other':'c'),visitId:'v',orderType:'ONSITE',status:['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','SETTLED','EXITED'][i%4],createdAt:'2026-11-11T12:00:00.000Z',...(i===6?{dispatch:{status:'ASSIGNED'}}:{})}));
 data.orderItems=data.orders.map(o=>({id:'i-'+o.id,orderId:o.id,productId:data.products[0].id}));
 data.payments=[{id:'pay',orderId:'o2',invoiceNumber:'INV-ÜBER'}];
 store.sql.save(data);store.reloadFromSql();
});
after(()=>{store.sql.close();fs.rmSync(root,{recursive:true,force:true});});
test('SQL order pagination matches legacy RBAC, ordering and literal Unicode search',()=>{
 const db=store.get();
 for(const role of ['admin','gate','warehouse'])for(const q of ['', 'üBER','%','12b345',"' OR 1=1 --"]){
  const query=q.toLowerCase();let rows=[...db.orders].reverse();
  if(role==='gate')rows=rows.filter(o=>['SETTLED','EXITED'].includes(o.status)&&!o.dispatch);
  else if(role==='warehouse')rows=rows.filter(o=>['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(o.status));
  if(query)rows=rows.filter(o=>{const c=db.customers.find(c=>c.id===o.customerId);return[o.orderNo,o.storeName,c?.name,c?.phone,c?.plate].some(v=>String(v||'').toLowerCase().includes(query));});
  const page=queryOrders({role,q:query,limit:3,offset:1});assert.equal(page.total,rows.length);assert.deepEqual(page.orders.map(o=>o.id),rows.slice(1,4).map(o=>o.id));
 }
 assert.equal(queryOrders({history:true,q:'inv-über'}).orders[0].id,'o2');
 assert(queryOrders({history:true,q:'über'}).orders.some(o=>o.id==='o2'));
 assert.deepEqual(pagination(new URLSearchParams('limit=Infinity&offset=-10')),{limit:100,offset:0});
});
test('offline migration backs up first, preserves data and enforces deferred foreign keys and username uniqueness',()=>{
 const {migrate}=require('../scripts/migrate-integrity'),file=store.dbFile(),data=JSON.stringify(store.sql.load());
 store.sql.close();
 assert.equal(migrate(file).applied,false);
 const lockFile=path.join(process.env.DATA_DIR,'.lock');fs.writeFileSync(lockFile,'active');
 assert.throws(()=>migrate(file,{apply:true}));fs.unlinkSync(lockFile);
 const result=migrate(file,{apply:true});assert(result.applied);assert(fs.existsSync(result.backup));
 store.sql.init();assert.equal(JSON.stringify(store.sql.load()),data);
 assert.throws(()=>store.sql.run("INSERT INTO users(id,username,payload) VALUES('dupe','ADMIN','{}')"),/UNIQUE/);
 assert.throws(()=>store.sql.run("INSERT INTO order_items(id,order_id,product_id,payload) VALUES('orphan','missing','missing','{}')"),/FOREIGN KEY/);
 assert.equal(store.sql.all('PRAGMA foreign_key_check').length,0);
 // A pre-migration snapshot remains compatible with the upgraded database.
 store.sql.restoreSnapshot(result.backup);assert.equal(JSON.stringify(store.sql.load()),data);
 store.sql.close();assert(migrate(file,{apply:true}).ok);store.sql.init();
});
test('encrypted snapshot authenticates data, refuses overwrites and rejects corruption or wrong keys',async()=>{
 const {encryptDatabase,decryptDatabase}=require('../lib/encrypted-backup');
 const encrypted=path.join(root,'copy.bte'),plain=path.join(root,'restored.db'),secret='IndependentBackupPassword123!';
 await encryptDatabase(store.dbFile(),encrypted,secret);
 assert.notEqual(fs.readFileSync(encrypted).subarray(0,16).toString(),'SQLite format 3\u0000');
 await decryptDatabase(encrypted,plain,secret);
 store.sql.validateSnapshot(plain);
 await assert.rejects(()=>encryptDatabase(store.dbFile(),encrypted,secret));
 const wrong=path.join(root,'wrong.db');await assert.rejects(()=>decryptDatabase(encrypted,wrong,'DefinitelyWrongPassword123'));assert(!fs.existsSync(wrong));
 const bytes=fs.readFileSync(encrypted);bytes[40]^=1;fs.writeFileSync(encrypted,bytes);
 await assert.rejects(()=>decryptDatabase(encrypted,wrong,secret));assert(!fs.existsSync(wrong));
 assert(!fs.readdirSync(root).some(n=>n.endsWith('.partial')));
});
test('monitor checks backups and sends minimal HTTPS alerts without database details',async()=>{
 const {checkService,sendAlert}=require('../lib/service-monitor');
 const fetchHealth=async()=>({ok:true,json:async()=>({service:'baboltoyoor',status:'ok',release:'test'})});
 assert.equal((await checkService({url:'https://example.invalid/api/health',dataDir:root,fetchImpl:fetchHealth})).ok,true);
 fs.writeFileSync(path.join(root,'auto-backup.json'),JSON.stringify({enabled:true,lastSuccessAt:'2000-01-01'}));
 await assert.rejects(()=>checkService({url:'https://example.invalid',dataDir:root,fetchImpl:fetchHealth}));
 let called=false;
 await sendAlert('https://example.invalid/alerts',{token:'secret',fetchImpl:async(url,options)=>{called=true;assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer secret');assert(!options.body.includes('secret'));assert(!options.body.includes('customer'));return{ok:true};}});assert(called);
 await assert.rejects(()=>sendAlert('http://example.invalid/alerts'));
 await assert.rejects(()=>sendAlert('https://user:password@example.invalid/alerts'));
});
