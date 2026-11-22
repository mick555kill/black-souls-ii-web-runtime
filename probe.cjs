const fs=require('node:fs');
require('./vendor/opal.js');
require('./game/manifest.js');
function run(file){new Function('self',fs.readFileSync(file,'utf8'))(Opal.top);}
globalThis.rgssHost={$resize(){},$frame(){}};
run('adapters/graphics.js');run('adapters/rgss3-rpg-classes.js');
const compile=require('./compile.cjs');
const generated=new Map();
Opal.compile=(source,opts)=>{ const js=String(Opal.Opal.Compiler.$new(source,Opal.hash({...opts,eval:true})).$compile());generated.set(source,js);return js; };
Opal.defn(Opal.Kernel,'$eval',function(source){
 if(!generated.has(source))generated.set(source,compile(String(source),'generated-method'));
 return new Function('self','return '+generated.get(source))(this);
});
for(const s of gameScripts){
 if(s.name==='Main')continue;
 try{run('game/'+s.file)}catch(e){console.error(s.index,s.name,e.message);process.exit(1);}
}
fs.writeFileSync('adapters/generated.js','globalThis.dynamicMethods='+JSON.stringify(Object.fromEntries(generated))+';');
console.log('223 modules initialized',generated.size);
