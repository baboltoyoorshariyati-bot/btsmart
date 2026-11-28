'use strict';
const {fail}=require('./http');
const {text}=require('./validate');
// Seal numbers are identifiers, not numbers: preserve leading zeroes and script.
function parse(value){
 if(!Array.isArray(value)||value.length>20)fail(400,'فهرست پلمپ‌ها معتبر نیست (حداکثر ۲۰ شماره).');
 const seen=new Set();
 return value.map(x=>{
  if(typeof x!=='string')fail(400,'شماره پلمپ معتبر نیست.');
  const number=text(x,{field:'شماره پلمپ',max:80,required:true});
  if(seen.has(number))fail(400,'شماره پلمپ تکراری است.');seen.add(number);return number;
 });
}
function fromBody(body,fallback=[]){
 if(body?.hasSeals!==undefined&&typeof body.hasSeals!=='boolean')fail(400,'وضعیت پلمپ معتبر نیست.');
 if(body?.sealNumbers===undefined&&body?.hasSeals===undefined)return parse(fallback);
 const numbers=parse(body?.sealNumbers??[]);
 if(body?.hasSeals===true&&!numbers.length)fail(400,'حداقل یک شماره پلمپ وارد کنید.');
 if(body?.hasSeals===false&&numbers.length)fail(400,'شماره پلمپ با وضعیت انتخاب‌شده ناسازگار است.');
 return numbers;
}
module.exports={parse,fromBody};
