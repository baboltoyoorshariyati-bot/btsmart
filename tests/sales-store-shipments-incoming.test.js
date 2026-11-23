'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.33.0 — اقلام سرویس دوم (و اول) پس از ارسال انبار در کارتابل فروش دیده نمی‌شدند:
   پنل «اقلام سرویس ارسال‌شده از انبار» فقط در سربرگ «در جریان» رندر می‌شد، درحالی‌که
   فروش محمولهٔ تازه‌رسیده را در سربرگ «ورودی» جست‌وجو می‌کند. پنل به «ورودی» منتقل شد،
   نشان سربرگ‌ها اصلاح شد و مودال «تعیین راننده» فقط وزن همان سرویس را نشان می‌دهد. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/ui2.js'), 'utf8');

const storesFn = ui.slice(ui.indexOf('function renderSalesStoresV41'), ui.indexOf('function sdFlowCard'));
const panelFn = ui.slice(ui.indexOf('function renderStoreRunShipmentsPanel'), ui.indexOf('function renderSalesDeliveryV38'));
const shipFn = ui.slice(ui.indexOf('async function srSalesOpenShip'), ui.indexOf('function salesFinalizeDeliveryV38'));

test('پنل محموله‌های انبار در سربرگ «ورودی» رندر می‌شود، نه «در جریان»', () => {
  assert.match(storesFn, /panel\('incoming','ورودی',incoming,'incoming',shipCount\?[^,]+,[^)]+,shipmentsPanel\)/, 'پنل محموله‌ها باید محتوای سربرگ ورودی باشد');
  assert.match(storesFn, /panel\('processing','در جریان',processing,'processing','سفارشی در جریان نیست','سفارش‌های در حال بررسی یا آماده‌سازی در این بخش دیده می‌شوند\.'\)/, 'در جریان نباید پنل محموله‌ها را بگیرد');
  assert.equal((storesFn.match(/shipmentsPanel\)/g) || []).length, 1, 'پنل محموله‌ها دقیقاً یک بار رندر شود');
});

test('نشان سربرگ «ورودی» محموله‌های در انتظار تعیین راننده را هم می‌شمارد', () => {
  assert.match(storesFn, /const shipCount=\(deliveries\.storeRunShipments\|\|\[\]\)\.length;/);
  assert.match(storesFn, /\['incoming','ورودی',incoming\.length\+shipCount\+additions\.length\]/);
  assert.match(storesFn, /\['processing','در جریان',processing\.length\]/, 'در جریان دیگر محموله‌ها را در نشانش نمی‌شمارد');
});

test('چیپ هر محموله اقلام و وزن همان سرویس و دکمهٔ تعیین راننده دارد', () => {
  assert.match(panelFn, /data-action="sr-ship-open" data-order="\$\{esc\(s\.orderId\)\}" data-run="\$\{s\.run\}"/);
  assert.match(panelFn, /l\.serviceKg\?\?l\.deliveredKg/, 'جمع وزن ردیف باید از وزن همان سرویس باشد');
  assert.match(shipFn, /ماندهٔ سرویس دوم/, 'ماندهٔ سرویس در جزئیات محموله نمایش داده شود');
  assert.match(panelFn, /const list=Array\.isArray\(shipments\)\?shipments:\[\];/, 'هر دو سرویس در یک فهرست رندر می‌شوند');
});

test('مودال تعیین راننده فقط وزن همان سرویس را نشان می‌دهد (نه جمع دو سرویس)', () => {
  assert.match(shipFn, /const runKgOf = \(i\) => \{ const v = \(\(o\.storeRun && o\.storeRun\.items\) \|\| \[\]\)\.find\(\(x\) => x\.itemId === i\.id\); return v \? Number\(run === 2 \? v\.r2Kg \|\| 0 : v\.r1Kg \|\| 0\) : Number\(i\.deliveredKg \|\| 0\); \};/);
  assert.match(shipFn, /وزن سرویس: <b>\$\{qty\(runKgOf\(i\)\)\} کیلوگرم<\/b>/);
  assert.doesNotMatch(shipFn, /qty\(i\.deliveredKg\)/, 'نمایش جمع انباشتهٔ دو سرویس در مودال ممنوع است');
});

test('پس از واگذاری راننده، پنل فروشگاه‌ها نوسازی می‌شود تا چیپ از ورودی برود', () => {
  assert.match(shipFn, /app\.sub\.sales === 'stores'\) paintSalesPaneV29\('stores', data\)/);
});

/* ---------- یکپارچه‌سازی: چرخهٔ واقعی تا نمای فروش ---------- */
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Ts7!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-sales-incoming-'));
const port = 5431;
const BASE = `http://127.0.0.1:${port}`;
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

test('چرخهٔ کامل: سرویس دوم پس از ارسال انبار نزد فروش با اقلام خودش هست و با تعیین راننده از فهرست می‌رود', async () => {
  const boot = await login('admin', ADMIN_PASS);
  const newAdmin = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  assert.equal((await call('POST', '/api/account/password', { cookie: boot, body: { currentPassword: ADMIN_PASS, newPassword: newAdmin } })).status, 200);
  const admin = boot;
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return login(username, PASS);
  };
  const sales = await mk('ssi-sales', 'sales');
  const wh = await mk('ssi-wh', 'warehouse');
  const storeUser = await mk('ssi-shop', 'store', { storeName: 'فروشگاه مرکزی تست' });
  const drvRec = await call('POST', '/api/drivers', { ...IDEM(), cookie: admin, body: { fullName: 'راننده تست', phone: '09129998877', vehicleType: 'وانت', plate: '12ب34567' } });
  assert.equal(drvRec.status, 201, JSON.stringify(drvRec.json));
  const driverId = drvRec.json.driver.id;

  const so = await call('POST', '/api/store/orders', { ...IDEM(), cookie: storeUser, body: { name: 'مشتری تست', phone: '09120000000', items: [{ productId: 'p01', requestedQty: 120, requestedUnit: 'کیلوگرم' }, { productId: 'p02', requestedQty: 85, requestedUnit: 'کیلوگرم' }, { productId: 'p03', requestedQty: 40, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(so.status, 201, JSON.stringify(so.json));
  const o = so.json.order;
  const it = Object.fromEntries(o.items.map((i) => [i.productId, i.id]));
  assert.equal((await call('POST', `/api/store/orders/${o.id}/quick-send`, { ...IDEM(), cookie: sales, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/warehouse/start-preparing`, { cookie: wh, body: {} })).status, 200);

  // سرویس اول: p01 کامل و p02 ناقص
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: it.p01, deliveredKg: 120 }, { itemId: it.p02, deliveredKg: 50 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } })).status, 200);
  // سرویس دوم: ماندهٔ p02 و کل p03
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: it.p02 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: it.p03 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: it.p02, deliveredKg: 35 }, { itemId: it.p03, deliveredKg: 40 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 2 } })).status, 200);

  // نمای فروش: هر دو محموله، سرویس دوم با وزن‌های خودش
  const ships = await call('GET', '/api/sales/store-run-shipments', { cookie: sales });
  assert.equal(ships.status, 200);
  const rows = ships.json.shipments || [];
  assert.equal(rows.length, 2, 'هر دو سرویس باید نزد فروش باشند');
  const run2 = rows.find((s) => s.run === 2);
  assert.ok(run2, 'محمولهٔ سرویس دوم نزد فروش نیست');
  const itemsById = Object.fromEntries(run2.items.map((i) => [i.itemId, i]));
  assert.equal(itemsById[it.p02].serviceKg, 35, 'وزن سرویس دوم p02 باید ۳۵ باشد');
  assert.equal(itemsById[it.p03].serviceKg, 40, 'وزن سرویس دوم p03 باید ۴۰ باشد');
  assert.equal(itemsById[it.p02].plannedRunKg, 35, 'ماندهٔ سرویس دوم p02 = ۸۵−۵۰');

  // تعیین رانندهٔ سرویس دوم از همان فهرست
  const assign = await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run: 2 } });
  assert.equal(assign.status, 200, JSON.stringify(assign.json));
  const after2 = await call('GET', '/api/sales/store-run-shipments', { cookie: sales });
  const runsLeft = (after2.json.shipments || []).map((s) => s.run);
  assert.deepEqual(runsLeft, [1], 'پس از تعیین راننده فقط سرویس اولِ واگذارنشده می‌ماند');
});
