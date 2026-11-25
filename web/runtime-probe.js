// Opt-in profiler. No network calls, no persistent writes, no changes to game rules.
(function(){
 if(!new URLSearchParams(location.search).has('profile'))return;
 const counts=new Map();
 let started=performance.now(),lastText='';
 function add(name,ms=0,bytes=0){
  let entry=counts.get(name);
  if(!entry){entry={calls:0,ms:0,bytes:0};counts.set(name,entry);}
  entry.calls++;entry.ms+=ms;entry.bytes+=bytes;
 }
 function wrap(obj,key,name,async=false,bytes=null){
  if(!obj||typeof obj[key]!=='function')return;
  const original=obj[key];
  obj[key]=function(...args){
   const start=performance.now();
   if(async){
    let result;
    try{result=original.apply(this,args);}catch(e){add(name,performance.now()-start);throw e;}
    Promise.resolve(result).then(value=>add(name,performance.now()-start,bytes?bytes(value):0),()=>add(name,performance.now()-start));
    return result;
   }
   try{return original.apply(this,args);}finally{add(name,performance.now()-start);}
  };
 }
 const d=globalThis.display;
 wrap(d,'render','Render');
 wrap(d,'drawBitmap','Canvas bitmap operations');
 wrap(d,'drawTiles','Tile chunks');
 wrap(d,'pixel','Pixel reads');
 wrap(d,'loadBitmap','Image load/decode',true);
 wrap(d,'decodeAudio','Audio load/decode',true);
 wrap(Opal,'compile','Ruby compile/cache lookup');
 wrap(VX.RGSS3Archive.prototype,'readPrefix','Archive read + decrypt',true,v=>v?.byteLength||0);
 wrap(VX.FolderSource.prototype,'read','Folder file read',true,v=>v?.byteLength||0);
 wrap(autosave,'write','Autosave',true);
 if(VX.GpuRenderer){
  const g=VX.GpuRenderer.prototype;
  wrap(g,'snapshot','GPU snapshot/readback');
  const original=g.texture;
  g.texture=function(source){
   const entry=this.textures.get(source);
   const upload=!entry||entry.w!==source.width||entry.h!==source.height||entry.dirty;
   if(!upload)return original.call(this,source);
   const start=performance.now();
   try{return original.call(this,source);}
   finally{add('GPU texture upload',performance.now()-start,source.width*source.height*4);}
  };
  wrap(g,'release','GPU texture release');
 }
 const panel=document.createElement('details');
 panel.style.cssText='position:fixed;right:8px;top:8px;z-index:10000;background:#151515ef;color:#fff;border:1px solid #aaa;border-radius:6px;padding:8px;max-width:min(92vw,620px);font:12px monospace;user-select:text;touch-action:auto';
 const heading=document.createElement('summary');heading.textContent='Runtime profiler (5s)';panel.append(heading);
 const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;max-height:48vh;overflow:auto;margin:8px 0';panel.append(pre);
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copy report';copy.onclick=async()=>{try{await navigator.clipboard.writeText(lastText);copy.textContent='Copied';}catch{copy.textContent='Select and copy report';}};panel.append(copy);
 document.body.append(panel);
 const mb=n=>(n/1048576).toFixed(1);
 globalThis.runtimeProbe={
  report(stats){
   const now=performance.now(),seconds=Math.max(0.001,(now-started)/1000);
   const surfaces=new Set();let bitmapBytes=0;
   for(const b of d.bitmaps.values()){
    const s=b.canvas;if(s&&!surfaces.has(s)){surfaces.add(s);bitmapBytes+=s.width*s.height*4;}
   }
   let voices=0;for(const set of d.channels.values())voices+=set.size;
   const lines=[
    'FPS: '+(stats.frames/Math.max(.001,(now-stats.lastReport)/1000)).toFixed(1)+' | scene: '+(Opal.SceneManager.$scene()?.$$class?.$$name||'?'),
    'Renderer: '+d.gpuMode+' '+(d.gpuDevice||''),
    'Logic: '+(stats.updateMs/Math.max(1,stats.frames)).toFixed(2)+' ms/frame | render+filter: '+(stats.renderMs/Math.max(1,stats.frames)).toFixed(2)+' ms/frame | slow frames: '+stats.slowFrames,
    'Bitmap handles: '+d.bitmaps.size+' | surfaces: '+surfaces.size+' | estimated RGBA: '+mb(bitmapBytes)+' MiB',
    'Sprites: '+d.sprites.size+' | GPU textures: '+(d.gpu?.textures.size||0)+' / '+mb(d.gpu?.bytes||0)+' MiB | audio voices: '+voices,
    'Last map data load: '+stats.mapMs.toFixed(1)+' ms | map loads: '+stats.mapLoads,
    'Last destination preload: '+(stats.mapAssetsMs??0).toFixed(1)+' ms | images: '+(stats.mapAssetsCount??0)+' | tile wait: '+d.mapAssetsPending(),
    'Audio cache: '+mb(d.soundBytes)+' MiB | pending audio: '+d.soundPending.size+' | active decode: '+d.audioDecodeActive+' | queued: '+d.audioDecodeQueue.length,
    'Sample '+seconds.toFixed(1)+'s (nested timings overlap; async includes waiting):'
   ];
   for(const [name,v] of [...counts.entries()].sort((a,b)=>b[1].ms-a[1].ms)){
    lines.push(name+': '+v.calls+' calls, '+v.ms.toFixed(1)+' ms'+(v.bytes?' / '+mb(v.bytes)+' MiB':''));
   }
   lastText=lines.join('\n');pre.textContent=lastText;heading.textContent='Runtime profiler | '+(stats.frames/Math.max(.001,(now-stats.lastReport)/1000)).toFixed(0)+' FPS';
   counts.clear();started=now;
   console.info(lastText);
   return lastText;
  }
 };
 globalThis.runtimeReport=()=>lastText;
})();