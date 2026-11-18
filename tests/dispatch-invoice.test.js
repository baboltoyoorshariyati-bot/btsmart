'use strict';
// کسر فاکتور بر اساس مرجوعی: هم وقتی فاکتور صادر شده و هم وقتی بعد از تحویل تسویه می‌شود
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-inv-'));
const store = require('../lib/store');
const dispatch = require('../lib/dispatch');

function fresh() {
  store.init();
  const db = store.get();
  db.orderItems.length = 0; db.payments.length = 0; db.orders.length = 0; db.dispatchReturns.length = 0;
  return db;
}

test('مرجوعی پس از صدور فاکتور مبلغ فاکتور را کم می‌کند', () => {
  const db = fresh();
  const order = { id: 'o1', orderNo: '1', dispatch: { lines: [], events: [] } };
  db.orders.push(order);
  db.orderItems.push({ id: 'i1', orderId: 'o1', deliveredKg: 50, unitPrice: 1000, itemStatus: 'SETTLED' });
  db.payments.push({ id: 'p1', orderId: 'o1', totalAmount: 50000 });
  order.dispatch.lines = [{ itemId: 'i1', returnKg: 5, shortageKg: 0 }];
  const deduction = dispatch.applyReturnToInvoice(order);
  const pay = db.payments[0];
  assert.equal(deduction, 5000);
  assert.equal(pay.totalAmount, 45000);
  assert.equal(pay.grossAmount, 50000);
  // اعمال دوباره نباید دوباره کم کند
  dispatch.applyReturnToInvoice(order);
  assert.equal(db.payments[0].totalAmount, 45000);
});

test('شورت وزن روی فاکتور اثری ندارد و بدون قیمت، کسری صفر است', () => {
  const db = fresh();
  const order = { id: 'o2', dispatch: { lines: [{ itemId: 'i2', returnKg: 0, shortageKg: 3 }] } };
  db.orders.push(order);
  db.orderItems.push({ id: 'i2', orderId: 'o2', deliveredKg: 10, unitPrice: 2000 });
  db.payments.push({ id: 'p2', orderId: 'o2', totalAmount: 20000 });
  assert.equal(dispatch.applyReturnToInvoice(order), 0);
  assert.equal(db.payments[0].totalAmount, 20000);
});

test('اگر فاکتور هنوز صادر نشده، کسر در زمان تسویه اعمال می‌شود', () => {
  const db = fresh();
  const order = { id: 'o3', dispatch: { lines: [{ itemId: 'i3', returnKg: 4, shortageKg: 0 }] } };
  db.orders.push(order);
  db.orderItems.push({ id: 'i3', orderId: 'o3', deliveredKg: 10, unitPrice: 1500 });
  assert.equal(dispatch.applyReturnToInvoice(order), 6000, 'کسر مرجوعی حتی پیش از صدور فاکتور محاسبه می‌شود');
  assert.equal(order.dispatch.grossAmount, 15000);
  assert.equal(order.dispatch.amountDue, 9000);
  db.payments.push({ id: 'p3', orderId: 'o3', totalAmount: 15000 });
  assert.equal(dispatch.applyReturnToInvoice(order), 6000);
  assert.equal(db.payments[0].totalAmount, 9000);
});
