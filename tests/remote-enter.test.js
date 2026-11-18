'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','public/app.js'),'utf8');
const source=app.slice(app.indexOf('// یک مسیر مشترک برای دکمه و میانبر'),app.indexOf('// v37.6.0 — ناوبری Enter در فرم سفارش فروشگاه'));
function harness(rows){
 let handler,focused='',renders=0;const messages=[];const form={querySelector:s=>{const m=s.match(/phone-(\d+)/);return m?{focus(){focused=Number(m[1]);},scrollIntoView(){}}:null;}};
 class Element{constructor(tag,dataset={},inside=true,type=''){this.tagName=tag;this.dataset=dataset;this.type=type;this.inside=inside;}closest(){return this.inside?form:null;}}
 const context={Element,document:{addEventListener:(type,fn,capture)=>{assert.equal(type,'keydown');assert.equal(capture,true);handler=fn;}},app:{phoneDraft:rows},toast:m=>messages.push(m),defaultOrderLine:()=>({productId:'',requestedQty:''}),renderOrderLineArea:()=>renders++};
 vm.createContext(context);vm.runInContext(source,context);
 const press=(target,extra={})=>{const event={key:'Insert',isComposing:false,repeat:false,target,prevented:false,preventDefault(){this.prevented=true;},...extra};handler(event);return event;};
 return {press,Element,rows,messages,get focused(){return focused;},get renders(){return renders;}};
}
test('Insert adds a new row regardless of focus within the form or completeness of previous rows',()=>{
 const h=harness([{productId:'p01',requestedQty:'2'}]);
 for(const el of [new h.Element('INPUT',{opQty:'phone-0'}),new h.Element('INPUT',{opProductSearch:'phone-1'}),new h.Element('INPUT',{opDesc:'phone-0'}),new h.Element('SELECT',{opUnit:'phone-0'}),new h.Element('BUTTON',{},true,'button'),new h.Element('INPUT',{})]){const old=h.rows.length;assert(h.press(el).prevented);assert.equal(h.rows.length,old+1);assert.equal(h.focused,old);}
 assert.equal(h.rows[0].productId,'p01');assert.equal(h.rows[0].requestedQty,'2');assert.equal(h.renders,6);
});
test('physical Insert, numpad Insert, and legacy keyCode work without hijacking numpad zero',()=>{
 for(const key of [{key:'Insert',code:'Numpad0'},{key:'Unidentified',code:'Insert'},{key:'Unidentified',keyCode:45}]){const h=harness([{productId:'',requestedQty:''}]);assert(h.press(new h.Element('INPUT'),key).prevented);assert.equal(h.rows.length,2);}
 const h=harness([{productId:'',requestedQty:''}]);assert(!h.press(new h.Element('INPUT'),{key:'0',code:'Numpad0',keyCode:96}).prevented);assert.equal(h.rows.length,1);
});
test('repeated keys and 100-line limit do not add extra rows',()=>{
 const h=harness([{productId:'p01',requestedQty:'2'}]);assert(h.press(new h.Element('INPUT'),{repeat:true}).prevented);assert.equal(h.rows.length,1);
 const full=harness(Array.from({length:100},()=>({productId:'p01',requestedQty:'1'})));assert(full.press(new full.Element('INPUT')).prevented);assert.equal(full.rows.length,100);assert.match(full.messages[0],/۱۰۰/);
});
test('the phone capture guard prevents implicit submission; notes and Insert modifiers remain untouched',()=>{
 const h=harness([{productId:'p01',requestedQty:'1'}]);
 for(const el of [new h.Element('INPUT',{opQty:'phone-0'}),new h.Element('SELECT',{}),new h.Element('BUTTON',{},true,'submit')])assert(h.press(el,{key:'Enter'}).prevented);
 assert(!h.press(new h.Element('TEXTAREA'),{key:'Enter'}).prevented);assert(!h.press(new h.Element('TEXTAREA')).prevented);assert(!h.press(new h.Element('BUTTON',{},true,'button'),{key:'Enter'}).prevented);assert(!h.press(new h.Element('INPUT',{},false)).prevented);assert(!h.press(new h.Element('INPUT'),{isComposing:true}).prevented);
 for(const mod of ['ctrlKey','shiftKey','altKey','metaKey'])assert(!h.press(new h.Element('INPUT'),{[mod]:true}).prevented);assert.equal(h.rows.length,1);
});
