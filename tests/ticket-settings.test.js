'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('../lib/ticket-settings');

test('defaults normalize to themselves', () => {
  const d = ts.defaults();
  const n = ts.normalize(d);
  assert.deepEqual(n.fields.map((f) => [f.key, f.col, f.row]), d.fields.map((f) => [f.key, f.col, f.row]));
  assert.equal(n.paper, 'A5L');
});

test('rejects unknown paper and out-of-range numbers', () => {
  assert.throws(() => ts.normalize({ paper: 'A3' }), /اندازه کاغذ/);
  assert.throws(() => ts.normalize({ marginMm: 99 }), /حاشیه/);
  assert.throws(() => ts.normalize({ fontPt: 1 }), /اندازه قلم/);
  assert.throws(() => ts.normalize({ colsMm: [32, 32] }), /ستون/);
  assert.throws(() => ts.normalize({ rowsMm: [5] }), /ردیف/);
});

test('rejects two visible fields in the same cell', () => {
  const d = ts.defaults();
  d.fields[1].col = d.fields[2].col;
  d.fields[1].row = d.fields[2].row;
  assert.throws(() => ts.normalize(d), /در یک خانه/);
  d.fields[1].show = false; // فیلد پنهان تداخلی ایجاد نمی‌کند
  assert.doesNotThrow(() => ts.normalize(d));
});

test('label cannot be empty and positions must be inside the grid', () => {
  const d = ts.defaults();
  d.fields[0].label = '   ';
  assert.throws(() => ts.normalize(d), /برچسب/);
  const e = ts.defaults();
  e.fields[0].col = 7;
  assert.throws(() => ts.normalize(e), /ستون/);
});

test('non-object input falls back to defaults', () => {
  assert.equal(ts.normalize(null).paper, 'A5L');
});
