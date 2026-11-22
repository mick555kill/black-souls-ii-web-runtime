'use strict';
const el=id=>document.getElementById(id);
let project,scene,active=false,frameTime=0;
globalThis.display=new VX.RGSS3Display(el('screen'),()=>project);
const modal=el('dialog');
function errorMessage(error){
 active=false;el('status').textContent='หยุดที่ '+(scene?.$$class?.$$name||'เริ่มต้น')+' · '+String(error.message||error);
 el('start').hidden=true;console.error(error);
}
const panels=[];
function panel(text,build){
 let done=false;
 const show=()=>showPanel(text,build,()=>{
  done=true;
  panels.shift();
  if(panels.length)panels[0]();
 });
 panels.push(show);
 if(panels.length===1)show();
 return ()=>done;
}
function showPanel(text,build,complete){
 clearInput();
 modal.replaceChildren();const p=document.createElement('p');
 p.textContent=String(text).replace(/\\N\[(\d+)\]/gi,(_,id)=>Opal.gvars.game_actors['$[]'](+id).$name()).replace(/\\c\[\d+\]|\\[.!|^]/gi,'');
 modal.append(p);modal.hidden=false;
 build(()=>{modal.hidden=true;modal.replaceChildren();el('screen').focus();complete();});
}
function button(text,onClick){
 const b=document.createElement('button');b.textContent=text;b.onclick=onClick;modal.append(b);return b;
}
globalThis.playerUI={
 message:text=>panel(text,finish=>button('ต่อไป',finish).focus()),
 choice:(options,done)=>panel('เลือกคำตอบ',finish=>options.forEach((s,i)=>{const b=button(s,()=>{done(i);finish();});if(i===0)b.focus();})),
 name:(name,max,done)=>panel('ชื่อตัวละคร',finish=>{
  const input=document.createElement('input');input.type='text';input.maxLength=max;input.value=name;modal.append(input);
  const submit=()=>{if(!input.value.trim())return;done(input.value);finish();};
  button('ยืนยันชื่อ',submit);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit();}};input.focus();input.select();
 })
};
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
    el('start').hidden=scene.$$class!==Opal.Scene_Title;
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
  const source=new VX.CompositeSource([new VX.FolderSource(files),new VX.ArchiveSource(await VX.RGSS3Archive.open(game))]);
  project=await new VX.Project(source).initialize();await prepareDatabase(project);
  Opal.DataManager.$init();Opal.SceneManager.$goto(Opal.SceneManager.$first_scene_class());
  display.enabled=true;active=true;el('picker').hidden=true;el('screen').focus();requestAnimationFrame(tick);
 }catch(e){el('folder').disabled=false;errorMessage(e);}
};
el('start').onclick=()=>{try{display.unlockAudio();el('start').hidden=true;scene.$command_new_game();el('screen').focus();}catch(e){errorMessage(e);}};
const keys={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'ok',z:'ok',Escape:'cancel',x:'cancel',Shift:'shift'};
onkeydown=e=>{
 if(!active)return;
 if(!modal.hidden){
  if(e.target.tagName==='INPUT')return;
  const buttons=[...modal.querySelectorAll('button')], index=buttons.indexOf(document.activeElement);
  if(e.key.toLowerCase()==='z'){
   e.preventDefault();if(!e.repeat)(buttons[index]||buttons[0])?.click();
  }else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&buttons.length){
   e.preventDefault();const step=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;
   buttons[(index+step+buttons.length)%buttons.length].focus();
  }
  return;
 }
 if(!keys[e.key])return;
 e.preventDefault();if(!e.repeat)pressKey(keys[e.key]);};
onkeyup=e=>heldKeys.delete(keys[e.key]);
onblur=()=>clearInput();
for(const b of document.querySelectorAll('[data-key]')){
 b.onpointerdown=e=>{e.preventDefault();if(!modal.hidden){if(b.dataset.key==='ok')(modal.querySelector('button:focus')||modal.querySelector('button'))?.click();return;}
 b.setPointerCapture(e.pointerId);pressKey(b.dataset.key);};
 b.onlostpointercapture=b.onpointerup=b.onpointercancel=()=>heldKeys.delete(b.dataset.key);
}
