'use strict';
// v37.6.0 — اعتبارسنجی ساختاری: مدل «بدون قیمت» چرخهٔ فروشگاه، تفکیک تب‌ها، شماره B، ناوبری Enter، برچسب شعبه
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('public/app.js'),ui2=read('public/ui2.js'),dsp=read('public/dispatch-ui.js'),adm=read('public/admin-ui.js');
const dispatchSrv=read('lib/dispatch.js'),core=read('lib/routes/core.js'),ordNums=read('lib/order-numbers.js'),ordersSrv=read('lib/routes/orders.js'),adminSrv=read('lib/routes/admin.js');

test('شماره سفارش فروشگاه با پیشوند B و کد شعبه صادر می‌شود',()=>{
 assert.match(ordNums,/return `B\$\{String\(40 \+ b\)\.padStart\(2, '0'\)\}\$\{String\(seq\)\.padStart\(4, '0'\)\}`/);
 assert.match(ordersSrv,/store\.nextStoreOrderNumber\(fields\.branchNo \?\? 1\)/);
 assert.match(adminSrv,/checkBranchNo|branchNo/);
 assert.match(adm,/name="branchNo"/);
 assert.match(adm,/name="branchId"/);
 assert.match(adminSrv,/branch\.branchNo/);
});

test('فلوی فروشگاه بدون قیمت در سرور (priceFree، مقدار فاینال فاکتور صفر)',()=>{
 assert.match(dispatchSrv,/prepareQtyOnlyPlan\(order, scopeIds, sh\.weights/);
 assert.match(dispatchSrv,/priceFree:\s*true/);
 assert.match(dispatchSrv,/const payable = isStorePriceFree \? 0 :/);
 assert.match(dispatchSrv,/const methods = isStorePriceFree \? \[\] :/);
 assert.match(dispatchSrv,/unitPrice: null, amount: null/);
 assert.match(dispatchSrv,/تغییر قیمت پیش از صدور فاکتور|DISPATCH_PRICE_ADJUST/);
});

test('مودال ارسال فروش به راننده بدون ورودی قیمت است',()=>{
 const fn=ui2.slice(ui2.indexOf('async function srSalesOpenShip'),ui2.indexOf('async function salesFinalizeDeliveryV38'));
 assert.match(fn,/تعیین رانندهٔ محمولهٔ سرویس/);
 assert.doesNotMatch(fn,/data-srship-price|srShipGrand|فی هر کیلو/);
 assert.match(fn,/driverId, run \}/);
});

test('سفارش فروشگاه از تسویهٔ عادی جدا و در تحویل راننده قابل مشاهده است',()=>{
 assert.match(ui2,/function renderSalesStoresV41\(orders,deliveries=\{\}\)/);
 assert.match(app,/salesFlowOrders\(orders\)\{return orders\.filter\(o=>o\.orderType!=='STORE'/);
 assert.match(app,/salesAllInSettlement\(orders\)\{return orders\.filter\(o=>o\.orderType!=='STORE'/);
 const delivery=ui2.slice(ui2.indexOf('function renderSalesDeliveryV38'),ui2.indexOf('async function salesViewDeliverySignatureV38'));
 assert.doesNotMatch(delivery,/filter\(regularOnly\)/);assert.match(ui2,/function renderSalesStoreDeliveryDetails/);
 assert.match(ui2,/سرویس .*بدون مبلغ/);
 assert.match(core,/warehouseIncomingRegular|warehousePreparingRegular|warehouseStores/);
});

test('تب مستقل فروشگاه در انبار و حذف فروشگاه از تب‌های عادی انبار',()=>{
 assert.match(ui2,/data-wh38-tab="stores"/);
 assert.match(ui2,/\)\.filter\(o=>o\.orderType!=='STORE'\); \/\/ v37\.6\.0 — سفارش‌های فروشگاه از تب‌های عادی انبار جدا شدند/);
 const paint=ui2.slice(ui2.indexOf('async function wh38Paint'),ui2.indexOf('function wh38Shell'));
 assert.match(paint,/phase==='stores'/);
 assert.match(paint,/filter\(o=>o\.orderType==='STORE'\)/);
});

test('بورد کامل چرخهٔ حیات در تب فروشگاهِ فروش (تأیید تا نهایی‌سازی سند)',()=>{
 const fn=ui2.slice(ui2.indexOf('function sdStoreInvoiceChips'),ui2.indexOf('/* ---------- تب ۳: در جریان'));
 assert.match(fn,/renderStoreRunShipmentsPanel/);
 assert.match(fn,/تأیید نهایی تحویل\$/);
 assert.match(fn,/sd-store-card-compact-v41/);
 assert.match(fn,/دریافت فروشگاه تأیید شد/);
});

test('راننده: کارت سادهٔ فروشگاه بدون اقلام، با جزئیات محموله و فاکتور وزنی',()=>{
 assert.match(dsp,/function dspQtyInvoiceMarkup/);
 assert.match(dsp,/function dspOrderDetails/);
 assert.match(dsp,/data-dsp="details"/);
 const card=dsp.slice(dsp.indexOf('function dspDriverCard'),dsp.indexOf('function dspDoneCard'));
 assert.match(card,/storeFree/);
 assert.match(card,/جزئیات محموله/);
 const form=dsp.slice(dsp.indexOf('async function openDeliveryForm'),dsp.indexOf('function dspBindSignature'));
 assert.match(form,/priceFree/);
 assert.match(form,/تحویل محموله \(بدون تسویه مالی\)|ثبت تحویل محموله/);
 assert.match(form,/dsp-deliver-table/); // v37.33.0 — فهرست یکپارچهٔ اقلام تحویلی با ستون‌های مرجوعی/کسری
 assert.match(dsp,/function dspQtyInvoiceMarkup/); // فاکتور وزنی همچنان برای کارت‌های تحویل‌شده می‌ماند
});

test('نگهبانی: برچسب فروشگاه/بدون مبلغ روی کارت خروج‌های ارسال',()=>{
 assert.match(dsp,/dsp-card-storefree/);
 assert.match(dsp,/data-gate="details"/);
 assert.match(dsp,/if \(el\.dataset\.gate === 'details'\) return dspOrderDetails/);
});

test('سند فاکتور فروشگاه وزنی است (چاپ و پیش‌نمایش بدون مبلغ)',()=>{
 assert.match(ui2,/سند تحویل وزنی فروشگاه — بدون مبلغ/);
 assert.match(app,/سند تحویل وزنی فروشگاه/);
 assert.match(ui2,/جمع وزن محموله/);
 assert.doesNotMatch(ui2.slice(ui2.indexOf('function renderSalesStoreDeliveryDetails'),ui2.indexOf('function renderSalesDeliveryCardV38')),/money\(/);
 assert.match(ui2,/سند وزنی — بدون مبلغ/); // سلول مبلغ جدول‌ها
 assert.match(app,/سند وزنی — بدون مبلغ/);
 const row=ui2.slice(ui2.indexOf('function st38DeliveredDetails'),ui2.indexOf('function st38DeliveredRow'));
 assert.match(row,/freeFlow/);
 assert.match(row,/freeFlow\?lines\.map/); // مپ فروشگاه‌ای ردیف‌ها فقط وزن است
});

test('ناوبری Enter ردیف‌به‌ردیف در فرم سفارش فروشگاه',()=>{
 const block=app.slice(app.indexOf('v37.6.0 — ناوبری Enter در فرم سفارش فروشگاه'),app.indexOf('let v21ProductTimer'));
 assert.match(block,/#storeOrderForm/);
 assert.match(block,/data-op-product-search|opProductSearch/);
 assert.match(block,/store-add-line/);
 assert.match(block,/e\.preventDefault\(\)/);
});

test('ویرایش قیمت مشتری عادی هم‌زمان با نهایی‌سازی (مسیر غیر فروشگاه)',()=>{
 const fin=dispatchSrv.slice(dispatchSrv.indexOf('function salesFinalizeDelivery'),dispatchSrv.indexOf('const itemTotal'));
 assert.match(fin,/priceEdits/);
 assert.match(fin,/isStoreOrder/);
 assert.match(fin,/DISPATCH_PRICE_ADJUST/);
 assert.match(fin,/existingPayment\).*fail\(409|فاکتور این سفارش پیش‌تر صادر شده است/);
});
