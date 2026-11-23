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
onkeydown=e=>{if((e.key==="Enter"&&e.target.closest?.(".volume"))||!active||!keys[e.key])return;e.preventDefault();heldKeys.add(keys[e.key]);};
onkeyup=e=>heldKeys.delete(keys[e.key]);
onblur=()=>heldKeys.clear();
for(const b of document.querySelectorAll('[data-key]')){
 b.onpointerdown=e=>{e.preventDefault();
 b.setPointerCapture(e.pointerId);heldKeys.add(b.dataset.key);};
 b.onlostpointercapture=b.onpointerup=b.onpointercancel=()=>heldKeys.delete(b.dataset.key);
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
 if(scene.message_window?.pause){heldKeys.add('ok');setTimeout(()=>heldKeys.delete('ok'),100);}
};

for(const [button,step] of [['quieter',-10],['louder',10]]){
 el(button).onclick=e=>{
  display.setVolume(display.volumePercent+step);
  el('volume-level').value=display.volumePercent+'%';
  if(active&&e.detail>0)el('screen').focus();
 };
}
