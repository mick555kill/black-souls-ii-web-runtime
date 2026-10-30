/* ZIP container reader for a single VX Ace Game.rgss3a. Nothing is uploaded. */
(function (root) {
  'use strict';
  const u16 = (d, p) => d.getUint16(p, true);
  const u32 = (d, p) => d.getUint32(p, true);
  const utf8 = new TextDecoder('utf-8');
  class ZipContainer {
    constructor(file, entries) { this.file = file; this.entries = entries; }

    static async open(file) {
      if (file.size < 22) throw Error('ZIP file is too short');
      const tailStart = Math.max(0, file.size - 65557);
      const tail = new DataView(await file.slice(tailStart).arrayBuffer());
      let end = -1;
      for (let i = tail.byteLength - 22; i >= 0; i--) {
        if (u32(tail, i) === 0x06054b50 && i + 22 + u16(tail, i + 20) === tail.byteLength) { end = i; break; }
      }
      if (end < 0) throw Error('Cannot find ZIP central directory');
      if (u16(tail, end + 4) || u16(tail, end + 6)) throw Error('Multi-volume ZIP is not supported');
      const count = u16(tail, end + 10);
      const dirSize = u32(tail, end + 12);
      const dirStart = u32(tail, end + 16);
      if (count === 65535 || dirSize === 0xffffffff || dirStart === 0xffffffff) throw Error('ZIP64 is not supported');
      if (dirStart + dirSize > file.size || dirSize > 32 * 1024 * 1024) throw Error('Invalid ZIP directory');
      const view = new DataView(await file.slice(dirStart, dirStart + dirSize).arrayBuffer());
      const entries = [];
      let pos = 0;
      for (let i = 0; i < count; i++) {
        if (pos + 46 > view.byteLength || u32(view, pos) !== 0x02014b50) throw Error('Invalid ZIP directory entry');
        const flags = u16(view, pos + 8), method = u16(view, pos + 10);
        const compressed = u32(view, pos + 20), size = u32(view, pos + 24);
        const nameLen = u16(view, pos + 28), extraLen = u16(view, pos + 30), commentLen = u16(view, pos + 32);
        const next = pos + 46 + nameLen + extraLen + commentLen;
        if (next > view.byteLength) throw Error('Invalid ZIP filename');
        const nameBytes = new Uint8Array(view.buffer, view.byteOffset + pos + 46, nameLen);
        let name;
        try { name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes); }
        catch { name = new TextDecoder('shift_jis').decode(nameBytes); }
        name = name.replace(/\\/g, '/');
        entries.push({ name, flags, method, compressed, size, localOffset: u32(view, pos + 42) });
        pos = next;
      }
      return new ZipContainer(file, entries);
    }

    gameArchive() {
      const candidates = this.entries.filter(entry => /(^|\/)Game\.rgss3a$/i.test(entry.name));
      if (!candidates.length) throw Error('ZIP does not contain a Game.rgss3a file. Loose Data/Graphics folders are not yet supported.');
      candidates.sort((a, b) => a.name.length - b.name.length);
      return candidates[0];
    }

    find(name) { const n = name.toLowerCase(); return this.entries.find(e => e.name.toLowerCase() === n) || null; }

    async unpackGame(onProgress = () => {}) { return this.openEntry(this.gameArchive(), onProgress); }

    async openEntry(entry, onProgress = () => {}) {
      if ((entry.flags & 1) !== 0) throw Error('Password-protected ZIP is not supported');
      if (entry.method !== 0 && entry.method !== 8) throw Error(`ZIP compression method ${entry.method} is unsupported`);
      if (entry.size === 0xffffffff || entry.compressed === 0xffffffff || entry.localOffset === 0xffffffff) throw Error('ZIP64 entries are not supported');
      const headerBytes = new DataView(await this.file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
      if (headerBytes.byteLength !== 30 || u32(headerBytes, 0) !== 0x04034b50) throw Error('Invalid ZIP local header');
      const dataStart = entry.localOffset + 30 + u16(headerBytes, 26) + u16(headerBytes, 28);
      if (dataStart + entry.compressed > this.file.size) throw Error('ZIP file data is out of bounds');
      const blob = this.file.slice(dataStart, dataStart + entry.compressed);
      if (entry.method === 0) {
        if (entry.compressed !== entry.size) throw Error('Invalid uncompressed ZIP entry');
        return blob; // Zero-copy slice: suitable for large Game.rgss3a files.
      }
      if (typeof DecompressionStream === 'undefined') throw Error('Browser cannot decompress ZIP entries; use a STORE / uncompressed ZIP');
      onProgress(`กำลังคลาย ZIP (${(entry.size / 1048576).toFixed(0)} MiB) · อาจใช้ RAM สูง`);
      let stream;
      try { stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw')); }
      catch { throw Error('Browser does not support ZIP deflate-raw; extract Game.rgss3a on your PC first'); }
      const uncompressed = await new Response(stream).blob();
      if (uncompressed.size !== entry.size) throw Error('ZIP decompressed size mismatch');
      return uncompressed;
    }
  }
  root.VX = root.VX || {};
  root.VX.ZipContainer = ZipContainer;
  if (typeof module !== 'undefined') module.exports = { ZipContainer };
})(typeof window !== 'undefined' ? window : globalThis);
