'use strict';
/* v37.43.0 — ساعت و تاریخ سامانه از سرور؛ حذف خط سفید صفحهٔ ورود و واترمارک ثابت لوگو.
   ۱) سرور نقطهٔ پایانی عمومی ساعت دارد؛ ۲) کلاینت اختلاف ساعت را همگام می‌کند و همهٔ
   نمایش‌ها/پیش‌فرض‌های «امروز» با ساعت سرور کار می‌کنند؛ ۳) برق دکمه داخل خود دکمه
   می‌ماند و جای خط سفید، واترمارک ثابت لوگو سمت راست کارت ورود است. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-test-'));
const port = 4393;
const BASE = `http://127.0.0.1:${port}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(root, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: 'Ta1!serverTime42' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout.on('data', (d) => { if (String(d).includes('"listening"')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
});

after(() => { if (proc) proc.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('GET /api/server-time بدون ورود، ساعت سرور را با سه جزء لازم برمی‌گرداند', async () => {
  const before1 = Date.now();
  const res = await fetch(BASE + '/api/server-time');
  const after1 = Date.now();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') || '', /no-store/);
  const j = await res.json();
  assert.ok(Number.isFinite(j.epochMs), 'epochMs عددی است');
  assert.ok(j.epochMs >= before1 - 1000 && j.epochMs <= after1 + 1000, 'epochMs همان لحظهٔ سرور است');
  assert.equal(Math.abs(j.tzOffsetMinutes + new Date().getTimezoneOffset()), 0, 'اختلاف منطقهٔ زمانی سرور درست است');
  assert.ok(Math.abs(Date.parse(j.now) - j.epochMs) < 1000, 'now با epochMs سازگار است');
});

test('سرور مسیر ساعت را عمومی ثبت کرده است', () => {
  assert.match(read('lib/routes/auth.js'), /route\('GET', '\/api\/server-time', \{ auth: false \}/);
});

test('کلاینت اختلاف ساعت سرور را همگام می‌کند و ساعت سرور می‌سازد', () => {
  const app = read('public/app.js');
  assert.match(app, /async function syncServerTime\(\)/);
  assert.match(app, /fetch\('\/api\/server-time',\{cache:'no-store'\}\)/);
  assert.match(app, /serverTimeOffsetMs=j\.epochMs-Math\.round\(\(t0\+t1\)\/2\)/);
  assert.match(app, /function serverNow\(\)/);
  assert.match(app, /function serverEpoch\(\)\{return Date\.now\(\)\+serverTimeOffsetMs\}/);
  // همگام‌سازی در شروع، بعد از ورود و دوره‌ای انجام می‌شود
  assert.match(app, /async function bootstrap\(\)\{\s*syncServerTime\(\);/);
  assert.match(app, /setInterval\(syncServerTime,5\*60\*1000\)/);
  const loginAt = app.indexOf("await api('/api/login'");
  const syncAt = app.indexOf('syncServerTime();', loginAt);
  assert.ok(loginAt > -1 && syncAt > loginAt && syncAt - loginAt < 200, 'بعد از ورود موفق دوباره همگام می‌شود');
});

test('همهٔ نمایش‌های ساعت/تاریخ و پیش‌فرض‌های «امروز» از ساعت سرور استفاده می‌کنند', () => {
  const app = read('public/app.js');
  assert.match(app, /function today\(\)\{const d=serverNow\(\);/);
  assert.match(app, /function todayText\(\)\{const p=faDateParts\(serverNow\(\),/);
  assert.match(app, /function railClockTick\(\)\{\s*const d=serverNow\(\);/);
  assert.match(app, /function getJalaliToday\(\)\{\s*const now=serverNow\(\);/);
  assert.match(app, /function now24\(\)\{const d=serverNow\(\);/);
  assert.match(app, /function nextDayIso\(\)\{const d=serverNow\(\);/);
  assert.match(app, /formatDateTime24\(serverNow\(\)\)/);
  assert.match(app, /const updated=serverNow\(\)\.toLocaleTimeString\('fa-IR'\);/);
  assert.match(app, /whhTime\(new Date\(serverEpoch\(\)\)\.toISOString\(\)\)/);
  assert.match(read('public/ui2.js'), /typeof serverNow==='function'\?serverNow\(\):new Date\(\)/);
  assert.match(read('public/dispatch-ui.js'), /typeof serverNow==='function'\?serverNow\(\):new Date\(\)/);
  assert.match(read('public/admin-ui.js'), /typeof serverNow === 'function' \? serverNow\(\) : new Date\(\)/);
});

test('صفحهٔ ورود: برق دکمه داخل خود دکمه می‌ماند و واترمارک ثابت لوگو جای خط سفید است', () => {
  const compat = read('public/compatibility.css');
  const block = compat.slice(compat.indexOf('v37.43.0'));
  assert.match(block, /#appView \.btn-primary,#modal \.btn-primary,\.login-card \.btn-primary\{position:relative\}/);
  assert.match(block, /#loginView \.login-stage::before\{[^}]*background:url\("\/logo\.png"\) center\/contain no-repeat;opacity:\.07;/);
  assert.match(block, /@media \(max-width:1024px\)\{#loginView \.login-stage::before\{display:none\}\}/);
});
