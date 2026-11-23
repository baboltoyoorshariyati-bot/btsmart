'use strict';
// مدیریت کاربران، کالاها و Audit (فقط مدیر سیستم)
const { atomicRoute: route, fail } = require('../http');
const store = require('../store');
const repo = require('../sql-repos');
const sec = require('../security');
const validate = require('../validate');
const { publicUser, getProduct, today } = require('../domain');

const ADMIN = { roles: ['admin'] };
// واحد فروش می‌تواند محصول را ثبت و ویرایش کند و قیمت روز بگذارد؛ حذف فقط با مدیر است.
const CATALOG_EDIT = { roles: ['admin', 'sales'] };
const ROLE_CODES = ['admin', 'gate', 'sales', 'warehouse', 'store', 'dispatch', 'driver'];
function branchNumber(value) { try { return require('../order-numbers').checkBranchNo(value); } catch (e) { fail(400, e.message); } }

// دستگاه‌های پوز — ثبت مدیریتی؛ در تسویه تنها دستگاه فعال قابل انتخاب است.
route('GET', '/api/payment-devices', { roles: ['admin', 'sales', 'driver'] }, () => ({ status: 200, body: { devices: repo.repos.paymentDevices.select('is_active = 1').map(({ id, title, terminalNumber, bank, model, simNumber, connection }) => ({ id, title, terminalNumber, bank, model, simNumber, connection })) } }));
route('GET', '/api/admin/payment-devices', ADMIN, () => ({ status: 200, body: { devices: repo.repos.paymentDevices.all() } }));
route('POST', '/api/admin/payment-devices', { ...ADMIN, idempotent: true }, (ctx) => {
  const b=ctx.body, db=store.get();
  const title=validate.text(b.title,{field:'عنوان دستگاه',max:80}).trim();
  const terminalNumber=validate.text(b.terminalNumber,{field:'شماره پایانه',max:40}).trim();
  const bank=validate.text(b.bank,{field:'بانک مقصد',max:80}).trim();
  const model=validate.text(b.model,{field:'مدل دستگاه',max:80}).trim();
  const connection=b.connection==='wireless'?'wireless':'wired';
  const simNumber=validate.text(b.simNumber||'',{field:'شماره سیم‌کارت',max:20}).trim();
  if(!title||!terminalNumber||!bank||!model) fail(400,'عنوان، شماره پایانه، بانک مقصد و مدل دستگاه الزامی است.');
  if(connection==='wireless'&&!/^09\d{9}$/.test(simNumber)) fail(400,'شماره سیم‌کارت پوز بی‌سیم معتبر نیست.');
  if(db.paymentDevices.some(d=>d.terminalNumber===terminalNumber)) fail(409,'شماره پایانه تکراری است.');
  const device={id:store.uid(),title,terminalNumber,bank,model,simNumber:connection==='wireless'?simNumber:'',connection,isActive:true,createdAt:store.nowIso(),createdBy:ctx.user.id};
  db.paymentDevices.push(device);store.audit(ctx.user,'PAYMENT_DEVICE_CREATED','payment_device',device.id,{title,terminalNumber,bank,model,connection},ctx);store.save();
  return {status:201,body:{device}};
});
route('PUT', '/api/admin/payment-devices/:id', ADMIN, (ctx) => {
  const db=store.get(),d=(db.paymentDevices||[]).find(x=>x.id===ctx.params.id);if(!d)fail(404,'دستگاه پیدا نشد.');
  const b=ctx.body,terminalNumber=validate.text(b.terminalNumber??d.terminalNumber,{field:'شماره پایانه',max:40,required:true});
  const title=validate.text(b.title??d.title,{field:'عنوان',max:80,required:true});
  const bank=validate.text(b.bank??d.bank,{field:'بانک',max:80,required:true});
  const model=validate.text(b.model??d.model,{field:'مدل',max:80,required:true});
  if(db.paymentDevices.some(x=>x.id!==d.id&&x.terminalNumber===terminalNumber))fail(409,'شماره پایانه تکراری است.');
  const connection=b.connection===undefined?d.connection:(b.connection==='wireless'?'wireless':'wired');const simNumber=validate.text(b.simNumber===undefined?d.simNumber:(b.simNumber||''),{field:'شماره سیم‌کارت',max:20}).trim();
  if(connection==='wireless'&&!/^09\d{9}$/.test(simNumber))fail(400,'شماره سیم‌کارت پوز بی‌سیم معتبر نیست.');
  if (b.isActive === false && db.drivers.some(driver => driver.paymentDeviceId === d.id && db.users.some(u => u.driverId === driver.id && u.roleCode === 'driver' && u.isActive))) fail(409, 'دستگاه به رانندهٔ فعال متصل است؛ ابتدا تخصیص را تغییر دهید.');
  Object.assign(d,{title,terminalNumber,bank,model,connection,simNumber:connection==='wireless'?simNumber:'',isActive:b.isActive===undefined?d.isActive:!!b.isActive,updatedAt:store.nowIso()});
  for (const driver of db.drivers.filter(x=>x.paymentDeviceId===d.id)) Object.assign(driver,{posTerminal:d.terminalNumber,posBank:d.bank,updatedAt:store.nowIso()});
  store.audit(ctx.user,'PAYMENT_DEVICE_UPDATED','payment_device',d.id,{isActive:d.isActive,terminalNumber:d.terminalNumber},ctx);store.save();return {status:200,body:{device:d}};
});

// کاربر نقش «راننده» باید به یک راننده‌ی ثبت‌شده وصل باشد (هر راننده فقط به یک کاربر)
function linkDriver(driverId, selfUserId) {
  const id = String(driverId || '').trim();
  if (!id) fail(400, 'برای نقش راننده باید یک رانندهٔ ثبت‌شده انتخاب شود؛ اگر هنوز راننده‌ای ثبت نشده، اول از بخش «رانندگان» او را ثبت کنید، بعد حساب کاربری‌اش را بسازید.');
  const driver = store.get().drivers.find((d) => d.id === id);
  if (!driver) fail(400, 'راننده انتخاب‌شده پیدا نشد.');
  if (!driver.isActive) fail(400, 'راننده انتخاب‌شده غیرفعال است.');
  const taken = store.get().users.find((u) => u.driverId === id && u.id !== selfUserId);
  if (taken) fail(400, `این راننده قبلاً به حساب «${taken.username}» وصل است.`);
  return id;
}

// v37.39.0 — راننده دیگر جدا تعریف نمی‌شود: هنگام ساخت «کاربر راننده»، رکورد راننده با مشخصات خودرو/پوز ساخته و وصل می‌شود
const DRV_KEYS = ['drvPhone', 'drvVehicleType', 'drvPlate', 'drvPosTerminal', 'drvPosBank'];
const hasDrvFields = (b) => DRV_KEYS.some((k) => b[k] !== undefined && String(b[k]).trim() !== '');
function driverFieldsFrom(b, fullName) {
  return {
    fullName,
    phone: validate.phone(b.drvPhone, { required: true }),
    vehicleType: validate.text(b.drvVehicleType, { field: 'نوع خودرو', max: 60, required: true }),
    plate: validate.driverPlate(b.drvPlate, b.drvVehicleType),
    posTerminal: validate.text(b.drvPosTerminal || '', { field: 'پایانه پوز', max: 60 }),
    posBank: validate.text(b.drvPosBank || '', { field: 'نام بانک پوز', max: 60 }),
  };
}
function createDriverForUser(ctx, fullName) {
  const db = store.get();
  const data = driverFieldsFrom(ctx.body, fullName);
  const drv = { id: store.uid(), isActive: true, createdVia: 'user', createdAt: store.nowIso(), updatedAt: store.nowIso(), ...data };
  db.drivers.push(drv);
  store.audit(ctx.user, 'DRIVER_CREATED', 'driver', drv.id, { fullName: drv.fullName, phone: drv.phone, plate: drv.plate, posBank: drv.posBank, via: 'user-create' }, ctx);
  return drv.id;
}
function syncDriverForUser(ctx, driverId, fullName) {
  const db = store.get();
  const drv = db.drivers.find((d) => d.id === driverId);
  if (!drv) return createDriverForUser(ctx, fullName);
  Object.assign(drv, driverFieldsFrom(ctx.body, fullName), { updatedAt: store.nowIso() });
  store.audit(ctx.user, 'DRIVER_UPDATED', 'driver', drv.id, { via: 'user-edit' }, ctx);
  return drv.id;
}

// New catalog-based forms use explicit references. The older API remains accepted
// for existing integrations and records; it never migrates or merges them silently.
function selectedBranch(id) {
  const branch = (store.get().storeBranches || []).find(x => x.id === String(id || '') && x.isActive);
  if (!branch) fail(400, 'ابتدا یک شعبهٔ فعال ثبت و انتخاب کنید.');
  return branch;
}
function selectedDriverFields(b, fullName) {
  const db = store.get();
  const vehicle = db.vehicles.find(v => v.kind === 'fleet' && v.id === String(b.vehicleId || '') && v.isActive);
  const device = db.paymentDevices.find(d => d.id === String(b.paymentDeviceId || '') && d.isActive);
  if (!vehicle) fail(400, 'ابتدا خودرو را تعریف و یک خودروی فعال انتخاب کنید.');
  if (!device) fail(400, 'ابتدا دستگاه پوز را تعریف و یک دستگاه فعال انتخاب کنید.');
  return {fullName, phone: validate.phone(b.drvPhone, {required:true}), vehicleId:vehicle.id, paymentDeviceId:device.id, vehicleType:vehicle.vehicleType, plate:vehicle.plate, posTerminal:device.terminalNumber, posBank:device.bank};
}
const hasSelection = b => b.vehicleId !== undefined || b.paymentDeviceId !== undefined;

function findUser(id) {
  const u = store.get().users.find((x) => x.id === id);
  if (!u) fail(404, 'کاربر یافت نشد.');
  return u;
}

function assertUniqueUsername(username, exceptId = null) {
  const lower = username.toLowerCase();
  if (store.get().users.some((x) => x.id !== exceptId && String(x.username).toLowerCase() === lower)) fail(409, 'نام کاربری تکراری است.');
}

// ---------- کاربران ----------
route('GET', '/api/admin/users', ADMIN, () => {
  const users = repo.repos.users.all().map((u) => ({ ...publicUser(u), activeSessions: sec.countUserSessions(u.id) }));
  return { status: 200, body: { users } };
});

route('POST', '/api/admin/users', { ...ADMIN, idempotent: true }, (ctx) => {
  const db = store.get();
  const b = ctx.body;
  const username = validate.text(b.username, { field: 'نام کاربری', max: 40, required: true });
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) fail(400, 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد (حداقل ۳ کاراکتر).');
  const fullName = validate.text(b.fullName, { field: 'نام کامل', max: 120, required: true });
  const position = validate.text(b.position, { field: 'سمت سازمانی', max: 120, required: true });
  const roleCode = String(b.roleCode || '').trim().toLowerCase();
  if (!ROLE_CODES.includes(roleCode)) fail(400, 'نقش انتخاب‌شده معتبر نیست.');
  if (roleCode==='driver' && require('../transport-planning').enabled()) fail(409,'حساب راننده در گردش جدید ساخته نمی‌شود؛ راننده را در واحد ترابری تعریف کنید.');
  const branch = roleCode === 'store' && b.branchId !== undefined ? selectedBranch(b.branchId) : null;
  const storeName = branch ? branch.name : validate.text(b.storeName, { field: 'نام فروشگاه', max: 120 });
  if (roleCode === 'store' && !storeName) fail(400, 'برای کاربر فروشگاه، نام فروشگاه را وارد کنید.');
  // v37.39.0 — مشخصات راننده اول اعتبارسنجی می‌شود و رکوردش بعد از ساخت موفق کاربر ساخته می‌شود تا رکورد یتیم نماند
  let driverId = '';
  let pendingDriver = null;
  if (roleCode === 'driver') {
    if (hasSelection(b)) pendingDriver = selectedDriverFields(b, fullName);
    else if (b.driverId) driverId = linkDriver(b.driverId, null);
    else if (hasDrvFields(b)) pendingDriver = driverFieldsFrom(b, fullName);
    else fail(400, 'برای نقش راننده، مشخصات راننده (شماره تماس، نوع خودرو و پلاک) را کامل وارد کنید.');
  }
  let branchNo = null; // v37.6.0 — شماره فروشگاه از شعبهٔ ۴۱/۴۲/۴۳…
  if (roleCode === 'store') branchNo = branch ? branch.branchNo : branchNumber(b.branchNo ?? 1);
  const password = String(b.password || '');
  const policy = sec.passwordPolicyError(password);
  if (policy) fail(400, policy);
  assertUniqueUsername(username);
  if (pendingDriver) {
    const drv = { id: store.uid(), isActive: true, createdVia: 'user', createdAt: store.nowIso(), updatedAt: store.nowIso(), ...pendingDriver };
    db.drivers.push(drv);
    driverId = drv.id;
    store.audit(ctx.user, 'DRIVER_CREATED', 'driver', drv.id, { fullName: drv.fullName, phone: drv.phone, plate: drv.plate, posBank: drv.posBank, via: 'user-create' }, ctx);
  }
  const u = {
    id: store.uid(), username, fullName, position, storeName: roleCode === 'store' ? storeName : '', branchNo: roleCode === 'store' ? branchNo : null, branchId: branch?.id || '',
    passwordHash: sec.hashPassword(password), roleCode, isActive: true, driverId,
    mustChangePassword: b.mustChangePassword !== false, createdAt: store.nowIso(), updatedAt: store.nowIso(),
  };
  db.users.push(u);
  store.audit(ctx.user, 'USER_CREATED', 'user', u.id, { username, role: roleCode, position }, ctx);
  store.save();
  return { status: 201, body: { user: publicUser(u) } };
});

route('PUT', '/api/admin/users/:id', { ...ADMIN }, (ctx) => {
  const target = findUser(ctx.params.id);
  const b = ctx.body;
  const before = { username: target.username, fullName: target.fullName, position: target.position || '', roleCode: target.roleCode, storeName: target.storeName || '', isActive: target.isActive };
  const username = b.username === undefined ? target.username : validate.text(b.username, { field: 'نام کاربری', max: 40, required: true });
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) fail(400, 'نام کاربری معتبر نیست.');
  const fullName = b.fullName === undefined ? target.fullName : validate.text(b.fullName, { field: 'نام کامل', max: 120, required: true });
  const position = b.position === undefined ? (target.position || '') : validate.text(b.position, { field: 'سمت سازمانی', max: 120, required: true });
  const roleCode = b.roleCode === undefined ? target.roleCode : String(b.roleCode).trim().toLowerCase();
  if (!ROLE_CODES.includes(roleCode)) fail(400, 'نقش انتخاب‌شده معتبر نیست.');
  if (roleCode==='driver' && target.roleCode!=='driver' && require('../transport-planning').enabled()) fail(409,'تغییر نقش به حساب راننده در گردش جدید مجاز نیست.');
  const branch = roleCode === 'store' && b.branchId !== undefined ? selectedBranch(b.branchId) : null;
  if (roleCode === 'store' && target.branchId && !branch && (b.storeName !== undefined || b.branchNo !== undefined)) fail(400, 'برای تغییر شعبه، شعبهٔ ثبت‌شده را انتخاب کنید.');
  if (branch && target.roleCode === 'store' && Number(target.branchNo ?? 1) !== branch.branchNo && b.confirmBranchChange !== true) fail(409, 'شماره شعبه تغییر می‌کند؛ سفارش‌های جدید شماره متفاوت خواهند داشت. تغییر را تأیید کنید.');
  const storeName = roleCode === 'store' ? (branch ? branch.name : validate.text(b.storeName ?? target.storeName, { field: 'نام فروشگاه', max: 120 })) : '';
  if (roleCode === 'store' && !storeName) fail(400, 'برای نقش فروشگاه، نام فروشگاه الزامی است.');
  let driverId = '';
  let driverData = null;
  if (roleCode === 'driver') {
    const keepId = b.driverId ? linkDriver(b.driverId, target.id) : (target.driverId || '');
    if (hasSelection(b)) driverData = selectedDriverFields(b, fullName);
    else if (hasDrvFields(b)) {
      const existing = store.get().drivers.find(d => d.id === keepId);
      if (existing?.vehicleId || existing?.paymentDeviceId) fail(400, 'خودرو و پوز این راننده باید از موارد تعریف‌شده انتخاب شوند.');
      driverData = driverFieldsFrom(b, fullName);
    }
    if (keepId) driverId = keepId;
    else if (!driverData) fail(400, 'برای نقش راننده، مشخصات راننده را کامل وارد کنید.');
  }
  const branchNo = roleCode === 'store' ? (branch ? branch.branchNo : branchNumber(b.branchNo ?? target.branchNo ?? 1)) : null;
  const isActive = b.isActive === undefined ? target.isActive : !!b.isActive;
  if (target.roleCode==='driver' && (roleCode!=='driver'||!isActive) && require('../legacy-driver-access').hasOpenWork(store.get(),target.driverId)) fail(409,'راننده مأموریت باز قدیمی دارد؛ ابتدا آن را تعیین تکلیف کنید.');
  if (ctx.user.id === target.id && !isActive) fail(400, 'نمی‌توانید حساب خودتان را غیرفعال کنید.');
  if (ctx.user.id === target.id && roleCode !== 'admin') fail(400, 'نمی‌توانید نقش مدیر خودتان را تغییر دهید.');
  if (target.roleCode === 'admin' && (roleCode !== 'admin' || !isActive)) {
    const otherAdmins = store.get().users.filter((u) => u.id !== target.id && u.roleCode === 'admin' && u.isActive).length;
    if (otherAdmins === 0) fail(400, 'حداقل یک مدیر فعال باید در سامانه باقی بماند.');
  }
  assertUniqueUsername(username, target.id);
  if (isActive && roleCode === 'store' && !branch && target.branchId) selectedBranch(target.branchId);
  if (isActive && roleCode === 'driver' && !driverData && driverId) {
    const existing = store.get().drivers.find(d => d.id === driverId);
    if (existing?.vehicleId && !store.get().vehicles.some(v => v.id === existing.vehicleId && v.kind === 'fleet' && v.isActive)) fail(400, 'خودروی متصل غیرفعال است.');
    if (existing?.paymentDeviceId && !store.get().paymentDevices.some(d => d.id === existing.paymentDeviceId && d.isActive)) fail(400, 'پوز متصل غیرفعال است.');
  }
  if (b.password) { const policy = sec.passwordPolicyError(String(b.password)); if (policy) fail(400, policy); }
  // Validate all input before touching live SQL-backed objects.
  if (driverData) {
    const db = store.get();
    let drv = driverId && db.drivers.find(d => d.id === driverId);
    if (!drv) { drv = {id:store.uid(),isActive:true,createdVia:'user',createdAt:store.nowIso()}; db.drivers.push(drv); driverId=drv.id; }
    Object.assign(drv, driverData, {updatedAt:store.nowIso()});
    store.audit(ctx.user, 'DRIVER_UPDATED', 'driver', drv.id, {via:'user-edit'}, ctx);
  }
  Object.assign(target, { username, fullName, position, roleCode, storeName, driverId, isActive, branchNo, branchId: roleCode === 'store' ? (branch?.id || target.branchId || '') : '', updatedAt: store.nowIso() });
  let passwordChanged = false;
  if (b.password) {
    const policy = sec.passwordPolicyError(String(b.password));
    if (policy) fail(400, policy);
    target.passwordHash = sec.hashPassword(String(b.password));
    target.mustChangePassword = true; // رمز توسط مدیر بازنشانی شده؛ کاربر باید آن را تغییر دهد
    passwordChanged = true;
  }
  if (!isActive || passwordChanged || roleCode !== before.roleCode) sec.destroyUserSessions(target.id);
  const after = { username, fullName, position, roleCode, storeName, isActive };
  if (roleCode !== before.roleCode) store.audit(ctx.user, 'USER_ROLE_CHANGED', 'user', target.id, { from: before.roleCode, to: roleCode, username }, ctx);
  store.audit(ctx.user, 'USER_UPDATED', 'user', target.id, { before, after, passwordReset: passwordChanged }, ctx);
  store.save();
  return { status: 200, body: { user: publicUser(target) } };
});

route('DELETE', '/api/admin/users/:id', ADMIN, (ctx) => {
  const target = findUser(ctx.params.id);
  if (ctx.user.id === target.id) fail(400, 'حساب کاربری خودتان قابل حذف نیست.');
  if (!target.isActive) fail(400, 'این حساب قبلاً غیرفعال شده است.');
  if (target.roleCode==='driver' && require('../legacy-driver-access').hasOpenWork(store.get(),target.driverId)) fail(409,'راننده مأموریت باز قدیمی دارد؛ ابتدا آن را تعیین تکلیف کنید.');
  if (target.roleCode === 'admin') {
    const otherAdmins = store.get().users.filter((u) => u.id !== target.id && u.roleCode === 'admin' && u.isActive).length;
    if (otherAdmins === 0) fail(400, 'حداقل یک مدیر فعال باید در سامانه باقی بماند.');
  }
  Object.assign(target, { isActive: false, deletedAt: store.nowIso(), deletedBy: ctx.user.id, updatedAt: store.nowIso() });
  sec.destroyUserSessions(target.id);
  store.audit(ctx.user, 'USER_DEACTIVATED', 'user', target.id, { username: target.username, role: target.roleCode }, ctx);
  store.save();
  return { status: 200, body: { ok: true, user: publicUser(target) } };
});

// ---------- کالاها ----------
route('GET', '/api/admin/products', CATALOG_EDIT, () => ({
  status: 200, body: { products: repo.repos.products.all().sort((a, b) => Number(a.quickCode) - Number(b.quickCode)) },
}));

// Import is additive only: existing IDs, names, prices and activity are never rewritten.
// Validate the complete file before writing; atomicRoute locks and rolls back the batch.
route('POST', '/api/admin/products/import', { ...CATALOG_EDIT, idempotent: true }, (ctx) => {
  const rows=ctx.body.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length>100) fail(400, 'فایل باید بین ۱ تا ۱۰۰ ردیف محصول داشته باشد.');
  const seen=new Set();
  const parsed=rows.map((row,index)=>{
    const n=index+2;
    if (!row || typeof row!=='object' || Array.isArray(row) || !['string','number'].includes(typeof row.quickCode) || typeof row.name!=='string') fail(400, `داده ردیف ${n} معتبر نیست.`);
    const raw=validate.digitsToAscii(row.quickCode).trim();
    if (!/^\d{1,2}$/.test(raw)) fail(400, `کد سریع ردیف ${n} باید یک یا دو رقم باشد.`);
    const quickCode=raw.padStart(2,'0');
    if (seen.has(quickCode)) fail(400, `کد سریع ${quickCode} در فایل تکراری است (ردیف ${n}).`);
    seen.add(quickCode);
    const name=validate.text(row.name,{field:`نام محصول ردیف ${n}`,max:160,required:true});
    const price = row.price === undefined || row.price === null || (typeof row.price === 'string' && !row.price.trim())
      ? null : validate.number(row.price, {field:`قیمت ردیف ${n} (ریال)`, min:0, max:validate.MAX_MONEY});
    return {quickCode,name,price};
  });
  const db=store.get(),existing=new Map(db.products.map(p=>[p.quickCode,p]));
  const added=[],skipped=[],priceDate=today();
  for (const row of parsed) {
    const old=existing.get(row.quickCode);
    if (old) { skipped.push({quickCode:row.quickCode,name:row.name,existingName:old.name}); continue; }
    const product={id:store.uid(),quickCode:row.quickCode,name:row.name,defaultUnit:'کیلوگرم',priceGroupId:null,isActive:true};
    db.products.push(product); existing.set(product.quickCode,product); added.push(product);
    if (row.price !== null) db.priceList.push({id:store.uid(),productId:product.id,price:row.price,date:priceDate});
  }
  store.audit(ctx.user,'PRODUCTS_IMPORTED','product_catalog','catalog',{added:added.map(p=>({id:p.id,quickCode:p.quickCode,name:p.name,price:parsed.find(row=>row.quickCode===p.quickCode).price})),priceDate,skipped},ctx);
  store.save();
  return {status:200,body:{added:added.length,skipped}};
});

route('POST', '/api/admin/products', { ...CATALOG_EDIT, idempotent: true }, (ctx) => {
  const db = store.get();
  const quick = validate.text(ctx.body.quickCode, { field: 'کد سریع', max: 2, required: true });
  if (!/^\d{2}$/.test(quick)) fail(400, 'کد سریع باید دو رقمی باشد.');
  const name = validate.text(ctx.body.name, { field: 'نام محصول', max: 160, required: true });
  const defaultUnit = validate.unit(ctx.body.defaultUnit);
  const priceGroupId = ctx.body.priceGroupId === undefined ? null : require('./product-price-groups').checkedGroup(db,ctx.body.priceGroupId);
  if (db.products.some((x) => x.quickCode === quick)) fail(409, 'کد سریع تکراری است.');
  const product = { id: store.uid(), quickCode: quick, name, defaultUnit, priceGroupId, isActive: true };
  db.products.push(product);
  store.audit(ctx.user, 'PRODUCT_CREATED', 'product', product.id, { quickCode: quick, name, defaultUnit, priceGroupId }, ctx);
  store.save();
  return { status: 201, body: { product } };
});

route('PUT', '/api/admin/products/:id', CATALOG_EDIT, (ctx) => {
  const product = getProduct(ctx.params.id);
  if (!product) fail(404, 'محصول یافت نشد.');
  const b = ctx.body;
  const quick = b.quickCode === undefined ? product.quickCode : validate.text(b.quickCode, { field: 'کد سریع', max: 2, required: true });
  const name = b.name === undefined ? product.name : validate.text(b.name, { field: 'نام محصول', max: 160, required: true });
  const unit = b.defaultUnit === undefined ? product.defaultUnit : validate.unit(b.defaultUnit);
  const isActive = b.isActive === undefined ? product.isActive : !!b.isActive;
  const priceGroupId = b.priceGroupId === undefined ? (product.priceGroupId||null) : require('./product-price-groups').checkedGroup(store.get(),b.priceGroupId);
  if (!/^\d{2}$/.test(quick)) fail(400, 'نام محصول و کد سریع دو رقمی الزامی است.');
  if (store.get().products.some((x) => x.id !== product.id && x.quickCode === quick)) fail(409, 'کد سریع واردشده برای محصول دیگری ثبت شده است.');
  const before = { quickCode: product.quickCode, name: product.name, defaultUnit: product.defaultUnit, isActive: product.isActive, priceGroupId:product.priceGroupId||null };
  Object.assign(product, { quickCode: quick, name, defaultUnit: unit, isActive, priceGroupId });
  store.audit(ctx.user, 'UPDATE_PRODUCT', 'product', product.id, { before, after: { quickCode: quick, name, defaultUnit: unit, isActive, priceGroupId } }, ctx);
  store.save();
  return { status: 200, body: { product } };
});

// ---------- قیمت‌ها: خواندن در routes/core.js ----------

// ---------- Audit ----------
route('GET', '/api/admin/audit', ADMIN, (ctx) => {
  const limit = Math.min(1000, Math.max(1, Number(ctx.query.get('limit')) || 300));
  const action = String(ctx.query.get('action') || '').slice(0, 60);
  const entityId = String(ctx.query.get('entityId') || '').slice(0, 80);
  const username = String(ctx.query.get('username') || '').slice(0, 60);
  const entityType = String(ctx.query.get('entityType') || '').slice(0, 40);
  const from = validate.digitsToAscii(ctx.query.get('from') || '').slice(0, 10);
  const to = validate.digitsToAscii(ctx.query.get('to') || '').slice(0, 10);
  // فاز ۲: WHERE پویا + COUNT + LIMIT، همگی با prepared statement و پارامتر بایندشده.
  let result;
  try { result = repo.auditQuery({ action, entityId, username, entityType, from, to, limit }); }
  catch (err) { if (err.status === 400) fail(400, err.message); throw err; }
  return { status: 200, body: result };
});

route('GET', '/api/admin/audit/verify', ADMIN, () => ({ status: 200, body: store.verifyAuditChain() }));

module.exports = {};
