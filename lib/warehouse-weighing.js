'use strict';
const validate=require('./validate');
const {fail}=require('./http');
// All arithmetic is performed in grams; the server owns the fixed tare weights.
function weighingsFor(input){
 if(input===undefined)return null; // compatibility with previously released clients
 if(!Array.isArray(input)||!input.length||input.length>100)fail(400,'فهرست نوبت‌های وزن‌کشی معتبر نیست.');
 let total=0;
 const rows=input.map(x=>{
  if(!x||typeof x!=='object'||Array.isArray(x))fail(400,'نوبت وزن‌کشی معتبر نیست.');
  const kg=(v,field,min=0)=>{const value=validate.number(v,{field,min,max:validate.MAX_QTY});const grams=Math.round(value*1000);if(Math.abs(value*1000-grams)>0.000001)fail(400,`${field} حداکثر سه رقم اعشار دارد.`);return grams;};
  const count=(v,field)=>{const c=validate.number(v??0,{field,min:0,max:100000});if(!Number.isInteger(c))fail(400,`${field} باید تعداد صحیح باشد.`);return c;};
  const gross=kg(x.grossKg,'وزن ناخالص',0.001),rack=kg(x.rackKg??0,'وزن راک'),cart=kg(x.cartKg??0,'وزن گاری');
  const basket18=count(x.basket18,'تعداد سبد ۱٫۸'),basket25=count(x.basket25,'تعداد سبد ۲٫۵'),box300=count(x.box300,'تعداد کارتن ۳۰۰ گرمی'),box600=count(x.box600,'تعداد کارتن ۶۰۰ گرمی');
  const tare=basket18*1800+basket25*2500+box300*300+box600*600+rack+cart;
  if(tare>=gross)fail(400,'مجموع ناخالصی باید کمتر از وزن ناخالص باشد تا وزن خالص مثبت باشد.');
  const net=gross-tare;total+=net;
  return {grossKg:gross/1000,basket18,basket25,box300,box600,rackKg:rack/1000,cartKg:cart/1000,tareKg:tare/1000,netKg:net/1000};
 });
 if(total>validate.MAX_QTY*1000)fail(400,'مجموع وزن خالص بیش از حد مجاز است.');
 return {rows,netKg:total/1000};
}
module.exports={weighingsFor};
