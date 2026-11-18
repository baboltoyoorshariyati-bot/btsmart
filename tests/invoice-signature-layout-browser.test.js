'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('مرورگر: ارتفاع یکسان کادر امضاء و مبالغ، متن پایین و وسط در پیش‌نمایش و چاپ', {skip:!executablePath,timeout:90000}, async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-invoice-layout-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addInitScript(()=>{if(window!==window.top)window.print=()=>{window.parent.__prints=(window.parent.__prints||0)+1;};});
  let res=await ctx.request.post(base+'/api/login',{data:{username:'admin',password:'Initial!2345'}});assert.equal(res.status(),200);res=await ctx.request.post(base+'/api/account/password',{data:{currentPassword:'Initial!2345',newPassword:'Changed!2345'}});assert.equal(res.status(),200);
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  let store=false;
  const order=()=>({id:'o',orderNo:'000123',orderType:store?'STORE':'REMOTE',storeName:'فروشگاه شعبه 1 حمزه کلا',customer:{name:'نام مشتری',phone:'09121234567'},items:[{id:'i',product:{name:'محصول'},deliveredKg:5,unitPrice:2000,finalAmount:10000}],payment:{invoiceNumber:'000001',totalAmount:10000,discountAmount:200,additionsAmount:200,customerName:'نام مشتری',customerPhone:'09121234567',deposit:{type:'CASH',amount:1000},depositAmount:1000,amountDue:9000,settlementMethods:store?[]:[{type:'POS',amount:4000,deviceSnapshot:{title:'دستگاه طولانی جهت بررسی چیدمان',bank:'بانک'}},{type:'CHECK',amount:2000,bank:'بانک',checkNumber:'123456',dueDate:'1405-12-01',checkStatus:'PENDING'},{type:'CREDIT',amount:3000,reason:'اعتبار خرید'}],deliveryRun:store?1:null,priceLines:store?[{productName:'محصول',deliveredKg:5}]:undefined}});
  await ctx.route('**/api/orders/o',route=>route.fulfill({json:{order:order()}}));
  const check=async(p,scope)=>{
   const sheet=p.locator(scope),box=sheet.locator('.inv38-verify-box');await box.waitFor();
   assert.equal(await sheet.locator('.inv38-foot').count(),0);assert.doesNotMatch(await sheet.innerText(),/[0-9٠-٩]/);if(store)assert.equal(await sheet.locator('.inv38-brand img').getAttribute('src'),'/logo.png');else{assert.equal(await sheet.locator('.inv38-brand').count(),0);assert.equal(await sheet.locator('.inv38-payment-box').count(),1);assert.doesNotMatch(await sheet.innerText(),/بابل طیور/);}
   assert.equal(await box.locator('span').innerText(),'امضاء');assert.equal(await box.locator('strong').innerText(),'نام مشتری – ۰۹۱۲۱۲۳۴۵۶۷');
   if(!store){
    const meta=await sheet.evaluate(e=>{const box=e.querySelector('.inv38-settlement-meta');return {mobile:matchMedia('screen and (max-width:640px)').matches,cols:[...box.children].map(d=>{const r=d.getBoundingClientRect(),label=d.querySelector('span').getBoundingClientRect(),value=d.querySelector('b').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,label:label.toJSON(),value:value.toJSON(),scroll:d.scrollWidth,client:d.clientWidth};})};});
    assert.equal(meta.cols.length,5);assert.equal(await sheet.locator('.inv38-sales-title').count(),0);assert.equal(await sheet.locator('.inv38-payment-balance>span').innerText(),'مانده حساب');assert.doesNotMatch(await sheet.locator('.inv38-settlement-meta').innerText(),/۰۰۰/);for(const col of meta.cols){assert(Math.abs(col.label.top-col.value.top)<6,JSON.stringify(meta));assert(col.scroll<=col.client+1,JSON.stringify(meta));}
    if(!meta.mobile)assert(meta.cols.every(c=>Math.abs(c.top-meta.cols[0].top)<2),JSON.stringify(meta));
   }
   const geometry=await sheet.evaluate(e=>{const r=x=>{const q=e.querySelector(x).getBoundingClientRect();return {top:q.top,bottom:q.bottom,left:q.left,right:q.right,height:q.height};};return{tot:r('.inv38-total-box'),box:r('.inv38-verify-box'),title:r('.inv38-vitem span'),text:r('.inv38-vitem strong')};});
   assert.ok(Math.abs(geometry.tot.height-geometry.box.height)<=1,JSON.stringify(geometry));
   if(!store){const layout=await sheet.evaluate(e=>{const bottom=e.querySelector('.inv38-with-payments'),pay=e.querySelector('.inv38-payment-box'),total=e.querySelector('.inv38-total'),sign=e.querySelector('.inv38-verify');return{overflow:[pay,total,sign].map(el=>({scroll:el.scrollWidth,client:el.clientWidth})),mobile:matchMedia('screen and (max-width:640px)').matches,bottom:bottom.getBoundingClientRect().width,pay:pay.getBoundingClientRect().toJSON(),total:total.getBoundingClientRect().toJSON(),sign:sign.getBoundingClientRect().toJSON()};});assert(layout.overflow.every(x=>x.scroll<=x.client+1),JSON.stringify(layout));if(layout.mobile){assert(layout.pay.width>layout.bottom-2,JSON.stringify(layout));assert(layout.total.bottom<=layout.pay.top+1&&layout.pay.bottom<=layout.sign.top+1,JSON.stringify(layout));}else{assert(Math.abs(layout.total.top-layout.pay.top)<2&&Math.abs(layout.sign.top-layout.pay.top)<2,JSON.stringify(layout));}}
   for(const el of [geometry.title,geometry.text])assert.ok(Math.abs((el.left+el.right-geometry.box.left-geometry.box.right)/2)<=1.5,JSON.stringify(geometry));
   assert.ok(geometry.text.bottom<=geometry.box.bottom && geometry.box.bottom-geometry.text.bottom<20,JSON.stringify(geometry));
   assert.ok(geometry.title.top>geometry.box.top+10,JSON.stringify(geometry));
  };
  for(const isStore of [false,true]){
   store=isStore;await page.evaluate(()=>previewInvoice('o',null));await page.locator('#modal.open .inv38-sheet').waitFor();
   for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});await check(page,'#modal .inv38-sheet');}
   let opened=0;const countPopup=()=>opened++;page.on('popup',countPopup);const before=await page.evaluate(()=>window.__prints||0);
   await page.locator('#modal [data-action=print-invoice]').click();await page.waitForFunction(n=>window.__prints===n+1,before);
   const frame=page.frameLocator('iframe[title="سند آماده چاپ"]');await frame.locator('.inv38-sheet').waitFor();await page.emulateMedia({media:'print'});await check(frame,'.inv38-sheet');
   // Exercise the same rendered document's print stylesheet and pagination.
   const html=await page.locator('iframe[title="سند آماده چاپ"]').evaluate(el=>{const d=el.contentDocument.cloneNode(true);d.querySelectorAll('script').forEach(s=>s.remove());return d.documentElement.outerHTML;});
   const proof=await ctx.newPage();await proof.goto(base);await proof.setContent(html,{waitUntil:'load'});await proof.evaluate(()=>document.fonts.ready);await proof.emulateMedia({media:'print'});await check(proof,'.inv38-sheet');const pdf=await proof.pdf({format:'A4',printBackground:true});assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1);await proof.close();
   await page.emulateMedia({media:'screen'});await page.locator('iframe[title="سند آماده چاپ"]').evaluate(el=>el.contentWindow.dispatchEvent(new Event('afterprint')));await page.locator('iframe[title="سند آماده چاپ"]').waitFor({state:'detached'});
   assert.equal(opened,0,'چاپ از پیش‌نمایش پنجره اضافی باز نمی‌کند');page.off('popup',countPopup);await page.evaluate(()=>closeModal());
  }
  let popupCount=0;page.on('popup',()=>popupCount++);await page.evaluate(()=>printInvoice('o',2));assert.match(await page.locator('#toast').innerText(),/سند این سرویس هنوز صادر نشده است/);assert.equal(popupCount,0);
  const empty=await ctx.newPage();await empty.goto(base+'/invoice-print.html');assert.match(await empty.locator('#invoice-print-message').innerText(),/اطلاعات فاکتور موجود نیست/);assert.equal(await empty.locator('.bt-print-tools').count(),0);await empty.close();
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
