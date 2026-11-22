'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {spawn}=require('node:child_process'), fs=require('node:fs'), os=require('node:os'), path=require('node:path'), net=require('node:net');
test('sales can create a product, other operational roles cannot; validation and audit still apply',{timeout:60000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-sales-product-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie,headers={})=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;
  assert.equal((await call('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin)).status,200);
  const cookies={};for(const role of ['sales','gate','warehouse','store','dispatch']){const user=await call('POST','/api/admin/users',{username:'product-'+role,roleCode:role,fullName:role,position:'آزمایش',storeName:'فروشگاه',password:'Changed!2345',mustChangePassword:false},admin);assert.equal(user.status,201,JSON.stringify(user.data));cookies[role]=(await call('POST','/api/login',{username:'product-'+role,password:'Changed!2345'})).cookie;assert(cookies[role]);}
  const rows=(await call('GET','/api/admin/products',null,admin)).data.products;
  const code=Array.from({length:100},(_,i)=>String(i).padStart(2,'0')).find(c=>!rows.some(p=>p.quickCode===c));assert(code);
  const body={quickCode:code,name:'کالای آزمایشی فروش',defaultUnit:'بسته'};
  for(const role of ['gate','warehouse','store','dispatch'])assert.equal((await call('POST','/api/admin/products',body,cookies[role])).status,403,role);
  assert.equal((await call('POST','/api/admin/products',{...body,quickCode:'a1'},cookies.sales)).status,400);
  assert.equal((await call('POST','/api/admin/products',{...body,name:''},cookies.sales)).status,400);
  assert.equal((await call('POST','/api/admin/products',{...body,defaultUnit:'نامعتبر'},cookies.sales)).status,400);
  const made=await call('POST','/api/admin/products',body,cookies.sales,{'Idempotency-Key':'sales-create-test'});assert.equal(made.status,201,JSON.stringify(made.data));const product=made.data.product;assert.equal(product.isActive,true);
  const retry=await call('POST','/api/admin/products',body,cookies.sales,{'Idempotency-Key':'sales-create-test'});assert.equal(retry.status,201);assert.equal(retry.data.product.id,product.id);
  assert.equal((await call('POST','/api/admin/products',{...body,name:'نام دیگر'},cookies.sales)).status,409);
  assert.equal((await call('DELETE','/api/admin/products/'+product.id,null,cookies.sales)).status,403);
  assert((await call('GET','/api/products/search?q='+encodeURIComponent(body.name),null,cookies.sales)).data.products.some(p=>p.id===product.id));
  const audit=await call('GET','/api/admin/audit?action=PRODUCT_CREATED&entityId='+product.id,null,admin);assert.equal(audit.data.total,1);assert.equal(audit.data.audit[0].username,'product-sales');
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
