'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const core = require('../lib/customer-core');

test('phone keys and existing conflicts are detected without altering records', () => {
  assert.equal(core.phoneKey('۰۹۱۲-۱۱۱-۲۲۳۳'), core.phoneKey('+989121112233'));
  assert.equal(core.phoneKey('00989121112233'), core.phoneKey('09121112233'));
  assert.notEqual(core.phoneKey('+12025550123'), core.phoneKey('12025550123'));
  const db = {customers:[{id:'1',name:'الف',phone:'09121112233'}, {id:'2',name:'ب',phone:'09121110000',phone2:'+989121112233'}]};
  assert.equal(core.duplicatePhones(db).length,1);
  assert.equal(core.duplicatePhones(db)[0].customers.length,2);
  assert.equal(core.findExisting(db,{phone:'09121112233'}),null);
  assert.throws(()=>require('../lib/customers').upsertCustomer(db,{name:'الف',phone:'09121112233',customerId:'1'}),/چند پرونده/);
  assert.equal(db.customers.length,2);
});

test('customer identity uses normalized phones across creation, edits, visits and orders', {timeout:60000}, async () => {
  const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-customer-identity-')),base=`http://127.0.0.1:${port}`;
  const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exited '+c)));});
    let cookie='';
    const call=async(method,url,body)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};};
    await call('POST','/api/login',{username:'admin',password:'Initial!2345'});
    await call('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
    const create=async(body)=>call('POST','/api/customers',body);
    const first=await create({name:'علی رضایی',phone:'۰۹۱۲-۱۱۱-۲۲۳۳',phone2:'09121112244'});assert.equal(first.status,201,JSON.stringify(first.body));
    for(const phone of ['+989121112233','00989121112233','09121112244']) {
      const dup=await create({name:'حسن رضایی',phone});assert.equal(dup.status,409);assert.equal(dup.body.code,'DUPLICATE_PHONE');
    }
    const second=await create({name:'حسن رضایی',phone:'09121112255'});assert.equal(second.status,201);
    const id=first.body.customer.id, secondId=second.body.customer.id;
    for(const q of ['+989121112233','09121112244','۰۹۱۲۱۱۱۲۲۳۳']) {const search=await call('GET','/api/customers/search?q='+encodeURIComponent(q));assert(search.body.customers.some(c=>c.id===id));}
    assert.equal((await call('PUT',`/api/customers/${secondId}`,{phone:'+989121112233'})).status,409);
    assert.equal((await call('PUT',`/api/customers/${secondId}`,{phone2:'09121112244'})).status,409);
    const visit=(name,phone,extra={})=>call('POST','/api/visits',{name,phone,noVehicle:true,...extra});
    assert.equal((await visit('نام متفاوت','09121112233')).status,409);
    assert.equal((await visit('نام متفاوت','09121112233',{customerId:id})).status,409);
    assert.equal((await visit('علی رضایی','09121112255',{customerId:id})).status,409);
    const v=await visit('علی رضایی','+989121112233');assert.equal(v.status,201,JSON.stringify(v.body));assert.equal(v.body.visit.customerId,id);
    const alt=await visit('علی رضایی','09121112244');assert.equal(alt.status,201);assert.equal(alt.body.visit.customerId,id);
    assert.equal((await call('GET',`/api/customers/${id}`)).body.customer.phone,'09121112233');
    const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
    const order={name:'علی رضایی',phone:'09121112233',deliveryMode:'PICKUP',scheduledDate:day,deliveryDate:day,items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]};
    assert.equal((await call('POST','/api/orders/remote',{...order,name:'نام دیگر',customerId:id})).status,409);
    assert.equal((await call('POST','/api/orders/remote',{...order,customerId:secondId})).status,409);
    assert.equal((await call('POST','/api/orders/remote',order)).status,201);
    assert.equal((await call('GET',`/api/customers/${id}`)).body.customer.name,'علی رضایی');
    // The same vehicle plate does not merge two different phone owners.
    const withPlate=await call('POST','/api/visits',{name:'شخص خودرو',phone:'09121117771',vehicleType:'خودرو',carType:'وانت',plate:'12ب34567'});assert.equal(withPlate.status,201,JSON.stringify(withPlate.body));
    const sharedPlate=await call('POST','/api/visits',{name:'شخص خودرو',phone:'09121117772',vehicleType:'خودرو',carType:'وانت',plate:'12ب34567'});assert.equal(sharedPlate.status,201);assert.notEqual(sharedPlate.body.visit.customerId,withPlate.body.visit.customerId);
    const shop=await call('POST','/api/admin/users',{username:'identity-shop',roleCode:'store',fullName:'فروشگاه آزمون',position:'آزمون',storeName:'فروشگاه',password:'Changed!2345',mustChangePassword:false});assert.equal(shop.status,201);
    const storeOrder={storeId:shop.body.user.id,name:'نام دیگر',phone:'09121112233',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]};
    const storeDifferent=await call('POST','/api/store/orders',storeOrder);assert.equal(storeDifferent.status,201);assert.equal(storeDifferent.body.order.customerId,null);assert.equal(storeDifferent.body.order.customer.name,'نام دیگر');
    const storeOk=await call('POST','/api/store/orders',{...storeOrder,name:'علی رضایی'});assert.equal(storeOk.status,201,JSON.stringify(storeOk.body));assert.equal(storeOk.body.order.customerId,null);
    const storeEdit=await call('PUT',`/api/store/orders/${storeOk.body.order.id}`,{...storeOrder,name:'علی رضایی',phone:'09121112255'});assert.equal(storeEdit.status,200);assert.equal(storeEdit.body.order.customer.phone,'09121112255');
    assert.equal((await call('GET',`/api/customers/${id}`)).body.customer.name,'علی رضایی');
    const concurrent=await Promise.all([create({name:'الف همزمان',phone:'09121116666'}),create({name:'ب همزمان',phone:'+989121116666'})]);
    assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);
    assert.deepEqual((await call('GET','/api/customers/duplicate-phones')).body.duplicates,[]);
    // Simulate a pre-upgrade duplicate without going through the protected API.
    const script=`const store=require('./lib/store');store.sql.init();require('./lib/transport-transaction')(()=>{store.get().customers.push({id:'legacy-duplicate',code:'99999',name:'پرونده قدیمی',phone:'+989121112233'});store.save();});`;
    const worker=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir},encoding:'utf8'});assert.equal(worker.status,0,worker.stderr);
    const report=await call('GET','/api/customers/duplicate-phones');assert.equal(report.status,200);assert.equal(report.body.duplicates.length,1);assert.equal(report.body.duplicates[0].customers.length,2);
    assert.equal((await visit('علی رضایی','09121112233',{customerId:id})).status,409);
    assert.equal((await call('PUT','/api/customers/legacy-duplicate',{phone:'09121119999'})).status,200);
    assert.deepEqual((await call('GET','/api/customers/duplicate-phones')).body.duplicates,[]);
    await call('POST','/api/login',{username:'identity-shop',password:'Changed!2345'});
    assert.equal((await call('GET','/api/customers/duplicate-phones')).status,403);

  } finally {if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
