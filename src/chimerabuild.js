import * as THREE from 'three';
import { toon, glowShared, inkMat, inkMatNear, gradientMap } from './toon.js';
import { loadChimeraKit, figureGlass, inkShell } from './models.js';
import { mulberry32 } from './rng.js';
import { PALETTE, CHIMERA_DRAWN } from './chimeragenes.js';

// The chimera builder: puts every chimera in the game together from its gene sheet (the races, the pen, followers, cards, wild mites, the
// Mega Mite). Its parts come from the chimera kit (tools/blender/build_chimera.py -> chimera.glb): legs, body and head for each kind, in
// its looks (mite, car and sapling three each; a settler in the outfit of the NPC you scooped, or one drawn from the seed). Each part is
// one fused surface with its details cut in, and its joint built in: a body's skirt wraps over the legs and a head's stub goes into the
// body, and the hides shade into each other's colours across the joint. A body forks for two heads. The mutations are fitted to the
// parts in Blender (armour, crystal, mud: shown on a chimera that has them) or grow on their sockets in each family's form (spark,
// turbo, radio, lens); void wraps the whole creature in a shadowy aura. Far away, each part is swapped for its lighter copy.
//
// makeChimera(genes) -> { root, anim(t, speed), height }: once the kit is loaded (preloadChimeras(), at boot) it builds at once; before,
// it hands back an empty root that fills in when the kit arrives. chimeraBuilder() resolves to the same, for the lab and the Asset Row.

export const FAMILY = { person: 'human', pirate: 'human', voidling: 'human', alien: 'human', mite: 'mite', car: 'car', sapling: 'sapling', junkbot: 'car' };
export const KINDS = ['person', 'pirate', 'voidling', 'alien', 'mite', 'car', 'sapling', 'junkbot'];
export const MUTATIONS = ['armor', 'crystal', 'spark', 'radio', 'lens', 'turbo', 'mud', 'void'];
export { CHIMERA_DRAWN };
const FAR_AT = 22;                      // metres (times the chimera's size) past which its parts swap to their far copies
const GEO_KIND = { voidling: 'person' };                  // the void-touched wear a settler's parts
const LOOKS = { mite: 3, car: 3, sapling: 3 };
const HIDES = new Set(['person', 'pirate', 'alien', 'junkbot', 'mite', 'car', 'sapling', 'trousers', 'skin']);
const TOON = {
  dark: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0, chrome: 0xd8d4e8, tire: 0x1d1a29, boot: 0x3a3550, sole: 0x221d33, belt: 0x2a2540, gold: 0xffd23f,
  brass: 0xd9a441, bark: 0x7a5236, moss: 0x3f7a34, leaf: 0x5fbf4a, pine: 0x2f6b3a, petal: 0xff7ad9, blossom: 0xffc2e2, cap: 0xff3b5c, stem: 0xfff4e0,
  stonebark: 0x8c8798, vest: 0x5b6b4a, mud: 0x6b4a2a, leather: 0x6b4a2a, pouch: 0x8a6a3a, cream: 0xfff4e0, scarf: 0xd7263d, patch: 0x7a2f3a,
  sash: 0xffd23f, wrap: 0x8a6a3a, rust: 0xa0522d,
  helmet: 0xf3eee4, glove: 0xe8e4f0, shirt: 0xfff4e0, tie: 0xd7263d, hair: 0x4a2c17, shoe: 0x6b4a2a, tunic: 0x2b59c3,
};
const GLOW = {
  glass: 0x9be7ff, eye: 0xff2e88, lamp: 0xfff6a8, red: 0xff2a4a, crystal: 0x2ee6ff, spark: 0xffb347, voidglow: 0xa86bff, ember: 0xff6a2a,
  tip: 0xfff27a, screen: 0x123a3a, pixel: 0x7dff6a, gem: 0x7dff3a,
};
const BARK = new THREE.Color(0x7a5236), VOID_TINT = new THREE.Color(0x2a1648), VEIN = new THREE.Color(0xe3b8ff);

// ---- how the people dress: the NPCs' outfits (models.js figureSpec), never the player's orange ----
const OUTFIT = {      // an NPC's archetype -> the parts it wears
  coveralls: ['suit', 'coveralls'], engineer: ['suit', 'coveralls'], eva: ['suit', 'coveralls'], trooper: ['suit', 'coveralls'],
  lab: ['trousers', 'lab'], trader: ['trousers', 'jacket'], elder: ['trousers', 'jacket'], casual: ['trousers', 'hoodie'], kid: ['trousers', 'hoodie'],
};
const ARCHES = ['coveralls', 'coveralls', 'engineer', 'lab', 'trader', 'elder', 'casual', 'casual'];
const CLOTHES = {
  coveralls: [0xffd23f, 0x2ec4ff, 0xffffff, 0xff7ad9, 0x7dff6a, 0x55607a, 0x2b59c3, 0xd7263d, 0x2b8f6a], engineer: [0xffd23f, 0x2b59c3, 0xd7263d, 0x2b8f6a],
  casual: [0x2ec4ff, 0xff7ad9, 0x7dff6a, 0x55607a, 0xd7263d], lab: [0xffffff, 0xf3eee4, 0xdfeef5], trader: [0x2b59c3, 0x55607a, 0x6b4a2a, 0x2a2540],
  elder: [0xb5482f, 0x8a6a3a, 0x5b6b4a, 0x7a5236],
};
const PICK = {
  skin: [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21, 0xffe0bd, 0xd9a07a], hair: [0x2b1b12, 0x4a2c17, 0x8a5a2b, 0xd9a441, 0xe8d39a, 0x1a1a1a, 0xb5482f, 0xff7ad9],
  pants: [0x3a3550, 0x2a2540, 0x6b5a4a, 0x2b59c3, 0x55607a], visor: [0x9be7ff, 0x2ec4ff, 0xffd23f, 0x241a5c], shirt: [0xfff4e0, 0xbfe6ff, 0xffd6e8, 0xe8ffd6],
  tie: [0xd7263d, 0x2b59c3, 0xffd23f, 0x221d33], shoe: [0x6b4a2a, 0x221d33, 0x8a5a2b], tunic: [0x2b59c3, 0x7b2ff7, 0xd7263d, 0x2b8f6a, 0xffb347],
};

let HIDE_MAT = null;
const hideMat = () => HIDE_MAT || (HIDE_MAT = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap() }));
const _v = new THREE.Vector3(), _c = new THREE.Color(), _m = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);

// ---------------- the kit ----------------
let KIT = null, LOADING = null;
export function preloadChimeras() {
  return LOADING || (LOADING = loadChimeraKit().then((k) => (KIT = k)));
}
export const chimeraReady = () => !!KIT;
export async function chimeraBuilder() {
  await preloadChimeras();
  return (genes, opts) => buildChimera(genes, KIT, opts);
}
// The game's way in: built at once if the kit is loaded, else an empty root that fills in when it is.
export function makeChimera(genes, opts) {
  if (KIT) return autoDispose(buildChimera(genes, KIT, opts));
  const root = new THREE.Group();
  let built = null;
  preloadChimeras().then(() => { built = buildChimera(genes, KIT, opts); root.add(built.root); });
  return autoDispose({ root, anim: (t, speed) => built && built.anim(t, speed), get height() { return built ? built.height : 1.4 * (genes.size ?? 1.1) * CHIMERA_DRAWN; } });
}
// A chimera's own geometry (its hides, recoloured for it; a void aura) is freed once it is taken out of the scene for good (not just moved
// to another parent: that removes and adds it again at once).
function autoDispose(c) {
  c.root.addEventListener('removed', () => setTimeout(() => {
    if (c.root.parent) return;
    c.root.traverse((o) => { if (!o.isMesh) return; if (o.geometry.userData.own) o.geometry.dispose(); if (o.material.userData.own) o.material.dispose(); });
  }, 0));
  return c;
}

// ---------------- one chimera: near and far, in a LOD ----------------
export function buildChimera(genes, kit = KIT, { lod = true } = {}) {
  const near = assemble(genes, kit, '');
  if (!lod) return near;
  const far = assemble(genes, kit, '_far');
  const root = new THREE.LOD();
  root.addLevel(near.root, 0);
  root.addLevel(far.root, FAR_AT * (genes.size ?? 1.1));
  const anim = (t, speed) => { if (near.root.visible) near.anim(t, speed); else far.anim(t, speed); };
  return { root, anim, height: near.height };
}

function assemble(genes, kit, suffix) {
  const rr = mulberry32(((genes.seed | 0) ^ 0x51ce) >>> 0);
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const C = {
    rr, kit, suffix, inner, joints: [], anims: { legs: [], wheels: [], arms: [] }, hides: [], colors: {}, looks: {},
    mods: new Set(genes.mods || []), style: genes.style || {},
  };
  // each kind's colour and, for the people, their outfit
  for (const k of new Set([...(genes.parents || []), genes.body, genes.legs, genes.head, genes.extraHead].filter(Boolean))) {
    if (FAMILY[k] === 'human') {
      C.looks[k] = outfit(k, genes.looks && genes.looks[k], rr);
      C.colors[k] = new THREE.Color(k === 'alien' ? C.looks[k].skin : C.looks[k].suit);
    } else {
      const p = PALETTE[k] || PALETTE.car;
      const c = new THREE.Color(k === genes.body ? genes.tint ?? p[0] : p[Math.floor(rr() * p.length)]);
      C.colors[k] = k === 'sapling' ? c.lerp(BARK, 0.55) : c;
    }
  }
  // the parts, each on the one below; two heads ride a forked body, a neck each
  const legs = part(C, 'legs', genes.legs, inner);
  const hip = legs.sockets.hip;
  const body = part(C, 'body', genes.body, hip.node, genes.extraHead ? 2 : 1);
  joint(C, legs, body, hip);
  const heads = [];
  const two = genes.extraHead ? [[genes.head, 'neckL'], [genes.extraHead, 'neckR']] : [[genes.head, 'neck']];
  two.forEach(([kind, at], i) => {
    // (with two heads, the lens goes on the first and the radio on the second)
    const h = part(C, 'head', kind, body.sockets[at].node, 1, genes.extraHead ? (i === 0 ? ['radio'] : ['lens']) : []);
    joint(C, body, h, body.sockets[at]);
    heads.push(h);
  });
  inner.updateMatrixWorld(true);
  devices(C, legs, body, heads);
  if (genes.crown && heads[0].sockets.top) place(C, 'ch_crown', heads[0].sockets.top.node);
  inner.updateMatrixWorld(true);
  bleed(C);
  veins(C);
  if (C.mods.has('void')) voidAura(C, 0.8 * (genes.size ?? 1.1) * CHIMERA_DRAWN);      // (the aura's push: deeper than the creature is thick)
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
    inner.position.y = a > 0.1 ? Math.abs(Math.sin(w)) * 0.03 : 0;
  };
  anim(0, 0);
  return { root, anim, height: box.max.y - box.min.y };
}

// A person's outfit: the NPC's own (remembered when it was scooped: alchemy.js), else drawn from the seed.
function outfit(kind, seen, rr) {
  const pick = (a) => a[Math.floor(rr() * a.length)];
  const L = { arch: 'coveralls', headgear: 'sealed', helmet: 0xfff4e0, visor: pick(PICK.visor), skin: pick(PICK.skin), hair: pick(PICK.hair), pants: pick(PICK.pants),
    shirt: pick(PICK.shirt), tie: pick(PICK.tie), shoe: pick(PICK.shoe), tunic: pick(PICK.tunic) };
  if (kind === 'pirate') Object.assign(L, { suit: pick(PALETTE.pirate), helmet: 0x2b2b2b, visor: 0x7dff3a, glove: 0x221d33 });
  else if (kind === 'alien') Object.assign(L, { skin: pick(PALETTE.alien), suit: L.tunic });
  else {
    L.arch = pick(ARCHES);
    L.headgear = rr() < 0.25 ? 'bowl' : 'sealed';
    L.suit = kind === 'voidling' ? pick(PALETTE.voidling) : pick(CLOTHES[L.arch] || CLOTHES.coveralls);
    if (kind === 'voidling') { L.visor = 0x7dff3a; L.headgear = 'sealed'; }
  }
  // (the void-touched keep their shape but not their colours: purple, a green visor)
  const keys = kind === 'voidling' ? ['arch', 'pants', 'skin', 'hair'] : kind === 'pirate' ? [] : ['arch', 'headgear', 'suit', 'pants', 'helmet', 'visor', 'skin', 'hair'];
  if (seen) for (const key of keys) if (seen[key] !== undefined) L[key] = seen[key];
  if (L.suit === 0xff9f1c) L.suit = pick(CLOTHES.coveralls);                  // (never the player's orange, even on an NPC who wore it)
  if (L.headgear !== 'bowl' && L.headgear !== 'pirate') L.headgear = kind === 'pirate' ? 'pirate' : 'sealed';
  if (L.glove === undefined) L.glove = L.headgear === 'bowl' ? L.skin : L.arch === 'engineer' ? 0xe0a040 : L.arch === 'eva' ? 0xfff4e0 : 0x221d33;
  return L;
}

// ---------------- parts ----------------
// A part: { kind, slot, family, node, sockets: { name: { node, jrx, jrz } }, points: [where the spark's arcs crackle], joint, hides }
function partName(C, slot, kind) {
  const g = GEO_KIND[kind] || kind;
  if (g === 'person') {
    const L = C.looks[kind], o = OUTFIT[L.arch] || OUTFIT.coveralls;
    return `ch_${slot}_person_${slot === 'legs' ? o[0] : slot === 'body' ? o[1] : L.headgear === 'bowl' ? 'bowl' : 'sealed'}`;
  }
  const n = LOOKS[g] ? Math.floor(C.rr() * LOOKS[g]) : 0;
  return `ch_${slot}_${g}_${LOOKS[g] ? C.style[slot] ?? n : 0}`;           // (genes.style: a look picked by hand, the lab's and the Asset Row's)
}

function part(C, slot, kind, parent, form = 1, skip = []) {
  const name = partName(C, slot, kind);
  const node = C.kit[name + C.suffix] || C.kit[name];
  const L = C.looks[kind];
  const P = { kind, slot, family: FAMILY[kind], form, look: L ? L.arch : null, skip: new Set(skip), fitted: new Set(), sockets: {}, points: [], hides: C.hides,
    joint: { jrx: node.data.jrx || 0.1, jrz: node.data.jrz || 0.1 }, tint: tints(C, kind) };
  P.node = kitGroup(C, { ...node, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, P);
  parent.add(P.node);
  return P;
}

// the colours a part wears: its hide (the kind's colour), and for a person the outfit's
function tints(C, kind) {
  const hide = GEO_KIND[kind] || kind;
  const t = { [hide]: C.colors[kind] };
  const L = C.looks[kind];
  if (L) {
    for (const [slot, key] of [['trousers', 'pants'], ['skin', 'skin'], ['helmet', 'helmet'], ['glass', 'visor'], ['glove', 'glove'], ['shirt', 'shirt'], ['tie', 'tie'], ['hair', 'hair'], ['shoe', 'shoe'], ['tunic', 'tunic']]) t[slot] = new THREE.Color(L[key]);
    if (kind === 'alien') t.alien = new THREE.Color(L.skin);
  }
  return t;
}

// a kit node as a group: hides drawn in vertex colours (so they can shade into the neighbours'), the rest in their toon or glow
function kitGroup(C, node, P) {
  const g = new THREE.Group();
  g.name = node.name;
  g.position.copy(node.pos);
  g.quaternion.copy(node.quat);
  g.userData = { ...node.data, role: node.role };
  for (const { slot, geo } of node.parts) {
    if (slot === 'inkonly') continue;                         // (an outline source: its ink is already in node.ink)
    const tint = P.tint && P.tint[slot];
    let m;
    if (HIDES.has(slot)) {
      const geo2 = geo.clone();
      geo2.userData = { own: true };
      const col = tint || C.colors[P.kind] || new THREE.Color(0xff00ff);
      const arr = new Float32Array(geo2.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
      geo2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      m = new THREE.Mesh(geo2, hideMat());
      if (P.hides) P.hides.push({ mesh: m, owner: P });
    } else if (slot === 'bowl') {
      m = new THREE.Mesh(geo, figureGlass().mat);
      m.renderOrder = 2;
    } else if (slot in GLOW) m = new THREE.Mesh(geo, glowShared(tint ? tint.getHex() : GLOW[slot]));
    else m = new THREE.Mesh(geo, toon(tint ? tint.getHex() : TOON[slot] ?? 0xff00ff));
    m.castShadow = !(slot in GLOW) && slot !== 'bowl';
    g.add(m);
  }
  if (node.ink) { const m = new THREE.Mesh(node.ink, node.inkNear ? inkMatNear : inkMat); m.userData.isInk = true; g.add(m); }
  for (const k of node.kids) {
    if (k.role === 'form' && k.data.form !== (P.form || 1)) continue;                       // (a body's other form: one neck, or forked)
    if (k.role === 'extra' && !String(k.data.looks).split(',').includes(P.look)) continue;  // (pieces only some outfits wear)
    if (k.role === 'mut') {                                                                   // (a mutation fitted to the part)
      const want = String(k.data.mut);
      if (want[0] === '!' ? C.mods.has(want.slice(1)) : !C.mods.has(want)) continue;
      P.fitted.add(want);
    }
    const kg = kitGroup(C, k, P);
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

// a joint: the upper part's skirt or stub covers it; only the colours bleed across
function joint(C, lower, upper, sock) {
  C.joints.push({ node: sock.node, lower, upper, r: Math.max(sock.jrx || 0.1, sock.jrz || 0.1, upper.joint.jrx, upper.joint.jrz) });
}

// near a joint, a part's hide shades toward the colour of the part on the other side of it (half way at the joint itself)
function bleed(C) {
  const inv = new THREE.Matrix4().copy(C.inner.matrixWorld).invert();
  const J = C.joints.map((j) => ({ ...j, p: j.node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) }));
  for (const { mesh, owner } of C.hides) {
    const col = mesh.geometry.attributes.color, P = mesh.geometry.attributes.position;
    if (!col) continue;
    _m.copy(inv).multiply(mesh.matrixWorld);
    const mine = J.filter((j) => j.lower === owner || j.upper === owner);
    if (!mine.length) continue;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      let w = 0, other = null;
      for (const j of mine) {
        const d = _v.distanceTo(j.p) / (j.r * 2.6);
        if (d < 1) { const k = 0.5 * (1 - d) * (1 - d); if (k > w) { w = k; other = j.lower === owner ? C.colors[j.upper.kind] : C.colors[j.lower.kind]; } }
      }
      if (!other) continue;
      _c.fromBufferAttribute(col, i).lerp(other, w);
      col.setXYZ(i, _c.r, _c.g, _c.b);
    }
    col.needsUpdate = true;
  }
}

// the void-touched: violet veins through their clothes
function veins(C) {
  for (const { mesh, owner } of C.hides) {
    if (owner.kind !== 'voidling') continue;
    const col = mesh.geometry.attributes.color, P = mesh.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i) * 31, y = P.getY(i) * 23, z = P.getZ(i) * 27;
      const v = Math.abs(Math.sin(x + Math.sin(y * 0.9) * 2.2) * Math.sin(z + Math.sin(x * 0.7) * 2.0) + Math.sin(y + z * 0.5) * 0.3);
      const k = Math.max(0, (v - 0.82) / 0.18);
      if (k <= 0) continue;
      _c.fromBufferAttribute(col, i).lerp(VEIN, k * 0.75);
      col.setXYZ(i, _c.r, _c.g, _c.b);
    }
    col.needsUpdate = true;
  }
}

// ---------------- a kit piece on a socket ----------------
function place(C, name, parent, n = null) {
  const node = C.kit[name];
  if (!node || !parent) return null;
  const g = kitGroup(C, { ...node, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, { kind: null, tint: null, hides: null });
  if (n) g.quaternion.setFromUnitVectors(_Y, n);
  parent.add(g);
  return g;
}

// ---------------- the devices: spark, turbo, radio, lens, in the family's form of the part they grow on ----------------
function devices(C, legs, body, heads) {
  const fam = (P) => FAMILY[P.kind];
  const mods = C.mods;
  for (const m of ['spark', 'turbo']) if (mods.has(m)) place(C, `ch_mut_${m}_${fam(body)}`, body.sockets[m] && body.sockets[m].node);
  if (mods.has('spark')) {                                    // arcs crackling on a few flanks
    const pts = [legs, body, ...heads].flatMap((P) => P.points.filter((p) => p.tag === 'side'));
    for (const p of pts.filter((_, i) => i % 2 === 0).slice(0, 4)) place(C, 'ch_arc', p.node, p.n);
  }
  for (const H of heads) {
    for (const m of ['radio', 'lens']) {
      if (!mods.has(m) || H.skip.has(m)) continue;
      const at = H.sockets[m] || (m === 'radio' ? H.sockets.top : H.sockets.eye);
      place(C, `ch_mut_${m}_${fam(H)}`, at && at.node);
    }
  }
}

// void: the whole creature darkens toward violet, wrapped in a shadowy aura
function voidAura(C, push) {
  for (const { mesh } of C.hides) {
    const col = mesh.geometry.attributes.color;
    if (!col) continue;
    for (let i = 0; i < col.count; i++) { _c.fromBufferAttribute(col, i).lerp(VOID_TINT, 0.35); col.setXYZ(i, _c.r, _c.g, _c.b); }
    col.needsUpdate = true;
  }
  // One aura, not a pile of shells. Every solid piece gets two shells (6 and 13 cm out: a bright glow and a dim outer one) and they blend
  // by MAX (a pixel takes the brightest of the shells over it and the scene behind, never their sum), so where they overlap they read as one
  // even glow. Each shell is drawn pushed back along the view (same place on screen, `push` metres deeper), so it only shows where nothing
  // of the creature is in front of it: round the silhouette, never laid over the creature itself. Near the feet the ground behind is closer
  // than that, and would hide it: the push fades out toward the ground (aH: each vertex's height above the feet). Tiny pieces get none.
  const auraMat = (color) => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    m.userData.own = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.push = { value: push };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float push;\nattribute float aH;').replace('#include <project_vertex>', `#include <project_vertex>
        mvPosition.xyz *= (length(mvPosition.xyz) + push * smoothstep(0.04, 0.5, aH)) / max(length(mvPosition.xyz), 1e-3);
        gl_Position = projectionMatrix * mvPosition;`);
    };
    m.customProgramCacheKey = () => 'chimeraAura';
    return m;
  };
  const layers = [[0.06, auraMat(0x7a3be8)], [0.13, auraMat(0x3c1a7c)]];
  const solid = [];
  C.inner.traverse((o) => {
    if (!o.isMesh || o.userData.isInk || o.material.isMeshBasicMaterial || o.material.transparent) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    if (o.geometry.boundingSphere.radius > 0.05) solid.push(o);
  });
  const toInner = new THREE.Matrix4(), invInner = new THREE.Matrix4().copy(C.inner.matrixWorld).invert();
  for (const o of solid) {
    toInner.multiplyMatrices(invInner, o.matrixWorld);
    for (const [d, mat] of layers) {
      const s = new THREE.Mesh(inkShell(o.geometry, d), mat);
      s.geometry.userData.own = true;
      const P = s.geometry.attributes.position, h = new Float32Array(P.count);
      for (let i = 0; i < P.count; i++) h[i] = _v.fromBufferAttribute(P, i).applyMatrix4(toInner).y;
      s.geometry.setAttribute('aH', new THREE.BufferAttribute(h, 1));
      s.renderOrder = 3;
      s.position.copy(o.position); s.quaternion.copy(o.quaternion); s.scale.copy(o.scale);
      o.parent.add(s);
    }
  }
}
