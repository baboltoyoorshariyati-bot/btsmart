'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8'),ui=fs.readFileSync('public/ui2.js','utf8'),css=fs.readFileSync('public/compatibility.css','utf8');
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
test('صف تسویه از جدول و دکمه انتخاب قابل دسترس استفاده می‌کند',()=>{
 const c={fa:v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),esc,storeAwareOrderName:o=>o.customer?.name||o.storeName||'—',qty:String,formatDateTime24:v=>v||'—',activeItemsOf:o=>o.items||[],badge:()=>'<span>آماده تسویه</span>',stl:{orderId:'internal-id'}};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('function orderSummaryRow('),app.indexOf('\nconst app =')),c);
 vm.runInContext(ui.slice(ui.indexOf('function settlementPendingRowsV27(rows){'),ui.indexOf('\nfunction invoiceRowsV27')),c);
 const html=c.settlementPendingRowsV27([{id:'internal-id',orderNo:'000123',status:'SETTLEMENT_PENDING',customer:{name:'مشتری <آزمایشی>'},createdAt:'تاریخ',items:[{}]}]);
 assert.match(html,/bt-table stl-queue-table/);assert.match(html,/stl-queue-row active/);assert.match(html,/data-stl="select" data-action="select-settlement" data-id="internal-id"/);assert.match(html,/مشتری &lt;آزمایشی&gt;/);assert.match(html,/۰۰۰۱۲۳/);assert.match(html,/bt-cell-main/);assert.match(html,/data-label="نام مشتری"/);assert.match(html,/data-label="شماره سفارش"/);assert.match(html,/data-label="تاریخ"/);assert.match(html,/data-label="اقلام"/);assert.match(html,/data-label="عملیات"/);assert.match(html,/تاریخ/);assert.match(html,/۱ قلم|1 قلم/);assert.match(html,/تسویه/);
 assert.match(c.settlementPendingRowsV27([]),/سفارشی در انتظار تسویه نیست/);
});
test('صف تسویه عرض ثابت و بدون پیمایش افقی دارد',()=>{
 assert.match(css,/stl-queue-panel \.stl-queue-list[^}]*overflow-x:hidden!important/);assert.match(css,/stl-queue-item-card[^}]*width:100%!important/);assert.match(css,/stl-queue-item-card[^}]*height:54px!important/);assert.match(css,/stl-queue-customer[^}]*text-overflow:ellipsis!important/);
});
