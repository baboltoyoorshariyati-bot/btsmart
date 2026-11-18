'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn,spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-audit17-'));
const password='Audit!'+require('node:crypto').randomBytes(8).toString('hex');
let proc,agent,base,admin,gate,captures=0,mode='real',releaseCapture;
async function call(method,url,body,cookie){const res=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await res.text();let json;try{json=JSON.parse(text)}catch{}return {status:res.status,headers:res.headers,text,json};}
async function login(name){const r=await call('POST','/api/login',{username:name,password});assert.equal(r.status,200,r.text);return r.headers.get('set-cookie').split(';')[0];}
// Separate RBAC checks from the deliberately short idle-expiry test below.
async function renew(name,cookie){await call('POST','/api/logout',{},cookie);return login(name);}
before(async()=>{
 const seed=spawnSync(process.execPath,['-e',`const s=require('./lib/store'),sec=require('./lib/security');s.init();const d=s.get();d.users[0].mustChangePassword=false;for(const role of ['gate','sales'])d.users.push({id:role,username:role,roleCode:role,isActive:true,passwordHash:sec.hashPassword(process.env.ADMIN_INITIAL_PASSWORD),mustChangePassword:false});d.customers=Array.from({length:11001},(_,i)=>({id:'c'+i,name:i===0?'=1+1':'نام '+i,phone:'09123456789',code:String(i+1).padStart(5,'0')}));d.orders.push({id:'capture-order',orderNo:'000001',status:'SETTLEMENT_PENDING'},{id:'legacy-order',orderNo:'000002',status:'SETTLED',customerId:'c0',dispatch:{status:'SALES_FINALIZED',signatureData:'data:image/png;base64,legacy'}});d.payments.push({id:'legacy-pay',orderId:'legacy-order',signatureData:'data:image/png;base64,legacy',fingerprintRef:'legacy-ref',verificationMode:'FINGERPRINT'});s.save();`],{cwd:root,env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:password},encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
 agent=http.createServer(async(req,res)=>{assert.equal(req.headers.authorization,'Bearer audit-token');assert.equal(req.method,'POST');captures++;if(mode==='wait')await new Promise(resolve=>releaseCapture=resolve);if(mode==='bad'){res.end('bad');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,fingerprintRef:mode==='mock'?'mock-untrusted':'hardware-test-reference'}));});await new Promise(resolve=>agent.listen(0,'127.0.0.1',resolve));
 const listener=http.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 proc=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,DATA_DIR:dir,HOST:'127.0.0.1',PORT:String(port),SESSION_IDLE_MINUTES:'0.05',FINGERPRINT_AGENT_URL:`http://127.0.0.1:${agent.address().port}/capture`,FINGERPRINT_AGENT_TOKEN:'audit-token',FINGERPRINT_ALLOW_MOCK:'false'},stdio:['ignore','pipe','pipe']});base=`http://127.0.0.1:${port}`;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(timer);resolve()}});proc.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code))})});
 admin=await login('admin');gate=await login('gate');
});
after(async()=>{if(proc){proc.kill();await new Promise(resolve=>proc.once('exit',resolve))}if(agent)await new Promise(resolve=>agent.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
test('full CSV endpoint exports >5000 rows, neutralizes formula and respects RBAC and filters',async()=>{
 const q={source:'customers',fields:['name','code']};const r=await call('POST','/api/admin/reports/export',q,admin);
 assert.equal(r.status,200);assert.equal(r.headers.get('x-report-rows'),'11001');assert.match(r.headers.get('content-type'),/text\/csv/);assert.equal(r.text.trimEnd().split('\r\n').length,11002);assert(r.text.includes("'=1+1"));
 const filtered=await call('POST','/api/admin/reports/export',{...q,filters:[{field:'code',op:'equals',value:'10000'}]},admin);assert.equal(filtered.headers.get('x-report-rows'),'1');
 gate=await renew('gate',gate);assert.equal((await call('POST','/api/admin/reports/export',q,gate)).status,403);
 assert.equal((await call('POST','/api/admin/reports/export',{source:'__proto__'},admin)).status,400);
});
test('fingerprint capture is suspended without contacting the agent and still enforces roles',async()=>{
 gate=await renew('gate',gate);const count=captures;assert.equal((await call('POST','/api/fingerprint/capture',{orderId:'capture-order'},gate)).status,403);
 const disabled=await call('POST','/api/fingerprint/capture',{orderId:'capture-order'},admin);
 assert.equal(disabled.status,503);assert.equal(disabled.json.code,'FINGERPRINT_TEMPORARILY_DISABLED');assert.equal(captures,count);
});
test('historical biometric data survives unrelated writes',async()=>{
 const before=await call('GET','/api/orders/legacy-order',null,admin);assert.equal(before.status,200);
 assert.equal(before.json.order.payment.signatureData,'data:image/png;base64,legacy');assert.equal(before.json.order.payment.fingerprintRef,'legacy-ref');
 assert.equal((await call('POST','/api/fingerprint/capture',{orderId:'capture-order'},admin)).status,503);
 assert.equal((await call('PUT','/api/customers/c0',{name:'نام ویرایش شده'},admin)).status,200);
 const after=await call('GET','/api/orders/legacy-order',null,admin);assert.equal(after.json.order.payment.signatureData,before.json.order.payment.signatureData);assert.equal(after.json.order.payment.fingerprintRef,'legacy-ref');assert.equal(after.json.order.dispatch.hasSignature,true);
 const legacy=await call('GET','/api/admin/driver-records/legacy-order',null,admin);assert.equal(legacy.json.signatureData,'data:image/png;base64,legacy');
 gate=await renew('gate',gate);assert.equal((await call('GET','/api/admin/driver-records/legacy-order',null,gate)).status,403);
});
test('authenticated API renews browser cookie on each successful activity, unauthenticated requests do not',async()=>{
 admin=await renew('admin',admin);const until=Date.now()+3600;
 while(Date.now()<until){await new Promise(r=>setTimeout(r,450));const r=await call('GET','/api/me',null,admin);assert.equal(r.status,200);assert.doesNotMatch(r.headers.get('set-cookie'),/Max-Age|Expires/);}
 const denied=await call('GET','/api/me');assert.equal(denied.status,401);assert.equal(denied.headers.get('set-cookie'),null);
 await new Promise(r=>setTimeout(r,3200));assert.equal((await call('GET','/api/me',null,admin)).status,401);
});
test('sales can view and save current product prices; malformed numeric requests cannot mutate a saved price',async()=>{
 const sales=await login('sales');const products=await call('GET','/api/admin/products',null,sales);assert.equal(products.status,200);const productId=products.json.products[0].id,date='2026-10-14';
 const saved=await call('POST','/api/admin/prices',{productId,date,price:'۱۲۳٬۴۵۶'},sales);assert.equal(saved.status,201,saved.text);assert.equal(saved.json.price.price,123456);
 for(const price of ['abc','1e3','12abc34'])assert.equal((await call('POST','/api/admin/prices',{productId,date,price},sales)).status,400);
 const visible=await call('GET','/api/prices?date='+date,null,sales);assert.equal(visible.json.prices.find(x=>x.productId===productId).price,123456);
});
test('invalid driver plate is rejected on creation and update without modifying valid existing data',async()=>{
 const auth=await login('admin'),body={fullName:'راننده آزمایش',vehicleType:'وانت',plate:'1',phone:'09123456789'};
 assert.equal((await call('POST','/api/drivers',body,auth)).status,400);
 const created=await call('POST','/api/drivers',{...body,plate:'۱۲ب۳۴۵-۶۷'},auth);assert.equal(created.status,201,created.text);const id=created.json.driver.id;
 assert.equal((await call('PUT','/api/drivers/'+id,{plate:'1',fullName:'نباید ثبت شود'},auth)).status,400);
 const list=await call('GET','/api/drivers',null,auth);const stored=list.json.drivers.find(x=>x.id===id);assert.equal(stored.fullName,body.fullName);assert.equal(stored.plate,'12ب345-67');
});
