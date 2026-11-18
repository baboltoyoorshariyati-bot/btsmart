'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.38.0 — عیب‌یابی نقش‌ها در ساخت کاربر:
   گزارش: «ساخت کاربر راننده خطای انتخاب راننده می‌دهد». علت‌ها: (۱) حساب راننده نیازمند
   رکورد رانندهٔ از پیش ثبت‌شده است اما فرم هیچ راهنمایی نداشت و روی سیستم تازه فهرست انتخاب
   خالی بود؛ (۲) فرم قدیمی «تنظیمات سیستم» نقش‌های پخش/راننده را نداشت و فرم ویرایشش فقط ۴ نقش
   داشت (با غلط تایپی «نگهبوش») و ویرایش کاربر فروش/پخش/راننده نقشش را بی‌صدا به نگهبانی برمی‌گرداند.
   این تست قراردادهای UI و API هر هفت نقش را قفل می‌کند. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Td8!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-drole-'));
const port = 5473;
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

let admin;
test('فرم‌های کاربر: هر هفت نقش، فیلد وابسته به نقش و راهنمای راننده', () => {
  const au = read('public/admin-ui.js');
  const app = read('public/app.js');
  const route = read('lib/routes/admin.js');
  assert.match(au, /data-role-fields="driver"/);
  assert.match(au, /data-role-fields="store"/);
  // خودرو و پوز از فهرست‌های مستقل انتخاب می‌شوند.
  assert.match(au, /name="vehicleId"/);
  assert.match(au, /name="paymentDeviceId"/);
  assert.match(au, /name="branchId"/);
  assert.match(au, /name="drvPhone"/);
  assert.match(au, /ترابری/);
  assert.match(au, /b\.roleCode === 'driver' && !\(b\.drvPhone && b\.vehicleId && b\.paymentDeviceId\)/);
  assert.match(au, /syncRoleFields/);
  assert.doesNotMatch(app, /نگهبوش/);
  assert.match(app, /<option value="dispatch">واحد پخش<\/option>/);
  assert.doesNotMatch(app, /<option value="driver">راننده<\/option>/);
  assert.match(app, /Object\.entries\(ROLE\)\.filter/);
  assert.match(app, /data-user-edit-driver/);
  assert.match(app, /data-legacy-driver-field/);
  assert.match(route, /باید یک رانندهٔ ثبت‌شده انتخاب شود/);
});

test('API: ساخت کاربر راننده بدون رکورد و بدون انتخاب خطای راهنما می‌دهد؛ با انتخاب موفق است', async () => {
  let boot = await login('admin', ADMIN_PASS, '10.30.0.1');
  assert.equal((await call('POST', '/api/account/password', { cookie: boot, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);
  admin = boot;
  const mk = (body) => call('POST', '/api/admin/users', { cookie: admin, body: { fullName: 'شخص آزمون', position: 'آزمون', password: PASS, mustChangePassword: false, ...body } });

  const noDriver = await mk({ username: 'dr-none', roleCode: 'driver' });
  assert.equal(noDriver.status, 400);
  assert.match(noDriver.json.error, /مشخصات راننده/);

  const drv = await call('POST', '/api/drivers', { cookie: admin, body: { fullName: 'راننده آزمون', phone: '09120000001', vehicleType: 'وانت', plate: '12ب34567' } });
  assert.equal(drv.status, 201, JSON.stringify(drv.json));
  const driverId = drv.json.driver.id;

  const stillNone = await mk({ username: 'dr-none2', roleCode: 'driver' });
  assert.equal(stillNone.status, 400, 'بدون انتخاب رانندهٔ متصل هم خطاست');

  const ok = await mk({ username: 'dr-ok', roleCode: 'driver', driverId });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.user.driverId, driverId);
  assert.equal(ok.json.user.roleCode, 'driver');

  const dup = await mk({ username: 'dr-dup', roleCode: 'driver', driverId });
  assert.equal(dup.status, 400, 'یک راننده فقط به یک حساب وصل می‌شود');
  assert.match(dup.json.error, /قبلاً به حساب/);
});

test('API: ویرایش کاربر راننده اتصال را نگه می‌دارد و هر هفت نقش ساختنی‌اند', async () => {
  const mk = (body) => call('POST', '/api/admin/users', { cookie: admin, body: { fullName: 'شخص آزمون', position: 'آزمون', password: PASS, mustChangePassword: false, ...body } });
  const users = (await call('GET', '/api/admin/users', { cookie: admin })).json.users;
  const drUser = users.find((u) => u.username === 'dr-ok');
  assert.ok(drUser);
  // ویرایش بدون فرستادن driverId (مثل فرم قدیمی) اتصال را پاک نمی‌کند و نقش را عوض نمی‌کند
  const upd = await call('PUT', `/api/admin/users/${drUser.id}`, { cookie: admin, body: { fullName: 'راننده ویرایش‌شده' } });
  assert.equal(upd.status, 200, JSON.stringify(upd.json));
  assert.equal(upd.json.user.roleCode, 'driver');
  assert.equal(upd.json.user.driverId, drUser.driverId);
  // تغییر نقش به فروش، اتصال راننده را جدا می‌کند
  const toSales = await call('PUT', `/api/admin/users/${drUser.id}`, { cookie: admin, body: { roleCode: 'sales' } });
  assert.equal(toSales.status, 200);
  assert.equal(toSales.json.user.roleCode, 'sales');
  assert.ok(!toSales.json.user.driverId);
  // ماتریس نقش‌ها
  for (const [username, extra] of [['u-gate', { roleCode: 'gate' }], ['u-sales', { roleCode: 'sales' }], ['u-wh', { roleCode: 'warehouse' }], ['u-store', { roleCode: 'store', storeName: 'فروشگاه آزمون' }], ['u-disp', { roleCode: 'dispatch' }]]) {
    const r = await mk({ username, ...extra });
    assert.equal(r.status, 201, `${username}: ${JSON.stringify(r.json)}`);
  }
  assert.equal((await mk({ username: 'u-store2', roleCode: 'store' })).status, 400, 'فروشگاه بدون نام خطاست');
  assert.equal((await mk({ username: 'u-bad', roleCode: 'manager' })).status, 400, 'نقش نامعتبر خطاست');
});
