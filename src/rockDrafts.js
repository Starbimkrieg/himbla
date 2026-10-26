// Rock drafts (dev only, imported by nothing in the game): two sets for each of three changes, to pick from.
//   spire A  impact-shattered blocks: sheared spire, split block, toppled half, shard crown (flat clean cuts, driven in)
//   spire B  weathered Apollo boulders: house rock, rolled boulder with its track, cracked boulder, boulder pile
//   ramp A   geologic kickers: terraced strata slab, curved kicker
//   ramp B   landforms: table-top, whaleback
//   snake A  sinuous: regular S-curves, gently rising and falling crest
//   snake B  meandering: irregular bends, humps in the crest, thicker where it rises
// Each builder (rr, p, q, planet) returns { mesh, cols, rail? } like rocks.js build: p the ground point, q its frame.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ink, gradientMap } from './toon.js';
import { patchRockMaterial } from './moonSkins.js';
import { mats, sweep, roughen } from './rocks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
const TAU = Math.PI * 2;
let SOIL = null;
const soil = () => (SOIL ||= patchRockMaterial(new THREE.MeshToonMaterial({ color: 0xa597a9, gradientMap: gradientMap() })));

// ---------------- shapes ----------------

// position-only, non-indexed, normals recomputed (so pieces merge)
function clean(g) {
  const b = new THREE.BufferGeometry();
  b.setAttribute('position', g.attributes.position.clone());
  if (g.index) b.setIndex(g.index.clone());
  const out = b.index ? b.toNonIndexed() : b;
  out.computeVertexNormals();
  return out;
}
// a tapered prism's points: base w x d at y 0, top at h scaled by taper, jittered
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
function blobPts(rr, sx, sy, sz, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, seen = new Set(), pts = [];
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
function rock(pts, planes, amp, seed) {
  const g = clean(new ConvexGeometry(pts));
  return roughen(g, (v) => (planes.some(([n, d]) => Math.abs(v.dot(n) - d) < 0.06) ? 0 : amp), seed, 0.12);
}
// pushed-up soil round (cx, cz): a berm rising from the ground about 2.5 m out to a crest hMax high at radius R, falling
// back against the rock; uneven round the ring (n: how lumpy), heaped on one side
function mounds(rr, cx, cz, R, n, hMax, seed, size = 1) {
  const wd = 2.6 * size, seg = 24, rings = 6, pos = [], idx = [];
  const lump = Array.from({ length: n }, () => [rr() * TAU, 0.5 + rr() * 0.7]), heap = rr() * TAU;
  const hAt = (a) => { let h = 0.35; for (const [b, k] of lump) h += k * Math.max(0, Math.cos(a - b)) ** 6; return hMax * Math.min(1.3, h) * (0.75 + 0.35 * Math.cos(a - heap)); };
  for (let j = 0; j <= rings; j++) {
    const t = j / rings; // 0 inside against the rock, 1 out on the ground
    const rr2 = R - 0.6 + t * (wd + 0.6), f = t < 0.3 ? Math.sin((t / 0.3) * Math.PI / 2) : Math.pow(Math.cos(((t - 0.3) / 0.7) * Math.PI / 2), 1.6);
    for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; pos.push(cx + Math.cos(a) * rr2, hAt(a) * f - (j === 0 || j === rings ? 0.25 : 0), cz + Math.sin(a) * rr2); }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = (j + 1) * seg + ((i + 1) % seg), d = (j + 1) * seg + i;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return [roughen(g, () => 0.18 * size, seed, 0)];
}
// small angular fragments between radius R0 and R1
function crumbs(rr, cx, cz, R0, R1, n, s0, s1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rr() * TAU, r = R0 + rr() * (R1 - R0), s = s0 + rr() * (s1 - s0);
    const g = clean(new ConvexGeometry(prismPts(rr, s, s * (0.6 + rr() * 0.5), s * (0.5 + rr() * 0.5), 0.6 + rr() * 0.3, 4 + Math.floor(rr() * 2), 2)));
    out.push(g.rotateX((rr() - 0.5) * 1).rotateY(rr() * 6).translate(cx + Math.cos(a) * r, -s * 0.15, cz + Math.sin(a) * r));
  }
  return out;
}

// ---------------- colliders ----------------

// a box in the rock's frame: centre lc, turned by lq, half sizes
function obox(p, q, lc, lq, hx, hy, hz) {
  const qq = q.clone().multiply(lq);
  return { type: 'box', c: p.clone().add(lc.clone().applyQuaternion(q)), ax: AX.clone().applyQuaternion(qq), ay: AY.clone().applyQuaternion(qq), az: AZ.clone().applyQuaternion(qq), hx, hy, hz };
}
// the box round points in frame R (then turned by lq), its sides pulled in by `inset` (the hull is rough), top at the drawn top
function hullBox(p, q, pts, R, lq, inset = 0.85) {
  const Ri = R.clone().invert(), lo = V(Infinity, Infinity, Infinity), hi = V(-Infinity, -Infinity, -Infinity);
  for (const v of pts) { const u = v.clone().applyQuaternion(Ri); lo.min(u); hi.max(u); }
  const c = lo.clone().add(hi).multiplyScalar(0.5).applyQuaternion(R).applyQuaternion(lq);
  return obox(p, q, c, lq.clone().multiply(R), ((hi.x - lo.x) / 2) * inset, (hi.y - lo.y) / 2, ((hi.z - lo.z) / 2) * inset);
}
// a dome as two boxes: a wide lower one and a narrow one to the top (so nothing stands in the air over its shoulders)
function domeBoxes(p, q, pts, lq = new THREE.Quaternion()) {
  const lo = V(Infinity, Infinity, Infinity), hi = V(-Infinity, -Infinity, -Infinity);
  for (const v of pts) { lo.min(v); hi.max(v); }
  const c = lo.clone().add(hi).multiplyScalar(0.5), hx = (hi.x - lo.x) / 2, hz = (hi.z - lo.z) / 2, H = hi.y - lo.y;
  return [
    obox(p, q, V(c.x, lo.y + H * 0.3, c.z).applyQuaternion(lq), lq, hx * 0.82, H * 0.3, hz * 0.82),
    obox(p, q, V(c.x, lo.y + H * 0.5, c.z).applyQuaternion(lq), lq, hx * 0.5, H * 0.5 - 0.15, hz * 0.5),
  ];
}
const sphere = (p, q, lc, r) => ({ type: 'sphere', c: p.clone().add(lc.clone().applyQuaternion(q)), r });

// rock pieces and soil pieces as one object
function finish(p, q, rockGeos, soilGeos, mat, cols, extra = {}) {
  const root = new THREE.Group();
  for (const [geos, m, w] of [[rockGeos, mat, 0.12], [soilGeos, soil(), 0.08]]) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos.map(clean)), m);
    mesh.castShadow = mesh.receiveShadow = true;
    ink(mesh, w);
    root.add(mesh);
  }
  root.position.copy(p);
  root.quaternion.copy(q);
  return { mesh: root, cols, ...extra };
}
const qAxis = (ax, a) => new THREE.Quaternion().setFromAxisAngle(ax, a);
const qYaw = (a) => qAxis(AY, a);

// ---------------- spire A: impact-shattered ----------------

function shearedSpire(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const H = 9 + rr() * 5, w = 3.4 + rr() * 1.2, d = 2.6 + rr() * 0.8, sink = 1.6, taper = 0.5 + rr() * 0.15;
  const pts = prismPts(rr, w, d, H + sink, taper, 4 + Math.floor(rr() * 2), 3, 0.4).map((v) => v.setY(v.y - sink));
  const n = V(1, 0.75 + rr() * 0.3, (rr() - 0.5) * 0.4).normalize(), top = H * 0.9, dist = n.y * top;
  cut(pts, n, dist);
  const b = rr() * TAU, n2 = V(Math.cos(b), 0.06, Math.sin(b)).normalize(), d2 = w * 0.06; // the cleft face down its core
  cut(pts, n2, d2);
  const lean = (0.22 + rr() * 0.16) * (rr() < 0.5 ? -1 : 1), lq = qYaw(rr() * TAU).multiply(qAxis(AZ, lean));
  const g = rock(pts, [[n, dist], [n2, d2]], 0.12, seed).applyQuaternion(lq);
  const low = pts.filter((v) => v.y < H * 0.45), high = pts.filter((v) => v.y >= H * 0.45 - 0.5);
  const cols = [hullBox(p, q, low, new THREE.Quaternion(), lq), hullBox(p, q, high, new THREE.Quaternion(), lq, 0.75)];
  const R0 = w * 0.55 + 0.8;
  return finish(p, q, [g, ...crumbs(rr, 0, 0, R0, R0 + 7, 12, 0.3, 1.0)], mounds(rr, 0, 0, R0, 9, 1.0, seed), M.tan, cols);
}

function splitBlock(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const w = 6.5 + rr() * 2, d = 5 + rr() * 2, h = 5 + rr() * 1.5, g0 = 0.5 + rr() * 0.6;
  const pts = prismPts(rr, w, d, h + 0.8, 0.78, 6, 3).map((v) => v.setY(v.y - 0.8));
  const nx = V(1, 0, (rr() - 0.5) * 0.4).normalize(), R = new THREE.Quaternion().setFromUnitVectors(AX, nx);
  const axis = V().crossVectors(AY, nx).normalize();
  const geos = [], cols = [];
  for (const s of [-1, 1]) {
    const n = nx.clone().multiplyScalar(-s), half = cut(copy(pts), n, -g0 / 2); // s = -1 keeps x < -g/2, +1 keeps x > g/2
    const chamfer = V(s * 0.5, 1, rr() - 0.5).normalize(), cd = chamfer.y * h * (0.8 + rr() * 0.1);
    if (rr() < 0.7) cut(half, chamfer, cd);
    const lq = qAxis(axis, -s * (0.05 + rr() * 0.07));
    geos.push(rock(half, [[n, -g0 / 2], [chamfer, cd]], 0.2, seed + s).applyQuaternion(lq));
    cols.push(hullBox(p, q, half, R, lq));
  }
  return finish(p, q, [...geos, ...crumbs(rr, 0, 0, 1, w * 0.5 + 5, 14, 0.3, 1.1)], mounds(rr, 0, 0, w * 0.55, 8, 0.7, seed, 1.2), M.grey, cols);
}

function toppledHalf(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const w = 3.8 + rr(), d = 3 + rr() * 0.6, H = 6 + rr() * 2.5, sink = 1.2;
  const dir = rr() * TAU, yq = qYaw(dir);
  const stump = prismPts(rr, w, d, H + sink, 0.75).map((v) => v.setY(v.y - sink));
  const n = V(1, 0.75, 0).normalize(), dist = n.y * H * 0.82;
  cut(stump, n, dist);
  const geos = [rock(stump, [[n, dist]], 0.18, seed).applyQuaternion(yq)];
  // the broken-off top, lying on its side where it fell, its flat break toward the stump
  const L = 4.5 + rr() * 1.5, top = prismPts(rr, w * 0.85, d * 0.9, L, 0.65), m = V(0, -1, 0);
  cut(top, m, 0); // (its base is the break: flat)
  const lq = yq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, -Math.PI / 2 - 0.12)));
  const at = V(H * 0.5 + 2.5, d * 0.42, 0).applyQuaternion(yq);
  geos.push(rock(top, [[m, 0]], 0.18, seed + 1).applyQuaternion(lq).translate(at.x, at.y, at.z));
  const cols = [hullBox(p, q, stump, new THREE.Quaternion(), yq)];
  const fb = hullBox(V(0, 0, 0), new THREE.Quaternion(), top, new THREE.Quaternion(), lq);
  cols.push(obox(p, q, fb.c.clone().add(at), lq, fb.hx, fb.hy, fb.hz));
  const mid = V(H * 0.3 + 1.5, 0, 0).applyQuaternion(yq);
  return finish(p, q, [...geos, ...crumbs(rr, mid.x, mid.z, 0, 5, 14, 0.3, 1.0)], [...mounds(rr, 0, 0, w * 0.55 + 0.6, 7, 0.8, seed), ...mounds(rr, at.x, at.z, 2.5, 4, 0.5, seed + 9, 0.8)], M.tan, cols);
}

function shardCrown(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const k = 4 + Math.floor(rr() * 2), geos = [], cols = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * TAU + (rr() - 0.5) * 0.6, r = 0.8 + rr() * 1.4;
    const h = (i === 0 ? 7.5 : 3 + rr() * 4.5), w = 1.4 + rr() * 1.1, d = 1 + rr() * 0.8;
    const pts = prismPts(rr, w, d, h + 1, 0.45, 4 + Math.floor(rr() * 2), 3).map((v) => v.setY(v.y - 1));
    const n = V(rr() - 0.5, 1, rr() - 0.5).normalize(), dist = n.y * h * 0.9;
    cut(pts, n, dist);
    const lq = qYaw(-a).multiply(qAxis(AZ, -(0.25 + rr() * 0.45)));
    const at = V(Math.cos(a) * r, 0, Math.sin(a) * r);
    geos.push(rock(pts, [[n, dist]], 0.12, seed + i).applyQuaternion(lq).translate(at.x, at.y, at.z));
    const b = hullBox(V(0, 0, 0), new THREE.Quaternion(), pts, new THREE.Quaternion(), lq, 0.75);
    cols.push(obox(p, q, b.c.clone().add(at), lq, b.hx, b.hy, b.hz));
  }
  const core = new THREE.IcosahedronGeometry(1, 1).scale(5, 1.3, 4.5);
  return finish(p, q, [...geos, ...crumbs(rr, 0, 0, 3, 10, 16, 0.3, 1.0)], [roughen(core, () => 0.2, seed, 0), ...mounds(rr, 0, 0, 5.2, 8, 0.8, seed)], M.grey, cols);
}

// ---------------- spire B: weathered boulders ----------------

function houseRock(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const sx = 6.5 + rr() * 1.5, sy = 3.8 + rr() * 0.8, sz = 4.6 + rr() * 1;
  const pts = blobPts(rr, sx, sy, sz).map((v) => v.setY(v.y + sy * 0.55));
  const a = rr() * TAU, n = V(Math.cos(a), 0.12, Math.sin(a)).normalize(), dist = sx * 0.62;
  cut(pts, n, dist); // a sheer face where a slab came away
  const g = rock(pts, [[n, dist]], 0.3, seed);
  return finish(p, q, [g, ...crumbs(rr, Math.cos(a) * sx * 0.9, Math.sin(a) * sx * 0.9, 0, 4, 8, 0.4, 1.2)], mounds(rr, 0, 0, sx * 0.85, 12, 0.7, seed, 1.4), M.grey, domeBoxes(p, q, pts));
}

function rolledBoulder(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const r = 2.3 + rr() * 0.8, pts = blobPts(rr, r, r * 0.85, r * 1.05).map((v) => v.setY(v.y + r * 0.6));
  const geos = [rock(pts, [], 0.2, seed)], soilG = mounds(rr, 0, 0, r * 0.9, 6, 0.5, seed, 0.8);
  // the track it rolled down: two low berms along a wobbling line behind it, fading out
  const len = 18 + rr() * 10, wob = rr() * TAU;
  for (let z = r * 1.1; z < len; z += 1.3) {
    const f = 1 - z / len, x = Math.sin(z * 0.12 + wob) * 1.2;
    for (const s of [-1, 1]) {
      const b = new THREE.IcosahedronGeometry(1, 1).scale(0.45 + 0.3 * f, 0.12 + 0.22 * f, 0.9).translate(x + s * r * 0.62, 0, -z);
      soilG.push(roughen(b, () => 0.05, seed + z, 0));
    }
  }
  return finish(p, q, [...geos, ...crumbs(rr, 0, -4, 0, 4, 6, 0.2, 0.6)], soilG, M.basalt, [sphere(p, q, V(0, r * 0.6, 0), r * 0.82)]);
}

function crackedBoulder(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const sx = 3.6 + rr() * 0.8, sy = 2.8 + rr() * 0.5, sz = 3.2 + rr() * 0.6;
  const pts = blobPts(rr, sx, sy, sz).map((v) => v.setY(v.y + sy * 0.6));
  const n = V(1, 0.3, (rr() - 0.5) * 0.6).normalize(), dist = 0.3;
  const a = cut(copy(pts), n, dist), b = cut(copy(pts), n.clone().negate(), -dist - 0.01);
  // the broken piece has slid out and settled
  const axis = V().crossVectors(AY, n).normalize(), lq = qAxis(axis, -0.3), shift = n.clone().setY(0).normalize().multiplyScalar(1.3).setY(-0.5);
  const geos = [rock(a, [[n, dist]], 0.22, seed), rock(b, [[n.clone().negate(), -dist]], 0.22, seed + 1).applyQuaternion(lq).translate(shift.x, shift.y, shift.z)];
  const gap = n.clone().setY(0).normalize().multiplyScalar(dist + 0.6);
  const cols = domeBoxes(p, q, a);
  const bb = hullBox(V(0, 0, 0), new THREE.Quaternion(), b, new THREE.Quaternion(), lq, 0.75);
  cols.push(obox(p, q, bb.c.clone().add(shift), lq, bb.hx, bb.hy, bb.hz));
  return finish(p, q, [...geos, ...crumbs(rr, gap.x, gap.z, 0, 2.5, 10, 0.25, 0.8)], mounds(rr, 0, 0, sx * 0.9, 9, 0.6, seed, 1.1), M.basalt, cols);
}

function boulderPile(rr, p, q) {
  const M = mats(), seed = rr() * 100;
  const geos = [], cols = [];
  const k = 4 + Math.floor(rr() * 2);
  for (let i = 0; i < k; i++) {
    const r = i === 0 ? 3 + rr() * 0.8 : 0.9 + rr() * 1.6, a = rr() * TAU, d = i === 0 ? 0 : 2.5 + rr() * 2.5;
    const c = V(Math.cos(a) * d, r * 0.55, Math.sin(a) * d);
    const pts = blobPts(rr, r, r * (0.75 + rr() * 0.2), r * (0.9 + rr() * 0.3));
    geos.push(rock(pts, [], 0.12 * r, seed + i).rotateY(rr() * TAU).translate(c.x, c.y, c.z));
    cols.push(sphere(p, q, c, r * 0.78));
  }
  return finish(p, q, [...geos, ...crumbs(rr, 0, 0, 2, 8, 14, 0.3, 0.9)], mounds(rr, 0, 0, 4, 9, 0.6, seed, 1.2), M.grey, cols);
}

// ---------------- ramps ----------------

// A rock under a riding profile: pts [z, y] back to front; W wide; a ground-high end (y under 0.3) runs into the ground,
// a raised one stands as a face. Shoulders fall away (stepped: in terraces). Colliders: a 1 m slab under each stretch of
// the riding surface, and solid fill from the ground up to 0.4 m under it, so nothing is hollow from the side.
function profileRock(rr, prof, W, opts = {}) {
  const seed = rr() * 100, under = opts.under ?? 1;
  const back = prof[0], front = prof[prof.length - 1];
  const loop = [[front[0] + 0.4, -under]];
  if (front[1] > 0.3) loop.push([front[0] + 0.5, front[1] * 0.45], [front[0] + 0.15, front[1] - 0.1]);
  for (let i = prof.length - 1; i >= 0; i--) loop.push(prof[i]);
  if (back[1] > 0.3) loop.push([back[0] - 0.15, back[1] - 0.1], [back[0] - 0.5, back[1] * 0.45]);
  loop.push([back[0] - 0.4, -under]);
  const n = opts.terraces ? 21 : 11;
  let geo = sweep(n, (i) => ({ o: V(-W / 2 + (i / (n - 1)) * W, 0, 0), ax: AZ, ay: AY }), (i) => {
    const t = Math.sin(Math.PI * (i / (n - 1)));
    let k = 0.55 + 0.45 * Math.pow(t, 0.45);
    if (opts.terraces) k = 0.4 + Math.round(((k - 0.4) / 0.6) * opts.terraces) / opts.terraces * 0.6;
    return loop.map(([a, b]) => [a * (0.94 + 0.06 * t), b < 0 ? b : b * k]);
  });
  const surf = (z) => { for (let i = 1; i < prof.length; i++) if (z <= prof[i][0]) { const [z0, y0] = prof[i - 1], [z1, y1] = prof[i]; return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0); } return front[1]; };
  geo = roughen(geo, (v) => (Math.abs(v.x) < W * 0.32 && v.y > surf(v.z) - 0.8 ? 0.06 : 0.5), seed, opts.terraces ? 0.45 : 0.3);
  return { geo, prof, W, under };
}
function profileCols(p, q, R) {
  const { prof, W, under } = R, cols = [];
  // stretches of about 2.5 m along the surface
  let i = 0;
  while (i < prof.length - 1) {
    let j = i + 1;
    while (j < prof.length - 1 && Math.hypot(prof[j][0] - prof[i][0], prof[j][1] - prof[i][1]) < 2.5) j++;
    const [z0, y0] = prof[i], [z1, y1] = prof[j], len = Math.hypot(z1 - z0, y1 - y0), pitch = -Math.atan2(y1 - y0, z1 - z0);
    const lq = qAxis(AX, pitch), nrm = V(0, 1, 0).applyQuaternion(lq);
    const c = V(0, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(nrm, -0.5);
    cols.push(obox(p, q, c, lq, W * 0.36, 0.5, len / 2 + 0.05));
    const top = Math.min(y0, y1) - 0.4;
    if (top > 0.2) cols.push(obox(p, q, V(0, (top - under) / 2, (z0 + z1) / 2), new THREE.Quaternion(), W * 0.4, (top + under) / 2, Math.abs(z1 - z0) / 2 + 0.05));
    i = j;
  }
  return cols;
}
function rampOf(rr, p, q, prof, W, opts, mat) {
  const R = profileRock(rr, prof, W, opts);
  const front = prof[prof.length - 1], seed = rr() * 100;
  const geos = [R.geo, ...crumbs(rr, 0, front[0] + 2, 0, 3, front[1] > 0.3 ? 7 : 3, 0.4, 1.3)];
  return finish(p, q, geos, [], mat, profileCols(p, q, R));
}
const curve = (z0, z1, n, f) => Array.from({ length: n + 1 }, (_, i) => { const z = z0 + ((z1 - z0) * i) / n; return [z, f(z)]; });

function strataSlab(rr, p, q) {
  const L = 14 + rr() * 6, W = 9 + rr() * 3, h = 3.5 + rr() * 1.5, tail = 4;
  return rampOf(rr, p, q, curve(-L / 2 - tail, L / 2, 12, (z) => h * (z / L + 0.5)), W, { terraces: 3 }, mats().basalt);
}
function curvedKicker(rr, p, q) {
  const L = 12 + rr() * 4, W = 8 + rr() * 3, h = 3.5 + rr() * 1, e = 2.1 + rr() * 0.3;
  return rampOf(rr, p, q, curve(-L / 2, L / 2, 16, (z) => h * Math.pow((z + L / 2) / L, e) - 0.15), W, {}, mats().dark);
}
function tableTop(rr, p, q) {
  const L1 = 9 + rr() * 3, D = 6 + rr() * 4, L2 = 14 + rr() * 4, h = 3 + rr() * 1, W = 10 + rr() * 3;
  const z0 = -(L1 + D / 2), z3 = D / 2 + L2;
  const f = (z) => {
    if (z < -D / 2) { const t = (z - z0) / L1; return h * (t * t * (3 - 2 * t)) * 0.9 + h * 0.1 * t - 0.2; }
    if (z <= D / 2) return h - 0.2;
    const t = (z - D / 2) / L2; return h * (1 - t * t * (3 - 2 * t)) - 0.2;
  };
  return rampOf(rr, p, q, curve(z0, z3, 24, f), W, {}, mats().basalt);
}
function whaleback(rr, p, q) {
  const L = 22 + rr() * 8, W = 9 + rr() * 3, h = 3 + rr() * 1.5;
  return rampOf(rr, p, q, curve(-L / 2, L / 2, 20, (z) => h * Math.pow(Math.sin(Math.PI * (z / L + 0.5)), 1.3) - 0.2), W, {}, mats().dark);
}

// ---------------- snakes ----------------

// a snake ridge along a path: at(s) -> [x, z] in the frame (s from 0 to len), H(s) crest height, w(s) half width
function snakeAlong(rr, p, q, planet, len, at, H, w) {
  const M = mats(), seed = rr() * 100;
  const right = AX.clone().applyQuaternion(q), fwd = AZ.clone().applyQuaternion(q);
  const n = Math.ceil(len / 1.6) + 1, base = [], ups = [], ss = [];
  const mid = at(len / 2);
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * len, [x, z] = at(s);
    const gp = planet.ground(p.clone().addScaledVector(right, x - mid[0]).addScaledVector(fwd, z - mid[1]), V());
    base.push(gp); ups.push(gp.clone().normalize()); ss.push(s);
  }
  const tang = (i) => base[Math.min(n - 1, i + 1)].clone().sub(base[Math.max(0, i - 1)]).normalize();
  const side = (i) => V().crossVectors(tang(i), ups[i]).normalize();
  const taper = (i) => Math.min(1, Math.min(i, n - 1 - i) / 4);
  const crest = (i) => { const t = taper(i), h = H(ss[i]); return 0.12 + (h - 0.12) * t * t * (3 - 2 * t); };
  const prof = (i) => {
    const k = (0.3 + 0.7 * taper(i)) * w(ss[i]), hh = crest(i);
    return [[-k, -0.6], [k, -0.6], [k * 1.2, hh * 0.38], [0.12, hh], [-0.12, hh], [-k * 1.2, hh * 0.38]];
  };
  const railPts = base.map((b, i) => b.clone().addScaledVector(ups[i], crest(i)));
  let geo = sweep(n, (i) => ({ o: base[i].clone().sub(p), ax: side(i), ay: ups[i] }), prof);
  const _w = V();
  geo = roughen(geo, (v) => { _w.copy(v).add(p); for (const c of railPts) if (c.distanceToSquared(_w) < 0.25) return 0; return 0.16; }, seed, 0.12);
  const cols = [];
  for (let i = 0; i < n - 1; i++) {
    const t = base[i + 1].clone().sub(base[i]), sl = t.length();
    t.normalize();
    const up = ups[i].clone().add(ups[i + 1]).normalize(), sd = V().crossVectors(t, up).normalize();
    const hh = Math.min(crest(i), crest(i + 1)), k = (0.3 + 0.7 * Math.min(taper(i), taper(i + 1))) * w(ss[i]);
    const c = base[i].clone().add(base[i + 1]).multiplyScalar(0.5).addScaledVector(up, hh * 0.38 - 0.3);
    cols.push({ type: 'box', c, ax: sd, ay: V().crossVectors(t, sd).normalize(), az: t, hx: k * 1.2 + 0.2, hy: hh * 0.38 + 0.3, hz: sl / 2 + 0.05, rail: railPts });
  }
  const mesh = new THREE.Mesh(geo, rr() < 0.5 ? M.grey : M.basalt);
  mesh.position.copy(p);
  mesh.castShadow = mesh.receiveShadow = true;
  ink(mesh, 0.06);
  return { mesh, cols, rail: { pts: railPts } };
}
// integrate a heading into a path
function pathOf(len, heading) {
  const pts = [[0, 0]], ds = 0.4;
  let x = 0, z = 0;
  for (let s = ds; s <= len + ds; s += ds) { const h = heading(s); x += Math.sin(h) * ds; z += Math.cos(h) * ds; pts.push([x, z]); }
  return (s) => pts[Math.min(pts.length - 1, Math.round(s / ds))];
}
function sinuous(rr, p, q, planet) {
  const len = 30 + rr() * 80, lam = 28 + rr() * 16, Th = Math.min(0.4 + rr() * 0.4, (0.13 * lam) / TAU), ph = rr() * TAU, ph2 = rr() * TAU;
  const H0 = 2.2 + rr() * 0.8, w0 = 1.3 + rr() * 0.3;
  return snakeAlong(rr, p, q, planet, len, pathOf(len, (s) => Th * Math.sin((TAU * s) / lam + ph)), (s) => H0 + 0.35 * Math.sin((TAU * s) / (lam * 1.7) + ph2), () => w0);
}
function meander(rr, p, q, planet) {
  const len = 25 + rr() * 95, k = 0.05 + rr() * 0.03, f1 = 7 + rr() * 5, f2 = 3 + rr() * 2, ph1 = rr() * TAU, ph2 = rr() * TAU, drift = (rr() - 0.5) * 0.03;
  // heading: the integral of a wandering curvature (radius 9 m at the tightest)
  const curv = (s) => Math.max(-0.11, Math.min(0.11, k * (Math.sin(s / f1 + ph1) + 0.5 * Math.sin(s / f2 + ph2)) + drift));
  const hs = [0];
  for (let s = 0.4; s <= len + 0.8; s += 0.4) hs.push(hs[hs.length - 1] + curv(s) * 0.4);
  const H0 = 2 + rr() * 0.6, w0 = 1.2 + rr() * 0.25, lh = 14 + rr() * 10, ph3 = rr() * TAU;
  const hump = (s) => Math.pow(Math.max(0, Math.sin((TAU * s) / lh + ph3)), 2);
  return snakeAlong(rr, p, q, planet, len, pathOf(len, (s) => hs[Math.min(hs.length - 1, Math.round(s / 0.4))]), (s) => H0 * (0.85 + 0.55 * hump(s)), (s) => w0 * (0.85 + 0.35 * hump(s)));
}

export const DRAFTS = {
  spireA: [shearedSpire, splitBlock, toppledHalf, shardCrown],
  spireB: [houseRock, rolledBoulder, crackedBoulder, boulderPile],
  rampA: [strataSlab, curvedKicker],
  rampB: [tableTop, whaleback],
  snakeA: [sinuous],
  snakeB: [meander],
};
