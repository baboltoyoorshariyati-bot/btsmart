'use strict';
// اعتبارسنجی ورودی‌ها در Backend (مرجع نهایی؛ اعتبارسنجی Frontend صرفاً برای تجربه کاربری است)
const { fail } = require('./http');

const UNITS = ['کیلوگرم', 'بسته', 'عدد', 'کارتن'];
const MAX_QTY = 100000;      // بیشینه مقدار یک قلم
const MAX_MONEY = 1e12;      // بیشینه مبلغ (ریال)
const MAX_ITEMS = 100;       // بیشینه اقلام در یک سفارش
const MAX_SIGNATURE = 2 * 1024 * 1024;

const digitsToAscii = (v) => String(v ?? '')
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

function text(v, { field, max = 255, required = false } = {}) {
  const s = String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !s) fail(400, `${field || 'فیلد'} الزامی است.`);
  if (s.length > max) fail(400, `${field || 'فیلد'} بیش از ${max} کاراکتر است.`);
  return s;
}

function number(v, { field, min = -Infinity, max = Infinity, required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) fail(400, `${field || 'مقدار'} الزامی است.`);
    return null;
  }
  // ریال: جداسازی سه‌رقمی با ویرگول فارسی ٬ یا انگلیسی , + ارقام فارسی
  if (typeof v !== 'number' && typeof v !== 'string') fail(400, `${field || 'مقدار'} باید عدد باشد.`);
  const input = digitsToAscii(String(v)).trim().replace(/٫/g, '.');
  // Only valid plain decimals or correctly grouped thousands; never discard arbitrary text.
  if (typeof v === 'string' && !/^-?(?:\d+|\d{1,3}(?:[,٬]\d{3})+)(?:\.\d+)?$/.test(input))
    fail(400, `${field || 'مقدار'} باید عدد معتبر باشد.`);
  const raw = input.replace(/[,٬]/g, '');
  const n = typeof v === 'number' ? v : Number(raw);
  if (!Number.isFinite(n)) fail(400, `${field || 'مقدار'} باید عدد باشد.`);
  if (n < min) fail(400, `${field || 'مقدار'} نمی‌تواند کمتر از ${min} باشد.`);
  if (n > max) fail(400, `${field || 'مقدار'} بیش از حد مجاز است.`);
  return n;
}

function unit(v) {
  const u = text(v || 'کیلوگرم', { field: 'واحد', max: 20 });
  if (!UNITS.includes(u)) fail(400, 'واحد سفارش معتبر نیست.');
  return u;
}

function phone(v, { required = true } = {}) {
  const s = digitsToAscii(text(v, { field: 'شماره تماس', max: 30, required })).replace(/[\s-]/g, '');
  if (!s && !required) return '';
  if (!/^\+?\d{4,15}$/.test(s)) fail(400, 'شماره تماس معتبر نیست.');
  return s;
}

function localDateTime(v) {
  const s = String(v || '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3])):([0-5]\d)$/);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && dt.getHours() === h && dt.getMinutes() === mi;
}

function items(list, { min = 1 } = {}) {
  if (!Array.isArray(list)) fail(400, 'فهرست اقلام نامعتبر است.');
  if (list.length < min) fail(400, min > 1 ? `حداقل ${min} قلم وارد کنید.` : 'حداقل یک محصول وارد کنید.');
  if (list.length > MAX_ITEMS) fail(400, `حداکثر ${MAX_ITEMS} قلم در هر سفارش مجاز است.`);
}

function signature(v) {
  const s = String(v || '');
  if (!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(s) || s.length < 200) fail(400, 'امضای الکترونیکی مشتری الزامی است.');
  if (s.length > MAX_SIGNATURE) fail(413, 'حجم امضای الکترونیکی بیش از حد مجاز است.');
  return s;
}

function gatePlate(v, noVehicle = false) {
  if (noVehicle === true) {
    if (String(v || '').trim()) fail(400, 'در حالت بدون وسیله نباید پلاک ثبت شود.');
    return '';
  }
  const value = digitsToAscii(v).replace(/\s/g, '');
  if (!/^\d{2}[بپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]\d{3}-?\d{2}$/.test(value))
    fail(400, 'پلاک را کامل وارد کنید: دو رقم، حرف، سه رقم و کد دو رقمی استان؛ یا گزینه بدون وسیله را انتخاب کنید.');
  return value;
}
function settlementAmounts(subtotal, body = {}) {
  function amount(key, label) {
    const raw=digitsToAscii(body[key] ?? 0).replace(/[٬,]/g,'');
    if (!/^\d+$/.test(raw)) fail(400, label + ' باید مبلغ صحیح و غیرمنفی باشد.');
    return number(raw, {field:label,min:0,max:MAX_MONEY});
  }
  const discountAmount=amount('discountAmount','تخفیف');
  const additionsAmount=amount('additionsAmount','اضافات');
  const totalAmount=subtotal-discountAmount+additionsAmount;
  if (discountAmount>subtotal+additionsAmount || totalAmount<=0 || totalAmount>MAX_MONEY)
    fail(400, 'مبلغ نهایی پس از تخفیف و اضافات باید مثبت و در محدوده مجاز باشد.');
  return {subtotalAmount:subtotal,discountAmount,additionsAmount,totalAmount};
}
function driverPlate(v, vehicleType = '') {
  const raw = digitsToAscii(v).replace(/\s/g,'');
  if (/موتور/.test(vehicleType) && /^\d{3}-?\d{5}$/.test(raw)) return raw;
  return gatePlate(v);
}
function plate(v) {
  return text(digitsToAscii(v), { field: 'پلاک', max: 30 });
}

module.exports = { UNITS, MAX_QTY, MAX_MONEY, text, number, unit, phone, localDateTime, items, signature, plate, driverPlate, gatePlate, settlementAmounts, digitsToAscii };
