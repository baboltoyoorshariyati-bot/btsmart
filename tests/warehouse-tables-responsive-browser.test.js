'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('جدول‌های انبار: ستون‌های سند، عرض مشتری و عملیات در اندازه‌های مختلف',{skip:!process.env.BT_CHROMIUM_PATH,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-wh-tables-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath:process.env.BT_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext();
  for(const [url,data] of [['/api/login',{username:'admin',password:'Initial!2345'}],['/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'}]]){const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+await r.text());}
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.evaluate(()=>{if(app.timer)clearInterval(app.timer);if(app.wh38?.timer)clearInterval(app.wh38.timer);app.features.pickupStaging=true;document.querySelector('#appView').dataset.cartablePage='warehouse';});
  for(const kind of ['incoming','preparing']){
   await page.evaluate(kind=>{const o={id:'example',orderNo:'12345',createdAt:'2026-11-18T12:30:00Z',deliveryDate:'2026-11-19',customer:{name:'علی'},visit:{status:'PICKUP_PRESENT'},orderType:'ONSITE'};document.querySelector('#content').innerHTML=wh38List([o],kind);},kind);
   const row=page.locator('.wh-orders-table tbody tr');assert.equal(await row.locator('button').count(),kind==='incoming'?2:3);
   for(const width of [1920,1280,1100,1024,960,901,900,768,390,320]){
    await page.setViewportSize({width,height:900});if(width<640)await page.waitForTimeout(350);
    const m=await row.evaluate(el=>{const cell=el.children[1],header=el.closest('table').querySelector('th:nth-child(2)'),range=document.createRange();range.selectNodeContents(header);const buttons=[...el.querySelectorAll('button')];const table=el.closest('table'),wrap=table.parentElement;return {display:getComputedStyle(el).display,tableWidth:table.getBoundingClientRect().width,wrapWidth:wrap.clientWidth,cell:cell.getBoundingClientRect().width,headerText:range.getBoundingClientRect().width,scroll:document.documentElement.scrollWidth,viewport:innerWidth,buttons:buttons.map(b=>{const r=b.getBoundingClientRect();const text=document.createRange();text.selectNodeContents(b.lastChild);return {top:r.top,bottom:r.bottom,height:r.height,textHeight:text.getBoundingClientRect().height,whiteSpace:getComputedStyle(b).whiteSpace};})};});
    assert.equal(m.display,width<=900?'block':'table-row',`${kind}/${width}`);assert(m.scroll<=m.viewport+1,`${kind}/${width} page overflow`);
    assert(Math.abs(m.tableWidth-m.wrapWidth)<=2,`${kind}/${width} table fills frame ${JSON.stringify(m)}`);
    if(width>900){assert(m.buttons.every(b=>b.whiteSpace==='nowrap'&&Math.abs(b.top-m.buttons[0].top)<1&&b.textHeight<25),`${kind}/${width} buttons ${JSON.stringify(m)}`);}
    for(const button of await row.locator('button').all()){await button.scrollIntoViewIfNeeded();assert(await button.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.left>=-1&&r.right<=innerWidth+1&&(hit===e||e.contains(hit));}),`${kind}/${width} button hit target`);}
   }
   await page.evaluate(()=>{const row=document.querySelector('.wh-orders-table tbody tr');row.addEventListener('click',e=>{const b=e.target.closest('button');if(b){e.stopPropagation();window.__clicked=[b.dataset.action,b.dataset.id];}},true);});
   for(const button of await row.locator('button').all()){const action=await button.getAttribute('data-action');await button.click();assert.deepEqual(await page.evaluate(()=>window.__clicked),[action,'example']);}
   const long='نامطولانیمشتری'.repeat(12);
   await page.evaluate(({kind,long})=>{document.querySelector('#content').innerHTML=wh38List([{id:'long',orderNo:'1',customer:{name:long},createdAt:'2026-11-18T12:30:00Z'}],kind);},{kind,long});
   await page.setViewportSize({width:901,height:900});
   const longRow=page.locator('.wh-orders-table tbody tr');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const longButton=longRow.locator('button').first();await longButton.scrollIntoViewIfNeeded();assert(await longButton.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.left>=-1&&r.right<=innerWidth+1&&(hit===e||e.contains(hit));}),'long desktop row scrolls to actions');
   await page.setViewportSize({width:320,height:900});const name=page.locator('.wh-orders-table td:nth-child(2) .bt-cell-main');assert.equal(await name.textContent(),long);assert(await name.evaluate(e=>{const r=e.getBoundingClientRect(),c=e.parentElement.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&r.left>=c.left-1&&r.right<=c.right+1&&getComputedStyle(e).overflow==='visible';}),'long mobile name remains readable');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.evaluate(()=>{const o={id:'doc',orderNo:'123',warehouseDocumentNo:'W-456',customerName:'نام <آزمایشی>',createdAt:'2026-11-18T12:30:00Z',deliveryMode:'PICKUP',itemCount:7,deliveredKg:77,completedAt:'2026-11-18T13:15:00Z'};document.querySelector('#content').innerHTML=whDeliveredTable([o]);});
  const table=page.locator('.wh-delivered-table'),row=table.locator('tbody tr');
  const headings=['شماره سفارش','شماره سند','نام مشتری','تاریخ سفارش','وضعیت','عملیات'];assert.deepEqual(await table.locator('thead th').allTextContents(),headings);assert.deepEqual(await row.locator('td').evaluateAll(els=>els.map(e=>e.dataset.label)),headings);assert.equal(await row.locator('td').count(),6);assert.equal(await row.locator('td:nth-child(3)').textContent(),'نام <آزمایشی>');assert.equal(await row.locator('td:nth-child(3) *').count(),0);
  assert.equal(await row.locator('td:nth-child(4)').textContent(),await page.evaluate(()=>btDate('2026-11-18T12:30:00Z')));assert.doesNotMatch(await row.locator('td:nth-child(4)').textContent(),/[:：]/);
  assert.equal(await page.evaluate(()=>whDeliveredTable([])),'');
  assert.equal(await page.evaluate(()=>{const t=document.createElement('template');t.innerHTML=whDeliveredRow({id:'x',deliveryMode:'DELIVERY'});return t.content.querySelector('button').disabled;}),true);
  for(const width of [1920,1280,1024,901,900,768,390,320]){await page.setViewportSize({width,height:900});if(width<640)await page.waitForTimeout(350);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`delivered/${width} overflow`);const button=row.locator('[data-action=wh-delivered-details]');await button.scrollIntoViewIfNeeded();assert(await button.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.left>=-1&&r.right<=innerWidth+1&&(hit===e||e.contains(hit));}),`delivered/${width} action`);}
  await page.evaluate(()=>{document.querySelector('#content').innerHTML=whDeliveredTable([{id:'long-doc',orderNo:'123',warehouseDocumentNo:'W-456',customerName:'نامطولانیمشتری'.repeat(16),createdAt:'2026-11-18T12:30:00Z',deliveryMode:'PICKUP'}]);});
  for(const width of [1280,901,900,390,320]){await page.setViewportSize({width,height:900});const m=await page.locator('.wh-delivered-table td:nth-child(3)').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));assert(m.scroll<=m.client+1&&m.page<=m.viewport+1,`delivered long name/${width}: ${JSON.stringify(m)}`);}
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
