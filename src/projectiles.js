import * as THREE from 'three';
import { upAt, radOf, setRad } from './geo.js';
import { shatterEcho } from './monolith.js';

const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _near = [];
const _pt = new THREE.Vector3();
const STEP = 1; // m: the longest stretch of a frame's flight tested for walls and ground in one go (thin walls are under a metre through)
const MAX_STEPS = 40;

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
    // APC cannon shell: a capsule along z with an additive halo (shared by all)
    this.shellGeo = new THREE.CapsuleGeometry(0.42, 1.5, 4, 8).rotateX(Math.PI / 2);
    this.shellGlow = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  // range: burst after this many metres of flight (a shot fired at speed keeps its reach);
  // fuse: burst after this many s; proxy: burst within this distance of the player; burst(pos): custom detonation
  // instead of the explosion (Kade's flak). type: 'bolt' (glowing ball stretched along its flight) or 'shell' (APC
  // tracer: fixed-length haloed capsule trailing sparks and smoke)
  fire(owner, pos, vel, { damage = 20, splash = 5, color = 0x9be7ff, size = 0.45, life = 4, gravity = 0, knock = 1, homing = 0, spare = false, fuse = 0, proxy = 0, burst = null, type = 'bolt', range = 0 } = {}) {
    const shell = type === 'shell';
    const mesh = new THREE.Mesh(shell ? this.shellGeo : this.geo, new THREE.MeshBasicMaterial({ color: shell ? 0xfff1c0 : color }));
    const hull = new THREE.Mesh(shell ? this.shellGeo : this.geo, this.inkMat);
    hull.scale.setScalar(shell ? 1.3 : 1.35);
    mesh.add(hull);
    if (shell) {
      const halo = new THREE.Mesh(this.shellGeo, this.shellGlow);
      halo.scale.set(1.9, 1.9, 1.4);
      mesh.add(halo);
    }
    mesh.scale.setScalar(size);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.list.push({ owner, mesh, pos: pos.clone(), prev: pos.clone(), vel: vel.clone(), damage, splash, life, gravity, knock, size, color, homing, spare, age: 0, fuse, proxy, burst, type, range });
  }

  update(dt, wdt = dt) {
    const g = this.game;
    const planet = g.planet;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const pdt = p.owner === 'player' ? dt : wdt; // the Monolith's time dilation slows everyone's shots but yours
      p.life -= pdt;
      p.prev.copy(p.pos);
      if (p.gravity) p.vel.addScaledVector(upAt(p.pos, _rel), -p.gravity * pdt);
      p.age += pdt;
      if (p.homing > 0 && p.age > 0.08) this.home(p, pdt);
      let step = pdt, spent = false;
      const flown = p.vel.length() * pdt;
      if (p.range > 0) { // out of reach: stops where its range ends this frame
        if (flown >= p.range) { step = flown > 0 ? (pdt * p.range) / flown : 0; spent = true; }
        p.range -= flown;
      }
      p.pos.addScaledVector(p.vel, step);
      p.mesh.position.copy(p.pos);
      // stretch along velocity for a comic smear
      const sp = p.vel.length();
      upAt(p.pos, p.mesh.up);
      p.mesh.lookAt(_rel.copy(p.pos).add(p.vel));
      if (p.type === 'shell') {
        p.mesh.scale.setScalar(p.size);
        // sparks and a thin smoke line
        g.fx.spawn(p.pos, _rel.copy(p.vel).multiplyScalar(-0.04), { color: p.color, size: 0.5, life: 0.35, count: 1, spread: 0.5, drag: 2 });
        g.fx.spawn(p.pos, _rel.set(0, 0, 0), { color: 0x4a4560, size: 0.75, life: 0.9, count: 1, spread: 0.7, drag: 1 });
      } else p.mesh.scale.set(p.size, p.size, p.size * (1 + Math.min(4, sp / 40)));

      let hit = p.life <= 0 || (p.fuse > 0 && p.age >= p.fuse) || (p.proxy > 0 && !g.player.dead && p.pos.distanceTo(g.player.center) < p.proxy);
      if (!hit) {
        // swept: the frame's flight in steps of at most STEP metres, so a fast shot can't skip a thin wall or a ridge; it stops where it first touches
        const span = p.prev.distanceTo(p.pos), n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(span / STEP)));
        const near = g.colliders.query(_pt.addVectors(p.prev, p.pos).multiplyScalar(0.5), span / 2 + 2, _near);
        for (let j = 1; j <= n && !hit; j++) {
          _pt.lerpVectors(p.prev, p.pos, j / n);
          const sr = planet.surface(_pt);
          if (radOf(_pt) <= sr) { hit = true; setRad(_pt, sr + 0.3); }
          else for (const c of near) if (g.colliders.contact(c, _pt, 0.3, _seg) > 0) { hit = true; break; }
        }
        if (hit) { p.pos.copy(_pt); p.mesh.position.copy(p.pos); }
      }
      if (!hit) {
        if (p.owner === 'player') {
          for (const t of g.enemies.targets()) {
            if (t.faction === 'ally') continue; // your shots pass your backup by
            if (segSphere(p.prev, p.pos, t.center, t.radius + 0.4)) { hit = true; break; }
          }
          // civilians, road vehicles (land-train trailers too) and Moon Mites stop shots as well
          if (!hit && g.civilians && g.civilians.segHit(p.prev, p.pos)) hit = true;
          if (!hit && g.world.traffic && g.world.traffic.segHit(p.prev, p.pos)) hit = true;
          if (!hit && g.alchemy && g.alchemy.segHitMite(p.prev, p.pos)) hit = true;
        } else if (p.owner === 'ally') {
          // backup's shots: only the chapter's hostiles (and a stormed base's guns) stop them
          for (const t of g.enemies.targets()) {
            if (g.enemies.allyTarget(t) && segSphere(p.prev, p.pos, t.center, t.radius + 0.4)) { hit = true; break; }
          }
        } else {
          if (!g.player.dead && segSphere(p.prev, p.pos, g.player.center, 1.3)) hit = true;
          // the backup soaks hostile fire too
          if (!hit) for (const t of g.enemies.list) if (t.faction === 'ally' && !t.dead && segSphere(p.prev, p.pos, t.center, t.radius + 0.4)) { hit = true; break; }
          // Monolith echo holograms soak a shot each
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
      if (spent) hit = true; // (after the swept tests: a wall or a target before the range ran out still takes it)
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
