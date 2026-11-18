'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.33.0 — دو گزارش گره‌خورده: (۱) در کارتابل فروش، سفارش پس از «تأیید نهایی تحویل» واحد فروش
   در سربرگ «در جریان» می‌ماند و به «سوابق» نمی‌رود؛ (۲) انبار با «ثبت وزن» و «تکمیل محصول» هم
   نمی‌تواند سفارش را از فهرست آماده‌سازی خارج کند و «هیچ اقدامی انجام نمی‌شود».
   علت: بسته‌شدن سفارش (CLOSED) مشروط بود به این‌که تک‌تک اقلام دستی «تکمیل محصول» یا
   «عدم موجودی» خورده باشند؛ جریان طبیعی (وزن ← ارسال ← تحویل راننده ← تأیید فروش) هرگز
   سفارش را نمی‌بست و دکمهٔ «پایان عملیات ارسال امروز» هم با تصمیم خالی همیشه ۴۰۰ می‌شد.
   حالا قلمی که کل درخواستش وزن و در سرویس خودش ارسال شده برای بسته‌شدن کافی است؛
   کسریِ بی‌تصمیم، وزن ارسال‌نشده و سرویس دومِ ارسال‌نشده همچنان جلوی بسته‌شدن را می‌گیرند. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sr = fs.readFileSync(path.join(root, 'lib/store-runs.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'lib/routes/store-runs.js'), 'utf8');

test('بسته‌شدن سفارش به «تکمیل محصول» دستی برای قلم کاملِ ارسال‌شده گره نخورده است', () => {
  assert.match(sr, /function itemBlocksClose\(order, item\)/);
  assert.match(sr, /if \(runTotalKg\(item\) < Number\(item\.requestedQty \|\| 0\)\) return true;/);
  assert.match(sr, /if \(active\.some\(\(i\) => itemBlocksClose\(order, i\)\)\) return false;/);
  assert.match(sr, /itemBlocksClose,\n\};/);
  assert.doesNotMatch(sr, /if \(active\.some\(\(i\) => UNRESOLVED\(itemRunStatus\(i\)\)\)\) return false;/, 'شرط قدیمیِ «همه باید COMPLETED باشند» نباید بماند');
});

test('پایان عملیات روز هم فقط برای اقلام واقعاً تعیین‌تکلیف‌نشده تصمیم می‌خواهد', () => {
  assert.match(routes, /shipmentFlow \? SR\.itemBlocksClose\(order, i\)/);
  assert.match(routes, /!\(i\.runCompleted \|\| i\.shortageClosed\) && SR\.itemBlocksClose/);
});

/* ---------- یکپارچه‌سازی ---------- */
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Ts7!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-auto-close-'));
const port = 5451;
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
async function deliverCycle(o, run, lines) {
  assert.equal((await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run } })).status, 200, 'assign');
  assert.equal((await call('POST', `/api/driver/orders/${o.id}/exit`, { ...IDEM(), cookie: drv, body: {} })).status, 200, 'driver exit');
  assert.equal((await call('POST', `/api/gate/dispatch/${o.id}/exit`, { ...IDEM(), cookie: gate, body: {} })).status, 200, 'gate exit');
  const d = await call('POST', `/api/driver/orders/${o.id}/deliver`, { ...IDEM(), cookie: drv, body: { signatureData: SIG, settlementType: 'CASH', lines } });
  assert.equal(d.status, 200, 'deliver: ' + JSON.stringify(d.json).slice(0, 160));
  const f = await call('POST', `/api/sales/dispatch-deliveries/${o.id}/finalize`, { ...IDEM(), cookie: sales, body: {} });
  assert.equal(f.status, 200, 'sales finalize');
  return f.json.order;
}
async function newOrder(items) {
  const so = await call('POST', '/api/store/orders', { ...IDEM(), cookie: storeUser, body: { name: 'مشتری تست', phone: '09120000000', items } });
  assert.equal(so.status, 201, JSON.stringify(so.json));
  const o = so.json.order;
  assert.equal((await call('POST', `/api/store/orders/${o.id}/quick-send`, { ...IDEM(), cookie: sales, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/warehouse/start-preparing`, { cookie: wh, body: {} })).status, 200);
  return o;
}
const statusOf = async (id) => (await call('GET', `/api/orders/${id}`, { cookie: sales })).json.order.status;

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
  sales = await mk('sac-sales', 'sales');
  wh = await mk('sac-wh', 'warehouse');
  storeUser = await mk('sac-shop', 'store', { storeName: 'فروشگاه مرکزی تست' });
  const drvRec = await call('POST', '/api/drivers', { ...IDEM(), cookie: admin, body: { fullName: 'راننده تست', phone: '09129998877', vehicleType: 'وانت', plate: '12ب34567' } });
  assert.equal(drvRec.status, 201, JSON.stringify(drvRec.json));
  driverId = drvRec.json.driver.id;
  drv = await mk('sac-driver', 'driver', { driverId });
  gate = await mk('sac-gate', 'gate');
});

test('جریان طبیعی بدون «تکمیل محصول»: با تأیید نهایی فروش سفارش بسته و به سوابق می‌رود', async () => {
  const o = await newOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }, { productId: 'p02', requestedQty: 50, requestedUnit: 'کیلوگرم' }]);
  const [i1, i2] = o.items.map((x) => x.id);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 100 }, { itemId: i2, deliveredKg: 50 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } })).status, 200);
  const after = await deliverCycle(o, 1, [{ itemId: i1, returnKg: 0, shortageKg: 0 }, { itemId: i2, returnKg: 0, shortageKg: 0 }]);
  assert.equal(after.status, 'CLOSED', 'پس از تأیید واحد فروش سفارش باید بسته شود');
  assert.equal(await statusOf(o.id), 'CLOSED');
  // از فهرست آماده‌سازی انبار هم خارج شده است
  const prep = await call('GET', '/api/orders?status=WAREHOUSE_PREPARING', { cookie: wh });
  assert.ok(!(prep.json.orders || []).some((x) => x.id === o.id), 'سفارش بسته‌شده نباید در آماده‌سازی انبار بماند');
});

test('کسریِ بی‌تصمیم همچنان جلوی بسته‌شدن را می‌گیرد؛ با «تکمیل محصول» و پایان عملیات بسته می‌شود', async () => {
  const o = await newOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }, { productId: 'p02', requestedQty: 50, requestedUnit: 'کیلوگرم' }]);
  const [i1, i2] = o.items.map((x) => x.id);
  // p02 فقط ۳۰ از ۵۰ کیلو وزن و ارسال می‌شود (کسری ۲۰ بدون تصمیم)
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 100 }, { itemId: i2, deliveredKg: 30 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } })).status, 200);
  const after = await deliverCycle(o, 1, [{ itemId: i1, returnKg: 0, shortageKg: 0 }, { itemId: i2, returnKg: 0, shortageKg: 0 }]);
  assert.equal(after.status, 'WAREHOUSE_PREPARING', 'کسریِ بی‌تصمیم نباید بی‌صدا بسته شود');
  // پایان عملیات با تصمیم خالی هنوز برای قلم کسری خطا می‌دهد و نام قلم را می‌گوید
  const fd0 = await call('POST', `/api/orders/${o.id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [] } });
  assert.equal(fd0.status, 400);
  assert.match(String(fd0.json.error), /تعیین‌تکلیف نشده/);
  // انبار همان یک قلم را تعیین‌تکلیف می‌کند؛ پایان عملیات (بدون تصمیم دستی) حالا کار می‌کند و می‌بندد
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/complete`, { ...IDEM(), cookie: wh, body: { itemId: i2 } })).status, 200);
  const fd1 = await call('POST', `/api/orders/${o.id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [] } });
  assert.equal(fd1.status, 200, 'پایان عملیات پس از تعیین‌تکلیف همهٔ اقلام باید موفق شود: ' + JSON.stringify(fd1.json).slice(0, 160));
  assert.equal(await statusOf(o.id), 'CLOSED');
});
