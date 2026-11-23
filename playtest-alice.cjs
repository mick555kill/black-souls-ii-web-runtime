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
await frame();scene.$command_new_game();await loadMapData(7);
const g=Opal.gvars,player=g.game_player;
player.$reserve_transfer(7,10,9,2);player.$perform_transfer();await frame();
const cmd=(await project.loadMap(7)).events[1].pages.find(p=>p.list.some(c=>c.code===201&&c.parameters[1]===110)).list;
g.game_map.interpreter.$setup(rubyValue(cmd.slice(cmd.findIndex(c=>c.code===201&&c.parameters[1]===110)-1)),1);
Opal.Graphics['$brightness='](0);
let last, selected=false;
for(let i=0;i<1200;i++){
 await frame();
 const w=scene.message_window,c=w.choice_window,m=g.game_message;
 const key=[g.game_map.map_id,m.texts.join('|'),m.choices.join('|'),c.active,c.openness,w.openness,Opal.Graphics.$brightness()].join(';');
 if(last!==key && (i%10===0||c.active&&c.openness===255))console.log(i,key,'Z',w.z,c.z,'VP',c.viewport?.z);
 last=key;
 if(c.active&&c.openness===255){if(m.choices.includes('Mother Alice')){const assert=require('node:assert/strict');
 const picture=scene.spriteset.picture_sprites.find(s=>s?.picture?.name==='black');
 assert.ok(picture,'expected the actual black backdrop');
 const layer=s=>s.viewport===Opal.nil?s.z:s.viewport.z;
 assert.ok(layer(c)>layer(picture),'choice behind backdrop: '+layer(c)+' <= '+layer(picture));
 assert.ok(c.visible&&c.x>=0&&c.y>=0&&c.x+c.width<=640&&c.y+c.height<=480);
 c.$select(Number(process.argv[3]||0));selected=true;}heldKeys.add('ok');await frame();heldKeys.delete('ok');}
 else if(w.pause){heldKeys.add('ok');await frame();heldKeys.delete('ok');}
 if(selected&&g.game_variables['$[]'](8)>0){require('node:assert/strict').equal(g.game_variables['$[]'](8),1+Number(process.argv[3]||0));console.log('SELECTED',g.game_variables['$[]'](8));return;}
}
throw Error('Alice choices did not open');
})().catch(e=>{console.error(String(e.message).slice(0,400),e.stack?.slice(0,500));process.exitCode=1});
