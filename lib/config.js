'use strict';
const path = require('path');

// Explicit opt-in keeps existing installations' day boundaries unchanged.
if (process.env.BT_TIME_ZONE) {
  new Intl.DateTimeFormat('en', {timeZone:process.env.BT_TIME_ZONE}).format();
  process.env.TZ = process.env.BT_TIME_ZONE;
}
const ROOT = path.join(__dirname, '..');
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

module.exports = {
  // باسکول (PU 850): توکن عامل سریال، حدها و الگوی تجزیه خط نمایشگر
  WEIGHBRIDGE_TOKEN: process.env.WEIGHBRIDGE_TOKEN || '',
  WEIGHBRIDGE_SIMULATOR: process.env.WEIGHBRIDGE_SIMULATOR === 'true',
  WEIGHBRIDGE_MIN_STABLE_KG: num(process.env.WEIGHBRIDGE_MIN_STABLE_KG, 20),
  WEIGHBRIDGE_MIN_DIFF_KG: num(process.env.WEIGHBRIDGE_MIN_DIFF_KG, 20),
  WEIGHBRIDGE_PARSE_REGEX: process.env.WEIGHBRIDGE_PARSE_REGEX || '',
  // شماره باسکول که روی فیش چاپ می‌شود
  WEIGHBRIDGE_SCALE_NO: process.env.WEIGHBRIDGE_SCALE_NO || '1',
  ROOT,
  TLS_FIREWALL_MANAGED_EXTERNALLY: process.env.TLS_FIREWALL_MANAGED_EXTERNALLY === 'true',
  PUBLIC_DIR: path.join(ROOT, 'public'),
  ASSETS_DIR: path.join(ROOT, 'assets'),
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT, 'data'),
  // مسیر فایل SQLite؛ پیشفرض DATA_DIR/baboltoyoor.db (قابل override با env/.env)
  SQLITE_FILE: process.env.SQLITE_FILE || '',
  APP_ENV: process.env.APP_ENV || 'development',
  PORT: num(process.env.PORT, 3080),
  HOST: process.env.HOST || '0.0.0.0',
  // در پشت HTTPS (Nginx با TLS داخلی) مقدار true شود تا کوکی فقط روی HTTPS ارسال شود
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  // فقط وقتی Nginx جلوی سامانه است true شود تا X-Forwarded-For معتبر باشد
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  SESSION_IDLE_MS: num(process.env.SESSION_IDLE_MINUTES, 30) * 60 * 1000,
  SESSION_MAX_MS: num(process.env.SESSION_MAX_HOURS, 12) * 60 * 60 * 1000,
  LOGIN_MAX_ATTEMPTS: num(process.env.LOGIN_MAX_ATTEMPTS, 5),
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_LOCK_MS: 15 * 60 * 1000,
  BODY_LIMIT_BYTES: num(process.env.BODY_LIMIT_BYTES, 3 * 1024 * 1024),
  IDEMPOTENCY_TTL_MS: 24 * 60 * 60 * 1000,
  // رمز اولیه مدیر؛ اگر تنظیم نشود، هنگام نخستین اجرا تصادفی ساخته و یک‌بار در کنسول چاپ می‌شود
  ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || '',
};
