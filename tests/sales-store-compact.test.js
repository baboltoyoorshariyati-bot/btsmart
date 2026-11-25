const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/ui2.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/theme.css'), 'utf8');

test('تب فروشگاه فروش، جدول فروشگاه دارد و جزئیات را جداگانه باز می‌کند', () => {
  const start = ui.indexOf('function renderSalesStoresV41');
  const end = ui.indexOf('/* ---------- تب ۳:', start);
  assert.ok(start >= 0 && end > start);
  const view = ui.slice(start, end);
  // جدول bt-table: نام فروشگاه ← شماره سفارش ← تاریخ ← وضعیت ← اقلام ← عملیات
  assert.match(view, /class="bt-table sd-store-table"/);
  assert.match(view, /data-label="فروشگاه"[\s\S]*?o\.storeName[\s\S]*?data-label="شماره سفارش"[\s\S]*?o\.orderNo[\s\S]*?data-label="تاریخ"[\s\S]*?o\.createdAt/);
  assert.match(view, /data-action="store-order-details-v25"/);
  assert.doesNotMatch(view, /sd-store-summary-v41|sdStoreTotalsLine\(o\)|sdStoreInvoiceChips\(o\)/);
  assert.match(app, /if\(a==='store-order-details-v25'\)return openOrderDetails\(el\.dataset\.id,\{storeProcessing:/);
  assert.match(css, /sales-store-pane-v42 \.sd-store-identity-v42\{display:flex;flex-direction:column/);
});

test('منوی سفارش‌های فروشگاه چهار سربرگ افقی با ترتیب مشخص و محتوای مستقل دارد', () => {
  const start = ui.indexOf('function renderSalesStoresV41');
  const end = ui.indexOf('/* ---------- تب ۳:', start);
  const view = ui.slice(start, end);
  const names = [...view.matchAll(/\['(incoming|processing|approved|history)','([^']+)'/g)].map(x => x[2]);
  assert.deepEqual(names, ['ورودی', 'در جریان', 'تأیید شده', 'سوابق']);
  assert.match(view, /data-store-section="\$\{id\}"/);
  assert.match(view, /panel\('incoming'/);
  assert.match(view, /panel\('processing'/);
  assert.match(view, /panel\('approved'/);
  assert.match(view, /panel\('history'/);
  assert.match(app, /data-store-subtab/);
  assert.match(app, /p\.hidden=p\.dataset\.storeSection!==app\.salesStoreTab/);
  assert.match(css, /sales-store-tabs-v43\{position:static;display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});
