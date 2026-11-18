'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const ui=read('public/ui2.js'),app=read('public/app.js');
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fa=v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
function context(){const c={app:{salesDeliveryTab:'assigned'},esc,fa,qty:fa,money:fa,icon:()=>'',dspBadge:v=>esc(v||''),storeAwareOrderName:o=>o?.orderType==='STORE'?(o.storeName||'فروشگاه'):(o?.customer?.name||o?.storeName||'—'),storeAwareOrderPhone:o=>o?.orderType==='STORE'?'':(o?.customer?.phone||'—'),plateViewHtml:esc,formatDateTime24:v=>v||'—',sdEmpty:(i,title,desc)=>esc(title)+' '+esc(desc)};vm.createContext(c);vm.runInContext(ui.slice(ui.indexOf('function renderSalesStoreDeliveryDetails'),ui.indexOf('async function salesViewDeliverySignatureV38')),c);return c;}
test('sales delivery has four separate tabs with a single visible panel and includes store and regular orders',()=>{
 const c=context(),rows=['ASSIGNED','IN_TRANSIT','DELIVERED','SALES_FINALIZED'].map((status,i)=>({id:'o'+i,orderType:i%2?'STORE':'REMOTE',storeName:'شعبه '+i,customer:{name:'مشتری '+i},dispatch:{status,run:i%2?2:null}}));
 const data={assigned:[rows[0]],inTransit:[rows[1]],pending:[rows[2]],finalized:[rows[3]],finalizedTotal:1};
 const html=c.renderSalesDeliveryV38(data);for(const section of ['assigned','inTransit','delivered','history']){assert(html.includes(`data-delivery-tab="${section}"`));assert(html.includes(`data-delivery-section="${section}"`));}assert(html.includes('شعبه 1'));assert(html.includes('شعبه 3'));assert.equal((html.match(/role="tab"/g)||[]).length,4);assert.equal((html.match(/role="tabpanel"/g)||[]).length,4);assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);assert.equal((html.match(/ hidden>/g)||[]).length,3);
 c.app.salesDeliveryTab='history';const history=c.renderSalesDeliveryV38(data);assert.match(history,/data-delivery-tab="history"/);assert.match(history,/aria-selected="true"[^>]*data-delivery-tab="history"/);
});
test('assigned, reported and in-transit cards are safe read-only tracking; labels and Persian order numbers survive',()=>{
 const c=context();for(const status of ['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT']){const o={id:'internal-id',orderNo:'000123',customer:{name:'<img src=x>'},dispatch:{status,driverName:'<script>x</script>',approvedTotalAmount:12345}};
 const html=c.renderSalesDeliveryTrackingV18(o);assert(html.includes('۰۰۰۱۲۳'));assert(html.includes('&lt;img'));assert(!html.includes('<script>'));assert(!html.includes('data-action='));assert.equal(o.orderNo,'000123');}
});
test('only delivered section has finalization; finalized records show read-only stamp and store receipt confirmation',()=>{const c=context(),o={id:'o',orderNo:'000123',dispatch:{status:'DELIVERED',lines:[]}};assert(c.renderSalesDeliveryCardV38(o).includes('sales-finalize-driver-delivery'));const html=c.renderSalesDeliveryCardV38({...o,dispatch:{status:'SALES_FINALIZED'}},true);assert(!html.includes('sales-finalize-driver-delivery'));assert(html.includes('sales-finalized-stamp'));const storeHtml=c.renderSalesDeliveryCardV38({...o,orderType:'STORE',storeName:'فروشگاه الف',customer:{name:'نام مشتری محرمانه',phone:'09129999999'},storeReceiptConfirmedAt:'2026-10-15T10:30:00Z'});assert(storeHtml.includes('فروشگاه الف'));assert(!storeHtml.includes('نام مشتری محرمانه'));assert(!storeHtml.includes('09129999999'));assert(storeHtml.includes('دریافت توسط فروشگاه تأیید شد'));assert(storeHtml.includes('تأیید دریافت فروشگاه'));});
test('delivery endpoint separates all lifecycle states and counts complete history while returning latest 30',async()=>{
 const states=['PENDING_ASSIGN','ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT','DELIVERED','SALES_FINALIZED','CLOSED'];
 const rows=states.map((status,i)=>({id:String(i),updatedAt:'2026-10-14',dispatch:{status}}));for(let i=0;i<35;i++)rows.push({id:'history-'+i,dispatch:{status:'SALES_FINALIZED',salesFinalizedAt:'2026-10-13'}});
 const routes=[];vm.runInNewContext(read('lib/routes/dispatch.js'),{URLSearchParams,require:p=>p==='../http'?{atomicRoute:(method,path,opts,handler)=>routes.push({method,path,opts,handler})}:p==='../store'?{get:()=>({orders:rows})}:{publicOrder:o=>o,dispatchViews:o=>o.dispatch?[{order:o,dispatch:o.dispatch,archived:false}]:[]}}); // v37.6.0 — stub شامل dispatchViews
 const route=routes.find(x=>x.method==='GET'&&x.path==='/api/sales/dispatch-deliveries');assert.deepEqual(Array.from(route.opts.roles),['sales','admin']);const result=(await route.handler()).body;
 assert.deepEqual(Array.from(result.active,x=>x.dispatch.status),['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT']);assert.deepEqual(Array.from(result.assigned,x=>x.dispatch.status),['ASSIGNED','DRIVER_EXIT_REPORTED']);assert.deepEqual(Array.from(result.inTransit,x=>x.dispatch.status),['IN_TRANSIT']);assert.equal(result.pending.length,1);assert.equal(result.finalized.length,30);assert.equal(result.finalizedTotal,37);
 const second=(await route.handler({query:new URLSearchParams('historyOffset=30')})).body;assert.equal(second.finalized.length,7);assert.equal(second.finalizedOffset,30);assert.equal(second.finalizedTotal,37);assert.notEqual(result.finalized[0].id,second.finalized[0].id);
});
test('delivery refresh failure preserves cached records and flags stale state, then clears warning on recovery',async()=>{
 let fail=true;const c={app:{salesCache:{dispatchDeliveries:{active:[{id:'keep'}],pending:[],finalized:[]}},salesFetchPromise:null},api:async p=>{if(p.includes('dispatch-deliveries')){if(fail)throw Error('offline');return{active:[{id:'new'}],pending:[],finalized:[],finalizedTotal:0}}return{}},Date,Promise};
 vm.createContext(c);const helper=app.indexOf('async function fetchPagedList(');vm.runInContext(app.slice(helper,app.indexOf('\n}',helper)+2),c);const start=app.indexOf('async function fetchSalesCache(');vm.runInContext(app.slice(start,app.indexOf('\n}',start)+2),c);
 let result=await c.fetchSalesCache(true);assert.equal(result.dispatchDeliveries.active[0].id,'keep');assert.equal(result.dispatchDeliveries.error,true);assert(context().renderSalesDeliveryV38(result.dispatchDeliveries).includes('role="alert"'));
 fail=false;result=await c.fetchSalesCache(true);assert.equal(result.dispatchDeliveries.active[0].id,'new');assert.equal(result.dispatchDeliveries.error,false);
});
test('ردیف و جزئیات گردش جدید عدم تحویل را صریح نشان می‌دهد و دکمه پایان جعلی ندارد',()=>{
 const c=context();c.app.features={experimentalTransport:true};
 const o={id:'x',orderNo:'123',status:'SETTLEMENT_PENDING',customer:{name:'<script>'},transportService:{section:'delivered',label:'مدارک برگشت؛ تحویل‌نشده',outcome:'NOT_DELIVERED',driverName:'<script>',run:0,lines:[{productName:'<img>',deliveredKg:2}]}};
 const row=c.salesDeliverySummaryRow(o),details=c.transportSalesDetailsHtml(o);assert(row.includes('تحویل‌نشده'));assert(!row.includes('<script>'));assert(details.includes('به مشتری تحویل نشده'));assert(details.includes('&lt;img&gt;'));assert(details.includes('transport-sales-work'));assert(!details.includes('sales-finalize-driver-delivery'));
 const html=c.renderSalesDeliveryV38({pending:[o]});assert(html.includes('تحویل شده / بازگشت'));assert(!html.includes('data-action="sales-finalize-driver-delivery"'));
 c.app.features.experimentalTransport=false;assert(c.transportSalesDetailsHtml(o).includes('فقط برای مشاهده'));assert(!c.transportSalesDetailsHtml(o).includes('transport-sales-work'));
});

test('ردیف پخش برای سفارش عادی و هر سرویس فروشگاه ساختار یکسان و جزئیات مستقل دارد',()=>{
 const c=context();const inputs=[{id:'regular',orderNo:'100',orderType:'REMOTE',customer:{name:'مشتری عادی'},transportService:{run:0,label:'در مسیر',driverName:'راننده عادی',lines:[]}},...[1,2].map(run=>({id:'store',orderNo:'200',orderType:'STORE',storeName:'فروشگاه نمونه',customer:{name:'نام مشتری'},transportService:{run,label:'در انتظار تخصیص',driverName:'راننده فروشگاه',lines:[]}})),{id:'legacy',orderNo:'300',orderType:'REMOTE',customer:{name:'مشتری قدیمی'},dispatch:{status:'ASSIGNED',driverName:'راننده قدیمی'}}];
 for(const o of inputs){const html=c.salesDeliverySummaryRow(o);assert.match(html,/sales-delivery-summary-row/);assert.equal((html.match(/<td>/g)||[]).length,8);assert.match(html,/^<tr/);assert.match(html,/جزئیات سفارش/);assert(html.includes(`data-id="${o.id}"`));assert(html.includes(`data-run="${o.transportService?.run??o.dispatch?.run??0}"`));}
 assert.match(c.salesDeliverySummaryRow(inputs[1]),/سرویس اول/);assert.match(c.salesDeliverySummaryRow(inputs[2]),/سرویس دوم/);assert.match(c.salesDeliverySummaryRow(inputs[1]),/مشتری: نام مشتری/);
 const css=read('public/compatibility.css');assert.match(css,/sales-distribution-cell\+\.sales-distribution-cell\{border-inline-start:1px solid/);assert.match(css,/sales-delivery-panel \.sales-delivery-column-list\{[^}]*overflow-x:auto/);
});
test('در ناوبری فروش پخش جای نام قبلی را گرفته؛ منابع از انبار حذف و منوی ترابری حفظ است',()=>{
 const nav=app.slice(app.indexOf('function renderNav(){'));const sales=nav.match(/    sales:\[.*?\],\n    warehouse:/s)?.[0]||'';assert.match(sales,/\['delivery','پخش','truck',null\]/);assert.doesNotMatch(sales,/transport-resources|تحویل راننده/);
 const warehouse=nav.match(/    warehouse:\[.*?\],\n    dispatch:/s)?.[0]||'';const dispatch=nav.match(/    dispatch:\[.*?\],\n    store:/s)?.[0]||'';assert.doesNotMatch(warehouse,/transport-resources/);assert.match(warehouse,/document-edits/);assert.match(dispatch,/transport-resources/);assert.match(app,/delivery:\['پخش'/);
});
