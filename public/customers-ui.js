/* ============================================================
   پرونده مشتریان — هر مشتری «کد مشتری» ثابت دارد.
   نگهبانی (ورود با کد/تلفن/پلاک) و فروش و فروشگاه همه به همین پرونده وصل می‌شوند.
   ============================================================ */
const CUST_VEHICLES = ['خودرو', 'موتورسیکلت', 'وانت', 'بدون وسیله'];
const custUi = { q: '', timer: null, rows: [] };

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

function custEsc(v) { return esc(v == null ? '' : String(v)); }

async function renderCustomers() {
  const c = $('#content');
  c.innerHTML = `<section class="sd-panel cust-panel">
    <div class="sd-head">
      <div class="sd-head-main"><span class="sd-head-ico">${icon('user', 20)}</span>
        <div><h2>پرونده مشتریان</h2><p>هر مشتری یک کد ثابت دارد. مراجعه بعدی با کد و شماره تماس بررسی می‌شود؛ پلاک به‌تنهایی هویت مشتری را تعیین نمی‌کند.</p></div></div>
      <div class="sd-count"><strong id="custTotal">${fa(0)}</strong><span>مشتری</span></div>
    </div>
    <div class="cust-toolbar">
      <div class="input-shell cust-search"><span>${icon('search', 16)}</span><input id="custSearch" aria-label="جستجوی مشتری با کد، نام، تلفن، پلاک یا کد ملی" value="${custEsc(custUi.q)}" placeholder="جستجو: کد، نام، تلفن، پلاک، کد ملی" autocomplete="off"></div>
      <button class="btn btn-primary" type="button" data-action="cust-new">${icon('plus', 16)} مشتری جدید</button>
    </div>
    <div id="custList" class="cust-list"><div class="sd-queue-empty">در حال بارگذاری…</div></div>
  </section>`;
  $('#custSearch').addEventListener('input', (e) => {
    clearTimeout(custUi.timer);
    custUi.q = e.target.value;
    custUi.timer = setTimeout(custLoad, 220);
  });
  c.onclick = custClick;
  await custLoad();
}

async function custLoad() {
  const list = $('#custList');
  if (!list) return;
  try {
    const d = await api('/api/customers?limit=300&q=' + encodeURIComponent(custUi.q.trim()));
    custUi.rows = d.customers || [];
    const total = $('#custTotal'); if (total) total.textContent = fa(d.total || 0);
    list.innerHTML = custUi.rows.length ? `<div class="bt-table-wrap"><table class="bt-table cust-list-table"><caption class="bt-caption">پرونده مشتریان</caption><thead><tr><th>کد مشتری</th><th>مشتری</th><th>پلاک و محله</th><th>سوابق</th><th>عملیات</th></tr></thead><tbody>${custUi.rows.map(custRowHtml).join('')}</tbody></table></div>`
      : sdEmpty('user', 'مشتری پیدا نشد', custUi.q ? 'عبارت جستجو را تغییر دهید یا مشتری جدید ثبت کنید.' : 'با «مشتری جدید» اولین پرونده را بسازید.');
  } catch (err) { list.innerHTML = `<div class="form-error">${custEsc(err.message)}</div>`; }
}

function custRowHtml(c) {
  const plate = c.plate ? `${plateViewHtml(c.plate, '—', true)}` : '';
  const district = c.district ? `<span class="sd-chip">${custEsc(c.district)}</span>` : '';
  return `<tr class="cust-row" data-action="cust-open" data-id="${custEsc(c.id)}" tabindex="0">
    <td data-label="کد مشتری"><span class="cust-code">${custEsc(c.code)}</span></td>
    <td data-label="مشتری"><span class="cust-main"><strong>${custEsc(c.name)}</strong><small>${custEsc(c.phone || '—')}</small></span></td>
    <td data-label="پلاک و محله"><span class="cust-chips">${plate}${district}</span></td>
    <td data-label="سوابق"><span class="cust-stats">${c.debtBalance!==undefined?`<small>مانده معوق: <b>${money(c.debtBalance)}</b> • بستانکار: <b>${money(c.creditBalance||0)}</b></small>`:''}<small>${fa(c.visitCount || 0)} مراجعه • ${fa(c.orderCount || 0)} سفارش</small><small>${c.lastActivityAt ? dt(c.lastActivityAt) : 'بدون فعالیت'}</small></span></td>
    <td data-label="عملیات"><button type="button" class="btn btn-secondary btn-sm" data-action="cust-open" data-id="${custEsc(c.id)}">جزئیات</button></td>
  </tr>`;
}

function custClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'cust-new') return custForm(null);
  if (a === 'cust-open') return custDetail(el.dataset.id);
}

// فرم ثبت/ویرایش. c=null یعنی مشتری جدید.
function custFormHtml(c) {
  const v = (k) => custEsc(c?.[k] || '');
  const vt = c?.vehicleType || 'بدون وسیله';
  return `<form id="custForm" class="cust-form" data-id="${custEsc(c?.id || '')}">
    <div class="cust-form-grid">
      <label class="cust-field cust-span2"><span>نام و نام خانوادگی *</span><input name="name" required maxlength="120" value="${v('name')}"></label>
      <label class="cust-field"><span>شماره تماس *</span><input name="phone" required inputmode="tel" maxlength="30" value="${v('phone')}"></label>
      <label class="cust-field"><span>شماره دوم</span><input name="phone2" inputmode="tel" maxlength="30" value="${v('phone2')}"></label>
      <label class="cust-field"><span>کد ملی</span><input name="nationalId" inputmode="numeric" maxlength="10" value="${v('nationalId')}"></label>
      <label class="cust-field"><span>نوع وسیله</span><select name="vehicleType">${CUST_VEHICLES.map((x) => `<option ${x === vt ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <div class="cust-field"><span>پلاک</span>${plateEditorHtml(c?.plate||'',vt)}</div>
      <label class="cust-field"><span>محله</span><input name="district" maxlength="100" value="${v('district')}"></label>
      <label class="cust-field cust-span2"><span>شرکت / واحد</span><input name="company" maxlength="120" value="${v('company')}"></label>
      <label class="cust-field cust-span2"><span>نشانی</span><input name="address" maxlength="250" value="${v('address')}"></label>
      <label class="cust-field cust-span2"><span>یادداشت</span><textarea name="notes" rows="2" maxlength="1000">${v('notes')}</textarea></label>
    </div>
    <div id="custMsg" class="form-error"></div>
    <div class="cust-form-actions">
      <button class="btn btn-secondary" type="button" data-cust-cancel>انصراف</button>
      <button class="btn btn-primary" type="submit">${c ? 'ذخیره تغییرات' : 'ثبت مشتری و صدور کد'}</button>
    </div>
  </form>`;
}

function custForm(c) {
  openModal(c ? `ویرایش مشتری ${c.code}` : 'مشتری جدید', custFormHtml(c));
  const f = $('#custForm');
  bindPlateEditor(f);
  f.addEventListener('submit', (e) => custSubmit(e, c));
  f.querySelector('[data-cust-cancel]').addEventListener('click', () => (c ? custDetail(c.id) : closeModal()));
}

async function custSubmit(e, c) {
  e.preventDefault();
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));
  const msg = $('#custMsg');
  try {
    body.plate = plateEditorValue(form);
    if(c && form.querySelector('[data-plate-editor]').dataset.dirty!=='1') delete body.plate;
    const d = c
      ? await api('/api/customers/' + c.id, { method: 'PUT', body: JSON.stringify(body) })
      : await api('/api/customers', { method: 'POST', body: JSON.stringify(body) });
    toast(c ? 'پرونده مشتری به‌روز شد.' : `مشتری ثبت شد؛ کد مشتری: ${d.customer.code}`);
    await custLoad();
    await custDetail(d.customer.id);
  } catch (err) { if (msg) msg.textContent = err.message; }
}

async function custDetail(id) {
  try {
    const d = await api('/api/customers/' + id);
    const c = d.customer;
    const canDebt=['admin','sales'].includes(normalizeRole(app.user?.roleCode));
    const debts=canDebt?await api('/api/customers/'+encodeURIComponent(id)+'/debts'):null;
    const row = (label, val) => `<div class="cust-kv"><small>${label}</small><b>${custEsc(val || '—')}</b></div>`;
    const visits = (d.visits || []).map((v) => `<li><span>${dt(v.createdAt)}</span><b>${custEsc(v.purpose || 'مراجعه')}</b><small>${custEsc(v.district || '')}</small></li>`).join('');
    const orders = (d.orders || []).map((o) => `<li><span>${dt(o.createdAt)}</span><b>${custEsc(o.orderNo || '')}</b><small>${custEsc(o.orderType || '')} • ${custEsc(o.status || '')}</small></li>`).join('');
    openModal(`پرونده مشتری — ${c.code}`, `<div class="cust-detail">
      <div class="cust-hero"><span class="cust-code cust-code-lg">${custEsc(c.code)}</span>
        <div><strong>${custEsc(c.name)}</strong><small>${custEsc(c.phone || '')}</small></div>
        <button class="btn btn-secondary btn-sm" type="button" data-cust-edit>${icon('edit', 14)} ویرایش</button>${normalizeRole(app.user?.roleCode) === 'admin' ? `<button class="btn btn-secondary btn-sm" type="button" data-cust-merge>بررسی ادغام</button><button class="btn btn-secondary btn-sm" type="button" data-cust-delete>${icon('trash', 14)} حذف</button>` : ''}</div>
      <div class="cust-kv-grid">
        ${row('شماره دوم', c.phone2)}${row('کد ملی', c.nationalId)}<div class="cust-kv"><small>پلاک</small><div>${plateViewHtml(c.plate, '—', true)}</div></div>${row('نوع وسیله', c.vehicleType)}
        ${row('محله', c.district)}${row('شرکت / واحد', c.company)}${row('نشانی', c.address)}${row('یادداشت', c.notes)}
      </div>
      ${d.historicalProfiles?.length?`<details><summary>مشخصات پرونده‌های پیشین ادغام‌شده</summary>${d.historicalProfiles.map(custHistoricalProfile).join('')}</details>`:''}
      ${debts?custDebtHtml(debts):''}
      <div class="cust-history">
        <div><h4>آخرین مراجعه‌ها (${fa((d.visits || []).length)})</h4><ul>${visits || '<li class="cust-none">مراجعه‌ای ثبت نشده است.</li>'}</ul></div>
        <div><h4>سفارش‌ها (${fa((d.orders || []).length)})</h4><ul>${orders || '<li class="cust-none">سفارشی ثبت نشده است.</li>'}</ul></div>
      </div>
    </div>`);
    if(debts)custBindDebt(id,debts);
    $('#modal').querySelector('[data-cust-edit]').addEventListener('click', () => custForm(c));
    $('#modal').querySelector('[data-cust-merge]')?.addEventListener('click', () => custMergeChoose(c));
    $('#modal').querySelector('[data-cust-delete]')?.addEventListener('click', async () => {
      if (!confirm(`پرونده ${c.code} — ${c.name} حذف شود؟ این کار برگشت ندارد.`)) return;
      try { await api('/api/customers/' + c.id, { method: 'DELETE' }); toast('پرونده مشتری حذف شد.'); closeModal(); await custLoad(); }
      catch (err) { toast(err.message); }
    });
  } catch (err) { toast(err.message); }
}


function custHistoricalProfile(p){
 const fields=[['کد',p.code],['نام',p.name],['تلفن',p.phone],['تلفن دوم',p.phone2],['کد ملی',p.nationalId],['شرکت',p.company],['محله',p.district],['نشانی',p.address],['پلاک',p.plate],['وسیله',p.vehicleType],['یادداشت',p.notes]];
 return `<div class="detail-note"><div>${fields.map(([k,v])=>`<p><b>${k}:</b> ${custEsc(v||'—')}</p>`).join('')}</div></div>`;
}

// Two-step admin review. The secondary profile is archived, not deleted;
// original orders, visits and financial records keep their existing identities.
async function custMergeChoose(customer){
 try{
  const data=await api('/api/customers/'+encodeURIComponent(customer.id)+'/merge-candidates');
  if(!data.candidates?.length)return toast('پرونده دیگری با شماره تماس مشترک پیدا نشد.');
  openModal('بررسی ادغام پرونده‌های مشتری',`<form id="custMergeForm" class="cust-form"><p>فقط زمانی ادغام کنید که مطمئن هستید هر دو پرونده متعلق به یک شخص‌اند. داشتن شماره مشترک به‌تنهایی اثبات هویت نیست.</p><div class="cust-form-grid"><label class="cust-field cust-span2"><span>پرونده دیگر</span><select name="other" required>${data.candidates.map(x=>`<option value="${custEsc(x.id)}">${custEsc(x.code)} — ${custEsc(x.name)} — ${custEsc(x.phone)}</option>`).join('')}</select></label><label class="cust-field cust-span2"><span>پرونده‌ای که به عنوان اصلی باقی می‌ماند</span><select name="primaryChoice"><option value="current">${custEsc(customer.code)} — ${custEsc(customer.name)}</option><option value="other">پرونده انتخاب‌شده در بالا</option></select></label></div><div id="custMergeMsg" class="form-error"></div><div id="custMergePreview"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button type="button" class="btn btn-secondary" data-merge-preview>پیش‌نمایش و بررسی سوابق</button></div></form>`);
  const form=$('#custMergeForm'), output=$('#custMergePreview'),msg=$('#custMergeMsg');let selected=null;
  const clear=()=>{selected=null;output.innerHTML='';msg.textContent='';};form.elements.other.onchange=clear;form.elements.primaryChoice.onchange=clear;
  form.querySelector('[data-merge-preview]').onclick=async()=>{
   clear();const other=form.elements.other.value,primaryId=form.elements.primaryChoice.value==='current'?customer.id:other,secondaryId=primaryId===customer.id?other:customer.id;
   try{
    selected=await api('/api/customers/merge-preview',{method:'POST',body:JSON.stringify({primaryId,secondaryId})});
    const box=(label,c)=>`<section class="detail-note"><div><b>${label}: ${custEsc(c.code)} — ${custEsc(c.name)}</b><p>${qty(c.visitCount)} مراجعه · ${qty(c.orderCount)} سفارش · ${qty(c.invoiceCount)} فاکتور/پرداخت</p><p>بدهکاری: ${money(c.balance)} · بستانکاری: ${money(c.credit)} · چک در انتظار: ${money(c.pending)}</p><details><summary>مشخصات همه پرونده‌های این گروه</summary>${c.profiles.map(custHistoricalProfile).join('')}</details><details><summary>مراجعه‌ها (${qty(c.visits.length)})</summary><ul>${c.visits.map(v=>`<li>${custEsc(v.createdAt||'—')} · ${custEsc(v.purpose||'مراجعه')} · ${custEsc(v.status||'—')} · ${custEsc(v.district||'—')}</li>`).join('')||'<li>بدون مراجعه</li>'}</ul></details><details><summary>سفارش‌ها (${qty(c.orders.length)})</summary><ul>${c.orders.map(o=>`<li>${custEsc(o.orderNo||o.id)} · ${custEsc(o.createdAt||'—')} · ${custEsc(o.orderType||'—')} · ${custEsc(o.status||'—')}</li>`).join('')||'<li>بدون سفارش</li>'}</ul></details><details><summary>فاکتورها و پرداخت‌ها (${qty(c.payments.length)})</summary><ul>${c.payments.map(p=>`<li>فاکتور ${custEsc(p.invoiceNumber||p.id)} · ${custEsc(p.verifiedAt||'—')} · ${money(p.totalAmount||0)} ${Array.isArray(p.settlementMethods)?p.settlementMethods.map(m=>` · ${custEsc(m.type||'')} ${money(m.amount||0)}`).join(''):''}</li>`).join('')||'<li>بدون فاکتور</li>'}</ul></details><details><summary>حساب معوق و دریافت‌ها (${qty(c.debts.length)})</summary><ul>${c.debts.map(i=>`<li>فاکتور ${custEsc(i.invoiceNumber||i.paymentId)} · بدهی ${money(i.balance)} · بستانکاری ${money(i.credit||0)} · چک در انتظار ${money(i.pending)}<ul>${i.receipts.map(r=>`<li>${custEsc(r.type)} · ${money(r.amount)} · ${custEsc(r.status)} ${custEsc(r.bank||'')} ${custEsc(r.checkNumber||'')} ${custEsc(r.dueDate||'')}</li>`).join('')}</ul></li>`).join('')||'<li>بدون حساب معوق</li>'}</ul></details></div></section>`;
    output.innerHTML=box('پرونده اصلی',selected.primary)+box('پرونده‌ای که از فهرست حذف و در سوابق نگهداری می‌شود',selected.secondary)+`<p>هیچ سفارش، مراجعه، فاکتور یا دریافت حذف یا بازنویسی نمی‌شود. نام و کد قدیمی برای سوابق قبلی حفظ می‌شود؛ جمع سوابق و حساب‌ها در پرونده اصلی قابل مشاهده خواهد بود. شماره‌های پرونده قدیمی همچنان به پرونده اصلی مربوط می‌مانند.</p><label class="adm-check"><input type="checkbox" data-merge-confirm> تأیید می‌کنم هر دو پرونده مربوط به یک مشتری هستند و پیش‌نمایش را بررسی کرده‌ام.</label><div class="modal-actions"><button type="button" class="btn btn-primary" data-merge-submit>تأیید نهایی ادغام</button></div>`;
    output.querySelector('[data-merge-submit]').onclick=async e=>{
     if(!output.querySelector('[data-merge-confirm]').checked){msg.textContent='ابتدا تأیید بررسی هویت را انتخاب کنید.';return;}
     if(!confirm('دو پرونده برای یک مشتری ادغام شوند؟ سوابق قبلی حفظ می‌شوند.'))return;
     const button=e.currentTarget;button.disabled=true;msg.textContent='';try{await api('/api/customers/merge',{method:'POST',body:JSON.stringify({primaryId,secondaryId,revision:selected.revision,confirmed:true})});toast('پرونده‌ها ادغام شدند؛ سوابق اصلی حفظ شد.');await custLoad();await custDetail(primaryId);}catch(err){msg.textContent=err.message;button.disabled=true;selected=null;}
    };
   }catch(err){msg.textContent=err.message;}
  };
 }catch(err){toast(err.message);}
}


// حساب معوق فقط برای فاکتورهای جدید دارای معوق ایجاد می‌شود. چک تا
// تأیید وصول از مانده کسر نمی‌شود، ولی مبلغ آن برای دریافت دیگر رزرو است.
function custDebtHtml(data){
 const labels={CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک'};
 const status={PENDING:'در انتظار وصول',CLEARED:'وصول‌شده',RETURNED:'برگشتی',REVERSED:'ابطال‌شده'};
 return `<section class="cust-debt" aria-label="حساب معوق مشتری"><h3>حساب معوق و مانده</h3><p>بدهکاری کل: <b>${money(data.balance)}</b> • بستانکاری کل: <b>${money(data.credit||0)}</b> • چک در انتظار وصول: <b>${money(data.pending)}</b></p>
 <p class="cust-debt-hint">فقط حساب‌های ثبت‌شده یا اصلاح‌شده در سامانه نمایش داده می‌شوند؛ ماندهٔ فاکتورهای قدیمی ممکن است ثبت نشده باشد.</p>
 ${data.invoices.length?`<div class="bt-table-wrap"><table class="bt-table cust-debt-table"><caption class="bt-caption">فاکتورهای معوق مشتری</caption><thead><tr><th>فاکتور و سفارش</th><th>مبالغ</th><th>دریافت‌ها</th><th>عملیات</th></tr></thead><tbody>${data.invoices.map(inv=>`<tr class="cust-debt-invoice"><td data-label="فاکتور و سفارش"><b>فاکتور ${custEsc(fa(inv.invoiceNumber||'—'))}</b> • سفارش ${custEsc(fa(inv.orderNo||'—'))}<br><small>${custEsc(dt(inv.createdAt))}</small></td>
 <td data-label="مبالغ"><div class="cust-debt-values"><span>معوق و چک ثبت‌شده: <b>${money(inv.initial)}</b></span><span>وصول‌شده: <b>${money(inv.paid)}</b></span><span>بدهکاری: <b>${money(inv.balance)}</b></span><span>بستانکاری: <b>${money(inv.credit||0)}</b></span>${inv.adjustment?`<span>تعدیل فاکتور: <b>${inv.adjustment<0?'−':'+'}${money(Math.abs(inv.adjustment))}</b></span>`:''}<span>چک در انتظار: <b>${money(inv.pending)}</b></span><span>قابل دریافت: <b>${money(inv.available)}</b></span></div></td>
 <td data-label="دریافت‌ها">${inv.receipts.length?`<div class="bt-table-wrap"><table class="bt-table cust-receipts-table"><caption class="bt-caption">دریافت‌های فاکتور ${custEsc(fa(inv.invoiceNumber||'—'))}</caption><thead><tr><th>دریافت</th><th>جزئیات</th><th>عملیات</th></tr></thead><tbody>${inv.receipts.map(r=>`<tr class="cust-debt-receipt"><td data-label="دریافت"><b>${custEsc(labels[r.type]||r.type)}</b> • ${money(r.amount)} • ${custEsc(status[r.status]||r.status)}</td><td data-label="جزئیات"><small>${custEsc(dt(r.createdAt))} • ${custEsc(r.createdByName||'—')}${r.bank?' • '+custEsc(r.bank):''}${r.checkNumber?' • چک '+custEsc(r.checkNumber):''}${r.dueDate?' • سررسید '+custEsc(fa(r.dueDate)):''}${r.reference?' • پیگیری '+custEsc(r.reference):''}${r.deviceSnapshot?.title?' • دستگاه '+custEsc(r.deviceSnapshot.title):''}${r.resolvedAt?' • تعیین وضعیت: '+custEsc(dt(r.resolvedAt))+' '+custEsc(r.resolvedByName||''):''}${r.reversedAt?' • ابطال: '+custEsc(dt(r.reversedAt))+' '+custEsc(r.reversedByName||''):''}</small></td><td data-label="عملیات">${r.status==='PENDING'?`<span class="cust-debt-actions"><button type="button" class="btn btn-secondary btn-sm" data-debt-check="${custEsc(r.id)}" data-payment="${custEsc(inv.paymentId)}" data-status="CLEARED">تأیید وصول</button><button type="button" class="btn btn-secondary btn-sm" data-debt-check="${custEsc(r.id)}" data-payment="${custEsc(inv.paymentId)}" data-status="RETURNED">برگشت چک</button></span>`:r.status==='CLEARED'&&normalizeRole(app.user?.roleCode)==='admin'?`<span class="cust-debt-actions"><button type="button" class="btn btn-secondary btn-sm" data-debt-check="${custEsc(r.id)}" data-payment="${custEsc(inv.paymentId)}" data-status="REVERSED">ابطال دریافت</button></span>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:'<small>دریافتی ثبت نشده است.</small>'}</td>
 <td data-label="عملیات"><button type="button" class="btn btn-secondary btn-sm" data-debt-receive="${custEsc(inv.paymentId)}" ${inv.available<=0?'disabled':''}>ثبت دریافت</button></td></tr>`).join('')}</tbody></table></div>`:'<p>فاکتور معوق جدیدی ثبت نشده است.</p>'}</section>`;
}
function custBindDebt(id,data){
 const modal=$('#modal');
 modal.querySelectorAll('[data-debt-receive]').forEach(button=>button.addEventListener('click',()=>{
  const inv=data.invoices.find(x=>x.paymentId===button.dataset.debtReceive);if(inv)custDebtReceive(id,inv);
 }));
 modal.querySelectorAll('[data-debt-check]').forEach(button=>button.addEventListener('click',async()=>{
  if(!confirm(button.dataset.status==='CLEARED'?'وصول این چک تأیید شود؟':button.dataset.status==='REVERSED'?'این دریافت ابطال شود و مبلغ به مانده بازگردد؟':'چک برگشتی ثبت شود؟'))return;
  button.disabled=true;try{
   await api(`/api/customers/${encodeURIComponent(id)}/debts/${encodeURIComponent(button.dataset.payment)}/receipts/${encodeURIComponent(button.dataset.debtCheck)}/resolve`,{method:'POST',body:JSON.stringify({status:button.dataset.status})});
   toast('وضعیت دریافت ثبت شد.');await custLoad();await custDetail(id);
  }catch(e){button.disabled=false;toast(e.message);}
 }));
}
async function custDebtReceive(id,inv){
 try{
  const {devices=[]}=await api('/api/payment-devices');
  openModal('ثبت دریافت معوق',`<form id="custDebtForm" class="cust-form"><p>فاکتور ${custEsc(fa(inv.invoiceNumber||'—'))} • مانده ${money(inv.balance)} • قابل دریافت ${money(inv.available)}</p><div class="cust-form-grid">
  <label class="cust-field"><span>روش دریافت</span><select name="type"><option value="CASH">نقدی</option><option value="POS">پوز</option><option value="CARD_TRANSFER">کارت‌به‌کارت</option><option value="CHECK">چک</option></select></label>
  <label class="cust-field"><span>مبلغ (ریال)</span><input name="amount" inputmode="numeric" required value="${custEsc(new Intl.NumberFormat('fa-IR').format(inv.available))}"></label>
  <label class="cust-field" data-debt-pos hidden><span>دستگاه پوز</span><select name="deviceId"><option value="">انتخاب دستگاه</option>${devices.map(d=>`<option value="${custEsc(d.id)}">${custEsc(d.title)} • ${custEsc(d.bank)} • ${custEsc(d.terminalNumber)}</option>`).join('')}</select></label>
  <label class="cust-field" data-debt-bank hidden><span>بانک</span><input name="bank" maxlength="100"></label>
  <label class="cust-field" data-debt-ref hidden><span>شماره پیگیری</span><input name="reference" maxlength="100"></label>
  <label class="cust-field" data-debt-check-fields hidden><span>شماره چک</span><input name="checkNumber" maxlength="100"></label>
  <label class="cust-field" data-debt-check-fields hidden><span>سررسید چک</span><input name="dueDate" data-debt-due type="date"></label>
  </div><p id="custDebtHint" class="cust-debt-hint" hidden>چک تا تأیید وصول از مانده کسر نمی‌شود.</p><div id="custDebtError" class="form-error" role="alert"></div><div class="cust-form-actions"><button type="button" class="btn btn-secondary" data-debt-back>بازگشت</button><button type="submit" class="btn btn-primary">ثبت دریافت</button></div></form>`);
  const form=$('#custDebtForm');const type=form.elements.type;const dueInput=form.querySelector('[data-debt-due]');const operationId=newIdempotencyKey();
  form.elements.amount.addEventListener('input',()=>transportFormatMoneyInput(form.elements.amount));
  const change=()=>{const t=type.value;form.querySelector('[data-debt-pos]').hidden=t!=='POS';form.querySelector('[data-debt-bank]').hidden=!['CARD_TRANSFER','CHECK'].includes(t);form.querySelector('[data-debt-ref]').hidden=!['POS','CARD_TRANSFER'].includes(t);form.querySelectorAll('[data-debt-check-fields]').forEach(x=>x.hidden=t!=='CHECK');form.elements.deviceId.required=t==='POS';form.elements.bank.required=['CARD_TRANSFER','CHECK'].includes(t);form.elements.reference.required=t==='CARD_TRANSFER';form.elements.checkNumber.required=t==='CHECK';dueInput.required=t==='CHECK';$('#custDebtHint').hidden=t!=='CHECK';};
  type.addEventListener('change',change);change();form.querySelector('[data-debt-back]').addEventListener('click',()=>custDetail(id));
  form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;$('#custDebtError').textContent='';try{
   const body=Object.fromEntries(new FormData(form));body.amount=transportMoneyNumber(body.amount);body.operationId=operationId;if(body.type==='CHECK'){const visible=dueInput.parentElement.querySelector('.ui-jdate');body.dueDate=visible?jalaliToIso(normalizeJalaliText(visible.value)):dueInput.value;if(!body.dueDate)throw new Error('سررسید چک معتبر نیست.');}await api(`/api/customers/${encodeURIComponent(id)}/debts/${encodeURIComponent(inv.paymentId)}/receipts`,{method:'POST',body:JSON.stringify(body)});
   toast('دریافت ثبت شد.');await custLoad();await custDetail(id);
  }catch(err){$('#custDebtError').textContent=err.message;button.disabled=false;}});
 }catch(err){toast(err.message);}
}

// ---- ورود نگهبانی: انتخاب مشتری قبلی با کد یا از پیشنهادها ----
function custGateChip(c) {
  const box = $('#gateCustChip');
  if (!box) return;
  box.innerHTML = c
    ? `<div class="cust-chip-picked">${icon('user', 14)} مشتری قبلی: <b>${custEsc(c.code)}</b> — ${custEsc(c.name)} <button type="button" class="cust-chip-x" data-action="gate-cust-clear">لغو انتخاب</button></div>`
    : '';
}

// «7»، «00007» یا «C-00007» → 00007
function custCodeOf(raw) {
  const s = en(String(raw || '')).trim().toUpperCase().replace(/\s+/g, '');
  const m = /^(?:C-?)?(\d{1,8})$/.exec(s);
  return m ? m[1].padStart(5, '0') : s;
}

let gateSearchTimer = null;
let gateSearchSeq = 0;
let gateSearchMatches = [];
function gateSearchReset() {
  clearTimeout(gateSearchTimer); gateSearchSeq++; gateSearchMatches=[];
  const results=$('#gateCustomerResults'); if(results)results.innerHTML='';const input=$('#gateCustCode');if(input)input.setAttribute('aria-expanded','false');
}
async function gateSearchCustomers(raw, input, seq, exact=false) {
  const results=$('#gateCustomerResults');
  if(!input || !results || !raw)return;
  results.textContent='در حال جستجو…';input.setAttribute('aria-expanded','true');
  try {
    const d=await api('/api/customers/search?q='+encodeURIComponent(raw));
    if(seq!==gateSearchSeq || !input.isConnected || $('#gateCustCode')!==input || input.value.trim()!==raw)return;
    gateSearchMatches=d.customers||[];
    const match=exact && gateSearchMatches.find(x=>String(x.code).toUpperCase()===custCodeOf(raw));
    if(match){gateSearchReset();gateFillCustomer(match);return;}
    results.innerHTML=gateSearchMatches.length?gateSearchMatches.map((c,i)=>`<button type="button" class="gate-customer-result" data-action="gate-search-pick" data-index="${i}"><strong>${custEsc(c.name||'—')}</strong><span>کد ${custEsc(fa(c.code||'—'))} • ${custEsc(fa(c.phone||'—'))} • پلاک: <bdi>${custEsc(fa(c.plate||'ثبت نشده'))}</bdi></span></button>`).join(''):'<p>مشتری پیدا نشد.</p>';
  } catch(err) {
    if(seq===gateSearchSeq && input.isConnected && $('#gateCustCode')===input)results.textContent='خطا در جستجوی مشتری؛ دوباره تلاش کنید.';
  }
}
function gateSearchInput(input) {
  gateSearchReset();
  const id=$('#gateCustId'),code=$('#gateCustomerCodeValue');if(id)id.value='';if(code)code.value='';custGateChip(null);
  const raw=input.value.trim();if(!raw)return;
  const seq=gateSearchSeq;gateSearchTimer=setTimeout(()=>gateSearchCustomers(raw,input,seq),200);
}
function gateCodeLookup() {
  const input=$('#gateCustCode'),raw=(input?.value||'').trim();
  if(!raw)return toast('عبارت جستجوی مشتری را وارد کنید.');
  gateSearchReset();gateSearchCustomers(raw,input,gateSearchSeq,true);
}

function gateFillCustomer(c) {
  if(app.pickupSelected)return;
  const f = $('#gateForm');
  if (!f) return;
  f.elements.name.value = c.name || '';
  f.elements.phone.value = c.phone || '';
  f.elements.vehicleType.value = c.vehicleType==='موتورسیکلت'?'موتورسیکلت':'خودرو';
  f.elements.carType.value = c.carType || (c.vehicleType==='وانت'?'وانت':'');
  $('#plateBox').innerHTML = plateEditorHtml(c.plate || '',f.elements.vehicleType.value);
  bindPlate();
  $('#gateCustId').value = c.id;
  $('#gateCustCode').value = c.code;
  $('#gateCustomerCodeValue').value = c.code;
  const noVehicle=$('#noVehicle'); if(noVehicle){noVehicle.checked=c.vehicleType==='بدون وسیله';$('#plateBox').hidden=noVehicle.checked;}
  if(typeof syncGateVehicleFields==='function')syncGateVehicleFields();
  gateSearchReset();
  $('#plateSuggest').innerHTML = '';
  custGateChip(c);
}

// جایگزین pickCustomer در app.js: انتخاب از پیشنهادهای پلاک/نام/تلفن، همراه با کد مشتری.
function pickCustomer(i) {
  const c = app.customerMatches[i];
  if (!c) return;
  gateFillCustomer(c);
  toast(`سوابق مشتری ${c.code} بازیابی شد.`);
}

function gateClearCustomer() {
  const id = $('#gateCustId'); if (id) id.value = '';
  const code = $('#gateCustCode'); if (code) code.value = '';
  const stored=$('#gateCustomerCodeValue');if(stored)stored.value='';
  gateSearchReset();custGateChip(null);
}

// رویدادهای سراسری کارت‌های مشتری در نگهبانی و مودال‌ها
document.addEventListener('click', (e) => {
  if (!e.target.closest('.cust-code-entry')) gateSearchReset();
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'gate-code-lookup') return gateCodeLookup();
  if (el.dataset.action === 'gate-search-pick') { const c=gateSearchMatches[Number(el.dataset.index)];if(c)gateFillCustomer(c);return; }
  if (el.dataset.action === 'gate-cust-clear') return gateClearCustomer();
});
document.addEventListener('input', (e) => { if(e.target.id==='gateCustCode')gateSearchInput(e.target); });
document.addEventListener('keydown', (e) => {
  if(e.target.id==='gateCustCode'){
    if(e.key==='Escape'){gateSearchReset();e.preventDefault();return;}
    if(e.key==='ArrowDown'){const first=$('#gateCustomerResults button');if(first){e.preventDefault();first.focus();}return;}
    if(e.key==='Enter'){e.preventDefault();if(gateSearchMatches.length)gateFillCustomer(gateSearchMatches[0]);else gateCodeLookup();return;}
  }
  const row = e.target.closest?.('[data-action="cust-open"]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); custDetail(row.dataset.id); }
});
