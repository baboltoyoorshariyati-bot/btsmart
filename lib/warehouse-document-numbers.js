'use strict';
// One persistent series shared by ordinary documents and individual store services.
// Existing numbers and audit entries are never rewritten.
const LIMIT = 999999;
const parse = value => {
  const match = /^W-(\d{6})$/.exec(String(value || ''));
  return match && Number(match[1]) > 0 ? Number(match[1]) : 0;
};
const label = n => `W-${String(n).padStart(6,'0')}`;
// Live and freshly loaded store views can supply the current consolidated
// documents without adding a persisted setting or a second live collection.
const stockReaders=new WeakMap();
function bindStockDocumentNumbers(data, reader) {
  if (!data || typeof data!=='object' || typeof reader!=='function') throw new Error('منبع سندهای تجمیعی معتبر نیست.');
  stockReaders.set(data,reader);
  return data;
}
function stockNumbersFor(data) {
  const reader=stockReaders.get(data);
  const numbers=reader ? reader() : [];
  if (!Array.isArray(numbers)) throw new Error('فهرست سندهای تجمیعی معتبر نیست.');
  return numbers;
}
function highWater(data, stockDocumentNumbers = []) {
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
  for (const value of stockDocumentNumbers) {
    const n = parse(value);
    if (!n || used.has(n)) throw new Error('شماره سند انبار نامعتبر یا تکراری است؛ داده‌ها را بدون بازنویسی بررسی کنید.');
    used.add(n); max = Math.max(max,n);
  }
  return max;
}
function ensureWarehouseDocumentNumbers(data) {
  const high = highWater(data, stockNumbersFor(data)), completed = new Map();
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
  const high=highWater(data, stockNumbersFor(data));
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
  const high=highWater(data, stockNumbersFor(data));
  if (order.storeWarehouseDocumentNos?.[run]) return order.storeWarehouseDocumentNos[run];
  if (high >= LIMIT) throw new Error('ظرفیت شماره سند انبار تمام شده است.');
  data.counters ||= {};
  data.counters.warehouseDocumentNumber=high+1;
  order.storeWarehouseDocumentNos={...(order.storeWarehouseDocumentNos || {}),[run]:label(high+1)};
  return order.storeWarehouseDocumentNos[run];
}
// Experimental reservation for a consolidated service. The caller must read
// all orders, existing consolidated numbers and the counter under the same
// write lock, then persist both the new counter and the service atomically.
// Live order-based allocators include consolidated numbers through their bound
// reader. This alone does not enable the consolidated workflow.
function reserveStockServiceDocumentNumber(data, stockDocumentNumbers) {
  if (!Array.isArray(stockDocumentNumbers)) throw new Error('فهرست سندهای تجمیعی معتبر نیست.');
  const high=highWater(data, stockDocumentNumbers);
  if (high >= LIMIT) throw new Error('ظرفیت شماره سند انبار تمام شده است.');
  data.counters ||= {};
  data.counters.warehouseDocumentNumber=high+1;
  return label(high+1);
}
function validateStockServiceDocumentNumbers(data, stockDocumentNumbers) {
  if (!Array.isArray(stockDocumentNumbers)) throw new Error('فهرست سندهای تجمیعی معتبر نیست.');
  if (!stockDocumentNumbers.length) return;
  // Do not repair an untrusted backup. Reject duplicates and a counter which
  // could let an older allocation path reuse a consolidated document number.
  const counter=Number(data.counters?.warehouseDocumentNumber);
  if (!Number.isSafeInteger(counter) || counter<0 || counter>LIMIT) throw new Error('شمارنده شماره سند انبار نامعتبر است.');
  const max=highWater({orders:data.orders,counters:{warehouseDocumentNumber:0}},stockDocumentNumbers);
  if (counter<max) throw new Error('شمارنده شماره سند انبار از شماره‌های ثبت‌شده عقب‌تر است.');
}
module.exports={bindStockDocumentNumbers,ensureWarehouseDocumentNumbers,assignWarehouseDocumentNumber,assignStoreWarehouseDocumentNumber,reserveStockServiceDocumentNumber,validateStockServiceDocumentNumbers,LIMIT};
