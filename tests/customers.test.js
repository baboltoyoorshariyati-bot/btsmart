'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/customer-core');

test('کد مشتری پنج‌رقمی (00001) و پشت‌سرهم ساخته می‌شود', () => {
  const db = { customers: [{ id: 'a', code: '00007' }], counters: {} };
  assert.equal(core.nextCode(db), '00008');
  assert.equal(core.nextCode(db), '00009');
  assert.equal(core.formatCode(1), '00001');
});

test('ensureCodes به مشتری‌های قدیمی بدون کد، کد یکتا می‌دهد و idempotent است', () => {
  const db = { customers: [{ id: 'x' }, { id: 'y', code: '00003' }, { id: 'z' }], counters: {} };
  core.ensureCodes(db);
  const codes = db.customers.map((c) => c.code);
  assert.equal(new Set(codes).size, 3);
  assert.equal(db.customers[1].code, '00003');
  const snapshot = JSON.stringify(db.customers);
  core.ensureCodes(db);
  assert.equal(JSON.stringify(db.customers), snapshot);
});

test('findExisting: کد یا شماره تماس، نه پلاک', () => {
  const db = { customers: [
    { id: '1', code: '00001', phone: '09120000001', plate: '12ب345-67' },
    { id: '2', code: '00002', phone: '09120000002', plate: '' },
  ] };
  assert.equal(core.findExisting(db, { code: 'c-00002' }).id, '2');
  assert.equal(core.findExisting(db, { code: 'C 00002' }).id, '2');
  assert.equal(core.findExisting(db, { phone: '09120000001' }).id, '1');
  assert.equal(core.findExisting(db, { plate: '12ب345-67' }), null);
  assert.equal(core.findExisting(db, { code: '00002', phone: '09120000001' }).id, '2');
  assert.equal(core.findExisting(db, { code: '99999', phone: '000' }), null);
});

test('cleanProfile: نام و تلفن الزامی است و کد ملی باید ۱۰ رقم باشد', () => {
  assert.throws(() => core.cleanProfile({ name: '', phone: '09121234567' }));
  assert.throws(() => core.cleanProfile({ name: 'علی', phone: '09121234567', nationalId: '123' }));
  const ok = core.cleanProfile({ name: 'علی رضایی', phone: '۰۹۱۲۱۲۳۴۵۶۷', nationalId: '۰۰۱۲۳۴۵۶۷۸', vehicleType: 'وانت' });
  assert.equal(ok.phone, '09121234567');
  assert.equal(ok.nationalId, '0012345678');
  assert.equal(ok.vehicleType, 'وانت');
});

test('upsertCustomer: همان شماره تماس به پرونده‌ی قبلی وصل می‌شود و پرونده‌ی تکراری نمی‌سازد', () => {
  const { upsertCustomer } = require('../lib/customers');
  const db = { customers: [], visits: [], orders: [], counters: {} };
  const first = upsertCustomer(db, { name: 'محمد', phone: '09123334444', plate: '', vehicleType: 'خودرو' });
  assert.equal(first.code, '00001');
  const again = upsertCustomer(db, { name: 'محمد احمدی', phone: '09123334444', plate: '12ب345-67' });
  assert.equal(again.id, first.id);
  assert.equal(db.customers.length, 1);
  assert.equal(again.name, 'محمد');
  assert.equal(again.plate, '12ب345-67');
});

test('upsertCustomer: کد مشتری ناشناس خطا می‌دهد و با کد معتبر همان پرونده را برمی‌گرداند', () => {
  const { upsertCustomer } = require('../lib/customers');
  const db = { customers: [], visits: [], orders: [], counters: {} };
  const c = upsertCustomer(db, { name: 'زهرا', phone: '09121110000' });
  assert.throws(() => upsertCustomer(db, { name: 'x', phone: '09129990000', customerCode: '00404' }), /پیدا نشد/);
  const same = upsertCustomer(db, { name: 'زهرا', phone: '09121110000', customerCode: c.code });
  assert.equal(same.id, c.id);
  assert.equal(db.customers.length, 1);
});
