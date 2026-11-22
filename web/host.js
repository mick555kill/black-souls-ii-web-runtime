let nextGraphicsId=1;
const heldKeys=new Set();let lastKeys=new Set(),sampledKeys=new Set(),heldFrames=new Map();
const pendingPresses = new Set();
function pressKey(key) {
  if (!heldKeys.has(key)) pendingPresses.add(key);
  heldKeys.add(key);
}
function clearInput() {
  heldKeys.clear(); pendingPresses.clear();
  lastKeys.clear(); sampledKeys.clear(); heldFrames.clear();
}
let triggeredKeys = new Set();
function inputName(key){
  return ({DOWN:'down',LEFT:'left',RIGHT:'right',UP:'up',C:'ok',B:'cancel',A:'shift',SHIFT:'shift',X:'a',Y:'s',Z:'d'})[String(key).toUpperCase()]||String(key).toLowerCase();
}
function sendRGSS(op,args){ if(globalThis.display)display.handle({op,args}); }
const hostMethods={frame(){},
  resize:(w,h)=>sendRGSS('resize',[w,h]),
  fade:(alpha,duration)=>sendRGSS('fade',[alpha,duration]),
  inputUpdate(){
    lastKeys=sampledKeys;
    triggeredKeys = new Set(pendingPresses);
    sampledKeys=new Set([...heldKeys, ...pendingPresses]);
    pendingPresses.clear();
    for(const key of sampledKeys)heldFrames.set(key,(heldFrames.get(key)||0)+1);
    for(const key of [...heldFrames.keys()])if(!sampledKeys.has(key))heldFrames.delete(key);
  },
  inputPress:key=>sampledKeys.has(inputName(key)),
  inputTrigger:key=>sampledKeys.has(inputName(key))&&(triggeredKeys.has(inputName(key))||!lastKeys.has(inputName(key))),
  inputRepeat:key=>{
    const n=heldFrames.get(inputName(key))||0;
    return n===1||(n>=24&&n%6===0);
  },
  inputDir4(){for(const [name,d] of [['down',2],['left',4],['right',6],['up',8]])if(sampledKeys.has(name))return d;return 0;},
  inputDir8(){
    const x=Number(sampledKeys.has('right'))-Number(sampledKeys.has('left'));
    const y=Number(sampledKeys.has('down'))-Number(sampledKeys.has('up'));
    return x||y ? 5+x-3*y : 0;
  },
  audio:(...args)=>sendRGSS('audio',args),
  bitmapCreate(w,h){const id=nextGraphicsId++;sendRGSS('bitmap-create',[id,w,h]);return id;},
  bitmapLoad(name,bitmap){const id=nextGraphicsId++;sendRGSS('bitmap-load',[id,name,bitmap]);return id;},
  bitmapDispose:id=>sendRGSS('bitmap-dispose',[id]),
  bitmapBlur:id=>sendRGSS('bitmap-blur',[id]),
  bitmapSnapshot:id=>sendRGSS('bitmap-snapshot',[id]),
  bitmapClearRect:(...args)=>sendRGSS('bitmap-clear-rect',args),
  bitmapClear:id=>sendRGSS('bitmap-clear',[id]),
  bitmapFill:(...args)=>sendRGSS('bitmap-fill',args),
  bitmapGradient:(...args)=>sendRGSS('bitmap-gradient',args),
  bitmapText:(...args)=>sendRGSS('bitmap-text',args),
  bitmapBlt:(...args)=>sendRGSS('bitmap-blt',args),
  bitmapStretchBlt:(...args)=>sendRGSS('bitmap-stretch-blt',args),
  tileTable:(id,kind,encoded)=>sendRGSS('tile-table',[id,kind,Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))]),
  tileDraw:(...args)=>sendRGSS('tile-draw',args),
  tileDispose:id=>sendRGSS('tile-dispose',[id]),
  viewportCreate(){const id=nextGraphicsId++;sendRGSS('viewport-create',[id]);return id;},
  viewportRect:(...args)=>sendRGSS('viewport-rect',args),
  viewportSet:(...args)=>sendRGSS('viewport-set',args),
  viewportDispose:id=>sendRGSS('viewport-dispose',[id]),
  spriteCrop:(...args)=>sendRGSS('sprite-crop',args),
  spriteCreate(){const id=nextGraphicsId++;sendRGSS('sprite-create',[id]);return id;},
  spriteSet:(...args)=>sendRGSS('sprite-set',args),
  spriteDispose:id=>sendRGSS('sprite-dispose',[id]),
};
globalThis.rgssHost = Object.fromEntries(Object.entries(hostMethods).map(([k,v])=>['$'+k,v]));
Opal.require('corelib/string/unpack');
Opal.require('opal/compiler');
Opal.compile=(source,options={})=>{
 if(Object.hasOwn(dynamicMethods,source))return dynamicMethods[source];
 return String(Opal.Opal.Compiler.$new(String(source),Opal.hash({...options,eval:true})).$compile());
};
const binaryMinus=Opal.rb_minus;
Opal.rb_minus=function(left,right){return arguments.length===1?left['$-@']():binaryMinus(left,right);};
rgssHost.$tileCells=function(id,kind,w,h,d,cells){
 const raw=new Uint8Array(20+2*cells.length), v=new DataView(raw.buffer);
 [3,w,h,d,cells.length].forEach((n,i)=>v.setInt32(i*4,n,true));
 cells.forEach((n,i)=>v.setInt16(20+2*i,n,true));
 sendRGSS('tile-table',[id,kind,raw]);
};
