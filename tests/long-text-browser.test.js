'use strict';
// Regression tests for actual long, unbroken names in populated role views.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: نام‌های طولانی داخل کارت فروش، انبار، فروشگاه و نمودار باقی می‌مانند',{skip:!exe,timeout:60000},async()=>{
 const {chromium}=require('playwright-core'),port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-long-text-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','inherit']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),shopCtx=await browser.newContext();
  const post=async(url,data,c=ctx)=>{const r=await c.request.post(base+url,{data});assert.ok(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json();};
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const productName='ناممحصولبسیارطولانی'.repeat(7),customerName='مشتریبسیارطولانی'.repeat(6),storeName='فروشگاهتست'.repeat(6);
  const product=(await post('/api/admin/products',{quickCode:'99',name:productName,defaultUnit:'کیلوگرم'})).product;
  await post('/api/admin/users',{username:'auditshop',roleCode:'store',fullName:storeName,storeName,position:'تست',password:'Changed!2345',mustChangePassword:false});
  const visit=(await post('/api/visits',{name:customerName,phone:'09120001234',noVehicle:true,district:'منطقه',purpose:'خرید'})).visit;
  await post('/api/orders',{visitId:visit.id,deliveryMode:'PICKUP',items:[{productId:product.id,requestedQty:100,requestedUnit:'کیلوگرم'}]});
  await post('/api/login',{username:'auditshop',password:'Changed!2345'},shopCtx);
  const page=await ctx.newPage(),shopPage=await shopCtx.newPage();await page.goto(base+'/',{waitUntil:'networkidle'});await shopPage.goto(base+'/',{waitUntil:'networkidle'});
  async function contained(p,selector,expected,width){
   const loc=p.locator(selector).filter({hasText:expected}).first();await loc.waitFor();
   const result=await loc.evaluate(e=>{const r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const rects=[...range.getClientRects()].filter(x=>x.width&&x.height);return {left:Math.min(...rects.map(x=>x.left-r.left)),right:Math.max(...rects.map(x=>x.right-r.right)),page:document.documentElement.scrollWidth-innerWidth,overflow:e.scrollWidth-e.clientWidth};});
   assert.ok(result.left>=-2&&result.right<=2&&result.overflow<=1&&result.page<=1,`${selector} @ ${width}: ${JSON.stringify(result)}`);
  }
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:850});await shopPage.setViewportSize({width,height:850});
   await page.evaluate(()=>go('warehouse','incoming'));await page.locator('.wh-orders-table tbody tr [data-action=wh38-order-details]').first().click();await contained(page,'#modal .v21-detail-table strong',productName,width);await page.locator('#modal .modal-close').click();
   await page.evaluate(()=>go('sales','flow'));await contained(page,'.sd-flow-row .bt-cell-main strong',customerName,width);
   await page.evaluate(()=>go('dashboard'));await contained(page,'.dbc-name',productName,width);
   await shopPage.evaluate(()=>go('store','create'));await contained(shopPage,'.st38-hero-badge span',storeName,width);
  }
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
