'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
// تست یکپارچگی: سرور واقعی روی پورت تصادفی با پایگاه داده موقت اجرا می‌شود
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Tc3!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-test-'));
const port = 4081;
const BASE = `http://127.0.0.1:${port}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: ADMIN_PASS, LOGIN_MAX_ATTEMPTS: '5' },
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

// ---------- کمک‌ها ----------
async function call(method, p, { cookie, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if ((body !== undefined || raw !== undefined) && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  const setCookie = res.headers.get('set-cookie');
  const sid = setCookie && setCookie.match(/sid=([^;]+)/);
  return { status: res.status, json, text, headers: res.headers, cookie: sid && sid[1] && sid[1] !== '' ? `sid=${sid[1]}` : null };
}

async function login(username, password, ip) {
  const r = await call('POST', '/api/login', { body: { username, password }, headers: ip ? { 'X-Forwarded-For': ip } : {} });
  return r;
}

let adminCookie;
let gateCookie;
let salesCookie;
let whCookie;
let storeCookie;
let ids = {};

// ---------- امنیت پایه ----------
test('صفحه اصلی با Security Headers و بدون Inline Script سرو می‌شود', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('لایه‌های CSS واکنش‌گرایی از allowlist استاتیک با content-type صحیح سرو می‌شوند', async () => {
  const page = await call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /href="\/mobile\.css"/);
  assert.match(page.text, /href="\/responsive\.css"/);
  assert.ok(page.text.indexOf('href="/responsive.css"') > page.text.indexOf('href="/transport-resources.css"'));
  const css = await call('GET', '/mobile.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  assert.match(css.text, /max-width:\s*1024px/);
  const responsive = await call('GET', '/responsive.css');
  assert.equal(responsive.status, 200);
  assert.match(responsive.headers.get('content-type'), /text\/css/);
  assert.match(responsive.text, /overflow-x:\s*clip/);
});

test('مسیرهای خارج از Allowlist و Path Traversal قابل دسترسی نیستند', async () => {
  for (const p of ['/server.js', '/data/db.json', '/data/baboltoyoor.db', '/data/baboltoyoor.db-wal', '/package.json', '/../package.json', '/%2e%2e/package.json', '/lib/config.js', '/.env']) {
    const r = await call('GET', p);
    assert.equal(r.status, 404, `path ${p} must be 404`);
    assert.doesNotMatch(r.text, /PORT|passwordHash|scrypt/);
  }
});

test('درخواست بدون Authentication به API خصوصی ۴۰۱ می‌دهد', async () => {
  const r = await call('GET', '/api/orders');
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'AUTH_REQUIRED');
});

test('CSRF: درخواست تغییر وضعیت بدون application/json رد می‌شود', async () => {
  const r = await call('POST', '/api/login', { raw: 'username=admin&password=x', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(r.status, 415);
});

test('ورود با رمز اشتباه ۴۰۱ و پس از چند تلاش قفل می‌شود', async () => {
  const ip = '10.9.9.1';
  for (let i = 0; i < 5; i++) {
    const r = await login('ghost-user', 'bad-pass-1', ip);
    assert.equal(r.status, 401);
  }
  const locked = await login('ghost-user', 'bad-pass-1', ip);
  assert.equal(locked.status, 429);
  assert.equal(locked.json.code, 'LOGIN_LOCKED');
});

test('ورود مدیر با رمز تصادفی/تعیین‌شده موفق و Cookie امن است', async () => {
  const r = await login('admin', ADMIN_PASS);
  assert.equal(r.status, 200);
  assert.equal(r.json.user.mustChangePassword, true);
  assert.equal(r.json.user.passwordHash, undefined, 'password hash must never be returned');
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  assert.match(r.headers.get('set-cookie'), /SameSite=Strict/);
  adminCookie = r.cookie;
});

test('کاربر با رمز موقت قبل از تغییر رمز به API دسترسی ندارد', async () => {
  const r = await call('GET', '/api/admin/users', { cookie: adminCookie });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('رمز ضعیف در تغییر رمز پذیرفته نمی‌شود', async () => {
  const r = await call('POST', '/api/account/password', { cookie: adminCookie, body: { currentPassword: ADMIN_PASS, newPassword: 'short' } });
  assert.equal(r.status, 400);
});

test('تغییر رمز مدیر انجام می‌شود و رمز قبلی دیگر کار نمی‌کند', async () => {
  const newAdmin = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  const r = await call('POST', '/api/account/password', { cookie: adminCookie, body: { currentPassword: ADMIN_PASS, newPassword: newAdmin } });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.mustChangePassword, false);
  const old = await login('admin', ADMIN_PASS, '10.9.9.2');
  assert.equal(old.status, 401);
  await call('POST', '/api/logout', { cookie: adminCookie, body: {} });
  const fresh = await login('admin', newAdmin, '10.9.9.3');
  assert.equal(fresh.status, 200);
  adminCookie = fresh.cookie;
});

// ---------- مدیریت کاربران و RBAC ----------
test('مدیر کاربران نقش‌های مختلف می‌سازد و رمز ضعیف رد می‌شود', async () => {
  const weak = await call('POST', '/api/admin/users', { cookie: adminCookie, body: { username: 'weak1', fullName: 'x', position: 'x', roleCode: 'sales', password: 'abcdefgh' } });
  assert.equal(weak.status, 400);
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: adminCookie, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  };
  await mk('gate1', 'gate');
  await mk('sales1', 'sales');
  await mk('wh1', 'warehouse');
  await mk('store1', 'store', { storeName: 'فروشگاه مرکزی' });
  gateCookie = (await login('gate1', PASS, '10.9.8.1')).cookie;
  salesCookie = (await login('sales1', PASS, '10.9.8.2')).cookie;
  whCookie = (await login('wh1', PASS, '10.9.8.3')).cookie;
  storeCookie = (await login('store1', PASS, '10.9.8.4')).cookie;
  assert.ok(gateCookie && salesCookie && whCookie && storeCookie);
});

test('فروش نمی‌تواند عملیات انبار را صدا بزند (RBAC سمت سرور)', async () => {
  const r = await call('POST', '/api/orders/nope/warehouse/accept', { cookie: salesCookie, body: {} });
  assert.equal(r.status, 403);
});

test('انبار به گزارش مدیریتی و قیمت‌گذاری دسترسی ندارد', async () => {
  assert.equal((await call('GET', '/api/reports', { cookie: whCookie })).status, 403);
  assert.equal((await call('POST', '/api/admin/prices', { cookie: whCookie, body: { productId: 'p01', price: 1 } })).status, 403);
  assert.equal((await call('GET', '/api/prices', { cookie: whCookie })).status, 403);
});

test('فروشگاه فقط سفارش‌های خودش را می‌بیند و به کارتابل فروش دسترسی ندارد', async () => {
  assert.equal((await call('GET', '/api/orders', { cookie: storeCookie })).status, 403);
  assert.equal((await call('GET', '/api/store/orders', { cookie: storeCookie })).status, 200);
});

test('نگهبان به گزارش مدیریتی و کاربران دسترسی ندارد', async () => {
  assert.equal((await call('GET', '/api/reports', { cookie: gateCookie })).status, 403);
  assert.equal((await call('GET', '/api/admin/users', { cookie: gateCookie })).status, 403);
});

// ---------- جریان کامل سفارش ----------
test('نگهبانی پلاک ناقص یا خالی را بدون ثبت مراجعه رد می‌کند', async () => {
 const before=await call('GET','/api/visits',{cookie:gateCookie});
 for(const plate of ['', '1ب345-67','12ب34-67','12ب345-6','12ب345-678','12A345-67']){
  const res=await call('POST','/api/visits',{cookie:gateCookie,body:{name:'پلاک ناقص',phone:'09123334444',plate}});
  assert.equal(res.status,400,plate);
 }
 const after=await call('GET','/api/visits',{cookie:gateCookie});
 assert.equal(after.json.visits.length,before.json.visits.length);
});

test('نگهبان مراجعه ثبت می‌کند', async () => {
  const r = await call('POST', '/api/visits', { cookie: gateCookie, body: { name: 'علی رضایی', phone: '۰۹۱۲۱۲۳۴۵۶۷', plate: '۱۲ب۳۴۵-۶۷', district: 'شمال' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  ids.visit = r.json.visit.id;
});

test('ثبت سفارش با محصول نامعتبر، مقدار منفی و واحد نامعتبر رد می‌شود (باگ قبلی)', async () => {
  const bad = [
    [{ productId: 'NOPE', requestedQty: 5, requestedUnit: 'کیلوگرم' }],
    [{ productId: 'p01', requestedQty: -5, requestedUnit: 'کیلوگرم' }],
    [{ productId: 'p01', requestedQty: 0, requestedUnit: 'کیلوگرم' }],
    [{ productId: 'p01', requestedQty: 5, requestedUnit: 'تن' }],
    [{ productId: 'p01', requestedQty: 1e9, requestedUnit: 'کیلوگرم' }],
  ];
  for (const items of bad) {
    const r = await call('POST', '/api/orders', { cookie: salesCookie, body: { visitId: ids.visit, items } });
    assert.equal(r.status, 400, JSON.stringify(items));
  }
  // مراجعه هنوز آزاد است
  const v = await call('GET', '/api/visits', { cookie: salesCookie });
  assert.equal(v.json.visits.find((x) => x.id === ids.visit).status, 'WAITING_SALES');
});

test('سفارش معتبر ثبت می‌شود و شماره سفارش یکتا دارد', async () => {
  const r = await call('POST', '/api/orders', { cookie: salesCookie, body: { visitId: ids.visit, items: [{ productId: 'p01', requestedQty: 50, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.order.orderNo, /^\d{6}$/);
  ids.order = r.json.order.id;
});

test('ثبت دوباره سفارش برای همان مراجعه ۴۰۹ می‌دهد', async () => {
  const r = await call('POST', '/api/orders', { cookie: salesCookie, body: { visitId: ids.visit, items: [{ productId: 'p01', requestedQty: 5, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(r.status, 409);
});

test('انبار سفارش را پذیرفته و شروع آماده‌سازی می‌کند', async () => {
  assert.equal((await call('POST', `/api/orders/${ids.order}/warehouse/accept`, { cookie: whCookie, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${ids.order}/warehouse/start-preparing`, { cookie: whCookie, body: {} })).status, 200);
  const o = await call('GET', `/api/orders/${ids.order}`, { cookie: whCookie });
  ids.item = o.json.order.items[0].id;
});

test('ثبت وزن ناقص یا وزن منفی در انبار رد می‌شود', async () => {
  const url = `/api/orders/${ids.order}/warehouse`;
  assert.equal((await call('POST', url, { cookie: whCookie, body: { items: [] } })).status, 400);
  assert.equal((await call('POST', url, { cookie: whCookie, body: { items: [{ itemId: ids.item, deliveredKg: -3 }] } })).status, 400);
});

test('ثبت تحویل ناقص: ۴۲ کیلو از ۵۰ و وضعیت تسویه', async () => {
  const r = await call('POST', `/api/orders/${ids.order}/warehouse`, { cookie: whCookie, body: { items: [{ itemId: ids.item, deliveredKg: 42 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.order.status, 'SETTLEMENT_PENDING');
  assert.equal(r.json.order.items[0].deliveredKg, 42);
});

const SIG = `data:image/png;base64,${'A'.repeat(300)}`;

test('تسویه با قیمت منفی رد می‌شود (باگ بحرانی قبلی)', async () => {
  const r = await call('POST', `/api/orders/${ids.order}/settle`, { cookie: salesCookie, body: { signatureData: SIG, noFingerprintAllowed: true, items: [{ itemId: ids.item, unitPrice: -1000 }] } });
  assert.equal(r.status, 400);
});

test('تسویه بدون قیمت برای قلم تحویلی رد می‌شود', async () => {
  const r = await call('POST', `/api/orders/${ids.order}/settle`, { cookie: salesCookie, body: { signatureData: SIG, noFingerprintAllowed: true, items: [] } });
  assert.equal(r.status, 400);
});

test('تخفیف نامعتبر بدون تغییر سفارش رد می‌شود', async () => {
 for(const discountAmount of [-1, 'abc', 999999, 1.5]){
  const res=await call('POST',`/api/orders/${ids.order}/settle`,{cookie:salesCookie,body:{signatureData:SIG,noFingerprintAllowed:true,discountAmount,items:[{itemId:ids.item,unitPrice:1000}]}});
  assert.equal(res.status,400);
 }
 const res=await call('GET',`/api/orders/${ids.order}`,{cookie:salesCookie});
 assert.equal(res.json.order.status,'SETTLEMENT_PENDING');
 assert(!res.json.order.payment);
});

test('تسویه معتبر فاکتور با شماره یکتا صادر می‌کند', async () => {
  const r = await call('POST', `/api/orders/${ids.order}/settle`, { cookie: salesCookie, body: { discountAmount: 5000, additionsAmount: 2000, items: [{ itemId: ids.item, unitPrice: 1000 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.order.status, 'SETTLED');
  assert.equal(r.json.order.payment.totalAmount, 39000);
  assert.equal(r.json.order.payment.discountAmount,5000);
  assert.equal(r.json.order.payment.additionsAmount,2000);
  assert.equal(r.json.order.payment.verificationMode,'CUSTOMER_CONTACT');
  assert.equal(r.json.order.payment.signatureData,'');assert.equal(r.json.order.payment.fingerprintRef,'');assert.equal(r.json.order.payment.noFingerprintAllowed,false);
  assert.equal(r.json.order.payment.customerName,'علی رضایی');assert.equal(r.json.order.payment.customerPhone,'09121234567');
  const saved=await call('GET',`/api/orders/${ids.order}`,{cookie:salesCookie});
  assert.equal(saved.json.order.payment.totalAmount,39000);
  assert.equal(saved.json.order.payment.discountAmount,5000);
  assert.match(r.json.order.payment.invoiceNumber, /^\d{6}$/);
});

test('تسویه دوباره ۴۰۹ می‌دهد (جلوگیری از فاکتور تکراری)', async () => {
  const r = await call('POST', `/api/orders/${ids.order}/settle`, { cookie: salesCookie, body: { signatureData: SIG, noFingerprintAllowed: true, items: [{ itemId: ids.item, unitPrice: 1000 }] } });
  assert.equal(r.status, 409);
});

test('خروج نگهبان و تغییر وضعیت سفارش به EXITED', async () => {
  const r = await call('POST', `/api/orders/${ids.order}/exit`, { cookie: gateCookie, body: { checkedItems: [ids.item] } });
  assert.equal(r.status, 200);
  assert.equal(r.json.order.status, 'EXITED');
});

test('Audit Log عملیات مهم را ثبت کرده و زنجیره Hash معتبر است', async () => {
  const r = await call('GET', '/api/admin/audit?limit=200', { cookie: adminCookie });
  const actions = new Set(r.json.audit.map((x) => x.action));
  for (const a of ['CREATE_VISIT', 'CREATE_ORDER', 'WAREHOUSE_ACCEPT_ORDER', 'WAREHOUSE_FINALIZE', 'FINAL_SETTLEMENT', 'FINAL_EXIT', 'USER_CREATED', 'LOGIN']) {
    assert.ok(actions.has(a), `audit action ${a} missing`);
  }
  const v = await call('GET', '/api/admin/audit/verify', { cookie: adminCookie });
  assert.equal(v.json.ok, true);
});

test('مبلغ فاکتور در گزارش مدیریتی ثبت می‌شود', async () => {
  const r = await call('GET', '/api/reports', { cookie: adminCookie });
  assert.equal(r.status, 200);
  assert.ok(r.json.finance.revenue >= 39000);
});

// ---------- Idempotency و Pagination ----------
test('درخواست تکراری با همان Idempotency-Key دوبار ثبت نمی‌شود', async () => {
  const key = 'visit-key-0001-abcdef';
  const body = { noVehicle: true, name: 'مشتری تکراری', phone: '09130000000', district: 'جنوب' };
  const a = await call('POST', '/api/visits', { cookie: gateCookie, body, headers: { 'Idempotency-Key': key } });
  const b = await call('POST', '/api/visits', { cookie: gateCookie, body, headers: { 'Idempotency-Key': key } });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(b.headers.get('idempotent-replayed'), 'true');
  assert.equal(a.json.visit.id, b.json.visit.id);
  const list = await call('GET', '/api/visits', { cookie: gateCookie });
  assert.equal(list.json.visits.filter((v) => v.customer?.name === 'مشتری تکراری').length, 1);
});

test('فهرست سفارش‌ها صفحه‌بندی و جستجو را در Backend انجام می‌دهد', async () => {
  const r = await call('GET', '/api/orders?limit=1&offset=0', { cookie: adminCookie });
  assert.equal(r.json.orders.length, 1);
  assert.ok(r.json.total >= 1);
  const s = await call('GET', `/api/orders?q=${encodeURIComponent('علی')}`, { cookie: adminCookie });
  assert.ok(s.json.total >= 1);
});

// ---------- سفارش فروشگاه و سفارش آینده ----------
test('فروشگاه سفارش ثبت می‌کند و فروش آن را برای زمان آینده تأیید می‌کند', async () => {
  const create = await call('POST', '/api/store/orders', { cookie: storeCookie, body: { name: 'فروشگاه مرکزی', phone: '09121110000', items: [{ productId: 'p02', requestedQty: 10, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(create.status, 201, JSON.stringify(create.json));
  const id = create.json.order.id;
  const future = new Date(Date.now() + 3 * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const at = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T08:30`;
  const ap = await call('POST', `/api/store/orders/${id}/approve`, { cookie: salesCookie, body: { scheduledAt: at, dispatchPlace: 'بابل' } });
  assert.equal(ap.status, 200, JSON.stringify(ap.json));
  assert.equal(ap.json.order.status, 'SCHEDULED_REMOTE');
  const workload = await call('GET', '/api/workload', { cookie: adminCookie });
  assert.equal(workload.json.counts.storeScheduled, 1, 'سفارش زمان‌بندی‌شده فروشگاه شمارندهٔ مستقل دارد');
  assert.equal(workload.json.counts.salesFuture, 0, 'فروشگاه به شمارندهٔ سفارش‌های آیندهٔ غیرحضوری اضافه نشود');
});

test('فروش می‌تواند سفارش فروشگاه را با ارسال سریع به صف انبار منتقل کند', async () => {
  const created=await call('POST','/api/store/orders',{cookie:storeCookie,body:{name:'مشتری ارسال سریع',phone:'09121110002',items:[{productId:'p01',requestedQty:3,requestedUnit:'کیلوگرم'}]}});
  assert.equal(created.status,201,JSON.stringify(created.json));
  const id=created.json.order.id;
  const sent=await call('POST',`/api/store/orders/${id}/quick-send`,{cookie:salesCookie,body:{}});
  assert.equal(sent.status,200,JSON.stringify(sent.json));
  assert.equal(sent.json.order.status,'WAREHOUSE_PENDING');
  assert.equal(sent.json.order.approvalStatus,'APPROVED');
  const warehouse=await call('GET','/api/orders?status=WAREHOUSE_PENDING',{cookie:whCookie});
  assert.ok(warehouse.json.orders.some(o=>o.id===id),'سفارش سریع باید در صف انبار دیده شود');
  const premature=await call('POST',`/api/store/orders/${id}/confirm-receipt`,{cookie:storeCookie,body:{}});
  assert.equal(premature.status,409,'فروشگاه پیش از ثبت واقعی تحویل توسط راننده حق تأیید دریافت ندارد');
});

test('سفارش آینده در گذشته ثبت نمی‌شود', async () => {
  const r = await call('POST', '/api/orders/remote', { cookie: salesCookie, body: { name: 'مشتری', phone: '09120000001', scheduledDate: '2020-01-01', scheduledTime: '08:00', items: [{ productId: 'p01', requestedQty: 1, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(r.status, 400);
});

test('سفارش زمان‌بندی‌شدهٔ REMOTE در شمارندهٔ روزهای آتی است و با STORE ادغام نمی‌شود', async () => {
  const future = new Date(Date.now() + 4 * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const scheduledDate = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`;
  const created = await call('POST', '/api/orders/remote', { cookie: salesCookie, body: { name: 'مشتری تلفنی آینده', phone: '09120000002', scheduledDate, scheduledTime: '09:15', dispatchPlace: 'بابل', items: [{ productId: 'p01', requestedQty: 2, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.order.orderType, 'REMOTE');
  const workload = await call('GET', '/api/workload', { cookie: adminCookie });
  assert.equal(workload.json.counts.salesFuture, 1);
  // سفارش آینده در صف فعال تلفنی نیست؛ شمار سربرگ با فهرست همان تب تطبیق دارد.
  assert.equal(workload.json.counts.salesRemote, 0);
  assert.equal(workload.json.counts.storeScheduled, 1);
});

// ---------- اعتبارسنجی ورودی‌های دیگر ----------
test('قیمت منفی در تنظیم قیمت روز رد می‌شود', async () => {
  const r = await call('POST', '/api/admin/prices', { cookie: adminCookie, body: { productId: 'p01', price: -5 } });
  assert.equal(r.status, 400);
});

test('بدنه بیش از حد بزرگ با ۴۱۳ رد می‌شود', async () => {
  const big = JSON.stringify({ name: 'x'.repeat(4 * 1024 * 1024) });
  const r = await call('POST', '/api/visits', { cookie: gateCookie, raw: big });
  assert.equal(r.status, 413);
});

test('خروج از سامانه نشست را باطل می‌کند', async () => {
  const c = gateCookie;
  assert.equal((await call('GET', '/api/me', { cookie: c })).status, 200);
  await call('POST', '/api/logout', { cookie: c, body: {} });
  assert.equal((await call('GET', '/api/me', { cookie: c })).status, 401);
  gateCookie = (await login('gate1', PASS, '10.9.8.9')).cookie;
});

test('پیام خطا هیچ جزئیات داخلی یا Stack را افشا نمی‌کند', async () => {
  const r = await call('GET', '/api/orders/does-not-exist', { cookie: adminCookie });
  assert.equal(r.status, 404);
  assert.doesNotMatch(r.text, /at |\.js:|Error:/);
});

// v37.3.7 — same-day scheduling is supported by both create and edit APIs.
test('سفارش امروز: ساعت سررسید گذشته مستقیم به انبار می‌رود و ساعت بعدی زمان‌بندی می‌شود', async () => {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const base = { name: 'مشتری امروز', phone: '09120000009', scheduledDate: day, dispatchPlace: 'بابل', items: [{productId:'p01',requestedQty:2,requestedUnit:'کیلوگرم'}] };
  const due = await call('POST','/api/orders/remote',{cookie:salesCookie,body:{...base,scheduledTime:'00:00',scheduledAt:`${day}T00:00`}});
  assert.equal(due.status,201,JSON.stringify(due.json));
  assert.equal(due.json.order.status,'WAREHOUSE_PENDING');
  assert.equal(due.json.order.scheduledAt,`${day}T00:00`);
  if(`${pad(now.getHours())}:${pad(now.getMinutes())}` < '23:59'){
    const pending = await call('POST','/api/orders/remote',{cookie:salesCookie,body:{...base,scheduledTime:'23:59',scheduledAt:`${day}T23:59`}});
    assert.equal(pending.status,201,JSON.stringify(pending.json));
    assert.equal(pending.json.order.status,'SCHEDULED_REMOTE');
    const future = new Date(now); future.setDate(future.getDate()+1);
    const next = `${future.getFullYear()}-${pad(future.getMonth()+1)}-${pad(future.getDate())}`;
    const created = await call('POST','/api/orders/remote',{cookie:salesCookie,body:{...base,scheduledDate:next,scheduledTime:'08:00',scheduledAt:`${next}T08:00`}});
    assert.equal(created.status,201,JSON.stringify(created.json));
    const edited = await call('PUT',`/api/orders/${created.json.order.id}/remote`,{cookie:salesCookie,body:{scheduledDate:day,scheduledTime:'23:59',scheduledAt:`${day}T23:59`}});
    assert.equal(edited.status,200,JSON.stringify(edited.json));
    assert.equal(edited.json.order.scheduledAt,`${day}T23:59`);
    const orders = await call('GET','/api/orders',{cookie:salesCookie});
    assert(orders.json.orders.some(o=>o.id===pending.json.order.id&&o.status==='SCHEDULED_REMOTE'));
  }
});

test('ثبت نگهبانی برای پلاک موتورسیکلت و رد پلاک ناقص', async () => {
  const body={name:'موتورسوار آزمون',phone:'09129999123',vehicleType:'موتورسیکلت',plate:'۱۲۳-۴۵۶۷۸'};
  const result=await call('POST','/api/visits',{cookie:gateCookie,body});
  assert.equal(result.status,201,JSON.stringify(result.json));
  assert.equal(result.json.enriched.customer.plate,'123-45678');
  const partial=await call('POST','/api/visits',{cookie:gateCookie,body:{...body,phone:'09129999124',plate:'123-4567'}});
  assert.equal(partial.status,400);
  const car=await call('POST','/api/visits',{cookie:gateCookie,body:{...body,phone:'09129999125',vehicleType:'خودرو'}});
  assert.equal(car.status,400);
});

test('نوع خودرو و پلاک هر مراجعه ثبت می‌شود و سوابق با نام، پلاک و نوع خودرو قابل جستجوست', async () => {
  const car=await call('POST','/api/visits',{cookie:gateCookie,body:{name:'مشتری خودرو آزمایش',phone:'09129999177',vehicleType:'خودرو',carType:'پژو ۴۰۵',plate:'12ب345-67'}});
  assert.equal(car.status,201,JSON.stringify(car.json));assert.equal(car.json.visit.carType,'پژو ۴۰۵');assert.equal(car.json.enriched.customer.carType,'پژو ۴۰۵');
  const motorcycle=await call('POST','/api/visits',{cookie:gateCookie,body:{customerId:car.json.visit.customerId,name:'مشتری خودرو آزمایش',phone:'09129999177',vehicleType:'موتورسیکلت',plate:'123-45678'}});
  assert.equal(motorcycle.status,201,JSON.stringify(motorcycle.json));assert.equal(motorcycle.json.visit.carType,'');assert.equal(motorcycle.json.enriched.customer.carType,'');
  const search=async q=>(await call('GET','/api/visits?q='+encodeURIComponent(q),{cookie:gateCookie})).json.visits;
  const old=await search('۱۲ب۳۴۵');assert(old.some(v=>v.id===car.json.visit.id&&v.plate==='12ب345-67'&&v.carType==='پژو ۴۰۵'));assert(!old.some(v=>v.id===motorcycle.json.visit.id));
  assert((await search('پژو۴۰۵')).some(v=>v.id===car.json.visit.id));assert((await search('۰۹۱۲۹۹۹۹۱۷۷')).some(v=>v.id===motorcycle.json.visit.id));
});
