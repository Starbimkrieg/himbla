import * as THREE from 'three';
import { T, G } from './outpostModels.js';

// The shuttle / freighter landing pad: a round deck 3 m up on a clad base, a railing all round, and one straight flight of
// stairs for walkers. The base (panels, ribs, back door) and the space under the stairs are closed and solid, so nobody
// skates under the deck, where the camera would follow into the ship's underside.
//
// Pad frame: deck centre at (0, 0), y in the parent's frame (settlement or plot), stairs out along local +z. One builder for
// every size (shuttle deck ~14 m round, freighter 21) and any ground: `ground(x, z)` is the ground height at a pad-frame
// point, so the base reaches it and the stairs end on it. Used by traffic.js (line pads), world.js (World.pad) and
// hometown.js (your plot's Shuttle Pad).

const PAD_H = 3;      // deck height above the highest ground under it
const DECK_T = 0.7;          // deck slab thickness
const RAIL_H = 1.15;         // railing height over the deck
const RAIL_IN = 0.35;        // ...and its inset from the deck edge
const SKIRT_IN = 0.45;       // base panel inset from the deck edge
const STAIR_W = 2.6;         // flight width (between handrails)
const RISE = 0.25, RUN = 0.34; // per step: ~36 degrees, gentle enough for physics to count as ground
const STEEL = 0x55607a, DARK = 0x3a3550, DECK = 0x5b5870, TOP = 0x4a4660, YEL = 0xffd23f, CONC = 0x8a8698, LIGHT = 0xd8d4e8, PANEL = 0x6a6680;

// The layout, read by the builder, the colliders and the walkers.
// r: deck radius. top: deck height (null: PAD_H over the highest ground under it).
export function padPlan(r, ground = () => 0, top = null) {
  let hi = -Infinity;
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2, rr = i === 12 ? 0 : r;
    hi = Math.max(hi, ground(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  if (top === null) top = hi + PAD_H;
  // flight: from the deck edge along +z to the ground (re-measured where it lands, for slopes)
  let footY = ground(0, r + (top / RISE) * RUN);
  let n, run;
  for (let k = 0; k < 3; k++) {
    n = Math.max(2, Math.round((top - footY) / RISE));
    run = n * RUN;
    footY = ground(0, r + run);
  }
  const rise = (top - footY) / n;
  // base: panel drum just inside the deck edge, down to a little below the lowest ground round it
  let lo = Infinity;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; lo = Math.min(lo, ground(Math.cos(a) * (r - SKIRT_IN), Math.sin(a) * (r - SKIRT_IN))); }
  // railing posts every ~2.4 m, leaving a gap for the stairs
  const rr = r - RAIL_IN, gap = (STAIR_W / 2 + 0.25) / rr; // (half-angle of the gap either side of +z)
  const nPost = Math.max(16, Math.round((Math.PI * 2 * rr) / 2.4));
  const posts = [];
  const span = Math.PI * 2 - 2 * gap;
  for (let i = 0; i <= nPost; i++) {
    const a = Math.PI / 2 + gap + (i / nPost) * span; // (+z is angle pi/2 in x-z: start beside the gap, go round)
    posts.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr });
  }
  return {
    r, top, hi, posts, baseY: lo - 1.2, doorY: ground(0, -(r - SKIRT_IN)),
    stairs: { w: STAIR_W, n, rise, run, z0: r, z1: r + run, footY, headY: ground(0, r) },
    // where walkers step onto the deck and off the flight (pad frame)
    deckEdge: { x: 0, y: top, z: r - 0.9 },
    foot: { x: 0, y: footY, z: r + run + 0.9 },
  };
}

// Draws the pad into a Kit (outpostModels.js) in the Kit's frame. color: markings and lamps.
export function padKit(k, plan, color = YEL) {
  const { r, top, posts, baseY, stairs: S } = plan;
  const bot = top - DECK_T;
  const seg = Math.max(32, Math.round(r * 3));
  // deck: slab, darker landing surface, hazard band round the edge, markings
  k.cyl(r, r * 0.97, DECK_T, seg, T(DECK), 0, bot, 0, { outline: 0.08 });
  k.cyl(r - 0.25, r - 0.25, 0.04, seg, T(TOP), 0, top, 0, { outline: 0 });
  const bands = Math.round(seg / 2) * 2;
  for (let i = 0; i < bands; i++) k.add(new THREE.CylinderGeometry(r + 0.03, r * 0.97 + 0.03, 0.3, 2, 1, true, (i / bands) * Math.PI * 2, (Math.PI * 2) / bands), T(i % 2 ? DARK : YEL), 0, top - 0.17, 0, { outline: 0 });
  k.ring(r * 0.72, Math.max(0.12, r * 0.022), T(color), 0, top + 0.05, 0);
  k.ring(r * 0.56, Math.max(0.08, r * 0.012), T(color), 0, top + 0.05, 0);
  // an H in the middle (its foot toward the stairs), and a chevron pointing to the stairs
  const h = r * 0.34, bw = Math.max(0.5, r * 0.06);
  for (const s of [-1, 1]) k.box(bw, 0.05, h, T(LIGHT), s * h * 0.36, top + 0.02, 0, { outline: 0 });
  k.box(h * 0.72, 0.05, bw, T(LIGHT), 0, top + 0.02, 0, { outline: 0 });
  for (const s of [-1, 1]) k.box(0.35, 0.05, 1.6, T(YEL), s * 0.55, top + 0.02, r - 2.2, { ry: s * 0.6, outline: 0 });
  // base: panel drum, concrete course at its foot, ribs every ~2.8 m, glow strip under the deck lip, service door at the
  // back (opposite the stairs)
  const rs = r - SKIRT_IN, hb = bot - baseY;
  k.add(new THREE.CylinderGeometry(rs, rs, hb, seg, 1, true), T(PANEL), 0, baseY + hb / 2, 0, { outline: 0.06 });
  k.add(new THREE.CylinderGeometry(rs + 0.15, rs + 0.2, 1.75, seg, 1, true), T(CONC), 0, baseY + 0.875, 0, { outline: 0.04 });
  const ribs = Math.max(12, Math.round((Math.PI * 2 * rs) / 2.8));
  for (let i = 0; i < ribs; i++) {
    const a = ((i + 0.5) / ribs) * Math.PI * 2;
    k.box(0.32, hb, 0.2, T(DARK), Math.cos(a) * (rs + 0.08), baseY, Math.sin(a) * (rs + 0.08), { ry: -a, outline: 0.02 });
  }
  k.ring(rs + 0.06, 0.05, G(color), 0, bot - 0.3, 0);
  const dy = plan.doorY;
  k.box(1.9, 2.5, 0.16, T(YEL), 0, dy, -rs - 0.04, { outline: 0.03 });
  k.box(1.5, 2.25, 0.2, T(DARK), 0, dy, -rs - 0.06, { outline: 0 });
  k.ball(0.14, G(color), 0, dy + 2.75, -rs - 0.15, { outline: 0 });
  // railing: posts, top rail, knee rail, a lamp on every third post
  const pTop = top + RAIL_H;
  posts.forEach((p, i) => {
    k.cyl(0.07, 0.07, RAIL_H, 5, T(STEEL), p.x, top, p.z, { outline: 0.02 });
    if (i % 3 === 0) k.add(new THREE.SphereGeometry(0.15, 6, 4), G(color), p.x, pTop + 0.1, p.z, { outline: 0 });
    const q = posts[i + 1];
    if (!q) return;
    k.beam([p.x, pTop, p.z], [q.x, pTop, q.z], 0.06, T(YEL), { outline: 0.02, seg: 4 });
    k.beam([p.x, top + 0.55, p.z], [q.x, top + 0.55, q.z], 0.04, T(STEEL), { outline: 0, seg: 3 });
    k.box(Math.hypot(q.x - p.x, q.z - p.z), 0.12, 0.04, T(YEL), (p.x + q.x) / 2, top + 0.06, (p.z + q.z) / 2, { ry: -Math.atan2(q.z - p.z, q.x - p.x), outline: 0 }); // (kick plate)
  });
  // stairs: landing plate at the top, treads between two stringers, handrails both sides, slab at the foot
  const { w, n, rise, run, z0, footY } = S, hw = w / 2;
  k.box(w + 0.3, 0.12, 1.2, T(DECK), 0, top - 0.12, z0 - 0.3, { outline: 0.03 });
  for (let i = 0; i < n; i++) {
    const y = top - (i + 1) * rise, z = z0 + i * RUN + RUN / 2;
    k.box(w, 0.08, RUN + 0.04, T(i === n - 1 ? YEL : STEEL), 0, y - 0.04, z, { outline: 0.015 });
    k.box(w - 0.2, 0.03, 0.08, T(YEL), 0, y + 0.01, z + RUN / 2 - 0.06, { outline: 0 }); // (nosing stripe)
  }
  const pitch = Math.atan2(top - footY, run), len = Math.hypot(top - footY, run);
  for (const s of [-1, 1]) {
    // stringer (deep plate under the tread ends), handrail 0.95 m over the step line, posts at both ends and middle
    k.add(new THREE.BoxGeometry(0.14, 0.4, len), T(DARK), s * (hw + 0.07), (top + footY) / 2 - 0.25, z0 + run / 2, { rx: pitch, outline: 0.03 });
    k.beam([s * (hw + 0.07), top + 0.95, z0 - 0.4], [s * (hw + 0.07), footY + 0.95, z0 + run + 0.2], 0.06, T(YEL), { outline: 0.02 });
    k.beam([s * (hw + 0.07), top + 0.5, z0 - 0.4], [s * (hw + 0.07), footY + 0.5, z0 + run + 0.2], 0.04, T(STEEL), { outline: 0 });
    for (const t of [0, 0.5, 1]) {
      const z = z0 - 0.4 + t * (run + 0.6), y = top + (footY - top) * Math.min(1, Math.max(0, (z - z0) / run));
      k.cyl(0.07, 0.07, 0.95, 6, T(STEEL), s * (hw + 0.07), y, z, { outline: 0.02 });
    }
  }
  // close the space under the flight: a panel each side, ground to stringer
  const under = new THREE.Shape([new THREE.Vector2(z0 - SKIRT_IN, S.headY - 0.4), new THREE.Vector2(z0 - SKIRT_IN, top - 0.55), new THREE.Vector2(z0 + run, footY - 0.25), new THREE.Vector2(z0 + run, footY - 0.4)]);
  const ug = new THREE.ExtrudeGeometry(under, { depth: 0.08, bevelEnabled: false }).rotateY(-Math.PI / 2);
  for (const s of [-1, 1]) k.add(ug.clone(), T(PANEL), s * (hw + 0.07) + 0.04, 0, 0, { outline: 0.03 });
  k.box(w + 1.2, 0.18, 1.8, T(CONC), 0, footY - 0.08, z0 + run + 0.8, { outline: 0.04 });
  // a lamp each side of the stair head, so the way down reads at night
  for (const s of [-1, 1]) {
    k.cyl(0.09, 0.09, 1.6, 6, T(STEEL), s * (hw + 0.3), top, z0 - 0.75, { outline: 0.02 });
    k.ball(0.22, G(color), s * (hw + 0.3), top + 1.7, z0 - 0.75, { outline: 0 });
  }
}

// Colliders in the pad frame (world.col specs): deck + base as one solid drum from below ground to the deck, the railing,
// the flight as a slope deep enough to fill the space under it, and its handrails.
export function padCols(plan) {
  const { r, top, posts, baseY, stairs: S } = plan;
  // (deck and flight are `stick`: physics keeps a walker on them over the stair head; see physics.js)
  const cols = [{ type: 'cyl', x: 0, z: 0, y0: baseY, y1: top, r, stick: true }];
  for (let i = 0; i + 1 < posts.length; i++) {
    const p = posts[i], q = posts[i + 1];
    cols.push({ type: 'box', x: (p.x + q.x) / 2, y: top + 0.6, z: (p.z + q.z) / 2, hx: Math.hypot(q.x - p.x, q.z - p.z) / 2 + 0.05, hy: 0.6, hz: 0.1, yaw: -Math.atan2(q.z - p.z, q.x - p.x) });
  }
  // flight: a slab whose top face runs from foot to deck (like settlements.js slope() skate ramps)
  // (top edge meets the deck rim exactly: no lip; past the rim its face would stand above the deck)
  const A = [0, S.footY - 0.3 * (S.rise / RUN), S.z1 + 0.3], B = [0, top, S.z0];
  // (deep enough, square to the slope, to reach the ground under the stair head, leaving no pocket to skate into)
  const pitch = Math.atan2(top - S.footY, S.run);
  cols.push({ ...slab(A, B, S.w + 0.2, Math.max(0.5, ((top - S.headY) * Math.cos(pitch) + 0.6) / 2)), stick: true });
  for (const s of [-1, 1]) cols.push(slab([s * (S.w / 2 + 0.1), S.footY + 1.1, S.z1 + 0.2], [s * (S.w / 2 + 0.1), top + 1.1, S.z0 - 0.4], 0.16, 0.55));
  return cols;
}

// box collider whose top face runs from A (x, y, z) to B, w wide, `thick` deep below that face
function slab(A, B, w, thick) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  const run = Math.hypot(dx, dz), len = Math.hypot(run, dy);
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, run);
  const n = [Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw)];
  return { type: 'box', hx: w / 2, hy: thick, hz: len / 2, yaw, pitch, x: (A[0] + B[0]) / 2 - n[0] * thick, y: (A[1] + B[1]) / 2 - n[1] * thick, z: (A[2] + B[2]) / 2 - n[2] * thick };
}

// Pad-frame point (x, z) turned by `yaw` and moved to (px, pz), i.e. in the parent frame. (three.js y turn: local +z ends
// up along (sin yaw, cos yaw).)
export function padToFrame(px, pz, yaw, x, z) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: px + x * c + z * s, z: pz - x * s + z * c };
}

// Collider spec from pad frame to parent frame
export function colToFrame(px, pz, yaw, c) {
  const p = padToFrame(px, pz, yaw, c.x, c.z);
  return c.type === 'box' ? { ...c, x: p.x, z: p.z, yaw: (c.yaw || 0) + yaw } : { ...c, x: p.x, z: p.z };
}

// Walker waypoints for a pad at (px, pz) turned by yaw, in the parent frame: `edge` on the deck at the stair head, `head`
// top step, `foot` bottom step, `out` on the ground just beyond. `face`: the stairs' direction (as Math.atan2(z, x)).
export function padStairs(px, pz, yaw, plan) {
  const S = plan.stairs, at = (z, y) => ({ ...padToFrame(px, pz, yaw, 0, z), y });
  return {
    edge: at(plan.r - 1.6, plan.top), head: at(S.z0 - 0.2, plan.top), foot: at(S.z1 + 0.5, S.footY), out: at(S.z1 + 2.6, S.footY),
    face: Math.PI / 2 - yaw, w: S.w, run: S.run,
  };
}
