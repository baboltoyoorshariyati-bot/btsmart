'use strict';
// Optional Chromium audit against real renderers and isolated SQLite data.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: چیدمان ردیف‌های انبار، سرویس فروشگاه و قیمت روز در عرض‌های گوناگون', {skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-alignment-'));const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),base=`http://127.0.0.1:${port}`;
  const post=async(url,data,context=ctx)=>{const r=await context.request.post(base+url,{data});assert.ok(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json();};
  const get=async(url)=>(await (await ctx.request.get(base+url)).json());
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  await post('/api/admin/users',{username:'layout-shop',roleCode:'store',fullName:'فروشگاه تست',storeName:'فروشگاه مرکزی با عنوان طولانی',position:'تست',password:'Changed!2345',mustChangePassword:false});
  let regular=(await post('/api/orders/remote',{name:'مشتری با نام طولانی آزمایشی',phone:'09121112233',dispatchPlace:'نشانی ارسال آزمایشی با چند کلمه',scheduledTime:'00:00',items:[{productId:'p01',requestedQty:18,requestedUnit:'کیلوگرم',description:'توضیحات طولانی ردیف برای بررسی چیدمان در صفحه کوچک'}]})).order;
  await post(`/api/orders/${regular.id}/warehouse/accept`,{});await post(`/api/orders/${regular.id}/warehouse/start-preparing`,{});regular=(await get(`/api/orders/${regular.id}`)).order;
  const shopCtx=await browser.newContext();await post('/api/login',{username:'layout-shop',password:'Changed!2345'},shopCtx);
  let shop=(await post('/api/store/orders',{name:'مشتری فروشگاه',phone:'09121112233',items:[{productId:'p01',requestedQty:12,requestedUnit:'کیلوگرم'}]},shopCtx)).order;await shopCtx.close();
  await post(`/api/store/orders/${shop.id}/quick-send`,{});await post(`/api/orders/${shop.id}/warehouse/accept`,{});await post(`/api/orders/${shop.id}/warehouse/start-preparing`,{});shop=(await get(`/api/orders/${shop.id}`)).order;
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  const contained=async(selector,parent)=>page.locator(selector).evaluateAll((nodes,parentSelector)=>nodes.map(n=>{const r=n.getBoundingClientRect(),p=n.closest(parentSelector)?.getBoundingClientRect();return p&&{left:r.left-p.left,right:p.right-r.right,top:r.top-p.top,bottom:p.bottom-r.bottom};}),parent);
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:850});
   await page.evaluate(()=>go('admin'));await page.locator('#settings-tab-products').click();await page.locator('#admList [data-price-for]').first().waitFor();
   const priceRow=await contained('#admList .adm-row:first-child .adm-price input,#admList .adm-row:first-child .adm-price button','.adm-row');
   assert.equal(priceRow.length,2);for(const p of priceRow)assert.ok(p&&p.left>=-1&&p.right>=-1&&p.top>=-1&&p.bottom>=-1,`price row ${width}: ${JSON.stringify(p)}`);
   await page.locator('#admList [data-price-for]').first().fill('250000');
   await page.evaluate(()=>go('warehouse','preparing'));await page.waitForSelector('#wh38Body');await page.evaluate(o=>wh38Sheet(o),regular);
   assert.equal(await page.locator('.wh-prep-table tr[data-wh38-item]').count(),1);
   const cells=await contained('.wh-prep-table tr[data-wh38-item] .wh38-cell-box, .wh-prep-table tr[data-wh38-item] input, .wh-prep-table tr[data-wh38-item] .wh38-oos','tr[data-wh38-item]');
   assert.ok(cells.length>=6);for(const p of cells)assert.ok(p&&p.left>=-1&&p.right>=-1&&p.top>=-1&&p.bottom>=-1,`warehouse ${width}: ${JSON.stringify(p)}`);
   const prepList=await page.locator('.wh-prep-table-wrap').evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth,overflow:getComputedStyle(e).overflowX}));
   if(width<=1150)assert(prepList.scroll<=prepList.client+1,`warehouse prep does not scroll horizontally ${width}: ${JSON.stringify(prepList)}`);
   else{const coords=await page.locator('.wh-prep-table tr[data-wh38-item] > td').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));assert.equal(new Set(coords).size,1,'desktop warehouse cells stay on one row');}
   await page.locator('[data-wh38-weight]').fill('5');assert.match(await page.locator('#wh38Total').innerText(),/۵/);
   await page.locator('[data-wh38-oos]').check();assert.equal(await page.locator('[data-wh38-weight]').isDisabled(),true);await page.locator('[data-wh38-oos]').uncheck();
   await page.evaluate(o=>sr38Sheet(o),shop);
   const controls=await contained('.sr318-table-row .sr-table-ops input,.sr318-table-row .sr-table-ops button','.sr318-table-row');assert.ok(controls.length>=5);
   for(const p of controls)assert.ok(p&&p.left>=-1&&p.right>=-1&&p.top>=-1&&p.bottom>=-1,`store ${width}: ${JSON.stringify(p)}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`page overflow ${width}`);
   if(width===390){
    await page.locator('[data-sr38-weight]').fill('4');const response=page.waitForResponse(r=>r.url().endsWith('/store-run/weights')&&r.request().method()==='POST');
    await page.locator('[data-action=sr38-weight]').click();assert.equal((await response).status(),200);
    const fresh=(await get(`/api/orders/${shop.id}`)).order;assert.equal(fresh.storeRun.items[0].r1Kg,4);
   }
  }
  // Additional role/cartable sweep uses the real navigation and populated order lists.
  const views=[['dashboard'],['admin'],['users'],['drivers'],['transport-vehicles'],['store-branches'],['payment-devices'],['customers'],['products'],['activity'],['backups'],['reports'],['gate','entry'],['gate','waiting'],['gate','exit'],['gate','history'],['sales','onsite'],['sales','remote'],['sales','stores'],['sales','flow'],['sales','settlement'],['sales','future'],['warehouse','incoming'],['warehouse','preparing'],['warehouse','stores'],['warehouse','history'],['store','create'],['store','delivery']];
  for(const [width,height] of [[1440,850],[1024,600],[1024,768],[1152,648],[1280,720],[1366,768],[1920,1080],[768,850],[320,850]]){
   await page.setViewportSize({width,height});
   for(const view of views){
    await page.evaluate(v=>go(v[0],v[1]),view);await page.waitForTimeout(110);
    const result=await page.evaluate(()=>{
     const root=document.querySelector('#content');const shown=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>2&&r.height>2&&s.visibility!=='hidden'&&!e.closest('[hidden],.hidden,[aria-hidden=true]')};
     const controls=[...root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),select,textarea,button')].filter(shown),over=[];
     for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];if(a.contains(b)||b.contains(a))continue;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect(),w=Math.min(x.right,y.right)-Math.max(x.left,y.left),h=Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top);if(w>5&&h>5)over.push([a.getAttribute('name')||a.dataset.action||a.tagName,b.getAttribute('name')||b.dataset.action||b.tagName]);}
     return {pageOverflow:document.documentElement.scrollWidth-innerWidth,over};
    });
    assert.ok(result.pageOverflow<=1,`${width} ${view}: page overflow ${result.pageOverflow}`);
    assert.deepEqual(result.over,[],`${width} ${view}: overlapping controls`);
   }
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
