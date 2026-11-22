'use strict';
// قرارداد لایهٔ SQL: جداول واقعی، ستونهای تایپشده، مهاجرت db.json،
// ماندگاری پس از ریاستارت، زنجیرهٔ Audit، پشتیبانگیری و قفل فقطخواندنی پرسوجوها.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PRODUCTS_SEED } = require('./helpers/catalog-fixture');

const root = path.join(__dirname, '..');
const NEW_PROCESS = (body, setup = '') => `
const fs=require('fs'),path=require('path');
${setup}
const s=require('./lib/store');
${body}
`;

function child(body, { env = {}, setup = '', dir = null } = {}) {
  const dataDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'bt-sql-'));
  const code = NEW_PROCESS(body, setup);
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', code], {
    cwd: root, env: { ...process.env, DATA_DIR: dataDir, ADMIN_INITIAL_PASSWORD: 'Sql!Test12345', ...env }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, `child failed: ${r.stderr}\n${r.stdout}`);
  const marker = 'RESULT:';
  assert.ok(r.stdout.includes(marker), `missing RESULT in: ${r.stdout}\n${r.stderr}`);
  return { dir: dataDir, value: JSON.parse(r.stdout.split(marker)[1].trim()) };
}

test('SQLite is the source of truth: a real table per entity with typed columns', () => {
  const { value } = child(`
    s.init();
    const sql=s.sql;
    console.log('RESULT:'+JSON.stringify({tables:sql.tables(),file:sql.dbFile(),schema:sql.SQL_SCHEMA_VERSION}));
  `);
  for (const t of ['users', 'roles', 'customers', 'products', 'orders', 'order_items', 'payments', 'visits', 'audit', 'price_list', 'notifications', 'idempotency', 'meta', 'counters']) {
    assert.ok(value.tables.includes(t), `table ${t} must exist`);
  }
  assert.match(value.file, /baboltoyoor\.db$/);
  assert.equal(value.schema, 1);
});

test('fresh install writes admin and roles with an empty catalog', () => {
  const { value } = child(`
    s.init();
    const sql=s.sql;
    console.log('RESULT:'+JSON.stringify({
      stats:sql.stats(),
      admin:sql.query("SELECT username, role_code, is_active FROM users WHERE role_code = ?",['admin']),
      productCols:sql.query("SELECT quick_code, name, is_active FROM products LIMIT 1"),
    }));
  `, { env: { BT_TEST_EMPTY_CATALOG: '1' } });
  assert.equal(value.stats.users, 1);
  assert.equal(value.stats.roles, 7);
  assert.equal(value.stats.products, 0);
  assert.equal(value.admin[0].username, 'admin');
  assert.equal(value.admin[0].role_code, 'admin');
  assert.equal(value.admin[0].is_active, 1);
  assert.deepEqual(value.productCols, []);
});

test('SQL queries read real typed columns and parameters are bound safely', () => {
  const { value } = child(`
    s.init();
    const db=s.get();
    db.customers.push({id:'c1',name:'مشتری الف',phone:'09120000001',code:'00001'});
    db.customers.push({id:'c2',name:'مشتری ب',phone:'09120000002',code:'00002'});
    db.orders.push({id:'o1',orderNo:'000123',customerId:'c1',status:'NEW',createdAt:'2026-01-01'});
    db.payments.push({id:'p1',orderId:'o1',amount:1250000,method:'CASH'});
    s.save();
    const sql=s.sql;
    console.log('RESULT:'+JSON.stringify({
      found:sql.query("SELECT name, code FROM customers WHERE code = ?",['00002']),
      orders:sql.query("SELECT order_no, customer_id, status FROM orders WHERE status = ?",['NEW']),
      payment:sql.query("SELECT amount, method FROM payments WHERE order_id = ?",['o1']),
      injection:sql.query("SELECT COUNT(*) AS n FROM customers WHERE code = ?",["' OR 1=1 --"]),
    }));
  `);
  assert.equal(value.found[0].name, 'مشتری ب');
  assert.equal(value.orders[0].order_no, '000123');
  assert.equal(value.orders[0].customer_id, 'c1');
  assert.equal(value.payment[0].amount, 1250000);
  assert.equal(value.injection[0].n, 0);
});

test('incremental save issues INSERT/UPDATE/DELETE (no stale rows left in SQL)', () => {
  const { value } = child(`
    s.init();
    const db=s.get();
    db.customers.push({id:'a',name:'اول',code:'00001'},{id:'b',name:'دوم',code:'00002'});
    s.save();
    db.customers[0].name='ویرایششده';
    db.customers.splice(1,1);
    db.customers.push({id:'c',name:'سوم',code:'00003'});
    s.save();
    const sql=s.sql;
    console.log('RESULT:'+JSON.stringify({
      rows:sql.query("SELECT id, name FROM customers ORDER BY id"),
      count:sql.query("SELECT COUNT(*) AS n FROM customers")[0].n,
    }));
  `);
  assert.equal(value.count, 2);
  assert.deepEqual(value.rows.map((r) => r.id), ['a', 'c']);
  assert.equal(value.rows[0].name, 'ویرایششده');
});

test('data survives a completely fresh process (SQLite, not an in-memory cache)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-sql-restart-'));
  const first = child(`
    s.init();
    const db=s.get();
    db.customers.push({id:'persist',name:'ماندگار',code:'00009'});
    db.counters.testCounter=42;
    s.save();
    console.log('RESULT:'+JSON.stringify({file:s.dbFile()}));
  `, { dir });
  assert.ok(fs.existsSync(first.value.file), 'a real .db file must exist on disk');
  const second = child(`
    s.init();
    console.log('RESULT:'+JSON.stringify({
      customers:s.get().customers,
      counter:s.get().counters.testCounter,
      sqlCount:s.sql.query("SELECT COUNT(*) AS n FROM customers")[0].n,
    }));
  `, { dir });
  assert.equal(second.value.customers[0].name, 'ماندگار');
  assert.equal(second.value.counter, 42);
  assert.equal(second.value.sqlCount, 1);
});

test('legacy data/db.json is migrated into SQL and archived (no data loss)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-sql-legacy-'));
  const firstProductId = 'legacy-product-01';
  const legacy = {
    meta: { schemaVersion: 2, productCatalogVersion: '2026-10-05-catalog-63', auditSeq: 0, lastAuditHash: 'GENESIS' },
    users: [{ id: 'u1', username: 'admin', fullName: 'مدیر', roleCode: 'admin', isActive: true, passwordHash: 'x', mustChangePassword: false }],
    customers: [{ id: 'c1', name: 'مشتری قدیمی', phone: '09120000000', code: '00001' }],
    orders: [{ id: 'o1', orderNo: '000001', customerId: 'c1', status: 'NEW', createdAt: '2026-01-01', nested: { weight: 12.5, lines: [1, 2] } }],
    orderItems: [{ id: 'it1', orderId: 'o1', productId: firstProductId, description: 'مرغ' }],
    products: PRODUCTS_SEED.slice(0, 63).map((product, index) => ({
      ...product,
      id: index === 0 ? firstProductId : product.id,
      name: `نام قبلی ${product.quickCode}`,
    })),
    priceList: [{ id: 'price-1', productId: firstProductId, price: 100 }],
    counters: { orderNumber: 5 }, audit: [],
  };
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(legacy));
  const { value } = child(`
    s.init();
    const sql=s.sql;
    console.log('RESULT:'+JSON.stringify({
      customer:sql.query("SELECT name, code FROM customers"),
      order:sql.query("SELECT order_no, customer_id FROM orders"),
      nested:s.get().orders[0].nested,
      counter:s.get().counters.orderNumber,
      products:sql.query("SELECT id, quick_code, name FROM products WHERE quick_code IN (?, ?) ORDER BY quick_code",['01','90']),
      productCount:sql.stats().products,
      orderItemProductId:s.get().orderItems[0].productId,
      priceProductId:s.get().priceList[0].productId,
      catalogVersion:s.get().meta.productCatalogVersion,
    }));
  `, { dir });
  assert.equal(value.customer[0].name, 'مشتری قدیمی');
  assert.equal(value.order[0].order_no, '000001');
  assert.deepEqual(value.nested, { weight: 12.5, lines: [1, 2] });
  assert.equal(value.counter, 5);
  assert.deepEqual(value.products, [
    { id: firstProductId, quick_code: '01', name: 'نام قبلی 01' },
  ]);
  assert.equal(value.productCount, 63);
  assert.equal(value.orderItemProductId, firstProductId);
  assert.equal(value.priceProductId, firstProductId);
  assert.equal(value.catalogVersion, '2026-10-05-catalog-63');
  assert.equal(fs.existsSync(path.join(dir, 'db.json')), false, 'legacy file must be archived, not left as a second source of truth');
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('db.json.migrated-')));
});

test('audit hash chain survives the SQL round trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-sql-audit-'));
  child(`
    s.init();
    s.audit(s.get().users[0],'LOGIN','user','u1',{ok:true},{ip:'127.0.0.1'});
    s.audit(s.get().users[0],'ORDER_CREATED','order','o1',{},{});
    s.save();
    console.log('RESULT:'+JSON.stringify(s.verifyAuditChain()));
  `, { dir });
  const again = child(`
    s.init();
    const sql=s.sql;
    console.log('RESULT:'+JSON.stringify({
      chain:s.verifyAuditChain(),
      rows:sql.query("SELECT seq, action, entity_type FROM audit ORDER BY seq"),
    }));
  `, { dir });
  assert.equal(again.value.chain.ok, true);
  assert.equal(again.value.chain.checked, 2);
  assert.deepEqual(again.value.rows.map((r) => r.action), ['LOGIN', 'ORDER_CREATED']);
});

test('query() is read-only: writes, stacked statements and object params are rejected', () => {
  const { value } = child(`
    s.init();
    const sql=s.sql;
    const rejected=(fn)=>{try{fn();return false}catch{return true}};
    console.log('RESULT:'+JSON.stringify({
      drop:rejected(()=>sql.query('DROP TABLE users')),
      update:rejected(()=>sql.query("UPDATE users SET username='x'")),
      stacked:rejected(()=>sql.query('SELECT 1; DELETE FROM users')),
      objectParam:rejected(()=>sql.query('SELECT * FROM users WHERE id = ?',[{evil:1}])),
      select:sql.query('SELECT 1 AS n')[0].n,
    }));
  `);
  assert.equal(value.drop, true);
  assert.equal(value.update, true);
  assert.equal(value.stacked, true);
  assert.equal(value.objectParam, true);
  assert.equal(value.select, 1);
});

test('VACUUM INTO produces a standalone readable backup file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-sql-backup-'));
  const { value } = child(`
    s.init();
    const out=require('path').join(process.env.DATA_DIR,'backup.db');
    s.sql.vacuumInto(out);
    console.log('RESULT:'+JSON.stringify({out,size:require('fs').statSync(out).size}));
  `, { dir });
  assert.ok(value.size > 0);
  const check = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', `
    const {DatabaseSync}=require('node:sqlite');
    const d=new DatabaseSync(process.argv[1]);
    console.log('RESULT:'+JSON.stringify(d.prepare("SELECT COUNT(*) AS n FROM users").get()));
  `, value.out], { cwd: root, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout.split('RESULT:')[1]).n, 1);
});

test('zero external dependencies: built-in node:sqlite, engines >= 22.13', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.match(pkg.engines.node, /^>=22\.13/);
  const src = fs.readFileSync(path.join(root, 'lib', 'sqlite-store.js'), 'utf8');
  assert.match(src, /require\('node:sqlite'\)/);
  assert.doesNotMatch(src, /require\(['"](sqlite3|better-sqlite3|mysql|pg|mssql)['"]\)/);
  const config = fs.readFileSync(path.join(root, 'lib', 'config.js'), 'utf8');
  assert.match(config, /SQLITE_FILE/);
  const store = fs.readFileSync(path.join(root, 'lib', 'store.js'), 'utf8');
  assert.match(store, /sql\.save\(db\)/);
  assert.doesNotMatch(store, /renameSync\(tmp, file\)/);
});

test('CLI helpers exist for SQL queries and safe backups', () => {
  const q = fs.readFileSync(path.join(root, 'scripts', 'sql-query.js'), 'utf8');
  const b = fs.readFileSync(path.join(root, 'scripts', 'backup-db.js'), 'utf8');
  assert.match(q, /sql\.query\(/);
  assert.match(q, /--stats/);
  assert.match(b, /vacuumInto/);
});
