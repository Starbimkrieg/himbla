import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { inkMat } from './toon.js';
import { FIG_PAL as PAL, FIG_ARCH as ARCH, figRng, bakeFigure, figMat, figMats, figGeo } from './models.js';

// ---- Townsfolk drafts: two proposals to replace makeFigure (models.js) ----
// Same idea as makeFigure (one baked skinned mesh plus one ink hull per figure, colours as vertex colours, cached by look) and the
// same palette and outfits, with:
//   - proportions fixed: legs longer than the torso (the old torso, 0.97 m, outran the 0.84 m legs), a smaller head and helmet
//   - knees and elbows: ten bones (root, legL, legR, armL, armR, shinL, shinR, foreL, foreR, head), so a walk bends and a pose
//     on twos reads as drawn (figureWalk below; hold it with twos.js heldPhase or PoseHold, as the courier's is)
//   - more variety: body builds (slim, average, broad, stout, tall, petite), shoulder and hip widths, leg length, helmet paints
//   - helmets that read as helmets from behind (a stripe over the crown, a rear vent plate, ear pods: the old cream dome read as
//     a bald head), kept on by every human; the Vrill and two more alien kinds go bare-headed
// Draft A "Rounded": the toy look kept, tidied: a big friendly helmet, chunky mitten hands and shoes, 12-sided limbs.
// Draft B "Lean": the courier's family: taller and slimmer, a smaller helmet with a wraparound visor, shaped calves and
// forearms, glove cuffs, soled shoes, suit seams, and an air pack with a hose to the helmet on every sealed suit.
// Nothing in the game uses these yet: the Asset Row-free comparison is `tools/figure-drafts.mjs`.

export const FIG_DRAFTS = {
  a: { name: 'A · ROUNDED', hip: 0.78, thigh: 0.36, torso: 0.6, headR: 0.275, chest: 0.24, waist: 0.215, hipW: 0.215, flat: 0.8, leg: 0.105, arm: 0.08, upper: 0.26, fore: 0.24, seg: 12, limbSeg: 10, lean: false },
  b: { name: 'B · LEAN', hip: 0.97, thigh: 0.46, torso: 0.64, headR: 0.205, chest: 0.245, waist: 0.155, hipW: 0.185, flat: 0.66, leg: 0.082, arm: 0.06, upper: 0.31, fore: 0.28, seg: 14, limbSeg: 10, lean: true },
};
const BUILDS = {
  slim: { w: 0.86, h: 1.03, belly: 0 }, average: { w: 1, h: 1, belly: 0 }, broad: { w: 1.13, h: 1.02, belly: 0.01 },
  stout: { w: 1.08, h: 0.94, belly: 0.07 }, tall: { w: 0.95, h: 1.09, belly: 0 }, petite: { w: 0.9, h: 0.92, belly: 0 },
};
const BUILD_LIST = ['slim', 'average', 'average', 'average', 'broad', 'stout', 'tall', 'petite'];
const HELMETS = [0xf3eee4, 0xf3eee4, 0xdfe6f0, 0xc9c3d9, 0x9aa3b8, 0x55607a, 0xffd23f]; // paints: never skin-toned cream
const ALIENS = ['vrill', 'vrill', 'crest', 'orb'];
const DARK = 0x221d33, METAL = 0x5b5870;
const PARENT = [-1, 0, 0, 0, 0, 1, 2, 3, 4, 0]; // bones: 0 root, 1 legL, 2 legR, 3 armL, 4 armR, 5 shinL, 6 shinR, 7 foreL, 8 foreR, 9 head

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

// a lathe profile with crisp colour cuts: each y in `cuts` gets two rows 2 mm apart, so a band colour changes there sharply
function cutProfile(pts, cuts = []) {
  const out = [];
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
  for (const p of all) out.push(p.map((v) => Math.round(v * 10000) / 10000));
  return { pts: out, rAt };
}

// The draft's look before baking (like figureSpec): palette and outfit as makeFigure picks them, the build, and build() for its parts.
export function figureDraftSpec(draft = 'a', { suit, helmet, visor, scale = 1, seed, kind, look, alien: forceAlien = false, species: forceSpecies } = {}) {
  const D = FIG_DRAFTS[draft];
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
  const mono = suit !== undefined && suit === helmet;

  // palette (as makeFigure)
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
  const acc = {
    bag: (arch === 'trader' || arch === 'casual') && chance(0.4),
    scarf: (arch === 'casual' || arch === 'elder' || arch === 'trader') && chance(0.3),
    hand: arch === 'lab' ? pick(['clipboard', 'tablet', 'clipboard']) : arch === 'trader' ? pick(['tablet', 'briefcase', 'none']) : arch === 'elder' ? (chance(0.5) ? 'cane' : 'none') : arch === 'kid' ? pick(['toy', 'none']) : arch === 'casual' ? pick(['tablet', 'none', 'none']) : 'none',
    pack: arch === 'kid' && chance(0.6),
    air: D.lean && sealed && arch !== 'trooper' && arch !== 'eva',
  };
  const tieC = pick([0xd7263d, 0x2b59c3, 0xffd23f, 0x221d33]), scarfC = pick([0xd7263d, 0xffd23f, 0x2ec4ff, 0x7dff6a, 0xff7ad9]);
  const bagC = pick([0x6b4a2a, 0x3a3550, 0xffd23f, 0x2b59c3]), propC = pick([0x4a2c17, 0x221d33, 0x8a5a2b]), toyC = pick([0xff4f2e, 0x2ec4ff, 0x7dff6a, 0xffd23f]);
  const key = [draft, arch, headgear, species, mono, C, skin, hair, hairStyle, hatC, stripeC, visorC, inner, pants, shoeC, bk, w.toFixed(2), shR.toFixed(2), hpR.toFixed(2), hl.toFixed(2), tl.toFixed(2), hs, JSON.stringify(acc), tieC, scarfC, bagC, propC, toyC].join('|');

  // torso: one lathe from below the crotch to the neck (torso frame: y 0 = hip pivots), flattened front to back
  const hp = D.hipW * w * hpR, wa = D.waist * w * (0.5 + 0.5 * hpR) + belly * 0.6, ch = D.chest * w * shR;
  const beltY = 0.27 * T;
  const tProf = [[0, -0.08], [hp * 0.72, -0.075], [hp * 0.96, -0.03], [hp, 0.05], [(hp + wa) / 2 + belly * 0.7, 0.16 * T], [wa + belly, 0.34 * T], [(wa + ch) / 2 + belly * 0.3, 0.5 * T],
    [ch * 0.99, 0.66 * T], [ch * 1.02, 0.76 * T], [ch * 0.96, 0.86 * T], [ch * 0.72, 0.93 * T], [0.11 * w, 0.985 * T], [0, T]];
  const torso = cutProfile(tProf, arch === 'lab' || arch === 'eva' ? [] : [beltY]);
  const flat = D.flat * (arch === 'eva' ? 1.1 : 1);
  const front = (y) => torso.rAt(y) * flat; // the torso's front surface (z) at height y

  // pivots (bind pose, root at the feet)
  const torsoM = figMat([0, H, 0], [stoop, 0, 0]);
  const inTorso = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(torsoM);
  const shX = ch + D.arm * limb * 0.55;
  const legX = hp * 0.52;
  const shoulder = (s) => inTorso(s * shX, 0.84 * T, 0);
  const neck = inTorso(0, T - 0.01, 0.01);
  const P = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-legX, H, 0), new THREE.Vector3(legX, H, 0),
    shoulder(-1), shoulder(1),
    new THREE.Vector3(-legX, H - thigh, 0), new THREE.Vector3(legX, H - thigh, 0),
    null, null,
    neck,
  ];
  const upper = D.upper * limb ** 0.3 * (kid ? 0.82 : 1) * (0.94 + hl * 0.06), fore = D.fore * (kid ? 0.82 : 1) * (0.94 + hl * 0.06);
  P[7] = P[3].clone().add(new THREE.Vector3(0, -upper, 0));
  P[8] = P[4].clone().add(new THREE.Vector3(0, -upper, 0));

  const build = () => {
    const parts = [];
    const vis = (c) => (mono ? (c === visorC ? c : C) : c);
    const col = (c) => (typeof c === 'number' ? vis(c) : mono ? () => C : c);
    const add = (g, bone, c, m, ink = 0) => {
      const base = bone === 'torso' ? torsoM : figMat(P[bone].toArray(), bone === 9 ? [stoop * 0.4, 0, 0] : [0, 0, 0]);
      parts.push({ g, bone: bone === 'torso' ? 0 : bone, grp: bone, c: col(c), m: base.clone().multiply(m), ink });
    };
    const M = figMat;
    const seg = D.seg, ls = D.limbSeg, lean = D.lean;

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
      for (const s of [-1, 1]) add(geo(`cap|${lean}`, () => new THREE.CapsuleGeometry(0.065, 0.34, 2, 8)), 'torso', METAL, M([s * 0.12, 0.64 * T, -front(0.6 * T) - 0.23]), 0.015);
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
    if (acc.pack) add(rbx(0.34, 0.38, 0.17, 0.06, 2), 'torso', pick(PAL.hat), M([0, 0.55 * T, -front(0.55 * T) - 0.07]), 0.025);
    if (acc.air) {
      // a compact air pack between the shoulder blades, and its hose round to the helmet's back
      add(rbx(0.26 * w, 0.3, 0.12, 0.04, 2), 'torso', METAL, M([0, 0.66 * T, -front(0.66 * T) - 0.045]), 0.02);
      add(rbx(0.2 * w, 0.06, 0.125, 0.02), 'torso', stripeC, M([0, 0.66 * T + 0.1, -front(0.66 * T) - 0.045]));
      const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0.06, 0.66 * T + 0.15, -front(0.66 * T) - 0.06), new THREE.Vector3(0.09, T + 0.02, -0.17), new THREE.Vector3(0.05, T + 0.1, -0.15)]);
      add(geo(`hose|${key}`, () => new THREE.TubeGeometry(hose, 8, 0.022, 6)), 'torso', DARK, M(), 0.01);
    }
    if (!sealed && headgear !== 'bowl' && headgear !== 'bubble') add(cyl(0.075, 0.09, 0.14, 8), 'torso', skin, M([0, T + 0.02, 0.0]));

    // ---------- head (bone 9, origin at the neck) ----------
    if (alien) alienHead(add, M, species, skin, R, lean);
    else if (sealed) helmetHead(add, M, { R, hatC, stripeC, visorC, trooper: arch === 'trooper', lean, seg });
    else {
      // a face in a fishbowl (or a kid's bubble): head, eyes, brows, nose, ears, hair; the glass is its own mesh (makeFigureDraft)
      const r = 0.12 * hs;
      const hc = [0, r * 1.25, 0.015];
      add(sph(r, seg, 10), 9, skin, M(hc, [0, 0, 0], [0.92, 1.06, 0.98]), 0.025);
      for (const s of [-1, 1]) {
        add(sph(0.016 * hs, 6, 4), 9, 0x120a1e, M([hc[0] + s * 0.042 * hs, hc[1] + 0.015 * hs, hc[2] + r * 0.9], [0, 0, 0], [1, 1.3, 0.6]));
        if (lean) add(box(0.04 * hs, 0.009, 0.01), 9, hair, M([hc[0] + s * 0.044 * hs, hc[1] + 0.045 * hs, hc[2] + r * 0.88], [0, 0, -s * 0.12]));
        add(sph(0.026 * hs, 6, 4), 9, skin, M([s * r * 0.93, hc[1], hc[2]], [0, 0, 0], [0.5, 1, 0.8]), 0.008);
      }
      add(sph(0.02 * hs, 6, 4), 9, skin, M([0, hc[1] - 0.012 * hs, hc[2] + r * 0.98], [0, 0, 0], [0.9, 1.1, 1]), 0.006);
      if (lean) add(box(0.03 * hs, 0.006, 0.008), 9, 0x7a3a3a, M([0, hc[1] - 0.05 * hs, hc[2] + r * 0.9]));
      hairOn(add, M, hairStyle, hair, r, hc, seg);
      add(tor(0.17 * hs, 0.035, 5, seg + 2), 9, headgear === 'bowl' ? (helmet !== undefined ? hatC : METAL) : hatC, M([0, 0.01, 0]), 0.015);
    }

    // ---------- legs: thigh (legL/R), knee and shin (shinL/R), shoe or boot ----------
    const L = D.leg * limb * (0.94 + B.w * 0.06);
    const bootTop = booted ? -shin * 0.58 : -shin + 0.02;
    const thighP = cutProfile([[0, 0.07], [L * 1.08, 0.055], [L * 1.18, 0], [L * 1.1, -thigh * 0.4], [L * 0.86, -thigh * 0.92], [0, -thigh - 0.01]], [-thigh * 0.55]).pts; // (the cut: a kid's shorts)
    const shinP = cutProfile(lean
      ? [[0, 0.03], [L * 0.84, 0.02], [L * 0.86, -shin * 0.18], [L * 0.9, -shin * 0.32], [L * 0.7, -shin * 0.75], [L * 0.62, -shin * 0.93], [0, -shin - 0.005]]
      : [[0, 0.03], [L * 0.86, 0.02], [L * 0.84, -shin * 0.3], [L * 0.7, -shin * 0.85], [L * 0.66, -shin * 0.95], [0, -shin - 0.005]], [bootTop]).pts;
    for (const s of [-1, 1]) {
      const legB = s < 0 ? 1 : 2, shinB = s < 0 ? 5 : 6;
      add(lathe(`thigh|${D.leg}|${L.toFixed(3)}|${thigh.toFixed(3)}`, thighP, ls), legB, arch === 'kid' ? (y) => (y > -thigh * 0.55 ? pants : skin) : pants, M(), 0.028);
      const shinC = arch === 'kid' ? (y) => (y > -shin * 0.75 ? skin : 0xfff4e0) : booted ? (y) => (y > bootTop ? pants : bootC) : pants;
      add(lathe(`shin|${lean}|${L.toFixed(3)}|${shin.toFixed(3)}|${bootTop.toFixed(3)}`, shinP, ls), shinB, shinC, M(), 0.026);
      add(sph(L * 0.88, ls, 6), shinB, arch === 'kid' ? skin : pants, M([0, 0, 0]));
      if (arch === 'engineer') add(tor(L * 0.78, 0.016, 3, ls), shinB, 0xfff4e0, M([0, -shin * 0.42, 0]));
      if (arch === 'coveralls' || arch === 'trooper') add(rbx(L * 1.4, 0.12, 0.06, 0.025), shinB, arch === 'trooper' ? 0x3a3f50 : DARK, M([0, -0.03, L * 0.75]), 0.012); // knee pad
      const y0 = -shin;
      if (booted) {
        add(rbx(0.2 * limb, 0.17, 0.33, 0.06), shinB, bootC, M([0, y0 + 0.0, 0.045]), 0.025);
        if (lean) add(box(0.205 * limb, 0.03, 0.335), shinB, DARK, M([0, y0 - 0.07, 0.045]));
      } else if (lean) {
        // a soled shoe: a rounded upper over a dark sole, toe cap forward
        const sc = arch === 'kid' ? 0xfff4e0 : shoeC;
        add(sph(0.085, 10, 8), shinB, sc, M([0, y0 - 0.02, 0.09], [0, 0, 0], [0.95, 0.62, 1.15]), 0.02);
        add(rbx(0.15, 0.1, 0.17, 0.04), shinB, sc, M([0, y0 - 0.005, -0.005]), 0.02);
        add(rbx(0.17, 0.028, 0.3, 0.012), shinB, DARK, M([0, y0 - 0.07, 0.055]), 0.01);
      } else add(rbx(0.2, 0.14, 0.32, 0.06), shinB, arch === 'kid' ? 0xfff4e0 : shoeC, M([0, y0 - 0.015, 0.05]), 0.025);
    }

    // ---------- arms: upper (armL/R), elbow and forearm (foreL/R), hand ----------
    const A = D.arm * limb * (0.95 + B.w * 0.05);
    const sleeve = arch === 'kid' ? -0.4 * upper : arch === 'engineer' && !sealed ? -fore * 0.5 : null; // short sleeves; rolled sleeves
    const upperP = cutProfile([[0, 0.08], [A * 1.12, 0.06], [A * 1.2, 0], [A * 1.05, -upper * 0.5], [A * 0.9, -upper - 0.005], [0, -upper - 0.02]], sleeve !== null && arch === 'kid' ? [sleeve] : []).pts;
    const foreP = cutProfile(lean
      ? [[0, 0.02], [A * 0.86, 0.01], [A * 0.92, -fore * 0.2], [A * 0.72, -fore * 0.85], [A * 0.66, -fore], [0, -fore - 0.005]]
      : [[0, 0.02], [A * 0.88, 0.01], [A * 0.84, -fore * 0.4], [A * 0.72, -fore], [0, -fore - 0.005]], sleeve !== null && arch !== 'kid' ? [sleeve] : []).pts;
    for (const s of [-1, 1]) {
      const armB = s < 0 ? 3 : 4, foreB = s < 0 ? 7 : 8;
      const upC = arch === 'kid' ? (y) => (y > sleeve ? C : skin) : C;
      add(lathe(`upper|${A.toFixed(3)}|${upper.toFixed(3)}|${sleeve}`, upperP, ls), armB, upC, M(), 0.024);
      add(sph(A * 1.22, ls, 6), armB, arch === 'trooper' ? 0x3a3f50 : C, M([s * 0.008, 0.005, 0], [0, 0, 0], arch === 'trooper' ? [1.35, 1.1, 1.3] : 1), 0.018);
      const foreC = arch === 'kid' ? skin : sleeve !== null ? (y) => (y > sleeve ? C : skin) : C;
      add(lathe(`fore|${lean}|${A.toFixed(3)}|${fore.toFixed(3)}|${sleeve}`, foreP, ls), foreB, foreC, M(), 0.022);
      add(sph(A * 0.9, ls, 6), foreB, arch === 'kid' ? skin : C, M());
      if (lean && gloved) add(tor(A * 0.82, 0.018, 3, ls), foreB, glovesC, M([0, -fore + 0.025, 0]), 0.008);
      // mitten hand: palm and a thumb turned in and forward
      const hy = -fore - (lean ? 0.055 : 0.06) * limb;
      add(sph(0.058 * limb, 8, 6), foreB, handC, M([0, hy, 0.005], [0, 0, 0], lean ? [0.6, 1.2, 0.92] : [1.0, 1.2, 0.95]), 0.016);
      add(sph(0.024 * limb, 6, 4), foreB, handC, M([-s * 0.03 * limb, hy + 0.02, 0.035 * limb], [0, 0, 0], [1, 1.4, 1]), 0.008);
      if (foreB !== 8) continue;
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
  return { key, build, P, R, headgear, arch, alien, species, kid, scale, sealed, C, skin, pants, hatC, visorC, bk };
}

// A sealed helmet that reads as one from every side: shell, wide visor in a frame and a glint; a stripe over the crown in the
// suit's colour; a vent plate at the back; ear pods (a lamp on the right one); a neck ring. Head frame: origin at the neck.
function helmetHead(add, M, { R, hatC, stripeC, visorC, trooper, lean, seg }) {
  const c = [0, R * 0.86, 0.01];
  const sh = lean ? [0.96, 1.04, 1.06] : [1, 1.0, 1.04];
  add(sph(R, seg + 2, 10), 9, hatC, M(c, [0, 0, 0], sh), 0.03);
  // visor: B wraps further round and sits lower (the courier's), A is a rounder window
  const [ps, pl, ts, tl] = lean ? [Math.PI / 2 - 1.15, 2.3, 0.98, 0.95] : [Math.PI / 2 - 0.9, 1.8, 0.92, 1.1];
  add(sph(R * 1.012, seg + 2, 8, ps - 0.1, pl + 0.2, ts - 0.08, tl + 0.16), 9, 0x221d33, M(c, [0, 0, 0], sh));
  add(sph(R * 1.024, seg + 2, 8, ps, pl, ts, tl), 9, visorC, M(c, [0, 0, 0], sh));
  add(sph(0.04, 6, 4), 9, 0xffffff, M([c[0] - R * 0.33, c[1] + R * 0.3, c[2] + R * 0.95], [-0.35, -0.35, 0.5], [1.3, 0.5, 0.3]));
  // crown stripe: a band over the top from the visor's frame to the vent plate
  add(geo(`stripeF|${R}|${seg}`, () => new THREE.SphereGeometry(R * 1.008, 3, 8, Math.PI / 2 - 0.16, 0.32, 0, 0.84)), 9, trooper ? 0xffd23f : stripeC, M(c, [0, 0, 0], sh));
  add(geo(`stripeB|${R}|${seg}`, () => new THREE.SphereGeometry(R * 1.008, 3, 10, -Math.PI / 2 - 0.16, 0.32, 0, 1.55)), 9, trooper ? 0xffd23f : stripeC, M(c, [0, 0, 0], sh));
  // rear vent plate with slots
  add(rbx(R * 0.62, R * 0.42, 0.06, 0.02), 9, trooper ? 0x2a2540 : 0x3a3550, M([c[0], c[1] - R * 0.18, c[2] - R * 0.98 * sh[2]], [-0.25, 0, 0]), 0.012);
  for (let k = 0; k < 3; k++) add(box(R * 0.46, 0.012, 0.012), 9, 0x9aa3b8, M([c[0], c[1] - R * 0.08 - k * R * 0.1, c[2] - R * 1.02 * sh[2] - 0.004 + k * 0.01], [-0.25, 0, 0]));
  // ear pods, a lamp on the right
  for (const s of [-1, 1]) add(cyl(R * 0.26, R * 0.3, 0.07, seg), 9, 0x3a3550, M([s * R * 0.98 * sh[0], c[1] - R * 0.05, c[2] - R * 0.08], [0, 0, Math.PI / 2]), 0.012);
  add(cyl(R * 0.12, R * 0.12, 0.04, 8), 9, 0xfff6a8, M([R * 1.04 * sh[0] + 0.03, c[1] - R * 0.05, c[2] - R * 0.08], [0, 0, Math.PI / 2]));
  add(tor(R * 0.66, 0.035, 5, seg + 2), 9, trooper ? 0x221d33 : 0x5b5870, M([0, 0.02, 0]), 0.015);
}

// Bare alien heads (no air needed): the Vrill (tall skull, big dark eyes, antennae), a crested kind (a fin from brow to nape, gill
// slits, small eyes) and an orb-headed kind (one big eye, two ear stalks)
function alienHead(add, M, species, skin, R, lean) {
  add(cyl(0.065, 0.08, 0.14, 8), 9, skin, M([0, 0.04, 0]));
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

// A townsperson from a draft: the same contract as makeFigure (root at the feet; legL/legR at the hips, armL/armR at the shoulders;
// animate by rotation.x), plus shinL/shinR at the knees, foreL/foreR at the elbows and head at the neck.
export function makeFigureDraft(draft = 'a', opts = {}) {
  const S = figureDraftSpec(draft, opts);
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
    figMats();
    const g = figGeo();
    const glass = new THREE.Mesh(g.bowl, bowlGlass());
    glass.position.set(0, 0.17 * (S.kid ? 1.28 : 1) + 0.02, 0.015);
    glass.scale.setScalar((S.kid ? 1.28 : 1) * (S.headgear === 'bubble' ? 0.6 : 0.62) * (FIG_DRAFTS[draft].lean ? 0.92 : 1));
    glass.renderOrder = 2;
    bones[9].add(glass);
  }
  bones[3].rotation.z = -0.06; bones[4].rotation.z = 0.06;
  bones[7].rotation.x = bones[8].rotation.x = -0.12;
  root.scale.setScalar(S.scale);
  const outfit = S.alien ? { skin: S.skin } : { arch: S.arch, headgear: S.headgear === 'sealed' ? 'sealed' : 'bowl', suit: S.C, pants: S.pants, helmet: S.hatC, visor: S.visorC, skin: S.skin };
  return {
    root, body, legL: bones[1], legR: bones[2], armL: bones[3], armR: bones[4], shinL: bones[5], shinR: bones[6], foreL: bones[7], foreR: bones[8], head: bones[9],
    look: S.arch, alien: S.alien, species: S.species, build: S.bk, outfit, swing: S.arch === 'elder' ? 0.15 : S.arch === 'eva' ? 0.3 : 0.45,
    tris: baked.geo.index.count / 3,
  };
}
let BOWL_M = null;
function bowlGlass() {
  if (!BOWL_M) BOWL_M = new THREE.MeshToonMaterial({ color: 0xbfefff, transparent: true, opacity: 0.28, depthWrite: false });
  return BOWL_M;
}

// A walk from a phase (radians): hips swing, the knee folds as the leg comes through, elbows bend on the forward swing, the head
// nods a touch. Draw `ph` through heldPhase (twos.js) and the walk steps on twos as the courier's does.
export function figureWalk(f, ph, amt = 1) {
  const s = Math.sin(ph), c = Math.cos(ph), sw = f.swing / 0.45;
  f.legL.rotation.x = s * 0.5 * amt;
  f.legR.rotation.x = -s * 0.5 * amt;
  f.shinL.rotation.x = (0.06 + 0.85 * Math.max(0, -c)) * amt;
  f.shinR.rotation.x = (0.06 + 0.85 * Math.max(0, c)) * amt;
  f.armL.rotation.x = -s * f.swing * amt;
  f.armR.rotation.x = s * f.swing * amt;
  f.foreL.rotation.x = -0.15 - 0.4 * Math.max(0, s) * sw * amt;
  f.foreR.rotation.x = -0.15 - 0.4 * Math.max(0, -s) * sw * amt;
  f.head.rotation.x = Math.abs(c) * 0.04 * amt;
}
