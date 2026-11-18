'use strict';
/* v37.17.0/v37.33.0 — فاکتور مستقل هر سرویس، وزن همان سرویس در فروش، ردیف تک‌خطی برگهٔ انبار */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app = read('public/app.js'), ui = read('public/ui2.js'), dsp = read('public/dispatch-ui.js');
const dispatchLib = read('lib/dispatch.js'), ordersRoute = read('lib/routes/orders.js');
const runsRoute = read('lib/routes/store-runs.js'), compat = read('public/compatibility.css');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

function invoiceCtx(src, endMarker) {
  const c = { esc, fa, qty: fa, money: fa, n: (v) => Number(v) || 0, icon: () => '', badge: () => '', dt: (s) => s, formatDateTime24: (v) => v, todayText: () => '', dateLabel: (s) => s };
  vm.createContext(c);
  const h = src.indexOf('function storeRunInvoiceLines');
  const f = src.indexOf('function invoiceHtml(o,paySel)');
  const e = src.indexOf(endMarker, f);
  vm.runInContext(src.slice(h, e), c);
  return c;
}
const storeOrder = () => ({
  orderType: 'STORE', storeName: 'فروشگاه تست', dispatchPlace: 'بابل', orderNo: '410001', createdAt: '2026-10-18T08:00',
  items: [
    { id: 'a', itemStatus: 'DELIVERED', deliveredKg: 999, product: { name: 'مرغ الف' }, runR1: [{ kg: 50 }], runR2: [] },
    { id: 'b', itemStatus: 'DELIVERED', deliveredKg: 888, product: { name: 'مرغ ب' }, runR1: [], runR2: [{ kg: 30 }] },
  ],
  payment: { invoiceNumber: 'INV1', deliveryRun: 1 },
  payments: [{ invoiceNumber: 'INV1', deliveryRun: 1 }, { invoiceNumber: 'INV2', deliveryRun: 2 }],
});

for (const [name, src, endMarker] of [['app.js', app, '\nfunction printCss'], ['ui2.js', ui, '\nasync function printInvoice']]) {
  test(`سند هر سرویس فقط اقلام همان سرویس را نشان می‌دهد (${name})`, () => {
    const c = invoiceCtx(src, endMarker);
    const o = storeOrder();
    const h2 = c.invoiceHtml(o, { invoiceNumber: 'INV2', deliveryRun: 2, verifiedAt: '2026-10-18T12:00' });
    assert(h2.includes('مرغ ب'), 'قلم سرویس دوم هست');
    assert(!h2.includes('مرغ الف'), 'قلم سرویس اول در سند دوم نیست');
    assert(!h2.includes(fa('888')), 'وزن کل قلم نمایش داده نمی‌شود');
    assert(h2.includes(fa('30')), 'فقط وزن سرویس دوم');
    const h1 = c.invoiceHtml(o, { invoiceNumber: 'INV1', deliveryRun: 1, verifiedAt: '2026-10-18T09:00' });
    assert(h1.includes('مرغ الف')); assert(!h1.includes('مرغ ب')); assert(h1.includes(fa('50')));
  });
}

test('انتخاب سند سرویس: برای سرویسِ بدون سند، سند سرویس دیگر جایگزین نمی‌شود', () => {
  assert.match(app, /return hit\|\|null/);
  assert.match(app, /سند این سرویس هنوز صادر نشده است/);
  assert.match(ui, /async function printInvoice\(id,run\)\{return openInvoicePrint\(id,run\)\}/);
});

test('سمت سرور: نمای محموله و تسویهٔ یکجا، محدودهٔ هر سرویس را قفل می‌کنند', () => {
  assert.match(dispatchLib, /v37\.17\.0 — نمای هر محموله فقط اقلام همان سرویس/);
  assert.match(dispatchLib, /payment\.deliveryRun = run/);
  assert.match(ordersRoute, /فاکتور سفارش فروشگاه برای هر سرویس جداگانه صادر می‌شود/);
});

test('کارتابل فروش: وزن نمایشی هر سرویس فقط وزن همان سرویس و ماندهٔ سرویس دوم است', () => {
  // مسیر سرور: deliveredKg از وزن همان سرویس پر می‌شود، نه مجموع دو سرویس
  assert.match(runsRoute, /const serviceKg = run === 2 \? SR\.r2Kg\(i\) : SR\.r1Kg\(i\)/);
  assert.match(runsRoute, /deliveredKg: serviceKg/);
  assert.match(runsRoute, /plannedRunKg/);
  assert.doesNotMatch(runsRoute, /deliveredKg: SR\.runTotalKg\(i\)/);
  // پنل فروش هر دو مقدار را جدا نشان می‌دهد
  const c = { esc, fa, qty: fa, icon: () => '', formatDateTime24: (v) => v || '' };
  vm.createContext(c);
  const a = ui.indexOf('function renderStoreRunShipmentsPanel');
  const b = ui.indexOf('\nfunction ', a + 10);
  vm.runInContext(ui.slice(a, b), c);
  const html = c.renderStoreRunShipmentsPanel([{ orderId: 'o', orderNo: '9', storeName: 'فروشگاه تست', run: 2, sentAt: '2026-10-18T12:00', items: [{ productName: 'مرغ', requestedQty: 100, serviceKg: 40, previousRunKg: 60, plannedRunKg: 40, deliveredKg: 40 }] }]);
  assert(html.includes('سرویس دوم'));assert(html.includes('وزن سرویس'));
  assert(html.includes(fa('40')), 'وزن سرویس دوم');
  assert(ui.includes('ماندهٔ سرویس دوم'), 'ماندهٔ هر قلم در مودال جزئیات در دسترس است');
  assert(!html.includes(fa('100')), 'جمع دو سرویس (۱۰۰) نمایش داده نمی‌شود');
});

test('فرم تحویل/پخش: اقلام محدود به همان محموله‌اند', () => {
  assert.match(dsp, /function dspScopedItems\(o\)/);
  assert.match(dsp, /const items = dspScopedItems\(o\); \/\/ v37\.17\.0 — فرم تحویل فقط اقلام همین محموله/);
  const c = { esc, fa, qty: fa, money: fa, icon: () => '', dspKg: (v) => fa(v) + ' کیلو' };
  vm.createContext(c);
  const a = dsp.indexOf('function dspScopedItems');
  const b = dsp.indexOf('function dspItems', a);
  const d = dsp.indexOf('function dspQtyInvoiceMarkup');
  const e = dsp.indexOf('async function dspOrderDetails', d);
  vm.runInContext(dsp.slice(a, b) + '\n' + dsp.slice(d, e), c);
  const o = { dispatch: { run: 2, shipmentItemIds: ['b'], shipmentWeights: { b: 30 } }, items: storeOrder().items };
  const html = c.dspQtyInvoiceMarkup(o);
  assert(html.includes('مرغ ب')); assert(!html.includes('مرغ الف')); assert(!html.includes(fa('888')));
});

test('برگهٔ سرویس‌های انبار: هر ردیف تک‌خطی و کم‌ارتفاع، دکمه‌های ارسال در یک خط', () => {
  const sheet = ui.slice(ui.indexOf('function sr38Sheet(o)'), ui.indexOf('async function sr38Post'));
  assert.match(sheet, /data-sr318-group="\$\{run\}"/);
  assert.match(sheet, /sr318-sendline">\$\{sr38SendBtn\(o,1,sr\.items\)\}\$\{sr38SendBtn\(o,2,sr\.items\)\}/, 'هر دو دکمهٔ ارسال در یک خط');
  assert.match(sheet, /class="sr38-ops sr318-ops"/, 'کنترل‌های هر ردیف در یک محفظهٔ خطی');
  assert.match(sheet, /data-sr38-weight/);
  assert.doesNotMatch(sheet, /data-sr38-decision|تصمیم پایان روز/, 'تصمیم پایان روز از برگهٔ سرویس حذف شده است (v37.33.0)');
  assert.match(sheet, /wh38-store-sheet-head">\$\{wh38StoreHeader\(o\)\}/);
  assert.doesNotMatch(sheet, /orderCustomerStripHtml\(o\)|sr38Chips\(o\)|wh38-note/);
  // CSS تک‌خطی: فلکس بدون wrap، ارتفاع کم، دکمه‌های ۳۰px
  assert.match(compat, /\.sr318-row\{display:flex!important;flex-wrap:nowrap/);
  assert.match(compat, /\.sr318-row\{[^}]*min-height:40px/);
  assert.match(compat, /\.sr318-ops \.btn\{height:30px/);
  assert.match(compat, /\.sr318-sendline\{display:flex;flex-wrap:nowrap/);
  assert.match(compat, /\.sr318-rows\{[^}]*overflow-x:auto/, 'در صفحهٔ باریک ردیف به‌جای شکستن، افقی پیمایش می‌شود');
});
