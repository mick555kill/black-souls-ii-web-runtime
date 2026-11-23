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
const project=await new VX.Project(src).initialize();
await prepareDatabase(project);
globalThis.loadMapData=async id=>{const key='data/map'+String(id).padStart(3,'0')+'.rvdata2';if(!database.has(key))database.set(key,rubyValue(await project.loadMap(id)));};
load('web/events.js'); load('web/native-ui.js');
Opal.DataManager.$init();
Opal.SceneManager.$goto(Opal.Scene_Title);
let scene;
async function frame(){
 const next=Opal.SceneManager.$scene();
 if(scene!==next){if(scene){scene.$pre_terminate();scene.$terminate();}scene=next;scene.$start();scene.$post_start();}
 scene.$update();await new Promise(r=>setImmediate(r));
}
await frame();scene.$command_new_game();await loadMapData(51);
const g=Opal.gvars,player=g.game_player;
player.$reserve_transfer(51,28,61,6);player.$perform_transfer();await frame();
async function move(key,n){heldKeys.add(key);for(let i=0;i<n;i++)await frame();heldKeys.delete(key);for(let i=0;i<20;i++)await frame();}
for(let i=0;i<120;i++)await frame();console.log('before',player.x,player.y);
await move('right',1);console.log('after',player.x,player.y);
await move('up',15);await move('ok',1);for(let i=0;i<100;i++)await frame();
const assert=require('node:assert/strict');
assert.equal(player.x,29);assert.equal(player.y,60);
assert.ok(g.game_message.texts.some(t=>t.includes('Meowrning!')));
await move('ok',1);
for(let i=0;i<140;i++)await frame();
assert.ok(g.game_message.texts.some(t=>t.includes('Wonderland')));
console.log('PASS Map 051: fog, movement, and next Cheshire Cat dialogue');
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
