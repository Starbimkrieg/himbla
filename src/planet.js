import * as THREE from 'three';
import { PLANET } from './config.js';
import { mulberry32, smoothstep, clamp } from './rng.js';
import { gradientMap } from './toon.js';
import { shapedRocks } from './rocks.js';
import { railOf } from './rails.js';
import { rayCollider } from './physics.js';
import { TerrainField, faceDir, dirToGrid, N, CH, CPF, N1, R, MAX_LOD } from './terrainField.js';
import { skinUniforms, patchRockMaterial, SKIN_COMMON, SKIN_NORMAL, SKIN_COLOR, SKIN_LIGHT } from './moonSkins.js';
import { makeBoulderShapes, makeBoulderInk, BOULDER_COLLIDER_K } from './boulders.js';

export { faceDir };
const _g = { f: 0, i: 0, j: 0 };
// terrain workers: chunks are worked out off the main thread (terrainWorker.js), so a detailed chunk
// (~25 ms of maths) no longer drops frames when you're going fast
// (2-4 workers, leaving cores for the game and the browser; jobs queued per worker: enough to keep
// them busy, few enough that what they're making is still what's wanted)
const WORKERS = Math.max(2, Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 2)), IN_FLIGHT = 4;
// a plateau as a worker needs it (the zone objects are whole locations: just the numbers)
// (a fitted town sends its plane as zrSet, which the worker takes as it is rather than fitting again)
function zoneMsg(z) { return { dir: [z.dir.x, z.dir.y, z.dir.z], r: z.r, late: !!z.late, zoneR: z.zoneR || 0, flatR: z.flatR, fit: !!z.fit, curved: !!z.curved, zrSet: z.zrSet }; }
const AHEAD_LOD = 1; // build-ahead: chunks round where you'll be soon, up to this level of detail
// the ink line along crater crests: how many rims the terrain shader takes, and how far out
const ROAD_KEEP = 14; // m a boulder's centre stays from the nearest sample of a road, beyond its own radius
const RIM_INK_MAX = 64, RIM_INK_REACH = 1500, RIM_INK_BIG = 120; // (no ink on rims bigger than that)
// a terrain chunk in the sun's depth pass: its grid only, not its skirt (makeChunkMesh)
const gridOnly = (r, o, cam, sc, geo) => { geo.drawRange.count = o.userData.gridIdx; };
const wholeChunk = (r, o, cam, sc, geo) => { geo.drawRange.count = Infinity; };
const _rv = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
const _p00 = new THREE.Vector3(), _p10 = new THREE.Vector3(), _p01 = new THREE.Vector3(), _p11 = new THREE.Vector3();

// The Moon: a procedurally generated cube-sphere with craters, ridges and flattened
// settlement plateaus. Only chunks near the camera and above the horizon are built and
// drawn, at a level of detail that falls off with distance; physics samples the exact
// finest-level triangles so what you see up close is what you ski on.
export class Planet extends TerrainField {
  constructor(scene, zones, seed = PLANET.seed) {
    super(zones, seed);
    this.scene = scene;
    this.R = R;
    this.initChunks();
    this.startWorkers(zones, seed);
    // one rectangular hole can be cut in the terrain (the Whispering Fissure's entrance ramp)
    this.holeU = {
      // mineral colour boost: the tints strengthened, warm and cool apart, more from high up
      uWarmK: { value: 1.45 }, uCoolK: { value: 1.35 }, uAltK: { value: 0.55 }, uCamAlt: { value: 0 },
      uHoleOn: { value: 0 }, uHoleO: { value: new THREE.Vector3() }, uHoleX: { value: new THREE.Vector3(1, 0, 0) },
      uHoleY: { value: new THREE.Vector3(0, 1, 0) }, uHoleZ: { value: new THREE.Vector3(0, 0, 1) },
      uHoleMin: { value: new THREE.Vector2() }, uHoleMax: { value: new THREE.Vector2() },
      // crater rims near the camera, for the ink line along their crests (updateRimInk)
      uRimC: { value: Array.from({ length: RIM_INK_MAX }, () => new THREE.Vector4()) }, uRimN: { value: 0 },
      ...skinUniforms(), // (moonSkins.js: candidate ground textures, off unless ?moonskin=N)
    };
    this.rimInkAt = new THREE.Vector3(1e9, 0, 0);
    this.tunnel = null; // set by the secrets system: overrides the floor underground
    this.material = this.makeMaterial();
    this.material.shadowSide = THREE.BackSide;
    this.material.defines = { ...(this.material.defines || {}), KEEP_GRAZE_SHADOW: '' }; // (toon.js: the ground keeps its long dusk shadows)
    this.boulderShapes = makeBoulderShapes(); // (boulders.js: a few lumpy shapes, one per chunk, set to unit RMS radius)
    this.boulderMat = patchRockMaterial(new THREE.MeshToonMaterial({ color: 0x8d8898, gradientMap: gradientMap() })); // (moonSkins.js: grain and dust when ?moonskin=1)
    this.boulderInk = makeBoulderInk();
    this.colliders = null;
    // dark backing sphere hides any sub-pixel cracks between LOD levels
    this.core = new THREE.Mesh(new THREE.SphereGeometry(R - 330, 96, 48), new THREE.MeshBasicMaterial({ color: 0x16121f }));
    scene.add(this.core);
    this.queue = [];
    this.stats = { built: 0, visible: 0 };
    this.lakes = []; // black lakes: { d, cos, level } — flat liquid surfaces in crater floors
    this.lastLake = null;
  }

  // Flatten ground after the fact (outposts the player founds): a plateau at the current height
  // of the centre, blended out to ~2x the radius. Rebuilds the affected terrain chunks.
  addFlat(dir, r) {
    const d = dir.clone().normalize();
    const zr = this.H(d.x, d.y, d.z);
    if (!this.addFlatData(d, r, zr)) return;
    this.tellWorkers({ type: 'flat', dir: d.toArray(), r, zr });
    this.redo(d, r);
  }

  // A settlement founded mid-game (main.js applyWorldLive): a plateau like the ones built at boot.
  // `swallow` lists the directions of founding-outpost plateaus the settlement grows over: they come
  // out first (else a 40 m flat at the old ground outlasts the town as a pit under its hall), and
  // their chunks are redone along with the town's.
  addZone(z, swallow = []) {
    for (const d of swallow) {
      const u = d.clone().normalize();
      const flat = this.flats.find((f) => f.dir.dot(u) > 0.999999);
      if (!flat) continue;
      const r = flat.r;
      this.removeFlatData(u);
      this.tellWorkers({ type: 'unflat', dir: u.toArray() });
      this.redo(u, r);
    }
    this.addZoneData(z); // (fits the plane here, once)
    this.tellWorkers({ type: 'zone', zone: zoneMsg(z) });
    this.redo(z.dir, z.fr);
    this.rimInfo = null; this.rimRails = null; // (crater lips and grind rails worked out for ground that is now flat)
  }

  // Drop the terrain chunks (and their boulders) round a plateau so they rebuild with it.
  redo(d, r) {
    this.cache.clear();
    const c = d.clone().multiplyScalar(R);
    for (const ch of this.chunks) {
      if (ch.center.distanceTo(c) > ch.radius + r * 2.2) continue;
      for (let l = 0; l < ch.meshes.length; l++) if (ch.meshes[l]) { this.scene.remove(ch.meshes[l]); ch.meshes[l].geometry.dispose(); ch.meshes[l] = null; }
      ch.shown = -1;
      if (ch.boulders) { this.scene.remove(ch.boulders); ch.boulders = null; ch.boulderSpec = null; }
      if (ch.boulderCols && this.colliders) { for (const col of ch.boulderCols) this.colliders.remove(col); ch.boulderCols = null; }
      ch.ver++; // (anything the workers are still making for it is out of date)
      ch.pending = 0;
    }
  }

  // ---------------- terrain workers ----------------
  startWorkers(zones, seed) {
    this.workers = [];
    this.jobs = new Map();
    this.ready = [];
    this.jobId = 0;
    if (typeof Worker === 'undefined') return;
    try {
      for (let w = 0; w < WORKERS; w++) {
        const wk = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
        wk.busy = 0;
        wk.onmessage = (e) => this.onJob(wk, e.data);
        // if a worker can't run (an odd browser, a locked-down file:// page), the main thread
        // builds every chunk itself, as it always used to
        wk.onerror = (e) => { console.warn('[terrain] worker failed, building on the main thread', e.message || e); this.dropWorkers(); };
        wk.postMessage({ type: 'init', seed, painted: this.painted, zones: zones.map(zoneMsg) });
        this.workers.push(wk);
      }
    } catch (err) {
      console.warn('[terrain] no workers', err);
      this.dropWorkers();
    }
  }

  dropWorkers() {
    for (const wk of this.workers || []) wk.terminate();
    this.workers = [];
    for (const job of this.jobs.values()) job.ch.pending &= ~(1 << job.lod);
    this.jobs.clear();
  }

  tellWorkers(msg) { for (const wk of this.workers) wk.postMessage(msg); }

  // ask a worker for a chunk at a level (the least busy one)
  request(ch, lod) {
    if (ch.pending & (1 << lod)) return true;
    let best = null;
    for (const wk of this.workers) if (wk.busy < IN_FLIGHT && (!best || wk.busy < best.busy)) best = wk;
    if (!best) return false;
    const id = ++this.jobId;
    this.jobs.set(id, { ch, lod, ver: ch.ver, wk: best });
    best.busy++;
    ch.pending |= 1 << lod;
    best.postMessage({ type: 'build', id, f: ch.f, cx: ch.cx, cy: ch.cy, flip: ch.flip, lod });
    return true;
  }

  onJob(wk, d) {
    const job = this.jobs.get(d.id);
    if (!job) return;
    this.jobs.delete(d.id);
    wk.busy--;
    job.ch.pending &= ~(1 << job.lod);
    if (job.ver !== job.ch.ver || job.ch.meshes[job.lod]) return; // (rebuilt since, or already made)
    this.ready.push({ ch: job.ch, lod: job.lod, d });
  }

  // Exact surface under world position p: returns surface radius, writes outward normal.
  surface(p, outN) {
    const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
    const dx = p.x / len, dy = p.y / len, dz = p.z / len;
    dirToGrid(dx, dy, dz, _g);
    const f = _g.f;
    const fi = clamp(_g.i, 0, N - 1e-6), fj = clamp(_g.j, 0, N - 1e-6);
    const i = Math.floor(fi), j = Math.floor(fj);
    const tx = fi - i, ty = fj - j;
    // (the square splits along whichever diagonal follows the ground: buildChunk makes the same choice)
    const r00 = this.vr(f, i, j), r10 = this.vr(f, i + 1, j), r01 = this.vr(f, i, j + 1), r11 = this.vr(f, i + 1, j + 1);
    let A, B, C;
    if (Math.abs(r00 - r11) <= Math.abs(r10 - r01)) {
      A = faceDir(f, i, j, _p00).multiplyScalar(r00);
      if (tx > ty) { B = faceDir(f, i + 1, j, _p10).multiplyScalar(r10); C = faceDir(f, i + 1, j + 1, _p11).multiplyScalar(r11); }
      else { B = faceDir(f, i + 1, j + 1, _p11).multiplyScalar(r11); C = faceDir(f, i, j + 1, _p01).multiplyScalar(r01); }
    } else if (tx + ty < 1) {
      A = faceDir(f, i, j, _p00).multiplyScalar(r00); B = faceDir(f, i + 1, j, _p10).multiplyScalar(r10); C = faceDir(f, i, j + 1, _p01).multiplyScalar(r01);
    } else {
      A = faceDir(f, i + 1, j, _p10).multiplyScalar(r10); B = faceDir(f, i + 1, j + 1, _p11).multiplyScalar(r11); C = faceDir(f, i, j + 1, _p01).multiplyScalar(r01);
    }
    _a.subVectors(B, A);
    _b.subVectors(C, A);
    _c.crossVectors(_a, _b);
    if (_c.dot(A) < 0) _c.negate();
    _c.normalize();
    const denom = _c.x * dx + _c.y * dy + _c.z * dz;
    const r = _c.dot(A) / Math.max(denom, 0.05);
    if (this.tunnel) {
      const f = this.tunnel.floor(p, len, dx, dy, dz, r, outN);
      if (f !== null) return f;
    }
    this.lastLake = null;
    for (let k = 0; k < this.lakes.length; k++) {
      const lk = this.lakes[k];
      const cd = dx * lk.d.x + dy * lk.d.y + dz * lk.d.z;
      if (cd > lk.cos && lk.level > r && (!lk.shore || this.inLake(lk, dx, dy, dz, cd))) {
        this.lastLake = lk;
        if (outN) outN.set(dx, dy, dz);
        return lk.level;
      }
    }
    if (outN) outN.copy(_c);
    return r;
  }

  // is this direction inside the lake's traced shoreline?
  inLake(lk, dx, dy, dz, cd) {
    const x = dx * lk.e1.x + dy * lk.e1.y + dz * lk.e1.z, y = dx * lk.e2.x + dy * lk.e2.y + dz * lk.e2.z;
    const n = lk.shore.length;
    const i = Math.round((Math.atan2(y, x) / (Math.PI * 2)) * n + n) % n;
    return Math.acos(Math.min(1, cd)) * this.R < lk.shore[i];
  }

  altitude(p) { return p.length() - this.surface(p); }

  // Point on the surface below direction/position v.
  ground(v, out = new THREE.Vector3(), lift = 0) {
    const r = this.surface(v);
    return out.copy(v).normalize().multiplyScalar(r + lift);
  }

  visible(a, b, steps = 12) {
    for (let i = 1; i < steps; i++) {
      _e.lerpVectors(a, b, i / steps);
      if (this.altitude(_e) < -0.5) return false;
    }
    return true;
  }

  // ---------------- chunked LOD rendering ----------------
  initChunks() {
    this.chunks = [];
    for (let f = 0; f < 6; f++) {
      // winding: make triangles face outward on every face
      const o = faceDir(f, N / 2, N / 2, new THREE.Vector3());
      const u = faceDir(f, N / 2 + 1, N / 2, new THREE.Vector3()).sub(o);
      const v = faceDir(f, N / 2, N / 2 + 1, new THREE.Vector3()).sub(o);
      const flip = new THREE.Vector3().crossVectors(u, v).dot(o) < 0;
      for (let cy = 0; cy < CPF; cy++) for (let cx = 0; cx < CPF; cx++) {
        const dir = faceDir(f, (cx + 0.5) * CH, (cy + 0.5) * CH, new THREE.Vector3());
        const corner = faceDir(f, cx * CH, cy * CH, new THREE.Vector3());
        this.chunks.push({
          f, cx, cy, flip, dir,
          center: dir.clone().multiplyScalar(R),
          radius: corner.multiplyScalar(R).distanceTo(dir.clone().multiplyScalar(R)) + 40,
          meshes: [null, null, null, null, null],
          shown: -1, want: -1, preWant: -1, queued: false, boulders: null, boulderCols: null, lastWanted: 0,
          ver: 0, pending: 0, hole: false, // (worker jobs: which levels are being made, and for which version)
        });
      }
    }
  }

  makeMaterial() {
    // the same three toon tones as everything else, but with short soft blends between them: a hard
    // step follows the terrain triangles round steep, curved walls (crater bowls) in a saw-tooth
    const W = 64, ramp = new Uint8Array(W * 4);
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / W;
      // (a dark band for the far side, then one gentle rise to full sun: no second step. A mid-to-
      // bright step turned every slope tipped a little toward the sun, round each crater, into a
      // soft pale blob, seen from above as smudges and webs)
      const v = 60 + 110 * smoothstep(0.27, 0.4, x) + 85 * Math.min(1, Math.max(0, (x - 0.4) / 0.4));
      ramp.set([v, v, v, 255], i * 4);
    }
    const soft = new THREE.DataTexture(ramp, W, 1, THREE.RGBAFormat);
    soft.minFilter = soft.magFilter = THREE.LinearFilter;
    soft.needsUpdate = true;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: soft });
    // Inked crater rims: a crisp black line along each crest (updateRimInk), over a soft darker band.
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.holeU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRim;\nattribute vec3 aTint;\nvarying float vRim;\nvarying vec3 vTint;\nvarying vec3 vHoleW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = aRim;\nvTint = aTint;\nvHoleW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vRim; varying vec3 vTint; varying vec3 vHoleW;
uniform float uWarmK, uCoolK, uAltK, uCamAlt;
uniform float uHoleOn; uniform vec3 uHoleO, uHoleX, uHoleY, uHoleZ; uniform vec2 uHoleMin, uHoleMax;
uniform vec4 uRimC[${RIM_INK_MAX}]; uniform int uRimN;
float rimHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rimNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rimHash(i), rimHash(i + vec3(1, 0, 0)), f.x), mix(rimHash(i + vec3(0, 1, 0)), rimHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rimHash(i + vec3(0, 0, 1)), rimHash(i + vec3(1, 0, 1)), f.x), mix(rimHash(i + vec3(0, 1, 1)), rimHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
${SKIN_COMMON}`)
        .replace('void main() {', `void main() {
  if (uHoleOn > 0.5) {
    vec3 hq = vHoleW - uHoleO;
    float hx = dot(hq, uHoleX), hz = dot(hq, uHoleZ), hy = dot(hq, uHoleY);
    if (hx > uHoleMin.x && hx < uHoleMax.x && hz > uHoleMin.y && hz < uHoleMax.y && hy > -45.0 && hy < 8.0) discard;
  }
  float skPx = length(fwidth(vHoleW)); // (metres per pixel on the ground: the surface textures fade out with it)
  float skHeight = 0.0; // (the regolith's relief in metres, worked out in the colour and read again by the normal)`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SKIN_NORMAL}`)
        .replace('#include <opaque_fragment>', `${SKIN_LIGHT}\n#include <opaque_fragment>`)
        // a soft shade over the rim, and a crisp black ink line along each crest: a circle round the
        // crater, measured per pixel on the sphere (so it's smooth whatever the triangles do). It
        // fades out where the rim itself does (worn away, or flattened under a settlement), and
        // with distance
        .replace('#include <color_fragment>', `#include <color_fragment>
float rimOld = (uSkin > 0.5 && uSkin < 1.5) ? 0.0 : 1.0; // (the regolith look draws its own rims: moonSkins.js skRim)
// the soft shade over the rim zone stays in the regolith look too, but only from a distance: it fades in as a pixel grows past 3 cm
// and is full from 30 cm (about 100 m up), where the rim's blocks have faded out. Close to, the rock is the rim
float rimShade = smoothstep(0.55, 1.0, vRim) * mix(smoothstep(0.03, 0.3, skPx), 1.0, rimOld);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.42), rimShade * 0.3);
vec3 rimP = normalize(vHoleW) * ${R.toFixed(1)};
// The ink runs along the crest of each grindable lip (rimOf): overlapping craters share one
// outline, the edge of the union of their discs; craters sitting wholly on a much bigger one's
// floor (negative radius) get their own. It wavers a little, swells and thins, but stays on the
// crest, where you grind.
float rimU = 1e6, rimOwn = 1e6;
vec3 rimCenU = vec3(0.0), rimCenO = vec3(0.0); // (the centre of the crater each distance is to: the regolith rims run their streaks along its radii)
for (int i = 0; i < ${RIM_INK_MAX}; i++) {
  if (i >= uRimN) break;
  vec4 c = uRimC[i];
  float sd = distance(rimP, c.xyz) - abs(c.w);
  if (c.w > 0.0) { if (sd < rimU) { rimU = sd; rimCenU = c.xyz; } } else if (abs(sd) < abs(rimOwn)) { rimOwn = sd; rimCenO = c.xyz; }
}
float rimWob = (rimNoise(rimP * 0.05) - 0.5) * 1.0 + (rimNoise(rimP * 0.17 + 4.0) - 0.5) * 0.4;
float rimEdge = min(abs(rimU + rimWob), abs(rimOwn + rimWob));
float rimPx = max(fwidth(rimEdge), 1e-3); // metres per pixel across the band
float rimFar = 1.0 - smoothstep(${(RIM_INK_REACH * 0.7).toFixed(1)}, ${RIM_INK_REACH.toFixed(1)}, distance(vHoleW, cameraPosition));
// Everything below is zero (so nothing changes) unless the pixel is within reach of a rim: past
// RIM_INK_REACH rimFar is 0, and the halo (the widest term) is 0 once rimEdge + 1.5 * rimRag >= 3.2 * rimHw,
// with rimRag >= -1.6 (so 2.4 at worst) and rimHw <= max(3.2, 1.2 * rimPx) (the noise term is at most 1.9);
// the core and the pebbles and chips lie inside that. The test uses only rimEdge and rimPx (a screen-space
// derivative, worked out above so nothing derivative-dependent sits inside the branch), with a little to
// spare, and it skips six of the block's eight noise lookups on nearly every pixel: same result, less work.
if (rimOld > 0.5 && rimFar > 0.0 && rimEdge < 3.2 * max(3.2, 1.2 * rimPx) + 2.5) {
// Not ink: a band of shattered regolith along the crest. An uneven rocky core whose edges break up
// into patches, a soft scuffed halo round it, and rubble through it - dark pebbles and bright
// chips of fresh rock (the grit fades out with distance before it can shimmer)
float rimRag = (rimNoise(rimP * 0.21 + 1.7) - 0.5) * 2.2 + (rimNoise(rimP * 0.55 - 6.0) - 0.5) * 1.0;
float rimHw = max(1.3 + 1.9 * rimNoise(rimP * 0.03 + 9.0), rimPx * 1.2);
float rimCore = 1.0 - smoothstep(rimHw * 0.55, rimHw * 1.35 + rimPx, rimEdge + rimRag);
float rimHalo = (1.0 - smoothstep(rimHw, rimHw * 3.2, rimEdge + rimRag * 1.5)) * 0.35;
float rimGritK = 1.0 - smoothstep(0.08, 0.35, rimPx);
float rimPeb = smoothstep(0.62, 0.72, rimNoise(rimP * 1.3 + 11.0)) * rimGritK;
float rimChip = smoothstep(0.8, 0.86, rimNoise(rimP * 1.9 - 4.0)) * rimGritK;
float rimLine = max(rimCore * (0.62 + 0.25 * rimNoise(rimP * 0.09 - 3.0)), rimHalo) * rimFar;
vec3 rimRock = vec3(0.24, 0.21, 0.29);
diffuseColor.rgb = mix(diffuseColor.rgb, rimRock, rimLine);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.085, 0.14), rimPeb * max(rimCore, rimHalo * 1.6) * 0.85 * rimFar);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.86), rimChip * rimCore * 0.6 * rimFar);
}
// mineral colour boost: the tint (what the mineral hues added, brightness-neutral) pushed further,
// warm ones (tan, buff, rust) and cool ones (blue-grey) by their own amounts, and more the higher up
// you are: modest under your feet, richer from orbit. The classic tones underneath are left alone.
{
  float warmth = vTint.r - vTint.b;
  float alt = 1.0 + uAltK * smoothstep(40.0, 600.0, uCamAlt);
  float k = mix(uCoolK, uWarmK, smoothstep(-0.004, 0.004, warmth)) * alt;
  diffuseColor.rgb = max(diffuseColor.rgb + vTint * (k - 1.0), 0.0);
}
${SKIN_COLOR}`);
    };
    return mat;
  }

  // Build a chunk here and now (spawning, teleports, the trailer: no waiting on the workers).
  buildChunk(ch, lod) {
    const d = this.computeChunk(ch.f, ch.cx, ch.cy, ch.flip, lod);
    this.fillCache(ch, lod, d.inside);
    this.makeChunkMesh(ch, lod, d);
  }

  // The physics cache gets a chunk's exact grid radii (what surface() would otherwise work out again).
  fillCache(ch, lod, inside) {
    const s = 1 << lod, vn = CH / s + 1, i0 = ch.cx * CH, j0 = ch.cy * CH, f = ch.f;
    if (this.cache.size > 400000) this.cache.clear();
    for (let b = 0; b < vn; b++) for (let a = 0; a < vn; a++) {
      const gi = Math.min(i0 + a * s, N), gj = Math.min(j0 + b * s, N);
      this.cache.set((f * N1 + gj) * N1 + gi, inside[b * vn + a]);
    }
  }

  makeChunkMesh(ch, lod, { pos, nor, col, rim, tint, idx }) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1; // (the road decal, renderOrder -0.5 in traffic.js, draws right after the terrain and before everything else)
    // hills block the sun again (without it, a rock's shadow fell straight through the hill and
    // landed a second time beyond it); only their far sides cast (material.shadowSide), so a
    // sunlit slope can't shadow itself into jagged blotches. Only the two detailed levels cast: a
    // coarse far tile's big flat triangles threw hard-edged polygon shadows (and, with the sun low,
    // long radial "spider-web" streaks) across the ground near you, shapes no hill on screen has
    mesh.castShadow = lod <= 1;
    // ...but not the skirt round the border (computeChunk: drawn after the grid's triangles). It drops
    // straight down from the chunk's edge, double-sided, so its top edge sat in the shadow map at
    // ground level and PCF smeared it onto the ground beside it: a thin dark line along every chunk
    // seam, sharpest at HIGH shadow quality. It hangs below the ground, so it has nothing to shade
    mesh.userData.gridIdx = (CH >> lod) * (CH >> lod) * 6;
    mesh.onBeforeShadow = gridOnly;
    mesh.onAfterShadow = wholeChunk;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.scene.add(mesh);
    ch.meshes[lod] = mesh;
    this.stats.built++;
  }

  // Is this spot free for a big rock? (no settlement or plateau, black lake or road)
  spotFree(p) {
    const d = _e.copy(p).normalize();
    for (const zn of this.zones) if (d.dot(zn.dir) > Math.cos((zn.r * 1.6 + 30) / R)) return false;
    for (const zn of this.flats) if (d.dot(zn.dir) > Math.cos((zn.r * 1.6 + 20) / R)) return false;
    for (const lk of this.lakes) if (d.dot(lk.d) > lk.cos - 0.002) return false;
    if (this.clearDirs) { const cs = this.clearCos; for (const c of this.clearDirs) if (d.dot(c) > cs) return false; }
    return true;
  }

  // Grind rails (the crests of snake rocks): polyline, arc lengths and a bounding sphere.
  addRail(r) {
    (this.rails ||= []).push(railOf(r.pts));
  }

  // Crater lips: the ink line and the grind rail are the same thing. A crater's lip counts if it
  // stands up as a firm ridge most of the way round (not flattened under a settlement, swallowed
  // by a neighbour, worn away, or a giant); its crest - where it peaks - is where the ink is drawn
  // and where you grind. Overlapping craters share one outline: each lip only runs where it
  // isn't inside a neighbour, so the cluster has one rim round it, inked and grindable. A crater
  // lying wholly on the floor of one at least twice its size keeps its whole lip.
  rimOf(c) {
    this.rimInfo ||= new Map();
    let I = this.rimInfo.get(c);
    if (I) return I;
    I = { ok: false, rpk: 1, rc: c.R, pts: null, nested: false, nb: null };
    this.rimInfo.set(c, I);
    if (c.type === 'ghost' || c.R < 24 || c.R > RIM_INK_BIG) return I;
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const at = (rr, th, out) => {
      const a = (rr * c.R) / R;
      out.copy(c.e1).multiplyScalar(Math.cos(th)).addScaledVector(c.e2, Math.sin(th)).multiplyScalar(Math.sin(a)).addScaledVector(c.d, Math.cos(a)).normalize();
      return this.surface(out);
    };
    // the crest sits a touch outside r = 1 (the bowl drags the inner side down): find it
    let rpk = 1, best = -1e9;
    for (let rr = 0.88; rr <= 1.3; rr += 0.01) {
      let h = 0;
      for (let k = 0; k < 6; k++) h += at(rr, k * 1.047 + 0.3, v);
      if (h > best) { best = h; rpk = rr; }
    }
    const n = Math.max(24, Math.ceil((2 * Math.PI * c.R * rpk) / 4));
    const pts = [];
    let firm = 0;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const top = at(rpk, th, v);
      // the rail hugs the ground you see (smoothed below, so it doesn't bob over every grid cell)
      pts.push(v.clone().multiplyScalar(top));
      // a firm lip stands up off the line between the bowl and the ground outside (which can be
      // higher than it, on a slope)
      if (top - (at(rpk - 0.3, th, w) + at(rpk + 0.35, th, w)) / 2 > 1.5) firm++;
    }
    // ease out the small bumps of the ground underneath, so the grind runs smooth
    // (and the steps where a scarp or ridge crosses the lip)
    let rad = pts.map((q) => q.length());
    for (let pass = 0; pass < 1; pass++) {
      rad = rad.map((_, i) => (rad[(i + n - 2) % n] + 2 * rad[(i + n - 1) % n] + 3 * rad[i] + 2 * rad[(i + 1) % n] + rad[(i + 2) % n]) / 9);
    }
    for (let i = 0; i < n; i++) pts[i].setLength(rad[i] + 0.1);
    I.ok = firm >= n * 0.8;
    I.rpk = rpk; I.rc = c.R * rpk; I.pts = pts;
    return I;
  }

  // the inked, grindable craters overlapping this one
  rimNeighbours(c) {
    const I = this.rimOf(c);
    if (I.nb) return I.nb;
    I.nb = [];
    for (const o of this.craters) {
      if (o === c || o.type === 'ghost' || o.R > RIM_INK_BIG) continue;
      const d = R * Math.acos(Math.min(1, c.d.dot(o.d)));
      if (d > (c.R + o.R) * 1.4) continue;
      const J = this.rimOf(o);
      if (!J.ok) continue;
      I.nb.push({ o, J, d });
      if (o.R >= c.R * 2 && d + I.rc < J.rc * 0.95) I.nested = true;
    }
    return I.nb;
  }

  // the grind rails along a crater's lip: one closed loop, or the open stretches of it that make up
  // part of a cluster's shared outline
  rimRailsOf(c) {
    const I = this.rimOf(c);
    if (!I.ok) return [];
    const nb = this.rimNeighbours(c);
    const pts = I.pts, n = pts.length;
    const keep = pts.map((p) => {
      if (I.nested) return true;
      for (const { o, J } of nb) {
        if (this.rimNeighbours(o) && J.nested) continue; // (nested ones don't cut the shared outline)
        if (R * Math.acos(Math.min(1, _rv.copy(p).normalize().dot(o.d))) < J.rc - 1) return false;
      }
      return true;
    });
    const rail = (list, loop) => {
      const cum = [0];
      for (let i = 1; i < list.length; i++) cum.push(cum[i - 1] + list[i].distanceTo(list[i - 1]));
      const cen = new THREE.Vector3();
      for (const q of list) cen.add(q);
      cen.divideScalar(list.length);
      let rad = 0;
      for (const q of list) rad = Math.max(rad, q.distanceTo(cen));
      return { pts: list, cum, len: cum[cum.length - 1], c: cen, rad, loop, rimOf: c };
    };
    if (keep.every(Boolean)) return [rail([...pts, pts[0].clone()], true)];
    const out = [];
    const start = keep.indexOf(false);
    let run = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (keep[i]) run.push(pts[i]);
      if (!keep[i] || k === n) { if (run.length >= 3) out.push(rail(run, false)); run = []; }
    }
    return out;
  }

  // Build the rim rails round you as you go (the Grinder calls this every half second).
  rimRailsNear(p) {
    this.rimRails ||= new Map();
    const d = _rv.copy(p).normalize();
    for (const c of this.craters) {
      if (this.rimRails.has(c) || c.type === 'ghost' || c.R > RIM_INK_BIG) continue;
      if (Math.abs(R * Math.acos(Math.min(1, d.dot(c.d))) - c.R) > 220) continue;
      this.rimRails.set(c, this.rimRailsOf(c));
    }
  }

  // Keep big rocks off these directions (the road network): set by the world once roads exist.
  keepClear(dirs, r) {
    this.clearDirs = dirs;
    this.clearCos = Math.cos(r / R);
  }

  // One more spot rocks stay off (a story gate): the chunks round it re-roll their boulders.
  clearSpot(d) {
    (this.clearDirs ||= []).push(d.clone().normalize());
    this.clearCos ??= Math.cos(26 / R);
    const c = d.clone().normalize().multiplyScalar(R);
    for (const ch of this.chunks) {
      if (ch.center.distanceTo(c) > ch.radius + 30) continue;
      if (ch.boulders) { this.scene.remove(ch.boulders); ch.boulders = null; ch.boulderSpec = null; }
      if (ch.boulderCols && this.colliders) { for (const col of ch.boulderCols) this.colliders.remove(col); ch.boulderCols = null; }
    }
  }

  // How far along the ray o + t*d (d unit) the first rock stands, or Infinity: every boulder and shaped
  // rock that is drawn (not just the ones near enough to have colliders), for hitscan beams.
  rockRay(o, d, tmax) {
    let best = Infinity;
    for (const ch of this.chunks) {
      if (!ch.boulderSpec || !ch.boulders || !ch.boulders.visible) continue;
      for (const c of ch.boulderSpec) {
        const t = rayCollider(c, o, d, Math.min(tmax, best));
        if (t < best) best = t;
      }
    }
    return best;
  }

  buildBoulders(ch) {
    const rr = mulberry32((ch.f * 7919 + ch.cy * 131 + ch.cx) * 2654435761);
    const count = 4 + Math.floor(rr() * 6);
    // rocky country (ridged highlands, scarps) gets extra boulders, from a generator of their own
    this.H(ch.dir.x, ch.dir.y, ch.dir.z);
    const rock = this.attr.rock;
    const extra = Math.floor(rock * 12);
    const rx = mulberry32((ch.f * 7919 + ch.cy * 131 + ch.cx) * 2246822519 ^ 0x7ee);
    // one lumpy shape for the whole chunk, and each boulder stretched a little its own way (from a sequence of its own: the
    // places, sizes and turns above come from rr and rx, and stay as they were)
    const seed = ch.f * 7919 + ch.cy * 131 + ch.cx;
    const shape = this.boulderShapes[((seed * 2654435761) >>> 0) % this.boulderShapes.length];
    const rv = mulberry32(seed * 40503 ^ 0x6b0d1e);
    const im = new THREE.InstancedMesh(shape, this.boulderMat, count + extra);
    const hull = new THREE.InstancedMesh(shape, this.boulderInk, count + extra);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const cols = [];
    let n = 0;
    for (let t = 0; t < count + extra; t++) {
      const g0 = t < count ? rr : rx; // (the original boulders keep their own sequence)
      faceDir(ch.f, ch.cx * CH + g0() * CH, ch.cy * CH + g0() * CH, p);
      let ok = true;
      for (const zn of this.zones) if (p.dot(zn.dir) > Math.cos((zn.r * 1.5) / R)) { ok = false; break; }
      for (const zn of this.flats) if (p.dot(zn.dir) > Math.cos((zn.r * 1.5) / R)) { ok = false; break; }
      if (ok && this.noBoulders) for (const c of this.noBoulders) if (p.dot(c) > this.noBouldersCos) { ok = false; break; } // (spots kept bare: the trailer)
      const s = 1.2 + Math.pow(g0(), 3) * 7;
      e.set(g0() * 3, g0() * 3, g0() * 3);
      const sx = 0.85 + rv() * 0.35, sy = 0.85 + rv() * 0.35, sz = 0.85 + rv() * 0.35; // (drawn for every spot, taken or not, so that one being refused moves none of the others)
      // (nor on a road: clear of the strip and its berm, whatever the boulder's size; clearDirs are samples of the road network, its edges included)
      if (ok && this.clearDirs) { const cr = Math.cos((ROAD_KEEP + s) / R); for (const c of this.clearDirs) if (p.dot(c) > cr) { ok = false; break; } }
      // (nor in a black lake, or at its edge: the liquid would swallow it or stand it on the surface)
      if (ok) for (const lk of this.lakes) if (p.dot(lk.d) > lk.cos - (s + 6) / R) { ok = false; break; }
      if (!ok) continue;
      const r = this.surface(p);
      p.multiplyScalar(r + s * 0.3);
      q.setFromEuler(e);
      m4.compose(p, q, sc.set(s * sx, s * 0.8 * sy, s * sz));
      im.setMatrixAt(n, m4);
      hull.setMatrixAt(n, m4); // (the ink is the same shell, pushed out along its normals in its shader: boulders.js)
      // the collision sphere: its radius is the boulder's RMS radius (the shapes have unit RMS before they are scaled by
      // sx, 0.8 sy and sz) times BOULDER_COLLIDER_K, which for an unstretched boulder is the 0.85 s it always was
      cols.push({ type: 'sphere', c: p.clone().addScaledVector(p.clone().normalize(), -s * 0.1), r: s * BOULDER_COLLIDER_K * Math.sqrt((sx * sx + 0.64 * sy * sy + sz * sz) / 3) });
      n++;
    }
    im.count = hull.count = n;
    im.castShadow = true;
    im.frustumCulled = hull.frustumCulled = false;
    im.updateMatrix(); hull.updateMatrix();
    im.matrixAutoUpdate = hull.matrixAutoUpdate = false; // (never moved: the shadow cache can take them at once)
    const g = new THREE.Group();
    g.add(im, hull);
    // shaped rocks: ramps, arches, hoodoos, mesas, wave walls (rocks.js)
    const sr = shapedRocks(this, ch, (u, v, out) => faceDir(ch.f, ch.cx * CH + (0.1 + 0.8 * u) * CH, ch.cy * CH + (0.1 + 0.8 * v) * CH, out), (pt) => this.spotFree(pt), rock);
    for (const m of sr.meshes) {
      g.add(m);
      m.updateMatrix();
      m.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    }
    g.updateMatrixWorld(true);
    cols.push(...sr.cols);
    for (const r of sr.rails) this.addRail(r);
    g.matrixAutoUpdate = false;
    g.visible = false;
    this.scene.add(g);
    for (const c of cols) c.rock = true; // (the Rail Lance's beam stops at these: rockRay)
    ch.boulders = g;
    ch.boulderSpec = cols;
  }

  // Decide per chunk what LOD to show; build missing meshes within a time budget.
  // Pick the crater crests within reach of the camera for the terrain shader's ink line: each one
  // is drawn exactly, per pixel, as a circle round its crater (worked out from vertex data it
  // followed the terrain triangles, and broke up wherever craters overlap).
  updateRimInk(camPos) {
    if (camPos.distanceToSquared(this.rimInkAt) < 40 * 40) return;
    const cd = _rv.copy(camPos).normalize();
    const near = [];
    for (const c of this.craters) {
      if (c.type === 'ghost' || c.R > RIM_INK_BIG || c.R < 24) continue;
      const gap = Math.abs(R * Math.acos(Math.min(1, cd.dot(c.d))) - c.R);
      if (gap < RIM_INK_REACH) near.push({ c, gap });
    }
    near.sort((a, b) => a.gap - b.gap);
    // measuring a lip takes about a millisecond: a few dozen at most per frame, nearest first
    // (the rest come in over the next frames, out at the far end of the ink's reach)
    const t0 = performance.now();
    let done = true;
    const U = this.holeU.uRimC.value;
    let n = 0;
    for (const { c } of near) {
      if (n >= RIM_INK_MAX) break;
      if (!this.rimInfo?.has(c) && performance.now() - t0 > 6) { done = false; continue; }
      const I = this.rimOf(c);
      if (!I.ok) continue;
      this.rimNeighbours(c);
      U[n++].set(c.d.x * R, c.d.y * R, c.d.z * R, I.nested ? -I.rc : I.rc);
    }
    this.holeU.uRimN.value = n;
    if (done) this.rimInkAt.copy(camPos);
  }

  // The LOD for a chunk this far (m) from the eye, or -1 past the limit.
  lodAt(d, limit) {
    if (d >= limit) return -1;
    const dl = d / (this.lodScale || 1); // settings: terrain detail
    return dl < 130 ? 0 : dl < 260 ? 1 : dl < 800 ? 2 : dl < 1700 ? 3 : 4;
  }

  // ahead: where the camera will be in a moment (main.js: your velocity), so the chunks there are
  // being made before you arrive. budgetMs: main-thread time for turning finished chunks into meshes
  // (or, with no workers, for making them); a huge budget builds everything wanted, right now.
  update(camPos, { budgetMs = 5, maxDist = 3200, ahead = null } = {}) {
    this.updateRimInk(camPos);
    this.holeU.uCamAlt.value = camPos.length() - this.surface(camPos); // (the mineral boost grows with height)
    const camLen = camPos.length();
    const rMin = R - 330, rMax = R + 260;
    const horizon = Math.sqrt(Math.max(0, camLen * camLen - rMin * rMin)) + Math.sqrt(rMax * rMax - rMin * rMin);
    const limit = Math.min(maxDist, horizon);
    const now = performance.now();
    const sync = budgetMs >= 1e8 || !this.workers.length;
    const t0 = performance.now();
    // finished chunks from the workers become meshes (a millisecond or two each): the ones filling a
    // gap first, then the coarse ones (cheap, and they fill the most screen), then the detailed ones
    if (this.ready.length > 1) this.ready.sort((a, b) => (b.ch.hole - a.ch.hole) || (b.lod - a.lod));
    while (this.ready.length && performance.now() - t0 < budgetMs) {
      const { ch, lod, d } = this.ready.shift();
      if (ch.meshes[lod]) continue;
      this.fillCache(ch, lod, d.inside);
      this.makeChunkMesh(ch, lod, d);
    }
    this.queue.length = 0;
    const pre = [];
    let visible = 0;
    for (const ch of this.chunks) {
      const want = this.lodAt(camPos.distanceTo(ch.center) - ch.radius, limit);
      ch.want = want;
      // build-ahead: the detailed levels round where you're heading (never coarser than wanted now)
      let preWant = -1;
      if (ahead) {
        const pw = this.lodAt(ahead.distanceTo(ch.center) - ch.radius, limit);
        if (pw >= 0 && pw <= AHEAD_LOD && (want < 0 || pw < want)) preWant = pw;
      }
      ch.preWant = preWant;
      if (want >= 0 || preWant >= 0) ch.lastWanted = now;
      let show = -1;
      if (want >= 0) {
        if (ch.meshes[want]) show = want;
        else {
          this.queue.push(ch);
          // show the closest available level meanwhile
          for (let l = 0; l <= MAX_LOD; l++) if (ch.meshes[l] && (show < 0 || Math.abs(l - want) < Math.abs(show - want))) show = l;
        }
      }
      if (preWant >= 0 && !ch.meshes[preWant]) pre.push(ch);
      ch.hole = want >= 0 && show < 0;
      if (show !== ch.shown) {
        if (ch.shown >= 0 && ch.meshes[ch.shown]) ch.meshes[ch.shown].visible = false;
        if (show >= 0) ch.meshes[show].visible = true;
        ch.shown = show;
      }
      if (show >= 0) visible++;
      // boulders: drawn for near chunks; colliders only where you can actually hit them
      const near = want >= 0 && want <= 2;
      if (near && !ch.boulders) this.buildBoulders(ch);
      if (ch.boulders) ch.boulders.visible = near;
      const active = want >= 0 && want <= 1;
      if (active && !ch.boulderCols && this.colliders) ch.boulderCols = ch.boulderSpec.map((c) => this.colliders.add(c));
      if (!active && ch.boulderCols) { for (const c of ch.boulderCols) this.colliders.remove(c); ch.boulderCols = null; }
      // free detailed meshes that are no longer needed (the trailer keeps them all: no rebuilds at its
      // cuts), but not ones made ahead for where you're going
      const keepAt = preWant >= 0 && (want < 0 || preWant < want) ? preWant : want;
      for (let l = 0; l < 3 && !this.keep; l++) {
        const m = ch.meshes[l];
        if (!m || ch.shown === l) continue;
        if (keepAt < 0 ? now - ch.lastWanted > 8000 : keepAt > l + 1) {
          this.scene.remove(m);
          m.geometry.dispose();
          ch.meshes[l] = null;
        }
      }
    }
    this.stats.visible = visible;
    // gaps first (nothing to show there at all), then closest first
    this.queue.sort((a, b) => (b.hole - a.hole) || camPos.distanceToSquared(a.center) - camPos.distanceToSquared(b.center));
    if (sync) {
      for (const ch of this.queue) {
        if (performance.now() - t0 > budgetMs) break;
        this.buildChunk(ch, ch.want);
        if (ch.shown >= 0 && ch.meshes[ch.shown]) ch.meshes[ch.shown].visible = false;
        ch.meshes[ch.want].visible = true;
        ch.shown = ch.want;
      }
      return this.queue.length;
    }
    // hand the workers what's wanted now, then what's wanted ahead
    for (const ch of this.queue) {
      // a gap gets a quick coarse level first (a few ms of work), then the detailed one
      if (ch.hole && ch.want < 2 && !ch.meshes[2] && !this.request(ch, 2)) break;
      if (!this.request(ch, ch.want)) break;
    }
    if (ahead && pre.length) {
      pre.sort((a, b) => ahead.distanceToSquared(a.center) - ahead.distanceToSquared(b.center));
      for (const ch of pre) if (!this.request(ch, ch.preWant)) break;
    }
    return this.queue.length;
  }
}
