/* Same src/ruby-worker.js protocol tested in Node Worker Threads via a small
 * browser API adapter. Not a replacement for testing Safari/Chrome directly.
 */
const {Worker} = require('node:worker_threads');
const path = require('node:path');
const assert = require('node:assert/strict');

const workerPath = path.join(__dirname, '../src/ruby-worker.js');
const worker = new Worker(`
  const {parentPort,workerData}=require('node:worker_threads');
  const {pathToFileURL}=require('node:url');
  const fs=require('node:fs');
  const path=require('node:path');
  global.self={location:{href:pathToFileURL(workerData).href}};
  global.importScripts=(name)=>{self['ruby-wasm-wasi']=require(path.resolve(path.dirname(workerData), name));};
  global.fetch=async(url)=>{
    const b=fs.readFileSync(url);
    return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),text:async()=>b.toString('utf8')};
  };
  self.postMessage=data=>parentPort.postMessage(data);
  self.addEventListener=(_,fn)=>parentPort.on('message',data=>fn({data}));
  require(workerData);
`, {eval: true, workerData: workerPath});

let nextId=1;
const outstanding=new Map();
const rgssOps=[];
worker.on('message',message=>{
  if(message.rgss){
    rgssOps.push(message.rgss);
    if(message.rgss.op==='frame')setTimeout(()=>worker.postMessage({type:'rgss-frame-ack',token:message.rgss.token}),1);
    return;
  }
  const call=outstanding.get(message.id);
  if (!call)return;
  if (message.progress) {call.progress.push(message.progress);return;}
  outstanding.delete(message.id);
  if(message.ok)call.resolve({result:message.result,progress:call.progress});
  else call.reject(Error(message.error));
});
worker.on('error',error=>{for(const call of outstanding.values())call.reject(error);outstanding.clear();});
function request(type,payload={}) {
  const id=nextId++;
  return new Promise((resolve,reject)=>{
    outstanding.set(id,{resolve,reject,progress:[]});
    worker.postMessage({id,type,...payload});
  });
}

(async()=>{
  const {result:info}=await request('init');
  assert.match(info.version,/^3\.2\./);
  const {result:answer}=await request('eval',{source:'(1..100).sum'});
  assert.equal(answer,'5050');
  const {result,progress}=await request('compile',{entries:[
    {name:'Ruby interpolation safety',source:'value = "#{raise \"DO_NOT_EXECUTE\"}"'},
    {name:'Bad Ruby',source:'def broken('},
  ]});
  assert.equal(result.total,2);
  assert.equal(result.passed,1);
  assert.equal(result.errors.length,1);
  assert.equal(progress.at(-1).checked,2);
  console.log(`PASS: actual Worker protocol runs Ruby ${info.version}, returns result, safely compiles source without evaluating it`);
  await request('rgss-install');
  worker.postMessage({type:'rgss-input',key:'right',down:true});
  const rgss=await request('rgss-run',{source:`
    bmp=Bitmap.new(40,40)
    bmp.fill_rect(0,0,40,40,Color.new(0,255,0))
    sprite=Sprite.new
    sprite.bitmap=bmp
    sprite.x=12
    Audio.se_play('Test')
    Graphics.update
    Input.update
    [Input.dir4,Input.press?(Input::RIGHT),Graphics.frame_count].inspect
  `});
  assert.equal(rgss.result,'[6, true, 1]');
  assert(rgssOps.some(x=>x.op==='bitmap-fill'));
  assert(rgssOps.some(x=>x.op==='sprite-set'));
  assert(rgssOps.some(x=>x.op==='frame'));
  console.log('PASS: Web Worker RGSS3 subset dispatches graphics, input, audio and asynchronous frame messages');
  {
    const fs=require('node:fs');
    const {RGSS3Archive}=require('../src/archive.js');
    const {ArchiveSource}=require('../src/assets.js');
    const {RGSS3DatabaseImporter}=require('../src/rgss3-data.js');
    const archive=await RGSS3Archive.open(await fs.openAsBlob(path.join(__dirname,'sample.rgss3a')));
    const source=new ArchiveSource(archive);
    const vmBridge={
      installRGSS:()=>request('rgss-install'),
      clearRGSSData:()=>request('rgss-data-clear'),
      loadRGSSData:async(name,bytes)=>(await request('rgss-data-load',{name,bytes})).result,
    };
    const database=await new RGSS3DatabaseImporter(source,vmBridge).load({mapId:1});
    assert.equal(database.total,5,'all sample rvdata2 databases and one map imported');
    const loaded=await request('rgss-run',{source:`
      [
        $data_actors[1].class.to_s, $data_actors[1].name,
        $data_system.class.to_s, $data_system.game_title,
        $data_map.class.to_s, $data_map.data.class.to_s,
        $data_map.data[0,0,0],
        $data_map.events[1].pages[0].list[0].class.to_s,
        $data_mapinfos[1].name,
        load_data('Data/Map001.rvdata2').equal?($data_map),
        Marshal.load(Marshal.dump($data_map.data))[0,0,0]
      ].inspect
    `});
    assert.equal(loaded.result,'["RPG::Actor", "Hero", "RPG::System", "Sample Game", "RPG::Map", "Table", 2816, "RPG::EventCommand", "Example Grove", true, 2816]');
    const {Writer}=require('./generate-sample.cjs');
    const datum=(cls,attrs)=>({__obj:cls,...attrs});
    const items=new Writer().dump([null,datum('RPG::Item',{
      id:1,name:'Potion',damage:datum('RPG::UsableItem::Damage',{type:0}),
      effects:[datum('RPG::UsableItem::Effect',{code:11,data_id:0,value1:0.5})],
      features:[datum('RPG::BaseItem::Feature',{code:22,data_id:0,value:1})],
    })]);
    await request('rgss-data-load',{name:'Items',bytes:new Uint8Array(items)});
    const nested=await request('rgss-run',{source:`
      [
        $data_items[1].class.to_s, $data_items[1].name,
        $data_items[1].damage.class.to_s,
        $data_items[1].effects[0].class.to_s,
        $data_items[1].features[0].class.to_s,
        Marshal.load(Marshal.dump(Color.new(12,23,34,45))).red.to_i,
        Marshal.load(Marshal.dump(Tone.new(1,2,3,4))).gray.to_i
      ].inspect
    `});
    assert.equal(nested.result,'["RPG::Item", "Potion", "RPG::UsableItem::Damage", "RPG::UsableItem::Effect", "RPG::BaseItem::Feature", 12, 4]');
    await assert.rejects(request('rgss-data-load',{name:'../../Actors',bytes:new Uint8Array(items)}),/Unsupported/);
    await assert.rejects(request('rgss-data-load',{name:'Actors',bytes:new Uint8Array([4,8,90])}));
    await request('rgss-data-clear');
    const cleared=await request('rgss-run',{source:'$data_actors.nil? && $data_map.nil?'});
    assert.equal(cleared.result,'true');
    console.log('PASS: raw .rvdata2 becomes native Ruby RPG::Actor/Item/Map/EventCommand, nested Feature/Effect/Damage and Table/Color/Tone; load_data and reset work');
  }
  const realMapsFlag=process.argv.indexOf('--maps');
  if(realMapsFlag>=0){
    const fs=require('node:fs');
    const {ZipContainer}=require('../src/zip.js');
    const zipPath=process.argv[realMapsFlag+1];
    if(!zipPath)throw Error('Usage: node tests/worker-vm.cjs --maps path/to/Data.zip');
    const zip=await ZipContainer.open(await fs.openAsBlob(zipPath));
    const maps=zip.entries.filter(e=>/^Map\d{3}\.rvdata2$/i.test(e.name));
    assert(maps.length>0,'No Map*.rvdata2 entries found');
    const errors=[];
    let checkedStartMap=false;
    for(let i=0;i<maps.length;i++){
      const entry=maps[i];
      const bytes=new Uint8Array(await (await zip.openEntry(entry)).arrayBuffer());
      try{
        await request('rgss-data-load',{name:entry.name.slice(0,6),bytes});
        if(entry.name==='Map185.rvdata2'){
          const {MarshalReader}=require('../src/marshal.js');
          const parsed=new MarshalReader(bytes).parse();
          const ruby=await request('rgss-run',{source:'[$data_map.class.to_s, $data_map.width, $data_map.height, $data_map.data[0,0,0], $data_map.events.size].inspect'});
          assert.equal(ruby.result,`["RPG::Map", ${parsed.width}, ${parsed.height}, ${parsed.data.at(0,0,0)}, ${Object.keys(parsed.events||{}).length}]`);
          checkedStartMap=true;
        }
      }
      catch(error){errors.push({name:entry.name,message:String(error.message||error)});}
      if(i%50===49)await request('rgss-data-clear');
    }
    assert.equal(errors.length,0,JSON.stringify(errors.slice(0,8)));
    if(maps.some(e=>e.name==='Map185.rvdata2'))assert(checkedStartMap,'Map185 Ruby/JS comparison');
    console.log(`PASS: native Ruby Marshal.load successfully imported ${maps.length}/${maps.length} real VX Ace Map*.rvdata2 files from user Data.zip`);
  }
  const scriptsFlag=process.argv.indexOf('--scripts');
  if(scriptsFlag>=0){
    const fs=require('node:fs');
    const filename=process.argv[scriptsFlag+1];
    if(!filename)throw Error('Usage: node tests/worker-vm.cjs --scripts path/to/Scripts.rvdata2');
    const bytes=new Uint8Array(fs.readFileSync(filename));
    await request('rgss-data-load',{name:'Scripts',bytes});
    const check=await request('rgss-run',{source:"[load_data('Data/Scripts.rvdata2').size, load_data('Data/Scripts.rvdata2')[0].class.to_s].inspect"});
    assert.match(check.result,/^\[\d+, "Array"\]$/);
    console.log(`PASS: native Ruby Marshal.load imported real Scripts.rvdata2 without executing game scripts: ${check.result}`);
  }
  const systemFlag=process.argv.indexOf('--system');
  if(systemFlag>=0){
    const fs=require('node:fs');
    const filename=process.argv[systemFlag+1];
    if(!filename)throw Error('Usage: node tests/worker-vm.cjs --system path/to/System.rvdata2');
    const bytes=new Uint8Array(fs.readFileSync(filename));
    await request('rgss-data-load',{name:'System',bytes});
    const check=await request('rgss-run',{source:'[$data_system.class.to_s, $data_system.start_map_id, $data_system.game_title.class.to_s].inspect'});
    assert.match(check.result,/^\["RPG::System", \d+, "String"\]$/);
    console.log(`PASS: native Ruby Marshal.load imported real RPG::System from user System.rvdata2: ${check.result}`);
  }
  const executeFlag=process.argv.indexOf('--execute-scripts');
  if(executeFlag>=0){
    const fs=require('node:fs');
    const zlib=require('node:zlib');
    const {MarshalReader}=require('../src/marshal.js');
    const name=process.argv[executeFlag+1];
    if(!name)throw Error('Missing Scripts.rvdata2 for --execute-scripts');
    const raw=new MarshalReader(fs.readFileSync(name),{rawStrings:true}).parse();
    const decode=bytes=>{
      try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
      catch{return new TextDecoder('shift_jis').decode(bytes);}
    };
    const entries=raw.map(row=>({name:decode(row[1]),source:decode(zlib.inflateSync(row[2]))}));
    const {result:probe}=await request('rgss-load-scripts',{entries});
    console.log('RGSS3 load attempt:',JSON.stringify(probe));
    if(probe.errors.length)console.log('First blocked script:',JSON.stringify(probe.errors[0]));
    if(process.argv.includes('--title-probe') && probe.errors.length===0){
      try{
        const run=await request('rgss-run',{source:`
          DataManager.create_game_objects
          $rgss_title_scene = Scene_Title.new
          $rgss_title_scene.start
          10.times { $rgss_title_scene.update }
          "Scene_Title.start and 10 updates completed: #{Graphics.frame_count} frames"
        `});
        assert.match(run.result,/Scene_Title\.start and 10 updates completed:/);
        for(const op of ['bitmap-load','bitmap-stretch-blt','bitmap-text','sprite-create','sprite-set','frame'])
          assert(rgssOps.some(event=>event.op===op),`Title must dispatch ${op} to browser Canvas`);
        assert(rgssOps.filter(event=>event.op==='frame').length>=11,'Title must update multiple frames');
        console.log('TITLE PROBE:',run.result);
        console.log('PASS: original game title script issued bitmap, stretch, text, sprite and frame commands to the browser RGSS3 bridge');
      }catch(error){console.log('TITLE PROBE BLOCKER:',error.message);throw error;}
    }
  }
  if (process.argv[2] && !process.argv[2].startsWith('--')) {
    const fs=require('node:fs');
    const {RGSS3Archive}=require('../src/archive.js');
    const {ArchiveSource}=require('../src/assets.js');
    const {MarshalReader}=require('../src/marshal.js');
    const {ScriptCatalog}=require('../src/scripts.js');
    global.VX={MarshalReader};
    const archive=await RGSS3Archive.open(await fs.openAsBlob(process.argv[2]));
    const scripts=await ScriptCatalog.load(new ArchiveSource(archive));
    const check=await request('compile',{entries:scripts.entries});
    assert.equal(check.result.total,scripts.entries.length);
    assert.equal(check.result.errors.length,0,JSON.stringify(check.result.errors.slice(0,2)));
    assert.equal(check.progress.at(-1).checked,scripts.entries.length);
    console.log(`PASS: Worker compiled real BLACK SOULS II Ruby scripts ${check.result.passed}/${check.result.total}`);
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>worker.terminate());
