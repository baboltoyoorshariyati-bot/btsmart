'use strict';
// فاز ۲ — لایهٔ دسترسی به داده با prepared statements واقعی.
// مسیرهای API بهجای پیمایش آرایههای درون حافظه، از این Repositoryها پرسوجو میکنند.
// پارامترها همیشه بایند میشوند؛ نام ستونها قبل از قرار گرفتن در SQL اعتبارسنجی میشوند.
const sql = require('./sqlite-store');

const SAFE_COL = /^[a-z][a-z0-9_]*$/;
function col(name) {
  if (!SAFE_COL.test(String(name))) throw new Error(`نام ستون نامعتبر: ${name}`);
  return String(name);
}
function parseRow(row) { return row && row.payload !== undefined ? JSON.parse(row.payload) : null; }
function parseRows(rows) { return rows.map(parseRow).filter((x) => x !== null); }

// کش کوتاهعمر داخل یک درخواست؛ store.refresh() آن را پاک میکند.
const cache = new Map();
function clearCache() { cache.clear(); }
function cached(key, loader) {
  if (cache.has(key)) return cache.get(key);
  const value = loader();
  cache.set(key, value);
  return value;
}

function makeRepo(table) {
  return {
    table,
    all({ orderBy, limit } = {}) {
      let text = `SELECT payload FROM ${table}`;
      if (orderBy) text += ` ORDER BY ${col(orderBy)}`;
      if (limit) text += ` LIMIT ${Number(limit) || 0}`;
      return parseRows(sql.all(text));
    },
    find(id) {
      if (id === undefined || id === null) return null;
      return cached(`${table}:id:${id}`, () => parseRow(sql.get(`SELECT payload FROM ${table} WHERE id = ?`, [String(id)])));
    },
    findBy(name, value) {
      return parseRow(sql.get(`SELECT payload FROM ${table} WHERE ${col(name)} = ? ORDER BY rowid LIMIT 1`, [value]));
    },
    where(name, value, { limit } = {}) {
      let text = `SELECT payload FROM ${table} WHERE ${col(name)} = ?`;
      if (limit) text += ` LIMIT ${Number(limit) || 0}`;
      return parseRows(sql.all(text, [value]));
    },
    // fragment فقط باید رشتهای ثابت از کد باشد، نه ورودی کاربر.
    select(fragment, params = [], { limit } = {}) {
      let text = `SELECT payload FROM ${table} WHERE ${fragment}`;
      if (limit) text += ` LIMIT ${Number(limit) || 0}`;
      return parseRows(sql.all(text, params));
    },
    count(fragment = '1 = 1', params = []) {
      const row = sql.get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${fragment}`, params);
      return row ? Number(row.n) : 0;
    },
    insert(record) { sql.put(table, record); clearCache(); return record; },
    replace(record) { sql.put(table, record); clearCache(); return record; },
    remove(id) { sql.del(table, id); clearCache(); },
  };
}

const repos = {
  roles: makeRepo('roles'),
  users: makeRepo('users'),
  customers: makeRepo('customers'),
  drivers: makeRepo('drivers'),
  dispatchReturns: makeRepo('dispatch_returns'),
  paymentDevices: makeRepo('payment_devices'),
  visits: makeRepo('visits'),
  orders: makeRepo('orders'),
  orderItems: makeRepo('order_items'),
  payments: makeRepo('payments'),
  notifications: makeRepo('notifications'),
  products: makeRepo('products'),
  priceList: makeRepo('price_list'),
  vehicles: makeRepo('vehicles'),
  weighTrips: makeRepo('weigh_trips'),
  audit: makeRepo('audit'),
  idempotency: makeRepo('idempotency'),
};

// ------------------------------------------------ پرسوجوهای مورداستفادهٔ مسیرها
// کاربرِ نشست — مستقیماً از جدول users (نه پیمایش آرایه).
function activeUserById(id) {
  const u = repos.users.find(id);
  return u && u.isActive ? u : null;
}

// joinهای موتور گزارشها — هرکدام یک prepared statement است.
const lookups = {
  customerOf: (id) => id ? (repos.customers.find(id) || {}) : {},
  productOf: (id) => id ? (repos.products.find(id) || {}) : {},
  orderOf: (id) => id ? (repos.orders.find(id) || {}) : {},
  paymentOf: (orderId) => orderId ? (repos.payments.findBy('order_id', orderId) || {}) : {},
  visitCount: (cid) => cid ? cached(`count:visits:${cid}`, () => repos.visits.count('customer_id = ?', [cid])) : 0,
  orderCount: (cid) => cid ? cached(`count:orders:${cid}`, () => repos.orders.count('customer_id = ?', [cid])) : 0,
};

// شمارندههای داشبورد مدیریت — یک پرسوجوی تجمیعی SQL بهجای هفت پیمایش آرایه.
const DASHBOARD_SQL = `SELECT
  (SELECT COUNT(*) FROM visits WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?)) AS visitsToday,
  (SELECT COUNT(*) FROM visits WHERE status = 'WAITING_SALES') AS waitingSales,
  (SELECT COUNT(*) FROM orders WHERE status NOT IN ('SETTLED','EXITED','CANCELLED')) AS activeOrders,
  (SELECT COUNT(*) FROM orders WHERE status IN ('WAREHOUSE_PENDING','WAREHOUSE_PREPARING')) AS pendingWarehouse,
  (SELECT COUNT(*) FROM orders WHERE status = 'SETTLEMENT_PENDING'
      AND (json_type(payload, '$.dispatch') IS NULL OR json_type(payload, '$.dispatch') = 'null')) AS pendingSettlement,
  (SELECT COUNT(*) FROM orders WHERE status = 'SETTLED'
      AND (json_type(payload, '$.dispatch') IS NULL OR json_type(payload, '$.dispatch') = 'null')) AS readyExit,
  (SELECT COUNT(*) FROM orders WHERE order_type = 'REMOTE' AND status = 'SCHEDULED_REMOTE') AS remoteScheduled`;
function dashboardCounts(today) {
  const [year, month, day] = today.split('-').map(Number);
  const start = new Date(year, month - 1, day).toISOString();
  const end = new Date(year, month - 1, day + 1).toISOString();
  const row = sql.get(DASHBOARD_SQL, [start, end]);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = Number(v) || 0;
  return out;
}

// جستجوی سریع مشتری/محصول — استفادهشده توسط endpointهای جستجو.
function searchCustomers(term, limit = 20) {
  return parseRows(sql.all(
    `SELECT payload FROM customers WHERE name LIKE ? OR phone LIKE ? OR code LIKE ? ORDER BY name LIMIT ?`,
    [`%${term}%`, `%${term}%`, `%${term}%`, Number(limit) || 20]));
}
function searchProducts(term, limit = 20) {
  return parseRows(sql.all(
    `SELECT payload FROM products WHERE name LIKE ? OR quick_code LIKE ? ORDER BY name LIMIT ?`,
    [`%${term}%`, `%${term}%`, Number(limit) || 20]));
}

function localDateBoundary(value, nextDay = false) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw Object.assign(new Error('تاریخ فیلتر معتبر نیست.'), { status: 400 });
  const [year, month, day] = m.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    throw Object.assign(new Error('تاریخ فیلتر معتبر نیست.'), { status: 400 });
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

// پرسوجوی پویای Audit — WHERE و LIMIT همگی با پارامتر بایندشده ساخته میشوند.
function auditQuery({ action, entityId, username, entityType, from, to, limit }) {
  const where = [], params = [];
  const add = (clause, value) => { if (value) { where.push(clause); params.push(value); } };
  add('action = ?', action);
  add('entity_id = ?', entityId);
  add('username = ?', username);
  add('entity_type = ?', entityType);
  add('julianday(created_at) >= julianday(?)', localDateBoundary(from));
  add('julianday(created_at) < julianday(?)', localDateBoundary(to, true));
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(sql.get(`SELECT COUNT(*) AS n FROM audit ${clause}`, params).n);
  const audit = parseRows(sql.all(
    `SELECT payload FROM audit ${clause} ORDER BY seq DESC, rowid DESC LIMIT ?`,
    [...params, Number(limit) || 300]));
  return { audit, total };
}

module.exports = {
  repos, clearCache, isReady: () => sql.isReady(), activeUserById, lookups, dashboardCounts,
  searchCustomers, searchProducts, auditQuery, col,
};
