function scState(v){ return v?.status==='IN_PROGRESS'?'باز':v?.status==='DONE'?'تکمیل':v?.status==='CANCELLED'?'لغو':'—'; }
function scRenderShell(){
  const c=$('#content'); if(!c) return;
  const r=normalizeRole(app.user?.roleCode);
  c.innerHTML=`<section class="sc2">
    <div class="sc2-bar">
      <div><span class="eyebrow">WEIGHBRIDGE CONSOLE</span><h2>کنسول باسکول</h2></div>
      <div class="sc2-bar-meta"><span id="scLinkChip" class="sc2-link">در انتظار دستگاه</span></div>
    </div>
    <div class="sc2-main">
      <section class="sc2-scale card" id="scLiveCard">
        <div class="sc2-scale-head"><span>وزن زنده</span><span id="scStable" class="badge">در انتظار دستگاه</span></div>
        <div class="sc2-readout"><b id="scWeight" class="sc2-number">—</b><span>کیلوگرم</span></div>
        <div class="sc2-scale-foot"><small id="scAge"></small><small>خط آخر: <span id="scRaw">—</span></small></div>
        <ol class="sc2-steps" aria-label="مراحل وزن‌کشی">
          <li id="scStep1" class="sc2-step"><span>۱</span><div><b>وزن ورود</b><small>وسیله‌ی تازه</small></div></li>
          <li id="scStep2" class="sc2-step"><span>۲</span><div><b>وزن خروج</b><small>محاسبه‌ی خالص</small></div></li>
        </ol>
      </section>
      <section class="sc2-op card">
        <div class="sc2-op-head"><div><span class="eyebrow">OPERATION</span><h3>ثبت وزن وسیله</h3></div><span id="scPhase" class="sc-phase entry">ورود (وزن اول)</span></div>
        <label class="sc2-field"><span>انتخاب پلاک ثبت‌شده یا داخل باسکول</span><select id="scExistingPlate"><option value="">ورود پلاک جدید</option></select></label>
        <input type="hidden" id="scPlate"><div id="scSelectedPreview"></div><small id="scPlateNotice" role="status"></small>
        <div id="scManualWrap"><label class="sc2-field"><span>نوع پلاک جدید</span><select id="scManualType"><option>خودرو</option><option>موتورسیکلت</option></select></label><div id="scManualEditor">${plateEditorHtml()}</div></div>
        <div id="scOpenHint" class="sc2-hint"></div>
        <div class="sc2-field"><span>کالا <small>(برای ورود)</small></span><input id="scTileSearch" class="sc2-tile-search" placeholder="جستجوی کالا (نام یا کد)" autocomplete="off"><div id="scTiles" class="sc2-tiles"></div><select id="scProduct" hidden></select></div>
        <label class="sc2-field" id="scCustomerWrap"><span>نام مشتری یا طرف حساب <small>(اختیاری، برای ورود)</small></span><input id="scCustomer" maxlength="120" placeholder="نام مشتری یا طرف حساب" autocomplete="off"></label>
        <button type="button" class="sc2-weigh" data-sc="weigh" id="scWeighBtn" disabled>ثبت وزن</button>
        <div id="scMsg" class="sc-msg" hidden></div>
      </section>
      <aside class="sc2-side">
        <section class="card sc2-ticket" id="scTicket"><div class="sc2-ticket-head"><span class="eyebrow">TICKET</span><h3>پیش‌نمایش فیش</h3></div><div id="scTicketBody" class="sc2-ticket-body"><p class="sc2-empty-line">پلاکی را انتخاب کنید تا وزن ورود و خالص زنده نمایش داده شود.</p></div></section>
        <section class="card sc2-panel"><div class="sc2-panel-head"><h3>داخل باسکول</h3><span id="scOpenCount" class="count-chip">۰</span></div><div id="scOpen"></div></section>
      </aside>
    </div>
    <section class="card sc2-panel sc2-done"><div class="sc2-panel-head"><h3>آخرین وزن‌کشی‌های تکمیل‌شده</h3></div><div id="scDone"></div></section>
    <details class="card sc2-admin">
      <summary><span>افزودن وسیله و کالا</span><small>${r==='admin'?'وسیله، کالا و شبیه‌ساز':'وسیله'}</small></summary>
      <div class="sc2-admin-grid">
        <div class="sc2-admin-block"><h4>ثبت وسیله جدید</h4>
          <label class="sc2-field"><span>نوع پلاک</span><select id="scNewType"><option>خودرو</option><option>موتورسیکلت</option></select></label><div id="scNewEditor">${plateEditorHtml()}</div>
          <label class="sc2-field"><span>نام راننده</span><input id="scNewDriver" placeholder="اختیاری"></label>
          <button type="button" class="sc-secondary" data-sc="add-vehicle">افزودن وسیله</button></div>
        ${r==='admin'?`<div class="sc2-admin-block"><h4>افزودن کالا به کاتالوگ</h4>
          <label class="sc2-field"><span>کد سریع (دو رقمی)</span><input id="scPCode" inputmode="numeric" maxlength="2"></label>
          <label class="sc2-field"><span>نام کالا</span><input id="scPName"></label>
          <label class="sc2-field"><span>واحد پایه</span><select id="scPUnit">${SC_UNITS.map(u=>`<option>${u}</option>`).join('')}</select></label>
          <button type="button" class="sc-secondary" data-sc="add-product">افزودن کالا</button></div>`:''}
      </div>
    </details>
    ${r==='admin'?`<details class="card sc2-admin" id="scTcDetails"><summary><span>تنظیم چاپ فیش</span><small>اندازه کاغذ، ستون‌ها، ردیف‌ها و محل فیلدها</small></summary><div id="scTcBody" class="sc2-tc-body"><p class="sc2-empty-line">برای دیدن تنظیمات باز کنید.</p></div></details>`:''}
    <div id="scSim"></div>
  </section>`;
}
function scSetMsg(text,kind){ const m=$('#scMsg'); if(!m) return; m.hidden=!text; m.textContent=text||''; m.className='sc-msg '+(kind||''); }
function scLiveUpdate(L,settings){
  const w=$('#scWeight'); if(!w) return;
  const chip=$('#scLinkChip'); if(chip){ chip.textContent = !L.updatedAt?'در انتظار دستگاه':!L.fresh?'قطع ارتباط':'دستگاه متصل'; chip.className='sc2-link '+(L.updatedAt&&L.fresh?'on':'off'); }
  w.textContent = L.weight==null ? 'بدون داده' : qty(L.weight);
  w.classList.toggle('sc-nodata', L.weight==null);
  const b=$('#scStable'); if(b){ const ok=L.fresh&&L.stable; b.textContent= !L.updatedAt?'در انتظار دستگاه':!L.fresh?'قطع ارتباط / قدیمی':L.stable?'پایدار':'ناپایدار'; b.className='badge '+(ok?'green':'orange'); }
  const a=$('#scAge'); if(a) a.textContent = L.updatedAt?('آخرین به‌روزرسانی: '+formatDateTime24(L.updatedAt)):'';
  const raw=$('#scRaw'); if(raw) raw.textContent = L.source?L.source:'—';
}
function scListOpen(open){
  return open.length? `<div class="sc-list">${open.map(t=>`<article class="sc-item"><div>${plateViewHtml(t.plate, '—', true)}<small>${esc(t.productName||'—')} • ${esc(t.driverName||'')}</small></div><div class="sc-item-w"><small>ورود</small><b>${qty(t.firstWeight)} کیلو</b><small>${formatDateTime24(t.firstAt)}</small></div><button type="button" class="sc-ghost" data-sc="cancel" data-id="${esc(t.id)}">لغو</button></article>`).join('')}</div>` : '<div class="sc-empty">وسیله‌ای داخل باسکول نیست.</div>';
}
function scListDone(done){
  return done.length? `<div class="sc-list">${done.map(t=>`<article class="sc-item"><div>${plateViewHtml(t.plate, '—', true)}<small>${esc(t.productName||'—')} • ${formatDateTime24(t.closedAt)}</small></div><div class="sc-item-w"><small>خالص</small><b>${qty(t.netKg)} کیلو</b><small>بار ${qty(t.loadedKg)} • خالی ${qty(t.emptyKg)}</small></div><button type="button" class="sc-ghost" data-sc="print" data-id="${esc(t.id)}">چاپ فیش</button></article>`).join('')}</div>` : '<div class="sc-empty">هنوز وزن‌کشی تکمیل‌شده‌ای نیست.</div>';
}
function scFillSelects(st){
  const sig=JSON.stringify([st.vehicles.map(v=>v.plate+v.driverName),st.open.map(t=>t.plate),st.products.map(p=>p.id+p.name)]);
  if(sig===app.sc.sig) return; app.sc.sig=sig;
  const existing=$('#scExistingPlate');if(existing){const keep=existing.value;const choices=[...new Set([...st.open.map(t=>t.plate),...st.vehicles.map(v=>v.plate)].filter(Boolean))];existing.innerHTML='<option value="">ورود پلاک جدید</option>'+choices.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');existing.value=choices.includes(keep)?keep:'';if(keep&&!existing.value)scSyncPlate();}
  const sel=$('#scProduct'); const keep=sel?sel.value:'';
  if(sel) sel.innerHTML='<option value="">— انتخاب کالا —</option>'+st.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(sel && keep) sel.value=keep;
  const tiles=$('#scTiles');
  if(tiles) tiles.innerHTML=st.products.length? st.products.map(p=>`<button type="button" class="sc2-tile" data-sc="pick" data-id="${esc(p.id)}" aria-pressed="false"><b>${esc(p.name)}</b></button>`).join('') : '<div class="sc2-empty-line">کالایی ثبت نشده است. مدیر می‌تواند از بخش «افزودن وسیله و کالا» کالا اضافه کند.</div>';
  scMarkTile();
}
function scMarkTile(){
  const v=$('#scProduct')?.value||'';
  document.querySelectorAll('.sc2-tile').forEach(t=>{ const on=t.dataset.id===v; t.classList.toggle('on',on); t.setAttribute('aria-pressed',on?'true':'false'); });
}
function scPhaseHint(st){
  const L=st.live;
  const plate=en($('#scPlate')?.value||'').trim();
  const open=plate? st.open.find(t=>t.plate===plate):null;
  const isOpen=!!open;
  const ph=$('#scPhase'); const hint=$('#scOpenHint'); const pr=$('#scProduct');
  if(ph){ ph.textContent = isOpen?'خروج (وزن دوم)':'ورود (وزن اول)'; ph.className='sc-phase '+(isOpen?'exit':'entry'); }
  if(pr) pr.disabled=isOpen;
  const cu=$('#scCustomer'); if(cu) cu.disabled=isOpen;
  document.querySelectorAll('.sc2-tile').forEach(t=>{ t.disabled=isOpen; });
  if(hint) hint.textContent = !plate ? 'پلاک را وارد کنید؛ اگر وسیله داخل باسکول باشد، خروج خودکار انتخاب می‌شود.' : isOpen ? 'این وسیله داخل باسکول است؛ با ثبت این وزن، خروج و وزن خالص محاسبه می‌شود.' : 'اولین وزن ورود است؛ کالا را انتخاب کنید. با وزن دوم، سنگین‌تر بار و سبک‌تر خالی تشخیص داده می‌شود.';
  const s1=$('#scStep1'), s2=$('#scStep2');
  if(s1&&s2){ s1.classList.toggle('active',!isOpen); s1.classList.toggle('done',isOpen); s2.classList.toggle('active',isOpen); }
  const btn=$('#scWeighBtn');
  if(btn){
    const ready=!!(L.fresh&&L.stable&&L.weight>=st.settings.minStableKg);
    btn.disabled = !(ready && plate && (isOpen || productIdSelected()) && !app.sc.busy);
    btn.textContent = isOpen ? 'ثبت وزن خروج' : 'ثبت وزن ورود';
    btn.classList.toggle('ready',ready);
  }
  scTicket(st, open, plate);
}
function productIdSelected(){ return !!($('#scProduct')?.value); }
function scTicket(st, open, plate){
  const body=$('#scTicketBody'); if(!body) return;
  const L=st.live; const s=st.settings;
  if(!plate){ body.innerHTML='<p class="sc2-empty-line">پلاکی را انتخاب کنید تا وزن ورود و خالص زنده نمایش داده شود.</p>'; return; }
  if(!open){
    body.innerHTML=`<dl class="sc2-dl"><div><dt>پلاک</dt><dd>${plateViewHtml(plate, '—', true)}</dd></div><div><dt>وضعیت</dt><dd>ورود جدید</dd></div><div><dt>وزن فعلی</dt><dd>${L.weight==null?'—':qty(L.weight)+' کیلو'}</dd></div></dl><p class="sc2-empty-line">با ثبت این وزن، فیش ورود صادر می‌شود.</p>`;
    return;
  }
  const live=L.weight; const diff=live==null?null:Math.abs(live-open.firstWeight);
  const net = diff!=null && diff>=s.minDiffKg ? diff : null;
  body.innerHTML=`<dl class="sc2-dl"><div><dt>کالا</dt><dd>${esc(open.productName||'—')}</dd></div><div><dt>وزن ورود</dt><dd>${qty(open.firstWeight)} کیلو</dd></div><div><dt>وزن فعلی</dt><dd>${live==null?'—':qty(live)+' کیلو'}</dd></div></dl>
    <div class="sc2-net"><span>خالص پیش‌بینی‌شده</span><b>${net==null?'—':qty(net)+' کیلو'}</b></div>
    <p class="sc2-empty-line">${net==null?'وزن دوم هنوز اختلاف کافی ندارد.':'با ثبت وزن خروج، خالص نهایی ذخیره می‌شود.'}</p>`;
}
async function scRefresh(){
  if(!$('#scLiveCard')) return;
  try{
    const st=await api('/api/weighbridge/state'); app.sc.state=st;
    scLiveUpdate(st.live,st.settings);
    scFillSelects(st);
    const oc=$('#scOpen'); if(oc) oc.innerHTML=scListOpen(st.open);
    const oc2=$('#scOpenCount'); if(oc2) oc2.textContent=qty(st.open.length);
    const dn=$('#scDone'); if(dn) dn.innerHTML=scListDone(st.done);
    scPhaseHint(st);
    const sim=$('#scSim'); if(sim && st.simulator && !sim.dataset.ready){ sim.dataset.ready='1'; sim.innerHTML=`<section class="card sc-panel"><div class="sc-panel-head"><h2>شبیه‌ساز دستگاه (آزمایشی)</h2></div><div class="sc-grid"><label class="sc-field"><span>وزن (کیلوگرم)</span><input id="scSimW" inputmode="numeric" value="12000"></label></div><div class="sc-actions"><button type="button" class="sc-secondary" data-sc="sim" data-stable="1">ارسال وزن پایدار</button><button type="button" class="sc-ghost" data-sc="sim" data-stable="0">ارسال وزن ناپایدار</button></div></section>`; }
  }catch(e){ /* قطع موقت شبکه: پیام نمایش داده نمی‌شود تا فرم مزاحم نشود */ }
}
function scBindPlateEditors(){
  const manual=$('#scManualEditor'),fresh=$('#scNewEditor');
  if(manual)bindPlateEditor(manual,$('#scManualType'));
  if(fresh)bindPlateEditor(fresh,$('#scNewType'));
}
function scSyncPlate(){
  const selected=$('#scExistingPlate')?.value||'',manual=$('#scManualEditor');
  let value=selected;
  let duplicate=false;
  if(!selected&&manual){try{value=plateEditorValue(manual,{required:true});const key=x=>en(x||'').replace(/[\s-]/g,'');duplicate=[...(app.sc.state?.open||[]),...(app.sc.state?.vehicles||[])].some(x=>key(x.plate)===key(value));if(duplicate)value='';}catch{value='';}}
  const notice=$('#scPlateNotice');if(notice)notice.textContent=duplicate?'این پلاک قبلاً ثبت شده است؛ برای حفظ سوابق، آن را از فهرست پلاک‌های ثبت‌شده انتخاب کنید.':'';
  const field=$('#scPlate');if(field)field.value=value;
  const wrap=$('#scManualWrap');if(wrap)wrap.hidden=!!selected;
  const preview=$('#scSelectedPreview');if(preview)preview.innerHTML=selected?plateViewHtml(selected,'—',true):'';
}
async function renderScale(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  app.sc.sig=''; scRenderShell(); scBindPlateEditors(); await scRefresh();
  app.timer=setInterval(scRefresh,1500);
}
// ---- فیش باسکول (چاپ) ----
// فیلدها طبق قالب شیت: شماره باسکول، ساعت ورود، تاریخ، پلاک، وزن پر، ساعت خروج، وزن خالی، خالص، نام راننده، نام مشتری.
// کالا عمداً روی فیش چاپ نمی‌شود.
function scFaDate(v){ if(!v) return '—'; const d=new Date(v); if(Number.isNaN(d.getTime())) return '—'; return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
function scFaTime(v){ if(!v) return '—'; const d=new Date(v); if(Number.isNaN(d.getTime())) return '—'; return new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d); }
async function scPrintTicket(trip, st, cfg){
  if(!cfg){
    try{ cfg = app.sc.ticket || (await api('/api/weighbridge/ticket-settings')).settings; app.sc.ticket = cfg; }
    catch(e){ scSetMsg('تنظیمات چاپ فیش خوانده نشد.','err'); return; }
  }
  let area=document.getElementById('scPrintArea');
  if(!area){ area=document.createElement('div'); area.id='scPrintArea'; area.setAttribute('aria-hidden','true'); document.body.appendChild(area); }
  const fd=v=>String(v??'').replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
  const kg=v=>v==null?'—':qty(v)+' کیلوگرم';
  const vals={
    scale: fd(st?.scaleNo||'۱'),
    entryTime: scFaTime(trip.firstAt), date: scFaDate(trip.firstAt),
    plate: fd(trip.plate||'—'), loaded: kg(trip.loadedKg),
    exitTime: scFaTime(trip.closedAt), empty: kg(trip.emptyKg),
    driver: trip.driverName||'—', net: kg(trip.netKg), customer: trip.customerName||'—',
  };
  const cells=cfg.fields.filter(f=>f.show).map(f=>`<div class="pt-cell" style="grid-column:${f.col};grid-row:${f.row}"><small>${esc(f.label)}</small><b>${f.key==='plate'?plateViewHtml(trip.plate,'—',true):esc(vals[f.key]??'—')}</b></div>`).join('');
  area.innerHTML=`<div class="pt-ticket" dir="rtl" style="grid-template-columns:${cfg.colsMm.map(v=>v+'mm').join(' ')};grid-template-rows:${cfg.rowsMm.map(v=>v+'mm').join(' ')};font-size:${cfg.fontPt}pt"><div class="pt-title" style="grid-column:1 / span 6;grid-row:1">${esc(cfg.title)}</div>${cells}</div>`;
  BTPrintDigits.convert(area);
  let pg=document.getElementById('scPageStyle');
  if(!pg){ pg=document.createElement('style'); pg.id='scPageStyle'; document.head.appendChild(pg); }
  const paper={A5L:'A5 landscape',A5P:'A5 portrait',A4L:'A4 landscape',A4P:'A4 portrait'}[cfg.paper]||'A5 landscape';
  pg.textContent=`@page{size:${paper};margin:${cfg.marginMm}mm}`;
  window.print();
}

// ---- تنظیم چاپ فیش (فقط مدیر) ----
const SC_TC_PAPERS=[['A5L','A5 افقی'],['A5P','A5 عمودی'],['A4L','A4 افقی'],['A4P','A4 عمودی']];
const SC_TC_COLS=['A','B','C','D','E','F'];
function scTcHtml(s){
  const sel=(n,opts,val)=>`<select name="${n}">${opts.map(([v,t])=>`<option value="${v}" ${String(v)===String(val)?'selected':''}>${t}</option>`).join('')}</select>`;
  const colOpts=SC_TC_COLS.map((c,i)=>[i+1,c]);
  const rowOpts=Array.from({length:7},(_,i)=>[i+1,String(i+1)]);
  return `<form id="scTcForm" class="sc2-tc" novalidate>
    <div class="sc2-tc-grid">
      <label class="sc2-field"><span>عنوان فیش</span><input name="title" maxlength="80" value="${esc(s.title)}"></label>
      <label class="sc2-field"><span>اندازه کاغذ</span>${sel('paper',SC_TC_PAPERS,s.paper)}</label>
      <label class="sc2-field"><span>حاشیه (میلی‌متر)</span><input name="marginMm" type="number" min="0" max="25" step="1" value="${s.marginMm}"></label>
      <label class="sc2-field"><span>اندازه قلم (پوینت)</span><input name="fontPt" type="number" min="6" max="16" step="0.5" value="${s.fontPt}"></label>
    </div>
    <h4 class="sc2-tc-h">عرض ستون‌ها (میلی‌متر) — ستون A سمت راست است</h4>
    <div class="sc2-tc-grid sc2-tc-six">${SC_TC_COLS.map((c,i)=>`<label class="sc2-field"><span>ستون ${c}</span><input name="w${i}" type="number" min="10" max="120" step="1" value="${s.colsMm[i]}"></label>`).join('')}</div>
    <h4 class="sc2-tc-h">ارتفاع ردیف‌ها (میلی‌متر)</h4>
    <div class="sc2-tc-grid sc2-tc-seven">${s.rowsMm.map((v,i)=>`<label class="sc2-field"><span>ردیف ${i+1}</span><input name="h${i}" type="number" min="3" max="40" step="1" value="${v}"></label>`).join('')}</div>
    <h4 class="sc2-tc-h">فیلدها: برچسب، نمایش و محل (ستون و ردیف)</h4>
    <div class="sc2-tc-fields">${s.fields.map((f,i)=>`<div class="sc2-tc-field">
      <label class="sc2-check"><input type="checkbox" name="show${i}" ${f.show?'checked':''}><span>نمایش</span></label>
      <label class="sc2-field"><span>برچسب</span><input name="label${i}" maxlength="40" value="${esc(f.label)}"></label>
      <label class="sc2-field"><span>ستون</span>${sel('fcol'+i,colOpts,f.col)}</label>
      <label class="sc2-field"><span>ردیف</span>${sel('frow'+i,rowOpts,f.row)}</label>
    </div>`).join('')}</div>
    <div id="scTcMsg" class="sc-msg" hidden></div>
    <div class="sc-actions">
      <button type="button" class="sc-secondary" data-sc="tc-save">ذخیره تنظیمات</button>
      <button type="button" class="sc-ghost" data-sc="tc-preview">چاپ آزمایشی</button>
      <button type="button" class="sc-ghost" data-sc="tc-reset">بازگشت به پیش‌فرض</button>
    </div>
    <p class="sc2-hint">دو فیلد نمایش‌داده‌شده نمی‌توانند در یک خانه باشند. تنظیمات ذخیره‌شده برای همه‌ی دستگاه‌ها و کاربران باسکول اعمال می‌شود.</p>
  </form>`;
}
function scTcMsgSet(text,kind){ const m=$('#scTcMsg'); if(!m) return; m.hidden=!text; m.textContent=text||''; m.className='sc-msg '+(kind||''); }
async function scTcLoad(){
  const body=$('#scTcBody'); if(!body) return;
  try{ const cfg=(await api('/api/weighbridge/ticket-settings')).settings; app.sc.ticket=cfg; body.innerHTML=scTcHtml(cfg); }
  catch(e){ body.innerHTML=`<p class="sc2-empty-line">${esc(e.message)}</p>`; }
}
function scTcRead(){
  const f=$('#scTcForm'); const g=n=>f.elements[n].value;
  const base=app.sc.ticket;
  return {
    title:g('title'), paper:g('paper'), marginMm:Number(g('marginMm')), fontPt:Number(g('fontPt')),
    colsMm:[0,1,2,3,4,5].map(i=>Number(g('w'+i))),
    rowsMm:[0,1,2,3,4,5,6].map(i=>Number(g('h'+i))),
    fields:base.fields.map((x,i)=>({key:x.key,label:g('label'+i),show:f.elements['show'+i].checked,col:Number(g('fcol'+i)),row:Number(g('frow'+i))})),
  };
}
function scSampleTrip(){ const now=new Date().toISOString(); return {plate:'12ب345-67',driverName:'علی تست',customerName:'شرکت نمونه',firstAt:now,closedAt:now,loadedKg:32000,emptyKg:12000,netKg:20000}; }
async function scWeigh(){
  if(app.sc.busy) return;
  const plate=en($('#scPlate')?.value||'').trim(); const productId=$('#scProduct')?.value||'';
  if(!plate) return scSetMsg('پلاک وسیله را وارد کنید.','err');
  const st=app.sc.state; const isOpen=!!st?.open.some(t=>t.plate===plate);
  if(!isOpen && !productId) return scSetMsg('برای ورود وسیله، کالا را انتخاب کنید.','err');
  const btn=$('#scWeighBtn'); app.sc.busy=true; if(btn) btn.disabled=true;
  try{
    const customerName=isOpen?undefined:(($('#scCustomer')?.value||'').trim()||undefined);
    const r=await api('/api/weighbridge/weigh',{method:'POST',body:JSON.stringify({plate,productId:isOpen?undefined:productId,customerName})});
    if(r.phase==='ENTRY') scSetMsg(`وزن اول ثبت شد: ${qty(r.trip.firstWeight)} کیلوگرم. با وزن دوم (خروج)، بار و خالی و خالص مشخص می‌شود.`,'ok');
    else scSetMsg(`خروج ثبت شد. خالص بار: ${qty(r.trip.netKg)} کیلوگرم.`,'ok');
    if(isOpen){$('#scExistingPlate').value='';$('#scManualEditor').innerHTML=plateEditorHtml();$('#scManualType').value='خودرو';scBindPlateEditors();scSyncPlate();} else { const cu=$('#scCustomer'); if(cu) cu.value=''; }
    await scRefresh();
  }catch(e){ scSetMsg(e.message,'err') }
  finally{ app.sc.busy=false; if(btn) btn.disabled=false; }
}
if(!window.__scBound){
  window.__scBound=true;
  document.addEventListener('click', async e=>{
    const t=e.target.closest && e.target.closest('[data-sc]'); if(!t) return;
    const a=t.dataset.sc;
    if(a==='weigh') return scWeigh();
    if(a==='print'){ const trip=(app.sc.state?.done||[]).find(x=>x.id===t.dataset.id); if(trip) scPrintTicket(trip, app.sc.state).catch(()=>{}); else scSetMsg('فیش این وزن‌کشی پیدا نشد.','err'); return; }
    if(a==='tc-save'){ try{ const r=await api('/api/weighbridge/ticket-settings',{method:'PUT',body:JSON.stringify({settings:scTcRead()})}); app.sc.ticket=r.settings; scTcMsgSet('تنظیمات چاپ فیش ذخیره شد.','ok'); }catch(err){ scTcMsgSet(err.message,'err') } return; }
    if(a==='tc-preview'){ let cfg; try{ cfg=scTcRead(); }catch(err){ return scTcMsgSet(err.message,'err'); } if(cfg.colsMm.concat(cfg.rowsMm,[cfg.marginMm,cfg.fontPt]).some(v=>!Number.isFinite(v))) return scTcMsgSet('یکی از مقادیر عددی نامعتبر است.','err'); scPrintTicket(scSampleTrip(), app.sc.state, cfg).catch(()=>{}); return; }
    if(a==='tc-reset'){ if(!confirm('تنظیمات چاپ فیش به پیش‌فرض برگردد؟')) return; try{ const r=await api('/api/weighbridge/ticket-settings',{method:'PUT',body:JSON.stringify({settings:{}})}); app.sc.ticket=r.settings; $('#scTcBody').innerHTML=scTcHtml(r.settings); scTcMsgSet('تنظیمات به پیش‌فرض برگشت.','ok'); }catch(err){ scTcMsgSet(err.message,'err') } return; }
    if(a==='pick'){ const sel=$('#scProduct'); if(sel && !t.disabled){ sel.value=t.dataset.id; scMarkTile(); scRefresh(); } return; }
    if(a==='add-vehicle'){
      let plate;try{plate=en(plateEditorValue($('#scNewEditor'),{required:true})).trim();}catch(err){return scSetMsg(err.message,'err');} const key=x=>en(x||'').replace(/[\s-]/g,'');if((app.sc.state?.vehicles||[]).some(x=>key(x.plate)===key(plate)))return scSetMsg('این پلاک قبلاً ثبت شده است؛ آن را از فهرست انتخاب کنید.','err'); const driverName=$('#scNewDriver')?.value.trim()||'';
      try{ await api('/api/weighbridge/vehicles',{method:'POST',body:JSON.stringify({plate,driverName})}); $('#scNewEditor').innerHTML=plateEditorHtml();$('#scNewType').value='خودرو';scBindPlateEditors();$('#scNewDriver').value=''; scSetMsg('وسیله ثبت شد.','ok'); app.sc.sig=''; await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
    if(a==='add-product'){
      const quickCode=$('#scPCode')?.value.trim(); const name=$('#scPName')?.value.trim(); const defaultUnit=$('#scPUnit')?.value||'کیلوگرم';
      try{ await api('/api/admin/products',{method:'POST',body:JSON.stringify({quickCode,name,defaultUnit})}); $('#scPCode').value=''; $('#scPName').value=''; scSetMsg('کالا به کاتالوگ اضافه شد.','ok'); app.sc.sig=''; await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
    if(a==='cancel'){
      const reason=prompt('دلیل لغو این وزن‌کشی؟'); if(!reason) return;
      try{ await api('/api/weighbridge/trips/'+t.dataset.id+'/cancel',{method:'POST',body:JSON.stringify({reason})}); scSetMsg('وزن‌کشی لغو شد.','ok'); await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
    if(a==='sim'){
      const weight=Number(en($('#scSimW')?.value||'0')); const stable=t.dataset.stable==='1';
      try{ await api('/api/weighbridge/simulate',{method:'POST',body:JSON.stringify({weight,stable})}); await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
  });
  document.addEventListener('input', e=>{
    if(e.target?.closest('#scManualEditor')){scSyncPlate();scRefresh();}
    if(e.target && e.target.id==='scTileSearch'){ const q=en(e.target.value||'').trim().toLowerCase(); document.querySelectorAll('.sc2-tile').forEach(t=>{ t.hidden = !!q && !t.textContent.toLowerCase().includes(q); }); }
  });
  document.addEventListener('change', e=>{ if(e.target?.id==='scExistingPlate'||e.target?.id==='scManualType'||e.target?.closest('#scManualEditor')){scSyncPlate();scRefresh();} if(e.target && e.target.id==='scProduct') { scMarkTile(); scRefresh(); } });
  document.addEventListener('toggle', e=>{ if(e.target && e.target.id==='scTcDetails' && e.target.open) scTcLoad(); }, true);
}

/* ================================================================
   v37.3.4 — کارتابل انبار: سربرگ «سوابق و گزارش»
   سفارش‌هایی که وزن نهایی‌شان در انبار ثبت شده + ارجاع‌های انبار به فروش،
   با بازهٔ تاریخ شمسی، جستجو، خلاصهٔ کالاها و گزارش قابل چاپ.
   ================================================================ */
app.whHist = app.whHist || { range:'today', from:'', to:'', q:'', result:'', data:null, seq:0 };
function whhKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function whhRange(kind){
  const t=serverNow(); const back=(n)=>{ const d=new Date(t); d.setDate(d.getDate()-n); return whhKey(d); };
  if(kind==='yesterday') return [back(1),back(1)];
  if(kind==='week') return [back(6),whhKey(t)];
  if(kind==='month') return [back(29),whhKey(t)];
  return [whhKey(t),whhKey(t)];
}
function whhRangeText(from,to){ return from===to?dateLabel(from):`${dateLabel(from)} تا ${dateLabel(to)}`; }
function whhTime(iso){ try{ const d=new Date(iso); return fa(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`); }catch{ return '—'; } }
function whhItemsHtml(items,isStore,orderId,allowReopen){
  // v37.36.0 — برای سفارش فروشگاه، وزن هر سرویس ستون خودش را دارد (همان دادهٔ جزئیات فروش)
  const svc=!!isStore&&(items||[]).some(i=>i.r1Kg!=null||i.r2Kg!=null);
  return `<div class="table-wrap"><table class="whh-table whh-items"><thead><tr><th>کالا</th><th>درخواستی</th>${svc?'<th>وزن سرویس اول</th><th>وزن سرویس دوم</th>':''}<th>وزن تحویلی</th><th>وضعیت</th></tr></thead><tbody>${items.map(i=>`<tr class="${i.outOfStock?'is-oos':''}"><td data-label="کالا">${esc(i.productName)}</td><td data-label="درخواستی">${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</td>${svc?`<td data-label="وزن سرویس اول">${i.outOfStock||!(Number(i.r1Kg)>0)?'—':qty(i.r1Kg)+' کیلوگرم'}</td><td data-label="وزن سرویس دوم">${i.outOfStock||!(Number(i.r2Kg)>0)?'—':qty(i.r2Kg)+' کیلوگرم'}</td>`:''}<td data-label="وزن تحویلی">${i.outOfStock?'—':qty(i.deliveredKg)+' کیلوگرم'}</td><td data-label="وضعیت">${i.outOfStock?'<span class="badge red">ناموجود</span>':'<span class="badge green">تحویل شد</span>'}${allowReopen&&i.reopenBlocked?' <span>بازگشت از صفر ممکن نیست؛ وزن ارسال شده یا سفارش بسته است.</span>':''}${allowReopen&&i.reopenRun?` <button type="button" class="btn btn-secondary btn-sm" data-action="sr38-reopen-history" data-id="${esc(orderId)}" data-item="${esc(i.itemId)}">بازگشت به وزن‌کشی${i.reopenRun===2?' سرویس دوم':''}</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function whhDocumentDetailsActions(r){
  if(r.orderType==='STORE')return (r.printRuns||[]).map(run=>`<button type="button" class="btn btn-secondary btn-sm" data-action="wh-history-store-document" data-id="${esc(r.id)}" data-run="${run}">${icon('eye',14)} جزئیات سرویس ${run===2?'دوم':'اول'}</button>`).join('');
  if(['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(r.status))return '';
  return `<button type="button" class="btn btn-secondary btn-sm" data-action="wh-history-document" data-id="${esc(r.id)}">${icon('eye',14)} جزئیات</button>`;
}
const WHH_EVENT_LABELS={CREATE_VISIT:'ثبت مراجعه',CREATE_ORDER:'ثبت سفارش حضوری',CREATE_REMOTE_ORDER:'ثبت سفارش غیرحضوری',CREATE_STORE_ORDER:'ثبت سفارش فروشگاه',UPDATE_STORE_ORDER:'ویرایش سفارش فروشگاه',SALES_EDIT_STORE_ORDER:'اصلاح سفارش فروشگاه توسط فروش',APPROVE_STORE_ORDER:'تأیید فروشگاه',QUICK_SEND_STORE_ORDER:'ارسال سریع به انبار',WAREHOUSE_ACCEPT_ORDER:'دریافت سفارش در انبار',WAREHOUSE_START_PREPARING:'شروع آماده‌سازی',WAREHOUSE_DRAFT_SAVED:'ذخیرهٔ پیش‌نویس وزن',WAREHOUSE_FINALIZE:'ثبت وزن نهایی انبار',WAREHOUSE_DOCUMENT_EDITED:'اصلاح سند انبار',WAREHOUSE_DOCUMENT_EDIT_REQUESTED:'درخواست اصلاح سند',REOPEN_WAREHOUSE_PREPARING:'بازگشایی آماده‌سازی',RETURN_TO_SALES:'ارجاع به فروش',RESUBMIT_TO_WAREHOUSE:'ارسال مجدد به انبار',WAREHOUSE_PHYSICAL_HANDOVER:'تحویل فیزیکی از انبار',TRANSPORT_WAREHOUSE_HANDOVER:'تحویل به راننده',TRANSPORT_PLAN_ASSIGNED:'تخصیص راننده',STORE_RUN_R1_WEIGHT:'ثبت وزن سرویس اول',STORE_RUN_R2_WEIGHT:'ثبت وزن سرویس دوم',STORE_RUN_R1_SEND:'ارسال سرویس اول',STORE_RUN_R2_SEND:'ارسال سرویس دوم',STORE_RUN_MOVE_R2:'انتقال قلم به سرویس دوم',STORE_RUN_ITEM_COMPLETED:'تکمیل قلم فروشگاه',STORE_RUN_OUT_OF_STOCK:'ثبت عدم موجودی',STORE_RUN_DAY_FINALIZED:'پایان عملیات انبار فروشگاه',STORE_ORDER_OUT_OF_STOCK:'ثبت ناموجودی سفارش فروشگاه',STORE_PARTIAL_OUT_OF_STOCK:'ثبت ناموجودی سفارش جزئی'};
function whhActorName(user){return user?.name||user?.username||'ثبت‌کنندهٔ نامشخص';}
function whhOrderEventDetailsHtml(event,items){
  const details=event.details||{};
  if(!Object.keys(details).length)return '';
  return `<details class="whh-event-details"><summary>جزئیات ثبت‌شده</summary>${auditDetailsHtml(details,{itemNames:auditItemNames(items)})}${auditRawDetails(details)}</details>`;
}
function whhHistoryItemsHtml(items){
  const rows=(items||[]).map(item=>{
    const status=item.outOfStock?'ناموجود':BTAuditFa.scalar(item.status,'status');
    const logs=[...(item.runR1||[]).map(entry=>({...entry,runLabel:'سرویس اول'})),...(item.runR2||[]).map(entry=>({...entry,runLabel:'سرویس دوم'}))];
    const weighing=item.weighings?`<details class="whh-event-details"><summary>جزئیات توزین</summary>${auditDetailsHtml({weighings:item.weighings})}</details>`:'';
    const runHistory=logs.map(entry=>`<div class="whh-weight-log"><b>${entry.runLabel}</b><span>${qty(entry.kg)} کیلوگرم</span><small>${esc(formatDateTime24(entry.at))} · ${esc(whhActorName(entry.user))}</small>${entry.note?`<small>${esc(entry.note)}</small>`:''}${entry.weighings?`${auditDetailsHtml({weighings:entry.weighings})}`:''}</div>`).join('');
    return `<tr><td>${esc(item.productName||'—')}</td><td>${qty(item.requestedQty)} ${esc(item.requestedUnit||'')}</td><td>${item.outOfStock?'—':`${qty(item.deliveredKg)} کیلوگرم`}</td><td>${esc(status)}${item.description?`<small class="whh-item-description">${esc(item.description)}</small>`:''}${weighing}${runHistory?`<details class="whh-event-details"><summary>سوابق وزن‌کشی و ثبت‌کننده</summary>${runHistory}</details>`:''}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="whh-table whh-order-items"><thead><tr><th>کالا</th><th>مقدار درخواستی</th><th>وزن نهایی</th><th>وضعیت و ریز توزین</th></tr></thead><tbody>${rows||'<tr><td colspan="4">قلمی در سفارش ثبت نشده است.</td></tr>'}</tbody></table></div>`;
}
async function openWarehouseHistoryOrder(id){
  try{
    const data=await api('/api/warehouse/history/'+encodeURIComponent(id));
    const o=data.order||{},c=data.customer||{},visit=data.visit||{};
    const typeLabels={ONSITE:'حضوری',REMOTE:'غیرحضوری',STORE:'فروشگاهی'};
    const detailCell=(label,value)=>`<div class="whh-detail-cell"><small>${label}</small><b>${value||'—'}</b></div>`;
    const customerFields=[
      ['کد مشتری',c.code],['نام و نام خانوادگی',c.name],['شماره تماس',c.phone],['شماره تماس دوم',c.phone2],['کد ملی',c.nationalId],
      ['شرکت / واحد',c.company],['پلاک',c.plate],['نوع وسیله',c.vehicleType],['نوع خودرو',c.carType],['نشانی',c.address],['یادداشت مشتری',c.notes],
    ].map(([label,value])=>detailCell(label,esc(label.includes('تماس')||label==='کد ملی'||label==='کد مشتری'?fa(value||''):value||'—'))).join('');
    const orderFields=[
      detailCell('نوع سفارش',esc(typeLabels[o.orderType]||o.orderType||'—')),
      detailCell('وضعیت فعلی',badge(o.status)),
      detailCell('شماره سفارش',esc(fa(o.orderNo||'—'))),
      detailCell('شماره سند انبار',esc(fa(o.warehouseDocumentNo||'—'))),
      detailCell('فروشگاه',esc(o.storeName||'—')),
      detailCell('تاریخ و ساعت ثبت سفارش',esc(formatDateTime24(o.createdAt))),
      detailCell('زمان تحویل برنامه‌ریزی‌شده',esc(formatDateTime24(o.scheduledAt||o.deliveryDate||o.scheduledDate))),
      detailCell('محل ارسال',esc(o.dispatchPlace||'—')),
      detailCell('یادداشت سفارش',esc(o.notes||'—')),
      detailCell('ثبت مراجعه',esc(formatDateTime24(visit.createdAt))),
    ].join('');
    const stages=(data.stages||[]).map(stage=>`<li><b>${esc(stage.label)}</b><small>${esc(formatDateTime24(stage.at))} · ثبت‌کننده: ${esc(whhActorName(stage.user))}</small></li>`).join('')||'<li>مرحلهٔ ثبت‌شده‌ای در دسترس نیست.</li>';
    const events=(data.events||[]).map(event=>`<li><div class="whh-event-head"><b>${esc(BTAuditFa.label(event.action))}</b><small>${esc(formatDateTime24(event.createdAt))} · ثبت‌کننده: ${esc(whhActorName(event.user))}</small></div>${whhOrderEventDetailsHtml(event,data.items)}</li>`).join('')||'<li>رویداد ممیزی برای این سفارش موجود نیست.</li>';
    openModal(`جزئیات سفارش ${fa(o.orderNo||'')}`,`<div class="whh-order-detail">
      <section><h3>مشخصات سفارش</h3><div class="whh-detail-grid">${orderFields}</div><p class="whh-detail-actor"><b>ثبت‌کنندهٔ سفارش:</b> ${esc(whhActorName(o.createdBy))}</p></section>
      <section><h3>اطلاعات کامل مشتری</h3><div class="whh-detail-grid">${customerFields}</div></section>
      ${visit.id?`<section><h3>اطلاعات مراجعهٔ مرتبط</h3><div class="whh-detail-grid">${detailCell('هدف مراجعه',esc(visit.purpose||'—'))}${detailCell('پلاک ثبت‌شده در مراجعه',esc(visit.plate||'—'))}${detailCell('نوع وسیله',esc(visit.vehicleType||'—'))}${detailCell('محل ارسال',esc(o.dispatchPlace||'—'))}<p class="whh-detail-actor"><b>ثبت‌کنندهٔ مراجعه:</b> ${esc(whhActorName(visit.createdBy))}</p></div></section>`:''}
      <section><h3>اقلام و وزن‌کشی</h3>${whhHistoryItemsHtml(data.items||[])}</section>
      <section><h3>مراحل سفارش</h3><ol class="whh-order-timeline">${stages}</ol></section>
      <section><h3>همهٔ رویدادهای ثبت‌شده</h3><ol class="whh-order-events">${events}</ol></section>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div>
    </div>`);
  }catch(err){toast(err.message);}
}
function whhBody(d,opts){
  const s=d.summary||{};
  const kpis=[['receipt','تحویل به فروش',qty(s.orders||0),''],['scale','وزن کل تحویلی',qty(s.deliveredKg||0),'کیلوگرم'],['warehouse','اقلام ثبت‌شده',qty(s.itemCount||0),'قلم'],['info','اقلام ناموجود',qty(s.outOfStock||0),'قلم'],['arrow','ارجاع به فروش',qty(s.returned||0),'مورد']]
    .map(([ic,l,v,u],k)=>`<div class="whh-kpi ${k===3&&s.outOfStock?'is-warn':''}"><span class="whh-kpi-ico">${icon(ic,18)}</span><div><small>${l}</small><b>${v}${u?` <em>${u}</em>`:''}</b></div></div>`).join('');
  // v1.1.13 — سوابق انبار با سیستم جدول مشترک bt-table؛ اقلام هر سفارش در ردیف
  // بازشوندهٔ بلافاصله زیر همان ردیف نمایش داده می‌شود (بدون کارت‌های چندخطی).
  const recs=(d.rows||[]).map(r=>{
    const actions=[
      `<button type="button" class="btn btn-secondary btn-sm" data-whh-order-details data-id="${esc(r.id)}">${icon('eye',14)} جزئیات سفارش</button>`,
      r.orderType==='STORE'?storeServicePrintButtons(r.id,r.printRuns||[],r.storeOrderKind):'',
      whhDocumentDetailsActions(r),
      `<button type="button" class="btn btn-secondary btn-sm" data-whh-detail aria-expanded="false" aria-controls="whhDetails-${esc(r.id)}">نمایش اقلام</button>`
    ].filter(Boolean).join('');
    return `<tr data-order="${esc(r.id)}">
      <td data-label="تاریخ و ساعت"><span class="bt-cell-main">${esc(dateLabel(r.day))}</span><span class="bt-cell-sub">${whhTime(r.completedAt)}</span></td>
      <td data-label="شماره سفارش"><span class="bt-cell-main order-code">${esc(fa(r.orderNo||'—'))}</span></td>
      <td data-label="نام مشتری"><span class="bt-cell-main" title="${esc(r.customerName||'—')}">${esc(r.customerName||'—')}</span></td>
      <td data-label="وزن تحویلی"><span class="bt-cell-main">${qty(r.deliveredKg)} <small>کیلوگرم</small></span>${r.outOfStock?`<span class="bt-cell-sub">ناموجود: ${qty(r.outOfStock)} قلم</span>`:''}</td>
      <td data-label="ثبت‌کننده"><span class="bt-cell-main">${esc(r.completedBy||'—')}</span></td>
      <td data-label="عملیات" class="bt-col-actions"><div class="bt-actions">${actions}</div></td>
    </tr>
    <tr class="bt-expand-row" hidden><td colspan="6"><div class="whh-details" id="whhDetails-${esc(r.id)}">${whhItemsHtml(r.items,r.orderType==='STORE',r.id,opts?.allowReopen)}</div></td></tr>`;
  }).join('');
  const list=recs?`<div class="bt-table-wrap"><table class="bt-table whh-orders-table">
    <caption class="bt-caption">سوابق سفارش‌های انبار</caption>
    <thead><tr><th scope="col">تاریخ و ساعت</th><th scope="col">شماره سفارش</th><th scope="col">نام مشتری</th><th scope="col">وزن تحویلی</th><th scope="col">ثبت‌کننده</th><th scope="col" class="bt-col-actions">عملیات</th></tr></thead>
    <tbody>${recs}</tbody>
  </table></div>`:sdEmpty('receipt','سابقه‌ای در این بازه نیست','بازهٔ تاریخ را تغییر دهید یا عبارت جستجو را پاک کنید.');
  const prod=(s.byProduct||[]).map(p=>`<tr><td data-label="کالا">${esc(p.productName)}</td><td data-label="سفارش">${qty(p.orders)}</td><td data-label="وزن (کیلوگرم)">${qty(p.deliveredKg)}</td><td data-label="ناموجود">${p.outOfStock?`<b class="danger-text">${qty(p.outOfStock)}</b>`:'—'}</td></tr>`).join('');
  const rets=(d.returns||[]).map(x=>`<li><div><span class="order-code">${esc(fa(x.orderNo))}</span><b>${esc(x.customerName)}</b></div><p>${esc(x.reason||'بدون توضیح')}</p><small>${esc(formatDateTime24(x.at))} • ${esc(x.by)}</small></li>`).join('');
  return `<div class="whh-kpis">${kpis}</div>
    <div class="whh-grid">
      <section class="sd-panel whh-orders"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('receipt',20)}</span><div><h2>${esc(opts&&opts.title||'سوابق سفارش‌های انبار')}</h2><p>${whhRangeText(d.from,d.to)} — ${esc(opts&&opts.sub||'سفارش‌هایی که وزن نهایی‌شان ثبت و به تسویهٔ فروش ارسال شده است.')}</p></div></div><div class="sd-count"><strong>${qty(s.orders||0)}</strong><span>سفارش</span></div></div>
        <div class="whh-table-host">${list}</div></section>
      <aside class="whh-side">
        <section class="sd-panel"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('scale',19)}</span><div><h2>خلاصهٔ کالاها</h2><p>جمع وزن تحویلی هر کالا در این بازه</p></div></div></div>
          ${prod?`<div class="table-wrap"><table class="whh-table whh-prod"><thead><tr><th>کالا</th><th>سفارش</th><th>وزن (کیلو)</th><th>ناموجود</th></tr></thead><tbody>${prod}</tbody></table></div>`:'<p class="whh-none">کالایی در این بازه ثبت نشده است.</p>'}</section>
        <section class="sd-panel"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('arrow',19)}</span><div><h2>ارجاع‌ها به فروش</h2><p>سفارش‌هایی که انبار برای اصلاح برگرداند</p></div></div><div class="sd-count"><strong>${qty(s.returned||0)}</strong><span>مورد</span></div></div>
          ${rets?`<ul class="whh-returns">${rets}</ul>`:'<p class="whh-none">در این بازه ارجاعی ثبت نشده است.</p>'}</section>
      </aside>
    </div>`;
}
async function renderWarehouseHistory(){
  const host=$('#wh38Body')||$('#content'); if(!host) return;
  const st=app.whHist;
  if(!st.from||!st.to){ [st.from,st.to]=whhRange(st.range||'today'); }
  const ranges=[['today','امروز'],['yesterday','دیروز'],['week','۷ روز اخیر'],['month','۳۰ روز اخیر']];
  host.innerHTML=`<section class="whh">
    <div class="sd-panel whh-toolbar">
      <div class="whh-ranges" role="group" aria-label="بازهٔ سریع">${ranges.map(([k,l])=>`<button type="button" class="whh-range ${st.range===k?'active':''}" data-action="wh-history-range" data-range="${k}">${l}</button>`).join('')}</div>
      <label class="adm-date">از<input type="date" id="whhFrom" value="${esc(st.from)}"></label>
      <label class="adm-date">تا<input type="date" id="whhTo" value="${esc(st.to)}"></label>
      <select class="adm-select" id="whhResult" aria-label="نوع سفارش"><option value="">همهٔ سفارش‌ها</option><option value="oos" ${st.result==='oos'?'selected':''}>فقط دارای قلم ناموجود</option></select>
      <div class="input-shell whh-search"><span>${icon('search',16)}</span><input id="whhQ" type="search" placeholder="سفارش، مشتری یا کالا" value="${esc(st.q)}"></div>
      <button type="button" class="btn btn-primary whh-print" data-action="wh-history-print">${icon('receipt',16)} چاپ گزارش</button>
    </div>
    <div id="whhBody"><div class="whh-loading">در حال دریافت سوابق…</div></div>
  </section>`;
  const reload=()=>loadWarehouseHistory();
  $('#whhFrom').addEventListener('change',e=>{ st.from=e.target.value||st.from; st.range=''; markWhhRange(); reload(); });
  $('#whhTo').addEventListener('change',e=>{ st.to=e.target.value||st.to; st.range=''; markWhhRange(); reload(); });
  $('#whhResult').addEventListener('change',e=>{ st.result=e.target.value; reload(); });
  let tq=null; $('#whhQ').addEventListener('input',e=>{ st.q=e.target.value; clearTimeout(tq); tq=setTimeout(reload,300); });
  host.querySelector('.whh').addEventListener('click',e=>{
    const el=e.target.closest('[data-action]'); if(!el) return;
    if(el.dataset.action==='wh-history-range'){ st.range=el.dataset.range; [st.from,st.to]=whhRange(st.range); renderWarehouseHistory(); }
    else if(el.dataset.action==='wh-history-print'){ printWarehouseHistory(); }
  });
  await loadWarehouseHistory();
}
function markWhhRange(){ $$('.whh-range').forEach(b=>b.classList.toggle('active',b.dataset.range===app.whHist.range)); }
async function loadWarehouseHistory(){
  const st=app.whHist; const seq=++st.seq;
  const params=new URLSearchParams({from:st.from,to:st.to}); if(st.q.trim()) params.set('q',st.q.trim()); if(st.result) params.set('result',st.result);
  try{
    const d=await api('/api/warehouse/history?'+params.toString());
    if(seq!==st.seq) return;
    st.data=d; st.from=d.from; st.to=d.to;
    const b=$('#whhBody'); if(b) b.innerHTML=whhBody(d);
  }catch(err){ const b=$('#whhBody'); if(b) b.innerHTML=`<div class="empty">خطا در دریافت سوابق انبار: ${esc(err.message)}</div>`; }
}
document.addEventListener('click',e=>{const orderButton=e.target.closest('[data-whh-order-details]');if(orderButton){e.preventDefault();openWarehouseHistoryOrder(orderButton.dataset.id);return;}const b=e.target.closest('[data-whh-detail]');if(!b)return;const row=b.closest('tr');const expand=row&&row.nextElementSibling;if(!expand||!expand.classList.contains('bt-expand-row'))return;const opening=expand.hidden;expand.hidden=!opening;b.setAttribute('aria-expanded',String(opening));});

function printWarehouseHistory(){
  const d=app.whHist.data; if(!d) return toast('ابتدا سوابق بارگذاری شود.');
  const s=d.summary||{};
  const rows=(d.rows||[]).map((r,k)=>`<tr><td>${fa(k+1)}</td><td>${dateLabel(r.day)} ${whhTime(r.completedAt)}</td><td dir="ltr">${esc(fa(r.orderNo))}</td><td>${esc(r.customerName)}</td><td>${r.items.map(i=>`${esc(i.productName)}: ${i.outOfStock?'<b class="oos">ناموجود</b>':qty(i.deliveredKg)+' کیلو'}`).join('<br>')}</td><td>${qty(r.deliveredKg)}</td><td>${esc(r.completedBy)}</td></tr>`).join('')||'<tr><td colspan="7" class="none">سابقه‌ای در این بازه نیست.</td></tr>';
  const prod=(s.byProduct||[]).map(p=>`<tr><td>${esc(p.productName)}</td><td>${qty(p.orders)}</td><td>${qty(p.deliveredKg)}</td><td>${p.outOfStock?qty(p.outOfStock):'—'}</td></tr>`).join('');
  const rets=(d.returns||[]).map(x=>`<tr><td dir="ltr">${esc(fa(x.orderNo))}</td><td>${esc(x.customerName)}</td><td>${esc(x.reason||'—')}</td><td>${esc(formatDateTime24(x.at))}</td><td>${esc(x.by)}</td></tr>`).join('');
  BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>گزارش انبار ${esc(whhRangeText(d.from,d.to).replace(/<[^>]+>/g,''))}</title><style>
    *{box-sizing:border-box}body{font-family:"B Yekan","Vazirmatn",Tahoma,sans-serif;color:#1b2027;padding:26px;margin:0}
    header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e30613;padding-bottom:12px;margin-bottom:16px}
    header h1{font-size:21px;margin:0}header p{margin:4px 0 0;color:#555;font-size:12px}header img{width:54px;height:54px;object-fit:contain}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}.box{border:1px solid #ddd;border-radius:10px;padding:9px 10px;font-size:11px;color:#555}.box strong{display:block;font-size:19px;color:#b40f23;margin-top:3px}
    h2{font-size:14px;margin:18px 0 6px;border-right:4px solid #e30613;padding-right:8px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #d8d8d8;padding:6px 7px;font-size:11px;text-align:right;vertical-align:top}th{background:#f4f4f4}
    .oos{color:#b4232d}.none{text-align:center;color:#777}footer{margin-top:22px;font-size:10px;color:#777;display:flex;justify-content:space-between}
    @media print{body{padding:0}tr{page-break-inside:avoid}}</style></head><body>
    <header><div><h1>گزارش سوابق انبار — بابل طیور</h1><p>بازه: ${whhRangeText(d.from,d.to)}${app.whHist.q?` • جستجو: «${esc(app.whHist.q)}»`:''}${app.whHist.result==='oos'?' • فقط سفارش‌های دارای قلم ناموجود':''}</p></div><img src="/logo.png" alt=""></header>
    <div class="grid"><div class="box">سفارش تحویل‌شده<strong>${qty(s.orders||0)}</strong></div><div class="box">وزن کل (کیلوگرم)<strong>${qty(s.deliveredKg||0)}</strong></div><div class="box">اقلام ثبت‌شده<strong>${qty(s.itemCount||0)}</strong></div><div class="box">اقلام ناموجود<strong>${qty(s.outOfStock||0)}</strong></div><div class="box">ارجاع به فروش<strong>${qty(s.returned||0)}</strong></div></div>
    <h2>سفارش‌ها</h2><table><thead><tr><th>#</th><th>زمان ثبت وزن</th><th>سفارش</th><th>مشتری</th><th>اقلام و وزن تحویلی</th><th>جمع (کیلو)</th><th>ثبت‌کننده</th></tr></thead><tbody>${rows}</tbody></table>
    ${prod?`<h2>خلاصهٔ کالاها</h2><table><thead><tr><th>کالا</th><th>تعداد سفارش</th><th>وزن تحویلی (کیلو)</th><th>ناموجود</th></tr></thead><tbody>${prod}</tbody></table>`:''}
    ${rets?`<h2>ارجاع‌ها به فروش</h2><table><thead><tr><th>سفارش</th><th>مشتری</th><th>دلیل</th><th>زمان</th><th>کاربر</th></tr></thead><tbody>${rets}</tbody></table>`:''}
    <footer><span>تهیه‌کننده: ${esc(app.user?.fullName||app.user?.username||'')}</span><span>تاریخ چاپ: ${esc(todayText())} ${whhTime(new Date(serverEpoch()).toISOString())}</span></footer>
    <script src="/print-ready.js"><\/script></body></html>`));
}
