// Run with the English Game.rgss3a. Exercise the Library Dream NPC through her normal map event and windows.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const archive=process.argv[2];
if(!archive)throw Error('Usage: node playtest-node.cjs Game.rgss3a');
const load=f=>vm.runInThisContext(fs.readFileSync(f,'utf8'),{filename:f});
require('./vendor/opal.js');require('./vendor/compiler.js');require('./game/manifest.js');require('./adapters/generated.js');
load('web/host.js');load('web/images.js');
for(const f of ['adapters/graphics.js','adapters/rgss3-rpg-classes.js',...gameScripts.filter(s=>s.name!=='Main').map(s=>'game/'+s.file)])
 new Function('self',fs.readFileSync(f,'utf8'))(Opal.top);
for(const f of ['archive','assets','marshal','project','data','events','thai-pack','thai-lines','thai','native-ui'])load('web/'+f+'.js');
(async()=>{
 const src=new VX.ArchiveSource(await VX.RGSS3Archive.open(await fs.openAsBlob(archive)));
 await indexImageSizes(src.archive,{index:new Map()});
 const project=await new VX.Project(src).initialize();await prepareDatabase(project);
 globalThis.loadMapData=async id=>{
  const key='data/map'+String(id).padStart(3,'0')+'.rvdata2';
  if(!database.has(key))database.set(key,rubyValue(await project.loadMap(id)));
 };
 await loadMapData(101);Opal.DataManager.$init();Opal.DataManager.$setup_new_game();
 const g=Opal.gvars,player=g.game_player,party=g.game_party;
 const actor=g.game_actors['$[]'](1),startExp=actor.$exp();
 g.game_self_switches['$[]=']([101,9,'A'],true);g.game_variables['$[]='](14,1);
 party.$gain_gold(12);actor['$name=']('Save');
 player.$reserve_transfer(101,23,27,8);player.$perform_transfer();
 Opal.SceneManager.$goto(Opal.Scene_Map);const scene=Opal.SceneManager.$scene();scene.$start();scene.$post_start();
 const m=g.game_message,w=scene.message_window;
 const frame=()=>scene.$update();
 function until(check,what){for(let i=0;i<900;i++){if(check())return;frame();}throw Error('Timed out at '+what+' '+JSON.stringify([m.texts,m.choices,w.number_window.active,player.x,player.y]));}
 function press(key){heldKeys.add(key);frame();heldKeys.delete(key);frame();}
 function confirmText(){
  until(()=>w.pause&&w['$open?'](),'message confirmation');
  press('ok');
 }
 function choose(index){
  until(()=>w.choice_window.active&&w.choice_window['$open?'](),'choice');
  assert.ok(index>=0&&index<m.choices.length,'choice '+index+' in '+JSON.stringify(m.choices));
  for(let i=0;i<m.choices.length&&w.choice_window.index!==index;i++)press('down');
  assert.equal(w.choice_window.index,index);
  press('ok');
 }
 function begin(){
  until(()=>player['$movable?'](),'walkable map');press('ok');
  until(()=>w.choice_window.active,'Node menu');
  assert.equal(m.choices[0],'เพิ่มระดับ');assert.ok(m.choices.includes('จากไป'),'both choice groups');choose(0);
  until(()=>m.texts.some(t=>t.includes('clasp my hand')),'prayer');
  assert.ok(textTokens(thaiLocale.text(m.texts[0])).join('').includes('Save'),'keep the player-entered name');
  confirmText();
  until(()=>w.number_window.active,'number window');assert.equal(w.number_window.digits_max,6);
  assert.equal(w.number_window.number,0);assert.ok(w.gold_window.openness>0);
 }
 function leave(){
  confirmText();
  until(()=>!g.game_map.$interpreter()['$running?']()&&player['$movable?'](),'finish conversation');
 }
 begin();press('ok');
 until(()=>m.texts.some(t=>t.includes('Should we stop')),'zero branch');leave();
 assert.equal(party.$gold(),12);assert.equal(actor.$exp(),startExp);
 begin();press('left');press('up');press('up');
 assert.equal(w.number_window.number,2);press('ok');
 until(()=>m.texts.some(t=>t.includes('power of souls')),'positive branch');leave();
 assert.equal(party.$gold(),10);assert.equal(actor.$exp(),startExp+2);
 begin();press('up');assert.equal(w.number_window.number,10,'limited to remaining souls');press('ok');
 until(()=>m.texts.some(t=>t.includes('power of souls')),'upper limit');leave();
 assert.equal(party.$gold(),0);assert.equal(actor.$exp(),startExp+12);
 press('down');assert.equal(player.y,28);
 assert.equal(thaiLocale.text('New Game'),'เริ่มเกมใหม่');
 assert.equal(actor.$sprintf('%s took %s damage!','Save',32),'Save ได้รับความเสียหาย 32!');
 thaiLocale.setEnabled(false);assert.equal(thaiLocale.text('Attack'),'Attack');
 assert.equal(actor.$sprintf('%s took %s damage!','Save',32),'Save took 32 damage!');
 // The same adapter must wait for native item selection and scroll completion.
 const command=(code,parameters=[])=>rubyValue({__class:'RPG::EventCommand',indent:0,code,parameters});
 const it=g.game_map.$interpreter();
 it.$setup([command(101,['',0,0,2]),command(401,['Choose an item.']),command(104,[26]),command(0)],0);
 until(()=>w.item_window.active,'attached key-item input');
 press('cancel');until(()=>!it['$running?'](),'key-item cancellation');assert.equal(g.game_variables['$[]'](26),0);
 thaiLocale.setEnabled(true);
 it.$setup([command(105,[8,false]),command(405,['○Story']),command(0)],0);
 until(()=>g.game_message.scroll_mode,'scroll start');assert.deepEqual(g.game_message.texts,['○ เนื้อเรื่อง']);
 until(()=>!it['$running?'](),'scroll end');
 console.log('PASS Map 101 event 9 → CE35, 0/2/maximum input, exact souls and EXP, return to walking, Thai / English and player name');
})().catch(e=>{console.error(e.message,e.stack?.slice(0,1400));process.exitCode=1;});
