'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('Excel XLSX import and export in the sales product page',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core'), ExcelJS=require('../public/vendor/exceljs-4.4.0.min.js');
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-excel-browser-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_TEST_EMPTY_CATALOG:'1'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c));});});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext({viewport:{width:1024,height:600}});
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  await post(admin,'/api/admin/users',{username:'sales',password:'Changed!2345',fullName:'فروش',position:'فروش',roleCode:'sales',mustChangePassword:false});await post(sales,'/api/login',{username:'sales',password:'Changed!2345'});
  const page=await sales.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.locator('#railToggleBtn').click();await page.locator('#railNav [data-cartable=products]').click();await page.locator('[data-adm=prod-export]').waitFor();
  const book=async rows=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('محصولات');rows.forEach(row=>s.addRow(row));return Buffer.from(await w.xlsx.writeBuffer());};
  const input=page.locator('#admProductExcel'),load=async buf=>input.setInputFiles({name:'products.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buf});
  await load(await book([['wrong','نام محصول'],[1,'مرغ']]));await page.locator('#toast').getByText(/عنوان ستون/).waitFor();
  await load(await book([['کد سریع','نام محصول'],[1,{formula:'1+1',result:2}]]));await page.locator('#toast').getByText(/فرمول/).waitFor();
  await load(await book([['کد سریع','نام محصول'],[1,'مرغ'],['۰۱','تکراری']]));await page.locator('#modal [data-import-confirm]').click();await page.locator('#modal [data-import-error]').getByText(/تکراری/).waitFor();assert.equal((await (await sales.request.get(base+'/api/admin/products')).json()).products.length,0);await page.locator('#modal [data-import-cancel]').click();
  await load(await book([['کد سریع','نام محصول'],[1,'مرغ'],['۰۲','=1+1']]));await page.locator('#modal [data-import-confirm]').click();await page.locator('#modal [data-import-done]').waitFor();assert.match(await page.locator('#modal').innerText(),/۲ محصول جدید/);await page.locator('#modal [data-import-done]').click();
  const products=(await (await sales.request.get(base+'/api/admin/products')).json()).products;assert.deepEqual(products.map(p=>p.quickCode),['01','02']);assert(products.every(p=>p.defaultUnit==='کیلوگرم'));
  await load(await book([['کد سریع','نام محصول'],['01','نام متفاوت'],[3,'ران']]));await page.locator('#modal [data-import-confirm]').click();await page.locator('#modal [data-import-done]').waitFor();assert.match(await page.locator('#modal').innerText(),/نام متفاوت/);await page.locator('#modal [data-import-done]').click();
  const download=page.waitForEvent('download');await page.locator('[data-adm=prod-export]').click();const dl=await download,bytes=await fs.promises.readFile(await dl.path()),exported=new ExcelJS.Workbook();await exported.xlsx.load(bytes);const sheet=exported.worksheets[0];assert.equal(sheet.getCell('A1').value,'کد سریع');assert.equal(sheet.getCell('B1').value,'نام محصول');assert.equal(sheet.getCell('A2').value,'01');assert.equal(sheet.getCell('B2').value,'مرغ');assert.equal(sheet.getCell('B3').value,'=1+1');
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
