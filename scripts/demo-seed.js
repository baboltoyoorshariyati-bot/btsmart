#!/usr/bin/env node
'use strict';
/*
 * دادهٔ نمونهٔ فارسی برای «پیش‌نمایش» رابط کاربری.
 *
 *   BASE=http://127.0.0.1:3080 ADMIN_PASS='…' node scripts/demo-seed.js
 *
 * فقط از راه API عمومی خود سامانه کار می‌کند (هیچ نوشتن مستقیم در دیتابیس)،
 * پس همهٔ قواعد اعتبارسنجی و گردش‌کار رعایت می‌شود.
 *
 * متغیرهای محیطی:
 *   BASE        آدرس سامانه (پیش‌فرض http://127.0.0.1:3080)
 *   ADMIN_PASS  گذرواژهٔ فعلی مدیر (پیش‌فرض Admin!Babol1404)
 *   INIT_PASS   اگر مدیر هنوز گذرواژهٔ اولیه دارد، این را بدهید تا خودکار عوض شود
 *   DEMO_PASS   گذرواژهٔ کاربران نمونه (پیش‌فرض Demo!Babol1404)
 *
 * تکرارپذیر است: موارد تکراری (کد ۴۰۹/۴۰۰) نادیده گرفته می‌شوند.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3080';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin!Babol1404';
const DEMO_PASS = process.env.DEMO_PASS || 'Demo!Babol1404';
const INIT_PASS = process.env.INIT_PASS || '';

async function call(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* پاسخ بدون بدنه */ }
  const set = res.headers.get('set-cookie');
  return { status: res.status, json, cookie: set ? set.split(';')[0] : null };
}
async function login(username, password) {
  const r = await call('POST', '/api/login', { username, password });
  if (r.status !== 200) throw new Error(`ورود ${username} ناموفق: ${r.status} ${JSON.stringify(r.json || {})}`);
  return r.cookie;
}
const pad = (n) => String(n).padStart(2, '0');
const dateAt = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const log = (...a) => console.log(...a);

async function main() {
  // ۱) نشست مدیر (و در صورت لزوم تغییر گذرواژهٔ اولیه)
  let admin = null;
  try { admin = await login('admin', ADMIN_PASS); }
  catch (e) {
    if (!INIT_PASS) throw e;
    admin = await login('admin', INIT_PASS);
    const changed = await call('POST', '/api/account/password', { currentPassword: INIT_PASS, newPassword: ADMIN_PASS }, admin);
    log('تغییر گذرواژهٔ مدیر:', changed.status);
    const probe = await call('GET', '/api/workload', null, admin);
    if (probe.status === 401) admin = await login('admin', ADMIN_PASS); // نشست قدیمی باطل شد
  }

  // ۲) کاربران نقش‌ها
  const users = [
    ['sales1', 'مریم احمدی', 'فروش', 'sales'],
    ['wh1', 'رضا کریمی', 'انبار', 'warehouse'],
    ['gate1', 'حسین نوری', 'نگهبانی', 'gate']
  ];
  for (const [username, fullName, position, roleCode] of users) {
    const r = await call('POST', '/api/admin/users', { username, fullName, position, roleCode, password: DEMO_PASS, mustChangePassword: false }, admin);
    log(`کاربر ${username}:`, r.status === 201 ? 'ساخته شد' : `${r.status} ${r.json?.code || ''}`);
  }
  const gate = await login('gate1', DEMO_PASS);
  const sales = await login('sales1', DEMO_PASS);
  const warehouse = await login('wh1', DEMO_PASS);

  // ۳) مشتریان
  const customers = [
    ['حاج علی محمدی', '09111234001', '۱۲ب۳۴۵-۶۷', 'وانت'],
    ['فروشگاه ماهان', '09111234002', '۲۴ج۸۸۱-۱۲', 'خودرو'],
    ['رستوران بهار', '09111234003', '۳۳د۱۲۷-۴۵', 'موتورسیکلت'],
    ['مرغ‌فروشی سعید', '09111234004', '۵۱الف۴۴۲-۰۳', 'وانت'],
    ['سوپرمارکت ولیعصر', '09111234005', '۶۷ب۹۹۰-۲۱', 'خودرو'],
    ['مهدی رضایی', '09111234006', '۸۸ج۳۳۴-۵۶', 'وانت']
  ];
  let created = 0;
  for (const [name, phone, plate, vehicleType] of customers) {
    const r = await call('POST', '/api/customers', { name, phone, plate, vehicleType, district: 'بابل' }, gate);
    if (r.status === 201) created++;
  }
  log(`مشتری: ${created} تازه`);

  // ۴) مراجعه‌های نگهبانی + سفارش حضوری
  const visits = [
    ['حاج علی محمدی', '09111234001', '۱۲ب۳۴۵-۶۷', 'وانت', 'بابل'],
    ['فروشگاه ماهان', '09111234002', '۲۴ج۸۸۱-۱۲', 'خودرو', 'آمل'],
    ['رستوران بهار', '09111234003', '۳۳د۱۲۷-۴۵', 'موتورسیکلت', 'بابل'],
    ['مهدی رضایی', '09111234006', '۸۸ج۳۳۴-۵۶', 'وانت', 'قائم‌شهر']
  ];
  const itemsFor = (n) => ([
    { productId: 'p01', requestedQty: 12 + n, requestedUnit: 'کیلوگرم' },
    { productId: 'p03', requestedQty: 4, requestedUnit: 'کیلوگرم' }
  ]);
  const onsite = [];
  for (let i = 0; i < visits.length; i++) {
    const [name, phone, plate, vehicleType, district] = visits[i];
    const v = await call('POST', '/api/visits', { name, phone, plate, vehicleType, district }, gate);
    if (v.status !== 201) { log(`مراجعه ${name}:`, v.status); continue; }
    const o = await call('POST', '/api/orders', { visitId: v.json.visit.id, items: itemsFor(i), deliveryMode: 'PICKUP' }, sales);
    if (o.status === 201) onsite.push(o.json.order.id); else log(`سفارش حضوری ${name}:`, o.status);
  }
  log(`سفارش حضوری: ${onsite.length}`);

  // ۵) سفارش تلفنی — سه‌تای امروز با ساعت گذشته (وارد صف فعال) و بقیه روزهای بعد
  const remoteToday = [
    ['مرغ‌فروشی سعید', '09121234021', '05:30', 'بابل'],
    ['سوپرمارکت ولیعصر', '09121234022', '06:15', 'آمل'],
    ['قصابی برادران', '09121234023', '06:45', 'قائم‌شهر']
  ];
  const remoteFuture = [
    ['کبابی گلستان', '09121234011', 0, '10:30', 'بابل'],
    ['پروتئین آمل', '09121234012', 1, '08:00', 'آمل'],
    ['سفارش سه‌روز بعد', '09121234015', 3, '09:00', 'بابلسر']
  ];
  const today = dateAt(0);
  let remote = 0;
  for (const [name, phone, time, place] of remoteToday) {
    const r = await call('POST', '/api/orders/remote', {
      name, phone, scheduledDate: today, scheduledTime: time, scheduledAt: `${today}T${time}`,
      deliveryMode: 'DELIVERY', dispatchPlace: place, items: itemsFor(1)
    }, sales);
    if (r.status === 201) remote++; else log(`تلفنی امروز ${name}:`, r.status, r.json?.error || '');
  }
  for (const [name, phone, offset, time, place] of remoteFuture) {
    const day = dateAt(offset);
    const r = await call('POST', '/api/orders/remote', {
      name, phone, scheduledDate: day, scheduledTime: time, scheduledAt: `${day}T${time}`,
      deliveryMode: 'DELIVERY', dispatchPlace: place, items: itemsFor(2)
    }, sales);
    if (r.status === 201) remote++; else log(`تلفنی آینده ${name}:`, r.status, r.json?.error || '');
  }
  log(`سفارش تلفنی: ${remote}`);

  // ۶) دو سفارش حضوری را تا صف آماده‌سازی انبار جلو ببر
  let advanced = 0;
  for (const id of onsite.slice(0, 2)) {
    const a = await call('POST', `/api/orders/${id}/warehouse/accept`, {}, warehouse);
    const s = await call('POST', `/api/orders/${id}/warehouse/start-preparing`, {}, warehouse);
    if (a.status === 200 && s.status === 200) advanced++;
  }
  log(`سفارش در حال آماده‌سازی: ${advanced}`);

  // ۷) خلاصه + آزادکردن نشست‌ها
  const workload = await call('GET', '/api/workload', null, admin);
  if (workload.json?.counts) log('\nکارتابل:', JSON.stringify(workload.json.counts));
  log(`\nورود: admin / ${ADMIN_PASS}  ·  sales1 | wh1 | gate1 / ${DEMO_PASS}`);
  for (const cookie of [admin, gate, sales, warehouse]) {
    try { await call('POST', '/api/logout', null, cookie); } catch { /* بی‌اهمیت */ }
  }
}

main().catch((err) => {
  console.error('seeding failed:', err.message);
  process.exitCode = 1;
});
