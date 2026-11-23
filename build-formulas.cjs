// Compile original database formulas with explicit RGSS bindings for attacker, target and variables.
const fs=require('node:fs'),path=require('node:path'),compile=require('./compile.cjs');
const formulas=new Set();
for(const db of ['Skills','Items']){
 const entries=JSON.parse(fs.readFileSync(path.join(process.argv[2],db+'.json'),'utf8'));
 for(const item of entries)if(item?.damage?.formula?.trim())formulas.add(item.damage.formula);
}
const table=[...formulas].map(f=>JSON.stringify(f).replace(/#\{/g,'\\#{')+' => ->(a,b,v) { '+f+'\n}').join(',\n');
const src='class RPG::UsableItem::Damage\n FORMULAS = {\n'+table+'\n}\n def eval(a,b,v)\n fn=FORMULAS[@formula]\n return 0 unless fn\n [instance_exec(a,b,v,&fn),0].max * sign rescue 0\n end\nend';
fs.writeFileSync('web/formulas.js','(function(self){'+compile(src,'damage_formulas')+'})(Opal.top);');
console.log(formulas.size+' formulas compiled');
