/* Browser-side RGSS3 script catalog: unzip source, never evaluate Ruby code. */
(function (root) {
  'use strict';
  function decodeSource(bytes){
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{return new TextDecoder('shift_jis').decode(bytes);}
  }
  async function unzip(bytes){
    if(typeof DecompressionStream==='undefined')throw Error('This browser does not support zlib decompression');
    const body=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(body).arrayBuffer());
  }
  class ScriptCatalog {
    constructor(entries){this.entries=entries;}
    static async load(resources){
      // Supports both the 0.5 ResourceManager and the 0.3 layered archive/RTP sources.
      const source=typeof resources.bytes==='function'
        ?await resources.bytes('Data/Scripts.rvdata2',{type:'data'})
        :await resources.read('Data/Scripts.rvdata2');
      const serialized=new root.VX.MarshalReader(source,{rawStrings:true}).parse();
      if(!Array.isArray(serialized))throw Error('Script database is not an array');
      const entries=[];
      for(const item of serialized){
        if(!Array.isArray(item)||item.length<3||!(item[2] instanceof Uint8Array))throw Error('Invalid Scripts.rvdata2 item');
        entries.push({id:Number(item[0]),name:decodeSource(item[1]),source:decodeSource(await unzip(item[2]))});
      }
      return new ScriptCatalog(entries);
    }
    get(name){return this.entries.find(x=>x.name===name)||null;}
    summary(){return {scripts:this.entries.length,characters:this.entries.reduce((sum,x)=>sum+x.source.length,0)};}
  }
  root.VX=root.VX||{};root.VX.ScriptCatalog=ScriptCatalog;
  if(typeof module!=='undefined')module.exports={ScriptCatalog};
})(typeof window!=='undefined'?window:globalThis);
