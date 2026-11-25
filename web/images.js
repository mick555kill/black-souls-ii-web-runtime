const imageMetrics=new Map();
function imageKey(name){return String(name).replaceAll('\\','/').toLowerCase();}
function imageDimensions(bytes,png){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(png)return bytes.length>=24&&v.getUint32(0)===0x89504e47?[v.getUint32(16),v.getUint32(20)]:null;
 if(bytes.length<2||v.getUint16(0)!==0xffd8)return null;
 let pos=2;
 while(pos+3<bytes.length && bytes[pos]===255){
  while(bytes[pos]===255)pos++;
  const marker=bytes[pos++];
  if(marker===0xda||marker===0xd9||pos+2>bytes.length)return null;
  const length=v.getUint16(pos);
  if(length<2)return null;
  if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)&&pos+7<=bytes.length)
   return [v.getUint16(pos+5),v.getUint16(pos+3)];
  pos+=length;
 }
 return null;
}
// One replaceable record per browser profile. It contains only file signatures and sizes.
async function openImageIndex(){
 if(!globalThis.indexedDB)return null;
 try{
  return await new Promise((resolve,reject)=>{
   const request=indexedDB.open('bs2.image-sizes',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('index');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>{request.onsuccess=()=>request.result.close();resolve(null);};
  });
 }catch{return null;}
}
async function indexImageSizes(archive,folder){
 const reads=new Map(),archiveStamp=archive.file.size+':'+archive.file.lastModified;
 for(const e of archive.entries)if(/\.(png|jpe?g)$/i.test(e.name)){
  reads.set(imageKey(e.name),{size:e.size,stamp:['a',archiveStamp,e.offset,e.key,e.size].join(':'),read:n=>archive.readPrefix(e,n)});
 }
 for(const [name,f] of folder.index)if(/\.(png|jpe?g)$/i.test(name)){
  reads.set(imageKey(name),{size:f.size,stamp:['f',f.webkitRelativePath||name,f.size,f.lastModified].join(':'),read:async n=>new Uint8Array(await f.slice(0,n).arrayBuffer())});
 }
 const db=await openImageIndex();
 let saved=new Map();
 if(db)try{
  const rows=await new Promise((resolve,reject)=>{
   const req=db.transaction('index').objectStore('index').get('last');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  if(Array.isArray(rows))saved=new Map(rows);
 }catch{}
 imageMetrics.clear();const pending=[],record=[];let changed=false;
 for(const [key,file] of reads){
  const row=saved.get(key);
  if(row?.[0]===file.stamp && Number.isInteger(row[1]) && Number.isInteger(row[2])){
   imageMetrics.set(key,[row[1],row[2]]);record.push([key,row]);
  }else pending.push([key,file]);
 }
 try{
  for(let offset=0;offset<pending.length;offset+=8){
   await Promise.all(pending.slice(offset,offset+8).map(async ([key,file])=>{
    const png=key.endsWith('.png');let count=Math.min(png?24:4096,file.size);
    while(count){
     const dims=imageDimensions(await file.read(count),png);
     if(dims){imageMetrics.set(key,dims);record.push([key,[file.stamp,...dims]]);changed=true;return;}
     if(png||count===file.size)return;
     count=Math.min(count*4,file.size);
    }
   }));
  }
  if(db && (changed || saved.size!==record.length))try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('index','readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    tx.objectStore('index').put(record,'last');
   });
  }catch{}
 }finally{db?.close();}
}
rgssHost.$bitmapSize=name=>{
 const key=imageKey(name);
 return imageMetrics.get(key)||imageMetrics.get(key+'.png')||imageMetrics.get(key+'.jpg')||imageMetrics.get(key+'.jpeg')||[1,1];
};
rgssHost.$pixel=(id,x,y)=>{
 const b=globalThis.display?.bitmaps.get(id);
 if(!b?.ready)return [255,255,255,255];
 return display.pixel(b,x,y);
};
rgssHost.$measure=(text,font,size,bold,italic)=>{
 const ctx=globalThis.display?.ctx;
 if(!ctx)return Math.ceil(text.length*size*.55);
 ctx.save();ctx.font=fontStyle(font,size,bold,italic);const width=Math.ceil(ctx.measureText(text).width);ctx.restore();return width;
};
function fontStyle(font,size,bold,italic){
 const fonts=(Array.isArray(font)?font:[font]).map(f=>JSON.stringify(String(f))).join(',');
 return (italic?'italic ':'')+(bold?'bold ':'')+size+'px "Game Thai", '+fonts+', "Noto Sans Thai", Thonburi, sans-serif';
}
