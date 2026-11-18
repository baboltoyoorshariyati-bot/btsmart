'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('public/form-layout.css');
test('form layout and final compatibility stylesheet are ordered and served through the static allowlist',()=>{
 const html=read('public/index.html');
 assert(html.indexOf('/form-layout.css?v=37.3.18')>html.indexOf('/theme.css'));
 assert(html.indexOf('/compatibility.css?v=37.50.0')>html.indexOf('/form-layout.css'));
 assert.match(read('lib/http.js'),/'\/compatibility\.css'/);
 assert.match(read('lib/http.js'), /'\/form-layout\.css': \{ file: 'form-layout\.css', type: 'text\/css; charset=utf-8'/);
});
test('single-frame rules cover input, select and textarea outside form elements and all states',()=>{
 const rules=css.slice(0,css.indexOf('/* Onsite customer'));
 for(const tag of ['input','select','textarea'])assert(rules.includes('.input-shell > '+tag));
 assert.match(rules,/border:0!important/);assert.match(rules,/box-shadow:none!important/);
 assert(!rules.includes(':placeholder-shown'));assert(!rules.includes('#content form'));
 assert.match(rules,/:has\(> textarea\)/);
});
test('onsite items have four equal columns and responsive two/one column layouts',()=>{
 assert.match(css,/grid-template-columns:28px repeat\(4,minmax\(0,1fr\)\) 32px!important/);
 assert.match(css,/height:44px!important;min-height:44px!important/);
 assert.match(css,/grid-template-areas:"no prod qty del" "\. unit desc \."/);
 assert.match(css,/grid-template-areas:"no prod del" "\. qty \." "\. unit \." "\. desc \."/);
 assert.match(css,/\.sd-oe-customer[\s\S]*?padding:8px 14px!important/);
});
test('driver phone shares RTL alignment and form labels remain above controls',()=>{
 assert.match(css,/\.drv-row > \.adm-cell:not\(\.adm-actions\)[\s\S]*?justify-items:start!important/);
 assert.match(css,/\.drv-phone[\s\S]*?justify-self:start!important/);
 assert.match(css,/#admDriverForm \.cust-field \{[\s\S]*?display:grid!important/);
 assert.match(css,/#admDriverForm \.cust-field > span[\s\S]*?display:block!important/);
 assert.match(css,/#admDriverForm \.cust-form-grid \{grid-template-columns:minmax\(0,1fr\)!important/);
});
