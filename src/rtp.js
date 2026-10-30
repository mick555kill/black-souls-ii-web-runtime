/* Identify extracted VX Ace RTP ZIP archives versus RPG Maker's Windows installer ZIP.
   No files are uploaded: the browser reads the ZIP's directory locally. */
(function (root) {
  'use strict';
  function inspectRTP(zip) {
    const entries = zip.entries.filter(e => !e.name.endsWith('/'));
    const has = re => entries.some(e => re.test(e.name));
    const graphics = entries.filter(e => /(^|\/)Graphics\/[^/]+\//i.test(e.name)).length;
    const audio = entries.filter(e => /(^|\/)Audio\/[^/]+\//i.test(e.name)).length;
    const installer = has(/(^|\/)Setup\.exe$/i) && has(/(^|\/)Setup-\d+\.bin$/i);
    return {graphics, audio, installer, usable: graphics > 0 || audio > 0};
  }
  root.VX = root.VX || {};
  root.VX.inspectRTP = inspectRTP;
  if (typeof module !== 'undefined') module.exports = {inspectRTP};
})(typeof window !== 'undefined' ? window : globalThis);
