'use strict';
// Exercises populated order cards, modals and forms in actual Chromium viewports.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: دسکتاپ کوچک و بزرگ، کارت‌ها و پنجره‌های واقعی بدون اسکرول افقی ناخواسته', {skip:!exe,timeout:120000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-desktop-'));
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),base=`http://127.0.0.1:${port}`;
  const post=async(url,data,context=ctx)=>{const r=await context.request.post(base+url,{data});assert.ok(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json();};
  const get=async url=>(await (await ctx.request.get(base+url)).json());
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  await post('/api/admin/users',{username:'desktop-shop',roleCode:'store',fullName:'فروشگاه تست',storeName:'فروشگاه مرکزی با عنوان طولانی برای بررسی نمایش',position:'تست',password:'Changed!2345',mustChangePassword:false});
  let regular=(await post('/api/orders/remote',{name:'مشتری با نام نسبتاً طولانی برای بررسی نمایش',phone:'09121112233',scheduledTime:'00:00',items:[{productId:'p01',requestedQty:18,requestedUnit:'کیلوگرم'}]})).order;
  const shopCtx=await browser.newContext();await post('/api/login',{username:'desktop-shop',password:'Changed!2345'},shopCtx);
  let shop=(await post('/api/store/orders',{name:'مشتری فروشگاه',phone:'09121112233',items:[{productId:'p01',requestedQty:12,requestedUnit:'کیلوگرم'}]},shopCtx)).order;await shopCtx.close();
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  const sizes=[[800,600],[1024,600],[1024,768],[1152,648],[1280,720],[1366,768],[1920,1080],[390,844]];
  const check=async(selector,tag)=>{
   const result=await page.locator(selector).evaluate(e=>{
    const r=e.getBoundingClientRect(),controls=[...e.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return b.width>2&&b.height>2&&s.visibility!=='hidden'&&!n.closest('[hidden],.hidden');});
    const bad=controls.map(n=>{const b=n.getBoundingClientRect();return {name:n.dataset.action||n.name||n.tagName,left:b.left-r.left,right:r.right-b.right,top:b.top-r.top,bottom:r.bottom-b.bottom};}).filter(x=>Math.min(x.left,x.right,x.top,x.bottom)<-1);
    const overlap=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>3&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>3)overlap.push([controls[i].outerHTML,controls[j].outerHTML, a.toJSON(),b.toJSON()]);}
    return {scroll:e.scrollWidth-e.clientWidth,bad,overlap};
   });
   assert.ok(result.scroll<=1,`${tag}: horizontal overflow ${JSON.stringify(result)}`);assert.deepEqual(result.bad,[],`${tag}: controls outside card`);assert.deepEqual(result.overlap,[],`${tag}: overlapping controls`);
  };
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});if(width<640)await page.waitForTimeout(350);await page.evaluate(()=>go('sales','stores'));await page.locator('.sd-store-card-v42').waitFor();await page.evaluate(async()=>{clearInterval(app.timer);app.timer=null;if(app.salesFetchPromise)await app.salesFetchPromise;});
   assert.equal(await page.locator('.sd-store-card-v42').locator('..').evaluate(e=>e.scrollWidth<=e.clientWidth+1||['auto','scroll'].includes(getComputedStyle(e).overflowX)),true,`sales list scroll containment ${width}`);
   await check('.sd-store-card-v42',`sales ${width}x${height}`);
   for(const action of ['store-order-details-v25','sales-edit-store-order','store-approve-v25','store-quick-send-v40']){
    const button=page.locator(`.sd-store-card-v42 [data-action=${action}]`);await button.scrollIntoViewIfNeeded();assert.equal(await button.isVisible(),true);const r=await button.boundingBox();assert.ok(r.x>=-1&&r.x+r.width<=width+1,`${action} ${width}`);assert.equal(await button.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(hit===e||e.contains(hit));}),true,`click target ${action} ${width}`);
   }
   await page.locator('.sd-store-card-v42 [data-action=store-order-details-v25]').click();await page.locator('#modal.open .modal-card').waitFor();
   assert.ok(await page.locator('#modal .modal-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`sales modal ${width}`);await page.locator('#modal .modal-close').click();
   await page.evaluate(()=>go('warehouse','incoming'));const row=page.locator('.wh-orders-table tbody tr').first();await row.waitFor();await page.evaluate(()=>{clearInterval(app.wh38.timer);app.wh38.timer=null});
   const rowGeom=await row.evaluate(e=>{const r=e.getBoundingClientRect();return {buttons:[...e.querySelectorAll('button')].map(b=>{const x=b.getBoundingClientRect();return {l:x.left-r.left,r:r.right-x.right,t:x.top-r.top,b:r.bottom-x.bottom};})};});
   assert.ok(rowGeom.buttons.length>0&&rowGeom.buttons.every(x=>Math.min(x.l,x.r,x.t,x.b)>=-1),`incoming ${width}x${height} controls outside row ${JSON.stringify(rowGeom)}`);
   assert.equal(await page.locator('.bt-table-wrap').first().evaluate(e=>e.scrollWidth<=e.clientWidth+1||['auto','scroll'].includes(getComputedStyle(e).overflowX)),true,`incoming list scroll containment ${width}`);
   for(const action of ['wh38-order-details']){
    const button=row.locator(`[data-action=${action}]`);await button.scrollIntoViewIfNeeded();assert.equal(await button.isVisible(),true);
    assert.equal(await button.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.left>=-1&&r.right<=innerWidth+1&&!!hit&&(hit===e||e.contains(hit));}),true,`incoming ${action} ${width}`);
   }
   await row.locator('[data-action=wh38-order-details]').click();await page.locator('#modal.open .v21-detail-table').waitFor();await page.locator('#modal .modal-close').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`incoming page overflow ${width}`);
  }
  await post(`/api/store/orders/${shop.id}/quick-send`,{});
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});await page.evaluate(()=>go('warehouse','stores'));const storeRow=page.locator('.wh38-store-table tr[data-store-order]').first();await storeRow.waitFor();
   assert.equal(await page.locator('.wh38-store-table-wrap').evaluate(e=>e.scrollWidth<=e.clientWidth+1||['auto','scroll'].includes(getComputedStyle(e).overflowX)),true,`warehouse list scroll containment ${width}`);await check('.wh38-store-table tr[data-store-order]',`warehouse row ${width}x${height}`);
   await storeRow.locator('[data-action=wh38-store-details]').click();await page.locator('#modal.open .modal-card').waitFor();
   assert.ok(await page.locator('#modal .modal-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`warehouse modal ${width}`);
   const button=page.locator('#modal [data-action=wh38-accept-details]');await button.scrollIntoViewIfNeeded();assert.equal(await button.isVisible(),true);const r=await button.boundingBox();assert.ok(r.x>=-1&&r.x+r.width<=width+1,`modal action ${width}`);await page.locator('#modal .modal-close').click();
  }
  await post(`/api/orders/${regular.id}/warehouse/accept`,{});await post(`/api/orders/${regular.id}/warehouse/start-preparing`,{});regular=(await get(`/api/orders/${regular.id}`)).order;
  await post(`/api/orders/${shop.id}/warehouse/accept`,{});await post(`/api/orders/${shop.id}/warehouse/start-preparing`,{});shop=(await get(`/api/orders/${shop.id}`)).order;
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});await page.evaluate(()=>go('warehouse','preparing'));await page.locator('#wh38Body').waitFor();await page.evaluate(o=>wh38Sheet(o),regular);await check('.wh38-prep-item:not(.sr318-row)',`warehouse form ${width}`);
   await page.evaluate(o=>sr38Sheet(o),shop);await check('.sr318-row',`store service ${width}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`page overflow ${width}`);
   await page.evaluate(()=>go('admin'));await page.evaluate(()=>{clearInterval(app.indicatorTimer);app.indicatorTimer=null;});await page.locator('#settings-tab-audit').click();await page.locator('.audit-table').waitFor();
   assert.equal(await page.locator('.audit-table').evaluate(e=>e.closest('.table-wrap').scrollWidth<=e.closest('.table-wrap').clientWidth+1),true,`audit table ${width}`);
   if(width>=800){
    const nav=page.locator('#railNav button:visible');assert.ok(await nav.count()>0,`navigation ${width}`);
    for(let i=0;i<await nav.count();i++){const item=nav.nth(i);await item.scrollIntoViewIfNeeded();assert.equal(await item.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1&&!!hit&&(hit===e||e.contains(hit));}),true,`navigation item ${i} ${width}x${height}`);}
   }
  }
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
