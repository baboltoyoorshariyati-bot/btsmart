'use strict';
// پروندهٔ کامل سفارش برای کارتابل انبار و مدیر:
// نوع سفارش، اطلاعات کامل مشتری، ثبت سفارش، سند و وزن‌کشی هر قلم با نام کاربر،
// مراحل و همهٔ رویدادهای مرتبط. هیچ دادهٔ مالی، پرداخت، فاکتور یا امضایی برنمی‌گردد.
// اگر داده‌ای موجود نباشد، بخش مربوطه خالی برمی‌گردد تا پرونده هرگز ناقص‌نما نشود.

// v37.50.0 — پروندهٔ کامل سفارش برای کارتابل انبار (و مدیر):
// نوع سفارش، اطلاعات کامل مشتری، ثبت سفارش، سند و وزن‌کشی هر قلم با نام کاربر،
// مراحل و همهٔ رویدادهای مرتبط. هیچ دادهٔ مالی، پرداخت، فاکتور یا امضایی برنمی‌گردد.
const WAREHOUSE_EVENT_ACTIONS = new Set([
  'CREATE_VISIT', 'CREATE_ORDER', 'CREATE_REMOTE_ORDER', 'CREATE_STORE_ORDER', 'UPDATE_STORE_ORDER',
  'SALES_EDIT_STORE_ORDER', 'APPROVE_STORE_ORDER', 'QUICK_SEND_STORE_ORDER', 'ACTIVATE_REMOTE_ORDER',
  'UPDATE_REMOTE_ORDER', 'CANCEL_REMOTE_ORDER', 'CANCEL_STORE_ORDER',
  'WAREHOUSE_ACCEPT_ORDER', 'WAREHOUSE_START_PREPARING', 'WAREHOUSE_DRAFT_SAVED', 'WAREHOUSE_FINALIZE',
  'WAREHOUSE_DOCUMENT_EDITED', 'WAREHOUSE_DOCUMENT_EDIT_REQUESTED', 'REOPEN_WAREHOUSE_PREPARING',
  'RETURN_TO_SALES', 'RESUBMIT_TO_WAREHOUSE', 'WAREHOUSE_PHYSICAL_HANDOVER', 'TRANSPORT_WAREHOUSE_HANDOVER',
  'TRANSPORT_PLAN_ASSIGNED', 'PICKUP_ENTRY', 'PICKUP_PHYSICAL_HANDOVER', 'PICKUP_GOODS_EXIT',
  'STORE_ORDER_OUT_OF_STOCK', 'STORE_PARTIAL_OUT_OF_STOCK',
]);
const WAREHOUSE_EVENT_LABELS = {
  CREATE_VISIT: 'ثبت مراجعهٔ اولیه', CREATE_ORDER: 'ثبت سفارش حضوری', CREATE_REMOTE_ORDER: 'ثبت سفارش غیرحضوری',
  CREATE_STORE_ORDER: 'ثبت سفارش فروشگاه', UPDATE_STORE_ORDER: 'ویرایش سفارش فروشگاه',
  SALES_EDIT_STORE_ORDER: 'اصلاح سفارش فروشگاه توسط فروش', APPROVE_STORE_ORDER: 'تأیید سفارش توسط فروش',
  QUICK_SEND_STORE_ORDER: 'ارسال سریع به انبار', ACTIVATE_REMOTE_ORDER: 'فعال‌سازی سفارش زمان‌بندی‌شده',
  UPDATE_REMOTE_ORDER: 'ویرایش سفارش غیرحضوری', CANCEL_REMOTE_ORDER: 'لغو سفارش غیرحضوری',
  CANCEL_STORE_ORDER: 'لغو سفارش فروشگاه', WAREHOUSE_ACCEPT_ORDER: 'دریافت سفارش در انبار',
  WAREHOUSE_START_PREPARING: 'شروع آماده‌سازی', WAREHOUSE_DRAFT_SAVED: 'ذخیرهٔ پیش‌نویس وزن',
  WAREHOUSE_FINALIZE: 'ثبت وزن نهایی انبار', WAREHOUSE_DOCUMENT_EDITED: 'اصلاح سند انبار',
  WAREHOUSE_DOCUMENT_EDIT_REQUESTED: 'درخواست اصلاح سند انبار', REOPEN_WAREHOUSE_PREPARING: 'بازگشایی آماده‌سازی',
  RETURN_TO_SALES: 'ارجاع به فروش', RESUBMIT_TO_WAREHOUSE: 'ارسال مجدد به انبار',
  WAREHOUSE_PHYSICAL_HANDOVER: 'تحویل فیزیکی از انبار', TRANSPORT_WAREHOUSE_HANDOVER: 'تحویل کالا به راننده',
  TRANSPORT_PLAN_ASSIGNED: 'تخصیص راننده و خودرو', PICKUP_ENTRY: 'ثبت ورود تحویل‌گیرنده',
  PICKUP_PHYSICAL_HANDOVER: 'تحویل فیزیکی سفارش', PICKUP_GOODS_EXIT: 'ثبت خروج کالا',
  STORE_ORDER_OUT_OF_STOCK: 'ثبت ناموجودی', STORE_PARTIAL_OUT_OF_STOCK: 'ثبت ناموجودی سفارش جزئی',
};
function warehouseEventAction(action) {
  const code = String(action || '');
  return WAREHOUSE_EVENT_ACTIONS.has(code) || code.startsWith('STORE_RUN_');
}
function warehouseEventDetails(details) {
  const out = {};
  for (const key of ['reason', 'note', 'run', 'driverName', 'vehiclePlate', 'warehouseDocumentNo', 'itemCount', 'scheduledAt', 'deliveryDate', 'dispatchPlace']) {
    if (details?.[key] != null && details[key] !== '') out[key] = details[key];
  }
  return out;
}
function warehouseOrderDossier(db, order) {
  db = db || {};
  const users = new Map((db.users || []).map((user) => [user.id, user]));
  const actor = (id, fallback = '') => {
    if (!id) return fallback ? { name: fallback, username: fallback } : null;
    const user = users.get(id);
    return { id, name: user?.fullName || user?.username || fallback || '—', username: user?.username || fallback || '' };
  };
  const visit = (db.visits || []).find((row) => row.id === order.visitId) || null;
  const customer = (db.customers || []).find((row) => row.id === (order.customerId || visit?.customerId)) || null;
  const itemRows = (db.orderItems || []).filter((item) => item.orderId === order.id);
  const itemIds = new Set(itemRows.map((item) => item.id));
  const createEvent = (db.audit || []).find((event) => event.entityType === 'order' && event.entityId === order.id
    && ['CREATE_ORDER', 'CREATE_REMOTE_ORDER', 'CREATE_STORE_ORDER'].includes(event.action));
  const visitEvent = visit ? (db.audit || []).find((event) => event.entityType === 'visit' && event.entityId === visit.id && event.action === 'CREATE_VISIT') : null;

  const events = (db.audit || []).filter((event) => {
    const sameOrder = event.entityType === 'order' && event.entityId === order.id;
    const sameItem = event.entityType === 'order_item' && (event.details?.orderId === order.id || itemIds.has(event.entityId));
    const sameVisit = !!visit && event.entityType === 'visit' && event.entityId === visit.id;
    return warehouseEventAction(event.action) && (sameOrder || sameItem || sameVisit);
  }).sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0)).map((event) => ({
    seq: event.seq || 0, action: event.action, label: WAREHOUSE_EVENT_LABELS[event.action] || event.action,
    entityType: event.entityType, entityId: event.entityId, createdAt: event.createdAt || null,
    user: actor(event.userId, event.username || ''), details: warehouseEventDetails(event.details),
  }));

  const snapshots = new Map();
  for (const event of (db.audit || [])) {
    if (event.entityType !== 'order' || event.entityId !== order.id
      || !['WAREHOUSE_FINALIZE', 'WAREHOUSE_DOCUMENT_EDITED'].includes(event.action)
      || !Array.isArray(event.details?.items)) continue;
    for (const line of event.details.items) if (line.itemId) snapshots.set(line.itemId, line);
  }
  const products = new Map((db.products || []).map((product) => [product.id, product]));
  const weighing = (rows) => (Array.isArray(rows) ? rows : []).map((entry) => ({
    kg: Number(entry.kg || 0), at: entry.at || null, byName: entry.byName || '',
    user: actor(entry.by, entry.byName || ''), note: entry.note || '', tareCount: Array.isArray(entry.weighings) ? entry.weighings.length : 0,
  }));
  const items = itemRows.map((item) => {
    const snapshot = snapshots.get(item.id) || {};
    const status = snapshot.status || item.warehouseStatus || item.itemStatus || '';
    return {
      id: item.id,
      productName: snapshot.productName || products.get(item.productId)?.name || '—',
      requestedQty: snapshot.requestedQty ?? item.requestedQty ?? null,
      requestedUnit: snapshot.requestedUnit ?? item.requestedUnit ?? '',
      description: snapshot.description ?? item.description ?? '',
      status, outOfStock: status === 'OUT_OF_STOCK',
      deliveredKg: Number(snapshot.deliveredKg ?? item.deliveredKg ?? 0),
      runR1: weighing(item.runR1), runR2: weighing(item.runR2),
    };
  });

  const eventFor = (actions) => [...events].reverse().find((event) => actions.includes(event.action));
  const stage = (key, label, at, userId, actions) => {
    const event = eventFor(actions);
    return { key, label, at: at || event?.createdAt || null, user: actor(userId) || event?.user || null };
  };
  const stages = [
    ...(visit ? [stage('visit', 'ثبت مراجعهٔ اولیه', visit.createdAt, visit.createdBy, ['CREATE_VISIT'])] : []),
    stage('registered', 'ثبت سفارش', order.createdAt, order.createdBy, ['CREATE_ORDER', 'CREATE_REMOTE_ORDER', 'CREATE_STORE_ORDER']),
    stage('warehouseAccepted', 'دریافت سفارش در انبار', order.warehouseAcceptedAt, order.warehouseAcceptedBy, ['WAREHOUSE_ACCEPT_ORDER']),
    stage('preparationStarted', 'شروع آماده‌سازی / وزن‌کشی', order.warehousePreparationStartedAt, order.warehousePreparationStartedBy, ['WAREHOUSE_START_PREPARING', 'WAREHOUSE_DRAFT_SAVED', 'STORE_RUN_R1_WEIGHT', 'STORE_RUN_R2_WEIGHT']),
    stage('warehouseCompleted', 'ثبت وزن نهایی انبار', order.warehouseCompletedAt, order.warehouseCompletedBy || order.storeRunOps?.finalizedBy, ['WAREHOUSE_FINALIZE', 'WAREHOUSE_DOCUMENT_EDITED', 'STORE_RUN_DAY_FINALIZED']),
  ].filter((entry) => entry.at || entry.user);

  const orderContact = order.orderType === 'STORE' && Object.hasOwn(order, 'customerName');
  const profile = customer && !orderContact ? Object.fromEntries([
    'id', 'code', 'name', 'phone', 'phone2', 'nationalId', 'company', 'district', 'address',
    'plate', 'vehicleType', 'carType', 'notes', 'createdAt', 'lastVisitAt',
  ].map((key) => [key, customer[key] ?? ''])) : {
    name: order.customerName || '', phone: order.customerPhone || '', plate: '', vehicleType: '', carType: '',
    phone2: '', nationalId: '', company: '', district: '', address: '', notes: '', code: '',
  };
  const storeName = order.orderType === 'STORE'
    ? require('./store-name').storeDisplayName(order.storeName, order.branchNo)
    : (order.storeName || '');
  return {
    order: {
      id: order.id, orderNo: order.orderNo || '—', orderType: order.orderType || '', status: order.status || '',
      source: order.source || '', storeName, branchNo: order.branchNo ?? null,
      storeOrderKind: order.storeOrderKind || '', storePurpose: order.storePurpose || '',
      deliveryMode: order.deliveryMode || '', createdAt: order.createdAt || null,
      createdBy: actor(order.createdBy) || (createEvent && actor(createEvent.userId, createEvent.username || '')) || null,
      updatedAt: order.updatedAt || null, scheduledAt: order.scheduledAt || null, scheduledDate: order.scheduledDate || null,
      deliveryDate: order.deliveryDate || null, dispatchPlace: order.dispatchPlace || '', notes: order.notes || '',
      warehouseDocumentNo: order.warehouseDocumentNo || '',
      warehouseAcceptedAt: order.warehouseAcceptedAt || null, warehouseAcceptedBy: actor(order.warehouseAcceptedBy),
      warehousePreparationStartedAt: order.warehousePreparationStartedAt || null, warehousePreparationStartedBy: actor(order.warehousePreparationStartedBy),
      warehouseCompletedAt: order.warehouseCompletedAt || null, warehouseCompletedBy: actor(order.warehouseCompletedBy || order.storeRunOps?.finalizedBy),
      warehouseReturn: order.warehouseReturn ? { reason: order.warehouseReturn.reason || '', at: order.warehouseReturn.at || null } : null,
      transportAssignments: Object.fromEntries(Object.entries(order.transportAssignments || {}).map(([run, a]) => [run, {
        run: Number(run), driverName: a?.driverName || '', driverPhone: a?.driverPhone || '',
        vehicleType: a?.vehicleType || '', vehiclePlate: a?.vehiclePlate || '', assignedAt: a?.assignedAt || null,
        assignedBy: actor(a?.assignedBy),
      }])),
    },
    customer: profile,
    visit: visit ? {
      id: visit.id, status: visit.status || '', purpose: visit.purpose || '', district: visit.district || '',
      plate: visit.plate || '', vehicleType: visit.vehicleType || '', carType: visit.carType || '',
      createdAt: visit.createdAt || null, createdBy: actor(visit.createdBy) || (visitEvent && actor(visitEvent.userId, visitEvent.username || '')) || null,
    } : null,
    stages, items, events,
  };
}

module.exports = warehouseOrderDossier;
