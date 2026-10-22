import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, ink, inkMat, glow, textSprite, nameTag, setMask, vcMaterial, vcable, paintVertices, dropFloorFaces } from './toon.js';
import { makeDish, makeFigure, makeRover, makeRocket, makeShuttle, makePlanets, makeHoverCar, POWER_DOCK, wingModel, HABITAT_DOCK } from './models.js';
import { mulberry32, clamp } from './rng.js';
import { FACTIONS, defenseSpots, ILMB_WINGS_AT } from './locations.js';
import { bendPoint, bendQuat, unbendPoint } from './curve.js';
import { SUN, frameQuat, arcDist, dirFromAngles, tangent, collectNodes } from './geo.js';
import { buildCasino } from './casinoWorld.js'; // casino
import { Traffic } from './traffic.js';
import { buildHelium, buildMeridian, dressLab, dressLabInside, dressMonolith, buildTown, dressIlmb, dressBase, dressArray, ARRAY_DISHES, buildDen, buildPirateCamp, buildRuin, dressScrap, jobTerminal, part as kitPart, dressCasinoLot, settle, powerBlock, keplerHabitat, ilmbWing } from './settlements.js';
import { makeProp } from './storyAssets.js';
import { buildHomeTown } from './hometown.js';
import { spindleGeometry } from './spindle.js';
import { T as KT, G as KG } from './outpostModels.js';
import { padPlan, padKit, padCols, padToFrame, colToFrame, padStairs } from './landingPad.js';

function mesh(geo, mat, outline = 0.15) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}
// hang obj (a sign sprite) in the place's frame at (x, y, z)
function hang(loc, obj, x, y, z) {
  obj.position.set(x, y, z);
  loc.group.add(obj);
  return obj;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const ACTIVE_DIST = 2600;
// Culling (cheap, per frame): a settlement within ACTIVE_DIST still leaves the scene while a hill or
// the Moon's curve hides it (terrain line of sight to its top); in a drawn one, small static props
// (with ink) are binned into 60 m cells that stop drawing beyond DETAIL_DIST. Hidden via layer mask
// (setMask), so game code toggling .visible never fights it.
const SHOW_NEAR = 300;   // within loc.r + this: always drawn
const DETAIL_DIST = 260; // detail cells beyond this: props off
// Ink outlines (back-face shells, 6-12 cm) go sub-pixel past ~110 m, where the post pass's depth outlines
// carry the silhouette. A place's merged ink is cut into INK_CELL chunks (by triangle, so huge hulls split
// too; small-prop ink is already in small cells), each off beyond INK_DIST.
const INK_CELL = 60;
const INK_DIST = 110;
const FIG_INK_DIST = 50; // resident outline hulls (a few cm) off past this (a skinned hull is a second full body)
let NO_MERGE = false; try { NO_MERGE = localStorage.getItem('mr-nomerge') === '1'; } catch { /* unavailable */ } // (debug: compare with the originals)
const MERGE_CELL = 80;   // merged static geometry chunk grid (keeps frustum culling useful)
const MERGE_BIG = 36;    // pieces wider than this go in the place's one "big" chunk per material
const MERGE_MATS = new Set(['MeshToonMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshStandardMaterial', 'MeshPhongMaterial']);
const _mm = new THREE.Matrix4(), _ms = new THREE.Sphere();
const DETAIL_CELL = 60;
const DETAIL_R = 1.8;    // "small": bounding radius under this (metres)
const _los = new THREE.Vector3(), _lp = new THREE.Vector3();

// Static-geometry batcher: one merged mesh per material plus one merged ink shell, so a compound
// costs a handful of draw calls.
const _bm = new THREE.Matrix4(), _bh = new THREE.Matrix4(), _bt = new THREE.Matrix4();
const _bp = new THREE.Vector3(), _bs = new THREE.Vector3(), _bc = new THREE.Vector3(), _bz = new THREE.Vector3();
const _bq = new THREE.Quaternion(), _be = new THREE.Euler();
// Splits a geometry (made non-indexed) per `cell`-metre grid cell by triangle centre (big triangles stay
// whole). One cell: the geometry itself.
function splitByCell(geo, cell) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position.array, tris = g.attributes.position.count / 3;
  const buckets = new Map();
  for (let t = 0; t < tris; t++) {
    const i = t * 9;
    const key = `${Math.round((pos[i] + pos[i + 3] + pos[i + 6]) / 3 / cell)},${Math.round((pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 / cell)},${Math.round((pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3 / cell)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(t);
  }
  if (buckets.size === 1) return [g];
  const out = [];
  for (const list of buckets.values()) {
    const part = new THREE.BufferGeometry();
    for (const k of Object.keys(g.attributes)) {
      const at = g.attributes[k], s = at.itemSize, arr = new at.array.constructor(list.length * 3 * s);
      for (let j = 0; j < list.length; j++) arr.set(at.array.subarray(list[j] * 3 * s, list[j] * 3 * s + 3 * s), j * 3 * s);
      part.setAttribute(k, new THREE.BufferAttribute(arr, s));
    }
    out.push(part);
  }
  g.dispose();
  return out;
}
function prepGeo(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.clearGroups();
  return g;
}
class Batch {
  constructor() {
    this.byMat = new Map();
    this.ink = [];
    this.base = new THREE.Matrix4();
  }

  // Frame for the following parts (settlement-local x, z, yaw, y).
  at(x = 0, z = 0, yaw = 0, y = 0) {
    this.base.makeRotationY(yaw).setPosition(x, y, z);
    return this;
  }

  add(geo, mat, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, outline = 0.12, order = 'XYZ' } = {}) {
    _bm.compose(_bp.set(x, y, z), _bq.setFromEuler(_be.set(rx, ry, rz, order)), _bs.set(sx, sy, sz)).premultiply(this.base);
    let list = this.byMat.get(mat);
    if (!list) this.byMat.set(mat, (list = []));
    const placed = prepGeo(geo).applyMatrix4(_bm);
    list.push(mat.side === THREE.FrontSide ? dropFloorFaces(placed) : placed); // (only one-sided pieces lose floors: double-sided ones show undersides from above)
    if (outline) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getSize(_bz);
      geo.boundingBox.getCenter(_bc);
      // same inflated-hull rule as toon.ink(), sized in post-scale units
      const kx = 1 + (2 * outline) / Math.max(_bz.x * sx, 0.02), ky = 1 + (2 * outline) / Math.max(_bz.y * sy, 0.02), kz = 1 + (2 * outline) / Math.max(_bz.z * sz, 0.02);
      _bh.makeTranslation(_bc.x, _bc.y, _bc.z).multiply(_bt.makeScale(kx, ky, kz)).multiply(_bt.makeTranslation(-_bc.x, -_bc.y, -_bc.z)).premultiply(_bm);
      this.ink.push(dropFloorFaces(prepGeo(geo).applyMatrix4(_bh)));
    }
    return this;
  }

  build(world, loc) {
    const g = new THREE.Group();
    for (const [mat, list] of this.byMat) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = m.receiveShadow = !mat.transparent;
      if (mat.transparent) m.renderOrder = 2;
      g.add(m);
    }
    if (this.ink.length) {
      const h = new THREE.Mesh(mergeGeometries(this.ink), inkMat);
      h.userData.isInk = true;
      g.add(h);
    }
    for (const list of this.byMat.values()) for (const geo of list) geo.dispose();
    this.byMat.clear();
    this.ink.length = 0;
    world.put(g, loc, 0, 0);
    return g;
  }
}

// Red striped flickering wall round a restricted military zone (buildMilitary; also the Asset Row)
export function zoneWallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xff2a4a) }, alert: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float time; uniform vec3 color; uniform float alert; varying vec2 vUv; varying vec3 vW;
      void main(){ float s = step(0.5, fract((vW.x+vW.z)*0.04 + vW.y*0.04 - time*0.3));
        float fade = (1.0 - vUv.y);
        float a = (0.12 + 0.25*s + alert*0.25) * fade;
        gl_FragColor = vec4(color, a); }`,
  });
}

// One of a place's Kit movers (userData spin / blink / flag, or a tick function) at time t (the Asset Row's too)
export function stepMover(o, dt, t, seed) {
  const u = o.userData;
  if (u.tick) u.tick(o, dt, t);
  else if (u.spin) o.rotation.y += dt * (u.spin === true ? 0.6 : u.spin);
  else if (u.blink) o.visible = Math.sin(t * 4 + seed) > -0.3;
  else if (u.flag) o.rotation.y = Math.sin(t * 2 + seed) * 0.25;
}

// the black lakes' rippling surface (buildLakes; the Asset Row's lake too)
export const lakeMaterial = () => new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0;
          float ripple = sin(r * 40.0 - time * 1.5) * 0.5 + 0.5;
          float glint = smoothstep(0.92, 1.0, ripple) * (1.0 - r) * 0.35;
          float rim = smoothstep(0.86, 0.98, r);
          vec3 col = vec3(0.03, 0.02, 0.06) + vec3(0.35, 0.22, 0.6) * glint + vec3(0.25, 0.15, 0.45) * rim;
          gl_FragColor = vec4(col, 1.0); }`,
});

// Builds everything on the Moon. Each settlement has its own local frame (Y = local up, XZ = its
// plateau) and is in the scene only while the camera is near enough to see it.
export class World {
  constructor(scene, planet, colliders, locations) {
    this.scene = scene;
    this.planet = planet;
    this.colliders = colliders;
    this.locations = locations;
    this.spinners = [];
    this.blinkers = [];
    this.dishes = [];
    this.figures = [];
    this.vehicles = [];
    this.crawlers = [];
    this.zoneWalls = [];
    this.walkers = []; // foot traffic inside the ILMB skywalks
    this.anims = []; // moving parts of kit-built settlements (settlements.js): { loc, list, seed }
    this.rides = []; // rideable fairground rides (rides.js; Chimera Downs' ferris wheel and carousel are in settlements.js): { loc, name, seats: [{ obj, local, face }], camDist, exitDir(p, out) }
    this._mats = new Map();
    this.rand = mulberry32(42);

    this.buildSky();
    for (const loc of locations) this.buildLocation(loc);
    this.buildLakes();
    this.buildCrystals();
    this.buildTraffic(); // after the lakes: roads steer around them
    for (const loc of locations) this.prepCulling(loc);
    this.mergeAllIdle(); // (merge static geometry per place in idle time)
  }

  // A settlement's height (line-of-sight test) and small props (detail culling).
  prepCulling(loc) {
    const G = loc.group;
    G.updateMatrixWorld(true);
    const base = loc.pos.length();
    let top = 20;
    const seen = new Set();
    loc.detail = [];
    const cells = new Map();
    G.traverse((o) => {
      if (!o.geometry || seen.has(o)) return;
      const gg = o.geometry;
      if (!gg.boundingSphere) gg.computeBoundingSphere();
      if (!gg.boundingSphere || !isFinite(gg.boundingSphere.radius)) return;
      const r = gg.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
      _lp.copy(gg.boundingSphere.center).applyMatrix4(o.matrixWorld);
      if (r < 400) top = Math.max(top, _lp.length() + r - base);
      // (frozen static props only: anything moved, animated or reparented stays out)
      if (o.isMesh && !o.isInstancedMesh && !o.matrixAutoUpdate && (o.userData.mergedDetail || (!(o.userData && o.userData.isInk) && r < DETAIL_R))) {
        const key = `${Math.round(_lp.x / DETAIL_CELL)},${Math.round(_lp.y / DETAIL_CELL)},${Math.round(_lp.z / DETAIL_CELL)}`;
        if (!cells.has(key)) cells.set(key, { c: new THREE.Vector3(), n: 0, objs: [], on: true });
        const cell = cells.get(key);
        cell.c.add(_lp);
        cell.n++;
        o.traverse((c) => { if (!seen.has(c)) { seen.add(c); loc.detail.push(c); cell.objs.push(c); } });
      }
    });
    loc.cells = [...cells.values()];
    for (const c of loc.cells) c.c.divideScalar(c.n);
    loc.topH = Math.min(top, 400);
    loc.shown = false; // (joins the scene on the first in-range update)
    loc.occluded = false;
  }

  // ---- static merging ----
  // Folds every piece of a place that never moves, hides or changes into a few meshes: one per material
  // per chunk (MERGE_CELL grid; small props in their own chunks so detail culling still drops them), ink
  // merged the same way: hundreds of draw calls down to a few dozen. Left alone: anything animated or
  // moved (spinners, dishes, figures, walkers, rides, tick/spin/blink/flag parts, dynamic puts), anything
  // hidden or swapped later (keep-marked story props, named objects, sprites), transparent and textured-
  // shader materials, and meshes with an unmergeable child. Colliders untouched. Once per place: idle time
  // after boot, or on first draw; a rebuilt place merges again.
  mergeLocation(loc) {
    if (loc.merged) return;
    loc.merged = true;
    if (NO_MERGE) return;
    const G = loc.group;
    // (turn culled detail cells back on first, so nothing merges with its mask off)
    if (loc.cells) for (const c of loc.cells) if (!c.on) { c.on = true; setMask(c.objs, true); }
    G.updateMatrixWorld(true);
    loc.inkChunks = [];
    const inv = new THREE.Matrix4().copy(G.matrixWorld).invert();
    const skip = new Set();
    const mark = (o) => { if (o && o.traverse) o.traverse((c) => skip.add(c)); };
    for (const s of this.spinners) if (s.loc === loc) mark(s.obj);
    for (const d of this.dishes) if (d.loc === loc) mark(d.yaw);
    for (const a of this.anims) if (a.loc === loc) a.list.forEach(mark);
    for (const k of ['figures', 'walkers', 'rides']) for (const f of this[k]) if (f.loc === loc) mark(f.root);
    const flagged = (o) => { const u = o.userData; return u.keep || u.tick || u.spin || u.blink || u.flag || u.noMerge || u.inkGeo; };
    const ok = (o) => {
      if (o.isSprite || o.isInstancedMesh || o.isSkinnedMesh || o.isPoints || o.isLine || !o.visible || o.name || skip.has(o) || flagged(o)) return false;
      if (!o.isMesh) return true;
      const m = o.material;
      if (!m || Array.isArray(m) || m.transparent || !(MERGE_MATS.has(m.type) || m === inkMat) || o.layers.mask !== 1) return false;
      const a = o.geometry && o.geometry.attributes;
      if (!a || !a.position || (m.map && !a.uv) || (m.vertexColors && !a.color) || o.geometry.morphAttributes.position) return false;
      return true;
    };
    // a mesh merges if it and every ancestor up to the place is fixed (frozen by world.put, or a kit
    // mesh under its never-moving root)
    const take = [];
    const walk = (o, fixed) => {
      for (const c of o.children) {
        const cf = fixed && ok(c) && (!c.matrixAutoUpdate || c.userData.kitRoot || c.userData.kitMesh);
        walk(c, cf);
        if (cf && c.isMesh) take.push(c);
      }
    };
    walk(G, true);
    // a mesh with a staying child stays too (the child hangs off it)
    const taking = new Set(take);
    const stays = (o) => o.children.some((c) => !taking.has(c) || stays(c));
    for (let i = take.length - 1; i >= 0; i--) if (stays(take[i])) { taking.delete(take[i]); }
    // (a parent kept for its child keeps its ink child too)
    for (const m of [...taking]) if (m.parent && m.parent.isMesh && !taking.has(m.parent)) taking.delete(m);
    const groups = new Map();
    for (const o of taking) {
      const geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      _mm.multiplyMatrices(inv, o.matrixWorld);
      _ms.copy(geo.boundingSphere).applyMatrix4(_mm);
      const ink = o.material === inkMat;
      // (ink hulls go with what they outline: size by parent)
      const size = ink && o.parent && o.parent.isMesh && o.parent.geometry.boundingSphere ? o.parent.geometry.boundingSphere.radius * o.parent.matrixWorld.getMaxScaleOnAxis() : _ms.radius;
      const small = size < DETAIL_R;
      const big = !small && size > MERGE_BIG;
      const cs = small ? DETAIL_CELL : MERGE_CELL;
      const cell = big ? 'big' : `${Math.round(_ms.center.x / cs)},${Math.round(_ms.center.y / cs)},${Math.round(_ms.center.z / cs)}`;
      // shared plain colours (most) join one vertex-coloured mesh per kind; others (animated, textured,
      // one-off) merge only with their own material
      const mt = o.material;
      const vc = vcable(mt);
      const mk = vc ? `m${vcMaterial(mt).id}` : `m${mt.id}`; // (joins the kits' vertex-coloured meshes)
      const key = `${mk}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${small ? 's' : 'n'}|${cell}`;
      let gr = groups.get(key);
      if (!gr) groups.set(key, (gr = { mat: vc ? vcMaterial(mt) : mt, vc, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, small, list: [], objs: [] }));
      gr.objs.push(o);
      const keepUv = !!o.material.map, keepCol = !!o.material.vertexColors && !vc;
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const k of Object.keys(g.attributes)) if (!(k === 'position' || k === 'normal' || (k === 'uv' && keepUv) || (k === 'color' && keepCol))) g.deleteAttribute(k);
      g.morphAttributes = {};
      g.clearGroups();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (vc) paintVertices(g, mt.color);
      gr.list.push(g.applyMatrix4(_mm));
    }
    // swap merged chunks in, originals out
    const root = new THREE.Group();
    root.name = 'merged';
    for (const gr of groups.values()) {
      if (!gr.list.length) continue;
      const geo = gr.list.length === 1 ? gr.list[0] : mergeGeometries(gr.list);
      if (!geo) continue; // (incompatible pieces stay in place)
      if (gr.list.length > 1) for (const g of gr.list) g.dispose();
      // (detail chunks are already in small cells; other ink is cut up here)
      const parts = gr.mat === inkMat && !gr.small ? splitByCell(geo, INK_CELL) : [geo];
      for (const pg of parts) {
        const m = new THREE.Mesh(pg, gr.mat);
        m.castShadow = gr.cast; m.receiveShadow = gr.recv; m.renderOrder = gr.order;
        if (gr.mat === inkMat) { m.userData.isInk = true; m.castShadow = m.receiveShadow = false; }
        if (gr.small) m.userData.mergedDetail = true;
        m.matrixAutoUpdate = false;
        root.add(m);
        if (gr.mat === inkMat) loc.inkChunks.push({ m, c: new THREE.Vector3(), r: 0, on: true });
      }
      gr.done = true;
    }
    // remove only what was merged
    for (const gr of groups.values()) if (gr.done) for (const o of gr.objs) if (o.parent && !(o.parent.isMesh && !taking.has(o.parent))) o.parent.remove(o);
    root.matrixAutoUpdate = false;
    G.add(root);
    root.updateMatrixWorld(true);
    for (const ch of loc.inkChunks) { // (world bounding sphere per chunk, for the distance switch)
      ch.m.geometry.computeBoundingSphere();
      ch.c.copy(ch.m.geometry.boundingSphere.center).applyMatrix4(root.matrixWorld);
      ch.r = ch.m.geometry.boundingSphere.radius;
    }
    this.prepCulling(loc);
  }

  // Merge whatever idle time missed (main.js, first frame of play, so no merge lands mid-run).
  finishMerges() { this.mergeDone = true; for (const l of this.locations) if (!l.merged) this.mergeLocation(l); }

  // Merge places one at a time in idle time while the title screen is up.
  mergeAllIdle() {
    const queue = this.locations.filter((l) => !l.merged);
    const later = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 30));
    const run = (dl) => {
      const t0 = performance.now();
      while (queue.length && (performance.now() - t0 < 12 || (dl && dl.didTimeout))) {
        const l = queue.shift();
        if (!l.merged) this.mergeLocation(l);
        if (dl && dl.didTimeout) break;
        if (this.mergeDone) return;
      }
      if (queue.length) later(run);
    };
    later(run);
  }

  // Terrain-only line of sight from the camera to p raised by `lift` (dipping a few metres underground
  // blocks it; ridges thinner than a sample step slip through, erring toward drawing).
  lineOfSight(cam, p, lift = 0) {
    _los.copy(p).normalize().multiplyScalar(p.length() + lift);
    const steps = clamp(Math.ceil(cam.distanceTo(_los) / 50), 8, 40);
    for (let i = 1; i < steps; i++) {
      _lp.lerpVectors(cam, _los, i / steps);
      if (this.planet.altitude(_lp) < -3) return false;
    }
    return true;
  }

  r() { return this.rand(); }

  // Shared materials for batched geometry (batches merge per material object).
  glowM(color) {
    const k = 'g' + color;
    if (!this._mats.has(k)) { const m = glow(color); m.userData.shared = true; this._mats.set(k, m); }
    return this._mats.get(k);
  }

  glassM(color, opacity = 0.2) {
    const k = `x${color}/${opacity}`;
    if (!this._mats.has(k)) this._mats.set(k, new THREE.MeshToonMaterial({ color, gradientMap: toon(0).gradientMap, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    return this._mats.get(k);
  }

  buildSky() {
    const sky = new THREE.Group();
    this.sky = sky;
    const N = 3000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(th) * 7000;
      pos[i * 3 + 1] = u * 7000;
      pos[i * 3 + 2] = s * Math.sin(th) * 7000;
      col[i * 3] = 0.8 + Math.random() * 0.2; col[i * 3 + 1] = 0.8 + Math.random() * 0.2; col[i * 3 + 2] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true })));

    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1f6fff'; ctx.fillRect(0, 0, 512, 256);
    const rr = mulberry32(7);
    ctx.fillStyle = '#3ad15a';
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.ellipse(rr() * 512, 40 + rr() * 176, 20 + rr() * 60, 12 + rr() * 34, rr() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.ellipse(rr() * 512, rr() * 256, 10 + rr() * 50, 3 + rr() * 8, rr() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(0, 0, 512, 14); ctx.fillRect(0, 242, 512, 14);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Earth hangs over the near side, never visible from the dark side
    this.earthDir = dirFromAngles(14, 200);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(420, 40, 24), new THREE.MeshBasicMaterial({ map: tex }));
    earth.position.copy(this.earthDir).multiplyScalar(6000);
    const hull = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide }));
    hull.scale.setScalar(1.035);
    earth.add(hull);
    const atmo = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.25, side: THREE.BackSide }));
    atmo.scale.setScalar(1.08);
    earth.add(atmo);
    this.earth = earth;
    sky.add(earth);

    const sun = new THREE.Mesh(new THREE.CircleGeometry(160, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    sun.position.copy(SUN).multiplyScalar(6200);
    sun.lookAt(0, 0, 0);
    sky.add(sun);
    sky.add(makePlanets(SUN)); // (Venus, Mars, Jupiter, Saturn: small, far, along the ecliptic)
    const burst = new THREE.Mesh(new THREE.RingGeometry(170, 260, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5 }));
    burst.position.copy(sun.position);
    burst.lookAt(0, 0, 0);
    sky.add(burst);
    // the Spindle: a long asteroid high over the Monolith (Meridian's finale goes there), rolling on its
    // long axis. Once Meridian has its core, a station blinks on it.
    const mono = this.locations.find((l) => l.id === 'monolith');
    if (mono) {
      const sp = new THREE.Group();
      // (always sunlit up there, even over the night side: a little self-light)
      const rock = new THREE.Mesh(spindleGeometry(2000, 260, 3), new THREE.MeshToonMaterial({ color: 0x9a92ac, emissive: 0x3a3450, gradientMap: toon(0).gradientMap }));
      ink(rock, 6);
      sp.add(rock);
      sp.position.copy(mono.dir).multiplyScalar(5200);
      // long axis across the sky, square to the Monolith's up
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent(new THREE.Vector3(0, 0, 1), mono.dir).normalize());
      if (FACTIONS.meridian.quantum) { const b = new THREE.Mesh(new THREE.SphereGeometry(18, 8, 6), glow(0x2ec4ff)); b.position.set(150, 500, 0); rock.add(b); }
      sky.add(sp);
      this.spindle = rock;
    }
    this.scene.add(sky);
  }

  // ---------- local-frame helpers ----------
  frame(loc) {
    const g = new THREE.Group();
    // local +Z points sunward along the surface (consistent lighting per layout)
    frameQuat(loc.dir, SUN, g.quaternion);
    g.position.copy(loc.dir).multiplyScalar(loc.zr);
    g.updateMatrixWorld(true);
    loc.group = g;
    loc.pos = g.position.clone();
    loc.active = false;
    return g;
  }

  // Bend radius of a curved place (locations.js `curved`: the Downs), 0 if flat. Builders and callers work in flat local
  // coordinates; toWorld, put and colliders bend them onto the sphere (curve.js), and the Kit bends what it bakes.
  curveR(loc) { return loc.curved && loc.zr > 1000 ? loc.zr : 0; }

  toWorld(loc, x, y, z, out = new THREE.Vector3()) {
    const R = this.curveR(loc);
    if (R) bendPoint(R, x, y, z, out); else out.set(x, y, z);
    return loc.group.localToWorld(out);
  }

  col(loc, spec) {
    const c = this.colAdd(loc, spec);
    if (spec.stick) c.stick = true; // (landing pad deck and stairs: physics keeps walkers on them)
    (loc._cols ||= []).push(c); // (so a rebuild can remove them)
    return c;
  }

  colAdd(loc, spec) {
    const g = loc.group, R = this.curveR(loc);
    // (curved place: turn standing the flat frame at the collider on the sphere; else none)
    const bq = R ? bendQuat(R, spec.x, spec.z, new THREE.Quaternion()) : null;
    if (spec.type === 'sphere') {
      return this.colliders.add({ type: 'sphere', c: this.toWorld(loc, spec.x, spec.y, spec.z), r: spec.r });
    }
    if (spec.type === 'cyl') {
      const axis = loc.dir.clone();
      if (bq) axis.set(0, 1, 0).applyQuaternion(bq).applyQuaternion(g.quaternion);
      return this.colliders.add({ type: 'cyl', c: this.toWorld(loc, spec.x, 0, spec.z), axis, y0: spec.y0, y1: spec.y1, r: spec.r });
    }
    if (spec.type === 'hcyl') {
      // horizontal cylinder (axis local (sin yaw, 0, cos yaw)), so arched roofs collide round
      const axis = new THREE.Vector3(Math.sin(spec.yaw || 0), 0, Math.cos(spec.yaw || 0));
      if (bq) axis.applyQuaternion(bq);
      axis.applyQuaternion(g.quaternion);
      return this.colliders.add({ type: 'cyl', c: this.toWorld(loc, spec.x, spec.y, spec.z), axis, y0: -spec.len / 2, y1: spec.len / 2, r: spec.r, caps: true });
    }
    // yaw, then optional pitch about the box's x (ramps and bowl walls tilt their top face)
    _q.setFromEuler(_e.set(spec.pitch || 0, spec.yaw || 0, spec.roll || 0, 'YXZ'));
    if (bq) _q.premultiply(bq);
    _q.premultiply(g.quaternion);
    return this.colliders.add({
      type: 'box', c: this.toWorld(loc, spec.x, spec.y, spec.z),
      ax: new THREE.Vector3(1, 0, 0).applyQuaternion(_q), ay: new THREE.Vector3(0, 1, 0).applyQuaternion(_q), az: new THREE.Vector3(0, 0, 1).applyQuaternion(_q),
      hx: spec.hx, hy: spec.hy, hz: spec.hz,
    });
  }

  // A field dish (models.makeDish), put frozen, turning and nodding at `speed`: only its head moves, so tower, pad and
  // equipment room merge with the place (mergeLocation) and stay in the shadow cache.
  addDish(dish, speed, loc) {
    dish.yaw.traverse((o) => { o.matrixAutoUpdate = true; });
    this.dishes.push({ ...dish, speed, loc });
  }

  // Place object in a settlement's local frame. Static objects get frozen matrices.
  put(obj, loc, dx, dz, dy = 0, yaw = 0, dynamic = false) {
    const R = this.curveR(loc);
    if (R) { // (curved place: stood on the sphere, turned with it)
      bendPoint(R, dx, dy, dz, obj.position);
      obj.quaternion.setFromAxisAngle(_up, yaw).premultiply(bendQuat(R, dx, dz, _q));
    } else {
      obj.position.set(dx, dy, dz);
      obj.rotation.y = yaw;
    }
    loc.group.add(obj);
    if (!dynamic) {
      obj.updateMatrix();
      obj.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    }
    return obj;
  }

  // Fortress wall segment (local x along the wall, +z = outside): battered plinth, outer buttresses and
  // crenellations, capped walkway, panel seams, inner light strip, outer wall lamps. One box collider.
  wallB(B, loc, dx, dz, len, h, t, color, yaw, trim) {
    B.at(dx, dz, yaw);
    const dark = toon(0x3a3550), seam = toon(0x46415c);
    B.add(new THREE.BoxGeometry(len, h, t), toon(color), 0, h / 2, 0, { outline: 0.2 });
    B.add(new THREE.BoxGeometry(len, 1.8, t + 1.6), toon(0x4a4660), 0, 0.9, 0.3, { outline: 0.1 });
    B.add(new THREE.BoxGeometry(len + 0.2, 0.25, t + 1.7), toon(trim), 0, 1.85, 0.3, { outline: 0 });
    for (let x = -len / 2 + 3.5; x < len / 2 - 1; x += 7) B.add(new THREE.BoxGeometry(1.4, h * 0.82, 1.2), toon(0x4a4660), x, h * 0.41, t / 2 + 0.6, { rx: -0.08, outline: 0.06 });
    for (let x = -len / 2 + 1.75; x < len / 2; x += 3.5) for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(0.12, h * 0.8, 0.12), seam, x, h * 0.5, sz * (t / 2 + 0.03), { outline: 0 });
    B.add(new THREE.BoxGeometry(len * 1.01, 0.5, t + 0.9), toon(trim), 0, h + 0.25, 0, { outline: 0.1 });
    B.add(new THREE.BoxGeometry(len, 0.15, t - 0.6), dark, 0, h + 0.55, -0.2, { outline: 0 });
    const n = Math.max(2, Math.round(len / 2.6));
    for (let i = 0; i < n; i++) B.add(new THREE.BoxGeometry((len / n) * 0.55, 1.3, 0.8), toon(color), -len / 2 + (len / n) * (i + 0.5), h + 1.15, t / 2 + 0.05, { outline: 0.05 });
    B.add(new THREE.BoxGeometry(len * 0.96, 0.35, 0.1), this.glowM(0xfff6a8), 0, h * 0.65, -t / 2 - 0.06, { outline: 0 });
    for (let x = -len / 2 + 7; x < len / 2 - 3; x += 14) {
      B.add(new THREE.BoxGeometry(0.8, 0.5, 0.5), dark, x, h * 0.72, t / 2 + 0.3, { outline: 0.02 });
      B.add(new THREE.BoxGeometry(0.6, 0.15, 0.3), this.glowM(0xff2a4a), x, h * 0.72 - 0.3, t / 2 + 0.45, { outline: 0 });
    }
    // (reaches the outer buttresses and plinth, so the outside is one flat face)
    const ox = Math.sin(yaw) * 0.5, oz = Math.cos(yaw) * 0.5;
    this.col(loc, { type: 'box', x: dx + ox, y: h / 2 + 0.3, z: dz + oz, hx: len / 2 + 0.2, hy: h / 2 + 0.3, hz: t / 2 + 0.7, yaw });
  }

  // Gate tower: tapered keep with bands, slit windows, crenellated top, emblem panel facing out (+z).
  // One box collider.
  gateTowerB(B, loc, dx, dz, w, h, color, yaw, trim) {
    B.at(dx, dz, yaw);
    const half = w / 2;
    B.add(new THREE.CylinderGeometry(half * 0.82 * Math.SQRT2, half * 1.05 * Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4), toon(color), 0, h / 2, 0, { outline: 0.2 });
    B.add(new THREE.BoxGeometry(w * 1.12, 1.6, w * 1.12), toon(0x4a4660), 0, 0.8, 0, { outline: 0.1 });
    for (const y of [h * 0.35, h * 0.7]) B.add(new THREE.BoxGeometry(w * (1.02 - (y / h) * 0.2), 0.5, w * (1.02 - (y / h) * 0.2)), toon(trim), 0, y, 0, { outline: 0 });
    for (const [sx, sz, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2]]) {
      for (const y of [h * 0.5, h * 0.82]) {
        const r = half * (1.05 - (y / h) * 0.23) + 0.05;
        B.add(new THREE.BoxGeometry(0.5, 1.4, 0.12), this.glowM(0xfff6a8), sx * r, y, sz * r, { ry, outline: 0 });
      }
    }
    B.add(new THREE.BoxGeometry(w * 0.9, 0.6, w * 0.9), toon(trim), 0, h + 0.3, 0, { outline: 0.08 });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const a = (i * Math.PI) / 2;
      const ex = Math.sin(a) * half * 0.8 + Math.cos(a) * s * half * 0.45, ez = Math.cos(a) * half * 0.8 - Math.sin(a) * s * half * 0.45;
      B.add(new THREE.BoxGeometry(1.2, 1.2, 1.2), toon(color), ex, h + 1.2, ez, { outline: 0.05 });
    }
    B.add(new THREE.BoxGeometry(w * 0.5, w * 0.5, 0.3), toon(0x2a2540), 0, h * 0.58, half * 0.93 + 0.1, { rx: -0.03, outline: 0.04 });
    B.add(new THREE.TorusGeometry(w * 0.16, 0.18, 4, 16), this.glowM(color === 0xffd23f ? 0x2ee6ff : 0xffd23f), 0, h * 0.58, half * 0.93 + 0.3, { outline: 0 });
    this.col(loc, { type: 'box', x: dx, y: h / 2 + 0.3, z: dz, hx: w / 2 + 0.2, hy: h / 2 + 0.3, hz: w / 2 + 0.2, yaw });
  }

  // Turret mount for enemies.setupBase: settlement-local turret base position. `ground` mounts snap
  // to the terrain instead (outside the plateau).
  mount(loc, x, z, y, extra = {}) {
    (loc.turretMounts ||= []).push({ x, z, y, ...extra });
  }

  // Wall bastion: squat octagonal tower set slightly outward in the perimeter wall, with a gun pedestal
  // so the muzzle clears the parapet, firing out and back into the compound with a tiny dead zone.
  bastion(B, loc, a, R, { r, h, out, ped, tx = r * 0.45, color = 0x4a4660, trim = 0xffd23f, beacon = null, heavy = false }) {
    const x = Math.cos(a) * (R + out), z = Math.sin(a) * (R + out);
    const deck = h + 1.1;
    B.at(x, z, -a);
    B.add(new THREE.CylinderGeometry(r, r * 1.12, h, 8), toon(color), 0, h / 2, 0, { outline: 0.2 });
    B.add(new THREE.CylinderGeometry(r * 1.2, r * 1.32, 1.8, 8), toon(0x3a3550), 0, 0.9, 0, { outline: 0.1 });
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2, rr = r * 1.06;
      B.add(new THREE.BoxGeometry(0.7, h * 0.85, 0.7), toon(0x5b5870), Math.cos(t) * rr, h * 0.45, Math.sin(t) * rr, { ry: -t, rz: 0, outline: 0.04 });
      const ts = t + Math.PI / 8;
      B.add(new THREE.BoxGeometry(0.4, 1.6, 0.12), this.glowM(0xfff6a8), Math.cos(ts) * r * 1.0, h * 0.8, Math.sin(ts) * r * 1.0, { ry: -ts + Math.PI / 2, outline: 0 });
    }
    B.add(new THREE.CylinderGeometry(r * 1.1, r * 0.98, 1.1, 8), toon(trim), 0, h + 0.55, 0, { outline: 0.1 });
    B.add(new THREE.CylinderGeometry(r * 1.07, r * 1.1, 0.5, 8, 1, true), this.glowM(0xff2a4a), 0, h * 0.62, 0, { outline: 0 });
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2 + Math.PI / 8;
      B.add(new THREE.BoxGeometry(1.1, 1.0, r * 0.55), toon(color), Math.cos(t) * r * 0.98, deck + 0.5, Math.sin(t) * r * 0.98, { ry: -t + Math.PI / 2, outline: 0.06 });
    }
    // gun on the outer half, a few metres proud of the wall, so it sees along the outer face to the
    // next bastion
    B.add(new THREE.CylinderGeometry(heavy ? 1.7 : 1.3, heavy ? 2.3 : 1.8, ped, 10), toon(0x3a3550), tx, deck + ped / 2, 0, { outline: 0.08 });
    B.add(new THREE.TorusGeometry(heavy ? 2.4 : 1.9, 0.18, 6, 16), this.glowM(0xffd23f), tx, deck + 0.15, 0, { rx: Math.PI / 2, outline: 0 });
    B.add(new THREE.CylinderGeometry(heavy ? 2.0 : 1.6, heavy ? 2.0 : 1.6, 0.4, 10), toon(trim), tx, deck + ped - 0.2, 0, { outline: 0.04 });
    if (beacon) {
      B.add(new THREE.CylinderGeometry(0.15, 0.15, 4, 6), toon(0x3a3550), -r * 0.7, deck + 2, 0, { outline: 0.04 });
      B.add(new THREE.SphereGeometry(0.7, 10, 8), beacon, -r * 0.7, deck + 4.4, 0, { outline: 0 });
    }
    this.col(loc, { type: 'cyl', x, z, y0: -2, y1: deck, r: r * 1.12 + 0.1 });
    const mx = x + Math.cos(a) * tx, mz = z + Math.sin(a) * tx;
    this.col(loc, { type: 'cyl', x: mx, z: mz, y0: deck - 0.5, y1: deck + ped, r: heavy ? 2.3 : 1.8 });
    this.mount(loc, mx, mz, deck + ped, { wall: true });
  }

  // Free-standing settlements: each turret on a short pylon so roofs and domes don't hide it. Spots on
  // a building or pad are nudged along the ring.
  defensePylons(loc, spots, h = 6) {
    const C = this.colliders, n = new THREE.Vector3(), p = new THREE.Vector3(), near = [];
    const free = (x, z) => {
      for (const k of [...(loc.pads || []), ...(loc.keep || [])]) if (Math.hypot(x - k.x, z - k.z) < k.r + 5) return false;
      for (const y of [1.5, h * 0.5, h + 2, h + 5]) {
        this.toWorld(loc, x, y, z, p);
        for (const c of C.query(p, 4, near)) if (C.contact(c, p, 3.6, n) > 0) return false;
      }
      return true;
    };
    for (const [a0, r0] of spots) {
      let x = Math.cos(a0) * r0, z = Math.sin(a0) * r0;
      search: for (const dr of [0, -8, 8, -16]) {
        for (let k = 0; k <= 12; k++) {
          const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
          const tx = Math.cos(a) * (r0 + dr), tz = Math.sin(a) * (r0 + dr);
          if (free(tx, tz)) { x = tx; z = tz; break search; }
        }
      }
      // armoured pylon: octagonal column with bands and ladder, railed deck, faction ring
      const fcol = new THREE.Color(FACTIONS[loc.faction].color).getHex();
      const B = new Batch();
      B.at(x, z, Math.atan2(-x, -z));
      B.add(new THREE.CylinderGeometry(2.4, 2.9, 0.9, 8), toon(0x3a3550), 0, 0.45, 0, { outline: 0.08 });
      B.add(new THREE.CylinderGeometry(0.95, 1.35, h, 8), toon(0x5b5870), 0, h / 2, 0, { outline: 0.1 });
      for (const y of [h * 0.3, h * 0.62]) B.add(new THREE.CylinderGeometry(1.25 - y * 0.03, 1.3 - y * 0.03, 0.35, 8), toon(fcol), 0, y, 0, { outline: 0 });
      for (const sx of [-0.35, 0.35]) B.add(new THREE.BoxGeometry(0.08, h - 1, 0.08), toon(0x1d1a29), sx, h / 2, 1.35, { outline: 0 });
      for (let y = 1.2; y < h - 0.8; y += 0.8) B.add(new THREE.BoxGeometry(0.75, 0.06, 0.06), toon(0x1d1a29), 0, y, 1.35, { outline: 0 });
      B.add(new THREE.CylinderGeometry(2.7, 2.1, 0.7, 10), toon(0x3a3550), 0, h - 0.35, 0, { outline: 0.08 });
      for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; B.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), toon(0x55607a), Math.cos(t) * 2.55, h + 0.45, Math.sin(t) * 2.55, { outline: 0 }); }
      B.add(new THREE.TorusGeometry(2.55, 0.08, 4, 20).rotateX(Math.PI / 2), toon(fcol), 0, h + 0.9, 0, { outline: 0 });
      B.add(new THREE.TorusGeometry(2.7, 0.14, 6, 16).rotateX(Math.PI / 2), this.glowM(fcol), 0, h - 0.35, 0, { outline: 0 });
      B.build(this, loc);
      this.col(loc, { type: 'cyl', x, z, y0: -2, y1: h, r: 1.4 });
      this.mount(loc, x, z, h);
    }
  }

  tower(loc, dx, dz, h, r, color, beacon = 0xff2e88) {
    const g = new THREE.Group();
    const t = mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 10), toon(color), 0.15);
    t.position.y = h / 2;
    g.add(t);
    const mat = new THREE.MeshBasicMaterial({ color: beacon });
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 10, 8), mat);
    b.position.y = h + r * 0.5;
    g.add(b);
    this.blinkers.push({ mat, base: new THREE.Color(beacon), phase: this.r() * 6, loc });
    this.put(g, loc, dx, dz);
    this.col(loc, { type: 'cyl', x: dx, z: dz, y0: -2, y1: h, r: r + 0.2 });
    return g;
  }

  // Shuttle / freighter landing pad (landingPad.js): raised railed deck, stairs down on the side facing `opts.face` (angle in
  // the settlement's x-z plane, as Math.atan2(z, x); default toward the middle, and traffic.js turns it to the nearest road
  // once the roads are down: faceSettlementPads). spare: kept only if transit uses it
  // (traffic.js dropSparePads). opts.r is not needed; opts.flat: a flat ground disc (the ILMB rocket pad, no shuttles).
  // Returns the loc.pads record ({ x, z, r, top, stairs, mesh, cols, keep }), or null for a previously dropped spare.
  pad(loc, dx, dz, r, color = 0xffd23f, spare = false, opts = {}) {
    if (spare && (loc.droppedPads || []).some((p) => Math.hypot(p.x - dx, p.z - dz) < 1)) return null;
    if (opts.flat) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.5, 32), toon(0x4a4660), 0.08));
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.65, r * 0.8, 32), toon(color));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.27;
      g.add(ring);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.15, r * 0.9), toon(color));
      bar.rotation.x = -Math.PI / 2;
      bar.position.y = 0.28;
      g.add(bar);
      this.put(g, loc, dx, dz, 0);
      const rec = { x: dx, z: dz, r, spare, mesh: g, top: 0.27, cols: [], keep: null, flat: true };
      (loc.pads ||= []).push(rec);
      return rec;
    }
    const face = opts.face ?? Math.atan2(-dz, -dx);
    const yaw = Math.PI / 2 - face; // (stairs run along pad +z, which yaw turns to (sin yaw, cos yaw))
    const ground = opts.ground || ((x, z) => {
      if (!this.planet) return 0;
      const p = padToFrame(dx, dz, yaw, x, z);
      const v = this.toWorld(loc, p.x, 0, p.z, new THREE.Vector3());
      this.planet.ground(v, v);
      return loc.group.worldToLocal(v).y;
    });
    const plan = padPlan(r, ground, opts.top ?? null);
    const g = kitPart(color, (k) => padKit(k, plan, color));
    this.put(g, loc, dx, dz, 0, yaw);
    const cols = padCols(plan).map((c) => this.col(loc, colToFrame(dx, dz, yaw, c)));
    // keep the flight's footprint and foot clear too (roads, other pads, shelters)
    const sm = padToFrame(dx, dz, yaw, 0, r + plan.stairs.run * 0.6), keep = { x: sm.x, z: sm.z, r: plan.stairs.run * 0.6 + 2.5 };
    (loc.keep ||= []).push(keep);
    const rec = { x: dx, z: dz, r, color, spare, mesh: g, top: plan.top, cols, keep, yaw, stairs: padStairs(dx, dz, yaw, plan) };
    (loc.pads ||= []).push(rec); // traffic reuses / avoids these
    return rec;
  }

  // remove a pad with its colliders and kept ground: an unused spare, or one a bigger pad replaces
  dropPad(loc, rec) {
    if (rec.mesh) rec.mesh.removeFromParent();
    for (const c of rec.cols || []) {
      this.colliders.remove(c);
      if (loc._cols) { const i = loc._cols.indexOf(c); if (i >= 0) loc._cols.splice(i, 1); }
    }
    if (rec.keep && loc.keep) loc.keep = loc.keep.filter((k) => k !== rec.keep);
    if (loc.pads) loc.pads = loc.pads.filter((p) => p !== rec);
  }

  flag(loc, dx, dz, colors, h = 14) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.15, 0.15, h), toon(0xe0e0e0), 0.05);
    pole.position.y = h / 2;
    g.add(pole);
    const rod = mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2).rotateZ(Math.PI / 2), toon(0xe0e0e0), 0);
    rod.position.set(2.1, h - 0.1, 0);
    g.add(rod);
    colors.forEach((c, i) => {
      const s = mesh(new THREE.BoxGeometry(4, 2.6 / colors.length, 0.06), toon(c), 0.03);
      s.position.set(2.1, h - 0.3 - (i + 0.5) * (2.6 / colors.length), 0);
      g.add(s);
    });
    this.put(g, loc, dx, dz);
    return g;
  }

  // Solar farm: rows of tilted panels on posts and footings, a torque tube per row, gravel bed with
  // curb, inverter cabinet with conduit at each row's end.
  solarField(loc, dx, dz, rows, cols, yaw = 0) {
    const TILT = -0.5, PD = 3, H = 1.35; // panel depth and centre height
    const W = cols * 6, D = rows * 5;
    const g = kitPart(0x2b3a8f, (k) => {
      k.box(W + 3, 0.12, D + 2, KT(0x8a8698), -3, 0, -2.5, { outline: 0.04 });
      for (const s of [-1, 1]) {
        k.box(W + 3.2, 0.3, 0.3, KT(0x5b5870), -3, 0, -2.5 + s * (D / 2 + 1), { outline: 0.02 });
        k.box(0.3, 0.3, D + 2.2, KT(0x5b5870), -3 + s * (W / 2 + 1.5), 0, -2.5, { outline: 0.02 });
      }
      for (let i = 0; i < rows; i++) {
        const lz = (i - rows / 2) * 5;
        for (let j = 0; j < cols; j++) {
          const lx = (j - cols / 2) * 6;
          k.add(new THREE.BoxGeometry(5, 0.14, PD), KT(0x2b3a8f), lx, H, lz, { rx: TILT, outline: 0.05 });
          for (let c = -1; c <= 1; c++) k.add(new THREE.BoxGeometry(0.06, 0.16, PD - 0.1), KT(0xd8d4e8), lx + c * 1.65, H + 0.01, lz, { rx: TILT, outline: 0 });
          k.add(new THREE.BoxGeometry(5.04, 0.16, 0.08), KT(0xd8d4e8), lx, H + 0.01, lz, { rx: TILT, outline: 0 });
          // two posts (back one taller) on footings under the panel frame
          for (const sz of [-1, 1]) {
            const pz = sz * PD * 0.32, top = H + pz * Math.tan(-TILT) - 0.1;
            k.box(0.7, 0.25, 0.7, KT(0x8a8698), lx, 0, lz + pz, { outline: 0.02 });
            k.box(0.16, top, 0.16, KT(0x55607a), lx, 0, lz + pz, { outline: 0.02 });
          }
        }
        // torque tube along the row; inverter box with conduit at its end
        k.beam([-W / 2 - 3, H - 0.25, lz], [W / 2 - 3, H - 0.25, lz], 0.08, KT(0x55607a), { outline: 0.015 });
        k.box(1.1, 1.4, 0.8, KT(0xd8d4e8), -W / 2 - 4.3, 0, lz, { outline: 0.04 });
        k.box(0.5, 0.18, 0.06, KG(0x7dff6a), -W / 2 - 4.3, 1.0, lz + 0.42, { outline: 0 });
        k.box(W - 1, 0.12, 0.25, KT(0x3a3550), -3, 0.12, lz + 1.2, { outline: 0 });
      }
    });
    this.put(g, loc, dx, dz, 0, yaw);
    // one block over panels and inverters (ride over or round it)
    const c = Math.cos(yaw), sn = Math.sin(yaw), lx = -2.7, lz = -2.5;
    this.col(loc, { type: 'box', x: dx + lx * c + lz * sn, y: 1.05, z: dz - lx * sn + lz * c, hx: W / 2 + 2.2, hy: 1.05, hz: D / 2 - 1, yaw });
    (loc.keep ||= []).push({ x: dx, z: dz, r: Math.hypot(W + 4, D + 2) / 2 + 2 });
  }

  // Lamp post with a fake additive light pool: cheap "lighting" for the dark.
  lamp(loc, dx, dz, color = 0xfff1b0, h = 8, pool = 16) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 6), toon(0x3a3550), 0.05);
    pole.position.y = h / 2;
    g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), glow(color));
    bulb.position.y = h + 0.3;
    g.add(bulb);
    const p = new THREE.Mesh(new THREE.CircleGeometry(pool, 24), this.poolMat(color));
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.15;
    g.add(p);
    this.put(g, loc, dx, dz);
    this.col(loc, { type: 'cyl', x: dx, z: dz, y0: -2, y1: h, r: 0.35 });
    (loc.keep ||= []).push({ x: dx, z: dz, r: 1.5 });
  }

  poolMat(color) {
    this._pools ||= new Map();
    if (!this._pools.has(color)) {
      this._pools.set(color, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color(color) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 color; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.6); float band = step(0.5, fract(a * 3.0)) * 0.15; gl_FragColor = vec4(color * (a * 0.55 + band * a), 1.0); }',
      }));
    }
    return this._pools.get(color);
  }

  sign(loc, text, color, y = 46) {
    loc.sign = hang(loc, textSprite(text, { color, scale: 1.4 }), 0, y, 0);
  }

  addFigures(loc, count, opts) {
    for (let i = 0; i < count; i++) {
      const spawn = { kind: opts.kind, ...(opts.look ? opts.look(i) : {}) };
      const f = makeFigure(spawn);
      // (opts.area(out): where they may be; else anywhere in the place)
      const ent = {};
      if (opts.area) opts.area(f.root.position, ent);
      else { const a = this.r() * Math.PI * 2, d = (0.3 + this.r() * 0.55) * loc.r; f.root.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); }
      loc.group.add(f.root);
      // residents are the damageable crowd (civilians.js); spawn records how to make a replacement
      const fig = { ...ent, ...f, loc, spawn, area: opts.area, kind: spawn.kind || opts.kind || 'worker', target: f.root.position.clone(), wait: this.r() * 3, phase: this.r() * 10, vy: 0, hop: 0 };
      this.figures.push(fig);
      if (this.curveR(loc)) { fig.fp = f.root.position.clone(); this.poseFigure(fig); }
    }
  }

  // A curved place's resident (curve.js) walks in flat local coords (`fp`); its root is posed on the sphere from them, so
  // readers of root.position (civilians.js, ink hulls) see where it really stands.
  poseFigure(f) {
    const R = this.curveR(f.loc), p = f.fp;
    bendPoint(R, p.x, p.y, p.z, f.root.position);
    f.root.quaternion.setFromAxisAngle(_up, f.yaw || 0).premultiply(bendQuat(R, p.x, p.z, _q));
  }

  // ... and one knocked about and put down again (civilians.js finish) takes its flat place from where it landed
  reseatFigure(f) {
    const R = this.curveR(f.loc);
    if (!R) return;
    const p = f.root.position;
    unbendPoint(R, p.x, p.y, p.z, f.fp ||= new THREE.Vector3());
    f.fp.y = 0;
    const fwd = _v.set(0, 0, 1).applyQuaternion(f.root.quaternion);
    f.yaw = Math.atan2(fwd.x, fwd.z);
  }

  // A knocked-out resident was cleared (civilians.js): a fresh one moves in.
  respawnFigure(entry) {
    const loc = entry.loc;
    const f = makeFigure(entry.spawn);
    if (entry.area) entry.area(f.root.position, entry);
    else { const a = Math.random() * Math.PI * 2, d = (0.3 + Math.random() * 0.55) * loc.r; f.root.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); }
    loc.group.add(f.root);
    Object.assign(entry, f, { target: f.root.position.clone(), wait: Math.random() * 3, vy: 0, hop: 0, hp: undefined, inks: null, inkOn: undefined });
    delete entry.civ;
    if (this.curveR(loc)) { entry.fp = f.root.position.clone(); this.poseFigure(entry); }
  }

  buildLocation(loc) {
    this.frame(loc);
    const fc = FACTIONS[loc.faction].color;
    switch (loc.type) {
      case 'hub': this.buildHub(loc); break;
      case 'civilian': this.buildCivilian(loc); break;
      case 'research': this.buildArray(loc); break;
      case 'industrial': this.buildMine(loc); break;
      case 'trade': this.buildTrade(loc); break;
      case 'military': this.buildMilitary(loc); break;
      case 'pirate': loc.camp ? this.buildCamp(loc) : this.buildGulch(loc); break;
      case 'lab': this.buildLab(loc); break;
      case 'monolith': this.buildMonolith(loc); break;
      case 'casino': this.casino = buildCasino(this, loc); dressCasinoLot(this, loc, makeHoverCar); break; // casino
      case 'ruin': buildRuin(this, loc); break;
      case 'hometown': buildHomeTown(this, loc); this.addFigures(loc, 10, { kind: 'worker', look: (i) => ({ suit: [0xff9f1c, 0x7dff6a, 0x2ec4ff, 0xff7ad9][i % 4] }) }); break;
    }
    this.storyMarks(loc);
    if (loc.dark && loc.type !== 'pirate') {
      // dark-side settlements get a ring of lamps
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.lamp(loc, Math.cos(a) * loc.r * 0.8, Math.sin(a) * loc.r * 0.8, 0xfff1b0, 9, 20);
      }
    }
    if (loc.defense && loc.type !== 'hub') this.defensePylons(loc, defenseSpots(loc)); // (no restricted site has loc.defense)
    if (loc.hq && loc.type !== 'ruin') {
      const hq = textSprite(loc.conqueredFrom ? `★ TAKEN BY ${FACTIONS[loc.faction].name.toUpperCase()} ★` : loc.lawless ? '★ HELD BY THE RUSTMOON CLANS ★' : `★ ${FACTIONS[loc.faction].name.toUpperCase()} HQ ★`, { color: '#ffffff', size: 60, scale: 0.8 });
      hang(loc, hq, 0, loc.type === 'hub' ? 110 : 62, 0);
    }
    this.sign(loc, loc.name.toUpperCase(), fc, loc.type === 'hub' ? 95 : loc.camp ? 26 : 50);
  }

  // A story finale changed a place (main.js applyWorldLive): tear down its group, colliders and moving
  // parts and rebuild from the remapped location. Children other systems hung on it (userData.keep:
  // story leaders) move to the new group.
  rebuildLocation(loc) {
    const old = loc.group;
    const keep = old.children.filter((o) => o.userData.keep);
    old.removeFromParent();
    for (const c of loc._cols || []) this.colliders.remove(c);
    loc._cols = [];
    const mine = (x) => x.loc !== loc;
    for (const k of ['spinners', 'blinkers', 'dishes', 'figures', 'zoneWalls', 'walkers', 'rides', 'anims']) this[k] = this[k].filter(mine);
    const pads = loc.pads; // (traffic already routes to these)
    loc.merged = false; // (merges again next time it's drawn)
    for (const k of ['turretMounts', 'keep', 'pads', 'sign', 'launchBuilt', 'leaderSpot', 'paved']) delete loc[k];
    this.buildLocation(loc);
    if (pads) loc.pads = pads;
    for (const o of keep) loc.group.add(o);
    this.prepCulling(loc);
  }

  // Story marks (worldstate.js): conqueror's banners over a taken settlement, the clans' black-and-green
  // over a fallen ILMB, the Black Sun by the Forward Post.
  storyMarks(loc) {
    const ring = (n, r, colors, h) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.4; this.flag(loc, Math.cos(a) * r, Math.sin(a) * r, colors, h); } };
    if (loc.conqueredFrom) { const c = new THREE.Color(FACTIONS[loc.faction].color).getHex(); ring(4, loc.r * 0.55, [c, 0xffffff, c], 22); }
    if (loc.lawless) ring(loc.type === 'hub' ? 6 : 3, loc.r * (loc.type === 'hub' ? 0.45 : 0.6), [0x1a1a1a, 0x7dff3a, 0x1a1a1a], 20);
    if (loc.lawless && loc.type === 'hub') dressScrap(this, loc);
    if (loc.launchPad && !loc.launchBuilt) {
      // Meridian launch complex, on flattened ground just outside the dig
      loc.launchBuilt = true;
      const x = loc.r * 1.25, z = 0;
      const at = this.toWorld(loc, x, 0, z);
      this.planet.addFlat(at.clone().normalize(), 28);
      // that plateau is square to the Moon's up there, leaning from the camp's up by x / R: tilt the
      // complex to match and seat it on the plateau's middle (no edge in the air)
      const seat = loc.group.worldToLocal(at.clone().setLength(this.planet.surface(at)));
      const dy = seat.y;
      const lc = makeProp('launch');
      lc.rotation.order = 'ZYX';
      lc.rotation.z = -Math.asin(Math.min(1, Math.hypot(x, z) / loc.pos.length()));
      this.put(lc, loc, seat.x, seat.z, dy - 0.25, -Math.PI / 2, false);
      for (const c of lc.userData.cols || []) {
        // (quarter-turned like the model; boxes turn with it, all raised onto the seat)
        const cc = c.type === 'cyl' ? { ...c, x: x - c.z, z: z + c.x, y0: (c.y0 || 0) + dy, y1: (c.y1 || 0) + dy }
          : { ...c, x: x - c.z, z: z + c.x, y: c.y + dy, yaw: (c.yaw || 0) - Math.PI / 2 };
        this.col(loc, cc);
      }
    }
    if (loc.blackSun) {
      const R = makeProp('reactor');
      this.put(R, loc, -loc.r * 0.4, 0, 0, 0, true);
      this.col(loc, { type: 'cyl', x: -loc.r * 0.4, z: 0, y0: -1, y1: 3, r: 8 });
      this.col(loc, { type: 'sphere', x: -loc.r * 0.4, y: 5.4, z: 0, r: 2.6 });
      this.anims.push({ loc, list: collectNodes(R, (o) => o.userData.spin), seed: 3 });
    }
  }

  buildHub(loc) {
    dressIlmb(this, loc); // dome, spire, repair hangar, gantry, fuel spheres, outer domes, barracks
    const B = new Batch();
    this.buildIlmbWings(loc, B);
    // job terminal: a kiosk of screens facing the arrival point (settlements.jobTerminal); the Hall of
    // Highlights is on the board's own screen (hud.openBoard)
    jobTerminal(this, loc, 0, 76, 0, 0xffd23f);
    hang(loc, textSprite('JOB BOARD', { color: '#ffffff', size: 80, scale: 0.6 }), 0, 21, 76);

    // repair bay hangar (past the Daedalus relay, clear of the wings; built in settlements.js)
    hang(loc, textSprite('REPAIR BAY', { color: '#ff9f1c', size: 70, scale: 0.6 }), -168, 24, -98);
    this.pad(loc, 95, -60, 16);
    this.pad(loc, -120, 40, 16, 0x2ec4ff);
    this.solarField(loc, 150, 60, 4, 6, 0.4);
    const dish = makeDish(14, 'spacecom');
    this.put(dish.root, loc, -150, -40);
    this.addDish(dish, 0.2, loc);
    for (const c of dish.cols) this.col(loc, { ...c, x: -150 + c.x, z: -40 + c.z });

    // Launch complex: where most new arrivals land
    const lp = { x: 20, z: -185 };
    this.pad(loc, lp.x, lp.z, 30, 0xff4f2e, false, { flat: true }); // (rocket pad: flat, no shuttles)
    // (gantry and fuel spheres: settlements.dressIlmb)
    hang(loc, textSprite('ARRIVALS', { color: '#ff4f2e', size: 70, scale: 0.6 }), lp.x, 30, lp.z + 20);
    const rocket = makeRocket();
    this.put(rocket.root, loc, lp.x, lp.z, 900, 0, true);
    this.rocket = { ...rocket, loc, lp, t: 0, alt: 900, period: 76 };
    this.launchPad = { loc, x: lp.x, z: lp.z };

    this.fortify(loc, B);
    B.build(this, loc);
    this.addFigures(loc, 14, { kind: 'worker', look: (i) => ({ suit: [0xff9f1c, 0xffd23f, 0x2ec4ff, 0xffffff][i % 4] }) });
    this.addFigures(loc, 10, { kind: 'soldier', look: () => ({ suit: 0x55607a, helmet: 0xffd23f, visor: 0x111111 }) });
  }

  // SPACECOM fortress ring, the Moon's most defended place. Every gun is on the wall: one per gate
  // tower and two bastions per quarter between gates.
  fortify(loc, B) {
    const R = 248, segs = 40;
    const gates = [0.25 * Math.PI * 2, 0.5 * Math.PI * 2, 0.75 * Math.PI * 2, Math.PI * 2];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.1)) continue;
      const len = ((2 * Math.PI * R) / segs) * 0.96;
      this.wallB(B, loc, Math.cos(a) * R, Math.sin(a) * R, len, 9, 4, 0x5b5870, -a + Math.PI / 2, 0xffd23f);
    }
    const beacon = new THREE.MeshBasicMaterial({ color: 0xff2a4a });
    this.blinkers.push({ mat: beacon, base: new THREE.Color(0xff2a4a), phase: 0, loc });
    for (let q = 0; q < 4; q++) for (const f of [1 / 3, 2 / 3]) this.bastion(B, loc, (q + f) * (Math.PI / 2), R, { r: 5.5, h: 10, out: 4, ped: 2.2, color: 0x4a4660, trim: 0xffd23f, beacon, heavy: true });
    for (const g of gates) {
      for (const s of [-1, 1]) {
        const a = g + s * 0.14;
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        this.gateTowerB(B, loc, x, z, 8, 16, 0xffd23f, -a + Math.PI / 2, 0x2a2540);
        // gun ring on the tower roof, corbelled over the outer face
        B.at(x, z, -a);
        B.add(new THREE.CylinderGeometry(2.6, 2.2, 1.6, 10), toon(0x3a3550), 1.6, 17.4, 0, { outline: 0.08 });
        B.add(new THREE.TorusGeometry(2.7, 0.18, 6, 16), this.glowM(0xff2a4a), 1.6, 17.9, 0, { rx: Math.PI / 2, outline: 0 });
        const gx = x + Math.cos(a) * 1.6, gz = z + Math.sin(a) * 1.6;
        this.col(loc, { type: 'cyl', x: gx, z: gz, y0: 16, y1: 18.2, r: 2.6 });
        this.mount(loc, gx, gz, 18.2, { wall: true });
      }
      // lit gantry across the gate between its towers, high enough to ride (or fly) under
      const gr = R * Math.cos(0.14), half = R * Math.sin(0.14) - 4.5;
      B.at(Math.cos(g) * gr, Math.sin(g) * gr, -g + Math.PI / 2);
      B.add(new THREE.BoxGeometry(half * 2, 1.8, 2.6), toon(0x3a3550), 0, 15, 0, { outline: 0.12 });
      B.add(new THREE.BoxGeometry(half * 2, 0.5, 2.8), toon(0xffd23f), 0, 16.1, 0, { outline: 0 });
      for (let x = -half + 4; x < half - 2; x += 6) B.add(new THREE.BoxGeometry(1.6, 0.25, 0.8), this.glowM(0xfff6a8), x, 14, 0, { outline: 0 });
      for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(half * 2, 0.3, 0.2), this.glowM(0x2ee6ff), 0, 15, sz * 1.4, { outline: 0 });
      this.col(loc, { type: 'box', x: Math.cos(g) * gr, y: 15.3, z: Math.sin(g) * gr, hx: half, hy: 1.1, hz: 1.4, yaw: -g + Math.PI / 2 });
    }
    // inner guns on pylons, one in each gap between the wings (locations.js ILMB_WINGS_AT; defenseSpots lists the outer ring's
    // turrets first)
    this.defensePylons(loc, defenseSpots(loc).slice(loc.defense.turrets), 7);
    // (barracks and vehicle depot: settlements.dressIlmb)
    for (let i = 0; i < 3; i++) {
      const r = makeRover({ color: 0x55607a, trim: 0xffd23f, pirate: false, flag: 0xffd23f });
      r.root.scale.setScalar(1.15);
      this.put(r.root, loc, 150 + i * 12, -95 + i * 6, 0, 1.2);
      this.col(loc, { type: 'box', x: 150 + i * 12, y: 1.5, z: -95 + i * 6, hx: 2.5, hy: 1.5, hz: 3.0, yaw: 1.2 });
    }
    hang(loc, loc.lawless ? textSprite('RUSTMOON', { color: '#7dff3a', size: 90, scale: 1.1 }) : textSprite('SPACECOM', { color: '#ffd23f', size: 90, scale: 1.1 }), 0, 132, 0);
  }

  // ---------- ILMB wings: six distinct buildings joined to the main dome by glass skywalks ----------
  buildIlmbWings(loc, B) {
    // (in ILMB_WINGS_AT's order: locations.js keeps where each stands, so the inner guns can stand between them)
    const wings = [
      { walkers: 2, build: (w) => this.wingHydroponics(loc, w) },
      { walkers: 3, build: (w) => this.wingLabs(loc, w) },
      { walkers: 3, build: (w) => this.wingHangar(loc, w) },
      { walkers: 2, build: (w) => this.wingRelay(loc, w) },
      { walkers: 2, build: (w) => this.wingPower(loc, w) },
      { walkers: 3, build: (w) => this.wingHabitat(loc, w) },
    ];
    wings.forEach((s, i) => {
      const [a, d] = ILMB_WINGS_AT[i];
      const w = this.wing(loc, a, d);
      const E = s.build(w); // wing centre to the face its skywalk docks into
      this.skywalk(loc, B, a, 53, d - E + 1.2, s.walkers);
    });
  }

  // A wing's local frame: +X away from the hub, -X faces the skywalk. The buildings themselves are Blender models baked by
  // settlements.js; this places what the world adds round them (colliders, props, flags, signs).
  wing(loc, a, d) {
    const yaw = -a, c = Math.cos(yaw), s = Math.sin(yaw);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    return {
      a, d, yaw, P,
      box: (lx, ly, lz, hx, hy, hz, ry = 0) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'box', x, y: ly, z, hx, hy, hz, yaw: yaw + ry }); },
      cyl: (lx, lz, y0, y1, r) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'cyl', x, z, y0, y1, r }); },
      sign: (text, color, lx, y, lz, scale = 0.55) => { const [x, z] = P(lx, lz); hang(loc, textSprite(text, { color, size: 64, scale }), x, y, z); },
      flag: (lx, lz, colors, h) => { const [x, z] = P(lx, lz); this.flag(loc, x, z, colors, h); },
      obj: (o, lx, lz, y = 0, ry = 0, dynamic = false) => { const [x, z] = P(lx, lz); return this.put(o, loc, x, z, y, yaw + ry, dynamic); },
    };
  }

  // Enclosed glass skywalk from the main dome along angle a (radius r0 → r1): floor slab, inked ribs
  // every few metres, see-through walls and vaulted roof, a few walkers. Solid from outside.
  skywalk(loc, B, a, r0, r1, walkers = 2) {
    const len = r1 - r0, yaw = -a, W = 5.6, F = 0.6, wallH = 2.0, R = W / 2, top = F + wallH + R;
    const x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0;
    const mid = len / 2;
    const rib = toon(0xfff4e0), trim = toon(0xffd23f), glass = this.glassM(0x9be7ff, 0.17);
    B.at(x0, z0, yaw);
    B.add(new THREE.BoxGeometry(len, F, W + 0.8), toon(0x3a3550), mid, F / 2, 0, { outline: 0.1 });
    B.add(new THREE.BoxGeometry(len, 0.04, W - 0.8), toon(0xd8d4e8), mid, F + 0.02, 0, { outline: 0 });
    B.add(new THREE.BoxGeometry(len, 0.06, 0.28), this.glowM(0x2ee6ff), mid, F + 0.05, 0, { outline: 0 });
    for (const sz of [-1, 1]) B.add(new THREE.PlaneGeometry(len, wallH), glass, mid, F + wallH / 2, sz * R, { outline: 0 });
    B.add(new THREE.CylinderGeometry(R, R, len, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), glass, mid, F + wallH, 0, { outline: 0 });
    // structure: spine and eave rails, ribs, yellow portals at the dome and the wing
    // (rails stop at the end rings, else they poke into the dome)
    const rs = 5.2, re = len - 1.3;
    B.add(new THREE.BoxGeometry(re - rs, 0.22, 0.22), rib, (rs + re) / 2, top, 0, { outline: 0.05 });
    for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(re - rs, 0.26, 0.26), rib, (rs + re) / 2, F + wallH, sz * R, { outline: 0.05 });
    const ribs = [5.2];
    const n = Math.max(2, Math.round((len - 7) / 5));
    for (let i = 1; i < n; i++) ribs.push(5.2 + ((len - 6.5) * i) / n);
    ribs.push(len - 1.3);
    ribs.forEach((x, i) => {
      const end = i === 0 || i === ribs.length - 1;
      const m = end ? trim : rib, t = end ? 0.42 : 0.18;
      B.add(new THREE.TorusGeometry(R, t, 6, 18, Math.PI), m, x, F + wallH, 0, { ry: Math.PI / 2, outline: 0.06 });
      for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(t * 2, wallH, t * 2), m, x, F + wallH / 2, sz * R, { outline: 0.06 });
      if (!end) B.add(new THREE.SphereGeometry(0.2, 6, 4), this.glowM(0xfff6a8), x, top - 0.25, 0, { outline: 0 });
    });
    // each end opens onto a faintly glowing doorway in the walkway's own arch section, not a flat wall (archP: that section,
    // e either side of the middle, drawn into p)
    const archP = (e, p = new THREE.Path()) => { p.moveTo(-e, F); p.lineTo(e, F); p.lineTo(e, F + wallH); p.absarc(0, F + wallH, e, 0, Math.PI, false); p.lineTo(-e, F); return p; };
    const archGeo = new THREE.ShapeGeometry(archP(R - 0.35, new THREE.Shape()), 12).rotateY(Math.PI / 2);
    const portal = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    // (just inside the end rings: at the very ends they'd be buried in the dome and wing)
    // and a lit rim round each doorway so it reads from both sides
    const rim = new THREE.Shape(archP(R - 0.3).getPoints(24));
    rim.holes.push(new THREE.Path(archP(R - 0.62).getPoints(24)));
    const rimGeo = new THREE.ShapeGeometry(rim).rotateY(Math.PI / 2);
    for (const x of [5.55, len - 1.65]) {
      B.add(archGeo.clone(), portal, x, 0, 0, { outline: 0 });
      B.add(rimGeo.clone(), this.glowM(0x9fe8ff), x, 0, 0, { outline: 0 });
    }
    const cm = r0 + mid;
    // straight glass walls, then a round vault on top (a box would square the roof's shoulders)
    this.col(loc, { type: 'box', x: Math.cos(a) * cm, y: (F + wallH) / 2, z: Math.sin(a) * cm, hx: mid, hy: (F + wallH) / 2, hz: R + 0.4, yaw });
    this.col(loc, { type: 'hcyl', x: Math.cos(a) * cm, y: F + wallH, z: Math.sin(a) * cm, r: R + 0.3, len, yaw: yaw + Math.PI / 2 });

    // foot traffic pacing between dome and wing, seen through the glass
    const grp = new THREE.Group();
    this.put(grp, loc, x0, z0, 0, yaw);
    const center = this.toWorld(loc, Math.cos(a) * cm, 2, Math.sin(a) * cm);
    const suits = [0xffd23f, 0x2ec4ff, 0xff9f1c, 0xffffff, 0xff7ad9, 0x7dff6a, 0xc77dff];
    for (let k = 0; k < walkers; k++) {
      const f = makeFigure({ suit: suits[(k * 3 + Math.round(a * 5)) % suits.length], helmet: 0xfff4e0 });
      const dir = k % 2 ? 1 : -1;
      const lane = dir * 0.9;
      const x = 7 + this.r() * (len - 13);
      f.root.position.set(x, F, lane);
      f.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      f.root.traverse((o) => { o.castShadow = false; }); // under glass: skip the shadow pass
      grp.add(f.root);
      this.walkers.push({ ...f, loc, center, x, lane, dir, min: 6.5, max: len - 3.2, F, speed: 1.1 + this.r() * 0.7, wait: this.r() * 2, phase: this.r() * 6 });
    }
  }

  updateWalkers(dt, camPos) {
    for (const w of this.walkers) {
      const on = w.loc.active && w.center.distanceToSquared(camPos) < 400 * 400;
      w.root.visible = on;
      if (!on) continue;
      const p = w.root.position;
      if (w.wait > 0) {
        w.wait -= dt;
        w.legL.rotation.x = w.legR.rotation.x = 0;
        if (w.armL) w.armL.rotation.x = w.armR.rotation.x = 0;
        p.y = w.F;
        continue;
      }
      w.x += w.dir * w.speed * dt;
      if (w.x > w.max || w.x < w.min) {
        w.x = clamp(w.x, w.min, w.max);
        w.dir = -w.dir;
        w.lane = -w.lane; // keep to the right
        w.wait = 0.6 + Math.random() * 2.5;
        w.root.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      w.phase += dt * 4.5 * w.speed;
      w.legL.rotation.x = Math.sin(w.phase) * 0.6;
      w.legR.rotation.x = -Math.sin(w.phase) * 0.6;
      if (w.armL) { w.armL.rotation.x = -Math.sin(w.phase) * w.swing; w.armR.rotation.x = Math.sin(w.phase) * w.swing; }
      p.set(w.x, w.F + Math.abs(Math.sin(w.phase)) * 0.12, p.z + (w.lane - p.z) * Math.min(1, dt * 2));
    }
  }

  // One of the ILMB's Blender-built wings (settlements.ilmbWing), baked in a settlement kit of its own, lobby included. Returns
  // the dock distance (wing centre to the lobby face).
  blenderWing(loc, w, name, seed) {
    const [x, z] = w.P(0, 0);
    let dock = 0;
    settle(this, loc, seed, (k) => { dock = ilmbWing(k, name, x, z, w.yaw); });
    return dock;
  }

  // Hydroponics (tools/blender/build_hydroponics.py): a lattice greenhouse dome over stepped beds and an aeroponic tower on a
  // light pipe, lit by six heliostats through the lantern; water and nutrient tanks, a produce airlock.
  wingHydroponics(loc, w) {
    const dock = this.blenderWing(loc, w, 'hydroponics', 4501);
    w.sign('HYDROPONICS', '#7dff6a', 0, 33, 0);
    return dock;
  }

  // Meridian Labs (tools/blender/build_labs.py): a lab block with an observatory on the roof and, off its outer end, a pylon
  // leaning out on stays to a roof counterweight, carrying a glazed sky lab and the turning Meridian globe.
  wingLabs(loc, w) {
    const dock = this.blenderWing(loc, w, 'labs', 4503);
    w.flag(-12, 16, [0x2ec4ff, 0xffffff, 0x1b3a8f]);
    w.sign('MERIDIAN LABS', '#2ec4ff', -4, 24, 0);
    return dock;
  }

  // Vostok Hangar (tools/blender/build_hangar.py): a bermed, slab-sided hangar under red portal frames, its blast doors half
  // open on a lit bay with a bridge crane; a control tower with a turning radar; an apron where a route shuttle-bus is parked.
  wingHangar(loc, w) {
    const dock = this.blenderWing(loc, w, 'hangar', 4507);
    // a real route shuttle-bus in Vostok red, parked nose-out on the apron, gear down, ramp lowered
    const cx = wingModel('hangar').root.data.apron, SS = 0.9;
    const sh = makeShuttle({ color: 0xfff4e0, stripe: 0xff3b5c });
    sh.root.scale.setScalar(SS);
    sh.setGear(1);
    sh.setRamp(1);
    sh.setThrust(0, 0, 0);
    sh.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(sh.root), bs = bb.getSize(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
    w.obj(sh.root, cx, 0, sh.gearH * SS, Math.PI / 2);
    // (quarter-turned: its length runs along apron x)
    w.box(cx + bc.z, sh.gearH * SS + bc.y, -bc.x, bs.z / 2 * 0.92, bs.y / 2, bs.x / 2 * 0.9);
    w.flag(12, -21, [0xff3b5c, 0xffd23f]);
    w.sign('VOSTOK HANGAR', '#ff3b5c', 0, 20, 0);
    return dock;
  }

  // Daedalus Relay (tools/blender/build_relay.py): a delta-plan phased-array station whose two arrays read as eyes, a radome
  // and a lattice mast on the roof, an RF fence in front; the tracking dish (makeDish, Daedalus paint) stands off its -z side.
  wingRelay(loc, w) {
    const dock = this.blenderWing(loc, w, 'relay', 4509);
    const { dishX, dishZ } = wingModel('relay').root.data;
    const dish = makeDish(15.6, 'daedalus');
    w.obj(dish.root, dishX, dishZ);
    this.addDish(dish, 0.12, loc);
    for (const c of dish.cols) { if (c.type === 'cyl') w.cyl(dishX + c.x, dishZ + c.z, c.y0, c.y1, c.r); else w.box(dishX + c.x, c.y, dishZ + c.z, c.hx, c.hy, c.hz); }
    w.flag(-15, -11, [0xc77dff, 0x111111, 0xc77dff]);
    w.sign('DAEDALUS RELAY', '#c77dff', 6, 28, 0);
    return dock;
  }

  // Power block: a D-He3 fusion plant (tools/blender/build_power.py, settlements.powerBlock): hall with a control bridge, a
  // magnetic bottle on trestles across the wing (high enough to drive under), beam injectors, cryoplant, He-3 and deuterium
  // spheres. Baked in a settlement kit of its own, vestibule included.
  wingPower(loc, w) {
    const [x, z] = w.P(0, 0);
    settle(this, loc, 4513, (k) => powerBlock(k, x, z, w.yaw));
    w.sign('POWER BLOCK', '#ffd23f', 0, 22, 0);
    return POWER_DOCK;
  }

  // Kepler habitat "Orrery" (tools/blender/build_habitat.py, settlements.keplerHabitat): twelve two-deck modules in a ring on
  // lander legs, high enough to skate under, three glazed spokes to a hub tower with an observation crown, a park inside, and
  // an orbit ring turning round the crown. Baked in a settlement kit of its own, lobby included.
  wingHabitat(loc, w) {
    const [x, z] = w.P(0, 0);
    settle(this, loc, 4519, (k) => keplerHabitat(k, x, z, w.yaw));
    w.flag(8, 31.4, [0xff9f1c, 0xffffff]);
    w.sign('KEPLER HABITAT', '#ff9f1c', 0, 52, 0);
    return HABITAT_DOCK;
  }

  // Meridian Exchange (settlements.js): trading tower, warehouses, container gantry, cranes.
  buildTrade(loc) {
    buildMeridian(this, loc);
    const cols = [0x2ec4ff, 0xff9f1c, 0x7dff6a, 0xff3b5c, 0xffd23f, 0xc77dff];
    this.addFigures(loc, 12, { kind: 'worker', look: (i) => ({ suit: cols[i % cols.length] }) });
  }

  // Kepler towns (settlements.js): hab domes and tunnels, cabins, playground, greenhouse, water tower;
  // Kepler Civic Center adds the council dome and clock-tower town hall.
  buildCivilian(loc) {
    buildTown(this, loc, { civic: loc.id === 'kepler' });
    const palette = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff];
    this.addFigures(loc, 8, { kind: 'worker', look: (i) => ({ suit: palette[i % palette.length] }) });
    this.addFigures(loc, 7, { kind: 'kid', look: (i) => ({ suit: palette[(i + 3) % palette.length], scale: 0.55 }) });
  }

  buildArray(loc) {
    // (a sweep rate per dish, drawn here so the world's random stream stays undisturbed)
    const speeds = ARRAY_DISHES.map(() => 0.05 + this.r() * 0.1);
    dressArray(this, loc, speeds); // four dish stations, observatory, labs, control centre, mast, cable runs
    this.pad(loc, -100, -20, 13, 0x7dff6a, true);
    this.solarField(loc, 0, 120, 3, 8, 0);
    this.addFigures(loc, 8, { kind: 'worker', look: () => ({ suit: 0xffffff, visor: 0x2b8f4a }) });
  }

  // Helium-3 Exchange (settlements.js): excavator, conveyor, derrick, tank farm, ticker hall.
  buildMine(loc) {
    buildHelium(this, loc);
    this.addFigures(loc, 9, { kind: 'worker', look: () => ({ suit: 0xff9f1c, helmet: 0xffd23f }) });
  }

  buildMilitary(loc) {
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const small = !!loc.small;
    const wallR = small ? 55 : 95, segs = small ? 10 : 14;
    const B = new Batch();
    for (let i = 1; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const len = (2 * Math.PI * wallR) / segs * 0.92;
      this.wallB(B, loc, Math.cos(a) * wallR, Math.sin(a) * wallR, len, 7, 3, 0x5b5870, -a + Math.PI / 2, fc);
    }
    // gun bastions evenly round the wall (the gate at angle 0 between two), plus outer perimeter guns
    // in the restricted zone
    const nb = small ? 6 : 8;
    for (let i = 0; i < nb; i++) this.bastion(B, loc, ((i + 0.5) / nb) * Math.PI * 2, wallR, { r: 4.2, h: 8, out: 3.0, ped: 2.0, color: 0x4a4660, trim: fc });
    B.build(this, loc);
    const outer = small ? 2 : 4;
    for (let i = 0; i < outer; i++) {
      const a = (i / outer) * Math.PI * 2 + 1.2, r = small ? 180 : 290;
      this.mount(loc, Math.cos(a) * r, Math.sin(a) * r, 0, { ground: true });
    }
    dressBase(this, loc); // command bunker, barracks, searchlight tower, traps, fuel
    const dish = makeDish(small ? 8 : 12, loc.faction);
    this.put(dish.root, loc, 30, 30);
    this.addDish(dish, 0.6, loc);
    for (const c of dish.cols) this.col(loc, { ...c, x: 30 + c.x, z: 30 + c.z });
    this.flag(loc, 0, small ? 40 : 70, loc.faction === 'vostok' ? [0xff3b5c, 0xffd23f, 0xff3b5c] : [0xc77dff, 0x111111, 0xc77dff], 20);
    this.addFigures(loc, small ? 4 : 8, { kind: 'soldier', look: () => ({ suit: 0x55607a, helmet: fc, visor: 0x111111 }) });

    if (!loc.restricted) return; // (no wall once the Council ceasefire stands the zone down)
    const mat = zoneWallMaterial();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(loc.zoneR, loc.zoneR, 170, 96, 1, true), mat);
    this.put(wall, loc, 0, 0, 15);
    this.zoneWalls.push({ loc, mat });
  }

  // Pirate dens (settlements.js): shanties, wrecks, junk heaps, lookout tower, green lights.
  buildGulch(loc) {
    buildDen(this, loc);
    this.flag(loc, 20, 20, [0x111111, 0x111111], 18);
    // heat lamps: sickly orange pools in the dark
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      this.lamp(loc, Math.cos(a) * 60, Math.sin(a) * 60, 0xff9f1c, 5, 14);
    }
    this.addFigures(loc, 6, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  buildCamp(loc) {
    buildPirateCamp(this, loc);
    this.flag(loc, 0, 0, [0x111111, 0x7dff3a, 0x111111], 12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.lamp(loc, Math.cos(a) * 14, Math.sin(a) * 14, 0x7dff3a, 4, 12);
    }
    this.addFigures(loc, 3, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  // ---------- traffic: freighters, shuttle-buses, road-trains (see traffic.js) ----------
  buildTraffic() {
    this.traffic = new Traffic(this);
    this.roads = this.traffic.roads;
    // keep big shaped rocks (rocks.js) off the roads
    const tr = this.traffic, pts = [];
    const rp = tr.roadMesh && tr.roadMesh.geometry.attributes.position;
    if (rp) for (let i = 0; i < rp.count; i += 6) pts.push(new THREE.Vector3().fromBufferAttribute(rp, i).normalize());
    for (const pc of tr.pieces || []) { const P = (pc.path && pc.path.pts) || pc.raw || []; for (let i = 0; i < P.length; i += 2) pts.push(P[i].clone().normalize()); }
    this.planet.keepClear(pts, 26);
  }

  // ---------- per-frame ----------
  update(dt, time, camPos) {
    this._camPos = camPos;
    this.sky.position.copy(camPos);
    if (this.spindle) this.spindle.rotation.y += dt * 0.05; // the roll
    this.earth.rotation.y += dt * 0.01;

    // activate nearby settlements, drop far ones from the scene
    const camDir = _v.copy(camPos).normalize();
    for (const loc of this.locations) {
      loc.camDist = this.planet.R * Math.acos(clamp(camDir.dot(loc.dir), -1, 1));
      const want = loc.camDist < ACTIVE_DIST;
      loc.active = want;
      // drawn while in range and not behind terrain
      if (want && loc.detail) loc.occluded = loc.camDist > loc.r + SHOW_NEAR && !this.lineOfSight(camPos, loc.pos, loc.topH + 2);
      const show = want && !loc.occluded;
      if (show && !loc.merged) this.mergeLocation(loc);
      if (show !== loc.shown) {
        loc.shown = show;
        if (show) this.scene.add(loc.group); else this.scene.remove(loc.group);
      }
      if (show && loc.inkChunks) {
        for (const ch of loc.inkChunks) {
          const d = ch.c.distanceTo(camPos) - ch.r;
          // (.visible, not the mask: the small-prop cells below mask these chunks too, and the two must not undo each other)
          if (ch.on && d > INK_DIST + 20) { ch.on = false; ch.m.visible = false; }
          else if (!ch.on && d < INK_DIST) { ch.on = true; ch.m.visible = true; }
        }
      }
      if (show && loc.cells) {
        for (const c of loc.cells) {
          const d = c.c.distanceTo(camPos);
          if (c.on && d > DETAIL_DIST + 30) { c.on = false; setMask(c.objs, false); }
          else if (!c.on && d < DETAIL_DIST) { c.on = true; setMask(c.objs, true); }
        }
      }
    }
    for (const s of this.spinners) if (s.loc.active) s.obj.rotation[s.axis] += s.speed * dt;
    for (const a of this.anims) {
      if (!a.loc.active) continue;
      for (const o of a.list) stepMover(o, dt, time, a.seed);
    }
    for (const d of this.dishes) {
      if (!d.loc.active) continue;
      d.yaw.rotation.y += d.speed * dt;
      d.tilt.rotation.x = -0.6 + Math.sin(time * d.speed * 2) * 0.25;
      for (const l of d.lamps) l.visible = Math.sin(time * 4 + l.userData.seed) > -0.3; // (aircraft lamps)
    }
    for (const b of this.blinkers) {
      if (!b.loc.active) continue;
      b.mat.color.copy(b.base).multiplyScalar(Math.sin(time * 3 + b.phase) > 0.2 ? 1 : 0.25);
    }
    for (const z of this.zoneWalls) z.mat.uniforms.time.value = time;
    if (this.lakeMat) this.lakeMat.uniforms.time.value = time;
    if (this.reactor && this.reactor.loc.active) {
      const r = this.reactor;
      const k = r.spin + r.flash * 6;
      r.orb.rotation.x += dt * 9 * k; r.orb.rotation.y += dt * 13 * k;
      r.ringA.rotation.x += dt * 17 * k; r.ringB.rotation.y += dt * 21 * k; r.ringB.rotation.z += dt * 5;
      r.core.position.y = r.base + Math.sin(time * 37) * 0.25 * k;
      r.core.position.x = -2 + (Math.random() - 0.5) * 0.25 * k;
      r.orb.scale.setScalar(1 + Math.sin(time * 23) * 0.12 + r.flash * 0.8);
      r.flash = Math.max(0, r.flash - dt * 0.8);
      this.reactorLight.intensity = camPos.distanceTo(this.lab.reactor) < 80 ? (6 + r.flash * 30) * (0.8 + Math.random() * 0.4) : 0;
    } else if (this.reactorLight) this.reactorLight.intensity = 0;
    if (this.monolith && this.monolith.loc.active) this.monolith.halo.material.opacity = 0.3 + 0.25 * Math.sin(time * 2);
    if (this.casino && this.casino.loc.active) this.casino.update(dt, time); // casino
    if (this.crystals) for (const c of this.crystals) c.mesh.visible = !c.taken && c.pos.distanceToSquared(camPos) < 450 * 450;

    this.updateRocket(dt);
    this.traffic.update(dt, camPos);
    this.updateFigures(dt);
    if (this.civilians) this.civilians.update(dt);
    this.updateWalkers(dt, camPos);
  }

  updateRocket(dt) {
    const r = this.rocket;
    if (!r) return;
    r.t = (r.t + dt) % r.period;
    const t = r.t;
    let alt, flame = 0;
    if (t < 20) { const k = 1 - t / 20; alt = 900 * k * k; flame = alt < 500 ? 1 : 0.3; }
    else if (t < 40) { alt = 0; flame = 0; }
    else if (t < 60) { const k = (t - 40) / 20; alt = 900 * k * k; flame = 1; }
    else { alt = 2000; flame = 0; }
    r.alt = alt;
    r.root.visible = t < 60;
    r.root.position.y = alt;
    r.flame.visible = r.core.visible = flame > 0;
    r.flame.scale.set(1, flame * (0.8 + Math.random() * 0.4), 1);
    r.firing = flame > 0.5 && alt < 120;
    if (r.loc.active) r.worldPos = r.loc.group.localToWorld(new THREE.Vector3(r.lp.x, alt + 20, r.lp.z));
  }

  // ---------- strange places ----------

  // Dr. Zbornak's lab: a walk-in hollow building with a violently spinning antimatter reactor in a
  // glass tube in the middle.
  buildLab(loc) {
    const W = 22, D = 16, H = 16, T = 1;
    const wall = (x, z, w, d) => {
      this.put(mesh(new THREE.BoxGeometry(w, H, d), toon(0xe8e4f4), 0.15), loc, x, z, H / 2);
      this.col(loc, { type: 'box', x, y: H / 2, z, hx: w / 2, hy: H / 2, hz: d / 2 });
    };
    wall(0, -D, W * 2, T * 2);
    wall(-W, 0, T * 2, D * 2);
    wall(W, 0, T * 2, D * 2);
    wall(-13, D, 18, T * 2);
    wall(13, D, 18, T * 2);
    this.put(mesh(new THREE.BoxGeometry(W * 2 + 2, 1.5, D * 2 + 2), toon(0x3a3550), 0.15), loc, 0, 0, H + 0.75);
    this.col(loc, { type: 'box', x: 0, y: H + 0.75, z: 0, hx: W + 1, hy: 0.75, hz: D + 1 });
    // hazard stripes over the door + a warning sign
    this.put(mesh(new THREE.BoxGeometry(8, 1.2, 0.3), toon(0xffd23f), 0.05), loc, 0, D + 1.1, H - 2);
    hang(loc, textSprite('☢ ANTIMATTER — KNOCK FIRST', { color: '#ffd23f', size: 60, scale: 0.55, bg: '#120a1e' }), 0, H + 5, D + 2);
    // interior: checker floor, glowing strip lights, shelves
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 2, D * 2 - 2, 1, 1), new THREE.MeshToonMaterial({ map: this.checker(), gradientMap: toon(0).gradientMap }));
    floor.rotation.x = -Math.PI / 2;
    this.put(floor, loc, 0, 0, 0.06);
    for (const z of [-10, 0, 10]) this.put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 4, 0.3, 0.6), glow(0xc77dff)), loc, 0, z, H - 0.4);
    for (const x of [-18, -12]) {
      this.put(mesh(new THREE.BoxGeometry(4, 7, 2.5), toon(0x5b5870), 0.06), loc, x, -13, 3.5);
      for (let k = 0; k < 3; k++) this.put(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8), glow([0x7dff3a, 0xff2e88, 0x2ec4ff][k])), loc, x - 1.2 + k * 1.2, -12, 5.5);
    }
    // Dr. Zbornak's station (dressed in settlements.js dressLabInside): low dais on the hall's right,
    // behind his waist-high workbench, facing the door
    const docX = 15.5, docZ = 1.6;
    this.put(makeFigure({ suit: 0xffffff, helmet: 0xfff4e0, visor: 0x7dff3a }).root, loc, docX, docZ, 0.3, 0);
    hang(loc, nameTag(textSprite('DR. ZBORNAK', { color: '#7dff3a', size: 50, scale: 0.35 }), 'DR. ZBORNAK', '#7dff3a'), docX, 3.1, docZ);
    // the reactor
    const rx = -2, rz = -3;
    this.put(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, H - 1, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })), loc, rx, rz, H / 2);
    for (const y of [0.6, H - 1]) this.put(mesh(new THREE.CylinderGeometry(3.8, 3.8, 1.2, 28), toon(0x3a3550), 0.08), loc, rx, rz, y);
    this.col(loc, { type: 'cyl', x: rx, z: rz, y0: -1, y1: H, r: 3.6 });
    const core = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), glow(0xff2e88));
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.18, 8, 32), glow(0x7dff3a));
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 32), glow(0x2ee6ff));
    core.add(orb, ringA, ringB);
    this.put(core, loc, rx, rz, H / 2, 0, true);
    this.reactor = { loc, core, orb, ringA, ringB, spin: 1, flash: 0, base: H / 2 };
    loc.group.updateMatrixWorld(true);
    // splice pod: step in with a full jar, come out… improved
    const px = -16, pz = 1;
    this.put(mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.8, 20), toon(0x3a3550), 0.08), loc, px, pz, 0.4);
    this.put(mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 20), toon(0x3a3550), 0.08), loc, px, pz, 5.6);
    this.put(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 4.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dff3a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })), loc, px, pz, 3.1);
    this.put(new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 6, 24).rotateX(Math.PI / 2), glow(0x7dff3a)), loc, px, pz, 0.9);
    hang(loc, textSprite('SPLICE POD', { color: '#7dff3a', size: 50, scale: 0.35 }), px, 7.4, pz);
    // chimera holding pen out front, terminal at its gate
    const pen = { x0: 28, z0: 22, x1: 62, z1: 64 };
    const rail = toon(0xffd23f), postM = toon(0x3a3550);
    const fence = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.ceil(len / 4);
      for (let i = 0; i <= n; i++) this.put(mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 6), postM, 0.04), loc, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 1.1);
      this.put(mesh(new THREE.BoxGeometry(0.15, 0.25, len), rail, 0.03), loc, (ax + bx) / 2, (az + bz) / 2, 1.7, Math.atan2(bx - ax, bz - az));
      this.col(loc, { type: 'box', x: (ax + bx) / 2, y: 1.1, z: (az + bz) / 2, hx: Math.abs(bx - ax) / 2 + 0.2, hy: 1.1, hz: Math.abs(bz - az) / 2 + 0.2 });
    };
    fence(pen.x0, pen.z1, pen.x1, pen.z1);
    fence(pen.x1, pen.z0, pen.x1, pen.z1);
    fence(pen.x0, pen.z0 + 8, pen.x0, pen.z1);
    fence(pen.x0 + 8, pen.z0, pen.x1, pen.z0);
    // (gate terminal kiosk: settlements.js penTerminal)
    hang(loc, textSprite('HOLDING PEN', { color: '#7dff3a', size: 50, scale: 0.35 }), pen.x0 - 2, 5.6, pen.z0 - 2);
    loc.group.updateMatrixWorld(true);
    this.lab = { loc, reactor: this.toWorld(loc, rx, 2, rz), scientist: this.toWorld(loc, docX, 0, docZ + 4.5), pod: this.toWorld(loc, px, 1, pz), penTerm: this.toWorld(loc, pen.x0 - 2, 0, pen.z0 - 2), half: { w: W, d: D, h: H } };
    // permanent scene light (never added/removed, so shaders don't recompile)
    this.reactorLight = new THREE.PointLight(0xff2e88, 0, 60, 1.5);
    this.reactorLight.position.copy(this.toWorld(loc, rx, H / 2, rz));
    this.scene.add(this.reactorLight);
    dressLab(this, loc, { W, D, H });
    dressLabInside(this, loc, { W, D, H, docX, docZ });
  }

  checker() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e4f4'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#3a3550'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 8);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  buildMonolith(loc) {
    this.put(mesh(new THREE.BoxGeometry(8.4, 36, 2.2), new THREE.MeshBasicMaterial({ color: 0x050308 }), 0.25), loc, 0, 0, 18);
    this.col(loc, { type: 'box', x: 0, y: 18, z: 0, hx: 4.2, hy: 18, hz: 1.1 });
    const halo = new THREE.Mesh(new THREE.RingGeometry(22, 23.5, 72), new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2;
    this.put(halo, loc, 0, 0, 0.2);
    this.monolith = { loc, pos: this.toWorld(loc, 0, 2, 0), cd: 0, halo };
    dressMonolith(this, loc);
    // transit pad goes past the dig's berm, clear of Meridian's launch complex site
    (loc.keep ||= []).push({ x: 0, z: 0, r: 42 }, { x: loc.r * 1.25, z: 0, r: 34 });
  }

  // Glowing crystal samples across the sunlit side, for the jar.
  buildCrystals() {
    const P = this.planet;
    const rr = mulberry32(5150);
    this.crystals = [];
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mats = [glow(0x2ee6ff), glow(0x7dff6a), glow(0xc77dff)];
    for (let tries = 0; tries < 2000 && this.crystals.length < 150; tries++) {
      const u = rr() * 2 - 1, th = rr() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      const d = new THREE.Vector3(sq * Math.cos(th), u, sq * Math.sin(th));
      if (d.dot(SUN) < 0.1) continue;
      if (this.locations.some((l) => arcDist(d, l.dir) < (l.zoneR || l.r) * 1.5)) continue;
      const p = P.ground(d, new THREE.Vector3());
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(geo, mats[k % 3]);
        m.scale.set(0.5, 1.2 + rr(), 0.5);
        m.position.set((rr() - 0.5) * 1.6, 0.8, (rr() - 0.5) * 1.6);
        m.rotation.set((rr() - 0.5) * 0.6, rr() * 3, (rr() - 0.5) * 0.6);
        g.add(m);
      }
      g.position.copy(p);
      frameQuat(d, new THREE.Vector3(1, 0, 0), g.quaternion);
      g.visible = false;
      this.scene.add(g);
      this.crystals.push({ pos: p, mesh: g, taken: false });
    }
  }

  // Black lakes: still dark pools in crater floors, mostly on the dark side.
  buildLakes() {
    const P = this.planet;
    const picks = P.craters.filter((c) => c.R > 65 && c.R < 190 && SUN.dot(c.d) < 0.15 && !c.peak) // (a central peak would make an island)
      .filter((c) => this.locations.every((l) => arcDist(c.d, l.dir) > (l.zoneR || l.r) * 2 + c.R));
    const rr = mulberry32(31);
    const chosen = [];
    for (const c of picks) {
      if (chosen.length >= 40) break;
      if (rr() < 0.25 || chosen.some((o) => arcDist(o.d, c.d) < 450)) continue;
      chosen.push(c);
    }
    const mat = this.lakeMat = lakeMaterial();
    this.lakes = [];
    for (const c of chosen) {
      const s0 = P.surface(c.d.clone().multiplyScalar(P.R));
      // fill only to the rim's lowest point, so the pool never overhangs
      const dirs = [];
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; dirs.push(c.e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(c.e2, Math.sin(a))); }
      const along = (t, r) => { const a = r / P.R; return P.surface(c.d.clone().multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a)).multiplyScalar(P.R)); };
      let rimMin = Infinity;
      for (const t of dirs) { let m = -Infinity; for (let r = 5; r < c.R * 1.4; r += 5) m = Math.max(m, along(t, r)); rimMin = Math.min(rimMin, m); }
      const level = Math.min(s0 + c.depth * 0.32, rimMin - 1.5);
      if (level < s0 + 1.2 || this.lakes.length >= 16) continue;
      // trace the real shoreline all round, so the pool fills the valley's shape
      const N = 64;
      const shore = [];
      let rad = Infinity, maxR = 0;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const t = c.e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(c.e2, Math.sin(a));
        let r = 4;
        while (r < c.R * 1.4 && along(t, r) <= level) r += 1.5;
        shore.push(r);
        rad = Math.min(rad, r);
        maxR = Math.max(maxR, r);
      }
      if (rad < 20) continue;
      const lake = { d: c.d.clone(), e1: c.e1.clone(), e2: c.e2.clone(), level, rad, shore, cos: Math.cos((maxR + 2) / P.R), name: 'Black Lake' };
      // curved surface at the liquid level; rim tucked just under the banks
      const RINGS = 10;
      const pos = [], uv = [], idx = [];
      pos.push(...c.d.clone().multiplyScalar(level + 0.05).toArray()); uv.push(0.5, 0.5);
      for (let k = 1; k <= RINGS; k++) {
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const r = ((shore[i] + 1.5) * k) / RINGS;
          const t = c.e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(c.e2, Math.sin(a));
          const ang = r / P.R;
          const dir = c.d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang));
          pos.push(...dir.multiplyScalar(level + 0.05).toArray());
          const f = (k / RINGS) * 0.5;
          uv.push(0.5 + Math.cos(a) * f, 0.5 + Math.sin(a) * f);
        }
      }
      for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
      for (let k = 1; k < RINGS; k++) {
        const r0 = 1 + (k - 1) * N, r1 = 1 + k * N;
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          idx.push(r0 + i, r1 + i, r1 + j, r0 + i, r1 + j, r0 + j);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      mat.side = THREE.DoubleSide;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      lake.mesh = m;
      this.lakes.push(lake);
      P.lakes.push(lake);
    }
  }

  updateFigures(dt) {
    for (const f of this.figures) {
      if (f.civ) continue; // knocked about, fleeing or cleared: civilians.js owns them
      const loc = f.loc;
      f.root.visible = !f.captured && loc.active && loc.camDist < 450;
      if (!f.root.visible) continue;
      if (this._camPos) {
        const hulls = (f.inks ||= []);
        if (!hulls.length) f.root.traverse((o) => { if (o.userData.isInk) hulls.push(o); });
        const e = f.root.matrixWorld.elements, cp = this._camPos;
        const near = Math.hypot(e[12] - cp.x, e[13] - cp.y, e[14] - cp.z) < (f.inkOn === false ? FIG_INK_DIST : FIG_INK_DIST + 10);
        if (near !== f.inkOn) { f.inkOn = near; for (const o of hulls) o.visible = near; }
      }
      const R = this.curveR(loc), p = R ? f.fp : f.root.position;
      if (f.kind === 'kid') {
        f.hop -= dt;
        if (f.vy === 0 && f.hop <= 0) { f.vy = 3 + Math.random() * 3; f.hop = 0.5 + Math.random(); }
        if (f.vy !== 0 || p.y > 0) {
          f.vy -= 1.62 * 2 * dt;
          p.y += f.vy * dt;
          if (p.y <= 0) { p.y = 0; f.vy = 0; }
        }
      }
      if (f.wait > 0) {
        f.wait -= dt;
        if (f.vendor) { // (serving: forearms forward and a gentle swing)
          f.phase += dt * 2.2;
          if (f.armL) { f.armL.rotation.x = -0.7 + Math.sin(f.phase) * 0.3; f.armR.rotation.x = -0.7 + Math.sin(f.phase + 1.9) * 0.3; }
        }
        if (R) this.poseFigure(f);
        continue;
      }
      const dx = f.target.x - p.x, dz = f.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1) {
        if (f.area) {
          f.area(f.target, f); // (elsewhere in its own patch)
          if (f.vendor) p.copy(f.target); // (a vendor's patch is its post, at its own height)
        } else {
          const a = Math.random() * Math.PI * 2, rr = (0.25 + Math.random() * 0.6) * loc.r;
          f.target.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        }
        f.wait = f.kind === 'soldier' ? 0.5 : 1 + Math.random() * 4;
        if (R) this.poseFigure(f);
        continue;
      }
      const sp = f.kind === 'kid' ? 2.5 : f.kind === 'soldier' ? 2.2 : 1.4;
      const k = Math.min(d, sp * dt) / d;
      p.x += dx * k; p.z += dz * k;
      f.yaw = Math.atan2(dx, dz);
      if (!R) f.root.rotation.y = f.yaw;
      f.phase += dt * 6;
      f.legL.rotation.x = Math.sin(f.phase) * 0.6;
      f.legR.rotation.x = -Math.sin(f.phase) * 0.6;
      if (f.armL) { f.armL.rotation.x = -Math.sin(f.phase) * f.swing; f.armR.rotation.x = Math.sin(f.phase) * f.swing; }
      if (f.kind !== 'kid') p.y = Math.abs(Math.sin(f.phase)) * 0.15;
      if (R) this.poseFigure(f);
    }
  }
}
