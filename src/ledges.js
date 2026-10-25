import * as THREE from 'three';
import { railOf } from './rails.js';

// Ledge rails: the grindable top edges of a place's box colliders (roof edges, canopies, parapets, walls, steps, counters,
// benches), ground like snake-rock crests by rails.js (grabbed only on skates, from the air, heading along them).
// A box with a level top gives its four top edges. Each is sampled every SAMPLE m and a stretch counts where
//   - nothing sits on it (just above it is clear, so a cap 5 cm thick or more takes the edge over),
//   - nothing stands against it (just outside and above it is clear: not the foot of a wall),
//   - it is an edge, not a seam (just outside and below it is clear: no neighbouring box carries the surface on),
// and the stretch is at least MIN_TOP over the ground. Stretches whose ends meet (within GAP) and that carry on turning at most
// BEND are joined (across a gap along the rail, never a step sideways or up to a neighbouring edge), so a long roof cut into 8 m colliders on a curved place (world.col), a curved arcade or a ring of straight
// fence bays is one rail; a corner of a building is not. Kept if LEDGE_MIN long or more.
// Each rail: railOf's { pts, cum, len, c, rad } plus ledge: true and owners (its colliders, which the grind's
// clearance check ignores). ledgeRailsJob is the same work as a generator that yields every few hundred colliders (rails.js
// spreads it over frames as you approach: a tenth of a second or more of work in one frame would be a hitch).

const SAMPLE = 1.0, LEDGE_MIN = 2.5, MIN_TOP = 0.3, JOIN = 0.05, GAP = 0.6, BEND = Math.cos((30 * Math.PI) / 180);
const HCELL = 8; // m: the place's own collider lookup while working it out (the game's grid has 64 m cells: hundreds per query here)
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(), _t = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Vector3();
const hkey = (x, y, z) => `${x},${y},${z}`;

export function ledgeRails(cols, colliders, planet) {
  const job = ledgeRailsJob(cols, colliders, planet);
  for (;;) { const r = job.next(); if (r.done) return r.value; }
}

export function* ledgeRailsJob(cols, colliders, planet) {
  // each collider in the cells its bounding sphere (physics.js: mid, br) touches, 1 m to spare
  const hash = new Map();
  let done = 0;
  for (const c of cols) {
    if (++done % 400 === 0) yield;
    const m = c.mid || c.c, r = (c.br || c.r || 1) + 1;
    for (let x = Math.floor((m.x - r) / HCELL); x <= Math.floor((m.x + r) / HCELL); x++)
      for (let y = Math.floor((m.y - r) / HCELL); y <= Math.floor((m.y + r) / HCELL); y++)
        for (let z = Math.floor((m.z - r) / HCELL); z <= Math.floor((m.z + r) / HCELL); z++) {
          const k = hkey(x, y, z);
          (hash.get(k) || hash.set(k, []).get(k)).push(c);
        }
  }
  // is p inside (or within r of) any of the place's colliders but `own`?
  const blocked = (p, r, own) => {
    const cell = hash.get(hkey(Math.floor(p.x / HCELL), Math.floor(p.y / HCELL), Math.floor(p.z / HCELL)));
    if (cell) for (const c of cell) if (c !== own && colliders.contact(c, p, r, _n) > 0) return true;
    return false;
  };
  yield;
  const segs = [];
  for (const c of cols) {
    if (++done % 20 === 0) yield;
    if (c.type !== 'box' || c.platform || c.bouncy) continue;
    _up.copy(c.c).normalize();
    const d = c.ay.dot(_up);
    if (Math.abs(d) < 0.95) continue;                                   // level enough to ride (roof decks rake a few degrees)
    _t.copy(c.c).addScaledVector(c.ay, Math.sign(d) * c.hy);             // top face centre
    if (_t.length() - planet.surface(_t) < MIN_TOP) continue;
    for (const [A, hA, B, hB] of [[c.ax, c.hx, c.az, c.hz], [c.az, c.hz, c.ax, c.hx]]) for (const sB of [-1, 1]) {
      if (2 * hA < 0.5) continue;
      const out = B.clone().multiplyScalar(sB);
      const n = Math.max(1, Math.round((2 * hA) / SAMPLE));
      let run = null;
      for (let i = 0; i <= n; i++) {
        const p = _t.clone().addScaledVector(out, hB).addScaledVector(A, -hA + (2 * hA * i) / n);
        const up = _q.copy(p).normalize();
        const free = !blocked(_a.copy(p).addScaledVector(up, -0.35).addScaledVector(out, 0.45), 0.2, c)
          && !blocked(_a.copy(p).addScaledVector(up, 0.3).addScaledVector(out, -0.15), 0.25, c)       // (from 5 cm up: a cap on it counts)
          && !blocked(_a.copy(p).addScaledVector(up, 0.3).addScaledVector(out, 0.45), 0.25, c)
          && p.length() - planet.surface(p) >= MIN_TOP;
        if (free) { if (run) run.pts[1] = p; else run = { pts: [p, p], owner: c }; }
        if ((!free || i === n) && run) { if (run.pts[0] !== run.pts[1]) segs.push(run); run = null; }
      }
    }
  }
  // join stretches into chains, each carrying on the way it was going (two colliders with the same top give the same edge
  // twice: one is kept). Ends are found by GAP cells round a chain's end.
  const key = (p) => `${Math.round(p.x / JOIN)},${Math.round(p.y / JOIN)},${Math.round(p.z / JOIN)}`;   // (5 cm: only the same edge twice)
  const gkey = (x, y, z) => `${x},${y},${z}`;
  const ends = new Map(), seen = new Set();
  yield;
  for (const s of segs) {
    const k0 = key(s.pts[0]), k1 = key(s.pts[1]), sk = k0 < k1 ? k0 + '|' + k1 : k1 + '|' + k0;
    if (seen.has(sk)) { s.dup = true; continue; }
    seen.add(sk);
    for (const p of s.pts) { const k = gkey(Math.floor(p.x / GAP), Math.floor(p.y / GAP), Math.floor(p.z / GAP)); (ends.get(k) || ends.set(k, []).get(k)).push(s); }
  }
  const near = (p) => {
    const out = new Set(), x = Math.floor(p.x / GAP), y = Math.floor(p.y / GAP), z = Math.floor(p.z / GAP);
    for (let i = x - 1; i <= x + 1; i++) for (let j = y - 1; j <= y + 1; j++) for (let k = z - 1; k <= z + 1; k++) for (const s of ends.get(gkey(i, j, k)) || []) out.add(s);
    return out;
  };
  const used = new Set(), rails = [];
  for (const s of segs) {
    if (++done % 200 === 0) yield;
    if (s.dup || used.has(s)) continue;
    used.add(s);
    const chain = [...s.pts], owners = new Set([s.owner]);
    for (const front of [false, true]) {                                 // grow the tail, then the head
      for (;;) {
        const end = front ? chain[0] : chain[chain.length - 1], prev = front ? chain[1] : chain[chain.length - 2];
        const along = _q.subVectors(end, prev).normalize().clone();
        // the best-aligned unused stretch starting within GAP of the end and carrying on within BEND of the way it goes
        let next = null, best = BEND, nearEnd = null;
        for (const o of near(end)) {
          if (used.has(o)) continue;
          const i = o.pts[0].distanceTo(end) <= o.pts[1].distanceTo(end) ? 0 : 1, a = o.pts[i], b = o.pts[1 - i];
          if (a.distanceTo(end) > GAP) continue;
          // the gap has to lie along the rail: not a step across to a neighbouring edge (a ridge cap beside the deck's edge)
          const gap = _t.subVectors(a, end), up = _up.copy(end).normalize(), rise = gap.dot(up);
          if (Math.abs(rise) > 0.12 || gap.addScaledVector(up, -rise).addScaledVector(along, -gap.dot(along)).length() > 0.2) continue;
          const d = _t.subVectors(b, a).normalize().dot(along);
          if (d > best) { best = d; next = o; nearEnd = [a, b]; }
        }
        if (!next) break;
        used.add(next); owners.add(next.owner);
        const add = nearEnd[0].distanceTo(end) > 0.05 ? nearEnd : [nearEnd[1]];        // (across a gap, through its near end)
        if (front) chain.unshift(...add.reverse()); else chain.push(...add);
      }
    }
    const r = railOf(chain);
    if (r.len < LEDGE_MIN) continue;
    r.ledge = true;
    r.owners = owners;
    rails.push(r);
  }
  return rails;
}
