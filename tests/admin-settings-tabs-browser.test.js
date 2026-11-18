'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: سربرگ‌های تنظیمات، جابه‌جایی، ثبت و حفظ بخش فعال', {skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-settings-'));const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),base=`http://127.0.0.1:${port}`;
  const post=async(url,data)=>{const r=await ctx.request.post(base+url,{data});assert.ok(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json();};
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const products=(await (await ctx.request.get(base+'/api/admin/products')).json()).products;
  const code=Array.from({length:100},(_,i)=>String(i).padStart(2,'0')).find(n=>!products.some(p=>p.quickCode===n));assert.ok(code);
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>go('admin'));await page.locator('#settings-tab-https').waitFor();
  const ids=['https','users','products','audit'];
  for(const [width,height] of [[1920,1080],[1024,600],[390,844],[320,700]]){
   await page.setViewportSize({width,height});
   for(const selected of ids){
    await page.locator(`#settings-tab-${selected}`).click();
    for(const id of ids){const tab=page.locator(`#settings-tab-${id}`),panel=page.locator(`#settings-panel-${id}`);assert.equal(await tab.getAttribute('aria-selected'),String(id===selected));assert.equal(await panel.isVisible(),id===selected);assert.equal(await tab.getAttribute('aria-controls'),`settings-panel-${id}`);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`page overflow ${width}`);
    assert.equal(await page.locator('.settings-tabs').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`tabs overflow ${width}`);
   }
  }
  await page.locator('#settings-tab-https').click();await page.locator('#tlsDomain').fill('example.com');await page.locator('#settings-tab-products').click();await page.locator('#settings-tab-https').click();assert.equal(await page.locator('#tlsDomain').inputValue(),'example.com','switching tabs preserves unsubmitted input');
  await page.locator('#settings-tab-https').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#settings-tab-users').getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-tab-users');await page.keyboard.press('End');assert.equal(await page.locator('#settings-tab-audit').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('#settings-tab-https').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#settings-tab-prices').count(),0);
  await page.locator('#settings-tab-users').click();assert.equal(await page.locator('.user-directory').isVisible(),true);assert.equal(await page.locator('[data-action=manage-users]').isVisible(),true);
  await page.locator('#settings-tab-products').click();await page.locator('#admList [data-price-for]').first().waitFor();
  await page.locator('#admProdSearch').fill(products[0].quickCode);assert.ok(await page.locator('#admList .adm-row').count()>0);await page.locator('#admProdSearch').fill('');
  const price=page.locator('#admList [data-price-for]').first();const productId=await price.getAttribute('data-price-for');await price.fill('250000');let responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/admin/prices')&&r.request().method()==='POST');await price.press('Enter');let response=await responsePromise;assert.equal(response.status(),201);assert.equal((await response.json()).price.price,250000);
  await page.locator('[data-adm=prod-new]').click();await page.locator('#admProductForm [name=quickCode]').fill(code);await page.locator('#admProductForm [name=name]').fill('محصول آزمایشی سربرگ');responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/admin/products')&&r.request().method()==='POST');await page.locator('#admProductForm button[type=submit]').click();response=await responsePromise;assert.equal(response.status(),201);const newProduct=(await response.json()).product;
  await page.waitForSelector(`[data-adm=prod-edit][data-id="${newProduct.id}"]`);assert.equal(await page.locator('#settings-tab-products').getAttribute('aria-selected'),'true');
  await page.locator(`[data-adm=prod-edit][data-id="${newProduct.id}"]`).click();await page.locator('#admProductForm [name=name]').fill('محصول ویرایش‌شده');responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/admin/products/'+newProduct.id)&&r.request().method()==='PUT');await page.locator('#admProductForm button[type=submit]').click();response=await responsePromise;assert.equal(response.status(),200);await page.waitForSelector(`[data-adm=prod-delete][data-id="${newProduct.id}"]`);
  const updated=(await (await ctx.request.get(base+'/api/admin/products')).json()).products;assert.ok(updated.some(p=>p.quickCode===code&&p.name==='محصول ویرایش‌شده'));
  page.once('dialog',d=>d.accept());responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/admin/products/'+newProduct.id)&&r.request().method()==='DELETE');await page.locator(`[data-adm=prod-delete][data-id="${newProduct.id}"]`).click();response=await responsePromise;assert.equal(response.status(),200);
  assert.ok(productId);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
