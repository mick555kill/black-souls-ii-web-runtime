// Look up display strings only. Event scripts, asset paths and save data keep their original values.
globalThis.thaiLocale=(()=>{
 const normalize=text=>text.replace(/\s+/gu,' ').trim();
 const reviewed=new Map([...thaiLines].map(([s,t])=>[normalize(s),t]));
 // Reviewed, concise fantasy terminology for fixed UI strings.
 const fantasyTerms=new Map([
  ['Load','คืนบันทึก'],['Load Game','คืนบันทึกเกม'],['Save','บันทึก'],['Save Game','บันทึกเกม'],
  ['Travel','เดินทาง'],['Rest','พักแรม'],['Bonfire','กองเพลิง'],['Covenant','พันธสัญญา'],['Covenants','พันธสัญญา'],
  ['Soul','ดวงวิญญาณ'],['Souls','ดวงวิญญาณ'],['Souls on hand:','ดวงวิญญาณที่ครอบครอง:'],
  ['Souls on Hand','ดวงวิญญาณที่ครอบครอง'],['Give souls','ถวายดวงวิญญาณ'],
  ['Level Up','ยกระดับพลัง'],['Level up','ยกระดับพลัง'],['Lost Soul','วิญญาณเร่ร่อน'],
  ['Nameless Forest','พงไพรไร้นาม'],['Library Dream','ฝันแห่งหอสมุด'],
  ['Library','หอสมุด'],['Bonfire Ascetic','นักพรตแห่งกองเพลิง'],
  ['Save to which file?','จะจารึกบันทึกไว้ที่ใด?'],['Load which file?','จะคืนบันทึกใด?']
 ]);
 for(const [source,translation] of fantasyTerms)reviewed.set(normalize(source),translation);
 const pack=globalThis.thaiPack;
 const cache=new Map();
 function key(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return (h>>>0).toString(36);
 }
 function exact(source){return reviewed.get(source)??pack.lines[key(source)];}
 const suffixes=new Set(pack.battleSuffixes);
 const locale={enabled:true,revision:0};
 // Script messages may be assembled as a name followed by a skill or state result.
 function assembled(value,s){
  if(value.includes('\n'))return value.split('\n').map(text).join('\n');
  const file=/^(File)\s+(\d+)$/.exec(s);
  if(file)return 'ช่องบันทึก '+file[2];
  const shift=s.match(/^(.+?)(\+\d+)$/);
  if(shift){const base=exact(shift[1].trim());if(base!==undefined)return base+shift[2];}
  for(const match of s.matchAll(/\s+/g)){
   const tail=s.slice(match.index+match[0].length);
   if(!suffixes.has(key(tail)))continue;
   const name=s.slice(0,match.index);
   return displayName(name)+' '+(exact(tail)??tail);
  }
  return value;
 }
 function text(value){
  if(!locale.enabled||typeof value!=='string'||!value.length||!/[a-z\u3040-\u9fff]/i.test(value))return value;
  if(cache.has(value))return cache.get(value);
  const s=normalize(value),result=exact(s);
  if(result===undefined)return assembled(value,s);
  if(cache.size>=4096)cache.clear();
  cache.set(value,result);return result;
 }
 function displayName(name){
  if(!locale.enabled)return name;
  const actors=Opal.gvars.game_actors?.data;
  if(Array.isArray(actors)&&actors.some(a=>a?.name===name&&a.name!==a.$actor().name))return name;
  return exact(normalize(String(name)))??name;
 }
 locale.text=text;locale.displayName=displayName;
 locale.setEnabled=enabled=>{
  if(locale.enabled===enabled)return;
  locale.enabled=enabled;locale.revision++;cache.clear();
  if(typeof document!=='undefined')document.dispatchEvent(new Event('game-language-change'));
 };
 // Translate the format and its display arguments before Ruby inserts them. Restrict this to game vocabulary.
 const templates=new Set([...reviewed.keys()].filter(s=>s.includes('%s')));
 const sprintf=Opal.Kernel.$$prototype.$sprintf;
 Opal.defn(Opal.Kernel,'$sprintf',function(format,...args){
  if(locale.enabled&&templates.has(format)){
   format=exact(format);
   args=args.map(a=>typeof a==='string'?displayName(a):a);
  }
  return sprintf.call(this,format,...args);
 });
 const toggle=globalThis.document?.getElementById('thai-toggle');
 if(toggle){
  try{locale.enabled=localStorage.getItem('bs2.thai')!=='0';}catch{}
  toggle.checked=locale.enabled;
  toggle.onchange=()=>{
   try{localStorage.setItem('bs2.thai',toggle.checked?'1':'0');}catch{}
   locale.setEnabled(toggle.checked);
  };
 }
 return locale;
})();
