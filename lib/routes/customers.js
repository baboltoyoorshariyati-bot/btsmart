'use strict';
// پرونده‌ی مشتریان: فهرست، جستجو، جزئیات با سوابق، ثبت و ویرایش.
const { atomicRoute: route, fail, normalizeRole } = require('../http');
const store = require('../store');
const core = require('../customer-core');
const { summarize, customerOrders } = require('../customers');
const { normalizePlate } = require('../domain');

const ROLES = ['admin', 'gate', 'sales'];
const roleOf = (u) => normalizeRole(u.roleCode);

const matchesQuery = (c, qRaw) => {
  const q = String(qRaw || '').trim().slice(0, 80);
  if (!q) return true;
  const plateQ = normalizePlate(q);
  const codeQ = core.normalizeCode(q);
  return String(c.name || '').includes(q)
    || String(c.phone || '').includes(q)
    || String(c.phone2 || '').includes(q)
    || String(c.nationalId || '').includes(q)
    || String(c.company || '').includes(q)
    || (plateQ && normalizePlate(c.plate || '').includes(plateQ))
    || (codeQ && String(c.code || '').toUpperCase().includes(codeQ));
};

route('GET', '/api/customers', { roles: ROLES }, (ctx) => {
  const db = store.get();
  const q = ctx.query.get('q') || '';
  const limit = Math.min(Number(ctx.query.get('limit')) || 200, 500);
  const rows = db.customers.filter((c) => matchesQuery(c, q))
    .map((c) => summarize(db, c))
    .sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')))
    .slice(0, limit);
  if (['admin','sales'].includes(roleOf(ctx.user))) {
    const debt=require('../customer-debts'), totals=new Map();
    const storeOrders=new Set(db.orders.filter(o=>o.orderType==='STORE').map(o=>o.id));
    for(const p of db.payments){if(p.debtAccount&&!storeOrders.has(p.orderId)){const id=p.debtAccount.customerId;totals.set(id,(totals.get(id)||0)+debt.amounts(p.debtAccount).balance);}}
    for (const c of rows) c.debtBalance=totals.get(c.id)||0;
  }
  return { status: 200, body: { customers: rows, total: db.customers.length } };
});

route('GET', '/api/customers/:id', { roles: ROLES }, (ctx) => {
  const db = store.get();
  const c = db.customers.find((x) => x.id === ctx.params.id);
  if (!c) fail(404, 'مشتری پیدا نشد.');
  const visits = db.visits.filter((v) => v.customerId === c.id).slice().reverse().slice(0, 30)
    .map((v) => ({ id: v.id, status: v.status, district: v.district || '', purpose: v.purpose || '', createdAt: v.createdAt }));
  const orders = customerOrders(db, c.id).slice().reverse().slice(0, 30)
    .map((o) => ({ id: o.id, orderNo: o.orderNo, orderType: o.orderType, status: o.status, createdAt: o.createdAt }));
  return { status: 200, body: { customer: summarize(db, c), visits, orders } };
});

function assertPhoneFree(db, phone, selfId) {
  const other = db.customers.find((x) => x.id !== selfId && String(x.phone || '') === phone);
  if (other) fail(409, `این شماره قبلاً برای مشتری ${other.code} (${other.name}) ثبت شده است.`, 'DUPLICATE_PHONE');
}

route('POST', '/api/customers', { roles: ROLES, idempotent: true }, (ctx) => {
  const db = store.get();
  const data = core.cleanProfile(ctx.body || {});
  if (!data.phone) fail(400, 'شماره تماس الزامی است.');
  assertPhoneFree(db, data.phone, null);
  const customer = {
    id: store.uid(), code: core.nextCode(db), phone2: '', nationalId: '', company: '', district: '', address: '',
    plate: '', vehicleType: 'بدون وسیله', notes: '', createdAt: store.nowIso(), lastVisitAt: null, ...data,
  };
  db.customers.push(customer);
  store.audit(ctx.user, 'CREATE_CUSTOMER', 'customer', customer.id, { code: customer.code, name: customer.name }, ctx);
  store.save();
  return { status: 201, body: { customer: summarize(db, customer) } };
});

route('PUT', '/api/customers/:id', { roles: ROLES }, (ctx) => {
  const db = store.get();
  const c = db.customers.find((x) => x.id === ctx.params.id);
  if (!c) fail(404, 'مشتری پیدا نشد.');
  const data = core.cleanProfile(ctx.body || {}, { partial: true });
  if (data.phone !== undefined) {
    if (!data.phone) fail(400, 'شماره تماس الزامی است.');
    assertPhoneFree(db, data.phone, c.id);
  }
  const before = { name: c.name, phone: c.phone, plate: c.plate };
  Object.assign(c, data);
  store.audit(ctx.user, 'UPDATE_CUSTOMER', 'customer', c.id, { code: c.code, before, after: { name: c.name, phone: c.phone, plate: c.plate } }, ctx);
  store.save();
  return { status: 200, body: { customer: summarize(db, c) } };
});

module.exports = { ROLES, roleOf };
