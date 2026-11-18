'use strict';
// Settings live outside the restored database: restoring old data must not silently
// change or enable a server-side schedule. The service account owns the destination.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const store = require('./store');
const log = require('./logger');
const HOUR = 60 * 60 * 1000;
const RETRY = 5 * 60 * 1000;
const stateFile = () => path.join(config.DATA_DIR, 'auto-backup.json');
const blank = () => ({enabled:false, directory:'', retentionDays:0, maxSnapshots:0, lastSuccessAt:null, lastBackup:null, lastAttemptAt:null, lastError:null, nextRunAt:null});
function read() {
  try {
    const data=JSON.parse(fs.readFileSync(stateFile(),'utf8'));
    if (!data || typeof data !== 'object' || typeof data.enabled !== 'boolean' || typeof data.directory !== 'string') throw Error('invalid configuration');
    return {...blank(), ...data};
  } catch(e) {
    if(e.code==='ENOENT') return blank();
    throw new Error('خواندن تنظیمات پشتیبان خودکار ناموفق بود؛ فایل تنظیمات سرور را بررسی کنید.');
  }
}
function write(state) {
  fs.mkdirSync(config.DATA_DIR,{recursive:true,mode:0o700});
  const temp=path.join(config.DATA_DIR,`.auto-backup-${crypto.randomBytes(12).toString('hex')}.tmp`);
  try { fs.writeFileSync(temp,JSON.stringify(state),{flag:'wx',mode:0o600}); fs.renameSync(temp,stateFile()); }
  finally {try{fs.unlinkSync(temp)}catch{}}
}
function testDirectory(directory) {
  if(typeof directory!=='string' || !directory.trim() || directory.length>1024 || /[\x00-\x1f]/.test(directory) || !path.isAbsolute(directory)) throw new Error('مسیر پوشه باید کامل و مطلق روی سرور باشد.');
  const resolved=path.resolve(directory.trim());
  fs.mkdirSync(resolved,{recursive:true,mode:0o700});
  const probe=path.join(resolved,`.baboltoyor-write-test-${crypto.randomBytes(12).toString('hex')}`);
  const linked=probe+'.link';
  try { fs.writeFileSync(probe,'',{flag:'wx',mode:0o600}); fs.linkSync(probe,linked); }
  catch(e) { throw new Error('پوشه قابل نوشتن نیست یا از پیوند امن فایل پشتیبانی نمی‌کند (برای نمونه از پوشه‌ای روی NTFS استفاده کنید): '+e.message); }
  finally {try{fs.unlinkSync(linked)}catch{}try{fs.unlinkSync(probe)}catch{}}
  return resolved;
}
function configure({enabled,directory,retentionDays,maxSnapshots},now=Date.now()) {
  if(typeof enabled!=='boolean') throw new Error('وضعیت پشتیبان خودکار معتبر نیست.');
  const current=read();
  const policy = {};
  for (const [key, value, max] of [['retentionDays', retentionDays, 3650], ['maxSnapshots', maxSnapshots, 100000]]) {
    const n = value === undefined ? (current[key] || 0) : value;
    if (!Number.isInteger(n) || n < 0 || n > max) throw new Error('سیاست نگهداری باید عدد صحیح در محدودهٔ مجاز باشد.');
    policy[key] = n;
  }
  let dest=current.directory;
  if(enabled) dest=testDirectory(directory);
  else if(typeof directory==='string' && directory.trim()) dest=directory.trim();
  const changed=enabled && (!current.enabled || dest!==current.directory);
  const next={...current,...policy,enabled,directory:dest,nextRunAt:enabled?(changed?new Date(now).toISOString():current.nextRunAt||new Date(now).toISOString()):null,lastError:changed?null:current.lastError,lastSuccessAt:changed?null:current.lastSuccessAt,lastBackup:changed?null:current.lastBackup,lastAttemptAt:changed?null:current.lastAttemptAt};
  write(next);
  if(changed) runDue(now); // create an initial snapshot and expose failures immediately
  return read();
}
// Opt-in retention: never touch manual backups, unknown files, symlinks or the latest good snapshot.
function pruneSnapshots(state, now) {
  if (!state.retentionDays && !state.maxSnapshots) return;
  const pattern = /^baboltoyor-auto-\d{8}T\d{6}-[a-f0-9]{12}\.db$/;
  const rows = fs.readdirSync(state.directory).filter(name => pattern.test(name)).flatMap(name => {
    const file = path.join(state.directory, name), stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() ? [{name, file, time:stat.mtimeMs}] : [];
  }).sort((a,b) => b.time-a.time || b.name.localeCompare(a.name));
  let rank = 0;
  for (const row of rows) {
    if (row.name === state.lastBackup) continue;
    rank++;
    if ((state.maxSnapshots && rank >= state.maxSnapshots) ||
        (state.retentionDays && row.time < now - state.retentionDays * 86400000)) fs.unlinkSync(row.file);
  }
}
function runDue(now=Date.now()) {
  const state=read();
  if(!state.enabled || (state.nextRunAt && Date.parse(state.nextRunAt)>now)) return false;
  state.lastAttemptAt=new Date(now).toISOString();
  let temp;
  try {
    // Do not recreate a missing folder at run time: an unplugged/missing volume must
    // be reported rather than silently backing up to a different filesystem.
    if(!path.isAbsolute(state.directory) || !fs.statSync(state.directory).isDirectory()) throw Error('پوشهٔ مقصد در دسترس نیست.');
    const disk = fs.statfsSync(state.directory, {bigint:true});
    const required = BigInt(fs.statSync(store.sql.dbFile()).size) + 256n * 1024n * 1024n;
    if (disk.bavail * disk.bsize < required) throw Error('فضای آزاد مقصد برای پشتیبان و حاشیهٔ ایمنی کافی نیست.');
    const stamp=new Date(now).toISOString().replace(/[-:]/g,'').slice(0,15);
    const name=`baboltoyor-auto-${stamp}-${crypto.randomBytes(6).toString('hex')}.db`;
    temp=path.join(state.directory,`.baboltoyor-auto-${crypto.randomBytes(16).toString('hex')}.tmp`);
    // VACUUM INTO accepts an empty existing file; create it privately before SQLite writes.
    fs.closeSync(fs.openSync(temp,'wx',0o600));
    store.sql.vacuumInto(temp);
    store.sql.validateSnapshot(temp);
    try {fs.chmodSync(temp,0o600)} catch {} // Windows relies on destination directory ACLs.
    // Atomic publication, no overwriting existing snapshots.
    fs.linkSync(temp,path.join(state.directory,name));
    state.lastSuccessAt=new Date(now).toISOString();state.lastBackup=name;state.lastError=null;state.nextRunAt=new Date(now+HOUR).toISOString();
    try { pruneSnapshots(state, now); }
    catch(e) { log.error('auto-backup', 'retention failed', {error:e.message}); state.lastError='پشتیبان ساخته شد، اما پاک‌سازی نسخه‌های قدیمی ناموفق بود.'; }
    try {store.audit(null,'AUTO_BACKUP_CREATED','backup',name,{directory:state.directory});store.save();} catch(e) {log.error('auto-backup','audit failed',{error:e.message});}
  } catch(e) {
    state.lastError=`پشتیبان خودکار ساخته نشد: ${e.message}`;state.nextRunAt=new Date(now+RETRY).toISOString();
    log.error('auto-backup','backup failed',{error:e.message});
  } finally {if(temp)try{fs.unlinkSync(temp)}catch{}}
  write(state);
  return !state.lastError;
}
module.exports={read,configure,runDue,HOUR,RETRY};
