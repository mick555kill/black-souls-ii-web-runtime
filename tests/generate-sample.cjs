// Generate an original, tiny RGSS3A fixture; contains no third-party game assets.
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');

const o=(cls,attrs)=>({__obj:cls,...attrs});
const table=(width,height,depth,fill)=>{
  const data=Buffer.alloc(20+width*height*depth*2);
  [3,width,height,depth,width*height*depth].forEach((v,i)=>data.writeInt32LE(v,i*4));
  for(let z=0;z<depth;z++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    data.writeInt16LE(fill(x,y,z),20+2*(x+width*(y+height*z)));
  }
  return {__table:data};
};
class Writer {
  constructor(){this.chunks=[];this.symbols=new Map();}
  byte(n){this.chunks.push(Buffer.from([n&255]));}
  bytes(b){this.chunks.push(Buffer.from(b));}
  long(n){
    if(n===0){this.byte(0);return;}
    if(n>0&&n<123){this.byte(n+5);return;}
    if(n<0&&n>-124){this.byte(n-5);return;}
    const size=n<0?4:Math.ceil(Math.log2(n+1)/8);this.byte(n<0?-size:size);
    for(let i=0;i<size;i++)this.byte(n>>>(i*8));
  }
  symbol(s){
    if(this.symbols.has(s)){this.byte(59);this.long(this.symbols.get(s));return;}
    this.symbols.set(s,this.symbols.size);this.byte(58);const b=Buffer.from(s,'utf8');this.long(b.length);this.bytes(b);
  }
  value(v){
    if(v===null||v===undefined){this.byte(48);return;}
    if(typeof v==='boolean'){this.byte(v?84:70);return;}
    if(typeof v==='number'){this.byte(105);this.long(v);return;}
    if(typeof v==='string'){this.byte(34);const b=Buffer.from(v);this.long(b.length);this.bytes(b);return;}
    if(Array.isArray(v)){this.byte(91);this.long(v.length);v.forEach(x=>this.value(x));return;}
    if(v.__table){this.byte(117);this.symbol('Table');this.long(v.__table.length);this.bytes(v.__table);return;}
    if(v.__obj){
      this.byte(111);this.symbol(v.__obj);const pairs=Object.entries(v).filter(([key])=>key!=='__obj');this.long(pairs.length);
      for(const [key,x] of pairs){this.symbol('@'+key);this.value(x);}return;
    }
    this.byte(123);const pairs=Object.entries(v);this.long(pairs.length);
    for(const [key,x] of pairs){this.value(Number.isInteger(Number(key))?Number(key):key);this.value(x);}
  }
  dump(v){this.byte(4);this.byte(8);this.value(v);return Buffer.concat(this.chunks);}
}
function png(width,height,fn){
  const raw=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*(width*4+1)+1+x*4,block=Math.floor(x/32)+Math.floor(y/32)*8;
    if(fn){const c=fn(x,y);raw[p]=c[0];raw[p+1]=c[1];raw[p+2]=c[2];raw[p+3]=c[3];continue;}
    raw[p]=35+((block*23)%115);raw[p+1]=70+((block*19)%120);raw[p+2]=55+((block*37)%110);raw[p+3]=255;
    if(x%32<2||y%32<2)raw[p]=raw[p+1]=raw[p+2]=24;
  }
  let crcTable=[];for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}
  const crc=buf=>{let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const t=Buffer.from(type);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const sum=Buffer.alloc(4);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function archive(files){
  const key=3,enc=[];let offset=12;
  const records=files.map(([name,data],i)=>({name:Buffer.from(name),data:Buffer.from(data),fileKey:0x12345678+i*11}));
  for(const rec of records)offset+=16+rec.name.length;
  offset+=4;
  const head=Buffer.from([82,71,83,83,65,68,0,3,0,0,0,0]);
  const u32=x=>{const b=Buffer.alloc(4);b.writeUInt32LE(x>>>0);return b;};
  const parts=[head];
  for(const rec of records){
    parts.push(u32(offset^key),u32(rec.data.length^key),u32(rec.fileKey^key),u32(rec.name.length^key));
    const name=Buffer.from(rec.name);for(let j=0;j<name.length;j++)name[j]^=(key>>>((j%4)*8))&255;
    parts.push(name);
    let word=rec.fileKey>>>0;const bytes=Buffer.from(rec.data);
    for(let j=0;j<bytes.length;j++){bytes[j]^=(word>>>((j%4)*8))&255;if(j%4===3)word=(Math.imul(word,7)+3)>>>0;}
    enc.push(bytes);offset+=bytes.length;
  }
  parts.push(u32(key));return Buffer.concat([...parts,...enc]);
}
const cmd=(code,parameters=[],indent=0)=>o('RPG::EventCommand',{code,indent,parameters});
const text=(t,indent=0)=>[cmd(101,['',0,0,2],indent),cmd(401,[t],indent)];
const gfx=(o2={})=>o('RPG::Event::Page::Graphic',{tile_id:0,character_name:'',character_index:0,direction:2,pattern:0,...o2});
const cond=(o2={})=>o('RPG::Event::Page::Condition',{switch1_valid:false,switch2_valid:false,variable_valid:false,self_switch_valid:false,item_valid:false,actor_valid:false,switch1_id:1,switch2_id:1,variable_id:1,variable_value:0,self_switch_ch:'A',item_id:1,actor_id:1,...o2});
const page=(o2={})=>o('RPG::Event::Page',{condition:cond(o2.condition),graphic:gfx(o2.graphic),move_type:0,move_speed:3,move_frequency:3,walk_anime:true,step_anime:false,direction_fix:false,through:false,priority_type:1,trigger:0,list:[],...o2.rest,...(o2.through!==undefined?{through:o2.through}:{}),...(o2.priority!==undefined?{priority_type:o2.priority}:{}),...(o2.trigger!==undefined?{trigger:o2.trigger}:{}),list:[...(o2.list||[]),cmd(0)]});
const ev=(id,name,x,y,pages)=>o('RPG::Event',{id,name,x,y,pages});
const WALL_TILE=1,A2_GROUND=2816;
function map1(){
  const W=17,H=13;
  const data=table(W,H,4,(x,y,z)=>{
    if(z===0)return A2_GROUND;
    if(z===1&&(x===0||y===0||x===W-1||(y===H-1&&x!==8)))return WALL_TILE;
    return 0;
  });
  const events={
    1:ev(1,'Guide',11,6,[
      page({list:[...text('Welcome! This is a test map, not a real game.'),cmd(102,[['Tell me more','Open the gate','Bye'],3]),
        cmd(402,[0,'Tell me more']),...text('Walk into the door at the bottom to visit the cave.',1),
        cmd(402,[1,'Open the gate']),cmd(121,[1,1,0],1),...text('The gate on the east side opens.',1),
        cmd(402,[2,'Bye']),cmd(404)]}),
      page({condition:{switch1_valid:true,switch1_id:1},list:text('The gate is open. Try the chest too!')})]),
    2:ev(2,'Gate',15,6,[
      page({graphic:{tile_id:WALL_TILE},list:text('The gate is shut.')}),
      page({condition:{switch1_valid:true,switch1_id:1},through:true,priority:0,list:[]})]),
    3:ev(3,'Chest',5,9,[
      page({list:[...text('You found 50 G!'),cmd(125,[0,0,50]),cmd(123,['A',0])]}),
      page({condition:{self_switch_valid:true,self_switch_ch:'A'},list:text('(The chest is empty.)')})]),
    4:ev(4,'ToCave',8,12,[page({trigger:1,priority:0,through:true,list:[cmd(201,[0,2,3,3,2,0])]})]),
    5:ev(5,'Counter',2,2,[page({list:[cmd(122,[1,1,1,0,1]),cmd(111,[1,1,0,3,1]),...text('Counter reached 3 or more!',1),cmd(411,[],0),...text('Counter is below 3.',1),cmd(412,[],0)]})])
  };
  return o('RPG::Map',{display_name:'Example Grove',width:W,height:H,tileset_id:1,data,events});
}
function map2(){
  const W=10,H=8;
  const data=table(W,H,4,(x,y,z)=>z===0?A2_GROUND:(z===1&&(x===0||y===0||x===W-1||(y===H-1&&x!==3))?WALL_TILE:0));
  return o('RPG::Map',{display_name:'Quiet Cave',width:W,height:H,tileset_id:1,data,events:{
    1:ev(1,'Exit',3,7,[page({trigger:1,priority:0,through:true,list:[cmd(201,[0,1,8,11,8,0])]})]),
    2:ev(2,'Hermit',5,3,[page({graphic:{character_name:'$Hero'},list:text('Quiet here, isn\'t it?')})])}});
}
function make(){
  const flags=table(8192,1,1,x=>x===WALL_TILE?0x0f:0);
  const hero=png(96,128,(x,y)=>{const row=Math.floor(y/32);return [60+row*50,120,200-row*40,(x%32>6&&x%32<26&&y%32>3)?255:0];});
  const files=[
    ['Data/MapInfos.rvdata2',new Writer().dump({1:o('RPG::MapInfo',{name:'Example Grove',order:1}),2:o('RPG::MapInfo',{name:'Quiet Cave',order:2})})],
    ['Data/System.rvdata2',new Writer().dump(o('RPG::System',{game_title:'Sample Game',start_map_id:1,start_x:4,start_y:5,party_members:[1]}))],
    ['Data/Tilesets.rvdata2',new Writer().dump([null,o('RPG::Tileset',{tileset_names:['','SampleA2','','','SampleA5','SampleB','','',''],flags})])],
    ['Data/Actors.rvdata2',new Writer().dump([null,o('RPG::Actor',{id:1,name:'Hero',character_name:'$Hero',character_index:0})])],
    ['Data/Map001.rvdata2',new Writer().dump(map1())],
    ['Data/Map002.rvdata2',new Writer().dump(map2())],
    ['Graphics/Tilesets/SampleA2.png',png(512,384)],
    ['Graphics/Tilesets/SampleA5.png',png(256,512)],
    ['Graphics/Tilesets/SampleB.png',png(512,512)],
    ['Graphics/Characters/$Hero.png',hero]
  ];
  return archive(files);
}
if(require.main===module){const output=path.join(__dirname,'sample.rgss3a');fs.writeFileSync(output,make());console.log('Wrote original fixture:',output);}
module.exports={make,Writer,table};
