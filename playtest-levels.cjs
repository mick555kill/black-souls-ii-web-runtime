// Exercise the browser's compiled level-limit plugin without a game archive.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
require('./vendor/opal.js');require('./vendor/compiler.js');require('./adapters/generated.js');
for(const file of ['host','definitions'])vm.runInThisContext(fs.readFileSync('web/'+file+'.js','utf8'),{filename:file});

const actor=Opal.Game_Actor.$allocate();
const base=(stat,level)=>100+stat+level*3;
actor.$class=()=>({$params:()=>({'$[]':base})});
actor.$param_base_lb=id=>base(id,actor.level);
let note='100',bonus=8;
const feature={$olv_extend:()=>note,$bonus:()=>bonus};
actor.$feature_objects=()=>[feature];
const savedCompile=Opal.compile;
let compiles=0;
Opal.compile=(...args)=>{compiles++;return savedCompile(...args);};
try{
  for(const level of [1,50,99,100,500,999]){
    actor.level=level;
    for(let id=0;id<8;id++){
      const expected=base(id,Math.min(level,99))+Math.trunc(3*Math.max(0,level-99)*1.05);
      assert.equal(actor.$param_base(id),expected);
      assert.equal(actor.level,level);
    }
  }
  const klass=Opal.RPG.Class.$allocate();
  klass.$exp_for_level_etc_array=l=>l*100;
  let entries=[[5,'10'],[9,'2.5']];
  klass.$etc_array=()=>entries;
  assert.equal(klass.$exp_for_level(4),400);
  assert.equal(klass.$exp_for_level(10),1065);
  assert.equal(compiles,0,'numeric modifiers entered the Ruby compiler');
  entries=[[5,'10'],[9,'r + level']];
  assert.equal(klass.$exp_for_level(10),1200);
  assert.equal(klass.$exp_for_level(11),1413);
  note='150';assert.equal(actor.$olextend_data_2(),1.5);
  note='data + f.bonus';assert.equal(actor.$olextend_data_2(),1.08);
  bonus=20;assert.equal(actor.$olextend_data_2(),1.2);
  note='100';assert.equal(actor.$olextend_data_2(),1);
  console.log('Levels 1–999, all eight stats, equipment changes and evaluated Ruby notes passed');
}finally{Opal.compile=savedCompile;}
