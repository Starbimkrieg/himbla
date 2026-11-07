import * as THREE from 'three';
import { T, G } from './outpostModels.js';
import { fixtureModel, fixtureSlot } from './models.js';

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
const YEL = 0xffd23f;  // (the markings' colour unless the caller gives one)

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

// A fixture's material for a slot (models.js fixtureSlot): `mark` and `markglow` in `color`, the rest fixed. Shared by
// the pad, the stop shelter (traffic.js) and the solar fields (world.js).
export const fixtureMat = (color) => (slot) => { const s = fixtureSlot(slot, color); return s.glow ? G(s.color) : T(s.color); };

// The decks built (tools/blender/build_fixtures.py PAD_RADII): a pad takes the nearest and scales it across to its radius
const PAD_DECKS = [10.5, 12, 13, 14, 14.3, 16, 21];
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);
const at = (x, y, z, sx = 1, sy = 1, sz = 1, q = _q.identity()) => new THREE.Matrix4().compose(_v.set(x, y, z), q, _s.set(sx, sy, sz));

// Builds the pad into a Kit (outpostModels.js) in the Kit's frame from the Blender kit (build_fixtures.py fx_pad_*), fitted to
// `plan` (the ground under it): the deck at its height, the base drum down to the lowest ground, one tread per step, stringers,
// handrails and posts along the flight, the plates closing the space under it, the slab at its foot. color: markings and lamps.
export function padKit(k, plan, color = YEL) {
  const { r, top, baseY, stairs: S } = plan;
  const bot = top - DECK_T, mat = fixtureMat(color);
  const put = (name, m) => k.baked(fixtureModel(name).root, mat, m);
  const was = k.tag;
  k.tag = 'pad';                                              // (the dev audits name it)
  const R = PAD_DECKS.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a)), sx = r / R, tag = R.toFixed(1).replace('.', '_');
  put(`pad_deck_${tag}`, at(0, top, 0, sx, 1, sx));
  put(`pad_drum_${tag}`, at(0, bot, 0, sx, bot - baseY, sx));
  put(`pad_course_${tag}`, at(0, baseY, 0, sx, 1, sx));
  put('pad_door', at(0, plan.doorY, -(r - SKIRT_IN)));
  // the flight: a tread per step (the bottom one yellow), a stringer, handrail and knee rail each side on three posts, the
  // plates that close the space under it (sheared to run under the stringer), the slab at its foot
  const { w, n, rise, run, z0, footY } = S, hw = w / 2;
  for (let i = 0; i < n; i++) put(i === n - 1 ? 'pad_tread_end' : 'pad_tread', at(0, top - (i + 1) * rise + 0.04, z0 + i * RUN + RUN / 2));
  const pitch = Math.atan2(top - footY, run), len = Math.hypot(top - footY, run);
  const rail = (name, x, a, b) => {
    const d = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), q = new THREE.Quaternion().setFromUnitVectors(_up, d.divideScalar(L));
    put(name, at(a[0], a[1], a[2], 1, L, 1, q));
  };
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.07);
    put('pad_stringer', at(x, (top + footY) / 2 - 0.25, z0 + run / 2, 1, 1, len, _q.setFromEuler(_e.set(pitch, 0, 0))));
    rail('pad_rail', x, [x, top + 0.95, z0 - 0.4], [x, footY + 0.95, z0 + run + 0.2]);
    rail('pad_knee', x, [x, top + 0.5, z0 - 0.4], [x, footY + 0.5, z0 + run + 0.2]);
    for (const t of [0, 0.5, 1]) {
      const z = z0 - 0.4 + t * (run + 0.6), y = top + (footY - top) * Math.min(1, Math.max(0, (z - z0) / run));
      put('pad_post', at(x, y, z));
    }
    // (the plate's y runs up its height, its z along the stringer: from under the stair head to the foot)
    const zA = z0 - SKIRT_IN, zB = z0 + run, yA = S.headY - 0.4, H = top - 0.55 - yA;
    put('pad_panel', new THREE.Matrix4().set(1, 0, 0, x + s * 0.04, 0, H, footY - 0.25 - (top - 0.55), yA, 0, 0, zB - zA, zA, 0, 0, 0, 1));
  }
  put('pad_foot', at(0, footY, z0 + run + 0.8));
  k.tag = was;
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
