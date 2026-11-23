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

const ids=project.mapIds();
const mode=process.argv[3]||'maps';
const errors=[];let passed=0;
const short=e=>String(e.message||e).split(' for #<')[0].slice(0,150);
const troops=Opal.gvars.data_troops.map((t,i)=>t!==Opal.nil?i:0).filter(Boolean);
for(const id of mode==='maps'?ids:mode.startsWith('troops')?troops:mode.split(',')){
 let scene;
 try{
  Opal.DataManager.$setup_new_game();
  const g=Opal.gvars;
  if(mode==='maps'){
   await loadMapData(id);g.game_player.$reserve_transfer(id,0,0,2);g.game_player.$perform_transfer();
   Opal.SceneManager.$goto(Opal.Scene_Map);
  }else{
   if(id==='Battle'||mode.startsWith('troops')){
    Opal.SceneManager.$goto(Opal.Scene_Map);Opal.SceneManager.$snapshot_for_background();
    const it=Opal.Game_Interpreter.$new();it.$setup(rubyValue([{__class:'RPG::EventCommand',code:301,indent:0,parameters:[0,mode.startsWith('troops')?id:Number(process.env.TROOP||1),true,true]},{__class:'RPG::EventCommand',code:0,indent:0,parameters:[]}]),0);it.$update();
    require('node:assert/strict').equal(Opal.SceneManager.$scene().$$class,Opal.Scene_Battle);Opal.BattleManager.$save_bgm_and_bgs();
   }
   if(id==='Menu')Opal.Window_MenuCommand.$init_command_position();
   if(id==='Skill'||id==='Equip'||id==='Status')g.game_party['$menu_actor='](g.game_party.$leader());
   if(id!=='Battle'&&!mode.startsWith('troops'))Opal.SceneManager.$goto(Opal['Scene_'+id]);
  }
  scene=Opal.SceneManager.$scene();scene.$start();if(mode==='troops-live'){globalThis.testScene=scene;vm.runInThisContext('testScene.$post_start();for(let i=0;i<3;i++)testScene.$update();',{timeout:350});}else if(mode!=='troops')scene.$post_start();
  if(!mode.startsWith('troops'))for(let n=0;n<3;n++)scene.$update();
  if(id==='Save'){
   const assert=require('node:assert/strict');g.game_variables['$[]='](8,3);
   assert.equal(Opal.DataManager.$save_game(0),true);g.game_variables['$[]='](8,2);Opal.DataManager.$create_game_objects();
   assert.equal(Opal.DataManager.$load_game(0),true);assert.equal(Opal.gvars.game_variables['$[]'](8),3);
   assert.equal(Opal.gvars.game_map.map_id,project.system.start_map_id);
  }
  scene.$terminate();passed++;
 }catch(e){errors.push([id,short(e)]);if(errors.length<5)console.log('FAIL',id,short(e),e.stack?.split('\n').slice(1,4).join(' '));}
 if(mode==='maps'&&id!==project.system.start_map_id){database.delete('data/map'+String(id).padStart(3,'0')+'.rvdata2');if(id%50===0)console.log('map',id);}
}
console.log(JSON.stringify({passed,errors}));if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(String(e.message).slice(0,300));process.exitCode=1;});
