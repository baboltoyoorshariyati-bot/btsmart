'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('empty installation, safe atomic additive import, permissions, audit and restart',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-excel-api-')),base=`http://127.0.0.1:${port}`;let proc;
 const start=async()=>{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_TEST_EMPTY_CATALOG:'1'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});};
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}};
 const call=async(method,url,body,cookie,headers={})=>{const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});let data=await r.json();return {status:r.status,data,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
 try{
  await start();let a=await call('POST','/api/login',{username:'admin',password:'Initial!2345'}),admin=a.cookie;
  assert.equal((await call('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin)).status,200);
  for(const role of ['sales','gate'])assert.equal((await call('POST','/api/admin/users',{username:'test-'+role,password:'Changed!2345',fullName:'تست',position:'تست',roleCode:role,mustChangePassword:false},admin)).status,201);
  const sales=(await call('POST','/api/login',{username:'test-sales',password:'Changed!2345'})).cookie,gate=(await call('POST','/api/login',{username:'test-gate',password:'Changed!2345'})).cookie;
  const products=async()=>(await call('GET','/api/admin/products',null,admin)).data.products;
  assert.deepEqual(await products(),[]);
  const valid={rows:[{quickCode:1,name:'مرغ'}, {quickCode:'۰۲',name:'ران'}, {quickCode:'03',name:'=1+1'}]};
  assert.equal((await call('POST','/api/admin/products/import',valid,gate)).status,403);
  assert.equal((await call('POST','/api/admin/products/import',{rows:[{quickCode:'04',name:'سالم'},{quickCode:'۰۴',name:'تکراری'}]},sales)).status,400);
  assert.equal((await call('POST','/api/admin/products/import',{rows:[{quickCode:'04',name:'سالم'},{quickCode:'xx',name:'نامعتبر'}]},sales)).status,400);assert.deepEqual(await products(),[]);
  const first=await call('POST','/api/admin/products/import',valid,sales,{'Idempotency-Key':'product-import-01'});assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.data.added,3);
  const replay=await call('POST','/api/admin/products/import',valid,sales,{'Idempotency-Key':'product-import-01'});assert.equal(replay.data.added,3);
  let current=await products();assert.deepEqual(current.map(p=>p.quickCode),['01','02','03']);assert(current.every(p=>p.defaultUnit==='کیلوگرم'));const old=current[0];
  assert.equal((await call('PUT','/api/admin/products/'+old.id,{isActive:false},admin)).status,200);
  const repeat=await call('POST','/api/admin/products/import',{rows:[{quickCode:'1',name:'نام دیگر'},{quickCode:'04',name:'محصول جدید'}]},sales);assert.equal(repeat.status,200);assert.equal(repeat.data.added,1);assert.deepEqual(repeat.data.skipped,[{quickCode:'01',name:'نام دیگر',existingName:'مرغ'}]);
  current=await products();assert.equal(current.find(p=>p.id===old.id).name,'مرغ');assert.equal(current.find(p=>p.id===old.id).isActive,false);
  const {DatabaseSync}=require('node:sqlite'),sql=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  try {
   sql.exec("CREATE TRIGGER test_import_rollback BEFORE INSERT ON products WHEN NEW.quick_code='06' BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
   const failed=await call('POST','/api/admin/products/import',{rows:[{quickCode:'05',name:'نباید ثبت شود'},{quickCode:'06',name:'خطای آزمایشی'}]},sales);
   assert.equal(failed.status,500);assert.deepEqual(await products(),current);
  } finally {sql.exec('DROP TRIGGER IF EXISTS test_import_rollback');sql.close();}
  const events=(await call('GET','/api/admin/audit?action=PRODUCTS_IMPORTED',null,admin)).data.audit;assert.equal(events.length,2);assert.equal(events[0].username,'test-sales');
  await stop();await start();admin=(await call('POST','/api/login',{username:'admin',password:'Changed!2345'})).cookie;assert.deepEqual(await products(),current);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
