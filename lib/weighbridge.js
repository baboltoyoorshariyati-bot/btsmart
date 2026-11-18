'use strict';
// منطق باسکول: تجزیه خط خروجی نمایشگر، نگهداری آخرین وزن زنده، و تصمیم ورود/خروج.
// فرمت خروجی PU 850 هنوز تایید نشده است؛ تجزیه‌گر پیش‌فرض عمومی است و با
// WEIGHBRIDGE_PARSE_REGEX قابل تنظیم است (بعد از دریافت نمونه خروجی واقعی دستگاه).
const config = require('./config');

const DEFAULT_RE = '([+-]?\\d+(?:[.,]\\d+)?)\\s*(kg|KG|Kg|g|G|t)?';

// آخرین وزن زنده (در حافظه؛ توسط عامل سریال یا شبیه‌ساز به‌روز می‌شود)
const live = { weight: null, unit: 'kg', stable: false, raw: '', updatedAt: 0, source: '' };

function toKg(value, unit) {
  const u = String(unit || 'kg').toLowerCase();
  if (u === 'g') return value / 1000;
  if (u === 't') return value * 1000;
  return value;
}

// خط خام دستگاه را به {weight(kg), stable} تبدیل می‌کند؛ اگر نشد null
function parseIndicatorLine(line) {
  const s = String(line || '').trim();
  if (!s) return null;
  const re = new RegExp(config.WEIGHBRIDGE_PARSE_REGEX || DEFAULT_RE);
  const m = s.match(re);
  if (!m) return null;
  const raw = Number(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(raw)) return null;
  const weight = toKg(raw, m[2] || 'kg');
  // علامت‌های رایج پایداری: ST (پایدار) / US یا UN (ناپایدار)
  const stable = !/\b(US|UN|MOTION)\b/i.test(s);
  return { weight: Math.round(weight * 1000) / 1000, stable };
}

function setLive({ weight, unit = 'kg', stable = false, raw = '', source = '' }) {
  const kg = toKg(Number(weight), unit);
  if (!Number.isFinite(kg) || kg < 0 || kg > 200000) throw new Error('وزن خارج از محدوده مجاز است.');
  Object.assign(live, { weight: Math.round(kg * 1000) / 1000, unit: 'kg', stable: !!stable, raw: String(raw).slice(0, 120), updatedAt: Date.now(), source: String(source).slice(0, 40) });
  return liveSnapshot();
}

function liveSnapshot() {
  const age = live.updatedAt ? Date.now() - live.updatedAt : Infinity;
  return { weight: live.weight, stable: live.stable, fresh: age <= 10000, ageMs: Number.isFinite(age) ? age : null, source: live.source, updatedAt: live.updatedAt ? new Date(live.updatedAt).toISOString() : null };
}

function settings() {
  return {
    minStableKg: Number(config.WEIGHBRIDGE_MIN_STABLE_KG) || 20,
    minDiffKg: Number(config.WEIGHBRIDGE_MIN_DIFF_KG) || 20,
  };
}

// دو وزن یک وسیله: سنگین‌تر «بار» و سبک‌تر «خالی»، خالص = اختلاف آن‌ها
function netFromTwo(w1, w2, s = settings()) {
  const diff = Math.abs(w1 - w2);
  if (diff < s.minDiffKg) throw new Error(`اختلاف دو وزن کمتر از ${s.minDiffKg} کیلوگرم است؛ وسیله را دوباره وزن کنید.`);
  const loaded = Math.max(w1, w2), empty = Math.min(w1, w2);
  return { loadedKg: loaded, emptyKg: empty, netKg: Math.round((loaded - empty) * 1000) / 1000 };
}

module.exports = { parseIndicatorLine, setLive, liveSnapshot, settings, netFromTwo, live, DEFAULT_RE };
