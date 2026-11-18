'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/dispatch-ui.js'),'utf8');
const code=source.slice(source.indexOf('function transportPlanRows('));
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
test('نمای ترابری برای دو سرویس ردیف جدا و وضعیت مستقل دارد و داده را امن نمایش می‌دهد',()=>{
 const ctx=vm.createContext({esc,fa:x=>x,qty:String,formatDateTime24:x=>x||'—',storeAwareOrderName:o=>o.customerName||'—'});const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');vm.runInContext(app.slice(app.indexOf('function orderSummaryRow('),app.indexOf('\nconst app =')),ctx);vm.runInContext(code,ctx);
 const rows=ctx.transportPlanRows([{id:'o',orderNo:'101',customerName:'<فروشگاه>',services:[{run:1,assignment:{driverName:'<الف>',vehicleType:'وانت',vehiclePlate:'123'},departed:true,tripStatus:'IN_TRANSIT'},{run:2,assignment:{driverName:'ب'},canDepart:true}]}]);
 assert.match(rows,/&lt;فروشگاه&gt;/);assert.match(rows,/&lt;الف&gt;/);assert.match(rows,/سرویس اول/);assert.match(rows,/سرویس دوم/);assert.match(rows,/در مسیر/);assert.match(rows,/آماده ثبت خروج/);assert.equal((rows.match(/data-tp="details"/g)||[]).length,2);
});
test('پنل آزمایشی در حالت غیرفعال درخواست صف یا تخصیص نمی‌فرستد',async()=>{
 const host={innerHTML:''},calls=[];const ctx=vm.createContext({esc,fa:x=>x,$:s=>s==='#transportPlans'?host:null,api:async url=>{calls.push(url);return {experimentalWorkflow:false}}});vm.runInContext(code,ctx);
 await ctx.renderTransportPlanQueue();assert.deepEqual(calls,['/api/transport/capabilities']);assert.equal(host.innerHTML,'');
});
test('ترابری فقط انتظار تأیید نگهبانی را نشان می‌دهد و دکمه خروج ندارد',()=>{
 let html='';const ctx=vm.createContext({captureEntityNotices:()=>[],finishEntityNotices:()=>{},esc,fa:x=>x,qty:x=>x,openModal:(title,body)=>{html=body},$:()=>null});vm.runInContext(code,ctx);
 ctx.transportPlanDetails({id:'o',orderNo:'1',items:[]},{run:0,handedOver:true,awaitingGate:true,invoiceNumber:'000123',assignment:{}},{drivers:[],vehicles:[]});assert.match(html,/فقط در کارتابل نگهبانی/);assert.doesNotMatch(html,/<button[^>]*data-tp-depart/);
});
test('جزئیات فروش و انبار تخصیص مستقل را نشان می‌دهد و فقط فروش می‌تواند بازگشت مدارک تأییدشده را ثبت کند',()=>{
 const appSource=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),fragment=appSource.slice(appSource.indexOf('function transportOrderServiceHtml('),appSource.indexOf('async function openOrderDetails('));
 const ctx=vm.createContext({esc,fa:x=>x,app:{features:{experimentalTransport:true}}});vm.runInContext(fragment,ctx);
 const order={transportWorkflow:1,deliveryMode:'DELIVERY',orderType:'STORE',transportAssignments:{'1':{driverName:'<راننده اول>',driverPhone:'091',vehicleType:'وانت',vehiclePlate:'123'},'2':{driverName:'راننده دوم'}},transportStoreTrips:{'1':{status:'RECEIPT_CONFIRMED'},'2':{status:'IN_TRANSIT'}}};
 const sales=ctx.transportOrderServiceHtml(order,true),warehouse=ctx.transportOrderServiceHtml(order,false);assert.match(sales,/&lt;راننده اول&gt;/);assert.match(sales,/راننده دوم/);assert.match(sales,/data-store-transport-return="1"/);assert.doesNotMatch(sales,/data-store-transport-return="2"/);assert.doesNotMatch(warehouse,/data-store-transport-return=/);
 ctx.app.features.experimentalTransport=false;assert.doesNotMatch(ctx.transportOrderServiceHtml(order,true),/data-store-transport-return=/);
 assert.equal(ctx.transportOrderServiceHtml({...order,transportWorkflow:undefined},true),'');
});

test('جزئیات ترابری با مشخصات افقی و اقلام جدول‌بندی‌شده، مقادیر را امن نگه می‌دارد',()=>{
 let html='';const ctx=vm.createContext({captureEntityNotices:()=>[],finishEntityNotices:()=>{},esc,fa:x=>x,qty:x=>x,openModal:(title,body)=>{html=body},$:()=>null});vm.runInContext(code,ctx);
 ctx.transportPlanDetails({id:'o',orderNo:'1',customerName:'<مشتری>',dispatchPlace:'نشانی طولانی',items:[{productName:'<کالا>',requestedQty:4,requestedUnit:'عدد'}]},{run:2,assignment:{driverName:'راننده'},handedOver:true},{drivers:[],vehicles:[]});
 assert.match(html,/tp-detail-grid/);assert.match(html,/tp-items-table/);assert.match(html,/&lt;مشتری&gt;/);assert.match(html,/&lt;کالا&gt;/);assert.match(html,/سرویس دوم/);assert.doesNotMatch(html,/<li>/);assert.doesNotMatch(html,/id="tpAssign"/);
 const css=fs.readFileSync(path.join(__dirname,'../public/compatibility.css'),'utf8');assert.match(css,/tp-detail-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);assert.match(css,/tp-detail-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('صف سفارش‌های ترابری جهت ردیف را صریحاً افقی و پیمایش را محدود به فهرست می‌کند',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/compatibility.css'),'utf8');assert.match(css,/#transportPlans \.order-compact-row\{flex-direction:row!important/);assert.match(code,/adm-list order-compact-scroll tp-plan-list/);
});
