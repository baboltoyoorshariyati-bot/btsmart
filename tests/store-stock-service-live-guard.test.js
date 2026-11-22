'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const R=require('../lib/store-stock-service-repository');

test('مسیرهای قدیمی HTTP نمی‌توانند سفارش عضو سرویس آزمایشی را تغییر دهند', {timeout:90000}, async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-stock-live-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let sql;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const res=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:(res.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert.ok(r.status>=200&&r.status<300,`${url}: ${r.status} ${JSON.stringify(r.body)}`);return r.body;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  for(const [username,roleCode,extra] of [['sale1','sales',{}],['wh1','warehouse',{}],['shop1','store',{storeName:'شعبه یک'}]])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false,...extra},admin);
  const login=async username=>(await call('POST','/api/login',{username,password:'Changed!2345'})).cookie;
  const sales=await login('sale1'),wh=await login('wh1'),shop=await login('shop1');
  const make=async(qty,purpose='STOCK',productId='p01')=>(await ok('POST','/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:purpose,...(purpose==='CUSTOMER'?{name:'مشتری',phone:'09121112234'}:{}),items:[{productId,requestedQty:qty,requestedUnit:'کیلوگرم'}]},shop)).order;
  const order=await make(50),preparing=await make(30),independent=await make(20,'CUSTOMER');
  for(const o of [order,preparing,independent])await ok('POST',`/api/store/orders/${o.id}/quick-send`,{},sales);
  await ok('POST',`/api/orders/${preparing.id}/warehouse/accept`,{},wh);
  const driver=(await ok('POST','/api/transport/drivers',{fullName:'راننده تست',phone:'09121112235'},admin)).driver;
  const vehicle=(await ok('POST','/api/transport/vehicles',{vehicleType:'وانت',plate:'12ب34567'},admin)).vehicle;
  await ok('PUT',`/api/transport/drivers/${driver.id}/resources`,{vehicleId:vehicle.id,paymentDeviceId:''},admin);
  sql=new DatabaseSync(path.join(dir,'baboltoyoor.db'));sql.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');R.initialize(sql);
  const at=new Date().toISOString(),by='test';let service=R.create(sql,{id:'experimental-service',branchNo:order.branchNo,createdAt:at,createdBy:by});
  service=R.addOrder(sql,service.id,order.id,{expectedRevision:service.revision,at,by});service=R.addOrder(sql,service.id,preparing.id,{expectedRevision:service.revision,at,by});
  const beforeOrder=(await ok('GET',`/api/orders/${order.id}`,null,wh)).order,beforePreparing=(await ok('GET',`/api/orders/${preparing.id}`,null,wh)).order;
  const counts=()=>({audit:sql.prepare('SELECT count(*) AS n FROM audit').get().n,notifications:sql.prepare('SELECT count(*) AS n FROM notifications').get().n});
  const before=counts();
  for(const [url,body] of [[`/api/orders/${order.id}/warehouse/accept`,{}],[`/api/orders/${preparing.id}/store-run/weights`,{run:1,items:[{itemId:preparing.items[0].id,deliveredKg:30}]}],[`/api/transport/plans/${order.id}/assign`,{run:1,driverId:driver.id,vehicleId:vehicle.id}]]){
    const r=await call('POST',url,body,url.includes('/transport/')?admin:wh);assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.body.code,'STOCK_SERVICE_MEMBER_LOCKED');
  }
  assert.deepEqual((await ok('GET',`/api/orders/${order.id}`,null,wh)).order,beforeOrder);assert.deepEqual((await ok('GET',`/api/orders/${preparing.id}`,null,wh)).order,beforePreparing);assert.deepEqual(counts(),before);assert.deepEqual(R.read(sql,service.id),service);
  // A catalog rename through the real admin route would invalidate the live
  // source snapshot. Roll back the change and audit, but allow unrelated edits.
  const products=(await ok('GET','/api/admin/products',null,admin)).products,product=products.find(p=>p.id==='p01'),other=products.find(p=>p.id==='p02');
  const rename=await call('PUT','/api/admin/products/p01',{name:'نام جدید'},admin);
  assert.equal(rename.status,409,JSON.stringify(rename));assert.equal(rename.body.code,'STOCK_SERVICE_PRODUCT_LOCKED');assert.deepEqual(counts(),before);
  assert.equal((await ok('GET','/api/admin/products',null,admin)).products.find(p=>p.id==='p01').name,product.name);
  await ok('PUT','/api/admin/products/p01',{isActive:false},admin);
  await ok('PUT','/api/admin/products/p02',{name:'کالای مستقل'},admin);
  assert.equal((await ok('GET','/api/admin/products',null,admin)).products.find(p=>p.id==='p02').name,'کالای مستقل');
  await ok('PUT','/api/admin/products/p01',{isActive:product.isActive},admin);
  await ok('PUT','/api/admin/products/p02',{name:other.name},admin);
  await ok('POST',`/api/orders/${independent.id}/warehouse/accept`,{},wh);
  await ok('POST',`/api/orders/${independent.id}/store-run/weights`,{run:1,items:[{itemId:independent.items[0].id,deliveredKg:20}]},wh);
  // The real legacy HTTP weight and repository membership compete on the same
  // write lock: exactly one can win for an initially unprocessed order.
  const racing=await make(25);await ok('POST',`/api/store/orders/${racing.id}/quick-send`,{},sales);await ok('POST',`/api/orders/${racing.id}/warehouse/accept`,{},wh);
  const {Worker}=require('node:worker_threads'),shared=new SharedArrayBuffer(4),flag=new Int32Array(shared);
  const source=`const {parentPort,workerData:w}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const R=require(w.repo),db=new DatabaseSync(w.file);db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(w.shared),0,0);try{R.joinApproved(db,w.orderId,{at:w.at,by:'test'});parentPort.postMessage({ok:true});}catch(e){parentPort.postMessage({ok:false,error:e.message});}finally{db.close();}`;
  const worker=new Worker(source,{eval:true,workerData:{repo:path.join(__dirname,'../lib/store-stock-service-repository.js'),file:path.join(dir,'baboltoyoor.db'),orderId:racing.id,at,shared}});
  try{
    let request;
    const memberResult=new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready){request=call('POST',`/api/orders/${racing.id}/store-run/weights`,{run:1,items:[{itemId:racing.items[0].id,deliveredKg:25}]},wh);Atomics.store(flag,0,1);Atomics.notify(flag,0);}else resolve(m);});worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('worker exited '+code));});});
    const member=await memberResult,http=await request,linked=sql.prepare('SELECT service_id FROM stock_service_draft_members WHERE order_id=?').get(racing.id);
    const item=JSON.parse(sql.prepare('SELECT payload FROM order_items WHERE id=?').get(racing.items[0].id).payload),kg=require('../lib/store-runs').r1Kg(item);
    if(member.ok){assert.equal(http.status,409,JSON.stringify(http));assert.equal(http.body.code,'STOCK_SERVICE_MEMBER_LOCKED');assert.equal(linked.service_id,service.id);assert.equal(kg,0);service=R.read(sql,service.id);}
    else{assert.equal(http.status,200,JSON.stringify({http,member}));assert.equal(linked,undefined);assert.equal(kg,25);}
  }finally{await worker.terminate();}
  // Catalog rename versus joining a fresh product: if the rename wins it is
  // included in the source snapshot; if membership wins the rename is refused.
  const catalogRace=await make(7,'STOCK','p03');await ok('POST',`/api/store/orders/${catalogRace.id}/quick-send`,{},sales);
  const catalogShared=new SharedArrayBuffer(4),catalogFlag=new Int32Array(catalogShared);
  const catalogWorker=new Worker(source,{eval:true,workerData:{repo:path.join(__dirname,'../lib/store-stock-service-repository.js'),file:path.join(dir,'baboltoyoor.db'),orderId:catalogRace.id,at,shared:catalogShared}});
  try{
    let request;
    const joined=new Promise((resolve,reject)=>{catalogWorker.on('message',m=>{if(m.ready){request=call('PUT','/api/admin/products/p03',{name:'نام رقابت'},admin);Atomics.store(catalogFlag,0,1);Atomics.notify(catalogFlag,0);}else resolve(m);});catalogWorker.on('error',reject);catalogWorker.on('exit',code=>{if(code)reject(Error('worker exited '+code));});});
    const member=await joined,http=await request;assert.equal(member.ok,true,JSON.stringify(member));
    assert.ok(http.status===200||(http.status===409&&http.body.code==='STOCK_SERVICE_PRODUCT_LOCKED'),JSON.stringify(http));
    service=R.read(sql,service.id);const sourceRow=service.sources.find(s=>s.orderId===catalogRace.id),product=JSON.parse(sql.prepare('SELECT payload FROM products WHERE id=?').get('p03').payload);
    assert.equal(sourceRow.productName,product.name);if(http.status===200)assert.equal(product.name,'نام رقابت');
  }finally{await catalogWorker.terminate();}
  // A separate, uncooperative SQL connection is outside this guard. The
  // repository must still detect that conflict before touching the service.
  const item=JSON.parse(sql.prepare('SELECT payload FROM order_items WHERE id=?').get(preparing.items[0].id).payload);item.requestedQty=31;sql.prepare('UPDATE order_items SET payload=? WHERE id=?').run(JSON.stringify(item),item.id);
  assert.throws(()=>R.transition(sql,service.id,'weigh',{productId:'p01',itemIds:[preparing.items[0].id],deliveredKg:30,expectedRevision:service.revision,at,by}),/اقلام عضو تغییر/);
  assert.deepEqual(R.read(sql,service.id),service);
  item.requestedQty=30;sql.prepare('UPDATE order_items SET payload=? WHERE id=?').run(JSON.stringify(item),item.id);
  // Install the optional SQL guard only in this disposable database. The same
  // real HTTP routes now fail inside SQLite before the transaction snapshot
  // check; the response and reloaded in-memory state must still be correct.
  require('../lib/store-stock-sql-guard').install(sql);
  const preTriggerOrder=(await ok('GET',`/api/orders/${order.id}`,null,wh)).order,preTriggerCounts=counts();
  for(const [method,url,body,user,code] of [['POST',`/api/orders/${order.id}/warehouse/accept`,{},wh,'STOCK_SERVICE_MEMBER_LOCKED'],['PUT','/api/admin/products/p01',{name:'تغییر ممنوع'},admin,'STOCK_SERVICE_PRODUCT_LOCKED']]){
   const res=await call(method,url,body,user);assert.equal(res.status,409,JSON.stringify(res));assert.equal(res.body.code,code);
  }
  assert.deepEqual((await ok('GET',`/api/orders/${order.id}`,null,wh)).order,preTriggerOrder);assert.deepEqual(counts(),preTriggerCounts);assert.deepEqual(R.read(sql,service.id),service);
  const sqlRace=await make(19,'STOCK','p04');await ok('POST',`/api/store/orders/${sqlRace.id}/quick-send`,{},sales);await ok('POST',`/api/orders/${sqlRace.id}/warehouse/accept`,{},wh);
  const sqlShared=new SharedArrayBuffer(4),sqlFlag=new Int32Array(sqlShared);
  const sqlWorker=new Worker(source,{eval:true,workerData:{repo:path.join(__dirname,'../lib/store-stock-service-repository.js'),file:path.join(dir,'baboltoyoor.db'),orderId:sqlRace.id,at,shared:sqlShared}});
  try{
    let request;
    const joined=new Promise((resolve,reject)=>{sqlWorker.on('message',m=>{if(m.ready){request=call('POST',`/api/orders/${sqlRace.id}/store-run/weights`,{run:1,items:[{itemId:sqlRace.items[0].id,deliveredKg:19}]},wh);Atomics.store(sqlFlag,0,1);Atomics.notify(sqlFlag,0);}else resolve(m);});sqlWorker.on('error',reject);sqlWorker.on('exit',code=>{if(code)reject(Error('worker exited '+code));});});
    const member=await joined,http=await request,linked=sql.prepare('SELECT service_id FROM stock_service_draft_members WHERE order_id=?').get(sqlRace.id),item=JSON.parse(sql.prepare('SELECT payload FROM order_items WHERE id=?').get(sqlRace.items[0].id).payload),kg=require('../lib/store-runs').r1Kg(item);
    if(member.ok){assert.equal(http.status,409,JSON.stringify(http));assert.equal(http.body.code,'STOCK_SERVICE_MEMBER_LOCKED');assert.equal(linked.service_id,service.id);assert.equal(kg,0);}
    else{assert.equal(http.status,200,JSON.stringify({http,member}));assert.equal(linked,undefined);assert.equal(kg,19);}
  }finally{await sqlWorker.terminate();}
 }finally{
  if(sql)sql.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});
 }
});
