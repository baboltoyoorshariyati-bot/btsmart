'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('POS choices display only bank followed by terminal, including historical snapshots',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../ui-src/ui2/02-invoice-edits.js'),'utf8');
 const c={esc:v=>String(v??'').replace(/</g,'&lt;')};vm.createContext(c);vm.runInContext(text.slice(text.indexOf('function documentEditMethodDetails('),text.indexOf('function ',text.indexOf('function documentEditMethodDetails(')+10)),c);
 const d={id:'pos',bank:'صادرات',terminalNumber:'12345678',title:'عنوان اضافی',isActive:true};
 const html=c.documentEditMethodDetails({type:'POS',deviceId:'pos'},[d]);assert.match(html,/>صادرات 12345678<\/option>/);assert.doesNotMatch(html,/عنوان اضافی|پایانه/);
 const old=c.documentEditMethodDetails({type:'POS',deviceId:'pos',deviceSnapshot:d},[]);assert.match(old,/>صادرات 12345678<\/option>/);assert.doesNotMatch(old,/عنوان اضافی|ثبت تاریخی/);
});
