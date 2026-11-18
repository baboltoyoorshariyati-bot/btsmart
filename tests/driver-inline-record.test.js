'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.40.0 — راننده هنگام ساخت «کاربر راننده» با مشخصات خودرو و دستگاه پوز ساخته می‌شود
   (دیگر تعریف جدای راننده در کارتابل ترابری نیست) و در کارتابل ترابری، مدیر و واحد پخش
   مشخصات خودرو/پوز را می‌بینند و ویرایش می‌کنند. ساخت و حذف رکورد از آن صفحه برداشته شده است. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Te9!' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-dinline-'));
const port = 5474;
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

let admin, dispCookie, drvUser, driverId;
test('قرارداد UI: مشخصات راننده در فرم کاربر است و «رانندهٔ جدید» از کارتابل ترابری رفته', () => {
  const au = read('public/admin-ui.js');
  const app = read('public/app.js');
  const ext = read('lib/routes/admin-ext.js');
  for (const n of ['drvPhone', 'vehicleId', 'paymentDeviceId', 'branchId']) {
    assert.match(au, new RegExp(`name="${n}"`), `فرم مدیریت فیلد ${n}`);
  }
  assert.match(app, /data-action="manage-users"/);
  assert.doesNotMatch(au, /data-adm="drv-new"/, 'دکمهٔ ساخت راننده در کارتابل ترابری نیست');
  assert.match(au, /رانندگان هنگام ساخت «کاربر راننده» ساخته می‌شوند/);
  assert.match(au, /adm\.canEditDrivers=canEditDrivers/);
  assert.match(ext, /route\('GET', '\/api\/drivers', \{ roles: \['admin', 'dispatch'\] \}/);
  assert.match(ext, /route\('PUT', '\/api\/drivers\/:id', \{ roles: \['admin', 'dispatch'\] \}/);
  assert.match(ext, /route\('POST', '\/api\/drivers', \{ \.\.\.ADMIN, idempotent: true \}/, 'ساخت مستقیم رکورد همچنان فقط مدیر است');
});

test('ساخت کاربر راننده بدون هیچ رکورد از پیش‌ساخته، راننده را با خودرو و پوز می‌سازد', async () => {
  let boot = await login('admin', ADMIN_PASS, '10.40.0.1');
  assert.equal((await call('POST', '/api/account/password', { cookie: boot, body: { currentPassword: ADMIN_PASS, newPassword: PASS } })).status, 200);
  admin = boot;
  const before = (await call('GET', '/api/drivers', { cookie: admin })).json.drivers;
  assert.equal(before.length, 0, 'شروع بدون رکورد راننده است');

  const missing = await call('POST', '/api/admin/users', { cookie: admin, body: { username: 'drv-miss', fullName: 'ناقص', position: 'راننده', roleCode: 'driver', password: PASS, mustChangePassword: false, drvPhone: '09120000002', drvVehicleType: 'وانت' } });
  assert.equal(missing.status, 400, 'بدون پلاک خطاست: ' + JSON.stringify(missing.json));
  assert.equal((await call('GET', '/api/drivers', { cookie: admin })).json.drivers.length, 0, 'رکورد یتیم ساخته نشده است');

  const ok = await call('POST', '/api/admin/users', { cookie: admin, body: { username: 'ali.drv', fullName: 'علی رضایی', position: 'راننده', roleCode: 'driver', password: PASS, mustChangePassword: false, drvPhone: '۰۹۱۲ ۱۲۳ ۴۵۶۷', drvVehicleType: 'وانت', drvPlate: '12ب34567', drvPosTerminal: 'POS-01', drvPosBank: 'بانک ملت' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  drvUser = ok.json.user;
  driverId = drvUser.driverId;
  assert.ok(driverId, 'حساب به رکورد ساخته‌شده وصل است');

  const list = (await call('GET', '/api/drivers', { cookie: admin })).json.drivers;
  assert.equal(list.length, 1);
  const rec = list[0];
  assert.equal(rec.id, driverId);
  assert.equal(rec.fullName, 'علی رضایی');
  assert.equal(rec.phone, '09121234567', 'تماس نرمال‌سازی شده است');
  assert.equal(rec.vehicleType, 'وانت');
  assert.ok(rec.plate.includes('12') && rec.plate.includes('345'));
  assert.equal(rec.posTerminal, 'POS-01');
  assert.equal(rec.posBank, 'بانک ملت');
});

test('ویرایش کاربر راننده مشخصات خودرو/پوز را روی همان رکورد عوض می‌کند؛ واحد پخش هم در کارتابل ویرایش می‌کند', async () => {
  const upd = await call('PUT', `/api/admin/users/${drvUser.id}`, { cookie: admin, body: { drvPhone: '09120000003', drvVehicleType: 'کامیونت', drvPlate: '22ج45678', drvPosTerminal: 'POS-02', drvPosBank: 'بانک ملی' } });
  assert.equal(upd.status, 200, JSON.stringify(upd.json));
  assert.equal(upd.json.user.driverId, driverId, 'رکورد تازه ساخته نشده، همان وصل است');
  let rec = (await call('GET', '/api/drivers', { cookie: admin })).json.drivers.find((d) => d.id === driverId);
  assert.ok(rec.plate.includes('22') && rec.plate.includes('456'), 'پلاک تازه روی رکورد نشسته است: ' + rec.plate);
  assert.equal(rec.posBank, 'بانک ملی');
  assert.equal(rec.vehicleType, 'کامیونت');

  // واحد پخش: کاربر پخش بساز، وارد شو، فهرست را ببین و پوز را ویرایش کن؛ ساخت رکورد مستقیم برایش بسته است
  const mkD = await call('POST', '/api/admin/users', { cookie: admin, body: { username: 'disp1', fullName: 'مسئول پخش', position: 'پخش', roleCode: 'dispatch', password: PASS, mustChangePassword: false } });
  assert.equal(mkD.status, 201);
  dispCookie = await login('disp1', PASS, '10.40.0.3');
  const seen = await call('GET', '/api/drivers', { cookie: dispCookie });
  assert.equal(seen.status, 200, 'واحد پخش فهرست رانندگان را می‌بیند');
  const put = await call('PUT', `/api/drivers/${driverId}`, { cookie: dispCookie, body: { posBank: 'بانک سپه', posTerminal: 'POS-09' } });
  assert.equal(put.status, 200, 'واحد پخش خودرو/پوز را ویرایش می‌کند: ' + JSON.stringify(put.json));
  rec = (await call('GET', '/api/drivers', { cookie: admin })).json.drivers.find((d) => d.id === driverId);
  assert.equal(rec.posBank, 'بانک سپه');
  assert.equal((await call('POST', '/api/drivers', { cookie: dispCookie, body: { fullName: 'x', phone: '09120000009', vehicleType: 'وانت', plate: '11ب11111' } })).status, 403, 'ساخت مستقیم رکورد برای پخش بسته است');
  assert.equal((await call('DELETE', `/api/drivers/${driverId}`, { cookie: dispCookie })).status, 403, 'حذف برای پخش بسته است');

  // حساب راننده با همان رکورد وارد می‌شود
  const drvCookie = await login('ali.drv', PASS, '10.40.0.4');
  const me = await call('GET', '/api/me', { cookie: drvCookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.roleCode, 'driver');
});
