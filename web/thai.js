// Subtitles are display-only. Keep event text, wait codes and choice indices in RGSS.
globalThis.thaiCaptions=(()=>{
 const toggle=document.getElementById('thai-toggle'),caption=document.getElementById('thai-caption');
 const button=document.getElementById('thai-model'),info=document.getElementById('thai-info');
 let translator,current=null,options=[],revision=0;
 const cache=new Map();
 const clean=text=>text.replace(/\\(?:[CI]\[\d+\]|[.!|^<>{}])/gi,'').replace(/\s+/g,' ').trim();
 function resolve(text){
  return text.replace(/\\([NPGV])(?:\[(\d+)\])?/gi,(raw,key,index)=>{
   const g=Opal.gvars,i=Number(index);
   switch(key.toUpperCase()){
    case 'N':return g.game_actors['$[]'](i).$name();
    case 'P':return g.game_party.$members()[i-1]?.$name()||'';
    case 'V':return g.game_variables['$[]'](i);
    case 'G':return g.data_system.$currency_unit();
   }
  });
 }
 async function translate(text){
  if(thaiLines.has(text))return resolve(thaiLines.get(text));
  const plain=clean(text);
  if(!translator||!/[A-Za-z]{2,}/.test(plain))return null;
  if(cache.has(plain))return resolve(cache.get(plain));
  // Preserve dynamic values verbatim, including player-chosen names.
  const parts=plain.split(/(\\(?:[NPV]\[\d+\]|G\b))/gi);
  const result=[];
  for(const part of parts){
   if(!part.trim()||part.startsWith('\\'))result.push(part);
   else result.push(await translator.translate(part));
  }
  const translated=result.join('');
  if(cache.size>=512)cache.delete(cache.keys().next().value);
  cache.set(plain,translated);return resolve(translated);
 }
 async function refresh(){
  const token=++revision;
  caption.hidden=true;caption.textContent='';
  if(!toggle.checked)return;
  const list=[...(current?[current]:[]),...options];
  const lines=await Promise.all(list.map(s=>translate(s).catch(()=>null)));
  if(token!==revision||!lines.some(Boolean))return;
  const body=[];
  if(current&&lines[0])body.push(lines[0]);
  options.forEach((s,i)=>body.push((i+1)+'. '+(lines[i+Number(!!current)]||resolve(clean(s)))));
  caption.textContent=body.join('\n');caption.scrollTop=0;caption.hidden=false;
 }
 function settings(){
  button.hidden=!toggle.checked||!globalThis.Translator||!!translator;
  info.textContent=toggle.checked?(translator?'เปิดแปลอัตโนมัติแล้ว':'มีคำแปลบทนำในเครื่อง'):'';
  refresh();
 }
 try{toggle.checked=localStorage.getItem('bs2.thai')==='1';}catch{}
 toggle.onchange=()=>{
  try{localStorage.setItem('bs2.thai',toggle.checked?'1':'0');}catch{}
  settings();
 };
 button.onclick=async()=>{
  button.disabled=true;info.textContent='กำลังเตรียมตัวแปลในเครื่อง…';
  try{
   translator=await Translator.create({sourceLanguage:'en',targetLanguage:'th'});
   settings();
  }catch{info.textContent='ตัวแปลอัตโนมัติยังใช้ไม่ได้ เปิดอ่านซับบทนำได้';}
  finally{button.disabled=false;}
 };
 settings();
 return {
  message(text,position){current=text;options=[];caption.classList.toggle('low',position===0);refresh();},
  choices(labels){options=labels;refresh();},
  clear(){current=null;options=[];refresh();}
 };
})();
