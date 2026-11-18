'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
// v37.6.0 — «اقلام سرویس اول باید ارسال شوند»: ارسال وزن‌شده‌های هر سرویس به فروش، تعیین راننده،
// تحویل فیزیکی و فاکتور/تأیید دریافت جداگانه برای هر سرویس — همه در همان سفارش واحد فروشگاه.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PRODUCTS_SEED } = require('../lib/catalog');

const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Ts7!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-sr-dispatch-'));
const port = 5421;
const BASE = `http://127.0.0.1:${port}`;
const SIG = `data:image/png;base64,${'A'.repeat(300)}`;
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

async function call(method, p, { cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { }
  const setCookie = res.headers.get('set-cookie');
  const sid = setCookie && setCookie.match(/sid=([^;]+)/);
  return { status: res.status, json, cookie: sid && sid[1] && sid[1] !== '' ? `sid=${sid[1]}` : null };
}
const IDEM = () => ({ headers: { 'Idempotency-Key': 'k-' + Math.random().toString(36).slice(2) } });
async function login(u, p) { const r = await call('POST', '/api/login', { body: { username: u, password: p } }); assert.equal(r.status, 200); return r.cookie; }

let admin, sales, wh, storeUser, drv1, drv2, gateCk;
let driverId, driverId2;
const ids = {};

async function mkUser(username, roleCode, extra = {}) {
  const r = await call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return login(username, PASS);
}
async function freshStoreOrder(items, opts = {}) {
  const r = await call('POST', '/api/store/orders', { ...IDEM(), cookie: storeUser, body: { name: opts.name || 'مشتری تست', phone: '09120000000', notes: '', items } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const id = r.json.order.id;
  const q = await call('POST', `/api/store/orders/${id}/quick-send`, { ...IDEM(), cookie: sales, body: { dispatchPlace: 'فروشگاه تست' } });
  assert.equal(q.status, 200);
  assert.equal((await call('POST', `/api/orders/${id}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${id}/warehouse/start-preparing`, { cookie: wh, body: {} })).status, 200);
  return r.json.order;
}
const getOrder = async (cookie, id) => (await call('GET', `/api/orders/${id}`, { cookie })).json?.order || (await call('GET', `/api/store/orders/${id}`, { cookie })).json?.order || {};
const ok = (r, msg) => { if (r.status !== 200) console.error(msg, r.status, r.json); assert.equal(r.status, 200, msg); return r.json.order; };
const LINE1 = () => [{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }, { productId: 'p02', requestedQty: 50, requestedUnit: 'کیلوگرم' }];

// ---------- راه‌اندازی ----------
test('راه‌اندازی: کاربران، راننده و سفارش فروشگاه', async () => {
  const boot = await login('admin', ADMIN_PASS);
  const newAdmin = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  assert.equal((await call('POST', '/api/account/password', { cookie: boot, body: { currentPassword: ADMIN_PASS, newPassword: newAdmin } })).status, 200);
  admin = boot;
  sales = await mkUser('srd-sales', 'sales');
  wh = await mkUser('srd-wh', 'warehouse');
  storeUser = await mkUser('srd-shop', 'store', { storeName: 'بابل طیور آزمایشی' });
  gateCk = await mkUser('srd-gate', 'gate');
  const d = await call('POST', '/api/drivers', { cookie: admin, body: { fullName: 'علی راننده', phone: '09129998877', vehicleType: 'وانت', plate: '12ب34567' } });
  assert.equal(d.status, 201, JSON.stringify(d.json));
  driverId = d.json.driver.id;
  drv1 = await mkUser('srd-driver', 'driver', { driverId });
  const d2 = await call('POST', '/api/drivers', { cookie: admin, body: { fullName: 'رضا راننده دوم', phone: '09129998876', vehicleType: 'وانت', plate: '13ب34567' } });
  assert.equal(d2.status,201,JSON.stringify(d2.json));driverId2=d2.json.driver.id;drv2=await mkUser('srd-driver2','driver',{driverId:driverId2});
  const o = await freshStoreOrder(LINE1());
  ids.order = o.id; ids.i1 = o.items[0].id; ids.i2 = o.items[1].id;
});

// ---------- گاردهای ارسال سرویس به فروش ----------
test('گارد: ارسال قبل از وزن (409)، سرویس دوم پیش از اول (409)، نقش نامجاز (403)، شماره نامعتبر (400)', async () => {
  const o = await freshStoreOrder(LINE1());
  const i1 = o.items[0].id;
  const r1 = await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } });
  assert.equal(r1.status, 409, 'وزن ثبت‌نشده ارسال نمی‌شود');
  assert.match(String(r1.json.error), /وزن واقعی/);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 40 }] } })).status, 200);
  const r2first = await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 2 } });
  assert.equal(r2first.status, 409, 'سرویس دوم بدون سرویس اول ممنوع');
  assert.match(String(r2first.json.error), /سرویس اول/);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: sales, body: { run: 1 } })).status, 403, 'فروش مجاز به ارسال نیست');
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 3 } })).status, 400, 'شماره سرویس نامعتبر');
});

test('ارسال سرویس اول: علامت اقلام، درخواست نزد فروش، ایدempotنتی، قفل وزن پس از ارسال', async () => {
  assert.equal((await call('GET', `/api/orders/${ids.order}/store-run/print/1`, {cookie:wh})).status,404);
  const early = await call('POST', `/api/orders/${ids.order}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } });
  assert.equal(early.status, 409, 'بدون وزن ارسال نمی‌شود');
  assert.equal((await call('POST', `/api/orders/${ids.order}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: ids.i1, deliveredKg: 105 }] } })).status, 200, 'بیش از درخواست پذیرفته');
  const sent = await call('POST', `/api/orders/${ids.order}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } });
  const o = ok(sent, 'send-run-1');
  const firstPrint=await call('GET', `/api/orders/${ids.order}/store-run/print/1`, {cookie:wh});
  assert.equal(firstPrint.status,200); assert.deepEqual(firstPrint.json.document.lines.map(x=>x.deliveredKg),[105]);
  assert.equal(firstPrint.json.document.lines[0].netKg,null);
  assert.equal((await call('GET', `/api/orders/${ids.order}/store-run/print/2`, {cookie:wh})).status,404);
  assert.equal((await call('GET', `/api/orders/${ids.order}/store-run/print/1`, {cookie:storeUser})).status,403);
  assert.equal((await call('GET', `/api/orders/${ids.order}/store-run/print/1`, {cookie:drv1})).status,403);
  assert.equal((await call('GET', `/api/orders/${ids.order}/store-run/print/3`, {cookie:wh})).status,400);
  const pending=await call('GET', '/api/warehouse/store-documents', {cookie:wh});assert.equal(pending.status,200);
  const row=pending.json.documents.find(x=>x.orderId===ids.order&&x.run===1);assert.ok(row);assert.match(row.warehouseDocumentNo,/^W-\d{6}$/);assert.equal(row.driverName,'');ids.doc1=row.warehouseDocumentNo;
  assert.equal((await call('GET', `/api/warehouse/store-documents/${ids.order}/1`, {cookie:wh})).status,409);
  assert.equal((await call('GET', '/api/warehouse/store-documents', {cookie:storeUser})).status,403);
  assert.equal((await call('GET', `/api/warehouse/store-documents/${ids.order}/1`, {cookie:sales})).status,403);
  assert.equal(o.storeRunOps.r1Shipment.status, 'PENDING_SALES');
  assert.deepEqual(o.storeRunOps.r1Shipment.itemIds, [ids.i1]);
  assert.ok(o.items.find((x) => x.id === ids.i1).sentRun1.at);
  const again = await call('POST', `/api/orders/${ids.order}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } });
  assert.equal(again.status, 200, 'تکرار = بی‌اثر');
  assert.equal((await call('POST', `/api/orders/${ids.order}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: ids.i1, deliveredKg: 1 }] } })).status, 409, 'سرویس ارسال‌شده قفل وزن است');
  // فروش اعلان غلتکی دریافت کرد
  const notif = await call('GET', '/api/notifications', { cookie: sales });
  assert.ok(notif.json.notifications.some((n) => n.type === 'STORE_RUN_R1_SENT' && n.entityId === ids.order));
});

// ---------- فروش: قیمت‌گذاری و تعیین راننده برای سرویس ----------
test('فروش: send-dispatch بدون run روی سفارش سرویس‌دار 409؛ نقش نامجاز 403؛ بدون راننده 400؛ با run=1 موفق و بدون قیمت (v37.6.0)', async () => {
  const plain = await call('POST', `/api/orders/${ids.order}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, items: [{ itemId: ids.i1, unitPrice: 5000 }] } });
  assert.equal(plain.status, 409, 'سفارش در تسویهٔ کلاسیک نیست');
  assert.equal((await call('POST', `/api/orders/${ids.order}/send-dispatch`, { ...IDEM(), cookie: wh, body: { driverId, run: 1 } })).status, 403);
  const noDriver = await call('POST', `/api/orders/${ids.order}/send-dispatch`, { ...IDEM(), cookie: sales, body: { run: 1 } });
  assert.equal(noDriver.status, 400, 'راننده الزامی است');
  const sd = await call('POST', `/api/orders/${ids.order}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run: 1 } });
  const o = ok(sd, 'send-dispatch run=1 بدون هیچ قیمتی');
  assert.equal(o.dispatch.run, 1);
  assert.equal(o.dispatch.status, 'ASSIGNED');
  assert.equal(o.dispatch.priceFree, true, 'فلوی فروشگاه کاملاً بدون قیمت است');
  assert.equal(o.dispatch.approvedTotalAmount, 0);
  assert.deepEqual(o.dispatch.priceLines, [{ itemId: ids.i1, productName: PRODUCTS_SEED[0].name, deliveredKg: 105, unitPrice: null, amount: null }]);
  assert.deepEqual(o.dispatch.shipmentItemIds, [ids.i1]);
  assert.equal(o.items.find((x) => x.id === ids.i1).unitPrice ?? null, null, 'روی قلم هیچ فی ثبت نمی‌شود');
  const after = await getOrder(sales, ids.order);
  assert.equal(after.storeRunOps.r1Shipment.status, 'DISPATCHED');
  assert.equal(after.dispatch.driverName, 'علی راننده');
  const doc=await call('GET', `/api/warehouse/store-documents/${ids.order}/1`, {cookie:wh});assert.equal(doc.status,200);assert.equal(doc.json.document.driverName,'علی راننده');assert.equal(doc.json.document.warehouseDocumentNo,ids.doc1);assert.deepEqual(doc.json.document.lines.map(x=>x.deliveredKg),[105]);assert.equal(doc.json.document.lines[0].requestedQty,100);assert.doesNotMatch(JSON.stringify(doc.json),/unitPrice|finalAmount|تومان/);
});

test('راننده/نگهبان: خروج سرویس ۱ → درحال ارسال → تحویل با امضا', async () => {
  const exit = await call('POST', `/api/driver/orders/${ids.order}/exit`, { ...IDEM(), cookie: drv1, body: {} });
  assert.equal(exit.status, 200, JSON.stringify(exit.json));
  assert.equal(exit.json.order.dispatch.status, 'DRIVER_EXIT_REPORTED');
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.order}/exit`, { ...IDEM(), cookie: gateCk, body: {} })).status, 200);
  const deliver = await call('POST', `/api/driver/orders/${ids.order}/deliver`, { ...IDEM(), cookie: drv1, body: { signatureData: SIG, settlementType: 'CASH', lines: [{ itemId: ids.i1, returnKg: 0, shortageKg: 0 }] } });
  assert.equal(deliver.status, 200, JSON.stringify(deliver.json));
  assert.equal(deliver.json.order.dispatch.status, 'DELIVERED');
  assert.equal(deliver.json.order.dispatch.lines[0].deliveredKg, 105);
  assert.equal(deliver.json.order.dispatch.lines[0].netKg, 105);
});

test('سرویس دوم: تعیین راننده پیش از نهایی‌شدن تحویل سرویس اول در فروش → 409', async () => {
  assert.equal((await call('POST', `/api/orders/${ids.order}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: ids.i2 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${ids.order}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: ids.i2, deliveredKg: 80 }] } })).status, 200, 'کمتر از درخواست هم پذیرفته');
  ok(await call('POST', `/api/orders/${ids.order}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 2 } }), 'send-run-2');
  const listing=await call('GET','/api/warehouse/store-documents',{cookie:wh});const second=listing.json.documents.find(x=>x.orderId===ids.order&&x.run===2);assert.ok(second);assert.match(second.warehouseDocumentNo,/^W-\d{6}$/);assert.notEqual(second.warehouseDocumentNo,ids.doc1);ids.doc2=second.warehouseDocumentNo;assert.equal(second.driverName,'');assert.equal((await call('GET',`/api/warehouse/store-documents/${ids.order}/2`,{cookie:wh})).status,409);
  const premature = await call('POST', `/api/orders/${ids.order}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, items: [{ itemId: ids.i2, unitPrice: 7000 }], run: 2 } });
  assert.equal(premature.status, 409);
  assert.match(String(premature.json.error), /نهایی/);
  // پایان روز هم تا پاسخ فروش بسته است (سرویس ۲ نزد فروش معلق)
  const fin = await call('POST', `/api/orders/${ids.order}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [{ itemId: ids.i1, action: 'complete' }, { itemId: ids.i2, action: 'complete' }] } });
  assert.equal(fin.status, 409);
  assert.match(String(fin.json.error), /معلق/);
});

test('نهایی‌کردن تحویل سرویس ۱: فاکتور اول با deliveryRun=1 و سفارش باز می‌ماند', async () => {
  const fin = await call('POST', `/api/sales/dispatch-deliveries/${ids.order}/finalize`, { ...IDEM(), cookie: sales, body: {} });
  const o = ok(fin, 'finalize-run1');
  assert.equal(o.dispatch.status, 'SALES_FINALIZED');
  assert.equal(o.dispatch.run, 1);
  assert.equal(o.status, 'WAREHOUSE_PREPARING', 'سرویس دوم هنوز در مسیر است');
  const full = await getOrder(sales, ids.order);
  assert.equal(full.payments.length, 1);
  assert.equal(full.payments[0].deliveryRun, 1);
  assert.ok(full.payments[0].invoiceNumber);
  assert.equal(full.payments[0].totalAmount, 0, 'فاکتور سرویس مبلغی ندارد (سند تحویل است)');
  assert.equal(full.payments[0].priceLines.length, 1);
  assert.equal(full.payments[0].priceLines[0].deliveredKg, 105);
  assert.equal(full.payments[0].priceLines[0].amount, null, 'سطر فاکتور فروشگاه مبلغ ندارد');
  const dd = await call('GET', '/api/sales/dispatch-deliveries', { cookie: sales });
  assert.ok(dd.json.finalized.some((x) => x.id === ids.order && (x.dispatch.run || null) === 1), 'ردیف نهایی سرویس ۱ با برچسب سرویس');
});

test('فروشگاه: تأیید دریافت محمولهٔ سرویس اول جداگانه است', async () => {
  const r = await call('POST', `/api/store/orders/${ids.order}/confirm-receipt`, { ...IDEM(), cookie: storeUser, body: { run: 1 } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.order.dispatch.storeReceiptConfirmedAt, 'اسلات فعلی هنوز سرویس ۱ است');
  const again = await call('POST', `/api/store/orders/${ids.order}/confirm-receipt`, { ...IDEM(), cookie: storeUser, body: { run: 1 } });
  assert.equal(again.status, 200, 'ایدempotنت');
  assert.equal((await call('POST', `/api/store/orders/${ids.order}/confirm-receipt`, { ...IDEM(), cookie: storeUser, body: { run: 2 } })).status, 404, 'محموله‌ای برای تأیید نیست');
});

test('سرویس دوم: چرخهٔ کامل به پخش و تحویل → فاکتور دوم مستقل', async () => {
  const sd = await call('POST', `/api/orders/${ids.order}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId:driverId2, run: 2 } });
  const o = ok(sd, 'send-dispatch run=2');
  assert.equal(o.dispatch.run, 2);
  assert.equal(o.dispatches.length, 1, 'خدمه‌بر سرویس اول آرشیو شد');
  assert.equal(o.dispatches[0].run, 1);
  assert.equal(o.dispatches[0].status, 'SALES_FINALIZED');
  const doc1=await call('GET',`/api/warehouse/store-documents/${ids.order}/1`,{cookie:wh}),doc2=await call('GET',`/api/warehouse/store-documents/${ids.order}/2`,{cookie:wh});assert.equal(doc1.status,200);assert.equal(doc2.status,200);assert.equal(doc1.json.document.driverName,'علی راننده');assert.equal(doc2.json.document.driverName,'رضا راننده دوم');assert.equal(doc1.json.document.warehouseDocumentNo,ids.doc1);assert.equal(doc2.json.document.warehouseDocumentNo,ids.doc2);assert.deepEqual(doc1.json.document.lines.map(x=>x.deliveredKg),[105]);assert.deepEqual(doc2.json.document.lines.map(x=>x.deliveredKg),[80]);
  assert.equal(o.dispatch.approvedTotalAmount, 0, 'بدون قیمت');
  assert.equal((await call('POST', `/api/driver/orders/${ids.order}/exit`, { ...IDEM(), cookie: drv2, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/gate/dispatch/${ids.order}/exit`, { ...IDEM(), cookie: gateCk, body: {} })).status, 200);
  const deliver = await call('POST', `/api/driver/orders/${ids.order}/deliver`, { ...IDEM(), cookie: drv2, body: { signatureData: SIG, settlementType: 'CREDIT', lines: [{ itemId: ids.i2, returnKg: 5, shortageKg: 0, reason: 'بسته آسیب‌دیده' }] } });
  assert.equal(deliver.status, 200, JSON.stringify(deliver.json));
  assert.equal(deliver.json.order.dispatch.lines[0].netKg, 75);
  assert.equal(deliver.json.order.dispatch.lines[0].deliveredKg, 80, 'تحویل سرویس ۲ فقط قلم خودش');
  const fin = await call('POST', `/api/sales/dispatch-deliveries/${ids.order}/finalize`, { ...IDEM(), cookie: sales, body: {} });
  const o2 = ok(fin, 'finalize-run2');
  assert.equal(o2.dispatch.run, 2);
  assert.equal(o2.status, 'CLOSED', 'v37.33.0 — با تأیید نهایی فروش و اقلام کاملِ ارسال‌شده، سفارش خودکار بسته و به سوابق می‌رود');
});

test('پس از بسته‌شدن خودکار با تأیید فروش، پایان عملیات روز دیگر لازم نیست (409) و اسناد سر جایشان‌اند', async () => {
  // v37.33.0 — سفارش در تست قبلی با نهایی‌شدن سرویس دوم نزد فروش بسته شد؛ پایان روز روی سفارش بسته 409 است
  const fin = await call('POST', `/api/orders/${ids.order}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [{ itemId: ids.i1, action: 'complete' }, { itemId: ids.i2, action: 'complete' }] } });
  assert.equal(fin.status, 409, 'سفارش بسته‌شده دیگر در مرحلهٔ آماده‌سازی نیست');
  const o = await getOrder(sales, ids.order);
  assert.equal(o.status, 'CLOSED');
  const full = await getOrder(sales, ids.order);
  assert.equal(full.payments.length, 2, 'دو فاکتور مستقل');
  assert.deepEqual(full.payments.map((p) => p.deliveryRun).sort((a, b) => a - b), [1, 2]);
  assert.notEqual(full.payments[0].invoiceNumber, full.payments[1].invoiceNumber);
  assert.equal(full.payments.find((p) => p.deliveryRun === 2).totalAmount, 0, 'سند دوم هم بدون مبلغ');
  assert.equal(full.payments.find((p) => p.deliveryRun === 2).priceLines[0].deliveredKg, 75, 'وزن خالص سند دوم بعد از مرجوعی');
  assert.equal(full.dispatchRuns.length, 1, 'سرویس اول در آرشیو پرونده است');
  for(const ck of [sales,wh]){
    const p1=await call('GET', `/api/orders/${ids.order}/store-run/print/1`, {cookie:ck});
    const p2=await call('GET', `/api/orders/${ids.order}/store-run/print/2`, {cookie:ck});
    assert.equal(p1.status,200);assert.equal(p2.status,200);
    assert.deepEqual(p1.json.document.lines.map(x=>x.deliveredKg),[105]);
    assert.deepEqual(p2.json.document.lines.map(x=>x.deliveredKg),[80]);
    assert.equal(p2.json.document.lines[0].returnKg,5);assert.equal(p2.json.document.lines[0].netKg,75);
  }
  const history=await call('GET','/api/warehouse/history?orderType=STORE',{cookie:wh});
  assert.deepEqual(history.json.rows.find(x=>x.id===ids.order).printRuns,[1,2]);
});

test('فروشگاه: تأیید دریافت محمولهٔ سرویس دوم و مشاهدهٔ دو فاکتور در جزئیات سفارش', async () => {
  const r = await call('POST', `/api/store/orders/${ids.order}/confirm-receipt`, { ...IDEM(), cookie: storeUser, body: { run: 2 } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const full = await getOrder(storeUser, ids.order);
  assert.ok(full.dispatch.storeReceiptConfirmedAt, 'اسلات فعلی سرویس دوم');
  assert.ok(full.dispatchRuns[0].storeReceiptConfirmedAt, 'تأیید سرویس اول در آرشیو باقی مانده');
  assert.equal(full.payments.length, 2);
  // فهرست سفارش‌های فروشگاه هم هر دو پرداخت را برمی‌گرداند
  const list = await call('GET', '/api/store/orders', { cookie: storeUser });
  assert.ok(list.json.orders.find((x) => x.id === ids.order).payments.length >= 2);
});

test('سوابق هر راننده فقط سرویس مربوط به خود را نشان می‌دهد', async () => {
  for (const [cookie,run] of [[drv1,1],[drv2,2]]) {
    const mine=await call('GET','/api/driver/orders',{cookie});const hist=mine.json.history.filter(x=>x.id===ids.order);
    assert.equal(hist.length,1);assert.equal(hist[0].dispatch.run,run);assert.equal(hist[0].dispatch.hasSignature,false);
  }
});

test('پایان روز: وزن ارسال‌نشده → 400؛ درخواست معلق نزد فروش → 409', async () => {
  const o = await freshStoreOrder([{ productId: 'p01', requestedQty: 20, requestedUnit: 'کیلوگرم' }]);
  const i1 = o.items[0].id;
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 10 }] } })).status, 200);
  ok(await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } }), 'send r1');
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: i1 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: i1, deliveredKg: 8 }] } })).status, 200);
  const unsent = await call('POST', `/api/orders/${o.id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [{ itemId: i1, action: 'complete' }] } });
  assert.equal(unsent.status, 400, 'وزن ارسال‌نشده نمی‌ماند');
  assert.match(String(unsent.json.error), /ارسال سرویس/);
  ok(await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 2 } }), 'send r2');
  const pending = await call('POST', `/api/orders/${o.id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [{ itemId: i1, action: 'complete' }] } });
  assert.equal(pending.status, 409, 'فروش هنوز اقدام نکرده');
  assert.match(String(pending.json.error), /معلق/);
});

test('فروش: endpoint فهرست ارسال‌های سرویس در انتظار → ردیف با اقلام و سرویس', async () => {
  const o = await freshStoreOrder([{ productId: 'p01', requestedQty: 15, requestedUnit: 'کیلوگرم' }]);
  const i1 = o.items[0].id;
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 12.5 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } })).status, 200);
  const list = await call('GET', '/api/sales/store-run-shipments', { cookie: sales });
  assert.equal(list.status, 200);
  const hit = list.json.shipments.find((x) => x.orderId === o.id);
  assert.ok(hit, 'سفارش در فهرست انتظار است');
  assert.equal(hit.run, 1);
  assert.equal(hit.storeName, 'فروشگاه شعبه 1 بابل طیور آزمایشی');
  assert.equal(hit.items.length, 1);
  assert.equal(hit.items[0].deliveredKg, 12.5);
  assert.equal((await call('GET', '/api/sales/store-run-shipments', { cookie: wh })).status, 403, 'نقش نامجاز');
  // پس از تعیین راننده از فهرست حذف می‌شود
  assert.equal((await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, items: [{ itemId: i1, unitPrice: 1000 }], run: 1 } })).status, 200);
  const list2 = await call('GET', '/api/sales/store-run-shipments', { cookie: sales });
  assert.ok(!list2.json.shipments.some((x) => x.orderId === o.id), 'از صف انتظار خارج شد');
});

test('ارسال سرویس بدون قیمت: فقط اقلام همان ارسال، با وزن خودشان و بدون هیچ مبلغی (v37.6.0)', async () => {
  const o = await freshStoreOrder(LINE1());
  const i1 = o.items[0].id, i2 = o.items[1].id;
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 20 }, { itemId: i2, deliveredKg: 30 }] } })).status, 200);
  ok(await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } }), 'send');
  const sd = await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run: 1 } });
  assert.equal(sd.status, 200, JSON.stringify(sd.json));
  const d = sd.json.order.dispatch;
  assert.equal(d.priceFree, true);
  assert.equal(d.approvedTotalAmount, 0);
  assert.deepEqual(d.shipmentItemIds.sort(), [i1, i2].sort());
  assert.equal(d.priceLines.length, 2);
  for (const l of d.priceLines) { assert.equal(l.unitPrice, null); assert.equal(l.amount, null); assert.ok(l.deliveredKg > 0); }
  assert.equal(d.shipmentWeights[i1], 20);
  assert.equal(d.shipmentWeights[i2], 30);
});

test('رگرسیون ۳۷.۵ (v37.6.0 بدون قیمت): قلم با بخشی در سرویس اول و مانده در دوم → اسناد هر سرویس فقط وزن خودش را دارند', async () => {
  const o = await freshStoreOrder([{ productId: 'p01', requestedQty: 20, requestedUnit: 'کیلوگرم' }]);
  const i1 = o.items[0].id;
  assert.equal((await getOrder(sales, o.id)).hasReturnedGoods, false, 'پیش از ثبت مرجوعی، پرچم سوابق خاموش است');
  assert.equal((await call('GET', `/api/orders/${o.id}/returns`, { cookie: sales })).status, 404, 'برگه‌ای برای سفارش بدون مرجوعی وجود ندارد');
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: i1, deliveredKg: 10 }] } })).status, 200);
  ok(await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 1 } }), 'send r1');
  // قلم در هر دو سرویس وزن دارد: مانده به سرویس دوم
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: i1 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: i1, deliveredKg: 8 }] } })).status, 200);
  ok(await call('POST', `/api/orders/${o.id}/store-run/send-run`, { ...IDEM(), cookie: wh, body: { run: 2 } }), 'send r2');
  // چرخهٔ کامل سرویس ۱ (بدون قیمت)
  const sd1 = await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run: 1 } });
  assert.equal(sd1.status, 200, JSON.stringify(sd1.json));
  assert.deepEqual(sd1.json.order.dispatch.shipmentWeights, { [i1]: 10 }, 'مستند وزن سرویس اول');
  assert.equal((await call('POST', `/api/driver/orders/${o.id}/exit`, { ...IDEM(), cookie: drv1, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/gate/dispatch/${o.id}/exit`, { ...IDEM(), cookie: gateCk, body: {} })).status, 200);
  const d1 = await call('POST', `/api/driver/orders/${o.id}/deliver`, { ...IDEM(), cookie: drv1, body: { signatureData: SIG, settlementType: 'CASH', lines: [{ itemId: i1, returnKg: 1, shortageKg: 0, reason: 'وزنکشی اشتباه' }] } });
  assert.equal(d1.status, 200, JSON.stringify(d1.json));
  assert.equal(d1.json.order.dispatch.lines[0].netKg, 9, 'تحویل سرویس ۱ فقط با وزن همان سرویس');
  assert.equal((await call('POST', `/api/sales/dispatch-deliveries/${o.id}/finalize`, { ...IDEM(), cookie: sales, body: {} })).status, 200);
  // سرویس دوم: مستند بدون بازخورد وزن سرویس اول
  const sd2 = await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run: 2 } });
  assert.equal(sd2.status, 200, JSON.stringify(sd2.json));
  assert.equal(sd2.json.order.dispatch.shipmentWeights[i1], 8);
  assert.equal((await call('POST', `/api/driver/orders/${o.id}/exit`, { ...IDEM(), cookie: drv1, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/gate/dispatch/${o.id}/exit`, { ...IDEM(), cookie: gateCk, body: {} })).status, 200);
  // بیش از آنچه در مستند سرویس است پذیرفته نمی‌شود (ملاک ۸ کیلو، نه ۱۸)
  const over = await call('POST', `/api/driver/orders/${o.id}/deliver`, { ...IDEM(), cookie: drv1, body: { signatureData: SIG, settlementType: 'CASH', lines: [{ itemId: i1, returnKg: 9, shortageKg: 0, reason: 'x' }] } });
  assert.equal(over.status, 400, 'بیش از وزن سرویس (۸) پذیرفته نمی‌شود');
  const dl = await call('POST', `/api/driver/orders/${o.id}/deliver`, { ...IDEM(), cookie: drv1, body: { signatureData: SIG, settlementType: 'CASH', lines: [{ itemId: i1, returnKg: 4, shortageKg: 1, reason: 'مرجوعی/کسری' }] } });
  assert.equal(dl.status, 200, JSON.stringify(dl.json));
  assert.equal(dl.json.order.dispatch.lines[0].deliveredKg, 8, 'خط تحویل وزن سرویس دوم');
  assert.equal(dl.json.order.dispatch.lines[0].netKg, 3);
  assert.equal((await call('POST', `/api/sales/dispatch-deliveries/${o.id}/finalize`, { ...IDEM(), cookie: sales, body: {} })).status, 200);
  const full = await getOrder(sales, o.id);
  assert.equal(full.hasReturnedGoods, true, 'بعد از ثبت مرجوعی گزینهٔ چاپ فعال است');
  const returnSheet = await call('GET', `/api/orders/${o.id}/returns`, { cookie: sales });
  assert.equal(returnSheet.status, 200, JSON.stringify(returnSheet.json));
  assert.deepEqual(returnSheet.json.returns.map(item => item.kg).sort((a,b) => a-b), [1, 4]);
  assert.equal((await call('GET', `/api/orders/${o.id}/returns`, { cookie: wh })).status, 403, 'فقط فروش و مدیر به برگهٔ چاپ دسترسی دارند');
  const p1 = full.payments.find((p) => p.deliveryRun === 1);
  const p2 = full.payments.find((p) => p.deliveryRun === 2);
  assert.equal(p1.totalAmount, 0);
  assert.equal(p2.totalAmount, 0, 'هر دو فاکتور سرویس بدون مبلغ‌اند (سند تحویل)');
  // سند دوم فقط وزن خودش را دارد — بدون بازخورد وزن سرویس اول
  assert.equal(p2.priceLines[0].deliveredKg, 3, 'وزن خالص (۸ − ۴ مرجوعی − ۱ کسری)');
  assert.equal(p2.priceLines[0].amount, null);
  assert.equal(p2.priceLines[0].returnKg, 4);
  assert.equal(p1.priceLines[0].deliveredKg, 9);
  assert.equal(p1.priceLines[0].amount, null);
  assert.equal(p1.priceLines[0].returnKg, 1);
});
