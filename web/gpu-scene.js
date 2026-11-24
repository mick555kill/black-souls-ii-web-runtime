// GPU scene compositor. RGSS Bitmap drawing remains on Canvas 2D; final
// sprites, windows and planes are composited by WebGL using versioned textures.
(function(root){
'use strict';
class GPUScene {
  constructor(){
    this.canvas=document.createElement('canvas');
    const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,
      depth:false,stencil:false,antialias:false,preserveDrawingBuffer:true,failIfMajorPerformanceCaveat:true});
    if(!gl)throw Error('Hardware WebGL unavailable');
    const vs='attribute vec2 p;attribute vec2 t;varying vec2 uv;uniform vec2 size;void main(){uv=t;gl_Position=vec4(p/size*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}';
    const fs='precision mediump float;varying vec2 uv;uniform sampler2D image;uniform vec4 color;uniform float opacity,mode;void main(){if(mode<0.5){gl_FragColor=vec4(color.rgb*color.a,color.a)*opacity;}else{gl_FragColor=texture2D(image,mode>1.5?fract(uv):uv)*opacity;}}';
    const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram(),v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs);
    gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.uniform={};for(const name of ['size','color','opacity','mode','image'])this.uniform[name]=gl.getUniformLocation(program,name);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,96,gl.DYNAMIC_DRAW);
    for(const [name,offset] of [['p',0],['t',8]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,16,offset);}
    gl.uniform1i(this.uniform.image,0);
    // A complete sampler is required even for solid-color draws.
    this.white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    this.maxTexture=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.textures=new Map();this.bytes=0;this.limit=48*1024*1024;this.vertices=new Float32Array(24);this.serial=0;
    this.isGPU=true;
  }
  begin(w,h,sprites,bitmaps){
    const gl=this.gl;if(gl.isContextLost())throw Error('WebGL context lost');
    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
    this.versions=new WeakMap();
    for(const s of sprites){for(const b of [s.lastBitmap,bitmaps.get(s.skin)])if(b?.canvas)this.versions.set(b.canvas,b.version);}
    this.serial++;this.stack=[];this.state={m:[1,0,0,1,0,0],clip:[0,0,w,h],alpha:1,composite:'source-over',fill:'rgba(0,0,0,1)'};
    gl.viewport(0,0,w,h);gl.uniform2f(this.uniform.size,w,h);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);
  }
  get globalAlpha(){return this.state.alpha;}
  set globalAlpha(v){if(Number.isFinite(v)&&v>=0&&v<=1)this.state.alpha=v;}
  get globalCompositeOperation(){return this.state.composite;}
  set globalCompositeOperation(v){this.state.composite=v;}
  get fillStyle(){return this.state.fill;}
  set fillStyle(v){this.state.fill=v;}
  save(){const s=this.state;this.stack.push({...s,m:s.m.slice(),clip:s.clip.slice()});}
  restore(){if(this.stack.length)this.state=this.stack.pop();}
  transform(a,b,c,d,e,f){const m=this.state.m;this.state.m=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];}
  translate(x,y){this.transform(1,0,0,1,x,y);}
  scale(x,y){this.transform(x,0,0,y,0,0);}
  rotate(r){const c=Math.cos(r),s=Math.sin(r);this.transform(c,s,-s,c,0,0);}
  point(x,y){const m=this.state.m;return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
  beginPath(){this.path=null;}
  rect(x,y,w,h){const a=this.point(x,y),b=this.point(x+w,y+h);this.path=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}
  clip(){if(!this.path)return;const a=this.state.clip,b=this.path;this.state.clip=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];}
  createPattern(image,repeat){if(repeat!=='repeat')throw Error('Unsupported pattern');return {image};}
  trim(){
    while(this.textures.size>128||this.bytes>this.limit){
      const key=this.textures.keys().next().value;if(key===undefined)break;
      const entry=this.textures.get(key);this.gl.deleteTexture(entry.texture);this.textures.delete(key);this.bytes-=entry.bytes;
    }
  }
  texture(image){
    const gl=this.gl,w=image.width,h=image.height;
    if(!w||!h||w>this.maxTexture||h>this.maxTexture)throw Error('Unsupported texture size');
    const version=this.versions.get(image)??('frame'+this.serial);
    let entry=this.textures.get(image);
    if(entry){this.textures.delete(image);}else{
      entry={texture:gl.createTexture(),bytes:0,version:null};
      gl.bindTexture(gl.TEXTURE_2D,entry.texture);
      for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
      for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
    }
    gl.bindTexture(gl.TEXTURE_2D,entry.texture);
    if(entry.version!==version||entry.w!==w||entry.h!==h){
      if(entry.w===w&&entry.h===h)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      this.bytes+=w*h*4-entry.bytes;Object.assign(entry,{w,h,version,bytes:w*h*4});
    }
    this.textures.set(image,entry);return entry.texture;
  }
  quad(x,y,w,h,u,v,uw,vh,mode,image,color){
    if(!w||!h||!this.state.alpha)return;
    const gl=this.gl,a=this.state.clip;
    const left=Math.max(0,Math.round(a[0])),top=Math.max(0,Math.round(a[1])),right=Math.min(this.canvas.width,Math.round(a[2])),bottom=Math.min(this.canvas.height,Math.round(a[3]));
    if(right<=left||bottom<=top)return;
    gl.enable(gl.SCISSOR_TEST);gl.scissor(left,this.canvas.height-bottom,right-left,bottom-top);
    gl.blendFunc(gl.ONE,this.state.composite==='lighter'?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);
    gl.bindTexture(gl.TEXTURE_2D,mode?this.texture(image):this.white);
    gl.uniform1f(this.uniform.mode,mode);gl.uniform1f(this.uniform.opacity,this.state.alpha);
    if(!mode)gl.uniform4fv(this.uniform.color,color);
    const m=this.state.m,buf=this.vertices;
    let i=0;
    for(const [dx,dy,tu,tv] of [[0,0,0,0],[1,0,1,0],[0,1,0,1],[0,1,0,1],[1,0,1,0],[1,1,1,1]]){
      const px=x+dx*w,py=y+dy*h;
      buf[i++]=m[0]*px+m[2]*py+m[4];buf[i++]=m[1]*px+m[3]*py+m[5];buf[i++]=u+tu*uw;buf[i++]=v+tv*vh;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER,0,buf);gl.drawArrays(gl.TRIANGLES,0,6);
    this.trim();
  }
  drawImage(image,...args){
    let sx=0,sy=0,sw=image.width,sh=image.height,x,y,w=sw,h=sh;
    if(args.length===2)[x,y]=args;
    else if(args.length===4)[x,y,w,h]=args;
    else if(args.length===8)[sx,sy,sw,sh,x,y,w,h]=args;
    else throw Error('Unsupported drawImage arguments');
    if(![sx,sy,sw,sh,x,y,w,h].every(Number.isFinite)||!sw||!sh||!w||!h)return;
    if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}if(w<0){x+=w;w=-w;}if(h<0){y+=h;h=-h;}
    const l=Math.max(0,sx),t=Math.max(0,sy),r=Math.min(image.width,sx+sw),b=Math.min(image.height,sy+sh);
    if(r<=l||b<=t)return;
    this.quad(x+(l-sx)*w/sw,y+(t-sy)*h/sh,w*(r-l)/sw,h*(b-t)/sh,l/image.width,t/image.height,(r-l)/image.width,(b-t)/image.height,1,image);
  }
  fillRect(x,y,w,h){
    const fill=this.state.fill;
    if(fill?.image){const im=fill.image;if(im.width&&im.height)this.quad(x,y,w,h,x/im.width,y/im.height,w/im.width,h/im.height,2,im);return;}
    const match=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(fill);
    if(!match)throw Error('Unsupported GPU fill');
    this.quad(x,y,w,h,0,0,0,0,0,null,[+match[1]/255,+match[2]/255,+match[3]/255,match[4]===undefined?1:+match[4]]);
  }
  finish(ctx){
    const gl=this.gl;if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('WebGL frame failed');
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.drawImage(this.canvas,0,0);
  }
  dispose(){for(const entry of this.textures.values())this.gl.deleteTexture(entry.texture);this.textures.clear();this.bytes=0;}
}
root.VX.GPUScene=GPUScene;
})(globalThis);
