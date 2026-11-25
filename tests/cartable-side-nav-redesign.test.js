'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'public/ui2.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/theme.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
test('right rail is the single role-specific navigation renderer and its cache is busted',()=>{
 assert.equal((app.match(/function renderNav\(/g)||[]).length,1);
 assert.doesNotMatch(ui,/function renderNav\(/);
 assert.match(app,/gate:\[\['entry','ورود'/);assert.match(app,/\['exit','خروج'/);assert.match(app,/\['dispatch','پخش'/);assert.match(app,/\['history','سوابق'/);
 assert.match(html,/ui2\.js\?v=37\.50\.0/);assert.match(html,/theme\.css\?v=37\.48\.1/);
});
test('admin enters role-specific cartables and store delivery never retains order registration',()=>{
 assert.match(app,/data-admin-cartable/);assert.match(app,/data-admin-home/);assert.match(app,/app.adminActiveRole=role/);
 const i=ui.indexOf('async function renderStorePortal()'),j=ui.indexOf('/* ================================================================\n   قدم ۴',i),src=ui.slice(i,j);assert.match(src,/isDeliveryView=app.sub.store==='delivery'/);assert.match(src,/if\(isDeliveryView\)\{\$\('#content #storeOrderForm'\)\?\.remove\(\)/);
});
test('store creation and delivery are separate views; delivery has exactly two states',()=>{
 const start=ui.indexOf('async function renderStorePortal()');const end=ui.indexOf('/* ================================================================\n   قدم ۴',start);const fn=ui.slice(start,end);
 assert.match(fn,/isDeliveryView=app\.sub\.store==='delivery'/);
 assert.match(fn,/data-store-delivery-tab="inProgress"/);assert.match(fn,/data-store-delivery-tab="delivered"/);
 assert.match(fn,/تحویل سفارش‌ها/);assert.match(fn,/در حال تحویل/);assert.match(fn,/تحویل شده/);
 assert.match(fn,/!isDeliveryView/);
});
test('warehouse phase follows the rail selection and no duplicate section tabs remain',()=>{
 assert.match(app,/app\.wh38\.phase=key/);assert.match(app,/setAttribute\('data-cartable-page',page\)/);assert.match(css,/#appView\[data-cartable-page="warehouse"\]/);
 assert.match(css,/#appView\[data-cartable-page="sales"\]/);assert.match(css,/#appView\[data-cartable-page="gate"\]/);
});
test('warehouse menu removes transport resources and exposes the existing controlled edit queue',()=>{
 const navStart=app.indexOf('function renderNav()'),warehouseStart=app.indexOf('warehouse:[',navStart),dispatchStart=app.indexOf('dispatch:[',warehouseStart),storeStart=app.indexOf('store:[',dispatchStart);
 const warehouseNav=app.slice(warehouseStart,dispatchStart),dispatchNav=app.slice(dispatchStart,storeStart);
 assert.match(warehouseNav,/document-edits/);assert.doesNotMatch(warehouseNav,/transport-resources/);
 assert.match(dispatchNav,/transport-resources/,'منوی کارتابل ترابری حفظ شود');
 assert.match(app,/\['incoming','preparing','delivered','document-edits','stores'\]\.includes\(app\.sub\.warehouse\)/);
 assert.match(ui,/async function whDocumentEditsPaint\(host\)/);assert.match(ui,/api\('\/api\/warehouse\/document-edits'\)/);
 assert.match(ui,/data-action="warehouse-document-edit"/);assert.match(fs.readFileSync(path.join(root,'lib/routes/document-edits.js'),'utf8'),/roles: \['warehouse', 'admin'\]/);
});
