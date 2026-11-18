'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('شیوه‌نامه‌های سامانه متن فارسی را با فاصله منفی حروف یا کلمات فشرده نمی‌کنند',()=>{
 const dir=path.join(__dirname,'..','public');
 for(const file of fs.readdirSync(dir).filter(name=>name.endsWith('.css'))){
  const css=fs.readFileSync(path.join(dir,file),'utf8');
  assert.doesNotMatch(css,/(?:letter-spacing|word-spacing)\s*:\s*-\s*(?:\d|\.)/i,file);
 }
});
