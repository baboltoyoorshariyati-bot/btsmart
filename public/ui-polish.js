/* ================================================================
   v37.3 — ui-polish.js
   لایهٔ کوچک تکمیلی رابط کاربری (بعد از همهٔ اسکریپت‌ها بارگذاری می‌شود)
   ۱) تبدیل خودکار ورودی‌های تاریخ میلادی مرورگر (input[type=date]) به
      ورودی شمسی با همان تقویم جلالی سامانه؛ مقدار ISO برای API حفظ می‌شود.
   ۲) نگه‌داشتن تب فعال در دید، وقتی نوار تب‌ها افقی اسکرول می‌شود.
   هیچ منطق کسب‌وکاری تغییر نمی‌کند؛ شناسه‌ها و رویدادهای change حفظ شده‌اند.
   ================================================================ */
(function () {
  'use strict';
  const hasJalali = typeof isoToJalali === 'function' && typeof jalaliToIso === 'function';
  let seq = 0;

  function upgradeDateInput(input) {
    if (!hasJalali || input.dataset.jUpgraded) return;
    input.dataset.jUpgraded = '1';
    const key = 'jdate-' + (input.id || ('n' + (++seq)));
    const iso = input.value || '';
    // ورودی اصلی پنهان می‌شود اما id و رویداد change آن برای کد موجود باقی می‌ماند
    input.type = 'hidden';
    input.name = key;
    const vis = document.createElement('input');
    vis.type = 'text';
    vis.className = 'jalali-date-input ui-jdate';
    vis.dataset.target = key;
    vis.setAttribute('inputmode', 'numeric');
    vis.setAttribute('autocomplete', 'off');
    vis.setAttribute('dir', 'ltr');
    vis.placeholder = '۱۴۰۵/۰۱/۰۱';
    vis.value = iso ? isoToJalali(iso) : '';
    vis.setAttribute('aria-label', (input.closest('label')?.textContent || 'تاریخ').trim() + ' (شمسی)');
    input.insertAdjacentElement('beforebegin', vis);
    const sync = () => {
      const v = typeof normalizeJalaliText === 'function' ? normalizeJalaliText(vis.value) : vis.value;
      vis.value = v;
      const next = v ? jalaliToIso(v) : '';
      vis.classList.toggle('invalid', !!v && !next);
      if (!v || next) {
        if (input.value !== next) { input.value = next; input.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    };
    vis.addEventListener('blur', sync);
    vis.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sync(); } });
  }

  function keepActiveTabVisible(root) {
    root.querySelectorAll('.sd-tabs, .wh38-tabs, .v26-sales-tabs, .unit-tabs').forEach((bar) => {
      if (bar.scrollWidth <= bar.clientWidth + 2) return;
      const active = bar.querySelector('.active, .is-active');
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }

  // شمارنده‌های صفر («۰») در تب‌ها نمایش داده نمی‌شوند تا فقط کار واقعی دیده شود
  function markZeroCounts(root) {
    root.querySelectorAll('.wh38-tab > em, .sd-tab-count, .v26-tab-count, .tab-count').forEach((el) => {
      const t = (el.textContent || '').trim();
      el.classList.toggle('is-zero', t === '' || t === '0' || t === '۰');
    });
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    markZeroCounts(root);
    root.querySelectorAll('input[type="date"]').forEach(upgradeDateInput);
    keepActiveTabVisible(root);
  }

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; scan(document.getElementById('content')); scan(document.getElementById('modal')); });
  });
  function start() {
    ['content', 'modal'].forEach((id) => { const el = document.getElementById(id); if (el) { observer.observe(el, { childList: true, subtree: true }); scan(el); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* ================================================================
   v37.43.0 — منوی کشویی موبایل
   در موبایل (عرض حداکثر ۶۴۰px) ستون سمت راست مخفی است تا فضای محتوا
   کامل شود؛ با دکمهٔ منو در هدر باز می‌شود و با پس‌زمینه، دکمهٔ بستن،
   کلید Esc یا انتخاب هر گزینه بسته می‌شود. در تبلت/دسکتاپ تغییری نیست.
   ================================================================ */
(function () {
  'use strict';
  function start() {
    const appView = document.getElementById('appView');
    const toggle = document.getElementById('railToggleBtn');
    if (!appView || !toggle) return;
    const closeBtn = document.getElementById('railCloseBtn');
    const backdrop = document.getElementById('railBackdrop');
    const rail = appView.querySelector('.rail');
    const setOpen = (open) => {
      appView.classList.toggle('rail-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'بستن منوی ناوبری' : 'باز کردن منوی ناوبری');
      if (backdrop) backdrop.hidden = !open;
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (open && rail) rail.scrollTop = 0;
    };
    toggle.addEventListener('click', () => setOpen(!appView.classList.contains('rail-open')));
    if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
    if (backdrop) backdrop.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    const nav = document.getElementById('railNav');
    if (nav) nav.addEventListener('click', (e) => { if (e.target.closest('button')) setOpen(false); });
    window.addEventListener('resize', () => { if (window.innerWidth > 640) setOpen(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
