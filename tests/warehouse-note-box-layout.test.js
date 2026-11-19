'use strict';
// v37.6.1 — رگرسیون چیدمان: کادر «توضیح انبار برای فروش» باید هم‌اندازهٔ کادر «توضیحات ردیف»
// باشد. ریشهٔ ایراد، باختِ قاعدهٔ ستون‌بندیِ کادر در برابر قاعدهٔ عمومیِ `>*{grid-area:auto}`
// در compatibility.css بود که کادر را به ستون ۲۸ پیکسلی می‌انداخت.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../public/compatibility.css'),'utf8');
function specificity(selector){
 const ids=(selector.match(/#[\w-]+/g)||[]).length;
 const classes=(selector.match(/\.[\w-]+/g)||[]).length+(selector.match(/\[[^\]]+\]/g)||[]).length+(selector.match(/:(?!:)[\w-]+(\([^)]*\))?/g)||[]).filter(x=>!x.includes('::')).length;
 const elements=(selector.replace(/#[\w-]+/g,' ').replace(/\.[\w-]+/g,' ').replace(/\[[^\]]+\]/g,' ').replace(/::?[\w-]+(\([^)]*\))?/g,' ').match(/[a-zA-Z][\w-]*/g)||[]).length;
 return ids*1e6+classes*1e3+elements;
}
// همهٔ قاعده‌هایی که دقیقاً همین انتخابگر را دارند (شامل نسخهٔ داخل media query)
function declarations(selector,needle){
 const out=[];
 for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const selectors=m[1].split(',').map(x=>x.trim());
  if(!selectors.includes(selector))continue;
  if(needle&&!m[2].includes(needle))continue;
  out.push({selector,body:m[2],index:m.index,specificity:specificity(selector)});
 }
 return out;
}
test('قاعدهٔ کادر توضیح از قاعدهٔ عمومیِ grid-area مشخصهٔ بالاتری دارد',()=>{
 const note=declarations('#appView #content .wh38-prep-item.wh38-prep-item:not(.sr318-row)>.wh38-note-cell','grid-row:auto');
 const generic=declarations('#appView #content .wh38-prep-item:not(.sr318-row)>*');
 assert(note.length,'rule for the note cell must exist');
 assert(generic.length,'generic grid-area rule must exist');
 const noteRule=note[note.length-1],genericRule=generic[generic.length-1];
 assert(noteRule.specificity>genericRule.specificity,`note rule specificity ${noteRule.specificity} must beat ${genericRule.specificity}`);
 assert(noteRule.index>genericRule.index,'note rule must come after the generic rule so it wins the cascade');
 assert.equal(noteRule.body.includes('grid-column:1/-1'),false,'desktop rule must not span the whole row');
 assert.match(noteRule.body,/grid-column:auto/);
});
test('ردیف آماده‌سازی هفت ستون دارد و کادر توضیح در ستون هم‌عرض ستون توضیحات ردیف می‌نشیند',()=>{
 const rows=declarations('#appView #content .wh38-prep-item.wh38-prep-item:not(.sr318-row)');
 const rule=rows[rows.length-1].body;
 const columns=/grid-template-columns:([^;]+);/.exec(rule)[1];
 const tracks=columns.match(/minmax\([^)]*\)|\d+px|1fr/g)||[];
 assert.equal(tracks.length,7,`expected 7 tracks, got ${tracks.join(' ')}`);
 assert.equal(tracks[tracks.length-1],'minmax(130px,1fr)'); // ستون کادر توضیح
 assert.equal(tracks[5],'76px'); // ستون «عدم موجودی» سر جای خودش
});
test('کادر توضیح دقیقاً همان اندازهٔ ۴۴ پیکسلی کادرهای ردیف را دارد',()=>{
 const box=declarations('#appView #content .wh38-prep-item.wh38-prep-item:not(.sr318-row)>.wh38-note-cell>.wh38-note-box','height:44px');
 const rule=box[box.length-1].body;
 assert.match(rule,/height:44px!important/);
 assert.match(rule,/min-height:44px!important/);
 assert.match(rule,/padding:0 10px!important/);
 assert.match(rule,/border-radius:10px!important/);
 const textarea=declarations('#appView #content .wh38-prep-item.wh38-prep-item:not(.sr318-row)>.wh38-note-cell>.wh38-note-box>textarea','height:42px');
 const textareaRule=textarea[textarea.length-1].body;
 assert.match(textareaRule,/height:42px!important/);
 assert.match(textareaRule,/resize:none!important/);
});
test('در موبایل کادر توضیح یک ردیف کامل می‌شود، نه یک مربع کوچک',()=>{
 const mobile=css.slice(css.lastIndexOf('@media(max-width:1150px)'));
 assert.match(mobile,/wh38-note-cell\{[\s\S]*grid-column:1\/-1!important/);
});
