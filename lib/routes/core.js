'use strict';
// مسیرهای عمومی کارتابل‌ها: اعلان‌ها، شمارنده‌ها، داشبورد، کالاها، قیمت‌ها، مشتریان، مراجعه‌ها و گزارش‌ها
const { atomicRoute: route, fail, normalizeRole } = require('../http');
const store = require('../store');
const repo = require('../sql-repos');
const validate = require('../validate');
const { today, localDayOf, getProduct, enrichOrder, activateDueRemoteOrders, normalizePlate, createNotification } = require('../domain');
const isGateExitAvailable = require('../gate-exit-availability');

const roleOf = (u) => normalizeRole(u.roleCode);
const isNotifForUser = (n, user) => roleOf(user) === 'admin' ||
  (normalizeRole(n.targetRole) === roleOf(user) && (!n.targetUserId || n.targetUserId === user.id) && (!n.targetDriverId || n.targetDriverId === user.driverId));
// Map each recorded event to one menu, independently of the current queue count.
function notificationSection(n) {
  const role = normalizeRole(n.targetRole), order = n.entityType === 'order' ? store.get().orders.find(o => o.id === n.entityId) : null;
  if (role === 'sales') {
    if (n.type === 'NEW_VISIT') return store.get().visits.find(v => v.id === n.entityId)?.status === 'WAITING_SALES' ? 'onsite' : null;
    if (['STORE_RUN_R1_SENT','STORE_RUN_R2_SENT'].includes(n.type)) { const shipment=n.type==='STORE_RUN_R1_SENT'?order?.storeRunOps?.r1Shipment:order?.storeRunOps?.r2Shipment; return shipment?.status==='PENDING_SALES'?'stores':null; }
    if (n.type==='STORE_ADDITION_RESULT') return order?.orderType==='STORE'?'stores':null;
    if (n.type==='STORE_ADDITION_REQUESTED') return (order?.storeAdditionRequests||[]).some(r=>r.status==='PENDING_SALES'&&r.id===n.requestId)?'stores':null;
    if (n.type==='STORE_CANCELLATION_REQUESTED') return (order?.storeCancellationRequests||[]).some(r=>r.status==='PENDING')?'stores':null;
    if (['STORE_ORDER_PENDING','STORE_ORDER_APPROVED'].includes(n.type)) return order?.orderType==='STORE'?'stores':null;
    if (n.type === 'PICKUP_CANCELLATION_REQUESTED') return order?.pickupCancellation?.status==='PENDING_SALES' ? (order.status==='SCHEDULED_REMOTE'?'future':'flow') : null;
    if (n.type === 'RETURN_FROM_WAREHOUSE') return order?.status === 'RETURNED_TO_SALES' ? (order.orderType === 'STORE' ? 'stores' : 'flow') : null;
    if (n.type === 'WAREHOUSE_DONE') return order?.orderType === 'STORE' ? 'stores' : order?.status !== 'SETTLEMENT_PENDING' ? null : ['DELIVERED','SALES_FINALIZED','CLOSED'].includes(order?.dispatch?.status) || (order?.transportWorkflow === 1 && order?.deliveryMode === 'DELIVERY' && order?.transportInvoice) ? 'delivery' : 'settlement';
    if (n.type === 'TRANSPORT_ASSIGNED') return order?.orderType === 'STORE' ? 'stores' : order?.status === 'SETTLEMENT_PENDING' ? (order?.transportWorkflow === 1 && order?.deliveryMode === 'DELIVERY' && order?.transportInvoice ? 'delivery' : 'settlement') : order?.status === 'CLOSED' ? 'delivery' : 'flow';
    if (n.type === 'TRANSPORT_WAREHOUSE_HANDOVER') return order?.orderType === 'STORE' ? 'stores' : order?.transportWorkflow === 1 && order?.deliveryMode === 'DELIVERY' && order?.transportInvoice ? 'delivery' : 'settlement';
    if (n.type === 'TRANSPORT_DEPARTED') return 'delivery';
    if (['DISPATCH_DELIVERY_PENDING_SALES','DISPATCH_RETURN','STORE_RECEIPT_CONFIRMED'].includes(n.type)) return 'delivery';
    return 'dashboard';
  }
  if (role === 'warehouse') {
    if (n.type === 'STORE_ADDITION_APPROVED') return ['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(order?.status) && (order?.storeAdditionRequests||[]).some(r=>r.status==='PENDING_WAREHOUSE'&&r.id===n.requestId) ? 'stores' : null;
    if (n.type === 'SETTLEMENT_CANCELLATION_REQUESTED') return order?.status==='CANCEL_RETURN_PENDING'?'incoming':null;
    if (n.type === 'WAREHOUSE_DOCUMENT_EDIT_REQUESTED') return (order?.documentEdits||[]).some(edit=>edit.status==='PENDING_WAREHOUSE')?'document-edits':null;
    if (n.type === 'RETURN_TO_WAREHOUSE') return 'returns';
    if (n.type === 'PICKUP_ENTRY' && (!order?.visitId || order.pickupCancellation || order.pickupHandover)) return null;
    if (n.type === 'PICKUP_ENTRY' && ['SCHEDULED_REMOTE','RETURNED_TO_SALES'].includes(order.status)) return 'incoming';
    if (!order || !['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','SETTLEMENT_PENDING'].includes(order.status)) return null;
    if (order.orderType === 'STORE') return order.status==='SETTLEMENT_PENDING'||order.storeRunOps?.finalizedAt ? null : 'stores';
    if (n.type === 'TRANSPORT_ASSIGNED' && order?.status === 'SETTLEMENT_PENDING') return 'delivered';
    if (n.type === 'TRANSPORT_ASSIGNED' && order?.status === 'WAREHOUSE_PREPARING') return 'preparing';
    if (order.status === 'WAREHOUSE_PENDING') return 'incoming';
    if (order.status === 'WAREHOUSE_PREPARING') return 'preparing';
    return order.warehouseCompletedAt && (order.deliveryMode !== 'DELIVERY' || order.transportAssignments?.['0']?.driverName || order.transportHandovers?.['0']) ? 'delivered' : null;
  }
  if (role === 'gate') {
    if (n.type === 'ONSITE_CANCELLATION_EXIT') return store.get().visits.find(v=>v.id===n.entityId)?.status==='CANCELLED_EXIT_PENDING'?'exit':null;
    if (n.type === 'PICKUP_CANCELLATION_APPROVED') return order?.pickupCancellation?.status==='EXIT_APPROVED' ? 'exit' : null;
    if (n.type === 'SETTLEMENT_DONE') return order?.status === 'SETTLED' && !order.dispatch ? 'exit' : null;
    if (n.type === 'STORE_TRANSPORT_EXIT_READY') return order?.transportStoreReviews?.[String(n.run)] && !order?.transportStoreTrips?.[String(n.run)] ? 'dispatch' : null;
    if (n.type === 'DISPATCH_DRIVER_EXIT_PENDING') return order?.dispatch?.status === 'DRIVER_EXIT_REPORTED' ? 'dispatch' : null;
    return null;
  }
  if (role === 'store') return n.type === 'STORE_DELIVERY_UPDATE' ? 'delivery' : 'registered';
  if (role === 'driver') return 'dashboard';
  if (role === 'dispatch') return order && !['CLOSED','CANCELLED','EXITED'].includes(order.status) ? 'orders' : null;
  return 'dashboard';
}
// Legacy records already marked read stay read. New acknowledgements belong to the
// current account, so a manager cannot silence the same alert for a unit user.
const notifReadFor = (n, user) => n.isRead === true || (Array.isArray(n.readBy) && n.readBy.includes(user.id));

// ---------- اعلان‌ها ----------
function notificationSnapshot(user) {
  const all = store.get().notifications.filter((n) => isNotifForUser(n, user));
  const pending = all.filter(n => !notifReadFor(n, user));
  // Keep every unread item reachable even when more than 80 notifications exist.
  const recent = all.filter(n => notifReadFor(n, user)).slice(0, Math.max(0, 80 - pending.length));
  const list = [...pending, ...recent].map(n => { const { readBy, ...safe } = n; return { ...safe, message: ['STORE_RUN_R1_SENT','STORE_RUN_R2_SENT'].includes(safe.type) && typeof safe.message === 'string' ? safe.message.replace(/\(باب[ُ]?ل تویور(?=[،)])/g, '(بابل طیور') : safe.message, isRead: notifReadFor(n, user), navSection: notificationSection(n) }; });
  return { notifications: list, unread: pending.length };
}
route('GET', '/api/notifications', {}, (ctx) => ({ status: 200, body: notificationSnapshot(ctx.user) }));

route('POST', '/api/notifications/read', {}, (ctx) => {
  if (Object.hasOwn(ctx.body,'id') && (typeof ctx.body.id !== 'string' || !ctx.body.id || ctx.body.id.length>200)) fail(400, 'شناسه اعلان معتبر نیست.');
  if (Object.hasOwn(ctx.body,'id') && Object.hasOwn(ctx.body,'ids')) fail(400, 'فقط یک روش انتخاب اعلان مجاز است.');
  const id = ctx.body.id || null;
  let ids = null;
  if (Object.hasOwn(ctx.body, 'ids')) {
    if (!Array.isArray(ctx.body.ids) || ctx.body.ids.length > 5000 || ctx.body.ids.some(x => typeof x !== 'string' || !x || x.length > 200)) fail(400, 'فهرست اعلان‌ها معتبر نیست.');
    ids = new Set(ctx.body.ids);
  }
  for (const n of store.get().notifications) {
    if (isNotifForUser(n, ctx.user) && (ids ? ids.has(n.id) : (!id || n.id === id)) && !notifReadFor(n, ctx.user)) {
      n.readBy = [...(Array.isArray(n.readBy) ? n.readBy : []), ctx.user.id];
    }
  }
  store.save();
  return { status: 200, body: { ok: true, ...notificationSnapshot(ctx.user) } };
});

// ---------- شمارنده‌های هر کارتابل ----------
route('GET', '/api/workload', {}, (ctx) => {
  activateDueRemoteOrders();
  const db = store.get();
  const role = roleOf(ctx.user);
  const count = (fn) => db.orders.filter(fn).length;
  const unread = db.notifications.filter((n) => isNotifForUser(n, ctx.user) && !notifReadFor(n, ctx.user)).length;
  const counts = { notifications: unread };
  const gateEntry = db.visits.filter((v) => v.status === 'WAITING_SALES').length;
  const gateExit = count((o) => (o.status === 'SETTLED' && !o.dispatch) || o.pickupCancellation?.status === 'EXIT_APPROVED') + db.visits.filter(v=>v.status==='CANCELLED_EXIT_PENDING').length;
  const salesOrders = count((o) => o.status === 'RETURNED_TO_SALES');
  // v37.6.1 — سفارش پخش تا چاپ برگهٔ ارسال در صف تسویه است؛ بعد از چاپ «صادرشده» می‌شود.
  const settlementItems = new Map();
  for (const item of db.orderItems) if (item.itemStatus !== 'CANCELLED') {
    const list=settlementItems.get(item.orderId)||[];list.push(item);settlementItems.set(item.orderId,list);
  }
  const noGoodsLegacy = o => { const items=settlementItems.get(o.id)||[]; return !o.transportInvoice&&items.length>0&&items.every(i=>i.itemStatus==='OUT_OF_STOCK'&&i.warehouseStatus==='OUT_OF_STOCK'&&i.deliveredKg!=null&&Number(i.deliveredKg)===0); };
  const salesSettlement = count((o) => o.orderType !== 'STORE' && o.status === 'SETTLEMENT_PENDING' && !noGoodsLegacy(o) && !(o.transportInvoice && (o.transportInvoice.status === 'CLOSED' || o.transportInvoice.printedAt)) && !['DELIVERED','SALES_FINALIZED','CLOSED'].includes(o.dispatch?.status));
  const dispatchPending = count((o) => o.dispatch?.status === 'PENDING_ASSIGN') + require('../transport-planning').pendingWork(db);
  const gateDispatchPending = count((o) => o.dispatch?.status === 'DRIVER_EXIT_REPORTED'||(o.orderType!=='STORE'&&o.transportWorkflow===1&&o.deliveryMode==='DELIVERY'&&o.status==='SETTLEMENT_PENDING'&&o.transportInvoice?.status==='PREPARED'&&o.transportHandovers?.['0']&&!o.transportDeparture)) + db.orders.reduce((n,o)=>n+(o.orderType==='STORE'&&o.transportWorkflow===1&&o.status==='WAREHOUSE_PREPARING'?require('../store-order-kind').allowedRuns(o).filter(run=>o.transportStoreReviews?.[String(run)]&&o.transportHandovers?.[String(run)]&&!o.transportStoreTrips?.[String(run)]).length:0),0);
  // These are work counts, not unread alerts. Include each actual store service.
  const deliveryViews = db.orders.flatMap(o => require('../dispatch').dispatchViews(o));
  const transportViews = db.orders.filter(o => o.transportWorkflow === 1).flatMap(o => require('../transport-sales-views').salesTransportViews(o));
  const salesDeliveryActive = deliveryViews.filter(v => ['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status)).length + transportViews.filter(v => ['assigned','inTransit'].includes(v.transportService.section)).length;
  const salesDeliveryPending = deliveryViews.filter(v => v.dispatch.status === 'DELIVERED').length + transportViews.filter(v => v.transportService.section === 'delivered').length;
  const pickupEarly = require('../pickup-feature').enabled() ? count(o=>o.orderType==='REMOTE' && o.deliveryMode==='PICKUP' && ['SCHEDULED_REMOTE','RETURNED_TO_SALES'].includes(o.status) && !o.pickupCancellation && db.visits.some(v=>v.id===o.visitId && v.orderId===o.id && v.status==='PICKUP_PRESENT')) : 0;
  const cancellationReturns = count(o=>o.status==='CANCEL_RETURN_PENDING'&&o.settlementCancellation?.status==='PENDING_WAREHOUSE');
  const warehousePending = count((o) => ['WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING'].includes(o.status)) + pickupEarly + cancellationReturns;
  const warehouseIncoming = count((o) => o.status === 'WAREHOUSE_PENDING') + pickupEarly + cancellationReturns;
  const warehousePreparing = count((o) => o.status === 'WAREHOUSE_PREPARING');
  // v37.6.0 — تفکیک فروشگاه‌ها از رفتارهای انبار برای کارت‌های مستقل
  const warehouseIncomingRegular = count((o) => o.status === 'WAREHOUSE_PENDING' && o.orderType !== 'STORE') + pickupEarly + cancellationReturns;
  const warehousePreparingRegular = count((o) => o.status === 'WAREHOUSE_PREPARING' && o.orderType !== 'STORE');
  const warehouseStores = count((o) => o.orderType === 'STORE' && (o.status === 'WAREHOUSE_PENDING' || (o.status === 'WAREHOUSE_PREPARING' && !(o.storeRunOps && o.storeRunOps.finalizedAt)))); // v37.19.0 — پایان‌یافتهٔ انبار شمرده نمی‌شود
  const salesFlowRegular = count((o) => o.orderType !== 'STORE' && ['WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING', 'RETURNED_TO_SALES'].includes(o.status));
  const remoteScheduled = count((o) => o.orderType === 'REMOTE' && ['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES','SETTLEMENT_PENDING'].includes(o.status));
  const futureScheduled = count((o) => o.orderType === 'REMOTE' && o.status === 'SCHEDULED_REMOTE');
  const storePending = count((o) => o.orderType === 'STORE' && o.status === 'STORE_PENDING_SALES');
  const storeScheduled = count((o) => o.orderType === 'STORE' && o.status === 'SCHEDULED_REMOTE');
  if (role === 'admin') {
    Object.assign(counts, { gateEntry, gateExit, gateDispatchPending, salesDeliveryActive, salesDeliveryPending, salesIntake: gateEntry, salesOrders, salesSettlement, salesRemote: remoteScheduled, store: storePending, storeScheduled, salesFlow: salesFlowRegular, salesFuture: futureScheduled, warehouse: warehousePending, warehouseIncoming, warehousePreparing, dispatchPending, warehouseIncomingRegular, warehousePreparingRegular, warehouseStores });
  } else if (role === 'gate') {
    Object.assign(counts, { gateEntry, gateExit, gateDispatchPending, visitsTotal: db.visits.length });
  } else if (role === 'sales') {
    Object.assign(counts, { salesIntake: gateEntry, salesOrders, salesSettlement, salesRemote: remoteScheduled, store: storePending, storeScheduled, salesFlow: salesFlowRegular, salesFuture: futureScheduled, salesDeliveryActive, salesDeliveryPending });
  } else if (role === 'dispatch') {
    counts.dispatchPending = dispatchPending;
  } else if (role === 'warehouse') {
    Object.assign(counts, { warehouse: warehousePending, warehouseIncoming, warehousePreparing, warehouseIncomingRegular, warehousePreparingRegular, warehouseStores, visitsTotal: db.visits.length });
  } else if (role === 'store') {
    counts.store = count(o => o.orderType === 'STORE' && o.storeId === ctx.user.id && o.status === 'STORE_PENDING_SALES');
  } else if (role === 'driver' && ctx.user.driverId) {
    const views = db.orders.flatMap(o => require('../dispatch').dispatchViews(o));
    counts.driverOpen = views.filter(v => v.dispatch.driverId === ctx.user.driverId && ['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status)).length;
  }
  return { status: 200, body: { counts } };
});

route('GET', '/api/dashboard', { roles: ['admin'] }, () => {
  activateDueRemoteOrders();
  const db = store.get();
  // فاز ۲: یک پرسوجوی تجمیعی SQL بهجای هفت پیمایش روی آرایههای درون حافظه.
  const counts = repo.dashboardCounts(today());
  const recent = db.orders.slice(-8).reverse().map(enrichOrder);
  return { status: 200, body: { counts, recent } };
});

// ---------- v37.3.5 — نمودارهای داشبورد مدیریت به تفکیک محصول ----------
// ۱) فروش: فاکتورهای تسویه‌شده در بازه (مبلغ خالص پس از کسر مرجوعی پخش + وزن خالص)
// ۲) سفارش‌ها: سفارش‌های ثبت‌شده در بازه (به‌جز لغوشده) — تعداد سفارش و مقدار درخواستی
// ۳) تحویل انبار: اقلامی که وزن نهایی‌شان در بازه در انبار ثبت شد (کیلوگرم) + ناموجودی
const DASH_DAYS = [1, 7, 30, 90];
function dashKey(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
route('GET', '/api/dashboard/products', { roles: ['admin'] }, (ctx) => {
  const db = store.get();
  let days = Number(ctx.query.get('days')) || 30;
  if (!DASH_DAYS.includes(days)) days = 30;
  const to = today();
  const start = new Date(); start.setDate(start.getDate() - (days - 1));
  const from = dashKey(start);
  const inRange = (iso) => { if (!iso) return false; const d = dashKey(new Date(iso)); return d >= from && d <= to; };
  const itemsOf = (orderId) => db.orderItems.filter((i) => i.orderId === orderId);
  const bucket = (map, productId, init) => {
    if (!map.has(productId)) { const pr = getProduct(productId); map.set(productId, { productId, productName: pr?.name || 'کالای حذف‌شده', quickCode: pr?.quickCode || '', ...init }); }
    return map.get(productId);
  };
  const r3 = (n) => +Number(n || 0).toFixed(3);

  // ۱) فروش
  const sales = new Map(), salesOrderIds = new Map(); let invoices = 0;
  for (const pay of db.payments) {
    if (!inRange(pay.verifiedAt || pay.createdAt)) continue;
    const order = db.orders.find((o) => o.id === pay.orderId);
    if (!order || order.status === 'CANCELLED') continue;
    invoices += 1;
    const orderItems = itemsOf(order.id);
    const addSale = (item, amount, kg) => {
      if (!item || (amount <= 0 && kg <= 0)) return;
      const b = bucket(sales, item.productId, { amount: 0, kg: 0, orders: 0 });
      b.amount += amount; b.kg = r3(b.kg + kg);
      if (!salesOrderIds.has(item.productId)) salesOrderIds.set(item.productId, new Set());
      const seen = salesOrderIds.get(item.productId);
      if (!seen.has(order.id)) { b.orders += 1; seen.add(order.id); }
    };
    if (order.orderType === 'STORE' && (pay.deliveryRun === 1 || pay.deliveryRun === 2)) {
      // Each store service has its own immutable invoice lines; item.deliveredKg is
      // the combined warehouse weight and would double-count both invoices.
      if (Array.isArray(pay.priceLines) && pay.priceLines.length) {
        for (const line of pay.priceLines) {
          const item = orderItems.find(i => i.id === line.itemId);
          addSale(item, Math.max(0, Number(line.amount || 0)), Math.max(0, Number(line.deliveredKg || 0)));
        }
      } else {
        // Older run invoices may not have line snapshots. Use only this run's
        // recorded weights and delivery, never the combined weight of the order.
        const run = pay.deliveryRun, sr = require('../store-runs');
        const dispatch = [...(Array.isArray(order.dispatches) ? order.dispatches : []), order.dispatch].find(d => d && d.run === run);
        for (const item of orderItems) {
          const line = (dispatch?.lines || []).find(l => l.itemId === item.id);
          const weight = Number(dispatch?.shipmentWeights?.[item.id] ?? (run === 1 ? sr.r1Kg(item) : sr.r2Kg(item)));
          if (!(weight > 0)) continue;
          const kg = Math.max(0, weight - Number(line?.returnKg || 0) - Number(line?.shortageKg || 0));
          addSale(item, 0, kg);
        }
      }
      continue;
    }
    const lines = new Map((order.dispatch?.lines || []).map((l) => [l.itemId, l]));
    for (const it of orderItems) {
      if (it.itemStatus === 'CANCELLED' || it.itemStatus === 'OUT_OF_STOCK') continue;
      const gross = Number(it.finalAmount ?? Math.round(Number(it.deliveredKg || 0) * Number(it.unitPrice || 0))) || 0;
      const l = lines.get(it.id);
      const amount = Math.max(0, gross - Number(l?.returnAmount || 0));
      const kg = Math.max(0, Number(it.deliveredKg || 0) - Number(l?.returnKg || 0) - Number(l?.shortageKg || 0));
      addSale(it, amount, kg);
    }
  }
  // ۲) سفارش‌ها
  const orders = new Map(); let orderCount = 0;
  for (const o of db.orders) {
    if (o.status === 'CANCELLED' || !inRange(o.createdAt)) continue;
    orderCount += 1;
    const seen = new Set();
    for (const it of itemsOf(o.id)) {
      if (it.itemStatus === 'CANCELLED') continue;
      const b = bucket(orders, it.productId, { orders: 0, lines: 0, units: {} });
      b.lines += 1;
      const u = it.requestedUnit || 'کیلوگرم';
      b.units[u] = r3((b.units[u] || 0) + Number(it.requestedQty || 0));
      if (!seen.has(it.productId)) { b.orders += 1; seen.add(it.productId); }
    }
  }
  // ۳) تحویل انبار
  const wh = new Map(); let whOrders = 0;
  for (const o of db.orders) {
    if (!o.warehouseCompletedAt || !inRange(o.warehouseCompletedAt)) continue;
    whOrders += 1;
    const seen = new Set();
    for (const it of itemsOf(o.id)) {
      const oos = (it.warehouseStatus || it.itemStatus) === 'OUT_OF_STOCK';
      const kg = Number(it.deliveredKg || 0);
      if (!oos && !(kg > 0)) continue;
      const b = bucket(wh, it.productId, { kg: 0, orders: 0, outOfStock: 0 });
      if (oos) b.outOfStock += 1; else b.kg = r3(b.kg + kg);
      if (!oos && !seen.has(it.productId)) { b.orders += 1; seen.add(it.productId); }
    }
  }
  const sortBy = (map, k) => [...map.values()].sort((a, b) => b[k] - a[k] || a.productName.localeCompare(b.productName, 'fa'));
  const salesRows = sortBy(sales, 'amount');
  const orderRows = sortBy(orders, 'orders');
  const whRows = sortBy(wh, 'kg');
  return {
    status: 200,
    body: {
      days, from, to,
      sales: { rows: salesRows, totalAmount: salesRows.reduce((t, x) => t + x.amount, 0), totalKg: r3(salesRows.reduce((t, x) => t + x.kg, 0)), invoices },
      orders: { rows: orderRows, totalOrders: orderCount, totalLines: orderRows.reduce((t, x) => t + x.lines, 0) },
      warehouse: { rows: whRows, totalKg: r3(whRows.reduce((t, x) => t + x.kg, 0)), orders: whOrders, outOfStock: whRows.reduce((t, x) => t + x.outOfStock, 0) },
    },
  };
});

// ---------- کالاها ----------
route('GET', '/api/products', { roles: ['admin', 'sales', 'warehouse', 'store'] }, () => ({
  status: 200, body: { products: repo.repos.products.select('is_active = 1') },
}));

route('GET', '/api/products/search', { roles: ['admin', 'sales', 'warehouse', 'store'] }, (ctx) => {
  const q = String(ctx.query.get('q') || '').trim().toLowerCase().slice(0, 80);
  if (!q) return { status: 200, body: { products: [] } };
  const products = store.get().products.filter((x) => x.isActive && (x.name.toLowerCase().includes(q) || x.quickCode === q)).slice(0, 15);
  return { status: 200, body: { products } };
});

route('GET', '/api/prices', { roles: ['admin', 'sales'] }, (ctx) => {
  const d = validate.digitsToAscii(ctx.query.get('date') || today()).slice(0, 10);
  const prices = [...require('../product-prices').effectivePrices(store.get().priceList,d).values()].map((x) => ({ ...x, product: getProduct(x.productId) }));
  return { status: 200, body: { prices } };
});

route('POST', '/api/admin/prices', { roles: ['admin', 'sales'], idempotent: true }, (ctx) => {
  const db = store.get();
  const b = ctx.body;
  const product = getProduct(String(b.productId || ''));
  if (!product) fail(404, 'کالا یافت نشد.');
  const price = validate.number(b.price, { field: 'قیمت', min: 0, max: validate.MAX_MONEY });
  const date = validate.digitsToAscii(b.date || today()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'تاریخ قیمت معتبر نیست.');
  db.priceList = db.priceList.filter((x) => !(x.productId === product.id && x.date === date));
  const item = { id: store.uid(), productId: product.id, price, date };
  db.priceList.push(item);
  store.audit(ctx.user, 'SET_PRICE', 'price', item.id, { productId: product.id, quickCode: product.quickCode, price, date }, ctx);
  store.save();
  return { status: 201, body: { price: item } };
});

// ---------- مشتریان ----------
route('GET', '/api/customers/search', { roles: ['admin', 'gate', 'sales'] }, (ctx) => {
  const qRaw = String(ctx.query.get('q') || '').trim().slice(0, 80);
  const q = normalizePlate(qRaw);
  if (!q) return { status: 200, body: { customers: [] } };
  const customerCore = require('../customer-core');
  const codeQ = customerCore.normalizeCode(qRaw), phoneQ = customerCore.phoneKey(qRaw);
  const customers = store.get().customers
    .filter((c) => normalizePlate(c.plate || '').includes(q) || normalizePlate(c.name || '').includes(q) || [c.phone, c.phone2].some(p => phoneQ && customerCore.phoneKey(p).includes(phoneQ)) || (codeQ && String(c.code || '').toUpperCase().includes(codeQ)) || (/^(?:c-?)?\d+$/i.test(q) && String(c.code || '').includes(q.replace(/^c-?/i,''))))
    .slice(-20).reverse();
  return { status: 200, body: { customers } };
});

// ---------- مراجعه‌ها (ورودی نگهبانی) ----------
route('POST', '/api/visits', { roles: ['gate'], idempotent: true }, (ctx) => {
  const db = store.get();
  const b = ctx.body;
  const name = validate.text(b.name, { field: 'نام مشتری', max: 120, required: true });
  const phone = validate.phone(b.phone);
  const vehicleType = validate.text(b.noVehicle === true ? 'بدون وسیله' : (b.vehicleType || 'خودرو'), { field: 'نوع وسیله', max: 40 });
  const carType = b.noVehicle === true || vehicleType === 'موتورسیکلت' ? '' : (Object.prototype.hasOwnProperty.call(b,'carType') ? validate.text(b.carType, { field: 'نوع خودرو', max: 80 }) : undefined);
  const plate = b.noVehicle === true ? validate.gatePlate(b.plate, true) : validate.driverPlate(b.plate, vehicleType);
  const district = validate.text(b.district, { field: 'منطقه', max: 100 });
  const purpose = validate.text(b.purpose, { field: 'هدف مراجعه', max: 250 });

  // مشتری قبلی با کد مشتری، شماره تماس یا پلاک پیدا می‌شود؛ پرونده‌ی تکراری ساخته نمی‌شود
  const customer = require('../customers').upsertCustomer(db, {
    customerId: b.customerId, customerCode: b.customerCode, name, phone, plate, vehicleType, carType, district,
  });
  const visit = { id: store.uid(), customerId: customer.id, plate, vehicleType, carType: carType ?? customer.carType ?? '', district, purpose, status: 'WAITING_SALES', createdBy: ctx.user.id, createdAt: store.nowIso() };
  db.visits.push(visit);
  createNotification('sales', 'NEW_VISIT', 'visit', visit.id, `مشتری ${customer.name} وارد شد و منتظر ثبت سفارش است.`);
  store.audit(ctx.user, 'CREATE_VISIT', 'visit', visit.id, { customerId: customer.id, plate }, ctx);
  store.save();
  return { status: 201, body: { visit, enriched: { visit, customer } } };
});

// Sales may cancel a visit before ordering or an onsite order before any handover.
// These synchronous atomic routes serialize against order submission and warehouse writes.
route('POST', '/api/visits/:id/cancel-onsite', { roles: ['sales'], idempotent: true }, (ctx) => {
  const db=store.get(), visit=db.visits.find(v=>v.id===ctx.params.id);
  if(!visit) fail(404,'مراجعه یافت نشد.');
  if(!['WAITING_SALES','ORDERED'].includes(visit.status)) fail(409,'این مراجعه دیگر قابل لغو نیست.');
  const reason=validate.text(ctx.body.reason,{field:'دلیل لغو',max:300,required:true});
  if(ctx.body.confirmedNoGoods!==true) fail(400,'تأیید عدم تحویل کالا الزامی است.');
  const orders=db.orders.filter(o=>o.visitId===visit.id);
  let order=null;
  if(visit.status==='WAITING_SALES') {
    if(orders.length) fail(409,'برای این مراجعه سفارش ثبت شده است؛ ابتدا وضعیت آن بررسی شود.');
  } else {
    if(orders.length!==1||orders[0].orderType!=='ONSITE'||(visit.orderId&&visit.orderId!==orders[0].id)) fail(409,'سفارش مرتبط با مراجعه قابل تشخیص نیست.');
    order=orders[0];
    const items=db.orderItems.filter(i=>i.orderId===order.id);
    if(!['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(order.status)||order.warehouseCompletedAt||order.warehouseDocumentNo||order.warehouseHandover||order.transportInvoice||order.deposit||order.payment||order.pickupHandover||order.dispatch||order.transportDeparture||Object.keys(order.transportHandovers||{}).length||db.payments.some(p=>p.orderId===order.id)||!items.length||items.some(i=>i.deliveredKg!=null&&( !Number.isFinite(Number(i.deliveredKg)) || Number(i.deliveredKg)!==0)||['DELIVERED','OUT_OF_STOCK'].includes(i.itemStatus)||['DELIVERED','OUT_OF_STOCK'].includes(i.warehouseStatus))||db.audit.some(a=>a.entityType==='order'&&a.entityId===order.id&&(['WAREHOUSE_PHYSICAL_HANDOVER','PICKUP_PHYSICAL_HANDOVER','TRANSPORT_WAREHOUSE_HANDOVER'].includes(a.action)||(a.action==='WAREHOUSE_FINALIZE'&&!require('../no-goods-audit')(order,a))))) fail(409,'این سفارش تحویل یا تسویه شده یا وضعیت آن نیاز به بررسی دارد؛ لغو از این مسیر مجاز نیست.');
    const now=store.nowIso();order.status='CANCELLED';order.cancelReason=reason;order.cancelledAt=now;order.cancelledBy=ctx.user.id;order.updatedAt=now;
    store.audit(ctx.user,'CANCEL_ONSITE_ORDER','order',order.id,{visitId:visit.id,orderNo:order.orderNo,reason},ctx);
    createNotification('warehouse','ONSITE_ORDER_CANCELLED','order',order.id,`سفارش حضوری ${order.orderNo} توسط فروش لغو شد؛ آماده‌سازی متوقف شود.`);
  }
  const now=store.nowIso();visit.status='CANCELLED_EXIT_PENDING';visit.onsiteCancellation={reason,orderId:order?.id||null,status:'EXIT_PENDING',cancelledAt:now,cancelledBy:ctx.user.id};
  store.audit(ctx.user,'CANCEL_ONSITE_VISIT','visit',visit.id,{orderId:order?.id||null,reason},ctx);
  createNotification('gate','ONSITE_CANCELLATION_EXIT','visit',visit.id,'مراجعهٔ حضوری لغو شد؛ خروج بدون کالا را کنترل و ثبت کنید.');
  store.save();return {body:{visitId:visit.id,orderId:order?.id||null,status:visit.status}};
});
route('POST', '/api/visits/:id/cancelled-exit', { roles: ['gate'], idempotent: true }, (ctx) => {
  const db=store.get(),visit=db.visits.find(v=>v.id===ctx.params.id);
  if(!visit) fail(404,'مراجعه یافت نشد.');
  if(visit.status!=='CANCELLED_EXIT_PENDING'||visit.onsiteCancellation?.status!=='EXIT_PENDING') fail(409,'این مراجعه در انتظار خروج بدون کالا نیست.');
  if(ctx.body.confirmedNoGoods!==true) fail(400,'ابتدا خروج بدون کالا را کنترل و تأیید کنید.');
  const orderId=visit.onsiteCancellation.orderId;
  if(orderId && !db.orders.some(o=>o.id===orderId&&o.visitId===visit.id&&o.orderType==='ONSITE'&&o.status==='CANCELLED')) fail(409,'وضعیت سفارش لغوشده نیاز به بررسی دارد.');
  const now=store.nowIso();visit.status='EXITED';visit.exitReason='CANCELLATION';visit.exitedAt=now;visit.exitedBy=ctx.user.id;visit.onsiteCancellation={...visit.onsiteCancellation,status:'EXITED',exitedAt:now,exitedBy:ctx.user.id};
  store.audit(ctx.user,'CANCEL_ONSITE_EXIT','visit',visit.id,{orderId:orderId||null,reason:visit.onsiteCancellation.reason,confirmedNoGoods:true},ctx);
  store.save();return {body:{visitId:visit.id,status:visit.status}};
});

route('GET', '/api/visits', { roles: ['admin', 'gate', 'sales', 'warehouse'] }, (ctx) => {
  const db = store.get();
  const orderById = new Map((db.orders || []).map(o => [o.id, o]));
  const orderByVisit = new Map();
  for (const order of db.orders || []) {
    if (!order.visitId) continue;
    const previous = orderByVisit.get(order.visitId);
    if (!previous || String(order.createdAt || '') > String(previous.createdAt || '')) orderByVisit.set(order.visitId, order);
  }
  let rows = repo.repos.visits.all().reverse().map((v) => {
    const order = (v.orderId && orderById.get(v.orderId)) || orderByVisit.get(v.id);
    // A settled order without dispatch is intentionally readable while it is
    // waiting at the gate: staff must verify its cargo before confirming exit.
    const gateExitAvailable = isGateExitAvailable(order);
    return {
      ...v,
      customer: repo.lookups.customerOf(v.customerId),
      order: order ? { id: order.id, orderNo: order.orderNo || '—', status: order.status, gateExitAvailable } : null,
    };
  });
  if (roleOf(ctx.user) === 'sales') rows = rows.filter((v) => ['WAITING_SALES', 'ORDERED'].includes(v.status));
  const status = ctx.query?.get('status'), id = ctx.query?.get('id');
  if (status) rows = rows.filter(v => v.status === status);
  if (id) rows = rows.filter(v => v.id === id);
  const limit = Math.min(200, Math.max(1, Number(ctx.query?.get('limit')) || 100));
  const offset = Math.max(0, Number(ctx.query?.get('offset')) || 0);
  const q = normalizePlate(String(ctx.query?.get('q') || '').trim().slice(0, 80));
  if (q) rows = rows.filter(v => [v.customer?.name,v.customer?.phone,v.customer?.code,v.plate ?? v.customer?.plate,v.carType,v.vehicleType,v.recipient?.name,v.recipient?.phone,v.district,v.purpose,v.status,v.createdAt,v.order?.orderNo].some(x => normalizePlate(String(x || '')).includes(q)));
  return { status: 200, body: { visits: rows.slice(offset, offset + limit), total: rows.length, limit, offset } };
});

// ---------- گزارش مدیریتی ----------
route('GET', '/api/reports', { roles: ['admin'] }, () => {
  activateDueRemoteOrders();
  const db = store.get();
  const t = today();
  const todayVisits = db.visits.filter((v) => localDayOf(v.createdAt) === t);
  const gate = todayVisits.length;
  const ordersToday = db.orders.filter((o) => localDayOf(o.createdAt) === t).length;
  const delivered = db.orders.filter((o) => ['SETTLEMENT_PENDING', 'SETTLED', 'EXITED'].includes(o.status)).length;
  const byDistrict = Object.entries(todayVisits.reduce((a, v) => { const k = v.district || 'نامشخص'; a[k] = (a[k] || 0) + 1; return a; }, {}))
    .map(([district, count]) => ({ district, count })).sort((a, b) => b.count - a.count);
  const revenue = db.payments.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const readyExit = db.orders.filter((o) => o.status === 'SETTLED' && !o.dispatch).length;
  const remoteAll = db.orders.filter((o) => o.orderType === 'REMOTE');
  const remoteByDate = Object.entries(remoteAll.reduce((a, o) => { const k = o.scheduledDate || 'بدون تاریخ'; a[k] = (a[k] || 0) + 1; return a; }, {}))
    .map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    status: 200,
    body: {
      gate: { today: gate, byDistrict },
      sales: { todayOrders: ordersToday, pendingSettlement: db.orders.filter((o) => o.status === 'SETTLEMENT_PENDING' && !o.dispatch).length, pendingWarehouse: db.orders.filter((o) => ['WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING'].includes(o.status)).length },
      warehouse: { deliveredOrders: delivered },
      finance: { revenue, readyExit },
      remote: {
        total: remoteAll.length,
        scheduled: remoteAll.filter((o) => o.status === 'SCHEDULED_REMOTE').length,
        dueToday: remoteAll.filter((o) => o.scheduledDate === t && ['WAREHOUSE_PENDING', 'SETTLEMENT_PENDING', 'SETTLED', 'EXITED'].includes(o.status)).length,
        byDate: remoteByDate,
      },
    },
  };
});

module.exports = {};
