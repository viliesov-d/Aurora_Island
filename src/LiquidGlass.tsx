import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createGlassRenderer } from './glassRenderer';
import { morphEase } from './glassGeometry';

// Serialize native affinity changes across React StrictMode and theme switches.
let captureQueue:Promise<unknown>=Promise.resolve();
function configure(enabled:boolean) {
  captureQueue=captureQueue.catch(()=>{}).then(()=>invoke('configure_glass',{enabled}));
  return captureQueue;
}
type Options={active:boolean;live:boolean;expanded:boolean;width:number;radius:number;strength:number;blur:number;opacity:number;duration:number;onError:(message:string)=>void};
export function LiquidGlass(options:Options) {
  const [generation,setGeneration]=useState(0);
  const [reducedTransparency,setReducedTransparency]=useState(()=>window.matchMedia('(prefers-reduced-transparency: reduce)').matches);
  useEffect(()=>{
    const query=window.matchMedia('(prefers-reduced-transparency: reduce)');
    const change=()=>setReducedTransparency(query.matches);query.addEventListener('change',change);
    return()=>query.removeEventListener('change',change);
  },[]);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const latest=useRef(options);latest.current=options;
  const wake=useRef(()=>{});
  const captureWake=useRef(()=>{});
  useEffect(()=>{captureWake.current();},[options.expanded]);
  useEffect(()=>{wake.current();},[options.expanded,options.width,options.radius,options.strength,options.blur,options.opacity,options.duration]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!options.active||reducedTransparency)return;
    let renderer:ReturnType<typeof createGlassRenderer>;
    try{renderer=createGlassRenderer(canvas);}catch{latest.current.onError('WebGL недоступний. Увімкнено прозорий матеріал без заломлення.');return;}
    let alive=true,frame=0,timer=0,hasLive=false,pending=false,captureHeight=window.innerHeight;
    const contrastCanvas=new OffscreenCanvas(8,8);
    const contrast=contrastCanvas.getContext('2d',{willReadFrequently:true});
    let progress=latest.current.expanded?1:0,from=progress,target=progress,started=0;
    let light={x:canvas.clientWidth*.25,y:-80};
    const draw=(now:number)=>{
      frame=0;if(!alive)return;
      const p=latest.current;
      const next=p.expanded?1:0;
      if(target!==next){from=progress;target=next;started=now;}
      const t=p.duration===0?1:Math.min(1,(now-started)/p.duration);
      progress=from+(target-from)*morphEase(t);
      renderer.draw(progress,p.width,p.radius,p.strength,p.blur,p.opacity,captureHeight,light);
      if(t<1)frame=requestAnimationFrame(draw);
    };
    const redraw=()=>{if(alive&&!frame)frame=requestAnimationFrame(draw);};wake.current=redraw;
    const observer=new ResizeObserver(redraw);observer.observe(canvas);
    const pointer=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();light={x:e.clientX-r.left,y:e.clientY-r.top};redraw();};
    window.addEventListener('pointermove',pointer,{passive:true});
    const failed=()=>{
      if(!alive)return;
      hasLive=false;
      renderer.clear();redraw();
      delete canvas.dataset.tone;
      void configure(false).catch(()=>{});
      latest.current.onError('Живий фон недоступний. Скло працює у прозорому режимі; його можна вимкнути в налаштуваннях.');
    };
    const capture=async()=>{
      if(!alive||!hasLive||pending)return;
      pending=true;clearTimeout(timer);
      try{
        if(!document.hidden){
          const expanded=latest.current.expanded;
          const bytes=await invoke<ArrayBuffer>('glass_frame',{expanded});
          if(!alive)return;
          if(bytes.byteLength){
          const image=await createImageBitmap(new Blob([bytes],{type:'image/bmp'}));
          if(alive&&expanded===latest.current.expanded){
            captureHeight=expanded?window.innerHeight:Math.min(window.innerHeight,88);renderer.upload(image);
            if(contrast){
              contrast.drawImage(image,0,0,8,8);
              const pixels=contrast.getImageData(0,0,8,8).data;
              let luminance=0;
              for(let i=0;i<pixels.length;i+=4)luminance+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
              const mean=luminance/(64*255);
              // Hysteresis prevents text-color flicker around the threshold.
              const dark=canvas.dataset.tone==='dark'?mean>.53:mean>.64;
              canvas.dataset.tone=dark?'dark':'light';
            }
            redraw();
          }
          image.close();
          }
        }
      }catch{failed();return;}finally{pending=false;}
      if(alive&&hasLive)timer=window.setTimeout(()=>void capture(),latest.current.expanded?220:450);
    };
    captureWake.current=()=>void capture();
    const lost=(event:Event)=>{event.preventDefault();failed();};
    const restored=()=>setGeneration(value=>value+1);
    canvas.addEventListener('webglcontextlost',lost);
    canvas.addEventListener('webglcontextrestored',restored);
    if(options.live)void configure(true).then(()=>{if(alive){hasLive=true;timer=window.setTimeout(()=>void capture(),100);}}).catch(failed);
    redraw();
    return()=>{
      alive=false;hasLive=false;wake.current=()=>{};captureWake.current=()=>{};
      cancelAnimationFrame(frame);clearTimeout(timer);observer.disconnect();
      window.removeEventListener('pointermove',pointer);canvas.removeEventListener('webglcontextlost',lost);
      canvas.removeEventListener('webglcontextrestored',restored);
      renderer.destroy();
      delete canvas.dataset.tone;
      if(options.live)void configure(false).catch(()=>{});
    };
  },[options.active,options.live,generation,reducedTransparency]);
  return <canvas ref={canvasRef} className="liquid-glass-canvas" aria-hidden="true"/>;
}
