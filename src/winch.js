// The Kepler Hitch-Line Winch (Kepler's unique upgrade, an active on Z). Fire a cable onto a passing
// vehicle and ride its pull: swing under a flying transit like a pendulum (momentum and all), or trail
// along behind a rover or a land-train. It holds as long as you hold Z, up to ten seconds.
//
// The cable is a rope, not a rod: it only pulls when it's taut, and when it is, the pull goes both
// ways, split by mass. A hover-car weighs a couple of you and goes where you drag it, well off the
// road; rovers (pirate rigs, patrols, allies, bosses) are a handful; a transit shuttle takes some
// hauling but still gives a few metres; freighters and land-trains barely notice. A traffic vehicle
// you've dragged off its route eases back onto it when you let go (traffic.js applyTug), and a rover's
// own driving takes it back. SAT-7 doesn't move at all: hook it and you go round with it.
import * as THREE from 'three';
import { upAt } from './geo.js';

const RANGE = 85;      // how far the cable reaches
const HOLD = 10;       // seconds before the line lets go on its own
const SEG = 16;        // rope points (for the sag when it's slack)
const ROPE = 0xff9f1c; // Kepler orange

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();

// what's worth hooking, and how heavy it is
function massOf(v) {
  if (v.kind === 'ship') return 16;
  if (v.kind === 'bus') return 6; // (the little transit shuttles)
  if (v.kind === 'landtrain') return 14;
  if (v.kind === 'buggy') return 5; // (the crawler buggies)
  if (v.kind === 'car') return 2.2;
  return 6;
}

export class Winch {
  constructor(game) {
    this.game = game;
    this.on = null; // { target, len, t }
    this.cd = 0;
    this.pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.old = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.mat = new THREE.MeshBasicMaterial({ color: ROPE });
    this.mesh = null;
    this.hook = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.hook.visible = false;
    game.scene.add(this.hook);
  }

  get owned() { return (this.game.upgrades.winch || 0) > 0; }

  // Everything hookable in reach: road and air traffic, crawlers, and any rover (allies, pirates,
  // patrols). Each comes back as a target with its anchor, velocity and a way to push on it.
  targets() {
    const g = this.game;
    const P = g.player;
    const out = [];
    const tr = g.world.traffic;
    const near = (p) => p.distanceToSquared(P.pos) < RANGE * RANGE;
    const traffic = (v) => ({
      obj: v, mass: massOf(v), flying: !v.piece && !v.offroad && !!v.path,
      pos: () => v.pos,
      vel: () => v.vel,
      alive: () => v.root.visible && v.state !== 'dead' && v.state !== 'wreck' && !(v.captured > 0),
      push: (J) => { v.tug ||= new THREE.Vector3(); v.tugVel ||= new THREE.Vector3(); v.tugVel.addScaledVector(J, 1 / massOf(v)); },
      shift: (d) => { v.tug ||= new THREE.Vector3(); v.tugVel ||= new THREE.Vector3(); v.tug.add(d); },
    });
    if (tr) {
      for (const v of tr.vehicles) if (v.root && v.root.visible && v.state !== 'dead' && near(v.pos)) out.push(traffic(v));
      for (const c of tr.crawlers || []) if (c.root && c.root.visible && near(c.pos)) out.push(traffic(c));
    }
    // rovers of every side (pirate rigs, patrols, allies, the bosses, Kade's truck): yank them around in a fight
    for (const e of g.enemies.list) {
      if (e.dead || !e.body || !(e.kind === 'rover' || e.kind === 'milrover' || e.kind === 'kade') || !near(e.body.pos)) continue;
      const m = e.kind === 'kade' ? 9 : e.bossName ? 10 : 3.5;
      out.push({
        obj: e, mass: m, flying: false,
        pos: () => e.body.pos, vel: () => e.body.vel, alive: () => !e.dead,
        push: (J) => { e.body.vel.addScaledVector(J, 1 / m); e.body.grounded = false; },
        shift: (d) => e.body.pos.add(d),
      });
    }
    // SAT-7: the derelict in its low orbit is an anchor that doesn't budge
    const S = g.secrets && g.secrets.sat;
    if (S && S.root && S.root.visible !== false && near(S.pos)) {
      out.push({ obj: { kind: 'sat7' }, mass: 1e6, flying: true, pos: () => S.pos, vel: () => S.vel, alive: () => true, push: () => {}, shift: () => {} });
    }
    return out;
  }

  // the one you're looking at (or, failing that, the nearest)
  pick() {
    const g = this.game;
    const P = g.player;
    const eye = g.camera.position;
    const look = g.camera.getWorldDirection(_a);
    let best = null, bs = -Infinity;
    for (const t of this.targets()) {
      const to = t.pos().clone().sub(eye);
      const d = to.length();
      const aim = to.divideScalar(d).dot(look);
      if (aim < 0.6) continue;
      const score = aim * 3 - P.pos.distanceTo(t.pos()) / RANGE;
      if (score > bs) { bs = score; best = t; }
    }
    return best;
  }

  // Z pressed with the winch selected
  fire() {
    const g = this.game;
    const P = g.player;
    if (this.on || this.cd > 0 || P.dead || P.vehicle || P.seat) return;
    const t = this.pick();
    if (!t) {
      g.hud.toast('Hitch-Line: nothing in reach. Aim at a vehicle within 85 m.', 1.6);
      g.audio.tone(220, 0.12, 'square', 0.06, 0.7);
      return;
    }
    const hand = this.hand(_a);
    const dist = hand.distanceTo(t.pos());
    // (a little yank as it bites: the line takes up a tenth of its slack)
    this.on = { target: t, len: Math.max(7, dist * 0.9), t: 0 };
    for (let i = 0; i <= SEG; i++) { this.pts[i].lerpVectors(hand, t.pos(), i / SEG); this.old[i].copy(this.pts[i]); }
    g.fx.pop('HITCHED!', null, { color: '#ff9f1c', size: 46, life: 0.7 });
    g.audio.burst(0.12, 3000, 0.25);
    g.audio.tone(380, 0.25, 'sawtooth', 0.08, 2.2);
  }

  release(quiet = false) {
    if (!this.on) return;
    this.on = null;
    this.cd = 1.5;
    this.hook.visible = false;
    if (this.mesh) this.mesh.visible = false;
    if (!quiet) this.game.audio.tone(900, 0.06, 'square', 0.06, 0.5);
  }

  hand(out) { const P = this.game.player; return out.copy(P.center).addScaledVector(P.up, 0.4); }

  // every frame (after the player has moved): the cable pulls when it's taut
  update(dt, held) {
    const g = this.game;
    const P = g.player;
    if (this.cd > 0) this.cd -= dt;
    const o = this.on;
    if (!o) return;
    o.t += dt;
    const T = o.target;
    if (!held || o.t > HOLD || P.dead || P.vehicle || P.seat || !T.alive() || g.state !== 'play') { this.release(); return; }
    const anchor = T.pos();
    const hand = this.hand(_a);
    _d.copy(hand).sub(anchor);
    const len = _d.length();
    if (len > RANGE * 1.6) { this.release(); g.hud.toast('The line snapped!', 1.5); return; }
    if (len > o.len && len > 1e-3) {
      _n.copy(_d).divideScalar(len); // from the vehicle to you
      const mP = 1, mT = T.mass;
      const share = mT / (mP + mT); // (you take almost all of the correction; it takes a little)
      // positions: back to the cable's length
      const over = len - o.len;
      P.body.pos.addScaledVector(_n, -over * share);
      T.shift(_n.clone().multiplyScalar(over * (1 - share)));
      // velocities: no moving apart along the cable (the swing, the tow, the drag all come from this)
      const rel = P.vel.dot(_n) - T.vel().dot(_n);
      if (rel > 0) {
        const j = rel / (1 / mP + 1 / mT);
        P.vel.addScaledVector(_n, -j / mP);
        T.push(_n.clone().multiplyScalar(j));
      }
      // a taut cable lifts you off the ground (so it can swing you)
      if (_n.dot(upAt(P.pos)) < -0.3) { P.body.grounded = false; P.body.sinceContact = 1; }
      if (Math.random() < dt * 3) g.audio.tone(140 + Math.random() * 60, 0.08, 'sawtooth', 0.025, 1.3); // the cable creaks
    }
    if (o.t > HOLD - 2 && Math.floor(o.t * 4) !== Math.floor((o.t - dt) * 4)) g.audio.tone(1200, 0.05, 'square', 0.04); // (running out)
    this.drawRope(dt, hand, anchor, o.len);
  }

  // A verlet rope between your hand and the hook: straight when taut, sagging when it's slack.
  drawRope(dt, a, b, len) {
    const g = this.game;
    const pts = this.pts, old = this.old;
    const up = upAt(a, new THREE.Vector3());
    const rest = Math.max(len, a.distanceTo(b)) / SEG;
    const gdt = 9 * dt * dt;
    for (let i = 1; i < SEG; i++) {
      const p = pts[i], q = old[i];
      const vx = (p.x - q.x) * 0.96, vy = (p.y - q.y) * 0.96, vz = (p.z - q.z) * 0.96;
      q.copy(p);
      p.x += vx - up.x * gdt; p.y += vy - up.y * gdt; p.z += vz - up.z * gdt;
    }
    pts[0].copy(a); pts[SEG].copy(b);
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < SEG; i++) {
        const p = pts[i], q = pts[i + 1];
        _d.subVectors(q, p);
        const l = _d.length() || 1e-6;
        const k = (l - rest) / l;
        if (i === 0) q.addScaledVector(_d, -k);
        else if (i === SEG - 1) p.addScaledVector(_d, k);
        else { p.addScaledVector(_d, k * 0.5); q.addScaledVector(_d, -k * 0.5); }
      }
      pts[0].copy(a); pts[SEG].copy(b);
    }
    if (this.mesh) { this.mesh.geometry.dispose(); g.scene.remove(this.mesh); }
    this.mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG * 2, 0.07, 4, false), this.mat);
    this.mesh.frustumCulled = false;
    g.scene.add(this.mesh);
    this.hook.visible = true;
    this.hook.position.copy(b);
    this.hook.rotation.y += dt * 6;
  }

  // the Z chip's line
  status() {
    if (this.on) return `HITCHED ${Math.ceil(HOLD - this.on.t)} s`;
    if (this.cd > 0) return `${Math.ceil(this.cd)} s`;
    const t = this.pick();
    return t ? 'TARGET IN REACH' : 'NO TARGET';
  }
}
