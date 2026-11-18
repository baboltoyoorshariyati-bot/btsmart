'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.33.0 — «وزن‌های سرویس دوم در کارتابل فروش نمایش داده نمی‌شود؛ فقط محصول نیمه‌کاره دیده می‌شود.»
   علت: «ارسال سرویس» یک‌بارمصرف و قفل‌کننده بود؛ به‌محض اولین ارسالِ سرویس دوم (مثلاً فقط با ماندهٔ
   قلم نیمه‌کاره)، وزن هر قلم دیگری برای آن سرویس با ۴۰۹ رد می‌شد و ارسال دوباره هم هیچ‌چیز اضافه نمی‌کرد،
   اما عدد تایپ‌شده روی برگه می‌ماند و انباردار فکر می‌کرد وزن ثبت شده است. حالا تا وقتی محموله نزد فروش
   «در انتظار تعیین راننده» است، وزن اقلام تازه پذیرفته و با ارسال بعدی به همان محموله افزوده می‌شود. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/ui2.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'lib/routes/store-runs.js'), 'utf8');

test('وزن بعد از ارسال فقط برای اقلام داخل محموله قفل است؛ محمولهٔ واگذارشده کامل قفل است', () => {
  assert.match(routes, /if \(sentShip && sentShip\.status !== 'PENDING_SALES'\) fail\(409/, 'پس از واگذاری به راننده ثبت وزن ممنوع می‌ماند');
  assert.match(routes, /if \(sentShip && \(sentShip\.itemIds \|\| \[\]\)\.includes\(item\.id\)\) fail\(409/, 'قلم ارسال‌شده در همان سرویس قفل است');
  assert.doesNotMatch(routes, /if \(sentShip\) fail\(409, `اقلام سرویس/, 'قفل کلیِ بعد از اولین ارسال نباید بماند');
});

test('ارسال دوباره با قلم تازه به همان محموله می‌افزاید و بدون قلم تازه بی‌اثر است', () => {
  assert.match(routes, /existing\.itemIds = \[\.\.\.\(existing\.itemIds \|\| \[\]\), \.\.\.pick\.map\(\(i\) => i\.id\)\];/);
  assert.match(routes, /existing\.weights = \{ \.\.\.\(existing\.weights \|\| \{\}\), \.\.\.Object\.fromEntries\(pick\.map\(\(i\) => \[i\.id, runKg\(i\)\]\)\) \};/);
  assert.match(routes, /if \(!pick\.length\) \{ \/\/ تکرار تماس بدون قلم تازه = بی‌اثر \(ایدempotنت\)/);
  assert.match(routes, /STORE_RUN_R2_SEND_APPEND/);
});

test('برگهٔ انبار پس از ارسال، برای قلم‌های تازه دکمهٔ «ارسال قلم جدید» نشان می‌دهد', () => {
  const btn = ui.slice(ui.indexOf('function sr38SendBtn'), ui.indexOf('function sr38Hist'));
  assert.match(btn, /const fresh=items\.filter\(v=>Number\(run===2\?v\.r2Kg\|\|0:v\.r1Kg\|\|0\)>0&&!\(run===2\?v\.sentInR2:v\.sentInR1\)\);/);
  assert.match(btn, /if\(sh\.status==='PENDING_SALES'&&fresh\.length\)/);
  assert.match(btn, /ارسال \$\{qty\(fresh\.length\)\} قلم جدید سرویس \$\{label\} به فروش/);
});

test('هنگام خطا برگه از سرور بازرندر می‌شود تا عدد ردشده روی صفحه نماند', () => {
  const post = ui.slice(ui.indexOf('async function sr38Post'), ui.indexOf('window.renderWarehouse'));
  assert.match(post, /catch\(e\)\{ toast\(e\.message\); try\{ const fresh=await api\('\/api\/orders\/'\+id\);/);
});

/* ---------- یکپارچه‌سازی: سناریوی دقیق گزارش کاربر ---------- */
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Ts7!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-send-append-'));
const port = 5441;
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
const W = (cookie, id, run, items) => call('POST', `/api/orders/${id}/store-run/weights`, { ...IDEM(), cookie, body: { run, items } });
const SEND = (cookie, id, run) => call('POST', `/api/orders/${id}/store-run/send-run`, { ...IDEM(), cookie, body: { run } });
const MOVE = (cookie, id, itemId) => call('POST', `/api/orders/${id}/store-run/move`, { ...IDEM(), cookie, body: { itemId } });

test('سناریوی گزارش: ارسال زودهنگام سرویس دوم، وزن دیرهنگام بقیه، ارسال تکمیلی', async () => {
  const boot = await login('admin', ADMIN_PASS);
  const newAdmin = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  assert.equal((await call('POST', '/api/account/password', { cookie: boot, body: { currentPassword: ADMIN_PASS, newPassword: newAdmin } })).status, 200);
  const admin = boot;
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return login(username, PASS);
  };
  const sales = await mk('sra-sales', 'sales');
  const wh = await mk('sra-wh', 'warehouse');
  const storeUser = await mk('sra-shop', 'store', { storeName: 'فروشگاه مرکزی تست' });
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

  // سرویس اول: کامل + نیمه‌کاره؛ ارسال
  assert.equal((await W(wh, o.id, 1, [{ itemId: it.p01, deliveredKg: 120 }, { itemId: it.p02, deliveredKg: 50 }])).status, 200);
  assert.equal((await SEND(wh, o.id, 1)).status, 200);
  // وزن قلم ارسال‌شده در همان سرویس همچنان قفل است
  assert.equal((await W(wh, o.id, 1, [{ itemId: it.p01, deliveredKg: 1 }])).status, 409, 'قلم داخل محمولهٔ سرویس اول قفل می‌ماند');

  // فقط ماندهٔ نیمه‌کاره آماده است → انتقال، وزن، ارسال زودهنگام سرویس دوم
  assert.equal((await MOVE(wh, o.id, it.p02)).status, 200);
  assert.equal((await W(wh, o.id, 2, [{ itemId: it.p02, deliveredKg: 35 }])).status, 200);
  assert.equal((await SEND(wh, o.id, 2)).status, 200);
  // ارسال دوباره بدون قلم تازه = بی‌اثر
  const again = await SEND(wh, o.id, 2);
  assert.equal(again.status, 200);
  assert.equal(again.json.order.storeRunOps.r2Shipment.itemIds.length, 1);
  const number=again.json.order.storeWarehouseDocumentNos['2'];assert.match(number,/^W-\d{6}$/);

  // بقیه دیرتر می‌رسند: انتقال و وزن آن‌ها دیگر نباید ۴۰۹ شود
  assert.equal((await MOVE(wh, o.id, it.p03)).status, 200);
  const late = await W(wh, o.id, 2, [{ itemId: it.p03, deliveredKg: 40 }]);
  assert.equal(late.status, 200, 'وزن دیرهنگام سرویس دوم باید پذیرفته شود: ' + JSON.stringify(late.json).slice(0, 160));
  // اما وزن تازه برای قلمی که قبلاً در همین سرویس ارسال شده قفل است
  assert.equal((await W(wh, o.id, 2, [{ itemId: it.p02, deliveredKg: 1 }])).status, 409, 'قلم ارسال‌شدهٔ سرویس دوم قفل می‌ماند');

  // ارسال تکمیلی → همان محموله بزرگ می‌شود و فروش هر دو را می‌بیند
  const appended = await SEND(wh, o.id, 2);
  assert.equal(appended.status, 200);assert.equal(appended.json.order.storeWarehouseDocumentNos['2'],number);
  assert.equal(appended.json.order.storeRunOps.r2Shipment.itemIds.length, 2, 'قلم تازه باید به همان محموله افزوده شود');
  const ships = await call('GET', '/api/sales/store-run-shipments', { cookie: sales });
  const run2 = (ships.json.shipments || []).find((s) => s.orderId === o.id && s.run === 2);
  assert.ok(run2, 'محمولهٔ سرویس دوم نزد فروش نیست');
  const itemsById = Object.fromEntries(run2.items.map((i) => [i.itemId, i]));
  assert.equal(itemsById[it.p02].serviceKg, 35);
  assert.equal(itemsById[it.p03].serviceKg, 40, 'قلم کاملاً منتقل‌شده هم باید نزد فروش دیده شود');

  // پس از واگذاری به راننده، سرویس کامل قفل می‌شود
  const assign = await call('POST', `/api/orders/${o.id}/send-dispatch`, { ...IDEM(), cookie: sales, body: { driverId, run: 2 } });
  assert.equal(assign.status, 200, JSON.stringify(assign.json).slice(0, 200));
  const doc=await call('GET',`/api/warehouse/store-documents/${o.id}/2`,{cookie:wh});assert.equal(doc.status,200);assert.equal(doc.json.document.warehouseDocumentNo,number);assert.deepEqual(doc.json.document.lines.map(x=>x.deliveredKg),[35,40]);
  assert.equal((await W(wh, o.id, 2, [{ itemId: it.p03, deliveredKg: 1 }])).status, 409, 'پس از واگذاری به راننده وزن جدید ممنوع است');
});
