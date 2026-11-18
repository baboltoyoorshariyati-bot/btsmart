'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');
const code=source.slice(source.indexOf('function renderNav(){'),source.indexOf('\n\n\n/* ================================================================',source.indexOf('function renderNav(){')));
function harness(role='dispatch'){
 const rail={innerHTML:''},c={app:{user:{roleCode:role},adminActiveRole:role==='admin'?'dispatch':null,sub:{drivers:'dashboard'}},adm:{tab:'dispatch'},normalizeRole:x=>x,ROLE:{dispatch:'ترابری'},$:()=>rail,esc:x=>x,icon:()=>'',navUnread:()=>0,navBadge:()=>''};
 vm.createContext(c);vm.runInContext(code,c);
 const active=()=>{c.renderNav();return [...rail.innerHTML.matchAll(/class="cartable-nav-item active" data-cartable="([^"]+)"/g)].map(m=>m[1]);};
 return {c,active};
}
for(const role of ['dispatch','admin'])test(`فقط بخش انتخاب‌شده ترابری برای ${role} فعال است`,()=>{
 const {c,active}=harness(role);
 for(const section of ['dashboard','transport-resources','orders','dashboard','reports','orders']){
  c.app.sub.drivers=section;c.adm.tab='dispatch';assert.deepEqual(active(),[section],section);
 }
 c.app.sub.drivers='reports';c.adm.tab='records';assert.deepEqual(active(),['reports']);
});
