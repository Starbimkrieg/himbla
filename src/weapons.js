import * as THREE from 'three';

// Weapon roster. The Pulse Spinner is standard issue; the rest are bought at faction HQs.
export const WEAPONS = [
  { key: 'pulse', name: 'Pulse Spinner', unlock: null, delay: 0.55, desc: 'Homing splash disc' },
  { key: 'scatter', name: 'Vostok Scattergun', unlock: 'scatter', delay: 0.85, desc: 'Seven-pellet blast, mid range' },
  { key: 'rail', name: 'Daedalus Rail Lance', unlock: 'rail', delay: 1.6, desc: 'Instant piercing beam, long range' },
  { key: 'mortar', name: 'Rustmoon Junk Mortar', unlock: 'mortar', delay: 1.2, desc: 'Lobbed scrap bomb, huge blast' },
];

const _v = new THREE.Vector3();

export function weaponUnlocked(w, upgrades) {
  return !w.unlock || (upgrades[w.unlock] || 0) > 0;
}

// Fires `w` from `muzzle` toward `dir` (unit). Returns nothing; spawns projectiles or a beam.
export function fireWeapon(g, w, muzzle, dir, inherit, mult, homing) {
  const P = g.player;
  if (w.key === 'pulse') {
    g.projectiles.fire('player', muzzle, dir.clone().multiplyScalar(115).addScaledVector(inherit, 0.5), { damage: 34 * mult, splash: 7, color: g.cosmetics ? g.cosmetics.laserColor : 0x9be7ff, size: 0.45, knock: 1.6, homing });
    g.audio.shoot();
  } else if (w.key === 'scatter') {
    const right = _v.crossVectors(dir, P.up).normalize().clone();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    for (let i = 0; i < 7; i++) {
      const d = dir.clone().addScaledVector(right, (Math.random() - 0.5) * 0.13).addScaledVector(up, (Math.random() - 0.5) * 0.08).normalize();
      // (~200 m of reach; 7 x 17 up close)
      g.projectiles.fire('player', muzzle, d.multiplyScalar(175).addScaledVector(inherit, 0.6), { damage: 17 * mult, splash: 3, color: 0xffb02e, size: 0.27, knock: 0.6, life: 1.15 });
    }
    g.audio.burst(0.25, 2400, 0.4);
    g.cam.shake = Math.max(g.cam.shake, 0.25);
  } else if (w.key === 'rail') {
    // hitscan: stops at the ground, pierces everything in between
    let len = 650;
    for (let i = 1; i <= 80; i++) {
      const t = (i / 80) * 650;
      _v.copy(muzzle).addScaledVector(dir, t);
      if (g.planet.altitude(_v) < 0) { len = t; break; }
    }
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
    // the beam also chews through anything else that can be blown up (outposts, road traffic):
    // feed the blast hooks small hits along its length (a big target takes several)
    if (g.blastHooks) for (let t = 6; t < len; t += 6) {
      _v.copy(muzzle).addScaledVector(dir, t);
      for (const fn of g.blastHooks) fn(_v.clone(), 3, 40 * mult, 'player');
    }
    g.fx.beam(muzzle, end, 0xc77dff);
    g.fx.explosion(end, 3, false);
    g.audio.tone(1600, 0.35, 'sawtooth', 0.15, 0.2);
    g.cam.shake = Math.max(g.cam.shake, 0.35);
  } else if (w.key === 'mortar') {
    const d = dir.clone().addScaledVector(P.up, 0.28).normalize();
    g.projectiles.fire('player', muzzle, d.multiplyScalar(100).addScaledVector(inherit, 0.5), { damage: 70 * mult, splash: 13, color: 0x7dff3a, size: 0.8, knock: 2.2, gravity: 20, life: 6 });
    g.audio.tone(140, 0.3, 'square', 0.25, 0.5);
  }
}
