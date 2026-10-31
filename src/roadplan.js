import * as THREE from 'three';

// Road planning between two towns, keeping off craters, rims, rock, rilles and steep slopes.
//
// The caller fixes both ends (radial stubs out of each town's ring). Between them: a GRID-metre grid over a corridor round the
// joining great circle (rows across, columns along), real terrain read at every node (height, floor / rim / rock / rille...), and
// Dijkstra where a metre costs more the steeper it climbs, the more it leans across a slope and the worse the ground. Returns the
// cheapest line, smoothed. Deterministic: same terrain, same road.

const GRID = 8; // m between nodes
const PAD = 48; // m the corridor reaches past each end (room to swing round a crater at the town's gate)
const MOVES = [];
for (let di = 0; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) { // never back along the corridor: no hairpins
  if (!di && !dj) continue;
  if ((Math.abs(di) === 2 && Math.abs(dj) === 2) || (Math.abs(di) === 2 && dj === 0) || (Math.abs(dj) === 2 && di === 0)) continue; // 16 moves: knight's moves keep lines off the grid axes
  MOVES.push([di, dj]);
}
// extra cost per metre on bad ground, as multiples of a clear level metre (scaled by the terrain's 0..1 attributes)
const PEN = { floor: 30, rim: 10, rock: 10, crest: 8, rille: 20, ejecta: 2 };
const CURV_SOFT = 0.004, CURV_K = 500; // ground bend (1/m: rim, ridge crest) beyond which a metre costs more
const G_SOFT = 0.12; // grade (rise over run) at which a metre costs GRADE_K more
const GRADE_K = 10;
const G_MAX = 0.45; // steeper is no road at all
const X_SOFT = 0.15; // cross-slope lean, likewise
const X_K = 4;
const END_FUNNEL = 0.8; // near an end |offset| <= this * distance from the end (keeps the stub join straight)

// binary min-heap of node ids keyed by cost
class Heap {
  constructor(n) { this.id = new Int32Array(n); this.k = new Float32Array(n); this.n = 0; }
  push(id, k) {
    let i = this.n++;
    if (i >= this.id.length) { const id2 = new Int32Array(this.id.length * 2), k2 = new Float32Array(this.id.length * 2); id2.set(this.id); k2.set(this.k); this.id = id2; this.k = k2; }
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= k) break;
      this.id[i] = this.id[p]; this.k[i] = this.k[p]; i = p;
    }
    this.id[i] = id; this.k[i] = k;
  }
  pop() {
    const top = this.id[0], id = this.id[--this.n], k = this.k[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= k) break;
      this.id[i] = this.id[c]; this.k[i] = this.k[c]; i = c;
    }
    this.id[i] = id; this.k[i] = k;
    return top;
  }
}

// ground at a direction: surface radius and penalty from what's there to avoid (P.attr after H())
function readGround(P, d, out) {
  out.h = P.H(d.x, d.y, d.z);
  const a = P.attr;
  out.pen = PEN.floor * a.floor + PEN.rim * a.rim + PEN.rock * a.rock + PEN.crest * a.crest + PEN.rille * a.rille + PEN.ejecta * a.ejecta;
  return out;
}

/**
 * Plan a road from `d0` to `d1` (unit directions).
 *   blocks: [{ d, r }]  no-go areas (r m of arc round d): settlement rings, military zones, lakes. A block holding an end
 *                       (the town's own ring) is opened along the way in so the road can leave.
 *   avoid:  [[Vector3 unit directions]] roads already laid: crossing costs, running along costs more
 * Returns { dirs: [unit Vector3...] (from d0 to d1, ~56 m apart), len (great-circle m, d0 to d1), cost, ms, nodes } or null if
 * no way through.
 */
export function planRoad(P, d0, d1, blocks = [], avoid = []) {
  const t0 = performance.now();
  const R = P.R;
  const L = R * Math.acos(Math.max(-1, Math.min(1, d0.dot(d1))));
  const nS = Math.max(2, Math.round(L / GRID)), ds = L / nS;
  const pad = Math.ceil(PAD / ds);
  const W = Math.min(600, Math.max(300, L * 0.5));
  const nT = Math.round(W / GRID);
  const I0 = -pad, NI = nS + 2 * pad + 1, NJ = 2 * nT + 1;
  const N = NI * NJ;
  const e0 = d0.clone(), axis = new THREE.Vector3().crossVectors(d0, d1);
  if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0).addScaledVector(d0, -d0.y);
  axis.normalize();
  const e1 = new THREE.Vector3().crossVectors(axis, e0);
  const node = (i, j) => (i - I0) * NJ + (j + nT);

  // the ground at every node
  const dir = new Float32Array(N * 3), pos = new Float32Array(N * 3), hgt = new Float32Array(N), pen = new Float32Array(N);
  const v = new THREE.Vector3(), g = {};
  for (let i = I0; i < I0 + NI; i++) {
    const th = (i * ds) / R, c = Math.cos(th), s = Math.sin(th);
    for (let j = -nT; j <= nT; j++) {
      const ph = (j * GRID) / R, cp = Math.cos(ph), sp = Math.sin(ph);
      v.set(0, 0, 0).addScaledVector(e0, c * cp).addScaledVector(e1, s * cp).addScaledVector(axis, sp);
      const n = node(i, j);
      readGround(P, v, g);
      dir[n * 3] = v.x; dir[n * 3 + 1] = v.y; dir[n * 3 + 2] = v.z;
      pos[n * 3] = v.x * g.h; pos[n * 3 + 1] = v.y * g.h; pos[n * 3 + 2] = v.z * g.h;
      hgt[n] = g.h; pen[n] = g.pen;
    }
  }
  // ground bend per node: a real rim or crest bends hard, a worn one doesn't (the attributes alone call both a rim)
  for (let i = I0 + 1; i < I0 + NI - 1; i++) for (let j = -nT + 1; j < nT; j++) {
    const n = node(i, j);
    const cs = Math.abs(hgt[n - NJ] + hgt[n + NJ] - 2 * hgt[n]) / (ds * ds), ct = Math.abs(hgt[n - 1] + hgt[n + 1] - 2 * hgt[n]) / (GRID * GRID);
    pen[n] += CURV_K * Math.max(0, Math.max(cs, ct) - CURV_SOFT);
  }
  // a thin rim or ditch can fall between nodes: each takes some of its neighbours' worst
  const pen2 = new Float32Array(pen);
  for (let i = I0; i < I0 + NI; i++) for (let j = -nT; j <= nT; j++) {
    const n = node(i, j);
    let m = pen[n];
    if (j > -nT) m = Math.max(m, pen[n - 1] * 0.7);
    if (j < nT) m = Math.max(m, pen[n + 1] * 0.7);
    if (i > I0) m = Math.max(m, pen[n - NJ] * 0.7);
    if (i < I0 + NI - 1) m = Math.max(m, pen[n + NJ] * 0.7);
    pen2[n] = m;
  }
  // slope per node: along the columns (gs) and across them (gt)
  const gs = new Float32Array(N), gt = new Float32Array(N);
  for (let i = I0; i < I0 + NI; i++) for (let j = -nT; j <= nT; j++) {
    const n = node(i, j);
    const a = i > I0 ? n - NJ : n, b = i < I0 + NI - 1 ? n + NJ : n, c = j > -nT ? n - 1 : n, d = j < nT ? n + 1 : n;
    gs[n] = (hgt[b] - hgt[a]) / (((b - a) / NJ || 1) * ds);
    gt[n] = (hgt[d] - hgt[c]) / (((d - c) || 1) * GRID);
  }
  // blocked nodes: inside a block, or outside the funnel at an end
  const blocked = new Uint8Array(N);
  const startN = node(0, 0), endN = node(nS, 0);
  const cosOf = (r) => Math.cos(r / R);
  const bl = blocks.map((b) => ({ d: b.d, c: cosOf(b.r), r: b.r }));
  // a block holding an end shrinks to that end's distance less a margin, so the road can get out
  for (const b of bl) {
    for (const e of [d0, d1]) {
      const dist = R * Math.acos(Math.min(1, e.x * b.d.x + e.y * b.d.y + e.z * b.d.z));
      if (dist < b.r) { b.r = Math.max(0, dist - 10); b.c = cosOf(b.r); }
    }
  }
  const avoidD = avoid.flat();
  for (let i = I0; i < I0 + NI; i++) {
    const fromEnd = Math.min(Math.abs(i), Math.abs(i - nS)) * ds;
    const outside = i < 0 || i > nS;
    for (let j = -nT; j <= nT; j++) {
      const n = node(i, j);
      const x = dir[n * 3], y = dir[n * 3 + 1], z = dir[n * 3 + 2];
      let bad = false;
      for (const b of bl) if (x * b.d.x + y * b.d.y + z * b.d.z > b.c) { bad = true; break; }
      // near an end the corridor funnels to the stub; past the end it's only a bay to swing out of, not a way round
      if (!bad && Math.abs(j) * GRID > END_FUNNEL * (outside ? Math.max(fromEnd, 0) + 40 : fromEnd) + 12) bad = true;
      blocked[n] = bad ? 1 : 0;
    }
  }
  blocked[startN] = blocked[endN] = 0;
  // existing roads: crossing costs, but only far from the ends (roads leaving a town run close together)
  if (avoidD.length) {
    const near = cosOf(16), farFromEnds = cosOf(160);
    for (let n = 0; n < N; n++) {
      const x = dir[n * 3], y = dir[n * 3 + 1], z = dir[n * 3 + 2];
      if (x * d0.x + y * d0.y + z * d0.z > farFromEnds || x * d1.x + y * d1.y + z * d1.z > farFromEnds) continue;
      for (const q of avoidD) if (x * q.x + y * q.y + z * q.z > near) { pen2[n] += 30; break; }
    }
  }

  // the search
  const dist = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
  const heap = new Heap(4096);
  dist[startN] = 0; heap.push(startN, 0);
  const done = new Uint8Array(N);
  let reached = false;
  while (heap.n) {
    const n = heap.pop();
    if (done[n]) continue;
    done[n] = 1;
    if (n === endN) { reached = true; break; }
    const i = Math.floor(n / NJ) + I0, j = (n % NJ) - nT;
    for (const [di, dj] of MOVES) {
      const ii = i + di, jj = j + dj;
      if (ii < I0 || ii >= I0 + NI || jj < -nT || jj > nT) continue;
      const m = node(ii, jj);
      if (done[m] || blocked[m]) continue;
      const dx = pos[m * 3] - pos[n * 3], dy = pos[m * 3 + 1] - pos[n * 3 + 1], dz = pos[m * 3 + 2] - pos[n * 3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const dh = hgt[m] - hgt[n];
      const run = Math.sqrt(Math.max(1, len * len - dh * dh));
      const gr = Math.abs(dh) / run;
      if (gr > G_MAX) continue;
      // cross-slope lean: the slope across the direction of travel
      const ux = (di * ds) / run, uy = (dj * GRID) / run, un = Math.hypot(ux, uy) || 1;
      const sl = (gs[n] + gs[m]) * 0.5, tl = (gt[n] + gt[m]) * 0.5;
      const cross = Math.abs(sl * (uy / un) - tl * (ux / un));
      const gk = gr / G_SOFT, xk = cross / X_SOFT;
      const mult = 1 + (pen2[n] + pen2[m]) * 0.5 + GRADE_K * gk * gk + X_K * xk * xk;
      const nd = dist[n] + len * mult;
      if (nd < dist[m]) { dist[m] = nd; from[m] = n; heap.push(m, nd); }
    }
  }
  if (!reached) return null;

  // trace back to the start, then smooth (each point toward its neighbours, ends held)
  const path = [];
  for (let n = endN; n >= 0; n = from[n]) { path.push(n); if (n === startN) break; }
  path.reverse();
  let pts = path.map((n) => new THREE.Vector3(dir[n * 3], dir[n * 3 + 1], dir[n * 3 + 2]));
  for (let it = 0; it < 24; it++) {
    const nx = pts.map((p) => p.clone());
    for (let k = 1; k < pts.length - 1; k++) nx[k].copy(pts[k]).multiplyScalar(0.5).addScaledVector(pts[k - 1], 0.25).addScaledVector(pts[k + 1], 0.25).normalize();
    pts = nx;
  }
  // thin to a control point every ~56 m (the caller splines through them)
  const out = [pts[0]];
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    acc += R * Math.acos(Math.min(1, pts[k].dot(pts[k - 1])));
    if (acc >= 56 && k < pts.length - 4) { out.push(pts[k]); acc = 0; }
  }
  out.push(pts[pts.length - 1]);
  return { dirs: out, cost: dist[endN], len: L, ms: performance.now() - t0, nodes: N };
}

// Quality of a finished centreline (unit directions ~4 m apart, `cum` = arc length at each), ignoring the first and last `skip`
// metres (plateau foot, fixed whatever the line): share of length steeper than `steep` over ~16 m, and share on crater floor, rille, rock.
export function roadQuality(P, pts, cum, skip = 130, steep = 0.25) {
  const R = P.R, n = pts.length;
  const h = new Float32Array(n), off = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = P.H(pts[i].x, pts[i].y, pts[i].z);
    const a = P.attr;
    off[i] = a.floor > 0.25 || a.rille > 0.3 || a.rock > 0.5 ? 1 : 0;
  }
  let m = 0, steepN = 0, offN = 0, maxGrade = 0;
  for (let i = 2; i < n - 2; i++) {
    if (cum[i] < skip || cum[n - 1] - cum[i] < skip) continue;
    const run = R * Math.acos(Math.min(1, pts[i - 2].dot(pts[i + 2])));
    const gr = Math.abs(h[i + 2] - h[i - 2]) / Math.max(1, run);
    maxGrade = Math.max(maxGrade, gr);
    if (gr > steep) steepN++;
    if (off[i]) offN++;
    m++;
  }
  return { steep: steepN / Math.max(1, m), off: offN / Math.max(1, m), maxGrade, n: m };
}
