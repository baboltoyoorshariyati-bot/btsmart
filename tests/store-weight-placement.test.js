'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.33.0 — قواعد ثبت وزن در برگهٔ آماده‌سازی فروشگاه (انبار):
   ۱) وزن کامل → قلم وارد فاکتور سرویس اول می‌شود.
   ۲) وزن ناقص → فقط مقدار ثبت‌شده وارد فاکتور می‌شود.
   ۳) وزن صفر → قلم به سرویس دوم منتقل می‌شود.
   و در پایان فرم هم دکمهٔ «ارسال سرویس اول به فروش» هست. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ui = read('public/ui2.js');

test('ثبت وزن صفر در سرویس اول، قلم را به سرویس دوم منتقل می‌کند', () => {
  const handler = ui.slice(ui.indexOf("else if(a==='sr38-weight')"), ui.indexOf("else if(a==='sr38-move')"));
  assert.match(handler, /kg===0/, 'شاخهٔ وزن صفر نیست');
  assert.match(handler, /sr38Post\(id,'move',\{itemId:el\.dataset\.item\}\)/, 'وزن صفر باید همان مسیر انتقال به سرویس دوم را صدا بزند');
  assert.match(handler, /قلم به سرویس دوم منتقل شد/, 'پیام انتقال به سرویس دوم نیست');
  assert.match(handler, /run===2/, 'در سرویس دوم وزن صفر نباید دوباره انتقال بدهد');
  // وزن مثبت ذخیره می‌شود، اما به معنای تحویل فیزیکی نیست
  assert.match(handler, /sr38Post\(id,'weights',\{run,items:\[\{itemId:el\.dataset\.item,deliveredKg:kg,weighings:whWeightPayload\(inp\)\}\]\}\)/);
  assert.match(handler, /تا ارسال سرویس و تحویل به راننده، تحویل فیزیکی ثبت نمی‌شود/);
});

test('در پایان فرم دکمهٔ ارسال سرویس اول به فروش هست', () => {
  const sheet = ui.slice(ui.indexOf('function sr38Sheet(o)'), ui.indexOf('async function sr38Post'));
  const foot = sheet.slice(sheet.indexOf('sr318-foot'));
  assert.match(foot, /\$\{sr38SendBtn\(o,1,sr\.items\)\}/, 'دکمهٔ ارسال سرویس اول در پایان فرم نیست');
  assert.doesNotMatch(foot, /data-action="sr38-finalize"/);
  assert.match(ui, /function sr38SendBtn\(o,run,view\)/, 'سازندهٔ دکمهٔ ارسال سرویس نیست');
  assert.match(sheet, /با ثبت وزن: قلم کامل یا ناقص، به مقدار ثبت‌شده وارد فاکتور همان سرویس می‌شود؛ وزن صفر/, 'راهنمای قواعد روی فرم نیست');
});

// ---------- یکپارچگی: کامل و ناقص در فاکتور سرویس اول، صفر بیرون از آن ----------
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Tc3!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-test-3726-'));
let proc, BASE, adminCookie, salesCookie, whCookie, storeCookie;

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
const login = async (u, p) => {
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
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
  adminCookie = (await login('admin', ADMIN_PASS)).cookie;
  const NEW_ADMIN = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
  assert.equal((await call('POST', '/api/account/password', { cookie: adminCookie, body: { currentPassword: ADMIN_PASS, newPassword: NEW_ADMIN } })).status, 200);
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: adminCookie, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  };
  await mk('sales3726', 'sales');
  await mk('wh3726', 'warehouse');
  await mk('store3726', 'store', { storeName: 'فروشگاه تست ۳۷۲۶' });
  salesCookie = (await login('sales3726', PASS)).cookie;
  whCookie = (await login('wh3726', PASS)).cookie;
  storeCookie = (await login('store3726', PASS)).cookie;
  assert.ok(salesCookie && whCookie && storeCookie);
});
after(() => { if (proc) proc.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('کامل با کل مقدار، ناقص فقط با مقدار ثبت‌شده در سرویس اول می‌آید و قلم صفر به سرویس دوم می‌رود', async () => {
  const created = await call('POST', '/api/store/orders', {
    cookie: storeCookie,
    body: {
      name: 'مشتری تست', phone: '09121110000',
      items: [
        { productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' },
        { productId: 'p02', requestedQty: 100, requestedUnit: 'کیلوگرم' },
        { productId: 'p03', requestedQty: 50, requestedUnit: 'کیلوگرم' },
      ],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const order = created.json.order;
  const byProduct = Object.fromEntries((order.items || []).map((i) => [i.productId, i]));
  assert.equal((await call('POST', `/api/store/orders/${order.id}/quick-send`, { cookie: salesCookie, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${order.id}/warehouse/accept`, { cookie: whCookie, body: {} })).status, 200);
  // p01 کامل: ۱۰۰ از ۱۰۰ • p02 ناقص: ۴۰ از ۱۰۰
  const w = await call('POST', `/api/orders/${order.id}/store-run/weights`, {
    cookie: whCookie,
    body: { run: 1, items: [{ itemId: byProduct.p01.id, deliveredKg: 100 }, { itemId: byProduct.p02.id, deliveredKg: 40 }] },
  });
  assert.equal(w.status, 200, JSON.stringify(w.json));
  // p03 با وزن صفر: همان کاری که رابط کاربری می‌کند (انتقال به سرویس دوم)
  const mv = await call('POST', `/api/orders/${order.id}/store-run/move`, { cookie: whCookie, body: { itemId: byProduct.p03.id } });
  assert.equal(mv.status, 200, JSON.stringify(mv.json));
  // ارسال سرویس اول به فروش (دکمهٔ پایان فرم)
  const send = await call('POST', `/api/orders/${order.id}/store-run/send-run`, { cookie: whCookie, body: { run: 1 } });
  assert.equal(send.status, 200, JSON.stringify(send.json));
  const shipments = await call('GET', '/api/sales/store-run-shipments', { cookie: salesCookie });
  assert.equal(shipments.status, 200, JSON.stringify(shipments.json));
  const run1 = (shipments.json.shipments || []).find((x) => x.orderId === order.id && x.run === 1);
  assert.ok(run1, 'محمولهٔ سرویس اول برای فروش ساخته نشده است');
  const got = Object.fromEntries(run1.items.map((i) => [i.itemId, Number(i.deliveredKg ?? i.serviceKg)]));
  assert.equal(got[byProduct.p01.id], 100, 'قلم کامل باید با کل مقدار در فاکتور سرویس اول باشد');
  assert.equal(got[byProduct.p02.id], 40, 'قلم ناقص باید فقط با مقدار ثبت‌شده (۴۰) در فاکتور باشد، نه مقدار درخواستی');
  assert.ok(!(byProduct.p03.id in got), 'قلم صفر نباید در فاکتور سرویس اول باشد');
  const view = await call('GET', `/api/orders/${order.id}`, { cookie: whCookie });
  const p03 = (view.json.order.items || []).find((i) => i.id === byProduct.p03.id);
  assert.ok(p03.movedToR2, 'قلم صفر باید به سرویس دوم منتقل شده باشد');
});
