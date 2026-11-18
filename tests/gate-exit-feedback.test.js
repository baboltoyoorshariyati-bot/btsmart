'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.34.0 — رگرسیون گزارش نگهبانی: «تأیید خروج در منوی کنترل خروج هیچ واکنشی نشان نمی‌دهد».
   مسیر فاکتور ذاتاً سالم بود، اما هیچ بازخوردی هنگام انتظار نداشت: بازشدن برگه و ثبت نهایی
   تا پاسخ سرور هیچ نشانه‌ای نداشتند و خطای «قلم بدون تیک» فقط پیام گذرا بود.
   این تست‌ها بازخورد فوری/درون‌برگه‌ای و مسیریابی کارت داشبورد را پین می‌کنند
   و چرخهٔ سرور (تسویه ← خروج نگهبان) را زنده راستی‌آزمایی می‌کنند. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const ui2 = fs.readFileSync('public/ui2.js', 'utf8');
const appJs = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/compatibility.css', 'utf8');

test('بازشدن برگهٔ کنترل خروج بازخورد فوری دارد (وضعیت بارگذاری + قفل دکمه)', () => {
  const body = ui2.slice(ui2.indexOf('async function openExit('), ui2.indexOf('قدم ۳ — بازطراحی انبار'));
  assert.ok(body.includes('در حال دریافت اطلاعات فاکتور'), 'placeholder بارگذاری باید بلافاصله رندر شود');
  assert.ok(body.includes('btn.disabled=true'), 'دکمهٔ ردیف هنگام دریافت اطلاعات قفل می‌شود');
  assert.ok(body.includes('id="exitMsg"'), 'برگه محل پیام درون‌برگه‌ای دارد');
  assert.ok(body.includes('دریافت اطلاعات فاکتور انجام نشد'), 'خطای دریافت داخل خود برگه نمایش داده می‌شود');
  assert.ok(ui2.includes("if(a==='open-exit')return openExit(el.dataset.id,el);"), 'بایندر نگهبانی المان دکمه را به openExit می‌دهد');
});

test('ثبت خروج نهایی وضعیت «در حال ثبت» و خطای درون‌برگه‌ای دارد', () => {
  const body = appJs.slice(appJs.indexOf('async function confirmExit('), appJs.indexOf('function bindSales('));
  assert.ok(body.includes("$('#exitMsg')"), 'خطا داخل برگه نوشته می‌شود');
  assert.ok(body.includes('gt-check-missing'), 'ردیف‌های بدون تیک مشخص می‌شوند');
  assert.ok(body.includes('در حال ثبت خروج'), 'دکمه هنگام ارسال وضعیت انتظار نشان می‌دهد');
  assert.ok(body.includes('btn.disabled=true'), 'از ثبت دوباره جلوگیری می‌شود');
  assert.ok(body.includes('btn.disabled=false'), 'پس از خطا دکمه دوباره فعال می‌شود');
  assert.ok(body.includes('ابتدا همهٔ اقلام بار را کنترل و تیک بزنید'));
  assert.ok(css.includes('.gt-check.gt-check-missing'), 'استایل ردیف بدون تیک تعریف شده است');
  assert.ok(css.includes('.gt-exit-loading'), 'استایل وضعیت بارگذاری تعریف شده است');
});

test('کارت «تحویل راننده» داشبورد به صف «در انتظار تأیید خروج» می‌رسد، نه صفحهٔ خالی', () => {
  assert.ok(appJs.includes("key==='dispatch-leaving'"), 'مقصد dispatch-leaving در ناوبری شناخته می‌شود');
  assert.ok(appJs.includes("app.gateDispatchTab='leaving'"), 'تب داخلی روی leaving تنظیم می‌شود');
  assert.ok(!appJs.includes('dispatch-awaiting'), 'مقدار نامعتبر قدیمی تب حذف شده است');
});

// ---------- چرخهٔ زنده: تسویه ← خروج نگهبان ----------
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Td3!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-gate-exit-'));
const port = 5543;
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
const SIG = `data:image/png;base64,${'A'.repeat(300)}`;

test('چرخهٔ زنده: فاکتور تسویه‌شده در کنترل خروج دیده و با تأیید نگهبان خارج می‌شود', async () => {
  let admin = await login('admin', ADMIN_PASS);
  assert.equal((await call('POST', '/api/account/password', { cookie: admin, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);
  const mk = (username, roleCode) => call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false } });
  assert.equal((await mk('g-sales', 'sales')).status, 201);
  assert.equal((await mk('g-wh', 'warehouse')).status, 201);
  assert.equal((await mk('g-gate', 'gate')).status, 201);
  const sales = await login('g-sales', PASS), wh = await login('g-wh', PASS), gate = await login('g-gate', PASS);

  const v = await call('POST', '/api/visits', { cookie: gate, body: { name: 'مشتری خروج', phone: '09120000001', plate: '۱۲ب۳۴۵-۶۷' } });
  const o = await call('POST', '/api/orders', { cookie: sales, body: { visitId: v.json.visit.id, items: [{ productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(o.status, 201);
  const orderId = o.json.order.id, itemId = o.json.order.items[0].id;
  assert.equal((await call('POST', `/api/orders/${orderId}/warehouse/accept`, { cookie: wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${orderId}/warehouse/start-preparing`, { cookie: wh, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${orderId}/warehouse`, { cookie: wh, body: { items: [{ itemId, deliveredKg: 10 }] } })).status, 200);
  const legacyClient=await call('POST', `/api/orders/${orderId}/settle`, { cookie: sales, body: { signatureData: SIG, fingerprintRef: 'old-client-ref', noFingerprintAllowed: true, items: [{ itemId, unitPrice: 3000 }] } });
  assert.equal(legacyClient.status, 200);assert.equal(legacyClient.json.order.payment.signatureData,'');assert.equal(legacyClient.json.order.payment.fingerprintRef,'');assert.equal(legacyClient.json.order.payment.verificationMode,'CUSTOMER_CONTACT');

  const settled = await call('GET', '/api/orders?status=SETTLED', { cookie: gate });
  assert.ok((settled.json.orders || []).some((x) => x.id === orderId), 'فاکتور باید در کنترل خروج نگهبانی دیده شود');

  // سوابق مراجعه باید پیش از خروج هم اجازهٔ دیدن جزئیات بار را بدهد؛
  // این نمای نگهبانی محدود است و هیچ دادهٔ مالی یا امضایی ندارد.
  const visitHistory = await call('GET', `/api/visits?id=${encodeURIComponent(v.json.visit.id)}`, { cookie: gate });
  assert.equal(visitHistory.status, 200);
  const linkedVisit = (visitHistory.json.visits || []).find((x) => x.id === v.json.visit.id);
  assert.equal(linkedVisit.order.gateExitAvailable, true, 'سفارش SETTLED بدون dispatch پیش از خروج قابل بررسی است');
  const gateDetails = await call('GET', `/api/orders/${orderId}`, { cookie: gate });
  assert.equal(gateDetails.status, 200, 'نگهبان باید پیش از ثبت خروج بتواند جزئیات سفارش تسویه‌شده را باز کند');
  assert.equal(gateDetails.json.order.status, 'SETTLED');
  assert.ok(gateDetails.json.order.items.some((x) => x.id === itemId));
  assert.doesNotMatch(JSON.stringify(gateDetails.json.order), /payment|payments|amount|price|signature/i);

  // انبار فقط از مسیر محدود سوابق مراجعه جزئیات بار را می‌خواند؛ مسیر عمومی سفارش تسویه‌شده همچنان بسته است.
  const warehouseDetails = await call('GET', `/api/warehouse/visit-order-details/${orderId}`, { cookie: wh });
  assert.equal(warehouseDetails.status, 200);
  // v37.50.0 — کارتابل انبار پروندهٔ کامل سفارش را می‌گیرد: مشخصات سفارش، اطلاعات کامل
  // مشتری و مراحل/رویدادها با نام کاربر هر مرحله (بدون هیچ دادهٔ مالی یا امضا).
  assert.equal(warehouseDetails.json.order.id, orderId);
  assert.equal(warehouseDetails.json.order.orderNo, gateDetails.json.order.orderNo);
  assert.equal(warehouseDetails.json.order.orderType, gateDetails.json.order.orderType);
  assert.equal(warehouseDetails.json.order.customer.name, 'مشتری خروج');
  assert.equal(warehouseDetails.json.order.customer.phone, '09120000001', 'شمارهٔ تماس مشتری برای هماهنگی انبار لازم است');
  assert.equal(warehouseDetails.json.customer.phone, '09120000001');
  assert.ok(warehouseDetails.json.items.some((x) => x.id === itemId), 'اقلام سفارش باید در پروندهٔ انبار باشد');
  assert.ok(warehouseDetails.json.stages.some((x) => x.key === 'warehouseCompleted' && x.user), 'ثبت‌کنندهٔ هر مرحله باید مشخص باشد');
  assert.ok(warehouseDetails.json.events.length > 0 && warehouseDetails.json.events.every((x) => x.label), 'رویدادها با برچسب فارسی');
  const gateItem = gateDetails.json.order.items.find(x => x.id === itemId);
  assert.deepEqual(warehouseDetails.json.records[0].items.map(x => ({ id: x.id, itemStatus: x.itemStatus, name: x.product.name, deliveredKg: x.deliveredKg })), [
    { id: itemId, itemStatus: 'DELIVERED', name: gateItem.product.name, deliveredKg: 10 },
  ]);
  assert.doesNotMatch(JSON.stringify(warehouseDetails.json), /payment|payments|amount|price|signature|fingerprint/i);
  assert.equal((await call('GET', `/api/orders/${orderId}`, { cookie: wh })).status, 403, 'مسیر عمومی جزئیات برای انبار باز نمی‌شود');

  const exit = await call('POST', `/api/orders/${orderId}/exit`, { cookie: gate, body: { checkedItems: [itemId] } });
  assert.equal(exit.status, 200);
  assert.equal(exit.json.order.status, 'EXITED');
  const afterExit = await call('GET', '/api/orders?status=SETTLED', { cookie: gate });
  assert.ok(!(afterExit.json.orders || []).some((x) => x.id === orderId), 'پس از خروج، فاکتور از کنترل خروج خارج می‌شود');
  assert.equal((await call('POST', `/api/orders/${orderId}/exit`, { cookie: gate, body: { checkedItems: [itemId] } })).status, 409, 'خروج دوباره مجاز نیست');
});
