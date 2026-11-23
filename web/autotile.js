/* VX Ace tile composition. Tile ids encode the autotile "shape", so no neighbour scan is needed.
   Quarter index q = qy*4 + qx (16px quarters inside a 4-wide block). */
(function (root) {
  'use strict';
  const T = 32, H = 16;
  // 48 floor shapes (A1 water / A2 ground / A4 tops). Block is 4x6 quarters; 47 = whole top-left tile.
  const FLOOR = [
    [13,14,17,18],[2,14,17,18],[13,3,17,18],[2,3,17,18],[13,14,17,7],[2,14,17,7],[13,3,17,7],[2,3,17,7],
    [13,14,6,18],[2,14,6,18],[13,3,6,18],[2,3,6,18],[13,14,6,7],[2,14,6,7],[13,3,6,7],[2,3,6,7],
    [12,14,16,18],[12,3,16,18],[12,14,16,7],[12,3,16,7],[9,10,17,18],[9,10,17,7],[9,10,6,18],[9,10,6,7],
    [13,15,17,19],[13,15,6,19],[2,15,17,19],[2,15,6,19],[13,14,21,22],[2,14,21,22],[13,3,21,22],[2,3,21,22],
    [12,15,16,19],[9,10,21,22],[8,9,12,13],[8,9,12,7],[10,11,14,15],[10,11,6,15],[18,19,22,23],[2,19,22,23],
    [16,17,20,21],[16,3,20,21],[8,11,12,15],[8,9,20,21],[16,19,20,23],[10,11,22,23],[8,11,20,23],[0,1,4,5]
  ];
  // 16 wall shapes (A3 / A4 sides). Block is 4x4 quarters. bit1=left open, 2=top, 4=right, 8=bottom.
  const WALL = [
    [5,6,9,10],[4,5,8,9],[1,2,5,6],[0,1,4,5],[6,7,10,11],[4,7,8,11],[2,3,6,7],[0,3,4,7],
    [9,10,13,14],[8,9,12,13],[1,2,13,14],[0,1,12,13],[10,11,14,15],[8,11,12,15],[2,3,14,15],[0,3,12,15]
  ];
  const WATERFALL = [[0,1,6,7],[0,1,4,5],[2,3,6,7],[1,2,5,6]];
  const A1POS = [[0,0],[0,96],[192,0],[192,96],[256,0],[448,0],[256,96],[448,96],
                 [0,192],[192,192],[0,288],[192,288],[256,192],[448,192],[256,288],[448,288]];
  const isWaterfall = k => k < 16 && k % 2 === 1 && k >= 5;

  /** Describe where a tile comes from: {sheet, quads:[{sx,sy}x4]} or {sheet,sx,sy,whole:true}. frame = 0..2 */
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
        if (kind !== 2 && kind !== 3) bx += 2 * T * (frame % 3);
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
  const animated = id => id >= 2048 && id < 2816;

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
  root.VX.Autotile = {FLOOR, WALL, WATERFALL, A1POS, locate, compose, animated, isWaterfall};
  if (typeof module !== 'undefined') module.exports = root.VX.Autotile;
})(typeof window !== 'undefined' ? window : globalThis);
