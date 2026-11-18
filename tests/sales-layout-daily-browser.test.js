'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('مرورگر: چیدمان نگهبانی و فرم‌های فروش در عرض‌های مختلف',{skip:!executablePath,timeout:90000},async()=>{
 const {chromium}=require('playwright-core');const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-sales-layout-')),base=`http://127.0.0.1:${port}`;let browser;const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'};delete env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exit '+c)));});
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const admin=await browser.newContext(),gate=await browser.newContext({viewport:{width:1280,height:900}}),sales=await browser.newContext({viewport:{width:1280,height:900}});const post=async(c,url,data)=>{const r=await c.request.post(base+url,{data});assert(r.ok(),url+' '+r.status()+' '+await r.text());return r.json();};
  await post(admin,'/api/login',{username:'admin',password:'Initial!2345'});await post(admin,'/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});for(const [username,roleCode] of [['gate1','gate'],['sales1','sales']])await post(admin,'/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false});await post(gate,'/api/login',{username:'gate1',password:'Changed!2345'});await post(sales,'/api/login',{username:'sales1',password:'Changed!2345'});
  const g=await gate.newPage(),p=await sales.newPage(),errors=[];for(const page of [g,p])page.on('pageerror',e=>errors.push(e.message));await g.goto(base+'/');await g.locator('#railNav [data-cartable=entry]').click();await g.locator('#gatePurpose').waitFor();
  for(const width of [1600,1280,768]){await g.setViewportSize({width,height:900});const b=await Promise.all(['#gateVehicleType','#gateCarType','#gatePurpose'].map(s=>g.locator(s).boundingBox()));assert(b.every(x=>Math.abs(x.y-b[0].y)<2),`gate row ${width}: ${JSON.stringify(b)}`);assert.equal(await g.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
  await p.goto(base+'/');await p.locator('#railNav [data-cartable=onsite]').click();await p.locator('#salesSearchV25').waitFor();const style=await p.locator('#salesSearchV25').evaluate(el=>({border:getComputedStyle(el).borderTopWidth,shadow:getComputedStyle(el).boxShadow,background:getComputedStyle(el).backgroundColor}));assert.equal(style.border,'0px');assert.equal(style.shadow,'none');assert.equal(style.background,'rgba(0, 0, 0, 0)');
  await p.locator('#railNav [data-cartable=remote]').click();await p.locator('#phoneOrderFormV25').waitFor();await p.evaluate(()=>document.fonts.ready);assert.equal((await p.locator('.phone-form-title').innerText()).trim(),'ثبت سفارش غیرحضوری');await p.locator('#delivery-mode-phone').selectOption('DELIVERY');
  for(const width of [1600,1280,768,390,320]){await p.setViewportSize({width,height:900});const b=await p.evaluate(()=>['#phoneOrderFormV25 [name=name]','#phoneOrderFormV25 [name=phone]','#phoneDispatchPlace','#delivery-mode-phone'].map(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));assert(b.every(Boolean));if(width>=1280)assert(b.every(x=>Math.abs(x.y-b[0].y)<2),`remote row ${width}: ${JSON.stringify(b)}`);assert(b.every(x=>Math.abs(x.height-b[0].height)<2),`height ${width}: ${JSON.stringify(b)}`);const title=await p.locator('.phone-form-title').boundingBox();assert(title.y+title.height<=Math.min(...b.map(x=>x.y)),`title overlaps fields ${width}`);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`overflow ${width}`);}
  await p.setViewportSize({width:1280,height:900});await p.locator('#delivery-mode-phone').selectOption('PICKUP');const pickupModeBox=await p.locator('#delivery-mode-phone').boundingBox();await p.locator('#delivery-mode-phone').selectOption('DELIVERY');const deliveryModeBox=await p.locator('#delivery-mode-phone').boundingBox(),placeBox=await p.locator('#phoneDispatchPlace').boundingBox();assert(Math.abs(pickupModeBox.x-deliveryModeBox.x)<2&&Math.abs(pickupModeBox.y-deliveryModeBox.y)<2);assert(deliveryModeBox.x>placeBox.x,'RTL delivery mode precedes destination');assert.equal(await p.locator('#delivery-mode-phone').inputValue(),'DELIVERY');
  await p.locator('#railNav [data-cartable=future]').click();await p.locator('#futureOrderFormV25').waitFor();await p.locator('#delivery-mode-future').selectOption('DELIVERY');const {a,d}=await p.evaluate(()=>{const a=document.querySelector('#futureDispatchPlace').getBoundingClientRect(),d=document.querySelector('#delivery-mode-future').getBoundingClientRect();return {a:{y:a.y,height:a.height},d:{y:d.y,height:d.height}};});assert(Math.abs(a.y-d.y)<2,`future address and delivery row ${JSON.stringify({a,d})}`);assert(Math.abs(a.height-d.height)<2);await p.locator('#delivery-mode-future').selectOption('PICKUP');assert.equal(await p.locator('#delivery-mode-future').inputValue(),'PICKUP');
  for(const tab of ['flow','settlement']){await p.locator(`#railNav [data-cartable=${tab}]`).click();await p.locator(`#sales-v29-pane-${tab}:not([hidden]) .sd-pane`).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
  // Settlement invoices stay tabular on desktop and become labeled, non-scrolling cards on phones.
  await p.evaluate(()=>{const o={id:'table-test',orderNo:'000123',status:'SETTLED',customer:{name:'نام مشتری بسیار طولانی '.repeat(8),phone:'09121112233'},payment:{invoiceNumber:'000987',totalAmount:123456789,verifiedAt:new Date().toISOString()},items:[]};document.querySelector('#content').innerHTML=renderSalesSettlementV25([o]);});
  for(const width of [1600,1280,768,390,320]){
   await p.setViewportSize({width,height:900});
   const metrics=await p.locator('.settlement-invoice-table').evaluate(e=>({headers:[...e.querySelectorAll('th')].map(x=>x.textContent),scroll:e.scrollWidth,client:e.clientWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.deepEqual(metrics.headers.slice(0,3),['نام مشتری','شماره تماس','شماره سفارش']);
   assert(metrics.scroll<=metrics.client+1&&metrics.page<=metrics.viewport+1,JSON.stringify(metrics));
   const firstCell=await p.locator('.settlement-invoice-table tbody tr td').first().evaluate(e=>({size:parseFloat(getComputedStyle(e).fontSize),weight:Number(getComputedStyle(e).fontWeight),align:getComputedStyle(e).textAlign}));
   assert(firstCell.size>=14&&firstCell.weight>=700,JSON.stringify(firstCell));
   if(width<=600){
    assert.equal(firstCell.align,'right',JSON.stringify(firstCell));
    const card=await p.locator('.settlement-invoice-table tbody tr').evaluate(row=>{
     const cells=[...row.cells],toolbar=row.querySelector('.toolbar'),buttons=[...toolbar.querySelectorAll('.btn')],status=cells[5],badge=status.querySelector('.badge'),date=status.querySelector('small');
     return{
      tableDisplay:getComputedStyle(row.closest('table')).display,
      rowDisplay:getComputedStyle(row).display,
      labels:cells.map(cell=>cell.dataset.label),
      labelContent:cells.map(cell=>getComputedStyle(cell,'::before').content),
      customerWidth:cells[0].getBoundingClientRect().width,
      customerWrap:getComputedStyle(cells[0]).overflowWrap,
      operationsWidth:cells[6].getBoundingClientRect().width,
      tableWidth:row.closest('table').clientWidth,
      toolbarDisplay:getComputedStyle(toolbar).display,
      toolbarColumns:getComputedStyle(toolbar).gridTemplateColumns.split(' ').length,
      toolbarScroll:toolbar.scrollWidth,
      toolbarClient:toolbar.clientWidth,
      buttons:buttons.map(button=>({text:button.innerText,whiteSpace:getComputedStyle(button).whiteSpace,scroll:button.scrollWidth,client:button.clientWidth})),
      badgeWidth:badge.getBoundingClientRect().width,
      dateWidth:date.getBoundingClientRect().width,
     };
    });
    const labels=['نام مشتری','شماره تماس','شماره سفارش','شماره فاکتور','مبلغ / نوع سند','وضعیت و تاریخ','عملیات'];
    assert.equal(card.tableDisplay,'block',JSON.stringify(card));assert.equal(card.rowDisplay,'grid',JSON.stringify(card));
    assert.deepEqual(card.labels,labels);assert(card.labelContent.every((content,index)=>content.includes(labels[index])),JSON.stringify(card));
    assert(card.customerWidth>=100&&card.customerWrap==='break-word',JSON.stringify(card));
    assert(card.operationsWidth>card.tableWidth*.9,JSON.stringify(card));
    assert.equal(card.toolbarDisplay,'grid');assert.equal(card.toolbarColumns,2,JSON.stringify(card));
    assert(card.toolbarScroll<=card.toolbarClient+1,JSON.stringify(card));
    assert(card.buttons.every(button=>button.whiteSpace==='nowrap'&&button.scroll<=button.client+1),JSON.stringify(card));
    assert(card.badgeWidth>0&&card.dateWidth>0,JSON.stringify(card));
    continue;
   }
   assert.equal(firstCell.align,'center',JSON.stringify(firstCell));
   const statusDate=await p.locator('.settlement-invoice-table tbody tr td:nth-child(6)').evaluate(td=>{
    const badge=td.querySelector('.badge').getBoundingClientRect(),date=td.querySelector('small').getBoundingClientRect();
    return{badge:badge.toJSON(),date:date.toJSON(),badgeDisplay:getComputedStyle(td.querySelector('.badge')).display,dateDisplay:getComputedStyle(td.querySelector('small')).display,statusWidth:td.getBoundingClientRect().width,operationWidth:td.parentElement.children[6].getBoundingClientRect().width,tableWidth:td.closest('table').clientWidth};
   });
   assert(statusDate.badge.top<statusDate.date.bottom&&statusDate.badge.bottom>statusDate.date.top,`status/date share one line ${JSON.stringify(statusDate)}`);
   assert.equal(statusDate.badgeDisplay,'inline-flex');assert.equal(statusDate.dateDisplay,'inline-block');
   assert(statusDate.operationWidth>statusDate.tableWidth*.23&&statusDate.operationWidth<statusDate.tableWidth*.27,`operations column expanded ${JSON.stringify(statusDate)}`);
   assert(statusDate.statusWidth<(width<=900 ? .31 : .26)*statusDate.tableWidth,`status column compacted ${JSON.stringify(statusDate)}`);
   const ops=await p.locator('.settlement-invoice-table .toolbar').evaluate(e=>({display:getComputedStyle(e).display,wrap:getComputedStyle(e).flexWrap,buttons:[...e.children].map(b=>({text:b.innerText,whiteSpace:getComputedStyle(b).whiteSpace,scroll:b.scrollWidth,client:b.clientWidth})),scroll:e.scrollWidth,client:e.clientWidth}));
   assert(ops.buttons.length>=2,JSON.stringify({width,ops}));assert(ops.buttons.every(b=>b.whiteSpace==='nowrap'),JSON.stringify({width,ops}));
   assert.equal(ops.display,'grid');assert(ops.buttons.every(b=>b.scroll<=b.client+1),JSON.stringify({width,ops}));assert(ops.scroll<=ops.client+1,JSON.stringify({width,ops}));
  }
  assert.deepEqual(errors,[]);await admin.close();await gate.close();await sales.close();
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
