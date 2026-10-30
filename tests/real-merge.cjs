/* Read-only check of merged map renderer + CRuby script catalog with user's archive.
 * No assets are bundled or written; no game Ruby or event scripts are executed.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {RGSS3Archive}=require('../src/archive.js');
const {ArchiveSource}=require('../src/assets.js');
const {MarshalReader}=require('../src/marshal.js');
const {GameState,Character,Interpreter}=require('../src/game.js');
const {Project,MapRuntime}=require('../src/runtime.js');
const {ScriptCatalog}=require('../src/scripts.js');
require('../src/autotile.js');
global.VX={...(global.VX||{}),MarshalReader,GameState,Character,Interpreter};

const fakeCtx=()=>new Proxy({}, {get:(o,k)=>k==='measureText'?s=>({width:String(s).length*10}):((k in o)?o[k]:(()=>{})),set:(o,k,v)=>(o[k]=v,true)});
const fakeCanvas=()=>({getContext:fakeCtx});
function fakeImage(bytes){
  const b=Buffer.from(bytes);
  if(b.subarray(0,4).toString('hex')==='89504e47')return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  return {width:544,height:416};
}

(async()=>{
  if(!process.argv[2])throw Error('Usage: node tests/real-merge.cjs /path/to/Game.rgss3a');
  const archive=await RGSS3Archive.open(await fs.openAsBlob(process.argv[2]));
  const source=new ArchiveSource(archive);
  const project=await new Project(source,{decode:fakeImage}).initialize();
  const rt=new MapRuntime(fakeCanvas(),{textContent:''},{makeCanvas:fakeCanvas,autoStart:false});
  await rt.setProject(project);
  rt.render();
  assert.equal(project.title,'BLACK SOULS II full ver.');
  assert.equal(project.mapIds().length,410);
  assert.equal(rt.mapId,185);
  assert.deepEqual([rt.player.x,rt.player.y],[8,6]);
  assert(rt.map?.events);
  const scripts=await ScriptCatalog.load(source);
  assert.equal(scripts.entries.length,224);
  console.log('PASS: merged map engine loads real start map 185, player (8,6), renders code path, parses 410 maps list and decompresses 224 Ruby scripts');
  console.log('Missing external images encountered:',project.missing.size,'(RTP/loose assets may be needed)');
})().catch(error=>{console.error(error);process.exitCode=1;});
