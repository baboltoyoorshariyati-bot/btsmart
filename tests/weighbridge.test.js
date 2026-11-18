'use strict';
// تست باسکول: تجزیه‌گر و تصمیم وزن (واحد) + جریان کامل ورود/خروج روی سرور واقعی
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const wb = require('../lib/weighbridge');

test('تجزیه خط نمایشگر: وزن و پایداری', () => {
  assert.deepEqual(wb.parseIndicatorLine('ST,GS   +012345.6 kg'), { weight: 12345.6, stable: true });
  assert.deepEqual(wb.parseIndicatorLine('US,GS  +0000.0 kg'), { weight: 0, stable: false });
  assert.deepEqual(wb.parseIndicatorLine('ST,GS 1500 g'), { weight: 1.5, stable: true });
  assert.equal(wb.parseIndicatorLine(''), null);
  assert.equal(wb.parseIndicatorLine('HELLO'), null);
});

test('تصمیم وزن: سنگین‌تر بار و سبک‌تر خالی، خالص = اختلاف', () => {
  const r = wb.netFromTwo(11000, 32000);
  assert.deepEqual(r, { loadedKg: 32000, emptyKg: 11000, netKg: 21000 });
  assert.throws(() => wb.netFromTwo(10000, 10005), /اختلاف/);
});

// ---------- یکپارچه ----------
const ADMIN_PASS = 'Ta1!' + require('crypto').randomBytes(8).toString('hex');
const ADMIN_NEW = 'Tb2!' + require('crypto').randomBytes(8).toString('hex');
const PASS = 'Tc3!' + require('crypto').randomBytes(8).toString('hex');
const TOKEN = 'scale-token-' + require('crypto').randomBytes(8).toString('hex');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-wb-'));
const port = 5621;
const BASE = `http://127.0.0.1:${port}`;
let proc;
let adminC, gateC, salesC;

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: ADMIN_PASS, LOGIN_MAX_ATTEMPTS: '50', WEIGHBRIDGE_TOKEN: TOKEN, WEIGHBRIDGE_SIMULATOR: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout.on('data', (d) => { if (String(d).includes('"listening"')) { clearTimeout(t); resolve(); } });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
  const first = await call('POST', '/api/login', { body: { username: 'admin', password: ADMIN_PASS }, ip: '10.7.0.1' });
  const changed = await call('POST', '/api/account/password', { cookie: first.cookie, body: { currentPassword: ADMIN_PASS, newPassword: ADMIN_NEW } });
  assert.equal(changed.status, 200, changed.text);
  adminC = first.cookie;
  const mk = async (username, roleCode) => call('POST', '/api/admin/users', { cookie: adminC, body: { username, fullName: username, position: 'تست', roleCode, password: PASS, mustChangePassword: false } });
  await mk('gatewb', 'gate');
  await mk('salesWb', 'sales');
  gateC = (await call('POST', '/api/login', { body: { username: 'gatewb', password: PASS }, ip: '10.7.0.2' })).cookie;
  salesC = (await call('POST', '/api/login', { body: { username: 'salesWb', password: PASS }, ip: '10.7.0.3' })).cookie;
  assert.ok(adminC && gateC && salesC);
});

after(() => { if (proc) proc.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function call(method, p, { cookie, body, headers = {}, ip } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (ip) h['X-Forwarded-For'] = ip;
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const sid = res.headers.get('set-cookie')?.match(/sid=([^;]+)/);
  return { status: res.status, json, text, cookie: sid && sid[1] ? `sid=${sid[1]}` : null };
}
const reading = (line, headers = { 'X-Scale-Token': TOKEN }) => call('POST', '/api/weighbridge/reading', { body: { line }, headers });

test('دریافت وزن از عامل سریال: توکن نادرست رد می‌شود', async () => {
  assert.equal((await reading('ST,GS +000100.0 kg', {})).status, 403);
  assert.equal((await reading('ST,GS +000100.0 kg', { 'X-Scale-Token': 'wrong' })).status, 403);
});

test('خط نمایشگر با توکن معتبر پذیرفته و وزن زنده ثبت می‌شود', async () => {
  const r = await reading('ST,GS   +012345.6 kg');
  assert.equal(r.status, 200);
  assert.equal(r.json.live.weight, 12345.6);
  assert.equal(r.json.live.stable, true);
});

test('نقش فروش به کارتابل باسکول دسترسی ندارد', async () => {
  assert.equal((await call('GET', '/api/weighbridge/state', { cookie: salesC })).status, 403);
});

test('وزن ناپایدار ثبت نمی‌شود', async () => {
  await reading('US,GS   +030000.0 kg');
  const r = await call('POST', '/api/weighbridge/weigh', { cookie: gateC, body: { plate: '۱۲ب۳۴۵-۶۷' } });
  assert.equal(r.status, 409);
});

test('افزودن وسیله و کالا، سپس ورود و خروج با محاسبه خالص', async () => {
  const v = await call('POST', '/api/weighbridge/vehicles', { cookie: gateC, body: { plate: '12ب345-67', driverName: 'تست' } });
  assert.equal(v.status, 201, v.text);
  const dup = await call('POST', '/api/weighbridge/vehicles', { cookie: gateC, body: { plate: '12ب345-67' } });
  assert.equal(dup.status, 409);
  const p = await call('POST', '/api/admin/products', { cookie: adminC, body: { quickCode: '99', name: 'گندم', defaultUnit: 'کیلوگرم' } });
  assert.equal(p.status, 201, p.text);
  const productId = p.json.product.id;

  await reading('ST,GS +032000.0 kg');
  const entry = await call('POST', '/api/weighbridge/weigh', { cookie: gateC, body: { plate: '12ب345-67', productId } });
  assert.equal(entry.status, 201, entry.text);
  assert.equal(entry.json.phase, 'ENTRY');
  assert.equal(entry.json.trip.firstKind, 'PENDING');

  await reading('ST,GS +011000.0 kg');
  const exit = await call('POST', '/api/weighbridge/weigh', { cookie: gateC, body: { plate: '12ب345-67' } });
  assert.equal(exit.status, 200, exit.text);
  assert.equal(exit.json.phase, 'EXIT');
  assert.equal(exit.json.trip.netKg, 21000);
  assert.equal(exit.json.trip.status, 'DONE');
  assert.equal(exit.json.trip.firstKind, 'LOADED');
  assert.equal(exit.json.trip.secondKind, 'EMPTY');

  const again = await call('POST', '/api/weighbridge/weigh', { cookie: gateC, body: { plate: '12ب345-67', productId } });
  assert.equal(again.status, 409, 'وزن تکراری بلافاصله پس از خروج باید رد شود');
});

test('لغو وزن‌کشی باز با دلیل ثبت می‌شود', async () => {
  await call('POST', '/api/weighbridge/vehicles', { cookie: gateC, body: { plate: '99ج999-11' } });
  const p = await call('GET', '/api/weighbridge/state', { cookie: gateC });
  const productId = p.json.products[0].id;
  await reading('ST,GS +025000.0 kg');
  const entry = await call('POST', '/api/weighbridge/weigh', { cookie: gateC, body: { plate: '99ج999-11', productId } });
  assert.equal(entry.status, 201, entry.text);
  const cancel = await call('POST', `/api/weighbridge/trips/${entry.json.trip.id}/cancel`, { cookie: gateC, body: { reason: 'اشتباه در پلاک' } });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(cancel.json.trip.status, 'CANCELLED');
});

test('شبیه‌ساز فقط برای مدیر و با فعال بودن تنظیم کار می‌کند', async () => {
  assert.equal((await call('POST', '/api/weighbridge/simulate', { cookie: gateC, body: { weight: 1000 } })).status, 403);
  const r = await call('POST', '/api/weighbridge/simulate', { cookie: adminC, body: { weight: 15000, stable: true } });
  assert.equal(r.status, 200);
  assert.equal(r.json.live.weight, 15000);
});
