'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('warehouse transfers refresh automatically, retain data on failure and respect tab changes',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-wh-transfer-live-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
  const admin=await browser.newContext(),source=await browser.newContext(),dest=await browser.newContext(),sales=await browser.newContext(),warehouse=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const a=(await post(admin,'/api/admin/store-branches',{name:'فرستنده',branchNo:2})).branch,b=(await post(admin,'/api/admin/store-branches',{name:'گیرنده',branchNo:3})).branch;
  for(const [username,roleCode,extra] of [['src','store',{branchId:a.id}],['dst','store',{branchId:b.id}],['sale','sales',{}],['wh-user','warehouse',{}]])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false,...extra});
  for(const [ctx,username] of [[source,'src'],[dest,'dst'],[sales,'sale'],[warehouse,'wh-user']])await post(ctx,'/api/login',{username,password:'Changed!2345'});
  const makeTransfer=async()=>{
   const t=(await post(source,'/api/store/transfers',{destinationBranchId:b.id,sendDate:'2026-11-18',items:[{productId:'p01',kg:1,price:1000}]})).transfer;
   await post(dest,`/api/store/transfers/${t.id}/review`,{decision:'APPROVE',revision:1,physicalReceipt:true});return t;
  };
  const first=await makeTransfer(),second=await makeTransfer();
  await post(sales,`/api/sales/transfers/${first.id}/review`,{decision:'APPROVE',revision:1});
  const page=await warehouse.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>{app.wh38.storeTab='transfers';return go('warehouse','stores');});
  await page.locator(`[data-transfer-open="${first.id}"]`).waitFor();
  assert.equal(await page.locator('[data-transfer-refresh]').count(),0);
  await page.locator(`[data-transfer-open="${first.id}"]`).click();await page.locator('#modal [data-tr-modal=approve]').waitFor();
  await page.evaluate(()=>{window.__transferPanel=document.querySelector('[data-transfer-panel]');});
  await post(sales,`/api/sales/transfers/${second.id}/review`,{decision:'APPROVE',revision:1});
  let started,release;const request=new Promise(r=>started=r),hold=new Promise(r=>release=r);
  await page.route('**/api/warehouse/transfers',async route=>{started();await hold;await route.continue();});
  try{
   await Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('warehouse transfer poll did not start')),15000))]);
   assert.equal(await page.evaluate(()=>window.__transferPanel.isConnected),true);
   assert.equal(await page.locator(`[data-transfer-open="${first.id}"]`).count(),1);
   assert.equal(await page.locator(`[data-transfer-open="${second.id}"]`).count(),0);
   assert.equal(await page.locator('#modal [data-tr-modal=approve]').isVisible(),true);
  }finally{release();}
  await page.unrouteAll({behavior:'wait'});await page.locator(`[data-transfer-open="${second.id}"]`).waitFor();
  assert.equal(await page.evaluate(()=>window.__transferPanel===document.querySelector('[data-transfer-panel]')),true);
  // A transient failure does not erase the list and a subsequent success clears the warning.
  await page.route('**/api/warehouse/transfers',route=>route.abort());
  await page.evaluate(()=>document.querySelector('[data-transfer-panel]')._transferRefresh());
  assert.match(await page.locator('[data-transfer-refresh-warning]').innerText(),/قدیمی/);
  assert.equal(await page.locator(`[data-transfer-open="${second.id}"]`).count(),1);
  await page.unrouteAll({behavior:'wait'});await page.evaluate(()=>document.querySelector('[data-transfer-panel]')._transferRefresh());
  assert.equal(await page.locator('[data-transfer-refresh-warning]').count(),0);
  // An earlier slow order-tab response may not overwrite a newly selected transfer tab.
  await page.evaluate(()=>closeModal());
  let historyStarted,releaseHistory;const historyRequest=new Promise(r=>historyStarted=r),historyHold=new Promise(r=>releaseHistory=r);
  await page.route(url=>url.pathname==='/api/warehouse/history',async route=>{historyStarted();await historyHold;await route.continue();});
  await page.locator('[data-wh38-store-tab=incoming]').click();
  try{
   await Promise.race([historyRequest,new Promise((_,reject)=>setTimeout(()=>reject(Error('warehouse order request did not start')),10000))]);
   await page.locator('[data-wh38-store-tab=transfers]').click();
  }finally{releaseHistory();}
  await page.unrouteAll({behavior:'wait'});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>app.wh38.storeTab),'transfers');
  assert.equal(await page.locator(`[data-transfer-open="${first.id}"]`).count(),1);
  // If the first load fails, the next real seven-second tick retries automatically.
  await page.route('**/api/warehouse/transfers',route=>route.abort());
  await page.evaluate(()=>{app.wh38.storeTab='transfers';return go('warehouse','stores');});
  await page.locator('[data-transfer-panel] [role=alert]').waitFor();
  assert.equal(await page.locator('[data-transfer-refresh]').count(),0);
  await page.unrouteAll({behavior:'wait'});await page.locator(`[data-transfer-open="${first.id}"]`).waitFor({timeout:15000});
  assert.equal(await page.locator('[data-transfer-panel] [role=alert]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
