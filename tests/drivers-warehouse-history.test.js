'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
// v37.3.4 — رگرسیون: شماره تماس راننده، نام بانک کنار پایانه پوز، و سربرگ «سوابق و گزارش» کارتابل انبار
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Tw4!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-whhist-'));
const port = 6121;
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
  let json = null; try { json = JSON.parse(await res.text()); } catch { /* not json */ }
  return { status: res.status, json };
}
const login = (u, p, ip) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: u, password: p }) })
  .then((r) => ((r.headers.get('set-cookie') || '').match(/sid=([^;]+)/) || [])[0] || null);
const localDay = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

test('فرم راننده: شماره تماس الزامی، نام بانک پوز با فهرست بانک‌ها، و نمایش بانک کنار پایانه پوز', () => {
  const ui = read('public/admin-ui.js');
  const app = read('public/app.js');
  assert.match(ui, /<span>شماره تماس راننده \*<\/span><input name="phone" required[^>]*inputmode="tel"/);
  assert.match(ui, /<span>نام بانک پوز<\/span><input name="posBank"[^>]*list="drvPosBanks"/);
  assert.match(ui, /data-label="شماره تماس"><div class="adm-cell">\$\{driverPhoneHtml\(x\.phone\)\}/);
  assert.match(ui, /data-label="پایانه پوز \/ بانک"><div class="adm-cell">\$\{driverPosHtml\(x\)\}/);
  assert.match(app, /function driverPosHtml\(d\)\{[\s\S]*?drv-pos-term[\s\S]*?drv-pos-bank/);
  assert.match(app, /const BT_POS_BANKS=\['بانک ملت','بانک ملی'/);
  const dsp = read('public/dispatch-ui.js');
  assert.match(dsp, /پوز \$\{driverPosText\(d\)\}/);
  assert.match(dsp, /class=\\?"dsp-roster-foot\\?"/);
});

test('سربرگ «سوابق و گزارش» در کارتابل انبار بعد از دو مرحلهٔ کاری است و با نوسازی خودکار پاک نمی‌شود', () => {
  const ui = read('public/ui2.js');
  assert.ok(ui.indexOf('data-wh38-tab="preparing"') < ui.indexOf('data-wh38-tab="history"'));
  assert.match(ui, /if\(phase==='history'\) return;/);
  assert.match(ui, /if\(phase==='history'\) renderWarehouseHistory\(\); else wh38Paint\(phase\);/);
});

test('API: راننده با تلفن و بانک؛ سوابق انبار با خلاصه، ناموجودی، ارجاع به فروش و کنترل دسترسی', async () => {
  let admin = await login('admin', ADMIN_PASS, '10.9.0.1');
  assert.equal((await call('POST', '/api/account/password', { cookie: admin, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);

  // راننده
  const d = await call('POST', '/api/drivers', { cookie: admin, body: { fullName: 'راننده آزمون', phone: '۰۹۱۲ ۳۴۵ ۶۷۸۹', vehicleType: 'وانت', plate: '12ب34567', posTerminal: 'POS-9', posBank: 'بانک سپه' } });
  assert.equal(d.status, 201, JSON.stringify(d.json));
  assert.equal(d.json.driver.phone, '09123456789');
  assert.equal(d.json.driver.posBank, 'بانک سپه');
  assert.equal((await call('PUT', `/api/drivers/${d.json.driver.id}`, { cookie: admin, body: { phone: '' } })).status, 400, 'تلفن خالی در ویرایش رد شود');
  const upd = await call('PUT', `/api/drivers/${d.json.driver.id}`, { cookie: admin, body: { posBank: 'بانک ملت' } });
  assert.equal(upd.json.driver.posBank, 'بانک ملت');
  assert.equal(upd.json.driver.phone, '09123456789', 'ویرایش جزئی تلفن را پاک نکند');

  // کاربران
  const mk = (username, roleCode) => call('POST', '/api/admin/users', { cookie: admin, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false } });
  assert.equal((await mk('wh1', 'warehouse')).status, 201);
  assert.equal((await mk('sales1', 'sales')).status, 201);
  const wh = await login('wh1', PASS, '10.9.0.3');
  const sales = await login('sales1', PASS, '10.9.0.4');
  const products = (await call('GET', '/api/products', { cookie: sales })).json.products.filter((p) => p.isActive);
  assert.ok(products.length >= 2);
  const [p1, p2] = products;

  const mkOrder = async (name, phone, items) => (await call('POST', '/api/orders/remote', { cookie: sales, body: {
    name, phone, scheduledDate: localDay(), scheduledTime: '00:00', dispatchPlace: 'بابل',
    items: items.map(([productId, requestedQty]) => ({ productId, requestedQty, requestedUnit: 'کیلوگرم' })) } })).json.order;
  const o1 = await mkOrder('مشتری یک', '09110000001', [[p1.id, 100], [p2.id, 20]]);
  const o2 = await mkOrder('مشتری دو', '09110000002', [[p1.id, 50]]);
  assert.ok(o1.customerId);
  const profileUpdate = await call('PUT', `/api/customers/${o1.customerId}`, { cookie: admin, body: {
    phone2: '09110000009', nationalId: '1234567890', company: 'شرکت آزمایشی', district: 'مرکز',
    address: 'نشانی کامل مشتری', plate: '12ب34567', vehicleType: 'وانت', notes: 'یادداشت مشتری',
  } });
  assert.equal(profileUpdate.status, 200, JSON.stringify(profileUpdate.json));
  for (const o of [o1, o2]) assert.equal((await call('POST', `/api/orders/${o.id}/warehouse/accept`, { cookie: wh, body: {} })).status, 200);
  const full = (await call('GET', `/api/orders/${o1.id}`, { cookie: wh })).json.order;
  const items = full.items.map((i) => (i.productId === p2.id ? { itemId: i.id, outOfStock: true, deliveredKg: 0 } : { itemId: i.id, deliveredKg: 98.5 }));
  assert.equal((await call('POST', `/api/orders/${o1.id}/warehouse`, { cookie: wh, body: { items } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o2.id}/return-sales`, { cookie: wh, body: { reason: 'اصلاح وزن' } })).status, 200);

  const day = localDay();
  const h = await call('GET', `/api/warehouse/history?from=${day}&to=${day}`, { cookie: wh });
  assert.equal(h.status, 200);
  assert.deepEqual([h.json.summary.orders, h.json.summary.itemCount, h.json.summary.outOfStock, h.json.summary.deliveredKg, h.json.summary.returned], [1, 2, 1, 98.5, 1]);
  assert.equal(h.json.rows[0].orderNo, o1.orderNo);
  assert.equal(h.json.rows[0].completedBy, 'wh1');
  assert.equal(h.json.returns[0].reason, 'اصلاح وزن');
  assert.ok(h.json.summary.byProduct.some((x) => x.outOfStock === 1));

  const warehouseDetails = await call('GET', `/api/warehouse/history/${o1.id}`, { cookie: wh });
  assert.equal(warehouseDetails.status, 200, JSON.stringify(warehouseDetails.json));
  assert.equal(warehouseDetails.json.order.orderType, 'REMOTE');
  assert.equal(warehouseDetails.json.customer.name, 'مشتری یک');
  assert.equal(warehouseDetails.json.customer.phone2, '09110000009');
  assert.equal(warehouseDetails.json.customer.nationalId, '1234567890');
  assert.equal(warehouseDetails.json.customer.address, 'نشانی کامل مشتری');
  assert.equal(warehouseDetails.json.order.createdBy.name, 'sales1');
  assert.equal(warehouseDetails.json.items.find(i => i.productName === p1.name).deliveredKg, 98.5);
  const warehouseStages = Object.fromEntries(warehouseDetails.json.stages.map(stage => [stage.key, stage]));
  assert.equal(warehouseStages.warehouseAccepted.user.name, 'wh1');
  assert.equal(warehouseStages.warehouseCompleted.user.name, 'wh1');
  assert.ok(warehouseDetails.json.events.some(event => event.action === 'WAREHOUSE_FINALIZE' && event.user.name === 'wh1'));

  const managerDetails = await call('GET', `/api/admin/orders/${o1.id}/history`, { cookie: admin });
  assert.equal(managerDetails.status, 200, JSON.stringify(managerDetails.json));
  assert.equal(managerDetails.json.order.orderTypeLabel, 'غیرحضوری');
  assert.ok(managerDetails.json.events.some(event => event.action === 'CREATE_REMOTE_ORDER' && event.actor.name === 'sales1'));
  assert.ok(managerDetails.json.events.some(event => event.action === 'WAREHOUSE_FINALIZE' && event.actor.name === 'wh1'));
  assert.equal(managerDetails.json.events.find(event => event.action === 'WAREHOUSE_FINALIZE').details.items[0].deliveredKg, 98.5);
  assert.equal((await call('GET', `/api/admin/orders/${o1.id}/history`, { cookie: sales })).status, 403, 'تاریخچهٔ کامل فقط برای مدیر باشد');
  // فیلترها
  assert.equal((await call('GET', `/api/warehouse/history?from=${day}&to=${day}&q=${encodeURIComponent('مشتری دو')}`, { cookie: wh })).json.rows.length, 0);
  assert.equal((await call('GET', `/api/warehouse/history?from=${day}&to=${day}&result=oos`, { cookie: wh })).json.rows.length, 1);
  assert.equal((await call('GET', '/api/warehouse/history?from=2000-01-01&to=2000-01-02', { cookie: wh })).json.rows.length, 0);
  // دسترسی: مدیر بله، فروش خیر
  assert.equal((await call('GET', '/api/warehouse/history', { cookie: admin })).status, 200);
  assert.equal((await call('GET', '/api/warehouse/history', { cookie: sales })).status, 403);
});
