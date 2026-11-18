'use strict';
// گزارش‌های هر واحد: تعیین مجوز و محدوده روی سرور، نه در مرورگر.
const reports = require('./reports');
const ALLOWED = Object.freeze({
  gate: ['visits', 'deliveries'],
  sales: ['orders', 'orderItems', 'payments', 'deliveries'],
  warehouse: ['orders', 'orderItems', 'visits'],
  dispatch: ['deliveries', 'drivers'],
  store: ['orders', 'orderItems', 'payments', 'deliveries'],
  driver: ['deliveries'],
});
function authorize(user, unit) {
  if (!Object.hasOwn(ALLOWED, unit)) throw Object.assign(new Error('واحد گزارش معتبر نیست.'), { status: 400 });
  if (user.roleCode !== 'admin' && user.roleCode !== unit) throw Object.assign(new Error('دسترسی به گزارش این واحد مجاز نیست.'), { status: 403 });
}
function scoped(db, user, unit) {
  if (user.roleCode === 'admin' || !['store', 'driver'].includes(unit)) return db;
  const orders = (db.orders || []).filter(o => unit === 'store'
    ? o.orderType === 'STORE' && o.storeId === user.id
    : !!user.driverId && [o.dispatch, ...(Array.isArray(o.dispatches) ? o.dispatches : [])].some(d => d && d.driverId === user.driverId));
  const ids = new Set(orders.map(o => o.id));
  return { ...db, orders, orderItems: (db.orderItems || []).filter(i => ids.has(i.orderId)),
    payments: (db.payments || []).filter(p => ids.has(p.orderId)), reportDriverId: unit === 'driver' ? user.driverId : null };
}
function describe(user, unit) {
  authorize(user, unit);
  return reports.describe().filter(s => ALLOWED[unit].includes(s.key));
}
function query(db, user, unit, q, options) {
  authorize(user, unit);
  if (!ALLOWED[unit].includes(q.source)) throw Object.assign(new Error('منبع گزارش برای این واحد مجاز نیست.'), { status: 403 });
  return reports.query(scoped(db, user, unit), q, options);
}
module.exports = { ALLOWED, describe, query };
