/* CRuby WebAssembly worker. Run Ruby off the rendering/UI thread.
 * The bundled runtime is upstream ruby.wasm (MIT), not an RGSS3 implementation.
 */
'use strict';

let vm = null;
let bootPromise = null;
let rgssReady = false;
let activeRubyLoop = false;
let nextGraphicsId = 1;
let nextFrameToken = 1;
const frameWaiters = new Map();
const heldKeys = new Set();
let lastKeys = new Set(), sampledKeys = new Set(), heldFrames = new Map();

function inputName(key){
  return ({DOWN:'down',LEFT:'left',RIGHT:'right',UP:'up',C:'ok',B:'cancel',A:'shift',SHIFT:'shift',X:'a',Y:'s',Z:'d'})[String(key).toUpperCase()]||String(key).toLowerCase();
}
function sendRGSS(op,args){self.postMessage({rgss:{op,args}});}
// JS methods available synchronously from Ruby via `require 'js'`.
// Graphics.update alone is async and yields through vm.evalAsync.
globalThis.__VXRGSS3 = {
  frame(){
    const token=nextFrameToken++;
    return new Promise(resolve=>{
      frameWaiters.set(token,resolve);
      self.postMessage({rgss:{op:'frame',token}});
    });
  },
  resize:(w,h)=>sendRGSS('resize',[w,h]),
  fade:(alpha,duration)=>sendRGSS('fade',[alpha,duration]),
  inputUpdate(){
    lastKeys=sampledKeys;
    sampledKeys=new Set(heldKeys);
    for(const key of sampledKeys)heldFrames.set(key,(heldFrames.get(key)||0)+1);
    for(const key of [...heldFrames.keys()])if(!sampledKeys.has(key))heldFrames.delete(key);
  },
  inputPress:key=>sampledKeys.has(inputName(key)),
  inputTrigger:key=>sampledKeys.has(inputName(key))&&!lastKeys.has(inputName(key)),
  inputRepeat:key=>{
    const n=heldFrames.get(inputName(key))||0;
    return n===1||(n>=24&&n%6===0);
  },
  inputDir4(){for(const [name,d] of [['down',2],['left',4],['right',6],['up',8]])if(sampledKeys.has(name))return d;return 0;},
  audio:(...args)=>sendRGSS('audio',args),
  bitmapCreate(w,h){const id=nextGraphicsId++;sendRGSS('bitmap-create',[id,w,h]);return id;},
  bitmapLoad(name){const id=nextGraphicsId++;sendRGSS('bitmap-load',[id,name]);return id;},
  bitmapDispose:id=>sendRGSS('bitmap-dispose',[id]),
  bitmapClear:id=>sendRGSS('bitmap-clear',[id]),
  bitmapFill:(...args)=>sendRGSS('bitmap-fill',args),
  bitmapGradient:(...args)=>sendRGSS('bitmap-gradient',args),
  bitmapText:(...args)=>sendRGSS('bitmap-text',args),
  bitmapBlt:(...args)=>sendRGSS('bitmap-blt',args),
  bitmapStretchBlt:(...args)=>sendRGSS('bitmap-stretch-blt',args),
  spriteCreate(){const id=nextGraphicsId++;sendRGSS('sprite-create',[id]);return id;},
  spriteSet:(...args)=>sendRGSS('sprite-set',args),
  spriteDispose:id=>sendRGSS('sprite-dispose',[id]),
  // Data is supplied only during rgss-data-load. Ruby Marshal.load consumes
  // this base64 payload and constructs native Ruby RPG::* objects.
  gameDataName:'',
  gameData64:'',
};

function rubyLiteral(value) {
  // IMPORTANT: naive JSON.stringify() makes a Ruby double-quoted string; `#{...}`
  // would be interpolated and evaluated. Base64 keeps source strictly inert.
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `Base64.strict_decode64("${btoa(binary)}").force_encoding("UTF-8")`;
}

async function boot() {
  if (vm) return { version: vm.eval('RUBY_VERSION').toString() };
  if (!bootPromise) {
    bootPromise = (async () => {
      importScripts('../vendor/ruby/browser.umd.js');
      const factory = self['ruby-wasm-wasi']?.DefaultRubyVM;
      if (typeof factory !== 'function') throw Error('CRuby WebAssembly JavaScript adapter missing');
      const wasmUrl = new URL('../vendor/ruby/ruby+stdlib.wasm', self.location.href);
      const response = await fetch(wasmUrl);
      if (!response.ok) throw Error(`WASM download failed: HTTP ${response.status}`);
      // Compile a buffer to avoid requiring application/wasm Content-Type on all hosts.
      const module = await WebAssembly.compile(await response.arrayBuffer());
      const runtime = await factory(module, {consolePrint: false});
      vm = runtime.vm;
      vm.eval('require "base64"');
      return { version: vm.eval('RUBY_VERSION').toString() };
    })().catch(error => {
      bootPromise = null;
      throw error;
    });
  }
  return bootPromise;
}

function compileOne(script) {
  // Compile only. Do NOT run arbitrary game code, which needs missing RGSS3 APIs.
  const expression = `RubyVM::InstructionSequence.compile(${rubyLiteral(script.source)}, ${rubyLiteral(script.name || '(RGSS3)')}); :syntax_ok`;
  return vm.eval(expression).toString();
}

async function installRGSS(){
  if(rgssReady)return {ready:true};
  await boot();
  for(const filename of ['rgss3-bootstrap.rb','rgss3-rpg.rb','../vendor/mkxp-z/rgss3-rpg-classes.rb']){
    const response=await fetch(new URL(filename.startsWith('../')?filename:'./'+filename, self.location.href));
    if(!response.ok)throw Error(`RGSS3 Ruby source ${filename} download failed: HTTP ${response.status}`);
    vm.eval(await response.text());
  }
  rgssReady=true;
  return {ready:true,modules:['Graphics','Input','Audio','Bitmap','Sprite','Window','Viewport','Table','Color','Tone','Rect','RPG::*','RGSSWeb.load_game_data']};
}

const DATASET=/^(Actors|Classes|Skills|Items|Weapons|Armors|Enemies|Troops|States|Animations|Tilesets|CommonEvents|System|MapInfos|Scripts|Map\d{3})$/;
function base64Data(bytes){
  const chunks=[];
  for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  return btoa(chunks.join(''));
}
async function loadData(name,bytes){
  if(!DATASET.test(name))throw Error('Unsupported RGSS3 database name');
  if(!(bytes instanceof Uint8Array))throw Error('Expected Uint8Array .rvdata2 bytes');
  if(bytes.byteLength>64*1024*1024)throw Error('RGSS3 database file exceeds 64 MiB');
  await installRGSS();
  globalThis.__VXRGSS3.gameDataName=name;
  globalThis.__VXRGSS3.gameData64=base64Data(bytes);
  try{return vm.eval('RGSSWeb.load_game_data').toString();}
  finally{
    globalThis.__VXRGSS3.gameData64='';
    globalThis.__VXRGSS3.gameDataName='';
  }
}

self.addEventListener('message', async event => {
  const {id, type, source, entries, name, bytes} = event.data || {};
  if(type==='rgss-input'){
    if(event.data.down)heldKeys.add(String(event.data.key));
    else heldKeys.delete(String(event.data.key));
    return;
  }
  if(type==='rgss-frame-ack'){
    const resolve=frameWaiters.get(event.data.token);
    if(resolve){frameWaiters.delete(event.data.token);resolve(null);}
    return;
  }
  if (!Number.isSafeInteger(id)) return;
  try {
    if(activeRubyLoop)throw Error('Ruby RGSS3 loop is running; wait for the current scene to finish');
    if (type === 'init') {
      const result = await boot();
      self.postMessage({id, ok: true, result});
    } else if (type === 'eval') {
      await boot();
      if (typeof source !== 'string') throw Error('Ruby source must be a string');
      const result = vm.eval(source).toString();
      self.postMessage({id, ok: true, result});
    } else if(type==='rgss-install'){
      self.postMessage({id,ok:true,result:await installRGSS()});
    } else if(type==='rgss-data-load'){
      self.postMessage({id,ok:true,result:await loadData(name,bytes)});
    } else if(type==='rgss-data-clear'){
      await installRGSS();
      vm.eval('RGSSWeb.clear_game_data');
      self.postMessage({id,ok:true,result:{cleared:true}});
    } else if(type==='rgss-load-scripts'){
      // Execute the actual VX Ace definitions in their archive order. This is
      // separate from the entry-point `Main`, whose scene loop never returns.
      await installRGSS();
      if(!Array.isArray(entries) || entries.length>2048)throw Error('Expected up to 2048 RGSS3 script entries');
      const loaded=[];
      const errors=[];
      for(let index=0;index<entries.length;index++){
        const script=entries[index];
        if(typeof script?.source!=='string' || script.source.length>2_000_000)throw Error(`Invalid script at index ${index}`);
        if(script.name==='Main')continue;
        try{
          // The game's A1 legacy compatibility plugin expects VX-style
          // Scene_Title methods which VX Ace's default scripts omit.
          // Define delegates only once Scene_Title has been loaded.
          if(script.name==='A1共通スクリプト'){
            vm.eval(`class Scene_Title
              def load_database; DataManager.load_database; end unless method_defined?(:load_database)
              def create_game_objects; DataManager.create_game_objects; end unless method_defined?(:create_game_objects)
            end`);
          }
          // eval under TOPLEVEL_BINDING so RGSS class/module definitions bind
          // exactly as they do when RGSS executes Scripts.rvdata2.
          vm.eval(`eval(${rubyLiteral(script.source)}, TOPLEVEL_BINDING, ${rubyLiteral(script.name||'RGSS3-'+index)})`);
          loaded.push({index,name:String(script.name||'')});
        }catch(error){
          errors.push({index,name:String(script.name||''),error:String(error.message||error)});
          break;
        }
        if(index%8===7 || index+1===entries.length)
          self.postMessage({id,progress:{checked:index+1,total:entries.length,loaded:loaded.length}});
      }
      self.postMessage({id,ok:true,result:{loaded:loaded.length,total:entries.length,errors}});
    } else if(type==='rgss-run'){
      if(activeRubyLoop)throw Error('A Ruby RGSS game loop is already running');
      if(typeof source!=='string')throw Error('Ruby source must be text');
      await installRGSS();
      activeRubyLoop=true;
      try{
        const result=await vm.evalAsync(source);
        self.postMessage({id,ok:true,result:result.toString()});
      }finally{activeRubyLoop=false;}
    } else if (type === 'compile') {
      await boot();
      if (!Array.isArray(entries)) throw Error('Expected RGSS3 script entries');
      const errors = [];
      for (let index = 0; index < entries.length; index++) {
        const script = entries[index];
        try {
          if (typeof script.source !== 'string') throw Error('Invalid Ruby source');
          compileOne(script);
        } catch (error) {
          errors.push({index, name: String(script.name || ''), error: String(error.message || error)});
        }
        if ((index + 1) % 8 === 0 || index + 1 === entries.length)
          self.postMessage({id, progress: {checked: index + 1, total: entries.length, errors: errors.length}});
      }
      self.postMessage({id, ok: true, result: {total: entries.length, passed: entries.length - errors.length, errors}});
    } else {
      throw Error(`Unknown worker command: ${type}`);
    }
  } catch (error) {
    // Send the JavaScript/WASM stack too; Safari users cannot easily open
    // worker developer tools, and some Ruby stack failures escape evalAsync.
    const message=String(error?.message || error);
    const trace=String(error?.stack || '');
    let rubyTrace='';
    if(vm && /SystemStackError|stack level too deep/.test(message)) {
      try {
        rubyTrace=String(vm.eval(`begin; e=$!; e ? ([e.class.to_s+': '+e.message]+Array(e.backtrace).first(30)).join(' | ') : 'No active Ruby exception'; rescue Exception => x; 'Backtrace unavailable: '+x.class.to_s; end`));
      } catch(traceError) { rubyTrace='Unable to inspect Ruby exception: '+String(traceError?.message || traceError); }
    }
    const details=[message,rubyTrace ? 'Ruby trace: '+rubyTrace : '',trace ? 'Worker trace: '+trace.slice(0,5000) : 'Worker stack not available'].filter(Boolean).join('\n');
    self.postMessage({id, ok: false, error: details});
  }
});
