import * as THREE from 'three';
import { PHYS, WORLD } from './config.js';

const CELL = 64;

// Static obstacle set (domes, buildings, boulders) in a spatial hash.
export class Colliders {
  constructor() {
    this.list = [];
    this.grid = new Map();
    this.stamp = 0;
  }

  key(cx, cz) { return cx * 4096 + cz; }

  add(c) {
    if (c.type === 'box') {
      c.cos = Math.cos(c.yaw || 0);
      c.sin = Math.sin(c.yaw || 0);
      c.br = Math.hypot(c.hx, c.hz);
    } else c.br = c.r;
    c._s = 0;
    this.list.push(c);
    const x0 = Math.floor((c.x - c.br) / CELL), x1 = Math.floor((c.x + c.br) / CELL);
    const z0 = Math.floor((c.z - c.br) / CELL), z1 = Math.floor((c.z + c.br) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this.key(cx, cz);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
    return c;
  }

  query(x, z, r, out = []) {
    out.length = 0;
    this.stamp++;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const cell = this.grid.get(this.key(cx, cz));
      if (!cell) continue;
      for (const c of cell) {
        if (c._s === this.stamp) continue;
        c._s = this.stamp;
        out.push(c);
      }
    }
    return out;
  }

  // Contact between a sphere at p (radius r) and collider c. Returns penetration depth and writes normal.
  contact(c, p, r, n) {
    if (c.type === 'sphere') {
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const pen = c.r + r - d;
      if (pen <= 0) return 0;
      if (d < 1e-5) n.set(0, 1, 0); else n.set(dx / d, dy / d, dz / d);
      return pen;
    }
    if (c.type === 'cyl') {
      const dx = p.x - c.x, dz = p.z - c.z;
      const rad = Math.sqrt(dx * dx + dz * dz);
      const qy = Math.min(Math.max(p.y, c.y0), c.y1);
      const inR = rad < c.r;
      if (inR && p.y >= c.y0 && p.y <= c.y1) {
        const side = c.r - rad, top = c.y1 - p.y;
        if (top < side) { n.set(0, 1, 0); return top + r; }
        n.set(dx / (rad || 1), 0, dz / (rad || 1));
        return side + r;
      }
      const s = inR ? 1 : c.r / rad;
      const qx = c.x + dx * s, qz = c.z + dz * s;
      const ex = p.x - qx, ey = p.y - qy, ez = p.z - qz;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d >= r) return 0;
      if (d < 1e-5) n.set(0, 1, 0); else n.set(ex / d, ey / d, ez / d);
      return r - d;
    }
    // oriented box (yaw only)
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx));
    const qy = Math.max(-c.hy, Math.min(c.hy, dy));
    const qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let ex = lx - qx, ey = dy - qy, ez = lz - qz;
    let d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    let pen;
    if (d < 1e-5) {
      // centre inside the box: push along the axis of least penetration
      const px = c.hx - Math.abs(lx), py = c.hy - Math.abs(dy), pz = c.hz - Math.abs(lz);
      if (py <= px && py <= pz) { ex = 0; ey = Math.sign(dy) || 1; ez = 0; pen = py + r; }
      else if (px <= pz) { ex = Math.sign(lx) || 1; ey = 0; ez = 0; pen = px + r; }
      else { ex = 0; ey = 0; ez = Math.sign(lz) || 1; pen = pz + r; }
      d = 1;
    } else {
      if (d >= r) return 0;
      pen = r - d;
    }
    ex /= d; ey /= d; ez /= d;
    // rotate local normal back to world
    n.set(ex * c.cos + ez * c.sin, ey, -ex * c.sin + ez * c.cos);
    return pen;
  }
}

const _n = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _w = new THREE.Vector3();
const _gt = new THREE.Vector3();
const _near = [];

export function makeBody(pos) {
  return {
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    grounded: false,
    groundN: new THREE.Vector3(0, 1, 0),
    energy: PHYS.maxEnergy,
    maxEnergy: PHYS.maxEnergy,
    airTime: 0,
    thrusting: false,
    skating: false,
    lastLat: 0,
  };
}

// Shared movement model for the player and pirate skaters.
// input: { wish: Vector3 (horizontal, len<=1), skates, thrust, jump, thrustDir }
// Returns array of impacts { speed, kind:'ground'|'obstacle', normal }.
export function stepSkater(b, input, dt, terrain, colliders, params = PHYS, impacts = []) {
  impacts.length = 0;
  const v = b.vel;
  const G = params.gravity;
  b.skating = !!input.skates;
  v.y -= G * dt;

  const wish = _w.copy(input.wish);
  const n = b.groundN;
  let lat = 0;

  if (b.grounded) {
    wish.addScaledVector(n, -wish.dot(n));
    const wl = wish.length();
    if (wl > 1e-4) wish.multiplyScalar(Math.min(1, input.wish.length()) / wl);
    const speed = v.length();
    if (input.skates) {
      if (speed < params.skatePushMax) v.addScaledVector(wish, params.skatePush * dt);
      if (speed > 2) {
        const vh = _tmp.copy(v).divideScalar(speed);
        const latV = wish.clone().addScaledVector(vh, -wish.dot(vh));
        lat = latV.length();
        v.addScaledVector(latV, params.carve * dt);
        v.setLength(Math.max(speed, Math.min(v.length(), params.skatePushMax)));
        // slope assist: the cushion converts some of the downhill pull into extra speed
        _gt.set(0, -G, 0).addScaledVector(n, G * n.y);
        const along = _gt.dot(vh);
        if (along > 0) v.addScaledVector(vh, along * params.slopeAssist * dt);
      }
      v.multiplyScalar(1 - params.skateFriction * dt);
    } else {
      // boots: strong friction + running
      const vn = v.dot(n);
      const tang = _tmp.copy(v).addScaledVector(n, -vn);
      const ts = tang.length();
      const target = wish.clone().multiplyScalar(params.runSpeed);
      if (ts > params.runSpeed * 1.05) {
        const dec = Math.min(ts, (params.brakeDecel + ts * 0.12) * dt);
        v.addScaledVector(tang, -dec / ts);
        if (wish.lengthSq() > 0.01) v.addScaledVector(wish, params.runAccel * 0.3 * dt);
      } else {
        const diff = target.sub(tang);
        const dl = diff.length();
        const maxA = params.runAccel * dt;
        if (dl > maxA) diff.multiplyScalar(maxA / dl);
        v.add(diff);
      }
    }
    if (input.jump && b.energy >= params.jumpCost) {
      v.addScaledVector(n, params.jumpSpeed * 0.4);
      v.y += params.jumpSpeed;
      b.energy -= params.jumpCost;
      b.grounded = false;
      b.jumped = true;
    }
  } else {
    v.addScaledVector(wish, params.airControl * dt);
  }
  b.lastLat = lat;

  b.thrusting = false;
  if (input.thrust && b.energy > 0) {
    v.addScaledVector(input.thrustDir, params.thrustAccel * dt);
    b.energy = Math.max(0, b.energy - params.thrustDrain * dt);
    b.thrusting = true;
  } else {
    b.energy = Math.min(b.maxEnergy, b.energy + params.energyRegen * dt);
  }

  const sp = v.length();
  if (sp > 0) v.multiplyScalar(Math.max(0, 1 - params.drag * sp * dt));

  b.pos.addScaledVector(v, dt);

  // arena bounds
  const rd = Math.hypot(b.pos.x, b.pos.z);
  if (rd > WORLD.playRadius) {
    const s = WORLD.playRadius / rd;
    b.pos.x *= s; b.pos.z *= s;
    const nx = b.pos.x / WORLD.playRadius, nz = b.pos.z / WORLD.playRadius;
    const out = v.x * nx + v.z * nz;
    if (out > 0) { v.x -= nx * out * 1.6; v.z -= nz * out * 1.6; }
  }

  // terrain contact
  const h = terrain.height(b.pos.x, b.pos.z);
  terrain.normal(b.pos.x, b.pos.z, _n);
  const wasGrounded = b.grounded;
  if (b.pos.y <= h) {
    b.pos.y = h;
    const vn = v.dot(_n);
    if (vn < 0) {
      const impact = -vn;
      if (input.skates) {
        v.addScaledVector(_n, -vn);
      } else {
        const e = impact > 7 ? 0.28 : 0;
        v.addScaledVector(_n, -vn * (1 + e));
      }
      if (!wasGrounded && impact > 3) impacts.push({ speed: impact, kind: 'ground', normal: _n.clone() });
      else if (impact > (input.skates ? params.skateSafeImpact : params.bootSafeImpact)) impacts.push({ speed: impact, kind: 'ground', normal: _n.clone() });
    }
    b.grounded = true;
    b.groundN.copy(_n);
  } else if (b.pos.y - h < 0.3 && wasGrounded && (!input.skates || sp < 12) && v.dot(_n) < 1.5) {
    // stick to the ground when walking / slow
    b.pos.y = h;
    const vn = v.dot(_n);
    if (vn > 0) v.addScaledVector(_n, -vn);
    b.grounded = true;
    b.groundN.copy(_n);
  } else {
    b.grounded = b.pos.y - h < 0.12;
    if (b.grounded) b.groundN.copy(_n);
  }

  // obstacles
  if (colliders) {
    const r = params.radius;
    const cp = _tmp.set(b.pos.x, b.pos.y + r, b.pos.z);
    const near = colliders.query(cp.x, cp.z, r + 2, _near);
    for (const c of near) {
      const pen = colliders.contact(c, cp, r, _n);
      if (pen <= 0) continue;
      b.pos.addScaledVector(_n, pen);
      cp.addScaledVector(_n, pen);
      const vn = v.dot(_n);
      if (vn < 0) {
        if (_n.y > 0.55) {
          // walkable top surface (dome roofs, rooftops): glide over it
          v.addScaledVector(_n, -vn);
          b.grounded = true;
          b.groundN.copy(_n);
          if (-vn > (input.skates ? params.skateSafeImpact : params.bootSafeImpact)) impacts.push({ speed: -vn, kind: 'obstacle', normal: _n.clone() });
        } else {
          const e = 0.35;
          v.addScaledVector(_n, -vn * (1 + e));
          if (-vn > 4) impacts.push({ speed: -vn, kind: 'obstacle', normal: _n.clone() });
        }
      }
    }
  }

  if (b.grounded) b.airTime = 0; else b.airTime += dt;
  return impacts;
}
