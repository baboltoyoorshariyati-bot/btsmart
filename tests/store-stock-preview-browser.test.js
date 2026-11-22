'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;

test('انبار: پیش‌نمایش فقط خواندنی شعبه، واحدهای مجزا، منشأ و وزن موجود',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-stock-preview-ui-')),base=`http://127.0.0.1:${port}`;let browser;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',code=>reject(Error('server exit '+code)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const admin=await browser.newContext(),wh=await browser.newContext({viewport:{width:390,height:850}}),sales=await browser.newContext(),shop=await browser.newContext(),other=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),`${url} ${r.status()} ${await r.text()}`);return r.json();};
  const get=async(ctx,url)=>{const r=await ctx.request.get(base+url);assert(r.ok(),`${url} ${r.status()} ${await r.text()}`);return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const [username,roleCode,extra] of [['wh1','warehouse',{}],['sales1','sales',{}],['shop1','store',{storeName:'شعبه یک'}],['shop2','store',{storeName:'شعبه دو',branchNo:2}]])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false,...extra});
  for(const [context,username] of [[wh,'wh1'],[sales,'sales1'],[shop,'shop1'],[other,'shop2']])await post(context,'/api/login',{username,password:'Changed!2345'});
  const create=async(ctx,qty,unit='کیلوگرم',purpose='STOCK',description='')=>(await post(ctx,'/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:purpose,...(purpose==='CUSTOMER'?{name:'مشتری خصوصی',phone:'09121112234'}:{}),items:[{productId:'p01',requestedQty:qty,requestedUnit:unit,description}]})).order;
  const a=await create(shop,50,'کیلوگرم','STOCK','<img src=x>'),b=await create(shop,30),c=await create(shop,10,'عدد'),customer=await create(shop,7,'عدد','CUSTOMER'),different=await create(other,3);
  for(const order of [a,b,c,customer,different])await post(sales,`/api/store/orders/${order.id}/quick-send`,{});
  await post(wh,`/api/orders/${a.id}/warehouse/accept`,{});await post(wh,`/api/orders/${a.id}/store-run/weights`,{run:1,items:[{itemId:a.items[0].id,deliveredKg:50}]});
  const beforeA=(await get(sales,`/api/orders/${a.id}`)).order,beforeB=(await get(sales,`/api/orders/${b.id}`)).order;
  const page=await wh.newPage(),errors=[],mutations=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.method()!=='GET'&&/store-stock-consolidation/.test(req.url()))mutations.push(req.method());});
  await page.goto(base+'/',{waitUntil:'networkidle'});await page.evaluate(()=>go('warehouse','stores'));
  await page.locator('[data-action=wh-stock-preview][data-branch="1"]').click();
  const modal=page.locator('#modal.open');await modal.locator('.wh-stock-preview').waitFor();const text=await modal.innerText();
  assert.match(text,/فقط پیش‌نمایش/);assert.match(text,/سرویس یا سند مشترک نیست/);assert.match(text,/۸۰ کیلوگرم/);assert.match(text,/۱۰ عدد/);assert.match(text,/۵۰ کیلوگرم/);assert.doesNotMatch(text,/مشتری خصوصی/);
  assert.equal(await modal.locator('.wh-stock-preview tbody tr').count(),1);await modal.locator('details summary').click();assert.match(await modal.locator('details').innerText(),/<img src=x>/);assert.equal(await modal.locator('details img').count(),0);
  for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow at ${width}`);}
  assert.deepEqual((await get(sales,`/api/orders/${a.id}`)).order,beforeA);assert.deepEqual((await get(sales,`/api/orders/${b.id}`)).order,beforeB);assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
  await page.locator('#modal .modal-close').click();await page.locator('[data-action=wh-stock-preview][data-branch="2"]').click();await modal.locator('.wh-stock-preview').waitFor();assert.match(await modal.innerText(),/۳ کیلوگرم/);assert.doesNotMatch(await modal.innerText(),/۸۰ کیلوگرم/);
  await Promise.all([admin.close(),wh.close(),sales.close(),shop.close(),other.close()]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
