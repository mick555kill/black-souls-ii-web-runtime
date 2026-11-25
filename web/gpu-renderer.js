// WebGL compositor for the drawing operations used by RGSS3Display.
// Scene coordinates grow downwards from row zero of the framebuffer texture.
(function(VX){
  'use strict';
  const quadVertex=`attribute vec2 pos,uv;attribute vec4 tint;attribute float opacity;
    uniform vec2 size;varying vec2 sampleUV;varying vec4 color;varying float alpha;
    void main(){gl_Position=vec4(pos/size*2.0-1.0,0.,1.);sampleUV=uv;color=tint;alpha=opacity;}`;
  const quadFragment=`precision mediump float;varying vec2 sampleUV;varying vec4 color;varying float alpha;
    uniform sampler2D picture;uniform bool repeatUV;
    void main(){vec4 p=texture2D(picture,repeatUV?fract(sampleUV):sampleUV);
      gl_FragColor=vec4(mix(p.rgb,color.rgb*p.a,color.a),p.a)*alpha;}`;
  const screenVertex='attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const screenFragment='precision mediump float;varying vec2 uv;uniform sampler2D picture;void main(){gl_FragColor=texture2D(picture,uv);}';
  const clearTint=[0,0,0,0];
  function program(gl,vertex,fragment,locations){
    const p=gl.createProgram();
    try{
      for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
        const shader=gl.createShader(type);
        gl.shaderSource(shader,source);gl.compileShader(shader);
        gl.attachShader(p,shader);gl.deleteShader(shader);
      }
      locations.forEach((name,i)=>gl.bindAttribLocation(p,i,name));gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)||'WebGL shader link failed');
      return p;
    }catch(e){gl.deleteProgram(p);throw e;}
  }
  class GpuRenderer {
    constructor(output,display,gl){
      this.output=output;this.display=display;this.gl=gl;
      this.textures=new Map();this.bytes=0;this.limit=32*1024*1024;
      this.maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.rasterLimit=Math.min(...gl.getParameter(gl.MAX_VIEWPORT_DIMS),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      this.colors=new Map();this.vertices=new Float32Array(128*6*9);this.stack=[];this.depth=0;this.used=0;
      const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision?'highp':'mediump';
      this.quads=program(gl,quadVertex.replace('varying vec2 sampleUV','varying '+precision+' vec2 sampleUV'),
        quadFragment.replace('varying vec2 sampleUV','varying '+precision+' vec2 sampleUV'),['pos','uv','tint','opacity']);
      this.plain=this.screenProgram(screenFragment);
      this.quadSize=gl.getUniformLocation(this.quads,'size');this.repeatLoc=gl.getUniformLocation(this.quads,'repeatUV');
      this.vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);
      this.screenBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.screenBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      this.fbo=gl.createFramebuffer();this.sceneTexture=this.newTexture(gl.NEAREST);
      this.white=this.newTexture(gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
      this.width=this.height=0;this.version=-1;this.shown=-2;
    }
    screenProgram(fragment){
      const gl=this.gl,p=program(gl,screenVertex,fragment,['p']);
      return {p,size:gl.getUniformLocation(p,'size'),raster:gl.getUniformLocation(p,'raster'),mask:gl.getUniformLocation(p,'maskAmount')};
    }
    newTexture(filter){
      const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      for(const k of [gl.TEXTURE_MAG_FILTER,gl.TEXTURE_MIN_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,filter);
      for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
      return t;
    }
    begin(w,h){
      const gl=this.gl;
      if(gl.isContextLost())throw Error('WebGL context lost');
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);
      if(w!==this.width||h!==this.height){
        this.width=w;this.height=h;gl.bindTexture(gl.TEXTURE_2D,this.sceneTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.sceneTexture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('WebGL frame allocation failed');
      }
      gl.viewport(0,0,w,h);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);gl.useProgram(this.quads);gl.uniform2f(this.quadSize,w,h);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
      let offset=0;
      for(const [i,n] of [[0,2],[1,2],[2,4],[3,1]]){
        gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,36,offset);offset+=4*n;
      }
      this.a=this.d=1;this.b=this.c=this.x=this.y=0;this.globalAlpha=1;this.globalCompositeOperation='source-over';
      this.fillStyle='#000';this.tint=clearTint;this.clipRect=null;this.depth=0;this.used=0;
      return this;
    }
    save(){
      const s=this.stack[this.depth]||(this.stack[this.depth]={});this.depth++;
      Object.assign(s,{a:this.a,b:this.b,c:this.c,d:this.d,x:this.x,y:this.y,globalAlpha:this.globalAlpha,
        globalCompositeOperation:this.globalCompositeOperation,fillStyle:this.fillStyle,tint:this.tint,clipRect:this.clipRect});
    }
    restore(){Object.assign(this,this.stack[--this.depth]);}
    translate(x,y){this.x+=this.a*x+this.c*y;this.y+=this.b*x+this.d*y;}
    scale(x,y){this.a*=x;this.b*=x;this.c*=y;this.d*=y;}
    rotate(rad){const co=Math.cos(rad),si=Math.sin(rad),{a,b,c,d}=this;
      this.a=a*co+c*si;this.b=b*co+d*si;this.c=c*co-a*si;this.d=d*co-b*si;}
    beginPath(){}
    rect(x,y,w,h){
      const x1=this.x+x*this.a,y1=this.y+y*this.d,x2=x1+w*this.a,y2=y1+h*this.d;
      this.path=[Math.min(x1,x2),Math.min(y1,y2),Math.max(x1,x2),Math.max(y1,y2)];
    }
    clip(){
      const p=this.path,r=this.clipRect;
      this.clipRect=r?[Math.max(r[0],p[0]),Math.max(r[1],p[1]),Math.min(r[2],p[2]),Math.min(r[3],p[3])]:p;
    }
    release(source){
      const e=this.textures.get(source);if(!e)return;
      if(this.used&&e.t===this.batchTexture)this.flush();
      this.gl.deleteTexture(e.t);this.textures.delete(source);this.bytes-=e.bytes;
    }
    invalidate(source){const e=this.textures.get(source);if(e)e.dirty=true;}
    texture(source){
      const gl=this.gl,w=source.width,h=source.height;
      let e=this.textures.get(source);
      if(w>this.maxSize||h>this.maxSize)throw Error('Image exceeds the available WebGL texture size');
      if(!e||e.w!==w||e.h!==h){
        if(e)this.release(source);
        const bytes=w*h*4;
        while(this.textures.size && this.bytes+bytes>this.limit)this.release(this.textures.keys().next().value);
        e={t:this.newTexture(gl.LINEAR),w,h,bytes};this.bytes+=bytes;
        this.textures.set(source,e);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('WebGL texture upload failed ('+error+')');
      }else{
        this.textures.delete(source);this.textures.set(source,e);
        if(e.dirty){if(this.used&&this.batchTexture===e.t)this.flush();
          gl.bindTexture(gl.TEXTURE_2D,e.t);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);e.dirty=false;}
      }
      return e.t;
    }
    color(css){
      let value=this.colors.get(css);if(value)return value;
      const match=/^rgba?\(([^)]+)\)$/i.exec(css);
      if(match){const a=match[1].split(',').map(Number);value=[a[0]/255,a[1]/255,a[2]/255,a[3]??1];}
      else if(/^#([a-f\d]{3}|[a-f\d]{6})$/i.test(css)){
        let s=css.slice(1);if(s.length===3)s=[...s].map(c=>c+c).join('');
        value=[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,1];
      }else{
        const ctx=this.colorContext??(this.colorContext=this.display.canvasOf(1,1).getContext('2d',{willReadFrequently:true}));
        ctx.clearRect(0,0,1,1);ctx.fillStyle=css;ctx.fillRect(0,0,1,1);value=Array.from(ctx.getImageData(0,0,1,1).data,n=>n/255);
      }
      if(this.colors.size>=64)this.colors.clear();this.colors.set(css,value);return value;
    }
    flash(css,strength){const [r,g,b,a]=this.color(css);this.tint=[r,g,b,a*strength];}
    createPattern(source){return {source};}
    fillRect(x,y,w,h){
      if(!w||!h)return;
      if(this.fillStyle?.source){
        const s=this.fillStyle.source;
        this.quad(this.texture(s),x,y,w,h,x/s.width,y/s.height,(x+w)/s.width,(y+h)/s.height,true,this.tint,this.globalAlpha);
      }else{
        const color=this.color(this.fillStyle);
        this.quad(this.white,x,y,w,h,0,0,1,1,false,[color[0],color[1],color[2],1],this.globalAlpha*color[3]);
      }
    }
    drawImage(source,sx,sy,sw,sh,dx,dy,dw,dh){
      if(dx===undefined){dx=sx;dy=sy;dw=sw??source.width;dh=sh??source.height;sx=sy=0;sw=source.width;sh=source.height;}
      if(dw<0){dx+=dw;dw=-dw;}if(dh<0){dy+=dh;dh=-dh;}
      if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}
      if(!dw||!dh||!sw||!sh)return;
      const rx=dw/sw,ry=dh/sh;
      const layer=this.display.tileLayers.get(source);
      if(layer){
        for(const block of layer.blocks){
          const ctx=layer.upper?block.high:block.low;if(!ctx)continue;
          const ix=block.x*32-layer.ox,iy=block.y*32-layer.oy,img=ctx.canvas;
          const x=Math.max(0,sx,ix),y=Math.max(0,sy,iy),ex=Math.min(source.width,sx+sw,ix+img.width),ey=Math.min(source.height,sy+sh,iy+img.height);
          if(ex>x&&ey>y)this.drawImage(img,x-ix,y-iy,ex-x,ey-y,dx+(x-sx)*rx,dy+(y-sy)*ry,(ex-x)*rx,(ey-y)*ry);
        }
        return;
      }
      const x=Math.max(0,sx),y=Math.max(0,sy),ex=Math.min(source.width,sx+sw),ey=Math.min(source.height,sy+sh);
      if(ex<=x||ey<=y)return;
      this.quad(this.texture(source),dx+(x-sx)*rx,dy+(y-sy)*ry,(ex-x)*rx,(ey-y)*ry,
        x/source.width,y/source.height,ex/source.width,ey/source.height,false,this.tint,this.globalAlpha);
    }
    quad(tex,x,y,w,h,u,v,ex,ey,repeat,tint,alpha){
      if(alpha<=0)return;
      const clip=this.clipRect,add=this.globalCompositeOperation==='lighter';
      if(this.used && (this.batchTexture!==tex||this.batchClip!==clip||this.batchAdd!==add||this.batchRepeat!==repeat||this.used===this.vertices.length))this.flush();
      this.batchTexture=tex;this.batchClip=clip;this.batchAdd=add;this.batchRepeat=repeat;
      const px=this.x+this.a*x+this.c*y,py=this.y+this.b*x+this.d*y;
      const ax=this.a*w,ay=this.b*w,bx=this.c*h,by=this.d*h;
      this.vertex(px,py,u,v,tint,alpha);this.vertex(px+ax,py+ay,ex,v,tint,alpha);this.vertex(px+bx,py+by,u,ey,tint,alpha);
      this.vertex(px+bx,py+by,u,ey,tint,alpha);this.vertex(px+ax,py+ay,ex,v,tint,alpha);this.vertex(px+ax+bx,py+ay+by,ex,ey,tint,alpha);
    }
    vertex(x,y,u,v,t,a){
      const out=this.vertices;let i=this.used;out[i++]=x;out[i++]=y;out[i++]=u;out[i++]=v;
      out[i++]=t[0];out[i++]=t[1];out[i++]=t[2];out[i++]=t[3];out[i++]=a;this.used=i;
    }
    flush(){
      if(!this.used)return;
      const gl=this.gl,clip=this.batchClip;
      gl.bindTexture(gl.TEXTURE_2D,this.batchTexture);gl.uniform1i(this.repeatLoc,this.batchRepeat?1:0);
      if(clip){
        const x=Math.round(clip[0]),y=Math.round(clip[1]);gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x,y,Math.max(0,Math.round(clip[2])-x),Math.max(0,Math.round(clip[3])-y));
      }else gl.disable(gl.SCISSOR_TEST);
      gl.blendFunc(gl.ONE,this.batchAdd?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices.subarray(0,this.used));
      gl.drawArrays(gl.TRIANGLES,0,this.used/9);this.used=0;
    }
    finish(version){this.flush();this.version=version;this.present();}
    configure(fragment,cssW,cssH,dpr){
      if(this.fragment===fragment && this.cssW===cssW && this.cssH===cssH && this.dpr===dpr)return;
      if(fragment&&!this.crt)this.crt=this.screenProgram(fragment);
      this.fragment=fragment;this.cssW=cssW;this.cssH=cssH;this.dpr=dpr;this.shown=-2;this.present();
    }
    present(){
      if(this.version<0||this.shown===this.version)return;
      const gl=this.gl,program=this.fragment?this.crt:this.plain;
      let w=this.width,h=this.height,scale=1;
      if(this.fragment){
        const pw=Math.max(1,Math.round(this.cssW*this.dpr)),ph=Math.max(1,Math.round(this.cssH*this.dpr));
        scale=Math.min(1,Math.sqrt(2800000/(pw*ph)),this.rasterLimit/pw,this.rasterLimit/ph);
        w=Math.max(1,Math.round(pw*scale));h=Math.max(1,Math.round(ph*scale));
      }
      if(this.output.width!==w)this.output.width=w;if(this.output.height!==h)this.output.height=h;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
      gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);gl.useProgram(program.p);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.screenBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      for(let i=1;i<4;i++)gl.disableVertexAttribArray(i);
      gl.bindTexture(gl.TEXTURE_2D,this.sceneTexture);
      if(this.fragment){
        gl.uniform2f(program.size,this.width,this.height);gl.uniform2f(program.raster,w,h);
        gl.uniform1f(program.mask,Math.max(0,Math.min(1,(w/this.width-1.4)/1.4))*Math.max(0,(scale-.8)*5));
      }
      gl.drawArrays(gl.TRIANGLES,0,3);this.shown=this.version;
    }
    snapshot(ctx){
      const gl=this.gl,w=this.width,h=this.height,bytes=new Uint8Array(w*h*4);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      const img=ctx.createImageData(w,h),out=img.data;out.set(bytes);
      for(let i=0;i<out.length;i+=4){const a=out[i+3];if(a&&a!==255){out[i]*=255/a;out[i+1]*=255/a;out[i+2]*=255/a;}}
      ctx.putImageData(img,0,0);
    }
    dispose(){
      const gl=this.gl;this.used=0;
      if(!gl.isContextLost()){
        for(const e of this.textures.values())gl.deleteTexture(e.t);
        gl.deleteTexture(this.white);gl.deleteTexture(this.sceneTexture);gl.deleteFramebuffer(this.fbo);
        gl.deleteBuffer(this.vertexBuffer);gl.deleteBuffer(this.screenBuffer);
        for(const p of [this.quads,this.plain?.p,this.crt?.p])if(p)gl.deleteProgram(p);
      }
      this.textures.clear();this.bytes=0;
    }
  }
  VX.GpuRenderer=GpuRenderer;
})(globalThis.VX);
