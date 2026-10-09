// Trailer director mode (?trailer). Plays the official ~90 s trailer from in-game footage: a list
// of shots, each with a setup (teleport, spawn, stage), per-frame direction (held keys, steering)
// and a camera, joined by transitions (whip-pans, flashes, ink wipes) with comic title cards on top.
//
//   ?trailer            warm-up pass under a cover (builds terrain, compiles shaders), then rolls
//   &auto               roll straight after the warm-up (no click needed: OBS browser source)
//   &nowarm             skip the warm-up (quick looks; expect hitches at the cuts)
//   &shot=N             start from shot N (1-based); &only plays just that shot, looping
//   &fixed              fixed 1/60 s timestep (identical runs; slows down if the GPU can't keep up)
//
// The trailer never touches your saves: in this mode localStorage and sessionStorage are swapped
// for in-memory stores before any game module reads them, so every run starts from a fresh game.
import * as THREE from 'three';
import { tangent, greatCircle, darkness, frameQuat, dirFromAngles } from './geo.js';
import { mulberry32 } from './rng.js';
import { spliceGenes } from './chimera.js';
import { clearEchoes } from './monolith.js';

const Q = new URLSearchParams(location.search);
export const TRAILER = Q.has('trailer');

if (TRAILER) {
  const mem = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  };
  for (const n of ['localStorage', 'sessionStorage']) {
    try { Object.defineProperty(window, n, { value: mem(), configurable: true }); } catch { /* keep the real one */ }
  }
  // &pump: for a hidden or headless page that gets no animation frames. Loading runs on timers,
  // and window.step(n) pumps n trailer frames by hand.
  if (Q.has('pump')) {
    window.nativeRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
    window.step = (n = 1) => {
      const g = window.game;
      for (let i = 0; i < n; i++) { g.last = performance.now() - 1000 / 60; g.frame(); }
      return window.trailer && { shot: window.trailer.i + 1, t: +window.trailer.t.toFixed(3), mode: window.trailer.mode };
    };
    // dbg(locId, [x,y,z] eye, [x,y,z] target, fov): park the camera somewhere for a look
    window.dbg = (id, e, l, fov = 55, n = 3) => {
      const T = window.trailer, g = window.game;
      T.shot = { dur: 1e9, cam(T) { T.at(id, ...e, T.eye); T.at(id, ...l, T.look); T.fov = fov; } };
      T.t = 0;
      const eye = T.at(id, ...e);
      g.planet.update(eye, { budgetMs: 1e9 });
      if (g.planet.rimInkAt) g.planet.rimInkAt.set(1e9, 0, 0);
      g.planet.updateRimInk(eye);
      return window.step(n);
    };
    // seek(n, t): play shot n (1-based) from its start up to t seconds in
    window.seek = (n, t = 0) => { const T = window.trailer; T.mode = 'play'; T.only = true; T.start(n - 1); return window.step(Math.max(1, Math.round(t * 60))); };
    // findFlat([thetas], [phis], len): the smoothest straight runs of ground (for staging shots)
    window.findFlat = (ths, phs, len = 130) => {
      const T = window.trailer, g = window.game, pl = g.planet;
      const rough = (p0, fwd) => {
        const h = [];
        for (let d = 0; d <= len; d += 5) h.push(-pl.altitude(p0.clone().addScaledVector(fwd, d).setLength(3600)));
        const n = h.length;
        let maxd = 0, bump = 0;
        for (let i = 1; i < n - 1; i++) {
          maxd = Math.max(maxd, Math.abs(h[i] - (h[0] + ((h[n - 1] - h[0]) * i) / (n - 1))));
          bump = Math.max(bump, Math.abs(h[i - 1] - 2 * h[i] + h[i + 1]));
        }
        return { maxd: +maxd.toFixed(1), bump: +bump.toFixed(2), slope: +((h[n - 1] - h[0]) / len).toFixed(3) };
      };
      const res = [];
      for (const th of ths) for (const ph of phs) {
        const p = T.sky(th, ph);
        if (g.zoneAt(p, 1.6)) continue;
        for (let a = 0; a < 6.28; a += 0.785) res.push({ th, ph, a: +a.toFixed(2), ...rough(p, T.heading(p, a)) });
      }
      const score = (x) => x.bump + x.maxd * 0.1 + Math.abs(x.slope);
      return res.sort((x, y) => score(x) - score(y)).slice(0, 5);
    };
    // local coordinates of a world point in a location's frame
    window.loc = (id, p) => p.clone().applyMatrix4(window.trailer.loc(id).group.matrixWorld.clone().invert()).toArray().map((v) => +v.toFixed(1));
  }
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeIn = (x) => { x = clamp01(x); return x * x * x; };
const easeOut = (x) => { x = clamp01(x); return 1 - (1 - x) ** 3; };
const lerp = (a, b, k) => a + (b - a) * k;
const _a = V(), _b = V(), _c = V(), _q = new THREE.Quaternion();
const SUN_DIR = dirFromAngles(0, 0);
const _m4 = new THREE.Matrix4();

const HUM = 0.2; // the Quantum-Lock hum's level in the trailer (it sits well under the music)
const CRATE = 0xffd23f; // the courier's cargo, carried from the job board to the last shot
const WHIP = 0.2; // seconds each side of a whip-pan cut
const WIPE = 0.38; // the ink wipe's full sweep
const CUT = 2.6; // the lab shot's cut from outside to inside

export class Trailer {
  constructor(game) {
    this.g = game;
    this.shots = SHOTS;
    this.i = -1;
    this.t = 0;
    this.mode = 'idle';
    this.hold = new Set();
    this.tap = new Set();
    this.fire = false;
    this.steer = null;
    this.eye = V();
    this.look = V();
    this.camUp = null;
    this.fov = 60;
    this.roll = 0;
    this.shake = 0;
    this.hidePlayer = false;
    this.speedLines = null;
    this.fixed = Q.has('fixed');
    this.only = Q.has('only');
    this.first = Math.max(0, Math.min(this.shots.length - 1, (parseInt(Q.get('shot'), 10) || 1) - 1));
    this.warmOn = !Q.has('nowarm');
    this.ui = buildUI();
    window.trailer = this;
  }

  // ---------- start-up ----------
  begin() {
    const g = this.g;
    document.body.classList.add('trailer');
    document.getElementById('title').classList.add('hidden'); // (closes the main menu too)
    g.input.onKey = null;
    g.started = true;
    g.state = 'play';
    g.tour = null;
    // a fresh runner with just what the shots need (nothing the trailer keeps secret)
    g.cheats.god = true;
    g.upgrades.jar = 3;
    g.player.applyUpgrades(g.upgrades);
    g.story.vehicles = ['interceptor', 'apc', 'skimmer'];
    g.tutorial.done = true;
    if (g.settings) Object.assign(g.settings.v, { tips: false, panels: 'off' });
    g.enemies.pirateTimer = g.enemies.darkTimer = 1e9;
    g.meteors.next = 1e9;
    g.race.postT = 1e9;
    g.story.kade.nextAt = 1e9;
    g.tipIndex = 99;
    g.updateScanner = () => {}; // no red threat-scanner ink: the shots show the models as they are
    const pop = g.fx.pop.bind(g.fx);
    g.fx.pop = (text, ...rest) => (this.popMute && this.popMute.test(text) ? undefined : pop(text, ...rest)); // shots can mute pops
    if (g.secrets.shrine) g.secrets.shrine.skates.visible = false; // the Xenoglide skates stay a secret: only their glow shows
    g.planet.keep = true; // keep every terrain mesh the shots build (no rebuild hitch at the cuts)
    for (const c of g.alchemy.chimeras) c.follow = false;
    g.alchemy.syncChimeras();
    g.audio.init();
    if (g.audio.setMenu) g.audio.setMenu(false);
    // the Quantum-Lock hum and glide rumble sit well under the music here (still there, not on top)
    g.audio.mix.hum = HUM;
    g.audio.mix.wind = 0.5;
    g.audio.levelFloor = 0.7; // (the roaming groove would sink at low speed, leaving the skates on top)
    if (Q.has('pump')) { g.renderer.setAnimationLoop(null); window.requestAnimationFrame = window.nativeRAF; } // frames only come from window.step()
    this.cover(true, 'PREPARING THE TRAILER…');
    if (this.warmOn) { this.mode = 'warm'; this.start(this.only ? this.first : 0); }
    else this.ready();
  }

  // warm-up done (or skipped): wait for a click unless &auto, then roll from the top
  ready() {
    this.mode = 'wait';
    const go = () => {
      window.removeEventListener('pointerdown', go, true);
      if (this.g.audio.ctx && this.g.audio.ctx.state === 'suspended') this.g.audio.ctx.resume();
      this.cover(false);
      this.mode = 'play';
      this.start(this.first);
    };
    const suspended = this.g.audio.ctx && this.g.audio.ctx.state === 'suspended';
    if (Q.has('auto') || Q.has('pump') || !suspended) { this.cover(true, ''); setTimeout(go, 1500); }
    else { this.cover(true, 'CLICK TO ROLL'); window.addEventListener('pointerdown', go, true); }
  }

  cover(on, text = '') {
    this.ui.cover.classList.toggle('hidden', !on);
    this.ui.coverText.textContent = text;
  }

  // ---------- shots ----------
  start(i) {
    const g = this.g;
    this.i = i;
    this.t = 0;
    this.reset();
    this.hideLabels();
    Math.random = mulberry32(1969 + i * 101); // every shot plays the same way every run
    const s = this.shots[i];
    this.shot = s;
    s.setup && s.setup(this);
    // build the ground the camera will see before the first frame of the shot is drawn
    if (s.cam) s.cam(this, 0, 0);
    g.planet.update(this.eye, { budgetMs: 1e9 });
    if (g.planet.rimInkAt) g.planet.rimInkAt.set(1e9, 0, 0);
    g.planet.updateRimInk(this.eye);
    // a card whose key the new shot also uses stays up across the cut; everything else goes
    const keep = new Set((s.cards || []).map((c, n) => c.key || `${i}:${n}`));
    for (const el of [...this.ui.cards.children]) if (!keep.has(el.dataset.key)) el.remove();
    if (this.mode === 'warm') this.cover(true, `PREPARING THE TRAILER… ${i + 1}/${this.shots.length} · ${Math.round(this.fps || 0)} FPS`);
  }

  next() {
    if (this.only) { this.start(this.i); return; }
    if (this.i + 1 < this.shots.length) { this.start(this.i + 1); return; }
    if (this.mode === 'warm') { this.ready(); return; }
    this.mode = 'done';
    document.title = 'TRAILER DONE';
    window.trailerDone = true;
  }

  // clear whatever the last shot left lying around
  reset() {
    const g = this.g, P = g.player;
    if (g.state === 'derby' || g.race.state !== 'idle') { g.race.clear(); g.race.gate.root.visible = false; }
    g.state = 'play';
    if (g.rides.ride) g.rides.exit();
    if (P.vehicle) g.garage.exit();
    if (g.garage.active) { g.garage.active.model.root.removeFromParent(); g.garage.active = null; }
    g.enemies.clearPirates();
    if (g.story.lockEl) g.story.lockEl.classList.add('hidden');
    if (g.story.splashEl) g.story.splashEl.classList.add('hidden');
    g.projectiles.clear();
    g.meteors.zone = null;
    for (const rk of g.meteors.rocks) { rk.grp.removeFromParent(); if (rk.col) g.meteors.dropCollider(rk); if (rk.ring) rk.ring.m.removeFromParent(); }
    g.meteors.rocks.length = 0;
    g.grind.active = null;
    for (const k of Object.keys(g.alchemy.buffs)) g.alchemy.buffs[k] = 0;
    if (g.alchemy.chimeras.length) { g.alchemy.chimeras.length = 0; g.alchemy.syncChimeras(); }
    clearEchoes(g);
    g.slowmo = 0;
    g.cam.shake = 0;
    g.panel = null;
    document.getElementById('action-panel').classList.add('hidden');
    document.getElementById('popups').innerHTML = '';
    if (g.fx.pops) g.fx.pops.length = 0;
    P.setCargo(null);
    P.resetTrick();
    P.body.airTime = 0; // (or the next shot's first touchdown scores the last shot's jump)
    P.dead = false;
    this.hold.clear();
    this.tap.clear();
    this.fire = false;
    this.steer = null;
    this.camUp = null;
    this.roll = 0;
    this.shake = 0;
    this.fov = 60;
    this.hidePlayer = false;
    this.speedLines = null;
    this.lampOn = null;
    this.chased = false;
    this.snapped = false;
    this.popMute = null;
    this.pitch = null;
    g.audio.mix.hum = HUM;
    if (g.player) g.player.body.thrusting = false;
    if (g.player) g.player.weapon = 0;
    this.anchor = null;
    g.lampForce = null; // the lamp back on automatic
    if (g.settings) g.settings.v.panels = 'off';
  }

  // floating text (place names, signs, name tags) reads as HUD: the trailer goes without it
  hideLabels() {
    // (the world toggles their visibility by distance, so they go on a layer the camera never draws)
    // (sleeping settlements are out of the scene graph, so walk every location's group too)
    const hide = (o) => { if (o.isSprite && o.material.map && o.material.map.image instanceof HTMLCanvasElement) o.layers.set(31); };
    this.g.scene.traverse(hide);
    for (const l of this.g.locations) if (l.group) l.group.traverse(hide);
  }

  // ---------- per frame (main.js) ----------
  // Before the simulation: advance the clock, run the shot's direction, feed the input.
  pre(rdt) {
    const g = this.g;
    const dt = this.fixed ? 1 / 60 : rdt;
    // frame rate (shown on the warm-up cover: under ~50 fps the recording will stutter)
    const now = performance.now();
    if (this.lastNow) this.fps = lerp(this.fps || 60, 1000 / Math.max(1, now - this.lastNow), 0.05);
    this.lastNow = now;
    if (this.mode === 'idle' || this.mode === 'wait' || this.mode === 'done' || !this.shot) return dt;
    this.t += dt;
    if (this.t >= this.shot.dur) { this.next(); if (this.mode === 'done' || this.mode === 'wait') return dt; }
    const s = this.shot;
    s.update && s.update(this, this.t, dt);
    this.cards(s);
    // input: only what the shot holds down
    const I = g.input;
    I.keys.clear();
    for (const k of this.hold) I.keys.add(k);
    for (const k of this.tap) { I.keys.add(k); I.justPressed.add(k); }
    this.tap.clear();
    I.mouse = [this.fire, false, false];
    I.locked = true; // (the game only fires with the mouse captured)
    I.dx = I.dy = 0;
    if (this.steer) {
      const up = g.player.pos.clone().normalize();
      const f = tangent(this.steer, up, _a);
      if (f.lengthSq() > 1e-6) g.cam.fwd.copy(f.normalize());
      g.cam.pitch = this.pitch ?? -0.1;
    }
    g.lampForce = this.lampOn ?? null; // a shot can force the helmet lamp on or off
    return dt;
  }

  // After the game camera: the shot owns the view.
  camera(dt) {
    const g = this.g, s = this.shot;
    if (!s || this.mode === 'idle' || this.mode === 'done') { if (this.mode === 'done') this.applyCam(); return; }
    if (s.cam) s.cam(this, this.t, dt);
    this.transition(s);
    this.applyCam();
    if (this.hidePlayer) g.player.model.root.visible = false;
  }

  applyCam() {
    const cam = this.g.camera;
    cam.position.copy(this.eye);
    if (this.shake > 0) cam.position.add(_c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shake));
    cam.up.copy(this.camUp || _b.copy(this.eye).normalize());
    cam.lookAt(this.look);
    if (this.roll) cam.rotateZ(this.roll);
    if (this.whipYaw) cam.rotateY(this.whipYaw);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.g.cam.fov = this.fov;
  }

  // speed lines and the like, just before the comic pass renders
  post(u) {
    if (this.speedLines != null) u.speed.value = Math.max(u.speed.value, this.speedLines);
    if (this.whipLines) u.speed.value = Math.max(u.speed.value, this.whipLines);
  }

  // ---------- transitions ----------
  transition(s) {
    const t = this.t, left = s.dur - t;
    const prev = this.i > 0 ? this.shots[this.i - 1] : null;
    const into = prev && prev.out;
    const out = s.out;
    let yaw = 0, blur = 0, flash = 0, black = 0, wipe = -1;
    // whip-pan: swing hard out of this shot, and swing into the next from the other side
    if (out && out.type === 'whip' && left < WHIP) { const k = easeIn(1 - left / WHIP); yaw += k * 1.1 * (out.dir || 1); blur += k; }
    if (into && into.type === 'whip' && t < WHIP) { const k = 1 - easeOut(t / WHIP); yaw -= k * 1.1 * (into.dir || 1); blur += k; }
    // white flash across the cut
    if (out && out.type === 'flash' && left < 0.08) flash = Math.max(flash, 1 - left / 0.08);
    if (into && into.type === 'flash' && t < 0.35) flash = Math.max(flash, 1 - easeOut(t / 0.35));
    // dip to black
    if (out && out.type === 'black' && left < (out.len || 0.45)) black = Math.max(black, ease(1 - left / (out.len || 0.45)));
    if (into && into.type === 'black' && t < (into.in || 0.35)) black = Math.max(black, 1 - ease(t / (into.in || 0.35)));
    // ink wipe: a slab of panel ink sweeps across, covering the frame at the cut
    if (out && out.type === 'wipe' && left < WIPE / 2) wipe = 0.5 * (1 - left / (WIPE / 2));
    if (into && into.type === 'wipe' && t < WIPE / 2) wipe = 0.5 + 0.5 * (t / (WIPE / 2));
    this.whipYaw = yaw;
    this.whipLines = blur > 0 ? blur : 0;
    const canvas = this.g.renderer.domElement;
    const bf = blur > 0.02 ? `blur(${(blur * 7).toFixed(1)}px)` : '';
    if (canvas.style.filter !== bf) canvas.style.filter = bf;
    this.ui.flash.style.opacity = flash.toFixed(3);
    this.ui.black.style.opacity = black.toFixed(3);
    if (wipe >= 0 && wipe <= 1) {
      this.ui.wipe.style.display = 'block';
      this.ui.wipe.style.transform = `translateX(${lerp(-130, 130, wipe).toFixed(1)}%) skewX(-14deg)`;
    } else this.ui.wipe.style.display = 'none';
  }

  // ---------- title cards ----------
  cards(s) {
    if (!s.cards || this.mode === 'warm') return;
    for (const [n, c] of s.cards.entries()) {
      const key = c.key || `${this.i}:${n}`;
      const on = this.t >= c.at && this.t < c.at + c.dur;
      const el = [...this.ui.cards.children].find((x) => x.dataset.key === key);
      if (on && !el) {
        const d = document.createElement('div');
        d.className = `tr-card tr-${c.kind || 'caption'}`;
        d.dataset.key = key;
        d.innerHTML = c.html;
        if (c.style) Object.assign(d.style, c.style);
        this.ui.cards.appendChild(d);
      } else if (!on && el && !el.classList.contains('out')) {
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
      }
    }
  }

  // ---------- helpers for the shots ----------
  loc(id) { return this.g.locations.find((l) => l.id === id); }
  // a point in a location's own frame (x east-ish, y up, z north-ish), like world.toWorld
  at(id, x, y, z, out = V()) { return this.g.world.toWorld(typeof id === 'string' ? this.loc(id) : id, x, y, z, out); }
  // a point on the ground at sun angle theta (0 noon, 90 terminator) and azimuth phi, in degrees
  sky(theta, phi, lift = 0) { return this.ground(dirFromAngles(theta, phi).multiplyScalar(3600), lift); }
  // a direction along the ground at p: angle a (radians) from world X projected onto the tangent plane
  heading(p, a) {
    const up = p.clone().normalize();
    const t0 = V(1, 0, 0).addScaledVector(up, -up.x).normalize();
    const t1 = V().crossVectors(up, t0);
    return t0.multiplyScalar(Math.cos(a)).addScaledVector(t1, Math.sin(a));
  }
  // a world point in a location's own frame (the inverse of at)
  toLocal(id, p, out = V()) { return out.copy(p).applyMatrix4(_m4.copy(this.loc(id).group.matrixWorld).invert()); }
  // nudge a camera point up out of the ground if the terrain rises under it
  aboveGround(p, min = 1.5) {
    const alt = this.g.planet.altitude(p);
    if (alt < min) p.addScaledVector(_b.copy(p).normalize(), min - alt);
    return p;
  }
  // ground under a point (plus lift)
  ground(p, lift = 0, out = V()) { return this.g.planet.ground(p, out, lift); }
  // a local frame at point p facing f: returns (x right, y up, z forward) -> world point
  frame(p, f) {
    const up = p.clone().normalize();
    const fwd = tangent(f, up, V()).normalize();
    const right = V().crossVectors(fwd, up).normalize();
    const o = p.clone();
    return (x, y, z, out = V()) => out.copy(o).addScaledVector(right, x).addScaledVector(up, y).addScaledVector(fwd, z);
  }
  // put the runner somewhere, facing f, with a speed along f
  place(p, f, speed = 0, lift = 0.6) {
    const g = this.g, P = g.player;
    const pos = this.ground(p, lift);
    const up = pos.clone().normalize();
    const fwd = tangent(f, up, V()).normalize();
    P.respawn(pos, fwd);
    P.body.vel.copy(fwd).multiplyScalar(speed);
    g.cam.fwd.copy(fwd);
    g.cam.up.copy(up);
    this.steer = fwd.clone();
    return { pos, up, fwd, right: V().crossVectors(fwd, up).normalize() };
  }
  // the runner's own frame right now (forward = where they're moving, or facing)
  playerFrame() {
    const P = this.g.player;
    const up = P.pos.clone().normalize();
    const f = tangent(P.vel, up, V());
    if (f.lengthSq() < 1) f.copy(P.heading);
    f.normalize();
    return { pos: P.pos.clone(), up, fwd: f, right: V().crossVectors(f, up).normalize() };
  }
  // hold the runner's ground speed near v (skating), without touching the vertical
  keepSpeed(v, k = 0.08) {
    const b = this.g.player.body;
    const up = b.pos.clone().normalize();
    const h = tangent(b.vel, up, _a);
    const s = h.length();
    if (s < 1e-3) return;
    const ns = lerp(s, v, k);
    b.vel.addScaledVector(h, ns / s - 1);
  }
  // smooth camera follow: ease this.eye/this.look toward targets
  chase(eye, look, dt, kEye = 6, kLook = 10) {
    if (this.t <= dt * 1.5 || !this.chased) { this.eye.copy(eye); this.look.copy(look); this.chased = true; return; }
    this.eye.lerp(eye, 1 - Math.exp(-dt * kEye));
    this.look.lerp(look, 1 - Math.exp(-dt * kLook));
  }
  // a crater near p whose rim makes a good grind: { c, rail }
  rimNear(p, minR = 24, maxR = 70, maxD = 900) {
    const pl = this.g.planet;
    const dir = p.clone().normalize();
    const list = [];
    for (const c of pl.craters) {
      if (c.R < minR || c.R > maxR || c.type === 'ghost') continue;
      const d = 3600 * Math.acos(Math.min(1, dir.dot(c.d)));
      if (d > maxD) continue;
      list.push({ c, d });
    }
    list.sort((x, y) => x.d - y.d);
    for (const { c, d } of list) {
      const rail = pl.rimRailsOf(c).filter((r) => r.loop)[0];
      if (rail) return { c, rail, d };
    }
    return null;
  }
  // lock the runner onto a rail at arc length s, sliding at speed
  grindOn(rail, s, dir, speed) {
    const g = this.g;
    g.player.respawn(rail.pts[0].clone(), null);
    g.grind.active = { r: rail, s, dir, speed, t: 0, spark: 0 };
  }
  // put the runner in a faction vehicle at p, rolling along f at speed
  vehicle(id, p, f, speed) {
    const g = this.g;
    const F = this.place(p, f, 0);
    g.garage.summon(id);
    const v = g.garage.active;
    v.e.body.pos.copy(this.ground(p, 0.5));
    v.e.heading.copy(F.fwd);
    v.e.body.vel.copy(F.fwd).multiplyScalar(speed);
    frameQuat(F.up, F.fwd, v.model.root.quaternion);
    v.model.root.position.copy(v.e.body.pos);
    g.garage.enter();
    document.getElementById('popups').innerHTML = ''; // (no VEHICLE DROP! pop: it's already here)
    if (g.fx.pops) g.fx.pops.length = 0;
    return { v, F };
  }
  music(z, hard = true, fadeIn = 0.15) {
    const A = this.g.audio;
    this.zone = z === 'menu' ? null : z; // (main.musicZone defers to this, so the track holds all shot)
    this.musicLevel(1, fadeIn);
    if (!A.ctx || !A.music) return;
    if (z === 'menu') { A.setMenu(true); if (fadeIn > 1) A.fade = 0; return; } // (a slow rise: no downbeat kick slamming in)
    A.setMenu(false);
    A.want = z;
    if (hard && A.track !== z) { A.switchTrack(z); A.fade = 1; }
  }
  // fade the whole music bus to k (0..1) over about `secs`
  musicLevel(k, secs = 0.15) {
    const A = this.g.audio;
    if (!A.ctx || !A.musicBus) return;
    const G = A.musicBus.gain, now = A.ctx.currentTime, to = 0.5 * (A.vol ? A.vol.music : 1) * k;
    G.cancelScheduledValues(now);
    G.setValueAtTime(G.value, now);
    G.linearRampToValueAtTime(to, now + Math.max(0.02, secs)); // (a straight ramp: a fade from silence stays quiet at the start)
  }
  pop(text, color = '#ffd23f', size = 64, rot = 0) { this.g.fx.pop(text, null, { color, size, rot, life: 1.1 }); }
}

// ---------------------------------------------------------------------------------------------
// The overlay: cover, cards, flash, dip to black, ink wipe
// ---------------------------------------------------------------------------------------------
function buildUI() {
  const root = document.createElement('div');
  root.id = 'trailer';
  root.innerHTML = `
    <div class="tr-cards"></div>
    <div class="tr-wipe"><div class="tr-wipe-edge"></div></div>
    <div class="tr-flash"></div>
    <div class="tr-black"></div>
    <div class="tr-cover hidden"><div class="tr-cover-text"></div></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  return { root, cards: $('.tr-cards'), wipe: $('.tr-wipe'), flash: $('.tr-flash'), black: $('.tr-black'), cover: $('.tr-cover'), coverText: $('.tr-cover-text') };
}

const LOGO = `<div class="tr-logo">MOON<span>-</span>RUNNER</div><div class="tr-tagline">QUANTUM-LOCK DELIVERY SERVICE</div><div class="tr-cta">COMING SOON</div>`;

// ---------------------------------------------------------------------------------------------
// The shot list (about 45 s). Times are per shot; `out` is how each one hands off to the next.
// ---------------------------------------------------------------------------------------------
// a transit ship by its route (first stop, second stop)
function ship(T, a, b) {
  return T.g.world.traffic.vehicles.find((v) => (v.kind === 'ship' || v.kind === 'bus') && v.stops[0].loc.id === a && v.stops[1].loc.id === b);
}
// fly a ship along its route by hand: s metres from its first stop (the traffic sim adds a hair)
function flyShip(v, s) {
  v.state = 'fly'; v.dir = 1; v.s = s; v.stop = null; v.timer = 0; v.closing = false; v.exchanged = false; v.open = 0;
}
// square a ship up to a heading at once (it normally turns slowly toward its route)
function aimShip(v, heading) {
  const up = v.pos.clone().normalize();
  v.heading.copy(tangent(heading, up, V()).normalize());
  frameQuat(up, v.heading, v.root.quaternion);
}

const SHOTS = [
  // 1 · Cold open: a freighter lifts off an ILMB pad with Earth hanging over the base, climbs, and
  // roars straight over the camera (its belly wipes the frame).
  {
    name: 'cold open',
    dur: 3.6,
    out: { type: 'wipe' },
    setup(T) {
      T.music('menu');
      T.place(T.at('ilmb', -60, 0, -205), T.at('ilmb', 0, 0, 1));
      T.hidePlayer = true;
      T.fr = ship(T, 'ilmb', 'farside');
      flyShip(T.fr, 6);
      T.g.world.traffic.updateFlyer(T.fr, 0, T.eye);
      aimShip(T.fr, T.at('ilmb', 0, 0, -1).sub(T.at('ilmb', 0, 0, 0)));
    },
    update(T, t) { flyShip(T.fr, 6 + 5 * t + 8.2 * t * t); },
    cam(T, t) {
      const k = ease(t / 3.6);
      T.at('ilmb', lerp(-62, -80, k), lerp(4, 28, k), lerp(-228, -206, k), T.eye);
      // look at the ship, lagging it a little, with the horizon kept low in frame
      const target = T.fr.pos.clone();
      T.look.lerpVectors(T.at('ilmb', -86, 26, -150), target, ease(t / 2.4));
      T.fov = lerp(58, 66, k);
    },
    cards: [{ at: 0.35, dur: 2.5, html: 'THE MOON NEEDS ITS DELIVERIES.' }],
  },

  // 2 · The courier at the ILMB job board: the crate lands on their back, they spin round and
  // kick off straight past the camera.
  {
    name: 'job board',
    dur: 3.4,
    setup(T) {
      T.music('menu');
      T.place(T.at('ilmb', 0, 0, 84), T.at('ilmb', 0, 0, -1).sub(T.at('ilmb', 0, 0, 0)));
      T.out = T.at('ilmb', 0.12, 0, 1).sub(T.at('ilmb', 0, 0, 0));
      T.kicked = false;
    },
    update(T, t) {
      const g = T.g, P = g.player;
      if (t > 0.45 && !P.cargoMesh) {
        P.setCargo(CRATE);
        g.audio.pickup();
        T.pop('PICKUP!', '#7dff6a', 52, -4);
      }
      if (t > 1.05) {
        // spin round and kick off (a shove for the first stride, then skates and thrusters)
        if (!T.kicked) { T.kicked = true; P.body.vel.copy(T.out).setLength(7); P.heading.copy(T.out).normalize(); g.audio.jump(); }
        T.steer = T.out;
        T.hold = new Set(['Space', 'KeyW', 'KeyE']);
      }
    },
    cam(T, t) {
      const k = ease(t / 3.4);
      T.at('ilmb', lerp(7.5, 5.5, k), lerp(2.2, 1.6, k), lerp(93, 95, k), T.eye);
      // hold on the runner, then whip the look round as they rush past
      const P = T.g.player;
      const want = P.pos.clone().addScaledVector(P.up, 1.2);
      if (T.t <= 1 / 30) T.look.copy(want); else T.look.lerp(want, t < 1.6 ? 0.25 : 0.4);
      T.fov = lerp(50, 62, easeIn((t - 1.4) / 1.6));
    },
    cards: [{ at: 0.5, dur: 2.6, kind: 'caption low right', html: 'QUANTUM-LOCK DELIVERY SERVICE' }],
  },

  // 3 · Out on the plain: low chase cam at speed, carving toward a crater, Earth up ahead.
  {
    name: 'chase',
    dur: 3.4,
    setup(T) {
      T.music('free');
      T.g.audio.level = 0.9; // the roaming groove kicks in at full tilt
      const R = rim(T);
      // start 150 m out, aimed at a point just inside the lip so the run ends at the rim
      const c = R.c.d.clone().multiplyScalar(3600);
      T.dest = c;
      const from = T.at('ilmb', 95, 0, 610);
      T.place(from, c.clone().sub(from), 38);
      T.g.player.setCargo(CRATE);
    },
    update(T, t) {
      const P = T.g.player;
      const f = T.dest.clone().sub(P.pos);
      // carve: swing the line left and right of the target
      const up = P.pos.clone().normalize();
      f.applyAxisAngle(up, Math.sin(t * 3.1) * 0.35);
      T.steer = f;
      T.hold = new Set(['Space', 'KeyW']);
      T.keepSpeed(38, 0.2);
    },
    cam(T, t, dt) {
      const F = T.playerFrame();
      // low behind, swinging from one side to the other through the carve
      const side = 2.2 + Math.sin(t * 3.1 - 0.6) * 1.2;
      const eye = F.pos.clone().addScaledVector(F.fwd, -5).addScaledVector(F.up, 1.9).addScaledVector(F.right, side);
      const look = F.pos.clone().addScaledVector(F.fwd, 16).addScaledVector(F.up, 3.2);
      T.chase(eye, look, dt, 40, 20);
      T.roll = -Math.sin(t * 3.1) * 0.06;
      T.fov = 78;
    },
  },

  // 4 · Rim grind: the runner catches the crater lip, sparks spraying, and the camera swings round.
  {
    name: 'rim grind',
    dur: 2.8,
    setup(T) {
      const R = rim(T);
      T.R = R;
      T.grindS = R.rail.len * 0.1;
      T.grindOn(R.rail, T.grindS, 1, 34);
      T.g.player.setCargo(CRATE);
      T.popMute = /GRIND/;
    },
    update(T, t) {
      T.hold = new Set(['Space']);
      if (t > 2.65 && T.g.grind.active) T.tap.add('ShiftLeft'); // pop off the end
    },
    cards: [{ at: 0.3, dur: 2.4, html: 'GRIND. FLIP. SHOW OFF.<br><span class="tr-sub">GNARLY TRICKS PAY CASH BONUSES.</span>' }],
    cam(T, t, dt) {
      const P = T.g.player;
      const up = P.pos.clone().normalize();
      const F = T.playerFrame();
      // orbit from the outside of the lip round to the front of the runner
      const a = lerp(-2.2, 0.4, ease(t / 2.8));
      const off = F.fwd.clone().multiplyScalar(Math.cos(a) * 5.2).addScaledVector(F.right, Math.sin(a) * 5.2);
      const eye = P.pos.clone().add(off).addScaledVector(up, lerp(0.6, 1.8, t / 2.8));
      const look = P.pos.clone().addScaledVector(up, 1.1);
      T.chase(eye, look, dt, 14, 16);
      T.fov = 66;
    },
  },

  // 5 · Off the lip and into the air: a flip and a spin, stuck clean. "…MOSTLY."
  {
    name: 'air trick',
    dur: 3.4,
    out: { type: 'whip', dir: 1 },
    setup(T) {
      const R = rim(T);
      const s = R.rail.len * 0.1 + 34 * 2.65;
      // where the grind pops off, with its speed and hop (rails.js pop), plus a little extra lift
      const p = railPoint(R.rail, s), q = railPoint(R.rail, s + 1);
      const up = p.clone().normalize();
      const along = tangent(q.clone().sub(p), up, V()).normalize();
      const P = T.g.player;
      P.respawn(p.clone().addScaledVector(up, 0.6), along);
      P.body.vel.copy(along).multiplyScalar(30).addScaledVector(up, T.hop ?? 13);
      P.body.grounded = false;
      P.body.airTime = 0.3;
      P.body.sinceContact = 1;
      T.steer = along;
      T.liftDir = along;
      P.setCargo(CRATE);
    },
    update(T, t) {
      // flip, then spin, then let go and land it
      const keys = ['Space'];
      if (t > 0.15 && t < 0.72) keys.push('KeyQ', 'KeyW');
      else if (t > 0.72 && t < 1.25) keys.push('KeyQ', 'KeyD');
      T.hold = new Set(keys);
      T.steer = T.liftDir;
    },
    cam(T, t, dt) {
      const P = T.g.player;
      const up = P.pos.clone().normalize();
      const F = T.playerFrame();
      // a low side angle that holds the runner against the sky
      const eye = P.pos.clone().addScaledVector(F.right, 6.5).addScaledVector(F.fwd, 2.5).addScaledVector(up, -0.4);
      const look = P.pos.clone().addScaledVector(up, 0.8).addScaledVector(F.fwd, 2);
      T.chase(eye, look, dt, 10, 18);
      const alt = T.g.planet.altitude(T.eye);
      if (alt < 1) T.eye.addScaledVector(up, 1 - alt);
      T.fov = 56;
    },
    cards: [{ at: 1.85, dur: 1.5, kind: 'shout', html: '…MOSTLY.' }],
  },

  // 6 · The dark side: lamp on, a pirate squad closes in and lights the night up.
  {
    name: 'pirates',
    dur: 4.0,
    out: { type: 'whip', dir: -1 },
    setup(T) {
      T.music('dark');
      const g = T.g;
      // a flat stretch just past the terminator, where the night still holds some light (found by
      // sampling the ground for bumps)
      const p = T.sky(91, -10);
      const F = T.place(p, T.heading(p, 1.18), 34); // (heading away from the Twilight Waystation)
      g.player.setCargo(CRATE);
      T.lampOn = true;
      T.F0 = F;
      // a war-rig coming up hard on the runner's left (the star of the shot), skaters behind; the
      // runner just runs (no shots fired, nothing blows up going into the Kade cut)
      T.pirates = [
        pirate(T, F, 'rover', -8, -16, 99),
        pirate(T, F, 'skater', 6, -14, 99),
        pirate(T, F, 'skater', -3, -26, 99),
        pirate(T, F, 'skater', 4, -36, 99),
      ];
      T.pirates[0].body.vel.multiplyScalar(1.25);
    },
    update(T, t) {
      // flat out on the skates, the pack hanging on behind
      T.hold = new Set(['Space', 'KeyW']);
      T.steer = T.F0.fwd;
      T.keepSpeed(34, 0.2);
      // the pack holds a loose formation on the runner (closing in a little over the shot): steered
      // toward its slot each frame, so nobody rams, collides or blows up
      const P = T.g.player, F = T.playerFrame();
      const slots = [[-7, lerp(-14, -6, t / 4)], [6, lerp(-14, -10, t / 4)], [-3, -22], [3, -30]];
      T.pirates.forEach((e, k) => {
        if (e.dead) return;
        e.fireCd = 99;
        e.ramCd = 99;
        const want = F.pos.clone().addScaledVector(F.right, slots[k][0] + Math.sin(t * 2 + k) * 0.8).addScaledVector(F.fwd, slots[k][1]);
        e.body.vel.copy(P.body.vel).addScaledVector(want.sub(e.body.pos), 2.5);
        e.heading.copy(F.fwd);
      });
      // (the Twilight Waystation's turrets are in range of the pack: they hold their fire)
      for (const e of T.g.enemies.list) if (e.faction === 'mil') e.fireCd = 99;
    },
    cam(T, t, dt) {
      const F = T.playerFrame();
      const fwd = T.F0.fwd;
      // tracking alongside, a little ahead, looking back down the chase
      const eye = F.pos.clone().addScaledVector(F.right, -10).addScaledVector(fwd, 6.5).addScaledVector(F.up, 2.3);
      const look = F.pos.clone().addScaledVector(fwd, -7).addScaledVector(F.right, -3).addScaledVector(F.up, 1.4);
      T.chase(eye, look, dt, 30, 12);
      T.fov = 64;
    },
    cards: [{ at: 0.35, dur: 3.1, html: 'THE DARK SIDE.<br><span class="tr-sub">DANGEROUS DELIVERIES PAY MORE.</span>' }],
  },

  // 7 · Captain Kade's gun truck rolls in at the terminator: slow-mo splash, gatling bursts, and
  // flak as the runner jets up out of it.
  {
    name: 'kade',
    dur: 4.6,
    out: { type: 'flash' },
    setup(T) {
      T.music('dark');
      const g = T.g;
      const p = T.sky(88.5, 30);
      const F = T.place(p, tangent(dirFromAngles(88.5, 40).multiplyScalar(3600).sub(p), p.clone().normalize()), 30);
      g.player.setCargo(CRATE);
      T.F0 = F;
      const e = g.story.spawnKade(false);
      // bring him in close, off the runner's left, swinging round toward them
      const at = T.ground(F.pos.clone().addScaledVector(F.right, -34).addScaledVector(F.fwd, 22), 0.3);
      e.body.pos.copy(at);
      e.body.vel.copy(F.fwd).multiplyScalar(26);
      e.heading.copy(F.fwd);
      // stand it upright on its wheels from the first frame (it otherwise slerps up out of the ground)
      e.body.groundN.copy(at).normalize();
      frameQuat(e.body.groundN, F.fwd, e.model.root.quaternion);
      e.model.root.position.copy(at);
      e.gunCd = 0; e.burst = 0;
      T.kade = e;
      T.jumped = false;
    },
    update(T, t) {
      const g = T.g, P = g.player;
      // skate, then let go of the ground, mag-jump and jet up out of the gatling stream: straight
      // into his flak (and its burning phosphor)
      T.hold = new Set(t < 1.7 ? ['Space', 'KeyW'] : ['KeyW', 'KeyE']);
      if (t >= 1.7 && !T.jumped) { T.jumped = true; T.tap.add('ShiftLeft'); }
      T.steer = T.F0.fwd;
      T.keepSpeed(30, 0.15);
      if (t > 1.75 && t < 2.7) {
        // a firm climb whatever the slow-mo is doing to the sim
        const up = P.pos.clone().normalize();
        const vu = P.body.vel.dot(up);
        if (vu < 15) P.body.vel.addScaledVector(up, 15 - vu);
        P.body.grounded = false;
      }
      // he's quick on the flak once they're up there
      const e = T.kade;
      if (e.mode === 'flak' && e.flakCd > 0.5) e.flakCd = 0.5;
    },
    cam(T, t, dt) {
      // Kade and his truck are the subject start to finish: the camera rides off its flank,
      // turret and gatling big in frame, leaning up a touch as the runner climbs into the flak
      // behind him (so the fire and the phosphor read past him)
      const e = T.kade, P = T.g.player;
      const up = e.body.pos.clone().normalize();
      const fwd = tangent(e.body.vel.lengthSq() > 4 ? e.body.vel : e.heading, up, V()).normalize();
      const side = V().crossVectors(fwd, up).normalize();
      const k = ease((t - 1.6) / 1.6);
      const eye = e.body.pos.clone().addScaledVector(side, lerp(-12, -14, k)).addScaledVector(fwd, lerp(-7, -11, k)).addScaledVector(up, lerp(3, 4.5, k));
      T.aboveGround(eye, 2);
      const look = e.center.clone().addScaledVector(up, lerp(0.5, 1.5, k)).lerp(P.center, lerp(0.1, 0.14, k));
      T.chase(eye, look, dt, 10, 8);
      T.fov = lerp(56, 70, k);
    },
  },

  // 8 · Vehicles: a fixed trackside camera set back from the run; the Daedalus Phase Skimmer
  // screams past and the runner fires the Rail Lance from the seat, the beam punching through
  // the pirates up ahead...
  {
    name: 'skimmer',
    dur: 3.4,
    setup(T) {
      T.music('free');
      T.g.audio.level = 1;
      const p = T.sky(35, 30);
      T.V = T.vehicle('skimmer', p, T.heading(p, 0.79), 36);
      gunRun(T, 2, [[0, 125], [1.5, 150], [-2, 175]]);
    },
    update(T, t) {
      T.hold = new Set(['KeyW']);
      T.fire = t > 1.05 && t < 2.9;
      holdRun(T, 36);
    },
    cam(T, t, dt) { trackside(T, dt, 50, -24, 3.2); },
    cards: [{ key: 'faction', at: 0.3, dur: 99, html: 'PICK A FACTION.<br><span class="tr-sub">UNLOCK UNIQUE WEAPONS AND VEHICLES.</span>' }],
  },

  // 9 · ...and the Vostok APC ploughs past the same way, the runner working the Scattergun.
  {
    name: 'apc',
    dur: 3.2,
    out: { type: 'whip', dir: 1 },
    setup(T) {
      const p = T.sky(50, 20);
      T.V = T.vehicle('apc', p, T.heading(p, 5.7), 30); // (a line clear of boulders)
      gunRun(T, 1, [[6.5, 58], [-7, 72], [7, 90]]); // (off the line: shot down, not run over)
    },
    update(T, t) {
      T.hold = new Set(['KeyW']);
      T.fire = t > 0.9;
      holdRun(T, 30);
      T.shake = 0.06;
    },
    cam(T, t, dt) { trackside(T, dt, 44, -20, 2.6); },
    cards: [{ key: 'faction', at: 0, dur: 2.7, html: 'PICK A FACTION.<br><span class="tr-sub">UNLOCK UNIQUE WEAPONS AND VEHICLES.</span>' }],
  },

  // 9b · Big air: flat out up the outside wall of a big sunlit crater and off the rim, out over a
  // 36 m bowl; flips and spins while the camera cranes up and back to show the crater, the plain
  // and the Moon curving away
  {
    name: 'big air',
    dur: 5.4,
    setup(T) {
      T.music('free');
      T.g.audio.level = 1;
      const pl = T.g.planet;
      const c = pl.craters[26];
      const cen = c.d.clone().multiplyScalar(3600);
      const f = T.heading(cen, 0.79); // (a clean run: flat outside, an 18 m kicker of a wall)
      T.air = { cen, launched: false };
      T.place(cen.clone().addScaledVector(f, 245), f.clone().negate(), 52);
      T.g.player.setCargo(CRATE);
      T.dir = f.clone().negate();
    },
    update(T, t) {
      const P = T.g.player, A = T.air;
      const r = tangent(P.pos.clone().sub(A.cen), A.cen.clone().normalize(), V()).length();
      if (!A.launched) {
        T.hold = new Set(['Space', 'KeyW', 'KeyE']);
        T.steer = T.dir;
        T.keepSpeed(52, 0.2);
        if (r < 134) {
          // off the lip: let go of the ground and kick for height
          A.launched = true;
          A.at = t;
          A.pos = P.pos.clone();
          const up = P.pos.clone().normalize();
          P.body.vel.addScaledVector(up, 10);
          P.body.grounded = false;
          P.body.airTime = 0.3;
          P.body.sinceContact = 1;
          T.g.audio.jump();
        }
        return;
      }
      // in the air: a double frontflip, then a spin, then a backflip, holding the line
      const k = t - A.at;
      const keys = [];
      if (k > 0.2 && k < 1.35) keys.push('KeyQ', 'KeyW');
      else if (k > 1.5 && k < 2.1) keys.push('KeyQ', 'KeyD');
      else if (k > 2.3 && k < 2.9) keys.push('KeyQ', 'KeyS');
      T.hold = new Set(keys);
      T.steer = T.dir;
    },
    cam(T, t, dt) {
      const P = T.g.player, A = T.air;
      const up = P.pos.clone().normalize();
      const F = T.playerFrame();
      if (!A.launched || t - A.at < 0.15) {
        // low and close behind, the rim rushing up
        const eye = P.pos.clone().addScaledVector(T.dir, -7).addScaledVector(F.right, 3).addScaledVector(up, 1.8);
        T.chase(eye, P.pos.clone().addScaledVector(T.dir, 12).addScaledVector(up, 3), dt, 40, 20);
        T.fov = 76;
        return;
      }
      // then it rides along with them out over the bowl, easing back, out and up as it goes, so they
      // stay readable against the crater, the plain and the Moon's horizon curving away
      const k = ease((t - A.at) / 3.0);
      const u0 = A.pos.clone().normalize();
      const side = V().crossVectors(T.dir, u0).normalize();
      const eye = P.pos.clone().addScaledVector(T.dir, lerp(-7, -15, k)).addScaledVector(side, lerp(3, 10, k)).addScaledVector(u0, lerp(2, 9, k));
      T.chase(eye, P.center.clone().addScaledVector(T.dir, 3).addScaledVector(u0, -2 * k), dt, 30, 20);
      T.fov = lerp(76, 66, k);
    },
    cards: [{ key: 'terrain', at: 0.4, dur: 99, html: "MAKE DARING DELIVERIES<br><span class='tr-sub'>ACROSS THE MOON'S UNIQUE TERRAIN.</span>" }],
  },

  // 10 · A meteor shower: rocks streak in on a slant and burst around the runner, who weaves
  // through it at full tilt.
  {
    name: 'meteors',
    dur: 4.5,
    setup(T) {
      const g = T.g, M = g.meteors;
      const p = T.sky(80, 0);
      const F = T.place(p, T.heading(p, 2.35), 34);
      g.player.setCargo(CRATE);
      T.F0 = F;
      // a small shower parked over the run, coming in from the left of frame
      const c = F.pos.clone().addScaledVector(F.fwd, 75).normalize();
      M.zone = { dir: c, r: 70, t: 30, dur: 1e9, spawnT: 1e9, slant: F.right.clone() };
      // rocks already on their way, timed to land through the shot (and twice as fast as usual)
      // each one lands off to alternate sides of the line, further down the run as the shot goes
      for (let i = 0; i < 12; i++) {
        M.spawnRock();
        const rk = M.rocks[M.rocks.length - 1];
        const tau = 0.35 + i * 0.34;
        const side = (i % 2 ? 1 : -1) * (22 + ((i * 13) % 20));
        const gp = T.ground(F.pos.clone().addScaledVector(F.fwd, 22 + tau * 34 + 12).addScaledVector(F.right, side));
        rk.gp.copy(gp);
        rk.vel.multiplyScalar(2.4);
        rk.pos.copy(gp).addScaledVector(rk.vel, -tau);
        rk.grp.position.copy(rk.pos);
        if (rk.ring) { rk.ring.t = 0; rk.ring.dur = tau; rk.ring.m.position.copy(gp).addScaledVector(gp.clone().normalize(), 0.6); }
      }
    },
    update(T, t) {
      const up = T.g.player.pos.clone().normalize();
      T.hold = new Set(['Space', 'KeyW']);
      T.steer = T.F0.fwd.clone().applyAxisAngle(up, Math.sin(t * 4.2) * 0.4);
      T.keepSpeed(34, 0.2);
    },
    cam(T, t, dt) {
      const F = T.playerFrame(), F0 = T.F0;
      // high behind and to the right: the rocks cross the frame and burst ahead
      const eye = F.pos.clone().addScaledVector(F0.fwd, -11).addScaledVector(F0.right, 5).addScaledVector(F.up, 5);
      const look = F.pos.clone().addScaledVector(F0.fwd, 30).addScaledVector(F.up, 4);
      T.chase(eye, look, dt, 30, 10);
      T.fov = 70;
    },
    cards: [{ key: 'terrain', at: 0, dur: 99, html: "MAKE DARING DELIVERIES<br><span class='tr-sub'>ACROSS THE MOON'S UNIQUE TERRAIN.</span>" }],
  },

  // 11 · Hitching a ride: surfing the roof of a shuttle-bus as it sweeps in on the Helium-3
  // Exchange's refinery stacks.
  {
    name: 'bus surf',
    dur: 3.0,
    setup(T) {
      T.music('free');
      const g = T.g, W = g.world.traffic;
      const bus = ship(T, 'ilmb', 'mine');
      T.bus = bus;
      // two samples of the route give its heading; then square the bus up to it
      const s0 = bus.path.len - 190;
      flyShip(bus, s0 + 30); W.updateFlyer(bus, 0, bus.pos);
      const ahead = bus.pos.clone();
      flyShip(bus, s0); W.updateFlyer(bus, 0, bus.pos);
      bus.prevPos.copy(bus.pos);
      aimShip(bus, ahead.sub(bus.pos));
      W.syncDeck(bus, bus.pos);
      // crouched on the roof: the ride system's seat carries the runner (rides.js / player.js)
      const P = g.player;
      P.respawn(bus.pos.clone(), bus.heading);
      P.seat = { obj: bus.root, local: V(0, (bus.deckY || 0) + bus.deck[1] + 0.05, (bus.deckZ || 0) + 1), face: V(0, 0, 1), hidden: false };
      P.setCargo(CRATE);
      T.steer = bus.heading.clone();
    },
    update(T) {
      T.hold = new Set(['Space']);
      T.steer = T.bus.heading.clone();
    },
    cam(T, t, dt) {
      const bus = T.bus;
      const up = bus.pos.clone().normalize();
      const right = V().crossVectors(bus.heading, up).normalize();
      // over the tail, looking past the runner to the domes coming up ahead; drifting out wide
      const eye = bus.pos.clone().addScaledVector(bus.heading, lerp(-13, -16, t / 3)).addScaledVector(right, lerp(3, 9, ease(t / 3))).addScaledVector(up, lerp(5.5, 7.5, t / 3));
      const look = bus.pos.clone().addScaledVector(bus.heading, 50).addScaledVector(up, -6);
      T.chase(eye, look, dt, 20, 20);
      T.fov = 54;
    },
  },

  // 12a · Chimera Downs from above: a slow crane along the packed grandstand, the dirt oval and the
  // finish gantry, before the race
  {
    name: 'downs pan',
    dur: 3.0,
    setup(T) {
      T.music('downs');
      T.place(T.g.race.booth.clone(), T.at('downs', 0, 0, 1).sub(T.at('downs', 0, 0, 0)));
      T.hidePlayer = true;
    },
    cam(T, t) {
      const k = ease(t / 3);
      T.at('downs', lerp(-75, 15, k), lerp(26, 21, k), lerp(18, 10, k), T.eye);
      T.at('downs', lerp(-15, 45, k), 6, lerp(72, 62, k), T.look);
      T.fov = 56;
    },
    cards: [{ key: 'festive', at: 0.4, dur: 99, html: 'JOIN THE LOCAL FESTIVITIES.<br><span class="tr-sub">PLACE YOUR BETS. LET IT RIDE.</span>' }],
  },

  // 12 · Chimera Downs: the gates spring, the field of splices thunders out under the crowd, and
  // the camera snaps onto the leader.
  {
    name: 'downs',
    dur: 3.4,
    setup(T) {
      T.music('downs');
      const g = T.g, R = g.race;
      // a fresh card under this shot's seed, so the field is the same every run (the one posted
      // at load is random), with a wheeled racer in it
      R.card = [];
      R.post();
      T.place(R.booth.clone(), T.at('downs', 0, 0, 1).sub(T.at('downs', 0, 0, 0)));
      T.hidePlayer = true;
      const race = R.card[0];
      if (!race.field.some((f) => f.legs === 'car')) race.field[0].legs = 'car';
      const mine = spliceGenes([{ kind: 'mite' }, { kind: 'person', name: 'Gary' }]);
      R.start(race, [mine, ...race.field], 0, 3);
      R.timer = 0.3; // a beat of stillness in the stalls, then the gates
      g.audio.roar(1);
    },
    cam(T, t, dt) {
      const R = T.g.race;
      const rs = R.racers;
      if (!rs.length || !rs[0].pos) return;
      const lead = [...rs].sort((a, b) => b.s - a.s)[0];
      const cen = V();
      for (const r of rs) cen.add(r.pos);
      cen.divideScalar(rs.length);
      const up = cen.clone().normalize();
      const fwd = rs[0].fwd;
      const right = V().crossVectors(fwd, up).normalize();
      if (t < 1.6) {
        // low on the track ahead of the stalls: the field bursts out toward the lens
        const eye = cen.clone().addScaledVector(fwd, lerp(20, 13, ease(t / 1.6))).addScaledVector(right, 6).addScaledVector(up, 1.4);
        T.chase(eye, cen.clone().addScaledVector(up, 1.6), dt, 30, 30);
        T.fov = 58;
      } else {
        // snap onto the leader: a tight tracking close-up
        if (!T.snapped) { T.snapped = true; T.chased = false; }
        const p = lead.pos, k = lead.genes.size || 1;
        const eye = p.clone().addScaledVector(lead.fwd, 4 + 3 * k).addScaledVector(V().crossVectors(lead.fwd, up).normalize(), 3 + 2.5 * k).addScaledVector(up, 0.8 + k);
        T.chase(eye, p.clone().addScaledVector(up, 0.6 + 0.8 * k), dt, 30, 30);
        T.fov = 50;
      }
    },
    cards: [{ key: 'festive', at: 0, dur: 2.2, html: 'JOIN THE LOCAL FESTIVITIES.<br><span class="tr-sub">PLACE YOUR BETS. LET IT RIDE.</span>' }],
  },

  // 13 · The Antimatter Lab: a slow pan across the front as the courier skates up to the door, then
  // a cut inside: into the reactor goes the jar. FLASH. Something with too many legs climbs out.
  // Dr. Zbornak's caption holds across the cut; "SHENANIGANS." lands on the flash.
  {
    name: 'lab',
    dur: 6.2,
    out: { type: 'black', len: 0.35 },
    setup(T) {
      T.music('lab');
      const g = T.g;
      const from = T.at('antimatter', 9, 0, 44);
      T.place(from, T.at('antimatter', 0, 0, 18).sub(from), 7);
      g.player.setCargo(CRATE);
      T.fed = false;
      T.inside = false;
    },
    update(T, t) {
      const g = T.g;
      if (t < CUT) {
        T.hold = new Set(['Space', 'KeyW']);
        T.steer = T.at('antimatter', 0, 0, 18).sub(g.player.pos);
        T.keepSpeed(7, 0.3);
        return;
      }
      if (!T.inside) {
        // the hard cut: inside, by the reactor with the jar
        T.inside = true;
        T.place(T.at('antimatter', 3, 0, 4), T.at('antimatter', -2, 0, -3).sub(T.at('antimatter', 3, 0, 4)));
        g.player.setCargo(CRATE);
        T.hold = new Set();
      }
      if (t > CUT + 0.7 && !T.fed) {
        // into the reactor go the finds: a mite and a settler make a chimera, which hatches out
        // of the core and bursts through the glass (alchemy.js breed / hatch)
        T.fed = true;
        g.world.reactor.flash = 2.2;
        g.audio.boom(true);
        g.cam.shake = 0.8;
        T.shake = 0.35;
        T.pop('KA-FWOOSH!', '#ff2e88', 90, -6);
        g.alchemy.jar = [{ kind: 'mite' }, { kind: 'person', name: 'Gary' }];
        g.alchemy.breed(g.alchemy.jar);
        g.alchemy.jar = [];
        g.alchemy.refreshJarMesh();
      }
      if (t > CUT + 1.1) T.shake = Math.max(0, T.shake - 0.02);
    },
    cam(T, t) {
      if (t < CUT) {
        // outside: a slow lateral pan along the front, the door and the holding pen
        const k = ease(t / CUT);
        T.at('antimatter', lerp(34, 10, k), lerp(6, 7.5, k), lerp(56, 50, k), T.eye);
        T.at('antimatter', lerp(4, -2, k), 6, 4, T.look);
        T.roll = 0;
        T.fov = 52;
        return;
      }
      // inside: over Dr. Zbornak's counter, pushing in on the reactor through the flash
      const j = ease((t - CUT) / (6.2 - CUT));
      T.at('antimatter', lerp(17, 13, j), lerp(6.2, 5.6, j), lerp(9.5, 7.5, j), T.eye);
      T.at('antimatter', lerp(1, -1, j), 2.6, lerp(0, -2, j), T.look);
      T.roll = 0.05;
      T.fov = 60;
    },
    cards: [
      { at: 0.4, dur: 3.6, html: "DR. ZBORNAK.<br><span class='tr-sub'>HE'LL THROW ANYTHING YOU FIND INTO THE REACTOR.</span>" },
      { at: 4.4, dur: 1.75, kind: 'shout pink', html: 'SHENANIGANS.' },
    ],
  },

  // 14 · Lucky Crater Casino: skating up the slot-machine carpet into the neon...
  {
    name: 'casino',
    dur: 2.2,
    setup(T) {
      T.music('casino');
      T.place(T.at('casino', 1.5, 0, 52), T.at('casino', 0, 0, 0).sub(T.at('casino', 0, 0, 52)), 16);
      T.g.player.setCargo(CRATE);
      T.in = T.at('casino', 0, 0, 0).sub(T.at('casino', 0, 0, 52));
    },
    update(T) {
      T.hold = new Set(['Space', 'KeyW']);
      T.steer = T.in;
      T.keepSpeed(16, 0.3);
    },
    cam(T, t) {
      // a low dolly up the carpet behind the runner, the hall's neon filling the frame
      T.at('casino', -2.5, 1.2, lerp(64, 48, t / 2.2), T.eye);
      T.at('casino', 0, 7.5, 10, T.look);
      T.fov = 62;
    },
  },

  // 14b · ...through the doors into the hall: Plinko, the duck derby, a carpet you could lose a
  // week on
  {
    name: 'casino hall',
    dur: 2.4,
    setup(T) {
      T.music('casino');
      const from = T.at('casino', 1, 0, 9);
      T.in = T.at('casino', -7, 0, -24).sub(from);
      T.place(from, T.in, 10);
      T.g.player.setCargo(CRATE);
    },
    update(T) {
      T.hold = new Set(['Space', 'KeyW']);
      T.steer = T.in;
      T.keepSpeed(10, 0.3);
    },
    cam(T, t, dt) {
      // in from the side of the doors, sweeping round with the runner as Plinko slides into view
      const k = ease(t / 2.4);
      const eye = T.at('casino', lerp(15, 12, k), lerp(4.8, 4, k), lerp(5, -4, k));
      const look = T.g.player.pos.clone().addScaledVector(T.g.player.pos.clone().normalize(), 1.5).lerp(T.at('casino', 6, 5, -24), 0.3);
      T.chase(eye, look, dt, 20, 8);
      T.fov = 66;
    },
  },

  // 15 · ...and round the Bounce Dome Funpark's ferris wheel, Earth hanging over the top.
  {
    name: 'ferris wheel',
    dur: 2.2,
    out: { type: 'black', len: 0.25 },
    setup(T) {
      T.music('casino');
      const g = T.g;
      const r = g.world.rides.find((x) => x.name === 'FERRIS WHEEL');
      T.place(T.at('bounce', -10, 0, 70), T.at('bounce', 0, 0, 1).sub(T.at('bounce', 0, 0, 0)));
      // the gondola nearest the top
      let best = null, by = -1e9;
      for (const st of r.seats) {
        st.obj.updateMatrixWorld(true);
        const p = st.obj.localToWorld(st.local.clone());
        const y = loc_y(T, 'bounce', p);
        if (y > by) { by = y; best = st; }
      }
      g.rides.board({ kind: 'fun', ride: r, seat: best });
      g.player.setCargo(CRATE);
    },
    cam(T, t) {
      // from the ground under the wheel, looking up past it to Earth and the sun
      T.at('bounce', lerp(-29, -30.5, t / 2.2), lerp(2.5, 3.2, t / 2.2), lerp(24, 30, t / 2.2), T.eye);
      T.at('bounce', -43, 32, 62, T.look);
      T.fov = 66;
    },
  },
];

// 17 · The tease: down the ramp into the Whispering Fissure, along the corridor and into the
// chamber, the runner slowing as they come up on the sealed alien gate, a mint glow behind it.
// "SOMETHING IS DOWN THERE." Hold. Black.
const FISSURE = {
  name: 'fissure',
  dur: 6.4,
  out: { type: 'black', len: 0.7, in: 0.6 },
  setup(T) {
    T.music('dark');
    const g = T.g;
    // the runner skates down ahead of the camera, a silhouette against the gate's glow
    T.place(T.at('fissure', 0, -20, -14), T.at('fissure', 0, 0, 1).sub(T.at('fissure', 0, 0, 0)), 20);
    g.player.setCargo(CRATE);
    T.lampOn = true;
    T.dir = T.at('fissure', 0, 0, 1).sub(T.at('fissure', 0, 0, 0));
    T.faded = false;
  },
  update(T, t) {
    T.hold = new Set(['Space']);
    T.steer = T.dir;
    if (t > FISSURE.dur - 0.9 && !T.faded) { T.faded = true; T.musicLevel(0, 0.8); } // out with the light
    // (under 25 m/s: no skate dust in the lens), then easing up as the gate looms
    const z = T.toLocal('fissure', T.g.player.pos).z;
    T.keepSpeed(z < 62 ? 20 : z < 92 ? lerp(20, 5, (z - 62) / 30) : 1.5, 0.12);
  },
  cam(T, t, dt) {
    // behind the runner down the ramp, along the corridor and into the chamber; it stops halfway
    // across and lets them skate on up to the gate
    const r = T.toLocal('fissure', T.g.player.pos);
    const z = Math.min(r.z - 8, 78);
    // (8 m back up the slope the ramp floor is higher than the runner: stay 2.4 m over it)
    const floor = z < 20 ? (-34 * (z + 70)) / 90 : -34;
    const y = Math.min(Math.max(r.y + 2.2, floor + 2.4), z > 16 ? -27.5 : 0);
    const eye = T.at('fissure', 0, y, z);
    T.chase(eye, T.at('fissure', 0, -27, 110), dt, 6, 10);
    T.fov = lerp(60, 46, ease(t / 5));
  },
  cards: [{ at: 3.7, dur: 2.7, kind: 'whisper', html: 'SOMETHING IS DOWN THERE.' }],
};

// 18 · Hero shot and end card: at sunset on the terminator the courier grinds a crater lip, crate
// on their back, and slides off into the dark. MOON-RUNNER.
const HERO = {
  name: 'hero',
  dur: 7.6,
  setup(T) {
    T.music('menu', true, 2.2); // (rising back in from the Fissure's silence, not slamming in)
    const g = T.g, pl = g.planet;
    const c = pl.craters[582];
    const rail = pl.rimRailsOf(c).find((r) => r.loop) || pl.rimRailsOf(c)[0];
    // start where the lip runs most directly away from the sun, so the slide heads into the night
    let best = 0, bd = 1e9;
    for (let s = 0; s < rail.len; s += 4) {
      const a = railPoint(rail, s), b = railPoint(rail, s + 2);
      const d = b.sub(a).normalize().dot(SUN_DIR);
      if (d < bd) { bd = d; best = s; }
    }
    T.R = { c, rail };
    T.grindOn(rail, best - 60, 1, 30);
    g.player.setCargo(CRATE);
    T.popped = false;
    T.popMute = /GRIND/;
  },
  update(T, t) {
    T.hold = new Set(['Space']);
    if (t > 2.9 && !T.popped && T.g.grind.active) { T.popped = true; T.tap.add('ShiftLeft'); }
    if (T.popped) T.hold = new Set(['Space', 'KeyW']);
  },
  cam(T, t, dt) {
    const P = T.g.player;
    const up = P.pos.clone().normalize();
    const F = T.playerFrame();
    // rides low alongside the grind, then holds as the courier pops off and sails away into the
    // dusk, craning up for the logo
    let eye;
    if (t < 3.0 || !T.anchor) {
      eye = P.pos.clone().addScaledVector(F.fwd, -5.5).addScaledVector(F.right, 2.6).addScaledVector(up, 1.3);
      T.anchor = eye.clone();
    } else eye = T.anchor.clone().addScaledVector(up, lerp(0, 4, ease((t - 3) / 2.8)));
    const look = P.pos.clone().addScaledVector(up, 1.2);
    T.chase(eye, look, dt, 18, 12);
    T.fov = lerp(58, 46, ease((t - 3) / 2.8));
  },
  cards: [{ at: 4.1, dur: 99, kind: 'end', html: LOGO }],
};

// 15b · Out collecting: three quick beats (a glowing rock crystal, a wild moon mite, an unlucky
// settler), each skated up to and scooped into the jar on the courier's back. "Collect interesting
// things around the Moon."
const SCOOP_BEAT = 3.0;
const SCOOP = {
  name: 'scoop',
  dur: SCOOP_BEAT * 3,
  setup(T) {
    T.music('free');
    const g = T.g, A = g.alchemy;
    g.audio.mix.hum = HUM * 0.4;
    A.jar = [];
    A.refreshJarMesh();
    g.player.setCargo(null); // (the jar rides where the crate does)
    const S = dirFromAngles(0, 0);
    const sunny = (p) => { const th = Math.acos(p.clone().normalize().dot(S)) * 57.3; return th > 20 && th < 60; };
    T.scoop = {
      beat: -1,
      rock: g.world.crystals.find((c) => !c.taken && sunny(c.pos) && !g.zoneAt(c.pos, 1.3)),
      mite: A.mites.find((m) => m.gone <= 0 && sunny(m.home) && !g.zoneAt(m.home, 1.6)),
      person: g.world.figures.find((f) => f.loc.id === 'tranq' && !f.captured && !f.loc.restricted),
    };
  },
  update(T, t) {
    const g = T.g, P = g.player, S = T.scoop;
    const b = Math.min(2, Math.floor(t / SCOOP_BEAT)), bt = t - b * SCOOP_BEAT;
    const target = () => (b === 0 ? S.rock.pos.clone() : b === 1 ? (S.mite.model ? S.mite.model.root.position.clone() : g.planet.ground(S.mite.home, V())) : S.person.root.getWorldPosition(V()));
    if (b !== S.beat) {
      // a hard cut to the next find: the courier rolls in from 11 m out, slow enough not to spook it
      S.beat = b;
      S.scooped = false;
      T.chased = false;
      const tp = target();
      const up = tp.clone().normalize();
      const from = tp.clone().addScaledVector(T.heading(tp, 0.6 + b * 1.7), -11);
      T.place(from, tp.clone().sub(from), 5);
      S.side = V().crossVectors(tangent(tp.clone().sub(from), up, V()).normalize(), up).normalize();
    }
    const tp = target();
    const d = tp.distanceTo(P.pos);
    T.steer = tp.clone().sub(P.pos);
    if (d > 2.6 && !S.scooped) { T.hold = new Set(['Space', 'KeyW']); T.keepSpeed(5, 0.3); }
    else { T.hold = new Set(); P.body.vel.multiplyScalar(0.85); }
    if (bt > 1.8 && !S.scooped) { S.scooped = true; T.tap.add('KeyG'); }
  },
  cam(T, t, dt) {
    const S = T.scoop, P = T.g.player;
    if (S.beat < 0) return;
    const b = S.beat;
    const tp = b === 0 ? S.rock.pos.clone() : b === 1 ? (S.mite.model ? S.mite.model.root.position.clone() : P.pos.clone()) : S.person.root.getWorldPosition(V());
    const up = tp.clone().normalize();
    // side on to the approach, framing the courier and the find together
    const mid = tp.clone().lerp(P.pos, 0.5);
    const eye = mid.clone().addScaledVector(S.side, 7.5).addScaledVector(up, 2.4);
    T.aboveGround(eye, 1.6);
    T.chase(eye, mid.addScaledVector(up, 1.1), dt, 20, 20);
    T.fov = 50;
  },
  cards: [{ at: 0.4, dur: SCOOP_BEAT * 3 - 0.6, html: 'COLLECT INTERESTING THINGS<br><span class="tr-sub">FROM ALL OVER THE MOON.</span>' }],
};

// height of a world point in a location's frame
function loc_y(T, id, p) { return p.clone().applyMatrix4(T.loc(id).group.matrixWorld.clone().invert()).y; }

// a pirate, already riding alongside: kind, offset (right, forward) from the runner's frame F
function pirate(T, F, kind, x, z, fireIn = 0.5) {
  const g = T.g;
  const p = F.pos.clone().addScaledVector(F.right, x).addScaledVector(F.fwd, z);
  const e = g.enemies.spawnPirate(kind, p);
  e.body.vel.copy(g.player.body.vel);
  e.heading.copy(F.fwd);
  e.fireCd = fireIn;
  e.aggro = true;
  return e;
}

// a vehicle gun run: the weapon in hand, and pirates standing in the line of fire ([side, ahead] m
// from the start, along the run)
function gunRun(T, weapon, targets) {
  const g = T.g, F = T.V.F;
  g.player.weapon = weapon;
  g.player.fireCd = 0;
  T.popMute = /PIRATES/; // (the targets' own "PIRATES!" shout would just clutter the run)
  T.targets = targets.map(([x, z]) => pirate(T, F, 'skater', x, z, 99));
  for (const e of T.targets) {
    e.pin = e.body.pos.clone(); // they stay put (a knocked one won't stagger into the road)
    e.hp = 30; // one good blast each
  }
}
// keep the vehicle at speed and the targets standing still, guns quiet, and the aim on the next
// one standing (the game aims from its chase camera, behind and above the runner, through cam.look)
function holdRun(T, speed) {
  const g = T.g, b = T.V.v.e.body;
  if (b.vel.length() > speed) b.vel.setLength(speed);
  for (const e of T.targets) { if (e.dead) continue; e.body.vel.set(0, 0, 0); e.body.pos.copy(e.pin); e.fireCd = 99; e.ramCd = 99; }
  const next = T.targets.find((e) => !e.dead);
  if (!next) { T.steer = T.V.F.fwd; T.pitch = 0; return; }
  // the shot leaves the muzzle (beside the runner) and the Scattergun's pellets inherit some of the
  // vehicle's speed: aim so the pellets' actual path runs through the target, then express that as
  // the look direction from the chase camera, which is what the game aims along
  const P = g.player, up = P.pos.clone().normalize();
  const muzzle = P.center.clone().addScaledVector(g.cam.right, 0.5).addScaledVector(up, 0.3);
  const u = next.center.clone().sub(muzzle).normalize();
  const inherit = P.weapon === 1 ? 0.6 : 0;
  const dir = u.multiplyScalar(150).addScaledVector(b.vel, -inherit).normalize();
  const d = muzzle.addScaledVector(dir, 350).sub(g.cam.position);
  T.steer = d.clone();
  T.pitch = Math.asin(Math.max(-1, Math.min(1, d.normalize().dot(up))));
}
// a fixed camera beside the run (ahead m along it, side m off it, up m high) that pans with the
// vehicle as it goes by
function trackside(T, dt, ahead, side, up) {
  const F = T.V.F, e = T.V.v.e;
  const u = F.pos.clone().normalize();
  const eye = F.pos.clone().addScaledVector(F.fwd, ahead).addScaledVector(F.right, side).addScaledVector(u, up);
  T.aboveGround(eye, up);
  T.chase(eye, e.body.pos.clone().addScaledVector(u, 1.4).addScaledVector(F.fwd, 6), dt, 30, 7);
  T.fov = 50;
}

// the crater whose lip the runner grinds (the first good one past the ILMB, toward Earth)
function rim(T) {
  if (!T._rim) T._rim = T.rimNear(T.at('ilmb', 136, 0, 778), 30, 45, 60);
  return T._rim;
}
// point at arc length s along a rail
function railPoint(r, s) {
  s = r.loop ? ((s % r.len) + r.len) % r.len : Math.max(0, Math.min(r.len, s));
  let i = 0;
  while (i < r.cum.length - 2 && r.cum[i + 1] < s) i++;
  const f = (s - r.cum[i]) / Math.max(1e-6, r.cum[i + 1] - r.cum[i]);
  return r.pts[i].clone().lerp(r.pts[i + 1], f);
}
export { SHOTS };

SHOTS.push(FISSURE, HERO);
// running order tweak: the casino and the funpark follow the Downs, then Dr. Zbornak's lab
const LAB = SHOTS.splice(SHOTS.findIndex((x) => x.name === 'lab'), 1)[0];
SHOTS.splice(SHOTS.findIndex((x) => x.name === 'ferris wheel') + 1, 0, SCOOP, LAB);
