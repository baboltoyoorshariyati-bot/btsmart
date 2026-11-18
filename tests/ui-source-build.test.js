'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {build}=require('../scripts/build-ui');
test('ordered UI sections exactly reproduce checked-in classic scripts',()=>{const result=build({check:true});assert.deepEqual(result.map(x=>x.sections),[10,8]);});
test('UI composition rejects drift, missing sections and traversal',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-ui-build-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(path.join(__dirname,'../ui-src'),path.join(root,'ui-src'),{recursive:true});fs.mkdirSync(path.join(root,'public'));
 build({root});build({root,check:true});fs.appendFileSync(path.join(root,'public/app.js'),'\n');assert.throws(()=>build({root,check:true}),/Stale/);
 const file=path.join(root,'ui-src/manifest.json'),manifest=JSON.parse(fs.readFileSync(file));manifest.bundles[0].parts[0]='../outside.js';fs.writeFileSync(file,JSON.stringify(manifest));assert.throws(()=>build({root}),/Invalid/);
});
