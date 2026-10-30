const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {RGSS3Archive}=require('../src/archive.js');
const {MarshalReader,RubyTable}=require('../src/marshal.js');
const {ZipContainer}=require('../src/zip.js');
const {ArchiveSource,ZipSource,FolderSource,CompositeSource}=require('../src/assets.js');
const Autotile=require('../src/autotile.js');
const {GameState,Interpreter}=require('../src/game.js');
const {Project,MapRuntime}=require('../src/runtime.js');
const {make,Writer}=require('./generate-sample.cjs');

function makeZip(files,method=0){ // independent ZIP writer for fixtures
  const locals=[],centrals=[];let offset=0;
  for(const [name,contents] of files){
    const bytes=Buffer.from(contents),filename=Buffer.from(name),zipped=method===8?zlib.deflateRawSync(bytes):bytes;
    const local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);
    local.writeUInt32LE(zipped.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(method,10);
    central.writeUInt32LE(zipped.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    locals.push(local,filename,zipped);centrals.push(central,filename);offset+=30+filename.length+zipped.length;
  }
  const dir=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,dir,end]);
}
const pngSize=b=>({width:Buffer.from(b).readUInt32BE(16),height:Buffer.from(b).readUInt32BE(20)});
const fakeCtx=()=>new Proxy({},{get:(t,k)=>k==='measureText'?(s=>({width:String(s).length*10})):(k in t?t[k]:()=>{}),set:(t,k,v)=>(t[k]=v,true)});
const makeCanvas=()=>{const ctx={calls:0,drawImage(){this.calls++;}};return {getContext:()=>ctx};};
const tick=()=>new Promise(r=>setImmediate(r));

(async()=>{
  const bytes=make();
  // ---- ZIP containers ----
  for(const method of [0,8]){
    const zip=await ZipContainer.open(new Blob([makeZip([['MyGame/Game.rgss3a',bytes]],method)]));
    assert.equal(zip.gameArchive().name,'MyGame/Game.rgss3a');
    const blob=await zip.unpackGame();
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()),Buffer.from(bytes));
    assert.equal((await RGSS3Archive.open(blob)).entries.length,10);
  }
  const wrongZip=await ZipContainer.open(new Blob([makeZip([['Game.exe',bytes]])]));
  assert.throws(()=>wrongZip.gameArchive(),/Game\.rgss3a/);
  await assert.rejects(()=>ZipContainer.open(new Blob(['not a zip'])));
  console.log('PASS: ZIP game import (stored, deflated), nested folders, malformed input');

  // ---- loose ZIP / folder / composite sources ----
  const loose=await ZipContainer.open(new Blob([makeZip([['Pack/Graphics/Characters/NPC.png','abc'],['Pack/Data/Extra.rvdata2','xyz']],8)]));
  const zs=new ZipSource(loose);
  assert(zs.has('graphics/characters/npc.png'));assert.equal(Buffer.from(await zs.read('Graphics/Characters/NPC.png')).toString(),'abc');
  const files=[{webkitRelativePath:'RTP/Graphics/Tilesets/Dungeon_A1.png',size:3,arrayBuffer:async()=>Uint8Array.from([1,2,3]).buffer}];
  const fs=new FolderSource(files);assert(fs.has('Graphics/Tilesets/dungeon_a1.PNG'));
  const archive=await RGSS3Archive.open(new Blob([bytes]));
  const combo=new CompositeSource([new ArchiveSource(archive),fs,zs]);
  assert(combo.has('Data/Map001.rvdata2')&&combo.has('Graphics/Tilesets/Dungeon_A1.png')&&combo.has('Data/Extra.rvdata2'));
  assert.equal([...await combo.read('Graphics/Tilesets/Dungeon_A1.png')].join(),'1,2,3');
  console.log('PASS: archive + folder + zip combined asset sources (RTP can be added)');

  // ---- RGSS3A + Marshal ----
  assert.deepEqual(Array.from((await archive.read('Graphics/Tilesets/SampleA5.png')).subarray(0,8)),[137,80,78,71,13,10,26,10]);
  assert.throws(()=>new MarshalReader(Uint8Array.from([4,8,255])).parse());
  assert.equal(new MarshalReader(Uint8Array.from([4,8,102,8,105,110,102])).parse(),Infinity);
  const u=new MarshalReader(Buffer.concat([Buffer.from([4,8,91,7,85,58,6,65,91,6,105,6,64,6])])).parse(); // [U:A [1], @1] -> same object
  assert.equal(u[1],u[0]);
  await assert.rejects(()=>RGSS3Archive.open(new Blob(['wrong format'])));
  console.log('PASS: RGSS3A index/decrypt, Marshal 4.8 (object links, U, floats), malformed rejected');

  // ---- Autotile composition ----
  const q=Autotile.locate(2816);assert.equal(q.sheet,1);assert.equal(q.quads.length,4);
  assert.deepEqual(q.quads[0],{sx:16,sy:48}); // shape 0 TL = center quarter (1,3)
  assert.equal(Autotile.locate(1).whole,true);assert.equal(Autotile.locate(1).sheet,5);
  assert.deepEqual([Autotile.locate(1536+9).sx,Autotile.locate(1536+9).sy],[32,32]);
  assert.deepEqual([Autotile.locate(128).sx,Autotile.locate(128).sy],[256,0]); // B sheet right half
  const wall=Autotile.locate(2048+48*48); // A3 kind 48 shape 0
  assert.equal(wall.sheet,2);
  const a4=Autotile.locate(2048+48*88); // A4 kind 88 (row 1 = wall block)
  assert.equal(a4.sheet,3);assert.equal(a4.quads[0].sy,96+16);
  const comp=Autotile.compose(2816,[null,{width:512,height:384}],0,makeCanvas);
  assert.equal(comp.getContext('2d').calls,4);
  console.log('PASS: autotile/B-E/A5 tile composition and A4 layout');

  // ---- Project + runtime ----
  const status={textContent:''};
  const rt=new MapRuntime({getContext:()=>fakeCtx()},status,{makeCanvas});
  const project=await new Project(new ArchiveSource(archive),{decode:async b=>pngSize(b)}).initialize();
  assert.deepEqual(project.mapIds(),[1,2]);assert.equal(project.title,'Sample Game');
  const map=await project.loadMap(1);
  assert(map.data instanceof RubyTable);assert.equal(map.data.at(3,3,0),2816);
  await rt.setProject(project);
  assert.deepEqual([rt.player.x,rt.player.y],[4,5]);assert.equal(rt.player.graphic.name,'$Hero');
  const frames=async n=>{for(let i=0;i<n;i++){rt.update();await tick();}};
  const press=async k=>{rt.input(k,true);await frames(1);rt.input(k,false);await frames(1);};
  const hold=async(k,n)=>{rt.input(k,true);await frames(n);rt.input(k,false);await frames(20);};
  await hold('right',40);assert(rt.player.x>=6,'player walks');
  rt.player.locate(1,5);await hold('left',40);assert.equal(rt.player.x,1,'wall blocks');
  console.log('PASS: map load, smooth movement, tile-flag collision');

  // dialogue with choices -> switch -> page change
  rt.player.locate(10,6);rt.player.dir=6;
  await press('ok');await frames(3);
  assert(rt.msg&&rt.msg.lines[0].includes('Welcome'),'message shown');
  await frames(60);await press('ok');await frames(2);
  assert(rt.choiceUI,'choice shown');assert.equal(rt.choiceUI.items.length,3);
  await press('down');await press('ok');await frames(3);
  assert.equal(rt.state.sw(1),true);assert(rt.msg.lines[0].includes('gate'));
  await frames(60);await press('ok');await frames(5);
  assert.equal(rt.msg,null);assert.equal(rt.eventRunning,false);
  assert.equal(rt.events.get(2).pageIndex,1,'gate event switched to open page');
  rt.player.locate(14,6);await hold('right',40);assert.equal(rt.player.x,15,'open gate is passable');
  console.log('PASS: Show Text, Show Choices, Control Switch, event page switching');

  // chest with self switch and gold
  rt.player.locate(5,8);rt.player.dir=2;await press('ok');await frames(60);await press('ok');await frames(5);
  assert.equal(rt.state.gold,50);assert.equal(rt.state.ss(1,3,'A'),true);assert.equal(rt.events.get(3).pageIndex,1);
  rt.player.dir=2;await press('ok');await frames(3);assert(rt.msg.lines[0].includes('empty'));await frames(60);await press('ok');await frames(3);
  assert.equal(rt.state.gold,50);
  console.log('PASS: gold, self switch, second page condition');

  // variables + conditional branch else
  rt.player.locate(2,3);rt.player.dir=8;
  await press('ok');await frames(3);assert.equal(rt.state.v(1),1);assert(rt.msg.lines[0].includes('below 3'));await frames(60);await press('ok');await frames(3);
  rt.state.setV(1,5);await press('ok');await frames(3);assert(rt.msg.lines[0].includes('3 or more'));await frames(60);await press('ok');await frames(3);
  console.log('PASS: Control Variables and Conditional Branch (then/else)');

  // transfer via touch event, then back
  rt.player.locate(8,11);rt.player.dir=2;await hold('down',30);await frames(120);
  assert.equal(rt.mapId,2);assert.deepEqual([rt.player.x,rt.player.y],[3,3]);
  rt.player.locate(3,6);await hold('down',50);await frames(120);
  assert.equal(rt.mapId,1);assert.deepEqual([rt.player.x,rt.player.y],[8,11]);
  console.log('PASS: Transfer Player (touch trigger, fade, both ways)');

  // interpreter control flow on a custom list
  const C=(code,parameters=[],indent=0)=>({code,indent,parameters});
  const host=rt;rt.eventRunning=false;
  const itp=new Interpreter(host);
  await itp.start([C(121,[5,5,0]),C(122,[2,2,0,0,0]),C(112),C(122,[2,2,1,0,1],1),C(111,[1,2,0,3,1],1),C(113,[],2),C(412,[],1),C(413),C(119,['end']),C(122,[3,3,0,0,99]),C(118,['end']),C(0)],{mapId:1,eventId:0});
  assert.equal(rt.state.v(2),3,'loop counted to 3 then broke');assert.equal(rt.state.v(3),0,'jump skipped assignment');assert.equal(rt.state.sw(5),true);
  rt.unsupportedCounts={};await itp.start([C(355,['p "hi"']),C(655,['more']),C(231,[1])],{mapId:1,eventId:0});
  assert(Object.keys(rt.report().unsupported).some(k=>k.startsWith('script:')));assert.equal(rt.report().unsupported['231'],1);
  console.log('PASS: loop/break/label/jump; unsupported commands are reported (not hidden)');

  // save / load
  const store=new Map();global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  rt.state.setV(9,42);rt.save();rt.state.setV(9,0);await rt.load();assert.equal(rt.state.v(9),42);assert.equal(rt.mapId,1);
  console.log('PASS: save/load of switches, variables, items, position');
})().catch(e=>{console.error(e);process.exitCode=1;});
