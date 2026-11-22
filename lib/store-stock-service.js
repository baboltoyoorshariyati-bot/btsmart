'use strict';
// Pure domain transitions only. Not yet wired to persistence or HTTP writes.
// Callers must perform membership changes and driver handover inside the same
// SQLite write transaction and must reject stale revisions before saving.
const { previewStockService, decimalSum, productNameKey } = require('./store-stock-consolidation');
const { weighingsFor } = require('./warehouse-weighing');
const { number, text, MAX_QTY } = require('./validate');
const SR = require('./store-runs');

function cleanKey(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error(`${field} معتبر نیست.`);
  return value.trim();
}
function guardOpen(service, expectedRevision) {
  if (!service || service.status !== 'OPEN') throw new Error('سرویس بسته شده است.');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== service.revision) throw new Error('سرویس تغییر کرده است؛ اطلاعات را دوباره بارگذاری کنید.');
}
function clone(service) { return structuredClone(service); }
function createService({ id, branchNo, createdAt, createdBy }) {
  const branch = Number(branchNo);
  if (!Number.isInteger(branch) || branch < 1 || branch > 59) throw new Error('شعبه معتبر نیست.');
  return { id: cleanKey(id, 'شناسه سرویس'), branchNo: branch, status: 'OPEN', revision: 0, createdAt: cleanKey(createdAt, 'زمان'), createdBy: cleanKey(createdBy, 'ثبت‌کننده'), orders: [], sources: [], weighings: [], handover: null };
}
function addOrder(service, { order, items, products, expectedRevision, at, by }) {
  guardOpen(service, expectedRevision);
  const actor = cleanKey(by, 'ثبت‌کننده'), when = cleanKey(at, 'زمان');
  const data = previewStockService({orders:[order], items, products});
  if (data.branchNo !== service.branchNo) throw new Error('سفارش متعلق به شعبهٔ دیگری است.');
  if (service.orders.some(o => o.orderId === order.id)) throw new Error('سفارش قبلاً به این سرویس افزوده شده است.');
  // Importing older, independently processed orders needs a migration plan.
  // Never duplicate already-issued documents, allocations, or historical weights.
  if (order.transportAssignments?.['1'] || order.storeRunOps?.r1Shipment || order.storeWarehouseDocumentNos?.['1'] || order.warehouseCompletedAt || order.storeRunOps?.finalizedAt) throw new Error('سفارش دارای فعالیت مستقل سرویس است و خودکار وارد تجمیع نمی‌شود.');
  const sourceItems = items.filter(i => i.orderId === order.id && i.itemStatus !== 'CANCELLED');
  if (sourceItems.some(i => i.itemStatus !== 'PENDING' || i.deliveredKg != null || i.warehouseStatus || SR.hasRunActivity(i) || i.sentRun1 || i.sentRun2)) throw new Error('سفارش دارای وزن یا تصمیم مستقل است و خودکار وارد تجمیع نمی‌شود.');
  const oldProducts = new Map(service.sources.map(s => [s.productId, productNameKey(s.productName)]));
  const seenIds = new Set(service.sources.map(s => s.itemId));
  for (const group of data.products) for (const source of group.sources) {
    if (seenIds.has(source.itemId)) throw new Error('این قلم قبلاً به سرویس افزوده شده است.');
    if (oldProducts.has(source.productId) && oldProducts.get(source.productId) !== productNameKey(source.productName)) throw new Error('نام کالای عضو سرویس تغییر کرده است؛ بررسی لازم است.');
    oldProducts.set(source.productId, productNameKey(source.productName));
  }
  const next = clone(service);
  next.orders.push({ orderId: order.id, orderNo: order.orderNo || '', storeId: order.storeId || '', addedAt: when, addedBy: actor });
  for (const group of data.products) for (const source of group.sources) next.sources.push({ ...source, resolution: 'PENDING' });
  next.revision++;
  return next;
}
function resolveSources(service, { productId, itemIds }) {
  const id = cleanKey(productId, 'محصول');
  if (!Array.isArray(itemIds) || !itemIds.length || itemIds.length > 1000 || itemIds.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim()) || new Set(itemIds).size !== itemIds.length) throw new Error('فهرست اقلام معتبر نیست.');
  const product = service.sources.find(s => s.productId === id);
  if (!product) throw new Error('قلم متعلق به این محصول و سرویس نیست.');
  const key = productNameKey(product.productName);
  return itemIds.map(itemId => {
    const item = service.sources.find(s => s.itemId === itemId);
    if (!item || productNameKey(item.productName) !== key) throw new Error('قلم متعلق به این محصول و سرویس نیست.');
    if (item.resolution !== 'PENDING') throw new Error('این قلم قبلاً تعیین تکلیف شده است.');
    return item;
  });
}
function weigh(service, { productId, itemIds, deliveredKg, weighings, note, expectedRevision, at, by }) {
  guardOpen(service, expectedRevision);
  const actor = cleanKey(by, 'ثبت‌کننده'), when = cleanKey(at, 'زمان');
  productId = cleanKey(productId, 'محصول');
  resolveSources(service, {productId, itemIds});
  const detail = weighingsFor(weighings);
  const kg = detail ? detail.netKg : number(deliveredKg, {field:'وزن خالص', min:0.001, max:MAX_QTY});
  const grams = Math.round(kg * 1000);
  if (Math.abs(grams - kg * 1000) > 1e-6) throw new Error('وزن حداکثر سه رقم اعشار دارد.');
  const explanation = text(note, {field:'توضیح', max:300});
  const next = clone(service);
  for (const id of itemIds) next.sources.find(s => s.itemId === id).resolution = 'WEIGHED';
  next.weighings.push({ productId, itemIds:[...itemIds], kg:grams / 1000, weighings:detail?.rows || null, note:explanation, at:when, by:actor });
  next.revision++;
  return next;
}
function markUnavailable(service, { productId, itemIds, note, expectedRevision, at, by }) {
  guardOpen(service, expectedRevision);
  const actor = cleanKey(by, 'ثبت‌کننده'), when = cleanKey(at, 'زمان');
  resolveSources(service, {productId, itemIds});
  const reason = text(note, {field:'توضیح',max:300});
  const next=clone(service);
  for (const id of itemIds) Object.assign(next.sources.find(s => s.itemId===id), { resolution:'OUT_OF_STOCK', unavailableAt:when, unavailableBy:actor, unavailableReason:reason });
  next.revision++;
  return next;
}
function serviceLines(service) {
  const groups = new Map();
  const productKeys=new Map();
  for (const source of service.sources) {
    const key=productNameKey(source.productName);
    if (!key || (productKeys.has(source.productId) && productKeys.get(source.productId)!==key)) throw new Error('نام کالای سرویس ناسازگار است.');
    productKeys.set(source.productId,key);
    if (!groups.has(key)) groups.set(key, {productId:source.productId,productName:source.productName,productIds:[],amounts:new Map(),sources:[],weighings:[]});
    const group=groups.get(key);
    if (!group.productIds.includes(source.productId)) group.productIds.push(source.productId);
    if (!group.amounts.has(source.requestedUnit)) group.amounts.set(source.requestedUnit,[]);
    group.amounts.get(source.requestedUnit).push(source.requestedQty);
    group.sources.push(clone(source));
  }
  for (const entry of service.weighings) {
    const group=groups.get(productKeys.get(entry.productId));
    if (!group) throw new Error('سابقهٔ وزن‌کشی ناسازگار است.');
    group.weighings.push(clone(entry));
  }
  return [...groups.values()].map(group => ({
    ...group,
    amounts:[...group.amounts].map(([unit, quantities]) => ({unit, quantity:decimalSum(quantities)})),
    deliveredKg:group.weighings.reduce((sum,entry)=>sum+Math.round(entry.kg*1000),0)/1000,
  }));
}
function handover(service, { documentNo, assignment, expectedRevision, at, by }) {
  guardOpen(service, expectedRevision);
  const when=cleanKey(at,'زمان'), actor=cleanKey(by,'ثبت‌کننده'), docNo=cleanKey(documentNo,'شماره سند');
  const required=['driverId','driverName','vehicleId','vehiclePlate'];
  for (const key of required) cleanKey(assignment?.[key], 'اطلاعات راننده و خودرو');
  if (!service.sources.length || service.sources.some(s=>s.resolution==='PENDING')) throw new Error('همهٔ اقلام باید وزن‌کشی یا عدم موجودی شوند.');
  const lines=serviceLines(service);
  if (!lines.some(l=>l.deliveredKg>0)) throw new Error('سرویس بدون کالای وزن‌شده قابل تحویل به راننده نیست.');
  const next=clone(service);
  next.status='HANDED_OVER'; next.revision++;
  next.handover={at:when,by:actor,assignment:clone(assignment),document:{documentNo:docNo,branchNo:service.branchNo,serviceId:service.id,orderNos:service.orders.map(o=>o.orderNo),lines}};
  return next;
}
module.exports = {createService, addOrder, weigh, markUnavailable, serviceLines, handover};
