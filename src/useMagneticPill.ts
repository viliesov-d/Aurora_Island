import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

type CursorPosition = { x: number; y: number };
type Side = "left" | "right" | "bottom" | "top";
const clamp = (v:number, lo:number, hi:number) => Math.max(lo,Math.min(hi,v));
const fmt=(n:number)=>n.toFixed(2);

/**
 * A single rounded SVG silhouette draws the entire elastic outline, not a
 * disconnected "blob". The field follows the nearest side like Atoll's FlowGeometry.
 * It has no mouse hooks; native GetCursorPos only samples while the pill is visible.
 */
function flowingPath(width:number,height:number,side:Side,cx:number,cy:number,pull:number) {
  const w=width,h=height,r=Math.min(24,h/2);
  const b=Math.max(0,pull)*17;
  const x=clamp(cx,r+54,w-r-54);
  const y=clamp(cy,r+6,h-r-6);
  const p:string[]=[];
  const at=(a:number,b:number)=>fmt(a)+" "+fmt(b);
  p.push("M",at(r,0));
  if(side==="top"){
    p.push("L",at(x-48,0));
    p.push("C",at(x-19,0),at(x-18,-b),at(x,-b));
    p.push("C",at(x+18,-b),at(x+19,0),at(x+48,0));
  }
  p.push("L",at(w-r,0),"Q",at(w,0),at(w,r));
  if(side==="right"){
    p.push("L",at(w,y-28));
    p.push("C",at(w,y-12),at(w+b,y-12),at(w+b,y));
    p.push("C",at(w+b,y+12),at(w,y+12),at(w,y+28));
  }
  p.push("L",at(w,h-r),"Q",at(w,h),at(w-r,h));
  if(side==="bottom"){
    p.push("L",at(x+52,h));
    p.push("C",at(x+25,h),at(x+20,h+b),at(x,h+b));
    p.push("C",at(x-20,h+b),at(x-25,h),at(x-52,h));
  }
  p.push("L",at(r,h),"Q",at(0,h),at(0,h-r));
  if(side==="left"){
    p.push("L",at(0,y+28));
    p.push("C",at(0,y+12),at(-b,y+12),at(-b,y));
    p.push("C",at(-b,y-12),at(0,y-12),at(0,y-28));
  }
  p.push("L",at(0,r),"Q",at(0,0),at(r,0),"Z");
  return p.join(" ");
}

export function useMagneticPill(enabled:boolean,expanded:boolean) {
  const pillRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=pillRef.current;
    if(!el) return;
    const shape=el.querySelector<SVGPathElement>(".magnetic-shape");
    const layer=el.querySelector<SVGSVGElement>(".magnetic-svg");
    let alive=true;
    let inFlight=false;
    let pointer:CursorPosition|null=null;
    let strength=0,velocity=0,last=0;
    let raf=0;
    let side:Side="bottom",px=0,py=0;
    const reset=()=>{
      if(layer) layer.style.opacity="0";
      el.style.setProperty("--magnet-strength","0");
      el.style.setProperty("--lens-x","50%");
      el.style.setProperty("--lens-y","0%");
    };
    if(!shape||!layer||!enabled||expanded||window.matchMedia("(prefers-reduced-motion: reduce)").matches){
      reset();return;
    }
    const tick=(now:number)=>{
      raf=0;
      if(!alive||document.hidden)return;
      const rect=el.getBoundingClientRect();
      const w=rect.width,h=rect.height;
      let desired=0;
      if(pointer){
        const dx=Math.max(rect.left-pointer.x,0,pointer.x-rect.right);
        const dy=Math.max(rect.top-pointer.y,0,pointer.y-rect.bottom);
        const distance=Math.hypot(dx,dy);
        const range=170;
        if(distance<range){
          const k=clamp(1-distance/range,0,1);
          desired=k*k*(3-2*k);
          const x=pointer.x-rect.left,y=pointer.y-rect.top;
          const edges=[
            {s:"left" as const,d:Math.abs(x)},
            {s:"right" as const,d:Math.abs(x-w)},
            {s:"top" as const,d:Math.abs(y)},
            {s:"bottom" as const,d:Math.abs(y-h)},
          ];
          side=edges.reduce((a,b)=>a.d<b.d?a:b).s;
          px=clamp(x,0,w);py=clamp(y,0,h);
          el.style.setProperty("--lens-x",fmt(clamp(x/w*100,0,100))+"%");
          el.style.setProperty("--lens-y",fmt(clamp(y/h*100,0,100))+"%");
        }
      }
      const dt=last?Math.min(.04,(now-last)/1000):1/60;last=now;
      // Stable semi-implicit spring with substeps for variable refresh rates.
      const step=dt/Math.max(1,Math.ceil(dt/.006));
      const n=Math.max(1,Math.ceil(dt/.006));
      for(let i=0;i<n;i++){
        velocity+=(210*(desired-strength)-27*velocity)*step;
        strength+=velocity*step;
      }
      if(Math.abs(desired-strength)<.003&&Math.abs(velocity)<.04){
        strength=desired;velocity=0;
      }
      const value=clamp(strength,0,1.12);
      el.style.setProperty("--magnet-strength",fmt(value));
      if(value>.002){
        shape.setAttribute("d",flowingPath(w,h,side,px,py,value));
        layer.setAttribute("viewBox","-22 -22 "+fmt(w+44)+" "+fmt(h+44));
        layer.style.opacity=fmt(Math.min(1,value*.88));
      }else{
        layer.style.opacity="0";
      }
      if(value>.002||desired>.002||Math.abs(velocity)>.03)raf=requestAnimationFrame(tick);
    };
    const schedule=()=>{if(!raf&&alive)raf=requestAnimationFrame(tick)};
    const poll=async()=>{
      if(!alive||inFlight||document.hidden)return;
      inFlight=true;
      try{
        pointer=await invoke<CursorPosition|null>("cursor_position");
      }catch{pointer=null}
      finally{inFlight=false;schedule()}
    };
    void poll();
    const id=window.setInterval(()=>void poll(),85);
    return()=>{
      alive=false;window.clearInterval(id);if(raf)cancelAnimationFrame(raf);reset();
    };
  },[enabled,expanded]);
  return pillRef;
}
