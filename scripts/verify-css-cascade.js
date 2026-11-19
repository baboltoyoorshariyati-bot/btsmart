#!/usr/bin/env node
'use strict';
/*
 * ابزار تأیید «بی‌اثر بودن» پاک‌سازی CSS (فاز ۴).
 *
 *   node scripts/verify-css-cascade.js [ref]
 *
 * [ref] پیش‌فرض HEAD است. ابزار نسخهٔ CSS در آن مرجع و نسخهٔ روی دیسک را
 * دوباره تجزیه می‌کند و «نقشهٔ آبشاری» هر دو را می‌سازد: برای هر
 * (media, selector, property, !important) آخرین مقدار برنده در کل زنجیرهٔ
 * فایل‌ها. اگر این نقشه یکی باشد، مرورگر برای هیچ عنصری مقدار دیگری محاسبه
 * نمی‌کند؛ یعنی حذف اعلان‌های تکراری و جایگزینی رنگ‌های خام با توکن،
 * ظاهر را تغییر نداده است.
 *
 * خروجی: JSON + کد خروج ۱ در صورت وجود اختلاف.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'styles.css', 'design.css', 'mobile.css', 'theme.css', 'form-layout.css',
  'invoice-compact.css', 'warehouse-document.css', 'compatibility.css',
  'transport-resources.css', 'responsive.css', 'fonts.css'
];

// ── تجزیهٔ CSS با آفست (رشته‌ها و کامنت‌ها محترم شمرده می‌شوند) ────────────────
function parseCss(text) {
  const masked = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rules = [];
  const stack = [];
  let i = 0, segStart = 0, quote = null;
  const skipAt = (s) => /^@(keyframes|-webkit-keyframes|-moz-keyframes|font-face|page|counter-style|property)/i.test(s);
  while (i < masked.length) {
    const ch = masked[i];
    if (quote) { if (ch === '\\') { i += 2; continue; } if (ch === quote) quote = null; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === '{') {
      const norm = masked.slice(segStart, i).trim().replace(/\s+/g, ' ');
      stack.push({ isAt: norm[0] === '@', norm, bodyStart: i + 1, skip: skipAt(norm) });
      segStart = i + 1; i++; continue;
    }
    if (ch === '}') {
      const top = stack[stack.length - 1];
      if (top && !top.isAt) {
        const media = stack.filter((s) => s.isAt).map((s) => s.norm).join(' && ');
        rules.push({
          selector: top.norm, media, skip: stack.some((s) => s.skip),
          decls: parseDecls(masked, top.bodyStart, i)
        });
      }
      stack.pop(); i++; segStart = i; continue;
    }
    i++;
  }
  return rules;
}

function parseDecls(masked, from, to) {
  const out = [];
  let depth = 0, start = from, quote = null;
  const push = (a, b) => {
    const raw = masked.slice(a, b).replace(/;\s*$/, '');
    if (!raw.trim()) return;
    const colon = raw.indexOf(':');
    if (colon < 0) return;
    const prop = raw.slice(0, colon).trim().toLowerCase();
    let value = raw.slice(colon + 1).trim();
    const important = /!important\s*$/i.test(value);
    if (important) value = value.replace(/!important\s*$/i, '').trim();
    if (!prop || prop.startsWith('--') || /[{}]/.test(prop)) return;
    out.push({ prop, value, important });
  };
  for (let i = from; i < to; i++) {
    const ch = masked[i];
    if (quote) { if (ch === '\\') { i++; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) { push(start, i + 1); start = i + 1; }
  }
  push(start, to);
  return out;
}

// ── ساخت نقشهٔ آبشاری ────────────────────────────────────────────────────────
function buildTokenMap(read) {
  const map = new Map();
  for (const f of FILES) {
    let text; try { text = read(f); } catch { continue; }
    for (const m of text.matchAll(/(--bt-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
      if (!map.has(m[1])) map.set(m[1], m[2]);
    }
  }
  return map;
}

function collect(read) {
  const tokens = buildTokenMap(read);
  const norm = (t) => t.replace(/var\((--bt-[a-z0-9-]+)\)/g, (m, k) => tokens.get(k) || m);
  const resolved = new Map();
  const order = [];
  let decls = 0, important = 0;
  for (const f of FILES) {
    let text; try { text = read(f); } catch { continue; }
    for (const r of parseCss(norm(text))) {
      if (r.skip) continue;
      order.push(`${r.media}||${r.selector}`);
      for (const d of r.decls) {
        decls++;
        if (d.important) important++;
        resolved.set(`${r.media}||${r.selector}||${d.prop}||${d.important}`, d.value.replace(/\s+/g, ' '));
      }
    }
  }
  return { resolved, order, decls, important };
}

const ref = process.argv[2] || 'HEAD';
const readDisk = (f) => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
const readRef = (f) => execSync(`git -C ${JSON.stringify(ROOT)} show ${ref}:public/${f}`, { encoding: 'utf8', maxBuffer: 1 << 26 });

const before = collect(readRef);
const after = collect(readDisk);

let missing = 0, changed = 0, added = 0;
for (const [k, v] of before.resolved) {
  if (!after.resolved.has(k)) missing++;
  else if (after.resolved.get(k) !== v) changed++;
}
for (const k of after.resolved.keys()) if (!before.resolved.has(k)) added++;
let orderProblems = 0, j = 0;
for (const s of after.order) {
  while (j < before.order.length && before.order[j] !== s) j++;
  if (j >= before.order.length) { orderProblems++; j = 0; } else j++;
}

const report = {
  ref,
  declarations: { before: before.decls, after: after.decls },
  important: { before: before.important, after: after.important },
  cascadeKeys: { before: before.resolved.size, after: after.resolved.size },
  rules: { before: before.order.length, after: after.order.length },
  differences: { missing, changed, added, orderProblems }
};
console.log(JSON.stringify(report, null, 1));

const ok = missing === 0 && changed === 0 && added === 0 && orderProblems === 0;
if (!ok) {
  console.error('\n✖ نقشهٔ آبشاری تغییر کرده است — این پاک‌سازی «بی‌اثر» نیست.');
  process.exit(1);
}
console.log('\n✔ نقشهٔ آبشاری مو‌به‌مو یکسان است: هیچ عنصری مقدار محاسبه‌شدهٔ دیگری نمی‌گیرد.');
