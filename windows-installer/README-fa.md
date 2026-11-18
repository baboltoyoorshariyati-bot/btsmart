# نصبکنندهٔ تکفایل ویندوز سرور ۲۰۲۵

**`BabolToyor-Setup.cmd`** — یک فایل، بدون هیچ کدنویسی و بدون دستکاری تنظیمات سامانه.

سامانه روی **پورت ۸۰** اجرا میشود؛ یعنی در مرورگر فقط مینویسید `http://IP-سرور` یا `http://localhost` و **نیازی به نوشتن پورت نیست**.

> 🆕 **راهنمای گامبهگام و قابلچاپ (بدون کدنویسی):** [`INSTALL-STEPS-fa.md`](INSTALL-STEPS-fa.md) • نسخهٔ [HTML قابلچاپ](INSTALL-STEPS-fa.html). از دانلود تا اولین ورود، همراه چکلیست و عیبیابی.

> ❓ **آیا باید SQLite نصب کنم؟ خیر — هیچ نسخهای و از هیچ جایی.**
> SQLite یک نرمافزار سرور نیست؛ کتابخانهای است که داخل **Node.js 22.5+** کامپایل شده و نصبکننده همان Node را هم خودکار نصب میکند. دیتابیس فقط فایل `C:\BabolToyor\data\baboltoyoor.db` است. نه SQL Server، نه درایور، نه `sqlite3.exe`. جزئیات و لینک ابزارهای اختیاری در بخش «دیتابیس SQL» و راهنمای گامبهگام.

---

## نصب (۳ قدم)

1. پوشهٔ `BabolToyor-Windows-Setup` را روی سرور کپی کنید (فایل `BabolToyor-Setup.cmd`، فایل `app.zip` و این راهنما).
2. روی **`BabolToyor-Setup.cmd`** راستکلیک کنید و **Run as administrator** را بزنید (اگر دابلکلیک کردید، خودش با UAC بالا میرود).
3. صبر کنید تا پیام `INSTALLATION FINISHED` بیاید. تمام!

نصبکننده بهصورت خودکار انجام میدهد:

| کار | توضیح |
|---|---|
| Node.js ۲۲٫۵+ | اگر نصب نباشد، از `node-v*-x64.zip` کنار فایل، سپس winget، سپس دانلود رسمی nodejs.org **با بررسی SHA256** نصب میکند |
| کپی سامانه | فایلها در `C:\BabolToyor` قرار میگیرند (اگر `app.zip` کنار نصبکننده باشد، بدون اینترنت هم کار میکند) |
| دیتابیس SQL | ساخت `baboltoyoor.db` با جداول واقعی؛ انتقال خودکار `db.json` قدیمی در اولین اجرا |
| پورت ۸۰ | فایل `.env` با `PORT=80` ساخته میشود؛ اگر IIS پورت ۸۰ را گرفته باشد، همان سایت متوقف و غیرفعال میشود (با هشدار واضح) |
| فایروال | قانون ورودی `TCP 80` برای پروفایلهای Domain/Private/Public باز میشود |
| اجرای خودکار | یک Scheduled Task با حساب `SYSTEM` هنگام بوت بالا میآید و در صورت کرش، سامانه را ظرف ۵ ثانیه ریاستارت میکند |
| رمز مدیر | یک رمز قوی تصادفی ساخته و در `C:\BabolToyor\INSTALL-INFO.txt` ذخیره میشود (دسترسی فقط مدیر و SYSTEM) |
| میانبر | روی دسکتاپ و Start Menu میانبر `http://localhost/` ساخته میشود |

> **بعد از نصب:** فایل `INSTALL-INFO.txt` را باز کنید، با `admin` و رمز داخل آن وارد شوید. سامانه در همان ورود اول، تعویض رمز را اجباری میکند. **سپس آن فایل را حذف کنید.**

---

## دستورات روزمره (همان یک فایل)

از پوشهای که `BabolToyor-Setup.cmd` هست، در Command Prompt یا PowerShell:

```bat
BabolToyor-Setup.cmd                 :: نصب / بروزرسانی (پیشفرض)
BabolToyor-Setup.cmd status         :: وضعیت: تسک، پورت، سلامت، آدرس
BabolToyor-Setup.cmd logs           :: ۴۰ خط آخر لاگها
BabolToyor-Setup.cmd restart        :: ریاستارت سامانه
BabolToyor-Setup.cmd uninstall      :: حذف سامانه (دادهها حفظ میشوند)
BabolToyor-Setup.cmd help           :: راهنمای پارامترها
```

### پارامترهای اختیاری

```bat
BabolToyor-Setup.cmd install -Port 8080
BabolToyor-Setup.cmd install -InstallDir "D:\BabolToyor"
BabolToyor-Setup.cmd install -NoAutoStopIis      :: اگر IIS مهم است و نباید دست بخورد
BabolToyor-Setup.cmd uninstall -PurgeData        :: حذف کامل همراه با دادهها
BabolToyor-Setup.cmd install -SourcePath "D:\my-build.zip"
```

---

## محل فایلها

| مسیر | محتوا |
|---|---|
| `C:\BabolToyor\` | برنامه (`server.js`، `lib`، `public`، …) |
| `C:\BabolToyor\data\baboltoyoor.db` | **پایگاه داده — حتماً پشتیبان بگیرید** |
| `C:\BabolToyor\.env` | تنظیمات شامل `PORT=80` و رمز اولیه |
| `C:\BabolToyor\logs\` | `install.log`، `server.out.log`، `server.err.log`، `supervisor.log` |
| `C:\BabolToyor\service\supervisor.ps1` | نگهدارندهٔ ریاستارت خودکار |
| `C:\BabolToyor\INSTALL-INFO.txt` | آدرس، نام کاربری و رمز اولیه |

تسک ویندوز: `Babol Toyor - Application Server` (در Task Scheduler).
قانون فایروال: `Babol Toyor - HTTP (TCP 80)`.

---

## بروزرسانی

همان `BabolToyor-Setup.cmd` جدید را دوباره اجرا کنید. سامانه متوقف میشود، فایلهای برنامه جایگزین میشوند و **`data`، `.env`، `logs` و رمز مدیر دستنخورده باقی میمانند**. فقط `PORT` دوباره روی ۸۰ تنظیم میشود تا آدرس بدون پورت بماند.

## نصب آفلاین

- `app.zip` را کنار `BabolToyor-Setup.cmd` بگذارید → نیازی به دانلود سامانه نیست.
- اگر سرور Node.js ندارد و اینترنت هم ندارد، فایل `node-v22.x.x-win-x64.zip` (پورتابل رسمی) را کنار نصبکننده بگذارید؛ نصبکننده از همان استفاده میکند و چیزی روی سیستم نصب نمیکند.
  - محل دانلود: <https://nodejs.org/en/download> → **Standalone Binary / Windows x64 (.zip)**، یا <https://nodejs.org/dist/> → پوشهٔ `v22.x.x/` → `node-v22.x.x-win-x64.zip`. حتماً **x64** و حتماً **zip** (نه MSI). نمونه: `node-v22.22.3-win-x64.zip`.
- در غیر این صورت، نصب Node.js به اینترنت نیاز دارد (winget یا nodejs.org، با بررسی SHA-256).

## عیبیابی

| علامت | بررسی |
|---|---|
| صفحه باز نمیشود | `BabolToyor-Setup.cmd status` → آیا پورت ۸۰ در حالت LISTENING است؟ |
| خطای IIS | لاگ نصب را ببینید؛ پیام توقف IIS در آن ثبت شده. یا با `-NoAutoStopIis` پورت دیگری بدهید. |
| سامانه بالا نمیآید | `BabolToyor-Setup.cmd logs` — معمولاً پورت اشغال یا نبود Node.js |
| از کلاینت وصل نمیشود | فایروال سرور و پروفایل شبکه (Domain/Private/Public) را بررسی کنید؛ `Test-NetConnection IP-سرور -Port 80` |
| رمز را گم کردم | فایل `.env` و `INSTALL-INFO.txt` را ببینید (رمز اولیه فقط تا اولین تعویض معتبر است) |

> نکتهٔ امنیتی: سامانه روی HTTP است (چون پورت ۸۰ خواسته شده). اگر بعدها HTTPS/ reverseproxy اضافه کردید، در `.env` مقادیر `COOKIE_SECURE=true` و `TRUST_PROXY=true` را قرار دهید.

---

## برای توسعهدهنده

`Install-BabolToyor.ps1` منبع خوانای نصبکننده است و `BabolToyor-Setup.cmd` بهصورت خودکار از روی آن ساخته میشود:

```bash
node windows-installer/build-single-file.js
```

خروجی همان فایل تکی است (پیلود PowerShell بهصورت base64 درون `.cmd` قرار میگیرد تا مشکل execution policy، کدپیج و فایل دانلودشده پیش نیاید). تست قراردادی: `npm test` → `tests/windows-installer.test.js`.


## دیتابیس SQL

دیتابیس سامانه **SQLite** است (فایل `C:\BabolToyor\data\baboltoyoor.db`)، با جداول واقعی و ایندکس. **هیچ SQLite ای نباید نصب کنید**: ماژول `node:sqlite` داخل خود Node.js است؛ فقط **Node.js حداقل ۲۲٫۵** لازم است و نصبکننده خودش آن را تأمین میکند. نیازی به SQL Server، ODBC، `sqlite3.exe` یا DB Browser نیست.

اگر فقط خواستید فایل دیتابیس را با ابزاری ببینید (**کاملاً اختیاری**): از <https://www.sqlite.org/download.html> بخش *Precompiled Binaries for Windows* فایل `sqlite-tools-win-x64-3540100.zip` (SQLite 3.54.1 — عدد انتهای نام فایل = نسخه؛ آخرین نسخهٔ همان صفحه را بگیرید) یا [DB Browser for SQLite](https://sqlitebrowser.org/dl/) را تهیه کنید. این ابزارها هیچ نقشی در نصب و اجرای سامانه ندارند.

اگر قبلاً `db.json` داشتهاید، اولین اجرا اطلاعات را به SQL منتقل و فایل قدیمی را بایگانی میکند. پرسوجو و پشتیبانگیری:

```bat
node scripts\sql-query.js --stats
node scripts\sql-query.js "SELECT order_no, status FROM orders"
node scripts\backup-db.js
```

راهنمای کامل: `docs/sqlite-database-fa.md`.
