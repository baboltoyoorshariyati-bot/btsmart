# نصب گامبهگام سامانهٔ بابل طیور روی Windows Server 2025

> **بدون کدنویسی، بدون نصب SQL Server، بدون نصب SQLite، بدون تنظیمات دستی.**
> فقط ۳ فایل دانلود کنید، یک راستکلیک کنید، و منتظر بمانید.
>
> نسخهٔ این راهنما: فاز ۳ (۲۰۲۶/۰۸/۰۶ — ۲۸ اکتبر ۲۰۲۶) • زبان: فارسی
> نسخهٔ قابلچاپ: [`INSTALL-STEPS-fa.html`](INSTALL-STEPS-fa.html)

---

## ⭐ پاسخ کوتاه به سؤال SQLite — حتماً همین اول بخوانید

**خیر، هیچ SQLite ای نباید نصب کنید. نه نسخهای، نه از جایی، نه هیچ درایوری.**

| پرسش | پاسخ |
|---|---|
| آیا SQLite باید نصب شود؟ | **خیر.** SQLite یک «نرمافزار سرور» نیست که نصب شود؛ یک کتابخانه است که **داخل خود Node.js کامپایل شده** است. نصبکننده Node.js را نصب میکند و SQLite همراهش میآید. |
| پس چه چیزی نصب میشود؟ | فقط **Node.js نسخهٔ ۲۲٫۵ یا newer** — و آن را هم نصبکننده بهصورت **خودکار** انجام میدهد. شما کاری نمیکنید. |
| دیتابیس کجاست؟ | یک فایل ساده: `C:\BabolToyor\data\baboltoyoor.db`. نه سرویسی، نه نام کاربری/رمز جداگانه، نه ODBC، نه SQL Server Express. |
| آیا `sqlite3.exe` یا DB Browser لازم است؟ | **خیر، برای نصب و کار روزمره اصلاً لازم نیست.** فقط اگر خودتان خواستید محتویات دیتابیس را ببینید، ابزار اختیاری در «پرسشهای متداول» معرفی شده. |
| اگر Node.js روی سرور قدیمی باشد (مثلاً ۲۰)؟ | نصبکننده خودش نسخهٔ ۲۲+ را کنارش نصب میکند؛ لازم نیست چیزی را حذف کنید. |

**منبع فنی:** ماژول `node:sqlite` از **Node.js 22.5.0** به بعد جزو خود Node است و بههیچ `npm install`، درایور یا کتابخانهای نیاز ندارد — [مستندات رسمی Node.js](https://nodejs.org/docs/latest-v22.x/api/sqlite.html).
حداقل نسخهٔ ثبتشده در پروژه: `>=22.5.0` (`package.json`). تستهای پروژه روی **Node.js 22 LTS** اجرا شدهاند.

> ⚠️ **یک نکتهٔ مهم:** نسخههای **Node.js 20 و قدیمیتر** این قابلیت را ندارند و سامانه بالا نمیآید. اگر سرور شما Node 20 دارد، نگران نباشید؛ نصبکننده نسخهٔ جدید را اضافه میکند.

---

## ✅ چکلیست یکصفحهای (همین را چاپ کنید و جلویتان بگذارید)

| ✔ | کار | کجا / چه چیزی |
|---|---|---|
| ☐ | ۱. دانلود بستهٔ نصب | [`BabolToyor-Windows-Setup-1.1.16.zip`](https://drive.google.com/drive/folders/16uYof8vtFzX5ZiMIW5vZWad9M2RxvzAp) |
| ☐ | ۲. (فقط سرور بدون اینترنت) دانلود Node پورتابل | `node-v22.x.x-win-x64.zip` از [nodejs.org/dist](https://nodejs.org/dist/) |
| ☐ | ۳. کپی فایلها در پوشهای مثل `C:\BabolToyor-Install` | همان ۳ فایل کنار هم |
| ☐ | ۴. راستکلیک روی ZIP → **Extract All** | پوشهٔ استخراجشده |
| ☐ | ۵. راستکلیک روی `BabolToyor-Setup.cmd` → **Run as administrator** | UAC → **Yes** |
| ☐ | ۶. صبر کنید تا `INSTALLATION FINISHED` بیاید | ۲ تا ۱۰ دقیقه (بسته به اینترنت) |
| ☐ | ۷. باز کردن `C:\BabolToyor\INSTALL-INFO.txt` | نام کاربری `admin` + رمز اولیه |
| ☐ | ۸. مرورگر → `http://localhost` (بدون پورت) | یا `http://IP-سرور` از کامپیوتر دیگر |
| ☐ | ۹. ورود و **تعویض اجباری رمز** | رمز جدید را جایی امن یادداشت کنید |
| ☐ | ۱۰. حذف فایل `INSTALL-INFO.txt` | چون رمز اولیه داخلش است |
| ☐ | ۱۱. بررسی: `BabolToyor-Setup.cmd status` | باید `LISTENING` و `HTTP 200 OK` ببینید |

---

## قبل از شروع — فقط ۴ چیز لازم است

1. **یک سرور Windows Server 2025** که با حسابی با دسترسی **Administrator** وارد شدهاید.
2. **حدود ۳۰۰ مگابایت فضای خالی** در درایو `C:` (خود برنامه حدود ۲۰ مگابایت است؛ بقیه برای Node.js و بکاپ).
3. **فایلهای نصب** (گام ۱).
4. **اینترنت** — فقط و فقط برای دانلود Node.js، اگر قبلاً روی سرور نصب نباشد. اگر سرور اصلاً اینترنت ندارد، گام ۱ «حالت ب» را بخوانید.

هیچ نیازی به: SQL Server، MySQL، PostgreSQL، SQLite جداگانه، IIS، ویرایش `web.config`، `npm install`، ویرایش رجیستری، یا باز کردن دستی پورت نیست.

---

## گام ۱ — دانلود فایلها

### حالت الف — سرور به اینترنت وصل است (پیشنهادی، سادهترین حالت)

کافی است **همین یک فایل** را دانلود کنید:

| فایل | پوشهٔ دانلود | اندازه |
|---|---|---|
| **`BabolToyor-Windows-Setup-1.1.16.zip`** | [پوشهٔ دریافت در Google Drive](https://drive.google.com/drive/folders/16uYof8vtFzX5ZiMIW5vZWad9M2RxvzAp) | حدود ۴٫۲ مگابایت |

پوشهٔ انتشار Google Drive (فهرست دارایی‌های نسخه):
<https://drive.google.com/drive/folders/16uYof8vtFzX5ZiMIW5vZWad9M2RxvzAp>

> در این حالت، نصبکننده خودش Node.js را از `winget` یا سایت رسمی `nodejs.org` میگیرد و **چکسام SHA-256 اش را بررسی میکند**. شما هیچ کاری نمیکنید.

**اگر فقط همان یک فایل `BabolToyor-Setup-1.1.16.cmd` را میخواهید** (بدون بستهٔ آفلاین)، آن را از پوشهٔ Google Drive دریافت کنید؛ برای دانلود برنامه و Node اینترنت لازم است:
<https://drive.google.com/drive/folders/16uYof8vtFzX5ZiMIW5vZWad9M2RxvzAp>

### حالت ب — سرور کاملاً آفلاین است (هیچ اینترنتی ندارد)

علاوه بر ZIP بالا، **یک فایل دیگر** هم لازم دارید:

| فایل اضافه | از کجا | توضیح |
|---|---|---|
| `node-v22.x.x-win-x64.zip` | [nodejs.org/en/download](https://nodejs.org/en/download) → بخش **Standalone Binary / Windows x64 (.zip)**، یا لیست [nodejs.org/dist](https://nodejs.org/dist/) → پوشهٔ `v22.x.x/` | نسخهٔ **۲۲ LTS یا newer**، حتماً **x64 / 64-bit**. این فایل «پورتابل» است؛ نصب نمیشود، فقط استخراج میشود. |

مثال نام فایل درست: `node-v22.22.3-win-x64.zip`
مثال نام نادرست: `node-v22.x-x86.msi` (۳۲بیتی یا MSI — برای حالت آفلاین مناسب نیست).

> نیازی به استخراج این فایل نیست؛ فقط آن را **همانطور ZIPشده** کنار `BabolToyor-Setup.cmd` بگذارید. نصبکننده خودش آن را پیدا و استفاده میکند.
> در این حالت هیچ چیزی روی ویندوز «نصب» نمیشود و هیچ اینترنتی لازم نیست.

---

## گام ۲ — انتقال فایلها به سرور

1. روی ویندوز سرور، یک پوشهٔ ساده بسازید:
   `C:\BabolToyor-Install`
2. فایل `BabolToyor-Windows-Setup-1.1.16.zip` را از کامپیوتر خودتان (فلش، شبکه، RDP، Share، ...) به این پوشه کپی کنید.
3. **(فقط حالت ب)** فایل `node-v22.x.x-win-x64.zip` را هم به همان پوشه کپی کنید.

> اگر فایل از اینترنت دانلود شده و ویندوز هشدار داد: روی فایل راستکلیک → **Properties** → تیک **Unblock** پایین پنجره → **OK**.

---

## گام ۳ — استخراج ZIP

1. روی `BabolToyor-Windows-Setup-1.1.16.zip` **راستکلیک** کنید.
2. **Extract All...** را بزنید.
3. محل استخراج را همان `C:\BabolToyor-Install` نگه دارید (یا پوشهای که ساختید) → **Extract**.

حالا باید این ۳ فایل را **کنار هم** ببینید:

```
C:\BabolToyor-Install\
├── BabolToyor-Setup.cmd      ← نصبکنندهٔ تکفایل
├── app.zip                   ← فایلهای سامانه (همان نسخهٔ SQLite + فاز ۳)
└── README-INSTALL-fa.txt     ← راهنمای کوتاه داخل بسته
```

> **(حالت ب)** فایل `node-v22.x.x-win-x64.zip` را هم در همین پوشه قرار دهید تا ۴ فایل شوند.
> مهم: `app.zip` را جدا نکنید و جابهجا نکنید؛ نصبکننده دنبالش میگردد.

---

## گام ۴ — اجرای نصبکننده (مهمترین گام)

1. روی **`BabolToyor-Setup.cmd`** **راستکلیک** کنید.
2. گزینهٔ **Run as administrator** را بزنید.
3. پنجرهای با عنوان **User Account Control** میپرسد «Do you want to allow this app to make changes?» → **Yes** را بزنید.

> اگر دابلکلیک کردید هم خودش درخواست بالا رفتن دسترسی میدهد. ولی راستکلیک → Run as administrator مطمئنتر است.
> اگر پیامی دربارهٔ **PowerShell Execution Policy** یا **SmartScreen** دیدید: نگران نباشید، فایل `.cmd` با `ExecutionPolicy Bypass` اجرا میشود. فقط کافی است **Unblock** (گام ۲) را انجام داده باشید؛ در صورت نیاز **More info → Run anyway** را بزنید.

یک پنجرهٔ مشکی (Command Prompt) باز میشود و خطوط سبز/سفید پیشرفت نصب را نشان میدهد. **این پنجره را نبندید.**

---

## گام ۵ — منتظر بمانید؛ نصبکننده خودش این کارها را میکند

| # | کاری که انجام میشود | توضیح ساده |
|---|---|---|
| ۱ | بررسی/نصب **Node.js 22.5+** | از فایل پورتابل کنارش، یا winget، یا دانلود رسمی با بررسی SHA-256. **همینجا SQLite هم میآید — جداگانه نصب نمیشود.** |
| ۲ | آزاد کردن **پورت ۸۰** | اگر IIS یا سرویس دیگری پورت ۸۰ را گرفته باشد، نصبکننده آن را متوقف و غیرفعال میکند (در لاگ مینویسد). |
| ۳ | کپی برنامه در `C:\BabolToyor` | از روی `app.zip` — یعنی نیازی به دانلود سامانه نیست. |
| ۴ | ساخت `.env` با `PORT=80` | برای همین در مرورگر پورت نمینویسید. |
| ۵ | ساخت دیتابیس SQLite | فایل `C:\BabolToyor\data\baboltoyoor.db` با جداول واقعی ساخته میشود. **هیچ نصب SQL لازم نیست.** |
| ۶ | باز کردن فایروال | قانون `Babol Toyor - HTTP (TCP 80)` برای هر سه پروفایل Domain/Private/Public. |
| ۷ | اجرای خودکار | یک Scheduled Task به نام `Babol Toyor - Application Server` با حساب `SYSTEM` هنگام بوت بالا میآید؛ اگر برنامهای کرش کند، ظرف ۵ ثانیه ریاستارت میشود. |
| ۸ | ساخت رمز مدیر | یک رمز قوی تصادفی ساخته و در `C:\BabolToyor\INSTALL-INFO.txt` نوشته میشود (دسترسی فقط administratorها). |
| ۹ | تست سلامت و میانبر | تست `GET /api/server-time` و ساخت میانبر `http://localhost/` روی دسکتاپ و Start Menu. |

**زمان معمول:** ۲ تا ۵ دقیقه با اینترنت خوب؛ تا ۱۰ دقیقه اگر Node.js باید دانلود شود.

**پایان موفق:** وقتی این پیام را دیدید، نصب تمام شده است:

```
========================================================
  INSTALLATION FINISHED
  Open: http://localhost/   (no port needed)
  User: admin
  Initial password: ...
  Full details (Persian): C:\BabolToyor\INSTALL-INFO.txt
  Change the admin password at first login, then delete that file.
========================================================
```

سپس `Press any key to continue . . .` میآید — یک کلید بزنید تا پنجره بسته شود.

---

## گام ۶ — باز کردن سامانه

- **روی خود سرور:** مرورگر را باز کنید و بنویسید:
  ```
  http://localhost
  ```
  (بدون `:80`، بدون `www`، بدون `https`.)
- **از کامپیوتر دیگر در همان شبکه:**
  ```
  http://IP-سرور
  ```
  مثلاً `http://192.168.1.50` — باز هم بدون پورت.

> صفحهای با عنوان سامانهٔ بابل طیور و فرم ورود باید بیاید. اگر نیامد، بخش «عیبیابی» را ببینید.

---

## گام ۷ — اولین ورود و تعویض اجباری رمز

1. فایل **`C:\BabolToyor\INSTALL-INFO.txt`** را با Notepad باز کنید. داخلش نوشته:
   - Address (آدرس سامانه)
   - Username: `admin`
   - Initial password (رمز اولیهٔ تصادفی)
2. در صفحهٔ ورود، نام کاربری `admin` و همان رمز را وارد کنید.
3. سامانه **بلافاصله تعویض رمز را اجباری میکند**. رمز جدیدی انتخاب کنید:
   - حداقل ۸ کاراکتر، ترکیب حروف بزرگ و کوچک، عدد و نماد (مثلاً `Babol@1405!Server`).
   - رمز جدید را در جای امنی یادداشت کنید (مثلاً password manager سازمان).
4. بعد از تعویض موفق، دوباره وارد شوید و وارد پنل مدیریت شوید.

> 🔒 **بعد از اینکه رمز را عوض کردید، فایل `C:\BabolToyor\INSTALL-INFO.txt` را پاک کنید** چون رمز اولیه داخلش است.
> گام بعدی پیشنهادی: از منوی مدیریت، کاربران نقشها (نگهبانی، فروش، انبار، پخش، ...) را بسازید.

---

## گام ۸ — بررسی نهایی سلامت (اختیاری ولی توصیه میشود)

روی همان فایل `BabolToyor-Setup.cmd` راستکلیک → **Run as administrator**، ولی این بار دستور را در `cmd` بدهید. سادهتر: یک **Command Prompt** معمولی باز کنید و بنویسید:

```bat
cd /d C:\BabolToyor-Install
BabolToyor-Setup.cmd status
```

باید چیزی شبیه این ببینید:

```
Port 80   : LISTENING (PID ...)
Node procs: 1
URL       : http://localhost/
Health    : HTTP 200 OK
```

اگر `HTTP 200 OK` آمد، یعنی سرور، دیتابیس و ارتباط شبکه همگی سالم هستند. ✅

---

## دستورات روزمره (همان یک فایل)

دستورات را در Command Prompt داخل پوشهای که `BabolToyor-Setup.cmd` هست اجرا کنید:

| دستور | کاربرد |
|---|---|
| `BabolToyor-Setup.cmd status` | وضعیت سرویس، پورت ۸۰ و سلامت |
| `BabolToyor-Setup.cmd logs` | ۴۰ خط آخر لاگها (اولین جای عیبیابی) |
| `BabolToyor-Setup.cmd restart` | راهاندازی مجدد سامانه |
| `BabolToyor-Setup.cmd uninstall` | حذف سامانه — **دادهها حفظ میشوند** |
| `BabolToyor-Setup.cmd help` | نمایش همهٔ پارامترها |

پارامترهای اختیاری موقع نصب (فقط اگر لازم داشتید):

| پارامتر | مثال | توضیح |
|---|---|---|
| `-Port` | `BabolToyor-Setup.cmd -Port 8080` | تغییر پورت (پیشفرض ۸۰) |
| `-InstallDir` | `-InstallDir "D:\BabolToyor"` | تغییر محل نصب |
| `-NoAutoStopIis` | — | جلوگیری از دستکاری IIS |
| `-SourcePath` | `-SourcePath "D:\app.zip"` | نصب از مسیر محلی |

---

## محل فایلها (برای بکاپ و پیگیری)

| مسیر | محتوا |
|---|---|
| `C:\BabolToyor\` | برنامه (`server.js`، `lib`، `public`، ...) |
| `C:\BabolToyor\data\baboltoyoor.db` | ⭐ **پایگاه داده — حتماً پشتیبان بگیرید** |
| `C:\BabolToyor\.env` | تنظیمات (`PORT=80`) و رمز اولیهٔ مدیر |
| `C:\BabolToyor\logs\` | `install.log`، `server.out.log`، `server.err.log`، `supervisor.log` |
| `C:\BabolToyor\INSTALL-INFO.txt` | رمز اولیه (بعد از تعویض رمز پاک کنید) |
| `C:\BabolToyor\service\supervisor.ps1` | نگهدارندهٔ ریاستارت خودکار |

نام تسک ویندوز: `Babol Toyor - Application Server` (در Task Scheduler).
نام قانون فایروال: `Babol Toyor - HTTP (TCP 80)`.

---

## پشتیبانگیری (حتماً انجام دهید)

سادهترین روش امن، استفاده از ابزار داخلی خود سامانه (هیچ نرمافزاری نمیخواهد):

```bat
cd /d C:\BabolToyor
node scripts\backup-db.js D:\Backup\baboltoyoor.db
```

این دستور یک کپی یکپارچه و سالم (با `VACUUM INTO`) میگیرد؛ نیازی به متوقف کردن سامانه نیست. فایل خروجی را هر روز/هفته به یک درایو یا سرور دیگر کپی کنید.

> برای کپی دستی `baboltoyoor.db`، حتماً اول سرویس را متوقف کنید یا از همان دستور بالا استفاده کنید (چون SQLite در حالت WAL فایلهای `-wal` و `-shm` کنارش دارد).

---

## ارتقا و حذف

- **ارتقا:** همان `BabolToyor-Setup.cmd` جدید را دوباره با Run as administrator اجرا کنید. فایلهای برنامه جایگزین میشوند و **`data`، `.env`، `logs` و رمز مدیر دستنخورده میمانند**. فقط `PORT` دوباره روی ۸۰ تنظیم میشود.
- **حذف:** `BabolToyor-Setup.cmd uninstall` — برنامه و تسک حذف میشوند ولی **دیتابیس باقی میماند** (مگر `-PurgeData` بدهید).

---

## عیبیابی — مشکلات رایج

| علامت | علت احتمالی | راهحل |
|---|---|---|
| صفحه باز نمیشود | سرویس بالا نیامده | `BabolToyor-Setup.cmd status` و سپس `BabolToyor-Setup.cmd restart` |
| پیام `Health: NOT RESPONDING` | پورت ۸۰ اشغال یا Node نصب نشده | `BabolToyor-Setup.cmd logs` → لاگ نصب را ببینید |
| هشدار SmartScreen / فایل بلاکشده | فایل دانلودشده از اینترنت | راستکلیک → **Properties** → تیک **Unblock** → **OK** |
| درخواست UAC رد شد | اجرا بدون Administrator | راستکلیک → **Run as administrator** |
| خطای مربوط به IIS / پورت ۸۰ | سایت IIS پورت را گرفته | نصبکننده خودکار متوقفش میکند؛ لاگ `install.log` را ببینید. یا `-NoAutoStopIis -Port 8080` |
| از کامپیوترهای دیگر وصل نمیشود | فایروال یا پروفایل شبکه | روی کلاینت: `Test-NetConnection IP-سرور -Port 80`؛ قانون فایروال `Babol Toyor - HTTP (TCP 80)` را بررسی کنید |
| رمز مدیر را گم کردم | — | فایل `INSTALL-INFO.txt` و `.env` را ببینید (رمز اولیه فقط تا اولین تعویض معتبر است) |
| سرور بدون اینترنت، نصب گیر کرد | Node پورتابل کنار فایلها نیست | فایل `node-v22.x.x-win-x64.zip` را کنار `.cmd` بگذارید و دوباره اجرا کنید |
| پیام `Node.js 22+ not found` | Node قدیمی (۲۰ یا کمتر) | بگذارید نصبکننده نسخهٔ جدید نصب کند؛ یا دستی Node 22 LTS بریزید |

محل لاگ نصب: `C:\BabolToyor\logs\install.log`

---

## پرسشهای متداول

### ۱) آیا باید SQLite نصب کنم؟ کدام نسخه؟ از کجا؟

**خیر — هیچ نسخهای و از هیچ جایی.**SQLite درون Node.js است. نصبکننده `C:\BabolToyor\data\baboltoyoor.db` را خودش میسازد. نیازی به sqlite.org، `sqlite3.exe`، ODBC، SQL Server Express یا DB Browser نیست.
منبع: [`node:sqlite` از Node 22.5.0 به بعد داخلی است](https://nodejs.org/docs/latest-v22.x/api/sqlite.html).

### ۲) پس دقیقاً چه نرمافزاری نصب میشود؟

فقط **Node.js نسخهٔ ۲۲٫۵ یا newer** (ترجیحاً LTS). نصبکننده خودکار انجام میدهد. اگر خواستید دستی بدهید:
<https://nodejs.org/en/download> → گزینهٔ **LTS** → **Windows Installer (.msi) x64** → Next تا Finish.
برای سرور بدون اینترنت: همان صفحه → **Windows x64 ZIP (Standalone Binary)** → فایل `node-v22.x.x-win-x64.zip` کنار نصبکننده.

### ۳) من اجباراً میخواهم دیتابیس را ببینم — ابزاری هست؟ (کاملاً اختیاری)

بله، ولی **برای نصب یا کار روزمره لازم نیست**. دو گزینه:

- **بدون نصب چیز اضافی (پیشنهادی):** ابزار داخل خود سامانه:
  ```bat
  cd /d C:\BabolToyor
  node scripts\sql-query.js --stats
  node scripts\sql-query.js "SELECT order_no, status FROM orders"
  ```
- **ابزار گرافیکی اختیاری:** [صفحهٔ دانلود SQLite](https://www.sqlite.org/download.html) → بخش **Precompiled Binaries for Windows** → فایل `sqlite-tools-win-x64-3540100.zip` (SQLite **3.54.1**) را بگیرید و در `C:\sqlite` استخراج کنید؛ یا [DB Browser for SQLite](https://sqlitebrowser.org/dl/) را نصب کنید تا فایل `.db` را با موس باز کنید.
  > عدد انتهای نام فایل نسخه است: `3540100` یعنی ۳٫۵۴٫۱. همیشه آخرین نسخهٔ همان صفحه را بگیرید.
  > دقت کنید نسخهٔ SQLite داخل Node.js ممکن است با این ابزار فرق داشته باشد؛ این موضوع برای باز کردن فایل مشکلی ایجاد نمیکند.

### ۴) آیا اطلاعات قبلی (`db.json`) از بین میرود؟

خیر. اگر از نسخهٔ قدیمی JSON میآیید، **اولین اجرا** اطلاعات را خودکار به جداول SQL منتقل میکند و فایل قدیمی را به `db.json.migrated-<تاریخ>` تغییر نام میدهد.

### ۵) آیا سامانه امن است؟

در حالت پیشفرض روی **HTTP و پورت ۸۰** است (چون درخواست شده بود که پورت نوشته نشود). رمزها هش میشوند، نشستها و لاگ Audit دارند، و فایل `.env` فقط برای Administratorها قابلخواندن است. اگر بعدها HTTPS/reverse proxy اضافه کردید، در `.env` مقادیر `COOKIE_SECURE=true` و `TRUST_PROXY=true` را قرار دهید.

### ۶) چند نفر همزمان میتوانند وارد شوند؟

بله؛ سامانه چندنفره است. SQLite در حالت WAL و تراکنشهای ردیفبهردیف (فاز ۳) کار میکند و برای تیم یک دفتر/کارخانه مناسب است. فقط حواستان باشد **همزمان دو سرور جداگانه به یک فایل `.db` وصل نشوند**.

---

## خلاصهٔ لینکها

| مورد | لینک |
|---|---|
| پوشهٔ انتشار Google Drive | <https://drive.google.com/drive/folders/16uYof8vtFzX5ZiMIW5vZWad9M2RxvzAp> |
| بستهٔ آفلاین نصب (پیشنهادی) | <https://drive.google.com/drive/folders/16uYof8vtFzX5ZiMIW5vZWad9M2RxvzAp> |
| فقط نصبکنندهٔ تکفایل | <https://drive.google.com/drive/folders/16uYof8vtFzX5ZiMIW5vZWad9M2RxvzAp> |
| Node.js (فقط اگر خواستید دستی نصب کنید) | <https://nodejs.org/en/download> — LTS، Windows x64 |
| فایل پورتابل Node برای سرور آفلاین | <https://nodejs.org/dist/> → `v22.x.x/` → `node-v22.x.x-win-x64.zip` |
| ابزار اختیاری SQLite (نیازی نیست) | <https://www.sqlite.org/download.html> |
| مستند فنی دیتابیس SQL | `docs/sqlite-database-fa.md` |
| مستند استقرار ویندوز | `docs/deployment-windows-server-2025.md` |
| راهنمای کامل نصبکننده | `windows-installer/README-fa.md` |

---

**تمام.** اگر `INSTALLATION FINISHED` را دیدید و صفحهٔ ورود بالا آمد، نصب موفق بوده است — نه SQLite نصب کردهاید، نه کدی نوشتهاید. 🎉
