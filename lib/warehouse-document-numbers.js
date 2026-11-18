'use strict';
// One persistent series shared by ordinary documents and individual store services.
// Existing numbers and audit entries are never rewritten.
const LIMIT = 999999;
const parse = value => {
  const match = /^W-(\d{6})$/.exec(String(value || ''));
  return match && Number(match[1]) > 0 ? Number(match[1]) : 0;
};
const label = n => `W-${String(n).padStart(6,'0')}`;
function highWater(data) {
  const value = data.counters?.warehouseDocumentNumber;
  const high = value == null ? 0 : Number(value);
  if (!Number.isSafeInteger(high) || high < 0 || high > LIMIT) throw new Error('شمارنده شماره سند انبار نامعتبر است.');
  const used = new Set(); let max = high;
  for (const o of data.orders || []) {
    const numbers = [o.warehouseDocumentNo, ...Object.values(o.storeWarehouseDocumentNos || {})];
    for (const value of numbers) {
      if (value == null || value === '') continue;
      const n = parse(value);
      if (!n || used.has(n)) throw new Error('شماره سند انبار نامعتبر یا تکراری است؛ داده‌ها را بدون بازنویسی بررسی کنید.');
      used.add(n); max = Math.max(max,n);
    }
  }
  return max;
}
function ensureWarehouseDocumentNumbers(data) {
  const high = highWater(data), completed = new Map();
  for (const e of data.audit || []) if (e.action === 'WAREHOUSE_FINALIZE' && e.entityId && !completed.has(e.entityId)) completed.set(e.entityId,e.createdAt || '');
  const pending = (data.orders || []).filter(o => o.orderType !== 'STORE' && !o.warehouseDocumentNo && (o.warehouseCompletedAt || completed.has(o.id)))
    .map(o => ({order:o, run:0, at:completed.get(o.id) || o.warehouseCompletedAt || ''}));
  const SR = require('./store-runs'), paidRuns=new Map();
  for (const p of data.payments || []) { const k=String(p.orderId)+'|'+Number(p.deliveryRun); if(!paidRuns.has(k))paidRuns.set(k,p); }
  for (const order of data.orders || []) {
    if (order.orderType !== 'STORE') continue;
    for (const run of [1,2]) {
      if (order.storeWarehouseDocumentNos?.[run]) continue;
      const sh=SR.runShipmentOf(order,run), dispatch=SR.runDispatchOf(order,run);
      const pay=paidRuns.get(String(order.id)+'|'+run);
      if (sh || dispatch || pay) pending.push({order,run,at:sh?.sentAt || dispatch?.assignedAt || pay?.verifiedAt || ''});
    }
  }
  pending.sort((a,b)=>String(a.at).localeCompare(String(b.at)) || String(a.order.id).localeCompare(String(b.order.id)) || a.run-b.run);
  if (high + pending.length > LIMIT) throw new Error('ظرفیت شماره سند انبار تمام شده است.');
  let next=high;
  const changed=!!pending.length || (high > 0 && Number(data.counters?.warehouseDocumentNumber) !== high);
  // Startup/restore runs this against a detached snapshot, saved in one transaction.
  for (const {order,run} of pending) {
    const number=label(++next);
    if (run) order.storeWarehouseDocumentNos={...(order.storeWarehouseDocumentNos || {}),[run]:number};
    else order.warehouseDocumentNo=number;
  }
  if (changed) { data.counters ||= {}; data.counters.warehouseDocumentNumber=next; }
  return changed;
}
function assignWarehouseDocumentNumber(data, order) {
  const high=highWater(data);
  if (order.warehouseDocumentNo) return order.warehouseDocumentNo;
  if (high >= LIMIT) throw new Error('ظرفیت شماره سند انبار تمام شده است.');
  data.counters ||= {};
  // Persist the counter before the order. An interrupted write can leave a gap,
  // never a second document with the same allocated number.
  data.counters.warehouseDocumentNumber=high+1;
  order.warehouseDocumentNo=label(high+1);
  return order.warehouseDocumentNo;
}
function assignStoreWarehouseDocumentNumber(data,order,run) {
  if (order.orderType !== 'STORE' || ![1,2].includes(run)) throw new Error('سرویس فروشگاه معتبر نیست.');
  const high=highWater(data);
  if (order.storeWarehouseDocumentNos?.[run]) return order.storeWarehouseDocumentNos[run];
  if (high >= LIMIT) throw new Error('ظرفیت شماره سند انبار تمام شده است.');
  data.counters ||= {};
  data.counters.warehouseDocumentNumber=high+1;
  order.storeWarehouseDocumentNos={...(order.storeWarehouseDocumentNos || {}),[run]:label(high+1)};
  return order.storeWarehouseDocumentNos[run];
}
module.exports={ensureWarehouseDocumentNumbers,assignWarehouseDocumentNumber,assignStoreWarehouseDocumentNumber,LIMIT};
