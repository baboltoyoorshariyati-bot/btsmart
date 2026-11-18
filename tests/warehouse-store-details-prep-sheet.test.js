'use strict';
/* Store order details, responsive queue tables and standard preparation sheets. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ui = read('public/ui2.js');
const compat = read('public/compatibility.css');
const details = ui.slice(ui.indexOf('async function wh38StoreDetails'), ui.indexOf('async function wh38AcceptFromDetails'));
const list = ui.slice(ui.indexOf('function wh38StoreList(orders,kind)'), ui.indexOf('async function wh38StoreDetails'));
const sheet = ui.slice(ui.indexOf('function sr38Sheet(o)'), ui.indexOf('async function sr38Post'));

test('ردیف جزئیات: محصول، مقدار، واحد و توضیحات در کادرهای جدا و هم‌اندازه', () => {
  assert.match(details, /class="whd23-list whd35-list"/);
  assert.match(details, /whd35-headrow"[^>]*><span><\/span><span>محصول<\/span><span>مقدار<\/span><span>واحد<\/span><span>توضیحات<\/span>/);
  assert.match(details, /class="whd23-box whd23-product"><b title=/);
  assert.match(details, /class="whd23-box"><b>\$\{qty\(it\.requestedQty\)\}<\/b>/);
  assert.match(details, /class="whd23-box whd23-desc"><b title=/);
  assert.doesNotMatch(details, /<label>محصول<\/label>/);
  assert.doesNotMatch(details, /detail-item-row|detail-modal-grid/);
  assert.match(compat, /\.whd23-row\{display:grid;grid-template-columns:28px 1\.5fr \.55fr \.55fr 1\.5fr;[^}]*align-items:stretch/);
  assert.match(compat, /\.whd23-box\{[^}]*border:1px solid[^}]*border-radius:10px[^}]*min-height:46px/);
  assert.match(compat, /\.whd35-list \.whd23-box\{min-height:33px/);
});

test('صف‌های ورودی و آماده‌سازی فروشگاه‌ها با ستون‌های جدول و اقدام مرحله‌ای نمایش داده می‌شوند', () => {
  assert.match(list, /const store=String\(o\.storeName\|\|'فروشگاه'\)/);
  assert.match(list, /o\.customer\?\.name/);
  assert.match(list, /class="wh38-store-table/);
  assert.match(list, /<th>فروشگاه \/ مشتری<\/th>/);
  assert.match(list, /<th>شماره سفارش<\/th>/);
  assert.match(list, /<th>نوع سفارش<\/th>/);
  assert.match(list, /<th>تاریخ ثبت<\/th>/);
  assert.match(list, /<th>وضعیت<\/th>/);
  assert.match(list, /<th>محل ارسال<\/th>/);
  assert.match(list, /<th>اقلام<\/th>/);
  assert.match(list, /qty\(activeItemsOf\(o\)\.length\)\} قلم/);
  assert.match(list, /data-action="wh38-store-details"/);
  assert.match(list, /data-action="wh38-start"/);
  assert.match(list, /جزئیات آماده‌سازی/);
  assert.doesNotMatch(list, /whsin22-card|whprep23-count|sr38Chips\(o\)/);
  assert.match(compat, /\.wh38-store-table\{width:100%;table-layout:fixed/);
  assert.match(compat, /@media\(max-width:900px\)[\s\S]*?\.wh38-store-table td::before\{content:attr\(data-label\)/);
  assert.match(compat, /@media\(max-width:480px\)[\s\S]*?\.wh38-store-table tbody tr\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(ui, /else if\(a==='wh38-start'\)[\s\S]*?\/warehouse\/start-preparing/);
  assert.match(ui, /if\(r\.order&&r\.order\.storeRun&&r\.order\.storeRun\.enabled\) sr38Sheet\(r\.order\); else wh38Sheet\(r\.order\);/);
});

test('برگهٔ سرویس همچنان سربرگ خلاصه دارد و رفتار تکمیل و ثبت وزن را نگه می‌دارد', () => {
  assert.match(sheet, /wh38-store-sheet-head">\$\{wh38StoreHeader\(o\)\}/);
  assert.doesNotMatch(sheet, /orderCustomerStripHtml\(o\)/);
  assert.doesNotMatch(sheet, /data-sr38-decision|تصمیم پایان روز/);
  assert.match(sheet, /data-action="sr38-complete"[^>]*>[\s\S]*?تکمیل محصول/);
  assert.match(sheet, /data-action="sr38-weight"/);
  assert.doesNotMatch(sheet, /data-action="sr38-finalize"|پایان عملیات ارسال امروز/);
  assert.match(sheet, /data-action="sr38-reopen"/);
  assert.match(compat, /\.sr318-row\{min-width:0;width:100%/);
  assert.match(compat, /\.sr318-ops \.btn\{height:30px;min-height:30px!important/);
  assert.match(compat, /\.sr318-wbox input\{width:58px/);
});
