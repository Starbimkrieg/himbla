import * as THREE from 'three';

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

  fire(owner, pos, vel, { damage = 20, splash = 5, color = 0x9be7ff, size = 0.45, life = 4, gravity = 0, knock = 1 } = {}) {
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
    const hull = new THREE.Mesh(this.geo, this.inkMat);
    hull.scale.setScalar(1.35);
    mesh.add(hull);
    mesh.scale.setScalar(size);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.list.push({ owner, mesh, pos: pos.clone(), prev: pos.clone(), vel: vel.clone(), damage, splash, life, gravity, knock, size, color });
  }

  update(dt) {
    const g = this.game;
    const terrain = g.terrain;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.prev.copy(p.pos);
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      // stretch along velocity for a comic smear
      const sp = p.vel.length();
      p.mesh.lookAt(_rel.copy(p.pos).add(p.vel));
      p.mesh.scale.set(p.size, p.size, p.size * (1 + Math.min(4, sp / 40)));

      let hit = p.life <= 0;
      if (!hit && p.pos.y <= terrain.height(p.pos.x, p.pos.z)) {
        hit = true;
        p.pos.y = terrain.height(p.pos.x, p.pos.z) + 0.3;
      }
      if (!hit) {
        for (const c of g.colliders.query(p.pos.x, p.pos.z, 2, _near)) {
          if (g.colliders.contact(c, p.pos, 0.3, _seg) > 0) { hit = true; break; }
        }
      }
      if (!hit) {
        if (p.owner === 'player') {
          for (const t of g.enemies.targets()) {
            if (segSphere(p.prev, p.pos, t.center, t.radius + 0.4)) { hit = true; break; }
          }
        } else if (!g.player.dead) {
          if (segSphere(p.prev, p.pos, g.player.center, 1.3)) hit = true;
        }
      }
      if (hit) {
        g.explode(p.pos, p.splash, p.damage, p.owner, p.knock, p.color);
        g.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) { this.game.scene.remove(p.mesh); p.mesh.material.dispose(); }
    this.list.length = 0;
  }
}
