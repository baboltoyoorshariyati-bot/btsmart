function initials(name=''){const p=String(name).trim().split(/\s+/).filter(Boolean);return (p[0]?.[0]||'ب')+(p[1]?.[0]||'')}
function normalizeRole(r){return ['gate','gate_entry','gate_exit'].includes(r)?'gate':(['sales','sales_order','sales_settlement'].includes(r)?'sales':r)}
function can(role){const r=normalizeRole(app.user?.roleCode);return r==='admin'||r===role}
function badge(s){const x=STATUS[s]||[s,'gray'];return `<span class="badge ${x[1]}">${x[0]}</span>`}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)}
const WRITE_KEYS=new Map();
const WRITES_IN_FLIGHT=new Set();
// کلید Idempotency با getRandomValues ساخته می‌شود تا در HTTP داخلی (غیر localhost) هم کار کند
function newIdempotencyKey(){const b=crypto.getRandomValues(new Uint8Array(16));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
async function api(path,opts={}){
  const method=String(opts.method||'GET').toUpperCase();
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  const mutating=method!=='GET'&&method!=='HEAD';
  const connectionGeneration=window.btConnection?.current?.();
  const sig=mutating?`${method} ${path} ${opts.body||''}`:'';
  if(mutating){
    if(WRITES_IN_FLIGHT.has(sig)) throw new Error('این عملیات در حال انجام است. لطفاً منتظر پاسخ سامانه بمانید.');
    if(!WRITE_KEYS.has(sig)) WRITE_KEYS.set(sig,newIdempotencyKey());
    headers['Idempotency-Key']=WRITE_KEYS.get(sig);
    WRITES_IN_FLIGHT.add(sig);
  }
  let res,data={};
  try{
    res=await fetch(path,{...opts,method,headers,credentials:'same-origin'});
    data=await res.json().catch(()=>({}));
  }catch(_){
    if(!mutating) window.btConnection?.failure(path,connectionGeneration);
    // قطع ارتباط: کلید نگه داشته می‌شود تا تلاش مجدد همان عملیات را تکرار نکند
    if(mutating) WRITES_IN_FLIGHT.delete(sig);
    throw new Error('ارتباط با سرور داخلی برقرار نشد. اتصال شبکه را بررسی کنید و دوباره تلاش کنید؛ عملیات دوبار ثبت نمی‌شود.');
  }
  if(!mutating){if(res.status<500)window.btConnection?.success(path,connectionGeneration);else window.btConnection?.failure(path,connectionGeneration);}
  if(mutating){WRITES_IN_FLIGHT.delete(sig);WRITE_KEYS.delete(sig);}
  if(!res.ok){
    if(res.status===401&&path!=='/api/login') handleSessionExpired();
    else if(data.code==='PASSWORD_CHANGE_REQUIRED'&&!app.forcePasswordChange) openPasswordModal(true);
    const err=new Error(data.error||'خطا در ارتباط با سامانه');
    err.status=res.status; err.code=data.code;
    throw err;
  }
  if(mutating){app.dataRevision=(app.dataRevision||0)+1;if(app.salesCache)app.salesCache.fetchedAt=0;}
  return data;
}
function openModal(title,body){const m=$('#modal');m.innerHTML=`<div class="modal-card"><div class="modal-head"><strong>${esc(title)}</strong><button class="modal-close" data-action="close-modal">${icon('close',18)}</button></div><div class="modal-body">${body}</div></div>`;m.classList.add('open')}
function closeModal(){if(app.forcePasswordChange)return;$('#modal').classList.remove('open');$('#modal').innerHTML=''}

function badgeCount(key){return Number(app.workload?.[key]||0)}
function navBadge(n){return n>0?`<span class="nav-badge">${qty(n)}</span>`:''}
function setHeader(kicker,title,subtitle){$('#headerKicker').textContent=kicker;$('#pageTitle').textContent=title;$('#pageSubtitle').textContent=subtitle||''}
function landing(){const r=normalizeRole(app.user?.roleCode);return r==='admin'?'dashboard':r}

async function refreshShell(){
  const me=await api('/api/me');app.user=me.user;app.features=me.features||{};
  const roleLabel=ROLE[normalizeRole(app.user.roleCode)]||app.user.roleCode;
  $('#appView')?.setAttribute('data-role',normalizeRole(app.user.roleCode));
  const roleText=(app.user.position && app.user.position.trim()!==roleLabel) ? `${app.user.position} • ${roleLabel}` : roleLabel;
  const headerUser=$('#headerUser'); if(headerUser) headerUser.textContent=app.user.fullName||'';
  const headerRole=$('#headerRole'); if(headerRole) headerRole.textContent=roleText;
  const headerAvatar=$('#headerAvatar'); if(headerAvatar) headerAvatar.textContent=(app.user.fullName||'؟').trim().charAt(0);
  startRailClock();
  await refreshIndicators(); if(!app.indicatorTimer) app.indicatorTimer=setInterval(refreshIndicators,6000); renderNav();
}

async function go(page,sub){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const r=normalizeRole(app.user?.roleCode);const own=r==='admin'?page:(r==='dispatch'?'drivers':r);
  if(page==='dispatch'){page='drivers';adm.tab='dispatch';}
  // کارتابل باسکول فعلاً غیرفعال است؛ تا زمان اصلاح، هیچ صفحه‌ای از آن باز نمی‌شود
  if(page==='scale'&&!WEIGHBRIDGE_CARTABLE_ENABLED){ page = r==='admin' ? 'dashboard' : (r==='gate' ? 'gate' : own); }
  const scaleOk=WEIGHBRIDGE_CARTABLE_ENABLED&&page==='scale'&&(r==='gate'||r==='admin');
  const customersOk=page==='customers'&&['gate','sales'].includes(r);
  const productsOk=page==='products'&&r==='sales'; // v37.3.1 — کارتابل محصولات (قیمت + ویرایش) برای فروش
  const transportResourcesOk=(page==='transport-resources'&&['dispatch','sales','warehouse'].includes(r))||(page==='transport-fleet'&&r==='dispatch');
  const dispatchExtraOk=(page==='returns'&&['sales','warehouse'].includes(r))||(page==='gate-dispatch'&&r==='gate');
  if(r!=='admin'&&page!==own&&!scaleOk&&!customersOk&&!productsOk&&!dispatchExtraOk&&!transportResourcesOk){toast('این حساب فقط به کارتابل واحد خود دسترسی دارد.');page=own}
  window.btConnection?.reset?.();
  app.page=page; if(sub)app.sub[page]=sub;
  const appView=$('#appView'); if(appView)appView.setAttribute('data-cartable-page',page);
  // صفحهٔ قبلی را پیش از درخواست‌های async پاک کن تا فرم نقش قبلی باقی نماند.
  const pageContent=$('#content'); if(pageContent)pageContent.replaceChildren();
  renderNav();
  try{
    if(page==='dashboard'){setHeader('مرکز کنترل','داشبورد مدیریتی','نمای کامل وضعیت عملیات و جریان مشتریان');await renderDashboard()}
    else if(page==='gate'){if(['dashboard','reports'].includes(app.sub.gate)){setHeader('نگهبانی',app.sub.gate==='reports'?'گزارش‌های نگهبانی':'داشبورد نگهبانی','نمای خلاصه کارتابل نگهبانی');await renderRoleCartableDashboard('gate',app.sub.gate);return}setHeader('نگهبانی','کارتابل نگهبانی','ورود مشتری، سوابق مراجعه و کنترل خروج در یک فضای عملیاتی');await renderGate(app.sub.gate||'entry')}
    else if(page==='sales'){if(app.sub.sales==='products'){setHeader('فروش','محصولات و قیمت‌ها','جستجو و به‌روزرسانی قیمت روز محصولات');await renderProductsPage();return}if(app.sub.sales==='history'){setHeader('فروش','سوابق سفارش و فاکتور','جستجو و پیگیری گردش سفارش‌ها');await renderSalesHistory();return}if(['dashboard','reports'].includes(app.sub.sales)){setHeader('فروش',app.sub.sales==='reports'?'گزارش‌های فروش':'داشبورد فروش','نمای خلاصه کارتابل فروش');await renderRoleCartableDashboard('sales',app.sub.sales);return}setHeader('فروش','کارتابل فروش','شش بخش عملیاتی، از ثبت سفارش تا بازبینی نهایی پخش');await renderSales(app.sub.sales==='intake'?'onsite':(app.sub.sales||'onsite'))}
    else if(page==='warehouse'){if(['dashboard','reports'].includes(app.sub.warehouse)){setHeader('انبار',app.sub.warehouse==='reports'?'گزارش‌های انبار':'داشبورد انبار','نمای خلاصه کارتابل انبار');await renderRoleCartableDashboard('warehouse',app.sub.warehouse);return}if(app.sub.warehouse==='history'){setHeader('انبار','سوابق مراجعه','سوابق مراجعه و وضعیت مشتریان ثبت‌شده');const v=await api('/api/visits');const content=$('#content');content.innerHTML=renderGateHistory(v.visits||[],true,'warehouse-visit-order-details');bindWarehouseVisitHistory(content);return}if(app.wh38)app.wh38.phase=['incoming','preparing','delivered','document-edits','stores'].includes(app.sub.warehouse)?app.sub.warehouse:'incoming';setHeader('انبار',app.sub.warehouse==='document-edits'?'درخواست‌های اصلاح سند':'کارتابل انبار',app.sub.warehouse==='document-edits'?'اصلاح سند فقط از مسیر ارجاع فروش و صف کنترل‌شده انجام می‌شود.':'صف سفارش‌ها، آماده‌سازی و پیگیری فروشگاه‌ها');await renderWarehouse()}
    else if(page==='store'){if(['dashboard','reports'].includes(app.sub.store)){setHeader('فروشگاه',app.sub.store==='reports'?'گزارش‌های فروشگاه':'داشبورد فروشگاه','خلاصه وضعیت سفارش‌ها');await renderRoleCartableDashboard('store',app.sub.store);return}setHeader('فروشگاه','کارتابل فروشگاه','ثبت سفارش و پیگیری تایید فروش تا زمان ورود به انبار');await renderStorePortal()}
    else if(page==='scale'){setHeader('باسکول','کارتابل باسکول','ثبت ورود و خروج وسیله‌ها، محاسبه خالص بار و ثبت کالا');await renderScale()}
    else if(page==='customers'){setHeader('مشتریان','پرونده مشتریان','کد مشتری، اطلاعات کامل و سوابق مراجعه و سفارش');await renderCustomers()}
    else if(page==='dispatch'){if(r!=='admin'&&r!=='dispatch')return go(own);setHeader('پخش','کارتابل واحد پخش','مشاهده سفارش‌ها؛ تخصیص راننده از کارتابل فروش و پیگیری تحویل');await renderDispatchPage(true)}
    else if(page==='driver'){if(r!=='admin'&&r!=='driver')return go(own);if(app.sub.driver==='reports'){setHeader('راننده','گزارش‌های راننده','گزارش ارسال‌های اختصاصی شما');await renderReportsPage('driver');return}setHeader('راننده','کارتابل راننده','سفارش‌های تخصیص‌یافته و ثبت تحویل');await renderDriverPage()}
    else if(page==='gate-dispatch'){if(r!=='admin'&&r!=='gate')return go(own);setHeader('نگهبانی','خروج ارسالی','ابتدا خروج اعلام‌شده توسط راننده را تأیید کنید؛ پس از تحویل مقصد، خروج نهایی را ثبت کنید');await renderGateDispatchPage()}
    else if(page==='returns'){if(r!=='admin'&&r!=='sales'&&r!=='warehouse')return go(own);setHeader('مرجوعی','برگه‌های مرجوعی','مرجوعی‌های راننده: فروش ارجاع می‌دهد و انبار دریافت می‌کند');await renderReturnsPage()}
    else if(page==='users'){if(r!=='admin')return go(own);setHeader('مدیریت','مدیریت کاربران','افزودن، ویرایش و غیرفعال‌سازی حساب‌های کاربری');await renderUsersPage()}
    else if(page==='transport-resources'){setHeader('ترابری','رانندگان و خودروها','مشخصات رانندگان و خودروهای ترابری');await renderTransportResources()}
    else if(page==='transport-fleet'){if(!['admin','dispatch'].includes(r))return go(own);setHeader('ترابری','خودروهای پخش','خودرو و دستگاه پوز در اختیار رانندگان');await renderTransportFleet()}
    else if(page==='transport-vehicles'||page==='store-branches'){if(r!=='admin')return go(own);setHeader('مدیریت',page==='transport-vehicles'?'خودروهای ترابری':'شعب فروشگاه','تعریف مستقل برای انتخاب در حساب کاربری');await renderResourcePage(page==='transport-vehicles'?'vehicle':'branch')}
    else if(page==='payment-devices'){if(r!=='admin')return go(own);setHeader('مدیریت','دستگاه‌های پوز','تعریف و مدیریت دستگاه‌های فعال برای فرم‌های تسویه');await renderPaymentDevicesPage()}
    else if(page==='drivers'){if(!['admin','dispatch'].includes(r))return go(own);if((r==='dispatch'||app.adminActiveRole==='dispatch')&&['dashboard','reports'].includes(app.sub.drivers)){setHeader('ترابری',app.sub.drivers==='reports'?'گزارشات ترابری':'داشبورد ترابری','خلاصه وضعیت ترابری');await renderRoleCartableDashboard('dispatch',app.sub.drivers);return}setHeader('عملیات','ترابری','رانندگان، سوابق سفارش‌ها و پخش');await renderDriversPage()}
    else if(page==='products'){if(r==='sales'){setHeader('فروش','کارتابل محصولات','تعیین قیمت روز و ویرایش محصولات');await renderProductsPage();}else{if(r!=='admin')return go(own);setHeader('مدیریت','محصولات و قیمت‌ها','ثبت، ویرایش، حذف محصول و تعیین قیمت روز');await renderProductsPage()}}
    else if(page==='orders-history'){if(r!=='admin')return go(own);setHeader('مدیریت','سوابق کامل سفارش‌ها','پروندهٔ کامل هر سفارش از ثبت تا پایان کار، با کاربر هر مرحله');await renderAdminOrdersHistory()}
    else if(page==='activity'){if(r!=='admin')return go(own);setHeader('مدیریت','تاریخچه فعالیت‌ها','ردیابی کامل عملیات کاربران با زمان، IP و جزئیات');await renderActivityPage()}
    else if(page==='backups'){if(r!=='admin')return go(own);setHeader('مدیریت','پشتیبان‌گیری و بازیابی','ساخت، دریافت و بازیابی نسخه‌های پشتیبان');await renderBackupsPage()}
    else if(page==='reports'){if(r!=='admin')return go(own);setHeader('مدیریت','گزارش‌های پیشرفته','گزارش از همه بخش‌های سامانه با انتخاب ستون و فیلتر، خروجی Excel و PDF');await renderReportsPage()}
    else if(page==='admin'){if(r!=='admin')return go(own);setHeader('مدیریت','مدیریت سیستم','کاتالوگ کالا، قیمت روز، حساب‌های کاربری و ردپای فعالیت‌ها');await renderAdmin()}
  }catch(e){toast(e.message)}
}

function dashboardKpi(label,value,hint,ico){return `<div class="card kpi"><div><div class="label">${label}</div><div class="value">${qty(value)}</div><div class="hint">${hint}</div></div><div class="kpi-icon">${icon(ico,20)}</div></div>`}

/* ---------- Gate ---------- */
async function renderGate(tab){
  app.sub.gate=tab;const visits=(await api('/api/visits')).visits||[];let html=`<div class="unit-tabs unit-tabs-counted">${[['entry','ثبت ورود',null],['waiting','در انتظار اقدام فروش','gateEntry'],['history','سوابق مراجعه',null],['exit','کنترل خروج','gateExit']].map(([id,label,key])=>`<button class="${tab===id?'active':''}" data-sub="gate:${id}">${label}${key?`<span class="tab-count ${badgeCount(key)<=0?'hidden':''}" data-badge-key="${key}">${badgeCount(key)?qty(badgeCount(key)):''}</span>`:''}</button>`).join('')}</div>`;
  if(tab==='entry')html+=renderGateEntry();
  else if(tab==='waiting')html+=renderGateWaitingLegacy(visits.filter(v=>v.status==='WAITING_SALES'));
  else if(tab==='history')html+=renderGateHistory(visits);
  else html+=renderGateExit((await api('/api/orders?status=SETTLED')).orders||[]);
  $('#content').innerHTML=html;bindGate(tab);if(tab==='entry')bindPlate();
}
function renderGateEntry(){return `<section class="card workspace-card"><div class="panel-head"><div><span class="eyebrow">ENTRY DESK</span><h2>ثبت ورود مشتری</h2><p>اطلاعات مشتری و وسیله را یک‌بار ثبت کنید؛ دفعات بعد سوابق پلاک قابل انتخاب است.</p></div><span class="pill">ورود مستقیم به صف فروش</span></div>
  <form id="gateForm" class="section-space">
    <div class="form-grid"><div class="field"><label>نام و نام خانوادگی</label><div class="input-shell"><span data-field-icon="user"></span><input name="name" required placeholder="نام مشتری"></div></div><div class="field"><label>شماره تماس</label><div class="input-shell"><span data-field-icon="user"></span><input name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div></div>
    <div class="section-space"><div class="plate-wrap"><div class="plate-label"><div><strong>پلاک وسیله نقلیه</strong><div class="plate-preview">فرمت استاندارد پلاک ایران</div></div><label class="pill"><input type="checkbox" id="noVehicle" style="accent-color:var(--brand)"> بدون وسیله</label></div><div id="plateBox"></div><div id="plateSuggest" class="suggestions"></div></div></div>
    <div class="form-grid section-space"><div class="field"><label>نوع وسیله</label><div class="input-shell"><select name="vehicleType"><option>خودرو</option><option>موتورسیکلت</option><option>وانت</option><option>بدون وسیله</option></select></div></div><div class="field"><label>هدف مراجعه</label><div class="input-shell"><input name="purpose" placeholder="خرید، دریافت سفارش یا توضیح کوتاه"></div></div></div>
    <div class="sticky-actions"><span class="subtle">پس از ثبت، اعلان فوری برای کارتابل فروش ارسال می‌شود.</span><button class="btn btn-primary btn-lg" type="submit">ثبت ورود و ارسال به فروش ${icon('arrow',17)}</button></div>
    <div id="gateMsg" class="form-error"></div>
  </form></section>`}
function renderGateWaitingLegacy(queue){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">WAITING SALES</span><h2>در انتظار اقدام فروش</h2><p>ورودی‌هایی که نگهبانی ثبت کرده و فروش هنوز برایشان سفارش ثبت نکرده است.</p></div><span class="count-chip">${qty(queue.length)}</span></div><div class="queue-list section-space">${queue.map(x=>`<div class="queue-item"><div class="queue-main"><div class="queue-avatar">${esc(initials(x.customer?.name||''))}</div><div class="queue-copy"><strong>${esc(x.customer?.name||'—')}</strong><span>${plateViewHtml(x.customer?.plate, 'بدون پلاک', true)} • ${esc(x.customer?.phone||'')}</span></div></div>${badge(x.status)}</div>`).join('')||'<div class="empty">صف فعالی وجود ندارد.</div>'}</div></section>`}
function renderGateHistory(visits){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">VISIT HISTORY</span><h2>سوابق مراجعه</h2><p>آخرین ورودهای ثبت‌شده و وضعیت هر مراجعه</p></div></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>مشتری</th><th>پلاک</th><th>محله</th><th>هدف</th><th>وضعیت</th><th>زمان</th></tr></thead><tbody>${visits.map(v=>`<tr><td><strong>${esc(v.customer?.name||'—')}</strong><div class="subtle">${esc(v.customer?.phone||'')}</div></td><td>${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</td><td>${esc(v.district||'—')}</td><td>${esc(v.purpose||'—')}</td><td>${badge(v.status)}</td><td>${dt(v.createdAt)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">سابقه‌ای ثبت نشده است.</td></tr>'}</tbody></table></div></section>`}
function renderGateExit(orders){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">EXIT CONTROL</span><h2>فاکتورهای آماده خروج</h2><p>فقط فاکتورهای تسویه‌شده در این کارتابل قابل کنترل هستند.</p></div><span class="pill"><span class="status-dot"></span> کنترل واحد نگهبانی</span></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>مشتری</th><th>پلاک</th><th>فاکتور</th><th>مبلغ</th><th>زمان</th><th>عملیات</th></tr></thead><tbody>${orders.map(o=>`<tr><td><strong>${esc(storeAwareOrderName(o))}</strong><div class="subtle">${esc(storeAwareOrderPhone(o))}</div></td><td>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)}</td><td><b style="color:var(--brand)">${esc(fa(o.payment?.invoiceNumber||'—'))}</b></td><td>${money(o.payment?.totalAmount)}</td><td>${dt(o.payment?.verifiedAt)}</td><td><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${o.id}">${icon('eye',15)} فاکتور</button><button class="btn btn-success btn-sm" data-action="open-exit" data-id="${o.id}">${icon('check',15)} کنترل خروج</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">فاکتور آماده خروج وجود ندارد.</td></tr>'}</tbody></table></div><div id="exitEditor" class="section-space"></div></section>`}
function bindGate(tab){
  $('#content').onclick=async e=>{const b=e.target.closest('[data-sub]');if(b){const [k,v]=b.dataset.sub.split(':');app.sub[k]=v;await renderGate(v);return}const action=e.target.closest('[data-action]')?.dataset.action;if(action==='invoice')return previewInvoice(e.target.closest('[data-action]').dataset.id,Number(e.target.closest('[data-action]').dataset.run)||null);if(action==='open-exit')return openExit(e.target.closest('[data-action]').dataset.id);if(action==='confirm-exit')return confirmExit(e.target.closest('[data-action]').dataset.id)};
  const f=$('#gateForm');if(f)f.addEventListener('submit',submitGate)
  const nv=$('#noVehicle');if(nv)nv.addEventListener('change',()=>{const box=$('#plateBox');if(box)box.hidden=nv.checked;});
  if($('#plateBox'))$('#plateBox').innerHTML=plateEditorHtml('',f?.elements.vehicleType?.value||'');
}
async function submitGate(e){e.preventDefault();const f=e.target;const data=Object.fromEntries(new FormData(f));data.noVehicle=!!$('#noVehicle')?.checked;
try{data.plate=data.noVehicle?'':plateEditorValue(f,{required:true});}catch(err){$('#gateMsg').textContent=err.message;return;}
if(!data.name||!data.phone){$('#gateMsg').textContent=app.pickupSelected&&!document.querySelector('[data-pickup-other]')?.checked?'مشخصات صاحب سفارش ناقص است؛ فروش ابتدا آن را اصلاح کند.':'نام و شماره تماس را وارد کنید.';return;}try{const pickup=app.features?.pickupStaging&&app.pickupSelected;if(pickup)data.recipientIsBuyer=!document.querySelector('[data-pickup-other]')?.checked;if(pickup)await api('/api/pickup/'+encodeURIComponent(pickup.id)+'/entry',{method:'POST',body:JSON.stringify(data)});else await api('/api/visits',{method:'POST',body:JSON.stringify(data)});toast(pickup?'ورود تحویل‌گیرنده ثبت شد و به انبار اطلاع داده شد.':'ورود مشتری ثبت شد و به فروش ارسال شد.');app.pickupSelected=null;app.plate={a:'',letter:'ب',c:'',province:''};app.customerMatches=[];await renderGate('entry');const nameInput=$('#gateForm [name="name"]');if(nameInput)nameInput.focus();}catch(err){$('#gateMsg').textContent=err.message}}
/* v37.3.4 — پایانه پوز راننده همراه با نام بانک؛ شماره تماس قابل کلیک */
const BT_POS_BANKS=['بانک ملت','بانک ملی','بانک صادرات','بانک تجارت','بانک سپه','بانک کشاورزی','بانک مسکن','بانک رفاه','بانک پاسارگاد','بانک سامان','بانک پارسیان','بانک اقتصاد نوین','بانک شهر','بانک آینده','بانک دی','بانک سینا','بانک کارآفرین','بانک توسعه تعاون','پست بانک','بانک رسالت','بانک قرض‌الحسنه مهر ایران','بانک سرمایه','بانک خاورمیانه','بانک ایران زمین','بانک گردشگری'];
function driverPosText(d){ const t=String(d?.posTerminal||'').trim(), b=String(d?.posBank||'').trim(); if(!t&&!b) return '—'; return t&&b?`${t} — ${b}`:(t||b); }
function driverPosHtml(d){ const t=String(d?.posTerminal||'').trim(), b=String(d?.posBank||'').trim(); if(!t&&!b) return '<span class="drv-pos is-empty">—</span>';
  return `<span class="drv-pos">${t?`<span class="drv-pos-term" dir="ltr">${esc(t)}</span>`:''}${b?`<span class="drv-pos-bank">${esc(b)}</span>`:''}</span>`; }
function driverPhoneHtml(phone){ const p=String(phone||'').trim(); return p?`<a class="drv-phone" href="tel:${esc(p)}" dir="ltr">${esc(fa(p))}</a>`:'<span class="drv-phone is-empty">ثبت نشده</span>'; }
function fa(v=''){return String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])}
function en(v=''){return String(v).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))}
function plateDigits(v,len){return fa(en(v).replace(/\D/g,'').slice(0,len))}
function formatPlate(p){const a=en(p.a||''),c=en(p.c||''),pr=en(p.province||''),l=p.letter||'';return /^\d{2}$/.test(a)&&/^\d{3}$/.test(c)&&/^\d{2}$/.test(pr)&&/^[بپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]$/.test(l)?`${fa(a)} ${l} ${fa(c)} - ${fa(pr)}`:''}
function parsePlate(s=''){
  const t=en(String(s)).replace(/\s/g,'').replace(/[–—]/g,'-');
  const m=t.match(/^(\d{2})([بپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی])(\d{3})-?(\d{2})$/);
  return m?{a:m[1],letter:m[2],c:m[3],province:m[4]}:{a:'',letter:'ب',c:'',province:''};
}
function formatDispatchVehiclePlate(value,fallback='—'){
  const raw=String(value??'').trim();
  if(!raw)return fallback;
  const formatted=formatPlate(parsePlate(raw));
  if(formatted)return formatted;
  return fa(en(raw).replace(/\s*-\s*/g,' - ').replace(/\s+/g,' '))||fallback;
}
function plateViewHtml(value, fallback='بدون پلاک', compact=false){
  const raw=String(value??'').trim();
  if(!raw) return `<span class="plate-text" style="color:var(--muted);font-size:12px;font-weight:700">${esc(fallback)}</span>`;
  const t=en(raw).replace(/\s/g,'').replace(/[–—]/g,'-');
  const motorcycle=t.match(/^(\d{3})-?(\d{5})$/);
  const p=parsePlate(raw), valid=!!formatPlate(p);
  const cls=compact?'iran-plate is-readonly is-compact':'iran-plate is-readonly';
  const blue='<div class="blue-strip"><span>IR<br>ایران</span></div>';
  if(motorcycle)return `<div class="${cls} is-motor" dir="ltr" aria-label="پلاک موتورسیکلت ${esc(raw)}">${blue}<div class="plate-part motor-top"><span>${esc(fa(motorcycle[1]))}</span></div><div class="plate-part motor-bottom"><span>${esc(fa(motorcycle[2]))}</span></div></div>`;
  // Never fabricate a letter or truncate unrecognised historical plates.
  if(!valid)return `<span class="iran-plate-legacy" dir="auto" title="پلاک قدیمی؛ قالب آن قابل تشخیص نیست">${esc(raw)}</span>`;
  return `<div class="${cls}" style="display:inline-grid;vertical-align:middle" dir="ltr" aria-label="پلاک ${esc(formatPlate(p))}">${blue}<div class="plate-part"><span>${esc(fa(p.a))}</span></div><div class="plate-part"><span>${esc(p.letter)}</span></div><div class="plate-part"><span>${esc(fa(p.c))}</span></div><div class="plate-part plate-code"><span>${esc(fa(p.province))}</span></div></div>`;
}
// Reusable segmented input. Its hidden value is sent only after validation;
// unrecognised legacy values remain intact until the user deliberately edits them.
function plateEditorHtml(value='',vehicleType='',name='plate'){
  const raw=String(value??''), p=parsePlate(raw), car=!!formatPlate(p);
  const motor=en(raw).replace(/\s/g,'').match(/^(\d{3})-?(\d{5})$/);
  const isMotor=/موتور/.test(String(vehicleType));
  const letters=['ب','پ','ت','ث','ج','چ','ح','خ','د','ذ','ر','ز','ژ','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ک','گ','ل','م','ن','و','ه','ی'];
  const noCar=isMotor?' hidden':'', noMotor=isMotor?'':' hidden';
  return `<div data-plate-editor data-dirty="0" data-motor="${isMotor?'1':'0'}" data-original="${esc(raw)}"><input type="hidden" name="${esc(name)}" value="${esc(raw)}" data-plate-value><div class="iran-plate plate-editor${isMotor?' is-motor':''}" dir="ltr"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part" data-car${noCar}><input data-plate-a maxlength="2" inputmode="numeric" autocomplete="off" aria-label="دو رقم اول پلاک" placeholder="۱۲" value="${car?esc(fa(p.a)):''}"></div><div class="plate-part plate-letter-part" data-car${noCar}><select data-plate-letter aria-label="حرف پلاک"><option value="">—</option>${letters.map(l=>`<option value="${l}" ${car&&l===p.letter?'selected':''}>${l}</option>`).join('')}</select></div><div class="plate-part" data-car${noCar}><input data-plate-c maxlength="3" inputmode="numeric" autocomplete="off" aria-label="سه رقم پلاک" placeholder="۳۴۵" value="${car?esc(fa(p.c)):''}"></div><div class="plate-part plate-code" data-car${noCar}><input data-plate-province maxlength="2" inputmode="numeric" autocomplete="off" aria-label="کد استان" placeholder="۶۷" value="${car?esc(fa(p.province)):''}"></div><div class="plate-part motor-top" data-motor${noMotor}><input data-motor-a maxlength="3" inputmode="numeric" autocomplete="off" aria-label="سه رقم بالای پلاک موتور" value="${motor?esc(fa(motor[1])):''}" placeholder="۱۲۳"></div><div class="plate-part motor-bottom" data-motor${noMotor}><input data-motor-b maxlength="5" inputmode="numeric" autocomplete="off" aria-label="پنج رقم پایین پلاک موتور" value="${motor?esc(fa(motor[2])):''}" placeholder="۴۵۶۷۸"></div></div>${raw&&(!car&&!motor||(isMotor&&!motor)||(!isMotor&&!car))?`<small class="plate-legacy-note">پلاک قبلی با قالب استاندارد قابل تشخیص نیست و بدون تغییر حفظ می‌شود: ${esc(raw)}. برای اصلاح، بخش‌های پلاک را تکمیل کنید.</small>`:''}</div>`;
}
function bindPlateEditor(form, vehicleTypeControl){
  const root=form.querySelector('[data-plate-editor]');if(!root||root.dataset.bound==='1')return;root.dataset.bound='1';
  const select=vehicleTypeControl||form.querySelector('[name="vehicleType"]');
  const syncMode=()=>{const motor=/موتور/.test(String(select?.value||''));if(root.dataset.motor===(motor?'1':'0'))return;root.dataset.motor=motor?'1':'0';root.dataset.dirty='1';root.querySelector('.iran-plate').classList.toggle('is-motor',motor);root.querySelectorAll('[data-car]').forEach(x=>x.hidden=motor);root.querySelectorAll('[data-motor]').forEach(x=>x.hidden=!motor);};
  if(select){if(select._plateSync){select.removeEventListener('change',select._plateSync);select.removeEventListener('input',select._plateSync);}select._plateSync=syncMode;select.addEventListener('change',syncMode);select.addEventListener('input',syncMode);}
  root.addEventListener('input',e=>{if(e.target.matches('input:not([type="hidden"])'))e.target.value=plateDigits(e.target.value,Number(e.target.maxLength)||5);root.dataset.dirty='1';});
  root.addEventListener('change',()=>{root.dataset.dirty='1';});
}
function plateEditorValue(form,{required=false}={}){
  const root=form.querySelector('[data-plate-editor]');if(!root)return '';
  const original=root.dataset.original||'';
  if(root.dataset.dirty!=='1'&&original)return original;
  const val=s=>root.querySelector(s)?.value||'';
  let result='',hasDigits=false;
  if(root.dataset.motor==='1'){
    const a=en(val('[data-motor-a]')),b=en(val('[data-motor-b]'));hasDigits=!!(a||b);
    if(/^\d{3}$/.test(a)&&/^\d{5}$/.test(b))result=`${a}-${b}`;
  }else{
    const p={a:val('[data-plate-a]'),letter:val('[data-plate-letter]'),c:val('[data-plate-c]'),province:val('[data-plate-province]')};
    hasDigits=!!(p.a||p.c||p.province);result=formatPlate(p);
  }
  if(!hasDigits&&!required)return '';
  if(!result)throw new Error(root.dataset.motor==='1'?'پلاک موتورسیکلت را با سه رقم بالا و پنج رقم پایین کامل وارد کنید.':'پلاک را کامل وارد کنید: دو رقم، حرف، سه رقم و کد دو رقمی استان.');
  return result;
}
function plateMarkup(p){const letters=['ب','پ','ت','ث','ج','چ','ح','خ','د','ذ','ر','ز','ژ','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ک','گ','ل','م','ن','و','ه','ی'];return `<div class="iran-plate"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part"><input class="plate-a" maxlength="2" inputmode="numeric" value="${esc(p.a||'')}" placeholder="۱۲"></div><div class="plate-part"><select class="plate-letter">${letters.map(l=>`<option ${l===(p.letter||'ب')?'selected':''}>${l}</option>`).join('')}</select></div><div class="plate-part"><input class="plate-c" maxlength="3" inputmode="numeric" value="${esc(p.c||'')}" placeholder="۳۴۵"></div><div class="plate-part plate-code"><input class="plate-province" maxlength="2" inputmode="numeric" value="${esc(p.province||'')}" placeholder="۶۷"></div></div><div class="plate-preview">${formatPlate(p)||'نمونه: ۱۲ ب ۳۴۵ - ۶۷'}</div>`}
function bindPlate(){const box=$('#plateBox'),form=$('#gateForm');if(!box||!form)return;bindPlateEditor(form);box.oninput=box.onchange=()=>debouncePlateSearch();}
let plateTimer=null;function debouncePlateSearch(){clearTimeout(plateTimer);if(app.pickupSelected){if($('#plateSuggest'))$('#plateSuggest').innerHTML='';return;}let raw='';try{raw=plateEditorValue($('#gateForm'),{required:true});}catch{}plateTimer=setTimeout(()=>searchCustomers(raw),220)}
async function searchCustomers(raw){if(!raw||app.pickupSelected)return $('#plateSuggest').innerHTML='';try{const q=raw||'';const d=await api('/api/customers/search?q='+encodeURIComponent(q));if(app.pickupSelected||!$('#plateSuggest'))return;app.customerMatches=d.customers||[];$('#plateSuggest').innerHTML=app.customerMatches.length?app.customerMatches.slice(0,5).map((c,i)=>`<button type="button" class="suggestion" data-action="pick-customer" data-index="${i}"><main><b>${esc(c.name)}</b><span>${plateViewHtml(c.plate, '—', true)} • ${esc(c.phone||'')}</span></main><span>${icon('arrow',16)}</span></button>`).join(''):''}catch{}}
function pickCustomer(i){const c=app.customerMatches[i];if(!c)return;const f=$('#gateForm');if(!f)return;f.elements.name.value=c.name||'';f.elements.phone.value=c.phone||'';f.elements.vehicleType.value=c.vehicleType||'خودرو';$('#plateBox').innerHTML=plateEditorHtml(c.plate||'',f.elements.vehicleType.value);$('#plateSuggest').innerHTML='';bindPlate();toast('سوابق مشتری بازیابی شد.')}
async function openExit(id){try{const d=await api('/api/orders/'+id);const o=d.order;$('#exitEditor').innerHTML=`<div class="card card-pad" style="border-color:#e7b6bc"><div class="panel-head"><div><span class="eyebrow">FINAL CHECK</span><h2>کنترل خروج — ${esc(fa(o.payment?.invoiceNumber||o.orderNo||'—'))}</h2><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px"><span>${esc(storeAwareOrderName(o))}</span>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)}</div></div><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${id}">${icon('receipt',15)} فاکتور</button></div></div><div class="section-space" style="display:grid;gap:8px">${o.items.filter(i=>i.itemStatus!=='CANCELLED').map(i=>`<label class="queue-item"><span><input type="checkbox" data-exit-item="${i.id}" checked style="margin-left:8px;accent-color:var(--brand)"><strong>${esc(i.product?.name||'—')}</strong><span style="display:block;color:var(--muted);font-size:12px;margin-top:2px">${qty(i.deliveredKg)} کیلوگرم • ${money(i.finalAmount)}</span></span>${badge(i.itemStatus)}</label>`).join('')}</div><div class="sticky-actions"><span class="subtle">همه اقلام فاکتور را با بار واقعی تطبیق دهید.</span><button class="btn btn-success" data-action="confirm-exit" data-id="${id}">${icon('check',17)} ثبت خروج نهایی</button></div></div>`}catch(e){toast(e.message)}}
/* v37.34.0 — تأیید خروج نگهبانی: بازخورد درون‌برگه‌ای و وضعیت «در حال ثبت»،
   تا کلیک روی «ثبت خروج نهایی» در هیچ شرایطی (شبکهٔ کند/قلم بدون تیک) بی‌واکنش به نظر نرسد. */
async function confirmExit(id){
  const boxes=$$('[data-exit-item]');
  const checked=boxes.filter(x=>x.checked).map(x=>x.dataset.exitItem);
  const msg=$('#exitMsg');
  const showErr=(t)=>{if(msg){msg.textContent=t;msg.hidden=false;}toast(t);};
  boxes.forEach(x=>{const row=x.closest('.gt-check');if(row)row.classList.toggle('gt-check-missing',!x.checked);});
  if(checked.length!==boxes.length){
    showErr('ابتدا همهٔ اقلام بار را کنترل و تیک بزنید؛ ردیف‌های بدون تیک با کادر قرمز مشخص شدند.');
    const first=boxes.find(x=>!x.checked); if(first)first.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  const btn=document.querySelector('[data-action="confirm-exit"]');
  if(btn){if(btn.disabled)return;btn.disabled=true;btn.dataset.exitLabel=btn.innerHTML;btn.innerHTML='در حال ثبت خروج…';btn.setAttribute('aria-busy','true');}
  if(msg){msg.hidden=true;msg.textContent='';}
  try{
    await api('/api/orders/'+id+'/exit',{method:'POST',body:JSON.stringify({checkedItems:checked})});
    toast('خروج نهایی ثبت شد.');
    await renderGate('exit');
  }catch(e){
    if(btn&&document.contains(btn)){btn.disabled=false;btn.innerHTML=btn.dataset.exitLabel||btn.innerHTML;btn.removeAttribute('aria-busy');}
    showErr(e.message||'ثبت خروج انجام نشد؛ دوباره تلاش کنید.');
  }
}

/* ---------- Sales ---------- */
