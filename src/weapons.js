import * as THREE from 'three';

// Weapon roster. The Pulse Spinner is standard issue; the rest are bought at faction HQs.
export const WEAPONS = [
  { key: 'pulse', name: 'Pulse Spinner', unlock: null, delay: 0.55, desc: 'Homing splash disc' },
  { key: 'scatter', name: 'Vostok Scattergun', unlock: 'scatter', delay: 0.85, desc: 'Seven-pellet blast, mid range' },
  { key: 'rail', name: 'Daedalus Rail Lance', unlock: 'rail', delay: 1.6, desc: 'Instant piercing beam, long range' },
  { key: 'mortar', name: 'Rustmoon Junk Mortar', unlock: 'mortar', delay: 1.2, desc: 'Lobbed scrap bomb, huge blast' },
];

// The Vostok BTR-M turret cannon (vehicles.js turretFire): left mouse while driving the APC, fired from the barrel
// where the camera points, instead of the runner's weapons.
export const APC_CANNON = { key: 'apccannon', name: 'BTR-M 30 mm Cannon', delay: 0.5, desc: 'Heavy high-explosive shell from the turret' };

// The Rustmoon War-Rig's rotary gun (vehicles.js burstFire): the pirate gunner on the roof turns it where the camera
// points; left mouse fires a burst of `rounds` tracer rounds at `rate` a second, then the gun cools for `cool` s. Each round
// leaves the barrels up to `spread` rad off their line (a tight cone, not a hose).
export const RIG_GUN = { key: 'riggun', name: 'Scrap Rotary Gun', rounds: 20, rate: 12, cool: 2, spread: 0.018, speed: 320, damage: 7, desc: 'Twenty-round tracer bursts from the roof gunner' };

const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

export function weaponUnlocked(w, upgrades) {
  return !w.unlock || (upgrades[w.unlock] || 0) > 0;
}

// Fires `w` from `muzzle` toward `dir` (unit). Returns nothing; spawns projectiles or a beam.
export function fireWeapon(g, w, muzzle, dir, inherit, mult, homing) {
  const P = g.player;
  if (w.key === 'pulse') {
    g.projectiles.fire('player', muzzle, dir.clone().multiplyScalar(115).addScaledVector(inherit, 0.5), { damage: 34 * mult, splash: 7, color: g.cosmetics ? g.cosmetics.laserColor : 0x9be7ff, size: 0.45, knock: 1.6, homing });
    g.audio.shoot();
    g.haptics.play('pulse');
  } else if (w.key === 'scatter') {
    const right = _v.crossVectors(dir, P.up).normalize().clone();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    for (let i = 0; i < 7; i++) {
      const d = dir.clone().addScaledVector(right, (Math.random() - 0.5) * 0.13).addScaledVector(up, (Math.random() - 0.5) * 0.08).normalize();
      // ~200 m reach; 7 x 17 up close
      g.projectiles.fire('player', muzzle, d.multiplyScalar(175).addScaledVector(inherit, 0.6), { damage: 17 * mult, splash: 3, color: 0xffb02e, size: 0.27, knock: 0.6, life: 1.15 });
    }
    g.audio.burst(0.25, 2400, 0.4);
    g.haptics.play('scatter');
    g.cam.shake = Math.max(g.cam.shake, 0.25);
  } else if (w.key === 'rail') {
    // hitscan: pierces targets, buildings and traffic; ground and rock stop it. Ground marched in 4 m steps, then bisected.
    let len = 650;
    for (let t = 4; t <= 650; t += 4) {
      if (g.planet.altitude(_v.copy(muzzle).addScaledVector(dir, t)) >= 0) continue;
      let lo = t - 4, hi = t;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (g.planet.altitude(_v.copy(muzzle).addScaledVector(dir, mid)) < 0) hi = mid; else lo = mid;
      }
      len = lo;
      break;
    }
    const rock = g.planet.rockRay(muzzle, dir, len);
    if (rock < len) len = Math.max(0, rock - 0.05);
    const end = muzzle.clone().addScaledVector(dir, len);
    for (const t of g.enemies.targets()) {
      const rel = t.center.clone().sub(muzzle);
      const along = rel.dot(dir);
      if (along < 0 || along > len) continue;
      if (rel.addScaledVector(dir, -along).length() < t.radius + 1.2) {
        g.enemies.damage(t, 120 * mult, true);
        g.fx.explosion(t.center, 3, false);
      }
    }
    // also hits other blastables (outposts, road traffic): small blast-hook hits along its length
    if (g.blastHooks) for (let t = 6; t < len; t += 6) {
      _v.copy(muzzle).addScaledVector(dir, t);
      for (const fn of g.blastHooks) fn(_v.clone(), 3, 40 * mult, 'player');
    }
    g.fx.beam(muzzle, end, 0xc77dff);
    g.fx.explosion(end, 3, false);
    g.audio.tone(1600, 0.35, 'sawtooth', 0.15, 0.2);
    g.haptics.play('rail');
    g.cam.shake = Math.max(g.cam.shake, 0.35);
  } else if (w.key === 'mortar') {
    const d = dir.clone().addScaledVector(P.up, 0.28).normalize();
    g.projectiles.fire('player', muzzle, d.multiplyScalar(100).addScaledVector(inherit, 0.5), { damage: 70 * mult, splash: 13, color: 0x7dff3a, size: 0.8, knock: 2.2, gravity: 20, life: 6 });
    g.audio.tone(140, 0.3, 'square', 0.25, 0.5);
    g.haptics.play('mortar');
  }
}

// One APC cannon round: a tracer shell (projectiles.js type 'shell') plus muzzle flash.
// `muzzle` = barrel mouth, `dir` = barrel direction, `inherit` = vehicle velocity.
// One War-Rig round: a tracer (projectiles type 'round') along `dir` thrown off by up to RIG_GUN.spread, a muzzle flash
// and a short bark.
export function fireRound(g, muzzle, dir, inherit, mult = 1) {
  const right = _v.crossVectors(dir, Math.abs(dir.y) < 0.9 ? _up.set(0, 1, 0) : _up.set(1, 0, 0)).normalize();
  const up = _up.crossVectors(right, dir);
  const a = Math.random() * Math.PI * 2, r = RIG_GUN.spread * Math.sqrt(Math.random()); // even over the cone's disc
  const d = dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  g.projectiles.fire('player', muzzle, d.multiplyScalar(RIG_GUN.speed).addScaledVector(inherit, 0.6), {
    type: 'round', damage: RIG_GUN.damage * mult, splash: 1.6, color: 0xffb347, size: 0.14, knock: 0.3, gravity: 1.6, life: 1.8, spare: true,
  });
  g.fx.spawn(muzzle, dir.clone().multiplyScalar(18).add(inherit), { color: 0xffe08a, size: 0.45, life: 0.07, count: 3, spread: 2.5, drag: 5 });
  g.audio.tone(170 + Math.random() * 40, 0.05, 'square', 0.12, 0.4);
  g.audio.burst(0.05, 2600, 0.22);
  g.haptics.play('rotary');
  g.cam.shake = Math.max(g.cam.shake, 0.08);
}

export function fireCannon(g, muzzle, dir, inherit, mult = 1) {
  g.projectiles.fire('player', muzzle, dir.clone().multiplyScalar(170).addScaledVector(inherit, 0.6), {
    type: 'shell', damage: 55 * mult, splash: 9, color: 0xff8a2a, size: 0.5, knock: 2, gravity: 3, life: 3.2, spare: true,
  });
  const up = g.player.up;
  g.fx.spawn(muzzle, dir.clone().multiplyScalar(14).add(inherit), { color: 0xffe08a, size: 0.8, life: 0.18, count: 5, spread: 3, drag: 4 });
  g.fx.spawn(muzzle, dir.clone().multiplyScalar(5).addScaledVector(up, 1), { color: 0x4a4560, size: 1.0, life: 0.8, count: 4, spread: 2.5, drag: 1.5 });
  g.audio.tone(95, 0.3, 'square', 0.3, 0.35);
  g.audio.burst(0.3, 1600, 0.45);
  g.haptics.play('cannon');
  g.cam.shake = Math.max(g.cam.shake, 0.3);
}
