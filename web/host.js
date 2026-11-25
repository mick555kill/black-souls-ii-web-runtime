let nextGraphicsId=1;
const heldKeys=new Set(),pointerPresses=new Set();let lastKeys=new Set(),sampledKeys=new Set(),heldFrames=new Map();
// VX Ace event command 111 stores button IDs, while game scripts use symbols.
const eventButtons={2:'DOWN',4:'LEFT',6:'RIGHT',8:'UP',11:'A',12:'B',13:'C',14:'X',15:'Y',16:'Z',17:'L',18:'R'};
const inputNames={DOWN:'down',LEFT:'left',RIGHT:'right',UP:'up',C:'ok',B:'cancel',A:'shift',SHIFT:'shift',X:'a',Y:'s',Z:'d'};
const directions=[['down',2],['left',4],['right',6],['up',8]];
function inputName(key){
  const name=eventButtons[key] || String(key).toUpperCase();
  return inputNames[name]||name.toLowerCase();
}
function sendRGSS(op,args){ if(globalThis.display)display.handle({op,args}); }
const hostMethods={frame(n){if(globalThis.display)display.frameNumber=n;},
  flash:(type,id,color,duration,start)=>sendRGSS('flash',[type,id,color===Opal.nil?null:color,duration,start]),
  resize:(w,h)=>sendRGSS('resize',[w,h]),
  fade:(alpha,duration)=>sendRGSS('fade',[alpha,duration]),
  inputUpdate(){
    const spare=lastKeys;lastKeys=sampledKeys;sampledKeys=spare;
    sampledKeys.clear();
    for(const key of heldKeys)sampledKeys.add(key);
    for(const key of pointerPresses)sampledKeys.add(key);
    pointerPresses.clear();
    for(const key of sampledKeys)heldFrames.set(key,(heldFrames.get(key)||0)+1);
    for(const key of heldFrames.keys())if(!sampledKeys.has(key))heldFrames.delete(key);
  },
  inputPress:key=>sampledKeys.has(inputName(key)),
  inputTrigger:key=>sampledKeys.has(inputName(key))&&!lastKeys.has(inputName(key)),
  inputRepeat:key=>{
    const n=heldFrames.get(inputName(key))||0;
    return n===1||(n>=24&&n%6===0);
  },
  inputDir4(){for(const [name,d] of directions)if(sampledKeys.has(name))return d;return 0;},
  audio:(...args)=>sendRGSS('audio',args),
  bitmapCreate(w,h){const id=nextGraphicsId++;sendRGSS('bitmap-create',[id,w,h]);return id;},
  bitmapLoad(name){const id=nextGraphicsId++;sendRGSS('bitmap-load',[id,name]);return id;},
  bitmapDispose:id=>sendRGSS('bitmap-dispose',[id]),
  bitmapCopy:(...a)=>sendRGSS('bitmap-copy',a),
  bitmapHue:(...a)=>sendRGSS('bitmap-hue',a),
  bitmapRadialBlur:(...args)=>sendRGSS('bitmap-radial-blur',args),
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
  spriteSet(id,key,value){
    const d=globalThis.display;
    if(d?.setSprite){
      const sprite=d.sprites.get(id);if(sprite)d.setSprite(sprite,key,value);
    }else sendRGSS('sprite-set',[id,key,value]);
  },
  spriteDispose:id=>sendRGSS('sprite-dispose',[id]),
};
globalThis.rgssHost = Object.fromEntries(Object.entries(hostMethods).map(([k,v])=>['$'+k,v]));
Opal.require('corelib/string/unpack');
Opal.require('opal/compiler');
const compiledCodeCache=new Map();
let compiledCodeBytes=0;
Opal.compile=(source,options={})=>{
 if(Object.hasOwn(dynamicMethods,source))return dynamicMethods[source];
 const config={...options,eval:true};
 const plain=Object.values(config).every(v=>v==null||['string','number','boolean'].includes(typeof v)||Array.isArray(v)&&v.every(x=>typeof x==='string'));
 const key=plain?JSON.stringify([String(source),config]):null;
 if(key!==null&&compiledCodeCache.has(key)){
  const hit=compiledCodeCache.get(key);compiledCodeCache.delete(key);compiledCodeCache.set(key,hit);return hit;
 }
 const code=String(Opal.Opal.Compiler.$new(String(source),Opal.hash(config)).$compile());
 if(key!==null){
  const bytes=2*(key.length+code.length),limit=2*1024*1024;
  if(bytes<=limit){
   while(compiledCodeCache.size&&(compiledCodeBytes+bytes>limit||compiledCodeCache.size>=256)){
    const old=compiledCodeCache.keys().next().value;
    compiledCodeBytes-=2*(old.length+compiledCodeCache.get(old).length);compiledCodeCache.delete(old);
   }
   compiledCodeCache.set(key,code);compiledCodeBytes+=bytes;
  }
 }
 return code;
};
const binaryMinus=Opal.rb_minus;
Opal.rb_minus=function(left,right){return arguments.length===1?left['$-@']():binaryMinus(left,right);};
rgssHost.$tileCells=function(id,kind,w,h,d,cells){
 const raw=new Uint8Array(20+2*cells.length), v=new DataView(raw.buffer);
 [3,w,h,d,cells.length].forEach((n,i)=>v.setInt32(i*4,n,true));
 cells.forEach((n,i)=>v.setInt16(20+2*i,n,true));
 sendRGSS('tile-table',[id,kind,raw]);
};

rgssHost.$windowCursor=(...args)=>sendRGSS('window-cursor',args);
