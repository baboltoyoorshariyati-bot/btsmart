'use strict';
// مسیرهای تازه‌ی داشبورد مدیریت: رانندگان، حذف مشتری و محصول، گزارش پیشرفته.
const { atomicRoute: route, fail } = require('../http');
const store = require('../store');
const repo = require('../sql-repos');
const validate = require('../validate');
const reports = require('../reports');

const ADMIN = { roles: ['admin'] };

// ---------- رانندگان ----------
function cleanDriver(b, { partial = false, existing = {} } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!partial || has('fullName')) out.fullName = validate.text(b.fullName, { field: 'نام راننده', max: 120, required: true });
  if (!partial || has('vehicleType')) out.vehicleType = validate.text(b.vehicleType, { field: 'نوع خودرو', max: 60, required: true });
  if (!partial || has('plate') || has('vehicleType')) out.plate = validate.driverPlate(b.plate ?? existing.plate, b.vehicleType ?? existing.vehicleType);
  // v37.3.4 — شماره تماس راننده (الزامی) و نام بانک پایانه پوز
  if (!partial || has('phone')) out.phone = validate.phone(b.phone, { required: true });
  if (!partial || has('posTerminal')) out.posTerminal = validate.text(b.posTerminal, { field: 'پایانه پوز', max: 60, required: false });
  if (!partial || has('posBank')) out.posBank = validate.text(b.posBank, { field: 'نام بانک پوز', max: 60, required: false });
  if (has('isActive')) out.isActive = !!b.isActive;
  return out;
}

route('GET', '/api/drivers', { roles: ['admin', 'dispatch'] }, () => ({ status: 200, body: { drivers: repo.repos.drivers.all() } })); // v37.39.0 — واحد پخش هم فهرست را می‌بیند

route('POST', '/api/drivers', { ...ADMIN, idempotent: true }, (ctx) => {
  const db = store.get();
  const data = cleanDriver(ctx.body || {});
  const driver = { id: store.uid(), fullName: '', phone: '', vehicleType: '', plate: '', posTerminal: '', posBank: '', isActive: true, createdAt: store.nowIso(), updatedAt: store.nowIso(), ...data };
  db.drivers.push(driver);
  store.audit(ctx.user, 'DRIVER_CREATED', 'driver', driver.id, { fullName: driver.fullName, phone: driver.phone, plate: driver.plate, posBank: driver.posBank }, ctx);
  store.save();
  return { status: 201, body: { driver } };
});

route('PUT', '/api/drivers/:id', { roles: ['admin', 'dispatch'] }, (ctx) => { // v37.39.0 — ویرایش خودرو/پوز برای واحد پخش هم باز است (ساخت/حذف فقط مدیر)
  const db = store.get();
  const d = db.drivers.find((x) => x.id === ctx.params.id);
  if (!d) fail(404, 'راننده پیدا نشد.');
  if (d.vehicleId || d.paymentDeviceId) fail(409, 'این راننده به خودرو و پوز تعریف‌شده متصل است؛ ویرایش از حساب کاربری انجام می‌شود.');
  if(ctx.body?.isActive===false&&require('../transport-planning').activeAssignments(db).some(a=>a.driverId===d.id))fail(409,'راننده مأموریت باز دارد؛ ابتدا آن را تعیین تکلیف کنید.');
  const before = { fullName: d.fullName, phone: d.phone || '', vehicleType: d.vehicleType || '', plate: d.plate, posTerminal: d.posTerminal || '', posBank: d.posBank || '' };
  Object.assign(d, cleanDriver(ctx.body || {}, { partial: true, existing: d }), { updatedAt: store.nowIso() });
  store.audit(ctx.user, 'DRIVER_UPDATED', 'driver', d.id, { before, after: { fullName: d.fullName, phone: d.phone || '', vehicleType: d.vehicleType, plate: d.plate, posTerminal: d.posTerminal, posBank: d.posBank || '' } }, ctx);
  store.save();
  return { status: 200, body: { driver: d } };
});

route('DELETE', '/api/drivers/:id', ADMIN, (ctx) => {
  const db = store.get();
  const i = db.drivers.findIndex((x) => x.id === ctx.params.id);
  if (i < 0) fail(404, 'راننده پیدا نشد.');
  if (require('../transport-planning').driverHasPlanningHistory(db,db.drivers[i].id)) fail(409, 'این راننده سابقه تخصیص دارد و حذف نمی‌شود.', 'HAS_HISTORY');
  if (require('../dispatch').driverHasAnyOrders(db.drivers[i].id)) fail(409, 'این راننده سابقه‌ی ارسال دارد و حذف نمی‌شود؛ او را غیرفعال کنید.', 'HAS_HISTORY');
  if (db.users.some(u=>u.driverId===db.drivers[i].id)) fail(409, 'این راننده به حساب کاربری متصل است و حذف نمی‌شود.');
  const [removed] = db.drivers.splice(i, 1);
  store.audit(ctx.user, 'DRIVER_DELETED', 'driver', removed.id, { fullName: removed.fullName, plate: removed.plate }, ctx);
  store.save();
  return { status: 200, body: { ok: true } };
});

// ---------- حذف مشتری (فقط بدون سابقه) ----------
route('DELETE', '/api/customers/:id', ADMIN, (ctx) => {
  const db = store.get();
  const i = db.customers.findIndex((x) => x.id === ctx.params.id);
  if (i < 0) fail(404, 'مشتری پیدا نشد.');
  const c = db.customers[i];
  const hasVisits = db.visits.some((v) => v.customerId === c.id);
  const hasOrders = db.orders.some((o) => o.customerId === c.id);
  if (hasVisits || hasOrders) fail(409, 'این مشتری سابقه‌ی مراجعه یا سفارش دارد و حذف نمی‌شود.', 'HAS_HISTORY');
  db.customers.splice(i, 1);
  store.audit(ctx.user, 'CUSTOMER_DELETED', 'customer', c.id, { code: c.code, name: c.name, phone: c.phone }, ctx);
  store.save();
  return { status: 200, body: { ok: true } };
});

// ---------- حذف محصول (فقط بدون سابقه سفارش) ----------
route('DELETE', '/api/admin/products/:id', ADMIN, (ctx) => {
  const db = store.get();
  const i = db.products.findIndex((x) => x.id === ctx.params.id);
  if (i < 0) fail(404, 'محصول یافت نشد.');
  const p = db.products[i];
  if (db.orderItems.some((x) => x.productId === p.id)) fail(409, 'این محصول در سفارش‌ها استفاده شده و حذف نمی‌شود؛ می‌توانید غیرفعالش کنید.', 'HAS_HISTORY');
  if (db.orders.some(o => (o.storeAdditionRequests || []).some(r => ['PENDING_SALES','PENDING_WAREHOUSE'].includes(r.status) && (r.items || []).some(x => x.productId === p.id))))
    fail(409, 'این محصول در درخواست افزودن کالا در انتظار بررسی است؛ ابتدا درخواست تعیین تکلیف شود.', 'PENDING_STORE_ADDITION');
  db.products.splice(i, 1);
  db.priceList = db.priceList.filter((x) => x.productId !== p.id);
  store.audit(ctx.user, 'PRODUCT_DELETED', 'product', p.id, { quickCode: p.quickCode, name: p.name }, ctx);
  store.save();
  return { status: 200, body: { ok: true } };
});

// ---------- گزارش پیشرفته ----------
route('GET', '/api/admin/reports/sources', ADMIN, () => ({ status: 200, body: { sources: reports.describe() } }));

route('POST', '/api/admin/reports/query', { ...ADMIN, idempotent: true }, (ctx) => {
  try {
    const result = reports.query(store.get(), ctx.body || {});
    store.audit(ctx.user, 'REPORT_QUERY', 'report', result.source, { rows: result.total, columns: result.columns.map((c) => c.key), from: ctx.body?.from || '', to: ctx.body?.to || '' }, ctx);
    store.save();
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) fail(err.status, err.message);
    throw err;
  }
});

module.exports = { cleanDriver };

// Full export: same validated filters, no preview cap, no cached multi-megabyte JSON.
route('POST', '/api/admin/reports/export', ADMIN, (ctx) => {
  let report;
  try { report = reports.query(store.get(), ctx.body || {}, { limit: Infinity }); }
  catch (err) { if (err.status) fail(err.status, err.message); throw err; }
  store.audit(ctx.user, 'REPORT_EXPORT', 'report', report.source, { rows: report.total, fields: report.columns.map(c => c.key) }, ctx);
  store.save();
  return { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="report-${report.source}.csv"`,
    'X-Report-Rows': String(report.total),
  }, stream: res => require('../csv').streamCsv(res, report) };
});
