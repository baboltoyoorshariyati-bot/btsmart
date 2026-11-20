'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {storeDisplayName}=require('../lib/store-name');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('نام نمایشی شعبه به ترتیب استاندارد و بدون تغییر نام‌های قدیمی',()=>{
 for(const [name,no,want] of [['حمزه کلا',1,'فروشگاه شعبه 1 حمزه کلا'],['فروشگاه شعبه ۱ حمزه کلا',1,'فروشگاه شعبه 1 حمزه کلا'],['شعبه حمزه کلا',1,'فروشگاه شعبه 1 حمزه کلا'],['فروشگاه شعبه 1 بابل طیور حمزه کلا',1,'فروشگاه شعبه 1 حمزه کلا'],['بابل طیور حمزه کلا',null,'فروشگاه شعبه 1 حمزه کلا'],['فروشگاه شعبه ۱ بابل طیور حمزه کلا',null,'فروشگاه شعبه 1 حمزه کلا'],['فروشگاه مرکزی',null,'فروشگاه مرکزی'],['فروشگاه شعبه ٣ مرکزی',null,'فروشگاه شعبه 3 مرکزی'],['123 بازار',2,'فروشگاه شعبه 2 123 بازار']])assert.equal(storeDisplayName(name,no),want);
 const gateOrderView=require('../lib/gate-order-view');assert.equal(gateOrderView({orderType:'STORE',storeName:'فروشگاه شعبه 1 بابل طیور حمزه کلا',branchNo:1}).storeName,'فروشگاه شعبه 1 حمزه کلا');
});
test('مرورگر: ردیف افقی انبار، جزئیات تفکیکی محموله و چاپ تک‌ردیفی', {skip:!process.env.BT_CHROMIUM_PATH,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-display-'));const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:process.env.BT_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),base=`http://127.0.0.1:${port}`;
  await ctx.request.post(base+'/api/login',{data:{username:'admin',password:'Initial!2345'}});await ctx.request.post(base+'/api/account/password',{data:{currentPassword:'Initial!2345',newPassword:'Changed!2345'}});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  const order={id:'o',orderNo:'410001',orderType:'STORE',storeName:'فروشگاه شعبه 1 حمزه کلا',branchNo:1,status:'WAREHOUSE_PREPARING',createdAt:'2026-10-31T10:00:00Z',items:[{id:'a',product:{name:'کالای اول'},requestedQty:12,requestedUnit:'کیلوگرم',runR1:[{kg:10,at:'2026-10-31T09:00:00Z',byName:'انباردار',note:'آزمایش'}],runR2:[]},{id:'b',product:{name:'کالای دوم'},requestedQty:22,requestedUnit:'کیلوگرم',movedToR2:true,runR1:[],runR2:[]}],storeRun:{enabled:true,items:[{itemId:'a',r1Kg:10,totalKg:10,runStatus:'AWAITING_R1'},{itemId:'b',r2Kg:20,totalKg:20,runStatus:'AWAITING_R1'}]},dispatchRuns:[{run:1,status:'IN_TRANSIT',shipmentItemIds:['a'],shipmentWeights:{a:10},driverName:'راننده اول'}],dispatch:{run:2,status:'IN_TRANSIT',shipmentItemIds:['b'],shipmentWeights:{b:20},driverName:'راننده دوم'}};
  await page.route(/\/api\/store\/orders(?:\?.*)?$/,r=>r.fulfill({json:{orders:[order],total:1}}));await page.route('**/api/store/orders/o',r=>r.fulfill({json:{order}}));
  await page.route('**/api/orders?status=WAREHOUSE_PREPARING',r=>r.fulfill({json:{orders:[]}}));
  await page.evaluate(()=>{if(app.timer)clearInterval(app.timer);app.page='warehouse';document.querySelector('#appView').dataset.cartablePage='warehouse';app.wh38={phase:'preparing'};wh38Shell('preparing');clearInterval(app.wh38.timer)});
  await page.locator('#wh38Body .sd-empty').waitFor();await page.evaluate(o=>sr38Sheet(o),order);
  for(const width of [1440,1150,1024,768,390,320]){
   await page.setViewportSize({width,height:900});
   const row=page.locator('.sr318-table-row[data-sr318-row]').first(),geometry=await row.evaluate(e=>{const list=e.closest('.sr318-table-wrap'),ops=e.querySelector('.sr-table-ops');return {display:getComputedStyle(e).display,ops:getComputedStyle(ops).flexWrap,rowScroll:e.scrollWidth,rowClient:e.clientWidth,listScroll:list.scrollWidth,listClient:list.clientWidth,page:document.documentElement.scrollWidth,viewport:innerWidth};});
   assert.equal(await row.locator('td[data-label]').count(),6);assert.equal(geometry.display,width<=900?'block':'table-row',JSON.stringify(geometry));assert.equal(geometry.ops,'wrap');
   assert(geometry.rowScroll<=geometry.rowClient+1&&geometry.listScroll<=geometry.listClient+1&&geometry.page<=geometry.viewport+1,`store table overflow ${width}: ${JSON.stringify(geometry)}`);
   const head=await page.locator('.wh38-store-sheet-head').evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth,parts:[...e.querySelectorAll('.wh38-store-head>*')].map(c=>c.getBoundingClientRect().toJSON())}));if(width<=1150)assert(head.scroll<=head.client+1,`store heading scroll ${width}: ${JSON.stringify(head)}`);else assert.ok(Math.max(...head.parts.map(x=>x.top))-Math.min(...head.parts.map(x=>x.top))<10);
  }
  await page.locator('[data-action="sr38-history"]').first().click();assert.match(await page.locator('#modal').innerText(),/آزمایش/);await page.evaluate(()=>closeModal());
  // Real store portal click handler opens only the selected service, even when both are in transit.
  await page.evaluate(async()=>{app.sub.store='delivery';app.storeDeliveryTab='inProgress';app.page='store';document.querySelector('#appView').dataset.cartablePage='store';await renderStorePortal()});
  await page.evaluate(()=>document.fonts.ready);
  const typography=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&/[\u0600-\u06ff]/.test(n.textContent||''))).map(el=>({text:el.innerText,letterSpacing:parseFloat(getComputedStyle(el).letterSpacing)||0})).filter(x=>x.letterSpacing<0));
  assert.deepEqual(typography,[],'متن فارسی نباید فاصله حروف منفی داشته باشد');
  for(const sel of ['.st38-delivery-heading h2','.st38-delivery-heading p','.cartable-nav-title'])assert.ok(await page.locator(sel).first().evaluate(el=>(parseFloat(getComputedStyle(el).letterSpacing)||0)>=0));
  for(const [run,yes,no] of [[1,'کالای اول','کالای دوم'],[2,'کالای دوم','کالای اول']]){
   await page.locator(`#storeDeliveryRows [data-run="${run}"]`).click();await page.locator('#modal .store-shipment-table').waitFor();const txt=await page.locator('#modal').innerText();assert.ok(txt.includes(yes));assert.ok(!txt.includes(no));await page.evaluate(()=>closeModal());
  }
  order.dispatchRuns[0]={...order.dispatchRuns[0],status:'CLOSED',lines:[{productName:'کالای اول',deliveredKg:10,returnKg:2,shortageKg:1,netKg:8}],storeReceiptConfirmedAt:'2026-10-31'};
  order.dispatch={...order.dispatch,status:'DELIVERED',lines:[{productName:'کالای دوم',deliveredKg:20,returnKg:0,shortageKg:0,netKg:20}]};
  await page.evaluate(async()=>{app.storeDeliveryTab='delivered';await renderStorePortal()});
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});
   for(const [run,yes,no] of [[1,'کالای اول','کالای دوم'],[2,'کالای دوم','کالای اول']]){
    await page.locator(`#storeDeliveryRows [data-run="${run}"]`).click();await page.locator('#modal table tbody tr').waitFor();const txt=await page.locator('#modal').innerText();assert.ok(txt.includes(yes));assert.ok(!txt.includes(no));assert.equal(await page.locator('#modal [data-action=store-confirm-delivery]').count(),run===2?1:0);
    const shipment=page.locator('#modal .bt-table.store-shipment-table'),shipmentRow=shipment.locator('tbody tr').first();assert.equal(await shipment.count(),1);assert.equal(await shipment.locator('> thead th').count(),5);assert.equal(await shipmentRow.locator('td[data-label]').count(),5);assert.equal(await shipmentRow.evaluate(e=>getComputedStyle(e).display),width<=900?'block':'table-row');assert(await page.locator('#modal .modal-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`shipment modal overflow ${width}`);
    const chipGap=await page.locator('#modal .st38-delivered-details>header>div').evaluate(e=>{const a=e.querySelector('.order-code')?.getBoundingClientRect(),b=e.querySelector('.st-run-chip')?.getBoundingClientRect();if(!a||!b)return null;return Math.max(a.left-b.right,b.left-a.right,a.top-b.bottom,b.top-a.bottom)});assert.ok(chipGap>0,JSON.stringify({width,run,chipGap}));
    const summaryLayout=await page.locator('#modal .st38-delivered-summary').evaluate(e=>{const s=getComputedStyle(e),items=[...e.querySelectorAll(':scope > span')];return{display:s.display,rowGap:parseFloat(s.rowGap),columnGap:parseFloat(s.columnGap),items:items.map(x=>getComputedStyle(x).display),rects:items.map(x=>{const r=x.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}})}});
    assert.equal(summaryLayout.display,'flex',JSON.stringify({width,...summaryLayout}));assert.ok(summaryLayout.rowGap>0&&summaryLayout.columnGap>0,JSON.stringify({width,...summaryLayout}));assert.ok(summaryLayout.items.length>=2&&summaryLayout.items.every(x=>x==='flex'),JSON.stringify({width,...summaryLayout}));
    const first=summaryLayout.rects[0],second=summaryLayout.rects[1],separated=first.right<=second.left||second.right<=first.left||first.bottom<=second.top||second.bottom<=first.top;assert.ok(separated,JSON.stringify({width,...summaryLayout}));
    const footer=await page.locator('#modal .st38-delivered-details>footer').evaluate(e=>{const s=getComputedStyle(e);return{display:s.display,rowGap:parseFloat(s.rowGap),columnGap:parseFloat(s.columnGap),button:e.querySelector('.btn')?.getBoundingClientRect().toJSON()||null,note:e.querySelector('.subtle')?.getBoundingClientRect().toJSON()||null}});
    assert.equal(footer.display,'flex',JSON.stringify({width,...footer}));assert.ok(footer.rowGap>=12&&footer.columnGap>=12,JSON.stringify({width,...footer}));if(footer.button&&footer.note){const a=footer.button,b=footer.note;assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,JSON.stringify({width,...footer}));}
    await page.evaluate(()=>closeModal());
   }
  }
  await ctx.route('**/api/orders/o/store-run/print/*',r=>r.fulfill({json:{document:{orderNo:'410001',storeName:'فروشگاه شعبه 1 حمزه کلا',sentAt:'2026-10-31T10:00:00Z',dispatchPlace:'نشانی نمونه',lines:[{productName:'محصول',deliveredKg:10}]}}}));
  const print=await ctx.newPage();await print.goto(base+'/store-service-print.html?id=o&run=1');await print.locator('.service-info strong').first().waitFor();await print.emulateMedia({media:'print'});const tops=await print.locator('.service-info>div').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().top)));assert.equal(new Set(tops).size,1);assert.deepEqual(errors,[]);const summary=await page.evaluate(()=>dspDeliverySummary({lines:[{returnKg:1,netKg:9}],amountDue:900},true));assert.doesNotMatch(summary,/مبلغ|تسویه|ریال/);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
