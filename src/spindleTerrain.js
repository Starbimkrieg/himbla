import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// The Spindle's ground as pure maths: size, height field (bumps, ridges, massifs, rilles, scarps, craters, levelled
// sites) and mesh data. No scene or DOM: spindle.js uses it on the main thread, spindleWorker.js prebuilds the rock.

export const RC = 420;         // radius round the long axis (m)
export const L = 5400;         // length along the axis, x (m)
export const CIRC = Math.PI * 2 * RC;
export const START_S = 290; // where the rocket sets you down (the lander's levelled site)
export const CORE_S = L - 420, PAD_S = L - 650;
export const ROCK_S0 = -130, ROCK_S1 = L + 130; // mesh runs a little past both ends

// (s, w): m along the axis, m round the girth (w wraps every CIRC; w = 0 is the top, +y)
export function wrapW(w) { w = ((w % CIRC) + CIRC) % CIRC; return w > CIRC / 2 ? w - CIRC : w; }
export function pointAt(s, w, r, out = new THREE.Vector3()) { const ph = w / RC; return out.set(s, Math.cos(ph) * r, Math.sin(ph) * r); }
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// |x| with a rounded point: a knife-edge 1 - |sin| crest draws as hard light / shade lines on the grid
const softAbs = (x, k = 0.18) => Math.sqrt(x * x + k * k) - k;

// Craters like the Moon's: simple bowls, big complex ones with central peaks, terraced walls. Kept off the start,
// shrine and pad (levelled below).
const KEEP = [[START_S, 0, 130], [CORE_S, 0, 120], [PAD_S, 0, 150]];
const CRATERS = (() => {
  const rr = mulberry32(91);
  const out = [];
  for (let tries = 0; tries < 5000 && out.length < 150; tries++) {
    const big = rr() < 0.24;
    const r = big ? 45 + rr() * 70 : 15 + rr() * 26; // no smaller: on the grid a tinier pit draws as a star of triangles
    const c = { s: 380 + rr() * (L - 760), w: (rr() - 0.5) * CIRC, r };
    if (KEEP.some(([ks, kw, kr]) => Math.hypot(c.s - ks, wrapW(c.w - kw)) < kr + r)) continue;
    if (out.some((o) => Math.hypot(o.s - c.s, wrapW(o.w - c.w)) < (o.r + r) * 0.7)) continue;
    c.kind = big ? (rr() < 0.6 ? 'complex' : 'terraced') : 'bowl'; // no rayed craters: their streaks read as smudges
    if (!big && r > 26) rr(); // spare roll keeps the RNG sequence, so crater positions don't move
    c.d = r * (big ? 0.24 : 0.32);
    c.rays = rr() * 6;
    out.push(c);
  }
  // chains of small pits: secondary impacts
  for (let k = 0; k < 6; k++) {
    let cs = 500 + rr() * (L - 1000), cw = (rr() - 0.5) * CIRC;
    const a = rr() * Math.PI;
    for (let i = 0; i < 7; i++) {
      const c = { s: cs, w: cw, r: 13 + rr() * 4, kind: 'bowl', rays: 0 };
      c.d = c.r * 0.3;
      if (!KEEP.some(([ks, kw, kr]) => Math.hypot(c.s - ks, wrapW(c.w - kw)) < kr + c.r)) out.push(c);
      cs += Math.cos(a) * 34; cw += Math.sin(a) * 34;
    }
  }
  return out;
})();
// craters binned along the axis so a height sample only checks those in reach
const CBIN = 100;
const CRATER_BINS = (() => {
  const bins = [];
  for (const c of CRATERS) {
    const a = Math.floor((c.s - c.r * 4) / CBIN), b = Math.floor((c.s + c.r * 4) / CBIN);
    for (let k = a; k <= b; k++) (bins[k] ||= []).push(c);
  }
  return bins;
})();
// massifs: big rugged mountain blocks (kept off the sites and the line in)
const MASSIFS = (() => {
  const rr = mulberry32(57);
  const out = [];
  for (let tries = 0; tries < 400 && out.length < 9; tries++) {
    const m = { s: 600 + rr() * (L - 1200), w: (rr() - 0.5) * CIRC, r: 55 + rr() * 50, h: 18 + rr() * 22, ph: rr() * 6 };
    if (Math.abs(wrapW(m.w)) < m.r + 40) continue; // not across the straight line along the top
    if (KEEP.some(([ks, kw, kr]) => Math.hypot(m.s - ks, wrapW(m.w - kw)) < kr + m.r * 1.6)) continue;
    if (out.some((o) => Math.hypot(o.s - m.s, wrapW(o.w - m.w)) < o.r + m.r + 60)) continue;
    out.push(m);
  }
  return out;
})();
// rilles: sinuous collapsed lava channels with low levees, mostly running toward the core (a few close to the line in)
const RILLES = [
  { s0: 500, s1: 4600, base: 170, amp: 80, per: 720, wob: 22, wd: 14, dep: 9 },
  { s0: 700, s1: 3900, base: -230, amp: 100, per: 650, wob: 28, wd: 12, dep: 8 },
  { s0: 1200, s1: 4900, base: 430, amp: 110, per: 820, wob: 30, wd: 16, dep: 10 },
  { s0: 400, s1: 3000, base: -500, amp: 95, per: 560, wob: 24, wd: 11, dep: 7 },
  { s0: 2200, s1: 4800, base: -820, amp: 120, per: 700, wob: 35, wd: 13, dep: 8 },
  { s0: 900, s1: 2600, base: 750, amp: 160, per: 480, wob: 45, wd: 13, dep: 7 },
  { s0: 1900, s1: 4000, base: -1100, amp: 200, per: 540, wob: 60, wd: 11, dep: 6 },
  { s0: 3000, s1: 4700, base: 1150, amp: 150, per: 420, wob: 40, wd: 15, dep: 8 },
];
// scarps: long curving thrust cliffs (a step of a few m)
const SCARPS = [
  { s: 1450, w: -300, r: 260, hh: 6, a0: -0.9, a1: 0.9 },
  { s: 2800, w: 400, r: 320, hh: 7, a0: 2.2, a1: 3.9 },
  { s: 3900, w: -900, r: 240, hh: 5, a0: -0.4, a1: 1.4 },
];
// levelled sites: start, shrine, launch pad
const FLATS = [{ s: START_S, w: 0, r: 38 }, { s: CORE_S, w: 0, r: 30 }, { s: PAD_S, w: 0, r: 42 }];

// what the last heightAt call found (for colouring)
const TA = { mare: 0, ray: 0, floor: 0, wall: 0, rim: 0, rille: 0 };

function rawHeight(s, w) {
  const ph = w / RC;
  // every girth term has a whole number of waves, so it meets itself all the way round
  // all highlands: rough, ridged, rolling; no maria
  let h = 5 * Math.sin(s / 83) * Math.cos(ph * 7) + 1.8 * Math.sin(s / 29 + ph * 11) + 0.6 * Math.cos(s / 11 - ph * 23); // small bumps stay small: big ones read, small ones mottle
  h += 14 * Math.cos(ph * 2 + s / 700) + 6 * Math.sin(ph * 3 - s / 450); // lumpy, not round
  // gently wandering ridges along the rock (a product of two waves makes a diamond checkerboard of humps)
  const ridge = 1 - softAbs(Math.sin(ph * 7 + 0.8 * Math.sin(s / 260) + 0.3 * Math.sin(s / 90)), 0.25);
  const ridge2 = 1 - softAbs(Math.sin(ph * 17 + 1.5 * Math.sin(s / 170) + 1.7), 0.35);
  h += ridge ** 3 * 9 + ridge2 ** 3 * 2.5;
  // massifs
  for (const m of MASSIFS) {
    const ds = s - m.s;
    if (Math.abs(ds) > m.r) continue;
    const d = Math.hypot(ds, wrapW(w - m.w)) / m.r;
    if (d >= 1) continue;
    const k = (1 - d * d) ** 2;
    const crag = 1 - softAbs(Math.sin(ds / 14 + m.ph) * Math.cos(wrapW(w - m.w) / 18 - m.ph), 0.3);
    h += m.h * k * (0.7 + 0.3 * crag * crag);
  }
  // rilles, with a low levee each side
  TA.rille = 0;
  for (const r of RILLES) {
    if (s < r.s0 - 100 || s > r.s1 + 100) continue;
    const wr = r.base + r.amp * Math.sin(s / r.per) + r.wob * Math.sin(s / (r.per * 0.33) + 1.1);
    const dd = Math.abs(wrapW(w - wr));
    const wd = r.wd * 1.5; // wide, round trough (a parabola meets the ground at a crease)
    if (dd > wd * 2) continue;
    const fade = smooth(r.s0 - 100, r.s0 + 100, s) * (1 - smooth(r.s1 - 100, r.s1 + 100, s));
    const t = dd / wd;
    // cosine trough, flat at the bottom and flush at the edge, then a low cornerless levee
    if (t < 1) { const v = 0.5 + 0.5 * Math.cos(Math.PI * t); h -= r.dep * v * fade; TA.rille = Math.max(TA.rille, v * fade); }
    else { const l = Math.sin(Math.PI * (t - 1)); h += r.dep * 0.18 * l * l * fade; }
  }
  // scarps: a curving step, high inside the arc
  for (const c of SCARPS) {
    const ds = s - c.s, dw = wrapW(w - c.w);
    const d = Math.hypot(ds, dw);
    if (Math.abs(d - c.r) > 30) continue;
    let a = Math.atan2(dw, ds);
    if (a < c.a0) a += Math.PI * 2;
    if (a > c.a1) continue;
    const edge = Math.min(a - c.a0, c.a1 - a) * c.r; // the step dies away at the arc's ends
    // high side +hh/2, low side -hh/2, easing to nothing 30 m off the cliff (no seam)
    h += c.hh * (0.5 - smooth(c.r - 3, c.r + 3, d)) * smooth(0, 60, edge) * (1 - smooth(12, 30, Math.abs(d - c.r)));
  }
  let ray = 0, floor = 0, wall = 0, rim = 0;
  for (const c of CRATER_BINS[Math.floor(s / CBIN)] || []) {
    const ds = s - c.s;
    if (Math.abs(ds) > c.r * 4) continue;
    const dw = wrapW(w - c.w);
    const d = Math.hypot(ds, dw);
    if (d > c.r * 4) continue;
    const x = d / c.r;
    if (x < 1) {
      let dep;
      if (c.kind === 'complex') {
        dep = 1 - smooth(0.5, 1, x); // flat floor, walls rising smoothly to the rim
        const pq = x / 0.16;
        h += c.d * 0.7 * Math.exp(-pq * pq); // rounded central peak
      } else if (c.kind === 'terraced') {
        // soft stairs, each step eased into the next
        const q = (1 - x * x) * 3, f = Math.floor(q);
        dep = (f + smooth(0.2, 0.8, q - f)) / 3;
      } else dep = (1 - x * x) * (1 - 0.35 * x * x);
      // every bowl eases flat into the rim (no crease)
      h -= c.d * dep * (1 - smooth(Math.max(0.4, 1 - 12 / c.r), 1.0, x)); // over at least 12 m (a couple of grid cells)
      floor = Math.max(floor, 1 - x);
      if (x > 0.55) wall = Math.max(wall, smooth(0.55, 0.85, x));
    }
    // rim and ejecta skirt, rounded with no creases (a peaked rim or stepped skirt draws a star of triangles)
    const rs = Math.max(0.2, 7 / c.r); // rim at least ~14 m across
    if (x > 1.12 - rs * 2.5 && x < 1.12 + rs * 2.5) { const q = (x - 1.12) / rs; h += c.d * 0.42 * Math.exp(-q * q); }
    if (x > 0.9 && x < 1.4) rim = Math.max(rim, 1 - Math.abs(x - 1.12) / 0.25);
    if (x < 2) h += c.d * 0.14 * smooth(0.8, 1.1, x) * (1 - smooth(1.1, 2, x));
    // rays: five broad soft streaks (hairlines break into spokes on the grid)
    if (c.kind === 'ray' && x < 4) ray = Math.max(ray, Math.pow(Math.abs(Math.sin(Math.atan2(dw, ds) * 2.5 + c.rays)), 4) * smooth(1, 1.4, x) * (1 - smooth(1.6, 4, x)) * 0.8);
  }
  TA.mare = 0; TA.ray = ray; TA.floor = floor; TA.wall = wall; TA.rim = Math.max(0, rim);
  // the ends taper to blunt tips, then fall away into space
  const toEnd = Math.min(s, L - s);
  if (toEnd < 300) h -= Math.pow(1 - Math.max(0, toEnd) / 300, 2) * 90;
  const e = Math.max(-s, s - L);
  if (e > 0) h -= Math.min(RC - 110, e * e * 0.06 + e * 1.4);
  return h;
}
for (const f of FLATS) f.h = rawHeight(f.s, f.w);

export function heightAt(s, w) {
  let h = rawHeight(s, w);
  for (const f of FLATS) {
    const d = Math.hypot(s - f.s, wrapW(w - f.w));
    if (d < f.r * 2) { const t = smooth(f.r, f.r * 2, d); h = f.h + (h - f.h) * t; }
  }
  return h;
}


// The rock mesh: a grid of MESH_D m squares over heightAt, two flat triangles each (5 m keeps crater rims round, not
// polygonal). Wraps the girth in MESH_NW columns.
const MESH_D = 5, MESH_NW = Math.round(CIRC / MESH_D);

// Which diagonal splits a square: the one following the ground (buildRockArrays). ha..hd: corner heights at
// a (s, w), b (s, w+), c (s+, w), d (s+, w+).
const diagB = (ha, hb, hc, hd) => Math.abs(hb - hc) <= Math.abs(ha - hd);

// Height of the drawn rock at (s, w), from the mesh's flat triangles: a little above heightAt in hollows, below on
// crests. Anything meant to sit ON the visible rock (the skate trail) should use this.
export function meshHeightAt(s, w) {
  const dw = CIRC / MESH_NW;
  w = ((w % CIRC) + CIRC) % CIRC;
  const fs = (s - ROCK_S0) / MESH_D, fw = w / dw;
  const i = Math.floor(fs), j = Math.floor(fw), v = fs - i, u = fw - j; // u along w, v along s
  const s0 = ROCK_S0 + i * MESH_D, w0 = j * dw;
  const ha = heightAt(s0, w0), hb = heightAt(s0, w0 + dw), hc = heightAt(s0 + MESH_D, w0), hd = heightAt(s0 + MESH_D, w0 + dw);
  if (diagB(ha, hb, hc, hd)) return u + v <= 1 ? ha + (hb - ha) * u + (hc - ha) * v : hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v); // triangles abc, bdc
  return u >= v ? ha + (hb - ha) * u + (hd - hb) * v : ha + (hd - hc) * u + (hc - ha) * v; // triangles abd, adc
}

// The rock's mesh data as plain arrays: positions, colours, index, smooth normals.
export function buildRockArrays() {
    const ds = MESH_D;
    const S0 = ROCK_S0, S1 = ROCK_S1;
    const ns = Math.ceil((S1 - S0) / ds) + 1, nw = MESH_NW;
    const pos = new Float32Array(ns * nw * 3), col = new Float32Array(ns * nw * 3), hs = new Float32Array(ns * nw);
    const c0 = new THREE.Color(0xb0a8c4), c1 = new THREE.Color(0x8a82a2), c2 = new THREE.Color(0x3e3656), cc = new THREE.Color();
    const cMare = new THREE.Color(0x5e5878), cRay = new THREE.Color(0xe6e2f4), cFloor = new THREE.Color(0x6d6688), cWall = new THREE.Color(0x4a4366), cRim = new THREE.Color(0xd8d2ec);
    const rr = mulberry32(5);
    const pt = new THREE.Vector3();
    for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) {
      const s = S0 + i * ds, w = (j / nw) * CIRC;
      const h = heightAt(s, w);
      hs[i * nw + j] = h;
      pointAt(s, w, RC + h, pt);
      const k = (i * nw + j) * 3;
      pos[k] = pt.x; pos[k + 1] = pt.y; pos[k + 2] = pt.z;
      if (h < -40) cc.copy(c2); else cc.copy(c1).lerp(c0, Math.min(1, Math.max(0, (h + 4) / 18)));
      // TA (what heightAt just found): dark maria, darker crater floors
      cc.lerp(cMare, TA.mare * 0.75).lerp(cFloor, TA.floor * 0.45);
      // walls a shade darker, rims brighter: craters read in any light
      cc.lerp(cWall, Math.max(TA.wall * 0.5, TA.rille * 0.55)).lerp(cRim, TA.rim * 0.55);
      cc.offsetHSL(0, 0, (rr() - 0.5) * 0.04);
      col[k] = cc.r; col[k + 1] = cc.g; col[k + 2] = cc.b;
    }
    const idx = new Uint32Array((ns - 1) * nw * 6);
    let q = 0;
    // last column joins the first: no seam round the girth
    // each square split along the diagonal that follows the ground (a fixed one turns slanted rims and rille edges
    // into rows of teeth)
    for (let i = 0; i < ns - 1; i++) for (let j = 0; j < nw; j++) {
      const j2 = (j + 1) % nw; const a = i * nw + j, b = i * nw + j2, c = a + nw, d = b + nw;
      if (diagB(hs[a], hs[b], hs[c], hs[d])) { idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; }
      else { idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = c; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return { pos, col, idx, nor: geo.attributes.normal.array };
}
