import * as THREE from 'three';
import { toon, ink, glow, inkMat } from './toon.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// inlined (a data URI) so the desktop build, which runs from file://, can load it without fetch
import runnerGlb from './assets/runner.glb?inline';
import shipsGlb from './assets/ships.glb?inline';
import { Kit, T as KT, G as KG, D as KD, crate } from './outpostModels.js';

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
const PIVOTS = ['legL', 'legR', 'torso', 'head', 'armL', 'armR'];
const NO_SHADOW = new Set(['glow', 'lens', 'glint']);
export async function loadRunnerParts() {
  try {
    const gltf = await new GLTFLoader().loadAsync(runnerGlb);
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
  for (const name of [...PIVOTS, 'scarfLinks']) {
    const pivot = scene.getObjectByName(name);
    if (!pivot) throw new Error('runner.glb has no pivot ' + name);
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
      ink = { thin: shellAt(base, 1), fat: shellAt(base, 4) };
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

// Hang a baked pivot's parts (and its one outline shell) on a group.
function addBaked(target, key, mats) {
  const B = RUNNER_PARTS[key];
  for (const { slot, geo } of B.parts) {
    const m = new THREE.Mesh(geo, mats[slot]);
    m.castShadow = !NO_SHADOW.has(slot);
    target.add(m);
  }
  if (B.ink) {
    const h = new THREE.Mesh(B.ink.thin, inkMat);
    h.castShadow = false;
    h.userData.isInk = true;
    // the threat scanner swaps in the fat shell instead of scaling this one (see main.js)
    h.userData.inkGeo = B.ink;
    target.add(h);
  }
}

// The Moon-runner (also used for pirate skaters and story NPCs). Pivot at the feet.
// Smooth lathed limbs and torso, rounded boots/gloves/backpack and a shelled visor, but the
// same pivots (legL/legR at the hips, armL/armR at the shoulders, head on the torso) and
// dimensions as always, because cosmetics, mutations, cargo and story props hang off them.
// The scarf is a little chain of links simulated in the torso's frame (side view, the y-z plane):
// gravity pulls it down, the airflow from moving pushes it back, body acceleration makes it swing,
// neighbouring links pull on each other, and it drapes over whatever is on your back (the pack, a
// cargo crate, a cape) instead of passing through it. phi = angle of a link: 0 = straight back,
// -PI/2 = hanging straight down, positive = streaming up.
const _sq = new THREE.Quaternion(), _sg = new THREE.Vector3(), _sw = new THREE.Vector3(), _sa = new THREE.Vector3();
export class ScarfSim {
  constructor(model) {
    this.m = model;
    this.phi = new Array(SCARF_N).fill(-1.2);
    this.w = new Array(SCARF_N).fill(0);
    this.prevVel = null;
    this.t = Math.random() * 10;
  }

  // vel: the body's world velocity; up: world up at the body; back: how far behind the spine the
  // back gear reaches (pack 0.55, cape 0.62, crate 1.14), top: the height of its top edge
  update(dt, vel, up, { back = 0.55, top = 0.96 } = {}) {
    if (dt <= 0) return;
    const m = this.m;
    const links = m.scarf.userData.links;
    if (!links) return;
    this.t += dt;
    m.torso.getWorldQuaternion(_sq).invert();
    // forces in the torso frame
    _sg.copy(up).multiplyScalar(-6).applyQuaternion(_sq); // gravity (stylised: the Moon's is too lazy to read)
    _sw.copy(vel).negate().applyQuaternion(_sq); // relative wind
    const ws = _sw.length();
    _sw.multiplyScalar(0.08 * ws);
    if (this.prevVel) _sa.copy(vel).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3)).negate().multiplyScalar(0.12).applyQuaternion(_sq);
    else _sa.set(0, 0, 0);
    this.prevVel = (this.prevVel || new THREE.Vector3()).copy(vel);
    const fy = _sg.y + _sw.y + _sa.y, fz = _sg.z + _sw.z + _sa.z;
    const flutter = Math.min(1, ws / 15) * 0.25;
    const steps = Math.min(6, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      let y = 1.04, z = -0.26; // pivot in torso space
      for (let k = 0; k < SCARF_N; k++) {
        // the link wants to point along the net force; neighbours stiffen the chain a little
        let target = Math.atan2(fy, -fz) + Math.sin(this.t * 9 - k * 1.3) * flutter * (k + 1) / SCARF_N;
        const prev = k ? this.phi[k - 1] : target;
        const acc = 70 * wrapAngle(target - this.phi[k]) + 40 * wrapAngle(prev - this.phi[k]) - 9 * this.w[k];
        this.w[k] += acc * h;
        this.phi[k] += this.w[k] * h;
        // never fold over the head or through the body
        if (this.phi[k] > 1.1) { this.phi[k] = 1.1; this.w[k] = Math.min(0, this.w[k]); }
        if (this.phi[k] < -1.65) { this.phi[k] = -1.65; this.w[k] = Math.max(0, this.w[k]); }
        // drape over the back gear: a link starting above its top edge or alongside it must end
        // behind its back face
        if (y > 0.2) {
          const cmin = (z + back) / SCARF_LINK; // cos(phi) must be at least this
          if (cmin >= 1) { if (this.phi[k] < 0) { this.phi[k] = 0; this.w[k] = Math.max(0, this.w[k]); } }
          else if (cmin > -1 && Math.cos(this.phi[k]) < cmin && this.phi[k] < 0) { this.phi[k] = -Math.acos(cmin); this.w[k] = Math.max(0, this.w[k]); }
        }
        y += Math.sin(this.phi[k]) * SCARF_LINK;
        z -= Math.cos(this.phi[k]) * SCARF_LINK;
        if (y < top && z > -back) { y = top; } // (approximate: keeps later links from tunnelling)
      }
    }
    // write the chain: each joint's rotation is relative to its parent link
    let acc = 0;
    for (let k = 0; k < SCARF_N; k++) { links[k].rotation.x = this.phi[k] - acc; acc = this.phi[k]; }
    m.scarf.rotation.y = Math.sin(this.t * 2.3) * 0.12 * Math.min(1, ws / 10);
  }
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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
    head.add(part(G.antenna, dark, 0.22, 0.38, -0.1, 0));
    head.add(part(G.bead, glowM, 0.22, 0.6, -0.1, 0));
  } else {
    addBaked(torso, 'torso', mats);
    addBaked(head, 'head', mats);
  }
  if (pirate) head.add(part(G.band, toon(0xd7263d), 0, 0.12, 0, 0.02));

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.45, 0.85, 0);
    torso.add(arm);
    arms.push(arm);
    if (baked) { addBaked(arm, side < 0 ? 'armL' : 'armR', mats); continue; }
    arm.add(part(G.arm, suitM, 0, 0, 0, 0.04));
    arm.add(part(G.shoulder, helmetM, side * 0.01, 0.0, 0, 0.03));
    arm.add(part(G.wristCuff, accentM, 0, -0.52, 0, 0.02));
    const glove = part(G.glove, dark, 0, -0.63, 0.01, 0.03);
    glove.scale.set(0.95, 1.15, 0.85);
    arm.add(glove);
    arm.add(part(G.thumb, dark, -side * 0.05, -0.6, 0.08, 0.02));
  }

  // Comic scarf streaming behind. The tail leaves from the top of the backpack and is kept above
  // everything worn on the back (pack, cargo crate, jar, cape): see ScarfSim.
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
  return { root, trick, body, bodyBase: -1.2, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], scarf: scarfPivot, cargoSlot, glowM, accent, mats: { suit: suitM, accent: accentM, helmet: helmetM, visor: visorM, scarf: scarfM, collar: collarM, glow: glowM, skate: skateM } };
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
    hand: arch === 'lab' ? pick(['clipboard', 'tablet', 'clipboard']) : arch === 'trader' ? pick(['tablet', 'briefcase', 'none']) : arch === 'elder' ? 'cane' : arch === 'kid' ? pick(['toy', 'none']) : arch === 'casual' ? pick(['tablet', 'none', 'none']) : 'none',
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
function rWheel(r, w, hub = VMETAL) {
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

// Rovers: pirate war-rigs, military patrol cars and civilian buggies share one layout (body 3.2
// x 5.2, wheels at (±1.85, 0.85, ±1.8), gun mount at (0, 3, 0.8), loot slot on the chassis) so the
// AI, traffic and faction-vehicle code drive them all the same way. style: pirate | military | civil.
export function makeRover({ color = 0x7b2ff7, trim = 0xffd23f, pirate = true, flag = 0x111111, style = null } = {}) {
  style = style || (pirate ? 'pirate' : 'civil');
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  chassis.add(baked(`rover|${style}|${color}|${trim}`, (k) => {
    // common frame: skid plate, axles, fenders, lights
    k.box(3.0, 0.5, 5.4, KT(VDARK), 0, 0.7, 0, { outline: 0.06 });
    for (const sz of [-1.8, 1.8]) k.add(new THREE.CylinderGeometry(0.18, 0.18, 3.5, 8).rotateZ(Math.PI / 2), KT(VSTEEL), 0, 0.85, sz, { outline: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(new THREE.CylinderGeometry(1.08, 1.08, 0.9, 12, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), KD(style === 'military' ? VSTEEL : color), sx * 1.85, 0.85, sz * 1.8, { outline: 0.04 });
    for (const sx of [-0.9, 0.9]) k.box(0.55, 0.3, 0.12, KG(0xfff6a8), sx, 1.45, 2.68, { outline: 0 });
    for (const sx of [-1.2, 1.2]) k.box(0.4, 0.22, 0.12, KG(0xff2a4a), sx, 1.5, -2.68, { outline: 0 });
    if (style === 'pirate') {
      // welded war-rig: slab hull, scrap armour, a spiked ram plate, a cage cab and exhaust stacks
      k.box(3.2, 1.1, 5.2, KT(color), 0, 0.9, 0, { outline: 0.08 });
      k.add(new THREE.BoxGeometry(3.4, 1.4, 0.4), KT(VSTEEL), 0, 1.4, 2.85, { rx: -0.35, outline: 0.05 });
      for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry(0.18, 0.8, 5).rotateX(Math.PI / 2), KT(0xd8d4e8), -1.2 + i * 0.8, 1.2, 3.25, { outline: 0.02 });
      for (const [x, y, z, h, c] of [[1.64, 1.2, 0.05, 0.8, 0x7a4a32], [-1.64, 1.15, -0.1, 0.9, 0x6b5a3a]]) k.box(0.12, h, 1.2, KT(c), x, y, z, { rz: 0.05, outline: 0.02 });
      k.box(1.8, 0.7, 0.12, KT(0x5a5f6e), 0.3, 1.2, -2.65, { rz: 0.06, outline: 0.02 });
      k.box(2.4, 1.0, 2.0, KT(trim), 0, 2.0, -0.6, { outline: 0.06 });
      k.box(2.42, 0.4, 1.0, KG(0xcfefff), 0, 2.45, 0.1, { outline: 0 });
      for (const sx of [-1, 1]) {
        k.beam([sx * 1.15, 2.0, 0.5], [sx * 1.1, 3.6, 0.4], 0.08, KT(VDARK), { outline: 0.02 });
        k.beam([sx * 1.15, 2.0, -1.6], [sx * 1.1, 3.6, -1.2], 0.08, KT(VDARK), { outline: 0.02 });
        k.cyl(0.18, 0.22, 2.4, 8, KT(VSTEEL), sx * 1.35, 1.6, -2.3, { outline: 0.03 });
        k.cyl(0.2, 0.2, 0.2, 8, KG(0xff9f1c), sx * 1.35, 4.0, -2.3, { outline: 0 });
      }
      k.beam([-1.1, 3.6, 0.4], [1.1, 3.6, 0.4], 0.08, KT(VDARK), { outline: 0 });
      k.beam([-1.1, 3.6, -1.2], [1.1, 3.6, -1.2], 0.08, KT(VDARK), { outline: 0 });
      for (const sx of [-1, 1]) k.box(0.1, 0.18, 1.3, KG(trim), sx * 1.63, 1.05, 0, { outline: 0 });
    } else if (style === 'military') {
      // armoured patrol car: a sloped hull with skirts, faction stripes, smoke launchers, antennas
      k.add(new THREE.CylinderGeometry(1.45 * Math.SQRT2, 1.7 * Math.SQRT2, 1.3, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.65), KT(color), 0, 1.6, 0, { outline: 0.1 });
      k.add(new THREE.BoxGeometry(3.0, 0.7, 1.2), KT(color), 0, 1.35, 2.45, { rx: 0.5, outline: 0.05 });
      for (const sx of [-1, 1]) {
        // skirt plate between the wheel wells, the faction stripe up on the hull above the arches
        k.box(0.25, 0.75, 1.3, KT(VSTEEL), sx * 1.72, 1.15, 0, { outline: 0.04 });
        k.box(0.27, 0.12, 1.3, KT(trim), sx * 1.74, 1.47, 0, { outline: 0 });
        k.box(0.08, 0.18, 4.2, KT(trim), sx * 1.5, 2.1, 0, { rz: sx * 0.19, outline: 0 });
        for (let i = 0; i < 3; i++) k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.45, 6).rotateX(-0.6), KT(VDARK), sx * (0.8 + i * 0.18), 2.35, 1.4, { outline: 0 });
      }
      k.cyl(0.95, 1.05, 0.35, 12, KT(VSTEEL), 0, 2.25, 0.8, { outline: 0.03 });
      k.box(2.0, 0.5, 0.9, KG(0xcfefff), 0, 1.95, 1.75, { rx: 0.5, outline: 0 });
      k.cyl(0.03, 0.05, 2.6, 4, KT(VDARK), -1.1, 2.2, -2.0, { outline: 0 });
      k.cyl(0.03, 0.05, 1.8, 4, KT(VDARK), -0.8, 2.2, -2.2, { outline: 0 });
      k.box(1.6, 0.6, 1.0, KT(VSTEEL), 0, 2.2, -1.9, { outline: 0.03 });
    } else {
      // civilian buggy: open tub, roll cage, seats, cargo bed with crates, a light bar
      k.box(3.0, 0.7, 5.0, KT(color), 0, 0.9, 0, { outline: 0.08 });
      k.add(new THREE.BoxGeometry(2.8, 0.5, 1.0), KT(color), 0, 1.3, 2.3, { rx: 0.4, outline: 0.04 });
      k.box(2.8, 0.15, 1.4, KT(trim), 0, 1.6, -1.6, { outline: 0 });
      for (const sx of [-0.6, 0.6]) { k.box(0.8, 0.5, 0.8, KT(VDARK), sx, 1.6, 0.4, { outline: 0.02 }); k.box(0.8, 0.9, 0.2, KT(VDARK), sx, 1.6, 0.0, { outline: 0.02 }); }
      for (const sx of [-1, 1]) {
        k.beam([sx * 1.3, 1.6, 1.4], [sx * 1.1, 3.4, 0.8], 0.09, KT(VSTEEL), { outline: 0.02 });
        k.beam([sx * 1.3, 1.6, -0.6], [sx * 1.1, 3.4, -0.4], 0.09, KT(VSTEEL), { outline: 0.02 });
        k.beam([sx * 1.1, 3.4, 0.8], [sx * 1.1, 3.4, -0.4], 0.09, KT(VSTEEL), { outline: 0 });
      }
      k.beam([-1.1, 3.4, 0.8], [1.1, 3.4, 0.8], 0.09, KT(VSTEEL), { outline: 0 });
      k.box(1.8, 0.25, 0.3, KG(0xfff6a8), 0, 3.5, 0.85, { outline: 0 });
      crate(k, -0.6, 1.75, -1.7, 0.9, 0x9a6a3a, 0.2);
      crate(k, 0.6, 1.75, -1.5, 0.8, 0x4f5a42, -0.3);
    }
  }));
  // gun (yawed by the AI): a pintle twin-gun, a small turret, or a searchlight on the civil buggy
  const gun = new THREE.Group();
  gun.position.set(0, 3.0, 0.8);
  gun.add(baked(`gun|${style}|${trim}`, (k) => {
    if (style === 'military') {
      k.box(1.3, 0.6, 1.4, KT(VSTEEL), 0, -0.6, 0, { outline: 0.04 });
      k.box(1.32, 0.15, 1.42, KT(trim), 0, -0.1, 0, { outline: 0 });
      k.add(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8).rotateX(Math.PI / 2), KT(VDARK), 0, -0.3, 1.6, { outline: 0.03 });
    } else if (style === 'pirate') {
      k.cyl(0.12, 0.12, 0.7, 6, KT(VDARK), 0, -0.7, 0, { outline: 0.02 });
      k.box(0.8, 0.5, 0.9, KT(VDARK), 0, 0, 0, { outline: 0.04 });
      for (const sx of [-0.18, 0.18]) k.add(new THREE.CylinderGeometry(0.08, 0.1, 2.0, 6).rotateX(Math.PI / 2), KT(VDARK), sx, 0.25, 1.2, { outline: 0.02 });
      k.box(0.9, 0.6, 0.1, KT(trim), 0, 0.2, 0.5, { outline: 0 });
    } else {
      k.cyl(0.1, 0.12, 0.6, 6, KT(VDARK), 0, -0.5, 0, { outline: 0.02 });
      k.add(new THREE.CylinderGeometry(0.35, 0.3, 0.6, 10).rotateX(Math.PI / 2), KT(0xd8d4e8), 0, 0, 0, { outline: 0.03 });
      k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10).rotateX(Math.PI / 2), KG(0xfffbe0), 0, 0, 0.32, { outline: 0 });
    }
  }));
  chassis.add(gun);
  // flag on a whip pole at the back
  const flagM = toon(flag, { side: THREE.DoubleSide });
  chassis.add(part(new THREE.CylinderGeometry(0.05, 0.05, 3), toon(VDARK), -1.2, 3.6, -2.2, 0.02));
  chassis.add(part(new THREE.PlaneGeometry(1.4, 0.9), flagM, -1.9, 4.6, -2.2, 0));
  if (style === 'pirate') chassis.add(part(new THREE.SphereGeometry(0.22, 8, 6), toon(0xffffff), -1.9, 4.65, -2.17, 0));
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = rWheel(0.85, 0.7);
    w.position.set(sx * 1.85, 0.85, sz * 1.8);
    root.add(w);
    wheels.push(w);
  }
  return { root, chassis, gun, wheels };
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
const SHIP_GLOW = { glass: 0x9be7ff, window: 0xfff6a8, cabin: 0xfff1b0, red: 0xff2a4a, green: 0x7dff6a, white: 0xffffff, sign: 0xffd23f, bay: 0x0c0915 };
const SHIP_TOON = { trim: 0xd8d4e8, dark: 0x2a2540, metal: 0x8a87a0, steel: 0x55607a, deck: 0x5b5870, hazard: 0xffd23f, cargo0: 0xffd23f, cargo1: 0x2ec4ff, cargo2: 0xff3b5c, cargo3: 0x7dff6a };
const SHIP_FX = new Set(['plume', 'plumeCore', 'lift', 'engine', 'core']); // per-ship materials (they pulse)
const FLAMES = new Set(['plume', 'plumeCore', 'lift']);
export async function loadShipParts() {
  const gltf = await new GLTFLoader().loadAsync(shipsGlb);
  SHIP_PARTS = {};
  for (const name of ['shuttle', 'freighter']) {
    const root = gltf.scene.getObjectByName(name);
    if (!root) throw new Error('ships.glb has no ' + name);
    SHIP_PARTS[name] = bakeShip(root);
  }
}

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

const _shipHot = new THREE.Color();
function makeShip(kind, { color, stripe }) {
  const B = SHIP_PARTS[kind];
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const fx = {
    plume: new THREE.MeshBasicMaterial({ color: 0xff8a2a, opacity: 0.7, ...add }),
    plumeCore: new THREE.MeshBasicMaterial({ color: 0xfff1c0, opacity: 0.9, ...add }),
    lift: new THREE.MeshBasicMaterial({ color: 0x8fd8ff, opacity: 0.6, ...add }),
    engine: new THREE.MeshBasicMaterial({ color: 0xff9f1c }),
    core: new THREE.MeshBasicMaterial({ color: 0xfff3c0 }),
  };
  const matFor = (slot) => {
    if (SHIP_FX.has(slot)) return fx[slot];
    if (slot === 'body') return toon(color);
    if (slot === 'stripe') return toon(stripe);
    if (SHIP_GLOW[slot] !== undefined) return glow(SHIP_GLOW[slot]);
    return toon(SHIP_TOON[slot] ?? 0xff00ff);
  };
  const rig = { legs: [], doors: [], ramps: [], hatches: [], plumes: [], lifts: [] };
  const build = (node) => {
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.pos);
    g.quaternion.copy(node.quat);
    for (const { slot, geo } of node.parts) {
      const m = new THREE.Mesh(geo, matFor(slot));
      m.castShadow = !SHIP_FX.has(slot) && SHIP_GLOW[slot] === undefined;
      if (FLAMES.has(slot)) m.renderOrder = 2;
      g.add(m);
    }
    if (node.ink) {
      const h = new THREE.Mesh(node.ink, inkMat);
      h.castShadow = false;
      h.userData.isInk = true;
      g.add(h);
    }
    const d = node.data;
    let leg = null;
    if (node.role === 'leg') rig.legs.push(leg = { g, fold: d.fold, foot: null });
    else if (node.role === 'door') rig.doors.push({ g, open: d.open });
    else if (node.role === 'ramp') rig.ramps.push({ g, closed: d.closed, opened: d.opened });
    else if (node.role === 'hatch') rig.hatches.push(g);
    else if (node.role === 'plume') rig.plumes.push({ g, phase: rig.plumes.length * 1.7 });
    else if (node.role === 'lift') rig.lifts.push({ g, phase: rig.lifts.length * 2.3 });
    for (const k of node.kids) {
      const c = build(k);
      g.add(c);
      if (leg && k.role === 'foot') leg.foot = c;
    }
    return g;
  };
  const root = build(B);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  const d = B.data;
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const ship = {
    root, kind, size: kind === 'freighter' ? 30 : 10,
    gearH: d.gearH, deck: [...d.deck], deckY: d.deckY, deckZ: d.deckZ, radius: d.radius, padR: d.padR,
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
      const p = pulse(0, 15);
      fx.plume.opacity = 0.42 + 0.22 * Math.min(1, main) * p;
      fx.plumeCore.opacity = 0.6 + 0.3 * Math.min(1, main);
      fx.lift.opacity = 0.35 + 0.25 * lift * pulse(1, 19);
      const heat = Math.min(1, Math.max(main, lift) * p);
      fx.engine.color.setHex(0x6a3a22).lerp(_shipHot.setHex(0xffb347), heat);
      fx.core.color.setHex(0x8a6a4a).lerp(_shipHot.setHex(0xfffbe8), heat);
    },
  };
  ship.setGear(1);
  ship.setRamp(0);
  ship.setThrust(0, 0, 0);
  return ship;
}

// Shuttle-bus: a fat lifting-body hopper with a wraparound windscreen, porthole windows, two
// ducted lift-fans on pylons, a V-tail, a lit route board on the roof, three folding legs and a
// rear door that drops into a ramp.
export function makeShuttle({ color = 0xfff4e0, stripe = 0x2ec4ff } = {}) {
  return makeShip('shuttle', { color, stripe });
}

// Hover-car: a rounded body, a bubble canopy, side nacelles glowing underneath, tail fins and
// lights. Same size (capsule 1.1 x 4.8 long) and deck height as before.
export function makeHoverCar({ color = 0xff7ad9, trim = 0xfff4e0 } = {}) {
  const root = new THREE.Group();
  root.add(baked(`car|${color}|${trim}`, (k) => {
    k.add(new THREE.CapsuleGeometry(1.1, 2.6, 6, 12).rotateX(Math.PI / 2), KT(color), 0, 0, 0, { outline: 0.08 });
    k.add(new THREE.BoxGeometry(2.3, 0.3, 4.2), KT(trim), 0, -0.25, 0, { outline: 0.03 });
    k.add(new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), KG(0x9be7ff), 0, 0.45, 0.35, { outline: 0.05 });
    k.add(new THREE.TorusGeometry(1.0, 0.08, 4, 18), KT(trim), 0, 0.47, 0.35, { rx: Math.PI / 2, outline: 0 });
    for (const sx of [-1, 1]) {
      k.add(new THREE.CapsuleGeometry(0.42, 1.8, 4, 8).rotateX(Math.PI / 2), KT(trim), sx * 1.3, -0.55, -0.2, { outline: 0.04 });
      k.cyl(0.45, 0.6, 0.35, 12, KG(0x2ee6ff), sx * 1.3, -1.1, -0.2, { outline: 0 });
      k.add(new THREE.BoxGeometry(0.12, 0.8, 0.9), KT(color), sx * 0.7, 0.75, -2.1, { rz: sx * -0.4, rx: -0.4, outline: 0.03 });
      k.box(0.45, 0.18, 0.1, KG(0xfff6a8), sx * 0.55, -0.05, 2.35, { outline: 0 });
      k.box(0.45, 0.18, 0.1, KG(0xff2a4a), sx * 0.6, 0.05, -2.36, { outline: 0 });
    }
    k.box(2.6, 0.2, 0.6, KT(trim), 0, -0.3, -1.8, { outline: 0.03 });
  }));
  return { root, size: 3 };
}

// Freighter: a deep-haul hammerhead: a long flat deck you can ride, a raked bridge tower at the
// bow, container racks down both flanks, swept radiator wings, a four-bell engine cluster, four
// folding legs and a belly ramp.
export function makeFreighter({ color = 0xb8b4c8, stripe = 0xff9f1c } = {}) {
  return makeShip('freighter', { color, stripe });
}

// Longshot Kade's gun truck: a mad-max monster truck on huge tyres. Kade drives (open cab, roll
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

export function makeDish(size = 10, color = 0xf5f5f5) {
  const root = new THREE.Group();
  root.add(part(new THREE.CylinderGeometry(size * 0.12, size * 0.2, size * 0.9, 10), toon(0x6b6880), 0, size * 0.45, 0, 0.1));
  const yaw = new THREE.Group();
  yaw.position.y = size * 0.95;
  root.add(yaw);
  const tilt = new THREE.Group();
  yaw.add(tilt);
  tilt.rotation.x = -0.7;
  const r = size * 0.6;
  const dish = part(new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, Math.PI - 0.9, 0.9), toon(color, { side: THREE.DoubleSide }), 0, r, 0, 0.12);
  tilt.add(dish);
  tilt.add(part(new THREE.CylinderGeometry(size * 0.03, size * 0.03, r * 0.9), toon(0x333344), 0, r * 0.45, 0, 0.04));
  tilt.add(part(new THREE.SphereGeometry(size * 0.06, 8, 6), glow(0xff2e88), 0, r * 0.9, 0, 0));
  return { root, yaw, tilt };
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
