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
      this.bitmaps=new Map();this.sprites=new Map();this.channels=new Map();
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
    async loadBitmap(id,path){
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
          this.loadBitmap(id,path).catch(e=>console.warn('Bitmap load:',e)).finally(()=>{
            if(!this.bitmaps.has(id))return;
            if(!bitmap.ready){bitmap.ready=true;for(const draw of bitmap.pending.splice(0))draw();}
          });
          return;
        }
        case 'bitmap-dispose':this.bitmaps.delete(args[0]);return;
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
        case 'sprite-create':this.sprites.set(args[0],{x:0,y:0,z:0,ox:0,oy:0,visible:true,opacity:255,zoom_x:1,zoom_y:1,bitmap:-1,window:false,windowWidth:0,windowHeight:0,windowOpenness:255});return;
        case 'sprite-set':{
          const [id,key,value]=args,s=this.sprites.get(id);
          if(s&&Object.prototype.hasOwnProperty.call(s,String(key)))s[String(key)]=value;
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
      const sprites=[...this.sprites.values()].sort((a,b)=>(a.z||0)-(b.z||0));
      for(const s of sprites){
        const b=this.bitmaps.get(s.bitmap);
        if(!b||!s.visible||Number(s.opacity)<=0)continue;
        c.save();c.globalAlpha=Math.max(0,Math.min(1,Number(s.opacity)/255))*(s.window?Math.max(0,Math.min(1,s.windowOpenness/255)):1);
        const x=(Number(s.x)||0)-(Number(s.ox)||0),y=(Number(s.y)||0)-(Number(s.oy)||0);
        if(s.window){
          c.fillStyle='rgba(10,15,30,0.83)';c.fillRect(x,y,s.windowWidth,s.windowHeight);
          c.strokeStyle='rgba(220,225,255,0.85)';c.lineWidth=2;c.strokeRect(x+1,y+1,Math.max(0,s.windowWidth-2),Math.max(0,s.windowHeight-2));
        }
        c.drawImage(b.canvas,x+(s.window?12:0),y+(s.window?12:0),b.width*(Number(s.zoom_x)||1),b.height*(Number(s.zoom_y)||1));
        c.restore();
      }
      if(this.fadeAlpha){c.fillStyle=`rgba(0,0,0,${Math.max(0,Math.min(1,this.fadeAlpha))})`;c.fillRect(0,0,this.canvas.width,this.canvas.height);}
    }
    async audio(kind,action,name,volume=100,pitch=100,position=0){
      const slot=String(kind).toLowerCase();
      if(action!=='play'){
        const old=this.channels.get(slot);if(old){old.media.pause();URL.revokeObjectURL(old.url);this.channels.delete(slot);}return;
      }
      const project=this.getProject(),src=project?.source;
      if(!src)return;
      let bytes=null,ext='';
      for(const suffix of ['ogg','m4a','mp3','wav']){
        const key=`Audio/${slot.toUpperCase()}/${name}.${suffix}`;
        if(src.has(key)){bytes=await src.read(key,32*1024*1024);ext=suffix;break;}
      }
      if(!bytes)return;
      const old=this.channels.get(slot);if(old){old.media.pause();URL.revokeObjectURL(old.url);}
      const types={ogg:'audio/ogg',m4a:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav'};
      const url=URL.createObjectURL(new Blob([bytes],{type:types[ext]}));
      const media=new Audio(url);media.volume=Math.max(0,Math.min(1,volume/100));
      media.playbackRate=Math.max(0.5,Math.min(2,pitch/100));media.loop=slot==='bgm'||slot==='bgs';
      media.currentTime=Math.max(0,Number(position)/1000||0);
      this.channels.set(slot,{media,url});
      media.play().catch(()=>{});
    }
    reset(){
      for(const channel of this.channels.values()){channel.media.pause();URL.revokeObjectURL(channel.url);}
      this.channels.clear();this.bitmaps.clear();this.sprites.clear();this.fadeAlpha=0;
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    }
  }
  root.VX=root.VX||{};root.VX.RGSS3Display=RGSS3Display;
  if(typeof module!=='undefined')module.exports={RGSS3Display};
})(typeof window!=='undefined'?window:globalThis);
