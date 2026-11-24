/* Partial HTML Canvas/Audio implementation for commands from CRuby WASM.
 * The game's existing JS map renderer remains separate and continues to work.
 */
(function(root){
  'use strict';
  // World-aligned blocks let the camera scroll without rasterizing every tile.
  // Cells with animated water or waterfalls are repainted at their own phase.
  class TileChunks {
    constructor(display, tiles, sources) {
      this.display=display;
      this.map=tiles.map;
      this.flags=tiles.flags;
      this.sources=sources;
      this.versions=sources.map(b=>b?.version);
      this.sheets=sources.map(b=>b?.ready?b.canvas:null);
      this.images=new Map();
      this.blocks=new Map();
      this.span=8;
      this.last=null;
    }
    matches(tiles, sources) {
      return this.map===tiles.map && this.flags===tiles.flags &&
        this.sources.length===sources.length && sources.every((b,i)=>b===this.sources[i] && b?.version===this.versions[i]);
    }
    image(tile, frame) {
      const key=tile*3+root.VX.Autotile.phase(tile,frame);
      if(!this.images.has(key)) {
        if(this.images.size>=1024){
          const oldest=this.images.keys().next().value,image=this.images.get(oldest);
          if(image)image.width=0;
          this.images.delete(oldest);
        }
        this.images.set(key,root.VX.Autotile.compose(tile,this.sheets,frame,(w,h)=>this.display.canvasOf(w,h)));
      }
      return this.images.get(key);
    }
    paint(block, x, y, frame, replace) {
      const px=(x-block.x)*32,py=(y-block.y)*32;
      if(replace) {
        block.low.clearRect(px,py,32,32);
        block.high?.clearRect(px,py,32,32);
      }
      let cycles=0;
      for(let z=0;z<Math.min(3,this.map.depth);z++) {
        const tile=this.map.at(x,y,z);
        if(!tile)continue;
        if(!replace && root.VX.Autotile.phase(tile,1)) {
          const kind=Math.floor((tile-2048)/48);
          cycles|=root.VX.Autotile.isWaterfall(kind)?2:1;
        }
        const image=this.image(tile,frame);
        if(!image)continue;
        let ctx=block.low;
        if(this.flags?.at(tile)&16) {
          if(!block.high)block.high=this.display.canvasOf(block.low.canvas.width,block.low.canvas.height).getContext('2d');
          ctx=block.high;
        }
        ctx.drawImage(image,px,py);
      }
      const shadow=this.map.at(x,y,3)&15;
      if(shadow) {
        block.low.fillStyle='rgba(0,0,0,.5)';
        for(let i=0;i<4;i++)if(shadow&(1<<i))block.low.fillRect(px+(i%2)*16,py+(i>>1)*16,16,16);
      }
      if(cycles)block.animated.push({x,y,cycles});
    }
    block(bx, by, frame) {
      const key=by*Math.ceil(this.map.width/this.span)+bx;
      let block=this.blocks.get(key);
      if(block) {
        this.blocks.delete(key);
      }else{
        const x=bx*this.span,y=by*this.span;
        const w=Math.min(this.span,this.map.width-x),h=Math.min(this.span,this.map.height-y);
        block={x,y,low:this.display.canvasOf(w*32,h*32).getContext('2d'),high:null,animated:[],frame};
        for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)this.paint(block,i,j,frame,false);
      }
      this.blocks.set(key,block);
      return block;
    }
    releaseBlock(block) {
      block.low.canvas.width=0;
      if(block.high)block.high.canvas.width=0;
    }
    dispose() {
      for(const block of this.blocks.values())this.releaseBlock(block);
      for(const image of this.images.values())if(image)image.width=0;
      this.blocks.clear();this.images.clear();
    }
    updateAnimation(block, frame) {
      if(block.frame===frame)return false;
      const before=block.frame;
      block.frame=frame;
      if(!block.animated.length)return false;
      const phase=[0,1,2,1];
      const changed=(phase[before%4]!==phase[frame%4]?1:0)|(before%3!==frame%3?2:0);
      let dirty=false;
      for(const cell of block.animated)if(cell.cycles&changed){
        this.paint(block,cell.x,cell.y,frame,true);
        dirty=true;
      }
      return dirty;
    }
    draw(low, high, ox, oy, frame) {
      const size=this.span*32;
      const fromX=Math.max(0,Math.floor(ox/size)),fromY=Math.max(0,Math.floor(oy/size));
      const endX=Math.min(Math.ceil(this.map.width/this.span),Math.ceil((ox+low.width)/size));
      const endY=Math.min(Math.ceil(this.map.height/this.span),Math.ceil((oy+low.height)/size));
      let dirty=!this.last || this.last.low!==low || this.last.high!==high || this.last.x!==ox || this.last.y!==oy;
      if(!dirty && this.last.frame===frame)return;
      const visible=[];
      for(let by=fromY;by<endY;by++)for(let bx=fromX;bx<endX;bx++){
        const block=this.block(bx,by,frame);
        if(this.updateAnimation(block,frame))dirty=true;
        visible.push(block);
      }
      const capacity=2*(Math.ceil(low.width/size)+1)*(Math.ceil(low.height/size)+1);
      while(this.blocks.size>capacity) {
        const key=this.blocks.keys().next().value,old=this.blocks.get(key);
        this.blocks.delete(key);
        this.releaseBlock(old);
      }
      if(!dirty){this.last.frame=frame;return;}
      low.ctx.clearRect(0,0,low.width,low.height);
      const upper=visible.some(block=>block.high);
      if(!this.last || this.last.upper || upper || this.last.high!==high) {
        high.ctx.clearRect(0,0,high.width,high.height);
        high.version++;
      }
      for(const block of visible) {
        const dx=block.x*32-ox,dy=block.y*32-oy;
        low.ctx.drawImage(block.low.canvas,dx,dy);
        if(block.high)high.ctx.drawImage(block.high.canvas,dx,dy);
      }
      low.version++;
      this.last={x:ox,y:oy,frame,low,high,upper};
    }
  }
  class RGSS3Display{
    constructor(canvas,getProject=()=>null){
      this.canvas=canvas;
      this.ctx=canvas.getContext('2d');
      this.getProject=getProject;
      this.bitmaps=new Map();this.sprites=new Map();this.tilemaps=new Map();this.viewports=new Map();this.channels=new Map();this.audioGeneration=new Map();
      this.volumePercent=100;this.fadeAlpha=0;this.enabled=false;
      this.maxBitmapPixels=4096*4096;
      this.presentationVersion=0;this.repaint=true;this.hadFlash=false;this.lastFade=0;
      this.gpuUnavailable=typeof URLSearchParams!=='undefined' && new URLSearchParams(root.location?.search||'').get('renderer')==='canvas2d';
    }
    canvasOf(w,h){
      const sizeW=Number(w),sizeH=Number(h);
      if(!Number.isInteger(sizeW)||!Number.isInteger(sizeH)||sizeW<1||sizeH<1||sizeW*sizeH>this.maxBitmapPixels)
        throw Error('Bitmap dimensions exceed safe browser limits');
      if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(sizeW,sizeH);
      const node=document.createElement('canvas');node.width=sizeW;node.height=sizeH;return node;
    }
    makeBitmap(id,w,h){
      const canvas=this.canvasOf(w,h);
      this.bitmaps.set(id,{canvas,ctx:canvas.getContext('2d'),width:w,height:h,ready:true,tail:null,version:0});
    }
    async loadBitmap(bitmap,path){
      const project=this.getProject();
      if(!project)return;
      const match=/^(?:Graphics\/)?([^/]+)\/(.+)$/i.exec(String(path));
      if(!match)return;
      const image=await project.image(match[1],match[2]);
      if(!image)return;
      const cv=this.canvasOf(image.width,image.height);
      cv.getContext('2d').drawImage(image,0,0);
      bitmap.canvas=cv;bitmap.ctx=cv.getContext('2d');bitmap.width=image.width;bitmap.height=image.height;
    }
    drawBitmap(op,args,b,src){
      switch(op){
        case 'bitmap-copy':b.ctx.drawImage(src.canvas,0,0);return;
        case 'bitmap-hue':{
          const shift=((args[1]%360)+360)%360/60;
          if(!shift)return;
          const pixels=b.ctx.getImageData(0,0,b.width,b.height),d=pixels.data;
          for(let i=0;i<d.length;i+=4){
            const r=d[i],g=d[i+1],blue=d[i+2],max=Math.max(r,g,blue),min=Math.min(r,g,blue),c=max-min;
            if(!c||!d[i+3])continue;
            const h=((max===r?(g-blue)/c:max===g?2+(blue-r)/c:4+(r-g)/c)+shift+6)%6;
            const x=c*(1-Math.abs(h%2-1));
            d[i]=min+(h<1||h>=5?c:h<2||h>=4?x:0);
            d[i+1]=min+(h>=1&&h<3?c:h<1||h<4&&h>=3?x:0);
            d[i+2]=min+(h>=3&&h<5?c:h>=2&&h<3||h>=5?x:0);
          }
          b.ctx.putImageData(pixels,0,0);
          return;
        }
        case 'bitmap-radial-blur':{
          const [id,angle,count]=args;
          const steps=Math.max(2,Math.min(100,count|0)),copy=this.canvasOf(b.width,b.height);
          copy.getContext('2d').drawImage(b.canvas,0,0);
          const ctx=b.ctx;ctx.save();ctx.clearRect(0,0,b.width,b.height);ctx.translate(b.width/2,b.height/2);
          ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1/steps;
          for(let i=0;i<steps;i++){
            ctx.save();ctx.rotate((i/(steps-1)-0.5)*angle*Math.PI/180);ctx.drawImage(copy,-b.width/2,-b.height/2);ctx.restore();
          }
          ctx.restore();return;
        }
        case 'bitmap-blur':{
          const copy=this.canvasOf(b.width,b.height);
          copy.getContext('2d').drawImage(b.canvas,0,0);
          b.ctx.save();b.ctx.clearRect(0,0,b.width,b.height);b.ctx.filter='blur(1px)';
          b.ctx.drawImage(copy,0,0);b.ctx.restore();return;
        }
        case 'bitmap-clear-rect':{
          const [id,x,y,w,h]=args;b.ctx.clearRect(x,y,w,h);return;
        }
        case 'bitmap-clear':{
          b.ctx.clearRect(0,0,b.width,b.height);return;
        }
        case 'bitmap-fill':{
          const [id,x,y,w,h,color]=args;
          if(b){b.ctx.fillStyle=String(color);b.ctx.fillRect(x,y,w,h);}return;
        }
        case 'bitmap-gradient':{
          const [id,x,y,w,h,color1,color2,vertical]=args;
          if(b){const gradient=b.ctx.createLinearGradient(x,y,x+(vertical?0:w),y+(vertical?h:0));
            gradient.addColorStop(0,String(color1));gradient.addColorStop(1,String(color2));
            b.ctx.fillStyle=gradient;b.ctx.fillRect(x,y,w,h);}return;
        }
        case 'bitmap-text':{
          const [id,x,y,w,h,text,align,font,size,color,bold,italic,outline,outColor]=args;
          if(b){
            b.ctx.fillStyle=String(color);b.ctx.font=fontStyle(font||'Arial',size||24,bold,italic);
            b.ctx.textBaseline='middle';b.ctx.textAlign=align===1?'center':align===2?'right':'left';
            if(outline){b.ctx.strokeStyle=outColor;b.ctx.lineWidth=2;b.ctx.lineJoin="round";b.ctx.strokeText(String(text),x+(align===1?w/2:align===2?w:0),y+h/2,w);}
            b.ctx.fillText(String(text),x+(align===1?w/2:align===2?w:0),y+h/2,w);
          }return;
        }
        case 'bitmap-blt':{
          const [id,x,y,source,sx,sy,w,h,opacity]=args;
          b.ctx.save();b.ctx.globalAlpha=(opacity??255)/255;b.ctx.drawImage(src.canvas,sx,sy,w,h,x,y,w,h);b.ctx.restore();return;
        }
        case 'bitmap-stretch-blt':{
          const [id,x,y,w,h,source,sx,sy,sw,sh,opacity]=args;
          b.ctx.save();b.ctx.globalAlpha=(opacity??255)/255;b.ctx.drawImage(src.canvas,sx,sy,sw||src.width,sh||src.height,x,y,w,h);b.ctx.restore();return;
        }
      }
    }
    queueBitmap(op,args){
      const b=this.bitmaps.get(args[0]);
      const slot={'bitmap-copy':1,'bitmap-blt':3,'bitmap-stretch-blt':5}[op];
      const src=slot===undefined?null:this.bitmaps.get(args[slot]);
      if(!b || (slot!==undefined&&!src))return;
      const resources=src&&src!==b?[b,src]:[b];
      const waits=resources.map(bitmap=>bitmap.tail).filter(Boolean);
      const draw=()=>{this.drawBitmap(op,args,b,src);b.version++;};
      if(!waits.length){draw();return;}
      // Retain the original surfaces across dispose and order later reads and writes.
      const tail=Promise.all(waits).then(draw).catch(e=>console.warn('Bitmap draw:',e));
      for(const bitmap of resources)bitmap.tail=tail;
      tail.then(()=>{for(const bitmap of resources)if(bitmap.tail===tail)bitmap.tail=null;});
    }
    handle({op,args=[]}){
      switch(op){
        case 'flash':{
          const [type,id,color,duration,start]=args;
          const target=(type==='Sprite'?this.sprites:this.viewports).get(id);
          if(target)target.flash=duration>0?{color,duration,start}:null;
          return;
        }
        case 'frame':return this.frame();
        case 'resize':{
          // The project uses the fixed VX Ace 544x416 viewport.
          const [w,h]=args;
          if(w>0&&h>0&&w<=2048&&h<=2048){this.canvas.width=w;this.canvas.height=h;this.repaint=true;}
          return;
        }
        case 'fade':this.fadeAlpha=Number(args[0])||0;return;
        case 'bitmap-create':this.makeBitmap(...args);return;
        case 'bitmap-load':{
          const [id,path]=args;
          this.makeBitmap(id,1,1);
          const bitmap=this.bitmaps.get(id);bitmap.ready=false;
          const tail=this.loadBitmap(bitmap,path).catch(e=>console.warn('Bitmap load:',e));
          bitmap.tail=tail;
          tail.then(()=>{bitmap.ready=true;bitmap.version++;if(bitmap.tail===tail)bitmap.tail=null;});
          return;
        }
        case 'bitmap-dispose':{
          const bitmap=this.bitmaps.get(args[0]);if(bitmap)this.gpu?.forget(bitmap.canvas);
          this.bitmaps.delete(args[0]);return;
        }
        case 'bitmap-snapshot':{
          const b=this.bitmaps.get(args[0]);
          if(b){this.render();b.ctx.drawImage(this.canvas,0,0);b.version++;}
          return;
        }
        case 'tile-table':{
          const [id,kind,bytes]=args, tilemap=this.tilemaps.get(id)||{};
          tilemap[kind]=new root.VX.RubyTable(bytes);
          this.tilemaps.set(id,tilemap);return;
        }
        case 'tile-draw':this.drawTiles(...args);return;
        case 'tile-dispose':{
          this.tilemaps.get(args[0])?.chunks?.dispose();this.tilemaps.delete(args[0]);return;
        }
        case 'viewport-create':
          this.viewports.set(args[0],{version:0,ox:0,oy:0,z:0,visible:true,rect:[0,0,this.canvas.width,this.canvas.height]});return;
        case 'viewport-rect':{
          const viewport=this.viewports.get(args[0]);if(viewport)this.setRect(viewport,'rect',args);return;
        }
        case 'viewport-set':{
          const [id,key,value]=args, viewport=this.viewports.get(id);
          if(viewport && viewport[key]!==value && ['ox','oy','z','visible'].includes(key)){viewport[key]=value;viewport.version++;}
          return;
        }
        case 'viewport-dispose':this.viewports.delete(args[0]);return;
        case 'window-cursor':{const s=this.sprites.get(args[0]);if(s)this.setRect(s,'cursor',args);return;}
        case 'sprite-crop':{
          const sprite=this.sprites.get(args[0]);if(sprite)this.setRect(sprite,'crop',args);return;
        }
        case 'sprite-create':this.sprites.set(args[0],{version:0,wasDrawn:false,x:0,y:0,z:0,ox:0,oy:0,visible:true,opacity:255,zoom_x:1,zoom_y:1,bitmap:-1,viewport:-1,crop:null,angle:0,blend_type:0,plane:false,mirror:false,window:false,windowWidth:0,windowHeight:0,windowOpenness:255,skin:-1,cursor:null,padding:12,padding_bottom:12,contents_opacity:255,back_opacity:192,pause:false});return;
        case 'sprite-set':{
          const [id,key,value]=args,s=this.sprites.get(id);
          if(s)this.setSprite(s,key,value);
          return;
        }
        case 'sprite-dispose':{
          if(this.sprites.get(args[0])?.wasDrawn)this.repaint=true;
          this.sprites.delete(args[0]);return;
        }
        case 'audio':this.audio(...args).catch(e=>console.warn('RGSS3 audio:',e.message));return;
        default:if(op.startsWith('bitmap-'))return this.queueBitmap(op,args);
          console.warn('Unknown RGSS3 display command:',op);
      }
    }
    setSprite(sprite,key,value){
      if(!Object.prototype.hasOwnProperty.call(sprite,key))return;
      if(sprite[key]===value && !(key==='bitmap' && sprite.crop))return;
      sprite[key]=value;
      if(key==='bitmap')sprite.crop=null;
      sprite.version++;
    }
    setRect(target,key,args){
      const rect=target[key];
      if(rect && rect[0]===args[1] && rect[1]===args[2] && rect[2]===args[3] && rect[3]===args[4])return;
      target[key]=args.slice(1);target.version++;
    }
    frame(){
      return new Promise(resolve=>{
        const tick=()=>{if(this.enabled)this.render();resolve();};
        if(typeof requestAnimationFrame==='function')requestAnimationFrame(tick);
        else setTimeout(tick,16);
      });
    }
    inView(s,b,v){
      const r=v?.rect;
      const tx=v?r[0]-v.ox:0,ty=v?r[1]-v.oy:0;
      const left=r?Math.max(0,Math.min(r[0],r[0]+r[2])):0,top=r?Math.max(0,Math.min(r[1],r[1]+r[3])):0;
      const right=r?Math.min(this.canvas.width,Math.max(r[0],r[0]+r[2])):this.canvas.width;
      const bottom=r?Math.min(this.canvas.height,Math.max(r[1],r[1]+r[3])):this.canvas.height;
      if(right<=left || bottom<=top)return false;
      const originX=Number(s.x)+tx,originY=Number(s.y)+ty;
      if(s.window)return s.windowOpenness>0 && s.windowWidth!==0 && s.windowHeight!==0 &&
        Math.min(originX,originX+s.windowWidth)<right && Math.max(originX,originX+s.windowWidth)>left &&
        Math.min(originY,originY+s.windowHeight)<bottom && Math.max(originY,originY+s.windowHeight)>top;
      if(s.plane)return b.ready && s.zoom_x>0 && s.zoom_y>0;
      const width=s.crop?s.crop[2]:b.width,height=s.crop?s.crop[3]:b.height;
      if(!s.zoom_x || !s.zoom_y || width<=0 || height<=0)return false;
      if(s.angle || s.mirror)return true;
      const x=originX-s.ox*s.zoom_x,y=originY-s.oy*s.zoom_y;
      const x2=x+width*s.zoom_x,y2=y+height*s.zoom_y;
      return Math.min(x,x2)<right && Math.max(x,x2)>left && Math.min(y,y2)<bottom && Math.max(y,y2)>top;
    }
    render(){
      for(const tiles of this.tilemaps.values()){
        if(!tiles.lastDraw?.[6])continue;
        const cache=tiles.chunks;
        if(!cache || cache.map!==tiles.map || cache.flags!==tiles.flags ||
          tiles.ids.some((id,i)=>this.bitmaps.get(id)!==cache.sources[i] || cache.sources[i]?.version!==cache.versions[i])){
          this.drawTiles(...tiles.lastDraw);
        }
      }
      const frame=this.frameNumber??0,pause=Math.floor(performance.now()/140)%4;
      const flashing=t=>t?.flash && frame<t.flash.start+t.flash.duration;
      const strength=f=>Math.min(1,1-(frame-f.start)/f.duration);
      const sprites=this.visibleSprites??(this.visibleSprites=[]);
      sprites.length=0;
      let dirty=this.repaint || this.fadeAlpha!==this.lastFade || this.hadFlash ||
        this.canvas.width!==this.presentedWidth || this.canvas.height!==this.presentedHeight;
      let flash=false;
      for(const s of this.sprites.values()){
        const b=this.bitmaps.get(s.bitmap),v=this.viewports.get(s.viewport);
        const shown=!!(s.visible && b && (s.window || s.opacity>0) && (s.viewport===-1 || v?.visible) &&
          !(flashing(v)&&!v.flash.color) && !(flashing(s)&&!s.flash.color) && this.inView(s,b,v));
        if(shown!==s.wasDrawn){
          dirty=true;s.wasDrawn=shown;
          if(!shown)s.lastBitmap=s.lastSkin=s.lastViewport=undefined;
        }
        if(!shown)continue;
        const skin=s.window?this.bitmaps.get(s.skin):undefined,arrow=s.window&&s.pause?pause:-1;
        if(s.lastVersion!==s.version || s.lastBitmap!==b || s.lastPixels!==b.version ||
          s.lastViewport!==v || s.lastViewVersion!==v?.version || s.lastSkin!==skin ||
          s.lastSkinVersion!==skin?.version || s.lastArrow!==arrow)dirty=true;
        s.lastVersion=s.version;s.lastBitmap=b;s.lastPixels=b.version;
        s.lastViewport=v;s.lastViewVersion=v?.version;s.lastSkin=skin;s.lastSkinVersion=skin?.version;s.lastArrow=arrow;
        if(flashing(s))flash=true;
        sprites.push(s);
      }
      for(const v of this.viewports.values())if(v.visible && flashing(v) && v.flash.color){
        flash=true;sprites.push({overlay:v,z:v.z,top:true});
      }
      this.hadFlash=flash;
      if(!dirty && !flash)return false;
      this.repaint=false;this.lastFade=this.fadeAlpha;
      this.presentedWidth=this.canvas.width;this.presentedHeight=this.canvas.height;
      const layer=s=>this.viewports.get(s.viewport)?.z ?? s.z;
      sprites.sort((a,b)=>layer(a)-layer(b)||Number(!!a.top)-Number(!!b.top)||a.z-b.z||a.y-b.y);
      // Flash effects use the original canvas path; all other scene drawing
      // can run on WebGL without changing RGSS game logic or bitmap APIs.
      if(!flash && !this.gpuUnavailable && root.VX.GPUScene && typeof document!=='undefined'){
        try{
          this.gpu??=new root.VX.GPUScene();
          this.gpu.begin(this.canvas.width,this.canvas.height,sprites,this.bitmaps);
          this.paintScene(this.gpu,sprites,flashing,strength);
          this.gpu.finish(this.ctx);this.rendererMode='webgl';
          this.presentationVersion++;return true;
        }catch(error){
          console.warn('GPU compositor fallback:',error);this.gpu?.dispose();this.gpu=null;this.gpuUnavailable=true;
        }
      }
      this.rendererMode='canvas2d';this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      this.paintScene(this.ctx,sprites,flashing,strength);
      this.presentationVersion++;return true;
    }
    paintScene(c,sprites,flashing,strength){
      for(const s of sprites){
        if(s.overlay){
          const v=s.overlay;c.save();c.globalAlpha=strength(v.flash);c.fillStyle=v.flash.color;c.fillRect(...v.rect);c.restore();continue;
        }
        const b=s.lastBitmap,viewport=s.lastViewport;
        c.save();
        if(viewport){
          const [vx,vy,vw,vh]=viewport.rect;
          if(vx>0||vy>0||vx+vw<this.canvas.width||vy+vh<this.canvas.height){
            c.beginPath();c.rect(vx,vy,vw,vh);c.clip();
          }
          if(vx!==viewport.ox||vy!==viewport.oy)c.translate(vx-viewport.ox,vy-viewport.oy);
        }
        if(s.window){this.drawWindow(c,s,b);c.restore();continue;}
        c.globalAlpha=Math.max(0,Math.min(1,Number(s.opacity)/255));
        if(s.blend_type===1)c.globalCompositeOperation='lighter';
        if(s.plane){
          if(b.ready && s.zoom_x>0 && s.zoom_y>0){
            if(b.patternContext!==c || b.patternCanvas!==b.canvas || b.patternVersion!==b.version){
              b.pattern=c.createPattern(b.canvas,'repeat');b.patternCanvas=b.canvas;b.patternVersion=b.version;b.patternContext=c;
            }
            const x=viewport?.ox||0,y=viewport?.oy||0;
            c.scale(s.zoom_x,s.zoom_y);c.translate(-s.ox,-s.oy);
            c.fillStyle=b.pattern;
            c.fillRect(x/s.zoom_x+s.ox,y/s.zoom_y+s.oy,(viewport?.rect[2]??this.canvas.width)/s.zoom_x,(viewport?.rect[3]??this.canvas.height)/s.zoom_y);
          }
          c.restore();continue;
        }
        const [sx,sy,w,h]=s.crop || [0,0,b.width,b.height];
        if(w>0 && h>0 && s.zoom_x && s.zoom_y){
          if(s.angle || s.mirror){
            c.translate(s.x,s.y);c.rotate(-s.angle*Math.PI/180);c.scale(s.mirror?-1:1,1);
          }
          const left=(s.angle||s.mirror?0:s.x)-s.ox*s.zoom_x+(s.window?12:0);
          const top=(s.angle||s.mirror?0:s.y)-s.oy*s.zoom_y+(s.window?12:0);
          if(flashing(s)&&s.flash.color){
            const tmp=this.canvasOf(w,h),ctx=tmp.getContext('2d');
            ctx.drawImage(b.canvas,sx,sy,w,h,0,0,w,h);
            ctx.globalCompositeOperation='source-atop';ctx.fillStyle=s.flash.color;ctx.globalAlpha=strength(s.flash);ctx.fillRect(0,0,w,h);
            c.drawImage(tmp,left,top,w*s.zoom_x,h*s.zoom_y);
          }else if(s.crop)c.drawImage(b.canvas,sx,sy,w,h,left,top,w*s.zoom_x,h*s.zoom_y);
          else c.drawImage(b.canvas,left,top,w*s.zoom_x,h*s.zoom_y);
        }
        c.restore();
      }
      if(this.fadeAlpha){c.fillStyle=`rgba(0,0,0,${Math.max(0,Math.min(1,this.fadeAlpha))})`;c.fillRect(0,0,this.canvas.width,this.canvas.height);}
    }
    drawWindow(c,s,b){
      const w=s.windowWidth,h=s.windowHeight,open=s.windowOpenness/255;
      if(!w||!h||open<=0)return;
      c.translate(s.x,s.y);c.beginPath();c.rect(0,(1-open)*h/2,w,open*h);c.clip();
      const skin=this.bitmaps.get(s.skin),atlas=skin?.ready?skin.canvas:null;
      if(atlas){
        c.globalAlpha=s.opacity*s.back_opacity/65025;
        if(w>4&&h>4){
          c.drawImage(atlas,0,0,64,64,2,2,w-4,h-4);
          // The 64px windowskin texture tiles at its native size. Keep the
          // individual slices for subpixel placement at interpolation edges.
          const v=s.lastViewport;
          if(!c.isGPU && Number.isInteger(s.x+(v?v.rect[0]-v.ox:0)) && Number.isInteger(s.y+(v?v.rect[1]-v.oy:0))){
            if(skin.windowPatternVersion!==skin.version || !skin.windowPattern){
              const tile=skin.windowTile??(skin.windowTile=this.canvasOf(64,64));
              const ctx=tile.getContext('2d');ctx.clearRect(0,0,64,64);
              ctx.drawImage(atlas,0,64,64,64,0,0,64,64);
              skin.windowPattern=c.createPattern(tile,'repeat');skin.windowPatternVersion=skin.version;
            }
            c.save();c.translate(2,2);c.fillStyle=skin.windowPattern;c.fillRect(0,0,w-4,h-4);c.restore();
          }else{
            for(let y=2;y<h-2;y+=64)for(let x=2;x<w-2;x+=64){
              const rw=Math.min(64,w-2-x),rh=Math.min(64,h-2-y);
              c.drawImage(atlas,0,64,rw,rh,x,y,rw,rh);
            }
          }
        }
        c.globalAlpha=s.opacity/255;
        this.drawSlices(c,atlas,64,0,64,16,0,0,w,h,false);
      }
      if(open<1)return;
      c.save();c.beginPath();c.rect(s.padding,s.padding,Math.max(0,w-2*s.padding),Math.max(0,h-s.padding-s.padding_bottom));c.clip();
      const x=s.padding-s.ox,y=s.padding-s.oy;
      if(atlas&&s.cursor&&s.cursor[2]>0&&s.cursor[3]>0){
        c.globalAlpha=.78;this.drawSlices(c,atlas,64,64,32,2,x+s.cursor[0],y+s.cursor[1],s.cursor[2],s.cursor[3],true);
      }
      c.globalAlpha=s.contents_opacity/255;c.drawImage(b.canvas,x,y);c.restore();
      if(atlas&&s.pause){
        const frame=s.lastArrow;
        c.globalAlpha=1;c.drawImage(atlas,96+16*(frame%2),64+16*(frame>>1),16,16,(w-16)/2,h-16,16,16);
      }
    }
    drawSlices(c,img,sx,sy,size,border,x,y,w,h,center){
      const bx=Math.min(border,w/2),by=Math.min(border,h/2);
      const src=[0,border,size-border,size],dx=[0,bx,w-bx,w],dy=[0,by,h-by,h];
      for(let j=0;j<3;j++)for(let i=0;i<3;i++){
        if(!center&&i===1&&j===1)continue;
        if(dx[i+1]>dx[i]&&dy[j+1]>dy[j])c.drawImage(img,sx+src[i],sy+src[j],src[i+1]-src[i],src[j+1]-src[j],x+dx[i],y+dy[j],dx[i+1]-dx[i],dy[j+1]-dy[j]);
      }
    }
    drawTiles(id,lowId,highId,ox,oy,frame,visible,sheetIds){
      const tiles=this.tilemaps.get(id);
      if(!tiles)return;
      tiles.lastDraw=[id,lowId,highId,ox,oy,frame,visible,sheetIds];
      const low=this.bitmaps.get(lowId),high=this.bitmaps.get(highId);
      if(!visible || !tiles.map || !low || !high)return;
      if(tiles.sheetIds!==sheetIds){
        tiles.sheetIds=sheetIds;tiles.ids=sheetIds.split(',').map(Number);
      }
      const sources=tiles.ids.map(sheet=>this.bitmaps.get(sheet));
      if(!tiles.chunks?.matches(tiles,sources)){
        tiles.chunks?.dispose();tiles.chunks=new TileChunks(this,tiles,sources);
      }
      tiles.chunks.draw(low,high,ox,oy,frame);
    }
    setVolume(percent){
      this.volumePercent=Math.max(0,Math.min(100,percent));
      if(this.masterGain)this.masterGain.gain.setTargetAtTime(this.volumePercent/100,this.audioContext.currentTime,0.015);
    }
    unlockAudio(){
      const AudioContext=root.AudioContext || root.webkitAudioContext;
      if(!AudioContext)return;
      if(!this.audioContext){
        this.audioContext=new AudioContext();
        this.masterGain=this.audioContext.createGain();
        this.masterGain.gain.value=this.volumePercent/100;
        this.masterGain.connect(this.audioContext.destination);
      }
      if(this.audioContext.state==='suspended')this.audioContext.resume().catch(console.warn);
    }
    stopChannel(slot,ms=0){
      for(const voice of this.channels.get(slot)||[]){
        const now=this.audioContext.currentTime, end=now+Math.max(0,ms)/1000;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);
        voice.gain.gain.linearRampToValueAtTime(0,end);
        voice.node.stop(end);
      }
    }
    async audio(kind,action,name,volume=100,pitch=100,position=0){
      const slot=String(kind).toLowerCase();
      let generation=this.audioGeneration.get(slot)||0;
      if(action!=='play' || slot!=='se')this.audioGeneration.set(slot,++generation);
      if(action!=='play'){this.stopChannel(slot,action==='fade'?volume:0);return;}
      const src=this.getProject()?.source, ctx=this.audioContext;
      if(!src || !ctx || !name)return;
      const base=String(name).replace(/\\/g,'/').replace(/^Audio\/(BGM|BGS|ME|SE)\//i,'');
      const file=[base,...['ogg','m4a','mp3','wav'].map(ext=>base+'.'+ext)]
        .map(n=>'Audio/'+slot.toUpperCase()+'/'+n).find(key=>src.has(key));
      if(!file)return;
      const bytes=await src.read(file,64*1024*1024);
      const buffer=await ctx.decodeAudioData(bytes.slice().buffer);
      if(generation!==(this.audioGeneration.get(slot)||0))return;
      if(slot!=='se')this.stopChannel(slot);
      const node=ctx.createBufferSource(),gain=ctx.createGain();
      node.buffer=buffer;node.loop=slot==='bgm'||slot==='bgs';
      node.playbackRate.value=Math.max(0.01,pitch/100);
      gain.gain.value=Math.max(0,Math.min(1,volume/100));
      node.connect(gain);gain.connect(this.masterGain);
      const voices=this.channels.get(slot)||new Set(),voice={node,gain};
      this.channels.set(slot,voices);voices.add(voice);
      node.onended=()=>{voices.delete(voice);node.disconnect();gain.disconnect();};
      const offset=Math.max(0,position/1000);
      node.start(0,node.loop?offset%buffer.duration:Math.min(offset,buffer.duration));
    }
    reset(){
      for(const slot of ['bgm','bgs','me','se']){
        this.audioGeneration.set(slot,(this.audioGeneration.get(slot)||0)+1);
        this.stopChannel(slot);
      }
      for(const tiles of this.tilemaps.values())tiles.chunks?.dispose();
      this.tilemaps.clear();this.viewports.clear();this.bitmaps.clear();this.sprites.clear();this.fadeAlpha=0;this.gpu?.dispose();
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      this.repaint=true;this.presentationVersion++;
      if(this.visibleSprites)this.visibleSprites.length=0;
    }
  }
  root.VX=root.VX||{};root.VX.RGSS3Display=RGSS3Display;
  if(typeof module!=='undefined')module.exports={RGSS3Display};
})(typeof window!=='undefined'?window:globalThis);
