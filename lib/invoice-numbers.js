'use strict';
// Public invoice numbers are six-digit strings (leading zeroes are significant).
// Internal UUIDs, relationships and immutable audit entries are never changed.
const LIMIT = 999999;
const valid = v => /^\d{6}$/.test(String(v || '')) && Number(v) > 0;
function ensureInvoiceNumbers(data) {
  const payments = data.payments || [];
  const used = new Set(), pending = [];
  let high = Number(data.counters?.invoiceNumber) || 0;
  // Preserve existing valid unique numbers; migrate legacy/missing/duplicate ones.
  for (const order of payments) {
    if (valid(order.invoiceNumber) && !used.has(String(order.invoiceNumber))) {
      order.invoiceNumber = String(order.invoiceNumber);
      used.add(order.invoiceNumber);high = Math.max(high, Number(order.invoiceNumber));
    } else pending.push(order);
  }
  pending.sort((a,b) => String(a.verifiedAt || a.createdAt || '').localeCompare(String(b.verifiedAt || b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  if (high + pending.length > LIMIT) throw new Error('ظرفیت شماره فاکتور شش‌رقمی تمام شده است؛ شماره‌ها برای جلوگیری از تکرار بازنشانی نمی‌شوند.');
  for (const order of pending) {
    if (order.invoiceNumber && !order.legacyInvoiceNumber) order.legacyInvoiceNumber = String(order.invoiceNumber);
    order.invoiceNumber = String(++high).padStart(6, '0');
  }
  data.counters ||= {};
  data.counters.invoiceNumber = high;
  const byId = new Map(payments.map(p => [p.id, p.invoiceNumber]));
  for (const cached of data.idempotency || []) {
    const payment = cached.body?.order?.payment;
    if (payment && byId.has(payment.id)) payment.invoiceNumber = byId.get(payment.id);
  }
  return pending.length;
}
function nextInvoiceNumber(data) {
  // No date prefix, letters or daily reset. The persisted global counter is monotonic.
  const next = (Number(data.counters?.invoiceNumber) || 0) + 1;
  if (!Number.isSafeInteger(next) || next > LIMIT) throw new Error('ظرفیت شماره فاکتور شش‌رقمی تمام شده است.');
  data.counters ||= {};
  data.counters.invoiceNumber = next;
  return String(next).padStart(6, '0');
}
module.exports = { ensureInvoiceNumbers, nextInvoiceNumber, LIMIT };
