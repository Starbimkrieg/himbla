import * as THREE from 'three';
import { PLANET } from './config.js';
import { mulberry32, smoothstep, clamp } from './rng.js';
import { gradientMap } from './toon.js';
import { shapedRocks } from './rocks.js';
import { railOf } from './rails.js';
import { rayCollider } from './physics.js';
import { TerrainField, faceDir, dirToGrid, N, CH, CPF, N1, R, MAX_LOD } from './terrainField.js';
import { skinUniforms, patchRockMaterial, SK_NOISE, SKIN_COMMON, SKIN_NORMAL, SKIN_COLOR, SKIN_LIGHT } from './moonSkins.js';
import { makeBoulderShapes, makeBoulderInk, BOULDER_COLLIDER_K } from './boulders.js';

export { faceDir };
const _g = { f: 0, i: 0, j: 0 };
// terrain workers (terrainWorker.js): detailed chunks (~25 ms of maths) are built off the main thread so speed doesn't
// drop frames. 2-4 workers, leaving cores for the game and browser; IN_FLIGHT jobs each keeps them busy while staying
// relevant
const WORKERS = Math.max(2, Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 2)), IN_FLIGHT = 4;
// a plateau as plain numbers for a worker; a fitted town sends its plane as zrSet, used as is
function zoneMsg(z) { return { dir: [z.dir.x, z.dir.y, z.dir.z], r: z.r, late: !!z.late, zoneR: z.zoneR || 0, flatR: z.flatR, fit: !!z.fit, curved: !!z.curved, zrSet: z.zrSet }; }
const AHEAD_LOD = 1; // build-ahead: chunks where you'll soon be, up to this LOD
const ROAD_KEEP = 14; // m from a boulder's centre to the nearest road sample, beyond its radius
// crater-crest ink: rims the shader takes, reach (m), and the largest rim inked
const RIM_INK_MAX = 64, RIM_INK_REACH = 1500, RIM_INK_BIG = 120;
// chunk in the sun's depth pass: grid only, not the skirt (makeChunkMesh)
const gridOnly = (r, o, cam, sc, geo) => { geo.drawRange.count = o.userData.gridIdx; };
const wholeChunk = (r, o, cam, sc, geo) => { geo.drawRange.count = Infinity; };
const _rv = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
const _p00 = new THREE.Vector3(), _p10 = new THREE.Vector3(), _p01 = new THREE.Vector3(), _p11 = new THREE.Vector3();

// The Moon: a procedural cube-sphere with craters, ridges and settlement plateaus. Only chunks near the camera and above
// the horizon are built, LOD falling off with distance; physics samples the finest triangles, so what you see up close
// is what you ski on.
export class Planet extends TerrainField {
  constructor(scene, zones, seed = PLANET.seed) {
    super(zones, seed);
    this.scene = scene;
    this.R = R;
    this.initChunks();
    this.startWorkers(zones, seed);
    // one rectangular terrain hole (the Whispering Fissure's entrance ramp)
    this.holeU = {
      // mineral colour boost: warm and cool tints strengthened separately, more from high up
      uWarmK: { value: 1.45 }, uCoolK: { value: 1.35 }, uAltK: { value: 0.55 }, uCamAlt: { value: 0 },
      uHoleOn: { value: 0 }, uHoleO: { value: new THREE.Vector3() }, uHoleX: { value: new THREE.Vector3(1, 0, 0) },
      uHoleY: { value: new THREE.Vector3(0, 1, 0) }, uHoleZ: { value: new THREE.Vector3(0, 0, 1) },
      uHoleMin: { value: new THREE.Vector2() }, uHoleMax: { value: new THREE.Vector2() },
      // nearby crater rims for the crest ink (updateRimInk)
      uRimC: { value: Array.from({ length: RIM_INK_MAX }, () => new THREE.Vector4()) }, uRimN: { value: 0 },
      ...skinUniforms(), // moonSkins.js candidate ground textures, off unless ?moonskin=N
    };
    this.rimInkAt = new THREE.Vector3(1e9, 0, 0);
    this.tunnel = null; // secrets system: overrides the floor underground
    this.material = this.makeMaterial();
    this.material.shadowSide = THREE.BackSide;
    this.material.defines = { ...(this.material.defines || {}), KEEP_GRAZE_SHADOW: '' }; // toon.js: keep long dusk shadows
    this.boulderShapes = makeBoulderShapes(); // boulders.js: lumpy shapes (one per chunk), unit RMS radius
    this.boulderMat = patchRockMaterial(new THREE.MeshToonMaterial({ color: 0x8d8898, gradientMap: gradientMap() })); // grain and dust with ?moonskin=1
    this.boulderInk = makeBoulderInk();
    this.colliders = null;
    // dark backing sphere hides sub-pixel cracks between LODs
    this.core = new THREE.Mesh(new THREE.SphereGeometry(R - 330, 96, 48), new THREE.MeshBasicMaterial({ color: 0x16121f }));
    scene.add(this.core);
    this.queue = [];
    this.stats = { built: 0, visible: 0 };
    this.lakes = []; // black lakes: { d, cos, level }, flat liquid in crater floors
    this.lastLake = null;
  }

  // Flatten ground later (player-founded outposts): a plateau at the centre's height, blended out to ~2x r. Rebuilds chunks.
  addFlat(dir, r) {
    const d = dir.clone().normalize();
    const zr = this.H(d.x, d.y, d.z);
    if (!this.addFlatData(d, r, zr)) return;
    this.tellWorkers({ type: 'flat', dir: d.toArray(), r, zr });
    this.redo(d, r);
  }

  // A settlement founded mid-game (main.js applyWorldLive), like the boot plateaus. `swallow`: outpost plateau directions
  // it grows over; removed first (else the old 40 m flat leaves a pit under the hall) and their chunks redone too.
  addZone(z, swallow = []) {
    for (const d of swallow) {
      const u = d.clone().normalize();
      const flat = this.flats.find((f) => f.dir.dot(u) > 0.999999);
      if (!flat) continue;
      this.removeFlatData(u);
      this.tellWorkers({ type: 'unflat', dir: u.toArray() });
      this.redo(u, flat.r);
    }
    this.addZoneData(z); // fits the plane here, once
    this.tellWorkers({ type: 'zone', zone: zoneMsg(z) });
    this.redo(z.dir, z.fr);
    this.rimInfo = null; this.rimRails = null; // lips and rails may be on ground now flat
  }

  // Drop the chunks (and boulders) round a plateau so they rebuild with it.
  redo(d, r) {
    this.cache.clear();
    const c = d.clone().multiplyScalar(R);
    for (const ch of this.chunks) {
      if (ch.center.distanceTo(c) > ch.radius + r * 2.2) continue;
      for (let l = 0; l < ch.meshes.length; l++) if (ch.meshes[l]) { this.scene.remove(ch.meshes[l]); ch.meshes[l].geometry.dispose(); ch.meshes[l] = null; }
      ch.shown = -1;
      if (ch.boulders) { this.scene.remove(ch.boulders); ch.boulders = null; ch.boulderSpec = null; }
      if (ch.boulderCols && this.colliders) { for (const col of ch.boulderCols) this.colliders.remove(col); ch.boulderCols = null; }
      ch.ver++; // in-flight worker jobs for it are stale
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
        // if a worker can't run (odd browser, locked-down file:// page), the main thread builds every chunk
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

  // ask the least busy worker for a chunk at a LOD
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
    if (job.ver !== job.ch.ver || job.ch.meshes[job.lod]) return; // stale or already made
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
    // split along the diagonal that follows the ground (buildChunk chooses the same)
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

  // direction inside the lake's traced shoreline?
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
      // winding: triangles face outward on every face
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
          ver: 0, pending: 0, hole: false, // worker jobs: LODs in progress, and for which version
        });
      }
    }
  }

  makeMaterial() {
    // the usual toon tones with short soft blends: a hard step saw-tooths along the triangles of curved crater walls
    const W = 64, ramp = new Uint8Array(W * 4);
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / W;
      // a dark far-side band, then one gentle rise to full sun; a second (mid-to-bright) step made sun-tilted slopes
      // round craters into pale blobs, smudges and webs from above
      const v = 60 + 110 * smoothstep(0.27, 0.4, x) + 85 * Math.min(1, Math.max(0, (x - 0.4) / 0.4));
      ramp.set([v, v, v, 255], i * 4);
    }
    const soft = new THREE.DataTexture(ramp, W, 1, THREE.RGBAFormat);
    soft.minFilter = soft.magFilter = THREE.LinearFilter;
    soft.needsUpdate = true;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: soft });
    // Inked crater rims: a crisp line along each crest (updateRimInk) over a soft darker band.
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
uniform vec4 uRimC[${RIM_INK_MAX}]; uniform int uRimN;${SK_NOISE}${SKIN_COMMON}`)
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
        // soft rim shade plus a crisp crest line: a circle round the crater measured per pixel on the sphere (smooth
        // whatever the triangles do). Fades where the rim does (worn, flattened under a settlement) and with distance
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

  // Build a chunk now (spawn, teleport, trailer: no waiting on workers).
  buildChunk(ch, lod) {
    const d = this.computeChunk(ch.f, ch.cx, ch.cy, ch.flip, lod);
    this.fillCache(ch, lod, d.inside);
    this.makeChunkMesh(ch, lod, d);
  }

  // Cache a chunk's exact grid radii for physics (saves surface() recomputing them).
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
    mesh.renderOrder = -1; // the road decal (renderOrder -0.5, traffic.js) draws right after terrain
    // hills cast so rock shadows don't pass through them; only far sides cast (material.shadowSide) so sunlit slopes
    // don't self-shadow into blotches. Only the two detailed LODs cast: coarse tiles' big triangles throw hard polygon
    // shadows (and low-sun "spider-web" streaks) no visible hill has
    mesh.castShadow = lod <= 1;
    // ...but not the skirt (computeChunk: drawn after the grid). Double-sided at ground level, PCF smeared it into a dark
    // line along every chunk seam; it hangs below ground, so it has nothing to shade
    mesh.userData.gridIdx = (CH >> lod) * (CH >> lod) * 6;
    mesh.onBeforeShadow = gridOnly;
    mesh.onAfterShadow = wholeChunk;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.scene.add(mesh);
    ch.meshes[lod] = mesh;
    this.stats.built++;
  }

  // Free for a big rock? (no settlement, plateau, black lake or road)
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

  // Crater lips: ink line and grind rail are one. A lip counts if it's a firm ridge most of the way round (not flattened
  // by a settlement, swallowed, worn or a giant); its crest is inked and grindable. Overlapping craters share one outline
  // (each lip runs only outside its neighbours). A crater wholly on the floor of one at least twice its size keeps its lip.
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
    // find the crest, a touch outside r = 1 (the bowl drags the inner side down)
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
      // rail hugs the visible ground (smoothed below, so it doesn't bob per grid cell)
      pts.push(v.clone().multiplyScalar(top));
      // firm: stands above the line from bowl to outside ground (which can be higher, on a slope)
      if (top - (at(rpk - 0.3, th, w) + at(rpk + 0.35, th, w)) / 2 > 1.5) firm++;
    }
    // smooth out ground bumps (and scarp or ridge steps) so the grind runs smooth
    const r0 = pts.map((q) => q.length());
    const rad = r0.map((_, i) => (r0[(i + n - 2) % n] + 2 * r0[(i + n - 1) % n] + 3 * r0[i] + 2 * r0[(i + 1) % n] + r0[(i + 2) % n]) / 9);
    for (let i = 0; i < n; i++) pts[i].setLength(rad[i] + 0.1);
    I.ok = firm >= n * 0.8;
    I.rpk = rpk; I.rc = c.R * rpk; I.pts = pts;
    return I;
  }

  // inked, grindable craters overlapping this one
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

  // a lip's grind rails: one closed loop, or the open stretches on a cluster's shared outline
  rimRailsOf(c) {
    const I = this.rimOf(c);
    if (!I.ok) return [];
    const nb = this.rimNeighbours(c);
    const pts = I.pts, n = pts.length;
    const keep = pts.map((p) => {
      if (I.nested) return true;
      for (const { o, J } of nb) {
        if (this.rimNeighbours(o) && J.nested) continue; // nested ones don't cut the outline
        if (R * Math.acos(Math.min(1, _rv.copy(p).normalize().dot(o.d))) < J.rc - 1) return false;
      }
      return true;
    });
    const rail = (list, loop) => ({ ...railOf(list), loop, rimOf: c });
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

  // Build nearby rim rails as you go (the Grinder calls this every 0.5 s).
  rimRailsNear(p) {
    this.rimRails ||= new Map();
    const d = _rv.copy(p).normalize();
    for (const c of this.craters) {
      if (this.rimRails.has(c) || c.type === 'ghost' || c.R > RIM_INK_BIG) continue;
      if (Math.abs(R * Math.acos(Math.min(1, d.dot(c.d))) - c.R) > 220) continue;
      this.rimRails.set(c, this.rimRailsOf(c));
    }
  }

  // Keep big rocks off these directions (the road network), set once roads exist.
  keepClear(dirs, r) {
    this.clearDirs = dirs;
    this.clearCos = Math.cos(r / R);
  }

  // One more rock-free spot (a story gate); nearby chunks re-roll their boulders.
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

  // Distance along ray o + t*d (d unit) to the first drawn boulder or shaped rock (colliders or not), or Infinity.
  // For hitscan beams.
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
    const seed = ch.f * 7919 + ch.cy * 131 + ch.cx;
    const rr = mulberry32(seed * 2654435761);
    const count = 4 + Math.floor(rr() * 6);
    // rocky country (ridged highlands, scarps) gets extra boulders, from their own generator
    this.H(ch.dir.x, ch.dir.y, ch.dir.z);
    const rock = this.attr.rock;
    const extra = Math.floor(rock * 12);
    const rx = mulberry32(seed * 2246822519 ^ 0x7ee);
    // one lumpy shape per chunk, each boulder stretched its own way (own sequence rv, so rr and rx placements are unaffected)
    const shape = this.boulderShapes[((seed * 2654435761) >>> 0) % this.boulderShapes.length];
    const rv = mulberry32(seed * 40503 ^ 0x6b0d1e);
    const im = new THREE.InstancedMesh(shape, this.boulderMat, count + extra);
    const hull = new THREE.InstancedMesh(shape, this.boulderInk, count + extra);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const cols = [];
    const onPlace = (zn) => p.dot(zn.dir) > Math.cos((zn.r * 1.5) / R); // a settlement or plateau there
    let n = 0;
    for (let t = 0; t < count + extra; t++) {
      const g0 = t < count ? rr : rx; // base boulders keep their own sequence
      faceDir(ch.f, ch.cx * CH + g0() * CH, ch.cy * CH + g0() * CH, p);
      let ok = !this.zones.some(onPlace) && !this.flats.some(onPlace);
      if (ok && this.noBoulders) for (const c of this.noBoulders) if (p.dot(c) > this.noBouldersCos) { ok = false; break; } // spots kept bare (trailer)
      const s = 1.2 + Math.pow(g0(), 3) * 7;
      e.set(g0() * 3, g0() * 3, g0() * 3);
      const sx = 0.85 + rv() * 0.35, sy = 0.85 + rv() * 0.35, sz = 0.85 + rv() * 0.35; // drawn for every spot, so a refused one shifts no others
      // not on a road: clear of strip and berm for any size (clearDirs sample the road network, edges included)
      if (ok && this.clearDirs) { const cr = Math.cos((ROAD_KEEP + s) / R); for (const c of this.clearDirs) if (p.dot(c) > cr) { ok = false; break; } }
      // not in or at the edge of a black lake (it'd sink or stand on the surface)
      if (ok) for (const lk of this.lakes) if (p.dot(lk.d) > lk.cos - (s + 6) / R) { ok = false; break; }
      if (!ok) continue;
      p.multiplyScalar(this.surface(p) + s * 0.3);
      q.setFromEuler(e);
      m4.compose(p, q, sc.set(s * sx, s * 0.8 * sy, s * sz));
      im.setMatrixAt(n, m4);
      hull.setMatrixAt(n, m4); // ink: same shell pushed out along normals in its shader (boulders.js)
      // collision sphere: the boulder's RMS radius (unit-RMS shape scaled by sx, 0.8 sy, sz) times BOULDER_COLLIDER_K
      // (0.85 s for an unstretched boulder)
      cols.push({ type: 'sphere', c: p.clone().addScaledVector(p.clone().normalize(), -s * 0.1), r: s * BOULDER_COLLIDER_K * Math.sqrt((sx * sx + 0.64 * sy * sy + sz * sz) / 3) });
      n++;
    }
    im.count = hull.count = n;
    im.castShadow = true;
    im.frustumCulled = hull.frustumCulled = false;
    im.updateMatrix(); hull.updateMatrix();
    im.matrixAutoUpdate = hull.matrixAutoUpdate = false; // static: the shadow cache takes them at once
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
    for (const c of cols) c.rock = true; // Rail Lance stops at these (rockRay)
    ch.boulders = g;
    ch.boulderSpec = cols;
  }

  // Pick crater crests in reach of the camera for the shader's ink line, each drawn per pixel as a circle round its
  // crater (vertex data would follow the triangles and break up where craters overlap).
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
    // measuring a lip takes ~1 ms: a few dozen per frame at most, nearest first (the rest follow, at the far reach)
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

  // LOD for a chunk this far (m) from the eye, or -1 past the limit.
  lodAt(d, limit) {
    if (d >= limit) return -1;
    const dl = d / (this.lodScale || 1); // settings: terrain detail
    return dl < 130 ? 0 : dl < 260 ? 1 : dl < 800 ? 2 : dl < 1700 ? 3 : 4;
  }

  // Per chunk: choose the LOD to show and build missing meshes within a budget. ahead: where the camera will soon be
  // (main.js, from velocity), built before you arrive. budgetMs: main-thread time for meshing finished chunks (or, with
  // no workers, building them); a huge budget builds everything now.
  update(camPos, { budgetMs = 5, maxDist = 3200, ahead = null } = {}) {
    this.updateRimInk(camPos);
    const camLen = camPos.length();
    this.holeU.uCamAlt.value = camLen - this.surface(camPos); // mineral boost grows with height
    const rMin = R - 330, rMax = R + 260;
    const horizon = Math.sqrt(Math.max(0, camLen * camLen - rMin * rMin)) + Math.sqrt(rMax * rMax - rMin * rMin);
    const limit = Math.min(maxDist, horizon);
    const now = performance.now();
    const sync = budgetMs >= 1e8 || !this.workers.length;
    const t0 = performance.now();
    // mesh finished worker chunks (1-2 ms each): gaps first, then coarse (cheap, most screen), then detailed
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
      // build-ahead: detailed LODs where you're heading (never coarser than wanted now)
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
          // meanwhile show the closest available LOD
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
      // boulders drawn for near chunks; colliders only where you can hit them
      const near = want >= 0 && want <= 2;
      if (near && !ch.boulders) this.buildBoulders(ch);
      if (ch.boulders) ch.boulders.visible = near;
      const active = want >= 0 && want <= 1;
      if (active && !ch.boulderCols && this.colliders) ch.boulderCols = ch.boulderSpec.map((c) => this.colliders.add(c));
      if (!active && ch.boulderCols) { for (const c of ch.boulderCols) this.colliders.remove(c); ch.boulderCols = null; }
      // free unneeded detailed meshes, except build-ahead ones (the trailer keeps all: no rebuilds at its cuts)
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
    // gaps (nothing to show) first, then closest
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
    // request what's wanted now, then ahead
    for (const ch of this.queue) {
      // a gap gets a quick coarse LOD first (a few ms), then the detailed one
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
