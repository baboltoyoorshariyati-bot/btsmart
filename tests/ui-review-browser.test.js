'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: گروه‌بندی پشتیبان، وضعیت گزارش و برچسب فرم‌ها در موبایل و دسکتاپ',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-ui-review-'));const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),base=`http://127.0.0.1:${port}`;
  const post=async(u,data)=>{const r=await ctx.request.post(base+u,{data});assert.ok(r.ok(),`${u}: ${r.status()} ${await r.text()}`);return r.json();};
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});await post('/api/admin/backups',{});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  const go=async(...view)=>{await page.evaluate(async v=>{await window.go(...v);if(app.salesFetchPromise)await app.salesFetchPromise;clearInterval(app.timer);app.timer=null;},view);};
  for(const width of [320,768,1280]){
   await page.setViewportSize({width,height:850});await go('backups');await page.locator('#backup-create').waitFor();
   assert.equal(await page.locator('.adm-backup-action').count(),2);assert.equal(await page.locator('.adm-backup-list-title').innerText(),'نسخه‌های پشتیبان');
   assert.equal(await page.locator('.adm-backup-layout tbody tr:first-child [data-label]').count(),4);
   assert.equal(await page.locator('[data-backup-restore]').count(),1);
   assert.ok(await page.locator('#backup-create').isVisible());
   await go('reports');await page.locator('#repSource').waitFor();assert.ok(await page.locator('.adm-report-placeholder').isVisible());
   await page.locator('[data-adm=rep-add-filter]').click();assert.equal(await page.getByLabel('مقدار فیلتر ۱').count(),1);
   await page.locator('[data-adm=rep-run]').click();await page.waitForFunction(()=>!document.querySelector('.adm-report-placeholder'));
   assert.match(await page.locator('#repSummary').innerText(),/ردیف/);
   await go('gate','entry');await page.locator('#gateForm').waitFor();await page.locator('label[for=gateCustomerName]').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'gateCustomerName');
   await go('sales','remote');await page.locator('#phoneOrderFormV25').waitFor();assert.equal(await page.getByLabel('نام مشتری',{exact:true}).count(),1);assert.equal(await page.getByLabel('محصول ردیف ۱').count(),1);
   await go('sales','future');await page.locator('#futureOrderFormV25').waitFor();assert.equal(await page.getByLabel('نام مشتری',{exact:true}).count(),1);assert.equal(await page.getByLabel('تاریخ تحویل').count(),1);assert.equal(await page.getByLabel('مقدار ردیف ۱').count(),1);
   await go('store','create');await page.locator('#storeOrderForm').waitFor();assert.equal(await page.getByLabel('نام مشتری',{exact:true}).count(),0);await go('store','partial');await page.locator('#storeOrderForm').waitFor();assert.equal(await page.getByLabel('نام مشتری',{exact:true}).count(),1);
   await go('products');await page.locator('[data-price-for]').first().waitFor();assert.ok(await page.locator('[data-price-for]').first().getAttribute('aria-label'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`overflow ${width}`);
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
