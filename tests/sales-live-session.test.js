'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('sessions have no time limit; independent tabs, reload grace, and last-tab close',()=>{
 const sec=require('../lib/security'),now=Date.now,base=now();let t=base;Date.now=()=>t;
 try{sec.destroyAllSessions();const sid=sec.createSession('u','ip',true);assert.doesNotMatch(sec.sessionCookie(sid,sec.getSession(sid)),/Max-Age|Expires/);sec.browserPing(sid,'a');sec.browserPing(sid,'b');sec.browserLeave(sid,'a');t+=9000;assert(sec.getSession(sid));sec.browserLeave(sid,'b');t+=5000;assert(sec.getSession(sid));sec.browserPing(sid,'c');t+=4000;assert(sec.getSession(sid));sec.browserLeave(sid,'c');t+=8001;assert.equal(sec.getSession(sid),null);const long=sec.createSession('u','ip',true);sec.browserPing(long,'a');t+=48*60*60*1000;assert(sec.getSession(long));assert.equal(sec.countUserSessions('u'),1);sec.browserLeave(long,'a');t+=8001;sec.pruneSessions();assert.equal(sec.getSession(long),null);assert.equal(sec.countUserSessions('u'),0);const api=sec.createSession('u','ip');t+=48*60*60*1000;assert(sec.getSession(api));sec.destroySession(api);assert.equal(sec.getSession(api),null);}finally{Date.now=now;sec.destroyAllSessions();}
});
test('live sales, invoice audit history and per-account login exclusion', {timeout:50000},async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-sales-live-')),base=`http://127.0.0.1:${port}`;let proc;
 const call=async(method,url,body,cookie)=>{const res=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,json:await res.json(),cookie:(res.headers.get('set-cookie')||'').split(';')[0],set:res.headers.get('set-cookie')};};
 const ok=async(method,url,body,cookie,expected=200)=>{const r=await call(method,url,body,cookie);assert.equal(r.status,expected,JSON.stringify(r.json));return r;};
 try{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
 const admin=(await ok('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
 for(const role of ['sales','warehouse'])await ok('POST','/api/admin/users',{username:role,password:'Changed!2345',fullName:role,position:'تست',roleCode:role,mustChangePassword:false},admin,201);
 const salesLogin=await ok('POST','/api/login',{username:'sales',password:'Changed!2345',browserSession:true});const sales=salesLogin.cookie;assert.doesNotMatch(salesLogin.set,/Max-Age|Expires/);assert.equal((await call('POST','/api/login',{username:'sales',password:'Changed!2345'})).status,409);const warehouse=(await ok('POST','/api/login',{username:'warehouse',password:'Changed!2345'})).cookie;
 assert.equal((await call('GET','/api/sales/overview',null,warehouse)).status,403);assert.equal((await call('GET','/api/sales/history',null,warehouse)).status,403);assert.equal((await call('GET','/api/sales/daily-products',null,warehouse)).status,403);
 await ok('POST','/api/session/presence',{tabId:'a'.repeat(32)},sales);
 const order=(await ok('POST','/api/orders/remote',{name:'مشتری آزمون',phone:'09121112233',scheduledTime:'00:00',items:[{productId:'p01',requestedQty:2,requestedUnit:'کیلوگرم'}]},sales,201)).json.order;
 assert.equal((await ok('GET','/api/sales/overview',null,sales)).json.ordersToday,1);
 await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{},warehouse);await ok('POST',`/api/orders/${order.id}/warehouse/start-preparing`,{},warehouse);await ok('POST',`/api/orders/${order.id}/warehouse`,{items:[{itemId:order.items[0].id,deliveredKg:2}]},warehouse);
 assert.equal((await ok('GET','/api/sales/overview',null,sales)).json.pendingSettlement,1);
 const settled=(await ok('POST',`/api/orders/${order.id}/settle`,{signatureData:`data:image/png;base64,${'A'.repeat(300)}`,noFingerprintAllowed:true,items:[{itemId:order.items[0].id,unitPrice:1000}]},sales)).json.order;
 let stats=(await ok('GET','/api/sales/overview',null,sales)).json;assert.equal(stats.salesTotal,2000);assert.equal(stats.invoicesToday,1);assert.equal(stats.pendingSettlement,0);
 const daily=(await ok('GET','/api/sales/daily-products',null,sales)).json;assert.equal(daily.sales.total,2000);assert.equal(daily.orders.kg,2);assert.equal(daily.sales.rows[0].amount,2000);assert.equal(daily.orders.rows[0].units['کیلوگرم'],2);
 let h=(await ok('GET','/api/sales/history?q='+encodeURIComponent(settled.payment.invoiceNumber),null,sales)).json;assert.equal(h.total,1);assert.equal(h.orders[0].id,order.id);
 h=(await ok('GET','/api/sales/history/'+order.id,null,sales)).json;assert(h.events.some(e=>e.action==='CREATE_REMOTE_ORDER'));assert(h.events.some(e=>e.action==='WAREHOUSE_FINALIZE'));assert(h.events.some(e=>e.action==='FINAL_SETTLEMENT'));assert.equal(h.order.invoices[0].total,2000);
 await ok('POST','/api/logout',{},sales);assert.equal((await call('POST','/api/login',{username:'sales',password:'Changed!2345'})).status,200);
 }finally{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
