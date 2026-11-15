import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

type Cursor = { x: number; y: number };
type Side = "left" | "right" | "top" | "bottom";
type Pull = Record<Side, number>;
const edges: Side[] = ["left", "right", "top", "bottom"];
const empty = (): Pull => ({left:0,right:0,top:0,bottom:0});
const clamp = (x:number,a:number,b:number) => Math.min(b,Math.max(a,x));
const ease = (x:number) => x*x*(3-2*x);
const px = (x:number) => (Math.round(x*10)/10).toString();
const pair=(x:number,y:number)=>px(x)+" "+px(y);

/** Capsule drawn as one continuous path with continuously weighted edge pulls. */
export function magneticPath(w:number,h:number,pull:Pull,x:number,y:number) {
  const r=h/2;
  const left=clamp(pull.left,0,1.06)*13;
  const right=clamp(pull.right,0,1.06)*13;
  // The pill begins 8px below the top of WebView2; keep its upper pull
  // within that physical paint margin instead of clipping the vector.
  const top=clamp(pull.top,0,1.06)*7.2;
  const bottom=clamp(pull.bottom,0,1.06)*13;
  const tx=clamp(x,r+47,w-r-47),bx=tx;
  const ry=h/2+clamp(y-h/2,-h*.12,h*.12)*clamp(right/13,0,1);
  const ly=h/2+clamp(y-h/2,-h*.12,h*.12)*clamp(left/13,0,1);
  const path=["M",pair(r,0)];
  if(top>.01) {
    path.push("L",pair(tx-40,0));
    path.push("C",pair(tx-20,0),pair(tx-19,-top),pair(tx,-top));
    path.push("C",pair(tx+19,-top),pair(tx+20,0),pair(tx+40,0));
  }
  path.push("L",pair(w-r,0));
  path.push("C",pair(w-r*.25,0),pair(w+right,ry*.2),pair(w+right,ry));
  path.push("C",pair(w+right,ry+(h-ry)*.8),pair(w-r*.25,h),pair(w-r,h));
  if(bottom>.01){
    path.push("L",pair(bx+40,h));
    path.push("C",pair(bx+20,h),pair(bx+19,h+bottom),pair(bx,h+bottom));
    path.push("C",pair(bx-19,h+bottom),pair(bx-20,h),pair(bx-40,h));
  }
  path.push("L",pair(r,h));
  path.push("C",pair(r*.25,h),pair(-left,ly+(h-ly)*.8),pair(-left,ly));
  path.push("C",pair(-left,ly*.2),pair(r*.25,0),pair(r,0),"Z");
  return path.join(" ");
}
function targetPull(x:number,y:number,w:number,h:number):Pull {
  const dx=Math.max(-x,0,x-w),dy=Math.max(-y,0,y-h);
  const outside=Math.hypot(dx,dy),inside=dx===0&&dy===0;
  let amount=0;
  if(inside){
    const near=Math.min(x,w-x,y,h-y);
    amount=.32*ease(1-clamp(near/19,0,1));
  }else if(outside<100){
    amount=ease(1-outside/100);
  }
  if(amount<.001)return empty();
  // Distance to the *actual finite side*, not an infinite axis. At corners,
  // soft weights smoothly share the pull between adjoining edges.
  const distances:Pull={
    left:Math.hypot(x,dy),
    right:Math.hypot(x-w,dy),
    top:Math.hypot(y,dx),
    bottom:Math.hypot(y-h,dx),
  };
  const nearest=Math.min(...edges.map(k=>distances[k]));
  const weights=empty();
  let total=0;
  for(const k of edges) {weights[k]=Math.exp(-(distances[k]-nearest)/7);total+=weights[k];}
  for(const k of edges) weights[k]=amount*weights[k]/total;
  return weights;
}

/**
 * Pointer target is sampled from Win32 at 65ms, then a frame-time independent
 * four-channel damped spring interpolates independently for each edge.
 * This removes the hard side switch / corner snapping in the old geometry.
 */
export function useMagneticPill(enabled:boolean,expanded:boolean){
  const pillRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=pillRef.current;
    const svg=el?.querySelector<SVGSVGElement>(".magnetic-svg");
    const path=el?.querySelector<SVGPathElement>(".magnetic-shape");
    if(!el||!svg||!path)return;
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    let alive=true,busy=false,frame=0,last=0;
    let cursor:Cursor|null=null;
    let w=0,h=0,ax=0,ay=22;
    const value=empty(),velocity=empty();
    const reset=()=>{
      if(frame)cancelAnimationFrame(frame);
      frame=0;svg.style.opacity="0";
      el.style.setProperty("--magnet-strength","0");
      el.style.setProperty("--lens-x","50%");
      el.style.setProperty("--lens-y","0%");
      last=0;
    };
    const draw=(time:number)=>{
      frame=0;
      if(!alive||document.hidden||reduced.matches)return;
      const rect=el.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      if(w!==rect.width||h!==rect.height){
        w=rect.width;h=rect.height;ax=w/2;ay=h/2;
        svg.setAttribute("viewBox","-20 -20 "+px(w+40)+" "+px(h+40));
      }
      let desired=empty(),tx=ax,ty=ay;
      if(cursor){
        const x=cursor.x-rect.left,y=cursor.y-rect.top;
        desired=targetPull(x,y,w,h);
        if(edges.some(k=>desired[k]>.0005)){
          tx=clamp(x,0,w);ty=clamp(y,0,h);
        }
      }
      const dt=Math.min(.034,last?(time-last)/1000:1/60);
      last=time;
      const steps=Math.max(1,Math.ceil(dt/.007));
      const step=dt/steps;
      for(let i=0;i<steps;i++){
        for(const k of edges){
          velocity[k]+=(248*(desired[k]-value[k])-30*velocity[k])*step;
          value[k]+=velocity[k]*step;
        }
      }
      const follow=1-Math.exp(-14*dt);
      ax+=(tx-ax)*follow;ay+=(ty-ay)*follow;
      let sum=0,settled=true;
      for(const k of edges){
        if(Math.abs(value[k]-desired[k])<.002&&Math.abs(velocity[k])<.024){
          value[k]=desired[k];velocity[k]=0;
        }else settled=false;
        sum+=Math.max(0,value[k]);
      }
      svg.style.opacity=sum<.006?"0":String(Math.min(.86,sum));
      if(sum>=.006){
        path.setAttribute("d",magneticPath(w,h,value,ax,ay));
        el.style.setProperty("--lens-x",px(ax/w*100)+"%");
        el.style.setProperty("--lens-y",px(ay/h*100)+"%");
      }
      el.style.setProperty("--magnet-strength",px(sum));
      if(!settled||Math.abs(tx-ax)>.8||Math.abs(ty-ay)>.8)
        frame=requestAnimationFrame(draw);
      else last=0; // The next wake must not integrate time spent idle.
    };
    const poll=async()=>{
      if(!alive||busy||document.hidden||reduced.matches)return;
      busy=true;
      try{cursor=await invoke<Cursor|null>("cursor_position")}
      catch{cursor=null}
      finally{busy=false;if(alive&&!frame)frame=requestAnimationFrame(draw)}
    };
    const visibility=()=>{if(document.hidden)reset();else void poll();};
    if(!enabled||expanded||reduced.matches){reset();return}
    void poll();
    const timer=window.setInterval(()=>void poll(),65);
    document.addEventListener("visibilitychange",visibility);
    return()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visibility);reset()};
  },[enabled,expanded]);
  return pillRef;
}
