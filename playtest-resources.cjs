const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const load=name=>vm.runInThisContext(fs.readFileSync('web/'+name+'.js','utf8'),{filename:'web/'+name+'.js'});
globalThis.location={search:''};
require('./vendor/opal.js');require('./vendor/compiler.js');require('./adapters/generated.js');
globalThis.fflate=require('./vendor/fflate-0.8.2.js');
for(const file of ['host','images','definitions','archive','project','rgss3-display','bitmap-cache','saves','autosave'])load(file);

async function checkImageFiles(){
  let reads=0;
  const source={async read(){reads++;return new Uint8Array(2*1024*1024);}};
  const project=new VX.Project(source,{retainImages:false,decode:async bytes=>({width:64,height:64})});
  await project.decodeAsset('first');await project.decodeAsset('first');
  assert.equal(reads,1,'a recent image can be decoded again without reading from storage');
  for(let i=0;i<16;i++)await project.decodeAsset(String(i));
  assert.ok(project.imageFileBytes<=24*1024*1024);
  const before=reads;await project.decodeAsset('first');
  assert.equal(reads,before+1,'a cold image can still be recovered');
}

function checkArtOwnership(){
  const surfaces=new Map(),owner={};
  boundBitmapCache(owner,{bitmaps:surfaces});
  const cache=owner.cache;
  function asset(id){
    const bitmap={id,width:1024,height:1024};
    surfaces.set(id,{fileBacked:true});
    cache['$[]=']('file'+id,bitmap);return bitmap;
  }
  const first=asset(0),second=asset(1);
  for(let i=2;i<10;i++)asset(i);
  assert.ok(!cache.$values().includes(first));
  assert.equal(cache['$[]']('file0'),first,'a sprite can still own evicted art');
  VX.RGSS3Display.prototype.markBitmapEdited(surfaces.get(1));
  for(let i=10;i<20;i++)asset(i);
  assert.ok(cache.$values().includes(second),'an edit to cold, still-live art becomes permanent');
  assert.equal(cache.$delete('file1'),second);
  assert.equal(Opal.send(cache,'delete',['absent'],name=>'missing '+name),'missing absent');
  cache.$clear();
  VX.RGSS3Display.prototype.markBitmapEdited(surfaces.get(0));
  assert.equal(cache['$[]']('file0'),Opal.nil,'a late edit cannot resurrect a cleared entry');
}

function checkSaves(){
  const shared=['ทดสอบ',NaN,Infinity,-Infinity,-0],root=[shared,shared];
  root.push(root);
  const packed=packSave(root),record=compactCheckpoint({time:1,header:packSave([]),body:packed});
  assert.ok(validCheckpoint(record));assert.ok(record.body.bytes instanceof Uint8Array);
  for(const body of [packed,record.body,checkpointForWebStorage(record).body]){
    const data=unpackSave(body);
    assert.equal(data,data[2]);assert.equal(data[0],data[1]);assert.deepEqual(data[0],shared);
  }
  const old={time:1,header:packSave([]),body:{root:[0],nodes:[{type:'array',data:[NaN,-0]}]}};
  assert.deepEqual(unpackSave(compactCheckpoint(old,true).body),[NaN,-0]);
}

function checkAutorun(){
  const game=Opal.gvars,method=Opal.Game_Map.$$prototype.$setup_autorun_common_event;
  const runs=[],enabled=new Set();
  const event=id=>({trigger:true,'$autorun?'(){return this.trigger;},$switch_id:()=>id,$list:()=>id});
  const a=event(1),b=event(2),map={interpreter:{$setup:id=>runs.push(id)}};
  game.data_common_events=[Opal.nil,a,b];game.game_switches={'$[]':id=>enabled.has(id)};
  assert.equal(method.call(map),Opal.nil);enabled.add(2);assert.equal(method.call(map),b);
  enabled.add(1);assert.equal(method.call(map),a);a.trigger=false;assert.equal(method.call(map),b);
  assert.deepEqual(runs,[2,1,2]);
}
(async()=>{
  checkArtOwnership();checkSaves();checkAutorun();await checkImageFiles();
  console.log('PASS image lifetime, bounded file reads, portable and legacy checkpoints, and autorun ordering');
})().catch(error=>{console.error(error);process.exitCode=1;});
