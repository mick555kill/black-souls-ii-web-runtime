'use strict';
const cheatMenu=el('cheats');
const itemList=el('spawn-item');
const category=el('spawn-type');
const feedback=el('cheat-feedback');
function populateCheatItems(){
 const options=[];
 for(const item of Opal.gvars[category.value]){
  if(item && item!==Opal.nil && String(item.name).trim()){
   options.push(new Option(item.id+' · '+item.name,item.id));
  }
 }
 itemList.replaceChildren(...options);
}
cheatMenu.ontoggle=()=>{
 if(cheatMenu.open){
  releaseControls();
  populateCheatItems();
  feedback.textContent='';
 }else if(active)el('screen').focus();
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
 feedback.textContent=item.name+' +'+(total-before)+' · มีทั้งหมด '+total;
};
el('money-form').onsubmit=event=>{
 event.preventDefault();
 const amount=el('money-amount').valueAsNumber;
 if(!Number.isSafeInteger(amount) || amount<1)return;
 const party=Opal.gvars.game_party,before=party.$gold();
 party.$gain_gold(amount);
 feedback.textContent='เงิน +'+(party.$gold()-before)+' · มีทั้งหมด '+party.$gold();
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
