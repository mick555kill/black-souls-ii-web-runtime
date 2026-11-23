/* VX Ace tile composition. Tile ids encode the autotile "shape", so no neighbour scan is needed.
   Quarter index q = qy*4 + qx (16px quarters inside a 4-wide block). */
(function (root) {
  'use strict';
  const T = 32, H = 16;
  // 48 floor shapes (A1 water / A2 ground / A4 tops). Block is 4x6 quarters; 47 = whole top-left tile.
  const FLOOR = [
    [18,17,14,13],[2,17,14,13],[18,3,14,13],[2,3,14,13],[18,17,14,7],[2,17,14,7],[18,3,14,7],[2,3,14,7],
    [18,17,6,13],[2,17,6,13],[18,3,6,13],[2,3,6,13],[18,17,6,7],[2,17,6,7],[18,3,6,7],[2,3,6,7],
    [16,17,12,13],[16,3,12,13],[16,17,12,7],[16,3,12,7],[10,9,14,13],[10,9,14,7],[10,9,6,13],[10,9,6,7],
    [18,19,14,15],[18,19,6,15],[2,19,14,15],[2,19,6,15],[18,17,22,21],[2,17,22,21],[18,3,22,21],[2,3,22,21],
    [16,19,12,15],[10,9,22,21],[8,9,12,13],[8,9,12,7],[10,11,14,15],[10,11,6,15],[18,19,22,23],[2,19,22,23],
    [16,17,20,21],[16,3,20,21],[8,11,12,15],[8,9,20,21],[16,19,20,23],[10,11,22,23],[8,11,20,23],[0,1,4,5]
  ];
  // 16 wall shapes (A3 / A4 sides). Block is 4x4 quarters. bit1=left open, 2=top, 4=right, 8=bottom.
  const WALL = [
    [10,9,6,5],[8,9,4,5],[2,1,6,5],[0,1,4,5],[10,11,6,7],[8,11,4,7],[2,3,6,7],[0,3,4,7],
    [10,9,14,13],[8,9,12,13],[2,1,14,13],[0,1,12,13],[10,11,14,15],[8,11,12,15],[2,3,14,15],[0,3,12,15]
  ];
  const WATERFALL = [
    [2,1,6,5],[0,1,4,5],[2,3,6,7],[0,3,4,7]
  ];
  const A1POS = [[0,0],[0,96],[192,0],[192,96],[256,0],[448,0],[256,96],[448,96],
                 [0,192],[192,192],[0,288],[192,288],[256,192],[448,192],[256,288],[448,288]];
  const isWaterfall = k => k < 16 && k % 2 === 1 && k >= 5;

  /** Describe where a tile comes from: {sheet, quads:[{sx,sy}x4]} or {sheet,sx,sy,whole:true}. frame = animation step */
  function locate(id, frame = 0) {
    if (id <= 0) return null;
    if (id < 1024) { // B..E
      const n = id % 256;
      return {sheet: 5 + (id >> 8), whole: true, sx: T * ((n % 8) + 8 * (n >> 7)), sy: T * ((n % 128) >> 3)};
    }
    if (id >= 1536 && id < 1664) { const n = id - 1536; return {sheet: 4, whole: true, sx: T * (n % 8), sy: T * ((n % 128) >> 3)}; }
    if (id < 2048 || id >= 8192) return null;
    const kind = Math.floor((id - 2048) / 48), shape = (id - 2048) % 48;
    let sheet, bx, by, table;
    if (kind < 16) {
      sheet = 0;
      [bx, by] = A1POS[kind];
      if (isWaterfall(kind)) {
        table = WATERFALL; if (shape > 3) return null;
        by += T * (frame % 3);
      } else {
        table = FLOOR;
        if (kind !== 2 && kind !== 3) bx += 2 * T * [0,1,2,1][frame % 4];
      }
    } else if (kind < 48) { sheet = 1; const k = kind - 16; bx = 2 * T * (k % 8); by = 3 * T * (k >> 3); table = FLOOR; }
    else if (kind < 80) { sheet = 2; const k = kind - 48; bx = 2 * T * (k % 8); by = 2 * T * (k >> 3); table = WALL; }
    else {
      sheet = 3; const k = kind - 80, row = k >> 3;
      bx = 2 * T * (k % 8); by = 3 * T * ((row + 1) >> 1) + 2 * T * (row >> 1);
      table = row % 2 === 0 ? FLOOR : WALL;
    }
    const entry = table[shape];
    if (!entry) return null;
    return {sheet, quads: entry.map(q => ({sx: bx + H * (q % 4), sy: by + H * (q >> 2)}))};
  }
  function phase(id,frame){
    if(id<2048 || id>=2816)return 0;
    const kind=Math.floor((id-2048)/48);
    if(kind===2 || kind===3)return 0;
    return isWaterfall(kind)?frame%3:[0,1,2,1][frame%4];
  }

  /** Composite a tile into a 32x32 canvas created by makeCanvas(w,h). Returns canvas or null. */
  function compose(id, sheets, frame, makeCanvas) {
    const loc = locate(id, frame);
    if (!loc) return null;
    const img = sheets[loc.sheet];
    if (!img) return null;
    const cv = makeCanvas(T, T), c = cv.getContext('2d');
    if (loc.whole) { c.drawImage(img, loc.sx, loc.sy, T, T, 0, 0, T, T); return cv; }
    loc.quads.forEach((q, i) => c.drawImage(img, q.sx, q.sy, H, H, (i % 2) * H, (i >> 1) * H, H, H));
    return cv;
  }

  root.VX = root.VX || {};
  root.VX.Autotile = {FLOOR, WALL, WATERFALL, A1POS, locate, compose, phase, animated:id=>id>=2048&&id<2816, isWaterfall};
  if (typeof module !== 'undefined') module.exports = root.VX.Autotile;
})(typeof window !== 'undefined' ? window : globalThis);
