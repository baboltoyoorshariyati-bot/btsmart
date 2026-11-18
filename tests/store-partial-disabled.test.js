'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('خاموش‌سازی صریح اضطراری از ثبت سفارش جزئی جدید جلوگیری می‌کند',{timeout:30000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-partial-off-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_ENABLE_PARTIAL_STORE_ORDER:'0'},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
 const call=async(url,data,cookie)=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
 const admin=(await call('/api/login',{username:'admin',password:'Initial!2345'})).cookie;assert.equal((await call('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin)).status,200);assert.equal((await call('/api/admin/users',{username:'shop-off',roleCode:'store',fullName:'فروشگاه',position:'تست',storeName:'فروشگاه',password:'Changed!2345',mustChangePassword:false},admin)).status,201);const shop=(await call('/api/login',{username:'shop-off',password:'Changed!2345'})).cookie;
 const me=await fetch(base+'/api/me',{headers:{cookie:shop}});assert.equal((await me.json()).features.partialStoreOrders,false);
 const result=await call('/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:'STOCK',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]},shop);assert.equal(result.status,503);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});

test('وقتی گردش ترابری خاموش است ایجاد سفارش جزئی ممکن نیست',{timeout:30000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-partial-off-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
 const call=async(url,data,cookie)=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
 const admin=(await call('/api/login',{username:'admin',password:'Initial!2345'})).cookie;assert.equal((await call('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin)).status,200);assert.equal((await call('/api/admin/users',{username:'shop-off',roleCode:'store',fullName:'فروشگاه',position:'تست',storeName:'فروشگاه',password:'Changed!2345',mustChangePassword:false},admin)).status,201);const shop=(await call('/api/login',{username:'shop-off',password:'Changed!2345'})).cookie;
 const me=await fetch(base+'/api/me',{headers:{cookie:shop}});assert.equal((await me.json()).features.partialStoreOrders,false);
 const result=await call('/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:'STOCK',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]},shop);assert.equal(result.status,503);
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
