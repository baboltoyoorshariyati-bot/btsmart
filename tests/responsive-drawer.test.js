'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/index.html'),polish=read('public/ui-polish.js'),compat=read('public/compatibility.css');
const block=compat.slice(compat.indexOf('@media (max-width:1024px)',compat.indexOf('منوی کشویی برای موبایل')));
test('app shell has accessible drawer controls',()=>{
 assert.match(html,/id="railToggleBtn"[^>]*aria-expanded="false"[^>]*aria-controls="railNav"/);assert.match(html,/id="railCloseBtn"/);assert.match(html,/id="railBackdrop" class="rail-backdrop" hidden/);
});
test('small desktop, tablet and mobile have a drawer and full-width workspace',()=>{
 assert.ok(block.length>200);assert.match(block,/#appView \.rail\{[^}]*transform:translateX\(106%\)/);assert.match(block,/#appView\.rail-open \.rail\{transform:translateX\(0\)/);assert.match(block,/#appView \.workspace\{margin-right:0!important/);assert.match(block,/#appView \.rail #railNav > button\{flex-direction:row!important/);assert.match(block,/#appView \.rail-toggle-btn\{display:grid!important/);
});
test('drawer closes by controls, navigation, Escape and breakpoint change',()=>{
 assert.match(polish,/matchMedia\('\(max-width: 1024px\)'\)/);assert.match(polish,/rail\.inert = compact\.matches && !open/);assert.match(polish,/compact\.addEventListener\('change', \(\) => setOpen\(false\)\)/);assert.match(polish,/toggle\.setAttribute\('aria-expanded', String\(open\)\)/);assert.match(polish,/backdrop\.addEventListener\('click', \(\) => setOpen\(false\)\)/);assert.match(polish,/closeBtn\.addEventListener\('click', \(\) => setOpen\(false\)\)/);assert.match(polish,/e\.key === 'Escape'/);assert.match(polish,/nav\.addEventListener\('click'/);assert.match(polish,/document\.documentElement\.style\.overflow = previousOverflow/);
});
