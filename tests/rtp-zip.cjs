'use strict';
const assert=require('node:assert/strict');
const {inspectRTP}=require('../src/rtp.js');
const {ZipSource,CompositeSource}=require('../src/assets.js');

function zip(names){
  return {
    entries:names.map(name=>({name,size:4})),
    async openEntry(entry){return new Blob([entry.name.slice(-4)]);}
  };
}

(async()=>{
  const official=zip(['RTP100/Setup.exe','RTP100/Setup-1.bin','RTP100/ReadMe.txt']);
  assert.deepEqual(inspectRTP(official),{graphics:0,audio:0,installer:true,usable:false});
  const unpacked=zip(['RPGVXAce_RTP/Graphics/Characters/Actor1.png','RPGVXAce_RTP/Audio/BGM/Theme1.ogg']);
  assert.deepEqual(inspectRTP(unpacked),{graphics:1,audio:1,installer:false,usable:true});
  const rtp=new ZipSource(unpacked,'RTP.zip');
  assert.equal(rtp.has('graphics/characters/ACTOR1.PNG'),true);
  assert.equal(rtp.has('Audio/BGM/Theme1.ogg'),true);
  assert.equal(rtp.has('Data/MapInfos.rvdata2'),false);
  assert.equal((await rtp.read('Graphics/Characters/Actor1.png')).byteLength,4);
  const game=new ZipSource(zip(['Game/Graphics/Characters/Actor1.png']),'game.zip');
  const combined=new CompositeSource([game,rtp]);
  assert.equal(combined.sources.find(s=>s.has('Graphics/Characters/Actor1.png')),game);
  assert.equal(combined.has('Audio/BGM/Theme1.ogg'),true);
  console.log('RTP ZIP tests passed: nested folders, Inno Setup detection, lazy reads, game precedence');
})().catch(error=>{console.error(error);process.exitCode=1;});
