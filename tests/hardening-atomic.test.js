'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-atomic-'));
process.env.DATA_DIR=dir;process.env.ADMIN_INITIAL_PASSWORD='AtomicTest12345';
const store=require('../lib/store'),sec=require('../lib/security');
require('../lib/routes');
const {createHandler}=require('../lib/http');
let server,base,cookie,product;
before(async()=>{
 store.init();const db=store.get();db.users[0].mustChangePassword=false;
 db.customers.push({id:'c',name:'test',phone:'09123456789'});
 for(const id of ['write-fail','idem-fail','success'])db.visits.push({id,customerId:'c',status:'WAITING_SALES'});
 store.save();product=db.products[0].id;
 cookie='sid='+sec.createSession('u1','127.0.0.1');
 server=http.createServer(createHandler());await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));store.sql.close();fs.rmSync(dir,{recursive:true,force:true});});
async function create(visit,key){const response=await fetch(base+'/api/orders',{method:'POST',headers:{cookie,'content-type':'application/json','user-agent':'AtomicAudit/1.0','idempotency-key':key},body:JSON.stringify({visitId:visit,deliveryMode:'PICKUP',items:[{productId:product,requestedQty:1,requestedUnit:'کیلوگرم'}]})});return{status:response.status,body:await response.json(),replayed:response.headers.get('idempotent-replayed')};}
for(const [visit,table] of [['write-fail','orderItems'],['idem-fail','idempotency']])test(`failed ${table} write rolls back the whole request including counters`,async()=>{
 const before=JSON.stringify(store.sql.load()),put=store.sql.put;
 store.sql.put=function(key,...args){if(key===table)throw Error('simulated storage failure');return put.call(this,key,...args);};
 try{assert.equal((await create(visit,visit+'-key')).status,500);}finally{store.sql.put=put;}
 assert.equal(JSON.stringify(store.sql.load()),before);
 assert.equal(store.get().visits.find(v=>v.id===visit).status,'WAITING_SALES');
 assert.equal((await create(visit,visit+'-key')).status,201);
});
test('successful order and retry commit exactly once with browser audit metadata',async()=>{
 const first=await create('success','success-key');assert.equal(first.status,201);
 const second=await create('success','success-key');assert.equal(second.status,201);assert.equal(second.replayed,'true');assert.deepEqual(second.body,first.body);
 assert.equal(store.get().orders.filter(o=>o.visitId==='success').length,1);
 assert.equal(store.get().audit.find(e=>e.action==='CREATE_ORDER'&&e.entityId===first.body.order.id).userAgent,'AtomicAudit/1.0');
 assert.equal(store.verifyAuditChain().ok,true);
 assert.equal((await create('write-fail','success-key')).status,409);
});
test('health endpoint identifies this application and database readiness',async()=>{
 const response=await fetch(base+'/api/health');assert.equal(response.status,200);assert.equal((await response.json()).service,'baboltoyoor');
});
