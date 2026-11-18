'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const appSource=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),uiSource=fs.readFileSync(path.join(__dirname,'../public/ui2.js'),'utf8');
const fragment=(src,start,end)=>src.slice(src.indexOf(start),src.indexOf(end));
const helpers=fragment(appSource,'function deliveryModeInputHtml(', 'function depositEntryHtml(');
test('روش تحویل دارای عنوان‌های دقیق و الزامی است و بیعانه به پخش نمی‌رود',()=>{
 const ctx=vm.createContext({app:{features:{experimentalTransport:true}},esc:x=>x});vm.runInContext(helpers,ctx);
 const h=ctx.deliveryModeInputHtml('phone');assert.match(h,/ارسال توسط پخش/);assert.match(h,/تحویل در انبار/);assert.match(h,/required/);assert.match(h,/delivery-mode-phone/);
 const root=mode=>({querySelector:()=>({value:mode})});assert.throws(()=>ctx.readDeliveryMode(root(''),null),/روش تحویل/);assert.throws(()=>ctx.readDeliveryMode(root('DELIVERY'),{amount:1}),/بیعانه/);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.readDeliveryMode(root('PICKUP'),{amount:1}))),{transportWorkflow:true,deliveryMode:'PICKUP'});ctx.app.features={};assert.deepEqual(JSON.parse(JSON.stringify(ctx.readDeliveryMode(null,null))),{});
 for(const p of ['onsite','phone','future'])assert(uiSource.includes(`deliveryModeInputHtml('${p}')`));
});
function harness(mode,deposit=null){
 const calls=[],messages=[],form={fields:{name:'مشتری',phone:'09120000000',deliveryDate:'2026-10-21',scheduledDate:'2026-10-15',scheduledTime:'08:30',dispatchPlace:'بابل',deliveryMode:mode},reset(){},querySelector(s){return s==='[data-delivery-mode]'?{value:mode}:null}};
 const c={app:{features:{experimentalTransport:true},phoneDraft:[{productId:'p01',requestedQty:'2',requestedUnit:'کیلوگرم'}],futureDraft:[{productId:'p01',requestedQty:'2',requestedUnit:'کیلوگرم'}],orderDraft:[{productId:'p01',requestedQty:'2',requestedUnit:'کیلوگرم'}],page:'sales',sub:{sales:'onsite'}},esc:x=>x,FormData:class{constructor(f){this.f=f}*[Symbol.iterator](){yield*Object.entries(this.f.fields)}},document:{querySelector:()=>form},n:Number,fa:String,$$:()=>[],today:()=> '2026-10-14',normalizeTime24:s=>s,readOrderDeposit:()=>deposit,api:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {order:{}}},toast:m=>messages.push(m),renderOrderLineArea(){},defaultOrderLine:()=>({}),renderSales:async()=>{},fetchSalesCache:async()=>({}),paintSalesPaneV29(){},isoToJalali:s=>s,Event:class{}};
 vm.createContext(c);vm.runInContext(helpers,c);vm.runInContext(fragment(appSource,'async function submitPhoneOrderV25(form){','async function openStoreApprovalV25(id){'),c);vm.runInContext(fragment(appSource,'async function submitOrder(visitId){','const _legacyResubmitOrderV25'),c);return{c,form,calls,messages};
}
test('ثبت حضوری، تلفنی و آینده حالت انتخابی را واقعاً به API می‌فرستد',async()=>{
 for(const mode of ['DELIVERY','PICKUP']){const h=harness(mode);await h.c.submitOrder('visit');await h.c.submitPhoneOrderV25(h.form);h.c.app.futureDraft=[{productId:'p01',requestedQty:'2',requestedUnit:'کیلوگرم'}];await h.c.submitFutureOrderV25(h.form);assert.equal(h.calls.length,3,JSON.stringify(h.messages));for(const call of h.calls){assert.equal(call.body.transportWorkflow,true);assert.equal(call.body.deliveryMode,mode);}assert.equal(h.calls[2].body.scheduledAt,'2026-10-15T08:30');}
});
test('انتخاب‌نشدن روش و سفارش بیعانه‌دار پخش قبل از ارسال رد می‌شود',async()=>{
 let h=harness('');await h.c.submitOrder('visit');await h.c.submitPhoneOrderV25(h.form);assert.equal(h.calls.length,0);assert(h.messages.every(s=>/روش تحویل/.test(s)));
 h=harness('DELIVERY',{amount:10,type:'CASH'});await h.c.submitPhoneOrderV25(h.form);await h.c.submitFutureOrderV25(h.form);assert.equal(h.calls.length,0);assert(h.messages.every(s=>/بیعانه/.test(s)));
});
test('اعلان ترابری به صف مستقل و خروج به کارتابل تحویل فروش هدایت می‌شود',async()=>{
 const calls=[],clicked=[];const button={click:()=>clicked.push('open')};
 const c={app:{user:{roleCode:'gate'}},adm:{},acknowledgeNotifications:async()=>true,normalizeRole:x=>x,go:async(...args)=>calls.push(['go',...args]),document:{querySelector:()=>button},CSS:{escape:x=>x},focusNotificationElement:()=>true,api:async url=>{assert.equal(url,'/api/gate/dispatch');return {leaving:[{id:'id1'}]};},dspOrderDetails:async id=>calls.push(['gate-details',id]),toast:m=>calls.push(['toast',m]),stlOpen:id=>calls.push(['stl',id])};
 vm.createContext(c);vm.runInContext(fragment(appSource,'const NOTIF_ROUTES={','function faDigits('),c);vm.runInContext(fragment(appSource,'async function openNotificationTarget(', 'function notifyNewArrivals('),c);
 await c.openNotificationTarget('n','TRANSPORT_INVOICE_READY','gate','order','id1');assert.deepEqual(calls,[['go','gate','dispatch'],['gate-details','id1']]);
 calls.length=0;c.app.user.roleCode='sales';c.api=async()=>({order:{id:'id2',orderType:'REMOTE',transportWorkflow:1,deliveryMode:'DELIVERY',status:'SETTLEMENT_PENDING'}});c.fetchSalesCache=async()=>{c.app.salesCache={dispatchDeliveries:{inTransit:[{id:'id2'}]}}};c.openSalesDeliveryDetails=id=>calls.push(['details',id]);
 await c.openNotificationTarget('n','TRANSPORT_DEPARTED','sales','order','id2');assert.deepEqual(calls,[['go','sales','delivery'],['details','id2']]);assert.equal(c.app.salesDeliveryTab,'inTransit');
});
test('اعلان پیش از فاکتور به تسویه و پس از فاکتور به کارتابل پخش می‌رود',async()=>{
 const events=[],c={app:{page:'sales',sub:{sales:'delivery'}},order:{},api:async()=>({order:c.order}),closeModal:()=>{},go:async(p,s)=>{events.push('go-'+s);c.app.page=p;c.app.sub.sales=s;},fetchSalesCache:async()=>{events.push('fetch');return{orders:[]}},paintSalesPaneV29:(tab)=>events.push('paint-'+tab),stlOpen:id=>events.push('settlement-'+id),openTransportDeliveryWork:id=>events.push('delivery-'+id)};
 vm.createContext(c);vm.runInContext(fragment(appSource,'async function goTransportSalesWork(', 'async function bootstrap('),c);await c.goTransportSalesWork('id');assert.deepEqual(events,['go-settlement','fetch','paint-settlement','settlement-id']);
 events.length=0;c.order={transportInvoice:{status:'PREPARED'},transportDeparture:{}};await c.goTransportSalesWork('id');assert.deepEqual(events,['go-delivery','delivery-id']);assert.equal(c.app.salesDeliveryTab,'inTransit');
 events.length=0;await c.goTransportSalesWork('id');assert.deepEqual(events,['delivery-id']);
});
