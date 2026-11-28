'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync('lib/routes/core.js','utf8'),app=fs.readFileSync('public/app.js','utf8');
test('تسویه فروش همان سفارش‌های قابل نمایش را می‌شمارد و اعلان تخصیص به صف فعلی می‌رود',async()=>{
 const editOrder={id:'6',orderType:'REMOTE',status:'CLOSED',documentEdits:[{status:'PENDING_WAREHOUSE'}]};
 const orders=[{id:'1',orderType:'REMOTE',status:'SETTLEMENT_PENDING'},{id:'2',orderType:'ONSITE',status:'SETTLEMENT_PENDING',dispatch:{status:'ASSIGNED'}},{id:'3',orderType:'STORE',status:'SETTLEMENT_PENDING'},{id:'4',orderType:'REMOTE',status:'SETTLEMENT_PENDING',dispatch:{status:'DELIVERED'}},{id:'5',orderType:'REMOTE',status:'WAREHOUSE_PREPARING'},editOrder];
 const c={process:{env:{}},store:{get:()=>({orders,visits:[],notifications:[],orderItems:[]})},normalizeRole:x=>x,roleOf:u=>u.roleCode,isNotifForUser:()=>true,notifReadFor:()=>false,activateDueRemoteOrders(){},today:()=>new Date().toISOString().slice(0,10),require:p=>p==='../workload-queues'?require('../lib/workload-queues'):p==='../pickup-feature'?{enabled:()=>true}:p==='../transport-planning'?{pendingWork:()=>0,plannedWork:()=>0,enabled:()=>true}:p==='../dispatch'?{dispatchViews:()=>[]}:p==='../transport-sales-views'?{salesTransportViews:()=>[]}:require(p),route:(method,url,opts,fn)=>{if(url==='/api/workload')c.handler=fn;}};
 vm.createContext(c);vm.runInContext(core.slice(core.indexOf('function notificationSection('),core.indexOf('// Legacy records')),c);vm.runInContext(core.slice(core.indexOf("route('GET', '/api/workload'"),core.indexOf("route('GET', '/api/dashboard'")),c);
 const n=id=>({targetRole:'sales',type:'TRANSPORT_ASSIGNED',entityType:'order',entityId:id});assert.equal(c.notificationSection(n('5')),'flow');assert.equal(c.notificationSection(n('1')),'settlement');assert.equal(c.notificationSection(n('3')),'stores');orders[0].status='CLOSED';assert.equal(c.notificationSection(n('1')),'delivery');orders[0].status='SETTLEMENT_PENDING';
 const editNotif={targetRole:'warehouse',type:'WAREHOUSE_DOCUMENT_EDIT_REQUESTED',entityType:'order',entityId:'6'};assert.equal(c.notificationSection(editNotif),'document-edits');editOrder.documentEdits[0].status='COMPLETED';assert.equal(c.notificationSection(editNotif),null);
 const counts=(await c.handler({user:{roleCode:'sales'}})).body.counts;assert.equal(counts.salesSettlement,2);
 orders[0].transportWorkflow=1;orders[0].deliveryMode='DELIVERY';orders[0].transportInvoice={status:'PREPARED'};assert.equal(c.notificationSection(n('1')),'delivery');assert.equal(c.notificationSection({...n('1'),type:'WAREHOUSE_DONE'}),'delivery');
 // با ثبت فاکتور، پیش از چاپ هم شمارندهٔ تسویه کاهش می‌یابد.
 assert.equal((await c.handler({user:{roleCode:'sales'}})).body.counts.salesSettlement,1);
 orders[0].transportInvoice={status:'PREPARED',printedAt:'2026-01-01T10:00:00Z'};
 assert.equal((await c.handler({user:{roleCode:'sales'}})).body.counts.salesSettlement,1);
 const ctx={};vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function salesAllInSettlement('),app.indexOf(' // v37.6.0',app.indexOf('function salesAllInSettlement('))),ctx);assert.deepEqual(Array.from(ctx.salesAllInSettlement(orders),x=>x.id),['1','2']);
});
test('پاسخ قدیمی workload شمارنده تازه را بازنویسی نمی‌کند و شمارنده کارتابل پخش اعلان خوانده‌نشده را نشان می‌دهد',async()=>{
 const pending=[];const badges=[];const c={app:{user:{id:'u'},workload:{}},api:url=>new Promise(resolve=>pending.push({url,resolve})),$$:selector=>selector==='[data-sales-count]'?badges:[],qty:String,applyNotifSnapshot:d=>{c.app.notifSnapshot=d},$:()=>null,renderNav(){},icon(){return ''},normalizeRole:x=>x};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('async function refreshIndicators(){'),app.indexOf('/* larger dashboard / navigation icons')),c);
 const old=c.refreshIndicators(),newer=c.refreshIndicators();assert.equal(pending.length,4);pending[2].resolve({notifications:[],unread:0});pending[3].resolve({counts:{salesSettlement:4,salesDeliveryActive:2,salesDeliveryPending:1}});await newer;pending[0].resolve({notifications:[],unread:0});pending[1].resolve({counts:{salesSettlement:1,salesDeliveryActive:0,salesDeliveryPending:0}});await old;assert.equal(c.app.workload.salesSettlement,4);assert.equal(c.app.workload.salesDeliveryActive,2);
 const badge={dataset:{salesCount:'delivery'},textContent:'',classList:{toggle(){}}};badges.push(badge);c.$$=selector=>selector==='[data-sales-count]'?badges:[];c.app.notifSnapshot={notifications:[{targetRole:'sales',navSection:'delivery',isRead:false}]};c.updateSalesDeliveryWorkCount();assert.equal(badge.textContent,'1');
});
