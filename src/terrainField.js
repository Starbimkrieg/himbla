import * as THREE from 'three';
import { PLANET } from './config.js';
import { mulberry32, createNoise3D, smoothstep, clamp } from './rng.js';
import { SUN, darkness } from './geo.js';

// The Moon's terrain as pure maths: the height field (base noise, landforms, craters, rilles, plateaus)
// and chunk mesh data as plain arrays. No scene or DOM, so it runs in the terrain workers (terrainWorker.js)
// and on the main thread (Planet extends it for physics, chunks, boulders, rims). Same seed and plateaus
// give bit-identical heights, so worker chunks and main-thread physics agree.

export const N = PLANET.faceCells;
export const CH = PLANET.chunkCells;
export const CPF = N / CH;
const QP = Math.PI / 4;
export const N1 = N + 1;
export const R = PLANET.radius;
export const MAX_LOD = 4; // level 0: the ~4.4 m grid near you; each level halves the resolution

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
export function dirToGrid(x, y, z, o) {
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
const NO_FLATS = []; // (stands in for every flat bucket while fitZone measures native ground)

// Hue tints for the painted Moon: r, g, b multipliers (brightness restored afterwards)
const TINT_COOL = [0.9, 0.96, 1.16]; // maria: blue-grey
const TINT_TAN = [1.13, 0.99, 0.83]; // iron-bearing plains: tan
const TINT_BUFF = [1.1, 0.99, 0.86]; // ridges and scarps: buff
const TINT_RUST = [1.2, 0.97, 0.78]; // rilles: oxidised, rusty brown
const TINT_OLD = [1.08, 1.0, 0.86]; // old worn craters: dull brown
function tint(c, t, k) {
  if (k <= 0) return;
  c.r *= 1 + (t[0] - 1) * k; c.g *= 1 + (t[1] - 1) * k; c.b *= 1 + (t[2] - 1) * k;
}
const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

export class TerrainField {
  constructor(zones, seed = PLANET.seed) {
    const rand = mulberry32(seed);
    this.nA = createNoise3D(rand);
    this.nB = createNoise3D(rand);
    this.nC = createNoise3D(rand);
    this.zones = zones;
    for (const z of zones) {
      // (a plane fitted on the main thread arrives as zrSet: workers never refit, so can't disagree)
      z.zr = z.zrSet ?? R + this.base(z.dir.x * R, z.dir.y * R, z.dir.z * R, darkness(z.dir));
      // (flat radius: flatR can exceed r; none does yet, and planet.js rock keep-outs still read r)
      z.fr = z.flatR || z.r;
      z.cosFlat = Math.cos((z.fr * 1.95) / R);
    }
    this.cache = new Map();
    this.attr = { floor: 0, rim: 0, ray: 0, rock: 0, rille: 0, crest: 0, ejecta: 0, old: 0 };
    // painted look (maria, white crests, gravel blankets): PLANET.painted and the settings toggle
    this.painted = PLANET.painted !== false;
    this.makeCraters(rand);
    for (const z of zones) if (z.fit && z.zrSet === undefined) this.fitZone(z); // (needs craters and flat buckets)
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
          // far side more heavily cratered
          if (rand() > 0.55 + 0.45 * darkness(d)) continue;
          const Rc = rMin + (rMax - rMin) * rand();
          let ok = true;
          for (const zn of this.zones) {
            if (zn.late) continue; // added after crater layout (see locations.js)
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
    // bucket craters by chunk so each sample checks only nearby ones
    const nb = 6 * CPF * CPF;
    this.buckets = Array.from({ length: nb }, () => []);
    const centers = [];
    for (let f = 0; f < 6; f++) for (let cy = 0; cy < CPF; cy++) for (let cx = 0; cx < CPF; cx++) {
      centers.push(faceDir(f, (cx + 0.5) * CH, (cy + 0.5) * CH, new THREE.Vector3()));
    }
    const bucketR = CH * (R * Math.PI / 2 / N) * 0.85;
    this.bucketCenters = centers;
    this.bucketR = bucketR;
    this.flats = []; // later plateaus (outposts), bucketed like craters so H stays cheap
    this.flatBuckets = Array.from({ length: nb }, () => []);
    for (const c of list) {
      const cosLim = Math.cos((c.infl + bucketR) / R);
      for (let k = 0; k < nb; k++) if (centers[k].dot(c.d) > cosLim) this.buckets[k].push(c);
    }
  }

  // A crater's character, from its own index-seeded generator so the layout (and the lakes, roads and
  // outposts placed around it) doesn't move:
  //   bowl      classic smooth rim
  //   rampart   tall firm rim standing off the plain, steep inner wall
  //   jagged    rim swelling and dipping in broad lobes
  //   ghost     old, worn almost flat
  //   terraced  big ones only: stepped inner walls, central peak
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
      // (broad lobes, not spikes, despite the name)
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
    // firm lip and proper dip on every crater not worn away
    if (c.type !== 'ghost') { c.rim *= 1.85; c.depth *= 1.15; }
    // no narrower than the ~4.4 m grid draws smoothly: sharper crests crease along triangle edges and
    // the comic pass inks them as saw-teeth
    c.inW = Math.max(c.inW, 12 / c.R);
    c.outW = Math.max(c.outW, 16 / c.R);
    // crest rounding: taller lips get rounder tops so they never curve tighter than the grid can draw
    // (a sharp crest zigzags along the grid, and a low sun casts it as saw-teeth down the inner wall)
    const peak = c.rim * (1 + c.jag);
    c.kIn = Math.max(18, (5 * peak) / (0.1 * c.inW * c.R));
    c.kOut = Math.max(18, (5 * peak) / (0.1 * c.outW * c.R));
    if (c.jf) c.jf = Math.max(2, Math.min(c.jf, Math.floor((2 * Math.PI * c.R) / 70)));
  }

  // Regional landforms over the base terrain, each in its own patches (very low-frequency mask: ~12% of
  // the Moon each, rilles ~18%), so over half stays smooth cratered plain:
  //   ridged highlands: sharp crests               scarps: stepped ledges (lunar lobate scarps)
  //   rilles: winding channels                     hills: long rolling slopes
  // Writes this.attr.rock (rocky tint, extra boulders), this.attr.rille and this.attr.crest.
  features(x, y, z) {
    const A = this.nA, B = this.nB, C = this.nC;
    let h = 0, rock = 0, rille = 0, crest = 0;
    const mRidge = smoothstep(0.49, 0.69, C(x * 0.00032 + 40, y * 0.00032, z * 0.00032 - 12));
    if (mRidge > 0) {
      // long ridges with crisp but rounded crests: softened ridged noise
      const nv = A(x * 0.0026 + 3, y * 0.0026, z * 0.0026);
      const n1 = 1 - Math.sqrt(nv * nv + 0.012) + 0.11;
      h += mRidge * (n1 * n1 * 40 + B(x * 0.006, y * 0.006 + 9, z * 0.006) * 5 - 12);
      rock = mRidge * smoothstep(0.6, 0.9, n1);
      crest = mRidge * smoothstep(0.95, 0.995, n1); // (ridge top)
    }
    const mScarp = smoothstep(0.46, 0.66, C(x * 0.0004 - 21, y * 0.0004 + 6, z * 0.0004));
    if (mScarp > 0) {
      // stepped ledges (lunar lobate scarps): rideable ramps, not walls (a narrow noise band would
      // make sheer jagged cliffs)
      const sv = A(x * 0.0011 - 8, y * 0.0011, z * 0.0011 + 15) + 0.25 * B(x * 0.004, y * 0.004, z * 0.004);
      h += mScarp * 20 * (smoothstep(-0.09, 0.09, sv) + smoothstep(0.26, 0.44, sv));
      rock = Math.max(rock, mScarp * (1 - Math.min(1, Math.abs(sv) / 0.09)) * 0.45);
      // (lip at each step's top)
      crest = Math.max(crest, mScarp * Math.max(1 - Math.abs(sv - 0.09) / 0.035, 1 - Math.abs(sv - 0.44) / 0.035, 0) * 0.8);
    }
    const mRille = smoothstep(0.32, 0.52, C(x * 0.00038 + 77, y * 0.00038 - 3, z * 0.00038 + 31));
    if (mRille > 0) {
      // wide deep U channel (gaussian profile: no bottom crease, no lips). H() carves it last, after
      // the craters, so it runs unbroken through everything.
      const sv = B(x * 0.0014 + 5, y * 0.0014 - 5, z * 0.0014) / 0.13;
      rille = mRille * Math.exp(-sv * sv);
    }
    const mHills = smoothstep(0.51, 0.71, B(x * 0.0003 - 50, y * 0.0003 + 20, z * 0.0003));
    if (mHills > 0) h += mHills * A(x * 0.0021, y * 0.0021 + 33, z * 0.0021) * 34;
    this.attr.rock = rock;
    this.attr.rille = rille;
    this.attr.crest = crest;
    return h;
  }

  // Base height at a crater's middle (for its level apron). Must not disturb the attributes of the
  // point H() is mid-way through.
  craterBase(c) {
    const rock = this.attr.rock, rille = this.attr.rille, crest = this.attr.crest;
    const x = c.d.x * R, y = c.d.y * R, z = c.d.z * R;
    c.hf = this.features(x, y, z);
    const hb = this.base(x, y, z, darkness(c.d));
    this.attr.rock = rock; this.attr.rille = rille; this.attr.crest = crest;
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
    // smooth rille floors: cancel the base's small bumps in the channel
    const rl = this.attr.rille;
    // (the floor undulates but has no fine rubble: under a low sun each bump casts a speck, stippling the rille)
    if (rl > 0.01) h -= rl * (this.nB(x * 0.005, y * 0.005, z * 0.005) * 6 * (1 + far * 0.6) + this.nA(x * 0.02, y * 0.02, z * 0.02) * 0.25);
    dirToGrid(dx, dy, dz, _g);
    const cx = Math.min(CPF - 1, Math.floor(_g.i / CH)), cy = Math.min(CPF - 1, Math.floor(_g.j / CH));
    const bucket = this.buckets[(_g.f * CPF + cy) * CPF + cx];
    let floorA = 0, rimA = 0, rayA = 0, ejA = 0, oldA = 0;
    for (let k = 0; k < bucket.length; k++) {
      const c = bucket[k];
      const dot = dx * c.d.x + dy * c.d.y + dz * c.d.z;
      if (dot < c.cosInfl) continue;
      const r = (R * Math.acos(Math.min(1, dot))) / c.R;
      // each crater sits on a level apron (nearby small bumps eased toward its centre height) so its
      // lip reads clearly; big landforms (hills, ridges, scarps) are eased only a little, keeping their shape
      if (r < 2.2 && c.type !== 'ghost') {
        if (c.hb === undefined) c.hb = this.craterBase(c);
        const w = 1 - smoothstep(1.15, 2.2, r);
        h += (c.hb - hB) * 0.85 * w + (c.hf - hF) * 0.35 * w;
      }
      if (r < 2.3) {
        if (r < 1) {
          let rb = r;
          if (c.terr) {
            // stepped inner walls: radius quantised into soft stairs
            const t = r * c.terr, fl = Math.floor(t);
            rb = (fl + smoothstep(0.25, 0.75, t - fl)) / c.terr;
          }
          // bowl wall eases flat into the rim (a plain (r^2 - 1) wall kinks the crest into a grid saw-tooth)
          // and bottoms out in a flat floor
          const bw = 1 - rb * rb;
          h -= c.depth * Math.min(0.82, 1.6 * bw * bw);
          if (c.peak) { const pq = r / 0.2; h += c.peak * Math.exp(-pq * pq); }
          floorA = Math.max(floorA, smoothstep(1.0, 0.35, r));
        }
        let rimH = c.rim;
        if (c.jag) {
          // rim height swings round the circle
          const ang = Math.atan2(dx * c.e2.x + dy * c.e2.y + dz * c.e2.z, dx * c.e1.x + dy * c.e1.y + dz * c.e1.z);
          const w = 0.5 + 0.5 * Math.sin(ang * c.jf + c.jp);
          rimH *= 1 - c.jag + c.jag * 2 * w;
        }
        const q = (r - 1) / (r < 1 ? c.inW : c.outW);
        const rimT = Math.exp(-q * q);
        // lip: a quarter-pipe both sides, steepening to the crest like a kicker (the crest is the grind
        // rail), top rounded off (craterType's kIn/kOut)
        const dm = (r - 1) * c.R, k = r < 1 ? c.kIn : c.kOut, e = Math.sqrt(dm * dm + k * k) - k;
        const x = Math.min(1, e / ((r < 1 ? c.inW : c.outW) * c.R));
        h += rimH * (1 - x) * (1 - x);
        if (rimT > rimA) rimA = rimT;
      }
      if (c.type === 'ghost' && r < 1.5) oldA = Math.max(oldA, 1 - smoothstep(0.9, 1.5, r)); // (worn old crater and just round it)
      // ejecta blanket: gravel ring just outside the rim, ragged outer edge
      if (r > 0.95 && r < 2.3 && c.type !== 'ghost' && c.R > 30) {
        const edge = 1.5 + 0.32 * this.nC(x * 0.011 + c.R, y * 0.011, z * 0.011) + (c.R > 150 ? 0.15 : 0);
        ejA = Math.max(ejA, smoothstep(0.98, 1.12, r) * (1 - smoothstep(edge - 0.12, edge + 0.04, r)));
      }
      if (c.rays >= 0 && r > 1.05 && r < 4.2) {
        const ang = Math.atan2(dx * c.e2.x + dy * c.e2.y + dz * c.e2.z, dx * c.e1.x + dy * c.e1.y + dz * c.e1.z);
        // (five broad soft streaks: thin hairlines break up into a web of pale spokes on coarse far LODs)
        const ray = Math.pow(Math.abs(Math.sin(ang * 2.5 + c.rays)), 4) * smoothstep(1.05, 1.5, r) * (1 - smoothstep(1.7, 4.2, r)) * 0.8;
        rayA = Math.max(rayA, ray * (0.6 + 0.4 * this.nC(x * 0.01, y * 0.01, z * 0.01)));
      }
    }
    h -= rl * 18; // rilles carve through everything, rims included
    let rad = R + h;
    for (let k = 0; k < this.zones.length; k++) {
      const zn = this.zones[k];
      const dot = dx * zn.dir.x + dy * zn.dir.y + dz * zn.dir.z;
      if (dot < zn.cosFlat) continue;
      const d = R * Math.acos(Math.min(1, dot));
      // plateau: a true plane in the settlement's frame (a `curved` place gets a sphere cap at that height,
      // so nothing on it leans off the local up; see downsKit.js makeBend)
      const t = smoothstep(zn.fr, zn.fr * 1.95, d);
      const pl = zn.curved ? zn.zr : zn.zr / dot;
      rad = pl + (rad - pl) * t;
      floorA *= t; rimA *= t; rayA *= t; ejA *= t; oldA *= t; this.attr.rock *= t; this.attr.rille *= t; this.attr.crest *= t;
    }
    const fb = this.flatBuckets[(_g.f * CPF + cy) * CPF + cx];
    for (let k = 0; k < fb.length; k++) {
      const zn = fb[k];
      const dot = dx * zn.dir.x + dy * zn.dir.y + dz * zn.dir.z;
      if (dot < zn.cosFlat) continue;
      const d = R * Math.acos(Math.min(1, dot));
      const t = smoothstep(zn.r, zn.r * 1.95, d);
      rad = zn.zr / dot + (rad - zn.zr / dot) * t;
      floorA *= t; rimA *= t; rayA *= t; ejA *= t; oldA *= t; this.attr.rock *= t; this.attr.rille *= t; this.attr.crest *= t;
    }
    this.attr.floor = floorA; this.attr.rim = rimA; this.attr.ray = rayA; this.attr.ejecta = ejA; this.attr.old = oldA;
    return rad;
  }

  // (plateau records only: Planet.addFlat / addZone also rebuild chunks)
  addFlatData(d, r, zr) {
    if (this.flats.some((z) => z.dir.dot(d) > 0.999999)) return null;
    const zn = { dir: d, r, zr, cosFlat: Math.cos((r * 1.95) / R), flatOnly: true };
    this.flats.push(zn);
    // only buckets the plateau can reach test it in H
    const cosB = Math.cos((r * 1.95 + this.bucketR) / R);
    for (let k = 0; k < this.flatBuckets.length; k++) if (this.bucketCenters[k].dot(d) > cosB) this.flatBuckets[k].push(zn);
    return zn;
  }

  // (inverse of addFlatData: an outpost's plateau goes when a town grows over it)
  removeFlatData(d) {
    const k = this.flats.findIndex((z) => z.dir.dot(d) > 0.999999);
    if (k < 0) return false;
    const zn = this.flats.splice(k, 1)[0];
    for (const b of this.flatBuckets) { const i = b.indexOf(zn); if (i >= 0) b.splice(i, 1); }
    this.cache.clear();
    return true;
  }

  addZoneData(z) {
    z.zr = z.zrSet ?? R + this.base(z.dir.x * R, z.dir.y * R, z.dir.z * R, darkness(z.dir));
    z.fr = z.flatR || z.r;
    z.cosFlat = Math.cos((z.fr * 1.95) / R);
    if (z.fit && z.zrSet === undefined) this.fitZone(z);
    if (!this.zones.includes(z)) this.zones.push(z);
    this.cache.clear();
  }

  // A town's plane = mean height of the NATIVE ground under its footprint (craters and landforms; no
  // plateaus or flats), not base() noise, which ignores both. So the plateau cuts high ground and fills
  // low, and the hall never hangs over a bowl or sinks into a hill. Rings every 10 m to rFit (plots
  // reach 77.5 m), samples area-weighted. Fitted once on the main thread; workers get zrSet and never
  // refit, so they can't disagree with physics.
  fitZone(z, rFit = 80) {
    const zones = this.zones, fb = this.flatBuckets;
    this.zones = [];
    this.flatBuckets = new Array(fb.length).fill(NO_FLATS);
    try {
      const d = z.dir;
      const t1 = _a.set(1, 0, 0).addScaledVector(d, -d.x);
      if (t1.lengthSq() < 1e-4) t1.set(0, 1, 0).addScaledVector(d, -d.y);
      t1.normalize();
      const t2 = _b.crossVectors(d, t1);
      let sum = 0, w = 0;
      for (let r = 0; r <= rFit; r += 10) {
        const n = r ? Math.max(8, Math.round(2 * Math.PI * r / 10)) : 1;
        // (each ring weighs its 10 m band's area, shared over its samples; the centre stands for a 5 m disc
        // and the outer ring only for the 5 m inside rFit, so ground just outside the footprint doesn't pull the plane)
        const hi = Math.min(r + 5, rFit), lo = r - 5;
        const ww = r ? (hi * hi - lo * lo) / (20 * n) : 1.25;
        for (let i = 0; i < n; i++) {
          const a = i / n * 2 * Math.PI;
          _c.copy(d).multiplyScalar(R).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize();
          sum += this.H(_c.x, _c.y, _c.z) * (z.curved ? 1 : _c.dot(d)) * ww;
          w += ww;
        }
      }
      z.zr = z.zrSet = sum / w; // (~230 samples, under a millisecond)
    } finally { this.zones = zones; this.flatBuckets = fb; }
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

  // One chunk's mesh data at a LOD as plain arrays, so a worker builds it (terrainWorker.js) and the
  // main thread only uploads. `inside`: the grid's exact radii (physics cache: Planet.fillCache).
  computeChunk(f, cx, cy, flip, lod) {
    const s = 1 << lod;
    const m = CH / s;
    const vn = m + 1;
    const nGrid = vn * vn;
    const nSkirt = 4 * m;
    const pos = new Float32Array((nGrid + nSkirt) * 3);
    const nor = new Float32Array((nGrid + nSkirt) * 3);
    const col = new Float32Array((nGrid + nSkirt) * 3);
    const rim = new Float32Array(nGrid + nSkirt);
    const tintA = new Float32Array((nGrid + nSkirt) * 3); // (mineral tint alone: the shader can strengthen it)
    const i0 = cx * CH, j0 = cy * CH;
    const radiiIn = new Float32Array(vn * vn); // (exact grid radii, for the physics cache)
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
          const li = b * vn + a;
          radiiIn[li] = r;
          rim[li] = this.attr.rim;
          const x = _d.x * R, y = _d.y * R, z = _d.z * R;
          const mm = smoothstep(-0.25, 0.35, this.nB(x * 0.0007 + 11, y * 0.0007, z * 0.0007 - 5));
          // classic colours first, same in both looks
          c.copy(highland).lerp(mare, mm);
          c.lerp(floorC, this.attr.floor * 0.7);
          c.lerp(rimC, this.attr.rim * 0.6);
          c.lerp(rayC, this.attr.ray * 0.7);
          c.lerp(rockC, this.attr.rock * 0.55);
          c.lerp(rilleC, this.attr.rille * 0.5);
          if (this.painted) {
            // mineral tints: hue only, brightness kept (a tint never reads as shadow; shadows keep contrast)
            const lum0 = lum(c);
            const c0r = c.r, c0g = c.g, c0b = c.b;
            // (A) broad regions a touch cooler (blue-grey maria) or warmer (tan, iron-bearing)
            const reg = this.nC(x * 0.00042 - 31, y * 0.00042 + 7, z * 0.00042 + 19) + 0.35 * this.nA(x * 0.0016 + 5, y * 0.0016, z * 0.0016 - 9);
            const cool = smoothstep(0.12, 0.45, reg), warm = smoothstep(0.12, 0.45, -reg);
            tint(c, TINT_COOL, cool * 0.75);
            tint(c, TINT_TAN, warm * 0.8);
            // (C) by ground type: buff ridges and scarp steps, rusty rilles, cleaner grey on fresh rims and
            // gravel, dull brown in old craters
            tint(c, TINT_BUFF, this.attr.rock * 0.9);
            tint(c, TINT_RUST, this.attr.rille * 0.9);
            tint(c, TINT_OLD, this.attr.old * 0.85);
            const fresh = Math.max(this.attr.rim * 0.7, this.attr.ejecta * 0.45);
            if (fresh > 0) { const g = lum(c); c.r += (g - c.r) * fresh; c.g += (g - c.g) * fresh; c.b += (g - c.b) * fresh; }
            // restore brightness exactly
            const lum1 = lum(c);
            if (lum1 > 1e-4) c.multiplyScalar(lum0 / lum1);
            tintA[li * 3] = c.r - c0r; tintA[li * 3 + 1] = c.g - c0g; tintA[li * 3 + 2] = c.b - c0b;
          }
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
        // (gentle: hard darkening on steep walls tips into the halftone as saw-toothed patches)
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
      for (let q = 0; q < 3; q++) { nor[si * 3 + q] = nor[li * 3 + q]; col[si * 3 + q] = col[li * 3 + q] * 0.8; tintA[si * 3 + q] = tintA[li * 3 + q]; }
      rim[si] = 0;
    });
    const idx = new Uint32Array(m * m * 6 + edge.length * 12);
    let k = 0;
    for (let b = 0; b < m; b++) {
      for (let a = 0; a < m; a++) {
        const p00 = b * vn + a, p10 = p00 + 1, p01 = p00 + vn, p11 = p01 + 1;
        // must match surface()'s split: along whichever diagonal follows the ground (a fixed diagonal
        // zigzags slanted crater crests, which a low sun stretches into teeth along the rim shadow)
        const q = (b + 1) * (vn + 2) + (a + 1);
        const d0 = Math.abs(radii[q] - radii[q + vn + 3]), d1 = Math.abs(radii[q + 1] - radii[q + vn + 2]);
        if (d0 <= d1) {
          if (!flip) { idx[k++] = p00; idx[k++] = p10; idx[k++] = p11; idx[k++] = p00; idx[k++] = p11; idx[k++] = p01; }
          else { idx[k++] = p00; idx[k++] = p11; idx[k++] = p10; idx[k++] = p00; idx[k++] = p01; idx[k++] = p11; }
        } else if (!flip) { idx[k++] = p00; idx[k++] = p10; idx[k++] = p01; idx[k++] = p10; idx[k++] = p11; idx[k++] = p01; }
        else { idx[k++] = p00; idx[k++] = p01; idx[k++] = p10; idx[k++] = p10; idx[k++] = p01; idx[k++] = p11; }
      }
    }
    for (let e = 0; e < edge.length; e++) {
      const a0 = edge[e], a1 = edge[(e + 1) % edge.length];
      const s0 = nGrid + e, s1 = nGrid + ((e + 1) % edge.length);
      // both windings: skirts are seen from either side
      idx[k++] = a0; idx[k++] = s0; idx[k++] = a1; idx[k++] = a1; idx[k++] = s0; idx[k++] = s1;
      idx[k++] = a0; idx[k++] = a1; idx[k++] = s0; idx[k++] = a1; idx[k++] = s1; idx[k++] = s0;
    }
    return { pos, nor, col, rim, tint: tintA, idx, inside: radiiIn };
  }
}
