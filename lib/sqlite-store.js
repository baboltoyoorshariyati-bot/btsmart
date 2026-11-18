'use strict';
// لایهٔ ذخیرهسازی SQL (SQLite) — منبع اصلی دادههای سامانه.
// از node:sqlite داخلی Node.js >= 22.5 استفاده میکند؛ هیچ وابستگی خارجی ندارد.
// هر موجودیت جدول خودش را دارد؛ ستونهای پرکاربرد واقعی و ایندکسهستند و
// رکورد کامل هم در ستون payload (JSON) نگهداری میشود تا هیچ فیلدی گم نشود.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const log = require('./logger');

const SQL_SCHEMA_VERSION = 1;
const DB_BASENAME = 'baboltoyoor.db';

function dbFile() { return config.SQLITE_FILE || path.join(config.DATA_DIR, DB_BASENAME); }
function legacyJsonFile() { return path.join(config.DATA_DIR, 'db.json'); }

// ---------------------------------------------------------------- schema spec
// id: تابعی که شناسهٔ پایدار رکورد را برمیگرداند (برای diff/txn لازم است).
// cols: ستونهای واقعی SQL ← کلید فیلد در رکورد. مقادیر مرکب به JSON تبدیل میشوند.
const TABLES = [
  { key: 'roles',            table: 'roles',            id: (r) => r.code,  cols: { title: 'title' }, indexes: [] },
  { key: 'users',            table: 'users',            id: (r) => r.id,    cols: { username: 'username', role_code: 'roleCode', full_name: 'fullName', is_active: 'isActive', must_change_password: 'mustChangePassword' }, indexes: ['username', 'role_code'] },
  { key: 'customers',        table: 'customers',        id: (r) => r.id,    cols: { name: 'name', phone: 'phone', code: 'code', is_active: 'isActive' }, indexes: ['code', 'phone'] },
  { key: 'drivers',          table: 'drivers',          id: (r) => r.id,    cols: { name: 'name', phone: 'phone', is_active: 'isActive', plate_no: 'plateNo' }, indexes: ['name'] },
  { key: 'dispatchReturns',  table: 'dispatch_returns', id: (r) => r.id,    cols: { order_id: 'orderId', order_no: 'orderNo', status: 'status' }, indexes: ['order_id'] },
  { key: 'storeBranches',    table: 'store_branches',   id: (r) => r.id,    cols: { name: 'name', branch_no: 'branchNo', is_active: 'isActive' }, indexes: ['branch_no'] },
  { key: 'paymentDevices',   table: 'payment_devices',  id: (r) => r.id,    cols: { title: 'title', terminal_number: 'terminalNumber', is_active: 'isActive' }, indexes: ['terminal_number'] },
  { key: 'visits',           table: 'visits',           id: (r) => r.id,    cols: { customer_id: 'customerId', status: 'status', visit_no: 'visitNo', gate_exit_at: 'gateExitAt' }, indexes: ['customer_id', 'status'] },
  { key: 'orders',           table: 'orders',           id: (r) => r.id,    cols: { order_no: 'orderNo', customer_id: 'customerId', status: 'status', order_type: 'orderType', source: 'source', approval_status: 'approvalStatus', scheduled_date: 'scheduledDate' }, indexes: ['order_no', 'customer_id', 'status'] },
  { key: 'orderItems',       table: 'order_items',      id: (r) => r.id,    cols: { order_id: 'orderId', product_id: 'productId', description: 'description', quantity: 'quantity' }, indexes: ['order_id', 'product_id'] },
  { key: 'payments',         table: 'payments',         id: (r) => r.id,    cols: { order_id: 'orderId', amount: 'amount', method: 'method', invoice_number: 'invoiceNumber' }, indexes: ['order_id', 'invoice_number'] },
  { key: 'notifications',    table: 'notifications',    id: (r) => r.id,    cols: { user_id: 'userId', is_read: 'isRead', type: 'type' }, indexes: ['user_id'] },
  { key: 'products',         table: 'products',         id: (r) => r.id,    cols: { quick_code: 'quickCode', name: 'name', is_active: 'isActive', default_unit: 'defaultUnit' }, indexes: ['quick_code', 'name'] },
  { key: 'priceList',        table: 'price_list',       id: (r) => r.id,    cols: { product_id: 'productId', price: 'price', date: 'date', unit: 'unit' }, indexes: ['product_id', 'date'] },
  { key: 'audit',            table: 'audit',            id: (r) => r.id,    cols: { seq: 'seq', action: 'action', entity_type: 'entityType', entity_id: 'entityId', user_id: 'userId', username: 'username' }, indexes: ['seq', 'action', 'entity_id'] },
  { key: 'vehicles',          table: 'vehicles',          id: (r) => r.id,    cols: { plate: 'plate', is_active: 'isActive' }, indexes: ['plate'] },
  { key: 'weighTrips',        table: 'weigh_trips',       id: (r) => r.id,    cols: { plate: 'plate', status: 'status', vehicle_id: 'vehicleId' }, indexes: ['plate','status'] },
  { key: 'idempotency',      table: 'idempotency',      id: (r) => `${r.key || ''}|${r.userId || ''}|${r.route || ''}|${r.createdAt || ''}`, cols: { idem_key: 'key', user_id: 'userId', route: 'route' }, indexes: ['idem_key'] },
];

const NUMERIC = new Set(['branch_no', 'seq', 'quantity', 'amount', 'price', 'is_active', 'is_read', 'must_change_password']);

let conn = null;
let lastVersion = null;
let queryCounter = 0;
let writeCounter = 0;
let deleteCounter = 0;
let liveHook = null;
// آخرین وضعیت ذخیرهشده (collection -> Map<id, payload>) برای UPDATE/DELETE افزایشی
const state = new Map();

function prepare(sqlText) {
  queryCounter++;
  return conn.prepare(sqlText);
}
function bindable(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string' || v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}
function specForSafe(table) { return TABLES.find((x) => x.table === table || x.key === table) || null; }
function specFor(table) {
  const s = specForSafe(table);
  if (!s) throw new Error(`جدول ناشناخته: ${table}`);
  return s;
}
function scalar(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  return JSON.stringify(v);
}
function numeric(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function columnValue(col, rec) {
  const src = rec[col.src];
  return NUMERIC.has(col.name) ? numeric(src) : scalar(src);
}
function createdAt(rec) {
  const v = rec.createdAt ?? rec.created_at ?? rec.date ?? null;
  return v === undefined ? null : scalar(v);
}
function rowsOf(records, spec) {
  const seen = new Set();
  const out = [];
  (Array.isArray(records) ? records : []).forEach((rec, i) => {
    let id = scalar(spec.id(rec));
    if (id === null || id === '') id = `row-${i}`;
    id = String(id);
    if (seen.has(id)) id = `${id}#${i}`;
    seen.add(id);
    out.push({ id, record: rec, payload: JSON.stringify(rec) });
  });
  return out;
}

// ------------------------------------------------------------------ connection
function init() {
  if (conn) return conn;
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  conn = new DatabaseSync(dbFile());
  conn.function('bt_lower', {deterministic:true}, value => String(value ?? '').toLowerCase());
  // Set the busy handler before requesting WAL: simultaneous process startup
  // may otherwise fail immediately while another connection opens the file.
  conn.exec('PRAGMA busy_timeout = 5000;');
  conn.exec('PRAGMA journal_mode = WAL;');
  conn.exec('PRAGMA synchronous = FULL;');
  conn.exec('PRAGMA foreign_keys = ON;');
  createSchema();
  return conn;
}

function createSchema() {
  const stmts = [];
  for (const spec of TABLES) {
    const cols = [
      'id TEXT PRIMARY KEY',
      'created_at TEXT',
      ...Object.keys(spec.cols).map((name) => `${name} ${NUMERIC.has(name) ? 'NUMERIC' : 'TEXT'}`),
      'payload TEXT NOT NULL',
    ];
    stmts.push(`CREATE TABLE IF NOT EXISTS ${spec.table} (${cols.join(', ')})`);
    for (const c of spec.indexes) {
      stmts.push(`CREATE INDEX IF NOT EXISTS idx_${spec.table}_${c} ON ${spec.table} (${c})`);
    }
  }
  stmts.push('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  stmts.push('CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value NUMERIC NOT NULL)');
  stmts.push('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  stmts.push('CREATE TABLE IF NOT EXISTS schema_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  conn.exec(stmts.join(';\n') + ';');
  prepare('INSERT OR REPLACE INTO schema_info (key, value) VALUES (?, ?)').run('version', String(SQL_SCHEMA_VERSION));
}

function isEmpty() {
  const row = prepare('SELECT COUNT(*) AS n FROM meta').get();
  return Number(row.n) === 0;
}

// ----------------------------------------------------------------------- load
function load() {
  const out = { meta: {}, counters: {} };
  lastVersion = dataVersion();
  state.clear();
  for (const spec of TABLES) {
    const rows = prepare(`SELECT id, payload FROM ${spec.table}`).all();
    out[spec.key] = rows.map((r) => JSON.parse(r.payload));
    state.set(spec.key, new Map(rows.map((r) => [String(r.id), r.payload])));
  }
  for (const r of prepare('SELECT key, value FROM meta').all()) {
    try { out.meta[r.key] = JSON.parse(r.value); } catch { out.meta[r.key] = r.value; }
  }
  for (const r of prepare('SELECT key, value FROM counters').all()) out.counters[r.key] = Number(r.value);
  for (const r of prepare('SELECT key, value FROM settings').all()) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return isEmpty() ? null : out;
}

// ----------------------------------------------------------------------- save
function upsertSql(spec) {
  const names = Object.keys(spec.cols);
  const all = ['id', 'created_at', ...names, 'payload'];
  const marks = all.map(() => '?').join(', ');
  const updates = all.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  return `INSERT INTO ${spec.table} (${all.join(', ')}) VALUES (${marks}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
}
function bindRow(spec, row) {
  const values = [row.id, createdAt(row.record)];
  for (const [name, src] of Object.entries(spec.cols)) values.push(columnValue({ name, src }, row.record));
  values.push(row.payload);
  return values;
}

function save(data) {
  if (!conn) init();
  // فاز ۳: مقایسهٔ ردیفبهردیف با محتوای واقعی SQL. فقط INSERT/UPDATE/DELETE لازم اجرا میشود
  // و هیچ جدولی بهصورت کامل پاک و بازنویسی نمیشود. کش state دیگر ملاک تصمیم نیست،
  // بنابراین نوشتهای مستقیم Repositoryها و تغییرات بیرونی هم درست دیده میشوند.
  conn.exec('BEGIN IMMEDIATE');
  try {
    for (const spec of TABLES) {
      const rows = rowsOf(Array.isArray(data[spec.key]) ? data[spec.key] : [], spec);
      const desired = new Map(rows.map((r) => [r.id, r]));
      const current = new Map();
      for (const r of prepare(`SELECT id, payload FROM ${spec.table}`).all()) current.set(String(r.id), r.payload);
      const del = prepare(`DELETE FROM ${spec.table} WHERE id = ?`);
      for (const id of current.keys()) {
        if (!desired.has(id)) { del.run(id); deleteCounter++; }
      }
      const up = prepare(upsertSql(spec));
      for (const [id, row] of desired) {
        if (current.get(id) !== row.payload) { up.run(...bindRow(spec, row)); writeCounter++; }
      }
      state.set(spec.key, new Map([...desired].map(([id, r]) => [id, r.payload])));
    }

    // meta / counters / settings: همان منطق افزایشی، بدون DELETE FROM کل جدول
    const diffKeyValue = (table, values, stringify) => {
      const current = new Map();
      for (const r of prepare(`SELECT key, value FROM ${table}`).all()) current.set(r.key, r.value);
      const del = prepare(`DELETE FROM ${table} WHERE key = ?`);
      for (const k of current.keys()) if (!(k in values)) { del.run(k); deleteCounter++; }
      const up = prepare(`INSERT INTO ${table} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
      for (const [k, v] of Object.entries(values)) {
        const value = stringify(v);
        if (String(current.get(k)) !== String(value)) { up.run(k, value); writeCounter++; }
      }
    };
    diffKeyValue('meta', data.meta || {}, (v) => JSON.stringify(v));
    diffKeyValue('counters', data.counters || {}, (v) => String(Number(v) || 0));
    const known = new Set([...TABLES.map((s) => s.key), 'meta', 'counters']);
    const extra = {};
    for (const [k, v] of Object.entries(data)) if (!known.has(k) && v !== undefined) extra[k] = v;
    diffKeyValue('settings', extra, (v) => JSON.stringify(v));

    conn.exec('COMMIT');
    lastVersion = dataVersion();
  } catch (e) {
    try { conn.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

// -------------------------------------------------- migration from legacy JSON
function readLegacyJson() {
  const file = legacyJsonFile();
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    throw new Error(`فایل قدیمی db.json قابل خواندن نیست (${file}): ${e.message}`);
  }
}
function archiveLegacyJson() {
  const file = legacyJsonFile();
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${file}.migrated-${stamp}`;
  fs.renameSync(file, dest);
  log.info('store', 'legacy JSON archived after SQL migration', { file: dest });
  return dest;
}

// ------------------------------------------- prepared statements (phase 2)
function all(sqlText, params = []) {
  if (!conn) init();
  return prepare(sqlText).all(...params.map(bindable));
}
function get(sqlText, params = []) {
  if (!conn) init();
  const row = prepare(sqlText).get(...params.map(bindable));
  return row === undefined ? null : row;
}
function run(sqlText, params = []) {
  if (!conn) init();
  if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sqlText)) throw new Error('run() فقط برای دستورات نوشتنی است؛ از all/get استفاده کنید.');
  return prepare(sqlText).run(...params.map(bindable));
}
function dataVersion() {
  if (!conn) init();
  return Number(prepare('PRAGMA data_version').get().data_version);
}
function queryCount() { return queryCounter; }
function setLiveHook(hook) { liveHook = hook; }
function isReady() { return conn !== null; }
function invalidate() { lastVersion = null; }
function refreshIfChanged() {
  if (!conn) init();
  const v = dataVersion();
  if (v === lastVersion) return null;
  return load();
}

// نوشت مستقیم روی SQL توسط Repositoryها — کش state و نمای زنده هماهنگ میمانند
// تا save() ردیف تازه را حذف نکند. fromLive یعنی نوشت از خود پراکسی آمده است.
function put(table, record, fromLive = false) {
  const spec = specFor(table);
  const row = rowsOf([record], spec)[0];
  prepare(upsertSql(spec)).run(...bindRow(spec, row));
  writeCounter++;
  if (!fromLive && liveHook) liveHook.put(spec.key, record);
  if (!state.has(spec.key)) state.set(spec.key, new Map());
  state.get(spec.key).set(row.id, row.payload);
  return row.id;
}
function putMeta(key, value) { prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, JSON.stringify(value)); writeCounter++; }
function delMeta(key) { prepare('DELETE FROM meta WHERE key = ?').run(key); deleteCounter++; }
function putCounter(key, value) { prepare('INSERT OR REPLACE INTO counters (key, value) VALUES (?, ?)').run(key, Number(value) || 0); writeCounter++; }
function delCounter(key) { prepare('DELETE FROM counters WHERE key = ?').run(key); deleteCounter++; }
function putSetting(key, value) { prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value)); writeCounter++; }
function delSetting(key) { prepare('DELETE FROM settings WHERE key = ?').run(key); deleteCounter++; }
function writeStats() { return { upserts: writeCounter, deletes: deleteCounter, queries: queryCounter }; }
function del(table, id, fromLive = false) {
  const spec = specFor(table);
  prepare(`DELETE FROM ${spec.table} WHERE id = ?`).run(String(id));
  deleteCounter++;
  if (!fromLive && liveHook) liveHook.remove(spec.key, String(id));
  if (state.has(spec.key)) state.get(spec.key).delete(String(id));
}

// ------------------------------------------------------------ SQL query helper
// فقط خواندنی؛ برای CLI، گزارشگیری و ابزارهای BI.
function query(sql, params = []) {
  if (!conn) init();
  const trimmed = String(sql).trim();
  if (!/^(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(trimmed) || /;/.test(trimmed.replace(/;\s*$/, ''))) {
    throw new Error('فقط پرسوجوهای خواندنی SELECT/PRAGMA/WITH/EXPLAIN مجاز هستند.');
  }
  if (!Array.isArray(params) || params.some((p) => typeof p === 'object' && p !== null && !(p instanceof Uint8Array))) {
    throw new Error('پارامترهای پرسوجو باید اسکالر باشند.');
  }
  return all(trimmed, params);
}
function tables() {
  if (!conn) init();
  return prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
}
function stats() {
  if (!conn) init();
  const out = {};
  for (const t of tables()) {
    if (t === 'schema_info') continue;
    out[t] = Number(prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
  }
  return out;
}
function vacuumInto(dest) {
  if (!conn) init();
  const safe = String(dest).replace(/'/g, "''");
  conn.exec(`VACUUM INTO '${safe}'`);
  return dest;
}
// Validate an untrusted backup read-only, without attaching its schema to the live connection.
function validateSnapshot(file) {
  if (!conn) init();
  const names = [...TABLES.map(s => s.table), 'meta', 'counters', 'settings', 'schema_info'];
  let source;
  try {
    source = new DatabaseSync(file, { readOnly: true });
    source.exec('PRAGMA trusted_schema = OFF; PRAGMA query_only = ON');
    const objects = source.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
    if (objects.some(o => o.type !== 'table' && o.type !== 'index') ||
        objects.some(o => o.type === 'table' && (!names.includes(o.name) || /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(o.sql || '')))) throw new Error('ساختار پشتیبان مجاز نیست.');
    const check = source.prepare('PRAGMA quick_check').all();
    if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') throw new Error('فایل پشتیبان سالم نیست.');
    const version = source.prepare("SELECT value FROM schema_info WHERE key = 'version'").get();
    if (!version || version.value !== String(SQL_SCHEMA_VERSION)) throw new Error('نسخهٔ پایگاه دادهٔ پشتیبان سازگار نیست.');
    const sourceTables = new Set(objects.filter(o=>o.type==='table').map(o=>o.name));
    for (const name of names) {
      if (name === 'store_branches' && !sourceTables.has(name)) continue; // pre-1.0.2 backup
      const cols = rows => rows.map(c => [c.name, c.type, c.notnull, c.pk].join(':')).join('|');
      const expected = cols(prepare(`PRAGMA main.table_info(${name})`).all());
      const actual = cols(source.prepare(`PRAGMA table_info(${name})`).all());
      if (!expected || actual !== expected) throw new Error(`ساختار پشتیبان سازگار نیست: ${name}`);
    }
    for (const spec of TABLES) {
      if (spec.table === 'store_branches' && !sourceTables.has(spec.table)) continue;
      if (source.prepare(`SELECT 1 FROM ${spec.table} WHERE NOT json_valid(payload) LIMIT 1`).get()) throw new Error(`دادهٔ پشتیبان معتبر نیست: ${spec.table}`);
      if (source.prepare(`SELECT 1 FROM ${spec.table} WHERE json_type(payload) != 'object' LIMIT 1`).get()) throw new Error(`ساختار دادهٔ پشتیبان معتبر نیست: ${spec.table}`);
    }
    if (!source.prepare('SELECT 1 FROM meta LIMIT 1').get()) throw new Error('فرادادهٔ پشتیبان خالی است.');
    const admins = source.prepare("SELECT payload FROM users WHERE role_code = 'admin' AND is_active = 1").all();
    if (!admins.some(row => { const u = JSON.parse(row.payload); return u.roleCode === 'admin' && u.isActive === true && /^scrypt\$[^$]+\$[a-f0-9]{128}$/i.test(u.passwordHash || ''); })) throw new Error('پشتیبان مدیر فعال معتبر ندارد.');
  } finally { if (source) source.close(); }
}
// Restore a validated SQLite snapshot atomically in the open database.
function restoreSnapshot(file) {
  if (!conn) init();
  validateSnapshot(file);
  const names = [...TABLES.map(s => s.table), 'meta', 'counters', 'settings', 'schema_info'];
  prepare('ATTACH DATABASE ? AS restore_source').run(file);
  let committed = false;
  try {
    const check = prepare('PRAGMA restore_source.quick_check').all();
    if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') throw new Error('فایل پشتیبان سالم نیست.');
    const version = prepare("SELECT value FROM restore_source.schema_info WHERE key = 'version'").get();
    if (!version || version.value !== String(SQL_SCHEMA_VERSION)) throw new Error('نسخهٔ پایگاه دادهٔ پشتیبان سازگار نیست.');
    const sourceTables = new Set(prepare("SELECT name FROM restore_source.sqlite_master WHERE type='table'").all().map(x=>x.name));
    for (const name of names) {
      if (name === 'store_branches' && !sourceTables.has(name)) continue;
      const columns = prepare(`PRAGMA main.table_info(${name})`).all().map(c => c.name);
      const sourceColumns = prepare(`PRAGMA restore_source.table_info(${name})`).all().map(c => c.name);
      if (!columns.length || columns.join('|') !== sourceColumns.join('|')) throw new Error(`ساختار پشتیبان سازگار نیست: ${name}`);
    }
    for (const spec of TABLES) {
      if (spec.table === 'store_branches' && !sourceTables.has(spec.table)) continue;
      if (prepare(`SELECT 1 FROM restore_source.${spec.table} WHERE NOT json_valid(payload) LIMIT 1`).get()) throw new Error(`دادهٔ پشتیبان معتبر نیست: ${spec.table}`);
      if (prepare(`SELECT 1 FROM restore_source.${spec.table} WHERE json_type(payload) != 'object' LIMIT 1`).get()) throw new Error(`ساختار دادهٔ پشتیبان معتبر نیست: ${spec.table}`);
    }
    if (!prepare('SELECT 1 FROM restore_source.meta LIMIT 1').get()) throw new Error('فرادادهٔ پشتیبان خالی است.');
    if (!prepare("SELECT 1 FROM restore_source.users WHERE role_code = 'admin' AND is_active = 1 AND json_extract(payload, '$.roleCode') = 'admin' AND json_extract(payload, '$.isActive') = 1 AND json_extract(payload, '$.passwordHash') LIKE 'scrypt$%' LIMIT 1").get()) throw new Error('پشتیبان مدیر فعال معتبر ندارد.');
    conn.exec('BEGIN IMMEDIATE');
    try {
      for (const name of names) {
        conn.exec(`DELETE FROM main.${name}`);
        if (sourceTables.has(name)) conn.exec(`INSERT INTO main.${name} SELECT * FROM restore_source.${name} ORDER BY rowid`);
      }
      conn.exec('COMMIT'); committed = true;
    } catch (e) { conn.exec('ROLLBACK'); throw e; }
  } finally {
    try { conn.exec('DETACH DATABASE restore_source'); }
    catch (e) { if (!committed) throw e; log.error('sqlite', 'backup detach failed after restore commit', { error: e.message }); }
  }
  invalidate();
}
function close() {
  if (conn) { try { conn.close(); } catch { /* ignore */ } conn = null; }
  state.clear();
  liveHook = null;
  lastVersion = null;
}

module.exports = {
  init, load, save, isEmpty, readLegacyJson, archiveLegacyJson,
  query, tables, stats, vacuumInto, validateSnapshot, restoreSnapshot, close, dbFile,
  all, get, run, put, del, putMeta, delMeta, putCounter, delCounter, putSetting, delSetting, dataVersion, refreshIfChanged, invalidate, queryCount, writeStats, setLiveHook, isReady, specFor, specForSafe,
  DB_BASENAME, SQL_SCHEMA_VERSION, TABLES,
};
