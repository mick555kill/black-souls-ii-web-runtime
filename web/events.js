// RGSS resumes one interpreter per event. Preserve its index, branches and
// command parameters on the original translated object between browser frames.
const sceneYield=Symbol('scene yield');
let handlingSceneCommand=false;
const proto=Opal.Game_Interpreter.$$prototype;
proto.$create_fiber=function(){
 this.fiber=this.list===Opal.nil?Opal.nil:true;
 this.pending=null;this.commandWait=null;this.childEvent=null;this.followupInput=false;this.numberShowsGold=false;
};
// Parallel map events also run while the player walks. Keep their remaining wait in the save graph.
function commandStillWaiting(wait){
 switch(wait[0]){
  case 205:return wait[1].$move_route_forcing();
  case 212:return wait[1].$animation_id()>0;
  case 213:return wait[1].$balloon_id()>0;
  case 230:return --wait[1]>0;
 }
}
proto.$update=function(){
 if(this.fiber===Opal.nil)return;
 if(this.pending){if(!this.pending())return;this.pending=null;}
 if(this.commandWait){if(commandStillWaiting(this.commandWait))return;this.commandWait=null;}
 if(this.childEvent){
  this.childEvent.$update();
  if(this.childEvent['$running?']())return;
  this.childEvent=null;
 }
 for(let budget=0;budget<128 && this.index<this.list.length;budget++){
  const command=this.list[this.index], code=command.$code(), p=command.$parameters();
  this.params=p;this.indent=command.$indent();
  if(![103,355,655].includes(code))this.numberShowsGold=false;
  if(code>=101&&code<=105){
   const message=Opal.gvars.game_message;
   if(!this.followupInput && (message.visible===true || message.scroll_mode===true))return;
   this.followupInput=false;
  }
  switch(code){
   case 301:case 302:case 340:case 351:case 352:case 353:case 354:{
    handlingSceneCommand=true;
    try{this.$execute_command();}catch(e){if(e!==sceneYield)throw e;}
    finally{handlingSceneCommand=false;}
    this.index++;
    return;
   }
   case 101:{
    const lines=[];
    while(this.list[this.index+1]?.$code()===401)lines.push(this.list[++this.index].$parameters()[0]);
    const next=this.list[this.index+1]?.$code();
    this.numberShowsGold=lines.some(line=>line.includes('\\$'));
    this.followupInput=next===102||next===103||next===104;
    this.pending=playerUI.message(lines.join('\n'),p,this.followupInput);break;
   }
   case 102:this.pending=playerUI.choice(this);break;
   case 103:case 104:{
    if(code===103)this.$setup_num_input(p);else this.$setup_item_choice(p);
    this.pending=playerUI.inputWindow(code===103?'number_window':'item_window',code===103&&this.numberShowsGold);this.numberShowsGold=false;break;
   }
   case 105:{
    const m=Opal.gvars.game_message,lines=[];
    while(this.list[this.index+1]?.$code()===405)lines.push(this.list[++this.index].$parameters()[0]);
    m.scroll_mode=true;m.scroll_speed=p[0];m.scroll_no_fast=p[1];
    for(const line of lines)m.$add(globalThis.thaiLocale?.text(line)??line);
    this.pending=()=>!m.scroll_mode;break;
   }
   case 303:{
    const actor=Opal.gvars.game_actors['$[]'](p[0]);
    this.pending=playerUI.name(actor.$name(),p[1],s=>actor['$name='](s),p[0]);break;
   }
   case 201:{
    const coord=i=>p[0]===0?p[i]:Opal.gvars.game_variables['$[]'](p[i]);
    const id=coord(1), x=coord(2), y=coord(3), player=Opal.gvars.game_player;
    let ready=false,started=false,error;
    loadMapData(id).then(()=>ready=true,e=>error=e);
    this.pending=()=>{if(error)throw error;if(!ready)return false;
     if(!started){started=true;Opal.gvars.game_temp['$fade_type='](p[5]);player.$reserve_transfer(id,x,y,p[4]);}
     return !player['$transfer?']();};break;
   }
   case 204:{
    const map=Opal.gvars.game_map;
    if(Opal.gvars.game_party.$in_battle())break;
    const start=()=>{if(map['$scrolling?']())return false;map.$start_scroll(...p);return true;};
    if(!start())this.pending=start;
    break;
   }
   case 205:{
    if(Opal.gvars.game_map.$need_refresh())Opal.gvars.game_map.$refresh();
    const ch=this.$get_character(p[0]);
    if(ch!==Opal.nil){ch.$force_move_route(p[1]);if(p[1].$wait())this.commandWait=[code,ch];}
    break;
   }
   case 212:case 213:{
    const ch=this.$get_character(p[0]),field=code===212?'animation_id':'balloon_id';
    if(ch!==Opal.nil){ch['$'+field+'='](p[1]);if(p[2])this.commandWait=[code,ch];}
    break;
   }
   case 117:{
    this.childEvent=Opal.Game_Interpreter.$new(this.depth+1);
    this.childEvent.$setup(Opal.gvars.data_common_events[p[0]].$list(),this.event_id);break;
   }
   case 230:this.$wait(p[0]);break;
   case 221:case 222:{
    const from=Opal.Graphics.$brightness(),to=code===221?0:255;let elapsed=0;
    this.pending=()=>{Opal.Graphics['$brightness='](Math.round(from+(to-from)*(++elapsed/30)));return elapsed>=30;};break;
   }
   // The game's command 339 queues a skill. Waiting here would stop the ATB clock it needs.
   default:this.$execute_command();
  }
  this.index++;
  if(this.pending||this.commandWait||this.childEvent)return;
 }
 if(this.index>=this.list.length)this.fiber=Opal.nil;
};
proto.$wait=function(frames){this.commandWait=[230,frames];};
proto.$wait_for_message=function(){};
const fiberClass=Opal.klass(Opal.Object,Opal.Object,'Fiber');
Opal.defs(fiberClass,'$yield',()=>{if(handlingSceneCommand)throw sceneYield;throw Error('This command needs a resumable Fiber adapter');});
// Browser dialogue takes ownership of message input for event commands 101/102/303.
Opal.Window_Message.$$prototype.$update_fiber=function(){};
