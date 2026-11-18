'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('public/ui2.js'),app=read('public/app.js'),driver=read('public/dispatch-ui.js'),gate=read('lib/routes/dispatch.js');
test('store register and delivery are separate; delivery has exactly two requested states',()=>{
 const start=ui.indexOf('async function renderStorePortal()'),end=ui.indexOf('/* ================================================================',start),src=ui.slice(start,end);
 assert.match(src,/isDeliveryView=app\.sub\.store==='delivery'/);
 assert.match(src,/data-store-delivery-tab=\"inProgress\"/);assert.match(src,/data-store-delivery-tab=\"delivered\"/);
 assert.match(src,/در حال تحویل/);assert.match(src,/تحویل شده/);assert.doesNotMatch(src,/id=\"storeIncomingList\"/);
});
test('gate driver-exit confirmation is only mounted in driver-delivery tab, not the incoming entry header',()=>{
 const start=ui.indexOf('async function renderGate(tab)'),end=ui.indexOf('\nfunction renderGateEntry',start),src=ui.slice(start,end);
 assert.doesNotMatch(src,/gateHomeDispatchMarkup\(dispatchData\)/);
 assert.match(app,/gate:\[\['entry','ثبت ورود','entry',null\],\['waiting','در انتظار اقدام فروش','bell','gateEntry'\],\['exit','کنترل خروج','exitDoor','gateExit'\],\['dispatch','پخش','truck','gateDispatchPending'\],\['history','سوابق مراجعه','history',null\],\['reports','گزارش‌ها','reports',null\]\]/);
 assert.match(src,/gateDispatchTabsHtml\(dispatchData,app\.gateDispatchTab,dispatchError\)/);
 assert.doesNotMatch(src,/<nav class="sd-tabs"/,'legacy in-content gate navigation must not be rendered');
 const panel=driver.slice(driver.indexOf('function gateDispatchMarkup(data)'),driver.indexOf('function updateGateDispatchInCartable'));
 assert.match(panel,/section\('آماده ثبت خروج نگهبانی'[\s\S]*?gateDispatchCard\(o, 'exit'\)/);
});
test('driver cartable has four ordered state tabs and store customer name box beneath store name',()=>{
 const paint=driver.slice(driver.indexOf('function paintDriver(data)'),driver.indexOf('function dspDriverCard'));
 const labels=['واگذار شده','در حال ارسال','تحویل شده','سوابق'];let at=-1;for(const label of labels){const next=paint.indexOf(label,at+1);assert(next>at,`${label} tab order`);at=next;}
 assert.match(paint,/data-dsp-driver-tab/);
 assert.match(driver,/dsp-store-customer-box/);
 assert.match(driver,/نام مشتری/);
 assert.match(read('public/index.html'),/dispatch-ui\.js\?v=37\.50\.0/);
 assert.match(driver,/function dspCustomer\(o\).*o\.orderType==='STORE'.*o\.storeName/);
});
test('transport history detail expansion stays inside the order card and scrolls long item tables',()=>{
 const css=read('public/compatibility.css');
 assert.match(css,/\.drv-del>\.adm-cell\.adm-actions\{grid-column:1\/-1!important/);
 assert.match(css,/\.drv-lines\[open\]>\.table-wrap\{[\s\S]*?overflow-x:auto!important/);
 assert.match(css,/\.sales-delivery-board\{display:grid;direction:rtl;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
test('driver orders API returns assigned, in-transit, delivered and historical buckets',()=>{
 const start=gate.indexOf("route('GET', '/api/driver/orders'"),end=gate.indexOf("route('POST', '/api/driver/orders/:id/exit'",start),src=gate.slice(start,end);
 for(const key of ['assigned','inTransit','delivered','history','historyTotal'])assert(src.includes(key),`missing ${key}`);
 assert.match(src,/\['ASSIGNED', 'DRIVER_EXIT_REPORTED'\]/);
 assert.match(src,/v\.dispatch\.status === 'IN_TRANSIT'/);
 assert.match(src,/v\.dispatch\.status === 'DELIVERED'/);
 assert.match(src,/dispatch\.dispatchViews\(o\)/, 'v37.6.0 driver list must iterate per-run dispatch views');
});
