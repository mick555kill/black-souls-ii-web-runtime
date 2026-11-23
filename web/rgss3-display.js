/* Partial HTML Canvas/Audio implementation for commands from CRuby WASM.
 * The game's existing JS map renderer remains separate and continues to work.
 */
(function(root){
  'use strict';
  class RGSS3Display{
    constructor(canvas,getProject=()=>null){
      this.canvas=canvas;
      this.ctx=canvas.getContext('2d');
      this.getProject=getProject;
      this.bitmaps=new Map();this.sprites=new Map();this.tilemaps=new Map();this.viewports=new Map();this.channels=new Map();this.audioGeneration=new Map();
      this.volumePercent=100;this.fadeAlpha=0;this.enabled=false;
      this.maxBitmapPixels=4096*4096;
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
      this.bitmaps.set(id,{canvas,ctx:canvas.getContext('2d'),width:w,height:h,ready:true,tail:null});
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
      const draw=()=>this.drawBitmap(op,args,b,src);
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
          if(w>0&&h>0&&w<=2048&&h<=2048){this.canvas.width=w;this.canvas.height=h;}
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
          tail.then(()=>{bitmap.ready=true;if(bitmap.tail===tail)bitmap.tail=null;});
          return;
        }
        case 'bitmap-dispose':this.bitmaps.delete(args[0]);return;
        case 'bitmap-snapshot':{
          const b=this.bitmaps.get(args[0]);
          if(b){this.render();b.ctx.drawImage(this.canvas,0,0);}
          return;
        }
        case 'tile-table':{
          const [id,kind,bytes]=args, tilemap=this.tilemaps.get(id)||{};
          tilemap[kind]=new root.VX.RubyTable(bytes);
          this.tilemaps.set(id,tilemap);return;
        }
        case 'tile-draw':this.drawTiles(...args);return;
        case 'tile-dispose':this.tilemaps.delete(args[0]);return;
        case 'viewport-create':
          this.viewports.set(args[0],{ox:0,oy:0,z:0,visible:true,rect:[0,0,this.canvas.width,this.canvas.height]});return;
        case 'viewport-rect':{
          const viewport=this.viewports.get(args[0]);if(viewport)viewport.rect=args.slice(1);return;
        }
        case 'viewport-set':{
          const [id,key,value]=args, viewport=this.viewports.get(id);
          if(viewport && ['ox','oy','z','visible'].includes(key))viewport[key]=value;
          return;
        }
        case 'viewport-dispose':this.viewports.delete(args[0]);return;
        case 'window-cursor':{const s=this.sprites.get(args[0]);if(s)s.cursor=args.slice(1);return;}
        case 'sprite-crop':{
          const sprite=this.sprites.get(args[0]);if(sprite)sprite.crop=args.slice(1);return;
        }
        case 'sprite-create':this.sprites.set(args[0],{x:0,y:0,z:0,ox:0,oy:0,visible:true,opacity:255,zoom_x:1,zoom_y:1,bitmap:-1,viewport:-1,crop:null,angle:0,blend_type:0,plane:false,mirror:false,window:false,windowWidth:0,windowHeight:0,windowOpenness:255,skin:-1,cursor:null,padding:12,padding_bottom:12,contents_opacity:255,back_opacity:192,pause:false});return;
        case 'sprite-set':{
          const [id,key,value]=args,s=this.sprites.get(id);
          if(s&&Object.prototype.hasOwnProperty.call(s,String(key))){s[String(key)]=value;if(key==='bitmap')s.crop=null;}
          return;
        }
        case 'sprite-dispose':this.sprites.delete(args[0]);return;
        case 'audio':this.audio(...args).catch(e=>console.warn('RGSS3 audio:',e.message));return;
        default:if(op.startsWith('bitmap-'))return this.queueBitmap(op,args);
          console.warn('Unknown RGSS3 display command:',op);
      }
    }
    frame(){
      return new Promise(resolve=>{
        const tick=()=>{if(this.enabled)this.render();resolve();};
        if(typeof requestAnimationFrame==='function')requestAnimationFrame(tick);
        else setTimeout(tick,16);
      });
    }
    render(){
      for(const tiles of this.tilemaps.values()){
        if(tiles.loading?.some(bitmap=>bitmap.ready))this.drawTiles(...tiles.lastDraw);
      }
      const c=this.ctx;c.clearRect(0,0,this.canvas.width,this.canvas.height);
      const layer=s=>this.viewports.get(s.viewport)?.z ?? s.z;
      const flashing=t=>t?.flash && (this.frameNumber??0)<t.flash.start+t.flash.duration;
      const strength=f=>Math.min(1,1-((this.frameNumber??0)-f.start)/f.duration);
      const overlays=[...this.viewports.values()].filter(v=>v.visible&&flashing(v)&&v.flash.color).map(v=>({overlay:v,z:v.z,top:true}));
      const sprites=[...this.sprites.values(),...overlays].sort((a,b)=>layer(a)-layer(b)||Number(!!a.top)-Number(!!b.top)||a.z-b.z||a.y-b.y);
      for(const s of sprites){
        if(s.overlay){
          const v=s.overlay;c.save();c.globalAlpha=strength(v.flash);c.fillStyle=v.flash.color;c.fillRect(...v.rect);c.restore();continue;
        }
        const b=this.bitmaps.get(s.bitmap);
        if(!b||!s.visible||(!s.window && Number(s.opacity)<=0))continue;
        const viewport=this.viewports.get(s.viewport);
        if(s.viewport!==-1 && !viewport?.visible || flashing(viewport)&&!viewport.flash.color || flashing(s)&&!s.flash.color)continue;
        c.save();
        if(viewport){
          const [vx,vy,vw,vh]=viewport.rect;
          c.beginPath();c.rect(vx,vy,vw,vh);c.clip();c.translate(vx-viewport.ox,vy-viewport.oy);
        }
        if(s.window){this.drawWindow(c,s,b);c.restore();continue;}
        c.globalAlpha=Math.max(0,Math.min(1,Number(s.opacity)/255));
        if(s.blend_type===1)c.globalCompositeOperation='lighter';
        if(s.plane){
          if(b.ready && s.zoom_x>0 && s.zoom_y>0){
            if(b.patternCanvas!==b.canvas){
              b.pattern=c.createPattern(b.canvas,'repeat');b.patternCanvas=b.canvas;
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
          for(let y=2;y<h-2;y+=64)for(let x=2;x<w-2;x+=64){
            const rw=Math.min(64,w-2-x),rh=Math.min(64,h-2-y);
            c.drawImage(atlas,0,64,rw,rh,x,y,rw,rh);
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
        const frame=Math.floor(performance.now()/140)%4;
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
      const tiles=this.tilemaps.get(id),low=this.bitmaps.get(lowId),high=this.bitmaps.get(highId);
      if(!tiles?.map || !low || !high || !visible)return;
      const sources=sheetIds.split(',').map(id=>this.bitmaps.get(Number(id)));
      tiles.loading=sources.filter(b=>b && !b.ready);
      tiles.lastDraw=tiles.loading.length?[id,lowId,highId,ox,oy,frame,visible,sheetIds]:null;
      const sheets=sources.map(b=>b?.ready?b.canvas:null);
      if(!tiles.sheets || sheets.some((sheet,i)=>sheet!==tiles.sheets[i])){
        tiles.sheets=sheets;tiles.cache=new Map();
      }
      const cache=tiles.cache;
      for(const target of [low,high])target.ctx.clearRect(0,0,target.width,target.height);
      const {map,flags}=tiles;
      for(let y=Math.max(0,Math.floor(oy/32));y<Math.min(map.height,Math.ceil((oy+low.height)/32));y++){
        for(let x=Math.max(0,Math.floor(ox/32));x<Math.min(map.width,Math.ceil((ox+low.width)/32));x++){
          const dx=x*32-ox,dy=y*32-oy;
          for(let z=0;z<Math.min(3,map.depth);z++){
            const tile=map.at(x,y,z);if(!tile)continue;
            const key=tile*3+root.VX.Autotile.phase(tile,frame);
            if(!cache.has(key)){
              if(cache.size>=1024)cache.delete(cache.keys().next().value);
              cache.set(key,root.VX.Autotile.compose(tile,sheets,frame,(w,h)=>this.canvasOf(w,h)));
            }
            const image=cache.get(key);
            if(image)((flags?.at(tile)&16)?high:low).ctx.drawImage(image,dx,dy);
          }
          const shadow=map.at(x,y,3)&15;
          if(shadow){low.ctx.fillStyle='rgba(0,0,0,.5)';
            for(let i=0;i<4;i++)if(shadow&(1<<i))low.ctx.fillRect(dx+(i%2)*16,dy+(i>>1)*16,16,16);}
        }
      }
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
      this.tilemaps.clear();this.viewports.clear();this.bitmaps.clear();this.sprites.clear();this.fadeAlpha=0;
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    }
  }
  root.VX=root.VX||{};root.VX.RGSS3Display=RGSS3Display;
  if(typeof module!=='undefined')module.exports={RGSS3Display};
})(typeof window!=='undefined'?window:globalThis);
