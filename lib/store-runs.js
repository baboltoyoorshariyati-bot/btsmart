'use strict';
// سفارش فروشگاه — سرویس اول/سرویس دوم (v37.4.0)
// مدل: یک سفارش اصلی؛ عملیات هر سرویس به‌صورت مستقل روی همان قلم (orderItems) ثبت می‌شود.
// هیچ سفارش جدیدی به‌ازای سرویس یا محصول ساخته نمی‌شود و تاریخچهٔ وزن‌ها هرگز پاک نمی‌شود.

const ACTIVE = (i) => i.itemStatus !== 'CANCELLED';

// فقط سفارش‌های فروشگاهی — قانون ۱۴ طبق سند: این قابلیت صرفاً برای مشتریان «فروشگاه» فعال است
function isStoreRunOrder(order) { return !!order && order.orderType === 'STORE'; }

function ensureArrays(item) {
  if (!Array.isArray(item.runR1)) item.runR1 = [];
  if (!Array.isArray(item.runR2)) item.runR2 = [];
  return item;
}
const sumKg = (arr) => Math.round((Array.isArray(arr) ? arr : []).reduce((s, e) => s + Number(e.kg || 0), 0) * 1000) / 1000;
const r1Kg = (item) => item?.runR1CorrectedKg != null && Number.isFinite(Number(item.runR1CorrectedKg)) ? Number(item.runR1CorrectedKg) : sumKg(item.runR1);
const r2Kg = (item) => item?.runR2CorrectedKg != null && Number.isFinite(Number(item.runR2CorrectedKg)) ? Number(item.runR2CorrectedKg) : sumKg(item.runR2);
const runTotalKg = (item) => r1Kg(item) + r2Kg(item);
const hasRunActivity = (item) => !!(item && (r1Kg(item) > 0 || r2Kg(item) > 0 || item.movedToR2 || item.shortageClosed || item.runCompleted));

// وضعیت محصول (بند ۹ سند): در انتظار سرویس اول / در حال ارسال / منتقل‌شده به سرویس دوم / تکمیل‌شده / بسته با کسری
function itemRunStatus(item) {
  if (!item) return 'AWAITING_R1';
  if (item.shortageClosed) return 'CLOSED_SHORT';
  if (item.runCompleted) return 'COMPLETED';
  if (item.movedToR2) return 'MOVED_R2';
  if (r1Kg(item) > 0 || r2Kg(item) > 0) return 'IN_SHIPPING';
  return 'AWAITING_R1';
}
const ITEM_STATUS_FA = {
  AWAITING_R1: 'در انتظار سرویس اول',
  IN_SHIPPING: 'در حال ارسال',
  MOVED_R2: 'منتقل‌شده به سرویس دوم',
  COMPLETED: 'تکمیل‌شده',
  CLOSED_SHORT: 'بسته با کسری',
};
const UNRESOLVED = (st) => !['COMPLETED', 'CLOSED_SHORT'].includes(st);

// وضعیت کلی سفارش (بند ۹ سند) بر اساس تعیین‌تکلیف بودن همهٔ ردیف‌ها
function orderOverallStatus(items) {
  const active = items.filter(ACTIVE);
  if (!active.length) return 'AWAITING_R1';
  const st = active.map(itemRunStatus);
  const unresolved = st.filter(UNRESOLVED).length;
  const shortN = st.filter((s) => s === 'CLOSED_SHORT').length;
  if (unresolved === 0) return shortN > 0 ? 'CLOSED_SHORT' : 'COMPLETED';
  const anyR1 = active.some((i) => r1Kg(i) > 0);
  if (!anyR1) return 'AWAITING_R1';
  const allMoved = st.every((s) => !UNRESOLVED(s) || s === 'MOVED_R2');
  if (allMoved) return 'AWAITING_R2';
  return 'IN_PROGRESS';
}
const ORDER_STATUS_FA = {
  AWAITING_R1: 'در انتظار سرویس اول',
  IN_PROGRESS: 'در حال انجام',
  AWAITING_R2: 'در انتظار سرویس دوم',
  COMPLETED: 'تکمیل‌شده',
  CLOSED_SHORT: 'بسته با کسری',
};

// وضعیت هر سرویس برای سربرگ (بند ۴ سند)
function serviceStatus(items, run) {
  const active = items.filter(ACTIVE);
  if (!active.length) return 'NOT_NEEDED';
  const list = run === 1 ? itemRunStatusListR1(active) : itemRunStatusListR2(active);
  const doneN = list.filter((x) => x === 'DONE').length;
  const needN = list.filter((x) => x !== 'NOT_NEEDED').length;
  if (!needN) return 'NOT_NEEDED';
  if (doneN === needN) return 'DONE';
  if (list.some((x) => x === 'IN_PROGRESS') || doneN > 0) return 'IN_PROGRESS';
  return 'PENDING';
}
function itemRunStatusListR1(active) {
  return active.map((i) => {
    if (r1Kg(i) > 0) return 'DONE';
    if (i.movedToR2 || i.shortageClosed) return 'DONE'; // بدون ارسال در سرویس اول تعیین‌تکلیف شد
    return 'PENDING';
  });
}
function itemRunStatusListR2(active) {
  return active.map((i) => {
    const st = itemRunStatus(i);
    if (st === 'COMPLETED' || st === 'CLOSED_SHORT') return 'DONE';
    if (i.movedToR2) return r2Kg(i) > 0 ? 'IN_PROGRESS' : 'PENDING';
    return 'NOT_NEEDED';
  });
}
const SERVICE_STATUS_FA = { PENDING: 'در انتظار', IN_PROGRESS: 'در حال انجام', DONE: 'پایان‌یافته', NOT_NEEDED: 'نیاز ندارد' };

// ---------- v37.5.0: «اقلام وزن‌شده باید ارسال شوند» — ارسال هر سرویس به فروش، تعیین راننده و تحویل فیزیکی ----------
// هر سرویس → درخواست ارسال به فروش (storeRunOps.r1Shipment/r2Shipment {run,itemIds,sentAt,sentBy,sentByName,status})
// → قیمت‌گذاری و تعیین راننده توسط فروش → order.dispatch فعلی (آخرین خدمه‌بر) → آرشیو نهایی‌شده‌ها در order.dispatches[]

function runShipmentOf(order, run) {
  const ops = order.storeRunOps || {};
  const sh = run === 1 ? ops.r1Shipment : ops.r2Shipment;
  return sh || null;
}
// dispatch متعلق به یک سرویس (اسلات فعلی order.dispatch یا آرشیو order.dispatches)
function runDispatchOf(order, run) {
  if (order.dispatch && order.dispatch.run === run) return order.dispatch;
  return (Array.isArray(order.dispatches) ? order.dispatches : []).find((d) => d && d.run === run) || null;
}
const RUN_DISPATCH_FINAL = ['SALES_FINALIZED', 'CLOSED'];
const RUN_DELIVERY_FA = {
  ASSIGNED: 'به راننده واگذار شد',
  DRIVER_EXIT_REPORTED: 'خروج راننده ثبت شد (منتظر نگهبان)',
  IN_TRANSIT: 'در حال ارسال به فروشگاه',
  DELIVERED: 'تحویل ثبت شد (منتظر نهایی فروش)',
  SALES_FINALIZED: 'نهایی‌شده نزد فروش',
  RECEIPT_CONFIRMED: 'دریافت توسط فروشگاه تأیید شد',
  CLOSED: 'نهایی‌شده نزد فروش',
  SENT_TO_SALES: 'به فروش ارسال شد (منتظر تعیین راننده)',
};
// مرحلهٔ تحویل هر سرویس برای سربرگ (بعد از ارسال به فروش)
function runDeliveryStage(order, run) {
  const trip=order.transportWorkflow===1&&order.transportStoreTrips?.[String(run)];
  if(trip){const labels={IN_TRANSIT:'در حال ارسال به فروشگاه',RECEIPT_CONFIRMED:'دریافت توسط فروشگاه تأیید شد',CLOSED:'مدارک سرویس نزد فروش ثبت شد'};return {key:trip.status,label:labels[trip.status]||trip.status};}
  const d = runDispatchOf(order, run);
  if (d) {
    if (RUN_DELIVERY_FA[d.status] === undefined && !d.storeReceiptConfirmedAt) return null;
    if (d.storeReceiptConfirmedAt) return { key: 'RECEIPT_CONFIRMED', label: RUN_DELIVERY_FA.RECEIPT_CONFIRMED };
    return { key: d.status, label: RUN_DELIVERY_FA[d.status] || d.status };
  }
  const sh = runShipmentOf(order, run);
  if (sh) return { key: 'SENT_TO_SALES', label: RUN_DELIVERY_FA.SENT_TO_SALES };
  return null;
}
// v37.33.0 — چه قلمی جلوی بسته‌شدن سفارش را می‌گیرد؟ فقط قلمی که واقعاً تعیین‌تکلیف نشده است:
// وزنِ ثبت‌شده ولی ارسال‌نشده، سرویس دومِ وعده‌داده‌شده (منتقل‌شده) ولی ارسال‌نشده، یا کسریِ بی‌تصمیم
// (مجموع وزن‌ها کمتر از درخواست و نه «تکمیل محصول» خورده نه «عدم موجودی»).
// قلمی که کل درخواستش وزن شده و در سرویس خودش به فروش ارسال شده، برای بسته‌شدن سفارش دیگر
// نیازی به فشردن دستی «تکمیل محصول» ندارد؛ پیش‌تر همین شرط، سفارش را پس از تأیید نهایی فروش
// برای همیشه در «در جریان» فروش و «آماده‌سازی» انبار نگه می‌داشت.
function itemBlocksClose(order, item) {
  if (!item) return false;
  // تعیین تکلیف محصول جایگزین ارسال وزن ثبت‌شده به فروش نیست.
  if (r1Kg(item) > 0 && !item.sentRun1) return true;
  if (r2Kg(item) > 0 && !item.sentRun2) return true;
  if (item.shortageClosed || item.runCompleted) return false;
  // Partial orders have one shipment and explicit completion per row. A
  // requested count/pack must never be compared with a weight in kilograms.
  if (require('./store-order-kind').isPartial(order)) return true;
  if (item.movedToR2 && !item.sentRun2) return true;
  if (runTotalKg(item) < Number(item.requestedQty || 0)) return true;
  return false;
}

// Restart means zero active weight. A sent weight must never be removed from
// an issued shipment or document, even if a later service is still open.
function completionReopenRun(order, item) {
  if (!isStoreRunOrder(order) || order.status !== 'WAREHOUSE_PREPARING' || !item?.runCompleted || item.shortageClosed || !ACTIVE(item)) return null;
  const shipmentHasItem = run => {
    const sh=runShipmentOf(order,run);
    return !!sh && ((sh.itemIds || []).includes(item.id) || Object.prototype.hasOwnProperty.call(sh.weights || {},item.id));
  };
  if(item.sentRun1 || item.sentRun2 || shipmentHasItem(1) || shipmentHasItem(2)) return null;
  const canWeigh = run => {
    const sh=runShipmentOf(order,run);
    return !(sh && sh.status!=='PENDING_SALES') && !order.transportHandovers?.[String(run)] && !order.transportStoreTrips?.[String(run)];
  };
  if(canWeigh(1)) return 1;
  if(!require('./store-order-kind').isPartial(order) && runShipmentOf(order,1) && canWeigh(2)) return 2;
  return null;
}

// آیا همهٔ اقلام فعال نهایی‌شده‌اند و همهٔ dispatch های سرویس نهایی‌اند → سفارش بسته می‌شود
function orderFullyClosed(order, items) {
  const active = items.filter(ACTIVE);
  if (!active.length) return false;
  if (active.some((i) => itemBlocksClose(order, i))) return false;
  for (const run of [1, 2]) {
    const sh = runShipmentOf(order, run);
    if (sh && sh.status === 'PENDING_SALES') return false;
    if (sh || runDispatchOf(order, run)) {
      const d = runDispatchOf(order, run);
      if (!d || !RUN_DISPATCH_FINAL.includes(d.status)) return false;
    }
  }
  return true;
}

// دید یکپارچهٔ سفارش فروشگاه برای همهٔ کارتابل‌ها (فروش، انبار، فروشگاه، گزارش)
function buildStoreRunView(order, items) {
  const active = items.filter(ACTIVE);
  const counts = {
    total: active.length,
    completed: 0,
    remaining: 0,
    short: 0,
  };
  const itemViews = active.map((it) => {
    const st = itemRunStatus(it);
    if (st === 'COMPLETED') counts.completed++;
    else if (st === 'CLOSED_SHORT') counts.short++;
    else counts.remaining++;
    return {
      itemId: it.id,
      runStatus: st,
      runStatusLabel: ITEM_STATUS_FA[st],
      r1Kg: r1Kg(it),
      r2Kg: r2Kg(it),
      totalKg: runTotalKg(it),
      shortageKg: it.shortageClosed && (!require('./store-order-kind').isPartial(order) || it.requestedUnit === 'کیلوگرم') ? Math.max(0, Math.round((Number(it.requestedQty || 0) - runTotalKg(it)) * 1000) / 1000) : null,
      movedToR2: it.movedToR2 || null,
      shortageClosed: it.shortageClosed || null,
      runCompleted: it.runCompleted || null,
      reopenRun: completionReopenRun(order,it),
      sentInR1: !!it.sentRun1,
      sentInR2: !!it.sentRun2,
    };
  });
  const stage1 = runDeliveryStage(order, 1);
  const stage2 = runDeliveryStage(order, 2);
  return {
    enabled: true,
    overall: orderOverallStatus(items),
    overallLabel: ORDER_STATUS_FA[orderOverallStatus(items)],
    r1Status: serviceStatus(items, 1),
    r2Status: serviceStatus(items, 2),
    r1StatusLabel: SERVICE_STATUS_FA[serviceStatus(items, 1)],
    r2StatusLabel: SERVICE_STATUS_FA[serviceStatus(items, 2)],
    r1Stage: stage1?.key || null,
    r1StageLabel: stage1?.label || null,
    r2Stage: stage2?.key || null,
    r2StageLabel: stage2?.label || null,
    counts,
    items: itemViews,
    finalizedAt: order.storeRunOps?.finalizedAt || null,
    finalizedBy: order.storeRunOps?.finalizedBy || null,
  };
}

module.exports = {
  isStoreRunOrder, ensureArrays, r1Kg, r2Kg, runTotalKg, hasRunActivity,
  itemRunStatus, ITEM_STATUS_FA, UNRESOLVED,
  orderOverallStatus, ORDER_STATUS_FA, buildStoreRunView, ACTIVE,
  runShipmentOf, runDispatchOf, runDeliveryStage, RUN_DISPATCH_FINAL, RUN_DELIVERY_FA, orderFullyClosed, completionReopenRun, itemBlocksClose,
};
