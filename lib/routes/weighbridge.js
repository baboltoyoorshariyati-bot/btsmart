'use strict';
// کارتابل باسکول: ثبت وسیله‌ها، وزن‌کشی ورود/خروج، محاسبه خالص، و دریافت وزن زنده از عامل سریال
const crypto = require('crypto');
const { atomicRoute: route, fail } = require('../http');
const store = require('../store');
const config = require('../config');
const validate = require('../validate');
const wb = require('../weighbridge');
const ticket = require('../ticket-settings');

const OPS = { roles: ['gate', 'admin'] };
const DUP_WINDOW_MS = 60 * 1000;

function ensure(db) {
  db.vehicles = db.vehicles || [];
  db.weighTrips = db.weighTrips || [];
  return db;
}

function tokenOk(given) {
  const want = String(config.WEIGHBRIDGE_TOKEN || '');
  if (!want || want.length < 16) return false;
  const a = Buffer.from(String(given || '')), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicTrip(t) { return t; }

// دریافت وزن زنده از عامل سریال (هدر X-Scale-Token)، هم با مقدار عددی و هم با خط خام دستگاه
route('POST', '/api/weighbridge/reading', { auth: false }, (ctx) => {
  if (!tokenOk(ctx.req.headers['x-scale-token'])) fail(403, 'توکن باسکول معتبر نیست.');
  const b = ctx.body || {};
  let reading;
  if (b.line !== undefined) {
    const p = wb.parseIndicatorLine(String(b.line).slice(0, 200));
    if (!p) fail(422, 'خط دریافتی از نمایشگر قابل تجزیه نیست.');
    reading = { weight: p.weight, unit: 'kg', stable: p.stable, raw: b.line, source: 'serial' };
  } else {
    reading = { weight: b.weight, unit: b.unit || 'kg', stable: !!b.stable, raw: b.raw || '', source: 'serial' };
  }
  try { return { status: 200, body: { live: wb.setLive(reading) } }; }
  catch (e) { fail(400, e.message); }
});

// شبیه‌ساز برای آزمایش بدون دستگاه (فقط وقتی WEIGHBRIDGE_SIMULATOR=true)
route('POST', '/api/weighbridge/simulate', { roles: ['admin'] }, (ctx) => {
  if (!config.WEIGHBRIDGE_SIMULATOR) fail(403, 'شبیه‌ساز باسکول غیرفعال است.');
  const b = ctx.body || {};
  try { return { status: 200, body: { live: wb.setLive({ weight: b.weight, unit: 'kg', stable: b.stable !== false, source: 'simulator' }) } }; }
  catch (e) { fail(400, e.message); }
});

route('GET', '/api/weighbridge/state', OPS, () => {
  const db = ensure(store.get());
  const trips = db.weighTrips.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    status: 200,
    body: {
      live: wb.liveSnapshot(),
      settings: wb.settings(),
      scaleNo: String(config.WEIGHBRIDGE_SCALE_NO || '1'),
      simulator: !!config.WEIGHBRIDGE_SIMULATOR,
      vehicles: db.vehicles.filter((v) => v.kind !== 'fleet' && v.isActive !== false),
      products: db.products.filter((p) => p.isActive !== false).map((p) => ({ id: p.id, quickCode: p.quickCode, name: p.name, defaultUnit: p.defaultUnit })),
      open: trips.filter((t) => t.status === 'IN_PROGRESS').map(publicTrip),
      done: trips.filter((t) => t.status === 'DONE').slice(0, 40).map(publicTrip),
    },
  };
});

route('POST', '/api/weighbridge/vehicles', { ...OPS, idempotent: true }, (ctx) => {
  const db = ensure(store.get());
  const b = ctx.body || {};
  const plate = validate.plate(b.plate);
  if (!plate) fail(400, 'پلاک وسیله الزامی است.');
  const driverName = validate.text(b.driverName, { field: 'نام راننده', max: 120 });
  if (db.vehicles.some((v) => v.kind !== 'fleet' && v.plate === plate && v.isActive !== false)) fail(409, 'این پلاک قبلاً ثبت شده است.');
  const vehicle = { id: store.uid(), plate, driverName, isActive: true, createdAt: store.nowIso(), createdBy: ctx.user.id };
  db.vehicles.push(vehicle);
  store.audit(ctx.user, 'WB_VEHICLE_CREATED', 'vehicle', vehicle.id, { plate }, ctx);
  store.save();
  return { status: 201, body: { vehicle } };
});

route('POST', '/api/weighbridge/weigh', { ...OPS, idempotent: true }, (ctx) => {
  const db = ensure(store.get());
  const b = ctx.body || {};
  const s = wb.settings();
  const L = wb.liveSnapshot();
  if (!L.fresh || !L.stable || !(L.weight >= s.minStableKg)) fail(409, 'وزن پایدار و تازه‌ای از باسکول دریافت نشده است. وسیله را روی باسکول ثابت نگه دارید.');
  const plate = validate.plate(b.plate);
  if (!plate) fail(400, 'پلاک وسیله الزامی است.');
  const weight = L.weight;
  const open = db.weighTrips.find((t) => t.plate === plate && t.status === 'IN_PROGRESS');
  const now = store.nowIso();
  if (!open) {
    const recent = db.weighTrips.find((t) => t.plate === plate && t.status === 'DONE' && Date.now() - Date.parse(t.closedAt || 0) < DUP_WINDOW_MS);
    if (recent) fail(409, 'این وسیله همین الان خروج را ثبت کرده است. چند ثانیه صبر کنید.');
    const product = db.products.find((p) => p.id === String(b.productId || '') && p.isActive !== false);
    if (!product) fail(400, 'برای ورود وسیله، کالای مورد نظر را انتخاب کنید.');
    const vehicle = b.vehicleId ? db.vehicles.find((v) => v.kind !== 'fleet' && v.id === String(b.vehicleId)) : db.vehicles.find((v) => v.kind !== 'fleet' && v.plate === plate);
    const trip = {
      id: store.uid(), plate, vehicleId: vehicle?.id || null, driverName: vehicle?.driverName || '',
      productId: product.id, productName: product.name, customerName: validate.text(b.customerName, { field: 'نام مشتری یا طرف حساب', max: 120 }), status: 'IN_PROGRESS',
      firstWeight: weight, firstAt: now, firstKind: 'PENDING',
      secondWeight: null, secondAt: null, secondKind: null, loadedKg: null, emptyKg: null, netKg: null, closedAt: null,
      createdAt: now, createdBy: ctx.user.id,
    };
    db.weighTrips.push(trip);
    store.audit(ctx.user, 'WB_ENTRY_WEIGHED', 'weighTrip', trip.id, { plate, weight }, ctx);
    store.save();
    return { status: 201, body: { phase: 'ENTRY', trip } };
  }
  const net = wb.netFromTwo(open.firstWeight, weight, s);
  Object.assign(open, {
    secondWeight: weight, secondAt: now, firstKind: open.firstWeight >= weight ? 'LOADED' : 'EMPTY', secondKind: weight >= open.firstWeight ? 'LOADED' : 'EMPTY',
    loadedKg: net.loadedKg, emptyKg: net.emptyKg, netKg: net.netKg, status: 'DONE', closedAt: now, closedBy: ctx.user.id,
  });
  store.audit(ctx.user, 'WB_EXIT_WEIGHED', 'weighTrip', open.id, { plate, net: net.netKg }, ctx);
  store.save();
  return { status: 200, body: { phase: 'EXIT', trip: open } };
});

route('POST', '/api/weighbridge/trips/:id/cancel', { ...OPS, idempotent: true }, (ctx) => {
  const db = ensure(store.get());
  const trip = db.weighTrips.find((t) => t.id === ctx.params.id);
  if (!trip) fail(404, 'وزن‌کشی یافت نشد.');
  if (trip.status !== 'IN_PROGRESS') fail(409, 'فقط وزن‌کشی‌های باز قابل لغو هستند.');
  const reason = validate.text(ctx.body?.reason, { field: 'دلیل لغو', max: 200, required: true });
  Object.assign(trip, { status: 'CANCELLED', cancelledAt: store.nowIso(), cancelledBy: ctx.user.id, cancelReason: reason });
  store.audit(ctx.user, 'WB_TRIP_CANCELLED', 'weighTrip', trip.id, { plate: trip.plate, reason }, ctx);
  store.save();
  return { status: 200, body: { trip } };
});

// تنظیمات چاپ فیش: خواندن برای همه‌ی نقش‌های باسکول، ذخیره فقط برای مدیر
route('GET', '/api/weighbridge/ticket-settings', OPS, () => {
  const db = ensure(store.get());
  return { status: 200, body: { settings: db.weighTicketSettings || ticket.defaults() } };
});

route('PUT', '/api/weighbridge/ticket-settings', { roles: ['admin'] }, (ctx) => {
  let settings;
  try { settings = ticket.normalize((ctx.body || {}).settings ?? ctx.body); }
  catch (e) { fail(e.status || 400, e.message); }
  const db = ensure(store.get());
  db.weighTicketSettings = settings;
  store.audit(ctx.user, 'WB_TICKET_SETTINGS_UPDATED', 'weighTicket', 'settings', {}, ctx);
  store.save();
  return { status: 200, body: { settings } };
});
