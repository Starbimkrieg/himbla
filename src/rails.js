import * as THREE from 'three';
import { frameQuat, upAt } from './geo.js';
import { ledgeRailsJob } from './ledges.js';

// Grinding crater lips (planet.rimRails) and building ledges (ledges.js); planet.rails holds any other loose rail (none since
// the snake rocks went: the tip and side-on grabs below were theirs). Land on one to lock on, carried by your speed (downhill
// speeds you up). Jump to pop off; near the end you pop off by yourself. Pays style per second.

const GRAV = 6;
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _r = new THREE.Vector3(), _v = new THREE.Vector3();
const _hp = new THREE.Vector3(), _ht = new THREE.Vector3(), _hu = new THREE.Vector3(), _hn = new THREE.Vector3(), _ts = new THREE.Vector3(), _tf = new THREE.Vector3();
const _near = [];
// places whose buildings' edges are rails (ledges.js), worked out when you first come near and again if their colliders change
const LEDGE_PLACES = ['downs'];
const LCELL = 12; // m: the ledge rails' lookup grid
const GRIND_MIN = 5; // m/s: slower than this on a rail and you lose your balance (bail); slower than this you don't get on
// Friction on a rail: GRIND_DRAG m/s2, plus GRIND_BLEED of every m/s over GRIND_CRUISE each second. A fast entry (trick thrust,
// a long drop) keeps its speed and bleeds it off slowly (120 m/s loses about 3.5 m/s a second) instead of being cut to a cap; a long
// downhill finds its own top speed where gravity meets the bleed (about 100 m/s on a 30 degree slope).
const GRIND_DRAG = 0.5, GRIND_BLEED = 0.03, GRIND_CRUISE = 20;
export const grindLabel = (r) => (r.ledge ? 'LEDGE GRIND' : r.rimOf ? 'RIM GRIND' : 'GRIND');
const BODY = 0.45, BODY_UP = 0.5; // rider's shins-to-waist as a ball (radius, lift): what crest rocks must clear
const TRAIL_LIFE = 2; // s a grind's skate trail lasts

// point and unit tangent at arc length s along a rail (crater rims are closed loops)
function railAt(r, s, outP, outT) {
  const cum = r.cum, n = cum.length;
  s = r.loop ? ((s % r.len) + r.len) % r.len : Math.max(0, Math.min(r.len, s));
  let i = 0;
  while (i < n - 2 && cum[i + 1] < s) i++;
  const f = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
  outP.copy(r.pts[i]).lerp(r.pts[i + 1], f);
  outT.copy(r.pts[i + 1]).sub(r.pts[i]).normalize();
  return outP;
}

// A rail from a crest polyline: per-point arc lengths and a bounding sphere (nearest() checks it first).
// planet.js addRail makes the Moon's; the Asset Row's flat world makes its own.
export function railOf(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.divideScalar(pts.length);
  let rad = 0;
  for (const p of pts) rad = Math.max(rad, p.distanceTo(c));
  return { pts, cum, len: cum[cum.length - 1], c, rad };
}

export class Grinder {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.cool = 0;
    this.rimT = 0;
    this.ledges = new Map(); // place -> { n (its collider count when worked out), rails, grid }
    this.ledgeJob = null; // { loc, n, gen }: a place's ledge rails being worked out, a few ms a frame (ledgeStep)
  }

  // start working out the ledge rails of a LEDGE_PLACE within reach of p, if they're missing or its colliders changed
  syncLedges(p) {
    const g = this.game;
    if (this.ledgeJob) return;
    for (const id of LEDGE_PLACES) {
      const loc = g.locations && g.locations.find((l) => l.id === id);
      if (!loc || !loc.pos || !loc._cols || p.distanceTo(loc.pos) > (loc.r || 300) + 400) continue;
      const have = this.ledges.get(loc);
      if (have && have.n === loc._cols.length) continue;
      this.ledgeJob = { loc, n: loc._cols.length, gen: ledgeRailsJob(loc._cols, g.colliders, g.planet) };
      return;
    }
  }

  // a few ms of the ledge job a frame; on the last, the rails go into their lookup grid
  ledgeStep(budget = 3) {
    const J = this.ledgeJob;
    if (!J) return;
    const t0 = performance.now();
    let res;
    do res = J.gen.next(); while (!res.done && performance.now() - t0 < budget);
    if (!res.done) return;
    this.ledgeJob = null;
    const rails = res.value, grid = new Map();
    for (const r of rails) for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], n = Math.ceil(a.distanceTo(b) / (LCELL / 2)) + 1;
      for (let k = 0; k <= n; k++) {
        _v.lerpVectors(a, b, k / n);
        const key = `${Math.floor(_v.x / LCELL)},${Math.floor(_v.y / LCELL)},${Math.floor(_v.z / LCELL)}`;
        (grid.get(key) || grid.set(key, new Set()).get(key)).add(r);
      }
    }
    this.ledges.set(J.loc, { n: J.n, rails, grid });
  }

  // ledge rails in the grid cells round p
  ledgesNear(p, out) {
    const ix = Math.floor(p.x / LCELL), iy = Math.floor(p.y / LCELL), iz = Math.floor(p.z / LCELL);
    for (const { grid } of this.ledges.values()) {
      for (let x = ix - 1; x <= ix + 1; x++) for (let y = iy - 1; y <= iy + 1; y++) for (let z = iz - 1; z <= iz + 1; z++) {
        const cell = grid.get(`${x},${y},${z}`);
        if (cell) for (const r of cell) out.add(r);
      }
    }
    return out;
  }

  // nearest crest point to p within reach: { r, s, p, d }
  nearest(p) {
    const pl = this.game.planet;
    const rails = [...(pl.rails || []), ...(pl.rimRails ? [...pl.rimRails.values()].flat() : []), ...this.ledgesNear(p, new Set())];
    let best = null;
    for (const r of rails) {
      if (!r || p.distanceTo(r.c) > r.rad + 4) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        _a.subVectors(b, a);
        const L2 = _a.lengthSq();
        const f = Math.max(0, Math.min(1, _b.subVectors(p, a).dot(_a) / L2));
        _b.copy(a).addScaledVector(_a, f);
        const d = _b.distanceTo(p);
        if (!best || d < best.d) best = { r, s: r.cum[i] + f * Math.sqrt(L2), p: _b.clone(), d };
      }
    }
    return best;
  }

  // First solid thing in the way (boulder or rock on the crest, a post, a wall) within ds along the rail: its push-out normal, or
  // null. The rail's own rock or colliders don't count, nor anything you'd ride over (pushing you mostly up).
  hit(A, ds) {
    const cols = this.game.colliders;
    if (!cols) return null;
    const steps = Math.max(1, Math.ceil(Math.abs(ds) / 0.5));
    for (let i = 1; i <= steps; i++) {
      railAt(A.r, A.s + ds * (i / steps), _hp, _ht);
      upAt(_hp, _hu);
      _hp.addScaledVector(_hu, BODY_UP);
      for (const c of cols.query(_hp, BODY + 2, _near)) {
        if (c.platform || c.rail === A.r.pts || (A.r.owners && A.r.owners.has(c))) continue;
        if (cols.contact(c, _hp, BODY, _hn) > 0 && _hn.dot(_hu) < 0.6) return _hn;   // (a push mostly up is ground you ride over: a joint between a long roof's 8 m pieces)
      }
    }
    return null;
  }

  // Top of Player.update. True while grinding (the player skips its physics).
  update(P, dt, input) {
    const g = this.game, b = P.body;
    if (this.cool > 0) this.cool -= dt;
    if ((this.rimT -= dt) <= 0) { this.rimT = 0.5; g.planet.rimRailsNear(b.pos); this.syncLedges(b.pos); }
    this.ledgeStep();
    // a limp ragdoll never grabs (and lets go)
    if (P.rag) { this.active = null; return false; }
    if (!this.active) {
      if (this.cool > 0 || P.seat || P.vehicle || P.dead) return false;
      // check here, halfway and a moment ahead, so a fast approach can't tunnel past a tip
      let n = this.nearest(b.pos);
      for (const k of [0.5, 1]) {
        const ahead = this.nearest(_a.copy(b.pos).addScaledVector(b.vel, Math.min(0.2, dt * 5) * k));
        if (ahead && (!n || ahead.d < n.d)) n = ahead;
      }
      if (!n) return false;
      railAt(n.r, n.s, _p, _t);
      upAt(n.p, _u);
      const along = b.vel.dot(_t);
      const hsp = Math.sqrt(Math.max(0, b.vel.lengthSq() - b.vel.dot(_u) ** 2));
      // heading along the line grabs from further; tips (meeting the ground) scoop up anything moving in.
      // A loose rail wants you within ~40 degrees; crater rims ~60 (the lip kicks you onto the crest)
      const rim = !!n.r.rimOf, ledge = !!n.r.ledge;
      const lined = hsp > 4 && Math.abs(along) / hsp > (rim ? 0.5 : 0.75);
      // a building's edge only takes you on skates, in the air, heading along it: running past or along a roof, landing across
      // its edge or stepping off a counter never snags
      if (ledge && (!lined || b.grounded || !input.down('Space'))) return false;
      const tip = !n.r.loop && !rim && !ledge && (n.s < 6 || n.s > n.r.len - 6);
      // crossing at an angle only grabs if dropping onto it (along it, a tip, or side-on at speed still do)
      const dropping = b.vel.dot(_u) < -3;
      const reach = tip && lined ? 4 : lined ? (rim ? 3.4 : ledge ? 1.5 : 2.8) : tip ? 1.8 : 1.5;
      // rims only take you heading along them (crossing square-on mustn't snag)
      if (rim && !lined) return false;
      const above = _b.subVectors(b.pos, n.p).dot(_u);
      // a loose rail, measured across the ground: skate into its side at speed and you hop onto the crest
      const flat = Math.sqrt(Math.max(0, n.d * n.d - above * above));
      const toward = -_b.dot(b.vel) + above * b.vel.dot(_u); // closing speed on the crest line, across the ground
      const sideOn = !rim && !ledge && hsp > 7 && above > -3.6 && above < 0 && flat < 2.5 && toward > 2 * Math.max(flat, 0.5);
      if (n.d > reach && !sideOn) return false;
      if (!lined && !tip && !sideOn && !dropping) return false;
      if (above < (sideOn ? -3.6 : -1.6) || above > (rim ? 3 : 2.2) || b.vel.dot(_u) > 6 + 0.25 * hsp) return false; // a little rise is just the slope, at speed
      // direction: inward at a tip, else the way you're moving
      let dir;
      if (tip) dir = n.s < n.r.len / 2 ? 1 : -1;
      else dir = Math.abs(along) > 2 ? Math.sign(along) : Math.sign(P.heading.dot(_t)) || 1;
      const speed = Math.max(Math.abs(along), hsp * 0.85);                                    // you ride on at the speed you came in with
      if (speed < GRIND_MIN) return false;                                                     // (too slow to balance on it at all)
      this.active = { r: n.r, s: n.s, dir, speed, t: 0, spark: 0 };
      g.audio.tone(1400, 0.08, 'square', 0.08);
      g.haptics.play('grind');
    }
    const A = this.active, r = A.r;
    railAt(r, A.s, _p, _t);
    upAt(_p, _u);
    // gravity along the rail, a little friction
    A.speed += -GRAV * _t.dot(_u) * A.dir * dt;
    A.speed -= (GRIND_DRAG + GRIND_BLEED * Math.max(0, A.speed - GRIND_CRUISE)) * dt;
    if (A.speed < GRIND_MIN) { this.bail(P); return true; }
    // a rock on the crest throws you off
    const bump = this.hit(A, A.dir * A.speed * dt);
    if (bump) { this.knockOff(P, bump); return true; }
    A.s += A.dir * A.speed * dt;
    if (r.loop) A.s = ((A.s % r.len) + r.len) % r.len;
    A.t += dt;
    // physics (which refills the tank) is skipped, so recharge here
    b.thrusting = false;
    b.energy = Math.min(b.maxEnergy, b.energy + P.params.energyRegen * dt);
    if (b.jetLocked && b.energy >= b.maxEnergy * 0.25) b.jetLocked = false;
    railAt(r, A.s, _p, _t);
    upAt(_p, _u);
    const left = r.loop ? Infinity : A.dir > 0 ? r.len - A.s : A.s;
    const jump = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    if (jump || left < 1.2 || P.dead) { this.pop(P, jump); return true; }
    // ride the crest sideways
    b.pos.copy(_p).addScaledVector(_u, 0.05);
    b.vel.copy(_t).multiplyScalar(A.dir * A.speed);
    b.up.copy(_u);
    b.grounded = true;
    b.airTime = 0;
    b.platform = null;
    P.heading.crossVectors(_u, _t).multiplyScalar(A.dir).normalize();
    P.center.copy(b.pos).addScaledVector(_u, 1.2);
    // slide pose: low, sideways, leaning back against travel, arms out, swaying more with speed
    const m = P.model;
    const fast = Math.min(1, A.speed / 45);
    A.anim = (A.anim || 0) + dt * (5 + A.speed * 0.12);
    const w1 = Math.sin(A.anim), w2 = Math.sin(A.anim * 1.63 + 1.1), w3 = Math.sin(A.anim * 0.71 + 2.3);
    m.root.position.copy(b.pos);
    frameQuat(_u, P.heading, m.root.quaternion);
    _r.set(1, 0, 0).applyQuaternion(m.root.quaternion);
    const trav = Math.sign(_v.copy(_t).multiplyScalar(A.dir).dot(_r)) || 1; // slide direction along the model's X
    const settle = Math.min(1, A.t * 6); // ease into the pose on landing
    m.root.quaternion.multiply(_q.setFromAxisAngle(_z, trav * (0.2 + 0.08 * fast + 0.05 * w3) * settle));
    if (m.trick) m.trick.rotation.set(0, 0, 0);
    m.body.position.y = m.bodyBase - (0.3 + 0.08 * fast) * settle + 0.035 * w1;
    m.torso.rotation.x = (0.3 + 0.12 * fast + 0.04 * w2) * settle;
    m.legL.rotation.x = (0.55 + 0.06 * w1) * settle; m.legR.rotation.x = (-0.55 + 0.06 * w1) * settle;
    if (m.armL) { m.armL.rotation.z = -1.2 + 0.18 * w2 + 0.1 * fast; m.armL.rotation.x = 0.25 * w3 - 0.2 * fast; }
    if (m.armR) { m.armR.rotation.z = 1.2 + 0.18 * w1 - 0.1 * fast; m.armR.rotation.x = -0.25 * w3 - 0.2 * fast; }
    P.upSmooth.copy(_u);
    // skate trail keeps streaming along the rail (fades over TRAIL_LIFE)
    _ts.crossVectors(_u, _t).normalize();
    const tr = b.skating ? Math.min(1, A.speed / 30) : 0;
    g.fx.updateTrail(0, _tf.copy(b.pos).addScaledVector(_ts, -0.2), _ts, tr, _u, dt, TRAIL_LIFE);
    g.fx.updateTrail(1, _tf.copy(b.pos).addScaledVector(_ts, 0.2), _ts, tr, _u, dt, TRAIL_LIFE);
    // sparks sprayed back off the skates, white-hot to orange, more with speed; a contact flash and the odd big burst
    A.spark -= dt;
    if (A.spark <= 0) {
      A.spark = 0.03 - 0.015 * fast;
      const back = _v.copy(_t).multiplyScalar(-A.dir);
      const foot = _p.clone().addScaledVector(_u, 0.12);
      const n = 2 + Math.round(3 * fast);
      for (let i = 0; i < n; i++) {
        const k = Math.random();
        const col = k < 0.25 ? 0xfffbe6 : k < 0.65 ? 0xffd23f : 0xff8a1f;
        const vel = back.clone().multiplyScalar(4 + A.speed * (0.15 + Math.random() * 0.25)).addScaledVector(_u, 2 + Math.random() * 4);
        g.fx.spawn(foot, vel, { color: col, size: 0.12 + Math.random() * 0.14, life: 0.25 + Math.random() * 0.3, gravity: 9, drag: 0.3, count: 1, spread: 3.5 });
      }
      g.fx.spawn(foot, _u.clone(), { color: 0xfffbe6, size: 0.55 + 0.3 * fast, life: 0.07, count: 1, spread: 0 });
      if (Math.random() < 0.05 + 0.1 * fast) {
        g.fx.spawn(foot, back.clone().multiplyScalar(6 + A.speed * 0.3).addScaledVector(_u, 5), { color: 0xffd23f, size: 0.2, life: 0.5, gravity: 9, drag: 0.25, count: 8, spread: 7 });
      }
    }
    return true;
  }

  // Too slow to balance (GRIND_MIN): you topple off the side, the style run is lost and you tumble (a ragdoll where one is allowed)
  bail(P) {
    const g = this.game, b = P.body, A = this.active;
    railAt(A.r, A.s, _p, _t);
    upAt(_p, _u);
    this.pop(P, false, true);
    const side = Math.random() < 0.5 ? -1 : 1;
    b.vel.copy(_t).multiplyScalar(A.dir * A.speed).addScaledVector(_v.crossVectors(_u, _t), side * 2.5).addScaledVector(_u, 1.5);
    this.cool = 1;
    P.combo.wipe();
    g.audio.thud(18);
    g.haptics.play('wipeout');
    P.startRagdoll(side);
  }

  // Struck by something solid (rover, road vehicle, ram): thrown off, away from the hit if known, briefly no re-grab.
  // No grind points.
  knockOff(P, n = null) {
    const A = this.active;
    if (!A) return;
    const g = this.game, b = P.body;
    this.pop(P, false, true);
    if (n) b.vel.addScaledVector(n, 10);
    this.cool = 1;
    g.fx.pop('KNOCKED OFF!', P.center.clone(), { color: '#ff5a3c', size: 50 });
  }

  // off the rail, carried along it with a hop (bigger if jumped)
  pop(P, jumped, knocked = false) {
    const g = this.game, b = P.body, A = this.active;
    railAt(A.r, A.s, _p, _t);
    upAt(_p, _u);
    b.pos.copy(_p).addScaledVector(_u, 0.4);
    b.vel.copy(_t).multiplyScalar(A.dir * A.speed).addScaledVector(_u, jumped ? 12 : 9);
    b.grounded = false;
    b.airTime = 0.25;
    b.sinceContact = 1;
    const m = P.model;
    if (m.armL) m.armL.rotation.set(0, 0, 0);
    if (m.armR) m.armR.rotation.set(0, 0, 0);
    m.torso.rotation.x = 0;
    if (!knocked) {
      P.combo.add(grindLabel(A.r), Math.round(15 + A.t * 30), 'grind'); // (the style meter showed it live: player.js)
    }
    if (jumped) { g.audio.jump(); g.haptics.play('jump'); }
    this.active = null;
    this.cool = 0.6;
  }
}
