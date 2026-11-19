'use strict';
// سرویس مشتریان: پیدا کردن یا ساختن پرونده‌ی مشتری برای هر ورودی (نگهبانی، فروشگاه، سفارش غیرحضوری).
const store = require('./store');
const core = require('./customer-core');
const { fail } = require('./http');

// ورودی‌ها: customerId / customerCode (وقتی مشتری از فهرست انتخاب شده) یا شماره تماس و پلاک.
// اگر پرونده پیدا شود، فقط فیلدهای ارسال‌شده به‌روز می‌شود؛ در غیر این صورت پرونده‌ی جدید با کد جدید ساخته می‌شود.
function upsertCustomer(db, input) {
  const { customerId, customerCode, name, phone, plate = '', vehicleType, carType, district } = input;
  // نام هم به جستجو داده می‌شود تا شماره/پلاک مشترک، پروندهٔ یک شخص دیگر را
  // به نام این شخص بازنویسی نکند (باگ ثبت تحویل‌گیرنده به‌عنوان مشتری).
  const found = core.findExisting(db, { customerId, code: customerCode, phone, plate, name });
  if ((customerId || customerCode) && !found) fail(400, 'مشتری با این کد پیدا نشد. کد را بررسی کنید یا مشتری جدید ثبت کنید.');

  const now = store.nowIso();
  if (found) {
    Object.assign(found, {
      name,
      phone: phone || found.phone,
      plate: plate || found.plate || '',
      vehicleType: vehicleType || found.vehicleType || 'بدون وسیله',
      ...(carType !== undefined ? { carType } : {}),
      district: district !== undefined && district !== '' ? district : (found.district || ''),
      lastVisitAt: now,
    });
    return found;
  }
  const customer = {
    id: store.uid(), code: core.nextCode(db), name, phone,
    phone2: '', nationalId: '', company: '', district: district || '', address: '',
    plate, vehicleType: vehicleType || 'بدون وسیله', ...(carType !== undefined ? { carType } : {}), notes: '',
    createdAt: now, lastVisitAt: null,
  };
  db.customers.push(customer);
  return customer;
}

// Store orders remain linked for their own workflow, but never form part of
// the customer-sales history or its statistics.
function customerOrders(db, id) { return db.orders.filter(o => o.customerId === id && o.orderType !== 'STORE'); }

// خلاصه‌ی یک مشتری برای فهرست و جستجو.
function summarize(db, c) {
  const visits = db.visits.filter((v) => v.customerId === c.id);
  const orders = customerOrders(db, c.id);
  // lastVisitAt could have been updated by a store upsert; it is not a
  // reliable fallback for profiles with store orders and no sales activity.
  const hasStoreOrders = db.orders.some(o => o.customerId === c.id && o.orderType === 'STORE');
  const last = [...visits.map((v) => v.createdAt), ...orders.map((o) => o.createdAt)].filter(Boolean).sort().pop() || (!hasStoreOrders ? c.lastVisitAt : null) || null;
  return { ...c, visitCount: visits.length, orderCount: orders.length, lastActivityAt: last };
}

module.exports = { upsertCustomer, summarize, customerOrders };
