'use strict';
// ترمیم محدود رکوردهای نیمه‌تمامی که پایان خودکار پیشین، پیش از ارسال وزن ثبت کرده است.
// سفارش بسته یا محموله‌ای که از فروش عبور کرده هرگز به‌صورت خودکار تغییر داده نمی‌شود.
const SR = require('./store-runs');
function recoverUnsentStoreRuns(db, audit) {
  let count = 0;
  for (const order of db.orders) {
    const ops = order.storeRunOps || {};
    if (order.orderType !== 'STORE' || order.status !== 'WAREHOUSE_PREPARING' || !ops.finalizedAt || (!ops.r1Shipment && !ops.r2Shipment)) continue;
    const items = db.orderItems.filter(i => i.orderId === order.id && SR.ACTIVE(i));
    const unsent = items.flatMap(i => [1, 2].filter(run => (run === 1 ? SR.r1Kg(i) > 0 && !i.sentRun1 : SR.r2Kg(i) > 0 && !i.sentRun2)).map(run => ({ itemId: i.id, run })));
    if (!unsent.length || unsent.some(({run}) => { if (run === 2 && !ops.r1Shipment) return true; const sh = run === 1 ? ops.r1Shipment : ops.r2Shipment; return sh && sh.status !== 'PENDING_SALES'; })) continue;
    const previous = { finalizedAt: ops.finalizedAt, finalizedBy: ops.finalizedBy || null, warehouseCompletedAt: order.warehouseCompletedAt || null };
    if (!require('./store-order-kind').isPartial(order)) order.storeAdditionClosedAt ||= ops.finalizedAt || order.warehouseCompletedAt;
    order.storeRunOps = { ...ops, finalizedAt: null, finalizedBy: null, finalizedByName: null };
    order.warehouseCompletedAt = null; order.warehouseCompletedBy = null;
    audit(order, { previous, unsent });
    count++;
  }
  return count;
}
module.exports = { recoverUnsentStoreRuns };
