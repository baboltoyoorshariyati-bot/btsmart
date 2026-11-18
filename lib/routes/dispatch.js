'use strict';
// مسیرهای واحد پخش، کارتابل راننده، خروج ارسالی نگهبانی، برگه‌های مرجوعی و سوابق مدیر
const { atomicRoute: route, fail } = require('../http');
const store = require('../store');
const dispatch = require('../dispatch');
const {withPickupOrderLock}=require('../pickup-legacy-guard');

const SALES = { roles: ['sales', 'admin'] };
const DISPATCH = { roles: ['dispatch', 'admin'] };
const DRIVER = { roles: ['driver'] };
const GATE = { roles: ['gate', 'admin'] };
const ADMIN = { roles: ['admin'] };

function requireDriverUser(ctx) {
  if (!ctx.user.driverId) fail(403, 'این حساب به هیچ راننده‌ای متصل نیست. از مدیر بخواهید حساب را به راننده وصل کند.');
  return ctx.user.driverId;
}
function findOrderOrFail(id) {
  const order = store.get().orders.find((o) => o.id === id);
  if (!order) fail(404, 'سفارش یافت نشد.');
  return order;
}

// ---------- فروش: ارسال سفارش به پخش ----------
route('POST', '/api/orders/:id/send-dispatch', { ...SALES, idempotent: true }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = findOrderOrFail(ctx.params.id);
  dispatch.sendToDispatch(ctx.user, order, ctx.body?.driverId, ctx.body?.items, ctx, ctx.body);
  return { status: 200, body: { order: dispatch.publicOrder(order) } };
}));

// فهرست رانندگان فعال برای انتخاب در کارتابل فروش
route('GET', '/api/dispatch/drivers', { roles: ['sales', 'dispatch', 'admin'] }, () => {
  const drivers = store.get().drivers.filter((d) => d.isActive)
    .map((d) => ({ id: d.id, fullName: d.fullName, plate: d.plate || '', vehicleType: d.vehicleType || '' }));
  return { status: 200, body: { drivers } };
});

// ---------- پخش: مشاهده و پیگیری؛ تخصیص از کارتابل فروش انجام می‌شود ----------
route('GET', '/api/dispatch/orders', DISPATCH, (ctx) => {
  const db = store.get();
  const filter = String(ctx.query.get('status') || 'open');
  const today = dispatch.todayKey();
  const views = db.orders.flatMap((o) => dispatch.dispatchViews(o)); // v37.5.0 — هر نمای خدمه‌بر یک ردیف (سرویس‌های فروشگاه)
  const pub = (v) => { const p = dispatch.publicOrder({ ...v.order, dispatch: v.dispatch }); p.dispatch.run = v.dispatch.run || null; return p; };
  const isToday = (v) => dispatch.localDay(v.dispatch.deliveredAt || v.dispatch.sentAt) === today;
  const rows = views
    .filter((v) => {
      const s = v.dispatch.status;
      if (filter === 'pending') return s === 'PENDING_ASSIGN';
      if (filter === 'assigned') return ['ASSIGNED', 'DRIVER_EXIT_REPORTED', 'IN_TRANSIT'].includes(s);
      if (filter === 'delivered') return ['DELIVERED', 'SALES_FINALIZED', 'CLOSED'].includes(s) && isToday(v);
      return dispatch.OPEN_STATUSES.includes(s) || (s === 'CLOSED' && isToday(v));
    })
    .sort((a, b) => (a.dispatch.sentAt < b.dispatch.sentAt ? 1 : -1))
    .map(pub);
  const count = (fn) => views.filter((v) => fn(v)).length;
  const activeStates = ['ASSIGNED', 'DRIVER_EXIT_REPORTED', 'IN_TRANSIT'];
  const counts = {
    pending: count((v) => v.dispatch.status === 'PENDING_ASSIGN'),
    assigned: count((v) => activeStates.includes(v.dispatch.status)),
    waitingGate: count((v) => v.dispatch.status === 'DRIVER_EXIT_REPORTED'),
    inTransit: count((v) => v.dispatch.status === 'IN_TRANSIT'),
    delivered: count((v) => ['DELIVERED', 'SALES_FINALIZED', 'CLOSED'].includes(v.dispatch.status) && isToday(v)),
  };
  const drivers = db.drivers.filter((d) => d.isActive).map((driver) => {
    const mine = views.filter((v) => v.dispatch.driverId === driver.id);
    const active = mine.filter((v) => activeStates.includes(v.dispatch.status));
    const doneToday = mine.filter((v) => ['DELIVERED', 'SALES_FINALIZED', 'CLOSED'].includes(v.dispatch.status) && isToday(v));
    const liveOrders = [...active, ...doneToday]
      .sort((a, b) => String(b.order.updatedAt || b.dispatch?.deliveredAt || '').localeCompare(String(a.order.updatedAt || a.dispatch?.deliveredAt || '')))
      .slice(0, 5)
      .map((v) => {
        const o = v.order; const enriched = pub(v);
        return {
          id: o.id, orderNo: o.orderNo || '—', customerName: o.orderType === 'STORE' ? require('../store-name').storeDisplayName(o.storeName,o.branchNo) : (enriched.customer?.name || o.storeName || '—'),
          status: v.dispatch.status, updatedAt: o.updatedAt || v.dispatch.updatedAt || v.dispatch.sentAt,
          deliveredAt: v.dispatch.deliveredAt || null,
        };
      });
    return {
      id: driver.id, fullName: driver.fullName, plate: driver.plate || '', vehicleType: driver.vehicleType || '',
      phone: driver.phone || '', posTerminal: driver.posTerminal || '', posBank: driver.posBank || '', isActive: true,
      activeOrderCount: active.length,
      waitingGateCount: active.filter((o) => o.dispatch.status === 'DRIVER_EXIT_REPORTED').length,
      inTransitCount: active.filter((o) => o.dispatch.status === 'IN_TRANSIT').length,
      deliveredTodayCount: doneToday.length, liveOrders,
    };
  });
  return { status: 200, body: { orders: rows, counts, drivers } };
});

route('POST', '/api/dispatch/orders/:id/assign', { ...SALES, idempotent: true }, (ctx) => {
  const order = dispatch.findDispatchOrder(ctx.params.id);
  dispatch.assignDriver(ctx.user, order, ctx.body?.driverId, ctx);
  return { status: 200, body: { order: dispatch.publicOrder(order) } };
});

// ---------- راننده ----------
route('GET', '/api/driver/orders', DRIVER, (ctx) => {
  const isAdmin=ctx.user.roleCode==='admin';
  const driverId = isAdmin?(ctx.query.get('driverId')||null):requireDriverUser(ctx);
  const db = store.get();
  const driver = isAdmin&&!driverId?{id:'',fullName:'همه رانندگان'}:db.drivers.find((d) => d.id === driverId);
  if (!driver) fail(404, 'راننده پیدا نشد.');
  const mine = db.orders.flatMap((o) => dispatch.dispatchViews(o)).filter((v) => isAdmin&&!driverId||v.dispatch.driverId === driverId); // v37.5.0 — هر سرویس فروشگاه یک ردیف
  const pub = (v) => { const p = dispatch.publicOrder({ ...v.order, dispatch: v.dispatch }); p.dispatch.run = v.dispatch.run || null; return p; };
  const today = dispatch.todayKey();
  const byAssigned = (a, b) => String(b.dispatch.assignedAt || b.order.updatedAt || '').localeCompare(String(a.dispatch.assignedAt || a.order.updatedAt || ''));
  const byDelivered = (a, b) => String(b.dispatch.deliveredAt || '').localeCompare(String(a.dispatch.deliveredAt || ''));
  const assigned = mine.filter((v) => ['ASSIGNED', 'DRIVER_EXIT_REPORTED'].includes(v.dispatch.status)).sort(byAssigned).map(pub);
  const inTransit = mine.filter((v) => v.dispatch.status === 'IN_TRANSIT').sort(byAssigned).map(pub);
  const delivered = mine.filter((v) => v.dispatch.status === 'DELIVERED').sort(byDelivered).map(pub);
  const historyAll = mine.filter((v) => ['SALES_FINALIZED', 'CLOSED'].includes(v.dispatch.status)).sort(byDelivered);
  const history = historyAll.slice(0, 100).map(pub);
  const open = mine.filter((v) => ['ASSIGNED', 'DRIVER_EXIT_REPORTED', 'IN_TRANSIT'].includes(v.dispatch.status)).sort(byAssigned).map(pub);
  const todayDone = mine.filter((v) => ['DELIVERED', 'SALES_FINALIZED', 'CLOSED'].includes(v.dispatch.status) && dispatch.localDay(v.dispatch.deliveredAt) === today)
    .sort(byDelivered).map(pub);
  return {
    status: 200,
    body: {
      driver: { id: driver.id, fullName: driver.fullName, phone: driver.phone || '', vehicleType: driver.vehicleType || '', plate: driver.plate || '', posTerminal: driver.posTerminal || '', posBank: driver.posBank || '' },
      open, todayDone, assigned, inTransit, delivered, history, historyTotal: historyAll.length,
    },
  };
});

route('POST', '/api/driver/orders/:id/exit', { ...DRIVER, idempotent: true }, (ctx) => {
  requireDriverUser(ctx);
  const order = dispatch.findDriverOrder(ctx.user, ctx.params.id);
  dispatch.driverExit(ctx.user, order, ctx);
  return { status: 200, body: { order: dispatch.publicOrder(order) } };
});

route('POST', '/api/driver/orders/:id/deliver', { ...DRIVER, idempotent: true }, (ctx) => {
  requireDriverUser(ctx);
  const order = dispatch.findDriverOrder(ctx.user, ctx.params.id);
  dispatch.completeDelivery(ctx.user, order, ctx.body || {}, ctx);
  return { status: 200, body: { order: dispatch.publicOrder(order) } };
});

// ---------- فروش: بازبینی و نهایی‌کردن تحویل راننده ----------
route('GET', '/api/sales/dispatch-deliveries', SALES, (ctx) => {
  const rawOffset=ctx?.query?.get('historyOffset')||'0';
  const requestedOffset=Number(rawOffset);
  if(!Number.isSafeInteger(requestedOffset)||requestedOffset<0) fail(400,'صفحهٔ سوابق معتبر نیست.');
  const historyLimit=30;
  const orders=store.get().orders;
  const legacy=orders.flatMap((o)=>dispatch.dispatchViews(o)); // historical driver dispatches remain unchanged
  const modern=orders.filter(o=>o.transportWorkflow===1&&o.deliveryMode==='DELIVERY').flatMap(o=>require('../transport-sales-views').salesTransportViews(o));
  const pub=(v)=>{if(v.transportService)return {...require('../domain').enrichOrder(v.order),transportService:v.transportService};const p=dispatch.publicOrder({...v.order,dispatch:v.dispatch});p.dispatch.run=v.dispatch.run||null;return p;};
  const when=v=>v.transportService?.at||v.dispatch?.salesFinalizedAt||v.dispatch?.closedAt||v.dispatch?.deliveredAt||v.order.updatedAt||v.dispatch?.assignedAt||'';
  const recent=(a,b)=>String(when(b)).localeCompare(String(when(a)))||String(a.order.id).localeCompare(String(b.order.id))||Number(a.transportService?.run??a.dispatch?.run??0)-Number(b.transportService?.run??b.dispatch?.run??0);
  const finalized=[...legacy.filter(v=>['SALES_FINALIZED','CLOSED'].includes(v.dispatch.status)),...modern.filter(v=>v.transportService.section==='history')].sort(recent);
  const historyOffset=Math.min(requestedOffset,Math.max(0,Math.floor((finalized.length-1)/historyLimit)*historyLimit));
  const assigned=[...legacy.filter(v=>['ASSIGNED','DRIVER_EXIT_REPORTED'].includes(v.dispatch.status)),...modern.filter(v=>v.transportService.section==='assigned')].sort(recent);
  const inTransit=[...legacy.filter(v=>v.dispatch.status==='IN_TRANSIT'),...modern.filter(v=>v.transportService.section==='inTransit')].sort(recent);
  const pending=[...legacy.filter(v=>v.dispatch.status==='DELIVERED'),...modern.filter(v=>v.transportService.section==='delivered')].sort(recent);
  return {status:200,body:{
    active:[...assigned,...inTransit].sort(recent).map(pub),
    assigned:assigned.map(pub),inTransit:inTransit.map(pub),
    pending:pending.map(pub),
    finalized:finalized.slice(historyOffset,historyOffset+historyLimit).map(pub),finalizedTotal:finalized.length,finalizedOffset:historyOffset,finalizedLimit:historyLimit,
  }};
});

route('GET', '/api/sales/dispatch-deliveries/:id', SALES, (ctx) => {
  const order = findOrderOrFail(ctx.params.id);
  const runParam=ctx.query.get('run');
  let record=order.dispatch || dispatch.dispatchViews(order).at(-1)?.dispatch;
  if(runParam!==null){
    const run=Number(runParam);
    if(![1,2].includes(run)) fail(400,'شمارهٔ سرویس معتبر نیست.');
    record=dispatch.dispatchViews(order).find(v=>Number(v.dispatch.run)===run)?.dispatch;
  }
  if (!record || !['DELIVERED', 'SALES_FINALIZED', 'CLOSED'].includes(record.status)) fail(404, 'تحویل ثبت‌شده یافت نشد.');
  return { status: 200, body: { order: dispatch.publicOrder({...order,dispatch:record}), signatureData: record.signatureData || '' } };
});

route('POST', '/api/sales/dispatch-deliveries/:id/finalize', { ...SALES, idempotent: true }, (ctx) => {
  const order = dispatch.findDispatchOrder(ctx.params.id);
  dispatch.salesFinalizeDelivery(ctx.user, order, ctx, ctx.body || {}); // v37.6.0 — body.items قابل حذف: تغییر قیمت پیش از صدور فاکتور
  return { status: 200, body: { order: dispatch.publicOrder(order) } };
});

// ---------- نگهبانی: تأیید خروج راننده پیش از حرکت ----------
route('GET', '/api/gate/dispatch', GATE, () => {
  const orders = store.get().orders.filter((o) => o.dispatch);
  const pick = (s) => orders.filter((o) => o.dispatch.status === s)
    .sort((a, b) => {
      const at = a.dispatch.driverExitAt || a.dispatch.assignedAt || a.dispatch.deliveredAt || a.dispatch.sentAt || '';
      const bt = b.dispatch.driverExitAt || b.dispatch.assignedAt || b.dispatch.deliveredAt || b.dispatch.sentAt || '';
      return at < bt ? 1 : -1;
    }).map(o=>require('../gate-order-view')(dispatch.publicOrder(o)));
  return {
    status: 200,
    body: {
      awaitingDriver: pick('ASSIGNED'),
      leaving: [...pick('DRIVER_EXIT_REPORTED'),...store.get().orders.filter(o=>o.orderType!=='STORE'&&o.transportWorkflow===1&&o.deliveryMode==='DELIVERY'&&o.status==='SETTLEMENT_PENDING'&&o.transportInvoice?.status==='PREPARED'&&o.transportHandovers?.['0']&&!o.transportDeparture).map(o=>{const h=o.transportHandovers['0'];return {...require('../gate-order-view')(require('../domain').enrichOrder(o)),gateTransportShipment:true,dispatch:{driverName:h.driverName,driverPlate:h.vehiclePlate,vehicleType:h.vehicleType,status:'DRIVER_EXIT_REPORTED'},items:(h.document?.items||[]).filter(i=>!i.outOfStock).map(i=>({product:{name:i.productName},deliveredKg:i.deliveredKg}))};}),...store.get().orders.flatMap(o=>{
        if(o.orderType!=='STORE'||o.transportWorkflow!==1||o.status!=='WAREHOUSE_PREPARING')return [];
        return require('../store-order-kind').allowedRuns(o).flatMap(run=>{
          const key=String(run),h=o.transportHandovers?.[key],r=o.transportStoreReviews?.[key];
          if(!r||!h||o.transportStoreTrips?.[key])return [];
          return [{id:o.id,orderNo:o.orderNo,orderType:'STORE',storeOrderKind:o.storeOrderKind,storeName:require('../store-name').storeDisplayName(o.storeName,o.branchNo),createdAt:o.createdAt,gateStoreService:true,dispatch:{run,status:'DRIVER_EXIT_REPORTED',driverName:h.driverName,driverPlate:h.vehiclePlate,vehicleType:h.vehicleType,warehouseDocumentNo:h.document?.warehouseDocumentNo,lines:(h.document?.lines||[]).map(({productName,deliveredKg})=>({productName,deliveredKg}))},items:(h.document?.lines||[]).map(l=>({product:{name:l.productName},deliveredKg:l.deliveredKg}))}];
        });
      })],
      inTransit: pick('IN_TRANSIT'),
    },
  };
});

route('POST', '/api/gate/dispatch/:id/exit', { ...GATE, idempotent: true }, (ctx) => {
  const order = dispatch.findDispatchOrder(ctx.params.id);
  dispatch.gateExit(ctx.user, order, ctx);
  return { status: 200, body: { order: require('../gate-order-view')(dispatch.publicOrder(order)) } };
});

route('POST', '/api/gate/dispatch/:id/close', { ...GATE, idempotent: true }, (ctx) => {
  const order = dispatch.findDispatchOrder(ctx.params.id);
  dispatch.gateFinalExit(ctx.user, order, ctx);
  return { status: 200, body: { order: require('../gate-order-view')(dispatch.publicOrder(order)) } };
});

// ---------- برگه‌های مرجوعی: راننده → فروش → انبار ----------
route('GET', '/api/orders/:id/returns', SALES, (ctx) => {
  const order = findOrderOrFail(ctx.params.id);
  if (order.orderType !== 'STORE') fail(404, 'سفارش فروشگاهی پیدا نشد.');
  const returns = store.get().dispatchReturns
    .filter(r => r.orderId === order.id && Number(r.kg) > 0)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  if (!returns.length) fail(404, 'برای این سفارش کالای مرجوعی ثبت نشده است.');
  return { status: 200, body: { order: { id: order.id, orderType: order.orderType, orderNo: order.orderNo || '—', storeName: order.storeName || '', branchNo: order.branchNo || null, dispatchPlace: order.dispatchPlace || '' }, returns } };
});

route('GET', '/api/returns', { roles: ['sales', 'warehouse', 'admin'] }, (ctx) => {
  const want = String(ctx.query.get('status') || 'open');
  const rows = store.get().dispatchReturns
    .filter((r) => (want === 'open' ? r.status !== 'RECEIVED' : r.status === want))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const counts = {
    atSales: store.get().dispatchReturns.filter((r) => r.status === 'AT_SALES').length,
    atWarehouse: store.get().dispatchReturns.filter((r) => r.status === 'AT_WAREHOUSE').length,
    received: store.get().dispatchReturns.filter((r) => r.status === 'RECEIVED').length,
  };
  return { status: 200, body: { returns: rows, counts } };
});

route('POST', '/api/returns/:id/refer', { roles: ['sales'], idempotent: true }, (ctx) => {
  const t = dispatch.findReturn(ctx.params.id);
  dispatch.referReturnToWarehouse(ctx.user, t, ctx);
  return { status: 200, body: { return: t } };
});

route('POST', '/api/returns/:id/receive', { roles: ['warehouse'], idempotent: true }, (ctx) => {
  const t = dispatch.findReturn(ctx.params.id);
  dispatch.receiveReturnAtWarehouse(ctx.user, t, ctx);
  return { status: 200, body: { return: t } };
});

// ---------- مدیر: سوابق رانندگان ----------
route('GET', '/api/admin/driver-records', ADMIN, (ctx) => {
  const q = ctx.query;
  const kind = ['return', 'shortage'].includes(q.get('kind')) ? q.get('kind') : '';
  const settlement = ['CASH', 'CREDIT'].includes(String(q.get('settlement') || '').toUpperCase()) ? String(q.get('settlement')).toUpperCase() : '';
  return { status: 200, body: dispatch.driverRecords({ driverId: q.get('driverId') || '', from: q.get('from') || '', to: q.get('to') || '', settlement, kind }) };
});

route('GET', '/api/admin/driver-records/:orderId', ADMIN, (ctx) => {
  const order = store.get().orders.find((o) => o.id === ctx.params.orderId);
  if (!order || !order.dispatch) fail(404, 'سابقه تحویل یافت نشد.');
  return { status: 200, body: { order: dispatch.publicOrder(order), signatureData: order.dispatch.signatureData || '' } };
});
