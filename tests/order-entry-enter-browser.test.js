'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: پیمایش و افزودن ردیف با Enter در فرم‌های سفارش و ویرایش', {skip:!exe,timeout:120000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-order-nav-')),base=`http://127.0.0.1:${port}`;let browser;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext({viewport:{width:1280,height:850}}),page=await ctx.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PUT'].includes(r.method())&&/\/api\/(orders|store\/orders)/.test(r.url()))writes.push(r.url());});
  for(const [url,data] of [['/api/login',{username:'admin',password:'Initial!2345'}],['/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'}]])assert.equal((await ctx.request.post(base+url,{data})).status(),200);
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.route('**/api/products/search?*',route=>route.fulfill({json:{products:[{id:'p01',name:'مرغ اول',quickCode:'01',defaultUnit:'کیلوگرم'},{id:'p02',name:'مرغ دوم',quickCode:'02',defaultUnit:'کیلوگرم'}]}}));
  const waitFocus=async (attr,val)=>page.waitForFunction(([a,v])=>document.activeElement?.getAttribute(a)===v,[attr,val],{timeout:3000});
  async function checkOp(prefix,key,selector){
   const root=page.locator(selector),search=root.locator(`[data-op-product-search="${prefix}-0"]`);await search.waitFor();
   if(prefix==='phone'){await search.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.opProductSearch),'phone-0');}
   await search.fill('مرغ');await root.locator(`[data-op-suggest="${prefix}-0"] button`).first().waitFor();await search.press('ArrowDown');await search.press('ArrowDown');await search.press('Enter');
   assert.equal(await page.evaluate(key=>app[key][0].productId,key),'p02');await waitFocus('data-op-qty',`${prefix}-0`);
   const qty=root.locator(`[data-op-qty="${prefix}-0"]`);await qty.fill('3');await qty.press('Enter');await waitFocus('data-op-unit',`${prefix}-0`);
   const unit=root.locator(`[data-op-unit="${prefix}-0"]`);await unit.selectOption({label:'بسته'});await unit.press('Enter');await waitFocus('data-op-desc',`${prefix}-0`);
   const desc=root.locator(`[data-op-desc="${prefix}-0"]`);await desc.fill('توضیح');if(prefix==='phone'){await desc.dispatchEvent('keydown',{key:'Enter',repeat:true,bubbles:true});assert.equal(await root.locator('[data-op-product-search]').count(),1);}
   await desc.press('Enter');await waitFocus('data-op-product-search',`${prefix}-1`);
   assert.equal(await root.locator('[data-op-product-search]').count(),2);assert.deepEqual(await page.evaluate(key=>{const r=app[key][0];return [r.productId,r.requestedQty,r.requestedUnit,r.description];},key),['p02','3','بسته','توضیح']);
   {await desc.press('Enter');await waitFocus('data-op-product-search',`${prefix}-1`);assert.equal(await root.locator('[data-op-product-search]').count(),2,'ردیف موجود تکرار نشود');}
  }
  for(const [sub,prefix,key,root] of [['remote','phone','phoneDraft','#phoneOrderFormV25'],['future','future','futureDraft','#futureOrderFormV25']]){
   await page.evaluate(async sub=>{await go('sales',sub);if(app.salesFetchPromise)await app.salesFetchPromise;clearInterval(app.timer);app.timer=null;},sub);await checkOp(prefix,key,root);
  }
  await page.evaluate(()=>go('store','create'));await checkOp('store','storeDraft','#storeOrderForm');
  await page.route(/\/api\/visits(?:\?.*)?$/,route=>route.fulfill({json:{visits:[{id:'visit-test',customer:{name:'مشتری',phone:'09120000000'},status:'WAITING_SALES',createdAt:'2026-10-01T12:00:00Z'}]}}));
  await page.evaluate(async()=>{await go('sales','onsite');if(app.salesFetchPromise)await app.salesFetchPromise;clearInterval(app.timer);app.timer=null;await openOrder('visit-test');});
  const onsite=page.locator('#orderLines'),onsiteProduct=onsite.locator('[data-product-search="0"]');await onsiteProduct.waitFor();await onsiteProduct.fill('مرغ');await onsite.locator('[data-suggest-for="0"] button').first().waitFor();await onsiteProduct.press('ArrowDown');await onsiteProduct.press('ArrowDown');await onsiteProduct.press('Enter');assert.equal(await page.evaluate(()=>app.orderDraft[0].productId),'p02');await waitFocus('data-qty','0');
  await onsite.locator('[data-qty="0"]').fill('5');await onsite.locator('[data-qty="0"]').press('Enter');await waitFocus('data-unit','0');await onsite.locator('[data-unit="0"]').press('Enter');await waitFocus('data-description','0');await onsite.locator('[data-description="0"]').fill('حضوری');await onsite.locator('[data-description="0"]').press('Enter');await waitFocus('data-product-search','1');assert.equal(await onsite.locator('[data-product-search]').count(),2);await onsite.locator('[data-description="0"]').press('Enter');await waitFocus('data-product-search','1');assert.equal(await onsite.locator('[data-product-search]').count(),2);
  await page.unroute(/\/api\/visits(?:\?.*)?$/);

  // Forms used to edit shop and returned orders use their actual renderers and add handlers.
  await page.route('**/api/store/orders/edit-test',route=>route.fulfill({json:{order:{id:'edit-test',status:'STORE_PENDING_SALES',customer:{name:'مشتری',phone:'09120000000'},items:[{id:'i',productId:'p01',product:{name:'مرغ اول',quickCode:'01'},requestedQty:1,requestedUnit:'کیلوگرم'}]}}}));
  await page.evaluate(()=>openStoreOrderEdit('edit-test'));await checkOp('storeedit','storeEditDraft','#storeOrderEditForm');await page.evaluate(()=>closeModal());
  for(const kind of ['returned','salesStore']){
   await page.evaluate(kind=>{const item={id:'i',productId:'p01',productLabel:'مرغ اول',requestedQty:'1',requestedUnit:'کیلوگرم',description:''};if(kind==='returned'){app.returnEdit={items:[item]};renderReturnedOrderEditor({id:'x',orderNo:'1',customer:{}});}else{app.salesStoreEdit={items:[item]};renderSalesStoreEditor({id:'x',orderNo:'1'});}},kind);
   const p=kind==='returned'?'return':'ss',root=page.locator(kind==='returned'?'#returnedEditLines':'#salesStoreEditLines');
   const search=root.locator(`[data-${p}-product-search="0"]`);await search.fill('مرغ');await root.locator(`[data-${p}-suggest="0"] button`).first().waitFor();await search.press('ArrowUp');await search.press('Enter');
   assert.equal(await page.evaluate(kind=>kind==='returned'?app.returnEdit.items[0].productId:app.salesStoreEdit.items[0].productId,kind),'p02');await waitFocus(`data-${p}-qty`,'0');
   const q=root.locator(`[data-${p}-qty="0"]`);await q.fill('4');await q.press('Enter');await waitFocus(`data-${p}-unit`,'0');await root.locator(`[data-${p}-unit="0"]`).press('Enter');await waitFocus(`data-${p}-description`,'0');
   const d=root.locator(`[data-${p}-description="0"]`);await d.fill('سطر اول');await d.press('End');await d.press('Shift+Enter');await d.type('سطر دوم');assert.equal(await d.inputValue(),'سطر اول\nسطر دوم');await d.press('Enter');await waitFocus(`data-${p}-product-search`,'1');assert.equal(await root.locator(`[data-${p}-product-search]`).count(),2);
   await page.evaluate(()=>closeModal());
  }
  assert.deepEqual(writes,[],'فشردن Enter نباید سفارش را ذخیره یا ارسال کند');assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
