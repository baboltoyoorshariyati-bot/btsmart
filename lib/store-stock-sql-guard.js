'use strict';
// Experimental, opt-in SQLite-level fail-closed guard. This is NOT installed at
// startup or on user databases: activation needs trusted, narrow member-state
// propagation and a restore/migration design. It protects against ordinary SQL
// writes from any connection, not someone with authority to alter the schema.
// Deliberately uses only built-in SQL, so external connections need no UDF.
const member=expr=>`EXISTS (SELECT 1 FROM stock_service_draft_members WHERE order_id=${expr})`;
const activeProduct=expr=>`EXISTS (SELECT 1 FROM stock_service_drafts s, json_each(s.payload, '$.sources') src WHERE COALESCE(json_extract(s.payload, '$.transport.stage'),'') <> 'CLOSED' AND json_extract(src.value,'$.productId')=${expr})`;
const specs=[
 ['order_update','UPDATE','orders',`${member('OLD.id')} OR ${member('NEW.id')}`,'STOCK_SERVICE_MEMBER_LOCKED'],
 ['order_delete','DELETE','orders',member('OLD.id'),'STOCK_SERVICE_MEMBER_LOCKED'],
 // BEFORE INSERT also covers REPLACE and UPSERT before SQLite discards a row.
 ['order_insert','INSERT','orders',member('NEW.id'),'STOCK_SERVICE_MEMBER_LOCKED'],
 ['item_update','UPDATE','order_items',`${member('OLD.order_id')} OR ${member('NEW.order_id')}`,'STOCK_SERVICE_MEMBER_LOCKED'],
 ['item_delete','DELETE','order_items',member('OLD.order_id'),'STOCK_SERVICE_MEMBER_LOCKED'],
 ['item_insert','INSERT','order_items',`${member('NEW.order_id')} OR EXISTS (SELECT 1 FROM order_items i JOIN stock_service_draft_members m ON m.order_id=i.order_id WHERE i.id=NEW.id)`,'STOCK_SERVICE_MEMBER_LOCKED'],
 ['member_update','UPDATE','stock_service_draft_members','1','STOCK_SERVICE_MEMBER_LOCKED'],
 ['member_delete','DELETE','stock_service_draft_members','1','STOCK_SERVICE_MEMBER_LOCKED'],
 ['member_replace','INSERT','stock_service_draft_members','EXISTS (SELECT 1 FROM stock_service_draft_members WHERE order_id=NEW.order_id)','STOCK_SERVICE_MEMBER_LOCKED'],
 ['service_delete','DELETE','stock_service_drafts','EXISTS (SELECT 1 FROM stock_service_draft_members WHERE service_id=OLD.id)','STOCK_SERVICE_MEMBER_LOCKED'],
 ['service_replace','INSERT','stock_service_drafts','EXISTS (SELECT 1 FROM stock_service_draft_members WHERE service_id=NEW.id)','STOCK_SERVICE_MEMBER_LOCKED'],
 ['product_delete','DELETE','products',activeProduct('OLD.id'),'STOCK_SERVICE_PRODUCT_LOCKED'],
 ['product_update','UPDATE','products',`(${activeProduct('OLD.id')} OR ${activeProduct('NEW.id')}) AND (OLD.id IS NOT NEW.id OR OLD.name IS NOT NEW.name OR json_extract(OLD.payload,'$.id') IS NOT json_extract(NEW.payload,'$.id') OR json_extract(OLD.payload,'$.name') IS NOT json_extract(NEW.payload,'$.name'))`,'STOCK_SERVICE_PRODUCT_LOCKED'],
 // Existing catalog rows may be UPSERTed or REPLACEd if the identity and name
 // remain identical; unrelated catalog fields are not part of the snapshot.
 ['product_insert','INSERT','products',`${activeProduct('NEW.id')} AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id=NEW.id AND p.name IS NEW.name AND json_extract(p.payload,'$.id') IS json_extract(NEW.payload,'$.id') AND json_extract(p.payload,'$.name') IS json_extract(NEW.payload,'$.name'))`,'STOCK_SERVICE_PRODUCT_LOCKED'],
];
const statements=Object.freeze(specs.map(([name,operation,table,condition,code])=>
 `CREATE TRIGGER stock_sql_guard_${name} BEFORE ${operation} ON ${table} WHEN ${condition} BEGIN SELECT RAISE(ABORT, '${code}'); END`));
function install(db){
 // A savepoint works both in and out of a caller-owned transaction. Existing
 // names fail rather than silently trusting potentially different triggers.
 db.exec('SAVEPOINT stock_sql_guard_install');
 try{for(const statement of statements)db.exec(statement);db.exec('RELEASE stock_sql_guard_install');}
 catch(e){db.exec('ROLLBACK TO stock_sql_guard_install');db.exec('RELEASE stock_sql_guard_install');throw e;}
}
function translate(error){
 // Only SQLite's trigger constraint, not an arbitrary similarly named error.
 if(error?.code!=='ERR_SQLITE_ERROR'||error.errcode!==1811)return error;
 const messages={STOCK_SERVICE_MEMBER_LOCKED:'سفارش عضو سرویس تجمیعی است؛ عملیات مستقل روی آن مجاز نیست.',STOCK_SERVICE_PRODUCT_LOCKED:'نام کالای سرویس تجمیعی فعال قابل تغییر یا حذف نیست.'};
 if(!Object.hasOwn(messages,error.message))return error;
 return new (require('./http').ApiError)(409,messages[error.message],error.message);
}
module.exports={install,statements,translate};
