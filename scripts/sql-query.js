'use strict';
// ابزار خط فرمان برای پرسوجوی مستقیم SQL از دیتابیس سامانه (فقط خواندنی).
// نمونه:
//   node scripts/sql-query.js "SELECT order_no, status FROM orders WHERE status='SETTLEMENT_PENDING'"
//   node scripts/sql-query.js --stats
//   node scripts/sql-query.js --tables
//   node scripts/sql-query.js "SELECT * FROM users WHERE username = ?" admin
const sql = require('../lib/sqlite-store');

const args = process.argv.slice(2);
if (!args.length || args[0] === '--help' || args[0] === '-h') {
  console.log(`استفاده:
  node scripts/sql-query.js "SELECT ..." [پارامترها...]
  node scripts/sql-query.js --stats        تعداد رکوردهای هر جدول
  node scripts/sql-query.js --tables       فهرست جداول
متغیر محیطی DATA_DIR (پیشفرض data/) و SQLITE_FILE مسیر دیتابیس را تعیین میکنند.`);
  process.exit(0);
}
sql.init();
if (args[0] === '--stats') {
  console.log(JSON.stringify({ file: sql.dbFile(), tables: sql.stats() }, null, 2));
} else if (args[0] === '--tables') {
  console.log(JSON.stringify(sql.tables(), null, 2));
} else {
  const rows = sql.query(args[0], args.slice(1));
  console.log(JSON.stringify(rows, null, 2));
}
sql.close();
