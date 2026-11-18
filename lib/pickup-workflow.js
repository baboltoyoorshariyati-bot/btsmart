'use strict';
// Domain rules for the remote pickup workflow; transactions and HTTP roles
// enforce these rules before the corresponding UI actions are accepted.
const { normalizeRole, fail } = require('./http');
const validate = require('./validate');

const OPEN_ORDER = new Set(['SCHEDULED_REMOTE', 'WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING', 'RETURNED_TO_SALES', 'SETTLEMENT_PENDING', 'SETTLED']);
const CANCELLABLE_ORDER = new Set(['SCHEDULED_REMOTE', 'WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING', 'RETURNED_TO_SALES']);
const role = (actor, expected) => {
  if (!actor?.id || ![expected, 'admin'].includes(normalizeRole(actor.roleCode))) fail(403, 'دسترسی برای این نقش مجاز نیست.');
};
function pickup(order) {
  if (!order || order.orderType !== 'REMOTE' || order.deliveryMode !== 'PICKUP' || order.dispatch)
    fail(409, 'این عملیات فقط برای سفارش غیرحضوری با تحویل در انبار مجاز است.');
}
function date(value) {
  if (typeof value !== 'string') fail(400, 'تاریخ تحویل معتبر نیست.');
  const normalized = validate.digitsToAscii(value).trim();
  if (!validate.localDateTime(`${normalized}T12:00`)) fail(400, 'تاریخ تحویل معتبر نیست.');
  return normalized;
}
function assertVisit(order, visit) {
  if (!visit || !visit.id || visit.id !== order.visitId || visit.orderId !== order.id || visit.status !== 'PICKUP_PRESENT')
    fail(409, 'مراجعهٔ باز و مرتبط با این سفارش یافت نشد.');
}
function changeDeliveryDate(order, value, actor, today, activeVisit) {
  role(actor, 'sales'); pickup(order);
  const deliveryDate = date(value), day = date(today);
  if (!OPEN_ORDER.has(order.status) || order.pickupCancellation || order.pickupHandover || order.warehouseCompletedAt) fail(409, 'تاریخ این سفارش در وضعیت فعلی قابل تغییر نیست.');
  if (activeVisit?.orderId === order.id && activeVisit.status === 'PICKUP_PRESENT') fail(409, 'ابتدا وضعیت مراجعهٔ باز تعیین تکلیف شود.');
  if (deliveryDate < day) fail(400, 'تاریخ تحویل نمی‌تواند قبل از امروز باشد.');
  return { ...order, deliveryDate }; // scheduledAt and warehouse activation are untouched
}
function createEntry(order, body, actor, today, now, visitId, activeVisit) {
  role(actor, 'gate'); pickup(order);
  if (!OPEN_ORDER.has(order.status) || order.pickupCancellation || order.pickupHandover) fail(409, 'این سفارش برای ثبت ورود مجاز نیست.');
  if (order.warehouseCompletedAt || ['SETTLEMENT_PENDING','SETTLED'].includes(order.status)) fail(409, 'وزن نهایی این سفارش قبلاً در گردش قدیمی ثبت شده است؛ ابتدا کالا و سند بررسی شود.');
  if (!order.deliveryDate) fail(409, 'فروش ابتدا باید تاریخ تحویل را تعیین کند.');
  if (date(order.deliveryDate) !== date(today)) fail(409, 'ورود فقط در تاریخ تحویل تعیین‌شده مجاز است.');
  if (activeVisit?.orderId === order.id && activeVisit.status === 'PICKUP_PRESENT') fail(409, 'برای این سفارش ورود باز وجود دارد.');
  if (!visitId || !now) fail(500, 'شناسه یا زمان مراجعه موجود نیست.');
  const name = validate.text(body?.name, { field: 'نام تحویل‌گیرنده', max: 120, required: true });
  const phone = validate.phone(body?.phone);
  const noVehicle = body?.noVehicle === true;
  const vehicleType = validate.text(noVehicle ? 'بدون وسیله' : body?.vehicleType, { field: 'نوع وسیله', max: 40, required: true });
  const carType = noVehicle || vehicleType === 'موتورسیکلت' ? '' : validate.text(body?.carType, { field: 'نوع خودرو', max: 80, required: true });
  const plate = noVehicle ? validate.gatePlate(body?.plate, true) : validate.driverPlate(body?.plate, vehicleType);
  const recipient = { name, phone, vehicleType, carType, plate };
  const visit = { id: visitId, orderId: order.id, customerId: order.customerId, recipient, plate, vehicleType, carType, status: 'PICKUP_PRESENT', purpose: 'دریافت سفارش غیرحضوری', createdAt: now, createdBy: actor.id };
  return { order: { ...order, visitId, pickupRecipient: recipient }, visit };
}
function assertNoHandover(order, items) {
  if (!Array.isArray(items) || !items.length || items.some(i => !i || i.orderId !== order.id || (i.deliveredKg != null && (!Number.isFinite(Number(i.deliveredKg)) || Number(i.deliveredKg) < 0)))) fail(409, 'اقلام سفارش برای بررسی تحویل در دسترس نیستند.');
  if (order.warehouseCompletedAt || order.pickupHandover || (order.transportHandovers && Object.keys(order.transportHandovers).length) || items.some(i => i.warehouseStatus === 'DELIVERED' || i.itemStatus === 'DELIVERED' || Number(i.deliveredKg) > 0))
    fail(409, 'پس از ثبت تحویل یا وزن نهایی، ابتدا کالا و سند تعیین تکلیف شوند.');
}
function requestCancellation(order, visit, actor, now, reason, confirmedNoGoods, items) {
  role(actor, 'warehouse'); pickup(order); assertVisit(order, visit);
  if (!CANCELLABLE_ORDER.has(order.status)) fail(409, 'پس از ثبت تحویل یا وزن نهایی، ابتدا کالا و سند تعیین تکلیف شوند.');
  assertNoHandover(order, items);
  if (order.pickupCancellation) fail(409, 'درخواست انصراف قبلاً ثبت شده است.');
  if (confirmedNoGoods !== true) fail(400, 'انبار باید عدم تحویل کالا را تأیید کند.');
  const text = validate.text(reason, { field: 'دلیل انصراف', max: 300, required: true });
  return { ...order, pickupCancellation: { status: 'PENDING_SALES', visitId: visit.id, reason: text, requestedAt: now, requestedBy: actor.id, noGoodsConfirmed: true } };
}
function approveCancellation(order, visit, actor, now, items) {
  role(actor, 'sales'); pickup(order); assertVisit(order, visit);
  const request = order.pickupCancellation;
  if (!CANCELLABLE_ORDER.has(order.status)) fail(409, 'وضعیت کالا یا سفارش تغییر کرده است؛ بررسی مجدد لازم است.');
  assertNoHandover(order, items);
  if (!request || request.status !== 'PENDING_SALES' || request.visitId !== visit.id || request.noGoodsConfirmed !== true)
    fail(409, 'انصراف ابتدا باید توسط انبار ثبت شود.');
  const deposit = order.deposit?.status === 'RECEIVED'
    ? { ...order.deposit, status: Number(order.deposit.amount) > Number(order.deposit.refundedAmount || 0) ? 'REFUND_REQUIRED' : 'REFUNDED' }
    : order.deposit;
  return { ...order, status: 'CANCELLED', deposit, cancelReason: request.reason, pickupCancellation: { ...request, status: 'EXIT_APPROVED', approvedAt: now, approvedBy: actor.id } };
}
function cancellationExit(order, visit, actor, now) {
  role(actor, 'gate'); pickup(order); assertVisit(order, visit);
  if (order.status !== 'CANCELLED' || order.pickupCancellation?.status !== 'EXIT_APPROVED' || order.pickupCancellation.visitId !== visit.id)
    fail(409, 'خروج به دلیل انصراف هنوز توسط فروش تأیید نشده است.');
  return { order: { ...order, pickupCancellation: { ...order.pickupCancellation, status: 'EXITED', exitedAt: now, exitedBy: actor.id } }, visit: { ...visit, status: 'EXITED', exitedAt: now, exitedBy: actor.id, exitReason: 'CANCELLATION' } };
}
function recordHandover(order, visit, actor, now, physicalHandoverConfirmed) {
  role(actor, 'warehouse'); pickup(order); assertVisit(order, visit);
  if (order.status !== 'WAREHOUSE_PREPARING' || order.pickupCancellation || order.pickupHandover) fail(409, 'این سفارش در وضعیت قابل تحویل نیست.');
  if (physicalHandoverConfirmed !== true) fail(400, 'تحویل واقعی کالا باید تأیید شود.');
  if (!visit.recipient?.name || !visit.recipient?.phone) fail(409, 'مشخصات تحویل‌گیرنده ناقص است.');
  return { ...order, pickupHandover: { visitId: visit.id, recipient: { ...visit.recipient }, physicalHandoverConfirmed: true, handedOverAt: now, handedOverBy: actor.id } };
}
function goodsExit(order, visit, actor, now) {
  role(actor, 'gate'); pickup(order); assertVisit(order, visit);
  if (order.status !== 'SETTLED' || order.pickupCancellation || !order.pickupHandover?.physicalHandoverConfirmed || order.pickupHandover.visitId !== visit.id)
    fail(409, 'خروج کالا فقط پس از ثبت تحویل واقعی و تسویه سفارش مجاز است.');
  return { order: { ...order, status: 'EXITED', exitedAt: now, exitedBy: actor.id }, visit: { ...visit, status: 'EXITED', exitedAt: now, exitedBy: actor.id, exitReason: 'GOODS' } };
}
module.exports = { changeDeliveryDate, createEntry, requestCancellation, approveCancellation, cancellationExit, recordHandover, goodsExit };
