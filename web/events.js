// RGSS resumes one interpreter per event. Preserve its index, branches and
// command parameters on the original translated object between browser frames.
const proto=Opal.Game_Interpreter.$$prototype;
proto.$create_fiber=function(){this.fiber=this.list===Opal.nil?Opal.nil:true;this.pending=null;this.finishing=false;};
proto.$update=function(){
 if(this.fiber===Opal.nil)return;
 if(this.finishing){this.fiber=Opal.nil;return;}
 if(this.pending){if(!this.pending())return;this.pending=null;}
 for(let budget=0;budget<128 && this.index<this.list.length;budget++){
  const command=this.list[this.index], code=command.$code(), p=command.$parameters();
  this.params=p;this.indent=command.$indent();
  switch(code){
   case 101:{
    const lines=[];
    while(this.list[this.index+1]?.$code()===401)lines.push(this.list[++this.index].$parameters()[0]);
    this.pending=playerUI.message(lines.join('\n'));break;
   }
   case 102:this.pending=playerUI.choice(p[0],i=>this.branch['$[]='](this.indent,i));break;
   case 303:{
    const actor=Opal.gvars.game_actors['$[]'](p[0]);
    this.pending=playerUI.name(actor.$name(),p[1],s=>actor['$name='](s));break;
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
 // RGSS yields once after the final command, including for an autorun event.
 if(this.index>=this.list.length)this.finishing=true;
};
proto.$wait=function(frames){this.pending=()=>--frames<=0;};
proto.$wait_for_message=function(){};
const fiberClass=Opal.klass(Opal.Object,Opal.Object,'Fiber');
Opal.defs(fiberClass,'$yield',()=>{throw Error('This command needs a resumable Fiber adapter');});
// Browser dialogue takes ownership of message input for event commands 101/102/303.
Opal.Window_Message.$$prototype.$update=function(){Opal.Window_Base.$$prototype.$update.call(this);};
