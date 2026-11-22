'use strict';
// موتور گزارش‌گیری پیشرفته: هر منبع داده ستون‌های خودش را دارد؛ کاربر ستون‌ها و فیلترهای دلخواه را انتخاب می‌کند.
const validate = require('./validate');
const { today, localDayOf } = require('./domain');

const MAX_ROWS = 5000;
const OPS = ['contains', 'equals', 'gte', 'lte'];

// فاز ۲: joinهای گزارشها مستقیماً با prepared statement روی SQL انجام میشوند.
// اگر اتصال SQL باز نباشد (تستهای واحد با شیء ساده)، از همان شیء ورودی خوانده میشود.
const repo = require('./sql-repos');
const sqlLookup = (fn, fallback) => (db, ...args) => {
  if (repo.isReady()) {
    const found = fn(...args);
    if (found && (found.id || found.orderId || Object.keys(found).length)) return found;
  }
  return fallback(db, ...args);
};
const customerOf = sqlLookup(repo.lookups.customerOf, (db, id) => (db.customers || []).find((c) => c.id === id) || {});
const productOf = sqlLookup(repo.lookups.productOf, (db, id) => (db.products || []).find((p) => p.id === id) || {});
const orderOf = sqlLookup(repo.lookups.orderOf, (db, id) => (db.orders || []).find((o) => o.id === id) || {});
const paymentOf = sqlLookup(repo.lookups.paymentOf, (db, orderId) => (db.payments || []).find((p) => p.orderId === orderId) || {});
const visitCount = (db, cid) => repo.isReady()
  ? repo.lookups.visitCount(cid)
  : (db.visits || []).filter((v) => v.customerId === cid).length;
const orderCount = (db, cid) => repo.isReady()
  ? repo.lookups.orderCount(cid)
  : (db.orders || []).filter((o) => o.customerId === cid).length;

// منابع گزارش: columns = ستون‌های قابل انتخاب، build = ردیف‌های کامل
const SOURCES = {
  visits: {
    label: 'مراجعه‌ها (ورود نگهبانی)', dateField: 'createdAt',
    columns: [
      ['createdAt', 'تاریخ و ساعت ورود'], ['status', 'وضعیت'], ['district', 'محله'], ['purpose', 'هدف مراجعه'],
      ['customerCode', 'کد مشتری'], ['customerName', 'نام مشتری'], ['customerPhone', 'تلفن'], ['plate', 'پلاک'], ['vehicleType', 'نوع وسیله'],
    ],
    build: (db) => (db.visits || []).map((v) => {
      const c = customerOf(db, v.customerId);
      return { createdAt: v.createdAt || '', status: v.status || '', district: v.district || '', purpose: v.purpose || '',
        customerCode: c.code || '', customerName: c.name || '', customerPhone: c.phone || '', plate: c.plate || '', vehicleType: c.vehicleType || '' };
    }),
  },
  orders: {
    label: 'سفارش‌ها', dateField: 'createdAt',
    columns: [
      ['createdAt', 'تاریخ ثبت'], ['orderNo', 'شماره سفارش'], ['orderType', 'نوع سفارش'], ['status', 'وضعیت'],
      ['scheduledAt', 'زمان سفارش'], ['customerCode', 'کد مشتری'], ['customerName', 'نام مشتری'], ['customerPhone', 'تلفن'],
      ['storeName', 'فروشگاه'], ['itemCount', 'تعداد اقلام'], ['invoiceNumber', 'شماره فاکتور'], ['totalAmount', 'مبلغ فاکتور (ریال)'],
    ],
    build: (db) => (db.orders || []).map((o) => {
      const c = customerOf(db, o.customerId);
      const p = paymentOf(db, o.id);
      return { createdAt: o.createdAt || '', orderNo: o.orderNo || '', orderType: o.orderType || '', status: o.status || '',
        scheduledAt: o.scheduledAt || '', customerCode: c.code || '', customerName: c.name || '', customerPhone: c.phone || '',
        storeName: o.orderType === 'STORE' ? require('./store-name').storeDisplayName(o.storeName,o.branchNo) : (o.storeName || ''), itemCount: (db.orderItems || []).filter((i) => i.orderId === o.id).length,
        invoiceNumber: p.invoiceNumber || '', totalAmount: Number(p.totalAmount || 0) };
    }),
  },
  orderItems: {
    label: 'اقلام سفارش', dateField: 'createdAt',
    columns: [
      ['createdAt', 'تاریخ سفارش'], ['orderNo', 'شماره سفارش'], ['customerName', 'نام مشتری'], ['productName', 'کالا'],
      ['requestedQty', 'مقدار درخواستی'], ['unit', 'واحد'], ['itemStatus', 'وضعیت قلم'],
    ],
    build: (db) => (db.orderItems || []).map((i) => {
      const o = orderOf(db, i.orderId);
      const c = customerOf(db, o.customerId);
      const pr = productOf(db, i.productId);
      return { createdAt: o.createdAt || '', orderNo: o.orderNo || '', customerName: c.name || '',
        productName: i.productName || pr.name || '', requestedQty: Number(i.requestedQty || 0), unit: i.unit || pr.defaultUnit || '',
        itemStatus: i.itemStatus || '' };
    }),
  },
  customers: {
    label: 'مشتریان', dateField: 'createdAt',
    columns: [
      ['createdAt', 'تاریخ ثبت پرونده'], ['code', 'کد مشتری'], ['name', 'نام'], ['phone', 'تلفن'], ['phone2', 'تلفن دوم'],
      ['nationalId', 'کد ملی'], ['company', 'شرکت / واحد'], ['district', 'محله'], ['address', 'نشانی'], ['plate', 'پلاک'],
      ['vehicleType', 'نوع وسیله'], ['visitCount', 'تعداد مراجعه'], ['orderCount', 'تعداد سفارش'], ['lastVisitAt', 'آخرین مراجعه'],
    ],
    build: (db) => (db.customers || []).map((c) => ({
      createdAt: c.createdAt || '', code: c.code || '', name: c.name || '', phone: c.phone || '', phone2: c.phone2 || '',
      nationalId: c.nationalId || '', company: c.company || '', district: c.district || '', address: c.address || '',
      plate: c.plate || '', vehicleType: c.vehicleType || '', visitCount: visitCount(db, c.id), orderCount: orderCount(db, c.id),
      lastVisitAt: c.lastVisitAt || '',
    })),
  },
  payments: {
    label: 'فاکتورها و پرداخت‌ها', dateField: 'verifiedAt',
    columns: [
      ['verifiedAt', 'تاریخ تسویه'], ['invoiceNumber', 'شماره فاکتور'], ['orderNo', 'شماره سفارش'], ['customerCode', 'کد مشتری'],
      ['customerName', 'نام مشتری'], ['totalAmount', 'مبلغ (ریال)'],
    ],
    build: (db) => (db.payments || []).map((p) => {
      const o = orderOf(db, p.orderId);
      const c = customerOf(db, o.customerId || p.customerId);
      return { verifiedAt: p.verifiedAt || p.createdAt || '', invoiceNumber: p.invoiceNumber || '', orderNo: o.orderNo || '',
        customerCode: c.code || '', customerName: c.name || '', totalAmount: Number(p.totalAmount || 0) };
    }),
  },
  products: {
    label: 'محصولات و قیمت‌ها', dateField: null,
    columns: [['quickCode', 'کد سریع'], ['name', 'نام محصول'], ['defaultUnit', 'واحد'], ['isActive', 'فعال'], ['currentPrice', 'قیمت امروز (ریال)']],
    build: (db) => {
      const currentDay = today();
      const prices = require('./product-prices').effectivePrices(db.priceList,currentDay);
      return (db.products || []).map((p) => {
        const price = prices.get(p.id);
        return { quickCode: p.quickCode || '', name: p.name || '', defaultUnit: p.defaultUnit || '', isActive: p.isActive ? 'بله' : 'خیر',
          currentPrice: price ? Number(price.price) : '' };
      });
    },
  },
  drivers: {
    label: 'رانندگان', dateField: 'createdAt',
    columns: [['createdAt', 'تاریخ ثبت'], ['fullName', 'نام راننده'], ['plate', 'پلاک'], ['phone', 'تلفن'], ['notes', 'یادداشت'], ['isActive', 'فعال']],
    build: (db) => (db.drivers || []).map((d) => ({ createdAt: d.createdAt || '', fullName: d.fullName || '', plate: d.plate || '',
      phone: d.phone || '', notes: d.notes || '', isActive: d.isActive ? 'بله' : 'خیر' })),
  },
  users: {
    label: 'کاربران سامانه', dateField: 'createdAt',
    columns: [['createdAt', 'تاریخ ایجاد'], ['username', 'نام کاربری'], ['fullName', 'نام کامل'], ['position', 'سمت'], ['roleCode', 'نقش'],
      ['storeName', 'فروشگاه'], ['isActive', 'فعال']],
    build: (db) => (db.users || []).map((u) => ({ createdAt: u.createdAt || '', username: u.username || '', fullName: u.fullName || '',
      position: u.position || '', roleCode: u.roleCode || '', storeName: u.roleCode === 'store' ? require('./store-name').storeDisplayName(u.storeName,u.branchNo) : (u.storeName || ''), isActive: u.isActive ? 'بله' : 'خیر' })),
  },
  activity: {
    label: 'تاریخچه فعالیت‌ها', dateField: 'createdAt',
    columns: [['createdAt', 'زمان'], ['username', 'کاربر'], ['action', 'عملیات'], ['entityType', 'نوع موجودیت'], ['entityId', 'شناسه موجودیت'],
      ['ip', 'IP'], ['details', 'جزئیات']],
    build: (db) => (db.audit || []).map((a) => ({ createdAt: a.createdAt || '', username: a.username || '', action: a.action || '',
      entityType: a.entityType || '', entityId: a.entityId || '', ip: a.ip || '', details: JSON.stringify(a.details || {}) })),
  },
  deliveries: {
    label: 'ارسال‌ها و تحویل رانندگان', dateField: 'sentAt',
    columns: [['sentAt','زمان ارسال'], ['deliveredAt','زمان تحویل'], ['orderNo','شماره سفارش'], ['storeName','فروشگاه'], ['driverName','راننده'], ['driverPlate','پلاک'], ['status','وضعیت'], ['run','سرویس']],
    build: db => (db.orders || []).flatMap(o => [o.dispatch, ...(Array.isArray(o.dispatches) ? o.dispatches : [])]
      .filter(d => d && (!db.reportDriverId || d.driverId === db.reportDriverId))
      .map(d => ({ sentAt:d.sentAt || '', deliveredAt:d.deliveredAt || '', orderNo:o.orderNo || '', storeName:o.orderType === 'STORE' ? require('./store-name').storeDisplayName(o.storeName,o.branchNo) : (o.storeName || ''), driverName:d.driverName || '', driverPlate:d.driverPlate || '', status:d.status || '', run:d.run || '' }))),
  },
  driverRecords: {
    label: 'سوابق رانندگان (تحویل، مرجوعی، کسری)', dateField: 'day',
    columns: [['day', 'تاریخ تحویل'], ['deliveredAt', 'زمان تحویل'], ['orderNo', 'شماره سفارش'], ['customerName', 'مشتری'],
      ['customerPhone', 'تلفن مشتری'], ['driverName', 'راننده'], ['driverPlate', 'پلاک خودرو'], ['productName', 'کالا'],
      ['deliveredKg', 'وزن تحویلی (کیلو)'], ['returnKg', 'مرجوعی (کیلو)'], ['shortageKg', 'کسری وزن (کیلو)'], ['netKg', 'خالص (کیلو)'],
      ['settlementType', 'نوع تسویه'], ['reason', 'علت مرجوعی/کسری'], ['deliveredBy', 'ثبت‌کننده'], ['status', 'وضعیت سفارش']],
    build: (db) => {
      const pad = (n) => String(n).padStart(2, '0');
      const dayOf = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
      const rows = [];
      for (const o of db.orders || []) {
        const d = o.dispatch;
        if (!d || !['DELIVERED', 'SALES_FINALIZED', 'CLOSED'].includes(d.status) || !d.deliveredAt) continue;
        const common = {
          day: dayOf(d.deliveredAt), deliveredAt: d.deliveredAt, orderNo: o.orderNo || o.id.slice(0, 8),
          customerName: o.orderType === 'STORE' ? require('./store-name').storeDisplayName(o.storeName,o.branchNo) : (o.customer?.name || o.storeName || ''), customerPhone: o.orderType === 'STORE' ? '' : (o.customer?.phone || ''),
          driverName: d.driverName || '', driverPlate: d.driverPlate || '', settlementType: d.settlementType === 'CASH' ? 'نقدی' : 'معوق',
          deliveredBy: d.deliveredBy || '', status: d.status === 'SALES_FINALIZED' ? 'تأیید نهایی فروش' : d.status === 'CLOSED' ? 'بسته شده (نسخهٔ قدیمی)' : 'منتظر تأیید نهایی فروش',
        };
        for (const l of d.lines || []) {
          rows.push({ ...common, productName: l.productName || '', deliveredKg: Number(l.deliveredKg || 0), returnKg: Number(l.returnKg || 0),
            shortageKg: Number(l.shortageKg || 0), netKg: Number(l.netKg || 0), reason: l.reason || '' });
        }
      }
      return rows;
    },
  },
};

const digits = (v) => validate.digitsToAscii(String(v ?? '')).toLowerCase().trim();

function matches(row, f) {
  const v = row[f.field];
  if (f.op === 'contains') return digits(v).includes(digits(f.value));
  if (f.op === 'equals') return digits(v) === digits(f.value);
  if (f.op === 'gte') return typeof v === 'number' ? v >= Number(f.value) : String(v || '') >= digits(f.value);
  if (f.op === 'lte') return typeof v === 'number' ? v <= Number(f.value) : String(v || '') <= digits(f.value);
  return true;
}

// از روی کلید منبع، فهرست ستون‌ها را برمی‌گرداند
function describe() {
  return Object.entries(SOURCES).map(([key, s]) => ({
    key, label: s.label, dateField: s.dateField, columns: s.columns.map(([k, l]) => ({ key: k, label: l })),
  }));
}

function query(db, q = {}, { limit = MAX_ROWS } = {}) {
  const src = Object.prototype.hasOwnProperty.call(SOURCES,q.source) ? SOURCES[q.source] : null;
  if (!src) throw Object.assign(new Error('منبع گزارش معتبر نیست.'), { status: 400 });
  const validKeys = new Set(src.columns.map(([k]) => k));
  const fields = (Array.isArray(q.fields) && q.fields.length ? q.fields : src.columns.map(([k]) => k))
    .filter((k) => validKeys.has(k));
  if (!fields.length) throw Object.assign(new Error('حداقل یک ستون انتخاب کنید.'), { status: 400 });
  const filters = (Array.isArray(q.filters) ? q.filters : [])
    .filter((f) => f && validKeys.has(f.field) && OPS.includes(f.op) && String(f.value ?? '').trim() !== '')
    .map((f) => ({ field: f.field, op: f.op, value: String(f.value).slice(0, 120) }));
  const from = digits(q.from).slice(0, 10);
  const to = digits(q.to).slice(0, 10);

  const sqlRows = require('./sql-report-rows');
  let rows = sqlRows.supported(q.source) && sqlRows.canonical(db) ? sqlRows.build(q.source) : src.build(db);
  if (src.dateField && from) rows = rows.filter((r) => localDayOf(r[src.dateField]) >= from);
  if (src.dateField && to) rows = rows.filter((r) => localDayOf(r[src.dateField]) <= to);
  for (const f of filters) rows = rows.filter((r) => matches(r, f));
  if (src.dateField) rows.sort((a, b) => String(b[src.dateField] || '').localeCompare(String(a[src.dateField] || '')));
  const total = rows.length;
  const out = rows.slice(0, limit).map((r) => Object.fromEntries(fields.map((k) => [k, r[k]])));
  const columns = fields.map((k) => ({ key: k, label: src.columns.find(([x]) => x === k)[1] }));
  return { source: q.source, label: src.label, columns, rows: out, total, truncated: total > limit };
}

module.exports = { SOURCES, OPS, MAX_ROWS, describe, query };
