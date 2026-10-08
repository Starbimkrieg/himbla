import * as THREE from 'three';
import { frameQuat } from './geo.js';

// Grinding the crests of snake rocks (rocks.js; the planet keeps their crest lines in planet.rails).
// Land on (or drop onto) a crest and you lock to it, standing sideways to the line, carried along
// by your speed: downhill stretches speed you up, uphill ones slow you. Jump to pop off any time;
// near the end you pop off by yourself. Sparks fly, and it pays style for every second on the rail.

const GRAV = 6;
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// point and unit tangent at arc length s along a rail
function railAt(r, s, outP, outT) {
  const cum = r.cum, n = cum.length;
  s = Math.max(0, Math.min(r.len, s));
  let i = 0;
  while (i < n - 2 && cum[i + 1] < s) i++;
  const f = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
  outP.copy(r.pts[i]).lerp(r.pts[i + 1], f);
  outT.copy(r.pts[i + 1]).sub(r.pts[i]).normalize();
  return outP;
}

export class Grinder {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.cool = 0;
  }

  // nearest crest point to p within reach: { r, s, p, d }
  nearest(p) {
    const rails = this.game.planet.rails;
    if (!rails) return null;
    let best = null;
    for (const r of rails) {
      if (p.distanceTo(r.c) > r.rad + 4) continue;
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

  // Called at the top of Player.update. Returns true while grinding (the player skips its physics).
  update(P, dt, input) {
    const g = this.game, b = P.body;
    if (this.cool > 0) this.cool -= dt;
    if (!this.active) {
      if (this.cool > 0 || P.seat || P.vehicle || P.dead) return false;
      const n = this.nearest(b.pos);
      if (!n || n.d > 1.6) return false;
      _u.copy(n.p).normalize();
      const above = _a.subVectors(b.pos, n.p).dot(_u);
      if (above < -0.7 || above > 1.7 || b.vel.dot(_u) > 3) return false;
      railAt(n.r, n.s, _p, _t);
      const along = b.vel.dot(_t);
      const dir = Math.abs(along) > 2 ? Math.sign(along) : Math.sign(P.heading.dot(_t)) || 1;
      this.active = { r: n.r, s: n.s, dir, speed: Math.max(Math.abs(along), 9), t: 0, spark: 0 };
      g.fx.pop('GRIND!', null, { color: '#ffd23f', size: 44 });
      g.audio.tone(1400, 0.08, 'square', 0.08);
    }
    const A = this.active, r = A.r;
    railAt(r, A.s, _p, _t);
    _u.copy(_p).normalize();
    // gravity along the rail, and a little friction
    A.speed += -GRAV * _t.dot(_u) * A.dir * dt;
    A.speed = Math.max(3, Math.min(85, A.speed - 0.5 * dt));
    A.s += A.dir * A.speed * dt;
    A.t += dt;
    railAt(r, A.s, _p, _t);
    _u.copy(_p).normalize();
    const left = A.dir > 0 ? r.len - A.s : A.s;
    const jump = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    if (jump || left < 1.2 || P.dead) { this.pop(P, jump); return true; }
    // ride the crest, standing sideways to it
    b.pos.copy(_p).addScaledVector(_u, 0.05);
    b.vel.copy(_t).multiplyScalar(A.dir * A.speed);
    b.up.copy(_u);
    b.grounded = true;
    b.airTime = 0;
    b.platform = null;
    P.heading.crossVectors(_u, _t).multiplyScalar(A.dir).normalize();
    P.center.copy(b.pos).addScaledVector(_u, 1.2);
    const m = P.model;
    m.root.position.copy(b.pos);
    frameQuat(_u, P.heading, m.root.quaternion);
    m.legL.rotation.x = 0.35; m.legR.rotation.x = -0.35;
    if (m.armL) m.armL.rotation.z = 1.25;
    if (m.armR) m.armR.rotation.z = -1.25;
    m.body.position.y = m.bodyBase - 0.28;
    P.upSmooth.copy(_u);
    // sparks off the crest
    A.spark -= dt;
    if (A.spark <= 0) {
      A.spark = 0.04;
      g.fx.spawn(_p.clone(), _t.clone().multiplyScalar(-A.dir * 4).addScaledVector(_u, 3), { color: Math.random() < 0.5 ? 0xffd23f : 0xff9f1c, size: 0.25, life: 0.35, gravity: 6, count: 2, spread: 0.6 });
    }
    return true;
  }

  // off the rail: carried on along it, with a hop (bigger if you jumped)
  pop(P, jumped) {
    const g = this.game, b = P.body, A = this.active;
    railAt(A.r, A.s, _p, _t);
    _u.copy(_p).normalize();
    b.pos.copy(_p).addScaledVector(_u, 0.4);
    b.vel.copy(_t).multiplyScalar(A.dir * A.speed).addScaledVector(_u, jumped ? 12 : 9);
    b.grounded = false;
    b.airTime = 0.25;
    b.sinceContact = 1;
    if (P.model.armL) P.model.armL.rotation.z = 0;
    if (P.model.armR) P.model.armR.rotation.z = 0;
    const pts = Math.round(15 + A.t * 30);
    g.style(pts, 'GRIND');
    g.fx.pop(`GRIND +${pts}`, null, { color: '#ffd23f', size: 40 });
    if (jumped) g.audio.jump();
    this.active = null;
    this.cool = 0.6;
  }
}
