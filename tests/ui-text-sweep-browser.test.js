'use strict';
// Text integrity/geometry sweep complements populated workflow and print tests.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startIsolated}=require('../lib/isolated-server'),{seedDatabase}=require('../lib/synthetic-fixture');
const exe=process.env.BT_CHROMIUM_PATH;
test('RTL text integrity and viewport fit across the login page, cartables and screen sizes',{skip:!exe,timeout:120000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-text-sweep-'));let server,browser;
 try{
  const password='Synthetic!Audit2026',database=seedDatabase({dataDir:root,orders:20,password});
  server=await startIsolated({dataDir:root,database,env:{ADMIN_INITIAL_PASSWORD:password}});
  browser=await require('playwright-core').chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
  const anonymous=await browser.newContext(),login=await anonymous.newPage();await login.goto(server.base,{waitUntil:'networkidle'});
  for(const width of [320,390,640,800,1024,1440,1920]){
   await login.setViewportSize({width,height:800});
   const fit=await login.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,body:document.body.scrollWidth,card:document.querySelector('.login-card').getBoundingClientRect().toJSON()}));
   assert.ok(fit.page<=width+1&&fit.body<=width+1,`login horizontal overflow at ${width}: ${JSON.stringify(fit)}`);
   assert.ok(fit.card.left>=-1&&fit.card.right<=width+1,`login card outside viewport at ${width}`);
  }
  await anonymous.close();
  const context=await browser.newContext();const response=await context.request.post(server.base+'/api/login',{data:{username:'admin',password}});assert.ok(response.ok());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.base,{waitUntil:'networkidle'});
  const views=[['dashboard'],['users'],['customers'],['products'],['drivers'],['activity'],['backups'],['reports'],['gate','entry'],['gate','waiting'],['gate','exit'],['sales','remote'],['sales','future'],['sales','flow'],['sales','stores'],['warehouse','incoming'],['warehouse','preparing'],['warehouse','history'],['returns'],['transport-resources'],['store','create']];
  for(const width of [320,360,390,600,640,641,768,800,1024,1025,1152,1280,1366,1440,1920,2560]){
   await page.setViewportSize({width,height:900});
   for(const view of views){
    await page.evaluate(async v=>{await go(...v);if(app.salesFetchPromise)await app.salesFetchPromise;clearInterval(app.timer);app.timer=null;},view);
    await page.waitForTimeout(80);
    const result=await page.evaluate(()=>{
     const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
     const ids=[...document.querySelectorAll('[id]')].filter(visible).map(e=>e.id);
     const buttons=[...document.querySelectorAll('main button')].filter(visible);
     const bad=buttons.filter(e=>!((e.innerText||'').trim()||e.getAttribute('aria-label')||e.getAttribute('title'))).map(e=>e.outerHTML.slice(0,250));
     const header=document.querySelector('#appView:not(.hidden) .workspace-header')?.getBoundingClientRect();
     return {rtl:document.documentElement.dir,overflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:document.body.scrollWidth-innerWidth,header:header?{left:header.left,right:header.right}:null,duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i),bad,text:document.querySelector('main')?.innerText||''};
    });
    const tag=`${view.join('/')} @ ${width}`;
    assert.equal(result.rtl,'rtl',tag);assert.ok(result.overflow<=1,`${tag} page overflow: ${result.overflow}`);assert.ok(result.bodyOverflow<=1,`${tag} body overflow: ${result.bodyOverflow}`);if(result.header)assert.ok(result.header.left>=-1&&result.header.right<=width+1,`${tag} header outside viewport: ${JSON.stringify(result.header)}`);assert.deepEqual(result.duplicates,[],`${tag} duplicate visible IDs`);assert.deepEqual(result.bad,[],`${tag} unnamed actions`);
    assert.doesNotMatch(result.text,/\[object Object\]|\bundefined\b|\bNaN\b|\uFFFD/,`${tag} corrupted or unformatted text`);
    if(process.env.BT_UI_AUDIT_DIR&&[320,1440].includes(width)&&['dashboard','reports','remote'].includes(view.at(-1))){fs.mkdirSync(process.env.BT_UI_AUDIT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BT_UI_AUDIT_DIR,view.join('-')+'-'+width+'.png'),fullPage:true});}
   }
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(server)await server.stop();fs.rmSync(root,{recursive:true,force:true});}
});
