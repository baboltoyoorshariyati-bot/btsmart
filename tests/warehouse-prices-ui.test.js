'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('کارتابل انبار سربرگ سوابق و گزارش دارد و گزارش قابل چاپ است', () => {
  const ui = read('public/ui2.js');
  const app = read('public/app.js');
  const orders = read('lib/routes/orders.js');
  assert.match(ui, /data-wh38-tab="history"/);
  assert.match(ui, /سوابق و گزارش/);
  assert.match(app, /async function renderWarehouseHistory\(\)/);
  assert.match(app, /function printWarehouseHistory\(\)/);
  assert.match(app, /data-action="wh-history-print"/);
  assert.match(app, /data-action="wh-history-range"/);
  assert.match(app, /'\/api\/warehouse\/history\?'\+params\.toString\(\)/);
  assert.match(orders, /route\('GET', '\/api\/warehouse\/history', \{ roles: \['admin', 'warehouse'\] \}/);
  assert.match(orders, /warehouseCompletedAt/);
  assert.match(orders, /summary: \{ orders: rows\.length, itemCount, outOfStock, deliveredKg/);
});

test('واحد فروش می‌تواند صفحهٔ قیمت محصولات را از مسیر مجاز باز کند', () => {
  const core = read('lib/routes/core.js');
  const app = read('public/app.js');
  const ui = read('public/ui2.js');
  assert.match(core, /route\('POST', '\/api\/admin\/prices', \{ roles: \['admin', 'sales'\]/);
  const admin=read('public/admin-ui.js');
  assert.match(admin, /async function renderProductsPage\(\)/);
  assert.match(admin, /api\('\/api\/admin\/prices'/);
  assert.match(app, /const productsOk=page==='products'&&r==='sales'/);
  assert.match(app, /if\(r==='sales'\).*await renderProductsPage\(\)/);
  assert.doesNotMatch(ui, /function renderNav\(/);
});

test('متن «عملیات یکپارچه» از کنار لوگو حذف شده و متن فرم‌ها وسط کلمه نمی‌شکند', () => {
  const html = read('public/index.html');
  const css = read('public/design.css');
  const mobile = read('public/mobile.css');
  assert.doesNotMatch(html, /عملیات یکپارچه/);
  assert.match(html, /<div class="rail-brand"><strong>بابل طیور<\/strong><\/div>/);
  // عنوان و توضیح کارت‌ها زیر هم و بدون شکستن کلمات
  assert.match(css, /\.sd-head-main\{flex-wrap:wrap\}/);
  assert.match(css, /\.sd-head-main>h2,\.sd-head-main>p\{flex:1 1 100%;min-width:0;overflow-wrap:normal;word-break:normal\}/);
  // لایه سازگاری موبایل/تبلت
  assert.match(mobile, /v37\.2\.18/);
  assert.match(mobile, /#appView #railNav \.nav-label \{[^}]*overflow-wrap: normal !important/);
  assert.match(mobile, /grid-template-columns: 1fr !important/);
  assert.match(mobile, /overflow-x: auto !important/);
});
