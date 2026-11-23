'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('sales sees saved ordinary and store weights live, including an open detail window',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-live-weights-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext(),wh=await browser.newContext(),shop=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),`${url} ${r.status()} ${await r.text()}`);return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const [username,roleCode] of [['sales','sales'],['warehouse','warehouse'],['shop','store']])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false,...(roleCode==='store'?{storeName:'فروشگاه تست'}:{})});
  for(const [ctx,username] of [[sales,'sales'],[wh,'warehouse'],[shop,'shop']])await post(ctx,'/api/login',{username,password:'Changed!2345'});
  const items=[{productId:'p01',requestedQty:4,requestedUnit:'بسته'},{productId:'p02',requestedQty:2,requestedUnit:'عدد'}];
  const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const ordinary=(await post(sales,'/api/orders/remote',{deliveryDate:day,name:'وزن زنده',phone:'09121112233',scheduledTime:'00:00',deliveryMode:'PICKUP',items})).order;
  const store=(await post(shop,'/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:'CUSTOMER',name:'مشتری جزئی',items})).order;
  const bulk=(await post(shop,'/api/store/orders',{items})).order;
  for(const o of [store,bulk])await post(sales,`/api/store/orders/${o.id}/quick-send`,{});
  for(const o of [ordinary,store,bulk]){await post(wh,`/api/orders/${o.id}/warehouse/accept`,{});await post(wh,`/api/orders/${o.id}/warehouse/start-preparing`,{});}
  const page=await sales.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>renderSales('flow'));
  const row=page.locator(`[data-order="${ordinary.id}"]`);await row.waitFor();assert.match(await row.innerText(),/هنوز وزنی ذخیره نشده/);
  await row.locator('[data-action=order-details]').click();const modal=page.locator(`[data-sales-live-order="${ordinary.id}"]`);await modal.waitFor();
  await post(wh,`/api/orders/${ordinary.id}/warehouse/draft`,{revision:0,items:[{itemId:ordinary.items[0].id,deliveredKg:7.5},{itemId:ordinary.items[1].id,outOfStock:true}]});
  await modal.getByText(/پیش‌نویس ذخیره‌شده: ۷٫۵ کیلوگرم/).waitFor({timeout:15000});assert.match(await modal.innerText(),/عدم موجودی/);assert.match(await row.innerText(),/پیش‌نویس ذخیره‌شده/);
  await page.locator('#modal [data-action=close-modal]').last().click();await page.evaluate(()=>renderSales('stores'));await page.locator('[data-store-subtab=processing]').click();const storeRow=page.locator(`[data-store-summary-id="${store.id}"]`);await storeRow.waitFor();
  await storeRow.locator('[data-action=store-order-details-v25]').click();const storeModal=page.locator(`[data-sales-live-order="${store.id}"]`);await storeModal.waitFor();
  await post(wh,`/api/orders/${store.id}/store-run/weights`,{run:1,items:[{itemId:store.items[0].id,deliveredKg:3.75}]});
  await post(wh,`/api/orders/${bulk.id}/store-run/weights`,{run:1,items:[{itemId:bulk.items[0].id,deliveredKg:2}]});await post(wh,`/api/orders/${bulk.id}/store-run/move`,{itemId:bulk.items[0].id});await post(wh,`/api/orders/${bulk.id}/store-run/weights`,{run:2,items:[{itemId:bulk.items[0].id,deliveredKg:4}]});
  await storeModal.getByText(/سرویس اول ۳٫۷۵ کیلوگرم/).waitFor({timeout:15000});assert.match(await storeRow.innerText(),/سرویس اول/);const bulkText=await page.locator(`[data-store-summary-id="${bulk.id}"]`).innerText();assert.match(bulkText,/سرویس اول ۲ کیلوگرم/);assert.match(bulkText,/سرویس دوم ۴ کیلوگرم/);assert.match(await storeModal.innerText(),/هنوز وزنی ذخیره نشده/);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
