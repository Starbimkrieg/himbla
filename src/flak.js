import * as THREE from 'three';
import { shatterEcho } from './monolith.js';

// Flak: a shell fused to burst where its target will be, or as soon as it passes close to you. Captain Kade's gun truck
// (kade.js) and the base turrets' high-angle mode (enemies.updateTurret) fire it.

const _up = new THREE.Vector3(), _v = new THREE.Vector3(), _at = new THREE.Vector3();

// A flak burst. Within `radius` (11 m) it stings and shoves you away (`push` m/s point-blank, fading to 0 at the edge,
// softened by the Flak Weave), bleeds speed and pulls you down. A shove, not a launch: at most `push` per burst.
// Damage is dmg + close * f (f: 1 point-blank, 0 at the edge); `cause` names it for the death screen.
export function flakBurst(g, pos, { cause = 'kade', dmg = 4, close = 12, push = 20, radius = 11 } = {}) {
  const P = g.player;
  g.fx.explosion(pos, 3.5, false);
  g.fx.spawn(pos, new THREE.Vector3(), { color: 0x2a2433, size: 1.6, life: 1.2, count: 6, spread: 3 });
  // white phosphorus: burning, smoking fragments
  g.fx.phosphor(pos, 10);
  g.audio.burst(0.35, 900, 0.35);
  for (const d of g.decoys.slice()) if (pos.distanceTo(d.center) < 6) shatterEcho(g, d);
  if (P.dead) return;
  const dist = pos.distanceTo(P.center);
  if (dist > radius) return;
  const f = 1 - dist / radius;
  g.damagePlayer(dmg + close * f, cause);
  const up = _up.copy(P.pos).normalize();
  const vUp = P.vel.dot(up);
  P.vel.addScaledVector(up, -vUp).multiplyScalar(1 - 0.18 * f).addScaledVector(up, vUp - 3.5 * f);
  P.vel.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.5 * f));
  const away = _v.copy(P.center).sub(pos);
  if (away.lengthSq() < 0.01) away.copy(up);
  P.vel.addScaledVector(away.normalize(), push * f * (P.knockResist || 1));
  P.body.grounded = false; // (else the skates iron out the shove)
  P.body.sinceContact = 1;
  g.cam.shake = Math.max(g.cam.shake, 0.3 * f);
  if (Math.random() < 0.4) g.fx.pop('FLAK!', pos.clone(), { color: '#ff9f1c', size: 34, life: 0.6 });
}

// Fire a flak shell from `from` at a target at `center` moving at `vel`: the lead solved over a few passes (so a fast
// target is led properly), scattered by `scatter` m, fused to burst there (or within `proxy` m of you). `burst` is passed
// to flakBurst. Returns the fuse time.
export function fireFlak(g, owner, from, center, vel, { speed = 210, scatter = 3, proxy = 7, color = 0xff4f2e, size = 0.6, burst = {} } = {}) {
  let t = center.distanceTo(from) / speed;
  for (let i = 0; i < 3; i++) t = _at.copy(center).addScaledVector(vel, t).distanceTo(from) / speed;
  _at.copy(center).addScaledVector(vel, t).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(scatter));
  const dir = _at.sub(from).normalize();
  g.projectiles.fire(owner, from, dir.multiplyScalar(speed), { color, size, life: t + 0.4, fuse: t, proxy, burst: (pos) => flakBurst(g, pos, burst) });
  return t;
}
