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
  const codeQ = core.normalizeCode(q), phoneQ = core.phoneKey(q);
  return String(c.name || '').includes(q)
    || [c.phone, c.phone2].some(p => phoneQ && core.phoneKey(p).includes(phoneQ))
    || String(c.nationalId || '').includes(q)
    || String(c.company || '').includes(q)
    || (plateQ && normalizePlate(c.plate || '').includes(plateQ))
    || (codeQ && String(c.code || '').toUpperCase().includes(codeQ));
};

route('GET', '/api/customers', { roles: ROLES }, (ctx) => {
  const db = store.get();
  const q = ctx.query.get('q') || '';
  const limit = Math.min(Number(ctx.query.get('limit')) || 200, 500);
  const links=require('../customer-links'),resolve=links.resolver(db);
  const matched=new Set(db.customers.filter(c=>matchesQuery(c,q)).map(c=>resolve(c.id)));
  const rows = db.customers.filter((c) => !c.mergedInto && matched.has(c.id))
    .map((c) => summarize(db, c))
    .sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')))
    .slice(0, limit);
  if (['admin','sales'].includes(roleOf(ctx.user))) {
    const debt=require('../customer-debts'), totals=new Map();
    const storeOrders=new Set(db.orders.filter(o=>o.orderType==='STORE').map(o=>o.id));
    for(const p of db.payments){if(p.debtAccount&&!storeOrders.has(p.orderId)){const id=resolve(p.debtAccount.customerId),a=debt.amounts(p.debtAccount),t=totals.get(id)||{balance:0,credit:0};t.balance+=a.balance;t.credit+=a.credit||0;totals.set(id,t);}}
    for (const c of rows) {c.debtBalance=totals.get(c.id)?.balance||0;c.creditBalance=totals.get(c.id)?.credit||0;}
  }
  return { status: 200, body: { customers: rows, total: db.customers.filter(c=>!c.mergedInto).length } };
});

// Existing duplicates are reported, never merged automatically.
route('GET', '/api/customers/duplicate-phones', { roles: ['admin'] }, () => {
  const duplicates = core.duplicatePhones(store.get());
  return { status: 200, body: { duplicates } };
});

// Admin-only, explicit preview followed by a revision-checked atomic confirmation.
route('GET', '/api/customers/:id/merge-candidates', { roles: ['admin'] }, (ctx) => ({body:{candidates:require('../customer-merge').candidates(store.get(),ctx.params.id)}}));
route('POST', '/api/customers/merge-preview', { roles: ['admin'] }, (ctx) => ({body:require('../customer-merge').preview(store.get(),ctx.body.primaryId,ctx.body.secondaryId)}));
route('POST', '/api/customers/merge', { roles: ['admin'] }, (ctx) => {
  if(ctx.body.confirmed!==true)fail(400,'تأیید صریح ادغام لازم است.');
  const db=store.get(),preview=require('../customer-merge').preview(db,ctx.body.primaryId,ctx.body.secondaryId);
  if(typeof ctx.body.revision!=='string'||ctx.body.revision!==preview.revision)fail(409,'اطلاعات پس از پیش‌نمایش تغییر کرده است؛ دوباره بررسی کنید.','STALE_MERGE_PREVIEW');
  const secondary=db.customers.find(c=>c.id===ctx.body.secondaryId);
  secondary.mergedInto=ctx.body.primaryId;secondary.mergedAt=store.nowIso();secondary.mergedBy=ctx.user.id;
  store.audit(ctx.user,'CUSTOMER_MERGED','customer',ctx.body.primaryId,{primaryId:ctx.body.primaryId,secondaryId:ctx.body.secondaryId,primaryCode:preview.primary.code,secondaryCode:preview.secondary.code,revision:preview.revision},ctx);
  store.save();return {body:{ok:true,primaryId:ctx.body.primaryId}};
});

route('GET', '/api/customers/:id', { roles: ROLES }, (ctx) => {
  const db = store.get();
  const root=require('../customer-links').rootId(db,ctx.params.id);
  const c = db.customers.find((x) => x.id === root);
  if (!c) fail(404, 'مشتری پیدا نشد.');
  const ids=require('../customer-links').memberIds(db,c.id);
  const visits = db.visits.filter((v) => ids.has(v.customerId)).slice().reverse().slice(0, 30)
    .map((v) => ({ id: v.id, status: v.status, district: v.district || '', purpose: v.purpose || '', createdAt: v.createdAt }));
  const orders = customerOrders(db, c.id).slice().reverse().slice(0, 30)
    .map((o) => ({ id: o.id, orderNo: o.orderNo, orderType: o.orderType, status: o.status, createdAt: o.createdAt }));
  return { status: 200, body: { customer: summarize(db, c), historicalProfiles: require('../customer-links').members(db,c.id).filter(x=>x.id!==c.id).map(x=>({id:x.id,code:x.code,name:x.name,phone:x.phone,phone2:x.phone2,nationalId:x.nationalId,company:x.company,district:x.district,address:x.address,plate:x.plate,vehicleType:x.vehicleType,notes:x.notes})), visits, orders } };
});

route('POST', '/api/customers', { roles: ROLES, idempotent: true }, (ctx) => {
  const db = store.get();
  const data = core.cleanProfile(ctx.body || {});
  if (!data.phone) fail(400, 'شماره تماس الزامی است.');
  core.assertPhoneFree(db, data.phone, null);
  if (data.phone2) core.assertPhoneFree(db, data.phone2, null);
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
  if(c.mergedInto)fail(409,'این پرونده به پروندهٔ دیگری ادغام شده است؛ پروندهٔ اصلی را باز کنید.');
  const data = core.cleanProfile(ctx.body || {}, { partial: true });
  if (data.phone !== undefined) {
    if (!data.phone) fail(400, 'شماره تماس الزامی است.');
    core.assertPhoneFree(db, data.phone, c.id);
  }
  if (data.phone2) core.assertPhoneFree(db, data.phone2, c.id);
  const before = { name: c.name, phone: c.phone, phone2: c.phone2, plate: c.plate };
  Object.assign(c, data);
  store.audit(ctx.user, 'UPDATE_CUSTOMER', 'customer', c.id, { code: c.code, before, after: { name: c.name, phone: c.phone, phone2: c.phone2, plate: c.plate } }, ctx);
  store.save();
  return { status: 200, body: { customer: summarize(db, c) } };
});

module.exports = { ROLES, roleOf };
