'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('public/app.js'),ui=read('public/ui2.js'),dispatch=read('public/dispatch-ui.js');

test('sales cartable restores its controller and all seven tabs have a live render path',()=>{
 for(const name of ['salesV29SubmitHandler','bindSalesRootV29','salesV29ClickHandler','salesV29ChangeHandler','bindSalesPaneV29','salesV29Activate','paintSalesPaneV29','startSalesLiveTimerV29','renderSales'])assert.match(app,new RegExp(`function ${name}\\b`),`missing ${name}`);
 assert.match(app,/const SALES_TABS_V29 = \['onsite','remote','stores','flow','settlement','delivery','future'\]/);
});

test('store create and delivery render exactly one independent mode; delivery has no order form',()=>{
 const start=ui.indexOf('async function renderStorePortal()'),end=ui.indexOf('/* ================================================================\n   قدم ۴',start),src=ui.slice(start,end);
 assert.match(src,/const isDeliveryView=app\.sub\.store==='delivery'/);
 assert.match(src,/!isDeliveryView/);
 assert.match(src,/if\(isDeliveryView\)\{\$\('#content #storeOrderForm'\)\?\.remove\(\)/);
 assert.equal((src.match(/id="storeOrderForm"/g)||[]).length,1);
 assert.equal((src.match(/class="st38-delivery-panel/g)||[]).length,1);
});

test('role rail is the only navigator for gate, sales and warehouse; required transport/store states remain nested',()=>{
 const shell=app.slice(app.indexOf('function ensureSalesShellV29'),app.indexOf('/* v33 — future form'));
 const gate=ui.slice(ui.indexOf('async function renderGate(tab)'),ui.indexOf('function renderGateEntry'));
 const wh=ui.slice(ui.indexOf('function wh38Shell'),ui.indexOf('/* ---------------- v37.4.0'));
 assert.doesNotMatch(shell,/renderSalesTabsV29\(/);
 assert.doesNotMatch(gate,/<nav class="sd-tabs"/);
 assert.doesNotMatch(wh,/wh38Tabs\(phase\)/);
 assert.match(dispatch,/const tabs = \[\['pending', 'ورودی', 'pending'\], \['assigned', 'تخصیص‌یافته', 'assigned'/);
 assert.match(ui,/data-store-delivery-tab="inProgress"[\s\S]*?data-store-delivery-tab="delivered"/);
});

test('guard history and driver stages do not repeat the selected rail title in the content header',()=>{
 const gateStart=ui.indexOf('async function renderGate(tab)'),gateEnd=ui.indexOf('\nfunction renderGateEntry',gateStart),gate=ui.slice(gateStart,gateEnd);
 assert.match(gate,/renderGateHistory\(visits,true\)/);
 const focus=ui.slice(ui.indexOf('function gateDispatchFocusMarkup'),ui.indexOf('\nasync function renderGate',ui.indexOf('function gateDispatchFocusMarkup')));
 assert.doesNotMatch(focus,/<h2>\$\{esc\(title\)\}<\/h2>/);
 assert.match(focus,/gate-tab-context/);
});

test('quick codes render only in the product catalog and order-entry pickers, not operational order/warehouse/dispatch views',()=>{
 const flow=app.slice(app.indexOf('function renderSalesFlowV25'),app.indexOf('function renderSalesSettlementV25'));
 const warehouse=app.slice(app.indexOf('function whOrderList'),app.indexOf('function bindWarehouseV33'));
 const forms=ui.slice(ui.indexOf('async function renderStorePortal()'),ui.indexOf('/* ================================================================\n   قدم ۴'));
 const dispatchCards=dispatch.slice(dispatch.indexOf('function dspDispatchCard'),dispatch.indexOf('/* ---------- کارتابل راننده ---------- */'));
 assert.doesNotMatch(flow,/quickCode|کد سریع/);
 assert.doesNotMatch(warehouse,/quickCode|کد سریع/);
 assert.doesNotMatch(forms,/quickCode|کد سریع/);
 assert.doesNotMatch(dispatchCards,/quickCode|کد سریع/);
 const admin=read('public/admin-ui.js');
 assert.match(admin,/class="cust-code">\$\{admE\(x\.quickCode\)\}/);
 assert.match(app,/class="op-product-option"[\s\S]*?\$\{esc\(p\.quickCode\)\}/);
});
