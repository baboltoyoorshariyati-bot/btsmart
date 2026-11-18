'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('مرورگر: تنظیم دامنه و مشاهدهٔ وضعیت HTTPS در تنظیمات مدیر', {skip:!exe,timeout:60000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-https-ui-'));const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);child.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});child.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const width of [1280,390]){
   const ctx=await browser.newContext({viewport:{width,height:900}}),base=`http://127.0.0.1:${port}`;
   const pass=width===1280?'Initial!2345':'Changed!2345';let r=await ctx.request.post(base+'/api/login',{data:{username:'admin',password:pass}});assert.equal(r.status(),200);
   if(width===1280){r=await ctx.request.post(base+'/api/account/password',{data:{currentPassword:pass,newPassword:'Changed!2345'}});assert.equal(r.status(),200);}
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
   if(width<600)await page.locator('#railToggleBtn').click();
   await page.locator('#railNav [data-page=admin]').click();await page.locator('#tlsSettingsForm').waitFor();
   await page.waitForFunction(()=>document.querySelector('#tlsStatus')?.textContent.includes('هنوز گواهی'));
   assert.equal(await page.locator('#tlsSettings').evaluate(e=>e.scrollWidth<=e.clientWidth+2),true);
   let submitted=null;
   await page.route('**/api/admin/https',async route=>{
    if(route.request().method()==='POST'){submitted=route.request().postDataJSON();return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({active:null,job:{state:'working',message:'در حال صدور'}})});}
    return route.continue();
   });
   page.on('dialog',d=>d.accept());
   await page.locator('#tlsDomain').fill('app.example.com');await page.locator('#tlsEmail').fill('admin@example.com');await page.locator('#tlsPassword').fill('Changed!2345');await page.locator('#tlsSettingsForm [name=terms]').check();
   await page.locator('#tlsSettingsForm button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#tlsStatus')?.textContent.includes('در حال صدور'));
   assert.equal(submitted.domain,'app.example.com');assert.equal(submitted.terms,true);assert.equal(await page.locator('#tlsPassword').inputValue(),'');assert.equal(await page.locator('#tlsSettingsForm button[type=submit]').isDisabled(),true);
   assert.deepEqual(errors,[]);assert.equal((await ctx.request.post(base+'/api/logout',{data:{}})).status(),200);await ctx.close();
  }
 }finally{if(browser)await browser.close();if(child.exitCode===null&&child.signalCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
