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
      this.fadeAlpha=0;this.enabled=false;
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
      this.bitmaps.set(id,{canvas,ctx:canvas.getContext('2d'),width:w,height:h,ready:true,pending:[]});
    }
    async loadBitmap(id,path,rgssBitmap){
      const project=this.getProject();
      if(!project)return;
      const match=/^(?:Graphics\/)?([^/]+)\/(.+?)(?:\.(?:png|jpe?g))?$/i.exec(String(path));
      if(!match)return;
      const image=await project.image(match[1],match[2]);
      if(!image)return;
      if(!this.bitmaps.has(id))return;
      const bitmap=this.bitmaps.get(id);
      const cv=this.canvasOf(image.width,image.height);
      cv.getContext('2d').drawImage(image,0,0);
      bitmap.canvas=cv;bitmap.ctx=cv.getContext('2d');bitmap.width=image.width;bitmap.height=image.height;
      if(rgssBitmap){rgssBitmap.width=image.width;rgssBitmap.height=image.height;}
      bitmap.ready=true;
      for(const operation of bitmap.pending.splice(0))operation();
      if(this.enabled)this.render();
    }
    handle({op,args=[]}){
      switch(op){
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
          this.loadBitmap(id,path,args[2]).catch(e=>console.warn('Bitmap load:',e)).finally(()=>{
            if(!this.bitmaps.has(id))return;
            if(!bitmap.ready){bitmap.ready=true;for(const draw of bitmap.pending.splice(0))draw();}
          });
          return;
        }
        case 'bitmap-dispose':this.bitmaps.delete(args[0]);return;
        case 'bitmap-snapshot':{
          const b=this.bitmaps.get(args[0]);
          if(b){this.render();b.ctx.drawImage(this.canvas,0,0);}
          return;
        }
        case 'bitmap-blur':{
          const b=this.bitmaps.get(args[0]);if(!b)return;
          const copy=this.canvasOf(b.width,b.height);
          copy.getContext('2d').drawImage(b.canvas,0,0);
          b.ctx.save();b.ctx.clearRect(0,0,b.width,b.height);b.ctx.filter='blur(1px)';
          b.ctx.drawImage(copy,0,0);b.ctx.restore();return;
        }
        case 'bitmap-clear-rect':{
          const [id,x,y,w,h]=args;this.bitmaps.get(id)?.ctx.clearRect(x,y,w,h);return;
        }
        case 'bitmap-clear':{
          const b=this.bitmaps.get(args[0]);if(b)b.ctx.clearRect(0,0,b.width,b.height);return;
        }
        case 'bitmap-fill':{
          const [id,x,y,w,h,color]=args,b=this.bitmaps.get(id);
          if(b){b.ctx.fillStyle=String(color);b.ctx.fillRect(x,y,w,h);}return;
        }
        case 'bitmap-gradient':{
          const [id,x,y,w,h,color1,color2,vertical]=args,b=this.bitmaps.get(id);
          if(b){const gradient=b.ctx.createLinearGradient(x,y,x+(vertical?0:w),y+(vertical?h:0));
            gradient.addColorStop(0,String(color1));gradient.addColorStop(1,String(color2));
            b.ctx.fillStyle=gradient;b.ctx.fillRect(x,y,w,h);}return;
        }
        case 'bitmap-text':{
          const [id,x,y,w,h,text,align,font,size,color]=args,b=this.bitmaps.get(id);
          if(b){
            b.ctx.fillStyle=String(color);b.ctx.font=`${size||24}px ${JSON.stringify(String(font||'Arial'))}`;
            b.ctx.textBaseline='middle';b.ctx.textAlign=align===1?'center':align===2?'right':'left';
            b.ctx.fillText(String(text),x+(align===1?w/2:align===2?w:0),y+h/2,w);
          }return;
        }
        case 'bitmap-blt':{
          const [id,x,y,source,sx,sy,w,h,opacity]=args,b=this.bitmaps.get(id),src=this.bitmaps.get(source);
          if(b&&src){const draw=()=>{b.ctx.save();b.ctx.globalAlpha=(opacity??255)/255;b.ctx.drawImage(src.canvas,sx,sy,w,h,x,y,w,h);b.ctx.restore();if(this.enabled)this.render();};
            if(src.ready)draw();else src.pending.push(draw);}return;
        }
        case 'bitmap-stretch-blt':{
          const [id,x,y,w,h,source,sx,sy,sw,sh,opacity]=args,b=this.bitmaps.get(id),src=this.bitmaps.get(source);
          if(b&&src){const draw=()=>{b.ctx.save();b.ctx.globalAlpha=(opacity??255)/255;b.ctx.drawImage(src.canvas,sx,sy,sw||src.width,sh||src.height,x,y,w,h);b.ctx.restore();if(this.enabled)this.render();};
            if(src.ready)draw();else src.pending.push(draw);}return;
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
        case 'sprite-crop':{
          const sprite=this.sprites.get(args[0]);if(sprite)sprite.crop=args.slice(1);return;
        }
        case 'sprite-create':this.sprites.set(args[0],{x:0,y:0,z:0,ox:0,oy:0,visible:true,opacity:255,zoom_x:1,zoom_y:1,bitmap:-1,viewport:-1,crop:null,angle:0,mirror:false,window:false,windowWidth:0,windowHeight:0,windowOpenness:255});return;
        case 'sprite-set':{
          const [id,key,value]=args,s=this.sprites.get(id);
          if(s&&Object.prototype.hasOwnProperty.call(s,String(key))){s[String(key)]=value;if(key==='bitmap')s.crop=null;}
          return;
        }
        case 'sprite-dispose':this.sprites.delete(args[0]);return;
        case 'audio':this.audio(...args).catch(e=>console.warn('RGSS3 audio:',e.message));return;
        default:console.warn('Unknown RGSS3 display command:',op);
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
      const c=this.ctx;c.clearRect(0,0,this.canvas.width,this.canvas.height);
      const layer=s=>this.viewports.get(s.viewport)?.z ?? s.z;
      const sprites=[...this.sprites.values()].sort((a,b)=>layer(a)-layer(b)||a.z-b.z||a.y-b.y);
      for(const s of sprites){
        const b=this.bitmaps.get(s.bitmap);
        if(!b||!s.visible||Number(s.opacity)<=0)continue;
        const viewport=this.viewports.get(s.viewport);
        if(s.viewport!==-1 && !viewport?.visible)continue;
        c.save();
        if(viewport){
          const [vx,vy,vw,vh]=viewport.rect;
          c.beginPath();c.rect(vx,vy,vw,vh);c.clip();c.translate(vx-viewport.ox,vy-viewport.oy);
        }
        c.globalAlpha=Math.max(0,Math.min(1,Number(s.opacity)/255))*(s.window?Math.max(0,Math.min(1,s.windowOpenness/255)):1);
        const x=(Number(s.x)||0)-(Number(s.ox)||0),y=(Number(s.y)||0)-(Number(s.oy)||0);
        if(s.window){
          c.fillStyle='rgba(10,15,30,0.83)';c.fillRect(x,y,s.windowWidth,s.windowHeight);
          c.strokeStyle='rgba(220,225,255,0.85)';c.lineWidth=2;c.strokeRect(x+1,y+1,Math.max(0,s.windowWidth-2),Math.max(0,s.windowHeight-2));
        }
        const [sx,sy,w,h]=s.crop || [0,0,b.width,b.height];
        if(w>0 && h>0 && s.zoom_x && s.zoom_y){
          if(s.angle || s.mirror){
            c.translate(s.x,s.y);c.rotate(-s.angle*Math.PI/180);c.scale(s.mirror?-1:1,1);
          }
          const left=(s.angle||s.mirror?0:s.x)-s.ox*s.zoom_x+(s.window?12:0);
          const top=(s.angle||s.mirror?0:s.y)-s.oy*s.zoom_y+(s.window?12:0);
          if(s.crop)c.drawImage(b.canvas,sx,sy,w,h,left,top,w*s.zoom_x,h*s.zoom_y);
          else c.drawImage(b.canvas,left,top,w*s.zoom_x,h*s.zoom_y);
        }
        c.restore();
      }
      if(this.fadeAlpha){c.fillStyle=`rgba(0,0,0,${Math.max(0,Math.min(1,this.fadeAlpha))})`;c.fillRect(0,0,this.canvas.width,this.canvas.height);}
    }
    drawTiles(id,lowId,highId,ox,oy,frame,visible,sheetIds){
      const tiles=this.tilemaps.get(id),low=this.bitmaps.get(lowId),high=this.bitmaps.get(highId);
      if(!tiles?.map || !low || !high || !visible)return;
      const sheets=sheetIds.split(',').map(id=>this.bitmaps.get(Number(id))).map(b=>b?.ready?b.canvas:null);
      const cache=new Map();
      for(const target of [low,high])target.ctx.clearRect(0,0,target.width,target.height);
      const {map,flags}=tiles;
      for(let y=Math.max(0,Math.floor(oy/32));y<Math.min(map.height,Math.ceil((oy+low.height)/32));y++){
        for(let x=Math.max(0,Math.floor(ox/32));x<Math.min(map.width,Math.ceil((ox+low.width)/32));x++){
          const dx=x*32-ox,dy=y*32-oy;
          for(let z=0;z<Math.min(3,map.depth);z++){
            const tile=map.at(x,y,z);if(!tile)continue;
            if(!cache.has(tile))cache.set(tile,root.VX.Autotile.compose(tile,sheets,frame,(w,h)=>this.canvasOf(w,h)));
            const image=cache.get(tile);
            if(image)((flags?.at(tile)&16)?high:low).ctx.drawImage(image,dx,dy);
          }
          const shadow=map.at(x,y,3)&15;
          if(shadow){low.ctx.fillStyle='rgba(0,0,0,.5)';
            for(let i=0;i<4;i++)if(shadow&(1<<i))low.ctx.fillRect(dx+(i%2)*16,dy+(i>>1)*16,16,16);}
        }
      }
    }
    unlockAudio(){
      const AudioContext=root.AudioContext || root.webkitAudioContext;
      if(!AudioContext)return;
      this.audioContext ??= new AudioContext();
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
      node.connect(gain);gain.connect(ctx.destination);
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
