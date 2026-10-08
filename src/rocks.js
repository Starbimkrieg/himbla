import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ink, gradientMap } from './toon.js';
import { mulberry32, createNoise3D } from './rng.js';

// Shaped rocks scattered over the Moon between the ordinary lumpy boulders: each has a feature
// you can play with, and colliders that follow its shape.
//   ramp    a weathered slab sloping up to a clean edge: a natural kicker
//   arch    two legs and a lintel: skate through it (or over it)
//   hoodoo  a tall eroded spire with a cap rock balanced on top
//   snake   a long (35-50 m), gently winding ridge of steep rhombus section with a thin crest
//           that follows the ground: land on the crest and you grind it (rails.js)
// Built per terrain chunk (planet.buildBoulders), from the chunk's own seed, so they're always in
// the same places.

const KINDS = ['ramp', 'ramp', 'arch', 'hoodoo', 'snake', 'snake'];
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const m = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() });
  MATS = { grey: m(0x8d8898), basalt: m(0x6e6a7a), tan: m(0xa59886), pale: m(0xb8b2c4), dark: m(0x5f5a6c) };
  return MATS;
}

const N3 = createNoise3D(mulberry32(4242));
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

// ---------------- geometry ----------------

// Sweep a closed 2D profile through a list of stations. frame(i) gives { o, ax, ay } (origin and the
// two axes the profile's (a, b) map onto) and prof(i) the profile there. Capped at both ends.
function sweep(n, frame, prof) {
  const pos = [], idx = [];
  let m = 0;
  for (let i = 0; i < n; i++) {
    const { o, ax, ay } = frame(i);
    const pr = prof(i);
    m = pr.length;
    for (const [a, b] of pr) pos.push(o.x + ax.x * a + ay.x * b, o.y + ax.y * a + ay.y * b, o.z + ax.z * a + ay.z * b);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
    const a = i * m + j, b = i * m + (j + 1) % m, c = (i + 1) * m + (j + 1) % m, d = (i + 1) * m + j;
    idx.push(a, b, c, a, c, d);
  }
  for (const i of [0, n - 1]) {
    const tri = THREE.ShapeUtils.triangulateShape(prof(i).map(([a, b]) => new THREE.Vector2(a, b)), []);
    for (const [a, b, c] of tri) { if (i === 0) idx.push(i * m + a, i * m + c, i * m + b); else idx.push(i * m + a, i * m + b, i * m + c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return fixWinding(g);
}

// Make faces point outward (profiles can come in either winding).
function fixWinding(g) {
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  const p = g.attributes.position, ix = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), nrm = new THREE.Vector3();
  let score = 0;
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]); b.fromBufferAttribute(p, ix[i + 1]); d.fromBufferAttribute(p, ix[i + 2]);
    nrm.subVectors(b, a).cross(d.sub(a));
    score += nrm.dot(a.add(b).multiplyScalar(0.5).sub(c));
  }
  if (score < 0) for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  return g;
}

// Rough it up: push each vertex along its normal by layered noise plus a little banding (strata
// ledges), scaled by amp(v) (0 keeps a vertex exact). Returns flat-faceted geometry: chiselled rock.
function roughen(geo, amp, seed, strata = 0.25) {
  // positions only (uv / normal seams would split vertices and crack open when displaced)
  const bare = new THREE.BufferGeometry();
  bare.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) bare.setIndex(geo.index.clone());
  geo = mergeVertices(bare, 1e-3);
  geo.computeVertexNormals();
  const p = geo.attributes.position, nr = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = amp(v);
    if (!a) continue;
    _n.fromBufferAttribute(nr, i);
    const f = N3(v.x * 0.16 + seed, v.y * 0.16, v.z * 0.16) + 0.5 * N3(v.x * 0.42, v.y * 0.42 + seed, v.z * 0.42) + 0.28 * N3(v.x * 1.1, v.y * 1.1, v.z * 1.1 - seed);
    const band = strata * Math.max(0, Math.sin(v.y * 2.1 + N3(v.x * 0.08, seed, v.z * 0.08) * 2.5));
    v.addScaledVector(_n, a * (f + band));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const out = geo.toNonIndexed();
  out.deleteAttribute('normal');
  out.computeVertexNormals();
  return out;
}

// A few loose boulders (rubble) for the foot of a formation, already roughened. pts: [x, y, z, r]
function rubble(pts, seed) {
  return pts.map(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.75, 1.1).translate(x, y, z);
    return roughen(g, () => r * 0.25, seed + i * 3.1, 0);
  });
}

// ---------------- colliders ----------------

// A collider box in the rock's local frame (centre lx,ly,lz, half sizes, optional pitch about x).
function box(p, q, lx, ly, lz, hx, hy, hz, pitch = 0) {
  _q2.copy(q);
  if (pitch) _q2.multiply(_q.setFromAxisAngle(AX, pitch));
  return {
    type: 'box', c: p.clone().add(_v.set(lx, ly, lz).applyQuaternion(q)),
    ax: AX.clone().applyQuaternion(_q2), ay: AY.clone().applyQuaternion(_q2), az: AZ.clone().applyQuaternion(_q2), hx, hy, hz,
  };
}
function cyl(p, q, lx, lz, y0, y1, r) {
  return { type: 'cyl', c: p.clone().add(_v.set(lx, 0, lz).applyQuaternion(q)), axis: AY.clone().applyQuaternion(q), y0, y1, r };
}

// ---------------- the rocks ----------------

// Build one shaped rock (p = ground point, q = local frame): { mesh, cols, rail? } in world space.
function build(kind, rr, p, q, planet, dims = null) {
  const M = mats();
  const seed = rr() * 100;
  let geo, mat, cols = [], rail = null, worldGeo = false;
  if (kind === 'ramp') {
    // a weathered slab: rough flanks, a broken lip, rubble at its feet; the riding middle stays smooth-ish
    // (placed by its tail: p is the ground at the tail end, so you roll straight on; dims.drop is how
    // far the ground falls away under the rest of it, which the front face reaches down to)
    const { L, W, h, drop } = dims;
    const slope = (z) => h * (z / L + 0.5);
    const tail = 4, under = Math.max(0.8 + drop, (h / L) * tail + 0.6); // the slope runs on back into the ground for a few metres
    const prof = [[-L / 2 - tail, -under], [L / 2 + 0.4, -under], [L / 2 + 0.5, h * 0.45], [L / 2 + 0.15, slope(L / 2) - 0.1]];
    for (let k = 0; k <= 10; k++) { const z = L / 2 - (k / 10) * L; prof.push([z, slope(z)]); }
    prof.push([-L / 2 - tail, -(h / L) * tail]);
    const n = 11;
    geo = sweep(n, (i) => ({ o: _o.set(-W / 2 + (i / (n - 1)) * W, 0, 0), ax: AZ, ay: AY }), (i) => {
      // shoulders fall away at the sides so it reads as a rock, not a block
      const t = Math.sin(Math.PI * (i / (n - 1)));
      const k = 0.55 + 0.45 * Math.pow(t, 0.45);
      return prof.map(([a, b]) => [a * (0.92 + 0.08 * t), b < 0 ? b : b * k]);
    });
    geo = roughen(geo, (v) => (Math.abs(v.x) < W * 0.32 && v.y > slope(v.z) - 0.8 && v.z < L / 2 + 0.05 ? 0.08 : 0.55), seed, 0.3);
    geo = mergeGeometries([geo, ...rubble([[W * 0.45, 0.3 - drop * 0.5, L * 0.3, 1.2], [-W * 0.5, 0.2 - drop * 0.3, -L * 0.1, 1.5], [W * 0.15, 0.2 - drop, L / 2 + 1.6, 1.0], [-W * 0.3, 0.3 - drop, L / 2 + 1.2, 1.4]], seed)]);
    mat = rr() < 0.5 ? M.basalt : M.dark;
    const pitch = -Math.atan2(h, L), sl = Math.hypot(L, h) + tail * 1.02;
    // the riding surface: a thin box whose top face is the slope, running on into the ground at the tail
    const sa = Math.sin(-pitch), ca = Math.cos(-pitch), back = (tail * 1.02) / 2;
    cols.push(box(p, q, 0, h / 2 - 0.5 * ca - back * sa, 0.5 * sa - back * ca, W * 0.36, 0.5, sl / 2, pitch));
    // the sheer front face, kept below the riding slope (its top used to poke up and act as a lip)
    cols.push(box(p, q, 0, (h - 0.7 - under) / 2, L / 2 - 0.1, W * 0.4, (h - 0.7 + under) / 2, 0.45));
  } else if (kind === 'arch') {
    const span = 7 + rr() * 5, H = 6 + rr() * 4, leg = 2.4 + rr() * 1.2, dep = 3 + rr() * 2, lt = 2 + rr() * 1.2;
    const parts = [];
    for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(leg, H, dep, 2, 6, 2).translate(s * (span / 2 + leg / 2), H / 2, 0));
    parts.push(new THREE.BoxGeometry(span + leg * 2 + 1, lt, dep * 0.9, 8, 2, 2).translate(0, H + lt / 2 - 0.3, 0));
    geo = roughen(mergeGeometries(parts), () => 0.45, seed, 0.2);
    mat = rr() < 0.5 ? M.tan : M.grey;
    for (const s of [-1, 1]) cols.push(box(p, q, s * (span / 2 + leg / 2), H / 2, 0, leg / 2 + 0.2, H / 2, dep / 2 + 0.2));
    cols.push(box(p, q, 0, H + lt / 2 - 0.3, 0, span / 2 + leg + 0.5, lt / 2 + 0.2, dep * 0.45 + 0.2));
  } else if (kind === 'hoodoo') {
    const H = 8 + rr() * 7, r0 = 2.2 + rr() * 1.2;
    const prof = [[r0 * 1.25, -0.5], [r0, H * 0.2], [r0 * 0.62, H * 0.5], [r0 * 0.5, H * 0.75], [r0 * 0.7, H * 0.92], [r0 * 0.6, H]];
    const body = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 9, rr());
    const cap = new THREE.SphereGeometry(1, 9, 6).scale(r0 * 1.5, r0 * 0.6, r0 * 1.3).translate(r0 * 0.15, H + r0 * 0.35, 0);
    geo = mergeGeometries([roughen(body, () => 0.35, seed, 0.25), roughen(cap, () => 0.3, seed + 1, 0)]);
    mat = M.tan;
    cols.push(cyl(p, q, 0, 0, -1, H * 0.55, r0 * 0.95));
    cols.push(cyl(p, q, 0, 0, H * 0.55, H - 0.2, r0 * 0.62));
    cols.push(cyl(p, q, r0 * 0.15, 0, H - 0.2, H + r0 * 0.8, r0 * 1.35));
  } else if (kind === 'snake') {
    // a long ridge snaking gently over the ground (river-like bends, never doubling back), its
    // crest a constant height above the terrain: the grind rail
    const len = 35 + rr() * 15, H = 2.2 + rr() * 0.9, w = 1.3 + rr() * 0.3;
    const A = 2 + rr() * 2.5, kw = (Math.PI * 2) / (26 + rr() * 16), ph = rr() * 6.28;
    const right = AX.clone().applyQuaternion(q), fwd = AZ.clone().applyQuaternion(q);
    const n = Math.ceil(len / 1.6) + 1;
    const base = [], ups = [];
    for (let i = 0; i < n; i++) {
      const s = -len / 2 + (i / (n - 1)) * len;
      const d = p.clone().addScaledVector(fwd, s).addScaledVector(right, A * Math.sin(s * kw + ph));
      const gp = planet.ground(d, new THREE.Vector3());
      base.push(gp);
      ups.push(gp.clone().normalize());
    }
    const tang = (i) => base[Math.min(n - 1, i + 1)].clone().sub(base[Math.max(0, i - 1)]).normalize();
    const side = (i) => new THREE.Vector3().crossVectors(tang(i), ups[i]).normalize();
    // the ends slope down to meet the ground over the last ~6 m: slide straight into a tip and
    // you're on the rail
    const taper = (i) => Math.min(1, Math.min(i, n - 1 - i) / 4);
    const crest = (i) => { const t = taper(i); return 0.12 + (H - 0.12) * t * t * (3 - 2 * t); };
    const prof = (i) => {
      const k = 0.3 + 0.7 * taper(i), hh = crest(i);
      return [[-w * k, -0.6], [w * k, -0.6], [w * 1.2 * k, hh * 0.38], [0.12, hh], [-0.12, hh], [-w * 1.2 * k, hh * 0.38]];
    };
    const railPts = base.map((b, i) => b.clone().addScaledVector(ups[i], crest(i)));
    geo = sweep(n, (i) => ({ o: base[i].clone().sub(p), ax: side(i), ay: ups[i] }), prof);
    // rough flanks; the crest line (sloping tips included) stays exact: you ride it
    geo = roughen(geo, (v) => {
      _v.copy(v).add(p);
      for (const c of railPts) if (c.distanceToSquared(_v) < 0.5 * 0.5) return 0;
      return 0.16;
    }, seed, 0.12);
    worldGeo = true;
    mat = rr() < 0.5 ? M.grey : M.basalt;
    // colliders: a box per segment around the body (below the crest), and the crest line as a rail
    for (let i = 0; i < n - 1; i++) {
      // no body colliders on the sloping tips, so nothing stops you sliding up onto them
      if (taper(i) < 1 || taper(i + 1) < 1) continue;
      const t = base[i + 1].clone().sub(base[i]), sl = t.length();
      t.normalize();
      const up = ups[i].clone().add(ups[i + 1]).normalize();
      const sd = new THREE.Vector3().crossVectors(t, up).normalize();
      const hh = H;
      const c = base[i].clone().add(base[i + 1]).multiplyScalar(0.5).addScaledVector(up, hh * 0.38);
      cols.push({ type: 'box', c, ax: sd, ay: new THREE.Vector3().crossVectors(t, sd).normalize(), az: t, hx: w * 1.05, hy: hh * 0.38 + 0.5, hz: sl / 2 + 0.05 });
    }
    rail = { pts: railPts };
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.rockKind = kind;
  mesh.position.copy(p);
  if (!worldGeo) mesh.quaternion.copy(q);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ink(mesh, kind === 'snake' ? 0.06 : 0.12);
  return { mesh, cols, rail };
}
const _o = new THREE.Vector3();

// Shaped rocks for one terrain chunk. ok(p) says whether a spot is free (no settlement, plateau,
// road or lake). More of them in rocky country (rock = 0..1 at the chunk centre).
export function shapedRocks(planet, ch, centreOf, ok, rock) {
  const rr = mulberry32((ch.f * 104729 + ch.cy * 1301 + ch.cx * 7) * 2246822519 ^ 0xb0b5);
  const n = (rr() < 0.42 ? 1 : 0) + (rr() < 0.12 ? 1 : 0) + Math.floor(rock * 2.5 + rr() * rock);
  const out = { meshes: [], cols: [], rails: [] };
  const p = new THREE.Vector3(), up = new THREE.Vector3(), t = new THREE.Vector3(), q = new THREE.Quaternion();
  for (let tries = 0; tries < n * 6 && out.meshes.length < n; tries++) {
    centreOf(rr(), rr(), p);
    p.multiplyScalar(planet.R); // (a unit direction: out to the surface, so metre offsets mean metres)
    if (!ok(p)) continue;
    const kind = KINDS[Math.floor(rr() * KINDS.length)];
    up.copy(p).normalize();
    t.set(rr() - 0.5, rr() - 0.5, rr() - 0.5);
    t.addScaledVector(up, -t.dot(up)).normalize();
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, t).normalize(), up, t);
    q.setFromRotationMatrix(m);
    if (kind === 'snake') {
      // it hugs the ground, so slopes are fine; just keep both ends clear too
      const e1 = p.clone().addScaledVector(t, 26), e2 = p.clone().addScaledVector(t, -26);
      if (!ok(e1) || !ok(e2)) continue;
      const r = build(kind, rr, p.clone().normalize().multiplyScalar(planet.surface(p)), q, planet);
      out.meshes.push(r.mesh); out.cols.push(...r.cols); out.rails.push(r.rail);
      continue;
    }
    if (kind === 'ramp') {
      // anchored at its tail (flush with the ground there, so you roll straight onto it); refuse
      // spots where the ground climbs ahead of the tail (it would bury the slope)
      const L = 12 + rr() * 9, W = 8 + rr() * 5, h = 3 + rr() * 2.5;
      const tailP = _v.set(0, 0, -L / 2).applyQuaternion(q).add(p).clone();
      const base = planet.surface(tailP) - 0.05;
      let lowest = base, highest = -Infinity;
      for (const [ox, oz] of [[0, 0], [0, L / 2], [W / 2, 0], [-W / 2, 0], [W / 2, L / 2], [-W / 2, L / 2], [0, -L / 4]]) {
        const hgt = planet.surface(_v.set(ox, 0, oz).applyQuaternion(q).add(p)) - base;
        // the slope's own height there (it must stay above the ground)
        const sh = h * (oz / L + 0.5);
        highest = Math.max(highest, hgt - sh * 0.6);
        lowest = Math.min(lowest, base + hgt);
      }
      if (highest > 0.6) continue;
      const g = up.clone().multiplyScalar(base);
      const r = build(kind, rr, g, q, planet, { L, W, h, drop: Math.max(0, base - lowest) });
      out.meshes.push(r.mesh);
      out.cols.push(...r.cols);
      continue;
    }
    // only on fairly level ground (a slope would bury one side), sunk a little below its centre
    let low = Infinity, high = -Infinity;
    for (const [ox, oz] of [[0, 0], [8, 0], [-8, 0], [0, 10], [0, -10], [7, 7], [-7, -7]]) {
      _v.set(ox, 0, oz).applyQuaternion(q).add(p);
      const h = planet.surface(_v);
      low = Math.min(low, h); high = Math.max(high, h);
    }
    if (high - low > 4.5) continue;
    const g = up.clone().multiplyScalar((low + high) / 2 - 0.35 - (high - low) * 0.2);
    const r = build(kind, rr, g, q, planet);
    out.meshes.push(r.mesh);
    out.cols.push(...r.cols);
  }
  return out;
}
