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
  await second.close({runBeforeUnload:true});await new Promise(resolve=>setTimeout(resolve,8500));assert.equal((await sales.request.get(base+'/api/me')).status(),401,'بستن آخرین صفحه نشست را پایان می‌دهد');assert.equal((await post(other,'/api/login',credentials)).status(),200,'ورود دوباره پس از بسته‌شدن ممکن است');
  assert.equal((await post(other,'/api/logout',{})).status(),200);assert.equal((await other.request.get(base+'/api/me')).status(),401);assert.equal((await post(sales,'/api/login',credentials)).status(),200,'خروج حساب فوراً ورود مجدد را آزاد می‌کند');
 }finally{if(browser)await browser.close();if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
