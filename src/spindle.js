// The Spindle (Meridian finale): a 7 km asteroid tumbling round the Moon, rolling on its long axis,
// tied somehow to the Monolith. Meridian's rocket drops you at one end; its Quantum Core sits at the
// other; an alien mothership turns up as soon as you set off and hunts you all the way across, then
// throws everything at the extraction pad while Meridian's pod comes down for you.
//
// How it runs: the Spindle is a real cylinder of rock laid along the x axis, and you can run all the
// way round it. While you're there "up" points away from that axis instead of away from the Moon's
// centre (geo.js GRAV: physics, the camera, shots and effects all ask upAt), so its girth is a loop
// you can circle and its length a straight run to the core; its blunt ends drop into open space. The
// Moon is hidden and frozen while you're away, g.planet points at this world, and the sky (the Moon
// huge overhead, the Earth, the stars and the sun) wheels round the axis: the asteroid's roll.
// From the Moon you see the real thing: a long, spinning rock overhead (spindleGeometry, in the sky).
import * as THREE from 'three';
import { Kit, T, G, GLASS, BEAM } from './outpostModels.js';
import { toon, glow, ink } from './toon.js';
import { makeProp } from './storyAssets.js';
import { mulberry32 } from './rng.js';
import { SUN, tangent, GRAV } from './geo.js';
import { makeShuttle, makePlanets } from './models.js';

const RC = 420;         // the rock's girth (radius round its long axis)
const L = 5400;         // its length along the axis (x)
const CIRC = Math.PI * 2 * RC;
const AX = new THREE.Vector3(1, 0, 0);
const CHECK = [330, 1300, 2300, 3300, 4300];
const CORE_S = L - 420, PAD_S = L - 650;
const TEAL = 0x7dffd4, PINK = 0xff2e88, VIO = 0xc77dff;

// ---------- the shape (also used for the asteroid in the Moon's sky) ----------
export function spindleGeometry(len = 1000, rad = 120, seed = 3) {
  const g = new THREE.CylinderGeometry(rad, rad, len, 28, 60, false);
  const p = g.attributes.position;
  const rr = mulberry32(seed);
  const ph = [rr() * 6, rr() * 6, rr() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / len + 0.5; // 0..1 along the length
    const a = Math.atan2(z, x);
    const taper = Math.pow(Math.max(0.02, Math.sin(Math.PI * t)), 0.55);
    const lump = 1 + 0.18 * Math.sin(t * 13 + ph[0]) * Math.cos(a * 3 + ph[1]) + 0.1 * Math.sin(t * 31 + a * 5 + ph[2]) + 0.12 * Math.sin(t * 5 + 1.3);
    const r = taper * lump;
    p.setXYZ(i, x * r, y + Math.sin(a * 2 + t * 9) * len * 0.004, z * r * 0.82);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- the rock ----------
// (s, w): metres along the axis, and metres round the girth (w wraps every CIRC; w = 0 is the top, +y)
const _d = new THREE.Vector3();
function wrapW(w) { w = ((w % CIRC) + CIRC) % CIRC; return w > CIRC / 2 ? w - CIRC : w; }
function radial(p, out = new THREE.Vector3()) { out.set(0, p.y, p.z); if (out.lengthSq() < 1e-8) out.set(0, 1, 0); return out.normalize(); }
function rad(p) { return Math.hypot(p.y, p.z); }
function pointAt(s, w, r, out = new THREE.Vector3()) { const ph = w / RC; return out.set(s, Math.cos(ph) * r, Math.sin(ph) * r); }

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const PAD_DECK = 2.4; // the launch pad stands this high on its plinth

// Craters like the Moon's: simple bowls, big complex ones with central peaks, terraced walls, and a few
// bright rayed ones. Kept off the start, the shrine and the pad (those sites are levelled below).
const KEEP = [[CHECK[0] - 40, 0, 130], [CORE_S, 0, 120], [PAD_S, 0, 150]];
const CRATERS = (() => {
  const rr = mulberry32(91);
  const out = [];
  for (let tries = 0; tries < 5000 && out.length < 150; tries++) {
    const big = rr() < 0.24;
    const r = big ? 45 + rr() * 70 : 9 + rr() * 30;
    const c = { s: 380 + rr() * (L - 760), w: (rr() - 0.5) * CIRC, r };
    if (KEEP.some(([ks, kw, kr]) => Math.hypot(c.s - ks, wrapW(c.w - kw)) < kr + r)) continue;
    if (out.some((o) => Math.hypot(o.s - c.s, wrapW(o.w - c.w)) < (o.r + r) * 0.7)) continue;
    c.kind = big ? (rr() < 0.6 ? 'complex' : 'terraced') : rr() < 0.22 ? 'ray' : 'bowl';
    c.d = r * (big ? 0.24 : 0.32);
    c.rays = rr() * 6;
    out.push(c);
  }
  // (a chain of small pits along a line here and there: secondary impacts)
  for (let k = 0; k < 6; k++) {
    let cs = 500 + rr() * (L - 1000), cw = (rr() - 0.5) * CIRC;
    const a = rr() * Math.PI;
    for (let i = 0; i < 7; i++) {
      const c = { s: cs, w: cw, r: 6 + rr() * 5, kind: 'bowl', rays: 0 };
      c.d = c.r * 0.35;
      if (!KEEP.some(([ks, kw, kr]) => Math.hypot(c.s - ks, wrapW(c.w - kw)) < kr + c.r)) out.push(c);
      cs += Math.cos(a) * 15; cw += Math.sin(a) * 15;
    }
  }
  return out;
})();
// (each height sample only looks at the craters that can reach it: binned along the axis)
const CBIN = 100;
const CRATER_BINS = (() => {
  const bins = [];
  for (const c of CRATERS) {
    const a = Math.floor((c.s - c.r * 4) / CBIN), b = Math.floor((c.s + c.r * 4) / CBIN);
    for (let k = a; k <= b; k++) (bins[k] ||= []).push(c);
  }
  return bins;
})();
// massifs: big rugged mountain blocks standing out of the highlands (kept off the sites and the line in)
const MASSIFS = (() => {
  const rr = mulberry32(57);
  const out = [];
  for (let tries = 0; tries < 400 && out.length < 9; tries++) {
    const m = { s: 600 + rr() * (L - 1200), w: (rr() - 0.5) * CIRC, r: 55 + rr() * 50, h: 18 + rr() * 22, ph: rr() * 6 };
    if (Math.abs(wrapW(m.w)) < m.r + 40) continue; // (not across the straight line down the top)
    if (KEEP.some(([ks, kw, kr]) => Math.hypot(m.s - ks, wrapW(m.w - kw)) < kr + m.r * 1.6)) continue;
    if (out.some((o) => Math.hypot(o.s - m.s, wrapW(o.w - m.w)) < o.r + m.r + 60)) continue;
    out.push(m);
  }
  return out;
})();
// rilles: sinuous collapsed lava channels, each its own stretch of the rock, with low levees
// (most run long-ways, down the rock toward the core, a few of them close either side of the line in)
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
// scarps: long curving cliffs where the crust thrust up over itself (a step of a few metres)
const SCARPS = [
  { s: 1450, w: -300, r: 260, hh: 6, a0: -0.9, a1: 0.9 },
  { s: 2800, w: 400, r: 320, hh: 7, a0: 2.2, a1: 3.9 },
  { s: 3900, w: -900, r: 240, hh: 5, a0: -0.4, a1: 1.4 },
];
// levelled sites: the start, the shrine, the launch pad
const FLATS = [{ s: CHECK[0] - 40, w: 0, r: 38 }, { s: CORE_S, w: 0, r: 30 }, { s: PAD_S, w: 0, r: 42 }];

// what the last heightAt call found there (for the colouring)
const TA = { mare: 0, ray: 0, floor: 0, wall: 0, rim: 0, rille: 0 };

function rawHeight(s, w) {
  const ph = w / RC;
  // (every term round the girth has a whole number of waves, so it meets itself all the way round)
  // all highlands: rough, ridged, rolling; no smooth maria out here
  let h = 5 * Math.sin(s / 83) * Math.cos(ph * 7) + 1.8 * Math.sin(s / 29 + ph * 11) + 0.6 * Math.cos(s / 11 - ph * 23); // (small bumps kept small: big ones read, small ones mottle)
  h += 14 * Math.cos(ph * 2 + s / 700) + 6 * Math.sin(ph * 3 - s / 450); // the rock is lumpy, not round
  // ridges running long-ways down the rock (gently wandering), not a product of two waves: that made a
  // diamond checkerboard of humps that read as patches across the ground
  const ridge = 1 - Math.abs(Math.sin(ph * 7 + 0.8 * Math.sin(s / 260) + 0.3 * Math.sin(s / 90)));
  const ridge2 = 1 - Math.abs(Math.sin(ph * 17 + 1.5 * Math.sin(s / 170) + 1.7));
  h += ridge ** 3 * 9 + ridge2 ** 3 * 2.5;
  // massifs
  for (const m of MASSIFS) {
    const ds = s - m.s;
    if (Math.abs(ds) > m.r) continue;
    const d = Math.hypot(ds, wrapW(w - m.w)) / m.r;
    if (d >= 1) continue;
    const k = (1 - d * d) ** 2;
    const crag = 1 - Math.abs(Math.sin(ds / 9 + m.ph) * Math.cos(wrapW(w - m.w) / 13 - m.ph));
    h += m.h * k * (0.7 + 0.3 * crag * crag);
  }
  // rilles (with a low levee each side)
  TA.rille = 0;
  for (const r of RILLES) {
    if (s < r.s0 - 100 || s > r.s1 + 100) continue;
    const wr = r.base + r.amp * Math.sin(s / r.per) + r.wob * Math.sin(s / (r.per * 0.33) + 1.1);
    const dd = Math.abs(wrapW(w - wr));
    if (dd > r.wd * 2) continue;
    const fade = smooth(r.s0 - 100, r.s0 + 100, s) * (1 - smooth(r.s1 - 100, r.s1 + 100, s));
    if (dd < r.wd) { h -= r.dep * (1 - (dd / r.wd) ** 2) * fade; TA.rille = Math.max(TA.rille, (1 - (dd / r.wd) ** 2) * fade); }
    else h += r.dep * 0.2 * Math.sin((Math.PI * (dd - r.wd)) / r.wd) * fade;
  }
  // scarps: a curving step, high on the inside of the arc
  for (const c of SCARPS) {
    const ds = s - c.s, dw = wrapW(w - c.w);
    const d = Math.hypot(ds, dw);
    if (Math.abs(d - c.r) > 30) continue;
    let a = Math.atan2(dw, ds);
    if (a < c.a0) a += Math.PI * 2;
    if (a > c.a1) continue;
    const edge = Math.min(a - c.a0, c.a1 - a) * c.r; // (the step dies away at the ends of the arc)
    // (high side +hh/2, low side -hh/2, easing back to nothing 30 m off the cliff so there's no seam)
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
        dep = x < 0.65 ? 1 : 1 - ((x - 0.65) / 0.35) ** 2; // a flat floor, steep walls
        h += c.d * 0.75 * Math.max(0, 1 - x / 0.2) ** 2; // the central peak
      } else if (c.kind === 'terraced') {
        const q = 1 - x * x;
        const st = Math.floor(q * 4) / 4;
        dep = st + (q - st) * 0.3 + 0.05;
      } else dep = 1 - x * x;
      h -= c.d * dep;
      floor = Math.max(floor, 1 - x);
      if (x > 0.55) wall = Math.max(wall, smooth(0.55, 0.85, x));
    } else if (x < 1.35) { h += c.d * 0.42 * (1 - Math.abs(x - 1.17) / 0.18); rim = Math.max(rim, 1 - Math.abs(x - 1.15) / 0.2); } // the rim
    if (x >= 1 && x < 2) h += c.d * 0.14 * (2 - x); // ejecta
    if (c.kind === 'ray' && x < 4) ray = Math.max(ray, Math.pow(Math.abs(Math.sin(Math.atan2(dw, ds) * 6 + c.rays)), 16) * (1 - smooth(1.1, 4, x)));
  }
  TA.mare = 0; TA.ray = ray; TA.floor = floor; TA.wall = wall; TA.rim = Math.max(0, rim);
  // the ends: they taper to blunt tips, then fall away into open space
  const toEnd = Math.min(s, L - s);
  if (toEnd < 300) h -= Math.pow(1 - Math.max(0, toEnd) / 300, 2) * 90;
  const e = Math.max(-s, s - L);
  if (e > 0) h -= Math.min(RC - 110, e * e * 0.06 + e * 1.4);
  return h;
}
for (const f of FLATS) f.h = rawHeight(f.s, f.w);

function heightAt(s, w) {
  let h = rawHeight(s, w);
  for (const f of FLATS) {
    const d = Math.hypot(s - f.s, wrapW(w - f.w));
    if (d < f.r * 2) { const t = smooth(f.r, f.r * 2, d); h = f.h + (h - f.h) * t; }
  }
  return h;
}

// The planet interface the physics, camera and effects use (planet.js has the Moon's). Heights are
// measured from the axis, not a centre.
class SpindleWorld {
  constructor() { this.colliders = null; this.lastLake = null; this.R = RC; this.craters = []; this.rails = []; }
  rimRailsNear() { return []; } // (no grind rails up here)
  sw(p) { return [p.x, Math.atan2(p.z, p.y) * RC]; }
  surface(p, outN) {
    const [s, w] = this.sw(p);
    const h = heightAt(s, w);
    if (outN) {
      const e = 0.8;
      const hs = (heightAt(s + e, w) - heightAt(s - e, w)) / (2 * e);
      const hw = (heightAt(s, w + e) - heightAt(s, w - e)) / (2 * e);
      const up = radial(p, _d);
      const tw = new THREE.Vector3().crossVectors(AX, up); // round the girth, toward +w
      outN.copy(up).addScaledVector(AX, -hs).addScaledVector(tw, -hw).normalize();
    }
    return RC + h;
  }
  ground(v, out = new THREE.Vector3(), lift = 0) {
    const r = this.surface(v) + lift;
    const up = radial(v, _d);
    return out.set(v.x, up.y * r, up.z * r);
  }
  altitude(p) { return rad(p) - this.surface(p); }
  visible(a, b, steps = 12) { const q = new THREE.Vector3(); for (let i = 1; i < steps; i++) { q.lerpVectors(a, b, i / steps); if (this.altitude(q) < -0.5) return false; } return true; }
  inLake() { return null; }
  update() {}
}

// a point on the rock, and a frame there (up = away from the axis, forward = along it)
function bandPoint(s, w, lift = 0) { return pointAt(s, w, RC + heightAt(s, w) + lift); }
function bandFrame(s, w, obj, lift = 0) {
  const p = bandPoint(s, w, lift);
  const up = radial(p);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, AX), up, AX);
  obj.position.copy(p);
  obj.quaternion.setFromRotationMatrix(m);
  return obj;
}
// a glowing line on the rock, through (s, w) points
function groundLine(pts, r, color, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, r, 4, closed), glow(color));
}

// ---------- kit pieces ----------
const kits = new Map();
function bake(key, fn) { let r = kits.get(key); if (!r) { const k = new Kit(TEAL, 5, false); fn(k); r = k.finish(); kits.set(key, r); } return r.root.clone(); }

const spire = (k) => {
  const rr = mulberry32(17);
  k.cyl(3.4, 4.2, 1.6, 7, T(0x4a4260), 0, 0, 0, { outline: 0.06 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, h = 4 + rr() * 6;
    k.add(new THREE.OctahedronGeometry(1, 0).scale(0.9, h / 1.6, 0.9), G(i % 2 ? TEAL : VIO), Math.cos(a) * 1.6, h * 0.45, Math.sin(a) * 1.6, { rx: Math.sin(a) * 0.3, rz: Math.cos(a) * 0.3, outline: 0.04 });
  }
};
const obelisk = (k) => { k.box(2.2, 11, 0.9, T(0x0d0a14), 0, 0, 0, { outline: 0.08 }); k.box(0.12, 9, 0.92, G(TEAL), 0, 1, 0, { outline: 0 }); };
const lander = (k) => {
  k.cyl(12, 12.5, 0.6, 28, T(0x5b5870), 0, 0, 0, { outline: 0.05 });
  k.ring(11.6, 0.2, G(0x2ec4ff), 0, 0.62, 0);
  // the Meridian rocket that brought you, standing on its fins
  k.cyl(2.4, 2.6, 18, 18, T(0xeeecf6), 0, 1.8, 0, { outline: 0.1 });
  k.cyl(2.45, 2.45, 2.2, 18, T(0x2ec4ff), 0, 10, 0, { outline: 0 });
  k.cyl(2.45, 2.45, 0.8, 18, T(0xffc83a), 0, 13, 0, { outline: 0 });
  k.add(new THREE.ConeGeometry(2.4, 6, 18), T(0xeeecf6), 0, 22.8, 0, { outline: 0.08 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.add(new THREE.BoxGeometry(0.3, 5, 3), T(0x2ec4ff), Math.cos(a) * 3, 3.6, Math.sin(a) * 3, { ry: -a, outline: 0.04 }); }
  k.cyl(1.6, 2.2, 1.8, 14, T(0x2a2440), 0, 0.6, 0, { outline: 0.04 });
  for (const sx of [-1, 1]) k.flag(sx * 9, 6, 8, 0x2ec4ff);
};
const shrine = (k) => {
  k.cyl(16, 17, 0.6, 32, T(0x2a2440), 0, 0, 0, { outline: 0.06 });
  k.ring(15.6, 0.25, G(TEAL), 0, 0.62, 0);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.at(Math.cos(a) * 13, Math.sin(a) * 13, -a); obelisk(k); k.at(); }
  k.cyl(2.2, 2.8, 2.2, 8, T(0x0d0a14), 0, 0.6, 0, { outline: 0.06 });
  k.ring(2.3, 0.12, G(TEAL), 0, 2.8, 0);
};
// the extraction pad: a proper launch pad, a 32 m deck on a plinth with four ramps up to it
const PAD_R = 16, RAMP_L = 12;
const extract = (k) => {
  const D = PAD_DECK;
  k.cyl(PAD_R + 1.5, PAD_R + 2.2, 1.2, 36, T(0x3a3550), 0, -0.6, 0, { outline: 0.06 }); // footing
  k.cyl(PAD_R, PAD_R + 0.6, D, 36, T(0x5b5870), 0, 0, 0, { outline: 0.06 }); // the plinth
  k.cyl(PAD_R + 0.2, PAD_R + 0.2, 0.3, 36, T(0x7a7690), 0, D - 0.3, 0, { outline: 0.04 }); // the deck
  k.ring(PAD_R - 1.2, 0.3, G(0xffc83a), 0, D + 0.02, 0);
  k.ring(PAD_R * 0.45, 0.25, G(0x2ec4ff), 0, D + 0.02, 0);
  k.box(1.6, 0.06, PAD_R * 1.4, T(0xffc83a), 0, D + 0.02, 0, { outline: 0 });
  k.box(PAD_R * 1.4, 0.06, 1.6, T(0xffc83a), 0, D + 0.02, 0, { outline: 0 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.ball(0.35, G(0x2ec4ff), Math.cos(a) * (PAD_R - 0.4), D + 0.3, Math.sin(a) * (PAD_R - 0.4), { outline: 0 }); }
  // ramps (between the corners: N, E, S, W) and lamp masts on the corners between them
  // a wedge: from the deck's edge (deck height) down to the ground RAMP_L out; width 7
  const wedge = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(RAMP_L, 0), new THREE.Vector2(0, D)]);
  const wg = new THREE.ExtrudeGeometry(wedge, { depth: 7, bevelEnabled: false }).translate(0, 0, -3.5);
  const stripe = new THREE.BoxGeometry(Math.hypot(D, RAMP_L) * 0.92, 0.05, 0.5).rotateZ(-Math.atan2(D, RAMP_L)).translate(RAMP_L / 2, D / 2 + 0.04, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rx = Math.sin(a), rz = Math.cos(a);
    k.add(wg.clone(), T(0x6b6684), rx * (PAD_R - 0.05), 0, rz * (PAD_R - 0.05), { ry: a - Math.PI / 2, outline: 0.05 });
    k.add(stripe.clone(), G(0xffc83a), rx * (PAD_R - 0.05), 0, rz * (PAD_R - 0.05), { ry: a - Math.PI / 2, outline: 0 });
    const b = a + Math.PI / 4;
    k.cyl(0.25, 0.3, 9, 8, T(0x2a2440), Math.sin(b) * (PAD_R + 1), D, Math.cos(b) * (PAD_R + 1), { outline: 0.04 });
    k.ball(0.55, G(0xffc83a), Math.sin(b) * (PAD_R + 1), D + 9.2, Math.cos(b) * (PAD_R + 1), { outline: 0 });
  }
};

// the mothership: a dark, wide, ribbed saucer with a teal rim, a glass dome and three weapon eyes
function makeMothership() {
  const root = new THREE.Group();
  root.add(bake('mother', (k) => {
    k.add(new THREE.SphereGeometry(38, 36, 14).scale(1, 0.26, 1), T(0x241a33), 0, 0, 0, { outline: 0.4 });
    k.add(new THREE.TorusGeometry(37.5, 1.4, 6, 48).rotateX(Math.PI / 2), G(TEAL), 0, 0, 0, { outline: 0 });
    k.add(new THREE.SphereGeometry(14, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS(TEAL, 0.45), 0, 7, 0, { outline: 0 });
    k.add(new THREE.TorusGeometry(14.2, 0.6, 4, 32).rotateX(Math.PI / 2), T(0x3a2b4f), 0, 7, 0, { outline: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.add(new THREE.BoxGeometry(1.2, 2.2, 30), T(0x3a2b4f), Math.cos(a) * 20, 6.2, Math.sin(a) * 20, { ry: -a + Math.PI / 2, rx: 0.18, outline: 0.06 });
      k.add(new THREE.ConeGeometry(1.4, 9, 6).rotateX(Math.PI), T(0x1a1426), Math.cos(a) * 28, -9, Math.sin(a) * 28, { outline: 0.05 });
    }
    k.add(new THREE.CylinderGeometry(9, 6, 5, 16), T(0x1a1426), 0, -9, 0, { outline: 0.1 });
    k.add(new THREE.CircleGeometry(7, 20).rotateX(Math.PI / 2), G(VIO), 0, -11.6, 0, { outline: 0 });
  }));
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(40, 3, 6, 48), BEAM(TEAL, 0.18));
  glowRing.rotation.x = Math.PI / 2;
  root.add(glowRing);
  const eyes = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10), glow(PINK));
    pod.position.set(Math.cos(a) * 22, -8.5, Math.sin(a) * 22);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.5, 6, 18).rotateX(Math.PI / 2), toon(0x1a1426));
    ring.position.copy(pod.position);
    ink(ring, 0.06);
    root.add(pod, ring);
    eyes.push(pod);
  }
  return { root, eyes };
}

function makeDrone() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), glow(PINK));
  core.userData.lit = core.material;
  core.userData.dark = toon(0x2a2236);
  g.userData.core = core;
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(1.7, 0), toon(0x241a33));
  ink(shell, 0.05);
  shell.scale.set(1, 0.6, 1);
  g.add(shell, core);
  for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 4), toon(0x3a2b4f)); const a = (i / 4) * Math.PI * 2; sp.position.set(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7); sp.rotation.z = -Math.PI / 2; sp.rotation.y = -a; g.add(sp); }
  return g;
}

// the Moon, huge in the asteroid's sky (craters drawn on a canvas)
function moonTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#b7b0c8'; x.fillRect(0, 0, 512, 256);
  const rr = mulberry32(4);
  for (let i = 0; i < 90; i++) { x.fillStyle = rr() < 0.5 ? 'rgba(90,82,110,0.55)' : 'rgba(220,214,235,0.5)'; x.beginPath(); x.ellipse(rr() * 512, rr() * 256, 4 + rr() * 26, 3 + rr() * 16, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = 'rgba(40,30,60,0.55)'; x.fillRect(300, 0, 212, 256); // the dark side
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------------------------------------
export class Spindle {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.world = new SpindleWorld();
  }

  // Build the place the first time it's needed (it's a lot of geometry to keep around otherwise).
  build() {
    if (this.root) return;
    const root = new THREE.Group();
    this.root = root;
    // the rock: a grid over (s, w) all the way round, heights from heightAt, coloured by height
    const ds = 7, dw = 7;
    const S0 = -130, S1 = L + 130;
    const ns = Math.ceil((S1 - S0) / ds) + 1, nw = Math.round(CIRC / dw);
    const pos = new Float32Array(ns * nw * 3), col = new Float32Array(ns * nw * 3);
    const c0 = new THREE.Color(0xb0a8c4), c1 = new THREE.Color(0x8a82a2), c2 = new THREE.Color(0x3e3656), cc = new THREE.Color();
    const cMare = new THREE.Color(0x5e5878), cRay = new THREE.Color(0xe6e2f4), cFloor = new THREE.Color(0x6d6688), cWall = new THREE.Color(0x4a4366), cRim = new THREE.Color(0xd8d2ec);
    const rr = mulberry32(5);
    const pt = new THREE.Vector3();
    for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) {
      const s = S0 + i * ds, w = (j / nw) * CIRC;
      const h = heightAt(s, w);
      pointAt(s, w, RC + h, pt);
      const k = (i * nw + j) * 3;
      pos[k] = pt.x; pos[k + 1] = pt.y; pos[k + 2] = pt.z;
      if (h < -40) cc.copy(c2); else cc.copy(c1).lerp(c0, Math.min(1, Math.max(0, (h + 4) / 18)));
      // (TA: what heightAt just found here) dark maria, darker crater floors, bright rays
      cc.lerp(cMare, TA.mare * 0.75).lerp(cFloor, TA.floor * 0.45).lerp(cRay, TA.ray * 0.7);
      // (crater walls a shade darker, rims a shade brighter: the craters read as craters in any light)
      cc.lerp(cWall, Math.max(TA.wall * 0.5, TA.rille * 0.55)).lerp(cRim, TA.rim * 0.55);
      cc.offsetHSL(0, 0, (rr() - 0.5) * 0.04);
      col[k] = cc.r; col[k + 1] = cc.g; col[k + 2] = cc.b;
    }
    const idx = [];
    // (the last column joins back onto the first: no seam round the girth)
    for (let i = 0; i < ns - 1; i++) for (let j = 0; j < nw; j++) { const j2 = (j + 1) % nw; const a = i * nw + j, b = i * nw + j2, c = a + nw, d = b + nw; idx.push(a, b, c, b, d, c); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // (both faces: from any angle the rock is rock, never a window onto the stars)
    // (the toon bands with softened edges: hard ones, on vertices 7 m apart under a low sun, traced the
    // mesh's triangles as pale polygons; a fully smooth ramp turned every bump into a soft stain)
    const RAMP = [55, 55, 55, 115, 115, 115, 255, 255, 255]; // (three toon bands, their edges just softened)
    const ramp = new THREE.DataTexture(new Uint8Array(RAMP.flatMap((v) => [v, v, v, 255])), RAMP.length, 1, THREE.RGBAFormat);
    ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
    ramp.needsUpdate = true;
    const rock = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide }));
    rock.receiveShadow = true;
    // (it doesn't throw its own shadow: double-sided and coarse, at the low sun angles of the roll its
    // self-shadow broke into hard pale patches and soft dark blotches. The ship, drones, props and
    // you still shadow it; the toon shading does the day and night)
    rock.castShadow = false;
    root.add(rock);
    // the blunt tips, capped
    for (const [sx, dir] of [[S0, -1], [S1, 1]]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshToonMaterial({ color: 0x3e3656, gradientMap: toon(0).gradientMap, side: THREE.DoubleSide }));
      cap.position.set(sx, 0, 0);
      cap.rotation.y = dir * Math.PI / 2;
      root.add(cap);
    }
    // the Monolith's veins: two glowing threads spiralling the length of the rock
    for (const off of [0, CIRC / 2]) {
      const vp = [];
      for (let s = 30; s < L - 30; s += 12) vp.push(bandPoint(s, off + (s / L) * CIRC * 1.5 + Math.sin(s / 97) * 18, 0.25));
      root.add(groundLine(vp, 0.35, TEAL));
    }
    // props: the lander, crystal spires, checkpoint beacons, the shrine, the extraction pad
    this.cols = [];
    const C = this.game.colliders;
    const place = (obj, s, w, lift = 0, colR = 0, colH = 0) => {
      bandFrame(s, w, obj, lift);
      root.add(obj);
      if (colR) this.cols.push(C.add({ type: 'cyl', c: obj.position.clone(), axis: radial(obj.position), y0: -1, y1: colH, r: colR }));
      return obj;
    };
    place(bake('lander', lander), CHECK[0] - 40, 0, -0.2, 3, 24);
    const sr = mulberry32(29);
    // crystal spires and obelisks all the way round (clear of the start line down the top)
    for (let i = 0; i < 220; i++) {
      const s = 420 + sr() * (L - 1000);
      let w = (sr() - 0.5) * CIRC;
      if (Math.abs(w) < 25) w += w < 0 ? -30 : 30;
      const o = place(bake('spire', spire), s, w, -0.4, 3.6, 8);
      o.scale.setScalar(0.8 + sr() * 0.9);
      o.rotateY(sr() * 6);
    }
    for (let i = 0; i < 80; i++) {
      const s = 450 + sr() * (L - 1000), w = (sr() - 0.5) * CIRC;
      const o = place(bake('obelisk', obelisk), s, w, -0.3, 1.6, 11);
      o.rotateY(sr() * 6);
    }
    // checkpoint beacons, each with a glowing line right round the girth: cross it anywhere
    this.checks = CHECK.map((s) => {
      const b = makeProp('sensor');
      place(b, s, 0, 0);
      const ring = [];
      for (let w = 0; w < CIRC; w += 14) ring.push(bandPoint(s, w, 0.3));
      root.add(groundLine(ring, 0.3, 0x2ec4ff, true));
      return { s, pos: bandPoint(s, 0, 1) };
    });
    place(bake('shrine', shrine), CORE_S, 0, -0.2);
    place(bake('extract', extract), PAD_S, 0, 0);
    this.padColliders();
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), glow(TEAL));
    this.core.add(new THREE.Mesh(new THREE.SphereGeometry(3, 16, 10), BEAM(TEAL, 0.22)));
    place(this.core, CORE_S, 0, 4.2);
    this.corePos = this.core.position.clone();
    this.padPos = bandPoint(PAD_S, 0, PAD_DECK + 0.6);
    // the sky: stars, the Moon filling a quarter of it, a small Earth, the sun
    const sky = new THREE.Group();
    this.sky = sky;
    const N = 2500, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = sr() * 2 - 1, th = sr() * Math.PI * 2, q = Math.sqrt(1 - u * u); sp[i * 3] = q * Math.cos(th) * 7600; sp[i * 3 + 1] = u * 7600; sp[i * 3 + 2] = q * Math.sin(th) * 7600; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: 0xe8e8ff })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 32), new THREE.MeshBasicMaterial({ map: moonTexture() }));
    moon.position.set(0, -6800, 1200);
    sky.add(moon);
    this.moonMesh = moon;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 16), new THREE.MeshBasicMaterial({ color: 0x2f7fff }));
    earth.position.set(5200, 3000, -3200);
    sky.add(earth);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(170, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    sun.position.copy(SUN).multiplyScalar(7000);
    sun.lookAt(0, 0, 0);
    sky.add(sun);
    sky.add(makePlanets(SUN, 7100));
    root.add(sky);
    // the mothership and the extraction pod
    this.ship = makeMothership();
    root.add(this.ship.root);
    const pod = makeShuttle({ color: 0xeeecf6, stripe: 0x2ec4ff });
    pod.root.scale.setScalar(0.6);
    pod.setGear(1);
    this.pod = pod;
    root.add(pod.root);
    pod.root.visible = false;
    this.root.visible = false;
    this.game.scene.add(root);
  }

  // ---------------------------------------------------------------------------------------------
  start(onDone) {
    const g = this.game;
    this.build();
    this.onDone = onDone;
    this.active = true;
    this.phase = 'cross';
    this.check = 0;
    this.attackT = 6;
    this.attackN = 0;
    this.droneT = 14;
    this.drones = [];
    this.hazards = [];
    this.extractT = 0;
    this.gotCore = false;
    this.podCalled = false;
    this.spin = 0;
    // hide (and freeze) the Moon; this world takes over
    this.hidden = g.scene.children.filter((o) => o.visible && o !== this.root && o !== g.player.model.root && !o.isLight && o !== g.sun.target && o !== g.earthLight.target);
    for (const o of this.hidden) o.visible = false;
    this.root.visible = true;
    this.savedPlanet = g.planet;
    g.planet = this.world;
    GRAV.axis = AX; // up is away from the rock's axis now
    this.world.colliders = g.colliders;
    if (g.player.vehicle) g.garage.exit();
    if (g.garage.active) { g.garage.active.model.root.visible = false; }
    // the mothership's eyes are targets (each one powers an attack: knock it out, and that attack stops)
    this.eyes = this.ship.eyes.map((m, i) => ({ kind: 'alieneye', faction: 'beast', model: { root: m }, hp: 380, maxHp: 380, center: new THREE.Vector3(), radius: 4, dead: false, eye: i }));
    for (const e of this.eyes) g.enemies.list.push(e);
    this.ship.root.visible = true;
    this.shipS = 0;
    this.shipW = 0;
    this.pod.root.visible = false;
    this.core.visible = true;
    this.respawnAt(0);
    document.getElementById('minimap').style.visibility = 'hidden'; // (it maps the Moon)
    g.audio.boom(true);
    g.hud.alert('THE SPINDLE', '#7dffd4', 3);
    g.hud.toast('Cross the asteroid to the Quantum Core at the far end. It\'s round: run all the way round it if you like. Don\'t fall off the ends.', 6);
    this.shipArrive = 9; // the mothership turns up a few seconds in
    this.ship.root.visible = false;
  }

  respawnAt(i) {
    const g = this.game;
    const s = i < 0 ? PAD_S - 30 : CHECK[i] + 20;
    const p = bandPoint(s, 0, 1.5);
    const up = radial(p);
    const fwd = AX.clone();
    g.player.respawn(p, fwd);
    g.cam.fwd.copy(fwd);
    g.cam.up.copy(up);
    g.cam.pitch = -0.1;
    g.updateCamera(0.016, true); // snap behind you (it used to swing in from the Moon, through the rock)
  }

  // you went down: back at the last beacon you reached (or the pad, once you've the core)
  respawn() { const g = this.game; this.respawnAt(this.gotCore ? -1 : this.check); g.player.model.root.visible = true; g.player.dead = false; this.clearHazards(); }

  exit() {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    for (const o of this.hidden || []) o.visible = true;
    document.getElementById('minimap').style.visibility = '';
    this.hidden = null;
    this.root.visible = false;
    g.planet = this.savedPlanet;
    GRAV.axis = null; // (back to the Moon's centre)
    for (const c of this.cols || []) g.colliders.remove(c);
    this.cols = null;
    for (const e of [...(this.eyes || []), ...(this.drones || [])]) { e.dead = true; if (e.model.root.parent && e.kind === 'drone') e.model.root.removeFromParent(); }
    g.enemies.list = g.enemies.list.filter((e) => e.kind !== 'alieneye' && e.kind !== 'drone');
    this.clearHazards();
    g.player.setCargo(null);
    // back on the Moon, beside the launch complex
    const ml = g.locations.find((l) => l.id === 'monolith');
    if (ml) g.story.teleportTo(g.world.toWorld(ml, ml.r * 1.25 + 26, 0, 12).normalize());
    // the props were placed with the colliders: rebuild them next time
    g.scene.remove(this.root);
    this.root = null;
  }

  clearHazards() { for (const h of this.hazards || []) if (h.mesh) h.mesh.removeFromParent(); this.hazards = []; }

  // the HUD waypoint (it's easy to lose which way is which on a rock you can run round)
  objective() {
    if (!this.active) return null;
    if (this.phase === 'cross' && !this.gotCore) return { pos: this.corePos, label: 'THE PACKAGE' };
    if (this.phase === 'extract') return { pos: this.padPos, label: this.podCalled ? 'EXTRACTION PAD · POD INBOUND' : 'EXTRACTION PAD' };
    return null;
  }

  progress() { const [s] = this.world.sw(this.game.player.pos); return Math.max(0, Math.min(1, s / L)); }

  status() {
    if (!this.active) return '';
    const [s] = this.world.sw(this.game.player.pos);
    if (this.phase === 'cross') return `Cross the Spindle · ${Math.max(0, (CORE_S - s) / 1000).toFixed(1)} km to the core`;
    if (this.phase === 'extract') return this.podCalled ? `Survive: the pod lands in ${Math.ceil(Math.max(0, this.extractT))} s` : `Get the Package to the extraction pad · ${Math.round(this.game.player.pos.distanceTo(this.padPos))} m`;
    return '';
  }

  // ---------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    if (!this.active) return;
    const P = g.player;
    const [s, w] = this.world.sw(P.pos);
    this.spin += dt;
    // the roll: the sky (and the sun with it) turns round the rock's axis
    const q = new THREE.Quaternion().setFromAxisAngle(AX, this.spin * ((Math.PI * 2) / 140));
    this.sky.quaternion.copy(q);
    this.sky.position.copy(g.camera.position);
    const sunDir = SUN.clone().applyQuaternion(q);
    const up = P.up;
    const day = THREE.MathUtils.smoothstep(up.dot(sunDir), -0.15, 0.2);
    // (no sun at all on the night turn: it used to keep shining up through the rock at half strength,
    // so the rock's own shadow smeared soft dark blotches over the ground; the Moon's glow lights it)
    g.sun.intensity = 1.7 * day;
    g.hemi.position.copy(up);
    g.hemi.intensity = 0.95; // (moonlight off the Moon below keeps the rock readable on its night turn)
    g.earthLight.intensity = 0.25;
    // the shadow box follows you in whole shadow-map texels along the light's axes (see main.js
    // updateLighting), so shadows don't shimmer as you move
    const lz = sunDir.clone().normalize(), lx = new THREE.Vector3(0, 1, 0).cross(lz).normalize(), ly = lz.clone().cross(lx);
    const snap = 320 / 2048;
    const sp = lx.multiplyScalar(Math.round(P.pos.dot(lx) / snap) * snap).addScaledVector(ly, Math.round(P.pos.dot(ly) / snap) * snap).addScaledVector(lz, P.pos.dot(lz));
    g.sun.target.position.copy(sp);
    g.sun.position.copy(sp).addScaledVector(sunDir, 600);
    g.earthLight.target.position.copy(P.pos);
    g.earthLight.position.copy(P.pos).addScaledVector(new THREE.Vector3(0, -1, 0).applyQuaternion(q), 600); // moonlight from below
    g.renderer.shadowMap.autoUpdate = true;
    // checkpoints
    for (let i = this.check + 1; i < CHECK.length; i++) {
      if (s > CHECK[i]) { // (crossing the beacon's line anywhere across the rock)
        this.check = i;
        g.fx.pop('CHECKPOINT', null, { color: '#7dffd4', size: 54 });
        g.audio.pickup();
      }
    }
    // off either end: lost to the void, back to the beacon
    if (s < -30 || s > L + 30 || rad(P.pos) < RC - 150) {
      g.fx.pop('LOST TO THE VOID', null, { color: '#ff2e88', size: 60 });
      g.damagePlayer(20, 'void');
      if (!P.dead) this.respawn();
    }
    // the core
    this.core.rotation.y += dt * 1.8;
    if (this.phase === 'cross' && !this.gotCore && P.center.distanceTo(this.corePos) < 6) {
      this.gotCore = true;
      this.core.visible = false;
      P.setCargo(TEAL);
      this.phase = 'extract';
      this.extractT = 35;
      g.hud.alert('THE CORE IS YOURS — HOLD THE EXTRACTION PAD!', '#7dffd4', 4);
      g.cam.shake = 0.8;
      g.audio.boom(true);
      this.pod.root.visible = true;
    }
    if (this.phase === 'extract') {
      // reach the pad and the pod's on its way; after that it's coming whatever you do
      if (!this.podCalled && P.pos.distanceTo(this.padPos) < 70) {
        this.podCalled = true;
        g.hud.alert('POD INBOUND — SURVIVE!', '#7dffd4', 3);
        g.audio.tone(660, 0.5, 'triangle', 0.15, 1.5);
      }
      if (this.podCalled) this.extractT -= dt;
      // the pod comes down out of the sky over the pad
      const t = Math.max(0, this.extractT / 35);
      const up2 = radial(this.padPos);
      this.pod.root.position.copy(this.padPos).addScaledVector(up2, 2 + t * 420);
      this.pod.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up2);
      if (this.extractT <= 0) { this.phase = 'done'; this.finish(); return; }
    }
    this.updateShip(dt, s, w);
    this.updateHazards(dt);
    this.updateDrones(dt);
  }

  updateShip(dt, s, w) {
    const g = this.game;
    const P = g.player;
    if (this.shipArrive > 0) {
      this.shipArrive -= dt;
      if (this.shipArrive <= 0) {
        this.ship.root.visible = true;
        this.shipS = Math.max(0, s - 400);
        g.hud.alert('SOMETHING IS FOLLOWING YOU', '#ff2e88', 4);
        g.audio.tone(70, 1.4, 'sawtooth', 0.3, 0.4);
        g.cam.shake = 1;
      }
      return;
    }
    // it gets AHEAD of you: it reads your speed along the rock and parks over where you're going,
    // and it follows you round the girth (the short way)
    const along = P.vel.dot(AX);
    // (but never out past the rock's tapered ends: it holds station over the terrain at either end)
    const want = Math.min(L - 260, Math.max(260, s + 60 + Math.max(0, along) * 2.2));
    this.shipS += Math.max(-140, Math.min(140, (want - this.shipS) * 1.4)) * dt;
    this.shipS = Math.min(L - 260, Math.max(200, this.shipS));
    const round = P.vel.dot(new THREE.Vector3().crossVectors(AX, P.up));
    this.shipW = wrapW(this.shipW + wrapW(w + round * 1.2 - this.shipW) * Math.min(1, dt * 1.2));
    bandFrame(this.shipS, this.shipW, this.ship.root, 92);
    this.ship.root.rotateY(this.spin * 0.25);
    for (const e of this.eyes) {
      if (e.dead) {
        e.downT = (e.downT ?? 15) - dt;
        if (e.downT <= 0) {
          // re-armed: back on the hull, back in the fight
          e.dead = false; e.hp = e.maxHp; e.downT = undefined;
          this.ship.root.add(e.model.root);
          g.fx.pop('WEAPON RE-ARMED', e.center.clone(), { color: '#ff2e88', size: 44 });
        }
      }
      e.model.root.getWorldPosition(e.center);
      e.model.root.visible = !e.dead;
    }
    // attacks: each live eye powers one (barrage, beam, mines); after the core, faster
    this.attackT -= dt;
    if (this.attackT <= 0) {
      const live = this.eyes.filter((e) => !e.dead).map((e) => e.eye);
      this.attackT = this.gotCore ? 1.8 : 2.6;
      if (live.length) {
        const kind = live[this.attackN++ % live.length];
        if (kind === 0) this.barrage();
        else if (kind === 1) {
          // past halfway down the rock: two beams at once, one from each side, sweeping toward
          // each other on tracks either side of your line
          if (s > L / 2) { this.sweep(s, w, -5.5, 1); this.sweep(s, w, 5.5, -1); } else this.sweep(s, w);
        }
        else this.mines(s, w);
      }
    }
    this.droneT -= dt;
    // three drones at most (a shot-down one powers back up rather than being replaced)
    if (this.droneT <= 0) { this.droneT = this.gotCore ? 5 : 7; if (this.drones.length < 3) this.spawnDrone(); }
  }

  shipBelly() { return this.ship.root.localToWorld(new THREE.Vector3(0, -12, 0)); }

  // 1: a plasma barrage: a stream of aimed bolts walked onto you (leading you), and under it a wide
  // spray raining over everywhere you might swerve to
  barrage() {
    const g = this.game;
    const P = g.player;
    // (a quarter faster than it used to fire, both the aimed stream and the spray)
    for (let i = 0; i < 14; i++) g.schedule(i * 0.056, () => {
      if (!this.active || P.dead) return;
      const from = this.shipBelly();
      const aim = P.center.clone().addScaledVector(P.vel, from.distanceTo(P.center) / 120).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
      g.projectiles.fire('alien', from, aim.sub(from).normalize().multiplyScalar(120), { damage: 7, splash: 2.5, color: PINK, size: 0.6, knock: 0.5 });
    });
    const side = new THREE.Vector3().crossVectors(AX, P.up);
    for (let i = 0; i < 26; i++) g.schedule(0.16 + Math.random() * 0.88, () => {
      if (!this.active || P.dead) return;
      const from = this.shipBelly();
      const spot = P.center.clone().addScaledVector(P.vel, 0.6 + Math.random() * 0.8).addScaledVector(side, (Math.random() - 0.5) * 80).addScaledVector(AX, (Math.random() - 0.3) * 60);
      g.projectiles.fire('alien', from, spot.sub(from).normalize().multiplyScalar(95), { damage: 6, splash: 3, color: VIO, size: 0.5, knock: 0.4 });
    });
    g.audio.tone(180, 0.3, 'square', 0.15, 0.3);
    g.audio.tone(90, 0.8, 'sawtooth', 0.1, 0.5);
  }

  // 2: a beam that sweeps round the rock. Its track is painted on the ground first (pulsing hazard
  // stripes, like the strike warnings), then the beam burns along it, leaving a glowing scorch.
  sweep(s, w, ds = 0, dir = 1) {
    const g = this.game;
    const s0 = s + 30 + Math.max(0, g.player.vel.dot(AX)) * 1.3 + ds;
    const W = 170; // (an arc either side of you, round the girth)
    const HW = 4.5; // half the track's width
    const P = [], U = [], V = [], idx = [];
    const n = Math.ceil((W * 2) / 3);
    for (let i = 0; i <= n; i++) {
      const ww = w - W + (i / n) * W * 2;
      for (const side of [-1, 1]) { const q = bandPoint(s0 + side * HW, ww, 0.2); P.push(q.x, q.y, q.z); U.push(dir > 0 ? i / n : 1 - i / n); V.push(side); }
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1));
    geo.setAttribute('aV', new THREE.Float32BufferAttribute(V, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { pulse: { value: 1 }, prog: { value: -1 }, fade: { value: 1 }, len: { value: W * 2 } },
      vertexShader: 'attribute float aU; attribute float aV; varying float vU; varying float vV; void main(){ vU=aU; vV=aV; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float pulse; uniform float prog; uniform float fade; uniform float len; varying float vU; varying float vV;
        void main(){
          float edge = step(0.78, abs(vV));
          float hatch = step(0.5, fract(vU * len / 5.0 + vV * 0.6));
          // ahead of the beam: the warning; behind it: the burn
          float burnt = step(vU, prog);
          float warn = (edge * (0.55 + 0.45 * pulse) + (1.0 - edge) * hatch * 0.28) * (1.0 - burnt);
          float hot = burnt * smoothstep(0.0, 0.08, prog - vU + 0.001) ;
          float core = 1.0 - abs(vV);
          vec3 scorch = mix(vec3(0.12, 0.05, 0.1), vec3(1.0, 0.45, 0.15), core * (1.0 - smoothstep(0.0, 0.25, prog - vU)));
          float a = warn + burnt * (0.35 + 0.5 * core) * fade;
          if (a < 0.01) discard;
          vec3 c = mix(mix(vec3(1.0, 0.16, 0.29), vec3(1.0, 0.82, 0.25), edge * 0.25), scorch, burnt);
          gl_FragColor = vec4(c, a);
        }`,
    });
    const line = new THREE.Mesh(geo, mat);
    line.renderOrder = 3;
    this.root.add(line);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 1, 12, 1, true), BEAM(PINK, 0.7));
    beam.visible = false;
    this.root.add(beam);
    this.hazards.push({ type: 'sweep', s: s0, w0: w, W, dir, twin: ds !== 0, t: 0, line, beam, mesh: line, hitCd: 0 });
  }

  // 3: mines: rings dropped where you're going to be when they burst (your velocity, all of it,
  // played forward), a tight cluster on the spot itself and a wider scatter round it
  mines(s, w) {
    const g = this.game;
    const P = g.player;
    const T = 1.8; // (the fuse: time enough to read them and pick a gap)
    const side = new THREE.Vector3().crossVectors(AX, radial(P.pos)).normalize(); // (the +w way round)
    const vs = P.vel.dot(AX), vw = P.vel.dot(side);
    const ps = s + vs * T, pw = w + vw * T;
    const R = 10; // (bigger rings, and never stacked on each other)
    const placed = [];
    for (let i = 0; i < 14; i++) {
      // (a few on your line, the rest spread wide: a field to thread, not a carpet)
      const tight = i < 4;
      const spread = tight ? 26 : 110;
      let ms = 0, mw = 0;
      for (let k = 0; k < 8; k++) {
        ms = ps + (Math.random() - (tight ? 0.5 : 0.35)) * spread; mw = pw + (Math.random() - 0.5) * spread;
        if (placed.every(([a, b]) => Math.hypot(a - ms, b - mw) > R * 1.9)) break;
      }
      placed.push([ms, mw]);
      const p = bandPoint(ms, mw, 0.3);
      g.fx.warningRing(p, R, T);
      g.schedule(T, () => { if (this.active) g.explode(p.clone().addScaledVector(radial(p), 1), R, 26, 'alien', 1.4); });
    }
  }

  updateHazards(dt) {
    const g = this.game;
    const P = g.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;
      if (h.type === 'sweep') {
        const U = h.line.material.uniforms;
        U.pulse.value = 0.5 + 0.5 * Math.sin(h.t * 22);
        if (h.t < 1.1) continue;
        const k = (h.t - 1.1) / 2.2;
        U.prog.value = Math.min(1, k);
        // the scorch cools and fades for a couple of seconds after the beam's gone
        if (k > 1) { h.beam.visible = false; U.fade.value = Math.max(0, 1 - (k - 1) * 1.1); if (k > 2) { h.line.removeFromParent(); h.beam.removeFromParent(); this.hazards.splice(i, 1); } continue; }
        const gw = h.w0 - h.dir * h.W + h.dir * k * h.W * 2;
        const gp = bandPoint(h.s, gw, 0);
        const from = this.shipBelly();
        // (a twin beam leaves from its own side of the hull)
        if (h.twin) from.addScaledVector(new THREE.Vector3().crossVectors(radial(from), AX).normalize(), -h.dir * 22);
        h.beam.visible = true;
        h.beam.position.lerpVectors(from, gp, 0.5);
        h.beam.scale.set(1, from.distanceTo(gp), 1);
        h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), gp.clone().sub(from).normalize());
        if (Math.random() < dt * 8) g.fx.explosion(gp.clone(), 2.5, false);
        h.hitCd -= dt;
        if (h.hitCd <= 0 && !P.dead && P.center.distanceTo(gp) < 5.5) { h.hitCd = 0.5; g.damagePlayer(32, 'alien'); g.fx.pop('SEARED!', null, { color: '#ff2e88', size: 50 }); }
      }
    }
  }

  // 4: drones: little spiked gunships. They pace you off your flanks (one each side, a little ahead)
  // and spit short bursts of bolts at you; they keep their distance. They can be shot down.
  spawnDrone() {
    const g = this.game;
    const m = makeDrone();
    const from = this.shipBelly();
    m.position.copy(from);
    this.root.add(m);
    const side = this.drones.length % 2 ? 1 : -1;
    const e = { kind: 'drone', faction: 'beast', model: { root: m }, hp: 40, maxHp: 40, center: from.clone(), radius: 1.8, dead: false, vel: new THREE.Vector3(), wob: Math.random() * 6, side, slot: 18 + Math.random() * 16, fireCd: 1 + Math.random() * 1.5 };
    this.drones.push(e);
    g.enemies.list.push(e);
  }

  updateDrones(dt) {
    const g = this.game;
    const P = g.player;
    const up = P.up;
    // which way you're heading along the rock (or along the axis, standing still)
    const fwd = P.vel.clone().addScaledVector(up, -P.vel.dot(up));
    const sp = fwd.length();
    if (sp > 3) fwd.divideScalar(sp); else fwd.copy(AX);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    for (const d of this.drones) {
      // shot down: it goes dark and drifts along behind you, powered down, for 15 s, then reboots
      if (d.dead && !(d.downT > 0)) {
        d.downT = 15;
        d.model.root.userData.core.material = d.model.root.userData.core.userData.dark;
        this.root.add(d.model.root); // (the kill took it out of the scene)
      }
      if (d.downT > 0) {
        d.downT -= dt;
        if (d.downT <= 0) {
          d.dead = false; d.hp = d.maxHp; d.fireCd = 1.5;
          d.model.root.userData.core.material = d.model.root.userData.core.userData.lit;
          if (d.center.distanceTo(P.center) < 200) g.fx.pop('DRONE REBOOTED', d.center.clone(), { color: '#ff2e88', size: 40 });
          g.audio.tone(300, 0.4, 'sawtooth', 0.06, 3);
        }
      }
      const down = d.dead;
      d.wob += dt * (down ? 0.8 : 2.4);
      const goal = P.center.clone().addScaledVector(right, d.side * d.slot * (down ? 1.6 : 1)).addScaledVector(up, (down ? 14 : 8) + Math.sin(d.wob) * 3).addScaledVector(fwd, (down ? -20 : 6 + Math.min(40, sp * 0.3)) + Math.cos(d.wob * 0.7) * 5);
      const want = goal.sub(d.center).multiplyScalar(down ? 1 : 2.4);
      if (want.length() > (down ? 60 : 95)) want.setLength(down ? 60 : 95);
      d.vel.lerp(want.add(P.vel.clone().multiplyScalar(0.6)), Math.min(1, dt * (down ? 1 : 3)));
      d.center.addScaledVector(d.vel, dt);
      const floor = this.world.surface(d.center) + 3;
      if (rad(d.center) < floor) this.world.ground(d.center, d.center, 3);
      d.model.root.position.copy(d.center);
      d.model.root.rotation.y += dt * (down ? 0.6 : 4);
      if (down) continue;
      // short bursts, leading you a little
      d.fireCd -= dt;
      const dist = d.center.distanceTo(P.center);
      if (d.fireCd <= 0 && dist < 160 && !P.dead) {
        d.fireCd = 1.1 + Math.random() * 0.8;
        for (let i = 0; i < 3; i++) g.schedule(i * 0.09, () => {
          if (d.dead || !this.active || P.dead) return;
          // (faster bolts, led onto where you'll be, with a little splash: a runner on the move still
          // gets clipped now and then)
          const aim = P.center.clone().addScaledVector(P.vel, d.center.distanceTo(P.center) / 150).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5));
          g.projectiles.fire('alien', d.center.clone(), aim.sub(d.center).normalize().multiplyScalar(150), { damage: 5, splash: 1.4, color: PINK, size: 0.3, knock: 0.2 });
        });
        if (dist < 90) g.audio.tone(1300, 0.06, 'square', 0.04, 0.6);
      }
    }
  }

  // the launch pad's plinth and ramps, as colliders (you skate up a ramp and stand on the deck)
  padColliders() {
    const C = this.game.colliders;
    const p = bandPoint(PAD_S, 0, 0);
    const up = radial(p);
    const fwd = AX.clone();
    const right = new THREE.Vector3().crossVectors(up, fwd);
    this.cols.push(C.add({ type: 'cyl', c: p.clone(), axis: up.clone(), y0: -3, y1: PAD_DECK, r: PAD_R }));
    const slope = Math.atan2(PAD_DECK, RAMP_L), hyp = Math.hypot(PAD_DECK, RAMP_L);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      // the ramp's run (outward from the deck) and its surface normal
      const out = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
      const along = out.clone().multiplyScalar(Math.cos(slope)).addScaledVector(up, -Math.sin(slope)); // down the ramp
      const n = new THREE.Vector3().crossVectors(along, new THREE.Vector3().crossVectors(up, out)).normalize();
      if (n.dot(up) < 0) n.negate();
      const side = new THREE.Vector3().crossVectors(n, along).normalize();
      // (its top face is the wedge's: from the deck's edge at deck height to the ground)
      const c = p.clone().addScaledVector(out, PAD_R + RAMP_L / 2).addScaledVector(up, PAD_DECK / 2).addScaledVector(n, -0.3);
      this.cols.push(C.add({ type: 'box', c, ax: side, ay: n, az: along, hx: 3.5, hy: 0.3, hz: hyp / 2 }));
    }
  }

  finish() {
    const g = this.game;
    const done = this.onDone;
    g.hud.alert('EXTRACTED!', '#7dffd4', 3);
    g.fx.explosion(this.padPos.clone(), 10, true);
    const el = document.createElement('div');
    el.id = 'dawn';
    el.innerHTML = '<div class="dw-t">BACK TO THE MOON</div><div class="dw-s">THE QUANTUM CORE IS ABOARD</div>';
    document.body.appendChild(el);
    setTimeout(() => {
      this.exit();
      el.remove();
      if (done) done();
    }, 2600);
  }
}
