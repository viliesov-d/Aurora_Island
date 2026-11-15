// Matches the shell's cubic-bezier(.21,.78,.20,1).
export function morphEase(value:number) {
  const x=Math.max(0,Math.min(1,value));
  let lo=0,hi=1,t=x;
  for(let i=0;i<24;i++){
    const u=1-t;
    const sample=3*u*u*t*.21+3*u*t*t*.20+t*t*t;
    if(sample<x)lo=t;else hi=t;
    t=(lo+hi)/2;
  }
  return x===0||x===1?x:3*(1-t)*(1-t)*t*.78+3*(1-t)*t*t+t*t*t;
}
export function glassShape(width:number,height:number,pillWidth:number,radius:number,progress:number) {
  const t=Math.max(0,Math.min(1,progress));
  const w=Math.min(pillWidth,width);
  return {x:(width-w)/2*(1-t),y:0,width:w+(width-w)*t,height:44+(height-44)*t,
    radius:Math.min(radius,22)*(1-t)+Math.min(32,width/2,height/2)*t};
}
