'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* Store history now lists the individual warehouse documents and keeps the legacy history API available. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Tw9!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-storehist-'));
const port = 5471;
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

async function call(method, p, { cookie, body } = {}) {
  const h = {};
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = JSON.parse(await res.text()); } catch { /* not json */ }
  return { status: res.status, json };
}
const login = (u, p, ip) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: u, password: p }) })
  .then((r) => ((r.headers.get('set-cookie') || '').match(/sid=([^;]+)/) || [])[0] || null);
const localDay = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const IDEM = () => 'k-' + Math.random().toString(36).slice(2);

let ADMIN, SALES, WH, STORE, O1, O2, ON; // eslint-disable-line

test('اتصالات ایستا: تب سوابق به فهرست اسناد فروشگاه وصل است و تاریخچهٔ عمومی وزن سرویس‌ها را نگه می‌دارد', () => {
  const ui = read('public/ui2.js');
  const app = read('public/app.js');
  const route = read('lib/routes/orders.js');
  const css = read('public/compatibility.css');
  assert.ok(ui.indexOf("['incoming','ورودی']") < ui.indexOf("['history','سوابق سفارش‌های ثبت‌شده']"), 'تب سوابق بعد از دو تب کاری فروشگاه است');
  assert.match(ui, /\['incoming','preparing','history','transfers'\]\.includes\(app\.wh38\.storeTab\)/, 'کلمپ تب history را می‌پذیرد');
  assert.match(ui, /app\.wh38\.storeTab=\['incoming','preparing','history','transfers'\]\.includes\(st\.dataset\.wh38StoreTab\)/, 'کلیک تب history را فعال می‌کند');
  assert.match(ui, /active==='history'&&host\.querySelector\('\[data-wh38-store-history\]'\)\) return;/, 'نوسازی خودکار تب فعال را دوباره نمی‌سازد');
  assert.match(ui, /function renderWhStoreHistory\(\)/);
  assert.match(ui, /function renderWhStoreDocuments\(\)/);
  assert.match(ui, /api\('\/api\/warehouse\/store-documents\?'/, 'سوابق فروشگاه از فهرست اسناد انبار خوانده می‌شود');
  assert.doesNotMatch(ui, /wh-store-history-range|wh-store-history-print/, 'فیلتر و گزارش چاپ قدیمی حذف شده‌اند');
  assert.match(ui, /orderType=STORE/, 'شمارش سفارش‌های تکمیل‌شدهٔ فروشگاه همچنان فیلتر نوع سفارش دارد');
  assert.match(ui, /history:\(histAll&&histAll\.summary&&histAll\.summary\.orders\)\|\|0/);
  assert.match(css, /\.wh38-store-tabs\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/, 'سربرگ‌ها سه‌ستونه شده‌اند');
  assert.match(route, /ctx\.query\.get\('orderType'\)/);
  assert.match(route, /if \(onlyType && String\(o\.orderType \|\| ''\) !== onlyType\) continue;/);
  assert.match(route, /r1Kg: o\.orderType === 'STORE' \? SRH\.r1Kg\(i\) : null/, 'وزن سرویس اول اقلام فروشگاهی در API هست');
  assert.match(app, /function whhItemsHtml\(items,isStore,orderId,allowReopen\)/);
  assert.match(app, /وزن سرویس اول/);
  assert.match(app, /وزن سرویس دوم/);
});

test('راه‌اندازی کاربران', async () => {
  let admin = await login('admin', ADMIN_PASS, '10.10.0.1');
  assert.equal((await call('POST', '/api/account/password', { cookie: admin, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);
  ADMIN = admin;
  const mk = async (username, roleCode, extra = {}) => {
    const r = await call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  };
  await mk('sh36-sales', 'sales');
  await mk('sh36-wh', 'warehouse');
  await mk('sh36-shop', 'store', { storeName: 'فروشگاه مرکزی تست' });
  SALES = await login('sh36-sales', PASS, '10.10.0.3');
  WH = await login('sh36-wh', PASS, '10.10.0.4');
  STORE = await login('sh36-shop', PASS, '10.10.0.5');
  assert.ok(SALES && WH && STORE);
});

test('جریان کامل سفارش فروشگاه و فیلتر سوابق فروشگاهی', async () => {
  const mkOrder = async (items) => {
    const so = await fetch(BASE + '/api/store/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: STORE, 'Idempotency-Key': IDEM() }, body: JSON.stringify({ name: 'مشتری تست', phone: '09120000000', items }) });
    const j = await so.json();
    assert.equal(so.status, 201, JSON.stringify(j));
    assert.equal((await call('POST', `/api/store/orders/${j.order.id}/quick-send`, { cookie: SALES, body: {} })).status, 200);
    return j.order;
  };
  O1 = await mkOrder([
    { productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' },
    { productId: 'p02', requestedQty: 50, requestedUnit: 'کیلوگرم' },
    { productId: 'p03', requestedQty: 40, requestedUnit: 'کیلوگرم' },
  ]);
  O2 = await mkOrder([{ productId: 'p01', requestedQty: 10, requestedUnit: 'کیلوگرم' }]);

  assert.equal((await call('POST', `/api/orders/${O1.id}/warehouse/accept`, { cookie: WH, body: {} })).status, 200);
  assert.equal((await call('POST', `/api/orders/${O1.id}/warehouse/start-preparing`, { cookie: WH, body: {} })).status, 200);
  const full = (await call('GET', `/api/orders/${O1.id}`, { cookie: SALES })).json.order;
  const byPid = Object.fromEntries(full.items.map((i) => [i.productId, i.id]));
  assert.equal((await call('POST', `/api/orders/${O1.id}/store-run/weights`, { cookie: WH, body: { run: 1, items: [{ itemId: byPid.p01, deliveredKg: 100 }, { itemId: byPid.p02, deliveredKg: 30 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${O1.id}/store-run/move`, { cookie: WH, body: { itemId: byPid.p02 } })).status, 200, 'ماندهٔ p02 (۲۰ کیلو) به سرویس دوم رفت');
  assert.equal((await call('POST', `/api/orders/${O1.id}/store-run/move`, { cookie: WH, body: { itemId: byPid.p03 } })).status, 200, 'p03 یکجا به سرویس دوم رفت');
  assert.equal((await call('POST', `/api/orders/${O1.id}/store-run/send-run`, { cookie: WH, body: { run: 1 } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${O1.id}/store-run/weights`, { cookie: WH, body: { run: 2, items: [{ itemId: byPid.p02, deliveredKg: 20 }, { itemId: byPid.p03, deliveredKg: 40 }] } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${O1.id}/store-run/send-run`, { cookie: WH, body: { run: 2 } })).status, 200);

  // سفارش عادی تا تکمیل انبار
  const rn = await call('POST', '/api/orders/remote', { cookie: SALES, body: { name: 'مشتری عادی', phone: '09110000009', scheduledDate: localDay(), scheduledTime: '00:00', dispatchPlace: 'بابل', items: [{ productId: 'p01', requestedQty: 100, requestedUnit: 'کیلوگرم' }] } });
  assert.equal(rn.status, 201, JSON.stringify(rn.json));
  ON = rn.json.order;
  assert.equal((await call('POST', `/api/orders/${ON.id}/warehouse/accept`, { cookie: WH, body: {} })).status, 200);
  const nFull = (await call('GET', `/api/orders/${ON.id}`, { cookie: WH })).json.order;
  assert.equal((await call('POST', `/api/orders/${ON.id}/warehouse`, { cookie: WH, body: { items: [{ itemId: nFull.items[0].id, deliveredKg: 100 }] } })).status, 200);

  const delivered=await call('GET','/api/warehouse/delivered',{cookie:WH});
  assert.equal(delivered.status,200);assert.ok(delivered.json.orders.some(r=>r.id===ON.id));assert.ok(!delivered.json.orders.some(r=>r.id===O1.id||r.id===O2.id));
  assert.equal((await call('GET',`/api/warehouse/delivered/${O1.id}`,{cookie:WH})).status,404);
  const document=await call('GET',`/api/warehouse/delivered/${ON.id}`,{cookie:WH});assert.equal(document.status,200);assert.equal(document.json.order.items[0].deliveredKg,100);assert(!JSON.stringify(document.json).includes('unitPrice'));

  const day = localDay();
  const storeHist = (await call('GET', `/api/warehouse/history?from=2000-01-01&to=${day}&orderType=STORE`, { cookie: WH })).json;
  assert.ok(Array.isArray(storeHist.rows));
  assert.ok(storeHist.rows.every((r) => r.orderType === 'STORE'), 'همهٔ ردیف‌ها فروشگاهی‌اند');
  const s1 = storeHist.rows.find((r) => r.id === O1.id);
  assert.ok(s1, 'سفارش کامل فروشگاه در سوابق فروشگاه‌هاست');
  assert.ok(!storeHist.rows.some((r) => r.id === O2.id), 'سفارش فروشگاهیِ هنوز در ورودی در سوابق نیست');
  assert.ok(!storeHist.rows.some((r) => r.id === ON.id), 'سفارش عادی در سوابق فروشگاه نیست');
  assert.equal(storeHist.summary.orders, storeHist.rows.length);
  const i1 = s1.items.find((i) => i.productId === 'p01');
  const i2 = s1.items.find((i) => i.productId === 'p02');
  const i3 = s1.items.find((i) => i.productId === 'p03');
  assert.equal(i1.r1Kg, 100);
  assert.ok(!i1.r2Kg);
  assert.equal(i2.r1Kg, 30);
  assert.equal(i2.r2Kg, 20);
  assert.equal(i2.deliveredKg, 50);
  assert.ok(!i3.r1Kg);
  assert.equal(i3.r2Kg, 40);

  const allHist = (await call('GET', `/api/warehouse/history?from=2000-01-01&to=${day}`, { cookie: WH })).json;
  assert.ok(allHist.rows.some((r) => r.id === O1.id) && allHist.rows.some((r) => r.id === ON.id), 'سوابق عمومی هر دو نوع سفارش را دارد');
  const n1 = allHist.rows.find((r) => r.id === ON.id);
  assert.strictEqual(n1.items[0].r1Kg, null, 'سفارش عادی ستون سرویس ندارد');

  const byNo = (await call('GET', `/api/warehouse/history?from=2000-01-01&to=${day}&orderType=STORE&q=${encodeURIComponent(O1.orderNo)}`, { cookie: WH })).json;
  assert.deepEqual(byNo.rows.map((r) => r.id), [O1.id], 'جستجو با شمارهٔ سفارش فقط خودش را برمی‌گرداند');
});
