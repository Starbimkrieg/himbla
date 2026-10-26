import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ink, gradientMap } from './toon.js';
import { mulberry32, createNoise3D } from './rng.js';
import { patchRockMaterial } from './moonSkins.js';

// Shaped rocks among the ordinary boulders, each with shape-following colliders.
//   ramp      a natural kicker, three ways (RAMPS): a terraced strata slab and a curved kicker (both ridden up from their
//             tail to a lip), and a whaleback hump ridden from either end. Solid from the ground up to just under the
//             riding surface, with soil berms along the sides you don't ride in from.
//   monolith  scenery, four ways (MONOLITHS): a sheared spire (a flat cut down its length, a slice off the top, leaning),
//             a toppled half (a stump and its broken-off top lying beside it), a house rock (a big half-buried boulder with
//             a sheer face) and a cracked boulder (one piece slid away). Each sits in a tight berm of pushed-up soil.
//   snake     a meandering ridge (25 to 120 m): its heading wanders (no tighter than a 9 m radius), its crest rises in
//             humps and the body swells under them; the thin crest follows the ground and grinds (rails.js)
// Built per terrain chunk (planet.buildBoulders) from the chunk's seed, so placement is stable.

const KINDS = ['ramp', 'ramp', 'monolith', 'snake', 'snake'];
export const RAMPS = ['strata', 'curved', 'whaleback'];
export const MONOLITHS = ['sheared', 'toppled', 'house', 'cracked'];
let MATS = null, SOIL = null;
function mats() {
  if (MATS) return MATS;
  const m = (c) => patchRockMaterial(new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() })); // moonSkins.js: grain and dust with ?moonskin=1
  MATS = { grey: m(0x8d8898), basalt: m(0x6e6a7a), tan: m(0xa59886), pale: m(0xb8b2c4), dark: m(0x5f5a6c) };
  return MATS;
}
// pushed-up regolith round a rock (near the ground's colour)
const soil = () => (SOIL ||= patchRockMaterial(new THREE.MeshToonMaterial({ color: 0xa597a9, gradientMap: gradientMap() })));

const N3 = createNoise3D(mulberry32(4242));
const _v = new THREE.Vector3(), _n = new THREE.Vector3();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
const TAU = Math.PI * 2;
const FLAT = () => 0; // the ground's height in a rock's frame where there's no planet (the Asset Row)
const qAxis = (ax, a) => new THREE.Quaternion().setFromAxisAngle(ax, a);
const qYaw = (a) => qAxis(AY, a);

// ---------------- geometry ----------------

// Sweep a closed 2D profile through n stations, capped at both ends. frame(i) gives { o, ax, ay } (origin and the
// axes (a, b) map onto), prof(i) the profile there.
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

// Make faces point outward (profiles may come in either winding).
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

// Push each vertex along its normal by layered noise plus strata banding, scaled by amp(v) (0 keeps it exact).
// Returns flat-faceted geometry.
function roughen(geo, amp, seed, strata = 0.25) {
  // positions only (uv / normal seams would split vertices and crack when displaced)
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


// position-only, non-indexed, normals recomputed (so pieces merge)
function clean(g) {
  const b = new THREE.BufferGeometry();
  b.setAttribute('position', g.attributes.position.clone());
  if (g.index) b.setIndex(g.index.clone());
  const out = b.index ? b.toNonIndexed() : b;
  out.computeVertexNormals();
  return out;
}
// a tapered prism's points: base w x d at y 0, top at h scaled by taper, jittered (jit 0: none)
function prismPts(rr, w, d, h, taper, sides = 5 + Math.floor(rr() * 2), rows = 4, jit = 1) {
  const pts = [], a0 = rr() * TAU;
  for (let r = 0; r <= rows; r++) {
    const y = (h * r) / rows, k = 1 - ((1 - taper) * r) / rows;
    for (let i = 0; i < sides; i++) {
      const a = a0 + (i / sides) * TAU + (rr() - 0.5) * 0.4 * jit, j = 1 + (rr() - 0.5) * 0.3 * jit;
      pts.push(V(Math.cos(a) * (w / 2) * k * j, y + (r > 0 && r < rows ? (rr() - 0.5) * h * 0.08 * jit : 0), Math.sin(a) * (d / 2) * k * j));
    }
  }
  return pts;
}
// a rounded boulder's points: a jittered icosphere, radii sx, sy, sz
function blobPts(rr, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, seen = new Set(), pts = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const j = 0.88 + rr() * 0.2;
    pts.push(V(p.getX(i) * sx * j, p.getY(i) * sy * j, p.getZ(i) * sz * j));
  }
  return pts;
}
// keep the side n.v <= dist: points past the plane go onto it (a clean flat face)
function cut(pts, n, dist) {
  for (const v of pts) { const e = v.dot(n) - dist; if (e > 0) v.addScaledVector(n, -e); }
  return pts;
}
const copy = (pts) => pts.map((v) => v.clone());
// hull, roughened except on its cut faces (planes: [n, dist]), which stay flat
function hullRock(pts, planes, amp, seed) {
  return roughen(clean(new ConvexGeometry(pts)), (v) => (planes.some(([n, d]) => Math.abs(v.dot(n) - d) < 0.06) ? 0 : amp), seed, 0.12);
}
// small angular fragments between radius R0 and R1 of (cx, cz), on the ground (gy: its height there, in the rock's frame)
function crumbs(rr, cx, cz, R0, R1, n, s0, s1, gy = FLAT) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rr() * TAU, r = R0 + rr() * (R1 - R0), s = s0 + rr() * (s1 - s0);
    const g = clean(new ConvexGeometry(prismPts(rr, s, s * (0.6 + rr() * 0.5), s * (0.5 + rr() * 0.5), 0.6 + rr() * 0.3, 4 + Math.floor(rr() * 2), 2)));
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    out.push(g.rotateX((rr() - 0.5) * 1).rotateY(rr() * 6).translate(x, gy(x, z) - s * 0.15, z));
  }
  return out;
}
// a grid of points (rows x seg) as a surface; closed round when `ring`
function grid(pos, rows, seg, ring) {
  const idx = [], m = ring ? seg : seg - 1;
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < m; i++) {
    const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = (j + 1) * seg + ((i + 1) % seg), d = (j + 1) * seg + i;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
// the cross-section of a berm, t 0 (inside, against the rock) to 1 (out on the ground): up quickly, down in a long foot
const bermRise = (t) => (t < 0.3 ? Math.sin(((t / 0.3) * Math.PI) / 2) : Math.pow(Math.cos((((t - 0.3) / 0.7) * Math.PI) / 2), 1.6));
// A ring berm of pushed-up soil round a footprint (an ellipse rx x rz at (cx, cz), turned by rot): from 0.4 m inside the
// rock out `wd` metres, its crest hMax high, gently uneven and heaped a little on one side, lying on the ground (gy).
function berm(rr, cx, cz, rx, rz, rot, hMax, seed, gy = FLAT, wd = 1.5) {
  const seg = 28, rows = 5, pos = [], heap = rr() * TAU, lumps = [0, 1, 2].map(() => [rr() * TAU, 0.2 + rr() * 0.25]);
  const hAt = (a) => { let h = 0.8 + 0.2 * Math.cos(a - heap); for (const [b, k] of lumps) h += k * Math.max(0, Math.cos(a - b)) ** 8; return hMax * h; };
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1), out = -0.4 + t * (wd + 0.4), f = bermRise(t);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU, ex = Math.cos(a) * rx, ez = Math.sin(a) * rz, l = Math.hypot(ex, ez) || 1;
      const x = ex + (ex / l) * out, z = ez + (ez / l) * out;
      const px = cx + x * c + z * s, pz = cz - x * s + z * c;
      pos.push(px, gy(px, pz) + hAt(a) * f - (j === 0 || j === rows - 1 ? 0.2 : 0), pz);
    }
  }
  return roughen(grid(pos, rows, seg, true), () => 0.05, seed, 0);
}
// A straight berm along a rock's side, from (x0, z0) to (x1, z1) on the ground (gy), heaped out to the `side` (+1: right of the
// direction of travel) `wd` metres, hMax high, tapering into the ground at both ends.
function bermLine(x0, z0, x1, z1, side, hMax, seed, gy = FLAT, wd = 1.4) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(3, Math.ceil(len / 1.5)), rows = 5, pos = [];
  const tx = (x1 - x0) / len, tz = (z1 - z0) / len, nx = tz * side, nz = -tx * side; // outward
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1), out = -0.4 + t * (wd + 0.4), f = bermRise(t);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), end = Math.min(1, Math.min(u, 1 - u) * 6), h = hMax * (0.85 + 0.15 * Math.sin(u * 9 + seed)) * end;
      const px = x0 + (x1 - x0) * u + nx * out, pz = z0 + (z1 - z0) * u + nz * out;
      pos.push(px, gy(px, pz) + h * f - (j === 0 || j === rows - 1 ? 0.2 : 0), pz);
    }
  }
  const g = grid(pos, rows, n, false);
  if (side < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } } // (faces up)
  return roughen(g, () => 0.05, seed, 0);
}

// ---------------- colliders ----------------

// a box in the rock's frame: centre lc, turned by lq, half sizes
function obox(p, q, lc, lq, hx, hy, hz) {
  const qq = q.clone().multiply(lq);
  return { type: 'box', c: p.clone().add(lc.clone().applyQuaternion(q)), ax: AX.clone().applyQuaternion(qq), ay: AY.clone().applyQuaternion(qq), az: AZ.clone().applyQuaternion(qq), hx, hy, hz };
}
// the box round points (turned by lq, then moved by `at`), its sides pulled in by `inset` (the hull is rough), top at the drawn top
function hullBox(p, q, pts, lq, inset = 0.85, at = null) {
  const lo = V(Infinity, Infinity, Infinity), hi = V(-Infinity, -Infinity, -Infinity);
  for (const v of pts) { lo.min(v); hi.max(v); }
  const c = lo.clone().add(hi).multiplyScalar(0.5).applyQuaternion(lq);
  if (at) c.add(at);
  return obox(p, q, c, lq, ((hi.x - lo.x) / 2) * inset, (hi.y - lo.y) / 2, ((hi.z - lo.z) / 2) * inset);
}
// a dome as two boxes: a wide lower one and a narrow one to the top (so nothing stands in the air over its shoulders)
function domeBoxes(p, q, pts) {
  const lo = V(Infinity, Infinity, Infinity), hi = V(-Infinity, -Infinity, -Infinity);
  for (const v of pts) { lo.min(v); hi.max(v); }
  const c = lo.clone().add(hi).multiplyScalar(0.5), hx = (hi.x - lo.x) / 2, hz = (hi.z - lo.z) / 2, H = hi.y - lo.y, I = new THREE.Quaternion();
  return [obox(p, q, V(c.x, lo.y + H * 0.3, c.z), I, hx * 0.82, H * 0.3, hz * 0.82), obox(p, q, V(c.x, lo.y + H * 0.5, c.z), I, hx * 0.5, H * 0.5 - 0.15, hz * 0.5)];
}

// rock pieces and soil pieces as one object at p, turned by q
function finish(p, q, rockGeos, soilGeos, mat, cols, kind) {
  const root = new THREE.Group();
  for (const [geos, m, w] of [[rockGeos, mat, 0.12], [soilGeos, soil(), 0.07]]) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos.map(clean)), m);
    mesh.castShadow = mesh.receiveShadow = true;
    ink(mesh, w);
    root.add(mesh);
  }
  root.userData.rockKind = kind;
  root.position.copy(p);
  root.quaternion.copy(q);
  return { mesh: root, cols, rail: null };
}

// ---------------- monoliths ----------------

function shearedSpire(rr, p, q, gy) {
  const seed = rr() * 100;
  const H = 9 + rr() * 5, w = 3.4 + rr() * 1.2, d = 2.6 + rr() * 0.8, sink = 1.6, taper = 0.5 + rr() * 0.15;
  const pts = prismPts(rr, w, d, H + sink, taper, 4 + Math.floor(rr() * 2), 3, 0.4).map((v) => v.setY(v.y - sink));
  const n = V(1, 0.75 + rr() * 0.3, (rr() - 0.5) * 0.4).normalize(), top = H * 0.9, dist = n.y * top;
  cut(pts, n, dist);
  const b = rr() * TAU, n2 = V(Math.cos(b), 0.06, Math.sin(b)).normalize(), d2 = w * 0.06; // the cleft face down its core
  cut(pts, n2, d2);
  const yaw = rr() * TAU, lean = (0.22 + rr() * 0.16) * (rr() < 0.5 ? -1 : 1), lq = qYaw(yaw).multiply(qAxis(AZ, lean));
  const g = hullRock(pts, [[n, dist], [n2, d2]], 0.12, seed).applyQuaternion(lq);
  const low = pts.filter((v) => v.y < H * 0.45), high = pts.filter((v) => v.y >= H * 0.45 - 0.5);
  const cols = [hullBox(p, q, low, lq), hullBox(p, q, high, lq, 0.75)];
  return finish(p, q, [g, ...crumbs(rr, 0, 0, w * 0.6 + 1.5, w * 0.6 + 6, 10, 0.3, 0.9, gy)], [berm(rr, 0, 0, w * 0.47, d * 0.47, yaw, 0.55, seed, gy)], mats().tan, cols, 'monolith');
}

function toppledHalf(rr, p, q, gy) {
  const seed = rr() * 100;
  const w = 3.8 + rr(), d = 3 + rr() * 0.6, H = 6 + rr() * 2.5, sink = 1.2;
  const dir = rr() * TAU, yq = qYaw(dir);
  const stump = prismPts(rr, w, d, H + sink, 0.75).map((v) => v.setY(v.y - sink));
  const n = V(1, 0.75, 0).normalize(), dist = n.y * H * 0.82;
  cut(stump, n, dist);
  const geos = [hullRock(stump, [[n, dist]], 0.18, seed).applyQuaternion(yq)];
  // the broken-off top, lying on its side where it fell, its flat break toward the stump
  const L = 4.5 + rr() * 1.5, top = prismPts(rr, w * 0.85, d * 0.9, L, 0.65), m = V(0, -1, 0);
  cut(top, m, 0);
  const lq = yq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, -Math.PI / 2 - 0.12)));
  const at = V(H * 0.5 + 2.5, 0, 0).applyQuaternion(yq);
  at.y = gy(at.x, at.z) + d * 0.42; // (on the ground where it fell)
  geos.push(hullRock(top, [[m, 0]], 0.18, seed + 1).applyQuaternion(lq).translate(at.x, at.y, at.z));
  const cols = [hullBox(p, q, stump, yq), hullBox(p, q, top, lq, 0.85, at)];
  const mid = V(H * 0.3 + 1.5, 0, 0).applyQuaternion(yq), lie = V(0, L / 2, 0).applyQuaternion(lq).add(at);
  const soilG = [berm(rr, 0, 0, w * 0.47, d * 0.47, dir, 0.5, seed, gy), berm(rr, lie.x, lie.z, L * 0.48, d * 0.45, dir, 0.3, seed + 9, gy, 1.0)];
  return finish(p, q, [...geos, ...crumbs(rr, mid.x, mid.z, 0, 4.5, 12, 0.3, 0.9, gy)], soilG, mats().tan, cols, 'monolith');
}

function houseRock(rr, p, q, gy) {
  const seed = rr() * 100;
  const sx = 6.5 + rr() * 1.5, sy = 3.8 + rr() * 0.8, sz = 4.6 + rr() * 1;
  const pts = blobPts(rr, sx, sy, sz).map((v) => v.setY(v.y + sy * 0.55));
  const a = rr() * TAU, n = V(Math.cos(a), 0.12, Math.sin(a)).normalize(), dist = sx * 0.62;
  cut(pts, n, dist); // a sheer face where a slab came away
  const g = hullRock(pts, [[n, dist]], 0.3, seed);
  // the footprint at the ground: the blob's section 0.45 sy below its middle (cos 63 deg of each radius)
  const k = Math.sqrt(1 - 0.55 * 0.55);
  return finish(p, q, [g, ...crumbs(rr, Math.cos(a) * sx * 0.75, Math.sin(a) * sx * 0.75, 1, 4, 8, 0.4, 1.1, gy)], [berm(rr, 0, 0, sx * k * 0.95, sz * k * 0.95, 0, 0.6, seed, gy, 1.8)], mats().grey, domeBoxes(p, q, pts), 'monolith');
}

function crackedBoulder(rr, p, q, gy) {
  const seed = rr() * 100;
  const sx = 3.6 + rr() * 0.8, sy = 2.8 + rr() * 0.5, sz = 3.2 + rr() * 0.6;
  const pts = blobPts(rr, sx, sy, sz).map((v) => v.setY(v.y + sy * 0.6));
  const n = V(1, 0.3, (rr() - 0.5) * 0.6).normalize(), dist = 0.3;
  const a = cut(copy(pts), n, dist), b = cut(copy(pts), n.clone().negate(), -dist - 0.01);
  // the broken piece has slid out and settled
  const axis = V().crossVectors(AY, n).normalize(), lq = qAxis(axis, -0.3), shift = n.clone().setY(0).normalize().multiplyScalar(1.3).setY(-0.5);
  const geos = [hullRock(a, [[n, dist]], 0.22, seed), hullRock(b, [[n.clone().negate(), -dist]], 0.22, seed + 1).applyQuaternion(lq).translate(shift.x, shift.y, shift.z)];
  const gap = n.clone().setY(0).normalize().multiplyScalar(dist + 0.6);
  const cols = [...domeBoxes(p, q, a), hullBox(p, q, b, lq, 0.75, shift)];
  const k = Math.sqrt(1 - 0.6 * 0.6), rot = -Math.atan2(n.z, n.x);
  return finish(p, q, [...geos, ...crumbs(rr, gap.x, gap.z, 0, 2, 8, 0.25, 0.7, gy)], [berm(rr, gap.x * 0.6, gap.z * 0.6, sx * k + 0.8, sz * k, rot, 0.45, seed, gy)], mats().basalt, cols, 'monolith');
}
const MONOLITH_MAKERS = { sheared: shearedSpire, toppled: toppledHalf, house: houseRock, cracked: crackedBoulder };

// ---------------- ramps ----------------

// The riding profile of a ramp, [z, y] from its back to its front, in its frame (p at the ground at its back end):
// strata and curved run up to a lip at +L/2, the whaleback rises and falls back to the ground.
export function rampProfile(dims) {
  const { variant, L, h } = dims;
  const curve = (z0, z1, n, f) => Array.from({ length: n + 1 }, (_, i) => { const z = z0 + ((z1 - z0) * i) / n; return [z, f(z)]; });
  if (variant === 'strata') return curve(-L / 2 - 4, L / 2, 12, (z) => h * (z / L + 0.5)); // (its slope runs 4 m back into the ground)
  if (variant === 'curved') return curve(-L / 2, L / 2, 16, (z) => h * Math.pow((z + L / 2) / L, dims.e) - 0.15);
  return curve(-L / 2, L / 2, 20, (z) => h * Math.pow(Math.sin(Math.PI * (z / L + 0.5)), 1.3) - 0.2);
}
export const profileAt = (prof, z) => {
  if (z <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) if (z <= prof[i][0]) { const [z0, y0] = prof[i - 1], [z1, y1] = prof[i]; return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0); }
  return prof[prof.length - 1][1];
};
// dims for a ramp of the given variant
export function rampDims(rr, variant) {
  if (variant === 'strata') return { variant, L: 14 + rr() * 6, W: 9 + rr() * 3, h: 3.5 + rr() * 1.5 };
  if (variant === 'curved') return { variant, L: 12 + rr() * 4, W: 8 + rr() * 3, h: 3.5 + rr() * 1, e: 2.1 + rr() * 0.3 };
  return { variant, L: 22 + rr() * 8, W: 9 + rr() * 3, h: 3 + rr() * 1.5 };
}

// A ramp under its riding profile, W wide: a ground-high end (y under 0.3) runs into the ground, a raised one (a lip) stands as
// a face reaching dims.drop below the back (where the ground falls away ahead). Shoulders fall away, in terraces on the strata
// slab. Colliders: a 1 m slab under each stretch of the riding surface, and solid fill from the ground up to 0.4 m under it,
// so nothing is hollow from the side. Soil berms along both sides, and across the foot of a lip.
function ramp(rr, p, q, dims, gy) {
  const seed = rr() * 100, { W, variant } = dims, drop = dims.drop || 0;
  const prof = rampProfile(dims), back = prof[0], front = prof[prof.length - 1];
  const under = Math.max(0.8 + drop, 0.6 - Math.min(...prof.map(([, y]) => y)));
  const loop = [[front[0] + 0.4, -under]];
  if (front[1] > 0.3) loop.push([front[0] + 0.5, front[1] * 0.45], [front[0] + 0.15, front[1] - 0.1]);
  for (let i = prof.length - 1; i >= 0; i--) loop.push(prof[i]);
  if (back[1] > 0.3) loop.push([back[0] - 0.15, back[1] - 0.1], [back[0] - 0.5, back[1] * 0.45]);
  loop.push([back[0] - 0.4, -under]);
  const terraces = variant === 'strata' ? 3 : 0, n = terraces ? 21 : 11;
  let geo = sweep(n, (i) => ({ o: V(-W / 2 + (i / (n - 1)) * W, 0, 0), ax: AZ, ay: AY }), (i) => {
    const t = Math.sin(Math.PI * (i / (n - 1)));
    let k = 0.55 + 0.45 * Math.pow(t, 0.45);
    if (terraces) k = 0.4 + (Math.round(((k - 0.4) / 0.6) * terraces) / terraces) * 0.6;
    return loop.map(([a, b]) => [a * (0.94 + 0.06 * t), b < 0 ? b : b * k]);
  });
  geo = roughen(geo, (v) => (Math.abs(v.x) < W * 0.32 && v.y > profileAt(prof, v.z) - 0.8 ? 0.06 : 0.5), seed, terraces ? 0.45 : 0.3);
  // colliders, stretch by stretch (about 2.5 m along the surface)
  const cols = [];
  for (let i = 0; i < prof.length - 1;) {
    let j = i + 1;
    while (j < prof.length - 1 && Math.hypot(prof[j][0] - prof[i][0], prof[j][1] - prof[i][1]) < 2.5) j++;
    const [z0, y0] = prof[i], [z1, y1] = prof[j], len = Math.hypot(z1 - z0, y1 - y0), lq = qAxis(AX, -Math.atan2(y1 - y0, z1 - z0));
    cols.push(obox(p, q, V(0, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(AY.clone().applyQuaternion(lq), -0.5), lq, W * 0.36, 0.5, len / 2 + 0.05));
    const top = Math.min(y0, y1) - 0.4;
    if (top > 0.2) cols.push(obox(p, q, V(0, (top - under) / 2, (z0 + z1) / 2), new THREE.Quaternion(), W * 0.4, (top + under) / 2, Math.abs(z1 - z0) / 2 + 0.05));
    i = j;
  }
  // soil along the sides (from where the rock stands out of the ground to its front), and across a lip's foot
  const lip = front[1] > 0.3, zs = prof.find(([, y]) => y > 0.3)?.[0] ?? back[0], ze = front[0] + (lip ? 0.3 : 0);
  const soilG = [-1, 1].map((s) => bermLine(s * W * 0.5, zs, s * W * 0.5, ze, s, Math.min(0.6, dims.h * 0.15), seed + s, gy));
  if (lip) soilG.push(bermLine(W * 0.45, front[0] + 0.5, -W * 0.45, front[0] + 0.5, 1, 0.45, seed + 3, gy));
  const rocks = [geo, ...crumbs(rr, 0, front[0] + 2.5, 0, 3, lip ? 6 : 3, 0.4, 1.2, gy)];
  return finish(p, q, rocks, soilG, variant === 'strata' ? mats().basalt : mats().dark, cols, 'ramp');
}

// ---------------- snakes ----------------

// A meandering snake ridge's path: { len, at(s) -> [x, z] (from its middle, in the frame), H(s) crest, w(s) half width }
export function snakePath(rr) {
  const len = 25 + rr() * 95, k = 0.05 + rr() * 0.03, f1 = 7 + rr() * 5, f2 = 3 + rr() * 2, ph1 = rr() * TAU, ph2 = rr() * TAU, drift = (rr() - 0.5) * 0.03;
  // heading: the integral of a wandering curvature (radius 9 m at the tightest)
  const curv = (s) => Math.max(-0.11, Math.min(0.11, k * (Math.sin(s / f1 + ph1) + 0.5 * Math.sin(s / f2 + ph2)) + drift));
  const ds = 0.4, pts = [[0, 0]];
  let hd = 0, x = 0, z = 0;
  for (let s = ds; s <= len + ds; s += ds) { hd += curv(s) * ds; x += Math.sin(hd) * ds; z += Math.cos(hd) * ds; pts.push([x, z]); }
  const raw = (s) => pts[Math.min(pts.length - 1, Math.max(0, Math.round(s / ds)))], mid = raw(len / 2);
  const H0 = 2 + rr() * 0.6, w0 = 1.2 + rr() * 0.25, lh = 14 + rr() * 10, ph3 = rr() * TAU;
  const hump = (s) => Math.pow(Math.max(0, Math.sin((TAU * s) / lh + ph3)), 2);
  return { len, at: (s) => { const r = raw(s); return [r[0] - mid[0], r[1] - mid[1]]; }, H: (s) => H0 * (0.85 + 0.55 * hump(s)), w: (s) => w0 * (0.85 + 0.35 * hump(s)), Hmax: H0 * 1.4 };
}

// A snake ridge along `path` from p (the ground at its middle), its steep rhombus section draped over planet.ground, the crest
// line exact (the rail) and the flanks rough; colliders a box per segment round the body, the sloping tips solid slabs topped
// by the crest so you roll straight up onto the rail.
function snake(rr, p, q, planet, path) {
  const seed = rr() * 100, { len, at, H, w } = path;
  const right = AX.clone().applyQuaternion(q), fwd = AZ.clone().applyQuaternion(q);
  const n = Math.ceil(len / 1.6) + 1, base = [], ups = [], ss = [];
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * len, [x, z] = at(s);
    const gp = planet.ground(p.clone().addScaledVector(right, x).addScaledVector(fwd, z), V());
    base.push(gp); ups.push(gp.clone().normalize()); ss.push(s);
  }
  const tang = (i) => base[Math.min(n - 1, i + 1)].clone().sub(base[Math.max(0, i - 1)]).normalize();
  const side = (i) => V().crossVectors(tang(i), ups[i]).normalize();
  // ends slope down to the ground over ~6 m: ride into a tip and you're on the rail
  const taper = (i) => Math.min(1, Math.min(i, n - 1 - i) / 4);
  const crest = (i) => { const t = taper(i), h = H(ss[i]); return 0.12 + (h - 0.12) * t * t * (3 - 2 * t); };
  const half = (i) => (0.3 + 0.7 * taper(i)) * w(ss[i]);
  const prof = (i) => { const k = half(i), hh = crest(i); return [[-k, -0.6], [k, -0.6], [k * 1.2, hh * 0.38], [0.12, hh], [-0.12, hh], [-k * 1.2, hh * 0.38]]; };
  const railPts = base.map((b, i) => b.clone().addScaledVector(ups[i], crest(i)));
  let geo = sweep(n, (i) => ({ o: base[i].clone().sub(p), ax: side(i), ay: ups[i] }), prof);
  // rough flanks; the crest line (tips included) stays exact for riding
  const near = 0.5 * 0.5;
  geo = roughen(geo, (v) => {
    _v.copy(v).add(p);
    for (const c of railPts) if (c.distanceToSquared(_v) < near) return 0;
    return 0.16;
  }, seed, 0.12);
  const cols = [];
  for (let i = 0; i < n - 1; i++) {
    if (taper(i) < 1 || taper(i + 1) < 1) {
      // sloping tips: a slab topped exactly by the crest slope, solid down to the ground (or a fast rider slips under into the rock)
      const a = railPts[i], b2 = railPts[i + 1];
      const t = b2.clone().sub(a), sl = t.length();
      t.normalize();
      const up0 = ups[i].clone().add(ups[i + 1]).normalize();
      const sd = V().crossVectors(t, up0).normalize();
      const ay = V().crossVectors(sd, t).normalize(); // square to the slope, upward
      const depth = Math.max(a.dot(up0), b2.dot(up0)) - Math.min(a.dot(up0), b2.dot(up0)) + Math.max(crest(i), crest(i + 1)) + 1;
      const c = a.clone().add(b2).multiplyScalar(0.5).addScaledVector(ay, -depth / 2);
      cols.push({ type: 'box', c, ax: sd, ay, az: t, hx: Math.max(half(i), half(i + 1)) * 1.2 + SKIN, hy: depth / 2, hz: sl / 2 + 0.05 });
      continue;
    }
    const t = base[i + 1].clone().sub(base[i]), sl = t.length();
    t.normalize();
    const up = ups[i].clone().add(ups[i + 1]).normalize();
    const sd = V().crossVectors(t, up).normalize();
    const hh = Math.min(crest(i), crest(i + 1));
    const c = base[i].clone().add(base[i + 1]).multiplyScalar(0.5).addScaledVector(up, hh * 0.38);
    cols.push({ type: 'box', c, ax: sd, ay: V().crossVectors(t, sd).normalize(), az: t, hx: Math.max(half(i), half(i + 1)) * 1.2 + SKIN, hy: hh * 0.38 + 0.5, hz: sl / 2 + 0.05 });
  }
  for (const c of cols) c.rail = railPts; // a rider on this crest ignores its own rock (rails.js)
  const mesh = new THREE.Mesh(geo, rr() < 0.5 ? mats().grey : mats().basalt);
  mesh.userData.rockKind = 'snake';
  mesh.position.copy(p);
  mesh.castShadow = mesh.receiveShadow = true;
  ink(mesh, 0.06);
  return { mesh, cols, rail: { pts: railPts } };
}
const SKIN = 0.2; // m: snake-rock colliders stand this far outside its flanks (bulged to 1.2 x half-width, roughened)

// ---------------- building and placing ----------------

// One shaped rock (p = its ground point, q = its frame): { mesh, cols, rail } in world space. dims: a ramp's (rampDims, plus
// drop), a monolith's { variant }, a snake's { path } (snakePath).
export function build(kind, rr, p, q, planet, dims) {
  const r0 = p.length(), _g = V();
  const gy = planet && kind !== 'snake' ? (x, z) => planet.surface(_g.set(x, 0, z).applyQuaternion(q).add(p)) - r0 : FLAT;
  if (kind === 'snake') return snake(rr, p, q, planet, dims.path);
  const r = kind === 'ramp' ? ramp(rr, p, q, dims, gy) : MONOLITH_MAKERS[dims.variant](rr, p, q, gy);
  r.mesh.userData.variant = dims.variant;
  return r;
}

// Shaped rocks for one terrain chunk. ok(p): spot is free (no settlement, plateau, road or lake). More in rocky
// country (rock = 0..1 at the chunk centre).
export function shapedRocks(planet, ch, centreOf, ok, rock) {
  const rr = mulberry32((ch.f * 104729 + ch.cy * 1301 + ch.cx * 7) * 2246822519 ^ 0xb0b5);
  const n = (rr() < 0.42 ? 1 : 0) + (rr() < 0.12 ? 1 : 0) + Math.floor(rock * 2.5 + rr() * rock);
  const out = { meshes: [], cols: [], rails: [] };
  const p = V(), up = V(), t = V(), q = new THREE.Quaternion();
  const at = (ox, oz) => _v.set(ox, 0, oz).applyQuaternion(q).add(p);
  const add = (r) => { out.meshes.push(r.mesh); out.cols.push(...r.cols); if (r.rail) out.rails.push(r.rail); };
  for (let tries = 0; tries < n * 6 && out.meshes.length < n; tries++) {
    centreOf(rr(), rr(), p);
    p.multiplyScalar(planet.R); // unit direction out to the surface, so offsets are in metres
    if (!ok(p)) continue;
    const kind = KINDS[Math.floor(rr() * KINDS.length)];
    up.copy(p).normalize();
    t.set(rr() - 0.5, rr() - 0.5, rr() - 0.5);
    t.addScaledVector(up, -t.dot(up)).normalize();
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V().crossVectors(up, t).normalize(), up, t));
    if (kind === 'snake') {
      // hugs the ground, so slopes are fine; the whole path clear
      const path = snakePath(rr);
      let clear = true;
      for (let s = 0; s <= path.len && clear; s += 8) { const [x, z] = path.at(s); if (!ok(at(x, z).clone())) clear = false; }
      if (!clear) continue;
      add(build(kind, rr, p.clone().normalize().multiplyScalar(planet.surface(p)), q, planet, { path }));
      continue;
    }
    if (kind === 'ramp') {
      // anchored flush at its back end; skip spots where the ground climbs ahead (it would bury the slope). A lip's face reaches
      // down to where the ground falls away ahead; a whaleback's far end has to meet the ground too.
      const dims = rampDims(rr, RAMPS[Math.floor(rr() * RAMPS.length)]);
      const prof = rampProfile(dims), z0 = prof[0][0], z1 = prof[prof.length - 1][0];
      const base = planet.surface(at(0, z0 + 0.5).clone()) - 0.05;
      let lowest = 0, buried = -Infinity;
      for (const fz of [0.25, 0.5, 0.75, 1]) for (const fx of [-0.5, 0, 0.5]) {
        const oz = z0 + (z1 - z0) * fz, hgt = planet.surface(at(fx * dims.W, oz).clone()) - base;
        buried = Math.max(buried, hgt - Math.max(0, profileAt(prof, oz)) * 0.6);
        lowest = Math.min(lowest, hgt);
      }
      if (buried > 0.6 || (dims.variant === 'whaleback' && lowest < -0.5)) continue;
      dims.drop = -lowest;
      add(build(kind, rr, up.clone().multiplyScalar(base), q, planet, dims));
      continue;
    }
    // monoliths: fairly level ground only (their berms and crumbs lie on the ground, but a steep slope would bare the rock's
    // foot on its low side), sunk a little
    let low = Infinity, high = -Infinity;
    for (const [ox, oz] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, -5], [5, -5], [-5, 5]]) {
      const h = planet.surface(at(ox, oz).clone());
      low = Math.min(low, h); high = Math.max(high, h);
    }
    if (high - low > 3) continue;
    const variant = MONOLITHS[Math.floor(rr() * MONOLITHS.length)];
    add(build(kind, rr, up.clone().multiplyScalar(low + (high - low) * 0.35 - 0.05), q, planet, { variant }));
  }
  return out;
}
