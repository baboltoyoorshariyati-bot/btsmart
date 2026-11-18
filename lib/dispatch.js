'use strict';
// گردش پخش: فروش تخصیص می‌دهد ← راننده خروج را اعلام می‌کند ← نگهبان خروج را تایید می‌کند
// ← راننده تحویل را ثبت می‌کند ← فروش اطلاعات تحویل را بازبینی و نهایی می‌کند.
// PENDING_ASSIGN برای سفارش‌های قدیمی/منتظر تخصیص قبلی نگه داشته شده است.
// وضعیت‌های order.dispatch.status:
//   PENDING_ASSIGN       ← صف قدیمیِ بدون راننده
//   ASSIGNED             ← راننده توسط فروش انتخاب شده است
//   DRIVER_EXIT_REPORTED ← راننده خروج را ثبت کرده و منتظر تایید نگهبان است
//   IN_TRANSIT           ← نگهبان خروج اعلام‌شده را تایید کرده است
//   DELIVERED            ← راننده تحویل مقصد را ثبت کرده؛ منتظر تایید نهایی فروش
//   SALES_FINALIZED       ← فروش اطلاعات تحویل را بازبینی و نهایی کرده
//   CLOSED               ← وضعیت تاریخی نسخه‌های قدیمی
//
// مرجوعی: هر قلمِ مرجوعی یک «برگه مرجوعی» می‌شود:
//   AT_SALES → (فروش ارجاع می‌دهد) AT_WAREHOUSE → (انبار دریافت می‌کند) RECEIVED
const store = require('./store');
const validate = require('./validate');
const { CUSTOMER_CONTACT_ONLY, customerIdentity } = require('./customer-identity');
const { fail } = require('./http');
const { getProduct, enrichOrder, createNotification, notifyStore, notifyDriver } = require('./domain');

const DISPATCH_STATUS = {
  PENDING_ASSIGN: 'در انتظار تخصیص راننده',
  ASSIGNED: 'تخصیص‌یافته؛ منتظر تأیید راننده و اعلام خروج',
  DRIVER_EXIT_REPORTED: 'خروج راننده ثبت شد؛ منتظر تأیید نگهبان',
  IN_TRANSIT: 'خروج تأیید شد؛ در حال ارسال به مشتری',
  DELIVERED: 'تحویل مشتری ثبت شد؛ منتظر تأیید نهایی فروش',
  SALES_FINALIZED: 'ثبت نهایی فروش انجام شد',
  CLOSED: 'بسته شده (نسخهٔ قدیمی)',
};
const RETURN_STATUS = { AT_SALES: 'نزد واحد فروش', AT_WAREHOUSE: 'ارجاع به انبار', RECEIVED: 'دریافت‌شده توسط انبار' };
const SETTLEMENT_TYPES = { CASH: 'نقدی', CREDIT: 'معوق' };
const OPEN_STATUSES = ['PENDING_ASSIGN', 'ASSIGNED', 'DRIVER_EXIT_REPORTED', 'IN_TRANSIT', 'DELIVERED'];
const EPS = 0.0005;

const pad = (n) => String(n).padStart(2, '0');
function localDay(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayKey() { return localDay(new Date().toISOString()); }

function addEvent(dispatch, actor, action, text) {
  dispatch.events.push({ at: store.nowIso(), actor: actor?.username || 'SYSTEM', action, text });
}

// v37.5.0 — نمای هر خدمه‌بر (Dispatch) یک سفارش شامل نمای آرشیویِ سرویس‌های فروشگاه (order.dispatches)
function dispatchViews(o) {
  const out = [];
  if (Array.isArray(o.dispatches)) for (const d of o.dispatches) if (d) out.push({ order: o, dispatch: d, archived: true });
  if (o.dispatch) out.push({ order: o, dispatch: o.dispatch, archived: false });
  return out;
}
function findDispatchOrder(id) {
  const order = store.get().orders.find((o) => o.id === id);
  if (!order || !order.dispatch) fail(404, 'سفارش در بخش پخش یافت نشد.');
  return order;
}

function activeDriver(driverId) {
  const driver = store.get().drivers.find((d) => d.id === driverId);
  if (!driver) fail(404, 'راننده پیدا نشد.');
  if (!driver.isActive) fail(400, 'این راننده غیرفعال است.');
  return driver;
}

// ---------- فروش ----------
function prepareQtyOnlyPlan(order, scopeIds, scopeKg) { // v37.6.0 — فلوی فروشگاه: فقط وزن، بدون فی
  const active = store.get().orderItems.filter((i) => i.orderId === order.id && i.itemStatus !== 'CANCELLED' && scopeIds.has(i.id));
  if (!active.length) fail(400, 'قلمی در ارسال این سرویس وجود ندارد.');
  const plan = active.map((item) => {
    const deliveredKg = Number(scopeKg?.[item.id] ?? item.deliveredKg ?? 0);
    if (!(deliveredKg > 0)) fail(400, `وزن قلم «${getProduct(item.productId)?.name || 'قلم'}» در این سرویس ثبت نشده است.`);
    return { item, deliveredKg, cancelled: false };
  });
  return { plan };
}
function prepareDispatchPrices(order, rows, scopeIds, scopeKg) {
  const db = store.get();
  let active = db.orderItems.filter((item) => item.orderId === order.id && item.itemStatus !== 'CANCELLED');
  if (scopeIds && scopeIds.size) active = active.filter((item) => scopeIds.has(item.id)); // v37.5.0 — فقط اقلام همان سرویس
  if (!active.length) fail(400, 'قلم فعالی برای ارسال به پخش وجود ندارد.');
  if (scopeKg && scopeIds?.size) active.forEach((item) => { item.__runDeliveredKg = scopeKg[item.id] ?? item.deliveredKg; }); // جهت وزن همان سرویس
  if (!Array.isArray(rows)) fail(400, 'قیمت همهٔ اقلام باید پیش از ارسال به پخش توسط فروش تأیید شود.');
  const incoming = new Map();
  for (const row of rows) {
    const id = String(row?.itemId || '');
    if (!id || incoming.has(id)) fail(400, 'فهرست قیمت اقلام معتبر نیست.');
    incoming.set(id, row);
  }
  const activeIds = new Set(active.map((item) => item.id));
  for (const id of incoming.keys()) if (!activeIds.has(id)) fail(400, 'یکی از اقلام قیمت‌گذاری‌شده متعلق به این سفارش نیست.');

  const plan = active.map((item) => {
    const row = incoming.get(item.id);
    if (!row) fail(400, `قیمت قلم «${getProduct(item.productId)?.name || 'کالا'}» ثبت نشده است.`);
    const deliveredKg = Number(item.__runDeliveredKg ?? item.deliveredKg ?? 0); // وزن همان سرویس نزد ما
    const outOfStock = item.itemStatus === 'OUT_OF_STOCK' || deliveredKg <= 0;
    const cancelled = row.cancelled === true || row.cancelled === 'true';
    if (cancelled) return { item, cancelled: true, deliveredKg: 0, unitPrice: 0, amount: 0 };
    if (outOfStock) return { item, cancelled: false, deliveredKg: 0, unitPrice: 0, amount: 0 };
    const unitPrice = validate.number(row.unitPrice, { field: 'قیمت هر کیلو', min: 0, max: validate.MAX_MONEY });
    if (unitPrice <= 0) fail(400, `قیمت هر کیلو برای قلم «${getProduct(item.productId)?.name || 'کالا'}» باید بیشتر از صفر باشد.`);
    return { item, cancelled: false, deliveredKg, unitPrice, amount: Math.round(deliveredKg * unitPrice) };
  });
  const total = plan.reduce((sum, line) => sum + line.amount, 0);
  if (!plan.some((line) => !line.cancelled && line.deliveredKg > 0)) fail(400, 'هیچ قلم تحویلی برای ارسال به پخش باقی نمانده است.');
  if (total <= 0) fail(400, 'جمع مبلغ اقلام تحویلی باید بیشتر از صفر باشد.');
  if (total > validate.MAX_MONEY) fail(400, 'جمع قیمت‌های تأییدشده بیش از حد مجاز است.');
  return { plan, total };
}

function sendToDispatch(user, order, driverId, rows, ctx, adjustments = {}) {
  if(order.transportWorkflow===1) fail(409,'این سفارش از گردش جدید ترابری استفاده می‌کند و به مسیر قدیمی راننده قابل ارسال نیست.');
  if (order.deposit) fail(409, 'سفارش دارای بیعانه قابل ارسال به پخش نیست؛ تسویه باید در فروش انجام شود.');
  const srApi = require('./store-runs');
  const run = Number(adjustments?.run) === 2 ? 2 : (Number(adjustments?.run) === 1 ? 1 : 0);
  if (run && srApi.isStoreRunOrder(order)) { // v37.5.0 — ارسال یک سرویس سفارش فروشگاه به پخش (فاکتور و رانندهٔ همان سرویس)
    if (order.status !== 'WAREHOUSE_PREPARING') fail(409, 'این سفارش در مرحلهٔ ارسال سرویس‌ها نیست.');
    const ops = order.storeRunOps || {};
    const sh = srApi.runShipmentOf(order, run);
    if (!sh) fail(409, `اقلام سرویس ${run === 2 ? 'دوم' : 'اول'} هنوز از انبار به فروش ارسال نشده است.`);
    if (sh.status !== 'PENDING_SALES') fail(409, 'این سرویس قبلاً به پخش واگذار شده است.');
    if (order.dispatch && !srApi.RUN_DISPATCH_FINAL.includes(order.dispatch.status)) {
      fail(409, 'ارسال رانندهٔ سرویس بعدی فقط پس از نهایی‌شدن تحویل سرویس قبلی نزد فروش ممکن است.');
    }
    if (!String(driverId || '').trim()) fail(400, 'برای ارسال به پخش، ابتدا راننده را در کارتابل فروش انتخاب کنید.');
    const driver = activeDriver(String(driverId));
    const scopeIds = new Set(sh.itemIds || []);
    // v37.6.0 — فلوی فروشگاه بدون قیمت: هیچ درخواست فی/مبلغی ثبت و نمایش داده نمی‌شود؛ فقط اسناد وزنِ سرویس
    const { plan } = prepareQtyOnlyPlan(order, scopeIds, sh.weights || {});
    const amounts = { subtotalAmount: 0, discountAmount: 0, additionsAmount: 0, totalAmount: 0 };
    const total = 0;
    const now = store.nowIso();
    // پروندهٔ پخش قبلی (سرویس دیگر) آرشیو می‌شود؛ اسلات فعلی dispatch برای این سرویس است
    if (order.dispatch) {
      order.dispatches = Array.isArray(order.dispatches) ? order.dispatches : [];
      order.dispatches.push(order.dispatch);
    }
    order.dispatch = {
      run, shipmentItemIds: [...(sh.itemIds || [])], shipmentWeights: { ...(sh.weights || {}) },
      status: 'PENDING_ASSIGN', sentAt: now, sentBy: user.username, driverId: null, driverName: '', driverPlate: '',
      assignedAt: null, assignedBy: '', gateExitAt: null, gateExitBy: '', driverExitAt: null, driverExitBy: '',
      deliveredAt: null, deliveredBy: '', salesFinalizedAt: null, salesFinalizedBy: '', closedAt: null, closedBy: '', settlementType: '', signatureData: '', lines: [], note: '', events: [],
    };
    Object.assign(order.dispatch, {
      ...amounts, priceApprovedAt: now, priceApprovedBy: user.username, priceFree: true, approvedTotalAmount: 0,
      returnDeduction: 0, amountDue: 0,
      priceLines: plan.map((line) => ({
        itemId: line.item.id, productName: getProduct(line.item.productId)?.name || 'قلم',
        deliveredKg: line.deliveredKg, unitPrice: null, amount: null,
      })),
    });
    addEvent(order.dispatch, user, 'SENT', `اقلام سرویس ${run === 2 ? 'دوم' : 'اول'} از واحد فروش به راننده واگذار شد (بدون قیمت‌گذاری — فلوی فروشگاه).`);
    sh.status = 'DISPATCHED'; sh.dispatchedAt = now;
    order.storeRunOps = { ...ops, r1Shipment: ops.r1Shipment, r2Shipment: ops.r2Shipment, lastActivityAt: now, lastActivityBy: user.id };
    order.updatedAt = now;
    store.audit(user, run === 1 ? 'STORE_RUN_R1_DISPATCHED' : 'STORE_RUN_R2_DISPATCHED', 'order', order.id,
      { orderNo: order.orderNo, driverId: driver.id, priceFree: true, itemCount: plan.length }, ctx);
    return assignDriver(user, order, driver.id, ctx);
  }
  if (order.status !== 'SETTLEMENT_PENDING') fail(409, 'فقط سفارش‌های در مرحلهٔ تسویه را می‌توان به پخش فرستاد.');
  if (!String(driverId || '').trim()) fail(400, 'برای ارسال به پخش، ابتدا راننده را در کارتابل فروش انتخاب کنید.');
  const driver = activeDriver(String(driverId));
  if (order.dispatch && !['PENDING_ASSIGN', 'ASSIGNED'].includes(order.dispatch.status)) {
    fail(409, 'پس از ثبت خروج راننده یا تحویل سفارش، ارسال مجدد یا تغییر راننده ممکن نیست.');
  }
  if (order.dispatch?.priceApprovedAt) fail(409, 'قیمت سفارش قبلاً تأیید شده است؛ برای تغییر راننده از عملیات تخصیص استفاده کنید.');
  const { plan, total: subtotal } = prepareDispatchPrices(order, rows);
  const amounts=validate.settlementAmounts(subtotal,adjustments);
  const total=amounts.totalAmount;
  const now = store.nowIso();
  for (const line of plan) {
    if (line.cancelled) Object.assign(line.item, { itemStatus: 'CANCELLED', unitPrice: 0, finalAmount: 0 });
    else Object.assign(line.item, { unitPrice: line.unitPrice, finalAmount: line.amount });
  }
  if (!order.dispatch) {
    order.dispatch = {
      status: 'PENDING_ASSIGN', sentAt: now, sentBy: user.username, driverId: null, driverName: '', driverPlate: '',
      assignedAt: null, assignedBy: '', gateExitAt: null, gateExitBy: '', driverExitAt: null, driverExitBy: '',
      deliveredAt: null, deliveredBy: '', salesFinalizedAt: null, salesFinalizedBy: '', closedAt: null, closedBy: '', settlementType: '', signatureData: '', lines: [], note: '', events: [],
    };
  }
  Object.assign(order.dispatch, {
    ...amounts, priceApprovedAt: now, priceApprovedBy: user.username, approvedTotalAmount: total,
    returnDeduction: 0, amountDue: total,
    priceLines: plan.filter((line) => !line.cancelled).map((line) => ({
      itemId: line.item.id, productName: getProduct(line.item.productId)?.name || 'قلم',
      deliveredKg: line.deliveredKg, unitPrice: line.unitPrice, amount: line.amount,
    })),
  });
  addEvent(order.dispatch, user, 'PRICES_APPROVED', `فروش قیمت ${plan.filter((line) => !line.cancelled && line.deliveredKg > 0).length} قلم را تأیید کرد؛ جمع ${total.toLocaleString('en-US')} ریال.`);
  addEvent(order.dispatch, user, 'SENT', 'سفارش با قیمت تأییدشده از واحد فروش به پخش ارسال شد.');
  order.updatedAt = now;
  const priceAudit = {
    orderNo: order.orderNo, driverId: driver.id, total, ...amounts,
    lines: plan.map((line) => ({ itemId: line.item.id, unitPrice: line.unitPrice, deliveredKg: line.deliveredKg, amount: line.amount, cancelled: line.cancelled })),
  };
  store.audit(user, 'DISPATCH_PRICE_APPROVE', 'order', order.id, priceAudit, ctx);
  // نام رویداد تاریخی برای سازگاری گزارش ممیزی نگه داشته می‌شود.
  store.audit(user, 'SEND_TO_DISPATCH', 'order', order.id, priceAudit, ctx);
  // قیمت در همان تراکنش پیش از نمایش سفارش به راننده تأیید و ثبت می‌شود.
  return assignDriver(user, order, driver.id, ctx);
}

// ---------- پخش ----------
function assignDriver(user, order, driverId, ctx) {
  const d = order.dispatch;
  if (!d?.priceApprovedAt) fail(409, 'پیش از تخصیص راننده، فروش باید قیمت همهٔ اقلام را تأیید کند.');
  if (!['PENDING_ASSIGN', 'ASSIGNED'].includes(d.status)) fail(409, 'پس از ثبت خروج راننده یا تأیید نگهبان، تغییر راننده ممکن نیست.');
  const driver = activeDriver(String(driverId || ''));
  const before = d.driverName ? `${d.driverName} (${d.driverPlate || '-'})` : '—';
  Object.assign(d, {
    status: 'ASSIGNED', driverId: driver.id, driverName: driver.fullName, driverPlate: driver.plate || '',
    assignedAt: store.nowIso(), assignedBy: user.username,
  });
  addEvent(d, user, 'ASSIGNED', `راننده: ${before} → ${driver.fullName} (${driver.plate || 'بدون پلاک'})`);
  order.updatedAt = store.nowIso();
  createNotification('gate', 'DISPATCH_DRIVER_ASSIGNED', 'order', order.id, `رانندهٔ ${driver.fullName} برای سفارش ${order.orderNo || '—'} توسط فروش تخصیص یافت؛ ابتدا راننده خروج را ثبت می‌کند و سپس نگهبان آن را تأیید می‌کند.`,{run:order.dispatch?.run});
  notifyDriver(order,'DRIVER_ASSIGNMENT',`سفارش ${order.orderNo || '—'} به شما واگذار شد.`,order.dispatch?.run);
  notifyStore(order,'STORE_DELIVERY_UPDATE',`راننده برای سفارش ${order.orderNo || '—'} تعیین شد.`,order.dispatch?.run);
  store.audit(user, 'DISPATCH_ASSIGN', 'order', order.id, { driverId: driver.id, driverName: driver.fullName, plate: driver.plate, from: before }, ctx);
  store.save();
  return order;
}

// ---------- نگهبانی ----------
function gateExit(user, order, ctx) {
  if (order.dispatch.status !== 'DRIVER_EXIT_REPORTED') fail(409, 'ابتدا راننده باید خروج سفارش را در کارتابل خود ثبت کند.');
  const now = store.nowIso();
  Object.assign(order.dispatch, { status: 'IN_TRANSIT', gateExitAt: now, gateExitBy: user.username });
  addEvent(order.dispatch, user, 'GATE_EXIT_CONFIRMED', 'نگهبان خروج اعلام‌شده توسط راننده را تایید کرد؛ سفارش در مسیر مقصد مشتری است.');
  order.updatedAt = now;
  notifyDriver(order,'DRIVER_GATE_EXIT',`خروج سفارش ${order.orderNo || '—'} تأیید شد.`,order.dispatch?.run);
  notifyStore(order,'STORE_DELIVERY_UPDATE',`ارسال سفارش ${order.orderNo || '—'} آغاز شد.`,order.dispatch?.run);
  store.audit(user, 'DISPATCH_GATE_EXIT', 'order', order.id, { driverName: order.dispatch.driverName, plate: order.dispatch.driverPlate, driverExitAt: order.dispatch.driverExitAt }, ctx);
  store.save();
  return order;
}

function gateFinalExit() {
  fail(410, 'خروج نهایی سفارش پخش دیگر در نگهبانی انجام نمی‌شود؛ سفارش پس از تحویل برای تأیید نهایی به واحد فروش می‌رود.');
}

function salesFinalizeDelivery(user, order, ctx, body = {}) {
  if (order.dispatch.status !== 'DELIVERED') fail(409, 'فقط تحویل ثبت‌شدهٔ راننده در انتظار تأیید نهایی فروش است.');
  const db = store.get();
  const dispatch = order.dispatch;
  const run = dispatch.run || null; // v37.5.0 — سرویس‌های فروشگاه هر یک فاکتور مستقل دارند
  const srApi = require('./store-runs');
  const isRun = run && srApi.isStoreRunOrder(order);
  const isStoreOrder = order.orderType === 'STORE';
  const priceEdits = Array.isArray(body.items) ? body.items : [];
  const existingPayment = db.payments.find((payment) => payment.orderId === order.id && (payment.deliveryRun || null) === run);
  if (!existingPayment && !isStoreOrder && order.debtTrackingEnabled && ((body.settlementMethods || dispatch.settlementMethods || []).some(m=>m?.type==='CREDIT'))) {
    const cid=require('./customer-debts').customerId(db,order);
    if(!cid||!db.customers.some(c=>c.id===cid))fail(409,'برای ثبت معوق باید سفارش به پرونده مشتری متصل باشد.');
  }

  // v37.6.0 — نقطهٔ واحد «تغییر قیمت پیش از صدور فاکتور»: فروش در لحظهٔ نهایی‌سازی تحویل می‌تواند فی قلم را اصلاح کند (فقط مشتریان عادی)
  if (priceEdits.length) {
    if (isStoreOrder) fail(400, 'سفارش‌های فروشگاه فلوی بدون قیمت دارند؛ قیمت‌گذاری در این فلوی معنا ندارد.');
    if (existingPayment) fail(409, 'فاکتور این سفارش پیش‌تر صادر شده است؛ تغییر قیمت پس از صدور فاکتور ممکن نیست.');
    const editMap = new Map(priceEdits.map((row) => [String(row?.itemId || ''), row]));
    if ([...editMap.keys()].some((id) => !id)) fail(400, 'شناسهٔ قلم برای تغییر قیمت معتبر نیست.');
    const scoped = db.orderItems.filter((i) => i.orderId === order.id && i.itemStatus !== 'CANCELLED'
      && (!(dispatch.shipmentItemIds || []).length || dispatch.shipmentItemIds.includes(i.id)));
    // Validate every proposed price and the resulting invoice before writing to
    // the live SQLite-backed objects. A later invalid row must not save earlier edits.
    const prices = new Map();
    for (const item of scoped) {
      const row = editMap.get(item.id);
      const price = row ? validate.number(row.unitPrice, { field: `قیمت ${getProduct(item.productId)?.name || 'قلم'}`, min: 0, max: validate.MAX_MONEY }) : Number(item.unitPrice || 0);
      prices.set(item.id, price);
    }
    const sub = scoped.reduce((sum, item) => { const kg = Number(dispatch.shipmentWeights?.[item.id] ?? item.deliveredKg ?? 0); return sum + Math.round(kg * prices.get(item.id)); }, 0);
    const adj = validate.settlementAmounts(sub, { discountAmount: dispatch.discountAmount || 0, additionsAmount: dispatch.additionsAmount || 0 });
    if (scoped.some((i) => prices.get(i.id) <= 0 && Number(dispatch.shipmentWeights?.[i.id] ?? i.deliveredKg ?? 0) > 0 && !isStoreOrder)) fail(409, 'برای اقلام تحویلی، قیمت هر کیلو باید بزرگ‌تر از صفر باشد.');
    const revisedLines = (dispatch.lines || []).map(line => {
      const price = prices.get(line.itemId) ?? Number(line.unitPrice || 0);
      const grossAmount = Math.round(Number(line.deliveredKg || 0) * price);
      const returnAmount = Math.round(Number(line.returnKg || 0) * price);
      return { ...line, unitPrice: price, grossAmount, returnAmount, amountDue: Math.max(0, grossAmount - returnAmount) };
    });
    const returnAmount = revisedLines.reduce((sum, line) => sum + line.returnAmount, 0);
    const newDue = Math.max(0, adj.totalAmount - returnAmount);
    let methods = dispatch.settlementMethods;
    if (Array.isArray(body.settlementMethods)) methods = require('./settlement-methods').cleanRows(body.settlementMethods, newDue, db);
    else if (Array.isArray(methods) && methods.length && methods.reduce((sum, m) => sum + Number(m.amount || 0), 0) !== newDue)
      fail(409, 'با تغییر قیمت، مبلغ پرداخت تغییر کرده است؛ روش‌ها و مبالغ پرداخت باید دوباره تأیید شوند.');
    for (const item of scoped) {
      if (!editMap.has(item.id)) continue;
      const price = prices.get(item.id), prev = Number(item.unitPrice || 0);
      item.unitPrice = price;
      if (price !== prev) store.audit(user, 'DISPATCH_PRICE_ADJUST', 'order', order.id, { orderNo: order.orderNo, itemId: item.id, productId: item.productId, oldPrice: prev, newPrice: price }, ctx);
    }
    Object.assign(dispatch, adj, { approvedTotalAmount: adj.totalAmount, grossAmount: adj.totalAmount, returnDeduction: returnAmount, amountDue: newDue, lines: revisedLines, settlementMethods: methods });
    dispatch.priceLines = scoped.map((item) => ({
      itemId: item.id, productName: getProduct(item.productId)?.name || 'قلم',
      deliveredKg: Number(dispatch.shipmentWeights?.[item.id] ?? item.deliveredKg ?? 0), unitPrice: Number(item.unitPrice || 0), amount: Math.round(Number(dispatch.shipmentWeights?.[item.id] ?? item.deliveredKg ?? 0) * Number(item.unitPrice || 0)),
    }));
    addEvent(dispatch, user, 'PRICE_ADJUSTED', `فروش پیش از صدور فاکتور قیمت ${priceEdits.length} قلم را به‌روزرسانی کرد؛ جمع جدید ${adj.totalAmount.toLocaleString('en-US')} ریال.`);
  }
  const itemItems = dispatch.shipmentItemIds?.length
    ? db.orderItems.filter((item) => item.orderId === order.id && (dispatch.shipmentItemIds || []).includes(item.id) && item.itemStatus !== 'CANCELLED')
    : db.orderItems.filter((item) => item.orderId === order.id && item.itemStatus !== 'CANCELLED');
  const itemTotal = itemItems.reduce((sum, item) => { const kg = Number(dispatch.shipmentWeights?.[item.id] ?? item.deliveredKg ?? 0); return sum + Math.round(kg * Number(item.unitPrice || 0)); }, 0); // v37.5.0 — قلم و وزن همان سرویس
  let approvedTotal = Number(dispatch.approvedTotalAmount ?? dispatch.grossAmount ?? existingPayment?.grossAmount ?? existingPayment?.totalAmount ?? itemTotal);
  if (!(approvedTotal > 0)) approvedTotal = 0; // اجازه تایید نهایی حتی بدون قیمتِ قبلی — مبلغ ۰ ثبت می‌شود تا فروش بعداً اصلاح کند
  const now = store.nowIso();
  const deduction = Number(dispatch.returnDeduction || 0);
  const totalAmount = Math.max(0, Number(dispatch.amountDue ?? approvedTotal - deduction));
  // v37.5.0 — سطرهای فاکتور سرویس پس از کسر عودتِ همان تحویل (هم‌راستا با مبلغ نهایی فاکتور)
  // v37.6.0 — فلوی فروشگاه سند بدون مبلغ است: سطرها فقط وزن خالص و مرجوعی دارند (unitPrice/amount ندارند)
  const scopedDispatchLines = (dispatch.lines || [])
    .filter((line) => !(dispatch.shipmentItemIds || []).length || (dispatch.shipmentItemIds || []).includes(line.itemId));
  // v37.17.0 — اگر سطرهای تحویل راننده موجود نباشد، سطرهای سند از وزنِ همان سرویس ساخته می‌شوند، نه از وزن کل قلم.
  const fallbackRunLines = itemItems.map((item) => {
    const runKg = run === 1 ? srApi.r1Kg(item) : srApi.r2Kg(item);
    const deliveredKg = Number(dispatch.shipmentWeights?.[item.id] ?? runKg ?? item.deliveredKg ?? 0);
    return { itemId: item.id, productName: getProduct(item.productId)?.name || 'قلم', deliveredKg, unitPrice: isStoreOrder ? null : Number(item.unitPrice || 0), amount: isStoreOrder ? null : Math.round(deliveredKg * Number(item.unitPrice || 0)), returnKg: 0 };
  });
  const runPriceLines = isRun ? (scopedDispatchLines.length ? scopedDispatchLines : fallbackRunLines)
    .map((line) => {
      const netKg = Math.max(0, +(Number(line.deliveredKg || 0) - Number(line.returnKg || 0) - Number(line.shortageKg || 0)).toFixed(3));
      return isStoreOrder
        ? { itemId: line.itemId, productName: line.productName, deliveredKg: netKg, unitPrice: null, amount: null, returnKg: Number(line.returnKg || 0) }
        : { itemId: line.itemId, productName: line.productName, deliveredKg: netKg, unitPrice: Number(line.unitPrice || 0), amount: Number(line.amountDue ?? line.grossAmount ?? 0), returnKg: Number(line.returnKg || 0) };
    }) : undefined;
  const identity = customerIdentity(db, order);
  const debtAccount = !existingPayment && !isStoreOrder ? require('./customer-debts').newAccount(db, order, dispatch.settlementMethods || []) : null;
  let payment = existingPayment;
  if (payment) {
    if (payment.grossAmount == null) payment.grossAmount = approvedTotal;
    Object.assign(payment, {
      totalAmount, discountAmount: dispatch.discountAmount ?? payment.discountAmount ?? 0, additionsAmount: dispatch.additionsAmount ?? payment.additionsAmount ?? 0, returnDeduction: deduction, settlementType: dispatch.settlementType, settlementMethods: dispatch.settlementMethods || payment.settlementMethods || [],
      customerName: payment.customerName ?? dispatch.customerName ?? identity.customerName, customerPhone: payment.customerPhone ?? dispatch.customerPhone ?? identity.customerPhone,
      signatureData: dispatch.signatureData || payment.signatureData || '',
      verificationMode: payment.verificationMode || 'DRIVER_DELIVERY',
      verifiedAt: payment.verifiedAt || now, settledBy: payment.settledBy || user.id,
    });
    payment.deliveryRun = run; // v37.17.0 — سند همیشه به همان سرویس سنجاق می‌شود
    if (runPriceLines) payment.priceLines = runPriceLines;
    else if (dispatch.priceLines?.length) payment.priceLines = dispatch.priceLines; // v37.6.0 — سند فاکتور هم با آخرین قیمت‌ها هم‌راستا شود
  } else {
    payment = {
      id: store.uid(), orderId: order.id, customerId: order.customerId || null, deliveryRun: run, // v37.5.0 — فاکتور جدا برای هر سرویس
      priceLines: runPriceLines || dispatch.priceLines || undefined,
      discountAmount: dispatch.discountAmount || 0, additionsAmount: dispatch.additionsAmount || 0, subtotalAmount: dispatch.subtotalAmount ?? itemTotal, invoiceNumber: store.nextInvoiceNumber(), grossAmount: approvedTotal, returnDeduction: deduction, totalAmount,
      settlementType: dispatch.settlementType, settlementMethods: dispatch.settlementMethods || [], customerName: dispatch.customerName ?? identity.customerName, customerPhone: dispatch.customerPhone ?? identity.customerPhone, signatureData: dispatch.signatureData || '',
      ...(debtAccount ? {debtAccount} : {}),
      fingerprintRef: '', noFingerprintAllowed: !CUSTOMER_CONTACT_ONLY, verificationMode: 'DRIVER_DELIVERY',
      verifiedAt: now, settledBy: user.id,
    };
    db.payments.push(payment);
  }
  Object.assign(dispatch, {
    status: 'SALES_FINALIZED', grossAmount: approvedTotal, returnDeduction: deduction, amountDue: totalAmount,
    salesFinalizedAt: now, salesFinalizedBy: user.username, closedAt: now, closedBy: user.username,
  });
  if (isRun) { // v37.5.0 — سفارش فروشگاه تا نهایی‌شدن همهٔ سرویس‌ها باز می‌ماند؛ سپس خودکار بسته می‌شود
    const srItems = db.orderItems.filter((i) => i.orderId === order.id);
    if (srApi.orderFullyClosed(order, srItems)) {
      Object.assign(order, { status: 'CLOSED', updatedAt: now });
      createNotification('gate', 'ORDER_CLOSED', 'order', order.id, `سفارش فروشگاه ${order.orderNo || '—'} با نهایی‌شدن همهٔ سرویس‌ها بسته شد.`);
    } else { order.updatedAt = now; }
  }
  else Object.assign(order, { status: 'SETTLED', updatedAt: now });
  addEvent(dispatch, user, 'SALES_FINALIZED', `واحد فروش اطلاعات تحویل راننده را بدون ورود دوباره نهایی کرد؛ فاکتور ${payment.invoiceNumber}، مبلغ قابل تسویه ${totalAmount.toLocaleString('en-US')} ریال.`);
  store.audit(user, 'DISPATCH_SALES_FINALIZE', 'order', order.id, {
    deliveredAt: dispatch.deliveredAt, settlementType: dispatch.settlementType,
    lineCount: (dispatch.lines || []).length, hasSignature: !!dispatch.signatureData,
    invoiceNumber: payment.invoiceNumber, grossAmount: approvedTotal, returnDeduction: deduction, totalAmount,
  }, ctx);
  store.save();
  return order;
}

// ---------- راننده ----------
function driverOwns(user, order) {
  return !!user.driverId && order.dispatch && order.dispatch.driverId === user.driverId;
}
function findDriverOrder(user, id) {
  const order = store.get().orders.find((o) => o.id === id);
  if (!order || !order.dispatch || !driverOwns(user, order)) fail(404, 'سفارش در فهرست شما یافت نشد.');
  return order;
}

function driverExit(user, order, ctx) {
  if (order.dispatch.status !== 'ASSIGNED') fail(409, 'تأیید سفارش و اعلام خروج فقط برای سفارش تخصیص‌یافته مجاز است.');
  if (!order.dispatch.priceApprovedAt) fail(409, 'سفارش تا زمان تأیید قیمت توسط فروش برای خروج آماده نیست.');
  const now = store.nowIso();
  Object.assign(order.dispatch, { status: 'DRIVER_EXIT_REPORTED', driverExitAt: now, driverExitBy: user.username });
  addEvent(order.dispatch, user, 'DRIVER_EXIT', 'راننده دریافت سفارش و خروج را ثبت کرد؛ منتظر تایید نگهبان است.');
  order.updatedAt = now;
  createNotification('gate', 'DISPATCH_DRIVER_EXIT_PENDING', 'order', order.id, `رانندهٔ ${order.dispatch.driverName} خروج سفارش ${order.orderNo || '—'} را ثبت کرد؛ لطفاً خروج راننده را تأیید کنید.`,{run:order.dispatch?.run});
  store.audit(user, 'DISPATCH_DRIVER_EXIT', 'order', order.id, { driverName: order.dispatch.driverName, plate: order.dispatch.driverPlate }, ctx);
  store.save();
  return order;
}

const num = (v) => {
  const s = validate.digitsToAscii(String(v ?? '')).replace(/,/g, '').trim();
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
};

// اعتبارسنجی تحویل: امضا، نوع تسویه، مرجوعی (کلی یا قلم‌به‌قلم) و کسری وزن
function cleanDelivery(body, order) {
  const settlementType = String(body.settlementType || '').toUpperCase();
  if (!SETTLEMENT_TYPES[settlementType]) fail(400, 'نوع تسویه را انتخاب کنید: نقدی یا معوق.');
  const signatureData = CUSTOMER_CONTACT_ONLY ? '' : validate.signature(body.signatureData);
  const fullReturn = body.fullReturn === true || body.fullReturn === 'true';
  const rows = Array.isArray(body.lines) ? body.lines : [];
  const isStorePriceFree = order.orderType === 'STORE'; // v37.6.0 — فلوی فروشگاه سند بدون مبلغ دارد
  let items = store.get().orderItems.filter((i) => i.orderId === order.id && i.itemStatus !== 'CANCELLED');
  let runWeights = null;
  if (order.dispatch?.run) { // v37.5.0 — تحویل هر سرویس فقط روی اقلام همان ارسال با وزن خودش
    const ids = new Set(order.dispatch.shipmentItemIds || []);
    if (ids.size) {
      items = items.filter((i) => ids.has(i.id));
      runWeights = order.dispatch.shipmentWeights || null;
    } else { // v37.17.0 — محمولهٔ قدیمی بدون فهرست اقلام: محدوده از وزن‌های همان سرویس ساخته می‌شود تا اقلام سرویس دیگر وارد تحویل نشوند
      const srApi = require('./store-runs');
      const runKg = order.dispatch.run === 2 ? srApi.r2Kg : srApi.r1Kg;
      items = items.filter((i) => runKg(i) > 0);
      runWeights = Object.fromEntries(items.map((i) => [i.id, runKg(i)]));
    }
  }
  if (!items.length) fail(400, 'قلمی برای تحویل وجود ندارد.');
  const lines = items.map((item) => {
    const row = rows.find((r) => r && r.itemId === item.id) || {};
    const delivered = Number(runWeights?.[item.id] ?? item.deliveredKg ?? 0);
    const name = getProduct(item.productId)?.name || 'قلم';
    let returnKg = fullReturn ? delivered : num(row.returnKg);
    let shortageKg = fullReturn ? 0 : num(row.shortageKg);
    if (Number.isNaN(returnKg) || Number.isNaN(shortageKg)) fail(400, `مقدار مرجوعی یا کسری «${name}» معتبر نیست.`);
    if (returnKg + shortageKg > delivered + EPS) fail(400, `جمع مرجوعی و کسری «${name}» بیشتر از وزن تحویلی است.`);
    const reason = validate.text(row.reason || '', { field: 'علت مرجوعی/کسری', max: 300 });
    if ((returnKg > 0 || shortageKg > 0) && !reason.trim()) fail(400, `برای «${name}» علت مرجوعی یا کسری وزن را بنویسید.`);
    returnKg = +returnKg.toFixed(3); shortageKg = +shortageKg.toFixed(3);
    const unitPrice = isStorePriceFree ? 0 : Number(item.unitPrice || 0);
    if (delivered > 0 && unitPrice <= 0 && !isStorePriceFree) fail(409, `قیمت قلم «${name}» پیش از تحویل تأیید نشده است.`);
    const grossAmount = Math.round(delivered * unitPrice);
    const returnAmount = Math.round(returnKg * unitPrice);
    return {
      itemId: item.id, productName: name, deliveredKg: delivered, unitPrice, grossAmount,
      returnKg, returnAmount, shortageKg, amountDue: Math.max(0, grossAmount - returnAmount),
      netKg: Math.max(0, +(delivered - returnKg - shortageKg).toFixed(3)), reason,
    };
  });
  const note = validate.text(body.note || '', { field: 'یادداشت تحویل', max: 500 });
  // The driver's payment must match the approved invoice, including sales
  // discounts/additions, less returns (shortage remains informational).
  const gross = Number(order.dispatch?.approvedTotalAmount ?? order.dispatch?.grossAmount ?? lines.reduce((sum, line) => sum + line.grossAmount, 0));
  const payable = isStorePriceFree ? 0 : Math.max(0, gross - lines.reduce((sum, line) => sum + line.returnAmount, 0));
  const methods = isStorePriceFree ? [] : (Array.isArray(body.settlementMethods) ? body.settlementMethods : [{ type: settlementType === 'CREDIT' ? 'CREDIT' : 'CASH', amount: payable, reason: settlementType === 'CREDIT' ? (note || 'معوق طبق ثبت نسخه قدیمی') : undefined }]);
  const settlementMethods = require('./settlement-methods').cleanRows(methods, payable, store.get());
  return { settlementType, settlementMethods, signatureData, lines, note, fullReturn };
}

function completeDelivery(user, order, body, ctx) {
  if (order.dispatch.status !== 'IN_TRANSIT') fail(409, 'ثبت تحویل فقط برای سفارش در حال ارسال مجاز است.');
  const clean = cleanDelivery(body, order);
  const now = store.nowIso();
  const db = store.get();
  Object.assign(order.dispatch, {
    status: 'DELIVERED', deliveredAt: now, deliveredBy: user.username, settlementType: clean.settlementType, settlementMethods: clean.settlementMethods,
    ...customerIdentity(db,order), signatureData: clean.signatureData, lines: clean.lines, note: clean.note, fullReturn: clean.fullReturn,
  });
  // هر قلمِ مرجوعی یک برگه‌ی مرجوعی نزد واحد فروش می‌شود
  const customerName = order.orderType === 'STORE' ? (require('./store-name').storeDisplayName(order.storeName,order.branchNo)) : (order.customer?.name || order.storeName || '—');
  for (const l of clean.lines.filter((x) => x.returnKg > 0)) {
    db.dispatchReturns.push({
      id: store.uid(), orderId: order.id, orderNo: order.orderNo || '—', customerName,
      driverName: order.dispatch.driverName, driverPlate: order.dispatch.driverPlate, itemId: l.itemId,
      productName: l.productName, kg: l.returnKg, reason: l.reason, fullOrder: clean.fullReturn,
      status: 'AT_SALES', createdAt: now, deliveredAt: now,
      salesReferredAt: null, salesReferredBy: '', warehouseReceivedAt: null, warehouseReceivedBy: '',
    });
  }
  const deduction = applyReturnToInvoice(order);
  const returnsCount = clean.lines.filter((l) => l.returnKg > 0).length;
  const short = clean.lines.filter((l) => l.shortageKg > 0).length;
  addEvent(order.dispatch, user, 'DELIVERED',
    `تحویل به مشتری — تسویه ${SETTLEMENT_TYPES[clean.settlementType]}؛ ${clean.fullReturn ? 'مرجوعی کلی سفارش' : `${returnsCount} قلم مرجوعی`}، ${short} قلم کسری وزن، کسر فاکتور ${deduction.toLocaleString('en-US')} ریال.`);
  order.updatedAt = now;
  createNotification('sales', 'DISPATCH_DELIVERY_PENDING_SALES', 'order', order.id,
    `راننده تحویل سفارش ${order.orderNo || '—'} را ثبت کرد؛ بازبینی و تأیید نهایی در کارتابل فروش انجام شود.`,{run:order.dispatch?.run});
  notifyStore(order,'STORE_DELIVERY_UPDATE',`تحویل سفارش ${order.orderNo || '—'} توسط راننده ثبت شد.`,order.dispatch?.run);
  if (returnsCount) createNotification('sales', 'DISPATCH_RETURN', 'order', order.id, `مرجوعی از سفارش ${order.orderNo || ''} نزد واحد فروش است.`,{run:order.dispatch?.run});
  store.audit(user, 'DISPATCH_DELIVERED', 'order', order.id, {
    settlementType: clean.settlementType, settlementMethods: clean.settlementMethods, fullReturn: clean.fullReturn, invoiceDeduction: deduction,
    grossAmount: order.dispatch.grossAmount, amountDue: order.dispatch.amountDue,
    lines: clean.lines.map(({ itemId, productName, deliveredKg, unitPrice, grossAmount, returnKg, returnAmount, shortageKg, amountDue, reason }) => ({ itemId, productName, deliveredKg, unitPrice, grossAmount, returnKg, returnAmount, shortageKg, amountDue, reason })),
  }, ctx);
  store.save();
  return order;
}

// ---------- اثر مرجوعی روی فاکتور ----------
// مبلغ مرجوعی = کیلوی مرجوعی × قیمت واحد قلم. کسر روی رکورد پرداخت (فاکتور) اعمال می‌شود.
function returnDeduction(order) {
  const db = store.get();
  let sum = 0;
  for (const l of order.dispatch?.lines || []) {
    const item = db.orderItems.find((i) => i.id === l.itemId);
    const unitPrice = Number(item?.unitPrice ?? l.unitPrice ?? 0);
    if (!(l.returnKg > 0) || !(unitPrice > 0)) { l.returnAmount = 0; continue; }
    l.unitPrice = unitPrice;
    l.returnAmount = Math.round(Number(l.returnKg) * unitPrice);
    l.amountDue = Math.max(0, Number(l.grossAmount ?? (Number(l.deliveredKg || 0) * unitPrice)) - l.returnAmount);
    sum += l.returnAmount;
  }
  return sum;
}
// مرجوعی از مبلغ فاکتور کم می‌شود؛ کسری وزن صرفاً گزارش است و مبلغ را تغییر نمی‌دهد.
function applyReturnToInvoice(order) {
  const dispatch = order.dispatch || {};
  const payment = store.get().payments.find((p) => p.orderId === order.id && (p.deliveryRun || null) === (dispatch.run || null));
  const scopeIds = Array.isArray(dispatch.shipmentItemIds) && dispatch.shipmentItemIds.length ? new Set(dispatch.shipmentItemIds) : null; // v37.17.0 — فقط اقلام همان سرویس
  const itemGross = store.get().orderItems.filter((i) => i.orderId === order.id && i.itemStatus !== 'CANCELLED' && (!scopeIds || scopeIds.has(i.id)))
    .reduce((sum, item) => sum + Number(item.finalAmount ?? Math.round(Number((scopeIds ? (dispatch.shipmentWeights?.[item.id] ?? item.deliveredKg) : item.deliveredKg) || 0) * Number(item.unitPrice || 0))), 0);
  const lineGross = (dispatch.lines || []).reduce((sum, line) =>
    sum + Number(line.grossAmount ?? Math.round(Number(line.deliveredKg || 0) * Number(line.unitPrice || 0))), 0);
  const fallbackGross = itemGross > 0 ? itemGross : lineGross;
  const gross = Number(dispatch.approvedTotalAmount ?? dispatch.grossAmount ?? payment?.grossAmount ?? payment?.totalAmount ?? fallbackGross);
  const deduction = returnDeduction(order);
  dispatch.grossAmount = gross;
  dispatch.returnDeduction = deduction;
  dispatch.amountDue = Math.max(0, gross - deduction);
  for (const line of dispatch.lines || []) {
    line.amountDue = Math.max(0, Number(line.grossAmount || 0) - Number(line.returnAmount || 0));
  }
  if (payment) {
    if (payment.grossAmount == null) payment.grossAmount = payment.totalAmount;
    payment.returnDeduction = deduction;
    payment.totalAmount = Math.max(0, payment.grossAmount - deduction);
  }
  return deduction;
}

// ---------- برگه‌های مرجوعی ----------
function findReturn(id) {
  const r = store.get().dispatchReturns.find((x) => x.id === id);
  if (!r) fail(404, 'برگه‌ی مرجوعی پیدا نشد.');
  return r;
}
function referReturnToWarehouse(user, ticket, ctx) {
  if (ticket.status !== 'AT_SALES') fail(409, 'این مرجوعی قبلاً ارجاع شده است.');
  Object.assign(ticket, { status: 'AT_WAREHOUSE', salesReferredAt: store.nowIso(), salesReferredBy: user.username });
  createNotification('warehouse', 'RETURN_TO_WAREHOUSE', 'return', ticket.id, `مرجوعی «${ticket.productName}» از سفارش ${ticket.orderNo} برای دریافت به انبار ارجاع شد.`);
  store.audit(user, 'RETURN_REFERRED_TO_WAREHOUSE', 'order', ticket.orderId, { returnId: ticket.id, productName: ticket.productName, kg: ticket.kg }, ctx);
  store.save();
  return ticket;
}
function receiveReturnAtWarehouse(user, ticket, ctx) {
  if (ticket.status !== 'AT_WAREHOUSE') fail(409, 'این مرجوعی هنوز به انبار ارجاع نشده است.');
  Object.assign(ticket, { status: 'RECEIVED', warehouseReceivedAt: store.nowIso(), warehouseReceivedBy: user.username });
  store.audit(user, 'RETURN_RECEIVED', 'order', ticket.orderId, { returnId: ticket.id, productName: ticket.productName, kg: ticket.kg }, ctx);
  store.save();
  return ticket;
}

// ---------- نمای سفارش برای فهرست‌ها (بدون تصویر امضا) ----------
function publicOrder(o) {
  const e = enrichOrder(o);
  const { signatureData, ...dispatch } = o.dispatch || {};
  // v37.17.0 — نمای هر محموله فقط اقلام همان سرویس را با وزن همان سرویس نشان می‌دهد؛
  // وزن کل قلم (مجموع دو سرویس) هرگز نباید داخل سند/فرم یک سرویس دیده شود.
  let items = e.items;
  if (Array.isArray(dispatch.shipmentItemIds) && dispatch.shipmentItemIds.length) {
    const ids = new Set(dispatch.shipmentItemIds);
    const weights = dispatch.shipmentWeights || {};
    items = items.filter((i) => ids.has(i.id)).map((i) => ({ ...i, deliveredKg: Number(weights[i.id] ?? i.deliveredKg ?? 0) }));
  }
  return { ...e, items, dispatch: { ...dispatch, hasSignature: !!signatureData } };
}

// ---------- سوابق یک راننده (یا همه) در بازه‌ی تاریخی، گروه‌بندی‌شده به روز ----------
function driverRecords({ driverId, from, to, settlement, kind }) {
  const db = store.get();
  const views = db.orders.flatMap((o) => dispatchViews(o)); // v37.5.0 — سرویس‌های فروشگاه هر یک پروندهٔ خاص خود
  const delivered = views.filter((v) => ['DELIVERED', 'SALES_FINALIZED', 'CLOSED'].includes(v.dispatch.status)
    && (!driverId || v.dispatch.driverId === driverId));
  const rows = [];
  for (const v of delivered) {
    const o = { ...v.order, dispatch: v.dispatch }; // شیم نمای همان خدمه‌بر
    const day = localDay(o.dispatch.deliveredAt);
    if (from && day < from) continue;
    if (to && day > to) continue;
    if (settlement && o.dispatch.settlementType !== settlement) continue;
    const lines = o.dispatch.lines || [];
    const hasReturn = lines.some((l) => l.returnKg > 0);
    const hasShort = lines.some((l) => l.shortageKg > 0);
    if (kind === 'return' && !hasReturn) continue;
    if (kind === 'shortage' && !hasShort) continue;
    const sum = (k) => +lines.reduce((s, l) => s + Number(l[k] || 0), 0).toFixed(3);
    rows.push({
      orderId: o.id, orderNo: o.orderNo || '—', run: v.dispatch.run || null, // v37.5.0
      day, deliveredAt: o.dispatch.deliveredAt,
      driverId: o.dispatch.driverId, driverName: o.dispatch.driverName, driverPlate: o.dispatch.driverPlate,
      customerName: o.orderType === 'STORE' ? (require('./store-name').storeDisplayName(o.storeName,o.branchNo)) : (o.customer?.name || o.storeName || '—'), customerPhone: o.orderType === 'STORE' ? '' : (o.customer?.phone || ''),
      settlementType: o.dispatch.settlementType, hasReturn, hasShort, lines, note: o.dispatch.note || '',
      totalKg: sum('deliveredKg'), returnKg: sum('returnKg'), shortageKg: sum('shortageKg'), netKg: sum('netKg'),
      deliveredBy: o.dispatch.deliveredBy, hasSignature: !!o.dispatch.signatureData,
    });
  }
  rows.sort((a, b) => (a.deliveredAt < b.deliveredAt ? 1 : -1));
  const groups = new Map();
  const zero = () => ({ count: 0, totalKg: 0, returnKg: 0, shortageKg: 0, netKg: 0 });
  const add = (t, r) => ({ count: t.count + 1, totalKg: +(t.totalKg + r.totalKg).toFixed(3), returnKg: +(t.returnKg + r.returnKg).toFixed(3),
    shortageKg: +(t.shortageKg + r.shortageKg).toFixed(3), netKg: +(t.netKg + r.netKg).toFixed(3) });
  for (const r of rows) {
    if (!groups.has(r.day)) groups.set(r.day, { day: r.day, deliveries: [], totals: zero() });
    const g = groups.get(r.day);
    g.deliveries.push(r);
    g.totals = add(g.totals, r);
  }
  const days = [...groups.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  const totals = rows.reduce(add, zero());
  return { days, totals };
}

function driverHasAnyOrders(driverId) {
  return store.get().orders.some((o) => o.dispatch && o.dispatch.driverId === driverId);
}

module.exports = {
  DISPATCH_STATUS, RETURN_STATUS, SETTLEMENT_TYPES, OPEN_STATUSES, localDay, todayKey, num, cleanDelivery,
  sendToDispatch, assignDriver, gateExit, gateFinalExit, salesFinalizeDelivery, driverExit, completeDelivery, findDispatchOrder, findDriverOrder,
  driverOwns, publicOrder, driverRecords, returnDeduction, applyReturnToInvoice, driverHasAnyOrders, activeDriver, findReturn, dispatchViews,
  referReturnToWarehouse, receiveReturnAtWarehouse,
};
