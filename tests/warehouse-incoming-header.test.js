'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('public/ui2.js'),css=read('public/form-layout.css');
const helper=ui.slice(ui.indexOf('function wh38IncomingHeader(o)'),ui.indexOf('function wh38List(orders,kind)'));
test('incoming header has four equal cells with customer and metadata in one row',()=>{
 assert.equal((helper.match(/class="wh38-incoming-cell/g)||[]).length,4);
 assert(helper.includes("o.orderType==='STORE'?'فروشگاه':'مشتری'"));
 for(const label of ['اقلام','ثبت','آخرین اقدام'])assert(helper.includes(`<b>${label}</b>`));
 assert.match(css,/\.wh38-incoming-summary \{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.wh38-incoming-cell \{[\s\S]*?height:44px!important/);
 assert.match(css,/\.wh38-incoming-summary-scroll \{[\s\S]*?overflow-x:auto!important/);
});
test('compact order header is shared by incoming and preparing, preserving both actions',()=>{
 const list=ui.slice(ui.indexOf('function wh38List(orders,kind)'),ui.indexOf('async function wh38Paint(phase)'));
 assert.match(list,/order-compact-row/);assert.match(list,/data-action="wh38-order-details"/);
 assert.doesNotMatch(list,/class="wh38-meta"/);
 assert.doesNotMatch(list,/data-action="wh38-accept"/);assert.match(list,/data-action="wh38-start"/);
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
