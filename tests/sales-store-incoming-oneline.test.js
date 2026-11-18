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

test('کارت فشرده است و همهٔ دکمه‌ها در عرض محدود قابل چیدمان‌اند', () => {
  assert.match(view, /class="[^"]*ssin21-card/);
  assert.match(view, /class="ssin21-actions order-summary-cell order-summary-actions"/);
  for (const a of ['store-order-details-v25', 'sales-edit-store-order', 'store-approve-v25', 'store-quick-send-v40'])
    assert.ok(view.includes(`data-action="${a}"`), `دکمهٔ ${a} در کارت نیست`);
  const css = read('public/compatibility.css');
  const seg = css;
  assert.match(seg, /\.ssin21-card\.sd-store-card-v42\{display:flex;flex-direction:row;align-items:center;flex-wrap:nowrap/);
  assert.match(seg, /min-height:52px/, 'ارتفاع کارت باید کم باشد');
  assert.match(seg, /\.ssin21-card\.sd-store-card-v42,[\s\S]*?min-width:0;max-width:100%;box-sizing:border-box;flex-wrap:wrap/, 'کارت باید در فضای محدود شکسته شود');
});

test('نام فروشگاه مشخص است و زیر آن نام مشتری همان سفارش نمایش داده می‌شود', () => {
  const idBlock = view.slice(view.indexOf('sd-store-identity-v42'), view.indexOf('ssin21-actions'));
  assert.match(idBlock, /<h3>\$\{esc\(o\.storeName\|\|'فروشگاه'\)\}<\/h3>/, 'نام فروشگاه تیتر کارت نیست');
  assert.match(idBlock, /ssin21-customer">مشتری: \$\{esc\(o\.customer\?\.name\|\|'—'\)\}/, 'نام مشتری زیر نام فروشگاه نیست');
  assert.ok(idBlock.indexOf('o.storeName') < idBlock.indexOf('o.customer?.name'), 'مشتری باید زیر نام فروشگاه بیاید');
  // ترتیب مشخصات در خط: نام فروشگاه ← شمارهٔ سفارش ← تاریخ ← تعداد اقلام
  const seq = ['o.storeName', 'شماره سفارش', 'o.orderNo', 'تاریخ', 'o.createdAt', 'activeItemsOf(o).length'];
  let pos = -1;
  for (const token of seq) {
    const i = view.indexOf(token, pos + 1);
    assert.ok(i > pos, `ترتیب مشخصات کارت به‌هم ریخته است: ${token}`);
    pos = i;
  }
});
