import * as THREE from 'three';
import { lineUp } from './common.js';
import { seat } from './props-util.js';
import { toon, glow, inkMat } from '../toon.js';
import { mulberry32 } from '../rng.js';
import { build as buildRock, RAMPS, MONOLITHS, rampDims, snakePath } from '../rocks.js';
import { KINDS as METEOR_KINDS, meteorMats, makeMeteorRock } from '../meteors.js';

// 11 · NATURE: shaped rocks, boulders, crystal samples, meteors and the black lake.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- shaped rocks (rocks.js build) ----
// Only the snake needs a planet (it drapes over planet.ground() and takes "up" from the centre, so a plane won't do): a
// 1e5 m sphere curves under 1 cm over a 120 m rail. Colliders go in whole (the Row takes turned boxes), and a snake brings
// its crest as the item's `rails`, which the flat world registers so it grinds like the Moon's (rails.js).
const R_BIG = 1e5;
const bigSphere = { ground: (v, out) => out.copy(v).normalize().multiplyScalar(R_BIG) };

// one rock as a lineUp part { root, w, d, cols, rails }, colliders and rail in the part's frame; `turn`: its yaw
function rockPart(kind, seed, dims, turn = 0) {
  const rr = mulberry32(seed);
  const snake = kind === 'snake';
  const p = snake ? V(0, R_BIG, 0) : V(0, 0, 0);
  const r = buildRock(kind, rr, p.clone(), new THREE.Quaternion(), snake ? bigSphere : null, snake ? { path: snakePath(rr) } : dims);
  r.mesh.position.set(0, 0, 0); // (a snake's geometry is already relative to p)
  r.mesh.rotation.y = turn;
  const ct = Math.cos(turn), st = Math.sin(turn);
  const turned = (x, z) => [x * ct + z * st, -x * st + z * ct]; // point rotated by `turn` (as rotation.y)
  const dir = (v) => { const [x, z] = turned(v.x, v.z); return V(x, v.y, z); };
  const cols = r.cols.map((c) => {
    const [x, z] = turned(c.c.x - p.x, c.c.z - p.z), y = c.c.y - p.y;
    if (c.type === 'sphere') return { type: 'sphere', x, y, z, r: c.r };
    return { type: 'box', x, y, z, hx: c.hx, hy: c.hy, hz: c.hz, ax: dir(c.ax), ay: dir(c.ay), az: dir(c.az), ...(c.rail ? { rail: 0 } : {}) };
  });
  const rails = r.rail ? [r.rail.pts.map((q) => { const [x, z] = turned(q.x - p.x, q.z - p.z); return V(x, q.y - p.y, z); })] : [];
  const part = seat(r.mesh, { lift: false });
  const dx = r.mesh.position.x, dz = r.mesh.position.z; // seat's centring shift; colliders and rail follow
  for (const c of cols) { c.x += dx; c.z += dz; }
  for (const pts of rails) for (const q of pts) { q.x += dx; q.z += dz; }
  return { root: part.root, w: part.w, d: part.d, cols, rails };
}

// a row of parts as one item, colliders and rails moved with their parts
function rockRow(parts, gap) {
  const row = lineUp(parts, gap);
  const cols = [], rails = [];
  for (const p of parts) {
    const at = p.root.position.x, first = rails.length;
    for (const c of p.cols) cols.push({ ...c, x: c.x + at, ...(c.rail === undefined ? {} : { rail: first + c.rail }) });
    for (const pts of p.rails) rails.push(pts.map((q) => V(q.x + at, q.y, q.z)));
  }
  return { root: row.root, cols, rails };
}

// turned so the slopes face the walkway
const ramps = () => rockRow(RAMPS.map((variant, i) => rockPart('ramp', 11 + i, { ...rampDims(mulberry32(70 + i), variant), drop: 0 }, Math.PI / 2)), 6);
const monoliths = () => rockRow(MONOLITHS.map((variant, i) => rockPart('monolith', 31 + i, { variant })), 6);
const snakes = () => rockRow([rockPart('snake', 59, null, Math.PI / 2), rockPart('snake', 63, null, Math.PI / 2)], 8); // (a 63 m one, and a 48 m one that winds more)

// ---- boulders (planet.js buildBoulders: dodecahedron, s x 0.8s x s, half sunk, ink hull) ----
function boulders() {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = toon(0x8d8898), rr = mulberry32(5);
  const cols = [];
  const root = new THREE.Group();
  let x = 0;
  for (const s of [1.2, 2.4, 4, 6, 8.2]) { // s = 1.2 + g^3 * 7
    const m = new THREE.Mesh(geo, mat), h = new THREE.Mesh(geo, inkMat);
    const e = new THREE.Euler(rr() * 3, rr() * 3, rr() * 3);
    x += s;
    for (const [o, k] of [[m, 0], [h, 0.15]]) {
      o.position.set(x, s * 0.3, 0); // the game sits it at surface + 0.3 s
      o.rotation.copy(e);
      o.scale.set(s + k, s * 0.8 + k, s + k);
      o.castShadow = o === m;
      root.add(o);
    }
    cols.push({ type: 'sphere', x, y: s * 0.2, z: 0, r: s * 0.85 });
    x += s + 2;
  }
  return { root, cols };
}

// ---- crystal samples (world.js buildCrystals) ----
function crystals() {
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mats = [glow(0x2ee6ff), glow(0x7dff6a), glow(0xc77dff)];
  const parts = [];
  for (let n = 0; n < 4; n++) {
    const rr = mulberry32(5150 + n * 17);
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(geo, mats[k % 3]);
      m.scale.set(0.5, 1.2 + rr(), 0.5);
      m.position.set((rr() - 0.5) * 1.6, 0.8, (rr() - 0.5) * 1.6);
      m.rotation.set((rr() - 0.5) * 0.6, rr() * 3, (rr() - 0.5) * 0.6);
      g.add(m);
    }
    parts.push({ root: g, w: 2.6, d: 2.6 });
  }
  return { root: lineUp(parts, 2.5).root };
}

// ---- black lake (world.js buildLakes): the game's shader on a disc ----
function blackLake() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0;
          float ripple = sin(r * 40.0 - time * 1.5) * 0.5 + 0.5;
          float glint = smoothstep(0.92, 1.0, ripple) * (1.0 - r) * 0.35;
          float rim = smoothstep(0.86, 0.98, r);
          vec3 col = vec3(0.03, 0.02, 0.06) + vec3(0.35, 0.22, 0.6) * glint + vec3(0.25, 0.15, 0.45) * rim;
          gl_FragColor = vec4(col, 1.0); }`,
    side: THREE.DoubleSide,
  });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(45, 72).rotateX(-Math.PI / 2), mat); // game lakes are 40-380 m across
  lake.position.y = 0.06;
  const root = new THREE.Group();
  root.add(lake);
  return { root, update: (dt, t) => { mat.uniforms.time.value = t; } };
}

// ---- meteors (meteors.js makeMeteorRock) ----
function meteorParts(radius, kinds) {
  const bodies = [];
  const parts = kinds.map((k, i) => {
    const { body } = makeMeteorRock(k, meteorMats(k), radius, 10 + i * 7);
    bodies.push(body);
    const p = seat(body);
    p.minor = Math.min(body.scale.x, body.scale.z) * 0.92;
    return p;
  });
  return { parts, bodies };
}
function meteorRocks() {
  const { parts, bodies } = meteorParts(7.5, Object.keys(METEOR_KINDS));
  const row = lineUp(parts, 3);
  const cols = parts.map((p) => ({ type: 'sphere', x: p.root.position.x, y: p.minor, z: 0, r: p.minor }));
  return { root: row.root, cols, update: (dt) => { for (const b of bodies) b.rotation.y += dt * 0.35; } }; // they tumble in flight
}
function meteorBig() {
  const { parts, bodies } = meteorParts(16.875, ['stony']);
  const p = parts[0];
  return { root: p.root, cols: [{ type: 'sphere', x: 0, y: p.minor, z: 0, r: p.minor }], update: (dt) => { bodies[0].rotation.y += dt * 0.2; } };
}

export default {
  id: 'props.nature',
  title: '11 · NATURE',
  items: [
    { id: 'rock.ramp', label: 'RAMP ROCKS: STRATA SLAB · CURVED KICKER · WHALEBACK', w: 87, d: 13, make: ramps },
    { id: 'rock.monolith', label: 'MONOLITHS: SHEARED SPIRE · TOPPLED HALF · HOUSE ROCK · CRACKED BOULDER', w: 74, d: 13, make: monoliths },
    { id: 'rock.snake-rail', label: 'SNAKE RAIL ROCKS', w: 104, d: 26, make: snakes },
    { id: 'rock.boulder', label: 'BOULDERS (2.4 – 16 M)', w: 52, d: 22, make: boulders },
    { id: 'nature.crystal-cluster', label: 'ROCK SAMPLES', w: 17, d: 4, solid: false, make: crystals },
    { id: 'nature.black-lake', label: 'BLACK LAKE', w: 90, d: 90, solid: false, make: blackLake },
    { id: 'meteor.rocks', label: 'METEORS: STONY · IRON · ICY · CARBON · CRYSTAL', w: 98, d: 24, make: meteorRocks },
    { id: 'meteor.rock-big', label: 'LARGEST METEOR (R 17 M)', w: 42, d: 42, make: meteorBig },
  ],
};
