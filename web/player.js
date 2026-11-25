'use strict';
const el=id=>document.getElementById(id);
const lowPowerMode=new URLSearchParams(location.search).get('perf')==='pi4';
const mapCacheLimit=lowPowerMode?4:8;
const pendingMaps=new Map();
let project,scene,active=false,frameTime=0,animationRequest=null;
let autosaveNoticeTimer;
const profileEnabled=new URLSearchParams(location.search).has('profile');
const perfStats={frames:0,updateMs:0,renderMs:0,slowFrames:0,mapLoads:0,mapMs:0,lastReport:performance.now()};
globalThis.runtimePerf=()=>({...perfStats,renderer:display.gpuMode,bitmaps:display.bitmaps.size,sprites:display.sprites.size,textureBytes:display.gpu?.bytes??0,decodedImageBytes:project?.retainedBytes??0,compiledCodeBytes,mapCache:[...database.keys()].filter(k=>/^data\/map\d+\.rvdata2$/.test(k)).length});
autosave.notify=text=>{
 const notice=el('autosave-status');notice.textContent=text;notice.hidden=false;
 clearTimeout(autosaveNoticeTimer);autosaveNoticeTimer=setTimeout(()=>{notice.hidden=true;},2600);
};
globalThis.display=new VX.RGSS3Display(el('screen'),()=>project);
display.rendererChanged=()=>{
 el('screen').style.opacity=display.gpu?'0':'';
 const status=el('renderer-status');status.textContent=display.gpuMode;status.title=display.gpuDevice||display.gpuMode;
 crt.apply();
};
hostMethods.resize(Opal.Graphics.$width(),Opal.Graphics.$height());
function errorMessage(error){
 active=false;el('status').classList.add('error');el('status').textContent='หยุดที่ '+(scene?.$$class?.$$name||'เริ่มต้น')+' · '+String(error.message||error);
 console.error(error);
}
async function loadMapData(id){
 const key='data/map'+String(id).padStart(3,'0')+'.rvdata2';
 if(database.has(key)){const value=database.get(key);database.delete(key);database.set(key,value);return;}
 if(pendingMaps.has(key))return pendingMaps.get(key);
 const startedAt=performance.now();
 const task=project.loadMap(id).then(map=>{
  if(pendingMaps.get(key)!==task)throw Error('Map load superseded: '+id);
  database.set(key,rubyValue(map));
  perfStats.mapLoads++;perfStats.mapMs=performance.now()-startedAt;
  const current='data/map'+String(Opal.gvars.game_map?.map_id).padStart(3,'0')+'.rvdata2';
  const start='data/map'+String(database.get('data/system.rvdata2').start_map_id).padStart(3,'0')+'.rvdata2';
  const keys=[...database.keys()].filter(k=>/^data\/map\d+\.rvdata2$/.test(k));
  while(keys.length>mapCacheLimit){
   const i=keys.findIndex(k=>k!==key&&k!==current&&k!==start&&!pendingMaps.has(k));
   if(i<0)break;
   database.delete(keys.splice(i,1)[0]);
  }
 }).finally(()=>{if(pendingMaps.get(key)===task)pendingMaps.delete(key);});
 pendingMaps.set(key,task);return task;
}
// Warm the destination's actual tileset and parallax before reserving a transfer.
function travelDeadline(promise,ms,message){
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}
async function loadRequiredMap(id){
 const key='data/map'+String(id).padStart(3,'0')+'.rvdata2';
 const promise=loadMapData(id),pending=pendingMaps.get(key);
 try{await travelDeadline(promise,12000,'Map '+id+' load timed out — retry');}
 catch(error){if(pending&&pendingMaps.get(key)===pending)pendingMaps.delete(key);throw error;}
}
async function prepareMapTransfer(id){
 const started=performance.now();
 await loadRequiredMap(id);
 const map=database.get('data/map'+String(id).padStart(3,'0')+'.rvdata2');
 const tileset=database.get('data/tilesets.rvdata2')?.[map?.tileset_id];
 const names=tileset?.tileset_names;
 const tasks=[];
 if(Array.isArray(names))for(const name of new Set(names))if(typeof name==='string'&&name)tasks.push(project.image('Tilesets',name));
 if(typeof map?.parallax_name==='string'&&map.parallax_name)tasks.push(project.image('Parallaxes',map.parallax_name));
 // File-backed art is optional for the transfer itself. Keep pending image
 // requests alive in Project's cache and allow the map renderer to finish them.
 let assets=[];
 try{assets=await travelDeadline(Promise.all(tasks),1200,'Image preload still running');}
 catch(error){console.info('Map art continues loading:',id,error.message);}
 perfStats.mapAssetsMs=performance.now()-started;perfStats.mapAssetsCount=assets.filter(Boolean).length;
 return assets;
}
// Fast travel is completed by the normal game tick after the destination data
// is ready. Never leave the confirmation inactive waiting for optional artwork.
const shortMoveProto=Opal.Scene_ShortMove?.$$prototype;
const travelNotice=el('travel-status');
function showTravelStatus(message){if(travelNotice){travelNotice.textContent=message;travelNotice.hidden=!message;}}
let mapWaitStart=0;
if(shortMoveProto){
 const originalPopOk=shortMoveProto.$pop_ok;
 shortMoveProto.$pop_ok=function(){
  if(this.browserTravelPending)return Opal.nil;
  if(this.popup_window.$current_ext()!==1)return originalPopOk.call(this);
  const point=this.command_window.$current_ext();
  const id=point['$[]'](0)['$[]'](1)['$[]'](0);
  const state={id,ready:false,error:null,assets:null};
  this.browserTravelPending=state;
  this.popup_window.$deactivate();
  showTravelStatus('กำลังโหลดแผนที่ '+id+'…');
  prepareMapTransfer(id).then(assets=>{state.assets=assets;state.ready=true;},error=>{state.error=error;});
  return Opal.nil;
 };
 shortMoveProto.$browser_finish_travel=function(){
  const state=this.browserTravelPending;
  if(!state)return false;
  if(state.error){
   this.browserTravelPending=null;
   this.popup_window.$activate();
   showTravelStatus('โหลดแผนที่ '+state.id+' ไม่สำเร็จ: '+String(state.error.message||state.error)+' · กดเดินทางอีกครั้ง');
   console.error('Fast travel:',state.error);
   return true;
  }
  if(!state.ready)return true;
  this.browserTravelPending=null;
  showTravelStatus('กำลังเข้าสู่ฉาก '+state.id+'…');
  try{originalPopOk.call(this);}
  catch(error){showTravelStatus('เดินทางไม่สำเร็จ: '+String(error.message||error));throw error;}
  if(Opal.SceneManager.$scene()!==this)showTravelStatus('');
  else{this.popup_window.$activate();showTravelStatus('ยังไม่ได้ย้ายฉาก · ลองกดเดินทางใหม่');}
  return true;
 };
}
function scheduleTick(){
 if(active && !document.hidden && !cheatMenu.open && !el('save-transfer')?.open && animationRequest===null)
  animationRequest=requestAnimationFrame(tick);
}
function pauseTick(){
 if(animationRequest!==null)cancelAnimationFrame(animationRequest);
 animationRequest=null;frameTime=0;
}
function tick(t){
 animationRequest=null;
 if(!active || document.hidden || cheatMenu.open || el('save-transfer')?.open)return;
 try{
  if(t-frameTime>=15){
   frameTime=t;const current=Opal.SceneManager.$scene();
   if(current===Opal.nil){active=false;el('status').textContent='จบการทำงาน';return;}
   if(current!==scene && scene?.browserBattleMessage){
    scene.advanceBrowserBattleMessage();display.render();crt.draw();scheduleTick();return;
   }
   if(current!==scene){
    if(scene){scene.$pre_terminate();scene.$terminate();}
    scene=current;scene.$start();scene.$post_start();
    cheatMenu.hidden=![Opal.Scene_Map,Opal.Scene_Battle].includes(scene.$$class);

   }
   // Direct transfers and restored saves can bypass the event preload.
   // Keep rendering while their map sheets finish, but don't advance map input.
   if(scene.$$class===Opal.Scene_ShortMove&&scene.$browser_finish_travel?.()){
    display.render();crt.draw();scheduleTick();return;
   }
   const pendingArt=scene.$$class===Opal.Scene_Map&&display.mapAssetsPending();
   if(!pendingArt){if(mapWaitStart)showTravelStatus('');mapWaitStart=0;}
   else if(!mapWaitStart){mapWaitStart=t;showTravelStatus('กำลังโหลดภาพฉาก…');}
   const waitForMap=pendingArt&&t-mapWaitStart<8000;
   if(pendingArt&&!waitForMap)showTravelStatus('ภาพฉากยังโหลดอยู่ · เปิดให้เล่นต่อแล้ว');
   if(profileEnabled){
    const u=performance.now();if(!waitForMap)scene.$update();const r=performance.now();display.render();crt.draw();const done=performance.now();
    perfStats.frames++;perfStats.updateMs+=r-u;perfStats.renderMs+=done-r;if(done-u>16.67)perfStats.slowFrames++;
    if(done-perfStats.lastReport>=5000){
     if(globalThis.runtimeProbe)runtimeProbe.report(perfStats);else console.info('Runtime profile',globalThis.runtimePerf());
     perfStats.frames=perfStats.updateMs=perfStats.renderMs=perfStats.slowFrames=0;perfStats.lastReport=done;
    }
   }else{if(!waitForMap)scene.$update();display.render();crt.draw();}
   if(!waitForMap)autosave.update(scene,t);
  }
  scheduleTick();
 }catch(e){errorMessage(e);}
}
el('folder').onchange=async e=>{
 const files=[...e.target.files];if(!files.length)return;
 try{
  el('folder').disabled=true;el('status').textContent='กำลังอ่านฐานข้อมูลเกม…';
  display.unlockAudio();
  const game=files.find(f=>/^Game\.rgss3a$/i.test(f.name));
  if(!game)throw Error('ไม่พบ Game.rgss3a ในโฟลเดอร์ที่เลือก');
  const archive=await VX.RGSS3Archive.open(game),folder=new VX.FolderSource(files);
  await indexImageSizes(archive,folder);
  const source=new VX.CompositeSource([folder,new VX.ArchiveSource(archive)]);
  project=new VX.Project(source,{retainImages:true});await Promise.all([prepareDatabase(project),autosave.prepare(),document.fonts?.load('18px "Game Thai"','ภาษาไทย').catch(()=>{})]);
  Opal.DataManager.$init();Opal.SceneManager.$goto(Opal.SceneManager.$first_scene_class());
  display.enabled=true;
  if(new URLSearchParams(location.search).get('renderer')==='canvas2d')display.fallbackGpu('เลือกผ่านลิงก์');
  else display.enableGpu(el('gpu-screen'));
  active=true;el('picker').hidden=true;document.body.classList.add('playing');el('screen').focus();scheduleTick();
 }catch(e){el('folder').disabled=false;errorMessage(e);}
};
document.addEventListener('game-language-change',()=>{
 if(!active||!scene)return;
 const msg=scene.message_window;
 if(msg?.name_windows){msg.$dispose_name_window();msg.$create_name_window();}
 for(const win of Object.values(scene)){
  if(win===msg||!win?.$$class||!Opal.is_a(win,Opal.Window_Base)||!win.visible)continue;
  if(typeof win.$refresh==='function'&&!win.$refresh.$$stub&&win.$$class!==Opal.Window_ScrollText)win.$refresh();
 }
 if(cheatMenu.open)populateCheatItems();
});
const keys={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'ok',z:'ok',Escape:'cancel',x:'cancel',Shift:'shift'};
const pointers=new Map(), keyboard=new Map();
const padButtons=[...document.querySelectorAll('.pad [data-key]')];


function syncKey(key){
 if(!key)return;
 const touched=[...pointers.values()].includes(key);
 if(touched || [...keyboard.values()].includes(key))heldKeys.add(key);
 else heldKeys.delete(key);
 padButtons.find(button=>button.dataset.key===key)?.classList.toggle('pressed',touched);
}
function setPointer(id,key){
 const old=pointers.get(id);
 if(key&&old!==key)pointerPresses.add(key);
 if(key===undefined)pointers.delete(id);
 else pointers.set(id,key);
 syncKey(old);
 syncKey(key);
}
onkeydown=e=>{
 const key=keys[e.key],settings=e.target.closest?.('.pad-settings');
 if(!active || !key || cheatMenu.open || el('save-transfer')?.open || e.target.closest?.('.cheats') || (settings && (settings.open || e.key==='Enter')) || (e.key==='Enter' && e.target.closest?.('.volume')))return;
 e.preventDefault();keyboard.set(e.code,key);syncKey(key);
};
onkeyup=e=>{
 const key=keyboard.get(e.code);
 keyboard.delete(e.code);syncKey(key);
};
function releaseControls(){
 pointers.clear();keyboard.clear();heldKeys.clear();pointerPresses.clear();
 for(const button of padButtons)button.classList.remove('pressed');
}
onblur=releaseControls;
function leavePage(){pauseTick();releaseControls();if(active)autosave.update(scene,performance.now(),true);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)leavePage();else scheduleTick();});
window.addEventListener('pagehide',leavePage);
window.addEventListener('pageshow',scheduleTick);
// A native long-press menu or selection can interrupt a held game input on iPad.
for(const eventName of ['contextmenu','selectstart']){
 document.addEventListener(eventName,event=>{
  if(!document.body.classList.contains('playing'))return;
  if(event.target.closest?.('input,textarea,[contenteditable=true]'))return;
  event.preventDefault();
 });
}
const dpad=document.querySelector('.directions');
function directionAt(e){
 const rect=dpad.getBoundingClientRect();
 const x=2*(e.clientX-rect.left)/rect.width-1;
 const y=2*(e.clientY-rect.top)/rect.height-1;
 const distance=Math.hypot(x,y);
 if(distance<.22 || distance>1)return null;
 if(Math.abs(x)>Math.abs(y))return x<0?'left':'right';
 return y<0?'up':'down';
}
function pressControl(control,e,key){
 if(e.button!==0)return;
 e.preventDefault();control.setPointerCapture(e.pointerId);setPointer(e.pointerId,key);
}
function releasePointer(e){setPointer(e.pointerId,undefined)}
dpad.onpointerdown=e=>pressControl(dpad,e,directionAt(e));
dpad.onpointermove=e=>{
 if(pointers.has(e.pointerId))setPointer(e.pointerId,directionAt(e));
};
dpad.onlostpointercapture=dpad.onpointerup=dpad.onpointercancel=releasePointer;
for(const button of document.querySelectorAll('.actions [data-key]')){
 button.onpointerdown=e=>pressControl(button,e,button.dataset.key);
 button.onlostpointercapture=button.onpointerup=button.onpointercancel=releasePointer;
}
el('screen').onpointerdown=e=>{
 if(!active||!scene||el('save-transfer')?.open)return;
 if(scene.browserBattleMessage){
  heldKeys.add('ok');setTimeout(()=>syncKey('ok'),100);return;
 }
 const bounds=e.currentTarget.getBoundingClientRect();
 const [u,v]=crt.sourcePoint((e.clientX-bounds.left)/bounds.width,(e.clientY-bounds.top)/bounds.height);
 const px=u*display.canvas.width,py=v*display.canvas.height;
 const msg=scene.message_window,number=msg?.number_window;
 if(number?.active&&number['$open?']()){
  const col=Math.floor((px-number.x-number.padding)/20),row=py-number.y-number.padding;
  if(col>=0&&col<number.digits_max&&row>=0&&row<number.$line_height()){
   number.index=col;number.$update_cursor();
  }
  return;
 }
 const windows=[msg?.choice_window,msg?.item_window,...Object.values(scene)];
 for(const w of windows){
  if(!w?.active||typeof w.$item_rect!=='function'||!w.visible||!w['$open?']())continue;
  const vp=display.viewports.get(display.sprites.get(w.id)?.viewport);
  const x=px-w.x-w.padding+w.ox-(vp?vp.rect[0]-vp.ox:0);
  const y=py-w.y-w.padding+w.oy-(vp?vp.rect[1]-vp.oy:0);
  if(x<w.ox||y<w.oy||x>=w.ox+w.width-w.padding*2||y>=w.oy+w.height-w.padding-w.padding_bottom)continue;
  for(let i=0;i<w.$item_max();i++){
   const r=w.$item_rect(i);
   if(x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height){
    w.$select(i);w.$process_ok();return;
   }
  }
 }
 if(scene.message_window?.pause){heldKeys.add('ok');setTimeout(()=>syncKey('ok'),100);}
};

for(const [button,step] of [['quieter',-10],['louder',10]]){
 el(button).onclick=e=>{
  display.setVolume(display.volumePercent+step);
  el('volume-level').value=display.volumePercent+'%';
  if(active&&e.detail>0)el('screen').focus();
 };
}
