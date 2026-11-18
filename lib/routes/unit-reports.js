'use strict';
const { route, fail } = require('../http');
const store = require('../store');
const unitReports = require('../unit-reports');
function run(ctx, limit) {
  try { return unitReports.query(store.get(), ctx.user, ctx.params.unit, ctx.body || {}, { limit }); }
  catch (e) { if (e.status) fail(e.status, e.message); throw e; }
}
route('GET', '/api/unit-reports/:unit/sources', {}, async ctx => {
  try { return { body: { sources: unitReports.describe(ctx.user, ctx.params.unit) } }; }
  catch (e) { if (e.status) fail(e.status, e.message); throw e; }
});
route('POST', '/api/unit-reports/:unit/query', {}, async ctx => {
  const result = run(ctx, 5000);
  store.audit(ctx.user, 'UNIT_REPORT_QUERY', 'report', ctx.params.unit, { source: result.source, rows: result.total }, ctx);
  store.save();
  return { body: result };
});
route('POST', '/api/unit-reports/:unit/export', {}, async ctx => {
  const result = run(ctx, Infinity);
  store.audit(ctx.user, 'UNIT_REPORT_EXPORT', 'report', ctx.params.unit, { source: result.source, rows: result.total }, ctx);
  store.save();
  return { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="report-${ctx.params.unit}.csv"`, 'X-Report-Rows': String(result.total) }, stream: res => require('../csv').streamCsv(res, result) };
});
