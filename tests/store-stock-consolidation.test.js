'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { previewStockService } = require('../lib/store-stock-consolidation');
const order = (id, extra = {}) => ({ id, orderNo: `B${id}`, branchNo: 1, orderType: 'STORE', storeOrderKind: 'PARTIAL', storePurpose: 'STOCK', customerId: null, transportWorkflow: 1, deliveryMode: 'DELIVERY', status: 'WAREHOUSE_PREPARING', approvalStatus: 'APPROVED', ...extra });
const item = (id, orderId, requestedQty, requestedUnit, extra = {}) => ({ id, orderId, productId: 'chicken', requestedQty, requestedUnit, itemStatus: 'PENDING', ...extra });
const products = [{ id: 'chicken', name: 'مرغ' }, { id: 'leg', name: 'ران' }];

test('پیش‌نمایش فقط خواندنی: جمع درخواست‌ها به تفکیک واحد و حفظ منشأ و وزن‌های ثبت‌شده', () => {
  const a = order('a'), b = order('b'), c = order('c');
  const items = [item('i1', 'a', 50, 'کیلوگرم', { runR1: [{ kg: 50 }], runCompleted: { at: 'before' } }), item('i2', 'b', 30, 'کیلوگرم'), item('i3', 'c', 10, 'عدد'), item('i4', 'c', 2, 'بسته', { productId: 'leg', runR1: [{ kg: 2.125 }] }), item('cancelled', 'c', 100, 'کیلوگرم', { itemStatus: 'CANCELLED' })];
  const input = { orders: [a,b,c], items, products }, before = structuredClone(input);
  const result = previewStockService(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.orderIds, ['a','b','c']);
  const chicken = result.products.find(p => p.productId === 'chicken');
  assert.deepEqual(chicken.amounts, [{ unit: 'کیلوگرم', quantity: '80' }, { unit: 'عدد', quantity: '10' }]);
  assert.equal(chicken.weightKg, 50);
  assert.deepEqual(chicken.sources.map(s => s.itemId), ['i1','i2','i3']);
  assert.equal(chicken.sources[0].completed, true);
  items[1].runR1 = [{ kg: 29.75 }];
  assert.equal(previewStockService(input).products.find(p => p.productId === 'chicken').weightKg, 79.75);
  assert.equal(previewStockService(input).products.find(p => p.productId === 'leg').weightKg, 2.125);
});

test('اعشار درخواستی بدون خطای جمع اعشاری و بدون تبدیل واحد جمع می‌شوند', () => {
  const result = previewStockService({ orders: [order('a'), order('b')], items: [item('a1','a',0.1,'کیلوگرم'), item('b1','b',0.2,'کیلوگرم'), item('b2','b',1e-7,'عدد')], products });
  assert.deepEqual(result.products[0].amounts, [{unit:'کیلوگرم',quantity:'0.3'},{unit:'عدد',quantity:'0.0000001'}]);
});

test('شعبه، هدف، وضعیت و تحویل فیزیکی محافظت می‌شوند', () => {
  const data = { orders:[order('a'),order('b')], items:[item('i1','a',1,'عدد'),item('i2','b',1,'عدد')], products };
  for (const [change, message] of [
    [{branchNo:2}, /شعبه/], [{branchNo:null}, /شعبه/], [{storePurpose:'CUSTOMER'}, /تکمیل/], [{storeOrderKind:'BULK'}, /تکمیل/], [{customerId:'customer'}, /تکمیل/], [{status:'SCHEDULED_REMOTE'}, /تأییدشده/], [{approvalStatus:'PENDING_SALES'}, /تأییدشده/], [{transportHandovers:{'1':{}}}, /تحویل/], [{transportStoreTrips:{'1':{}}}, /تحویل/],
  ]) assert.throws(() => previewStockService({...data,orders:[data.orders[0],order('b',change)]}), message);
  assert.throws(() => previewStockService({...data,orders:[order('a'),order('a')]}), /تکراری/);
  assert.throws(() => previewStockService({...data,items:[data.items[0]]}), /بدون قلم/);
});

test('نام یکسان با شناسهٔ متفاوت در یک ردیف، با حفظ شناسه‌های اصلی و واحدهای مستقل', () => {
 const data={orders:[order('a'),order('b')],items:[item('i1','a',50,'کیلوگرم'),item('i2','b',30,'کیلوگرم',{productId:'other'}),item('i3','b',10,'عدد',{productId:'other'})],products:[...products,{id:'other',name:'  مرغ  '}]};
 const lines=previewStockService(data).products;
 assert.equal(lines.length,1);assert.deepEqual(lines[0].productIds,['chicken','other']);
 assert.deepEqual(lines[0].amounts,[{unit:'کیلوگرم',quantity:'80'},{unit:'عدد',quantity:'10'}]);
 assert.deepEqual(lines[0].sources.map(s=>s.productId),['chicken','other','other']);
});
