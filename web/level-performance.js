// Numeric level-extension formulas do not need the Ruby compiler. Keep the
// original evaluator for scripted expressions (which may read live game state).
(function(){
  const actor=Opal.Game_Actor.$$prototype, klass=Opal.RPG.Class.$$prototype;
  const rate1=actor.$olextend_data_1, rate2=actor.$olextend_data_2, exp=klass.$exp_for_level;
  function literal(value){
    const text=String(value).trim();
    // Avoid Ruby octal literals and other syntax with different JS semantics.
    if(!/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))return null;
    const n=Number(text);
    return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
  }
  Opal.defn(Opal.Game_Actor,'$olextend_data_1',function(){
    const n=literal(Opal.MLV_CHANGE.P_RATE);
    return n===null?rate1.call(this):n/100;
  });
  Opal.defn(Opal.Game_Actor,'$olextend_data_2',function(){
    let data=100;
    for(const feature of this.$feature_objects()){
      const n=literal(feature.$olv_extend());
      if(n===null)return rate2.call(this);
      data=Opal.rb_plus(data,Opal.rb_minus(n,100));
    }
    return data/100;
  });
  Opal.defn(Opal.RPG.Class,'$exp_for_level',function(level){
    let extra=0;
    for(const entry of this.$etc_array()){
      if(!Opal.truthy(Opal.rb_ge(level,entry[0])))continue;
      const n=literal(entry[1]);
      if(n===null)return exp.call(this,level);
      extra=Opal.rb_plus(extra,Opal.rb_times(n,Opal.rb_plus(Opal.rb_minus(level,entry[0]),1)));
    }
    return Opal.rb_plus(this.$exp_for_level_etc_array(level),extra);
  });
})();
