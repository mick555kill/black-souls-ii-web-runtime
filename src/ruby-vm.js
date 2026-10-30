/* Main-thread bridge to CRuby 3.2 in a Web Worker and partial RGSS3 host. */
(function(root) {
  'use strict';
  class RubyWebAssemblyVM {
    constructor(workerUrl = 'src/ruby-worker.js') {
      if (typeof Worker !== 'function') throw Error('Web Workers unavailable in this browser');
      this.worker = new Worker(workerUrl);
      this.nextId = 1;
      this.pending = new Map();
      this.closed = false;
      this.onRGSSCommand = null;
      this.worker.addEventListener('message', event => {
        const message = event.data || {};
        if(message.rgss){
          const command=message.rgss;
          if(command.op==='frame'){
            const effect=this.onRGSSCommand
              ?Promise.resolve().then(()=>this.onRGSSCommand(command))
              :new Promise(resolve=>setTimeout(resolve,16));
            effect.catch(error=>console.error('RGSS3 frame bridge:',error)).finally(()=>{
              if(!this.closed)this.worker.postMessage({type:'rgss-frame-ack',token:command.token});
            });
          }else{
            try{this.onRGSSCommand?.(command);}catch(error){console.error('RGSS3 command:',error);}
          }
          return;
        }
        const call = this.pending.get(message.id);
        if (!call) return;
        if (message.progress) {
          call.onProgress?.(message.progress);
          return;
        }
        this.pending.delete(message.id);
        if (message.ok) call.resolve(message.result);
        else call.reject(Error(message.error || 'Ruby worker failed'));
      });
      this.worker.addEventListener('error', event => {
        const error = Error(event.message || 'Ruby Web Worker failed');
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      });
    }
    request(type, payload = {}, onProgress) {
      if (this.closed) return Promise.reject(Error('Ruby VM has been terminated'));
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, {resolve, reject, onProgress});
        try {this.worker.postMessage({id, type, ...payload});}
        catch (error) {this.pending.delete(id); reject(error);}
      });
    }
    initialize() {return this.request('init');}
    eval(source) {return this.request('eval', {source});}
    installRGSS() {return this.request('rgss-install');}
    runRGSS(source) {return this.request('rgss-run',{source});}
    loadRGSSScripts(entries,{onProgress}={}){
      return this.request('rgss-load-scripts',{
        entries:entries.map(entry=>({name:entry.name,source:entry.source})),
      },onProgress);
    }
    loadRGSSData(name,bytes) {
      if(!(bytes instanceof Uint8Array))return Promise.reject(Error('RGSS3 database must be Uint8Array'));
      return this.request('rgss-data-load',{name,bytes});
    }
    clearRGSSData() {return this.request('rgss-data-clear');}
    setInput(key,down){if(!this.closed)this.worker.postMessage({type:'rgss-input',key,down:!!down});}
    compileScripts(entries, {onProgress} = {}) {
      return this.request('compile', {
        entries: entries.map(entry => ({name: entry.name, source: entry.source})),
      }, onProgress);
    }
    terminate() {
      if (this.closed) return;
      this.closed = true;
      this.worker.terminate();
      for (const pending of this.pending.values()) pending.reject(Error('Ruby VM terminated'));
      this.pending.clear();
    }
  }
  root.VX = root.VX || {};
  root.VX.RubyWebAssemblyVM = RubyWebAssemblyVM;
  if (typeof module !== 'undefined') module.exports = {RubyWebAssemblyVM};
})(typeof window !== 'undefined' ? window : globalThis);
