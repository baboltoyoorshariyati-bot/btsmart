'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('public/ui2.js');
const sheet=ui.slice(ui.indexOf('function wh38Sheet(o)'),ui.indexOf('function wh38Total()'));
const css=read('public/form-layout.css');
const compat=read('public/compatibility.css');
const documentCss=read('public/warehouse-document.css');
test('every warehouse document header has at least a 50px height',()=>{
 assert.match(documentCss,/\.whd-head\{[^}]*min-height:50px/);
});
test('warehouse preparation has four peer cells and a separate simple out-of-stock tick',()=>{
 assert.equal((sheet.match(/class="wh38-cell-box/g)||[]).length,4);
 assert.match(sheet,/class="wh38-stock-cell"[\s\S]*?<label class="wh38-oos"[^>]*><input type="checkbox"/);
 assert.doesNotMatch(sheet,/این قلم موجود نیست/);
 assert.match(sheet,/aria-label="عدم موجودی/);
 assert.match(sheet,/aria-label="وزن خالص \$\{esc\(it\.product/);
 assert.doesNotMatch(sheet,/<label class="wh38-cell-label"/);
 assert.match(sheet,/title="\$\{esc\(it\.description/);
});
test('warehouse rows keep the desktop grid but wrap for phones and tablets without horizontal scroll',()=>{
 assert.match(css,/grid-template-columns:28px repeat\(4,minmax\(0,1fr\)\) 76px!important/);
 assert.match(css,/\.wh38-cell-box \{[\s\S]*?height:44px!important;min-height:44px!important/);
 const responsive=compat.slice(compat.lastIndexOf('/* v37.49.0 — warehouse preparation'));
 assert.match(responsive,/@media\(max-width:1150px\)\{[\s\S]*?\.wh38-prep-items\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important[\s\S]*?overflow-x:visible!important/);
 assert.match(responsive,/\.wh38-prep-item:not\(\.sr318-row\)\{grid-template-columns:28px repeat\(2,minmax\(0,1fr\)\)!important;grid-template-areas:'num product product' '\. quantity description' '\. weight stock'/);
 assert.match(responsive,/\.sr318-rows\{display:grid!important[\s\S]*?overflow-x:visible!important/);
 assert.match(responsive,/\.wh38-prep-item\.sr318-row\{display:flex!important;flex-wrap:wrap!important[\s\S]*?width:100%!important;min-width:0!important/);
 assert.match(responsive,/\.wh38-store-sheet-head\{overflow:visible!important\}/);
 assert.match(responsive,/\.wh-weight-scroll\{[\s\S]*?overflow-x:visible!important/);
 assert.match(css,/\.wh38-oos \{[\s\S]*?border:0!important[\s\S]*?background:transparent!important/);
 assert.match(css,/\.wh38-oos input\[type="checkbox"\] \{[\s\S]*?width:18px!important;height:18px!important/);
});
test('weight entry and out-of-stock event mapping and finalization rules remain intact',()=>{
 assert.match(sheet,/w\.disabled=ch\.checked; if\(ch\.checked\)\{w\.value=''[\s\S]*?whWeighingDrafts\.delete\(w\)/);
 assert.match(sheet,/wh38Total\(\)/);
 const finalize=ui.slice(ui.indexOf('async function wh38Finalize(id)'),ui.indexOf('window.renderWarehouse='));
 assert.match(finalize,/deliveredKg:out\?0:whWeightNet\(w\), outOfStock:out/ );
 assert.match(finalize,/!x\.outOfStock&&\(!Number\.isFinite\(x\.deliveredKg\)\|\|x\.deliveredKg<=0\)/);
 assert.match(finalize,/api\('\/api\/orders\/\s*'\+id\+'\/warehouse'/);
});
