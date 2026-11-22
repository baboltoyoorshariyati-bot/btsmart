'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('future order form and registered list are full-width and vertically stacked',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-future-layout-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_TEST_EMPTY_CATALOG:'1'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext({viewport:{width:1600,height:900}});
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),`${url} ${r.status()}: ${await r.text()}`);return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  await post(admin,'/api/admin/users',{username:'sales',password:'Changed!2345',fullName:'فروش',position:'فروش',roleCode:'sales',mustChangePassword:false});await post(sales,'/api/login',{username:'sales',password:'Changed!2345'});
  const product=(await post(sales,'/api/admin/products',{quickCode:'01',name:'محصول آزمایشی',defaultUnit:'کیلوگرم'})).product;
  const page=await sales.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>go('sales','future'));
  await page.locator('#futureOrderFormV25').waitFor();
  const empty=page.locator('#futureOrderListV25 table.future-order-table');await empty.waitFor();assert.equal(await empty.locator('thead th').count(),8);assert.match(await empty.locator('tbody').innerText(),/سفارشی برای روزهای آینده/);
  for(const width of [1600,390]){await page.setViewportSize({width,height:900});assert.equal(await empty.locator('.future-empty-cell').evaluate(el=>getComputedStyle(el,'::before').display),'none');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
  const date=new Date(Date.now()+3*86400000),day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const order=(await post(sales,'/api/orders/remote',{name:'مشتری آینده',phone:'09121112233',deliveryMode:'PICKUP',scheduledDate:day,scheduledAt:`${day}T08:00`,deliveryDate:day,items:[{productId:product.id,requestedQty:2,requestedUnit:'کیلوگرم'}]})).order;
  await page.evaluate(async()=>{const data=await fetchSalesCache(true);paintSalesPaneV29('future',data);});
  await page.locator(`#futureOrderListV25 [data-id="${order.id}"]`).first().waitFor();
  const draft=page.locator('#future-lines table.draft-lines-table'), registered=page.locator('#futureOrderListV25 table.future-order-table');
  assert.deepEqual(await draft.locator('thead th').allTextContents(),['ردیف','محصول','مقدار','واحد','توضیحات','عملیات']);
  assert.deepEqual(await registered.locator('thead th').allTextContents(),['مشتری','شماره سفارش','تاریخ ثبت','وضعیت','اقلام','زمان‌بندی','مقصد و بیعانه','عملیات']);
  assert.equal(await draft.locator('tbody tr').count(),1);assert.equal(await registered.locator('tbody tr').count(),1);
  await page.locator('#futureCustomerName').fill('متن فرم محفوظ بماند');
  for(const width of [1920,1600,1280,1024,901,900,768,390,320]) {
   await page.setViewportSize({width,height:900});
   const m=await page.locator('.fx-future-layout').evaluate(el=>{
    const rect=x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
    return {layout:rect(el),form:rect(el.querySelector('.fx-future-form')),registered:rect(el.querySelector('.fx-future-registered')),refund:rect(el.querySelector('.deposit-refund-panel')),pane:rect(el.closest('.v28-sales-pane')),columns:getComputedStyle(el).gridTemplateColumns,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth};
   });
   const msg=`width ${width}: ${JSON.stringify(m)}`;
   assert(Math.abs(m.form.left-m.layout.left)<1 && Math.abs(m.form.right-m.layout.right)<1,msg);
   assert(Math.abs(m.layout.left-m.pane.left)<1 && Math.abs(m.layout.right-m.pane.right)<1,msg);
   assert(Math.abs(m.registered.left-m.layout.left)<1 && Math.abs(m.registered.right-m.layout.right)<1,msg);
   assert(m.registered.top>=m.form.bottom && m.refund.top>=m.registered.bottom,msg);
   assert(m.pageWidth<=m.viewport+1,msg);
   for (const [table,labels] of [[draft,['ردیف','محصول','مقدار','واحد','توضیحات','عملیات']],[registered,['مشتری','شماره سفارش','تاریخ ثبت','وضعیت','اقلام','زمان‌بندی','مقصد و بیعانه','عملیات']]]) {
    const geometry=await table.evaluate(el=>{const row=el.tBodies[0].rows[0];return {table:getComputedStyle(el).display,head:getComputedStyle(el.tHead).display,row:getComputedStyle(row).display,cells:[...row.cells].map(cell=>({label:cell.dataset.label,pseudo:getComputedStyle(cell,'::before').content,rect:cell.getBoundingClientRect().toJSON(),scroll:cell.scrollWidth,client:cell.clientWidth})),scroll:el.scrollWidth,client:el.clientWidth};});
    assert.deepEqual(geometry.cells.map(c=>c.label),labels,msg);assert(geometry.scroll<=geometry.client+1,`${msg} ${JSON.stringify(geometry)}`);assert(geometry.cells.every(c=>c.scroll<=c.client+1),`${msg} ${JSON.stringify(geometry)}`);
    if(width>900){assert.equal(geometry.table,'table',msg);assert.equal(geometry.head,'table-header-group',msg);assert.equal(geometry.row,'table-row',msg);assert(geometry.cells.every(c=>Math.abs(c.rect.top-geometry.cells[0].rect.top)<2),msg);}
    else{assert.equal(geometry.head,'none',msg);assert.equal(geometry.row,'block',msg);assert(geometry.cells.slice(0,-1).every(c=>c.pseudo.includes(c.label)),msg);}
   }
   assert.equal(await page.locator('#futureCustomerName').inputValue(),'متن فرم محفوظ بماند');
  }
  const search=draft.locator('[data-op-product-search="future-0"]');await search.fill('01');
  await page.locator('[data-op-suggest="future-0"] button').first().waitFor();await search.press('ArrowDown');await search.press('Enter');
  await draft.locator('[data-op-qty="future-0"]').fill('3');await draft.locator('[data-op-unit="future-0"]').selectOption('کیلوگرم');await draft.locator('[data-op-desc="future-0"]').fill('توضیح آزمایشی');
  await page.locator('[data-action=future-add-line]').click();assert.equal(await draft.locator('tbody tr').count(),2);
  assert.equal(await draft.locator('[data-op-qty="future-0"]').inputValue(),'3');assert.equal(await draft.locator('[data-op-desc="future-0"]').inputValue(),'توضیح آزمایشی');
  await draft.locator('[data-action=op-remove-line]').last().click();assert.equal(await draft.locator('tbody tr').count(),1);
  await page.locator(`#futureOrderListV25 [data-action=order-details][data-id="${order.id}"]`).click();await page.locator('#modal.open').waitFor();await page.evaluate(()=>closeModal());
  page.once('dialog',dialog=>dialog.accept());await page.locator(`#futureOrderListV25 [data-action=future-cancel][data-id="${order.id}"]`).click();
  await page.locator('#futureOrderListV25 .future-empty-cell').waitFor();assert.equal(await page.locator('#futureOrderListV25 table.future-order-table thead th').count(),8);
  assert.deepEqual(errors,[]);await admin.close();await sales.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
