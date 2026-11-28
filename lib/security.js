'use strict';
const crypto = require('crypto');
const config = require('./config');

// ---------- رمز عبور (scrypt، سازگار با هش‌های نسخه قبلی) ----------
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, SCRYPT_OPTS).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  if (!/^[a-fA-F0-9]{128}$/.test(expected)) return false;
  const actual = crypto.scryptSync(String(password), salt, KEYLEN, SCRYPT_OPTS).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

// Login verification uses the worker pool so a password check never blocks HTTP.
let passwordChecks = 0;
async function verifyPasswordAsync(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-fA-F0-9]{128}$/.test(parts[2])) return false;
  if (passwordChecks >= 4) {
    const error = new Error('Password verification busy'); error.code = 'AUTH_BUSY'; throw error;
  }
  passwordChecks++;
  try {
    const actual = await new Promise((resolve, reject) => crypto.scrypt(String(password), parts[1], KEYLEN, SCRYPT_OPTS,
      (error, key) => error ? reject(error) : resolve(key)));
    return crypto.timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
  } finally { passwordChecks--; }
}

// حداقل ۸ کاراکتر، شامل حرف و عدد
function passwordPolicyError(password) {
  const p = String(password || '');
  if (p.length < 8) return 'رمز عبور باید حداقل ۸ کاراکتر باشد.';
  if (p.length > 128) return 'رمز عبور بیش از حد طولانی است.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'رمز عبور باید هم حرف انگلیسی و هم عدد داشته باشد.';
  return null;
}

function randomPassword() {
  // ۱۶ کاراکتر با حرف و عدد و علامت
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(16);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out.slice(0, 12) + '#' + out.slice(12, 15);
}

// ---------- نشست‌ها ----------
const sessions = new Map(); // sid -> { userId, createdAt, lastSeen, ip }

function createSession(userId, ip, browserManaged = false) {
  const sid = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(sid, { userId, createdAt: now, lastSeen: now, ip: ip || '', browserManaged, browserSeen: now, tabs: new Map(), emptySince: null });
  return sid;
}
function getSession(sid) {
  const s = sessions.get(sid);
  if (!s) return null;
  const now = Date.now();
  if (expired(s, now)) {
    sessions.delete(sid);
    return null;
  }
  s.lastSeen = now;
  return s;
}
// A missing heartbeat does not prove a tab closed: browsers may suspend it.
// Only a confirmed last-tab leave starts the reload grace; crashes need a
// password-authenticated replacement at the next login.
const CLOSE_GRACE_MS = 8000;
function expired(s, now = Date.now()) {
  return s.browserManaged && s.emptySince != null && now - s.emptySince > CLOSE_GRACE_MS;
}
// A new authenticated login can claim an explicitly closed session immediately,
// without cutting short reloads unless someone actually logs in again.
function releaseClosedUserSessions(userId) {
  for (const [sid, s] of sessions) {
    if (s.userId === userId && s.browserManaged && s.emptySince != null && !s.tabs.size) sessions.delete(sid);
  }
}
function browserPing(sid, tabId) {
  const s = getSession(sid); if (!s) return false;
  s.browserManaged = true; s.browserSeen = Date.now(); s.emptySince = null; s.tabs.set(tabId, s.browserSeen); return true;
}
function browserLeave(sid, tabId) {
  const s = sessions.get(sid); if (!s || !s.browserManaged) return;
  const now=Date.now();
  if (expired(s,now)) { sessions.delete(sid); return; }
  // Duplicate or unknown leave messages must not start or extend the grace.
  if (s.tabs.delete(tabId) && !s.tabs.size) s.emptySince = now;
}
function sessionCookie(sid, session, encrypted = false) {
  // Session cookie: the browser controls its lifetime; explicit logout invalidates the server session.
  return `sid=${sid}; HttpOnly; SameSite=Strict; Path=/${config.COOKIE_SECURE || encrypted ? '; Secure' : ''}`;
}
function destroySession(sid) { sessions.delete(sid); }
function destroyAllSessions() { sessions.clear(); }
function destroyUserSessions(userId, exceptSid = null) {
  for (const [sid, s] of sessions) if (s.userId === userId && sid !== exceptSid) sessions.delete(sid);
}
function countUserSessions(userId) {
  pruneSessions();
  let n = 0;
  for (const s of sessions.values()) if (s.userId === userId) n++;
  return n;
}
function pruneSessions() {
  pruneLoginAttempts();
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (expired(s, now)) sessions.delete(sid);
  }
}

// ---------- محدودیت تلاش ورود ----------
const loginAttempts = new Map(); // key -> { count, windowStart, lockedUntil }

const loginTraffic = new Map();
const MAX_LOGIN_KEYS = 10000;
function pruneLoginAttempts(now = Date.now()) {
  for (const [key, rec] of loginAttempts) {
    if (now >= Math.max(rec.windowStart + config.LOGIN_WINDOW_MS, rec.lockedUntil)) loginAttempts.delete(key);
  }
  for (const [key, rec] of loginTraffic) if (now >= rec.until) loginTraffic.delete(key);
}
// Includes successful attempts and unknown usernames. Global and IP quotas are independent.
function reserveLoginAttempt(ip, now = Date.now()) {
  pruneLoginAttempts(now);
  const quotas = [['global', 300], ['ip:' + ip, 60]];
  for (const [key, max] of quotas) {
    const rec = loginTraffic.get(key);
    if (rec && rec.count >= max) return Math.max(1, rec.until - now);
  }
  for (const [key] of quotas) {
    if (!loginTraffic.has(key)) {
      if (loginTraffic.size >= MAX_LOGIN_KEYS) return 60000;
      loginTraffic.set(key, {count:0, until:now + 60000});
    }
    loginTraffic.get(key).count++;
  }
  return 0;
}

function loginKey(ip, username) { return `${ip}|${String(username || '').toLowerCase()}`; }

function loginLockedFor(ip, username) {
  const rec = loginAttempts.get(loginKey(ip, username));
  if (!rec || !rec.lockedUntil) return 0;
  const left = rec.lockedUntil - Date.now();
  if (left <= 0) { loginAttempts.delete(loginKey(ip, username)); return 0; }
  return left;
}
function recordLoginFailure(ip, username) {
  const key = loginKey(ip, username);
  const now = Date.now();
  let rec = loginAttempts.get(key);
  if (!rec || now - rec.windowStart > config.LOGIN_WINDOW_MS) rec = { count: 0, windowStart: now, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= config.LOGIN_MAX_ATTEMPTS) rec.lockedUntil = now + config.LOGIN_LOCK_MS;
  if (!loginAttempts.has(key) && loginAttempts.size >= MAX_LOGIN_KEYS) {
    pruneLoginAttempts(now);
    if (loginAttempts.size >= MAX_LOGIN_KEYS) loginAttempts.delete(loginAttempts.keys().next().value);
  }
  loginAttempts.set(key, rec);
}
function clearLoginFailures(ip, username) { loginAttempts.delete(loginKey(ip, username)); }

// ---------- Headers امنیتی ----------
function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

module.exports = {
  hashPassword, verifyPassword, verifyPasswordAsync, passwordPolicyError, randomPassword,
  createSession, getSession, sessionCookie, browserPing, browserLeave, destroySession, destroyAllSessions, destroyUserSessions, countUserSessions, releaseClosedUserSessions, pruneSessions,
  loginLockedFor, recordLoginFailure, clearLoginFailures, reserveLoginAttempt, pruneLoginAttempts,
  securityHeaders,
};
