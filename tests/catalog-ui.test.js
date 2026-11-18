'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
test('user form renders registered resources as escaped, selected options and excludes inactive ones',()=>{
 const code=fs.readFileSync('public/admin-ui.js','utf8');
 const context=vm.createContext({esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),fa:s=>String(s),icon:()=>''});
 vm.runInContext(code,context);
 const html=vm.runInContext(`userFormHtml({roleCode:'driver',driverId:'d'},[{id:'d',vehicleId:'v',paymentDeviceId:'p',phone:'0912'}],[{id:'v',vehicleType:'<van>',plate:'12',isActive:true},{id:'off',vehicleType:'off',isActive:false}],[{id:'p',title:'pos',terminalNumber:'1',bank:'bank',isActive:true}],[{id:'b',name:'shop',branchNo:3,isActive:true}])`,context);
 assert.match(html,/<select name="vehicleId">/);assert.match(html,/<select name="paymentDeviceId">/);assert.match(html,/<select name="branchId">/);assert.match(html,/value="v" selected/);assert.match(html,/value="p" selected/);assert.match(html,/&lt;van>/);assert.doesNotMatch(html,/value="off"/);
});
