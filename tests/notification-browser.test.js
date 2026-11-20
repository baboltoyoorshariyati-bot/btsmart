'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: اعلان، مقصد دقیق، شمارنده و پاسخ قدیمی؛ سربرگ‌های راننده و نگهبانی', {skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-notif-browser-'));
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const base=`http://127.0.0.1:${port}`;browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
  const admin=await browser.newContext(),gate=await browser.newContext(),sales=await browser.newContext(),store=await browser.newContext(),wh=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert.ok(r.ok(),`${url} ${r.status()} ${await r.text()}`);return r.json()};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const [username,roleCode,extra] of [['gate1','gate',{}],['sales1','sales',{}],['shop1','store',{storeName:'فروشگاه تست'}],['wh1','warehouse',{}]])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false,...extra});
  await post(gate,'/api/login',{username:'gate1',password:'Changed!2345'});await post(sales,'/api/login',{username:'sales1',password:'Changed!2345'});await post(store,'/api/login',{username:'shop1',password:'Changed!2345'});await post(wh,'/api/login',{username:'wh1',password:'Changed!2345'});
  const visit=(await post(gate,'/api/visits',{name:'مراجعه نمونه',phone:'09121112233',noVehicle:true})).visit;
  const order=(await post(store,'/api/store/orders',{name:'مشتری سفارش',phone:'09122223344',items:[{productId:'p01',requestedQty:10,requestedUnit:'کیلوگرم'}]})).order;
  const page=await sales.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.app===undefined?document.querySelector('#bellCount')?.textContent: true);
  await page.locator('#bell').click();const visitButton=page.locator(`[data-action="open-notification"][data-entity-id="${visit.id}"]`);await visitButton.waitFor();
  assert.equal(await page.locator('#bellCount').innerText(),'۲');
  // یک GET قدیمی را پس از ثبت خواندن آزاد می‌کنیم.
  let unblock,hit;const blocked=new Promise(r=>unblock=r),seen=new Promise(r=>hit=r);let once=true;
  await page.route('**/api/notifications',async route=>{if(!once)return route.continue();once=false;const response=await route.fetch();hit();await blocked;await route.fulfill({response});});
  await page.evaluate(()=>{void refreshIndicators()});await seen;
  await visitButton.click();await page.waitForSelector('#content [data-action=submit-order]');
  assert.equal(await page.locator('#bellCount').innerText(),'۱');
  assert.equal(await page.locator(`#content [data-action="submit-order"]`).getAttribute('data-id'),visit.id);
  assert.equal(await page.evaluate(()=>app.notifSoundNodes.length),0);
  unblock();await page.waitForTimeout(300);assert.equal(await page.locator('#bellCount').innerText(),'۱');
  await page.unroute('**/api/notifications');
  await page.locator('#bell').click();await page.locator(`[data-action="open-notification"][data-entity-id="${order.id}"]`).click();
  await page.waitForSelector('#modal.open');assert.ok((await page.locator('#modal').innerText()).includes('فروشگاه شعبه 1 تست'));
  assert.equal(await page.locator('#bellCount').evaluate(e=>e.classList.contains('hidden')),true);
  const apiState=await (await sales.request.get(base+'/api/notifications')).json();assert.equal(apiState.unread,0);
  await page.evaluate(()=>closeModal());
  await post(sales,`/api/store/orders/${order.id}/quick-send`,{});
  await post(wh,`/api/orders/${order.id}/warehouse/accept`,{});await post(wh,`/api/orders/${order.id}/warehouse/start-preparing`,{});
  const itemId=order.items[0].id, p=`/api/orders/${order.id}/store-run/`;
  await post(wh,p+'weights',{run:1,items:[{itemId,deliveredKg:4}]});await post(wh,p+'move',{itemId});await post(wh,p+'send-run',{run:1});
  await post(wh,p+'weights',{run:2,items:[{itemId,deliveredKg:6}]});await post(wh,p+'send-run',{run:2});
  await page.locator('#bell').click();await page.locator(`[data-action="open-notification"][data-type="STORE_RUN_R2_SENT"][data-entity-id="${order.id}"]`).click();
  const shipment=page.locator(`[data-action="sr-ship-open"][data-order="${order.id}"][data-run="2"]`);await shipment.waitFor();
  assert.equal(await shipment.evaluate(e=>e.closest('.sr-ship-row').classList.contains('notif-target-highlight')),true);
  for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});const layout=await shipment.evaluate(e=>{const row=e.closest('tr'),table=e.closest('table'),box=table.getBoundingClientRect();return {row:getComputedStyle(row).display,table:table.tagName,overflow:document.documentElement.scrollWidth-innerWidth,left:box.left,right:box.right};});assert.equal(layout.table,'TABLE');assert.equal(layout.row,width>900?'table-row':'block');assert(layout.overflow<=1,`shipment overflow at ${width}: ${layout.overflow}`);assert(layout.left>=-1&&layout.right<=width+1,`shipment table outside viewport at ${width}`);}
  await page.setViewportSize({width:1280,height:900});
  await page.evaluate(()=>{closeModal();paintDriver({driver:{},assigned:[{id:'x',dispatch:{status:'ASSIGNED'},items:[]}],inTransit:[],delivered:[],history:[]});});
  const count=page.locator('[data-dsp-driver-tab="assigned"] .sd-tab-count');assert.equal(await count.innerText(),'۱');assert.notEqual(await count.evaluate(e=>getComputedStyle(e).display),'none');
  await page.evaluate(()=>{document.querySelector('#content').innerHTML=gateDispatchTabsHtml({awaitingDriver:[{}],leaving:[{},{}],inTransit:[]},'awaiting');app.sub.gate='dispatch';updateGateDispatchInCartable({awaitingDriver:[],leaving:[{}],inTransit:[{}]});});
  assert.equal(await page.locator('[data-gate-dispatch-count]').count(),1);assert.equal(await page.locator('[data-gate-dispatch-count="leaving"]').innerText(),'۱');assert.equal(await page.locator('#gateDispatchPanel #gateDispatchPanel').count(),0);
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
