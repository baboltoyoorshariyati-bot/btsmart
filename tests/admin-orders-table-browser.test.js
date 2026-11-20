'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('مرورگر: جدول سوابق مدیر، جستجو و بازکردن جزئیات در عرض‌های مختلف',{skip:!process.env.BT_CHROMIUM_PATH,timeout:60000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-admin-table-')),base=`http://127.0.0.1:${port}`,proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(timer);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:process.env.BT_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext();
  const post=async(url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+await r.text());return r.json()};
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const order=(await post('/api/orders/remote',{name:'مشتری تست جدول مدیریت',phone:'09121112233',scheduledTime:'00:00',deliveryMode:'PICKUP',deliveryDate:new Date().toISOString().slice(0,10),items:[{productId:'p01',requestedQty:4,requestedUnit:'کیلوگرم'}]})).order;
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});await page.evaluate(()=>go('orders-history'));
  const table=page.locator('.adm-orders-table'),row=table.locator(`tr[data-admin-order="${order.id}"]`);await row.waitFor();
  assert.deepEqual(await table.locator('> thead th').allInnerTexts(),['شماره سفارش','مشتری / فروشگاه','ثبت سفارش','آخرین اقدام','وضعیت','عملیات']);
  for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});if(width<640)await page.waitForTimeout(350);assert.equal(await row.locator('td[data-label]').count(),6);assert.equal(await row.evaluate(e=>getComputedStyle(e).display),width<=900?'block':'table-row');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const button=row.locator('[data-admin-order-history]');await button.scrollIntoViewIfNeeded();assert(await button.isVisible());}
  await row.locator('[data-admin-order-history]').click();await page.locator('#modal.open').waitFor();assert.match(await page.locator('#modal').innerText(),/مشتری تست جدول مدیریت/);await page.evaluate(()=>closeModal());
  await page.locator('#admOrderSearch input').fill('ناموجودمنحصربه‌فرد');await page.locator('#admOrderSearch button').click();await page.getByText('سفارشی یافت نشد').waitFor();assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
