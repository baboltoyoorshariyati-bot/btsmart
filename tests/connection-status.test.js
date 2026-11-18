'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('connection warnings clear on same endpoint irrespective of query and on navigation; stale requests ignored',()=>{
 const handlers={},elements={};const document={getElementById:id=>elements[id],createElement:()=>({setAttribute(){}}),body:{append(el){elements[el.id]=el}}};
 const window={addEventListener:(name,fn)=>{handlers[name]=fn}};vm.runInNewContext(fs.readFileSync('public/connection-status.js','utf8'),{window,document,navigator:{onLine:true}});
 const c=window.btConnection,first=c.current();c.failure('/api/orders?status=a',first);assert.equal(elements.btConnectionState.hidden,false);
 c.success('/api/orders?status=b',first);assert.equal(elements.btConnectionState.hidden,true);
 c.failure('/api/a',first);c.reset();assert.equal(elements.btConnectionState.hidden,true);c.failure('/api/old',first);assert.equal(elements.btConnectionState.hidden,true);
 c.failure('/api/new',c.current());assert.equal(elements.btConnectionState.hidden,false);handlers.offline();c.reset();assert.equal(elements.btConnectionState.hidden,false);assert.match(elements.btConnectionState.textContent,/اتصال شبکه قطع/);handlers.online();assert.equal(elements.btConnectionState.hidden,true);
});
