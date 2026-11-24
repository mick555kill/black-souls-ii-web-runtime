const fs=require('node:fs'),vm=require('node:vm');
const dir=process.argv[2];
if(!dir)throw Error('Usage: node playtest-combat.cjs path/to/Game.rgss3a [escape|multi-hit|rabbit-boss]');
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

const assert=require('node:assert/strict');
const escape=process.argv[3]==='escape';
const rabbitBoss=process.argv[3]==='rabbit-boss';
const multiHit=process.argv[3]==='multi-hit';
const g=Opal.gvars;Opal.DataManager.$setup_new_game();Opal.SceneManager.$goto(Opal.Scene_Map);
const transfer=rabbitBoss?[52,18,28,8]:[51,28,61,6];
await loadMapData(transfer[0]);
const player=g.game_player;
player.$reserve_transfer(...transfer);player.$perform_transfer();
if(multiHit||rabbitBoss){
 g.game_party.$remove_actor(1);g.game_party.$add_actor(3);
 assert.equal(g.game_party.$leader().$mhp(),538);
}
const troopId=rabbitBoss?174:escape?22:1;
Opal.SceneManager.$snapshot_for_background();Opal.BattleManager.$setup(troopId,!rabbitBoss,true);Opal.BattleManager.$save_bgm_and_bgs();
Opal.SceneManager.$call(Opal.Scene_Battle);const scene=Opal.SceneManager.$scene();scene.$start();scene.$post_start();
const enemy=g.game_troop.$members()[0];
const initial=enemy.$hp();
let attacked=false,usedRun=false,survivedHit=false;
let healed=false,visible=false,usedPhaseSkill=false,regainedInput=false,hitSecondForm=false;
if(rabbitBoss){
 assert.equal(enemy.$enemy_id(),185);
 const useItem=scene.$use_item;
 scene.$use_item=function(){
  const subject=this.subject,skill=subject.$current_action().$item();
  const secondForm=enemy.$enemy_id()===184,before=enemy.$hp();
  const result=useItem.call(this);
  if(secondForm && subject===enemy && skill.id===52)usedPhaseSkill=true;
  if(secondForm && regainedInput && subject['$actor?']() && enemy.$hp()>0 && enemy.$hp()<before)hitSecondForm=true;
  return result;
 };
}
for(let i=0;i<2400 && (Opal.SceneManager.$scene()===scene || scene.browserBattleMessage);i++){
 if(i%8===0)heldKeys.add('ok');else heldKeys.delete('ok');
 if(Opal.SceneManager.$scene()!==scene){scene.advanceBrowserBattleMessage();continue;}
 if(escape && attacked && !scene.browserBattleMessage && String(Opal.BattleManager.phase)==='input'){
  // Guarantee a successful roll while using the game's actual Run handler.
  Opal.BattleManager.preemptive=true;
  scene.$command_escape();usedRun=true;
 }else scene.$update();
 if(rabbitBoss && enemy.$enemy_id()===184){
  healed ||= enemy.$hp()===enemy.$mhp();
  const sprite=scene.spriteset.enemy_sprites.find(s=>s.battler===enemy);
  const bitmap=Opal.Cache.$battler(enemy.$battler_name(),enemy.$battler_hue());
  visible ||= enemy.$hp()===enemy.$mhp() && sprite.visible && sprite.opacity>0 && sprite.bitmap===bitmap && bitmap.width>1;
  regainedInput ||= scene.actor_command_window.active && !scene.browserTroopEvent;
  if(usedPhaseSkill && hitSecondForm)break;
 }
 attacked ||= enemy.$hp()<initial;
 survivedHit ||= enemy.$hp()>0 && enemy.$hp()<initial;
}
if(rabbitBoss){
 assert.ok(healed,'scripted transformation and full heal');
 assert.ok(visible,'second form visible before taking damage');
 assert.ok(usedPhaseSkill,'second form uses Slice Neck Prepare');
 assert.ok(regainedInput,'battle command input returns');
 assert.ok(hitSecondForm,'player attack damages the second form');
 console.log('PASS Headhunting Beast appears at full HP, uses Slice Neck Prepare and takes damage from the player');return;
}
assert.ok(attacked,'attack must reach the target');
if(multiHit)assert.ok(survivedHit,'damage numbers must expire while the enemy survives');
if(escape)assert.ok(usedRun && g.game_troop.$alive_members().length>0,'successful Run against a living target');
else assert.equal(enemy.$hp(),0);
assert.equal(scene.browserBattleMessage,null);
const mapScene=Opal.SceneManager.$scene();assert.equal(mapScene.$$class,Opal.Scene_Map);
scene.$pre_terminate();scene.$terminate();mapScene.$start();mapScene.$post_start();heldKeys.clear();
for(let i=0;i<120;i++)mapScene.$update();
assert.equal(g.game_message['$busy?'](),false);
assert.equal(player['$movable?'](),true);
const x=player.x;
heldKeys.add('right');mapScene.$update();heldKeys.clear();
assert.equal(player.x,x+1,'must walk on the returned map');
console.log('PASS attack,',escape?'Run':'victory', 'and walking on Map 051');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
