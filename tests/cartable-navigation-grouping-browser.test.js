'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('منوهای دقیق، سربرگ‌های تحویل و زیرمنوی پخش برای نقش‌ها و مدیر', {skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-nav-group-')),base=`http://127.0.0.1:${port}`;let browser,proc;
 try{
  proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(timer);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const contexts={admin:await browser.newContext(),warehouse:await browser.newContext(),sales:await browser.newContext(),gate:await browser.newContext()};
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post(contexts.admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(contexts.admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const role of ['warehouse','sales','gate']){await post(contexts.admin,'/api/admin/users',{username:'nav-'+role,roleCode:role,fullName:role,position:'تست',password:'Changed!2345',mustChangePassword:false});await post(contexts[role],'/api/login',{username:'nav-'+role,password:'Changed!2345'});}
  const expected={warehouse:['داشبورد','ورودی','تحویل','فروشگاه','اصلاح','مرجوعی','سوابق','گزارش'],sales:['داشبورد','حضوری','غیرحضوری','فروشگاه','تسویه','پخش','درجریان','سفارش آتی','سوابق','مشتریان','محصولات','گزارش'],gate:['ورود','در انتظار','خروج','پخش','سوابق','گزارش']};
  const errors=[],pages={};for(const [role,ctx] of Object.entries(contexts)){const p=pages[role]=await ctx.newPage();p.on('pageerror',e=>errors.push(`${role}: ${e.message}`));await p.goto(base,{waitUntil:'networkidle'});}
  async function labels(p,role){await p.locator('#railNav [data-cartable]').first().waitFor();assert.deepEqual(await p.locator('#railNav [data-cartable] .nav-label').allTextContents(),expected[role]);}
  async function warehouse(p){await p.locator('#railNav [data-cartable=preparing]').click();await p.locator('[data-wh38-tab=preparing].active').waitFor();await p.locator('[data-wh38-tab=delivered]').click();await p.locator('[data-wh38-tab=delivered].active').waitFor();await p.locator('[data-wh-delivered]').waitFor();assert.equal(await p.locator('#railNav [data-cartable=preparing]').evaluate(e=>e.classList.contains('active')),true);await p.locator('[data-wh38-tab=preparing]').click();await p.locator('[data-wh38-tab=preparing].active').waitFor();}
  async function sales(p){
   await p.locator('#railNav [data-cartable=settlement]').click();await p.locator('#sales-v29-pane-settlement.active').waitFor();
   await p.locator('#railNav [data-cartable=delivery]').click();await p.locator('#sales-v29-pane-delivery.active').waitFor();
   assert.equal(await p.locator('#railNav [data-cartable=delivery]').evaluate(e=>e.classList.contains('active')),true);
   assert.equal(await p.locator('#railNav [data-cartable=settlement]').evaluate(e=>e.classList.contains('active')),false);
   assert.equal(await p.locator('[data-settlement-subtabs]').count(),0);
   const badge=await p.evaluate(()=>{app.notifSnapshot={notifications:[{targetRole:'sales',navSection:'delivery',isRead:false}]};renderNav();return {delivery:document.querySelector('#railNav [data-cartable=delivery]').innerText,settlement:document.querySelector('#railNav [data-cartable=settlement]').innerText};});assert.match(badge.delivery,/۱/);assert.doesNotMatch(badge.settlement,/۱/);
   await p.locator('#railNav [data-cartable=settlement]').click();await p.locator('#sales-v29-pane-settlement.active').waitFor();await p.locator('#railNav [data-cartable=flow]').click();
  }
  for(const role of ['warehouse','sales','gate'])await labels(pages[role],role);await warehouse(pages.warehouse);await sales(pages.sales);
  const a=pages.admin;for(const role of ['warehouse','sales','gate']){await a.locator(`[data-admin-cartable=${role}]`).click();await labels(a,role);if(role==='warehouse')await warehouse(a);if(role==='sales')await sales(a);await a.locator('[data-admin-home]').click();await a.locator('[data-admin-cartable=warehouse]').waitFor();}
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
