'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;

test('مرورگر: نگهبان و انبار جزئیات سفارش تسویه‌شدهٔ سوابق مراجعه را باز می‌کنند',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const server=net.createServer().listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-gate-history-')),base=`http://127.0.0.1:${port}`;
 const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'};
 delete env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',data=>{if(String(data).includes('"listening"')){clearTimeout(timer);resolve();}});proc.once('exit',code=>reject(Error('server exit '+code)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const admin=await browser.newContext(),gate=await browser.newContext({viewport:{width:1280,height:900}}),sales=await browser.newContext(),warehouse=await browser.newContext();
  const post=async(context,url,data={})=>{const response=await context.request.post(base+url,{data});assert(response.ok(),`${url} ${response.status()} ${await response.text()}`);return response.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});
  await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const [username,roleCode] of [['gate1','gate'],['sales1','sales'],['warehouse1','warehouse']])
   await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false});
  await post(gate,'/api/login',{username:'gate1',password:'Changed!2345'});
  await post(sales,'/api/login',{username:'sales1',password:'Changed!2345'});
  await post(warehouse,'/api/login',{username:'warehouse1',password:'Changed!2345'});
  const visit=(await post(gate,'/api/visits',{name:'مشتری آزمایش سابقه',phone:'09120000001',plate:'12ب345-67'})).visit;
  const order=(await post(sales,'/api/orders',{visitId:visit.id,deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:4,requestedUnit:'کیلوگرم'}]})).order;
  const item=order.items[0];
  await post(warehouse,`/api/orders/${order.id}/warehouse/accept`,{});
  await post(warehouse,`/api/orders/${order.id}/warehouse/start-preparing`,{});
  await post(warehouse,`/api/orders/${order.id}/warehouse`,{items:[{itemId:item.id,deliveredKg:3.5}]});
  await post(sales,`/api/orders/${order.id}/settle`,{signatureData:`data:image/png;base64,${'A'.repeat(400)}`,fingerprintRef:'legacy-reference',noFingerprintAllowed:true,items:[{itemId:item.id,unitPrice:2500}]});
  const detailsResponse=await gate.request.get(`${base}/api/orders/${order.id}`);assert.equal(detailsResponse.status(),200);
  const gateOrder=(await detailsResponse.json()).order;assert.equal(gateOrder.status,'SETTLED');
  assert.doesNotMatch(JSON.stringify(gateOrder),/payment|payments|amount|price|signature|legacy-reference/i);
  const productName=gateOrder.items[0].product.name.replace(/\s+/g,' ').trim();

  const page=await gate.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.locator('#railNav [data-cartable=history]').click();
  const row=page.locator(`[data-gate-visit="${visit.id}"]`);await row.waitFor();
  const button=row.locator('[data-action=gate-order-history]');assert.equal(await button.isEnabled(),true);
  await button.click();await page.locator('#modal.open .whh-order-detail').waitFor();
  const modal=await page.locator('#modal').innerText();
  assert(modal.includes(productName),modal);assert.match(modal,/۳٫۵|3\.5/,'the verified delivered weight is shown');
  assert.doesNotMatch(modal,/پرداخت|مبلغ|قیمت|امضا|اثر انگشت/);
  assert.deepEqual(errors,[]);

  const warehousePage=await warehouse.newPage(),warehouseErrors=[];
  warehousePage.on('pageerror',error=>warehouseErrors.push(error.message));
  await warehousePage.goto(base+'/',{waitUntil:'networkidle'});
  await warehousePage.locator('#railNav [data-cartable=history]').click();
  const warehouseRow=warehousePage.locator(`[data-gate-visit=\"${visit.id}\"]`);await warehouseRow.waitFor();
  const warehouseButton=warehouseRow.locator('[data-action=warehouse-visit-order-details]');
  assert.equal(await warehouseButton.isEnabled(),true);
  const warehouseDetailsCall=warehousePage.waitForResponse(response=>new URL(response.url()).pathname===`/api/warehouse/visit-order-details/${order.id}`);
  await warehouseButton.click();
  const warehouseDetailsResponse=await warehouseDetailsCall;assert.equal(warehouseDetailsResponse.status(),200);
  await warehousePage.locator('#modal.open .whh-order-detail').waitFor();
  const warehouseModal=await warehousePage.locator('#modal').innerText();
  assert(warehouseModal.includes(productName),warehouseModal);assert.match(warehouseModal,/۳٫۵|3\.5/,'the verified delivered weight is shown');
  assert.doesNotMatch(warehouseModal,/پرداخت|مبلغ|قیمت|امضا|اثر انگشت|09120000001/);
  assert.deepEqual(warehouseErrors,[]);
  await admin.close();await gate.close();await sales.close();await warehouse.close();
 }finally{
  if(browser)await browser.close();
  if(proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await exited;}
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
