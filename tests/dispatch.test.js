'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
// تست یکپارچگی واحد پخش: از فروش تا تحویل راننده و سوابق مدیر
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Td3!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-dispatch-'));
const port = 5521;
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
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  const sid = (res.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  return { status: res.status, json, cookie: sid && sid[1] ? `sid=${sid[1]}` : null };
}
const login = (u, p, ip) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: u, password: p }) })
  .then(async (r) => ({ status: r.status, cookie: ((r.headers.get('set-cookie') || '').match(/sid=([^;]+)/) || [])[0] || null }));

const SIG = `data:image/png;base64,${'A'.repeat(300)}`;
const S = {}; // کوکی‌ها و شناسه‌ها
const ids = {};

test('راه‌اندازی: مدیر، رانندگان، کاربران پخش و راننده', async () => {
  S.admin = (await login('admin', ADMIN_PASS, '10.7.0.1')).cookie;
  assert.ok(S.admin);
  assert.equal((await call('POST', '/api/account/password', { cookie: S.admin, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);
  // The original session remains valid after changing its password.

  const d1 = await call('POST', '/api/drivers', { cookie: S.admin, body: { fullName: 'رضا محمدی', phone: '۰۹۱۲۱۲۳۴۵۶۷', vehicleType: 'وانت', plate: '12ب34567', posTerminal: 'POS-01', posBank: 'بانک ملت' } });
  assert.equal(d1.status, 201, JSON.stringify(d1.json));
  // v37.3.4 — شماره تماس (با ارقام فارسی) نرمال و نام بانک پوز ذخیره می‌شود
  assert.equal(d1.json.driver.phone, '09121234567');
  assert.equal(d1.json.driver.posBank, 'بانک ملت');
  ids.driver1 = d1.json.driver.id;
  const d2 = await call('POST', '/api/drivers', { cookie: S.admin, body: { fullName: 'حسین کریمی', phone: '09351112233', vehicleType: 'کامیون', plate: '23د45678', posTerminal: '' } });
  ids.driver2 = d2.json.driver.id;
  // فیلد نوع خودرو و پلاک الزامی است
  assert.equal((await call('POST', '/api/drivers', { cookie: S.admin, body: { fullName: 'بی‌خودرو', phone: '09120000000', plate: '11ب11111' } })).status, 400);
  // v37.3.4 — شماره تماس راننده الزامی و معتبر است
  assert.equal((await call('POST', '/api/drivers', { cookie: S.admin, body: { fullName: 'بی‌تلفن', vehicleType: 'وانت', plate: '11ب11112' } })).status, 400);
  assert.equal((await call('POST', '/api/drivers', { cookie: S.admin, body: { fullName: 'تلفن بد', phone: 'abc', vehicleType: 'وانت', plate: '11ب11113' } })).status, 400);

  const mk = (username, roleCode, extra = {}) => call('POST', '/api/admin/users', { cookie: S.admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
  assert.equal((await mk('dispatch1', 'dispatch')).status, 201);
  assert.equal((await mk('driver1', 'driver')).status, 400, 'راننده بدون اتصال به رکورد نباید ساخته شود');
  assert.equal((await mk('driver1', 'driver', { driverId: ids.driver1 })).status, 201);
  assert.equal((await mk('driver2', 'driver', { driverId: ids.driver2 })).status, 201);
  assert.equal((await mk('driver3', 'driver', { driverId: ids.driver1 })).status, 400, 'هر راننده فقط به یک حساب وصل شود');
  assert.equal((await mk('sales1', 'sales')).status, 201);
  assert.equal((await mk('gate1', 'gate')).status, 201);
  assert.equal((await mk('wh1', 'warehouse')).status, 201);
  S.dispatch = (await login('dispatch1', PASS, '10.7.0.3')).cookie;
  S.driver1 = (await login('driver1', PASS, '10.7.0.4')).cookie;
  S.driver2 = (await login('driver2', PASS, '10.7.0.5')).cookie;
  S.sales = (await login('sales1', PASS, '10.7.0.6')).cookie;
  S.gate = (await login('gate1', PASS, '10.7.0.7')).cookie;
  S.wh = (await login('wh1', PASS, '10.7.0.8')).cookie;
  assert.ok(S.dispatch && S.driver1 && S.driver2 && S.sales && S.gate && S.wh);
});

test('یک سفارش تا مرحله‌ی تسویه پیش می‌رود (گیت → فروش → انبار)', async () => {
  const v = await call('POST', '/api/visits', { cookie: S.gate, body: { name: 'مشتری پخش', phone: '۰۹۱۲۷۷۷۷۷۷۷', plate: '۱۲ب۳۴۵-۶۷', district: 'شمال' } });
  assert.equal(v.status, 201, JSON.stringify(v.json));
  const o = await call('POST', '/api/orders', { cookie: S.sales, body: { visitId: v.json.visit.id, items: [{ productId: 'p01', requestedQty: 50, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(o.status, 201, JSON.stringify(o.json));
  ids.order = o.json.order.id;
  assert.equal((await call('POST', `/api/orders/${ids.order}/warehouse/accept`, { cookie: S.wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${ids.order}/warehouse/start-preparing`, { cookie: S.wh, body: {} })).status, 200);
  const cur = await call('GET', `/api/orders/${ids.order}`, { cookie: S.wh });
  ids.item = cur.json.order.items[0].id;
  const fin = await call('POST', `/api/orders/${ids.order}/warehouse`, { cookie: S.wh, body: { items: [{ itemId: ids.item, deliveredKg: 42 }] } });
  assert.equal(fin.status, 200, JSON.stringify(fin.json));
  assert.equal(fin.json.order.status, 'SETTLEMENT_PENDING');
});

test('ارسال و تخصیص راننده از کارتابل فروش انجام می‌شود', async () => {
  assert.equal((await call('GET', '/api/dispatch/drivers', { cookie: S.sales })).status, 200);
  assert.equal((await call('POST', `/api/orders/${ids.order}/send-dispatch`, { cookie: S.sales, body: {} })).status, 400, 'راننده باید در فروش انتخاب شود');
  assert.equal((await call('POST', `/api/orders/${ids.order}/send-dispatch`, { cookie: S.dispatch, body: { driverId: ids.driver1 } })).status, 403);
  const missingPrice = await call('POST', `/api/orders/${ids.order}/send-dispatch`, { cookie: S.sales, body: { driverId: ids.driver1 } });
  assert.equal(missingPrice.status, 400, 'قیمت باید پیش از دسترسی راننده تأیید شود');
  const r = await call('POST', `/api/orders/${ids.order}/send-dispatch`, { cookie: S.sales, body: { driverId: ids.driver1, items: [{ itemId: ids.item, unitPrice: 2000 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.order.dispatch.status, 'ASSIGNED');
  const assignedQueue=await call('GET','/api/sales/dispatch-deliveries',{cookie:S.sales});
  assert(assignedQueue.json.active.some(o=>o.id===ids.order));
  assert(!assignedQueue.json.pending.some(o=>o.id===ids.order));
  const workload=await call('GET','/api/workload',{cookie:S.sales});assert(workload.json.counts.salesDeliveryActive>=1);
  assert.equal((await call('POST',`/api/sales/dispatch-deliveries/${ids.order}/finalize`,{cookie:S.sales,body:{}})).status,409,'تخصیص نباید امکان تأیید زودهنگام ایجاد کند');
  assert.equal(r.json.order.dispatch.driverName, 'رضا محمدی');
  assert.equal(r.json.order.dispatch.approvedTotalAmount, 84000);
  assert.ok(r.json.order.dispatch.priceApprovedAt);
  assert.equal(r.json.order.items.find((item) => item.id === ids.item).unitPrice, 2000);
  assert.equal((await call('POST', `/api/orders/${ids.order}/send-dispatch`, { cookie: S.sales, body: { driverId: ids.driver1, items: [{ itemId: ids.item, unitPrice: 3000 }] } })).status, 409);
  const reassignedBySales = await call('POST', `/api/dispatch/orders/${ids.order}/assign`, { cookie: S.sales, body: { driverId: ids.driver1 } });
  assert.equal(reassignedBySales.status, 200, JSON.stringify(reassignedBySales.json));
  assert.equal((await call('POST', `/api/dispatch/orders/${ids.order}/assign`, { cookie: S.dispatch, body: { driverId: ids.driver2 } })).status, 403, 'واحد پخش دیگر تخصیص انجام نمی‌دهد');
});

test('مدیر هم از کارتابل فروش تخصیص می‌دهد و راننده سفارش را می‌بیند', async () => {
  const v = await call('POST', '/api/visits', { cookie: S.gate, body: { name: 'مشتری تست مدیر', phone: '۰۹۱۲۷۷۷۷۷۷۸', plate: '۱۲ب۳۴۵-۶۸', district: 'شمال' } });
  assert.equal(v.status, 201, JSON.stringify(v.json));
  const created = await call('POST', '/api/orders', { cookie: S.sales, body: { visitId: v.json.visit.id, items: [{ productId: 'p01', requestedQty: 20, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  ids.adminOrder = created.json.order.id;
  assert.equal((await call('POST', `/api/orders/${ids.adminOrder}/warehouse/accept`, { cookie: S.wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${ids.adminOrder}/warehouse/start-preparing`, { cookie: S.wh, body: {} })).status, 200);
  const current = await call('GET', `/api/orders/${ids.adminOrder}`, { cookie: S.wh });
  const itemId = current.json.order.items[0].id;
  const finalized = await call('POST', `/api/orders/${ids.adminOrder}/warehouse`, { cookie: S.wh, body: { items: [{ itemId, deliveredKg: 18 }] } });
  assert.equal(finalized.status, 200, JSON.stringify(finalized.json));
  const sent = await call('POST', `/api/orders/${ids.adminOrder}/send-dispatch`, { cookie: S.admin, body: { driverId: ids.driver2, items: [{ itemId, unitPrice: 2500 }] } });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  assert.equal(sent.json.order.dispatch.status, 'ASSIGNED');
  assert.equal(sent.json.order.dispatch.approvedTotalAmount, 45000);
  const driverCart = await call('GET', '/api/driver/orders', { cookie: S.driver2 });
  const driverOrder = driverCart.json.open.find((order) => order.id === ids.adminOrder);
  assert.ok(driverOrder);
  assert.equal(driverOrder.items[0].unitPrice, 2500);
  assert.equal(driverOrder.dispatch.approvedTotalAmount, 45000);
  const workload = await call('GET', '/api/workload', { cookie: S.admin });
  assert.equal(workload.json.counts.dispatchPending, 0);
  assert.equal(workload.json.counts.salesSettlement, 2, 'شمارنده با سفارش‌های جاری قابل مشاهده در صف تسویه هماهنگ است، از جمله سفارش‌های تخصیص‌یافته');
  const readOnlyDispatch = await call('GET', '/api/dispatch/orders?status=assigned', { cookie: S.dispatch });
  assert.ok(readOnlyDispatch.json.orders.some((order) => order.id === ids.adminOrder));
  const driverRoster = readOnlyDispatch.json.drivers.find((driver) => driver.id === ids.driver2);
  assert.equal(driverRoster.vehicleType, 'کامیون');
  assert.equal(driverRoster.plate, '23د45678');
  assert.equal(driverRoster.activeOrderCount, 1);
  assert.equal(driverRoster.liveOrders[0].customerName, 'مشتری تست مدیر');
  assert.equal((await call('POST', `/api/dispatch/orders/${ids.adminOrder}/assign`, { cookie: S.dispatch, body: { driverId: ids.driver1 } })).status, 403);
});

test('راننده فقط سفارش‌های خودش را می‌بیند', async () => {
  const mine = await call('GET', '/api/driver/orders', { cookie: S.driver1 });
  assert.equal(mine.status, 200);
  assert.equal(mine.json.driver.plate, '12ب34567');
  assert.ok(mine.json.open.some((x) => x.id === ids.order));
  const other = await call('GET', '/api/driver/orders', { cookie: S.driver2 });
  assert.ok(!other.json.open.some((x) => x.id === ids.order));
  assert.equal((await call('POST', `/api/driver/orders/${ids.order}/start`, { cookie: S.driver2, body: {} })).status, 404);
  assert.equal((await call('GET', '/api/driver/orders', { cookie: S.sales })).status, 403);
});

test('راننده خروج را ثبت می‌کند و نگهبان آن را تأیید می‌کند', async () => {
  const gl = await call('GET', '/api/gate/dispatch', { cookie: S.gate });
  assert.equal(gl.status, 200);
  assert.ok(gl.json.awaitingDriver.some((x) => x.id === ids.order), 'سفارش تخصیص‌یافته منتظر اقدام راننده است');
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.order}/exit`, { cookie: S.gate, body: {} })).status, 409, 'نگهبان پیش از ثبت خروج راننده نمی‌تواند تایید کند');
  assert.equal((await call('POST', `/api/driver/orders/${ids.order}/exit`, { cookie: S.driver2, body: {} })).status, 404, 'رانندهٔ دیگر حق اقدام ندارد');
  assert.equal((await call('POST', `/api/driver/orders/${ids.order}/exit`, { cookie: S.sales, body: {} })).status, 403, 'فروش خروج راننده را ثبت نمی‌کند');
  const r = await call('POST', `/api/driver/orders/${ids.order}/exit`, { cookie: S.driver1, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.order.dispatch.status, 'DRIVER_EXIT_REPORTED');
  assert((await call('GET','/api/sales/dispatch-deliveries',{cookie:S.sales})).json.active.some(o=>o.id===ids.order&&o.dispatch.status==='DRIVER_EXIT_REPORTED'));
  assert.equal(r.json.order.dispatch.driverExitBy, 'driver1');
  assert.equal((await call('POST', `/api/driver/orders/${ids.order}/exit`, { cookie: S.driver1, body: {} })).status, 409);
  const pendingGate = await call('GET', '/api/gate/dispatch', { cookie: S.gate });
  assert.ok(pendingGate.json.leaving.some((x) => x.id === ids.order), 'خروج ثبت‌شده منتظر تأیید نگهبان است');
  assert.ok(!pendingGate.json.inTransit.some((x) => x.id === ids.order));
  const gateNotifications = await call('GET', '/api/notifications', { cookie: S.gate });
  assert.ok(gateNotifications.json.notifications.some((n) => n.type === 'DISPATCH_DRIVER_EXIT_PENDING' && n.entityType === 'order' && n.entityId === ids.order), 'اعلان خروج راننده برای نگهبانی ثبت شود');
  const driverPending = await call('GET', '/api/driver/orders', { cookie: S.driver1 });
  assert.ok(driverPending.json.open.some((x) => x.id === ids.order), 'راننده تا تایید نگهبان سفارش را در کارتابل خود می‌بیند');
  assert.equal((await call('POST', `/api/driver/orders/${ids.order}/deliver`, { cookie: S.driver1, body: {} })).status, 409, 'ثبت تحویل پیش از تأیید خروج نگهبان ممنوع است');
  const dispatchList = await call('GET', '/api/dispatch/orders?status=assigned', { cookie: S.dispatch });
  assert.ok(dispatchList.json.orders.some((x) => x.id === ids.order));
  const workload = await call('GET', '/api/workload', { cookie: S.gate });
  assert.equal(workload.json.counts.gateDispatchPending, 1);
  const confirmed = await call('POST', `/api/gate/dispatch/${ids.order}/exit`, { cookie: S.gate, body: {} });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.json));
  assert.equal(confirmed.json.order.dispatch.status, 'IN_TRANSIT');
  assert.equal(confirmed.json.order.dispatch.gateExitBy, 'gate1');
  const after = await call('GET', '/api/gate/dispatch', { cookie: S.gate });
  assert.ok(after.json.inTransit.some((x) => x.id === ids.order));
  assert.equal((await call('GET', '/api/workload', { cookie: S.gate })).json.counts.gateDispatchPending, 0);
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.order}/exit`, { cookie: S.gate, body: {} })).status, 409, 'تأیید خروج دوباره ثبت نشود');
  assert.equal((await call('POST', `/api/dispatch/orders/${ids.order}/assign`, { cookie: S.sales, body: { driverId: ids.driver2 } })).status, 409, 'پس از ثبت خروج تغییر راننده ممنوع است');
});

test('نگهبان فقط پس از ثبت خروج توسط راننده اجازهٔ تأیید دارد', async () => {
  const gl = await call('GET', '/api/gate/dispatch', { cookie: S.gate });
  assert.ok(gl.json.awaitingDriver.some((x) => x.id === ids.adminOrder));
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.adminOrder}/exit`, { cookie: S.driver2, body: {} })).status, 403);
  assert.equal((await call('POST', `/api/orders/${ids.adminOrder}/exit`, { cookie: S.gate, body: {} })).status, 409);
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.adminOrder}/exit`, { cookie: S.gate, body: {} })).status, 409, 'نگهبان پیش از اعلام راننده نباید تایید کند');
  const driverReport = await call('POST', `/api/driver/orders/${ids.adminOrder}/exit`, { cookie: S.driver2, body: {} });
  assert.equal(driverReport.status, 200, JSON.stringify(driverReport.json));
  assert.equal(driverReport.json.order.dispatch.status, 'DRIVER_EXIT_REPORTED');
  const r = await call('POST', `/api/gate/dispatch/${ids.adminOrder}/exit`, { cookie: S.gate, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.order.dispatch.status, 'IN_TRANSIT');
  assert((await call('GET','/api/sales/dispatch-deliveries',{cookie:S.sales})).json.active.some(o=>o.id===ids.order&&o.dispatch.status==='IN_TRANSIT'));
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.adminOrder}/exit`, { cookie: S.gate, body: {} })).status, 409);
});

test('ثبت تحویل: نوع تسویه الزامی است؛ کسری یا مرجوعی بدون علت و بیشتر از وزن رد می‌شود', async () => {
  const url = `/api/driver/orders/${ids.order}/deliver`;
  assert.equal((await call('POST', url, { cookie: S.driver1, body: { signatureData: SIG, lines: [] } })).status, 400, 'بدون نوع تسویه');
  const noReason = { signatureData: SIG, settlementType: 'CASH', lines: [{ itemId: ids.item, returnKg: 2 }] };
  assert.equal((await call('POST', url, { cookie: S.driver1, body: noReason })).status, 400, 'بدون علت');
  const over = { signatureData: SIG, settlementType: 'CASH', lines: [{ itemId: ids.item, returnKg: 30, shortageKg: 20, reason: 'x' }] };
  assert.equal((await call('POST', url, { cookie: S.driver1, body: over })).status, 400, 'بیش از وزن تحویلی');
  assert.equal((await call('POST', url, { cookie: S.driver2, body: { signatureData: SIG, settlementType: 'CASH', lines: [] } })).status, 404, 'راننده‌ی دیگر');
});

test('تحویل موفق با مرجوعی ۵ کیلو و کسری ۱ کیلو، تسویه اعتباری', async () => {
  const body = { settlementType: 'CREDIT', note: 'تحویل در درب انبار مشتری', lines: [{ itemId: ids.item, returnKg: 5, shortageKg: 1, reason: 'بسته‌بندی آسیب‌دیده' }] };
  const r = await call('POST', `/api/driver/orders/${ids.order}/deliver`, { cookie: S.driver1, body });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const d = r.json.order.dispatch;
  assert.equal(d.status, 'DELIVERED');
  assert.equal(d.settlementType, 'CREDIT');
  assert.equal(d.lines[0].netKg, 36);
  assert.equal(d.grossAmount, 84000, 'مبلغ اولیه بر اساس ۴۲ کیلو و قیمت تأییدشده محاسبه شود');
  assert.equal(d.lines[0].returnAmount, 10000, 'مرجوعی ۵ کیلو از فاکتور کسر شود');
  assert.equal(d.returnDeduction, 10000);
  assert.equal(d.amountDue, 74000, 'کسری یک کیلو به‌تنهایی مبلغ را کاهش ندهد');
  assert.equal(d.hasSignature, false);
  assert.equal(d.signatureData, undefined, 'تصویر امضا در فهرست‌ها برنمی‌گردد');
  const salesQueue = await call('GET', '/api/sales/dispatch-deliveries', { cookie: S.sales });
  assert(!salesQueue.json.active.some(o=>o.id===ids.order));
  assert.ok(salesQueue.json.pending.some((x) => x.id === ids.order), 'تحویل برای بازبینی در صف فروش باشد');
  assert.ok(!salesQueue.json.finalized.some((x) => x.id === ids.order));
  assert.equal((await call('GET', '/api/sales/dispatch-deliveries', { cookie: S.gate })).status, 403, 'صف تأیید فقط برای فروش است');
  const gateQueue = await call('GET', '/api/gate/dispatch', { cookie: S.gate });
  assert.ok(!gateQueue.json.leaving.some((x) => x.id === ids.order));
  assert.ok(!gateQueue.json.inTransit.some((x) => x.id === ids.order));
  assert.equal((await call('GET', '/api/workload', { cookie: S.gate })).json.counts.gateDispatchPending, 0);
  assert.equal((await call('GET', '/api/workload', { cookie: S.sales })).json.counts.salesDeliveryPending, 1);
  const salesNotifications = await call('GET', '/api/notifications', { cookie: S.sales });
  assert.ok(salesNotifications.json.notifications.some((n) => n.type === 'DISPATCH_DELIVERY_PENDING_SALES' && n.entityId === ids.order));
  const signature = await call('GET', `/api/sales/dispatch-deliveries/${ids.order}`, { cookie: S.sales });
  assert.equal(signature.status, 200);
  assert.equal(signature.json.signatureData, '');
  assert.equal((await call('POST', `/api/sales/dispatch-deliveries/${ids.order}/finalize`, { cookie: S.gate, body: {} })).status, 403, 'نگهبانی نمی‌تواند تحویل را نهایی کند');
  assert.equal((await call('POST', `/api/driver/orders/${ids.order}/deliver`, { cookie: S.driver1, body })).status, 409, 'تحویل دوباره');
});

test('مرجوعی: برگه نزد فروش می‌آید، فروش به انبار ارجاع می‌دهد، انبار دریافت می‌کند', async () => {
  const open = await call('GET', '/api/returns', { cookie: S.sales });
  const t = open.json.returns.find((x) => x.orderId === ids.order);
  assert.ok(t, 'برگه‌ی مرجوعی نزد فروش باشد');
  assert.equal(t.status, 'AT_SALES');
  assert.equal(t.kg, 5);
  assert.equal((await call('POST', `/api/returns/${t.id}/receive`, { cookie: S.wh, body: {} })).status, 409, 'انبار قبل از ارجاع نمی‌تواند دریافت کند');
  assert.equal((await call('POST', `/api/returns/${t.id}/refer`, { cookie: S.wh, body: {} })).status, 403);
  assert.equal((await call('POST', `/api/returns/${t.id}/refer`, { cookie: S.sales, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/returns/${t.id}/refer`, { cookie: S.sales, body: {} })).status, 409);
  const atWh = await call('GET', '/api/returns?status=AT_WAREHOUSE', { cookie: S.wh });
  assert.ok(atWh.json.returns.some((x) => x.id === t.id));
  const rc = await call('POST', `/api/returns/${t.id}/receive`, { cookie: S.wh, body: {} });
  assert.equal(rc.status, 200);
  assert.equal(rc.json.return.status, 'RECEIVED');
  assert.equal((await call('GET', '/api/returns', { cookie: S.driver1 })).status, 403);
});

test('سفارش تحویل‌شده در فهرست امروز راننده است و تصویر امضا فقط برای مدیر', async () => {
  const mine = await call('GET', '/api/driver/orders', { cookie: S.driver1 });
  assert.ok(mine.json.todayDone.some((x) => x.id === ids.order));
  assert.ok(mine.json.delivered.some((x) => x.id === ids.order),'تحویل ثبت‌شده باید در سربرگ «تحویل شده» باشد');
  for(const key of ['assigned','inTransit','delivered','history'])assert.ok(Array.isArray(mine.json[key]),`سربرگ ${key} باید آرایه داشته باشد`);
  assert.equal((await call('GET', `/api/admin/driver-records/${ids.order}`, { cookie: S.driver1 })).status, 403);
  const det = await call('GET', `/api/admin/driver-records/${ids.order}`, { cookie: S.admin });
  assert.equal(det.status, 200);
  assert.equal(det.json.signatureData, '');
});

test('مدیر سوابق راننده را روزانه می‌بیند و با فیلتر مرجوعی/کسری جستجو می‌کند', async () => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const rec = await call('GET', `/api/admin/driver-records?driverId=${ids.driver1}&from=${day}&to=${day}`, { cookie: S.admin });
  assert.equal(rec.status, 200);
  assert.equal(rec.json.days.length, 1);
  assert.equal(rec.json.days[0].day, day);
  assert.equal(rec.json.totals.count, 1);
  assert.equal(rec.json.totals.returnKg, 5);
  assert.equal(rec.json.totals.shortageKg, 1);
  assert.equal(rec.json.days[0].deliveries[0].settlementType, 'CREDIT');
  const ret = await call('GET', `/api/admin/driver-records?driverId=${ids.driver1}&kind=return`, { cookie: S.admin });
  assert.equal(ret.json.totals.count, 1);
  const short2 = await call('GET', `/api/admin/driver-records?driverId=${ids.driver2}`, { cookie: S.admin });
  assert.equal(short2.json.totals.count, 0);
  const cash = await call('GET', `/api/admin/driver-records?settlement=CASH`, { cookie: S.admin });
  assert.equal(cash.json.totals.count, 0);
  const past = await call('GET', `/api/admin/driver-records?driverId=${ids.driver1}&to=2000-01-01`, { cookie: S.admin });
  assert.equal(past.json.totals.count, 0);
});

test('پس از تحویل، فروش سفارش را نهایی می‌کند و نگهبانی دیگر اقدامی ندارد', async () => {
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.order}/close`, { cookie: S.driver1, body: {} })).status, 403);
  assert.equal((await call('GET', '/api/workload', { cookie: S.gate })).json.counts.gateDispatchPending, 0);
  assert.equal((await call('GET', '/api/workload', { cookie: S.sales })).json.counts.salesDeliveryPending, 1);
  const retiredGateAction = await call('POST', `/api/gate/dispatch/${ids.order}/close`, { cookie: S.gate, body: {} });
  assert.equal(retiredGateAction.status, 410, 'پس از تحویل هیچ خروج نهایی به نگهبانی ارسال نمی‌شود');
  const r = await call('POST', `/api/sales/dispatch-deliveries/${ids.order}/finalize`, { cookie: S.sales, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.order.dispatch.status, 'SALES_FINALIZED');
  assert.equal(r.json.order.dispatch.salesFinalizedBy, 'sales1');
  assert.ok(r.json.order.dispatch.salesFinalizedAt);
  assert.equal(r.json.order.status, 'SETTLED');
  assert.match(r.json.order.payment.invoiceNumber, /^\d{6}$/);
  assert.equal(r.json.order.payment.grossAmount, 84000);
  assert.equal(r.json.order.payment.returnDeduction, 10000);
  assert.equal(r.json.order.payment.totalAmount, 74000);
  assert.equal(r.json.order.payment.debtAccount.initial, 74000);
  const debt = await call('GET', `/api/customers/${r.json.order.customerId}/debts`, {cookie:S.sales});
  assert.equal(debt.json.balance, 74000);
  const finance = await call('GET', '/api/reports', { cookie: S.admin });
  assert.equal(finance.json.finance.revenue, 74000, 'مبلغ خالص مرجوعی‌خورده باید وارد گزارش مالی شود');
  const queue = await call('GET', '/api/sales/dispatch-deliveries', { cookie: S.sales });
  assert.ok(!queue.json.pending.some((x) => x.id === ids.order));
  assert.ok(queue.json.finalized.some((x) => x.id === ids.order));
  assert.equal((await call('GET', '/api/workload', { cookie: S.sales })).json.counts.salesDeliveryPending, 0);
  assert.equal((await call('GET', '/api/workload', { cookie: S.gate })).json.counts.gateExit, 0, 'تحویل پخش‌شده به شمارندهٔ خروج نگهبانی نمی‌رود');
  const gateSettled = await call('GET', '/api/orders?status=SETTLED', { cookie: S.gate });
  assert.ok(!gateSettled.json.orders.some((x) => x.id === ids.order), 'فاکتور تحویل‌شده در صف کنترل خروج نگهبان نمایش داده نشود');
  assert.equal((await call('GET', `/api/orders/${ids.order}`, { cookie: S.gate })).status, 403, 'جزئیات سفارش نهایی‌شدهٔ پخش برای نگهبانی باز نشود');
  assert.equal((await call('POST', `/api/sales/dispatch-deliveries/${ids.order}/finalize`, { cookie: S.sales, body: {} })).status, 409, 'تأیید نهایی دوباره ثبت نشود');
});

test('گزارش مرجوعی: منبع سوابق رانندگان در گزارش‌ها موجود است', async () => {
  const src = await call('GET', '/api/admin/reports/sources', { cookie: S.admin });
  assert.ok(src.json.sources.some((x) => x.key === 'driverRecords'));
  const q = await call('POST', '/api/admin/reports/query', { cookie: S.admin, body: { source: 'driverRecords', fields: ['orderNo', 'driverName', 'productName', 'returnKg', 'settlementType'], filters: [{ field: 'returnKg', op: 'gte', value: '1' }] } });
  assert.equal(q.status, 200, JSON.stringify(q.json));
  assert.equal(q.json.total, 1);
  assert.equal(q.json.rows[0].driverName, 'رضا محمدی');
});

test('راننده‌ی دارای سابقه حذف نمی‌شود و تخصیص مجدد پس از تحویل ممنوع است', async () => {
  const del = await call('DELETE', `/api/drivers/${ids.driver1}`, { cookie: S.admin, body: {} });
  assert.equal(del.status, 409);
  assert.equal(del.json.code, 'HAS_HISTORY');
  assert.equal((await call('POST', `/api/dispatch/orders/${ids.order}/assign`, { cookie: S.sales, body: { driverId: ids.driver2 } })).status, 409);
});

test('ممیزی: ارسال، تخصیص، شروع، تحویل و سوابق در زنجیره‌ی ممیزی ثبت می‌شوند', async () => {
  const a = await call('GET', '/api/admin/audit?entityType=order', { cookie: S.admin });
  const actions = new Set(a.json.audit.map((x) => x.action));
  for (const act of ['SEND_TO_DISPATCH', 'DISPATCH_ASSIGN', 'DISPATCH_DRIVER_EXIT', 'DISPATCH_GATE_EXIT', 'DISPATCH_DELIVERED', 'DISPATCH_SALES_FINALIZE']) assert.ok(actions.has(act), act);
  const v = await call('GET', '/api/admin/audit/verify', { cookie: S.admin });
  assert.equal(v.json.ok, true);
});

test('تغییر قیمت در نقطهٔ نهایی‌سازی: فروش فی قلم را پیش از صدور فاکتور اصلاح و فاکتور با فی جدید صادر می‌شود (v37.6.0)', async () => {
  const v = await call('POST', '/api/visits', { cookie: S.gate, body: { name: 'مشتری اصلاح قیمت', phone: '۰۹۱۲۶۵۴۳۲۱۰', plate: '۱۲ب۹۸۷-۷۶', district: 'شمال' } });
  assert.equal(v.status, 201);
  const created = await call('POST', '/api/orders', { cookie: S.sales, body: { visitId: v.json.visit.id, items: [{ productId: 'p01', requestedQty: 30, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const oid = created.json.order.id;
  assert.equal((await call('POST', `/api/orders/${oid}/warehouse/accept`, { cookie: S.wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${oid}/warehouse/start-preparing`, { cookie: S.wh, body: {} })).status, 200);
  const cur = await call('GET', `/api/orders/${oid}`, { cookie: S.wh });
  const itemId = cur.json.order.items[0].id;
  assert.equal((await call('POST', `/api/orders/${oid}/warehouse`, { cookie: S.wh, body: { items: [{ itemId, deliveredKg: 28 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${oid}/send-dispatch`, { cookie: S.sales, body: { driverId: ids.driver1, items: [{ itemId, unitPrice: 1000 }], discountAmount: 5000, additionsAmount: 1000 } })).status, 200);
  assert.equal((await call('POST', `/api/driver/orders/${oid}/exit`, { cookie: S.driver1, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/gate/dispatch/${oid}/exit`, { cookie: S.gate, body: {} })).status, 200);
  const deliver = await call('POST', `/api/driver/orders/${oid}/deliver`, { cookie: S.driver1, body: { signatureData: SIG, settlementType: 'CASH', lines: [{ itemId, returnKg: 5, shortageKg: 0, reason: 'مرجوعی' }] } });
  assert.equal(deliver.status, 200, JSON.stringify(deliver.json));
  assert.equal(deliver.json.order.dispatch.settlementMethods[0].amount,19000,'payment incorporates discounts, additions and return');
  const mismatch = await call('POST', `/api/sales/dispatch-deliveries/${oid}/finalize`, { cookie: S.sales, body: { items: [{ itemId, unitPrice: 2600 }] } });
  assert.equal(mismatch.status, 409, 'روش پرداخت باید مجدداً تأیید شود');
  assert.equal((await call('GET', `/api/orders/${oid}`, { cookie: S.sales })).json.order.items[0].unitPrice, 1000);
  // نهایی‌سازی همراه با اصلاح فی: اصلاح باید همان لحظه روی جزئیات فاکتور اعمال شود
  const fin = await call('POST', `/api/sales/dispatch-deliveries/${oid}/finalize`, { cookie: S.sales, body: { items: [{ itemId, unitPrice: 2600 }], settlementMethods: [{type:'CASH',amount:23*2600-4000}] } });
  assert.equal(fin.status, 200, JSON.stringify(fin.json));
  assert.equal(fin.json.order.payment.totalAmount, 23 * 2600 - 4000, 'فاکتور با قیمت و مرجوعی اصلاح‌شده صادر شد');
  assert.equal(fin.json.order.payment.returnDeduction, 5 * 2600);
  assert.equal(fin.json.order.payment.settlementMethods[0].amount, 23 * 2600 - 4000);
  assert.equal(fin.json.order.payment.priceLines[0].unitPrice, 2600);
  assert.equal(fin.json.order.items.find((x) => x.id === itemId).unitPrice, 2600, 'فی قلم به‌روز شد');
  const au = await call('GET', `/api/admin/audit?entityType=order&entityId=${oid}&limit=200`, { cookie: S.admin });
  assert.ok((au.json.audit||[]).some((x) => x.action === 'DISPATCH_PRICE_ADJUST'), 'لاگ تغییر قیمت ثبت شد');
  const entry = (au.json.audit||[]).find((x) => x.action === 'DISPATCH_PRICE_ADJUST');
  const det = typeof entry.details === 'string' ? JSON.parse(entry.details) : (entry.details || {});
  assert.equal(det.newPrice, 2600, 'جزئیات لاگ فی جدید را نگه می‌دارد');
  // پس از فاکتور دوباره نهایی (با یا بدون قیمت) ممکن نیست
  assert.equal((await call('POST', `/api/sales/dispatch-deliveries/${oid}/finalize`, { cookie: S.sales, body: { items: [{ itemId, unitPrice: 3000 }] } })).status, 409, 'فاکتور صادرشده دوباره تغییر نمی‌کند');
});
