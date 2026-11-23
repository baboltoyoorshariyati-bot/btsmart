'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('store partial orders allow the same contact phone with different names without creating profiles',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-store-contact-ui-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),shop=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),await r.text());return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  await post(admin,'/api/admin/users',{username:'shop',roleCode:'store',fullName:'فروشگاه',position:'تست',storeName:'فروشگاه',password:'Changed!2345',mustChangePassword:false});await post(shop,'/api/login',{username:'shop',password:'Changed!2345'});
  const page=await shop.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});const ids=[];
  for(const name of ['تماس یک','تماس دو']){
   await page.locator('#railNav [data-cartable=partial]').click();await page.locator('#storeOrderForm').waitFor();await page.locator('#storeCustomerName').fill(name);await page.locator('#storeCustomerPhone').fill('09121117777');
   const search=page.locator('[data-op-product-search="store-0"]');await search.fill('01');await page.locator('[data-op-suggest="store-0"] button').first().waitFor();await search.press('ArrowDown');await search.press('Enter');await page.locator('[data-op-qty="store-0"]').fill('2');
   const response=page.waitForResponse(r=>r.url().endsWith('/api/store/orders')&&r.request().method()==='POST');await page.locator('#storeOrderForm [type=submit]').click();const r=await response;assert.equal(r.status(),201,await r.text());const order=(await r.json()).order;assert.equal(order.customerId,null);assert.equal(order.customer.name,name);ids.push(order.id);await page.locator('#railNav [data-cartable=registered].active').waitFor();
  }
  assert.notEqual(ids[0],ids[1]);const customers=await (await admin.request.get(base+'/api/customers?q=09121117777')).json();assert.equal(customers.customers.length,0);
  const list=await (await shop.request.get(base+'/api/store/orders?kind=PARTIAL')).json();assert.equal(list.orders.length,2);assert.deepEqual(new Set(list.orders.map(o=>o.customer.name)),new Set(['تماس یک','تماس دو']));assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
