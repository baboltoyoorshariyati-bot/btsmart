/* ============================================================
   داشبورد مدیریت — ستون قرمز سمت راست: کاربران، رانندگان، مشتریان،
   محصولات، تاریخچه فعالیت‌ها، گزارش‌ها.
   ============================================================ */
const ADM_ROLES = { admin: 'مدیر سیستم', gate: 'نگهبانی', sales: 'فروش', warehouse: 'انبار', store: 'فروشگاه', dispatch: 'واحد پخش', driver: 'راننده' };
const ADM_UNITS = ['کیلوگرم', 'بسته', 'عدد', 'کارتن'];
const ADM_ENTITIES = ['user', 'customer', 'driver', 'product', 'visit', 'order', 'payment', 'price', 'report', 'weighbridge'];
const adm = { q: '', users: [], drivers: [], products: [], priceGroups: [], paymentDevices: [], todayPrices: {}, sources: [], report: null, reportDraft: null, activity: [], tab: 'drivers' };

const admE = (v) => esc(v == null ? '' : String(v));
/* fallback plateViewHtml */
if(typeof plateViewHtml === 'undefined'){
  function plateViewHtml(value, fallback='—', compact=false){
    const raw=String(value||'').trim();
    if(!raw) return `<span style="color:var(--muted);font-size:12px;font-weight:700">${typeof admE==='function'?admE(fallback):typeof custEsc==='function'?custEsc(fallback):fallback}</span>`;
    let a='',letter='',c='',prov='';
    try{ if(typeof parsePlate==='function'){ const pr=parsePlate(raw); a=pr.a||''; letter=pr.letter||''; c=pr.c||''; prov=pr.province||''; } else throw 0; } catch(e){
      const m=raw.match(/(\d{1,2})\s*([^\d\s\-\.]+)?\s*(\d{1,3})?\s*[-\s]*\s*(\d{1,2})?/);
      if(m){ a=m[1]||''; letter=m[2]||''; c=m[3]||''; prov=m[4]||''; } else { a=raw; }
    }
    const escFn = typeof admE==='function' ? admE : typeof custEsc==='function' ? custEsc : (typeof esc==='function'?esc:(v=>String(v||'')));
    const cls = compact ? 'iran-plate is-readonly is-compact' : 'iran-plate is-readonly';
    return `<div class="${cls}" style="display:inline-grid;vertical-align:middle" dir="ltr"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part"><span>${escFn(a)}</span></div><div class="plate-part"><span>${escFn(letter)}</span></div><div class="plate-part"><span>${escFn(c)}</span></div><div class="plate-part plate-code"><span>${escFn(prov)}</span></div></div>`;
  }
}

function admParsePrice(v){
 const s=en(String(v??'')).trim().replace(/٫/g,'.');
 if(!/^(?:\d+|\d{1,3}(?:[,٬]\d{3})+)(?:\.\d+)?$/.test(s))return NaN;
 return Number(s.replace(/[,٬]/g,''));
}
function admFormatPrice(v){
 if(v==null||v==='')return '';const n=typeof v==='number'?v:admParsePrice(v);
 return Number.isFinite(n)?new Intl.NumberFormat('fa-IR',{maximumFractionDigits:15}).format(n):String(v);
}
function admBindPriceInputs(root=document){
  $$('[data-price-for]', root).forEach(inp=>{
    inp.addEventListener('input',()=>{
      // Format only complete whole numbers; leave decimal and invalid text intact
      // rather than silently changing the value the operator typed.
      const raw=en(inp.value);if(!/^[\d,٬]+$/.test(raw))return;
      const start=inp.selectionStart,end=inp.selectionEnd,beforeLen=inp.value.length;
      inp.value=admFormatPrice(Number(raw.replace(/[,٬]/g,'')));const delta=inp.value.length-beforeLen;
      try{inp.setSelectionRange((start||0)+delta,(end||0)+delta);}catch{}
    });
    inp.addEventListener('blur',()=>{const num=admParsePrice(inp.value);if(Number.isFinite(num))inp.value=admFormatPrice(num);});
  });
}
/* v37.3.1 — تاریخ محلی (مثل سرور lib/domain.js). toISOString تاریخ UTC می‌داد و در ایران بین ۰۰:۰۰ تا ۰۳:۳۰
   قیمت «دیروز» خوانده/ثبت می‌شد. */
const admToday = () => (typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));
const admTodayLabel = () => (typeof dateLabel === 'function' ? dateLabel(admToday()) : fa(admToday()));
function admHead(ico, title, desc, count, actions = '') {
  return `<section class="sd-panel adm-panel">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon(ico, 20)}</span>
      <div><h2>${admE(title)}</h2><p>${admE(desc)}</p></div></div>
      ${count !== undefined ? `<div class="sd-count"><strong>${fa(count)}</strong><span>مورد</span></div>` : ''}
    </div>
    ${actions ? `<div class="adm-toolbar">${actions}</div>` : ''}`;
}
function admSearchBox(id, placeholder, value = '') {
  return `<div class="input-shell adm-search"><span>${icon('search', 16)}</span><input id="${id}" value="${admE(value)}" placeholder="${admE(placeholder)}" aria-label="${admE(placeholder)}" autocomplete="off"></div>`;
}
function admMsgBox(id = 'admMsg') { return `<div id="${id}" class="form-error adm-msg"></div>`; }
function admModalForm(id, body, submitLabel) {
  return `<form id="${id}" class="cust-form">${body}${admMsgBox('admFormMsg')}<div class="cust-form-actions"><button class="btn btn-secondary" type="button" data-adm-close>انصراف</button><button class="btn btn-primary" type="submit">${submitLabel}</button></div></form>`;
}
function admBindClose() {
  const m = $('#modal'); if (!m) return;
  m.querySelectorAll('[data-adm-close]').forEach((b) => b.addEventListener('click', () => closeModal()));
}
function admActiveBadge(on) { return `<span class="badge ${on ? 'green' : 'gray'}">${on ? 'فعال' : 'غیرفعال'}</span>`; }

function admTable(headers, rows, empty){
 if(!rows.length)return empty;
 return `<div class="bt-table-wrap"><table class="bt-table adm-data-table"><caption class="bt-caption">${headers.join('، ')}</caption><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

/* ---------- کاربران ---------- */
async function renderUsersPage() {
  const d = await api('/api/admin/users');
  adm.users = d.users || [];
  $('#content').innerHTML = admHead('users', 'مدیریت کاربران', 'افزودن، ویرایش و غیرفعال‌سازی حساب‌های کاربری سامانه. حذف کاربر، حساب را غیرفعال می‌کند تا سوابق حفظ شوند.', adm.users.length,
    `${admSearchBox('admUserSearch', 'جستجوی نام، نام کاربری یا سمت', adm.q)}<button class="btn btn-primary" type="button" data-adm="user-new">${icon('plus', 16)} کاربر جدید</button>`)
    + `<div id="admList" class="adm-list"></div></section>`;
  $('#admUserSearch').addEventListener('input', (e) => { adm.q = e.target.value; paintUsers(); });
  bindAdm('users');
  paintUsers();
}
function paintUsers() {
  const q = admNorm(adm.q);
  const rows = adm.users.filter((u) => !q || admNorm(`${u.fullName} ${u.username} ${u.position || ''} ${u.storeName || ''}`).includes(q));
  $('#admList').innerHTML = admTable(['نام کامل', 'نام کاربری', 'نقش', 'عملیات'], rows.map((u) => `<tr class="adm-row">
      <td data-label="نام کامل"><div class="adm-cell"><b>${admE(u.fullName)}</b><span>${admE(u.position || '—')}</span></div></td>
      <td data-label="نام کاربری"><div class="adm-cell"><b dir="ltr">${admE(u.username)}</b></div></td>
      <td data-label="نقش"><div class="adm-cell"><b>${admE(ADM_ROLES[u.roleCode] || u.roleCode)}</b>${u.storeName ? `<span>${admE(u.storeName)}${u.branchNo&&u.storeName!=='فروشگاه شعبه 1 حمزه کلا'?` · شعبهٔ ${admE(String(u.branchNo))}`:''}</span>` : ''}</div></td>
      <td data-label="عملیات"><div class="adm-cell adm-actions">${admActiveBadge(u.isActive)}
        <button class="btn btn-secondary btn-sm" type="button" data-adm="user-edit" data-id="${admE(u.id)}">${icon('edit', 14)} ویرایش</button>
        ${u.isActive ? `<button class="btn btn-secondary btn-sm" type="button" data-adm="user-delete" data-id="${admE(u.id)}">${icon('trash', 14)} حذف</button>` : ''}
      </div></td></tr>`), sdEmpty('users', 'کاربری پیدا نشد', 'عبارت جستجو را تغییر دهید یا کاربر جدید بسازید.'));
}
function userFormHtml(u, drivers = [], vehicles = [], devices = [], branches = []) {
  const role = u?.roleCode || 'gate';
  // v37.39.0 — مشخصات راننده (خودرو/پوز/تماس) همین‌جا گرفته می‌شود؛ برای ویرایش از رکورد متصل پر می‌شود
  const myDrv = (drivers || []).find((d) => d.id === u?.driverId);
  return admModalForm('admUserForm', `<div class="cust-form-grid">
    <label class="cust-field"><span>نام کامل *</span><input name="fullName" required maxlength="120" value="${admE(u?.fullName)}"></label>
    <label class="cust-field"><span>نام کاربری (انگلیسی) *</span><input name="username" required dir="ltr" maxlength="40" value="${admE(u?.username)}"></label>
    <label class="cust-field"><span>سمت سازمانی *</span><input name="position" required maxlength="120" value="${admE(u?.position)}"></label>
    <label class="cust-field"><span>نقش *</span><select name="roleCode">${Object.entries(ADM_ROLES).filter(([k])=>k!=='driver'||role==='driver').map(([k, v]) => `<option value="${k}" ${k === role ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <div data-role-fields="store"><label class="cust-field cust-span2"><span>شعبهٔ فروشگاه *</span><select name="branchId"><option value="">انتخاب شعبهٔ تعریف‌شده</option>${branches.filter(x=>x.isActive).map(x=>`<option value="${admE(x.id)}" data-branch-no="${admE(x.branchNo)}" ${x.id===u?.branchId?'selected':''}>${admE(x.name)}${x.name==='فروشگاه شعبه 1 حمزه کلا'?'':` — شعبه ${admE(fa(x.branchNo))}`}</option>`).join('')}</select><small>ابتدا شعبه را در «شعب فروشگاه» تعریف کنید. حساب‌های قدیمی تا زمان انتخاب دستی بدون تغییر باقی می‌مانند.</small></label></div>
    <div data-role-fields="driver"><input type="hidden" name="driverId" value="${admE(u?.driverId || '')}">
    <label class="cust-field"><span>شماره تماس راننده *</span><input name="drvPhone" maxlength="30" inputmode="tel" dir="ltr" value="${admE(myDrv?.phone)}"></label>
    <label class="cust-field"><span>خودرو *</span><select name="vehicleId"><option value="">انتخاب خودروی تعریف‌شده</option>${vehicles.filter(x=>x.isActive).map(x=>`<option value="${admE(x.id)}" ${x.id===myDrv?.vehicleId?'selected':''}>${admE(x.vehicleType)} — ${admE(x.plate)}</option>`).join('')}</select><div data-vehicle-preview>${plateViewHtml(vehicles.find(x=>x.id===myDrv?.vehicleId)?.plate||myDrv?.plate,'—',true)}</div></label>
    <label class="cust-field"><span>دستگاه پوز *</span><select name="paymentDeviceId"><option value="">انتخاب دستگاه تعریف‌شده</option>${devices.filter(x=>x.isActive).map(x=>`<option value="${admE(x.id)}" ${x.id===myDrv?.paymentDeviceId?'selected':''}>${admE(x.title)} — ${admE(x.terminalNumber)} — ${admE(x.bank)}</option>`).join('')}</select></label>
    <div class="cust-span2 adm-driver-hint">ابتدا خودرو و دستگاه پوز را جداگانه تعریف کنید؛ راننده و رانندهٔ پخش یک حساب در ترابری هستند. مشخصات قدیمی بدون حذف باقی می‌ماند و در ویرایش باید دستی انتخاب شود.</div></div>
    <label class="cust-field cust-span2"><span>${u ? 'رمز جدید (اختیاری)' : 'رمز عبور *'}</span><input name="password" type="password" autocomplete="new-password" ${u ? '' : 'required'} minlength="8" maxlength="120"></label>
    ${u ? `<label class="cust-field"><span>وضعیت</span><select name="isActive"><option value="true" ${u.isActive ? 'selected' : ''}>فعال</option><option value="false" ${!u.isActive ? 'selected' : ''}>غیرفعال</option></select></label>`
      : `<label class="cust-field cust-span2 adm-check"><input type="checkbox" name="mustChangePassword" checked> تغییر رمز در اولین ورود</label>`}
  </div>`, u ? 'ذخیره تغییرات' : 'ساخت کاربر');
}
async function openUserForm(u) {
  const [drivers, vehicles, devices, branches] = await Promise.all([api('/api/drivers'),api('/api/admin/transport-vehicles'),api('/api/admin/payment-devices'),api('/api/admin/store-branches')]);
  openModal(u ? `ویرایش کاربر ${u.username}` : 'کاربر جدید', userFormHtml(u, drivers.drivers || [], vehicles.vehicles || [], devices.devices || [], branches.branches || []));
  admBindClose();
  const form = $('#admUserForm');
  const vehicleSelect=form.elements.vehicleId;
  vehicleSelect.addEventListener('change',()=>{form.querySelector('[data-vehicle-preview]').innerHTML=plateViewHtml((vehicles.vehicles||[]).find(x=>x.id===vehicleSelect.value)?.plate,'—',true);});
  // v37.38.0 — فیلدهای هر نقش فقط وقتی همان نقش انتخاب است دیده و لازم می‌شوند
  const syncRoleFields = () => {
    const r = form.elements.roleCode.value;
    form.querySelectorAll('[data-role-fields]').forEach((w) => { w.style.display = w.dataset.roleFields === r ? 'contents' : 'none'; });
  };
  form.elements.roleCode.addEventListener('change', syncRoleFields);
  syncRoleFields();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    if (b.roleCode === 'driver' && !(b.drvPhone && b.vehicleId && b.paymentDeviceId)) { $('#admFormMsg').textContent = 'شماره تماس، خودرو و دستگاه پوز تعریف‌شده را انتخاب کنید.'; return; }
    if (b.roleCode === 'store' && !b.branchId) { $('#admFormMsg').textContent = 'شعبهٔ تعریف‌شده را انتخاب کنید.'; return; }
    if (u?.roleCode === 'store' && b.roleCode === 'store' && Number(u.branchNo ?? 1) !== Number(e.target.elements.branchId.selectedOptions[0]?.dataset.branchNo)) { if (!confirm('شماره شعبه تغییر می‌کند. شماره سفارش‌های قبلی حفظ می‌شود، اما سفارش‌های جدید با پیشوند شعبهٔ جدید ثبت خواهند شد. ادامه می‌دهید؟')) return; b.confirmBranchChange = true; }
    if (!b.password) delete b.password;
    b.mustChangePassword = !!e.target.elements.mustChangePassword?.checked;
    if (b.isActive !== undefined) b.isActive = b.isActive === 'true';
    if (b.roleCode !== 'store') delete b.branchId;
    if (b.roleCode !== 'driver') { delete b.driverId; delete b.vehicleId; delete b.paymentDeviceId; delete b.drvPhone; }
    try {
      if (u) await api('/api/admin/users/' + u.id, { method: 'PUT', body: JSON.stringify(b) });
      else await api('/api/admin/users', { method: 'POST', body: JSON.stringify(b) });
      toast(u ? 'کاربر به‌روز شد.' : 'کاربر ساخته شد.'); closeModal(); renderUsersPage();
    } catch (err) { $('#admFormMsg').textContent = err.message; }
  });
}
async function deleteUser(id) {
  const u = adm.users.find((x) => x.id === id);
  if (!confirm(`حساب ${u?.username || ''} غیرفعال شود؟ سوابق آن حفظ می‌شود.`)) return;
  try { await api('/api/admin/users/' + id, { method: 'DELETE' }); toast('کاربر غیرفعال شد.'); renderUsersPage(); }
  catch (err) { toast(err.message); }
}

/* ---------- رانندگان (پخش: به‌زودی) ---------- */
async function renderDriversPage() {
  if(app.timer){clearInterval(app.timer);app.timer=null;}
  // One operational transport desk; old open shipments remain reachable only
  // while they actually exist, so existing deliveries are never abandoned.
  if(normalizeRole(app.user?.roleCode)==='dispatch'||app.adminActiveRole==='dispatch'){
    const host=$('#content');host.innerHTML='<div id="transportPlans"></div><div id="legacyTransport"></div>';
    await renderTransportPlanQueue();
    if($('#content')!==host||app.page!=='drivers')return;
    const legacy=$('#legacyTransport');
    async function refreshLegacy(){
      try{
        const old=await api('/api/dispatch/orders?status=open');
        if($('#legacyTransport')!==legacy)return;
        const count=Number(old.counts?.pending||0)+Number(old.counts?.assigned||0);
        let details=legacy.querySelector('[data-legacy-dispatch]');
        if(!count){legacy.innerHTML='';return;}
        if(!details){legacy.innerHTML=`<details data-legacy-dispatch><summary></summary><p>این موارد پیش از تغییر ثبت شده‌اند و برای جلوگیری از توقف، تا پایان در دسترس‌اند.</p><div id="transportDispatch"></div></details>`;details=legacy.querySelector('[data-legacy-dispatch]');}
        details.querySelector('summary').textContent=`سفارش‌های باز از گردش قبلی (${qty(count)})`;
        if(details.open||!$('#transportDispatch').innerHTML){const data=await api(dspDispatchUrl());if($('#legacyTransport')===legacy)paintDispatch(data);}
      }catch(e){if($('#legacyTransport')===legacy&&!legacy.querySelector('[data-legacy-dispatch]'))legacy.innerHTML='<p role="alert">بررسی سفارش‌های قبلی ناموفق بود؛ تلاش مجدد خودکار انجام می‌شود.</p>';}
    }
    await refreshLegacy();
    if($('#content')!==host||app.page!=='drivers')return;
    app.timer=setInterval(async()=>{if(app.page!=='drivers'||dspBusy())return;await renderTransportPlanQueue();await refreshLegacy();},8000);
    return;
  }
  const canManage=normalizeRole(app.user?.roleCode)==='admin';
  // v37.39.0 — تعریف راننده فقط از «ساخت کاربر راننده» است؛ واحد پخش فهرست را می‌بیند و خودرو/پوز را ویرایش می‌کند
  const canEditDrivers=canManage||normalizeRole(app.user?.roleCode)==='dispatch'||app.adminActiveRole==='dispatch';
  adm.canManage=canManage; adm.canEditDrivers=canEditDrivers;
  if (adm.tab === 'records' && !canManage) adm.tab = 'drivers';
  if (!canEditDrivers) adm.tab = 'dispatch';
  if(canEditDrivers){const d=await api('/api/drivers');adm.drivers=d.drivers||[];}
  const tab = ['records', 'dispatch'].includes(adm.tab) ? adm.tab : 'drivers';
  adm.tab = tab;
  const tabBtn = (k, ico, title, sub) => `<button type="button" class="sd-tab ${tab === k ? 'active' : ''}" data-adm="drv-tab" data-tab="${k}"><span class="sd-tab-ico">${icon(ico, 19)}</span><span class="sd-tab-copy"><strong>${title}</strong><small>${sub}</small></span></button>`;
  const innerTabs = `<nav class="sd-tabs adm-tabs drv-tabs">
      ${canEditDrivers?tabBtn('drivers', 'truck', 'رانندگان', 'نام، تماس، خودرو، پلاک، پوز'):''}
      ${canManage?tabBtn('records', 'receipt', 'سوابق سفارش‌ها', 'تحویل و مرجوعی روزانه'):''}
      ${tabBtn('dispatch', 'send', 'پخش', 'سفارش‌ها و وضعیت زنده رانندگان')}
    </nav>`;
  $('#content').innerHTML = innerTabs
    + (tab === 'dispatch'
      ? '<div id="transportPlans"></div><div id="transportDispatch"></div>'
      : tab === 'records'
        ? '<div id="drvRecords"></div>'
        : admHead('truck', 'رانندگان', 'رانندگان هنگام ساخت «کاربر راننده» ساخته می‌شوند؛ خودرو و پوز از حساب کاربری انتخاب می‌شوند. سوابق قدیمی حفظ شده‌اند.', adm.drivers.length,
            `${admSearchBox('admDrvSearch', 'جستجوی نام، تماس، پلاک یا بانک', adm.q)}`)
          + `<div id="admList" class="adm-list"></div></section>`);
  if (tab === 'drivers') {
    $('#admDrvSearch').addEventListener('input', (e) => { adm.q = e.target.value; paintDrivers(); });
    paintDrivers();
  }
  if (tab === 'records') await renderDriverRecords();
  bindAdm('drivers');
  if(tab==='dispatch'){await renderTransportPlanQueue();await renderDispatchPage();}
}
function paintDrivers() {
  const q = admNorm(adm.q);
  const rows = adm.drivers.filter((x) => !q || admNorm(`${x.fullName} ${x.phone || ''} ${x.plate} ${x.vehicleType} ${x.posTerminal} ${x.posBank || ''}`).includes(q));
  $('#admList').innerHTML = admTable(['نام راننده', 'شماره تماس', 'نوع خودرو', 'پلاک خودرو', 'پایانه پوز / بانک', 'عملیات'], rows.map((x) => `<tr class="adm-row drv-row">
      <td data-label="نام راننده"><div class="adm-cell"><b>${admE(x.fullName)}</b></div></td>
      <td data-label="شماره تماس"><div class="adm-cell">${driverPhoneHtml(x.phone)}</div></td>
      <td data-label="نوع خودرو"><div class="adm-cell"><span>${admE(x.vehicleType || '—')}</span></div></td>
      <td data-label="پلاک خودرو"><div class="adm-cell">${plateViewHtml(x.plate, '—', true)}</div></td>
      <td data-label="پایانه پوز / بانک"><div class="adm-cell">${driverPosHtml(x)}</div></td>
      <td data-label="عملیات"><div class="adm-cell adm-actions">${admActiveBadge(x.isActive)}
        ${adm.canManage?`<button class="btn btn-secondary btn-sm" type="button" data-adm="drv-records" data-id="${admE(x.id)}">${icon('receipt', 14)} سوابق</button>`:''}
        ${adm.canEditDrivers && !x.vehicleId && !x.paymentDeviceId?`<button class="btn btn-secondary btn-sm" type="button" data-adm="drv-edit" data-id="${admE(x.id)}">${icon('edit', 14)} ویرایش</button>`:''}
        ${adm.canManage?`<button class="btn btn-secondary btn-sm" type="button" data-adm="drv-delete" data-id="${admE(x.id)}">${icon('trash', 14)} حذف</button>`:''}
      </div></td></tr>`), sdEmpty('truck', 'هنوز راننده‌ای ساخته نشده است', 'از «مدیریت ← کاربران ← کاربر جدید» با نقش «راننده» اولین راننده را بسازید؛ مشخصات خودرو و پوزش همان‌جا وارد می‌شود.'));
}
function openDriverForm(x) {
  openModal(x ? `ویرایش راننده ${x.fullName}` : 'راننده جدید', admModalForm('admDriverForm', `<div class="cust-form-grid">
    <label class="cust-field"><span>نام راننده *</span><input name="fullName" required maxlength="120" value="${admE(x?.fullName)}"></label>
    <label class="cust-field"><span>شماره تماس راننده *</span><input name="phone" required maxlength="30" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" value="${admE(x?.phone)}"></label>
    <label class="cust-field"><span>نوع خودرو *</span><input name="vehicleType" required maxlength="60" list="drvVehicleTypes" placeholder="مثلاً وانت" value="${admE(x?.vehicleType)}"><datalist id="drvVehicleTypes"><option value="وانت"></option><option value="کامیون"></option><option value="کامیونت"></option><option value="موتورسیکلت"></option><option value="پژو"></option></datalist></label>
    <div class="cust-field"><span>پلاک خودرو *</span>${plateEditorHtml(x?.plate||'',x?.vehicleType||'')}</div>
    <label class="cust-field"><span>پایانه پوز</span><input name="posTerminal" maxlength="60" dir="ltr" placeholder="مثلاً POS-01" value="${admE(x?.posTerminal)}"></label>
    <label class="cust-field"><span>نام بانک پوز</span><input name="posBank" maxlength="60" list="drvPosBanks" placeholder="مثلاً بانک ملت" value="${admE(x?.posBank)}"><datalist id="drvPosBanks">${BT_POS_BANKS.map((b) => `<option value="${admE(b)}"></option>`).join('')}</datalist></label>
    ${x ? `<label class="cust-field"><span>وضعیت</span><select name="isActive"><option value="true" ${x.isActive ? 'selected' : ''}>فعال</option><option value="false" ${!x.isActive ? 'selected' : ''}>غیرفعال</option></select></label>` : ''}
  </div>`, x ? 'ذخیره تغییرات' : 'ثبت راننده'));
  admBindClose();
  bindPlateEditor($('#admDriverForm'));
  $('#admDriverForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    if (b.isActive !== undefined) b.isActive = b.isActive === 'true';
    try {
      b.plate=plateEditorValue(e.target,{required:true});
      if(x && e.target.querySelector('[data-plate-editor]').dataset.dirty!=='1' && b.vehicleType===(x.vehicleType||'')){delete b.plate;delete b.vehicleType;}
      if (x) await api('/api/drivers/' + x.id, { method: 'PUT', body: JSON.stringify(b) });
      else await api('/api/drivers', { method: 'POST', body: JSON.stringify(b) });
      toast(x ? 'راننده به‌روز شد.' : 'راننده ثبت شد.'); closeModal(); renderDriversPage();
    } catch (err) { $('#admFormMsg').textContent = err.message; }
  });
}

/* ---------- سوابق سفارش‌های رانندگان (روزانه) ---------- */
function drvTodayKey() {
  const d = typeof serverNow === 'function' ? serverNow() : new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
async function renderDriverRecords() {
  if (!adm.recFrom) { adm.recFrom = drvTodayKey(); adm.recTo = adm.recFrom; }
  const qs = new URLSearchParams(Object.entries({
    driverId: adm.recDriver || '', from: adm.recFrom || '', to: adm.recTo || '',
    settlement: adm.recSettle || '', kind: adm.recKind || '',
  }).filter(([, v]) => v)).toString();
  const data = await api('/api/admin/driver-records?' + qs);
  const t = data.totals;
  const sel = (id, value, opts) => `<select class="adm-select" id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const driverOpts = [['', 'همه رانندگان'], ...adm.drivers.map((x) => [x.id, x.fullName])];
  const chips = [['تحویل', fa(t.count)], ['وزن تحویلی (کیلو)', qty(t.totalKg)], ['مرجوعی (کیلو)', qty(t.returnKg)], ['کسری وزن (کیلو)', qty(t.shortageKg)], ['خالص (کیلو)', qty(t.netKg)]]
    .map(([l, v]) => `<div class="drv-chip"><small>${l}</small><b>${v}</b></div>`).join('');
  const dayHtml = data.days.map((g) => `<section class="drv-day">
      <header class="drv-day-head"><b dir="ltr">${admE(g.day)}</b><span>${fa(g.totals.count)} تحویل • مرجوعی ${qty(g.totals.returnKg)} • کسری ${qty(g.totals.shortageKg)} کیلو</span></header>
      ${admTable(['سفارش','مشتری','راننده','تسویه','مقادیر'],g.deliveries.map((r) => `<tr class="adm-row drv-del">
        <td data-label="سفارش"><div class="adm-cell"><b dir="ltr">${admE(r.orderNo)}</b><span>${admE(formatDateTime24(r.deliveredAt))}</span></div></td>
        <td data-label="مشتری"><div class="adm-cell"><b>${admE(r.customerName)}</b><span dir="ltr">${admE(r.customerPhone || '')}</span></div></td>
        <td data-label="راننده"><div class="adm-cell"><b>${admE(r.driverName)}</b>${plateViewHtml(r.driverPlate, '—', true)}</div></td>
        <td data-label="تسویه"><div class="adm-cell"><span class="badge ${r.settlementType === 'CASH' ? 'green' : 'blue'}">${r.settlementType === 'CASH' ? 'نقدی' : 'معوق'}</span><span>${r.hasReturn ? 'دارای مرجوعی' : 'بدون مرجوعی'} • ${r.hasShort ? 'دارای کسری' : 'بدون کسری'}</span></div></td>
        <td data-label="مقادیر">تحویلی ${qty(r.totalKg)} • خالص ${qty(r.netKg)} کیلو</td></tr>
        <tr class="drv-detail-row"><td colspan="5" data-label="جزئیات اقلام"><details class="drv-lines"><summary>جزئیات اقلام</summary>
            <div class="bt-table-wrap"><table class="bt-table drv-lines-table"><caption class="bt-caption">اقلام تحویل راننده</caption><thead><tr><th>کالا</th><th>تحویلی</th><th>مرجوعی</th><th>کسری</th><th>خالص</th><th>علت</th></tr></thead>
            <tbody>${r.lines.map((l) => `<tr><td data-label="کالا">${admE(l.productName)}</td><td data-label="تحویلی">${qty(l.deliveredKg)}</td><td data-label="مرجوعی">${qty(l.returnKg)}</td><td data-label="کسری">${qty(l.shortageKg)}</td><td data-label="خالص">${qty(l.netKg)}</td><td data-label="علت">${admE(l.reason || '—')}</td></tr>`).join('')}</tbody></table></div>
            ${r.note ? `<p class="adm-note">یادداشت: ${admE(r.note)}</p>` : ''}
          </details></td></tr>`),'<div class="empty">تحویلی ثبت نشده است.</div>')}
    </section>`).join('') || sdEmpty('receipt', 'سابقه‌ای در این بازه نیست', 'بازه تاریخ یا فیلترها را تغییر دهید.');
  $('#drvRecords').innerHTML = `<section class="sd-panel adm-panel">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('receipt', 20)}</span><div><h2>سوابق سفارش‌های رانندگان</h2><p>تحویل‌ها و مرجوعی‌ها به تفکیک روز، راننده، نوع تسویه و کسری وزن.</p></div></div></div>
    <div class="adm-toolbar drv-filters">
      <label class="adm-date">از<input type="date" id="recFrom" value="${admE(adm.recFrom)}"></label>
      <label class="adm-date">تا<input type="date" id="recTo" value="${admE(adm.recTo)}"></label>
      ${sel('recDriver', adm.recDriver || '', driverOpts)}
      ${sel('recSettle', adm.recSettle || '', [['', 'همه تسویه‌ها'], ['CASH', 'نقدی'], ['CREDIT', 'معوق']])}
      ${sel('recKind', adm.recKind || '', [['', 'همه تحویل‌ها'], ['return', 'فقط مرجوعی'], ['shortage', 'فقط کسری وزن']])}
      <button class="btn btn-secondary btn-sm" type="button" data-adm="rec-today">امروز</button>
    </div>
    <div class="drv-chips">${chips}</div>
    <div class="adm-list">${dayHtml}</div>
  </section>`;
  const rerender = () => {
    adm.recFrom = $('#recFrom').value; adm.recTo = $('#recTo').value;
    adm.recDriver = $('#recDriver').value; adm.recSettle = $('#recSettle').value; adm.recKind = $('#recKind').value;
    renderDriverRecords();
  };
  ['recFrom', 'recTo', 'recDriver', 'recSettle', 'recKind'].forEach((id) => $('#' + id).addEventListener('change', rerender));
}
async function showDriverSignature(orderId) {
  try {
    const d = await api('/api/admin/driver-records/' + orderId);
    openModal(`امضای مشتری — سفارش ${d.order.orderNo || ''}`, `<div class="drv-sigview"><img src="${d.signatureData}" alt="امضای مشتری"><small>تسویه ${d.order.dispatch.settlementType === 'CASH' ? 'نقدی' : 'معوق'} • ${admE(formatDateTime24(d.order.dispatch.deliveredAt))} • ثبت‌کننده: ${admE(d.order.dispatch.deliveredBy)}</small></div>`);
  } catch (err) { toast(err.message); }
}

async function deleteDriver(id) {
  const x = adm.drivers.find((d) => d.id === id);
  if (!confirm(`راننده ${x?.fullName || ''} حذف شود؟`)) return;
  try { await api('/api/drivers/' + id, { method: 'DELETE' }); toast('راننده حذف شد.'); renderDriversPage(); }
  catch (err) { toast(err.message); }
}

/* ---------- محصولات و قیمت ---------- */
/* v37.3.1 — صفحهٔ مشترک محصولات و قیمت‌ها
   مدیر: ثبت، ویرایش، حذف محصول و تعیین قیمت روز.
   فروش: ثبت و ویرایش محصول و تعیین قیمت روز؛ حذف فقط با مدیر است. */
function admIsCatalogAdmin() { return (typeof normalizeRole === 'function' ? normalizeRole(app.user?.roleCode) : app.user?.roleCode) === 'admin'; }
async function renderProductsPage() {
  const page = app.page, sub = app.sub?.sales;
  const host = page === 'admin' ? $('#settings-products-content') : $('#content');
  if (!host || !(page === 'admin' || page === 'products' || (page === 'sales' && sub === 'products'))) return;
  const [p, pr, groupData] = await Promise.all([api('/api/admin/products'), api('/api/prices?date=' + admToday()), api('/api/admin/price-groups')]);
  if (app.page !== page || (page === 'sales' && app.sub?.sales !== sub) || !host.isConnected) return;
  const isAdmin = admIsCatalogAdmin();
  adm.products = p.products || [];
  adm.priceGroups = groupData.groups || [];
  adm.todayPrices = Object.fromEntries((pr.prices || []).map((x) => [x.productId, x.price]));
  const active = adm.products.filter((x) => x.isActive);
  const priced = active.filter((x) => Number(adm.todayPrices[x.id]) > 0).length;
  const desc = (isAdmin
    ? 'قیمت هر محصول تا ثبت قیمت جدید معتبر می‌ماند؛ دسته‌ها و تغییرات گروهی را از همین صفحه مدیریت کنید.'
    : 'قیمت هر محصول تا ثبت قیمت جدید معتبر می‌ماند؛ گروه محصول را در ویرایش محصول انتخاب کنید.') + ' خروجی اکسل شامل همهٔ محصولات (حتی غیرفعال) و فقط کد و نام است، نه پشتیبان قیمت، وضعیت یا سوابق.';
  host.innerHTML = admHead('receipt', isAdmin ? 'محصولات و قیمت‌ها' : 'کارتابل محصولات و قیمت‌ها', desc, adm.products.length,
    `${admSearchBox('admProdSearch', 'جستجوی نام یا کد سریع', adm.q)}
     <span class="adm-count">${fa(priced)} از ${fa(active.length)} محصول فعال قیمت مثبت دارند</span>
     <button class="btn btn-secondary" type="button" data-adm="prod-export">خروجی اکسل / قالب</button>
     <button class="btn btn-secondary" type="button" data-adm="prod-import">ورود از اکسل</button><input type="file" id="admProductExcel" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
     <button class="btn btn-secondary" type="button" data-adm="prod-print">${icon('receipt',16)} چاپ لیست قیمت</button>
     <button class="btn btn-primary" type="button" data-adm="prod-new">${icon('plus', 16)} محصول جدید</button>`)
    + `${priceGroupsHtml()}<div class="price-group-filter"><label for="priceGroupFilter">فیلتر گروه محصول</label><select id="priceGroupFilter"><option value="all">همهٔ محصولات</option><option value="none">بدون گروه</option>${adm.priceGroups.map(g=>`<option value="${admE(g.id)}">${admE(g.name)}</option>`).join('')}</select></div><div id="admList" class="adm-list"></div></section>`;
  $('#priceGroupFilter').addEventListener('change',()=>paintProducts());
  $('#admProdSearch').addEventListener('input', (e) => { adm.q = e.target.value; paintProducts(); });
  bindAdm('products', host);
  host.querySelector('#admProductExcel').addEventListener('change', async e=>{const file=e.target.files[0];e.target.value='';if(file) await admImportProducts(file);});
  paintProducts();
}
async function admImportProducts(file) {
 try {
  const rows=await productExcelRead(file);
  openModal('ورود محصولات از اکسل', `<p>${fa(rows.length)} ردیف خوانده شد. محصول جدید با واحد پیش‌فرض کیلوگرم ثبت می‌شود. کدهای موجود (حتی غیرفعال) تغییر نمی‌کنند و از آنها صرف‌نظر می‌شود؛ قیمت‌ها و سوابق حفظ می‌شوند.</p><p>کدهای تکراری در خود فایل یا داده نامعتبر باعث رد کل فایل می‌شوند.</p><p data-import-error role="alert" class="form-error"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-import-cancel>انصراف</button><button type="button" class="btn btn-primary" data-import-confirm>تأیید ورود</button></div>`);
  $('#modal [data-import-cancel]').onclick=closeModal;
  $('#modal [data-import-confirm]').onclick=async e=>{
   const button=e.currentTarget;button.disabled=true;
   try {
    const result=await api('/api/admin/products/import',{method:'POST',body:JSON.stringify({rows})});
    closeModal();await renderProductsPage();
    openModal('نتیجه ورود اکسل',`<p>${fa(result.added)} محصول جدید ثبت شد و ${fa(result.skipped.length)} کد موجود بدون تغییر باقی ماند.</p>${result.skipped.length?`<ul>${result.skipped.map(x=>`<li>${admE(x.quickCode)} — نام موجود: ${admE(x.existingName)}؛ نام فایل: ${admE(x.name)}</li>`).join('')}</ul>`:''}<div class="modal-actions"><button type="button" class="btn btn-primary" data-import-done>بستن</button></div>`);
    $('#modal [data-import-done]').onclick=closeModal;
   } catch(err){const error=$('#modal [data-import-error]');if(error)error.textContent=err.message;if(button.isConnected)button.disabled=false;}
  };
 }catch(err){toast(err.message);}
}
function priceGroupsHtml(){
 const groups=adm.priceGroups||[];
 return `<section class="price-groups" aria-label="گروه‌بندی و تغییر گروهی قیمت"><div class="price-groups-head"><div><h3>گروه‌بندی و تغییر گروهی قیمت</h3><p>فقط محصولات فعال عضو هر گروه تغییر می‌کنند. محصولات بدون گروه در تغییر گروهی شرکت نمی‌کنند. ابتدا قیمت همهٔ اعضا را ثبت کنید.</p></div><button type="button" class="btn btn-secondary" data-adm="price-group-new">افزودن گروه</button></div><div class="price-group-cards">${groups.map(g=>{
  const count=adm.products.filter(p=>p.isActive&&p.priceGroupId===g.id).length;
  return `<article class="price-group-card" data-price-group="${admE(g.id)}"><div class="price-group-title"><b>${admE(g.name)}</b><span>${fa(count)} محصول فعال</span><button type="button" class="btn btn-secondary btn-sm" data-adm="price-group-rename" data-id="${admE(g.id)}">تغییر نام</button><button type="button" class="btn btn-secondary btn-sm" data-adm="price-group-delete" data-id="${admE(g.id)}">حذف</button></div><div class="price-group-controls"><label>جهت تغییر<select data-group-direction aria-label="جهت تغییر ${admE(g.name)}"><option value="increase">افزایش</option><option value="decrease">کاهش</option></select></label><label>نوع تغییر<select data-group-mode aria-label="نوع تغییر ${admE(g.name)}"><option value="percent">درصد</option><option value="fixed">مبلغ ریالی</option></select></label><label>مقدار<input data-group-amount type="text" inputmode="decimal" placeholder="مثلاً ۱۰" aria-label="مقدار تغییر ${admE(g.name)}"></label><button type="button" class="btn btn-primary" data-adm="price-group-preview" data-id="${admE(g.id)}">پیش‌نمایش تغییر</button></div></article>`;
 }).join('')||'<p>هنوز گروهی ساخته نشده است؛ محصولات فعلی بدون گروه هستند.</p>'}</div></section>`;
}
async function priceGroupManage(action,id){
 const group=(adm.priceGroups||[]).find(g=>g.id===id);
 try{
  if(action==='price-group-delete'){
   if(!group||!confirm(`گروه «${group.name}» حذف شود؟ فقط گروه خالی قابل حذف است.`))return;
   await api('/api/admin/price-groups/'+encodeURIComponent(id),{method:'DELETE'});
  }else{
   const name=prompt(action==='price-group-new'?'نام گروه جدید:':'نام جدید گروه:',group?.name||'');if(!name?.trim())return;
   await api('/api/admin/price-groups'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body:JSON.stringify({name:name.trim()})});
  }
  toast('گروه‌ها به‌روزرسانی شدند.');await renderProductsPage();
 }catch(e){toast(e.message);}
}
async function previewPriceGroup(id,button){
 const card=button.closest('[data-price-group]');if(!card||button.disabled)return;
 const body={direction:card.querySelector('[data-group-direction]').value,mode:card.querySelector('[data-group-mode]').value,amount:en(card.querySelector('[data-group-amount]').value).replace(/٫/g,'.')};
 button.disabled=true;
 try{
  const preview=await api('/api/admin/price-groups/'+encodeURIComponent(id)+'/preview',{method:'POST',body:JSON.stringify(body)});
  const rows=preview.rows.map(r=>`<tr><td>${admE(r.quickCode)}</td><td>${admE(r.name)}</td><td>${r.before==null?'ثبت نشده':admE(admFormatPrice(r.before))}</td><td>${r.error?admE(r.error):admE(admFormatPrice(r.after))}</td></tr>`).join('');
  openModal('پیش‌نمایش تغییر قیمت گروه '+preview.group.name,`<div class="price-group-preview"><p>${preview.direction==='increase'?'افزایش':'کاهش'} ${admE(fa(preview.amount))} ${preview.mode==='percent'?'درصد':'ریال'} برای ${fa(preview.rows.length)} محصول فعال. اعداد به نزدیک‌ترین ریال گرد می‌شوند؛ فاکتورهای قبلی تغییر نمی‌کنند.</p><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>کد</th><th>محصول</th><th>قیمت فعلی (ریال)</th><th>قیمت جدید / خطا</th></tr></thead><tbody>${rows}</tbody></table></div>${preview.canApply?'':'<p class="form-error">ابتدا خطاهای همهٔ اقلام را برطرف کنید؛ هیچ تغییری اعمال نشده است.</p>'}<p data-price-group-error class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-adm-close>انصراف</button><button type="button" class="btn btn-primary" data-apply-price-group ${preview.canApply?'':'disabled'}>تأیید و ثبت قیمت‌های جدید</button></div></div>`);
  admBindClose();const host=$('#modal .price-group-preview'),apply=host.querySelector('[data-apply-price-group]');
  apply.onclick=async()=>{if(apply.disabled||!confirm('قیمت همهٔ محصولات نمایش‌داده‌شده تغییر کند؟'))return;apply.disabled=true;
   try{await api('/api/admin/price-groups/'+encodeURIComponent(id)+'/apply',{method:'POST',body:JSON.stringify({...body,token:preview.token})});closeModal();toast('قیمت‌های جدید ثبت شدند.');await renderProductsPage();}
   catch(e){if(host.isConnected){host.querySelector('[data-price-group-error]').textContent=e.message;apply.disabled=true;}}
  };
 }catch(e){toast(e.message);}finally{if(button.isConnected)button.disabled=false;}
}
function paintProducts() {
  const q = admNorm(adm.q), selected=$('#priceGroupFilter')?.value||'all';
  const rows = adm.products.filter((x) => (!q || admNorm(`${x.name} ${x.quickCode}`).includes(q))&&(selected==='all'||(selected==='none'?!x.priceGroupId:x.priceGroupId===selected)));
  $('#admList').innerHTML = admTable(['کد سریع', 'محصول', 'قیمت جاری (ریال)', 'عملیات'], rows.map((x) => `<tr class="adm-row adm-row-prod${x.isActive ? '' : ' is-inactive'}">
      <td data-label="کد سریع"><div class="adm-cell"><b class="cust-code">${admE(x.quickCode)}</b></div></td>
      <td data-label="محصول"><div class="adm-cell"><b>${admE(fa(x.name))}</b><span>واحد: ${admE(x.defaultUnit)} · گروه: ${admE((adm.priceGroups||[]).find(g=>g.id===x.priceGroupId)?.name||'بدون گروه')}</span></div></td>
      <td data-label="قیمت جاری (ریال)"><div class="adm-cell">
        <div class="adm-price"><input type="text" inputmode="numeric" data-price-for="${admE(x.id)}" aria-label="قیمت جاری ${admE(x.name)} (ریال)" value="${admE(admFormatPrice(adm.todayPrices[x.id] ?? ''))}" placeholder="مثلاً ۲۵۰٬۰۰۰" autocomplete="off">
        <button class="btn btn-primary btn-sm" type="button" data-adm="prod-price" data-id="${admE(x.id)}">ثبت قیمت</button></div></div></td>
      <td data-label="عملیات"><div class="adm-cell adm-actions">${admActiveBadge(x.isActive)}
        <button class="btn btn-secondary btn-sm" type="button" data-adm="prod-edit" data-id="${admE(x.id)}">${icon('edit', 14)} ویرایش</button>
        ${admIsCatalogAdmin() ? `<button class="btn btn-secondary btn-sm" type="button" data-adm="prod-delete" data-id="${admE(x.id)}">${icon('trash', 14)} حذف</button>` : ''}
      </div></td></tr>`), sdEmpty('receipt', 'محصولی پیدا نشد', 'محصول جدید ثبت کنید.'));
  admBindPriceInputs();
  // Enter در کادر قیمت = «ثبت قیمت»
  $$('[data-price-for]', $('#admList')).forEach((inp) => inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveProductPrice(inp.dataset.priceFor); }
  }));
}
// Printing is based on freshly saved prices, never on unsaved input values.
function openPriceListSelection(){
 const products=adm.products.filter(p=>p.isActive);
 if(!products.length)return toast('محصول فعالی برای چاپ وجود ندارد.');
 openModal('انتخاب اقلام لیست قیمت',`<div class="price-pick"><p>اقلام مورد نظر را انتخاب کنید. آخرین قیمت ثبت‌شده تا امروز چاپ می‌شود؛ با اقلام زیاد اندازهٔ نوشته کوچک‌تر خواهد شد.</p><div class="price-pick-controls"><input type="search" data-price-search placeholder="جستجوی نام یا کد" aria-label="جستجوی محصول"><button type="button" class="btn btn-secondary btn-sm" data-price-all>انتخاب همه</button><button type="button" class="btn btn-secondary btn-sm" data-price-none>حذف انتخاب‌ها</button><span data-price-count aria-live="polite"></span></div><div class="price-pick-list">${products.map(p=>`<label class="price-pick-item" data-price-row data-search="${admE(admNorm(p.name+' '+p.quickCode))}"><input type="checkbox" data-price-id="${admE(p.id)}" checked><span>${admE(fa(p.quickCode))} — ${admE(p.name)}</span><small>${admE(adm.todayPrices[p.id]==null?'قیمت ثبت نشده':admFormatPrice(adm.todayPrices[p.id])+' ریال')}</small></label>`).join('')}</div><p data-price-error role="alert" class="form-error"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-price-close>انصراف</button><button type="button" class="btn btn-primary" data-price-print>چاپ اقلام انتخاب‌شده</button></div></div>`);
 const box=$('#modal .price-pick'),checks=()=>[...box.querySelectorAll('[data-price-id]')];
 const update=()=>{box.querySelector('[data-price-count]').textContent=fa(checks().filter(x=>x.checked).length)+' قلم انتخاب شده';};
 box.querySelector('[data-price-search]').addEventListener('input',e=>{const q=admNorm(e.target.value);box.querySelectorAll('[data-price-row]').forEach(row=>row.hidden=!!q&&!row.dataset.search.includes(q));});
 box.querySelector('[data-price-all]').onclick=()=>{checks().forEach(c=>c.checked=true);update();};
 box.querySelector('[data-price-none]').onclick=()=>{checks().forEach(c=>c.checked=false);update();};
 box.addEventListener('change',update);box.querySelector('[data-price-close]').onclick=()=>closeModal();
 box.querySelector('[data-price-print]').onclick=async e=>{
  const ids=checks().filter(c=>c.checked).map(c=>c.dataset.priceId),error=box.querySelector('[data-price-error]');
  if(!ids.length){error.textContent='حداقل یک محصول را انتخاب کنید.';return;}
  e.currentTarget.disabled=true;error.textContent='';
  try{
   const day=admToday();const [p,pr]=await Promise.all([api('/api/admin/products'),api('/api/prices?date='+encodeURIComponent(day))]);
   if(!box.isConnected)return;if(admToday()!==day)throw Error('تاریخ تغییر کرده است؛ دوباره چاپ کنید.');
   const byId=new Map((p.products||[]).filter(x=>x.isActive).map(x=>[x.id,x]));
   if(ids.some(id=>!byId.has(id)))throw Error('فهرست محصولات تغییر کرده است؛ پنجره را ببندید و دوباره انتخاب کنید.');
   const prices=Object.fromEntries((pr.prices||[]).map(x=>[x.productId,x.price]));
   const rows=ids.map(id=>({...byId.get(id),price:prices[id]}));
   if(BTPrintFrame.html(BTPrintDigits.documentHtml(priceListHtml(rows,day))))closeModal();
  }catch(err){if(box.isConnected)error.textContent=err.message||'آماده‌سازی لیست ناموفق بود.';}
  finally{if(box.isConnected)e.currentTarget.disabled=false;}
 };
 update();
}
function priceListHtml(rows,day){
 const mid=Math.ceil(rows.length/2),groups=rows.length>20?[rows.slice(0,mid),rows.slice(mid)]:[rows];
 let index=0;
 const tables=groups.map(group=>`<table><colgroup><col class="pl-number"><col class="pl-name"><col class="pl-unit"><col class="pl-price"></colgroup><thead><tr><th>ردیف</th><th>محصول</th><th>واحد</th><th>قیمت (ریال)</th></tr></thead><tbody>${group.map(p=>`<tr><td>${fa(++index)}</td><td>${admE(p.name)}</td><td>${admE(p.defaultUnit||'—')}</td><td>${p.price==null?'ثبت نشده':admE(admFormatPrice(p.price))}</td></tr>`).join('')}</tbody></table>`).join('');
 return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>لیست قیمت محصولات</title><style>
 @page{size:A4 portrait;margin:10mm}html,body{margin:0;padding:0;font-family:Vazirmatn,Tahoma,sans-serif;color:#111}*{box-sizing:border-box}.pl-sheet{position:relative;width:190mm}.pl-content{position:absolute;top:0;right:0;width:190mm;transform-origin:top right}.pl-head{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:2px solid #333;padding:0 0 7px;margin:0 0 7px}.pl-head h1{font-size:16px;line-height:1.4;margin:0}.pl-date{white-space:nowrap;font-size:12px;font-weight:700}.pl-columns{display:flex;align-items:flex-start;gap:6px}.pl-columns table{flex:1 1 0;min-width:0;width:0;border-collapse:collapse;table-layout:fixed;font-size:10px;line-height:1.35}.pl-columns table:only-child{width:100%}th,td{border:1px solid #aaa;padding:3px 4px;text-align:right;overflow-wrap:anywhere}th{background:#eee}th:first-child,td:first-child{text-align:center}.pl-number{width:8%}.pl-name{width:47%}.pl-unit{width:18%}.pl-price{width:27%}tr{break-inside:avoid}
 </style></head><body><div class="pl-sheet"><div class="pl-content"><header class="pl-head"><h1>لیست قیمت محصولات کشتارگاه صنعتی بابل طیور</h1><span class="pl-date">تاریخ: ${admE(dateLabel(day))}</span></header><div class="pl-columns">${tables}</div></div></div><script src="/price-list-print-ready.js"><\/script></body></html>`;
}
function openProductForm(p) {
  openModal(p ? `ویرایش محصول ${p.name}` : 'محصول جدید', admModalForm('admProductForm', `<div class="cust-form-grid">
    <label class="cust-field"><span>کد سریع (دو رقمی) *</span><input name="quickCode" required inputmode="numeric" maxlength="2" pattern="\\d{2}" value="${admE(p?.quickCode)}"></label>
    <label class="cust-field"><span>واحد پیش‌فرض *</span><select name="defaultUnit">${ADM_UNITS.map((u) => `<option ${u === (p?.defaultUnit || 'کیلوگرم') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    <label class="cust-field cust-span2"><span>نام محصول *</span><input name="name" required maxlength="160" value="${admE(p?.name)}"></label>
    <label class="cust-field"><span>گروه تغییر قیمت</span><select name="priceGroupId"><option value="">بدون گروه</option>${(adm.priceGroups||[]).map(g=>`<option value="${admE(g.id)}" ${p?.priceGroupId===g.id?'selected':''}>${admE(g.name)}</option>`).join('')}</select></label>
    ${p ? `<label class="cust-field"><span>وضعیت</span><select name="isActive"><option value="true" ${p.isActive ? 'selected' : ''}>فعال</option><option value="false" ${!p.isActive ? 'selected' : ''}>غیرفعال</option></select></label>` : ''}
  </div>`, p ? 'ذخیره تغییرات' : 'ثبت محصول'));
  admBindClose();
  $('#admProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    if (b.isActive !== undefined) b.isActive = b.isActive === 'true';
    try {
      if (p) await api('/api/admin/products/' + p.id, { method: 'PUT', body: JSON.stringify(b) });
      else await api('/api/admin/products', { method: 'POST', body: JSON.stringify(b) });
      if (!p) adm.q = ''; // Show the newly created product even after a filtered search.
      toast(p ? 'محصول به‌روز شد.' : 'محصول ثبت شد.'); closeModal(); renderProductsPage();
    } catch (err) { $('#admFormMsg').textContent = err.message; }
  });
}
async function saveProductPrice(id) {
  const input = document.querySelector(`[data-price-for="${CSS.escape(id)}"]`);
  const price = admParsePrice(input?.value);
  if (!input || input.value === '' || !Number.isFinite(price) || price < 0) return toast('قیمت معتبر وارد کنید.');
  try {
    await api('/api/admin/prices', { method: 'POST', body: JSON.stringify({ productId: id, price, date: admToday() }) });
    adm.todayPrices[id] = price; input.value = admFormatPrice(price); toast('قیمت ثبت شد و تا تغییر بعدی معتبر است.');
    const act = adm.products.filter((x) => x.isActive); const cnt = $('#content .adm-count');
    if (cnt) cnt.textContent = `${fa(act.filter((x) => Number(adm.todayPrices[x.id]) > 0).length)} از ${fa(act.length)} محصول فعال قیمت مثبت دارند`;
    const row = input.closest('.adm-row'); if (row) { row.classList.add('is-saved'); setTimeout(() => row.classList.remove('is-saved'), 1600); }
  } catch (err) { toast(err.message); }
}
async function deleteProduct(id) {
  const p = adm.products.find((x) => x.id === id);
  if (!confirm(`محصول ${p?.name || ''} حذف شود؟`)) return;
  try { await api('/api/admin/products/' + id, { method: 'DELETE' }); toast('محصول حذف شد.'); renderProductsPage(); }
  catch (err) { toast(err.message); }
}

/* ---------- v37.50.0 — سوابق کامل سفارش‌ها (کارتابل مدیر) ----------
   فهرست همهٔ سفارش‌ها با جستجو و صفحه‌بندی؛ دکمهٔ «جزئیات سفارش» پروندهٔ کامل
   (نوع سفارش، اطلاعات کامل مشتری، اقلام و وزن‌کشی با نام کاربر، مراحل و همهٔ رویدادها)
   را از مسیر مدیریتی باز می‌کند. */
async function renderAdminOrdersHistory(q = '', offset = 0) {
  const host = $('#content'); if (!host) return;
  host.onclick = null;
  host.innerHTML = '<div class="empty">در حال دریافت سوابق سفارش‌ها…</div>';
  try {
    const d = await api(`/api/admin/orders?limit=25&offset=${offset}&q=${encodeURIComponent(q)}`);
    const rows = d.orders || [];
    const body = rows.map((o) => `<tr data-admin-order="${admE(o.id)}">
      <td data-label="شماره سفارش"><span class="bt-cell-main">${admE(fa(o.orderNo || '—'))}</span><span class="bt-cell-sub">${admE(o.orderTypeLabel || '')}</span></td>
      <td data-label="مشتری / فروشگاه"><span class="bt-cell-main">${admE(o.name || o.customerName || '—')}</span><span class="bt-cell-sub" dir="ltr">${admE(fa(o.phone || ''))}</span></td>
      <td data-label="ثبت سفارش"><span class="bt-cell-main">${admE(dt(o.createdAt))}</span><span class="bt-cell-sub">ثبت‌کننده: ${admE(o.createdByName || '—')}</span></td>
      <td data-label="آخرین اقدام"><span class="bt-cell-main">${admE(dt(o.updatedAt || o.createdAt))}</span>${o.warehouseCompletedAt ? `<span class="bt-cell-sub">وزن نهایی انبار: ${admE(dt(o.warehouseCompletedAt))}</span>` : ''}</td>
      <td data-label="وضعیت">${badge(o.status)}</td>
      <td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-admin-order-history="${admE(o.id)}">${icon('eye', 14)} جزئیات سفارش</button></td>
    </tr>`).join('');
    host.innerHTML = admHead('history', 'سوابق کامل سفارش‌ها', 'همهٔ سفارش‌ها از زمان ثبت تا پایان کار؛ با جزئیات کامل مشتری، اقلام، وزن‌کشی و کاربر ثبت‌کنندهٔ هر مرحله.', Number(d.total || rows.length))
      + `<form id="admOrderSearch" class="adm-toolbar"><div class="input-shell adm-search"><span>${icon('search', 16)}</span><input name="q" value="${admE(q)}" placeholder="نام مشتری، تلفن، شماره سفارش یا فاکتور" aria-label="جستجو در سوابق سفارش‌ها" autocomplete="off"></div><button class="btn btn-primary" type="submit">جستجو</button></form>`
      + `<div class="adm-count">${fa(offset + 1)}–${fa(Math.min(Number(d.total || 0), offset + rows.length))} از ${fa(d.total || 0)} سفارش</div>`
      + `<div id="admList" class="bt-table-wrap"><table class="bt-table adm-orders-table"><caption class="bt-caption">سوابق کامل سفارش‌ها</caption><thead><tr><th scope="col">شماره سفارش</th><th scope="col">مشتری / فروشگاه</th><th scope="col">ثبت سفارش</th><th scope="col">آخرین اقدام</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>${body || `<tr><td colspan="6">${sdEmpty('history', 'سفارشی یافت نشد', 'عبارت جستجو را تغییر دهید.')}</td></tr>`}</tbody></table></div>`
      + `<div class="sales-history-pages"><button type="button" class="btn btn-secondary" data-orders-offset="${Math.max(0, offset - 25)}" ${offset === 0 ? 'disabled' : ''}>صفحه قبل</button><button type="button" class="btn btn-secondary" data-orders-offset="${offset + 25}" ${offset + 25 >= Number(d.total || 0) ? 'disabled' : ''}>صفحه بعد</button></div></section>`;
    bindAdm('orders-history', host); // پیوند «جزئیات سفارش» را به پروندهٔ کامل وصل می‌کند
    host.querySelector('#admOrderSearch').onsubmit = (e) => { e.preventDefault(); renderAdminOrdersHistory(e.currentTarget.elements.q.value.trim(), 0); };
    host.querySelectorAll('[data-orders-offset]').forEach((button) => button.addEventListener('click', () => renderAdminOrdersHistory(q, Number(button.dataset.ordersOffset) || 0)));
  } catch (e) { host.innerHTML = `<div class="form-error">${admE(e.message)}</div>`; }
}

/* ---------- تاریخچه فعالیت‌ها ---------- */
async function renderActivityPage() {
  const u = await api('/api/admin/users');
  adm.users = u.users || [];
  $('#content').innerHTML = admHead('fingerprint', 'تاریخچه فعالیت‌ها', 'کلیه ورود، ثبت، ویرایش و حذف کاربران با زمان، IP و جزئیات. هر رکورد در زنجیره‌ی هش ثبت می‌شود و قابل ردیابی است.', undefined,
    `<select id="actUser" class="adm-select"><option value="">همه کاربران</option>${adm.users.map((x) => `<option value="${admE(x.username)}">${admE(x.fullName)} (${admE(x.username)})</option>`).join('')}</select>
     <select id="actEntity" class="adm-select"><option value="">همه موجودیت‌ها</option>${ADM_ENTITIES.map((x) => `<option value="${admE(x)}">${admE(admEntityLabel(x))}</option>`).join('')}</select>
     <label class="adm-date"><span>از</span><input type="date" id="actFrom"></label>
     <label class="adm-date"><span>تا</span><input type="date" id="actTo"></label>
     ${admSearchBox('actText', 'جستجو در عملیات یا جزئیات', '')}
     <button class="btn btn-secondary" type="button" data-adm="act-refresh">${icon('refresh', 16)} اعمال فیلتر</button>`)
    + `<div id="actCount" class="adm-count"></div><div id="admList" class="adm-list"></div></section>`;
  ['actUser', 'actEntity', 'actFrom', 'actTo'].forEach((id) => $('#' + id).addEventListener('change', loadActivity));
  $('#actText').addEventListener('input', paintActivity);
  bindAdm('activity');
  loadActivity();
}
async function loadActivity() {
  const p = new URLSearchParams({ limit: '500' });
  const pick = (id, key) => { const v = $('#' + id)?.value; if (v) p.set(key, v); };
  pick('actUser', 'username'); pick('actEntity', 'entityType'); pick('actFrom', 'from'); pick('actTo', 'to');
  try { const d = await api('/api/admin/audit?' + p.toString()); adm.activity = d.audit || []; paintActivity(); }
  catch (err) { $('#admList').innerHTML = `<div class="form-error">${admE(err.message)}</div>`; }
}
/* v37.3 — نمایش فارسی کد عملیات و نوع موجودیت (کد انگلیسی فقط به‌صورت ریز برای پشتیبانی) */
const ADM_ENTITY_LABELS = { user: 'کاربر', order: 'سفارش', order_item: 'قلم سفارش', visit: 'مراجعه', customer: 'مشتری', product: 'محصول', price: 'قیمت', driver: 'راننده', vehicle: 'وسیله نقلیه', weighTrip: 'تردد باسکول', weighTicket: 'قبض باسکول', settings: 'تنظیمات', report: 'گزارش', payment: 'پرداخت', weighbridge: 'باسکول' };
const ADM_ACTION_EXTRA = { PRODUCT_DELETED: 'حذف محصول', CUSTOMER_DELETED: 'حذف مشتری', UPDATE_CUSTOMER: 'ویرایش مشتری', CREATE_CUSTOMER: 'ایجاد مشتری', DRIVER_CREATED: 'ایجاد راننده', DRIVER_UPDATED: 'ویرایش راننده', DRIVER_DELETED: 'حذف راننده', REPORT_QUERY: 'اجرای گزارش', RETURN_RECEIVED: 'دریافت مرجوعی', RETURN_REFERRED_TO_WAREHOUSE: 'ارجاع مرجوعی به انبار', DISPATCH_PRICE_APPROVE: 'تأیید قیمت پخش', WB_VEHICLE_CREATED: 'ثبت وسیله در باسکول', WB_TRIP_CANCELLED: 'لغو تردد باسکول', WB_TICKET_SETTINGS_UPDATED: 'ویرایش تنظیمات قبض باسکول', WB_ENTRY_WEIGHED: 'توزین ورود', WB_EXIT_WEIGHED: 'توزین خروج' };
function admActionLabel(code) { return (typeof AUDIT_LABELS !== 'undefined' && AUDIT_LABELS[code]) || ADM_ACTION_EXTRA[code] || code || '—'; }
function admEntityLabel(t) { return t ? (ADM_ENTITY_LABELS[t] || t) : '—'; }
function paintActivity() {
  const q = admNorm($('#actText')?.value || '');
  const rows = adm.activity.filter((a) => !q || admNorm(`${a.action} ${admActionLabel(a.action)} ${admEntityLabel(a.entityType)} ${a.username} ${JSON.stringify(a.details || {})}`).includes(q));
  $('#actCount').textContent = `${fa(rows.length)} رکورد`;
  $('#admList').innerHTML = admTable(['زمان','کاربر','عملیات','موجودیت','جزئیات'],rows.map((a)=>`<tr class="adm-row"><td data-label="زمان">${dt(a.createdAt)}</td><td data-label="کاربر"><b dir="ltr">${admE(a.username||'سیستم')}</b><br><span dir="ltr">${admE(a.ip||'')}</span></td><td data-label="عملیات"><b>${admE(admActionLabel(a.action))}</b><br><span dir="ltr">${admE(a.action)}</span></td><td data-label="موجودیت"><b>${admE(admEntityLabel(a.entityType))}</b><br><span dir="ltr">${admE(a.entityId?String(a.entityId).slice(0,12):'')}</span></td><td data-label="جزئیات"><details><summary>نمایش جزئیات</summary><div class="adm-detail">${(a.entityType==='order'&&a.entityId)||(a.entityType==='order_item'&&a.details?.orderId)?`<button type="button" class="btn btn-secondary btn-sm" data-admin-order-history="${admE(a.entityType==='order'?a.entityId:a.details.orderId)}">${icon('eye',14)} نمایش مسیر کامل سفارش</button>`:''}<div><small>شناسه‌ی کامل موجودیت</small><code dir="ltr">${admE(a.entityId||'—')}</code></div><div><small>مرورگر</small><code dir="ltr">${admE(a.userAgent||'—')}</code></div><div><small>جزئیات</small><pre dir="ltr">${admE(JSON.stringify(a.details||{},null,2))}</pre></div><div><small>شماره‌ی ردیف و هش</small><code dir="ltr">#${fa(a.seq||0)} • ${admE(String(a.hash||'').slice(0,24))}…</code></div></div></details></td></tr>`),sdEmpty('fingerprint','فعالیتی پیدا نشد','فیلترها را تغییر دهید.'));
}

/* ---------- گزارش پیشرفته ---------- */
async function renderReportsPage(unit = null) {
  const scope = unit || 'admin';
  const base = unit ? `/api/unit-reports/${encodeURIComponent(unit)}` : '/api/admin/reports';
  if (adm.reportScope !== scope) { adm.reportDraft = null; adm.report = null; adm.reportScope = scope; }
  adm.reportBase = base;
  const d = await api(`${base}/sources`);
  adm.sources = d.sources || [];
  if (!adm.reportDraft) adm.reportDraft = { source: adm.sources[0]?.key, from: '', to: '', fields: null, filters: [] };
  $('#content').innerHTML = admHead('reports', unit ? `گزارش مستقل ${ROLE[unit] || unit}` : 'گزارش‌های پیشرفته', 'از هر بخش سامانه گزارش بسازید، ستون‌ها و فیلترهای دلخواه را انتخاب کنید و فایل Excel یا PDF بگیرید.', undefined) + `
    <div class="adm-report">
      <div class="adm-rep-side">
        <label class="cust-field"><span>منبع داده</span><select id="repSource">${adm.sources.map((s) => `<option value="${s.key}" ${s.key === adm.reportDraft.source ? 'selected' : ''}>${admE(s.label)}</option>`).join('')}</select></label>
        <div id="repDate"></div>
        <div class="adm-rep-block"><b>ستون‌ها</b><div id="repFields" class="adm-checks"></div></div>
        <div class="adm-rep-block"><b>فیلترها</b><div id="repFilters"></div><button class="btn btn-secondary btn-sm" type="button" data-adm="rep-add-filter">${icon('plus', 14)} افزودن فیلتر</button></div>
        <button class="btn btn-primary btn-lg adm-full" type="button" data-adm="rep-run">${icon('reports', 16)} اجرای گزارش</button>
        ${admMsgBox('repMsg')}
      </div>
      <div class="adm-rep-main">
        <div class="adm-rep-bar"><div id="repSummary" class="adm-count">هنوز گزارشی اجرا نشده است.</div>
          <div class="toolbar"><button class="btn btn-secondary btn-sm" type="button" data-adm="rep-csv">Excel (CSV کامل)</button><button class="btn btn-secondary btn-sm" type="button" data-adm="rep-print">چاپ / PDF</button></div></div>
        <div id="repResult" class="adm-rep-result"><div class="adm-report-placeholder">${sdEmpty('reports', 'گزارشی اجرا نشده است', 'منبع، ستون‌ها و فیلترهای دلخواه را انتخاب و گزارش را اجرا کنید.')}</div></div>
      </div>
    </div></section>`;
  $('#repSource').addEventListener('change', (e) => { adm.reportDraft = { source: e.target.value, from: '', to: '', fields: null, filters: [] }; adm.report = null; renderReportsPage(unit); });
  paintReportControls();
  bindAdm('reports');
}
function curSource() { return adm.sources.find((s) => s.key === adm.reportDraft.source); }
function paintReportControls() {
  const s = curSource(); const dr = adm.reportDraft;
  if (!s) return;
  $('#repDate').innerHTML = s.dateField
    ? `<div class="adm-rep-block"><b>بازه تاریخ</b><small>بر اساس «${admE(s.columns.find((c) => c.key === s.dateField)?.label || '')}»</small>
        <div class="adm-date-pair"><label class="adm-date"><span>از</span><input type="date" id="repFrom" value="${admE(dr.from)}"></label><label class="adm-date"><span>تا</span><input type="date" id="repTo" value="${admE(dr.to)}"></label></div></div>`
    : `<small class="adm-note">این منبع تاریخ ندارد.</small>`;
  const sel = dr.fields || s.columns.map((c) => c.key);
  $('#repFields').innerHTML = s.columns.map((c) => `<label class="adm-check"><input type="checkbox" data-rep-field="${c.key}" ${sel.includes(c.key) ? 'checked' : ''}> ${admE(c.label)}</label>`).join('');
  $('#repFilters').innerHTML = dr.filters.map((f, i) => `<div class="adm-filter">
      <select aria-label="ستون فیلتر ${fa(i+1)}" data-rep-f="field" data-i="${i}">${s.columns.map((c) => `<option value="${c.key}" ${c.key === f.field ? 'selected' : ''}>${admE(c.label)}</option>`).join('')}</select>
      <select aria-label="شرط فیلتر ${fa(i+1)}" data-rep-f="op" data-i="${i}">${[['contains', 'شامل'], ['equals', 'برابر'], ['gte', 'بزرگ‌تر یا برابر'], ['lte', 'کوچک‌تر یا برابر']].map(([v, l]) => `<option value="${v}" ${v === f.op ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input aria-label="مقدار فیلتر ${fa(i+1)}" data-rep-f="value" data-i="${i}" value="${admE(f.value)}" placeholder="مقدار">
      <button class="btn btn-secondary btn-sm" type="button" data-adm="rep-del-filter" data-i="${i}">${icon('close', 14)}</button></div>`).join('') || '<small class="adm-note">فیلتری اضافه نشده است.</small>';
  // کنترل‌ها را به پیش‌نویس وصل کن
  $('#repFrom')?.addEventListener('change', (e) => { dr.from = e.target.value; });
  $('#repTo')?.addEventListener('change', (e) => { dr.to = e.target.value; });
  document.querySelectorAll('[data-rep-field]').forEach((cb) => cb.addEventListener('change', () => {
    const picked = [...document.querySelectorAll('[data-rep-field]:checked')].map((x) => x.dataset.repField);
    dr.fields = picked;
  }));
  document.querySelectorAll('[data-rep-f]').forEach((el) => el.addEventListener('change', () => {
    const f = dr.filters[Number(el.dataset.i)]; if (f) f[el.dataset.repF] = el.value;
  }));
  document.querySelectorAll('#repFilters input[data-rep-f="value"]').forEach((el) => el.addEventListener('input', () => {
    const f = dr.filters[Number(el.dataset.i)]; if (f) f.value = el.value;
  }));
}
function readReportDraft() {
  const dr = adm.reportDraft;
  dr.from = $('#repFrom')?.value || ''; dr.to = $('#repTo')?.value || '';
  dr.fields = [...document.querySelectorAll('[data-rep-field]:checked')].map((x) => x.dataset.repField);
  dr.filters = dr.filters.filter((f) => String(f.value || '').trim() !== '');
  return dr;
}
async function runReport() {
  const dr = readReportDraft();
  $('#repMsg').textContent = '';
  if (!dr.fields.length) { $('#repMsg').textContent = 'حداقل یک ستون انتخاب کنید.'; return; }
  try {
    const r = await api(`${adm.reportBase}/query`, { method: 'POST', body: JSON.stringify(dr) });
    adm.report = r; adm.reportQuery=JSON.parse(JSON.stringify(dr));
    $('#repSummary').textContent = `${fa(r.total)} ردیف یافت شد؛ نمایش ${fa(Math.min(r.rows.length,300))} ردیف اول. خروجی CSV کامل براساس همین فیلترها از سرور دریافت می‌شود.`;
    const shown = r.rows.slice(0, 300);
    $('#repResult').innerHTML = shown.length ? `<div class="adm-table-wrap bt-table-wrap"><table class="adm-table bt-table adm-report-table"><caption class="bt-caption">نتیجه گزارش</caption><thead><tr>${r.columns.map((c) => `<th>${admE(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((row) => `<tr>${r.columns.map((c) => `<td data-label="${admE(c.label)}">${/plate/i.test(c.key)?plateViewHtml(row[c.key],'—',true):admE(fmtRepCell(c.key, row[c.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : sdEmpty('reports', 'نتیجه‌ای یافت نشد', 'بازه‌ی تاریخ یا فیلترها را تغییر دهید.');
  } catch (err) { $('#repMsg').textContent = err.message; }
}
function fmtRepCell(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (['createdAt', 'verifiedAt', 'lastVisitAt', 'scheduledAt', 'lastActivityAt'].includes(key)) return dt(v);
  if (key === 'totalAmount' || key === 'currentPrice') return Number(v).toLocaleString('fa-IR');
  return String(v);
}
async function exportReportCsv() {
  const r=adm.report,q=adm.reportQuery;if(!r||!q)return toast('ابتدا گزارش را اجرا کنید.');
  if(adm.exportBusy)return;adm.exportBusy=true;
  const button=document.querySelector('[data-adm="rep-csv"]');if(button){button.disabled=true;button.textContent='در حال دریافت خروجی کامل…';}
  try{
    const response=await fetch(`${adm.reportBase}/export`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)});
    if(!response.ok){const error=await response.json().catch(()=>({}));if(response.status===401)handleSessionExpired();throw new Error(error.error||'دریافت گزارش انجام نشد.');}
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`gozaresh-${r.source}-${admToday()}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    toast(`خروجی کامل شامل ${fa(response.headers.get('X-Report-Rows')||'')} ردیف دریافت شد.`);
  }catch(err){toast(err.message||'اتصال شبکه را بررسی کنید؛ خروجی ناقص دانلود نشد.');}
  finally{adm.exportBusy=false;if(button?.isConnected){button.disabled=false;button.textContent='Excel (CSV کامل)';}}
}
function printReport() {
  const r = adm.report; if (!r) return toast('ابتدا گزارش را اجرا کنید.');
  BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>گزارش ${admE(r.label)}</title>
    <style>body{font-family:Tahoma,sans-serif;margin:24px;color:#151a21}h1{font-size:18px;margin:0 0 4px;color:#b40f23}p{margin:0 0 12px;font-size:12px;color:#555}
    table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:5px 6px;text-align:right;vertical-align:top}th{background:#f4f5f7}
    .iran-plate{display:inline-grid;direction:ltr;grid-template-columns:14px 29px 22px 33px 22px;border:1px solid #1c2733;border-radius:4px;overflow:hidden;height:26px;vertical-align:middle;background:white;color:#111;font-weight:bold}
    .iran-plate .blue-strip{background:#0d5a9c;color:white;display:grid;place-items:center;font-size:6px;line-height:1;text-align:center}
    .iran-plate .plate-part{display:grid;place-items:center;border-left:1px solid #ccd1d8;font-size:11px}.iran-plate .plate-code{background:#eef2f7}
    .iran-plate.is-motor{grid-template-columns:14px 45px;grid-template-rows:1fr 1fr}.iran-plate.is-motor .blue-strip{grid-column:1;grid-row:1}.iran-plate.is-motor .motor-top{grid-column:2;grid-row:1}.iran-plate.is-motor .motor-bottom{grid-column:1 / span 2;grid-row:2;border-top:1px solid #ccd1d8}.iran-plate.is-motor .plate-part{font-size:9px}
    .iran-plate-legacy{display:inline-block;border:1px solid #333;border-left:4px solid #0d5a9c;padding:3px;overflow-wrap:anywhere}
    @page{size:A4 landscape;margin:12mm}</style></head><body><h1>${admE(r.label)} — بابل طیور</h1>
    <p>${fa(r.rows.length)} ردیف در این چاپ از ${fa(r.total)} ردیف${r.truncated?' — این چاپ محدود است؛ برای همه ردیف‌ها CSV کامل را دریافت کنید.':''} • تاریخ چاپ: ${admE(admToday())}</p>
    <table><thead><tr>${r.columns.map((c) => `<th>${admE(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${r.rows.map((row) => `<tr>${r.columns.map((c) => `<td>${/plate/i.test(c.key)?plateViewHtml(row[c.key],'—',true):admE(fmtRepCell(c.key, row[c.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <script src="/print-ready.js"><\/script></body></html>`));
}

async function renderPaymentDevicesPage(){
 const d=await api('/api/admin/payment-devices');adm.paymentDevices=d.devices||[];
 $('#content').innerHTML=admHead('receipt','دستگاه‌های پوز','تعریف چند دستگاه و نگهداری سوابق؛ فقط دستگاه‌های فعال در فرم‌های تسویه قابل انتخاب هستند.',adm.paymentDevices.length,`<button class="btn btn-primary" data-adm="pos-new">＋ افزودن دستگاه پوز</button>`)+`<div class="notice">شماره پایانه باید یکتا باشد. برای دستگاه بی‌سیم شماره سیم‌کارت الزامی است. برای حفظ تاریخچه، دستگاه استفاده‌شده را غیرفعال کنید، نه حذف.</div><div id="posList" class="adm-list">${admTable(['دستگاه','پایانه','بانک و مدل','اتصال','وضعیت','عملیات'],adm.paymentDevices.map(x=>`<tr class="adm-row"><td data-label="دستگاه">${admE(x.title)}</td><td data-label="پایانه">${admE(fa(x.terminalNumber))}</td><td data-label="بانک و مدل">${admE(x.bank)} • ${admE(x.model)}</td><td data-label="اتصال">${x.connection==='wireless'?'بی‌سیم':'سیمی'} • ${admE(x.simNumber||'—')}</td><td data-label="وضعیت">${admActiveBadge(x.isActive)}</td><td data-label="عملیات"><div class="adm-cell adm-actions"><button class="btn btn-secondary btn-sm" data-adm="pos-edit" data-id="${admE(x.id)}">ویرایش</button><button class="btn btn-secondary btn-sm" data-adm="pos-toggle" data-id="${admE(x.id)}" data-active="${!x.isActive}">${x.isActive?'غیرفعال‌سازی':'فعال‌سازی'}</button></div></td></tr>`),'<div class="empty">دستگاهی تعریف نشده است.</div>')}</div></section>`;
 bindAdm('payment-devices');
}
function openPaymentDeviceForm(device){const d=device||{};const body=`<div class="fields"><label class="cust-field"><span>عنوان دستگاه *</span><input name="title" required maxlength="80" value="${admE(d.title||'')}"></label><label class="cust-field"><span>شماره پایانه *</span><input name="terminalNumber" required maxlength="40" value="${admE(d.terminalNumber||'')}" dir="ltr"></label><label class="cust-field"><span>بانک مقصد *</span><input name="bank" required maxlength="80" value="${admE(d.bank||'')}"></label><label class="cust-field"><span>مدل دستگاه *</span><input name="model" required maxlength="80" value="${admE(d.model||'')}"></label><label class="cust-field"><span>نوع اتصال</span><select name="connection"><option value="wired" ${d.connection!=='wireless'?'selected':''}>سیمی</option><option value="wireless" ${d.connection==='wireless'?'selected':''}>بی‌سیم</option></select></label><label class="cust-field" id="posSimWrap" ${d.connection==='wireless'?'':'hidden'}><span>شماره سیم‌کارت *</span><input name="simNumber" maxlength="20" value="${admE(d.simNumber||'')}" dir="ltr" placeholder="09…"></label>${device?`<label class="adm-check"><input type="checkbox" name="isActive" ${d.isActive?'checked':''}> دستگاه فعال</label>`:''}</div>`;openModal(device?'ویرایش دستگاه پوز':'تعریف دستگاه پوز',admModalForm('posDeviceForm',body,device?'ذخیره تغییرات':'ثبت دستگاه'));admBindClose();const form=$('#posDeviceForm');form.querySelector('[name=connection]').onchange=e=>{form.querySelector('#posSimWrap').hidden=e.target.value!=='wireless'};form.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(form));b.isActive=form.querySelector('[name=isActive]')?.checked??true;try{await api('/api/admin/payment-devices'+(device?'/'+device.id:''),{method:device?'PUT':'POST',body:JSON.stringify(b)});toast('دستگاه ذخیره شد.');closeModal();renderPaymentDevicesPage()}catch(err){$('#admFormMsg').textContent=err.message}};}

/* دارایی‌های ترابری و شعب، مستقل از حساب‌های کاربران */
async function renderResourcePage(kind){
 const vehicle=kind==='vehicle', endpoint=vehicle?'transport-vehicles':'store-branches';
 const data=await api('/api/admin/'+endpoint); const rows=vehicle?data.vehicles:data.branches;
 adm.resources=rows; adm.resourceKind=kind;
 $('#content').innerHTML=admHead(vehicle?'truck':'store',vehicle?'خودروهای ترابری':'شعب فروشگاه',vehicle?'خودروها را جداگانه تعریف کنید؛ خودروی باسکول از این فهرست مستقل است.':'شمارهٔ شعبه مبنای شماره‌گذاری سفارش‌های فروشگاه است.',rows.length,`<button class="btn btn-primary" data-adm="resource-new">＋ افزودن</button>`)+`<div class="notice">${vehicle?'پس از تعریف، خودرو را در حساب راننده انتخاب کنید.':'پس از تعریف، شعبه را در حساب فروشگاه انتخاب کنید. حساب‌های قدیمی خودکار ادغام نمی‌شوند.'}</div><div class="adm-list">${admTable([vehicle?'خودرو':'شعبه','وضعیت','عملیات'],rows.map(x=>`<tr class="adm-row"><td data-label="${vehicle?'خودرو':'شعبه'}"><b>${admE(vehicle?x.vehicleType:x.name)}</b> ${vehicle?plateViewHtml(x.plate,'—',true):x.name==='فروشگاه شعبه 1 حمزه کلا'?'':`<span>${admE('شعبه '+fa(x.branchNo))}</span>`}</td><td data-label="وضعیت">${admActiveBadge(x.isActive)}</td><td data-label="عملیات"><button class="btn btn-secondary btn-sm" data-adm="resource-edit" data-id="${admE(x.id)}">ویرایش</button></td></tr>`),'<div class="empty">هنوز موردی تعریف نشده است.</div>')}</div></section>`;
 bindAdm(endpoint);
}
function openResourceForm(item){
 const vehicle=adm.resourceKind==='vehicle', x=item||{};
 const fields=vehicle?`<label class="cust-field"><span>نوع خودرو *</span><input name="vehicleType" list="resourceVehicleTypes" required maxlength="60" value="${admE(x.vehicleType)}" placeholder="مثلاً وانت"><datalist id="resourceVehicleTypes"><option value="وانت"></option><option value="کامیون"></option><option value="کامیونت"></option><option value="موتورسیکلت"></option><option value="پژو"></option></datalist></label><div class="cust-field"><span>پلاک *</span>${plateEditorHtml(x.plate||'',x.vehicleType||'')}</div>`:`<label class="cust-field"><span>نام شعبه *</span><input name="name" required maxlength="120" value="${admE(x.name)}"></label><label class="cust-field"><span>شماره شعبه (۱ تا ۵۹) *</span><input name="branchNo" type="number" min="1" max="59" required value="${admE(x.branchNo)}"><small>برای حساب متصل، شماره شعبه دیگر قابل تغییر نیست.</small></label>`;
 openModal(item?'ویرایش':'تعریف مورد جدید',admModalForm('resourceForm',`<div class="cust-form-grid">${fields}${item?`<label class="adm-check"><input name="isActive" type="checkbox" ${x.isActive?'checked':''}> فعال</label>`:''}</div>`,item?'ذخیره':'ثبت'));
 admBindClose(); const form=$('#resourceForm');if(vehicle)bindPlateEditor(form);form.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(form));if(item)b.isActive=!!form.elements.isActive.checked;const path=vehicle?'transport-vehicles':'store-branches';try{if(vehicle)b.plate=plateEditorValue(form,{required:true});await api('/api/admin/'+path+(item?'/'+encodeURIComponent(item.id):''),{method:item?'PUT':'POST',body:JSON.stringify(b)});closeModal();toast('اطلاعات ثبت شد.');await renderResourcePage(adm.resourceKind)}catch(err){$('#admFormMsg').textContent=err.message}};
}

/* ---------- اتصال رویدادها ---------- */
function admNorm(v) { return en(String(v || '')).toLowerCase().replace(/\s+/g, ' ').trim(); }
function bindAdm(page, root = $('#content')) {
  const c = root;
  c.onclick = async (e) => {
    const orderHistory = e.target.closest('[data-admin-order-history]');
    if (orderHistory) { e.preventDefault(); return openSalesHistory(orderHistory.dataset.adminOrderHistory); }
    const el = e.target.closest('[data-adm]'); if (!el) return;
    const a = el.dataset.adm, id = el.dataset.id;
    const find = (arr) => arr.find((x) => x.id === id);
    if (a === 'resource-new') return openResourceForm(null);
    if (a === 'resource-edit') return openResourceForm(find(adm.resources));
    if (a === 'pos-new') return openPaymentDeviceForm(null);
    if (a === 'pos-edit') return openPaymentDeviceForm(adm.paymentDevices.find(x=>x.id===id));
    if (a === 'pos-toggle') { const d=adm.paymentDevices.find(x=>x.id===id);if(!d)return;try{await api('/api/admin/payment-devices/'+id,{method:'PUT',body:JSON.stringify({...d,isActive:el.dataset.active==='true'})});toast('وضعیت دستگاه به‌روزرسانی شد.');return renderPaymentDevicesPage()}catch(err){return toast(err.message)} }
    if (a === 'user-new') return openUserForm(null);
    if (a === 'user-edit') return openUserForm(find(adm.users));
    if (a === 'user-delete') return deleteUser(id);
    if (a === 'drv-edit') return openDriverForm(find(adm.drivers));
    if (a === 'drv-delete') return deleteDriver(id);
    if (a === 'drv-tab') { adm.tab = el.dataset.tab; return renderDriversPage(); }
    if (a === 'drv-records') { adm.recDriver = id; adm.recFrom = ''; adm.recTo = ''; adm.tab = 'records'; return renderDriversPage(); }
    if (a === 'rec-today') { adm.recFrom = drvTodayKey(); adm.recTo = adm.recFrom; return renderDriverRecords(); }
    if (a === 'drv-sign') return showDriverSignature(id);
    if (a === 'price-group-new' || a === 'price-group-rename' || a === 'price-group-delete') return priceGroupManage(a,id);
    if (a === 'price-group-preview') return previewPriceGroup(id,el);
    if (a === 'prod-import') return c.querySelector('#admProductExcel').click();
    if (a === 'prod-export') { try { await productExcelExport(adm.products); } catch(err) { toast('ساخت فایل اکسل ناموفق بود: '+err.message); } return; }
    if (a === 'prod-print') return openPriceListSelection();
    if (a === 'prod-new') return openProductForm(null);
    if (a === 'prod-edit') return openProductForm(find(adm.products));
    if (a === 'prod-delete') return deleteProduct(id);
    if (a === 'prod-price') return saveProductPrice(id);
    if (a === 'act-refresh') return loadActivity();
    if (a === 'rep-add-filter') { readReportDraft(); adm.reportDraft.filters.push({ field: curSource().columns[0].key, op: 'contains', value: '' }); return paintReportControls(); }
    if (a === 'rep-del-filter') { readReportDraft(); adm.reportDraft.filters.splice(Number(el.dataset.i), 1); return paintReportControls(); }
    if (a === 'rep-run') return runReport();
    if (a === 'rep-csv') return exportReportCsv();
    if (a === 'rep-print') return printReport();
  };
  if (page === 'users') { /* دکمه‌ها از onclick بالا */ }
}

// کارت‌های ستون قرمز را از نوار ناوبری مدیر می‌سازد
function adminNavItems() {
  return [
    ['dashboard', 'داشبورد', 'dashboard'], ['gate', 'نگهبانی', 'gate'], ['sales', 'فروش', 'sales'], ['warehouse', 'انبار', 'warehouse'], 
    ['users', 'کاربران', 'users'], ['drivers', 'ترابری', 'truck'], ['customers', 'مشتریان', 'user'], ['products', 'محصولات', 'receipt'], ['payment-devices', 'دستگاه‌های پوز', 'receipt'],
    ['activity', 'تاریخچه', 'fingerprint'], ['reports', 'گزارش‌ها', 'reports'],
  ];
}

// مدیریت نسخه‌های پشتیبان SQLite؛ فقط مدیر. بازیابی، تمام داده‌های فعلی را جایگزین می‌کند.
async function renderBackupsPage() {
  const { backups, schedule, automaticCount } = await api('/api/admin/backups');
  $('#content').innerHTML = admHead('backups', 'پشتیبان‌گیری و بازیابی', 'ساخت، بارگذاری و بازیابی نسخهٔ پشتیبان داده‌ها.', undefined) + `
    <div class="adm-report adm-backup-layout"><div class="adm-rep-side">
      <form id="auto-backup-form" class="auto-backup-settings">
        <h3>پشتیبان‌گیری خودکار ساعتی</h3>
        <label class="auto-backup-toggle"><input type="checkbox" name="enabled" ${schedule.enabled?'checked':''}> فعال‌سازی پشتیبان خودکار</label>
        <label class="cust-field"><span>مسیر پوشه روی سرور</span><input name="directory" dir="ltr" maxlength="1024" value="${admE(schedule.directory||'')}" placeholder="D:&#92;BabolToyor-Backups" autocomplete="off"></label>
        <p>مسیر مربوط به سرور است، نه رایانهٔ شما. حساب سرویس برنامه باید مجوز نوشتن در آن را داشته باشد و پوشه از پیوند امن فایل پشتیبانی کند (مانند NTFS). با فعال‌سازی، یک پشتیبان فوراً و سپس هر ساعت هنگام روشن‌بودن سرور ساخته می‌شود.</p>
        <label class="cust-field"><span>نگهداری بر حسب روز (۰ = بدون حذف زمانی)</span><input type="number" name="retentionDays" min="0" max="3650" value="${Number(schedule.retentionDays)||0}"></label>
        <label class="cust-field"><span>حداکثر تعداد نسخهٔ خودکار (۰ = نامحدود)</span><input type="number" name="maxSnapshots" min="0" max="100000" value="${Number(schedule.maxSnapshots)||0}"></label>
        <p>حذف خودکار فقط با تنظیم محدودیت فعال می‌شود؛ آخرین نسخهٔ موفق و بکاپ‌های دستی حذف نمی‌شوند. فضای دیسک را کنترل کنید. این فایل شامل کلید گواهی HTTPS نیست. مسیر امن با دسترسی محدود انتخاب کنید و نسخه‌ای جدا از سرور نگه دارید.</p>
        <button class="btn btn-primary" type="submit">ذخیره تنظیمات</button>
        <div class="auto-backup-status" role="status"><strong>وضعیت: ${schedule.enabled?'فعال':'غیرفعال'}</strong><span>آخرین پشتیبان موفق: ${schedule.lastSuccessAt?admE(dt(schedule.lastSuccessAt)):'هنوز ساخته نشده'}</span>${schedule.lastBackup?`<span>فایل: <b dir="ltr">${admE(schedule.lastBackup)}</b></span>`:''}${schedule.enabled&&schedule.nextRunAt?`<span>نوبت بعدی${schedule.lastError?' (تلاش مجدد)':''}: ${admE(dt(schedule.nextRunAt))}</span>`:''}${schedule.lastError?`<span class="auto-backup-error">${admE(schedule.lastError)}</span>`:''}</div>
        <div id="auto-backup-message" role="alert"></div>
      </form>
      <section class="adm-backup-action"><h3>پشتیبان‌گیری دستی</h3>
      <p>نسخهٔ پشتیبان شامل اطلاعات کاربران و هش رمزهاست؛ فایل دانلودشده را در محل امن و جدا از سرور نگه دارید.</p>
      <button class="btn btn-primary" type="button" id="backup-create">ایجاد نسخهٔ پشتیبان</button></section>
      <section class="adm-backup-action"><h3>افزودن فایل برای بازیابی</h3>
      <p>بازیابی داده‌های فعلی را جایگزین می‌کند. پیش از آن یک نسخهٔ ایمنی خودکار ساخته می‌شود و همه کاربران باید دوباره وارد شوند.</p>
      <label class="cust-field"><span>انتخاب فایل پشتیبان SQLite از رایانه (حداکثر ۵۱۲ مگابایت)</span><input type="file" id="backup-file" accept=".db,application/octet-stream"></label>
      <button class="btn btn-secondary" type="button" id="backup-upload">افزودن فایل پشتیبان</button>
      <p>فایل دانلودشدهٔ پشتیبان را انتخاب کنید. پس از بررسی، فایل به فهرست اضافه می‌شود؛ بازیابی جداگانه با دکمهٔ «بازیابی» و تأیید رمز انجام می‌شود.</p>
      <div id="backup-message" role="status"></div></section>
    </div><div class="adm-rep-main"><h3 class="adm-backup-list-title">نسخه‌های پشتیبان</h3><div class="adm-table-wrap bt-table-wrap"><table class="adm-table bt-table adm-backups-table"><caption class="bt-caption">نسخه‌های پشتیبان</caption><thead><tr><th>نام نسخه</th><th>زمان</th><th>حجم (بایت)</th><th>عملیات</th></tr></thead><tbody>
      ${backups.map(b => `<tr><td data-label="نام نسخه">${admE(b.name)}${b.automatic?' <small>(خودکار)</small>':''}</td><td data-label="زمان">${admE(dt(b.createdAt))}</td><td data-label="حجم (بایت)">${admE(b.size)}</td><td data-label="عملیات"><div class="adm-backup-row-actions"><a class="btn btn-secondary btn-sm" href="/api/admin/backups/${encodeURIComponent(b.name)}/download">دانلود</a> <button class="btn btn-secondary btn-sm" type="button" data-backup-restore="${admE(b.name)}">بازیابی</button></div></td></tr>`).join('') || '<tr><td colspan="4">هنوز نسخه‌ای ساخته نشده است.</td></tr>'}
    </tbody></table></div>${automaticCount>200?`<p>فهرست فقط ۲۰۰ پشتیبان خودکار جدیدتر را نشان می‌دهد؛ بقیه در پوشهٔ مقصد محفوظ‌اند و با بارگذاری قابل بازیابی هستند.</p>`:''}<div id="backup-confirm"></div></div></div></section>`;
  $('#auto-backup-form').onsubmit = async e => {
    e.preventDefault(); const form=e.currentTarget, button=form.querySelector('button[type=submit]'), message=$('#auto-backup-message');
    button.disabled=true; message.textContent='در حال ذخیره و بررسی مسیر…';
    try {
      const result=await api('/api/admin/backups/schedule',{method:'PUT',body:JSON.stringify({enabled:form.elements.enabled.checked,directory:form.elements.directory.value,retentionDays:Number(form.elements.retentionDays.value),maxSnapshots:Number(form.elements.maxSnapshots.value)})});
      await renderBackupsPage();
      if(result.schedule.lastError) $('#auto-backup-message').textContent=result.schedule.lastError;
      else toast('تنظیمات پشتیبان خودکار ذخیره شد.');
    } catch(err) { message.textContent=err.message; button.disabled=false; }
  };
  $('#backup-create').onclick = async e => { e.currentTarget.disabled = true; try { await api('/api/admin/backups', { method:'POST', body:'{}' }); await renderBackupsPage(); toast('نسخهٔ پشتیبان ساخته شد.'); } catch (err) { $('#backup-message').textContent = err.message; e.currentTarget.disabled = false; } };
  $('#backup-upload').onclick = async e => {
    const button = e.currentTarget, file = $('#backup-file').files[0], message = $('#backup-message');
    if (!file) { message.textContent = 'ابتدا فایل پشتیبان را انتخاب کنید.'; return; }
    if (file.size > 512 * 1024 * 1024) { message.textContent = 'حجم فایل نباید بیش از ۵۱۲ مگابایت باشد.'; return; }
    button.disabled = true; message.textContent = 'در حال بارگذاری و بررسی فایل پشتیبان…';
    try {
      const response = await fetch('/api/admin/backups/upload', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/octet-stream','X-Backup-Upload':'1'}, body:file });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 401) handleSessionExpired(); throw new Error(data.error || 'بارگذاری پشتیبان انجام نشد.'); }
      await renderBackupsPage(); toast('فایل بررسی و به فهرست پشتیبان‌ها اضافه شد؛ برای بازیابی، دکمهٔ بازیابی را انتخاب کنید.');
    } catch (err) { message.textContent = err.message || 'ارتباط برای بارگذاری برقرار نشد.'; button.disabled = false; }
  };
  $('#content').onclick = e => {
    const b = e.target.closest('[data-backup-restore]'); if (!b) return;
    const name = b.dataset.backupRestore;
    $('#backup-confirm').innerHTML = `<div class="card card-pad"><h3>تأیید بازیابی</h3><p>تمام داده‌های فعلی با نسخهٔ ${admE(name)} جایگزین می‌شود. رمز مدیر فعلی را برای تأیید وارد کنید.</p><label>رمز مدیر <input type="password" id="backup-password" autocomplete="current-password"></label><button class="btn btn-primary" type="button" id="backup-confirm-action">تأیید و بازیابی</button><div id="backup-restore-error" role="alert"></div></div>`;
    $('#backup-confirm-action').onclick = async ev => {
      if (!confirm('بازیابی جایگزین تمام اطلاعات فعلی می‌شود. ادامه می‌دهید؟')) return;
      ev.currentTarget.disabled = true;
      try { const r = await api(`/api/admin/backups/${encodeURIComponent(name)}/restore`, { method:'POST', body:JSON.stringify({confirm:'RESTORE', password:$('#backup-password').value}) }); alert(r.message); location.reload(); }
      catch (err) { $('#backup-restore-error').textContent = err.message; ev.currentTarget.disabled = false; }
    };
  };
}
