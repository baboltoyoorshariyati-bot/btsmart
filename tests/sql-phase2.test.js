'use strict';
// فاز ۲ — قراردادهای «مسیرها مستقیماً SQL اجرا میکنند».
// مهمترین قرارداد: تغییر دیتابیس از یک اتصال بیرونی، در همان درخواست بعدی API دیده میشود.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..');
const PORT = 4197;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-phase2-'));
const dbFile = path.join(dataDir, 'baboltoyoor.db');
const ADMIN = 'Phase2!Admin123';
const NEWPASS = 'Phase2!New12345';
let proc;
let cookie;

function external() { return new DatabaseSync(dbFile); }

async function call(method, p, { body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

before(async () => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: ADMIN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout.on('data', (d) => { if (String(d).includes('"listening"')) { clearTimeout(t); resolve(); } });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
  const login = await call('POST', '/api/login', { body: { username: 'admin', password: ADMIN } });
  assert.equal(login.status, 200, login.text);
  const sid = login.headers.get('set-cookie').match(/sid=([^;]+)/)[1];
  cookie = `sid=${sid}`;
  const change = await call('POST', '/api/account/password', {
    body: { currentPassword: ADMIN, newPassword: NEWPASS },
  });
  assert.equal(change.status, 200, change.text);
});

after(() => {
  if (proc) proc.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('per-request SQL refresh: an external UPDATE is visible to /api/me on the very next request', async () => {
  const beforeMe = await call('GET', '/api/me');
  assert.equal(beforeMe.status, 200, beforeMe.text);
  assert.notEqual(beforeMe.json.user.fullName, 'مدیر تغییرکرده با SQL');

  const db = external();
  try {
    const row = db.prepare("SELECT payload FROM users WHERE username = 'admin'").get();
    const user = JSON.parse(row.payload);
    user.fullName = 'مدیر تغییرکرده با SQL';
    db.prepare("UPDATE users SET payload = ?, full_name = ? WHERE username = 'admin'").run(JSON.stringify(user), user.fullName);
  } finally { db.close(); }

  const afterMe = await call('GET', '/api/me');
  assert.equal(afterMe.status, 200, afterMe.text);
  assert.equal(afterMe.json.user.fullName, 'مدیر تغییرکرده با SQL');
  assert.equal(fs.existsSync(path.join(dataDir, 'db.json')), false, 'API must not fall back to a JSON file');
});

test('GET /api/products reads SQL directly: an externally inserted row appears', async () => {
  const id = 'sql-phase2-product';
  const db = external();
  try {
    const record = { id, quickCode: '90909', name: 'محصول SQL فاز ۲', defaultUnit: 'کیلوگرم', isActive: true, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO products (id, created_at, quick_code, name, is_active, default_unit, payload) VALUES (?,?,?,?,?,?,?)')
      .run(id, record.createdAt, record.quickCode, record.name, 1, record.defaultUnit, JSON.stringify(record));
  } finally { db.close(); }

  const r = await call('GET', '/api/products');
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.products.some((p) => p.id === id && p.name === 'محصول SQL فاز ۲'), 'products endpoint must query the SQL table');
});

test('GET /api/dashboard counts come from an SQL aggregation, not array scans', async () => {
  const before = await call('GET', '/api/dashboard');
  assert.equal(before.status, 200, before.text);
  const id = 'sql-phase2-order';
  const db = external();
  try {
    const record = { id, orderNo: '999001', status: 'WAREHOUSE_PENDING', orderType: 'ONSITE', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO orders (id, created_at, order_no, status, order_type, payload) VALUES (?,?,?,?,?,?)')
      .run(id, record.createdAt, record.orderNo, record.status, record.orderType, JSON.stringify(record));
  } finally { db.close(); }

  const afterR = await call('GET', '/api/dashboard');
  assert.equal(afterR.status, 200, afterR.text);
  assert.equal(afterR.json.counts.activeOrders, before.json.counts.activeOrders + 1);
  assert.equal(afterR.json.counts.pendingWarehouse, before.json.counts.pendingWarehouse + 1);
});

test('GET /api/admin/audit uses dynamic prepared SQL: filters are bound, injection returns nothing', async () => {
  const db = external();
  try {
    const record = {
      id: 'sql-phase2-audit', seq: 900001, action: 'SQL_PHASE2', entityType: 'order', entityId: 'x',
      userId: 'u1', username: 'admin', createdAt: '2026-10-27T00:00:00.000Z', prevHash: 'SQL', hash: 'SQL',
    };
    db.prepare('INSERT INTO audit (id, created_at, seq, action, entity_type, entity_id, user_id, username, payload) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(record.id, record.createdAt, record.seq, record.action, record.entityType, record.entityId, record.userId, record.username, JSON.stringify(record));
  } finally { db.close(); }

  const good = await call('GET', '/api/admin/audit?action=SQL_PHASE2');
  assert.equal(good.status, 200, good.text);
  assert.ok(good.json.audit.some((a) => a.id === 'sql-phase2-audit'));
  assert.equal(good.json.total, good.json.audit.length);

  const evil = await call('GET', '/api/admin/audit?action=' + encodeURIComponent("SQL_PHASE2' OR 1=1 --"));
  assert.equal(evil.status, 200, evil.text);
  assert.equal(evil.json.total, 0, 'the injection payload must be bound as a value, never concatenated');
});

test('report joins are SQL lookups: an external customer rename shows up in /api/admin/reports/query', async () => {
  const db = external();
  try {
    const id = 'sql-phase2-customer';
    const customer = { id, code: '77777', name: 'مشتری فاز دو', phone: '09120000009', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO customers (id, created_at, name, phone, code, payload) VALUES (?,?,?,?,?,?)')
      .run(id, customer.createdAt, customer.name, customer.phone, customer.code, JSON.stringify(customer));
    const visit = { id: 'sql-phase2-visit', customerId: id, status: 'WAITING_SALES', createdAt: '2026-10-27T08:00:00.000Z' };
    db.prepare('INSERT INTO visits (id, created_at, customer_id, status, payload) VALUES (?,?,?,?,?)')
      .run(visit.id, visit.createdAt, visit.customerId, visit.status, JSON.stringify(visit));
  } finally { db.close(); }

  const r = await call('POST', '/api/admin/reports/query', { body: { source: 'visits', fields: ['customerName', 'customerCode'] } });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.rows.some((x) => x.customerName === 'مشتری فاز دو' && x.customerCode === '77777'),
    'the report join must resolve the customer through SQL');
});

test('idempotency replay is resolved with a prepared SQL statement', async () => {
  const key = 'phase2key123456';
  const body = { source: 'customers', fields: ['name'] };
  const h = { 'Idempotency-Key': key };
  const a = await call('POST', '/api/admin/reports/query', { body, headers: h });
  assert.equal(a.status, 200, a.text);
  const b = await call('POST', '/api/admin/reports/query', { body, headers: h });
  assert.equal(b.status, 200, b.text);
  assert.equal(b.headers.get('Idempotent-Replayed'), 'true');
  const db = external();
  try {
    const n = db.prepare('SELECT COUNT(*) AS n FROM idempotency WHERE idem_key = ?').get(key).n;
    assert.equal(Number(n), 1, 'exactly one idempotency row must be stored in SQL');
  } finally { db.close(); }
});

test('repositories: CRUD with bound params, safe column names, no JSON file writes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-repos-'));
  const code = `
const s=require('./lib/store');s.init();
const repo=require('./lib/sql-repos');
const sql=s.sql;
repo.repos.customers.insert({id:'c1',name:'الف',code:'00001',phone:'0912'});
const found=repo.repos.customers.find('c1');
const byCode=repo.repos.customers.findBy('code','00001');
const injected=repo.repos.customers.findBy('code',"' OR 1=1 --");
let rejected=false;
try{repo.repos.customers.select('id = ? OR 1=1 --',[])}catch(e){rejected=true}
const before=sql.queryCount();
repo.repos.customers.replace({id:'c1',name:'ب',code:'00001',phone:'0912'});
const rows=repo.repos.customers.all();
repo.repos.customers.remove('c1');
const afterCount=repo.repos.customers.count();
console.log('RESULT:'+JSON.stringify({found:found&&found.name,byCode:byCode&&byCode.id,injected,rows:rows.length,names:rows.map(r=>r.name),afterCount,queries:sql.queryCount()-before,jsonFile:require('fs').existsSync(require('path').join(process.env.DATA_DIR,'db.json'))}));
`;
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', code], {
    cwd: root, env: { ...process.env, DATA_DIR: dir, ADMIN_INITIAL_PASSWORD: ADMIN }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.split('RESULT:')[1].trim());
  assert.equal(out.found, 'الف');
  assert.equal(out.injected, null);
  assert.equal(out.byCode, 'c1');
  assert.equal(out.rows, 1);
  assert.deepEqual(out.names, ['ب']);
  assert.equal(out.afterCount, 0);
  assert.ok(out.queries > 0, 'repository calls must execute SQL statements');
  assert.equal(out.jsonFile, false);
  fs.rmSync(dir, { recursive: true, force: true });
});


test('phase 2 static contracts: live refresh is wired and converted routes call SQL helpers', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(read('lib/http.js'), /store\.refresh\(\)/);
  assert.match(read('lib/http.js'), /repos\.idempotency\.select/);
  assert.match(read('lib/routes/core.js'), /repo\.dashboardCounts\(/);
  assert.match(read('lib/routes/admin.js'), /repo\.auditQuery\(/);
  assert.match(read('lib/reports.js'), /repo\.lookups\.customerOf/);
  assert.match(read('lib/sql-repos.js'), /prepare|sql\.get|sql\.all/);
  assert.match(read('lib/sqlite-store.js'), /PRAGMA data_version/);
  assert.match(read('lib/sqlite-store.js'), /function put\(/);
  assert.match(read('lib/store.js'), /function activeUserById/);
  const doc = read('docs/sqlite-database-fa.md');
  assert.match(doc, /فاز ۲/);
  assert.match(read('docs/PROJECT-PROMPT-fa.md'), /فاز ۲/);
});
