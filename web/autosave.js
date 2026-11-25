// Keep the checkpoint outside the numbered manual slots and their localStorage quota.
const autosaveStore='checkpoints';
const autosaveInterval=new URLSearchParams(location.search).get('perf')==='pi4'?180000:120000;
const autosaveMinimumGap=30000;

function validCheckpoint(record){
 return Number.isFinite(record?.time) && Array.isArray(record.header?.nodes) && Array.isArray(record.body?.nodes);
}
function openAutosaveDatabase(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('bs2.rgss.autosave',1);
  request.onupgradeneeded=()=>request.result.createObjectStore(autosaveStore);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>{request.onsuccess=()=>request.result.close();reject(Error('Autosave database is busy'));};
 });
}
function safeToAutosave(g){
 return g.game_map.map_id>0 && !g.game_system.save_disabled && !g.game_party.$in_battle() && !g.game_party['$all_dead?']() &&
  !g.game_player['$transfer?']() && g.game_player['$movable?']() && !g.game_map.$interpreter()['$running?']() &&
  !g.game_map['$any_event_starting?']() && !g.game_temp['$common_event_reserved?']();
}

const autosave={
 db:null,session:null,mapId:0,afterBattle:false,writing:false,dueAt:0,retryAt:0,
 async prepare(){
  // A file URL or a privacy setting can leave only Web Storage available.
  try{const fallback=readSlot('auto');if(validCheckpoint(fallback))autosaveRecord=fallback;}catch{}
  try{
   if(!globalThis.indexedDB)return;
   const db=await openAutosaveDatabase();this.db=db;
   db.onversionchange=()=>{db.close();this.db=null;};
   const saved=await new Promise((resolve,reject)=>{
    const request=db.transaction(autosaveStore).objectStore(autosaveStore).get('latest');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
   });
   if(validCheckpoint(saved) && (!autosaveRecord || saved.time>=autosaveRecord.time))autosaveRecord=saved;
  }catch(e){this.db?.close();this.db=null;console.warn('Autosave storage:',e.message);}
 },
 persist(record){
  if(!this.db){localStorage.setItem(saveKey('auto'),JSON.stringify(record));return;}
  return new Promise((resolve,reject)=>{
   const tx=this.db.transaction(autosaveStore,'readwrite');
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Autosave transaction aborted'));
   tx.objectStore(autosaveStore).put(record,'latest');
  });
 },
 update(scene,now,leaving=false){
  const sceneClass=scene?.$$class;
  if(sceneClass!==Opal.Scene_Map && sceneClass!==Opal.Scene_Battle)return;
  const g=Opal.gvars;
  if(this.session!==g.game_system){
   this.session=g.game_system;this.mapId=g.game_map.map_id;this.afterBattle=false;
   this.dueAt=autosaveRecord?now+autosaveInterval:now;this.retryAt=0;
  }
  if(sceneClass===Opal.Scene_Battle){this.afterBattle=true;return;}
  if(scene!==Opal.SceneManager.$scene())return;
  if(this.mapId!==g.game_map.map_id || this.afterBattle){
   this.mapId=g.game_map.map_id;this.afterBattle=false;this.dueAt=now;this.retryAt=0;
  }
  if(!leaving && this.lastWrite!==undefined && now-this.lastWrite<autosaveMinimumGap)return;
  if(this.writing || (!leaving && (now<this.retryAt || now<this.dueAt)))return;
  if(!safeToAutosave(g)){this.retryAt=now+250;return;}
  this.dueAt=now+autosaveInterval;this.retryAt=0;
  return this.write(now);
 },
 async write(now){
  this.writing=true;
  const session=this.session;
  try{
   const record=makeSaveRecord(true);
   await this.persist(record);
   this.lastWrite=now;autosaveRecord=record;this.notify?.('บันทึกอัตโนมัติแล้ว');
  }catch(e){
   const waiting=e instanceof PendingSaveAction;
   if(this.session===session){this.retryAt=now+(waiting?1000:15000);this.dueAt=this.retryAt;}
   if(!waiting){console.warn('Autosave failed',e);this.notify?.('บันทึกอัตโนมัติไม่สำเร็จ');}
  }finally{this.writing=false;}
 }
};

// Add a load-only row above File 1. Manual save indices stay the same on disk.
const loadFiles=Opal.Scene_Load.$$prototype;
const createFileWindows=loadFiles.$create_savefile_windows;
loadFiles.$create_savefile_windows=function(){
 this.hasAutosaveRow=false;createFileWindows.call(this);
 if(!autosaveRecord)return;
 const height=this.$savefile_height(),first=Opal.Window_SaveFile.$new(height,AUTOSAVE_SLOT);
 first['$viewport='](this.savefile_viewport);
 this.savefile_windows.unshift(first);
 this.savefile_windows.forEach((win,row)=>win['$y='](row*height));this.hasAutosaveRow=true;
};
loadFiles.$item_max=function(){return dm.$savefile_max()+(this.hasAutosaveRow?1:0);};
loadFiles.$first_savefile_index=function(){
 const latest=dm.$latest_savefile_index();
 if(!this.hasAutosaveRow)return latest;
 return autosaveRecord.time>=dm.$savefile_time_stamp(latest).$to_f()*1000?0:latest+1;
};
// The original RGSS handlers expect synchronous IO. Adapt the scene instead
// of returning a Promise as a truthy value to the original game script.
function saveIOStatus(message){const notice=document.getElementById('travel-status')||document.getElementById('autosave-status');notice.textContent=message;notice.hidden=!message;}
const fileScene=Opal.Scene_File.$$prototype;
const fileSelection=fileScene.$update_savefile_selection;
fileScene.$update_savefile_selection=function(){if(!this.browserSaveIO)return fileSelection.call(this);return Opal.nil;};
function runSaveIO(scene,message,action,success){
 if(scene.browserSaveIO)return Opal.nil;
 scene.browserSaveIO=true;saveIOStatus(message);
 Promise.resolve().then(action).then(()=>{
  if(Opal.SceneManager.$scene()!==scene)return;
  success();saveIOStatus('');
 }).catch(error=>{
  console.warn('Save IO:',error);saveIOStatus('เซฟ/โหลดไม่สำเร็จ: '+String(error.message||error));Opal.Sound.$play_buzzer();
 }).finally(()=>{scene.browserSaveIO=false;});
 return Opal.nil;
}
Opal.Scene_Save.$$prototype.$on_savefile_ok=function(){
 const i=this.index;
 return runSaveIO(this,'กำลังบันทึกเซฟ…',async()=>{
  const record=makeSaveRecord();await writeManualSlot(i,record);dm.last_savefile_index=i;
 },()=>this.$on_save_success());
};
loadFiles.$on_savefile_ok=function(){
 const i=this.savefile_windows[this.index]?.file_index;
 if(!Number.isInteger(i)){saveIOStatus('ไม่พบช่องเซฟที่เลือก');return Opal.Sound.$play_buzzer();}
 return runSaveIO(this,'กำลังโหลดเซฟ…',async()=>{
  const record=await readFullSlot(i);if(!record)throw Error('ช่องนี้ไม่มีเซฟ');
  saveIOStatus('กำลังกู้ข้อมูลตัวละครและแผนที่…');
  const contents=unpackSave(record.body),map=contents['$[]']('map');
  if(!Number.isInteger(map?.map_id)||map.map_id<=0)throw Error('Invalid saved map ID');
  saveIOStatus('กำลังโหลดแผนที่ '+map.map_id+'…');
  await loadRequiredMap(map.map_id);
  if(Opal.SceneManager.$scene()!==this)throw Error('Load cancelled');
  dm.$extract_save_contents(contents);dm.$reload_map_if_updated();
  if(i!==AUTOSAVE_SLOT)dm.last_savefile_index=i;
 },()=>this.$on_load_success());
};
const saveWindow=Opal.Window_SaveFile.$$prototype;
const refreshFile=saveWindow.$refresh;
saveWindow.$refresh=function(){
 if(this.file_index!==AUTOSAVE_SLOT)return refreshFile.call(this);
 this.$contents().$clear();this.$change_color(this.$normal_color());
 this.$draw_text(4,0,200,this.$line_height(),'Autosave');this.name_width=this.$text_size('Autosave').$width();
 this.$draw_party_characters(152,58);
 return this.$draw_playtime(0,this.$contents().$height()-this.$line_height(),this.$contents().$width()-4,2);
};
