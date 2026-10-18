import * as THREE from 'three';
import { R, arcDist } from './geo.js';
import { saveWorldState } from './worldstate.js';

// speed: metres of radius a second; max: the most one sweep reaches before you must pick a new spot (80 s);
// redraw: seconds between redraws of the map while you watch it
export const SWEEP = { speed: 25, max: 2000, redraw: 0.33 };

// The Radio Tower's job: a disc of map that grows from a point you picked in the fog, charting the cells and
// the places whose centres it reaches. Owned by the town (town.radio); main.frame() ticks it on real time while
// you play or watch the map. The sweep is kept in ws.town.radio, so it carries on after a reload.
export class RadioSweep {
  constructor(town) {
    this.town = town; // (not game.town: the game is still building it when this runs)
    this.game = town.game;
    this.s = null; // { dir: Vector3, r: metres, on: bool, cells: new cells this sweep, found: [location ids] }
    this.order = new Uint16Array(0); // the cells the disc can ever reach, nearest first
    this.dist = new Float32Array(0); // ...and how far each one is from the centre (m)
    this.locs = []; // [{ l, a }] the places it can reach, nearest first
    this.i = 0; this.j = 0; // how far down those two lists the disc has got
    this.saveT = 10; this.drawT = 0;
  }

  get tower() { return this.town.has('radio'); }
  get on() { return !!(this.s && this.s.on); }
  get frac() { return this.s ? this.s.r / SWEEP.max : 0; }

  // the sweep as it was saved (ws.town.radio = { d: [x, y, z], r, on, n, f }): rebuild the lists and mark the disc again
  restore() {
    const p = this.town.state && this.town.state.radio;
    if (!p || !p.d) return;
    this.s = { dir: new THREE.Vector3().fromArray(p.d).normalize(), r: Math.min(SWEEP.max, p.r || 0), on: !!p.on, cells: p.n || 0, found: p.f || [] };
    this.build();
    this.advance(this.s.r, true); // (the explored cells may have been saved a few seconds before the radius was)
    if (this.s.r >= SWEEP.max) this.s.on = false;
  }

  persist() {
    const st = this.town.state, s = this.s;
    if (!st) return;
    st.radio = s ? { d: s.dir.toArray().map((x) => +x.toFixed(5)), r: Math.round(s.r), on: s.on, n: s.cells, f: s.found } : null;
    saveWorldState(this.game.ws);
    this.game.globe.save();
  }

  // the cells and places the disc can ever reach, sorted by distance: a tick then only walks the new ones
  build() {
    const G = this.game.globe, c = G.cells, d = this.s.dir, n = G.explored.length, cosMax = Math.cos(SWEEP.max / R);
    const hit = [], ang = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const dot = c[k * 3] * d.x + c[k * 3 + 1] * d.y + c[k * 3 + 2] * d.z;
      if (dot > cosMax) { hit.push(k); ang[k] = Math.acos(Math.min(1, dot)) * R; }
    }
    hit.sort((a, b) => ang[a] - ang[b]);
    this.order = Uint16Array.from(hit);
    this.dist = Float32Array.from(hit, (k) => ang[k]);
    this.locs = this.game.locations.map((l) => ({ l, a: arcDist(d, l.dir) })).filter((x) => x.a <= SWEEP.max).sort((a, b) => a.a - b.a);
    this.i = this.j = 0;
  }

  // chart everything within r metres (cells and places by their centres). quiet: no 'NEW LOCATION' toast (a restore, or the map
  // is open: the toast would sit under it, and the panel lists what was found)
  advance(r, quiet = false) {
    const G = this.game.globe, ex = G.explored, s = this.s;
    while (this.i < this.order.length && this.dist[this.i] <= r) {
      const k = this.order[this.i++];
      if (!ex[k]) { ex[k] = 1; s.cells++; }
    }
    while (this.j < this.locs.length && this.locs[this.j].a <= r) {
      const l = this.locs[this.j++].l;
      if (!l.discovered) { G.discover(l, quiet); if (!s.found.includes(l.id)) s.found.push(l.id); }
    }
  }

  // send a sweep from a point on the Moon (a unit direction). '' on success, else why not (the map's panel shows it)
  start(dir) {
    const G = this.game.globe;
    if (!this.tower) return 'NO RADIO TOWER';
    if (G.explored[G.cellOf(dir)]) return 'ALREADY CHARTED: PICK A SPOT IN THE FOG';
    this.s = { dir: dir.clone().normalize(), r: 0, on: true, cells: 0, found: [] };
    this.build();
    this.advance(0);
    this.saveT = 10;
    this.persist();
    return '';
  }

  stop() { if (this.s && this.s.on) { this.s.on = false; this.persist(); } }
  // (a sweep that reached its maximum cannot be resumed: pick a new spot)
  resume() { if (this.s && !this.s.on && this.s.r < SWEEP.max) { this.s.on = true; this.persist(); } }

  // dt: real seconds (frame()'s capped step, so a slow frame rate slows it like the game). watching: the map is open
  tick(dt, watching = false) {
    const s = this.s;
    if (!s || !s.on) return;
    s.r = Math.min(SWEEP.max, s.r + SWEEP.speed * dt);
    this.advance(s.r, watching);
    const done = s.r >= SWEEP.max;
    if (done) { s.on = false; this.game.hud.toast('RADIO SWEEP COMPLETE. PICK A NEW SPOT ON THE MAP FOR MORE.', 4); this.game.audio.tone(660, 0.45, 'sine', 0.2); }
    this.saveT -= dt;
    if (done || this.saveT <= 0) { this.saveT = 10; this.persist(); }
    // (the map keeps its tinted ground layer between redraws, so a redraw with no new cells is cheap)
    if (watching && (done || (this.drawT -= dt) <= 0)) { this.drawT = SWEEP.redraw; this.game.globe.draw(); }
  }
}
