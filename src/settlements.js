import { FRONT_OUT, HALL } from './casinoPlan.js'; // casino: where the hall's door wall ends and the forecourt starts
import * as THREE from 'three';
import { Kit, T, G, D, GLASS, BEAM, prism, sandbags, container, crate, tank, lightString, junkHeap, PALETTE } from './outpostModels.js';
import { FACTIONS } from './locations.js';
import { pixelFont } from './fonts.js';
import { glow, gradientMap } from './toon.js';
import { patchBermMaterial } from './moonSkins.js';
import { market, tickerText } from './market.js';
import { casinoNode, casinoSlot, lotNode, lotSlot } from './models.js';
import { waterMesh } from './fountainFx.js';
import { craneModel, craneSlot, CRANE_H, CRANE_LOAD_DROP, CRANE_TROLLEY_MIN, CRANE_TROLLEY_SPAN, gantryModel, cargoSlot, CARGO_BOX, garageModel, garageSlot, dishModel, dishSlot, DISH_KINDS } from './models.js';

// Settlements, HQs and landmarks built with the outpost Kit (outpostModels.js): static parts bake into one merged mesh per
// material plus one ink hull, so a detailed place costs a handful of draw calls. Moving parts (cranes, wheels, tickers, rides)
// are separate objects tagged userData.tick / spin / blink / flag, animated by World.update while the place is active.
// Colliders are in the settlement's local frame.
const { STEEL, DARK, LIGHT, CONC, YEL, RUST, TYRE } = PALETTE;
const WHITE = 0xfff4e0, PANEL = 0x5b5870, ROOF = 0x3a3550, WARM = 0xfff6a8;
const TAU = Math.PI * 2;
const hex = (c) => new THREE.Color(c).getHex();
// a Blender model's slot colour ({ color, glow }) as a Kit material
const slotMat = (c) => (c.glow ? G(c.color) : T(c.color));
const ONE = new THREE.Vector3(1, 1, 1);
// a model node's matrix under its parent's m
const nodeMatrix = (n, m) => new THREE.Matrix4().compose(n.pos, n.quat, ONE).premultiply(m);

// Build one settlement: fn(k, { fc, rr }) draws into a Kit in its local frame (fc: the faction colour, rr: the world's random
// stream); the result is placed, colliders registered and moving parts handed to the world's animator.
export function settle(world, loc, seed, fn) {
  const fc = hex((FACTIONS[loc.faction] || FACTIONS.spacecom).color || 0xffd23f);
  const k = new Kit(fc, seed, false);
  k.onGround = true; // settlement dressing (toon.dropFloorFaces)
  k.curveR = world.curveR ? world.curveR(loc) : 0; // curved places are drawn flat and bent onto their sphere (curve.js)
  fn(k, { fc, rr: world.rand });
  k.at();
  const t = k.finish();
  if (globalThis.__kitTags) loc._kitCols = t.cols; // for the dev collider audit
  world.put(t.root, loc, 0, 0, 0, 0, true);
  t.root.userData.kitRoot = true; // static; only tagged parts move
  for (const c of t.cols) world.col(loc, c);
  const list = [];
  t.root.traverse((o) => { const u = o.userData; if (u.tick || u.spin || u.blink || u.flag) list.push(o); });
  if (list.length) world.anims.push({ loc, list, seed });
  return t;
}

// a moving piece from its own small Kit (merged meshes + ink), as a Group
export function part(color, fn) {
  const k = new Kit(color, 1, false);
  fn(k);
  return k.finish().root;
}

// a model's blinker node as a red blinking lamp (radius r unless the node sets one), scaled by sc
function blinkLamp(b, r, sc = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry((b.data.radius || r) * sc, 8, 6), G(0xff2a4a));
  m.userData.blink = true;
  m.position.copy(b.pos).multiplyScalar(sc);
  return m;
}

// ---------------------------------------------------------------------------------------------
// shared structures (each sets its own frame with k.at and leaves k at the origin)
// ---------------------------------------------------------------------------------------------

// Hab dome: a pressurised shell on a ring footing, banked with a regolith berm (radiation cover) cut by retaining walls at the
// airlock and at `gaps` (local yaws where something docks). Meridian ribs and latitude rings up to a crown compression ring
// (node plates on big domes), some swapped panels, hooded windows, floodlights, a ladder up one flank and conduits up the
// other. Above r 9: a cupola with antenna, small dish and vents. The airlock (ribbed tunnel, lock housing, grated step) faces
// local yaw `door`. `yard` adds a radiator rack, power cabinet and gas bottles. Glass domes show a planted floor.
// Berm regolith: darker than the ground so it reads; on the regolith skin it takes the ground's grain and stones
// (moonSkins.js patchBermMaterial). One shared material, so a place's berms merge into one mesh.
const REGO = 0x6f6878;
let bermMat = null;
const BERM = () => (bermMat ||= patchBermMaterial(new THREE.MeshToonMaterial({ color: REGO, gradientMap: gradientMap() })));
const angDiff = (p, q) => Math.atan2(Math.sin(p - q), Math.cos(p - q));
// smooth lumpiness along an arc (s: metres round, t: 0 foot to 1 crest), about -1..1
function domeWobble(seed) {
  const p = [1, 2, 3, 4].map((i) => { const s = Math.sin(seed * 9.17 + i * 78.233) * 43758.5453; return (s - Math.floor(s)) * TAU; });
  return (s, t) => 0.5 * Math.sin(s * 0.8 + p[0] + t * 1.7) + 0.3 * Math.sin(s * 1.9 + p[1] - t * 2.9) + 0.35 * Math.sin(s * 4.1 + p[2] + t * 5.3) * Math.sin(s * 0.37 + p[3]);
}
// Berm segment from radius r0 at height h (against the shell) to r1 on the ground, azimuths a0..a1 (0 = +z): lumpy,
// straightening at each end where a retaining wall holds it.
function bermGeo(r0, r1, h, a0, a1, seg, wob) {
  const n = Math.max(3, Math.round(((a1 - a0) / TAU) * seg * 2)), rows = 4, w = r1 - r0;
  const g = new THREE.CylinderGeometry(r0, r1, h, n, rows, true, a0, a1 - a0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (i % (n + 1)) / n, t = 1 - Math.floor(i / (n + 1)) / rows; // rows run crest to foot
    if (t === 1) continue; // crest stays tight to the shell
    const s = (a0 + u * (a1 - a0)) * (r0 + r1) / 2;
    const end = Math.min(1, (Math.min(u, 1 - u) * (a1 - a0) * r1) / 2.5);
    const lump = wob(s, t) * end, rise = Math.sin(Math.PI * t);
    const dr = (rise * 0.2 * end + lump * 0.16) * w, x = p.getX(i), z = p.getZ(i), q = (Math.hypot(x, z) + dr) / Math.hypot(x, z);
    p.setXYZ(i, x * q, p.getY(i) + rise * lump * h * 0.18, z * q);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}
// wall along local z on y = 0: hIn tall at -z sloping to hOut at +z
function wedge(th, hIn, hOut, len) {
  const g = new THREE.BoxGeometry(th, 1, len).translate(0, 0.5, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.5) p.setY(i, p.getZ(i) < 0 ? hIn : hOut);
  g.computeVertexNormals();
  return g;
}

export function habDome(k, x, z, r, color, { door = 0, trim = 0xffd23f, windows = true, cupola = true, glass = false, yard = r >= 9, gaps = [] } = {}) {
  k.at(x, z, door);
  const seg = Math.max(24, Math.min(56, Math.round(r * 2))), hs = Math.max(8, Math.round(seg / 3)); // (hs: the shell's rows)
  const wob = domeWobble(x * 0.37 + z * 0.91 + r * 1.7);
  const hash = (i) => { const s = Math.sin(i * 12.9898 + x * 0.731 + z * 0.417 + r) * 43758.5453; return s - Math.floor(s); };
  // Shell centre at height C on the footing. on(): point d out from the shell at azimuth a (from +z), elevation el;
  // face(): rotation pointing a part's +z out there, x along the shell; pt(): on() shifted sideways
  const C = 1.0;
  const on = (a, el, d = 0) => { const R = r + d; return [Math.sin(a) * Math.cos(el) * R, C + Math.sin(el) * R, Math.cos(a) * Math.cos(el) * R]; };
  const face = (a, el) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-el, a, 0, 'YXZ'));
  const pt = (a, el, d, off) => { const p = on(a, el, d); return [p[0] + Math.cos(a) * off, p[1], p[2] - Math.sin(a) * off]; };
  const ar = Math.min(2.6, 1.4 + r * 0.06), L = Math.min(5, 2 + r * 0.12), ay = ar + 0.2; // airlock tunnel
  const hw = ar * 1.35, hh = ar * 2.3, hz = r + L - 0.4, hd = 1.8; // lock housing

  // footing: concrete ring wall
  k.cyl(r + 0.2, r + 0.45, C + 0.05, seg, T(CONC), 0, 0, 0, { outline: 0.08 });
  // berm segments between the cuts, a retaining wall at each end
  const bh = Math.min(2.6, 0.9 + r * 0.05), bw = bh * 1.2 + 0.5;
  const rIn = bh > C ? Math.sqrt(r * r - (bh - C) ** 2) - 0.05 : r + 0.15;
  const cuts = [[0, ar + 1.1], ...gaps.map((a) => [a, 4.2])]
    .map(([a, w]) => [((a % TAU) + TAU) % TAU, Math.asin(Math.min(0.9, w / r))]).sort((p, q) => p[0] - q[0]);
  cuts.forEach(([a, h], i) => {
    const [b, hb] = cuts[(i + 1) % cuts.length];
    const a0 = a + h, a1 = b + (i + 1 < cuts.length ? 0 : TAU) - hb;
    if (a1 - a0 < 0.05) return;
    k.add(bermGeo(rIn, r + bw, bh, a0, a1, seg, wob), BERM(), 0, 0, 0, { outline: 0.08 });
    const mid = (rIn + r + bw) / 2, len = r + bw - rIn + 0.6;
    for (const e of [a0, a1]) k.add(wedge(0.5, bh + 0.25, 0.3, len), T(CONC), Math.sin(e) * mid, 0, Math.cos(e) * mid, { ry: e, outline: 0.05 });
  });

  // the shell
  const shell = glass ? GLASS(color, 0.28) : T(color);
  k.add(new THREE.SphereGeometry(r, seg, hs, 0, TAU, 0, Math.PI / 2), shell, 0, C, 0, { outline: glass ? 0 : Math.min(0.3, 0.1 + r * 0.008) });
  // frame: M meridian ribs (none over the airlock) to the crown ring, latitude rings, a painted band above the berm
  const M = glass ? (r < 12 ? 12 : 16) : r < 8 ? 8 : r < 18 ? 12 : r < 40 ? 16 : 24;
  const ribT = Math.max(0.12, r * 0.012);
  const crown = Math.acos(0.24);
  const rings = glass ? [0.26, 0.52, 0.8, 1.06] : r < 8 ? [0.62] : r < 20 ? [0.42, 0.86] : [0.34, 0.66, 0.98];
  const ribA = (i) => ((i + 0.5) / M) * TAU;
  for (let i = 0; i < M; i++) k.add(new THREE.TorusGeometry(r + ribT * 0.4, ribT, 4, Math.max(6, Math.round(seg * 0.25)), crown), T(WHITE), 0, C, 0, { ry: ribA(i) - Math.PI / 2, outline: 0 });
  // rings no finer than the shell's facets (Kit.ring uses five segments a metre)
  const ring = (rad, tube, mat, y, outline = 0) => k.add(new THREE.TorusGeometry(rad, tube, 4, Math.min(seg, Math.max(12, Math.round(rad * 5)))).rotateX(Math.PI / 2), mat, 0, y, 0, { outline });
  for (const el of rings) ring(r * Math.cos(el) + ribT * 0.3, ribT * 0.9, T(WHITE), C + r * Math.sin(el));
  ring(r * Math.cos(crown) + ribT * 0.3, ribT * 1.6, T(WHITE), C + r * Math.sin(crown), 0.04);
  const elT = Math.asin(Math.min(0.5, Math.max(0, bh + 0.3 - C) / r));
  ring(r * Math.cos(elT) + 0.08, Math.max(0.16, r * 0.008), T(trim), C + r * Math.sin(elT));
  if (!glass && r >= 14) for (let i = 0; i < M; i++) for (const el of rings) {
    const [px, py, pz] = on(ribA(i), el, ribT * 0.9);
    k.add(new THREE.BoxGeometry(ribT * 3.2, ribT * 3.2, ribT * 0.8), T(LIGHT), px, py, pz, { q: face(ribA(i), el), outline: 0 });
  }
  // swapped panels above the windows, paler or darker (sphere patches finer than the shell's facets, so they never dip under)
  if (!glass) {
    const edges = [...rings, crown], cA = new THREE.Color(color);
    const tints = [hex(cA.clone().lerp(new THREE.Color(WHITE), 0.3)), hex(cA.clone().lerp(new THREE.Color(DARK), 0.2))];
    for (let j = 0; j + 1 < edges.length; j++) for (let i = 0; i < M; i++) {
      const h = hash(i * 7 + j * 31);
      if (h > 0.3) continue;
      const e0 = edges[j] + (ribT * 1.6) / r, e1 = edges[j + 1] - (ribT * 1.6) / r;
      const w = TAU / M - (ribT * 3.2) / (r * Math.cos(e1));
      if (e1 - e0 < 0.04 || w < 0.04) continue;
      const nW = Math.max(2, Math.ceil((w * seg) / TAU) * 2), nH = Math.max(2, Math.ceil(((e1 - e0) / (Math.PI / 2)) * hs) * 2);
      k.add(new THREE.SphereGeometry(r + 0.05, nW, nH, (i / M) * TAU + Math.PI / 2 - w / 2, w, Math.PI / 2 - e1, e1 - e0), T(tints[h < 0.15 ? 0 : 1]), 0, C, 0, { outline: 0 });
    }
  }
  // ladder beside rib iL, conduits beside rib iC
  const iL = Math.round(M / 4), iC = Math.round((3 * M) / 4), aL = ribA(iL), aC = ribA(iC);
  const el0 = Math.asin(Math.min(0.6, Math.max(0, bh + 0.15 - C) / r)); // just above the berm
  if (windows && !glass) {
    // hooded curved panes in the rib bays, clear of ribs, airlock and ladder
    const el = 0.2, pr = r + 0.06, fr = r + 0.03, rc = r * Math.cos(el);
    const dTheta = Math.min(0.32, 1.0 / r), dTh2 = dTheta * 1.35;
    const bay = TAU / M, per = Math.max(1, Math.round((bay * rc) / 3.6));
    const gap = (ribT * 2.5 + 0.5) / rc;
    const wA = Math.min(((bay - 2 * gap) / per) * 0.62, 1.5 / rc);
    const ladder = aL + (0.6 + ribT) / rc;
    for (let b = 0; b < M; b++) for (let j = 0; j < per; j++) {
      const a = (b - 0.5) * bay + gap + ((j + 0.5) / per) * (bay - 2 * gap);
      if (Math.abs(angDiff(a, 0)) < Math.max(0.4, (ar + 1.6) / r)) continue; // airlock side
      if (Math.abs(angDiff(a, ladder)) * rc < 0.7 + (wA * rc) / 2) continue;
      const phi0 = a + Math.PI / 2; // SphereGeometry azimuth for direction (sin a, cos a)
      k.add(new THREE.SphereGeometry(fr, 4, 2, phi0 - wA * 0.62, wA * 1.24, Math.PI / 2 - el - dTh2 / 2, dTh2), T(DARK), 0, C, 0, { outline: 0 });
      k.add(new THREE.SphereGeometry(pr, 4, 2, phi0 - wA / 2, wA, Math.PI / 2 - el - dTheta / 2, dTheta), G(WARM), 0, C, 0, { outline: 0 });
      const [px, py, pz] = on(a, el + dTh2 / 2 + 0.01, 0.2);
      k.add(new THREE.BoxGeometry(wA * 1.3 * rc, 0.08, 0.64), T(PANEL), px, py, pz, { q: face(a, el + dTh2 / 2), outline: 0 });
    }
  }
  // floodlights under the first ring, every other rib
  for (let i = 0; i < M; i += 2) {
    if (i === iL || i === iC) continue;
    const a = ribA(i), e = rings[0] - (ribT + 0.35) / r, q = face(a, e), [lx, ly, lz] = on(a, e, ribT + 0.2);
    k.add(new THREE.BoxGeometry(0.5, 0.24, 0.4), T(DARK), lx, ly, lz, { q, outline: 0.02 });
    k.add(new THREE.BoxGeometry(0.4, 0.05, 0.3).translate(0, -0.13, 0.02), G(0xfffbe0), lx, ly, lz, { q, outline: 0 });
  }
  // maintenance ladder on standoffs outside the rings, berm to crown
  {
    const d = 0.4 + ribT * 1.5, top = crown - 0.02, n = Math.max(4, Math.round(((top - el0) * r) / 1.6));
    const o1 = 0.3 + ribT, o2 = 0.9 + ribT;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const el = el0 + ((top - el0) * i) / n, cur = [pt(aL, el, d, o1), pt(aL, el, d, o2)];
      if (prev) for (let s = 0; s < 2; s++) k.beam(prev[s], cur[s], 0.05, T(LIGHT), { outline: 0, seg: 4 });
      if (i % 3 === 0) for (let s = 0; s < 2; s++) k.beam(pt(aL, el, -0.1, s ? o2 : o1), cur[s], 0.035, T(DARK), { outline: 0, seg: 4 });
      prev = cur;
    }
    const nr = Math.floor(((top - el0) * (r + d)) / 0.6);
    for (let i = 0; i <= nr; i++) {
      const el = el0 + ((top - el0) * i) / nr, p = pt(aL, el, d, (o1 + o2) / 2);
      k.add(new THREE.BoxGeometry(o2 - o1, 0.05, 0.05), T(LIGHT), p[0], p[1], p[2], { q: face(aL, el), outline: 0 });
    }
  }
  // service conduits: two clamped pipes from the berm to a junction box under the first ring
  {
    const d = 0.2 + ribT * 1.3, elJ = rings[0] - (ribT + 0.9) / r, e0 = el0 - 0.05;
    const n = Math.max(3, Math.round(((elJ - e0) * r) / 1.6));
    for (const [off, c, rad] of [[-(0.35 + ribT), LIGHT, 0.09], [-(0.65 + ribT), 0x6b6880, 0.07]]) {
      let prev = pt(aC, e0, d, off);
      for (let i = 1; i <= n; i++) { const cur = pt(aC, e0 + ((elJ - e0) * i) / n, d, off); k.beam(prev, cur, rad, T(c), { outline: 0.015, seg: 6 }); prev = cur; }
    }
    for (let el = el0 + 0.9 / r; el < elJ - 0.5 / r; el += 1.8 / r) {
      const p = pt(aC, el, d, -(0.5 + ribT));
      k.add(new THREE.BoxGeometry(0.62, 0.1, 0.26), T(DARK), p[0], p[1], p[2], { q: face(aC, el), outline: 0 });
    }
    const q = face(aC, elJ), p = pt(aC, elJ, d / 2 + 0.1, -(0.5 + ribT));
    k.add(new THREE.BoxGeometry(1.1, 0.9, d + 0.4), T(PANEL), p[0], p[1] + 0.35, p[2], { q, outline: 0.03 });
    const f = pt(aC, elJ, d + 0.31, -(0.5 + ribT));
    k.add(new THREE.BoxGeometry(0.16, 0.16, 0.04), G(0x7dff6a), f[0], f[1] + 0.5, f[2], { q, outline: 0 });
  }
  if (cupola && r > 9) {
    // cupola: collar, glazed drum, cap, antenna and beacon
    const y0 = C + r * Math.sin(crown), cr = r * 0.16, cy = y0 + 0.6;
    k.cyl(r * 0.2, r * 0.235, 1.1, 18, T(PANEL), 0, y0 - 0.5, 0, { outline: 0.06 });
    k.cyl(cr, cr, 1.3, 16, T(WHITE), 0, cy, 0, { outline: 0.05 });
    k.cyl(cr + 0.04, cr + 0.04, 0.6, 16, G(0xbfe9ff), 0, cy + 0.45, 0, { outline: 0 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.box(0.14, 0.62, 0.14, T(WHITE), Math.sin(a) * (cr + 0.06), cy + 0.44, Math.cos(a) * (cr + 0.06), { outline: 0 }); }
    k.add(new THREE.SphereGeometry(cr, 16, 5, 0, TAU, 0, Math.PI / 2), T(color), 0, cy + 1.3, 0, { outline: 0.05 });
    k.ring(cr + 0.05, 0.12, T(trim), 0, cy + 1.3, 0);
    if (r >= 14) {
      const rr = r * 0.2 - 0.15; // railing round the collar walkway
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.cyl(0.04, 0.04, 0.95, 4, T(DARK), Math.sin(a) * rr, cy, Math.cos(a) * rr, { outline: 0 }); }
      k.ring(rr, 0.05, T(trim), 0, cy + 0.95, 0);
    }
    const capTop = cy + 1.3 + cr;
    k.cyl(0.08, 0.13, r * 0.3, 5, T(DARK), 0, capTop - 0.2, 0, { outline: 0.03 });
    k.blinker(0, capTop + r * 0.3, 0, 0xff2a4a, 0.3);
    // small dish on a stalk at the back, looking up and out
    const aD = Math.PI + 0.5, eD = crown - 0.25, ds = 0.5 + r * 0.025;
    const base = on(aD, eD, 0), tip = on(aD, eD, 0.9 + ds * 0.5);
    const look = new THREE.Vector3(Math.sin(aD) * 0.6, 1, Math.cos(aD) * 0.6).normalize();
    k.beam(base, tip, 0.08, T(DARK));
    k.add(new THREE.ConeGeometry(ds, ds * 0.35, 14, 1, true).rotateX(Math.PI), D(LIGHT), tip[0], tip[1], tip[2], { q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), look), outline: 0.03 });
    k.beam(tip, [tip[0] + look.x * ds * 0.7, tip[1] + look.y * ds * 0.7, tip[2] + look.z * ds * 0.7], 0.04, T(DARK), { outline: 0 });
    // vents on the upper shell
    const vEl = (rings[rings.length - 1] + crown) / 2;
    for (const a of [0.6, 2.5, 5.3]) {
      const [px, py, pz] = on(a, vEl, 0);
      k.cyl(0.16 + r * 0.004, 0.16 + r * 0.004, 1.1, 8, T(LIGHT), px, py - 0.5, pz, { outline: 0.03 });
      k.cyl(0.34 + r * 0.006, 0.26 + r * 0.006, 0.16, 8, T(DARK), px, py + 0.6, pz, { outline: 0.02 });
    }
  }
  if (glass) {
    // inside: floor, rows of planting beds, a ring of grow lamps
    k.cyl(r - 0.2, r - 0.2, 0.12, seg, T(0x6b6880), 0, C - 0.1, 0, { outline: 0 });
    const pr = r * 0.78;
    for (let zz = -pr + 1.2; zz < pr - 0.6; zz += 2.6) {
      const len = 2 * Math.sqrt(pr * pr - zz * zz) - 1;
      if (len < 2) continue;
      k.box(len, 0.6, 1.2, T(0x8a5a3a), 0, C, zz, { outline: 0.03 });
      for (let px = -len / 2 + 0.5; px < len / 2 - 0.3; px += 0.9) k.add(new THREE.SphereGeometry(0.42, 6, 4).scale(1, 0.7, 1), T(hash(px * 3 + zz) < 0.5 ? 0x5fcf5a : 0x8fe36a), px, C + 0.7, zz, { outline: 0 });
    }
    k.ring(r * 0.5, 0.08, G(0xff7ad9), 0, C + r * 0.55, 0);
  }
  // airlock: ribbed tunnel out to +z into the lock housing
  k.add(new THREE.CylinderGeometry(ar, ar, L + 1, 16).rotateX(Math.PI / 2), T(WHITE), 0, ay, r - 0.6 + L / 2, { outline: 0.06 });
  // at the dome: flared collar, docking ring, bolts
  k.add(new THREE.CylinderGeometry(ar + 0.3, ar + 1.0, 1.6, 18).rotateX(Math.PI / 2), T(PANEL), 0, ay, r - 0.55, { outline: 0.05 });
  k.add(new THREE.TorusGeometry(ar + 0.34, 0.24, 6, 18), T(trim), 0, ay, r + 0.27, { outline: 0 });
  for (let i = 0; i < 10; i++) { const t = (i / 10) * TAU; k.add(new THREE.SphereGeometry(0.11, 6, 4), T(LIGHT), Math.cos(t) * (ar + 0.62), ay + Math.sin(t) * (ar + 0.62), r - 0.05, { outline: 0 }); }
  for (let i = 1; i <= 3; i++) k.add(new THREE.TorusGeometry(ar + 0.06, 0.13, 4, 16), T(i === 2 ? trim : PANEL), 0, ay, r - 0.4 + (L * i) / 4, { outline: 0 });
  // housing: square lock chamber with a roof vent
  k.box(hw * 2, hh, hd, T(WHITE), 0, 0, hz, { outline: 0.08 });
  k.box(hw * 2 + 0.2, 0.35, hd + 0.2, T(trim), 0, hh, hz, { outline: 0.03 });
  k.box(hw * 2 + 0.1, 0.3, hd + 0.1, T(PANEL), 0, 0, hz, { outline: 0 });
  k.cyl(0.22, 0.22, 0.7, 8, T(LIGHT), hw * 0.55, hh + 0.3, hz - 0.2, { outline: 0.02 });
  k.cyl(0.36, 0.3, 0.14, 8, T(DARK), hw * 0.55, hh + 1.0, hz - 0.2, { outline: 0.02 });
  // doorway: recessed frame with hazard stripes, split doors with portholes
  const dw = ar * 1.0, dh = ar * 1.65, fz = hz + hd / 2;
  k.box(dw * 2 + 0.5, dh + 0.5, 0.12, T(DARK), 0, 0.35, fz + 0.02, { outline: 0 });
  const nStripe = 7;
  for (let i = 0; i < nStripe; i++) k.box((dw * 2 + 0.5) / nStripe, 0.22, 0.1, T(i % 2 ? DARK : YEL), -dw - 0.25 + (i + 0.5) * ((dw * 2 + 0.5) / nStripe), dh + 0.62, fz + 0.06, { outline: 0 });
  for (const sx of [-1, 1]) {
    k.box(dw - 0.06, dh, 0.14, T(0x3a3550), sx * (dw / 2 + 0.03), 0.35, fz + 0.08, { outline: 0.02 });
    k.add(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12).rotateX(Math.PI / 2), G(0x9be7ff), sx * (dw / 2 + 0.03), 0.35 + dh * 0.68, fz + 0.17, { outline: 0 });
    k.add(new THREE.TorusGeometry(0.3, 0.05, 4, 12), T(LIGHT), sx * (dw / 2 + 0.03), 0.35 + dh * 0.68, fz + 0.18, { outline: 0 });
    for (let j = 0; j < 3; j++) k.box(dw - 0.3, 0.1, 0.05, T(j % 2 ? DARK : YEL), sx * (dw / 2 + 0.03), 0.45 + j * 0.12, fz + 0.16, { outline: 0 });
  }
  k.box(0.05, dh, 0.16, T(DARK), 0, 0.35, fz + 0.1, { outline: 0 }); // door seam
  // status lamp, cycle lights (green: outer door, red: inner), keypad
  k.box(dw * 1.4, 0.22, 0.25, G(WARM), 0, dh + 0.9, fz + 0.05, { outline: 0 });
  k.add(new THREE.SphereGeometry(0.16, 8, 6), G(0x7dff6a), -dw - 0.55, 0.35 + dh * 0.85, fz + 0.1, { outline: 0 });
  k.add(new THREE.SphereGeometry(0.16, 8, 6), G(0xff2a4a), dw + 0.55, 0.35 + dh * 0.85, fz + 0.1, { outline: 0 });
  k.box(0.4, 0.55, 0.12, T(DARK), dw + 0.55, 0.35 + dh * 0.4, fz + 0.06, { outline: 0.02 });
  k.box(0.28, 0.2, 0.05, G(0x2ee6ff), dw + 0.55, 0.35 + dh * 0.4 + 0.25, fz + 0.13, { outline: 0 });
  // floodlights on the housing's top corners, aimed at the step
  for (const sx of [-1, 1]) {
    k.box(0.5, 0.26, 0.45, T(DARK), sx * (hw - 0.4), hh - 0.05, fz + 0.2, { outline: 0.02 });
    k.box(0.4, 0.05, 0.36, G(0xfffbe0), sx * (hw - 0.4), hh - 0.09, fz + 0.2, { outline: 0 });
  }
  // grated step with a handrail each side
  k.box(dw * 2 + 1, 0.22, 1.6, T(CONC), 0, 0, fz + 0.8, { outline: 0.03 });
  for (let i = -2; i <= 2; i++) k.box(dw * 2 + 0.4, 0.04, 0.12, T(DARK), 0, 0.22, fz + 0.8 + i * 0.28, { outline: 0 });
  for (const sx of [-1, 1]) {
    const px = sx * (dw + 0.32);
    for (const pz of [fz + 0.2, fz + 1.4]) k.cyl(0.05, 0.05, 1.0, 5, T(trim), px, 0.22, pz, { outline: 0.015 });
    k.beam([px, 1.22, fz + 0.2], [px, 1.22, fz + 1.4], 0.05, T(trim), { outline: 0.015 });
  }
  if (yard) {
    // beside the airlock, clear of the berm: radiator racks left (two on big domes), power cabinet and gas bottles right,
    // each with a line into the berm
    const rx = hw + 2.6, rz = Math.max(r + L * 0.45 + 1, Math.sqrt((r + bw) ** 2 - rx * rx) + 1.8);
    const into = (px, pz) => { const s = (r + bw * 0.4) / Math.hypot(px, pz); return [px * s, 0.3, pz * s]; };
    const rh = Math.min(4.5, 2.4 + r * 0.04), fh = (rh - 0.5) / 3;
    // racks face out, side by side along x
    const rzR = Math.max(r + L * 0.45 + 1, Math.sqrt((r + bw) ** 2 - (hw + 1.4) ** 2) + 1.2);
    for (let j = 0; j < (r >= 20 ? 2 : 1); j++) {
      const px = -(hw + 3.2 + j * 3.6);
      for (const sx of [-1, 1]) k.box(0.18, rh, 0.18, T(STEEL), px + sx * 1.6, 0, rzR, { outline: 0.03 });
      for (let f = 0; f < 3; f++) {
        const fy = 0.5 + f * fh;
        k.box(3.0, fh - 0.15, 0.08, T(WHITE), px, fy, rzR, { outline: 0.03 });
        for (let c = -2; c <= 2; c++) k.box(0.06, fh - 0.3, 0.14, T(0x6b6880), px + c * 0.6, fy + 0.07, rzR, { outline: 0 });
      }
      k.box(3.4, 0.3, 0.3, T(STEEL), px, rh - 0.15, rzR, { outline: 0.03 });
      k.beam([px, 0.3, rzR - 0.1], into(px, rzR), 0.1, T(LIGHT));
      k.solid(1.75, rh / 2, 0.3, px, rzR);
    }
    k.box(1.6, 1.9, 0.9, T(PANEL), rx, 0, rz, { outline: 0.05 });
    k.box(1.7, 0.16, 1.0, T(trim), rx, 1.9, rz, { outline: 0.02 });
    k.box(1.2, 1.2, 0.05, T(0x4a4660), rx, 0.45, rz + 0.46, { outline: 0 });
    for (let i = 0; i < 3; i++) k.box(0.12, 0.12, 0.05, G(i === 2 ? YEL : 0x7dff6a), rx - 0.3 + i * 0.3, 1.55, rz + 0.47, { outline: 0 });
    for (let i = 0; i < 3; i++) {
      const bx = rx + 1.3 + i * 0.55;
      k.cyl(0.24, 0.24, 1.5, 8, T([0x7dff6a, WHITE, 0x2ec4ff][i]), bx, 0, rz - 0.1, { outline: 0.03 });
      k.cyl(0.09, 0.09, 0.2, 6, T(DARK), bx, 1.5, rz - 0.1, { outline: 0 });
    }
    k.box(1.9, 0.08, 0.08, T(DARK), rx + 1.85, 1.1, rz + 0.16, { outline: 0 });
    k.beam([rx, 0.3, rz - 0.45], into(rx, rz - 0.45), 0.12, T(DARK));
    k.solid(1.65, 0.95, 0.55, rx + 0.85, rz);
  }
  k.sphere(r, 0, 0.6, 0);
  k.solid(ar + 0.2, ar + 0.2, L / 2 + 0.3, 0, r + L / 2 - 0.4);
  k.solid(hw, hh / 2, hd / 2, 0, hz);
  k.at();
}

// Prefab cabin: corner posts, lit windows, door with lamp, parapet roof, AC unit, vent. Door faces local +z.
export function cabin(k, x, z, w, d, h, color, yaw = 0, { roof = ROOF, trim = YEL, solar = false } = {}) {
  k.at(x, z, yaw);
  k.box(w + 0.5, 0.5, d + 0.5, T(CONC), 0, 0, 0, { outline: 0.05 });
  k.box(w, h, d, T(color), 0, 0.4, 0, { outline: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.4, h, 0.4, T(PANEL), sx * (w / 2), 0.4, sz * (d / 2), { outline: 0 });
  k.box(w + 0.6, 0.5, d + 0.6, T(roof), 0, h + 0.4, 0, { outline: 0.06 });
  k.box(w + 0.7, 0.18, d + 0.7, T(trim), 0, h + 0.85, 0, { outline: 0 });
  // lit windows on all four faces
  const wy = 0.4 + h * 0.55;
  for (const [len, face, rot] of [[w, d / 2, 0], [w, -d / 2, Math.PI], [d, w / 2, Math.PI / 2], [d, -w / 2, -Math.PI / 2]]) {
    const n = Math.max(1, Math.floor((len - 2.4) / 2.6));
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * 2.6;
      if (rot === 0 && Math.abs(u) < 1.6) continue; // door
      const px = rot === 0 || rot === Math.PI ? u : face, pz = rot === 0 || rot === Math.PI ? face : u;
      k.box(1.5, 1.1, 0.12, G(WARM), px * (rot === Math.PI ? -1 : 1), wy - 0.55, pz, { ry: rot, outline: 0 });
      k.box(1.7, 0.16, 0.2, T(DARK), px * (rot === Math.PI ? -1 : 1), wy + 0.55, pz, { ry: rot, outline: 0 });
    }
  }
  k.box(1.5, 2.3, 0.15, T(0x2a2540), 0, 0.4, d / 2 + 0.04, { outline: 0.02 });
  k.box(1.9, 0.2, 0.7, T(trim), 0, 2.85, d / 2 + 0.3, { outline: 0.02 });
  k.box(0.5, 0.18, 0.18, G(WARM), 0, 2.7, d / 2 + 0.5, { outline: 0 });
  // roof kit
  if (solar) {
    // tilted panels on rack legs (trim top: h + 1.03)
    const pd = Math.min(d - 1.5, 3), pc = h + 1.03 + (pd / 2) * Math.sin(0.35) + 0.12, rz = (pd / 2) * 0.75;
    for (let i = 0; i < Math.max(1, Math.floor(w / 4)); i++) {
      const px = -w / 2 + 2.4 + i * 3.8;
      k.add(new THREE.BoxGeometry(3.2, 0.12, pd), T(0x2b3a8f), px, pc, 0, { rx: -0.35, outline: 0.03 });
      k.add(new THREE.BoxGeometry(3.24, 0.05, 0.06), T(LIGHT), px, pc + 0.07, 0, { rx: -0.35, outline: 0 });
      for (const sz of [-1, 1]) {
        const top = pc + sz * rz * Math.tan(0.35) - 0.08;
        for (const sx of [-1.3, 1.3]) k.box(0.12, top - (h + 1.03), 0.12, T(STEEL), px + sx, h + 1.03, sz * rz, { outline: 0 });
      }
    }
  } else {
    k.box(1.8, 1.0, 1.4, T(LIGHT), -w / 4, h + 0.9, -d / 6, { outline: 0.04 });
    k.add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), T(DARK), -w / 4, h + 1.95, -d / 6, { outline: 0 });
    k.cyl(0.25, 0.3, 1.6, 8, T(STEEL), w / 4, h + 0.9, d / 6, { outline: 0.03 });
  }
  k.solid(w / 2 + 0.3, (h + 1.2) / 2, d / 2 + 0.3, 0, 0);
  k.at();
}

// Tall industrial shed: glazed sawtooth roof, roll-up doors, loading dock (+z).
export function warehouse(k, x, z, w, d, h, color, yaw, trim) {
  k.at(x, z, yaw);
  k.box(w, h, d, T(color), 0, 0, 0, { outline: 0.15 });
  for (let i = 0; i < 6; i++) k.box(0.3, h, d + 0.15, T(PANEL), -w / 2 + (w / 6) * (i + 0.5) - w / 12, 0, 0, { outline: 0 });
  // north-light roof: ridges front to back, one slope of each glazed
  const teeth = Math.max(3, Math.round(w / 6)), tw = w / teeth, th = 2.6, lean = Math.atan(tw / 2 / th);
  for (let i = 0; i < teeth; i++) {
    const tx = -w / 2 + tw * (i + 0.5);
    k.add(prism(d, tw, th), T(trim), tx, h + 0.4, 0, { ry: Math.PI / 2, outline: 0.06 });
    k.add(new THREE.BoxGeometry(0.12, th * 0.85 / Math.cos(lean), d - 1.2), G(0xcfefff), tx + tw / 4 + 0.08, h + 0.4 + th / 2, 0, { rz: lean, outline: 0 });
  }
  k.box(w + 0.4, 0.4, d + 0.4, T(ROOF), 0, h, 0, { outline: 0.05 });
  // two striped roll-up doors and a raised dock
  for (const s of [-1, 1]) {
    k.box(w * 0.28, h * 0.62, 0.3, T(0x6b6880), s * w * 0.22, 0, d / 2 + 0.05, { outline: 0.03 });
    for (let j = 1; j < 6; j++) k.box(w * 0.28, 0.12, 0.34, T(DARK), s * w * 0.22, (h * 0.62 * j) / 6, d / 2 + 0.06, { outline: 0 });
    k.box(w * 0.3, 0.4, 0.4, T(YEL), s * w * 0.22, h * 0.62, d / 2 + 0.1, { outline: 0 });
    k.box(0.4, 0.6, 0.6, G(WARM), s * w * 0.22, h * 0.62 + 0.8, d / 2 + 0.3, { outline: 0 });
  }
  k.box(w * 0.86, 1.1, 3, T(CONC), 0, 0, d / 2 + 1.5, { outline: 0.05 });
  for (let i = -3; i <= 3; i++) k.box(0.8, 0.12, 0.2, T(i % 2 ? YEL : DARK), i * 1.6, 1.1, d / 2 + 2.95, { outline: 0 });
  k.solid(w / 2 + 0.2, h / 2 + 1.5, d / 2 + 0.2, 0, 0);
  k.solid(w * 0.43, 0.55, 1.5, 0, d / 2 + 1.5);
  k.at();
}

// Vehicle garage (tools/blender/build_garage.py). 'main': three-bay motor pool with an end office and a compound (bunded fuel
// yard with pump island, rover park, parts store and rack, power compound); 'small': a two-bay shed. Shell, roof, yards and the
// parts store's cargo boxes are baked. `open` (per bay) rolls doors up to show a lit workshop (rover on a lift, engine stand or
// bench). Turbine vents turn; (main) the antenna lamp blinks. Doors (+z) face the yaw. Colliders are the model's `col` pivots
// (hall, its door plane a wall; office; tanks; yard furniture).
export function garage(k, x, z, yaw, open = [true, false, true], kind = 'main') {
  const M = garageModel(open, kind);
  const mat = (slot) => slotMat(garageSlot(slot));
  const I = new THREE.Matrix4();
  k.at(x, z, yaw);
  for (const n of M.flat) k.baked(n, mat, I);
  for (const f of M.fans) {
    const head = part(0xffffff, (q) => q.baked(f, mat, I));
    head.userData.spin = f.data.speed || 1;
    k.dyn(head, f.pos.x, f.pos.y, f.pos.z);
  }
  for (const b of M.blinkers) k.blinker(b.pos.x, b.pos.y, b.pos.z, 0xffd23f, b.data.radius || 0.25);
  for (const c of M.cargo) cargoStack(k, c.pos.x, c.pos.z, c.data.n || 1, [c.data.faction || 'meridian'], c.data.yaw || 0, c.pos.y);
  for (const { pos: p, data: d } of M.cols) {
    if (d.shape === 'box') k.solid(d.hx, d.hy, d.hz, p.x, p.z, d.yaw || 0, p.y);
    else if (d.shape === 'cyl') k.column(d.r, p.y + d.h, p.x, p.z, p.y);
    else if (d.shape === 'hcyl') k.hcyl(d.r, d.len, p.x, p.z, d.yaw || 0, p.y);
  }
  k.at();
}

// Four-legged lattice tower (masts, derricks): legs taper from half-width w0 to w1, X-braced in `bays` bays. Draws in the
// current frame.
export function lattice(k, x, z, h, w0, w1, bays, legM, braceM, { r = 0.22 } = {}) {
  const cn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const hw = (y) => w0 + (w1 - w0) * (y / h);
  for (const [sx, sz] of cn) k.beam([x + sx * w0, 0, z + sz * w0], [x + sx * w1, h, z + sz * w1], r, legM, { outline: 0.05, seg: 6 });
  for (let i = 0; i < bays; i++) {
    const y0 = (h * i) / bays, y1 = (h * (i + 1)) / bays, a = hw(y0), b = hw(y1);
    for (let f = 0; f < 4; f++) {
      const [ax, az] = cn[f], [bx, bz] = cn[(f + 1) % 4];
      k.beam([x + ax * a, y0, z + az * a], [x + bx * b, y1, z + bz * b], r * 0.4, braceM, { outline: 0.02, seg: 4 });
      k.beam([x + bx * a, y0, z + bz * a], [x + ax * b, y1, z + az * b], r * 0.4, braceM, { outline: 0.02, seg: 4 });
      k.beam([x + ax * b, y1, z + az * b], [x + bx * b, y1, z + bz * b], r * 0.5, legM, { outline: 0.02, seg: 4 });
    }
  }
  // solid core in two tapering steps (to the legs, not the bracing)
  k.column(Math.max(w0, hw(h / 2)) * 1.15 + r, h / 2, x, z);
  k.column(hw(h / 2) * 1.15 + r, h, x, z, h / 2);
}

// Tower crane (tools/blender/build_crane.py): foundation, base and mast baked; slewing head (jib, counter-jib, cab, lamps),
// trolley, rope and hook with load move. Model: 34 m mast, 30 m jib; `h` scales it uniformly (`jib` is unused, kept for callers:
// reach follows from the scale). The hook carries the Prospector's container in one of three liveries (by `phase`: Kepler,
// Meridian, SpaceCom).
// Meridian Exchange main garage: out toward the ring road on the south-west diagonal, facing it (16 m clear of the landing pad at
// (-100, -60), 6 m of the container yard, just past the ring's casino-road junction); `yaw` turns its +z bays outward
const GARAGE_R = 128, GARAGE_ANGLE = 236;
const GARAGE_AT = { angle: GARAGE_ANGLE, x: Math.cos((GARAGE_ANGLE * Math.PI) / 180) * GARAGE_R, z: Math.sin((GARAGE_ANGLE * Math.PI) / 180) * GARAGE_R, yaw: Math.atan2(Math.cos((GARAGE_ANGLE * Math.PI) / 180), Math.sin((GARAGE_ANGLE * Math.PI) / 180)) };
const CRANE_CARGO = ['kepler', 'meridian', 'spacecom'];
export function towerCrane(k, x, z, h, jib, color, { speed = 0.12, phase = 0 } = {}) {
  const C = craneModel(), sc = h / CRANE_H;
  const faction = CRANE_CARGO[Math.abs(Math.round(phase * 3)) % 3];
  const mat = (slot) => slotMat(craneSlot(slot, color, faction));
  k.at(x, z);
  k.baked(C.root, mat, new THREE.Matrix4().makeScale(sc, sc, sc));
  k.solid(4.3 * sc, 1.0 * sc, 4.3 * sc, 0, 0); // foundation and ballast
  k.column(1.7 * sc, h, 0, 0); // mast
  // a moving piece: the node's meshes plus its `load` and matching `livery` descendants, in the node's frame
  const piece = (node) => part(color, (q) => {
    const walk = (n, m) => {
      q.baked(n, mat, m);
      for (const c of n.kids) {
        if (c.role === 'load' || (c.role === 'livery' && c.data.faction === faction)) walk(c, nodeMatrix(c, m));
      }
    };
    walk(node, new THREE.Matrix4().makeScale(sc, sc, sc));
  });
  const top = piece(C.slew);
  for (const b of C.blinkers) top.add(blinkLamp(b, 0.3, sc));
  const trolley = piece(C.trolley), cable = piece(C.cable), hook = piece(C.hook);
  for (const [o, n] of [[trolley, C.trolley], [cable, C.cable], [hook, C.hook]]) o.position.copy(n.pos).multiplyScalar(sc);
  trolley.add(cable, hook);
  top.add(trolley);
  top.position.y = C.slew.pos.y * sc;
  // rope pays out until the container is 1.5 m up (hook height in the model: H + trolley + hook - rope)
  const ropeMax = CRANE_H + C.trolley.pos.y + C.hook.pos.y - CRANE_LOAD_DROP - 1.5 - 2;
  top.userData.tick = (o, dt, t) => {
    const u = t * speed + phase;
    o.rotation.y = phase * 2 + Math.sin(u) * 1.6;
    trolley.position.x = (CRANE_TROLLEY_MIN + CRANE_TROLLEY_SPAN * (0.5 + 0.5 * Math.sin(u * 1.7 + 1))) * sc;
    const rope = 2 + ropeMax * (0.5 + 0.5 * Math.sin(u * 1.3)); // metres, at model size
    cable.scale.y = rope;
    hook.position.y = (C.hook.pos.y - rope) * sc;
  };
  k.dyn(top, 0, top.position.y, 0);
  k.at();
}

// Gantry crane (tools/blender/build_gantry.py) over a container yard: one moving object running along x (`travel` m either side
// of `x`), trolley at `lane` along z. It sets its load (land-train container on a spreader, `faction` livery) down and lifts it at
// each end of the run: one cycle per 1 / `speed` s, starting at `phase`. Settlement frame (k at the origin); legs at z +- 15
// of `z`. No colliders: it never stands still.
export function gantryCrane(k, x, z, color, { speed = 1 / 70, phase = 0, travel = 24, lane = 10, faction = 'meridian' } = {}) {
  const C = gantryModel();
  const mat = (slot, cargo) => slotMat(cargo ? cargoSlot(slot, faction) : craneSlot(slot, color, faction));
  // a moving piece: the node's meshes plus, under `load`, the spreader, cargo and its matching livery
  const piece = (node) => part(color, (q) => {
    const walk = (n, m, cargo) => {
      q.baked(n, (slot) => mat(slot, cargo), m);
      for (const c of n.kids) {
        if (c.role === 'load' || c.role === 'cargo' || (c.role === 'livery' && c.data.faction === faction)) {
          walk(c, nodeMatrix(c, m), cargo || c.role === 'cargo');
        }
      }
    };
    walk(node, new THREE.Matrix4(), false);
  });
  const body = piece(C.root);
  for (const b of C.blinkers) body.add(blinkLamp(b, 0.3));
  const trolley = piece(C.trolley), cable = piece(C.cable), hook = piece(C.hook);
  for (const [o, n] of [[trolley, C.trolley], [cable, C.cable], [hook, C.hook]]) o.position.copy(n.pos);
  trolley.add(cable, hook);
  body.add(trolley);
  // rope pays out until the container is 0.3 m up
  const drop = C.hook.data.drop || 8.9;
  const ropeMin = 1.5, ropeMax = C.trolley.pos.y + C.hook.pos.y - drop - 0.3;
  const ease = (f) => 0.5 - 0.5 * Math.cos(Math.PI * f); // (f is in 0..1 on both runs)
  body.userData.tick = (o, dt, t) => {
    const u = ((t * speed + phase) % 1 + 1) % 1;
    // cycle: dip here (0 to 0.2), run (0.2 to 0.5), dip at the far end (0.5 to 0.7), run back
    let along, dip;
    if (u < 0.2) { along = 0; dip = Math.sin(Math.PI * u / 0.2); }
    else if (u < 0.5) { along = ease((u - 0.2) / 0.3); dip = 0; }
    else if (u < 0.7) { along = 1; dip = Math.sin(Math.PI * (u - 0.5) / 0.2); }
    else { along = 1 - ease((u - 0.7) / 0.3); dip = 0; }
    o.position.x = x - travel + 2 * travel * along;
    trolley.position.z = lane + Math.sin(t * 0.5 + phase * 7) * 0.4;
    const rope = ropeMin + (ropeMax - ropeMin) * dip;
    cable.scale.y = rope;
    hook.position.y = C.hook.pos.y - rope;
  };
  k.dyn(body, x, 0, z);
}

// Stack of `n` land-train containers (gantryModel().box) at (x, z), liveries `factions[j]` bottom first, along local z turned by
// `ry`, on y0; one collider for the stack.
export function cargoStack(k, x, z, n, factions, ry = 0, y0 = 0) {
  const C = gantryModel();
  for (let j = 0; j < n; j++) {
    const f = factions[j % factions.length];
    const mat = (slot) => slotMat(cargoSlot(slot, f));
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y0 + j * CARGO_BOX.h, z);
    k.baked(C.box, mat, m);
    for (const c of C.box.kids) {
      if (c.role === 'livery' && c.data.faction !== f) continue;
      k.baked(c, mat, nodeMatrix(c, m));
    }
  }
  k.solid(CARGO_BOX.hx + 0.1, (n * CARGO_BOX.h) / 2, CARGO_BOX.hz + 0.1, x, z, ry, y0);
}

// Radio-dish station (tools/blender/build_dish.py): 'cryo' (He-3 tanker on end under a banded dish) or 'gantry' (lattice mast over
// container control rooms). Baked in `faction` livery with dish number `no` ('01'..). The head turns about the vertical, the dish
// nods on its trunnions, a feed lamp blinks. `size` scales the 30 m mount uniformly; the front (panel, cabinet, plates) faces `yaw`.
const DISH_COLLIDERS = {
  // skirt and vessel (a cylinder each), valve cabinet (on the thin pad)
  cryo(k, s) {
    k.column(6.9 * s, 3.2 * s, 0, 0);
    k.column(5.7 * s, 20.5 * s, 0, 0);
    k.solid(2.1 * s, 1.35 * s, 0.6 * s, -3.9 * s, 7.6 * s, 0, 0.3 * s);
  },
  // footings, mast core in three tapering steps, containers (one stacked), battery bank, fuel tank, generator and stack
  gantry(k, s) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.solid(1.5 * s, 0.55 * s, 1.5 * s, sx * 4.3 * s, sz * 4.3 * s);
    k.solid(4.4 * s, 4.0 * s, 4.4 * s, 0, 0);
    k.solid(3.9 * s, 3.3 * s, 3.9 * s, 0, 0, 0, 8 * s);
    k.solid(3.4 * s, 3.5 * s, 3.4 * s, 0, 0, 0, 14.6 * s);
    k.solid(1.75 * s, 3.3 * s, 4.8 * s, -11.5 * s, 3.0 * s);
    k.solid(1.75 * s, 1.65 * s, 4.8 * s, 11.5 * s, 4.5 * s);
    k.solid(1.75 * s, 1.65 * s, 4.8 * s, 11.5 * s, -7.0 * s);
    k.hcyl(1.45 * s, 5.6 * s, -1.5 * s, -9.5 * s, Math.PI / 2, 2.3 * s);
    k.solid(1.4 * s, 1.0 * s, 1.4 * s, -12.5 * s, -4.5 * s);
    k.column(0.5 * s, 11.5 * s, -12.5 * s, -4.5 * s);
  },
};
export function dishStation(k, x, z, size, kind, faction, no, { yaw = 0, speed = 0.1, phase = 0 } = {}) {
  const D = dishModel(kind, faction, no), sc = size / D.size;
  const mat = (slot) => slotMat(dishSlot(slot, faction));
  const S = new THREE.Matrix4().makeScale(sc, sc, sc);
  k.at(x, z, yaw);
  for (const n of D.fixed) k.baked(n, mat, nodeMatrix(n, S));
  for (const b of D.blinkers) k.blinker(b.pos.x * sc, b.pos.y * sc, b.pos.z * sc, 0xff2a4a, (b.data.radius || 0.4) * sc);
  DISH_COLLIDERS[kind](k, sc);
  const piece = (node) => part(0xffffff, (q) => q.baked(node, mat, S));
  const head = piece(D.yaw), dish = piece(D.tilt);
  dish.position.copy(D.tilt.pos).multiplyScalar(sc);
  for (const b of D.tiltBlinkers) dish.add(blinkLamp(b, 0.4, sc));
  head.add(dish);
  const turn0 = k.yaw;
  head.userData.tick = (o, dt, t) => {
    o.rotation.y = turn0 + phase + t * speed;
    dish.rotation.x = -0.6 + Math.sin(t * speed * 2 + phase) * 0.25;
  };
  k.dyn(head, 0, D.yaw.pos.y * sc, 0);
  k.at();
}

// Horton sphere: pressure sphere on legs, equator walkway, bands, ladder.
export function hortonSphere(k, x, z, r, color, band) {
  k.at(x, z);
  const cy = r + 3.2;
  k.cyl(r * 0.9, r * 0.95, 0.4, 20, T(CONC), 0, 0, 0, { outline: 0.04 });
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    k.beam([Math.cos(a) * r * 0.82, 0.3, Math.sin(a) * r * 0.82], [Math.cos(a) * r * 0.98, cy, Math.sin(a) * r * 0.98], 0.22, T(STEEL), { outline: 0.04 });
    k.beam([Math.cos(a) * r * 0.82, 0.8, Math.sin(a) * r * 0.82], [Math.cos(a + TAU / n) * r * 0.82, cy * 0.55, Math.sin(a + TAU / n) * r * 0.82], 0.08, T(DARK), { outline: 0 });
  }
  k.add(new THREE.SphereGeometry(r, 24, 14), T(WHITE), 0, cy, 0, { outline: 0.14 });
  k.ring(r + 0.15, 0.32, T(band), 0, cy + r * 0.5, 0);
  k.ring(r + 0.05, 0.4, G(band), 0, cy + r * 0.2, 0);
  k.ring(r + 0.55, 0.12, T(DARK), 0, cy, 0);
  k.ring(r + 0.9, 0.1, T(YEL), 0, cy + 0.9, 0);
  k.cyl(0.6, 0.8, 1.0, 10, T(STEEL), 0, cy + r - 0.2, 0, { outline: 0.04 });
  for (const s of [-0.3, 0.3]) k.beam([r * 0.3 + s, 0.3, r + 0.2], [r * 0.3 + s, cy + r * 0.85, r * 0.45], 0.05, T(DARK), { outline: 0 });
  k.sphere(r + 0.2, 0, cy, 0);
  k.column(r * 0.95, cy, 0, 0);
  k.at();
}

// Price ticker: a drum of scrolling text (canvas texture offset each frame) between two rings.
export function ticker(k, x, y, z, r, h, text, { fg = '#7dff6a', bg = '#0d0a1a', ring = YEL, speed = 0.03 } = {}) {
  // the canvas is exactly one pass of the text, repeated whole round the drum, so the wrap never cuts an item
  const c = document.createElement('canvas');
  const parts = text.split('|').map((s) => s.trim() + '   ');
  const g = c.getContext('2d');
  let fs = 64;
  g.font = pixelFont(fs);
  let W = parts.reduce((a, s) => a + g.measureText(s).width, 0);
  // small drum: shrink the lettering so one pass fits unsqueezed
  const nat = (h * W) / 128;
  if (nat > TAU * r * 1.25) fs = Math.max(28, Math.floor((fs * TAU * r) / nat));
  if ((W * fs) / 64 > 8000) fs = Math.floor((fs * 8000 * 64) / (W * fs));
  g.font = pixelFont(fs);
  W = parts.reduce((a, s) => a + g.measureText(s).width, 0);
  c.width = Math.ceil(W); c.height = 128;
  // (re)paint; new text is squeezed or stretched to the same canvas, keeping whole passes as prices change length
  const paint = (items) => {
    const w = items.reduce((a, s) => a + g.measureText(s).width, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.font = pixelFont(fs);
    g.textBaseline = 'middle';
    g.scale(Math.max(0.7, Math.min(1.4, c.width / w)), 1);
    let px = 0;
    for (const s of items) {
      g.fillStyle = s.includes('▼') ? '#ff3b5c' : fg;
      g.fillText(s, px, 68);
      px += g.measureText(s).width;
    }
  };
  g.font = pixelFont(fs);
  paint(parts);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  // whole passes round the drum, near the text's natural aspect
  tex.repeat.set(Math.max(1, Math.round((TAU * r) / ((h * c.width) / c.height))), 1);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1, true), new THREE.MeshBasicMaterial({ map: tex }));
  drum.userData.tick = (o, dt) => { tex.offset.x = (tex.offset.x + dt * speed) % 1; };
  drum.userData.retext = (t) => { paint(t.split('|').map((q) => q.trim() + '   ')); tex.needsUpdate = true; };
  k.dyn(drum, x, y + h / 2, z);
  k.ring(r + 0.1, 0.25, T(ring), x, y + h + 0.1, z);
  k.ring(r + 0.1, 0.25, T(ring), x, y - 0.1, z);
  return drum;
}

// Elevated conveyor on trestles along a polyline, ore lumps riding it.
export function conveyor(k, pts, y, { lump = 0x6b6378, n = 14, speed = 3, belt = DARK } = {}) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, s0: total });
    total += len;
    const yaw = Math.atan2(bx - ax, bz - az);
    k.box(1.6, 0.35, len + 1.2, T(belt), (ax + bx) / 2, y, (az + bz) / 2, { ry: yaw, outline: 0.04 });
    k.solid(0.95, 0.4, len / 2 + 0.6, (ax + bx) / 2, (az + bz) / 2, yaw, y - 0.1);
    for (const s of [-1, 1]) k.box(0.15, 0.5, len + 1.2, T(YEL), (ax + bx) / 2 + Math.cos(yaw) * s * 0.85, y + 0.1, (az + bz) / 2 - Math.sin(yaw) * s * 0.85, { ry: yaw, outline: 0 });
    for (let t = 0; t <= len; t += 7) {
      const px = ax + ((bx - ax) * t) / len, pz = az + ((bz - az) * t) / len;
      for (const s of [-1, 1]) k.beam([px + Math.cos(yaw) * s * 0.7, 0, pz - Math.sin(yaw) * s * 0.7], [px + Math.cos(yaw) * s * 0.6, y, pz - Math.sin(yaw) * s * 0.6], 0.12, T(STEEL), { outline: 0.02 });
      k.beam([px + Math.cos(yaw) * 0.7, y * 0.5, pz - Math.sin(yaw) * 0.7], [px - Math.cos(yaw) * 0.7, y * 0.5, pz + Math.sin(yaw) * 0.7], 0.06, T(STEEL), { outline: 0 });
    }
  }
  const geo = new THREE.DodecahedronGeometry(0.5, 0);
  const lumps = new THREE.InstancedMesh(geo, T(lump), n);
  lumps.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  lumps.userData.tick = (o, dt, t) => {
    for (let i = 0; i < n; i++) {
      const s = (t * speed + (i / n) * total) % total;
      const sg = segs.find((g2) => s < g2.s0 + g2.len) || segs[segs.length - 1];
      const f = (s - sg.s0) / sg.len;
      p.set(sg.ax + (sg.bx - sg.ax) * f, y + 0.6, sg.az + (sg.bz - sg.az) * f);
      q.setFromEuler(e.set(i, i * 2.3, 0));
      sc.setScalar(0.7 + (i % 3) * 0.2);
      o.setMatrixAt(i, m4.compose(p, q, sc));
    }
    o.instanceMatrix.needsUpdate = true;
  };
  lumps.frustumCulled = false;
  k.dyn(lumps, 0, 0, 0);
}

// Floodlight mast: lattice pole, lamp bank aimed at the yard centre.
export function floodMast(k, x, z, h = 14) {
  k.at(x, z, Math.atan2(-x, -z));
  k.box(1.6, 0.4, 1.6, T(CONC), 0, 0, 0, { outline: 0.03 });
  lattice(k, 0, 0, h, 0.6, 0.35, Math.round(h / 3), T(STEEL), T(DARK), { r: 0.12 });
  k.box(3.2, 0.3, 0.3, T(YEL), 0, h, 0.4, { outline: 0.03 });
  for (const s of [-1, 0, 1]) {
    k.box(0.9, 0.7, 0.5, T(DARK), s * 1.05, h + 0.3, 0.5, { rx: 0.4, outline: 0.03 });
    k.box(0.75, 0.55, 0.08, G(0xfffbe0), s * 1.05, h + 0.37, 0.77, { rx: 0.4, outline: 0 });
  }
  k.column(0.7, h, 0, 0);
  k.at();
}

// Exhaust stack with red-and-white bands and a blinker.
export function stack(k, x, z, h, r) {
  k.at(x, z);
  k.cyl(r * 0.8, r, h, 14, T(WHITE), 0, 0, 0, { outline: 0.08 });
  for (const f of [0.68, 0.84]) k.cyl(r * (1 - 0.2 * f) + 0.06, r * (1 - 0.2 * f) + 0.06, h * 0.07, 14, T(0xff3b5c), 0, h * f, 0, { outline: 0 });
  k.cyl(r * 0.85, r * 0.8, 0.6, 14, T(DARK), 0, h - 0.3, 0, { outline: 0.03 });
  k.blinker(0, h + 0.6, 0, 0xff2a4a, 0.35);
  k.column(r, h, 0, 0);
  k.at();
}

// Pipe run along a polyline at height y, with supports.
export function pipe(k, pts, y, r = 0.35, color = 0xd8d4e8) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    k.beam([a[0], y, a[1]], [b[0], y, b[1]], r, T(color), { outline: 0.03, seg: 8 });
    k.ball(r * 1.3, T(color), b[0], y, b[1], { outline: 0 });
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    k.solid(r, r, len / 2 + r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1]), y - r);
    for (let t = 4; t < len; t += 8) {
      const px = a[0] + ((b[0] - a[0]) * t) / len, pz = a[1] + ((b[1] - a[1]) * t) / len;
      k.beam([px, 0, pz], [px, y - r, pz], 0.1, T(STEEL), { outline: 0 });
    }
  }
}

// =============================================================================================
// Helium-3 Exchange, a working strip-mine: bucket-wheel excavator feeding a conveyor to the refinery, a pumping derrick,
// Horton spheres, a trading hall with a price ticker, a tower crane.
// =============================================================================================
export function buildHelium(world, loc) {
  settle(world, loc, 3301, (k) => {
    const blue = 0x2ec4ff;
    // derrick: lattice tower over a rotary deck, drill string pumping and turning
    k.at(0, 0);
    k.box(18, 1.2, 18, T(CONC), 0, 0, 0, { outline: 0.08 });
    k.box(12, 0.6, 12, T(DARK), 0, 6, 0, { outline: 0.06 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([sx * 5.4, 1.2, sz * 5.4], [sx * 5.4, 6, sz * 5.4], 0.35, T(STEEL), { outline: 0.04 });
    lattice(k, 0, 0, 40, 5, 1.6, 9, T(YEL), T(0xff9f1c), { r: 0.32 });
    k.box(4.2, 2.4, 4.2, T(0xff9f1c), 0, 40, 0, { outline: 0.06 });
    k.blinker(0, 43, 0, 0xff2a4a, 0.5);
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * TAU + TAU / 8;
      k.box(12, 0.12, 0.12, T(YEL), Math.cos(a) * 6.2 * 0.7, 7.2, Math.sin(a) * 6.2 * 0.7, { ry: -a + Math.PI / 2, outline: 0 });
    }
    k.cyl(2.2, 2.6, 1.2, 14, T(LIGHT), 0, 6.6, 0, { outline: 0.05 });
    k.solid(6, 3.4, 6, 0, 0, 0, 0);
    const drill = part(YEL, (q) => {
      q.cyl(0.45, 0.45, 30, 10, T(STEEL), 0, -14, 0, { outline: 0.04 });
      q.box(2.4, 3.2, 2.4, T(0xff9f1c), 0, 16, 0, { outline: 0.05 });
      q.cyl(0.9, 0.9, 0.8, 10, T(DARK), 0, 19.4, 0, { outline: 0.03 });
      for (const s of [-1, 1]) q.box(0.3, 3, 0.3, T(YEL), s * 1.3, 15.8, 0, { outline: 0 });
    });
    drill.userData.tick = (o, dt, t) => { o.position.y = 7.8 + 9 * (0.5 + 0.5 * Math.sin(t * 0.5)); o.rotation.y += dt * 2.5; };
    k.dyn(drill, 0, 7.8, 0);
    // mud and separator tanks
    k.at(14, 8);
    tank(k, 0, 0, 2.6, 6, LIGHT, 0x7dff6a);
    tank(k, 0, 6.5, 2.2, 5, LIGHT, 0xc77dff);
    k.at();
    pipe(k, [[4, 4], [14, 4], [14, 8]], 3.2, 0.4);
    // He-3 tank farm: four green / purple Horton spheres piped to a manifold
    for (const [x, z, b] of [[58, -20, 0x7dff6a], [76, -20, 0xc77dff], [58, 2, 0xc77dff], [76, 2, 0x7dff6a]]) hortonSphere(k, x, z, 6, WHITE, b);
    pipe(k, [[44, -36], [44, -9], [67, -9]], 1.4, 0.45, 0x9be7ff);
    pipe(k, [[67, -9], [67, -20]], 1.4, 0.45, 0x9be7ff);
    pipe(k, [[67, -9], [67, 2]], 1.4, 0.45, 0x9be7ff);
    k.at(67, -9);
    k.box(3.4, 2.4, 2.4, T(STEEL), 0, 0, 0, { outline: 0.04 });
    for (const s of [-1, 0, 1]) k.add(new THREE.TorusGeometry(0.5, 0.12, 4, 10), T(0xff3b5c), s * 1.1, 2.7, 0, { rx: Math.PI / 2, outline: 0 });
    k.solid(1.8, 1.2, 1.3, 0, 0);
    k.at();
    // refinery: process hall, two stacks, cold boxes, pipe racks to the farm
    cabin(k, 30, -42, 26, 14, 10, 0xd8d4e8, 0.3, { roof: ROOF, trim: blue });
    stack(k, 18, -54, 26, 1.6);
    stack(k, 23, -57, 20, 1.3);
    k.at(44, -44, 0.3);
    for (let i = 0; i < 3; i++) {
      k.cyl(1.6, 1.6, 9, 14, T(LIGHT), i * 4, 0, 0, { outline: 0.06 });
      k.add(new THREE.SphereGeometry(1.6, 12, 6, 0, TAU, 0, Math.PI / 2), T(LIGHT), i * 4, 9, 0, { outline: 0.04 });
      k.ring(1.65, 0.14, G(0x7dff6a), i * 4, 6, 0);
      k.column(1.7, 9, i * 4, 0);
    }
    k.at();
    // bucket-wheel excavator on the heap, feeding the conveyor
    k.at(-34, 40, 2.2);
    k.box(12, 2, 3.4, T(TYRE), 0, 0, -3.2, { outline: 0.06 });
    k.box(12, 2, 3.4, T(TYRE), 0, 0, 3.2, { outline: 0.06 });
    for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) k.add(new THREE.CylinderGeometry(0.8, 0.8, 3.5, 10).rotateX(Math.PI / 2), T(DARK), i * 2.4, 1, s * 3.2, { outline: 0 });
    k.cyl(4, 4.4, 1.4, 16, T(DARK), 0, 2, 0, { outline: 0.06 });
    k.box(8, 5, 6, T(YEL), -1, 3.4, 0, { outline: 0.1 });
    k.box(2.6, 2.4, 2.2, T(WHITE), 2.6, 8.4, 1.6, { outline: 0.05 });
    k.box(2.64, 0.9, 2.24, G(0xcfefff), 2.6, 9.4, 1.6, { outline: 0 });
    k.box(5, 3.2, 5, T(CONC), -7.5, 4.2, 0, { outline: 0.08 });
    k.box(0.3, 7, 0.3, T(DARK), 1, 8.4, 0, { outline: 0 });
    for (const s of [-1, 1]) {
      k.beam([2, 6.5, s * 1.2], [20, 5.5, s * 1.2], 0.35, T(YEL), { outline: 0.05 });
      k.beam([1, 15.4, 0], [19, 6.2, s * 1.2], 0.06, T(DARK), { outline: 0 });
      k.beam([-6, 6.4, s * 1.2], [1, 15.4, 0], 0.06, T(DARK), { outline: 0 });
    }
    for (let i = 0; i < 6; i++) k.beam([3 + i * 3, 6.5 - i * 0.18, -1.2], [4.5 + i * 3, 6.4 - i * 0.18, 1.2], 0.1, T(0xff9f1c), { outline: 0 });
    k.box(18, 0.4, 1.6, T(DARK), 11, 5.2, 0, { outline: 0.03 });
    k.solid(6.5, 4, 5, -1, 0);
    k.solid(9, 1, 1.4, 11, 0, 0, 5.3);
    const wheel = part(YEL, (q) => {
      q.add(new THREE.TorusGeometry(4.6, 0.35, 6, 24), T(YEL), 0, 0, 0, { outline: 0.05 });
      q.add(new THREE.TorusGeometry(2.0, 0.25, 6, 16), T(0xff9f1c), 0, 0, 0, { outline: 0.03 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        q.beam([Math.cos(a) * 2, Math.sin(a) * 2, 0], [Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0], 0.16, T(YEL), { outline: 0 });
        q.add(new THREE.BoxGeometry(1.5, 1.2, 1.6), T(DARK), Math.cos(a) * 5.1, Math.sin(a) * 5.1, 0, { rz: a + 0.6, outline: 0.04 });
        q.add(new THREE.ConeGeometry(0.18, 0.5, 4), T(LIGHT), Math.cos(a + 0.25) * 5.8, Math.sin(a + 0.25) * 5.8, 0, { rz: a - Math.PI / 2 + 0.3, outline: 0 });
      }
      q.cyl(0.6, 0.6, 2.6, 10, T(DARK), 0, -1.3, 0, { rx: Math.PI / 2, outline: 0.03 });
    });
    wheel.userData.tick = (o, dt) => { o.rotation.z -= dt * 0.7; };
    k.dyn(wheel, 21, 5.6, 0);
    k.at();
    // the heap
    k.at(-52, 66);
    // closed lathe mound, solid from every side
    k.add(new THREE.LatheGeometry([[15, 0], [13, 2.6], [9.5, 5.6], [5, 8], [1.5, 8.9], [0, 9]].map(([r, y]) => new THREE.Vector2(r, y)), 16), T(0x8a8296), 0, 0, 0, { outline: 0.12 });
    for (let i = 0; i < 9; i++) { const a = i * 0.7; k.add(new THREE.DodecahedronGeometry(1 + (i % 3) * 0.6, 0), T(0x6b6378), Math.cos(a) * (6 + i), 0.6, Math.sin(a) * (6 + i), { ry: a, outline: 0.04 }); }
    k.at();
    // stepped colliders following the mound
    for (const [r, y1] of [[14, 1.6], [11.5, 4], [8, 6.6], [4, 8.6]]) world.col(loc, { type: 'cyl', x: -52, z: 66, y0: -2, y1, r });
    // conveyor from the boom to the refinery
    conveyor(k, [[-30, 28], [-6, 22], [8, 12], [16, -20], [22, -34]], 4.6);
    // trading hall with roof ticker, flags, plaza sign
    cabin(k, -28, -58, 26, 14, 9, WHITE, -0.35, { roof: blue, trim: YEL, solar: true });
    k.at(-28, -58, -0.35);
    k.box(10, 3.2, 8, T(blue), 0, 9.8, 0, { outline: 0.06 });
    k.at();
    ticker(k, -28, 13.4, -58, 6, 2.6, 'HE-3 ▲ 412.70 | REGOLITH ▼ 3.15 | DEUTERIUM ▲ 88.20 | ICE ▲ 19.95 | ANTIMATTER ▼ 9,999.00 | PIRATE RISK ▲ HIGH');
    k.at(-28, -58);
    k.cyl(0.25, 0.3, 6, 6, T(DARK), 0, 16.2, 0, { outline: 0.03 });
    k.blinker(0, 22.5, 0, 0x2ec4ff, 0.4);
    k.at(-18, -38, -0.35);
    k.sign('HE-3 EXCHANGE', 0, 0, { w: 14, y: 5, fg: '#2ec4ff' });
    k.at();
    k.flag(-44, -44, 12, blue);
    k.flag(-12, -72, 12, 0x7dff6a);
    // glowing canister racks by the pad
    for (const [rx, rz, ry] of [[40, 36, 0.6], [48, 26, 0.6]]) {
      k.at(rx, rz, ry);
      k.box(9, 0.4, 2.4, T(DARK), 0, 0, 0, { outline: 0.03 });
      for (const s of [-1, 1]) k.box(9, 0.2, 0.2, T(YEL), 0, 2.4, s * 1.1, { outline: 0 });
      for (let i = 0; i < 6; i++) for (const s of [-0.5, 0.5]) {
        k.cyl(0.42, 0.42, 1.8, 10, T(LIGHT), -3.75 + i * 1.5, 0.4, s, { outline: 0.02 });
        k.ring(0.44, 0.08, G(0x7dff6a), -3.75 + i * 1.5, 1.3, s);
      }
      k.solid(4.6, 1.2, 1.3, 0, 0);
      k.at();
    }
    // tower crane, site office, floodlights
    towerCrane(k, -50, -18, 30, 26, YEL, { speed: 0.1, phase: 0.6 });
    cabin(k, -64, -46, 16, 8, 5, 0x8a8aa0, Math.atan2(64, 46), { trim: blue });
    floodMast(k, 26, 22, 14); floodMast(k, -24, -24, 14); floodMast(k, 50, -60, 14); floodMast(k, -60, 20, 14);
    // site clutter
    for (const [x, z, c] of [[8, 34, 0x9a6a3a], [10, 36.5, 0x4f5a42], [6, 37.5, 0x9a6a3a]]) crate(k, x, 0, z, 1.4, c, x * 0.3);
    world.pad(loc, 70, 50, 12);
  });
}

// Sawtooth trade hall (the Exchange's bonded market, layout A of docs/meridian-layouts.md): plinth, white walls, faction band,
// sawtooth roof glazed toward -x (the avenue), three glass doors there under the name, three loading doors at the back.
// w across x, d along z.
function tradeHall(k, x, z, w, d, trim, name = 'TRADE HALL') {
  const H = 7, teeth = 4, tw = w / teeth, rise = 3.2;
  k.at(x, z);
  k.box(w + 1.2, 0.6, d + 1.2, T(CONC), 0, 0, 0, { outline: 0.08 });
  k.box(w, H, d, T(WHITE), 0, 0.6, 0, { outline: 0.14 });
  k.box(w + 0.12, 0.6, d + 0.12, T(trim), 0, 5.4, 0, { outline: 0.03 });
  // roof: sawtooth profile across x, extruded along z
  const pts = [new THREE.Vector2(-w / 2, 0)];
  for (let i = 0; i < teeth; i++) { const x0 = -w / 2 + i * tw; pts.push(new THREE.Vector2(x0, rise), new THREE.Vector2(x0 + tw, 0)); }
  k.add(new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), T(0xd8d4e8), 0, 0.6 + H, 0, { outline: 0.1 });
  for (let i = 0; i < teeth; i++) k.box(0.16, rise - 0.7, d - 2, G(0xbfe9ff), -w / 2 + i * tw + 0.1, 0.6 + H + 0.35, 0, { outline: 0 });
  // -x: three bronze-framed glass doors; +x: three loading doors
  for (const dz of [-d / 4, 0, d / 4]) {
    k.box(0.4, 5.2, 5.2, T(0x8a5a3a), -w / 2 - 0.1, 0.6, dz, { outline: 0.04 });
    k.box(0.2, 4.4, 4.4, G(0xbfe9ff), -w / 2 - 0.3, 1.0, dz, { outline: 0 });
    k.box(0.4, 4.6, 6, T(0x4e4a60), w / 2 + 0.1, 0.6, dz, { outline: 0.04 });
    for (let j = 0; j < 3; j++) k.box(0.1, 0.25, 6, T(YEL), w / 2 + 0.36, 1.2 + j * 1.5, dz, { outline: 0 });
    k.box(0.4, 0.5, 6.4, T(trim), w / 2 + 0.1, 5.2, dz, { outline: 0.02 });
  }
  k.text(name, -w / 2 - 0.35, 0.6 + H - 0.9, 0, -Math.PI / 2, 14, { fg: '#2ec4ff', bg: '#0d1a33', back: false, off: 0.03 });
  k.solid(w / 2 + 0.6, (0.6 + H + rise) / 2, d / 2 + 0.6, 0, 0);
  k.at();
}

// Plaza fountain (tools/blender/build_casino.py): basin, pedestal, bowl, stem and spigots baked; the centrepiece turns (`top`:
// the casino's 'chip', or the Meridian Exchange's 'dollar' in `accent`); ripples, curtain and jets are shaders (fountainFx.js).
// Colliders for basin, pedestal and stem. Settlement frame (k at the origin).
function fountain(k, x, z, { top = 'chip', accent = 0xff2e88 } = {}) {
  const F = casinoNode('fountain'), I = new THREE.Matrix4();
  const mat = (slot) => slotMat(casinoSlot(slot, accent));
  k.at(x, z);
  k.baked(F, mat, I);
  for (const n of F.kids) {
    if (n.role === 'spin') {
      if ((n.data.kind || 'chip') !== top) continue;
      const piece = part(0xffffff, (q) => q.baked(n, mat, I));
      piece.userData.spin = n.data.speed || 0.7;
      k.dyn(piece, n.pos.x, n.pos.y, n.pos.z);
    } else k.dyn(waterMesh(n), n.pos.x, n.pos.y, n.pos.z);
  }
  k.at();
  k.column(9.8, 1.05, x, z);
  k.column(2.7, 4.7, x, z);
  k.column(1.7, 9.2, x, z, 4.7);
}

// =============================================================================================
// Meridian Exchange, the trade HQ on one axis (docs/meridian-layouts.md, layout A): gate arch at +z, a 118 m avenue to the plaza
// and the portico of the stepped glass trading tower (with the ticker), lab dome and trade hall facing across the avenue; behind
// the tower the port (container yard under a gantry crane, two tower cranes, the garage by the ring road); pads in the north corners.
// =============================================================================================
export function buildMeridian(world, loc) {
  settle(world, loc, 4409, (k) => {
    const blue = 0x2ec4ff;
    // Layout: tower 24 m south of the origin (the name and HQ sprites at y 50 and 62 over the origin would sit inside its cone),
    // portico facing +z onto the plaza at (0, 34); avenue north to the gate arch at (0, 140); dome west, hall east; chairwoman at
    // the foot of the steps; yard, cranes and garage south of the tower
    const TZ = -24;
    // trading tower: three stepped octagonal tiers of glass and white bands
    k.at(0, TZ, Math.PI / 8);
    k.cyl(22.5, 24, 1.6, 8, T(CONC), 0, 0, 0, { outline: 0.12 });
    const tiers = [[18, 15], [14, 13.5], [10.5, 13.5]];
    let y = 1.6;
    const tierTop = [];
    for (const [r, h] of tiers) {
      k.cyl(r, r, h, 8, T(WHITE), 0, y, 0, { outline: 0.16 });
      for (let j = 0; j < 3; j++) k.cyl(r + 0.05, r + 0.05, 1.8, 8, G(0xbfe9ff), 0, y + 2.2 + j * (h / 3), 0, { outline: 0 });
      if (tierTop.length) k.cyl(r + 0.9, r + 0.9, 0.9, 8, T(blue), 0, y + h, 0, { outline: 0.06 });
      tierTop.push(y + h);
      y += h + 0.9;
    }
    k.cyl(4.5, 7.5, 9, 8, T(blue), 0, y, 0, { outline: 0.1 });
    k.cyl(0.35, 0.6, 18, 6, T(DARK), 0, y + 9, 0, { outline: 0.04 });
    k.blinker(0, y + 27.6, 0, 0xff2a4a, 0.7);
    k.column(18, tierTop[0] + 0.9, 0, 0);
    k.column(14.4, y, 0, 0);
    k.at();
    // ticker on a round collar wider than the tier below (so the octagon's corners don't poke through), under a canopy
    const TY = tierTop[0];
    k.at(0, TZ);
    k.cyl(19.6, 19.6, 0.9, 48, T(blue), 0, TY, 0, { outline: 0.06 });
    k.add(new THREE.RingGeometry(13.9, 20.0, 48, 1).rotateX(-Math.PI / 2), T(blue), 0, TY + 3.75, 0, { outline: 0 });
    k.add(new THREE.RingGeometry(13.9, 20.0, 48, 1).rotateX(Math.PI / 2), T(0x1b3a8f), 0, TY + 3.7, 0, { outline: 0 });
    k.at();
    // live market prices (market.js), refreshed every 15 s
    const drum = ticker(k, 0, TY + 1.0, TZ, 19.8, 2.6, tickerText(), { fg: '#ffd23f', speed: 0.014 });
    const scroll = drum.userData.tick;
    let seen = market.version;
    drum.userData.tick = (o, dt, t) => {
      scroll(o, dt, t);
      market.update(t);
      if (market.version !== seen) { seen = market.version; drum.userData.retext(tickerText()); }
    };
    // entrance: columned portico with steps, glass doors under the name, banners
    {
      const fz = 16.6; // bottom tier's front face (an octagon flat faces the plaza)
      k.at(0, TZ);
      k.box(19, 1.6, 7, T(CONC), 0, 0, fz + 3.3, { outline: 0.06 });
      for (let i = 0; i < 3; i++) k.box(19, 1.2 - i * 0.4, 1.0, T(0xd8d4e8), 0, 0, fz + 7.3 + i, { outline: 0.03 });
      for (let i = 0; i < 6; i++) {
        const x = -7.5 + i * 3;
        k.cyl(0.62, 0.72, 9.4, 14, T(WHITE), x, 1.6, fz + 5.2, { outline: 0.05 });
        k.box(1.7, 0.4, 1.7, T(0xd8d4e8), x, 1.6, fz + 5.2, { outline: 0.02 });
        k.box(1.7, 0.4, 1.7, T(0xd8d4e8), x, 10.6, fz + 5.2, { outline: 0.02 });
        k.column(0.75, 11, x, fz + 5.2);
      }
      k.box(19.4, 1.8, 6.4, T(WHITE), 0, 11.0, fz + 3.2, { outline: 0.08 });
      k.box(19.6, 0.35, 6.6, T(blue), 0, 12.8, fz + 3.2, { outline: 0.03 });
      // pediment
      const ped = new THREE.Shape([new THREE.Vector2(-9.8, 0), new THREE.Vector2(9.8, 0), new THREE.Vector2(0, 3.2)]);
      k.add(new THREE.ExtrudeGeometry(ped, { depth: 6.2, bevelEnabled: false }).translate(0, 0, -3.1), T(WHITE), 0, 13.15, fz + 3.2, { outline: 0.08 });
      k.text('MERIDIAN EXCHANGE', 0, 11.9, fz + 6.42, 0, 15, { fg: '#2ec4ff', bg: '#0d1a33', back: false, off: 0.03 });
      // doors: bronze frame, four glass leaves, lit transom
      k.box(9.5, 7.4, 0.4, T(0x8a5a3a), 0, 1.6, fz + 0.15, { outline: 0.04 });
      for (let i = 0; i < 4; i++) k.box(2.0, 5.6, 0.2, G(0xbfe9ff), -3.3 + i * 2.2, 1.9, fz + 0.4, { outline: 0 });
      for (let i = 0; i < 5; i++) k.box(0.18, 5.8, 0.25, T(0x8a5a3a), -4.4 + i * 2.2, 1.8, fz + 0.45, { outline: 0 });
      k.box(9.0, 1.0, 0.2, G(WARM), 0, 7.7, fz + 0.4, { outline: 0 });
      // banners on poles, lamps at the foot of the steps
      for (const sx of [-1, 1]) {
        k.cyl(0.12, 0.14, 12, 6, T(DARK), sx * 11.5, 0, fz + 6, { outline: 0.02 });
        k.box(2.2, 6, 0.1, T(blue), sx * 11.5 + sx * 1.15, 5.4, fz + 6, { outline: 0.03 });
        k.box(2.2, 0.6, 0.12, T(YEL), sx * 11.5 + sx * 1.15, 6.4, fz + 6, { outline: 0 });
      }
      k.at();
      k.lamp(-11, TZ + fz + 10.5, 6); k.lamp(11, TZ + fz + 10.5, 6);
    }
    // chairwoman (story.buildLeaders) at the foot of the steps, off the door line, facing the fountain (her ballot stand 5.5 m
    // ahead stays clear of the basin)
    loc.leaderSpot = { x: 9.5, z: 6, yaw: Math.atan2(-9.5, 14) };
    const crown = part(blue, (q) => {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        q.box(4.5, 2.2, 0.3, T(0x1b3a8f), Math.sin(a) * 4.6, 0, Math.cos(a) * 4.6, { ry: a, outline: 0.04 });
        q.box(4.2, 1.6, 0.1, G(blue), Math.sin(a) * 4.78, 0.3, Math.cos(a) * 4.78, { ry: a, outline: 0 });
      }
    });
    crown.userData.spin = 0.4;
    crown.scale.setScalar(1.5);
    k.dyn(crown, 0, y + 3.6, TZ);
    // motor pool by the south-west ring road, bays facing it (a service road runs from the right-hand bay to the ring, traffic.js)
    const GA = GARAGE_AT;
    garage(k, GA.x, GA.z, GA.yaw, [true, false, true], 'main');
    loc.garage = { ...GA, bay: 2 }; // rovers exit this bay (open, unobstructed)
    // keep traffic pads and defence pylons off the compound (61 by 45 m, centred 3 m right of the hall's and 5.5 m behind)
    (loc.keep ||= []).push({ x: GA.x + 3 * Math.cos(GA.yaw) - 5.5 * Math.sin(GA.yaw), z: GA.z - 3 * Math.sin(GA.yaw) - 5.5 * Math.cos(GA.yaw), r: 36 });
    // container yard: 70 x 30 slab, gantry rails along the long edges, three rows of land-train container stacks (cargo.py) in
    // freight liveries, a north lane for the gantry's set-downs, the gantry running the length
    const yx = 0, yz = -97;
    k.at(yx, yz);
    k.box(70, 0.3, 30, T(0x6b6880), 0, 0, 0, { outline: 0.04 });
    for (const s of [-1, 1]) {
      k.box(70, 0.25, 0.5, T(STEEL), 0, 0.3, s * 15, { outline: 0 });
      for (let x = -33; x <= 33; x += 3) k.box(0.5, 0.12, 1.6, T(DARK), x, 0.3, s * 15, { outline: 0 });
      for (const bx of [-34.2, 34.2]) k.box(0.6, 1.1, 1.2, T(YEL), bx, 0.3, s * 15, { outline: 0.03 });
    }
    const freight = ['meridian', 'kepler', 'spacecom', 'vostok'];
    for (let i = 0; i < 18; i++) {
      const col = i % 6, row = Math.floor(i / 6);
      if (i === 4 || i === 13) continue; // two empty bays
      const cx = -26 + col * 9.5, cz = -8.5 + row * 7;
      cargoStack(k, cx, cz, 1 + ((i * 7 + row) % 3), [freight[(i + row) % 4], freight[(i * 3 + 1) % 4], freight[(i + 2) % 4]], Math.PI / 2, 0.3);
    }
    k.at();
    gantryCrane(k, yx, yz, YEL, { speed: 1 / 70, phase: 0.3, travel: 24, lane: 10, faction: 'meridian' });
    // yard, plaza and avenue have no colliders, so keep traffic pads, the ring stop and defence pylons off them (traffic.js keepouts,
    // world.js defensePylons); the yard's radius leaves the turret at (25, -122) in place
    (loc.keep ||= []).push({ x: yx, z: yz, r: 30 }, { x: 0, z: 34, r: 14 }, ...[56, 82, 108, 134].map((z) => ({ x: 0, z, r: 16 })));
    // two tower cranes over the yard
    towerCrane(k, -54, -72, 34, 30, YEL, { speed: 0.09, phase: 0 });
    towerCrane(k, 62, -78, 34, 30, YEL, { speed: 0.11, phase: 2.2 });
    // lab dome west of the avenue, trade hall east, both facing it
    habDome(k, -58, 40, 22, 0x9be7ff, { door: Math.PI / 2, trim: blue });
    tradeHall(k, 64, 24, 24, 56, blue);
    // plaza well out from the steps for the fountain: paving, the casino's fountain with a Meridian-blue dollar on top, benches, lamps
    k.at(0, 34);
    k.cyl(12, 12.4, 0.25, 32, T(0xd8d4e8), 0, 0, 0, { outline: 0.04 });
    k.ring(12.2, 0.15, T(blue), 0, 0.25, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      k.box(2.6, 0.5, 0.8, T(0x8a5a3a), Math.cos(a) * 11, 0.5, Math.sin(a) * 11, { ry: -a + Math.PI / 2, outline: 0.03 });
    }
    k.at();
    fountain(k, 0, 34, { top: 'dollar', accent: blue });
    k.lamp(16, 34, 8); k.lamp(-16, 34, 8);
    // avenue: a traffic road from the plaza to the gate (traffic.js pavedStrip lays bed, ruts and berms, blending under the paving
    // and past the arch); paired lamps and banners (the flags between are the world's)
    {
      loc.paved = [{ x0: 0, z0: 44, x1: 0, z1: 150 }];
      for (const z of [50, 90, 130]) { k.lamp(20, z, 8); k.lamp(-20, z, 8); }
      for (const z of [70, 130]) for (const sx of [-1, 1]) {
        k.cyl(0.12, 0.14, 12, 6, T(DARK), sx * 20, 0, z + 4, { outline: 0.02 });
        k.box(0.1, 6, 2.2, T(blue), sx * 20, 5.4, z + 4 + 1.15, { outline: 0.03 });
        k.box(0.12, 0.6, 2.2, T(YEL), sx * 20, 6.4, z + 4 + 1.15, { outline: 0 });
      }
    }
    // gate arch: two pylons and a beam with the name on both sides
    {
      const az = 140;
      for (const sx of [-1, 1]) {
        k.box(2.4, 11, 2.4, T(WHITE), sx * 14.5, 0, az, { outline: 0.1 });
        k.box(2.8, 0.5, 2.8, T(blue), sx * 14.5, 11, az, { outline: 0.03 });
        k.solid(1.3, 5.75, 1.3, sx * 14.5, az);
      }
      k.box(32, 2.2, 2.6, T(WHITE), 0, 11.5, az, { outline: 0.1 });
      k.box(32.2, 0.4, 2.8, T(blue), 0, 13.7, az, { outline: 0.03 });
      for (const s of [1, -1]) k.text('MERIDIAN EXCHANGE', 0, 12.6, az + s * 1.33, s > 0 ? 0 : Math.PI, 20, { fg: '#2ec4ff', bg: '#0d1a33', back: false, off: 0.03 });
      k.blinker(0, 14.4, az, 0xff2a4a, 0.4);
    }
    floodMast(k, 40, -124, 14); floodMast(k, -44, -118, 14);
    // spare landing pads in the north corners (traffic keeps the ones its flights use and lays the freighter's own clear of both)
    for (const sx of [-1, 1]) world.pad(loc, sx * 96, 96, 14, 0x2ec4ff, true);
    for (const sx of [-1, 1]) world.flag(loc, sx * 18, 110, [0x2ec4ff, 0xffffff, 0x2ec4ff], 20);
  });
}

// outline-only shell for the gored shapes (draws nothing; only its ink hull shows)
let _inkShell = null;
const inkShell = () => (_inkShell ||= new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));

// =============================================================================================
// Dr. Zbornak's lab exterior (the walk-in hall is world.buildLab): ribbed walls, fake windows, a striped doorway under a lit
// canopy, spinning roof fans, a Tesla coil, a pulsing reactor flue, gas racks, barrels, a generator, a giant specimen jar and a
// holding-pen yard.
// =============================================================================================
export function dressLab(world, loc, { W, D, H }) {
  settle(world, loc, 6607, (k) => {
    const lime = 0x7dff3a, pink = 0xff2e88;
    // pilasters, plinth, fake windows
    for (const [x0, x1, z, rot] of [[-W, W, -D - 1, Math.PI], [-W, -4, D + 1, 0], [4, W, D + 1, 0]]) {
      for (let x = x0; x <= x1 + 0.01; x += 6) k.box(1.2, H + 0.4, 0.6, T(0xc9c4d8), x, 0, z + (rot ? -0.3 : 0.3), { outline: 0.05 });
      k.box(x1 - x0 + 2, 1.2, 0.8, T(PANEL), (x0 + x1) / 2, 0, z + (rot ? -0.4 : 0.4), { outline: 0.04 });
      for (let x = x0 + 3; x < x1 - 1; x += 6) {
        k.box(3.2, 2.2, 0.2, G(lime), x, H * 0.55, z + (rot ? -0.15 : 0.15), { outline: 0 });
        k.box(3.6, 0.3, 0.5, T(DARK), x, H * 0.55 + 2.25, z + (rot ? -0.3 : 0.3), { outline: 0 });
      }
    }
    for (const sx of [-1, 1]) {
      for (let z = -D; z <= D + 0.01; z += 8) k.box(0.6, H + 0.4, 1.2, T(0xc9c4d8), sx * (W + 1.3), 0, z, { outline: 0.05 });
      k.box(0.8, 1.2, D * 2 + 2, T(PANEL), sx * (W + 1.4), 0, 0, { outline: 0.04 });
      for (const z of [-8, 0, 8]) k.box(0.2, 2.2, 3.2, G(lime), sx * (W + 1.15), H * 0.55, z, { outline: 0 });
      // conduits up the side walls
      k.beam([sx * (W + 1.5), 0.4, -D + 2], [sx * (W + 1.5), H + 1, -D + 2], 0.3, T(LIGHT), { outline: 0.03 });
      k.beam([sx * (W + 1.5), 0.4, D - 3], [sx * (W + 1.5), H + 1, D - 3], 0.3, T(0x9be7ff), { outline: 0.03 });
    }
    // doorway: striped frame, lit canopy, mat, two beacons
    for (const sx of [-1, 1]) {
      k.box(1, H - 4, 1.2, T(YEL), sx * 4.4, 0, D + 1.2, { outline: 0.05 });
      for (let y = 1; y < H - 4; y += 2) k.box(1.04, 0.8, 1.24, T(DARK), sx * 4.4, y, D + 1.2, { rz: 0.5, outline: 0 });
      k.blinker(sx * 4.4, H - 3.2, D + 1.9, 0xff2a4a, 0.35);
    }
    k.box(10, 0.6, 5, T(DARK), 0, H - 4.6, D + 3.2, { outline: 0.05 });
    k.box(10.2, 0.25, 5.2, T(lime), 0, H - 4.75, D + 3.2, { outline: 0 });
    for (const sx of [-1, 1]) k.beam([sx * 4.6, 0, D + 5.4], [sx * 4.6, H - 4.6, D + 5.4], 0.12, T(DARK), { outline: 0.02 });
    for (const sx of [-3, 0, 3]) k.box(1.2, 0.15, 0.6, G(WARM), sx, H - 4.85, D + 4.2, { outline: 0 });
    k.box(7, 0.06, 4, T(0x3a2a4a), 0, 0, D + 3, { outline: 0 });
    // roof: parapet, two fans, vent stacks, reactor flue, Tesla coil
    const roofY = H + 1.5;
    for (const [w, d, x, z] of [[W * 2 + 2.6, 0.6, 0, D + 1.2], [W * 2 + 2.6, 0.6, 0, -D - 1.2], [0.6, D * 2 + 2.6, W + 1.2, 0], [0.6, D * 2 + 2.6, -W - 1.2, 0]]) k.box(w, 1, d, T(PANEL), x, roofY, z, { outline: 0.04 });
    for (const [fx, fz] of [[12, -8], [12, 6]]) {
      k.cyl(3.2, 3.4, 1.6, 18, T(LIGHT), fx, roofY, fz, { outline: 0.06 });
      k.ring(3.1, 0.15, T(DARK), fx, roofY + 1.6, fz);
      const fan = part(DARK, (q) => {
        q.cyl(0.6, 0.6, 0.4, 10, T(DARK), 0, 0, 0, { outline: 0.02 });
        for (let i = 0; i < 5; i++) q.add(new THREE.BoxGeometry(0.9, 0.08, 2.6), T(STEEL), Math.sin((i / 5) * TAU) * 1.5, 0.2, Math.cos((i / 5) * TAU) * 1.5, { ry: (i / 5) * TAU, rz: 0.35, outline: 0 });
      });
      fan.userData.spin = 6;
      k.dyn(fan, fx, roofY + 1.2, fz);
      k.solid(3.3, 0.8, 3.3, fx, fz, 0, roofY);
    }
    for (const [vx, vz, h] of [[-14, -10, 5], [-17, -6, 3.5], [16, 13, 4]]) {
      k.cyl(0.6, 0.7, h, 10, T(STEEL), vx, roofY, vz, { outline: 0.04 });
      k.cyl(0.9, 0.9, 0.3, 10, T(DARK), vx, roofY + h, vz, { outline: 0.02 });
    }
    // reactor flue over the tube, glow ring breathing
    k.cyl(4.2, 4.6, 3, 20, T(DARK), -2, roofY, -3, { outline: 0.08 });
    k.cyl(3.4, 3.8, 2.2, 20, T(LIGHT), -2, roofY + 3, -3, { outline: 0.05 });
    const flue = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.3, 6, 28).rotateX(Math.PI / 2), glow(pink));
    flue.userData.tick = (o, dt, t) => { const s = 1 + Math.sin(t * 3.1) * 0.06 + (Math.sin(t * 17) > 0.97 ? 0.15 : 0); o.scale.set(s, 1, s); };
    k.dyn(flue, -2, roofY + 4.4, -3);
    k.solid(4.6, 2.6, 4.6, -2, -3, 0, roofY);
    // Tesla coil: ring stack under a glowing torus, flickering sparks
    const cx = -14, cz = 8;
    k.cyl(1.4, 1.8, 1, 12, T(DARK), cx, roofY, cz, { outline: 0.04 });
    k.cyl(0.6, 0.7, 7, 10, T(0xb87333), cx, roofY + 1, cz, { outline: 0.04 });
    for (let i = 0; i < 7; i++) k.ring(0.75, 0.08, T(0xd8a060), cx, roofY + 1.5 + i * 0.9, cz);
    k.add(new THREE.TorusGeometry(2, 0.6, 10, 24).rotateX(Math.PI / 2), T(LIGHT), cx, roofY + 8.4, cz, { outline: 0.05 });
    k.ring(2.05, 0.2, G(0xc77dff), cx, roofY + 8.4, cz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const spark = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 4.5, 4).translate(0, 2.25, 0), glow(0xe8d8ff));
      spark.userData.tick = (o, dt, t) => {
        o.visible = Math.sin(t * 23 + i * 2.1) * Math.sin(t * 7.3 + i) > 0.55;
        o.rotation.set(Math.sin(t * 31 + i) * 0.8, a, 1.2 + Math.sin(t * 19 + i * 3) * 0.4);
      };
      k.dyn(spark, cx + Math.cos(a) * 2, roofY + 8.4, cz + Math.sin(a) * 2);
    }
    k.solid(1.8, 4.5, 1.8, cx, cz, 0, roofY);
    // antenna mast, rooftop tank
    k.cyl(0.12, 0.2, 9, 6, T(DARK), 18, roofY, -13, { outline: 0.03 });
    for (let i = 1; i <= 3; i++) k.box(2.6 - i * 0.5, 0.1, 0.1, T(lime), 18, roofY + i * 2.4, -13, { ry: i, outline: 0 });
    k.blinker(18, roofY + 9.4, -13, 0xff2a4a, 0.35);
    k.cyl(2.2, 2.2, 3.2, 16, T(LIGHT), 6, roofY, -10, { outline: 0.06 });
    k.add(new THREE.SphereGeometry(2.2, 16, 6, 0, TAU, 0, Math.PI / 2), T(LIGHT), 6, roofY + 3.2, -10, { outline: 0.04 });
    k.ring(2.25, 0.15, G(lime), 6, roofY + 2.2, -10);
    k.solid(2.2, 2.6, 2.2, 6, -10, 0, roofY);
    // outside: gas rack, barrels, generator, cable spools
    k.at(W + 6, 4);
    k.box(3, 0.3, 8, T(DARK), 0, 0, 0, { outline: 0.03 });
    for (let i = 0; i < 6; i++) {
      k.cyl(0.4, 0.4, 2.4, 10, T([lime, pink, 0x2ec4ff][i % 3]), 0, 0.3, -2.8 + i * 1.1, { outline: 0.03 });
      k.ball(0.35, T(STEEL), 0, 2.8, -2.8 + i * 1.1, { outline: 0 });
    }
    k.box(0.2, 0.2, 8, T(YEL), 0.6, 1.8, 0, { outline: 0 });
    k.solid(1.5, 1.4, 4, 0, 0);
    k.at();
    for (const [x, z, c] of [[W + 5, -10, YEL], [W + 6.4, -11, lime], [W + 5.6, -12.4, YEL], [-W - 5, 12, lime], [-W - 6, 10.6, YEL]]) {
      k.cyl(0.6, 0.6, 1.5, 10, T(c), x, 0, z, { outline: 0.03 });
      k.ring(0.62, 0.06, T(DARK), x, 0.4, z); k.ring(0.62, 0.06, T(DARK), x, 1.1, z);
    }
    k.at(-W - 7, -6, Math.PI / 2);
    k.box(6, 3, 3.4, T(0x6b6880), 0, 0, 0, { outline: 0.06 });
    for (let i = 0; i < 5; i++) k.box(0.15, 2, 3.5, T(DARK), -2.2 + i * 1.1, 0.5, 0, { outline: 0 });
    k.cyl(0.25, 0.3, 2.2, 8, T(STEEL), 2, 3, 1, { outline: 0.03 });
    k.box(0.8, 0.4, 0.1, G(lime), -2.4, 2.2, 1.75, { outline: 0 });
    k.solid(3.1, 1.6, 1.8, 0, 0);
    k.at();
    for (const [x, z] of [[-W - 6, 4], [W + 7, 12]]) {
      k.add(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 14).rotateX(Math.PI / 2), T(0x9a6a3a), x, 1.2, z, { outline: 0.04 });
      k.add(new THREE.TorusGeometry(0.9, 0.25, 6, 12), T(0x2ec4ff), x, 1.2, z, { outline: 0 });
      k.hcyl(1.2, 1.4, x, z, 0, 1.2);
    }
    // giant specimen jar by the door: plinth, glass, glowing blob, brass lid
    const jx = 12, jz = D + 9;
    k.cyl(2.4, 2.8, 1.6, 16, T(PANEL), jx, 0, jz, { outline: 0.06 });
    k.cyl(2, 2, 5, 20, GLASS(0x9be7ff, 0.25), jx, 1.6, jz, { outline: 0 });
    k.cyl(2.2, 2.2, 0.8, 20, T(0xd8a060), jx, 6.6, jz, { outline: 0.05 });
    k.ball(0.5, G(lime), jx, 7.8, jz, { outline: 0 });
    k.column(2.6, 7.4, jx, jz);
    const blob = part(lime, (q) => {
      q.add(new THREE.IcosahedronGeometry(1.1, 1), G(lime), 0, 0, 0, { outline: 0 });
      for (let i = 0; i < 5; i++) q.add(new THREE.SphereGeometry(0.35, 8, 6), G(0xb8ff9e), Math.cos(i * 1.3) * 1.1, Math.sin(i * 2.1) * 0.8, Math.sin(i * 1.3) * 1.1, { outline: 0 });
      q.add(new THREE.SphereGeometry(0.28, 8, 6), T(0x111111), 0.5, 0.4, 0.9, { outline: 0 });
    });
    blob.userData.tick = (o, dt, t) => { o.position.y = 4.1 + Math.sin(t * 1.3) * 0.6; o.rotation.y += dt * 0.4; };
    k.dyn(blob, jx, 4.1, jz);
    // flat plaque proud of the round plinth so the text doesn't sink into the curve
    k.box(4.6, 1.3, 0.3, T(DARK), jx, 0.2, jz + 2.95, { outline: 0.05 });
    k.box(4.8, 0.14, 0.36, T(0xd8a060), jx, 1.5, jz + 2.95, { outline: 0 });
    k.text('SPECIMEN #1', jx, 1.12, jz + 3.1, 0, 2.6, { fg: '#7dff3a', bg: '#10241a', back: false, off: 0.02 });
    k.text('DO NOT TAP GLASS', jx, 0.62, jz + 3.1, 0, 3.6, { fg: '#ffd23f', bg: '#10241a', back: false, off: 0.02 });
    // pen terminal at the gate
    penTerminal(k, 26, 20, 0); // facing the pen
    // holding-pen yard: gravel pad, feeding trough, corner floodlights
    k.box(36, 0.12, 44, T(0x8a7a6a), 45, 0, 43, { outline: 0 });
    k.box(8, 1, 1.6, T(0x8a5a3a), 54, 0, 60, { outline: 0.04 });
    k.box(7.6, 0.2, 1.2, T(0x7dff6a), 54, 0.9, 60, { outline: 0 });
    for (const [x, z] of [[28, 64], [62, 64], [62, 22]]) {
      k.cyl(0.15, 0.2, 7, 6, T(DARK), x, 0, z, { outline: 0.03 });
      k.box(1, 0.6, 0.6, T(DARK), x, 7, z, { outline: 0.02 });
      k.box(0.8, 0.4, 0.1, G(0xfffbe0), x, 7.1, z + (z > 40 ? -0.32 : 0.32), { outline: 0 });
    }
  });
}

// =============================================================================================
// Dr. Zbornak's lab interior: gear along every wall (fume hood, glassware bench under a chalkboard, specimen tanks, cryo
// freezer, server bank, gas bottles, lockers, eyewash, cable trays) and the doctor's station: a dais, a waist-high workbench in
// front of him, a console bank behind.
// =============================================================================================
export function dressLabInside(world, loc, { W, D, H, docX, docZ }) {
  settle(world, loc, 6611, (k) => {
    const lime = 0x7dff3a, pink = 0xff2e88, cyan = 0x2ec4ff, vio = 0xc77dff;
    const IW = W - 1, ID = D - 1; // inner wall faces
    const liquid = [lime, pink, cyan, 0xffd23f, vio];
    // flasks and beakers at height y
    const glassware = (x0, x1, y, z, n, rr) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + ((i + 0.5) / n) * (x1 - x0), c = liquid[i % 5];
        if (i % 3 === 0) { k.cyl(0.18, 0.18, 0.55, 8, GLASS(0x9be7ff, 0.35), x, y, z, { outline: 0 }); k.cyl(0.16, 0.16, 0.3, 8, G(c), x, y, z, { outline: 0 }); }
        else if (i % 3 === 1) { k.ball(0.3, G(c), x, y + 0.3, z, { outline: 0.02 }); k.cyl(0.07, 0.07, 0.45, 6, GLASS(0x9be7ff, 0.4), x, y + 0.55, z, { outline: 0 }); }
        else { k.cyl(0.08, 0.3, 0.6, 8, G(c), x, y, z, { outline: 0.02 }); k.cyl(0.06, 0.06, 0.25, 6, T(DARK), x, y + 0.6, z, { outline: 0 }); }
      }
    };
    // --- back wall (z = -ID) ---
    // fume hood: cabinet, glass sash, roof duct
    k.box(5, 1.1, 2.2, T(LIGHT), -6.5, 0, -ID + 1.1, { outline: 0.05 });
    k.box(5, 2.6, 2.2, T(0xc9c4d8), -6.5, 1.1, -ID + 1.1, { outline: 0.05 });
    k.box(4.4, 1.6, 0.08, GLASS(0x9be7ff, 0.35), -6.5, 1.4, -ID + 2.22, { outline: 0 });
    k.box(4.6, 0.12, 0.2, T(DARK), -6.5, 3.0, -ID + 2.25, { outline: 0 });
    glassware(-8.4, -4.6, 1.12, -ID + 1.3, 5);
    k.cyl(0.7, 0.7, H - 3.7, 10, T(STEEL), -6.5, 3.7, -ID + 1.0, { outline: 0.03 });
    k.solid(2.5, 1.85, 1.1, -6.5, -ID + 1.1);
    // glassware bench under a chalkboard
    k.box(8, 1.0, 2, T(0x5b5870), 4, 0, -ID + 1, { outline: 0.05 });
    k.box(8.3, 0.15, 2.2, T(0x2a2540), 4, 1.0, -ID + 1, { outline: 0.03 });
    glassware(0.6, 7.4, 1.15, -ID + 1.2, 8);
    k.box(0.5, 0.9, 0.5, T(DARK), 6.8, 1.15, -ID + 0.6, { outline: 0.03 }); // microscope
    k.cyl(0.08, 0.08, 0.6, 6, T(STEEL), 6.8, 2.05, -ID + 0.75, { rx: 0.4, outline: 0 });
    k.box(8.4, 3.6, 0.15, T(0x1d2a22), 4, 3.4, -ID + 0.08, { outline: 0.05 });
    k.box(8.6, 0.2, 0.3, T(0x8a5a3a), 4, 3.3, -ID + 0.15, { outline: 0 });
    for (let i = 0; i < 9; i++) k.box(1.2 + (i * 37 % 5) * 0.4, 0.08, 0.04, T(0xe8f0e0), 0.6 + (i % 3) * 2.6 + (i * 13 % 4) * 0.2, 3.9 + Math.floor(i / 3) * 0.95, -ID + 0.17, { rz: ((i * 7) % 5 - 2) * 0.05, outline: 0 });
    k.add(new THREE.TorusGeometry(0.45, 0.05, 4, 16), T(0xe8f0e0), 6.6, 5.6, -ID + 0.17, { outline: 0 }); // circled answer
    k.solid(4, 0.6, 1, 4, -ID + 1);
    // corner pipe manifold with valve wheels and gauges
    for (const y of [2.2, 3.4, 4.6]) k.add(new THREE.CylinderGeometry(0.16, 0.16, 6, 8).rotateZ(Math.PI / 2), T(y === 3.4 ? 0xb87333 : STEEL), 14, y, -ID + 0.3, { outline: 0.02 });
    for (const x of [12, 14, 16]) {
      k.add(new THREE.TorusGeometry(0.35, 0.07, 4, 12), T(0xff2a4a), x, 3.4, -ID + 0.62, { outline: 0 });
      k.cyl(0.25, 0.25, 0.12, 12, T(WHITE), x + 0.8, 4.6, -ID + 0.5, { rx: Math.PI / 2, outline: 0.02 });
    }
    // cryo freezer: frosted window, cold glow at the seals
    k.box(2.6, 4.2, 1.8, T(WHITE), 19, 0, -ID + 0.95, { outline: 0.06 });
    k.box(1.6, 1.8, 0.08, GLASS(0xd8f4ff, 0.55), 19, 2, -ID + 1.88, { outline: 0 });
    k.box(2.62, 0.1, 1.82, G(0x9be7ff), 19, 3.9, -ID + 0.95, { outline: 0 });
    k.box(0.15, 0.9, 0.2, T(STEEL), 18, 1.6, -ID + 1.95, { outline: 0 });
    k.solid(1.3, 2.1, 0.9, 19, -ID + 0.95);
    // --- left wall (x = -IW): specimen tanks ---
    for (const [z, c] of [[-8.5, lime], [-5.5, pink], [7.5, cyan], [11, vio]]) {
      k.cyl(1.2, 1.3, 0.6, 14, T(DARK), -IW + 1.4, 0, z, { outline: 0.04 });
      k.cyl(1.05, 1.05, 4.2, 16, GLASS(c, 0.22), -IW + 1.4, 0.6, z, { outline: 0 });
      k.cyl(1.15, 1.15, 0.4, 14, T(STEEL), -IW + 1.4, 4.8, z, { outline: 0.03 });
      k.add(new THREE.IcosahedronGeometry(0.55, 0), G(c), -IW + 1.4, 2.6, z, { rx: z, ry: z * 2, outline: 0 });
      for (let i = 0; i < 3; i++) k.ball(0.1, G(0xffffff), -IW + 1.4 + Math.sin(i * 2 + z) * 0.4, 1.4 + i * 1.0, z + Math.cos(i * 2 + z) * 0.4, { outline: 0 });
      k.beam([-IW + 1.4, 5.2, z], [-IW + 0.2, H - 1, z], 0.08, T(DARK), { outline: 0 });
      k.column(1.3, 5.2, -IW + 1.4, z);
    }
    // high cable tray along the left wall
    k.box(0.6, 0.2, ID * 2 - 2, T(STEEL), -IW + 0.4, 7.5, 0, { outline: 0.02 });
    for (let i = 0; i < 4; i++) k.box(0.1, 0.12, ID * 2 - 2.4, T([0xff2a4a, lime, cyan, YEL][i]), -IW + 0.2 + i * 0.13, 7.7, 0, { outline: 0 });
    // --- right wall (x = +IW): server bank, gas bottles ---
    for (const z of [-11, -8.4]) {
      k.box(1.6, 5, 2.4, T(0x2a2540), IW - 0.9, 0, z, { outline: 0.05 });
      for (let i = 0; i < 9; i++) k.box(0.05, 0.12, 1.8, G(i % 3 === 0 ? 0xff2a4a : i % 2 ? lime : cyan), IW - 1.72, 0.6 + i * 0.48, z + ((i * 5) % 3 - 1) * 0.2, { outline: 0 });
      k.solid(0.8, 2.5, 1.2, IW - 0.9, z);
    }
    k.box(1, 0.3, 4.4, T(YEL), IW - 0.6, 2.2, 12, { outline: 0.02 });
    for (let i = 0; i < 4; i++) {
      k.cyl(0.36, 0.36, 2.6, 10, T([lime, pink, cyan, YEL][i]), IW - 0.7, 0, 10.4 + i * 1.05, { outline: 0.03 });
      k.ball(0.3, T(STEEL), IW - 0.7, 2.7, 10.4 + i * 1.05, { outline: 0 });
    }
    k.solid(0.6, 1.4, 2.3, IW - 0.7, 12);
    // --- front wall (z = +ID), either side of the door ---
    // lockers, a spare lab coat on a hook, eyewash station
    for (let i = 0; i < 5; i++) {
      k.box(1.1, 3.6, 1.2, T(i % 2 ? 0x5b5870 : 0x6b6880), -16 + i * 1.15, 0, ID - 0.65, { outline: 0.03 });
      k.box(0.5, 0.06, 0.04, T(DARK), -16 + i * 1.15, 3.0, ID - 1.27, { outline: 0 });
    }
    k.solid(2.9, 1.8, 0.6, -13.7, ID - 0.65);
    k.box(1.2, 2.2, 0.15, T(WHITE), -9.5, 1.8, ID - 0.2, { rz: 0.05, outline: 0.03 });
    k.box(0.12, 0.12, 0.4, T(DARK), -9.5, 4.0, ID - 0.25, { outline: 0 });
    k.box(1.6, 1.6, 0.4, T(0x3a8a4a), 7.5, 1.2, ID - 0.25, { outline: 0.03 });
    k.box(1.1, 0.12, 0.1, T(WHITE), 7.5, 2.0, ID - 0.48, { outline: 0 });
    k.box(0.12, 1.1, 0.1, T(WHITE), 7.5, 1.5, ID - 0.48, { outline: 0 });
    k.text('EYEWASH', 7.5, 3.2, ID - 0.05, Math.PI, 1.6, { fg: '#7dff3a', bg: '#10241a', back: false, off: 0.02 });
    k.text('EMPLOYEE OF THE MONTH: ZBORNAK', 14, 5.2, ID - 0.05, Math.PI, 7, { fg: '#ffd23f', bg: '#241a3a', back: false, off: 0.02 });
    // --- the doctor's station ---
    k.box(10, 0.3, 8, T(0x3a3550), docX, 0, docZ - 0.6, { outline: 0.04 });
    k.box(10.2, 0.08, 8.2, G(lime), docX, 0.3, docZ - 0.6, { outline: 0 });
    // workbench in front of him (+z), with a short return on his left
    k.box(6.4, 1.15, 1.5, T(cyan), docX, 0, docZ + 2.1, { outline: 0.06 });
    k.box(6.7, 0.14, 1.8, T(0x2a2540), docX, 1.15, docZ + 2.1, { outline: 0.03 });
    k.box(1.5, 1.15, 3.4, T(cyan), docX - 3.95, 0, docZ + 0.35, { outline: 0.06 });
    k.box(1.8, 0.14, 3.7, T(0x2a2540), docX - 3.95, 1.15, docZ + 0.35, { outline: 0.03 });
    k.box(6, 0.4, 0.06, G(lime), docX, 0.6, docZ + 2.86, { outline: 0 });
    // on it: retort, microscope, tablet, papers, mug
    k.ball(0.35, G(pink), docX - 2, 1.65, docZ + 2.1, { outline: 0.02 });
    k.beam([docX - 2, 1.9, docZ + 2.1], [docX - 1.2, 2.3, docZ + 2.3], 0.06, GLASS(0x9be7ff, 0.5), { outline: 0 });
    k.box(0.5, 0.8, 0.5, T(DARK), docX + 1.8, 1.29, docZ + 1.9, { outline: 0.03 });
    k.cyl(0.08, 0.08, 0.5, 6, T(STEEL), docX + 1.8, 2.05, docZ + 2.05, { rx: 0.45, outline: 0 });
    k.box(0.9, 0.06, 0.6, G(cyan), docX + 0.3, 1.3, docZ + 2.2, { ry: 0.2, outline: 0.02 });
    k.box(0.8, 0.25, 0.6, T(WHITE), docX - 0.8, 1.29, docZ + 1.8, { ry: -0.15, outline: 0.02 });
    k.cyl(0.13, 0.13, 0.25, 8, T(0xff7a1a), docX + 2.7, 1.29, docZ + 2.4, { outline: 0.02 });
    k.solid(3.2, 0.65, 0.75, docX, docZ + 2.1);
    k.solid(0.75, 0.65, 1.7, docX - 3.95, docZ + 0.35);
    // console bank behind: three screens, a tall dial rack at the end
    k.box(7, 1.1, 1.4, T(0x2a2540), docX, 0.3, docZ - 3.4, { outline: 0.05 });
    for (const [dx, c, ry] of [[-2.3, lime, 0.25], [0, cyan, 0], [2.3, pink, -0.25]]) {
      k.box(2, 1.3, 0.2, T(DARK), docX + dx, 1.5, docZ - 3.8, { ry, outline: 0.04 });
      k.box(1.7, 1.0, 0.05, G(c), docX + dx, 1.65, docZ - 3.68, { ry, outline: 0 });
    }
    k.box(1.4, 4.2, 1.4, T(0x5b5870), docX + 4.6, 0.3, docZ - 3.4, { outline: 0.05 });
    for (let i = 0; i < 6; i++) k.cyl(0.18, 0.18, 0.08, 10, T(WHITE), docX + 4.6 + ((i % 2) - 0.5) * 0.6, 1.4 + Math.floor(i / 2) * 0.9, docZ - 2.68, { rx: Math.PI / 2, outline: 0.02 });
    k.solid(3.5, 0.7, 0.7, docX, docZ - 3.4);
    k.solid(0.7, 2.25, 0.7, docX + 4.6, docZ - 3.4);
  });
}

// Holding-pen terminal kiosk: step, console with sloped keypad and screen, card slot, lit canopy, turning holo ring.
export function penTerminal(k, x, z, yaw) {
  const lime = 0x7dff3a;
  k.at(x, z, yaw);
  k.box(3.6, 0.3, 2.8, T(CONC), 0, 0, 0.2, { outline: 0.04 });
  k.box(2.4, 2.6, 1.0, T(0x2a2540), 0, 0.3, -0.4, { outline: 0.07 });
  k.add(new THREE.BoxGeometry(2.4, 0.3, 1.0), T(0x2ec4ff), 0, 1.35, 0.45, { rx: 0.4, outline: 0.04 });
  for (let i = 0; i < 6; i++) k.box(0.22, 0.06, 0.18, G([lime, 0x2ee6ff, 0xffd23f][i % 3]), -0.7 + (i % 3) * 0.7, 1.52, 0.35 + Math.floor(i / 3) * 0.28, { rx: 0.4, outline: 0 });
  k.box(2.6, 0.25, 1.2, T(lime), 0, 2.9, -0.4, { outline: 0.03 });
  k.box(0.08, 0.5, 0.3, T(DARK), 1.22, 1.6, 0.0, { outline: 0 }); // card slot
  k.box(0.04, 0.3, 0.2, G(0xff2a4a), 1.27, 1.7, 0.0, { outline: 0 });
  for (const s of [-1, 1]) k.beam([s * 1.6, 0.3, 1.2], [s * 1.6, 3.9, 1.2], 0.07, T(STEEL), { outline: 0.02 });
  k.box(3.8, 0.2, 2.4, T(0x3a3550), 0, 3.9, 0.3, { outline: 0.04 });
  k.box(3.4, 0.08, 0.2, G(0xfff6a8), 0, 3.85, 1.3, { outline: 0 });
  k.solid(1.2, 1.5, 0.7, 0, -0.2);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1), new THREE.MeshBasicMaterial({ map: screenTex(['> CHIMERA HOLDING PEN', '  RESIDENTS: SEE LIST', '', '* F  OPEN THE PEN', '! DO NOT FEED AFTER', '  MIDNIGHT (ANY)'], { head: 'PEN-TERM', hc: '#7dff3a' }) }));
  k.dyn(scr, 0, 2.25, 0.11);
  const holo = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24), glow(lime));
  holo.add(ring);
  holo.userData.tick = (o, dt, t) => { ring.rotation.y += dt * 1.5; o.position.y = 4.6 + Math.sin(t * 2) * 0.1; };
  k.dyn(holo, 0, 4.6, 0.3);
  k.at();
}

// =============================================================================================
// The Monolith's survey dig (the slab is world.buildMonolith): berm, floodlight tripods, scaffold, tents and generator, a laser
// theodolite, glyph lines in the dust, black shards circling it.
// =============================================================================================
export function dressMonolith(world, loc) {
  settle(world, loc, 7703, (k) => {
    const vio = 0xc77dff;
    // low ring berm, open on the approach side
    for (let i = 0; i < 38; i++) {
      const a = (i / 44) * TAU + 0.5;
      k.add(new THREE.SphereGeometry(3.2, 8, 5, 0, TAU, 0, Math.PI / 2), T(0x9a92a8), Math.cos(a) * 36, -0.7, Math.sin(a) * 36, { outline: 0.06 });
      k.sphere(3.2, Math.cos(a) * 36, -0.7, Math.sin(a) * 36);
    }
    // radiating glyph lines and two carved rings
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.13;
      k.box(0.3, 0.04, 12 + (i % 3) * 4, G(vio), Math.cos(a) * 13, 0.03, Math.sin(a) * 13, { ry: -a + Math.PI / 2, outline: 0 });
    }
    k.ring(8.5, 0.15, G(vio), 0, 0.05, 0);
    k.ring(14, 0.1, G(vio), 0, 0.05, 0);
    // floodlight tripods aimed at the slab
    for (const a of [0.6, 1.9, 3.1, 4.2, 5.3]) {
      const x = Math.cos(a) * 22, z = Math.sin(a) * 22;
      k.at(x, z, Math.atan2(-x, -z));
      for (let j = 0; j < 3; j++) { const b = (j / 3) * TAU; k.beam([Math.sin(b) * 1.8, 0, Math.cos(b) * 1.8], [0, 7, 0], 0.08, T(DARK), { outline: 0.02 }); }
      k.box(1.8, 1.2, 1.1, T(LIGHT), 0, 7, 0, { rx: -0.3, outline: 0.04 });
      k.box(1.6, 1.0, 0.1, G(0xfffbe0), 0, 7.15, 0.57, { rx: -0.3, outline: 0 });
      k.at();
    }
    // scaffold tower beside the slab, platforms at half and full height
    k.at(7.6, -3.4);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([sx * 1.7, 0, sz * 1.7], [sx * 1.7, 36, sz * 1.7], 0.11, T(YEL), { outline: 0.02 });
    for (let y = 4; y <= 36; y += 4) {
      for (const [a, b] of [[[-1.7, -1.7], [1.7, -1.7]], [[1.7, -1.7], [1.7, 1.7]], [[1.7, 1.7], [-1.7, 1.7]], [[-1.7, 1.7], [-1.7, -1.7]]]) k.beam([a[0], y, a[1]], [b[0], y, b[1]], 0.07, T(YEL), { outline: 0 });
      k.beam([-1.7, y - 4, -1.7], [1.7, y, -1.7], 0.05, T(DARK), { outline: 0 });
    }
    k.box(3.8, 0.2, 3.8, T(0x8a5a3a), 0, 36, 0, { outline: 0.03 });
    k.box(3.8, 0.2, 3.8, T(0x8a5a3a), 0, 18, 0, { outline: 0.03 });
    k.solid(1.9, 18.2, 1.9, 0, 0);
    k.at();
    // camp: two tents, site cabin, generator, crates, a theodolite beaming at the slab
    for (const [x, z, yaw, c] of [[-24, 13, 0.8, 0xff9f1c], [14, 27, 2.6, 0x2ec4ff]]) {
      k.at(x, z, yaw);
      k.add(prism(7, 5, 3.6), T(c), 0, 0, 0, { outline: 0.08 });
      k.box(0.1, 2.4, 1.8, T(0x2a2540), 3.55, 0, 0, { outline: 0 });
      k.box(0.4, 0.2, 0.1, G(WARM), 3.56, 2.6, 0, { outline: 0 });
      k.solid(3.5, 1.8, 2.5, 0, 0);
      k.at();
    }
    // site cabin with lit window, antenna, instrument bench
    k.at(-26, -14, 0.5 + Math.PI / 2);
    k.box(8, 3.2, 5, T(0xd8d4e8), 0, 0, 0, { outline: 0.08 });
    k.box(8.4, 0.3, 5.4, T(vio), 0, 3.2, 0, { outline: 0.03 });
    k.box(2.6, 1.0, 0.1, G(WARM), -1.5, 1.6, 2.52, { outline: 0 });
    k.box(1.1, 2.3, 0.1, T(0x2a2540), 2.2, 0, 2.52, { outline: 0 });
    k.beam([3, 3.5, -1.5], [3, 7.5, -1.5], 0.06, T(DARK), { outline: 0 });
    k.box(3.2, 0.9, 1.0, T(0x5b5870), -1.5, 0, 3.6, { outline: 0.03 });
    for (let j = 0; j < 3; j++) k.box(0.6, 0.5, 0.5, G([0x2ee6ff, vio, 0x7dff6a][j]), -2.6 + j * 1.1, 0.9, 3.6, { outline: 0 });
    k.solid(4, 1.6, 2.5, 0, 0);
    k.solid(1.6, 0.7, 0.5, -1.5, 3.6); // instrument bench
    k.at();
    for (const [x, z, c] of [[-15, 22, 0x9a6a3a], [-13.6, 20.2, 0x4f5a42], [-16.6, 20.6, 0x9a6a3a], [16, -22, 0x4f5a42], [17.4, -20.5, 0x9a6a3a]]) crate(k, x, 0, z, 1.1, c, x);
    k.at(-29, -3, 0.4);
    k.box(2.4, 1.6, 1.4, T(YEL), 0, 0, 0, { outline: 0.05 });
    k.cyl(0.15, 0.2, 1, 6, T(DARK), 0.7, 1.6, 0, { outline: 0.02 });
    k.solid(1.2, 0.8, 0.7, 0, 0);
    k.at();
    // survey stakes and tape
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2, b = ((i + 1) / 10) * TAU + 0.2, r = 18;
      k.cyl(0.08, 0.08, 1.2, 4, T(0xff9f1c), Math.cos(a) * r, 0, Math.sin(a) * r, { outline: 0.02 });
      if (i % 3 !== 2) k.beam([Math.cos(a) * r, 1.0, Math.sin(a) * r], [Math.cos(b) * r, 1.0, Math.sin(b) * r], 0.03, T(YEL), { outline: 0, seg: 3 });
    }
    k.at(18, 15);
    for (let j = 0; j < 3; j++) { const b = (j / 3) * TAU; k.beam([Math.sin(b) * 0.8, 0, Math.cos(b) * 0.8], [0, 1.6, 0], 0.05, T(DARK), { outline: 0 }); }
    k.box(0.6, 0.5, 0.8, T(0xff9f1c), 0, 1.6, 0, { outline: 0.03 });
    k.at();
    const beamLen = Math.hypot(18, 15) - 1.6;
    k.add(new THREE.CylinderGeometry(0.04, 0.04, beamLen, 4).rotateZ(Math.PI / 2), G(0xff2a4a), 9, 1.85, 7.5, { ry: Math.atan2(15, -18) + Math.PI, outline: 0 });
    k.at(-5, 33, Math.PI);
    k.sign('DO NOT TOUCH. SERIOUSLY.', 0, 0, { w: 10, y: 3, fg: '#c77dff' });
    k.at();
    // violet-edged black shards circling at varied heights and speeds
    for (let i = 0; i < 9; i++) {
      const shard = new THREE.Group();
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.7 + (i % 3) * 0.4, 0), new THREE.MeshBasicMaterial({ color: 0x050308 }));
      s.scale.set(0.6, 1.8, 0.6);
      const edge = new THREE.Mesh(s.geometry, new THREE.MeshBasicMaterial({ color: vio, side: THREE.BackSide }));
      edge.scale.setScalar(1.15);
      s.add(edge);
      shard.add(s);
      const r = 8.5 + (i % 4) * 2.2, h = 5 + i * 3.3, w = (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.08), ph = i * 0.7;
      shard.userData.tick = (o, dt, t) => {
        const a = ph + t * w;
        s.position.set(Math.cos(a) * r, h + Math.sin(t * 0.8 + i) * 0.8, Math.sin(a) * r);
        s.rotation.set(t * 0.5 + i, t * 0.7, 0);
      };
      k.dyn(shard, 0, 0, 0);
    }
  });
}

// Ribbed connector tunnel between two ground points (radius r), lit window strips.
function tunnel(world, loc, k, ax, az, bx, bz, r = 1.6) {
  const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
  k.at((ax + bx) / 2, (az + bz) / 2, yaw);
  k.add(new THREE.CylinderGeometry(r, r, len, 14).rotateX(Math.PI / 2), T(WHITE), 0, r * 0.8, 0, { outline: 0.1 });
  for (let t = -len / 2 + 1.5; t < len / 2 - 1; t += 3) k.add(new THREE.TorusGeometry(r + 0.06, 0.14, 4, 16), T(PANEL), 0, r * 0.8, t, { outline: 0 });
  for (const s of [-1, 1]) k.box(0.1, 0.4, len - 1, G(WARM), s * r * 0.93, r * 1.15, 0, { rz: s * 0.5, outline: 0 });
  k.box(r * 1.6, 0.3, len, T(PANEL), 0, 0, 0, { outline: 0 });
  k.at();
  world.col(loc, { type: 'box', x: (ax + bx) / 2, y: r * 0.8, z: (az + bz) / 2, hx: r, hy: r, hz: len / 2, yaw });
}

// free spot for radius r on the ring rmin..rmax, clear of the circles in occ
function freeSpot(occ, r, rmin, rmax, rr, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const a = rr() * TAU, d = rmin + rr() * (rmax - rmin);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (occ.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > r + or + 3)) { occ.push([x, z, r]); return [x, z]; }
  }
  return null;
}

// Playground on a rubber pad (local frame at x, z): merry-go-round, swings, slide, climbing dome, sandpit.
export function playground(world, loc, k, x, z, yaw = 0) {
  const pk = 0xff7ad9, cy = 0x2ec4ff;
  k.at(x, z, yaw);
  k.cyl(13, 13.2, 0.15, 28, T(0x3ad1a0), 0, 0, 0, { outline: 0.04 });
  k.ring(13.05, 0.15, T(YEL), 0, 0.15, 0);
  // swings: A-frame, three swinging seats
  for (const s of [-1, 1]) for (const t of [-1, 1]) k.beam([s * 4.5, 0, t * 1.6 - 5], [s * 4.5, 4.5, -5], 0.12, T(cy), { outline: 0.03 });
  k.beam([-4.7, 4.5, -5], [4.7, 4.5, -5], 0.14, T(cy), { outline: 0.03 });
  for (const sx of [-1, 1]) k.solid(0.3, 2.25, 1.75, sx * 4.5, -5);
  k.at();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (let i = 0; i < 3; i++) {
    const sw = part(pk, (q) => {
      for (const t of [-0.4, 0.4]) q.beam([t, 0, 0], [t, -3.4, 0], 0.025, T(DARK), { outline: 0 });
      q.box(1, 0.12, 0.45, T([pk, YEL, 0x7dff6a][i]), 0, -3.5, 0, { outline: 0.02 });
    });
    sw.userData.tick = (o, dt, t) => { o.rotation.x = Math.sin(t * 1.6 + i * 2) * 0.45; };
    const [px, pz] = L(-3 + i * 3, -5);
    k.at(px, pz, yaw);
    k.dyn(sw, 0, 4.5, 0);
    k.at();
  }
  k.at(x, z, yaw);
  // slide: roofed ladder tower and chute
  k.box(2, 3, 2, T(YEL), 5, 0, 4, { outline: 0.05 });
  k.add(new THREE.ConeGeometry(1.7, 1.4, 4), T(pk), 5, 3.7, 4, { ry: Math.PI / 4, outline: 0.04 });
  k.add(new THREE.BoxGeometry(1.2, 0.2, 5.4), T(cy), 5, 1.6, 7.6, { rx: 0.55, outline: 0.04 });
  for (const t of [-0.5, 0.5]) k.add(new THREE.BoxGeometry(0.12, 0.5, 5.4), T(cy), 5 + t, 1.85, 7.6, { rx: 0.55, outline: 0 });
  // climbing dome
  k.add(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshBasicMaterial({ color: 0x7dff6a, wireframe: true }), -6, 0.4, 5, { outline: 0 });
  k.add(new THREE.SphereGeometry(2.62, 12, 6, 0, TAU, 0, Math.PI / 2), inkShell(), -6, 0.2, 5, { outline: 0.05 });
  // sandpit
  k.cyl(2.6, 2.7, 0.35, 16, T(0xe8c98a), 1, 0, 9, { outline: 0.03 });
  k.ring(2.7, 0.15, T(0x8a5a3a), 1, 0.35, 9);
  k.solid(1, 1.5, 1, 5, 4);
  k.solid(0.6, 0.9, 2.5, 5, 7.6, 0, 0.2); // chute
  k.sphere(2.6, -6, 0.4, 5); // climbing dome
  k.at();
  // merry-go-round
  const [mx, mz] = L(0, 0);
  k.at(mx, mz);
  k.cyl(0.4, 0.5, 0.6, 10, T(DARK), 0, 0, 0, { outline: 0.03 });
  k.column(2.6, 0.85, 0, 0);
  k.column(0.6, 1.8, 0, 0);
  k.at();
  const mgr = part(pk, (q) => {
    q.cyl(2.6, 2.6, 0.2, 18, T(pk), 0, 0, 0, { outline: 0.04 });
    for (let i = 0; i < 6; i++) q.add(new THREE.BoxGeometry(2.6, 0.04, 0.4), T(i % 2 ? YEL : cy), Math.cos((i / 6) * TAU) * 1.3, 0.21, Math.sin((i / 6) * TAU) * 1.3, { ry: -(i / 6) * TAU, outline: 0 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      q.beam([Math.cos(a) * 2.2, 0.2, Math.sin(a) * 2.2], [Math.cos(a) * 0.4, 1.2, Math.sin(a) * 0.4], 0.06, T(YEL), { outline: 0 });
    }
  });
  mgr.userData.spin = 1.2;
  k.dyn(mgr, mx, 0.6, mz);
}

// Water tower: tank on four legs, ladder, town colour band.
export function waterTower(world, loc, k, x, z, color) {
  k.at(x, z);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    k.beam([sx * 3, 0, sz * 3], [sx * 2, 10, sz * 2], 0.25, T(STEEL), { outline: 0.04 });
    k.beam([sx * 2.8, 2, sz * 2.8], [-sz * 2.4, 7, sx * 2.4], 0.07, T(DARK), { outline: 0 });
  }
  k.cyl(4, 4, 5, 18, T(LIGHT), 0, 10, 0, { outline: 0.1 });
  k.add(new THREE.ConeGeometry(4.3, 2.2, 18), T(color), 0, 16.1, 0, { outline: 0.06 });
  k.ring(4.05, 0.3, T(color), 0, 12.5, 0);
  k.ring(4.4, 0.08, T(DARK), 0, 10.2, 0);
  for (const t of [-0.3, 0.3]) k.beam([3.3 + t, 0, 0], [4.1 + t, 10, 0], 0.04, T(DARK), { outline: 0 });
  k.blinker(0, 17.6, 0, 0xff2a4a, 0.3);
  k.column(4.1, 15, 0, 0);
  k.at();
}

// Greenhouse: glass barrel vault over planter rows and violet grow-lights.
export function greenhouse(world, loc, k, x, z, yaw, len = 18) {
  k.at(x, z, yaw);
  k.box(7.4, 0.5, len + 0.4, T(CONC), 0, 0, 0, { outline: 0.05 });
  k.add(new THREE.CylinderGeometry(3.4, 3.4, len, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), GLASS(0x8dffb0, 0.25), 0, 0.5, 0, { outline: 0 });
  for (let t = -len / 2; t <= len / 2 + 0.01; t += 3) k.add(new THREE.TorusGeometry(3.42, 0.12, 4, 14, Math.PI), T(WHITE), 0, 0.5, t, { outline: 0.02 });
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(1.6, 0.6, len - 1.5), T(0x6b4a2a), s * 1.6, 0.8, 0, { outline: 0.02 });
  for (let t = -len / 2 + 1.5; t < len / 2 - 1; t += 1.5) for (const s of [-1, 1]) k.ball(0.45, T(t % 3 ? 0x3ad15a : 0x7dff6a), s * 1.6, 1.5, t, { outline: 0 });
  k.box(0.3, 0.15, len - 2, G(0xd8a0ff), 0, 3.2, 0, { outline: 0 });
  for (const sz of [-1, 1]) k.add(new THREE.CircleGeometry(3.4, 16, 0, Math.PI), GLASS(0x8dffb0, 0.25), 0, 0.5, sz * len / 2, { outline: 0 });
  k.solid(3.6, 2, len / 2, 0, 0);
  k.at();
}

// Comms mast with a turning dish head on a boom, in `faction` paint.
export function commsMast(world, loc, k, x, z, h, color, faction) {
  k.at(x, z);
  k.box(3, 0.5, 3, T(CONC), 0, 0, 0, { outline: 0.03 });
  lattice(k, 0, 0, h, 1, 0.4, Math.round(h / 3.5), T(LIGHT), T(DARK), { r: 0.14 });
  k.blinker(0, h + 0.4, 0, 0xff2a4a, 0.35);
  k.column(1, h, 0, 0);
  k.box(0.5, 0.5, 0.5, T(color), 0, h * 0.75 - 0.25, 0, { outline: 0.02 });
  k.dishHead(0, h * 0.75, 0, 1.15, faction, { az: Math.PI, el: -0.7, spin: 0.25, arm: 1.7 });
  k.at();
}

// =============================================================================================
// Kepler towns (Tranquility, Aldrin, Kepler, Twilight, Hertzsprung): hub dome ringed by family domes on tunnels, edge cabins
// facing the square, playground, greenhouse, water tower, comms mast. Kepler Civic Center has a gold council dome and the town
// hall with its clock tower.
// =============================================================================================
export function buildTown(world, loc, { civic = false } = {}) {
  const palette = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff];
  const occ = [];
  settle(world, loc, 8101 + loc.id.length * 31, (k, { rr }) => {
    const hubR = civic ? 30 : 22;
    habDome(k, 0, 0, hubR, civic ? 0xffd23f : 0xb8ffb0, { door: Math.PI, trim: 0xff9f1c, yard: false }); // tunnels come in from every side
    occ.push([0, 0, hubR + 4], [0, -hubR - 4, 4]);
    if (civic) occ.push([0, 52, 20], [-20, 64, 2], [20, 64, 2]);
    const n = loc.id === 'tranq' ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rr() * 0.3;
      const d = (civic ? 50 : 40) + rr() * 35;
      const r = 11 + rr() * 9;
      const dx = Math.cos(a) * d, dz = Math.sin(a) * d;
      if (civic && Math.hypot(dx, dz - 52) < r + 22) continue;
      habDome(k, dx, dz, r, palette[i % palette.length], { door: Math.atan2(dx, dz), trim: palette[(i + 3) % palette.length] });
      occ.push([dx, dz, r + 5]);
      const k1 = hubR / d, k2 = 1 - r / d;
      tunnel(world, loc, k, dx * k1, dz * k1, dx * k2, dz * k2, 1.6);
      // keep the tunnel line clear too
      for (let t = k1 + 0.1; t < k2; t += 0.15) occ.push([dx * t, dz * t, 2.5]);
    }
    for (const p of loc.pads || []) occ.push([p.x, p.z, p.r + 2]);
    occ.push([-65, 55, 15]);
    // edge cabins, doors to the square
    for (let i = 0; i < 5; i++) {
      const sp = freeSpot(occ, 7, 80, Math.min(98, loc.r * 0.85), rr);
      if (!sp) continue;
      cabin(k, sp[0], sp[1], 10, 8, 4.6, palette[(i + 2) % palette.length], Math.atan2(-sp[0], -sp[1]), { trim: palette[i % palette.length], solar: i % 2 === 1 });
    }
    const pg = freeSpot(occ, 15, 50, 85, rr);
    if (pg) playground(world, loc, k, pg[0], pg[1], Math.atan2(-pg[0], -pg[1]));
    const gh = freeSpot(occ, 11, 45, 90, rr);
    if (gh) greenhouse(world, loc, k, gh[0], gh[1], Math.atan2(gh[0], gh[1]) + Math.PI / 2);
    const wt = freeSpot(occ, 5, 50, 90, rr);
    if (wt) waterTower(world, loc, k, wt[0], wt[1], palette[loc.id.length % 6]);
    const cm = freeSpot(occ, 3, 60, 95, rr);
    if (cm) commsMast(world, loc, k, cm[0], cm[1], 16, 0xff9f1c, 'kepler');
    for (let i = 0; i < 6; i++) { const sp = freeSpot(occ, 1.5, 30, 95, rr); if (sp) k.lamp(sp[0], sp[1], 7); }
    // town sign by the hub door
    k.at(0, -hubR - 9, Math.PI);
    k.sign(loc.name.toUpperCase(), 0, 0, { w: Math.max(10, loc.name.length * 0.75), y: 4, fg: '#ff9f1c' });
    k.at();
    if (civic) townHall(world, loc, k);
  });
  world.pad(loc, -65, 55, 13, 0xffd23f, true);
}

// Kepler town hall: colonnaded block under a pediment, steps, a clock tower with turning hands. The colonnade faces out of
// town, toward arrivals.
export function townHall(world, loc, k) {
  const x = 0, z = 52, orange = 0xff9f1c;
  k.at(x, z, Math.PI);
  k.box(32, 1.2, 14, T(CONC), 0, 0, 0, { outline: 0.06 });
  for (let i = 0; i < 3; i++) k.box(14 - i * 1.2, 0.4, 2, T(LIGHT), 0, 0.4 * i, -7 - 1 + i * 0.6, { outline: 0.02 });
  k.box(30, 11, 11, T(WHITE), 0, 1.2, 0.8, { outline: 0.15 });
  for (let i = 0; i < 8; i++) {
    const cx = -12.25 + i * 3.5;
    k.cyl(0.6, 0.7, 10, 12, T(0xfffaf0), cx, 1.2, -5.4, { outline: 0.04 });
    k.box(1.6, 0.5, 1.6, T(LIGHT), cx, 10.9, -5.4, { outline: 0 });
  }
  k.box(31, 1.2, 13, T(orange), 0, 12.2, 0, { outline: 0.08 });
  k.add(prism(31, 13, 3.6), T(WHITE), 0, 13.4, 0, { outline: 0.1 });
  for (let i = 0; i < 6; i++) k.box(2.2, 3, 0.2, G(WARM), -10 + i * 4, 5, -5.0, { outline: 0 });
  k.box(3, 5, 0.3, T(0x2a2540), 0, 1.2, -5.0, { outline: 0.02 });
  k.solid(15.5, 8, 6.5, 0, 0.8);
  // clock tower
  k.box(6, 14, 6, T(WHITE), 0, 13.4, 2, { outline: 0.1 });
  k.box(6.6, 0.8, 6.6, T(orange), 0, 27.4, 2, { outline: 0.05 });
  k.add(new THREE.ConeGeometry(4.6, 6, 4), T(orange), 0, 31.2, 2, { ry: Math.PI / 4, outline: 0.08 });
  k.cyl(0.1, 0.12, 3, 6, T(DARK), 0, 34.2, 2, { outline: 0.02 });
  k.ball(0.3, G(YEL), 0, 37.3, 2, { outline: 0 });
  k.solid(3, 10, 3, 0, 2, 0, 13.4);
  k.at();
  for (const s of [-1, 1]) {
    k.at(x, z - 2 + s * 3.05, s > 0 ? 0 : Math.PI);
    k.add(new THREE.CylinderGeometry(2.2, 2.2, 0.2, 24).rotateX(Math.PI / 2), T(0xfffaf0), 0, 22.5, 0, { outline: 0.04 });
    k.add(new THREE.TorusGeometry(2.25, 0.18, 4, 24), T(orange), 0, 22.5, 0.05, { outline: 0 });
    for (let h = 0; h < 12; h++) { const a = (h / 12) * TAU; k.box(0.12, 0.35, 0.05, T(DARK), Math.sin(a) * 1.85, 22.5 + Math.cos(a) * 1.85, 0.13, { rz: -a, outline: 0 }); }
    const hands = new THREE.Group();
    const mins = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.05).translate(0, 0.75, 0), T(DARK));
    const hrs = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.05).translate(0, 0.45, 0), T(DARK));
    hands.add(mins, hrs);
    hands.userData.tick = (o, dt, t) => { mins.rotation.z = -t * 0.2 * s; hrs.rotation.z = (-t * 0.2 * s) / 12; };
    k.dyn(hands, 0, 22.5, 0.2);
    k.at();
  }
  for (const sx of [-1, 1]) world.flag(loc, sx * 20, 64, [0xff9f1c, 0xffffff, 0xff9f1c], 18);
}

// Quonset hut (barracks, garages): ribbed half-barrel, end wall, door, lamps; door end faces local +z.
export function quonset(k, x, z, r, len, color, yaw, trim) {
  k.at(x, z, yaw);
  k.box(r * 2 + 1, 0.4, len + 1, T(CONC), 0, 0, 0, { outline: 0.04 });
  k.add(new THREE.CylinderGeometry(r, r, len, 18, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), D(color), 0, 0.4, 0, { outline: 0.12 });
  for (let t = -len / 2 + 1; t < len / 2; t += 3) k.add(new THREE.TorusGeometry(r + 0.05, 0.12, 4, 18, Math.PI), T(PANEL), 0, 0.4, t, { outline: 0 });
  k.add(new THREE.TorusGeometry(r + 0.08, 0.25, 4, 18, Math.PI), T(trim), 0, 0.4, len / 2 - 0.5, { outline: 0 });
  k.add(new THREE.CircleGeometry(r, 18, 0, Math.PI), T(LIGHT), 0, 0.4, len / 2, { outline: 0 });
  k.add(new THREE.CircleGeometry(r, 18, 0, Math.PI), T(LIGHT), 0, 0.4, -len / 2, { ry: Math.PI, outline: 0 });
  k.box(r * 0.8, r * 0.75, 0.2, T(0x2a2540), 0, 0.4, len / 2 + 0.05, { outline: 0.02 });
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 10).rotateX(Math.PI / 2), G(WARM), s * r * 0.6, r * 0.6, len / 2 + 0.06, { outline: 0 });
  k.box(0.6, 0.25, 0.3, G(WARM), 0, r * 0.75 + 0.6, len / 2 + 0.2, { outline: 0 });
  k.solid(r + 0.5, 0.2, len / 2 + 0.5, 0, 0); // concrete pad
  k.hcyl(r + 0.1, len, 0, 0, 0, 0.4); // round roof you can roll over
  k.at();
}

// Turning radar: lattice reflector on a yoke, spinning on a pedestal (dynamic).
export function radar(k, x, y, z, w, color, speed = 0.8) {
  const rd = part(color, (q) => {
    q.cyl(0.5, 0.7, 1.2, 10, T(DARK), 0, 0, 0, { outline: 0.03 });
    q.add(new THREE.CylinderGeometry(w * 0.32, w * 0.32, w, 16, 1, true, -0.7, 1.4).rotateZ(Math.PI / 2), D(LIGHT), 0, 1.8, -w * 0.18, { outline: 0.04 });
    for (let i = -2; i <= 2; i++) q.box(0.08, w * 0.42, 0.08, T(color), (i * w) / 5, 1.8, w * 0.08, { outline: 0 });
    q.box(w, 0.15, 0.15, T(color), 0, 1.8, w * 0.1, { outline: 0 });
    q.beam([0, 1.1, 0], [0, 1.8, w * 0.1], 0.08, T(DARK), { outline: 0 });
  });
  rd.userData.spin = speed;
  k.dyn(rd, x, y, z);
}

// Searchlight: pedestal, tilted housing, soft light cone, sweeping (dynamic).
export function searchlight(k, x, y, z, reach = 40) {
  const sl = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.8, 8), T(DARK)); ped.position.y = 0.4; sl.add(ped);
  const head = new THREE.Group(); head.position.y = 1.15; head.rotation.x = 0.35; sl.add(head);
  const hous = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.48, 1.3, 10).rotateX(Math.PI / 2), T(LIGHT)); head.add(hous);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 10).rotateX(Math.PI / 2), G(0xfffbe0)); lens.position.z = 0.66; head.add(lens);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(reach * 0.13, reach, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, reach / 2 + 0.7), BEAM(0xfff3b0, 0.12));
  cone.renderOrder = 3; head.add(cone);
  sl.userData.spin = 0.5;
  k.dyn(sl, x, y, z);
}

// =============================================================================================
// ILMB core (wings, skywalks, walls and boards are in world.js): great dome, control spire through its crown, repair-bay
// hangar, launch gantry with fuel spheres, two outlying domes, comms mast, barracks.
// =============================================================================================
export function dressIlmb(world, loc) {
  settle(world, loc, 9203, (k) => {
    // berm cut where the six wing skywalks dock (world.js buildIlmbWings: wing angle a runs along (cos a, sin a), dome azimuth pi/2 - a)
    habDome(k, 0, 0, 58, 0x9be7ff, { door: 0, trim: 0xffd23f, cupola: false, gaps: [0, 0.62, 2.2, 3.8, 4.5, 5.2].map((a) => Math.PI / 2 - a) });
    // control spire: banded shaft, observation pod, antenna, beacon
    k.at(0, 0);
    k.cyl(2.6, 4.2, 70, 14, T(WHITE), 0, 0, 0, { outline: 0.12 });
    for (const y of [60, 64, 68]) k.ring(3.05 - (y - 60) * 0.03, 0.25, T(YEL), 0, y, 0);
    k.cyl(6.5, 4, 3, 18, T(WHITE), 0, 70, 0, { outline: 0.1 });
    k.cyl(6.6, 6.6, 2.2, 18, G(0xbfe9ff), 0, 73, 0, { outline: 0 });
    k.cyl(4.6, 6.8, 2.2, 18, T(0x2ec4ff), 0, 75.2, 0, { outline: 0.08 });
    k.cyl(0.4, 0.8, 9, 8, T(LIGHT), 0, 77.4, 0, { outline: 0.04 });
    k.blinker(0, 87, 0, 0xffd23f, 0.9);
    radar(k, 3.4, 77.4, 0, 4, 0x2ec4ff, 0.6);
    k.column(4.2, 82, 0, 0);
    k.at();
    // repair bay: ribbed arched hangar, lit doorway (+z faces the base)
    k.at(-168, -98, 1.05);
    k.box(36, 0.5, 36, T(CONC), 0, 0, 0, { outline: 0.05 });
    k.add(new THREE.CylinderGeometry(16, 16, 34, 24, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), D(0xff9f1c), 0, 0.5, 0, { outline: 0.25 });
    k.hcyl(16.2, 34, 0, 0, 0, 0.5);
    for (let t = -15; t <= 15; t += 5) k.add(new THREE.TorusGeometry(16.1, 0.4, 4, 24, Math.PI), T(0xd8d4e8), 0, 0.5, t, { outline: 0 });
    k.add(new THREE.CircleGeometry(16, 24, 0, Math.PI), T(0xd8d4e8), 0, 0.5, -17, { ry: Math.PI, outline: 0 });
    k.add(new THREE.CircleGeometry(16, 24, 0, Math.PI), T(0x1d1a29), 0, 0.5, 16.95, { outline: 0 });
    k.add(new THREE.TorusGeometry(16.2, 0.6, 4, 24, Math.PI), T(YEL), 0, 0.5, 17, { outline: 0.05 });
    for (let i = -3; i <= 3; i++) k.box(1.6, 0.08, 6, T(i % 2 ? YEL : DARK), i * 3, 0.5, 21, { outline: 0 });
    for (const s of [-1, 1]) k.box(0.4, 0.4, 0.4, G(0xff9f1c), s * 15, 4, 17.4, { outline: 0 });
    k.at();
    // launch gantry: lattice umbilical tower with two swing arms; fuel spheres
    const gx = 60, gz = -185;
    k.at(gx, gz);
    k.box(10, 1, 10, T(CONC), 0, 0, 0, { outline: 0.06 });
    lattice(k, 0, 0, 54, 2.8, 2.8, 12, T(0xff4f2e), T(WHITE), { r: 0.32 });
    for (const y of [24, 40]) {
      k.box(16, 1.4, 2, T(DARK), -8, y, 0, { outline: 0.06 });
      k.box(16, 0.2, 2.2, T(YEL), -8, y + 1.4, 0, { outline: 0 });
    }
    k.cyl(0.3, 0.4, 8, 6, T(DARK), 0, 54, 0, { outline: 0.03 });
    k.blinker(0, 62.5, 0, 0xff2a4a, 0.5);
    k.solid(2.9, 27, 2.9, 0, 0);
    k.at();
    hortonSphere(k, -20, -173, 6.5, WHITE, 0xff4f2e);
    hortonSphere(k, -20, -197, 6.5, WHITE, 0x2ec4ff);
    habDome(k, 70, 140, 16, 0xff7ad9, { door: Math.PI, trim: YEL });
    habDome(k, -60, 145, 14, 0xffd23f, { door: Math.PI, trim: 0xff7ad9 });
    commsMast(world, loc, k, 140, -120, 30, 0xffd23f, 'spacecom');
    // barracks and vehicle depot
    quonset(k, 175, 120, 7, 34, 0x5b5870, -0.6 + Math.PI, YEL);
    quonset(k, -175, 125, 7, 34, 0x5b5870, 0.6 + Math.PI, YEL);
    cabin(k, 190, -40, 26, 26, 11, 0x4a4660, 0.3 - Math.PI / 2, { roof: 0x2a2540, trim: YEL });
  });
}

// =============================================================================================
// Military bases (Vostok, Daedalus): sloped command bunker with slits, masts and radar; Quonset barracks; searchlight tower;
// tank traps, sandbag nests; fuel and ammo.
// =============================================================================================
export function dressBase(world, loc) {
  const small = !!loc.small;
  settle(world, loc, 9901 + loc.id.length * 17, (k, { fc }) => {
    // command bunker: armoured octagonal frustum; slits, faction band and armour plates sit flush on each leaning face so it
    // reads square from every side; glazed command deck and masts on top; recessed blast door
    const R = small ? 13 : 21, H = small ? 9 : 12.5;
    const tilt = Math.atan((R * 0.18 * Math.cos(Math.PI / 8)) / H); // face lean (measured across the face)
    const face = (j) => (j + 0.5) * (TAU / 8);              // face centres (cylinder vertices at j*45deg)
    const ap = (h) => (R - R * 0.18 * (h / H)) * Math.cos(Math.PI / 8); // apothem at height h
    k.at(0, 0, -Math.PI / 8); // face 0 (the door's) looks down the approach, +z
    k.cyl(R * 1.12, R * 1.16, 0.8, 8, T(CONC), 0, 0, 0, { outline: 0.06 });
    k.cyl(R * 0.82, R, H, 8, T(0x4a4660), 0, 0.8, 0, { outline: 0.18 });
    for (let j = 0; j < 8; j++) {
      const a = face(j);
      const at = (h, out) => [Math.sin(a) * (ap(h) + out), 0.8 + h, Math.cos(a) * (ap(h) + out)];
      // yaw then pitch, so plates sit square on each face rather than skewed by a world-axis tilt
      const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, a, 0, 'YXZ'));
      const plate = (w, hh, d, h, out, mat) => { const [x, y, z] = at(h, out); k.add(new THREE.BoxGeometry(w, hh, d), mat, x, y, z, { q: fq, outline: 0.03 }); };
      const side = 2 * ap(0.62 * H) * Math.tan(Math.PI / 8) * 0.86;
      if (j !== 0) plate(side * 0.7, 0.55, 0.2, H * 0.55, 0.06, T(0x1d1a29));   // firing slit
      if (j !== 0) plate(side * 0.6, 0.18, 0.14, H * 0.55 - 0.42, 0.1, G(fc)); // slit glow
      plate(side, 0.4, 0.16, H * 0.86, 0.08, T(fc));                           // faction band
      plate(side * 0.92, H * 0.28, 0.25, H * 0.18, 0.1, T(0x3a3550));          // armour skirt
    }
    // eaves, glazed command deck, cap
    k.cyl(R * 0.86, R * 0.86, 0.8, 8, T(0x3a3550), 0, H + 0.8, 0, { outline: 0.06 });
    k.cyl(R * 0.52, R * 0.6, 2.6, 8, T(0x5b5870), 0, H + 1.6, 0, { outline: 0.1 });
    k.cyl(R * 0.53, R * 0.58, 0.9, 8, G(0x9be7ff), 0, H + 2.4, 0, { outline: 0 });
    k.cyl(R * 0.62, R * 0.62, 0.5, 8, T(fc), 0, H + 4.2, 0, { outline: 0.04 });
    // four corner masts with beacons
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + TAU / 8, rr = R * 0.5;
      k.cyl(0.08, 0.12, 6, 5, T(DARK), Math.sin(a) * rr, H + 4.7, Math.cos(a) * rr, { outline: 0.02 });
      k.ball(0.25, G(i % 2 ? 0xff2a4a : fc), Math.sin(a) * rr, H + 10.9, Math.cos(a) * rr, { outline: 0 });
    }
    radar(k, 0, H + 4.7, 0, small ? 4 : 6, fc, 0.9);
    // blast door recessed in the +z face, hazard stripes, a lamp each side
    {
      k.at(0, 0, 0);
      k.box(6.4, 5, 2.2, T(0x3a3550), 0, 0.8, R * 0.98, { outline: 0.06 });
      k.box(4.6, 3.8, 0.2, T(0x1d1a29), 0, 0.8, R * 0.98 + 1.12, { outline: 0 });
      k.box(0.08, 3.8, 0.24, T(DARK), 0, 0.8, R * 0.98 + 1.14, { outline: 0 });
      for (let i = 0; i < 7; i++) k.box(0.66, 0.4, 0.22, T(i % 2 ? DARK : YEL), -2.0 + i * 0.66, 4.7, R * 0.98 + 1.13, { outline: 0 });
      for (const sx of [-1, 1]) { k.box(0.5, 0.5, 0.3, G(WARM), sx * 2.8, 3.6, R * 0.98 + 1.15, { outline: 0 }); }
      k.box(5.2, 0.3, 2.6, T(CONC), 0, 0, R * 0.98 + 2.4, { outline: 0.03 });
      k.solid(3.2, 2.9, 1.1, 0, R * 0.98);
    }
    k.at();
    // stacked colliders follow the wall slope (R at the foot, 0.82R at the eaves), then the roof
    for (let i = 0; i < 4; i++) k.column(R * (1 - 0.18 * (i + 0.5) / 4) + 0.2, (H * (i + 1)) / 4, 0, 0, (H * i) / 4);
    k.column(R * 0.72, H + 3, 0, 0, H);
    // Quonset barracks round the yard, doors toward the bunker (clear of the +x gate lane, dish, searchlight tower and fuel)
    const hut = (a, d, r, len) => { const x = Math.cos(a) * d, z = Math.sin(a) * d; quonset(k, x, z, r, len, 0x5b5870, Math.atan2(-x, -z), fc); };
    if (!small) {
      for (const [a, d] of [[1.25, 62], [2.2, 60], [-2.05, 61], [-1.05, 62]]) hut(a, d, 8, 30);
      // fuel tanks, ammo dump
      k.at(-48, -20);
      tank(k, 0, 0, 3, 7, 0x6b6f78, fc);
      tank(k, 7.5, 0, 3, 7, 0x6b6f78, fc);
      k.at();
      for (let i = 0; i < 6; i++) crate(k, 48 + (i % 3) * 1.6, 0, 22 + Math.floor(i / 3) * 1.6, 1.4, 0x4f5a42, 0.1);
    } else {
      for (const [a, d] of [[2.1, 38], [-1.9, 37]]) hut(a, d, 5.5, 18);
    }
    // searchlight tower
    const tx = -30, tz = -30, th = small ? 24 : 34;
    k.at(tx, tz);
    k.box(6, 0.6, 6, T(CONC), 0, 0, 0, { outline: 0.04 });
    lattice(k, 0, 0, th, 2.4, 1.4, Math.round(th / 5), T(0x5b5870), T(DARK), { r: 0.24 });
    k.box(5, 0.4, 5, T(DARK), 0, th, 0, { outline: 0.05 });
    k.box(3.6, 2.4, 3.6, T(0x5b5870), 0, th + 0.4, 0, { outline: 0.06 });
    k.box(3.64, 0.8, 3.64, G(0xff2a4a), 0, th + 1.5, 0, { outline: 0 });
    k.box(4.4, 0.4, 4.4, T(fc), 0, th + 2.8, 0, { outline: 0.04 });
    k.blinker(1.6, th + 4.4, 1.6, 0xff2a4a, 0.4);
    k.solid(2.4, th / 2, 2.4, 0, 0);
    k.at();
    searchlight(k, tx, th + 3.2, tz, 46);
    // tank traps inside the gate
    const wallR = small ? 55 : 95;
    for (let i = 0; i < (small ? 4 : 6); i++) {
      const x = wallR - 10 - (i % 3) * 4, z = (i % 2 ? 1 : -1) * (9 + (i % 3) * 2.5);
      k.at(x, z, i);
      for (const r of [[0, 0, 0.7], [0.7, 0, -0.7], [0, 0.7, 0.7]]) k.add(new THREE.BoxGeometry(0.35, 2.4, 0.35), T(0x55505e), 0, 0.9, 0, { rx: r[0] + 0.3, ry: r[1], rz: r[2], outline: 0.03 });
      k.column(0.9, 1.8, 0, 0);
      k.at();
    }
    // sandbag nests either side of the gate lane (clear of the large bunker)
    sandbags(k, wallR * 0.42, wallR * 0.3, 3.2, 0.3, 4.2, 2);
    sandbags(k, wallR * 0.42, -wallR * 0.3, 2.6, 2.2, 6.0, 2);
    floodMast(k, wallR * 0.65, -wallR * 0.6, 12); floodMast(k, -wallR * 0.6, wallR * 0.45, 12);
  });
}

// =============================================================================================
// Research arrays (Shackleton, Farside): four dishes on Blender stations (cryo and gantry alternate, swapped at Farside), in the
// site's livery, numbered 01-04; an observatory with a turning cupola, lab blocks, a control centre with a status display, a comms
// mast, cable runs to the control centre, floodlights.
// =============================================================================================
// dish positions (x, z) and size (30 = a 30 m mount); ARRAY_CONTROL is where cables run and the stations face
export const ARRAY_DISHES = [[-60, -30, 26], [55, -40, 30], [0, 60, 34], [-80, 70, 18]];
const ARRAY_CONTROL = [-10, -72];
export function dressArray(world, loc, speeds = []) {
  settle(world, loc, 7301 + loc.id.length * 13, (k) => {
    const green = 0x7dff6a;
    // observatory: drum, turning slit cupola, telescope
    const ox = 70, oz = 50, r = 14;
    k.at(ox, oz);
    k.cyl(r + 1, r + 1.4, 1, 28, T(PANEL), 0, 0, 0, { outline: 0.08 });
    k.cyl(r, r, 7, 28, T(0xe0e0f0), 0, 1, 0, { outline: 0.15 });
    k.ring(r + 0.05, 0.3, T(green), 0, 7.8, 0);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; k.box(1.2, 0.8, 0.2, G(WARM), Math.sin(a) * (r + 0.05), 4.5, Math.cos(a) * (r + 0.05), { ry: a, outline: 0 }); }
    k.box(2.4, 3.2, 0.3, T(0x2a2540), 0, 1, r + 0.1, { outline: 0.02 });
    k.at();
    k.column(r, 8, ox, oz);
    k.sphere(r, ox, 8, oz);
    const cup = part(LIGHT, (q) => {
      for (const s of [-1, 1]) q.add(new THREE.SphereGeometry(r * 0.98, 24, 10, s > 0 ? 0.18 : Math.PI + 0.18, Math.PI - 0.36, 0, Math.PI / 2), T(0xe8e4f4), 0, 0, 0, { outline: 0 });
      q.add(new THREE.SphereGeometry(r * 0.99, 24, 10, 0, TAU, 0, Math.PI / 2), inkShell(), 0, 0, 0, { outline: 0.15 });
      q.add(new THREE.SphereGeometry(r * 0.94, 20, 8, 0, TAU, 0, Math.PI / 2), T(0x1d1a29), 0, 0, 0, { outline: 0 });
      q.add(new THREE.CylinderGeometry(1.4, 1.8, 12, 12), T(WHITE), 2.5, 6, 0, { rz: -0.6, outline: 0.06 });
      q.add(new THREE.CylinderGeometry(1.45, 1.45, 0.4, 12), G(0x9be7ff), 5.9, 10.95, 0, { rz: -0.6, outline: 0 });
      q.cyl(2.4, 2.8, 2, 12, T(DARK), 0, 0, 0, { outline: 0.04 });
    });
    cup.userData.tick = (o, dt, t) => { o.rotation.y = Math.sin(t * 0.05) * 2.5; };
    k.dyn(cup, ox, 8, oz);
    // control centre: two tiers, raked glazed front, roof radome and antennas, door canopy, name on the upper tier; solar field
    // beside it, status display on a frame by the entrance
    cabin(k, 30, -95, 14, 12, 7, WHITE, -0.3 + Math.PI, { trim: green });
    k.at(-10, -80, 0.2 + Math.PI);
    k.box(34, 0.6, 20, T(CONC), 0, 0, 1, { outline: 0.05 });
    k.box(28, 8, 14, T(0xe0e0f0), 0, 0.6, 0, { outline: 0.15 });
    k.add(new THREE.BoxGeometry(28.2, 0.4, 3.6), T(PANEL), 0, 8.5, 7.6, { rx: -0.42, outline: 0.04 });   // raked eave
    k.box(28.1, 2.6, 0.2, G(0x9be7ff), 0, 4.2, 7.02, { outline: 0 });                                      // glazed band
    for (let i = 0; i < 8; i++) k.box(0.25, 2.8, 0.3, T(PANEL), -12.25 + i * 3.5, 4.1, 7.1, { outline: 0 }); // mullions
    k.box(28.4, 0.5, 14.4, T(green), 0, 8.6, 0, { outline: 0.04 });
    k.box(16, 5, 9, T(PANEL), -3, 9.1, -1.5, { outline: 0.12 });
    k.box(16.1, 1.0, 9.1, G(WARM), -3, 11.2, -1.5, { outline: 0 });
    k.box(16.4, 0.4, 9.4, T(green), -3, 14.1, -1.5, { outline: 0.03 });
    k.text(loc.name.toUpperCase(), -3, 12.4, 3.12, 0, 12, { fg: '#7dff6a', bg: '#10241a', back: false, off: 0.04 });
    // radome and antennas
    k.cyl(2.2, 2.6, 1.6, 14, T(DARK), 8, 9.1, -2.5, { outline: 0.04 });
    k.add(new THREE.SphereGeometry(3.2, 18, 12), T(WHITE), 8, 13.2, -2.5, { outline: 0.08 });
    k.ring(3.25, 0.12, G(green), 8, 13.2, -2.5);
    k.beam([-9, 14.5, -4], [-9, 23, -4], 0.12, T(DARK), { outline: 0.02 });
    k.beam([-6, 14.5, -5], [-6, 19.5, -5], 0.08, T(DARK), { outline: 0.02 });
    k.blinker(-9, 23.3, -4, 0xff2a4a, 0.35);
    // entrance: door, canopy, lamp
    k.box(4, 4, 0.3, T(DARK), 0, 0.6, 7.1, { outline: 0.02 });
    k.box(6.5, 0.35, 2.8, T(green), 0, 4.9, 8.4, { outline: 0.04 });
    for (const sx of [-1, 1]) k.beam([sx * 3, 0.6, 9.6], [sx * 3, 4.9, 9.6], 0.1, T(DARK), { outline: 0 });
    k.box(1.4, 0.25, 0.3, G(WARM), 0, 4.6, 7.3, { outline: 0 });
    k.solid(14, 4.3, 7, 0, 0);
    k.solid(8, 2.5, 4.5, -3, -1.5, 0, 9.1);
    k.solid(3.2, 1.6, 1.6, 8, -2.5, 0, 11.6);
    // status display on its own frame (waveform bars)
    k.box(11, 6, 0.4, T(DARK), 19, 2.6, 9, { ry: -0.35, outline: 0.05 });
    k.box(10, 5, 0.1, G(0x2ee6ff), 19 + Math.sin(-0.35) * 0.25, 3.1, 9 + Math.cos(-0.35) * 0.25, { ry: -0.35, outline: 0 });
    for (let i = 0; i < 6; i++) {
      const u = -3.75 + i * 1.5, h = 0.6 + ((i * 7) % 5) * 0.75;
      k.box(1.0, h, 0.05, G(green), 19 + Math.cos(-0.35) * u + Math.sin(-0.35) * 0.32, 3.4, 9 - Math.sin(-0.35) * u + Math.cos(-0.35) * 0.32, { ry: -0.35, outline: 0 });
    }
    for (const sx of [-1, 1]) k.beam([19 + Math.cos(-0.35) * sx * 4.5, 0, 9 - Math.sin(-0.35) * sx * 4.5], [19 + Math.cos(-0.35) * sx * 4.5, 2.6, 9 - Math.sin(-0.35) * sx * 4.5], 0.15, T(DARK), { outline: 0 });
    k.solid(5.5, 4.3, 0.5, 19, 9, -0.35);
    // solar field: three rows of tilted panels
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const x = 23 + row * 5, z = -13 + i * 4;
      k.add(new THREE.BoxGeometry(4.2, 0.12, 3.2), T(0x2d4fc4), x, 2.0, z, { rz: -0.5, outline: 0.03 });
      k.add(new THREE.BoxGeometry(4.25, 0.14, 0.12), T(LIGHT), x, 2.02, z, { rz: -0.5, outline: 0 });
      k.cyl(0.1, 0.12, 2.0, 6, T(DARK), x, 0, z, { outline: 0 });
    }
    k.solid(7.4, 1.25, 9.7, 28, -5);
    k.at();
    commsMast(world, loc, k, 100, -20, 40, green, loc.faction);
    // dish stations and their cable runs
    ARRAY_DISHES.forEach(([x, z, size], i) => {
      const kind = DISH_KINDS[(i + (loc.id === 'farside' ? 1 : 0)) % DISH_KINDS.length];
      dishStation(k, x, z, size, kind, loc.faction, String(i + 1).padStart(2, '0'), { yaw: Math.atan2(ARRAY_CONTROL[0] - x, ARRAY_CONTROL[1] - z), speed: speeds[i] ?? 0.1, phase: i * 2.1 });
      k.strip([x, z], ARRAY_CONTROL, 0.6, 0.12, T(DARK), 0);
    });
    floodMast(k, 30, 10, 12); floodMast(k, -40, 30, 12);
  });
}

// =============================================================================================
// Pirate dens (Scrapjaw Gulch, Blackrock, Gloom Harbor, Rustmoon Hold): container shanties, scrap huts, junk heaps, gutted
// wreck hulls, a lookout tower with a searchlight, green light strings. Rustmoon Hold is ringed by wrecks.
// =============================================================================================
export function shanty(k, x, z, w, h, d, color, yaw, rr) {
  k.at(x, z, yaw);
  if (rr() < 0.5) {
    container(k, 0, 0, 0, color, Math.PI / 2);
    k.add(new THREE.BoxGeometry(7.4, 0.15, 3.4), T(RUST), 0, 3.2, 1.7, { rx: 0.25, outline: 0.04 });
    for (const s of [-1, 1]) k.beam([s * 3.4, 0, 3.2], [s * 3.4, 2.8, 3.2], 0.07, T(DARK), { outline: 0 });
    k.box(1.2, 0.8, 0.1, G(0x7dff3a), 1.5, 1.3, 1.29, { outline: 0 });
    k.solid(3.1, 1.4, 1.3, 0, 0);
  } else {
    k.box(w, h, d, T(color), 0, 0, 0, { outline: 0.1 });
    k.add(prism(w + 0.8, d + 0.8, 2.2), T(RUST), 0, h, 0, { outline: 0.06 });
    for (let i = 0; i < 3; i++) k.box(rr() * 2 + 1, rr() * 1.5 + 0.8, 0.08, T([0x8a8698, 0x6b5a4a, 0x9a6a3a][i]), (rr() - 0.5) * (w - 2), rr() * (h - 2), d / 2 + 0.05, { rz: (rr() - 0.5) * 0.3, outline: 0.02 });
    k.box(1.4, 1, 0.1, G(0xff9f1c), w / 4, h * 0.55, d / 2 + 0.06, { outline: 0 });
    k.box(1.4, 2.2, 0.1, T(0x1d1a29), -w / 4, 0, d / 2 + 0.06, { outline: 0 });
    k.solid(w / 2, (h + 2.2) / 2, d / 2, 0, 0);
  }
  for (let i = 0; i < 2; i++) k.cyl(0.55, 0.55, 1.3, 8, T([0xa05a2a, 0x3a3550][i]), -2.8 + i * 1.2, 0, 2.6, { outline: 0.03 });
  k.solid(1.15, 0.65, 0.55, -2.2, 2.6);
  k.at();
}
export function wreckHull(k, x, z, yaw, len, color, tilt = 0.12) {
  k.at(x, z, yaw, 0, 0, tilt);
  const r = 7;
  k.add(new THREE.CapsuleGeometry(r, len * 0.45, 6, 14).rotateZ(Math.PI / 2), T(color), -len * 0.22, r * 0.75, 0, { outline: 0.25 });
  for (let t = 0; t < len * 0.5; t += 3.2) k.add(new THREE.TorusGeometry(r, 0.45, 4, 16, Math.PI * 1.25), T(0x4a4660), t + 2, r * 0.75, 0, { ry: Math.PI / 2, rz: -0.2, outline: 0.06 });
  k.beam([0, r * 1.6, 0], [len * 0.55, r * 1.5, 0], 0.4, T(0x4a4660), { outline: 0.05 });
  k.beam([0, 0.6, 0], [len * 0.55, 0.4, 0], 0.4, T(0x4a4660), { outline: 0.05 });
  k.add(new THREE.BoxGeometry(len * 0.35, 0.6, 9), T(color), -len * 0.2, r * 0.6, r + 3.5, { rx: 0.4, rz: -0.15, outline: 0.1 });
  k.add(new THREE.SphereGeometry(r * 0.55, 12, 8), T(0x1a3a1a), -len * 0.62, r * 0.95, 0, { sx: 1.4, outline: 0.08 });
  k.ball(1.2, G(0x7dff3a), -len * 0.66, r * 1.1, r * 0.25, { outline: 0 });
  for (let i = 0; i < 3; i++) k.cyl(1.2, 1.6, 2.4, 10, T(DARK), -len * 0.62 + 1, r * 0.4 + i * 1.6, 0, { rz: Math.PI / 2, outline: 0.04 });
  k.solid(len * 0.45, r * 0.75, r, -len * 0.22, 0);
  k.solid(len * 0.28, r * 0.75, r * 0.9, len * 0.27, 0); // bare ribs: one block, nothing to snag on
  k.solid(len * 0.18, 1.9, 4.2, -len * 0.2, r + 3.5, 0, r * 0.6 - 1.9); // leaning torn-off plate
  k.at();
}
// The ILMB after the clans took it: junk barricades, a trophy wreck, scrap heaps, crates, green clan lamps.
export function dressScrap(world, loc) {
  settle(world, loc, 6601, (k, { rr }) => {
    const R = loc.r;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2 + rr() * 0.3, d = R * (0.55 + rr() * 0.3);
      junkHeap(k, Math.cos(a) * d, Math.sin(a) * d, 4 + rr() * 3, 1.6 + rr() * 1.4, 12, rr);
    }
    // barricades across the plaza approach
    for (let i = 0; i < 6; i++) {
      const x = -30 + i * 12 + (rr() - 0.5) * 4, z = 82 + (rr() - 0.5) * 6;
      container(k, x, 0, z, [0x6b4a32, 0x55607a, 0x3a3550][i % 3], rr() * 0.6 - 0.3 + Math.PI / 2);
      k.add(new THREE.BoxGeometry(4, 0.15, 2.5), T(RUST), x + 3, 1.2, z + 2, { rx: 0.5, ry: rr(), outline: 0.03 });
    }
    wreckHull(k, -R * 0.62, R * 0.35, 1.1, 18, 0x6b4a32, 0.3);
    for (let i = 0; i < 18; i++) { const a = rr() * TAU, d = R * (0.3 + rr() * 0.6); crate(k, Math.cos(a) * d, 0, Math.sin(a) * d, 1.2 + rr() * 0.6, [0x7a4a32, 0x2a2433, 0x4f5a42][i % 3], rr() * TAU); }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.1, d = R * 0.5;
      k.cyl(0.12, 0.16, 6, 5, T(DARK), Math.cos(a) * d, 0, Math.sin(a) * d, { outline: 0.02 });
      k.ball(0.45, G(0x7dff3a), Math.cos(a) * d, 6.3, Math.sin(a) * d, { outline: 0 });
    }
  });
}

// A demolished den: Rustmoon Hold after SPACECOM's finale (scorched ground, broken wrecks, scrap, a field post, a memorial), or
// an abandoned camp (wreckage only).
export function buildRuin(world, loc) {
  settle(world, loc, 7301 + loc.id.length * 13, (k, { rr }) => {
    const R = loc.r;
    const hold = !loc.small;
    k.at();
    k.cyl(R * 0.75, R * 0.8, 0.18, 40, T(0x2a2433), 0, 0, 0, { outline: 0 });
    const n = hold ? 6 : 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rr() * 0.6, d = R * (0.4 + rr() * 0.3);
      wreckHull(k, Math.cos(a) * d, Math.sin(a) * d, rr() * TAU, 9 + rr() * 10, [0x6b4a32, 0x4a4f5e, 0x3a3550][i % 3], 0.3 + rr() * 0.25);
    }
    // scrap: containers, sheet metal, barrels, scorched crates
    for (let i = 0; i < (hold ? 26 : 8); i++) {
      const a = rr() * TAU, d = R * (0.15 + rr() * 0.6);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const r = rr();
      if (r < 0.3) container(k, x, 0, z, [0x6b4a32, 0x55607a, 0x3a3550][i % 3], rr() * TAU);
      else if (r < 0.6) k.add(new THREE.BoxGeometry(2 + rr() * 3, 0.15, 1.5 + rr() * 2), T(RUST), x, 0.3 + rr() * 0.6, z, { rx: rr() - 0.5, ry: rr() * TAU, rz: rr() - 0.5, outline: 0.03 });
      else if (r < 0.8) {
        const lying = rr() < 0.4;
        k.cyl(0.55, 0.55, 1.3, 8, T([0xa05a2a, 0x3a3550][i % 2]), x, 0, z, { rx: lying ? Math.PI / 2 : 0, outline: 0.03 });
        if (lying) k.hcyl(0.55, 1.3, x, z, 0, 0.65); else k.column(0.55, 1.3, x, z);
      }
      else crate(k, x, 0, z, 1.2, 0x2a2433, rr() * TAU);
    }
    k.at();
    if (hold) {
      // SPACECOM field post and memorial plinth
      quonset(k, -26, -18, 5, 12, 0xeeecf6, 0.6, YEL);
      quonset(k, -12, -30, 5, 12, 0xeeecf6, 0.6, YEL);
      k.at(0, 10);
      k.box(8, 1.4, 4, T(CONC), 0, 0, 0, { outline: 0.06 });
      k.box(6, 2.6, 1.2, T(0xd8d4e8), 0, 1.4, 0, { outline: 0.06 });
      k.text('RUSTMOON HOLD', 0, 3.2, 0.62, 0, 5.4, { fg: '#ffd23f', bg: '#241a3a', back: false, off: 0.02 });
      k.text('DECOMMISSIONED BY SPACECOM', 0, 2.3, 0.62, 0, 5.4, { fg: '#d8d4e8', bg: '#241a3a', back: false, off: 0.02 });
      k.solid(4, 2, 2, 0, 0);
      k.flag(-5, 0, 13, YEL); k.flag(5, 0, 13, 0x2ec4ff);
      k.at();
      floodMast(k, 30, 20, 14); floodMast(k, -30, 24, 14);
    }
  });
}

export function buildDen(world, loc) {
  const rust = [0x8a4b2a, 0x6b5a3a, 0x9a9a9a, 0x5a3a5a];
  const hold = loc.id === 'rustmoon';
  settle(world, loc, 6151 + loc.id.length * 7, (k, { rr }) => {
    const occ = [[0, 0, 12], [-30, 30, 5], [20, 20, 3]];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; occ.push([Math.cos(a) * 60, Math.sin(a) * 60, 2]); }
    if (hold) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.4, d = 78;
        wreckHull(k, Math.cos(a) * d, Math.sin(a) * d, -a + Math.PI / 2, 34 + (i % 2) * 8, [0x6b6880, 0x5a4a5a, 0x7a5a4a][i % 3], (i % 2 ? 1 : -1) * 0.14);
        occ.push([Math.cos(a) * d, Math.sin(a) * d, 26]);
      }
    } else {
      wreckHull(k, 0, -40, 0.5, 40, 0x6b6880);
      occ.push([0, -40, 26]);
    }
    for (let i = 0; i < 14; i++) {
      const sp = freeSpot(occ, 6, 20, 95, rr);
      if (!sp) continue;
      shanty(k, sp[0], sp[1], 5 + rr() * 6, 3 + rr() * 4, 5 + rr() * 5, rust[i % 4], Math.atan2(-sp[0], -sp[1]), rr);
    }
    for (let i = 0; i < 3; i++) {
      const sp = freeSpot(occ, 8, 30, 90, rr);
      if (sp) junkHeap(k, sp[0], sp[1], 6, 4, 22, rr);
    }
    // lookout tower with a searchlight
    const tx = -30, tz = 30, th = 18;
    k.at(tx, tz);
    lattice(k, 0, 0, th, 2.2, 1.4, 4, T(0x3a3a3a), T(RUST), { r: 0.2 });
    k.box(4.4, 0.4, 4.4, T(0x6b5a3a), 0, th, 0, { outline: 0.05 });
    for (const s of [-1, 1]) { k.box(4.4, 1, 0.15, T(RUST), 0, th + 0.4, s * 2.15, { outline: 0 }); k.box(0.15, 1, 4.4, T(RUST), s * 2.15, th + 0.4, 0, { outline: 0 }); }
    k.add(prism(5, 5, 1.6), T(0x3a3a3a), 0, th + 2.8, 0, { outline: 0.05 });
    for (const s of [-1, 1]) k.beam([s * 2, th + 0.4, -2], [s * 2, th + 2.8, -2], 0.08, T(DARK), { outline: 0 });
    k.blinker(0, th + 5, 0, 0xff9f1c, 0.4);
    k.solid(2.2, th / 2, 2.2, 0, 0);
    k.at();
    searchlight(k, tx, th + 0.4, tz, 40);
    // green light string round the yard
    const ring = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU * 0.75 + 0.3; ring.push([Math.cos(a) * 48, 5, Math.sin(a) * 48]); }
    lightString(k, ring, [0x7dff3a, 0x2ee6ff, 0x7dff3a, 0xff9f1c], 7, 1.3);
    for (const [x, y, z] of ring) k.cyl(0.15, 0.2, y, 6, T(DARK), x, 0, z, { outline: 0.03 });
  });
}

// Pirate camp: tents, crates, a flickering fire pit, green lights.
export function buildPirateCamp(world, loc) {
  settle(world, loc, 5101 + loc.id.length * 11, (k, { rr }) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + rr(), x = Math.cos(a) * 28, z = Math.sin(a) * 28;
      k.at(x, z, a);
      if (i % 2) {
        k.add(prism(6, 4.6, 3.2), T([0x6b5a3a, 0x5a3a5a, 0x4f5a42][i % 3]), 0, 0, 0, { outline: 0.08 });
        k.box(0.1, 2, 1.6, T(0x1d1a29), 3.02, 0, 0, { outline: 0 });
        k.solid(3, 1.6, 2.3, 0, 0);
      } else shanty(k, 0, 0, 6, 3.6, 5, [0x8a4b2a, 0x6b5a3a][i % 2], 0, rr);
      k.at();
      crate(k, x * 0.75 + 2, 0, z * 0.75, 1.1, 0x5a3a22, a);
    }
    // fire pit (the camp flag is at the centre)
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.add(new THREE.DodecahedronGeometry(0.5, 0), T(0x55505e), Math.cos(a) * 2, 0.3, 8 + Math.sin(a) * 2, { outline: 0.03 }); }
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.9 - i * 0.2, 2 - i * 0.3, 6), glow([0xff9f1c, 0xffd23f, 0xff2a4a][i]));
      f.userData.tick = (o, dt, t) => { o.scale.set(1, 0.8 + Math.abs(Math.sin(t * 9 + i * 2)) * 0.5, 1); o.rotation.y += dt * 2; };
      k.dyn(f, (i - 1) * 0.4, 0.9, 8 + (i % 2) * 0.4);
    }
    lightString(k, [[-14, 4, -8], [0, 4.6, -16], [14, 4, -8]], [0x7dff3a, 0xff9f1c], 7, 1);
    for (const [x, z] of [[-14, -8], [0, -16], [14, -8]]) k.cyl(0.12, 0.16, 4, 6, T(DARK), x, 0, z, { outline: 0.02 });
  });
}

// canvas terminal page of phosphor text lines
function screenTex(lines, { fg = '#8dffb4', bg = '#07120c', head = null, hc = '#ffd23f', w = 512, h = 320 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  let y = 14;
  if (head) {
    g.fillStyle = hc; g.fillRect(0, 0, w, 52);
    g.fillStyle = bg; g.font = pixelFont(26); g.textBaseline = 'middle';
    g.fillText(head, 16, 28);
    y = 66;
  }
  g.font = pixelFont(18); g.textBaseline = 'top';
  for (const ln of lines) {
    g.fillStyle = ln.startsWith('!') ? '#ff3b5c' : ln.startsWith('*') ? '#ffd23f' : fg;
    g.fillText(ln.replace(/^[!*]/, ''), 16, y);
    y += 30;
  }
  for (let sy = 0; sy < h; sy += 4) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, sy, w, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// =============================================================================================
// Job terminal (ILMB): kiosk on a stepped plinth, main contract screen between two angled side screens (scrolling uplink feed,
// route map), lit canopy, turning holo ring, antenna. Faces local +z.
// =============================================================================================
export function jobTerminal(world, loc, x, z, yaw = 0, color = 0xffd23f) {
  settle(world, loc, 1201, (k) => {
    k.at(x, z, yaw);
    k.box(18, 0.5, 9, T(CONC), 0, 0, 0, { outline: 0.06 });
    k.box(15, 0.4, 7, T(PANEL), 0, 0.5, 0.4, { outline: 0.04 });
    k.box(15.2, 0.12, 0.2, G(0x2ee6ff), 0, 0.9, 3.9, { outline: 0 });
    // tall console with a sloped desk under the main screen
    k.box(10, 9, 2.2, T(0x2a2540), 0, 0.9, -0.8, { outline: 0.1 });
    k.add(new THREE.BoxGeometry(10, 0.6, 2.6), T(color), 0, 2.4, 1.2, { rx: 0.35, outline: 0.05 });
    for (let i = 0; i < 8; i++) k.box(0.6, 0.12, 0.4, G([0x2ee6ff, 0x7dff6a, 0xff3b5c, 0xffd23f][i % 4]), -3.5 + i, 2.75, 1.3, { rx: 0.35, outline: 0 });
    k.box(10.6, 0.5, 2.8, T(color), 0, 9.9, -0.8, { outline: 0.05 });
    // side wings angled toward the viewer
    for (const s of [-1, 1]) {
      k.add(new THREE.BoxGeometry(5, 6.4, 1.2), T(0x2a2540), s * 7.4, 5.4, 0, { ry: -s * 0.45, outline: 0.08 });
      k.add(new THREE.BoxGeometry(5.3, 0.4, 1.4), T(color), s * 7.4, 8.8, 0, { ry: -s * 0.45, outline: 0.04 });
      k.beam([s * 7.4, 0.9, 0], [s * 7.4, 2.2, 0], 0.3, T(STEEL), { outline: 0.03 });
    }
    // canopy on two posts with a light strip
    for (const s of [-1, 1]) k.beam([s * 8.5, 0.9, 3.4], [s * 8.5, 12.4, 3.4], 0.18, T(STEEL), { outline: 0.03 });
    k.box(19, 0.5, 6.6, T(0x3a3550), 0, 12.4, 0.8, { outline: 0.08 });
    k.box(19.2, 0.25, 6.8, T(color), 0, 12.9, 0.8, { outline: 0 });
    k.box(17, 0.15, 0.3, G(0xfff6a8), 0, 12.3, 3.6, { outline: 0 });
    k.cyl(0.12, 0.18, 5, 6, T(DARK), 6.5, 13.1, -1, { outline: 0.02 });
    k.blinker(6.5, 18.4, -1, 0xff2a4a, 0.35);
    k.solid(9.2, 6.6, 4.5, 0, 0);
    // screens
    const scr = (tex, w, h, px, py, pz, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
      k.dyn(m, px, py, pz, ry);
      return m;
    };
    scr(screenTex(['> CONTRACTS ONLINE', '  PRESS F AT THE BOARD', '', '*  PRIORITY RUNS PAY MORE', '  CARGO · ROUTE · CLOCK', '! HOT CARGO DRAWS PIRATES', '  DELIVER IN STYLE'], { head: 'JOB BOARD', hc: '#ffd23f' }), 9, 5.6, 0, 6, 0.33);
    const feed = screenTex(['UPLINK 7 ... OK', 'SAT-7 ...... DRIFT', 'MERIDIAN .... 1204.5', 'KEPLER ...... OPEN', '!DARK SIDE .. HOSTILE', 'VOSTOK ...... ARMED', 'DAEDALUS .... ????', 'TRAFFIC ..... HEAVY', 'UPLINK 7 ... OK', 'SAT-7 ...... DRIFT', 'MERIDIAN .... 1204.5', 'KEPLER ...... OPEN'], { w: 256, h: 512 });
    feed.wrapT = THREE.RepeatWrapping;
    feed.repeat.set(1, 0.6);
    const f = scr(feed, 4.2, 5.4, -7.4 + Math.sin(0.45) * 0.62, 5.4, Math.cos(0.45) * 0.62, 0.45);
    f.userData.tick = (o, dt) => { feed.offset.y = (feed.offset.y - dt * 0.05 + 1) % 1; };
    scr(screenTex(['  ILMB ─┬─ TRANQ', '        ├─ MERIDIAN', '        ├─ KEPLER', '        └─ TWILIGHT', '', '* ROUTES CLEAR', '! PIRATE ACTIVITY', '! PAST THE TERMINATOR'], { head: 'ROUTES', hc: '#2ee6ff', w: 384, h: 480 }), 4.2, 5.4, 7.4 - Math.sin(0.45) * 0.62, 5.4, Math.cos(0.45) * 0.62, -0.45);
    // holo ring above the canopy
    const holo = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 6, 32), glow(0x2ee6ff));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 6, 28), glow(color));
    ring2.rotation.x = Math.PI / 2;
    holo.add(ring, ring2);
    holo.userData.tick = (o, dt, t) => { ring.rotation.y += dt * 1.2; ring2.rotation.z += dt * 0.8; o.position.y = 15.2 + Math.sin(t * 1.5) * 0.25; };
    k.dyn(holo, 0, 15.2, 0.8);
  });
}

// =============================================================================================
// Lucky Crater Casino forecourt (the hall is casinoWorld.js): a neon avenue from the doors to a fountain plaza, with parked
// hover-cars in a wing each side.
// =============================================================================================
export function dressCasinoLot(world, loc, makeCar) {
  const PINK = 0xff2e88, CYAN = 0x2ee6ff, GOLD = 0xffd23f, ASPH = 0x34304a, CRM = 0xd8d4e8;
  const keep = (x, z, r) => (loc.keep ||= []).push({ x, z, r });
  const cars = [];
  const FZ = 98, PR = 17; // plaza centre and radius
  // Valet Court (docs/casino-forecourt.md): asphalt from the doors to z 58, then a paved walkway to the plaza. The court is an avenue
  // (AV either side of the middle) down which the carpet runs, with a parking wing each side behind the slot carousels: two rows of
  // BAYW x BAYD bays either side of an aisle, walled by giant cards (NMOD modules of MOD m between posts), open at the aisle's mouth.
  const AV = 8.6, W0 = 38.4, W1 = 58.4, MID = (W0 + W1) / 2, MOD = 2.4, NMOD = 14, XA = AV + 0.36, XB = XA + 0.72 + NMOD * MOD;
  const BX0 = 11, BAYW = 5.2, NB = 6, BAYD = 6.2;
  const bayZ = [W0 + 0.6 + 0.4 + BAYD / 2, W1 - 0.6 - 0.4 - BAYD / 2];   // row centres (z 42.5 and 54.3)
  settle(world, loc, 7707, (k) => {
    // ---- avenue: asphalt from the hall floor through the door wall to the court's far edge, gold edge lines meeting the wall's
    // plinth beyond the gate piers (at 6 to 7.35); neon lamp posts ----
    const DOOR_Z = FRONT_OUT, b1 = FZ - PR + 1;
    k.box(2 * AV, 0.1, W1 - DOOR_Z, T(0x4a4060), 0, 0, (DOOR_Z + W1) / 2, { outline: 0 });
    for (const s of [-1, 1]) k.box(0.3, 0.13, W0 - DOOR_Z, T(GOLD), s * AV, 0, (DOOR_Z + W0) / 2, { outline: 0 });
    // through the doors, just under the red carpet strip, so the road meets the hall floor
    k.box(2 * HALL.DOOR + 1, 0.06, DOOR_Z - HALL.FRONT + 0.1, T(0x4a4060), 0, 0, (HALL.FRONT + DOOR_Z) / 2, { outline: 0 });
    // lamp post (build_casino.py) scaled by `sc`, small lamp toward `yaw`'s +z; `accent` colours rings, lantern and small lamp
    const lamp = casinoNode('lamp_post');
    const lampAt = (x, z, accent, sc, yaw) => {
      k.at(x, z, yaw);
      k.baked(lamp, (slot) => slotMat(casinoSlot(slot, accent)), new THREE.Matrix4().makeScale(sc, sc, sc));
      k.at();
    };
    // forecourt-kit piece (build_lot.py) at (x, z), turned by yaw
    const I4 = new THREE.Matrix4();
    const lotAt = (name, x, z, yaw = 0) => {
      k.at(x, z, yaw);
      k.baked(lotNode(name), (slot) => slotMat(lotSlot(slot)), I4);
      k.at();
    };
    let lampN = 0;
    const post = (x, z, sc = 0.92) => {            // small lamp faces the middle of the way
      lampAt(x, z, lampN++ % 2 ? PINK : CYAN, sc, x < 0 ? Math.PI / 2 : -Math.PI / 2);
      k.column(0.5, 7.5, x, z);
    };
    // lamps: the wings' north corners, the outer south corners, and each side of the walkway start
    for (const s of [-1, 1]) {
      for (const x of [AV + 1.2, XB + 1.1]) post(s * x, W0 - 1.2);
      post(s * (XB + 1.1), W1 + 1.2);
      post(s * 7.4, W1 + 2);
    }
    // ---- the fountain plaza ----
    // gold-edged paving, a ring of chip-coloured tiles round the basin
    k.cyl(PR, PR + 0.3, 0.14, 48, T(0x4a4060), 0, 0, FZ, { outline: 0.03 });
    k.ring(PR - 0.4, 0.14, G(GOLD), 0, 0.15, FZ);
    for (let i = 0; i < 16; i++) {
      const g = new THREE.RingGeometry(10, 12.5, 4, 1, (i / 16) * TAU, TAU / 16).rotateX(-Math.PI / 2);
      k.add(g, T(i % 2 ? 0x8a1030 : 0x2a1450), 0, 0.16, FZ, { outline: 0 });
    }
    k.ring(12.6, 0.1, G(GOLD), 0, 0.17, FZ);
    // fountain with the casino's chip on top
    fountain(k, 0, FZ);
    // benches facing in (none across the -z way in)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + TAU / 12;
      if (Math.sin(a) < -0.9) continue;
      const x = Math.cos(a) * 14.4, z = FZ + Math.sin(a) * 14.4;
      k.at(x, z, -a + Math.PI / 2);
      k.box(3.4, 0.2, 1.0, T(0x8a1030), 0, 0.55, 0, { outline: 0.03 });
      k.box(3.4, 0.7, 0.18, T(0x8a1030), 0, 0.75, 0.45, { outline: 0.03 });
      for (const s of [-1, 1]) k.box(0.2, 0.55, 0.9, T(0x2a1450), s * 1.4, 0, 0, { outline: 0.02 });
      k.solid(1.7, 0.72, 0.55, 0, 0);
      k.at();
    }
    // small lamp posts between the benches, small lamps facing the fountain
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * 15, z = FZ + Math.sin(a) * 15;
      lampAt(x, z, i % 2 ? PINK : CYAN, 0.62, Math.atan2(-Math.cos(a), -Math.sin(a)));
      k.column(0.7, 1, x, z);
      k.column(0.25, 5, x, z);
    }
    keep(0, FZ, PR + 2);
    keep(0, 40, 22);
    // ---- walkway from the court to the plaza: gold lines either side of the carpet, chip inlays every 6 m, chip-stack bollards ----
    k.box(10.4, 0.1, b1 - W1, T(0x6a5a8a), 0, 0, (W1 + b1) / 2, { outline: 0 });
    for (const s of [-1, 1]) {
      k.box(0.25, 0.13, b1 - W1, T(GOLD), s * 5.0, 0, (W1 + b1) / 2, { outline: 0 });
      for (let i = 0, z = W1 + 3.6; z < b1 - 1; i++, z += 6) k.cyl(0.7, 0.7, 0.04, 16, i % 2 ? G(CYAN) : G(PINK), s * 4.1, 0.1, z, { outline: 0 });
      for (let z = W1 + 2; z < b1 - 1; z += 3) { lotAt('lot_chip_bollard', s * 5.6, z); k.column(0.45, 1, s * 5.6, z); }
    }
    // card-stripe crossing where the court meets the walkway
    for (let i = 0; i < 9; i++) k.box(1.1, 0.02, 2, T(i % 2 ? GOLD : 0x2a1450), -AV + 0.6 + i * 1.9, 0.1, W1 - 1, { outline: 0 });
    keep(0, (W1 + b1) / 2, 14);

    // ---- the court's two wings ----
    for (const s of [-1, 1]) {
      const x0 = AV, x1 = XB + 0.38;                                              // 2 cm past the card posts' outer faces
      k.box(x1 - x0, 0.1, W1 - W0 + 0.04, T(ASPH), s * (x0 + x1) / 2, 0, MID, { outline: 0 });   // and 2 cm past the card walls' backs (no shared edge face)
      for (const [row, rz] of bayZ.entries()) {
        for (let i = 0; i <= NB; i++) k.box(0.12, 0.02, BAYD - 0.2, T(CRM), s * (BX0 + i * BAYW), 0.1, rz, { outline: 0 });
        for (let i = 0; i < NB; i++) {
          const bx = s * (BX0 + (i + 0.5) * BAYW), head = row === 0 ? W0 + 1.0 + 0.5 : W1 - 1.0 - 0.5;
          lotAt('lot_bay_stud', bx, head);
          // most bays hold a nose-in hover-car
          if ((i * 5 + (row === 0 ? 1 : 3) + (s > 0 ? 2 : 0)) % 4 !== 0) cars.push([bx, rz, row === 0 ? Math.PI : 0]);
        }
      }
      // card wall: north and south runs between posts, two outer-end stubs either side of the aisle's mouth
      for (const z of [W0 + 0.3, W1 - 0.3]) {
        for (let i = 0; i < NMOD; i++) lotAt('lot_card_wall', s * (XA + 0.36 + MOD * (i + 0.5)), z);
        for (const x of [XA, XB]) lotAt('lot_card_post', s * x, z);
        k.solid((XB - XA) / 2 + 0.36, 0.65, 0.3, s * (XA + XB) / 2, z);
      }
      for (const dir of [1, -1]) {
        const zc = (z) => MID + dir * (z - MID);                                  // south stub mirrors the north
        for (let i = 0; i < 2; i++) lotAt('lot_card_wall', s * XB, zc(W0 + 0.3 + 0.36 + MOD * (i + 0.5)), Math.PI / 2);
        lotAt('lot_card_post', s * XB, zc(W0 + 0.3 + 0.36 + 2 * MOD + 0.36));
        k.solid(0.3, 0.65, 2.4 + 0.36, s * XB, zc(W0 + 0.3 + 0.36 + MOD + 0.18));
      }
      // P pylons at the outer end, facing the road
      for (const dz of [-6.4, 6.4]) { lotAt('lot_pylon_p', s * (XB + 2.4), MID + dz, s * Math.PI / 2); k.solid(0.5, 2.3, 0.5, s * (XB + 2.4), MID + dz); }
      keep(s * 26, MID, 22);
    }
    // a road from each aisle end out to the ring road (traffic.js pavedStrip bed, blending under the wings' asphalt)
    loc.paved = [-1, 1].map((s) => ({ x0: s * (XB - 4), z0: MID, x1: s * 150, z1: MID, ring: true }));   // joins the ring by flared sweeps (traffic.js inletFor)
  });
  // parked cars (shared baked models), each a solid block
  cars.forEach(([x, z, yaw], i) => {
    world.put(makeCar({ paint: i * 2 }).root, loc, x, z, 1.15, yaw + (((i * 7) % 5) - 2) * 0.03); // civilian paints in turn
    world.col(loc, { type: 'box', x, y: 1.2, z, hx: 1.7, hy: 1.2, hz: 3.1, yaw });
  });
}
