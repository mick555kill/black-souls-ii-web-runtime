'use strict';
const cheatMenu=el('cheats');
const itemList=el('spawn-item');
const category=el('spawn-type');
const feedback=el('cheat-feedback');
function populateCheatItems(){
 const options=[];
 for(const item of Opal.gvars[category.value]){
  if(item && item!==Opal.nil && String(item.name).trim()){
   options.push(new Option(item.id+' · '+thaiLocale.text(item.name),item.id));
  }
 }
 itemList.replaceChildren(...options);
}
cheatMenu.ontoggle=()=>{
 if(cheatMenu.open){
  pauseTick();releaseControls();
  populateCheatItems();
  feedback.textContent='';
  refreshSenControl();
 }else if(active){el('screen').focus();scheduleTick();}
};
category.onchange=populateCheatItems;
el('spawn-form').onsubmit=event=>{
 event.preventDefault();
 const item=Opal.gvars[category.value][Number(itemList.value)];
 const count=el('spawn-count').valueAsNumber;
 if(!item || item===Opal.nil || !Number.isSafeInteger(count) || count<1)return;
 const party=Opal.gvars.game_party, before=party.$item_number(item);
 party.$gain_item(item,count);
 const total=party.$item_number(item);
 feedback.textContent=thaiLocale.text(item.name)+' +'+(total-before)+' · มีทั้งหมด '+total;
};
el('money-form').onsubmit=event=>{
 event.preventDefault();
 const amount=el('money-amount').valueAsNumber;
 if(!Number.isSafeInteger(amount) || amount<1)return;
 const party=Opal.gvars.game_party,before=party.$gold();
 party.$gain_gold(amount);
 feedback.textContent='เงิน +'+(party.$gold()-before)+' · มีทั้งหมด '+party.$gold();
};
// SEN is game variable 38, not the party's gold. Keep its threshold switches
// consistent with the original interpreter in game/118.js.
function refreshSenControl(){
 const value=Opal.gvars.game_variables?.['$[]'](38);
 el('sen-current').textContent=Number.isFinite(value)?String(value):'—';
}
function changeSen(delta){
 if(!Number.isSafeInteger(delta))throw Error('Invalid SEN amount');
 const variables=Opal.gvars.game_variables,switches=Opal.gvars.game_switches;
 const before=variables['$[]'](38);
 if(!Number.isFinite(before))throw Error('Invalid current SEN');
 const after=Math.max(0,Math.min(100,before+delta));
 variables['$[]='](38,after);
 switches['$[]='](14,after<=0);
 switches['$[]='](15,after<=30);
 switches['$[]='](16,after<=70);
 return {before,after};
}
el('sen-form').onsubmit=event=>{
 event.preventDefault();
 if(!active)return;
 const amount=el('sen-amount').valueAsNumber;
 if(!Number.isSafeInteger(amount)||amount<1||amount>100)return;
 try{
  const delta=event.submitter?.value==='decrease'?-amount:amount;
  const {before,after}=changeSen(delta);
  refreshSenControl();
  const changed=after-before;
  feedback.textContent='SEN '+(changed>=0?'+':'')+changed+' · ปัจจุบัน '+after;
 }catch(error){feedback.textContent=String(error.message||error);}
};
const oneHit=el('one-hit');
const enemyPrototype=Opal.Game_Enemy.$$prototype;
const executeEnemyDamage=enemyPrototype.$execute_damage;
enemyPrototype.$execute_damage=function(user){
 if(oneHit.checked && user['$actor?']() && this.result.$hp_damage()>0){
  this.result['$hp_damage='](Math.max(this.$hp(),this.result.$hp_damage()));
 }
 return executeEnemyDamage.call(this,user);
};
