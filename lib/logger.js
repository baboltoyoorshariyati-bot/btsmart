'use strict';
// لاگ ساختاریافته JSON؛ کلیدهای حساس قبل از نوشتن حذف می‌شوند
const SENSITIVE = /pass(word)?|token|signature|secret|cookie|fingerprint/i;

function redact(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((x) => redact(x, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  return out;
}

function write(level, service, message, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, service, message, ...redact(fields) });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

module.exports = {
  info: (service, message, fields) => write('info', service, message, fields),
  warn: (service, message, fields) => write('warn', service, message, fields),
  error: (service, message, fields) => write('error', service, message, fields),
};
