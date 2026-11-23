// Use the imported game's RGSS windows, Window skin, actor portraits, and vocabulary.
const G=Opal.gvars;
// The name keyboard has two banks of five columns separated by 16 pixels.
const nameKeyboard=Opal.Window_NameInput.$$prototype;
nameKeyboard.$col_max=()=>10;
nameKeyboard.$row_max=()=>9;
nameKeyboard.$item_max=()=>90;
nameKeyboard.$item_rect=function(index){
 const column=index%10,row=Math.floor(index/10),height=this.$line_height();
 return Opal.Rect.$new(column*32+(column>=5?16:0),row*height,32,height);
};
function textTokens(text){
 text=String(text).replace(/\\\\/g,'\u0000').replace(/\\N\[(\d+)\]/gi,(_,i)=>G.game_actors['$[]'](+i).$name())
   .replace(/\\P\[(\d+)\]/gi,(_,i)=>G.game_party.$members()[+i-1]?.$name()||'')
   .replace(/\\V\[(\d+)\]/gi,(_,i)=>G.game_variables['$[]'](+i)).replace(/\\G\b/gi,()=>G.data_system.$currency_unit());
 return text.match(/\\[a-z]+(?:\[.*?\])?|\\[.!|^<>{}]/gi)===null?Array.from(text.replaceAll('\u0000','\\')):
   Array.from(text.matchAll(/\\[a-z]+(?:\[[^\]]*\])?|\\[.!|^<>{}]|[\s\S]/gi),m=>m[0]==='\u0000'?'\\':m[0]);
}
function glyph(win,token,pos){
 if(token==='\n'){pos.x=pos.left;pos.y+=win.$line_height();return;}
 if(token.length>1&&token.startsWith('\\')){
  const val=Number(token.match(/\[(\d+)\]/)?.[1]||0),key=token.slice(1).split('[')[0].toUpperCase();
  if(key==='C')win.$change_color(win.$text_color(val));
  else if(key==='I'){win.$draw_icon(val,pos.x,pos.y);pos.x+=24;}
  else if(key==='{')win.$make_font_bigger();else if(key==='}')win.$make_font_smaller();
  return;
 }
 const width=win.$text_size(token).$width();
 win.$contents().$draw_text(pos.x,pos.y,width*2+2,win.$line_height(),token);
 pos.x+=width;
}
Opal.Window_Base.$$prototype.$draw_text_ex=function(x,y,text){
 this.$reset_font_settings();const pos={x,y,left:x};
 for(const token of textTokens(text))glyph(this,token,pos);
 return pos.x-x;
};
Opal.Window_Base.$$prototype.$delete_special_characters=function(text){
 return String(text).replace(/\x1b(?:[a-z]+(?:\[[^\]]*\])?|.)?/gi,'');
};
function messageWindow(){return Opal.SceneManager.$scene().message_window;}
function endMessage(w){w['$pause='](false);w.$close();G.game_message.$clear();G.game_message['$visible='](false);}
globalThis.playerUI={
 message(text,p,withChoices,w=messageWindow()){
  const m=G.game_message;
  m['$face_name='](p[0]);m['$face_index='](p[1]);m['$background='](p[2]);m['$position='](p[3]);m['$visible='](true);
  m.$add(text);w.$update_background();w.$update_placement();w.$open();
  w.$new_page(text.split('\n',1)[0],Opal.hash());
  const pos={left:w.$new_line_x(),x:w.$new_line_x(),y:0},tokens=textTokens(text);
  let index=0,delay=0,waiting=false,automatic=false;
  return ()=>{
   if(!w['$open?']())return false;
   const confirm=hostMethods.inputTrigger('C')||hostMethods.inputTrigger('B');
   if(delay>0){delay--;return false;}
   if(waiting){if(!confirm)return false;waiting=false;w['$pause='](false);}
   if(index===tokens.length){
    if(withChoices)return true;
    if(!automatic&&!confirm){w['$pause='](true);return false;}
    endMessage(w);return true;
   }
   const count=hostMethods.inputPress('C')?tokens.length:1;
   for(let i=0;i<count&&index<tokens.length;i++){
    const token=tokens[index++];
    if(token==='\\.'||token==='\\|'){delay=token==='\\.'?15:60;break;}
    if(token==='\\!'){waiting=true;w['$pause='](true);break;}
    if(token==='\\^'){automatic=true;continue;}
    glyph(w,token,pos);
   }
   return false;
  };
 },
 choice(options,done,cancel,interpreter){
  const w=messageWindow(),m=G.game_message;let finished=false;
  const branches=[],labels=[],enabled=[];
  for(const [i,raw] of options.entries()){
   const visible=raw.match(/\s*if\(([^)]+)\)/i),enable=raw.match(/\s*en\(([^)]+)\)/i);
   if(visible&&!Opal.truthy(interpreter.$choice_eval(visible[1])))continue;
   branches.push(i);labels.push(raw.replace(visible?.[0]||'','').replace(enable?.[0]||'',''));
   enabled.push(!enable||Opal.truthy(interpreter.$choice_eval(enable[1])));
  }
  if(!labels.length){done(-1);endMessage(w);return ()=>true;}
  m.choices=labels;m.choice_enables=enabled;m.choice_cancel_type=cancel;
  branches.push(cancel-1);enabled.push(cancel>0);
  m.choice_proc=i=>{done(branches[i]);finished=true;};
  w.choice_window.$start();
  if(w.choice_window.index<0)w.choice_window.$select(0);
  return ()=>{if(!finished)return false;endMessage(w);return true;};
 },
 name(name,max,onName,actorId){
  Opal.SceneManager.$call(Opal.Scene_Name);Opal.SceneManager.$scene().$prepare(actorId,max);
  return ()=>Opal.SceneManager.$scene().$$class!==Opal.Scene_Name;
 }
};

const originalLineHeight=Opal.Window_Base.$$prototype.$calc_line_height;
Opal.Window_Base.$$prototype.$calc_line_height=function(text,restore=true){
 return originalLineHeight.call(this,String(text).split('\n',1)[0],restore);
};

// A troop event can wait for player input. Advance it once per browser frame.
const battleWindowHost=Opal.Scene_Battle.$$prototype;
battleWindowHost.$wait_for_message=function(){
 const m=G.game_message;
 const current=this.browserBattleMessage;
 if(!current && m.visible===true)return; // The troop interpreter owns its dialogue.
 // The message window keeps its displayed text in the first array entry.
 const queued=current ? m.texts.splice(1) : m.texts.splice(0);
 if(!queued.length)return;
 (this.browserMessageQueue??=[]).push({
  text:queued.join('\n'),params:[m.face_name,m.face_index,m.background,m.position]
 });
 if(!current)this.startBrowserBattleMessage();
};
battleWindowHost.startBrowserBattleMessage=function(){
 const next=this.browserMessageQueue.shift();
 this.browserBattleMessage=next
  ? playerUI.message(next.text,next.params,false,this.message_window)
  : null;
};
battleWindowHost.advanceBrowserBattleMessage=function(){
 Opal.Graphics.$update();
 Opal.Input.$update();
 this.message_window.$update();
 if(this.browserBattleMessage())this.startBrowserBattleMessage();
};
battleWindowHost.$process_event_te_a_resurrection=function(){
 if(this['$scene_changing?']()||this.browserBattleMessage)return;
 const troop=G.game_troop,it=troop.$interpreter();
 it.$update();troop.$setup_battle_event();this.$wait_for_message();
 this.browserTroopEvent=it['$running?']();
 if(this.browserTroopEvent||this.browserBattleMessage)return;
 if(troop['$all_dead?']())this.$wait_for_effect();
 this.$process_forced_action();Opal.BattleManager.$judge_win_loss();
};
const updateBattleScene=battleWindowHost.$update;
battleWindowHost.$update=function(){
 if(this.browserBattleMessage){
  this.advanceBrowserBattleMessage();
  return;
 }
 if(this.browserTroopEvent){
  this.$update_basic();
  this.$process_event();
  return;
 }
 return updateBattleScene.call(this);
};
