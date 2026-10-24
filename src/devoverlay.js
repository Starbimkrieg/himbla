import * as THREE from 'three';
import { AIPaths, EnemyMarkers } from './aipaths.js';
import { TimeGraph, GpuTimer } from './perfgraph.js';
import { InputMonitor } from './inputmon.js';
import { unbendPoint } from './curve.js';

// Dev overlay: every on-screen dev readout. F3 toggles it (any screen); Dev menu → Debug overlay picks
// sections. Both are remembered across launches. Works only once the dev menu is unlocked (cheats.js);
// nothing is built until then, and while off main.js's frame hooks are one branch each.
//
// Frame times are frame()-to-frame() gaps (so include vsync and GPU waits). CPU stages are main-thread
// time from main.js's lap() calls; the remainder is browser / GPU / vsync. 30 s graphs: perfgraph.js.

const KEY = 'mr-dev-overlay';
const RING = 600; // frames kept for p99 / worst / hitches
const SAMPLE_MS = 250; // graph samples
const PUBLISH_MS = 500; // text refresh
const MON_W = 360 + 6; // input monitor width (style.css #input-mon) + gap

// box: the section's panel (perf on the right, game debug beside it); AI paths draw in the world and the
// input monitor is its own panel, so neither has a box
export const SECTIONS = [
  { key: 'frame', name: 'FRAME TIMES', box: 'perf' }, // FPS, frame ms, p99, hitches, 30 s FPS graph
  { key: 'load', name: 'CPU & GPU GRAPHS', box: 'perf' }, // 30 s load graphs
  { key: 'stages', name: 'CPU TIME BY STAGE', box: 'perf' },
  { key: 'detail', name: 'STAGE DETAIL (player, systems)', box: null, sub: true }, // (rows inside the stages section)
  { key: 'render', name: 'DRAW CALLS & POLYGONS', box: 'perf' },
  { key: 'world', name: 'WORLD COUNTS', box: 'perf' },
  { key: 'where', name: 'WHERE (PLACE-LOCAL COORDINATES)', box: 'game' }, // camera and runner in the nearest place's flat builder x, y, z
  { key: 'pirates', name: 'PIRATE SPAWNS', box: 'game' },
  { key: 'paths', name: 'AI PATHS', box: null },
  { key: 'input', name: 'INPUT & CONTROLLER MONITOR', box: null },
];
const DEFAULTS = { frame: true, load: false, stages: true, detail: true, render: true, world: true, where: true, pirates: false, paths: false, input: false };

// Frame stages in main.js order (debug and overlay are this overlay's own cost). A third entry makes a group:
// its row sums its parts (each its own lap() in main.js / player.js), shown under it with STAGE DETAIL on.
const STAGES = [
  ['player', 'player + input', [
    ['pad', 'pad + input'], ['look', 'mouse look'], ['indoors', 'indoors check'], ['rail', 'rail grind'], ['physics', 'move + physics'],
    ['tricks', 'tricks + fx'], ['weapons', 'weapons'], ['animate', 'animation'], ['ragdoll', 'ragdoll'],
  ]],
  ['systems', 'game systems', [
    ['secrets', 'secrets'], ['missions', 'missions'], ['events', 'events + panel'], ['globe', 'globe map'], ['territory', 'territory'],
    ['story', 'story'], ['town', 'town'], ['tutorial', 'tutorial'], ['garage', 'garage'], ['techchip', 'tech chip DOM'], ['alchemy', 'alchemy'],
    ['race', 'race'], ['rides', 'rides'], ['meteors', 'meteors'], ['keys', 'key presses'], ['powers', 'powers'], ['cosmetics', 'cosmetics'], ['scanner', 'scanner'],
  ]],
  ['enemies', 'enemies + shots'],
  ['other', 'camera + misc'],
  ['world', 'world + fx'],
  ['hud', 'hud + audio'],
  ['terrain', 'terrain stream'],
  ['render', 'render submit'],
  ['debug', 'debug drawing'], // (AI paths, enemy markers, input monitor)
  ['overlay', 'this overlay'], // (its text and graphs: nonzero only on refresh frames)
];
const LAPS = []; // { key, label, parent (index, or -1), kids (indexes) }: groups and their parts, flat
for (const [key, label, parts] of STAGES) {
  const g = { key, label, parent: -1, kids: [] };
  LAPS.push(g);
  for (const [k, l] of parts || []) { g.kids.push(LAPS.length); LAPS.push({ key: k, label: l, parent: LAPS.indexOf(g), kids: [] }); }
}
const LAP_IX = Object.fromEntries(LAPS.map((L, i) => [L.key, i]));
const GROUPS = LAPS.filter((L) => L.kids.length);
const DETAIL_AVG = 0.1, DETAIL_MAX = 0.5; // ms: a part shows when its average or spike reaches these

const GOOD = '#7dff3a', WARN = '#ffd23f', BAD = '#ff4a4a', LOAD = '#4fd8ff';
const f1 = (v, w = 5) => v.toFixed(1).padStart(w);
const n0 = (v) => Math.round(v).toLocaleString('en-US');

export class DevOverlay {
  constructor(game, cheats) {
    this.game = game;
    this.cheats = cheats;
    this.on = false;
    this.sec = { ...DEFAULTS };
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) { this.on = !!s.on; for (const k of Object.keys(DEFAULTS)) if (typeof s.sec?.[k] === 'boolean') this.sec[k] = s.sec[k]; }
    } catch { /* unavailable or corrupt: defaults */ }
    if (!cheats.unlocked) this.on = false;

    this.live = false; // begin() ran this frame with the overlay up
    this.ring = new Float32Array(RING);
    this.scratch = new Float32Array(RING);
    this.count = 0; // frames in the ring
    this.head = 0;
    this.cur = new Float64Array(LAPS.length); // this frame's stage times (ms)
    this.sum = new Float64Array(LAPS.length); // since the last text refresh
    this.max = new Float64Array(LAPS.length);
    this.lastBegin = 0;
    this.tBegin = 0;
    this.tLap = 0;
    this.winMs = 0; this.winN = 0; this.winFrames = 0; // since the last text refresh
    this.sFrames = 0; this.cpuSum = 0; this.cpuN = 0; // since the last graph sample
    this.pubAt = 0; this.sampleAt = 0;
    this.hitchMs = 34; this.targetMs = 1000 / 60;
    this.v2 = new THREE.Vector2();
    this.dom = null;
    this.apply();
  }

  shows(key) { return this.on && !!this.sec[key]; }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ on: this.on, sec: this.sec })); } catch { /* unavailable */ }
  }

  // F3 / the menu's master switch. No-op until the dev menu is unlocked.
  toggle() {
    if (!this.cheats.unlocked) return false;
    this.on = !this.on;
    this.save();
    this.apply();
    return true;
  }

  setSection(key, v) {
    this.sec[key] = v;
    this.save();
    this.apply();
  }

  // push on / off state into the DOM and renderer
  apply() {
    const R = this.game.renderer;
    // (three resets draw counters per render() and the post pass renders twice a frame, so we reset them
    // ourselves in renderStart() to count the whole frame)
    if (R) R.info.autoReset = !this.shows('render');
    if (!this.on) { this.live = false; this.lastBegin = 0; }
    if (!this.dom && this.on) this.build();
    if (this.dom) {
      const used = { perf: false, game: false };
      let any = false;
      for (const s of SECTIONS) {
        const on = this.sec[s.key];
        any ||= on && !s.sub;
        if (!s.box) continue;
        this.dom[s.key].root.classList.toggle('hidden', !on);
        used[s.box] ||= on;
      }
      for (const b of Object.keys(used)) this.dom[b].classList.toggle('hidden', !used[b]);
      this.dom.none.classList.toggle('hidden', any);
      this.dom.root.classList.toggle('hidden', !this.on);
      this.dom.root.style.right = `${12 + (this.shows('input') ? MON_W : 0)}px`; // (clear of the input monitor)
    }
    const now = performance.now();
    this.pubAt = this.sampleAt = now; // (first numbers after a clean half second)
    this.winMs = this.winN = this.winFrames = this.sFrames = this.cpuSum = this.cpuN = 0;
    this.sum.fill(0); this.max.fill(0);
    if (this.dom && this.dom.frame.graph) { this.fpsG.clear(); this.loadG.cpu.g.clear(); this.loadG.gpu.g.clear(); }
  }

  build() {
    const root = document.createElement('div');
    root.id = 'dev-overlay';
    const dom = this.dom = { root };
    const box = (name) => {
      const el = dom[name] = document.createElement('div');
      el.className = `dv-box dv-${name}`;
      root.appendChild(el);
    };
    box('game'); box('perf'); box('none'); // (left to right: perf against the screen edge)
    const sec = (key, parts) => {
      const s = SECTIONS.find((x) => x.key === key);
      const el = document.createElement('div');
      el.className = 'dv-sec';
      const h = document.createElement('div');
      h.className = 'dv-h';
      h.textContent = s.name;
      el.appendChild(h);
      const d = { root: el };
      for (const [name, tag] of parts) { d[name] = document.createElement(tag); d[name].className = `dv-${name}`; el.appendChild(d[name]); }
      dom[s.box].appendChild(el);
      dom[key] = d;
      return d;
    };
    const fr = sec('frame', [['t', 'pre'], ['graph', 'canvas']]);
    this.fpsG = new TimeGraph(fr.graph);
    const ld = sec('load', [['rows', 'div']]);
    this.loadG = {};
    for (const k of ['cpu', 'gpu']) {
      const r = document.createElement('div');
      r.className = 'perf-row';
      r.innerHTML = `<canvas></canvas><span class="perf-lab">${k.toUpperCase()}</span><span class="perf-val">--</span>`;
      ld.rows.appendChild(r);
      this.loadG[k] = { val: r.querySelector('.perf-val'), g: new TimeGraph(r.querySelector('canvas'), 420, 56) };
    }
    sec('stages', [['t', 'pre']]);
    sec('render', [['t', 'pre']]);
    sec('world', [['t', 'pre']]);
    sec('where', [['t', 'pre']]);
    sec('pirates', [['t', 'pre']]);
    dom.none.textContent = 'No sections on. Dev menu → Debug overlay.';
    document.body.appendChild(root);
  }

  // ---------- per-frame hooks (main.js frame()) ----------

  begin() {
    if (!this.on) { this.live = false; return; }
    const t = performance.now();
    if (this.lastBegin) {
      const ms = t - this.lastBegin;
      if (ms < 2000) { // (longer: hidden tab or stall)
        this.ring[this.head] = ms;
        this.head = (this.head + 1) % RING;
        if (this.count < RING) this.count++;
        this.winMs += ms; this.winN++;
      }
    }
    this.lastBegin = t;
    this.tBegin = this.tLap = t;
    this.live = true;
    this.cur.fill(0);
  }

  // end of a stage: time since the last lap() is that stage's
  lap(name) {
    if (!this.live) return;
    const i = LAP_IX[name];
    if (i === undefined) { if (!this.warned) { this.warned = true; console.warn(`[dev overlay] no stage called "${name}" (devoverlay.js STAGES)`); } return; }
    const t = performance.now();
    this.cur[i] += t - this.tLap;
    this.tLap = t;
  }

  // just before drawing: zero the draw counters, open the GPU timer
  renderStart() {
    if (!this.live) return;
    if (this.sec.render) this.game.renderer.info.reset();
    if (this.sec.load) (this.gpuT ||= new GpuTimer(this.game.renderer)).begin();
  }

  // just after: close the GPU timer; the main thread's frame so far (update + draw submit) is the CPU load
  renderEnd() {
    if (!this.live) return;
    if (this.gpuT) this.gpuT.end();
    this.lap('render');
    this.cpuSum += performance.now() - this.tBegin;
    this.cpuN++;
  }

  // input monitor: every frame on any screen (pause and menus are when you'd read it)
  updateInput() {
    const m = this.mon;
    if (this.shows('input')) {
      const mon = this.mon ||= new InputMonitor(this.game);
      if (!mon.on) mon.setOn(true);
      mon.update();
    } else if (m && m.on) m.setOn(false);
  }

  end() {
    if (!this.live) return;
    for (const G of GROUPS) for (const k of G.kids) this.cur[LAP_IX[G.key]] += this.cur[k]; // (group = sum of parts)
    for (let i = 0; i < LAPS.length; i++) {
      this.sum[i] += this.cur[i];
      if (this.cur[i] > this.max[i]) this.max[i] = this.cur[i];
    }
    this.winFrames++; this.sFrames++;
    const t = performance.now();
    if (t - this.sampleAt >= SAMPLE_MS) this.sample(t);
    if (t - this.pubAt >= PUBLISH_MS) this.publish(t);
    const own = performance.now() - t; // (counted in the next refresh)
    this.sum[LAP_IX.overlay] += own;
    if (own > this.max[LAP_IX.overlay]) this.max[LAP_IX.overlay] = own;
  }

  // in-world debug drawing, every frame while playing (Cheats.tick)
  tick() {
    this.lap('look'); // (closes mouse look + prep; the drawing below gets its own stage)
    if (this.shows('paths')) (this.paths ||= new AIPaths(this.game)).update();
    else if (this.paths) this.paths.hide();
    if (this.shows('pirates')) (this.marks ||= new EnemyMarkers(this.game)).update(); // (rings + beacons on enemies)
    else if (this.marks) this.marks.hide();
    this.lap('debug');
  }

  // ---------- graphs (a point every quarter second) ----------

  sample(t) {
    const dt = t - this.sampleAt;
    const frames = this.sFrames;
    const cpuMs = this.cpuN ? this.cpuSum / this.cpuN : null;
    this.sampleAt = t; this.sFrames = 0; this.cpuSum = 0; this.cpuN = 0;
    const gpuMs = this.gpuT ? this.gpuT.take() : null; // (drained even with the graph off: no stale average)
    if (dt > 1000 || !frames) return; // stall or hidden tab: no point (graphs show a break)
    const fps = (frames * 1000) / dt, frameMs = 1000 / fps;
    if (this.sec.frame) {
      this.fpsG.push(t, fps);
      const peak = Math.max(60, ...this.fpsG.pts.map((p) => p[1]));
      this.fpsG.draw(t, Math.ceil(peak / 30) * 30, [30, 60, 120], this.colour(frameMs));
    }
    if (this.sec.load) {
      const load = (ms) => Math.min(100, (ms / frameMs) * 100);
      const gpuOk = this.gpuT && this.gpuT.ok;
      for (const [k, ms] of [['cpu', cpuMs], ['gpu', gpuMs]]) {
        const r = this.loadG[k], pct = ms == null ? null : load(ms);
        if (pct != null) r.g.push(t, pct);
        r.val.textContent = pct == null ? (k === 'gpu' && this.gpuT && !gpuOk ? 'N/A' : '--') : `${Math.round(pct)}% · ${ms.toFixed(1)}ms`;
        r.g.draw(t, 100, [50], pct == null || pct < 70 ? LOAD : pct < 90 ? WARN : BAD);
      }
    }
  }

  // green within the frame budget, yellow up to two budgets, red beyond
  colour(ms) { return ms <= this.targetMs * 1.15 ? GOOD : ms <= this.targetMs * 2.05 ? WARN : BAD; }

  // ---------- text (twice a second) ----------

  publish(t) {
    this.pubAt = t;
    const D = this.dom;
    const cap = this.game.settings ? this.game.settings.v.fpsCap : 0;
    this.targetMs = cap ? 1000 / cap : 1000 / 60; // (budget for the colours and hitch count)
    this.hitchMs = Math.round(this.targetMs * 2.05);
    if (this.sec.frame) this.publishFrame(D.frame.t);
    if (this.sec.stages) this.publishStages(D.stages.t);
    if (this.sec.render) this.publishRender(D.render.t);
    if (this.sec.world) this.publishWorld(D.world.t);
    if (this.sec.where) D.where.t.textContent = this.whereRows().join('\n');
    if (this.sec.pirates) D.pirates.t.innerHTML = this.pirateRows().join('\n');
    this.sum.fill(0); this.max.fill(0);
    this.winMs = 0; this.winN = 0; this.winFrames = 0;
  }

  publishFrame(el) {
    const avg = this.winN ? this.winMs / this.winN : 0;
    const fps = avg ? 1000 / avg : 0;
    const n = this.count;
    let p99 = 0, worst = 0, hitches = 0;
    if (n) {
      const a = this.scratch.subarray(0, n);
      a.set(this.ring.subarray(0, n));
      a.sort();
      p99 = a[Math.floor(0.99 * (n - 1))];
      worst = a[n - 1];
      for (let i = n - 1; i >= 0 && a[i] > this.hitchMs; i--) hitches++;
    }
    el.innerHTML = `<b style="color:${this.colour(avg)}">${Math.round(fps)} FPS</b>  ${f1(avg)} ms  p99 ${f1(p99)}  worst ${f1(worst)}\n`
      + `hitches (>${this.hitchMs} ms): ${hitches} in the last ${n} frames`;
  }

  publishStages(el) {
    const fr = Math.max(1, this.winFrames);
    const avg = this.winN ? this.winMs / this.winN : 0;
    const bar = (m) => '█'.repeat(Math.min(14, Math.round((m / this.targetMs) * 14)));
    const detail = this.sec.detail;
    let cpu = 0;
    const rows = [];
    for (let i = 0; i < LAPS.length; i++) {
      const L = LAPS[i];
      if (L.parent >= 0) continue;
      const m = this.sum[i] / fr;
      cpu += m;
      rows.push(`${L.label.padEnd(16)}${f1(m)}  ${bar(m).padEnd(14)} max ${f1(this.max[i])}`);
      if (!detail) continue;
      for (const k of L.kids) { // (only parts worth a row; the rest are in the group's number)
        const pm = this.sum[k] / fr, px = this.max[k];
        if (pm >= DETAIL_AVG || px >= DETAIL_MAX) rows.push(`  ${LAPS[k].label.slice(0, 14).padEnd(14)}${f1(pm)}  ${bar(pm).padEnd(14)} max ${f1(px)}`);
      }
    }
    rows.push(`${'main thread'.padEnd(16)}${f1(cpu)}   idle / GPU / vsync ${f1(Math.max(0, avg - cpu))} ms`);
    el.textContent = rows.join('\n');
  }

  publishRender(el) {
    const G = this.game, R = G.renderer, info = R.info;
    const size = R.getDrawingBufferSize(this.v2);
    const dbg = G.cheats.debugView;
    // (post pass's one draw and two triangles left out: scene numbers only)
    const tris = Math.max(0, info.render.triangles - (dbg ? 0 : 2));
    const sc = G.shadowCache;
    const mem = performance.memory;
    el.textContent = [
      `${n0(Math.max(0, info.render.calls - (dbg ? 0 : 1)))} DRAWS · ${tris >= 1e6 ? `${(tris / 1e6).toFixed(2)}M` : n0(tris)} POLYS${sc.failed ? ' · SHADOW CACHE FAILED' : sc.enabled ? ` · SHADOWS ${sc.stats.mode.toUpperCase()}` : ''}`,
      `geometries ${n0(info.memory.geometries)} · textures ${n0(info.memory.textures)} · programs ${info.programs ? info.programs.length : '?'}`,
      `buffer ${size.x}×${size.y} (pixel ratio ${R.getPixelRatio().toFixed(2)})${mem ? ` · JS heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} of ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB` : ''}`,
    ].join('\n');
  }

  publishWorld(el) {
    const G = this.game, P = G.planet, S = P.stats;
    const live = (a) => (a ? a.length : 0);
    const T = G.world && G.world.traffic;
    el.textContent = [
      `terrain ${n0(live(P.chunks))} chunks · ${n0(S.visible)} shown · ${n0(S.built)} meshes built`,
      `  queued ${n0(live(P.queue))} · on workers ${P.jobs ? P.jobs.size : 0}/${live(P.workers)} · waiting to mesh ${n0(live(P.ready))}`,
      `colliders ${n0(G.colliders.count)}   enemies ${live(G.enemies.list)}   civilians ${live(G.civilians && G.civilians.list)}`,
      `traffic ${live(T && T.vehicles)} vehicles · ${live(T && T.walkers)} walkers   shots ${live(G.projectiles.list)}   particles ${live(G.fx.particles)}`,
    ].join('\n');
  }

  // Camera and runner in the nearest place's local frame (x across, y up from its ground, z along: its builders' numbers,
  // so a screenshot spot can be named exactly; curved places unbent via curve.js), plus camera heading (0 = +z, 90 = +x).
  whereRows() {
    const G = this.game, W = G.world;
    const cam = G.camera.position;
    let best = null, bd = 1e9;
    for (const l of G.locations) {
      if (!l.group) continue;
      const d = l.pos.distanceTo(cam);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best || bd > best.r * 3) return ['(no place near)'];
    const R = W.curveR(best), loc = best;
    const flat = (v) => { const q = loc.group.worldToLocal(v.clone()); return R ? unbendPoint(R, q.x, q.y, q.z, q) : q; };
    const f = (v) => `${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`;
    const c = flat(cam), p = flat(G.player.pos);
    const a = flat(cam.clone().add(G.camera.getWorldDirection(new THREE.Vector3())));
    const head = (Math.atan2(a.x - c.x, a.z - c.z) * 180) / Math.PI;
    const pitch = (Math.asin(Math.max(-1, Math.min(1, a.y - c.y))) * 180) / Math.PI;
    return [`${loc.name}${R ? ' (curved)' : ''}`, `camera  ${f(c)}   heading ${head.toFixed(0)}  pitch ${pitch.toFixed(0)}`, `runner  ${f(p)}`];
  }

  // pirates alive per pool, next patrol spawn attempt, why the last did or didn't happen
  pirateRows() {
    const G = this.game, E = G.enemies;
    const d = E.dbg || {};
    const t = (v) => `${Math.max(0, v).toFixed(1)}s`;
    const kinds = (list) => `${list.filter((e) => e.kind === 'rover').length} rover · ${list.filter((e) => e.kind !== 'rover').length} skater`;
    const alive = E.list.filter((e) => e.faction === 'pirate' && e.kind !== 'core' && !e.dead);
    const roam = E.hunterList();
    const den = alive.filter((e) => e.home);
    const raid = alive.filter((e) => !e.home && e.targetObj);
    const rows = [
      `roaming ${roam.length}/${E.maxRoamers()}  (${kinds(roam)})`,
      `dens ${den.length}/${E.maxDen()}  (${kinds(den)})`];
    if (raid.length) rows.push(`event raiders ${raid.length}`);
    const S = G.story;
    if (S) rows.push(`Kade chance next squad ${Math.round((S.kadeChance ?? 0.08) * 100)}%`);
    const gp = G.pad && G.pad.gyro;
    if (gp && gp.dev) rows.push(gp.debug());
    rows.push(`total hunters ${roam.length} (dark-side spawns skip at 3+)`);
    rows.push('<b>NEXT PATROL</b>');
    if (!d.squadsOn) rows.push(`blocked: ${d.why || '?'}`);
    else {
      rows.push(`dark side ${d.dark ? t(E.darkTimer) : 'idle (not dark)'}`);
      rows.push(`cargo run ${d.carrying ? t(E.pirateTimer) : 'idle (no cargo)'}`);
    }
    rows.push(`den check ${t(E.lairTimer)}`);
    const dt = E.dbgDarkTry, s = E.dbgSpawn;
    rows.push('<b>LAST SQUAD ATTEMPT</b>');
    rows.push(dt ? `dark-side timer fired ×${dt.n}, last ${t(G.time - dt.at)} ago${dt.skip ? ` (skipped: ${dt.hunters} hunters out, needs <3)` : ` (${dt.hunters} hunters out)`}` : 'dark-side timer has not fired yet');
    rows.push(s ? `spawner ${t(G.time - s.at)} ago: wanted ${s.want} · tries ${s.tries} · in a settlement zone ${s.zoned} · spawned ${s.spawned}` : 'spawner has not run yet');
    return rows;
  }

  // A note under the alert banner (the Kade roll, with the pirate spawns section on)
  alertNote(text, secs) {
    if (!this.shows('pirates')) return;
    let el = this.noteEl;
    if (!el) {
      el = this.noteEl = document.createElement('div');
      el.id = 'alert-note';
      document.body.appendChild(el);
    }
    const a = document.getElementById('alert');
    const r = a ? a.getBoundingClientRect() : null;
    el.style.top = `${r ? r.bottom + 8 : 120}px`;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.noteT);
    this.noteT = setTimeout(() => el.classList.add('hidden'), secs * 1000);
  }
}
