// Portable browser-runtime saves. Files stay on the user's device.
(function(){
 'use strict';
 const format='bs2-web-save',version=1,maxFile=32*1024*1024;
 function validateGraph(graph,required){
  const nodes=graph?.nodes;
  if(!Array.isArray(nodes)||nodes.length===0||nodes.length>300000)throw Error('Invalid save graph');
  const forbidden=new Set(['__proto__','prototype','constructor']);
  function constant(name){
   if(typeof name!=='string'||! /^(?:[A-Z][A-Za-z0-9_]*)(?:::[A-Z][A-Za-z0-9_]*)*$/.test(name))throw Error('Invalid RGSS constant');
   const value=saveConstant(name);if(!value?.$$is_a_module)throw Error('Unknown RGSS constant: '+name);return value;
  }
  function ref(v){
   if(v===null||typeof v==='string'||typeof v==='boolean'||Number.isFinite(v))return;
   if(Array.isArray(v)&&v.length===1&&Number.isInteger(v[0])&&v[0]>=0&&v[0]<nodes.length)return;
   if(v&&typeof v==='object'&&Object.keys(v).length===1){
    if(v.jsNull===true || ['NaN','Infinity','-Infinity','-0'].includes(v.rgssNumber))return;
    if(typeof v.rgssConstant==='string'){constant(v.rgssConstant);return;}
   }
   throw Error('Invalid save reference');
  }
  ref(graph.root);
  let values=0;
  for(const node of nodes){
   if(!node||typeof node.type!=='string'||!Array.isArray(node.data))throw Error('Invalid save node');
   values+=node.data.length;if(values>4000000)throw Error('Save has too many values');
   if(node.type==='array'){for(const v of node.data)ref(v);continue;}
   const hash=node.type==='hash';
   if(hash)ref(node.fallback);else if(typeof constant(node.type).$allocate!=='function')throw Error('Invalid RGSS class');
   for(const pair of node.data){
    if(!Array.isArray(pair)||pair.length!==2)throw Error('Invalid save field');
    if(hash)ref(pair[0]);
    else if(typeof pair[0]!=='string'||pair[0].startsWith('$')||forbidden.has(pair[0]))throw Error('Unsafe save field');
    ref(pair[1]);
   }
  }
  const root=Array.isArray(graph.root)?nodes[graph.root[0]]:null;
  if(root?.type!=='hash'||!required.every(key=>root.data.some(pair=>pair[0]===key)))throw Error('Missing save data');
 }
 function validateRecord(record){
  if(!Number.isFinite(record?.time)||record.time<0||record.time>8640000000000000)throw Error('Invalid save date');
  validateGraph(record.header,['characters','playtime_s']);
  validateGraph(record.body,['system','timer','message','switches','variables','self_switches','actors','party','troop','map','player']);
  return {time:record.time,header:record.header,body:record.body};
 }
 const panel=document.getElementById('save-transfer'),slots=document.getElementById('save-transfer-slot'),file=document.getElementById('save-transfer-file');
 const status=document.getElementById('save-transfer-status'),download=document.getElementById('save-transfer-download'),upload=document.getElementById('save-transfer-upload');
 let busy=false;
 const tell=message=>{status.textContent=message;};
 const isTitle=()=>active&&Opal.SceneManager.$scene()?.$$class===Opal.Scene_Title;
 const slot=()=>Number(slots.value);
 const label=i=>i===AUTOSAVE_SLOT?'Autosave':'File '+(i+1);
 function refresh(){
  const previous=slots.value;
  slots.replaceChildren();
  if(!active){tell('Select a game folder first');download.disabled=upload.disabled=true;return;}
  for(const i of [AUTOSAVE_SLOT,...Array.from({length:dm.$savefile_max()},(_,i)=>i)]){
   let saved=null;try{saved=readSlot(i);}catch{}
   const stamp=saved&&Number.isFinite(saved.time)?' · '+new Date(saved.time).toLocaleString():' · Empty';
   slots.add(new Option(label(i)+stamp,String(i)));
  }
  if([...slots.options].some(o=>o.value===previous))slots.value=previous;
  download.disabled=upload.disabled=busy;
 }
 function validSlot(i){return Number.isInteger(i)&&(i===AUTOSAVE_SLOT||i>=0&&i<dm.$savefile_max());}
 panel.addEventListener('toggle',()=>{if(panel.open){pauseTick();releaseControls();refresh();tell(active?'Select a save slot · .rvdata2 and .bs2save.json imports are supported at the main menu':'Select a game folder first');}else{if(active){document.getElementById('screen').focus();scheduleTick();}}});
 download.onclick=async()=>{
  try{
   const i=slot();if(!active||!validSlot(i))throw Error('Select a save slot first');
   const record=await readFullSlot(i);if(!record)throw Error('This save slot is empty');
   const portable={...record,body:checkpointGraph(record.body)};
   const blob=new Blob([JSON.stringify({format,version,slot:i,record:portable})],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='BlackSoulsII-'+(i===AUTOSAVE_SLOT?'autosave':'file-'+(i+1))+'-'+new Date(record.time).toISOString().slice(0,10)+'.bs2save.json';
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   tell('Exported '+label(i)+'');
  }catch(e){tell(String(e.message||e));}
 };
 upload.onclick=()=>{if(!isTitle()){tell('Return to the main menu before importing a save');return;}file.click();};
 file.onchange=async()=>{
  const selected=file.files[0];file.value='';if(!selected||busy)return;
  const i=slot();busy=true;download.disabled=upload.disabled=true;
  try{
   if(!isTitle()||!validSlot(i))throw Error('Importing is only available at the main menu');
   if(selected.size>maxFile)throw Error('File exceeds 32 MB');
   let record;
   if(/\.rvdata2$/i.test(selected.name)){
    tell('Converting RPG Maker VX Ace save…');
    record=validateRecord(VX.parseNativeSave(new Uint8Array(await selected.arrayBuffer()),selected.lastModified||Date.now()));
   }else{
    const payload=JSON.parse(await selected.text());
    if(payload?.format!==format||payload.version!==version)throw Error('Unsupported Web Runtime save file');
    record=validateRecord(payload.record);
   }
   if(!isTitle())throw Error('Return to the main menu before importing');
   if(readSlot(i)&&!window.confirm('Replace '+label(i)+' with the selected file?')){tell('Import canceled');return;}
   if(i===AUTOSAVE_SLOT){
    if(autosave.writing)throw Error('Autosave is in progress. Try again.');
    const checkpoint=compactCheckpoint(record);
    await autosave.persist(checkpoint);autosaveRecord=checkpoint;
   }else await writeManualSlot(i,record);
   const win=Opal.SceneManager.$scene()?.command_window;
   if(typeof win?.$refresh==='function')win.$refresh();
   tell('Imported '+label(i)+' successfully · Close the Saves menu and select Continue');
  }catch(e){tell('Import failed: '+String(e.message||e));}
  finally{busy=false;refresh();}
 };
 refresh();
 // Expose validation for the repository's smoke tests without modifying game state.
 globalThis.VX.validatePortableSave=validateRecord;
})();
