'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('بازگشت از آماده‌سازی انبار، حفظ پیش‌نویس و هشدار تغییرات ذخیره‌نشده', {skip:!exe,timeout:120000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-wh-back-')),base=`http://127.0.0.1:${port}`;let browser,proc;
 try{
  proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
  const admin=await browser.newContext(),sales=await browser.newContext(),wh=await browser.newContext({viewport:{width:390,height:850}});
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert.ok(r.ok(),`${url} ${r.status()}: ${await r.text()}`);return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const [username,roleCode] of [['sale1','sales'],['warehouse1','warehouse']])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false});
  await post(sales,'/api/login',{username:'sale1',password:'Changed!2345'});await post(wh,'/api/login',{username:'warehouse1',password:'Changed!2345'});
  const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const order=(await post(sales,'/api/orders/remote',{name:'مشتری آزمون',phone:'09121112233',deliveryDate:day,deliveryMode:'PICKUP',scheduledTime:'00:00',items:[{productId:'p01',requestedQty:8,requestedUnit:'کیلوگرم'},{productId:'p02',requestedQty:3,requestedUnit:'کیلوگرم'}]})).order;
  await post(wh,`/api/orders/${order.id}/warehouse/accept`,{});
  const page=await wh.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>go('warehouse','preparing'));
  const open=()=>page.locator(`[data-action=wh38-start][data-id="${order.id}"]`).click();
  const back=page.locator('[data-action=wh38-back]'),first=page.locator('[data-wh38-weight]').first(),notes=page.locator('[data-wh38-note]');
  await open();assert.equal(await back.isVisible(),true);assert.equal(await back.innerText(),'بازگشت');await back.click();await page.locator(`[data-action=wh38-start][data-id="${order.id}"]`).waitFor();
  let current=(await (await wh.request.get(base+'/api/orders/'+order.id)).json()).order;assert.equal(current.status,'WAREHOUSE_PREPARING');assert.equal(current.warehouseCompletedAt||null,null);
  await open();await first.fill('7');await notes.first().fill('توضیح انبار');
  page.once('dialog',d=>{assert.match(d.message(),/ذخیره‌نشده/);d.dismiss();});await back.click();assert.equal(await first.inputValue(),'7');
  let wait=page.waitForResponse(r=>r.url().endsWith('/warehouse/draft')&&r.request().method()==='POST');await page.locator('[data-action=wh38-save-draft]').click();assert.equal((await wait).status(),200);await page.waitForFunction(()=>document.querySelector('#wh38Body')?.dataset.dirty==='0');
  await back.click();await open();assert.equal(await first.inputValue(),'7');assert.equal(await notes.first().inputValue(),'توضیح انبار');
  await notes.nth(1).fill('یادداشت بدون وزن');wait=page.waitForResponse(r=>r.url().endsWith('/warehouse/draft')&&r.request().method()==='POST');await page.locator('[data-action=wh38-save-draft]').click();assert.equal((await wait).status(),200);await page.waitForFunction(()=>document.querySelector('#wh38Body')?.dataset.saving!=='1');
  page.once('dialog',d=>{assert.match(d.message(),/ذخیره‌نشده/);d.dismiss();});await back.click();assert.equal(await notes.nth(1).inputValue(),'یادداشت بدون وزن');
  page.once('dialog',d=>d.accept());await back.click();await open();assert.equal(await first.inputValue(),'7');assert.equal(await notes.first().inputValue(),'توضیح انبار');assert.equal(await notes.nth(1).inputValue(),'');
  current=(await (await wh.request.get(base+'/api/orders/'+order.id)).json()).order;assert.equal(current.status,'WAREHOUSE_PREPARING');assert.equal(current.warehouseWeightDraft.items[0].deliveredKg,7);assert.equal(current.warehouseCompletedAt||null,null);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
