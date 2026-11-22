# نصب و استقرار روی Windows Server 2025 (نسخهٔ انتشار عمومی 1.1.15)

## خلاصه

فایل **`windows-installer/BabolToyor-Setup.cmd`** یک نصبکنندهٔ تکفایل است. کافی است آن را روی سرور کپی و با **Run as administrator** اجرا کنید (با دابلکلیک هم خودش درخواست UAC میدهد). هیچ کدنویسی، نصب دستی وابستگی یا ویرایش تنظیمات لازم نیست.

سامانه روی **پورت ۸۰** اجرا میشود؛ آدرس `http://localhost` روی خود سرور و `http://IP-سرور` از شبکه داخلی — **بدون نوشتن پورت**.

> 🆕 **راهنمای گامبهگام و قابلچاپ (پیشنهادی برای نصب واقعی):** `windows-installer/INSTALL-STEPS-fa.md` و نسخهٔ HTML همنام. شامل چکلیست، لینکهای مستقیم دانلود، نصب آفلاین و عیبیابی.
>
> راهنمای کامل و فارسی نصبکننده: `windows-installer/README-fa.md`

> ❓ **سؤال پرتکرار — آیا SQLite باید نصب شود؟ خیر.** SQLite داخل **Node.js 22.5+** کامپایل شده است؛ نصبکننده Node را خودکار نصب میکند و فایل `data\baboltoyoor.db` را میسازد. هیچ نسخهٔ جداگانهای از sqlite.org لازم نیست (ابزارهای اختیاری فقط برای دیدن محتویات دیتابیساند). حداقل نسخهٔ Node در `package.json`: `>=22.5.0`؛ تستها روی Node 22 LTS اجرا شدهاند.

## نصبکننده چه میکند

1. **Node.js ۲۲٫۵+**: اگر نباشد، بهترتیب از (الف) فایل پورتابل `node-v*-win-x64.zip` کنار نصبکننده، (ب) `winget` و (ج) دانلود رسمی `nodejs.org` **همراه بررسی SHA256** نصب میکند.
2. **کپی فایلهای برنامه** در `C:\BabolToyor`: اگر `app.zip` کنار نصبکننده باشد از همان استفاده میکند (نصب آفلاین)، وگرنه نصب‌کننده از `AppZipUrl` پیش‌فرض، [بستهٔ پایهٔ `BabolToyor-App-1.1.15-bootstrap.zip`](https://drive.google.com/uc?export=download&id=1vvn4XRPJXQSmD156HRZIC8qX0L5ldDtp) را دریافت می‌کند؛ دیگر دارایی‌ها در [پوشهٔ انتشار نسخهٔ 1.1.15 در Google Drive](https://drive.google.com/drive/folders/1xtue8K590Kh306oM9I53atDNp9XKv2BX) هستند.
3. **ساخت `.env`** با `PORT=80`، `HOST=0.0.0.0`، `DATA_DIR=C:\BabolToyor\data` و یک رمز تصادفی قوی برای `admin`. دسترسی فایل فقط برای `SYSTEM` و `Administrators` است.
4. **پورت ۸۰**: اگر IIS/HTTP.sys پورت را گرفته باشد، سایت مربوطه متوقف و `serverAutoStart` آن خاموش میشود (با هشدار در لاگ)؛ در صورت نیاز `W3SVC` متوقف و Manual میشود. با `-NoAutoStopIis` میتوان جلوی این کار را گرفت.
5. **فایروال**: قانون ورودی `Babol Toyor - HTTP (TCP 80)` برای پروفایلهای Domain/Private/Public.
6. **اجرای خودکار**: Scheduled Task با نام `Babol Toyor - Application Server`، حساب `SYSTEM`، trigger هنگام بوت، بدون محدودیت زمان اجرا و ریاستارت در خطا. یک supervisor هم در صورت خروج `node` ظرف ۵ ثانیه سامانه را بالا میآورد.
7. **بررسی سلامت** (`GET /api/server-time`)، ساخت میانبر `http://localhost/` روی دسکتاپ و Start Menu، و نوشتن `C:\BabolToyor\INSTALL-INFO.txt` شامل آدرس، نام کاربری و رمز اولیه.

## نصب

1. پوشهٔ `windows-installer` (یا پکیج `BabolToyor-Windows-Setup` شامل `BabolToyor-Setup.cmd` + `app.zip`) را روی سرور کپی کنید.
2. روی `BabolToyor-Setup.cmd` راستکلیک → **Run as administrator**.
3. صبر کنید تا `INSTALLATION FINISHED` نمایش داده شود (نصب Node.js ممکن است چند دقیقه طول بکشد).
4. فایل `C:\BabolToyor\INSTALL-INFO.txt` را باز کنید؛ با `admin` و رمز آن وارد شوید. سامانه در اولین ورود **تعویض رمز را اجباری میکند**. سپس فایل اطلاعات را حذف کنید.

## ارتقا

همان `BabolToyor-Setup.cmd` را دوباره اجرا کنید. تسک متوقف، فایلهای برنامه جایگزین و سامانه دوباره بالا میآید. این موارد **دستنخورده** میمانند:

- `C:\BabolToyor\data` (پایگاه داده)
- `C:\BabolToyor\.env` (تنظیمات و رمز — فقط `PORT` دوباره روی ۸۰ تنظیم میشود)
- `C:\BabolToyor\logs`

## پشتیبانگیری (مهم)

فایل اصلی داده: `C:\BabolToyor\data\baboltoyoor.db`

```bat
BabolToyor-Setup.cmd restart
:: برای کپی امن، ابتدا تسک را متوقف کنید:
schtasks /End /TN "Babol Toyor - Application Server"
node scripts/backup-db.js D:\Backup\baboltoyoor-20261027.db
robocopy C:\BabolToyor\data D:\Backup\baboltoyoor-data /E
schtasks /Run /TN "Babol Toyor - Application Server"
```

## دستورات و عیبیابی

```bat
BabolToyor-Setup.cmd status      :: وضعیت تسک، پورت ۸۰ و سلامت
BabolToyor-Setup.cmd logs        :: ۴۰ خط آخر لاگها
BabolToyor-Setup.cmd restart     :: راهاندازی مجدد
BabolToyor-Setup.cmd uninstall   :: حذف (دادهها حفظ میشوند)
BabolToyor-Setup.cmd help        :: پارامترها
```

- لاگ نصب: `C:\BabolToyor\logs\install.log`
- لاگ برنامه: `server.out.log` / `server.err.log` و لاگ supervisor: `supervisor.log`
- تست از کلاینت: `Test-NetConnection IP-سرور -Port 80`
- اگر پورت ۸۰ اشغال است و نباید IIS دست بخورد: `BabolToyor-Setup.cmd install -Port 8080 -NoAutoStopIis` (در این حالت آدرس دارای پورت خواهد بود).

## امنیت

- `.env` و `INSTALL-INFO.txt` فقط برای `SYSTEM` و `Administrators` قابل خواندناند. رمز اولیه را بعد از اولین ورود عوض کرده و فایل اطلاعات را حذف کنید.
- در نصب اولیه HTTP ساده است. مدیر می‌تواند HTTPS خودکار یک دامنهٔ عمومی را از تنظیمات سیستم فعال کند؛ پیش‌نیاز DNS و پورت‌های ۸۰ و ۴۴۳، امنیت دسترسی عمومی و محدودیت HTTP داخلی را در `docs/domain-https-fa.md` بخوانید. در استقرار جداگانه پشت reverse proxy، `COOKIE_SECURE=true` و `TRUST_PROXY=true` فقط با پراکسی مورد اعتماد تنظیم شوند.
- CSP سختگیرانه (`script-src 'self'`)، نشست `HttpOnly; SameSite=Strict`، قفل ورود بعد از ۵ تلاش و هش `scrypt` همچنان پابرجا هستند.

## حذف برنامه

`BabolToyor-Setup.cmd uninstall` — تسک، قانون فایروال و میانبرها حذف میشوند؛ `data`، `.env` و `logs` حفظ میشوند. برای حذف کامل: `BabolToyor-Setup.cmd uninstall -PurgeData`.

## ساخت مجدد فایل تکی (توسعهدهنده)

منبع خوانا `windows-installer/Install-BabolToyor.ps1` است؛ فایل تکی از روی آن ساخته میشود:

```bash
node windows-installer/build-single-file.js
npm test        # شامل tests/windows-installer.test.js
```

همچنین `SHA256SUMS.txt` ریشه پس از هر تغییر در این پوشه باید بازسازی شود.


## پایگاهدادهٔ SQL

سامانه از **SQLite** (فایل `C:\BabolToyor\data\baboltoyoor.db`) بهعنوان منبع اصلی دادهها استفاده میکند. جداول واقعی و ستونهای ایندکسهشده دارد و با `node:sqlite` داخلی Node 22.5+ کار میکند — **بدون هیچ درایور یا وابستگی خارجی**. به همین دلیل نصبکننده Node 22+ میگیرد.

- اگر از نسخهٔ قبلی (فایل `db.json`) ارتقا میدهید، **اولین اجرا بهصورت خودکار** تمام اطلاعات را به جداول SQL منتقل و فایل قدیمی را به `db.json.migrated-<timestamp>` بایگانی میکند.
- پرسوجوی مستقیم: `node scripts/sql-query.js "SELECT order_no, status FROM orders"` و آمار: `node scripts/sql-query.js --stats`.
- پشتیبان امن: `node scripts/backup-db.js` (دستور `VACUUM INTO`؛ نیازی به توقف سرویس ندارد).
- راهنمای کامل اسکما و مثالها: `docs/sqlite-database-fa.md`.

## نشست کاربران

نشست با گذشت زمان یا توقف فعالیت منقضی نمی‌شود. خروج از حساب فوراً نشست را باطل می‌کند؛ پس از بسته‌شدن آخرین صفحهٔ سامانه، با یک فرصت کوتاه برای بارگذاری مجدد، نشست پایان می‌یابد. پیام بسته‌شدن صفحه توسط مرورگر و شبکه تضمین نمی‌شود؛ در قطع برق، خرابی مرورگر یا قطع ارتباط، ممکن است نشست باقی بماند و ورود مجدد همان حساب مسدود شود. راه‌اندازی مجدد سرویس همهٔ نشست‌ها را پاک می‌کند. در رایانهٔ مشترک برای امنیت حتماً از دکمهٔ خروج استفاده کنید. تنظیمات قدیمی `SESSION_IDLE_MINUTES` و `SESSION_MAX_HOURS` دیگر نشست را محدود نمی‌کنند؛ کاربران API بدون صفحهٔ مرورگر باید صریحاً از حساب خارج شوند.
