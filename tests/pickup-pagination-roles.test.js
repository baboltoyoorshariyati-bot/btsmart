'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('active pickup pages cover all visits and are restricted to operational roles without financial data',{timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-pages-')),cwd=path.join(__dirname,'..'),env={...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_PICKUP_STAGING:'true',PORT:String(port),HOST:'127.0.0.1'};
 const seed=spawnSync(process.execPath,['-e',`const s=require('./lib/store');s.init();let d=s.get();for(let i=0;i<205;i++){let id='o'+i,v='v'+i;d.orders.push({id,orderNo:'R'+i,orderType:'REMOTE',deliveryMode:'PICKUP',customerId:'buyer',visitId:v,status:'WAREHOUSE_PENDING',deposit:{amount:999999}});d.visits.push({id:v,orderId:id,customerId:'buyer',status:'PICKUP_PRESENT',recipient:{name:'شخص '+i,phone:'09121112233'},createdAt:new Date().toISOString()});}d.customers.push({id:'buyer',name:'خریدار',phone:'09121112222'});s.save();`],{cwd,env,encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
 const proc=spawn(process.execPath,['server.js'],{cwd,env,stdio:['ignore','pipe','pipe']}),base=`http://127.0.0.1:${port}`;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  async function call(method,url,body,cookie=''){const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
  const login=await call('POST','/api/login',{username:'admin',password:'Initial!2345'}),admin=login.cookie;assert.equal(login.status,200);assert.equal((await call('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin)).status,200);
  for(const role of ['gate','warehouse','sales','store','dispatch']){const user=await call('POST','/api/admin/users',{username:'test-'+role,roleCode:role,fullName:role,position:'تست',storeName:'فروشگاه آزمون',password:'Changed!2345',mustChangePassword:false},admin);assert.equal(user.status,201,JSON.stringify(user.data));}
  for(const role of ['gate','warehouse','sales','store','dispatch']){
   const c=(await call('POST','/api/login',{username:'test-'+role,password:'Changed!2345'})).cookie;
   const first=await call('GET','/api/pickup/active',null,c);
   if(['store','dispatch'].includes(role)){assert.equal(first.status,403);continue;}
   assert.equal(first.status,200);assert.equal(first.data.total,205);assert.equal(first.data.orders.length,100);
   const second=await call('GET','/api/pickup/active?offset=100',null,c),third=await call('GET','/api/pickup/active?offset=200',null,c);
   assert.equal(second.data.orders.length,100);assert.equal(third.data.orders.length,5);
   const all=[...first.data.orders,...second.data.orders,...third.data.orders];assert.equal(new Set(all.map(o=>o.id)).size,205);assert(!JSON.stringify(all).includes('deposit'));assert(!JSON.stringify(all).includes('999999'));
  }
  assert.equal((await call('GET','/api/pickup/active')).status,401);
 }finally{if(proc.exitCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
