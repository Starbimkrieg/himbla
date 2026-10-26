import * as THREE from 'three';
import { PHYS } from './config.js';
import { upAt, radOf, setRad, GRAV } from './geo.js';

const CELL = 16; // m: a dense place has hundreds of colliders per 64 m cell (Chimera Downs about 6,000 in 0.3 km2), and every query paid for them
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
        const side = c.r - rad, top = c.y1 - h, bot = h - c.y0;
        if (top < side && top <= bot) { n.copy(a); return top + r; }
        // lying cylinders have a hittable bottom cap; upright ones bury it
        if (c.caps && bot < side && bot < top) { n.copy(a).negate(); return bot + r; }
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

// Distance t along ray o + t*d (d unit) to collider c's first surface, or Infinity past tmax. A ray starting inside c
// passes out through it. For hitscan beams (Rail Lance), which can't use contact()'s fat-sphere test.
export function rayCollider(c, o, d, tmax) {
  const ox = o.x - c.c.x, oy = o.y - c.c.y, oz = o.z - c.c.z;
  if (c.type === 'sphere') {
    const b = ox * d.x + oy * d.y + oz * d.z;
    const disc = b * b - (ox * ox + oy * oy + oz * oz - c.r * c.r);
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    return t >= 0 && t <= tmax ? t : Infinity;
  }
  if (c.type === 'cyl') {
    const a = c.axis;
    const oh = ox * a.x + oy * a.y + oz * a.z, dh = d.x * a.x + d.y * a.y + d.z * a.z;
    const rx = ox - a.x * oh, ry = oy - a.y * oh, rz = oz - a.z * oh;
    const ux = d.x - a.x * dh, uy = d.y - a.y * dh, uz = d.z - a.z * dh;
    const A = ux * ux + uy * uy + uz * uz, B = rx * ux + ry * uy + rz * uz, C = rx * rx + ry * ry + rz * rz - c.r * c.r;
    let best = Infinity;
    if (A > 1e-12) {
      const disc = B * B - A * C;
      if (disc >= 0) {
        const t = (-B - Math.sqrt(disc)) / A, h = oh + t * dh;
        if (t >= 0 && h >= c.y0 && h <= c.y1) best = t;
      }
    }
    if (Math.abs(dh) > 1e-9) {
      for (const y of [c.y0, c.y1]) {
        const t = (y - oh) / dh;
        if (t < 0 || t >= best) continue;
        const px = rx + ux * t, py = ry + uy * t, pz = rz + uz * t;
        if (px * px + py * py + pz * pz <= c.r * c.r) best = t;
      }
    }
    return best <= tmax ? best : Infinity;
  }
  // oriented box: slab test in its frame
  const lo = [ox * c.ax.x + oy * c.ax.y + oz * c.ax.z, ox * c.ay.x + oy * c.ay.y + oz * c.ay.z, ox * c.az.x + oy * c.az.y + oz * c.az.z];
  const ld = [d.x * c.ax.x + d.y * c.ax.y + d.z * c.ax.z, d.x * c.ay.x + d.y * c.ay.y + d.z * c.ay.z, d.x * c.az.x + d.y * c.az.y + d.z * c.az.z];
  const h = [c.hx, c.hy, c.hz];
  let t0 = 0, t1 = Infinity, entered = false;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-9) { if (Math.abs(lo[i]) > h[i]) return Infinity; continue; }
    let a = (-h[i] - lo[i]) / ld[i], b = (h[i] - lo[i]) / ld[i];
    if (a > b) { const x = a; a = b; b = x; }
    if (a > t0) { t0 = a; entered = true; }
    if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return entered && t0 <= tmax ? t0 : Infinity;
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
const _fl = [], _f1 = new THREE.Vector3(), _f2 = new THREE.Vector3();

// Walking floors (boxes marked `floor`: Kit.floorColliders) are ground, not obstacles: the highest one under p whose top is no
// more than FLOOR_STEP over the feet, as a radius from the Moon's centre (-Infinity: none). Stepping onto one, or from one to
// the next a centimetre higher, is the ground rising under you; as obstacles their edges tilted the contact and every seam
// bounced you up a little (a stutter along a boardwalk), and the ground snaps dragged you down to the terrain beneath.
const FLOOR_STEP = 0.45;
function floorUnder(colliders, p, up) {
  let best = -Infinity;
  if (!colliders) return best;
  for (const c of colliders.query(p, 1, _fl)) {
    if (!c.floor) continue;
    _f1.subVectors(p, c.c);
    if (Math.abs(_f1.dot(c.ax)) > c.hx || Math.abs(_f1.dot(c.az)) > c.hz) continue;
    const h = _f2.copy(c.c).addScaledVector(c.ay, c.hy * Math.sign(c.ay.dot(up))).sub(p).dot(up);   // its top over the feet
    if (h <= FLOOR_STEP) best = Math.max(best, radOf(p) + h);
  }
  return best;
}

// squared speed that curves over the world (all of it on a sphere; on the Spindle's cylinder only the part round the
// girth, since along the axis is straight)
function orbitV2(v, up, vh2) {
  if (GRAV.flat) return 0; // flat world: nothing curves away
  const a = GRAV.axis;
  if (!a) return vh2;
  const g = _tmp2.crossVectors(a, up);
  const vg = v.dot(g);
  return vg * vg;
}
const _tmp2 = new THREE.Vector3();

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
    jetLocked: false,
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
  const up = upAt(b.pos, _up);
  b.up.copy(up);
  b.skating = !!input.skates;
  if (b.grounded) v.addScaledVector(up, -G * dt);
  else {
    // airborne: moon gravity for a moment, then it builds; plus a pull cancelling the orbital lift of speed over a tiny
    // sphere; plus the Dive multiplier
    const vu = v.dot(up);
    const vh2 = Math.max(0, v.lengthSq() - vu * vu);
    // the build-up only bites at speed: hopping on foot stays floaty
    const k = Math.min(1, Math.max(0, (b.airTime - (params.airGrace ?? 1)) / (params.airGravRampTime ?? 2)));
    const fast = Math.min(1, Math.max(0, (Math.sqrt(vh2) - 15) / 30));
    const ramp = 1 + (params.airGravRamp ?? 1) * k * k * (3 - 2 * k) * fast;
    const orbit = GRAV.flat ? 0 : (params.orbitComp ?? 1) * orbitV2(v, up, vh2) / radOf(b.pos); // flat: radOf is height (0 on the floor), so skip it (no 0/0)
    const dive = input.dive ? (params.diveGrav ?? 3) : 1;
    v.addScaledVector(up, -(G * (params.airGravMult ?? 1) * ramp * dive + orbit) * dt);
    // magnetic catch: diving skaters near the ground are pulled onto it
    if (input.dive && input.skates && b.altitude < 10) v.addScaledVector(up, -(params.diveCatch ?? 22) * dt);
  }

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
        // Steering: input sideways to travel sets a turn rate (full A/D = hardest carve, W+A gentle). Speed is kept.
        _lat.copy(wish).addScaledVector(vh, -wish.dot(vh));
        lat = _lat.length();
        if (lat > 1e-3) {
          const side = Math.sign(_gt.crossVectors(vh, _lat).dot(n)) || 1;
          v.applyAxisAngle(n, side * params.handling * (1 + 8 / (speed + 4)) * Math.min(1, lat) * dt);
          vh.copy(v).divideScalar(speed);
        }
        // slope assist: some downhill pull becomes speed
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
  } else {
    wish.addScaledVector(up, -wish.dot(up));
    // Quantum Slipstream Vanes (Meridian's finale): skates keep some carve in the air, so A/D turns your flight. The turn
    // replaces the sideways air push (else every carve stacks speed), and hard carves bleed a little speed so you can
    // still scrub pace and land where you meant
    b.airCarve = 0;
    if (params.airHandling > 0) {
      const hv = _tmp.copy(v).addScaledVector(up, -v.dot(up));
      const hs = hv.length();
      if (hs > 4) {
        hv.divideScalar(hs);
        _lat.copy(wish).addScaledVector(hv, -wish.dot(hv));
        const la = Math.min(1, _lat.length());
        if (la > 0.05) {
          const side = Math.sign(_gt.crossVectors(hv, _lat).dot(up)) || 1;
          v.applyAxisAngle(up, side * params.handling * params.airHandling * (1 + 8 / (hs + 4)) * la * dt);
          b.airCarve = side * la;
          wish.addScaledVector(_lat, -0.75);
          const bleed = Math.max(0, 1 - 0.12 * la * dt);
          const vu = v.dot(up);
          v.addScaledVector(up, -vu).multiplyScalar(bleed).addScaledVector(up, vu);
        }
      }
    }
    v.addScaledVector(wish, params.airControl * dt);
  }
  b.lastLat = lat;

  // Jump: grounded, or skimming within the floor buffer (thrust and bumps lift you a hair) if you haven't jumped since
  // touching down. Costs jet energy but never needs it: a drained tank mustn't stop a hop
  if (input.jump && (b.grounded || (b.altitude < (params.jumpBuffer ?? 1.2) && !b.jumpLock))) {
    const vu = v.dot(up);
    if (vu < 0) v.addScaledVector(up, -vu); // downward drift doesn't eat the jump
    v.addScaledVector(b.grounded ? n : up, params.jumpSpeed * 0.4);
    v.addScaledVector(up, params.jumpSpeed);
    b.energy = Math.max(0, b.energy - params.jumpCost);
    b.grounded = false;
    b.sinceContact = params.gripWindow + 1; // a jump breaks the magnetic grip
    b.jumped = true;
    b.jumpLock = true;
  }

  // Magnetic grip: pull into the surface while (nearly) touching, holding the line over bumps; a real launch flies free.
  if (input.skates && b.sinceContact < params.gripWindow && b.altitude < params.gripRange) {
    // more glue with speed
    v.addScaledVector(b.groundN, -params.grip * (1 + Math.min(1, v.length() / 80) * 0.6) * dt);
  }

  // an empty tank locks the thrusters out until recharged to 25%
  if (b.energy <= 0) b.jetLocked = true;
  else if (b.jetLocked && b.energy >= b.maxEnergy * 0.25) b.jetLocked = false;
  b.thrusting = false;
  if (input.thrust && b.energy > 0 && !b.jetLocked) {
    v.addScaledVector(input.thrustDir, params.thrustAccel * dt);
    b.energy = Math.max(0, b.energy - params.thrustDrain * dt);
    b.thrusting = true;
  } else {
    b.energy = Math.min(b.maxEnergy, b.energy + params.energyRegen * dt);
  }

  const sp = v.length();
  if (sp > 0) v.multiplyScalar(Math.max(0, 1 - params.drag * sp * dt));

  b.pos.addScaledVector(v, dt);

  // terrain contact (a walking floor under you is the ground there)
  let sr = planet.surface(b.pos, _sn);
  const fr = floorUnder(colliders, b.pos, up);
  if (fr > sr) { sr = fr; _sn.copy(up); }
  const alt = radOf(b.pos) - sr;
  const wasGrounded = b.grounded;
  // on a structure (ramp, rooftop) last step: ground snaps must not drag you through it (low ramps would stop you dead)
  const onStruct = b.onStruct;
  if (alt <= 0) {
    setRad(b.pos, sr);
    const vn = v.dot(_sn);
    if (vn < 0 && !wasGrounded && input.dive && input.skates && -vn < (params.diveSafeImpact ?? 160)) {
      // dive landing: the skates turn the fall into speed along the slope
      const sp0 = v.length();
      v.addScaledVector(_sn, -vn);
      const t = v.length();
      if (t > 0.5) v.multiplyScalar(Math.min(sp0 * 0.92, Math.max(t, sp0 * 0.75)) / t);
      b.diveLanded = -vn;
    } else if (vn < 0) {
      const impact = -vn;
      // ground speed at touchdown: a fast glancing landing is gentler than a drop
      const glide = Math.sqrt(Math.max(0, v.lengthSq() - vn * vn));
      if (input.skates) v.addScaledVector(_sn, -vn);
      else v.addScaledVector(_sn, -vn * (1 + (impact > 7 ? 0.28 : 0)));
      if (!wasGrounded && impact > 3) impacts.push({ speed: impact, glide, kind: 'ground', normal: _sn.clone() });
      else if (impact > (input.skates ? params.skateSafeImpact : params.bootSafeImpact)) impacts.push({ speed: impact, glide, kind: 'ground', normal: _sn.clone() });
    }
    b.grounded = true;
    b.groundN.copy(_sn);
    b.altitude = 0;
    b.onLake = planet.lastLake;
  } else if (params.skateSnap !== false && input.skates && wasGrounded && !onStruct && alt < (params.skateBuffer ?? 0.6) + Math.min(1.6, v.length() * 0.02) && v.dot(_sn) < (params.skateLaunch ?? 3) + Math.min(9, v.length() * 0.1)) {
    // magnetic buffer: lift-offs over crests and bumps snap back down, even at speed. Only a real ramp (a hard upward
    // kick for your speed) or a jump throws you clear
    setRad(b.pos, sr);
    const vn = v.dot(_sn);
    if (vn > 0) v.addScaledVector(_sn, -vn);
    b.grounded = true;
    b.groundN.copy(_sn);
    b.altitude = 0;
    b.onLake = planet.lastLake;
  } else if (alt < 0.3 && wasGrounded && !onStruct && !input.skates && v.dot(_sn) < 1.5) {
    // walking boots stick to the ground
    setRad(b.pos, sr);
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
  b.onStruct = false;
  const wasStuck = b.stuck;
  b.stuck = false;
  if (colliders) {
    const r = params.radius;
    const cp = _cp.copy(b.pos).addScaledVector(up, r);
    const near = colliders.query(cp, r + 2, _near);
    for (const c of near) {
      if (c.floor) continue;                                           // (ground: floorUnder)
      const pen = colliders.contact(c, cp, r, _n);
      if (pen <= 0) continue;
      if (c.stick && _n.dot(up) > 0.55) b.stuck = true;
      b.pos.addScaledVector(_n, pen);
      cp.addScaledVector(_n, pen);
      // a deck you ride is your frame (b.velFrame); any other moving deck is hit at its closing speed
      const pv = c.platform && c.platform.vel && b.velFrame !== c.platform ? c.platform.vel : null;
      const vn = pv ? v.dot(_n) - pv.dot(_n) : v.dot(_n);
      if (vn < 0 && c.bouncy) {
        // inflatable: springs you out harder than you came in
        v.addScaledVector(_n, -vn * 2.15 + 4);
        b.grounded = false;
        b.sinceContact = 1;
        b.bounced = Math.max(b.bounced || 0, -vn);
        continue;
      }
      if (vn < 0) {
        if (_n.dot(up) > 0.55) {
          // walkable top (dome roofs, rooftops): glide over it
          v.addScaledVector(_n, -vn);
          b.grounded = true;
          b.groundN.copy(_n);
          b.altitude = 0;
          b.onStruct = true;
          if (c.platform) b.platform = c.platform;
          if (-vn > (input.skates ? params.skateSafeImpact : params.bootSafeImpact)) impacts.push({ speed: -vn, kind: 'obstacle', normal: _n.clone() });
        } else {
          v.addScaledVector(_n, -vn * 1.35);
          if (-vn > 4) impacts.push({ speed: -vn, kind: 'obstacle', normal: _n.clone() });
        }
      }
    }
  }

  // Landing pads (landingPad.js marks deck and stairs `stick`): boots stay on them over the stair head instead of floating
  // off (running up the flight you'd sail 4 m over the deck). Not on skates or after a jump; unmarked ramps still throw you.
  if (colliders && wasStuck && !b.stuck && !b.grounded && !b.jumpLock && !input.skates) {
    const r = params.radius;
    for (let d = 0.15; d <= 1.2; d += 0.15) {
      const cp = _cp.copy(b.pos).addScaledVector(up, r - d);
      let hp = 0;
      for (const c of colliders.query(cp, r + 2, _near)) {
        if (!c.stick) continue;
        const pen = colliders.contact(c, cp, r, _n);
        if (pen > hp && _n.dot(up) > 0.55) { hp = pen; _tmp.copy(_n); }
      }
      if (hp > 0) {
        b.pos.addScaledVector(up, -d + hp / _tmp.dot(up)); // straight down: no sliding back down a flight
        v.addScaledVector(_tmp, -v.dot(_tmp));
        b.grounded = true; b.groundN.copy(_tmp); b.altitude = 0; b.onStruct = true; b.stuck = true;
        break;
      }
    }
  }

  // stay "on deck" through tiny separations so riding a vehicle doesn't flicker
  if (!b.platform && prevPlat && alt > 0 && b.sinceContact < 0.15 && b.pos.distanceTo(prevPlat.pos) < 40) b.platform = prevPlat;
  if (b.grounded) { b.airTime = 0; b.sinceContact = 0; if (!b.jumped) b.jumpLock = false; } else { b.airTime += dt; b.sinceContact += dt; }
  return impacts;
}
