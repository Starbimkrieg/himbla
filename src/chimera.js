import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glow, inkMat } from './toon.js';
import { inkShell } from './models.js';
import { mulberry32 } from './rng.js';
import { ensureStats } from './chimerastats.js';

// Things with bodies. Two or more of these in the reactor make a Chimera.
export const LIVING = ['person', 'voidling', 'mite', 'car', 'pirate', 'sapling', 'junkbot', 'alien'];
// Things that only mutate whatever they get spliced into.
export const MODIFIERS = { water: 'void', rock: 'crystal', slickrock: 'crystal', dirt: 'mud', mud: 'mud', wiring: 'spark', engine: 'turbo', lens: 'lens', transponder: 'radio', plating: 'armor' };

const PALETTE = {
  person: [0xff9f1c, 0x2ec4ff, 0xffd23f, 0x7dff6a],
  voidling: [0xc77dff, 0x7b2ff7],
  mite: [0xb8e986, 0xd8d0c4, 0x9be7ff],
  car: [0xff7ad9, 0x2ec4ff, 0x7dff6a, 0xffd23f],
  pirate: [0x3a2b4f, 0x5a3a5a],
  sapling: [0x5fbf4a, 0x8fd16a, 0x3f9a3a],
  junkbot: [0xffb347, 0x9aa7bb, 0x55607a],
  alien: [0x7dd87a, 0x5fc9b8, 0xb59cff, 0xc9f27a],
};
const SYLL = { car: 'Vroom', mite: 'Skitter', pirate: 'Grit', sapling: 'Sprout', junkbot: 'Bolt', alien: 'Zorp' };
const EPITHET = { void: 'the Unholy', crystal: 'the Crystalline', mud: 'of the Mud', spark: 'the Electric', turbo: 'the Turbocharged', lens: 'the All-Seeing', radio: 'the Broadcaster', armor: 'the Ironclad' };

// Mix the parents into a gene sheet: which body, legs and head; mutations; stats; a name.
export function spliceGenes(items, seed = Math.floor(Math.random() * 1e9)) {
  const rr = mulberry32(seed);
  const living = items.filter((i) => LIVING.includes(i.kind));
  const mods = [...new Set(items.map((i) => MODIFIERS[i.kind]).filter(Boolean))];
  const pickPart = () => living[Math.floor(rr() * living.length)].kind;
  const body = living[0].kind;
  const legs = living.length > 1 ? living[1].kind : pickPart();
  const head = pickPart();
  const kinds = new Set(living.map((i) => i.kind));
  const extraHead = rr() < 0.15 + 0.12 * kinds.size ? pickPart() : null;
  const size = 0.75 + rr() * 0.7;
  const tint = PALETTE[body][Math.floor(rr() * PALETTE[body].length)];
  const nameOf = (i) => i.name || SYLL[i.kind] || 'Blob';
  const a = nameOf(living[0]), b = nameOf(living[living.length - 1]);
  let name = a.replace(/^Little /, '').slice(0, Math.max(2, Math.ceil(a.length / 2))) + b.replace(/^Little /, '').slice(Math.floor(b.length / 2)).toLowerCase();
  if (living.length === 1) name = `Mutant ${a}`;
  if (mods.length) name += ' ' + EPITHET[mods[0]];
  const chaos = kinds.size + mods.length + (extraHead ? 1 : 0) + (mods.includes('void') ? 1 : 0);
  // racing stats (speed / power / stamina / wit), tier and top speed come from the parts + seed
  return ensureStats({ seed, body, legs, head, extraHead, mods, size, tint, name, speed: 0, hop: legs === 'mite' ? 1 : 0.3, chaos, parents: living.map((i) => i.kind), born: Date.now() });
}

export { ensureStats };

// =============================================================================================
// Part geometry. Every shape is built once and shared (geometry.userData.shared), and every
// inked part gets a real outline shell pushed out along its smoothed normals.
// =============================================================================================
const GEO = new Map();
function cached(key, fn) {
  let g = GEO.get(key);
  if (!g) {
    g = fn();
    if (!g.index) g = toIndexed(g);
    g.computeBoundingSphere();
    g.userData.shared = true;
    GEO.set(key, g);
  }
  return g;
}
function toIndexed(g) {
  const idx = [];
  for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
  g.setIndex(idx);
  return g;
}
const SHELL = new Map();
function shellFor(geo, t) {
  const key = geo.uuid + '|' + t;
  let s = SHELL.get(key);
  if (!s) { s = inkShell(geo, t); s.userData.shared = true; SHELL.set(key, s); }
  return s;
}

// squashed sphere (radii baked in, so the outline stays even)
const ell = (rx, ry, rz, w = 16, h = 12) => cached(`ell|${rx}|${ry}|${rz}|${w}|${h}`, () => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz));
// surface of revolution round y from [r, y] pairs (bottom to top)
const lathe = (pts, seg = 16) => cached(`lathe|${pts.join(';')}|${seg}`, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
const rbox = (w, h, d, r = 0.06) => cached(`rbox|${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
const cyl = (rt, rb, h, seg = 12) => cached(`cyl|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const torus = (R, r, seg = 20, rs = 8, arc = Math.PI * 2) => cached(`torus|${R}|${r}|${seg}|${rs}|${arc}`, () => new THREE.TorusGeometry(R, r, rs, seg, arc));
const cone = (r, h, seg = 10) => cached(`cone|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const octa = (r) => cached(`octa|${r}`, () => new THREE.OctahedronGeometry(r, 0).scale(0.55, 1.7, 0.55));
const ico = (r) => cached(`ico|${r}`, () => new THREE.IcosahedronGeometry(r, 0));

// A smooth tube through points (a Catmull-Rom curve) whose radius tapers from r0 to r1, with
// rounded ends: limbs, roots, antennae, mandibles.
function taper(pts, r0, r1, tub = 14, rad = 8) {
  return cached(`taper|${pts.map((p) => p.join(',')).join(';')}|${r0}|${r1}|${tub}|${rad}`, () => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const fr = curve.computeFrenetFrames(tub, false);
    const pos = [], nor = [], idx = [];
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    for (let i = 0; i <= tub; i++) {
      curve.getPointAt(i / tub, P);
      const r = r0 + (r1 - r0) * (i / tub);
      for (let j = 0; j < rad; j++) {
        const a = (j / rad) * Math.PI * 2;
        N.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a)).normalize();
        pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
        nor.push(N.x, N.y, N.z);
      }
    }
    for (let i = 0; i < tub; i++) for (let j = 0; j < rad; j++) {
      const a = i * rad + j, b = i * rad + (j + 1) % rad, c = (i + 1) * rad + (j + 1) % rad, d = (i + 1) * rad + j;
      idx.push(a, d, b, b, d, c);
    }
    // end caps: a pole pushed out along the tangent by the radius
    for (const [i, r, s] of [[0, r0, -1], [tub, r1, 1]]) {
      const T = fr.tangents[i];
      curve.getPointAt(i / tub, P);
      const c = pos.length / 3;
      pos.push(P.x + T.x * r * s * 0.9, P.y + T.y * r * s * 0.9, P.z + T.z * r * s * 0.9);
      nor.push(T.x * s, T.y * s, T.z * s);
      for (let j = 0; j < rad; j++) {
        const a = i * rad + j, b = i * rad + (j + 1) % rad;
        if (s > 0) idx.push(a, b, c); else idx.push(b, a, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  });
}

// a mesh with its outline shell; o: { rx, ry, rz, s } (s scales uniformly, keeping the ink even)
function part(geo, mat, x = 0, y = 0, z = 0, inkT = 0.035, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
  if (o.s) m.scale.setScalar(o.s);
  m.castShadow = !mat.isMeshBasicMaterial;
  if (inkT) {
    const h = new THREE.Mesh(shellFor(geo, inkT), inkMat);
    h.castShadow = false;
    h.userData.isInk = true;
    m.add(h);
  }
  return m;
}

const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const CHITIN = 0x2e2a45, DARKM = 0x221d33, BARK = 0x6b4a2a, STEEL = 0x9aa7bb, GUN = 0x55607a, CREAM = 0xfff4e0;

// =============================================================================================
// LEGS. Each builder adds its pivots to `inner` and returns { legH (hip height), parts (animated
// pivots) }. Feet stand on y = 0; the creature faces +z.
// =============================================================================================
function bipedLegs(inner, kind, rr) {
  const legH = 1.0;
  const parts = [];
  const legC = kind === 'pirate' ? 0x3a2b4f : kind === 'voidling' ? 0xc77dff : kind === 'alien' ? PALETTE.alien[Math.floor(rr() * 4)] : PALETTE.person[Math.floor(rr() * 4)];
  const legM = toon(legC);
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.2, legH, 0);
    if (kind === 'voidling') {
      // digitigrade: forward thigh, back-bent shin, glowing claw toes
      pivot.add(part(taper([[0, 0, 0], [0, -0.38, 0.14], [0, -0.66, -0.1], [0, -0.92, 0.02]], 0.12, 0.06), legM, 0, 0, 0, 0.03));
      pivot.add(part(cone(0.07, 0.24, 6), glow(0xff2e88), sx * 0.05, -0.95, 0.14, 0, { rx: Math.PI / 2 }));
      pivot.add(part(cone(0.07, 0.24, 6), glow(0xff2e88), -sx * 0.05, -0.95, 0.12, 0, { rx: Math.PI / 2 }));
    } else if (kind === 'alien') {
      pivot.add(part(taper([[0, 0, 0], [0, -0.45, 0.06], [0, -0.9, 0]], 0.085, 0.06), legM, 0, 0, 0, 0.025));
      for (const a of [-0.5, 0, 0.5]) pivot.add(part(taper([[0, 0, 0], [Math.sin(a) * 0.12, -0.02, Math.cos(a) * 0.12], [Math.sin(a) * 0.2, -0.05, Math.cos(a) * 0.2]], 0.045, 0.03, 6, 6), legM, 0, -0.9, 0, 0.015));
    } else {
      pivot.add(part(taper([[0, 0, 0], [0, -0.45, 0.07], [0, -0.82, 0]], 0.14, 0.11), legM, 0, 0, 0, 0.03));
      pivot.add(part(ell(0.12, 0.1, 0.12), toon(kind === 'pirate' ? 0x5a3a5a : CREAM), 0, -0.45, 0.1, 0.02));
      // boot: chunky, toe-up
      const boot = toon(kind === 'pirate' ? 0x1d1a29 : DARKM);
      pivot.add(part(rbox(0.26, 0.2, 0.42, 0.08), boot, 0, -0.9, 0.06, 0.03));
      if (kind === 'pirate') pivot.add(part(rbox(0.27, 0.05, 0.43, 0.02), glow(0x7dff3a), 0, -0.99, 0.06, 0));
      else pivot.add(part(rbox(0.27, 0.05, 0.12, 0.02), toon(0xffd23f), 0, -0.86, 0.22, 0));
    }
    inner.add(pivot);
    parts.push({ m: pivot, kind: 'leg', side: sx });
  }
  return { legH, parts };
}

function miteLegs(inner, tint) {
  // six jointed legs: up and out to a knee, then down to a pointed foot. Tripod gait.
  const legH = 0.72;
  const parts = [];
  const legM = toon(CHITIN), jointM = toon(shade(tint, 0.6));
  for (let i = 0; i < 6; i++) {
    const sx = i < 3 ? -1 : 1, k = (i % 3) - 1;
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.3, legH + 0.12, k * 0.36 + 0.05);
    pivot.rotation.y = -sx * k * 0.45; // front legs reach forward, back legs back
    const knee = [sx * 0.5, 0.34, 0], foot = [sx * 0.95, -legH - 0.12, 0];
    pivot.add(part(taper([[0, 0, 0], [sx * 0.24, 0.24, 0], knee], 0.075, 0.06, 10, 7), legM, 0, 0, 0, 0.025));
    pivot.add(part(taper([knee, [sx * 0.8, 0.0, 0], foot], 0.06, 0.025, 12, 7), legM, 0, 0, 0, 0.022));
    pivot.add(part(ell(0.085, 0.085, 0.085, 10, 8), jointM, knee[0], knee[1], knee[2], 0.02));
    inner.add(pivot);
    parts.push({ m: pivot, kind: 'mite', phase: (i + (i < 3 ? 0 : 1)) % 2 ? 0 : Math.PI, side: sx, yaw: pivot.rotation.y });
  }
  return { legH, parts };
}

function rootLegs(inner, rr) {
  const legH = 0.72;
  const parts = [];
  const rootM = toon(BARK), tipM = toon(0x8fd16a);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    const pivot = new THREE.Group();
    pivot.position.set(c * 0.16, legH, s * 0.16);
    const kink = 0.08 * (rr() - 0.5);
    pivot.add(part(taper([[0, 0, 0], [c * 0.22, -0.18, s * 0.22 + kink], [c * 0.42, -0.5, s * 0.42], [c * 0.62, -legH + 0.02, s * 0.62]], 0.11, 0.035, 14, 7), rootM, 0, 0, 0, 0.03));
    pivot.add(part(ell(0.05, 0.03, 0.05, 8, 6), tipM, c * 0.66, -legH + 0.03, s * 0.66, 0.012));
    inner.add(pivot);
    parts.push({ m: pivot, kind: 'root', phase: i * 1.3 });
  }
  return { legH, parts };
}

function wheelLegs(inner) {
  const legH = 0.5;
  const parts = [];
  const tire = lathe([[0.2, -0.17], [0.4, -0.17], [0.46, -0.1], [0.46, 0.1], [0.4, 0.17], [0.2, 0.17]], 18);
  const tireM = toon(DARKM), hubM = toon(STEEL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.82, 0.46, sz * 0.85);
    const spin = new THREE.Group();
    spin.add(part(tire, tireM, 0, 0, 0, 0.03, { rz: Math.PI / 2 }));
    spin.add(part(cyl(0.22, 0.22, 0.36, 12), hubM, 0, 0, 0, 0.015, { rz: Math.PI / 2 }));
    for (let k = 0; k < 3; k++) spin.add(part(rbox(0.38, 0.06, 0.08, 0.02), toon(GUN), 0, 0, 0, 0, { rx: (k * Math.PI) / 3 }));
    w.add(spin);
    inner.add(w);
    parts.push({ m: spin, kind: 'wheel', r: 0.46 });
  }
  // the chassis the wheels hang off, so a narrow body (a person's hips, a mite's thorax) rides on
  // something instead of floating between four loose wheels: axles from wheel to wheel, a deck
  // plate along them, and a padded saddle mount in the middle where the body sits
  for (const sz of [-1, 1]) {
    inner.add(part(cyl(0.07, 0.07, 1.64, 8), toon(GUN), 0, 0.46, sz * 0.85, 0.015, { rz: Math.PI / 2 }));
    for (const sx of [-1, 1]) inner.add(part(cyl(0.12, 0.12, 0.1, 10), hubM, sx * 0.58, 0.46, sz * 0.85, 0.012, { rz: Math.PI / 2 }));
  }
  inner.add(part(rbox(0.9, 0.14, 2.0, 0.05), toon(GUN), 0, 0.5, 0, 0.03));
  inner.add(part(rbox(0.94, 0.04, 2.04, 0.02), toon(0xffd23f), 0, 0.44, 0, 0));
  inner.add(part(ell(0.34, 0.12, 0.4, 14, 8), toon(DARKM), 0, 0.6, 0, 0.02));
  return { legH, parts };
}

function treadLegs(inner) {
  const legH = 0.58;
  const parts = [];
  const shape = new THREE.Shape();
  const L = 0.62, R = 0.27;
  shape.absarc(L, 0, R, -Math.PI / 2, Math.PI / 2, false);
  shape.absarc(-L, 0, R, Math.PI / 2, Math.PI * 1.5, false);
  const track = cached('tread', () => new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.15).rotateY(Math.PI / 2));
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.5, 0.3, 0);
    g.add(part(track, toon(DARKM), 0, 0, 0, 0.03));
    for (let k = -1; k <= 1; k++) {
      const w = part(cyl(0.17, 0.17, 0.08, 12), toon(STEEL), sx * 0.19, 0, k * 0.5, 0.015, { rz: Math.PI / 2 });
      g.add(w);
      parts.push({ m: w, kind: 'wheel', r: 0.17, axis: 'y' });
    }
    for (let k = 0; k < 7; k++) g.add(part(rbox(0.36, 0.05, 0.1, 0.02), toon(GUN), 0, 0.3, -0.6 + k * 0.2, 0));
    inner.add(g);
  }
  // a belly pan bridging the two tracks, with a saddle mount for whatever body sits on it
  inner.add(part(rbox(0.74, 0.24, 1.4, 0.06), toon(GUN), 0, 0.38, 0, 0.03));
  inner.add(part(rbox(0.78, 0.05, 1.44, 0.02), toon(0xffd23f), 0, 0.52, 0, 0));
  inner.add(part(ell(0.3, 0.1, 0.36, 14, 8), toon(DARKM), 0, 0.58, 0, 0.02));
  return { legH, parts };
}

// =============================================================================================
// BODIES. Each sits on the hips at legH and returns its anchors: head (where the neck is),
// back (where strapped-on mutations mount, and whether that surface faces 'up' or 'rear'), top and half-width.
// =============================================================================================
function bipedBody(inner, kind, tint, legH, rr, arms) {
  const c = kind === 'pirate' ? 0x3a2b4f : tint;
  const y0 = legH - 0.08;
  inner.add(part(lathe([[0, 0], [0.26, 0.02], [0.34, 0.18], [0.37, 0.42], [0.33, 0.66], [0.2, 0.8], [0, 0.82]], 18), toon(c), 0, y0, 0, 0.035));
  if (kind === 'person') {
    inner.add(part(torus(0.35, 0.05, 20, 6), toon(DARKM), 0, y0 + 0.14, 0, 0, { rx: Math.PI / 2 }));
    inner.add(part(rbox(0.14, 0.1, 0.06, 0.02), glow(0xffd23f), 0, y0 + 0.14, 0.36, 0));
    inner.add(part(rbox(0.46, 0.5, 0.24, 0.08), toon(CREAM), 0, y0 + 0.48, -0.36, 0.03));
    for (const sx of [-1, 1]) inner.add(part(cyl(0.06, 0.06, 0.44, 8), toon(0xff4f2e), sx * 0.12, y0 + 0.48, -0.5, 0.015));
  } else if (kind === 'pirate') {
    inner.add(part(lathe([[0.3, 0], [0.38, 0.1], [0.39, 0.38], [0.34, 0.6], [0.24, 0.66]], 18), toon(0x5a3a5a), 0, y0 + 0.12, 0, 0.03));
    inner.add(part(torus(0.38, 0.045, 22, 6), toon(0x7a4a32), 0, y0 + 0.45, 0, 0.012, { rx: Math.PI / 2 - 0.1, rz: 0.75 }));
    for (let k = 0; k < 4; k++) inner.add(part(cyl(0.035, 0.035, 0.12, 6), toon(0xffd23f), -0.2 + k * 0.13, y0 + 0.33 + k * 0.1, 0.33 - Math.abs(k - 1.5) * 0.02, 0, { rz: 0.75 }));
    inner.add(part(ell(0.09, 0.09, 0.04, 10, 8), toon(CREAM), 0.16, y0 + 0.58, 0.32, 0.015));
  } else if (kind === 'voidling') {
    inner.add(part(ell(0.13, 0.13, 0.1, 12, 10), glow(0xff2e88), 0, y0 + 0.5, 0.33, 0));
    inner.add(part(torus(0.15, 0.025, 16, 6), toon(0x7b2ff7), 0, y0 + 0.5, 0.34, 0));
    for (const sx of [-1, 1]) inner.add(part(cone(0.07, 0.3, 6), toon(0x7b2ff7), sx * 0.3, y0 + 0.78, -0.05, 0.015, { rz: -sx * 0.6 }));
  } else {
    inner.add(part(octa(0.08), glow(0x7dff6a), 0, y0 + 0.55, 0.36, 0, { rx: 0.3 }));
    inner.add(part(torus(0.22, 0.04, 18, 6), toon(shade(c, 0.7)), 0, y0 + 0.78, 0, 0.012, { rx: Math.PI / 2 }));
  }
  if (arms) {
    // stubby arms that swing with the stride
    const armM = toon(kind === 'pirate' ? 0x5a3a5a : c);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.38, y0 + 0.66, 0);
      pivot.add(part(taper([[0, 0, 0], [sx * 0.1, -0.22, 0.02], [sx * 0.12, -0.44, 0.06]], 0.09, 0.07, 10, 7), armM, 0, 0, 0, 0.025));
      pivot.add(part(ell(0.09, 0.09, 0.09, 10, 8), toon(kind === 'voidling' ? 0xff2e88 : kind === 'alien' ? c : DARKM), sx * 0.12, -0.5, 0.07, 0.02));
      inner.add(pivot);
      arms.push({ m: pivot, kind: 'arm', side: sx });
    }
  }
  return { head: [y0 + 0.82, 0.02], back: [y0 + 0.5, -0.5, 'rear'], top: y0 + 0.82, w: 0.38 };
}

function miteBody(inner, tint, legH, rr) {
  const bodyM = toon(tint), darkM = toon(shade(tint, 0.62));
  const y = legH + 0.2;
  // thorax, waist, and a big segmented abdomen riding up behind
  inner.add(part(ell(0.42, 0.36, 0.46), bodyM, 0, y + 0.22, 0.18, 0.035));
  inner.add(part(ell(0.18, 0.18, 0.2, 12, 10), darkM, 0, y + 0.3, -0.3, 0.02));
  const abd = new THREE.Group();
  abd.position.set(0, y + 0.46, -0.95);
  abd.rotation.x = -0.25;
  abd.add(part(ell(0.62, 0.52, 0.78), bodyM, 0, 0, 0, 0.04));
  // segment bands: thin slices of the abdomen, a hair proud of it
  for (const dz of [0.32, 0.0, -0.32]) {
    const f = Math.sqrt(1 - (dz / 0.78) ** 2);
    abd.add(part(ell(+(0.62 * f + 0.025).toFixed(3), +(0.52 * f + 0.025).toFixed(3), 0.07, 20, 8), darkM, 0, 0, dz, 0));
  }
  inner.add(abd);
  for (let i = 0; i < 4; i++) inner.add(part(ell(0.11, 0.05, 0.11, 10, 6), darkM, (i % 2 ? 1 : -1) * (0.18 + rr() * 0.1), y + 0.9 - i * 0.03, -0.75 - i * 0.18, 0));
  // a little dorsal ridge on the thorax
  inner.add(part(ell(0.12, 0.08, 0.3, 10, 8), darkM, 0, y + 0.56, 0.12, 0.015));
  return { head: [y + 0.2, 0.62], back: [y + 1.0, -0.85, 'up'], top: y + 1.0, w: 0.6 };
}

function carBody(inner, tint, legH) {
  const bodyM = toon(tint);
  const y = legH + 0.55;
  inner.add(part(ell(0.78, 0.5, 1.35, 20, 14), bodyM, 0, y, 0, 0.05));
  inner.add(part(rbox(1.5, 0.22, 2.4, 0.1), toon(CREAM), 0, y - 0.28, 0, 0.03));
  inner.add(part(rbox(1.3, 0.14, 0.3, 0.06), toon(DARKM), 0, y - 0.25, 1.3, 0.02));
  for (const sx of [-1, 1]) {
    inner.add(part(ell(0.14, 0.1, 0.06, 10, 8), glow(0xfff6a8), sx * 0.45, y - 0.05, 1.3, 0));
    inner.add(part(rbox(0.08, 0.36, 0.42, 0.04), bodyM, sx * 0.42, y + 0.45, -1.05, 0.02, { rz: -sx * 0.35, rx: -0.35 }));
    inner.add(part(ell(0.1, 0.07, 0.05, 8, 6), glow(0xff2a4a), sx * 0.5, y + 0.02, -1.3, 0));
  }
  return { head: [y + 0.38, 0.35], back: [y + 0.45, -0.7, 'up'], top: y + 0.5, w: 0.8 };
}

function junkBody(inner, tint, legH) {
  const y = legH + 0.05;
  inner.add(part(rbox(1.0, 0.82, 0.92, 0.14), toon(tint), 0, y + 0.41, 0, 0.04));
  inner.add(part(rbox(1.02, 0.1, 0.94, 0.04), toon(GUN), 0, y + 0.62, 0, 0));
  inner.add(part(rbox(0.6, 0.3, 0.06, 0.04), toon(DARKM), 0, y + 0.36, 0.47, 0.015));
  for (let k = 0; k < 4; k++) inner.add(part(rbox(0.5, 0.03, 0.02, 0.01), toon(GUN), 0, y + 0.26 + k * 0.07, 0.5, 0));
  for (const [x, yy] of [[-0.42, 0.12], [0.42, 0.12], [-0.42, 0.72], [0.42, 0.72]]) inner.add(part(ell(0.04, 0.04, 0.03, 8, 6), toon(STEEL), x, y + yy, 0.47, 0));
  inner.add(part(cyl(0.14, 0.14, 0.12, 10), toon(0xffb347), 0.3, y + 0.85, -0.2, 0.015));
  return { head: [y + 0.84, 0.05], back: [y + 0.84, -0.22, 'up'], top: y + 0.84, w: 0.52 };
}

function saplingBody(inner, tint, legH, rr) {
  const y = legH - 0.05;
  inner.add(part(lathe([[0.3, 0], [0.22, 0.12], [0.18, 0.5], [0.16, 0.95], [0.12, 1.1], [0, 1.12]], 12), toon(BARK), 0, y, 0, 0.03));
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + rr();
    inner.add(part(taper([[0, 0, 0], [Math.cos(a) * 0.25, 0.18, Math.sin(a) * 0.25], [Math.cos(a) * 0.42, 0.42, Math.sin(a) * 0.42]], 0.06, 0.025, 8, 6), toon(BARK), 0, y + 0.6 + i * 0.12, 0, 0.015));
  }
  const leafM = [toon(tint), toon(shade(tint, 0.78)), toon(0x8fd16a)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rr() * 0.5;
    inner.add(part(ico(0.3 + rr() * 0.12), leafM[i % 3], Math.cos(a) * 0.36, y + 1.0 + rr() * 0.25, Math.sin(a) * 0.36 - 0.05, 0.03, { ry: rr() * 6 }));
  }
  inner.add(part(ico(0.38), leafM[0], 0, y + 1.25, -0.1, 0.03));
  return { head: [y + 1.3, 0.28], back: [y + 0.7, -0.22, 'rear'], top: y + 1.55, w: 0.6 };
}

// =============================================================================================
// HEADS: built round the neck point (y = 0 at the chin), facing +z.
// =============================================================================================
function makeHead(kind, rr) {
  const h = new THREE.Group();
  if (kind === 'mite') {
    const skin = toon(0xb8e986), dark = toon(CHITIN);
    h.add(part(ell(0.36, 0.32, 0.34), skin, 0, 0.26, 0.05, 0.03));
    for (const sx of [-1, 1]) {
      // big compound eyes with a glint, curling antennae, little mandibles
      h.add(part(ell(0.17, 0.2, 0.15, 12, 10), glow(0xff2e88), sx * 0.2, 0.36, 0.25, 0.02));
      h.add(part(ell(0.05, 0.05, 0.03, 8, 6), glow(0xffffff), sx * 0.24, 0.44, 0.38, 0));
      h.add(part(taper([[0, 0, 0], [sx * 0.08, 0.3, 0.06], [sx * 0.24, 0.55, -0.02], [sx * 0.38, 0.62, -0.14]], 0.025, 0.018, 12, 5), dark, sx * 0.1, 0.5, 0.12, 0.012));
      h.add(part(ell(0.06, 0.06, 0.06, 8, 6), glow(0xff2e88), sx * 0.48, 1.12, -0.02, 0.012));
      h.add(part(taper([[0, 0, 0], [sx * 0.04, -0.06, 0.12], [-sx * 0.04, -0.1, 0.2]], 0.045, 0.02, 8, 5), dark, sx * 0.12, 0.08, 0.3, 0.012));
    }
  } else if (kind === 'car') {
    // a bubble cab with headlight eyes and a grille grin
    h.add(part(lathe([[0.42, 0], [0.46, 0.08], [0.44, 0.16], [0, 0.16]], 18), toon(0xff7ad9), 0, 0, 0, 0.025));
    h.add(part(ell(0.4, 0.36, 0.4, 16, 10), glow(0x9be7ff), 0, 0.16, 0, 0.025));
    for (const sx of [-1, 1]) {
      h.add(part(ell(0.13, 0.13, 0.08, 12, 8), glow(0xfff6a8), sx * 0.2, 0.08, 0.4, 0.02));
      h.add(part(ell(0.05, 0.06, 0.03, 8, 6), toon(DARKM), sx * 0.19, 0.08, 0.47, 0));
    }
    h.add(part(rbox(0.36, 0.08, 0.06, 0.03), toon(DARKM), 0, -0.02, 0.43, 0.012));
  } else if (kind === 'alien') {
    const skin = toon(PALETTE.alien[Math.floor(rr() * 4)]);
    h.add(part(lathe([[0, 0], [0.14, 0.02], [0.22, 0.14], [0.3, 0.36], [0.34, 0.56], [0.28, 0.72], [0, 0.78]], 16), skin, 0, 0, 0, 0.03));
    for (const sx of [-1, 1]) {
      h.add(part(ell(0.1, 0.16, 0.06, 12, 8), toon(0x05030c), sx * 0.14, 0.34, 0.24, 0, { rz: sx * 0.45 }));
      h.add(part(ell(0.03, 0.04, 0.02, 6, 6), glow(0xffffff), sx * 0.12, 0.4, 0.3, 0));
      h.add(part(taper([[0, 0, 0], [sx * 0.08, 0.2, 0], [sx * 0.18, 0.36, -0.04]], 0.025, 0.018, 8, 5), skin, sx * 0.1, 0.7, 0, 0.012));
      h.add(part(ell(0.07, 0.07, 0.07, 8, 6), glow(0xfff27a), sx * 0.28, 1.08, -0.04, 0.012));
    }
  } else if (kind === 'junkbot') {
    // a little CRT head with a pixel face, an antenna and ear bolts
    h.add(part(rbox(0.62, 0.48, 0.5, 0.08), toon(STEEL), 0, 0.24, 0, 0.03));
    h.add(part(rbox(0.5, 0.36, 0.04, 0.05), glow(0x123a3a), 0, 0.25, 0.25, 0));
    for (const sx of [-1, 1]) {
      h.add(part(rbox(0.08, 0.08, 0.02, 0.01), glow(0x7dff6a), sx * 0.1, 0.3, 0.27, 0));
      h.add(part(cyl(0.06, 0.06, 0.08, 8), toon(GUN), sx * 0.33, 0.24, 0, 0.012, { rz: Math.PI / 2 }));
    }
    h.add(part(rbox(0.22, 0.04, 0.02, 0.01), glow(0x7dff6a), 0, 0.17, 0.27, 0));
    h.add(part(cyl(0.02, 0.02, 0.32, 5), toon(DARKM), 0.14, 0.62, -0.05, 0));
    h.add(part(ell(0.06, 0.06, 0.06, 8, 6), glow(0xff2a4a), 0.14, 0.8, -0.05, 0));
  } else if (kind === 'sapling') {
    // a flower with a face
    h.add(part(cyl(0.05, 0.06, 0.2, 6), toon(0x3f9a3a), 0, 0.1, 0, 0.012));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      h.add(part(ell(0.18, 0.06, 0.12, 10, 6), toon(0xff7ad9), Math.cos(a) * 0.27, 0.36 + Math.sin(a) * 0.27, 0.0, 0.015, { rz: a, rx: Math.PI / 2 }));
    }
    h.add(part(cyl(0.2, 0.2, 0.08, 16), glow(0xffd23f), 0, 0.36, 0.04, 0.02, { rx: Math.PI / 2 }));
    for (const sx of [-1, 1]) h.add(part(ell(0.03, 0.045, 0.02, 6, 6), toon(DARKM), sx * 0.07, 0.4, 0.09, 0));
    h.add(part(torus(0.06, 0.012, 10, 4, Math.PI), toon(DARKM), 0, 0.33, 0.09, 0, { rz: Math.PI }));
  } else {
    // helmeted heads: person (navy visor), pirate (green visor, red bandana), voidling (glowing)
    const helmet = kind === 'pirate' ? 0x2b2b2b : kind === 'voidling' ? 0x7b2ff7 : CREAM;
    h.add(part(ell(0.34, 0.33, 0.34), toon(helmet), 0, 0.3, 0, 0.03));
    h.add(part(torus(0.3, 0.05, 18, 6), toon(kind === 'person' ? GUN : DARKM), 0, 0.04, 0, 0.012, { rx: Math.PI / 2 }));
    const visorM = kind === 'person' ? toon(0x241a5c) : glow(kind === 'pirate' ? 0x7dff3a : 0xff2e88);
    h.add(part(ell(0.27, 0.17, 0.16, 14, 10), visorM, 0, 0.32, 0.22, 0.02));
    h.add(part(ell(0.06, 0.04, 0.02, 8, 6), glow(0xffffff), 0.1, 0.39, 0.37, 0));
    if (kind === 'pirate') {
      h.add(part(torus(0.33, 0.06, 20, 6), toon(0xd7263d), 0, 0.46, 0, 0.012, { rx: Math.PI / 2 - 0.15 }));
      h.add(part(taper([[0, 0, 0], [0.06, -0.12, -0.08], [0.02, -0.26, -0.12]], 0.05, 0.03, 8, 5), toon(0xd7263d), 0.1, 0.48, -0.3, 0.012));
      h.add(part(torus(0.05, 0.012, 10, 4), toon(0xffd23f), -0.33, 0.18, 0.02, 0, { ry: Math.PI / 2 }));
    } else if (kind === 'voidling') {
      for (const sx of [-1, 1]) h.add(part(cone(0.06, 0.26, 6), toon(0xc77dff), sx * 0.2, 0.62, -0.04, 0.012, { rz: -sx * 0.4 }));
    } else {
      for (const sx of [-1, 1]) h.add(part(cyl(0.06, 0.06, 0.08, 8), toon(0xff4f2e), sx * 0.34, 0.3, 0, 0.012, { rz: Math.PI / 2 }));
    }
  }
  return h;
}

// =============================================================================================
// Build the creature from its genes. Feet at y = 0, facing +z.
// =============================================================================================
export function makeChimera(genes) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const rr = mulberry32(genes.seed);
  const L = genes.legs;
  const legs = L === 'car' ? wheelLegs(inner)
    : L === 'mite' ? miteLegs(inner, genes.tint)
      : L === 'junkbot' ? treadLegs(inner)
        : L === 'sapling' ? rootLegs(inner, rr)
          : bipedLegs(inner, L, rr);
  const legH = legs.legH;
  const legParts = legs.parts;
  const arms = [];
  const B = genes.body;
  const bodyA = B === 'car' ? carBody(inner, genes.tint, legH)
    : B === 'mite' ? miteBody(inner, genes.tint, legH, rr)
      : B === 'junkbot' ? junkBody(inner, genes.tint, legH)
        : B === 'sapling' ? saplingBody(inner, genes.tint, legH, rr)
          : bipedBody(inner, B, genes.tint, legH, rr, L === 'car' || L === 'junkbot' ? null : arms);
  const { top, w: halfW } = bodyA;
  const [hy, hz] = bodyA.head;
  const [by, bz, bdir] = bodyA.back;
  const up = bdir === 'up';
  // heads sit on the neck; a second one shares it, both leaning apart
  const heads = [];
  const addHead = (kind, x, lean) => {
    const h = makeHead(kind, rr);
    h.position.set(x, hy, hz);
    h.rotation.z = lean;
    inner.add(h);
    heads.push(h);
  };
  if (genes.extraHead) { addHead(genes.head, -0.3, 0.28); addHead(genes.extraHead, 0.3, -0.28); } else addHead(genes.head, 0, 0);
  // mutations
  const M = genes.mods;
  if (M.includes('crystal')) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      // a cluster bursting out of the back: upward on a flat back, raked backward on an upright one
      const ox = Math.cos(a) * halfW * 0.45, oz = Math.sin(a) * 0.22;
      inner.add(part(octa(0.22 + rr() * 0.1), glow(0x2ee6ff), ox, by + (up ? 0.1 : oz) + rr() * 0.1, bz + (up ? oz : -0.12), 0.02, up ? { rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 } : { rx: -1.0 + Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.5 }));
    }
  }
  if (M.includes('mud')) {
    for (let i = 0; i < 6; i++) inner.add(part(ell(0.16 + rr() * 0.12, 0.1 + rr() * 0.06, 0.16 + rr() * 0.1, 8, 6), toon(0x6b4a2a), (rr() - 0.5) * halfW * 2, legH * (0.3 + rr() * 0.9), (rr() - 0.5) * 1.2, 0.02));
  }
  if (M.includes('spark')) {
    for (let i = 0; i < 3; i++) {
      inner.add(part(torus(halfW + 0.12 + i * 0.1, 0.03, 20, 5), glow(0xffb347), 0, legH + 0.25 + i * 0.28, (hz + bz) / 2, 0, { rx: Math.PI / 2 + (rr() - 0.5) * 0.5, rz: (rr() - 0.5) * 0.5 }));
    }
  }
  if (M.includes('lens')) {
    const h = heads[0];
    h.add(part(cyl(0.2, 0.24, 0.14, 16), toon(0xffd23f), 0, 0.7, 0.14, 0.025, { rx: Math.PI / 2 }));
    h.add(part(cyl(0.16, 0.16, 0.02, 16), glow(0xfff6a8), 0, 0.7, 0.22, 0, { rx: Math.PI / 2 }));
    h.add(part(ell(0.07, 0.07, 0.03, 8, 6), toon(0x05030c), 0, 0.7, 0.235, 0));
  }
  if (M.includes('radio')) {
    inner.add(part(cyl(0.025, 0.035, 1.2, 5), toon(0xd8d4e8), -halfW * 0.5, by + 0.6, bz, 0.012));
    for (let k = 0; k < 3; k++) inner.add(part(cyl(0.12 - k * 0.03, 0.12 - k * 0.03, 0.02, 8), toon(GUN), -halfW * 0.5, by + 0.4 + k * 0.3, bz, 0));
    inner.add(part(ell(0.09, 0.09, 0.09, 8, 6), glow(0x2ec4ff), -halfW * 0.5, by + 1.22, bz, 0));
  }
  if (M.includes('armor')) {
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) inner.add(part(rbox(0.12, 0.3, 0.55, 0.04), toon(STEEL), sx * (halfW + 0.04), legH + 0.35 + k * 0.32, (hz + bz) / 2, 0.025, { rz: sx * 0.15 }));
    inner.add(part(rbox(0.6, 0.1, 0.5, 0.04), toon(STEEL), 0, top + 0.02, bz * 0.6, 0.025));
  }
  if (M.includes('turbo')) {
    // a salvaged engine strapped on the back, exhausts glowing
    const eg = new THREE.Group();
    eg.position.set(0, up ? by + 0.2 : by, up ? bz : bz - 0.32);
    eg.add(part(rbox(0.6, 0.45, 0.6, 0.08), toon(GUN), 0, 0, 0, 0.03));
    eg.add(part(rbox(0.62, 0.08, 0.62, 0.03), toon(0xff4f2e), 0, 0.12, 0, 0));
    for (const sx of [-1, 1]) {
      eg.add(part(cyl(0.09, 0.12, 0.45, 10), toon(DARKM), sx * 0.18, 0.05, -0.45, 0.015, { rx: Math.PI / 2 }));
      eg.add(part(ell(0.09, 0.09, 0.05, 8, 6), glow(0xff6a2a), sx * 0.18, 0.05, -0.69, 0));
    }
    inner.add(eg);
  }
  if (M.includes('void')) {
    const aura = new THREE.Mesh(ell(1.6, 1.6, 1.6, 18, 12), new THREE.MeshBasicMaterial({ color: 0x7b2ff7, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.position.y = legH + 0.7;
    inner.add(aura);
  }
  inner.scale.setScalar(genes.size);
  // walk / roll / skitter animation
  let lastT = null;
  const anim = (t, speed) => {
    const k = Math.min(1, speed / 6);
    const dt = lastT === null ? 0 : Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    for (const p of legParts) {
      if (p.kind === 'wheel') {
        const roll = (speed * dt) / (p.r * genes.size);
        if (p.axis === 'y') p.m.rotation.y += roll; else p.m.rotation.x += roll;
      } else if (p.kind === 'mite') {
        // tripod gait: swing fore and aft, lift on the forward stroke
        const s = Math.sin(t * 16 + p.phase);
        p.m.rotation.y = p.yaw + s * 0.32 * k;
        p.m.rotation.z = p.side * Math.max(0, Math.cos(t * 16 + p.phase)) * 0.28 * k;
      } else if (p.kind === 'root') {
        p.m.rotation.x = Math.sin(t * 9 + p.phase) * 0.22 * k;
        p.m.rotation.z = Math.cos(t * 9 + p.phase) * 0.18 * k;
      } else p.m.rotation.x = Math.sin(t * 10) * 0.8 * k * p.side;
    }
    for (const a of arms) a.m.rotation.x = -Math.sin(t * 10) * 0.7 * k * a.side;
    heads.forEach((h, i) => { h.rotation.y = Math.sin(t * (2 + i) + i) * 0.3; });
    const bob = L === 'car' ? 0 : L === 'mite' ? Math.abs(Math.sin(t * 16)) * 0.04 : Math.abs(Math.sin(t * 10)) * 0.1;
    inner.position.y = bob * k;
  };
  return { root, anim, height: (top + 0.8) * genes.size };
}

// Small wild critter of the sunlit craters.
export function makeMite() {
  const genes = { seed: Math.floor(Math.random() * 1e9), body: 'mite', legs: 'mite', head: 'mite', extraHead: null, mods: [], size: 0.8, tint: 0xb8e986 };
  return makeChimera(genes);
}
