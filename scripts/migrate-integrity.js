'use strict';
// Explicit offline migration; never run automatically during app startup.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {inspect}=require('./check-data-integrity');
function migrate(file,{apply=false,lockFile=path.join(path.dirname(file),'.lock')}={}) {
  file=path.resolve(file);
  if(!fs.existsSync(file))throw Error('Database file not found');
  if(!apply)return {...inspect(file),applied:false};
  // An exclusive lock is shared with the application's existing single-instance guard.
  // A stale lock must be reviewed by the operator rather than silently removed here.
  const lock=fs.openSync(lockFile,'wx',0o600);
  let db,backup;
  try {
    fs.writeFileSync(lock,String(process.pid));
    const report=inspect(file);if(!report.ok)throw Error('Preflight failed: review check-data-integrity output first');
    db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    backup=file+'.before-integrity-'+crypto.randomBytes(8).toString('hex')+'.db';
    // Private destination exists before SQLite writes sensitive data.
    fs.closeSync(fs.openSync(backup,'wx',0o600));
    db.prepare('VACUUM INTO ?').run(backup);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_ci ON users(lower(username))');
      const definitions={order_items:[['order_id','orders'],['product_id','products']],payments:[['order_id','orders']]};
      for(const [table,refs]of Object.entries(definitions)) {
        const existing=db.prepare(`PRAGMA foreign_key_list(${table})`).all();
        if(refs.every(([column,parent])=>existing.some(f=>f.from===column&&f.table===parent)))continue;
        if(existing.length)throw Error('Unexpected partial foreign-key schema: '+table);
        const original=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table).sql;
        const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table);
        const temp='integrity_'+table;
        const constraints=refs.map(([column,parent])=>`FOREIGN KEY (${column}) REFERENCES ${parent}(id) DEFERRABLE INITIALLY DEFERRED`);
        const create=original.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?\w+["`\]]?/i,'CREATE TABLE '+temp).replace(/\)\s*$/,', '+constraints.join(', ')+')');
        db.exec(create);
        db.exec(`INSERT INTO ${temp} SELECT * FROM ${table} ORDER BY rowid; DROP TABLE ${table}; ALTER TABLE ${temp} RENAME TO ${table};`);
        for(const index of indexes)db.exec(index.sql);
      }
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key validation failed');
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return {ok:true,applied:true,backup};
  }finally{if(db)db.close();fs.closeSync(lock);fs.unlinkSync(lockFile);}
}
if(require.main===module){
 try {
  require('../lib/load-env').loadEnv();const config=require('../lib/config');
  const args=process.argv.slice(2),apply=args.includes('--apply');
  if(apply&&!args.includes('--confirm-offline'))throw Error('Stop the service, then explicitly pass --confirm-offline');
  const file=args.find(a=>!a.startsWith('--'))||config.SQLITE_FILE||path.join(config.DATA_DIR,'baboltoyoor.db');
  const result=migrate(file,{apply,lockFile:path.join(config.DATA_DIR,'.lock')});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
 }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={migrate};
