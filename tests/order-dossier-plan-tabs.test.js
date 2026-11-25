'use strict';
/* v37.50.0 — چهار درخواست کاربر:
   ۱) سربرگ «سفارشات» ترابری به «ورودی» و «تخصیص‌یافته» تفکیک شود.
   ۲) متن سربرگ سند چاپی انبار بزرگ‌تر شود.
   ۳) جزئیات سابقهٔ سفارش در کارتابل انبار کامل باشد (نوع، مشتری، ثبت، وزن‌کشی، کاربر هر مرحله).
   ۴) مدیر بتواند پروندهٔ کامل سفارش را از کارتابل خودش باز کند. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function planContext() {
  const source = read('public/dispatch-ui.js');
  const code = source.slice(source.indexOf('function transportPlanRows('));
  const ctx = vm.createContext({ esc, fa: (x) => x, qty: String, formatDateTime24: (x) => x || '—', storeAwareOrderName: (o) => o.customerName || '—' });
  const app = read('public/app.js');
  vm.runInContext(app.slice(app.indexOf('function orderSummaryRow('), app.indexOf('\nconst app =')), ctx);
  vm.runInContext(code, ctx);
  return { ctx, source };
}

const planOrders = () => [
  { id: 'o1', orderNo: '101', customerName: 'مشتری بدون راننده', services: [{ run: 1, assignment: null }] },
  {
    id: 'o2',
    orderNo: '102',
    customerName: 'مشتری تخصیص‌یافته',
    services: [
      { run: 1, assignment: { driverId: 'd1', driverName: 'رضا', vehicleType: 'وانت', vehiclePlate: '11223344' }, handedOver: true },
      { run: 2, assignment: { driverId: 'd1', driverName: 'رضا', vehicleType: 'وانت', vehiclePlate: '11223344' }, canDepart: true },
    ],
  },
];

test('کارتابل ترابری سفارش‌های «ورودی» را از «تخصیص‌یافته» جدا نشان می‌دهد', () => {
  const { ctx, source } = planContext();
  const incoming = ctx.transportPlanRows(planOrders(), 'incoming');
  const assigned = ctx.transportPlanRows(planOrders(), 'assigned');
  assert.match(incoming, /data-id="o1"/);
  assert.doesNotMatch(incoming, /data-id="o2"/, 'سفارش تخصیص‌یافته نباید در ورودی بیاید');
  assert.match(incoming, /راننده: تعیین نشده/);
  assert.equal((assigned.match(/data-tp="details"/g) || []).length, 2);
  assert.doesNotMatch(assigned, /data-id="o1"/, 'سفارش بدون راننده نباید در تخصیص‌یافته بیاید');
  assert.match(assigned, /راننده: رضا/);
  assert.match(assigned, /در انتظار تخصیص راننده|تخصیص‌یافته/, 'برچسب وضعیت باید در دسترس باشد');
  // سربرگ‌ها و شمارش‌ها در رندر واقعی صفحه
  assert.match(source, /data-tp="plan-tab" data-tab="\$\{key\}"/);
  assert.match(source, /\['incoming','ورودی'/);
  assert.match(source, /\['assigned','تخصیص‌یافته \(سوابق\)'/);
  assert.match(source, /dsp\.planTab=\['assigned','active'\]\.includes\(b\.dataset\.tab\)\?b\.dataset\.tab:'incoming'/);
  assert.match(source, /#tpPlanPanel|tpPlanPanel/);
});

test('رندر واقعی کارتابل ترابری دو سربرگ «ورودی» و «تخصیص‌یافته» می‌سازد و با کلیک جابه‌جا می‌شود', async () => {
  const source = read('public/dispatch-ui.js');
  const code = source.slice(source.indexOf('function transportPlanRows('));
  const orders = planOrders();
  const host = { innerHTML: '', onClick: null };
  const app = read('public/app.js');
  const listens = [];
  host.addEventListener = (type, fn) => listens.push([type, fn]);
  host.querySelector = () => null;
  const ctx = vm.createContext({
    esc, fa: (x) => x, qty: String, formatDateTime24: (x) => x || '—', storeAwareOrderName: (o) => o.customerName || '—',
    $: (sel) => (sel === '#transportPlans' ? host : null),
    api: async (url) => {
      if (url === '/api/transport/capabilities') return { experimentalWorkflow: true };
      if (url === '/api/transport/plans') return { orders };
      if (url === '/api/transport/resources') return { drivers: [], vehicles: [] };
      throw new Error('unexpected ' + url);
    },
    dsp: { planTab: 'incoming' },
  });
  vm.runInContext(app.slice(app.indexOf('function orderSummaryRow('), app.indexOf('\nconst app =')), ctx);
  vm.runInContext(code, ctx);
  await ctx.renderTransportPlanQueue();
  const first = host.innerHTML;
  assert.match(first, /data-tp="plan-tab" data-tab="incoming"/);
  assert.match(first, /data-tp="plan-tab" data-tab="assigned"/);
  assert.match(first, /ورودی/);
  assert.match(first, /تخصیص‌یافته/);
  assert.match(first, /data-id="o1"/, 'سفارش بدون راننده در سربرگ ورودی است');
  assert.doesNotMatch(first, /data-id="o2"/);
  assert.match(first, /role="tab"/);
  // کلیک روی سربرگ «تخصیص‌یافته» همان فهرست را با سفارش تخصیص‌یافته بازمی‌سازد.
  ctx.dsp.planTab = 'assigned';
  await ctx.renderTransportPlanQueue();
  assert.match(host.innerHTML, /data-id="o2"/);
  assert.doesNotMatch(host.innerHTML, /data-id="o1"/);
  assert.match(host.innerHTML, /tpPlanPanel/);
});

test('کارتابل ترابری «سفارشات» را از صفحهٔ راننده جدا نگه می‌دارد و تب‌های صفحهٔ پخش دست‌نخورده است', () => {
  const source = read('public/dispatch-ui.js');
  for (const tab of ['pending', 'assigned', 'delivered']) assert.match(source, new RegExp(`'${tab}'`));
  assert.match(read('lib/routes/dispatch.js'), /PENDING_ASSIGN/);
});

test('متن سربرگ سند چاپی انبار نسبت به کادرها بزرگ‌تر شده است', () => {
  const css = read('public/warehouse-document.css');
  const ui = read('public/ui2.js');
  assert.match(css, /\.whd-meta\{[^}]*font-size:11px/);
  assert.match(css, /\.whd-meta>span b\{font-size:12px/);
  assert.match(css, /\.whd-document-number\{[^}]*font-size:11\.5px/);
  assert.match(css, /\.whd-document-number b\{font-size:15px/);
  // بزرگ‌کردن متن نباید ارتفاع سربرگ ۵۰–۵۲ پیکسلی را بشکند.
  assert.match(css, /\.whd-head\{[^}]*min-height:50px/);
  assert.match(ui, /Math\.max\(7\.5,Math\.min\(9\.5,9\.5-/);
  assert.doesNotMatch(ui, /Math\.max\(5,Math\.min\(8,8-/);
});

test('جزئیات سابقهٔ سفارش انبار همهٔ بخش‌ها و کاربر هر مرحله را نشان می‌دهد', () => {
  const ui = read('ui-src/ui2/04-gate.js');
  for (const marker of ['مشخصات سفارش', 'اطلاعات کامل مشتری', 'اقلام سفارش و وزن‌کشی', 'مراحل سفارش', 'همهٔ رویدادهای ثبت‌شده', 'کاربران دخیل در این سفارش']) {
    assert.match(ui, new RegExp(marker), marker);
  }
  assert.match(ui, /function whVisitActor/);
  assert.match(ui, /whh-weight-log/);
  assert.match(ui, /whh-order-timeline/);
  assert.match(ui, /whh-event-details/);
  // وضعیت‌ها و رویدادها باید فارسی نمایش داده شوند، نه کد خام.
  assert.match(ui, /BTAuditFa\.label\(event\.action\)/);
  assert.match(ui, /whVisitTypeLabel/);
  assert.match(read('public/ui2.js'), /اطلاعات کامل مشتری/);
});

test('مدیر از کارتابل خودش پروندهٔ کامل سفارش را باز می‌کند', () => {
  const nav = read('ui-src/app/08-sales-cache-navigation.js');
  const shell = read('ui-src/app/02-shell-gate.js');
  const admin = read('public/admin-ui.js');
  const route = read('lib/routes/sales-history.js');
  assert.match(nav, /\['orders-history','سوابق کامل سفارش‌ها','history',0\]/);
  assert.match(shell, /page==='orders-history'\)\{if\(r!=='admin'\)return go\(own\);[\s\S]{0,120}renderAdminOrdersHistory\(\)/);
  assert.match(admin, /async function renderAdminOrdersHistory/);
  assert.match(admin, /data-admin-order-history="\$\{admE\(o\.id\)\}"/);
  assert.match(admin, /return openSalesHistory\(orderHistory\.dataset\.adminOrderHistory\)/);
  assert.match(route, /route\('GET','\/api\/admin\/orders',\{roles:\['admin'\]\}/);
  assert.match(route, /createdByName/);
  // پروندهٔ مدیر باید مرحله‌ها، تخصیص ترابری و کاربر هر مرحله را داشته باشد.
  assert.match(route, /transportAssignments:Object\.fromEntries/);
  assert.match(route, /warehouseCompletedBy:userOf/);
  assert.match(read('ui-src/app/07-dashboard-history.js'), /ارسال و ترابری/);
});
