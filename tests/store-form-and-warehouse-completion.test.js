'use strict';
/* v37.33.0 — پهنای کادرهای فرم سفارش فروشگاه + علت باقی‌ماندن سفارش تکمیل‌شده در انبار */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const compat = read('public/compatibility.css'), ui = read('public/ui2.js'), core = read('lib/routes/core.js');

test('فرم ثبت سفارش فروشگاه: محصول/مقدار/واحد کشیده‌تر و توضیحات کوتاه‌تر', () => {
  assert.match(compat, /\.cell-product\{flex:0 1 250px;min-width:180px\}/);
  assert.match(compat, /\.cell-qty\{flex:0 0 88px\}/);
  assert.match(compat, /\.cell-unit\{flex:0 0 112px\}/);
  // توضیحات سقف دارد و مثل قبل همهٔ فضای باقی‌مانده را نمی‌گیرد
  assert.match(compat, /\.cell-desc\{flex:0 1 190px;min-width:80px\}/);
  assert.doesNotMatch(compat, /\.sd-line-compact \.cell-desc\{flex:1 1 auto/);
});

test('پایان کار انبار خودکار است و دکمه دستی نمایش داده نمی‌شود', () => {
  const sheet=ui.slice(ui.indexOf('function sr38Sheet(o)'),ui.indexOf('async function sr38Post'));
  assert.doesNotMatch(sheet,/data-action="sr38-finalize"/);
  assert.match(sheet,/data-action="sr38-reopen"/);
});

test('سفارش پایان‌یافتهٔ انبار در فهرست و شمارندهٔ آماده‌سازی فروشگاه نمی‌ماند', () => {
  const paint = ui.slice(ui.indexOf("if(phase==='stores')"), ui.indexOf('const status=phase==='));
  assert.match(paint, /o\.orderType==='STORE'&&!\(o\.storeRunOps&&o\.storeRunOps\.finalizedAt\)/);
  assert.match(fs.readFileSync('lib/workload-queues.js','utf8'), /WAREHOUSE_PREPARING'&&!o\.storeRunOps\?\.finalizedAt/);
});
