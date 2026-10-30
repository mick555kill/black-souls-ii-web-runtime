/* VX Ace web runtime: map rendering (autotiles, layers, characters), event pages/triggers,
   interpreter host, message/choice windows. No RGSS/Ruby execution. */
(function (root) {
  'use strict';
  const VX = () => root.VX;
  const TILE = 32, SCREEN_W = 544, SCREEN_H = 416;
  const DX = {2: 0, 4: -1, 6: 1, 8: 0}, DY = {2: 1, 4: 0, 6: 0, 8: -1}, REV = {2: 8, 4: 6, 6: 4, 8: 2};
  const DIR_BIT = {2: 1, 4: 2, 6: 4, 8: 8};
  const IMG_EXT = ['png', 'jpg', 'jpeg'];
  const rand4 = () => [2, 4, 6, 8][Math.floor(Math.random() * 4)];

  async function defaultDecode(bytes) {
    const blob = new Blob([bytes]);
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  }

  class Project {
    constructor(source, opts = {}) {
      this.source = source; this.archive = source; this.decode = opts.decode || defaultDecode;
      this.maps = {}; this.tilesets = []; this.system = null; this.actors = []; this.commonEvents = [];
      this.imageCache = new Map(); this.missing = new Set();
    }
    async data(name) { return new (VX().MarshalReader)(await this.source.read(`Data/${name}.rvdata2`)).parse(); }
    async optional(name, fallback) { try { return await this.data(name); } catch { return fallback; } }
    async initialize() {
      if (!this.source.has('Data/MapInfos.rvdata2')) throw Error('ไม่พบ Data/MapInfos.rvdata2 — ไฟล์ที่เลือกไม่ใช่เกม VX Ace (หรือยังขาด Game.rgss3a)');
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
      if (this.imageCache.has(key)) return this.imageCache.get(key);
      const promise = (async () => {
        for (const ext of IMG_EXT) {
          const path = `Graphics/${folder}/${name}.${ext}`;
          if (!this.source.has(path)) continue;
          try { return await this.decode(await this.source.read(path, 32 * 1024 * 1024)); } catch { /* try next extension */ }
        }
        this.missing.add(`Graphics/${folder}/${name}`);
        return null;
      })();
      this.imageCache.set(key, promise);
      return promise;
    }
    async sheetsFor(map) {
      const tileset = this.tilesets?.[map.tileset_id];
      const names = Array.isArray(tileset?.tileset_names) ? tileset.tileset_names : [];
      const images = await Promise.all(names.map(n => this.image('Tilesets', n)));
      return {images, flags: tileset?.flags};
    }
  }

  class MapRuntime {
    constructor(canvas, status, opts = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d', {alpha: false}); this.status = status;
      this.makeCanvas = opts.makeCanvas || ((w, h) => (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), {width: w, height: h}));
      this.project = null; this.map = null; this.mapId = 0; this.sheets = []; this.flags = null;
      this.token = 0; this.state = new (VX().GameState)(); this.player = new (VX().Character)(); this.player.game = this;
      this.events = new Map(); this.tileCache = new Map(); this.charCache = new Map(); this.timers = []; this.cancelWaiters = [];
      this.keys = new Set(); this.triggered = new Set(); this.frameCount = 0; this.accum = 0; this.lastTime = 0;
      this.msg = null; this.choiceUI = null; this.fadeAlpha = 0; this.fadeAnim = null; this.busy = false;
      this.tint = [0,0,0,0]; this.tintAnimation = null; this.bgsAudio = null; this.routeScripts = [];
      this.eventRunning = false; this.unsupportedCounts = {}; this.stateVersion = 0; this.dirty = true;
      this.autorunGuard = {id: null, count: 0, version: -1}; this.parallel = new Map(); this.parallax = null; this.lastPos = '';
      this.render();
      if (opts.autoStart !== false && typeof requestAnimationFrame === 'function') requestAnimationFrame(t => this.loop(t));
    }
    // ---------- host API used by Interpreter ----------
    say(text) { this.status.textContent = text; }
    get partyIds() { const m = this.project?.system?.party_members; return Array.isArray(m) && m.length ? m : [1]; }
    partyHas(id) { return this.partyIds.includes(id); }
    partySize() { return this.partyIds.length; }
    unsupported(code) { const k = String(code); this.unsupportedCounts[k] = (this.unsupportedCounts[k] || 0) + 1; }
    commonEvent(id) { return this.project?.commonEvent(id) || null; }
    refresh() { this.stateVersion += 1; this.dirty = true; }
    buttonDown(code) { return this.keys.has({2: 'down', 4: 'left', 6: 'right', 8: 'up', 11: 'ok', 12: 'cancel'}[code]); }
    character(id, ctx) {
      if (id === -1) return this.player;
      const ev = this.events.get(id === 0 ? ctx.eventId : id);
      return ev ? ev.char : null;
    }
    eraseEvent(id) { const ev = this.events.get(id); if (ev) { ev.erased = true; this.dirty = true; } }
    cancelled() { return new Promise(res => this.cancelWaiters.push(res)); }
    wait(n) { return new Promise(res => this.timers.push({left: Math.max(1, n | 0), res})); }
    notify(text) { return this.message({lines: [text], face: '', faceIndex: 0, background: 0, position: 2}); }
    setEventLocation(p, ctx) {
      const ch = this.character(p[0], ctx); if (!ch) return;
      let x, y;
      if (p[1] === 0) { x = p[2]; y = p[3]; } else if (p[1] === 1) { x = this.state.v(p[2]); y = this.state.v(p[3]); }
      else { const o = this.character(p[2], ctx); if (!o) return; x = o.x; y = o.y; o.locate(ch.x, ch.y); }
      ch.locate(x, y); if (p[4]) ch.turn(p[4]);
    }
    escape(text) {
      const st = this.state, proj = this.project;
      return String(text).replace(/\\\\/g, '\u0001')
        .replace(/\\[Vv]\[(\d+)\]/g, (_, n) => st.v(+n))
        .replace(/\\[Nn]\[(\d+)\]/g, (_, n) => proj?.actor(+n)?.name || '')
        .replace(/\\[Pp]\[(\d+)\]/g, (_, n) => proj?.actor(this.partyIds[+n - 1])?.name || '')
        .replace(/\\[Gg]/g, 'G').replace(/\\[CcIi]\[\d+\]/g, '').replace(/\\[{}$.|!><^]/g, '').replace(/\u0001/g, '\\');
    }
    async message(opts) {
      const face = opts.face ? await this.project.image('Faces', opts.face) : null;
      const lines = opts.lines.map(l => this.escape(l));
      return new Promise(resolve => {
        this.msg = {lines, face, faceIndex: opts.faceIndex || 0, position: opts.position, background: opts.background, shown: 0, total: lines.join('\n').length, resolve};
      });
    }
    choice(items, cancelType) {
      return new Promise(resolve => { this.choiceUI = {items: items.map(t => this.escape(t)), cancelType, index: 0, resolve}; });
    }
    fade(out) {
      return new Promise(resolve => { this.fadeAnim = {from: this.fadeAlpha, to: out ? 1 : 0, t: 0, len: 24, resolve}; });
    }
    async transfer(p) {
      const st = this.state, direct = p[0] === 0;
      const mapId = direct ? p[1] : st.v(p[1]), x = direct ? p[2] : st.v(p[2]), y = direct ? p[3] : st.v(p[3]);
      if (!this.project.maps[mapId]) { this.unsupported(`transfer-to-missing-map:${mapId}`); return; }
      const useFade = p[5] !== 2;
      if (useFade) await this.fade(true);
      await this.enterMap(mapId, {x, y, dir: p[4] || this.player.dir});
      if (useFade) await this.fade(false);
    }
    reportRouteScript(script, character) {
      const code = String(script || '');
      const location = {mapId:this.mapId, eventId:character?.eventId ?? null, x:character?.x ?? null, y:character?.y ?? null, script:code.slice(0,400)};
      this.routeScripts.push(location);
      if(this.routeScripts.length>80)this.routeScripts.shift();
      this.unsupported('route:45');
      console.warn('[VX Ace route:45] Ruby script requires RGSS execution', location);
    }
    async tintScreen(tone, frames, wait) {
      const goal = [0,1,2,3].map(i=>Math.max(i===3?0:-255,Math.min(i===3?255:255,Number(tone?.[i] ?? tone?.[['red','green','blue','gray'][i]] ?? 0)||0)));
      const start = this.tint.slice(), duration=Math.max(0,frames);
      if(!duration){this.tint=goal;this.dirty=true;return;}
      this.tintAnimation={start,goal,total:duration,elapsed:0};
      if(wait)await this.wait(duration);
    }
    async playBGS(audio) {
      if(!audio?.name){this.bgsAudio?.pause();this.bgsAudio=null;return;}
      const name=String(audio.name);
      const candidates=['ogg','m4a','mp3','wav'];
      const path=candidates.map(ext=>'Audio/BGS/'+name+'.'+ext).find(path=>this.project?.source?.has(path));
      if(!path){this.unsupported('bgs-missing:'+name);return;}
      try {
        const bytes=await this.project.source.read(path, 32*1024*1024);
        const blob=new Blob([bytes],{type:path.endsWith('.ogg')?'audio/ogg':'audio/mp4'});
        const url=URL.createObjectURL(blob);
        this.bgsAudio?.pause();
        if(this.bgsAudio?.dataset?.vxUrl)URL.revokeObjectURL(this.bgsAudio.dataset.vxUrl);
        const player=new Audio(url);player.dataset.vxUrl=url;player.loop=true;
        player.volume=Math.max(0,Math.min(1,(Number(audio.volume) || 0)/100));
        player.playbackRate=Math.max(.5,Math.min(2,(Number(audio.pitch)||100)/100));
        this.bgsAudio=player;
        await player.play().catch(error=>{this.unsupported('bgs-playback-blocked');console.warn(error);});
      }catch(error){this.unsupported('bgs-error:'+name);console.warn(error);}
    }
    async nameInput(actorId,maxChars) {
      const actor=this.project?.actor(actorId);
      if(!actor){this.unsupported('name-actor-missing:'+actorId);return;}
      const previous=this.state.actorNames[actorId] || actor.name || '';
      const entered=typeof window!=='undefined'&&typeof window.prompt==='function'
        ? window.prompt('ชื่อตัวละคร (สูงสุด '+Math.max(1,maxChars)+' ตัวอักษร)',previous) : null;
      if(entered!==null)this.state.actorNames[actorId]=Array.from(entered).slice(0,Math.max(1,maxChars)).join('');
    }
    // ---------- project / map ----------
    async setProject(project) {
      this.project = project; this.state = new (VX().GameState)(); this.unsupportedCounts = {}; project.missing.clear();
      this.eventRunning = false; this.fadeAlpha = 0; this.fadeAnim = null;
      const ids = project.mapIds(), start = project.system?.start_map_id, ok = !!project.maps[start];
      await this.enterMap(ok ? start : ids[0], {x: ok ? project.system.start_x : null, y: ok ? project.system.start_y : null, dir: 2});
    }
    playerGraphic() {
      const a = this.project.actor(this.partyIds[0]);
      return {name: a?.character_name || '', index: a?.character_index | 0, tileId: 0};
    }
    async enterMap(id, spot) {
      this.token += 1; this.busy = true;
      for (const r of this.cancelWaiters.splice(0)) r();
      for (const t of this.timers.splice(0)) t.res();
      if (this.msg) { const m = this.msg; this.msg = null; m.resolve(); }
      if (this.choiceUI) { const c = this.choiceUI; this.choiceUI = null; c.resolve(0); }
      this.parallel.clear();
      try {
        const map = await this.project.loadMap(id);
        const assets = await this.project.sheetsFor(map);
        this.map = map; this.mapId = id; this.sheets = assets.images; this.flags = assets.flags; this.tileCache.clear();
        this.parallax = map.parallax_name ? await this.project.image('Parallaxes', map.parallax_name) : null;
        this.events = new Map();
        for (const ev of Object.values(map.events || {})) {
          if (!ev) continue;
          const ch = new (VX().Character)(); ch.game = this; ch.locate(ev.x | 0, ev.y | 0);
          this.events.set(ev.id, {id: ev.id, data: ev, char: ch, page: null, pageIndex: -2, erased: false});
        }
        const sx = Number.isInteger(spot?.x) ? spot.x : Math.floor(map.width / 2), sy = Number.isInteger(spot?.y) ? spot.y : Math.floor(map.height / 2);
        const p = this.player;
        p.locate(Math.max(0, Math.min(map.width - 1, sx)), Math.max(0, Math.min(map.height - 1, sy)));
        p.dir = spot?.dir || p.dir || 2; p.graphic = this.playerGraphic(); p.route = null; this.lastPos = `${p.x},${p.y}`;
        this.refresh(); this.refreshEvents();
        this.say(`Map ${id}: ${this.project.mapName(id)} · ${map.width} × ${map.height}`);
      } finally { this.busy = false; }
    }
    async switchMap(id) { this.eventRunning = false; this.fadeAlpha = 0; this.fadeAnim = null; await this.enterMap(id, null); }
    // ---------- event pages ----------
    pageMet(ev, page) {
      const c = page.condition, st = this.state;
      if (!c) return true;
      if (c.switch1_valid && !st.sw(c.switch1_id)) return false;
      if (c.switch2_valid && !st.sw(c.switch2_id)) return false;
      if (c.variable_valid && st.v(c.variable_id) < c.variable_value) return false;
      if (c.self_switch_valid && !st.ss(this.mapId, ev.id, c.self_switch_ch)) return false;
      if (c.item_valid && !(st.items['i' + c.item_id] > 0)) return false;
      if (c.actor_valid && !this.partyHas(c.actor_id)) return false;
      return true;
    }
    refreshEvents() {
      this.dirty = false;
      for (const ev of this.events.values()) {
        let idx = -1;
        if (!ev.erased) { const pages = ev.data.pages || []; for (let i = pages.length - 1; i >= 0; i--) if (this.pageMet(ev, pages[i])) { idx = i; break; } }
        if (idx === ev.pageIndex) continue;
        ev.pageIndex = idx; ev.page = idx >= 0 ? ev.data.pages[idx] : null;
        const ch = ev.char, pg = ev.page;
        if (!pg) { ch.graphic = {name: '', index: 0, tileId: 0}; ch.through = true; ch.priority = 0; ch.route = null; ch.moveType = 0; continue; }
        const g = pg.graphic || {};
        ch.graphic = {name: g.character_name || '', index: g.character_index | 0, tileId: g.tile_id | 0};
        if (!(g.tile_id > 0) && g.direction) ch.dir = g.direction;
        ch.speed = pg.move_speed || 4; ch.freq = pg.move_frequency || 3; ch.walkAnim = pg.walk_anime !== false; ch.stepAnim = !!pg.step_anime;
        ch.dirFix = !!pg.direction_fix; ch.through = !!pg.through; ch.priority = pg.priority_type === undefined ? 1 : pg.priority_type;
        ch.route = null; ch.moveType = pg.move_type | 0; ch.baseRoute = pg.move_route; ch.moveWait = 0;
      }
    }
    activeEvents() { return [...this.events.values()].filter(e => e.page && !e.erased); }
    tileEventsAt(x, y) { return this.activeEvents().filter(e => e.char.x === x && e.char.y === y && e.char.graphic.tileId > 0); }
    eventsAt(x, y, except) { return this.activeEvents().filter(e => e.char !== except && e.char.x === x && e.char.y === y); }
    // ---------- passability ----------
    tilePassable(x, y, bit) {
      if (!this.flags?.at) return true; // no tileset flags: don't guess
      const ids = this.tileEventsAt(x, y).map(e => e.char.graphic.tileId);
      for (let z = 2; z >= 0; z--) ids.push(this.map.data.at(x, y, z));
      for (const id of ids) {
        if (!id) continue;
        const flag = this.flags.at(id);
        if (flag & 0x10) continue;
        if ((flag & bit) === 0) return true;
        if ((flag & bit) === bit) return false;
      }
      return false;
    }
    canPass(ch, x, y, d) {
      const x2 = x + DX[d], y2 = y + DY[d];
      if (x2 < 0 || y2 < 0 || x2 >= this.map.width || y2 >= this.map.height) return false;
      if (ch.through) return true;
      if (!this.tilePassable(x, y, DIR_BIT[d]) || !this.tilePassable(x2, y2, DIR_BIT[REV[d]])) return false;
      if (ch !== this.player && !this.player.through && this.player.x === x2 && this.player.y === y2 && ch.priority === 1) return false;
      return !this.eventsAt(x2, y2, ch).some(e => !e.char.through && e.char.priority === 1);
    }
    isCounter(x, y) {
      if (!this.flags?.at || x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
      for (let z = 2; z >= 0; z--) { const id = this.map.data.at(x, y, z); if (id && (this.flags.at(id) & 0x80)) return true; }
      return false;
    }
    // ---------- triggers ----------
    async runEvent(ev, fromPlayer = true) {
      if (!ev.page || this.eventRunning || this.busy) return;
      const list = ev.page.list || [];
      if (!list.length) return;
      this.eventRunning = true;
      if (fromPlayer && !ev.char.dirFix && (ev.char.x !== this.player.x || ev.char.y !== this.player.y)) {
        const dx = this.player.x - ev.char.x, dy = this.player.y - ev.char.y;
        ev.char.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8));
      }
      try { await new (VX().Interpreter)(this).start(list, {mapId: this.mapId, eventId: ev.id}); }
      catch (e) { this.say(`Event ${ev.id} error: ${e.message}`); this.lastError = e; }
      this.eventRunning = false; this.dirty = true;
    }
    startAt(x, y, triggers, normal) {
      const ev = this.eventsAt(x, y, this.player).find(e => triggers.includes(e.page.trigger | 0) && ((e.char.priority === 1) === normal) && (e.page.list || []).length);
      if (ev) { this.runEvent(ev); return true; }
      return false;
    }
    actionTrigger() {
      const p = this.player;
      if (this.startAt(p.x, p.y, [0], false)) return;
      const x = p.x + DX[p.dir], y = p.y + DY[p.dir];
      if (this.startAt(x, y, [0, 1, 2], true)) return;
      if (this.isCounter(x, y)) this.startAt(x + DX[p.dir], y + DY[p.dir], [0, 1, 2], true);
    }
    // ---------- input ----------
    input(key, down) {
      if (down) { if (!this.keys.has(key)) this.triggered.add(key); this.keys.add(key); } else this.keys.delete(key);
    }
    trig(key) { return this.triggered.has(key); }
    // ---------- update ----------
    loop(now) {
      const dt = this.lastTime ? Math.min(100, now - this.lastTime) : 16.7; this.lastTime = now;
      this.accum += dt;
      let n = 0;
      while (this.accum >= 1000 / 60 && n++ < 5) { this.accum -= 1000 / 60; this.update(); }
      if (n >= 5) this.accum = 0;
      this.render();
      requestAnimationFrame(t => this.loop(t));
    }
    update() {
      this.frameCount += 1;
      for (const t of this.timers.slice()) if (--t.left <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.res(); }
      if (this.fadeAnim) {
        const f = this.fadeAnim; f.t += 1; this.fadeAlpha = f.from + (f.to - f.from) * Math.min(1, f.t / f.len);
        if (f.t >= f.len) { this.fadeAnim = null; f.resolve(); }
      }
      if (this.map && !this.busy) {
        if (this.dirty) this.refreshEvents();
        this.updateUI();
        if (!this.msg && !this.choiceUI) this.updateGame();
        this.player.update(); for (const e of this.events.values()) e.char.update();
      }
      this.triggered.clear();
    }
    updateUI() {
      const m = this.msg, c = this.choiceUI;
      if (m) {
        if (m.shown < m.total) m.shown += 2;
        if (this.trig('ok') || this.trig('cancel')) { if (m.shown < m.total) m.shown = m.total; else { this.msg = null; m.resolve(); } }
      } else if (c) {
        const n = c.items.length;
        if (this.trig('up')) c.index = (c.index + n - 1) % n;
        if (this.trig('down')) c.index = (c.index + 1) % n;
        if (this.trig('ok')) { this.choiceUI = null; c.resolve(c.index); }
        else if (this.trig('cancel') && c.cancelType > 0) { this.choiceUI = null; c.resolve(c.cancelType - 1); }
      }
    }
    updateGame() {
      const p = this.player;
      if (!this.eventRunning) {
        const auto = this.activeEvents().find(e => e.page.trigger === 3 && (e.page.list || []).length > 1);
        if (auto) {
          const g = this.autorunGuard;
          if (g.id === auto.id && g.version === this.stateVersion) g.count += 1; else { g.id = auto.id; g.version = this.stateVersion; g.count = 0; }
          if (g.count > 600) { this.say(`Autorun event ${auto.id} ไม่จบ (เงื่อนไขไม่เปลี่ยน) — หยุดอัตโนมัติ`); this.unsupported('autorun-stuck'); auto.erased = true; this.dirty = true; }
          else { this.runEvent(auto, false); return; }
        }
        if (!p.moving() && !p.route) {
          if (this.trig('ok')) this.actionTrigger();
          if (!this.eventRunning) {
            const dir = this.keys.has('up') ? 8 : this.keys.has('down') ? 2 : this.keys.has('left') ? 4 : this.keys.has('right') ? 6 : 0;
            if (dir) {
              const fx = p.x + DX[dir], fy = p.y + DY[dir];
              if (p.moveStraight(dir)) this.state.steps += 1;
              else if (fx >= 0 && fy >= 0 && fx < this.map.width && fy < this.map.height) this.startAt(fx, fy, [1, 2], true);
            }
          }
        }
        if (!p.moving() && this.lastPos !== `${p.x},${p.y}`) {
          this.lastPos = `${p.x},${p.y}`;
          if (!this.startAt(p.x, p.y, [1, 2], false)) this.startAt(p.x, p.y, [1, 2], true);
        }
      }
      for (const ev of this.activeEvents()) {
        if (ev.page.trigger !== 4 || this.parallel.has(ev.id) || !(ev.page.list || []).length) continue;
        const token = this.token;
        this.parallel.set(ev.id, true);
        new (VX().Interpreter)(this).start(ev.page.list, {mapId: this.mapId, eventId: ev.id})
          .catch(e => this.say(`Parallel ${ev.id}: ${e.message}`))
          .finally(() => setTimeout(() => { if (this.token === token) this.parallel.delete(ev.id); }, 0));
      }
      const ce = Array.isArray(this.project?.commonEvents) ? this.project.commonEvents : [];
      for (const c of ce) {
        if (!c || !(c.trigger > 0) || !this.state.sw(c.switch_id) || this.parallel.has('c' + c.id)) continue;
        if (c.trigger === 1 && this.eventRunning) continue;
        const token = this.token, auto = c.trigger === 1;
        this.parallel.set('c' + c.id, true); if (auto) this.eventRunning = true;
        new (VX().Interpreter)(this).start(c.list, {mapId: this.mapId, eventId: 0, common: true})
          .catch(e => this.say(`Common ${c.id}: ${e.message}`))
          .finally(() => { if (auto) this.eventRunning = false; setTimeout(() => { if (this.token === token) this.parallel.delete('c' + c.id); }, 0); });
      }
      for (const ev of this.activeEvents()) {
        const ch = ev.char, t = ch.moveType | 0;
        if (!t || ch.moving() || ch.route || this.eventRunning) continue;
        if (ch.moveWait > 0) { ch.moveWait -= 1; continue; }
        if (t === 1) ch.moveStraight(rand4());
        else if (t === 2) ch.moveStraight(Math.random() < 0.8 ? ch.towardPlayer() : rand4());
        else if (t === 3 && ch.baseRoute) ch.startRoute(ch.baseRoute.list, false, true);
        ch.moveWait = (5 - Math.min(5, ch.freq)) * 30 + 10;
      }
    }
    // ---------- save / load ----------
    saveKey() { return `vxace-web-save-v2:${this.project?.title || 'game'}`; }
    save() {
      if (this.state.saveDisabled) throw Error('Saving is disabled by the current event');
      if (!this.map) throw Error('No map loaded');
      const p = this.player;
      localStorage.setItem(this.saveKey(), JSON.stringify({v: 2, state: this.state.toJSON(), map: this.mapId, x: p.x, y: p.y, dir: p.dir}));
      this.say('บันทึกเกมแล้ว (สวิตช์ ตัวแปร เงิน ไอเทม และตำแหน่ง)');
    }
    async load() {
      const s = JSON.parse(localStorage.getItem(this.saveKey()) || 'null');
      if (!s || !this.project.maps[s.map]) throw Error('ไม่พบเซฟที่ใช้ได้');
      this.state = VX().GameState.from(s.state); this.eventRunning = false;
      await this.enterMap(s.map, {x: s.x, y: s.y, dir: s.dir}); this.say('โหลดเซฟแล้ว');
    }
    report() { return {unsupported: {...this.unsupportedCounts}, missing: this.project ? [...this.project.missing] : [], routeScripts:this.routeScripts.slice()}; }
    // ---------- rendering ----------
    camera() {
      const W = this.map.width * TILE, H = this.map.height * TILE, p = this.player;
      const cx = W <= SCREEN_W ? (W - SCREEN_W) / 2 : Math.max(0, Math.min(W - SCREEN_W, p.realX * TILE + 16 - SCREEN_W / 2));
      const cy = H <= SCREEN_H ? (H - SCREEN_H) / 2 : Math.max(0, Math.min(H - SCREEN_H, p.realY * TILE + 16 - SCREEN_H / 2));
      return {x: Math.round(cx), y: Math.round(cy)};
    }
    tileCanvas(id) {
      const frame = VX().Autotile.animated(id) ? Math.floor(this.frameCount / 30) % 3 : 0, key = id * 4 + frame;
      if (this.tileCache.has(key)) return this.tileCache.get(key);
      const cv = VX().Autotile.compose(id, this.sheets, frame, this.makeCanvas);
      this.tileCache.set(key, cv); return cv;
    }
    drawTile(id, dx, dy) {
      if (!id) return;
      const cv = this.tileCanvas(id);
      if (cv) { this.ctx.drawImage(cv, dx, dy); return; }
      this.ctx.fillStyle = `hsla(${(id * 17) % 360},25%,${id >= 2048 ? 35 : 48}%,.9)`; this.ctx.fillRect(dx, dy, TILE, TILE);
      if (id >= 2048) { this.ctx.fillStyle = '#ffffff22'; this.ctx.fillRect(dx + 3, dy + 3, 26, 3); }
    }
    charSheet(name) {
      if (!name) return null;
      if (!this.charCache.has(name)) { this.charCache.set(name, null); this.project.image('Characters', name).then(i => this.charCache.set(name, i)); }
      return this.charCache.get(name);
    }
    drawChar(ch, cam) {
      const c = this.ctx, g = ch.graphic;
      if (ch.transparent) return;
      const sx = ch.realX * TILE - cam.x, sy = ch.realY * TILE - cam.y;
      if (sx < -64 || sy < -96 || sx > SCREEN_W + 32 || sy > SCREEN_H + 64) return;
      if (g.tileId > 0) { this.drawTile(g.tileId, Math.round(sx), Math.round(sy)); return; }
      if (!g.name) return;
      const img = this.charSheet(g.name);
      if (!img) { c.fillStyle = '#a54f67'; c.fillRect(sx + 8, sy + 8, 16, 22); return; }
      const single = g.name.includes('$'), w = single ? img.width / 3 : img.width / 12, h = single ? img.height / 4 : img.height / 8;
      const bx = single ? 0 : (g.index % 4) * 3 * w, by = single ? 0 : (g.index >> 2) * 4 * h;
      const row = {2: 0, 4: 1, 6: 2, 8: 3}[ch.dir] || 0, col = ch.displayPattern, lift = g.name.startsWith('!') ? 0 : 6;
      c.drawImage(img, bx + col * w, by + row * h, w, h, Math.round(sx + 16 - w / 2), Math.round(sy + 32 - h - lift), w, h);
    }
    drawWindow(x, y, w, h) {
      const c = this.ctx; c.fillStyle = 'rgba(8,16,36,.86)'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#d7e6f5'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    wrap(text, maxW) {
      const c = this.ctx, out = [];
      for (const para of text.split('\n')) {
        let line = '';
        for (const chr of para) { if (c.measureText && line && c.measureText(line + chr).width > maxW) { out.push(line); line = chr; } else line += chr; }
        out.push(line);
      }
      return out;
    }
    drawMessage() {
      const c = this.ctx, m = this.msg; if (!m) return;
      const h = 124, y = m.position === 0 ? 0 : m.position === 1 ? (SCREEN_H - h) / 2 : SCREEN_H - h;
      if (m.background !== 2) this.drawWindow(0, y, SCREEN_W, h);
      let tx = 16;
      if (m.face) { const fi = m.faceIndex; c.drawImage(m.face, (fi % 4) * 96, (fi >> 2) * 96, 96, 96, 14, y + 14, 96, 96); tx = 122; }
      c.font = '20px system-ui, sans-serif'; c.textBaseline = 'top'; c.fillStyle = '#fff';
      let left = m.shown, ly = y + 10;
      for (const row of this.wrap(m.lines.join('\n'), SCREEN_W - tx - 16).slice(0, 4)) { if (left <= 0) break; c.fillText(row.slice(0, left), tx, ly); left -= row.length + 1; ly += 26; }
      if (m.shown >= m.total && (this.frameCount >> 4) % 2) { c.fillStyle = '#7fe'; c.fillRect(SCREEN_W - 26, y + h - 18, 10, 6); }
    }
    drawChoices() {
      const c = this.ctx, u = this.choiceUI; if (!u) return;
      c.font = '20px system-ui, sans-serif'; c.textBaseline = 'top';
      const w = Math.min(SCREEN_W - 16, Math.max(140, ...u.items.map(t => (c.measureText ? c.measureText(t).width : 100) + 50))), h = u.items.length * 28 + 16;
      const x = SCREEN_W - w - 8, y = Math.max(4, SCREEN_H - 124 - h - 6);
      this.drawWindow(x, y, w, h);
      u.items.forEach((t, i) => {
        const iy = y + 8 + i * 28;
        if (i === u.index) { c.fillStyle = 'rgba(120,220,230,.28)'; c.fillRect(x + 6, iy, w - 12, 26); }
        c.fillStyle = '#fff'; c.fillText(t, x + 16, iy + 2);
      });
    }
    render() {
      const c = this.ctx;
      c.fillStyle = '#000'; c.fillRect(0, 0, SCREEN_W, SCREEN_H);
      if (!this.map) {
        c.fillStyle = '#101724'; c.fillRect(0, 0, SCREEN_W, SCREEN_H);
        c.fillStyle = '#c0d8f0'; c.font = '17px system-ui'; c.textAlign = 'center'; c.fillText('เลือก Game.rgss3a หรือโฟลเดอร์เกมเพื่อเริ่ม', 272, 200); c.textAlign = 'left'; return;
      }
      const cam = this.camera(), map = this.map, data = map.data, depth = Math.min(4, data.depth);
      const x0 = Math.max(0, Math.floor(cam.x / TILE)), y0 = Math.max(0, Math.floor(cam.y / TILE));
      const x1 = Math.min(map.width - 1, Math.floor((cam.x + SCREEN_W - 1) / TILE)), y1 = Math.min(map.height - 1, Math.floor((cam.y + SCREEN_H - 1) / TILE));
      if (this.parallax) {
        const img = this.parallax, fixed = String(map.parallax_name).startsWith('!');
        const ox = Math.floor((map.parallax_loop_x ? this.frameCount * (map.parallax_sx | 0) / 64 : 0) + (fixed ? cam.x : cam.x / 2));
        const oy = Math.floor((map.parallax_loop_y ? this.frameCount * (map.parallax_sy | 0) / 64 : 0) + (fixed ? cam.y : cam.y / 2));
        const px = ((-ox % img.width) + img.width) % img.width, py = ((-oy % img.height) + img.height) % img.height;
        for (let yy = py - img.height; yy < SCREEN_H; yy += img.height) for (let xx = px - img.width; xx < SCREEN_W; xx += img.width) c.drawImage(img, xx, yy);
      }
      const high = id => this.flags?.at && id && (this.flags.at(id) & 0x10) !== 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x * TILE - cam.x, dy = y * TILE - cam.y;
        for (let z = 0; z < Math.min(3, depth); z++) { const id = data.at(x, y, z); if (!high(id)) this.drawTile(id, dx, dy); }
        if (depth > 3) {
          const s = data.at(x, y, 3) & 15;
          if (s) { c.fillStyle = 'rgba(0,0,0,.5)'; if (s & 1) c.fillRect(dx, dy, 16, 16); if (s & 2) c.fillRect(dx + 16, dy, 16, 16); if (s & 4) c.fillRect(dx, dy + 16, 16, 16); if (s & 8) c.fillRect(dx + 16, dy + 16, 16, 16); }
        }
      }
      const chars = [...this.activeEvents().map(e => e.char), this.player];
      for (const pr of [0, 1]) chars.filter(ch => ch.priority === pr).sort((a, b) => a.realY - b.realY).forEach(ch => this.drawChar(ch, cam));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x * TILE - cam.x, dy = y * TILE - cam.y;
        for (let z = 0; z < Math.min(3, depth); z++) { const id = data.at(x, y, z); if (high(id)) this.drawTile(id, dx, dy); }
      }
      chars.filter(ch => ch.priority === 2).forEach(ch => this.drawChar(ch, cam));
      if (this.fadeAlpha > 0) { c.fillStyle = `rgba(0,0,0,${this.fadeAlpha})`; c.fillRect(0, 0, SCREEN_W, SCREEN_H); }
      this.drawMessage(); this.drawChoices();
    }
  }

  root.VX = root.VX || {};
  root.VX.Project = Project; root.VX.MapRuntime = MapRuntime;
  if (typeof module !== 'undefined') module.exports = {Project, MapRuntime};
})(typeof window !== 'undefined' ? window : globalThis);
