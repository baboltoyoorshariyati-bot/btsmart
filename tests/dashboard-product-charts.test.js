'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
// v37.3.5 — داشبورد مدیریت: حذف «جریان عملیات» و نمودارهای فروش / سفارشات / تحویل انبار به تفکیک محصول
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Tw4!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-dbc-'));
const port = 7081;
const BASE = `http://127.0.0.1:${port}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: ADMIN_PASS, LOGIN_MAX_ATTEMPTS: '50' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout.on('data', (d) => { if (String(d).includes('"listening"')) { clearTimeout(t); resolve(); } });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
});
after(() => { if (proc) proc.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function call(method, p, { cookie, body } = {}) {
  const h = {};
  if (cookie) h.Cookie = cookie;
  if (method !== 'GET') h['Idempotency-Key'] = 'k' + require('crypto').randomBytes(8).toString('hex');
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = JSON.parse(await res.text()); } catch { /* not json */ }
  return { status: res.status, json };
}
const login = (u, p, ip) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: u, password: p }) })
  .then((r) => ((r.headers.get('set-cookie') || '').match(/sid=([^;]+)/) || [])[0] || null);
const localDay = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };


test('UI: پنل «جریان عملیات» از داشبورد مدیریت حذف و سه نمودار به تفکیک محصول جایگزین شده است', () => {
  const ui = read('public/ui2.js');
  const start = ui.indexOf('async function renderDashboard');
  assert.ok(start > 0);
  const end = ui.indexOf('\nasync function ', start + 10);
  const dash = ui.slice(start, end > 0 ? end : undefined);
  assert.doesNotMatch(dash, /<h3>جریان عملیات<\/h3>/);
  assert.doesNotMatch(dash, /db38-flow/);
  assert.match(dash, /id="dbCharts"[^>]*>\$\{dbcShell\(\)\}<\/section>/);
  assert.match(dash, /dbcLoad\(\);/);
  for (const t of ['آمار فروش به تفکیک محصول', 'آمار سفارشات به تفکیک محصول', 'تحویل انبار به تفکیک محصول']) assert.ok(ui.includes(t), t);
  assert.match(ui, /api\('\/api\/dashboard\/products\?days='\+app\.dbc\.days\)/);
  assert.match(ui, /data-dbc-days="\$\{d\}"/);
  assert.match(ui, /if\(seq!==app\.dbc\.seq\|\|!\$\('#dbcGrid'\)\) return;/, 'پاسخ قدیمی بازهٔ قبلی نمودار را بازنویسی نکند');
  const css = read('public/theme.css');
  assert.match(css, /\.dbc-grid\{[^}]*grid-template-columns:repeat\(3/);
});

test('API: آمار محصولات داشبورد — فروش خالص، سفارشات و تحویل انبار با ناموجودی؛ فقط مدیر', async () => {
  let admin = await login('admin', ADMIN_PASS, '10.8.0.1');
  assert.equal((await call('POST', '/api/account/password', { cookie: admin, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);
  const mk = (username, roleCode) => call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false } });
  assert.equal((await mk('wh1', 'warehouse')).status, 201);
  assert.equal((await mk('sales1', 'sales')).status, 201);
  const wh = await login('wh1', PASS, '10.8.0.3');
  const sales = await login('sales1', PASS, '10.8.0.4');

  // خالی
  const empty = await call('GET', '/api/dashboard/products?days=7', { cookie: admin });
  assert.equal(empty.status, 200);
  assert.equal(empty.json.days, 7);
  assert.deepEqual([empty.json.sales.rows.length, empty.json.orders.rows.length, empty.json.warehouse.rows.length], [0, 0, 0]);

  const products = (await call('GET', '/api/products', { cookie: sales })).json.products.filter((p) => p.isActive);
  const [p1, p2] = products;
  const mkOrder = async (name, phone, items) => (await call('POST', '/api/orders/remote', { cookie: sales, body: {
    name, phone, scheduledDate: localDay(), scheduledTime: '00:00', dispatchPlace: 'بابل',
    items: items.map(([productId, requestedQty]) => ({ productId, requestedQty, requestedUnit: 'کیلوگرم' })) } })).json.order;
  const o1 = await mkOrder('مشتری یک', '09110000011', [[p1.id, 100], [p2.id, 20]]);
  const o2 = await mkOrder('مشتری دو', '09110000012', [[p1.id, 50]]);
  assert.ok(o1 && o2);

  // انبار: o1 کامل (p2 ناموجود)، o2 هنوز در صف
  assert.equal((await call('POST', `/api/orders/${o1.id}/warehouse/accept`, { cookie: wh, body: {} })).status, 200);
  const full = (await call('GET', `/api/orders/${o1.id}`, { cookie: wh })).json.order;
  const items = full.items.map((i) => (i.productId === p2.id ? { itemId: i.id, outOfStock: true, deliveredKg: 0 } : { itemId: i.id, deliveredKg: 98.5 }));
  assert.equal((await call('POST', `/api/orders/${o1.id}/warehouse`, { cookie: wh, body: { items } })).status, 200);

  // تسویه فروش o1
  const fo = (await call('GET', `/api/orders/${o1.id}`, { cookie: sales })).json.order;
  assert.equal(fo.status, 'SETTLEMENT_PENDING');
  const st = await call('POST', `/api/orders/${o1.id}/settle`, { cookie: sales, body: {
    items: fo.items.map((i) => ({ itemId: i.id, unitPrice: i.productId === p2.id ? 0 : 1000000, cancelled: false })),
    signatureData: 'data:image/png;base64,' + 'A'.repeat(300), noFingerprintAllowed: true } });
  assert.equal(st.status, 200, JSON.stringify(st.json));

  const r = await call('GET', '/api/dashboard/products?days=30', { cookie: admin });
  assert.equal(r.status, 200);
  const { sales: S, orders: O, warehouse: W } = r.json;
  // سفارشات: p1 در دو سفارش، p2 در یک سفارش
  assert.equal(O.totalOrders, 2);
  assert.equal(O.rows[0].productId, p1.id);
  assert.equal(O.rows[0].orders, 2);
  assert.equal(O.rows.find((x) => x.productId === p2.id).orders, 1);
  // انبار: فقط o1، وزن نهایی 98.5 و یک قلم ناموجود
  assert.equal(W.orders, 1);
  assert.equal(W.totalKg, 98.5);
  assert.equal(W.outOfStock, 1);
  assert.equal(W.rows.find((x) => x.productId === p2.id).outOfStock, 1);
  // فروش: یک فاکتور، مبلغ 98.5 × 1,000,000
  assert.equal(S.invoices, 1);
  assert.equal(S.totalAmount, 98500000);
  assert.equal(S.rows[0].productId, p1.id);
  assert.equal(S.rows[0].kg, 98.5);
  // دسترسی و بازهٔ نامعتبر
  assert.equal((await call('GET', '/api/dashboard/products?days=999', { cookie: admin })).json.days, 30);
  assert.equal((await call('GET', '/api/dashboard/products', { cookie: sales })).status, 403);
  assert.equal((await call('GET', '/api/dashboard/products', { cookie: wh })).status, 403);
  assert.equal((await call('GET', '/api/dashboard/products')).status, 401);
});
