'use strict';
// تنظیمات چاپ فیش باسکول: اندازه کاغذ، حاشیه، قلم، عرض ستون‌ها، ارتفاع ردیف‌ها و محل هر فیلد.
// مقادیر ورودی از کاربر همیشه اعتبارسنجی می‌شوند؛ هر چیز نامعتبر خطای ۴۰۰ می‌دهد.

const PAPERS = ['A5L', 'A5P', 'A4L', 'A4P'];
const COLS = 6; // A..F
const ROWS = 7; // ردیف‌های شبکه‌ی فیش

// کلیدهای ثابت فیلدها؛ برچسب و محل قابل تغییرند
const FIELD_DEFAULTS = [
  { key: 'scale', label: 'شماره باسکول', col: 5, row: 2 },
  { key: 'entryTime', label: 'ساعت ورود', col: 2, row: 4 },
  { key: 'date', label: 'تاریخ', col: 3, row: 4 },
  { key: 'plate', label: 'پلاک', col: 4, row: 4 },
  { key: 'loaded', label: 'وزن پر', col: 5, row: 4 },
  { key: 'exitTime', label: 'ساعت خروج', col: 2, row: 5 },
  { key: 'empty', label: 'وزن خالی', col: 5, row: 5 },
  { key: 'driver', label: 'نام راننده', col: 2, row: 6 },
  { key: 'net', label: 'وزن خالص', col: 5, row: 6 },
  { key: 'customer', label: 'نام مشتری یا طرف حساب', col: 3, row: 7 },
];

function defaults() {
  return {
    title: 'فیش باسکول — بابل طیور',
    paper: 'A5L',
    marginMm: 8,
    fontPt: 9,
    colsMm: [38, 38, 38, 38, 38, 38],
    rowsMm: [5, 5, 5, 14, 14, 14, 14],
    fields: FIELD_DEFAULTS.map((f) => ({ ...f, show: true })),
  };
}

function bad(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function num(v, min, max, field) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n) || n < min || n > max) {
    throw bad(`${field} باید بین ${min} و ${max} باشد.`);
  }
  return n;
}

function str(v, max, field, required = false) {
  const s = String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (required && !s) throw bad(`${field} را وارد کنید.`);
  if (s.length > max) throw bad(`${field} بیش از ${max} کاراکتر است.`);
  return s;
}

// ورودی را به یک تنظیم کامل و معتبر تبدیل می‌کند؛ هر کلید نامعتبر خطا می‌دهد.
function normalize(input) {
  const src = input && typeof input === 'object' ? input : {};
  const base = defaults();
  const out = {
    title: str(src.title ?? base.title, 80, 'عنوان فیش', true),
    paper: (src.paper ?? base.paper) && PAPERS.includes(src.paper ?? base.paper) ? (src.paper ?? base.paper) : (() => { throw bad('اندازه کاغذ معتبر نیست.'); })(),
    marginMm: num(src.marginMm ?? base.marginMm, 0, 25, 'حاشیه'),
    fontPt: num(src.fontPt ?? base.fontPt, 6, 16, 'اندازه قلم'),
    colsMm: [],
    rowsMm: [],
    fields: [],
  };
  const cols = Array.isArray(src.colsMm) ? src.colsMm : base.colsMm;
  const rows = Array.isArray(src.rowsMm) ? src.rowsMm : base.rowsMm;
  if (cols.length !== COLS) throw bad(`باید عرض ${COLS} ستون مشخص شود.`);
  if (rows.length !== ROWS) throw bad(`باید ارتفاع ${ROWS} ردیف مشخص شود.`);
  out.colsMm = cols.map((v, i) => num(v, 10, 120, `عرض ستون ${i + 1}`));
  out.rowsMm = rows.map((v, i) => num(v, 3, 40, `ارتفاع ردیف ${i + 1}`));

  const byKey = new Map((Array.isArray(src.fields) ? src.fields : []).map((f) => [f && f.key, f]));
  const taken = new Map();
  for (const def of FIELD_DEFAULTS) {
    const f = byKey.get(def.key) || {};
    const field = {
      key: def.key,
      label: str(f.label ?? def.label, 40, `برچسب «${def.label}»`, true),
      col: Math.round(num(f.col ?? def.col, 1, COLS, `ستون «${def.label}»`)),
      row: Math.round(num(f.row ?? def.row, 1, ROWS, `ردیف «${def.label}»`)),
      show: f.show === undefined ? true : f.show === true || f.show === 'true',
    };
    if (field.show) {
      const cellKey = `${field.col}-${field.row}`;
      if (taken.has(cellKey)) throw bad(`«${field.label}» و «${taken.get(cellKey)}» در یک خانه قرار دارند.`);
      taken.set(cellKey, field.label);
    }
    out.fields.push(field);
  }
  return out;
}

module.exports = { normalize, defaults, PAPERS, COLS, ROWS, FIELD_DEFAULTS };
