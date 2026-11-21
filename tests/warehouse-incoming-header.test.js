'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('public/ui2.js'),app=read('public/app.js'),css=read('public/form-layout.css'),btcss=read('public/bt-table.css');
const helper=ui.slice(ui.indexOf('function wh38IncomingHeader(o)'),ui.indexOf('function wh38List(orders,kind)'));
test('incoming header has four equal cells with customer and metadata in one row',()=>{
 assert.equal((helper.match(/class="wh38-incoming-cell/g)||[]).length,4);
 assert(helper.includes("o.orderType==='STORE'?'فروشگاه':'مشتری'"));
 for(const label of ['اقلام','ثبت','آخرین اقدام'])assert(helper.includes(`<b>${label}</b>`));
 assert.match(css,/\.wh38-incoming-summary \{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.wh38-incoming-cell \{[\s\S]*?height:44px!important/);
 assert.match(css,/\.wh38-incoming-summary-scroll \{[\s\S]*?overflow-x:auto!important/);
});
test('incoming and preparing lists are one shared bt-table with the fixed column order',()=>{
 const list=ui.slice(ui.indexOf('function wh38List(orders,kind)'),ui.indexOf('async function wh38Paint(phase)'));
 const table=ui.slice(ui.indexOf('function wh38OrdersTable(orders,kind)'),ui.indexOf('function wh38Tabs(active)'));
 assert.match(list,/return wh38OrdersTable\(orders,kind\)/);   // یک سازندهٔ مشترک برای هر دو تب
 assert.match(table,/class="bt-table wh-orders-table"/);
 assert.match(table,/<th scope="col">شماره سفارش<\/th><th scope="col">نام مشتری<\/th><th scope="col">تاریخ سفارش<\/th><th scope="col">تاریخ تحویل<\/th><th scope="col" class="bt-col-actions">عملیات<\/th>/, 'ترتیب ستون‌ها');
 for(const label of ['شماره سفارش','نام مشتری','تاریخ سفارش','تاریخ تحویل','عملیات'])assert.match(table,new RegExp('data-label="'+label+'"'));
 // همهٔ دکمه‌های قبلی سر جای خودشان در همان ردیف هستند
 assert.match(table,/data-action="wh38-order-details"/);
 assert.match(table,/data-action="wh38-start"/);
 assert.match(table,/data-action="pickup-cancel"/);
 assert.match(table,/class="bt-actions"/);
 assert.doesNotMatch(table,/class="wh38-meta"/);
 assert.doesNotMatch(list,/data-action="wh38-accept"/);
 // «تاریخ تحویل» فقط تاریخ است و ساعت ندارد
 assert.match(table,/data-label="تاریخ تحویل"><span class="bt-cell-main">\$\{btDate\(delivery\)\}<\/span><\/td>/);
 // عرض ستون‌ها اندازهٔ متن است، نه درصد ثابت
 assert.match(btcss,/\.wh-orders-table\{table-layout:auto;width:max-content;max-width:100%\}/);
 assert.match(btcss,/\.wh-orders-table th,\.wh-orders-table td\{width:1%;white-space:nowrap\}/);
 assert.doesNotMatch(btcss,/\.wh-orders-table td:nth-child\(1\)\{width:16%\}/);
 assert.match(css,/\.wh38-incoming-card \{[\s\S]*?padding:10px 12px!important/);
});
test('customer strings are escaped, cancelled items excluded, updated time falls back to created time',()=>{
 const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const c={fa:v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),esc,storeAwareOrderName:o=>o?.orderType==='STORE'?(o.storeName||'فروشگاه'):(o?.customer?.name||o?.storeName||'—'),storeAwareOrderPhone:o=>o?.orderType==='STORE'?'':(o?.customer?.phone||'—'),qty:String,activeItemsOf:o=>o.items.filter(i=>i.itemStatus!=='CANCELLED'),formatDateTime24:s=>s||'—',sdTypeBadge:()=>'',badge:()=>''};
 vm.createContext(c);vm.runInContext(helper,c);
 const html=c.wh38IncomingHeader({id:'test-order',customer:{name:'<img "test">',phone:'09123456789'},createdAt:'2026-10-14T08:30',items:[{}, {itemStatus:'CANCELLED'}]});
 assert(html.includes('&lt;img &quot;test&quot;&gt;'));assert(!html.includes('<img'));
 assert.match(html,/<b>اقلام<\/b><span>1 قلم<\/span>/);
 assert.equal((html.match(/title="2026-10-14T08:30"/g)||[]).length,2);
 const storeHtml=c.wh38IncomingHeader({id:'store-order',orderType:'STORE',storeName:'فروشگاه نمونه',customer:{name:'مشتری محرمانه',phone:'09129999999'},createdAt:'2026-10-14T08:30',dispatchPlace:'بابل',items:[]});
 assert(storeHtml.includes('<b>فروشگاه</b><h3 title="فروشگاه نمونه">فروشگاه نمونه</h3>'));assert(!storeHtml.includes('مشتری محرمانه'));assert(!storeHtml.includes('09129999999'));
});
