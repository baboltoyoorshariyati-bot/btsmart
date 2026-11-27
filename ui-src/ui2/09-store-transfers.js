/* Independent inter-store transfer cartables. Amounts are handwritten, never catalog prices. */
const transferStatus={PENDING_RECEIPT:'در انتظار دریافت فیزیکی مقصد',PENDING_SALES:'در انتظار تأیید فروش',PENDING_WAREHOUSE:'در انتظار تأیید انبار',RETURNED:'بازگشت برای اصلاح',COMPLETED:'تأیید نهایی انبار'};
const transferEvent={CREATED:'ثبت حواله',RECEIVED:'تأیید دریافت فیزیکی مقصد',SALES_APPROVED:'تأیید فروش',WAREHOUSE_APPROVED:'تأیید انبار',RETURNED:'بازگشت برای اصلاح',REVISED:'اصلاح و ارسال مجدد'};
// Format only valid numbers; never discard letters, decimals or malformed pasted
// grouping from a financial value. The server remains the final validator.
function transferFormatPrice(value,allowRegroup=false){
 const raw=en(String(value??''));
 if(!raw)return '';
 if(!/^(?:\d+|\d{1,3}(?:[,٬]\d{3})+)$/.test(raw)&&!(allowRegroup&&/^[\d,٬]+$/.test(raw)))return fa(raw);
 const digits=raw.replace(/[,٬]/g,'');
 return fa(digits.replace(/\B(?=(\d{3})+(?!\d))/g,'٬'));
}
function transferPriceInput(input,event){
 const original=input.value, position=input.selectionStart??original.length;
 const typedDigit=event.inputType==='insertText'&&/^[0-9۰-۹٠-٩]$/.test(event.data||'');
 const deleting=String(event.inputType||'').startsWith('delete');
 const formatted=transferFormatPrice(original,input._transferPriceValid!==false&&(typedDigit||deleting));
 input._transferPriceValid=formatted===''||/^(?:[۰-۹]+|[۰-۹]{1,3}(?:٬[۰-۹]{3})+)$/.test(formatted);
 if(formatted===original)return;
 const digitsBefore=en(original.slice(0,position)).replace(/[^0-9]/g,'').length;
 input.value=formatted;
 if(input._transferPriceValid){let offset=0,count=0;while(offset<formatted.length&&count<digitsBefore){if(/[۰-۹]/.test(formatted[offset]))count++;offset++;}input.setSelectionRange(offset,offset);}
 else input.setSelectionRange(position,position);
}

async function renderStoreTransfers(){
 $('#content').innerHTML=`<div class="transfer-workspace"><section class="sd-panel"><div class="sd-pad st38-hero"><div class="sd-head-main"><span class="sd-head-ico">${icon('truck',20)}</span><div><h2>جابجایی بین فروشگاه‌ها</h2><p>ثبت حواله، تأیید دریافت فیزیکی مقصد و پیگیری بررسی فروش و انبار</p></div></div><div class="st38-hero-badge"><span>${esc(app.user.storeName||app.user.fullName||'فروشگاه')}</span><small>دسترسی اختصاصی فروشگاه</small></div></div></section><section class="sd-panel transfer-panel"><div data-transfer-panel></div></section></div>`;
 await transferMount($('#content [data-transfer-panel]'),'store');
}
function transferRows(items){return (items||[]).map((i,k)=>`<tr><td data-label="ردیف">${qty(k+1)}</td><td data-label="محصول">${esc(i.productName)}</td><td data-label="مقدار">${qty(i.kg)} کیلوگرم</td><td data-label="فی">${money(i.price)}</td><td data-label="مبلغ">${money(i.amount)}</td><td data-label="توضیحات">${esc(i.description||'—')}</td></tr>`).join('');}
function transferDetails(t){
 const total=(t.items||[]).reduce((s,i)=>s+Number(i.amount||0),0);
 return `<h3>حواله ${esc(fa(t.number))}</h3><p><b>فرستنده:</b> ${esc(fa(t.sourceName))} &nbsp; ← &nbsp; <b>مقصد:</b> ${esc(fa(t.destinationName))} &nbsp; | &nbsp; <b>تاریخ ارسال:</b> ${esc(dateLabel(t.sendDate))}</p><p><b>وضعیت:</b> ${esc(transferStatus[t.status]||t.status)} — نسخه ${qty(t.revision)}</p><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>ردیف</th><th>محصول</th><th>مقدار</th><th>فی</th><th>مبلغ</th><th>توضیحات ردیف</th></tr></thead><tbody>${transferRows(t.items)}</tbody></table></div><p><b>جمع کل: ${money(total)}</b>${t.notes?` — توضیحات: ${esc(t.notes)}`:''}</p><details><summary>سوابق جابجایی و اصلاحات</summary>${t.legacyNumber?`<p>شماره قبلی حواله: <b dir="ltr">${esc(fa(t.legacyNumber))}</b> (برای تطبیق با اسناد قبلی)</p>`:''}<ol>${(t.history||[]).map(h=>`<li>${esc(transferEvent[h.action]||h.action)} — نسخه ${qty(h.revision)} — ${esc(h.name)} — ${esc(formatDateTime24(h.at))}${h.reason?' — دلیل: '+esc(h.reason):''}${h.before?`<details><summary>اقلام پیش از اصلاح</summary><table class="bt-table"><thead><tr><th>ردیف</th><th>محصول</th><th>مقدار</th><th>فی</th><th>مبلغ</th><th>توضیحات ردیف</th></tr></thead><tbody>${transferRows(h.before.items)}</tbody></table></details>`:''}</li>`).join('')}</ol></details>`;
}
function transferPrint(t){
 const sum=(t.items||[]).reduce((s,i)=>s+Number(i.amount||0),0);
 const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>حواله جابجایی ${esc(t.number)}</title><style>@page{size:A4;margin:12mm}body{font-family:Vazirmatn,Tahoma,sans-serif;font-size:11pt;color:#111}h1{text-align:center;font-size:16pt;border:1px solid #333;padding:10px}.meta{table-layout:fixed;margin:0}.meta td{text-align:right;width:50%;padding:9px}table{width:100%;border-collapse:collapse;margin:15px 0}td,th{border:1px solid #333;padding:7px;text-align:center;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}th{background:#eee}.note{font-size:9pt;margin-top:16px}</style></head><body><h1>حواله جابجایی محصول بین فروشگاه‌ها</h1><table class="meta" aria-label="مشخصات حواله"><tbody><tr><td>شماره حواله: <b dir="ltr">${esc(fa(t.number))}</b></td><td>تاریخ ارسال: <b dir="ltr">${esc(dateLabel(t.sendDate))}</b></td></tr><tr><td>فروشگاه فرستنده: ${esc(fa(t.sourceName))}</td><td>فروشگاه مقصد: ${esc(fa(t.destinationName))}</td></tr></tbody></table><table><thead><tr><th>ردیف</th><th>نام محصول</th><th>مقدار (کیلوگرم)</th><th>فی (ریال)</th><th>مبلغ (ریال)</th><th>توضیحات ردیف</th></tr></thead><tbody>${(t.items||[]).map((i,k)=>`<tr><td>${qty(k+1)}</td><td>${esc(i.productName)}</td><td>${qty(i.kg)}</td><td>${esc(money(i.price).replace(' ریال',''))}</td><td>${esc(money(i.amount).replace(' ریال',''))}</td><td>${esc(i.description||'—')}</td></tr>`).join('')}<tr><th colspan="4">جمع کل (ریال)</th><th>${esc(money(sum).replace(' ریال',''))}</th><th></th></tr></tbody></table><p>توضیحات: ${esc(t.notes||'—')}</p><p class="note">این سند به‌تنهایی ثبت موجودی یا حسابداری ایجاد نمی‌کند.</p><script src="/print-ready.js"><\/script></body></html>`;
 return BTPrintFrame.html(BTPrintDigits.documentHtml(html));
}
async function transferMount(host,role){
 if(!host)return;
 const token=host._transferToken=Symbol();host._transferLoading=true;host._transferRefresh=null;host.innerHTML='<p>در حال دریافت جابجایی‌ها…</p>';
 try{
  const [data,branches]=await Promise.all([api(`/api/${role}/transfers`),role==='store'?api('/api/store/transfer-branches'):null]);
  if(!host.isConnected||host._transferToken!==token)return;
  let all=data.transfers||[];let tab=role==='store'?(app.transferStoreTab||'create'):'list';let editing=null;
  const currentId=branches?.source?.id;
  function rowForm(item={},index=0){
   const number=fa(index+1);
   return `<tr data-transfer-line data-product-id="${esc(item.productId||'')}"><td data-label="ردیف"><span class="sd-line-no" data-transfer-number>${number}</span></td><td data-label="محصول"><div class="sd-line-cell cell-product draft-product transfer-product"><div class="input-shell"><span>${icon('search',15)}</span><input data-transfer-product-search value="${esc(item.productName||'')}" placeholder="محصول (نام/کد سریع)" autocomplete="off" aria-label="محصول" role="combobox" aria-expanded="false"></div><div class="product-suggest" data-transfer-suggest></div></div></td><td data-label="مقدار (کیلوگرم)"><div class="sd-line-cell"><div class="input-shell"><input data-kg type="text" dir="ltr" inputmode="decimal" required value="${esc(fa(String(item.kg??'')).replace(/\./g,'٫'))}" placeholder="مقدار" aria-label="مقدار (کیلوگرم)"></div></div></td><td data-label="فی (ریال)"><div class="sd-line-cell"><div class="input-shell"><input data-price type="text" dir="ltr" inputmode="numeric" required value="${esc(transferFormatPrice(item.price??''))}" placeholder="فی" aria-label="فی (ریال)"></div></div></td><td data-label="توضیحات"><div class="sd-line-cell"><div class="input-shell"><input data-transfer-description type="text" maxlength="500" value="${esc(item.description||'')}" placeholder="توضیح (اختیاری)" aria-label="توضیحات ردیف"></div></div></td><td data-label="عملیات"><button type="button" class="sd-line-del" data-transfer-remove aria-label="حذف محصول">${icon('trash',15)}</button></td></tr>`;
  }
  function numberLines(){host.querySelectorAll('[data-transfer-line]').forEach((row,i)=>{row.querySelector('[data-transfer-number]').textContent=fa(i+1);});}
  function form(t){
   const source=t?{id:t.sourceBranchId,name:t.sourceName}:branches.source;
   const options=branches.branches.filter(b=>b.id!==currentId);
   return `<div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('plus',19)}</span><div><h2>${t?'اصلاح حواله '+esc(fa(t.number)):'ثبت جابجایی جدید'}</h2><p>${t?'پس از اصلاح، مقصد دوباره دریافت فیزیکی را تأیید می‌کند؛ سابقه محفوظ است.':'مبدأ، مقصد، تاریخ و اقلام را وارد کنید. تأیید مقصد به معنی دریافت فیزیکی کالا است.'}</p></div></div></div><form data-transfer-form><div class="sd-pad transfer-meta"><div class="field"><label>فروشگاه فرستنده</label><div class="input-shell">${source?`<input value="${esc(fa(source.name))}" readonly>`:`<select name="sourceBranchId" required><option value="">انتخاب فرستنده</option>${branches.branches.map(b=>`<option value="${esc(b.id)}">${esc(fa(b.name))}</option>`).join('')}</select>`}</div></div><div class="field"><label>فروشگاه مقصد</label><div class="input-shell">${t?`<input value="${esc(fa(t.destinationName))}" readonly>`:`<select name="destinationBranchId" required><option value="">انتخاب مقصد</option>${options.map(b=>`<option value="${esc(b.id)}">${esc(fa(b.name))}</option>`).join('')}</select>`}</div>${!t&&!options.length?'<small class="transfer-help" role="status">فروشگاه فعال دیگری پیدا نشد. از مدیر بخواهید حساب فروشگاه مقصد و اتصال شعبه را بررسی کند.</small>':''}</div><div class="field"><label>تاریخ ارسال</label><div class="input-shell"><input id="transferSendDate" name="sendDate" type="date" value="${esc(t?.sendDate||today())}" required></div></div></div><div class="sd-lines-head"><div><h3>محصولات جابجایی</h3><p>جستجو با نام یا کد سریع؛ مقدار فقط کیلوگرم و فی به ریال است.</p></div></div><div class="sd-lines-body"><div class="bt-table-wrap draft-lines-wrap transfer-lines-wrap"><table class="bt-table draft-lines-table transfer-lines-table"><caption class="bt-caption">محصولات جابجایی</caption><thead><tr>${['ردیف','محصول','مقدار (کیلوگرم)','فی (ریال)','توضیحات','عملیات'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody data-transfer-lines>${(t?.items?.length?t.items:[{}]).map(rowForm).join('')}</tbody></table></div><button type="button" class="btn btn-secondary" data-transfer-add>${icon('plus',15)} افزودن محصول</button><div class="field transfer-notes"><label>توضیحات</label><textarea name="notes" maxlength="1000" rows="2" placeholder="توضیحات حواله (اختیاری)">${esc(t?.notes||'')}</textarea></div></div><div class="sd-submit-bar"><div><strong>بدون تغییر موجودی و حسابداری</strong><small>فی از قیمت محصولات سامانه دریافت نمی‌شود.</small></div><div><button type="submit" class="btn btn-primary">${t?'ثبت اصلاح و ارسال به مقصد':'ثبت و ارسال به مقصد'}</button>${t?' <button type="button" class="btn btn-secondary" data-transfer-cancel>انصراف</button>':''}</div></div></form>`;
  }
  function list(rows){return `<div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>شماره حواله</th><th>فرستنده</th><th>مقصد</th><th>تاریخ ارسال</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${esc(fa(t.number))}</td><td>${esc(fa(t.sourceName))}</td><td>${esc(fa(t.destinationName))}</td><td>${esc(dateLabel(t.sendDate))}</td><td>${esc(transferStatus[t.status]||t.status)}</td><td><button type="button" class="btn btn-secondary" data-transfer-open="${esc(t.id)}">جزئیات</button></td></tr>`).join('')||'<tr><td colspan="6">جابجایی برای نمایش وجود ندارد.</td></tr>'}</tbody></table></div>`;}
  function paint(){
   if(role==='store'){
    const incoming=all.filter(t=>!currentId||currentId===t.destinationBranchId),sent=all.filter(t=>!currentId||currentId===t.sourceBranchId);
    host.innerHTML=`<nav class="store-delivery-tabs transfer-tabs" aria-label="بخش‌های جابجایی">${[['create','ثبت جابجایی'],['incoming','دریافتی'],['sent','ارسال‌شده']].map(([id,label])=>`<button type="button" class="${tab===id?'active':''}" data-transfer-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</nav><div data-transfer-body>${editing?form(editing):tab==='create'?form(null):list(tab==='incoming'?incoming:sent)}</div>`;
   }else host.innerHTML=`<h2>جابجایی فروشگاه‌ها</h2><p>بررسی حواله‌های رسیده و مشاهده سوابق تأییدشده</p>${list(all)}`;
  }
  paint();
  if(role==='sales'||role==='warehouse'){
   let snapshot=JSON.stringify(all),busy=false;
   host._transferRefresh=async()=>{
    if(busy||!host.isConnected||host._transferToken!==token)return;
    busy=true;
    try{
     const data=await api(`/api/${role}/transfers`);
     if(!host.isConnected||host._transferToken!==token)return;
     const next=data.transfers||[],signature=JSON.stringify(next);
     if(signature!==snapshot){all=next;snapshot=signature;paint();}
     host.querySelector('[data-transfer-refresh-warning]')?.remove();
    }catch(err){
     if(!host.isConnected||host._transferToken!==token)return;
     let warning=host.querySelector('[data-transfer-refresh-warning]');
     if(!warning){warning=document.createElement('p');warning.dataset.transferRefreshWarning='1';warning.className='notice';warning.setAttribute('role','alert');host.prepend(warning);}
     warning.textContent='نوسازی جابجایی‌ها ناموفق بود؛ اطلاعات نمایش‌داده‌شده ممکن است قدیمی باشد. تلاش دوباره خودکار انجام می‌شود.';
    }finally{busy=false;}
   };
  }
  host.onclick=async e=>{
   const el=e.target.closest('button');if(!el)return;
   if(el.hasAttribute('data-transfer-pick')){const line=el.closest('[data-transfer-line]'),inp=line.querySelector('[data-transfer-product-search]'),state=productSearchStates.get(inp);if(state){clearTimeout(state.timer);state.seq++;state.pending=false;}line.dataset.productId=el.dataset.productId;inp.value=el.dataset.label;inp.setAttribute('aria-expanded','false');line.querySelector('[data-transfer-suggest]').innerHTML='';line.querySelector('[data-kg]').focus();return;}
   if(el.dataset.transferTab){tab=app.transferStoreTab=el.dataset.transferTab;editing=null;paint();return;}
   if(el.hasAttribute('data-transfer-add')){host.querySelector('[data-transfer-lines]').insertAdjacentHTML('beforeend',rowForm({},host.querySelectorAll('[data-transfer-line]').length));numberLines();return;}
   if(el.hasAttribute('data-transfer-remove')){if(host.querySelectorAll('[data-transfer-line]').length>1){el.closest('[data-transfer-line]').remove();numberLines();}else toast('حداقل یک محصول لازم است.');return;}
   if(el.hasAttribute('data-transfer-cancel')){editing=null;paint();return;}
   const t=all.find(x=>x.id===el.dataset.transferOpen);if(!t)return;
   const canReview=(role==='store'&&t.status==='PENDING_RECEIPT'&&(!currentId||currentId===t.destinationBranchId))||(role==='sales'&&t.status==='PENDING_SALES')||(role==='warehouse'&&t.status==='PENDING_WAREHOUSE');
   const canEdit=role==='store'&&t.status==='RETURNED'&&(!currentId||currentId===t.sourceBranchId);
   openModal('جزئیات جابجایی',transferDetails(t)+`<div class="modal-actions">${canEdit?'<button type="button" class="btn btn-primary" data-tr-modal="edit">اصلاح حواله</button>':''}${canReview?`<button type="button" class="btn btn-secondary" data-tr-modal="return">بازگشت برای اصلاح</button><button type="button" class="btn btn-primary" data-tr-modal="approve">${role==='store'?'تأیید دریافت فیزیکی':role==='sales'?'تأیید فروش':'تأیید انبار و چاپ'}</button>`:''}${t.status==='COMPLETED'&&role!=='store'?'<button type="button" class="btn btn-primary" data-tr-modal="print">چاپ حواله</button>':''}<button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div>`);
   $('#modal [data-tr-modal="edit"]')?.addEventListener('click',()=>{closeModal();tab=app.transferStoreTab='sent';editing=t;paint();});
   $('#modal [data-tr-modal="print"]')?.addEventListener('click',()=>transferPrint(t));
   for(const action of ['return','approve'])$('#modal [data-tr-modal="'+action+'"]')?.addEventListener('click',async ev=>{
    let reason='';if(action==='return'){reason=prompt('دلیل بازگشت برای اصلاح را وارد کنید:')||'';if(!reason.trim())return toast('دلیل بازگشت الزامی است.');}
    else if(!confirm(role==='store'?'آیا کالاهای این نسخه را واقعاً و به‌صورت فیزیکی دریافت کرده‌اید؟':role==='warehouse'?'حواله تأیید نهایی شود؟':'حواله تأیید و به انبار ارسال شود؟'))return;
    ev.currentTarget.disabled=true;try{const result=await api(`/api/${role}/transfers/${encodeURIComponent(t.id)}/review`,{method:'POST',body:JSON.stringify({revision:t.revision,decision:action==='return'?'RETURN':'APPROVE',reason,physicalReceipt:role==='store'&&action==='approve'})});closeModal();toast(action==='return'?'حواله برای اصلاح برگشت داده شد.':'تأیید ثبت شد.');if(role==='warehouse'&&action==='approve')transferPrint(result.transfer);await transferMount(host,role);await refreshIndicators();}catch(err){ev.currentTarget.disabled=false;toast(err.message);}
   });
  };
  host.oninput=e=>{if(e.isComposing)return;if(e.target.matches('[data-price]')){transferPriceInput(e.target,e);return;}if(e.target.matches('[data-kg]')){const inp=e.target,start=inp.selectionStart,end=inp.selectionEnd;inp.value=fa(en(inp.value)).replace(/\./g,'٫');inp.setSelectionRange(start,end);return;}const inp=e.target.closest('[data-transfer-product-search]');if(!inp)return;if(/^[0-9۰-۹٠-٩]+$/.test(inp.value)){const start=inp.selectionStart,end=inp.selectionEnd;inp.value=fa(en(inp.value));inp.setSelectionRange(start,end);}const line=inp.closest('[data-transfer-line]'),box=line.querySelector('[data-transfer-suggest]');line.dataset.productId='';searchProductOptions(inp,box,inp.value,p=>`<button type="button" class="op-product-option" data-transfer-pick data-product-id="${esc(p.id)}" data-label="${esc(p.name)}"><span><b>${esc(p.name)}</b><small>کد سریع ${esc(fa(p.quickCode||'—'))}</small></span>${icon('check',16)}</button>`);};
  host.onchange=e=>{if(e.target.name!=='sourceBranchId')return;const dest=host.querySelector('[name="destinationBranchId"]');if(!dest)return;for(const option of dest.options)if(option.value)option.disabled=option.value===e.target.value;if(dest.value===e.target.value)dest.value='';};
  host.onsubmit=async e=>{
   if(!e.target.matches('[data-transfer-form]'))return;e.preventDefault();const f=e.target;const values=Object.fromEntries(new FormData(f));const dateInput=f.querySelector('#transferSendDate');const dateVisible=dateInput.previousElementSibling;values.sendDate=dateVisible?.classList.contains('ui-jdate')?jalaliToIso(dateVisible.value):dateInput.value;if(!values.sendDate)return toast('تاریخ ارسال معتبر را وارد کنید.');if(editing)values.revision=editing.revision;values.items=[...f.querySelectorAll('[data-transfer-line]')].map(r=>({productId:r.dataset.productId||'',kg:r.querySelector('[data-kg]').value,price:r.querySelector('[data-price]').value,description:r.querySelector('[data-transfer-description]').value,unit:'کیلوگرم'}));
   if(values.items.some(i=>!i.productId))return toast('برای هر ردیف، محصول را از فهرست جستجو انتخاب کنید.');
   const btn=e.submitter;if(btn)btn.disabled=true;try{await api('/api/store/transfers'+(editing?'/'+encodeURIComponent(editing.id):''),{method:editing?'PUT':'POST',body:JSON.stringify(values)});toast(editing?'اصلاح ثبت و برای مقصد ارسال شد.':'حواله برای مقصد ثبت شد.');app.transferStoreTab='sent';await transferMount(host,role);await refreshIndicators();}catch(err){if(btn)btn.disabled=false;toast(err.message);}
  };
 }catch(err){if(host.isConnected&&host._transferToken===token)host.innerHTML=`<p role="alert">خطا در دریافت جابجایی‌ها: ${esc(err.message)}</p>`;}
 finally{if(host._transferToken===token)host._transferLoading=false;}
}
