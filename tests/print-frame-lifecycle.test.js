'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 let serial=0;const timers=new Map(),frames=[],notices=[];
 const win={addEventListener(type,cb){this.handlers[type]=cb;},handlers:{},focus(){},print(){}};
 const document={body:{appendChild(frame){frames.push(frame);}},createElement(){return {contentWindow:win,dataset:{},style:{},setAttribute(){},remove(){this.removed=true;}};}};
 const context={window:{toast:x=>notices.push(x)},document,sessionStorage:{removeItem(){}},console,
  setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/print-frame.js','utf8'),context);
 return {api:context.window.BTPrintFrame,win,frames,notices,timers,run(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}}};
}
test('print completion callback waits for afterprint and runs once; busy frame remains protected',()=>{
 const h=setup(),out=[];assert.equal(h.api.html('doc',{onFinish:r=>out.push(r)}),true);assert.equal(h.api.html('second'),false);h.api.ready(h.win);
 assert.deepEqual(out,[]);h.win.handlers.afterprint();assert.deepEqual(out,[]);h.run(1000);assert.deepEqual(out,['finished']);assert(h.frames[0].removed);h.run(120000);assert.deepEqual(out,['finished']);assert.equal(h.api.html('next'),true);
});
test('frame failure and timeout report failure or uncertainty without claiming printed',()=>{
 const h=setup(),out=[];assert.equal(h.api.html('doc',{onFinish:r=>out.push(r)}),true);h.api.fail(h.win,'خطا');assert.deepEqual(out,['failed']);
 assert.equal(h.api.html('doc2',{onFinish:r=>out.push(r)}),true);h.run(30000);assert.deepEqual(out,['failed','failed']);
 assert.equal(h.api.html('doc3',{onFinish:r=>out.push(r)}),true);h.api.ready(h.win);h.run(120000);assert.deepEqual(out,['failed','failed','timeout']);
});
