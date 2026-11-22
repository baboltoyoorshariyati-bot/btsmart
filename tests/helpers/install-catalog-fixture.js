'use strict';
// Test runner preload. Legacy integration tests expect p01...p90. Seed only a
// brand-new temporary database; never change a migrated or existing database.
// This helper is never loaded by the application or installer.
const path=require('node:path'), fs=require('node:fs'), Module=require('node:module');
const fixture=__filename, quoted=`--require="${fixture}"`;
if(!(process.env.NODE_OPTIONS||'').includes(fixture)) process.env.NODE_OPTIONS=`${process.env.NODE_OPTIONS||''} ${quoted}`.trim();
const target=path.resolve(__dirname,'../../lib/store.js'), originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  const result=originalLoad.apply(this,arguments);
  let resolved;try{resolved=Module._resolveFilename(request,parent,isMain);}catch{return result;}
  if(resolved===target && !result.__testCatalogWrapped){
    Object.defineProperty(result,'__testCatalogWrapped',{value:true});
    const init=result.init;
    result.init=function(...args){
      const config=require('../../lib/config');
      const tempRoot=path.resolve(require('node:os').tmpdir())+path.sep;
      const dbPath=path.resolve(result.dbFile()), dataPath=path.resolve(config.DATA_DIR)+path.sep;
      const tempOnly=dbPath.startsWith(tempRoot) && dataPath.startsWith(tempRoot);
      const fresh=!fs.existsSync(dbPath) && !fs.existsSync(path.join(config.DATA_DIR,'db.json'));
      const db=init.apply(this,args);
      if(tempOnly && fresh && process.env.BT_TEST_EMPTY_CATALOG!=='1') {
        db.products.push(...require('./catalog-fixture').PRODUCTS_SEED.map(p=>({...p})));
        result.save();
      }
      return db;
    };
  }
  return result;
};
