'use strict';
// Controlled edits for finalized warehouse documents and sales invoices.
// The original 72-hour clock is never reset by a correction; each version is
// retained in the append-only audit trail and the linked document history.
const { atomicRoute: route, fail, normalizeRole } = require('../http');
const store = require('../store');
const validate = require('../validate');
const transaction = require('../transport-transaction');
const { getProduct, enrichOrder, createNotification } = require('../domain');
const EDIT_WINDOW_MS = 72 * 60 * 60 * 1000;
const ADMIN = 'admin';
const clone = value => JSON.parse(JSON.stringify(value));
const active = item => item && item.itemStatus !== 'CANCELLED';
const moneyRound = value => Math.round(Number(value || 0));

function getOrder(db, id) {
  const order = db.orders.find(row => row.id === id);
  if (!order) fail(404, 'سفارش یافت نشد.');
  return order;
}
function paymentFor(db, orderId, paymentId) {
  const payment = db.payments.find(row => row.id === paymentId && row.orderId === orderId);
  if (!payment) fail(404, 'فاکتور یا سند فروش پیدا نشد.');
  return payment;
}
function isAdmin(user) { return normalizeRole(user?.roleCode) === ADMIN; }
function assertWithinWindow(baseAt, user, field = 'سند') {
  const stamp = Date.parse(baseAt || '');
  if (!Number.isFinite(stamp)) {
    if (isAdmin(user)) return null; // Missing legacy timestamps require an explicit manager override.
    fail(409, `زمان صدور ${field} برای تعیین مهلت ویرایش ثبت نشده است؛ بررسی مدیر لازم است.`);
  }
  const expiresAt = stamp + EDIT_WINDOW_MS;
  if (Date.now() > expiresAt && !isAdmin(user)) fail(403, `مهلت ۷۲ ساعتهٔ ویرایش ${field} تمام شده است؛ فقط مدیر سیستم می‌تواند آن را اصلاح کند.`);
  return new Date(expiresAt).toISOString();
}
function documentEdit(order, paymentId) {
  const rows = Array.isArray(order.documentEdits) ? order.documentEdits : [];
  return rows.slice().reverse().find(row => row.paymentId === paymentId) || null;
}
function pendingWarehouseEdit(order, paymentId) {
  const edit = documentEdit(order, paymentId);
  return edit?.status === 'PENDING_WAREHOUSE' ? edit : null;
}
function activeEdit(order, paymentId) {
  const edit = documentEdit(order, paymentId);
  return edit && ['PENDING_WAREHOUSE', 'PENDING_SALES_REVIEW'].includes(edit.status) ? edit : null;
}
function findDispatch(order, payment) {
  const run = Number(payment.deliveryRun) || 0;
  return [...(Array.isArray(order.dispatches) ? order.dispatches : []), order.dispatch]
    .find(row => row && (Number(row.run) || 0) === run) || null;
}
function storeDocument(db, order, payment) {
  const run = Number(payment.deliveryRun);
  if (order.orderType !== 'STORE' || ![1, 2].includes(run)) return null;
  return require('../store-run-print').warehouseServiceDocument(db, order, run, getProduct);
}
function warehouseDocument(db, order, payment, { includePending = false } = {}) {
  if (order.orderType === 'STORE') return storeDocument(db, order, payment);
  const docs = require('./orders').warehouseDeliveredDocuments(db, { includePendingEdits: includePending });
  return docs.find(doc => doc.id === order.id) || null;
}
function warehouseDocumentTimestamp(order, payment, doc) {
  if (order.orderType === 'STORE') {
    const run = String(Number(payment.deliveryRun) || 0);
    const shipment = order.storeRunOps?.[`r${run}Shipment`];
    const dispatch = findDispatch(order, payment);
    return shipment?.sentAt || dispatch?.sentAt || payment.verifiedAt || order.warehouseCompletedAt || doc?.sentAt || '';
  }
  return order.warehouseCompletedAt || doc?.completedAt || '';
}
function paymentTimestamp(order, payment) {
  return payment.verifiedAt || payment.createdAt || order.transportInvoice?.closedAt || order.warehouseCompletedAt || '';
}
function productLine(line, item) {
  return {
    itemId: String(line.itemId || item?.id || ''),
    productId: String(line.productId || item?.productId || ''),
    productName: String(line.productName || getProduct(item?.productId)?.name || '—'),
    deliveredKg: line.outOfStock ? 0 : Number(line.deliveredKg || 0),
    outOfStock: !!line.outOfStock,
    requestedQty: line.requestedQty ?? item?.requestedQty ?? null,
    requestedUnit: line.requestedUnit ?? item?.requestedUnit ?? '',
    description: line.description ?? item?.description ?? '',
    weighings: Array.isArray(line.weighings) ? clone(line.weighings) : null,
    missingWeighings: !!line.missingWeighings,
  };
}
function documentLines(doc, order, db) {
  const items = db.orderItems.filter(row => row.orderId === order.id);
  const byId = new Map(items.map(row => [row.id, row]));
  const lines = Array.isArray(doc?.lines) ? doc.lines : (Array.isArray(doc?.items) ? doc.items : []);
  return lines.map(line => productLine(line, byId.get(String(line.itemId || ''))));
}
function assertEditableInvoice(order, payment, user) {
  if (order.orderType === 'STORE') fail(409, 'سند فروشگاه مبلغ و تسویه ندارد؛ اصلاح آن از مسیر انبار انجام می‌شود.');
  if (activeEdit(order, payment.id)?.status === 'PENDING_WAREHOUSE') fail(409, 'این فاکتور برای اصلاح وزن/محصول به انبار ارسال شده است و تا بازگشت سند قابل ویرایش فروش نیست.');
  return assertWithinWindow(paymentTimestamp(order, payment), user, 'فاکتور فروش');
}
// قلم «عدم موجودی» انبار در فاکتور تسویه ردیف ندارد؛ نه قیمت می‌گیرد و نه در
// اصلاح سند فاکتور دیده می‌شود. اصلاح سند انبار همچنان وضعیت موجودی را حفظ می‌کند.
const unavailable = item => item && (item.itemStatus === 'OUT_OF_STOCK' || (item.warehouseStatus === 'OUT_OF_STOCK' && Number(item.deliveredKg || 0) <= 0));
function activePaymentLines(db, order, payment) {
  const items = db.orderItems.filter(row => row.orderId === order.id && active(row));
  const byId = new Map(items.map(row => [row.id, row]));
  const dispatch = findDispatch(order, payment);
  const dispatchLines = new Map((dispatch?.lines || []).map(row => [row.itemId, row]));
  const transportLines = new Map((order.transportInvoice?.priceLines || []).map(row => [row.itemId, row]));
  if (Array.isArray(payment.priceLines) && payment.priceLines.length) {
    return payment.priceLines.map(line => {
      const item = byId.get(String(line.itemId));
      if (!item || !line.itemId) fail(409, 'شناسهٔ قلم در فاکتور موجود نیست؛ ویرایش قیمت نیازمند بررسی مدیر است.');
      const dispatchLine = dispatchLines.get(item.id);
      const transportLine = transportLines.get(item.id);
      const rawKg = dispatch?.shipmentWeights?.[item.id] ?? dispatchLine?.deliveredKg ?? transportLine?.deliveredKg ?? line.deliveredKg ?? item.deliveredKg;
      const grossKg = Number(rawKg || 0);
      const returnKg = Number(dispatchLine?.returnKg ?? line.returnKg ?? 0);
      const shortageKg = Number(dispatchLine?.shortageKg ?? line.shortageKg ?? 0);
      return { line, item, dispatchLine, grossKg, returnKg, shortageKg, unitPrice: Number(line.unitPrice ?? item.unitPrice ?? 0) };
    });
  }
  let scoped = items.filter(item => !unavailable(item));
  if (dispatch?.shipmentItemIds?.length) {
    const ids = new Set(dispatch.shipmentItemIds);
    scoped = items.filter(item => ids.has(item.id));
  }
  if (!scoped.length) fail(409, 'قلم قابل ویرایشی در فاکتور پیدا نشد.');
  return scoped.map(item => {
    const dispatchLine = dispatchLines.get(item.id);
    const rawKg = dispatch?.shipmentWeights?.[item.id] ?? dispatchLine?.deliveredKg ?? item.deliveredKg;
    return { line: null, item, dispatchLine, grossKg: Number(rawKg || 0), returnKg: Number(dispatchLine?.returnKg || 0), shortageKg: Number(dispatchLine?.shortageKg || 0), unitPrice: Number(item.unitPrice || 0) };
  });
}
function preserveCheckStates(methods, oldMethods) {
  const prior = Array.isArray(oldMethods) ? oldMethods : [];
  return methods.map(row => {
    if (row.type !== 'CHECK') return row;
    const match = prior.find(old => old.type === 'CHECK' && old.bank === row.bank && old.checkNumber === row.checkNumber && Number(old.amount) === Number(row.amount));
    return match?.checkStatus ? { ...row, checkStatus: match.checkStatus } : row;
  });
}
function receivedMethodKey(row) {
  return JSON.stringify({
    type: row.type, amount: Number(row.amount), deviceId: row.deviceId || '', reference: row.reference || '',
    bank: row.bank || '', checkNumber: row.checkNumber || '', dueDate: row.dueDate || '', checkStatus: row.type === 'CHECK' ? (row.checkStatus || 'PENDING') : '',
  });
}
function preserveRecordedReceipts(oldMethods, nextMethods) {
  const pool = [...nextMethods];
  for (const old of Array.isArray(oldMethods) ? oldMethods : []) {
    // Cash/card/POS receipts and handed-over cheques are immutable during a
    // warehouse correction review. Only the unpaid CREDIT balance may change.
    if (!['CASH', 'POS', 'CARD_TRANSFER', 'CHECK'].includes(old.type)) continue;
    const key = receivedMethodKey(old), index = pool.findIndex(row => receivedMethodKey(row) === key);
    if (index < 0) fail(409, 'دریافت‌ها و چک‌های ثبت‌شده تغییر نمی‌کنند؛ فقط روشِ ماندهٔ جدید فاکتور را اصلاح کنید.');
    pool.splice(index, 1);
  }
  if (pool.some(row => ['CASH', 'POS', 'CARD_TRANSFER', 'CHECK'].includes(row.type))) fail(409, 'در بازبینی پس از اصلاح انبار، دریافت تازه را از این فرم ثبت نکنید؛ فقط ماندهٔ معوق را تنظیم کنید.');
}
function cleanInvoiceSettlementMethods(db, payment, input, total) {
  const devices = [...(db.paymentDevices || [])], oldMethods = Array.isArray(payment.settlementMethods) ? payment.settlementMethods : [];
  for (const old of oldMethods.filter(row => row.type === 'POS' && row.deviceId && row.deviceSnapshot)) {
    const unchanged = input.some(row => row?.type === 'POS' && row.deviceId === old.deviceId && Number(row.amount) === Number(old.amount) && String(row.reference || '') === String(old.reference || ''));
    if (!unchanged) continue;
    const index = devices.findIndex(row => row.id === old.deviceId);
    const archived = { ...old.deviceSnapshot, id: old.deviceId, isActive: true };
    if (index >= 0 && !devices[index].isActive) devices[index] = archived;
    else if (index < 0) devices.push(archived);
  }
  const clean = require('../settlement-methods').cleanRows(input || [], total, { ...db, paymentDevices: devices });
  return preserveCheckStates(clean, oldMethods);
}
function reconcileDebtAccount(db, order, payment, methods) {
  let account = payment.debtAccount ? clone(payment.debtAccount) : null;
  const receipts = Array.isArray(account?.receipts) ? account.receipts : [];
  const trackedChecks = !!account && receipts.some(row => Number.isInteger(row.settlementMethodIndex));
  const initial = methods.reduce((sum, row) => sum + (row.type === 'CREDIT' || (trackedChecks && row.type === 'CHECK') ? Number(row.amount) : 0), 0);
  if (!account) {
    const created = require('../customer-debts').newAccount(db, order, methods);
    return created || undefined;
  }
  const linked = receipts.filter(row => Number.isInteger(row.settlementMethodIndex));
  for (const receipt of linked) {
    const index = methods.findIndex(row => row.type === 'CHECK' && row.bank === receipt.bank && row.checkNumber === receipt.checkNumber && Number(row.amount) === Number(receipt.amount));
    if (index < 0) fail(409, 'چک ثبت‌شده یا وضعیت وصول آن قابل حذف/تغییر نیست؛ برای اصلاح سوابق مالی با مدیر هماهنگ کنید.');
    receipt.settlementMethodIndex = index;
    if (methods[index].checkStatus && methods[index].checkStatus !== receipt.status) methods[index] = { ...methods[index], checkStatus: receipt.status };
  }
  const received = receipts.filter(row => ['CLEARED', 'PENDING'].includes(row.status)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  if (initial < received) fail(409, 'مبلغ معوق/چک جدید از دریافت‌های ثبت‌شده کمتر است؛ سوابق دریافت قبلی حفظ می‌شوند.');
  if (!initial && !receipts.length) return undefined;
  account.initial = initial;
  return account;
}
function uniqueChecks(methods) {
  const seen = new Set();
  for (const row of methods.filter(method => method.type === 'CHECK')) {
    const key = `${row.bank}\0${row.checkNumber}`;
    if (seen.has(key)) fail(400, 'چک تکراری در روش‌های تسویه مجاز نیست.');
    seen.add(key);
  }
}
function updateDispatchInvoice(order, payment, lines, totals, methods) {
  const dispatch = findDispatch(order, payment);
  if (!dispatch) return;
  const byId = new Map(lines.map(row => [row.item.id, row]));
  dispatch.lines = (dispatch.lines || []).map(row => {
    const edit = byId.get(row.itemId);
    if (!edit) return row;
    const grossAmount = moneyRound(edit.grossKg * edit.unitPrice);
    const returnAmount = moneyRound(edit.returnKg * edit.unitPrice);
    const netKg = Math.max(0, +(edit.grossKg - edit.returnKg - edit.shortageKg).toFixed(3));
    return { ...row, productName: getProduct(edit.item.productId)?.name || row.productName, deliveredKg: edit.grossKg, unitPrice: edit.unitPrice, grossAmount, returnAmount, amountDue: Math.max(0, grossAmount - returnAmount), netKg };
  });
  dispatch.priceLines = lines.map(row => ({ itemId: row.item.id, productName: getProduct(row.item.productId)?.name || '—', deliveredKg: row.grossKg, unitPrice: row.unitPrice, amount: moneyRound(row.grossKg * row.unitPrice) }));
  Object.assign(dispatch, { subtotalAmount: totals.subtotalAmount, discountAmount: totals.discountAmount, additionsAmount: totals.additionsAmount, approvedTotalAmount: totals.grossAmount, grossAmount: totals.grossAmount, returnDeduction: totals.returnDeduction, amountDue: totals.totalAmount, settlementMethods: methods });
}
function totalsForInvoice(lines, payment, body, { allowDepositOverpayment = false } = {}) {
  const subtotal = lines.reduce((sum, row) => sum + moneyRound(row.grossKg * row.unitPrice), 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > validate.MAX_MONEY) fail(400, 'جمع اقلام فاکتور از حد مجاز بیشتر است.');
  const discountAmount = body.discountAmount === undefined ? Number(payment.discountAmount || 0) : validate.number(body.discountAmount, { field: 'تخفیف', min: 0, max: validate.MAX_MONEY });
  const additionsAmount = body.additionsAmount === undefined ? Number(payment.additionsAmount || 0) : validate.number(body.additionsAmount, { field: 'اضافات', min: 0, max: validate.MAX_MONEY });
  const gross = validate.settlementAmounts(subtotal, { discountAmount, additionsAmount }).totalAmount;
  const returnDeduction = lines.reduce((sum, row) => sum + moneyRound(row.returnKg * row.unitPrice), 0);
  const totalAmount = Math.max(0, gross - returnDeduction);
  if (!Number.isSafeInteger(totalAmount) || totalAmount > validate.MAX_MONEY) fail(400, 'مبلغ نهایی فاکتور از حد مجاز بیشتر است.');
  const depositAmount = Number(payment.depositAmount || 0);
  const depositExcessAmount = Math.max(0, depositAmount - totalAmount);
  if (depositExcessAmount > 0 && !allowDepositOverpayment) fail(409, 'مبلغ فاکتور از بیعانه لحاظ‌شده کمتر شده است؛ بازپرداخت اضافه‌بیعانه را جداگانه ثبت کنید.');
  return { subtotalAmount: subtotal, discountAmount, additionsAmount, grossAmount: gross, returnDeduction, totalAmount, amountDue: Math.max(0, totalAmount - depositAmount), depositExcessAmount };
}
function updateInvoicePriceLines(payment, lines) {
  if (!Array.isArray(payment.priceLines) || !payment.priceLines.length) return;
  const byId = new Map(lines.map(row => [row.item.id, row]));
  payment.priceLines = payment.priceLines.map(line => {
    const row = byId.get(String(line.itemId));
    if (!row) return line;
    const netKg = Math.max(0, +(row.grossKg - row.returnKg - row.shortageKg).toFixed(3));
    const amount = moneyRound(Math.max(0, row.grossKg - row.returnKg) * row.unitPrice);
    return { ...line, productName: getProduct(row.item.productId)?.name || line.productName, deliveredKg: netKg, unitPrice: row.unitPrice, amount, returnKg: row.returnKg };
  });
}
function paymentEditSnapshot(payment) {
  const keys = ['priceLines', 'subtotalAmount', 'discountAmount', 'additionsAmount', 'grossAmount', 'returnDeduction', 'totalAmount', 'amountDue', 'depositAmount', 'depositExcessAmount', 'settlementMethods', 'debtAccount', 'settlementReviewRequired', 'settlementReviewRequiredAt', 'settlementReviewReason'];
  return clone(Object.fromEntries(keys.filter(key => payment[key] !== undefined).map(key => [key, payment[key]])));
}
function recordEditSnapshot(payment, kind, user, before, now) {
  const history = Array.isArray(payment.documentEditHistory) ? payment.documentEditHistory : [];
  history.push({ kind, at: now, by: user.id, byName: user.fullName || user.username || '', before: clone(before), after: paymentEditSnapshot(payment) });
  payment.documentEditHistory = history.slice(-25);
}
function updateWarehousePayment(db, order, payment, oldLines, newLines, edit, user, ctx) {
  if (order.orderType === 'STORE') {
    if (Array.isArray(payment.priceLines)) {
      const byId = new Map(newLines.map(row => [row.itemId, row]));
      payment.priceLines = payment.priceLines.map(line => {
        const row = byId.get(String(line.itemId));
        return row ? { ...line, productName: row.productName, deliveredKg: row.outOfStock ? 0 : row.deliveredKg } : line;
      });
    }
    return;
  }
  const before = paymentEditSnapshot(payment);
  const oldById = new Map(oldLines.map(row => [row.itemId, row]));
  const newById = new Map(newLines.map(row => [row.itemId, row]));
  const rows = activePaymentLines(db, order, payment);
  const recalculated = rows.map(row => {
    const nextDoc = newById.get(row.item.id);
    const previousDoc = oldById.get(row.item.id);
    if (!nextDoc || !previousDoc) return row;
    const grossKg = nextDoc.outOfStock ? 0 : Number(nextDoc.deliveredKg);
    return { ...row, grossKg, unitPrice: Number(row.unitPrice || 0), returnKg: Math.min(Number(row.returnKg || 0), grossKg), shortageKg: Math.min(Number(row.shortageKg || 0), Math.max(0, grossKg - Number(row.returnKg || 0))) };
  });
  for (const row of recalculated) {
    const item = row.item;
    if (Number.isFinite(Number(item.unitPrice))) item.finalAmount = moneyRound(row.grossKg * Number(item.unitPrice || 0));
  }
  const totals = totalsForInvoice(recalculated, payment, {}, { allowDepositOverpayment: true });
  Object.assign(payment, totals, { settlementReviewRequired: true, settlementReviewRequiredAt: store.nowIso() });
  updateInvoicePriceLines(payment, recalculated);
  updateDispatchInvoice(order, payment, recalculated, totals, payment.settlementMethods || []);
  if (order.transportInvoice?.priceLines && !payment.deliveryRun) {
    const byId = new Map(recalculated.map(row => [row.item.id, row]));
    order.transportInvoice.priceLines = order.transportInvoice.priceLines.map(line => {
      const row = byId.get(String(line.itemId));
      return row ? { ...line, productName: getProduct(row.item.productId)?.name || line.productName, deliveredKg: row.grossKg, unitPrice: row.unitPrice, amount: moneyRound(row.grossKg * row.unitPrice) } : line;
    });
    order.transportInvoice.subtotalAmount = totals.subtotalAmount;
    order.transportInvoice.totalAmount = totals.grossAmount;
  }
  payment.settlementReviewReason = 'وزن یا محصول سند انبار اصلاح شده است؛ روش تسویه و ماندهٔ فاکتور را بازبینی کنید.';
  recordEditSnapshot(payment, 'WAREHOUSE', user, before, store.nowIso());
  edit.status = 'PENDING_SALES_REVIEW';
  edit.warehouseCompletedAt = store.nowIso();
  edit.warehouseCompletedBy = user.id;
  edit.correctedItems = clone(newLines);
  createNotification('sales', 'WAREHOUSE_DOCUMENT_EDITED', 'order', order.id, `اصلاح سند انبار سفارش ${order.orderNo || '—'} انجام شد؛ فاکتور برای بازبینی روش تسویه و مانده برگشت.`);
  store.audit(user, 'WAREHOUSE_DOCUMENT_EDITED', 'order', order.id, {
    paymentId: payment.id, invoiceNumber: payment.invoiceNumber, warehouseDocumentNo: edit.warehouseDocumentNo,
    items: newLines.map(row => ({ itemId: row.itemId, productId: row.productId, productName: row.productName, status: row.outOfStock ? 'OUT_OF_STOCK' : 'DELIVERED', deliveredKg: row.deliveredKg, weighings: row.weighings, requestedQty: row.requestedQty, requestedUnit: row.requestedUnit, description: row.description })),
    totalAmount: payment.totalAmount, amountDue: payment.amountDue,
  }, ctx);
}
function applyWarehouseCorrection(db, order, payment, edit, newLines, user, ctx) {
  const doc = warehouseDocument(db, order, payment, { includePending: true });
  if (!doc) fail(409, 'سند انبار اصلی پیدا نشد؛ این درخواست باید توسط مدیر بررسی شود.');
  const oldLines = documentLines(doc, order, db);
  const oldById = new Map(oldLines.map(row => [row.itemId, row]));
  const newById = new Map(newLines.map(row => [row.itemId, row]));
  if (order.orderType === 'STORE') {
    const run = Number(payment.deliveryRun);
    const SR = require('../store-runs');
    const shipment = order.storeRunOps?.[`r${run}Shipment`];
    const dispatch = findDispatch(order, payment);
    order.storeDocumentCorrections ||= {};
    order.storeDocumentCorrections[String(run)] = clone(newLines);
    for (const row of newLines) {
      const item = db.orderItems.find(line => line.id === row.itemId && line.orderId === order.id);
      if (!item) fail(409, 'قلم سفارش فروشگاه دیگر پیدا نمی‌شود.');
      const kg = row.outOfStock ? 0 : Number(row.deliveredKg);
      item[`runR${run}CorrectedKg`] = kg;
      item.deliveredKg = SR.runTotalKg(item);
      if (shipment) shipment.weights = { ...(shipment.weights || {}), [item.id]: kg };
      if (dispatch) dispatch.shipmentWeights = { ...(dispatch.shipmentWeights || {}), [item.id]: kg };
    }
    const total = db.orderItems.filter(item => item.orderId === order.id && active(item)).reduce((sum, item) => sum + SR.runTotalKg(item), 0);
    order.warehouseDocumentEditHistory ||= [];
    order.warehouseDocumentEditHistory.push({ paymentId: payment.id, at: store.nowIso(), by: user.id, before: oldLines, after: clone(newLines) });
    order.warehouseDocumentEditHistory = order.warehouseDocumentEditHistory.slice(-25);
    edit.status = 'COMPLETED'; edit.warehouseCompletedAt = store.nowIso(); edit.warehouseCompletedBy = user.id; edit.correctedItems = clone(newLines);
    store.audit(user, 'WAREHOUSE_DOCUMENT_EDITED', 'order', order.id, { paymentId: payment.id, warehouseDocumentNo: edit.warehouseDocumentNo, run, items: newLines.map(row => ({ itemId: row.itemId, productId: row.productId, productName: row.productName, status: row.outOfStock ? 'OUT_OF_STOCK' : 'DELIVERED', deliveredKg: row.deliveredKg, requestedQty: row.requestedQty, requestedUnit: row.requestedUnit })), totalDeliveredKg: +total.toFixed(3) }, ctx);
    createNotification('sales', 'WAREHOUSE_DOCUMENT_EDITED', 'order', order.id, `اصلاح سند وزنی فروشگاه ${order.orderNo || '—'}، سرویس ${run === 2 ? 'دوم' : 'اول'} انجام شد.`);
  } else {
    for (const row of newLines) {
      const item = db.orderItems.find(line => line.id === row.itemId && line.orderId === order.id);
      if (!item) fail(409, 'قلم سفارش دیگر پیدا نمی‌شود.');
      item.productId = row.productId;
      item.deliveredKg = row.outOfStock ? 0 : Number(row.deliveredKg);
      item.warehouseStatus = row.outOfStock ? 'OUT_OF_STOCK' : 'DELIVERED';
      if (item.itemStatus !== 'CANCELLED') item.itemStatus = row.outOfStock ? 'OUT_OF_STOCK' : 'DELIVERED';
      item.warehouseWeighings = row.weighings;
      if (row.weighings === null) item.warehouseWeighings = null;
      const matching = order.pickupHandover?.document?.items || order.transportHandovers?.['0']?.document?.items;
      if (Array.isArray(matching)) {
        const saved = matching.find(line => line.itemId === item.id);
        if (saved) Object.assign(saved, { productId: row.productId, productName: row.productName, deliveredKg: item.deliveredKg, outOfStock: row.outOfStock, weighings: row.weighings, missingWeighings: row.missingWeighings });
      }
      if (Number.isFinite(Number(item.unitPrice))) item.finalAmount = moneyRound(Number(item.deliveredKg) * Number(item.unitPrice || 0));
    }
    order.warehouseDocumentEditHistory ||= [];
    order.warehouseDocumentEditHistory.push({ paymentId: payment.id, at: store.nowIso(), by: user.id, before: oldLines, after: clone(newLines) });
    order.warehouseDocumentEditHistory = order.warehouseDocumentEditHistory.slice(-25);
    edit.status = 'PENDING_SALES_REVIEW';
    edit.warehouseCompletedAt = store.nowIso(); edit.warehouseCompletedBy = user.id; edit.correctedItems = clone(newLines);
    updateWarehousePayment(db, order, payment, oldLines, newLines, edit, user, ctx);
  }
  order.updatedAt = store.nowIso();
  return doc;
}
function normalizedCorrection(body, edit, doc, order, db) {
  const incoming = Array.isArray(body.items) ? body.items : null;
  if (!incoming || incoming.length !== edit.items.length) fail(400, 'وزن و محصول همهٔ ردیف‌های سند را ارسال کنید.');
  const original = new Map(edit.items.map(row => [row.itemId, row]));
  const seen = new Set();
  return incoming.map(row => {
    const id = String(row?.itemId || '');
    if (!id || seen.has(id) || !original.has(id)) fail(400, 'ردیف محصول تکراری یا خارج از سند است.');
    seen.add(id);
    const old = original.get(id);
    const item = db.orderItems.find(line => line.id === id && line.orderId === order.id);
    if (!item) fail(409, 'قلم سند حذف یا جابه‌جا شده است؛ بررسی مدیر لازم است.');
    const productId = String(row.productId || old.productId || item.productId);
    const product = db.products.find(p => p.id === productId && (p.isActive || productId === old.productId));
    if (!product) fail(400, 'محصول جدید باید معتبر و فعال باشد؛ محصول غیرفعال فقط در صورت حفظ محصول قبلی مجاز است.');
    const outOfStock = row.outOfStock === true;
    if (outOfStock !== !!old.outOfStock) fail(400, 'وضعیت موجودی در اصلاح سند قابل تغییر نیست؛ فقط محصول یا وزن اصلاح می‌شود.');
    const kg = outOfStock ? 0 : validate.number(row.deliveredKg, { field: 'وزن تحویلی اصلاح‌شده', min: 0.001, max: validate.MAX_QTY });
    if (Math.abs(kg * 1000 - Math.round(kg * 1000)) > 1e-7) fail(400, 'وزن تحویلی حداکثر سه رقم اعشار دارد.');
    const weightChanged = Math.abs(Number(old.deliveredKg || 0) - kg) > 1e-7 || old.outOfStock !== outOfStock;
    const productChanged = productId !== old.productId;
    return {
      ...old, itemId: id, productId, productName: product.name, deliveredKg: kg, outOfStock,
      // Old tare batches remain in edit history, but are not falsely presented as a weighing for a changed weight.
      weighings: weightChanged ? null : old.weighings,
      missingWeighings: weightChanged ? true : old.missingWeighings,
      ...(productChanged ? { correctionNote: 'محصول در نسخهٔ اصلاح‌شده تغییر کرده است.' } : {}),
    };
  });
}

route('GET', '/api/sales/orders/:orderId/invoices/:paymentId/edit', { roles: ['sales', 'admin'] }, ctx => {
  const db = store.get(), order = getOrder(db, ctx.params.orderId), payment = paymentFor(db, order.id, ctx.params.paymentId);
  if (order.orderType === 'STORE') fail(409, 'سند فروشگاه فقط اصلاح وزن/محصول دارد و از مسیر صف انبار ویرایش می‌شود.');
  const baseAt = paymentTimestamp(order, payment), stamp = Date.parse(baseAt || '');
  const expiresAt = Number.isFinite(stamp) ? new Date(stamp + EDIT_WINDOW_MS).toISOString() : null;
  const currentEdit = documentEdit(order, payment.id);
  const waitingForWarehouse = currentEdit?.status === 'PENDING_WAREHOUSE';
  const canEdit = !waitingForWarehouse && (isAdmin(ctx.user) || (Number.isFinite(stamp) && Date.now() <= stamp + EDIT_WINDOW_MS));
  const lines = activePaymentLines(db, order, payment).map(row => ({
    itemId: row.item.id, productId: row.item.productId, productName: getProduct(row.item.productId)?.name || '—',
    deliveredKg: row.grossKg, unitPrice: row.unitPrice, returnKg: row.returnKg, shortageKg: row.shortageKg,
    amount: moneyRound(Math.max(0, row.grossKg - row.returnKg) * row.unitPrice),
  }));
  const customer = db.customers.find(row => row.id === order.customerId);
  return { status: 200, body: {
    canEdit, expiresAt, serverNow: store.nowIso(), waitingForWarehouse,
    edit: currentEdit ? { status: currentEdit.status, reason: currentEdit.reason || '', warehouseCompletedAt: currentEdit.warehouseCompletedAt || null } : null,
    order: { id: order.id, orderNo: order.orderNo, status: order.status, customerName: customer?.name || order.storeName || '—', customerPhone: customer?.phone || '' },
    payment: {
      id: payment.id, invoiceNumber: payment.invoiceNumber, deliveryRun: payment.deliveryRun || null,
      verifiedAt: payment.verifiedAt || payment.createdAt || null,
      subtotalAmount: payment.subtotalAmount || 0, discountAmount: payment.discountAmount || 0,
      additionsAmount: payment.additionsAmount || 0, grossAmount: payment.grossAmount || payment.totalAmount || 0,
      returnDeduction: payment.returnDeduction || 0, totalAmount: payment.totalAmount || 0,
      amountDue: payment.amountDue ?? payment.totalAmount ?? 0, depositAmount: payment.depositAmount || 0,
      settlementMethods: clone(payment.settlementMethods || []),
      settlementReviewRequired: !!payment.settlementReviewRequired,
      settlementReviewReason: payment.settlementReviewReason || '',
    },
    lines,
  } };
});

route('POST', '/api/sales/orders/:orderId/invoices/:paymentId/warehouse-edit', { roles: ['sales', 'admin'] }, ctx => transaction(() => {
  const db = store.get(), order = getOrder(db, ctx.params.orderId), payment = paymentFor(db, order.id, ctx.params.paymentId);
  const doc = warehouseDocument(db, order, payment);
  if (!doc) fail(409, 'سند انبار این فاکتور در دسترس نیست.');
  const baseAt = warehouseDocumentTimestamp(order, payment, doc);
  const expiresAt = assertWithinWindow(baseAt, ctx.user, 'سند انبار');
  if (activeEdit(order, payment.id)) fail(409, 'برای این سند یک درخواست ویرایش باز است؛ ابتدا همان درخواست را تکمیل کنید.');
  const items = documentLines(doc, order, db);
  if (!items.length || items.some(line => !line.itemId)) fail(409, 'شناسهٔ اقلام سند انبار در سابقه موجود نیست؛ بررسی مدیر لازم است.');
  const reason = validate.text(ctx.body?.reason || '', { field: 'دلیل ارجاع به انبار', max: 300, required: true });
  const now = store.nowIso(), edits = order.documentEdits || [];
  const edit = { id: store.uid(), paymentId: payment.id, run: Number(payment.deliveryRun) || null, invoiceNumber: payment.invoiceNumber || '', status: 'PENDING_WAREHOUSE', requestedAt: now, requestedBy: ctx.user.id, requestedByName: ctx.user.fullName || ctx.user.username, baseAt, expiresAt, reason, warehouseDocumentNo: doc.warehouseDocumentNo || '', items: clone(items), originalItems: clone(items) };
  edits.push(edit); order.documentEdits = edits; order.updatedAt = now;
  store.audit(ctx.user, 'WAREHOUSE_DOCUMENT_EDIT_REQUESTED', 'order', order.id, { paymentId: payment.id, invoiceNumber: payment.invoiceNumber, run: edit.run, warehouseDocumentNo: edit.warehouseDocumentNo, reason, itemCount: items.length, expiresAt }, ctx);
  createNotification('warehouse', 'WAREHOUSE_DOCUMENT_EDIT_REQUESTED', 'order', order.id, `فروش اصلاح وزن/محصول سند ${edit.warehouseDocumentNo || payment.invoiceNumber || order.orderNo} را به انبار ارجاع داد.`, edit.run ? { run: edit.run } : {});
  store.save();
  return { status: 200, body: { edit: clone(edit), orderId: order.id } };
}));

function pendingEditRows(db) {
  const rows = [];
  for (const order of db.orders) for (const edit of order.documentEdits || []) {
    if (edit.status !== 'PENDING_WAREHOUSE') continue;
    const payment = db.payments.find(p => p.id === edit.paymentId && p.orderId === order.id);
    if (!payment) continue;
    const doc = warehouseDocument(db, order, payment, { includePending: true });
    if (!doc) continue;
    rows.push({ orderId: order.id, orderNo: order.orderNo, orderType: order.orderType, paymentId: payment.id, invoiceNumber: payment.invoiceNumber, run: edit.run, warehouseDocumentNo: edit.warehouseDocumentNo, requestedAt: edit.requestedAt, requestedByName: edit.requestedByName, reason: edit.reason, customerName: order.orderType==='STORE' ? require('../store-name').storeDisplayName(order.storeName,order.branchNo) : doc.customerName || doc.storeName || order.storeName || '—', itemCount: edit.items.length, baseAt: edit.baseAt, expiresAt: edit.expiresAt || null });
  }
  return rows.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
}
route('GET', '/api/warehouse/document-edits', { roles: ['warehouse', 'admin'] }, () => ({ status: 200, body: { requests: pendingEditRows(store.get()) } }));
route('GET', '/api/warehouse/document-edits/:orderId/:paymentId', { roles: ['warehouse', 'admin'] }, ctx => {
  const db = store.get(), order = getOrder(db, ctx.params.orderId), payment = paymentFor(db, order.id, ctx.params.paymentId), edit = pendingWarehouseEdit(order, payment.id);
  if (!edit) fail(404, 'درخواست اصلاح انبار در صف نیست.');
  assertWithinWindow(edit.baseAt, ctx.user, 'سند انبار');
  const doc = warehouseDocument(db, order, payment, { includePending: true });
  if (!doc) fail(409, 'سند انبار اصلی پیدا نشد.');
  return { status: 200, body: { edit: clone(edit), orderNo: order.orderNo, orderType: order.orderType, paymentId: payment.id, invoiceNumber: payment.invoiceNumber, warehouseDocument: doc, products: db.products.filter(p => p.isActive).map(({ id, name, quickCode }) => ({ id, name, quickCode })) } };
});
route('PUT', '/api/warehouse/document-edits/:orderId/:paymentId', { roles: ['warehouse', 'admin'] }, ctx => transaction(() => {
  const db = store.get(), order = getOrder(db, ctx.params.orderId), payment = paymentFor(db, order.id, ctx.params.paymentId), edit = pendingWarehouseEdit(order, payment.id);
  if (!edit) fail(409, 'این درخواست دیگر در انتظار اصلاح انبار نیست.');
  assertWithinWindow(edit.baseAt, ctx.user, 'سند انبار');
  const doc = warehouseDocument(db, order, payment, { includePending: true });
  if (!doc) fail(409, 'سند انبار اصلی پیدا نشد.');
  const newLines = normalizedCorrection(ctx.body, edit, doc, order, db);
  const now = store.nowIso();
  applyWarehouseCorrection(db, order, payment, edit, newLines, ctx.user, ctx);
  edit.updatedAt = now;
  store.save();
  return { status: 200, body: { edit: clone(edit), orderId: order.id, warehouseDocument: warehouseDocument(db, order, payment, { includePending: edit.status === 'PENDING_SALES_REVIEW' }) } };
}));

route('PUT', '/api/sales/orders/:orderId/invoices/:paymentId', { roles: ['sales', 'admin'] }, ctx => transaction(() => {
  const db = store.get(), order = getOrder(db, ctx.params.orderId), payment = paymentFor(db, order.id, ctx.params.paymentId), body = ctx.body || {};
  const expiresAt = assertEditableInvoice(order, payment, ctx.user);
  const edit = documentEdit(order, payment.id);
  if (edit?.status === 'PENDING_WAREHOUSE') fail(409, 'فاکتور برای اصلاح وزن/محصول نزد انبار است.');
  const lines = activePaymentLines(db, order, payment);
  const incoming = Array.isArray(body.items) ? body.items : null;
  if (!incoming || incoming.length !== lines.length) fail(400, 'قیمت همهٔ اقلام فعال فاکتور را وارد کنید.');
  const edits = new Map();
  for (const row of incoming) {
    const id = String(row?.itemId || '');
    if (!id || edits.has(id) || !lines.some(line => line.item.id === id)) fail(400, 'فهرست قیمت اقلام نامعتبر یا تکراری است.');
    const unitPrice = validate.number(row.unitPrice, { field: 'قیمت هر کیلو', min: 0, max: validate.MAX_MONEY });
    if (!Number.isSafeInteger(unitPrice)) fail(400, 'قیمت واحد باید مبلغ صحیح ریال باشد.');
    edits.set(id, unitPrice);
  }
  const recalculated = lines.map(row => {
    const unitPrice = edits.get(row.item.id);
    if (row.grossKg > 0 && unitPrice <= 0) fail(400, `قیمت قلم «${getProduct(row.item.productId)?.name || row.item.productId}» باید بیشتر از صفر باشد.`);
    return { ...row, unitPrice };
  });
  const totals = totalsForInvoice(recalculated, payment, body);
  const methodsInput = Array.isArray(body.settlementMethods) ? body.settlementMethods : payment.settlementMethods;
  const settlementMethods = cleanInvoiceSettlementMethods(db, payment, methodsInput || [], totals.amountDue);
  uniqueChecks(settlementMethods);
  if (edit?.status === 'PENDING_SALES_REVIEW') preserveRecordedReceipts(payment.settlementMethods, settlementMethods);
  const account = reconcileDebtAccount(db, order, payment, settlementMethods);
  const before = paymentEditSnapshot(payment);
  for (const row of recalculated) {
    row.item.unitPrice = row.unitPrice;
    row.item.finalAmount = moneyRound(row.grossKg * row.unitPrice);
  }
  updateInvoicePriceLines(payment, recalculated);
  Object.assign(payment, totals, { settlementMethods, settlementReviewRequired: false, settlementReviewRequiredAt: null, settlementReviewReason: '' });
  if (account) payment.debtAccount = account; else delete payment.debtAccount;
  updateDispatchInvoice(order, payment, recalculated, totals, settlementMethods);
  if (order.transportInvoice && !payment.deliveryRun) {
    order.transportInvoice.subtotalAmount = totals.subtotalAmount;
    order.transportInvoice.discountAmount = totals.discountAmount;
    order.transportInvoice.additionsAmount = totals.additionsAmount;
    order.transportInvoice.totalAmount = totals.grossAmount;
    order.transportInvoice.priceLines = recalculated.map(row => ({ itemId: row.item.id, productName: getProduct(row.item.productId)?.name || '—', deliveredKg: row.grossKg, unitPrice: row.unitPrice, amount: moneyRound(row.grossKg * row.unitPrice) }));
  }
  const now = store.nowIso();
  recordEditSnapshot(payment, 'SALES', ctx.user, before, now);
  if (edit?.status === 'PENDING_SALES_REVIEW') {
    edit.status = 'COMPLETED'; edit.salesReviewedAt = now; edit.salesReviewedBy = ctx.user.id;
  }
  order.updatedAt = now;
  store.audit(ctx.user, 'SALES_INVOICE_EDITED', 'order', order.id, { paymentId: payment.id, invoiceNumber: payment.invoiceNumber, priceLineCount: recalculated.length, subtotalAmount: totals.subtotalAmount, totalAmount: totals.totalAmount, amountDue: totals.amountDue, settlementMethods }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order), expiresAt } };
}));

// Sales cannot complete a warehouse correction request until it has been returned
// from the warehouse. This GET endpoint is intentionally read-only for history.
route('GET', '/api/warehouse/document-edits/history/:orderId/:paymentId', { roles: ['sales', 'warehouse', 'admin'] }, ctx => {
  const order = getOrder(store.get(), ctx.params.orderId);
  const rows = (order.documentEdits || []).filter(edit => edit.paymentId === ctx.params.paymentId).map(edit => ({ id: edit.id, status: edit.status, requestedAt: edit.requestedAt, requestedByName: edit.requestedByName, warehouseCompletedAt: edit.warehouseCompletedAt || null, warehouseCompletedBy: edit.warehouseCompletedBy || null, salesReviewedAt: edit.salesReviewedAt || null, salesReviewedBy: edit.salesReviewedBy || null, reason: edit.reason, items: edit.correctedItems || edit.items }));
  return { status: 200, body: { edits: rows } };
});
