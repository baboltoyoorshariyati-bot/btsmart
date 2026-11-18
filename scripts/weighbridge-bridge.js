#!/usr/bin/env node
'use strict';
require('../lib/load-env').loadEnv();
// پل باسکول: خروجی سریال نمایشگر PU 850 را می‌خواند و به سامانه ارسال می‌کند.
//
// اجرا روی ویندوز سرور (کنار سامانه، همان ماشین):
//   node scripts/weighbridge-bridge.js --port COM3 --baud 9600 --server http://127.0.0.1 --token <WEIGHBRIDGE_TOKEN>
// نیاز به بسته serialport دارد:  npm install serialport   (یک بار، داخل پوشه پروژه)
//
// حالت آزمایش بدون دستگاه (خطوط را از ورودی استاندارد بخوان):
//   echo ST,GS +012345.6 kg | node scripts/weighbridge-bridge.js --stdin --server http://127.0.0.1 --token <TOKEN>
//
// توکن را در .env با WEIGHBRIDGE_TOKEN تنظیم کنید؛ هرگز در کد یا Git قرار ندهید.
const http = require('node:http');
const https = require('node:https');
const readline = require('node:readline');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}
const has = (name) => process.argv.includes(`--${name}`);

const server = arg('server', 'http://127.0.0.1');
const token = arg('token', process.env.WEIGHBRIDGE_TOKEN || '');
const port = arg('port', 'COM3');
const baud = Number(arg('baud', '9600'));
const useStdin = has('stdin');
const minIntervalMs = Number(arg('interval', '300'));

if (!token) { console.error('توکن باسکول مشخص نشده است (--token یا WEIGHBRIDGE_TOKEN).'); process.exit(2); }

let lastSent = 0;
let inFlight = false;

function post(line) {
  return new Promise((resolve) => {
    const url = new URL('/api/weighbridge/reading', server);
    const body = JSON.stringify({ line });
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Scale-Token': token },
      timeout: 4000,
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', (e) => { console.error('خطای ارسال:', e.message); resolve(0); });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end(body);
  });
}

// خط‌های خام را محدود می‌کنیم تا از ارسال بی‌رویه جلوگیری شود
async function handle(raw) {
  const line = String(raw || '').replace(/[\r\n\x00-\x08]/g, '').trim();
  if (!line || inFlight || Date.now() - lastSent < minIntervalMs) return;
  lastSent = Date.now(); inFlight = true;
  const code = await post(line);
  inFlight = false;
  console.log(new Date().toISOString(), code === 200 ? 'OK' : `HTTP ${code}`, line.slice(0, 60));
}

if (useStdin) {
  readline.createInterface({ input: process.stdin }).on('line', handle);
} else {
  let SerialPort;
  try { ({ SerialPort } = require('serialport')); }
  catch { console.error('بسته serialport نصب نیست. دستور npm install serialport را اجرا کنید.'); process.exit(3); }
  const sp = new SerialPort({ path: port, baudRate: baud, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: true });
  sp.on('open', () => console.log(`پورت ${port} باز شد (${baud} baud)`));
  sp.on('error', (e) => { console.error('خطای پورت:', e.message); process.exit(4); });
  readline.createInterface({ input: sp }).on('line', handle);
}
