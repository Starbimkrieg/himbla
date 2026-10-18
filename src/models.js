import * as THREE from 'three';
import { toon, ink, glow, glowShared, inkMat, inkMatNear } from './toon.js';
import { pixelFont } from './fonts.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { waterMesh } from './fountainFx.js';
// The model files (exported from Blender) are inlined as data URIs, so the desktop build, which runs from file://,
// can load them without fetch. Each one is imported on demand, which makes it a chunk of its own (as outposts.glb is):
// the game's code stays small, a change to the code doesn't make anyone download the models again, and each model is
// cached on its own. Boot asks for the ones the world is built from all at once.
const GLB = {
  runner: () => import('./assets/runner.glb?inline'),
  ships: () => import('./assets/ships.glb?inline'),
  skimmer: () => import('./assets/skimmer.glb?inline'),
  lightbike_a: () => import('./assets/lightbike_a.glb?inline'),
  lightbike_b: () => import('./assets/lightbike_b.glb?inline'),
  skimmer_a: () => import('./assets/skimmer_a.glb?inline'),
  skimmer_b: () => import('./assets/skimmer_b.glb?inline'),
  warrig: () => import('./assets/warrig.glb?inline'),
  rover: () => import('./assets/rover.glb?inline'),
  interceptor: () => import('./assets/interceptor.glb?inline'),
  apc: () => import('./assets/apc.glb?inline'),
  landtrain: () => import('./assets/landtrain.glb?inline'),
  crane: () => import('./assets/crane.glb?inline'),
  gantry: () => import('./assets/gantry.glb?inline'),
  garage: () => import('./assets/garage.glb?inline'),
  slots: () => import('./assets/slots.glb?inline'),
  casino: () => import('./assets/casino.glb?inline'),
  blackjack: () => import('./assets/blackjack.glb?inline'),
  claw: () => import('./assets/claw.glb?inline'),
  dish: () => import('./assets/dish.glb?inline'),
  engine: () => import('./assets/engine.glb?inline'),
  briefcase: () => import('./assets/briefcase.glb?inline'),
  plinko: () => import('./assets/plinko.glb?inline'),
  hovercar: () => import('./assets/hovercar.glb?inline'),
  duck: () => import('./assets/duck.glb?inline'),
  hall: () => import('./assets/hall.glb?inline'),
  lot: () => import('./assets/lot.glb?inline'),
  'downs-stand': () => import('./assets/downs-stand.glb?inline'),
  'downs-club': () => import('./assets/downs-club.glb?inline'),
  'downs-course': () => import('./assets/downs-course.glb?inline'),
  'downs-stalls': () => import('./assets/downs-stalls.glb?inline'),
  'downs-arcade': () => import('./assets/downs-arcade.glb?inline'),
  'downs-screen': () => import('./assets/downs-screen.glb?inline'),
  'downs-fair': () => import('./assets/downs-fair.glb?inline'),
  'downs-stable': () => import('./assets/downs-stable.glb?inline'),
  'downs-crowd': () => import('./assets/downs-crowd.glb?inline'),
};

// A model file can be compressed (tools/optimize-glb.mjs: quantized, then meshopt-coded: about a third of the size).
// The decoder does nothing for a plain file. Quantized vertex data comes out of the loader as 16- and 8-bit integers
// (the node's scale puts the size back), but the bakers below transform and merge geometry, which integers can't
// hold, so every attribute becomes a float first.
function toFloat(a) {
  if (a.array instanceof Float32Array) return a;
  const out = new THREE.BufferAttribute(new Float32Array(a.count * a.itemSize), a.itemSize);
  for (let i = 0; i < a.count; i++) {
    out.setX(i, a.getX(i));
    if (a.itemSize > 1) out.setY(i, a.getY(i));
    if (a.itemSize > 2) out.setZ(i, a.getZ(i));
    if (a.itemSize > 3) out.setW(i, a.getW(i));
  }
  return out;
}
const loadGlb = async (name, url) => { // (url: a file to load instead of the bundled one; the dev viewer's `?ships=`)
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url || (await GLB[name]()).default);
  gltf.scene.traverse((o) => { if (o.isMesh) for (const k of Object.keys(o.geometry.attributes)) o.geometry.setAttribute(k, toFloat(o.geometry.attributes[k])); });
  return gltf;
};
import { Kit, T as KT, G as KG } from './outpostModels.js';
import { FACTIONS } from './locations.js';

function part(geo, mat, x = 0, y = 0, z = 0, outline = 0.05) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) ink(m, outline);
  return m;
}

// ---- runner geometry: built once and shared by the player, pirate skaters and story NPCs ----
let RUNNER_GEO = null;
const SCARF_LINK = 0.32, SCARF_N = 4;
const v2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
function runnerGeo() {
  if (RUNNER_GEO) return RUNNER_GEO;
  // a flat ribbon that narrows and ripples towards its tail
  const scarf = new THREE.BoxGeometry(0.22, 0.04, 1.3, 1, 1, 8);
  const sp = scarf.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const t = (0.65 - sp.getZ(i)) / 1.3;
    sp.setX(i, sp.getX(i) * (1 - 0.4 * t));
    sp.setY(i, sp.getY(i) + Math.sin(t * Math.PI * 1.6) * 0.05 * t);
  }
  scarf.computeVertexNormals();
  // the scarf is a chain of links (see ScarfSim); each link a short tapered ribbon from z=0 to z=-L
  const links = [0, 1, 2, 3].map((k) => {
    const g = new THREE.BoxGeometry(0.22 * (1 - k * 0.1), 0.035, SCARF_LINK + 0.04, 1, 1, 2).translate(0, 0, -SCARF_LINK / 2);
    return g;
  });
  RUNNER_GEO = {
    scarfLinks: links,
    // one smooth lathe per limb: hip/thigh/knee/calf/ankle, shoulder/bicep/elbow/forearm/wrist
    leg: new THREE.LatheGeometry(v2([[0, -0.8], [0.085, -0.79], [0.105, -0.72], [0.118, -0.62], [0.122, -0.54], [0.11, -0.45], [0.124, -0.36], [0.145, -0.2], [0.155, -0.06], [0.14, 0.04], [0.09, 0.1], [0, 0.12]]), 10),
    arm: new THREE.LatheGeometry(v2([[0, -0.56], [0.075, -0.55], [0.086, -0.48], [0.096, -0.4], [0.087, -0.3], [0.1, -0.22], [0.114, -0.1], [0.12, 0], [0.1, 0.08], [0, 0.12]]), 10),
    // pelvis, hips, waist, ribs, chest, shoulders, neck (flattened front-to-back by the mesh)
    torso: new THREE.LatheGeometry(v2([[0, -0.02], [0.16, -0.01], [0.25, 0.04], [0.29, 0.14], [0.255, 0.32], [0.29, 0.5], [0.34, 0.68], [0.335, 0.8], [0.29, 0.92], [0.2, 1.0], [0.14, 1.05], [0, 1.07]]), 16),
    kneePad: new THREE.SphereGeometry(0.08, 8, 6),
    boot: new RoundedBoxGeometry(0.27, 0.19, 0.44, 2, 0.08),
    cuff: new THREE.CylinderGeometry(0.13, 0.135, 0.08, 12),
    chassis: new RoundedBoxGeometry(0.21, 0.045, 0.6, 1, 0.02),
    rail: new THREE.CapsuleGeometry(0.032, 0.62, 3, 8).rotateX(Math.PI / 2),
    belt: new THREE.TorusGeometry(0.262, 0.042, 6, 20).rotateX(Math.PI / 2),
    buckle: new RoundedBoxGeometry(0.15, 0.1, 0.05, 1, 0.02),
    plate: new RoundedBoxGeometry(0.42, 0.28, 0.1, 2, 0.04),
    lightDot: new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10).rotateX(Math.PI / 2),
    pack: new RoundedBoxGeometry(0.52, 0.62, 0.26, 2, 0.08),
    packLid: new RoundedBoxGeometry(0.4, 0.06, 0.04, 1, 0.015),
    nozzle: new THREE.CylinderGeometry(0.075, 0.1, 0.16, 10),
    flame: new THREE.CylinderGeometry(0.065, 0.065, 0.02, 10),
    shoulder: new THREE.SphereGeometry(0.15, 12, 8),
    wristCuff: new THREE.CylinderGeometry(0.1, 0.095, 0.07, 10),
    glove: new THREE.SphereGeometry(0.12, 10, 8),
    thumb: new THREE.SphereGeometry(0.05, 6, 5),
    helmet: new THREE.SphereGeometry(0.36, 20, 16),
    visorFrame: new THREE.SphereGeometry(0.37, 20, 10, Math.PI / 2 - 0.95, 1.9, 0.86, 1.22),
    visor: new THREE.SphereGeometry(0.38, 20, 10, Math.PI / 2 - 0.85, 1.7, 0.94, 1.06),
    glint: new THREE.SphereGeometry(0.05, 8, 6),
    pod: new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14).rotateZ(Math.PI / 2),
    rim: new THREE.TorusGeometry(0.275, 0.035, 6, 22).rotateX(Math.PI / 2),
    antenna: new THREE.CylinderGeometry(0.02, 0.02, 0.4),
    bead: new THREE.SphereGeometry(0.06, 8, 6),
    lampHousing: new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10).rotateX(Math.PI / 2),
    lens: new THREE.SphereGeometry(0.05, 8, 6),
    band: new THREE.TorusGeometry(0.34, 0.06, 6, 16).rotateX(Math.PI / 2),
    scarf,
    collar: new THREE.TorusGeometry(0.235, 0.07, 6, 16).rotateX(Math.PI / 2),
  };
  return RUNNER_GEO;
}
const GLINT_M = new THREE.MeshBasicMaterial({ color: 0xffffff });
const LENS_M = new THREE.MeshBasicMaterial({ color: 0xfff6a8 });

// ---- the Blender runner: tools/blender/build_runner.py exports src/assets/runner.glb ----
// Each mesh in the file hangs off a pivot empty (legL, legR, torso, head, armL, armR, scarfLinks),
// has one material named after a colour slot (suit, accent, helmet, visor, dark, metal, glow, skate,
// scarf, collar, lens, glint) and an "ink" extra (outline thickness). At load the parts are baked
// into their pivot's frame and merged per pivot and slot, and every inked part grows a shell along
// its smoothed normals (hugs the shape far better than ink()'s bounding-box scaling); the shells of
// a pivot merge into one mesh. A runner is then ~40 draw calls however detailed the model is, and
// each slot still gets the runner's own material, so outfits recolour it exactly as before.
// If the file can't be loaded, makeRunner falls back to the primitive build below.
let RUNNER_PARTS = null;
const PIVOTS = ['legL', 'legR', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR']; // (foreL/foreR: forearms, on the elbows)
const EXTRA_PIVOTS = ['padL', 'padR', 'band', 'antenna', 'crest']; // (outfit extras, hung on by cosmetics.js; optional, so an older file still loads)
const NO_SHADOW = new Set(['glow', 'lens', 'glint']);
export async function loadRunnerParts() {
  try {
    const gltf = await loadGlb('runner');
    RUNNER_PARTS = bakeRunnerParts(gltf.scene);
  } catch (e) {
    console.warn('runner.glb unavailable, using the primitive runner', e);
  }
}

function bakeRunnerParts(scene) {
  scene.updateMatrixWorld(true);
  const groups = new Map(); // key -> { slots: Map(slot -> [geo]), ink: [geo] }
  const group = (key) => {
    if (!groups.has(key)) groups.set(key, { slots: new Map(), ink: [] });
    return groups.get(key);
  };
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  for (const name of [...PIVOTS, ...EXTRA_PIVOTS, 'scarfLinks']) {
    const pivot = scene.getObjectByName(name);
    if (!pivot) {
      if (EXTRA_PIVOTS.includes(name)) continue;
      throw new Error('runner.glb has no pivot ' + name);
    }
    inv.copy(pivot.matrixWorld).invert();
    for (const o of pivot.children) {
      if (!o.isMesh) continue;
      // scarf parts belong to the chain link their name starts with (scarf3_tassel0 -> link 3)
      const key = name === 'scarfLinks' ? 'scarf' + (/^scarf(\d)/.exec(o.name) || [0, 0])[1] : name;
      const slot = o.material.name;
      rel.multiplyMatrices(inv, o.matrixWorld);
      const src = o.geometry; // (the glTF exporter always writes indexed triangles)
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', src.attributes.position.clone());
      geo.setAttribute('normal', src.attributes.normal.clone());
      geo.setIndex(src.index.clone());
      geo.applyMatrix4(rel);
      const g = group(key);
      if (!g.slots.has(slot)) g.slots.set(slot, []);
      g.slots.get(slot).push(geo);
      const t = o.userData.ink || 0;
      if (t > 0) g.ink.push(inkShellGeo(geo, t));
    }
  }
  const out = {};
  for (const [key, g] of groups) {
    const parts = [...g.slots].map(([slot, geos]) => ({ slot, geo: mergeGeometries(geos) }));
    let ink = null;
    if (g.ink.length) {
      const base = mergeGeometries(g.ink);
      // thin and fat keep their offset apart from the surface (inkMatNear scales it with the camera's distance); scan is the old
      // surface-plus-offset shell, which the threat scanner's red line is built from (main.js scanGeo)
      ink = { thin: shellOff(base, 1), fat: shellOff(base, 4), scan: shellAt(base, 1) };
    }
    out[key] = { parts, ink };
  }
  return out;
}

// A part's outline shell: its triangles with an `off` attribute = smoothed normal * thickness.
// Normals are averaged over vertices that share a position, so seams don't crack open.
function inkShellGeo(geo, t) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const sum = new Map();
  const keyOf = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i);
    const s = sum.get(k) || [0, 0, 0];
    s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
    sum.set(k, s);
  }
  const off = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sum.get(keyOf(i));
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    off[i * 3] = (s[0] / l) * t; off[i * 3 + 1] = (s[1] / l) * t; off[i * 3 + 2] = (s[2] / l) * t;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos.clone());
  g.setAttribute('off', new THREE.BufferAttribute(off, 3));
  g.setIndex(geo.index.clone());
  return g;
}

// the same shell as a geometry whose `position` is the surface and whose `off` attribute is k times the offset (inkMatNear adds it back,
// scaled by the camera's distance); its bounding sphere is grown by the longest offset
function shellOff(base, k) {
  const o = base.attributes.off.array, off = new Float32Array(o.length);
  let mx = 0;
  for (let i = 0; i < o.length; i += 3) {
    off[i] = o[i] * k; off[i + 1] = o[i + 1] * k; off[i + 2] = o[i + 2] * k;
    mx = Math.max(mx, Math.hypot(off[i], off[i + 1], off[i + 2]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('off', new THREE.BufferAttribute(off, 3));
  g.setIndex(base.index);
  g.computeBoundingSphere();
  g.boundingSphere.radius += mx;
  return g;
}

// the shell pushed out k times its thickness (k = 4 is the fat red outline of a marked enemy)
function shellAt(base, k) {
  const p = base.attributes.position.array, o = base.attributes.off.array;
  const a = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) a[i] = p[i] + o[i] * k;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  g.setIndex(base.index);
  g.computeBoundingSphere();
  return g;
}

// An outline shell for any indexed geometry (pushed out along smoothed normals, so it hugs bent
// tubes and squashed spheres that ink()'s bounding-box scaling can't). Used by the chimeras.
export function inkShell(geo, t) {
  return shellAt(inkShellGeo(geo, t), 1);
}

// One of the runner's outfit extras ('padL', 'padR', 'band': see build_runner.py) as a group of meshes, or null if
// the file has none. `mats` maps a colour slot to the material to wear (a slot it leaves out takes `fallback`).
// The meshes and the outline shell are the caller's to remove (they are plain children of the group).
export function runnerExtra(key, mats, fallback = null) {
  const B = RUNNER_PARTS && RUNNER_PARTS[key];
  if (!B) return null;
  const g = new THREE.Group();
  for (const { slot, geo } of B.parts) {
    const mat = mats[slot] || fallback;
    if (!mat) continue;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
  }
  if (B.ink) {
    const h = new THREE.Mesh(B.ink.thin, inkMatNear);
    h.castShadow = false;
    h.userData.isInk = true;
    h.userData.inkGeo = B.ink;
    h.userData.inkMat = inkMatNear;
    g.add(h);
  }
  return g;
}

// Hang a baked pivot's parts (and its one outline shell) on a group.
function addBaked(target, key, mats) {
  const B = RUNNER_PARTS[key];
  for (const { slot, geo } of B.parts) {
    const m = new THREE.Mesh(geo, mats[slot]);
    m.castShadow = !NO_SHADOW.has(slot);
    target.add(m);
  }
  if (B.ink) {
    const h = new THREE.Mesh(B.ink.thin, inkMatNear);
    h.castShadow = false;
    h.userData.isInk = true;
    // the threat scanner swaps in the fat shell instead of scaling this one (see main.js); inkMat is what it puts back
    h.userData.inkGeo = B.ink;
    h.userData.inkMat = inkMatNear;
    target.add(h);
  }
}

// The Moon-runner (also used for pirate skaters and story NPCs). Pivot at the feet.
// Smooth lathed limbs and torso, rounded boots/gloves/backpack and a shelled visor, but the
// same pivots (legL/legR at the hips, armL/armR at the shoulders, head on the torso) and
// dimensions as always, because cosmetics, mutations, cargo and story props hang off them.
// The scarf: a smooth ribbon (a rope of 12 points, verlet-simulated in the torso's frame) that
// leaves the collar a little off to the right, so it trails down the side of whatever's on your
// back rather than over the top of it. Gravity pulls it down, the airflow from moving streams it
// back, body acceleration swings it, and a flutter runs down it at speed. It's kept behind your
// back and pushed out of the gear on it (pack, cargo crates). The look comes from the outfit
// (model.scarfStyle, set by dressRunner): length, width and one or two tails. The baked link
// chain stays on runners nobody simulates (distant figures); a simulated one hides it.
export const SCARF_STYLE = { len: 1.3, w: 0.22, tails: 1 };
const _sq = new THREE.Quaternion(), _sg = new THREE.Vector3(), _sw = new THREE.Vector3(), _sa = new THREE.Vector3();
const _st = new THREE.Vector3(), _ss = new THREE.Vector3(), _sn = new THREE.Vector3(), _sx = new THREE.Vector3(1, 0, 0), _sy = new THREE.Vector3(0, 1, 0);
const SCARF_PTS = 12;
const SCARF_GAP = 0.034; // two ribbons lying on each other: 2 x 0.018 thick, less a hair
// The scarf's rest channel (torso frame; +x is the runner's left, which a viewer behind sees on the left). The tails come out of
// the neck on its left-back, under the helmet's rim, run a short way over the top of the shoulder, slip off it behind the arm and
// hang down the left side of the back, the second lying on the first. At rest, and at a walk, a soft spring holds the tails in it; it
// lets go as the airflow rises, so a skater's scarf streams out behind, over the pack if need be.
const ease01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const SCARF_GUIDES = [0, 1].map((k) => {
  // from the left-back of the collar (50 degrees round from straight back, under the helmet's rim) a short way over the top of the shoulder...
  const rho = 0.29, rad = Math.PI / 180, g = [];
  // (both start at the same point, inside the knot; the second tail lies on the first by standing a ribbon's thickness further out, not up:
  // a second root higher than the first stuck out of the knot's top as a diagonal spike)
  for (const [deg, y, out] of [[50, 0.945, 0], [59, 0.935, 0.5], [68, 0.915, 1]]) g.push([(rho + 0.03 * k * out) * Math.sin(deg * rad), y, -(rho + 0.03 * k * out) * Math.cos(deg * rad)]);
  const e = g[2];
  // ...then off it behind the arm, and down the left side of the back; the second tail a layer further back
  g.push([e[0] + 0.05, 0.875 + 0.02 * k, e[2] - 0.08 - 0.03 * k], [0.36 + 0.01 * k, 0.76, -0.235 - 0.045 * k], [0.37 + 0.01 * k, 0.55, -0.27 - 0.045 * k]);
  const cum = g.reduce((a, q, i) => { a.push(i ? a[i - 1] + Math.hypot(q[0] - g[i - 1][0], q[1] - g[i - 1][1], q[2] - g[i - 1][2]) : 0); return a; }, []);
  return { g, cum };
});
// tail k's channel `s` metres along it; past the end it hangs straight down
function scarfGuide(k, s, out) {
  const { g: G, cum: C } = SCARF_GUIDES[Math.min(k, 1)], n = G.length - 1;
  if (s >= C[n]) return out.set(G[n][0], G[n][1] - (s - C[n]), G[n][2]);
  let j = 0;
  while (C[j + 1] < s) j++;
  const t = (s - C[j]) / (C[j + 1] - C[j]);
  return out.set(G[j][0] + (G[j + 1][0] - G[j][0]) * t, G[j][1] + (G[j + 1][1] - G[j][1]) * t, G[j][2] + (G[j + 1][2] - G[j][2]) * t);
}
// What the scarf slides over: the pack, and a crate or two on top of it (Player.setCargo), as rounded boxes in the torso frame:
// [half-width, bottom, top, back, front, corner radius]. A box is clearance included: the tail rides on its surface.
const PACK_BOX = [0.29, 0.2, 0.935, -0.51, -0.18, 0.1];
const CRATE_BOX = [0.39, 0.3, 0.95, -1.11, -0.34, 0.03];  // one crate: 0.7 across, 0.56 high, 0.62 above the hip, 0.72 behind
const TWIN_BOX = [0.39, 0.3, 1.45, -1.11, -0.34, 0.03];   // the Twin Cradle's second crate stacked on it

// one tail: a strip of box sections (4 verts a point), and the same again for its ink shell
function scarfStrip(n) {
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4, b = a + 4;
    for (const [p, q] of [[0, 1], [1, 3], [3, 2], [2, 0]]) idx.push(a + p, b + p, b + q, a + p, b + q, a + q);
  }
  const e = (n - 1) * 4;
  idx.push(0, 2, 3, 0, 3, 1, e, e + 1, e + 3, e, e + 3, e + 2); // end caps
  const mk = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
    g.setIndex(idx);
    return g;
  };
  return { geo: mk(), ink: mk() };
}

// Keep point q out of the gear boxes (rounded boxes, see PACK_BOX): out through the top, the back or a side, never through the front (that
// is your back) or the bottom, so a tail can't end up squeezed between the pack and you or under it. `po` (where q was) decides, if it can be told.
function gearPush(q, po, boxes) {
  for (const B of boxes) {
    const hx = B[0], yl = B[1], yh = B[2], zb = B[3], zf = B[4], br = Math.min(B[5], hx, (yh - yl) / 2, (zf - zb) / 2);
    const cy = (yl + yh) / 2, cz = (zb + zf) / 2;
    const dx = Math.abs(q.x) - (hx - br), dy = Math.abs(q.y - cy) - ((yh - yl) / 2 - br), dz = Math.abs(q.z - cz) - ((zf - zb) / 2 - br);
    const out = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
    if (out + Math.min(Math.max(dx, dy, dz), 0) - br >= 0) continue; // (outside the rounded box)
    if (po.y >= yh) q.y = yh;
    else if (po.z <= zb) q.z = zb;
    else if (Math.abs(po.x) >= hx) q.x = Math.sign(po.x) * hx;
    else {
      const dTop = yh - q.y, dRear = q.z - zb, dSide = hx - Math.abs(q.x);
      if (dTop <= dRear && dTop <= dSide) q.y = yh;
      else if (dSide <= dRear) q.x = Math.sign(q.x || 1) * hx;
      else q.z = zb;
    }
    po.lerp(q, 0.05); // (a little friction: it settles on the pack rather than skating off it)
  }
}

export class ScarfSim {
  constructor(model) {
    this.m = model;
    this.prevVel = null;
    this.t = Math.random() * 10;
    this.tails = null;
    this.key = '';
  }

  build() {
    const m = this.m;
    const st = m.scarfStyle || SCARF_STYLE;
    this.key = JSON.stringify(st);
    if (this.tails) for (const t of this.tails) { t.mesh.removeFromParent(); t.mesh.geometry.dispose(); t.inkMesh.geometry.dispose(); }
    const links = m.scarf.userData.links;
    if (links && links[0]) links[0].visible = false;
    const mat = m.mats ? m.mats.scarf : toon(0xffd23f, { side: THREE.DoubleSide });
    this.tails = [];
    for (let k = 0; k < (st.tails || 1); k++) {
      const len = st.len * (k ? 0.8 : 1);
      const { geo, ink: ig } = scarfStrip(SCARF_PTS);
      const mesh = new THREE.Mesh(geo, mat);
      const inkMesh = new THREE.Mesh(ig, inkMat);
      inkMesh.userData.isInk = true;
      inkMesh.castShadow = false;
      mesh.add(inkMesh);
      mesh.frustumCulled = inkMesh.frustumCulled = false;
      mesh.castShadow = true;
      m.torso.add(mesh);
      // the root: out of the back of the neck collar, under the helmet's rim: where the channel starts
      const root = scarfGuide(k, 0, new THREE.Vector3());
      const seg = len / (SCARF_PTS - 1);
      const p = [], o = [];
      for (let i = 0; i < SCARF_PTS; i++) { p.push(new THREE.Vector3()); o.push(new THREE.Vector3()); }
      const tgt = p.map((_, i) => scarfGuide(k, i * seg, new THREE.Vector3()));
      const T = { mesh, inkMesh, root, k, tgt, seg, w: st.w * (k ? 0.85 : 1), p, o, phase: k * 0.6 };
      this.hang(T);
      this.tails.push(T);
    }
  }

  // one tail's chain lying in the rest channel, with no motion in it
  hang(T) {
    const { p, o, seg, k } = T;
    for (let i = 0; i < SCARF_PTS; i++) { scarfGuide(k, i * seg, p[i]); o[i].copy(p[i]); }
  }

  // back to hanging at rest, and forget the last velocity (so no swing is read out of a teleport): for
  // when the runner is put somewhere new by a cutscene
  settle() {
    this.prevVel = null;
    for (const T of this.tails || []) this.hang(T);
  }

  // vel: the body's world velocity; up: world up at the body. cargo: how many crates ride on the pack (0, 1, or 2 for the
  // Twin Cradle): the tails slide over the pack, and over the crates too
  update(dt, vel, up, { cargo = 0 } = {}) {
    if (dt <= 0) return;
    const m = this.m;
    if (!this.tails || this.key !== JSON.stringify(m.scarfStyle || SCARF_STYLE)) this.build();
    this.t += dt;
    m.torso.getWorldQuaternion(_sq).invert();
    _sg.copy(up).multiplyScalar(-6).applyQuaternion(_sq); // gravity (stylised: the Moon's is too lazy to read)
    _sw.copy(vel).negate().applyQuaternion(_sq); // relative wind
    const ws = _sw.length();
    _sw.multiplyScalar(0.1 * ws);
    if (_sw.length() > 11) _sw.setLength(11); // (capped, but past gravity's 6 from about 8 m/s: a skater's scarf streams out behind, level, not down the back)
    if (this.prevVel) _sa.copy(vel).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3)).negate().multiplyScalar(0.12).applyQuaternion(_sq);
    else _sa.set(0, 0, 0);
    if (_sa.length() > 20) _sa.setLength(20); // (a respawn or a teleport isn't a swing)
    this.prevVel = (this.prevVel || new THREE.Vector3()).copy(vel);
    // (a faint breeze to the right keeps the tails from lying dead centre)
    const fx = _sg.x + _sw.x + _sa.x, fy = _sg.y + _sw.y + _sa.y, fz = _sg.z + _sw.z + _sa.z;
    const flut = Math.min(0.5, ws / 28);
    const boxes = cargo ? [PACK_BOX, cargo > 1 ? TWIN_BOX : CRATE_BOX] : [PACK_BOX];
    // the pull into the channel: full at a stand or a walk, gone by about 9 m/s; it eases in and out (about a third of a second), so a
    // stop from a sprint settles the tails back instead of snapping them
    this.rw = this.rw ?? 1;
    this.rw += ((1 - ease01((ws - 2.5) / 6.5)) - this.rw) * Math.min(1, dt * 3);
    const rest = this.rw;
    const steps = Math.min(4, Math.ceil(dt / (1 / 120)));
    const h2 = (dt / steps) ** 2;
    for (const T of this.tails) {
      const { p, o, seg } = T;
      for (let s = 0; s < steps; s++) {
        p[0].copy(T.root); o[0].copy(T.root);
        for (let i = 1; i < SCARF_PTS; i++) {
          const u = i / (SCARF_PTS - 1);
          // a ripple travelling down the tail, bigger toward the end and with speed
          const ax = fx + Math.sin(this.t * 11 - i * 0.75 + T.phase) * flut * 22 * u;
          const ay = fy + Math.cos(this.t * 8.3 - i * 0.6 + T.phase) * flut * 16 * u;
          const q = p[i];
          // the channel as a spring (firm near the neck, loose further down so the ends still sway), damped so it settles
          const kk = rest * (i < 5 ? 90 : 14), dmp = 0.96 - rest * (i < 5 ? 0.1 : 0.03), g = T.tgt[i];
          const vx = (q.x - o[i].x) * dmp, vy = (q.y - o[i].y) * dmp, vz = (q.z - o[i].z) * dmp;
          o[i].copy(q);
          q.x += vx + (ax + (g.x - q.x) * kk) * h2; q.y += vy + (ay + (g.y - q.y) * kk) * h2; q.z += vz + (fz + (g.z - q.z) * kk) * h2;
        }
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < SCARF_PTS; i++) {
            const a = p[i - 1], b = p[i];
            _st.subVectors(b, a);
            const d = _st.length() || 1e-6;
            const f = (d - seg) / d;
            if (i === 1) b.addScaledVector(_st, -f);
            else { a.addScaledVector(_st, f * 0.5); b.addScaledVector(_st, -f * 0.5); }
            // a little bending stiffness: two-apart points can't fold together
            if (i >= 2) {
              const c = p[i - 2];
              _st.subVectors(b, c);
              const d2 = _st.length() || 1e-6;
              if (d2 < seg * 1.4) { const f2 = ((d2 - seg * 1.4) / d2) * 0.25; if (i > 2) c.addScaledVector(_st, f2); b.addScaledVector(_st, -f2); }
            }
          }
          for (let i = 1; i < SCARF_PTS; i++) {
            const q = p[i];
            // stay behind your back, and out of the gear on it: rounded boxes (the pack's own shape, the crates') that the tail
            // slides over: out through the nearest face
            if (q.z > -0.18) q.z = -0.18;
            gearPush(q, o[i], boxes);
          }
        }
      }
    }
    // tails lie on each other, never through each other (the later one is the outer layer): each point of the outer tail keeps its
    // distance from the nearest point on the inner tail's chain (not from the point with the same number, which sits somewhere else
    // along a chain of a different length, and made the pair twitch against their springs)
    for (let k = 1; k < this.tails.length; k++) {
      const A = this.tails[k - 1].p, B = this.tails[k].p;
      for (let i = 1; i < SCARF_PTS; i++) {
        let best = 1e9, bj = 1, bt = 0;
        for (let j = 1; j < SCARF_PTS; j++) {
          _st.subVectors(A[j], A[j - 1]);
          const l2 = _st.lengthSq() || 1e-9;
          const t = Math.min(1, Math.max(0, _ss.subVectors(B[i], A[j - 1]).dot(_st) / l2));
          const d2 = _sn.copy(A[j - 1]).addScaledVector(_st, t).distanceToSquared(B[i]);
          if (d2 < best) { best = d2; bj = j; bt = t; }
        }
        const d = Math.sqrt(best);
        if (d >= SCARF_GAP) continue;
        _st.copy(A[bj - 1]).lerp(A[bj], bt);            // (the nearest point on the inner tail)
        _ss.subVectors(B[i], _st);
        if (d < 1e-5) _ss.set(0, 0.7, -0.7); else _ss.divideScalar(d);
        const push = (SCARF_GAP - d) * 0.5;
        B[i].addScaledVector(_ss, push);
        A[bj].addScaledVector(_ss, -push * bt);
        if (bj > 1) A[bj - 1].addScaledVector(_ss, -push * (1 - bt));
      }
    }
    for (const T of this.tails) { for (let i = 1; i < SCARF_PTS; i++) gearPush(T.p[i], T.o[i], boxes); this.draw(T); } // (the pair's push can't drive a tail into the pack)
  }

  draw(T) {
    const { p, w } = T;
    const pa = T.mesh.geometry.attributes.position, ia = T.inkMesh.geometry.attributes.position;
    const th = 0.018, e = 0.018;
    for (let i = 0; i < SCARF_PTS; i++) {
      const u = i / (SCARF_PTS - 1);
      _st.subVectors(p[Math.min(SCARF_PTS - 1, i + 1)], p[Math.max(0, i - 1)]).normalize();
      // the ribbon's width runs across the tail: along the torso's x where it hangs, and horizontally across it where it lies along
      // the collar or the shoulder (so it lies flat there), blended; the sign follows the one before, so it never twists
      _ss.copy(_sx).addScaledVector(_st, -_sx.dot(_st));
      if (_ss.lengthSq() < 0.01) _ss.copy(_sy).addScaledVector(_st, -_sy.dot(_st));
      _ss.normalize();
      _sn.crossVectors(_st, _sy); // (horizontal, across the tail)
      if (_sn.lengthSq() > 0.01) {
        _sn.normalize();
        const flat = 1 - ease01((Math.abs(_st.y) - 0.35) / 0.45);
        if (_sn.dot(_ss) < 0) _sn.negate();
        _ss.lerp(_sn, flat).normalize();
      }
      _sn.crossVectors(_st, _ss);
      // (the first points narrow to the knot's width, so the ribbon gathers into it and its top end is not wider than what it comes out of)
      const hw = (w * (1 - 0.3 * u) * (i === 0 ? 0.5 : i === 1 ? 0.82 : 1) + (u > 0.95 ? 0.025 : 0)) / 2;
      const c = p[i];
      const endK = i === 0 ? -e : i === SCARF_PTS - 1 ? e : 0;
      for (let v = 0; v < 4; v++) {
        const sx = v & 1 ? 1 : -1, sy = v & 2 ? -1 : 1;
        pa.setXYZ(i * 4 + v, c.x + _ss.x * sx * hw + _sn.x * sy * th, c.y + _ss.y * sx * hw + _sn.y * sy * th, c.z + _ss.z * sx * hw + _sn.z * sy * th);
        ia.setXYZ(i * 4 + v,
          c.x + _ss.x * sx * (hw + e) + _sn.x * sy * (th + e) + _st.x * endK,
          c.y + _ss.y * sx * (hw + e) + _sn.y * sy * (th + e) + _st.y * endK,
          c.z + _ss.z * sx * (hw + e) + _sn.z * sy * (th + e) + _st.z * endK);
      }
    }
    pa.needsUpdate = ia.needsUpdate = true;
    T.mesh.geometry.computeVertexNormals();
  }
}

export function makeRunner({
  suit = 0xff4f2e, accent = 0x2ee6ff, helmet = 0xfff4e0, visor = 0x241a5c,
  scarf = 0xffd23f, scale = 1, pirate = false, own = false,
} = {}) {
  const G = runnerGeo();
  const root = new THREE.Group();
  // trick pivot sits at the centre of mass so flips rotate around the body, not the feet
  const trick = new THREE.Group();
  trick.position.y = 1.2;
  root.add(trick);
  const body = new THREE.Group();
  body.position.y = -1.2;
  trick.add(body);
  // `own` gives this runner private materials so it can be recoloured (the player's wardrobe)
  const mk = (c) => (own ? toon(c, {}) : toon(c));
  const suitM = mk(suit), dark = toon(0x221d33), metal = toon(0x3a3550), helmetM = mk(helmet), accentM = mk(accent);
  const glowM = glow(accent);
  const skateM = own ? glow(accent) : glowM;
  const visorM = mk(visor), scarfM = toon(scarf, { side: THREE.DoubleSide }), collarM = mk(scarf);
  const baked = RUNNER_PARTS;
  const mats = { suit: suitM, accent: accentM, helmet: helmetM, visor: visorM, dark, metal, glow: glowM, skate: skateM, scarf: scarfM, collar: collarM, lens: LENS_M, glint: GLINT_M };

  const hip = 0.95;
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.2, hip, 0);
    body.add(leg);
    legs.push(leg);
    if (baked) { addBaked(leg, side < 0 ? 'legL' : 'legR', mats); continue; }
    leg.add(part(G.leg, suitM, 0, 0, 0, 0.045));
    const pad = part(G.kneePad, metal, 0, -0.45, 0.095, 0.02);
    pad.scale.set(1.15, 1, 0.6);
    leg.add(pad);
    leg.add(part(G.cuff, accentM, 0, -0.73, 0.01, 0.025));
    leg.add(part(G.boot, dark, 0, -0.83, 0.07, 0.04));
    leg.add(part(G.chassis, metal, 0, -0.935, 0.07, 0.02));
    const rail = part(G.rail, skateM, 0, -0.972, 0.07, 0.025);
    rail.scale.x = 1.6;
    leg.add(rail);
  }
  const torso = new THREE.Group();
  torso.position.y = hip;
  body.add(torso);
  const cargoSlot = new THREE.Group();
  cargoSlot.position.set(0, 0.62, -0.72);
  torso.add(cargoSlot);
  const head = new THREE.Group();
  head.position.y = 1.18;
  torso.add(head);
  const antenna = new THREE.Group(); // (its own group: an outfit with a halo takes it off, see dressRunner)
  head.add(antenna);
  if (!baked) {
    // primitive fallback (only if runner.glb failed to load)
    const trunk = part(G.torso, suitM, 0, 0, 0, 0.04);
    trunk.scale.z = 0.78;
    torso.add(trunk);
    const belt = part(G.belt, dark, 0, 0.3, 0, 0.02);
    belt.scale.z = 0.8;
    torso.add(belt);
    torso.add(part(G.buckle, accentM, 0, 0.3, 0.215, 0.02));
    const plate = part(G.plate, accentM, 0, 0.64, 0.235, 0.03);
    plate.rotation.x = -0.06;
    torso.add(plate);
    torso.add(part(G.lightDot, glowM, 0.11, 0.67, 0.29, 0));
    // backpack: rounded shell, a lid strip and two thruster nozzles with glowing throats
    torso.add(part(G.pack, dark, 0, 0.6, -0.35, 0.045));
    torso.add(part(G.packLid, accentM, 0, 0.78, -0.48, 0.015));
    for (const side of [-1, 1]) {
      torso.add(part(G.nozzle, metal, side * 0.14, 0.24, -0.38, 0.025));
      torso.add(part(G.flame, glowM, side * 0.14, 0.155, -0.38, 0));
    }
    head.add(part(G.helmet, helmetM, 0, 0, 0, 0.05));
    head.add(part(G.visorFrame, dark, 0, 0, 0, 0));
    head.add(part(G.visor, visorM, 0, 0, 0, 0));
    const glint = part(G.glint, GLINT_M, -0.13, 0.13, 0.33, 0);
    glint.scale.set(1.3, 0.55, 0.35);
    glint.rotation.set(-0.35, -0.35, 0.5);
    glint.castShadow = false;
    head.add(glint);
    for (const side of [-1, 1]) head.add(part(G.pod, accentM, side * 0.352, -0.01, -0.03, 0.02));
    head.add(part(G.rim, dark, 0, -0.215, 0, 0.02));
    antenna.add(part(G.antenna, dark, 0.22, 0.38, -0.1, 0));
    antenna.add(part(G.bead, glowM, 0.22, 0.6, -0.1, 0));
  } else {
    addBaked(torso, 'torso', mats);
    addBaked(head, 'head', mats);
    if (RUNNER_PARTS.antenna) addBaked(antenna, 'antenna', mats);
  }
  if (pirate) {
    const band = runnerExtra('band', { accent: toon(0xd7263d), dark: toon(0x3a0f18) });
    head.add(band || part(G.band, toon(0xd7263d), 0, 0.12, 0, 0.02));
  }

  const arms = [], fores = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.45, 0.85, 0);
    torso.add(arm);
    arms.push(arm);
    // the forearm turns on the elbow, 0.31 below the shoulder; at rest (rotation 0) it is straight
    const fore = new THREE.Group();
    fore.position.y = -0.31;
    arm.add(fore);
    fores.push(fore);
    if (baked) { addBaked(arm, side < 0 ? 'armL' : 'armR', mats); addBaked(fore, side < 0 ? 'foreL' : 'foreR', mats); continue; }
    arm.add(part(G.arm, suitM, 0, 0, 0, 0.04));
    arm.add(part(G.shoulder, helmetM, side * 0.01, 0.0, 0, 0.03));
    fore.add(part(G.wristCuff, accentM, 0, -0.21, 0, 0.02));
    const glove = part(G.glove, dark, 0, -0.32, 0.01, 0.03);
    glove.scale.set(0.95, 1.15, 0.85);
    fore.add(glove);
    fore.add(part(G.thumb, dark, -side * 0.05, -0.29, 0.08, 0.02));
  }

  // Comic scarf streaming behind. The tail leaves from the top of the backpack and is kept above
  // everything worn on the back (pack, cargo crates, jar): see ScarfSim.
  if (!baked) torso.add(part(G.collar, collarM, 0, 0.98, 0, 0.03));
  const scarfPivot = new THREE.Group();
  scarfPivot.position.set(0, 1.04, -0.26);
  torso.add(scarfPivot);
  // a chain of links: each joint is a child group of the previous link, rotated about x
  const scarfLinks = [];
  let parentLink = scarfPivot;
  for (let k = 0; k < SCARF_N; k++) {
    const j = new THREE.Group();
    if (k) j.position.z = -SCARF_LINK;
    if (baked) addBaked(j, 'scarf' + k, mats);
    else j.add(part(G.scarfLinks[k], scarfM, 0, 0, 0, 0.025));
    parentLink.add(j);
    scarfLinks.push(j);
    parentLink = j;
  }
  scarfPivot.userData.links = scarfLinks;
  // resting drape (for figures nobody simulates): over the pack's top edge, then straight down
  [-0.45, -1.05, -0.05, -0.05].forEach((r, k) => { scarfLinks[k].rotation.x = r; });

  // helmet lamp on the right temple (the actual light is owned by the player)
  if (!baked) {
    head.add(part(G.lampHousing, dark, 0.3, 0.15, 0.17, 0.015));
    head.add(part(G.lens, LENS_M, 0.3, 0.15, 0.225, 0));
  }

  root.scale.setScalar(scale);
  return { root, trick, body, bodyBase: -1.2, torso, head, legL: legs[0], legR: legs[1], antenna, armL: arms[0], armR: arms[1], foreL: fores[0], foreR: fores[1], scarf: scarfPivot, cargoSlot, glowM, accent, mats: { suit: suitM, accent: accentM, helmet: helmetM, visor: visorM, scarf: scarfM, collar: collarM, glow: glowM, skate: skateM } };
}

// ---- townsfolk ----
// Civilians share the runner's finish (smooth lathed limbs and torso, rounded shoes and hands, a
// proper head, bold ink hulls) but none of the courier kit. Each figure is ONE skinned mesh plus ONE
// ink-hull skinned mesh (two draw calls, one shadow caster) whatever it wears: every part is baked,
// with its colour as a vertex colour, into a single geometry weighted rigidly to five bones (root,
// legL, legR, armL, armR). The bones are the old pivots, so callers animate legL/legR (and now
// armL/armR) by rotation.x exactly as before. All figures share one material; baked geometries are
// cached by look, so identical figures (soldiers, crowds) share them too.
// Looks are random (or from opts.seed); explicit suit / helmet / visor colours always win: suit is
// the main clothing colour, helmet the headgear, and a visor means a sealed helmet.
let FIG_GEO = null;
const FIG_CACHE = new Map();
let FIG_M = null, FIG_INK = null, FIG_GLASS = null;
function figGeo() {
  if (FIG_GEO) return FIG_GEO;
  const sph = (r, w, h, ps, pl, ts, tl) => new THREE.SphereGeometry(r, w, h, ps, pl, ts, tl);
  const rb = (x, y, z, r) => new RoundedBoxGeometry(x, y, z, 1, r);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  FIG_GEO = {
    // hips to neck, flattened front-to-back by the part
    torso: new THREE.LatheGeometry(v2([[0, -0.02], [0.19, -0.01], [0.255, 0.07], [0.261, 0.115], [0.262, 0.12], [0.265, 0.2], [0.245, 0.36], [0.262, 0.52], [0.295, 0.68], [0.29, 0.8], [0.225, 0.89], [0.12, 0.95], [0, 0.97]]), 10),
    // long coat (lab coat, EVA undersuit skirt): open at the hem, flares over the thighs
    coat: new THREE.LatheGeometry(v2([[0.3, -0.4], [0.292, -0.2], [0.278, 0.05], [0.27, 0.2], [0.252, 0.36], [0.27, 0.52], [0.302, 0.68], [0.297, 0.8], [0.232, 0.89], [0.13, 0.95], [0, 0.975]]), 10),
    // hip to ankle; doubled rows at -0.3 (shorts) and -0.56 (boot tops) give crisp colour cuts
    leg: new THREE.LatheGeometry(v2([[0, -0.74], [0.08, -0.735], [0.088, -0.66], [0.092, -0.565], [0.092, -0.56], [0.098, -0.45], [0.103, -0.305], [0.104, -0.3], [0.12, -0.18], [0.134, -0.06], [0.13, 0.03], [0.095, 0.09], [0, 0.11]]), 8),
    // shoulder to wrist; doubled rows at -0.22 (short sleeves) and -0.36 (rolled sleeves)
    arm: new THREE.LatheGeometry(v2([[0, -0.6], [0.06, -0.59], [0.066, -0.5], [0.07, -0.365], [0.07, -0.36], [0.076, -0.27], [0.083, -0.225], [0.084, -0.22], [0.09, -0.1], [0.092, 0], [0.074, 0.07], [0, 0.09]]), 8),
    shoe: rb(0.2, 0.13, 0.34, 0.05),
    boot: rb(0.22, 0.2, 0.36, 0.06),
    hand: sph(0.07, 8, 6),
    shoulder: sph(0.092, 8, 6),
    neck: new THREE.CylinderGeometry(0.085, 0.1, 0.16, 8),
    head: sph(0.24, 10, 8),
    eye: sph(0.03, 6, 4),
    nose: sph(0.04, 6, 4),
    ear: sph(0.05, 6, 4),
    hairTop: sph(0.258, 12, 5, 0, Math.PI * 2, 0, 0.95),
    hairBack: sph(0.258, 10, 8, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, 2.05),
    hairFringe: sph(0.258, 10, 4, Math.PI / 2 + 1.15, Math.PI * 2 - 2.3, 1.15, 0.8),
    bun: sph(0.1, 8, 6),
    hairLong: rb(0.36, 0.38, 0.12, 0.05),
    capCrown: sph(0.262, 12, 6, 0, Math.PI * 2, 0, 1.25),
    capBrim: new THREE.CylinderGeometry(0.22, 0.22, 0.025, 10, 1, false, -Math.PI / 2, Math.PI),
    beanie: sph(0.268, 12, 6, 0, Math.PI * 2, 0, 1.4),
    beanieFold: new THREE.TorusGeometry(0.235, 0.04, 4, 12).rotateX(Math.PI / 2),
    pompom: sph(0.07, 8, 6),
    hardHat: sph(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    hardBrim: new THREE.CylinderGeometry(0.35, 0.35, 0.03, 14),
    antenna: new THREE.CylinderGeometry(0.014, 0.022, 0.34, 5),
    antTip: sph(0.05, 6, 4),
    ridge: box(0.07, 0.05, 0.48),
    helmet: sph(0.33, 12, 9),
    visorFrame: sph(0.336, 12, 6, Math.PI / 2 - 0.95, 1.9, 0.86, 1.22),
    visor: sph(0.342, 12, 6, Math.PI / 2 - 0.85, 1.7, 0.94, 1.06),
    glint: sph(0.045, 6, 4),
    neckRing: new THREE.TorusGeometry(0.2, 0.05, 6, 14).rotateX(Math.PI / 2),
    bowl: sph(0.4, 16, 12),
    bowlRing: new THREE.TorusGeometry(0.27, 0.06, 6, 16).rotateX(Math.PI / 2),
    lifePack: rb(0.44, 0.5, 0.22, 0.07),
    tank: new THREE.CapsuleGeometry(0.07, 0.36, 2, 8),
    chestBox: rb(0.24, 0.15, 0.08, 0.03),
    dot: sph(0.025, 6, 4),
    belt: new THREE.TorusGeometry(0.25, 0.035, 4, 12).rotateX(Math.PI / 2),
    toolBelt: new THREE.TorusGeometry(0.255, 0.055, 4, 12).rotateX(Math.PI / 2),
    pouch: box(0.11, 0.13, 0.08),
    collar: new THREE.TorusGeometry(0.13, 0.04, 4, 10).rotateX(Math.PI / 2),
    hood: new THREE.TorusGeometry(0.16, 0.07, 6, 12).rotateX(Math.PI / 2),
    strip: box(0.04, 0.6, 0.02),
    vee: box(0.15, 0.2, 0.02),
    tie: box(0.06, 0.3, 0.025),
    lapel: box(0.06, 0.34, 0.03),
    pocket: box(0.1, 0.1, 0.02),
    pen: new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5),
    stripe: new THREE.TorusGeometry(0.27, 0.025, 3, 12).rotateX(Math.PI / 2),
    lens: new THREE.TorusGeometry(0.048, 0.012, 4, 10),
    bridge: new THREE.CylinderGeometry(0.01, 0.01, 0.06, 4).rotateZ(Math.PI / 2),
    strap: new THREE.TorusGeometry(0.36, 0.022, 4, 18),
    bag: rb(0.28, 0.24, 0.1, 0.04),
    scarf: new THREE.TorusGeometry(0.14, 0.06, 6, 12).rotateX(Math.PI / 2),
    scarfTail: rb(0.1, 0.32, 0.04, 0.015),
    board: box(0.22, 0.3, 0.02),
    sheet: box(0.18, 0.24, 0.006),
    tablet: box(0.2, 0.27, 0.02),
    briefcase: rb(0.32, 0.24, 0.09, 0.03),
    handle: new THREE.TorusGeometry(0.05, 0.012, 4, 8, Math.PI),
    cane: new THREE.CylinderGeometry(0.022, 0.022, 1.0, 6),
    caneTop: new THREE.TorusGeometry(0.055, 0.022, 5, 8, Math.PI),
    schoolPack: rb(0.36, 0.4, 0.18, 0.06),
    toy: sph(0.09, 8, 6),
  };
  return FIG_GEO;
}
function figMats() {
  if (!FIG_M) {
    FIG_M = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toon(0xffffff).gradientMap });
    FIG_INK = inkMat;
    FIG_GLASS = new THREE.MeshToonMaterial({ color: 0xbfefff, gradientMap: toon(0xffffff).gradientMap, transparent: true, opacity: 0.28, depthWrite: false });
  }
  return FIG_M;
}

const PAL = {
  alien: [0x7dd87a, 0x5fc9b8, 0xb59cff, 0x9be7ff, 0xc9f27a, 0xff9fcf],
  skin: [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21, 0xffe0bd, 0xd9a07a],
  hair: [0x2b1b12, 0x4a2c17, 0x8a5a2b, 0xd9a441, 0xe8d39a, 0x1a1a1a, 0xb5482f, 0x2b1b12, 0xff7ad9, 0x2ec4ff],
  grey: [0xd8d8d8, 0xb8b8bc, 0xf0f0f0, 0x9a9a9e],
  clothes: [0xff9f1c, 0xffd23f, 0x2ec4ff, 0xffffff, 0xff7ad9, 0x7dff6a, 0xc77dff, 0x55607a, 0x2b59c3, 0xd7263d, 0x2b8f6a],
  pastel: [0xb8e0ff, 0xffe9a8, 0xd9f5c4, 0xf5d0e8, 0xe0e0f0, 0xfff4e0],
  trousers: [0x3a3550, 0x2b3a5c, 0x5b5870, 0x6b5a3a, 0x221d33, 0x3b4d6b],
  shoes: [0x221d33, 0x4a2c17, 0xfff4e0, 0x3a3550, 0x5c3a21],
  hat: [0xff9f1c, 0x2ec4ff, 0xd7263d, 0x55607a, 0xffd23f, 0x7dff6a, 0xfff4e0],
  coat: [0xffffff, 0xfff4e0, 0xe6f4ff, 0xffffff],
  jacket: [0x2b3a5c, 0x55607a, 0x3a3550, 0x6b5a3a, 0xd7263d, 0x2b8f6a, 0xfff4e0, 0x7a4b9a],
  knit: [0xb5482f, 0x8a6a3a, 0x6b8f71, 0xc9a227, 0x7a6b9a, 0xd98a6a],
  hard: [0xffd23f, 0xff9f1c, 0xfff4e0, 0x2ec4ff],
  visor: [0x241a5c, 0x2b59c3, 0x1a1a2e, 0xc9a227],
};
const ARCH = ['coveralls', 'coveralls', 'lab', 'engineer', 'engineer', 'trader', 'trader', 'elder', 'eva', 'casual', 'casual'];
function figRng(seed) {
  if (seed === undefined) return Math.random;
  let a = Math.imul((Math.floor(seed * 1000) ^ 0x9e3779b9) | 0, 0x85ebca6b);
  a = (a ^ (a >>> 13)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Bake parts (each: geometry, bone, colour or colour-of-local-y, bind-space matrix, ink thickness)
// into one skinned geometry plus its ink hull geometry.
const _fc = new THREE.Color(), _fv = new THREE.Vector3(), _fn = new THREE.Vector3(), _fm3 = new THREE.Matrix3(), _fbs = new THREE.Vector3(), _fbc = new THREE.Vector3();
function bakeFigure(parts) {
  let nv = 0, ni = 0, hv = 0, hi = 0;
  for (const p of parts) {
    const c = p.g.attributes.position.count, ic = p.g.index ? p.g.index.count : c;
    nv += c; ni += ic;
    if (p.ink) { hv += c; hi += ic; }
  }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Uint16Array(nv * 3);
  const sIdx = new Uint8Array(nv * 4), sW = new Uint8Array(nv * 4);
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  const hpos = new Float32Array(hv * 3), hsIdx = new Uint8Array(hv * 4), hsW = new Uint8Array(hv * 4);
  const hidx = new (hv > 65535 ? Uint32Array : Uint16Array)(hi);
  let v = 0, i = 0, h = 0, k = 0;
  for (const p of parts) {
    const g = p.g, P = g.attributes.position, N = g.attributes.normal, c = P.count;
    _fm3.getNormalMatrix(p.m);
    const fixed = typeof p.c === 'number' ? _fc.set(p.c).clone() : null;
    let bb = null;
    if (p.ink) {
      if (!g.boundingBox) g.computeBoundingBox();
      bb = g.boundingBox; bb.getSize(_fbs); bb.getCenter(_fbc);
    }
    for (let j = 0; j < c; j++) {
      const ly = P.getY(j);
      _fv.fromBufferAttribute(P, j).applyMatrix4(p.m);
      pos[(v + j) * 3] = _fv.x; pos[(v + j) * 3 + 1] = _fv.y; pos[(v + j) * 3 + 2] = _fv.z;
      _fn.fromBufferAttribute(N, j).applyMatrix3(_fm3).normalize();
      nrm[(v + j) * 3] = _fn.x; nrm[(v + j) * 3 + 1] = _fn.y; nrm[(v + j) * 3 + 2] = _fn.z;
      const cc = fixed || _fc.set(p.c(ly));
      col[(v + j) * 3] = cc.r * 65535; col[(v + j) * 3 + 1] = cc.g * 65535; col[(v + j) * 3 + 2] = cc.b * 65535;
      sIdx[(v + j) * 4] = p.bone; sW[(v + j) * 4] = 255;
      if (bb) {
        // the same inverted hull ink() makes: the part scaled about its centre by a fixed margin
        _fv.fromBufferAttribute(P, j).sub(_fbc);
        _fv.x *= 1 + (2 * p.ink) / Math.max(_fbs.x, 0.02); _fv.y *= 1 + (2 * p.ink) / Math.max(_fbs.y, 0.02); _fv.z *= 1 + (2 * p.ink) / Math.max(_fbs.z, 0.02);
        _fv.add(_fbc).applyMatrix4(p.m);
        hpos[(h + j) * 3] = _fv.x; hpos[(h + j) * 3 + 1] = _fv.y; hpos[(h + j) * 3 + 2] = _fv.z;
        hsIdx[(h + j) * 4] = p.bone; hsW[(h + j) * 4] = 255;
      }
    }
    const I = g.index, ic = I ? I.count : c;
    for (let j = 0; j < ic; j++) {
      const a = I ? I.getX(j) : j;
      idx[i + j] = v + a;
      if (bb) hidx[k + j] = h + a;
    }
    v += c; i += ic;
    if (bb) { h += c; k += ic; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
  hull.setAttribute('skinIndex', new THREE.BufferAttribute(hsIdx, 4));
  hull.setAttribute('skinWeight', new THREE.BufferAttribute(hsW, 4, true));
  hull.setIndex(new THREE.BufferAttribute(hidx, 1));
  // bones only swing limbs a little: a fixed sphere round the whole figure culls correctly
  const bs = new THREE.Sphere(new THREE.Vector3(0, 1.15, 0), 1.75);
  geo.boundingSphere = bs; hull.boundingSphere = bs.clone();
  return { geo, hull };
}

const _fq = new THREE.Quaternion(), _fe = new THREE.Euler(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3();
const figMat = (p = [0, 0, 0], r = [0, 0, 0], s = 1) => new THREE.Matrix4().compose(
  _fp.set(p[0], p[1], p[2]), _fq.setFromEuler(_fe.set(r[0], r[1], r[2])), typeof s === 'number' ? _fs.setScalar(s) : _fs.set(s[0], s[1], s[2]));

// Cheap NPC townsperson for ambient life. Pivot at the feet; legL/legR pivot at the hips and
// armL/armR at the shoulders (Bones: animate them by rotation.x).
export function makeFigure({ suit, helmet, visor, scale = 1, seed, kind, look, alien: forceAlien = false } = {}) {
  const G = figGeo();
  const mat = figMats();
  const rnd = figRng(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  const chance = (p) => rnd() < p;
  const kid = kind === 'kid' || scale < 0.75;
  const arch = look || (kind === 'soldier' ? 'trooper' : kid ? 'kid' : pick(ARCH));
  // headgear: there's no air out here, so every human wears a sealed helmet or a fishbowl (kids a
  // bubble). The only bare heads belong to the Vrill: an antennaed folk who breathe vacuum just fine.
  const alien = forceAlien || !kid && kind !== 'soldier' && look === undefined && visor === undefined && helmet === undefined && chance(0.22);
  let headgear;
  if (alien) headgear = 'alien';
  else if (visor !== undefined) headgear = 'sealed';
  else if (arch === 'trooper') headgear = 'sealed';
  else if (arch === 'eva') headgear = 'bowl';
  else if (arch === 'kid') headgear = 'bubble';
  else headgear = pick(['sealed', 'sealed', 'sealed', 'bowl']);
  const sealed = headgear === 'sealed';
  const mono = suit !== undefined && suit === helmet; // statues and the like: one colour all over

  // palette
  const C = suit !== undefined ? suit : pick(arch === 'lab' ? PAL.coat : arch === 'trader' ? PAL.jacket : arch === 'elder' ? PAL.knit : PAL.clothes);
  const skin = alien ? pick(PAL.alien) : pick(PAL.skin);
  const hair = arch === 'elder' ? pick(PAL.grey) : pick(PAL.hair);
  const hairStyle = arch === 'elder' ? pick(['fringe', 'fringe', 'bun', 'short']) : pick(['short', 'short', 'bun', 'long', 'long', 'fringe']);
  const hatC = helmet !== undefined ? helmet : headgear === 'hardhat' ? pick(PAL.hard) : headgear === 'sealed' || headgear === 'bubble' ? 0xfff4e0 : pick(PAL.hat);
  const visorC = visor !== undefined ? visor : pick(PAL.visor);
  const inner = pick(PAL.pastel);
  const pants = arch === 'coveralls' || arch === 'engineer' || arch === 'eva' || arch === 'trooper' ? C : pick(PAL.trousers);
  const shoeC = pick(PAL.shoes);
  const dark = 0x221d33, metal = 0x5b5870, glovesC = arch === 'eva' ? 0xfff4e0 : arch === 'engineer' ? 0xe0a040 : dark;
  const gloved = sealed || arch === 'eva' || arch === 'engineer' || arch === 'trooper';
  const handC = gloved ? glovesC : skin;
  // proportions
  const w = (arch === 'eva' ? 1.18 : arch === 'trooper' ? 1.1 : 1) * (0.92 + rnd() * 0.18);
  const tall = kid ? 0.95 + rnd() * 0.1 : arch === 'elder' ? 0.9 + rnd() * 0.06 : 0.92 + rnd() * 0.16;
  const limb = arch === 'eva' ? 1.35 : arch === 'trooper' ? 1.12 : 1;
  const legLen = kid ? 0.82 : 1, torsoLen = kid ? 0.85 : 1, headS = kid ? 1.36 : 1.08;
  const hip = 0.84 * legLen;
  const stoop = arch === 'elder' ? 0.16 : 0;
  // accessories
  const acc = {
    glasses: !sealed && !alien && headgear !== 'bowl' && headgear !== 'bubble' && (arch === 'elder' ? chance(0.7) : arch === 'lab' ? chance(0.6) : chance(0.15)),
    bag: (arch === 'trader' || arch === 'casual') && chance(0.4),
    scarf: (arch === 'casual' || arch === 'elder' || arch === 'trader') && chance(0.3),
    hand: arch === 'lab' ? pick(['clipboard', 'tablet', 'clipboard']) : arch === 'trader' ? pick(['tablet', 'briefcase', 'none']) : arch === 'elder' ? (chance(0.5) ? 'cane' : 'none') : arch === 'kid' ? pick(['toy', 'none']) : arch === 'casual' ? pick(['tablet', 'none', 'none']) : 'none',
    pack: arch === 'kid' && chance(0.6),
  };
  const key = [arch, headgear, mono, C, skin, hair, hairStyle, hatC, visorC, inner, pants, shoeC, w.toFixed(2), JSON.stringify(acc)].join('|');

  // bones: 0 root, 1 legL, 2 legR, 3 armL, 4 armR
  const torsoM = figMat([0, hip, 0], [stoop, 0, 0], [w, torsoLen, w]);
  const sh = 0.8 * torsoLen;
  const shoulderAt = (side) => new THREE.Vector3(side * (0.29 * w + 0.06 * limb), sh, 0).applyMatrix4(figMat([0, hip, 0], [stoop, 0, 0]));
  const headC = new THREE.Vector3(0, 0.97 * torsoLen + 0.06 + 0.21 * headS, 0.02).applyMatrix4(figMat([0, hip, 0], [stoop, 0, 0]));
  const headM = figMat([headC.x, headC.y, headC.z], [stoop * 0.5, 0, 0], headS);
  const legAt = (side) => new THREE.Vector3(side * 0.125 * w * (arch === 'eva' ? 1.1 : 1), hip, 0);
  const pivots = [new THREE.Vector3(), legAt(-1), legAt(1), shoulderAt(-1), shoulderAt(1)];

  let baked = FIG_CACHE.get(key);
  if (!baked) {
    const parts = [];
    const col = (c) => (mono && typeof c === 'number' ? C : mono ? () => C : c);
    const vis = (c) => (mono ? (c === visorC ? c : C) : c);
    // add(part geometry, bone, colour, transform in the bone's (or the torso/head's) frame, ink)
    const add = (g, bone, c, m, ink = 0) => {
      const base = bone === 'torso' ? torsoM : bone === 'head' ? headM : figMat(pivots[bone].toArray());
      parts.push({ g, bone: typeof bone === 'number' ? bone : 0, c: typeof c === 'number' ? vis(c) : col(c), m: base.clone().multiply(m), ink });
    };
    // torso garment (in the torso frame: y 0 = hips, 0.97 = neck base)
    const flat = 0.74;
    if (arch === 'lab') add(G.coat, 'torso', C, figMat([0, 0, 0], [0, 0, 0], [1, 1, flat]), 0.035);
    else if (arch === 'eva') {
      add(G.torso, 'torso', C, figMat([0, 0, 0], [0, 0, 0], [1.04, 1, flat * 1.08]), 0.04);
    } else add(G.torso, 'torso', arch === 'kid' ? (y) => (y < 0.1175 ? pants : C) : C, figMat([0, 0, 0], [0, 0, 0], [1, 1, flat]), 0.035);
    const front = (y, x = 0) => [x, y, 0.2 + 0.02];
    if (arch === 'coveralls' || arch === 'engineer') {
      add(G.strip, 'torso', dark, figMat([0, 0.5, 0.196], [-0.03, 0, 0], [1 / w, 1, 1]));
      add(G.pocket, 'torso', dark, figMat([-0.12, 0.66, 0.2], [-0.14, 0, 0], [1 / w, 1, 1]));
      add(G.collar, 'torso', C, figMat([0, 0.9, 0], [0, 0, 0], [1 / w * 1.15, 1, 0.9]), 0.02);
    }
    if (arch === 'coveralls') add(G.belt, 'torso', dark, figMat([0, 0.15, 0], [0, 0, 0], [1, 1, 0.78]), 0.02);
    if (arch === 'engineer') {
      add(G.toolBelt, 'torso', 0x6b4a2a, figMat([0, 0.13, 0], [0, 0, 0], [1, 1, 0.8]), 0.025);
      for (const x of [-0.2, 0.2, 0.06]) add(G.pouch, 'torso', 0x8a6a3a, figMat([x, 0.06, x === 0.06 ? 0.2 : 0.12], [0, x * 2.5, 0], [1 / w, 1, 1]), 0.02);
      add(G.stripe, 'torso', 0xfff4e0, figMat([0, 0.6, 0], [0, 0, 0], [1.1, 1, 0.82]));
    }
    if (arch === 'trooper') {
      add(G.lifePack, 'torso', 0x3a3f50, figMat([0, 0.58, 0.04], [0, 0, 0], [1.25 / w, 1.02, 1.22]), 0.03);
      add(G.belt, 'torso', dark, figMat([0, 0.15, 0], [0, 0, 0], [1.02, 1, 0.8]), 0.02);
      for (const x of [-0.16, 0.16]) add(G.pouch, 'torso', 0x3a3f50, figMat([x, 0.12, 0.19], [0, 0, 0], [1 / w, 1, 1]), 0.02);
    }
    if (arch === 'lab' || arch === 'trader') {
      add(G.vee, 'torso', arch === 'lab' ? inner : 0xfff4e0, figMat(front(0.76), [-0.18, 0, 0], [1 / w, 1, 1]));
      for (const s of [-1, 1]) add(G.lapel, 'torso', C, figMat([s * 0.085, 0.72, 0.215], [-0.15, 0, s * 0.35], [1 / w, 1, 1]), 0.012);
      if (arch === 'trader') add(G.tie, 'torso', pick([0xd7263d, 0x2b59c3, 0xffd23f, 0x221d33]), figMat([0, 0.7, 0.215], [-0.12, 0, 0], [1 / w, 1, 1]), 0.01);
      if (arch === 'lab') {
        add(G.pocket, 'torso', C, figMat([-0.13, 0.62, 0.22], [-0.12, 0, 0], [1 / w, 1, 1]), 0.01);
        add(G.pen, 'torso', 0x2b59c3, figMat([-0.11, 0.67, 0.225], [0, 0, 0], [1 / w, 1, 1]));
        for (const y of [0.5, 0.36, 0.22]) add(G.dot, 'torso', dark, figMat([0, y, 0.215], [0, 0, 0], [1 / w, 1, 1]));
      }
      if (arch === 'trader') add(G.belt, 'torso', dark, figMat([0, 0.1, 0], [0, 0, 0], [1.03, 0.6, 0.8]));
    }
    if (arch === 'casual') {
      add(G.hood, 'torso', C, figMat([0, 0.9, -0.05], [-0.3, 0, 0], [1.2 / w, 1, 1]), 0.025);
      add(G.pocket, 'torso', C, figMat([0, 0.28, 0.215], [0.08, 0, 0], [2.2 / w, 1, 1]), 0.012);
    }
    if (arch === 'elder') {
      for (const y of [0.62, 0.48, 0.34]) add(G.dot, 'torso', 0xfff4e0, figMat([0, y, 0.2], [0, 0, 0], [1 / w, 1, 1]));
      add(G.strip, 'torso', 0xfff4e0, figMat([0, 0.48, 0.19], [-0.03, 0, 0], [0.4 / w, 0.75, 1]));
    }
    if (arch === 'eva') {
      add(G.lifePack, 'torso', 0xfff4e0, figMat([0, 0.6, -0.3], [0, 0, 0], [1 / w, 1, 1]), 0.035);
      for (const s of [-1, 1]) add(G.tank, 'torso', metal, figMat([s * 0.13, 0.62, -0.44], [0, 0, 0], [1 / w, 1, 1]), 0.02);
      add(G.chestBox, 'torso', 0xfff4e0, figMat([0, 0.58, 0.24], [-0.1, 0, 0], [1 / w, 1, 1]), 0.02);
      [0xff4f2e, 0x7dff6a, 0xffd23f].forEach((c, n) => add(G.dot, 'torso', c, figMat([-0.06 + n * 0.06, 0.6, 0.285], [0, 0, 0], [1 / w, 1, 1])));
      add(G.belt, 'torso', 0xfff4e0, figMat([0, 0.15, 0], [0, 0, 0], [1.06, 1.4, 0.82]), 0.02);
    }
    if (acc.scarf) {
      const sc = pick([0xd7263d, 0xffd23f, 0x2ec4ff, 0x7dff6a, 0xff7ad9]);
      add(G.scarf, 'torso', sc, figMat([0, 0.92, 0.01], [0.15, 0, 0], [1.1 / w, 1, 1]), 0.02);
      add(G.scarfTail, 'torso', sc, figMat([0.08, 0.72, 0.21], [-0.2, 0, 0.12], [1 / w, 1, 1]), 0.015);
    }
    if (acc.bag) {
      const bc = pick([0x6b4a2a, 0x3a3550, 0xffd23f, 0x2b59c3]);
      add(G.strap, 'torso', bc, figMat([0, 0.5, 0], [0, 0, 0.75], [1.02 / w, 1, 0.9]));
      add(G.bag, 'torso', bc, figMat([0.3, 0.16, 0.06], [0, Math.PI / 2 - 0.3, 0], [1 / w, 1, 1]), 0.025);
    }
    if (acc.pack) add(G.schoolPack, 'torso', pick(PAL.hat), figMat([0, 0.55, -0.27], [0, 0, 0], [1 / w, 1, 1]), 0.03);
    if (!sealed && headgear !== 'bowl') add(G.neck, 'torso', skin, figMat([0, 0.99, 0.01], [0, 0, 0], [1 / w, 1, 1]));
    // head (in the head frame: centre of the skull)
    const bare = headgear !== 'sealed';
    if (alien) {
      // a tall smooth skull, huge dark eyes, two springy antennae with glowing tips
      add(G.head, 'head', skin, figMat([0, 0.04, 0], [0, 0, 0], [0.86, 1.22, 0.95]), 0.035);
      for (const s of [-1, 1]) {
        add(G.eye, 'head', 0x05030c, figMat([s * 0.09, 0.02, 0.2], [0, 0, s * 0.35], [2.4, 3.2, 1.1]));
        add(G.antenna, 'head', skin, figMat([s * 0.09, 0.4, -0.02], [0, 0, -s * 0.35]), 0.012);
        add(G.antTip, 'head', 0xfff27a, figMat([s * 0.15, 0.56, -0.02]), 0.012);
      }
    } else if (bare) {
      add(G.head, 'head', skin, figMat([0, 0, 0], [0, 0, 0], [0.92, 1.04, 0.98]), 0.035);
      for (const s of [-1, 1]) {
        add(G.eye, 'head', 0x120a1e, figMat([s * 0.085, 0.03, 0.215], [0, 0, 0], [1, 1.3, 0.6]));
        add(G.ear, 'head', skin, figMat([s * 0.22, 0, 0], [0, 0, 0], [0.5, 1, 0.8]), 0.012);
      }
      add(G.nose, 'head', skin, figMat([0, -0.03, 0.235], [0, 0, 0], [0.9, 1.1, 1]), 0.01);
      if (acc.glasses) {
        for (const s of [-1, 1]) add(G.lens, 'head', dark, figMat([s * 0.085, 0.035, 0.235], [0, 0, 0], [1, 0.85, 1]));
        add(G.bridge, 'head', dark, figMat([0, 0.045, 0.245]));
      }
      const hatOn = headgear === 'cap' || headgear === 'beanie' || headgear === 'hardhat';
      // hair (under any hat, only the back shows)
      if (!(arch === 'kid' && headgear === 'cap' && false)) {
        if (hairStyle === 'fringe') add(G.hairFringe, 'head', hair, figMat([0, 0, -0.005]), 0.015);
        else {
          add(G.hairBack, 'head', hair, figMat([0, 0.012, -0.012]), 0.02);
          if (!hatOn) add(G.hairTop, 'head', hair, figMat([0, 0.02, 0.0], [-0.12, 0, 0]), 0.02);
        }
        if (hairStyle === 'bun' && !hatOn) add(G.bun, 'head', hair, figMat([0, 0.2, -0.17]), 0.02);
        if (hairStyle === 'long') add(G.hairLong, 'head', hair, figMat([0, -0.2, -0.15], [0.1, 0, 0]), 0.025);
      }
      if (headgear === 'cap') {
        add(G.capCrown, 'head', hatC, figMat([0, 0.025, -0.01]), 0.025);
        add(G.capBrim, 'head', hatC, figMat([0, 0.075, 0.13], [0.12, 0, 0], [1, 1, 1.15]), 0.015);
      } else if (headgear === 'beanie') {
        add(G.beanie, 'head', hatC, figMat([0, 0.06, -0.01]), 0.025);
        add(G.beanieFold, 'head', hatC, figMat([0, 0.1, -0.01], [-0.12, 0, 0], [1.05, 1, 1.05]), 0.015);
        add(G.pompom, 'head', 0xfff4e0, figMat([0, 0.33, -0.04]), 0.015);
      } else if (headgear === 'hardhat') {
        add(G.hardHat, 'head', hatC, figMat([0, 0.07, 0]), 0.025);
        add(G.hardBrim, 'head', hatC, figMat([0, 0.08, 0.02], [0, 0, 0], [0.92, 1, 1]), 0.015);
        add(G.ridge, 'head', hatC, figMat([0, 0.34, 0], [0, 0, 0], [1, 1, 0.9]));
      } else if (headgear === 'bowl' || headgear === 'bubble') {
        add(G.bowlRing, 'head', headgear === 'bowl' ? (helmet !== undefined ? hatC : metal) : hatC, figMat([0, -0.27, 0]), 0.02);
      }
    } else {
      add(G.helmet, 'head', hatC, figMat([0, 0, 0]), 0.04);
      add(G.visorFrame, 'head', dark, figMat([0, 0, 0]));
      add(G.visor, 'head', visorC, figMat([0, 0, 0]));
      add(G.glint, 'head', 0xffffff, figMat([-0.11, 0.12, 0.31], [-0.35, -0.35, 0.5], [1.3, 0.55, 0.35]));
      add(G.neckRing, 'head', arch === 'trooper' ? dark : metal, figMat([0, -0.27, 0], [0, 0, 0], [0.95, 1, 0.9]), 0.02);
    }
    // legs (bones 1, 2: y 0 = hip)
    const booted = arch === 'engineer' || arch === 'eva' || arch === 'trooper';
    for (const b of [1, 2]) {
      const legC = arch === 'kid' ? (y) => (y > -0.3025 ? pants : y > -0.5625 ? skin : 0xfff4e0) : booted ? (y) => (y > -0.5625 ? pants : 0x3a3550) : pants;
      add(G.leg, b, legC, figMat([0, 0, 0], [0, 0, 0], [limb, legLen === 1 ? 1 : 0.84, limb]), 0.035);
      const shoeY = -hip + 0.065 * (booted ? 1.5 : 1);
      if (booted) add(G.boot, b, arch === 'eva' ? 0xfff4e0 : 0x3a3550, figMat([0, -hip + 0.1, 0.04], [0, 0, 0], [limb * 0.95, 1, 1.02]), 0.03);
      else add(G.shoe, b, arch === 'kid' ? 0xfff4e0 : shoeC, figMat([0, shoeY, 0.05]), 0.03);
    }
    // arms (bones 3, 4: y 0 = shoulder)
    const sleeve = arch === 'kid' ? -0.2225 : arch === 'engineer' && !sealed ? -0.3625 : -9;
    const sleeveC = C;
    for (const b of [3, 4]) {
      const side = b === 3 ? -1 : 1;
      add(G.arm, b, sleeve > -9 ? (y) => (y > sleeve ? sleeveC : skin) : sleeveC, figMat([0, 0, 0], [0, 0, 0], [limb, kid ? 0.88 : 1, limb]), 0.03);
      add(G.shoulder, b, sleeveC, figMat([side * 0.01, 0, 0], [0, 0, 0], limb * (arch === 'trooper' ? 1.15 : 1)), 0.02);
      const hy = kid ? -0.56 : -0.63;
      add(G.hand, b, handC, figMat([0, hy, 0.01], [0, 0, 0], [0.9 * limb, 1.15 * limb, 0.8 * limb]), 0.02);
      if (b !== 4) continue;
      // held props in the right hand
      if (acc.hand === 'clipboard') {
        add(G.board, b, 0x8a6a3a, figMat([-0.04, hy + 0.06, 0.12], [-1.1, 0.2, 0]), 0.012);
        add(G.sheet, b, 0xfff4e0, figMat([-0.04, hy + 0.067, 0.132], [-1.1, 0.2, 0]));
      } else if (acc.hand === 'tablet') {
        add(G.tablet, b, dark, figMat([-0.05, hy + 0.06, 0.13], [-1.0, 0.25, 0]), 0.012);
        add(G.sheet, b, 0x2ee6ff, figMat([-0.05, hy + 0.068, 0.142], [-1.0, 0.25, 0], [0.95, 1, 1]));
      } else if (acc.hand === 'briefcase') {
        add(G.briefcase, b, pick([0x4a2c17, 0x221d33, 0x8a5a2b]), figMat([0.02, hy - 0.2, 0], [0, Math.PI / 2, 0]), 0.025);
        add(G.handle, b, dark, figMat([0.02, hy - 0.08, 0], [0, Math.PI / 2, 0]));
      } else if (acc.hand === 'cane') {
        add(G.cane, b, 0x6b4a2a, figMat([0, hy - 0.5, 0.1], [0.1, 0, 0]), 0.012);
        add(G.caneTop, b, 0x6b4a2a, figMat([0, hy + 0.02, 0.08], [0, Math.PI / 2, 0]));
      } else if (acc.hand === 'toy') add(G.toy, b, pick([0xff4f2e, 0x2ec4ff, 0x7dff6a, 0xffd23f]), figMat([0, hy - 0.04, 0.1]), 0.015);
    }
    baked = bakeFigure(parts);
    FIG_CACHE.set(key, baked);
  }

  // skeleton
  const root = new THREE.Group();
  const bones = pivots.map((p) => { const b = new THREE.Bone(); b.position.copy(p); return b; });
  for (let n = 1; n < 5; n++) bones[0].add(bones[n]);
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const body = new THREE.SkinnedMesh(baked.geo, mat);
  body.castShadow = true;
  body.bind(skeleton);
  const hull = new THREE.SkinnedMesh(baked.hull, FIG_INK);
  hull.userData.isInk = true;
  hull.bind(skeleton);
  root.add(body, hull);
  if (headgear === 'bowl' || headgear === 'bubble') {
    const bowl = new THREE.Mesh(G.bowl, FIG_GLASS);
    bowl.position.copy(headC).add(_fp.set(0, 0.02, 0));
    bowl.scale.setScalar(headS * (headgear === 'bubble' ? 0.88 : 1));
    bowl.renderOrder = 2;
    root.add(bowl);
  }
  // relaxed arms: hands hang a little away from the hips
  bones[3].rotation.z = -0.07 * (arch === 'eva' ? 2 : 1);
  bones[4].rotation.z = 0.07 * (arch === 'eva' ? 2 : 1);
  root.scale.setScalar(scale * tall);
  return { root, body, legL: bones[1], legR: bones[2], armL: bones[3], armR: bones[4], look: arch, alien, swing: arch === 'elder' ? 0.15 : arch === 'eva' ? 0.3 : 0.45 };
}



// ---- vehicles: baked with the outpost Kit (a few merged meshes each), cached per look ----
const VCACHE = new Map();
function baked(key, fn) {
  let r = VCACHE.get(key);
  if (!r) {
    const k = new Kit(0xffd23f, 3, false);
    fn(k);
    r = k.finish().root;
    VCACHE.set(key, r);
  }
  return r.clone();
}
const VDARK = 0x1d1a29, VSTEEL = 0x55607a, VMETAL = 0x8a87a0;

// a tyre with a hub, rim and tread blocks, centred on its axle (x) so it spins with rotation.x
export function rWheel(r, w, hub = VMETAL) {
  return baked(`wheel|${r}|${w}|${hub}`, (k) => {
    k.add(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), KT(VDARK), 0, 0, 0, { outline: 0.05 });
    k.add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.06, 10).rotateZ(Math.PI / 2), KT(hub), 0, 0, 0, { outline: 0 });
    k.add(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 1.14, 8).rotateZ(Math.PI / 2), KT(VDARK), 0, 0, 0, { outline: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.add(new THREE.BoxGeometry(w * 1.02, r * 0.16, r * 0.3), KT(0x2a2540), 0, Math.cos(a) * r, Math.sin(a) * r, { rx: a, outline: 0 });
    }
  });
}

// A flag that waves in the wind: a small cloth hung from the top of its pole, streaming back (-z)
// from the hoist. update(t, speed) ripples it; faster means it flies out flatter and flaps harder.
// ragged: a torn bottom edge (the Rustmoon rag).
function makeWaveFlag({ w, h, mat, ragged = false }) {
  const NX = 10, NY = 4;
  const geo = new THREE.PlaneGeometry(w, h, NX, NY).translate(-w / 2, -h / 2, 0).rotateY(-Math.PI / 2); // z in [-w, 0], y in [-h, 0]
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  if (ragged) {
    for (let i = 0; i < pos.count; i++) {
      const u = -base[i * 3 + 2] / w;
      base[i * 3 + 1] *= 1 - 0.55 * u * (0.5 + 0.5 * Math.abs(Math.sin(u * 14)));
    }
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const phase = Math.random() * 10;
  // The ripple phases are integrated frame by frame (and the speed eased), not computed as
  // t * frequency(speed): with t the global clock, a tiny change in speed shifted the phase by
  // radians per frame, so the flag flapped wildly wherever speed wobbled (around 30-45 km/h).
  let lastT = null, kS = 0, p1 = 0, p2 = 0;
  const update = (t, speed = 0) => {
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    const kTarget = Math.min(1, speed / 28);
    kS += (kTarget - kS) * (dt > 0 ? 1 - Math.exp(-dt * 4) : 1);
    const k = kS;
    p1 += dt * (5 + 8 * k);
    p2 += dt * (4 + 6 * k);
    for (let i = 0; i < pos.count; i++) {
      const z0 = base[i * 3 + 2], y0 = base[i * 3 + 1];
      const u = -z0 / w, v = -y0 / h;
      const wave = Math.sin(p1 - u * 6 + v * 0.9 + phase);
      pos.setXYZ(i,
        wave * (0.05 + 0.3 * k) * w * u,                                  // sideways ripple, bigger toward the tip
        y0 - (1 - 0.85 * k) * 0.3 * h * u * u + Math.cos(p2 - u * 5 + phase) * 0.04 * h * u * (0.4 + k), // droops at rest, flies level at speed
        z0 * (1 - (1 - k) * 0.18 * u));                                   // (a limp flag hangs a little shorter)
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  update(0, 0);
  return { mesh, update };
}

// Rovers: pirate war-rigs, military patrol cars and civilian buggies share one layout (body 3.2
// x 5.2, wheels at (±1.85, 0.85, ±1.8), gun mount at (0, 3, 0.8), loot slot on the chassis) so the
// AI, traffic and faction-vehicle code drive them all the same way. style: pirate | military | civil.
// All three are built in Blender: the war-rig in build_warrig.py, the buggy and the patrol car in
// build_rover.py (rover.glb). Body takes `color`, stripe takes `trim` (and the light bar's lenses glow
// in it); the rest are fixed. The buggy has its own bench seat and steering wheel (ownSeat), and the
// patrol car's two whip antennas lie back with speed.
const ROVER_TOON = { dark: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0, tire: 0x1d1a29, seat: 0x3a2f45, white: 0xe8e4f0, wood: 0x9a6a3a, olive: 0x4f5a42, panel: 0x1f3a6b, red: 0xd7263d };
const ROVER_GLOW = { glass: 0xcfefff, lamp: 0xfff6a8, tail: 0xff2a4a, hot: 0xff9f1c };
const ROVER_MATS = new Map(); // (shared per colour, as the baked rovers' were)
function roverMat(slot, color, trim) {
  const c = slot === 'body' ? color : slot === 'stripe' || slot === 'lens' ? trim : null;
  const key = `${slot}|${c}`;
  let m = ROVER_MATS.get(key);
  if (!m) {
    m = slot === 'lens' ? glow(trim) : c !== null ? toon(c) : ROVER_GLOW[slot] !== undefined ? glow(ROVER_GLOW[slot]) : toon(ROVER_TOON[slot] ?? 0xff00ff);
    ROVER_MATS.set(key, m);
  }
  return m;
}
export function makeRover({ color = 0x7b2ff7, trim = 0xffd23f, pirate = true, flag = 0x111111, style = null } = {}) {
  style = style || (pirate ? 'pirate' : 'civil');
  if (style === 'pirate') return makeWarRig({ color, trim });
  const B = SHIP_PARTS[style === 'military' ? 'rover_military' : 'rover_civil'];
  const out = { chassis: null, gun: null, wheels: [], antennas: [], cloth: null };
  const build = (node) => {
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, roverMat(slot, color, trim));
      m.castShadow = ROVER_GLOW[slot] === undefined && slot !== 'lens';
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    if (node.role === 'flag') {
      // the cloth hangs from the pole's tip and streams back; the vehicle code drives it through anim
      out.cloth = makeWaveFlag({ w: 1.4, h: 0.9, mat: toon(flag, { side: THREE.DoubleSide }) });
      g.add(out.cloth.mesh);
    } else if (node.role === 'wheel') out.wheels.push(g);
    else if (node.role === 'antenna') out.antennas.push(g);
    else if (node.role === 'chassis') out.chassis = g;
    else if (node.role === 'gun') out.gun = g;
    for (const k of node.kids) g.add(build(k));
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  // the whips lag behind the speed like a damped spring and flutter a little flat out
  const whips = out.antennas.map((g, i) => ({ g, a: 0, v: 0, ph: i * 2.1 }));
  let lastT = null;
  const anim = (t, sp = 0) => {
    out.cloth.update(t, sp);
    const dt = lastT == null ? 0 : Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    if (!dt) return;
    const k = Math.min(1, Math.abs(sp) / 40);
    for (const w of whips) {
      const target = -0.5 * k - 0.03 * k * Math.sin(t * 17 + w.ph);
      w.v += (90 * (target - w.a) - 9 * w.v) * dt;
      w.a += w.v * dt;
      w.g.rotation.x = w.a; // (+z is forward: a negative turn about x lays the tip back)
    }
  };
  return { root, chassis: out.chassis, gun: out.gun, wheels: out.wheels, antennas: out.antennas, anim, ownSeat: style === 'civil' };
}

// SPACECOM Lunar Interceptor, the player's pursuit car (built in Blender, see build_interceptor.py): the rover
// layout (wheels at (+-1.85, 0.85, +-1.8), radius 0.85) under a low wedge hull with an open cockpit, a roll hoop with
// a light bar, a rear wing and twin rocket bells. Body takes `color`, stripe takes `trim`; the rest are fixed. It has
// its own seat back (ownSeat). anim(t, speed): the flag waves, the whips lie back and the rocket flames stretch with speed.
const INTERCEPTOR_TOON = { navy: 0x2a3a6b, dark: 0x2a2540, steel: 0x8a87a0, tire: 0x1d1a29, seat: 0x221d33, white: 0xf3eee4 };
const INTERCEPTOR_GLOW = { glass: 0xcfefff, lamp: 0xfff6a8, tail: 0xff2a4a, hot: 0xff9f1c, red: 0xff2a4a, blue: 0x2ec4ff };
export function makeInterceptor({ color = 0xfff4e0, trim = 0xffd23f, flag = trim } = {}) {
  const B = SHIP_PARTS.interceptor;
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const fx = {
    plume: new THREE.MeshBasicMaterial({ color: 0xff9f1c, opacity: 0.6, ...add }),
    plumeCore: new THREE.MeshBasicMaterial({ color: 0xfff1c0, opacity: 0.85, ...add }),
  };
  const mats = new Map();
  const matFor = (slot) => {
    if (fx[slot]) return fx[slot];
    if (!mats.has(slot)) {
      mats.set(slot, slot === 'body' ? toon(color) : slot === 'stripe' ? toon(trim) : INTERCEPTOR_GLOW[slot] !== undefined ? glow(INTERCEPTOR_GLOW[slot]) : toon(INTERCEPTOR_TOON[slot] ?? 0xff00ff));
    }
    return mats.get(slot);
  };
  const out = { chassis: null, wheels: [], antennas: [], plumes: [], cloth: null };
  const build = (node) => {
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = !FLAMES.has(slot) && INTERCEPTOR_GLOW[slot] === undefined;
      if (FLAMES.has(slot)) m.renderOrder = 2;
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    if (node.role === 'flag') {
      out.cloth = makeWaveFlag({ w: 1.4, h: 0.9, mat: toon(flag, { side: THREE.DoubleSide }) });
      g.add(out.cloth.mesh);
    } else if (node.role === 'wheel') out.wheels.push(g);
    else if (node.role === 'antenna') out.antennas.push(g);
    else if (node.role === 'plume') out.plumes.push({ g, phase: out.plumes.length * 1.7 });
    else if (node.role === 'chassis') out.chassis = g;
    for (const k of node.kids) g.add(build(k));
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  const whips = out.antennas.map((g, i) => ({ g, a: 0, v: 0, ph: i * 2.1 }));
  let lastT = null;
  const anim = (t, sp = 0) => {
    out.cloth.update(t, sp);
    // the flames idle short and stretch to full length flat out, flickering
    const k = Math.min(1, Math.abs(sp) / 60);
    for (const P of out.plumes) {
      const s = (0.35 + 0.9 * k) * (1 + 0.15 * Math.sin(t * 17 + P.phase) + 0.06 * Math.sin(t * 46 + P.phase));
      P.g.scale.set(0.85 + 0.15 * s, 0.85 + 0.15 * s, s);
    }
    fx.plume.opacity = 0.35 + 0.35 * k;
    const dt = lastT == null ? 0 : Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    if (!dt) return;
    const kw = Math.min(1, Math.abs(sp) / 40);
    for (const w of whips) {
      const target = -0.5 * kw - 0.03 * kw * Math.sin(t * 17 + w.ph);
      w.v += (90 * (target - w.a) - 9 * w.v) * dt;
      w.a += w.v * dt;
      w.g.rotation.x = w.a; // (+z is forward: a negative turn about x lays the tip back)
    }
  };
  return { root, chassis: out.chassis, gun: new THREE.Group(), wheels: out.wheels, antennas: out.antennas, anim, ownSeat: true };
}

// ---- transit ships: tools/blender/build_ships.py exports src/assets/ships.glb ----
// Two flyers, "shuttle" (the 19 m shuttle-bus) and "freighter" (the ~70 m hauler). Each is a tree of
// pivot empties with a role (hull, leg, foot, door, ramp, hatch, plume, lift); every mesh hangs off
// one, has one slot material and an "ink" extra, exactly like the runner. At load the meshes are
// baked into their pivot's frame and merged per pivot and slot, with one outline shell per pivot.
// makeShuttle / makeFreighter rebuild the pivot tree and hand back a little rig: setGear(k)
// folds the legs out of their bays (k = 1 down and locked), setRamp(k) lowers the ramp, and
// setThrust(main, lift, t) drives the pulsing flames. The ship's numbers (gear height, walkable
// deck box, ramp path for passengers...) come from the root's custom properties.
let SHIP_PARTS = null;
const SHIP_GLOW = { glass: 0x9be7ff, glassDeep: 0x62bdf0, glassHi: 0xeafcff, window: 0xfff6a8, cabin: 0xfff1b0, red: 0xff2a4a, green: 0x7dff6a, white: 0xffffff, sign: 0xffd23f, bay: 0x0c0915 };
const SHIP_TOON = { trim: 0xd8d4e8, dark: 0x2a2540, metal: 0x8a87a0, steel: 0x55607a, deck: 0x5b5870, hazard: 0xffd23f, cargo0: 0xffd23f, cargo1: 0x2ec4ff, cargo2: 0xff3b5c, cargo3: 0x7dff6a };
const SHIP_FX = new Set(['plume', 'plumeCore', 'lift', 'engine', 'core', 'beacon']); // per-ship materials (they pulse)
const FLAMES = new Set(['plume', 'plumeCore', 'lift', 'beacon']);
export async function loadShipParts({ ships } = {}) {
  const [gltf, sk, wr, rv, ic, ap, lt, cr, ga, di, en, bc, hc, sl, pk, cs, bj, gy, cl, dd, hl, lo, lba, lbb, ska, skb, ...dn] = await Promise.all(['ships', 'skimmer', 'warrig', 'rover', 'interceptor', 'apc', 'landtrain', 'crane', 'garage', 'dish', 'engine', 'briefcase', 'hovercar', 'slots', 'plinko', 'casino', 'blackjack', 'gantry', 'claw', 'duck', 'hall', 'lot', 'lightbike_a', 'lightbike_b', 'skimmer_a', 'skimmer_b', ...DOWNS_FILES].map((n) => loadGlb(n, n === 'ships' ? ships : undefined)));
  SHIP_PARTS = {};
  for (const name of ['shuttle', 'freighter']) {
    const root = gltf.scene.getObjectByName(name);
    if (!root) throw new Error('ships.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(root);
  }
  // the Daedalus Phase Skimmer (tools/blender/build_skimmer.py): baked the same way
  const root = sk.scene.getObjectByName('skimmer');
  if (!root) throw new Error('skimmer.glb has no skimmer');
  SHIP_PARTS.skimmer = bakeShip(root);
  // the Rustmoon pirate war-rig (tools/blender/build_warrig.py)
  const rig = wr.scene.getObjectByName('warrig');
  if (!rig) throw new Error('warrig.glb has no warrig');
  SHIP_PARTS.warrig = bakeShip(rig);
  // the civil buggy and the military patrol car (tools/blender/build_rover.py)
  for (const name of ['rover_civil', 'rover_military']) {
    const r = rv.scene.getObjectByName(name);
    if (!r) throw new Error('rover.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(r);
  }
  // the SPACECOM Lunar Interceptor, the player's pursuit car (tools/blender/build_interceptor.py)
  const icp = ic.scene.getObjectByName('interceptor');
  if (!icp) throw new Error('interceptor.glb has no interceptor');
  SHIP_PARTS.interceptor = bakeShip(icp);
  // the Courier light-bike's two Blender redesigns, A and B (tools/blender/build_courier.py)
  for (const [v, g] of [['a', lba], ['b', lbb]]) {
    const bike = g.scene.getObjectByName('courier');
    if (!bike) throw new Error(`lightbike_${v}.glb has no courier`);
    SHIP_PARTS['bike_' + v] = bakeShip(bike);
  }
  // the Phase Skimmer's two Blender redesigns, A Aegis and B Bulwark (tools/blender/build_skimmer_redesign.py)
  for (const [v, g] of [['a', ska], ['b', skb]]) {
    const sk2 = g.scene.getObjectByName('skimmer');
    if (!sk2) throw new Error(`skimmer_${v}.glb has no skimmer`);
    SHIP_PARTS['skimmer_' + v] = bakeShip(sk2);
  }
  // the Vostok BTR-M Moon APC (tools/blender/build_apc.py)
  const apc = ap.scene.getObjectByName('apc');
  if (!apc) throw new Error('apc.glb has no apc');
  SHIP_PARTS.apc = bakeShip(apc);
  // the land-trains: the Moonliner passenger express and the Prospector freight rig (tools/blender/build_landtrain.py)
  for (const name of LT_UNITS) {
    const unit = lt.scene.getObjectByName(name);
    if (!unit) throw new Error('landtrain.glb has no ' + name);
    SHIP_PARTS['lt_' + name] = bakeShip(unit);
  }
  // the tower crane (tools/blender/build_crane.py)
  const crane = cr.scene.getObjectByName('crane');
  if (!crane) throw new Error('crane.glb has no crane');
  SHIP_PARTS.crane = bakeShip(crane);
  // the gantry crane and its yard box (tools/blender/build_gantry.py)
  const gantry = gy.scene.getObjectByName('gantry'), yardBox = gy.scene.getObjectByName('gantry_box');
  if (!gantry || !yardBox) throw new Error('gantry.glb has no gantry / gantry_box');
  SHIP_PARTS.gantry = bakeShip(gantry);
  SHIP_PARTS.gantryBox = bakeShip(yardBox);
  // the Meridian motor pool garage (tools/blender/build_garage.py)
  const garage = ga.scene.getObjectByName('garage');
  if (!garage) throw new Error('garage.glb has no garage');
  SHIP_PARTS.garage = bakeShip(garage);
  const shed = ga.scene.getObjectByName('garage_small');
  if (!shed) throw new Error('garage.glb has no garage_small');
  SHIP_PARTS.garage_small = bakeShip(shed);
  // the casino's slot-machine cabinet (tools/blender/build_slots.py)
  const slot = sl.scene.getObjectByName('slot');
  if (!slot) throw new Error('slots.glb has no slot');
  SHIP_PARTS.slot = bakeShip(slot);
  // the casino's lamp post, fountain, bouncer, chandelier and signs (tools/blender/build_casino.py)
  for (const name of CASINO_PROPS) {
    const root = cs.scene.getObjectByName(name);
    if (!root) throw new Error('casino.glb has no ' + name);
    SHIP_PARTS['casino_' + name] = bakeShip(root);
  }
  // the blackjack table and its chip (tools/blender/build_blackjack.py)
  for (const name of ['bj_table', 'bj_chip']) {
    const root = bj.scene.getObjectByName(name);
    if (!root) throw new Error('blackjack.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(root);
  }
  // the radio-dish array stations and the field dish (tools/blender/build_dish.py)
  for (const kind of [...DISH_KINDS, DISH_FIELD, DISH_HEAD]) {
    const station = di.scene.getObjectByName('dish_' + kind);
    if (!station) throw new Error('dish.glb has no dish_' + kind);
    SHIP_PARTS['dish_' + kind] = bakeShip(station);
  }
  // the salvaged engine that drops out of a wreck (tools/blender/build_engine.py)
  ENGINE_MODEL = en.scene.getObjectByName('engine');
  if (!ENGINE_MODEL) throw new Error('engine.glb has no engine');
  // the hover-cars (tools/blender/build_hovercar.py): the faction car and the civilian car
  for (const name of ['car_faction', 'car_civilian']) {
    const car = hc.scene.getObjectByName(name);
    if (!car) throw new Error('hovercar.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(car);
  }
  CASE_MODEL = bc.scene.getObjectByName('briefcase');
  if (!CASE_MODEL) throw new Error('briefcase.glb has no briefcase');
  // the Plinko booth and the cabinet frame that joins the board to the back wall (tools/blender/build_plinko.py)
  PLINKO_CONSOLE = pk.scene.getObjectByName('plinko_console');
  PLINKO_FRAME = pk.scene.getObjectByName('plinko_frame');
  if (!PLINKO_CONSOLE || !PLINKO_FRAME) throw new Error('plinko.glb has no plinko_console / plinko_frame');
  // the zero-g claw's machine, claw and the things in its tank (tools/blender/build_claw.py); the engine and the case in it are the salvage models above
  for (const name of CLAW_PROPS) {
    const root = cl.scene.getObjectByName(name);
    if (!root) throw new Error('claw.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(root);
  }
  // the Duck Derby's racers and track (tools/blender/build_duck.py)
  for (const name of DUCK_PROPS) {
    const root = dd.scene.getObjectByName(name);
    if (!root) throw new Error('duck.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(root);
  }
  // the casino's hall kit: wall bays, ceiling tiles, floor inlay, the bar, the lounge, the doors' frame and the roof's crown (tools/blender/build_hall.py)
  for (const name of HALL_PROPS) {
    const root = hl.scene.getObjectByName(name);
    if (!root) throw new Error('hall.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(root);
  }
  // the forecourt's kit: the card wall, its posts, the walkway's chip bollards, the P pylon and the bay studs (tools/blender/build_lot.py)
  for (const name of LOT_PROPS) {
    const root = lo.scene.getObjectByName(name);
    if (!root) throw new Error('lot.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(root);
  }
  // Chimera Downs' kits (tools/blender/build_downs_*.py): every top-level `dn_*` node of each file
  for (const g of dn) for (const root of g.scene.children) if (root.name.startsWith('dn_')) SHIP_PARTS[root.name] = bakeShip(root);
  SHIP_PARTS.claw_engine = bakeShip(ENGINE_MODEL);
  SHIP_PARTS.claw_case = bakeShip(CASE_MODEL);
  for (const m of [ENGINE_MODEL, CASE_MODEL, PLINKO_CONSOLE, PLINKO_FRAME]) m.traverse((o) => { if (o.isMesh) { o.userData.slot = o.material.name; o.castShadow = true; } });
}

// ---- Wreck salvage models (built in Blender, see build_engine.py and build_briefcase.py) ----
// The SALVAGED ENGINE (a scorched engine block, about 1.25 x 1.1 x 1.8 m) and the CREDITS BRIEFCASE (a gold-trimmed case with the credit sign on
// both faces, about 0.95 x 0.85 x 0.4 m), each centred on its origin. engineModel() / caseModel() return a fresh copy dressed in the game's toon
// materials (a `hot` slot glows), each part outlined by its `ink` property; null until the models have loaded.
let ENGINE_MODEL = null, CASE_MODEL = null, PLINKO_CONSOLE = null, PLINKO_FRAME = null;
const ENGINE_TOON = { body: 0x6b4630, dark: 0x2a2540, metal: 0x8a87a0, steel: 0x55607a };
const CASE_TOON = { body: 0x4a2f22, dark: 0x1c1830, trim: 0x8a87a0, gold: 0xffd23f };
// the Plinko booth and frame use the prize counter's palette; slots named glow* are lit
const PLINKO_TOON = { gold: 0xffd23f, brass: 0xc79a1f, plum: 0x3b0f4f, dark: 0x1a1030, pink: 0xff2e88, white: 0xfff4e0, red: 0xd7263d, glowPink: 0xff2e88, glowCyan: 0x2ee6ff, glowRed: 0xff2a4a };
function dressLoot(template, palette) {
  if (!template) return null;
  const root = template.clone(true);
  const mats = new Map();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); }); // (collected first: ink() adds outline shells as it goes)
  for (const o of meshes) {
    const slot = o.userData.slot;
    if (!mats.has(slot)) mats.set(slot, slot === 'hot' ? glow(0xff6a2a) : slot.startsWith('glow') ? glow(palette[slot] || 0xffffff) : toon(palette[slot] || 0x8a87a0));
    o.material = mats.get(slot);
    if (o.userData.ink > 0) ink(o, o.userData.ink);
  }
  return root;
}
export const engineModel = () => dressLoot(ENGINE_MODEL, ENGINE_TOON);
export const caseModel = () => dressLoot(CASE_MODEL, CASE_TOON);
// the Plinko booth (3.4 x 1.1 x 1.2 m, +z toward the player) and the board's frame (origin on the floor at the board's centre; its back is 2 m behind the board plane)
export const plinkoConsoleModel = () => dressLoot(PLINKO_CONSOLE, PLINKO_TOON);
export const plinkoFrameModel = () => dressLoot(PLINKO_FRAME, PLINKO_TOON);

function bakeShip(root) {
  root.updateMatrixWorld(true);
  const rel = new THREE.Matrix4();
  // a pivot: the root itself or any empty with a role
  const isPivot = (o) => o === root || (!o.isMesh && o.userData.role);
  const bake = (pivot, parentWorldInv) => {
    const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    const slots = new Map(), inks = [], kids = [];
    const visit = (o) => {
      for (const c of o.children) {
        if (c.isMesh) {
          const slot = c.material.name;
          rel.multiplyMatrices(inv, c.matrixWorld);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', c.geometry.attributes.position.clone());
          geo.setAttribute('normal', c.geometry.attributes.normal.clone());
          geo.setIndex(c.geometry.index.clone());
          geo.applyMatrix4(rel);
          if (!slots.has(slot)) slots.set(slot, []);
          slots.get(slot).push(geo);
          const t = c.userData.ink || 0;
          if (t > 0) inks.push(inkShellGeo(geo, t));
          visit(c);
        } else if (isPivot(c)) kids.push(bake(c, inv));
        else visit(c);
      }
    };
    visit(pivot);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    rel.multiplyMatrices(parentWorldInv, pivot.matrixWorld).decompose(pos, quat, scl);
    return {
      name: pivot.name, role: pivot === root ? 'root' : pivot.userData.role, data: pivot.userData, pos, quat,
      parts: [...slots].map(([slot, geos]) => ({ slot, geo: mergeGeometries(geos) })),
      ink: inks.length ? shellAt(mergeGeometries(inks), 1) : null, kids,
    };
  };
  return bake(root, new THREE.Matrix4().copy(root.matrixWorld).invert());
}

// A route board's face: amber pixel-font lettering on a dark dot-matrix panel, shrunk to fit.
function drawBoard(c, text) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.fillStyle = '#0c0816';
  ctx.fillRect(0, 0, W, H);
  const label = text ? `> ${text}` : '';
  const fs = Math.max(10, Math.min(28, Math.floor((W - 24) / Math.max(1, label.length))));
  ctx.font = pixelFont(fs);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff9f1c';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffb02e';
  ctx.fillText(label, W / 2, H / 2 + fs * 0.06);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff1b8';
  ctx.fillText(label, W / 2, H / 2 + fs * 0.06);
  // the lamp grid: dark lines between the dots
  ctx.fillStyle = 'rgba(8, 4, 16, 0.55)';
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

const _shipHot = new THREE.Color();
function makeShip(kind, { color, stripe, faction = 'kepler' }) {
  const B = SHIP_PARTS[kind];
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const fx = {
    plume: new THREE.MeshBasicMaterial({ color: 0xff8a2a, opacity: 0.7, ...add }),
    plumeCore: new THREE.MeshBasicMaterial({ color: 0xfff1c0, opacity: 0.9, ...add }),
    lift: new THREE.MeshBasicMaterial({ color: 0x8fd8ff, opacity: 0.6, ...add }),
    engine: new THREE.MeshBasicMaterial({ color: 0xff9f1c }),
    core: new THREE.MeshBasicMaterial({ color: 0xfff3c0 }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xff4a3a, opacity: 0.4, ...add }), // (the glow round the mast light)
  };
  const matFor = (slot) => {
    if (SHIP_FX.has(slot)) return fx[slot];
    if (slot === 'body') return toon(color);
    if (slot === 'stripe') return toon(stripe);
    if (SHIP_GLOW[slot] !== undefined) return glow(SHIP_GLOW[slot]);
    return toon(SHIP_TOON[slot] ?? 0xff00ff);
  };
  // The land-train's own cargo units ride in the freighter's bays (the box, the Helium-3 tanker, the explosives magazine: build_ships.py,
  // cargo.py). Under a `cargo` pivot every slot takes the land-train's palette in the faction the freighter serves, and only that
  // faction's `livery` pivots (its plates, numbers and marks) exist.
  const fac = LAND_TRAIN_FACTIONS[faction] ? faction : 'kepler';
  const cargoMats = new Map();
  const cargoMat = (slot) => {
    if (!cargoMats.has(slot)) { const c = cargoSlot(slot, fac); cargoMats.set(slot, c.glow ? glow(c.color) : toon(c.color)); }
    return cargoMats.get(slot);
  };
  const rig = { legs: [], doors: [], ramps: [], hatches: [], plumes: [], lifts: [], boards: [], blinkers: [], cranes: [] };
  const build = (node, cargo = false) => {
    if (node.role === 'livery' && node.data.faction !== fac) return null; // (the other factions' marks never exist)
    cargo = cargo || node.role === 'cargo';
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, cargo ? cargoMat(slot) : matFor(slot));
      m.castShadow = cargo ? LT_GLOW[slot] === undefined && node.role !== 'livery' : !SHIP_FX.has(slot) && SHIP_GLOW[slot] === undefined;
      if (!cargo && FLAMES.has(slot)) m.renderOrder = 2;
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    const d = node.data;
    let leg = null, crane = null;
    if (node.role === 'blinker') rig.blinkers.push({ g, phase: d.phase || 0 }); // (the mast's flashing light)
    else if (node.role === 'trolley') rig.cranes.push(crane = { g, side: d.side, min: d.travelMin, max: d.travelMax, drop: d.dropMax, z0: g.position.z, hoist: null, hoistY: 0, cables: [] });
    else if (node.role === 'leg') rig.legs.push(leg = { g, fold: d.fold, foot: null });
    else if (node.role === 'door') rig.doors.push({ g, open: d.open });
    else if (node.role === 'ramp') rig.ramps.push({ g, closed: d.closed, opened: d.opened });
    else if (node.role === 'hatch') rig.hatches.push(g);
    else if (node.role === 'board') rig.boards.push({ g, w: d.w, h: d.h, faces: d.faces || 1, depth: d.depth || 0 });
    else if (node.role === 'plume') rig.plumes.push({ g, phase: rig.plumes.length * 1.7 });
    else if (node.role === 'lift') rig.lifts.push({ g, phase: rig.lifts.length * 2.3 });
    for (const k of node.kids) {
      const c = build(k, cargo);
      if (!c) continue;
      g.add(c);
      if (leg && k.role === 'foot') leg.foot = c;
      if (crane && k.role === 'hoist') { crane.hoist = c; crane.hoistY = c.position.y; }
      else if (crane && k.role === 'cable') crane.cables.push(c);
    }
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  // the route board (the shuttle's destination sign): one lit canvas face on the pivot's +z, and another
  // on the back of a double-faced one. (A model without a board pivot has no sign: setSign does nothing.)
  let signCanvas = null, signTex = null;
  if (rig.boards.length) {
    signCanvas = document.createElement('canvas');
    signCanvas.width = 256; signCanvas.height = 64;
    signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    signTex.anisotropy = 4;
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    for (const b of rig.boards) {
      const front = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), signMat);
      front.position.z = 0.004;
      b.g.add(front);
      if (b.faces > 1) {
        const back = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), signMat);
        back.position.z = -b.depth - 0.004;
        back.rotation.y = Math.PI;
        b.g.add(back);
      }
    }
  }
  const d = B.data;
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const ship = {
    root, kind, size: kind === 'freighter' ? 30 : 10, sign: null,
    // the route board's text (a place's short name: "> TRANQ"); a no-op when the text is unchanged
    setSign(text) {
      if (!signCanvas || text === this.sign) return;
      this.sign = text;
      drawBoard(signCanvas, text);
      signTex.needsUpdate = true;
    },
    gearH: d.gearH, deck: [...d.deck], deckY: d.deckY, deckZ: d.deckZ, radius: d.radius, padR: d.padR,
    // the solid boxes the world keeps round it (traffic.js syncDeck): (hx, hy, hz, x, y, z, roll) groups in the ship's frame, when the model has them
    // (the freighter: hull, tower, bells, wings, cages and crates); otherwise the one deck box above
    decks: d.collide && d.collide.length ? Array.from({ length: Math.floor(d.collide.length / 7) }, (_, i) => {
      const b = d.collide.slice(i * 7, i * 7 + 7);
      return { hx: b[0], hy: b[1], hz: b[2], x: b[3], y: b[4], z: b[5], roll: b[6] };
    }) : undefined,
    inside: v3(d.inside), rampTop: v3(d.rampTop), rampBottom: v3(d.rampBottom),
    gearK: 1, rampK: 0,
    // 0 = stowed in the bays, 1 = down and locked: the doors swing open first, then the legs
    // swing down (and the reverse on the way up)
    setGear(k) {
      this.gearK = k;
      const doors = Math.min(1, k * 4), legs = THREE.MathUtils.smoothstep(k, 0.2, 1);
      for (const L of rig.legs) {
        L.g.rotation.x = L.fold * (1 - legs);
        if (L.foot) L.foot.rotation.x = -L.g.rotation.x;
        L.g.visible = k > 0.02;
      }
      for (const D of rig.doors) D.g.rotation.z = D.open * doors;
    },
    setRamp(k) {
      this.rampK = k;
      for (const R of rig.ramps) R.g.rotation.x = R.closed + (R.opened - R.closed) * k;
      for (const h of rig.hatches) h.visible = k > 0.02;
    },
    // main: 0..1 cruise thrust, lift: 0..1 belly jets, t: a clock for the pulse
    setThrust(main, lift, t) {
      const pulse = (ph, f) => 1 + 0.17 * Math.sin(t * f + ph) + 0.07 * Math.sin(t * f * 2.7 + ph * 1.3);
      for (const P of rig.plumes) {
        P.g.visible = main > 0.02;
        if (!P.g.visible) continue;
        const s = main * pulse(P.phase, 15), w = 0.8 + 0.2 * Math.min(1.2, s);
        P.g.scale.set(w, w, Math.max(0.05, s));
      }
      for (const P of rig.lifts) {
        P.g.visible = lift > 0.02;
        if (!P.g.visible) continue;
        const s = lift * pulse(P.phase, 19), w = 0.85 + 0.15 * s;
        P.g.scale.set(w, Math.max(0.05, s), w);
      }
      // the mast's light: a double flash every 1.25 s
      for (const L of rig.blinkers) {
        const ph = (((t * 0.8 + L.phase) % 1) + 1) % 1;
        L.g.visible = ph < 0.09 || (ph > 0.19 && ph < 0.28);
      }
      const p = pulse(0, 15);
      fx.plume.opacity = 0.42 + 0.22 * Math.min(1, main) * p;
      fx.plumeCore.opacity = 0.6 + 0.3 * Math.min(1, main);
      fx.lift.opacity = 0.35 + 0.25 * lift * pulse(1, 19);
      const heat = Math.min(1, Math.max(main, lift) * p);
      fx.engine.color.setHex(0x6a3a22).lerp(_shipHot.setHex(0xffb347), heat);
      fx.core.color.setHex(0x8a6a4a).lerp(_shipHot.setHex(0xfffbe8), heat);
    },
  };
  // The gantry cranes (a trolley on each side's rail, built over that side's first empty bay): `work` 0..1 is how much they are sweeping the
  // bays, t a clock, `lower` 0..1 whether they may lower their spreaders (only over their own bay, and only while the ship is down). At
  // work 0 each rests where it is built; at 1 it runs the whole of its rail, easing and dwelling at the ends.
  ship.setCrane = (work, t, lower) => {
    for (const C of rig.cranes) {
      const span = C.max - C.min;
      const home = -C.min / span;
      const sweep = THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(t * 0.32 + C.side * 1.9), 0.1, 0.9);
      const dz = C.min + span * (home + (sweep - home) * work);
      C.g.position.z = C.z0 + dz;
      const drop = Math.max(0.12, C.drop * lower * THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(1.3 - Math.abs(dz) / 1.6, 0, 1), 0, 1));
      if (C.hoist) C.hoist.position.y = C.hoistY - drop;
      for (const cb of C.cables) cb.scale.y = drop;
    }
  };
  ship.setGear(1);
  ship.setRamp(0);
  ship.setThrust(0, 0, 0);
  ship.setSign('SHUTTLE');
  ship.setCrane(0, 0, 0);
  return ship;
}

// Which Phase Skimmer gets built: 'a' (Aegis, an armoured delta gunship) or 'b' (Bulwark, an armoured catamaran gunship), the Blender
// redesigns (docs/skimmer-proposals, tools/blender/build_skimmer_redesign.py), or 'classic', the original (skimmer.glb). Both redesigns
// carry the runner inside (they are not drawn, like the APC's crew). Kept across launches; the dev menu's SKIMMER MODEL switches it (it
// applies to the next skimmer you call).
export const SKIMMER_STYLES = ['a', 'b', 'classic'];
const SKIMMER_KEY = 'mr-skimmer-model';
let skimmerStyle = 'a';
try { const k = localStorage.getItem(SKIMMER_KEY); if (SKIMMER_STYLES.includes(k)) skimmerStyle = k; } catch { /* unavailable */ }
export const getSkimmerStyle = () => skimmerStyle;
export function setSkimmerStyle(k) {
  skimmerStyle = SKIMMER_STYLES.includes(k) ? k : 'a';
  try { localStorage.setItem(SKIMMER_KEY, skimmerStyle); } catch { /* unavailable */ }
}
// the redesigns' third colour (the `accent` slot, a glow), beside the livery's near-black and violet; and their armour (`plate`, a toon)
const SKIMMER_ACCENT = { a: 0xffb62e, b: 0x2ee6c0 };
const SKIMMER_PLATE = 0x514a73;

// Daedalus Phase Skimmer: a wheel-less hover-racer (built in Blender, see build_skimmer.py). Body
// and stripe take the vehicle's livery; the phase-coil rings round its nacelles spin, and the
// thrusters and hover emitters glow with speed. Call anim(t, speed) every frame.
export function makeSkimmer({ color = 0x1a1426, trim = 0xc77dff, style = skimmerStyle } = {}) {
  const key = style !== 'classic' && SHIP_PARTS['skimmer_' + style] ? style : 'classic';
  const B = key === 'classic' ? SHIP_PARTS.skimmer : SHIP_PARTS['skimmer_' + key];
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const fx = {
    plume: new THREE.MeshBasicMaterial({ color: trim, opacity: 0.6, ...add }),
    plumeCore: new THREE.MeshBasicMaterial({ color: 0xfff4ff, opacity: 0.85, ...add }),
    lift: new THREE.MeshBasicMaterial({ color: trim, opacity: 0.45, ...add }),
    engine: new THREE.MeshBasicMaterial({ color: 0xff9f1c }),
  };
  const matFor = (slot) => {
    if (fx[slot]) return fx[slot];
    if (slot === 'body') return toon(color);
    if (slot === 'stripe') return toon(trim);
    if (slot === 'glow') return glow(trim);
    if (slot === 'seat') return toon(0x221d33);
    if (slot === 'accent') return glow(SKIMMER_ACCENT[key] ?? 0xffb62e);
    if (slot === 'plate') return toon(SKIMMER_PLATE);
    if (SHIP_GLOW[slot] !== undefined) return glow(SHIP_GLOW[slot]);
    return toon(SHIP_TOON[slot] ?? 0xff00ff);
  };
  const coils = [], plumes = [], lifts = [];
  const build = (node) => {
    const g = new THREE.Group();
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = !FLAMES.has(slot) && slot !== 'glow' && slot !== 'accent';
      if (FLAMES.has(slot)) m.renderOrder = 2;
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    if (node.role === 'coil') coils.push({ g, spin: node.data.spin || 2 });
    else if (node.role === 'plume') plumes.push({ g, phase: plumes.length * 1.7 });
    else if (node.role === 'lift') lifts.push({ g, phase: lifts.length * 2.3 });
    for (const k of node.kids) g.add(build(k));
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  // the redesigns say where a hover vehicle scatters dust (x, z pairs) and that the runner rides inside (hidden)
  const dust = B.data.dust;
  const dustSpots = dust ? Array.from({ length: dust.length / 2 }, (_, i) => [dust[i * 2], dust[i * 2 + 1]]) : null;
  return {
    root, chassis: root, wheels: [], gun: new THREE.Group(), size: 4, hideRider: !!B.data.hide_rider, ...(dustSpots ? { dustSpots } : {}),
    anim(t, speed = 0) {
      const k = Math.min(1, speed / 60);
      for (const c of coils) c.g.rotation.z = t * c.spin * (1 + 2.5 * k);
      const pulse = (ph, f) => 1 + 0.15 * Math.sin(t * f + ph) + 0.06 * Math.sin(t * f * 2.7 + ph);
      for (const P of plumes) { const s = (0.35 + 0.9 * k) * pulse(P.phase, 17); P.g.scale.set(0.85 + 0.15 * s, 0.85 + 0.15 * s, s); }
      for (const P of lifts) { const s = 0.8 * pulse(P.phase, 9); P.g.scale.set(1, s, 1); }
      fx.plume.opacity = 0.35 + 0.35 * k;
      fx.lift.opacity = 0.3 + 0.12 * Math.sin(t * 6);
    },
  };
}

// Rustmoon pirate war-rig (built in Blender, see build_warrig.py): a patched-up scrap buggy with a
// spiked ram plow, the same layout as makeRover (wheels at (+-1.85, 0.85, +-1.8), gun mount at
// (0, 3, 0.8)) so the AI and the vehicle code drive it the same way. Body and stripe take the
// colours; the patches, rust and bone spikes are fixed scrap colours.
const RIG_TOON = { rust: 0x7a4a32, primer: 0x6b6f78, olive: 0x5a6a3a, scrap: 0x3a5a7a, dark: 0x2a2540, steel: 0x55607a, tire: 0x1d1a29, bone: 0xe8e0c8, seat: 0x3a2a22, red: 0xd7263d, flag: 0x1a1a1a };
const RIG_GLOW = { lamp: 0xfff6a8, hot: 0xff9f1c };
export function makeWarRig({ color = 0x7b2ff7, trim = 0x7dff3a } = {}) {
  const B = SHIP_PARTS.warrig;
  const mats = new Map();
  const matFor = (slot) => {
    if (!mats.has(slot)) {
      mats.set(slot, slot === 'body' ? toon(color) : slot === 'stripe' ? toon(trim) : RIG_GLOW[slot] !== undefined ? glow(RIG_GLOW[slot])
        : toon(RIG_TOON[slot] ?? 0xff00ff, slot === 'flag' ? { side: THREE.DoubleSide } : undefined));
    }
    return mats.get(slot);
  };
  const out = { chassis: null, gun: null, wheels: [] };
  const build = (node) => {
    const g = new THREE.Group();
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      if (slot === 'flag') continue; // (the rag is cloth now: below)
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = RIG_GLOW[slot] === undefined;
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    if (node.role === 'chassis') {
      // the tattered rag on its whip pole waves in the wind
      out.cloth = makeWaveFlag({ w: 1.3, h: 0.9, mat: matFor('flag'), ragged: true });
      out.cloth.mesh.position.set(-1.2, 4.55, -2.25);
      g.add(out.cloth.mesh);
    }
    if (node.role === 'chassis') out.chassis = g;
    else if (node.role === 'gun') out.gun = g;
    else if (node.role === 'wheel') out.wheels.push(g);
    for (const k of node.kids) g.add(build(k));
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  return { root, chassis: out.chassis, gun: out.gun, wheels: out.wheels, anim: out.cloth.update };
}

// Vostok BTR-M Moon APC (built in Blender, see build_apc.py): eight wheels, a sloped hull, and a turret on
// the roof. The pivots the vehicle code drives: chassis, turret (yawed about y to follow the camera), barrel
// (a child of the turret, pitched about x), muzzle (an empty at the cannon's mouth, a child of the barrel)
// and eight wheels. Body and stripe take the faction colours; the rest are fixed.
const APC_TOON = { dark: 0x2a2540, steel: 0x55607a, tire: 0x1d1a29, olive: 0x5a6a3a };
const APC_GLOW = { glass: 0xcfefff, lamp: 0xfff6a8, tail: 0xff2a4a, hot: 0xff9f1c };
export function makeApc({ color = 0x6b6f78, trim = 0xff3b5c } = {}) {
  const B = SHIP_PARTS.apc;
  const mats = new Map();
  const matFor = (slot) => {
    if (!mats.has(slot)) {
      mats.set(slot, slot === 'body' ? toon(color) : slot === 'stripe' ? toon(trim) : APC_GLOW[slot] !== undefined ? glow(APC_GLOW[slot]) : toon(APC_TOON[slot] ?? 0xff00ff));
    }
    return mats.get(slot);
  };
  const out = { chassis: null, turret: null, barrel: null, muzzle: null, exhaust: null, wheels: [], antennas: [] };
  const build = (node) => {
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = APC_GLOW[slot] === undefined;
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    if (node.role === 'wheel') out.wheels.push(g);
    else if (node.role === 'antenna') out.antennas.push(g);
    else if (node.role && node.role in out) out[node.role] = g;
    for (const k of node.kids) g.add(build(k));
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  out.barrelRest = out.barrel.position.clone(); // (the recoil slides it back from here)
  // dust is kicked from the four corners, not from all eight wheels
  const dustSpots = [[-1.72, 2.15], [1.72, 2.15], [-1.72, -2.15], [1.72, -2.15]];
  // the whip antennas lie back with speed, like they were dragged: a damped spring on each, driven by the speed
  // along the hull (vehicles.js sets `along` before calling anim; reversing leans them forward)
  const whips = out.antennas.map((g, i) => ({ g, a: 0, v: 0, ph: i * 2.1 }));
  let lastT = null;
  const model = {
    root, chassis: out.chassis, gun: out.turret, turret: out.turret, barrel: out.barrel, barrelRest: out.barrelRest, muzzle: out.muzzle, exhaust: out.exhaust,
    wheels: out.wheels, wheelR: 0.62, dustSpots, antennas: out.antennas, along: 0,
    anim(t, sp) {
      const dt = lastT == null ? 0 : Math.min(0.05, Math.max(0, t - lastT));
      lastT = t;
      if (!dt) return;
      const k = sp < 0.5 ? 0 : Math.max(-0.3, Math.min(1, model.along / 60)); // (1 = flat out)
      for (const w of whips) {
        const target = -(0.45 * k) - 0.02 * Math.abs(k) * Math.sin(t * 17 + w.ph); // (a little flutter at speed)
        w.v += (90 * (target - w.a) - 9 * w.v) * dt; // spring and damping: a lag, a small overshoot when you floor it
        w.a += w.v * dt;
        w.g.rotation.x = w.a; // (+z is forward: a negative turn about x lays the tip back)
      }
    },
  };
  return model;
}

// ---- Land-trains (built in Blender, see build_landtrain.py) ----
// Two services, each its own tractor and cars: the MOONLINER is the passenger express (a streamlined tractor
// pulling capsule coaches, nothing else), the PROSPECTOR is the freight rig (a heavy dozer-bladed tractor pulling
// a cryogenic Helium-3 tanker, a cargo container and an explosives magazine). A train is painted for the faction
// it serves: body, trim, accent and lettering colours below; the faction's emblem and name are in the model
// (one `livery` pivot per faction) and only the matching one is built.
const LT_UNITS = ['moonliner', 'moonliner_coach', 'prospector', 'prospector_tank', 'prospector_cargo', 'prospector_blast'];
const LT_CAR = { pax: 'moonliner_coach', tank: 'prospector_tank', cargo: 'prospector_cargo', blast: 'prospector_blast' };
export const LAND_TRAIN_FACTIONS = {
  spacecom: { body: 0xf2ecdc, stripe: 0xffd23f, accent: 0x2a3a6b, label: 0x2a3a6b }, // white and yellow, navy lettering
  vostok: { body: 0x6b6f78, stripe: 0xff3b5c, accent: 0x2c2f38, label: 0xf3eee4 }, // the APC's slate and red
  kepler: { body: 0xff9f1c, stripe: 0xfff4e0, accent: 0x6a8f3a, label: 0x2a2540 }, // orange and cream, the Mule's green
  meridian: { body: 0x2ec4ff, stripe: 0xfff4e0, accent: 0xffd23f, label: 0x16385e }, // cyan and cream, gold pin-stripes
};
const LT_TOON = { dark: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0, tire: 0x1d1a29, white: 0xf3eee4, hazard: 0xffd23f, tank: 0xc6d6ea, brand: 0x14a3b8, redsafe: 0xc9202e, orange: 0xff7a1a, blue: 0x1d63d6 };
const LT_GLOW = { glass: 0x9be7ff, window: 0xfff6a8, lamp: 0xfff6a8, tail: 0xff2a4a, green: 0x7dff6a, hot: 0xff9f1c };

// The colour of a slot under a `cargo` pivot (the land-train's cargo units as other models carry them, cargo.py: the freighter's
// bays, the gantry crane's load, the Meridian yard's stacks), and whether it glows: the land-train palette of `faction` for body,
// stripe, accent and label, the land-train's fixed colours for the rest.
export function cargoSlot(slot, faction = 'kepler') {
  const pal = LAND_TRAIN_FACTIONS[faction] || LAND_TRAIN_FACTIONS.kepler;
  if (slot in pal) return { color: pal[slot], glow: false };
  if (LT_GLOW[slot] !== undefined) return { color: LT_GLOW[slot], glow: true };
  return { color: LT_TOON[slot] ?? 0xff00ff, glow: false };
}

// One unit of the train, painted. Returns its root and the pivots the traffic code drives.
function ltUnit(name, pal, faction) {
  const B = SHIP_PARTS['lt_' + name];
  const mats = new Map();
  const matFor = (slot) => {
    if (!mats.has(slot)) mats.set(slot, slot in pal ? toon(pal[slot]) : LT_GLOW[slot] !== undefined ? glow(LT_GLOW[slot]) : toon(LT_TOON[slot] ?? 0xff00ff));
    return mats.get(slot);
  };
  const out = { wheels: [], beacon: null, bar: null, rod: null, eye: null };
  const build = (node) => {
    if (node.role === 'livery' && node.data.faction !== faction) return null; // (the other factions' marks never exist)
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = LT_GLOW[slot] === undefined && node.role !== 'livery';
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    if (node.role === 'wheel') out.wheels.push(g);
    else if (node.role && node.role in out) out[node.role] = g;
    for (const k of node.kids) {
      const c = build(k);
      if (c) g.add(c);
    }
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  // the solid boxes you can stand on: (hx, hy, hz, y, z) groups in the unit's frame
  const flat = B.data.decks || [];
  const decks = [];
  for (let i = 0; i + 4 < flat.length; i += 5) decks.push({ hx: flat[i], hy: flat[i + 1], hz: flat[i + 2], y: flat[i + 3], z: flat[i + 4] });
  return { root, decks, ...out };
}

// type: 'moonliner' (passenger) or 'prospector' (freight); cars: 'pax' for the Moonliner's coaches, 'tank' (Helium-3),
// 'cargo' and 'blast' (explosives) for the Prospector's trailers
export function makeLandTrain({ faction = 'kepler', type = 'moonliner', cars } = {}) {
  const pal = LAND_TRAIN_FACTIONS[faction] || LAND_TRAIN_FACTIONS.kepler;
  const fac = LAND_TRAIN_FACTIONS[faction] ? faction : 'kepler';
  cars = cars || (type === 'prospector' ? ['tank', 'cargo', 'blast'] : ['pax', 'pax', 'pax']);
  const tractor = ltUnit(type, pal, fac);
  const trailers = cars.map((kind) => ({ ...ltUnit(LT_CAR[kind], pal, fac), kind }));
  return { root: tractor.root, wheels: tractor.wheels, beacon: tractor.beacon, decks: tractor.decks, trailers, type, faction: fac };
}

// ---- The tower crane (built in Blender, see build_crane.py) ----
// 34 m of lattice mast under a 30 m jib; the game scales it uniformly (h / CRANE_H). The baked tree: the root's own meshes are
// the foundation, base frame and mast; its `slew` child (turned about y) carries the tower head, jib, counter-jib, cab and
// lamps, with `blinker` pivots for the aircraft warning lights; that has a `trolley` child (slid along the jib) holding
// `cable` (two rope falls a metre long, stretched down to the hook) and `hook` (the hook block, lowered with it), which carries
// the `load`: the Prospector's cargo container on a spreader frame, with a `livery` pivot per faction (only the one for the
// crane's cargo is built, as on the land-trains).
export const CRANE_H = 34, CRANE_JIB = 30;
export const CRANE_LOAD_DROP = 8.65; // from the hook's origin to the container's bottom
// the trolley runs between these (m along the jib): near enough to the mast and the container (7.2 m long, along the jib) would
// hit its ballast and platforms
export const CRANE_TROLLEY_MIN = 7.9, CRANE_TROLLEY_SPAN = 19.1;
const CRANE_COLORS = { dark: 0x2a2540, steel: 0x55607a, concrete: 0x8a8698, white: 0xfff4e0, glass: 0xcfefff, lamp: 0xfff6a8, rope: 0x1d1a29, metal: 0x8a87a0, tail: 0xff2a4a };
const CRANE_GLOW = new Set(['glass', 'lamp', 'tail']);

// The colour of a crane slot, and whether it glows. `color` paints the crane (body); the cargo container wears the livery of
// `faction` (load: its body, stripe: its trim, label: its lettering), as the land-trains' do.
export function craneSlot(slot, color, faction = 'kepler') {
  const pal = LAND_TRAIN_FACTIONS[faction] || LAND_TRAIN_FACTIONS.kepler;
  if (slot === 'body') return { color, glow: false };
  if (slot === 'load') return { color: pal.body, glow: false };
  if (slot === 'stripe') return { color: pal.stripe, glow: false };
  if (slot === 'label') return { color: pal.label, glow: false };
  return { color: CRANE_COLORS[slot] ?? 0xff00ff, glow: CRANE_GLOW.has(slot) };
}

export function craneModel() {
  const root = SHIP_PARTS.crane;
  const find = (n, role) => n.kids.find((k) => k.role === role);
  const slew = find(root, 'slew'), trolley = find(slew, 'trolley'), hook = find(trolley, 'hook');
  return { root, slew, trolley, cable: find(trolley, 'cable'), hook, load: find(hook, 'load'), blinkers: slew.kids.filter((k) => k.role === 'blinker') };
}

// A whole crane as plain meshes (the model viewer's and the Asset Row's): returns the root group and the pivots to drive (slew,
// trolley, cable, hook; the blinker lamps). The settlements bake the same parts into their own kit instead (settlements.js
// towerCrane, gantryCrane). `matFor(slot, cargo)` paints a slot (cargo: under a `cargo` pivot); only `faction`'s liveries exist.
function craneRig(root, matFor, faction) {
  const rig = { blinkers: [] };
  const build = (node, cargo = false) => {
    if (node.role === 'livery' && node.data.faction !== faction) return null; // (the other factions' marks never exist)
    cargo = cargo || node.role === 'cargo';
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot, cargo));
      m.castShadow = !(cargo ? cargoSlot(slot, faction).glow : CRANE_GLOW.has(slot)) && node.role !== 'livery';
      g.add(m);
    }
    if (node.ink) {
      const m = new THREE.Mesh(node.ink, inkMat);
      m.userData.isInk = true;
      g.add(m);
    }
    if (node.role === 'blinker') {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(node.data.radius || 0.3, 8, 6), glow(0xff2a4a));
      lamp.userData.blink = true;
      g.add(lamp);
      rig.blinkers.push(lamp);
    }
    if (node.role in { slew: 1, trolley: 1, cable: 1, hook: 1 }) rig[node.role] = g;
    for (const k of node.kids) {
      const c = build(k, cargo);
      if (c) g.add(c);
    }
    return g;
  };
  rig.root = build(root);
  return rig;
}

// a slot painter for a crane: the crane's own slots in `color` (body) and the fixed colours, a cargo unit's in `faction`'s livery
function cranePainter(color, faction) {
  const mats = new Map();
  return (slot, cargo = false) => {
    const key = (cargo ? 'cargo:' : '') + slot;
    if (!mats.has(key)) {
      const c = cargo ? cargoSlot(slot, faction) : craneSlot(slot, color, faction);
      mats.set(key, c.glow ? glow(c.color) : toon(c.color));
    }
    return mats.get(key);
  };
}

export function makeTowerCrane({ color = 0xffd23f, faction = 'kepler', h = CRANE_H } = {}) {
  const rig = craneRig(craneModel().root, cranePainter(color, faction), faction);
  rig.root.scale.setScalar(h / CRANE_H);
  return rig;
}

// ---- The gantry crane (built in Blender, see build_gantry.py) ----
// The tower crane's sibling for the Meridian Exchange's container yard: a portal of two lattice legs on rail bogies under a truss
// girder, which the game slides along x on its rails (the root); its `trolley` runs along z under the girder, with the tower crane's
// `cable` and `hook`, whose `load` is a spreader over a `cargo` pivot (cargo.py's box container, lying along the girder, with a
// `livery` pivot per faction: only the crane's cargo's is built); `blinker` pivots on the girder's ends and the legs' tops.
// `gantryBox` is one such container on its own (a `cargo` pivot, its origin the middle of its footprint on the ground), which the
// settlements bake per stack in a faction's colours.
export const GANTRY_H = 23, GANTRY_LEG = 15; // the trolley's rails' height; the legs (and the rails the crane runs on) at z = +-LEG
export const GANTRY_TROLLEY_SPAN = 10; // the trolley runs z in [-span, span] (clear of the knees under the girder at the legs)
export const CARGO_BOX = { hx: 1.75, hz: 3.95, h: 3.2 }; // the yard box's footprint (its rack) and its height (it stacks at this pitch)

export function gantryModel() {
  const root = SHIP_PARTS.gantry;
  const find = (n, role) => n.kids.find((k) => k.role === role);
  const trolley = find(root, 'trolley'), hook = find(trolley, 'hook'), load = find(hook, 'load');
  return { root, trolley, cable: find(trolley, 'cable'), hook, load, cargo: find(load, 'cargo'), box: SHIP_PARTS.gantryBox, blinkers: root.kids.filter((k) => k.role === 'blinker') };
}

export function makeGantryCrane({ color = 0xffd23f, faction = 'kepler' } = {}) {
  return craneRig(gantryModel().root, cranePainter(color, faction), faction);
}

// The yard's box container as plain meshes, in `faction`'s livery (the Asset Row's; the settlements bake it: settlements.js cargoStack).
export function makeCargoBox({ faction = 'kepler' } = {}) {
  const paint = cranePainter(0xffd23f, faction);
  return craneRig(gantryModel().box, (slot) => paint(slot, true), faction); // (the box is the cargo pivot itself: all of it is cargo)
}

// ---- The vehicle garage (built in Blender, see build_garage.py) ----
// Two buildings in one file: the main garage, a 38 m by 20 m hall with three bays, a service office and its compound round it (the
// fuel yard, the back yard and the power compound, 61 m by 45 m in all), and a small one, 32 m by 17 m with two bays (about the old
// sheds' size). Bay doors face +z. The baked tree: the root's own meshes are the shell, roof and yards; its `door`
// pivots hold each bay's closed and open door (extras `bay`, `state`), its `fit` pivots what is working inside a bay that is
// open, `fan` the roof turbine heads (extra `speed`, spun about y), `blinker` the antenna lamp, `cargo` where a stack of the
// gantry's cargo boxes stands (extras `n`, `yaw`, `faction`) and `col` the colliders (extras `shape` box / cyl / hcyl and its sizes).
export const GARAGE_HALL = { main: { hx: 19, hz: 10 }, small: { hx: 16, hz: 8.5 } }; // each hall's half sizes
export const GARAGE_BAYS = { main: [-10, 0, 10], small: [-8, 8] }; // and where its bays are (x)
export const GARAGE_FLOOR = 0.08; // the hall's floor above the ground (FY in build_garage.py): the road meets the plinth's edge
const GARAGE_TOON = {
  body: 0xfff4e0, trim: 0x2ec4ff, navy: 0x1b3a8f, gold: 0xffd23f, dark: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0, concrete: 0x8a8698,
  floor: 0x4a465c, door: 0xc6cbdc, roof: 0x3a3550, panel: 0x1d3a8a, tire: 0x1d1a29, white: 0xf3eee4, label: 0x2a2540,
  stripe: 0xfff4e0, hazard: 0xffd23f, redsafe: 0xc9202e, orange: 0xff7a1a, blue: 0x1d63d6, tank: 0xc6d6ea,
};
const GARAGE_GLOW = { lamp: 0xfff6a8, glass: 0xcfefff, window: 0xfff6a8, green: 0x7dff6a, red: 0xff2a4a, hot: 0xff9f1c, interior: 0xa7a3b8, shopfloor: 0x58546c };

// The colour of a garage slot, and whether it glows; `trim` is the cyan the faction can change.
export function garageSlot(slot, trim = 0x2ec4ff) {
  if (slot === 'trim') return { color: trim, glow: false };
  if (slot in GARAGE_GLOW) return { color: GARAGE_GLOW[slot], glow: true };
  return { color: GARAGE_TOON[slot] ?? 0xff00ff, glow: false };
}

// What to build for a garage whose bays are `open` (a boolean for each bay): the baked nodes of the static building, the moving
// heads, the lamp, the cargo stacks and the colliders. Every pivot of the model that isn't picked is left out.
export function garageModel(open = [true, false, true], kind = 'main') {
  const root = SHIP_PARTS[kind === 'main' ? 'garage' : 'garage_small'];
  const keep = (n) => (n.role === 'door' ? (n.data.state === 'open') === !!open[n.data.bay] : n.role === 'fit' ? !!open[n.data.bay] : true);
  const flat = [], fans = [], blinkers = [], cargo = [], cols = [];
  const walk = (n) => {
    if (n.role === 'fan') { fans.push(n); return; }
    if (n.role === 'blinker') { blinkers.push(n); return; }
    if (n.role === 'cargo') { cargo.push(n); return; }
    if (n.role === 'col') { cols.push(n); return; }
    if (!keep(n)) return;
    flat.push(n);
    for (const k of n.kids) walk(k);
  };
  walk(root);
  return { root, flat, fans, blinkers, cargo, cols };
}

// A whole garage as plain meshes (the model viewer's): `open` the bays that are up, the head of each vent turning with `t`.
export function makeGarage({ open = [true, false, true], kind = 'main', trim = 0x2ec4ff } = {}) {
  const G = garageModel(open, kind);
  const mats = new Map();
  const matFor = (slot) => {
    if (!mats.has(slot)) { const c = garageSlot(slot, trim); mats.set(slot, c.glow ? glow(c.color) : toon(c.color)); }
    return mats.get(slot);
  };
  const dress = (node, g) => {
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = !(slot in GARAGE_GLOW);
      g.add(m);
    }
    if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
  };
  const root = new THREE.Group();
  for (const n of G.flat) dress(n, root); // (the model's static pivots all sit at the origin)
  const heads = G.fans.map((n) => {
    const h = new THREE.Group();
    h.position.copy(n.pos);
    dress(n, h);
    h.userData.spin = n.data.speed || 1;
    root.add(h);
    return h;
  });
  for (const b of G.blinkers) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(b.data.radius || 0.25, 8, 6), glow(0xffd23f));
    lamp.position.copy(b.pos);
    root.add(lamp);
  }
  return { root, heads, update(t) { for (const h of heads) h.rotation.y = t * h.userData.spin; } };
}

// ---- The casino's slot-machine cabinet (built in Blender, see build_slots.py) ----
// A pixel-arcade video slot facing +z, about 2.2 m wide, 1.6 m deep (z from -0.71 to 0.91) and 4.3 m tall, its lever on the right side. The baked tree: the
// root's own meshes are the cabinet, the `pull` pivot is the lever (turned about x), `lamp` the roof lamp bar, and the `screen` (marquee), `display`
// (pixel-reel screen) and `decal` (side art) pivots have no meshes: they say where the casino hangs its textured planes.
const SLOT_TOON = { dark: 0x1f1a30, bezel: 0x15101f, panel: 0x2a2440, chrome: 0xdcdff0, gold: 0xffd23f, cream: 0xf7f0dc, coin: 0xffd94d };
const SLOT_GLOW = { ledr: 0xff2a4a, ledg: 0x7dff6a, ledb: 0x2ee6ff, bulb: 0xfff6a8, display: 0x120a2e };
export const SLOT_LAMP_OFF = 0x5a2a1a;

// A cabinet painted `color`. `stat` holds what never moves (the casino freezes it, so the world merges a whole carousel of them into a few draw
// calls), `dyn` the lever and the lamp bar (put both where the cabinet stands). `lamp` is the bar's mesh, `pull` the lever's pivot, and `spots` says
// where the planes go: { screen, display, decals: [] }, each { pos, w, h, tilt } (a decal also has `side`, -1 or 1, and `id`).
export function makeSlotCabinet(color) {
  const B = SHIP_PARTS.slot;
  const shade = new THREE.Color(color).multiplyScalar(0.62).getHex(), neon = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4).getHex(); // (the glow is the paint, brighter)
  const matFor = (slot) => (slot === 'body' ? toon(color) : slot === 'shade' ? toon(shade) : slot === 'neon' ? glowShared(neon) : slot in SLOT_GLOW ? glowShared(SLOT_GLOW[slot]) : toon(SLOT_TOON[slot] ?? 0xff00ff));
  const dress = (node, g, lamp = false) => {
    let bar = null;
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, lamp ? glowShared(SLOT_LAMP_OFF) : matFor(slot));
      m.castShadow = !lamp && !(slot in SLOT_GLOW) && slot !== 'neon';
      g.add(m);
      if (lamp) bar = m;
    }
    if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
    return bar;
  };
  const stat = new THREE.Group(), dyn = new THREE.Group();
  const spots = { screen: null, display: null, decals: [] };
  dress(B, stat);
  let pull = null, lamp = null;
  for (const k of B.kids) {
    const spot = { pos: k.pos, w: k.data.w, h: k.data.h, tilt: k.data.tilt || 0, side: k.data.side, id: k.data.id };
    if (k.role === 'screen') spots.screen = spot;
    else if (k.role === 'display') spots.display = spot;
    else if (k.role === 'decal') spots.decals.push(spot);
    else if (k.role === 'pull' || k.role === 'lamp') {
      const g = new THREE.Group();
      g.position.copy(k.pos);
      g.quaternion.copy(k.quat);
      const bar = dress(k, g, k.role === 'lamp');
      dyn.add(g);
      if (k.role === 'pull') pull = g; else lamp = bar;
    }
  }
  return { stat, dyn, pull, lamp, spots };
}

// ---- The casino's props (built in Blender, see build_casino.py) ----
// Six models in one file, each a root of the baked tree: `lamp_post` (the boulevard's lamp, whose `accent` slot is the colour the game picks;
// the plaza's ring of posts is the same one scaled down), `fountain` (the plaza basin, with the water in `water`, `curtain` and `streams`
// pivots that fountainFx.js gives their shaders, and `spin` pivots `chip` and `dollar`, the centrepieces, of which one is built), `bouncer` (a buff alien in a tux, a `head` pivot), `chandelier`
// (a `spin` pivot), `welcome_sign` and `wall_sign` (a `face` pivot where the game puts its text plane).
export const CASINO_PROPS = ['lamp_post', 'fountain', 'bouncer', 'chandelier', 'welcome_sign', 'wall_sign'];
const CASINO_TOON = {
  post: 0x2a1450, base: 0x3a3550, gold: 0xffd23f, dark: 0x120a1e, plum: 0x2a1450, cream: 0xd8d4e8, creamshade: 0xaaa6c0, floor: 0x7a93b0, chip: 0xff2e88, white: 0xfff4e0,
  skin: 0xa58cff, skin2: 0x6c52c8, suit: 0x16121f, suit2: 0x2e2a40, shirt: 0xfff4e0, tie: 0xd7263d, tusk: 0xf2ecd8, shoe: 0x0c0a12,
};
const CASINO_GLOW = { neon: 0xff2e88, eye: 0xffe24a, crystalA: 0xff9fdc, crystalB: 0x9be7ff, bulb: 0xfff6a8 };
const CASINO_WATER = new Set(['water', 'curtain', 'streams']); // (pivot roles dressed by fountainFx.js, not here)

// The colour of a casino slot and whether it glows; `accent` is the one the caller picks (a lamp post's rings, lantern and small lamp).
export function casinoSlot(slot, accent = 0xff2e88) {
  if (slot === 'accent') return { color: accent, glow: true };
  if (slot in CASINO_GLOW) return { color: CASINO_GLOW[slot], glow: true };
  return { color: CASINO_TOON[slot] ?? 0xff00ff, glow: false };
}
export const casinoNode = (name) => SHIP_PARTS['casino_' + name];

// A baked node as a Group: its meshes dressed by `matFor` with their outline shells, and a child Group for each pivot (at its place, named, its role
// and extras in userData), except the fountain's water, which the caller dresses (fountainFx.js), and any pivot `keep` refuses.
function casinoGroup(node, matFor, accent, keep = () => true) {
  const g = new THREE.Group();
  g.name = node.name;
  g.position.copy(node.pos);
  g.quaternion.copy(node.quat);
  Object.assign(g.userData, node.data);
  for (const { slot, geo } of node.parts) {
    const c = casinoSlot(slot, accent);
    const m = new THREE.Mesh(geo, matFor(c));
    m.castShadow = !c.glow;
    g.add(m);
  }
  if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
  for (const k of node.kids) if (!CASINO_WATER.has(k.role) && keep(k)) g.add(casinoGroup(k, matFor, accent, keep));
  return g;
}
const casinoMat = (c) => (c.glow ? glowShared(c.color) : toon(c.color));

// A lamp post in `accent` (the boulevard's are pink and cyan in turn), 9 m tall with its small lamp toward +z.
export const makeLampPost = (accent = 0xff2e88) => casinoGroup(casinoNode('lamp_post'), casinoMat, accent);

// The door's bouncer, 2.5 m, facing +z: { root, head } (turn `head` to watch people).
export function makeBouncer() {
  const root = casinoGroup(casinoNode('bouncer'), casinoMat);
  return { root, head: root.getObjectByName('head') };
}

// A hall chandelier, hanging from the ceiling 3.3 m above its centre: { root, spin } (turn `spin` about y).
export function makeChandelier() {
  const root = casinoGroup(casinoNode('chandelier'), casinoMat);
  return { root, spin: root.getObjectByName('spin') };
}

// The hung welcome sign ('welcome_sign', 9.6 by 2.5 m, centred, chains 6.4 m up) or the blackjack wall sign ('wall_sign', 7.4 by 1.95 m, its back at
// z = 0): { root, face } where `face` is { pos, w, h } for the text plane.
export function makeCasinoSign(kind) {
  const node = casinoNode(kind), root = casinoGroup(node, casinoMat);
  const f = node.kids.find((k) => k.role === 'face');
  return { root, face: { pos: f.pos, w: f.data.w, h: f.data.h } };
}

// The plaza fountain as plain meshes (the viewer's and the Asset Row's): { root, spinner, update(t, dt) }; the centrepiece (`top`: the
// casino's 'chip', or the 'dollar' sign in `accent`, the Meridian Exchange's) spins and the water runs with `t`.
export function makeFountain({ top = 'chip', accent = 0xff2e88 } = {}) {
  const node = casinoNode('fountain');
  const root = casinoGroup(node, casinoMat, accent, (k) => k.role !== 'spin' || (k.data.kind || 'chip') === top);
  const water = [];
  for (const k of node.kids) if (CASINO_WATER.has(k.role)) { const m = waterMesh(k); root.add(m); water.push(m); }
  const spinner = root.getObjectByName(top);
  return { root, spinner, chip: spinner, update(t, dt = 0) { if (spinner) spinner.rotation.y += dt * (spinner.userData.speed || 0.7); for (const m of water) m.userData.tick(m, dt, t); } };
}

// ---- The casino's blackjack table (built in Blender, see build_blackjack.py) ----
// `bj_table`: a half-disc table (R = 3.4 m, the flat dealer's edge along z = 0, the player's stool at z = 4.3) with its dealer's back counter, chip rack, card
// shoe and discard well; its `felt` pivot (extras w, h) is where the game lays the felt plane (y = 1.155), `shoe`, `rack` and `discard` where cards and chips go
// and come from. `bj_chip`: one chip (0.16 m across, 0.07 m high), its `chip` slot the stake's tier colour.
const BJ_TOON = {
  plum: 0x7c50a0, plum2: 0x9561bc, gold: 0xffd23f, cream: 0xfff4e0, dark: 0x594b6f, leather: 0xad5990, brass: 0xd8aa2e,
  chipwhite: 0xfff4e0, chipred: 0xff2a4a, chipcyan: 0x2ee6ff, chipgreen: 0x7dff6a, chipviolet: 0xc77dff,
};
const BJ_GLOW = { cyan: 0x2ee6ff, pink: 0xff2e88, suitred: 0xff2a4a, suitcream: 0xfff4e0 };

// The table as a Group (the casino freezes it: the world merges it) and where its hooks are: { stat, spots: { felt: { pos, w, h }, shoe, rack, discard } }.
export function makeBlackjackTable() {
  const node = SHIP_PARTS.bj_table, stat = new THREE.Group(), spots = {};
  for (const { slot, geo } of node.parts) {
    const m = new THREE.Mesh(geo, slot in BJ_GLOW ? glowShared(BJ_GLOW[slot]) : toon(BJ_TOON[slot] ?? 0xff00ff));
    m.castShadow = !(slot in BJ_GLOW);
    stat.add(m);
  }
  if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; stat.add(m); }
  for (const k of node.kids) spots[k.role] = { pos: k.pos, w: k.data.w, h: k.data.h };
  return { stat, spots };
}

// A stack of `n` chips in `color`, standing on y = 0: three meshes (the tier-coloured bodies, the cream stripes, the gold rings) and an outline shell, each
// chip a little off the one below and turned. The merged geometry is kept per `n`, so every stake's stack shares it.
const CHIP_PITCH = 0.072;
const chipStacks = new Map();
export function makeChipStack(color, n) {
  const node = SHIP_PARTS.bj_chip;
  let G = chipStacks.get(n);
  if (!G) {
    const by = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      m.compose(new THREE.Vector3(Math.sin(i * 2.3) * 0.015, i * CHIP_PITCH, Math.cos(i * 1.7) * 0.015), q.setFromAxisAngle(up, i), one);
      for (const { slot, geo } of node.parts) {
        if (!by.has(slot)) by.set(slot, []);
        by.get(slot).push(geo.clone().applyMatrix4(m));
      }
    }
    G = new Map([...by].map(([slot, list]) => [slot, mergeGeometries(list)]));
    G.ink = shellAt(inkShellGeo(G.get('chip'), 0.012), 1);
    chipStacks.set(n, G);
  }
  const g = new THREE.Group();
  for (const [slot, geo] of G) {
    const mesh = new THREE.Mesh(geo, toon(slot === 'chip' ? color : BJ_TOON[slot]));
    mesh.castShadow = true;
    g.add(mesh);
  }
  const h = new THREE.Mesh(G.ink, inkMat);
  h.userData.isInk = true;
  g.add(h);
  return g;
}

// ---- The casino's zero-g claw (built in Blender, see build_claw.py) ----
// `claw_machine`: the 16.4 m glass tank on the hall's front wall (its back at z = 0, its front toward +z; the `glass` slot is the see-through panes, the pivots say where
// the marquee and the console screen go, where the DROP hole is and where the ten ceiling jets are), `claw_claw`: the energy claw, `claw_link`: one link of a chain, and one
// model for each kind of thing in the tank (the salvaged engine and the credits case are the game's own models). clawKindParts() gives what an InstancedMesh needs.
export const CLAW_PROPS = ['claw_machine', 'claw_claw', 'claw_link', 'claw_crate', 'claw_canister', 'claw_gear', 'claw_girder', 'claw_mine', 'claw_magnet', 'claw_tyre', 'claw_hullplate',
  'claw_chip', 'claw_lockbox', 'claw_gem'];
const CLAW_TOON = {
  plum: 0x7c50a0, plum2: 0x9561bc, gold: 0xffd23f, brass: 0xd8aa2e, steel: 0x8a87a0, dark: 0x2a2540, hazard: 0xffd23f, red: 0xd7263d, crate: 0xffffff, cream: 0xfff4e0,
  chipgold: 0xffd23f, rubber: 0x1d1a29,
};
const CLAW_GLOW = { suitred: 0xff2a4a, suitcream: 0xfff4e0, neonpink: 0xff2e88, neoncyan: 0x2ee6ff, glowred: 0xff2a4a, gem: 0x66e6ff, lamp: 0xfff6a8 };
const CLAW_SLOT = (slot) => (slot in CLAW_GLOW ? glowShared(CLAW_GLOW[slot]) : toon(CLAW_TOON[slot] ?? 0xff00ff));
// What floats in the tank (and the claw): the same toon colours with a floor of their own light (a third of the paint), so the side turned away from the hall's lamps is
// dark paint rather than black; `diffuseColor` already carries the crates' per-instance tint.
const clawLitCache = new Map();
export function clawLit(color) {
  let m = clawLitCache.get(color);
  if (!m) {
    m = toon(color, {});
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.32;'); };
    m.customProgramCacheKey = () => 'clawLit';
    clawLitCache.set(color, m);
  }
  return m;
}
const CLAW_ITEM_SLOT = (slot) => (slot in CLAW_GLOW ? glowShared(CLAW_GLOW[slot]) : clawLit(CLAW_TOON[slot] ?? 0xff00ff));
let clawGlass = null;
// (opacity this low: the scene is blended in linear light before the post pass's gamma, so a few percent of a bright cyan already lifts the dark tank to teal and washes out what floats in it)
const clawGlassMat = () => clawGlass || (clawGlass = new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide }));

// The machine's frozen body (the casino merges it) and where its parts are: { stat, glass: [panes], spots: { marquee, screen, drop, jets: [] } } (each spot { pos, w, h, tilt }).
export function makeClawMachine() {
  const node = SHIP_PARTS.claw_machine, stat = new THREE.Group(), glass = [], spots = { jets: [] };
  for (const { slot, geo } of node.parts) {
    if (slot === 'glass') { const m = new THREE.Mesh(geo, clawGlassMat()); m.renderOrder = 3; glass.push(m); stat.add(m); continue; }
    const m = new THREE.Mesh(geo, CLAW_SLOT(slot));
    m.castShadow = !(slot in CLAW_GLOW);
    stat.add(m);
  }
  if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; stat.add(m); }
  for (const k of node.kids) {
    const spot = { pos: k.pos, w: k.data.w, h: k.data.h, tilt: k.data.tilt || 0, r: k.data.r };
    if (k.role === 'jet') spots.jets.push(spot); else spots[k.role] = spot;
  }
  return { stat, glass, spots };
}

// What an InstancedMesh needs to draw a kind of thing from the tank (casino.glb-style baked parts): { parts: [{ geo, material }], ink: geometry | null }. `crate`'s paint is white:
// the view tints each crate per instance. 'engine' and 'case' use the salvage models' own colours.
export function clawKindParts(kind) {
  const node = SHIP_PARTS['claw_' + kind];
  const pal = kind === 'engine' ? ENGINE_TOON : kind === 'case' ? CASE_TOON : null;
  const parts = node.parts.map(({ slot, geo }) => ({
    geo, slot,
    material: pal ? (slot === 'hot' ? glowShared(0xff6a2a) : clawLit(pal[slot] ?? 0x8a87a0)) : CLAW_ITEM_SLOT(slot),
  }));
  return { parts, ink: node.ink };
}
export const clawNode = (name) => SHIP_PARTS[name];
// the claw itself as a Group (its parts and outline shell)
export function makeClawHead() {
  const node = SHIP_PARTS.claw_claw, g = new THREE.Group();
  for (const { slot, geo } of node.parts) { const m = new THREE.Mesh(geo, CLAW_ITEM_SLOT(slot)); m.castShadow = false; g.add(m); }
  if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
  return g;
}

// ---- The casino's Duck Derby (built in Blender, see build_duck.py) ----
// `dd_duck1..4`: the four racers (QUACKERS, SIR WADDLES, DUCKTOR WHO, MOONBILL), each ~1.3 m long facing +x with `head`, `wingR` and `wingL` pivots; the game tints their
// `body`, `wing` and `silk` slots. And the track's pieces: `dd_trough` (water1..4, num1..4 and finishLine pivots), `dd_gate` (lamp1..3, startSign), `dd_grille`, `dd_finish`
// (banner), `dd_board` (face), `dd_kiosk` (screen), `dd_railpost` and `dd_rope`. makeDerbyPart(name) gives a piece as a Group, its pivots as named children (role and
// extras in userData); makeRacer(i, color, bill) a racer as { root, bob, head, wings }.
export const DUCK_PROPS = ['dd_duck1', 'dd_duck2', 'dd_duck3', 'dd_duck4', 'dd_trough', 'dd_gate', 'dd_grille', 'dd_finish', 'dd_board', 'dd_kiosk', 'dd_railpost', 'dd_rope'];
const DD_TOON = {
  plum: 0x4a1766, plum2: 0x6a2a8f, gold: 0xffd23f, brass: 0xc79a1f, cream: 0xfff4e0, red: 0xd7263d, dark: 0x1a1030, tile: 0x2aa3c0, velvet: 0xb3123a, steel: 0xc9c3d9, foam: 0xffffff,
  body: 0xffd23f, wing: 0xe0b72f, bill: 0xff9f1c, silk: 0xff2e88,
};
const DD_GLOW = { suitred: 0xff2a4a, suitcream: 0xfff4e0, lamp: 0xfff6a8, shine: 0xffffff, glowred: 0xff2a4a, glowamber: 0xff9f1c, glowgreen: 0x7dff6a, lane1: 0xffd23f, lane2: 0xff2e88, lane3: 0x2ee6ff, lane4: 0x7dff6a };
let ddGlass = null;
function ddGroup(node, tint, toonMap = DD_TOON, glowMap = DD_GLOW) {
  const g = new THREE.Group();
  g.name = node.name;
  g.position.copy(node.pos);
  g.quaternion.copy(node.quat);
  Object.assign(g.userData, node.data);
  if (node.role) g.userData.role = node.role;
  for (const { slot, geo } of node.parts) {
    const glowing = slot in glowMap;
    let mat;
    if (slot === 'glass') mat = ddGlass || (ddGlass = new THREE.MeshToonMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    else mat = glowing ? glowShared(glowMap[slot]) : toon(tint?.[slot] ?? toonMap[slot] ?? 0xff00ff);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !glowing && slot !== 'glass';
    g.add(m);
  }
  if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
  for (const k of node.kids) g.add(ddGroup(k, tint, toonMap, glowMap));
  return g;
}
export const makeDerbyPart = (name) => ddGroup(SHIP_PARTS[name]);

// ---- The casino's hall kit (built in Blender, see build_hall.py) ----
// The wall bays (`hall_bay0..3`: spade, heart, diamond, club; 4.5 m wide, 16 m tall, the back on the wall, the front toward +z), `hall_filler`, the ceiling tile `hall_coffer`, the floor
// inlay `hall_medallion`, the Chip Bar `hall_bar` (pivot `bar_spin` carries the chip that turns), `hall_sofa` and `hall_table`, the
// doors' frame `hall_gate`, the outside's suit panels `facade_panel0..3` and the roof's drum, dome and lantern `facade_crown`. makeHallPart(name) gives a piece as a Group, its pivots as
// named children (role and extras in userData); the slots are the palette below, and the game never recolours them.
export const HALL_PROPS = ['hall_bay0', 'hall_bay1', 'hall_bay2', 'hall_bay3', 'hall_filler', 'hall_coffer', 'hall_medallion', 'hall_bar', 'hall_sofa', 'hall_table', 'hall_gate', 'facade_panel0', 'facade_panel1', 'facade_panel2', 'facade_panel3', 'facade_crown'];
const HALL_TOON = { plum: 0x4a1766, plum2: 0x6a2a8f, gold: 0xffd23f, brass: 0xc79a1f, cream: 0xfff4e0, dark: 0x1a1030, velvet: 0xb3123a, red: 0xd7263d, pink: 0xff2e88 };
const HALL_GLOW = { suitred: 0xff2a4a, suitcream: 0xfff4e0, lamp: 0xfff6a8, glowcyan: 0x2ee6ff, glowpink: 0xff2e88 };
export const makeHallPart = (name) => ddGroup(SHIP_PARTS[name], null, HALL_TOON, HALL_GLOW);

// ---- The casino's forecourt kit (built in Blender, see build_lot.py; docs/casino-forecourt.md) ----
// `lot_card_wall` (2.4 m of the court's barrier, 0.6 m deep), `lot_card_post` (its end and corner post), `lot_chip_bollard` (the walkway's), `lot_pylon_p` (the parking sign, facing +z) and
// `lot_bay_stud` (a bay's head stop), each standing on y = 0. makeLotPart(name) gives one as a Group (the Asset Row's); lotNode / lotSlot are for baking into a settlement's kit
// (settlements.js dressCasinoLot).
export const LOT_PROPS = ['lot_card_wall', 'lot_card_post', 'lot_chip_bollard', 'lot_pylon_p', 'lot_bay_stud'];
const LOT_TOON = { plum: 0x4a1766, plum2: 0x6a2a8f, gold: 0xffd23f, brass: 0xc79a1f, cream: 0xfff4e0, dark: 0x1a1030, red: 0xd7263d, pink: 0xff2e88 };
const LOT_GLOW = { suitred: 0xff2a4a, suitcream: 0xfff4e0, lamp: 0xfff6a8, glowcyan: 0x2ee6ff, cardface: 0xd9d2ee };
export const makeLotPart = (name) => ddGroup(SHIP_PARTS[name], null, LOT_TOON, LOT_GLOW);
export const lotNode = (name) => SHIP_PARTS[name];
export function lotSlot(slot) {
  return slot in LOT_GLOW ? { color: LOT_GLOW[slot], glow: true } : { color: LOT_TOON[slot] ?? 0xff00ff, glow: false };
}
// ---- Chimera Downs' kits (built in Blender, see build_downs_*.py and downs_common.py; docs/downs-layouts.md) ----
// One file per family, each `dn_*` node standing on y = 0. downsNode / downsSlot are for baking into the Downs' kit (race.js build); makeDownsPart gives a piece as a Group (the Asset Row's).
// The palette is Gold Gleam, Saddle Brown, Black, Money, Barn Red and Touch of Mint (a darker tint of each for shading); slots named glow* and glass* are lit.
const DOWNS_FILES = ['downs-stand', 'downs-club', 'downs-course', 'downs-stalls', 'downs-arcade', 'downs-screen', 'downs-fair', 'downs-stable', 'downs-crowd'];
export const DOWNS_TOON = {
  mint: 0xf8fff8, mint2: 0xdfe8dd, gold: 0xcfb352, gold2: 0xa8903a, saddle: 0xb07c57, saddle2: 0x8c5f3f, black: 0x3b393a, black2: 0x5a5760,
  money: 0x7b9a6e, money2: 0x5b7a52, barn: 0x8b4044, barn2: 0x6a2e33, seat: 0x7b9a6e, cloth: 0x8b4044, accent: 0x8b4044,
};
export const DOWNS_GLOW = { glasswarm: 0xfff0c0, glowgold: 0xffe9a0, glowmint: 0xe8fff0, glowred: 0xff5a4a };
export const makeDownsPart = (name, tint) => ddGroup(SHIP_PARTS[name], tint || null, DOWNS_TOON, DOWNS_GLOW);
// The forecourt's fountain as plain meshes (the Asset Row's), the casino's way (makeFountain): { root, update(t, dt) }; the cup turns and the water runs with `t`.
export function makeDownsFountain() {
  const node = SHIP_PARTS.dn_fountain, root = ddGroup(node, null, DOWNS_TOON, DOWNS_GLOW);
  const water = [];
  for (const k of node.kids) {
    if (k.role === 'spin') continue;
    root.getObjectByName(k.name)?.removeFromParent();
    const m = waterMesh(k); root.add(m); water.push(m);
  }
  const spinner = root.getObjectByName('trophy');
  return { root, spinner, update(t, dt = 0) { if (spinner) spinner.rotation.y += dt * (spinner.userData.speed || 0.7); for (const m of water) m.userData.tick(m, dt, t); } };
}
export const downsNode = (name) => {
  if (!SHIP_PARTS[name]) throw new Error('no Downs model ' + name);
  return SHIP_PARTS[name];
};
export const downsParts = () => Object.keys(SHIP_PARTS).filter((n) => n.startsWith('dn_'));
export function downsSlot(slot, over = {}) {
  if (slot in over) return { color: over[slot], glow: false };
  return slot in DOWNS_GLOW ? { color: DOWNS_GLOW[slot], glow: true } : { color: DOWNS_TOON[slot] ?? 0xff00ff, glow: false };
}
export function makeRacer(i = 1, color = 0xffd23f, bill = 0xff9f1c) {
  const c = new THREE.Color(color);
  const model = ddGroup(SHIP_PARTS['dd_duck' + i], { body: color, wing: c.clone().multiplyScalar(0.85).getHex(), silk: color, bill });
  const root = new THREE.Group(), bob = new THREE.Group();
  root.add(bob);
  bob.add(model);
  return { root, bob, head: model.getObjectByName('dd_duck' + i + '_head'), wings: [model.getObjectByName('dd_duck' + i + '_wingL'), model.getObjectByName('dd_duck' + i + '_wingR')] };
}

// ---- The dish-array stations (built in Blender, see build_dish.py) ----
// The big radio dishes at the research arrays stand on one of two stations, both built for a 30 m mount (the game scales one uniformly,
// size / DISH_SIZE): the CRYO RECEIVER, the Prospector's Helium-3 tanker stood on end under a banded dish, and the GANTRY STATION, a
// crane-like lattice mast over a yard of cargo-container control rooms. The baked tree: the root's own meshes are the whole station
// (its `livery` pivots hold each faction's mark, its `number` pivots the digits for each dish; only the matching ones are built) and
// its `blinker` pivots the warning lamps; `yaw` (turned about y) carries the neck's turning column and the head, `tilt` (a child of
// yaw, turned about x) the trunnion drum, the reflector, its back structure and the feed, with a `blinker` of its own.
export const DISH_SIZE = 30;
export const DISH_KINDS = ['cryo', 'gantry'];
const DISH_FIELD = 'field'; // the small bases' dish (makeDish): not one of the array's two
const DISH_HEAD = 'head'; // the field dish's head alone, lightly built, for the small dishes on masts and roofs (makeDishHead, Kit.dishHead)
const DISH_TOON = { dark: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0, concrete: 0x8a8698, white: 0xf3eee4, dish: 0xfff4e0, seam: 0x8a87a0, tank: 0xc6d6ea, hazard: 0xffd23f, brand: 0x14a3b8, redsafe: 0xc9202e, blue: 0x1d63d6 };
const DISH_GLOW = { glass: 0x9be7ff, window: 0xfff6a8, lamp: 0xfff6a8, tail: 0xff2a4a, green: 0x7dff6a, hot: 0xff9f1c };

// The dishes' liveries: the land-trains' four, and the other three who hold ground. Daedalus (the dark-side purple and cream) has a mark
// and a name on the field dish's plates; the Rustmoon clans (rust and their green) and an unclaimed site are paint only.
const DISH_FACTIONS = {
  ...LAND_TRAIN_FACTIONS,
  daedalus: { body: 0xc77dff, stripe: 0xf3eee4, accent: 0x4a4660, label: 0x2a2540 },
  rustmoon: { body: 0x6a5a48, stripe: 0x7dff3a, accent: 0x2a2540, label: 0xf3eee4 },
  none: { body: 0xc9c3d9, stripe: 0xfff4e0, accent: 0x55607a, label: 0x2a2540 },
};
const FACTION_OF_COLOR = new Map(Object.entries(FACTIONS).map(([key, f]) => [new THREE.Color(f.color).getHex(), key]));
// A faction key, from the key itself or from its colour (what the outposts and the founded bases are built with): 'none' for anything else.
const dishFaction = (f) => (typeof f === 'string' ? (DISH_FACTIONS[f] ? f : 'none') : FACTION_OF_COLOR.get(f) || 'none');

// The colour of a station slot, and whether it glows: body, stripe, accent and label are the faction's livery colours (as on the land-trains).
export function dishSlot(slot, faction = 'meridian') {
  const pal = DISH_FACTIONS[faction] || DISH_FACTIONS.meridian;
  if (slot in pal) return { color: pal[slot], glow: false };
  if (slot in DISH_GLOW) return { color: DISH_GLOW[slot], glow: true };
  return { color: DISH_TOON[slot] ?? 0xff00ff, glow: false };
}

// The baked nodes of a station: the root, its pivots, and the faction's livery and the dish's number (every other pivot of those is left out).
export function dishModel(kind, faction = 'meridian', no = '01') {
  const root = SHIP_PARTS['dish_' + kind];
  if (!root) throw new Error('no dish station ' + kind);
  const find = (n, role) => n.kids.find((k) => k.role === role);
  const yaw = find(root, 'yaw'), tilt = find(yaw, 'tilt');
  const fac = DISH_FACTIONS[faction] ? faction : 'meridian';
  const fixed = [root, ...root.kids.filter((k) => (k.role === 'livery' && k.data.faction === fac) || (k.role === 'number' && k.data.no === no))];
  return { root, fixed, yaw, tilt, blinkers: root.kids.filter((k) => k.role === 'blinker'), tiltBlinkers: tilt.kids.filter((k) => k.role === 'blinker'), size: root.data.size || DISH_SIZE, radius: root.data.radius };
}

// A whole station as plain meshes (the model viewer's, and the field dish's): returns the root group, the pivots to drive and the aircraft
// lamps (they blink: userData.blink). The array sites bake the same parts into their own kit instead (settlements.js dishStation).
export function makeDishStation({ kind = 'cryo', faction = 'meridian', no = '01', size = DISH_SIZE, head = false } = {}) {
  const D = dishModel(kind, faction, no);
  const mats = new Map();
  const matFor = (slot) => {
    if (!mats.has(slot)) { const c = dishSlot(slot, faction); mats.set(slot, c.glow ? glow(c.color) : toon(c.color)); }
    return mats.get(slot);
  };
  const dress = (node, g) => {
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = !(slot in DISH_GLOW);
      g.add(m);
    }
    if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
  };
  const lamps = [];
  const lamp = (b) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(b.data.radius || 0.4, 8, 6), glow(0xff2a4a));
    m.userData.blink = true;
    m.userData.seed = lamps.length * 2.1; // (each lamp its own phase, so they take turns)
    m.position.copy(b.pos);
    lamps.push(m);
    return m;
  };
  const root = new THREE.Group();
  if (!head) { // (a head is the yaw and tilt parts alone: no tower, no lamps)
    for (const n of D.fixed) dress(n, root);
    for (const b of D.blinkers) root.add(lamp(b));
  }
  const yaw = new THREE.Group(), tilt = new THREE.Group();
  yaw.position.copy(D.yaw.pos);
  tilt.position.copy(D.tilt.pos);
  dress(D.yaw, yaw);
  dress(D.tilt, tilt);
  if (!head) for (const b of D.tiltBlinkers) tilt.add(lamp(b));
  yaw.add(tilt);
  root.add(yaw);
  root.scale.setScalar(size / D.size);
  return { root, yaw, tilt, lamps };
}

// Shuttle-bus: a fat lifting-body hopper with a wraparound windscreen, porthole windows, two
// ducted lift-fans on pylons, a V-tail, a lit route board on the roof, three folding legs and a
// rear door that drops into a ramp.
export function makeShuttle({ color = 0xfff4e0, stripe = 0x2ec4ff } = {}) {
  return makeShip('shuttle', { color, stripe });
}

// Which Courier light-bike gets built: 'a' (Slipstream) or 'b' (Parcel Runner), the Blender redesigns (docs/courier-proposals,
// tools/blender/build_courier.py), or 'classic', the original built from primitives below. Kept across launches; the dev menu's
// COURIER MODEL switches it (it applies to the next bike you call).
export const BIKE_STYLES = ['b', 'a', 'classic'];
const BIKE_KEY = 'mr-courier-model';
let bikeStyle = 'b';
try { const k = localStorage.getItem(BIKE_KEY); if (BIKE_STYLES.includes(k)) bikeStyle = k; } catch { /* unavailable */ }
export const getBikeStyle = () => bikeStyle;
export function setBikeStyle(k) {
  bikeStyle = BIKE_STYLES.includes(k) ? k : 'b';
  try { localStorage.setItem(BIKE_KEY, bikeStyle); } catch { /* unavailable */ }
}

// A Blender light-bike (build_courier.py): the shell, forks and fittings on a chassis, two wheels spun about x. Slots: the
// livery glows `stripe` (the bike's colour) and `trim` (the gold), the fixed toons and glows below, and `bag` (the saddle bags: the
// trim colour as a toon). The root carries the rider's solved pose (`pose_*`) and hip (`seat`), which the Garage and the player read.
const BIKE_TOON = { navy: 0x0d1428, panel: 0x1a2440, dark: 0x2a2540, metal: 0x5b5870, seat: 0x2a2540, tire: 0x1d1a29 };
const BIKE_GLOW = { glass: 0x9be7ff, lamp: 0xfff6a8, tail: 0xff2a4a };
const BIKE_SCALE = 1.2; // (built 1:1, shown at 1.2x)
function makeBlenderBike(B, { color, trim }) {
  const root = new THREE.Group();
  root.scale.setScalar(BIKE_SCALE);
  const matFor = (slot) => {
    if (slot === 'stripe') return glow(color);
    if (slot === 'trim') return glow(trim);
    if (slot === 'bag') return toon(trim);
    if (BIKE_GLOW[slot] !== undefined) return glow(BIKE_GLOW[slot]);
    return toon(BIKE_TOON[slot] ?? 0xff00ff);
  };
  const lit = (slot) => slot === 'stripe' || slot === 'trim' || BIKE_GLOW[slot] !== undefined;
  const dress = (node, g) => {
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = !lit(slot);
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
  };
  const chassis = new THREE.Group();
  dress(B.kids.find((k) => k.role === 'chassis'), chassis);
  root.add(chassis);
  // the wheels hang off the root, as the classic bike's do, so the chassis can move without them
  const wheels = [];
  for (const k of B.kids.find((n) => n.role === 'chassis').kids.filter((n) => n.role === 'wheel')) {
    const w = new THREE.Group();
    w.position.copy(k.pos);
    dress(k, w);
    root.add(w);
    wheels.push(w);
  }
  const d = B.data;
  const P = (k) => d['pose_' + k];
  return {
    root, chassis, wheels, gun: new THREE.Group(),
    trailFrom: B.kids.find((k) => k.role === 'trail').pos.clone(), trailColor: color, wheelR: 0.78 * BIKE_SCALE,
    // where the rider's hip sits (the bike's frame, scaled) and the pose that puts their hands on the grips and keeps their legs out of the shell
    seat: new THREE.Vector3(d.seat[0], d.seat[1], d.seat[2]).multiplyScalar(BIKE_SCALE),
    pose: { lean: P('lean'), thigh: P('thigh'), spread: P('spread'), armX: P('arm_x'), armZ: P('arm_z'), elbow: P('elbow') },
  };
}

// Meridian Courier Light-Bike (the classic one, built here from primitives: see makeBlenderBike above for the Blender redesigns): a sleek shell whose nose and tail ARE the curved fairings over its two
// hubless wheels (the wells sweep round the top of each wheel, down to the axle), with a hump for the
// rider between them. The flanks carry raised side panels, vents, glowing arcs tracing each well and a
// seam down the length; a tinted canopy, a seat, clip-ons and pegs. Built 1:1, shown at 1.2x. Forward
// is +z. Returns { root, chassis, wheels, gun, trailFrom, trailColor } (trailFrom: where the light trail
// streams from, in the bike's own frame).
export function makeLightBike({ color = 0x2ec4ff, trim = 0xffd23f, style = bikeStyle } = {}) {
  const B = style !== 'classic' && SHIP_PARTS && SHIP_PARTS['bike_' + style];
  if (B) return makeBlenderBike(B, { color, trim });
  const root = new THREE.Group();
  root.scale.setScalar(1.2);
  const chassis = new THREE.Group();
  root.add(chassis);
  const W = 0.5, WZ = 1.6, WY = 0.75, RO = 0.98, RI = 0.84; // shell width, wheel spots, fairing radii
  chassis.add(baked(`bike2|${color}|${trim}`, (k) => {
    // side profile (z, y): outer edge over the front wheel, the rider's hump, over the rear wheel,
    // then back along the insides of the wells and the belly between them
    const arc = (cz, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cz + Math.cos(a) * r, WY + Math.sin(a) * r]; });
    const outline = [
      ...arc(WZ, RO, 0, 2.55),                    // nose: over the front wheel
      [0.55, 1.5], [0.05, 1.58], [-0.35, 1.32], [-0.75, 1.22], // tank hump, then the seat dip
      [-1.05, 1.42],                              // tail rise
      ...arc(-WZ, RO, 0.6, Math.PI),              // tail: over the rear wheel
      ...arc(-WZ, RI, Math.PI, 0),                // back along the inside of the rear well
      [-0.6, 0.48], [0.6, 0.48],                  // the belly
      ...arc(WZ, RI, Math.PI, 0),                 // the inside of the front well
    ];
    const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
    const shell = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, steps: 1, curveSegments: 4 });
    shell.rotateY(-Math.PI / 2).translate(W / 2, 0, 0); // shape x -> +z, extrusion -> x, centred
    k.add(shell, KT(0x0d1428), 0, 0, 0, { outline: 0.06 });
    const side = W / 2 + 0.085; // the flank's outer face
    const glowA = KG(color), glowB = KG(trim), panel = KT(0x1a2440), dark = KT(0x070a14);
    for (const sx of [-1, 1]) {
      // glowing arcs tracing each wheel well, and a seam down the length between them
      for (const cz of [WZ, -WZ]) {
        const span = cz > 0 ? 2.5 : Math.PI - 0.6, start = cz > 0 ? 0.05 : 0.6;
        k.add(new THREE.TorusGeometry((RO + RI) / 2, 0.028, 4, 24, span).rotateZ(start).rotateY(-Math.PI / 2), glowA, sx * (side + 0.01), WY, cz, { outline: 0 });
      }
      k.add(new THREE.BoxGeometry(0.03, 0.06, 2.0), glowA, sx * (side + 0.01), 0.95, 0, { outline: 0 });
      // a raised side panel over the hump, with a gold pin-stripe along its top
      const ps = new THREE.Shape([[0.65, 0.98], [0.25, 1.38], [-0.3, 1.18], [-0.85, 1.12], [-0.9, 0.98]].map(([z, y]) => new THREE.Vector2(z, y)));
      const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }).rotateY(-Math.PI / 2);
      k.add(pg, panel, sx * (side + (sx > 0 ? 0.06 : 0)), 0, 0, { outline: 0.02 });
      k.add(new THREE.BoxGeometry(0.03, 0.035, 1.05), glowB, sx * (side + 0.07), 1.2, -0.3, { rx: 0.08, outline: 0 });
      // intake vents behind the front fairing
      for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(0.03, 0.22, 0.06), dark, sx * (side + 0.02), 0.82, 0.62 - i * 0.12, { rx: -0.35, outline: 0 });
      // a little Meridian chevron on the tail fairing
      k.add(new THREE.BoxGeometry(0.03, 0.05, 0.28), glowB, sx * (side + 0.02), 1.32, -1.55, { rx: 0.5, outline: 0 });
      k.add(new THREE.BoxGeometry(0.03, 0.05, 0.28), glowB, sx * (side + 0.02), 1.22, -1.55, { rx: -0.5, outline: 0 });
      // footpegs
      k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 6).rotateZ(Math.PI / 2), KT(0x5b5870), sx * 0.42, 0.66, -0.55, { outline: 0 });
    }
    // spine stripe, seat, canopy over the tank, headlight in the nose, light bar on the tail
    k.add(new THREE.BoxGeometry(0.12, 0.04, 1.0), glowA, 0, 1.6, 0.25, { rx: -0.05, outline: 0 });
    k.add(new THREE.BoxGeometry(W - 0.02, 0.1, 0.65), KT(0x2a2540), 0, 1.27, -0.6, { rx: 0.05, outline: 0.02 });
    k.add(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.72, 0.55, 1.45), KG(0x9be7ff), 0, 1.46, 0.55, { rx: -0.36, outline: 0.03 });
    k.add(new THREE.BoxGeometry(0.34, 0.08, 0.1), KG(0xfff6a8), 0, 1.5, 2.36, { rx: -0.9, outline: 0 });
    k.add(new THREE.BoxGeometry(W + 0.1, 0.08, 0.08), glowA, 0, 1.58, -2.12, { rx: 0.7, outline: 0 });
    // clip-on bars
    k.add(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 6).rotateZ(Math.PI / 2), KT(0x3a3550), 0, 1.5, 0.75, { outline: 0.02 });
    for (const sx of [-1, 1]) k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6).rotateZ(Math.PI / 2), KT(0x5b5870), sx * 0.48, 1.5, 0.75, { outline: 0 });
  }));
  // hubless wheels: a dark tyre with a glowing rim on each face (spun about x by the garage)
  const wheels = [];
  for (const z of [-WZ, WZ]) {
    const w = new THREE.Group();
    w.position.set(0, WY, z);
    w.add(baked(`bikewheel2|${color}`, (k) => {
      k.add(new THREE.TorusGeometry(0.62, 0.15, 8, 28).rotateY(Math.PI / 2), KT(0x0b0912), 0, 0, 0, { outline: 0.03 });
      k.add(new THREE.CylinderGeometry(0.62, 0.62, 0.34, 28, 1, true).rotateZ(Math.PI / 2), KT(0x0b0912), 0, 0, 0, { outline: 0 });
      for (const sx of [-1, 1]) k.add(new THREE.TorusGeometry(0.5, 0.045, 6, 28).rotateY(Math.PI / 2), KG(color), sx * 0.18, 0, 0, { outline: 0 });
      for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(0.03, 0.06, 0.95), KG(color), 0, 0, 0, { rx: (i / 3) * Math.PI, outline: 0 });
    }));
    root.add(w);
    wheels.push(w);
  }
  return { root, chassis, wheels, gun: new THREE.Group(), trailFrom: new THREE.Vector3(0, 0.15, -WZ), trailColor: color };
}

// A light trail: a glowing wall that streams out behind something and fades over `life` seconds, laid on a
// strip of glowing floor `width` across so it has body from any angle (a lone ribbon vanishes edge-on). Feed
// it a world point (where it streams from) and the local up each frame; it lives in world space. `max` points
// at `step` metres apart must reach `life` seconds at the top speed: 256 x 0.45 m is 115 m, 3.4 s at 34 m/s.
export class LightTrail {
  constructor(scene, color, { life = 4, height = 1.5, width = 0.6, max = 256, step = 0.45 } = {}) {
    this.life = life; this.height = height; this.width = width; this.max = max; this.step2 = step * step;
    this.pts = []; // { p, up, t }
    this.t = 0;
    const geo = new THREE.BufferGeometry();
    // four vertices a point: the wall's foot and top, the floor strip's left and right
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 4 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 4 * 4), 4));
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const a = i * 4, b = a + 4; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2); }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  // p: world point at the ribbon's foot, up: world up there, emit: false lets it fade out
  update(dt, p, up, emit = true) {
    this.t += dt;
    const last = this.pts[this.pts.length - 1];
    if (emit && p && (!last || last.p.distanceToSquared(p) > this.step2)) {
      this.pts.push({ p: p.clone(), up: up.clone(), t: this.t });
      if (this.pts.length > this.max) this.pts.shift();
    } else if (emit && p && last) { last.p.copy(p); last.up.copy(up); last.t = this.t; } // the head follows the bike
    while (this.pts.length && this.t - this.pts[0].t > this.life) this.pts.shift();
    const pos = this.mesh.geometry.attributes.position, col = this.mesh.geometry.attributes.color;
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const j = Math.min(i, Math.max(0, n - 1)), q = this.pts[j];
      const k = !q || i >= n ? 0 : Math.max(0, 1 - (this.t - q.t) / this.life);
      const a = k * (2 - k); // holds bright, then eases away at the tail end
      if (q) {
        const h = this.height * (0.45 + 0.55 * k);
        pos.setXYZ(i * 4, q.p.x, q.p.y, q.p.z);
        pos.setXYZ(i * 4 + 1, q.p.x + q.up.x * h, q.p.y + q.up.y * h, q.p.z + q.up.z * h);
        // across the path: up x (the way the trail runs), which narrows towards the old end
        const p0 = this.pts[Math.max(0, j - 1)].p, p1 = this.pts[Math.min(n - 1, j + 1)].p;
        _tr.copy(p1).sub(p0);
        _tr.crossVectors(q.up, _tr);
        const w = _tr.lengthSq() > 1e-8 ? (this.width * (0.5 + 0.5 * k)) / (2 * _tr.length()) : 0;
        pos.setXYZ(i * 4 + 2, q.p.x - _tr.x * w, q.p.y - _tr.y * w, q.p.z - _tr.z * w);
        pos.setXYZ(i * 4 + 3, q.p.x + _tr.x * w, q.p.y + _tr.y * w, q.p.z + _tr.z * w);
      }
      col.setXYZW(i * 4, a, a, a, a);
      col.setXYZW(i * 4 + 1, a * 0.45, a * 0.45, a * 0.45, a * 0.3);
      col.setXYZW(i * 4 + 2, a * 0.6, a * 0.6, a * 0.6, a * 0.6);
      col.setXYZW(i * 4 + 3, a * 0.6, a * 0.6, a * 0.6, a * 0.6);
    }
    pos.needsUpdate = col.needsUpdate = true;
    this.mesh.visible = n > 1;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
const _tr = new THREE.Vector3();

// ---- The hover-cars (built in Blender, see build_hovercar.py) ----
// The smallest road vehicle, in two sets from one body style, about 6.5 m long and 3.9 m over the pods: the FACTION car (a low, sharp
// hull in a faction's colours; SPACECOM's alone carries the roof light bar) and the CIVILIAN car (a rounder two-tone with a side-on rack and luggage on its lengthened trunk,
// in one of CAR_PAINTS: none black, none a faction colour). Slots: body, roof (the civilian number plate; the paints' cream), stripe (faction trim / civilian accent), trim,
// dark, and the glowing glass, lamp, tail, lift (the four hover pads) and beaconA / beaconB (the light bar's two lamps).
export const CAR_FACTIONS = {
  spacecom: { body: 0xf2ecdc, stripe: 0xffd23f }, // white and yellow
  vostok: { body: 0x6b6f78, stripe: 0xff3b5c }, // slate and red
  kepler: { body: 0xff9f1c, stripe: 0x6a8f3a }, // orange and the Mule's green (cream hid the headlamps)
  meridian: { body: 0x2ec4ff, stripe: 0x16385e }, // cyan and navy
};
export const CAR_PAINTS = [
  { name: 'Bubblegum', body: 0xff7ad9, roof: 0xfff4e0, stripe: 0xffd0ee },
  { name: 'Turquoise', body: 0x1fc7b0, roof: 0xf0dfb8, stripe: 0xfff4e0 },
  { name: 'Periwinkle', body: 0x7b8cff, roof: 0xf4f0ff, stripe: 0xffe08a },
  { name: 'Mocha', body: 0x9a6b4f, roof: 0xf1e2cf, stripe: 0xe8b88a },
  { name: 'Seafoam', body: 0x8ee6c0, roof: 0xffffff, stripe: 0xffb3a1 },
];
const CAR_GLOW = { glass: 0x9be7ff, lamp: 0xfff6a8, tail: 0xff2a4a, beaconA: 0xff2a4a, beaconB: 0x2e7bff };
// faction: the car's faction (one of CAR_FACTIONS, else it is a civilian car); paint: which of CAR_PAINTS the civilian car wears.
// Returns { root, size, beacons } (the light bar's lamp groups, each with userData.phase 0 or 1, for traffic to alternate).
export function makeHoverCar({ faction = null, paint = 0 } = {}) {
  const fac = CAR_FACTIONS[faction];
  const B = SHIP_PARTS[fac ? 'car_faction' : 'car_civilian'];
  const pal = fac ? { ...fac, trim: 0x8a87a0, dark: 0x2a2540, lift: 0x7be0ff } : { ...CAR_PAINTS[((paint % CAR_PAINTS.length) + CAR_PAINTS.length) % CAR_PAINTS.length], trim: 0xd8d4e8, dark: 0x5b5870, lift: 0xffe6a8 };
  const mats = new Map();
  const matFor = (slot) => {
    if (!mats.has(slot)) mats.set(slot, slot === 'lift' || slot in CAR_GLOW ? glow(pal[slot] ?? CAR_GLOW[slot]) : toon(pal[slot] ?? 0xff00ff));
    return mats.get(slot);
  };
  const beacons = [];
  const build = (node) => {
    if (node.role === 'livery' && node.data.faction !== faction) return null; // (SPACECOM's light bar is the only livery part)
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = !(slot === 'lift' || slot in CAR_GLOW);
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    if (node.role === 'beacon') { g.userData.phase = node.data.phase || 0; beacons.push(g); }
    for (const k of node.kids) {
      const c = build(k);
      if (c) g.add(c);
    }
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  return { root, size: 3 * 1.15 * 1.18, beacons };
}

// Freighter: a deep-haul hammerhead: a long flat deck you can ride, a raked bridge tower at the
// bow, container racks down both flanks, swept radiator wings, a four-bell engine cluster, four
// folding legs and a belly ramp.
export function makeFreighter({ color = 0xb8b4c8, stripe = 0xff9f1c, faction = 'kepler' } = {}) {
  return makeShip('freighter', { color, stripe, faction });
}

// Captain Kade's gun truck: a mad-max monster truck on huge tyres. Kade drives (open cab, roll
// cage); a lackey works a turret on the bed with a six-barrel gatling and a fat flak cannon.
// Origin on the ground, +Z forward. turret (yaw) > pitch (elevation) > gatSpin (barrels).
export function makeKadeTruck() {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  const BODY = 0x3a1f2a, RED = 0xd7263d, RUST = 0x7a4a32, IRON = 0x55607a, BLK = 0x1d1a29;
  chassis.add(baked('kadetruck', (k) => {
    // ladder frame and axles high over the tyres
    k.box(5.4, 0.7, 11.6, KT(BLK), 0, 2.4, 0, { outline: 0.08 });
    for (const z of [-4.4, 4.4]) k.add(new THREE.CylinderGeometry(0.3, 0.3, 7.6, 8).rotateZ(Math.PI / 2), KT(IRON), 0, 2.2, z, { outline: 0.03 });
    // the body: armoured tub, cab up front, a raised bed behind
    k.box(6.2, 1.8, 11, KT(BODY), 0, 3.1, 0, { outline: 0.12 });
    k.box(6.3, 0.3, 11.1, KT(RED), 0, 4.0, 0, { outline: 0 });
    k.add(new THREE.BoxGeometry(5.6, 1.4, 3.2), KT(BODY), 0, 5.2, 2.6, { rx: -0.25, outline: 0.08 }); // hood, raked
    k.box(4.6, 1.6, 2.6, KT(BODY), 0, 4.9, 0.4, { outline: 0.08 }); // cab sides
    k.box(4.4, 0.9, 0.15, KG(0xff4f2e), 0, 5.5, 1.75, { outline: 0 }); // glowing slit windscreen
    // roll cage over the open cab
    for (const sx of [-1, 1]) {
      k.beam([sx * 2.1, 6.4, 1.6], [sx * 2.0, 8.0, 0.6], 0.14, KT(IRON), { outline: 0.03 });
      k.beam([sx * 2.1, 6.4, -0.9], [sx * 2.0, 8.0, -0.4], 0.14, KT(IRON), { outline: 0.03 });
      k.beam([sx * 2.0, 8.0, 0.6], [sx * 2.0, 8.0, -0.4], 0.14, KT(IRON), { outline: 0 });
    }
    k.beam([-2.0, 8.0, 0.6], [2.0, 8.0, 0.6], 0.14, KT(IRON), { outline: 0 });
    // bull bar with spikes, and a skull on the grille
    k.box(6.6, 1.2, 0.5, KT(IRON), 0, 3.0, 5.9, { outline: 0.06 });
    for (let i = 0; i < 6; i++) k.add(new THREE.ConeGeometry(0.22, 1.1, 6).rotateX(Math.PI / 2), KT(0xd8d4e8), -2.75 + i * 1.1, 3.6, 6.4, { outline: 0.02 });
    k.ball(0.55, KT(0xfff4e0), 0, 4.3, 5.85, { outline: 0.04 });
    for (const sx of [-1, 1]) k.ball(0.15, KG(RED), sx * 0.22, 4.4, 6.35, { outline: 0 });
    // scrap plates welded down the flanks, exhaust stacks belching flame
    for (const [x, z, c] of [[3.15, 2.5, RUST], [3.15, -2.0, IRON], [-3.15, 1.0, RUST], [-3.15, -3.0, 0x6b5a3a]]) k.box(0.15, 1.3, 2.6, KT(c), x, 2.8, z, { rz: Math.sign(x) * 0.06, outline: 0.03 });
    for (const sx of [-1, 1]) {
      k.cyl(0.3, 0.35, 4.2, 8, KT(IRON), sx * 2.6, 4.0, -0.9, { outline: 0.03 });
      k.cyl(0.32, 0.32, 0.3, 8, KG(0xff9f1c), sx * 2.6, 8.2, -0.9, { outline: 0 });
    }
    // the turret ring on the bed
    k.cyl(1.9, 2.1, 0.8, 16, KT(IRON), 0, 4.0, -3.3, { outline: 0.05 });
    k.ring(1.95, 0.12, KT(RED), 0, 4.8, -3.3);
    // rear: armoured tailgate, tail lights, a Rustmoon flag pole
    k.box(6.0, 1.6, 0.4, KT(RUST), 0, 3.0, -5.7, { outline: 0.05 });
    for (const sx of [-1, 1]) k.box(0.7, 0.3, 0.12, KG(0xff2a4a), sx * 2.4, 4.0, -5.92, { outline: 0 });
    k.cyl(0.06, 0.08, 5, 5, KT(BLK), -2.8, 4.0, -5.2, { outline: 0 });
  }));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), toon(0x111111, { side: THREE.DoubleSide }));
  flag.position.set(-4.0, 8.4, -5.2);
  chassis.add(flag);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), toon(0xffffff));
  skull.position.set(-4.0, 8.45, -5.17);
  chassis.add(skull);
  // the man himself, behind the wheel
  const kade = makeRunner({ suit: 0x1a1a1a, accent: 0xff2a3a, helmet: 0x2b2b2b, visor: 0xff2a3a, scarf: 0xd7263d, pirate: true });
  kade.root.position.set(-0.9, 4.0, 0.2);
  kade.legL.rotation.x = kade.legR.rotation.x = -1.4;
  if (kade.armL) kade.armL.rotation.x = -1.2;
  if (kade.armR) kade.armR.rotation.x = -1.2;
  chassis.add(kade.root);
  // turret: a yawing mount, an elevating cradle with both guns, the gunner standing behind it
  const turret = new THREE.Group();
  turret.position.set(0, 4.8, -3.3);
  chassis.add(turret);
  turret.add(baked('kadeturret', (k) => {
    k.cyl(1.4, 1.6, 0.9, 12, KT(BODY), 0, 0, 0, { outline: 0.05 });
    k.box(2.8, 1.4, 0.3, KT(IRON), 0, 0.9, 1.1, { outline: 0.04 }); // gun shield
    k.box(2.9, 0.2, 0.32, KT(RED), 0, 2.2, 1.1, { outline: 0 });
  }));
  const gunner = makeRunner({ suit: 0x3a2b4f, accent: 0x7dff3a, helmet: 0x2b2b2b, visor: 0x7dff3a, scarf: 0xd7263d, pirate: true });
  gunner.root.position.set(0, 0.6, -1.2);
  if (gunner.armL) gunner.armL.rotation.x = -1.3;
  if (gunner.armR) gunner.armR.rotation.x = -1.3;
  turret.add(gunner.root);
  const pitch = new THREE.Group();
  pitch.position.set(0, 1.6, 0.4);
  turret.add(pitch);
  pitch.add(baked('kadeguns', (k) => {
    k.box(2.4, 0.9, 1.6, KT(BLK), 0, -0.45, 0, { outline: 0.04 });
    // flak cannon on the right: a fat barrel with a muzzle brake
    k.add(new THREE.CylinderGeometry(0.42, 0.5, 3.6, 12).rotateX(Math.PI / 2), KT(IRON), 0.85, 0, 2.2, { outline: 0.04 });
    k.add(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 12).rotateX(Math.PI / 2), KT(BLK), 0.85, 0, 4.0, { outline: 0.03 });
  }));
  // the gatling on the left spins
  const gatSpin = new THREE.Group();
  gatSpin.position.set(-0.85, 0, 1.0);
  pitch.add(gatSpin);
  gatSpin.add(baked('kadegat', (k) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.add(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6).rotateX(Math.PI / 2), KT(IRON), Math.cos(a) * 0.28, Math.sin(a) * 0.28, 1.6, { outline: 0.01 });
    }
    k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10).rotateX(Math.PI / 2), KT(BLK), 0, 0, 2.9, { outline: 0.02 });
    k.add(new THREE.CylinderGeometry(0.48, 0.48, 0.9, 10).rotateX(Math.PI / 2), KT(BLK), 0, 0, 0.2, { outline: 0.03 });
  }));
  const gatMuzzle = new THREE.Object3D(); gatMuzzle.position.set(-0.85, 0, 4.4); pitch.add(gatMuzzle);
  const flakMuzzle = new THREE.Object3D(); flakMuzzle.position.set(0.85, 0, 4.5); pitch.add(flakMuzzle);
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = rWheel(2.1, 1.7);
    w.position.set(sx * 3.9, 2.1, sz * 4.4);
    root.add(w);
    wheels.push(w);
  }
  return { root, chassis, wheels, turret, pitch, gatSpin, gatMuzzle, flakMuzzle, flag, kade, gunner };
}

// Defence turret: an armoured octagonal base with a glowing collar, and a head (yawed by
// enemies.updateTurret around its pivot at y 3.1, barrels along +z) with a sloped cupola, twin
// barrels with muzzle brakes, cooling fins, ammo pods and a sensor eye. Baked per faction colour
// with the outpost Kit (a few merged meshes), cloned for every turret.
const TURRET_PARTS = new Map();
function turretParts(color) {
  let t = TURRET_PARTS.get(color);
  if (t) return t;
  const dark = 0x3a3550, steel = 0x55607a, ink = 0x1d1a29;
  const base = new Kit(color, 7, false);
  base.cyl(2.3, 2.6, 0.6, 8, KT(dark), 0, 0, 0, { outline: 0.06 });
  base.cyl(1.7, 2.2, 1.8, 8, KT(0x4a4660), 0, 0.6, 0, { outline: 0.08 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    base.add(new THREE.BoxGeometry(0.5, 1.6, 0.25), KT(steel), Math.sin(a) * 1.95, 1.4, Math.cos(a) * 1.95, { ry: a, rx: 0.25, outline: 0 });
  }
  base.cyl(1.85, 1.75, 0.5, 16, KT(color), 0, 2.4, 0, { outline: 0.05 });
  base.ring(1.86, 0.1, KG(0xff2a4a), 0, 2.2, 0);
  base.box(0.9, 1.1, 0.12, KT(ink), 0, 0.8, 2.05, { rx: 0.2, outline: 0 });
  base.box(0.5, 0.12, 0.12, KG(0xffd23f), 0, 2.05, 2.0, { outline: 0 });
  const head = new Kit(color, 9, false);
  // cupola: an octagonal frustum, a faction band and a flat armoured roof
  head.cyl(1.25, 1.55, 1.3, 8, KT(color), 0, -0.65, -0.1, { outline: 0.08 });
  head.cyl(1.58, 1.58, 0.25, 8, KT(dark), 0, -0.2, -0.1, { outline: 0 });
  head.cyl(1.05, 1.25, 0.35, 8, KT(0x4a4660), 0, 0.65, -0.1, { outline: 0.05 });
  // mantlet and twin barrels with muzzle brakes and fins
  head.box(1.7, 1.0, 0.7, KT(dark), 0, -0.55, 1.2, { outline: 0.05 });
  for (const sx of [-0.42, 0.42]) {
    head.add(new THREE.CylinderGeometry(0.17, 0.2, 2.8, 10).rotateX(Math.PI / 2), KT(ink), sx, -0.1, 2.5, { outline: 0.03 });
    head.add(new THREE.CylinderGeometry(0.27, 0.27, 0.5, 8).rotateX(Math.PI / 2), KT(steel), sx, -0.1, 3.8, { outline: 0.02 });
    for (let i = 0; i < 3; i++) head.add(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 10).rotateX(Math.PI / 2), KT(steel), sx, -0.1, 1.9 + i * 0.25, { outline: 0 });
  }
  // ammo pods on the flanks, sensor eye, antenna
  for (const s of [-1, 1]) {
    head.box(0.5, 0.9, 1.5, KT(steel), s * 1.55, -0.6, -0.2, { outline: 0.04 });
    head.box(0.52, 0.12, 1.2, KT(color), s * 1.55, -0.1, -0.2, { outline: 0 });
  }
  head.ball(0.3, KG(0xff2a4a), 0.75, 0.3, 0.95, { outline: 0 });
  head.cyl(0.32, 0.32, 0.3, 10, KT(dark), 0.75, 0.15, 0.85, { outline: 0.02 });
  head.cyl(0.04, 0.05, 1.6, 5, KT(ink), -0.7, 0.9, -0.8, { outline: 0 });
  head.ball(0.1, KG(color), -0.7, 2.55, -0.8, { outline: 0 });
  t = { base: base.finish().root, head: head.finish().root };
  TURRET_PARTS.set(color, t);
  return t;
}
export function makeTurret({ color = 0x2b59c3 } = {}) {
  const P = turretParts(color);
  const root = new THREE.Group();
  root.add(P.base.clone());
  const head = new THREE.Group();
  head.position.y = 3.1;
  head.add(P.head.clone());
  root.add(head);
  return { root, head };
}

export function makeCrate(color = 0xffd23f, size = 0.9) {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(size, size * 0.8, size), toon(color), 0, 0, 0, 0.05));
  g.add(part(new THREE.BoxGeometry(size * 1.04, size * 0.18, size * 1.04), toon(0x1d1a29), 0, 0, 0, 0));
  g.add(part(new THREE.SphereGeometry(size * 0.12, 6, 4), glow(0x2ee6ff), 0, size * 0.45, 0, 0));
  return g;
}

// A dish head alone, for a roof or a post: the field dish's reflector, trunnions, turning neck and feed without the tower, lightly built (no
// lamps, no colliders), its rim `rim` m from the axis, in `faction`'s paint. Its origin is the foot of the neck, so it stands on whatever the neck
// is set on; the pivots are returned to aim it (yaw turns about the vertical; at tilt -0.5 and yaw 0 it opens up and towards -z).
const DISH_RIM = 14.1, DISH_NECK = 21.2, DISH_PIVOT = 28.5; // the field dish's rim radius, the height of the neck's foot and of the pivot, at size 30
export function makeDishHead(rim, faction = 'none') {
  const k = rim / DISH_RIM;
  const d = makeDishStation({ kind: DISH_HEAD, faction, size: DISH_SIZE * k, head: true });
  d.root.position.y = -DISH_NECK * k;
  const root = new THREE.Group();
  root.add(d.root);
  return { root, yaw: d.yaw, tilt: d.tilt };
}

// The same head baked into a kit (the outposts', the settlements', the founded bases'): its neck's foot at (x, y, z) in the current frame,
// `faction` a key or a faction's colour. It turns `az` about the vertical (0: it opens up and towards -z, PI: towards +z) and nods `el`
// (-0.5: up a little over 45 degrees; -1.4: nearly sideways). With `spin` (rad/s) it is a moving piece instead, turning about the vertical
// through (x, y, z) on a boom `arm` m long (the head stands at its end, facing out for az PI), and the piece is returned.
Kit.prototype.dishHead = function (x, y, z, rim, faction, { az = 0, el = -0.5, spin = 0, arm = 0 } = {}) {
  const f = dishFaction(faction), D = dishModel(DISH_HEAD, f), k = rim / DISH_RIM;
  const mat = (slot) => { const c = dishSlot(slot, f); return c.glow ? KG(c.color) : KT(c.color); };
  const turn = new THREE.Matrix4().makeRotationY(az), nod = new THREE.Matrix4().makeRotationX(el), S = new THREE.Matrix4().makeScale(k, k, k);
  const yawM = turn.clone().multiply(S), tiltM = turn.clone().multiply(nod).multiply(S);
  const rise = (DISH_PIVOT - DISH_NECK) * k; // how far the pivot stands over the neck's foot
  const bake = (kit, at) => { kit.baked(D.yaw, mat, at.clone().multiply(yawM)); kit.baked(D.tilt, mat, at.clone().multiply(tiltM)); };
  if (!spin) {
    bake(this, new THREE.Matrix4().makeTranslation(x, y + rise, z));
    return null;
  }
  const q = new Kit(this.c, 1, false);
  bake(q, new THREE.Matrix4().makeTranslation(0, rise, arm));
  if (arm) q.beam([0, 0, 0], [0, 0, arm], 1.2 * k, KT(0x3a3550));
  const piece = q.finish().root;
  piece.userData.spin = spin;
  return this.dyn(piece, x, y, z);
};

// The small bases' dish (ILMB, the Daedalus relay, the Vostok and Daedalus posts, the Asset Row): the field dish of build_dish.py, an
// eight-sided tower with a gallery and a caged ladder over an equipment-room container, under the same truss-backed reflector as the
// array's gantry station, in `faction`'s paint with its mark on the tower and the room. `size` is the old dish's (the tower is 0.7 x
// size tall, the rim 0.47 x size out). Returns { root, yaw, tilt, lamps, cols }: the pivots to drive (yaw turns about the
// vertical, tilt nods; the lamps blink) and what is solid, in the dish's own frame (the caller adds where it stands).
export function makeDish(size = 10, faction = 'none') {
  const k = size / DISH_SIZE;
  const d = makeDishStation({ kind: DISH_FIELD, faction, size });
  d.tilt.rotation.x = -0.7;
  const cols = [{ type: 'cyl', x: 0, z: 0, y0: -2, y1: DISH_NECK * k, r: 5.2 * k }, { type: 'box', x: 7 * k, y: 1.6 * k, z: 0, hx: 1.4 * k, hy: 1.45 * k, hz: 3.15 * k }];
  return { ...d, cols };
}

// --- traffic of all sizes ---



export function makeRocket({ color = 0xfff4e0, stripe = 0xff4f2e } = {}) {
  const root = new THREE.Group();
  const bodyM = toon(color), stripeM = toon(stripe);
  root.add(part(new THREE.CylinderGeometry(4, 4.4, 30, 18), bodyM, 0, 19, 0, 0.25));
  root.add(part(new THREE.ConeGeometry(4, 10, 18), stripeM, 0, 39, 0, 0.25));
  root.add(part(new THREE.CylinderGeometry(4.45, 4.45, 3, 18), stripeM, 0, 22, 0, 0));
  root.add(part(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 12).rotateX(Math.PI / 2), toon(0x9be7ff), 0, 30, 4.3, 0.05));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = part(new THREE.BoxGeometry(0.6, 9, 5), stripeM, Math.cos(a) * 5, 6, Math.sin(a) * 5, 0.1);
    fin.rotation.y = -a;
    root.add(fin);
    const leg = part(new THREE.CylinderGeometry(0.3, 0.3, 6), toon(0x4a4660), Math.cos(a + 0.78) * 5.5, 2.5, Math.sin(a + 0.78) * 5.5, 0.05);
    root.add(leg);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(3.2, 14, 14, 1, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false }));
  flame.position.y = -4;
  const core = new THREE.Mesh(new THREE.ConeGeometry(1.8, 9, 12, 1, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  core.position.y = -2;
  root.add(flame, core);
  return { root, flame, core };
}

// Pirate den signal pylon: destructible heart of a den.
export function makePylon() {
  const root = new THREE.Group();
  root.add(part(new THREE.CylinderGeometry(2.6, 3.4, 3, 8), toon(0x3a2b4f), 0, 1.5, 0, 0.1));
  root.add(part(new THREE.CylinderGeometry(0.6, 1.2, 10, 6), toon(0x6b5a3a), 0, 8, 0, 0.08));
  for (const s of [-1, 1]) root.add(part(new THREE.BoxGeometry(6, 0.5, 0.5), toon(0x8a4b2a), 0, 9 + s * 2, 0, 0.04));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), glow(0x7dff3a));
  orb.position.y = 14;
  root.add(orb);
  const flag = part(new THREE.PlaneGeometry(3, 2), toon(0x111111, { side: THREE.DoubleSide }), 1.6, 11, 0, 0);
  root.add(flag);
  return { root, orb };
}

// Seismograph tripod for survey events.
export function makeSeismo() {
  const root = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = part(new THREE.CylinderGeometry(0.08, 0.08, 2.6), toon(0x3a3550), Math.cos(a) * 0.7, 1.1, Math.sin(a) * 0.7, 0.03);
    leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    root.add(leg);
  }
  root.add(part(new THREE.BoxGeometry(1.2, 0.8, 1.2), toon(0x2ec4ff), 0, 2.4, 0, 0.05));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), glow(0x7dff6a));
  light.position.y = 3;
  root.add(light);
  return { root, light };
}

// Vacuum tube for black-lake fluid (carried on the back).
export function makeTube() {
  const root = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.35 }));
  root.add(glass);
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 12), new THREE.MeshBasicMaterial({ color: 0x2a1f4f }));
  root.add(fluid);
  for (const s of [-1, 1]) root.add(part(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 12), toon(0x3a3550), 0, s * 0.58, 0, 0.03));
  root.rotation.z = Math.PI / 2;
  return { root, fluid };
}

// ---- the far planets: a few small, quiet bodies strung along the ecliptic (Venus near the sun,
// then Mars, Jupiter and ringed Saturn round the sky), lit by the sun so each shows its phase.
// Small on purpose: sky features to notice, not to stare at. sunDir is the direction to the sun;
// R how far out they sit (inside the star sphere).
function planetTexture(draw, w = 256, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function makePlanets(sunDir, R = 6700) {
  const root = new THREE.Group();
  const rr = mulberry32Local(4242);
  const n = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize(); // the ecliptic's pole
  const e2 = new THREE.Vector3().crossVectors(n, sunDir).normalize();
  const along = (deg, tilt) => {
    const a = THREE.MathUtils.degToRad(deg);
    return sunDir.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).addScaledVector(n, Math.sin(THREE.MathUtils.degToRad(tilt))).normalize();
  };
  const bands = (cols, wob = 0) => planetTexture((g, w, h) => {
    let y = 0;
    while (y < h) {
      const bh = 4 + rr() * 14;
      g.fillStyle = cols[Math.floor(rr() * cols.length)];
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 23 + y) * wob);
      g.lineTo(w, y + bh); g.lineTo(0, y + bh);
      g.fill();
      y += bh;
    }
  });
  // (their own sun, not the scene's: the light switches off on the Moon's night side, but Jupiter
  // doesn't. Three toon steps of phase, from the real sun direction in the sky's frame)
  const lit = (map) => new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, sun: { value: sunDir.clone() } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; varying vec2 vUv; varying vec3 vN;
      void main(){
        float d = dot(normalize(vN), normalize(sun));
        float k = d > 0.35 ? 1.0 : d > 0.0 ? 0.62 : 0.14;
        gl_FragColor = vec4(texture2D(map, vUv).rgb * k, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const body = (dir, r, map) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), lit(map));
    // (the sky can turn: the Spindle's rolls, sun and all; keep the sun's direction in step)
    m.onBeforeRender = () => { root.getWorldQuaternion(_pq); m.material.uniforms.sun.value.copy(sunDir).applyQuaternion(_pq); };
    m.position.copy(dir).multiplyScalar(R);
    m.rotation.set(0.3, rr() * 6, 0.2);
    const hull = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide }));
    hull.scale.setScalar(1.06);
    m.add(hull);
    root.add(m);
    return m;
  };
  // Venus: the bright one, close to the sun, pale cloud-tops
  body(along(38, 2), 30, bands(['#fff1c8', '#f3e1aa', '#fbe9bd'], 2));
  // Mars: small and rusty, a white cap
  body(along(118, -3), 20, planetTexture((g, w, h) => {
    g.fillStyle = '#c4532d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8f3a22';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(rr() * w, 20 + rr() * (h - 40), 8 + rr() * 26, 4 + rr() * 10, rr() * 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff6ee'; g.fillRect(0, 0, w, 9);
  }));
  // Jupiter: the big banded one, with its red spot
  body(along(162, 4), 64, planetTexture((g, w, h) => {
    const cols = ['#e9d2ad', '#c98e5b', '#f3e6cc', '#b5764a', '#ead9b9'];
    let y = 0, k = 0;
    while (y < h) { const bh = 6 + rr() * 12; g.fillStyle = cols[k++ % cols.length]; g.fillRect(0, y, w, bh); y += bh; }
    g.fillStyle = '#c24a32'; g.beginPath(); g.ellipse(w * 0.62, h * 0.64, 16, 7, 0, 0, Math.PI * 2); g.fill();
  }));
  // Saturn: pale bands and its rings, tipped toward you
  const sat = body(along(236, -5), 46, bands(['#f0dfae', '#e3c98d', '#f6e9c6']));
  const ringTex = planetTexture((g, w) => {
    for (let x = 0; x < w; x++) {
      const t = x / w, a = t < 0.08 ? 0 : 0.35 + 0.55 * Math.abs(Math.sin(t * 19)) * (t > 0.62 && t < 0.7 ? 0.15 : 1);
      g.fillStyle = `rgba(235, 214, 170, ${a.toFixed(2)})`;
      g.fillRect(x, 0, 1, 8);
    }
  }, 256, 8);
  const ringGeo = new THREE.RingGeometry(46 * 1.35, 46 * 2.3, 64, 1);
  // (map the ring texture across the radius)
  const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 46 * 1.35) / (46 * 0.95), 0.5); }
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = Math.PI / 2 - 0.45;
  sat.add(ring);
  return root;
}
const _pq = new THREE.Quaternion();
const mulberry32Local = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
