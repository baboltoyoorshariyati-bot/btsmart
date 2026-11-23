'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('مرورگر: ثبت و وصول چک و نمایش مانده در پرونده مشتری و فاکتور',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-debt-browser-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  const post=async(url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const now=new Date(),day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const o=(await post('/api/orders/remote',{name:'مشتری معوق',phone:'09121112233',dispatchPlace:'بابل',deliveryMode:'PICKUP',scheduledDate:day,scheduledAt:day+'T00:00',deliveryDate:day,items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]})).order;
  await post(`/api/orders/${o.id}/warehouse/accept`,{});await post(`/api/orders/${o.id}/warehouse/start-preparing`,{});if(process.env.BT_PICKUP_STAGING!=='false'){await post(`/api/pickup/${o.id}/entry`,{name:'مشتری معوق',phone:'09121112233',noVehicle:true});await post(`/api/pickup/${o.id}/handover`,{physicalHandoverConfirmed:true,items:[{itemId:o.items[0].id,deliveredKg:2}]});}else await post(`/api/orders/${o.id}/warehouse`,{items:[{itemId:o.items[0].id,deliveredKg:2}]});
  await post(`/api/orders/${o.id}/settle`,{items:[{itemId:o.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CREDIT',amount:2000}]});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});await page.evaluate(id=>custDetail(id),o.customerId);
  const modal=page.locator('#modal');await modal.locator('.cust-debt-invoice').waitFor();assert.match(await modal.innerText(),/بدهکاری کل: ۲٬۰۰۰/);
  await modal.locator('[data-debt-receive]').click();const form=page.locator('#custDebtForm');await form.locator('[name=amount]').fill('500');await form.locator('[type=submit]').click();await modal.locator('.cust-debt-invoice').waitFor();assert.match(await modal.innerText(),/بدهکاری کل: ۱٬۵۰۰/);
  await modal.locator('[data-debt-receive]').click();await form.locator('[name=type]').selectOption('CHECK');await form.locator('[name=amount]').fill('600');await form.locator('[name=bank]').fill('بانک');await form.locator('[name=checkNumber]').fill('123');await form.locator('[data-debt-check-fields] .ui-jdate').fill(await page.evaluate(()=>isoToJalali('2026-11-25')));await form.locator('[type=submit]').click();await modal.locator('[data-status=CLEARED]').waitFor();assert.match(await modal.innerText(),/بدهکاری کل: ۱٬۵۰۰/);assert.match(await modal.innerText(),/چک در انتظار وصول: ۶۰۰/);
  page.once('dialog',d=>d.accept());await modal.locator('[data-status=CLEARED]').click();await modal.locator('[data-status=CLEARED]').waitFor({state:'detached'});assert.match(await modal.innerText(),/بدهکاری کل: ۹۰۰/);
  for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});const w=await modal.locator('.cust-debt').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert(w.scroll<=w.client+1,JSON.stringify(w));}
  await page.evaluate(id=>previewInvoice(id,null),o.id);await modal.locator('.inv38-sheet').waitFor();const invoice=await modal.locator('.inv38-sheet').innerText();assert.match(invoice,/مانده حساب\s*۹۰۰/);assert(!invoice.includes('وصول بعدی'));assert(!invoice.includes('اعتباری'));
  await post('/api/admin/users',{username:'sales1',fullName:'فروش',position:'فروش',roleCode:'sales',password:'Sales!12345',mustChangePassword:false});
  const sales=await browser.newContext({viewport:{width:1280,height:900}});let login=await sales.request.post(base+'/api/login',{data:{username:'sales1',password:'Sales!12345'}});assert.equal(login.status(),200);const sp=await sales.newPage();await sp.goto(base+'/',{waitUntil:'networkidle'});await sp.locator('#railNav [data-cartable=customers]').click();await sp.locator('.cust-row').first().waitFor();await sp.locator('.cust-row').first().click();await sp.locator('.cust-debt-invoice').waitFor();assert.match(await sp.locator('.cust-debt').innerText(),/بدهکاری کل: ۹۰۰/);assert.equal(await sp.locator('[data-status=REVERSED]').count(),0);await sales.close();
  const orderDetail=await (await ctx.request.get(base+`/api/orders/${o.id}`)).json();
  const paymentId=orderDetail.order.payment.id;
  await page.evaluate(({orderId,paymentId})=>salesInvoiceEditOpen(orderId,paymentId),{orderId:o.id,paymentId});
  const edit=modal.locator('#salesInvoiceEditForm');await edit.waitFor();
  assert.equal(await edit.locator('[data-doc-unit-price]').inputValue(),'۱٬۰۰۰');
  assert.equal(await edit.locator('[data-doc-method-amount]').inputValue(),'۲٬۰۰۰');
  await edit.locator('[data-doc-method-type]').selectOption('CASH');
  await edit.locator('[data-doc-method-amount]').fill('3000');
  assert.equal(await edit.locator('[data-doc-method-amount]').inputValue(),'۳٬۰۰۰');
  assert.match(await edit.locator('[data-doc-method-message]').innerText(),/بستانکار.*۲٬۱۰۰/);
  await edit.locator('[type=submit]').click();await edit.waitFor({state:'detached'});
  const updated=await (await ctx.request.get(base+`/api/customers/${o.customerId}/debts`)).json();
  assert.equal(updated.invoices.find(x=>x.paymentId===paymentId).credit,2100);
  await page.evaluate(id=>previewInvoice(id,null),o.id);await modal.locator('.inv38-sheet').waitFor();
  assert.match(await modal.locator('.inv38-sheet').innerText(),/بستانکار\s*۲٬۱۰۰/);
  const next=(await post('/api/orders/remote',{customerId:o.customerId,name:'مشتری معوق',phone:'09121112233',dispatchPlace:'بابل',deliveryMode:'PICKUP',scheduledDate:day,scheduledAt:day+'T00:00',deliveryDate:day,items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]})).order;
  const prior=await page.evaluate(async order=>salesPriorBalanceHtml(await salesPriorBalance(order)),next);
  assert.match(prior,/بستانکار از قبل: ۲٬۱۰۰ ریال/);
  assert.match(await page.evaluate(()=>salesPriorBalanceHtml({unavailable:true})),/در دسترس نیست/);
  assert.match(await page.evaluate(()=>salesPriorBalanceHtml({error:true})),/دریافت نشد/);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
