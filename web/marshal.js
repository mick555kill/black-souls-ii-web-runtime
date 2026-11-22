/* Ruby Marshal 4.8 subset for reading RPG Maker VX Ace data (no Ruby execution). */
(function (root) {
  'use strict';
  const utf8 = new TextDecoder('utf-8', {fatal: true});
  function decode(bytes) {
    try {return utf8.decode(bytes);} catch {return new TextDecoder('shift_jis').decode(bytes);}
  }
  class RubyTable {
    constructor(data) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (data.byteLength < 20) throw Error('Truncated RGSS Table');
      this.dimensions = view.getInt32(0, true);
      this.width = view.getInt32(4, true);
      this.height = view.getInt32(8, true);
      this.depth = view.getInt32(12, true);
      const count = view.getInt32(16, true);
      if (count < 0 || count > (data.byteLength - 20) / 2 || count > 20000000) throw Error('Invalid RGSS Table length');
      this.data = new Int16Array(count);
      for(let i=0;i<count;i++) this.data[i] = view.getInt16(20+i*2, true);
    }
    at(x,y=0,z=0) {
      if(x<0||y<0||z<0||x>=this.width||y>=this.height||z>=this.depth) return 0;
      return this.data[x+this.width*(y+this.height*z)] || 0;
    }
  }
  class MarshalReader {
    constructor(buffer, {rawStrings = false} = {}) {
      this.bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      this.pos = 0; this.objects=[]; this.symbols=[]; this.count=0; this.rawStrings=rawStrings;
    }
    read(n) {
      if(!Number.isSafeInteger(n)||n<0||this.pos+n>this.bytes.length) throw Error('Truncated Ruby Marshal stream');
      const out=this.bytes.subarray(this.pos,this.pos+n);this.pos+=n;return out;
    }
    byte(){return this.read(1)[0];}
    number(){
      const c=this.byte()<<24>>24;
      if(c===0)return 0;
      if(c>4)return c-5;
      if(c< -4)return c+5;
      let n=Math.abs(c), value=0;
      for(let i=0;i<n;i++)value+=this.byte()*2**(8*i);
      return c<0?value-2**(8*n):value;
    }
    size(max=20000000){const n=this.number();if(!Number.isSafeInteger(n)||n<0||n>max)throw Error('Invalid Marshal length');return n;}
    stringBytes(){return this.read(this.size(64*1024*1024));}
    symbol(){return this.value();}
    record(value){this.objects.push(value);return value;}
    value(depth=0){
      if(depth>300||++this.count>4000000)throw Error('Marshal nesting or item limit exceeded');
      const tag=String.fromCharCode(this.byte());
      switch(tag){
        case '0':return null;
        case 'T':return true;
        case 'F':return false;
        case 'i':return this.number();
        case ':':{const str=decode(this.stringBytes());this.symbols.push(str);return str;}
        case ';':{const index=this.number();if(index<0||index>=this.symbols.length)throw Error('Invalid Marshal symbol reference');return this.symbols[index];}
        case '@':{const index=this.number();if(index<0||index>=this.objects.length)throw Error('Invalid Marshal object reference');return this.objects[index];}
        case '"':{const bytes=this.stringBytes();return this.record(this.rawStrings?bytes:decode(bytes));}
        case '[':{const a=this.record([]),n=this.size();for(let i=0;i<n;i++)a.push(this.value(depth+1));return a;}
        case '{':case '}':{
          const map=this.record({});const n=this.size();
          for(let i=0;i<n;i++)map[String(this.value(depth+1))]=this.value(depth+1);
          if(tag==='}')map.__default=this.value(depth+1);
          return map;
        }
        case 'o':{
          const obj={__class:this.symbol()};this.record(obj);
          const n=this.size(100000);
          for(let i=0;i<n;i++){
            const key=this.symbol();obj[String(key).replace(/^@/,'')]=this.value(depth+1);
          }
          return obj;
        }
        case 'I':{
          const obj=this.value(depth+1),n=this.size(100000);
          for(let i=0;i<n;i++){const key=this.symbol(),val=this.value(depth+1);if(obj&&typeof obj==='object')obj[String(key).replace(/^@/,'')]=val;}
          return obj;
        }
        case 'u':{
          const cls=this.symbol(),raw=this.stringBytes();
          return this.record(cls==='Table'?new RubyTable(raw):{__class:cls,__raw:raw});
        }
        case 'U':{const cls=this.symbol(),obj={__class:cls};this.record(obj);obj.__data=this.value(depth+1);return obj;}
        case 'S':{
          const obj={__class:this.symbol()};this.record(obj);const n=this.size(100000);
          for(let i=0;i<n;i++)obj[String(this.symbol())]=this.value(depth+1);
          return obj;
        }
        case 'f':{const text=decode(this.stringBytes()).split('\0')[0];const f=text==='inf'?Infinity:text==='-inf'?-Infinity:text==='nan'?NaN:Number(text);return this.record(f);}
        case 'l':{
          const sign=String.fromCharCode(this.byte()),count=this.size(256);let n=0n;
          for(let i=0;i<count*2;i++)n|=BigInt(this.byte())<<BigInt(i*8);
          if(sign==='-')n=-n;
          return this.record(n<=BigInt(Number.MAX_SAFE_INTEGER)&&n>=BigInt(Number.MIN_SAFE_INTEGER)?Number(n):n);
        }
        case 'c':case 'm':return this.record(decode(this.stringBytes()));
        case 'e':{this.symbol();return this.value(depth+1);}
        case 'C':{const cls=this.symbol(),obj=this.value(depth+1);if(obj&&typeof obj==='object')obj.__class=cls;return obj;}
        case '/':{const str=decode(this.stringBytes());this.byte();return this.record(str);}
        default:throw Error(`Unsupported Ruby Marshal tag '${tag}' (0x${tag.charCodeAt(0).toString(16)}) at ${this.pos-1}`);
      }
    }
    parse(){
      const major=this.byte(),minor=this.byte();
      if(major!==4||minor>8)throw Error(`Unsupported Ruby Marshal version ${major}.${minor}`);
      return this.value();
    }
  }
  root.VX=root.VX||{};
  root.VX.MarshalReader=MarshalReader;
  root.VX.RubyTable=RubyTable;
  if(typeof module!=='undefined')module.exports={MarshalReader,RubyTable};
})(typeof window!=='undefined'?window:globalThis);
