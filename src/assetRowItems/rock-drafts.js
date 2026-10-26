import * as THREE from 'three';
import { lineUp } from './common.js';
import { seat } from './props-util.js';
import { mulberry32 } from '../rng.js';
import { DRAFTS } from '../rockDrafts.js';

// ROCK DRAFTS: the two candidate sets for each shaped-rock change (rockDrafts.js), with their colliders and rails, to walk,
// skate and grind on before one is picked. Goes when the picks are built into rocks.js.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R_BIG = 1e5; // the snakes drape over a big sphere (as props-nature.js does for the snake rocks)
const bigSphere = { ground: (v, out) => out.copy(v).normalize().multiplyScalar(R_BIG) };

// one draft as a lineUp part { root, w, d, cols, rails }; `turn`: its yaw
function draftPart(make, seed, turn = 0, snake = false) {
  const p = snake ? V(0, R_BIG, 0) : V(0, 0, 0);
  const r = make(mulberry32(seed * 7919), p.clone(), new THREE.Quaternion(), snake ? bigSphere : null);
  r.mesh.position.set(0, 0, 0); // (geometry already relative to p)
  r.mesh.rotation.y = turn;
  const ct = Math.cos(turn), st = Math.sin(turn);
  const turned = (x, z) => [x * ct + z * st, -x * st + z * ct];
  const dir = (v) => { const [x, z] = turned(v.x, v.z); return V(x, v.y, z); };
  const cols = [];
  for (const c of r.cols) {
    const [x, z] = turned(c.c.x - p.x, c.c.z - p.z), y = c.c.y - p.y;
    if (c.type === 'sphere') cols.push({ type: 'sphere', x, y, z, r: c.r });
    else cols.push({ type: 'box', x, y, z, hx: c.hx, hy: c.hy, hz: c.hz, ax: dir(c.ax), ay: dir(c.ay), az: dir(c.az), ...(c.rail ? { rail: 0 } : {}) });
  }
  const rails = r.rail ? [r.rail.pts.map((q) => { const [x, z] = turned(q.x - p.x, q.z - p.z); return V(x, q.y - p.y, z); })] : [];
  const part = seat(r.mesh, { lift: false });
  const dx = r.mesh.position.x, dz = r.mesh.position.z;
  for (const c of cols) { c.x += dx; c.z += dz; }
  for (const pts of rails) for (const q of pts) { q.x += dx; q.z += dz; }
  return { root: part.root, w: part.w, d: part.d, cols, rails };
}

// a row of parts as one item, colliders and rails moved with their parts
function row(parts, gap) {
  const r = lineUp(parts, gap);
  const cols = [], rails = [];
  for (const p of parts) {
    const at = p.root.position.x, first = rails.length;
    for (const c of p.cols) cols.push({ ...c, x: c.x + at, ...(c.rail === undefined ? {} : { rail: first + c.rail }) });
    for (const pts of p.rails) rails.push(pts.map((q) => V(q.x + at, q.y, q.z)));
  }
  return { root: r.root, cols, rails };
}

const set = (key, gap, turn = 0, seeds = null) => () => row((seeds || DRAFTS[key].map((_, i) => i)).map((s, i) => draftPart(DRAFTS[key][seeds ? 0 : i], 11 + s * 7, turn, key.startsWith('snake'))), gap);

export default {
  id: 'rock.drafts',
  title: 'ROCK DRAFTS',
  items: [
    { id: 'draft.spire-a', label: 'DRAFT A: SHATTERED (SHEARED SPIRE · SPLIT BLOCK · TOPPLED HALF · SHARD CROWN)', w: 83, d: 17, make: set('spireA', 6) },
    { id: 'draft.spire-b', label: 'DRAFT B: WEATHERED (HOUSE ROCK · ROLLED BOULDER · CRACKED · PILE)', w: 75, d: 29, make: set('spireB', 6) },
    { id: 'draft.ramp-a', label: 'DRAFT A: STRATA SLAB · CURVED KICKER', w: 52, d: 12, make: set('rampA', 8, Math.PI / 2) },
    { id: 'draft.ramp-b', label: 'DRAFT B: TABLE-TOP · WHALEBACK', w: 71, d: 13, make: set('rampB', 8, Math.PI / 2) },
    { id: 'draft.snake-a', label: 'DRAFT A: SINUOUS SNAKES', w: 94, d: 14, make: set('snakeA', 10, Math.PI / 2, [0, 1]) },
    { id: 'draft.snake-b', label: 'DRAFT B: MEANDERING SNAKES', w: 85, d: 19, make: set('snakeB', 10, Math.PI / 2, [0, 1]) },
  ],
};
