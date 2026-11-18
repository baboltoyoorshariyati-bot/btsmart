'use strict';
// منطق مشترک مشتریان (بدون وابستگی به store تا از چرخه‌ی وابستگی جلوگیری شود).
// هر مشتری یک «کد مشتری» ثابت دارد (C-00001)؛ مراجعه‌ی بعدی با کد، شماره تماس یا پلاک
// به همان پرونده وصل می‌شود و نیازی به ثبت دوباره نیست.
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

// پیدا کردن پرونده‌ی موجود: اول کد مشتری، سپس شماره تماس، سپس پلاک.
function findExisting(db, { customerId, code, phone, plate } = {}) {
  const list = db.customers || [];
  if (customerId) {
    const byId = list.find((c) => c.id === customerId);
    if (byId) return byId;
  }
  const c = normalizeCode(code);
  if (c) {
    const byCode = list.find((x) => normalizeCode(x.code) === c);
    if (byCode) return byCode;
  }
  if (phone) {
    const byPhone = list.find((x) => String(x.phone || '') === phone);
    if (byPhone) return byPhone;
  }
  if (plate) {
    const byPlate = list.find((x) => x.plate && x.plate === plate);
    if (byPlate) return byPlate;
  }
  return null;
}

module.exports = { VEHICLE_TYPES, formatCode, normalizeCode, nextCode, ensureCodes, cleanProfile, findExisting };
