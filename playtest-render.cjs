// Run with node playtest-render.cjs [reference Git revision]. No game archive is required.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');

async function checkRenderer(ReferenceDisplay) {
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
  const pair=prev?[next,prev]:[next];
  let comparisons=0;
  function compare(label){if(prev){samePixels(next.canvas,prev.canvas,label);comparisons++;}}
  function step(label,x,y,frame){for(const d of pair)draw(d,x,y,frame);compare(label);}
  step('first frame',0,0,0);
  assert(next.render()===false,'idle frame repainted');
  for(const [x,y,f] of [[-17,-11,0],[31,7,0],[248,31,1],[255,36,2],[256,45,3],[289,254,4],[289,255,5],[289,256,6],[1504,450,10],[2019,852,11],[1900,799,0],[25,0,7]]){
    step('scroll '+[x,y,f],x,y,f);
  }
  for(let f=0;f<12;f++)step('water/waterfall '+f,2,18,f);
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
  for(let f=20;f<=24;f++){for(const d of pair){d.frameNumber=f;d.render();}compare('flash '+f);}
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
  for(const d of pair){set(d,63,'windowOpenness',85);d.render();}compare('window closing');
  for(const d of pair){set(d,63,'visible',false);d.render();}compare('hide');
  for(const d of pair){command(d,'sprite-dispose',62);d.render();}compare('dispose');
  for(const d of pair){command(d,'tile-table',50,'flags',table(8192,1,1,t=>t===23?16:0));}
  step('changed priorities',4,3,4);
  for(const d of pair){command(d,'tile-table',50,'map',table(2,3,4,(x,y,z)=>z===0?1536:0));}
  step('smaller map',-4,-5,3);
  for(const d of pair){command(d,'resize',400,300);d.render();}compare('resize');
  command(next,'bitmap-fill',5,0,0,32,32,'#112233');next.render();
  const ground=next.bitmaps.get(40).ctx.getImageData(12,13,1,1).data;
  assert(ground[0]===17 && ground[1]===34 && ground[2]===51,'edited tilesheet left stale pixels');
  const delayed=cx(64,64),dc=delayed.getContext('2d');dc.fillStyle='#aa7722';dc.fillRect(0,0,64,64);
  let resolveImage;
  next.getProject=()=>({image:()=>new Promise(resolve=>{resolveImage=resolve;})});
  command(next,'bitmap-load',5,'Tilesets/late');
  next.render();resolveImage(delayed);await next.bitmaps.get(5).tail;next.render();
  assert(next.bitmaps.get(40).ctx.getImageData(12,13,1,1).data[0]===170,'late tile sheet left stale pixels');
  function measure(Type) {
    const d=fixture(Type);draw(d,0,0,0);
    let count=0;
    const contexts=new Set([Object.getPrototypeOf(d.ctx),Object.getPrototypeOf(d.bitmaps.get(40).ctx)]);
    const originals=[];
    for(const proto of contexts){
      const original=proto.drawImage;originals.push([proto,original]);
      proto.drawImage=function(...args){count++;return original.apply(this,args);};
    }
    try{
      const frames=160,start=performance.now();
      for(let i=1;i<=frames;i++)draw(d,i*4,(i>>2)*2,Math.floor(i/30)%12);
      const walk=count,elapsed=performance.now()-start;
      count=0;for(let i=0;i<60;i++)d.render();
      return {frames,walkDrawsPerFrame:walk/frames,staticDrawsPerFrame:count/60,walkMsPerFrame:elapsed/frames};
    }finally{for(const [proto,original] of originals)proto.drawImage=original;}
  }
  const before=ReferenceDisplay?measure(ReferenceDisplay):null,after=measure(VX.RGSS3Display);
  assert(after.walkDrawsPerFrame<80,'walking draw count regressed');
  assert(after.staticDrawsPerFrame===0,'static scene draws every frame');
  return {pixelComparisons:comparisons,before,after};
}

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bs2-canvas-'));
try{
  const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
  const reference=process.argv[2];
  const old=reference?execFileSync('git',['show',reference+':web/rgss3-display.js'],{cwd:__dirname,encoding:'utf8'}):'';
  const scripts=[read('web/marshal.js'),read('web/autotile.js'),old,
    'const reference=window.VX.RGSS3Display;',read('web/rgss3-display.js'),
    '('+checkRenderer.toString()+')(reference).then(value=>finish({ok:true,...value}),err=>finish({ok:false,error:String(err.stack||err)}));'];
  const source=scripts.map((code,i)=>{
    fs.writeFileSync(path.join(dir,'test-'+i+'.js'),code);
    return '<script src="test-'+i+'.js"></script>';
  });
  const page=path.join(dir,'test.html');
  fs.writeFileSync(page,'<meta charset="utf-8"><pre id="result">pending</pre><script>function finish(v){document.getElementById("result").textContent=JSON.stringify(v);}</script>'+source.join(''));
  const chrome=process.env.CHROME_BIN||'google-chrome';
  const html=execFileSync(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--allow-file-access-from-files','--user-data-dir='+path.join(dir,'profile'),'--dump-dom',
    require('node:url').pathToFileURL(page).href],{encoding:'utf8',timeout:85000,stdio:['ignore','pipe','pipe']});
  const raw=html.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
  if(!raw||raw==='pending')throw Error('Chromium did not complete the renderer checks');
  const result=JSON.parse(raw.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'));
  if(!result.ok)throw Error(result.error);
  console.log(JSON.stringify(result,null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
