'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('مرورگر: یک کارتابل ترابری، منابع مستقل و تخصیص واقعی بدون حساب راننده',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-desk-')),base=`http://127.0.0.1:${port}`;
 const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'};delete env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext(),transport=await browser.newContext({viewport:{width:1280,height:900}});
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const [username,roleCode] of [['sale1','sales'],['dispatch1','dispatch']])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false});
  await post(sales,'/api/login',{username:'sale1',password:'Changed!2345'});await post(transport,'/api/login',{username:'dispatch1',password:'Changed!2345'});
  const driver=(await post(transport,'/api/transport/drivers',{fullName:'راننده مستقل',phone:'09121112233'})).driver,vehicle=(await post(transport,'/api/transport/vehicles',{vehicleType:'وانت',plate:'12ب34567'})).vehicle;
  const day=new Date(),date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
  const order=(await post(sales,'/api/orders/remote',{name:'مشتری کارتابل',phone:'09121112234',dispatchPlace:'بابل',scheduledDate:date,scheduledTime:'00:00',deliveryMode:'DELIVERY',items:[{productId:'p01',requestedQty:4,requestedUnit:'کیلوگرم'}]})).order;
  const page=await transport.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#railNav [data-cartable=transport-resources]').count(),1);assert.equal(await page.locator('#railNav [data-cartable=drivers]').count(),0);
  const active=async key=>{assert.deepEqual(await page.locator('#railNav .cartable-nav-item.active').evaluateAll(xs=>xs.map(x=>x.dataset.cartable)),[key]);};
  await active('dashboard');
  const dash=page.locator('[data-dash-role=dispatch]');await dash.waitFor();assert.equal((await dash.locator('.role-dash-card').filter({hasText:'رانندگان فعال'}).locator('strong').innerText()).trim(),'۱');assert.equal((await dash.locator('.role-dash-card').filter({hasText:'سرویس‌های در برنامه'}).locator('strong').innerText()).trim(),'۱');
  const unpaired=(await post(transport,'/api/transport/drivers',{fullName:'راننده بدون خودرو',phone:'09121117777'})).driver,vehicle2=(await post(transport,'/api/transport/vehicles',{vehicleType:'وانت',plate:'22ب34567'})).vehicle;
  await dash.locator('[data-cartable=transport-resources]').click();await page.locator('#content').getByText('راننده مستقل').first().waitFor();await active('transport-resources');
  await page.locator('#railNav [data-cartable=orders]').click();await page.locator('#transportPlans .tp-plan-row').filter({hasText:'مشتری کارتابل'}).waitFor();await active('orders');
  await page.locator('#railNav [data-cartable=dashboard]').click();await page.locator('[data-dash-role=dispatch]').waitFor();await active('dashboard');
  await page.locator('#railNav [data-cartable=reports]').click();await active('reports');
  await page.locator('#railNav [data-cartable=orders]').click();await page.locator('#transportPlans .tp-plan-row').filter({hasText:'مشتری کارتابل'}).waitFor();await active('orders');
  assert.equal(await page.locator('#transportPlans .tp-plan-row').filter({hasText:'مشتری کارتابل'}).count(),1);assert.equal(await page.locator('[data-legacy-dispatch]').count(),0);
  for(const width of [1280,768,390,320]){
   await page.setViewportSize({width,height:900});
   const row=page.locator('#transportPlans .tp-plan-row').filter({hasText:'مشتری کارتابل'}),table=page.locator('#transportPlans .tp-plan-table');
   assert.equal(await table.locator('> thead th').count(),6);assert.equal(await row.locator('td[data-label]').count(),6);assert.equal(await row.evaluate(el=>getComputedStyle(el).display),width<=900?'block':'table-row');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow ${width}`);assert.equal(await row.locator('[data-tp=details]').count(),1);

  }
  await page.setViewportSize({width:1280,height:900});
  await page.locator(`#transportPlans [data-tp=details][data-id="${order.id}"]`).click();await page.locator('#tpAssign').waitFor();
  assert.equal(await page.locator('#tpAssign select option').count(),1);assert(await page.locator('#tpAssign button[type=submit]').isDisabled());assert.match(await page.locator('#tpAssign').innerText(),/ابتدا در «خودروهای پخش»/);
  assert((await transport.request.put(base+`/api/transport/drivers/${driver.id}/resources`,{data:{vehicleId:vehicle.id,paymentDeviceId:''}})).ok());await page.locator('#modal .modal-close').click();await page.locator('[data-tp=refresh]').click();await page.locator(`#transportPlans [data-tp=details][data-id="${order.id}"]`).click();await page.locator('#tpAssign select option').nth(1).waitFor({state:'attached'});
  for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});const grid=await page.locator('#modal .tp-detail-grid').evaluate(el=>{const cells=[...el.children],rs=cells.map(c=>c.getBoundingClientRect()),r=el.getBoundingClientRect();return{columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,inside:rs.every(x=>x.left>=r.left-1&&x.right<=r.right+1),first:rs.slice(0,2).map(x=>x.top),overflow:el.scrollWidth-el.clientWidth};});assert.equal(grid.columns,width<=700?2:4,`columns ${width}`);assert.equal(grid.first[0],grid.first[1]);assert(grid.inside&&grid.overflow<=1,`grid ${width} ${JSON.stringify(grid)}`);assert.equal(await page.locator('#modal .tp-items-table tbody tr').count(),1);assert.equal(await page.locator('#modal .modal-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`modal ${width}`);}
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.locator('#tpAssign select').count(),1);assert.equal(await page.locator('#tpAssign select option').count(),2);assert.equal(await page.locator(`#tpAssign option[value="${unpaired.id}"]`).count(),0);assert.match(await page.locator('#tpAssign select[name=driverId] option').nth(1).innerText(),/راننده مستقل.*۱۲ب۳۴۵۶۷/);
  await page.locator('#tpAssign select[name=driverId]').selectOption(driver.id);assert((await transport.request.put(base+`/api/transport/drivers/${driver.id}/resources`,{data:{vehicleId:vehicle2.id,paymentDeviceId:''}})).ok());await page.locator('#tpAssign button[type=submit]').click();await page.locator('#tpAssign [role=alert]').getByText(/مطابقت ندارد/).waitFor();assert.equal((await (await sales.request.get(base+`/api/orders/${order.id}`)).json()).order.transportAssignments['0'],undefined);
  await page.locator('#modal .modal-close').click();await page.locator('[data-tp=refresh]').click();await page.locator(`#transportPlans [data-tp=details][data-id="${order.id}"]`).click();assert.match(await page.locator('#tpAssign select[name=driverId] option').nth(1).innerText(),/راننده مستقل.*۲۲ب۳۴۵۶۷/);await page.locator('#tpAssign select[name=driverId]').selectOption(driver.id);await page.locator('#tpAssign button[type=submit]').click();
  await page.locator('#transportPlans .tp-plan-row').filter({hasText:'راننده مستقل'}).waitFor({state:'detached'});
  await page.locator('#transportPlans [data-tp=plan-tab][data-tab=assigned]').click();
  await page.locator('#transportPlans .tp-plan-row').filter({hasText:'راننده مستقل'}).waitFor();
  const response=await sales.request.get(base+`/api/orders/${order.id}`),data=await response.json();assert.equal(data.order.transportAssignments['0'].driverId,driver.id);assert.equal(data.order.transportAssignments['0'].vehicleId,vehicle2.id);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
