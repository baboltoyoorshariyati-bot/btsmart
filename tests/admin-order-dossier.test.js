'use strict';
/* v37.50.0 — پروندهٔ کامل سفارش برای مدیر و انبار روی سرور واقعی.
   مدیر از فهرست سوابق، سفارشی را باز می‌کند که هنوز در جریان است (نه فقط سفارش‌های
   پاسخ‌داده‌شده) و باید نوع سفارش، اطلاعات کامل مشتری، اقلام، وزن‌کشی با کاربر و
   فهرست همهٔ رویدادها را ببیند. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Td3!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-admin-orders-'));
const port = 5546;
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
    proc.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
});
after(() => { if (proc) proc.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function call(method, p, { cookie, body } = {}) {
  const h = {};
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json };
}
async function login(u, p) {
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const cookie = ((res.headers.get('set-cookie') || '').match(/sid=([^;]+)/) || [])[0];
  assert.ok(cookie, 'login ' + u);
  return cookie;
}

test('مدیر همهٔ سفارش‌ها را با پروندهٔ کامل و کاربر هر مرحله می‌بیند', async () => {
  // نشست مدیر یکتاست؛ پس از تغییر رمز همان کوکی معتبر می‌ماند.
  const admin = await login('admin', ADMIN_PASS);
  assert.equal((await call('POST', '/api/account/password', { cookie: admin, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);
  const mk = (username, roleCode) => call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false } });
  assert.equal((await mk('m-sales', 'sales')).status, 201);
  assert.equal((await mk('m-wh', 'warehouse')).status, 201);
  assert.equal((await mk('m-gate', 'gate')).status, 201);
  const sales = await login('m-sales', PASS), wh = await login('m-wh', PASS), gate = await login('m-gate', PASS);

  const visit = await call('POST', '/api/visits', { cookie: gate, body: { name: 'مشتری پرونده', phone: '09350000002', plate: '۱۲ب۳۴۵-۶۷', company: 'شرکت آزمایشی' } });
  assert.equal(visit.status, 201, JSON.stringify(visit.json));
  const created = await call('POST', '/api/orders', { cookie: sales, body: { visitId: visit.json.visit.id, items: [{ productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم' }], deliveryMode: 'PICKUP' } });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const orderId = created.json.order.id, itemId = created.json.order.items[0].id;
  assert.equal((await call('POST', `/api/orders/${orderId}/warehouse/accept`, { cookie: wh, body: {} })).status, 200);
  const preparing = await call('POST', `/api/orders/${orderId}/warehouse/start-preparing`, { cookie: wh, body: {} });
  assert.equal(preparing.status, 200);

  // فهرست سوابق مدیر: سفارش در جریان هم پیدا می‌شود و ثبت‌کننده و نوع را دارد.
  const list = await call('GET', '/api/admin/orders?limit=25&offset=0&q=09350000002', { cookie: admin });
  assert.equal(list.status, 200);
  const row = (list.json.orders || []).find((o) => o.id === orderId);
  assert.ok(row, 'سفارش در فهرست سوابق مدیر دیده می‌شود');
  assert.equal(row.orderTypeLabel, 'حضوری');
  assert.equal(row.createdByName, 'm-sales', 'ثبت‌کنندهٔ سفارش روی ردیف فهرست مشخص است');
  assert.equal(row.phone, '09350000002');

  // پروندهٔ کامل
  const dossier = await call('GET', `/api/admin/orders/${orderId}/history`, { cookie: admin });
  assert.equal(dossier.status, 200);
  const order = dossier.json.order;
  assert.equal(order.orderTypeLabel, 'حضوری');
  assert.equal(order.customer.name, 'مشتری پرونده');
  assert.equal(order.customer.phone, '09350000002');
  assert.equal(order.customer.plate.includes('45') || order.customer.plate.includes('۴۵'), true, 'پلاک مشتری در پرونده هست');
  assert.equal(order.createdBy.name, 'm-sales');
  assert.equal(order.warehouseAcceptedBy.name, 'm-wh', 'کاربر دریافت انبار مشخص است');
  assert.equal(order.warehousePreparationStartedBy.name, 'm-wh');
  assert.ok(order.warehouseAcceptedAt && order.warehousePreparationStartedAt);
  assert.equal(dossier.json.items[0].id, itemId);
  // هر رویداد باید کاربر و برچسب داشته باشد تا «چه کسی هر مرحله را ثبت کرد» پاسخ بگیرد.
  const actions = dossier.json.events.map((e) => e.action);
  for (const action of ['CREATE_VISIT', 'CREATE_ORDER', 'WAREHOUSE_ACCEPT_ORDER', 'WAREHOUSE_START_PREPARING']) assert.ok(actions.includes(action), action);
  assert.ok(dossier.json.events.every((e) => e.actor && e.actor.name), 'همهٔ رویدادها کاربر ثبت‌کننده دارند');
  assert.equal(dossier.json.events.find((e) => e.action === 'CREATE_ORDER').actor.name, 'm-sales');

  // نقش‌های غیرمدیر به فهرست مدیر دسترسی ندارند.
  assert.equal((await call('GET', '/api/admin/orders', { cookie: sales })).status, 403);
  assert.equal((await call('GET', `/api/admin/orders/${orderId}/history`, { cookie: sales })).status, 403);
});
