/* Uniform read access to game files: RGSS3A archive, loose ZIP, picked folder, or several combined
   (e.g. Game.rgss3a + an RTP folder). Lookups are case-insensitive like Windows. */
(function (root) {
  'use strict';
  const norm = n => String(n).replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
  const TOP = /(^|\/)((data|graphics|audio|fonts|movies)\/.*)$/i;

  class ArchiveSource {
    constructor(archive) { this.archive = archive; this.label = 'Game.rgss3a'; }
    has(n) { return this.archive.has(n); }
    read(n, max) { return this.archive.read(n, max); }
    names() { return this.archive.entries.map(e => e.name); }
  }

  class ZipSource { // loose files inside a ZIP (entry named Data/..., Graphics/..., possibly under one folder)
    constructor(zip, label = 'ZIP') {
      this.zip = zip; this.label = label; this.index = new Map();
      for (const e of zip.entries) {
        if (e.name.endsWith('/')) continue;
        const m = TOP.exec(e.name);
        if (m) { const key = norm(m[2]); if (!this.index.has(key)) this.index.set(key, e); }
      }
    }
    has(n) { return this.index.has(norm(n)); }
    async read(n, max = 64 * 1024 * 1024) {
      const e = this.index.get(norm(n));
      if (!e) throw Error(`File not found: ${n}`);
      if (e.size > max) throw Error(`File exceeds per-read memory limit: ${n}`);
      const blob = await this.zip.openEntry(e);
      return new Uint8Array(await blob.arrayBuffer());
    }
    names() { return [...this.index.values()].map(e => e.name); }
  }

  class FolderSource { // File objects from <input webkitdirectory> or drag & drop
    constructor(files, label = 'โฟลเดอร์') {
      this.label = label; this.index = new Map();
      for (const f of files) {
        const rel = f.webkitRelativePath || f.name, m = TOP.exec(rel);
        if (m) this.index.set(norm(m[2]), f);
      }
    }
    has(n) { return this.index.has(norm(n)); }
    async read(n, max = 64 * 1024 * 1024) {
      const f = this.index.get(norm(n));
      if (!f) throw Error(`File not found: ${n}`);
      if (f.size > max) throw Error(`File exceeds per-read memory limit: ${n}`);
      return new Uint8Array(await f.arrayBuffer());
    }
    names() { return [...this.index.keys()]; }
  }

  class CompositeSource {
    constructor(sources = []) { this.sources = sources; }
    add(s) { this.sources.push(s); return this; }
    has(n) { return this.sources.some(s => s.has(n)); }
    read(n, max) {
      const s = this.sources.find(x => x.has(n));
      if (!s) return Promise.reject(Error(`File not found: ${n}`));
      return s.read(n, max);
    }
    names() { return this.sources.flatMap(s => s.names()); }
    get entries() { return this.names().map(name => ({name})); } // for UI counters
  }

  root.VX = root.VX || {};
  Object.assign(root.VX, {ArchiveSource, ZipSource, FolderSource, CompositeSource});
  if (typeof module !== 'undefined') module.exports = {ArchiveSource, ZipSource, FolderSource, CompositeSource};
})(typeof window !== 'undefined' ? window : globalThis);
