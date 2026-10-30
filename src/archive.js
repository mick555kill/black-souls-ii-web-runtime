/* RGSS3A v3 archive reader, original implementation. No game files are uploaded. */
(function (root) {
  'use strict';
  class Cursor {
    constructor(file, pos = 0) { this.file = file; this.pos = pos; this.start = 0; this.cache = new Uint8Array(0); }
    async bytes(n) {
      if (!Number.isSafeInteger(n) || n < 0 || this.pos + n > this.file.size) throw Error('Archive ends unexpectedly');
      if (this.pos < this.start || this.pos + n > this.start + this.cache.length) {
        this.start = this.pos;
        this.cache = new Uint8Array(await this.file.slice(this.pos, Math.min(this.file.size, this.pos + Math.max(n, 131072))).arrayBuffer());
      }
      const from = this.pos - this.start;
      this.pos += n;
      return this.cache.subarray(from, from + n);
    }
    async u32() { const b = await this.bytes(4); return (b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24) >>> 0; }
  }
  function decodePath(bytes) {
    try { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('utf-8').decode(bytes); }
  }
  class RGSS3Archive {
    constructor(file, entries) { this.file = file; this.entries = entries; this.lookup = new Map(entries.map(x => [x.name.toLowerCase(), x])); }
    static async open(file, report = () => {}) {
      const cur = new Cursor(file);
      const header = await cur.bytes(8);
      if ([82,71,83,83,65,68,0,3].some((b,i) => header[i] !== b)) throw Error('Expected RGSSAD v3 (.rgss3a), not this file type');
      const seed = await cur.u32();
      const key = (Math.imul(seed, 9) + 3) >>> 0;
      const entries = [];
      while (true) {
        if (entries.length >= 100000) throw Error('Archive has too many entries');
        const start = cur.pos;
        const offset = (await cur.u32()) ^ key;
        if (offset === 0) break;
        const size = ((await cur.u32()) ^ key) >>> 0;
        const fileKey = ((await cur.u32()) ^ key) >>> 0;
        const nameSize = ((await cur.u32()) ^ key) >>> 0;
        if (nameSize === 0 || nameSize > 4096) throw Error(`Invalid archive filename length at ${start}`);
        const encrypted = await cur.bytes(nameSize);
        const raw = Uint8Array.from(encrypted, (b,i) => b ^ ((key >>> ((i % 4) * 8)) & 255));
        const name = decodePath(raw).replace(/\\/g, '/');
        if (!name || name.includes('\0')) throw Error('Invalid filename in archive');
        if (offset > file.size || size > file.size - offset) throw Error(`File outside archive: ${name}`);
        entries.push({name, offset: offset >>> 0, size, key: fileKey});
        if (entries.length % 100 === 0) report(entries.length);
      }
      const tableEnd = cur.pos;
      for (const entry of entries) if (entry.offset < tableEnd) throw Error(`Entry overlaps file index: ${entry.name}`);
      return new RGSS3Archive(file, entries);
    }
    has(name) { return this.lookup.has(name.replace(/\\/g, '/').toLowerCase()); }
    names(prefix = '') { return this.entries.map(e => e.name).filter(n => n.toLowerCase().startsWith(prefix.toLowerCase())); }
    async read(name, maxBytes = 64 * 1024 * 1024) {
      const entry = this.lookup.get(name.replace(/\\/g, '/').toLowerCase());
      if (!entry) throw Error(`File not found: ${name}`);
      if (entry.size > maxBytes) throw Error(`File exceeds per-read memory limit: ${name}`);
      const data = new Uint8Array(await this.file.slice(entry.offset, entry.offset + entry.size).arrayBuffer());
      let key = entry.key;
      for (let i = 0; i < data.length; i++) {
        data[i] ^= (key >>> (8 * (i % 4))) & 255;
        if ((i % 4) === 3) key = (Math.imul(key, 7) + 3) >>> 0;
      }
      return data;
    }
  }
  root.VX = root.VX || {};
  root.VX.RGSS3Archive = RGSS3Archive;
  if (typeof module !== 'undefined') module.exports = {RGSS3Archive};
})(typeof window !== 'undefined' ? window : globalThis);
