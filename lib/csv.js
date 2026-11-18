'use strict';
// Formula-looking text is prefixed before RFC 4180 quoting. Numeric values keep their type.
function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (typeof value !== 'number' && /^(?:\s*[=+\-@]|[\t\r\n])/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
async function streamCsv(res, report) {
  const write = async text => {
    if (res.destroyed) return false;
    if (!res.write(text)) {
      // A disconnected downloader must not leave a pending drain listener.
      await new Promise((resolve,reject)=>{
        const clean=()=>{res.off('drain',done);res.off('close',done);res.off('error',error)};
        const done=()=>{clean();resolve()};const error=e=>{clean();reject(e)};
        res.once('drain',done);res.once('close',done);res.once('error',error);
      });
    }
    return !res.destroyed;
  };
  if (!await write('\ufeff' + report.columns.map(c => csvCell(c.label)).join(',') + '\r\n')) return;
  for (let i = 0; i < report.rows.length; i += 250) {
    const text = report.rows.slice(i, i + 250).map(row => report.columns.map(c => csvCell(row[c.key])).join(',')).join('\r\n') + '\r\n';
    if (!await write(text)) return;
  }
}
module.exports = { csvCell, streamCsv };
