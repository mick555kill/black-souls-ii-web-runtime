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
let scene,named=false,confirmed=false,last;
async function frame(){
 const next=Opal.SceneManager.$scene();
 if(scene!==next){if(scene){scene.$pre_terminate();scene.$terminate();}scene=next;scene.$start();scene.$post_start();}
 scene.$update();await new Promise(r=>setImmediate(r));
}
async function press(){heldKeys.add('ok');await frame();heldKeys.delete('ok');await frame();}
for(let i=0;i<5000;i++){
 await frame();const m=Opal.gvars.game_message, text=m.texts?.join(' '),w=scene.message_window;
 if(text&&text!==last){last=text;console.log(text);}
 if(scene.$$class===Opal.Scene_Title&&i===30)await press();
 if(scene.$$class===Opal.Scene_Name){const keyboard=scene.input_window, assert=require('node:assert/strict');
  const height=keyboard.$line_height();
  for(let i=0;i<keyboard.$item_max();i++){
   keyboard.$select(i);
   const rect=keyboard.$item_rect(i),cursor=keyboard.$cursor_rect();
   assert.equal(rect.y,Math.floor(i/10)*height);
   assert.equal(rect.x,(i%10)*32+(i%10>=5?16:0));
   assert.equal(cursor.x,rect.x);assert.equal(cursor.y,rect.y);
   assert.ok(rect.x+rect.width<=keyboard.$contents_width());
   assert.ok(rect.y+rect.height<=keyboard.height-keyboard.padding-keyboard.padding_bottom);
  }
  assert.equal(keyboard.$item_max(),90);
  scene.input_window.$select(0);await press();scene.input_window.$select(89);await press();named=true;}
 if(w?.choice_window?.active&&w.choice_window.openness===255){await press();confirmed=true;}
 else if(w?.pause){await press();}
 if(named&&confirmed&&text?.includes('choose your background')){console.log('PASS original windows');return;}
}
throw Error('Did not reach background selection');
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
