'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('sales cancellation appears live in the gate queue and gate confirms exit',{skip:!exe,timeout:60000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-onsite-ui-')),base=`http://127.0.0.1:${port}`;let proc,browser;
 try{
  proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext(),gate=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const role of ['sales','gate'])await post(admin,'/api/admin/users',{username:'ui-'+role,roleCode:role,fullName:role,position:'تست',password:'Changed!2345',mustChangePassword:false});
  await post(sales,'/api/login',{username:'ui-sales',password:'Changed!2345'});await post(gate,'/api/login',{username:'ui-gate',password:'Changed!2345'});
  const sp=await sales.newPage(),gp=await gate.newPage();await Promise.all([sp.goto(base,{waitUntil:'networkidle'}),gp.goto(base,{waitUntil:'networkidle'})]);await sp.evaluate(()=>go('sales','onsite'));await gp.evaluate(()=>go('gate','exit'));
  const v=(await post(gate,'/api/visits',{name:'مشتری آزمون',phone:'09121112233',noVehicle:true})).visit;
  await sp.evaluate(()=>renderSales('onsite'));const button=sp.locator(`[data-action="cancel-onsite"][data-id="${v.id}"]`);await button.waitFor();sp.on('dialog',async d=>{if(d.type()==='prompt')await d.accept('انصراف مشتری');else await d.accept();});await button.click();
  const row=gp.locator(`[data-cancelled-visit="${v.id}"]`);await row.waitFor({timeout:12000});assert.match(await row.innerText(),/خروج بدون کالا/);gp.on('dialog',d=>d.accept());await row.locator('[data-action="cancelled-onsite-exit"]').click();await row.waitFor({state:'detached',timeout:12000});
  const result=await gate.request.get(base+'/api/visits?id='+v.id);assert.equal((await result.json()).visits[0].status,'EXITED');
  const v2=(await post(gate,'/api/visits',{name:'مشتری دوم',phone:'09121112234',noVehicle:true})).visit;await post(sales,'/api/orders',{visitId:v2.id,items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]});await sp.evaluate(async()=>{await fetchSalesCache(true);await renderSales('flow');});const btn2=sp.locator(`[data-action="cancel-onsite"][data-id="${v2.id}"]`);await btn2.waitFor();await btn2.click();await gp.locator(`[data-cancelled-visit="${v2.id}"]`).waitFor({timeout:12000});
 }finally{if(browser)await browser.close();if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
