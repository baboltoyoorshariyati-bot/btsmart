'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('public/ui2.js'),css=read('public/theme.css'),compat=read('public/compatibility.css');

test('انبار > فروشگاه‌ها: چهار سربرگ و فقط پنل فعال؛ سوابق سفارش‌های ثبت‌شده در تب سوم',()=>{
  const paint=ui.slice(ui.indexOf('async function wh38Paint(phase)'),ui.indexOf('function wh38Shell(phase)'));
  assert.match(paint,/phase==='stores'/);
  assert.match(paint,/\['incoming','preparing','history','transfers'\]\.includes\(app\.wh38\.storeTab\)/);
  assert.match(paint,/wh38StoreTabs\(active,counts\)/);
  assert.match(paint,/data-wh38-store-panel="\$\{active\}"/);
  assert.match(paint,/rows\.length\?wh38StoreList\(rows,active\):empty/);
  assert.match(paint,/renderWhStoreHistory\(\)/);
  assert.doesNotMatch(paint,/wh38-section-subtitle|incomingList\+preparingList/);
  const tabs=ui.slice(ui.indexOf('function wh38StoreTabs'),ui.indexOf('function wh38StoreHeader'));
  assert.deepEqual([...tabs.matchAll(/\['(incoming|preparing|history)','([^']+)'\]/g)].map(x=>x[2]),['ورودی','آماده‌سازی و سرویس‌ها','سوابق سفارش‌های ثبت‌شده']);
  assert.match(tabs,/data-wh38-store-tab="\$\{id\}"/);
  assert.doesNotMatch(tabs,/wh-store-doc-shortcut|data-wh-store-docs-link/);
  assert.doesNotMatch(ui,/data-wh-store-docs-link/);
  assert.match(ui,/renderWhStoreDocuments\(\);/,'فهرست اسناد در تب سوابق باقی می‌ماند');
  assert.match(ui,/e\.target\.closest\('\[data-wh38-store-tab\]'\)/);
  assert.match(ui,/app\.wh38\.storeTab=\['incoming','preparing','history','transfers'\]\.includes\(st\.dataset\.wh38StoreTab\)\?st\.dataset\.wh38StoreTab:'incoming'; wh38Paint\('stores'\)/);
  assert.match(css,/\.wh38-store-tabs\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(compat,/\.wh38-store-table\{width:100%;table-layout:fixed/);
  assert.match(compat,/\.wh38-store-table td::before\{content:attr\(data-label\)/);
  assert.match(ui,/app\.wh38 = app\.wh38 \|\| \{ phase:'incoming', timer:null, storeTab:'incoming' \}/);
});

test('سربرگ خلاصهٔ سرویس فروشگاه تک‌خطی و ایمن است و اقلام لغوشده را نمی‌شمارد',()=>{
  const header=ui.slice(ui.indexOf('function wh38StoreHeader(o)'),ui.indexOf('function wh38StoreList(orders,kind)'));
  assert.match(header,/class="wh38-store-head"/);
  assert.match(header,/orderNo/);
  assert.match(header,/activeItemsOf\(o\)\.length/);
  assert.match(header,/formatDateTime24\(o\.createdAt\)/);
  assert.match(header,/آخرین اقدام/);
  assert.match(header,/title="\$\{esc\(tip\)\}"/);
  assert.match(css,/\.wh38-store-head\{display:flex;align-items:center;[^}]*min-height:26px/);
  assert.match(css,/\.wh38-store-name\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css,/\.wh38-store-card\{[^}]*padding:8px 11px/);
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const c={esc,fa:v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),qty:String,
    storeAwareOrderName:o=>o?.orderType==='STORE'?(o.storeName||'فروشگاه'):(o?.customer?.name||'—'),
    activeItemsOf:o=>(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED'),
    formatDateTime24:s=>s||'—',badge:()=>'[badge]'};
  vm.createContext(c);vm.runInContext(header,c);
  const html=c.wh38StoreHeader({orderType:'STORE',storeName:'<img "x">',orderNo:'B410001',createdAt:'2026-10-14T08:30',dispatchPlace:'بابل',items:[{},{itemStatus:'CANCELLED'}]});
  assert(!html.includes('<img')); assert(html.includes('&lt;img &quot;x&quot;&gt;'));
  assert.match(html,/1 قلم/); assert.match(html,/بابل/);
});

test('فهرست ورودی و آماده‌سازی فروشگاه‌ها جدول است، اما برگهٔ سرویس همچنان همان سربرگ خلاصه را دارد',()=>{
  const list=ui.slice(ui.indexOf('function wh38StoreList(orders,kind)'),ui.indexOf('async function wh38StoreDetails'));
  assert.match(list,/class="wh38-store-table/);
  assert.match(list,/data-action="wh38-store-details"/);
  assert.match(list,/data-action="wh38-start"/);
  assert.match(list,/data-label="اقلام"/);
  assert.doesNotMatch(list,/\$\{wh38StoreHeader\(o\)\}/);
  const sheet=ui.slice(ui.indexOf('function sr38Sheet(o)'),ui.indexOf('async function sr38Post'));
  assert.match(sheet,/wh38-store-sheet-head">\$\{wh38StoreHeader\(o\)\}/);
  assert.doesNotMatch(sheet,/orderCustomerStripHtml\(o\)/);
  assert.match(ui,/a==='sr38-back'\)\{ if\(app\.wh38\.phase==='stores'\)\{app\.wh38\.storeTab='preparing'; wh38Shell\('stores'\);\}else wh38Shell\('preparing'\); \}/);
  const accept=ui.slice(ui.indexOf("if(a==='wh38-accept')"),ui.indexOf("else if(a==='wh38-start')"));
  assert.match(accept,/app\.wh38\.phase==='incoming'\)wh38Shell\('incoming'\)/);
  assert.match(accept,/app\.wh38\.phase==='stores'\)wh38Paint\('stores'\)/);
});
