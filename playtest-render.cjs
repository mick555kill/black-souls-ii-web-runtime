// Run with node playtest-render.cjs [reference Git revision]. No game archive is required.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');

// Check the final display pass separately from snapshots, which stay at RGSS resolution.
function checkUpscale(gpu) {
  const assert=(ok,why)=>{if(!ok)throw Error(why);};
  const gl=gpu.gl, filter=gpu.presenter, w=24, h=16;
  const texels=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const bright=(y===2||x>=6&&x<=18&&y>=5&&x-6<=y-5);
    texels.set(bright?[245,225,150,255]:[18,36,70,255],(y*w+x)*4);
  }
  const source=gpu.newTexture(gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,texels);
  let version=0;
  function sample(factor,crt){
    filter.configure(crt,factor,43,29,1);
    filter.draw(source,w,h,++version);
    const ow=gl.drawingBufferWidth,oh=gl.drawingBufferHeight,bytes=new Uint8Array(ow*oh*4);
    gl.readPixels(0,0,ow,oh,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    return {ow,oh,bytes,red:(x,y)=>bytes[((oh-y-1)*ow+x)*4]};
  }
  function distinct(a,b){return a.bytes.some((c,i)=>Math.abs(c-b.bytes[i])>1);}
  try{
    const original=sample(1,false);
    assert(original.ow===w && original.oh===h && original.red(1,2)===245,'native presentation or orientation');
    const filtered=[],withCrt=[];
    for(const factor of [2,4,16,32]){
      const frame=sample(factor,false),combined=sample(factor,true);
      assert(frame.ow===43&&frame.oh===29,'incorrect visible raster at '+factor);
      assert(frame.red(2,1)===18 && frame.red(2,4)===245,'flat colour or single-pixel line changed at '+factor);
      assert(frame.bytes.some((c,i)=>i%4===0&&c>20&&c<240),'diagonals were scaled with nearest neighbour at '+factor);
      assert(distinct(frame,combined),'CRT missing at '+factor);
      for(const old of filtered)assert(distinct(old,frame),'upscale grids produced identical edges at '+factor);
      for(const old of withCrt)assert(distinct(old,combined),'CRT ignored upscale factor '+factor);
      filtered.push(frame);withCrt.push(combined);
    }
    const plainCrt=sample(1,true);
    assert(distinct(plainCrt,withCrt[3]),'upscale did not compose with CRT');
    const back=sample(1,false);
    assert(!distinct(back,original),'switching off changed native pixels');
    assert(filter.programs.size===4,'unexpected shader recompilation');
    const huge=VX.ScreenFilter.raster(640,480,32,false,7680,5760,3,2048);
    assert(huge.w*huge.h<=2800000&&huge.w<=2048&&huge.h<=2048,'unbounded 32x allocation');
    const twice=VX.ScreenFilter.raster(320,240,2,false,1920,1440,1,4096);
    assert(twice.w===640&&twice.h===480,'2x exceeded selected scale');
    return filtered.length;
  }finally{gl.deleteTexture(source);}
}

async function checkRenderer(ReferenceDisplay,requireGpu) {
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const samePixels=(a,b,message)=>{
    const read=cv=>new Uint32Array(cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data.buffer);
    const l=read(a),r=read(b);
    assert(l.length===r.length,message+' dimensions');
    for(let i=0;i<l.length;i++)if(l[i]!==r[i])throw Error(message+' at '+i%a.width+','+Math.floor(i/a.width));
  };
  function table(w,h,d,cell){
    const bytes=new Uint8Array(20+2*w*h*d),v=new DataView(bytes.buffer);
    [3,w,h,d,w*h*d].forEach((n,i)=>v.setInt32(4*i,n,true));
    for(let z=0;z<d;z++)for(let y=0;y<h;y++)for(let x=0;x<w;x++)
      v.setInt16(20+2*(x+w*(y+h*z)),cell(x,y,z),true);
    return bytes;
  }
  const cooperate=()=>requireGpu?Promise.resolve():new Promise(r=>setTimeout(r,0));
  const map=table(64,27,4,(x,y,z)=>{
    if(z===3)return (x+y)%5===1?9:0;
    if(z===2)return (2*x+y)%9===0?9:0;
    if(z===1)return (x+y)%6===0?23:0;
    if((x+y)%15===3)return 2048;
    if((x+y)%17===5)return 2048+5*48;
    return (x+y)%5===0?2816:1536+(x+y)%4;
  });
  const flags=table(8192,1,1,t=>t===9?16:0);
  const cx=(w,h)=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;};
  const command=(d,op,...args)=>d.handle({op,args});
  const set=(d,id,key,value)=>command(d,'sprite-set',id,key,value);
  const sheetList='1,2,3,4,5,6,7,8,9';
  function fixture(Type){
    const d=new Type(cx(544,416));
    for(let id=1;id<=9;id++){
      command(d,'bitmap-create',id,512,384);
      const c=d.bitmaps.get(id).ctx;
      for(let y=0;y<24;y++)for(let x=0;x<32;x++){
        c.fillStyle='rgb('+((x*29+id*37)%255)+','+((y*41+id*13)%255)+','+((x*7+y*19)%255)+')';
        c.fillRect(x*16,y*16,16,16);
      }
    }
    command(d,'tile-table',50,'map',map);command(d,'tile-table',50,'flags',flags);
    command(d,'bitmap-create',40,544,416);command(d,'bitmap-create',41,544,416);
    command(d,'bitmap-create',42,32,32);command(d,'bitmap-fill',42,0,0,32,32,'#dd5511');
    command(d,'viewport-create',80);
    for(const [id,bitmap,z] of [[60,40,0],[61,41,200],[62,42,10]]){
      command(d,'sprite-create',id);set(d,id,'bitmap',bitmap);set(d,id,'z',z);set(d,id,'viewport',80);
    }
    set(d,62,'x',96);set(d,62,'y',72);
    return d;
  }
  const draw=(d,x,y,frame)=>{command(d,'tile-draw',50,40,41,x,y,frame,true,sheetList);return d.render();};
  const next=fixture(VX.RGSS3Display),prev=ReferenceDisplay?fixture(ReferenceDisplay):null;
  const hardware=fixture(VX.RGSS3Display),output=cx(544,416),pixels=cx(544,416);
  const gpu=hardware.enableGpu(output,{allowSoftware:true});
  console.log('Canvas fixture ready, WebGL active:',gpu);
  assert(gpu||!requireGpu,'WebGL test backend unavailable');
  const pair=[next,...(prev?[prev]:[]),...(gpu?[hardware]:[])];
  let comparisons=0,gpuComparisons=0;
  function compare(label){
    if(prev){samePixels(next.canvas,prev.canvas,label);comparisons++;}
    if(!gpu)return;
    assert(hardware.gpu,'unexpected GPU fallback during '+label);
    const w=next.canvas.width,h=next.canvas.height;
    if(pixels.width!==w)pixels.width=w;if(pixels.height!==h)pixels.height=h;
    const ctx=pixels.getContext('2d');hardware.gpu.snapshot(ctx);
    const a=ctx.getImageData(0,0,w,h).data,b=next.ctx.getImageData(0,0,w,h).data;
    let total=0,edges=0;
    for(let i=0;i<a.length;i+=4){
      let max=Math.abs(a[i+3]-b[i+3]);total+=max;
      for(let k=0;k<3;k++){
        const diff=Math.abs(a[i+k]*a[i+3]-b[i+k]*b[i+3])/255;
        total+=diff;max=Math.max(max,diff);
      }
      if(max>8)edges++;
    }
    // Different rasterizers cover subpixel edges differently. Integer tile scenes
    // must match throughout, including animation seams and the map boundary.
    const tile=label==='first frame'||label.startsWith('scroll ')||label.startsWith('water/waterfall');
    assert(total/a.length<1.25 && edges<=(tile?0:w*h*.003),label+' GPU diff '+total/a.length+' / '+edges+' pixels');
    gpuComparisons++;
  }
  function step(label,x,y,frame){for(const d of pair)draw(d,x,y,frame);compare(label);}
  step('first frame',0,0,0);
  assert(next.render()===false,'idle frame repainted');
  for(const [x,y,f] of [[-17,-11,0],[31,7,0],[248,31,1],[255,36,2],[256,45,3],[289,254,4],[289,255,5],[289,256,6],[1504,450,10],[2019,852,11],[1900,799,0],[25,0,7]]){
    step('scroll '+[x,y,f],x,y,f);await cooperate();
  }
  for(let f=0;f<12;f++){step('water/waterfall '+f,2,18,f);await cooperate();}
  console.log('Scrolling and animated tile pixels matched');
  for(const d of pair){
    command(d,'viewport-rect',80,10,6,420,315);command(d,'viewport-set',80,'ox',17);
    command(d,'sprite-crop',62,1,2,12,17);set(d,62,'zoom_x',2);
  }
  step('viewport/crop',35,15,6);
  assert(next.render()===false,'stable crop repainted');
  for(const d of pair){set(d,62,'x',1000);d.render();}
  compare('offscreen');set(next,62,'x',1001);
  assert(next.render()===false,'offscreen change repainted');
  for(const d of pair){
    set(d,62,'x',100);set(d,62,'angle',25);set(d,62,'mirror',true);
    command(d,'flash','Sprite',62,'rgba(240,80,20,.7)',3,20);
  }
  for(let f=20;f<=24;f++){for(const d of pair){d.frameNumber=f;d.render();}compare('flash '+f);await cooperate();}
  for(const color of ['rgba(255,127,30,.6)',null]){
    for(const d of pair)command(d,'flash','Viewport',80,color,2,30);
    for(let f=30;f<=32;f++){for(const d of pair){d.frameNumber=f;d.render();}compare('viewport flash '+f);await cooperate();}
  }
  for(const d of pair){command(d,'fade',.51);d.render();}compare('fade');
  for(const d of pair){
    command(d,'fade',0);set(d,62,'angle',0);set(d,62,'mirror',false);
    command(d,'bitmap-fill',42,0,0,18,23,'#42c001');d.render();
  }
  compare('edited visible sprite');
  for(const d of pair){
    command(d,'bitmap-create',43,108,56);command(d,'bitmap-fill',43,5,5,37,19,'#55bbaa');
    command(d,'sprite-create',63);set(d,63,'window',true);set(d,63,'bitmap',43);set(d,63,'skin',6);
    set(d,63,'z',300);set(d,63,'windowWidth',140);set(d,63,'windowHeight',80);
    command(d,'window-cursor',63,3,4,30,22);d.render();
  }
  compare('window/contents/cursor');
  for(const d of pair){
    command(d,'bitmap-clear-rect',6,0,64,64,64);command(d,'bitmap-fill',6,7,68,30,40,'rgba(30,200,97,.5)');
    set(d,63,'opacity',141);set(d,63,'windowWidth',360);d.render();
  }
  compare('translucent repeated windowskin');
  for(const d of pair){set(d,63,'x',9.5);d.render();}compare('fractional window');
  for(const d of pair){set(d,63,'x',10);set(d,63,'back_opacity',70);d.render();}compare('skin opacity');
  for(const d of pair){set(d,63,'windowOpenness',85);d.render();}compare('window closing');
  for(const d of pair){set(d,63,'visible',false);d.render();}compare('hide');
  for(const d of pair){command(d,'sprite-dispose',62);d.render();}compare('dispose');
  for(const d of pair){command(d,'tile-table',50,'flags',table(8192,1,1,t=>t===23?16:0));}
  step('changed priorities',4,3,4);
  for(const d of pair){command(d,'tile-table',50,'map',table(2,3,4,(x,y,z)=>z===0?1536:0));}
  step('smaller map',-4,-5,3);
  for(const d of pair){command(d,'resize',400,300);d.render();}compare('resize');
  if(gpu){
    command(hardware,'bitmap-snapshot',42);
    assert(hardware.bitmaps.get(42).ctx.getImageData(24,14,1,1).data[3]>0,'native snapshot missing map');
    hardware.fallbackGpu('test');hardware.render();samePixels(hardware.canvas,next.canvas,'context fallback');
    assert(hardware.enableGpu(output,{allowSoftware:true}),'GPU could not resume');hardware.render();compare('resume GPU');
  }
  command(next,'bitmap-fill',5,0,0,32,32,'#112233');next.render();
  const ground=next.bitmaps.get(40).ctx.getImageData(12,13,1,1).data;
  assert(ground[0]===17 && ground[1]===34 && ground[2]===51,'edited tilesheet left stale pixels');
  const delayed=cx(64,64),dc=delayed.getContext('2d');dc.fillStyle='#aa7722';dc.fillRect(0,0,64,64);
  let resolveImage;
  next.getProject=()=>({image:()=>new Promise(resolve=>{resolveImage=resolve;})});
  command(next,'bitmap-load',5,'Tilesets/late');
  next.render();resolveImage(delayed);await next.bitmaps.get(5).tail;next.render();
  assert(next.bitmaps.get(40).ctx.getImageData(12,13,1,1).data[0]===170,'late tile sheet left stale pixels');
  if(gpu){
    const tile=fixture(VX.RGSS3Display);tile.enableGpu(cx(544,416),{allowSoftware:true});
    const gl=tile.gpu.gl,stats={drawArrays:0,texImage2D:0,texSubImage2D:0,readPixels:0},orig={};
    draw(tile,1,1,0);
    for(const key of Object.keys(stats)){orig[key]=gl[key];gl[key]=function(...args){stats[key]++;return orig[key].apply(this,args);};}
    try{
      for(let i=2;i<22;i++)draw(tile,i,1,0);
      assert(stats.drawArrays>20,'no direct GL draw calls while scrolling');
      assert(!stats.texImage2D&&!stats.texSubImage2D&&!stats.readPixels,'warmed walk transferred pixels: '+JSON.stringify(stats));
      const count=stats.drawArrays;tile.render();assert(count===stats.drawArrays,'idle frame rerendered with GL');
    }finally{for(const key of Object.keys(stats))gl[key]=orig[key];tile.gpu.dispose();}
  }
  console.log('Window, snapshot and texture checks finished');
  async function measure(Type) {
    const d=fixture(Type);draw(d,0,0,0);
    let count=0;
    const contexts=new Set([Object.getPrototypeOf(d.ctx),Object.getPrototypeOf(d.bitmaps.get(40).ctx)]);
    const originals=[];
    for(const proto of contexts){
      const original=proto.drawImage;originals.push([proto,original]);
      proto.drawImage=function(...args){count++;return original.apply(this,args);};
    }
    const frames=160;
    const walk=()=>{for(let i=1;i<=frames;i++)draw(d,i*4,(i>>2)*2,Math.floor(i/30)%12);};
    let walkCalls,staticCalls;
    try{
      walk();walkCalls=count;
      count=0;for(let i=0;i<60;i++)d.render();staticCalls=count;
    }finally{for(const [proto,original] of originals)proto.drawImage=original;}
    // Time a warmed route with native drawImage restored, including the final raster flush.
    const times=[];
    for(let run=0;run<3;run++){
      await cooperate();
      draw(d,0,0,0);d.ctx.getImageData(0,0,1,1);
      const start=performance.now();
      walk();d.ctx.getImageData(0,0,1,1);
      times.push((performance.now()-start)/frames);
    }
    times.sort((a,b)=>a-b);d.reset();
    return {frames,walkDrawsPerFrame:walkCalls/frames,staticDrawsPerFrame:staticCalls/60,walkMsPerFrame:times[1]};
  }
  const before=ReferenceDisplay?await measure(ReferenceDisplay):null,after=await measure(VX.RGSS3Display);
  assert(after.walkDrawsPerFrame<80,'walking draw count regressed');
  assert(after.staticDrawsPerFrame===0,'static scene draws every frame');
  return {pixelComparisons:comparisons,gpuComparisons,upscales:gpu?checkUpscale(hardware.gpu):0,before,after};
}

async function checkFilterControls(context){
  const tab=await context.newPage(),url=require('node:url').pathToFileURL(path.join(__dirname,'index.html')).href;
  try{
    await tab.goto(url);
    const menu=tab.locator('.pad-settings summary'),level=tab.getByLabel('อัปสเกลภาพ');
    await menu.tap();
    if(await level.inputValue()!=='1')throw Error('First visit should use native resolution');
    await level.selectOption('32');await tab.reload();
    if(await level.inputValue()!=='32')throw Error('Upscale preference did not survive reload');
    await tab.evaluate(()=>{
      // Exercise the public Canvas fallback on devices without any WebGL context.
      const output=document.getElementById('crt-screen');
      const native=output.getContext.bind(output);
      output.getContext=(kind,...options)=>kind==='webgl'?null:native(kind,...options);
      display.enabled=true;
      display.ctx.fillStyle='#00bb88';display.ctx.fillRect(0,0,display.canvas.width,display.canvas.height);
      display.presentationVersion++;
      crt.apply();
    });
    const fallback=await tab.evaluate(()=>{
      const scaled=document.getElementById('scale-screen'),c=scaled.getContext('2d');
      const rgba=Array.from(c.getImageData(1,1,1,1).data);
      if(scaled.hidden||rgba.join(',')!=='0,187,136,255')throw Error('Canvas upscale did not display the source');
      const position=crt.sourcePoint(.23,.76);
      if(position[0]!==.23||position[1]!==.76)throw Error('Upscaling moved the touch coordinates');
      let paints=0;const draw=c.drawImage;c.drawImage=function(...args){paints++;return draw.apply(this,args);};
      try{crt.draw();crt.draw();}finally{c.drawImage=draw;}
      if(paints)throw Error('Idle Canvas fallback kept painting');
      const status=document.getElementById('filter-status');
      return !status.hidden && status.textContent.includes(scaled.width+' × '+scaled.height) && status.textContent.includes('Canvas 2D');
    });
    if(!fallback)throw Error('Canvas fallback mode missing');
    if(!await level.isVisible())await menu.tap();
    await level.selectOption('1');
    if(!await tab.locator('#scale-screen').isHidden())throw Error('Native presentation was not restored');
    await tab.evaluate(()=>localStorage.setItem('bs2.upscale','3'));
    await tab.reload();
    if(await level.inputValue()!=='1')throw Error('Unknown scale should restore native size');
    await tab.evaluate(()=>localStorage.removeItem('bs2.upscale'));
    return {persisted:true,canvasFallback:true,idleSkipped:true};
  }finally{await tab.close();}
}

// Exercise the actual page controls and frame loop with a minimal scene and
// deterministic frame delivery. The user's game archive stays on their device.
async function checkPlayer(context){
  const tab=await context.newPage(),errors=[];
  tab.on('pageerror',err=>errors.push(String(err)));
  await tab.goto(require('node:url').pathToFileURL(path.join(__dirname,'index.html')).href);
  await tab.evaluate(()=>{
    const nativeRequest=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window);
    const queue=new Map();let serial=0,updates=0,hidden=false,saves=0;
    window.requestAnimationFrame=cb=>{
      if(cb!==tick)return nativeRequest(cb);
      const id=--serial;queue.set(id,cb);return id;
    };
    window.cancelAnimationFrame=id=>id<0?queue.delete(id):nativeCancel(id);
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    const minimal={$$class:Opal.Scene_Base,$update(){Opal.Graphics.$update();Opal.Input.$update();updates++;}};
    Opal.SceneManager.$scene=()=>minimal;scene=minimal;Opal.gvars.data_items=[];
    const autosaveUpdate=autosave.update;
    autosave.update=function(...args){if(args[2])saves++;return autosaveUpdate.apply(this,args);};
    active=true;el('picker').hidden=true;document.body.classList.add('playing');cheatMenu.hidden=false;scheduleTick();
    window.checkLoop={
      get count(){return queue.size;},
      pulse(t){
        if(queue.size!==1)throw Error('Expected one game callback, got '+queue.size);
        const list=[...queue.values()];queue.clear();for(const cb of list)cb(t);
        if(el('status').classList.contains('error'))throw Error(el('status').textContent);
        return updates;
      },
      hide(value){hidden=value;document.dispatchEvent(new Event('visibilitychange'));},
      get saves(){return saves;}
    };
  });
  const immediate=await tab.evaluate(()=>{
    const summary=document.querySelector('.pad-settings summary');summary.focus();
    const press=type=>summary.dispatchEvent(new KeyboardEvent(type,{key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true}));
    press('keydown');const down=heldKeys.has('right');press('keyup');
    return down&&!heldKeys.has('right');
  });
  if(!immediate)throw Error('Closing settings swallowed the next movement key');
  await tab.locator('.actions [data-key=ok]').tap();
  const tap=await tab.evaluate(()=>{checkLoop.pulse(20);const first=hostMethods.inputTrigger('C');checkLoop.pulse(40);return first&&!hostMethods.inputPress('C');});
  if(!tap)throw Error('Touch confirmation did not trigger and release');
  await tab.locator('#cheats summary').tap();
  await tab.waitForFunction(()=>checkLoop.count===0);
  await tab.locator('#cheats summary').tap();
  await tab.waitForFunction(()=>checkLoop.count===1);
  const resumed=await tab.evaluate(()=>{
    checkLoop.pulse(60);checkLoop.hide(true);
    if(checkLoop.count!==0||checkLoop.saves!==1)return false;
    window.dispatchEvent(new Event('pageshow'));
    if(checkLoop.count!==0)return false;
    checkLoop.hide(false);window.dispatchEvent(new Event('pageshow'));
    return checkLoop.pulse(5000)===4 && checkLoop.count===1;
  });
  if(!resumed)throw Error('Menu or visibility pause/resume failed');
  if(errors.length)throw Error(errors.join('\n'));
  await tab.close();return {touchTap:true,menuResume:true,visibilityResume:true};
}

async function run(){
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bs2-canvas-'));
try{
  const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
  const reference=process.argv[2];
  const old=reference?execFileSync('git',['show',reference+':web/rgss3-display.js'],{cwd:__dirname,encoding:'utf8'}):'';
  const scripts=[read('web/marshal.js'),read('web/autotile.js'),old,
    'const reference=window.VX.RGSS3Display;',read('web/screen-filter.js'),read('web/gpu-renderer.js'),read('web/rgss3-display.js'),
    checkUpscale.toString(), '('+checkRenderer.toString()+')(reference,'+(process.env.BROWSER_ENGINE!=='webkit')+').then(value=>finish({ok:true,...value}),err=>finish({ok:false,error:String(err.stack||err)}));'];
  const source=scripts.map((code,i)=>{
    fs.writeFileSync(path.join(dir,'test-'+i+'.js'),code);
    return '<script src="test-'+i+'.js"></script>';
  });
  const page=path.join(dir,'test.html');
  fs.writeFileSync(page,'<meta charset="utf-8"><pre id="result">pending</pre><script>function finish(v){document.getElementById("result").textContent=JSON.stringify(v);}</script>'+source.join(''));
  const url=require('node:url').pathToFileURL(page).href;
  let result;
  if(process.env.BROWSER_ENGINE==='webkit'){
    const {webkit}=require('playwright'),browser=await webkit.launch({headless:!process.env.DISPLAY});
    try{
      const context=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:1024,height:768},deviceScaleFactor:2});
      const tab=await context.newPage();
      tab.on('pageerror',err=>console.error(err));tab.on('console',msg=>console.log(msg.text()));
      await tab.goto(url,{waitUntil:'commit'});
      await tab.waitForFunction(()=>{const el=document.getElementById('result');return el&&el.textContent!=='pending';},null,{polling:200,timeout:90000});
      result=JSON.parse(await tab.locator('#result').textContent());
      if(result.ok){result.filters=await checkFilterControls(context);result.player=await checkPlayer(context);}
    }finally{await browser.close();}
  }else{
    const chrome=process.env.CHROME_BIN||'google-chrome';
    const html=execFileSync(chrome,['--headless','--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage',
      '--disable-background-networking','--allow-file-access-from-files','--user-data-dir='+path.join(dir,'profile'),'--dump-dom',
      url],{encoding:'utf8',timeout:85000,stdio:['ignore','pipe','pipe']});
    const raw=html.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    if(!raw||raw==='pending')throw Error('Chromium did not complete the renderer checks');
    result=JSON.parse(raw.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'));
  }
  if(!result.ok)throw Error(result.error);
  console.log(JSON.stringify(result,null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
run().catch(err=>{console.error(err);process.exitCode=1;});
