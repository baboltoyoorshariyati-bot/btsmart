'use strict';
// Public order numbers are six-digit strings (leading zeroes are significant).
// Internal UUIDs, relationships and immutable audit entries are never changed.
const LIMIT = 999999;
const valid = v => /^\d{6}$/.test(String(v || '')) && Number(v) > 0;
const validStore = v => /^B\d{6}$/.test(String(v || '')); // v37.6.0 — شماره سفارش فروشگاه با پیشوند B و رمز شعبه
function ensureOrderNumbers(data) {
  const orders = data.orders || [];
  // Preserve historic numeric collisions between store and customer orders;
  // new numbers must still avoid every number already in use.
  const used = new Set(), scopedUsed = new Set(), pending = [];
  let high = Number(data.counters?.orderNumber) || 0;
  // شماره‌های سری فروشگاه (۴۱xxxx به بالا) در حوضهٔ مستقل خودشان می‌مانند؛
  // سفارش‌های مشتریان عادی که سابقاً در آن بازه افتاده‌اند به سری مشتریان عادی منتقل می‌شوند.
  const inStoreRange = (no) => { const n = Number(no); return n >= STORE_RANGE_MIN; };
  for (const order of orders) {
    const isStore = order.orderType === 'STORE';
    if (validStore(order.orderNo) && isStore && !used.has(String(order.orderNo))) { // v37.6.0 — سری B حفظ می‌شود و بذر شمارنده صرف‌نظر می‌گردد
      order.orderNo = String(order.orderNo);
      const n = Number(String(order.orderNo).slice(1));
      data.counters ||= {};
      const pref = Math.floor(n / 10000);
      const key = `storeOrder_${pref}`;
      data.counters[key] = Math.max(Number(data.counters[key]) || 0, n - pref * 10000);
      used.add(order.orderNo);
    } else if (valid(order.orderNo) && !scopedUsed.has(`${isStore?'STORE':'CUSTOMER'}:${order.orderNo}`) && (isStore || !inStoreRange(order.orderNo))) {
      order.orderNo = String(order.orderNo);
      used.add(order.orderNo);
      scopedUsed.add(`${isStore?'STORE':'CUSTOMER'}:${order.orderNo}`);
      if (!isStore) high = Math.max(high, Number(order.orderNo));
      else {
        const n = Number(order.orderNo);
        if (n >= STORE_RANGE_MIN) {
          const pref = Math.floor(n / 10000);
          data.counters ||= {};
          const key = `storeOrder_${pref}`;
          data.counters[key] = Math.max(Number(data.counters[key]) || 0, n - pref * 10000);
        }
      }
    } else pending.push(order);
  }
  pending.sort((a,b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  if (high + pending.length > LIMIT) throw new Error('ظرفیت شماره سفارش شش‌رقمی تمام شده است؛ شماره‌ها برای جلوگیری از تکرار بازنشانی نمی‌شوند.');
  for (const order of pending) {
    if (order.orderNo && !order.legacyOrderNo) order.legacyOrderNo = String(order.orderNo);
    if (order.orderType === 'STORE') {
      order.orderNo = nextStoreOrderNumber(data, order.branchNo ?? 1); // v37.6.0 — سری مجزای شعبه‌محور فروشگاه
    } else {
      do {
        if (high + 1 >= STORE_RANGE_MIN) throw new Error('ظرفیت شماره سفارش مشتریان عادی تمام شده است؛ بازهٔ ۴۱xxxx به بالا برای سفارش‌های فروشگاه رزرو است.');
        high += 1;
      } while (used.has(String(high).padStart(6, '0')));
      order.orderNo = String(high).padStart(6, '0');
    }
    used.add(order.orderNo);
  }
  data.counters ||= {};
  data.counters.orderNumber = high;
  const byId = new Map(orders.map(o => [o.id, o.orderNo]));
  // Refresh the denormalized order label in return records, not their IDs.
  for (const record of data.dispatchReturns || []) {
    const no = byId.get(record.orderId);
    if (no && record.orderNo !== no) {
      if (record.orderNo && !record.legacyOrderNo) record.legacyOrderNo = String(record.orderNo);
      record.orderNo = no;
    }
  }
  // Replayed successful API responses should show the new public label too.
  for (const cached of data.idempotency || []) {
    const order = cached.body?.order;
    if (order && byId.has(order.id)) order.orderNo = byId.get(order.id);
  }
  return pending.length;
}
function nextOrderNumber(data) {
  // No date prefix, letters or daily reset. The persisted global counter is monotonic.
  let next = (Number(data.counters?.orderNumber) || 0) + 1;
  const used = new Set((data.orders || []).map(o => String(o.orderNo || '')));
  while (Number.isSafeInteger(next) && next < STORE_RANGE_MIN && used.has(String(next).padStart(6, '0'))) next++;
  if (!Number.isSafeInteger(next) || next > LIMIT) throw new Error('ظرفیت شماره سفارش شش‌رقمی تمام شده است.');
  if (next >= STORE_RANGE_MIN) throw new Error(`ظرفیت شماره سفارش مشتریان عادی تمام شده است؛ بازهٔ ${STORE_RANGE_MIN} به بالا برای سفارش‌های فروشگاه رزرو است.`);
  data.counters ||= {};
  data.counters.orderNumber = next;
  return String(next).padStart(6, '0');
}

// ---------- v37.6.0 — سری مجزای شماره سفارش فروشگاه (شعبه‌محور) ----------
// هر شعبه پیشوند دو رقمی 40+branchNo دارد (شعبهٔ ۱ → 41، ۲ → 42، ۳ → 43 …)
// و شمارهٔ سفارش شش‌رقمی «پیشوند + چهار رقم دنباله» است، مثل ۴۱۰۰۰۱.
const STORE_BRANCH_MIN = 1, STORE_BRANCH_MAX = 59;
const STORE_RANGE_MIN = 410000;
function checkBranchNo(branchNo) {
  const b = Number(branchNo);
  if (!Number.isInteger(b) || b < STORE_BRANCH_MIN || b > STORE_BRANCH_MAX) {
    throw Object.assign(new Error('شمارهٔ شعبهٔ فروشگاه معتبر نیست؛ مدیر باید برای کاربر فروشگاه «شعبه»ٔ معتبر (۱ تا ۵۹) ثبت کند.'), { statusCode: 400, expose: true });
  }
  return b;
}
function nextStoreOrderNumber(data, branchNo) {
  const b = checkBranchNo(branchNo);
  const base = (40 + b) * 10000; // شعبهٔ ۱ → 410000
  data.counters ||= {};
  const key = `storeOrder_${40 + b}`;
  const seq = (Number(data.counters[key]) || 0) + 1;
  if (!Number.isSafeInteger(seq) || base + seq > (40 + b + 1) * 10000 - 1 || base + seq > LIMIT) {
    throw new Error(`ظرفیت شماره سفارش سری شعبهٔ ${b} (۹۹۹۹ سفارش) تمام شده است؛ شماره‌ها برای جلوگیری از تکرار بازنشانی نمی‌شوند.`);
  }
  data.counters[key] = seq;
  return `B${String(40 + b).padStart(2, '0')}${String(seq).padStart(4, '0')}`; // v37.6.0 — پیشوند B در ابتدای سفارش فروشگاه
}
module.exports = { ensureOrderNumbers, nextOrderNumber, nextStoreOrderNumber, checkBranchNo, LIMIT, STORE_RANGE_MIN };
