/* Native Ruby RGSS3 database loader.
 * Reads the original .rvdata2 bytes from the selected game's source and sends
 * them to CRuby/WASM, where Marshal.load creates real RPG::* instances.
 */
(function(root){
  'use strict';
  const DATASETS=['Actors','Classes','Skills','Items','Weapons','Armors',
    'Enemies','Troops','States','Animations','Tilesets','CommonEvents',
    'System','MapInfos','Scripts'];
  class RGSS3DatabaseImporter {
    constructor(source,vm){this.source=source;this.vm=vm;}
    async load({mapId,onProgress}={}){
      if(!this.source||!this.vm)throw Error('Missing game source or Ruby VM');
      await this.vm.installRGSS();
      await this.vm.clearRGSSData();
      const names=DATASETS.filter(n=>this.source.has(`Data/${n}.rvdata2`));
      if(mapId!==undefined&&mapId!==null){
        if(!Number.isInteger(mapId)||mapId<1||mapId>999)throw Error('Invalid VX Ace Map ID');
        const mapName=`Map${String(mapId).padStart(3,'0')}`;
        if(this.source.has(`Data/${mapName}.rvdata2`))names.push(mapName);
      }
      const loaded=[];
      for(const name of names){
        const bytes=await this.source.read(`Data/${name}.rvdata2`,64*1024*1024);
        const description=await this.vm.loadRGSSData(name,bytes);
        loaded.push({name,bytes:bytes.byteLength,description});
        onProgress?.({loaded:loaded.length,total:names.length,name,description});
      }
      return {total:loaded.length,loaded};
    }
    async loadMap(mapId){
      if(!Number.isInteger(mapId)||mapId<1||mapId>999)throw Error('Invalid Map ID');
      const name=`Map${String(mapId).padStart(3,'0')}`;
      return this.vm.loadRGSSData(name,await this.source.read(`Data/${name}.rvdata2`,64*1024*1024));
    }
  }
  root.VX=root.VX||{};
  root.VX.RGSS3DatabaseImporter=RGSS3DatabaseImporter;
  if(typeof module!=='undefined')module.exports={RGSS3DatabaseImporter,DATASETS};
})(typeof window!=='undefined'?window:globalThis);
