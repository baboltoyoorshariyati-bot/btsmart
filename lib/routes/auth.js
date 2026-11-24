'use strict';
const { route, fail } = require('../http');
const config = require('../config');
const sec = require('../security');
const store = require('../store');
const { publicUser } = require('../domain');
const validate = require('../validate');
const log = require('../logger');

// هش ساختگی برای جلوگیری از افشای وجود/عدم وجود نام کاربری از طریق زمان پاسخ
const DUMMY_HASH = sec.hashPassword('dummy-password-for-timing-only');

const clearCookie = (encrypted = false) => `sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.COOKIE_SECURE || encrypted ? '; Secure' : ''}`;

route('POST', '/api/login', { auth: false }, async (ctx) => {
  const username = validate.text(ctx.body.username, { field: 'نام کاربری', max: 80, required: true });
  const password = String(ctx.body.password || '');
  if (!password || password.length > 128) fail(400, 'رمز عبور نامعتبر است.');
  if (sec.reserveLoginAttempt(ctx.ip)) fail(429, 'تعداد درخواست ورود بیش از حد مجاز است؛ کمی بعد تلاش کنید.', 'LOGIN_RATE_LIMIT');

  const locked = sec.loginLockedFor(ctx.ip, username);
  if (locked > 0) {
    fail(429, `به دلیل تلاش‌های ناموفق متعدد، ورود برای ${Math.ceil(locked / 60000)} دقیقه مسدود است.`, 'LOGIN_LOCKED');
  }

  const db = store.get();
  const user = db.users.find((x) => x.username.toLowerCase() === username.toLowerCase() && x.isActive);
  const checkedHash = user ? user.passwordHash : DUMMY_HASH;
  let ok;
  try { ok = await sec.verifyPasswordAsync(password, checkedHash) && !!user; }
  catch (e) { if (e.code === 'AUTH_BUSY') fail(429, 'سامانه در حال بررسی ورودهاست؛ دوباره تلاش کنید.', 'AUTH_BUSY'); throw e; }
  // Password hashing yields: re-read user state before issuing any session.
  store.refresh();
  const current = user && store.activeUserById(user.id);
  if (ok && (!current || current.passwordHash !== checkedHash)) fail(401, 'اطلاعات حساب تغییر کرده است؛ دوباره وارد شوید.', 'BAD_CREDENTIALS');
  if (!ok) {
    sec.recordLoginFailure(ctx.ip, username);
    store.audit(null, 'LOGIN_FAILED', 'user', user?.id || null, { username }, ctx);
    store.save();
    log.warn('auth', 'login failed', { ip: ctx.ip, username });
    fail(401, 'نام کاربری یا رمز عبور نادرست است.', 'BAD_CREDENTIALS');
  }

  sec.clearLoginFailures(ctx.ip, username);
  const activeUser = current;
  if (String(activeUser.roleCode).toLowerCase()==='driver'&&!require('../legacy-driver-access').allowed(activeUser,store.get())) fail(403,'ورود راننده در گردش جدید حذف شده است؛ مشخصات راننده در ترابری مدیریت می‌شود.', 'DRIVER_LOGIN_RETIRED');
  sec.releaseClosedUserSessions(activeUser.id);
  if (sec.countUserSessions(activeUser.id)) {
    if (ctx.body.replaceSession !== true) fail(409, 'این حساب نشست فعالی دارد. برای ورود می‌توانید نشست قبلی را ببندید.', 'SESSION_ACTIVE');
    sec.destroyUserSessions(activeUser.id);
    store.audit(activeUser, 'LOGIN_REPLACED_SESSION', 'user', activeUser.id, {}, ctx);
  }
  const sid = sec.createSession(activeUser.id, ctx.ip, ctx.body.browserSession === true);
  store.audit(activeUser, 'LOGIN', 'user', activeUser.id, {}, ctx);
  store.save();
  return { status: 200, body: { user: publicUser(activeUser) }, headers: { 'Set-Cookie': sec.sessionCookie(sid, sec.getSession(sid), !!ctx.req.socket.encrypted) } };
});

route('GET', '/api/health', { auth: false }, () => {
  store.sql.get('SELECT 1 AS ok');
  return { body: { service: 'baboltoyoor', status: 'ok', release: require('node:fs').readFileSync(require('node:path').join(config.ROOT, 'RELEASE_VERSION.txt'), 'utf8').trim() } };
});

// v37.43.0 — ساعت و تاریخ سامانه از سرور خوانده می‌شود تا ساعت نادرست دستگاه کاربر
// باعث تداخل (مثلاً تشخیص اشتباه «امروز») نشود. پاسخ نباید کش شود.
route('GET', '/api/server-time', { auth: false }, async () => {
  const d = new Date();
  return {
    status: 200,
    body: { now: d.toISOString(), epochMs: d.getTime(), tzOffsetMinutes: -d.getTimezoneOffset() },
    headers: { 'Cache-Control': 'no-store' },
  };
});

route('POST', '/api/logout', { auth: false }, async (ctx) => {
  if (ctx.sid) sec.destroySession(ctx.sid);
  return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': clearCookie(!!ctx.req.socket.encrypted) } };
});

route('GET', '/api/me', {}, async (ctx) => ({ status: 200, body: { user: publicUser(ctx.user), features: { partialStoreOrders: process.env.BT_ENABLE_PARTIAL_STORE_ORDER!=='0' && require('../transport-planning').enabled(), experimentalTransport: require('../transport-planning').enabled(), pickupStaging: require('../pickup-feature').enabled() } } }));

function tabId(ctx) {
  const id = String(ctx.body.tabId || '');
  if (!/^[a-f0-9]{32}$/.test(id)) fail(400, 'شناسهٔ نشست مرورگر نامعتبر است.');
  return id;
}
route('POST', '/api/session/presence', {}, async ctx => {
  if (!sec.browserPing(ctx.sid, tabId(ctx))) fail(401, 'نشست پایان یافته است.', 'AUTH_REQUIRED');
  return { status: 200, body: { ok: true } };
});
route('POST', '/api/session/leave', {}, async ctx => {
  sec.browserLeave(ctx.sid, tabId(ctx));
  return { status: 200, body: { ok: true } };
});


route('POST', '/api/account/password', {}, async (ctx) => {
  const { user } = ctx;
  const current = String(ctx.body.currentPassword || '');
  const next = String(ctx.body.newPassword || '');
  if (!sec.verifyPassword(current, user.passwordHash)) fail(400, 'رمز عبور فعلی نادرست است.', 'BAD_CURRENT_PASSWORD');
  const policy = sec.passwordPolicyError(next);
  if (policy) fail(400, policy);
  if (next === current) fail(400, 'رمز جدید باید با رمز فعلی متفاوت باشد.');
  user.passwordHash = sec.hashPassword(next);
  user.mustChangePassword = false;
  user.passwordChangedAt = store.nowIso();
  sec.destroyUserSessions(user.id, ctx.sid); // سایر نشست‌های این کاربر باطل شوند
  store.audit(user, 'PASSWORD_CHANGED', 'user', user.id, { selfService: true }, ctx);
  store.save();
  return { status: 200, body: { ok: true, user: publicUser(user) } };
});
