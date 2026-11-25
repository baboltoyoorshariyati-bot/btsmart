function mg38Kpi(label,value,hint,ico,tone,text=false,key=''){
  return `<article class="mg38-kpi t-${tone}"><span class="mg38-accent" aria-hidden="true"></span><span class="mg38-ico">${icon(ico,20)}</span><div class="mg38-copy"><span class="mg38-lbl">${esc(label)}</span><b class="mg38-val" data-admin-dash-count="${esc(key)}">${text?value:qty(value)}</b><small>${esc(hint)}</small></div></article>`;
}

/* ---------------- داشبورد ---------------- */
async function renderDashboard(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const d=await api('/api/dashboard'); if(app.page!=='dashboard')return; const c=d.counts||{};
  $('#content').innerHTML=`<div style="display:grid;gap:16px">
    <div class="db38-hero">
      <div class="db38-hero-right"><span class="db38-logo db38-logo-img"><img src="/logo.png" alt="بابل طیور"></span><div><h2>مرکز کنترل عملیات</h2><p>نمای لحظه‌ای از ورود مشتری، فروش، انبار، تسویه و خروج؛ با تمرکز روی اقدام بعدی هر واحد.</p></div></div>
      <div class="db38-hero-left">
        <span class="db38-live"><i></i> نمای زندهٔ سامانه</span>
        <div class="db38-date"><small>امروز</small><b>${esc(todayText())}</b></div>
        <button class="btn btn-primary" data-page="reports">${icon('reports',16)} گزارش مدیریتی</button>
        <button class="btn btn-secondary" data-page="admin">${icon('settings',16)} تنظیمات</button>
      </div>
    </div>
    <div class="mg38-kpis">
      ${mg38Kpi('ورودی امروز',c.visitsToday||0,'مراجعه ثبت‌شده در نگهبانی','gate','red',false,'visitsToday')}
      ${mg38Kpi('منتظر فروش',c.waitingSales||0,'مشتری آماده ثبت سفارش','sales','blue',false,'waitingSales')}
      ${mg38Kpi('در صف انبار',c.pendingWarehouse||0,'سفارش آماده اقدام انبار','warehouse','orange',false,'pendingWarehouse')}
      ${mg38Kpi('آماده خروج',c.readyExit||0,'فاکتور نهایی و آماده کنترل','check','green',false,'readyExit')}
      ${mg38Kpi('برنامه آینده',c.remoteScheduled||0,'سفارش‌های زمان‌بندی‌شده','calendar','purple',false,'remoteScheduled')}
    </div>
    <section class="dbc-section" id="dbCharts" aria-label="تحلیل محصولات">${dbcShell()}</section>
    <div class="db38-grid db38-grid-single">
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--blue-bg);color:var(--blue)">${icon('receipt',19)}</span><div><h2>آخرین فعالیت‌ها</h2><p>تازه‌ترین سفارش‌های ثبت‌شده در سامانه.</p></div></div><button class="btn btn-ghost btn-sm" data-page="reports">مشاهده همه ${icon('arrow',13)}</button></div>
        <div class="sd-pad"><div class="db38-activity">${(d.recent||[]).slice(0,7).map(o=>`<div class="db38-act"><span class="db38-aico">${icon(o.orderType==='REMOTE'||o.orderType==='STORE'?'calendar':'receipt',16)}</span><div><b>${esc(storeAwareOrderName(o))}</b><small>${orderKindLabel(o)} ${badge(o.status)}</small></div><time>${formatDateTime24(o.createdAt)}</time></div>`).join('')||sdEmpty('receipt','فعالیتی ثبت نشده است','با ثبت اولین مراجعه یا سفارش، رویدادها در اینجا دیده می‌شوند.')}</div></div>
      </section>
    </div>
  </div>`;
  dbcLoad();
  const host=$('#content');
  app.timer=setInterval(async()=>{
    if(app.page!=='dashboard'||$('#content')!==host||!host.querySelector('[data-admin-dash-count]'))return;
    if(host.dataset.adminDashBusy==='1')return;host.dataset.adminDashBusy='1';
    try{const data=await api('/api/dashboard');if(app.page!=='dashboard'||$('#content')!==host)return;host.querySelectorAll('[data-admin-dash-count]').forEach(el=>{const value=data.counts?.[el.dataset.adminDashCount];if(value!=null&&Number.isFinite(Number(value)))el.textContent=qty(value);});}catch{}finally{delete host.dataset.adminDashBusy;}
  },6000);
}

/* ---------------- v37.3.18 — نمودارهای داشبورد به تفکیک محصول ----------------
   جایگزین بخش «جریان عملیات». سه نمودار میله‌ای افقی (بدون کتابخانهٔ بیرونی، کاملاً آفلاین):
   ۱) فروش (مبلغ خالص فاکتورهای تسویه‌شده)  ۲) سفارش‌ها (تعداد سفارش)  ۳) تحویل انبار (کیلوگرم) */
app.dbc = app.dbc || { days:30, seq:0 };
const DBC_TOP = 7;
function dbcMoney(v){
  const n=Number(v||0), f=(x,d=1)=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:d}).format(x);
  if(n>=1e10) return `${f(n/1e9,2)} میلیارد`;
  if(n>=1e9) return `${f(n/1e6,0)} میلیون`;
  if(n>=1e6) return `${f(n/1e6)} میلیون`;
  return qty(n);
}
function dbcShell(){
  const ranges=[[1,'امروز'],[7,'۷ روز'],[30,'۳۰ روز'],[90,'۹۰ روز']];
  return `<div class="dbc-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('reports',19)}</span><div><h2>تحلیل محصولات</h2><p id="dbcRangeText">آمار فروش، سفارش‌ها و تحویل انبار به تفکیک محصول</p></div></div>
    <div class="dbc-ranges" role="group" aria-label="بازهٔ زمانی نمودارها">${ranges.map(([d,l])=>`<button type="button" class="dbc-range ${app.dbc.days===d?'active':''}" data-dbc-days="${d}">${l}</button>`).join('')}</div></div>
    <div class="dbc-grid" id="dbcGrid">${['sales','orders','warehouse'].map(k=>`<article class="dbc-card t-${k} is-loading"><div class="dbc-skel"></div><div class="dbc-skel"></div><div class="dbc-skel"></div></article>`).join('')}</div>`;
}
function dbcBars(rows, valueOf, labelOf, subOf, tone){
  if(!rows.length) return `<div class="dbc-empty">${icon('reports',22)}<b>داده‌ای در این بازه نیست</b><span>بازهٔ بلندتری انتخاب کنید.</span></div>`;
  let list=rows.slice(0,DBC_TOP);
  const rest=rows.slice(DBC_TOP);
  const total=rows.reduce((t,r)=>t+valueOf(r),0)||1;
  if(rest.length){ list=list.concat([{ _other:true, productName:`سایر محصولات (${fa(rest.length)} کالا)`, _v:rest.reduce((t,r)=>t+valueOf(r),0), _rows:rest }]); }
  const max=Math.max(1,...list.map(r=>r._other?r._v:valueOf(r)));
  return `<ol class="dbc-bars">${list.map((r,i)=>{
    const v=r._other?r._v:valueOf(r); const pct=Math.round(v/total*100); const w=Math.max(2,Math.round(v/max*100));
    const tip=r._other?r._rows.map(x=>`${x.productName}: ${labelOf(x)}`).join('\n'):`${r.productName}\n${labelOf(r)}${subOf?` • ${subOf(r)}`:''}`;
    return `<li class="dbc-bar ${r._other?'is-other':''}" title="${esc(tip)}">
      <div class="dbc-bar-top"><span class="dbc-rank">${r._other?'…':fa(i+1)}</span><span class="dbc-name">${esc(r.productName)}</span><b class="dbc-val">${r._other?esc(labelOf({_sum:v})):esc(labelOf(r))}</b></div>
      <div class="dbc-track"><i style="width:${w}%"></i><em>${fa(pct)}٪</em></div>
      ${!r._other&&subOf?`<small class="dbc-sub">${esc(subOf(r))}</small>`:''}
    </li>`; }).join('')}</ol>`;
}
function dbcUnits(u){ return Object.entries(u||{}).filter(([,v])=>v>0).map(([k,v])=>`${qty(v)} ${k}`).join(' + ') || '—'; }
function dbcRender(d){
  const S=d.sales, O=d.orders, W=d.warehouse;
  const card=(k,ico,title,metric,totalHtml,totalSub,body)=>`<article class="dbc-card t-${k}">
    <header class="dbc-card-head"><span class="dbc-ico">${icon(ico,18)}</span><div><h3>${title}</h3><small>${metric}</small></div></header>
    <div class="dbc-total"${k==='sales'?` title="${esc(money(S.totalAmount))}"`:''}><b>${totalHtml}</b><span>${totalSub}</span></div>${body}</article>`;
  const salesLabel=(r)=>r._sum!=null?`${dbcMoney(r._sum)} ریال`:`${dbcMoney(r.amount)} ریال`;
  const ordersLabel=(r)=>r._sum!=null?`${qty(r._sum)} سفارش`:`${qty(r.orders)} سفارش`;
  const whLabel=(r)=>r._sum!=null?`${qty(r._sum)} کیلوگرم`:`${qty(r.kg)} کیلوگرم`;
  $('#dbcGrid').innerHTML=
    card('sales','sales','آمار فروش به تفکیک محصول','مبلغ خالص فاکتورهای تسویه‌شده (پس از کسر مرجوعی)',`${dbcMoney(S.totalAmount)} <em>ریال</em>`,`${qty(S.invoices)} فاکتور • ${qty(S.totalKg)} کیلوگرم`,
      dbcBars(S.rows,r=>r.amount,salesLabel,r=>`${qty(r.kg)} کیلوگرم • ${qty(r.orders)} فاکتور`))
    +card('orders','receipt','آمار سفارشات به تفکیک محصول','تعداد سفارش‌های ثبت‌شده‌ای که هر محصول را دارند',`${qty(O.totalOrders)} <em>سفارش</em>`,`${qty(O.totalLines)} ردیف کالا`,
      dbcBars(O.rows,r=>r.orders,ordersLabel,r=>`درخواستی: ${dbcUnits(r.units)}`))
    +card('warehouse','warehouse','تحویل انبار به تفکیک محصول','وزن نهایی ثبت‌شده در انبار',`${qty(W.totalKg)} <em>کیلوگرم</em>`,`${qty(W.orders)} سفارش${W.outOfStock?` • ${qty(W.outOfStock)} قلم ناموجود`:''}`,
      dbcBars(W.rows.filter(r=>r.kg>0||r.outOfStock),r=>r.kg,whLabel,r=>`${qty(r.orders)} سفارش${r.outOfStock?` • ${qty(r.outOfStock)} بار ناموجود`:''}`));
  const t=$('#dbcRangeText'); if(t) t.textContent=d.from===d.to?`امروز، ${todayText()}`:`از ${dateLabel(d.from).replace(/<[^>]+>/g,'')} تا ${dateLabel(d.to).replace(/<[^>]+>/g,'')}`;
}
async function dbcLoad(){
  const host=$('#dbCharts'); if(!host) return;
  if(!host.dataset.bound){ host.dataset.bound='1'; host.addEventListener('click',e=>{ const b=e.target.closest('[data-dbc-days]'); if(!b) return; e.stopPropagation(); app.dbc.days=Number(b.dataset.dbcDays); $$('.dbc-range').forEach(x=>x.classList.toggle('active',x===b)); dbcLoad(); }); }
  const seq=++app.dbc.seq;
  try{ const d=await api('/api/dashboard/products?days='+app.dbc.days); if(seq!==app.dbc.seq||!$('#dbcGrid')) return; dbcRender(d); }
  catch(err){ const g=$('#dbcGrid'); if(g) g.innerHTML=`<div class="empty">خطا در دریافت آمار محصولات: ${esc(err.message)}</div>`; }
}

/* ---------------- گزارش‌ها ---------------- */
async function renderReports(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const d=await api('/api/reports'); const districts=d.gate.byDistrict||[]; const max=Math.max(1,...districts.map(x=>x.count)); const remote=d.remote||{};
  const barMax=Math.max(1,...(remote.byDate||[]).map(i=>i.count));
  const bars=(rows,fmt)=>rows.map(x=>`<div class="rp38-bar"><span>${esc(fmt(x))}</span><div class="rp38-track"><i style="width:${Math.max(8,Math.round(x.count/barMax*100))}%"></i></div><b>${qty(x.count)}</b></div>`).join('');
  $('#content').innerHTML=`<div style="display:grid;gap:16px">
    <div class="db38-hero">
      <div class="db38-hero-right"><span class="db38-logo db38-logo-img"><img src="/logo.png" alt="بابل طیور"></span><div><h2>مرکز گزارش‌گیری</h2><p>عملکرد عملیاتی، سفارش‌های آینده و وضعیت مالی در یک نمای یکپارچه.</p></div></div>
      <div class="db38-hero-left"><button class="btn btn-primary" data-action="rp38-print">${icon('receipt',16)} چاپ گزارش</button></div>
    </div>
    <div class="mg38-kpis">
      ${mg38Kpi('ورودی امروز',d.gate.today,'نگهبانی','gate','red')}
      ${mg38Kpi('سفارش‌های امروز',d.sales.todayOrders,'فروش','sales','blue')}
      ${mg38Kpi('تحویل‌شده',d.warehouse.deliveredOrders,'انبار','warehouse','orange')}
      ${mg38Kpi('درآمد ثبت‌شده',moneyCompact(d.finance.revenue),'مالی','receipt','green',true)}
      ${mg38Kpi('غیرحضوری برنامه‌ریزی‌شده',remote.scheduled||0,'آینده','calendar','purple')}
    </div>
    <div class="rp38-grid">
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--purple-bg);color:var(--purple)">${icon('calendar',19)}</span><div><h2>تقویم سفارش‌های غیرحضوری</h2><p>تعداد سفارش‌های برنامه‌ریزی‌شده به تفکیک تاریخ.</p></div></div></div>
        <div class="sd-pad">${(remote.byDate||[]).filter(x=>x.date!=='بدون تاریخ').slice(0,12).length?bars((remote.byDate||[]).filter(x=>x.date!=='بدون تاریخ').slice(0,12),x=>dateLabel(x.date)):'<div class="empty">سفارش غیرحضوری برنامه‌ریزی‌شده‌ای ثبت نشده است.</div>'}</div>
      </section>
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--orange-bg);color:var(--orange)">${icon('scale',19)}</span><div><h2>وضعیت صف‌ها</h2><p>تصیر فعلی عملیات در یک نگاه.</p></div></div></div>
        <div class="sd-pad"><div class="rp38-minis">
          <div class="rp38-mini"><b>${qty(d.sales.pendingWarehouse)}</b><span>صف انبار</span></div>
          <div class="rp38-mini"><b>${qty(d.sales.pendingSettlement)}</b><span>آماده تسویه</span></div>
          <div class="rp38-mini"><b>${qty(d.finance.readyExit)}</b><span>آماده خروج</span></div>
          <div class="rp38-mini"><b>${qty(remote.dueToday||0)}</b><span>غیرحضوری امروز</span></div>
        </div></div>
      </section>
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('gate',19)}</span><div><h2>ورودی بر اساس محله</h2><p>پراکنش جغرافیایی مراجعه‌کنندگان نگهبانی.</p></div></div></div>
        <div class="sd-pad">${districts.length?districts.map(x=>`<div class="rp38-bar"><span>${esc(x.district)}</span><div class="rp38-track"><i style="width:${Math.max(8,Math.round(x.count/max*100))}%"></i></div><b>${qty(x.count)}</b></div>`).join(''):'<div class="empty">داده‌ای برای نمایش نیست.</div>'}</div>
      </section>
      <section class="sd-panel rp38-highlight">
        <div class="sd-pad" style="text-align:center">
          <span class="stl-eyebrow" style="color:var(--purple)">REMOTE ORDERS</span>
          <div class="rp38-big">${qty(remote.scheduled||0)}</div>
          <b style="font-size:14px">سفارش غیرحضوری در انتظار تاریخ تحویل</b>
          <p style="margin:6px 0 0;font-size:12px;color:var(--muted)">کل ثبت‌شده: <strong>${qty(remote.total||0)}</strong> سفارش غیرحضوری</p>
        </div>
      </section>
    </div>
  </div>`;
}

/* ---------------- مدیریت ---------------- */
function ad38TabClick(e){
  const t=e.target.closest('[data-ad38-tab]'); if(!t)return;
  app.ad38Tab=t.dataset.ad38Tab;
  $$('#content [data-ad38-tab]').forEach(b=>b.classList.toggle('active',b.dataset.ad38Tab===app.ad38Tab));
  $$('#content [data-ad38-pane]').forEach(s=>s.classList.toggle('hidden-pane',s.dataset.ad38Pane!==app.ad38Tab));
}

/* ---------------- قالب چاپ فاکتور (v38) ---------------- */
/* v37.17.0 — سطرهای سند هر سرویس فقط از دادهٔ همان سرویس ساخته می‌شوند.
   وزن کل قلم (مجموع سرویس اول و دوم) هرگز نباید در سند یک سرویس نمایش داده شود. */
