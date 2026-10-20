// The Moon Council chamber: a self-contained cutscene set (own Scene and camera, drawn through the comic post pass in place
// of the Moon) and the vote cutscene. HomeTown.vote (hometown.js) decides and saves the result, then calls Chamber.play();
// the scene fades to black and only then is the result announced.
import * as THREE from 'three';
import { Kit, T as TOON, G, D } from './outpostModels.js';
import { toon } from './toon.js';
import { clamp01, lerp } from './rng.js';
import { makeFigure, makeRunner } from './models.js';
import { LEADERS } from './story.js';
import { FACTIONS } from './locations.js';

const TAU = Math.PI * 2;
const CREAM = 0xfff4e0, LT = 0xd8d4e8, CONC = 0x8a8698, KEP = 0xff9f1c, DK = 0x3a3550, WARM = 0xfff6a8, MARBLE = 0xe9e2d0, WOOD = 0x6b4328;
const GD = (c) => { const m = G(c).clone(); m.side = THREE.DoubleSide; m.userData.shared = true; return m; }; // unlit two-sided colour (dome inside)
const R = 14.5, WALL_H = 9; // chamber radius, wall height (m). Lectern at the origin facing -z, doors behind (+z)
const ARC = { a0: -1.82, a1: 1.82 }; // audience arc: angles from -z, + toward +x (+-104 deg)
const ROWS = [{ r: 6.4, y: 0.45 }, { r: 8.5, y: 1.0 }, { r: 10.6, y: 1.55 }, { r: 12.7, y: 2.1 }];
const SEATS = ['vostok', 'spacecom', 'kepler', 'meridian', 'daedalus']; // left to right from the lectern; war partners at opposite ends
const HEX = { spacecom: 0xffd23f, vostok: 0xff3b5c, meridian: 0x2ec4ff, kepler: 0xff9f1c, daedalus: 0xc77dff };
const DELEG = { // delegation staff looks (makeFigure); leaders are makeRunner with their story look
  spacecom: { suit: 0xf4f1ff, helmet: 0xf4f1ff, visor: 0x2ec4ff, look: 'trooper' },
  vostok: { suit: 0x6b6f78, helmet: 0x8a8f99, visor: 0x111111, look: 'trooper' },
  meridian: { suit: 0xffc83a, helmet: 0xffe27a, visor: 0x1a1030, look: 'trader' },
  kepler: { suit: 0x6a8f3a, helmet: 0xfff4e0, visor: 0x2b8f4a, look: 'casual' },
  daedalus: { suit: 0xeeeaf8, helmet: 0xeeeaf8, visor: 0xc77dff, look: 'lab' },
};
// the councillor's lines and their target factions come with the spec: hometown.js MOTIONS[key].say / .focus

const pol = (r, a, y = 0) => new THREE.Vector3(Math.sin(a) * r, y, -Math.cos(a) * r); // radius r, angle a (from -z), height y
const faceCentre = (a) => Math.atan2(-Math.sin(a), Math.cos(a)); // yaw facing the lectern from angle a
const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(k));
const lerp3 = (a, b, u) => new THREE.Vector3().lerpVectors(a, b, u);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// flat annular sector at height y (normal up); vertical band at radius r facing the centre
function treadGeo(rIn, rOut, a0, a1, y, seg = 14) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++) { const a = a0 + ((a1 - a0) * i) / seg, s = Math.sin(a), c = -Math.cos(a); pos.push(rIn * s, y, rIn * c, rOut * s, y, rOut * c); nor.push(0, 1, 0, 0, 1, 0); }
  for (let i = 0; i < seg; i++) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  return mk(pos, nor, idx);
}
function riserGeo(r, y0, y1, a0, a1, seg = 14) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++) { const a = a0 + ((a1 - a0) * i) / seg, s = Math.sin(a), c = -Math.cos(a); pos.push(r * s, y0, r * c, r * s, y1, r * c); nor.push(-s, 0, -c, -s, 0, -c); }
  for (let i = 0; i < seg; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  return mk(pos, nor, idx);
}
function mk(pos, nor, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ---- the set: one Kit (nine merged meshes, ~8k tris), built once per session ----
let kitCache = null;
function chamberKit() {
  if (kitCache) return kitCache;
  const k = new Kit(KEP, 29, false);
  k.at();
  const { a0, a1 } = ARC;
  // floor: marble disc, inlaid rings, sunburst round the dais
  k.cyl(R + 0.8, R + 0.8, 0.3, 64, TOON(DK), 0, -0.3, 0, { outline: 0 });
  k.cyl(R, R, 0.12, 64, TOON(MARBLE), 0, 0, 0, { outline: 0 });
  k.ring(4.6, 0.07, TOON(KEP), 0, 0.14, 0); k.ring(5.0, 0.04, TOON(KEP), 0, 0.14, 0); k.ring(13.7, 0.08, TOON(KEP), 0, 0.14, 0);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.beam([Math.sin(a) * 1.5, 0.15, Math.cos(a) * 1.5], [Math.sin(a) * 4.4, 0.15, Math.cos(a) * 4.4], 0.04, TOON(KEP), { outline: 0, seg: 4 }); }
  // dais, lectern (with the council's name) and gavel table
  k.cyl(3.0, 3.2, 0.4, 36, TOON(CONC), 0, 0.1, 0, { outline: 0.04 });
  k.cyl(2.7, 2.7, 0.08, 36, TOON(KEP), 0, 0.5, 0, { outline: 0 });
  k.cyl(0.55, 0.7, 1.05, 10, TOON(0x8a5a3a), 0, 0.5, 0, { outline: 0.04 });
  k.add(new THREE.BoxGeometry(1.5, 0.12, 0.95), TOON(WOOD), 0, 1.62, 0, { rx: -0.12, outline: 0.03 });
  k.cyl(0.17, 0.2, 0.17, 12, TOON(0xc9a06b), 0.32, 1.7, 0.4, { outline: 0.03 }); // gavel sound block
  k.box(1.5, 0.35, 0.1, TOON(KEP), 0, 1.15, -0.45, { outline: 0.02 });
  k.text('MOON COUNCIL', 0, 1.32, -0.51, Math.PI, 1.3, { fg: '#ff9f1c', bg: '#241a3a', back: false, off: 0 });
  // tiers: tread + riser; per delegation a dark-wood counter capped in its colour
  const span = (a1 - a0) / SEATS.length;
  for (let ri = 0; ri < ROWS.length; ri++) {
    const { r, y } = ROWS[ri];
    const prevY = ri ? ROWS[ri - 1].y : 0.12;
    k.add(treadGeo(r - 1.05, r + 1.05, a0, a1, y), TOON(0xb8b4c8), 0, 0, 0, { outline: 0 });
    k.add(riserGeo(r - 1.05, prevY, y, a0, a1), D(0x6b6880), 0, 0, 0, { outline: 0 });
    for (let s = 0; s < SEATS.length; s++) {
      const c = HEX[SEATS[s]], sa0 = a0 + s * span + 0.03, sa1 = a0 + (s + 1) * span - 0.03;
      k.add(riserGeo(r - 0.62, y, y + 0.85, sa0, sa1, 6), D(0x4a3320), 0, 0, 0, { outline: 0 });
      k.add(treadGeo(r - 0.78, r - 0.46, sa0, sa1, y + 0.85, 6), TOON(c), 0, 0, 0, { outline: 0 });
    }
  }
  // walls: cream, orange band, wainscot, columns, lit windows
  k.add(new THREE.CylinderGeometry(R, R, WALL_H, 56, 1, true), D(CREAM), 0, WALL_H / 2, 0, { outline: 0 });
  k.add(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.9, 56, 1, true), D(KEP), 0, WALL_H - 0.5, 0, { outline: 0 });
  k.add(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 1.2, 56, 1, true), D(WOOD), 0, 0.6, 0, { outline: 0 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + TAU / 32, p = pol(R - 0.5, a);
    k.cyl(0.4, 0.46, WALL_H - 0.9, 10, TOON(0xfffaf0), p.x, 0.1, p.z, { outline: 0.03 });
    k.box(1.1, 0.4, 1.1, TOON(LT), p.x, WALL_H - 0.9, p.z, { outline: 0 });
    const wa = a + TAU / 32, wp = pol(R - 0.12, wa);
    k.box(1.0, 2.4, 0.1, G(WARM), wp.x, 4.2, wp.z, { ry: -wa, outline: 0 });
  }
  // dome: a ribbed cap on the wall top with a bright oculus
  const PHI = 1.13, RS = R / Math.sin(PHI), CY = WALL_H - RS * Math.cos(PHI);
  k.add(new THREE.SphereGeometry(RS, 40, 12, 0, TAU, 0, PHI), GD(0x9fcdb8), 0, CY, 0, { outline: 0 });
  for (let i = 0; i < 12; i++) k.add(new THREE.TorusGeometry(RS - 0.1, 0.12, 4, 24, PHI).rotateZ(Math.PI / 2 - PHI).rotateY((i / 12) * TAU), TOON(LT), 0, CY, 0, { outline: 0 });
  k.add(new THREE.CircleGeometry(2.4, 20).rotateX(Math.PI / 2), G(0xcfffe0), 0, CY + RS * Math.cos(0.17) - 0.15, 0, { outline: 0 });
  // a banner behind each delegation, in its colour, with its name
  for (let s = 0; s < SEATS.length; s++) {
    const f = SEATS[s], c = HEX[f], a = a0 + (s + 0.5) * span, p = pol(R - 0.25, a);
    k.at(p.x, p.z, faceCentre(a));
    k.box(3.4, 5.2, 0.1, TOON(c), 0, 2.0, 0, { outline: 0.03 });
    k.box(3.8, 0.2, 0.2, TOON(0x1d1a29), 0, 7.2, 0, { outline: 0 });
    k.text(FACTIONS[f].name.toUpperCase().replace(' SETTLEMENTS', ''), 0, 4.8, 0.07, 0, 3.0, { fg: '#1d1a29', bg: '#' + c.toString(16).padStart(6, '0'), back: false, off: 0 });
    k.at();
  }
  kitCache = k.finish();
  return kitCache;
}

// ---- timeline (s) ----
const TL = {};
TL.out = 0.45; // world dips to black
TL.pan0 = 4.0; // after the establishing shot: the delegations, one by one
TL.close0 = 7.8; // councillor from the front: the opening
TL.ots0 = 11.6; // over the shoulder: the motion
TL.react0 = 16.0; // two reaction cuts to the targeted delegations
TL.call0 = 19.4; // wide push: "The chair calls the vote."
TL.hush0 = 21.9; // hall goes quiet; gavel goes up
TL.gavel0 = 22.4; // insert: the gavel
TL.bang = 23.4; // it falls
TL.fade0 = 23.5; // fade to black (1.1 s)
TL.end = 24.7; // black: set comes down, result announced

const mood = (p) => (p >= 0.7 ? 'warm' : p >= 0.4 ? 'unsure' : 'cold'); // menu forecast: likely yes / leaning / unlikely

export class Chamber {
  constructor(game) {
    this.game = game;
    this.active = false; // a scene is running (or fading)
    this.on = false; // the renderer draws the set
    this.ready = null;
    this.t = 0;
    this.fade = 0; this.fadeTo = 0; this.fadeRate = 1; // dip to black (post.js `fade`)
    this.freeze = false; // test hook: holds the scene clock for stills
  }

  // Builds the set and compiles its shaders off-screen (when the council menu opens, so the scene doesn't hitch)
  prepare() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const g = this.game, r = g.renderer;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x120a1e);
      this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 80);
      this.scene.add(new THREE.HemisphereLight(0xcfc6ff, 0x5a4a6a, 1.15));
      const key = new THREE.DirectionalLight(0xfff1d6, 1.7);
      key.position.set(3, 14, 9);
      this.scene.add(key, key.target, chamberKit().root);
      this.populate(SEATS.map((f) => ({ f, p: 0.5 })));
      this.camera.position.set(0, 5, 9); this.camera.lookAt(0, 1.6, -6);
      r.setRenderTarget(g.post.target);
      try { await r.compileAsync(this.scene, this.camera); } catch (e) { console.warn('[chamber] precompile failed', e); }
      r.render(this.scene, this.camera); // first draw uploads text textures and links programs: do it off-screen now
      r.setRenderTarget(null);
      this.clear();
    })();
    return this.ready;
  }

  // the gavel hangs off the councillor's hand (audience's right): handle along the arm's local -z, pointing down with the forearm level
  makeGavel() {
    const grp = new THREE.Group();
    const wood = toon(0x8a5a3a), band = toon(0xffd23f), black = toon(0x0b0612, { side: THREE.BackSide });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 8).rotateX(Math.PI / 2).translate(0, 0, -0.17), wood);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.3, 12).rotateZ(Math.PI / 2).translate(0, 0, -0.34), wood);
    const bands = [0.12, -0.12].map((x) => new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.035, 12).rotateZ(Math.PI / 2).translate(x, 0, -0.34), band));
    for (const m of [handle, head]) { const hull = new THREE.Mesh(m.geometry, black); hull.scale.setScalar(1.18); m.add(hull); }
    grp.add(handle, head, ...bands);
    grp.position.set(0, -0.66, 0.05);
    return grp;
  }

  // The cast. members: [{ f, p }]: delegations present and their odds (drive reactions only, never the ballots)
  populate(members) {
    this.clear();
    const g = new THREE.Group();
    this.cast = g;
    this.people = [];
    const span = (ARC.a1 - ARC.a0) / SEATS.length;
    SEATS.forEach((f, s) => {
      const here = members.find((m) => m.f === f);
      if (!here) return;
      const mid = ARC.a0 + (s + 0.5) * span;
      const spots = [[0, mid], [0, mid - span * 0.27], [0, mid + span * 0.27], [1, mid - span * 0.2], [1, mid + span * 0.2], [2, mid]]; // leader + five staff
      spots.forEach(([ri, a], i) => {
        const row = ROWS[ri], p = pol(row.r, a, row.y);
        const fig = i === 0 ? makeRunner({ ...LEADERS[f].look }) : makeFigure({ ...DELEG[f], seed: s * 17 + i * 5 });
        if (i === 0) fig.root.scale.setScalar(0.95);
        fig.root.position.copy(p);
        fig.root.position.y -= i === 0 ? 0.5 : 0.42; // seated behind the counter (legs sink into the tier, unseen)
        fig.yaw = faceCentre(a);
        fig.root.rotation.y = fig.yaw;
        Object.assign(fig, { f, p: here.p, mood: f === 'kepler' ? 'host' : mood(here.p), seed: Math.random() * 6, leader: i === 0, y0: fig.root.position.y });
        g.add(fig.root);
        this.people.push(fig);
      });
    });
    this.scene.add(g);
  }

  clear() {
    if (!this.cast) return;
    this.cast.removeFromParent();
    for (const f of this.people) f.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    this.cast = null; this.people = [];
  }

  // ---------- play ----------
  // spec: { motion, name, say: [two lines], focus: [factions], town, members: [{ f, p }] }. done() runs once black with the set
  // down (the result is announced there); reveal() brings the picture back, or the "one week later" card covers it (main.js newDawn)
  async play(spec, done) {
    const g = this.game;
    if (this.active) { if (done) done(); return; } // can't happen from the UI (no input in a cutscene)
    this.active = true; this.spec = spec; this.done = done;
    this.phase = 'out'; this.t = 0;
    if (g.player.vehicle) g.garage.exit();
    if (g.rides.ride) g.rides.exit();
    g.state = 'cutscene';
    g.hud.prompt(null);
    document.body.classList.add('council');
    this.dip(1, TL.out);
    try {
      await this.prepare();
      while (this.fade < 1 && this.active) await new Promise((r) => setTimeout(r, 16)); // wait for black
      if (!this.active) return; // the game left the scene while it was building
      this.populate(spec.members);
      this.borrowPlayer();
      this.lines = this.script(spec);
      this.bars = g.recall.bars;
      this.bars.classList.remove('hidden', 'cb-out');
      this.sayEl = this.bars.appendChild(Object.assign(document.createElement('div'), { className: 'cb-say' }));
      this.bangEl = this.bars.appendChild(Object.assign(document.createElement('div'), { className: 'cb-bang', textContent: 'BANG!' }));
      this.bangEl.style.display = 'none';
      this.t = 0; this.faded = false; this.banged = false; this.lastCap = '';
      this.cap(`THE MOON COUNCIL SITS IN ${spec.town.toUpperCase()}`);
      this.phase = 'play'; this.on = true;
      this.dip(0, 0.9);
    } catch (e) { console.error('[chamber] cutscene failed, announcing the vote without it', e); this.finish(); }
  }

  // dip to black (post.js uniform): to = 1 black, 0 clear
  dip(to, secs) { this.fadeTo = to; if (secs <= 0) this.fade = to; else this.fadeRate = 1 / secs; }

  // the speech as [{ t0, t1, text }]: opening, the motion, the call
  script(spec) {
    const say = spec.say || [`I move the ${spec.name}.`, 'Let us hear it.'];
    return [
      { t0: TL.close0 + 0.3, t1: TL.ots0 - 0.2, text: `Members of the Moon Council: thank you for sitting in ${spec.town}.` },
      { t0: TL.ots0 + 0.2, t1: TL.react0 - 0.2, text: say[0] },
      { t0: TL.react0 + 0.2, t1: TL.call0 - 0.2, text: say[1] },
      { t0: TL.call0 + 0.3, t1: TL.hush0 - 0.1, text: 'The chair calls the vote.' },
    ];
  }

  borrowPlayer() {
    const P = this.game.player, m = P.model.root;
    this.home = { parent: m.parent, pos: m.position.clone(), quat: m.quaternion.clone(), scale: m.scale.clone() };
    P.restPose();
    this.scene.add(m);
    m.position.set(0, 0.5, 0.95);
    m.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    m.visible = true;
    P.scarfSim.settle();
    this.gavel = this.gavel || this.makeGavel();
    P.model.armL.add(this.gavel);
  }

  returnPlayer() {
    const P = this.game.player, m = P.model.root;
    if (!this.home) return;
    if (this.gavel) this.gavel.removeFromParent();
    this.home.parent.add(m);
    m.position.copy(this.home.pos); m.quaternion.copy(this.home.quat); m.scale.copy(this.home.scale);
    P.restPose();
    this.home = null;
  }

  // caption (top left): a line plus an optional small one; speech bubble (bottom): the typewriter text
  cap(text, sub = '') {
    const key = text + '|' + sub;
    if (key === this.lastCap || !this.bars) return;
    this.lastCap = key;
    const el = this.bars.querySelector('.cb-cap');
    el.replaceChildren(text);
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; el.append(document.createElement('br'), sm); }
    el.style.display = text ? '' : 'none';
  }
  say(text) {
    if (!this.sayEl) return;
    this.sayEl.style.display = text ? '' : 'none';
    if (text) { const b = document.createElement('b'); b.textContent = 'COUNCILLOR'; this.sayEl.replaceChildren(b, text); }
  }

  // skips to the gavel going up; later presses do nothing, or mashing would hold the scene on that frame
  skip() { if (this.active && this.phase === 'play' && this.t > 1 && this.t < TL.gavel0 - 0.6) this.t = TL.gavel0 - 0.6; }

  // The cinema bars are shared with recall and med-evac (g.recall.bars): hide them, remove the bubble and BANG!, and restore
  // the caption (the gavel shot hid it), or the next recall opens with a stuck BANG! and no caption
  putBarsBack() {
    if (!this.bars) return;
    this.bars.classList.add('hidden');
    for (const el of this.bars.querySelectorAll('.cb-say, .cb-bang')) el.remove();
    const cap = this.bars.querySelector('.cb-cap');
    if (cap) { cap.style.display = ''; cap.textContent = ''; }
    this.bars = this.sayEl = this.bangEl = null;
  }

  // Brings the picture back. secs 0: at once (the "one week later" card covers it)
  reveal(secs) {
    document.body.classList.remove('council');
    this.dip(0, secs);
  }

  // dt: game time (0 under a dialog); rdt: real time (the dip keeps easing under a dialog)
  update(dt, rdt = dt) {
    // the dip always eases (holds black through the announcement, lifts under the dialog after)
    if (this.fade !== this.fadeTo) {
      const d = this.fadeRate * rdt;
      this.fade = this.fadeTo > this.fade ? Math.min(this.fadeTo, this.fade + d) : Math.max(this.fadeTo, this.fade - d);
    }
    if (!this.active || this.phase !== 'play') return;
    const g = this.game;
    if (g.state !== 'cutscene') { this.abort(); return; } // the game left the scene (quit to menu)
    try { this.step(dt); } catch (e) { console.error('[chamber]', e); this.finish(); }
  }

  step(dt) {
    const g = this.game;
    if (g.input.pressed('Space') || g.input.pressed('Enter')) this.skip();
    if (!this.freeze) this.t += dt;
    const t = this.t;
    this.shot(t);
    this.animate(t, dt);
    // typewriter bubble, a blip every other letter
    const L = this.lines.find((l) => t >= l.t0 && t < l.t1);
    if (L) {
      const n = Math.min(L.text.length, Math.floor((t - L.t0) * 34));
      if (n !== L.n) { if (n % 2 === 0) g.audio.tone(260 + Math.random() * 120, 0.03, 'square', 0.025); L.n = n; this.say(L.text.slice(0, n)); }
    } else this.say(null);
    let cheer = false; // one roar a frame: a skip passes several lines at once, and stacked roars are too loud
    for (const l of this.lines) if (t >= l.t1 && !l.cheered && t > TL.close0 && t < TL.hush0) { l.cheered = true; cheer = true; }
    if (cheer && this.people.some((p) => p.mood === 'warm' || p.mood === 'host')) g.audio.roar(0.3);
    if (t >= TL.bang && !this.banged) {
      this.banged = true;
      g.audio.thud(40); g.audio.tone(150, 0.12, 'square', 0.25, 0.4);
      this.bangEl.style.display = ''; this.bangEl.style.animation = 'none'; void this.bangEl.offsetWidth; this.bangEl.style.animation = '';
    }
    if (t >= TL.fade0 && !this.faded) { this.faded = true; this.dip(1, TL.end - TL.fade0); }
    if (t >= TL.end) this.finish();
  }

  // ---------- camera ----------
  shot(t) {
    const cam = this.camera;
    const S = this.spec;
    let pos, look, fov = 50;
    const present = SEATS.filter((f) => this.people.some((p) => p.f === f));
    const angleOf = (f) => ARC.a0 + (SEATS.indexOf(f) + 0.5) * ((ARC.a1 - ARC.a0) / SEATS.length);
    if (t < TL.pan0) { // establishing: tilt down from the dome, crane in over the doors
      const u = ease(t / TL.pan0);
      pos = lerp3(V3(0, 3.2, 12.2), V3(0, 5.6, 9.2), u); look = lerp3(V3(0, 12.5, -2), V3(0, 2.0, -6), ease(clamp01(t / 3.2))); fov = lerp(62, 52, u);
    } else if (t < TL.close0) { // low track along the dais ring past each delegation
      const u = clamp01((t - TL.pan0) / (TL.close0 - TL.pan0)), a = lerp(ARC.a0 + 0.3, ARC.a1 - 0.3, u);
      pos = pol(3.5, a, 1.75); look = pol(9.6, a, 2.7); fov = 60;
      const f = SEATS[Math.min(4, Math.floor(((a - ARC.a0) / (ARC.a1 - ARC.a0)) * 5))];
      if (present.includes(f)) this.cap(LEADERS[f].name.toUpperCase(), LEADERS[f].title);
      else this.cap(`${FACTIONS[f].name.toUpperCase()}: THE SEAT STANDS EMPTY`);
    } else if (t < TL.ots0) { // councillor from the front, low, dome behind
      const u = ease((t - TL.close0) / (TL.ots0 - TL.close0));
      pos = lerp3(V3(-1.5, 1.5, -2.9), V3(-0.9, 1.75, -2.2), u); look = lerp3(V3(0, 3.2, 0.95), V3(0, 2.7, 0.95), u); fov = lerp(48, 42, u);
      this.cap(`COUNCILLOR OF ${S.town.toUpperCase()}`);
    } else if (t < TL.react0) { // over the shoulder: the audience
      const u = ease((t - TL.ots0) / (TL.react0 - TL.ots0));
      pos = lerp3(V3(2.3, 3.2, 4.3), V3(1.9, 3.1, 3.6), u); look = lerp3(V3(-0.8, 2.2, -8), V3(-0.3, 2.2, -8), u); fov = lerp(52, 48, u);
      this.cap(`MOTION: ${S.name.toUpperCase()}`);
    } else if (t < TL.call0) { // two reaction cuts on the targeted delegations
      const foc = (S.focus || []).filter((f) => present.includes(f));
      const list = foc.length ? foc : present.slice(0, 2);
      const half = (TL.call0 - TL.react0) / 2;
      const which = list[Math.min(list.length - 1, Math.floor((t - TL.react0) / half))] || present[0];
      const a = angleOf(which), u = clamp01(((t - TL.react0) % half) / half);
      pos = lerp3(pol(3.2, a + 0.5, 1.45), pol(3.2, a + 0.3, 1.6), u); look = pol(7.8, a, 2.35); fov = 46;
      this.cap(FACTIONS[which].name.toUpperCase());
    } else if (t < TL.gavel0) { // the call: slow push in from behind the councillor
      const u = ease((t - TL.call0) / (TL.gavel0 - TL.call0));
      pos = lerp3(V3(2.6, 3.8, 4.6), V3(2.0, 3.3, 3.5), u); look = V3(-0.4, 2.2, -8); fov = lerp(54, 48, u);
      this.cap('THE CLERK COLLECTS THE BALLOTS…');
    } else { // the gavel, close, from the floor
      pos = V3(0.9, 2.35, -1.6); look = V3(0.32, 1.9, 0.4); fov = 32;
      this.cap('');
      if (t >= TL.bang && t < TL.bang + 0.3) { const k = (1 - (t - TL.bang) / 0.3) * 0.06 * (this.game.settings && this.game.settings.v ? this.game.settings.v.shake ?? 1 : 1); pos.x += (Math.random() - 0.5) * k; pos.y += (Math.random() - 0.5) * k; } // hit shakes the camera, scaled by the Screen shake setting
    }
    cam.position.copy(pos); cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 0.01) cam.fov = fov;
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }

  // ---------- people ----------
  animate(t, dt) {
    const P = this.game.player, m = P.model;
    const ends = this.lines.map((l) => l.t1);
    const hush = t >= TL.hush0;
    const speaking = this.lines.some((l) => t >= l.t0 && t < l.t1);
    const foc = new Set(this.spec.focus || []);
    const sinceEnd = Math.min(...ends.map((e) => (t - e >= 0 ? t - e : 99))); // s since the last line ended
    const applaud = !hush && sinceEnd < 1.3 && t > TL.close0;
    for (const f of this.people) {
      const a = f.seed + t;
      let rx = 0, ry = 0, ax = -1.0, az = 0.12, bx = -1.0, bz = -0.12;
      if (hush) { /* hands on the desk: silence */ }
      else if (f.mood === 'host') { // your delegation: leans in, applauds every beat
        rx = 0.03 * Math.sin(a * 2.2);
        if (applaud) { const c = Math.sin(a * 26); ax = bx = -1.25; az = 0.28 + 0.2 * c; bz = -az; }
      } else if (f.mood === 'warm') { // nods along; polite applause
        rx = speaking ? 0.06 * Math.sin(a * 2.6) : 0.02;
        if (applaud) { const c = Math.sin(a * 22); ax = bx = -1.25; az = 0.26 + 0.2 * c; bz = -az; }
      } else if (f.mood === 'unsure') { // glances about, hands on the desk
        ry = 0.22 * Math.sin(a * 0.8);
        if (speaking && foc.has(f.f)) rx = 0.03 * Math.sin(a * 1.4);
      } else { // cold: arms crossed, head shake when targeted
        ax = -1.05; az = 0.85; bx = -1.05; bz = -0.85;
        if (speaking && foc.has(f.f)) ry = 0.25 * Math.sin(a * 6.5);
      }
      f.root.rotation.set(rx, f.yaw + ry, 0);
      f.root.position.y = f.y0 + 0.006 * Math.sin(a * 1.7);
      f.armL.rotation.set(ax, 0, az); f.armR.rotation.set(bx, 0, bz);
    }
    // councillor: speaking hand (audience's left), looks along the rows; the other arm holds the gavel
    const sp = speaking ? 1 : 0;
    m.armR.rotation.set(lerp(-0.9, -1.45 + 0.3 * Math.sin(t * 2.6), sp), 0, -0.2);
    let th = -0.95; // gavel arm: rests on the lectern, up at the hush, down at the bang, small rebound
    if (t >= TL.hush0 - 0.1) th = lerp(-0.95, -2.55, ease((t - (TL.hush0 - 0.1)) / 0.7));
    if (t >= TL.bang - 0.14) th = lerp(-2.55, -1.5, clamp01((t - (TL.bang - 0.14)) / 0.14) ** 2);
    if (t >= TL.bang) th = lerp(-1.5, -1.8, ease((t - TL.bang) / 0.3));
    m.armL.rotation.set(th, 0, 0.12);
    m.head.rotation.y = hush ? 0 : 0.45 * Math.sin(t * 0.7);
    P.scarfSim.update(dt, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  }

  // fully black: take the set down, hand over to the announcement (black until reveal())
  finish() {
    if (!this.active) return;
    const g = this.game;
    this.on = false;
    this.clear();
    this.returnPlayer();
    g.state = 'play';
    this.putBarsBack();
    this.active = false; this.phase = null;
    this.dip(1, 0); // a failed scene may not be dark yet
    g.updateCamera(0.016, true);
    const cb = this.done; this.done = null;
    if (cb) cb();
  }

  // ends with no result to announce (the game went to the menu mid-scene)
  abort() {
    this.on = false; this.clear(); this.returnPlayer();
    this.putBarsBack();
    this.active = false; this.phase = null; this.done = null;
    this.reveal(0);
  }
}
