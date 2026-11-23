'use strict';
// توابع مشترک دامنه بین مسیرها
const store = require('./store');
const { storeDisplayName } = require('./store-name');

const SYSTEM_USER = { id: null, username: 'SYSTEM' };

function pad(n) { return String(n).padStart(2, '0'); }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localDayOf(value) { if (!value) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value); const d = new Date(value); return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''; }
function nowLocalMinute() { const d = new Date(); return `${today()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function publicUser(user) {
  const { passwordHash, ...rest } = user; // eslint-disable-line no-unused-vars
  return user.roleCode === 'store' ? { ...rest, storeNameRaw: rest.storeName || '', storeName: storeDisplayName(rest.storeName || rest.fullName, rest.branchNo) } : rest;
}

function getProduct(id) { return store.get().products.find((p) => p.id === id); }

// Build once per page, rather than rescanning every collection for every order.
function orderReadIndex(orders) {
  const db = store.get(), ids = new Set(orders.map(o => o.id));
  const group = rows => {
    const out = new Map();
    for (const row of rows) if (ids.has(row.orderId)) {
      if (!out.has(row.orderId)) out.set(row.orderId, []);
      out.get(row.orderId).push(row);
    }
    return out;
  };
  return { visits:new Map(db.visits.map(v=>[v.id,v])), customers:new Map(db.customers.map(c=>[c.id,c])),
    products:new Map(db.products.map(p=>[p.id,p])), items:group(db.orderItems), payments:group(db.payments), dispatchReturns:group(db.dispatchReturns || []) };
}
function enrichOrder(o, legacyReturns, index) {
  // Array.map passes its source array as the third argument, not a read index.
  if (!(index?.visits instanceof Map)) index = undefined;
  const db = store.get();
  const visit = index ? index.visits.get(o.visitId) : db.visits.find((v) => v.id === o.visitId);
  const customerId = o.customerId || visit?.customerId;
  const customer = customerId ? (index ? index.customers.get(customerId) : db.customers.find((c) => c.id === customerId)) : undefined;
  const items = (index ? index.items.get(o.id) || [] : db.orderItems.filter((i) => i.orderId === o.id)).map((i) => ({ ...i, product: index ? index.products.get(i.productId) : getProduct(i.productId) }));
  // Invoice rendering needs only amounts/statuses, not private receipt details.
  const payments = (index ? index.payments.get(o.id) || [] : db.payments.filter((p) => p.orderId === o.id)).map(p => p.debtAccount ? ({...p, debtAccount:{initial:p.debtAccount.initial,...(Object.hasOwn(p.debtAccount,'adjustment')?{adjustment:p.debtAccount.adjustment}:{}),receipts:(p.debtAccount.receipts||[]).map(r=>({amount:r.amount,status:r.status}))}}) : p);
  const payment = payments[0]; // سازگاری با مصرف‌کنندگان قدیمی
  const strip = (d) => (d ? (({ signatureData, ...rest }) => ({ ...rest, hasSignature: !!signatureData }))(d) : d);
  const dispatch = strip(o.dispatch);
  const dispatchRuns = Array.isArray(o.dispatches) ? o.dispatches.map(strip) : []; // v37.5.0 — خدمه‌برهای نهایی‌شدهٔ سرویس‌ها
  // Older returned orders stored the message in item rows and in the audit trail.
  // Item edits can replace the original text, so prefer the latest recorded return.
  let warehouseReturn = o.warehouseReturn || null;
  if (o.status === 'RETURNED_TO_SALES' && !warehouseReturn) {
    const entry = legacyReturns instanceof Map ? legacyReturns.get(o.id) : [...db.audit].reverse().find(e => e.action === 'RETURN_TO_SALES' && e.entityType === 'order' && e.entityId === o.id && e.details?.reason);
    const item = items.find(i => i.itemStatus === 'RETURNED_TO_SALES' && i.returnReason);
    if (entry) warehouseReturn = { reason: entry.details.reason, at: entry.createdAt, itemId: entry.details.itemId || null };
    else if (item) warehouseReturn = { reason: item.returnReason, at: null, itemId: item.id };
  }
  // Compatibility for existing consumers: this is order contact data, not a customer profile.
  const displayCustomer = o.orderType === 'STORE' && Object.hasOwn(o, 'customerName')
    ? (o.customerName || o.customerPhone ? {name:o.customerName || '', phone:o.customerPhone || ''} : null) : customer;
  const enriched = { ...o, warehouseReturn, visit, customer:displayCustomer, items, payment, payments, dispatch, dispatchRuns };
  if (o.orderType === 'STORE') {
    const returnTickets = index ? (index.dispatchReturns?.get(o.id) || []) : (db.dispatchReturns || []).filter(r => r.orderId === o.id);
    enriched.hasReturnedGoods = returnTickets.some(r => Number(r.kg) > 0);
    enriched.storeName = storeDisplayName(o.storeName, o.branchNo);
    enriched.storeRun = require('./store-runs').buildStoreRunView(o, items); // v37.4.0
  }
  return enriched;
}

function createNotification(targetRole, type, entityType, entityId, message, recipient = {}) {
  const db = store.get();
  // Optional account/driver scoping is required for private store and driver events.
  db.notifications.unshift({ id: store.uid(), targetRole, type, entityType, entityId, message, isRead: false, createdAt: store.nowIso(), ...recipient });
}

// سفارش‌های آینده (غیرحضوری/فروشگاه) وقتی به زمان برسند وارد صف انبار می‌شوند
function notifyStore(order, type, message, run = null) {
  if (order?.orderType === 'STORE' && order.storeId)
    createNotification('store', type, 'order', order.id, message, { targetUserId: order.storeId, ...(run == null ? {} : {run}) });
}
function notifyDriver(order, type, message, run = null) {
  if (order?.dispatch?.driverId)
    createNotification('driver', type, 'order', order.id, message, { targetDriverId: order.dispatch.driverId, ...(run == null ? {} : {run}) });
}

function notifyTransportReady(order) {
  if(order?.transportWorkflow === 1 && order.deliveryMode === 'DELIVERY')
    createNotification('dispatch','TRANSPORT_ORDER_READY','order',order.id,`سفارش ${order.orderNo || '—'} به ترابری و انبار ارسال شد.`);
}

function activateDueRemoteOrders() {
  // The timer and HTTP requests can race with cancellation in another process.
  // Only lock when there is a candidate; re-check all state under the lock.
  const now = nowLocalMinute();
  const due = o => (o.orderType === 'REMOTE' || o.orderType === 'STORE') && o.status === 'SCHEDULED_REMOTE'
    && String(o.scheduledAt || `${o.scheduledDate || ''}T23:59`) <= now;
  if (!store.get().orders.some(due)) return false;
  return require('./transport-transaction')(() => {
  const db = store.get();
  let changed = false;
  for (const order of db.orders) {
    if (due(order) && order.pickupCancellation?.status !== 'PENDING_SALES') {
      order.status = 'WAREHOUSE_PENDING';
      order.activatedAt = store.nowIso();
      order.updatedAt = store.nowIso();
      createNotification('warehouse', order.orderType === 'STORE' ? 'STORE_ORDER_DUE' : 'REMOTE_ORDER_DUE', 'order', order.id,
        `سفارش ${order.orderType === 'STORE' ? 'فروشگاه' : 'غیرحضوری'} ${order.orderNo || order.id.slice(0, 8)} برای زمان مقرر آماده تحویل انبار شد.`);
      notifyTransportReady(order);
      store.audit(SYSTEM_USER, 'ACTIVATE_REMOTE_ORDER', 'order', order.id, { scheduledDate: order.scheduledDate });
      changed = true;
    }
  }
  if (changed) store.save();
  return changed;
  });
}

function normalizePlate(value = '') {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, '').replace(/[—–]/g, '-').toLowerCase();
}

module.exports = { SYSTEM_USER, today, localDayOf, nowLocalMinute, publicUser, getProduct, enrichOrder, orderReadIndex, createNotification, notifyStore, notifyDriver, notifyTransportReady, activateDueRemoteOrders, normalizePlate };
