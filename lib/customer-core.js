'use strict';
// منطق مشترک مشتریان (بدون وابستگی به store تا از چرخه‌ی وابستگی جلوگیری شود).
// هر مشتری یک کد ثابت دارد؛ اتصال خودکار بر اساس شماره تماس انجام می‌شود.
const { fail } = require('./http');
const validate = require('./validate');

const VEHICLE_TYPES = ['خودرو', 'موتورسیکلت', 'وانت', 'بدون وسیله'];

// کد مشتری فقط پنج رقم است: 00001
const formatCode = (n) => String(n).padStart(5, '0');

// کدهای قدیمی با پیشوند C (مثل C-00001) هم خوانده می‌شوند
const codeNumber = (v) => {
  const m = /^(?:C-?)?(\d{1,8})$/.exec(String(v ?? '').trim().toUpperCase());
  return m ? Number(m[1]) : 0;
};

// «7»، «00007» یا «C-00007» را به شکل استاندارد 00007 تبدیل می‌کند.
const normalizeCode = (v) => {
  const s = validate.digitsToAscii(String(v ?? '')).trim().toUpperCase().replace(/\s+/g, '');
  const m = /^(?:C-?)?(\d{1,8})$/.exec(s);
  return m ? formatCode(Number(m[1])) : s;
};

// شماره‌ی بعدی را بر اساس بیشترین کد موجود و شمارنده‌ی ذخیره‌شده می‌دهد.
function nextCode(db) {
  db.counters ||= {};
  let max = Number(db.counters.customerSeq || 0);
  for (const c of db.customers || []) max = Math.max(max, codeNumber(c.code));
  db.counters.customerSeq = max + 1;
  return formatCode(max + 1);
}

// مشتری‌های قدیمی بدون کد را هنگام بارگذاری کد می‌دهد (idempotent).
function ensureCodes(db) {
  db.customers ||= [];
  for (const c of db.customers) {
    if (c.code && /^C-?\d+$/i.test(String(c.code))) c.code = formatCode(codeNumber(c.code));
    if (!c.code) c.code = nextCode(db);
  }
  return db;
}

// اعتبارسنجی فیلدهای پرونده‌ی مشتری. فیلدهای اختیاری خالی می‌مانند.
function cleanProfile(b, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!partial || has('name')) out.name = validate.text(b.name, { field: 'نام و نام خانوادگی', max: 120, required: true });
  if (!partial || has('phone')) out.phone = validate.phone(b.phone);
  if (has('phone2')) out.phone2 = b.phone2 ? validate.phone(b.phone2, { required: false }) : '';
  if (has('nationalId')) {
    const id = validate.digitsToAscii(String(b.nationalId || '')).replace(/\s+/g, '');
    if (id && !/^\d{10}$/.test(id)) fail(400, 'کد ملی باید ۱۰ رقم باشد.');
    out.nationalId = id;
  }
  if (has('company')) out.company = validate.text(b.company || '', { field: 'شرکت / واحد', max: 120 });
  if (has('district')) out.district = validate.text(b.district || '', { field: 'محله', max: 100 });
  if (has('address')) out.address = validate.text(b.address || '', { field: 'نشانی', max: 250 });
  if (has('plate')) out.plate = b.plate ? validate.plate(b.plate) : '';
  if (has('vehicleType')) {
    const vt = validate.text(b.vehicleType || 'بدون وسیله', { field: 'نوع وسیله', max: 40 });
    if (!VEHICLE_TYPES.includes(vt)) fail(400, 'نوع وسیله معتبر نیست.');
    out.vehicleType = vt;
  }
  if (has('notes')) out.notes = validate.text(b.notes || '', { field: 'یادداشت', max: 1000 });
  return out;
}

// نرمال‌سازی نام برای مقایسهٔ «همان شخص»: ی/ک عربی، همزه‌دارها، نیم‌فاصله و فاصله‌های اضافی.
// «رضائي» و «رضایی»، «أحمد» و «احمد»، «فاطمه» و «فاطمهٔ» همه یک شخص‌اند.
function nameKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652\u0670]/g, '') // اعراب
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

// دو نام وقتی «همان شخص» حساب می‌شوند که برابر باشند یا یکی ادامهٔ دیگری باشد
// («محمد» و «محمد احمدی»). رفع باگ: تحویل‌گیرنده‌ای که نام و شمارهٔ او با پلاک یا
// شمارهٔ صاحب سفارش قبلی جور درمی‌آمد، پروندهٔ آن مشتری را به نام خودش بازنویسی
// می‌کرد و خودش هم هرگز به‌عنوان مشتری مستقل ثبت نمی‌شد.
function namesCompatible(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

// A comparison key only; preserve the entered number on the profile. Normalize
// Iranian national numbers and their +98/0098 equivalents, not arbitrary foreign numbers.
function phoneKey(value) {
  const s = validate.digitsToAscii(String(value || '')).trim().replace(/[\s-]/g, '');
  if (/^\+98[1-9]\d{9}$/.test(s)) return '0' + s.slice(3);
  if (/^0098[1-9]\d{9}$/.test(s)) return '0' + s.slice(4);
  return s;
}
function phoneOwners(db, phone) {
  const key = phoneKey(phone);
  return key ? (db.customers || []).filter(c => [c.phone, c.phone2].some(p => phoneKey(p) === key)) : [];
}
function duplicatePhones(db) {
  const groups = new Map();
  for (const c of db.customers || []) for (const key of new Set([phoneKey(c.phone), phoneKey(c.phone2)].filter(Boolean))) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: c.id, code: c.code, name: c.name });
  }
  return [...groups].filter(([, owners]) => owners.length > 1).map(([phone, customers]) => ({ phone, customers }));
}
function assertPhoneFree(db, phone, selfId) {
  const others = phoneOwners(db, phone).filter(c => c.id !== selfId);
  if (others.length) {
    const other = others[0];
    fail(409, `این شماره قبلاً برای «${other.name}» با کد ${other.code} ثبت شده است؛ پرونده را بررسی کنید.`, 'DUPLICATE_PHONE');
  }
}
// A plate or name is never sufficient to select a customer automatically.
function findExisting(db, { customerId, code, phone } = {}) {
  const list = db.customers || [];
  if (customerId) return list.find(c => c.id === customerId) || null;
  if (code) return list.find(c => normalizeCode(c.code) === normalizeCode(code)) || null;
  const owners = phoneOwners(db, phone);
  return owners.length === 1 ? owners[0] : null;
}

module.exports = { VEHICLE_TYPES, formatCode, normalizeCode, nextCode, ensureCodes, cleanProfile, findExisting, nameKey, namesCompatible, phoneKey, phoneOwners, duplicatePhones, assertPhoneFree };
