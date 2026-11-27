'use strict';
// لایهٔ دادهها: SQLite (منبع اصلی) + مهاجرت + شمارندهها + Audit با زنجیرهٔ Hash
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const log = require('./logger');
const security = require('./security');
const sql = require('./sqlite-store');
const repos = require('./sql-repos');
const live = require('./live-collections');

const SCHEMA_VERSION = 2;
// منبع اصلی دادهها اکنون SQLite است (lib/sqlite-store.js)؛ db.json فقط به‌عنوان منبع مهاجرت خوانده میشود.
const LOCK_FILE = () => path.join(config.DATA_DIR, '.lock');

const ROLES = [
  { code: 'admin', title: 'مدیر سیستم' },
  { code: 'gate', title: 'نگهبانی' },
  { code: 'sales', title: 'فروش' },
  { code: 'warehouse', title: 'انبار' },
  { code: 'store', title: 'فروشگاه' },
  { code: 'dispatch', title: 'واحد پخش' },
  { code: 'driver', title: 'راننده' },
];

let db = null;

function uid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }
function pad(n) { return String(n).padStart(2, '0'); }
function localDateKey(d = new Date()) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }

// ---------- قفل یک‌نمونه‌ای ----------
function acquireLock() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const f = LOCK_FILE();
  if (fs.existsSync(f)) {
    const pid = Number(fs.readFileSync(f, 'utf8'));
    let alive = false;
    try { if (pid) { process.kill(pid, 0); alive = true; } } catch { alive = false; }
    if (alive && pid !== process.pid) throw new Error(`یک نمونه دیگر از سامانه با PID ${pid} در حال اجراست.`);
  }
  fs.writeFileSync(f, String(process.pid));
  const release = () => { try { if (fs.readFileSync(f, 'utf8') === String(process.pid)) fs.unlinkSync(f); } catch { /* ignore */ } };
  process.once('exit', release);
  return release;
}

// ---------- ذخیرهٔ تراکنشی در SQLite (تنها منبع اصلی دادهها) ----------
// فاز ۳: save() دیگر کل دیتابیس را بازنویسی نمیکند؛ فقط ردیفهای تغییرکرده را
// با SQL مقایسه و همگام میکند (بیشتر اوقات نوشت جدیدی لازم نیست چون همان لحظه انجام شده).
function save() {
  const cutoff = Date.now() - config.IDEMPOTENCY_TTL_MS;
  db.idempotency = (db.idempotency || []).filter((x) => Date.parse(x.createdAt) >= cutoff);
  // Inside a locked transaction the live collections already write through.
  // Starting sql.save() here would open a nested transaction.
  if (!require('./transport-transaction').isActive()) sql.save(db);
  repos.clearCache();
}

// ---------- Seed ----------
function makeSeedDb(adminPassword) {
  return {
    meta: { app: 'baboltoyoor Smart System', version: '37.4.0', schemaVersion: SCHEMA_VERSION, createdAt: nowIso(), productCatalogVersion: '', auditSeq: 0, lastAuditHash: 'GENESIS' },
    roles: ROLES,
    users: [{ id: 'u1', username: 'admin', fullName: 'مدیر سیستم', position: 'مدیر سیستم', passwordHash: security.hashPassword(adminPassword), roleCode: 'admin', isActive: true, mustChangePassword: true, createdAt: nowIso() }],
    customers: [], drivers: [], dispatchReturns: [], paymentDevices: [], storeBranches: [], storeTransfers: [], visits: [], orders: [], orderItems: [], payments: [], notifications: [], audit: [], vehicles: [], weighTrips: [],
    products: [], priceList: [], idempotency: [], counters: {},
  };
}

// Transient binding: numbers are read from the same SQLite connection rather
// than persisted as a setting in the live data object.
function bindWarehouseNumbers(data) {
  return require('./warehouse-document-numbers').bindStockDocumentNumbers(data,()=>sql.stockDocumentNumbers());
}

// ---------- مهاجرت ----------
function migrate(data) {
  bindWarehouseNumbers(data);
  const from = Number(data.meta?.schemaVersion || 1);
  data.meta ||= {};
  data.meta.version='37.6.0';
  data.roles = ROLES;
  for (const k of ['storeTransfers', 'notifications', 'audit', 'payments', 'orders', 'orderItems', 'visits', 'customers', 'drivers', 'dispatchReturns', 'paymentDevices', 'products', 'priceList', 'users', 'idempotency', 'vehicles', 'weighTrips']) data[k] ||= [];
  data.counters ||= {};
  require('./store-transfer-numbers').ensureTransferNumbers(data);
  require('./order-numbers').ensureOrderNumbers(data);
  require('./invoice-numbers').ensureInvoiceNumbers(data);
  // کد مشتری برای پرونده‌های قدیمی (بدون کد) — idempotent
  require('./customer-core').ensureCodes(data);
  data.meta.auditSeq ||= 0;
  data.meta.lastAuditHash ||= 'GENESIS';

  if (from < SCHEMA_VERSION) {
    for (const o of data.orders) {
      if (o.orderType === undefined) o.orderType = 'ONSITE';
      if (o.customerId === undefined) { const v = data.visits.find((x) => x.id === o.visitId); if (v) o.customerId = v.customerId; }
      o.scheduledDate ??= null;
      o.scheduledAt ??= o.scheduledDate ? `${o.scheduledDate}T23:59` : null;
      o.dispatchPlace ??= '';
      if (o.approvalStatus === undefined && o.orderType === 'STORE') o.approvalStatus = 'APPROVED';
      o.source ??= o.orderType === 'REMOTE' ? 'SALES_REMOTE' : 'SALES_COUNTER';
      o.notes ??= '';
    }
    for (const u of data.users) {
      if (u.position === undefined) u.position = 'کاربر سامانه';
      u.mustChangePassword ??= false;
      // نصب‌های قدیمی با رمز پیش‌فرض باید در اولین ورود رمز را تغییر دهند
      if (u.username === 'admin' && security.verifyPassword('Admin@12345', u.passwordHash)) u.mustChangePassword = true;
    }
    for (const it of data.orderItems) it.description ??= '';
    // Restore legacy invoice counters; order labels use the global six-digit counter.
    for (const p of data.payments) {
      const m = String(p.invoiceNumber || '').match(/^BT-(\d{8})-(\d+)$/);
      if (m) data.counters[`invoice:${m[1]}`] = Math.max(data.counters[`invoice:${m[1]}`] || 0, Number(m[2]));
    }
    // وضعیت Visit باید با وضعیت سفارش خروج‌شده هم‌گام باشد
    for (const o of data.orders) if (o.status === 'EXITED') { const v = data.visits.find((x) => x.id === o.visitId); if (v) v.status = 'EXITED'; }
    data.meta.schemaVersion = SCHEMA_VERSION;
  }
  require('./warehouse-document-numbers').ensureWarehouseDocumentNumbers(data);
  if (from < SCHEMA_VERSION) log.info('store', 'migration applied', { from, to: SCHEMA_VERSION });
  return data;
}

// ---------- بارگذاری ----------
function init() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  sql.init();
  const existing = sql.load();
  if (!existing) {
    const legacy = sql.readLegacyJson();
    if (legacy) {
      // انتقال خودکار اطلاعات نسخه‌های قبل (data/db.json) به جداول SQL
      db = migrate(legacy);
      save();
      sql.archiveLegacyJson();
      log.info('store', 'JSON database migrated to SQLite', { file: sql.dbFile(), tables: sql.TABLES.length });
    } else {
      const generated = !config.ADMIN_INITIAL_PASSWORD;
      const pass = config.ADMIN_INITIAL_PASSWORD || security.randomPassword();
      db = makeSeedDb(pass);
      save();
      log.info('store', 'database initialized', { file: sql.dbFile(), engine: 'sqlite' });
      if (generated) {
        // رمز تصادفی فقط یک‌بار در کنسول نمایش داده می‌شود
        process.stdout.write(`\n==== رمز اولیه مدیر (username: admin) ====\n${pass}\nاین رمز فقط یک‌بار نمایش داده می‌شود؛ در اولین ورود باید تغییر کند.\n==========================================\n\n`);
      }
    }
  } else {
    db = migrate(existing);
    save();
  }
  // بازگرداندن محدود سفارش‌های بازِ آسیب‌دیده، با ثبت کامل در زنجیرهٔ حسابرسی.
  const recovered = require('./store-run-recovery').recoverUnsentStoreRuns(db, (order, details) => audit(null, 'STORE_RUN_UNSENT_RECOVERED', 'order', order.id, details));
  if (recovered) { save(); log.info('store', 'unsent store runs recovered', { count: recovered }); }
  // فاز ۳: از این لحظه هر تغییر روی حافظه، همان ردیف را در SQL مینویسد.
  db = bindWarehouseNumbers(live.attach(db));
  return db;
}

function get() {
  if (!db) throw new Error('store is not initialized');
  return db;
}

// فاز ۲: ابتدای هر درخواست، اگر اتصال دیگری (ابزار SQL، CLI، BI) دادهها را
// تغییر داده باشد، نمای درون حافظه از روی SQL بارگذاری مجدد میشود.
// PRAGMA data_version فقط با commit اتصالهای دیگر تغییر میکند؛ بنابراین
// نوشتههای خودمان نیازی به خواندن مجدد ندارند و هزینهای اضافه نمیشود.
function refresh() {
  if (!db) return init();
  repos.clearCache();
  const fresh = sql.refreshIfChanged();
  if (fresh) {
    bindWarehouseNumbers(fresh);
    const whRepaired = require('./warehouse-document-numbers').ensureWarehouseDocumentNumbers(fresh);
    const transfersRepaired = require('./store-transfer-numbers').ensureTransferNumbers(fresh);
    if (whRepaired || transfersRepaired) sql.save(fresh);
    db = bindWarehouseNumbers(live.attach(fresh));
  }
  return db;
}

// فاز ۲: وجود/فعالبودن کاربر با prepared statement از SQL تأیید میشود،
// ولی مرجع زندۀ درون حافظه برگردانده میشود تا مسیرهایی که ctx.user را
// تغییر میدهند (مثلاً تعویض رمز) همان شیئی را عوض کنند که save() مینویسد.
function reloadFromSql({skipRepair = false} = {}) {
  const fresh = sql.load();
  if (!fresh) throw new Error('پایگاه داده پس از بازیابی خالی است.');
  bindWarehouseNumbers(fresh);
  if (!skipRepair) {
    const whRepaired = require('./warehouse-document-numbers').ensureWarehouseDocumentNumbers(fresh);
    const transfersRepaired = require('./store-transfer-numbers').ensureTransferNumbers(fresh);
    if (whRepaired || transfersRepaired) sql.save(fresh);
  }
  db = bindWarehouseNumbers(live.attach(fresh));
  repos.clearCache();
  return db;
}

function activeUserById(id) {
  const row = sql.get('SELECT id FROM users WHERE id = ?', [String(id)]);
  if (!row || !db) return null;
  const u = db.users.find((x) => x.id === row.id);
  return u && u.isActive ? u : null;
}

// ---------- شمارنده‌های یکتا (تولید فقط در Backend) ----------
function nextNumber(key) {
  db.counters[key] = (db.counters[key] || 0) + 1;
  return db.counters[key];
}
function nextInvoiceNumber() {
  return require('./invoice-numbers').nextInvoiceNumber(db);
}
function nextOrderNumber() {
  return require('./order-numbers').nextOrderNumber(db);
}
function nextStoreOrderNumber(branchNo) { // v37.6.0 — سری مجزای شعبه‌محور فروشگاه
  return require('./order-numbers').nextStoreOrderNumber(db, branchNo);
}

// ---------- Audit با زنجیره Hash (Append-only) ----------
function auditHash(prev, entry) {
  const { hash, ...rest } = entry; // eslint-disable-line no-unused-vars
  return crypto.createHash('sha256').update(prev + JSON.stringify(rest)).digest('hex');
}
function audit(user, action, entityType, entityId, details = {}, ctx = {}) {
  const prevHash = db.meta.lastAuditHash || 'GENESIS';
  const entry = {
    id: uid(),
    seq: (db.meta.auditSeq = (db.meta.auditSeq || 0) + 1),
    userId: user?.id || null,
    username: user?.username || null,
    action, entityType, entityId: entityId ?? null,
    details,
    ip: ctx.ip || '',
    userAgent: String(ctx.userAgent || ctx.ua || '').slice(0, 160),
    createdAt: nowIso(),
    prevHash,
  };
  entry.hash = auditHash(prevHash, entry);
  db.meta.lastAuditHash = entry.hash;
  db.audit.push(entry);
  return entry;
}
function verifyAuditChain() {
  let prev = 'GENESIS';
  let checked = 0;
  for (const e of db.audit) {
    if (!e.hash) continue; // رکوردهای قدیمی قبل از زنجیره
    if (e.prevHash !== prev || auditHash(prev, e) !== e.hash) return { ok: false, brokenAt: e.seq ?? e.id, checked };
    prev = e.hash; checked++;
  }
  return { ok: prev === db.meta.lastAuditHash, checked, lastHash: prev };
}

module.exports = { init, get, save, refresh, reloadFromSql, activeUserById, acquireLock, uid, nowIso, localDateKey, nextInvoiceNumber, nextOrderNumber, nextStoreOrderNumber, audit, verifyAuditChain, ROLES, SCHEMA_VERSION, dbFile: sql.dbFile, sql };
