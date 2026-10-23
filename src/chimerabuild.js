import * as THREE from 'three';
import { toon, glowShared, inkMat, gradientMap } from './toon.js';
import { loadChimeraKit, figureSpec, figurePiece, figureGlass, inkShell } from './models.js';
import { mulberry32 } from './rng.js';
import { PALETTE } from './chimeragenes.js';

// The chimera builder: puts a chimera together from its gene sheet. Legs, body and head come from the chimera kit (tools/blender/
// build_chimera_kit.py: mites, cars, saplings, each part in three looks) or, for the human kinds, are cut out of the game's own NPCs
// (models.js figureSpec: the settlers, pirates, void-touched and Vrill you can scoop up). The parts are fused where they meet, with no
// collar or seam: a bridge of hide that shades from one parent's colour into the other's, and each part's hide bleeds toward its
// neighbours' colours near the joints. The mutations grow in the form of what they grow on (armour is plating on a car, plated chitin on
// a mite, hardened bark on a sapling, body armour on a person; crystals sprout all over; void wraps the whole creature in a shadowy aura).
//
// buildChimera(genes, kit, { hd }) -> { root, anim(t, speed), height } once loadChimeraKit() has resolved (chimeraBuilder() does both). The game
// still draws its chimeras with chimera.js until this look is signed off; tools/chimera-lab.html shows it.
//
// hd: the full-resolution showcase (tools/blender/build_chimera_hd.py -> chimera_hd.glb: person, mite, car, sapling, one look each). Each
// part is one fused surface with its details cut in; its joint is built in (a body's skirt wraps over the legs, a head's stub goes into the
// body), so no bridge is added; its armour and crystal are fitted to it in Blender and shown only when the chimera has them.

export const FAMILY = { person: 'human', pirate: 'human', voidling: 'human', alien: 'human', mite: 'mite', car: 'car', sapling: 'sapling', junkbot: 'car' };
export const KIT_KINDS = ['mite', 'car', 'sapling'];
export const BUILT_KINDS = ['person', 'pirate', 'voidling', 'alien', 'mite', 'car', 'sapling'];   // (junkbot is still to come: it draws as a car)
export const MUTATIONS = ['armor', 'crystal', 'spark', 'radio', 'lens', 'turbo', 'mud', 'void'];
const HIDES = new Set(['mite', 'car', 'sapling', 'cloth', 'person']);
const KIT_TOON = {
  dark: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0, chrome: 0xd8d4e8, tire: 0x1d1a29, white: 0xf3eee4, bark: 0x7a5236, stonebark: 0x8c8798,
  moss: 0x3f7a34, leaf: 0x5fbf4a, petal: 0xff7ad9, blossom: 0xffc2e2, cap: 0xff3b5c, gold: 0xffd23f, mud: 0x6b4a2a,
  boot: 0x3a3550, sole: 0x221d33, glove: 0xe8e4f0, helmet: 0xf3eee4, belt: 0x2a2540, vest: 0x5b6b4a,    // (the HD settler's, and its armour)
};
const KIT_GLOW = { glass: 0x9be7ff, eye: 0xff2e88, lamp: 0xfff6a8, red: 0xff2a4a, splice: 0x7dff3a, crystal: 0x2ee6ff, spark: 0xffb347, voidglow: 0xa86bff };
const FIG_K = 0.7, FIG_K_HEAD = 0.55;     // the NPCs, at this scale, are the kit's size (their heads a little smaller, or a helmet swamps the body under it)
const BARK = new THREE.Color(0x7a5236), VOID_TINT = new THREE.Color(0x2a1648);
// how each human kind dresses (the jar's pirates and void-touched are drawn this way when they wander off: alchemy.js spawnWanderer)
const PEOPLE = ['coveralls', 'lab', 'engineer', 'trader', 'elder', 'casual'];
const SETTLER = [0xffd23f, 0x2ec4ff, 0xffffff, 0xff7ad9, 0x7dff6a, 0x55607a, 0x2b59c3, 0xd7263d, 0x2b8f6a];   // (models.js PAL.clothes without 0xff9f1c)
const FIGURE = {
  person: (seed, rr) => {
    // a settler, in any of the NPCs' clothes but the player's orange (a lab coat stays white, a jacket or a knit is the NPC's own)
    const look = PEOPLE[Math.floor(rr() * PEOPLE.length)];
    return ['coveralls', 'engineer', 'casual'].includes(look) ? { seed, look, suit: SETTLER[Math.floor(rr() * SETTLER.length)] } : { seed, look };
  },
  pirate: (seed) => ({ seed, suit: 0x3a2b4f, visor: 0x7dff3a, helmet: 0x2b2b2b }),
  voidling: (seed) => ({ seed, suit: 0xc77dff, visor: 0x7dff3a, helmet: 0xfff4e0 }),
  alien: (seed) => ({ seed, alien: true }),
};

let HIDE_MAT = null;
const hideMat = () => HIDE_MAT || (HIDE_MAT = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap() }));
const _v = new THREE.Vector3(), _c = new THREE.Color(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);

let KIT = null;
export async function chimeraBuilder() {
  KIT = await loadChimeraKit();
  return (genes, opts) => buildChimera(genes, KIT, opts);
}

// ---------------- one chimera ----------------
export function buildChimera(genes, kit = KIT, { hd = false } = {}) {
  const rr = mulberry32(((genes.seed | 0) ^ 0x51ce) >>> 0);
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const C = {
    rr, kit, inner, joints: [], points: [], anims: { legs: [], wheels: [], arms: [], motes: [] }, hides: [], specs: {}, colors: {},
    kinds: [...new Set(genes.parents && genes.parents.length ? genes.parents : [genes.body, genes.legs, genes.head])],
    void: (genes.mods || []).includes('void'), mods: new Set(genes.mods || []), hd,
  };
  // each kind's colour: its palette (a sapling's bark-green), or a person's clothes
  for (const k of new Set([...C.kinds, genes.body, genes.legs, genes.head, genes.extraHead].filter(Boolean))) {
    if (FAMILY[k] === 'human') C.colors[k] = new THREE.Color(spec(C, k).C);
    else {
      const p = PALETTE[k] || PALETTE.car;
      const c = new THREE.Color(k === genes.body ? genes.tint ?? p[0] : p[Math.floor(rr() * p.length)]);
      C.colors[k] = k === 'sapling' ? c.lerp(BARK, 0.55) : k === 'junkbot' ? c.lerp(new THREE.Color(0x9aa7bb), 0.5) : c;
    }
  }
  // the parts, each on the one below
  const legs = part(C, 'legs', genes.legs, inner);
  const hip = legs.sockets.hip;
  const body = part(C, 'body', genes.body, hip.node);
  joinParts(C, legs, body, hip, body.joint);
  const heads = [];
  const neck = body.sockets.neck;
  const two = genes.extraHead ? [[genes.head, -0.15, 0.28], [genes.extraHead, 0.15, -0.28]] : [[genes.head, 0, 0]];
  for (const [kind, dx, lean] of two) {
    const seat = new THREE.Group();
    seat.position.x = dx;
    seat.rotation.z = lean;
    neck.node.add(seat);
    const h = part(C, 'head', kind, seat);
    joinParts(C, body, h, { node: seat, jrx: neck.jrx, jrz: neck.jrz }, h.joint);
    heads.push(h);
  }
  inner.updateMatrixWorld(true);
  mutate(C, genes, legs, body, heads);
  if (genes.crown) place(C, 'ck_crown', heads[0].sockets.top.node, null, 1);
  inner.updateMatrixWorld(true);
  bleed(C);
  if (C.void) voidAura(C);
  const k = (genes.size ?? 1.1) * CHIMERA_DRAWN;
  inner.scale.setScalar(k);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  let lastT = null;
  const anim = (t, speed = 0) => {
    const dt = lastT === null ? 0 : Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    const a = Math.min(1, speed / 6);
    const w = t * (4 + speed * 0.9);
    for (const L of C.anims.legs) L.node.rotation.x = Math.sin(w + L.ph) * 0.55 * a + Math.sin(t * 1.7 + L.ph) * 0.04 * (1 - a);
    for (const A of C.anims.arms) A.node.rotation.x = Math.sin(w + A.ph) * 0.5 * a;
    for (const W of C.anims.wheels) W.node.rotation.x += (speed * dt) / (W.r * k);
    for (const M of C.anims.motes) { const q = t * M.sp + M.ph; M.node.position.set(Math.cos(q) * M.r, M.y + Math.sin(q * 1.7) * 0.08, Math.sin(q) * M.r); M.node.rotation.y = q * 2; }
    inner.position.y = a > 0.1 ? Math.abs(Math.sin(w)) * 0.03 : 0;
  };
  anim(0, 0);
  return { root, anim, height: box.max.y - box.min.y };
}
// Chimeras are drawn at this fraction of their gene size (a field of six fits the gate's 3 m stalls).
export const CHIMERA_DRAWN = 0.95;

function spec(C, kind) {
  if (!C.specs[kind]) {
    const S = figureSpec(FIGURE[kind](C.rr() * 1e9 | 0, C.rr));
    S.parts = S.build();
    C.specs[kind] = S;
  }
  return C.specs[kind];
}

// ---------------- parts ----------------
// A part: { kind, slot, family, node, sockets: { name: { node, jrx, jrz } }, points: [attachment points, where mutations grow], joint: { jrx, jrz }, hides: [...] }
function part(C, slot, kind, parent) {
  const P = C.hd && C.kit[`hd_${slot}_${kind}`] ? hdPart(C, slot, kind) : FAMILY[kind] === 'human' ? figurePart(C, slot, kind) : kitPart(C, slot, kind);
  P.slot = slot; P.family = FAMILY[kind];
  parent.add(P.node);
  return P;
}

// a kit piece as a group: hides drawn in vertex colours (so they can shade into the neighbours'), the rest in the kit's toon and glow
function kitGroup(C, node, P, tint) {
  const g = new THREE.Group();
  g.name = node.name;
  g.position.copy(node.pos);
  g.quaternion.copy(node.quat);
  g.userData = { ...node.data, role: node.role };
  for (const { slot, geo } of node.parts) {
    if (slot === 'inkonly') continue;                         // (an HD part's outline source: its ink is already in node.ink)
    let m;
    if (HIDES.has(slot)) {
      const geo2 = geo.clone();
      const col = tint[slot] || C.colors[P.kind] || new THREE.Color(0xff00ff);
      const arr = new Float32Array(geo2.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
      geo2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      m = new THREE.Mesh(geo2, hideMat());
      if (P.hides) P.hides.push({ mesh: m, owner: P });
    } else if (slot in KIT_GLOW) m = new THREE.Mesh(geo, glowShared(KIT_GLOW[slot]));
    else m = new THREE.Mesh(geo, toon(KIT_TOON[slot] ?? 0xff00ff));
    m.castShadow = !(slot in KIT_GLOW);
    g.add(m);
  }
  if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
  for (const k of node.kids) {
    if (k.role === 'mut') {                                   // (an HD part's fitted mutation: only on a chimera that has it)
      if (!C.mods.has(k.data.mut)) continue;
      P.fitted?.add(k.data.mut);
    }
    const kg = kitGroup(C, k, P, tint);
    g.add(kg);
    if (!P.sockets) continue;
    if (k.role === 'socket') P.sockets[k.data.socket] = { node: kg, jrx: k.data.jrx, jrz: k.data.jrz };
    else if (k.role === 'graft') P.points.push({ node: kg, tag: k.data.tag, size: k.data.size, n: new THREE.Vector3(k.data.nx, k.data.ny, k.data.nz), owner: P });
    else if (k.role === 'leg') C.anims.legs.push({ node: kg, ph: (P.legN = (P.legN || 0) + 1) % 2 ? 0 : Math.PI });
    else if (k.role === 'wheel') C.anims.wheels.push({ node: kg, r: k.data.r || 0.16 });
    else if (k.role === 'arm') C.anims.arms.push({ node: kg, ph: (P.armN = (P.armN || 0) + 1) % 2 ? Math.PI : 0 });
  }
  return g;
}

function kitPart(C, slot, kind) {
  const alt = Math.floor(C.rr() * 3);
  const node = C.kit[`ck_${slot}_${kind === 'junkbot' ? 'car' : kind}_${alt}`];
  const P = { kind, sockets: {}, points: [], hides: C.hides, joint: { jrx: node.data.jrx || 0.1, jrz: node.data.jrz || 0.1 } };
  P.node = kitGroup(C, { ...node, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, P, {});
  return P;
}

// an HD part (one look per kind); its fitted mutations are kids with role `mut`
function hdPart(C, slot, kind) {
  const node = C.kit[`hd_${slot}_${kind}`];
  const P = { kind, hd: true, fitted: new Set(), sockets: {}, points: [], hides: C.hides, joint: { jrx: node.data.jrx || 0.1, jrz: node.data.jrz || 0.1 } };
  P.node = kitGroup(C, { ...node, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, P, {});
  return P;
}

// a human part, cut out of an NPC: its legs (and the hips between them), its torso and arms, or its head
function figurePart(C, slot, kind) {
  const S = spec(C, kind);
  const P = { kind, sockets: {}, points: [], hides: C.hides, node: new THREE.Group() };
  const K = slot === 'head' ? FIG_K_HEAD : FIG_K;
  const frame = (o) => new THREE.Matrix4().makeScale(K, K, K).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  const add = (grp, o, at) => {
    const piece = figurePiece(S.parts, (p) => p.grp === grp, frame(o));
    const g = new THREE.Group();
    g.position.copy(at);
    g.add(piece.body, piece.hull);
    P.node.add(g);
    P.hides.push({ mesh: piece.body, owner: P, fig: true });
    return g;
  };
  const pt = (node, pos, n, tag, size = 0.8) => {
    const g = new THREE.Group();
    g.position.set(...pos).multiplyScalar(K);
    node.add(g);
    P.points.push({ node: g, tag, size, n: new THREE.Vector3(...n).normalize(), owner: P });
  };
  const hipPt = new THREE.Vector3(0, S.hip, 0);
  if (slot === 'legs') {
    // the two legs on their hips; the hip socket where the torso would start
    for (const [b, side] of [[1, -1], [2, 1]]) {
      const pv = S.pivots[b];
      const g = add(b, pv, pv.clone().multiplyScalar(K));
      C.anims.legs.push({ node: g, ph: side < 0 ? 0 : Math.PI });
      pt(g, [0, -0.25, 0.12], [0, 0.1, 1], 'side', 0.7);
      pt(g, [side * 0.1, -0.55, 0], [side, 0, 0.2], 'low', 0.6);
    }
    const s = new THREE.Group();
    s.position.copy(hipPt).multiplyScalar(K).add(_v.set(0, 0.04, 0));
    P.node.add(s);
    P.sockets.hip = { node: s, jrx: 0.25 * S.w * K, jrz: 0.19 * S.w * K };
    pt(P.node, [0, S.hip - 0.02, -0.15], [0, 0.1, -1], 'back', 0.7);
  } else if (slot === 'body') {
    // the torso from the hips up, the arms on their shoulders; the origin is the hips
    add('torso', hipPt, new THREE.Vector3());
    for (const [b, side] of [[3, -1], [4, 1]]) {
      const pv = S.pivots[b];
      const g = add(b, pv, pv.clone().sub(hipPt).multiplyScalar(K));
      g.rotation.z = side * 0.07;
      C.anims.arms.push({ node: g, ph: side < 0 ? Math.PI : 0 });
    }
    P.joint = { jrx: 0.25 * S.w * K, jrz: 0.19 * S.w * K };
    const tl = S.torsoLen, w = S.w;
    const neck = new THREE.Group();
    neck.position.copy(S.neck).sub(hipPt).multiplyScalar(K);
    P.node.add(neck);
    P.sockets.neck = { node: neck, jrx: 0.1 * K, jrz: 0.1 * K };
    const back = new THREE.Group();
    back.position.set(0, 0.55 * tl * K, -0.2 * w * K);
    P.node.add(back);
    P.sockets.back = { node: back };
    pt(P.node, [0, 0.6 * tl, 0.2 * w], [0, 0.1, 1], 'front', 0.9);
    for (const side of [-1, 1]) {
      pt(P.node, [side * 0.21 * w, 0.85 * tl, 0], [side * 0.4, 1, 0], 'top', 0.6);
      pt(P.node, [side * 0.26 * w, 0.35 * tl, 0], [side, 0.05, 0], 'side', 0.8);
    }
    pt(P.node, [0, 0.45 * tl, -0.2 * w], [0, 0.1, -1], 'back', 0.9);
    pt(P.node, [0, 0.12 * tl, 0.19 * w], [0, -0.4, 1], 'low', 0.6);
  } else {
    // the head (and its fishbowl, if it wears one); the origin is the neck
    add('head', S.neck, new THREE.Vector3());
    const hc = S.headC.clone().sub(S.neck).multiplyScalar(K);
    if (S.headgear === 'bowl' || S.headgear === 'bubble') {
      const G = figureGlass();
      const bowl = new THREE.Mesh(G.geo, G.mat);
      bowl.position.copy(hc).add(_v.set(0, 0.02 * K, 0));
      bowl.scale.setScalar(S.headS * K * (S.headgear === 'bubble' ? 0.88 : 1));
      bowl.renderOrder = 2;
      P.node.add(bowl);
    }
    P.joint = { jrx: 0.1 * K, jrz: 0.1 * K };
    const r = 0.3 * S.headS * K;
    const top = new THREE.Group(); top.position.copy(hc).add(_v.set(0, r, 0)); P.node.add(top);
    const eye = new THREE.Group(); eye.position.copy(hc).add(_v.set(0.085 * S.headS * K, 0.03 * S.headS * K, 0.24 * S.headS * K)); P.node.add(eye);
    P.sockets.top = { node: top };
    P.sockets.eye = { node: eye };
    for (const side of [-1, 1]) pt(P.node, [side * 0.26 * S.headS + (hc.x / K), hc.y / K, hc.z / K], [side, 0.2, 0], 'side', 0.45);
    pt(P.node, [hc.x / K, hc.y / K + 0.28 * S.headS, hc.z / K - 0.05], [0, 1, -0.3], 'top', 0.45);
  }
  return P;
}

// ---------------- the joints: no seam, a bridge of hide from one part into the other ----------------
function joinParts(C, lower, upper, sock, up) {
  if (upper.hd) {                                             // (its skirt or neck stub is the joint: only the colours bleed across it)
    C.joints.push({ node: sock.node, lower, upper, r: Math.max(sock.jrx || 0.1, sock.jrz || 0.1, up.jrx || 0.1, up.jrz || 0.1) });
    return;
  }
  const a = { rx: sock.jrx || 0.1, rz: sock.jrz || 0.1 }, b = { rx: up.jrx || 0.1, rz: up.jrz || 0.1 };
  const cA = C.colors[lower.kind], cB = C.colors[upper.kind];
  const seg = 14, rings = 7, h0 = -0.07, h1 = 0.08;
  const pos = [], col = [], idx = [];
  for (let j = 0; j < rings; j++) {
    const t = j / (rings - 1);
    const s = t * t * (3 - 2 * t);
    const bulge = 1 + 0.08 * Math.sin(Math.PI * t);
    const rx = (a.rx + (b.rx - a.rx) * s) * bulge, rz = (a.rz + (b.rz - a.rz) * s) * bulge;
    const y = h0 + (h1 - h0) * t;
    _c.copy(cA).lerp(cB, s);
    for (let i = 0; i < seg; i++) {
      const q = (i / seg) * Math.PI * 2;
      pos.push(Math.sin(q) * rx, y, Math.cos(q) * rz);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  for (let j = 0; j < rings - 1; j++) for (let i = 0; i < seg; i++) {
    const p = j * seg + i, q = j * seg + (i + 1) % seg;
    idx.push(p, p + seg, q, q, p + seg, q + seg);
  }
  for (const [j, y, c] of [[0, h0 - 0.02, cA], [rings - 1, h1 + 0.02, cB]]) {     // (rounded ends, buried in the parts)
    const ci = pos.length / 3;
    pos.push(0, y, 0); col.push(c.r, c.g, c.b);
    for (let i = 0; i < seg; i++) {
      const p = j * seg + i, q = j * seg + (i + 1) % seg;
      if (j === 0) idx.push(ci, p, q); else idx.push(ci, q, p);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, hideMat());
  m.castShadow = true;
  const ink = new THREE.Mesh(inkShell(geo, 0.02), inkMat);
  ink.userData.isInk = true;
  sock.node.add(m, ink);
  C.joints.push({ node: sock.node, lower, upper, r: Math.max(a.rx, a.rz, b.rx, b.rz) });
}

// near a joint, a part's hide shades toward the colour of the part on the other side of it (half way at the joint itself)
function bleed(C) {
  const inv = new THREE.Matrix4().copy(C.inner.matrixWorld).invert();
  const J = C.joints.map((j) => ({ ...j, p: j.node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) }));
  for (const { mesh, owner, fig } of C.hides) {
    const col = mesh.geometry.attributes.color, P = mesh.geometry.attributes.position;
    if (!col) continue;
    _m.copy(inv).multiply(mesh.matrixWorld);
    const mine = J.filter((j) => j.lower === owner || j.upper === owner);
    if (!mine.length) continue;
    const arr = fig ? null : col.array;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      let w = 0, other = null;
      for (const j of mine) {
        const d = _v.distanceTo(j.p) / (j.r * 2.6);
        if (d < 1) { const k = 0.5 * (1 - d) * (1 - d); if (k > w) { w = k; other = j.lower === owner ? C.colors[j.upper.kind] : C.colors[j.lower.kind]; } }
      }
      if (!other) continue;
      _c.fromBufferAttribute(col, i).lerp(other, w);
      if (arr) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; } else col.setXYZ(i, _c.r, _c.g, _c.b);
    }
    col.needsUpdate = true;
  }
}

// ---------------- placing a kit piece on a point or a socket ----------------
function place(C, name, parent, point, scale, tint = {}, used = true) {
  const node = C.kit[name];
  if (!node) return null;
  const P = { hides: C.hides, kind: point ? point.owner.kind : null };
  const g = kitGroup(C, { ...node, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, P, tint);
  g.scale.setScalar(scale);
  if (point) {
    g.quaternion.setFromUnitVectors(_Y, point.n).multiply(_q.setFromAxisAngle(_Y, C.rr() * Math.PI * 2));
    point.used = used;
  }
  (point ? point.node : parent).add(g);
  return g;
}
function tintFor(C, kind) {
  const c = C.colors[kind];
  return FAMILY[kind] === 'human' ? { cloth: c } : { [FAMILY[kind] === 'car' ? 'car' : kind]: c };
}

// ---------------- mutations, in the form of what they grow on ----------------
function mutate(C, genes, legs, body, heads) {
  const mods = genes.mods || [];
  const parts = [legs, body, ...heads];
  const free = (P, tags) => P.points.filter((p) => !p.used && (!tags || tags.includes(p.tag)));
  for (const m of mods) {
    if (m === 'armor') {
      for (const P of parts.filter((Q) => !Q.fitted?.has('armor'))) for (const p of free(P, ['side', 'top', 'front', 'back']).slice(0, P.slot === 'head' ? 1 : 4)) place(C, `ck_mut_armor_${P.family}`, null, p, p.size * 1.45, tintFor(C, P.kind));
    } else if (m === 'crystal') {
      const all = parts.filter((P) => !P.fitted?.has('crystal')).flatMap((P) => free(P)).sort(() => C.rr() - 0.5);
      for (const p of all.slice(0, 5 + Math.floor(C.rr() * 4))) place(C, `ck_mut_crystal_${Math.floor(C.rr() * 3)}`, null, p, p.size * (1.2 + C.rr() * 0.9));
    } else if (m === 'mud') {
      for (const p of parts.flatMap((P) => free(P, ['low', 'side'])).slice(0, 5)) place(C, `ck_mut_mud_${Math.floor(C.rr() * 2)}`, null, p, p.size * 1.6);
    } else if (m === 'lens') {
      const H = heads[0];
      const g = place(C, `ck_mut_lens_${H.family}`, H.sockets.eye.node, null, 1.2, tintFor(C, H.kind));
      if (g) g.quaternion.setFromUnitVectors(_Y, _v.set(0, 0, 1));
    } else if (m === 'radio') {
      const H = heads[heads.length - 1];
      place(C, `ck_mut_radio_${H.family}`, H.sockets.top.node, null, 1.35, tintFor(C, H.kind));
    } else if (m === 'spark' || m === 'turbo') {
      // on the back; the second of the two takes the top (or a free side) instead
      const back = body.sockets.back;
      const at = back.taken ? free(body, ['top', 'back', 'side'])[0] : null;
      const g = place(C, `ck_mut_${m}_${body.family}`, at ? null : back.node, at || null, 1.5, tintFor(C, body.kind));
      if (g && !at) g.quaternion.setFromUnitVectors(_Y, _v.set(0, 0.35, -1).normalize());
      back.taken = true;
      if (m === 'spark') for (const p of parts.flatMap((P) => free(P, ['side'])).slice(0, 2)) place(C, `ck_mut_spark_${p.owner.family}`, null, p, p.size * 0.9, tintFor(C, p.owner.kind));
    }
  }
}

// void: the whole creature darkens toward violet, wrapped in a shadowy aura, with motes of void drifting round it
function voidAura(C) {
  for (const { mesh } of C.hides) {
    const col = mesh.geometry.attributes.color;
    if (!col) continue;
    for (let i = 0; i < col.count; i++) { _c.fromBufferAttribute(col, i).lerp(VOID_TINT, 0.35); col.setXYZ(i, _c.r, _c.g, _c.b); }
    col.needsUpdate = true;
  }
  const aura = new THREE.MeshBasicMaterial({ color: 0x7b2ff7, transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const solid = [];
  C.inner.traverse((o) => { if (o.isMesh && !o.userData.isInk && !o.material.isMeshBasicMaterial && !o.material.transparent) solid.push(o); });
  for (const o of solid) {
    const s = new THREE.Mesh(inkShell(o.geometry, 0.07), aura);       // (a shell 7 cm out round every solid piece)
    s.renderOrder = 3;
    s.position.copy(o.position); s.quaternion.copy(o.quaternion); s.scale.copy(o.scale);
    o.parent.add(s);
  }
  for (let i = 0; i < 5; i++) {
    const g = place(C, 'ck_mut_void_mote', C.inner, null, 1);
    if (g) C.anims.motes.push({ node: g, r: 0.45 + C.rr() * 0.3, y: 0.3 + C.rr() * 0.8, sp: 0.6 + C.rr() * 0.8, ph: C.rr() * 6.28 });
  }
}
