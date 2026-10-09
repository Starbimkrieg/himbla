import * as THREE from 'three';
import { shatterEcho } from './monolith.js';

const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _near = [];

function segSphere(a, b, c, r) {
  _seg.subVectors(b, a);
  const L2 = _seg.lengthSq();
  let t = L2 > 0 ? _rel.subVectors(c, a).dot(_seg) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + _seg.x * t - c.x, py = a.y + _seg.y * t - c.y, pz = a.z + _seg.z * t - c.z;
  return px * px + py * py + pz * pz <= r * r;
}

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geo = new THREE.SphereGeometry(1, 10, 8);
    this.inkMat = new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide });
  }

  // fuse: burst after this many seconds; proxy: burst within this distance of the player;
  // burst(pos): a custom detonation instead of the usual explosion (Kade's flak)
  fire(owner, pos, vel, { damage = 20, splash = 5, color = 0x9be7ff, size = 0.45, life = 4, gravity = 0, knock = 1, homing = 0, spare = false, fuse = 0, proxy = 0, burst = null } = {}) {
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
    const hull = new THREE.Mesh(this.geo, this.inkMat);
    hull.scale.setScalar(1.35);
    mesh.add(hull);
    mesh.scale.setScalar(size);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.list.push({ owner, mesh, pos: pos.clone(), prev: pos.clone(), vel: vel.clone(), damage, splash, life, gravity, knock, size, color, homing, spare, age: 0, fuse, proxy, burst });
  }

  update(dt, wdt = dt) {
    const g = this.game;
    const planet = g.planet;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const pdt = p.owner === 'player' ? dt : wdt; // the Monolith's time dilation slows everyone's shots but yours
      p.life -= pdt;
      p.prev.copy(p.pos);
      if (p.gravity) p.vel.addScaledVector(_rel.copy(p.pos).normalize(), -p.gravity * pdt);
      p.age += pdt;
      if (p.homing > 0 && p.age > 0.08) this.home(p, pdt);
      p.pos.addScaledVector(p.vel, pdt);
      p.mesh.position.copy(p.pos);
      // stretch along velocity for a comic smear
      const sp = p.vel.length();
      p.mesh.up.copy(p.pos).normalize();
      p.mesh.lookAt(_rel.copy(p.pos).add(p.vel));
      p.mesh.scale.set(p.size, p.size, p.size * (1 + Math.min(4, sp / 40)));

      let hit = p.life <= 0 || (p.fuse > 0 && p.age >= p.fuse) || (p.proxy > 0 && !g.player.dead && p.pos.distanceTo(g.player.center) < p.proxy);
      if (!hit) {
        const sr = planet.surface(p.pos);
        if (p.pos.length() <= sr) { hit = true; p.pos.setLength(sr + 0.3); }
      }
      if (!hit) {
        for (const c of g.colliders.query(p.pos, 2, _near)) {
          if (g.colliders.contact(c, p.pos, 0.3, _seg) > 0) { hit = true; break; }
        }
      }
      if (!hit) {
        if (p.owner === 'player') {
          for (const t of g.enemies.targets()) {
            if (segSphere(p.prev, p.pos, t.center, t.radius + 0.4)) { hit = true; break; }
          }
          // people on foot (civilians.js) stop a shot too, and so do road vehicles (land-train
          // trailers included) and Moon Mites
          if (!hit && g.civilians && g.civilians.segHit(p.prev, p.pos)) hit = true;
          if (!hit && g.world.traffic && g.world.traffic.segHit(p.prev, p.pos)) hit = true;
          if (!hit && g.alchemy && g.alchemy.segHitMite(p.prev, p.pos)) hit = true;
        } else {
          if (!g.player.dead && segSphere(p.prev, p.pos, g.player.center, 1.3)) hit = true;
          // the Monolith's echo holograms soak up a shot each
          for (const d of g.decoys) if (segSphere(p.prev, p.pos, d.center, d.radius)) { hit = true; shatterEcho(g, d); p.burst = () => {}; break; }
          for (const o of g.events.protect) if (!o.dead && segSphere(p.prev, p.pos, o.center, o.radius + 0.4)) { hit = true; break; }
          // defense turrets fire on pirates too
          if (!hit && p.owner === 'mil') {
            for (const t of g.enemies.targets()) {
              if (t.faction !== 'pirate' || t.kind === 'core') continue;
              if (segSphere(p.prev, p.pos, t.center, t.radius + 0.4)) { hit = true; break; }
            }
          }
        }
      }
      if (hit) {
        if (p.burst) p.burst(p.pos.clone());
        else g.explode(p.pos, p.splash, p.damage, p.owner, p.knock, p.spare);
        g.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  // Gentle homing: bend toward the best target inside a forward cone, keeping speed.
  home(p, dt) {
    const g = this.game;
    const sp = p.vel.length();
    const fwd = _seg.copy(p.vel).divideScalar(sp);
    let best = null, bestScore = 0;
    for (const t of g.enemies.targets()) {
      if (!g.enemies.isHostileTarget(t)) continue;
      _rel.subVectors(t.center, p.pos);
      const d = _rel.length();
      if (d > 280 || d < 1) continue;
      const cos = _rel.dot(fwd) / d;
      if (cos < 0.55) continue;
      const score = cos / (1 + d / 120);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) return;
    _rel.subVectors(best.center, p.pos).normalize();
    const ang = Math.acos(Math.min(1, fwd.dot(_rel)));
    if (ang < 1e-4) return;
    const k = Math.min(1, (p.homing * dt) / ang);
    fwd.lerp(_rel, k).normalize();
    p.vel.copy(fwd).multiplyScalar(sp);
  }

  clear() {
    for (const p of this.list) { this.game.scene.remove(p.mesh); p.mesh.material.dispose(); }
    this.list.length = 0;
  }
}
