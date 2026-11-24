'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('نشست مرورگر با نوسازی و صفحهٔ دوم حفظ و با بستن آخرین صفحه یا خروج باطل می‌شود',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-session-browser-')),base=`http://127.0.0.1:${port}`;let browser,proc;
 try{
  proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext(),other=await browser.newContext();
  const post=async(ctx,url,data)=>ctx.request.post(base+url,{data});let r=await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});assert(r.ok());r=await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});assert(r.ok());r=await post(admin,'/api/admin/users',{username:'session-sales',roleCode:'sales',fullName:'فروش',position:'تست',password:'Changed!2345',mustChangePassword:false});assert(r.ok(),await r.text());
  const credentials={username:'session-sales',password:'Changed!2345',browserSession:true};r=await post(sales,'/api/login',credentials);assert.equal(r.status(),200);assert.equal((await post(other,'/api/login',credentials)).status(),409);
  const page=await sales.newPage();let presence=page.waitForResponse(x=>x.url().endsWith('/api/session/presence')&&x.status()===200);await page.goto(base,{waitUntil:'networkidle'});await presence;await page.reload({waitUntil:'networkidle'});await page.locator('#appView:not(.hidden)').waitFor();
  const second=await sales.newPage();presence=second.waitForResponse(x=>x.url().endsWith('/api/session/presence')&&x.status()===200);await second.goto(base,{waitUntil:'networkidle'});await presence;
  await page.close({runBeforeUnload:true});await new Promise(resolve=>setTimeout(resolve,8500));assert.equal((await sales.request.get(base+'/api/me')).status(),200,'صفحهٔ دوم نشست را فعال نگه می‌دارد');assert.equal((await post(other,'/api/login',credentials)).status(),409);
  await second.close({runBeforeUnload:true});assert.equal((await post(other,'/api/login',credentials)).status(),200,'ورود بلافاصله پس از رسیدن پیام بسته‌شدن ممکن است');assert.equal((await sales.request.get(base+'/api/me')).status(),401,'نشست بسته‌شده با ورود جدید باطل شد');
  assert.equal((await post(other,'/api/logout',{})).status(),200);assert.equal((await other.request.get(base+'/api/me')).status(),401);assert.equal((await post(sales,'/api/login',credentials)).status(),200,'خروج حساب فوراً ورود مجدد را آزاد می‌کند');
  const retry=await sales.newPage();presence=retry.waitForResponse(x=>x.url().endsWith('/api/session/presence')&&x.status()===200);await retry.goto(base,{waitUntil:'networkidle'});await presence;
  await retry.route('**/api/logout',route=>route.abort());await retry.locator('[data-logout]').click();
  await retry.getByText('خروج در سرور تأیید نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.').waitFor();
  assert.equal(await retry.locator('#appView').evaluate(el=>el.classList.contains('hidden')),false,'قطع شبکه نباید خروج موفق نشان دهد');
  assert.equal((await post(other,'/api/login',credentials)).status(),409,'نشست سرور هنوز فعال است');
  await retry.unroute('**/api/logout');await retry.locator('[data-logout]').click();await retry.locator('#loginView:not(.hidden)').waitFor();
  assert.equal((await post(other,'/api/login',credentials)).status(),200,'تلاش دوباره پس از تأیید سرور حساب را فوراً آزاد می‌کند');
 }finally{if(browser)await browser.close();if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});

test('مرورگر: با نرسیدن پیام بستن نشست محفوظ است و با تأیید جایگزین می‌شود',{skip:!exe,timeout:60000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-session-lost-beacon-')),base=`http://127.0.0.1:${port}`;let browser;
 const preload=path.join(dir,'clock.cjs');fs.writeFileSync(preload,"const real=Date.now;let offset=0;Date.now=()=>real()+offset;process.on('message',m=>{if(m&&Number.isFinite(m.advance)){offset+=m.advance;process.send({advanced:offset});}});");
 const proc=spawn(process.execPath,['--require',preload,'server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe','ipc']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const advance=ms=>new Promise((resolve,reject)=>{proc.once('message',resolve);proc.send({advance:ms},err=>{if(err)reject(err);});});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
  const admin=await browser.newContext(),sales=await browser.newContext(),other=await browser.newContext();const post=(ctx,url,data)=>ctx.request.post(base+url,{data});
  assert((await post(admin,'/api/login',{username:'admin',password:'Initial!2345'})).ok());assert((await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'})).ok());
  assert((await post(admin,'/api/admin/users',{username:'sales2',roleCode:'sales',fullName:'فروش',position:'تست',password:'Changed!2345',mustChangePassword:false})).ok());
  const credentials={username:'sales2',password:'Changed!2345',browserSession:true};assert((await post(sales,'/api/login',credentials)).ok());
  const page=await sales.newPage();await page.addInitScript(()=>{navigator.sendBeacon=()=>true;});
  const presence=page.waitForResponse(r=>r.url().endsWith('/api/session/presence')&&r.status()===200);await page.goto(base,{waitUntil:'networkidle'});await presence;
  await page.route('**/api/session/presence',route=>route.abort());
  await advance(48*60*60*1000);
  assert.equal((await sales.request.get(base+'/api/me')).status(),200,'background suspension does not end the open session');
  await page.unroute('**/api/session/presence');
  const reconnected=page.waitForResponse(r=>r.url().endsWith('/api/session/presence')&&r.status()===200);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await reconnected;
  await page.reload({waitUntil:'networkidle'});await page.locator('#appView:not(.hidden)').waitFor();
  await page.close({runBeforeUnload:true});assert.equal((await post(other,'/api/login',credentials)).status(),409,'without a leave the session remains registered');
  await advance(48*60*60*1000);assert.equal((await post(other,'/api/login',credentials)).status(),409);
  assert.equal((await sales.request.get(base+'/api/me')).status(),200,'no heartbeat does not end a session');
  const loginPage=await other.newPage();await loginPage.goto(base,{waitUntil:'networkidle'});
  await loginPage.locator('[name=username]').fill(credentials.username);await loginPage.locator('[name=password]').fill(credentials.password);
  loginPage.once('dialog',dialog=>dialog.dismiss());await loginPage.locator('#loginForm button[type=submit]').click();
  await loginPage.getByText('نشست قبلی همچنان فعال است.').waitFor();assert.equal((await sales.request.get(base+'/api/me')).status(),200);
  loginPage.once('dialog',dialog=>dialog.accept());await loginPage.locator('#loginForm button[type=submit]').click();
  await loginPage.locator('#appView:not(.hidden)').waitFor();assert.equal((await sales.request.get(base+'/api/me')).status(),401);

 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
