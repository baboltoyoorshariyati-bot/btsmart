'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('مرورگر: ردیف سفارش در کارتابل‌ها و همه عرض‌ها هم‌فرمت و هم‌ارتفاع است',{skip:!process.env.BT_CHROMIUM_PATH,timeout:120000},async()=>{
 const {chromium}=require('playwright-core'),port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-unified-')),base=`http://127.0.0.1:${port}`,proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve()}});proc.once('exit',c=>reject(Error('exit '+c)))});
  browser=await chromium.launch({executablePath:process.env.BT_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await browser.newContext(),post=async(u,data)=>{const r=await ctx.request.post(base+u,{data});assert(r.ok(),u+' '+await r.text());return r.json()};
  await post('/api/login',{username:'admin',password:'Initial!2345'});await post('/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/',{waitUntil:'networkidle'});
  const now=new Date(),day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const real=(await post('/api/orders/remote',{name:'مشتری واقعی آزمون',phone:'09121112234',dispatchPlace:'بابل',scheduledDate:day,scheduledAt:day+'T00:00',transportWorkflow:true,deliveryMode:'DELIVERY',items:[{productId:'p01',requestedQty:4,requestedUnit:'کیلوگرم'}]})).order;
  await page.evaluate(()=>go('sales','flow'));const realRow=page.locator(`.sd-flow-list [data-order="${real.id}"]`);await realRow.waitFor();await realRow.locator('[data-action=order-details]').click();await page.locator('#modal.open .v21-detail-modal').waitFor();assert.match(await page.locator('#modal').innerText(),/مشتری واقعی آزمون/);await page.evaluate(()=>closeModal());
  const kinds=['remote','flow','future','settlement','sales-store','warehouse','warehouse-store-incoming','warehouse-store-preparing','delivery','transport','store-registered','store-delivery','store-delivered','gate','gate-dispatch','legacy-dispatch','sales-history','warehouse-document','store-document','warehouse-history','invoice'];
  let step='start';
  const waitFor=async(locator,label,opts)=>{ try{ return await locator.waitFor({timeout:20000,...opts}); }catch(e){ throw new Error(`STEP ${label} | ${String(e.message).split('\n')[0]}`); } };
  for(const kind of kinds){
   await page.evaluate(kind=>{
    if(app.timer)clearInterval(app.timer);if(app.wh38?.timer)clearInterval(app.wh38.timer);
    const o={id:'example',orderNo:'000123',orderType:'REMOTE',status:'WAREHOUSE_PREPARING',createdAt:'2026-11-01T08:30:00Z',updatedAt:'2026-11-01T09:00:00Z',scheduledDate:'2026-11-05',scheduledAt:'2026-11-05T08:00:00Z',dispatchPlace:'مقصد با نام طولانی برای آزمایش پیمایش',customer:{name:'مشتری آزمایشی با نام بسیار طولانی برای کنترل چیدمان کامل ردیف سفارش',phone:'09121112222'},items:[{id:'i1',product:{name:'محصول نمونه'},requestedQty:5,requestedUnit:'کیلوگرم'}],payment:{invoiceNumber:'000321',totalAmount:1000,verifiedAt:'2026-11-01T10:00:00Z'}};
    const store={...o,orderType:'STORE',storeName:'فروشگاه شعبه 1 حمزه کلا',status:'STORE_PENDING_SALES'},el=document.querySelector('#content');let html='';
    document.querySelector('#appView').dataset.cartablePage=kind.startsWith('warehouse')?'warehouse':kind==='gate'?'gate':kind.startsWith('store')?'store':kind==='transport'?'drivers':'sales';
    const wrap=x=>`<div class="order-compact-scroll">${x}</div>`;
    if(kind==='remote')html=`<div class="phone-queue-list-v40">${remotePhoneQueueRowsV40([o]).html}</div>`;
    if(kind==='flow')html=`<div class="sd-flow-list">${sdFlowCard(o,0)}</div>`;
    if(kind==='future')html=`<div class="fx-list-grid">${futureOrderRowsV25([o])}</div>`;
    if(kind==='settlement')html=`<aside class="stl-queue-panel" style="width:min(330px,100%)"><div class="stl-queue-list">${settlementPendingRowsV27([{...o,status:'SETTLEMENT_PENDING'}])}</div></aside>`;
    if(kind==='sales-store'){app.salesStoreTab='incoming';html=renderSalesStoresV41([store],{});}
    if(kind==='warehouse')html=wh38List([o],'incoming');
    if(kind==='warehouse-store-incoming')html=`<div class="wh38-store-pane">${wh38StoreList([store],'incoming')}</div>`;
    if(kind==='warehouse-store-preparing')html=`<div class="wh38-store-pane">${wh38StoreList([{...store,status:'WAREHOUSE_PREPARING'}],'preparing')}</div>`;
    if(kind==='delivery')html='<div class="table-wrap"><table class="table sales-distribution-table"><tbody>'+salesDeliverySummaryRow({...o,transportService:{label:'در مسیر',run:0,driverName:'راننده نمونه',lines:[]}})+'</tbody></table></div>';
    if(kind==='transport')html=wrap(transportPlanRows([{...o,customerName:o.customer.name,services:[{run:0,assignment:{driverName:'راننده نمونه',vehicleType:'وانت',vehiclePlate:'12ب34567'},departed:true}]}]));
    if(kind==='store-registered')html=wrap(stRegisteredRow(store));
    if(kind==='store-delivery')html=wrap(st38Row({...store,dispatch:{run:1,status:'IN_TRANSIT',lines:[]}}));
    if(kind==='store-delivered')html=wrap(st38DeliveredRow({...store,dispatch:{run:2,status:'DELIVERED',lines:[]}}));
    if(kind==='gate')html=renderGateExit([{...o,status:'SETTLED'}]);
    if(kind==='gate-dispatch')html=wrap(gateDispatchCard({...o,dispatch:{status:'DRIVER_EXIT_REPORTED',driverName:'راننده نمونه',driverPlate:'12ب34567'}},'exit'));
    if(kind==='legacy-dispatch')html=wrap(dspDispatchCard({...o,dispatch:{status:'ASSIGNED',driverName:'راننده نمونه'}}));
    if(kind==='sales-history')html=`<div class="sales-history-list">${salesHistoryRow({...o,customerName:o.customer.name,phone:o.customer.phone,invoiceCount:1})}</div>`;
    if(kind==='warehouse-document')html=wrap(whDeliveredRow({...o,customerName:o.customer.name,itemCount:2,deliveredKg:20,completedAt:o.createdAt,warehouseDocumentNo:'W-100'}));
    if(kind==='store-document')html=wrap(whStoreDocumentRow({...o,orderId:o.id,storeName:'فروشگاه',itemCount:2,driverName:'راننده',run:1,warehouseDocumentNo:'W-100'}));
    if(kind==='warehouse-history')html=whhBody({from:'2026-10-28',to:'2026-10-28',summary:{orders:1},returns:[],rows:[{...o,day:'2026-10-28',customerName:o.customer.name,customerPhone:o.customer.phone,itemCount:2,deliveredKg:20,completedAt:o.createdAt,completedBy:'کاربر انبار',outOfStock:0,items:[]}]});
    if(kind==='invoice')html=`<div class="sd-invoice-list">${invoiceRowsV27([{...o,status:'SETTLED'}])}</div>`;
    el.innerHTML=html;
   },kind);
   if(kind==='delivery'){for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});const row=page.locator('.sales-distribution-table tr');await row.waitFor();assert.equal(await row.locator('td').count(),8);assert.equal(await row.evaluate(e=>getComputedStyle(e).display),'table-row');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}continue;}
   if(kind==='invoice'){for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});const table=page.locator('.settlement-invoice-table');await table.waitFor();assert.equal(await table.locator('th').count(),7);assert(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1));}continue;}
   if(kind==='warehouse-store-incoming'||kind==='warehouse-store-preparing'){
    const table=page.locator('#content .wh38-store-table'),row=table.locator('tbody tr[data-store-order]').first();await waitFor(row,`store-row ${kind}`);
    for(const width of [1280,768,390,320]){
     await page.setViewportSize({width,height:900});
     const layout=await row.evaluate(el=>{const r=el.getBoundingClientRect();return{display:getComputedStyle(el).display,left:r.left,right:r.right,cells:[...el.children].map(x=>x.getBoundingClientRect().toJSON()),scroll:document.documentElement.scrollWidth,viewport:innerWidth};});
     assert.equal(layout.cells.length,8,`${kind}/${width} cells`);assert.equal(layout.display,width<=900?'grid':'table-row',`${kind}/${width} row display`);
     assert(layout.cells.every(c=>c.left>=layout.left-1&&c.right<=layout.right+1),`${kind}/${width} cells outside row ${JSON.stringify(layout)}`);
     assert(layout.scroll<=layout.viewport+1,`${kind}/${width} page overflow ${JSON.stringify(layout)}`);
     const action=kind==='warehouse-store-incoming'?'wh38-store-details':'wh38-start',button=row.locator(`[data-action=${action}]`);await button.scrollIntoViewIfNeeded();assert.equal(await button.isVisible(),true,`${kind}/${width} action`);
     assert.equal(await button.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.left>=-1&&r.right<=innerWidth+1&&!!hit&&(hit===e||e.contains(hit));}),true,`${kind}/${width} action hit target`);
    }
    continue;
   }
   if(kind==='warehouse'){
    const table=page.locator('#content .bt-table');await waitFor(table,'warehouse-table');
    assert.equal(await table.locator('thead th').count(),5,'ستون‌های جدول انبار');
    assert.deepEqual(await table.locator('thead th').allInnerTexts(),['شماره سفارش','نام مشتری','تاریخ سفارش','تاریخ تحویل','عملیات']);
    for(const width of [1280,768,390,320]){
     await page.setViewportSize({width,height:900});
     const row=table.locator('tbody tr').first();await waitFor(row,`warehouse-row ${width}`);
     assert.equal(await row.locator('td').count(),5,`warehouse/${width} cells`);
     assert.equal(await row.evaluate(e=>getComputedStyle(e).display),width<=900?'block':'table-row',`warehouse/${width} row display`);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`warehouse/${width} page overflow`);
     const btn=row.locator('[data-action=wh38-order-details]');await btn.scrollIntoViewIfNeeded();assert.equal(await btn.isVisible(),true,`warehouse/${width} action`);
     assert.equal(await row.locator('.bt-actions [data-action=wh38-order-details]').count(),1,'دکمهٔ جزئیات در ستون عملیات');
    }
    continue;
   }
   for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:900});
    const row=page.locator('#content .order-summary-row:visible,#content .sales-delivery-summary-row:visible,#content .stl-queue-item:visible,#content .gt-exit-card:visible').first();await waitFor(row,`generic-row ${kind}/${width}`);
    const g=await row.evaluate(el=>{const r=el.getBoundingClientRect(),cells=[...el.children].filter(x=>x.matches('.order-summary-cell,.sales-distribution-cell')),buttons=[...el.querySelectorAll('.order-summary-actions .btn,.sales-distribution-actions .btn')].filter(x=>x.offsetParent!==null);return {height:r.height,cells:cells.map(x=>({h:x.getBoundingClientRect().height,cy:x.getBoundingClientRect().top+x.getBoundingClientRect().height/2,top:x.getBoundingClientRect().top,bottom:x.getBoundingClientRect().bottom})),buttons:buttons.map(x=>({h:x.getBoundingClientRect().height,top:x.getBoundingClientRect().top,bottom:x.getBoundingClientRect().bottom})),top:r.top,bottom:r.bottom,scroll:document.documentElement.scrollWidth,viewport:innerWidth};});
    if(kind==='settlement'){const q=await row.evaluate(el=>({row:el.getBoundingClientRect().width,content:el.scrollWidth,list:el.parentElement.clientWidth-parseFloat(getComputedStyle(el.parentElement).paddingLeft)-parseFloat(getComputedStyle(el.parentElement).paddingRight),scroll:el.parentElement.scrollWidth,client:el.parentElement.clientWidth,title:el.title,aria:el.getAttribute('aria-label')}));assert(q.scroll<=q.client+1,JSON.stringify(q));assert(q.row<=q.list+1,`کارت از فهرست پهن‌تر است ${JSON.stringify(q)}`);assert(q.row<=q.content+2,`عرض کارت به اندازهٔ متن نیست ${JSON.stringify(q)}`);assert.match(q.title,/مشتری آزمایشی با نام بسیار طولانی/);assert.equal(q.aria,q.title);}
    if(kind==='gate'){const q=await row.evaluate(el=>({row:el.scrollWidth,client:el.clientWidth,list:el.parentElement.scrollWidth,listClient:el.parentElement.clientWidth}));assert(q.row<=q.client+1&&q.list<=q.listClient+1,JSON.stringify(q));continue;}
    assert(Math.abs(g.height-54)<1,`${kind}/${width} row ${JSON.stringify(g)}`);for(const c of g.cells){assert(Math.abs(c.h-38)<1,`${kind}/${width} cell ${JSON.stringify(g)}`);assert(c.top>=g.top-1&&c.bottom<=g.bottom+1,`${kind}/${width} bounds ${JSON.stringify(g)}`);}for(const b of g.buttons){assert(Math.abs(b.h-36)<1,`${kind}/${width} button ${JSON.stringify(g)}`);assert(b.top>=g.top-1&&b.bottom<=g.bottom+1,`${kind}/${width} bounds ${JSON.stringify(g)}`);}assert(g.scroll<=g.viewport+1,`${kind}/${width} page overflow ${JSON.stringify(g)}`);
   }
  }
  for(const width of [1280,768,390,320])for(const kind of ['phone','future','store','onsite']){
   await page.setViewportSize({width,height:900});
   await page.evaluate(kind=>{const root=document.querySelector('#content');const line={productId:'p01',productLabel:'محصول آزمایشی',requestedQty:2,requestedUnit:'کیلوگرم',description:'توضیح'};if(kind==='onsite'){root.innerHTML='<div id="orderLines"></div>';app.orderDraft=[line];renderOrderLines();}else root.innerHTML=`<div id="${kind}-lines">${renderProductPickerLine(line,0,kind)}</div>`;},kind);
   const h=await page.locator('.sd-line-cell > .input-shell').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert.equal(h.length,4,`${kind} controls`);assert.ok(h.every(n=>Math.abs(n-44)<1),`${kind} ${width}: ${h}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${kind} page overflow ${width}`);
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true})}
});
