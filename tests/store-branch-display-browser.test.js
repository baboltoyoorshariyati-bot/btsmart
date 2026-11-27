'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('فهرست شعب نام و شماره را یکسان نمایش می‌دهد، بدون تغییر داده‌ها',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-branch-display-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext();
  const post=async(url,data)=>{const r=await ctx.request.post(base+url,{data});assert.ok(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json();};
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const created=[];for(const [name,branchNo] of [['فروشگاه شعبه 1 بابل طیور حمزه کلا',1],['امیرکبیر',2],['امیرکلا',3]])created.push((await post('/api/admin/store-branches',{name,branchNo})).branch);
  const get=async()=>{const r=await ctx.request.get(base+'/api/admin/store-branches');assert.equal(r.status(),200);return (await r.json()).branches;};
  const before=await get(),page=await ctx.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/admin/store-branches')&&!['GET','HEAD'].includes(r.method()))writes.push(r.method());});
  await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>go('store-branches'));await page.locator('.adm-data-table tbody tr').first().waitFor();
  for(const width of [320,390,768,1280,1920]){
   await page.setViewportSize({width,height:850});
   for(const [index,name,no] of [[0,'حمزه کلا','شعبه ۱'],[1,'امیرکبیر','شعبه ۲'],[2,'امیرکلا','شعبه ۳']]){
    const cell=page.locator('.adm-data-table tbody tr').nth(index).locator('td').first();
    assert.equal(await cell.locator('b').innerText(),name);assert.equal(await cell.locator('span').innerText(),no);
    assert.equal(await cell.locator('b').count(),1);assert.equal(await cell.locator('span').count(),1);
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow ${width}`);
  }
  await page.locator(`[data-adm=resource-edit][data-id="${created[0].id}"]`).click();
  assert.equal(await page.locator('#resourceForm [name=name]').inputValue(),before[0].name);
  assert.equal(await page.locator('#resourceForm [name=branchNo]').inputValue(),'1');
  await page.locator('#modal [data-action=close-modal]').first().click();
  assert.deepEqual(await get(),before);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await ctx.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
