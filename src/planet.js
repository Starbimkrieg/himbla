import * as THREE from 'three';
import { PLANET } from './config.js';
import { mulberry32, createNoise3D, smoothstep, clamp } from './rng.js';
import { gradientMap } from './toon.js';
import { SUN, darkness } from './geo.js';

const N = PLANET.faceCells;
const CH = PLANET.chunkCells;
const CPF = N / CH;
const QP = Math.PI / 4;
const N1 = N + 1;
const R = PLANET.radius;
const MAX_LOD = 3;

// ---- cube-sphere mapping (tangent-warped for near-uniform cells) ----
export function faceDir(f, i, j, out) {
  const a = Math.tan((i / N * 2 - 1) * QP), b = Math.tan((j / N * 2 - 1) * QP);
  switch (f) {
    case 0: out.set(1, b, -a); break;
    case 1: out.set(-1, b, a); break;
    case 2: out.set(a, 1, -b); break;
    case 3: out.set(a, -1, b); break;
    case 4: out.set(a, b, 1); break;
    default: out.set(-a, b, -1);
  }
  return out.normalize();
}

// Writes face index and fractional grid coords into `o`.
function dirToGrid(x, y, z, o) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f, a, b;
  if (ax >= ay && ax >= az) {
    if (x > 0) { f = 0; a = -z / x; b = y / x; } else { f = 1; a = z / -x; b = y / -x; }
  } else if (ay >= az) {
    if (y > 0) { f = 2; a = x / y; b = -z / y; } else { f = 3; a = x / -y; b = z / -y; }
  } else if (z > 0) { f = 4; a = x / z; b = y / z; } else { f = 5; a = x / z; b = y / -z; }
  o.f = f;
  o.i = (Math.atan(a) / QP + 1) * 0.5 * N;
  o.j = (Math.atan(b) / QP + 1) * 0.5 * N;
  return o;
}

const _g = { f: 0, i: 0, j: 0 };
const _d = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
const _p00 = new THREE.Vector3(), _p10 = new THREE.Vector3(), _p01 = new THREE.Vector3(), _p11 = new THREE.Vector3();

// The Moon: a procedurally generated cube-sphere with craters, ridges and flattened
// settlement plateaus. Only chunks near the camera and above the horizon are built and
// drawn, at a level of detail that falls off with distance; physics samples the exact
// finest-level triangles so what you see up close is what you ski on.
export class Planet {
  constructor(scene, zones, seed = PLANET.seed) {
    this.scene = scene;
    this.R = R;
    const rand = mulberry32(seed);
    this.nA = createNoise3D(rand);
    this.nB = createNoise3D(rand);
    this.nC = createNoise3D(rand);
    this.zones = zones;
    for (const z of zones) {
      z.zr = R + this.base(z.dir.x * R, z.dir.y * R, z.dir.z * R, darkness(z.dir));
      z.cosFlat = Math.cos((z.r * 1.95) / R);
    }
    this.cache = new Map();
    this.attr = { floor: 0, rim: 0, ray: 0 };
    this.makeCraters(rand);
    this.initChunks();
    // one rectangular hole can be cut in the terrain (the Whispering Fissure's entrance ramp)
    this.holeU = {
      uHoleOn: { value: 0 }, uHoleO: { value: new THREE.Vector3() }, uHoleX: { value: new THREE.Vector3(1, 0, 0) },
      uHoleY: { value: new THREE.Vector3(0, 1, 0) }, uHoleZ: { value: new THREE.Vector3(0, 0, 1) },
      uHoleMin: { value: new THREE.Vector2() }, uHoleMax: { value: new THREE.Vector2() },
    };
    this.tunnel = null; // set by the secrets system: overrides the floor underground
    this.material = this.makeMaterial();
    this.boulderGeo = new THREE.DodecahedronGeometry(1, 0);
    this.boulderMat = new THREE.MeshToonMaterial({ color: 0x8d8898, gradientMap: gradientMap() });
    this.boulderInk = new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide });
    this.colliders = null;
    // dark backing sphere hides any sub-pixel cracks between LOD levels
    this.core = new THREE.Mesh(new THREE.SphereGeometry(R - 330, 96, 48), new THREE.MeshBasicMaterial({ color: 0x16121f }));
    scene.add(this.core);
    this.queue = [];
    this.stats = { built: 0, visible: 0 };
    this.lakes = []; // black lakes: { d, cos, level } — flat liquid surfaces in crater floors
    this.lastLake = null;
  }

  base(x, y, z, far) {
    const a = this.nA, b = this.nB;
    let h = a(x * 0.00045, y * 0.00045, z * 0.00045) * 110;
    h += a(x * 0.0013 + 7.1, y * 0.0013, z * 0.0013 - 3.3) * 36;
    h += ((1 - Math.abs(b(x * 0.0009, y * 0.0009, z * 0.0009))) * 46 - 23) * (1 + far * 0.8);
    h += b(x * 0.005, y * 0.005, z * 0.005) * 6 * (1 + far * 0.6);
    h += a(x * 0.02, y * 0.02, z * 0.02) * 1.1;
    return h;
  }

  makeCraters(rand) {
    const tiers = [[24, 200, 330], [130, 90, 190], [520, 42, 90], [1300, 22, 42]];
    const list = [];
    const d = new THREE.Vector3();
    for (const [count, rMin, rMax] of tiers) {
      for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 10; tries++) {
          const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
          d.set(s * Math.cos(th), u, s * Math.sin(th));
          // the far side is more heavily cratered
          if (rand() > 0.55 + 0.45 * darkness(d)) continue;
          const Rc = rMin + (rMax - rMin) * rand();
          let ok = true;
          for (const zn of this.zones) {
            const arc = R * Math.acos(clamp(d.dot(zn.dir), -1, 1));
            if (arc < (zn.zoneR ? zn.r * 1.3 : zn.r * 1.6) + Rc * 1.3) { ok = false; break; }
          }
          if (!ok) continue;
          const e1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
          const e2 = new THREE.Vector3().crossVectors(d, e1);
          const rays = Rc > 150 ? rand() * Math.PI * 2 : -1;
          const infl = Rc * (rays >= 0 ? 4.2 : 2.3);
          list.push({ d: d.clone(), e1, e2, R: Rc, depth: Rc * (Rc > 150 ? 0.17 : 0.25), rim: Rc * 0.075, rays, cosInfl: Math.cos(infl / R), infl });
          break;
        }
      }
    }
    this.craters = list;
    // bucket craters by chunk so each height sample only checks nearby craters
    const nb = 6 * CPF * CPF;
    this.buckets = Array.from({ length: nb }, () => []);
    const centers = [];
    for (let f = 0; f < 6; f++) for (let cy = 0; cy < CPF; cy++) for (let cx = 0; cx < CPF; cx++) {
      centers.push(faceDir(f, (cx + 0.5) * CH, (cy + 0.5) * CH, new THREE.Vector3()));
    }
    const bucketR = CH * (R * Math.PI / 2 / N) * 0.85;
    this.bucketCenters = centers;
    this.bucketR = bucketR;
    this.flats = []; // plateaus added later (outposts), bucketed like the craters so H stays cheap
    this.flatBuckets = Array.from({ length: nb }, () => []);
    for (const c of list) {
      const cosLim = Math.cos((c.infl + bucketR) / R);
      for (let k = 0; k < nb; k++) if (centers[k].dot(c.d) > cosLim) this.buckets[k].push(c);
    }
  }

  // Surface radius for a unit direction. Also writes crater attributes to this.attr.
  H(dx, dy, dz) {
    const x = dx * R, y = dy * R, z = dz * R;
    const sunDot = dx * SUN.x + dy * SUN.y + dz * SUN.z;
    let far = clamp((0.12 - sunDot) / 0.4, 0, 1);
    far = far * far * (3 - 2 * far);
    let h = this.base(x, y, z, far);
    dirToGrid(dx, dy, dz, _g);
    const cx = Math.min(CPF - 1, Math.floor(_g.i / CH)), cy = Math.min(CPF - 1, Math.floor(_g.j / CH));
    const bucket = this.buckets[(_g.f * CPF + cy) * CPF + cx];
    let floorA = 0, rimA = 0, rayA = 0;
    for (let k = 0; k < bucket.length; k++) {
      const c = bucket[k];
      const dot = dx * c.d.x + dy * c.d.y + dz * c.d.z;
      if (dot < c.cosInfl) continue;
      const r = (R * Math.acos(Math.min(1, dot))) / c.R;
      if (r < 2.3) {
        if (r < 1) {
          h += Math.max((r * r - 1) * c.depth, -c.depth * 0.82);
          floorA = Math.max(floorA, smoothstep(1.0, 0.35, r));
        }
        const q = (r - 1) / (r < 1 ? 0.22 : 0.45);
        const rimT = Math.exp(-q * q);
        h += c.rim * rimT;
        if (rimT > rimA) rimA = rimT;
      }
      if (c.rays >= 0 && r > 1.05 && r < 4.2) {
        const ang = Math.atan2(dx * c.e2.x + dy * c.e2.y + dz * c.e2.z, dx * c.e1.x + dy * c.e1.y + dz * c.e1.z);
        const ray = Math.pow(Math.abs(Math.sin(ang * 6 + c.rays)), 18) * (1 - smoothstep(1.2, 4.2, r));
        rayA = Math.max(rayA, ray * (0.6 + 0.4 * this.nC(x * 0.01, y * 0.01, z * 0.01)));
      }
    }
    let rad = R + h;
    for (let k = 0; k < this.zones.length; k++) {
      const zn = this.zones[k];
      const dot = dx * zn.dir.x + dy * zn.dir.y + dz * zn.dir.z;
      if (dot < zn.cosFlat) continue;
      const d = R * Math.acos(Math.min(1, dot));
      // plateau is a true plane in the settlement's local frame
      const t = smoothstep(zn.r, zn.r * 1.95, d);
      rad = zn.zr / dot + (rad - zn.zr / dot) * t;
      floorA *= t; rimA *= t; rayA *= t;
    }
    const fb = this.flatBuckets[(_g.f * CPF + cy) * CPF + cx];
    for (let k = 0; k < fb.length; k++) {
      const zn = fb[k];
      const dot = dx * zn.dir.x + dy * zn.dir.y + dz * zn.dir.z;
      if (dot < zn.cosFlat) continue;
      const d = R * Math.acos(Math.min(1, dot));
      const t = smoothstep(zn.r, zn.r * 1.95, d);
      rad = zn.zr / dot + (rad - zn.zr / dot) * t;
      floorA *= t; rimA *= t; rayA *= t;
    }
    this.attr.floor = floorA; this.attr.rim = rimA; this.attr.ray = rayA;
    return rad;
  }

  // Flatten ground after the fact (outposts the player founds): a plateau at the current height
  // of the centre, blended out to ~2x the radius. Rebuilds the affected terrain chunks.
  addFlat(dir, r) {
    const d = dir.clone().normalize();
    if (this.flats.some((z) => z.dir.dot(d) > 0.999999)) return;
    const zr = this.H(d.x, d.y, d.z);
    const zn = { dir: d, r, zr, cosFlat: Math.cos((r * 1.95) / R), flatOnly: true };
    this.flats.push(zn);
    // only the chunk buckets the plateau can reach test it in H
    const cosB = Math.cos((r * 1.95 + this.bucketR) / R);
    for (let k = 0; k < this.flatBuckets.length; k++) if (this.bucketCenters[k].dot(d) > cosB) this.flatBuckets[k].push(zn);
    this.cache.clear();
    const c = d.clone().multiplyScalar(R);
    for (const ch of this.chunks) {
      if (ch.center.distanceTo(c) > ch.radius + r * 2.2) continue;
      for (let l = 0; l < ch.meshes.length; l++) if (ch.meshes[l]) { this.scene.remove(ch.meshes[l]); ch.meshes[l].geometry.dispose(); ch.meshes[l] = null; }
      ch.shown = -1;
      if (ch.boulders) { this.scene.remove(ch.boulders); ch.boulders = null; ch.boulderSpec = null; }
      if (ch.boulderCols && this.colliders) { for (const col of ch.boulderCols) this.colliders.remove(col); ch.boulderCols = null; }
    }
  }

  vr(f, i, j) {
    const key = (f * N1 + j) * N1 + i;
    let r = this.cache.get(key);
    if (r === undefined) {
      if (this.cache.size > 400000) this.cache.clear();
      faceDir(f, i, j, _d);
      r = this.H(_d.x, _d.y, _d.z);
      this.cache.set(key, r);
    }
    return r;
  }

  // Exact surface under world position p: returns surface radius, writes outward normal.
  surface(p, outN) {
    const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
    const dx = p.x / len, dy = p.y / len, dz = p.z / len;
    dirToGrid(dx, dy, dz, _g);
    const f = _g.f;
    const fi = clamp(_g.i, 0, N - 1e-6), fj = clamp(_g.j, 0, N - 1e-6);
    const i = Math.floor(fi), j = Math.floor(fj);
    const tx = fi - i, ty = fj - j;
    faceDir(f, i, j, _p00).multiplyScalar(this.vr(f, i, j));
    let A = _p00, B, C;
    if (tx > ty) {
      B = faceDir(f, i + 1, j, _p10).multiplyScalar(this.vr(f, i + 1, j));
      C = faceDir(f, i + 1, j + 1, _p11).multiplyScalar(this.vr(f, i + 1, j + 1));
    } else {
      B = faceDir(f, i + 1, j + 1, _p11).multiplyScalar(this.vr(f, i + 1, j + 1));
      C = faceDir(f, i, j + 1, _p01).multiplyScalar(this.vr(f, i, j + 1));
    }
    _a.subVectors(B, A);
    _b.subVectors(C, A);
    _c.crossVectors(_a, _b);
    if (_c.dot(A) < 0) _c.negate();
    _c.normalize();
    const denom = _c.x * dx + _c.y * dy + _c.z * dz;
    const r = _c.dot(A) / Math.max(denom, 0.05);
    if (this.tunnel) {
      const f = this.tunnel.floor(p, len, dx, dy, dz, r, outN);
      if (f !== null) return f;
    }
    this.lastLake = null;
    for (let k = 0; k < this.lakes.length; k++) {
      const lk = this.lakes[k];
      const cd = dx * lk.d.x + dy * lk.d.y + dz * lk.d.z;
      if (cd > lk.cos && lk.level > r && (!lk.shore || this.inLake(lk, dx, dy, dz, cd))) {
        this.lastLake = lk;
        if (outN) outN.set(dx, dy, dz);
        return lk.level;
      }
    }
    if (outN) outN.copy(_c);
    return r;
  }

  // is this direction inside the lake's traced shoreline?
  inLake(lk, dx, dy, dz, cd) {
    const x = dx * lk.e1.x + dy * lk.e1.y + dz * lk.e1.z, y = dx * lk.e2.x + dy * lk.e2.y + dz * lk.e2.z;
    const n = lk.shore.length;
    const i = Math.round((Math.atan2(y, x) / (Math.PI * 2)) * n + n) % n;
    return Math.acos(Math.min(1, cd)) * this.R < lk.shore[i];
  }

  altitude(p) { return p.length() - this.surface(p); }

  // Point on the surface below direction/position v.
  ground(v, out = new THREE.Vector3(), lift = 0) {
    const r = this.surface(v);
    return out.copy(v).normalize().multiplyScalar(r + lift);
  }

  visible(a, b, steps = 12) {
    for (let i = 1; i < steps; i++) {
      _e.lerpVectors(a, b, i / steps);
      if (this.altitude(_e) < -0.5) return false;
    }
    return true;
  }

  // ---------------- chunked LOD rendering ----------------
  initChunks() {
    this.chunks = [];
    for (let f = 0; f < 6; f++) {
      // winding: make triangles face outward on every face
      const o = faceDir(f, N / 2, N / 2, new THREE.Vector3());
      const u = faceDir(f, N / 2 + 1, N / 2, new THREE.Vector3()).sub(o);
      const v = faceDir(f, N / 2, N / 2 + 1, new THREE.Vector3()).sub(o);
      const flip = new THREE.Vector3().crossVectors(u, v).dot(o) < 0;
      for (let cy = 0; cy < CPF; cy++) for (let cx = 0; cx < CPF; cx++) {
        const dir = faceDir(f, (cx + 0.5) * CH, (cy + 0.5) * CH, new THREE.Vector3());
        const corner = faceDir(f, cx * CH, cy * CH, new THREE.Vector3());
        this.chunks.push({
          f, cx, cy, flip, dir,
          center: dir.clone().multiplyScalar(R),
          radius: corner.multiplyScalar(R).distanceTo(dir.clone().multiplyScalar(R)) + 40,
          meshes: [null, null, null, null],
          shown: -1, want: -1, queued: false, boulders: null, boulderCols: null, lastWanted: 0,
        });
      }
    }
  }

  makeMaterial() {
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
    // Inked crater rims: a comic contour wherever the rim profile peaks.
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.holeU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRim;\nvarying float vRim;\nvarying vec3 vHoleW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = aRim;\nvHoleW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vRim; varying vec3 vHoleW;
uniform float uHoleOn; uniform vec3 uHoleO, uHoleX, uHoleY, uHoleZ; uniform vec2 uHoleMin, uHoleMax;`)
        .replace('void main() {', `void main() {
  if (uHoleOn > 0.5) {
    vec3 hq = vHoleW - uHoleO;
    float hx = dot(hq, uHoleX), hz = dot(hq, uHoleZ), hy = dot(hq, uHoleY);
    if (hx > uHoleMin.x && hx < uHoleMax.x && hz > uHoleMin.y && hz < uHoleMax.y && hy > -45.0 && hy < 8.0) discard;
  }`)
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat rimInk = smoothstep(0.84, 0.93, vRim);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.03, 0.1), rimInk * 0.9);');
    };
    return mat;
  }

  buildChunk(ch, lod) {
    const s = 1 << lod;
    const m = CH / s;
    const vn = m + 1;
    const nGrid = vn * vn;
    const nSkirt = 4 * m;
    const pos = new Float32Array((nGrid + nSkirt) * 3);
    const nor = new Float32Array((nGrid + nSkirt) * 3);
    const col = new Float32Array((nGrid + nSkirt) * 3);
    const rim = new Float32Array(nGrid + nSkirt);
    const f = ch.f;
    const i0 = ch.cx * CH, j0 = ch.cy * CH;
    const radii = new Float32Array((vn + 2) * (vn + 2));
    const dirs = new Float32Array((vn + 2) * (vn + 2) * 3);
    const c = new THREE.Color();
    const highland = new THREE.Color(0.84, 0.78, 0.70);
    const mare = new THREE.Color(0.46, 0.45, 0.62);
    const floorC = new THREE.Color(0.34, 0.31, 0.50);
    const rimC = new THREE.Color(1.0, 0.95, 0.84);
    const rayC = new THREE.Color(1.0, 0.98, 0.92);
    const darkTint = new THREE.Color(0.55, 0.58, 0.75);
    // sample a (vn+2)^2 grid including a one-step border for normals
    for (let b = -1; b <= vn; b++) {
      for (let a = -1; a <= vn; a++) {
        const gi = clamp(i0 + a * s, 0, N), gj = clamp(j0 + b * s, 0, N);
        const k = (b + 1) * (vn + 2) + (a + 1);
        faceDir(f, gi, gj, _d);
        const inside = a >= 0 && b >= 0 && a < vn && b < vn;
        let r;
        if (inside) {
          r = this.H(_d.x, _d.y, _d.z);
          this.cache.set((f * N1 + gj) * N1 + gi, r);
          const li = b * vn + a;
          rim[li] = this.attr.rim;
          const x = _d.x * R, y = _d.y * R, z = _d.z * R;
          const mm = smoothstep(-0.25, 0.35, this.nB(x * 0.0007 + 11, y * 0.0007, z * 0.0007 - 5));
          c.copy(highland).lerp(mare, mm);
          c.lerp(floorC, this.attr.floor * 0.7);
          c.lerp(rimC, this.attr.rim * 0.6);
          c.lerp(rayC, this.attr.ray * 0.7);
          c.lerp(darkTint, darkness(_d) * 0.35);
          const speck = this.nC(x * 0.08, y * 0.08, z * 0.08) * 0.05;
          col[li * 3] = c.r * (1 + speck); col[li * 3 + 1] = c.g * (1 + speck); col[li * 3 + 2] = c.b * (1 + speck);
        } else r = this.vr(f, gi, gj);
        radii[k] = r;
        dirs[k * 3] = _d.x; dirs[k * 3 + 1] = _d.y; dirs[k * 3 + 2] = _d.z;
      }
    }
    const P = (k, out) => out.set(dirs[k * 3] * radii[k], dirs[k * 3 + 1] * radii[k], dirs[k * 3 + 2] * radii[k]);
    for (let b = 0; b < vn; b++) {
      for (let a = 0; a < vn; a++) {
        const k = (b + 1) * (vn + 2) + (a + 1);
        const li = b * vn + a;
        P(k, _a);
        pos[li * 3] = _a.x; pos[li * 3 + 1] = _a.y; pos[li * 3 + 2] = _a.z;
        P(k + 1, _b); P(k - 1, _c); _b.sub(_c);
        P(k + (vn + 2), _c); P(k - (vn + 2), _e); _c.sub(_e);
        _e.crossVectors(_b, _c);
        if (_e.dot(_a) < 0) _e.negate();
        _e.normalize();
        nor[li * 3] = _e.x; nor[li * 3 + 1] = _e.y; nor[li * 3 + 2] = _e.z;
        // slope shading baked into colour
        const ny = _e.dot(_a.normalize());
        const k2 = clamp(1 - (1 - ny) * 0.9, 0.45, 1.1);
        col[li * 3] *= k2; col[li * 3 + 1] *= k2; col[li * 3 + 2] *= k2;
      }
    }
    // skirt ring along the chunk border hides cracks between LOD levels
    const edge = [];
    for (let a = 0; a < m; a++) edge.push(a);
    for (let b = 0; b < m; b++) edge.push(b * vn + m);
    for (let a = m; a > 0; a--) edge.push(m * vn + a);
    for (let b = m; b > 0; b--) edge.push(b * vn);
    const depth = 12 * s;
    edge.forEach((li, e) => {
      const si = nGrid + e;
      _a.set(pos[li * 3], pos[li * 3 + 1], pos[li * 3 + 2]);
      const l = _a.length();
      _a.multiplyScalar((l - depth) / l);
      pos[si * 3] = _a.x; pos[si * 3 + 1] = _a.y; pos[si * 3 + 2] = _a.z;
      for (let q = 0; q < 3; q++) { nor[si * 3 + q] = nor[li * 3 + q]; col[si * 3 + q] = col[li * 3 + q] * 0.8; }
      rim[si] = 0;
    });
    const idx = new Uint32Array(m * m * 6 + edge.length * 12);
    let k = 0;
    const flip = ch.flip;
    for (let b = 0; b < m; b++) {
      for (let a = 0; a < m; a++) {
        const p00 = b * vn + a, p10 = p00 + 1, p01 = p00 + vn, p11 = p01 + 1;
        // must match the diagonal split used by surface(): (00,10,11) and (00,11,01)
        if (!flip) { idx[k++] = p00; idx[k++] = p10; idx[k++] = p11; idx[k++] = p00; idx[k++] = p11; idx[k++] = p01; }
        else { idx[k++] = p00; idx[k++] = p11; idx[k++] = p10; idx[k++] = p00; idx[k++] = p01; idx[k++] = p11; }
      }
    }
    for (let e = 0; e < edge.length; e++) {
      const a0 = edge[e], a1 = edge[(e + 1) % edge.length];
      const s0 = nGrid + e, s1 = nGrid + ((e + 1) % edge.length);
      // both windings: skirts are seen from either side
      idx[k++] = a0; idx[k++] = s0; idx[k++] = a1; idx[k++] = a1; idx[k++] = s0; idx[k++] = s1;
      idx[k++] = a0; idx[k++] = a1; idx[k++] = s0; idx[k++] = a1; idx[k++] = s1; idx[k++] = s0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = lod <= 1;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.scene.add(mesh);
    ch.meshes[lod] = mesh;
    this.stats.built++;
  }

  buildBoulders(ch) {
    const rr = mulberry32((ch.f * 7919 + ch.cy * 131 + ch.cx) * 2654435761);
    const count = 4 + Math.floor(rr() * 6);
    const im = new THREE.InstancedMesh(this.boulderGeo, this.boulderMat, count);
    const hull = new THREE.InstancedMesh(this.boulderGeo, this.boulderInk, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const cols = [];
    let n = 0;
    for (let t = 0; t < count; t++) {
      faceDir(ch.f, ch.cx * CH + rr() * CH, ch.cy * CH + rr() * CH, p);
      let ok = true;
      for (const zn of this.zones) if (p.dot(zn.dir) > Math.cos((zn.r * 1.5) / R)) { ok = false; break; }
      for (const zn of this.flats) if (p.dot(zn.dir) > Math.cos((zn.r * 1.5) / R)) { ok = false; break; }
      const s = 1.2 + Math.pow(rr(), 3) * 7;
      e.set(rr() * 3, rr() * 3, rr() * 3);
      if (!ok) continue;
      const r = this.surface(p);
      p.multiplyScalar(r + s * 0.3);
      q.setFromEuler(e);
      m4.compose(p, q, sc.set(s, s * 0.8, s));
      im.setMatrixAt(n, m4);
      m4.compose(p, q, sc.set(s + 0.15, s * 0.8 + 0.15, s + 0.15));
      hull.setMatrixAt(n, m4);
      cols.push({ type: 'sphere', c: p.clone().addScaledVector(p.clone().normalize(), -s * 0.1), r: s * 0.85 });
      n++;
    }
    im.count = hull.count = n;
    im.castShadow = true;
    im.frustumCulled = hull.frustumCulled = false;
    const g = new THREE.Group();
    g.add(im, hull);
    g.matrixAutoUpdate = false;
    g.visible = false;
    this.scene.add(g);
    ch.boulders = g;
    ch.boulderSpec = cols;
  }

  // Decide per chunk what LOD to show; build missing meshes within a time budget.
  update(camPos, { budgetMs = 5, maxDist = 3200 } = {}) {
    const camLen = camPos.length();
    const rMin = R - 330, rMax = R + 260;
    const horizon = Math.sqrt(Math.max(0, camLen * camLen - rMin * rMin)) + Math.sqrt(rMax * rMax - rMin * rMin);
    const limit = Math.min(maxDist, horizon);
    const now = performance.now();
    this.queue.length = 0;
    let visible = 0;
    for (const ch of this.chunks) {
      const d = camPos.distanceTo(ch.center) - ch.radius;
      let want = -1;
      const dl = d / (this.lodScale || 1); // settings: terrain detail
      if (d < limit) want = dl < 260 ? 0 : dl < 800 ? 1 : dl < 1700 ? 2 : 3;
      ch.want = want;
      if (want >= 0) ch.lastWanted = now;
      let show = -1;
      if (want >= 0) {
        if (ch.meshes[want]) show = want;
        else {
          this.queue.push(ch);
          // show the closest available level meanwhile
          for (let l = 0; l <= MAX_LOD; l++) if (ch.meshes[l] && (show < 0 || Math.abs(l - want) < Math.abs(show - want))) show = l;
        }
      }
      if (show !== ch.shown) {
        if (ch.shown >= 0 && ch.meshes[ch.shown]) ch.meshes[ch.shown].visible = false;
        if (show >= 0) ch.meshes[show].visible = true;
        ch.shown = show;
      }
      if (show >= 0) visible++;
      // boulders: drawn for near chunks; colliders only where you can actually hit them
      const near = want >= 0 && want <= 1;
      if (near && !ch.boulders) this.buildBoulders(ch);
      if (ch.boulders) ch.boulders.visible = near;
      const active = want === 0;
      if (active && !ch.boulderCols && this.colliders) ch.boulderCols = ch.boulderSpec.map((c) => this.colliders.add(c));
      if (!active && ch.boulderCols) { for (const c of ch.boulderCols) this.colliders.remove(c); ch.boulderCols = null; }
      // free detailed meshes that are no longer needed
      for (let l = 0; l < 2; l++) {
        const m = ch.meshes[l];
        if (!m || ch.shown === l) continue;
        if (want < 0 ? now - ch.lastWanted > 8000 : want > l + 1) {
          this.scene.remove(m);
          m.geometry.dispose();
          ch.meshes[l] = null;
        }
      }
    }
    this.stats.visible = visible;
    // closest first
    this.queue.sort((a, b) => camPos.distanceToSquared(a.center) - camPos.distanceToSquared(b.center));
    const t0 = performance.now();
    for (const ch of this.queue) {
      if (performance.now() - t0 > budgetMs) break;
      this.buildChunk(ch, ch.want);
      if (ch.shown >= 0 && ch.meshes[ch.shown]) ch.meshes[ch.shown].visible = false;
      ch.meshes[ch.want].visible = true;
      ch.shown = ch.want;
    }
    return this.queue.length;
  }
}
