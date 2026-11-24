// Preserve RGSS class identities, Hash keys, and shared references in each browser save.
class PendingSaveAction extends Error {}
function packSave(root){
 const nodes=[],ids=new Map();
 function encode(value){
  if(value==null)return {jsNull:true};
  if(value===Opal.nil)return null;
  if(['number','boolean','string'].includes(typeof value))return value;
  if(value instanceof String)return String(value);
  if(typeof value==='function')throw new PendingSaveAction('Cannot save while a scripted action is pending');
  if(ids.has(value))return [ids.get(value)];
  const id=nodes.length,node={};ids.set(value,id);nodes.push(node);
  if(Array.isArray(value)){node.type='array';node.data=value.map(encode);}
  else if(value.$$is_hash){
   node.type='hash';node.data=value.$keys().map(key=>[encode(key),encode(value['$[]'](key))]);
   node.fallback=encode(value.$default());
  }else{
   node.type=value.$$class?.$name();
   if(!node.type)throw Error('Unknown object in save');
   node.data=Object.entries(value).filter(([key])=>!key.startsWith('$')).map(([key,v])=>[key,encode(v)]);
  }
  return [id];
 }
 return {root:encode(root),nodes};
}
function unpackSave(graph){
 const objects=graph.nodes.map(n=>n.type==='array'?[]:n.type==='hash'?Opal.hash():
  n.type.split('::').reduce((klass,key)=>klass[key],Opal).$allocate());
 const decode=v=>v?.jsNull?null:Array.isArray(v)?objects[v[0]]:v??Opal.nil;
 // Populate object and array keys before rebuilding hash buckets.
 for(const [i,n] of graph.nodes.entries()){
  if(n.type==='array')for(const v of n.data)objects[i].push(decode(v));
  else if(n.type!=='hash')for(const [key,v] of n.data)Object.defineProperty(objects[i],key,{value:decode(v),enumerable:true,writable:true,configurable:true});
 }
 for(const [i,n] of graph.nodes.entries())if(n.type==='hash'){
  objects[i]['$default='](decode(n.fallback));
  for(const [key,v] of n.data)objects[i]['$[]='](decode(key),decode(v));
 }
 return decode(graph.root);
}
const saveKey=i=>'bs2.rgss.save.v1.'+i;
const dm=Opal.DataManager;
const AUTOSAVE_SLOT=-1;
let autosaveRecord=null;
function readSlot(i){
 if(i===AUTOSAVE_SLOT)return autosaveRecord;
 const raw=localStorage.getItem(saveKey(i));return raw?JSON.parse(raw):null;
}
function makeSaveRecord(automatic=false){
 const system=Opal.gvars.game_system,count=system.save_count;
 try{system.$on_before_save();}finally{if(automatic)system.save_count=count;}
 return {time:Date.now(),header:packSave(dm.$make_save_header()),body:packSave(dm.$make_save_contents())};
}
dm.$save_game=function(i){
 if(i===AUTOSAVE_SLOT)return false;
 try{
  const record=makeSaveRecord();
  localStorage.setItem(saveKey(i),JSON.stringify(record));this.last_savefile_index=i;return true;
 }catch(e){console.warn('Save failed',e.message);return false;}
};
dm.$load_game=function(i){
 try{
  const record=readSlot(i);if(!record)return false;
  const contents=unpackSave(record.body);this.$extract_save_contents(contents);
  this.$reload_map_if_updated();if(i!==AUTOSAVE_SLOT)this.last_savefile_index=i;return true;
 }catch(e){console.warn('Load failed',e.message);return false;}
};
dm.$load_header=function(i){try{const r=readSlot(i);return r?unpackSave(r.header):Opal.nil;}catch{return Opal.nil;}};
dm['$save_file_exists?']=function(){if(autosaveRecord)return true;try{for(let i=0;i<this.$savefile_max();i++)if(localStorage.getItem(saveKey(i)))return true;}catch{}return false;};
dm.$savefile_time_stamp=function(i){try{return Opal.Time.$at((readSlot(i)?.time||0)/1000);}catch{return Opal.Time.$at(0);}};
dm.$delete_save_file=i=>localStorage.removeItem(saveKey(i));
// The game's ATB and equipment scripts use a Marshal round trip for deep copies.
const gameMarshal=Opal.module(Opal.Object,'Marshal');
Opal.defs(gameMarshal,'$dump',value=>JSON.stringify(packSave(value)));
Opal.defs(gameMarshal,'$load',text=>unpackSave(JSON.parse(text)));
