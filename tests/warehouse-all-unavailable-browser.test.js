'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('warehouse all unavailable goes to sales flow, not settlement or print',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-unavailable-browser-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),warehouse=await browser.newContext(),sales=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const roleCode of ['warehouse','sales'])await post(admin,'/api/admin/users',{username:'unavailable-'+roleCode,roleCode,fullName:roleCode,position:'تست',password:'Changed!2345',mustChangePassword:false});
  await post(warehouse,'/api/login',{username:'unavailable-warehouse',password:'Changed!2345'});await post(sales,'/api/login',{username:'unavailable-sales',password:'Changed!2345'});
  const visit=(await post(admin,'/api/visits',{name:'تست ناموجود',phone:'09121112255',noVehicle:true})).visit;
  const order=(await post(sales,'/api/orders',{visitId:visit.id,deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:2,requestedUnit:'کیلوگرم'}]})).order;
  await post(warehouse,`/api/orders/${order.id}/warehouse/accept`,{});
  const wp=await warehouse.newPage(),sp=await sales.newPage(),errors=[];for(const p of [wp,sp])p.on('pageerror',e=>errors.push(e.message));
  await wp.goto(base,{waitUntil:'networkidle'});await sp.goto(base,{waitUntil:'networkidle'});
  await wp.evaluate(()=>go('warehouse','preparing'));await wp.locator(`[data-action=wh38-start][data-id="${order.id}"]`).click();
  await wp.locator(`[data-wh38-oos="${order.items[0].id}"]`).check();let dialogText='';wp.once('dialog',d=>{dialogText=d.message();return d.accept();});
  const response=wp.waitForResponse(r=>r.url().endsWith(`/api/orders/${order.id}/warehouse`)&&r.request().method()==='POST');
  await wp.locator(`[data-action=wh38-finalize][data-id="${order.id}"]`).click();const payload=await (await response).json();assert.equal(payload.allUnavailable,true);assert.match(dialogText,/ناموجود/);assert.doesNotMatch(dialogText,/تحویل فیزیکی/);
  await sp.evaluate(()=>go('sales','flow'));await sp.locator(`.sd-flow-row[data-order="${order.id}"]`).waitFor();
  await sp.evaluate(()=>go('sales','settlement'));assert.equal(await sp.locator(`[data-action=select-settlement][data-id="${order.id}"]`).count(),0);
  const saved=(await (await sales.request.get(base+`/api/orders/${order.id}`)).json()).order;assert.equal(saved.status,'RETURNED_TO_SALES');assert.equal(saved.warehouseHandover,undefined);assert.equal(saved.warehouseDocumentNo,undefined);
  // Reproduce a legacy saved order and exercise the explicit recovery UI.
  const v2=(await post(admin,'/api/visits',{name:'تست قدیمی',phone:'09121112256',noVehicle:true})).visit;
  const old=(await post(sales,'/api/orders',{visitId:v2.id,deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:2,requestedUnit:'کیلوگرم'}]})).order;
  await post(warehouse,`/api/orders/${old.id}/warehouse/accept`,{});await post(warehouse,`/api/orders/${old.id}/warehouse/start-preparing`,{});
  const script=`const s=require('./lib/store'),db=s.init(),o=db.orders.find(x=>x.id===process.env.OID),i=db.orderItems.find(x=>x.orderId===o.id),now=s.nowIso();Object.assign(i,{itemStatus:'OUT_OF_STOCK',warehouseStatus:'OUT_OF_STOCK',deliveredKg:0});Object.assign(o,{status:'SETTLEMENT_PENDING',warehouseCompletedAt:now,warehouseDocumentNo:'W-000099'});s.audit(null,'WAREHOUSE_FINALIZE','order',o.id,{warehouseDocumentNo:o.warehouseDocumentNo,items:[{itemId:i.id,status:'OUT_OF_STOCK',deliveredKg:0}]});s.save();`;
  const injected=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,OID:old.id,ADMIN_INITIAL_PASSWORD:'Initial!2345'},encoding:'utf8'});assert.equal(injected.status,0,injected.stderr);
  await sp.evaluate(async()=>{await fetchSalesCache(true);await renderSales('settlement');});
  const recover=sp.locator(`[data-action=recover-no-goods][data-id="${old.id}"]`);await recover.waitFor();assert.equal(await sp.locator(`[data-action=select-settlement][data-id="${old.id}"]`).count(),0);
  sp.once('dialog',d=>d.accept());const repaired=sp.waitForResponse(r=>r.url().endsWith('/recover-no-goods')&&r.request().method()==='POST');await recover.click();assert.equal((await repaired).status(),200);await recover.waitFor({state:'detached'});
  await sp.evaluate(async()=>{await fetchSalesCache(true);await go('sales','flow');});await sp.locator(`.sd-flow-row[data-order="${old.id}"]`).waitFor();assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
