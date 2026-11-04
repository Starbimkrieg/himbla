import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, inkMat } from './toon.js';
import { mulberry32 } from './rng.js';
import { TWOS } from './twos.js';

// ---- townsfolk: the generic NPC (makeFigure; models.js re-exports it) ----
// Each figure is ONE skinned mesh plus ONE ink-hull skinned mesh (two draw calls, one shadow caster): all parts baked, colours as
// vertex colours, rigidly weighted to ten bones: root, legL, legR, armL, armR, shinL, shinR (knees), foreL, foreR (elbows), head (neck).
// Callers animate by rotation (legs and arms about x; figureWalk below poses a stride, figureStand straightens). One shared material;
// baked geometry cached by look, so identical figures (soldiers, crowds) share it. Looks are random (or opts.seed); explicit colours
// win: suit = main clothing, helmet = headgear, visor = sealed helmet.
//   - Proportions: legs longer than the torso, a helmet about a head and a half across; an adult stands about 2.4 m (FIG_SCALE).
//   - Variety: six builds (slim, average, broad, stout, tall, petite), shoulder and hip widths, leg length, helmet paints, hair.
//   - Every human keeps a helmet: sealed (painted, never skin-toned, with a crown stripe, a rear vent plate and ear pods, so it reads
//     as a helmet from behind) or a fishbowl over a face sized to the body. Aliens go bare-headed: the Vrill, a crested kind and a
//     one-eyed kind.
//   - On twos: a figure's skeleton shows its pose in held steps, TWOS.fps a second (holdOnTwos), while the figure itself moves every
//     frame, as the courier's does, whatever code poses it.

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
  visor: [0x241a5c, 0x2b59c3, 0x1a1a2e, 0xc9a227],
};
const ARCH = ['coveralls', 'coveralls', 'lab', 'engineer', 'engineer', 'trader', 'trader', 'elder', 'eva', 'casual', 'casual'];
const BUILDS = {
  slim: { w: 0.86, h: 1.03, belly: 0 }, average: { w: 1, h: 1, belly: 0 }, broad: { w: 1.13, h: 1.02, belly: 0.01 },
  stout: { w: 1.08, h: 0.94, belly: 0.07 }, tall: { w: 0.95, h: 1.09, belly: 0 }, petite: { w: 0.9, h: 0.92, belly: 0 },
};
const BUILD_LIST = ['slim', 'average', 'average', 'average', 'broad', 'stout', 'tall', 'petite'];
const HELMETS = [0xf3eee4, 0xf3eee4, 0xdfe6f0, 0xc9c3d9, 0x9aa3b8, 0x55607a, 0xffd23f]; // paints: never skin-toned cream
const ALIENS = ['vrill', 'vrill', 'crest', 'orb'];
const DARK = 0x221d33, METAL = 0x5b5870;
// body (metres, before the build): hip pivots, thigh, hips to neck, helmet radius, chest/waist/hip half-widths, torso depth (fraction of
// width), leg and arm radii, upper arm and forearm, a bare head's radius; lathe segments round the torso and round the limbs
const D = { hip: 0.78, thigh: 0.36, torso: 0.6, headR: 0.275, chest: 0.24, waist: 0.215, hipW: 0.215, flat: 0.8, leg: 0.105, arm: 0.08, upper: 0.235, fore: 0.24, face: 0.165, seg: 12, limbSeg: 10 };
// every figure is built at these proportions and drawn this much bigger: an adult about 2.4 m to the helmet's top, the courier's height or a
// touch under (callers' `scale` multiplies it: kids, bouncers)
const FIG_SCALE = 1.2;
const PARENT = [-1, 0, 0, 0, 0, 1, 2, 3, 4, 0]; // bones: 0 root, 1 legL, 2 legR, 3 armL, 4 armR, 5 shinL, 6 shinR, 7 foreL, 8 foreR, 9 head

function figRng(seed) {
  if (seed === undefined) return Math.random;
  const a = Math.imul((Math.floor(seed * 1000) ^ 0x9e3779b9) | 0, 0x85ebca6b);
  return mulberry32((a ^ (a >>> 13)) >>> 0);
}

let FIG_M = null, FIG_GLASS = null, BOWL = null;
function figMats() {
  if (!FIG_M) {
    FIG_M = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toon(0xffffff).gradientMap });
    FIG_GLASS = new THREE.MeshToonMaterial({ color: 0xbfefff, gradientMap: toon(0xffffff).gradientMap, transparent: true, opacity: 0.36, depthWrite: false });
    BOWL = new THREE.SphereGeometry(0.4, 16, 12);
  }
  return FIG_M;
}
// The fishbowl helmet's glass (a 0.4 m globe and its material), also for the chimera builder's settlers who wear one.
export const figureGlass = () => { figMats(); return { geo: BOWL, mat: FIG_GLASS }; };

const CACHE = new Map();
const GEO = new Map(); // shared geometries by key
const geo = (k, make) => { let g = GEO.get(k); if (!g) { g = make(); GEO.set(k, g); } return g; };
const v2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const lathe = (k, pts, seg) => geo(`L|${k}|${seg}`, () => new THREE.LatheGeometry(v2(pts), seg));
const sph = (r, w = 10, h = 8, ps, pl, ts, tl) => geo(`S|${r}|${w}|${h}|${ps}|${pl}|${ts}|${tl}`, () => new THREE.SphereGeometry(r, w, h, ps, pl, ts, tl));
const rbx = (x, y, z, r, s = 1) => geo(`R|${x}|${y}|${z}|${r}|${s}`, () => new RoundedBoxGeometry(x, y, z, s, r));
const box = (x, y, z) => geo(`B|${x}|${y}|${z}`, () => new THREE.BoxGeometry(x, y, z));
const cyl = (a, b, h, s) => geo(`C|${a}|${b}|${h}|${s}`, () => new THREE.CylinderGeometry(a, b, h, s));
const tor = (R, r, rs, ts, arc = Math.PI * 2) => geo(`T|${R}|${r}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc).rotateX(Math.PI / 2));

const _fq = new THREE.Quaternion(), _fe = new THREE.Euler(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3();
const figMat = (p = [0, 0, 0], r = [0, 0, 0], s = 1) => new THREE.Matrix4().compose(
  _fp.set(p[0], p[1], p[2]), _fq.setFromEuler(_fe.set(r[0], r[1], r[2])), typeof s === 'number' ? _fs.setScalar(s) : _fs.set(s[0], s[1], s[2]));

// a lathe profile with crisp colour cuts: each y in `cuts` gets two rows 2 mm apart, so a band colour changes there sharply
function cutProfile(pts, cuts = []) {
  const rAt = (y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
      if ((y - y0) * (y - y1) <= 0 && y0 !== y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return pts[pts.length - 1][0];
  };
  const all = pts.map((p) => p.slice());
  for (const c of cuts) all.push([rAt(c - 0.001), c - 0.001], [rAt(c + 0.001), c + 0.001]);
  all.sort((p, q) => p[1] - q[1]);
  return { pts: all.map((p) => p.map((v) => Math.round(v * 10000) / 10000)), rAt };
}

// Bake parts (geometry, bone, colour or colour(local y), bind-space matrix, ink thickness) into one skinned geometry plus its ink hull.
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
        // ink()'s inverted hull: the part scaled about its centre by a fixed margin
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
  hull.setAttribute('skinIndex', new THREE.BufferAttribute(hsIdx, 4));
  hull.setAttribute('skinWeight', new THREE.BufferAttribute(hsW, 4, true));
  hull.setIndex(new THREE.BufferAttribute(hidx, 1));
  // limbs swing little: a fixed sphere round the figure culls correctly
  const bs = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 1.6);
  g.boundingSphere = bs; hull.boundingSphere = bs.clone();
  return { geo: g, hull };
}

// A townsperson's look before it is baked: palette and outfit, build and proportions, bone pivots, and build() for its parts.
function figureSpec({ suit, helmet, visor, scale = 1, seed, kind, look, alien: forceAlien = false, species: forceSpecies } = {}) {
  const rnd = figRng(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  const chance = (p) => rnd() < p;
  const kid = kind === 'kid' || scale < 0.75 || look === 'kid';
  const arch = look || (kind === 'soldier' ? 'trooper' : kid ? 'kid' : pick(ARCH));
  const alien = forceAlien || !!forceSpecies || !kid && kind !== 'soldier' && look === undefined && visor === undefined && helmet === undefined && chance(0.22);
  const species = alien ? forceSpecies || pick(ALIENS) : null;
  let headgear;
  if (alien) headgear = 'alien';
  else if (visor !== undefined || arch === 'trooper') headgear = 'sealed';
  else if (arch === 'eva') headgear = 'bowl';
  else if (arch === 'kid') headgear = 'bubble';
  else headgear = pick(['sealed', 'sealed', 'sealed', 'bowl']);
  const sealed = headgear === 'sealed';
  const mono = suit !== undefined && suit === helmet; // statues etc.: one colour all over

  // palette
  const C = suit !== undefined ? suit : pick(arch === 'lab' ? PAL.coat : arch === 'trader' ? PAL.jacket : arch === 'elder' ? PAL.knit : PAL.clothes);
  const skin = alien ? pick(PAL.alien) : pick(PAL.skin);
  const hair = arch === 'elder' ? pick(PAL.grey) : pick(PAL.hair);
  const hairStyle = arch === 'elder' ? pick(['fringe', 'bun', 'short', 'bald']) : pick(['short', 'short', 'bun', 'long', 'long', 'fringe', 'curly', 'buzz']);
  const hatC = helmet !== undefined ? helmet : arch === 'trooper' ? 0x3a3f50 : pick(HELMETS);
  const stripeC = arch === 'trooper' ? 0xffd23f : pick([C, C, 0xff9f1c, 0x2ec4ff, 0xd7263d]);
  const visorC = visor !== undefined ? visor : pick(PAL.visor);
  const inner = pick(PAL.pastel);
  const pants = arch === 'coveralls' || arch === 'engineer' || arch === 'eva' || arch === 'trooper' ? C : pick(PAL.trousers);
  const shoeC = pick(PAL.shoes);
  const glovesC = arch === 'eva' ? 0xfff4e0 : arch === 'engineer' ? 0xe0a040 : DARK;
  const gloved = !alien && (sealed || arch === 'eva' || arch === 'engineer' || arch === 'trooper');
  const handC = gloved ? glovesC : skin;
  const booted = arch === 'engineer' || arch === 'eva' || arch === 'trooper';
  const bootC = arch === 'eva' ? 0xfff4e0 : 0x3a3550;

  // build and proportions
  const bk = kid ? 'average' : arch === 'trooper' ? pick(['average', 'broad']) : arch === 'elder' ? pick(['slim', 'average', 'stout', 'petite']) : pick(BUILD_LIST);
  const B = BUILDS[bk];
  const bulk = arch === 'eva' ? 1.16 : arch === 'trooper' ? 1.06 : 1;
  const w = B.w * bulk * (0.97 + rnd() * 0.06);
  const shR = kid ? 1 : 0.92 + rnd() * 0.18; // shoulder width
  const hpR = kid ? 1 : 0.92 + rnd() * 0.18; // hip width
  const hl = (kid ? 0.86 : B.h * (0.96 + rnd() * 0.08)) * (arch === 'elder' ? 0.97 : 1); // leg length
  const tl = kid ? 0.88 : 0.97 + (B.h - 1) * 0.5 + rnd() * 0.04; // torso length
  const hs = kid ? 1.18 : 1; // head
  const limb = (arch === 'eva' ? 1.3 : arch === 'trooper' ? 1.08 : 1) * (0.94 + B.w * 0.06);
  const belly = B.belly;
  const stoop = arch === 'elder' ? 0.14 : 0;

  const H = D.hip * hl, T = D.torso * tl, thigh = D.thigh * hl, shin = H - thigh - 0.085;
  const R = D.headR * hs;
  // a bare head under a fishbowl or bubble: radius fr, centred fc over the neck; the glass round it (radius gR) and its ring (gRing)
  const fr = D.face * hs, fc = [0, 0.05 + fr * 1.06, 0.015], gR = fr * 1.6, gRing = Math.sqrt(gR * gR - (fc[1] - 0.01) ** 2);
  const acc = {
    bag: (arch === 'trader' || arch === 'casual') && chance(0.4),
    scarf: (arch === 'casual' || arch === 'elder' || arch === 'trader') && chance(0.3),
    hand: arch === 'lab' ? pick(['clipboard', 'tablet', 'clipboard']) : arch === 'trader' ? pick(['tablet', 'briefcase', 'none']) : arch === 'elder' ? (chance(0.5) ? 'cane' : 'none') : arch === 'kid' ? pick(['toy', 'none']) : arch === 'casual' ? pick(['tablet', 'none', 'none']) : 'none',
    pack: arch === 'kid' && chance(0.6),
  };
  const tieC = pick([0xd7263d, 0x2b59c3, 0xffd23f, 0x221d33]), scarfC = pick([0xd7263d, 0xffd23f, 0x2ec4ff, 0x7dff6a, 0xff7ad9]);
  const bagC = pick([0x6b4a2a, 0x3a3550, 0xffd23f, 0x2b59c3]), propC = pick([0x4a2c17, 0x221d33, 0x8a5a2b]), toyC = pick([0xff4f2e, 0x2ec4ff, 0x7dff6a, 0xffd23f]);
  const packC = pick(PAL.hat);
  const key = [arch, headgear, species, mono, C, skin, hair, hairStyle, hatC, stripeC, visorC, inner, pants, shoeC, bk, w.toFixed(2), shR.toFixed(2), hpR.toFixed(2), hl.toFixed(2), tl.toFixed(2), hs, JSON.stringify(acc), tieC, scarfC, bagC, propC, toyC, packC].join('|');

  // torso: one lathe from the crotch to the neck (torso frame: y 0 = hip pivots), flattened front to back. The seat runs down to
  // the crotch, 14 cm under the hip pivots, as wide as the thighs' outsides, so their domed tops sit inside it; the shoulders run
  // square out to the arms, then round over to the neck, so the shoulder balls sit in the line, not on top of it.
  const hp = D.hipW * w * hpR, wa = D.waist * w * (0.5 + 0.5 * hpR) + belly * 0.6, ch = D.chest * w * shR;
  const beltY = 0.27 * T;
  const tProf = [[0, -0.14], [hp * 0.55, -0.135], [hp * 0.9, -0.095], [hp * 1.05, -0.03], [hp * 1.05, 0.05], [(hp + wa) / 2 + belly * 0.7, 0.16 * T], [wa + belly, 0.34 * T], [(wa + ch) / 2 + belly * 0.3, 0.5 * T],
    [ch * 0.99, 0.66 * T], [ch * 1.02, 0.76 * T], [ch, 0.84 * T], [ch * 0.9, 0.9 * T], [ch * 0.62, 0.955 * T], [0.11 * w, 0.99 * T], [0, T]];
  const torso = cutProfile(tProf, arch === 'lab' || arch === 'eva' ? [] : [beltY]);
  const flat = D.flat * (arch === 'eva' ? 1.1 : 1);
  const front = (y) => torso.rAt(y) * flat; // the torso's front surface (z) at height y

  // pivots (bind pose, root at the feet)
  const torsoM = figMat([0, H, 0], [stoop, 0, 0]);
  const inTorso = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(torsoM);
  const shX = ch * 0.98 + D.arm * limb * 0.15; // the shoulder ball mostly inside the torso's edge
  const legX = hp * 0.5;
  const shoulder = (s) => inTorso(s * shX, 0.76 * T, 0);
  const upper = D.upper * limb ** 0.3 * (kid ? 0.82 : 1) * (0.94 + hl * 0.06), fore = D.fore * (kid ? 0.82 : 1) * (0.94 + hl * 0.06);
  const P = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-legX, H, 0), new THREE.Vector3(legX, H, 0),
    shoulder(-1), shoulder(1),
    new THREE.Vector3(-legX, H - thigh, 0), new THREE.Vector3(legX, H - thigh, 0),
    shoulder(-1).add(new THREE.Vector3(0, -upper, 0)), shoulder(1).add(new THREE.Vector3(0, -upper, 0)),
    inTorso(0, T - 0.01, 0.01),
  ];

  const build = () => {
    const parts = [];
    const vis = (c) => (mono ? (c === visorC ? c : C) : c);
    const col = (c) => (typeof c === 'number' ? vis(c) : mono ? () => C : c);
    // add(geometry, bone ('torso' = the root bone, in the torso's frame), colour or colour(local y), transform in that frame, ink)
    const add = (g, bone, c, m, ink = 0) => {
      const base = bone === 'torso' ? torsoM : figMat(P[bone].toArray(), bone === 9 ? [stoop * 0.4, 0, 0] : [0, 0, 0]);
      parts.push({ g, bone: bone === 'torso' ? 0 : bone, c: col(c), m: base.clone().multiply(m), ink });
    };
    const M = figMat;
    const seg = D.seg, ls = D.limbSeg;

    // ---------- torso and garments ----------
    add(lathe(`torso|${key}`, torso.pts, seg + 2), 'torso', arch === 'lab' || arch === 'eva' ? C : (y) => (y < beltY ? pants : C), M([0, 0, 0], [0, 0, 0], [1, 1, flat]), 0.03);
    const fz = (y, d = 0.004) => front(y) + d;
    if (arch === 'lab') {
      // the coat's skirt: from the waist to the knee, flaring, open at the hem
      const sk = [[hp * 1.12, -0.42 * hl], [hp * 1.07, -0.2], [hp * 1.02, 0.04], [wa * 1.04 + belly, 0.24]];
      add(lathe(`skirt|${key}`, sk, seg + 2), 'torso', C, M([0, 0, 0], [0, 0, 0], [1, 1, flat * 1.05]), 0.025);
      add(box(0.012, 0.42 * hl + 0.26, 0.012), 'torso', DARK, M([0, -0.08, fz(0.1, 0.012)], [-0.04, 0, 0]));
    }
    if (arch === 'coveralls' || arch === 'engineer') {
      add(box(0.035, 0.62 * T, 0.012), 'torso', DARK, M([0, 0.5 * T, fz(0.5 * T, 0.002)], [-0.06, 0, 0]));
      add(rbx(0.1, 0.1, 0.02, 0.008), 'torso', DARK, M([-0.1 * w, 0.68 * T, fz(0.68 * T, 0.004)], [-0.12, 0, 0]));
      add(rbx(0.09, 0.05, 0.012, 0.004), 'torso', 0xfff4e0, M([0.1 * w, 0.72 * T, fz(0.72 * T, 0.004)], [-0.12, 0, 0])); // name patch
      add(tor(0.12 * w, 0.035, 5, seg), 'torso', C, M([0, 0.95 * T, 0], [0, 0, 0], [1.15, 1, 0.9]), 0.015); // collar
    }
    if (arch === 'coveralls' || arch === 'trooper' || arch === 'trader') add(tor(torso.rAt(beltY), 0.028, 4, seg + 2), 'torso', DARK, M([0, beltY, 0], [0, 0, 0], [1.03, 1, flat * 1.03]), 0.015);
    if (arch === 'coveralls') add(rbx(0.07, 0.05, 0.02, 0.006), 'torso', METAL, M([0, beltY, fz(beltY, 0.02)]));
    if (arch === 'engineer') {
      add(tor(torso.rAt(beltY), 0.05, 4, seg + 2), 'torso', 0x6b4a2a, M([0, beltY, 0], [0, 0, 0], [1.04, 1, flat * 1.04]), 0.02);
      for (const x of [-0.17, 0.17, 0.05]) add(rbx(0.1, 0.12, 0.07, 0.015), 'torso', 0x8a6a3a, M([x * w, beltY - 0.06, x === 0.05 ? fz(beltY, 0.03) : 0.12], [0, x * 2.5, 0]), 0.015);
      add(tor(torso.rAt(0.6 * T), 0.022, 3, seg + 2), 'torso', 0xfff4e0, M([0, 0.6 * T, 0], [0, 0, 0], [1.03, 1, flat * 1.03]));
    }
    if (arch === 'trooper') {
      add(rbx(ch * 1.7, 0.36 * T, 0.12, 0.04, 2), 'torso', 0x3a3f50, M([0, 0.66 * T, fz(0.66 * T, 0.0)], [-0.06, 0, 0]), 0.025);
      add(rbx(0.44 * w, 0.5 * T, 0.2, 0.06, 2), 'torso', 0x3a3f50, M([0, 0.6 * T, -front(0.6 * T) - 0.06]), 0.03);
      for (const x of [-0.15, 0.15]) add(rbx(0.1, 0.12, 0.07, 0.015), 'torso', 0x3a3f50, M([x * w, beltY - 0.04, fz(beltY, 0.02)]), 0.015);
    }
    if (arch === 'lab' || arch === 'trader') {
      add(box(0.15 * w, 0.2, 0.02), 'torso', arch === 'lab' ? inner : 0xfff4e0, M([0, 0.8 * T, fz(0.8 * T, -0.004)], [-0.2, 0, 0]));
      for (const s of [-1, 1]) add(box(0.06, 0.32 * T / 0.6, 0.025), 'torso', C, M([s * 0.085 * w, 0.74 * T, fz(0.74 * T, 0.006)], [-0.16, 0, s * 0.33]), 0.01);
      if (arch === 'trader') add(box(0.055, 0.28 * T / 0.6, 0.02), 'torso', tieC, M([0, 0.68 * T, fz(0.68 * T, 0.01)], [-0.1, 0, 0]), 0.008);
      if (arch === 'lab') {
        add(box(0.1, 0.1, 0.02), 'torso', C, M([-0.12 * w, 0.62 * T, fz(0.62 * T, 0.005)], [-0.1, 0, 0]), 0.008);
        add(cyl(0.011, 0.011, 0.1, 5), 'torso', 0x2b59c3, M([-0.1 * w, 0.67 * T, fz(0.62 * T, 0.012)]));
        for (const y of [0.52, 0.38, 0.24]) add(sph(0.022, 6, 4), 'torso', DARK, M([0.02, y * T, fz(y * T, 0.004)]));
      }
    }
    if (arch === 'casual') {
      add(tor(0.15 * w, 0.065, 6, seg), 'torso', C, M([0, 0.93 * T, -0.05], [-0.35, 0, 0], [1.15, 1, 1]), 0.02); // hood rolled down
      add(rbx(0.24 * w, 0.12, 0.03, 0.012), 'torso', C, M([0, 0.32 * T, fz(0.32 * T, 0.006)], [0.06, 0, 0]), 0.01); // pocket
      for (const s of [-1, 1]) add(cyl(0.007, 0.007, 0.16, 4), 'torso', 0xfff4e0, M([s * 0.04, 0.8 * T, fz(0.8 * T, 0.012)], [-0.15, 0, 0]));
    }
    if (arch === 'elder') {
      for (const y of [0.64, 0.5, 0.36, 0.22]) add(sph(0.02, 6, 4), 'torso', 0xfff4e0, M([0, y * T, fz(y * T, 0.003)]));
      add(box(0.016, 0.6 * T, 0.01), 'torso', 0xfff4e0, M([0, 0.45 * T, fz(0.45 * T, -0.002)], [-0.03, 0, 0]));
      for (const s of [-1, 1]) add(box(0.09, 0.08, 0.015), 'torso', C, M([s * 0.12 * w, 0.3 * T, fz(0.3 * T, 0.004)]), 0.008);
    }
    if (arch === 'eva') {
      add(rbx(0.44 * w, 0.52 * T, 0.22, 0.07, 2), 'torso', 0xfff4e0, M([0, 0.62 * T, -front(0.6 * T) - 0.08]), 0.03);
      for (const s of [-1, 1]) add(geo('tank', () => new THREE.CapsuleGeometry(0.065, 0.34, 2, 8)), 'torso', METAL, M([s * 0.12, 0.64 * T, -front(0.6 * T) - 0.23]), 0.015);
      add(rbx(0.24, 0.15, 0.08, 0.03), 'torso', 0xfff4e0, M([0, 0.6 * T, fz(0.6 * T, 0.02)], [-0.08, 0, 0]), 0.015);
      [0xff4f2e, 0x7dff6a, 0xffd23f].forEach((c, n) => add(sph(0.022, 6, 4), 'torso', c, M([-0.06 + n * 0.06, 0.62 * T, fz(0.6 * T, 0.06)])));
      add(tor(torso.rAt(0.14), 0.035, 4, seg + 2), 'torso', 0xfff4e0, M([0, 0.14, 0], [0, 0, 0], [1.04, 1, flat * 1.04]), 0.015);
    }
    if (acc.scarf) {
      add(tor(0.13 * w, 0.055, 6, seg), 'torso', scarfC, M([0, 0.95 * T, 0.01], [0.15, 0, 0], [1.1, 1, 1]), 0.015);
      add(rbx(0.09, 0.3, 0.035, 0.015), 'torso', scarfC, M([0.07, 0.74 * T, fz(0.74 * T, 0.03)], [-0.18, 0, 0.12]), 0.012);
    }
    if (acc.bag) {
      add(tor(0.34, 0.02, 4, 16), 'torso', bagC, M([0, 0.5 * T, 0], [0, 0, 0.75], [1.02 * w, 1, 0.9 * flat * 1.25]));
      add(rbx(0.27, 0.22, 0.09, 0.035), 'torso', bagC, M([hp + 0.08, 0.1, 0.05], [0, Math.PI / 2 - 0.3, 0]), 0.02);
    }
    if (acc.pack) add(rbx(0.34, 0.38, 0.17, 0.06, 2), 'torso', packC, M([0, 0.55 * T, -front(0.55 * T) - 0.07]), 0.025);
    if (alien) add(cyl(0.065, 0.08, 0.14, 8), 9, skin, M([0, 0.04, 0]));

    // ---------- head (bone 9, origin at the neck) ----------
    if (alien) alienHead(add, M, species, skin);
    else if (sealed) helmetHead(add, M, { R, hatC, stripeC, visorC, trooper: arch === 'trooper', seg });
    else {
      // a face in a fishbowl (or a kid's bubble): neck, head, eyes, brows, nose, ears, mouth, hair; the glass is its own mesh
      const r = fr, hc = fc, k = r / 0.12; // (k: the features' scale, drawn for a 12 cm head)
      add(cyl(r * 0.42, r * 0.5, fc[1] - r * 0.6, 8), 9, skin, M([0, (fc[1] - r * 0.6) / 2, 0.005]));
      add(sph(r, seg, 10), 9, skin, M(hc, [0, 0, 0], [0.92, 1.06, 0.98]), 0.025);
      for (const s of [-1, 1]) {
        add(sph(0.016 * k, 6, 4), 9, 0x120a1e, M([hc[0] + s * 0.042 * k, hc[1] + 0.015 * k, hc[2] + r * 0.9], [0, 0, 0], [1, 1.3, 0.6]));
        add(box(0.04 * k, 0.009 * k, 0.01), 9, hair, M([hc[0] + s * 0.044 * k, hc[1] + 0.045 * k, hc[2] + r * 0.88], [0, 0, -s * 0.12]));
        add(sph(0.026 * k, 6, 4), 9, skin, M([s * r * 0.93, hc[1], hc[2]], [0, 0, 0], [0.5, 1, 0.8]), 0.008);
      }
      add(sph(0.02 * k, 6, 4), 9, skin, M([0, hc[1] - 0.012 * k, hc[2] + r * 0.98], [0, 0, 0], [0.9, 1.1, 1]), 0.006);
      add(box(0.03 * k, 0.006 * k, 0.008), 9, 0x7a3a3a, M([0, hc[1] - 0.05 * k, hc[2] + r * 0.9]));
      hairOn(add, M, hairStyle, hair, r, hc, seg);
      const rimC = headgear === 'bowl' ? (helmet !== undefined ? hatC : METAL) : hatC;
      add(tor(gRing, 0.035, 5, seg + 2), 9, rimC, M([0, 0.01, 0]), 0.015);
      // so the bowl reads as a helmet from behind (thin glass alone shows only a head): a spine from the collar at the back up over
      // the glass to the crown, and an air valve on the collar
      const a = Math.asin((fc[1] - 0.01) / gR);
      add(geo(`spine|${gR}|${a}`, () => new THREE.TorusGeometry(gR * 1.01, 0.014, 4, 14, Math.PI / 2 + a).rotateZ(-a).rotateY(Math.PI / 2)), 9, rimC, M(fc), 0.008);
      add(rbx(0.07, 0.06, 0.05, 0.015), 9, DARK, M([0, 0.04, -gRing - 0.02]), 0.008);
    }

    // ---------- legs: thigh (legL/R), knee and shin (shinL/R), shoe or boot ----------
    const L = D.leg * limb * (0.94 + B.w * 0.06);
    const bootTop = booted ? -shin * 0.58 : -shin + 0.02;
    const thighP = cutProfile([[0, 0.1], [L * 0.75, 0.09], [L * 1.06, 0.04], [L * 1.14, -0.02], [L * 1.1, -thigh * 0.4], [L * 0.86, -thigh * 0.92], [0, -thigh - 0.01]], [-thigh * 0.55]).pts; // (the cut: a kid's shorts)
    const shinP = cutProfile([[0, 0.03], [L * 0.86, 0.02], [L * 0.84, -shin * 0.3], [L * 0.7, -shin * 0.85], [L * 0.66, -shin * 0.95], [0, -shin - 0.005]], [bootTop]).pts;
    for (const s of [-1, 1]) {
      const legB = s < 0 ? 1 : 2, shinB = s < 0 ? 5 : 6;
      add(lathe(`thigh|${L.toFixed(3)}|${thigh.toFixed(3)}`, thighP, ls), legB, arch === 'kid' ? (y) => (y > -thigh * 0.55 ? pants : skin) : pants, M(), 0.028);
      const shinC = arch === 'kid' ? (y) => (y > -shin * 0.75 ? skin : 0xfff4e0) : booted ? (y) => (y > bootTop ? pants : bootC) : pants;
      add(lathe(`shin|${L.toFixed(3)}|${shin.toFixed(3)}|${bootTop.toFixed(3)}`, shinP, ls), shinB, shinC, M(), 0.026);
      add(sph(L * 0.88, ls, 6), shinB, arch === 'kid' ? skin : pants, M([0, 0, 0]));
      if (arch === 'engineer') add(tor(L * 0.78, 0.016, 3, ls), shinB, 0xfff4e0, M([0, -shin * 0.42, 0]));
      if (arch === 'coveralls' || arch === 'trooper') add(rbx(L * 1.4, 0.12, 0.06, 0.025), shinB, arch === 'trooper' ? 0x3a3f50 : DARK, M([0, -0.03, L * 0.75]), 0.012); // knee pad
      if (booted) add(rbx(0.2 * limb, 0.17, 0.33, 0.06), shinB, bootC, M([0, -shin, 0.045]), 0.025);
      else add(rbx(0.2, 0.14, 0.32, 0.06), shinB, arch === 'kid' ? 0xfff4e0 : shoeC, M([0, -shin - 0.015, 0.05]), 0.025);
    }

    // ---------- arms: upper (armL/R), elbow and forearm (foreL/R), mitten hand ----------
    const A = D.arm * limb * (0.95 + B.w * 0.05);
    const sleeve = arch === 'kid' ? -0.4 * upper : arch === 'engineer' && !sealed ? -fore * 0.5 : null; // short sleeves; rolled sleeves
    const upperP = cutProfile([[0, 0.08], [A * 1.12, 0.06], [A * 1.2, 0], [A * 1.05, -upper * 0.5], [A * 0.9, -upper - 0.005], [0, -upper - 0.02]], sleeve !== null && arch === 'kid' ? [sleeve] : []).pts;
    const foreP = cutProfile([[0, 0.02], [A * 0.88, 0.01], [A * 0.84, -fore * 0.4], [A * 0.72, -fore], [0, -fore - 0.005]], sleeve !== null && arch !== 'kid' ? [sleeve] : []).pts;
    for (const s of [-1, 1]) {
      const armB = s < 0 ? 3 : 4, foreB = s < 0 ? 7 : 8;
      const upC = arch === 'kid' ? (y) => (y > sleeve ? C : skin) : C;
      add(lathe(`upper|${A.toFixed(3)}|${upper.toFixed(3)}|${sleeve}`, upperP, ls), armB, upC, M(), 0.024);
      add(sph(A * 1.18, ls, 6), armB, arch === 'trooper' ? 0x3a3f50 : C, M([s * 0.008, 0, 0], [0, 0, 0], arch === 'trooper' ? [1.35, 1.05, 1.3] : [1.04, 0.92, 1]), 0.018);
      const foreC = arch === 'kid' ? skin : sleeve !== null ? (y) => (y > sleeve ? C : skin) : C;
      add(lathe(`fore|${A.toFixed(3)}|${fore.toFixed(3)}|${sleeve}`, foreP, ls), foreB, foreC, M(), 0.022);
      add(sph(A * 0.9, ls, 6), foreB, arch === 'kid' ? skin : C, M());
      const hy = -fore - 0.06 * limb;
      add(sph(0.058 * limb, 8, 6), foreB, handC, M([0, hy, 0.005], [0, 0, 0], [1.0, 1.2, 0.95]), 0.016);
      add(sph(0.024 * limb, 6, 4), foreB, handC, M([-s * 0.03 * limb, hy + 0.02, 0.035 * limb], [0, 0, 0], [1, 1.4, 1]), 0.008); // thumb, turned in and forward
      if (foreB !== 8) continue;
      // right-hand props
      if (acc.hand === 'clipboard') {
        add(box(0.22, 0.3, 0.02), foreB, 0x8a6a3a, M([-0.04, hy + 0.06, 0.12], [-1.1, 0.2, 0]), 0.01);
        add(box(0.18, 0.24, 0.006), foreB, 0xfff4e0, M([-0.04, hy + 0.068, 0.133], [-1.1, 0.2, 0]));
      } else if (acc.hand === 'tablet') {
        add(box(0.2, 0.27, 0.02), foreB, DARK, M([-0.05, hy + 0.06, 0.13], [-1.0, 0.25, 0]), 0.01);
        add(box(0.17, 0.24, 0.006), foreB, 0x2ee6ff, M([-0.05, hy + 0.068, 0.142], [-1.0, 0.25, 0]));
      } else if (acc.hand === 'briefcase') {
        add(rbx(0.32, 0.24, 0.09, 0.03), foreB, propC, M([0.02, hy - 0.2, 0], [0, Math.PI / 2, 0]), 0.02);
        add(geo('handle', () => new THREE.TorusGeometry(0.05, 0.012, 4, 8, Math.PI)), foreB, DARK, M([0.02, hy - 0.08, 0], [0, Math.PI / 2, 0]));
      } else if (acc.hand === 'cane') {
        add(cyl(0.02, 0.02, H - 0.12, 6), foreB, 0x6b4a2a, M([0, hy - (H - 0.12) / 2 + 0.02, 0.08], [0.08, 0, 0]), 0.01);
      } else if (acc.hand === 'toy') add(sph(0.08, 8, 6), foreB, toyC, M([0, hy - 0.04, 0.09]), 0.012);
    }
    return parts;
  };
  return { key, build, P, fc, gR, headgear, arch, alien, species, kid, scale, C, skin, pants, hatC, visorC, bk };
}

// A sealed helmet that reads as one from every side: shell, a round visor in a frame and a glint; a stripe over the crown; a vent
// plate at the back; ear pods (a lamp on the right one); a neck ring. Head frame: origin at the neck.
function helmetHead(add, M, { R, hatC, stripeC, visorC, trooper, seg }) {
  const c = [0, R * 0.86, 0.01], sh = [1, 1, 1.04];
  add(sph(R, seg + 2, 10), 9, hatC, M(c, [0, 0, 0], sh), 0.03);
  const [ps, pl, ts, tl] = [Math.PI / 2 - 0.9, 1.8, 0.92, 1.1];
  add(sph(R * 1.012, seg + 2, 8, ps - 0.1, pl + 0.2, ts - 0.08, tl + 0.16), 9, DARK, M(c, [0, 0, 0], sh));
  add(sph(R * 1.024, seg + 2, 8, ps, pl, ts, tl), 9, visorC, M(c, [0, 0, 0], sh));
  add(sph(0.04, 6, 4), 9, 0xffffff, M([c[0] - R * 0.33, c[1] + R * 0.3, c[2] + R * 0.95], [-0.35, -0.35, 0.5], [1.3, 0.5, 0.3]));
  // crown stripe: a band over the top from the visor's frame to the vent plate
  const sc = trooper ? 0xffd23f : stripeC;
  add(geo(`stripeF|${R}`, () => new THREE.SphereGeometry(R * 1.008, 3, 8, Math.PI / 2 - 0.16, 0.32, 0, 0.84)), 9, sc, M(c, [0, 0, 0], sh));
  add(geo(`stripeB|${R}`, () => new THREE.SphereGeometry(R * 1.008, 3, 10, -Math.PI / 2 - 0.16, 0.32, 0, 1.55)), 9, sc, M(c, [0, 0, 0], sh));
  // rear vent plate with slots
  add(rbx(R * 0.62, R * 0.42, 0.06, 0.02), 9, trooper ? 0x2a2540 : 0x3a3550, M([c[0], c[1] - R * 0.18, c[2] - R * 0.98 * sh[2]], [-0.25, 0, 0]), 0.012);
  for (let k = 0; k < 3; k++) add(box(R * 0.46, 0.012, 0.012), 9, 0x9aa3b8, M([c[0], c[1] - R * 0.08 - k * R * 0.1, c[2] - R * 1.02 * sh[2] - 0.004 + k * 0.01], [-0.25, 0, 0]));
  // ear pods, a lamp on the right
  for (const s of [-1, 1]) add(cyl(R * 0.26, R * 0.3, 0.07, seg), 9, 0x3a3550, M([s * R * 0.98, c[1] - R * 0.05, c[2] - R * 0.08], [0, 0, Math.PI / 2]), 0.012);
  add(cyl(R * 0.12, R * 0.12, 0.04, 8), 9, 0xfff6a8, M([R * 1.04 + 0.03, c[1] - R * 0.05, c[2] - R * 0.08], [0, 0, Math.PI / 2]));
  add(tor(R * 0.66, 0.035, 5, seg + 2), 9, trooper ? DARK : METAL, M([0, 0.02, 0]), 0.015);
}

// Bare alien heads (no air needed): the Vrill (tall skull, big dark eyes, antennae with glowing tips), a crested kind (a crest over
// the skull, gill slits, small eyes) and an orb-headed kind (one big eye, two ear stalks). Head frame: origin at the neck.
function alienHead(add, M, species, skin) {
  if (species === 'vrill') {
    const c = [0, 0.27, 0.02];
    add(sph(0.24, 12, 10), 9, skin, M(c, [0, 0, 0], [0.82, 1.18, 0.92]), 0.03);
    for (const s of [-1, 1]) {
      add(sph(0.03, 8, 6), 9, 0x05030c, M([s * 0.085, c[1] - 0.01, c[2] + 0.19], [0, 0, s * 0.35], [2.4, 3.2, 1.1]));
      add(cyl(0.012, 0.02, 0.3, 5), 9, skin, M([s * 0.08, c[1] + 0.34, c[2] - 0.03], [0, 0, -s * 0.35]), 0.01);
      add(sph(0.045, 6, 4), 9, 0xfff27a, M([s * 0.135, c[1] + 0.48, c[2] - 0.03]), 0.01);
    }
  } else if (species === 'crest') {
    const c = [0, 0.22, 0.02];
    add(sph(0.22, 12, 10), 9, skin, M(c, [0, 0, 0], [1.08, 0.92, 1.0]), 0.03);
    add(geo('crestFin', () => new THREE.CylinderGeometry(0.2, 0.2, 0.035, 16).rotateZ(Math.PI / 2)), 9, 0xff7ad9, M([0, c[1] + 0.08, c[2] - 0.01]), 0.012); // a disc set high: only its top stands out, a crest
    for (const s of [-1, 1]) {
      add(sph(0.026, 8, 6), 9, 0x05030c, M([s * 0.08, c[1] + 0.03, c[2] + 0.19], [0, 0, 0], [1.4, 1, 0.7]));
      for (let k = 0; k < 3; k++) add(box(0.008, 0.06, 0.02), 9, 0x2a2540, M([s * 0.215, c[1] - 0.06, c[2] + 0.02 - k * 0.04], [0, 0, s * 0.15]));
    }
    add(box(0.07, 0.008, 0.01), 9, 0x2a2540, M([0, c[1] - 0.09, c[2] + 0.2]));
  } else {
    const c = [0, 0.24, 0.02];
    add(sph(0.23, 14, 10), 9, skin, M(c), 0.03);
    add(sph(0.1, 10, 8), 9, 0xfff4e0, M([0, c[1] + 0.02, c[2] + 0.17], [0, 0, 0], [1, 1, 0.6]));
    add(sph(0.05, 8, 6), 9, 0x05030c, M([0, c[1] + 0.02, c[2] + 0.225], [0, 0, 0], [1, 1, 0.5]));
    for (const s of [-1, 1]) {
      add(cyl(0.014, 0.018, 0.16, 5), 9, skin, M([s * 0.17, c[1] + 0.2, c[2] - 0.02], [0, 0, -s * 0.6]), 0.01);
      add(sph(0.035, 6, 4), 9, skin, M([s * 0.23, c[1] + 0.26, c[2] - 0.02]), 0.01);
    }
  }
}

function hairOn(add, M, style, hair, r, hc, seg) {
  if (style === 'bald') return;
  const S = (k, make) => geo(`hair|${k}|${r}`, make);
  if (style === 'buzz') { add(S('buzz', () => new THREE.SphereGeometry(r * 1.03, seg, 6, 0, Math.PI * 2, 0, 1.2)), 9, hair, M(hc, [-0.2, 0, 0], [0.93, 1.06, 0.99])); return; }
  if (style === 'fringe') { add(S('fringe', () => new THREE.SphereGeometry(r * 1.07, seg, 5, Math.PI / 2 + 1.1, Math.PI * 2 - 2.2, 1.1, 0.85)), 9, hair, M(hc), 0.01); return; }
  add(S('top', () => new THREE.SphereGeometry(r * 1.07, seg, 6, 0, Math.PI * 2, 0, 1.0)), 9, hair, M(hc, [-0.18, 0, 0], [0.95, 1.05, 1]), 0.012);
  add(S('back', () => new THREE.SphereGeometry(r * 1.07, seg, 8, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, 2.0)), 9, hair, M(hc, [0, 0, 0], [0.95, 1.04, 1]), 0.012);
  if (style === 'bun') add(sph(r * 0.42, 8, 6), 9, hair, M([hc[0], hc[1] + r * 0.75, hc[2] - r * 0.72]), 0.01);
  if (style === 'long') add(rbx(r * 1.6, r * 1.7, r * 0.5, 0.02), 9, hair, M([hc[0], hc[1] - r * 0.75, hc[2] - r * 0.62], [0.08, 0, 0]), 0.012);
  if (style === 'curly') for (const [x, y, z] of [[-0.6, 0.6, 0.3], [0.6, 0.6, 0.3], [0, 0.85, 0.1], [-0.75, 0.2, -0.3], [0.75, 0.2, -0.3], [0, 0.55, -0.7]]) add(sph(r * 0.36, 8, 6), 9, hair, M([hc[0] + x * r, hc[1] + y * r, hc[2] + z * r]), 0.008);
}

// The figure's pose on twos: its skeleton is drawn from a pose held TWOS.fps times a second (each figure out of step with the others,
// as a crowd drawn by hand is). The renderer updates a skeleton once a frame (WebGLObjects); between steps this puts the held joint
// turns in for that update and then hands the live ones back, so whatever code poses the figure (easing toward targets included) works
// from the real pose, and the figure's root, which carries it through the world, never steps. Props on a bone (the fishbowl) are drawn
// with the held pose too.
function holdOnTwos(skeleton) {
  const bones = skeleton.bones, held = bones.map((b) => b.quaternion.clone()), live = bones.map(() => new THREE.Quaternion());
  const update = skeleton.update.bind(skeleton), off = Math.random();
  let slot = -1;
  skeleton.update = () => {
    if (!TWOS.on) return update();
    const s = Math.floor(performance.now() / 1000 * TWOS.fps + off);
    if (s !== slot) {
      slot = s;
      for (let i = 1; i < bones.length; i++) held[i].copy(bones[i].quaternion);
      return update();
    }
    for (let i = 1; i < bones.length; i++) { live[i].copy(bones[i].quaternion); bones[i].quaternion.copy(held[i]); }
    bones[0].updateMatrixWorld(true);
    update();
    for (let i = 1; i < bones.length; i++) bones[i].quaternion.copy(live[i]); // (the matrices catch up at the next frame's update)
  };
}

// A townsperson. Root at the feet; legL/legR at the hips, armL/armR at the shoulders (animate by rotation.x), shinL/shinR at the
// knees, foreL/foreR at the elbows, head at the neck. opts: suit, helmet, visor (colours), scale, seed, kind ('kid', 'soldier'),
// look (an outfit: coveralls, lab, engineer, trader, elder, eva, casual, kid, trooper), alien (true), species ('vrill', 'crest', 'orb').
export function makeFigure(opts = {}) {
  const S = figureSpec(opts);
  const mat = figMats();
  let baked = CACHE.get(S.key);
  if (!baked) { baked = bakeFigure(S.build()); CACHE.set(S.key, baked); }
  const root = new THREE.Group();
  const bones = S.P.map(() => new THREE.Bone());
  bones.forEach((b, i) => {
    const par = PARENT[i];
    b.position.copy(S.P[i]);
    if (par >= 0) { b.position.sub(S.P[par]); bones[par].add(b); }
  });
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const body = new THREE.SkinnedMesh(baked.geo, mat);
  body.castShadow = true;
  body.bind(skeleton);
  const hull = new THREE.SkinnedMesh(baked.hull, inkMat);
  hull.userData.isInk = true;
  hull.bind(skeleton);
  root.add(body, hull);
  if (S.headgear === 'bowl' || S.headgear === 'bubble') {
    const glass = new THREE.Mesh(BOWL, FIG_GLASS);
    glass.position.set(...S.fc);
    glass.scale.setScalar(S.gR / 0.4);
    glass.renderOrder = 2;
    bones[9].add(glass);
  }
  holdOnTwos(skeleton);
  const f = {
    root, body, legL: bones[1], legR: bones[2], armL: bones[3], armR: bones[4], shinL: bones[5], shinR: bones[6], foreL: bones[7], foreR: bones[8], head: bones[9],
    look: S.arch, alien: S.alien, species: S.species, build: S.bk, swing: S.arch === 'elder' ? 0.15 : S.arch === 'eva' ? 0.3 : 0.45,
    // what a chimera spliced from this person wears (alchemy.js keeps it on the jar item when you scoop them up)
    outfit: S.alien ? { skin: S.skin } : { arch: S.arch, headgear: S.headgear === 'sealed' ? 'sealed' : 'bowl', suit: S.C, pants: S.pants, helmet: S.hatC, visor: S.visorC, skin: S.skin },
  };
  figureStand(f);
  root.scale.setScalar(S.scale * FIG_SCALE);
  return f;
}

// A stride from a phase (radians): hips swing, the knee folds as the leg comes through, elbows bend on the forward swing, the head
// nods a touch. amt scales it (0: standing). Figures without knees (older rigs) just swing their legs and arms.
export function figureWalk(f, ph, amt = 1) {
  const s = Math.sin(ph), c = Math.cos(ph), sw = f.swing === undefined ? 0.45 : f.swing;
  f.legL.rotation.x = s * 0.5 * amt;
  f.legR.rotation.x = -s * 0.5 * amt;
  if (f.armL) { f.armL.rotation.x = -s * sw * amt; f.armR.rotation.x = s * sw * amt; }
  if (!f.shinL) return;
  figureKnees(f, ph, amt);
  f.foreL.rotation.x = -0.12 - 0.4 * Math.max(0, s) * (sw / 0.45) * amt;
  f.foreR.rotation.x = -0.12 - 0.4 * Math.max(0, -s) * (sw / 0.45) * amt;
  if (f.head) f.head.rotation.x = Math.abs(c) * 0.04 * amt;
}

// The knees for a stride at phase ph (for callers that pose the legs and arms their own way): each folds as its leg comes through.
export function figureKnees(f, ph, amt = 1) {
  if (!f.shinL) return;
  const c = Math.cos(ph);
  f.shinL.rotation.x = (0.06 + 0.85 * Math.max(0, -c)) * amt;
  f.shinR.rotation.x = (0.06 + 0.85 * Math.max(0, c)) * amt;
}

// Standing: legs straight, arms down a little off the hips, elbows a touch bent.
export function figureStand(f) {
  f.legL.rotation.set(0, 0, 0); f.legR.rotation.set(0, 0, 0);
  if (f.armL) { f.armL.rotation.set(0, 0, -0.06); f.armR.rotation.set(0, 0, 0.06); }
  if (!f.shinL) return;
  f.shinL.rotation.set(0, 0, 0); f.shinR.rotation.set(0, 0, 0);
  f.foreL.rotation.set(-0.12, 0, 0); f.foreR.rotation.set(-0.12, 0, 0);
  if (f.head) f.head.rotation.set(0, 0, 0);
}

// Seated (a driver, a spectator): thighs forward, shins down, forearms forward to the knees or a wheel.
export function figureSit(f) {
  figureStand(f);
  f.legL.rotation.x = f.legR.rotation.x = -1.45;
  if (f.shinL) f.shinL.rotation.x = f.shinR.rotation.x = 1.4;
  if (f.armL) { f.armL.rotation.x = f.armR.rotation.x = -0.6; }
  if (f.foreL) f.foreL.rotation.x = f.foreR.rotation.x = -0.6;
}
