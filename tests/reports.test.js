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

test('query: فعالیت‌ها با جزئیات JSON', () => {
  const r = reports.query(db, { source: 'activity', fields: ['username', 'action', 'details'] });
  assert.equal(r.total, 1);
  assert.match(r.rows[0].details, /plate/);
});
