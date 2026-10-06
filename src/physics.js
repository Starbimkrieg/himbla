import * as THREE from 'three';
import { PHYS } from './config.js';

const CELL = 64;
const OFF = 512;

// Static obstacles (domes, buildings, boulders) in a 3D spatial hash.
// Collider shapes (world space):
//   sphere { c, r }
//   box    { c, ax, ay, az (unit axes), hx, hy, hz }
//   cyl    { c (base on axis), axis, y0, y1, r }
export class Colliders {
  constructor() {
    this.grid = new Map();
    this.stamp = 0;
    this.count = 0;
  }

  key(x, y, z) { return ((x + OFF) * 1024 + (y + OFF)) * 1024 + (z + OFF); }

  add(c) {
    if (c.type === 'box') {
      c.br = Math.hypot(c.hx, c.hy, c.hz);
      c.mid = c.c;
    } else if (c.type === 'cyl') {
      const hmax = Math.max(Math.abs(c.y0), Math.abs(c.y1));
      c.br = Math.hypot(c.r, (c.y1 - c.y0) / 2) + 0.5;
      c.mid = c.c.clone().addScaledVector(c.axis, (c.y0 + c.y1) / 2);
      c.hmax = hmax;
    } else {
      c.br = c.r;
      c.mid = c.c;
    }
    c._s = 0;
    c.keys = [];
    const m = c.mid, r = c.br;
    for (let x = Math.floor((m.x - r) / CELL); x <= Math.floor((m.x + r) / CELL); x++)
      for (let y = Math.floor((m.y - r) / CELL); y <= Math.floor((m.y + r) / CELL); y++)
        for (let z = Math.floor((m.z - r) / CELL); z <= Math.floor((m.z + r) / CELL); z++) {
          const k = this.key(x, y, z);
          let cell = this.grid.get(k);
          if (!cell) { cell = []; this.grid.set(k, cell); }
          cell.push(c);
          c.keys.push(k);
        }
    this.count++;
    return c;
  }

  remove(c) {
    for (const k of c.keys) {
      const cell = this.grid.get(k);
      if (!cell) continue;
      const i = cell.indexOf(c);
      if (i >= 0) cell.splice(i, 1);
      if (!cell.length) this.grid.delete(k);
    }
    c.keys = [];
    this.count--;
  }

  query(p, r, out = []) {
    out.length = 0;
    this.stamp++;
    for (let x = Math.floor((p.x - r) / CELL); x <= Math.floor((p.x + r) / CELL); x++)
      for (let y = Math.floor((p.y - r) / CELL); y <= Math.floor((p.y + r) / CELL); y++)
        for (let z = Math.floor((p.z - r) / CELL); z <= Math.floor((p.z + r) / CELL); z++) {
          const cell = this.grid.get(this.key(x, y, z));
          if (!cell) continue;
          for (const c of cell) {
            if (c._s === this.stamp) continue;
            c._s = this.stamp;
            out.push(c);
          }
        }
    return out;
  }

  // Penetration depth of sphere (p, r) into c; writes the push-out normal into n.
  contact(c, p, r, n) {
    const dx = p.x - c.c.x, dy = p.y - c.c.y, dz = p.z - c.c.z;
    if (c.type === 'sphere') {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const pen = c.r + r - d;
      if (pen <= 0) return 0;
      if (d < 1e-5) n.set(0, 1, 0); else n.set(dx / d, dy / d, dz / d);
      return pen;
    }
    if (c.type === 'cyl') {
      const a = c.axis;
      const h = dx * a.x + dy * a.y + dz * a.z;
      const rx = dx - a.x * h, ry = dy - a.y * h, rz = dz - a.z * h;
      const rad = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const inR = rad < c.r;
      if (inR && h >= c.y0 && h <= c.y1) {
        const side = c.r - rad, top = c.y1 - h;
        if (top < side) { n.copy(a); return top + r; }
        if (rad < 1e-5) n.copy(a); else n.set(rx / rad, ry / rad, rz / rad);
        return side + r;
      }
      const qh = Math.min(Math.max(h, c.y0), c.y1);
      const s = inR ? 1 : c.r / rad;
      const ex = dx - (rx * s + a.x * qh), ey = dy - (ry * s + a.y * qh), ez = dz - (rz * s + a.z * qh);
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d >= r) return 0;
      if (d < 1e-5) n.copy(a); else n.set(ex / d, ey / d, ez / d);
      return r - d;
    }
    // oriented box
    const lx = dx * c.ax.x + dy * c.ax.y + dz * c.ax.z;
    const ly = dx * c.ay.x + dy * c.ay.y + dz * c.ay.z;
    const lz = dx * c.az.x + dy * c.az.y + dz * c.az.z;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx));
    const qy = Math.max(-c.hy, Math.min(c.hy, ly));
    const qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let ex = lx - qx, ey = ly - qy, ez = lz - qz;
    let d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    let pen;
    if (d < 1e-5) {
      const px = c.hx - Math.abs(lx), py = c.hy - Math.abs(ly), pz = c.hz - Math.abs(lz);
      if (py <= px && py <= pz) { ex = 0; ey = Math.sign(ly) || 1; ez = 0; pen = py + r; }
      else if (px <= pz) { ex = Math.sign(lx) || 1; ey = 0; ez = 0; pen = px + r; }
      else { ex = 0; ey = 0; ez = Math.sign(lz) || 1; pen = pz + r; }
      d = 1;
    } else {
      if (d >= r) return 0;
      pen = r - d;
    }
    ex /= d; ey /= d; ez /= d;
    n.set(c.ax.x * ex + c.ay.x * ey + c.az.x * ez, c.ax.y * ex + c.ay.y * ey + c.az.y * ez, c.ax.z * ex + c.ay.z * ey + c.az.z * ez);
    return pen;
  }
}

const _n = new THREE.Vector3();
const _sn = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _w = new THREE.Vector3();
const _gt = new THREE.Vector3();
const _up = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _near = [];

export function makeBody(pos) {
  return {
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    up: pos.clone().normalize(),
    grounded: false,
    groundN: pos.clone().normalize(),
    energy: PHYS.maxEnergy,
    maxEnergy: PHYS.maxEnergy,
    airTime: 0,
    sinceContact: 0,
    altitude: 0,
    thrusting: false,
    skating: false,
    lastLat: 0,
    platform: null,
    onLake: null,
  };
}

// Shared movement model for the player and pirate skaters, on a spherical moon:
// gravity points to the centre, "up" is the local radial direction.
// input: { wish: Vector3 (tangent, len<=1), skates, thrust, jump, thrustDir }
// Returns array of impacts { speed, kind:'ground'|'obstacle', normal }.
export function stepSkater(b, input, dt, planet, colliders, params = PHYS, impacts = []) {
  impacts.length = 0;
  const v = b.vel;
  const G = params.gravity;
  const up = _up.copy(b.pos).normalize();
  b.up.copy(up);
  b.skating = !!input.skates;
  v.addScaledVector(up, -G * dt);

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
        // Steering: the sideways part of your input (relative to where you're going) sets a
        // turn rate. Full A/D = hardest carve, W+A = a gentle one. Speed is preserved.
        _lat.copy(wish).addScaledVector(vh, -wish.dot(vh));
        lat = _lat.length();
        if (lat > 1e-3) {
          const side = Math.sign(_gt.crossVectors(vh, _lat).dot(n)) || 1;
          v.applyAxisAngle(n, side * params.handling * (1 + 8 / (speed + 4)) * Math.min(1, lat) * dt);
          vh.copy(v).divideScalar(speed);
        }
        // slope assist: the cushion converts some of the downhill pull into extra speed
        _gt.copy(up).multiplyScalar(-G);
        _gt.addScaledVector(n, -_gt.dot(n));
        const along = _gt.dot(vh);
        if (along > 0) v.addScaledVector(vh, along * params.slopeAssist * dt);
      }
      v.multiplyScalar(1 - params.skateFriction * dt);
    } else {
      const vn = v.dot(n);
      const tang = _tmp.copy(v).addScaledVector(n, -vn);
      const ts = tang.length();
      if (ts > params.runSpeed * 1.05) {
        const dec = Math.min(ts, (params.brakeDecel + ts * 0.12) * dt);
        v.addScaledVector(tang, -dec / ts);
        if (wish.lengthSq() > 0.01) v.addScaledVector(wish, params.runAccel * 0.3 * dt);
      } else {
        const diff = _tgt.copy(wish).multiplyScalar(params.runSpeed).sub(tang);
        const dl = diff.length();
        const maxA = params.runAccel * dt;
        if (dl > maxA) diff.multiplyScalar(maxA / dl);
        v.add(diff);
      }
    }
    if (input.jump && b.energy >= params.jumpCost) {
      v.addScaledVector(n, params.jumpSpeed * 0.4);
      v.addScaledVector(up, params.jumpSpeed);
      b.energy -= params.jumpCost;
      b.grounded = false;
      b.sinceContact = params.gripWindow + 1; // a jump breaks the magnetic grip
      b.jumped = true;
    }
  } else {
    wish.addScaledVector(up, -wish.dot(up));
    v.addScaledVector(wish, params.airControl * dt);
  }
  b.lastLat = lat;

  // Magnetic grip: pull into the surface while (nearly) in contact, so the skates hold
  // the line over small bumps. A real launch climbs out of range and flies free.
  if (input.skates && b.sinceContact < params.gripWindow && b.altitude < params.gripRange) {
    v.addScaledVector(b.groundN, -params.grip * dt);
  }

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

  // terrain contact
  const sr = planet.surface(b.pos, _sn);
  const len = b.pos.length();
  const alt = len - sr;
  const wasGrounded = b.grounded;
  if (alt <= 0) {
    b.pos.multiplyScalar(sr / len);
    const vn = v.dot(_sn);
    if (vn < 0) {
      const impact = -vn;
      if (input.skates) v.addScaledVector(_sn, -vn);
      else v.addScaledVector(_sn, -vn * (1 + (impact > 7 ? 0.28 : 0)));
      if (!wasGrounded && impact > 3) impacts.push({ speed: impact, kind: 'ground', normal: _sn.clone() });
      else if (impact > (input.skates ? params.skateSafeImpact : params.bootSafeImpact)) impacts.push({ speed: impact, kind: 'ground', normal: _sn.clone() });
    }
    b.grounded = true;
    b.groundN.copy(_sn);
    b.altitude = 0;
    b.onLake = planet.lastLake;
  } else if (alt < 0.3 && wasGrounded && !input.skates && v.dot(_sn) < 1.5) {
    // boots stick to the ground when walking
    b.pos.multiplyScalar(sr / len);
    const vn = v.dot(_sn);
    if (vn > 0) v.addScaledVector(_sn, -vn);
    b.grounded = true;
    b.groundN.copy(_sn);
    b.altitude = 0;
  } else {
    b.altitude = alt;
    b.grounded = alt < 0.12;
    if (b.grounded) b.groundN.copy(_sn);
    else if (b.sinceContact > params.gripWindow) b.groundN.lerp(up, 0.05).normalize();
  }

  // obstacles
  const prevPlat = b.platform;
  b.platform = null;
  if (colliders) {
    const r = params.radius;
    const cp = _cp.copy(b.pos).addScaledVector(up, r);
    const near = colliders.query(cp, r + 2, _near);
    for (const c of near) {
      const pen = colliders.contact(c, cp, r, _n);
      if (pen <= 0) continue;
      b.pos.addScaledVector(_n, pen);
      cp.addScaledVector(_n, pen);
      const vn = v.dot(_n);
      if (vn < 0) {
        if (_n.dot(up) > 0.55) {
          // walkable top surface (dome roofs, rooftops): glide over it
          v.addScaledVector(_n, -vn);
          b.grounded = true;
          b.groundN.copy(_n);
          b.altitude = 0;
          if (c.platform) b.platform = c.platform;
          if (-vn > (input.skates ? params.skateSafeImpact : params.bootSafeImpact)) impacts.push({ speed: -vn, kind: 'obstacle', normal: _n.clone() });
        } else {
          v.addScaledVector(_n, -vn * 1.35);
          if (-vn > 4) impacts.push({ speed: -vn, kind: 'obstacle', normal: _n.clone() });
        }
      }
    }
  }

  // stay "on deck" through tiny separations so riding a vehicle doesn't flicker
  if (!b.platform && prevPlat && alt > 0 && b.sinceContact < 0.15 && b.pos.distanceTo(prevPlat.pos) < 40) b.platform = prevPlat;
  if (b.grounded) { b.airTime = 0; b.sinceContact = 0; } else { b.airTime += dt; b.sinceContact += dt; }
  return impacts;
}
