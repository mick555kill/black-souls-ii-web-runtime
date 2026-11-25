// Convert decoded Marshal objects to the representations used by compiled methods.
function rubyValue(value) {
  if(value==null)return Opal.nil;
  if(Array.isArray(value))return value.map(rubyValue);
  if(typeof value!=='object')return value;
  if(value instanceof VX.RubyTable){
    const table=Opal.Table.$allocate();
    Object.assign(table,{xsize:value.width,ysize:value.height,zsize:value.depth,cells:Array.from(value.data)});
    return table;
  }
  if(value.__class){
    const klass=value.__class.split('::').reduce((parent,key)=>parent[key],Opal);
    if(!klass)throw Error('Unknown database class '+value.__class);
    if(value.__raw && ['Color','Tone','Rect'].includes(value.__class)){
      const b=value.__raw, view=new DataView(b.buffer,b.byteOffset,b.byteLength);
      return klass.$new(...Array.from({length:4},(_,i)=>value.__class==='Rect'?view.getInt32(i*4,true):view.getFloat64(i*8,true)));
    }
    const result=klass.$allocate();
    for(const [key,v] of Object.entries(value))if(key!=='__class')result[key]=rubyValue(v);
    return result;
  }
  const hash=Opal.hash();
  for(const [key,v] of Object.entries(value))hash['$[]='](/^\d+$/.test(key)?Number(key):key,rubyValue(v));
  return hash;
}
const database=new Map();
Opal.defn(Opal.Kernel,'$load_data',function(path){
  const key=String(path).replaceAll('\\','/').toLowerCase().replace(/\.rvdata$/,'.rvdata2');
  if(!database.has(key))throw Error('Database not loaded: '+path);
  return database.get(key);
});
let voiceFiles=[];
async function prepareDatabase(project){
  voiceFiles=project.source.names().filter(path=>/^audio\/voice\/[^/]+$/i.test(path));
  const names=['Actors','Classes','Skills','Items','Weapons','Armors','Enemies','Troops','States','Animations','Tilesets','CommonEvents','System','MapInfos'];
  for(const name of names){
    const data=rubyValue(await project.data(name));
    database.set('data/'+name.toLowerCase()+'.rvdata2',data);
  }
  const start=database.get('data/system.rvdata2').start_map_id;
  const mapName='Map'+String(start).padStart(3,'0');
  database.set('data/'+mapName.toLowerCase()+'.rvdata2',rubyValue(await project.data(mapName)));
}
Opal.$$$("Dir").$glob=function(pattern){
  if(/^Save.*rvdata2$/i.test(pattern))return [];
  const voice=String(pattern).match(/^Audio\/VOICE\/\*\\\[(vid-?\d+_sid\d+)\\\]\*$/i);
  if(voice)return voiceFiles.filter(path=>path.toLowerCase().includes('['+voice[1].toLowerCase()+']'));
  throw Error('Unsupported directory pattern: '+pattern);
};
