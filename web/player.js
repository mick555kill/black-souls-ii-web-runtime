'use strict';
const el=id=>document.getElementById(id);
let project,scene,active=false,frameTime=0;
globalThis.display=new VX.RGSS3Display(el('screen'),()=>project);
hostMethods.resize(Opal.Graphics.$width(),Opal.Graphics.$height());
function errorMessage(error){
 active=false;el('status').classList.add('error');el('status').textContent='หยุดที่ '+(scene?.$$class?.$$name||'เริ่มต้น')+' · '+String(error.message||error);
 console.error(error);
}
async function loadMapData(id){
 const key='data/map'+String(id).padStart(3,'0')+'.rvdata2';
 if(!database.has(key))database.set(key,rubyValue(await project.loadMap(id)));
}
function tick(t){
 if(!active)return;
 try{
  if(t-frameTime>=15){
   frameTime=t;const current=Opal.SceneManager.$scene();
   if(current===Opal.nil){active=false;el('status').textContent='จบการทำงาน';return;}
   if(current!==scene){
    if(scene){scene.$pre_terminate();scene.$terminate();}
    scene=current;scene.$start();scene.$post_start();

   }
   scene.$update();display.render();
   const map=Opal.gvars.game_map, id=map?.$map_id?.();
   el('status').textContent=scene.$$class.$$name+(id?' · Map '+id+' · '+project.mapName(id):'');
  }
  requestAnimationFrame(tick);
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
  project=await new VX.Project(source).initialize();await prepareDatabase(project);
  Opal.DataManager.$init();Opal.SceneManager.$goto(Opal.SceneManager.$first_scene_class());
  display.enabled=true;active=true;el('picker').hidden=true;document.body.classList.add('playing');el('screen').focus();requestAnimationFrame(tick);
 }catch(e){el('folder').disabled=false;errorMessage(e);}
};
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
 if(key===undefined)pointers.delete(id);
 else pointers.set(id,key);
 syncKey(old);
 syncKey(key);
}
onkeydown=e=>{
 const key=keys[e.key];
 if(!active || !key || (e.key==='Enter' && e.target.closest?.('.volume')))return;
 e.preventDefault();keyboard.set(e.code,key);syncKey(key);
};
onkeyup=e=>{
 const key=keyboard.get(e.code);
 keyboard.delete(e.code);syncKey(key);
};
function releaseControls(){
 pointers.clear();keyboard.clear();heldKeys.clear();
 for(const button of padButtons)button.classList.remove('pressed');
}
onblur=releaseControls;
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseControls()});
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
 if(!active||!scene)return;
 const bounds=e.currentTarget.getBoundingClientRect();
 const px=(e.clientX-bounds.left)*display.canvas.width/bounds.width;
 const py=(e.clientY-bounds.top)*display.canvas.height/bounds.height;
 const windows=[scene.message_window?.choice_window,...Object.values(scene)];
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
