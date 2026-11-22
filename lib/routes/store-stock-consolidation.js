'use strict';
// Read-only preview only: it does not allocate a service, reserve stock or
// authorise a later handover. All future writes must revalidate under the
// shared transport transaction.
const { atomicRoute: route, fail } = require('../http');
const store = require('../store');
const { previewStockService } = require('../store-stock-consolidation');

// A branch-scoped view is a calculation over currently visible eligible
// orders, not a persisted service. Never silently truncate the source list.
route('GET', '/api/store-stock-consolidation/branches/:branch/preview', { roles: ['sales', 'warehouse'] }, ctx => {
  if (!/^(?:[1-9]|[1-5]\d)$/.test(ctx.params.branch)) fail(400, 'شماره شعبه معتبر نیست.');
  const branchNo=Number(ctx.params.branch), db=store.get();
  const orders=db.orders.filter(o=>o.orderType==='STORE' && o.storeOrderKind==='PARTIAL' && o.storePurpose==='STOCK' && !o.customerId && Number(o.branchNo)===branchNo && o.transportWorkflow===1 && o.deliveryMode==='DELIVERY' && o.approvalStatus==='APPROVED' && ['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(o.status) && !o.transportHandovers?.['1'] && !o.transportStoreTrips?.['1']);
  if (orders.length>100) fail(409,'تعداد سفارش‌ها بیش از حد پیش‌نمایش است؛ این نما نمی‌تواند فهرست ناقص نشان دهد.');
  if (!orders.length) return {body:{preview:{branchNo,orderIds:[],products:[]},readOnly:true}};
  let preview;
  try { preview=previewStockService({orders,items:db.orderItems,products:db.products}); }
  catch (err) { fail(409,err.message); }
  return {body:{preview,readOnly:true}};
});

route('GET', '/api/store-stock-consolidation/preview', { roles: ['sales', 'warehouse'] }, ctx => {
  const raw = ctx.query.get('orders') || '';
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) fail(400, 'شناسهٔ یک تا صد سفارش متفاوت را مشخص کنید.');
  const db = store.get();
  const byId = new Map(db.orders.map(order => [order.id, order]));
  const orders = ids.map(id => byId.get(id));
  if (orders.some(order => !order)) fail(404, 'یک یا چند سفارش یافت نشد.');
  let preview;
  try { preview = previewStockService({ orders, items: db.orderItems, products: db.products }); }
  catch (err) { fail(409, err.message); }
  return { body: { preview, readOnly: true } };
});
