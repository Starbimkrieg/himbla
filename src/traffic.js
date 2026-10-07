import * as THREE from 'three';
import { toon, ink, glow, textSprite } from './toon.js';
import { makeFigure, makeShuttle, makeRover, makeHoverCar, makeFreighter } from './models.js';
import { mulberry32 } from './rng.js';
import { SUN, frameQuat, arcDist } from './geo.js';

// Ambient traffic: freighters and shuttle-buses that land on real pads at the edge of each
// settlement (passengers walk off to the town's buildings, others come out to board), plus a
// network of dirt roads joining the safe outposts (through or round each town) with land-trains,
// hover-cars and buggies driving routes over it. Land-trains and buggies can be wrecked.
//
// Vehicle kinds in world.vehicles: 'ship' (freighter), 'bus' (shuttle), 'car' (hover-car, on
// roads; alchemy can jar these), 'landtrain' (big six-wheeled road-train with trailers).
// Ground buggies live in world.crawlers (main.js bumps the player with those).

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _n = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const SAFE_ROAD = 2500; // connect safe outposts closer than this (plus each one's nearest neighbour < 3 km)
const LINK_MAX = 3000; // nearest / second-nearest links up to this long
const PAX_RANGE = 500; // passengers only exist near the camera
const LANE = 2.4; // lane offset from the road centreline (right-hand traffic)
const ROAD_LAT = [-5, -2.5, 0, 2.5, 5];
const TRAIN_HP = 400, BUGGY_HP = 120;
const _z = new THREE.Vector3(0, 0, 1);
// ring roads round each connected town
const RING_GAP = 32; // ring centreline this far outside the settlement radius (past buildings / plateau edge)
const RING_PUSH = 90; // pushed out up to this much more where something is in the way
const JOIN = 18; // junction connectors join the ring this far along it either side of a road
const JOIN_OUT = 20; // ...and leave the road lanes this far out from the ring
const GATE_SEP = 80; // minimum ring distance between two junctions
const FILLET = 16; // drawn flare at each junction
const STOP_IN = 50; // the stop is at least this far along its stretch of ring (room for a land-train)

function part(geo, mat, x = 0, y = 0, z = 0, outline = 0.05) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) ink(m, outline);
  return m;
}

// ---------------- models ----------------

// Landing legs + a belly ramp for the big freighter (origin = hull centre, belly at y=-5).
function freighterGear(m) {
  const metal = toon(0x8a87a0), dark = toon(0x2a2540);
  const legs = [];
  for (const [x, z] of [[-5.2, 13], [5.2, 13], [-5.2, -15], [5.2, -15]]) {
    const g = new THREE.Group();
    g.position.set(x, -10, z);
    g.add(part(new THREE.CylinderGeometry(0.45, 0.6, 5.4, 8), metal, 0, 2.7, 0, 0.05));
    g.add(part(new THREE.CylinderGeometry(1.4, 1.6, 0.3, 12), dark, 0, 0.15, 0, 0.05));
    m.root.add(g);
    legs.push(g);
  }
  const hatch = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 10.6).rotateX(Math.PI / 2), glow(0xfff1b0));
  hatch.position.set(0, -4.98, -11.3);
  hatch.visible = false;
  m.root.add(hatch);
  const ramp = new THREE.Group();
  ramp.position.set(0, -5, -6);
  ramp.add(part(new THREE.BoxGeometry(4.6, 0.3, 11).translate(0, -0.15, -5.5), toon(0x5b5870), 0, 0, 0, 0.06));
  for (const sx of [-1, 1]) ramp.add(part(new THREE.BoxGeometry(0.25, 0.12, 10.6).translate(0, 0.06, -5.5), glow(0xffd23f), sx * 2.1, 0, 0, 0));
  m.root.add(ramp);
  const L = 11, drop = 5;
  const ang = Math.asin(drop / L);
  return {
    legs, ramp, hatch, gearH: 10, legLo: -10, legHi: -5, rampAng: ang,
    inside: new THREE.Vector3(0, -5, -1.5), rampTop: new THREE.Vector3(0, -5, -6.4),
    rampBottom: new THREE.Vector3(0, -5 - L * Math.sin(ang), -6 - L * Math.cos(ang) - 0.6),
  };
}

// Three landing legs + a little rear ramp for the shuttle-bus (capsule radius 2.4).
function shuttleGear(m) {
  const metal = toon(0x8a87a0), dark = toon(0x2a2540);
  const legs = [];
  for (const [x, z] of [[-1.6, -3], [1.6, -3], [0, 3.6]]) {
    const g = new THREE.Group();
    g.position.set(x, -3.8, z);
    g.add(part(new THREE.CylinderGeometry(0.16, 0.2, 2.0, 6), metal, 0, 1.0, 0, 0.03));
    g.add(part(new THREE.CylinderGeometry(0.5, 0.6, 0.16, 10), dark, 0, 0.08, 0, 0.03));
    m.root.add(g);
    legs.push(g);
  }
  const hatch = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2).rotateX(Math.PI / 2), glow(0xfff1b0));
  hatch.position.set(0, -2.12, -5.6);
  hatch.visible = false;
  m.root.add(hatch);
  const ramp = new THREE.Group();
  ramp.position.set(0, -2.2, -4.0);
  ramp.add(part(new THREE.BoxGeometry(1.8, 0.16, 3.4).translate(0, -0.08, -1.7), toon(0x5b5870), 0, 0, 0, 0.04));
  m.root.add(ramp);
  const L = 3.4, drop = 1.6;
  const ang = Math.asin(drop / L);
  return {
    legs, ramp, hatch, gearH: 3.8, legLo: -3.8, legHi: -2.2, rampAng: ang,
    inside: new THREE.Vector3(0, -2.3, -1.5), rampTop: new THREE.Vector3(0, -2.2, -4.2),
    rampBottom: new THREE.Vector3(0, -2.2 - L * Math.sin(ang), -4 - L * Math.cos(ang) - 0.4),
  };
}

// Big balloon-tyred road-train: a six-wheeled tractor pulling passenger and cargo trailers.
// Every unit has its origin on the ground, +Z forward.
function makeLandTrain({ color = 0xff9f1c, trim = 0xfff4e0, cars = ['pax', 'cargo', 'pax'] } = {}) {
  const bodyM = toon(color), trimM = toon(trim), dark = toon(0x1d1a29), hubM = toon(0x8a87a0);
  const tyre = (parent, x, z, r, w, list) => {
    const t = part(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), dark, x, r, z, 0.06);
    t.add(part(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w * 1.04, 8).rotateZ(Math.PI / 2), hubM, 0, 0, 0, 0));
    parent.add(t);
    list.push(t);
  };
  const root = new THREE.Group();
  const wheels = [];
  root.add(part(new THREE.BoxGeometry(3.2, 1.0, 8.6), dark, 0, 1.75, 0, 0.08));
  root.add(part(new THREE.BoxGeometry(3.9, 2.9, 3.4), bodyM, 0, 3.6, 2.3, 0.14));
  root.add(part(new THREE.BoxGeometry(3.96, 0.9, 2.2), glow(0x9be7ff), 0, 4.25, 2.9, 0.04));
  root.add(part(new THREE.BoxGeometry(3.4, 1.9, 4.4), trimM, 0, 3.15, -2.1, 0.1));
  root.add(part(new THREE.BoxGeometry(3.5, 0.5, 4.5), bodyM, 0, 4.3, -2.1, 0.06));
  for (const sx of [-1, 1]) root.add(part(new THREE.BoxGeometry(0.7, 0.45, 0.2), glow(0xfff6a8), sx * 1.3, 2.55, 4.05, 0.03));
  const beacon = part(new THREE.SphereGeometry(0.32, 8, 6), glow(0xff9f1c), 0, 5.25, 2.0, 0.03);
  root.add(beacon);
  root.add(part(new THREE.CylinderGeometry(0.05, 0.05, 2.2), dark, -1.5, 6.1, 1.0, 0.02));
  for (const z of [2.9, 0, -2.9]) for (const sx of [-1, 1]) tyre(root, sx * 2.15, z, 1.2, 1.05, wheels);
  const trailers = [];
  for (const kind of cars) {
    const tr = new THREE.Group();
    const tw = [];
    tr.add(part(new THREE.BoxGeometry(3.0, 0.6, 8.0), dark, 0, 1.55, 0, 0.06));
    tr.add(part(new THREE.BoxGeometry(0.35, 0.35, 1.9), dark, 0, 1.5, 4.8, 0.03));
    if (kind === 'pax') {
      tr.add(part(new THREE.BoxGeometry(3.6, 2.7, 7.6), trimM, 0, 3.2, 0, 0.12));
      tr.add(part(new THREE.BoxGeometry(3.66, 0.7, 6.8), glow(0xfff6a8), 0, 3.6, 0, 0.03));
      tr.add(part(new THREE.BoxGeometry(3.8, 0.45, 7.8), bodyM, 0, 4.75, 0, 0.06));
      tr.add(part(new THREE.BoxGeometry(0.12, 2.1, 1.5), bodyM, -1.82, 2.9, 0, 0)); // door on the right (-x)
    } else {
      tr.add(part(new THREE.BoxGeometry(3.4, 0.4, 7.8), bodyM, 0, 2.05, 0, 0.06));
      tr.add(part(new THREE.CylinderGeometry(1.35, 1.35, 6.6, 14).rotateX(Math.PI / 2), toon(0x9be7ff), 0, 3.6, 0, 0.1));
      for (const z of [-2.2, 0, 2.2]) tr.add(part(new THREE.TorusGeometry(1.4, 0.12, 6, 16), bodyM, 0, 3.6, z, 0));
    }
    for (const z of [2.7, -2.7]) for (const sx of [-1, 1]) tyre(tr, sx * 1.95, z, 1.0, 0.9, tw);
    trailers.push({ root: tr, wheels: tw, kind });
  }
  return { root, wheels, trailers, beacon };
}

// ---------------- path helpers ----------------

function makePath(pts, loop = false) {
  if (loop) pts = [...pts, pts[0]];
  const cum = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
  return { pts, cum, len: cum[pts.length - 1], loop };
}

// Position at arc length s (hint keeps a running segment index: O(1) per frame).
function sample(path, s, out, hint) {
  const cum = path.cum, n = cum.length;
  if (path.loop) s = ((s % path.len) + path.len) % path.len;
  else s = Math.min(path.len, Math.max(0, s));
  let i = Math.min(hint.i | 0, n - 2);
  while (i < n - 2 && cum[i + 1] < s) i++;
  while (i > 0 && cum[i] > s) i--;
  hint.i = i;
  const f = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
  hint.f = f;
  return out.copy(path.pts[i]).lerp(path.pts[i + 1], f);
}

function chaikin(pts, passes) {
  for (let p = 0; p < passes; p++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      out.push(pts[i].clone().lerp(pts[i + 1], 0.25), pts[i].clone().lerp(pts[i + 1], 0.75));
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// ---------------- road shader ----------------

function roadMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { sunDir: { value: SUN.clone() } },
    vertexShader: `uniform vec3 sunDir; attribute float fade; varying vec2 vUv; varying float vLit; varying float vFade; varying float vEnd;
      void main(){
        vUv = uv; vEnd = fade;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 toCam = cameraPosition - wp.xyz; float dist = length(toCam);
        // pull toward the eye (screen position unchanged) so coarse terrain LODs never swallow the track
        wp.xyz += toCam / max(dist, 1e-3) * min(dist * 0.5, 0.25 + dist * 0.012);
        vLit = smoothstep(-0.12, 0.3, dot(normalize(wp.xyz), sunDir));
        vFade = 1.0 - smoothstep(2300.0, 2900.0, dist);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `varying vec2 vUv; varying float vLit; varying float vFade; varying float vEnd;
      float h1(float n){ return fract(sin(n) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      void main(){
        float X = vUv.x * 5.0, s = vUv.y, ax = abs(X);
        float n = n1(s * 0.11) * 0.6 + n1(s * 0.53 + 17.0) * 0.4;
        float ne = n1(s * 0.31 + sign(X) * 41.0);
        float wob = (n1(s * 0.07 + 3.0) - 0.5) * 0.5;
        float band = 1.0 - smoothstep(2.6 + ne * 1.8, 4.9, ax);
        float xr = abs(X + wob);
        float rd = min(abs(xr - 1.15), abs(xr - 3.7));
        float rut = (1.0 - smoothstep(0.08, 0.4, rd)) * (0.55 + 0.45 * n1(s * 0.8 + X * 3.0));
        float berm = smoothstep(3.6 + ne, 4.3 + ne * 0.5, ax) * (1.0 - smoothstep(4.5, 5.0, ax));
        vec3 col = mix(vec3(0.13, 0.115, 0.125), vec3(0.035, 0.03, 0.045), rut);
        col = mix(col, vec3(0.75, 0.7, 0.62), berm * 0.6);
        float a = band * (0.5 + 0.25 * n);
        a = max(a, rut * 0.85 * band);
        a = max(a, berm * 0.35);
        col *= 0.22 + 0.85 * vLit;
        gl_FragColor = vec4(col, a * vFade * vEnd);
      }`,
  });
}

// ---------------- traffic ----------------

export class Traffic {
  constructor(world) {
    this.w = world;
    this.P = world.planet;
    this.C = world.colliders;
    this.rand = mulberry32(2024);
    this.vehicles = world.vehicles;
    this.crawlers = world.crawlers;
    this.roads = [];
    this.stops = [];
    this.walkers = [];
    this.pool = [];
    this.platforms = []; // trailer decks
    this._buf = [];
    this.L = Object.fromEntries(world.locations.map((l) => [l.id, l]));
    for (const loc of world.locations) {
      loc._inv = loc.group.matrixWorld.clone().invert();
      loc.stopKeep = [];
    }
    this.buildRoads();
    this.buildFlights();
  }

  r() { return this.rand(); }

  // ---------- local-frame helpers ----------
  local(loc, v, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(loc._inv); }

  groundY(loc, x, z) {
    this.w.toWorld(loc, x, 0, z, _a);
    this.P.ground(_a, _a);
    return _a.applyMatrix4(loc._inv).y;
  }

  // local heading (radians in the XZ plane) from loc toward another location
  toward(loc, other) {
    this.local(loc, _b.copy(other.dir).multiplyScalar(this.P.R), _b);
    return Math.atan2(_b.z, _b.x);
  }

  blocked(p, r) {
    const C = this.C;
    C.query(p, r, this._buf);
    for (const c of this._buf) if (!c.platform && C.contact(c, p, r, _n) > 0) return true;
    return false;
  }

  // Is a disc of radius R (local frame) free of colliders at the given heights above y0?
  clearDisc(loc, x, z, R, heights, y0 = 0) {
    const rr = Math.max(1, R * 0.36);
    const pts = [[0, 0]];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pts.push([Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5]); }
    const n2 = Math.max(8, Math.ceil((2 * Math.PI * R) / (rr * 1.3)));
    for (let i = 0; i < n2; i++) { const a = (i / n2) * Math.PI * 2; pts.push([Math.cos(a) * (R - rr * 0.5), Math.sin(a) * (R - rr * 0.5)]); }
    for (const h of heights) for (const [px, pz] of pts) {
      this.w.toWorld(loc, x + px, y0 + h, z + pz, _c);
      if (this.blocked(_c, rr)) return false;
    }
    return true;
  }

  // Footprints that have no colliders but must stay free: pads, solar fields, lamps,
  // defence turret spots (enemies.js places those later), and stops we already claimed.
  keepouts(loc, withStops = true) {
    const k = [...(loc.pads || []), ...(loc.keep || []), ...(withStops ? loc.stopKeep : [])];
    const spots = [];
    // world.js lays out the real gun mounts (walls, bastions, pylons); use them when present
    if (loc.turretMounts && loc.turretMounts.length) {
      for (const m of loc.turretMounts) k.push({ x: m.x, z: m.z, r: 6 });
      return k;
    }
    if (loc.restricted) {
      const small = !!loc.small, inner = small ? 3 : 4, outer = small ? 2 : 4;
      for (let i = 0; i < inner; i++) spots.push([(i / inner) * Math.PI * 2 + 0.4, small ? 68 : 112]);
      for (let i = 0; i < outer; i++) spots.push([(i / outer) * Math.PI * 2 + 1.2, small ? 180 : 290]);
    } else if (loc.defense) {
      const d = loc.defense;
      for (let i = 0; i < d.turrets; i++) spots.push([(i / d.turrets) * Math.PI * 2 + 0.2, d.ring]);
      for (let i = 0; i < (d.inner || 0); i++) spots.push([(i / d.inner) * Math.PI * 2 + 0.8, d.ring * 0.55]);
    }
    for (const [a, r] of spots) k.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 4 });
    return k;
  }

  // Walk from (x,z) toward the settlement centre until something solid is in the way.
  townPoint(loc, x, z, max = 60) {
    const d = Math.hypot(x, z) || 1;
    const ux = -x / d, uz = -z / d;
    let best = 4;
    for (let t = 4; t <= Math.min(max, d - 2); t += 2) {
      const px = x + ux * t, pz = z + uz * t;
      this.w.toWorld(loc, px, this.groundY(loc, px, pz) + 1.2, pz, _c);
      if (this.blocked(_c, 0.9)) break;
      best = t;
    }
    best = Math.max(4, best - 2);
    const px = x + ux * best, pz = z + uz * best;
    return { x: px, y: this.groundY(loc, px, pz), z: pz, g: true };
  }

  // Small stop shelter (two posts, roof, bench) with a destination sign; local frame.
  shelter(loc, x, z, yaw, text, color) {
    const g = new THREE.Group();
    const post = toon(0x5b5870), roofM = toon(color);
    for (const sx of [-1.6, 1.6]) g.add(part(new THREE.BoxGeometry(0.25, 2.8, 0.25), post, sx, 1.4, -0.6, 0.03));
    g.add(part(new THREE.BoxGeometry(4.0, 0.25, 2.0), roofM, 0, 2.9, 0, 0.05));
    g.add(part(new THREE.BoxGeometry(3.0, 0.2, 0.7), toon(0xfff4e0), 0, 0.7, -0.5, 0.03));
    g.add(part(new THREE.BoxGeometry(3.6, 1.2, 0.12), toon(0x2a2540), 0, 1.9, -1.0, 0));
    g.add(part(new THREE.SphereGeometry(0.22, 8, 6), glow(0xfff6a8), 0, 2.65, 0.5, 0));
    this.w.put(g, loc, x, z, this.groundY(loc, x, z), yaw);
    if (text) {
      const s = textSprite(text, { color: '#' + new THREE.Color(color).getHexString(), size: 48, scale: 0.24, bg: '#120a1e' });
      s.position.set(x, this.groundY(loc, x, z) + 4.6, z);
      loc.group.add(s);
    }
    return g;
  }

  // ================= flights: pads, arcs, landings =================

  // Pick (or reuse) a landing pad in open ground at the settlement's edge, facing `other`.
  makePadStop(loc, other, spec, kind) {
    const tw = this.toward(loc, other);
    const keeps = this.keepouts(loc);
    const cands = [];
    for (const p of loc.pads || []) {
      if (p.r >= 25 || p.used) continue;
      cands.push({ x: p.x, z: p.z, existing: p });
    }
    for (let fr = 0.4; fr <= 1.16; fr += 0.07) {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        cands.push({ x: Math.cos(a) * loc.r * fr, z: Math.sin(a) * loc.r * fr });
      }
    }
    for (const c of cands) {
      const d = Math.hypot(c.x, c.z), a = Math.atan2(c.z, c.x);
      c.d = d;
      c.score = 2.2 * Math.cos(a - tw) + (c.existing ? 1.4 : 0) - 0.8 * Math.abs(d / loc.r - 0.78) - 3 * Math.max(0, (d + spec.padR) / loc.r - 1.15);
    }
    cands.sort((p, q) => q.score - p.score);
    let pick = null;
    for (const c of cands) {
      if (keeps.some((k) => k !== c.existing && Math.hypot(c.x - k.x, c.z - k.z) < spec.clearR * 0.85 + k.r)) continue;
      // beyond the plateau the ground may slope: only accept gentle spots (pad is raised to the top)
      let lo = 0, hi = 0;
      if (c.d + spec.padR > loc.r * 0.98) {
        lo = Infinity; hi = -Infinity;
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 2, rr = i === 8 ? 0 : spec.padR;
          const y = this.groundY(loc, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
        if (hi - lo > 3.5) continue;
      }
      if (!this.clearDisc(loc, c.x, c.z, spec.clearR, spec.heights, hi)) continue;
      pick = { ...c, lo, hi };
      break;
    }
    if (!pick) {
      // nothing fits: a raised pad well outside the settlement, toward the other end
      const d = loc.r * 1.35;
      pick = { x: Math.cos(tw) * d, z: Math.sin(tw) * d, lo: 0, hi: 0 };
      pick.lo = pick.hi = this.groundY(loc, pick.x, pick.z);
      console.warn('[traffic] no open pad spot at', loc.id, 'for', kind);
    }
    const color = kind === 'ship' ? 0xff9f1c : 0x2ec4ff;
    let top = 0.27;
    if (pick.existing && pick.existing.r >= spec.padR * 0.8) {
      pick.existing.used = true;
    } else {
      if (pick.existing) pick.existing.used = true;
      const raised = pick.hi - pick.lo > 0.3 || Math.abs(pick.hi) > 0.3;
      const base = raised ? pick.hi + 0.3 : (pick.existing ? -0.12 : 0);
      const pad = this.w.pad(loc, pick.x, pick.z, spec.padR, color);
      if (loc.pads && loc.pads.length) loc.pads[loc.pads.length - 1].used = true;
      pad.position.y = base;
      pad.updateMatrix();
      if (raised) {
        const sk = part(new THREE.CylinderGeometry(spec.padR * 1.02, spec.padR * 1.1, base - pick.lo + 1.5, 24), toon(0x5b5870), 0, 0, 0, 0.1);
        this.w.put(sk, loc, pick.x, pick.z, (base + pick.lo - 1.5) / 2 - 0.25);
      }
      top = Math.max(top, base + 0.27);
      // rim lights so the pad reads at night
      const lights = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        lights.add(part(new THREE.SphereGeometry(spec.padR > 12 ? 0.5 : 0.3, 6, 4), glow(color), Math.cos(a) * spec.padR * 0.92, 0.3, Math.sin(a) * spec.padR * 0.92, 0));
      }
      this.w.put(lights, loc, pick.x, pick.z, base);
    }
    loc.stopKeep.push({ x: pick.x, z: pick.z, r: spec.clearR });
    // waiting shelter at the pad edge on the town side
    const dc = Math.hypot(pick.x, pick.z) || 1;
    const base = Math.atan2(-pick.z, -pick.x);
    let wx = pick.x - (pick.x / dc) * (spec.padR + 4), wz = pick.z - (pick.z / dc) * (spec.padR + 4);
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3]) {
      const a = base + off;
      const x = pick.x + Math.cos(a) * (spec.padR + 4.5), z = pick.z + Math.sin(a) * (spec.padR + 4.5);
      if (keeps.some((k) => k !== pick.existing && Math.hypot(x - k.x, z - k.z) < k.r + 2.5)) continue;
      this.w.toWorld(loc, x, this.groundY(loc, x, z) + 1.5, z, _c);
      if (this.blocked(_c, 2.4)) continue;
      wx = x; wz = z;
      break;
    }
    const yaw = Math.atan2(pick.x - wx, pick.z - wz);
    this.shelter(loc, wx, wz, yaw, `${kind === 'ship' ? 'FREIGHT' : 'SHUTTLE'} > ${other.short}`, color);
    loc.stopKeep.push({ x: wx, z: wz, r: 3 });
    const stop = {
      loc, kind: 'pad', x: pick.x, z: pick.z, top, padR: spec.padR,
      wait: { x: wx + Math.sin(yaw) * 1.8, y: this.groundY(loc, wx, wz), z: wz + Math.cos(yaw) * 1.8, g: true },
      town: this.townPoint(loc, wx, wz, 70),
      queue: [], queued: false,
    };
    // where people step off the pad (toward the shelter side): their walks to buildings start here
    const ea = Math.atan2(stop.wait.z - pick.z, stop.wait.x - pick.x) + 0.5, er = spec.padR + 4;
    stop.origin = { x: pick.x + Math.cos(ea) * er, z: pick.z + Math.sin(ea) * er };
    stop.world = this.w.toWorld(loc, pick.x, top, pick.z);
    this.stops.push(stop);
    return stop;
  }

  // Climb vertically off pad A, arc up to cruise, come down over pad B and settle vertically.
  flightPath(sA, sB, gearH, climb, cruise, radius) {
    const P = this.P;
    const uA = sA.world.clone().normalize(), uB = sB.world.clone().normalize();
    const start = sA.world.clone().addScaledVector(uA, gearH), topA = sA.world.clone().addScaledVector(uA, gearH + climb);
    const end = sB.world.clone().addScaledVector(uB, gearH), topB = sB.world.clone().addScaledVector(uB, gearH + climb);
    const len = arcDist(uA, uB);
    const step = 20, steps = Math.max(4, Math.ceil(len / step));
    const raw = [];
    for (let i = 0; i <= steps; i++) {
      const d = new THREE.Vector3().lerpVectors(uA, uB, i / steps).normalize();
      raw.push({ d, r: P.surface(_a.copy(d).multiplyScalar(P.R)) });
    }
    const rA = topA.length(), rB = topB.length(), ramp = Math.min(len * 0.45, 140 + cruise * 2.5);
    const rad = raw.map((p, i) => {
      let rmax = -Infinity;
      for (let k = -4; k <= 4; k++) rmax = Math.max(rmax, raw[Math.min(steps, Math.max(0, i + k))].r);
      const t = i / steps, fromEnd = Math.min(i, steps - i) * (len / steps);
      const blend = smooth(fromEnd / ramp);
      return Math.max(rA + (rB - rA) * t + cruise * blend, rmax + 6 + cruise * 0.5 * blend);
    });
    rad[0] = rA; rad[steps] = rB;
    // lift over anything solid on the way (domes, towers, cranes, other settlements…)
    const req = rad.slice();
    for (let i = 1; i < steps; i++) {
      for (let k = 0; k < 40; k++) {
        if (!this.blocked(_a.copy(raw[i].d).multiplyScalar(req[i]), radius)) break;
        req[i] += 4;
      }
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < steps; i++) rad[i] = Math.max(req[i], (rad[i - 1] + rad[i] * 2 + rad[i + 1]) / 4);
    }
    const mid = [];
    for (let i = 1; i < steps; i++) mid.push(raw[i].d.clone().multiplyScalar(rad[i]));
    let pts = [start, topA, ...mid, topB, end];
    // round the corners (keeps the straight vertical legs at both ends)
    pts = chaikin(pts, 2);
    return makePath(pts);
  }

  addFlyer(kind, A, B) {
    const ship = kind === 'ship';
    const n = this.vehicles.length;
    const model = ship ? makeFreighter({ stripe: [0xff9f1c, 0xff2e88, 0x2ec4ff][n % 3] }) : makeShuttle({ stripe: [0x2ec4ff, 0xff9f1c, 0x7dff6a, 0xc77dff][n % 4] });
    const gear = ship ? freighterGear(model) : shuttleGear(model);
    const spec = ship
      ? { padR: 20, clearR: 30, heights: [3, 10, 20, 32], climb: 34 }
      : { padR: 8.5, clearR: 10, heights: [2, 6, 12], climb: 16 };
    const cruise = ship ? 55 + (n % 3) * 25 : 22;
    const radius = ship ? 24 : 7;
    const sA = this.makePadStop(A, B, spec, kind), sB = this.makePadStop(B, A, spec, kind);
    const path = this.flightPath(sA, sB, gear.gearH, spec.climb, cruise, radius);
    model.root.matrixAutoUpdate = true;
    this.w.scene.add(model.root);
    const deck = ship ? [7.2, 5.0, 23.5] : [2.6, 2.5, 7.0];
    const v = {
      ...model, ...gear, kind, path, hint: { i: 0, f: 0 }, ahint: { i: 0, f: 0 },
      stops: [sA, sB], dir: 1, s: 0, state: 'park', timer: 0, open: 0, gearK: 1,
      vmax: ship ? 40 : 26, acc: ship ? 2.2 : 3.2, turn: ship ? 0.45 : 1.0, turnMin: ship ? 22 : 8,
      minWait: ship ? 16 : 10, maxWait: ship ? 50 : 32, pax: ship ? [3, 5] : [1, 3],
      radius, view: ship ? 4200 : 1600, deck, col: null, quat: model.root.quaternion, boarding: 0, heading: new THREE.Vector3(),
      pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(),
    };
    // spread them out: some parked at either end, most somewhere along the route
    const r = this.r();
    if (r < 0.3) { v.state = 'park'; v.dir = this.r() < 0.5 ? 1 : -1; v.s = v.dir > 0 ? 0 : path.len; v.timer = this.r() * 6; }
    else { v.state = 'fly'; v.dir = this.r() < 0.5 ? 1 : -1; v.s = path.len * (0.15 + this.r() * 0.7); }
    v.stop = v.state === 'park' ? (v.s <= 0 ? sA : sB) : null;
    sample(path, v.s, v.pos, v.hint);
    v.prevPos.copy(v.pos);
    // initial heading: along the route (parked at A faces B)
    sample(path, v.s + (v.state === 'park' ? (v.s <= 0 ? 80 : -80) : 40 * v.dir), _a, v.ahint);
    v.heading.copy(_a).sub(v.pos);
    const up = _u.copy(v.pos).normalize();
    v.heading.addScaledVector(up, -v.heading.dot(up));
    if (v.heading.lengthSq() < 1e-6) v.heading.set(1, 0, 0);
    v.heading.normalize();
    frameQuat(up, v.heading, model.root.quaternion);
    model.root.position.copy(v.pos);
    v.fwd.copy(v.heading);
    this.vehicles.push(v);
    return v;
  }

  buildFlights() {
    const L = this.L;
    const buses = [['ilmb', 'tranq'], ['ilmb', 'shackleton'], ['ilmb', 'mine'], ['tranq', 'kepler'], ['aldrin', 'twilight'], ['twilight', 'farside']];
    const ships = [['ilmb', 'farside'], ['ilmb', 'hertz'], ['mine', 'twilight'], ['twilight', 'gloom'], ['kepler', 'vostok'], ['meridian', 'aldrin']];
    // ships first: they need the biggest open spots
    for (const [a, b] of ships) if (L[a] && L[b]) this.addFlyer('ship', L[a], L[b]);
    for (const [a, b] of buses) if (L[a] && L[b]) this.addFlyer('bus', L[a], L[b]);
  }


  // ================= road network =================
  //
  // Settlements are nodes, roads are edges. Every connected settlement gets a two-way ring road just
  // outside its buildings / plateau (pushed outward round pads, turret mounts and anything solid), and
  // each road from another town runs in radially and joins that ring at a flared T (curved fillets
  // either side, no stub, no turning loop). Vehicles drive directed "pieces": one lane per road
  // direction ('e'), one lane per direction for each stretch of ring between two junctions ('r'), and
  // short connectors at each junction ('j': turn onto the ring either way, carry on past, or turn off
  // onto the road out). Every vehicle has a destination town and a route (list of pieces): traffic
  // passing through follows the ring round to the road it needs; traffic for this town pulls in at
  // the town's single ring-side stop, then keeps going round the ring to whichever road it wants
  // next (so nothing ever needs a U-turn - a dead-end town is simply a lap of its ring).

  buildRoads() {
    const safe = this.w.locations.filter((l) => l.safe && !l.restricted && !l.poi && l.type !== 'pirate');
    const key = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
    const pairs = new Set();
    const has = (a, b) => pairs.has(key(a, b));
    const dist = (a, b) => arcDist(a.dir, b.dir);
    const near = new Map(safe.map((a) => [a, safe.filter((b) => b !== a).map((b) => ({ b, d: dist(a, b) })).sort((p, q) => p.d - q.d)]));
    for (const a of safe) {
      for (const { b, d } of near.get(a)) if (d < SAFE_ROAD) pairs.add(key(a, b));
      const n0 = near.get(a)[0];
      if (n0 && n0.d < LINK_MAX) pairs.add(key(a, n0.b));
    }
    // a second link where it isn't just a detour of an existing pair, so the network has loops
    for (const a of safe) {
      const n1 = near.get(a)[1];
      if (!n1 || n1.d >= LINK_MAX || has(a, n1.b)) continue;
      const detour = safe.some((x) => x !== a && x !== n1.b && has(a, x) && has(x, n1.b) && dist(a, x) + dist(x, n1.b) < 1.3 * n1.d);
      if (!detour) pairs.add(key(a, n1.b));
    }
    this.roadGeo = { pos: [], uv: [], fade: [], idx: [] };
    this.posts = [];
    this.pieces = [];
    this.gates = [];
    this.towns = new Map(); // loc -> gates
    this.rings = new Map(); // loc -> ring profile
    const keys = [...pairs].sort();
    for (const k of keys) for (const id of k.split('|')) if (!this.rings.has(this.L[id])) this.rings.set(this.L[id], this.ringProfile(this.L[id]));
    for (const k of keys) {
      const [a, b] = k.split('|');
      this.buildRoad(this.L[a], this.L[b]);
    }
    for (const [loc, R] of this.rings) this.buildRing(loc, R);
    this.pieces.forEach((pc, i) => { pc.id = i; this.finishPiece(pc); });
    for (const R of this.rings.values()) this.ringStop(R);
    const G = this.roadGeo;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    geo.setAttribute('fade', new THREE.Float32BufferAttribute(G.fade, 1));
    geo.setIndex(G.idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, roadMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.w.scene.add(mesh);
    this.roadMesh = mesh;
    this.roadGeo = null;
    // marker posts with reflective tips: two instanced draw calls for every road
    const n = this.posts.length;
    if (n) {
      const postM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 6).translate(0, 0.8, 0), toon(0xe8e4f4), n);
      const tipM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.35, 0.3).translate(0, 1.7, 0), glow(0xff9f1c), n);
      const one = new THREE.Vector3(1, 1, 1);
      this.posts.forEach((p, i) => {
        _m4.compose(p.pos, p.q, one);
        postM.setMatrixAt(i, _m4);
        tipM.setMatrixAt(i, _m4);
      });
      for (const m of [postM, tipM]) { m.frustumCulled = false; m.matrixAutoUpdate = false; this.w.scene.add(m); }
      postM.castShadow = true;
    }
    this.posts = null;
    this.roadVehicles = [];
    this.roads.forEach((road, k) => this.populateRoad(road, k));
  }

  // Can a 10 m road run over local (x,z)? Exact contact tests against colliders plus the keep-out
  // footprints (pads, solar fields, lamps, turret spots).
  roadClear(loc, x, z, keeps) {
    if (keeps.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 5)) return false;
    const y = this.groundY(loc, x, z);
    for (const h of [2, 5]) {
      this.w.toWorld(loc, x, y + h, z, _c);
      if (this.blocked(_c, 3.6)) return false;
    }
    return true;
  }

  // The ring's radius at M evenly spaced angles round the town: RING_GAP outside the settlement
  // radius (just past the buildings, at the foot of the plateau), pushed outward wherever the road
  // would touch something, with the bulges eased in and out so the ring stays a smooth curve.
  ringProfile(loc) {
    const TAU = Math.PI * 2;
    const keeps = this.keepouts(loc);
    const Rb = loc.r + RING_GAP;
    const M = Math.max(64, Math.ceil((TAU * Rb) / 4));
    const step = (TAU * Rb) / M;
    const clearAt = (i, r) => { const a = (i / M) * TAU; return this.roadClear(loc, Math.cos(a) * r, Math.sin(a) * r, keeps); };
    const need = (i, r0) => { for (let r = r0; r <= Rb + RING_PUSH; r += 3) if (clearAt(i, r)) return r; return Rb + RING_PUSH; };
    const req = new Float64Array(M);
    for (let i = 0; i < M; i++) req[i] = need(i, Rb);
    let rad = req;
    for (let it = 0; it < 5; it++) {
      rad = Float64Array.from(req);
      // at most ~1 m outward per 2.5 m along the ring, then rounded off
      const slope = 0.4 * step;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i <= 2 * M; i++) { const k = i % M; rad[k] = Math.max(rad[k], rad[(k + M - 1) % M] - slope); }
        for (let i = 2 * M - 1; i >= 0; i--) { const k = i % M; rad[k] = Math.max(rad[k], rad[(k + 1) % M] - slope); }
      }
      for (let pass = 0; pass < 8; pass++) {
        const nx = new Float64Array(M);
        for (let i = 0; i < M; i++) nx[i] = Math.max(req[i], (rad[(i + M - 1) % M] + 2 * rad[i] + rad[(i + 1) % M]) / 4);
        rad = nx;
      }
      // easing a bulge in may have pushed the neighbours into something else: re-check
      let bad = 0;
      for (let i = 0; i < M; i++) if (rad[i] < Rb + RING_PUSH && !clearAt(i, rad[i])) { req[i] = need(i, rad[i] + 3); bad++; }
      if (!bad) break;
    }
    let blocked = 0;
    for (let i = 0; i < M; i++) if (rad[i] >= Rb + RING_PUSH && !clearAt(i, rad[i])) blocked++;
    if (blocked) console.warn('[traffic] ring at', loc.id, 'still touches something at', blocked, 'samples');
    let maxR = 0;
    for (let i = 0; i < M; i++) maxR = Math.max(maxR, rad[i]);
    return { loc, M, Rb, step, rad, maxR, kd: Math.max(3, Math.round(JOIN / step)), gates: [] };
  }

  ringLocal(R, i) {
    i = ((i % R.M) + R.M) % R.M;
    const a = (i / R.M) * Math.PI * 2, r = R.rad[i];
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, a, r };
  }

  // Where a road from `other` joins this town's ring: as straight toward it as possible, on an
  // unbulged stretch with open ground outside, and well clear of the other junctions.
  ringGate(R, other) {
    const loc = R.loc, M = R.M, TAU = Math.PI * 2;
    const tw = this.toward(loc, other);
    const keeps = this.keepouts(loc);
    const sep = (i) => R.gates.every((g) => { const d = Math.abs(g.i - i); return Math.min(d, M - d) * R.step >= GATE_SEP; });
    const idx = (a) => ((Math.round((a / TAU) * M) % M) + M) % M;
    const kink = (i) => {
      let k = 0;
      for (let j = -R.kd * 2; j <= R.kd * 2; j++) k = Math.max(k, Math.abs(R.rad[(i + j + M) % M] - R.rad[i]));
      return k;
    };
    const outside = (i) => {
      const p = this.ringLocal(R, i), ux = Math.cos(p.a), uz = Math.sin(p.a);
      for (let t = 8; t <= 56; t += 4) if (!this.roadClear(loc, ux * (p.r + t), uz * (p.r + t), keeps)) return false;
      return true;
    };
    let best = null;
    for (const dev of [0, 0.06, -0.06, 0.12, -0.12, 0.2, -0.2, 0.3, -0.3, 0.42, -0.42, 0.56, -0.56, 0.72, -0.72, 0.9, -0.9, 1.1, -1.1, 1.35, -1.35]) {
      const i = idx(tw + dev);
      if (!sep(i) || !outside(i)) continue;
      const bulge = R.rad[i] - R.Rb, kk = kink(i);
      const score = Math.abs(dev) * 40 + bulge + kk * 3;
      if (!best || score < best.score) best = { i, score };
      if (bulge < 4 && kk < 2) break;
    }
    if (!best) {
      // crowded: the nearest angle that keeps the junctions apart
      for (let k = 0; k < M; k++) {
        const i = idx(tw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / M));
        if (sep(i)) { best = { i }; break; }
      }
      console.warn('[traffic] no open ring junction at', loc.id, 'toward', other.id);
      if (!best) best = { i: idx(tw) };
    }
    const p = this.ringLocal(R, best.i);
    return { loc, R, i: best.i, a: p.a, x: p.x, z: p.z, rr: p.r };
  }

  // Visible track: a strip of 5 ground-hugging samples across 10 m along a ground polyline.
  // `fade` (0..1) lets a strip melt into another one it overlaps (junction flares, road ends).
  stripPush(centre, sideV, s, vScale = 1, fade = 1) {
    const G = this.roadGeo;
    for (const o of ROAD_LAT) {
      _b.copy(centre).addScaledVector(sideV, o * vScale);
      this.P.ground(_b, _b, 0.04);
      G.pos.push(_b.x, _b.y, _b.z);
      G.uv.push(o / 5, s);
      G.fade.push(fade);
    }
  }

  stripIdx(base, rows) {
    const G = this.roadGeo, n = ROAD_LAT.length;
    for (let i = 0; i < rows - 1; i++) {
      for (let k = 0; k < n - 1; k++) {
        const a = base + i * n + k, b = a + n;
        G.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  // Tangent, right-hand side and arc length along a ground polyline (closed: wraps round).
  frames(g, closed = false) {
    const N = g.length - 1, side = [], tan = [], cum = [0];
    for (let i = 0; i <= N; i++) {
      const up = _u.copy(g[i]).normalize();
      const nx = closed ? g[(i + 1) % (N + 1)] : g[Math.min(N, i + 1)];
      const pv = closed ? g[(i + N) % (N + 1)] : g[Math.max(0, i - 1)];
      const t = new THREE.Vector3().subVectors(nx, pv);
      t.addScaledVector(up, -t.dot(up)).normalize();
      tan.push(t);
      side.push(new THREE.Vector3().crossVectors(t, up).normalize());
      if (i) cum.push(cum[i - 1] + g[i].distanceTo(g[i - 1]));
    }
    return { side, tan, cum };
  }

  drawLine(g, s0 = 0, vScale = 1, fadeAt = null) {
    const { side, cum } = this.frames(g);
    const base = this.roadGeo.pos.length / 3;
    for (let i = 0; i < g.length; i++) this.stripPush(g[i], side[i], s0 + cum[i], vScale, fadeAt ? fadeAt(i / (g.length - 1)) : 1);
    this.stripIdx(base, g.length);
  }

  newPiece(kind, raw, opts) {
    const pc = { kind, raw, next: [], vehicles: [], vlim: Infinity, ...opts };
    this.pieces.push(pc);
    return pc;
  }

  // Cubic from p0 (heading t0) to p1 (arriving along t1), n+1 points (world; grounded later).
  bez(p0, t0, p1, t1, n = 10, k = 0.42) {
    const h = p0.distanceTo(p1) * k;
    const c0 = p0.clone().addScaledVector(t0, h), c1 = p1.clone().addScaledVector(t1, -h);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push(new THREE.Vector3()
        .addScaledVector(p0, u * u * u).addScaledVector(c0, 3 * u * u * t)
        .addScaledVector(c1, 3 * u * t * t).addScaledVector(p1, t * t * t));
    }
    return out;
  }

  buildRoad(A, B) {
    const P = this.P, R = P.R;
    const RA = this.rings.get(A), RB = this.rings.get(B);
    const eA = this.ringGate(RA, B);
    RA.gates.push(eA);
    const eB = this.ringGate(RB, A);
    RB.gates.push(eB);
    const dirAt = (e, extra) => this.w.toWorld(e.loc, Math.cos(e.a) * (e.rr + extra), 0, Math.sin(e.a) * (e.rr + extra)).normalize();
    // leave each ring radially (straight for the first ~50 m so the junction reads as a clean T)
    const dA = dirAt(eA, 0), dA1 = dirAt(eA, 24), dA2 = dirAt(eA, 52), dB = dirAt(eB, 0), dB1 = dirAt(eB, 24), dB2 = dirAt(eB, 52);
    // control points: then a gently meandering great circle
    const len = arcDist(dA2, dB2);
    const n = Math.max(3, Math.ceil(len / 30));
    const rr = mulberry32(Math.floor(len * 7) + A.id.length * 131 + B.id.length * 17);
    const ph1 = rr() * 6.28, ph2 = rr() * 6.28, f1 = Math.max(1, Math.round(len / 900)), f2 = Math.max(2, Math.round(len / 330));
    const axis = new THREE.Vector3().crossVectors(dA2, dB2).normalize();
    const ctrl = [dA, dA1, dA2];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const d = new THREE.Vector3().lerpVectors(dA2, dB2, t).normalize();
      const env = smooth(t * len / 150) * smooth((1 - t) * len / 150);
      const off = env * (40 * Math.sin(Math.PI * 2 * f1 * t + ph1) + 12 * Math.sin(Math.PI * 2 * f2 * t + ph2));
      d.addScaledVector(axis, off / R).normalize();
      ctrl.push(d);
    }
    ctrl.push(dB2, dB1, dB);
    // keep clear of every other settlement (and its ring), military zone and black lake, and off
    // its own two rings once it has left them
    const obs = [];
    for (const l of this.w.locations) {
      const ring = this.rings.get(l);
      const r0 = l === A || l === B ? ring.maxR + 18 : Math.max((l.zoneR || l.r) + 55, ring ? ring.maxR + 40 : 0);
      obs.push({ d: l.dir, r: r0 });
    }
    for (const lk of this.w.lakes || []) obs.push({ d: lk.d, r: Math.acos(Math.min(1, lk.cos)) * R + 25 });
    for (let it = 0; it < 60; it++) {
      for (let i = 3; i < ctrl.length - 3; i++) {
        const p = ctrl[i];
        for (const o of obs) {
          const dist = arcDist(p, o.d);
          if (dist >= o.r) continue;
          _a.copy(p).sub(o.d);
          _a.addScaledVector(p, -_a.dot(p));
          if (_a.lengthSq() < 1e-12) _a.copy(axis);
          _a.normalize();
          p.addScaledVector(_a, ((o.r - dist) * 0.6 + 1) / R).normalize();
        }
      }
      for (let i = 3; i < ctrl.length - 3; i++) {
        _a.copy(ctrl[i - 1]).add(ctrl[i + 1]).multiplyScalar(0.25).addScaledVector(ctrl[i], 0.5);
        ctrl[i].copy(_a.normalize());
      }
    }
    // dense centreline every ~4 m on the ground
    const curve = new THREE.CatmullRomCurve3(ctrl.map((d) => d.clone().multiplyScalar(R)), false, 'centripetal');
    const total = curve.getLength();
    const N = Math.max(8, Math.ceil(total / 4));
    const dirs = curve.getSpacedPoints(N).map((p) => p.normalize());
    const g = dirs.map((d) => P.ground(d, new THREE.Vector3()));
    const { side, tan, cum } = this.frames(g);
    // the strip stops just short of each ring's centreline (the ring strip covers the join)
    let i0 = 0, i1 = N;
    while (i0 < N && cum[i0] < 2.5) i0++;
    while (i1 > 0 && cum[N] - cum[i1] < 2.5) i1--;
    const base = this.roadGeo.pos.length / 3;
    for (let i = i0; i <= i1; i++) this.stripPush(g[i], side[i], cum[i], 1, smooth((Math.min(cum[i], cum[N] - cum[i]) - 2.5) / 7));
    this.stripIdx(base, i1 - i0 + 1);
    // marker posts every ~110 m, alternating sides
    for (let s = 60, k = 0; s < cum[N] - 60; s += 110, k++) {
      let i = 0;
      while (i < N && cum[i] < s) i++;
      const p = g[i].clone().addScaledVector(side[i], k % 2 ? 6.5 : -6.5);
      P.ground(p, p);
      this.posts.push({ pos: p, q: frameQuat(dirs[i], tan[i], new THREE.Quaternion()) });
    }
    // pads and shelters stay off the first stretch out of each town
    for (const [loc, from] of [[A, true], [B, false]]) {
      for (let k = 0; k <= N && (from ? cum[k] : cum[N] - cum[N - k]) < 90; k += 2) {
        const p = this.local(loc, g[from ? k : N - k], _a);
        loc.stopKeep.push({ x: p.x, z: p.z, r: 6 });
      }
    }
    // ---- lanes: right-hand traffic; the last ~20 m at each end belong to the ring junctions ----
    const step = cum[N] / N;
    const K = Math.max(2, Math.round(JOIN_OUT / step));
    const ab = [], ba = [];
    for (let i = 0; i <= N; i++) ab.push(g[i].clone().addScaledVector(side[i], LANE));
    for (let i = N; i >= 0; i--) ba.push(g[i].clone().addScaledVector(side[i], -LANE));
    const road = { A, B, eA, eB, len: cum[N] };
    // centreline out of each ring (for the drawn fillets), inward travel directions at the lane ends
    const clA = g.slice(0, K * 2 + 2), clB = g.slice(N - K * 2 - 1).reverse();
    const gA = { loc: A, other: B, e: eA, road, cl: clA }, gB = { loc: B, other: A, e: eB, road, cl: clB };
    const pAB = this.newPiece('e', ab.slice(K, N + 1 - K), { from: gA, to: gB, fromLoc: A, toLoc: B, road });
    const pBA = this.newPiece('e', ba.slice(K, N + 1 - K), { from: gB, to: gA, fromLoc: B, toLoc: A, road });
    gA.out = pAB; gA.in = pBA; gB.in = pAB; gB.out = pBA;
    const dir = (p, q) => q.clone().sub(p).normalize();
    gB.inEnd = ab[N - K]; gB.inDir = dir(ab[N - K - 1], ab[N - K]);
    gA.inEnd = ba[N - K]; gA.inDir = dir(ba[N - K - 1], ba[N - K]);
    gA.outStart = ab[K]; gA.outDir = dir(ab[K], ab[K + 1]);
    gB.outStart = ba[K]; gB.outDir = dir(ba[K], ba[K + 1]);
    eA.gate = gA; eB.gate = gB;
    road.lanes = [pAB, pBA];
    road.gates = [gA, gB];
    for (const gt of [gA, gB]) {
      if (!this.towns.has(gt.loc)) this.towns.set(gt.loc, []);
      this.towns.get(gt.loc).push(gt);
      this.gates.push(gt);
    }
    this.roads.push(road);
  }

  // The ring itself: one closed strip, a flared join for each road, lanes and junction connectors.
  buildRing(loc, R) {
    const P = this.P, M = R.M, kd = R.kd;
    const W = [];
    for (let i = 0; i < M; i++) { const p = this.ringLocal(R, i); W.push(P.ground(this.w.toWorld(loc, p.x, 0, p.z), new THREE.Vector3())); }
    const { side, tan } = this.frames(W, true);
    R.W = W; R.side = side; R.tan = tan;
    const wrap = (i) => ((i % M) + M) % M;
    // closed strip (the last row repeats the first)
    {
      const base = this.roadGeo.pos.length / 3;
      let s = 0;
      for (let i = 0; i <= M; i++) {
        if (i) s += W[wrap(i)].distanceTo(W[i - 1]);
        this.stripPush(W[wrap(i)], side[wrap(i)], s);
      }
      this.stripIdx(base, M + 1);
    }
    const lane = (d, i) => W[wrap(i)].clone().addScaledVector(side[wrap(i)], LANE * d);
    const laneT = (d, i) => tan[wrap(i)].clone().multiplyScalar(d);
    // which way round has the town on its right (the stop goes on that lane)
    const c0 = this.w.toWorld(loc, 0, 0, 0);
    R.din = side[0].dot(_a.copy(c0).sub(W[0])) > 0 ? 1 : -1;
    const gates = R.gates.sort((p, q) => p.i - q.i);
    const n = gates.length;
    loc.ring = { radius: Math.round(R.Rb), max: Math.round(R.maxR), gates: n };
    // flared joins: a curved fillet each side of the road, road centreline -> ring centreline
    for (const e of gates) {
      const gt = e.gate, cl = gt.cl;
      let k = 1;
      while (k < cl.length - 1 && cl[k].distanceTo(cl[0]) < FILLET) k++;
      const q = cl[k], tIn = cl[k - 1].clone().sub(cl[k]).normalize();
      const m = Math.max(2, Math.round(FILLET / R.step));
      for (const d of [1, -1]) {
        const j = e.i + d * m;
        this.drawLine(this.bez(q, tIn, W[wrap(j)], laneT(d, j), 10, 0.5), 0, 0.85, (t) => smooth(t / 0.3) * smooth((1 - t) / 0.3));
      }
    }
    // marker posts on the outside of the ring, away from the junctions
    const outSide = -R.din;
    const near = (i, list, dist) => list.some((gi) => { const d = Math.abs(gi - i); return Math.min(d, M - d) * R.step < dist; });
    const postEvery = Math.max(8, Math.round(95 / R.step));
    for (let i = 0; i < M; i += postEvery) {
      if (near(i, gates.map((e) => e.i), 34)) continue;
      const p = W[i].clone().addScaledVector(side[i], 6.5 * outSide);
      P.ground(p, p);
      this.posts.push({ pos: p, q: frameQuat(W[i].clone().normalize(), tan[i], new THREE.Quaternion()) });
    }
    // pads (laid out after the roads) keep off the ring
    for (let i = 0; i < M; i += 2) { const p = this.ringLocal(R, i); loc.stopKeep.push({ x: p.x, z: p.z, r: 6 }); }
    if (!n) return;
    // ---- pieces ----
    const span = (d, from, to) => { const out = []; for (let i = from; d > 0 ? i <= to : i >= to; i += d) out.push(lane(d, i)); return out; };
    const arcP = [], arcM = [];
    for (let k = 0; k < n; k++) {
      const c = gates[k].i, c1 = k + 1 < n ? gates[k + 1].i : gates[0].i + M;
      arcP.push(this.newPiece('r', span(1, c + kd, c1 - kd), { town: loc, ring: R, dirn: 1, i0: c + kd, i1: c1 - kd, vlim: 11 }));
      arcM.push(this.newPiece('r', span(-1, c1 - kd, c + kd), { town: loc, ring: R, dirn: -1, i0: c1 - kd, i1: c + kd, vlim: 11 }));
    }
    for (let k = 0; k < n; k++) {
      const e = gates[k], gt = e.gate, c = e.i;
      const opt = { town: loc, gate: gt, vlim: 7 };
      const entP = this.newPiece('j', [gt.inEnd, ...this.bez(gt.inEnd, gt.inDir, lane(1, c + kd), laneT(1, c + kd)).slice(1)], opt);
      const entM = this.newPiece('j', [gt.inEnd, ...this.bez(gt.inEnd, gt.inDir, lane(-1, c - kd), laneT(-1, c - kd)).slice(1)], opt);
      const exP = this.newPiece('j', this.bez(lane(1, c - kd), laneT(1, c - kd), gt.outStart, gt.outDir), opt);
      const exM = this.newPiece('j', this.bez(lane(-1, c + kd), laneT(-1, c + kd), gt.outStart, gt.outDir), opt);
      const thP = this.newPiece('j', span(1, c - kd, c + kd), { ...opt, vlim: 11 });
      const thM = this.newPiece('j', span(-1, c + kd, c - kd), { ...opt, vlim: 11 });
      const prev = (k + n - 1) % n;
      gt.in.next = [entP, entM];
      entP.next = [arcP[k]]; thP.next = [arcP[k]];
      entM.next = [arcM[prev]]; thM.next = [arcM[prev]];
      exP.next = [gt.out]; exM.next = [gt.out];
      arcP[prev].next = [thP, exP];
      arcM[k].next = [thM, exM];
      Object.assign(gt, { entP, entM, exP, exM, thP, thM });
    }
    R.arcs = { 1: arcP, [-1]: arcM };
  }

  // Smooth the corners (ends stay put so pieces join exactly), drop onto the ground, smoothed normals.
  finishPiece(pc) {
    const P = this.P;
    let pts = pc.raw;
    if (pc.kind !== 'e') {
      const dense = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const k = Math.max(1, Math.round(pts[i].distanceTo(pts[i - 1]) / 2));
        for (let j = 1; j <= k; j++) dense.push(pts[i - 1].clone().lerp(pts[i], j / k));
      }
      pts = dense;
      for (let pass = 0; pass < 8; pass++) {
        const nx = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : p.clone().multiplyScalar(0.5).addScaledVector(pts[i - 1], 0.25).addScaledVector(pts[i + 1], 0.25)));
        pts = nx;
      }
    }
    const nor = [];
    for (const p of pts) { const nn = new THREE.Vector3(); P.ground(p, p); P.surface(p, nn); nor.push(nn); }
    // smoothed terrain normals, leaned toward radial up so vehicles don't jitter on every facet
    const M = nor.length;
    pc.normals = nor.map((_, i) => {
      const s = new THREE.Vector3();
      for (let k = -3; k <= 3; k++) s.add(nor[Math.min(M - 1, Math.max(0, i + k))]);
      return s.normalize().lerp(pts[i].clone().normalize(), 0.3).normalize();
    });
    pc.path = makePath(pts);
    pc.len = pc.path.len;
    pc.raw = null;
  }

  // The town's stop: one shelter + sign on the town side of the ring, on a stretch long enough for
  // a land-train to pull in, open ground for the shelter, and as close to the buildings as it gets.
  ringStop(R) {
    const loc = R.loc, M = R.M, d = R.din;
    if (!R.arcs) return;
    const keeps = this.keepouts(loc, false);
    const bl = this.buildings(loc);
    const wrap = (i) => ((i % M) + M) % M;
    let best = null;
    for (const pc of R.arcs[d]) {
      const n = Math.abs(pc.i1 - pc.i0);
      const lo = Math.ceil(STOP_IN / R.step), hi = n - Math.ceil(16 / R.step);
      for (let j = lo; j <= hi; j += 2) {
        const i = wrap(pc.i0 + d * j);
        const p = this.ringLocal(R, i);
        // shelter 9 m in from the centreline, toward the town
        const ux = Math.cos(p.a), uz = Math.sin(p.a);
        const sx = p.x - ux * 9, sz = p.z - uz * 9;
        if (keeps.some((k) => Math.hypot(sx - k.x, sz - k.z) < k.r + 2.5)) continue;
        this.w.toWorld(loc, sx, this.groundY(loc, sx, sz) + 1.5, sz, _c);
        if (this.blocked(_c, 2.4)) continue;
        let db = 200;
        for (const b of bl) db = Math.min(db, Math.hypot(b.x - sx, b.z - sz) - (b.r || Math.max(b.hx, b.hz)));
        const score = (p.r - R.Rb) * 2 + Math.max(0, db) * 0.6;
        if (!best || score < best.score) best = { pc, i, sx, sz, score };
      }
    }
    if (!best) {
      // nowhere ideal: the middle of the longest stretch
      const pc = R.arcs[d].reduce((p, q) => (q.len > p.len ? q : p));
      const i = wrap(pc.i0 + d * Math.round(Math.abs(pc.i1 - pc.i0) * 0.6));
      const p = this.ringLocal(R, i);
      best = { pc, i, sx: p.x - Math.cos(p.a) * 9, sz: p.z - Math.sin(p.a) * 9 };
      console.warn('[traffic] no open shelter spot on the ring at', loc.id);
    }
    const pc = best.pc, path = pc.path;
    // arc length on the finished lane nearest the chosen ring sample
    const target = R.W[best.i].clone().addScaledVector(R.side[best.i], LANE * d);
    let bi = 0, bd = Infinity;
    for (let k = 0; k < path.pts.length; k++) { const dd = path.pts[k].distanceToSquared(target); if (dd < bd) { bd = dd; bi = k; } }
    const s = path.cum[bi];
    const p = path.pts[bi].clone();
    const sL = this.local(loc, p, new THREE.Vector3());
    const { sx, sz } = best;
    const yaw = Math.atan2(sL.x - sx, sL.z - sz);
    const names = (this.towns.get(loc) || []).map((g) => g.other.short);
    const text = `ROADS > ${names.slice(0, 3).join(' ')}${names.length > 3 ? ' +' : ''}`;
    this.shelter(loc, sx, sz, yaw, text, 0xff9f1c);
    loc.stopKeep.push({ x: sx, z: sz, r: 3 });
    const wait = { x: sx + Math.sin(yaw) * 1.8, y: this.groundY(loc, sx, sz), z: sz + Math.cos(yaw) * 1.8, g: true };
    const r = Math.hypot(sx, sz) || 1;
    pc.stop = {
      loc, kind: 'road', piece: pc, s, world: p, wait, origin: wait,
      town: this.townPoint(loc, sx - (sx / r) * 4, sz - (sz / r) * 4, 90),
      queue: [], queued: false,
    };
    R.stop = pc.stop;
    loc.ringStop = pc.stop;
    loc.ring.stop = Math.round(Math.atan2(best.sz, best.sx) * 57.3);
    this.stops.push(pc.stop);
  }

  // ---------- routing ----------

  // Pieces to drive after `from` to reach the stop lane of town `dest` (Dijkstra over lane lengths).
  route(from, dest) {
    const target = dest && dest.ringStop && dest.ringStop.piece;
    if (!target) return null;
    const N = this.pieces.length;
    const d = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    for (const nx of from.next) { d[nx.id] = nx.len; prev[nx.id] = -2; }
    for (;;) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && d[i] < bd) { bd = d[i]; bi = i; }
      if (bi < 0) return null;
      done[bi] = 1;
      const pc = this.pieces[bi];
      if (pc === target) {
        const out = [];
        for (let i = bi; i >= 0; i = prev[i]) out.unshift(this.pieces[i]);
        return out;
      }
      for (const nx of pc.next) if (bd + nx.len < d[nx.id]) { d[nx.id] = bd + nx.len; prev[nx.id] = bi; }
    }
  }

  // Somewhere new to go: a neighbouring town half the time, otherwise anywhere on the network.
  pickDest(v) {
    const here = v.piece.kind === 'e' ? v.piece.toLoc : v.piece.town;
    const towns = [...this.towns.keys()].filter((l) => l !== here && l.ringStop);
    const nbrs = (this.towns.get(here) || []).map((g) => g.other).filter((l) => l.ringStop);
    const list = nbrs.length && this.r() < 0.5 ? nbrs : towns;
    return list[Math.floor(this.r() * list.length)] || here;
  }

  plan(v, dest) {
    v.dest = dest || this.pickDest(v);
    const st = v.dest.ringStop;
    // already on the stop lane, short of the shelter: just pull in
    if (st && v.piece === st.piece && v.s < st.s - 1) { v.plan = []; return; }
    v.plan = this.route(v.piece, v.dest) || [];
  }

  move(v, pc) {
    if (v.piece) { const i = v.piece.vehicles.indexOf(v); if (i >= 0) v.piece.vehicles.splice(i, 1); }
    v.piece = pc;
    if (pc) pc.vehicles.push(v);
  }

  // Put a land-train, two hover-cars and a buggy on each road, each with somewhere to go.
  populateRoad(road, k) {
    const add = (v) => {
      const pc = road.lanes[this.r() < 0.5 ? 0 : 1];
      Object.assign(v, {
        piece: null, s: pc.len * (0.1 + this.r() * 0.8), plan: [], hist: [], dest: null, cur: 0, state: 'drive', timer: 0,
        pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(),
        hintF: { i: 0, f: 0 }, hintR: { i: 0, f: 0 }, hover: 0, smokeT: 0, roll: 0,
      });
      this.move(v, pc);
      this.plan(v);
      this.roadVehicles.push(v);
      return v;
    };
    // land-train
    const cars = k % 2 ? ['pax', 'cargo', 'cargo'] : ['pax', 'pax', 'cargo'];
    const lt = makeLandTrain({ color: [0xff9f1c, 0x2ec4ff, 0x7dff6a, 0xffd23f, 0xff7ad9][k % 5], cars });
    this.w.scene.add(lt.root);
    for (const t of lt.trailers) this.w.scene.add(t.root);
    const train = add({
      ...lt, kind: 'landtrain', vmax: 11, acc: 1.4, front: 4.6, tail: 4.4 + lt.trailers.length * 9.9, waitT: 16,
      deck: [1.95, 2.45, 4.3], deckY: 2.45, col: null, quat: lt.root.quaternion, view: 1200, radius: 6, boarding: 0, wheelR: 1.2,
      pax: [1, 3], hp: TRAIN_HP, maxHp: TRAIN_HP, hitR: 4.8, credits: 60,
    });
    train.trailers.forEach((t, i) => {
      t.offset = 4.3 + 1.6 + 4.0 + i * 9.9;
      t.hintF = { i: 0, f: 0 }; t.hintR = { i: 0, f: 0 };
      t.plat = { pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), deck: [1.9, 2.4, 4.2], deckY: 2.4, quat: t.root.quaternion, col: null };
      this.platforms.push(t.plat);
    });
    this.vehicles.push(train);
    // hover-cars: hop over slower traffic instead of queueing (the jar can scoop these)
    for (let i = 0; i < 2; i++) {
      const m = makeHoverCar({ color: [0xff7ad9, 0x2ec4ff, 0x7dff6a, 0xffd23f][(k + i) % 4] });
      m.root.matrixAutoUpdate = true;
      this.w.scene.add(m.root);
      const v = add({ ...m, kind: 'car', vmax: 17 + this.r() * 6, acc: 4, front: 2, tail: 2, waitT: 4, deck: [1.3, 1.1, 2.7], deckY: 0, col: null, quat: m.root.quaternion, view: 800, radius: 2.5, hoverH: 1.7 });
      this.vehicles.push(v);
    }
    // buggy (old-style crawler): queues behind slower traffic
    const r = makeRover({ color: [0xffd23f, 0xff9f1c, 0x7dff6a][k % 3], trim: 0xfff4e0, pirate: false, flag: 0x2ec4ff });
    r.gun.visible = false;
    r.root.scale.setScalar(1.3);
    this.w.scene.add(r.root);
    const b = add({ ...r, kind: 'buggy', vmax: 12 + this.r() * 3, acc: 2.5, front: 3.4, tail: 3.4, waitT: 6, view: 900, wheelR: 1.1, hp: BUGGY_HP, maxHp: BUGGY_HP, hitR: 3.4, credits: 25 });
    this.crawlers.push(b);
  }

  // ================= passengers =================

  figure() {
    let f = this.pool.find((p) => !p.busy);
    if (!f) {
      if (this.pool.length >= 40) return null;
      const pal = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff, 0xffffff, 0xff3b5c];
      const k = this.pool.length;
      f = makeFigure({ suit: pal[k % pal.length], helmet: k % 3 ? 0xfff4e0 : 0xffd23f, scale: k % 7 === 3 ? 0.62 : 1 });
      f.phase = k * 1.7;
      this.pool.push(f);
    }
    f.busy = true;
    return f;
  }

  release(wk) {
    wk.fig.busy = false;
    wk.fig.root.removeFromParent();
    if (wk.board && wk.owner && !wk.counted) { wk.owner.boarding = Math.max(0, wk.owner.boarding - 1); wk.counted = true; }
    wk.done = true;
  }

  walker(loc, pts, opts) {
    const fig = this.figure();
    if (!fig) return null;
    loc.group.add(fig.root);
    fig.root.visible = true;
    fig.root.position.set(pts[0].x, pts[0].y, pts[0].z);
    const wk = { fig, loc, pts, seg: 0, t: 0, delay: 0, speed: 1.6 + Math.random() * 0.5, done: false, ...opts };
    if (wk.board && wk.owner) wk.owner.boarding++;
    this.walkers.push(wk);
    return wk;
  }

  stopNear(stop) { return stop.loc.active && stop.world.distanceTo(this.cam) < PAX_RANGE; }

  // Buildings of a settlement as walkable targets (local frame), from its static colliders.
  buildings(loc) {
    if (loc._bld) return loc._bld;
    const out = [];
    const list = this.C.query(this.w.toWorld(loc, 0, 0, 0), loc.r * 1.15 + 10, []);
    for (const c of list) {
      if (c.platform) continue;
      const cl = this.local(loc, c.c, new THREE.Vector3());
      if (Math.hypot(cl.x, cl.z) > loc.r * 1.15) continue;
      if (c.type === 'box') {
        const ay = _a.copy(c.ay).transformDirection(loc._inv);
        if (Math.abs(ay.y) < 0.9 || c.hy < 1.2 || Math.max(c.hx, c.hz) < 2 || Math.min(c.hx, c.hz) < 0.8 || cl.y - c.hy > 1.5) continue;
        const ax = _b.copy(c.ax).transformDirection(loc._inv), az = _d.copy(c.az).transformDirection(loc._inv);
        const lx = Math.hypot(ax.x, ax.z) || 1, lz = Math.hypot(az.x, az.z) || 1;
        out.push({ c, type: 'box', x: cl.x, z: cl.z, ax: [ax.x / lx, ax.z / lx], az: [az.x / lz, az.z / lz], hx: c.hx, hz: c.hz });
      } else if (c.type === 'sphere') {
        if (c.r < 4 || cl.y > c.r * 0.5) continue;
        out.push({ c, type: 'round', x: cl.x, z: cl.z, r: Math.sqrt(Math.max(1, c.r * c.r - cl.y * cl.y)) });
      } else if (c.type === 'cyl') {
        if (c.r < 2.5) continue;
        out.push({ c, type: 'round', x: cl.x, z: cl.z, r: c.r });
      }
    }
    loc._bld = out;
    return out;
  }

  // Door on the wall of building b facing the point o (local frame).
  door(b, o, jitter) {
    const rx = o.x - b.x, rz = o.z - b.z;
    if (b.type === 'round') {
      const d = Math.hypot(rx, rz) || 1;
      const a = Math.atan2(rz, rx) + jitter * 0.25;
      return { x: b.x + Math.cos(a) * (b.r + 0.35), z: b.z + Math.sin(a) * (b.r + 0.35), d };
    }
    const da = rx * b.ax[0] + rz * b.ax[1], dz = rx * b.az[0] + rz * b.az[1];
    const alongX = Math.abs(da) / b.hx > Math.abs(dz) / b.hz;
    const n = alongX ? b.ax : b.az, t = alongX ? b.az : b.ax;
    const h = alongX ? b.hx : b.hz, w = alongX ? b.hz : b.hx;
    const sg = (alongX ? da : dz) >= 0 ? 1 : -1;
    const lat = jitter * w * 0.45;
    return { x: b.x + n[0] * sg * (h + 0.35) + t[0] * lat, z: b.z + n[1] * sg * (h + 0.35) + t[1] * lat };
  }

  // Is a straight walk from p to q clear of colliders (ignoring the target building)?
  walkClear(loc, p, q, ignore) {
    const L = Math.hypot(q.x - p.x, q.z - p.z), n = Math.ceil(L / 1.5);
    for (let i = 1; i <= n; i++) {
      const t = Math.min(i / n, Math.max(0, 1 - 0.6 / L));
      const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
      this.w.toWorld(loc, x, this.groundY(loc, x, z) + 1.0, z, _c);
      this.C.query(_c, 0.5, this._buf);
      for (const c of this._buf) if (c !== ignore && !c.platform && this.C.contact(c, _c, 0.45, _n) > 0) return false;
    }
    return true;
  }

  // Straight segments from o to the door, stepping round one obstacle if needed.
  planWalk(loc, o, d, ignore) {
    if (this.walkClear(loc, o, d, ignore)) return [d];
    const L = Math.hypot(d.x - o.x, d.z - o.z) || 1;
    const px = -(d.z - o.z) / L, pz = (d.x - o.x) / L;
    for (const f of [0.5, 0.3, 0.7]) {
      for (const off of [5, -5, 10, -10, 16, -16, 24, -24]) {
        const w = { x: o.x + (d.x - o.x) * f + px * off, z: o.z + (d.z - o.z) * f + pz * off };
        if (this.walkClear(loc, o, w, null) && this.walkClear(loc, w, d, ignore)) return [w, d];
      }
    }
    return null;
  }

  // Up to 8 walkable building entrances near a stop (cached; colliders are static).
  doorsFor(stop) {
    if (stop.doors) return stop.doors;
    const loc = stop.loc, o = stop.origin;
    const bl = this.buildings(loc)
      .map((b) => ({ b, d: Math.hypot(b.x - o.x, b.z - o.z) }))
      .filter((e) => e.d < 200)
      .sort((p, q) => p.d - q.d)
      .slice(0, 24);
    const doors = [];
    let k = 0;
    for (const { b } of bl) {
      if (doors.length >= 8) break;
      const d = this.door(b, o, ((k++ * 0.618) % 1) * 2 - 1);
      this.w.toWorld(loc, d.x, this.groundY(loc, d.x, d.z) + 1, d.z, _c);
      this.C.query(_c, 0.6, this._buf);
      if (this._buf.some((c) => c !== b.c && !c.platform && this.C.contact(c, _c, 0.5, _n) > 0)) continue;
      const path = this.planWalk(loc, o, d, b.c);
      if (path) doors.push(path.map((p) => ({ x: p.x, y: this.groundY(loc, p.x, p.z), z: p.z, g: true })));
    }
    stop.doors = doors;
    return doors;
  }

  // Boarders turn up while the vehicle is on its way in: most walk out of a building, a few are
  // already waiting at the shelter.
  queueBoarders(stop, v) {
    if (stop.queued || !this.stopNear(stop)) return;
    stop.queued = true;
    const doors = this.doorsFor(stop);
    const n = v.pax[0] + Math.floor(Math.random() * (v.pax[1] - v.pax[0] + 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.6;
      const p = { x: stop.wait.x + Math.cos(a) * rr, y: stop.wait.y, z: stop.wait.z + Math.sin(a) * rr, g: true };
      let wk;
      if (doors.length && Math.random() < 0.75) {
        const path = doors[Math.floor(Math.random() * doors.length)];
        const pts = [...path].reverse().map((q) => ({ ...q }));
        pts.push({ ...stop.origin, g: true, y: this.groundY(stop.loc, stop.origin.x, stop.origin.z) }, p);
        wk = this.walker(stop.loc, pts, { hold: true, stop, delay: Math.random() * 3 });
      } else {
        wk = this.walker(stop.loc, [p], { idle: true, stop });
        if (wk) wk.fig.root.rotation.y = Math.random() * 6;
      }
      if (wk) stop.queue.push(wk);
    }
  }

  // Doors open: some get off and head for a building, the queue walks up the ramp.
  exchange(v, stop) {
    if (!this.stopNear(stop)) { stop.queue.forEach((wk) => this.release(wk)); stop.queue = []; stop.queued = false; return; }
    const loc = stop.loc;
    v.root.updateMatrixWorld(true);
    const pt = (lp, ground) => {
      const p = this.local(loc, v.root.localToWorld(_a.copy(lp)), new THREE.Vector3());
      return { x: p.x, y: ground ? this.groundY(loc, p.x, p.z) : p.y, z: p.z, g: !!ground };
    };
    let door;
    if (v.kind === 'landtrain') {
      const tr = v.trailers.find((t) => t.kind === 'pax') || v.trailers[0];
      tr.root.updateMatrixWorld(true);
      const lp = (x, y) => {
        const p = this.local(loc, tr.root.localToWorld(_a.set(x, y, 0)), new THREE.Vector3());
        return { x: p.x, y: y > 0.5 ? p.y : this.groundY(loc, p.x, p.z), z: p.z, g: y <= 0.5 };
      };
      door = [lp(-0.6, 1.9), lp(-1.9, 1.9), lp(-3.6, 0)];
    } else {
      // the ramp ends on the pad deck (not the ground) for flyers
      const bottom = pt(v.rampBottom, false);
      bottom.y = stop.top; bottom.g = false;
      door = [pt(v.inside, false), pt(v.rampTop, false), bottom];
    }
    // off the pad toward the shelter side, then to a building
    let exit = null;
    if (stop.kind === 'pad') {
      const a = Math.atan2(stop.wait.z - stop.z, stop.wait.x - stop.x) + 0.5;
      exit = { x: stop.x + Math.cos(a) * (stop.padR + 1.5), y: stop.top, z: stop.z + Math.sin(a) * (stop.padR + 1.5), g: false };
    }
    const doors = this.doorsFor(stop);
    const nOff = v.pax[0] + Math.floor(Math.random() * (v.pax[1] - v.pax[0] + 1));
    for (let i = 0; i < nOff; i++) {
      const via = exit ? [exit, { ...exit, y: this.groundY(loc, exit.x, exit.z), g: true }] : [];
      via.push({ ...stop.origin, y: this.groundY(loc, stop.origin.x, stop.origin.z), g: true });
      let dest;
      if (doors.length) dest = doors[Math.floor(Math.random() * doors.length)].map((q) => ({ ...q }));
      else dest = [{ ...stop.town, x: stop.town.x + (Math.random() - 0.5) * 6, z: stop.town.z + (Math.random() - 0.5) * 6 }];
      const pts = [...door.map((p) => ({ ...p })), ...via, ...dest];
      this.walker(loc, pts, { delay: i * 1.1, owner: v });
    }
    // the queue boards after the last one is off the ramp
    const back = [...door].reverse().map((p) => ({ ...p }));
    stop.queue.forEach((wk, i) => {
      if (wk.done) return;
      const here = { x: wk.fig.root.position.x, y: wk.fig.root.position.y, z: wk.fig.root.position.z, g: true };
      const via = exit ? [{ ...exit, y: this.groundY(loc, exit.x, exit.z), g: true }, exit] : [];
      wk.pts = [here, ...via, ...back];
      wk.seg = 0; wk.t = 0; wk.idle = false; wk.hold = false;
      wk.delay = Math.max(wk.delay, 0) + nOff * 1.1 + 1.5 + i * 1.2;
      wk.board = true; wk.owner = v; v.boarding++;
    });
    stop.queue = [];
    stop.queued = false;
  }

  updateWalkers(dt) {
    if (dt <= 0) return;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const wk = this.walkers[i];
      if (wk.done) { this.walkers.splice(i, 1); continue; }
      const loc = wk.loc;
      if (!loc.active || loc.camDist > PAX_RANGE + 250) {
        if (wk.stop) { wk.stop.queue = wk.stop.queue.filter((q) => q !== wk); wk.stop.queued = false; }
        this.release(wk); this.walkers.splice(i, 1); continue;
      }
      const f = wk.fig, p = f.root.position;
      if (wk.idle || wk.delay > 0) {
        wk.delay -= dt;
        f.legL.rotation.x = f.legR.rotation.x = 0;
        continue;
      }
      const a = wk.pts[wk.seg], b = wk.pts[wk.seg + 1];
      if (!b) {
        // queueing passengers wait at the shelter; everyone else has gone indoors
        if (wk.hold) { wk.hold = false; wk.idle = true; wk.pts = [a]; wk.seg = 0; continue; }
        this.release(wk); this.walkers.splice(i, 1); continue;
      }
      const len = Math.hypot(b.x - a.x, b.z - a.z, (b.y - a.y) * 0.3) || 0.01;
      wk.t += (wk.speed * dt) / len;
      if (wk.t >= 1) { wk.seg++; wk.t = 0; continue; }
      p.x = a.x + (b.x - a.x) * wk.t;
      p.z = a.z + (b.z - a.z) * wk.t;
      p.y = a.g && b.g ? this.groundY(loc, p.x, p.z) : a.y + (b.y - a.y) * wk.t;
      if (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 0.05) f.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      f.phase += dt * 7;
      f.legL.rotation.x = Math.sin(f.phase) * 0.6;
      f.legR.rotation.x = -Math.sin(f.phase) * 0.6;
      p.y += Math.abs(Math.sin(f.phase)) * 0.12;
    }
  }

  // ================= damage: land-trains and buggies can be wrecked =================

  hook() {
    const g = globalThis.game;
    if (this.g || !g) return;
    this.g = g;
    g.blastHooks = g.blastHooks || [];
    g.blastHooks.push((pos, radius, damage, owner) => this.blast(pos, radius, damage, owner));
  }

  centre(v, out) { return out.copy(v.pos).addScaledVector(_u.copy(v.pos).normalize(), v.kind === 'buggy' ? 1.8 : 2.6); }

  blast(pos, radius, damage, owner) {
    if (owner !== 'player') return;
    for (const v of this.roadVehicles) {
      if (!v.maxHp || v.hp <= 0 || v.state === 'dead' || !v.root.visible) continue;
      let d = this.centre(v, _a).distanceTo(pos) - v.hitR;
      if (v.trailers) for (const t of v.trailers) d = Math.min(d, _a.copy(t.plat.pos).addScaledVector(_u.copy(t.plat.pos).normalize(), 2.6).distanceTo(pos) - 4.6);
      if (d > radius) continue;
      this.damage(v, damage * Math.max(0.3, 1 - Math.max(0, d) / radius));
    }
  }

  damage(v, amount) {
    v.hp -= amount;
    v.hurt = 0.2;
    if (v.hp <= 0) this.wreck(v);
  }

  // Burnt look: swap every surface (not the ink hulls) to one charred material, and back.
  char(v, on) {
    const mat = toon(0x2b2530);
    for (const r of [v.root, ...(v.trailers || []).map((t) => t.root)]) {
      r.traverse((o) => {
        if (!o.isMesh || o.userData.isInk) return;
        if (on) { if (!o.userData.mat0) o.userData.mat0 = o.material; o.material = mat; }
        else if (o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; }
      });
    }
  }

  wreck(v) {
    const g = this.g;
    v.hp = 0;
    v.state = 'wreck';
    v.cur = 0;
    v.wreckT = 45;
    v.roll = (this.r() - 0.5) * 0.35;
    for (const wk of this.walkers) if (wk.owner === v && !wk.done) this.release(wk);
    this.char(v, true);
    if (v.beacon) v.beacon.visible = false;
    if (!g) return;
    const c = this.centre(v, new THREE.Vector3()), up = c.clone().normalize();
    g.fx.explosion(c, v.kind === 'buggy' ? 7 : 11, true);
    if (v.trailers) for (const t of v.trailers) g.fx.explosion(t.plat.pos.clone().addScaledVector(up, 2.5), 6, false);
    if (g.audio) g.audio.boom(true);
    g.fx.pop('WRECKED!', c.clone().addScaledVector(up, 4), { color: '#ff4f2e', size: 60, life: 1.2 });
    if (g.alchemy) {
      // thrown clear of the wreck, one to each side, so they're easy to spot and skate over
      const sideV = _d.crossVectors(v.fwd, up).normalize();
      g.alchemy.dropLoot('engine', v.pos.clone().addScaledVector(sideV, v.kind === 'buggy' ? 4 : 6));
      g.alchemy.dropLoot(null, v.pos.clone().addScaledVector(sideV, v.kind === 'buggy' ? -4 : -6), { credits: v.credits || 25 });
    }
    // the town whose road it was isn't happy about it
    const pc = v.piece;
    let town = pc.kind === 'e' ? (pc.fromLoc.dir.distanceTo(up) < pc.toLoc.dir.distanceTo(up) ? pc.fromLoc : pc.toLoc) : pc.town;
    if (town && town.faction && g.rep) g.rep.add(town.faction, -3, 'Wrecked civilian traffic');
  }

  // Back on the road later, somewhere the camera can't see it appear.
  respawn(v, camPos) {
    const lanes = this.roads.flatMap((r) => r.lanes).filter((pc) => pc.len > 300);
    const h = { i: 0, f: 0 };
    for (let tries = 0; tries < 8 && lanes.length; tries++) {
      const pc = lanes[Math.floor(this.r() * lanes.length)];
      const s = 60 + this.r() * (pc.len - 120);
      h.i = 0;
      if (sample(pc.path, s, _a, h).distanceTo(camPos) < 1700) continue;
      if (pc.vehicles.some((o) => Math.abs(o.s - s) < 90)) continue;
      v.hist = [];
      this.move(v, pc);
      v.s = s;
      v.state = 'drive'; v.cur = 0; v.hp = v.maxHp; v.roll = 0; v.boarding = 0;
      this.char(v, false);
      this.plan(v, pc.toLoc);
      return;
    }
    v.respawnT = 20;
  }

  smoke(v, dt) {
    const g = this.g;
    if (!g || !(v.state === 'wreck' || v.hp < v.maxHp * 0.6)) return;
    if (v.pos.distanceToSquared(this.cam) > 500 * 500) return;
    v.smokeT -= dt;
    if (v.smokeT > 0) return;
    const wrecked = v.state === 'wreck';
    v.smokeT = wrecked ? 0.12 : v.hp < v.maxHp * 0.3 ? 0.15 : 0.3;
    const c = this.centre(v, _a), up = _u.copy(c).normalize();
    c.addScaledVector(up, v.kind === 'buggy' ? 1.5 : 2.5);
    g.fx.spawn(c, up.clone().multiplyScalar(2.5), { color: 0x3a3550, size: wrecked ? 1.3 : 0.9, life: 2.2, gravity: -0.2, drag: 0.3, count: 1, spread: 0.8 });
    if (wrecked ? v.wreckT > 25 : v.hp < v.maxHp * 0.3) g.fx.spawn(c, up.clone().multiplyScalar(3), { color: this.r() < 0.5 ? 0xff4f2e : 0xffd23f, size: 0.5, life: 0.5, gravity: -0.5, count: 1, spread: 1.2 });
  }

  // ================= per frame =================

  update(dt, camPos) {
    this.cam = camPos;
    this.hook();
    this.t = (this.t || 0) + dt;
    for (const v of this.vehicles) {
      v.prevPos.copy(v.pos);
      if (v.captured > 0) { v.root.visible = false; if (v.col) { this.C.remove(v.col); v.col = null; } v.vel.set(0, 0, 0); continue; }
      if (v.piece) this.updateRoadVehicle(v, dt, camPos);
      else this.updateFlyer(v, dt, camPos);
    }
    for (const c of this.crawlers) {
      if (!c.piece) continue;
      c.prevPos.copy(c.pos);
      this.updateRoadVehicle(c, dt, camPos);
    }
    this.updateWalkers(dt);
  }

  updateFlyer(v, dt, camPos) {
    const path = v.path, L = path.len;
    const gearK = (k) => {
      v.gearK = k;
      const y = v.legHi + (v.legLo - v.legHi) * k;
      for (const g of v.legs) g.position.y = y;
    };
    if (v.state === 'park') {
      v.timer += dt;
      const dur = 2.4;
      if (!v.closing) {
        v.open = clamp01((v.timer - 1.2) / dur);
        if (v.open >= 1 && !v.exchanged) { v.exchanged = true; this.exchange(v, v.stop); }
        if (v.exchanged && ((v.timer > v.minWait && v.boarding <= 0) || v.timer > v.maxWait)) { v.closing = true; v.closeAt = v.timer; }
      } else {
        v.open = 1 - clamp01((v.timer - v.closeAt) / dur);
        if (v.boarding > 0) for (const wk of this.walkers) if (wk.owner === v && wk.board) this.release(wk);
        if (v.timer > v.closeAt + dur + 0.8) {
          v.state = 'fly'; v.dir = v.s <= 0 ? 1 : -1; v.timer = 0; v.exchanged = false; v.closing = false; v.open = 0; v.stop = null;
        }
      }
      v.vel.set(0, 0, 0);
    } else {
      const dS = v.dir > 0 ? v.s : L - v.s, dE = v.dir > 0 ? L - v.s : v.s;
      const d = Math.min(dS, dE);
      const sp = Math.min(v.vmax, 1.2 + Math.min(0.3 * d, Math.sqrt(2 * v.acc * d)));
      v.s += sp * dt * v.dir;
      const dest = v.dir > 0 ? v.stops[1] : v.stops[0];
      if (dE < (v.kind === 'ship' ? 600 : 250)) this.queueBoarders(dest, v);
      if (v.s >= L || v.s <= 0) {
        v.s = v.s >= L ? L : 0;
        v.state = 'park'; v.timer = 0; v.stop = dest;
      }
      sample(path, v.s, v.pos, v.hint);
      if (dt > 0) v.vel.copy(v.pos).sub(v.prevPos).divideScalar(dt);
      gearK(v.kind === 'ship' ? clamp01((70 - d) / 40) : clamp01((30 - d) / 18));
      // heading follows the route a little ahead; never swing round while still low over the pad
      if (dS > v.turnMin) {
        sample(path, v.s + v.dir * 30, _a, v.ahint);
        _a.sub(v.pos);
        const up = _u.copy(v.pos).normalize();
        _a.addScaledVector(up, -_a.dot(up));
        if (_a.lengthSq() > 9) v.heading.copy(_a).normalize();
      }
    }
    if (v.state === 'park') {
      sample(path, v.s, v.pos, v.hint);
      if (v.gearK < 1) gearK(1);
    }
    const vis = v.pos.distanceTo(camPos) < v.view;
    v.root.visible = vis;
    if (!vis) { if (v.col) { this.C.remove(v.col); v.col = null; } return; }
    v.root.position.copy(v.pos);
    const up = _u.copy(v.pos).normalize();
    frameQuat(up, v.heading, _q);
    v.root.quaternion.rotateTowards(_q, v.turn * dt);
    v.fwd.set(0, 0, 1).applyQuaternion(v.root.quaternion);
    v.ramp.rotation.x = -v.rampAng * v.open;
    v.hatch.visible = v.open > 0.02;
    this.syncDeck(v, camPos);
  }

  hide(v) {
    v.root.visible = false;
    if (v.col) { this.C.remove(v.col); v.col = null; }
    if (v.trailers) for (const t of v.trailers) { t.root.visible = false; if (t.plat.col) { this.C.remove(t.plat.col); t.plat.col = null; } }
  }

  updateRoadVehicle(v, dt, camPos) {
    if (v.state === 'dead') {
      v.respawnT -= dt;
      if (v.respawnT <= 0) this.respawn(v, camPos);
      if (v.state === 'dead') { v.vel.set(0, 0, 0); return; }
    }
    let pc = v.piece;
    let limit = v.vmax, over = 0;
    if (v.state === 'wreck') {
      v.cur = 0;
      v.wreckT -= dt;
      if (v.wreckT <= 0) {
        // burnt out: gone (rubble cleared), back on the road in a few minutes
        if (this.g && v.root.visible && v.pos.distanceTo(camPos) < 400) this.g.fx.explosion(this.centre(v, new THREE.Vector3()), 4, false);
        this.hide(v);
        this.move(v, null);
        v.piece = pc; // remembered for the respawn bookkeeping, but no longer on the lane
        v.state = 'dead';
        v.respawnT = 180 + this.r() * 120;
        v.vel.set(0, 0, 0);
        return;
      }
    } else if (v.state === 'stop') {
      v.timer -= dt;
      v.cur = 0;
      if (!v.exchanged && v.timer < v.waitT - 1.5) {
        v.exchanged = true;
        if (v.pax) this.exchange(v, pc.stop);
      }
      // hold the doors (up to 14 s extra) while the last passengers are still walking up
      if (v.timer <= 0 && (!v.boarding || v.timer < -14)) {
        v.state = 'drive';
        for (const wk of this.walkers) if (wk.owner === v && wk.board) this.release(wk);
        this.plan(v);
      }
    } else {
      limit = Math.min(limit, pc.vlim);
      const nx = v.plan[0];
      if (nx && nx.vlim < limit) limit = Math.min(limit, nx.vlim + Math.sqrt(2 * 1.5 * Math.max(0, pc.len - v.s - v.front)));
      // whoever is ahead on this piece or the next (land-trains and buggies queue; hover-cars hop over)
      const scan = (list, base) => {
        for (const o of list) {
          if (o === v || o.captured > 0) continue;
          const gap = base + o.s - v.s;
          if (v.kind === 'car') {
            if (gap > -(o.front + v.tail + 3) && gap < o.tail + v.front + 12) over = Math.max(over, o.kind === 'landtrain' ? 6.5 : o.kind === 'car' ? 2.6 : 4.5);
            continue;
          }
          if (gap <= 0) continue;
          limit = Math.min(limit, Math.max(0, (gap - o.tail - v.front - 5) * 0.6));
        }
      };
      scan(pc.vehicles, 0);
      if (nx) scan(nx.vehicles, pc.len);
      // pull in at the destination's shelter
      // pull in at the destination's ring stop (it may be a few pieces ahead yet)
      const fin = v.plan.length ? v.plan[v.plan.length - 1] : pc, st = fin.stop;
      if (st && st.loc === v.dest && v.plan.length <= 4) {
        let toStop = st.s - v.s;
        if (fin !== pc) { toStop = pc.len - v.s + st.s; for (let i = 0; i < v.plan.length - 1; i++) toStop += v.plan[i].len; }
        if (toStop > -2) {
          limit = Math.min(limit, 0.6 + Math.sqrt(2 * 1.2 * Math.max(0, toStop - 0.3)));
          if (v.pax && toStop < 300) this.queueBoarders(st, v);
          if (fin === pc && toStop < 0.5) { v.state = 'stop'; v.timer = v.waitT; v.cur = 0; v.exchanged = false; }
        }
      }
      if (v.state === 'drive') {
        v.cur = Math.min(limit, v.cur + v.acc * dt);
        v.s += v.cur * dt;
        while (v.s > v.piece.len) {
          let next = v.plan.shift();
          if (!next) { this.plan(v); next = v.plan.shift() || v.piece.next[v.piece.next.length - 1]; }
          v.s -= v.piece.len;
          v.hist.unshift(v.piece);
          if (v.hist.length > 6) v.hist.length = 6;
          this.move(v, next);
        }
        pc = v.piece;
      }
    }
    // place it: chord between the two axles, normals smoothed along the road
    const up = this.roadFrame(v, v.s, v.front * 0.7, Math.max(2, v.front * 0.7), v.hintF, v.hintR, v.pos, _f);
    if (v.kind === 'car') {
      v.hover += ((over || 0) - v.hover) * Math.min(1, dt * 2.5);
      v.pos.addScaledVector(up, v.hoverH + v.hover + Math.sin(this.t * 2 + v.s) * 0.12);
    }
    if (dt > 0) v.vel.copy(v.pos).sub(v.prevPos).divideScalar(dt);
    if (v.vel.lengthSq() > 3600 || v.state === 'wreck') v.vel.set(0, 0, 0);
    v.fwd.copy(_f);
    const vis = v.pos.distanceToSquared(camPos) < v.view * v.view;
    v.root.visible = vis;
    if (v.trailers) for (const t of v.trailers) t.root.visible = vis;
    if (!vis) { this.hide(v); return; }
    v.root.position.copy(v.pos);
    frameQuat(up, _f, v.root.quaternion);
    if (v.roll) { v.root.quaternion.multiply(_q.setFromAxisAngle(_z, v.roll)); v.root.position.addScaledVector(up, -0.4); }
    if (v.wheels) {
      const spin = (v.cur * dt) / (v.wheelR || 1);
      for (const w of v.wheels) w.rotation.x += spin;
    }
    if (v.beacon && v.state !== 'wreck') v.beacon.visible = Math.sin(this.t * 6) > -0.2;
    if (v.trailers) {
      v.trailers.forEach((t, i) => {
        const p = t.plat;
        p.prevPos.copy(p.pos);
        const tu = this.roadFrame(v, v.s - t.offset, 2.7, 2.7, t.hintF, t.hintR, p.pos, _d);
        t.root.position.copy(p.pos);
        frameQuat(tu, _d, t.root.quaternion);
        if (v.roll) t.root.quaternion.multiply(_q.setFromAxisAngle(_z, v.roll * (i % 2 ? -0.7 : 0.8)));
        if (dt > 0) p.vel.copy(p.pos).sub(p.prevPos).divideScalar(dt);
        if (p.vel.lengthSq() > 3600 || v.state === 'wreck') p.vel.set(0, 0, 0);
        for (const w of t.wheels) w.rotation.x += (v.cur * dt) / 1.0;
        this.syncDeck(p, camPos);
      });
    }
    if (v.deck) this.syncDeck(v, camPos);
    if (v.maxHp) this.smoke(v, dt);
  }

  // Position at arc length s along the vehicle's route: back through the pieces it just left
  // (trailers), or on into the next one (front axle).
  at(v, s, out, h, nOut) {
    let p = v.piece;
    if (s < 0) {
      for (const q of v.hist) { p = q; s += q.len; if (s >= 0) break; }
      if (s < 0) s = 0;
    } else if (s > p.len && v.plan[0]) { s -= p.len; p = v.plan[0]; }
    if (h.p !== p) { h.p = p; h.i = s > p.len * 0.5 ? p.path.pts.length - 2 : 0; }
    sample(p.path, s, out, h);
    return nOut.copy(p.normals[h.i]).lerp(p.normals[h.i + 1], h.f);
  }

  // Ground point midway between front and rear axle, travel direction and smoothed up.
  roadFrame(v, s, front, rear, hF, hR, outPos, outFwd) {
    const nf = this.at(v, s + front, _b, hF, _n);
    const nr = this.at(v, s - rear, _c, hR, _u);
    outPos.copy(_b).add(_c).multiplyScalar(0.5);
    outFwd.copy(_b).sub(_c);
    if (outFwd.lengthSq() < 1e-6) outFwd.set(1, 0, 0);
    return nf.add(nr).normalize();
  }

  // Keep a vehicle's deck collider in the spatial hash while it is near the camera.
  syncDeck(s, camPos) {
    const near = s.pos.distanceToSquared(camPos) < 350 * 350;
    if (s.col) { this.C.remove(s.col); if (!near) { s.col = null; return; } }
    if (!near || s.pos.lengthSq() < 1) return;
    const q = s.quat;
    const c = s.col || { type: 'box', platform: s, c: new THREE.Vector3(), ax: new THREE.Vector3(), ay: new THREE.Vector3(), az: new THREE.Vector3() };
    c.ax.set(1, 0, 0).applyQuaternion(q); c.ay.set(0, 1, 0).applyQuaternion(q); c.az.set(0, 0, 1).applyQuaternion(q);
    c.c.copy(s.pos).addScaledVector(c.ay, s.deckY || 0);
    c.hx = s.deck[0]; c.hy = s.deck[1]; c.hz = s.deck[2];
    s.col = this.C.add(c);
  }
}
