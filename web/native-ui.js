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
const localText=text=>globalThis.thaiLocale?.text(text)??text;
const languageVersion=()=>globalThis.thaiLocale?.revision??0;
const thaiScript=/[\u0e01-\u0e5b]/;
const wordBreaks=typeof Intl.Segmenter==='function'?new Intl.Segmenter('th',{granularity:'word'}):null;
const clusters=typeof Intl.Segmenter==='function'?new Intl.Segmenter('th',{granularity:'grapheme'}):null;
function graphemes(text){
 return clusters?Array.from(clusters.segment(text),part=>part.segment):(text.match(/\P{M}\p{M}*|\p{M}+/gu)||[]);
}
// A Thai syllable's vowels and tone marks must be shaped together, including during the typewriter effect.
let literalTextDepth=0;
function literal(fn){literalTextDepth++;try{return fn();}finally{literalTextDepth--;}}
const bitmapText=rgssHost.$bitmapText,measureText=rgssHost.$measure;
rgssHost.$bitmapText=function(id,x,y,width,height,text,...style){
 return bitmapText(id,x,y,width,height,literalTextDepth?text:localText(text),...style);
};
rgssHost.$measure=function(text,...style){
 return measureText(literalTextDepth?text:localText(text),...style);
};
const actorName=Opal.Window_Base.$$prototype.$draw_actor_name;
Opal.Window_Base.$$prototype.$draw_actor_name=function(actor,...args){
 if(actor.$name()!==actor.$actor().name)return literal(()=>actorName.call(this,actor,...args));
 return actorName.call(this,actor,...args);
};
const nameBitmap=Opal.Cache.$name_bitmap;
if(nameBitmap)Opal.Cache.$name_bitmap=function(name){
 const shown=globalThis.thaiLocale?.displayName(name)??name;
 return literal(()=>nameBitmap.call(this,shown));
};
function textTokens(text){
 const displayName=name=>globalThis.thaiLocale?.displayName(name)??name;
 text=String(text).replace(/\\\\/g,'\u0000').replace(/\\N\[(\d+)\]/gi,(_,i)=>displayName(G.game_actors['$[]'](+i).$name()))
   .replace(/\\P\[(\d+)\]/gi,(_,i)=>displayName(G.game_party.$members()[+i-1]?.$name()||''))
   .replace(/\\V\[(\d+)\]/gi,(_,i)=>G.game_variables['$[]'](+i)).replace(/\\G\b/gi,()=>G.data_system.$currency_unit());
 const wrap=thaiScript.test(text);
 const tokens=[];
 for(const part of text.split(/(\\[a-z]+(?:\[[^\]]*\])?|\\[.!|^<>{}$]|\n|\u0000)/gi)){
  if(!part)continue;
  if(part==='\u0000'){tokens.push('\\');continue;}
  if(part==='\n'||part.startsWith('\\')){tokens.push(part);continue;}
  if(wrap&&wordBreaks)for(const word of wordBreaks.segment(part))tokens.push(word.segment);
  else tokens.push(...(wrap?graphemes(part):Array.from(part)));
 }
 return tokens;
}
function layoutText(w,text,left){
 const tokens=textTokens(text);
 if(!thaiScript.test(text))return tokens;
 const maxWidth=Math.max(1,w.$contents_width()-left),out=[],font=w.$contents().$font();
 const originalSize=font.$size(),widths=new Map();
 let width=0;
 function addWord(word,amount){
  if(width>0&&width+amount>maxWidth){out.push('\n');width=0;}
  if(width===0&&!word.trim())return;
  out.push(word);width+=amount;
 }
 try{
  for(const token of tokens){
   if(token==='\n'){out.push(token);width=0;continue;}
   if(token.length>1&&token.startsWith('\\')){
    if(/^\\I\[/i.test(token))addWord(token,24);
    else{
     out.push(token);
     if(token==='\\{')w.$make_font_bigger();else if(token==='\\}')w.$make_font_smaller();
    }
    continue;
   }
   const key=font.$size()+' '+token;
   if(!widths.has(key))widths.set(key,literal(()=>w.$text_size(token).$width()));
   const amount=widths.get(key);
   if(amount>maxWidth){
    for(const cluster of graphemes(token))addWord(cluster,literal(()=>w.$text_size(cluster).$width()));
   }else addWord(token,amount);
  }
 }finally{font['$size='](originalSize);}
 return out;
}
function glyph(win,token,pos){
 if(token==='\n'){pos.x=pos.left;pos.y+=win.$line_height();return;}
 if(token.length>1&&token.startsWith('\\')){
  const val=Number(token.match(/\[(\d+)\]/)?.[1]||0),key=token.slice(1).split('[')[0].toUpperCase();
  if(key==='C')win.$change_color(win.$text_color(val));
  else if(key==='I'){win.$draw_icon(val,pos.x,pos.y);pos.x+=24;}
  else if(key==='{')win.$make_font_bigger();else if(key==='}')win.$make_font_smaller();
  else if(key==='$'&&win.gold_window)openWallet(win);
  return;
 }
 literal(()=>{
  const width=win.$text_size(token).$width();
  win.$contents().$draw_text(pos.x,pos.y,width*2+2,win.$line_height(),token);
  pos.x+=width;
 });
}
Opal.Window_Base.$$prototype.$draw_text_ex=function(x,y,text){
 this.$reset_font_settings();const pos={x,y,left:x};
 const shown=localText(String(text));let tokens=layoutText(this,shown,x);
 if(thaiScript.test(shown)&&this.$$class===Opal.Window_Help){
  const font=this.$contents().$font(),rows=Math.max(1,Math.floor(this.$contents_height()/this.$line_height()));
  while(tokens.filter(t=>t==='\n').length>=rows&&font.$size()>14){
   font['$size='](font.$size()-1);tokens=layoutText(this,shown,x);
  }
 }
 for(const token of tokens)glyph(this,token,pos);
 return pos.x-x;
};
Opal.Window_Base.$$prototype.$delete_special_characters=function(text){
 return String(text).replace(/\x1b(?:[a-z]+(?:\[[^\]]*\])?|.)?/gi,'');
};
function messageWindow(){return Opal.SceneManager.$scene().message_window;}
function openWallet(w){
 const wallet=w.gold_window;
 // The browser controls occupy the top-right corner of the game on a tablet.
 wallet['$x='](Math.floor((Opal.Graphics.$width()-wallet.$width())/2));
 wallet.$refresh();wallet.$open();
}
function endMessage(w){
 // The same confirmation must not reopen the NPC event as control returns to the map.
 for(const key of ['ok','cancel'])if(sampledKeys.has(key))lastKeys.add(key);
 w.gold_window.$close();w['$pause='](false);w.$close();
 G.game_message.$clear();G.game_message['$visible='](false);
}
// Some number prompts do not supply a range. The original plugin clears both limits after confirmation.
Opal.class_variable_set(Opal.Window_NumberInput,'@@min',Opal.nil);
Opal.class_variable_set(Opal.Window_NumberInput,'@@max',Opal.nil);
Opal.Window_NumberInput.$$prototype.$process_digit_change=function(){
 if(!this.active)return;
 const up=hostMethods.inputRepeat('UP'),down=hostMethods.inputRepeat('DOWN');
 if(!up&&!down)return;
 // RGSS uses integer division here. Keep all other decimal places and write an integer to the event variable.
 const place=10**(this.digits_max-this.index-1),old=Math.floor(this.number/place)%10;
 const digit=(old+Number(up)-Number(down)+10)%10;
 this.number+=(digit-old)*place;Opal.Sound.$play_cursor();this.$refresh();
};
globalThis.playerUI={
 message(text,p,withInput,w=messageWindow()){
  const m=G.game_message;
  m['$face_name='](p[0]);m['$face_index='](p[1]);m['$background='](p[2]);m['$position='](p[3]);m['$visible='](true);
  m.$add(text);w.$update_background();w.$update_placement();w.$open();
  let pos,tokens,index,delay,waiting,nextPage,automatic,version;
  function page(){w['$pause='](false);w.$new_page('',Opal.hash());pos={left:w.$new_line_x(),x:w.$new_line_x(),y:0};}
  function restart(){
   page();tokens=layoutText(w,localText(text),pos.left);
   index=0;delay=0;waiting=false;nextPage=false;automatic=false;version=languageVersion();
  }
  restart();
  return ()=>{
   if(version!==languageVersion())restart();
   if(!w['$open?']())return false;
   const confirm=hostMethods.inputTrigger('C')||hostMethods.inputTrigger('B');
   if(delay>0){delay--;return false;}
   if(waiting){
    if(!confirm)return false;
    waiting=false;w['$pause='](false);
    if(nextPage){page();nextPage=false;}
   }
   if(index===tokens.length){
    if(withInput)return true;
    if(!automatic&&!confirm){w['$pause='](true);return false;}
    endMessage(w);return true;
   }
   const count=hostMethods.inputPress('C')?tokens.length:1;
   for(let i=0;i<count&&index<tokens.length;i++){
    const token=tokens[index++];
    if(token==='\n'&&index<tokens.length&&pos.y+w.$line_height()*2>w.$contents_height()){
     nextPage=true;waiting=true;w['$pause='](true);break;
    }
    if(token==='\\.'||token==='\\|'){delay=token==='\\.'?15:60;break;}
    if(token==='\\!'){waiting=true;w['$pause='](true);break;}
    if(token==='\\^'){automatic=true;continue;}
    glyph(w,token,pos);
   }
   return false;
  };
 },
 inputWindow(field,showGold){
  const w=messageWindow(),input=w[field];G.game_message['$visible='](true);
  if(showGold)openWallet(w);
  input.$start();input.$deactivate();let armed=false;
  return ()=>{
   if(!armed){
    if(!input['$open?']()||hostMethods.inputPress('C')||hostMethods.inputPress('B'))return false;
    input.$activate();armed=true;return false;
   }
   if(input.active)return false;
   endMessage(w);return true;
  };
 },
 choice(interpreter){
  const w=messageWindow(),m=G.game_message,commands=interpreter.list,indent=interpreter.indent;
  const labels=[],branches=[],enabled=[];
  let pos=interpreter.index,offset=0,cancel=0,finished=false,started=false;
  // ChoiceEX joins adjacent Show Choices groups and numbers their branches in blocks of five.
  do{
   const [options,cancelType]=commands[pos].$parameters();
   for(const [i,raw] of options.entries()){
    const visible=raw.match(/\s*if\(([^)]+)\)/i),enable=raw.match(/\s*en\(([^)]+)\)/i);
    if(visible&&!Opal.truthy(interpreter.$choice_eval(visible[1])))continue;
    branches.push(offset+i);labels.push(raw.replace(visible?.[0]||'','').replace(enable?.[0]||'',''));
    enabled.push(!enable||Opal.truthy(interpreter.$choice_eval(enable[1])));
   }
   if(cancelType===5||(cancelType>0&&branches.includes(offset+cancelType-1)))cancel=offset+cancelType;
   while(++pos<commands.length){
    const command=commands[pos];
    if(command.$indent()!==indent)continue;
    if(command.$code()===404)break;
    if(command.$code()===402){
     const i=branches.indexOf(offset+command.$parameters()[0]);
     if(i>=0)interpreter.$get_help_texts(i,pos+1);
    }
   }
   pos++;offset+=5;
  }while(commands[pos]?.$code()===102&&commands[pos].$indent()===indent);
  const done=i=>interpreter.branch['$[]='](indent,i);
  if(!labels.length){done(-1);endMessage(w);return ()=>true;}
  m.choices=labels.map(localText);m.choice_enables=enabled;m.choice_cancel_type=cancel;m.visible=true;
  const cancelIndex=branches.indexOf(cancel-1);
  enabled.push(cancel>0&&(cancelIndex<0||enabled[cancelIndex]));branches.push(cancel-1);
  m.choice_proc=i=>{done(branches[i]);finished=true;};
  let version=languageVersion();
  return ()=>{
   const choice=w.choice_window;
   if(!started){
    if(!choice['$close?']()||hostMethods.inputPress('C')||hostMethods.inputPress('B'))return false;
    choice.$start();if(choice.index<0)choice.$select(0);started=true;
   }
   if(version!==languageVersion()){
    m.choices=labels.map(localText);choice.$update_placement();choice.$refresh();version=languageVersion();
   }
   if(!finished)return false;endMessage(w);return true;
  };
 },
 name(name,max,onName,actorId){
  Opal.SceneManager.$call(Opal.Scene_Name);Opal.SceneManager.$scene().$prepare(actorId,max);
  return ()=>Opal.SceneManager.$scene().$$class!==Opal.Scene_Name;
 }
};

const scrollHeight=Opal.Window_ScrollText.$$prototype.$update_all_text_height;
Opal.Window_ScrollText.$$prototype.$update_all_text_height=function(){
 if(!thaiScript.test(this.text))return scrollHeight.call(this);
 const rows=1+layoutText(this,this.text,4).filter(t=>t==='\n').length;
 this.all_text_height=1+rows*this.$line_height();this.$reset_font_settings();
};

const originalLineHeight=Opal.Window_Base.$$prototype.$calc_line_height;
Opal.Window_Base.$$prototype.$calc_line_height=function(text,restore=true){
 return originalLineHeight.call(this,String(text).split('\n',1)[0],restore);
};

// A transform and full heal can replace a collapsed enemy within one event tick.
const battlerSprite=Opal.Sprite_Battler.$$prototype;
const initBattlerVisibility=battlerSprite.$init_visibility;
battlerSprite.$init_visibility=function(){
 const wasHidden=this.hasBattlerBitmap && !this.battler_visible;
 const result=initBattlerVisibility.call(this);
 this.hasBattlerBitmap=true;
 if(wasHidden && this.battler_visible)this.$start_effect('appear');
 return result;
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
 if(this.browserBattleMessage||this.browserTroopEvent)return;
 if(troop['$all_dead?']())this.$wait_for_effect();
 this.$process_forced_action();Opal.BattleManager.$judge_win_loss();
};
// RGSS blocks the caller during a troop event. The browser resumes it next frame.
const startPartySelection=battleWindowHost.$start_party_command_selection;
battleWindowHost.$start_party_command_selection=function(){
 if(this.browserTroopEvent||this.browserBattleMessage){this.resumePartySelection=true;return;}
 return startPartySelection.call(this);
};
const processBattleAction=battleWindowHost.$process_action;
battleWindowHost.$process_action=function(){
 if(this.browserTroopEvent||this.browserBattleMessage)return;
 return processBattleAction.call(this);
};
const judgeBattle=Opal.BattleManager.$judge_win_loss;
Opal.BattleManager.$judge_win_loss=function(){
 const scene=Opal.SceneManager.$scene(),troop=G.game_troop;
 if(scene?.$$class===Opal.Scene_Battle && Opal.truthy(this.phase) && !this['$aborting?']()){
  const interpreter=troop.$interpreter();
  if(troop['$all_dead?']() && !scene['$scene_changing?']() && !interpreter['$running?']() &&
     troop.$troop().$pages().some(page=>page.$condition().$enemy_valid() && page.$span()!==2 && troop['$conditions_met?'](page))){
   troop.$setup_battle_event();
  }
  if(interpreter['$running?']()){scene.browserTroopEvent=true;return false;}
 }
 return judgeBattle.call(this);
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
 if(this.resumePartySelection){this.resumePartySelection=false;this.$start_party_command_selection();return;}
 return updateBattleScene.call(this);
};
