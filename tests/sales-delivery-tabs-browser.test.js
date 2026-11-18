'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: چهار سربرگ تحویل، سفارش عادی و فروشگاهی، صفحه‌بندی و نوسازی زنده', {skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-sales-tabs-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [url,data] of [['/api/login',{username:'admin',password:'Initial!2345'}],['/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'}]]){const r=await ctx.request.post(base+url,{data});assert.ok(r.ok(),await r.text());}
  const make=(id,status,store=false)=>({id,orderNo:id,orderType:store?'STORE':'REMOTE',storeName:store?'فروشگاه نمونه':'',customer:{name:'مشتری عادی',phone:'09120000000'},items:[{id:'line',product:{name:'مرغ'},requestedQty:2}],dispatch:{status,run:store?1:null,driverName:'راننده',lines:[],events:[]}});
  const history=Array.from({length:32},(_,i)=>make('H'+i,'SALES_FINALIZED',i%2===0));let transit=[make('transit','IN_TRANSIT',true)];
  await page.route('**/api/sales/dispatch-deliveries*',async route=>{const url=new URL(route.request().url());if(url.pathname!=='/api/sales/dispatch-deliveries')return route.continue();const offset=Number(url.searchParams.get('historyOffset'))||0;await route.fulfill({json:{assigned:[make('assigned','ASSIGNED')],inTransit:transit,active:[make('assigned','ASSIGNED'),...transit],pending:[make('delivered','DELIVERED',true)],finalized:history.slice(offset,offset+30),finalizedTotal:history.length,finalizedOffset:offset,finalizedLimit:30}});});
  await page.goto(base+'/',{waitUntil:'networkidle'});await page.evaluate(async()=>{await go('sales','delivery');if(app.salesFetchPromise)await app.salesFetchPromise;const d=await fetchSalesCache(true);paintSalesPaneV29('delivery',d);clearInterval(app.timer);app.timer=null;});
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:850});await page.locator('[data-delivery-tab=inTransit]').click();
   assert.equal(await page.locator('[data-delivery-section]:visible').count(),1);assert.equal(await page.locator('[data-delivery-section=inTransit] [data-delivery-order=transit]').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`page ${width}`);
   const geometry=await page.locator('[data-delivery-section=inTransit] [data-delivery-order=transit]').evaluate(e=>({display:getComputedStyle(e).display,layout:[...e.querySelectorAll(':scope > td')].map(x=>({top:x.getBoundingClientRect().top,border:getComputedStyle(x).borderInlineStartWidth}))}));assert.equal(geometry.display,'table-row');assert.equal(geometry.layout.length,8);assert(geometry.layout.slice(1).every(x=>x.border==='1px'));
   await page.locator('[data-delivery-tab=history]').click();assert.equal(await page.locator('[data-delivery-tab=history] b').count(),0);assert.equal(await page.locator('[data-delivery-section=history] [data-delivery-order]').count(),30);
   assert.match(await page.locator('[data-delivery-section=history] .sales-delivery-pages').innerText(),/۳۲/);
  }
  await page.locator('[data-delivery-section=history] [data-offset="30"]').click();
  await page.locator('[data-delivery-section=history] [data-delivery-order=H30]').waitFor();assert.equal(await page.locator('[data-delivery-section=history] [data-delivery-order]').count(),2);
  await page.locator('[data-delivery-section=history] [data-delivery-order=H30] [data-action=sales-delivery-details]').click();await page.locator('#modal.open .sales-store-delivery-details').waitFor();assert.match(await page.locator('#modal').innerText(),/فروشگاه نمونه/);await page.locator('#modal .modal-close').click();
  transit.push(make('transit-live','IN_TRANSIT'));await page.evaluate(async()=>{const d=await fetchSalesCache(true);paintSalesPaneV29('delivery',d)});
  assert.equal(await page.locator('[data-delivery-tab=history]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('[data-delivery-section=history] [data-delivery-order]').count(),2);
  await page.locator('[data-delivery-tab=inTransit]').click();assert.equal(await page.locator('[data-delivery-section=inTransit] [data-delivery-order]').count(),2);
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
