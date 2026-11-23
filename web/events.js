// RGSS resumes one interpreter per event. Preserve its index, branches and
// command parameters on the original translated object between browser frames.
const sceneYield=Symbol('scene yield');
let handlingSceneCommand=false;
const proto=Opal.Game_Interpreter.$$prototype;
proto.$create_fiber=function(){this.fiber=this.list===Opal.nil?Opal.nil:true;this.pending=null;};
proto.$update=function(){
 if(this.fiber===Opal.nil)return;
 if(this.pending){if(!this.pending())return;this.pending=null;}
 for(let budget=0;budget<128 && this.index<this.list.length;budget++){
  const command=this.list[this.index], code=command.$code(), p=command.$parameters();
  this.params=p;this.indent=command.$indent();
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
    this.pending=playerUI.message(lines.join('\n'),p,this.list[this.index+1]?.$code()===102);break;
   }
   case 102:this.pending=playerUI.choice(p[0],i=>this.branch['$[]='](this.indent,i),p[1],this);break;
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
   case 339:{
    const targets=[];
    Opal.send(this,'iterate_battler',p.slice(0,2),battler=>targets.push(battler));
    let index=0;
    this.pending=()=>{
     if(Opal.BattleManager['$action_forced?']())return false;
     while(index<targets.length){
      const target=targets[index++];
      if(target['$death_state?']())continue;
      target.$force_action(p[2],p[3]);Opal.BattleManager.$force_action(target);return false;
     }
     return true;
    };
    break;
   }
   case 205:{
    if(Opal.gvars.game_map.$need_refresh())Opal.gvars.game_map.$refresh();
    const ch=this.$get_character(p[0]);
    if(ch!==Opal.nil){ch.$force_move_route(p[1]);if(p[1].$wait())this.pending=()=>!ch.$move_route_forcing();}
    break;
   }
   case 212:case 213:{
    const ch=this.$get_character(p[0]),field=code===212?'animation_id':'balloon_id';
    if(ch!==Opal.nil){ch['$'+field+'='](p[1]);if(p[2])this.pending=()=>ch['$'+field]()<=0;}
    break;
   }
   case 117:{
    const child=Opal.Game_Interpreter.$new(this.depth+1);
    child.$setup(Opal.gvars.data_common_events[p[0]].$list(),this.event_id);
    this.pending=()=>{child.$update();return !child['$running?']();};break;
   }
   case 230:{let frames=p[0];this.pending=()=>--frames<=0;break;}
   case 221:case 222:{
    const from=Opal.Graphics.$brightness(),to=code===221?0:255;let elapsed=0;
    this.pending=()=>{Opal.Graphics['$brightness='](Math.round(from+(to-from)*(++elapsed/30)));return elapsed>=30;};break;
   }
   default:this.$execute_command();
  }
  this.index++;
  if(this.pending)return;
 }
 if(this.index>=this.list.length)this.fiber=Opal.nil;
};
proto.$wait=function(frames){this.pending=()=>--frames<=0;};
proto.$wait_for_message=function(){};
const fiberClass=Opal.klass(Opal.Object,Opal.Object,'Fiber');
Opal.defs(fiberClass,'$yield',()=>{if(handlingSceneCommand)throw sceneYield;throw Error('This command needs a resumable Fiber adapter');});
// Browser dialogue takes ownership of message input for event commands 101/102/303.
Opal.Window_Message.$$prototype.$update_fiber=function(){};
