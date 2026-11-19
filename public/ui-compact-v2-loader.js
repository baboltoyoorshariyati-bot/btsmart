/* ui-compact-v2-loader.js — بارگذار لایهٔ نمایش فاز ۱ و ۲ بازطراحی رابط کاربری
   دلیل وجود: CSP پروژه (script-src 'self') اسکریپت درون‌خطی را اجرا نمی‌کند.
   خاموش‌کردن فوری بدون انتشار: آدرس/?ui=classic   |   برگشت: آدرس/?ui=new */
(function () {
  'use strict';
  try {
    var mode = new URLSearchParams(location.search).get('ui');
    if (mode === 'classic' || mode === 'new') { localStorage.setItem('bt_ui_v2', mode); }
    if (localStorage.getItem('bt_ui_v2') === 'classic') { return; }
  } catch (e) { /* بدون localStorage هم ظاهر جدید بارگذاری می‌شود */ }
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '/ui-compact-v2.css?v=37.6.0';
  document.head.appendChild(l);
})();
