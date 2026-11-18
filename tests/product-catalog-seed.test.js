'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PRODUCTS_SEED, PRODUCT_CATALOG_VERSION } = require('../lib/catalog');
const store = require('../lib/store');

const sourceRows = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/product-catalog-90.json'), 'utf8'))
  .map(([rawCode, name]) => [String(Number(rawCode)).padStart(2, '0'), name]);

test('all 90 catalog code/name pairs match the uploaded source verbatim', () => {
  assert.equal(sourceRows.length, 90);
  assert.deepEqual(sourceRows.map(([code]) => code), Array.from({ length: 90 }, (_, i) => String(i + 1).padStart(2, '0')));
  assert.deepEqual(PRODUCTS_SEED.map(({ quickCode, name }) => [quickCode, name]), sourceRows);
  assert.equal(new Set(PRODUCTS_SEED.map(p => p.id)).size, 90);
  assert.equal(new Set(PRODUCTS_SEED.map(p => p.quickCode)).size, 90);
  // Repeated names stay as separate products under their original codes.
  assert.equal(PRODUCTS_SEED[4].name, PRODUCTS_SEED[8].name);
  assert.equal(PRODUCT_CATALOG_VERSION, '2026-11-11-catalog-90');
});

test('catalog upgrade renames existing codes in place, adds missing codes and preserves linked records', () => {
  const existing = PRODUCTS_SEED.slice(0, 63).map((p, i) => ({
    id: `legacy-product-${i + 1}`,
    quickCode: p.quickCode,
    name: `نام قبلی ${p.quickCode}`,
    defaultUnit: 'کیلوگرم',
    isActive: true,
  }));
  const firstProductId = existing[0].id;
  const data = {
    meta: { productCatalogVersion: '2026-10-05-catalog-63' },
    products: existing,
    priceList: [{ id: 'price-1', productId: firstProductId, price: 100 }],
    orderItems: [{ id: 'item-1', productId: firstProductId }],
  };

  assert.deepEqual(store.syncProductCatalog(data), { added: 27, total: 90 });
  assert.equal(data.meta.productCatalogVersion, PRODUCT_CATALOG_VERSION);
  assert.equal(data.products.length, 90);
  assert.equal(data.products[0].id, firstProductId);
  assert.equal(data.products[0].quickCode, '01');
  assert.equal(data.products[0].name, PRODUCTS_SEED[0].name);
  assert.equal(data.products[89].quickCode, '90');
  assert.equal(data.products[89].name, PRODUCTS_SEED[89].name);
  assert.equal(data.priceList[0].productId, firstProductId);
  assert.equal(data.orderItems[0].productId, firstProductId);

  data.products[0].name = 'نام سفارشی مدیر';
  assert.deepEqual(store.syncProductCatalog(data), { added: 0, total: 90 });
  assert.equal(data.products[0].name, 'نام سفارشی مدیر');
});
