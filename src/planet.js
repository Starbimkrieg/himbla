import * as THREE from 'three';
import { PLANET } from './config.js';
import { mulberry32, createNoise3D, smoothstep, clamp } from './rng.js';
import { gradientMap } from './toon.js';
import { SUN, darkness } from './geo.js';
import { shapedRocks } from './rocks.js';

const N = PLANET.faceCells;
const CH = PLANET.chunkCells;
const CPF = N / CH;
const QP = Math.PI / 4;
const N1 = N + 1;
const R = PLANET.radius;
const MAX_LOD = 4; // level 0 is the ~4.4 m grid, near you; each level up halves it

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
// the ink line along crater crests: how many rims the terrain shader takes, and how far out
const RIM_INK_MAX = 64, RIM_INK_REACH = 1500, RIM_INK_BIG = 120; // (no ink on rims bigger than that)
const _rv = new THREE.Vector3();
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
    this.attr = { floor: 0, rim: 0, ray: 0, rock: 0, rille: 0 };
    this.makeCraters(rand);
    this.initChunks();
    // one rectangular hole can be cut in the terrain (the Whispering Fissure's entrance ramp)
    this.holeU = {
      uHoleOn: { value: 0 }, uHoleO: { value: new THREE.Vector3() }, uHoleX: { value: new THREE.Vector3(1, 0, 0) },
      uHoleY: { value: new THREE.Vector3(0, 1, 0) }, uHoleZ: { value: new THREE.Vector3(0, 0, 1) },
      uHoleMin: { value: new THREE.Vector2() }, uHoleMax: { value: new THREE.Vector2() },
      // crater rims near the camera, for the ink line along their crests (updateRimInk)
      uRimC: { value: Array.from({ length: RIM_INK_MAX }, () => new THREE.Vector4()) }, uRimN: { value: 0 },
    };
    this.rimInkAt = new THREE.Vector3(1e9, 0, 0);
    this.tunnel = null; // set by the secrets system: overrides the floor underground
    this.material = this.makeMaterial();
    this.material.shadowSide = THREE.BackSide;
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
            if (zn.late) continue; // added after the craters were laid out (see locations.js)
            const arc = R * Math.acos(clamp(d.dot(zn.dir), -1, 1));
            if (arc < (zn.zoneR ? zn.r * 1.3 : zn.r * 1.6) + Rc * 1.3) { ok = false; break; }
          }
          if (!ok) continue;
          const e1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
          const e2 = new THREE.Vector3().crossVectors(d, e1);
          const rays = Rc > 150 ? rand() * Math.PI * 2 : -1;
          const infl = Rc * (rays >= 0 ? 4.2 : 2.3);
          const cr = { d: d.clone(), e1, e2, R: Rc, depth: Rc * (Rc > 150 ? 0.17 : 0.25), rim: Rc * 0.075, rays, cosInfl: Math.cos(infl / R), infl };
          this.craterType(cr, list.length);
          list.push(cr);
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

  // Give a crater its character, from a generator of its own (seeded by its index), so the crater
  // layout - and the lakes, roads and outposts laid out around it - doesn't move:
  //   bowl      the classic: a smooth rim
  //   rampart   a tall, firm rim that stands up off the plain, with a steep inner wall
  //   jagged    a crown of rim peaks
  //   ghost     old and worn almost flat
  //   terraced  big ones only: stepped inner walls and a central peak
  craterType(c, i) {
    const rr = mulberry32((i + 1) * 2654435761 ^ 0x51ed);
    const x = rr();
    c.inW = 0.22; c.outW = 0.45; c.jag = 0; c.terr = 0; c.peak = 0;
    c.rim *= 0.75 + rr() * 0.5;
    if (c.R > 80 && x < 0.2) {
      c.type = 'terraced';
      c.terr = 3 + Math.floor(rr() * 2);
      c.peak = c.depth * (0.4 + rr() * 0.25);
      c.rim *= 1.3;
    } else if (x < 0.45) {
      c.type = 'rampart';
      c.rim *= 1.9 + rr() * 0.6;
      c.inW = 0.15; c.outW = 0.36;
      c.depth *= 1.12;
    } else if (x < 0.6) {
      // (named for the old spiky version: now a rim that swells and dips in broad lobes)
      c.type = 'jagged';
      c.rim *= 1.6 + rr() * 0.4;
      c.jag = 0.3 + rr() * 0.15;
      c.jf = 3 + Math.floor(rr() * 4);
      c.jp = rr() * 6.28;
      c.outW = 0.4;
    } else if (x < 0.72) {
      c.type = 'ghost';
      c.depth *= 0.35; c.rim *= 0.35; c.outW = 0.7;
    } else c.type = 'bowl';
    // a firm lip and a proper dip on every crater that isn't worn away
    if (c.type !== 'ghost') { c.rim *= 1.85; c.depth *= 1.15; }
    // never narrower than the terrain grid can draw smoothly (~4.4 m cells): a crest sharper than
    // that creases along the triangle edges, and the comic pass inks the creases as saw-teeth
    c.inW = Math.max(c.inW, 12 / c.R);
    c.outW = Math.max(c.outW, 16 / c.R);
    // how far the crest is rounded off: the taller the lip, the rounder its top, so it never curves
    // tighter than the ~4.4 m terrain grid can draw (any tighter and the crest comes out a saw-tooth)
    const peak = c.rim * (1 + c.jag);
    c.kIn = Math.max(5, (2 * peak) / (0.1 * c.inW * c.R));
    c.kOut = Math.max(5, (2 * peak) / (0.1 * c.outW * c.R));
    if (c.jf) c.jf = Math.max(2, Math.min(c.jf, Math.floor((2 * Math.PI * c.R) / 70)));
  }

  // Regional landforms on top of the base terrain. Each kind lives in its own patches (a very
  // low-frequency mask: ~12% of the Moon each, rilles ~18%), so over half the Moon stays the
  // smooth, cratered plain:
  //   ridged highlands: sharp, jagged crests       scarps: stepped ledges (lunar lobate scarps)
  //   rilles: winding channels                     hills: long rolling slopes
  // Writes this.attr.rock (for the rocky tint and extra boulders) and this.attr.rille.
  features(x, y, z) {
    const A = this.nA, B = this.nB, C = this.nC;
    let h = 0, rock = 0, rille = 0;
    const mRidge = smoothstep(0.49, 0.69, C(x * 0.00032 + 40, y * 0.00032, z * 0.00032 - 12));
    if (mRidge > 0) {
      // long ridges with crisp (but still rounded) crests: a softened ridged noise
      const nv = A(x * 0.0026 + 3, y * 0.0026, z * 0.0026);
      const n1 = 1 - Math.sqrt(nv * nv + 0.012) + 0.11;
      h += mRidge * (n1 * n1 * 40 + B(x * 0.006, y * 0.006 + 9, z * 0.006) * 5 - 12);
      rock = mRidge * smoothstep(0.6, 0.9, n1);
    }
    const mScarp = smoothstep(0.46, 0.66, C(x * 0.0004 - 21, y * 0.0004 + 6, z * 0.0004));
    if (mScarp > 0) {
      // stepped ledges to drop off (lunar lobate scarps)
      const sv = A(x * 0.0011 - 8, y * 0.0011, z * 0.0011 + 15) + 0.25 * B(x * 0.004, y * 0.004, z * 0.004);
      h += mScarp * 20 * (smoothstep(-0.035, 0.035, sv) + smoothstep(0.31, 0.39, sv));
      rock = Math.max(rock, mScarp * (1 - Math.min(1, Math.abs(sv) / 0.05)) * 0.6);
    }
    const mRille = smoothstep(0.32, 0.52, C(x * 0.00038 + 77, y * 0.00038 - 3, z * 0.00038 + 31));
    if (mRille > 0) {
      // a wide, deep U-shaped channel (a smooth gaussian across it: no crease at the bottom, no
      // lips). H() carves it last, after the craters, so it runs unbroken through everything.
      const sv = B(x * 0.0014 + 5, y * 0.0014 - 5, z * 0.0014) / 0.13;
      rille = mRille * Math.exp(-sv * sv);
    }
    const mHills = smoothstep(0.51, 0.71, B(x * 0.0003 - 50, y * 0.0003 + 20, z * 0.0003));
    if (mHills > 0) h += mHills * A(x * 0.0021, y * 0.0021 + 33, z * 0.0021) * 34;
    this.attr.rock = rock;
    this.attr.rille = rille;
    return h;
  }

  // The base terrain height at a crater's middle (for its level apron). It mustn't disturb the
  // attributes of the point H() is in the middle of working out.
  craterBase(c) {
    const rock = this.attr.rock, rille = this.attr.rille;
    const x = c.d.x * R, y = c.d.y * R, z = c.d.z * R;
    let far = clamp((0.12 - (c.d.x * SUN.x + c.d.y * SUN.y + c.d.z * SUN.z)) / 0.4, 0, 1);
    far = far * far * (3 - 2 * far);
    c.hf = this.features(x, y, z);
    const hb = this.base(x, y, z, far);
    this.attr.rock = rock; this.attr.rille = rille;
    return hb;
  }

  // Surface radius for a unit direction. Also writes crater attributes to this.attr.
  H(dx, dy, dz) {
    const x = dx * R, y = dy * R, z = dz * R;
    const sunDot = dx * SUN.x + dy * SUN.y + dz * SUN.z;
    let far = clamp((0.12 - sunDot) / 0.4, 0, 1);
    far = far * far * (3 - 2 * far);
    const hB = this.base(x, y, z, far), hF = this.features(x, y, z);
    let h = hB + hF;
    const rilleCut = this.attr.rille * 18;
    // rille floors are smooth: cancel the base terrain's small bumps inside the channel
    const rl = this.attr.rille;
    if (rl > 0.01) h -= rl * (this.nB(x * 0.005, y * 0.005, z * 0.005) * 6 * (1 + far * 0.6) + this.nA(x * 0.02, y * 0.02, z * 0.02) * 1.1);
    dirToGrid(dx, dy, dz, _g);
    const cx = Math.min(CPF - 1, Math.floor(_g.i / CH)), cy = Math.min(CPF - 1, Math.floor(_g.j / CH));
    const bucket = this.buckets[(_g.f * CPF + cy) * CPF + cx];
    let floorA = 0, rimA = 0, rayA = 0;
    for (let k = 0; k < bucket.length; k++) {
      const c = bucket[k];
      const dot = dx * c.d.x + dy * c.d.y + dz * c.d.z;
      if (dot < c.cosInfl) continue;
      const r = (R * Math.acos(Math.min(1, dot))) / c.R;
      // each crater sits on its own level apron (the plain's small bumps round it eased toward the
      // height at its middle), so its lip curves up clearly; the bigger landforms (hills, ridges,
      // scarps) are only eased a little, so they keep their shape round craters
      if (r < 2.2 && c.type !== 'ghost') {
        if (c.hb === undefined) c.hb = this.craterBase(c);
        const w = 1 - smoothstep(1.15, 2.2, r);
        h += (c.hb - hB) * 0.85 * w + (c.hf - hF) * 0.35 * w;
      }
      if (r < 2.3) {
        if (r < 1) {
          let rb = r;
          if (c.terr) {
            // stepped inner walls: the radius quantised into soft stairs
            const t = r * c.terr, fl = Math.floor(t);
            rb = (fl + smoothstep(0.25, 0.75, t - fl)) / c.terr;
          }
          // the bowl's wall eases flat as it meets the rim (a plain (r^2 - 1) wall left a kink on the
          // crest, which the terrain grid drew as a saw-tooth), and bottoms out in a flat floor
          const bw = 1 - rb * rb;
          h -= c.depth * Math.min(0.82, 1.6 * bw * bw);
          if (c.peak) { const pq = r / 0.2; h += c.peak * Math.exp(-pq * pq); }
          floorA = Math.max(floorA, smoothstep(1.0, 0.35, r));
        }
        let rimH = c.rim;
        if (c.jag) {
          // a crown: rim height swings round the circle, with sharp peaks
          const ang = Math.atan2(dx * c.e2.x + dy * c.e2.y + dz * c.e2.z, dx * c.e1.x + dy * c.e1.y + dz * c.e1.z);
          const w = 0.5 + 0.5 * Math.sin(ang * c.jf + c.jp);
          rimH *= 1 - c.jag + c.jag * 2 * w;
        }
        const q = (r - 1) / (r < 1 ? c.inW : c.outW);
        const rimT = Math.exp(-q * q);
        // the lip: a quarter-pipe on both sides - it curves up ever steeper to the crest, like a
        // kicker (the crest is the grind rail) - with the top rounded off (craterType's kIn/kOut)
        const dm = (r - 1) * c.R, k = r < 1 ? c.kIn : c.kOut, e = Math.sqrt(dm * dm + k * k) - k;
        const x = Math.min(1, e / ((r < 1 ? c.inW : c.outW) * c.R));
        h += rimH * (1 - x) * (1 - x);
        if (rimT > rimA) rimA = rimT;
      }
      if (c.rays >= 0 && r > 1.05 && r < 4.2) {
        const ang = Math.atan2(dx * c.e2.x + dy * c.e2.y + dz * c.e2.z, dx * c.e1.x + dy * c.e1.y + dz * c.e1.z);
        const ray = Math.pow(Math.abs(Math.sin(ang * 6 + c.rays)), 18) * (1 - smoothstep(1.2, 4.2, r));
        rayA = Math.max(rayA, ray * (0.6 + 0.4 * this.nC(x * 0.01, y * 0.01, z * 0.01)));
      }
    }
    h -= rilleCut; // rilles carve through everything, crater rims included
    let rad = R + h;
    for (let k = 0; k < this.zones.length; k++) {
      const zn = this.zones[k];
      const dot = dx * zn.dir.x + dy * zn.dir.y + dz * zn.dir.z;
      if (dot < zn.cosFlat) continue;
      const d = R * Math.acos(Math.min(1, dot));
      // plateau is a true plane in the settlement's local frame
      const t = smoothstep(zn.r, zn.r * 1.95, d);
      rad = zn.zr / dot + (rad - zn.zr / dot) * t;
      floorA *= t; rimA *= t; rayA *= t; this.attr.rock *= t; this.attr.rille *= t;
    }
    const fb = this.flatBuckets[(_g.f * CPF + cy) * CPF + cx];
    for (let k = 0; k < fb.length; k++) {
      const zn = fb[k];
      const dot = dx * zn.dir.x + dy * zn.dir.y + dz * zn.dir.z;
      if (dot < zn.cosFlat) continue;
      const d = R * Math.acos(Math.min(1, dot));
      const t = smoothstep(zn.r, zn.r * 1.95, d);
      rad = zn.zr / dot + (rad - zn.zr / dot) * t;
      floorA *= t; rimA *= t; rayA *= t; this.attr.rock *= t; this.attr.rille *= t;
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
          meshes: [null, null, null, null, null],
          shown: -1, want: -1, queued: false, boulders: null, boulderCols: null, lastWanted: 0,
        });
      }
    }
  }

  makeMaterial() {
    // the same three toon tones as everything else, but with short soft blends between them: a hard
    // step follows the terrain triangles round steep, curved walls (crater bowls) in a saw-tooth
    const W = 64, ramp = new Uint8Array(W * 4);
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / W;
      const v = 60 + 90 * smoothstep(0.27, 0.4, x) + 105 * smoothstep(0.6, 0.73, x);
      ramp.set([v, v, v, 255], i * 4);
    }
    const soft = new THREE.DataTexture(ramp, W, 1, THREE.RGBAFormat);
    soft.minFilter = soft.magFilter = THREE.LinearFilter;
    soft.needsUpdate = true;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: soft });
    // Inked crater rims: a crisp black line along each crest (updateRimInk), over a soft darker band.
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.holeU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRim;\nvarying float vRim;\nvarying vec3 vHoleW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = aRim;\nvHoleW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vRim; varying vec3 vHoleW;
uniform float uHoleOn; uniform vec3 uHoleO, uHoleX, uHoleY, uHoleZ; uniform vec2 uHoleMin, uHoleMax;
uniform vec4 uRimC[${RIM_INK_MAX}]; uniform int uRimN;
float rimHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rimNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rimHash(i), rimHash(i + vec3(1, 0, 0)), f.x), mix(rimHash(i + vec3(0, 1, 0)), rimHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rimHash(i + vec3(0, 0, 1)), rimHash(i + vec3(1, 0, 1)), f.x), mix(rimHash(i + vec3(0, 1, 1)), rimHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`)
        .replace('void main() {', `void main() {
  if (uHoleOn > 0.5) {
    vec3 hq = vHoleW - uHoleO;
    float hx = dot(hq, uHoleX), hz = dot(hq, uHoleZ), hy = dot(hq, uHoleY);
    if (hx > uHoleMin.x && hx < uHoleMax.x && hz > uHoleMin.y && hz < uHoleMax.y && hy > -45.0 && hy < 8.0) discard;
  }`)
        // a soft shade over the rim, and a crisp black ink line along each crest: a circle round the
        // crater, measured per pixel on the sphere (so it's smooth whatever the triangles do). It
        // fades out where the rim itself does (worn away, or flattened under a settlement), and
        // with distance
        .replace('#include <color_fragment>', `#include <color_fragment>
float rimShade = smoothstep(0.55, 1.0, vRim);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.42), rimShade * 0.3);
vec3 rimP = normalize(vHoleW) * ${R.toFixed(1)};
// The ink runs along the crest of each grindable lip (rimOf): overlapping craters share one
// outline, the edge of the union of their discs; craters sitting wholly on a much bigger one's
// floor (negative radius) get their own. It wavers a little, swells and thins, but stays on the
// crest, where you grind.
float rimU = 1e6, rimOwn = 1e6;
for (int i = 0; i < ${RIM_INK_MAX}; i++) {
  if (i >= uRimN) break;
  vec4 c = uRimC[i];
  float sd = distance(rimP, c.xyz) - abs(c.w);
  if (c.w > 0.0) rimU = min(rimU, sd); else if (abs(sd) < abs(rimOwn)) rimOwn = sd;
}
float rimWob = (rimNoise(rimP * 0.05) - 0.5) * 1.0 + (rimNoise(rimP * 0.17 + 4.0) - 0.5) * 0.4;
float rimEdge = min(abs(rimU + rimWob), abs(rimOwn + rimWob));
float rimPx = max(fwidth(rimEdge), 1e-3); // metres per pixel across the band
float rimFar = 1.0 - smoothstep(${(RIM_INK_REACH * 0.7).toFixed(1)}, ${RIM_INK_REACH.toFixed(1)}, distance(vHoleW, cameraPosition));
// Not ink: a band of shattered regolith along the crest. An uneven rocky core whose edges break up
// into patches, a soft scuffed halo round it, and rubble through it - dark pebbles and bright
// chips of fresh rock (the grit fades out with distance before it can shimmer)
float rimRag = (rimNoise(rimP * 0.21 + 1.7) - 0.5) * 2.2 + (rimNoise(rimP * 0.55 - 6.0) - 0.5) * 1.0;
float rimHw = max(1.3 + 1.9 * rimNoise(rimP * 0.03 + 9.0), rimPx * 1.2);
float rimCore = 1.0 - smoothstep(rimHw * 0.55, rimHw * 1.35 + rimPx, rimEdge + rimRag);
float rimHalo = (1.0 - smoothstep(rimHw, rimHw * 3.2, rimEdge + rimRag * 1.5)) * 0.35;
float rimGritK = 1.0 - smoothstep(0.08, 0.35, rimPx);
float rimPeb = smoothstep(0.62, 0.72, rimNoise(rimP * 1.3 + 11.0)) * rimGritK;
float rimChip = smoothstep(0.8, 0.86, rimNoise(rimP * 1.9 - 4.0)) * rimGritK;
float rimLine = max(rimCore * (0.62 + 0.25 * rimNoise(rimP * 0.09 - 3.0)), rimHalo) * rimFar;
vec3 rimRock = vec3(0.24, 0.21, 0.29);
diffuseColor.rgb = mix(diffuseColor.rgb, rimRock, rimLine);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.085, 0.14), rimPeb * max(rimCore, rimHalo * 1.6) * 0.85 * rimFar);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.86), rimChip * rimCore * 0.6 * rimFar);`);
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
    const rockC = new THREE.Color(0.6, 0.56, 0.6);
    const rilleC = new THREE.Color(0.38, 0.36, 0.52);
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
          c.lerp(rockC, this.attr.rock * 0.55);
          c.lerp(rilleC, this.attr.rille * 0.5);
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
        // (gentle: hard darkening on steep walls tipped into the halftone in saw-toothed patches)
        const k2 = clamp(1 - (1 - ny) * 0.5, 0.68, 1.1);
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
    // hills block the sun again (without it, a rock's shadow fell straight through the hill and
    // landed a second time beyond it); only their far sides cast (material.shadowSide), so a
    // sunlit slope can't shadow itself into jagged blotches
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.scene.add(mesh);
    ch.meshes[lod] = mesh;
    this.stats.built++;
  }

  // Is this spot free for a big rock? (no settlement or plateau, black lake or road)
  spotFree(p) {
    const d = _e.copy(p).normalize();
    for (const zn of this.zones) if (d.dot(zn.dir) > Math.cos((zn.r * 1.6 + 30) / R)) return false;
    for (const zn of this.flats) if (d.dot(zn.dir) > Math.cos((zn.r * 1.6 + 20) / R)) return false;
    for (const lk of this.lakes) if (d.dot(lk.d) > lk.cos - 0.002) return false;
    if (this.clearDirs) { const cs = this.clearCos; for (const c of this.clearDirs) if (d.dot(c) > cs) return false; }
    return true;
  }

  // Grind rails (the crests of snake rocks): polyline, arc lengths and a bounding sphere.
  addRail(r) {
    const pts = r.pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const c = new THREE.Vector3();
    for (const p of pts) c.add(p);
    c.divideScalar(pts.length);
    let rad = 0;
    for (const p of pts) rad = Math.max(rad, p.distanceTo(c));
    (this.rails ||= []).push({ pts, cum, len: cum[cum.length - 1], c, rad });
  }

  // Crater lips: the ink line and the grind rail are the same thing. A crater's lip counts if it
  // stands up as a firm ridge most of the way round (not flattened under a settlement, swallowed
  // by a neighbour, worn away, or a giant); its crest - where it peaks - is where the ink is drawn
  // and where you grind. Overlapping craters share one outline: each lip only runs where it
  // isn't inside a neighbour, so the cluster has one rim round it, inked and grindable. A crater
  // lying wholly on the floor of one at least twice its size keeps its whole lip.
  rimOf(c) {
    this.rimInfo ||= new Map();
    let I = this.rimInfo.get(c);
    if (I) return I;
    I = { ok: false, rpk: 1, rc: c.R, pts: null, nested: false, nb: null };
    this.rimInfo.set(c, I);
    if (c.type === 'ghost' || c.R < 24 || c.R > RIM_INK_BIG) return I;
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const at = (rr, th, out) => {
      const a = (rr * c.R) / R;
      out.copy(c.e1).multiplyScalar(Math.cos(th)).addScaledVector(c.e2, Math.sin(th)).multiplyScalar(Math.sin(a)).addScaledVector(c.d, Math.cos(a)).normalize();
      return this.surface(out);
    };
    // the crest sits a touch outside r = 1 (the bowl drags the inner side down): find it
    let rpk = 1, best = -1e9;
    for (let rr = 0.88; rr <= 1.3; rr += 0.01) {
      let h = 0;
      for (let k = 0; k < 6; k++) h += at(rr, k * 1.047 + 0.3, v);
      if (h > best) { best = h; rpk = rr; }
    }
    const n = Math.max(24, Math.ceil((2 * Math.PI * c.R * rpk) / 4));
    const pts = [];
    let firm = 0;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const top = at(rpk, th, v);
      // the rail hugs the ground you see (smoothed below, so it doesn't bob over every grid cell)
      pts.push(v.clone().multiplyScalar(top));
      // a firm lip stands up off the line between the bowl and the ground outside (which can be
      // higher than it, on a slope)
      if (top - (at(rpk - 0.3, th, w) + at(rpk + 0.35, th, w)) / 2 > 1.5) firm++;
    }
    // ease out the small bumps of the ground underneath, so the grind runs smooth
    // (and the steps where a scarp or ridge crosses the lip)
    let rad = pts.map((q) => q.length());
    for (let pass = 0; pass < 1; pass++) {
      rad = rad.map((_, i) => (rad[(i + n - 2) % n] + 2 * rad[(i + n - 1) % n] + 3 * rad[i] + 2 * rad[(i + 1) % n] + rad[(i + 2) % n]) / 9);
    }
    for (let i = 0; i < n; i++) pts[i].setLength(rad[i] + 0.1);
    I.ok = firm >= n * 0.8;
    I.rpk = rpk; I.rc = c.R * rpk; I.pts = pts;
    return I;
  }

  // the inked, grindable craters overlapping this one
  rimNeighbours(c) {
    const I = this.rimOf(c);
    if (I.nb) return I.nb;
    I.nb = [];
    for (const o of this.craters) {
      if (o === c || o.type === 'ghost' || o.R > RIM_INK_BIG) continue;
      const d = R * Math.acos(Math.min(1, c.d.dot(o.d)));
      if (d > (c.R + o.R) * 1.4) continue;
      const J = this.rimOf(o);
      if (!J.ok) continue;
      I.nb.push({ o, J, d });
      if (o.R >= c.R * 2 && d + I.rc < J.rc * 0.95) I.nested = true;
    }
    return I.nb;
  }

  // the grind rails along a crater's lip: one closed loop, or the open stretches of it that make up
  // part of a cluster's shared outline
  rimRailsOf(c) {
    const I = this.rimOf(c);
    if (!I.ok) return [];
    const nb = this.rimNeighbours(c);
    const pts = I.pts, n = pts.length;
    const keep = pts.map((p) => {
      if (I.nested) return true;
      for (const { o, J } of nb) {
        if (this.rimNeighbours(o) && J.nested) continue; // (nested ones don't cut the shared outline)
        if (R * Math.acos(Math.min(1, _rv.copy(p).normalize().dot(o.d))) < J.rc - 1) return false;
      }
      return true;
    });
    const rail = (list, loop) => {
      const cum = [0];
      for (let i = 1; i < list.length; i++) cum.push(cum[i - 1] + list[i].distanceTo(list[i - 1]));
      const cen = new THREE.Vector3();
      for (const q of list) cen.add(q);
      cen.divideScalar(list.length);
      let rad = 0;
      for (const q of list) rad = Math.max(rad, q.distanceTo(cen));
      return { pts: list, cum, len: cum[cum.length - 1], c: cen, rad, loop, rimOf: c };
    };
    if (keep.every(Boolean)) return [rail([...pts, pts[0].clone()], true)];
    const out = [];
    const start = keep.indexOf(false);
    let run = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (keep[i]) run.push(pts[i]);
      if (!keep[i] || k === n) { if (run.length >= 3) out.push(rail(run, false)); run = []; }
    }
    return out;
  }

  // Build the rim rails round you as you go (the Grinder calls this every half second).
  rimRailsNear(p) {
    this.rimRails ||= new Map();
    const d = _rv.copy(p).normalize();
    for (const c of this.craters) {
      if (this.rimRails.has(c) || c.type === 'ghost' || c.R > RIM_INK_BIG) continue;
      if (Math.abs(R * Math.acos(Math.min(1, d.dot(c.d))) - c.R) > 220) continue;
      this.rimRails.set(c, this.rimRailsOf(c));
    }
  }

  // Keep big rocks off these directions (the road network): set by the world once roads exist.
  keepClear(dirs, r) {
    this.clearDirs = dirs;
    this.clearCos = Math.cos(r / R);
  }

  buildBoulders(ch) {
    const rr = mulberry32((ch.f * 7919 + ch.cy * 131 + ch.cx) * 2654435761);
    const count = 4 + Math.floor(rr() * 6);
    // rocky country (ridged highlands, scarps) gets extra boulders, from a generator of their own
    this.H(ch.dir.x, ch.dir.y, ch.dir.z);
    const rock = this.attr.rock;
    const extra = Math.floor(rock * 12);
    const rx = mulberry32((ch.f * 7919 + ch.cy * 131 + ch.cx) * 2246822519 ^ 0x7ee);
    const im = new THREE.InstancedMesh(this.boulderGeo, this.boulderMat, count + extra);
    const hull = new THREE.InstancedMesh(this.boulderGeo, this.boulderInk, count + extra);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const cols = [];
    let n = 0;
    for (let t = 0; t < count + extra; t++) {
      const g0 = t < count ? rr : rx; // (the original boulders keep their own sequence)
      faceDir(ch.f, ch.cx * CH + g0() * CH, ch.cy * CH + g0() * CH, p);
      let ok = true;
      for (const zn of this.zones) if (p.dot(zn.dir) > Math.cos((zn.r * 1.5) / R)) { ok = false; break; }
      for (const zn of this.flats) if (p.dot(zn.dir) > Math.cos((zn.r * 1.5) / R)) { ok = false; break; }
      const s = 1.2 + Math.pow(g0(), 3) * 7;
      e.set(g0() * 3, g0() * 3, g0() * 3);
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
    // shaped rocks: ramps, arches, hoodoos, mesas, wave walls (rocks.js)
    const sr = shapedRocks(this, ch, (u, v, out) => faceDir(ch.f, ch.cx * CH + (0.1 + 0.8 * u) * CH, ch.cy * CH + (0.1 + 0.8 * v) * CH, out), (pt) => this.spotFree(pt), rock);
    for (const m of sr.meshes) {
      g.add(m);
      m.updateMatrix();
      m.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    }
    g.updateMatrixWorld(true);
    cols.push(...sr.cols);
    for (const r of sr.rails) this.addRail(r);
    g.matrixAutoUpdate = false;
    g.visible = false;
    this.scene.add(g);
    ch.boulders = g;
    ch.boulderSpec = cols;
  }

  // Decide per chunk what LOD to show; build missing meshes within a time budget.
  // Pick the crater crests within reach of the camera for the terrain shader's ink line: each one
  // is drawn exactly, per pixel, as a circle round its crater (worked out from vertex data it
  // followed the terrain triangles, and broke up wherever craters overlap).
  updateRimInk(camPos) {
    if (camPos.distanceToSquared(this.rimInkAt) < 40 * 40) return;
    const cd = _rv.copy(camPos).normalize();
    const near = [];
    for (const c of this.craters) {
      if (c.type === 'ghost' || c.R > RIM_INK_BIG || c.R < 24) continue;
      const gap = Math.abs(R * Math.acos(Math.min(1, cd.dot(c.d))) - c.R);
      if (gap < RIM_INK_REACH) near.push({ c, gap });
    }
    near.sort((a, b) => a.gap - b.gap);
    // measuring a lip takes about a millisecond: a few dozen at most per frame, nearest first
    // (the rest come in over the next frames, out at the far end of the ink's reach)
    const t0 = performance.now();
    let done = true;
    const U = this.holeU.uRimC.value;
    let n = 0;
    for (const { c } of near) {
      if (n >= RIM_INK_MAX) break;
      if (!this.rimInfo?.has(c) && performance.now() - t0 > 6) { done = false; continue; }
      const I = this.rimOf(c);
      if (!I.ok) continue;
      this.rimNeighbours(c);
      U[n++].set(c.d.x * R, c.d.y * R, c.d.z * R, I.nested ? -I.rc : I.rc);
    }
    this.holeU.uRimN.value = n;
    if (done) this.rimInkAt.copy(camPos);
  }

  update(camPos, { budgetMs = 5, maxDist = 3200 } = {}) {
    this.updateRimInk(camPos);
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
      if (d < limit) want = dl < 130 ? 0 : dl < 260 ? 1 : dl < 800 ? 2 : dl < 1700 ? 3 : 4;
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
      const near = want >= 0 && want <= 2;
      if (near && !ch.boulders) this.buildBoulders(ch);
      if (ch.boulders) ch.boulders.visible = near;
      const active = want >= 0 && want <= 1;
      if (active && !ch.boulderCols && this.colliders) ch.boulderCols = ch.boulderSpec.map((c) => this.colliders.add(c));
      if (!active && ch.boulderCols) { for (const c of ch.boulderCols) this.colliders.remove(c); ch.boulderCols = null; }
      // free detailed meshes that are no longer needed (the trailer keeps them all: no rebuilds at its cuts)
      for (let l = 0; l < 3 && !this.keep; l++) {
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
