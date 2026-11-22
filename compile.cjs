const fs=require('node:fs'), path=require('node:path');
require('./vendor/opal.js');
require('./vendor/compiler.js');
Opal.require('corelib/string/unpack');
Opal.require('opal/compiler');
function compile(source,file){
 // Opal strings are immutable. Preserve reassignment at RGSS mutation sites.
 source=source.replace(/^(\s*)([a-z_]\w*)\.(g?sub)!\(/gm,'$1$2 = $2.$3(')
              .replace("l = line.sub!(mark, '')","l = line = line.sub(mark, '')");
 const compiler=Opal.Opal.Compiler.$new(source,Opal.hash({file,eval:true}));
 const js=String(compiler.$compile());
 new Function(js);
 return js;
}
module.exports=compile;
if(require.main===module){
 const scripts=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const dest=process.argv[3]||'game';fs.mkdirSync(dest,{recursive:true});
 const manifest=scripts.map(({id,name,source},index)=>{
  const file=String(index).padStart(3,'0')+'.js';
  try{fs.writeFileSync(path.join(dest,file),compile(source.replace(/\r\n/g,'\n'),name||file));return {index,id,name,file};}
  catch(e){return {index,id,name,error:String(e.message||e)};}
 });
 fs.writeFileSync(path.join(dest,'manifest.js'),'globalThis.gameScripts='+JSON.stringify(manifest)+';');
 const failures=manifest.filter(x=>x.error);
 console.log(manifest.length-failures.length,'/',manifest.length,failures);
 if(failures.length)process.exitCode=1;
}
