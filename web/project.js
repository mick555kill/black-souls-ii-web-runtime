(function (root) {
  'use strict';
  const VX = () => root.VX;
  const IMG_EXT=['png','jpg','jpeg'];

  async function defaultDecode(bytes) {
    const blob = new Blob([bytes]);
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob,{premultiplyAlpha:'premultiply'});
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  }

  class Project {
    constructor(source, opts = {}) {
      this.source = source; this.archive = source; this.decode = opts.decode || defaultDecode;
      this.maps = {}; this.tilesets = []; this.system = null; this.actors = []; this.commonEvents = [];
      this.retainImages=opts.retainImages!==false;
      this.imageCache = new Map();this.liveImages=new Map();
      this.decodeActive=0;this.decodeQueue=[];
      this.decodeLimit=4;
      this.retainedBytes=0;this.retainedImages=new Map(); this.missing = new Set();
    }
    async decodeAsset(path) {
      if(this.decodeActive>=this.decodeLimit)await new Promise(resolve=>this.decodeQueue.push(resolve));
      else this.decodeActive++;
      try{return await this.decode(await this.source.read(path,32*1024*1024));}
      finally{const next=this.decodeQueue.shift();if(next)next();else this.decodeActive--;}
    }
    async data(name) {
      return new (VX().MarshalReader)(await this.source.read(`Data/${name}.rvdata2`)).parse(); }
    async optional(name, fallback) { try { return await this.data(name); } catch { return fallback; } }
    async initialize() {
      if (!this.source.has('Data/MapInfos.rvdata2') && !this.source.has('Data/MapInfos.json')) throw Error('ไม่พบ Data/MapInfos.rvdata2 — ไฟล์ที่เลือกไม่ใช่เกม VX Ace (หรือยังขาด Game.rgss3a)');
      try { this.maps = await this.data('MapInfos'); } catch (e) { throw Error(`Cannot read Data/MapInfos.rvdata2: ${e.message || e}`); }
      [this.system, this.tilesets, this.actors, this.commonEvents] = await Promise.all([
        this.optional('System', null), this.optional('Tilesets', []), this.optional('Actors', []), this.optional('CommonEvents', [])]);
      if (!this.mapIds().length) throw Error('No maps found in MapInfos.rvdata2');
      return this;
    }
    get title() { return this.system?.game_title || 'VX Ace game'; }
    mapIds() { return Object.keys(this.maps).filter(k => /^\d+$/.test(k) && this.maps[k]).map(Number).sort((a, b) => a - b); }
    mapName(id) { return this.maps[id]?.name || `Map ${String(id).padStart(3, '0')}`; }
    actor(id) { return Array.isArray(this.actors) ? this.actors[id] || null : null; }
    commonEvent(id) { return Array.isArray(this.commonEvents) ? this.commonEvents[id] || null : null; }
    async loadMap(id) {
      const name = `Map${String(id).padStart(3, '0')}`;
      const map = await this.data(name);
      if (!map || !map.data || !Number.isInteger(map.width) || !Number.isInteger(map.height)) throw Error(`Invalid ${name}.rvdata2`);
      if (map.width < 1 || map.height < 1 || map.width > 5000 || map.height > 5000) throw Error('Invalid map dimensions');
      return map;
    }
    /** folder e.g. 'Tilesets', 'Characters', 'Faces', 'Parallaxes'; resolves to an image or null (recorded in .missing) */
    image(folder, name) {
      if (!name) return Promise.resolve(null);
      const key = `${folder}/${name}`;
      if(this.missing.has('Graphics/'+key))return Promise.resolve(null);
      if(this.imageCache.has(key)){
        if(this.retainedImages.has(key)){
          const size=this.retainedImages.get(key);this.retainedImages.delete(key);this.retainedImages.set(key,size);
        }
        return this.imageCache.get(key);
      }
      const live=this.liveImages.get(key)?.deref();
      if(live)return Promise.resolve(live);
      const promise = (async () => {
        const candidates=/\.(png|jpe?g)$/i.test(name)?[name]:IMG_EXT.map(ext=>name+'.'+ext);
        for (const file of candidates) {
          const path = `Graphics/${folder}/${file}`;
          if (!this.source.has(path)) continue;
          try { return await this.decodeAsset(path); } catch { /* try next extension */ }
        }
        this.missing.add(`Graphics/${folder}/${name}`);
        return null;
      })();
      this.imageCache.set(key, promise);
      const release=()=>{if(this.imageCache.get(key)===promise)this.imageCache.delete(key);};
      promise.then(image=>{
        if(!image){release();return;}
        if(typeof WeakRef==='function'){
          this.liveImages.delete(key);
          if(this.liveImages.size>=512)this.liveImages.delete(this.liveImages.keys().next().value);
          this.liveImages.set(key,new WeakRef(image));
        }
        if(!this.retainImages){release();return;}
        const size=image.width*image.height*4;
        this.retainedBytes+=size;this.retainedImages.set(key,size);
        while(this.retainedImages.size>96 || this.retainedBytes>32*1024*1024){
          const [old,bytes]=this.retainedImages.entries().next().value;
          this.retainedImages.delete(old);this.imageCache.delete(old);this.retainedBytes-=bytes;
        }
      },release);
      return promise;
    }
    async sheetsFor(map) {
      const tileset = this.tilesets?.[map.tileset_id];
      const names = Array.isArray(tileset?.tileset_names) ? tileset.tileset_names : [];
      const images = await Promise.all(names.map(n => this.image('Tilesets', n)));
      return {images, flags: tileset?.flags};
    }
  }

  root.VX.Project=Project;
})(globalThis);
