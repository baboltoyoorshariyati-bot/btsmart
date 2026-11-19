/* ui-compact-v2-enhance.js — فاز ۳ بازطراحی رابط کاربری (بابل طیور)
   ---------------------------------------------------------------------------
   دو کار انجام می‌دهد و هر دو فقط «نمایشی» هستند:
   ۱) فرم‌های بلند (سفارش فروش و نگهبانی) را به گام‌های شماره‌دار جمع‌شونده تبدیل می‌کند.
   ۲) جدول‌های پرستون را برای صفحه‌های باریک به کارت تبدیل می‌کند (با data-label).

   قواعد ایمنی:
   - هیچ شناسه/نام/ترتیب DOMِ منطقی تغییر نمی‌کند؛ فقط بسته‌بندی نمایشی اضافه می‌شود.
   - دکمهٔ ثبت، نوار عملیات و پیام خطا بیرون از گام‌ها می‌مانند.
   - اگر فیلد نامعتبری داخل گام بسته باشد، گام خودکار باز می‌شود (رویداد invalid).
   - با ?ui=classic این فایل به‌کل بارگذاری نمی‌شود.
*/
(function () {
  'use strict';

  var STEP_TITLES = ['مشتری و تماس', 'اقلام سفارش', 'جزئیات و تأیید'];
  var KEEP = '.sales-form-bottom-v25, .form-error, .sd-submit-bar, .bt-sync-state';

  function text(el) {
    if (!el) return '';
    var h = el.querySelector('h1,h2,h3,h4');
    return h && h.textContent ? h.textContent.trim() : '';
  }

  /* ---------- ۱) گام‌بندی فرم‌ها ---------- */
  function stepForm(form) {
    if (!form || form.dataset.bt2Steps === '1') return;
    var kids = Array.prototype.filter.call(form.children, function (c) {
      return !c.matches(KEEP) && !c.matches('script,style');
    });
    if (kids.length < 2) return;

    var isGate = form.id === 'gateForm';
    var groups = isGate ? [[], []] : [[], [], []];
    kids.forEach(function (c) {
      var cl = (c.className || '').toString();
      if (isGate) {
        // نگهبانی: گام ۱ جست‌وجو، گام ۲ اطلاعات مراجعه
        if (/search|picker|customer/i.test(cl)) groups[0].push(c); else groups[1].push(c);
        return;
      }
      if (/customer|contact|picker|search/i.test(cl)) groups[0].push(c);
      else if (/items|lines|product|op-lines/i.test(cl)) groups[1].push(c);
      else groups[2].push(c);
    });
    // اگر گروه‌های اصلی خالی بودند، گام‌بندی بی‌معنی است → دست نزن
    if (groups[0].length === 0 || groups[1].length === 0) return;

    var titles = isGate
      ? ['جست‌وجوی مشتری و سفارش', 'اطلاعات مراجعه و وسیله']
      : STEP_TITLES;

    var made = 0;
    groups.forEach(function (g, i) {
      if (!g.length) return;
      var d = document.createElement('details');
      d.className = 'bt2-step';
      d.open = (made === 0); // گام اول باز، بقیه بسته
      var s = document.createElement('summary');
      s.className = 'bt2-step-head';
      s.innerHTML = '<span class="bt2-step-no">' + ['۱', '۲', '۳'][i] + '</span>' +
        '<span class="bt2-step-title">' + (titles[i] || 'گام ' + (i + 1)) + '</span>' +
        '<span class="bt2-step-chev" aria-hidden="true"></span>';
      d.appendChild(s);
      var body = document.createElement('div');
      body.className = 'bt2-step-body';
      g[0].parentNode.insertBefore(d, g[0]);
      g.forEach(function (node) { body.appendChild(node); });
      d.appendChild(body);
      made++;
    });
    if (made < 2) return; // چیزی عوض نشده
    form.dataset.bt2Steps = '1';
    form.classList.add('bt2-steps');
  }

  /* ---------- ۲) جدول → کارت ---------- */
  function cardTables(root) {
    var tables = (root || document).querySelectorAll('#content table');
    Array.prototype.forEach.call(tables, function (t) {
      // اگر همهٔ سلول‌ها قبلاً برچسب گرفته‌اند، دوباره کاری لازم نیست
      if (t.dataset.bt2Card === '1' && !t.querySelector('tbody td:not([data-label])')) return;
      var ths = t.querySelectorAll('thead th');
      if (ths.length < 4) return;            // جدول‌های کوچک و چیدمانی دست‌نخورده می‌مانند
      var labels = Array.prototype.map.call(ths, function (th) { return th.textContent.trim(); });
      if (labels.join('').length < 6) return;
      var rows = t.querySelectorAll('tbody tr');
      if (!rows.length) return;
      // ردیف «داده‌ای ثبت نشده» (تک‌سلول colspan) کارت نمی‌شود
      var dataRows = Array.prototype.filter.call(rows, function (tr) {
        return !(tr.children.length === 1 && tr.children[0].hasAttribute('colspan'));
      });
      if (!dataRows.length) return;
      Array.prototype.forEach.call(rows, function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) {
          if (td.tagName !== 'TD') return;
          if (td.hasAttribute('colspan') || td.hasAttribute('rowspan')) return;
          if (labels[i] && !td.dataset.label) td.dataset.label = labels[i];
        });
      });
      t.dataset.bt2Card = '1';
    });
  }

  function run(root) {
    Array.prototype.forEach.call(document.querySelectorAll('#content form'), stepForm);
    cardTables(root);
  }

  /* ---------- راه‌اندازی ---------- */
  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { run(document); }, 120);
  }

  function start() {
    run(document);
    var content = document.getElementById('content');
    if (!content) { setTimeout(start, 400); return; }
    new MutationObserver(schedule).observe(content, { childList: true, subtree: true });
  }

  // فیلد نامعتبر داخل گام بسته: گام را باز کن تا کاربر خطا را ببیند
  document.addEventListener('invalid', function (e) {
    var d = e.target && e.target.closest ? e.target.closest('details.bt2-step') : null;
    if (d) { d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
