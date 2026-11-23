const fs=require('node:fs'),vm=require('node:vm');
const dir=process.argv[2];
if(!dir)throw Error('Usage: node playtest.cjs path/to/Game.rgss3a');
require('./vendor/opal.js');require('./vendor/compiler.js');require('./game/manifest.js');require('./adapters/generated.js');
const load=file=>vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
load('web/host.js');
load('web/images.js');
for(const file of ['adapters/graphics.js','adapters/rgss3-rpg-classes.js',...gameScripts.filter(s=>s.name!=='Main').map(s=>'game/'+s.file)])new Function('self',fs.readFileSync(file,'utf8'))(Opal.top);
for(const file of ['archive','assets','marshal','project','data'])load('web/'+file+'.js');
(async()=>{
const src=new VX.ArchiveSource(await VX.RGSS3Archive.open(await fs.openAsBlob(dir)));
await indexImageSizes(src.archive,{index:new Map()});
const project=await new VX.Project(src).initialize();
await prepareDatabase(project);
globalThis.loadMapData=async id=>{const key='data/map'+String(id).padStart(3,'0')+'.rvdata2';if(!database.has(key))database.set(key,rubyValue(await project.loadMap(id)));};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};load('web/formulas.js');load('web/saves.js');
load('web/events.js'); load('web/native-ui.js');
Opal.DataManager.$init();
Opal.SceneManager.$goto(Opal.Scene_Title);

const g=Opal.gvars;Opal.DataManager.$setup_new_game();Opal.SceneManager.$goto(Opal.Scene_Map);
Opal.SceneManager.$snapshot_for_background();Opal.BattleManager.$setup(1,true,true);Opal.BattleManager.$save_bgm_and_bgs();
Opal.SceneManager.$call(Opal.Scene_Battle);const scene=Opal.SceneManager.$scene();scene.$start();scene.$post_start();
const enemy=g.game_troop.$members()[0],initial=enemy.$hp();
for(let i=0;i<1800&&Opal.SceneManager.$scene()===scene;i++){
 if(i%8===0)heldKeys.add('ok');else heldKeys.delete('ok');
 scene.$update();
 
 if(i%300===0)console.log(i,Object.keys(scene).filter(k=>scene[k]?.active===true),g.game_message.texts);
}
const assert=require('node:assert/strict');assert.equal(enemy.$hp(),0);assert.equal(Opal.SceneManager.$scene().$$class,Opal.Scene_Map);console.log('PASS victory and return to map',initial,enemy.$hp());
})().catch(e=>{console.error(String(e.message).slice(0,300),e.stack?.slice(0,3500));process.exitCode=1;});
