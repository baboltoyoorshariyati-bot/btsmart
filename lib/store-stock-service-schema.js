'use strict';
// Internal SQLite tables for the not-yet-enabled consolidated-stock service.
// Keep these separate from the live collection mapper: their consistency rules
// are enforced by their own transaction-aware repository.
const TABLES = Object.freeze(['stock_service_drafts', 'stock_service_draft_members']);
function initialize(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS stock_service_drafts (
    id TEXT PRIMARY KEY, branch_no INTEGER NOT NULL, status TEXT NOT NULL,
    revision INTEGER NOT NULL, payload TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS stock_service_one_open_per_branch
    ON stock_service_drafts(branch_no) WHERE status = 'OPEN';
  CREATE TABLE IF NOT EXISTS stock_service_draft_members (
    order_id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES stock_service_drafts(id)
  );`);
}
// Canonical columns are obtained without adding experimental tables to the live
// database. This keeps ordinary backups readable by older application versions.
function columns(name) {
  if (!TABLES.includes(name)) throw new Error('جدول سرویس تجمیعی نامعتبر است.');
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(':memory:');
  try { initialize(db); return db.prepare(`PRAGMA table_info(${name})`).all(); }
  finally { db.close(); }
}
// A pre-feature backup legitimately has neither table; half a schema never is.
function present(tables) {
  const count=TABLES.filter(name=>tables.has(name)).length;
  if (count!==0 && count!==TABLES.length) throw new Error('جدول‌های سرویس تجمیعی در پشتیبان ناقص هستند.');
  return count===TABLES.length;
}
function validateRows(all, prefix='') {
  if (prefix!=='' && prefix!=='restore_source.') throw new Error('ناحیهٔ پشتیبان نامعتبر است.');
  const services=new Map(), openBranches=new Set(), expectedMembers=new Map();
  for (const row of all(`SELECT id, branch_no, status, revision, payload FROM ${prefix}stock_service_drafts`)) {
    let doc; try { doc=JSON.parse(row.payload); } catch { throw new Error('دادهٔ سرویس تجمیعی پشتیبان معتبر نیست.'); }
    if (!doc || typeof doc!=='object' || Array.isArray(doc) || !row.id || doc.id!==row.id || !Number.isInteger(row.branch_no) || row.branch_no<1 || row.branch_no>59 || doc.branchNo!==row.branch_no || !['OPEN','HANDED_OVER'].includes(row.status) || doc.status!==row.status || !Number.isSafeInteger(row.revision) || row.revision<0 || doc.revision!==row.revision || !Array.isArray(doc.orders) || !Array.isArray(doc.sources) || !Array.isArray(doc.weighings)) throw new Error('ساختار سرویس تجمیعی پشتیبان ناسازگار است.');
    if (row.status==='OPEN') { if (openBranches.has(row.branch_no) || doc.handover) throw new Error('وضعیت سرویس تجمیعی پشتیبان ناسازگار است.'); openBranches.add(row.branch_no); }
    else if (!doc.handover?.document?.documentNo || doc.handover.document.serviceId!==row.id) throw new Error('سند سرویس تجمیعی پشتیبان ناسازگار است.');
    const memberIds=new Set();
    for (const member of doc.orders) {
      if (typeof member?.orderId!=='string' || !member.orderId || memberIds.has(member.orderId) || expectedMembers.has(member.orderId)) throw new Error('عضویت سفارش در پشتیبان ناسازگار است.');
      memberIds.add(member.orderId);expectedMembers.set(member.orderId,row.id);
    }
    const itemIds=new Set(), sourceById=new Map(), ordersWithItems=new Set();
    for (const item of doc.sources) {
      if (!item || typeof item.itemId!=='string' || !item.itemId || itemIds.has(item.itemId) || !memberIds.has(item.orderId) || typeof item.productId!=='string' || !item.productId || typeof item.productName!=='string' || !item.productName || !['کیلوگرم','بسته','عدد','کارتن'].includes(item.requestedUnit) || !Number.isFinite(Number(item.requestedQty)) || Number(item.requestedQty)<=0 || !['PENDING','WEIGHED','OUT_OF_STOCK'].includes(item.resolution)) throw new Error('اقلام سرویس تجمیعی پشتیبان ناسازگارند.');
      itemIds.add(item.itemId);sourceById.set(item.itemId,item);ordersWithItems.add(item.orderId);
    }
    if ([...memberIds].some(id=>!ordersWithItems.has(id))) throw new Error('قلم سفارش عضو سرویس در پشتیبان یافت نشد.');
    const { productNameKey }=require('./store-stock-consolidation');
    const productKeys=new Map();
    for (const item of doc.sources) {
      const key=productNameKey(item.productName);
      if (!key || (productKeys.has(item.productId) && productKeys.get(item.productId)!==key)) throw new Error('نام کالای سرویس تجمیعی پشتیبان ناسازگار است.');
      productKeys.set(item.productId,key);
    }
    const weighed=new Set();
    for (const entry of doc.weighings) {
      const grams=Number(entry?.kg)*1000;
      if (!entry || typeof entry.productId!=='string' || !Number.isFinite(grams) || grams<1 || grams>100000000 || Math.abs(grams-Math.round(grams))>1e-6 || !Array.isArray(entry.itemIds) || !entry.itemIds.length) throw new Error('وزن سرویس تجمیعی پشتیبان ناسازگار است.');
      for (const id of entry.itemIds) {
        const item=sourceById.get(id);
        if (!item || !productKeys.has(entry.productId) || productNameKey(item.productName)!==productKeys.get(entry.productId) || item.resolution!=='WEIGHED' || weighed.has(id)) throw new Error('منشأ وزن سرویس تجمیعی پشتیبان ناسازگار است.');
        weighed.add(id);
      }
    }
    if (doc.sources.some(item=>(item.resolution==='WEIGHED')!==weighed.has(item.itemId))) throw new Error('وزن قلم سرویس تجمیعی پشتیبان ناسازگار است.');
    if (row.status==='HANDED_OVER') {
      const docSnapshot=doc.handover.document;
      if (doc.sources.some(item=>item.resolution==='PENDING') || !doc.weighings.length || docSnapshot.branchNo!==doc.branchNo || !require('node:util').isDeepStrictEqual(docSnapshot.orderNos,doc.orders.map(o=>o.orderNo)) || !require('node:util').isDeepStrictEqual(docSnapshot.lines,require('./store-stock-service').serviceLines(doc))) throw new Error('سند سرویس تجمیعی پشتیبان ناسازگار است.');
    }
    require('./store-stock-transport').validate(doc);
    services.set(row.id,doc);
  }
  const actualMembers=new Set();
  for (const row of all(`SELECT order_id, service_id FROM ${prefix}stock_service_draft_members`)) {
    if (!row.order_id || actualMembers.has(row.order_id) || !services.has(row.service_id) || expectedMembers.get(row.order_id)!==row.service_id) throw new Error('عضویت سفارش در پشتیبان ناسازگار است.');
    actualMembers.add(row.order_id);
  }
  if (actualMembers.size!==expectedMembers.size) throw new Error('عضویت سفارش در پشتیبان ناقص است.');
  const orderRows=all(`SELECT id, payload FROM ${prefix}orders`);
  const orderIds=new Set(orderRows.map(row=>row.id));
  if ([...actualMembers].some(id=>!orderIds.has(id))) throw new Error('سفارش عضو سرویس در پشتیبان یافت نشد.');
  const documentNumbers=[...services.values()].filter(s=>s.status==='HANDED_OVER').map(s=>s.handover.document.documentNo);
  if (documentNumbers.length) {
    const counter=all(`SELECT value FROM ${prefix}counters WHERE key='warehouseDocumentNumber'`)[0];
    require('./warehouse-document-numbers').validateStockServiceDocumentNumbers({orders:orderRows.map(row=>JSON.parse(row.payload)),counters:{warehouseDocumentNumber:counter?.value}},documentNumbers);
  }
}
module.exports={TABLES,initialize,columns,present,validateRows};
