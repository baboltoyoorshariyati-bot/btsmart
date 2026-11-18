'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('store portal has a dedicated delivered-orders inbox and explicit store receipt action',()=>{
 const ui=read('public/ui2.js');
 assert.match(ui,/سفارش ورودی/);assert.match(ui,/تحویل شده/);
 assert.match(ui,/data-action="store-confirm-delivery"/);
 assert.match(ui,/confirm-receipt/);
 assert.match(ui,/دریافت فروشگاه تأیید شد/);
 assert.match(ui,/storeReceiptConfirmedAt/);
 assert.match(ui,/line\.deliveredKg/);
 assert.match(ui,/o\.payment\?\.invoiceNumber/);
});
test('all order queues prefer store name and hide store customer phone',()=>{
 const ui=read('public/ui2.js'),app=read('public/app.js');
 assert.match(app,/function storeAwareOrderName\(o\).*o\?\.orderType==='STORE'\?storeDisplayName\(o\.storeName\|\|'فروشگاه',o\.branchNo\)/);
 assert.ok(app.includes("function storeAwareOrderPhone(o){return o?.orderType==='STORE'?'':"));
 assert.match(ui,/storeAwareOrderName\(o\)/);
 assert.match(ui,/storeAwareOrderPhone\(o\)/);
 assert.doesNotMatch(ui,/\$\{esc\(o\.customer\?\.name\|\|o\.storeName/);
});
test('sales delivery cards show store receipt confirmation and notification routes to delivery review',()=>{
 const ui=read('public/ui2.js'),app=read('public/app.js');
 assert.match(ui,/دریافت توسط فروشگاه تأیید شد/);
 assert.match(ui,/تأیید دریافت فروشگاه/);
 assert.match(app,/STORE_RECEIPT_CONFIRMED:\{page:'sales',sub:'delivery'\}/);
});
test('store receipt endpoint is ownership-scoped and only valid after driver delivery',()=>{
 const routes=read('lib/routes/orders.js');
 const body=routes.slice(routes.indexOf("route('POST', '/api/store/orders/:id/confirm-receipt'"),routes.indexOf("route('GET', '/api/store/orders/:id'"));
 assert.match(body,/store-access.*owns\(ctx\.user,order\)/);
 assert.match(body,/\['DELIVERED','SALES_FINALIZED','CLOSED'\]/);
 assert.match(body,/STORE_RECEIPT_CONFIRMED/);
});
