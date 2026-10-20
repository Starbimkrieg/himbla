import { mulberry32 } from './rng.js';

// Zero-G claw simulation (casino claw machine; model build_claw.py, game casinoGames.js, drawing clawView.js).
// No three.js here, so tools/check-claw.mjs can bot thousands of rounds to tune payout against the entry price.
//
// Floating things in a tank, machine frame (x along the tank, y up, z toward the glass). Fly the claw (heavy, with inertia)
// in 3D; hold the BEAM to pull things under it to its tip (up to HOLD_CAP weight). Release over the DROP hole to bank.
//   chains    paired things: take one and the other follows (a spring)
//   magnets   a MAGNET pulls steel (cogs, girders, hull plates, mines, lockboxes, engine), holds up to five: one grab takes the clump
//   blasts    a MINE hit hard explodes: scatters things, sets off fuel canisters (chaining), pops lockboxes (one holds the
//             LUCKY CHIP jackpot), stuns a nearby claw. Banking a mine costs you
//   combo     banks within 5 s build a multiplier (x1.25 a step, to x2.5); three of a kind in a row pay a set bonus
// Each round shuffle() deals a new mix, layout, jackpot spot and mood (CALM, LOW DRIFT, STORM, SURGE).

export const CLAW_COST = 200;           // entry (credits)
export const CLAW_TIME = 45;            // round length (s)
export const HOLD_CAP = 3;              // beam weight capacity
export const TANK = { x0: -7.5, x1: 7.5, y0: 1.5, y1: 6.35, z0: 0.5, z1: 3.3 };
export const DROP = { x: -3.4, y: 1.46, z: 2.3, r: 0.72 };
export const CLAW_HOME = { x: 0, y: 6.0, z: 1.9 };
export const MOODS = ['CALM', 'LOW DRIFT', 'STORM', 'SURGE'];
const CLAW_R = 0.42, CLAW_DY = -0.1;     // claw collision ball radius and its offset below the position
const BEAM_RANGE = 3.2, CHAIN_LEN = 1.55, MAGNET_RANGE = 2.9, MAGNET_MAX = 5, MAGNET_TIME = 12;
const COMBO_WINDOW = 5, COMBO_STEP = 0.25, COMBO_MAX = 2.5, SET_BONUS = 1.5;
const MINE_PENALTY = 30;
const DT = 1 / 60;

// r: collision radius; w: beam weight; value: credits banked; rest: bounciness
export const KINDS = {
  crate:    { r: 0.52, mass: 1.0, w: 1,   value: 4,  rest: 0.55, model: 'crate' },
  canister: { r: 0.46, mass: 0.9, w: 1,   value: 6,  rest: 0.5,  model: 'canister', fuel: true },
  gear:     { r: 0.50, mass: 1.2, w: 1,   value: 5,  rest: 0.45, model: 'gear', steel: true, cog: true },
  girder:   { r: 0.80, mass: 2.0, w: 2,   value: 10,  rest: 0.4,  model: 'girder', steel: true },
  mine:     { r: 0.58, mass: 1.5, w: 1,   value: -MINE_PENALTY, rest: 0.5, model: 'mine', steel: true, mine: true },
  magnet:   { r: 0.50, mass: 1.0, w: 1,   value: 7,  rest: 0.5,  model: 'magnet', magnet: true },
  tyre:     { r: 0.58, mass: 0.7, w: 1,   value: 3,  rest: 0.95, model: 'tyre' },
  hullplate:{ r: 0.58, mass: 1.3, w: 1,   value: 5,  rest: 0.4,  model: 'hullplate', steel: true },
  lockbox:  { r: 0.62, mass: 2.2, w: 2,   value: 10,  rest: 0.35, model: 'lockbox', steel: true, lock: true },
  gem:      { r: 0.30, mass: 0.3, w: 0.5, value: 12,  rest: 0.7,  model: 'gem' },
  engine:   { r: 0.95, mass: 5.0, w: 3,   value: 35, rest: 0.3,  model: 'engine', steel: true },
  case:     { r: 0.58, mass: 1.0, w: 1,   value: 30, rest: 0.45, model: 'case' },
  chip:     { r: 0.80, mass: 2.0, w: 2,   value: 500, rest: 0.5, model: 'chip', jackpot: true },
};
// tank mix: [kind, min, max, chance of any]
const MIX = [['crate', 5, 9, 1], ['canister', 2, 5, 1], ['gear', 3, 6, 1], ['girder', 1, 3, 1], ['magnet', 1, 2, 0.8], ['tyre', 2, 4, 1], ['hullplate', 2, 4, 1],
  ['lockbox', 1, 3, 1], ['mine', 2, 4, 1], ['gem', 3, 7, 1], ['engine', 1, 1, 0.45], ['case', 1, 2, 0.5]];
const CHAINABLE = ['crate', 'canister', 'gear', 'tyre', 'hullplate'];
const CRATE_TINTS = [0xff9f1c, 0x2ee6ff, 0x7dff6a, 0xff2e88, 0xc77dff, 0xffd23f];

let nextId = 1;
// renormalise a thing's orientation quaternion (qx, qy, qz, qw) in place
export function normQ(o) { const n = Math.hypot(o.qx, o.qy, o.qz, o.qw) || 1; o.qx /= n; o.qy /= n; o.qz /= n; o.qw /= n; }

export class ClawSim {
  constructor(seed = 1) {
    this.items = [];
    this.links = [];      // chains: { a, b }
    this.stuck = [];      // steel held by a magnet: { m, s, t }
    this.events = [];
    this.claw = { x: CLAW_HOME.x, y: CLAW_HOME.y, z: CLAW_HOME.z, vx: 0, vy: 0, vz: 0, stun: 0, beam: false, energy: 1, spin: 0 };
    this.state = 'idle';  // 'idle' | 'play' | 'over'
    this.timeLeft = CLAW_TIME;
    this.acc = 0;
    this.bank = 0;
    this.combo = 0;
    this.comboT = 0;
    this.recent = [];     // last kinds banked, newest first
    this.shuffle(seed);
  }

  emit(e) { this.events.push(e); }

  // ---------- the deal ----------
  // A new tank dealt from `seed`. Returns the old items for the view to fade out.
  shuffle(seed = (Math.random() * 1e9) | 0, intro = false) {
    const old = this.items.filter((i) => i.st !== 'out');
    const rng = mulberry32(seed);
    this.rng = rng;
    this.tank = 1000 + (seed % 9000);
    this.mood = Math.floor(rng() * MOODS.length);
    this.moodT = 18 + rng() * 10;     // SURGE time
    this.items = [];
    this.links = [];
    this.stuck = [];
    const want = [];
    for (const [kind, lo, hi, p] of MIX) if (rng() < p) for (let n = lo + Math.floor(rng() * (hi - lo + 1)); n > 0; n--) want.push(kind);
    // jackpot: in a lockbox if there is one, else loose
    const inBox = want.includes('lockbox');
    if (!inBox) want.push('chip');
    for (let i = want.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [want[i], want[j]] = [want[j], want[i]]; }
    for (const kind of want) this.spawn(kind, this.place(KINDS[kind].r), { rng });
    if (intro) for (const it of this.items) it.age = -(1.4 + rng() * 0.9);       // dealt after the old tank goes: the view grows each in at age 0
    if (inBox) { const bx = this.items.filter((i) => i.kind === 'lockbox'); bx[Math.floor(rng() * bx.length)].inside = 'chip'; }
    // other boxes' contents
    for (const b of this.items) if (b.kind === 'lockbox' && !b.inside) b.inside = rng() < 0.5 ? 'gems' : rng() < 0.5 ? 'case' : 'gems';
    // chains: 1 to 3 pairs of nearby chainables
    const cand = this.items.filter((i) => CHAINABLE.includes(i.kind));
    for (let n = 1 + Math.floor(rng() * 3); n > 0 && cand.length > 1; n--) {
      const a = cand.splice(Math.floor(rng() * cand.length), 1)[0];
      let best = null, bd = 1e9;
      for (const b of cand) { const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); if (d < bd) { bd = d; best = b; } }
      if (best) { cand.splice(cand.indexOf(best), 1); this.links.push({ a, b: best }); }
    }
    this.claw.stun = 0; this.claw.beam = false; this.claw.energy = 1;
    this.emit({ type: 'shuffle', tank: this.tank, mood: this.mood });
    return old;
  }

  place(r) {
    const rng = this.rng;
    for (let t = 0; t < 80; t++) {
      const p = { x: TANK.x0 + r + rng() * (TANK.x1 - TANK.x0 - 2 * r), y: TANK.y0 + r + 0.3 + rng() * (TANK.y1 - TANK.y0 - 2 * r - 1.9), z: TANK.z0 + r + rng() * (TANK.z1 - TANK.z0 - 2 * r) };
      if (Math.hypot(p.x - DROP.x, p.z - DROP.z) < 1.8 && p.y < 3.4) continue;     // keep the DROP hole clear
      if (this.items.every((o) => Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) > o.r + r + 0.08)) return p;
    }
    return { x: TANK.x0 + r + rng() * (TANK.x1 - TANK.x0 - 2 * r), y: TANK.y0 + 1 + rng() * 3, z: TANK.z0 + r + rng() * (TANK.z1 - TANK.z0 - 2 * r) };
  }

  spawn(kind, p, { rng = this.rng, v = null } = {}) {
    const K = KINDS[kind];
    const it = {
      id: nextId++, kind, r: K.r, mass: K.mass, x: p.x, y: p.y, z: p.z,
      vx: v ? v.x : (rng() - 0.5) * 0.5, vy: v ? v.y : (rng() - 0.5) * 0.5, vz: v ? v.z : (rng() - 0.5) * 0.5,
      qx: 0, qy: 0, qz: 0, qw: 1, wx: (rng() - 0.5) * 0.8, wy: (rng() - 0.5) * 0.8, wz: (rng() - 0.5) * 0.8,
      st: 'free', slot: -1, fuse: -1, spin: 0, tint: kind === 'crate' ? CRATE_TINTS[Math.floor(rng() * CRATE_TINTS.length)] : 0, inside: null, age: 0,
    };
    // random orientation
    const a = rng() * 6.283, b = Math.acos(2 * rng() - 1), c = rng() * 6.283;
    const s1 = Math.sin(b / 2), c1 = Math.cos(b / 2);
    it.qx = s1 * Math.cos(a); it.qy = s1 * Math.sin(a); it.qz = c1 * Math.sin(c); it.qw = c1 * Math.cos(c);
    normQ(it);
    this.items.push(it);
    return it;
  }

  // ---------- a round ----------
  start() {
    if (this.state === 'play') return;
    this.state = 'play';
    this.timeLeft = CLAW_TIME;
    this.bank = 0; this.combo = 0; this.comboT = 0; this.recent = [];
    this.claw.energy = 1;
    this.surged = false; this.surgeT = 0;
    this.emit({ type: 'start' });
  }

  end() {
    this.state = 'over';
    this.claw.beam = false;
    for (const it of this.holding) this.release(it);
    this.emit({ type: 'end', bank: this.payout });
  }

  get payout() { return Math.max(0, Math.round(this.bank)); }
  get holding() { return this.items.filter((i) => i.st === 'held'); }
  get heldWeight() { return this.holding.reduce((w, i) => w + KINDS[i.kind].w, 0); }
  get comboMult() { return Math.min(COMBO_MAX, 1 + COMBO_STEP * Math.max(0, this.combo - 1)); }

  // ---------- the step ----------
  update(dt, input = {}) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= DT && n++ < 6) { this.acc -= DT; this.step(DT, input); }
  }

  step(dt, input) {
    const c = this.claw;
    const playing = this.state === 'play';
    if (playing) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.end(); }
    }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    // ---- the claw ----
    const ctl = playing && c.stun <= 0 ? input : {};
    const ax = (ctl.mx || 0) * 18, ay = (ctl.my || 0) * 14, az = (ctl.mz || 0) * 18;
    c.vx += ax * dt; c.vy += ay * dt; c.vz += az * dt;
    const drag = Math.exp(-(ax || ay || az ? 1.6 : 3.0) * dt);
    c.vx *= drag; c.vy *= drag; c.vz *= drag;
    const sp = Math.hypot(c.vx, c.vy, c.vz);
    if (sp > 6) { c.vx *= 6 / sp; c.vy *= 6 / sp; c.vz *= 6 / sp; }
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    if (c.x < TANK.x0 + 0.6) { c.x = TANK.x0 + 0.6; c.vx = Math.max(0, c.vx); } else if (c.x > TANK.x1 - 0.6) { c.x = TANK.x1 - 0.6; c.vx = Math.min(0, c.vx); }
    if (c.y < TANK.y0 + 1.5) { c.y = TANK.y0 + 1.5; c.vy = Math.max(0, c.vy); } else if (c.y > TANK.y1 - 0.35) { c.y = TANK.y1 - 0.35; c.vy = Math.min(0, c.vy); }
    if (c.z < TANK.z0 + 0.55) { c.z = TANK.z0 + 0.55; c.vz = Math.max(0, c.vz); } else if (c.z > TANK.z1 - 0.5) { c.z = TANK.z1 - 0.5; c.vz = Math.min(0, c.vz); }
    if (c.stun > 0) { c.stun -= dt; c.spin += dt * 9; }
    const wantBeam = !!ctl.beam && playing && c.energy > 0.02;
    if (wantBeam !== c.beam) { c.beam = wantBeam; this.emit({ type: wantBeam ? 'beamOn' : 'beamOff' }); if (!wantBeam) for (const it of this.holding) this.release(it); }
    c.energy = Math.max(0, Math.min(1, c.energy + (c.beam ? -0.09 : 0.35) * dt));
    if (c.beam && c.energy <= 0) { c.beam = false; this.emit({ type: 'overheat' }); for (const it of this.holding) this.release(it); }
    // ---- the mood ----
    const damp = this.mood === 1 ? 1.1 : 0.2;
    if (playing && this.mood === 2) { this.stormT = (this.stormT || 0) - dt; if (this.stormT <= 0) { this.stormT = 2.2; this.storm(); } }
    if (playing && this.mood === 3) {
      this.moodT -= dt;
      if (this.moodT <= 0 && !this.surged) { this.surged = true; this.surgeT = 2.4; this.emit({ type: 'surge' }); }
    }
    if (!playing) { this.idleT = (this.idleT || 0) - dt; if (this.idleT <= 0) { this.idleT = 3; this.nudge(); } }
    let g = 0;
    if (this.surgeT > 0) { this.surgeT -= dt; g = -9 * Math.min(1, this.surgeT / 0.4); }
    // ---- the things ----
    const live = [];
    for (const it of this.items) {
      it.age += dt;
      if (it.st === 'out') continue;
      live.push(it);
      if (it.fuse >= 0) {
        it.fuse -= dt;
        if (it.fuse < 0) { const m = KINDS[it.kind].mine; this.explode(it, m ? 2.9 : 2.2, m ? 8.5 : 6.5); continue; }
      }
      if (it.st === 'held') { this.holdStep(it, dt); this.rotate(it, dt); continue; }
      if (g) it.vy += g * dt;
      const k = Math.exp(-damp * dt);
      it.vx *= k; it.vy *= k; it.vz *= k;
      if (it.cog) it.spin *= Math.exp(-0.5 * dt);
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      this.walls(it);
      this.rotate(it, dt);
    }
    // beam, magnets, chains, the drop hole
    if (c.beam) this.beam(live, dt);
    this.magnets(live, dt);
    this.chains(live, dt);
    this.suction(live, dt);
    // collisions
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (live[i].st !== 'out' && live[j].st !== 'out') this.collide(live[i], live[j]);
    for (const it of live) if (it.st === 'free') this.clawHit(it);
    this.items = this.items.filter((i) => i.st !== 'out');
  }

  nudge() {
    const free = this.items.filter((i) => i.st === 'free');
    if (!free.length) return;
    const it = free[Math.floor(Math.random() * free.length)];
    it.vx += (Math.random() - 0.5) * 1.2; it.vy += (Math.random() - 0.5) * 1.2; it.vz += (Math.random() - 0.5) * 0.8;
  }

  storm() {
    const rng = this.rng;
    for (const it of this.items) if (it.st === 'free' && rng() < 0.35) { it.vx += (rng() - 0.5) * 3.2; it.vy += (rng() - 0.5) * 3.2; it.vz += (rng() - 0.5) * 2.2; }
  }

  walls(it) {
    const r = it.r, e = KINDS[it.kind].rest * 0.9;
    if (it.x < TANK.x0 + r) { it.x = TANK.x0 + r; if (it.vx < 0) it.vx = -it.vx * e; } else if (it.x > TANK.x1 - r) { it.x = TANK.x1 - r; if (it.vx > 0) it.vx = -it.vx * e; }
    if (it.y < TANK.y0 + r) { it.y = TANK.y0 + r; if (it.vy < 0) it.vy = -it.vy * e; } else if (it.y > TANK.y1 - r) { it.y = TANK.y1 - r; if (it.vy > 0) it.vy = -it.vy * e; }
    if (it.z < TANK.z0 + r) { it.z = TANK.z0 + r; if (it.vz < 0) it.vz = -it.vz * e; } else if (it.z > TANK.z1 - r) { it.z = TANK.z1 - r; if (it.vz > 0) it.vz = -it.vz * e; }
  }

  rotate(it, dt) {
    const k = it.st === 'held' ? Math.exp(-3 * dt) : Math.exp(-0.25 * dt);
    it.wx *= k; it.wy *= k; it.wz *= k;
    const hx = it.wx * dt * 0.5, hy = it.wy * dt * 0.5, hz = it.wz * dt * 0.5;
    const qx = it.qx, qy = it.qy, qz = it.qz, qw = it.qw;
    it.qx += hx * qw + hy * qz - hz * qy; it.qy += -hx * qz + hy * qw + hz * qx; it.qz += hx * qy - hy * qx + hz * qw; it.qw += -hx * qx - hy * qy - hz * qz;
    normQ(it);
  }

  // ---------- the beam ----------
  holdOffset(slot, r) {
    const y = -(0.55 + r);
    return slot === 0 ? [0, y, 0] : slot === 1 ? [0.95, y + 0.2, 0.15] : [-0.95, y + 0.2, -0.15];
  }

  holdStep(it, dt) {
    const c = this.claw, o = this.holdOffset(it.slot, it.r);
    const tx = c.x + o[0], ty = c.y + o[1], tz = c.z + o[2];
    const k = Math.min(1, 14 * dt);
    it.x += (tx - it.x) * k; it.y += (ty - it.y) * k; it.z += (tz - it.z) * k;
    it.vx = c.vx; it.vy = c.vy; it.vz = c.vz;
  }

  beam(live, dt) {
    const c = this.claw;
    for (const it of live) {
      if (it.st !== 'free') continue;
      const dx = c.x - it.x, dz = c.z - it.z, dy = c.y - it.y;
      const h = Math.hypot(dx, dz);
      if (dy < 0.1 || dy > BEAM_RANGE + it.r) continue;
      if (h > 0.7 + 0.2 * dy + it.r * 0.5) continue;
      // pulled toward the tip; heavy things come slowly
      const o = this.holdOffset(0, it.r);
      const tx = c.x + o[0], ty = c.y + o[1], tz = c.z + o[2];
      const px = tx - it.x, py = ty - it.y, pz = tz - it.z, pd = Math.hypot(px, py, pz) || 1;
      const a = Math.min(26, 11 + 9 / pd) / Math.sqrt(it.mass);
      it.vx += (px / pd) * a * dt; it.vy += (py / pd) * a * dt; it.vz += (pz / pd) * a * dt;
      const rv = Math.min(1, 2.6 * dt);
      it.vx += (c.vx - it.vx) * rv * 0.5; it.vy += (c.vy - it.vy) * rv * 0.5; it.vz += (c.vz - it.vz) * rv * 0.5;
      const ps = Math.hypot(it.vx - c.vx, it.vy - c.vy, it.vz - c.vz);       // cap relative speed: the beam doesn't fling
      if (ps > 3.4) { const k = 3.4 / ps; it.vx = c.vx + (it.vx - c.vx) * k; it.vy = c.vy + (it.vy - c.vy) * k; it.vz = c.vz + (it.vz - c.vz) * k; }
      if (pd < it.r * 0.6 + 0.45 && this.heldWeight + KINDS[it.kind].w <= HOLD_CAP + 1e-6) {
        let slot = 0;
        while (this.items.some((q) => q.st === 'held' && q.slot === slot)) slot++;
        if (slot < 3) { it.st = 'held'; it.slot = slot; this.emit({ type: 'grab', item: it }); }
      }
    }
  }

  release(it) {
    it.st = 'free'; it.slot = -1; it.rel = 4;      // the DROP hole takes it for 4 s
    this.emit({ type: 'release', item: it });
  }

  // ---------- the DROP hole ----------
  suction(live, dt) {
    for (const it of live) {
      if (it.rel > 0) it.rel -= dt;
      if (it.st !== 'free' || !(it.rel > 0)) continue;
      const dx = DROP.x - it.x, dz = DROP.z - it.z, h = Math.hypot(dx, dz);
      if (h > 2.4 || it.y > 3.8) continue;
      const ty = DROP.y + 0.35, dy = ty - it.y, d = Math.hypot(dx, dy, dz) || 1;
      const a = 30 * (1 - Math.min(1, h / 2.4)) + 4;
      it.vx += (dx / d) * a * dt; it.vy += (dy / d) * a * dt; it.vz += (dz / d) * a * dt;
      it.vx *= 1 - 1.5 * dt; it.vz *= 1 - 1.5 * dt;
      if (h < 0.5 + it.r * 0.5 && it.y < DROP.y + 0.8 + it.r) this.bankItem(it);
    }
  }

  bankItem(it) {
    const K = KINDS[it.kind];
    it.st = 'out';
    this.cutLinks(it);
    // its chain partner follows
    let value = K.value, tags = [];
    if (K.mine) {
      this.bank = Math.max(0, this.bank - MINE_PENALTY);
      this.emit({ type: 'bank', item: it, value: -MINE_PENALTY, mult: 1, tags: ['MINE!'], x: DROP.x, y: DROP.y + 0.5, z: DROP.z });
      this.emit({ type: 'boom', x: DROP.x, y: DROP.y + 0.8, z: DROP.z, r: 1.6, dull: true });
      this.recent = [];
      return;
    }
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = COMBO_WINDOW;
    let mult = this.comboMult;
    this.recent.unshift(it.kind);
    this.recent.length = Math.min(this.recent.length, 3);
    if (this.recent.length === 3 && this.recent.every((k) => k === it.kind) && !K.jackpot) { mult *= SET_BONUS; tags.push('SET OF 3!'); this.recent = []; }
    if (mult > 1.01) tags.unshift(`x${(Math.round(mult * 100) / 100).toString()}`);
    value = Math.round(value * mult);
    if (K.jackpot) tags.push('JACKPOT!');
    this.bank += value;
    this.emit({ type: 'bank', item: it, value, mult, tags, x: DROP.x, y: DROP.y + 0.5, z: DROP.z });
  }

  // ---------- chains and magnets ----------
  cutLinks(it) {
    this.links = this.links.filter((l) => l.a !== it && l.b !== it);
    this.stuck = this.stuck.filter((s) => s.m !== it && s.s !== it);
  }

  chains(live, dt) {
    for (const l of this.links) {
      const a = l.a, b = l.b;
      if (a.st === 'out' || b.st === 'out') continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d <= CHAIN_LEN) continue;
      this.spring(a, b, dx / d, dy / d, dz / d, d - CHAIN_LEN, 48, 5, dt);
    }
    for (const s of this.stuck) {
      const a = s.m, b = s.s;
      if (a.st === 'out' || b.st === 'out') continue;
      const rest = a.r + b.r + 0.06;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1;
      this.spring(a, b, dx / d, dy / d, dz / d, d - rest, 90, 9, dt);
    }
  }

  spring(a, b, nx, ny, nz, stretch, k, damp, dt) {
    const ia = a.st === 'held' ? 0 : 1 / a.mass, ib = b.st === 'held' ? 0 : 1 / b.mass, s = ia + ib;
    if (!s) return;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
    const f = (k * stretch + damp * rv) * dt;
    const fa = f * ia, fb = f * ib;       // equal force, scaled by each inverse mass
    a.vx += nx * fa; a.vy += ny * fa; a.vz += nz * fa;
    b.vx -= nx * fb; b.vy -= ny * fb; b.vz -= nz * fb;
  }

  magnets(live, dt) {
    for (const s of this.stuck) { s.t += dt; }
    this.stuck = this.stuck.filter((s) => s.t < MAGNET_TIME && s.m.st !== 'out' && s.s.st !== 'out');
    for (const m of live) {
      if (!KINDS[m.kind].magnet || m.st === 'out') continue;
      let count = this.stuck.filter((s) => s.m === m).length;
      for (const it of live) {
        if (it === m || it.st !== 'free' || !KINDS[it.kind].steel) continue;
        if (this.stuck.some((s) => s.s === it)) continue;
        const dx = m.x - it.x, dy = m.y - it.y, dz = m.z - it.z, d = Math.hypot(dx, dy, dz) || 1;
        if (d > MAGNET_RANGE) continue;
        const a = 9 * (1 - d / MAGNET_RANGE) / Math.sqrt(it.mass);
        it.vx += (dx / d) * a * dt; it.vy += (dy / d) * a * dt; it.vz += (dz / d) * a * dt;
        if (d < m.r + it.r + 0.12 && count < MAGNET_MAX) { this.stuck.push({ m, s: it, t: 0 }); count++; this.emit({ type: 'stick', item: it, to: m }); }
      }
    }
  }

  // ---------- collisions ----------
  collide(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, rr = a.r + b.r;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d, nz = dz / d;
    const ia = a.st === 'held' ? 0 : 1 / a.mass, ib = b.st === 'held' ? 0 : 1 / b.mass, s = ia + ib;
    if (!s) return;
    const over = rr - d;
    a.x -= nx * over * ia / s; a.y -= ny * over * ia / s; a.z -= nz * over * ia / s;
    b.x += nx * over * ib / s; b.y += ny * over * ib / s; b.z += nz * over * ib / s;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
    if (vn >= 0) return;
    const e = Math.min(KINDS[a.kind].rest, KINDS[b.kind].rest);
    const j = -(1 + e) * vn / s;
    a.vx -= nx * j * ia; a.vy -= ny * j * ia; a.vz -= nz * j * ia;
    b.vx += nx * j * ib; b.vy += ny * j * ib; b.vz += nz * j * ib;
    // spin from the graze
    const tx = (b.vx - a.vx) - nx * vn, ty = (b.vy - a.vy) - ny * vn, tz = (b.vz - a.vz) - nz * vn;
    a.wx += (ny * tz - nz * ty) * 0.3 / a.r; a.wy += (nz * tx - nx * tz) * 0.3 / a.r; a.wz += (nx * ty - ny * tx) * 0.3 / a.r;
    b.wx += (ny * tz - nz * ty) * 0.3 / b.r; b.wy += (nz * tx - nx * tz) * 0.3 / b.r; b.wz += (nx * ty - ny * tx) * 0.3 / b.r;
    const sp = -vn;
    if (sp > 1.2) this.emit({ type: 'hit', speed: sp, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
    // cogs turn each other
    if (a.cog && b.cog) { const w = Math.max(1.5, Math.min(9, sp * 3)); a.spin = a.spin || w; b.spin = -(a.spin) * 0.95; }
    // hard-hit mines go off
    const thr = (a.st === 'held' || b.st === 'held') ? 3.6 : 4.5;
    if (sp > thr) { const why = `hit ${a.kind}/${b.kind} ${a.st}/${b.st}`; if (KINDS[a.kind].mine && !KINDS[b.kind].magnet) this.fuseMine(a, why); if (KINDS[b.kind].mine && !KINDS[a.kind].magnet) this.fuseMine(b, why); }
  }

  clawHit(it) {
    const c = this.claw, cy = c.y + CLAW_DY;
    const dx = it.x - c.x, dy = it.y - cy, dz = it.z - c.z, rr = it.r + CLAW_R, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d, nz = dz / d;
    it.x += nx * (rr - d); it.y += ny * (rr - d); it.z += nz * (rr - d);
    const vn = (it.vx - c.vx) * nx + (it.vy - c.vy) * ny + (it.vz - c.vz) * nz;
    if (vn >= 0) return;
    const j = -(1.4) * vn;
    it.vx += nx * j; it.vy += ny * j; it.vz += nz * j;
    if (-vn > 3.2 && KINDS[it.kind].mine) this.fuseMine(it, 'claw');
    if (-vn > 1.2) this.emit({ type: 'hit', speed: -vn, x: it.x, y: it.y, z: it.z });
  }

  // ---------- blasts ----------
  fuseMine(m, why = '') { if (m.fuse < 0) { m.fuse = 0.12; this.emit({ type: 'fuse', why, item: m }); } }

  explode(src, R, force) {
    const x = src.x, y = src.y, z = src.z;
    src.st = 'out';
    this.cutLinks(src);
    this.emit({ type: 'boom', x, y, z, r: R, kind: src.kind });
    for (const it of this.items) {
      if (it === src || it.st === 'out') continue;
      const dx = it.x - x, dy = it.y - y, dz = it.z - z, d = Math.hypot(dx, dy, dz) || 1e-3;
      if (d > R + it.r) continue;
      const k = 1 - d / (R + it.r);
      const imp = force * (0.35 + k) / Math.sqrt(it.mass);
      it.vx += (dx / d) * imp; it.vy += (dy / d) * imp; it.vz += (dz / d) * imp;
      it.wx += (this.rng() - 0.5) * 6 * k; it.wy += (this.rng() - 0.5) * 6 * k; it.wz += (this.rng() - 0.5) * 6 * k;
      if (it.st === 'held' && k > 0.35) this.release(it);
      const K = KINDS[it.kind];
      if (K.fuel && it.fuse < 0) it.fuse = 0.2 + this.rng() * 0.3;
      if (K.mine && it.fuse < 0) it.fuse = 0.1 + this.rng() * 0.2;
      if (K.lock && k > 0.3) { it.hp = (it.hp === undefined ? 2 : it.hp) - 1; this.emit({ type: 'dent', item: it }); if (it.hp <= 0) this.openBox(it); }
    }
    const c = this.claw, cd = Math.hypot(c.x - x, c.y - y, c.z - z);
    if (cd < R * 1.05) {
      c.stun = Math.max(c.stun, 1.7);
      const k = 1 - cd / (R * 1.05);
      c.vx += ((c.x - x) / (cd || 1)) * 5 * (0.4 + k); c.vy += ((c.y - y) / (cd || 1)) * 5 * (0.4 + k); c.vz += ((c.z - z) / (cd || 1)) * 5 * (0.4 + k);
      for (const it of this.holding) this.release(it);
      this.emit({ type: 'stun' });
    }
  }

  openBox(box) {
    if (box.st === 'out') return;
    box.st = 'out';
    this.cutLinks(box);
    const p = { x: box.x, y: box.y, z: box.z }, rng = this.rng;
    const burst = () => ({ x: (rng() - 0.5) * 3, y: (rng() - 0.5) * 3, z: (rng() - 0.5) * 2 });
    this.emit({ type: 'open', x: p.x, y: p.y, z: p.z, jackpot: box.inside === 'chip' });
    if (box.inside === 'chip') this.spawn('chip', p, { v: burst() });
    else if (box.inside === 'case') this.spawn('case', p, { v: burst() });
    else for (let i = 0; i < 3; i++) this.spawn('gem', { x: p.x + (rng() - 0.5) * 0.5, y: p.y + (rng() - 0.5) * 0.5, z: p.z + (rng() - 0.5) * 0.4 }, { v: burst() });
  }
}
