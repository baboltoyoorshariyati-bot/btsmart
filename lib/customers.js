'use strict';
// سرویس مشتریان: پیدا کردن یا ساختن پرونده‌ی مشتری برای هر ورودی (نگهبانی، فروشگاه، سفارش غیرحضوری).
const store = require('./store');
const core = require('./customer-core');
const { fail } = require('./http');

// هویت فقط با شمارهٔ تماس تعیین می‌شود؛ شناسه و کد انتخابی باید با آن مطابقت داشته باشند.
// ورود یا سفارش نام و شمارهٔ پرونده را بازنویسی نمی‌کند؛ اصلاح از مسیر ویرایش پرونده انجام می‌شود.
function upsertCustomer(db, input) {
  const { customerId, customerCode, name, phone, plate = '', vehicleType, carType, district } = input;
  const byId = customerId ? db.customers.find(c => c.id === customerId) : null;
  const byCode = customerCode ? db.customers.find(c => core.normalizeCode(c.code) === core.normalizeCode(customerCode)) : null;
  if ((customerId && !byId) || (customerCode && !byCode)) fail(400, 'مشتری با این کد پیدا نشد. کد را بررسی کنید یا مشتری جدید ثبت کنید.');
  if (byId && byCode && byId.id !== byCode.id) fail(409, 'شناسه و کد مشتری با هم مطابقت ندارند.');
  const owners = core.phoneOwners(db, phone);
  if (owners.length > 1) fail(409, 'این شماره در چند پرونده ثبت شده است؛ ابتدا پرونده‌های تکراری بررسی شوند.', 'DUPLICATE_PHONE');
  const selected = byId || byCode;
  if (selected && (!owners.length || owners[0].id !== selected.id)) fail(409, 'شماره تماس با پروندهٔ انتخاب‌شده مطابقت ندارد؛ ابتدا پرونده را بررسی کنید.', 'DUPLICATE_PHONE');
  const found = selected || owners[0];
  if (found && name && !core.namesCompatible(name, found.name))
    fail(409, `این شماره برای «${found.name}» با کد ${found.code} ثبت شده است؛ نام و پرونده را بررسی کنید.`, 'DUPLICATE_PHONE');

  const now = store.nowIso();
  if (found) {
    Object.assign(found, {
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
