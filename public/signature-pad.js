'use strict';
// One canvas implementation for settlement and driver delivery. Strokes are normalized, not bitmaps.
window.btSignaturePad=function(canvas,onChange=()=>{}){
  const ctx=canvas.getContext('2d'),strokes=[];let active=null,disposed=false;
  canvas.style.touchAction='none';
  const rect=()=>canvas.getBoundingClientRect();
  const point=e=>{const r=rect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};
  function paint(){
    if(disposed)return;
    const r=rect();if(!r.width||!r.height)return;
    const dpr=window.devicePixelRatio||1,w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#1d222a';ctx.fillStyle='#1d222a';
    for(const stroke of strokes){if(!stroke.length)continue;ctx.beginPath();ctx.moveTo(stroke[0].x*r.width,stroke[0].y*r.height);for(const p of stroke.slice(1))ctx.lineTo(p.x*r.width,p.y*r.height);if(stroke.length===1){ctx.arc(stroke[0].x*r.width,stroke[0].y*r.height,1.2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  }
  const down=e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();active=[point(e)];strokes.push(active);canvas.setPointerCapture?.(e.pointerId);paint();onChange(true);};
  const move=e=>{if(!active)return;e.preventDefault();active.push(point(e));paint();};
  const up=()=>{active=null;};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);
  const resize=()=>{if(!canvas.isConnected){dispose();return;}paint();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);window.addEventListener('resize',resize);
  function dispose(){if(disposed)return;disposed=true;observer.disconnect();window.removeEventListener('resize',resize);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);}
  paint();return {clear(){strokes.length=0;active=null;paint();onChange(false)},isInk:()=>strokes.length>0,data(){paint();return canvas.toDataURL('image/png')},dispose,resize:paint};
};
