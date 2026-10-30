/* Game state, characters (player/events) and an event-command interpreter for RPG Maker VX Ace data.
   Ruby scripts (command 355, script conditions) are NOT executed; they are recorded as unsupported. */
(function (root) {
  'use strict';
  const DX = {2: 0, 4: -1, 6: 1, 8: 0}, DY = {2: 1, 4: 0, 6: 0, 8: -1};
  const REV = {2: 8, 4: 6, 6: 4, 8: 2};
  const LEFT90 = {2: 6, 6: 8, 8: 4, 4: 2}, RIGHT90 = {2: 4, 4: 8, 8: 6, 6: 2};

  class GameState {
    constructor() { this.switches = {}; this.variables = {}; this.selfSwitches = {}; this.gold = 0; this.items = {}; this.steps = 0; this.saveDisabled = false; this.actorNames = {}; }
    sw(id) { return !!this.switches[id]; }
    setSw(id, v) { this.switches[id] = !!v; }
    v(id) { return this.variables[id] | 0; }
    setV(id, v) { this.variables[id] = Math.trunc(Number(v)) || 0; }
    ss(map, ev, ch) { return !!this.selfSwitches[`${map},${ev},${ch}`]; }
    setSS(map, ev, ch, v) { this.selfSwitches[`${map},${ev},${ch}`] = !!v; }
    toJSON() { const {switches, variables, selfSwitches, gold, items, steps, saveDisabled, actorNames} = this; return {switches, variables, selfSwitches, gold, items, steps, saveDisabled, actorNames}; }
    static from(o) { const g = new GameState(); if (o && typeof o === 'object') for (const k of Object.keys(g.toJSON())) if (o[k] !== undefined) g[k] = o[k]; return g; }
  }

  class Character {
    constructor() {
      this.x = 0; this.y = 0; this.realX = 0; this.realY = 0; this.dir = 2; this.speed = 4; this.freq = 3;
      this.through = false; this.transparent = false; this.walkAnim = true; this.stepAnim = false; this.dirFix = false;
      this.priority = 1; this.graphic = {name: '', index: 0, tileId: 0};
      this.animCount = 0; this.pattern = 1; this.route = null; this.wait = 0; this.stuck = 0; this.game = null; this.erased = false;
    }
    locate(x, y) { this.x = this.realX = x; this.y = this.realY = y; }
    moving() { return this.realX !== this.x || this.realY !== this.y; }
    turn(d) { if (!this.dirFix && DX[d] !== undefined) this.dir = d; }
    canPass(d) { return this.through || !this.game || this.game.canPass(this, this.x, this.y, d); }
    moveStraight(d, turn = true) {
      if (turn) this.turn(d);
      if (!this.canPass(d)) return false;
      this.x += DX[d]; this.y += DY[d]; return true;
    }
    moveDiagonal(h, v) {
      this.turn(this.dir === REV[h] ? h : this.dir === REV[v] ? v : v);
      const okH = this.canPass(h), okV = this.canPass(v);
      if (okH && okV) { this.x += DX[h]; this.y += DY[v]; return true; }
      if (okV) { this.y += DY[v]; return true; }
      if (okH) { this.x += DX[h]; return true; }
      return false;
    }
    towardPlayer() { const p = this.game.player, dx = p.x - this.x, dy = p.y - this.y; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8); }
    update() {
      const step = Math.pow(2, this.speed) / 256;
      if (this.realX < this.x) this.realX = Math.min(this.realX + step, this.x); else if (this.realX > this.x) this.realX = Math.max(this.realX - step, this.x);
      if (this.realY < this.y) this.realY = Math.min(this.realY + step, this.y); else if (this.realY > this.y) this.realY = Math.max(this.realY - step, this.y);
      if (this.moving() ? this.walkAnim : this.stepAnim) this.animCount += 1; else if (!this.moving() && !this.stepAnim) { this.animCount = 0; }
      if (this.wait > 0) this.wait -= 1;
      else if (this.route) this.updateRoute();
    }
    get displayPattern() { return this.animCount ? [0, 1, 2, 1][Math.floor(this.animCount / Math.max(4, 12 - this.speed * 2)) % 4] : 1; }
    startRoute(list, repeat, skippable) {
      return new Promise(resolve => { this.route = {list: list || [], index: 0, repeat: !!repeat, skippable: !!skippable, done: resolve}; });
    }
    endRoute() { const r = this.route; this.route = null; if (r && r.done) r.done(); }
    updateRoute() {
      const r = this.route;
      if (this.moving()) return;
      for (let guard = 0; guard < 24 && this.route === r; guard++) {
        const cmd = r.list[r.index];
        if (!cmd || cmd.code === 0) {
          if (r.repeat && r.list.length > 1) { r.index = 0; if (guard > 16) return; continue; }
          return this.endRoute();
        }
        const ok = this.routeCommand(cmd);
        if (!ok && !r.skippable && ++this.stuck < 60) return; // retry later
        this.stuck = 0; r.index += 1;
        if (this.moving() || this.wait > 0) return;
      }
    }
    routeCommand(cmd) {
      const p = cmd.parameters || [], g = this.game;
      switch (cmd.code) {
        case 1: return this.moveStraight(2); case 2: return this.moveStraight(4);
        case 3: return this.moveStraight(6); case 4: return this.moveStraight(8);
        case 5: return this.moveDiagonal(4, 2); case 6: return this.moveDiagonal(6, 2);
        case 7: return this.moveDiagonal(4, 8); case 8: return this.moveDiagonal(6, 8);
        case 9: return this.moveStraight([2, 4, 6, 8][Math.floor(Math.random() * 4)]);
        case 10: return this.moveStraight(this.towardPlayer());
        case 11: return this.moveStraight(REV[this.towardPlayer()]);
        case 12: return this.moveStraight(this.dir);
        case 13: return this.moveStraight(REV[this.dir], false);
        case 14: this.x += p[0] | 0; this.y += p[1] | 0; this.realX = this.x; this.realY = this.y; return true;
        case 15: this.wait = Math.max(1, (p[0] | 0) * 2 - 1); return true;
        case 16: this.turn(2); return true; case 17: this.turn(4); return true;
        case 18: this.turn(6); return true; case 19: this.turn(8); return true;
        case 20: this.turn(RIGHT90[this.dir]); return true; case 21: this.turn(LEFT90[this.dir]); return true;
        case 22: this.turn(REV[this.dir]); return true;
        case 23: this.turn([2, 4, 6, 8][Math.floor(Math.random() * 4)]); return true;
        case 24: this.turn([2, 4, 6, 8][Math.floor(Math.random() * 4)]); return true;
        case 25: this.turn(this.towardPlayer()); return true; case 26: this.turn(REV[this.towardPlayer()]); return true;
        case 27: if (g) g.state.setSw(p[0], true), g.refresh(); return true;
        case 28: if (g) g.state.setSw(p[0], false), g.refresh(); return true;
        case 29: this.speed = p[0] | 0; return true; case 30: this.freq = p[0] | 0; return true;
        case 31: this.walkAnim = true; return true; case 32: this.walkAnim = false; return true;
        case 33: this.stepAnim = true; return true; case 34: this.stepAnim = false; return true;
        case 35: this.dirFix = true; return true; case 36: this.dirFix = false; return true;
        case 37: this.through = true; return true; case 38: this.through = false; return true;
        case 39: this.transparent = true; return true; case 40: this.transparent = false; return true;
        case 41: this.graphic = {name: p[0] || '', index: p[1] | 0, tileId: 0}; return true;
        case 45: if (g) g.reportRouteScript(p[0], this); return true; // report without unsafe eval
        default: if (g) g.unsupported(`route:${cmd.code}`); return true; // opacity, blend, SE...
      }
    }
  }

  const cmpOps = [(a, b) => a === b, (a, b) => a >= b, (a, b) => a <= b, (a, b) => a > b, (a, b) => a < b, (a, b) => a !== b];

  class Interpreter {
    /** host = MapRuntime (see runtime.js). All waiting happens through promises it resolves. */
    constructor(host) { this.host = host; this.depth = 0; this.token = host.token; }
    start(list, ctx) { this.token = this.host.token; return this.run(list, ctx); }
    static find(list, from, indent, codes, step = 1) {
      for (let i = from; i >= 0 && i < list.length; i += step) if (list[i].indent === indent && codes.includes(list[i].code)) return i;
      return -1;
    }
    async run(list, ctx) {
      if (!Array.isArray(list) || this.depth > 50) return;
      this.depth += 1;
      const h = this.host, st = h.state, branch = {};
      try {
        let steps = 0;
        for (let i = 0; i < list.length; i++) {
          if (h.token !== this.token) return;
          if (++steps > 200000) throw Error('Event ran too long (infinite loop?)');
          const cmd = list[i], p = Array.isArray(cmd.parameters) ? cmd.parameters : [], ind = cmd.indent | 0;
          const jump = (codes, fallback = list.length) => { const j = Interpreter.find(list, i + 1, ind, codes); i = j < 0 ? fallback : j - 1; };
          switch (cmd.code) {
            case 0: break;
            case 101: {
              const lines = []; let j = i + 1;
              while (list[j] && list[j].code === 401) lines.push(String(list[j].parameters[0] ?? '')), j++;
              i = j - 1;
              await h.message({lines, face: p[0] || '', faceIndex: p[1] | 0, background: p[2] | 0, position: p[3] === undefined ? 2 : p[3] | 0});
              break;
            }
            case 102: { branch[ind] = await h.choice((p[0] || []).map(String), p[1] | 0); break; }
            case 402: if (branch[ind] !== (p[0] | 0)) jump([402, 403, 404], list.length); break;
            case 403: if (branch[ind] !== 4) jump([404]); break;
            case 111: {
              const ok = this.condition(p, ctx);
              branch[ind] = ok;
              if (!ok) { const j = Interpreter.find(list, i + 1, ind, [411, 412]); i = j < 0 ? list.length : j; }
              break;
            }
            case 411: if (branch[ind]) jump([412]); break;
            case 112: break;
            case 413: { const j = Interpreter.find(list, i - 1, ind, [112], -1); if (j >= 0) i = j; break; }
            case 113: { let j = i + 1; while (j < list.length && !(list[j].code === 413 && list[j].indent < ind)) j++; i = j; break; }
            case 115: return;
            case 116: h.eraseEvent(ctx.eventId); break;
            case 117: { const ce = h.commonEvent(p[0]); if (ce) await this.run(ce.list, {mapId: ctx.mapId, eventId: 0, common: true}); break; }
            case 118: break;
            case 119: { const j = list.findIndex(c => c.code === 118 && c.parameters[0] === p[0]); if (j >= 0) i = j; break; }
            case 121: for (let n = p[0]; n <= p[1]; n++) st.setSw(n, p[2] === 0); h.refresh(); break;
            case 122: this.controlVariables(p, ctx); h.refresh(); break;
            case 123: st.setSS(ctx.mapId, ctx.eventId, p[0], p[1] === 0); h.refresh(); break;
            case 125: { const v = p[1] === 0 ? p[2] : st.v(p[2]); st.gold = Math.max(0, st.gold + (p[0] === 0 ? v : -v)); break; }
            case 126: case 127: case 128: {
              const key = (cmd.code === 126 ? 'i' : cmd.code === 127 ? 'w' : 'a') + p[0], v = p[2] === 0 ? p[3] : st.v(p[3]);
              st.items[key] = Math.max(0, (st.items[key] | 0) + (p[1] === 0 ? v : -v)); break;
            }
            case 201: await h.transfer(p); this.token = h.token; break; // like RGSS the event carries on after the transfer
            case 203: h.setEventLocation(p, ctx); break;
            case 205: { const ch = h.character(p[0], ctx), route = p[1] || {}; if (ch) { const pr = ch.startRoute(route.list, false, route.skippable); if (route.wait) await Promise.race([pr, h.cancelled()]); } break; }
            case 211: h.player.transparent = p[0] === 0; break;
            case 221: await h.fade(true); break;
            case 222: await h.fade(false); break;
            case 230: await h.wait((p[0] | 0) * 1); break;
            case 301: await h.notify('ระบบต่อสู้ยังไม่รองรับ — ถือว่าชนะ'); branch[ind] = 0; break;
            case 601: if (branch[ind] !== 0) jump([604]); break;
            case 602: if (branch[ind] !== 1) jump([604]); break;
            case 603: if (branch[ind] !== 2) jump([604]); break;
            case 135: st.saveDisabled = p[0] === 0; break;
            case 223: await h.tintScreen(p[0], p[1] | 0, p[2] === true); break;
            case 245: await h.playBGS(p[0]); break;
            case 303: await h.nameInput(p[0] | 0, p[1] | 0); break;
            case 302: case 355: {
              const cont = cmd.code === 302 ? 605 : cmd.code === 355 ? 655 : 0; let j = i + 1;
              while (cont && list[j] && list[j].code === cont) j++;
              h.unsupported(cmd.code === 355 ? `script:${String(p[0] || '').slice(0, 60)}` : cmd.code); i = j - 1; break;
            }
            case 353: await h.notify('GAME OVER'); return;
            case 108: case 408: case 401: case 404: case 412: case 655: case 605: case 604: break;
            case 132: case 133: case 241: case 242: case 243: case 244: case 246: case 249: case 250: case 251: case 261:
            case 212: case 213: case 214: case 224: case 225: case 235: case 231: case 232: case 233: case 234: case 236:
              h.unsupported(cmd.code); break; // audio / pictures / screen effects: ignored but reported
            default: h.unsupported(cmd.code);
          }
        }
      } finally { this.depth -= 1; }
    }
    condition(p, ctx) {
      const h = this.host, st = h.state;
      switch (p[0]) {
        case 0: return st.sw(p[1]) === (p[2] === 0);
        case 1: { const a = st.v(p[1]), b = p[2] === 0 ? p[3] : st.v(p[3]); return (cmpOps[p[4]] || cmpOps[0])(a, b); }
        case 2: return st.ss(ctx.mapId, ctx.eventId, p[1]) === (p[2] === 0);
        case 6: { const ch = h.character(p[1], ctx); return !!ch && ch.dir === p[2]; }
        case 7: return p[2] === 0 ? st.gold >= p[1] : p[2] === 1 ? st.gold <= p[1] : st.gold < p[1];
        case 8: return (st.items['i' + p[1]] | 0) > 0;
        case 9: return (st.items['w' + p[1]] | 0) > 0;
        case 10: return (st.items['a' + p[1]] | 0) > 0;
        case 11: return h.buttonDown(p[1]);
        case 4: return p[1] === undefined ? false : h.partyHas(p[1]);
        default: h.unsupported(p[0] === 12 ? 'script-condition' : `cond:${p[0]}`); return false;
      }
    }
    controlVariables(p, ctx) {
      const h = this.host, st = h.state;
      let value = 0;
      switch (p[3]) {
        case 0: value = p[4]; break;
        case 1: value = st.v(p[4]); break;
        case 2: { const lo = Math.min(p[4], p[5]), hi = Math.max(p[4], p[5]); value = lo + Math.floor(Math.random() * (hi - lo + 1)); break; }
        case 3: {
          const [type, a, b] = [p[4], p[5], p[6]];
          if (type === 0) value = st.items['i' + a] | 0;
          else if (type === 1) value = st.items['w' + a] | 0;
          else if (type === 2) value = st.items['a' + a] | 0;
          else if (type === 5) { const ch = h.character(a, ctx); value = !ch ? 0 : [ch.x, ch.y, ch.dir, ch.x * 32, ch.y * 32][b] | 0; }
          else if (type === 6) value = h.partySize();
          else if (type === 7) value = [h.mapId, h.partySize(), st.gold, st.steps][a] | 0;
          else h.unsupported(`data:${type}`);
          break;
        }
        default: h.unsupported('script-variable');
      }
      for (let n = p[0]; n <= p[1]; n++) {
        const cur = st.v(n);
        const out = [value, cur + value, cur - value, cur * value, value === 0 ? cur : Math.trunc(cur / value), value === 0 ? cur : cur % value][p[2]] ?? value;
        st.setV(n, out);
      }
    }
  }

  root.VX = root.VX || {};
  Object.assign(root.VX, {GameState, Character, Interpreter, DIR: {DX, DY, REV}});
  if (typeof module !== 'undefined') module.exports = {GameState, Character, Interpreter};
})(typeof window !== 'undefined' ? window : globalThis);
