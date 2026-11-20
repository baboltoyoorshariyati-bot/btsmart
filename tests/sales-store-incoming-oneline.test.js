'use strict';
/* v37.33.0 — کارت ورودی سفارش فروشگاه در کارتابل فروش تک‌خطی و کم‌ارتفاع است؛
   نام فروشگاه مشخص است و زیر آن نام مشتری نمایش داده می‌شود. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const view = (() => {
  const ui = read('public/ui2.js');
  const start = ui.indexOf('function renderSalesStoresV41');
  const end = ui.indexOf('/* ---------- تب ۳', start);
  assert.ok(start >= 0 && end > start);
  return ui.slice(start, end);
})();

test('جدول فشرده است و همهٔ دکمه‌ها در ستون عملیات قابل چیدمان‌اند', () => {
  assert.match(view, /class="bt-table sd-store-table"/);
  assert.match(view, /data-label="عملیات" class="bt-col-actions"/);
  for (const a of ['store-order-details-v25', 'sales-edit-store-order', 'store-approve-v25', 'store-quick-send-v40'])
    assert.ok(view.includes(`data-action="${a}"`), `دکمهٔ ${a} در جدول نیست`);
  // جدول از الگوی bt-table پیروی می‌کند: thead هرگز حذف نمی‌شود و هر td دارای data-label است
  assert.match(view, /<thead><tr><th>فروشگاه<\/th><th>شماره سفارش<\/th><th>تاریخ<\/th><th>وضعیت<\/th><th>اقلام<\/th><th>عملیات<\/th><\/tr><\/thead>/);
  assert.match(view, /data-label="فروشگاه"/);
  assert.match(view, /data-label="شماره سفارش"/);
  assert.match(view, /data-label="تاریخ"/);
  assert.match(view, /data-label="وضعیت"/);
  assert.match(view, /data-label="اقلام"/);
  const seg = read('public/compatibility.css');
  assert.match(seg, /\.ssin21-card\.sd-store-card-v42\{display:flex;flex-direction:row;align-items:center;flex-wrap:nowrap/);
  assert.match(seg, /min-height:52px/, 'ارتفاع کارت باید کم باشد');
  assert.match(seg, /\.ssin21-card\.sd-store-card-v42,[\s\S]*?min-width:0;max-width:100%;box-sizing:border-box;flex-wrap:wrap/, 'کارت باید در فضای محدود شکسته شود');
});

test('نام فروشگاه مشخص است و زیر آن نام مشتری همان سفارش نمایش داده می‌شود', () => {
  // سلول فروشگاه جدول: نام فروشگاه (bt-cell-main) و زیر آن نام مشتری (bt-cell-sub)
  const idBlock = view.slice(view.indexOf('data-label="فروشگاه"'), view.indexOf('data-label="شماره سفارش"'));
  assert.match(idBlock, /bt-cell-main">\$\{esc\(o\.storeName\|\|'فروشگاه'\)\}/, 'نام فروشگاه سلول اصلی جدول نیست');
  assert.match(idBlock, /\$\{customerSub\?\` · \$\{customerSub\}`:''\}/, 'نام مشتری زیر نام فروشگاه نیست');
  assert.match(view, /customerSub=o\.storeOrderKind==='PARTIAL'&&o\.storePurpose==='STOCK'\?'تأمین تکمیلی فروشگاه':o\.customer\?\.name\?\`مشتری: \$\{esc\(o\.customer\?\.name\|\|'—'\)\}\`:'';/, 'نام مشتری همان سفارش نیست');
  assert.ok(idBlock.indexOf('o.storeName') < idBlock.indexOf('customerSub'), 'مشتری باید زیر نام فروشگاه بیاید');
  // ترتیب ستون‌های جدول: فروشگاه ← شمارهٔ سفارش ← تاریخ ← وضعیت ← اقلام ← عملیات
  const seq = ['data-label="فروشگاه"', 'o.storeName', 'data-label="شماره سفارش"', 'o.orderNo', 'data-label="تاریخ"', 'o.createdAt', 'data-label="وضعیت"', 'data-label="اقلام"', 'activeItemsOf(o).length', 'data-label="عملیات"'];
  let pos = -1;
  for (const token of seq) {
    const i = view.indexOf(token, pos + 1);
    assert.ok(i > pos, `ترتیب ستون‌های جدول به‌هم ریخته است: ${token}`);
    pos = i;
  }
});
