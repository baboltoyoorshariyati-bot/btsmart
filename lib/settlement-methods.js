'use strict';
const { fail } = require('./http');
const validate = require('./validate');
const TYPES = new Set(['CASH','POS','CARD_TRANSFER','CHECK','CREDIT']);
function cleanRows(rows, total, db) {
  if ((!Array.isArray(rows) || !rows.length) && Number(total) === 0) return [];
  if (!Array.isArray(rows) || !rows.length) fail(400, 'حداقل یک روش تسویه ثبت کنید.');
  const result = rows.map((r) => {
    const type = String(r?.type || '').toUpperCase();
    if (!TYPES.has(type)) fail(400, 'روش تسویه نامعتبر است.');
    const amount = validate.number(r.amount, { field: 'مبلغ روش تسویه', min: 1, max: validate.MAX_MONEY });
    if (!Number.isInteger(amount)) fail(400, 'مبلغ روش تسویه باید ریال صحیح باشد.');
    const row = { type, amount, note: validate.text(r.note || '', { field: 'یادداشت تسویه', max: 250 }) };
    if (type === 'POS') {
      const d = (db.paymentDevices || []).find(x => x.id === String(r.deviceId || '') && x.isActive);
      if (!d) fail(400, 'دستگاه پوز فعال و معتبر انتخاب کنید.');
      row.deviceId = d.id;
      row.deviceSnapshot = { title: d.title, terminalNumber: d.terminalNumber, bank: d.bank, model: d.model, simNumber: d.simNumber || '' };
      row.reference = validate.text(r.reference || '', { field: 'شماره پیگیری پوز', max: 100 });
    } else if (type === 'CARD_TRANSFER') {
      row.bank = validate.text(r.bank || '', { field: 'بانک مقصد', max: 100 });
      row.reference = validate.text(r.reference || '', { field: 'شناسه پیگیری کارت‌به‌کارت', max: 100 });
      if (!row.bank || !row.reference) fail(400, 'بانک مقصد و شناسه پیگیری کارت‌به‌کارت الزامی است.');
    } else if (type === 'CHECK') {
      row.bank = validate.text(r.bank || '', { field: 'بانک چک', max: 100 });
      row.checkNumber = validate.text(r.checkNumber || '', { field: 'شماره چک', max: 100 });
      row.dueDate = validate.text(r.dueDate || '', { field: 'سررسید چک', max: 10 });
      if (!row.bank || !row.checkNumber || !validate.localDateTime(row.dueDate + 'T12:00')) fail(400, 'بانک، شماره و تاریخ سررسید معتبر چک الزامی است.');
      row.checkStatus = 'PENDING';
    } else if (type === 'CREDIT') {
      row.reason = validate.text(r.reason || '', { field: 'علت مانده معوق', max: 250 });
    }
    return row;
  });
  const sum = result.reduce((a, x) => a + x.amount, 0);
  if (sum !== Number(total)) fail(400, `جمع روش‌های تسویه (${sum.toLocaleString('en-US')} ریال) باید برابر مبلغ قابل تسویه (${Number(total).toLocaleString('en-US')} ریال) باشد.`);
  return result;
}
module.exports = { cleanRows };
