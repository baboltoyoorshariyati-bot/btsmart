'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('لغو آتی و غیرحضوری از فروش با حفظ بیعانه و حفاظت از تحویل',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-remote-cancel-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_TEST_EMPTY_CATALOG:'1'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exited '+c)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext(),wh=await browser.newContext(),gate=await browser.newContext();
  const request=async(ctx,method,url,data)=>{const r=await ctx.request.fetch(base+url,{method,data});return {status:r.status(),body:await r.json()};};
  const ok=async(ctx,method,url,data)=>{const r=await request(ctx,method,url,data);assert(r.status>=200&&r.status<300,`${url} ${r.status} ${JSON.stringify(r.body)}`);return r.body;};
  await ok(admin,'POST','/api/login',{username:'admin',password:'Initial!2345'});await ok(admin,'POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const role of ['sales','warehouse','gate'])await ok(admin,'POST','/api/admin/users',{username:role,password:'Changed!2345',fullName:role,position:role,roleCode:role,mustChangePassword:false});
  for(const [ctx,role] of [[sales,'sales'],[wh,'warehouse'],[gate,'gate']])await ok(ctx,'POST','/api/login',{username:role,password:'Changed!2345'});
  const product=(await ok(sales,'POST','/api/admin/products',{quickCode:'01',name:'محصول تست',defaultUnit:'کیلوگرم'})).product;
  const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
  const make=async(offset=0,extra={})=>(await ok(sales,'POST','/api/orders/remote',{name:'مشتری',phone:'09121112233',deliveryMode:'PICKUP',scheduledDate:day(offset),scheduledAt:day(offset)+'T'+(offset?'08:00':'00:00'),deliveryDate:day(offset),items:[{productId:product.id,requestedQty:2,requestedUnit:'کیلوگرم'}],...extra})).order;
  const future=await make(2,{deposit:{type:'CASH',amount:500}}),pending=await make(0,{deposit:{type:'CASH',amount:300}}),preparing=await make(),delivered=await make(),present=await make();
  const prepare=async o=>{await ok(wh,'POST',`/api/orders/${o.id}/warehouse/accept`,{});await ok(wh,'POST',`/api/orders/${o.id}/warehouse/start-preparing`,{});};
  await prepare(preparing);await ok(wh,'POST',`/api/orders/${preparing.id}/warehouse/draft`,{revision:0,items:[{itemId:preparing.items[0].id,deliveredKg:1}]});
  await prepare(delivered);await ok(gate,'POST',`/api/pickup/${delivered.id}/entry`,{name:'مشتری',phone:'09121112233',noVehicle:true});await ok(wh,'POST',`/api/pickup/${delivered.id}/handover`,{physicalHandoverConfirmed:true,items:[{itemId:delivered.items[0].id,deliveredKg:2}]});
  await ok(gate,'POST',`/api/pickup/${present.id}/entry`,{name:'مشتری',phone:'09121112233',noVehicle:true});
  assert.equal((await request(sales,'POST',`/api/orders/${preparing.id}/cancel-remote`,{})).status,400);
  for(const o of [delivered,present])assert.equal((await request(sales,'POST',`/api/orders/${o.id}/cancel-remote`,{confirmedNoGoods:true})).status,409);
  assert.equal((await request(wh,'POST',`/api/orders/${pending.id}/cancel-remote`,{confirmedNoGoods:true})).status,403);
  const page=await sales.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>go('sales','future'));
  const f=page.locator(`#futureOrderListV25 [data-action=future-cancel][data-id="${future.id}"]`);await f.waitFor();page.once('dialog',d=>{assert.match(d.message(),/بیعانه/);d.accept();});await f.click();
  await page.locator(`#depositRefundList [data-id="${future.id}"]`).waitFor();assert.equal((await ok(sales,'GET',`/api/orders/${future.id}`)).order.deposit.status,'REFUND_REQUIRED');
  await page.evaluate(()=>go('sales','remote'));await page.locator(`#phoneOrderFormV25`).waitFor();await page.locator('#phoneOrderFormV25 [name=name]').fill('متن محفوظ');
  for(const order of [pending,preparing]){
   const row=page.locator(`.phone-queue-table [data-order="${order.id}"]`);await row.locator('[data-action=future-cancel]').waitFor();
   if(order.id===pending.id){page.once('dialog',d=>{assert.match(d.message(),/بیعانه/);d.dismiss();});await row.locator('[data-action=future-cancel]').click();assert.equal((await ok(sales,'GET',`/api/orders/${order.id}`)).order.status,'WAREHOUSE_PENDING');}
   page.once('dialog',d=>{assert.match(d.message(),/انبار/);d.accept();});const result=page.waitForResponse(r=>r.url().endsWith(`/api/orders/${order.id}/cancel-remote`)&&r.request().method()==='POST');await row.locator('[data-action=future-cancel]').click();assert.equal((await result).status(),200);await row.waitFor({state:'detached'});
   const saved=(await ok(sales,'GET',`/api/orders/${order.id}`)).order;assert.equal(saved.status,'CANCELLED');assert(saved.cancelledBy);assert.equal(saved.items[0].itemStatus,'CANCELLED');
   if(order.id===pending.id)assert.equal(saved.deposit.status,'REFUND_REQUIRED');else assert.equal(saved.warehouseWeightDraft.items[0].deliveredKg,1);
   assert.equal((await request(wh,'POST',`/api/orders/${order.id}/warehouse/draft`,{revision:1,items:[]})).status,409);
  }
  assert.equal(await page.locator('#phoneOrderFormV25 [name=name]').inputValue(),'متن محفوظ');assert.equal(await page.locator(`.phone-queue-table [data-order="${delivered.id}"] [data-action=future-cancel]`).count(),0);
  const notices=await ok(wh,'GET','/api/notifications');assert(notices.notifications.some(n=>n.type==='REMOTE_ORDER_CANCELLED'&&n.entityId===preparing.id&&n.message.includes('متوقف')));
  const refunds=await ok(sales,'GET','/api/deposit-refunds');assert(refunds.orders.some(o=>o.id===pending.id));assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
