'use strict';
/* v37.40.0 —
   ۱) فرم ثبت ورود نگهبانی پس از ثبت موفق کاملاً خالی می‌شود.
   ۲) فرم سفارش حضوری فروش: ناوبری Enter (محصول ← مقدار ← واحد ← توضیحات ← افزودن قلم)
      و ردیف‌های تک‌خطی فشرده مانند کارتابل فروشگاه.
   ۳) فرم تسویهٔ فروش کم‌ارتفاع‌تر و مبلغ هر روش تسویه به‌صورت پیش‌فرض
      مبلغ کل فاکتور / ماندهٔ فاکتور است. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('public/app.js'), ui=read('public/ui2.js'), compat=read('public/compatibility.css');
const slice=(src,from,to)=>src.slice(src.indexOf(from),src.indexOf(to,src.indexOf(from)));

test('gate entry form is fully cleared after a successful visit registration',()=>{
  const submit=slice(app,'async function submitGate','/* v37.3.4');
  assert.match(submit,/await api\('\/api\/visits',\{method:'POST'/);
  // پلاک و پیشنهادهای مشتری پاک و فرم از نو رندر می‌شود؛ هیچ بازیابی اطلاعات قبلی نیست
  assert.match(submit,/app\.plate=\{a:'',letter:'ب',c:'',province:''\}/);
  assert.match(submit,/app\.customerMatches=\[\]/);
  assert.match(submit,/await renderGate\('entry'\)/);
  assert.match(submit,/\$\('#gateForm \[name="name"\]'\)/);
  assert.doesNotMatch(submit,/restoreGateForm|const keep=/);
  assert.doesNotMatch(app,/function restoreGateForm/);
  // خطای ثبت همچنان پیام را در همان فرم نشان می‌دهد و فرم پاک نمی‌شود
  assert.match(submit,/catch\(err\)\{\$\('#gateMsg'\)\.textContent=err\.message\}/);
});

test('onsite order lines are compact single-row lines like the store form',()=>{
  const lines=slice(ui,'function renderOrderLines()','function updateOrderDraftSummary()');
  assert.match(lines,/class="sd-line sd-line-compact"/);
  assert.match(lines,/<input type="text" data-description=/);
  assert.doesNotMatch(lines,/<textarea data-description/);
  assert.doesNotMatch(lines,/<label>محصول/);
  // همان قراردادهای داده‌ای قبلی حفظ شده‌اند
  for(const attr of ['data-product-search','data-suggest-for','data-qty','data-unit','data-description','data-action="remove-line"'])
    assert.ok(lines.includes(attr),attr);
  // استایل فشردهٔ اختصاصی صفحهٔ حضوری در آخرین شیوه‌نامه است
  assert.match(compat,/v37\.40\.0/);
  assert.match(compat,/#appView #content #orderLines \.sd-line\.sd-line-compact\{display:flex!important/);
  assert.match(compat,/#appView \.sd-oe-layout\{grid-template-columns:minmax\(0,1fr\)!important/);
});

test('Enter walks product → quantity → unit → description → add line on the onsite form',()=>{
  const nav=slice(app,'ناوبری Enter در فرم سفارش حضوری','let v21ProductTimer=null;');
  assert.match(nav,/e\.key !== 'Enter'/);
  assert.match(nav,/t\.closest\('#orderLines'\)/);
  assert.match(nav,/t\.dataset\.productSearch != null \? 'product'/);
  assert.match(nav,/t\.dataset\.qty != null \? 'qty'/);
  assert.match(nav,/t\.dataset\.unit != null \? 'unit'/);
  assert.match(nav,/t\.dataset\.description != null \? 'desc'/);
  // در محصول، اولین پیشنهاد انتخاب و سپس تمرکز روی مقدار می‌رود (مانند فروشگاه)
  assert.match(nav,/querySelector\('\.product-option:not\(\[disabled\]\)'\)/);
  assert.match(nav,/first\.click\(\)/);
  assert.match(nav,/focusField\('\[data-qty\]', idx\)/);
  assert.match(nav,/focusField\('\[data-unit\]', idx\)/);
  assert.match(nav,/focusField\('\[data-description\]', idx\)/);
  // در توضیحات، «افزودن قلم» زده می‌شود و تمرکز روی محصول ردیف تازه می‌رود
  assert.match(nav,/document\.querySelector\('\[data-action="add-line"\]'\)\?\.click\(\)/);
  assert.match(nav,/querySelectorAll\('\[data-product-search\]'\)/);
  // انتخاب محصول با کلیک هم تمرکز را روی مقدار می‌برد
  assert.match(app,/#orderLines \[data-qty="\$\{i\}"\]/);
});

test('settlement form is compact: shorter signature pad, rows and payment fields',()=>{
  assert.match(compat,/#appView #content \.stl-card \.stl-sig\{height:78px!important\}/);
  assert.match(compat,/#appView #content \.stl-card \.stl-row\{padding:4px 8px!important\}/);
  assert.match(compat,/#appView #content \.stl-pay-field,#appView #content \.stl-pay-detail label\{grid-template-rows:15px 36px!important/);
  assert.match(compat,/#appView #content \.stl-pay-totals\{padding:7px 10px!important/);
});

test('settlement amounts default to the invoice total, then to the remaining balance',()=>{
  const bind=slice(app,'function stlBindPayments()','function stlCollectPayments()');
  // ردیف خالی هنگام اتصال، ماندهٔ فاکتور (برای ردیف اول: کل مبلغ) را می‌گیرد
  assert.match(app,/function stlPayAutoFill\(row\)/);
  assert.match(app,/row\.dataset\.autopay='1'/);
  assert.match(app,/function stlPayBalance\(exceptRow\)[\s\S]*?stlDue\(\)-paid/);
  assert.match(bind,/if\(!amt\.value\.trim\(\)\)stlPayAutoFill\(r\)/);
  // انتخاب نوع پرداخت، مبلغ را با ماندهٔ فاکتور پر می‌کند
  assert.match(bind,/\[data-paytype\]'\)\.onchange=\(\)=>\{makeDetail\(r\);stlPayAutoFill\(r\);upd\(\);\}/);
  // تراکنش تازه با ماندهٔ فاکتور شروع می‌شود
  assert.match(bind,/host\.appendChild\(tpl\);bindRow\(tpl\);stlPayAutoFill\(tpl\);upd\(\)/);
  // با ویرایش مبلغ یک ردیف، ردیف‌های خودکار بعدی ماندهٔ تازه را می‌گیرند
  assert.match(bind,/r\.dataset\.autopay='';const v=stlPayParse\(e\.target\.value\);e\.target\.value=stlPayFmt\(v\);stlRefreshAutoPayments\(\)/);
  // تغییر مبلغ فاکتور (قیمت/تخفیف/اضافات) هم ردیف‌های خودکار را هم‌گام می‌کند
  const recalc=slice(app,'function stlRecalc()','function stlUpdateSigState()');
  assert.match(recalc,/stlRefreshAutoPayments\(\)/);
  // جمع روش‌ها باید با ماندهٔ پس از کسر بیعانه برابر باشد.
  assert.match(app,/if\(paid!==Math\.max\(0,stlDue\(\)\)\) errs\.push/);
});
