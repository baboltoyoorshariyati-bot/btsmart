'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: انتخاب کیبورد در ردیف‌ها، تفکیک تأییدها و چیدمان غیرحضوری', {skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-service-ui-'));const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext({viewport:{width:1400,height:900}}),base=`http://127.0.0.1:${port}`;
  await ctx.addInitScript(()=>{if(window!==window.top)window.print=()=>{window.parent.__prints=(window.parent.__prints||0)+1;};});
  await ctx.request.post(base+'/api/login',{data:{username:'admin',password:'Initial!2345'}});await ctx.request.post(base+'/api/account/password',{data:{currentPassword:'Initial!2345',newPassword:'Changed!2345'}});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.route('**/api/products/search?*',route=>route.fulfill({json:{products:[{id:'p1',name:'محصول اول',quickCode:'01',defaultUnit:'کیلوگرم'},{id:'p2',name:'محصول دوم',quickCode:'02',defaultUnit:'کیلوگرم'}]}}));
  // همان رندر و binder برنامه با همان هندلر انتخاب؛ تمامی خانواده‌های ورودی محصول.
  for(const [prefix,key] of [['phone','phoneDraft'],['future','futureDraft'],['store','storeDraft'],['storeedit','storeEditDraft']]){
   await page.evaluate(({prefix,key})=>{
    closeModal();app[key]=[defaultOrderLine()];const host=prefix==='storeedit'?document.querySelector('#modal'):document.querySelector('#content');
    if(prefix==='storeedit'){openModal('ویرایش','<div id="store-edit-lines"></div>');}else host.innerHTML=`<div id="${prefix}-lines"></div><div id="${prefix}-summary"></div>`;
    const root=prefix==='storeedit'?document.querySelector('#modal'):host;
    root.onclick=e=>{const b=e.target.closest('[data-action="op-pick-product"]');if(b)pickOperationProduct(+b.dataset.index,b.dataset.productId,b.dataset.label,b.dataset.quick,prefix,key);};renderOrderLineArea(prefix,key);
   },{prefix,key});
   const input=page.locator(`[data-op-product-search="${prefix}-0"]`);await input.fill('محصول');await page.locator(`[data-op-suggest="${prefix}-0"] button`).first().waitFor();await input.press('ArrowDown');await input.press('ArrowDown');await input.press('Enter');
   assert.equal(await page.evaluate(key=>app[key][0].productId,key),'p2',prefix);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.opQty),`${prefix}-0`);
   await page.locator(`[data-op-product-search="${prefix}-0"]`).fill('تغییر');assert.equal(await page.evaluate(key=>app[key][0].productId,key),'');
  }
  // فرم حضوری با هندلر واقعی فروش
  await page.evaluate(()=>{closeModal();const c=document.querySelector('#content');c.onclick=null;c.innerHTML='<div id="orderLines"></div><div id="orderDraftSummary"></div>';app.orderDraft=[defaultOrderLine()];c.addEventListener('click',salesV29ClickHandler);renderOrderLines();});
  let inp=page.locator('[data-product-search="0"]');await inp.fill('محصول');await page.locator('[data-suggest-for="0"] button').first().waitFor();await inp.press('ArrowUp');await inp.press('Enter');assert.equal(await page.evaluate(()=>app.orderDraft[0].productId),'p2');
  await page.locator('[data-product-search="0"]').fill('دیگر');assert.equal(await page.evaluate(()=>app.orderDraft[0].productId),'');
  // ویرایش سفارش برگشتی و ویرایش فروشگاه، با هندلر واقعی مودال
  for(const kind of ['returned','salesStore']){
   await page.evaluate(kind=>{const item={productId:'p0',productLabel:'قدیمی',requestedQty:'1',requestedUnit:'کیلوگرم'};if(kind==='returned'){app.returnEdit={items:[item]};renderReturnedOrderEditor({id:'x',orderNo:'1',customer:{}});}else{app.salesStoreEdit={items:[item]};openModal('ویرایش','<div id="salesStoreEditLines"></div>');renderSalesStoreEditLines();}},kind);
   const selector=kind==='returned'?'[data-return-product-search="0"]':'[data-ss-product-search="0"]',box=kind==='returned'?'[data-return-suggest="0"]':'[data-ss-suggest="0"]';inp=page.locator(selector);await inp.fill('محصول');await page.locator(box+' button').first().waitFor();await inp.press('ArrowDown');await inp.press('ArrowDown');await inp.press('Enter');
   assert.equal(await page.evaluate(k=>k==='returned'?app.returnEdit.items[0].productId:app.salesStoreEdit.items[0].productId,kind),'p2',kind);await inp.fill('نام متفاوت');assert.equal(await page.evaluate(k=>k==='returned'?app.returnEdit.items[0].productId:app.salesStoreEdit.items[0].productId,kind),'');
  }
  await page.evaluate(()=>{closeModal();app.salesStoreTab='history';document.querySelector('#content').innerHTML=renderSalesStoresV41([
   {id:'o',orderType:'STORE',status:'CLOSED',orderNo:'1',storeName:'تست',items:[],payments:[{}],hasReturnedGoods:false,storeRunOps:{r1Shipment:{itemIds:['i1']},r2Shipment:{itemIds:['i2']}},storeReceiptConfirmedAt:'2026-01-01',dispatchRuns:[{run:1,status:'CLOSED',storeReceiptConfirmedAt:'2026-01-01'}],dispatch:{run:2,status:'DELIVERED'}},
   {id:'r',orderType:'STORE',status:'CLOSED',orderNo:'2',storeName:'تست',items:[],payments:[{}],hasReturnedGoods:true,storeRunOps:{r1Shipment:{itemIds:['i1']}},dispatch:{run:1,status:'DELIVERED'}}
  ]);});
  const text=await page.locator('[data-store-section=history]').innerText();assert.match(text,/سرویس اول: دریافت فروشگاه تأیید شد/);assert.match(text,/سرویس دوم: منتظر تأیید دریافت فروشگاه/);assert.match(text,/چاپ مرجوعی/);assert.doesNotMatch(text,/چاپ محموله سفارش جزئی|چاپ سرویس اول \(برگه وزن و مرجوعی\)|چاپ سرویس دوم \(برگه وزن و مرجوعی\)/);
  assert.equal(await page.locator('[data-store-section=history] [data-store-summary-id="o"] [data-action=print-store-return]').count(),0);
  assert.equal(await page.locator('[data-store-section=history] [data-store-summary-id="r"] [data-action=print-store-return]').count(),1);
  assert.equal(await page.locator('[data-store-section=history] [data-action=print-store-service]').count(),0);
  assert.equal(await page.locator('[data-store-section=history] [data-action=sales-store-document-print]').count(),0);
  assert.doesNotMatch(text,/چاپ سند|سند اول|سند دوم/);
  // مرجوعی‌های ثبت‌شده در همان سفارش، با یک گزینهٔ چاپ مستقل و بدون پنجرهٔ اضافی.
  await ctx.route('**/api/orders/r/returns',route=>route.fulfill({json:{order:{id:'r',orderType:'STORE',orderNo:'2',storeName:'تست',dispatchPlace:'تهران'},returns:[{id:'t1',productName:'کالای مرجوعی',kg:2.5,reason:'بسته آسیب‌دیده',driverName:'راننده',driverPlate:'12ب34567',deliveredAt:'2026-01-02T10:00:00Z'}]}}));
  async function checkPrint(target,run){const n=await page.evaluate(()=>window.__prints||0);if(typeof target==='function')await target();else await page.locator(target).click();await page.waitForFunction(x=>window.__prints===x+1,n);const frame=page.frameLocator('iframe[title="سند آماده چاپ"]');await frame.locator('table tbody tr').waitFor();const printed=await frame.locator('body').innerText();assert.match(printed,run===1?/کالای اول/:/کالای دوم/);assert.doesNotMatch(printed,run===1?/کالای دوم/:/کالای اول/);await page.locator('iframe[title="سند آماده چاپ"]').evaluate(el=>el.contentWindow.dispatchEvent(new Event('afterprint')));await page.locator('iframe[title="سند آماده چاپ"]').waitFor({state:'detached'});}
  const countBeforeReturn=await page.evaluate(()=>window.__prints||0);await page.locator('[data-store-section=history] [data-store-summary-id="r"] [data-action=print-store-return]').click();await page.waitForFunction(n=>window.__prints===n+1,countBeforeReturn);const returnPrint=page.frameLocator('iframe[title="سند آماده چاپ"]');await returnPrint.locator('.return-table tbody tr').waitFor();const returnText=await returnPrint.locator('body').innerText();assert.match(returnText,/کالای مرجوعی/);assert.match(returnText,/بسته آسیب‌دیده/);assert.match(returnText,/۲٫۵/);await page.locator('iframe[title="سند آماده چاپ"]').evaluate(el=>el.contentWindow.dispatchEvent(new Event('afterprint')));await page.locator('iframe[title="سند آماده چاپ"]').waitFor({state:'detached'});
  // Warehouse history now lists one separately printable document per store service.
  const warehouseStoreDocument=run=>({storeOrderKind:'DAILY',orderId:'o',orderNo:'1',warehouseDocumentNo:`W-${run}`,storeName:'تست',driverName:'راننده',createdAt:'2026-10-28T12:00:00Z',sentAt:'2026-10-28T12:30:00Z',run,lines:[{productName:run===1?'کالای اول':'کالای دوم',deliveredKg:run===1?10:20}]});
  await page.route(/\/api\/warehouse\/store-documents(?:\?.*)?$/,route=>route.fulfill({json:{documents:[1,2].map(run=>{const {lines,...doc}=warehouseStoreDocument(run);return{...doc,itemCount:lines.length};}),total:2,offset:0,limit:50}}));
  await page.route(/\/api\/warehouse\/store-documents\/o\/[12]$/,route=>{const run=Number(new URL(route.request().url()).pathname.split('/').pop());return route.fulfill({json:{document:warehouseStoreDocument(run)}});});
  await page.evaluate(()=>{document.querySelector('#content').innerHTML='<div data-wh38-store-history></div>';renderWhStoreHistory();});
  const storeDocumentButtons=page.locator('.wh-store-documents [data-store-doc-action=details]');await storeDocumentButtons.first().waitFor();assert.equal(await storeDocumentButtons.count(),2);
  for(const run of [1,2]){
   await page.locator(`.wh-store-documents [data-store-doc-action=details][data-run="${run}"]`).click();await page.locator('#modal.open .whd-doc').waitFor();
   await checkPrint(()=>page.locator('#modal [data-wh-store-print]').click(),run);await page.locator('#modal .modal-close').click();
  }
  await page.evaluate(()=>{document.querySelector('#content').innerHTML=renderSalesRemoteV32([])});
  const boxes=await page.locator('.sales-remote-customer-grid-v40 .field').evaluateAll(els=>els.map(e=>({top:e.getBoundingClientRect().top,width:e.getBoundingClientRect().width})));assert.equal(new Set(boxes.map(x=>x.top)).size,1);assert.ok(boxes.every(x=>x.width>150));
  await page.setViewportSize({width:390,height:850});const mobile=await page.locator('.sales-remote-customer-grid-v40 .field').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().top));assert.equal(new Set(mobile).size,4);assert.equal(await page.locator('.sales-remote-customer-grid-v40 [data-delivery-mode]').count(),1);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
