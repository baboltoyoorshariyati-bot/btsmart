'use strict';
const fs = require('node:fs'), path = require('node:path');
// Explicit process environment wins. No interpolation/evaluation of configuration text.
function loadEnv(file = path.join(__dirname, '..', '.env'), env = process.env) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(env, match[1])) continue;
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote=value[0], end=value.lastIndexOf(quote);
      if (end===0 || !/^\s*(?:#.*)?$/.test(value.slice(end+1))) throw new Error(`Invalid quoted environment setting: ${match[1]}`);
      value=value.slice(1,end);
    } else value=value.replace(/\s+#.*$/, '').trim();
    env[match[1]]=value;
  }
}
module.exports = { loadEnv };
