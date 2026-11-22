# پایگاهدادهٔ SQL سامانهٔ بابل طیور

از این پس **منبع اصلی دادهها SQLite** است (فایل `DATA_DIR/baboltoyoor.db`)، نه فایل JSON. پیادهسازی با **`node:sqlite` داخلی Node.js** انجام شده؛ بنابراین همچنان **هیچ وابستگی خارجی / `npm install` وجود ندارد**.

> ⚠️ حداقل نسخهٔ Node.js اکنون **۲۲٫۵** است (ماژول `node:sqlite` در Node 20 وجود ندارد). نصبکنندهٔ ویندوز بهصورت خودکار Node 22+ میگیرد.

---

## ۱) معماری

| لایه | فایل | وظیفه |
|---|---|---|
| SQL | `lib/sqlite-store.js` | اتصال، ساخت جداول، بارگذاری، ذخیرهٔ تراکنشی افزایشی، مهاجرت، پرسوجو، پشتیبان |
| منطق | `lib/store.js` | همان API قبلی (`init/get/save/audit/...`) — منبع اصلیاش اکنون SQL است |
| تنظیمات | `lib/config.js` | `DATA_DIR` و `SQLITE_FILE` (اختیاری) |

- **۱۷ جدول واقعی** برای موجودیتها (شامل `vehicles` و `weigh_trips` باسکول) + `meta`، `counters`، `settings` و `schema_info`.
- هر جدول ستونهای پرکاربرد تایپشده و **ایندکس** دارد (`users.username`، `orders.order_no/status/customer_id`، `audit.seq/action`، `products.quick_code`، …).
- رکورد کامل هر موجودیت در ستون `payload` (JSON) هم ذخیره میشود؛ یعنی فیلدهای تودرتو و آرایهها **بدون تغییر و بدون کمشدن** حفظ میشوند.
- ذخیرهسازی **تراکنشی** (`BEGIN IMMEDIATE` / `COMMIT`) و **افزایشی** است: فقط ردیفهای تغییرکرده `INSERT OR REPLACE` و ردیفهای حذفشده `DELETE` میشوند.
- `PRAGMA journal_mode=WAL`، `synchronous=FULL`، `foreign_keys=ON` — امن در برابر قطع برق.
- زنجیرهٔ هش Audit، شمارندهها، idempotency و قفل تک نمونهای (single-instance) قبلاً همگی پابرجا هستند.

## ۲) جداول

| جدول | محتوا | ستونهای کلیدی |
|---|---|---|
| `users` | کاربران و رمزها | `username`, `role_code`, `full_name`, `is_active` |
| `roles` | ۷ نقش سامانه | `title` |
| `customers` | مشتریان | `name`, `phone`, `code` |
| `products` | کاتالوگ محصولات ثبت‌شده توسط کاربران (نصب تازه خالی است) | `quick_code`, `name`, `is_active` |
| `price_list` | قیمتهای روز | `product_id`, `price`, `date` |
| `orders` | سفارشها | `order_no`, `customer_id`, `status`, `order_type`, `source` |
| `order_items` | اقلام سفارش | `order_id`, `product_id`, `quantity` |
| `visits` | تردد نگهبانی | `customer_id`, `status`, `visit_no` |
| `payments` | تسویهها | `order_id`, `amount`, `method`, `invoice_number` |
| `drivers` | رانندگان | `name`, `phone`, `plate_no` |
| `dispatch_returns` | برگشتیهای پخش | `order_id`, `order_no` |
| `payment_devices` | دستگاههای پوز | `terminal_number`, `is_active` |
| `notifications` | اعلانها | `user_id`, `is_read` |
| `audit` | زنجیرهٔ حسابرسی | `seq`, `action`, `entity_type`, `entity_id` |
| `idempotency` | کلیدهای بایدپخشی | `idem_key`, `user_id`, `route` |
| `meta` / `counters` | فراداده و شمارندهها | `key`, `value` |

همهٔ جداول `id`، `created_at` و `payload` دارند.

## ۳) پرسوجوی مستقیم SQL

```bash
# آمار جداول
node scripts/sql-query.js --stats

# فهرست جداول
node scripts/sql-query.js --tables

# پرسوجو (فقط خواندنی، پارامترها امن بایند میشوند)
node scripts/sql-query.js "SELECT order_no, customer_id, status FROM orders WHERE status = ?" SETTLEMENT_PENDING
node scripts/sql-query.js "SELECT username, role_code FROM users WHERE is_active = 1"
node scripts/sql-query.js "SELECT action, COUNT(*) AS n FROM audit GROUP BY action ORDER BY n DESC"
node scripts/sql-query.js "SELECT o.order_no, c.name AS customer, p.name AS product FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN order_items i ON i.order_id = o.id LEFT JOIN products p ON p.id = i.product_id LIMIT 10"
```

`sql-query.js` فقط دستورات `SELECT` / `PRAGMA` / `WITH` / `EXPLAIN` را میپذیرد؛ `UPDATE`، `DROP`، چند دستور پشتسرهم و پارامترهای شیء reject میشوند. متغیرهای محیطی `DATA_DIR` و `SQLITE_FILE` مسیر دیتابیس را تعیین میکنند.

## ۴) مهاجرت از نسخههای قبل (`db.json`)

**کاملاً خودکار است.** در اولین اجرا:

1. اگر `baboltoyoor.db` خالی باشد و `DATA_DIR/db.json` وجود داشته باشد، کل محتوا خوانده میشود.
2. مهاجرتهای منطقی قبلی (`migrate()`، شمارهگذاری سفارش/فاکتور، کد مشتری، کاتالوگ محصولات) اعمال میشود.
3. همهٔ رکوردها در جداول SQL نوشته میشوند.
4. فایل قدیمی به `db.json.migrated-<timestamp>` تغییرنام مییابد (بهعنوان بکاپ) و دیگر خوانده نمیشود.
5. لاگ `JSON database migrated to SQLite` ثبت میشود.

نیازی به دستور دستی نیست؛ فقط نسخهٔ جدید را جایگزین و سرویس را ریاستارت کنید. اگر سرور از نصبکنندهٔ ویندوزی استفاده میکند، همان `BabolToyor-Setup.cmd` را دوباره اجرا کنید.

## ۵) پشتیبانگیری و بازیابی

```bash
# پشتیبان یکپارچه (VACUUM INTO — حتی هنگام کار سامانه امن است)
node scripts/backup-db.js
node scripts/backup-db.js D:\Backup\baboltoyoor-20261027.db
```

- فایل اصلی: `C:\BabolToyor\data\baboltoyoor.db` (در حالت WAL فایلهای `-wal` و `-shm` کنارش موقتاند).
- برای کپی دستی، حتماً اول سرویس را متوقف کنید یا از `backup-db.js` استفاده کنید.
- بازیابی: سرویس را متوقف کنید، فایل بکاپ را به `baboltoyoor.db` کپی کنید، سرویس را بالا بیاورید.

## ۶) نکات عملیاتی

- **یک نمونه در لحظه:** قفل PID قبلی (`.lock`) همچنان برقرار است؛ SQLite هم از نوشتن همزمان جلوگیری میکند.
- **رمز مدیر:** همچنان در `.env` و `INSTALL-INFO.txt`؛ تعویض اجباری در اولین ورود پابرجاست.
- **بدون وابستگی خارجی:** درایور SQLite داخل خود Node است؛ `package.json` همچنان `dependencies` ندارد.
- **هشدار Experimental:** `node:sqlite` در Node 22 یک قابلیت آزمایشی است و یک هشدار stderr میدهد. نصبکنندهٔ ویندوز supervisor را با `--disable-warning=ExperimentalWarning` اجرا میکند تا لاگها تمیز بمانند. در صورت ارتقا به Node 24 بررسی کنید که API تغییری نکرده باشد.
- **تستها:** `tests/sqlite-store.test.js` جداول، مهاجرت، ماندگاری پس از ریاستارت، زنجیرهٔ Audit، بکاپ و قفل فقطخواندنی پرسوجوها را پوشش میدهد.


## ۷) فاز ۲ — مسیرهای API مستقیماً SQL اجرا میکنند

پس از اینکه SQLite منبع اصلی شد، لایهٔ `lib/sql-repos.js` اضافه شد تا مسیرها بهجای پیمایش آرایههای درون حافظه، **prepared statement** اجرا کنند:

- **تازهمسازی خودکار در ابتدای هر درخواست:** `lib/http.js` تابع `store.refresh()` را صدا میزند. این تابع با `PRAGMA data_version` تشخیص میدهد آیا اتصال دیگری (CLI، ابزار BI، ادمین) دیتابیس را عوض کرده است یا نه؛ فقط در همان صورت کل نما را از SQL بارگذاری مجدد میکند. یعنی **همهٔ ۱۲۰ نقطهٔ `store.get()` اکنون دادهٔ زندهٔ SQL میبینند**، نه یک عکس قدیمی از لحظهٔ استارت.
- **Repositoryها:** `repos.users/customers/products/orders/...` با متدهای `all/find/findBy/where/select/count/insert/replace/remove`. نام ستونها اعتبارسنجی و پارامترها بایند میشوند (تزریق SQL ممکن نیست).
- **مسیرهایی که به SQL خالص تبدیل شدند:**
  - احراز هویت نشست (`store.activeUserById`) — وجود کاربر با prepared statement تأیید میشود.
  - بایدپخشی (idempotency) — جستجوی کلید با `SELECT ... WHERE idem_key = ? AND user_id IS ? AND route = ?`.
  - **داشبورد مدیریت** — تمام ۷ شمارنده در **یک پرسوجوی تجمیعی SQL** (`SELECT` تو در تو + `json_type` برای فیلد `dispatch`).
  - **سوابق فعالیت (Audit)** — `WHERE` پویا + `COUNT` + `ORDER BY seq DESC` + `LIMIT` با پارامترهای بایندشده.
  - **گزارش پیشرفته** — joinهای مشتری/محصول/سفارش/پرداخت و شمارش مراجعه/سفارش با prepared statement (بهجای `Array.find/filter`).
  - فهرستهای کاربران، محصولات، دستگاههای پوز، رانندگان، محصولات فعال و مراجعات.
- **نوشتها** در فاز ۲ همچنان از لایهٔ تراکنشی `store.save()` عبور میکردند؛ هیچ مسیری مستقیماً فایل JSON نمینوشت و زنجیرهٔ Audit/idempotency حفظ میشد. Repositoryها متدهای نوشت مستقیم (`insert/replace/remove`) دارند. **فاز ۳ این لایه را ردیفبهردیف کرد (بخش ۸).**
- تستهای `tests/sql-phase2.test.js` اثبات میکنند که تغییر دیتابیس از **یک اتصال بیرونی** در همان درخواست بعدی API دیده میشود، فیلترهای پویا تزریقپذیر نیستند و شمارندهها از SQL میآیند.

## ۸) فاز ۳ — نوشت ردیفبهردیف (`INSERT` / `UPDATE` / `DELETE`)

هدف فاز ۳ این بود که هیچ تغییری با «ذخیرهٔ کل دیتابیس» همراه نباشد. پیادهسازی در **یک نقطهٔ مرکزی** انجام شد تا تمام مسیرهای نوشتن (بیش از ۷۰ نقطه) بدون دستکاری تکتکشان، SQL واقعی اجرا کنند و رفتار دامنه دستنخورده بماند.

### ۸-۱) لایهٔ `lib/live-collections.js` (write-through)

`store.init()` و `store.refresh()` نمای درون حافظه را با `live.attach(db)` به پراکسیای زنده تبدیل میکنند. هر تغییری که مسیرها انجام میدهند، **در همان لحظه** به یک prepared statement سطح ردیف ترجمه میشود:

| تغییر در کد مسیرها | دستور SQL |
|---|---|
| `db.orders.push(o)` | `INSERT INTO orders ... ON CONFLICT(id) DO UPDATE SET ...` |
| `Object.assign(order, {...})` یا `order.status = '...'` | همان `UPSERT` فقط برای آن `id` |
| تغییر فیلد تودرتو (`order.dispatch.note = ...`) | همان `UPSERT` (پراکسی عمیق) |
| `db.customers.splice(i, 1)` / `pop` / `shift` | `DELETE FROM customers WHERE id = ?` |
| `db.priceList = db.priceList.filter(...)` | `DELETE` فقط ردیفهای حذفشده (diff بر اساس `id`) |
| `db.meta.lastAuditHash = ...` | `INSERT ... ON CONFLICT(key) DO UPDATE` روی `meta` |
| `db.counters[...] = n` | `UPSERT` روی `counters` |
| `db.weighTicketSettings = {...}` | `UPSERT` روی `settings` |

یعنی مسیرهایی مثل ثبت سفارش، تسویه، اعزام پخش، ورود/خروج نگهبانی، مدیریت کاربران و باسکول همگی **مستقیماً SQL مینویسند**؛ فقط لازم نیست هر مسیر جداگانه `INSERT` بنویسد چون لایهٔ مرکزی این کار را میکند.

### ۸-۲) `lib/sqlite-store.js` — `save()` افزایشی واقعی

- `save(data)` دیگر هیچ جدولی را `DELETE FROM ...` و بازنویسی نمیکند. ردیفهای SQL را میخواند (`SELECT id, payload`)، با نمای درون حافظه مقایسه میکند و فقط ردیفهای **تغییرکرده** را `UPSERT` و ردیفهای **حذفشده** را `DELETE` مینماید. کش `state` دیگر ملاک تصمیم نیست؛ بنابراین نوشتهای مستقیم Repositoryها و تغییرات اتصالهای بیرونی هم درست دیده میشوند.
- دستور upsert از `INSERT OR REPLACE` به `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` تغییر کرد. در نتیجه ویرایش یک رکورد `rowid` آن را عوض نمیکند (UPDATE واقعی است، نه حذف + درج). ترتیب ردیفها و زنجیرهٔ Audit پایدار میماند.
- `meta`، `counters` و `settings` هم افزایشی شدند (دیگر هر بار کل جدول حذف و درج نمیشود).
- `store.save()` همچنان فراخوانی میشود، ولی اکنون فقط **همگامسازی افزایشی و پاکسازی idempotency** است: چون نوشتها همان لحظه انجام شدهاند، معمولاً صفر `INSERT/UPDATE` اضافه اجرا میکند. `sql.writeStats()` شمار نوشتها و حذفها را برای تستها و پایش در اختیار میگذارد.
- `sql.put()`/`sql.del()` یک هوک (`setLiveHook`) دارند: وقتی مسیری مستقیماً `repos.customers.insert(...)` صدا بزند، نمای درون حافظه هم هماهنگ میشود تا `save()` آن ردیف را حذف نکند.

### ۸-۳) رفع افتادگی باسکول

سه کلید `vehicles`، `weighTrips` و `weighTicketSettings` در فاز ۱ وارد اسکیمای SQL نشده بودند و بعد از ریاستارت گم میشدند. اکنون `vehicles` و `weigh_trips` جدول مستقل دارند و **هر کلید اضافهٔ دیگر** (مثل تنظیمات فیش) در جدول کلیدمقدار `settings` ذخیره میشود؛ بنابراین هیچ فیلدی از دیتابیس حذف نمیشود. نصبهای قدیمی هم بدون اقدام دستی، جداول تازه را با `CREATE TABLE IF NOT EXISTS` میگیرند.

### ۸-۴) پایداری رفتار

- `ctx.user` همچنان **مرجع زنده** است؛ تعویض اجباری رمز، نشستها، بایدپخشی، شمارندهها و زنجیرهٔ هش Audit بدون تغییر کار میکنند.
- منبع حقیقت SQL است و `db.json` نوشته نمیشود. مهاجرت `db.json` قدیمی سر جایش است.
- ایمنی در برابر تزریق: نام جدولها only از `TABLES` میآید و همهٔ مقادیر بایند میشوند.
- تستها: `tests/sql-phase3.test.js` (۹ آزمون) ثابت میکند نوشت از یک اتصال بیرونی **قبل از `save()`** دیده میشود، `save()` صفر ردیف اضافه مینویسد، `rowid` در UPDATE ثابت میماند، فیلدهای تودرتو همان ردیف را بهروز میکنند، باسکول پس از ریاستارت (و از طریق API واقعی) باقی میماند، زنجیرهٔ Audit سالم است و نوشت مستقیم Repositoryها حذف نمیشود.
