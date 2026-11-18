'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.35.0 — چهار درخواست فروش/انبار:
   (۳) انبار ← فروشگاه‌ها ← آماده‌سازی: پس از ثبت وزن‌های سرویس دوم و ارسال آن، سفارش باید
   از آماده‌سازی خارج و به سوابق انبار برود. علت قدیمی: «پایان کار انبار» (finalizedAt و
   warehouseCompletedAt) فقط با دکمهٔ «پایان عملیات ارسال امروز» ثبت می‌شد و آن دکمه هم تا
   تعیین راننده/تحویل/نهایی‌سازی فروش 409 می‌داد؛ سفارشِ تمام‌شدهٔ انبار در آماده‌سازی می‌ماند.
   حالا وقتی همهٔ اقلام تعیین‌تکلیف و دست‌کم یک سرویس ارسال شده باشد، کار انبار خودکار پایان
   می‌یابد؛ کسریِ بی‌تصمیم و وزنِ ارسال‌نشده همچنان جلوی آن را می‌گیرند و بسته‌شدن نهایی
   سفارش (CLOSED) مثل قبل مال نهایی‌سازی فروش/«پایان عملیات» است.
   (۱ و ۴) جزئیات سفارش در فروش: «خلاصهٔ» چیپی بالای فرم حذف و وزن سرویس اول/دوم دو ستون
   همان فهرست اقلام شد؛ پیش از وزن‌کشی (ورودی) فقط فهرست محصول می‌ماند.
   (۲) جزئیات سفارش فروشگاه در انبار فشرده و کم‌ارتفاع شد. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const ui2 = fs.readFileSync(path.join(root, 'public/ui2.js'), 'utf8');
const compat = fs.readFileSync(path.join(root, 'public/compatibility.css'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'lib/routes/store-runs.js'), 'utf8');

test('سرور: پایان خودکار کار انبار به تعیین‌تکلیف همهٔ اقلام و دست‌کم یک ارسال گره خورده است', () => {
  assert.match(routes, /function maybeAutoFinalizeWarehouse\(db, order, ctx\)/);
  assert.match(routes, /if \(active\.some\(\(i\) => SR\.itemBlocksClose\(order, i\)\)\) return false;/);
  assert.match(routes, /maybeAutoFinalizeWarehouse\(db, order, ctx\);\n  store\.save\(\);/);
  assert.match(routes, /warehouseCompletedAt: now, warehouseCompletedBy: ctx\.user\.id/);
});

test('فروش: جزئیات سفارش خلاصهٔ چیپی ندارد و وزن دو سرویس ستون همان فهرست اقلام است', () => {
  const fn = appJs.slice(appJs.indexOf('async function openOrderDetails'), appJs.indexOf('function renderRemoteOrdersV21'));
  assert.ok(fn.length > 500);
  assert.doesNotMatch(fn, /st-run-letterhead/, 'خلاصهٔ بالای فرم باید حذف شده باشد');
  assert.doesNotMatch(fn, /sr38Chips/, 'چیپ‌های خلاصه نباید در جزئیات بیایند');
  assert.match(fn, /<th>وزن سرویس اول<\/th><th>وزن سرویس دوم<\/th>/, 'دو ستون وزن سرویس در جدول اقلام');
  assert.match(fn, /showRunCols/, 'نمایش ستون‌ها مشروط است تا ورودی فقط فهرست محصول باشد');
  assert.match(fn, /o\.storeRun\.finalizedAt\|\|Object\.values\(runView\)\.some/);
});

test('انبار: فرم جزئیات سفارش فروشگاه فشرده است و برگه پس از پایان کار انبار به فهرست برمی‌گردد', () => {
  const fn = ui2.slice(ui2.indexOf('async function wh38StoreDetails'), ui2.indexOf('async function wh38AcceptFromDetails'));
  assert.ok(fn.length > 500);
  assert.match(fn, /whd35-detail/, 'فرم فشردهٔ جدید');
  assert.doesNotMatch(fn, /detail-modal-grid/, 'شبکهٔ شش‌خانهٔ بلند حذف شده است');
  assert.match(fn, /whd35-headrow/, 'برچسب ستون‌ها فقط در سطر عنوان است');
  assert.match(ui2, /fresh\.order\.storeRun\.finalizedAt/, 'پس از پایان خودکار، برگه به فهرست برمی‌گردد');
  assert.match(compat, /\.whd35-detail\{/, 'استایل فشرده در لایهٔ سازگاری هست');
  assert.match(compat, /\.whd35-list \.whd23-box\{min-height:33px/);
});

/* ---------- یکپارچه‌سازی ---------- */
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Ts7!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-auto-final-'));
const port = 5461;
const BASE = `http://127.0.0.1:${port}`;
const SIG = 'data:image/png;base64,' + 'A'.repeat(300);
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(root, 'server.js')], {
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

async function call(method, p, { cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { }
  const sid = (res.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  return { status: res.status, json, cookie: sid && sid[1] ? `sid=${sid[1]}` : null };
}
const IDEM = () => ({ headers: { 'Idempotency-Key': 'k-' + Math.random().toString(36).slice(2) } });
async function login(u, p) { const r = await call('POST', '/api/login', { body: { username: u, password: p } }); assert.equal(r.status, 200); return r.cookie; }

let sales, wh, storeUser, drv, gate, driverId;
const getOrder = async (id) => (await call('GET', `/api/orders/${id}`, { cookie: sales })).json.order; // خواندن با فروش: انبار سفارش بسته/تسویه را نمی‌خواند (قانون موجود روت)
async function newOrder(items) {
  const so = await call('POST', '/api/store/orders', { ...IDEM(), cookie: storeUser, body: { name: 'مشتری تست', phone: '09120000000', items } });
  assert.equal(so.status, 201, JSON.stringify(so.json));
  const o = so.json.order;
  assert.equal((await call('POST', `/api/store/orders/${o.id}/quick-send`, { ...IDEM(), cookie: sales, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/warehouse/start-preparing`, { cookie: wh, body: {} })).status, 200);
  return o;
}
async function deliverCycle(o, run, lines) {
  assert.equal((await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run } })).status, 200, 'assign');
  assert.equal((await call('POST', `/api/driver/orders/${o.id}/exit`, { ...IDEM(), cookie: drv, body: {} })).status, 200, 'driver exit');
  assert.equal((await call('POST', `/api/gate/dispatch/${o.id}/exit`, { ...IDEM(), cookie: gate, body: {} })).status, 200, 'gate exit');
  assert.equal((await call('POST', `/api/driver/orders/${o.id}/deliver`, { ...IDEM(), cookie: drv, body: { signatureData: SIG, settlementType: 'CASH', lines } })).status, 200, 'deliver');
  const f = await call('POST', `/api/sales/dispatch-deliveries/${o.id}/finalize`, { ...IDEM(), cookie: sales, body: {} });
  assert.equal(f.status, 200, 'sales finalize');
  return f.json.order;
}
const visibleInPreparing = async (id) => {
  const prep = await call('GET', '/api/orders?status=WAREHOUSE_PREPARING', { cookie: wh });
  const hit = (prep.json.orders || []).find((x) => x.id === id);
  return !!hit && !(hit.storeRunOps && hit.storeRunOps.finalizedAt);
};
const inWarehouseHistory = async (id) => {
  const d = new Date();
  const day = (x) => x.toISOString().slice(0, 10);
  const from = day(new Date(d.getTime() - 864e5)), to = day(new Date(d.getTime() + 864e5));
  const hist = await call('GET', `/api/warehouse/history?from=${from}&to=${to}`, { cookie: wh });
  return (hist.json.rows || []).some((x) => x.id === id);
};

test('راه‌اندازی کاربران و راننده', async () => {
  const boot = await login('admin', ADMIN_PASS);
  const newAdmin = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  assert.equal((await call('POST', '/api/account/password', { cookie: boot, body: { currentPassword: ADMIN_PASS, newPassword: newAdmin } })).status, 200);
  const admin = boot;
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return login(username, PASS);
  };
  sales = await mk('saf-sales', 'sales');
  wh = await mk('saf-wh', 'warehouse');
  storeUser = await mk('saf-shop', 'store', { storeName: 'فروشگاه مرکزی تست' });
  const drvRec = await call('POST', '/api/drivers', { ...IDEM(), cookie: admin, body: { fullName: 'راننده تست', phone: '09129998877', vehicleType: 'وانت', plate: '12ب34567' } });
  assert.equal(drvRec.status, 201, JSON.stringify(drvRec.json));
  driverId = drvRec.json.driver.id;
  drv = await mk('saf-driver', 'driver', { driverId });
  gate = await mk('saf-gate', 'gate');
});

test('داستان کاربر: ثبت وزن و ارسال سرویس دوم ← خروج از آماده‌سازی و ورود به سوابق انبار', async () => {
  const o = await newOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }, { productId: 'p02', requestedQty: 50, requestedUnit: 'کیلوگرم' }]);
  const [i1, i2] = o.items.map((x) => x.id);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 100 }, { itemId: i2, deliveredKg: 30 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: i2 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } })).status, 200);
  // قلم دوم هنوز سرویس دومِ ارسال‌نشده دارد → کار انبار تمام نیست
  assert.equal((await getOrder(o.id)).storeRunOps?.finalizedAt || null, null);
  assert.equal(await visibleInPreparing(o.id), true);
  await deliverCycle(o, 1, [{ itemId: i1, returnKg: 0, shortageKg: 0 }, { itemId: i2, returnKg: 0, shortageKg: 0 }]);
  // ثبت وزن سرویس دوم بدون ارسال → هنوز آماده‌سازی
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: i2, deliveredKg: 20 }] } })).status, 200);
  assert.equal((await getOrder(o.id)).storeRunOps?.finalizedAt || null, null, 'وزنِ ارسال‌نشده کار انبار را تمام نمی‌کند');
  assert.equal(await visibleInPreparing(o.id), true);
  // ارسال سرویس دوم → پایان خودکار کار انبار
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 2 } })).status, 200);
  const done = await getOrder(o.id);
  assert.ok(done.storeRunOps?.finalizedAt, 'نشان پایان کار انبار ثبت شده است');
  assert.ok(done.warehouseCompletedAt, 'زمان تکمیل انبار ثبت شده تا سفارش وارد سوابق شود');
  assert.equal(done.status, 'WAREHOUSE_PREPARING', 'بسته‌شدن نهایی همچنان با چرخهٔ فروش است');
  assert.equal(await visibleInPreparing(o.id), false, 'از فهرست آماده‌سازی خارج شد');
  assert.equal(await inWarehouseHistory(o.id), true, 'وارد سوابق انبار شد');
  const items = Object.fromEntries(done.items.map((x) => [x.id, x]));
  assert.equal(items[i1].itemStatus, 'DELIVERED');
  assert.equal(items[i1].deliveredKg, 100);
  assert.equal(items[i2].itemStatus, 'DELIVERED');
  assert.equal(items[i2].deliveredKg, 50, 'جمع دو سرویس روی قلم نشسته است');
});

test('کسریِ بی‌تصمیم جلوی پایان خودکار را می‌گیرد؛ «تکمیل محصول» و بعد «پایان عملیات» می‌بندد', async () => {
  const o = await newOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }, { productId: 'p02', requestedQty: 50, requestedUnit: 'کیلوگرم' }]);
  const [i1, i2] = o.items.map((x) => x.id);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 100 }, { itemId: i2, deliveredKg: 30 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } })).status, 200);
  assert.equal((await getOrder(o.id)).storeRunOps?.finalizedAt || null, null, 'کسریِ ۲۰ کیلوییِ بی‌تصمیم نباید خودکار تمام شود');
  await deliverCycle(o, 1, [{ itemId: i1, returnKg: 0, shortageKg: 0 }, { itemId: i2, returnKg: 0, shortageKg: 0 }]);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/complete`, { ...IDEM(), cookie: wh, body: { itemId: i2 } })).status, 200);
  const fin = await getOrder(o.id);
  assert.ok(fin.storeRunOps?.finalizedAt, 'با آخرین تعیین‌تکلیف، کار انبار خودکار پایان یافت');
  assert.equal(fin.status, 'WAREHOUSE_PREPARING', 'پایان کار انبار به‌تنهایی سفارش را نمی‌بندد');
  const fd = await call('POST', `/api/orders/${o.id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [] } });
  assert.equal(fd.status, 200, 'پایان عملیات روی سفارشِ آمادهٔ بسته‌شدن موفق است: ' + JSON.stringify(fd.json).slice(0, 140));
  assert.equal((await getOrder(o.id)).status, 'CLOSED');
});

test('بدون هیچ ارسالی، پایان خودکار نیست و مسیر دستی «پایان عملیات» مثل قبل کار می‌کند', async () => {
  const o = await newOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }]);
  const i1 = o.items[0].id;
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 100 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/complete`, { ...IDEM(), cookie: wh, body: { itemId: i1 } })).status, 200);
  const mid = await getOrder(o.id);
  assert.equal(mid.storeRunOps?.finalizedAt || null, null, 'وزنِ ارسال‌نشده حتی با تکمیل محصول، خودکار تمام نمی‌شود');
  const fd = await call('POST', `/api/orders/${o.id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [] } });
  assert.equal(fd.status, 200, JSON.stringify(fd.json).slice(0, 140));
  assert.equal((await getOrder(o.id)).status, 'SETTLEMENT_PENDING', 'مسیر قدیمی بدون ارسال (تسویهٔ معمول) سالم است');
});

test('ارجاع به فروش، نشان پایان کار انبار را پاک می‌کند تا سفارش بتواند برگردد', async () => {
  const o = await newOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }]);
  const i1 = o.items[0].id;
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 100 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } })).status, 200);
  assert.ok((await getOrder(o.id)).storeRunOps?.finalizedAt, 'پس از ارسالِ کامل، کار انبار پایان یافته است');
  assert.equal(await visibleInPreparing(o.id), false);
  assert.equal((await call('POST', `/api/orders/${o.id}/return-sales`, { ...IDEM(), cookie: wh, body: { reason: 'اصلاح سفارش' } })).status, 200);
  assert.equal((await getOrder(o.id)).storeRunOps?.finalizedAt || null, null, 'با ارجاع، کار انبار دوباره باز محسوب می‌شود');
});

test('تکمیل یا بستن با کسری، وزن ارسال‌نشدهٔ سرویس دوم را از گردش ارسال حذف نمی‌کند', async () => {
  for (const action of ['complete', 'out-of-stock']) {
    const o = await newOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }]);
    const itemId = o.items[0].id;
    const post = (ep, body) => call('POST', `/api/orders/${o.id}/store-run/${ep}`, { ...IDEM(), cookie: wh, body });
    assert.equal((await post('weights', { run: 1, items: [{ itemId, deliveredKg: 30 }] })).status, 200);
    assert.equal((await post('move', { itemId })).status, 200);
    assert.equal((await post('send-run', { run: 1 })).status, 200);
    assert.equal((await post('weights', { run: 2, items: [{ itemId, deliveredKg: 50 }] })).status, 200);
    assert.equal((await post(action, { itemId, note: 'تست' })).status, 200);
    assert.equal((await getOrder(o.id)).storeRunOps?.finalizedAt || null, null, action);
    assert.equal(await visibleInPreparing(o.id), true, action);
    assert.equal(await inWarehouseHistory(o.id), false, action);
    assert.equal((await post('send-run', { run: 2 })).status, 200);
    assert.ok((await getOrder(o.id)).storeRunOps?.finalizedAt, action);
    assert.equal(await visibleInPreparing(o.id), false, action);
    assert.equal(await inWarehouseHistory(o.id), true, action);
    const ships = await call('GET', '/api/sales/store-run-shipments', { cookie: sales });
    const ship = ships.json.shipments.find(s => s.orderId === o.id && s.run === 2);
    assert.ok(ship, 'سرویس دوم باید در ورودی فروش دیده شود');
    assert.ok(ship.items.some(i => i.itemId === itemId || i.id === itemId));
  }
});
