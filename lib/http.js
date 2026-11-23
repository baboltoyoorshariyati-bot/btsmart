'use strict';
// لایه HTTP: Router، احراز هویت، RBAC، CSRF (الزام Content-Type: application/json)،
// محدودیت حجم، Idempotency، پاسخ خطای یکدست و سرو فایل‌های استاتیک با Allowlist
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const log = require('./logger');
const sec = require('./security');
const store = require('./store');
const repo = require('./sql-repos');

class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || null; }
}
const fail = (status, message, code) => { throw new ApiError(status, message, code); };

// ---------- Router ----------
const routes = [];
function route(method, pattern, opts, handler) {
  const names = [];
  const source = pattern.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; });
  routes.push({ method, re: new RegExp(`^${source}/?$`), names, opts: { auth: true, ...opts }, handler, id: `${method} ${pattern}` });
}
// Opt in only synchronous database handlers. Never hold SQLite locks across awaits.
function atomicRoute(method, pattern, opts, handler) {
  route(method, pattern, { atomic: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method), ...opts }, handler);
}
function matchRoute(method, pathname) {
  let pathMatched = false;
  for (const r of routes) {
    const m = pathname.match(r.re);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return { route: null, pathMatched };
}

// ---------- کمک‌ها ----------
// Canonical JSON lets a retry reorder object keys without changing its meaning.
function canonicalBody(value, depth = 0) {
  if (depth > 100) fail(400, 'ساختار درخواست بیش از حد تو در تو است.');
  if (Array.isArray(value)) return value.map(v => canonicalBody(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = Object.create(null);
    for (const key of Object.keys(value).sort()) out[key] = canonicalBody(value[key], depth + 1);
    return out;
  }
  return value;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PASSWORD_CHANGE_ALLOWED = new Set(['GET /api/me', 'POST /api/logout', 'POST /api/account/password', 'POST /api/session/presence', 'POST /api/session/leave']);

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function clientIp(req) {
  // پشت Nginx داخلی، X-Forwarded-For معتبر است؛ در غیر این صورت آدرس سوکت
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (config.TRUST_PROXY && xff) || req.socket.remoteAddress || '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.toLowerCase().startsWith('application/json')) return reject(new ApiError(415, 'نوع داده ارسالی باید application/json باشد.'));
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > config.BODY_LIMIT_BYTES) return reject(new ApiError(413, 'حجم داده ارسالی بیش از حد مجاز است.'));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > config.BODY_LIMIT_BYTES) { reject(new ApiError(413, 'حجم داده ارسالی بیش از حد مجاز است.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject(new ApiError(400, 'داده ارسالی معتبر نیست.'));
        resolve(parsed);
      } catch { reject(new ApiError(400, 'داده ارسالی معتبر نیست.')); }
    });
    req.on('error', () => reject(new ApiError(400, 'خطا در دریافت داده.')));
  });
}

const LEGACY_ROLE = {
  gate_entry: 'gate', gate_exit: 'gate', sales_order: 'sales', sales_settlement: 'sales',
};
function normalizeRole(role) {
  const r = String(role ?? '').trim().toLowerCase();
  return LEGACY_ROLE[r] || r;
}
function requireRole(user, allowed) {
  const actual = normalizeRole(user.roleCode);
  if (actual === 'admin') return; // مدیر سیستم به همه کارتابل‌ها دسترسی دارد
  if (!allowed.map(normalizeRole).includes(actual)) fail(403, 'دسترسی برای این نقش مجاز نیست.', 'FORBIDDEN');
}

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, {
    ...sec.securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

// ---------- پردازش درخواست API ----------
async function handleApi(req, res, url) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  let user = null;
  let routeId = '';
  try {
    // فاز ۲: نمای دادهها مستقیماً از SQL زنده است (تغییرات ابزارهای خارجی هم دیده میشود).
    store.refresh();
    const { route: r, params, pathMatched } = matchRoute(req.method, url.pathname);
    if (!r) fail(pathMatched ? 405 : 404, pathMatched ? 'روش درخواست مجاز نیست.' : 'مسیر API پیدا نشد.');
    routeId = r.id;

    const cookies = parseCookies(req.headers.cookie);
    let session = null;
    if (r.opts.auth) {
      session = sec.getSession(cookies.sid);
      if (!session) fail(401, 'نیاز به ورود مجدد دارید.', 'AUTH_REQUIRED');
      user = store.activeUserById(session.userId);
      if (!user) { sec.destroySession(cookies.sid); fail(401, 'نیاز به ورود مجدد دارید.', 'AUTH_REQUIRED'); }
      if (normalizeRole(user.roleCode)==='driver'&&!require('./legacy-driver-access').allowed(user,store.get())) { sec.destroySession(cookies.sid); fail(403, 'کارتابل راننده پایان یافته است؛ برای پیگیری به واحد ترابری مراجعه کنید.', 'DRIVER_LOGIN_RETIRED'); }
      if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(r.id)) {
        fail(403, 'ابتدا باید رمز عبور خود را تغییر دهید.', 'PASSWORD_CHANGE_REQUIRED');
      }
    }
    if (r.opts.roles) requireRole(user, r.opts.roles);
    if (session) res.setHeader('Set-Cookie', sec.sessionCookie(cookies.sid, session, !!req.socket.encrypted));

    const ctx = { req, res, url, params, query: url.searchParams, ip, ua, userAgent: ua, requestId, user, session, sid: cookies.sid, body: {} };
    if (MUTATING.has(req.method) && !r.opts.streamBody) ctx.body = await readBody(req);
    // A restore may have invalidated this session while its request body was arriving.
    if (session && !sec.getSession(cookies.sid)) fail(401, 'نشست پایان یافته است؛ دوباره وارد شوید.', 'AUTH_REQUIRED');

    const idemKey = req.headers['idempotency-key'];
    let requestHash;
    if (r.opts.idempotent && idemKey) {
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(idemKey))) fail(400, 'کلید Idempotency نامعتبر است.');
      requestHash = crypto.createHash('sha256').update(JSON.stringify([url.pathname, url.search, canonicalBody(ctx.body)])).digest('hex');
      const hit = repo.repos.idempotency.select(
        'idem_key = ? AND user_id IS ? AND route = ?',
        [String(idemKey), user?.id || null, r.id], { limit: 1 })[0];
      if (hit) {
        if (!hit.requestHash || hit.requestHash !== requestHash) fail(409, 'این کلید قبلاً برای درخواست متفاوت یا قدیمی استفاده شده است؛ وضعیت سفارش را بررسی کنید.', 'IDEMPOTENCY_CONFLICT');
        return send(res, hit.status, hit.body, { 'Idempotent-Replayed': 'true' });
      }
    }

    const execute = () => {
      // Recheck after acquiring the write lock, including retries from other processes.
      if (r.opts.atomic && r.opts.idempotent && idemKey) {
        const hit = repo.repos.idempotency.select('idem_key = ? AND user_id IS ? AND route = ?',
          [String(idemKey), user?.id || null, r.id], { limit: 1 })[0];
        if (hit) {
          if (hit.requestHash !== requestHash) fail(409, 'کلید تکراری برای درخواست متفاوت است.', 'IDEMPOTENCY_CONFLICT');
          return { status: hit.status, body: hit.body, headers: { 'Idempotent-Replayed': 'true' } };
        }
      }
      // Body reception or lock acquisition may have outlived a permission change.
      if (session && r.opts.atomic) {
        ctx.user = store.activeUserById(session.userId);
        if (!ctx.user || !sec.getSession(cookies.sid)) fail(401, 'نشست پایان یافته است.', 'AUTH_REQUIRED');
        if (r.opts.roles) requireRole(ctx.user, r.opts.roles);
        if (ctx.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(r.id)) fail(403, 'ابتدا رمز عبور را تغییر دهید.', 'PASSWORD_CHANGE_REQUIRED');
      }
      const value = r.handler(ctx);
      if (r.opts.atomic) {
        if (value && typeof value.then === 'function') throw new Error('Atomic route must be synchronous');
        if (value?.stream && r.opts.idempotent) throw new Error('Idempotent atomic route cannot stream');
        if (r.opts.idempotent && idemKey && (value?.status || 200) < 400) {
          store.get().idempotency.push({ key: String(idemKey), userId: user?.id || null, route: r.id,
            requestHash, status: value?.status || 200, body: value?.body, createdAt: new Date().toISOString() });
          store.save();
        }
      }
      return value;
    };
    const result = r.opts.atomic ? require('./transport-transaction').request(execute) : await execute();
    const status = result?.status || 200;
    if (result?.stream) {
      res.writeHead(status, { ...sec.securityHeaders(), 'Cache-Control': 'no-store', ...result.headers });
      await result.stream(res);
      if (!res.destroyed) res.end();
      return;
    }
    if (!r.opts.atomic && r.opts.idempotent && idemKey && status < 500) {
      const db = store.get();
      db.idempotency.push({ key: String(idemKey), userId: user?.id || null, route: r.id, requestHash, status, body: result.body, createdAt: new Date().toISOString() });
      store.save();
    }
    if (MUTATING.has(req.method) && status >= 400) {
      log.warn('api', 'request rejected', { requestId, route: r.id, status, user: user?.username, ip });
    }
    return send(res, status, result?.body, result?.headers || {});
  } catch (e) {
    if (res.headersSent || res.destroyed) { if (!res.destroyed) res.destroy(); return; }
    if (e instanceof ApiError) {
      if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 404) {
        log.warn('api', e.message, { requestId, route: routeId, status: e.status, user: user?.username });
      }
      return send(res, e.status, { error: e.message, code: e.code || undefined, requestId });
    }
    log.error('api', 'unhandled error', { requestId, route: routeId, user: user?.username, error: e.message, stack: e.stack });
    return send(res, 500, { error: 'خطای داخلی سامانه. کد پیگیری را به واحد فنی اعلام کنید.', requestId });
  }
}

// ---------- فایل‌های استاتیک (Allowlist) ----------
const STATIC = {
  '/persian-print-digits.js': { file: 'persian-print-digits.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/print-ready.js': { file: 'print-ready.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/price-list-print-ready.js': { file: 'price-list-print-ready.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/print-frame.js': { file: 'print-frame.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/signature-pad.js': { file: 'signature-pad.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/connection-status.js': { file: 'connection-status.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/compatibility.css': { file: 'compatibility.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/fonts.css': { file: 'fonts.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/fonts/Vazirmatn-Variable.woff2': { file: 'fonts/Vazirmatn-Variable.woff2', type: 'font/woff2', dir: 'public' },
  '/': { file: 'index.html', type: 'text/html; charset=utf-8', dir: 'public' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8', dir: 'public' },
  '/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/design.css': { file: 'design.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/mobile.css': { file: 'mobile.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/theme.css': { file: 'theme.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/form-layout.css': { file: 'form-layout.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/invoice-print.html': { file: 'invoice-print.html', type: 'text/html; charset=utf-8', dir: 'public' },
  '/invoice-print.js': { file: 'invoice-print.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/store-service-print.html': { file: 'store-service-print.html', type: 'text/html; charset=utf-8', dir: 'public' },
  '/store-service-print.js': { file: 'store-service-print.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/store-document-group.js': { file: 'store-document-group.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/store-service-print.css': { file: 'store-service-print.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/invoice-compact.css': { file: 'invoice-compact.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/transport-resources.css': { file: 'transport-resources.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/responsive.css': { file: 'responsive.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/bt-table.css': { file: 'bt-table.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/transport-resources.js': { file: 'transport-resources.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/warehouse-document.css': { file: 'warehouse-document.css', type: 'text/css; charset=utf-8', dir: 'public' },
  '/ui2.js': { file: 'ui2.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/customers-ui.js': { file: 'customers-ui.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/vendor/exceljs-4.4.0.min.js': { file: 'vendor/exceljs-4.4.0.min.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/product-excel.js': { file: 'product-excel.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/admin-ui.js': { file: 'admin-ui.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/dispatch-ui.js': { file: 'dispatch-ui.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/ui-polish.js': { file: 'ui-polish.js', type: 'application/javascript; charset=utf-8', dir: 'public' },
  '/logo.png': { file: 'logo.png', type: 'image/png', dir: 'assets' },
  // v37.10.0 — پک رسمی لوگو: آیکن تب مرورگر، آیکن موبایل و نسخهٔ متنی (پس‌زمینهٔ تیره)
  '/favicon.ico': { file: 'favicon.ico', type: 'image/x-icon', dir: 'public' },
  '/favicon-16x16.png': { file: 'favicon-16x16.png', type: 'image/png', dir: 'public' },
  '/favicon-32x32.png': { file: 'favicon-32x32.png', type: 'image/png', dir: 'public' },
  '/apple-touch-icon.png': { file: 'apple-touch-icon.png', type: 'image/png', dir: 'public' },
  '/android-chrome-192x192.png': { file: 'android-chrome-192x192.png', type: 'image/png', dir: 'public' },
  '/android-chrome-512x512.png': { file: 'android-chrome-512x512.png', type: 'image/png', dir: 'public' },
  '/site.webmanifest': { file: 'site.webmanifest', type: 'application/manifest+json; charset=utf-8', dir: 'public' },
  '/logo-with-text.png': { file: 'logo-with-text.png', type: 'image/png', dir: 'public' },
};
function serveStatic(req, res, pathname) {
  const entry = STATIC[pathname];
  const headers = { ...sec.securityHeaders() };
  if (!entry || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(entry ? 405 : 404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(entry ? 'Method Not Allowed' : 'Not Found');
  }
  const base = entry.dir === 'public' ? config.PUBLIC_DIR : config.ASSETS_DIR;
  const file = path.join(base, entry.file);
  if (!file.startsWith(base + path.sep)) { res.writeHead(404); return res.end('Not Found'); }
  try {
    const data = fs.readFileSync(file);
    res.writeHead(200, { ...headers, 'Content-Type': entry.type, 'Cache-Control': entry.file.endsWith('.png') ? 'public, max-age=86400' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

function createHandler() {
  return (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end('Bad Request'); }
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
  };
}

module.exports = { route, atomicRoute, ApiError, fail, requireRole, normalizeRole, createHandler, parseCookies, clientIp, send };
