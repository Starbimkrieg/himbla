import * as THREE from 'three';
import { toon, ink, glow, textSprite } from './toon.js';
import { makeFigure, makeShuttle, makeRover, makeHoverCar, makeFreighter } from './models.js';
import { mulberry32 } from './rng.js';
import { SUN, frameQuat, arcDist } from './geo.js';

// Ambient traffic: freighters and shuttle-buses that land on real pads at the edge of each
// settlement (passengers walk off, others board), plus dirt roads between neighbouring safe
// outposts with land-trains, hover-cars and buggies driving them.
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
const PAX_RANGE = 500; // passengers only exist near the camera

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
    vertexShader: `uniform vec3 sunDir; varying vec2 vUv; varying float vLit; varying float vFade;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 toCam = cameraPosition - wp.xyz; float dist = length(toCam);
        // pull toward the eye (screen position unchanged) so coarse terrain LODs never swallow the track
        wp.xyz += toCam / max(dist, 1e-3) * min(dist * 0.5, 0.25 + dist * 0.012);
        vLit = smoothstep(-0.12, 0.3, dot(normalize(wp.xyz), sunDir));
        vFade = 1.0 - smoothstep(2300.0, 2900.0, dist);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `varying vec2 vUv; varying float vLit; varying float vFade;
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
        gl_FragColor = vec4(col, a * vFade);
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
  keepouts(loc) {
    const k = [...(loc.pads || []), ...(loc.keep || []), ...loc.stopKeep];
    const spots = [];
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

  // ================= roads =================

  buildRoads() {
    const safe = this.w.locations.filter((l) => l.safe && !l.restricted && !l.poi && l.type !== 'pirate');
    const pairs = new Set();
    const key = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
    for (const a of safe) {
      let best = null, bd = Infinity;
      for (const b of safe) {
        if (a === b) continue;
        const d = arcDist(a.dir, b.dir);
        if (d < SAFE_ROAD) pairs.add(key(a, b));
        if (d < bd) { bd = d; best = b; }
      }
      if (best && bd < 3000) pairs.add(key(a, best));
    }
    this.roadGeo = { pos: [], uv: [], idx: [] };
    this.posts = [];
    const sorted = [...pairs].sort();
    for (const k of sorted) {
      const [a, b] = k.split('|');
      this.buildRoad(this.L[a], this.L[b]);
    }
    const G = this.roadGeo;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
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
    for (const road of this.roads) this.populateRoad(road);
  }

  // A road end: open ground just past the settlement's edge, facing the other end.
  roadEnd(loc, other) {
    const tw = this.toward(loc, other);
    const keeps = this.keepouts(loc);
    for (const dev of [0, 0.12, -0.12, 0.25, -0.25, 0.4, -0.4, 0.6, -0.6, 0.85, -0.85, 1.1, -1.1]) {
      const a = tw + dev;
      for (const rr of [loc.r + 26, loc.r + 36, loc.r + 48]) {
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const cx = Math.cos(a) * (rr - 9), cz = Math.sin(a) * (rr - 9);
        if (keeps.some((k) => Math.hypot(cx - k.x, cz - k.z) < 16 + k.r)) continue;
        if (!this.clearDisc(loc, cx, cz, 15, [1.5, 4.5], this.groundY(loc, cx, cz))) continue;
        loc.stopKeep.push({ x: cx, z: cz, r: 16 }, { x, z, r: 8 });
        return { loc, a, x, z, rr };
      }
    }
    const x = Math.cos(tw) * (loc.r + 40), z = Math.sin(tw) * (loc.r + 40);
    return { loc, a: tw, x, z, rr: loc.r + 40 };
  }

  buildRoad(A, B) {
    const P = this.P, R = P.R;
    const eA = this.roadEnd(A, B), eB = this.roadEnd(B, A);
    const dirAt = (e, extra) => this.w.toWorld(e.loc, Math.cos(e.a) * (e.rr + extra), 0, Math.sin(e.a) * (e.rr + extra)).normalize();
    const dA = dirAt(eA, 0), dA2 = dirAt(eA, 45), dB = dirAt(eB, 0), dB2 = dirAt(eB, 45);
    // control points: leave each settlement radially, then a gently meandering great circle
    const len = arcDist(dA2, dB2);
    const n = Math.max(3, Math.ceil(len / 30));
    const rr = mulberry32(Math.floor(len * 7) + A.id.length * 131 + B.id.length * 17);
    const ph1 = rr() * 6.28, ph2 = rr() * 6.28, f1 = Math.max(1, Math.round(len / 900)), f2 = Math.max(2, Math.round(len / 330));
    const axis = new THREE.Vector3().crossVectors(dA2, dB2).normalize();
    const ctrl = [dA, dA2];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const d = new THREE.Vector3().lerpVectors(dA2, dB2, t).normalize();
      const env = smooth(t * len / 150) * smooth((1 - t) * len / 150);
      const off = env * (40 * Math.sin(Math.PI * 2 * f1 * t + ph1) + 12 * Math.sin(Math.PI * 2 * f2 * t + ph2));
      d.addScaledVector(axis, off / R).normalize();
      ctrl.push(d);
    }
    ctrl.push(dB2, dB);
    // keep clear of every other settlement, military zone and black lake
    const obs = [];
    for (const l of this.w.locations) {
      const r0 = l === A || l === B ? l.r + 12 : (l.zoneR || l.r) + 55;
      obs.push({ d: l.dir, r: r0 });
    }
    for (const lk of this.w.lakes || []) obs.push({ d: lk.d, r: Math.acos(Math.min(1, lk.cos)) * R + 25 });
    for (let it = 0; it < 60; it++) {
      for (let i = 2; i < ctrl.length - 2; i++) {
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
      for (let i = 2; i < ctrl.length - 2; i++) {
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
    const side = [], tan = [];
    for (let i = 0; i <= N; i++) {
      const t = new THREE.Vector3().subVectors(g[Math.min(N, i + 1)], g[Math.max(0, i - 1)]);
      t.addScaledVector(dirs[i], -t.dot(dirs[i])).normalize();
      tan.push(t);
      side.push(new THREE.Vector3().crossVectors(t, dirs[i]).normalize()); // right-hand side going A→B
    }
    const cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + g[i].distanceTo(g[i - 1]));
    // ---- the visible track: a strip of 5 ground-hugging samples across 10 m ----
    const G = this.roadGeo;
    const lat = [-5, -2.5, 0, 2.5, 5];
    const strip = (centre, sideV, s, vScale = 1) => {
      for (const o of lat) {
        _b.copy(centre).addScaledVector(sideV, o * vScale);
        P.ground(_b, _b, 0.04);
        G.pos.push(_b.x, _b.y, _b.z);
        G.uv.push(o / 5, s);
      }
    };
    const pushIdx = (base, rows) => {
      for (let i = 0; i < rows - 1; i++) {
        for (let k = 0; k < lat.length - 1; k++) {
          const a = base + i * lat.length + k, b = a + lat.length;
          G.idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    };
    let base = G.pos.length / 3;
    for (let i = 0; i <= N; i++) strip(g[i], side[i], cum[i]);
    pushIdx(base, N + 1);
    // turnaround loops at both ends (a worn ring you can see from the air)
    const loopAt = (E, out, rightV) => {
      const C = E.clone().addScaledVector(out, 9);
      P.ground(C, C);
      const up = C.clone().normalize();
      const ex = rightV.clone().addScaledVector(up, -rightV.dot(up)).normalize();
      const ez = new THREE.Vector3().crossVectors(up, ex).multiplyScalar(-1);
      if (ez.dot(out) < 0) ez.negate();
      const b0 = G.pos.length / 3, M = 36;
      for (let i = 0; i <= M; i++) {
        const th = (i / M) * Math.PI * 2;
        const rp = _c.copy(C).addScaledVector(ex, Math.cos(th) * 9).addScaledVector(ez, Math.sin(th) * 9);
        const sv = _d.copy(ex).multiplyScalar(Math.cos(th)).addScaledVector(ez, Math.sin(th));
        strip(rp, sv, th * 9, 0.8);
      }
      pushIdx(b0, M + 1);
      return { C, ex, ez };
    };
    const outB = tan[N].clone(), outA = tan[0].clone().negate();
    const loopB = loopAt(g[N], outB, side[N]);
    const loopA = loopAt(g[0], outA, side[0].clone().negate());
    // marker posts every ~110 m, alternating sides
    for (let s = 60, k = 0; s < cum[N] - 60; s += 110, k++) {
      let i = 0;
      while (i < N && cum[i] < s) i++;
      const p = g[i].clone().addScaledVector(side[i], k % 2 ? 6.5 : -6.5);
      P.ground(p, p);
      this.posts.push({ pos: p, q: frameQuat(dirs[i], tan[i], new THREE.Quaternion()) });
    }
    // ---- the driving circuit: right lane A→B, loop at B, right lane back, loop at A ----
    const lane = 2.4;
    const circ = [];
    for (let i = 0; i <= N; i++) circ.push(g[i].clone().addScaledVector(side[i], lane));
    const stopIdx = [];
    const loopPts = (L) => {
      // from the arrival lane round the far side of the ring to the departure lane
      for (let i = 0; i <= 14; i++) {
        const th = -0.55 + (i / 14) * (Math.PI + 1.1);
        circ.push(L.C.clone().addScaledVector(L.ex, Math.cos(th) * 9).addScaledVector(L.ez, Math.sin(th) * 9));
      }
    };
    stopIdx.push(circ.length - 3); // stop B: just before the loop
    loopPts(loopB);
    for (let i = N; i >= 0; i--) circ.push(g[i].clone().addScaledVector(side[i], -lane));
    stopIdx.push(circ.length - 3); // stop A
    loopPts(loopA);
    // smooth the joins, then drop everything back on the ground
    let pts = circ;
    for (let pass = 0; pass < 4; pass++) {
      const nx = pts.map((p, i) => {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
        return p.clone().multiplyScalar(0.5).addScaledVector(a, 0.25).addScaledVector(b, 0.25);
      });
      pts = nx;
    }
    const nor = [];
    for (const p of pts) { const nn = new THREE.Vector3(); P.ground(p, p); P.surface(p, nn); nor.push(nn); }
    // smoothed terrain normals, leaned toward radial up so vehicles don't jitter on every facet
    const sn = nor.map((_, i) => {
      const s = new THREE.Vector3();
      for (let k = -3; k <= 3; k++) s.add(nor[(i + k + nor.length) % nor.length]);
      return s.normalize().lerp(pts[i].clone().normalize(), 0.3).normalize();
    });
    const path = makePath(pts, true);
    const normals = [...sn, sn[0]];
    const road = { A, B, eA, eB, path, normals, stops: [], vehicles: [], len: cum[N] };
    // stops (shelter + sign beside each arrival lane)
    const mkStop = (e, ci, other) => {
      const loc = e.loc;
      const p = pts[ci];
      const sL = this.local(loc, p, new THREE.Vector3());
      const ax = Math.cos(e.a), az = Math.sin(e.a);
      // lane direction in local frame at the stop, and its right-hand side
      const q = this.local(loc, pts[(ci + 2) % pts.length], new THREE.Vector3()).sub(sL);
      const fx = q.x / (Math.hypot(q.x, q.z) || 1), fz = q.z / (Math.hypot(q.x, q.z) || 1);
      const rx = -fz, rz = fx; // right of travel (local y up: right = fwd × up)
      const sx = sL.x + rx * 6.5, sz = sL.z + rz * 6.5;
      const yaw = Math.atan2(sL.x - sx, sL.z - sz);
      const km = (cum[N] / 1000).toFixed(1);
      this.shelter(loc, sx, sz, yaw, `< ${other.short} ${km} km`, 0xff9f1c);
      const stop = {
        loc, kind: 'road', ci, s: path.cum[ci], world: p.clone(),
        wait: { x: sx + Math.sin(yaw) * 1.8, y: this.groundY(loc, sx, sz), z: sz + Math.cos(yaw) * 1.8, g: true },
        town: this.townPoint(loc, sx - ax * 4, sz - az * 4, 80),
        queue: [], queued: false,
      };
      this.stops.push(stop);
      return stop;
    };
    road.stops.push(mkStop(eB, stopIdx[0], A), mkStop(eA, stopIdx[1], B));
    this.roads.push(road);
  }

  // Put a land-train, two hover-cars and a buggy on each road.
  populateRoad(road) {
    const L = road.path.len;
    const k = this.roads.indexOf(road);
    const add = (v, s) => {
      Object.assign(v, {
        road, s, hint: { i: 0, f: 0 }, cur: 0, state: 'drive', timer: 0, next: 0,
        pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(),
        hintF: { i: 0, f: 0 }, hintR: { i: 0, f: 0 }, hover: 0,
      });
      // next stop ahead of s
      const ds = road.stops.map((st) => (st.s - s + L) % L);
      v.next = ds[0] < ds[1] ? 0 : 1;
      road.vehicles.push(v);
      return v;
    };
    // land-train
    const cars = k % 2 ? ['pax', 'cargo', 'cargo'] : ['pax', 'pax', 'cargo'];
    const lt = makeLandTrain({ color: [0xff9f1c, 0x2ec4ff, 0x7dff6a, 0xffd23f, 0xff7ad9][k % 5], cars });
    this.w.scene.add(lt.root);
    for (const t of lt.trailers) this.w.scene.add(t.root);
    const train = add({
      ...lt, kind: 'landtrain', vmax: 11, acc: 1.4, front: 4.6, tail: 4.4 + lt.trailers.length * 9.9, stopsAt: true, waitT: 16,
      deck: [1.95, 2.45, 4.3], deckY: 2.45, col: null, quat: lt.root.quaternion, view: 1200, radius: 6, boarding: 0, wheelR: 1.2, dist: 0,
      pax: [1, 3], door: null,
    }, L * this.r());
    train.trailers.forEach((t, i) => {
      t.offset = 4.3 + 1.6 + 4.0 + i * 9.9;
      t.hintF = { i: 0, f: 0 }; t.hintR = { i: 0, f: 0 };
      t.plat = { pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), deck: [1.9, 2.4, 4.2], deckY: 2.4, quat: t.root.quaternion, col: null };
      this.platforms.push(t.plat);
    });
    this.vehicles.push(train);
    // hover-cars: hop over slower traffic instead of queueing
    for (let i = 0; i < 2; i++) {
      const m = makeHoverCar({ color: [0xff7ad9, 0x2ec4ff, 0x7dff6a, 0xffd23f][(k + i) % 4] });
      m.root.matrixAutoUpdate = true;
      this.w.scene.add(m.root);
      const v = add({ ...m, kind: 'car', vmax: 17 + this.r() * 6, acc: 4, front: 2, tail: 2, stopsAt: false, deck: [1.3, 1.1, 2.7], deckY: 0, col: null, quat: m.root.quaternion, view: 800, radius: 2.5, hoverH: 1.7 }, L * this.r());
      this.vehicles.push(v);
    }
    // buggy (old-style crawler): queues behind slower traffic
    const r = makeRover({ color: [0xffd23f, 0xff9f1c, 0x7dff6a][k % 3], trim: 0xfff4e0, pirate: false, flag: 0x2ec4ff });
    r.gun.visible = false;
    r.root.scale.setScalar(1.3);
    this.w.scene.add(r.root);
    const b = add({ ...r, kind: 'buggy', vmax: 12 + this.r() * 3, acc: 2.5, front: 3.4, tail: 3.4, stopsAt: false, view: 900, wheelR: 1.1, dist: 0 }, L * this.r());
    this.crawlers.push(b);
  }

  // ================= passengers =================

  figure() {
    let f = this.pool.find((p) => !p.busy);
    if (!f) {
      if (this.pool.length >= 28) return null;
      const pal = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff, 0xffffff, 0xff3b5c];
      const k = this.pool.length;
      f = makeFigure({ suit: pal[k % pal.length], helmet: k % 3 ? 0xfff4e0 : 0xffd23f, scale: k % 7 === 3 ? 0.62 : 1 });
      f.phase = Math.random() * 6;
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

  // Boarders turn up at the shelter while the vehicle is on its way in.
  queueBoarders(stop, v) {
    if (stop.queued || !this.stopNear(stop)) return;
    stop.queued = true;
    const n = v.pax[0] + Math.floor(Math.random() * (v.pax[1] - v.pax[0] + 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.6;
      const p = { x: stop.wait.x + Math.cos(a) * rr, y: stop.wait.y, z: stop.wait.z + Math.sin(a) * rr, g: true };
      const wk = this.walker(stop.loc, [p], { idle: true, stop });
      if (wk) { wk.fig.root.rotation.y = Math.random() * 6; stop.queue.push(wk); }
    }
  }

  // Doors open: some get off and head into town, the queue walks up the ramp.
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
    const foot = door[door.length - 1];
    // off the pad toward the shelter side, then into town
    let exit = null;
    if (stop.kind === 'pad') {
      const a = Math.atan2(stop.wait.z - stop.z, stop.wait.x - stop.x) + 0.5;
      exit = { x: stop.x + Math.cos(a) * (stop.padR + 1.5), y: stop.top, z: stop.z + Math.sin(a) * (stop.padR + 1.5), g: false };
    }
    const nOff = v.pax[0] + Math.floor(Math.random() * (v.pax[1] - v.pax[0] + 1));
    for (let i = 0; i < nOff; i++) {
      const town = { ...stop.town, x: stop.town.x + (Math.random() - 0.5) * 6, z: stop.town.z + (Math.random() - 0.5) * 6 };
      const via = exit ? [exit, { ...exit, y: this.groundY(loc, exit.x, exit.z), g: true }] : [{ ...stop.wait, x: stop.wait.x + (Math.random() - 0.5) * 3 }];
      const pts = [...door.map((p) => ({ ...p })), ...via, town];
      this.walker(loc, pts, { delay: i * 1.1, owner: v });
    }
    // the queue boards after the last one is off the ramp
    const back = [...door].reverse().map((p) => ({ ...p }));
    stop.queue.forEach((wk, i) => {
      if (wk.done) return;
      const here = { x: wk.fig.root.position.x, y: wk.fig.root.position.y, z: wk.fig.root.position.z, g: true };
      const via = exit ? [{ ...exit, y: this.groundY(loc, exit.x, exit.z), g: true }, exit] : [];
      wk.pts = [here, ...via, ...back];
      wk.seg = 0; wk.t = 0; wk.idle = false;
      wk.delay = nOff * 1.1 + 1.5 + i * 1.2;
      wk.board = true; wk.owner = v; v.boarding++;
    });
    stop.queue = [];
    stop.queued = false;
  }

  updateWalkers(dt) {
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

  // ================= per frame =================

  update(dt, camPos) {
    this.cam = camPos;
    for (const v of this.vehicles) {
      v.prevPos.copy(v.pos);
      if (v.captured > 0) { v.root.visible = false; if (v.col) { this.C.remove(v.col); v.col = null; } v.vel.set(0, 0, 0); continue; }
      if (v.road) this.updateRoadVehicle(v, dt, camPos);
      else this.updateFlyer(v, dt, camPos);
    }
    for (const c of this.crawlers) {
      if (!c.road) continue;
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
      v.vel.copy(v.pos).sub(v.prevPos).divideScalar(Math.max(dt, 1e-3));
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

  updateRoadVehicle(v, dt, camPos) {
    const road = v.road, path = road.path, L = path.len;
    // gap to whoever is ahead on the circuit (land-trains and buggies queue; hover-cars hop over)
    let limit = v.vmax, over = 0;
    for (const o of road.vehicles) {
      if (o === v || o.captured > 0) continue;
      const gap = ((o.s - v.s) % L + L) % L;
      if (v.kind === 'car') {
        // anything just ahead or alongside: climb over it
        const back = L - gap;
        if (gap < o.tail + v.front + 12 || back < o.front + v.tail + 3) over = Math.max(over, o.kind === 'landtrain' ? 6.5 : o.kind === 'car' ? 2.6 : 4.5);
        continue;
      }
      const free = gap - o.tail - v.front - 5;
      if (gap < L * 0.5) limit = Math.min(limit, Math.max(0, free * 0.6));
    }
    if (v.state === 'stop') {
      v.timer -= dt;
      v.cur = 0;
      // hold the doors (up to 14 s extra) while the last passengers are still walking up
      if (v.timer <= 0 && (v.boarding <= 0 || v.timer < -14)) {
        v.state = 'drive'; v.next = (v.next + 1) % road.stops.length; v.exchanged = false;
        for (const wk of this.walkers) if (wk.owner === v && wk.board) this.release(wk);
      }
    } else {
      const st = road.stops[v.next];
      const toStop = ((st.s - v.s) % L + L) % L;
      if (v.stopsAt) {
        limit = Math.min(limit, 0.6 + Math.sqrt(2 * 1.2 * Math.max(0, toStop - 0.3)));
        if (toStop < 60 && v.pax) this.queueBoarders(st, v);
      }
      if (toStop < 0.5 || toStop > L - 0.5) {
        if (v.stopsAt) { v.state = 'stop'; v.timer = v.waitT; v.cur = 0; }
        else v.next = (v.next + 1) % road.stops.length;
      }
      v.cur = Math.min(limit, v.cur + v.acc * dt);
      v.s = (v.s + v.cur * dt) % L;
    }
    if (v.state === 'stop' && !v.exchanged && v.timer < v.waitT - 1.5) {
      v.exchanged = true;
      if (v.pax) this.exchange(v, road.stops[v.next]);
    }
    // place it: chord between the two axles, normals smoothed along the road
    const up = this.roadFrame(road, v.s, v.front * 0.7, Math.max(2, v.front * 0.7), v.hintF, v.hintR, v.pos, _f);
    const hov = v.kind === 'car' ? v.hoverH : 0;
    if (v.kind === 'car') {
      v.hover += ((over || 0) - v.hover) * Math.min(1, dt * 2.5);
      v.pos.addScaledVector(up, hov + v.hover + Math.sin(performance.now() * 0.002 + v.s) * 0.12);
    }
    v.vel.copy(v.pos).sub(v.prevPos).divideScalar(Math.max(dt, 1e-3));
    if (v.vel.lengthSq() > 3600) v.vel.set(0, 0, 0);
    v.fwd.copy(_f);
    const vis = v.pos.distanceToSquared(camPos) < v.view * v.view;
    v.root.visible = vis;
    if (v.trailers) for (const t of v.trailers) t.root.visible = vis;
    if (!vis) {
      if (v.col) { this.C.remove(v.col); v.col = null; }
      if (v.trailers) for (const t of v.trailers) if (t.plat.col) { this.C.remove(t.plat.col); t.plat.col = null; }
      return;
    }
    v.root.position.copy(v.pos);
    frameQuat(up, _f, v.root.quaternion);
    if (v.wheels) {
      const spin = (v.cur * dt) / (v.wheelR || 1);
      for (const w of v.wheels) w.rotation.x += spin;
    }
    if (v.beacon) v.beacon.visible = Math.sin(performance.now() * 0.006) > -0.2;
    if (v.trailers) {
      for (const t of v.trailers) {
        const p = t.plat;
        p.prevPos.copy(p.pos);
        const tu = this.roadFrame(road, v.s - t.offset, 2.7, 2.7, t.hintF, t.hintR, p.pos, _d);
        t.root.position.copy(p.pos);
        frameQuat(tu, _d, t.root.quaternion);
        p.vel.copy(p.pos).sub(p.prevPos).divideScalar(Math.max(dt, 1e-3));
        if (p.vel.lengthSq() > 3600) p.vel.set(0, 0, 0);
        for (const w of t.wheels) w.rotation.x += (v.cur * dt) / 1.0;
        this.syncDeck(p, camPos);
      }
    }
    if (v.deck) this.syncDeck(v, camPos);
  }

  // Ground point midway between front and rear axle, travel direction and smoothed up.
  roadFrame(road, s, front, rear, hF, hR, outPos, outFwd) {
    const path = road.path, N = road.normals;
    const pf = sample(path, s + front, _b, hF);
    const nf = _n.copy(N[hF.i]).lerp(N[hF.i + 1], hF.f);
    const pr = sample(path, s - rear, _c, hR);
    const nr = _u.copy(N[hR.i]).lerp(N[hR.i + 1], hR.f);
    outPos.copy(pf).add(pr).multiplyScalar(0.5);
    outFwd.copy(pf).sub(pr);
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
