'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.33.0 — کارتابل راننده:
   ۱) «جزئیات محموله» برای سفارش فروشگاه باز نمی‌شد چون GET /api/orders/:id نقش driver را نداشت
      و کارت فروشگاه جز خلاصه چیزی نشان نمی‌داد. حالا راننده فقط محمولهٔ خودش را می‌بیند.
   ۲) کارت «واگذار شده» فشرده و تک‌ردیفی شد؛ دکمه‌ها در یک ردیف هم‌راستا. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dsp = read('public/dispatch-ui.js');
const ordersRoute = read('lib/routes/orders.js');
const compat = read('public/compatibility.css');

test('مسیر جزئیات سفارش برای راننده باز است ولی فقط روی محمولهٔ خودش', () => {
  const seg = ordersRoute.slice(ordersRoute.indexOf("route('GET', '/api/orders/:id'"), ordersRoute.indexOf('// ---------- انبار ----------'));
  assert.match(seg, /roles: \[[^\]]*'driver'/, 'نقش راننده در جزئیات سفارش نیست');
  assert.match(seg, /role === 'driver'[\s\S]*?dispatchViews\(order\)[\s\S]*?driverId === ctx\.user\.driverId/, 'محدودسازی به محمولهٔ خود راننده نیست');
  assert.match(seg, /publicOrder\(\{ \.\.\.order, dispatch: view\.dispatch \}\)/, 'پاسخ باید محدود به همان سرویس باشد');
  assert.match(seg, /payments, payment, visit, dispatchRuns, storeRun/, 'داده‌های اضافی (پرداخت/خدمه‌برهای دیگر) نباید به راننده برسد');
  assert.match(dsp, /encodeURIComponent\(orderId\) \+ \(run \? '\?run=' \+ encodeURIComponent\(run\) : ''\)/, 'کلاینت شمارهٔ سرویس را نمی‌فرستد');
});

test('کارت ورودی راننده فشرده و تک‌ردیفی است و جزئیات کامل به پنجره منتقل شده', () => {
  const card = dsp.slice(dsp.indexOf('function dspDriverCard'), dsp.indexOf('function dspDoneCard'));
  assert.match(card, /dsp-driver-row/);
  assert.match(card, /dsp-table-actions/);
  assert.match(card, /جزئیات محموله/);
  assert.doesNotMatch(card, /dspInvoiceMarkup\(/, 'جدول کامل فاکتور نباید روی کارت ورودی باشد');
  assert.doesNotMatch(card, /dsp-items/, 'فهرست اقلام نباید روی کارت ورودی باشد');
  assert.doesNotMatch(card, /dsp-log/, 'سوابق نباید روی کارت ورودی باشد');
  assert.doesNotMatch(card, /btn-lg/, 'دکمهٔ بزرگ تمام‌عرض نباید روی کارت باشد');
  const modal = dsp.slice(dsp.indexOf('async function dspOrderDetails'), dsp.indexOf('function dspPaymentRows'));
  assert.match(modal, /dspEvents\(o\.dispatch\)/, 'سوابق باید داخل پنجرهٔ جزئیات باشد');
  const block = compat.slice(compat.indexOf('v37.33.0'));
  assert.match(block, /\.dsp-card\.dsp-card-compact\{display:flex!important/);
  assert.match(block, /\.dsp-card-actions\{display:flex;align-items:center/);
  assert.match(block, /\[data-dsp="driver-exit"\][^{]*\{margin-inline-start:auto\}/, 'دکمهٔ اصلی باید انتهای همان ردیف باشد');
});

// ---------- یکپارچگی دسترسی راننده ----------
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Td4!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-test-3727-'));
let proc, BASE, adminCookie, salesCookie, whCookie, storeCookie, gateCookie, drvA, drvB;
let n = 0; const IDEM = () => ({ 'Idempotency-Key': 'k-' + (++n) + '-' + Date.now() });

async function call(method, p, { cookie, body } = {}) {
  const h = { ...IDEM() };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ignore */ }
  const sid = (res.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  return { status: res.status, json, cookie: sid && sid[1] ? `sid=${sid[1]}` : null };
}
const login = async (u, p) => {
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const sid = (res.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  return { status: res.status, cookie: sid && sid[1] ? `sid=${sid[1]}` : null };
};

before(async () => {
  const listener = http.createServer();
  await new Promise((r) => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  BASE = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, [path.join(root, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: ADMIN_PASS, LOGIN_MAX_ATTEMPTS: '50' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout.on('data', (d) => { if (String(d).includes('"listening"')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
  adminCookie = (await login('admin', ADMIN_PASS)).cookie;
  const NEW_ADMIN = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  assert.equal((await call('POST', '/api/account/password', { cookie: adminCookie, body: { currentPassword: ADMIN_PASS, newPassword: NEW_ADMIN } })).status, 200);
  // Continue using the existing authenticated session.
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: adminCookie, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return (await login(username, PASS)).cookie;
  };
  salesCookie = await mk('sales3727', 'sales');
  whCookie = await mk('wh3727', 'warehouse');
  storeCookie = await mk('store3727', 'store', { storeName: 'فروشگاه تست ۳۷۲۷' });
  gateCookie = await mk('gate3727', 'gate');
  const mkDriver = async (username, fullName) => {
    const d = await call('POST', '/api/drivers', { cookie: adminCookie, body: { fullName, phone: '09129998877', vehicleType: 'وانت', plate: '12ب34567' } });
    assert.equal(d.status, 201, JSON.stringify(d.json));
    return { cookie: await mk(username, 'driver', { driverId: d.json.driver.id }), id: d.json.driver.id };
  };
  const A = await mkDriver('drvA3727', 'راننده الف'); drvA = A.cookie; global.__drvA = A.id;
  const B = await mkDriver('drvB3727', 'راننده ب'); drvB = B.cookie; global.__drvB = B.id;
  assert.ok(drvA && drvB);
});
after(() => { if (proc) proc.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('راننده جزئیات محمولهٔ فروشگاه خودش را می‌بیند؛ رانندهٔ دیگر و غریبه نه', async () => {
  const drvAId = global.__drvA, drvBId = global.__drvB;
  const created = await call('POST', '/api/store/orders', {
    cookie: storeCookie,
    body: { name: 'مشتری تست', phone: '09121110000', items: [
      { productId: 'p01', requestedQty: 120, requestedUnit: 'کیلوگرم' },
      { productId: 'p02', requestedQty: 85, requestedUnit: 'کیلوگرم' },
      { productId: 'p03', requestedQty: 40, requestedUnit: 'کیلوگرم' },
    ] },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const order = created.json.order;
  const it = Object.fromEntries(order.items.map((i) => [i.productId, i.id]));
  assert.equal((await call('POST', `/api/store/orders/${order.id}/quick-send`, { cookie: salesCookie, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${order.id}/warehouse/accept`, { cookie: whCookie, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${order.id}/store-run/weights`, { cookie: whCookie, body: { run: 1, items: [{ itemId: it.p01, deliveredKg: 120 }, { itemId: it.p02, deliveredKg: 60 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${order.id}/store-run/send-run`, { cookie: whCookie, body: { run: 1 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${order.id}/send-dispatch`, { cookie: salesCookie, body: { driverId: drvAId, run: 1 } })).status, 200);
  assert.equal((await call('POST', `/api/dispatch/orders/${order.id}/assign`, { cookie: salesCookie, body: { driverId: drvAId } })).status, 200);

  // قبل از اصلاح: ۴۰۳ بود. حالا رانندهٔ صاحب محموله جزئیات را می‌گیرد.
  const det = await call('GET', `/api/orders/${order.id}?run=1`, { cookie: drvA });
  assert.equal(det.status, 200, JSON.stringify(det.json));
  const o = det.json.order;
  assert.equal(o.orderType, 'STORE');
  const weights = Object.fromEntries((o.items || []).map((i) => [i.id, Number(i.deliveredKg)]));
  assert.equal(weights[it.p01], 120, 'وزن کامل سرویس اول');
  assert.equal(weights[it.p02], 60, 'وزن ناقص سرویس اول');
  assert.ok(!(it.p03 in weights), 'قلم بیرون از این سرویس نباید در جزئیات این محموله باشد');
  assert.equal(o.dispatch.run, 1);
  assert.equal(o.dispatch.driverId, drvAId);
  assert.ok(o.storeRunOps && o.storeRunOps.r1Shipment, 'وضعیت سرویس‌ها برای پنجره لازم است');
  assert.equal(o.payments, undefined, 'اطلاعات پرداخت نباید به راننده برسد');
  assert.equal(o.dispatchRuns, undefined, 'خدمه‌برهای دیگر نباید به راننده برسد');
  assert.equal(o.dispatch.signatureData, undefined, 'دادهٔ امضا نباید در پاسخ باشد');

  // رانندهٔ دیگر و فروشگاه (نقش غیرمجاز این مسیر) دسترسی ندارند
  assert.equal((await call('GET', `/api/orders/${order.id}?run=1`, { cookie: drvB })).status, 403, 'رانندهٔ دیگر نباید ببیند');
  assert.equal((await call('GET', `/api/orders/${order.id}`, { cookie: storeCookie })).status, 403, 'فروشگاه از این مسیر جزئیات نمی‌گیرد');
  // بدون شمارهٔ سرویس هم همان محمولهٔ خودش برمی‌گردد و فروش مثل قبل دسترسی کامل دارد
  assert.equal((await call('GET', `/api/orders/${order.id}`, { cookie: drvA })).status, 200);
  const salesView = await call('GET', `/api/orders/${order.id}`, { cookie: salesCookie });
  assert.equal(salesView.status, 200, 'دسترسی فروش نباید خراب شده باشد');

  // سفارش عادیِ رانندهٔ ب برای رانندهٔ الف ممنوع است
  const v = await call('POST', '/api/visits', { cookie: gateCookie, body: { name: 'مشتری عادی', phone: '09127777777', plate: '12ب345-67', district: 'شمال' } });
  const reg = await call('POST', '/api/orders', { cookie: salesCookie, body: { visitId: v.json.visit.id, items: [{ productId: 'p01', requestedQty: 50, requestedUnit: 'کیلوگرم' }] } });
  const regId = reg.json.order.id;
  await call('POST', `/api/orders/${regId}/warehouse/accept`, { cookie: whCookie, body: {} });
  await call('POST', `/api/orders/${regId}/warehouse/start-preparing`, { cookie: whCookie, body: {} });
  const cur = await call('GET', `/api/orders/${regId}`, { cookie: whCookie });
  const itemId = cur.json.order.items[0].id;
  assert.equal((await call('POST', `/api/orders/${regId}/warehouse`, { cookie: whCookie, body: { items: [{ itemId, deliveredKg: 42 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${regId}/send-dispatch`, { cookie: salesCookie, body: { driverId: drvBId, items: [{ itemId, unitPrice: 2000 }] } })).status, 200);
  assert.equal((await call('GET', `/api/orders/${regId}`, { cookie: drvA })).status, 403, 'سفارش رانندهٔ دیگر ممنوع');
  assert.equal((await call('GET', `/api/orders/${regId}`, { cookie: drvB })).status, 200, 'صاحب سفارش عادی هم جزئیات می‌بیند');
});
