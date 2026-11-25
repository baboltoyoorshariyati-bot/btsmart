'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const reports = require('../lib/reports');

const db = {
  customers: [{ id: 'c1', code: '00001', name: 'علی احمدی', phone: '09121112233', plate: '12ب34567', createdAt: '2026-10-05T08:00', lastVisitAt: '' }],
  visits: [
    { id: 'v1', customerId: 'c1', createdAt: '2026-10-05T08:00', status: 'WAITING_SALES', district: 'بابل', purpose: 'خرید' },
    { id: 'v2', customerId: 'c1', createdAt: '2026-10-20T09:00', status: 'ORDERED', district: 'بابل', purpose: 'دریافت' },
  ],
  orders: [], orderItems: [], payments: [], products: [], priceList: [], drivers: [], users: [],
  audit: [{ id: 'a1', createdAt: '2026-10-05T08:01', username: 'gate1', action: 'CREATE_VISIT', entityType: 'visit', entityId: 'v1', details: { plate: 'x' }, ip: '1.2.3.4' }],
};

test('describe: همه منابع ستون و فیلد تاریخ دارند', () => {
  const list = reports.describe();
  assert.ok(list.length >= 8);
  for (const s of list) assert.ok(s.columns.length > 0, s.key);
});

test('query: فیلتر بازه‌ی تاریخ و ستون‌های انتخابی', () => {
  const r = reports.query(db, { source: 'visits', fields: ['createdAt', 'customerName'], from: '2026-10-10', to: '2026-10-31' });
  assert.equal(r.total, 1);
  assert.deepEqual(r.columns.map((c) => c.key), ['createdAt', 'customerName']);
  assert.equal(r.rows[0].customerName, 'علی احمدی');
});

test('query: فیلتر روی هر فیلد با شامل/برابر', () => {
  const r = reports.query(db, { source: 'visits', filters: [{ field: 'status', op: 'equals', value: 'ORDERED' }] });
  assert.equal(r.total, 1);
  const r2 = reports.query(db, { source: 'customers', filters: [{ field: 'phone', op: 'contains', value: '۰۹۱۲' }] });
  assert.equal(r2.total, 1);
});

test('query: منبع و ستون نامعتبر خطای ۴۰۰ می‌دهد', () => {
  assert.throws(() => reports.query(db, { source: 'nope' }), (e) => e.status === 400);
  assert.throws(() => reports.query(db, { source: 'visits', fields: ['x'] }), (e) => e.status === 400);
});

test('query: فعالیت‌ها با جزئیات فارسی و امکان انتخاب اطلاعات فنی', () => {
  const r = reports.query(db, { source: 'activity', fields: ['username', 'action', 'details'] });
  assert.equal(r.total, 1);
  assert.equal(r.rows[0].action, 'ثبت مراجعه');
  assert.match(r.rows[0].details, /پلاک : x/);
  const raw=reports.query(db,{source:'activity',fields:['actionCode','detailsRaw']});
  assert.equal(raw.rows[0].actionCode,'CREATE_VISIT');assert.match(raw.rows[0].detailsRaw,/plate/);
});


test('customer report aggregates merged profiles and legacy visit-linked orders once',()=>{
 const data={customers:[{id:'a',name:'اصلی',lastVisitAt:'2026-01-01'},{id:'b',name:'قدیمی',mergedInto:'a',lastVisitAt:'2026-02-01'},{id:'c',name:'دیگری'}],
 visits:[{id:'v1',customerId:'a'},{id:'v2',customerId:'b'},{id:'v3',customerId:'c'}],
 orders:[{id:'o1',customerId:'b',visitId:'v3'},{id:'o2',visitId:'v2'},{id:'o3',customerId:'c'},{id:'o4',customerId:'unknown',visitId:'v1'}]};
 const rows=reports.query(data,{source:'customers',fields:['name','visitCount','orderCount','lastVisitAt']}).rows;
 assert.deepEqual(rows,[{name:'اصلی',visitCount:2,orderCount:2,lastVisitAt:'2026-02-01'},{name:'دیگری',visitCount:1,orderCount:1,lastVisitAt:''}]);
});
