'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
// v37.4.0 — سفارش فروشگاه: دو سرویس ارسال در یک سفارش واحد (سناریوهای بند ۱۹ سند + قفل‌های سند)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Ts7!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-store-runs-'));
const port = 5321;
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

let admin, sales, wh, storeUser;
async function mkUser(username, roleCode, extra = {}) {
  await call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
  return login(username, PASS);
}
async function freshStoreOrder(items, opts = {}) {
  const r = await call('POST', '/api/store/orders', { ...IDEM(), cookie: storeUser, body: { name: opts.name || 'مشتری تست', phone: '09120000000', notes: opts.notes || '', items } });
  assert.equal(r.status, 201);
  const id = r.json.order.id;
  const q = await call('POST', `/api/store/orders/${id}/quick-send`, { ...IDEM(), cookie: sales, body: { dispatchPlace: 'فروشگاه تست' } });
  assert.equal(q.status, 200);
  const acc = await call('POST', `/api/orders/${id}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} });
  assert.equal(acc.status, 200);
  const st = await call('POST', `/api/orders/${id}/warehouse/start-preparing`, { cookie: wh, body: {} });
  assert.equal(st.status, 200);
  return id;
}
const get = async (cookie, p) => (await call('GET', p, { cookie })).json?.order || {};
const ok = (r, msg) => { if (r.status !== 200) console.error(msg, r.status, r.json); assert.equal(r.status, 200, msg); return r.json.order; };
const itemOf = (o, itemId) => o.items.find((i) => i.id === itemId);
const runViewOf = (o, itemId) => o.storeRun.items.find((x) => x.itemId === itemId);

// ---------- راه‌اندازی ----------
test('راه‌اندازی: کاربران نقش‌ها + گزارش scaffold', async () => {
  const boot = await login('admin', ADMIN_PASS);
  const newAdmin = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  const ch = await call('POST', '/api/account/password', { cookie: boot, body: { currentPassword: ADMIN_PASS, newPassword: newAdmin } });
  assert.equal(ch.status, 200);
  admin = boot;
  sales = await mkUser('sr-sales', 'sales');
  wh = await mkUser('sr-wh', 'warehouse');
  storeUser = await mkUser('sr-shop', 'store', { storeName: 'فروشگاه تست' });
});

// ---------- قفل ویژگی: فقط سفارش فروشگاه (قانون ۱۴ سند) ----------
test('سناریو ۱۰: مسیر عادی (غیرفروشگاه) دست‌نخورده است — store-run روی سفارش حضوری رد می‌شود', async () => {
  // یک سفارش حضوری واقعی از مسیر استاندارد (درگاه → فروش → انبار) تا گارد دامنه‌ای را روی orderType غیر STORE بیازماییم:
  const gate = await mkUser('sr-gate', 'gate');
  const v = await call('POST', '/api/visits', { ...IDEM(), cookie: gate, body: { name: 'مشتری حضوری تست', phone: '09300000000', noVehicle: true } });
  assert.equal(v.status, 201);
  const cr = await call('POST', '/api/orders', { ...IDEM(), cookie: sales, body: { visitId: v.json.visit.id, items: [{ productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(cr.status, 201);
  const oid = cr.json.order.id;
  const ac = await call('POST', `/api/orders/${oid}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} });
  assert.equal(ac.status, 200);
  for (const ep of ['weights', 'move', 'complete', 'out-of-stock', 'finalize-day']) {
    const r = await call('POST', `/api/orders/${oid}/store-run/${ep}`, { ...IDEM(), cookie: wh, body: { run: 1, itemId: 'x', items: [{ itemId: 'x', deliveredKg: 1 }], decisions: [] } });
    assert.equal(r.status, 409, ep);
    assert.match(r.json.error, /سفارش فروشگاه/, ep);
  }
  const o = (await call('GET', `/api/orders/${oid}`, { cookie: wh })).json.order;
  assert.equal(o.orderType, 'ONSITE');
  assert.equal(o.storeRun, undefined, 'سربرگ سرویس‌ها نباید به سفارش غیرفروشگاه اضافه شود');
  // مسیر قدیمی انبار برای سفارش حضوری همان‌طور که بود کار می‌کند (بدون ۴۰۹):
  const ready = await call('POST', `/api/orders/${oid}/warehouse/start-preparing`, { cookie: wh, body: {} });
  assert.equal(ready.status, 200);
});

// ---------- سناریو اول: ارسال کامل در دو سرویس ----------
test('سناریو ۱: ۱۰۰ کیلو، ۶۰ در سرویس اول و ۴۰ در سرویس دوم → تکمیل‌شده', async () => {
  const id = await freshStoreOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }]);
  let o = await get(wh, `/api/orders/${id}`);
  const item = o.items[0];
  assert.equal(o.storeRun.overall, 'AWAITING_R1');
  assert.equal(o.storeRun.counts.remaining, 1);

  o = await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: item.id, deliveredKg: 60 }] } }), 'r1');
  assert.equal(runViewOf(o, item.id).runStatus, 'IN_SHIPPING');
  assert.equal(runViewOf(o, item.id).r1Kg, 60);
  assert.equal(o.storeRun.overall, 'IN_PROGRESS');

  o = await ok(await call('POST', `/api/orders/${id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: item.id } }), 'move');
  assert.equal(runViewOf(o, item.id).runStatus, 'MOVED_R2');
  assert.equal(o.storeRun.overall, 'AWAITING_R2');
  assert.equal(o.storeRun.r2Status, 'PENDING');

  o = await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: item.id, deliveredKg: 40 }] } }), 'r2');
  assert.equal(runViewOf(o, item.id).r2Kg, 40);
  assert.equal(runViewOf(o, item.id).totalKg, 100);

  o = await ok(await call('POST', `/api/orders/${id}/store-run/complete`, { ...IDEM(), cookie: wh, body: { itemId: item.id } }), 'complete');
  assert.equal(runViewOf(o, item.id).runStatus, 'COMPLETED');
  assert.equal(o.storeRun.overall, 'COMPLETED');
  assert.equal(o.storeRun.counts.completed, 1);
});

// ---------- سناریو دوم: ارسال بیشتر از درخواستی بدون خطا ----------
test('سناریو ۲: ۱۰۰ کیلو درخواستی و تحویل ۱۰۵ بدون خطای محدودیت مقدار', async () => {
  const id = await freshStoreOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }]);
  let o = await get(wh, `/api/orders/${id}`);
  const item = o.items[0];
  o = await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: item.id, deliveredKg: 60 }] } }), 'r1');
  await call('POST', `/api/orders/${id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: item.id } });
  o = await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: item.id, deliveredKg: 45 }] } }), 'r2-over');
  assert.equal(runViewOf(o, item.id).totalKg, 105);
  const fin = await ok(await call('POST', `/api/orders/${id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [{ itemId: item.id, action: 'complete' }] } }), 'finalize');
  assert.equal(fin.status, 'SETTLEMENT_PENDING');
  assert.equal(itemOf(fin, item.id).deliveredKg, 105);
  assert.equal(fin.storeRun.finalizedAt && typeof fin.storeRun.finalizedAt === 'string', true);
});

// ---------- سناریو سوم: ارسال کمتر + پایان روز با کسری ----------
test('سناریو ۳: ۱۰۰ کیلو ولی جمعاً ۸۰ رفته و مانده ناموجود → بسته با کسری و حفظ وزن', async () => {
  const id = await freshStoreOrder([{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }]);
  let o = await get(wh, `/api/orders/${id}`);
  const item = o.items[0];
  await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: item.id, deliveredKg: 80 }] } }), 'r1');
  const mov = await call('POST', `/api/orders/${id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: item.id } });
  assert.equal(mov.status, 200);
  // بدون تصمیم (قانون ۸ سند): باید رد شود
  const bad = await call('POST', `/api/orders/${id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [] } });
  assert.equal(bad.status, 400);
  // کامل‌کردن با تصمیم عدم موجودی + توضیح
  o = await ok(await call('POST', `/api/orders/${id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [{ itemId: item.id, action: 'out_of_stock', note: 'ناموجود در انبار' }] } }), 'finalize');
  assert.equal(itemOf(o, item.id).deliveredKg, 80);
  assert.equal(itemOf(o, item.id).itemStatus, 'DELIVERED');
  assert.equal(runViewOf(o, item.id).runStatus, 'CLOSED_SHORT');
  assert.equal(runViewOf(o, item.id).shortageKg, 20);
  assert.equal(o.storeRun.overall, 'CLOSED_SHORT');
  assert.equal(o.storeRun.counts.short, 1);
});

// ---------- سناریو چهارم: انتقال فقط روی قلم انتخاب‌شده ----------
test('سناریو ۴: انتقال یک محصول از ۵ محصول فقط همان قلم را تغییر می‌دهد', async () => {
  const lines = [201, 202, 203, 204, 205].map((n) => ({ productId: 'p01', requestedQty: n, requestedUnit: 'کیلوگرم' }));
  const id = await freshStoreOrder(lines);
  let o = await get(wh, `/api/orders/${id}`);
  const target = o.items[2];
  o = await ok(await call('POST', `/api/orders/${id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: target.id } }), 'move-only');
  const others = o.storeRun.items.filter((x) => x.itemId !== target.id);
  assert.deepEqual(others.map((x) => x.runStatus), ['AWAITING_R1', 'AWAITING_R1', 'AWAITING_R1', 'AWAITING_R1']);
  assert.equal(runViewOf(o, target.id).runStatus, 'MOVED_R2');
});

// ---------- سناریو پنجم و ششم: ارجاع به فروش + حفظ وزن‌های ثبت‌شده ----------
test('سناریو ۵ و ۶: ارجاع سفارش به فروش، ویرایش و ارسال مجدد — وزن سرویس اول حفظ می‌شود و شناسه سفارش ثابت می‌ماند', async () => {
  const id = await freshStoreOrder([{ productId: 'p01', requestedQty: 50, requestedUnit: 'کیلوگرم' }]);
  let o = await get(wh, `/api/orders/${id}`);
  const item = o.items[0];
  await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: item.id, deliveredKg: 30 }] } }), 'r1');
  // ارجاع انبار به فروش با علت
  const ret = await call('POST', `/api/orders/${id}/return-sales`, { cookie: wh, body: { reason: 'اصلاح مقدار سفارش' } });
  assert.equal(ret.status, 200);
  assert.equal(ret.json.order.status, 'RETURNED_TO_SALES');
  // ویرایش مقدار با همان شناسه
  const ed = await call('PUT', `/api/orders/${id}/returned-edit`, { cookie: sales, body: { items: [{ id: item.id, productId: 'p01', requestedQty: 60, requestedUnit: 'کیلوگرم', description: 'اصلاح شد' }] } });
  assert.equal(ed.status, 200);
  assert.equal(itemOf(ed.json.order, item.id).requestedQty, 60);
  assert.equal(itemOf(ed.json.order, item.id).deliveredKg, 30); // وزن حفظ شده
  // افزودن قلم جدید باید رد شود (سناریو ۷ / قانون ۱۱)
  const add = await call('POST', `/api/orders/${id}/items`, { cookie: sales, body: { productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم' } });
  assert.equal(add.status, 409);
  // ارسال مجدد به انبار همان سفارش
  const rs = await call('POST', `/api/orders/${id}/resubmit-sales`, { ...IDEM(), cookie: sales, body: {} });
  assert.equal(rs.status, 200);
  assert.equal(rs.json.order.status, 'WAREHOUSE_PENDING');
  // انبار دوباره accept → PREPARING — وزن هنوز سر جایش است
  const acc = await call('POST', `/api/orders/${id}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} });
  assert.equal(acc.status, 200);
  const st = await call('POST', `/api/orders/${id}/warehouse/start-preparing`, { cookie: wh, body: {} });
  assert.equal(st.status, 200);
  o = await get(wh, `/api/orders/${id}`);
  assert.equal(o.id, id);
  const rv = runViewOf(o, item.id);
  assert.equal(rv.r1Kg, 30);
  assert.equal(itemOf(o, item.id).runR1.length, 1);
  assert.equal(rv.runStatus, 'IN_SHIPPING');
});

// ---------- سناریو هشتم: عدم موجودی در سرویس دوم ----------
test('سناریو ۸: عدم موجودی در سرویس دوم → بسته با کسری + حفظ وزن سرویس اول + نام/زمان کاربر', async () => {
  const id = await freshStoreOrder([{ productId: 'p01', requestedQty: 70, requestedUnit: 'کیلوگرم' }]);
  let o = await get(wh, `/api/orders/${id}`);
  const item = o.items[0];
  await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: item.id, deliveredKg: 50 }] } }), 'r1');
  await call('POST', `/api/orders/${id}/store-run/move`, { ...IDEM(), cookie: wh, body: { itemId: item.id } });
  o = await ok(await call('POST', `/api/orders/${id}/store-run/out-of-stock`, { ...IDEM(), cookie: wh, body: { itemId: item.id, note: 'تأمین مجدد نشد' } }), 'oos');
  const rv = runViewOf(o, item.id);
  assert.equal(rv.runStatus, 'CLOSED_SHORT');
  assert.equal(rv.r1Kg, 50);
  assert.equal(rv.shortageKg, 20);
  assert.equal(rv.shortageClosed.byName, 'sr-wh');
  assert.equal(!!rv.shortageClosed.at, true);
});

// ---------- عدم موجودی بدون هیچ ارسالی (نمایش شفاف طبق بند ۸) ----------
test('عدم موجودی بدون هیچ ارسالی: شفاف و وضعیت مستقل از وزن (بند ۸ سند)', async () => {
  const id = await freshStoreOrder([{ productId: 'p01', requestedQty: 25, requestedUnit: 'کیلوگرم' }]);
  let o = await get(wh, `/api/orders/${id}`);
  const item = o.items[0];
  o = await ok(await call('POST', `/api/orders/${id}/store-run/out-of-stock`, { ...IDEM(), cookie: wh, body: { itemId: item.id, note: 'اصلاً در دسترس نبود' } }), 'oos-zero');
  const rv = runViewOf(o, item.id);
  assert.equal(rv.runStatus, 'CLOSED_SHORT');
  assert.equal(rv.totalKg, 0);
  assert.equal(rv.shortageKg, 25);
  // بدون محصول یا محموله، پایان خودکار انجام می‌شود و تسویه‌ای ایجاد نمی‌شود.
  assert.equal(itemOf(o, item.id).itemStatus, 'OUT_OF_STOCK');
  assert.equal(o.status, 'OUT_OF_STOCK');
  assert(o.warehouseCompletedAt);
  assert(!o.storeRunOps.r1Shipment);
});

// ---------- قفل‌های سند ----------
test('قفل‌ها: بدون accept، r2 بدون انتقال، وزن بعد از نهایی، مسیر قدیمی /warehouse — همگی ۴۰۹', async () => {
  const id = await (async () => {
    const r = await call('POST', '/api/store/orders', { ...IDEM(), cookie: storeUser, body: { name: 'مشتری تست', phone: '09120000000', items: [{ productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم' }] } });
    const id = r.json.order.id;
    await call('POST', `/api/store/orders/${id}/quick-send`, { ...IDEM(), cookie: sales, body: { dispatchPlace: 'فروشگاه' } });
    return id;
  })();
  // قبل از warehouse/accept همهٔ عملیات باید رد شود
  let o = await get(wh, `/api/orders/${id}`);
  const it = o.items[0];
  const bad0 = await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: it.id, deliveredKg: 5 }] } });
  assert.equal(bad0.status, 409);
  await call('POST', `/api/orders/${id}/warehouse/accept`, { ...IDEM(), cookie: wh, body: {} });
  await call('POST', `/api/orders/${id}/warehouse/start-preparing`, { cookie: wh, body: {} });
  // r2 بدون انتقال
  const bad = await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 2, items: [{ itemId: it.id, deliveredKg: 5 }] } });
  assert.equal(bad.status, 409);
  // مسیر قدیمی ثبت وزن جمعی برای سفارش فروشگاه دیگر مجاز نیست
  const legacy = await call('POST', `/api/orders/${id}/warehouse`, { ...IDEM(), cookie: wh, body: { items: [{ itemId: it.id, deliveredKg: 5, outOfStock: false }] } });
  assert.equal(legacy.status, 409);
  // مسیر درست
  await ok(await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: it.id, deliveredKg: 5 }] } }), 'r1');
  // نهایی‌سازی روز...
  const fin = await ok(await call('POST', `/api/orders/${id}/store-run/finalize-day`, { ...IDEM(), cookie: wh, body: { decisions: [{ itemId: it.id, action: 'complete' }] } }), 'finalize');
  assert.equal(fin.status, 'SETTLEMENT_PENDING');
  // بعد از نهایی دیگر عملیات سرویس ممنوع
  const late = await call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie: wh, body: { run: 1, items: [{ itemId: it.id, deliveredKg: 5 }] } });
  assert.equal(late.status, 409);
  // نقش اشتباه (فروش) برای عملیات انبار: ۴۰۳
  const wrongRole = await call('POST', `/api/orders/${id}/store-run/move`, { ...IDEM(), cookie: sales, body: { itemId: it.id } });
  assert.equal(wrongRole.status, 403);
});

// ---------- تکمیل سند: سربرگ در enrich همه‌جا حضور دارد ----------
test('سربرگ دو سرویس در enrichOrder همهٔ بازیگرها قابل مشاهده است (داده‌مدل بند ۴)', async () => {
  const id = await freshStoreOrder([{ productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم' }]);
  for (const [who, cookie] of [['sales', sales], ['wh', wh], ['admin', admin]]) {
    const o = await get(cookie, `/api/orders/${id}`);
    assert.ok(o.storeRun && o.storeRun.items.length === 1, who);
    assert.equal(o.storeRun.counts.total, 1, who);
    assert.equal(o.storeRun.r1StatusLabel, 'در انتظار', who);
  }
  const listStore = await call('GET', '/api/store/orders', { cookie: storeUser }); // سفارش فروشگاه برای خود فروشگاه با نمای سرویس‌ها
  const rows = listStore.json?.orders || [];
  const row = rows.find((x) => x.id === id);
  assert.ok(row && row.storeRun && row.storeRun.items.length === 1, 'store portal enrich');
});
