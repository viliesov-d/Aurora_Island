// Refraction/rounded-distance model adapted from dashersw/liquid-glass-js.
// Copyright (c) 2025 Armagan Amcalar, MIT; see THIRD_PARTY_NOTICES.md.
import { glassShape } from './glassGeometry';

const vertex=`attribute vec2 position; varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`precision highp float;
varying vec2 uv;
uniform sampler2D backdrop;
uniform vec2 resolution, viewport;
uniform vec4 shape;
uniform float radius, strength, blur, opacity, captureHeight, hasTexture;
uniform vec2 light;
float sdf(vec2 p){vec2 q=abs(p-shape.xy-shape.zw*.5)-(shape.zw*.5-radius);
return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;}
vec3 sampleGlass(vec2 pixel){
  vec2 coord=clamp((pixel+vec2(14.,8.))/vec2(viewport.x,captureHeight),vec2(.002),vec2(.998));
  vec2 stepSize=vec2(blur*.18)/vec2(viewport.x,captureHeight);
  vec3 c=texture2D(backdrop,coord).rgb*.28;
  c+=texture2D(backdrop,clamp(coord+vec2(stepSize.x,0.),0.,1.)).rgb*.12;
  c+=texture2D(backdrop,clamp(coord-vec2(stepSize.x,0.),0.,1.)).rgb*.12;
  c+=texture2D(backdrop,clamp(coord+vec2(0.,stepSize.y),0.,1.)).rgb*.12;
  c+=texture2D(backdrop,clamp(coord-vec2(0.,stepSize.y),0.,1.)).rgb*.12;
  c+=texture2D(backdrop,clamp(coord+stepSize,0.,1.)).rgb*.055;
  c+=texture2D(backdrop,clamp(coord-stepSize,0.,1.)).rgb*.055;
  c+=texture2D(backdrop,clamp(coord+vec2(stepSize.x,-stepSize.y),0.,1.)).rgb*.055;
  c+=texture2D(backdrop,clamp(coord+vec2(-stepSize.x,stepSize.y),0.,1.)).rgb*.055;
  return c;
}
void main(){
 vec2 p=vec2(uv.x,1.-uv.y)*resolution;
 float d=sdf(p);float inside=max(0.,-d);
 vec2 n=normalize(vec2(sdf(p+vec2(.5,0.))-sdf(p-vec2(.5,0.)),
   sdf(p+vec2(0.,.5))-sdf(p-vec2(0.,.5)))+vec2(.00001));
 float edge=exp(-inside*.075);float rim=exp(-inside*.8);
 vec2 bend=n*(edge*13.+rim*3.)*strength;
 vec3 color=sampleGlass(p-bend);
 // A small spectral split is confined to the rounded lens edge.
 color.r=mix(color.r,sampleGlass(p-bend*1.075).r,edge*.6);
 color.b=mix(color.b,sampleGlass(p-bend*.925).b,edge*.6);
 float lum=dot(color,vec3(.2126,.7152,.0722));
 color=mix(vec3(lum),color,1.12);
 color=mix(color,vec3(.96,.98,1.),.065+.035*strength);
 float spec=pow(max(0.,dot(n,normalize(light-p+vec2(.001)))),5.);
 color+=vec3(1.)*(rim*(.24+.42*spec)+edge*.025)*strength;
 float mask=1.-smoothstep(-.8,.5,d);
 // The non-capture fallback is genuinely transparent, without a fake wallpaper.
 float alpha=mix(.12,clamp(opacity,.35,1.),hasTexture)*mask;
 color=mix(vec3(.85,.91,.99),color,hasTexture);
 gl_FragColor=vec4(color*alpha,alpha);
}`;

export function createGlassRenderer(canvas:HTMLCanvasElement) {
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:false});
  if(!gl)throw new Error('WebGL unavailable');
  const shaders:WebGLShader[]=[];
  const compile=(type:number,source:string)=>{
    const shader=gl.createShader(type)!;shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Glass shader error');
    return shader;
  };
  const program=gl.createProgram()!;
  try{
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Glass link error');
  }catch(e){shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);throw e;}
  gl.useProgram(program);
  const buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([220,232,246,255]));
  const locations=new Map<string,WebGLUniformLocation|null>();
  const at=(name:string)=>{if(!locations.has(name))locations.set(name,gl.getUniformLocation(program,name));return locations.get(name)!;};
  gl.uniform1i(at('backdrop'),0);
  let hasTexture=false;
  return {
    clear(){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([220,232,246,255]));hasTexture=false;},
    upload(image:ImageBitmap){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);hasTexture=true;},
    draw(progress:number,pillWidth:number,radius:number,strength:number,blur:number,opacity:number,captureHeight:number,light:{x:number;y:number}){
      const width=canvas.clientWidth,height=canvas.clientHeight;
      const dpr=Math.min(window.devicePixelRatio||1,1.5);
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      gl.viewport(0,0,canvas.width,canvas.height);
      const rect=glassShape(width,height,pillWidth,radius,progress);
      gl.uniform2f(at('resolution'),width,height);gl.uniform2f(at('viewport'),window.innerWidth,window.innerHeight);
      gl.uniform4f(at('shape'),rect.x,rect.y,rect.width,rect.height);gl.uniform1f(at('radius'),rect.radius);
      gl.uniform1f(at('strength'),strength/100);gl.uniform1f(at('blur'),blur);gl.uniform1f(at('opacity'),opacity/100);
      gl.uniform1f(at('captureHeight'),captureHeight);gl.uniform1f(at('hasTexture'),hasTexture?1:0);gl.uniform2f(at('light'),light.x,light.y);
      gl.drawArrays(gl.TRIANGLES,0,6);
    },
    destroy(){gl.deleteTexture(texture);gl.deleteBuffer(buffer);shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);}
  };
}
