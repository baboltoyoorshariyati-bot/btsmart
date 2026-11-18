'use strict';
// نقطه ورود سامانه عملیات بابل طیور
require('./lib/load-env').loadEnv();
const http = require('http');
const config = require('./lib/config');
const log = require('./lib/logger');
const store = require('./lib/store');
const sec = require('./lib/security');
const { createHandler } = require('./lib/http');
const { manager: tlsManager } = require('./lib/tls-manager');
require('./lib/routes');
const { activateDueRemoteOrders } = require('./lib/domain');
const autoBackup = require('./lib/auto-backup');

const release = store.acquireLock();
store.init();

const appHandler = createHandler();
const server = http.createServer((req,res)=>tlsManager.httpHandler(req,res,appHandler));
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;

// Run missed backups on restart; the schedule is independent of browser sessions.
try { autoBackup.runDue(); } catch (e) { log.error('auto-backup', 'scheduler startup failed', {error:e.message}); }

// وظایف زمان‌بندی‌شده: فعال‌سازی سفارش‌های آینده و پاک‌سازی نشست‌های منقضی
const timers = [
  setInterval(() => { try { store.refresh(); activateDueRemoteOrders(); } catch (e) { log.error('scheduler', 'activation failed', { error: e.message }); } }, 15000),
  setInterval(() => sec.pruneSessions(), 5 * 60 * 1000),
  setInterval(() => { try { autoBackup.runDue(); } catch (e) { log.error('auto-backup', 'scheduler failed', {error:e.message}); } }, 60 * 1000),
];
timers.forEach((t) => t.unref());

let stopping = false;
function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  log.info('server', 'shutting down', { signal });
  timers.forEach(clearInterval);
  tlsManager.close();
  server.close(() => { store.sql.close(); release(); process.exit(exitCode); });
  server.closeIdleConnections();
  setTimeout(() => { release(); process.exit(exitCode); }, 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
function fatal(e) {
  log.error('process', 'fatal error', { error: e?.message || String(e), stack: e?.stack });
  shutdown('fatal', 1);
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);
server.on('error', fatal);

tlsManager.init(appHandler).then(() => {
  server.listen(config.PORT, config.HOST, () => {
    log.info('server', 'listening', { host: config.HOST, port: server.address().port, env: config.APP_ENV });
  });
}).catch(fatal);
