const fs=require('node:fs'),vm=require('node:vm');
const dir=process.argv[2];
if(!dir)throw Error('Usage: node playtest-phases.cjs path/to/Game.rgss3a');
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
await loadMapData(51);
const player=g.game_player;
player.$reserve_transfer(51,28,61,6);player.$perform_transfer();
const assert=require('node:assert/strict');

const controls=new Map();globalThis.el=id=>{if(!controls.has(id))controls.set(id,{checked:false});return controls.get(id);};
load('web/cheats.js');
const actor=g.game_party.$leader();
const troopData=await project.data('Troops');
let encounters=0,changes=0;
for(const troop of troopData.filter(Boolean)){
 const commands=troop.pages.flatMap(p=>p.list).filter(c=>[335,336].includes(c.code));
 if(!commands.length)continue;
 encounters++;Opal.BattleManager.$setup(troop.id,true,true);
 for(const c of commands){
  const enemies=g.game_troop.$members(),targets=c.parameters[0]<0?enemies:[enemies[c.parameters[0]]].filter(Boolean);
  const it=g.game_troop.$interpreter();
  it.$setup(rubyValue([c]));it.$update();
  for(const enemy of targets){
   if(c.code===336)assert.equal(enemy.$enemy_id(),c.parameters[1]);
   else assert.equal(enemy['$hidden?'](),false);
  }
  changes++;
 }
}
console.log('PASS scripted appear/transform commands',changes,'across troops',encounters);
Opal.BattleManager.$setup(324,true,true);
Opal.SceneManager.$call(Opal.Scene_Battle);const scene=Opal.SceneManager.$scene();
const troop=g.game_troop,enemy=troop.$members()[0],it=troop.$interpreter();
for(const checked of [false,true,false]){
 el('one-hit').checked=checked;enemy.$recover_all();enemy.$result().$clear();
 const hp=enemy.$hp();enemy.$result()['$hp_damage='](17);enemy.$execute_damage(actor);
 assert.equal(enemy.$hp(),checked?0:hp-17);
}
enemy.$recover_all();Opal.BattleManager.phase='turn';
troop.$setup_battle_event();
it.$update(); // turn-zero protection
for(const [hp,expected] of [[Math.floor(enemy.$mhp()*.49),276],[1,277]]){
 enemy['$hp='](hp);
 for(let n=0;n<500;n++){
  if(!it['$running?']())troop.$setup_battle_event();
  it.$update();
  if(enemy.$enemy_id()===expected&&!it['$running?']())break;
 }
 assert.equal(enemy.$enemy_id(),expected);
}
assert.ok(enemy.$hp()>1);
Opal.BattleManager.$setup(126,true,true);
const wounded=g.game_troop.$members()[0];
Opal.BattleManager.phase='turn';
wounded['$hp='](0);
assert.equal(Opal.BattleManager.$judge_win_loss(),false);
assert.equal(Opal.SceneManager.$scene(),scene);
assert.equal(g.game_troop.$interpreter()['$running?'](),true);
g.game_party.in_battle=true;
const forced=g.game_troop.$interpreter();
forced.$setup(rubyValue([{__class:'RPG::EventCommand',code:339,indent:0,parameters:[0,0,1,0]}]));
wounded.$recover_all();forced.$update();forced.$update();
assert.equal(Opal.BattleManager['$action_forced?'](),true);
assert.equal(Opal.BattleManager.$action_forced_battler(),wounded);
Opal.BattleManager.$clear_action_force();forced.$update();
assert.equal(forced['$running?'](),false);g.game_party.in_battle=false;
console.log('PASS White Rabbit Node phases 275 → 276 → 277, one-hit off/on/off');
await loadMapData(2);player.$reserve_transfer(2,10,10,2);player.$perform_transfer();
const ev=(await project.loadMap(2)).events[58],page=ev.pages.find(p=>p.list.some(c=>c.code===401&&c.parameters[0].includes('Run, over here!')));
const pos=page.list.findIndex(c=>c.code===401&&c.parameters[0].includes('Run, over here!'));
const map=g.game_map,mi=Opal.Game_Interpreter.$new();
map.$start_scroll(2,15,6);mi.$setup(rubyValue(page.list.slice(pos+1)),58);
for(let n=0;n<600&&mi['$running?']();n++){mi.$update();map.$update_scroll();}
assert.equal(mi['$running?'](),false);assert.equal(g.game_switches['$[]'](178),true);
console.log('PASS Map 002 Holmes scroll and continuation');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
