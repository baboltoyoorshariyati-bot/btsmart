'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('سوابق انبار دکمهٔ جزئیات سفارش را به پروندهٔ کامل سفارش متصل می‌کند',()=>{
 const app=read('public/app.js'),route=read('lib/routes/orders.js');
 assert.match(app,/data-whh-order-details[^>]*>[^<]*\$\{icon\('eye',14\)\} جزئیات سفارش/);
 assert.match(app,/api\('\/api\/warehouse\/history\/'\+encodeURIComponent\(id\)\)/);
 for(const field of ['اطلاعات کامل مشتری','اقلام و وزن‌کشی','مراحل سفارش','همهٔ رویدادهای ثبت‌شده','ثبت‌کنندهٔ سفارش'])assert.ok(app.includes(field),`نمایش ${field} برای جزئیات سفارش`);
 assert.match(app,/WHH_EVENT_LABELS/);assert.match(app,/whhActorName\(event\.user\)/);
 assert.match(route,/route\('GET', '\/api\/warehouse\/history\/:id', \{ roles: \['admin', 'warehouse'\] \}/);
 assert.match(route,/phone2', 'nationalId', 'company', 'district', 'address'/);
});

test('مدیر از سوابق سفارش و ردپای فعالیت‌ها به مسیر کامل ممیزی دسترسی دارد',()=>{
 const app=read('public/app.js'),adminUi=read('public/admin-ui.js'),route=read('lib/routes/sales-history.js');
 assert.match(app,/isManager\?['"]\/api\/admin\/orders\/['"]\+encodeURIComponent\(id\)\+['"]\/history['"]/);
 assert.match(app,/مشاهدهٔ جزئیات کامل این اقدام/);
 assert.match(app,/event\.actor\?\.name\|\|event\.username/);
 assert.match(adminUi,/data-admin-order-history=/);
 assert.match(adminUi,/openSalesHistory\(orderHistory\.dataset\.adminOrderHistory\)/);
 assert.match(route,/route\('GET','\/api\/admin\/orders\/:id\/history',\{roles:\['admin'\]\}/);
 assert.match(route,/e\.entityType==='visit'&&!!order\.visitId&&e\.entityId===order\.visitId/);
 assert.match(route,/e\.entityType==='order_item'/);
 assert.match(route,/details:e\.details\|\|\{\}/);
});

test('عنوان بالای کارتابل انبار از عنوان سایر کارتابل‌ها بزرگ‌تر است و در گوشی کنترل‌شده می‌ماند',()=>{
 const css=read('public/theme.css');
 assert.match(css,/#appView\[data-cartable-page="warehouse"\] \.workspace-header \.header-main h1\{font-size:26px!important/);
 assert.match(css,/@media\(max-width:768px\)\{#appView\[data-cartable-page="warehouse"\] \.workspace-header \.header-main h1\{font-size:18px!important/);
});
