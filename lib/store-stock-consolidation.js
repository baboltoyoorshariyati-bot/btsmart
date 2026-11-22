'use strict';
// Read-only building block for a future stock-only consolidated service.
// This does not join orders, issue documents, expose an API or change workflow.
const SR = require('./store-runs');

function decimalParts(value) {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error('مقدار درخواستی معتبر نیست.');
  const exponent = Number(match[3] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error('مقدار درخواستی معتبر نیست.');
  let digits = BigInt(match[1] + (match[2] || ''));
  let scale = (match[2] || '').length - exponent;
  if (scale < 0) { digits *= 10n ** BigInt(-scale); scale = 0; }
  return { digits, scale };
}
function decimalSum(values) {
  const parts = values.map(decimalParts);
  const scale = Math.max(0, ...parts.map(p => p.scale));
  const sum = parts.reduce((n, p) => n + p.digits * 10n ** BigInt(scale - p.scale), 0n);
  if (!scale) return sum.toString();
  const padded = sum.toString().padStart(scale + 1, '0');
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`.replace(/\.?0+$/, '');
}

function productNameKey(value) { return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' '); }

function previewStockService({ orders, items, products }) {
  if (!Array.isArray(orders) || !orders.length || !Array.isArray(items) || !Array.isArray(products)) throw new Error('فهرست سفارش‌ها و اقلام معتبر نیست.');
  const byOrder = new Map();
  let branch = null;
  for (const order of orders) {
    if (!order?.id || byOrder.has(order.id)) throw new Error('شناسهٔ سفارش نامعتبر یا تکراری است.');
    if (order.orderType !== 'STORE' || order.storeOrderKind !== 'PARTIAL' || order.storePurpose !== 'STOCK' || order.customerId) throw new Error('فقط سفارش جزئی تکمیل فروشگاه قابل تجمیع است.');
    const b = Number(order.branchNo);
    if (!Number.isInteger(b) || b < 1 || b > 59 || (branch !== null && b !== branch)) throw new Error('سفارش‌ها باید متعلق به یک شعبهٔ معتبر باشند.');
    branch = b;
    if (order.transportWorkflow !== 1 || order.deliveryMode !== 'DELIVERY' || !['WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING'].includes(order.status) || order.approvalStatus !== 'APPROVED') throw new Error('سفارش باید تأییدشده و آمادهٔ کار انبار باشد.');
    if (order.transportHandovers?.['1'] || order.transportStoreTrips?.['1']) throw new Error('سرویس تحویل‌شده قابل تجمیع نیست.');
    byOrder.set(order.id, order);
  }
  const productById = new Map(products.map(p => [p.id, p]));
  const groups = new Map(), seen = new Set(), ordersWithItems = new Set();
  for (const item of items) {
    if (!byOrder.has(item.orderId) || item.itemStatus === 'CANCELLED') continue;
    if (!item.id || seen.has(item.id)) throw new Error('شناسهٔ قلم نامعتبر یا تکراری است.');
    seen.add(item.id);
    const product = productById.get(item.productId);
    if (!product?.id || !product.name) throw new Error('محصول یک قلم یافت نشد؛ پیش از تجمیع بررسی شود.');
    // Match by normalized name as requested, but retain every catalog identity
    // at source level so distinct original orders remain traceable.
    const name = productNameKey(product.name);
    if (!name) throw new Error('نام محصول معتبر نیست.');
    if (!item.requestedUnit || !Number.isFinite(Number(item.requestedQty)) || Number(item.requestedQty) <= 0) throw new Error('مقدار یا واحد درخواستی معتبر نیست.');
    ordersWithItems.add(item.orderId);
    if (!groups.has(name)) groups.set(name, { productId: product.id, productName: product.name, productIds: [], amounts: new Map(), weightKg: 0, sources: [] });
    const group = groups.get(name);
    if (!group.productIds.includes(product.id)) group.productIds.push(product.id);
    if (!group.amounts.has(item.requestedUnit)) group.amounts.set(item.requestedUnit, []);
    group.amounts.get(item.requestedUnit).push(item.requestedQty);
    group.weightKg = Math.round((group.weightKg + SR.r1Kg(item)) * 1000) / 1000;
    group.sources.push({ orderId: item.orderId, orderNo: byOrder.get(item.orderId).orderNo || '', itemId: item.id, productId: product.id, productName: product.name, requestedQty: item.requestedQty, requestedUnit: item.requestedUnit, description: item.description || '', weightKg: SR.r1Kg(item), completed: !!item.runCompleted, outOfStock: !!item.shortageClosed });
  }
  for (const order of orders) if (!ordersWithItems.has(order.id)) throw new Error('سفارش بدون قلم فعال قابل تجمیع نیست.');
  return { branchNo: branch, orderIds: orders.map(o => o.id), products: [...groups.values()].map(g => ({ ...g, amounts: [...g.amounts].map(([unit, quantities]) => ({ unit, quantity: decimalSum(quantities) })) })) };
}
module.exports = { previewStockService, decimalSum, productNameKey };
