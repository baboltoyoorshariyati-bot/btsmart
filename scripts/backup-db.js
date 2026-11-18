'use strict';
// پشتیبانگیری امن و یکپارچه از دیتابیس SQLite (VACUUM INTO).
//   node scripts/backup-db.js [مسیر-مقصد]
// پیشفرض: DATA_DIR/backups/baboltoyoor-YYYYMMDD-HHmmss.db
const fs = require('node:fs');
const path = require('node:path');
const sql = require('../lib/sqlite-store');
const config = require('../lib/config');

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
const file = process.argv[2] || path.join(config.DATA_DIR, 'backups', `baboltoyoor-${stamp}.db`);
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
if (fs.existsSync(file)) { console.error(`فایل مقصد از قبل وجود دارد: ${file}`); process.exit(1); }
sql.init();
sql.vacuumInto(path.resolve(file));
console.log(JSON.stringify({ ok: true, source: sql.dbFile(), backup: path.resolve(file), bytes: fs.statSync(file).size }, null, 2));
sql.close();
