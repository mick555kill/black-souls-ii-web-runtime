// Read the two consecutive Ruby Marshal streams written by VX Ace DataManager.
// Conversion is data-only: never evaluate Ruby or invoke arbitrary marshal_load hooks.
(function(root){
 'use strict';
 const forbidden=new Set(['__proto__','prototype','constructor']);
 function toGraph(value){
  const nodes=[],seen=new Map();
  function encode(v,depth=0){
   if(depth>400)throw Error('Native save nesting limit');
   if(v===null||typeof v==='string'||typeof v==='boolean'||Number.isFinite(v))return v;
   if(typeof v==='bigint'||typeof v==='number')throw Error('Native save contains unsupported numeric value');
   if(!v||typeof v!=='object')throw Error('Unsupported native save value');
   if(v.__saveConstant)return {rgssConstant:v.__saveConstant};
   if(seen.has(v))return [seen.get(v)];
   if(nodes.length>=300000)throw Error('Native save has too many objects');
   const id=nodes.length,node={};seen.set(v,id);nodes.push(node);
   const next=x=>encode(x,depth+1);
   function fields(entries){
    return entries.map(([k,x])=>{
     if(typeof k!=='string'||k.startsWith('$')||forbidden.has(k))throw Error('Unsafe native save field');
     return [k,next(x)];
    });
   }
   if(Array.isArray(v)){node.type='array';node.data=v.map(next);}
   else if(v.__saveHash){node.type='hash';node.data=v.entries.map(([k,x])=>[next(k),next(x)]);node.fallback=next(v.fallback);}
   else if(v instanceof root.VX.RubyTable){
    node.type='Table';node.data=fields([['xsize',v.width],['ysize',v.height],['zsize',v.depth],['cells',Array.from(v.data)]]);
   }else if(v.__raw){
    const cls=v.__class,keys=cls==='Rect'?['x','y','width','height']:cls==='Color'?['red','green','blue','alpha']:cls==='Tone'?['red','green','blue','gray']:null;
    if(!keys)throw Error('Unsupported native RGSS userdata: '+cls);
    const raw=v.__raw,view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),stride=cls==='Rect'?4:8;
    if(raw.byteLength!==stride*4)throw Error('Invalid '+cls+' userdata');
    node.type=cls;node.data=fields(keys.map((k,i)=>[k,stride===4?view.getInt32(i*stride,true):view.getFloat64(i*stride,true)]));
   }else if(Object.hasOwn(v,'__data')){
    if(v.__class!=='Game_Interpreter'||!Array.isArray(v.__data)||v.__data.length!==6)throw Error('Unsupported native marshal object: '+v.__class);
    const [depth,map_id,event_id,list,index,branch]=v.__data;
    node.type='Game_Interpreter';
    node.data=fields(Object.entries({depth,map_id,event_id,list,index,branch,fiber:list===null?null:true,pending:null,commandWait:null,childEvent:null,followupInput:false,numberShowsGold:false}));
   }else if(typeof v.__class==='string'){
    node.type=v.__class;node.data=fields(Object.entries(v).filter(([k])=>k!=='__class'));
   }else throw Error('Unsupported native save object');
   return [id];
  }
  return {root:encode(value),nodes};
 }
 function parseNativeSave(bytes,time=Date.now()){
  const reader=new root.VX.MarshalReader(bytes,{saveMode:true});
  const header=reader.parse(),body=reader.parse();
  if(reader.pos!==reader.bytes.length)throw Error('Unexpected data after native save contents');
  if(!header?.__saveHash||!body?.__saveHash)throw Error('Not a VX Ace save file (expected header and contents)');
  // Standard VX Ace saves may omit transient message/troop objects. Create fresh
  // instances of these two known runtime classes only, not arbitrary file classes.
  const record={time,header:toGraph(header),body:toGraph(body)};
  const hash=record.body.nodes[record.body.root[0]];
  for(const [key,klass] of [['system','Game_System'],['timer','Game_Timer'],['switches','Game_Switches'],['variables','Game_Variables'],['self_switches','Game_SelfSwitches'],['actors','Game_Actors'],['party','Game_Party'],['map','Game_Map'],['player','Game_Player']]){
   const ref=hash.data.find(([k])=>k===key)?.[1];
   if(!Array.isArray(ref)||record.body.nodes[ref[0]]?.type!==klass)throw Error('Invalid native save field: '+key);
  }
  for(const [key,klass] of [['message','Game_Message'],['troop','Game_Troop']]){
   if(hash.data.some(([k])=>k===key))continue;
   const graph=packSave(Opal[klass].$new()),offset=record.body.nodes.length;
   const shift=v=>Array.isArray(v)?[v[0]+offset]:v;
   for(const n of graph.nodes){
    record.body.nodes.push({...n,data:n.type==='array'?n.data.map(shift):n.type==='hash'?n.data.map(([k,v])=>[shift(k),shift(v)]):n.data.map(([k,v])=>[k,shift(v)]),...(n.type==='hash'?{fallback:shift(n.fallback)}:{})});
   }
   hash.data.push([key,shift(graph.root)]);
  }
  return record;
 }
 root.VX.parseNativeSave=parseNativeSave;
 root.VX.nativeSaveGraph=toGraph;
})(globalThis);