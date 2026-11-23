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
load('web/formulas.js');load('web/saves.js');load('web/events.js');load('web/native-ui.js');
Opal.DataManager.$init();const assert=require('node:assert/strict'),dm=Opal.DataManager,g=Opal.gvars;
if(process.argv[3]==='write'){
 dm.$setup_new_game();await loadMapData(51);
 g.game_player.$reserve_transfer(51,28,61,6);g.game_player.$perform_transfer();
 g.game_variables['$[]='](8,3);g.game_switches['$[]='](107,true);
 assert.equal(dm.$save_game(0),true);console.log('Saved Map 051');
}else{
 assert.equal(dm['$save_file_exists?'](),true);assert.ok(dm.$load_header(0)!==Opal.nil);
 assert.equal(dm.$load_game(0),true);g.game_system.$on_after_load();
 assert.deepEqual([g.game_map.map_id,g.game_player.x,g.game_player.y,g.game_variables['$[]'](8),g.game_switches['$[]'](107)],[51,28,61,3,true]);
 Opal.SceneManager.$goto(Opal.Scene_Map);const scene=Opal.SceneManager.$scene();scene.$start();scene.$post_start();
 heldKeys.add('right');scene.$update();heldKeys.delete('right');for(let i=0;i<100;i++)scene.$update();
 assert.equal(g.game_player.x,29);console.log('Restored map, coordinates, variable, switch and walked');
}
})().catch(e=>{console.error(String(e.message).slice(0,400),e.stack?.slice(0,600));process.exitCode=1;});
