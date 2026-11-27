'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const exe=process.env.BT_CHROMIUM_PATH;
test('store subtabs stay in one usable row in sales and warehouse',{skip:!exe,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-store-tabs-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),sales=await browser.newContext(),warehouse=await browser.newContext();
  const post=async(ctx,url,data)=>{const r=await ctx.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  for(const [username,roleCode] of [['sale','sales'],['wh-user','warehouse']])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false});
  await post(sales,'/api/login',{username:'sale',password:'Changed!2345'});await post(warehouse,'/api/login',{username:'wh-user',password:'Changed!2345'});
  const errors=[];
  for(const [context,role,navSelector,buttonSelector,expected] of [[sales,'sales','.sales-store-tabs-v43','[data-store-subtab]',5],[warehouse,'warehouse','.wh38-store-tabs','[data-wh38-store-tab]',4]]){
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});
   await page.evaluate(role=>go(role,'stores'),role);const nav=page.locator(navSelector);await nav.waitFor();
   for(const width of [320,390,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    const geometry=await nav.evaluate((el,selector)=>{
     const rect=el.getBoundingClientRect();const buttons=[...el.querySelectorAll(selector)].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,client:b.clientWidth,scroll:b.scrollWidth,clientHeight:b.clientHeight,scrollHeight:b.scrollHeight,text:b.innerText,children:[...b.children].map(x=>{const d=x.getBoundingClientRect();return {left:d.left,right:d.right,top:d.top,bottom:d.bottom};})};});
     return {rect:rect.toJSON(),buttons,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    },buttonSelector);
    assert.equal(geometry.buttons.length,expected,`${role} ${width} tab count`);
    assert(geometry.pageWidth<=geometry.viewport+1,`${role} ${width} page overflow ${JSON.stringify(geometry)}`);
    assert(geometry.buttons.every(b=>Math.abs(b.y-geometry.buttons[0].y)<1),`${role} ${width} wrapped tabs ${JSON.stringify(geometry)}`);
    for(const b of geometry.buttons){
     assert(b.width>=44&&b.height>=44,`${role} ${width} small tap target ${JSON.stringify(b)}`);
     assert(b.x>=geometry.rect.x-1&&b.right<=geometry.rect.right+1&&b.bottom<=geometry.rect.bottom+1,`${role} ${width} tab outside navigation ${JSON.stringify(b)}`);
     assert(b.scroll<=b.client+1&&b.scrollHeight<=b.clientHeight+1,`${role} ${width} clipped label ${JSON.stringify(b)}`);
     assert(b.children.every(c=>c.left>=b.x-1&&c.right<=b.right+1&&c.top>=b.y-1&&c.bottom<=b.bottom+1),`${role} ${width} contents outside tab ${JSON.stringify(b)}`);
    }
   }
   await page.setViewportSize({width:1440,height:900});
   const tabs=role==='sales'?['incoming','processing','approved','history','transfers']:['incoming','preparing','history','transfers'];
   for(const id of tabs){const button=page.locator(role==='sales'?`[data-store-subtab="${id}"]`:`[data-wh38-store-tab="${id}"]`);await button.click();await page.locator((role==='sales'?`[data-store-subtab="${id}"]`:`[data-wh38-store-tab="${id}"]`)+'[aria-selected="true"]').waitFor();}
   await page.close();
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
