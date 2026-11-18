'use strict';
// Optional real-browser check: BT_CHROMIUM_PATH=/path/to/chromium NODE_PATH=... node --test tests/form-browser.test.js
// The regular test suite remains dependency-free. These checks use isolated temporary data.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('مرورگر: خوانایی پلاک، هندسه موتور و هماهنگی فرم‌ها در دسکتاپ و موبایل', {skip:!executablePath,timeout:60000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-layout-'));
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Test!23456'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout')),15000);child.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exit '+code));});});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const width of [1280,390,320]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
   await page.evaluate(()=>{document.querySelector('#appView').classList.remove('hidden');document.querySelector('#loginView').classList.add('hidden');});
   for(const type of ['resource','branch','customer','driver','user','pos','product']){
    await page.evaluate(t=>{
     if(t==='resource'){adm.resourceKind='vehicle';openResourceForm(null);}
     if(t==='branch'){adm.resourceKind='branch';openResourceForm(null);}
     if(t==='customer')custForm(null);if(t==='driver')openDriverForm(null);if(t==='pos')openPaymentDeviceForm(null);if(t==='product')openProductForm(null);
     if(t==='user'){openModal('کاربر',userFormHtml({roleCode:'driver'},[],[],[],[]));document.querySelector('[data-role-fields=store]').style.display='none';document.querySelector('[data-role-fields=driver]').style.display='contents';}
    },type);
    const geometry=await page.evaluate(()=>{
     const card=document.querySelector('#modal .modal-card'),form=card.querySelector('form'),rect=card.getBoundingClientRect(),over=[];
     for(const field of form.querySelectorAll('.cust-field:not(.adm-check)')){
      const label=field.querySelector(':scope > span:first-child'),control=field.querySelector(':scope > input:not([type=hidden]),:scope > select,:scope > textarea,:scope > [data-plate-editor]');
      if(!label||!control||!field.getClientRects().length)continue;
      const a=label.getBoundingClientRect(),b=control.getBoundingClientRect();if(a.bottom>b.top+1||b.left<rect.left-1||b.right>rect.right+1)over.push(label.textContent.trim());
     }
     return {width:rect.width,scroll:card.scrollWidth,over};
    });
    assert.deepEqual(geometry.over,[],`${width} ${type}: overlapping fields`);assert(geometry.scroll<=geometry.width+2,`${width} ${type}: horizontal overflow`);
    const textBounds=await page.evaluate(()=>{const bad=[];for(const el of document.querySelectorAll('#modal form .cust-field:not(.adm-check) > span:first-child,#modal form .btn')){if(!el.getClientRects().length)continue;const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);for(const x of range.getClientRects())if(x.width&&x.height&&(x.left<r.left-1||x.right>r.right+1||x.top<r.top-1||x.bottom>r.bottom+1))bad.push(el.textContent.trim());}return bad;});assert.deepEqual(textBounds,[],`${width} ${type}: text outside control`);
    const plateBorders=await page.locator('#modal .iran-plate').evaluateAll(nodes=>nodes.filter(x=>x.getClientRects().length).map(x=>getComputedStyle(x).borderTopLeftRadius));assert(plateBorders.every(x=>x==='4px'),`${width} ${type}: rectangular plate ${plateBorders}`);
    if(type==='pos'){assert.equal(await page.locator('#posSimWrap').evaluate(el=>getComputedStyle(el).display),'none');await page.locator('#posDeviceForm [name=connection]').selectOption('wireless');assert.notEqual(await page.locator('#posSimWrap').evaluate(el=>getComputedStyle(el).display),'none');}
    if(type==='resource'){
     await page.locator('[data-plate-letter]').selectOption('ج');
     const letter=await page.locator('[data-plate-letter]').evaluate(el=>{const s=getComputedStyle(el);return {value:el.value,width:el.clientWidth,padding:parseFloat(s.paddingLeft)+parseFloat(s.paddingRight),color:s.color};});
     assert.equal(letter.value,'ج');assert(letter.width-letter.padding>20,'letter clipped by padding');assert.notEqual(letter.color,'rgba(0, 0, 0, 0)');
     await page.locator('#resourceForm [name=vehicleType]').fill('موتورسیکلت');
     const geometry=await page.locator('#resourceForm .iran-plate.is-motor').evaluate(el=>{const b=el.querySelector('.blue-strip').getBoundingClientRect(),top=el.querySelector('.motor-top').getBoundingClientRect(),bottom=el.querySelector('.motor-bottom').getBoundingClientRect(),plate=el.getBoundingClientRect();return {b:b.toJSON(),top:top.toJSON(),bottom:bottom.toJSON(),plate:plate.toJSON()};});
     assert(geometry.b.bottom<=geometry.bottom.top+1);assert(geometry.bottom.width>geometry.top.width);assert(geometry.bottom.bottom<=geometry.plate.bottom+1);
    }
    await page.evaluate(()=>closeModal());
   }
   // Gate has a separate, formerly conflicting compatibility rule.
   await page.evaluate(()=>{document.querySelector('#content').innerHTML=renderGateEntry();bindGate('entry');bindPlate();});
   await page.locator('#gateForm [name=vehicleType]').selectOption({label:'موتورسیکلت'});
   const gate=await page.locator('#plateBox .iran-plate.is-motor').evaluate(el=>{const a=el.querySelector('.motor-top').getBoundingClientRect(),b=el.querySelector('.motor-bottom').getBoundingClientRect(),p=el.getBoundingClientRect();return {a:a.toJSON(),b:b.toJSON(),p:p.toJSON()};});
   assert(gate.b.top>=gate.a.bottom-1&&gate.b.bottom<=gate.p.bottom+1);assert(gate.b.width>gate.a.width);
   for(const section of ['remote','future']){
    await page.evaluate(section=>{document.querySelector('#content').innerHTML=section==='remote'?renderSalesRemoteV32([]):window.renderSalesFutureV25([]);},section);
    const content=await page.evaluate(()=>{const fields=[...document.querySelectorAll('#content form .field')],bad=[];for(const field of fields){const label=field.querySelector(':scope > label'),control=field.querySelector(':scope > .input-shell,:scope > input,:scope > select,:scope > textarea');if(!label||!control||!field.getClientRects().length)continue;const a=label.getBoundingClientRect(),b=control.getBoundingClientRect();if(a.bottom>b.top+1||b.left<0||b.right>innerWidth+1)bad.push(label.textContent.trim());}return {count:fields.length,bad};});
    assert(content.count>0,section+' form missing');assert.deepEqual(content.bad,[],`${width} ${section}: overlapping fields`);
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  // Exercise the actual form submission against an isolated SQLite instance.
  const context=await browser.newContext(),page=await context.newPage();
  const base=`http://127.0.0.1:${port}`;
  let response=await context.request.post(base+'/api/login',{data:{username:'admin',password:'Test!23456'}});assert.equal(response.status(),200);
  response=await context.request.post(base+'/api/account/password',{data:{currentPassword:'Test!23456',newPassword:'Next!23456'}});assert.equal(response.status(),200);
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.evaluate(()=>{document.querySelector('#appView').classList.remove('hidden');document.querySelector('#loginView').classList.add('hidden');adm.resourceKind='vehicle';openResourceForm(null);});
  await page.locator('#resourceForm [name=vehicleType]').fill('وانت');
  await page.locator('[data-plate-a]').fill('12');await page.locator('[data-plate-letter]').selectOption('ج');await page.locator('[data-plate-c]').fill('345');await page.locator('[data-plate-province]').fill('67');
  let pending=page.waitForResponse(r=>r.url().endsWith('/api/admin/transport-vehicles')&&r.request().method()==='POST');
  await page.locator('#resourceForm button[type=submit]').click();response=await pending;assert.equal(response.status(),201);let car=(await response.json()).vehicle;assert.equal(car.plate,'12ج345-67');
  await page.evaluate(()=>{adm.resourceKind='vehicle';openResourceForm(null);});await page.locator('#resourceForm [name=vehicleType]').fill('موتورسیکلت');
  await page.locator('[data-motor-a]').fill('253');await page.locator('[data-motor-b]').fill('07122');
  pending=page.waitForResponse(r=>r.url().endsWith('/api/admin/transport-vehicles')&&r.request().method()==='POST');
  await page.locator('#resourceForm button[type=submit]').click();response=await pending;assert.equal(response.status(),201);let motor=(await response.json()).vehicle;assert.equal(motor.plate,'253-07122');
  await page.evaluate(v=>{adm.resourceKind='vehicle';openResourceForm(v)},motor);
  assert.equal(await page.locator('[data-motor-a]').inputValue(),'۲۵۳');assert.equal(await page.locator('[data-motor-b]').inputValue(),'۰۷۱۲۲');
  pending=page.waitForResponse(r=>r.url().endsWith('/api/admin/transport-vehicles/'+motor.id)&&r.request().method()==='PUT');
  await page.locator('#resourceForm button[type=submit]').click();response=await pending;assert.equal(response.status(),200);assert.equal((await response.json()).vehicle.plate,motor.plate);
  response=await context.request.post(base+'/api/customers',{data:{name:'مشتری قدیمی',phone:'09121112233',plate:'قدیمی A-1',vehicleType:'وانت'}});assert.equal(response.status(),201);const customer=(await response.json()).customer;
  await page.evaluate(c=>custForm(c),customer);await page.locator('#custForm [name=company]').fill('واحد نمونه');
  pending=page.waitForResponse(r=>r.url().endsWith('/api/customers/'+customer.id)&&r.request().method()==='PUT');
  await page.locator('#custForm button[type=submit]').click();response=await pending;assert.equal(response.status(),200);assert.equal((await response.json()).customer.plate,'قدیمی A-1');
  await context.close();
 }finally{if(browser)await browser.close();if(child.exitCode===null&&child.signalCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
