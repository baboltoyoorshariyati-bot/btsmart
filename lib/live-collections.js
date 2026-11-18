'use strict';
// فاز ۳ — نوشت افزایشی (write-through) روی SQLite.
//
// مسیرهای قدیمی برنامه آبجکت زندهٔ حافظه را تغییر میدهند (Object.assign، push،
// splice، ...) و آخر کار store.save() صدا میزنند. این لایه همان تغییرات را، در
// همان لحظه، به یک دستور preparedStatement سطح ردیف (INSERT ... ON CONFLICT
// DO UPDATE / DELETE) تبدیل میکند. بنابراین منبع حقیقت SQL است و هیچ نوشتی
// منتظر ذخیرهسازی کل دیتابیس نمیماند.
//
// store.save() همچنان وجود دارد ولی اکنون فقط یک همگامسازی افزایشی است: ردیفهای
// تغییرکرده را با SQL مقایسه میکند و در حالت عادی هیچ نوشت اضافهای انجام نمیدهد.

const sql = require('./sqlite-store');

const RAW = Symbol('baboltoyoor.raw');
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
const INDEX = /^(0|[1-9]\d*)$/;
const PROXIES = new WeakMap();

function unwrap(value) {
  if (!value || typeof value !== 'object') return value;
  try { return value[RAW] || value; } catch { return value; }
}

// پراکسی عمیق برای یک رکورد: تغییر هر فیلد — حتی فیلدهای تودرتو — همان ردیف را
// در SQL بهروز میکند. فقط همان ردیف، نه کل جدول.
function deepProxy(root, notify) {
  const cache = new WeakMap();
  function wrap(value) {
    if (value === null || typeof value !== 'object') return value;
    if (cache.has(value)) return cache.get(value);
    const proxy = new Proxy(value, {
      get(target, prop, receiver) {
        if (prop === RAW) return target;
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        const v = Reflect.get(target, prop, receiver);
        if (typeof v === 'function') {
          if (Array.isArray(target) && MUTATORS.has(prop)) {
            return (...args) => { const out = Reflect.apply(v, target, args); notify(); return out; };
          }
          return v.bind(target);
        }
        if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(target, prop)) return wrap(v);
        return v;
      },
      set(target, prop, val) {
        const ok = Reflect.set(target, prop, unwrap(val));
        notify();
        return ok;
      },
      deleteProperty(target, prop) {
        const ok = Reflect.deleteProperty(target, prop);
        notify();
        return ok;
      },
    });
    cache.set(value, proxy);
    return proxy;
  }
  return wrap(root);
}

function liveRecord(key, value) {
  if (!value || typeof value !== 'object') return value;
  const raw = unwrap(value);
  if (PROXIES.has(raw)) return PROXIES.get(raw);
  const proxy = deepProxy(raw, () => sql.put(key, raw, true));
  PROXIES.set(raw, proxy);
  return proxy;
}

function liveArray(key, array) {
  const spec = sql.specFor(key);
  for (let i = 0; i < array.length; i++) array[i] = liveRecord(key, array[i]);
  return new Proxy(array, {
    get(target, prop, receiver) {
      if (prop === RAW) return target;
      if (prop === 'push' || prop === 'unshift') {
        return (...items) => {
          const wrapped = items.map((item) => liveRecord(key, item));
          const n = Reflect.apply(Array.prototype[prop], target, wrapped);
          for (const item of wrapped) sql.put(key, unwrap(item), true);
          return n;
        };
      }
      if (prop === 'splice') {
        return (start, deleteCount, ...items) => {
          const wrapped = items.map((item) => liveRecord(key, item));
          const removed = Reflect.apply(Array.prototype.splice, target, [start, deleteCount, ...wrapped]);
          for (const item of removed) sql.del(key, spec.id(unwrap(item)), true);
          for (const item of wrapped) sql.put(key, unwrap(item), true);
          return removed;
        };
      }
      if (prop === 'pop' || prop === 'shift') {
        return () => {
          const removed = Reflect.apply(Array.prototype[prop], target, []);
          if (removed) sql.del(key, spec.id(unwrap(removed)), true);
          return removed;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (prop === 'length') {
        const cut = Number(value);
        const removed = cut < target.length ? target.slice(cut) : [];
        const ok = Reflect.set(target, 'length', value);
        for (const row of removed) sql.del(key, spec.id(unwrap(row)), true);
        return ok;
      }
      if (typeof prop === 'string' && INDEX.test(prop)) {
        const previous = target[prop];
        const wrapped = liveRecord(key, value);
        const ok = Reflect.set(target, prop, wrapped);
        if (previous && spec.id(unwrap(previous)) !== spec.id(unwrap(wrapped))) {
          sql.del(key, spec.id(unwrap(previous)), true);
        }
        sql.put(key, unwrap(wrapped), true);
        return ok;
      }
      return Reflect.set(target, prop, value);
    },
    deleteProperty(target, prop) {
      const previous = target[prop];
      const ok = Reflect.deleteProperty(target, prop);
      if (typeof prop === 'string' && INDEX.test(prop) && previous) sql.del(key, spec.id(unwrap(previous)), true);
      return ok;
    },
  });
}

function liveKeyValue(object, write, remove) {
  return new Proxy(object, {
    get(target, prop, receiver) {
      if (prop === RAW) return target;
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
      const v = Reflect.get(target, prop, receiver);
      if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(target, prop)) {
        return deepProxy(v, () => write(prop, target[prop]));
      }
      return v;
    },
    set(target, prop, value) {
      const ok = Reflect.set(target, prop, unwrap(value));
      if (typeof prop === 'string') write(prop, value);
      return ok;
    },
    deleteProperty(target, prop) {
      const ok = Reflect.deleteProperty(target, prop);
      if (typeof prop === 'string') remove(prop);
      return ok;
    },
  });
}

function diffCollection(key, previous, next) {
  const spec = sql.specFor(key);
  const ids = new Set(next.map((r) => String(spec.id(unwrap(r)))));
  for (const row of previous || []) {
    const id = String(spec.id(unwrap(row)));
    if (!ids.has(id)) sql.del(key, id, true);
  }
  for (const row of next) {
    const raw = unwrap(row);
    const id = String(spec.id(raw));
    const current = sql.get(`SELECT payload FROM ${spec.table} WHERE id = ?`, [id]);
    const payload = JSON.stringify(raw);
    if (!current || current.payload !== payload) sql.put(key, raw, true);
  }
}

function wrapValue(key, value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value) && sql.specForSafe(key)) return liveArray(key, value);
  if (key === 'meta' || key === 'counters') return value;
  const raw = unwrap(value);
  return deepProxy(raw, () => sql.putSetting(key, raw));
}

// نقطهٔ ورود: یک db معمولی (بارگذاریشده از SQLite) را به db زنده تبدیل میکند.
function attach(db) {
  const target = {};
  for (const [key, value] of Object.entries(db)) {
    if (Array.isArray(value) && sql.specForSafe(key)) target[key] = liveArray(key, value);
    else if (key === 'meta') target[key] = liveKeyValue(value, sql.putMeta, sql.delMeta);
    else if (key === 'counters') target[key] = liveKeyValue(value, sql.putCounter, sql.delCounter);
    else target[key] = wrapValue(key, value);
  }

  // نوشت مستقیم Repositoryها (repos.customers.insert(...)) نباید توسط save() حذف شود؛
  // بنابراین نمای درون حافظه هم با همان ردیف هماهنگ میشود.
  const indexOf = (key, id) => {
    const arr = target[key];
    if (!Array.isArray(arr)) return -1;
    const spec = sql.specFor(key);
    return arr.findIndex((x) => String(spec.id(unwrap(x))) === String(id));
  };
  sql.setLiveHook({
    put(key, record) {
      const raw = unwrap(record);
      const arr = target[key];
      if (!Array.isArray(arr) || !raw) return;
      const i = indexOf(key, sql.specFor(key).id(raw));
      if (i >= 0) arr[i] = raw; else arr.push(raw);
    },
    remove(key, id) {
      const i = indexOf(key, id);
      if (i >= 0) target[key].splice(i, 1);
    },
  });

  return new Proxy(target, {
    get(obj, prop, receiver) { return Reflect.get(obj, prop, receiver); },
    set(obj, prop, value) {
      if (typeof prop !== 'string') return Reflect.set(obj, prop, value);
      const previous = obj[prop];
      if (Array.isArray(value) && sql.specForSafe(prop)) {
        diffCollection(prop, previous, value);
        obj[prop] = liveArray(prop, value);
      } else if (prop === 'meta') {
        obj[prop] = liveKeyValue(value, sql.putMeta, sql.delMeta);
        for (const [k, v] of Object.entries(value)) sql.putMeta(k, v);
      } else if (prop === 'counters') {
        obj[prop] = liveKeyValue(value, sql.putCounter, sql.delCounter);
        for (const [k, v] of Object.entries(value)) sql.putCounter(k, v);
      } else if (value === undefined) {
        sql.delSetting(prop);
        delete obj[prop];
      } else {
        obj[prop] = wrapValue(prop, value);
        sql.putSetting(prop, unwrap(value));
      }
      return true;
    },
    deleteProperty(obj, prop) {
      if (typeof prop === 'string' && sql.specForSafe(prop)) {
        const spec = sql.specFor(prop);
        for (const row of obj[prop] || []) sql.del(prop, spec.id(unwrap(row)), true);
      } else if (typeof prop === 'string') sql.delSetting(prop);
      return Reflect.deleteProperty(obj, prop);
    },
  });
}

module.exports = { attach, deepProxy, RAW };
