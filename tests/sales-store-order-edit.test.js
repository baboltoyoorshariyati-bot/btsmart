'use strict';
/* v37.33.0 — ویرایش سفارش ورودی فروشگاه در کارتابل فروش:
   فروش باید بتواند پیش از تأیید، مقدار را تغییر دهد، قلم حذف کند و قلم تازه اضافه کند. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('عملیات سفارش ورودی فروشگاه در جزئیات قرار دارد', () => {
  const ui2 = read('public/ui2.js');
  const card = ui2.slice(ui2.indexOf('function renderSalesStoresV41'), ui2.indexOf('/* ---------- تب ۳'));
  assert.match(card, /data-action="store-order-details-v25"/);
  assert.doesNotMatch(card, /data-action="sales-edit-store-order"|data-action="store-approve-v25"/);
});

test('ویرایشگر فروش: بازکردن، افزودن/حذف ردیف، جست‌وجوی محصول و ذخیره با مسیر sales-edit', () => {
  const app = read('public/app.js');
  assert.match(app, /async function openSalesStoreOrderEdit\(id\)/);
  assert.match(app, /o\.status!=='STORE_PENDING_SALES'/, 'قفل وضعیت پیش از تأیید فروش در رابط نیست');
  assert.match(app, /function addSalesStoreLine\(\)/);
  assert.match(app, /function deleteSalesStoreLine\(i\)/);
  assert.match(app, /function salesStoreProductSearch\(i,q\)/);
  assert.match(app, /api\('\/api\/store\/orders\/'\+id\+'\/sales-edit',\{method:'PUT'/, 'ذخیره به مسیر sales-edit نمی‌رود');
  assert.match(app, /SALES_EDIT_STORE_ORDER:'ویرایش سفارش فروشگاه توسط فروش'/, 'برچسب سوابق فعالیت نیست');
  // دکمهٔ ویرایش داخل مودال جزئیات هم برای سفارش ورودی فروشگاه هست
  const details = app.slice(app.indexOf('async function openOrderDetails'), app.indexOf('function renderRemoteOrdersV21'));
  assert.match(details, /app\.page==='sales'&&can\('sales'\)&&o\.orderType==='STORE'&&o\.status==='STORE_PENDING_SALES'/);
  for (const action of ['sales-edit-store-order','store-approve-v25','store-quick-send-v40']) assert.ok(details.includes(`data-action="${action}"`));
});

test('مسیر سمت سرور sales-edit فقط برای فروش و فقط در وضعیت در انتظار بررسی فروش است', () => {
  const routes = read('lib/routes/orders.js');
  const seg = routes.slice(routes.indexOf("route('PUT', '/api/store/orders/:id/sales-edit'"), routes.indexOf("route('POST', '/api/store/orders/:id/confirm-receipt'"));
  assert.match(seg, /roles: \['sales'\]/);
  assert.match(seg, /order\.status !== 'STORE_PENDING_SALES'\) fail\(409/);
  assert.match(seg, /store\.audit\(ctx\.user, 'SALES_EDIT_STORE_ORDER'/, 'ثبت در سوابق فعالیت نیست');
});

// ---------- یکپارچگی با سرور واقعی ----------
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Tc3!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-test-3720-'));
let proc, BASE, adminCookie, salesCookie, storeCookie, whCookie;

async function call(method, p, { cookie, body } = {}) {
  const h = {};
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ignore */ }
  const sid = (res.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  return { status: res.status, json, cookie: sid && sid[1] ? `sid=${sid[1]}` : null };
}
const login = async (u, p, ip) => {
  const h = ip ? { 'X-Forwarded-For': ip } : {};
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ username: u, password: p }) });
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
  adminCookie = (await login('admin', ADMIN_PASS, '10.7.0.1')).cookie;
  const NEW_ADMIN = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  const ch = await call('POST', '/api/account/password', { cookie: adminCookie, body: { currentPassword: ADMIN_PASS, newPassword: NEW_ADMIN } });
  assert.equal(ch.status, 200, JSON.stringify(ch.json));
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: adminCookie, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  };
  await mk('sales3720', 'sales');
  await mk('wh3720', 'warehouse');
  await mk('store3720', 'store', { storeName: 'فروشگاه تست ۳۷۲۰' });
  salesCookie = (await login('sales3720', PASS, '10.7.0.2')).cookie;
  whCookie = (await login('wh3720', PASS, '10.7.0.3')).cookie;
  storeCookie = (await login('store3720', PASS, '10.7.0.4')).cookie;
  assert.ok(salesCookie && whCookie && storeCookie);
});

after(() => { if (proc) proc.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function createStoreOrder(items) {
  const r = await call('POST', '/api/store/orders', { cookie: storeCookie, body: { name: 'فروشگاه تست ۳۷۲۰', phone: '09121110000', items } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.order;
}
const activeItems = (order) => (order.items || []).filter((i) => i.itemStatus !== 'CANCELLED');

test('فروش مقدار را تغییر می‌دهد، قلم حذف و قلم تازه اضافه می‌کند', async () => {
  const order = await createStoreOrder([
    { productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم', description: 'ردیف اول' },
    { productId: 'p02', requestedQty: 5, requestedUnit: 'کیلوگرم' },
  ]);
  // p01: تغییر مقدار ۱۰←۷ • p02: حذف (حذف از فهرست) • p03: قلم تازه
  const edit = await call('PUT', `/api/store/orders/${order.id}/sales-edit`, {
    cookie: salesCookie,
    body: {
      notes: 'اصلاح توسط فروش',
      items: [
        { productId: 'p01', requestedQty: 7, requestedUnit: 'کیلوگرم', description: 'ردیف اول' },
        { productId: 'p03', requestedQty: 2, requestedUnit: 'بسته' },
      ],
    },
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.json));
  assert.equal(edit.json.order.status, 'STORE_PENDING_SALES', 'سفارش باید همچنان در انتظار تأیید فروش بماند');
  assert.equal(edit.json.order.notes, 'اصلاح توسط فروش');
  const items = activeItems(edit.json.order);
  assert.equal(items.length, 2, 'باید دقیقاً دو قلم فعال بماند');
  const byProduct = Object.fromEntries(items.map((i) => [i.productId, i]));
  assert.equal(Number(byProduct.p01.requestedQty), 7, 'مقدار قلم اول تغییر نکرده است');
  assert.equal(Number(byProduct.p03.requestedQty), 2, 'قلم تازه اضافه نشده است');
  assert.equal(byProduct.p03.requestedUnit, 'بسته');
  assert.ok(!byProduct.p02, 'قلم حذف‌شده هنوز فعال است');
});

test('فروشگاه و انبار حق ویرایش فروش را ندارند و پس از تأیید ویرایش قفل می‌شود', async () => {
  const order = await createStoreOrder([{ productId: 'p01', requestedQty: 4, requestedUnit: 'کیلوگرم' }]);
  const body = { items: [{ productId: 'p01', requestedQty: 9, requestedUnit: 'کیلوگرم' }] };
  assert.equal((await call('PUT', `/api/store/orders/${order.id}/sales-edit`, { cookie: storeCookie, body })).status, 403, 'فروشگاه نباید از مسیر فروش ویرایش کند');
  assert.equal((await call('PUT', `/api/store/orders/${order.id}/sales-edit`, { cookie: whCookie, body })).status, 403, 'انبار نباید ویرایش فروش انجام دهد');
  const empty = await call('PUT', `/api/store/orders/${order.id}/sales-edit`, { cookie: salesCookie, body: { items: [] } });
  assert.equal(empty.status, 400, 'حذف همهٔ اقلام نباید مجاز باشد');
  const bad = await call('PUT', `/api/store/orders/${order.id}/sales-edit`, { cookie: salesCookie, body: { items: [{ productId: 'nope', requestedQty: 1, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(bad.status, 400, 'محصول نامعتبر نباید پذیرفته شود');
  const sent = await call('POST', `/api/store/orders/${order.id}/quick-send`, { cookie: salesCookie, body: {} });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  const locked = await call('PUT', `/api/store/orders/${order.id}/sales-edit`, { cookie: salesCookie, body });
  assert.equal(locked.status, 409, 'پس از ارسال به انبار، ویرایش فروش باید قفل باشد');
  const view = await call('GET', `/api/orders/${order.id}`, { cookie: salesCookie });
  const items = activeItems(view.json.order);
  assert.equal(items.length, 1);
  assert.equal(Number(items[0].requestedQty), 4, 'مقدار سفارش قفل‌شده نباید تغییر کرده باشد');
});
