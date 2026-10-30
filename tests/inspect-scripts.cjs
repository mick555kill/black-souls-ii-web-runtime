// Read-only diagnostic for a user-provided VX Ace Scripts.rvdata2 file.
// Does not execute game scripts and does not bundle any game content.
const fs=require('node:fs');
const zlib=require('node:zlib');
const {MarshalReader}=require('../src/marshal.js');
const filename=process.argv[2];
if(!filename)throw Error('Usage: node tests/inspect-scripts.cjs path/to/Scripts.rvdata2 [filter]');
const entries=new MarshalReader(fs.readFileSync(filename),{rawStrings:true}).parse();
const filter=(process.argv[3]||'').toLowerCase();
const decode=b=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{return new TextDecoder('shift_jis').decode(b);}};
entries.forEach((e,i)=>{
  const name=decode(e[1]),text=decode(zlib.inflateSync(e[2]));
  if(!filter||name.toLowerCase().includes(filter))console.log(String(i).padStart(3,'0'),JSON.stringify(name),'length',text.length);
});
