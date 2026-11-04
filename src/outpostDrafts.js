import * as THREE from 'three';
import { Kit, T, G, D, GLASS, prism, sandbags, crate, tank, junkHeap, lightString, scatterDebris, damage, PALETTE, DRAFT_BUILD } from './outpostModels.js';
import { cargoStack, lattice, quonset, habDome, dishStation } from './settlements.js';
const dishStationImpl = (...a) => dishStation(...a);
import { FACTIONS } from './locations.js';

// Draft reworks of the seven small outposts (docs/outpost-proposals/README.md): two each, A and B, built to scale (doors 2.6 m+,
// storeys 3.5 to 4 m, people 1.8 m) on a 40 m yard instead of 24 to 27 m. Switched on with `?outpostDraft=a|b` (or per kind,
// `?outpostDraft=kiosk:a,tower:b`) or localStorage['mr-outpost-draft']; outpostModels.js outpostTemplate builds them in place of
// the Kit originals, FLAT_R grows to 44. Each builder keeps the template contract (cols, hits, raid, smoke, drop) and has a wreck.
// Faction styling: the owner is read back from the faction colour (factionOf), and each faction has its own palette (STYLE).
const { STEEL, DARK, LIGHT, CREAM, CONC, YEL, WOOD, RUST, TYRE, CHAR } = PALETTE;
const F = 0.3; // apron top
const R = 40; // yard radius
const TAU = Math.PI * 2;
const WARM = 0xfff6a8, GLASSC = 0x9be7ff;

// ---------- faction look ----------
const STYLE = {
  spacecom: { body: 0xf3eee4, panel: 0xd8d2c4, dark: 0x1b2a5a, roof: 0x3a4a78, trim: 0xffd23f, glow: 0xfff3b0, conc: 0xb8b2a6 },
  vostok: { body: 0x8f8a84, panel: 0x77736e, dark: 0x3a3a34, roof: 0x55524c, trim: 0xff3b5c, glow: 0xffb27a, conc: 0x8a8680 },
  daedalus: { body: 0x3a3450, panel: 0x2c2740, dark: 0x1a1626, roof: 0x241f34, trim: 0xc77dff, glow: 0xd9a8ff, conc: 0x4a4560 },
  meridian: { body: 0xf2f4fa, panel: 0xd6dcea, dark: 0x1b3a8f, roof: 0x2a4aa0, trim: 0x2ec4ff, glow: 0xbff0ff, conc: 0xc8c2b8 },
  kepler: { body: 0xfff0d8, panel: 0xe8d4b4, dark: 0x5a3a2a, roof: 0x8a4a2a, trim: 0xff9f1c, glow: 0xffe6a8, conc: 0xbcae98 },
  rustmoon: { body: 0x6b5a4a, panel: 0x7a4a32, dark: 0x2a2433, roof: 0x5a3a2a, trim: 0x7dff3a, glow: 0x7dff3a, conc: 0x6f6878 },
};
const FAC_BY_COLOR = new Map(Object.entries(FACTIONS).map(([id, f]) => [new THREE.Color(f.color).getHex(), id]));
const factionOf = (c, fallback) => FAC_BY_COLOR.get(c) || fallback;
const style = (k, fallback) => STYLE[factionOf(k.c, fallback)] || STYLE[fallback];

// ---------- frames ----------
const _M = new THREE.Matrix4();
// draw fn() in a frame at (x, z) turned by yaw, inside the current one (Kit.at replaces the frame; this nests). Colliders follow
// the frame's x, z and yaw; keep frames at ground level.
function within(k, x, z, yaw, fn) {
  const sb = k.base.clone(), sy = k.yaw;
  k.base.multiply(_M.makeRotationY(yaw).setPosition(x, 0, z));
  k.yaw += yaw;
  fn();
  k.base.copy(sb);
  k.yaw = sy;
}
const polar = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];
const face = (x, z) => Math.atan2(-x, -z); // yaw that turns local +z towards the centre

// ---------- people (static, baked; strollers on a slow turning ring) ----------
const SUITS = [0xff9f1c, 0x2ec4ff, 0xf3eee4, 0xff5c8a, 0x7dff3a, 0xffd23f, 0xb36bff, 0x6f7a5a, 0xd9482b];
// a 1.8 m person in a suit and helmet facing local +z. pose: stand, walk, sit (on a seat 0.46 m up), wave
function person(k, x, z, yaw, rr, { pose = 'stand', suit = SUITS[Math.floor(rr() * SUITS.length)], helmet = 0xf3eee4, y = 0 } = {}) {
  within(k, x, z, yaw, () => {
    const S = T(suit), Dk = T(0x2a2540), o = { outline: 0.025 };
    let hip = 0.86;
    if (pose === 'sit') {
      hip = 0.5;
      for (const s of [-1, 1]) {
        k.box(0.17, 0.16, 0.5, S, s * 0.11, y + 0.44, 0.18, o);
        k.box(0.15, 0.5, 0.17, Dk, s * 0.11, y, 0.4, o);
      }
    } else if (pose === 'walk') {
      for (const s of [-1, 1]) {
        const a = s * 0.32;
        k.box(0.16, 0.86, 0.2, s < 0 ? S : S, s * 0.11, y + hip - 0.43 * Math.cos(a) - 0.43, 0.43 * Math.sin(a), { rx: a, ...o });
      }
    } else {
      for (const s of [-1, 1]) k.box(0.16, 0.86, 0.2, S, s * 0.11, y, 0, o);
    }
    k.box(0.44, 0.6, 0.27, S, 0, y + hip, 0, o); // torso
    k.box(0.32, 0.38, 0.16, Dk, 0, y + hip + 0.16, -0.2, o); // pack
    const sh = y + hip + 0.56;
    for (const s of [-1, 1]) {
      if (pose === 'wave' && s > 0) k.box(0.12, 0.56, 0.14, S, s * 0.33, sh - 0.05, 0, { rz: 2.6, ...o });
      else if (pose === 'walk') k.box(0.12, 0.56, 0.14, S, s * 0.29, sh - 0.56, 0, { rx: s * -0.3, ...o });
      else k.box(0.12, 0.56, 0.14, S, s * 0.29, sh - 0.56, pose === 'sit' ? 0.05 : 0, o);
    }
    k.ball(0.2, T(helmet), 0, sh + 0.22, 0, o);
    k.box(0.26, 0.13, 0.08, T(0x24305a), 0, sh + 0.16, 0.16, { outline: 0 });
  });
}
// people walking round a ring of radius r (dir +1 counter-clockwise from above), turning `rate` rad/s: a separate baked
// object the place spins (territory.js movers, userData.spin as a rate)
function strollers(k, r, n, rate, rr, y = F) {
  if (k.wreck) return;
  const q = new Kit(k.c, 991 + Math.round(r * 13), false);
  const dir = Math.sign(rate);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rr() * 0.4, rad = r + (rr() - 0.5) * 1.6;
    const [x, z] = polar(rad, a);
    person(q, x, z, a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2), rr, { pose: 'walk', y });
    if (rr() < 0.35) { const [x2, z2] = polar(rad + 0.7, a + 0.06 * dir); person(q, x2, z2, a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2), rr, { pose: 'walk', y }); }
  }
  const g = q.finish().root;
  g.userData.spin = rate;
  k.dyn(g, 0, 0, 0);
}

// ---------- yard furniture ----------
function bench(k, x, z, yaw, len = 2.4, color = WOOD) {
  within(k, x, z, yaw, () => {
    k.box(len, 0.1, 0.55, T(color), 0, F + 0.4, 0, { outline: 0.03 });
    k.box(len, 0.5, 0.08, T(color), 0, F + 0.55, -0.3, { rx: -0.12, outline: 0.03 });
    for (const s of [-1, 1]) k.box(0.1, 0.42, 0.5, T(DARK), s * (len / 2 - 0.2), F, 0, { outline: 0 });
    k.solid(len / 2, (0.5 + F) / 2, 0.32, 0, 0);
  });
}
function parasolTable(k, x, z, color, rr, seated = 0) {
  k.cyl(0.55, 0.55, 0.06, 14, T(LIGHT), x, F + 0.72, z, { outline: 0.02 });
  k.cyl(0.06, 0.06, 2.4, 6, T(DARK), x, F, z, { outline: 0.01 });
  k.add(new THREE.ConeGeometry(1.6, 0.55, 8, 1, true), D(color), x, F + 2.5, z, { outline: 0.03 });
  k.column(0.6, F + 0.78, x, z);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5, sx = x + Math.sin(a) * 1.05, sz = z + Math.cos(a) * 1.05;
    k.cyl(0.22, 0.2, 0.46, 8, T(DARK), sx, F, sz, { outline: 0.02 });
    if (i < seated) person(k, sx, sz, a + Math.PI, rr, { pose: 'sit', y: F });
  }
}
function tree(k, x, z, s = 1, leaf = 0x5fbf4a) {
  k.cyl(1.1 * s, 1.2 * s, 0.7, 12, T(0xd8d0c0), x, F, z, { outline: 0.04 });
  k.cyl(1.0 * s, 1.0 * s, 0.04, 12, T(0x4a3a2a), x, F + 0.7, z, { outline: 0 });
  k.cyl(0.14 * s, 0.2 * s, 2.6 * s, 6, T(WOOD), x, F + 0.7, z, { outline: 0.03 });
  k.add(new THREE.IcosahedronGeometry(1.5 * s, 0), T(leaf), x, F + 0.7 + 3.2 * s, z, { outline: 0.05 });
  k.add(new THREE.IcosahedronGeometry(1.0 * s, 0), T(0x4aa83a), x + 0.8 * s, F + 0.7 + 2.6 * s, z + 0.3 * s, { ry: 0.6, outline: 0.04 });
  k.column(1.2 * s, F + 0.7, x, z);
}
function lampPost(k, x, z, h = 5.5, color = WARM, arm = true) {
  k.cyl(0.25, 0.3, 0.3, 8, T(DARK), x, F, z, { outline: 0.02 });
  k.cyl(0.08, 0.11, h, 6, T(DARK), x, F, z, { outline: 0.02 });
  if (arm) {
    for (const s of [-1, 1]) {
      k.beam([x, F + h - 0.3, z], [x + s * 0.7, F + h, z], 0.04, T(DARK), { outline: 0 });
      k.ball(0.22, G(color), x + s * 0.7, F + h - 0.15, z, { outline: 0 });
    }
  } else k.ball(0.28, G(color), x, F + h + 0.2, z, { outline: 0 });
  k.column(0.2, F + h, x, z);
}
function flagPole(k, x, z, h = 11) { k.flag(x, z, h, k.c, F); k.column(0.15, F + h, x, z); }
// The yard's paving: the Kit apron, with floor colliders laid by hand in 2.5 m bands across the disc (each band's box as wide as
// its narrower edge's chord, so nothing stands in the air past the rim) instead of the floor pass's hundreds of row boxes; the
// apron and the paint on it are left out of that pass (Kit.noFloor).
function lastGeo(k, mat) { const l = k.byMat.get(mat); return l && l[l.length - 1]; }
function skipFloor(k, mat) { (k.noFloor ||= new Set()).add(lastGeo(k, mat)); }
function yard(k, color, edge) {
  k.apron(R, color, edge);
  skipFloor(k, T(color));
  const band = 2.5;
  for (let z0 = -R; z0 < R - 1e-6; z0 += band) {
    const z1 = z0 + band, zn = Math.max(Math.abs(z0), Math.abs(z1)), hw = Math.sqrt(Math.max(0, R * R - zn * zn));
    if (hw < 1) continue;
    k.cols.push({ type: 'box', hx: hw, hy: 0.2, hz: band / 2, x: 0, y: F - 0.2, z: (z0 + z1) / 2, yaw: 0, tag: 'floor', floor: true });
  }
}
// (4 mm proud, no floor of their own: they stand on the yard's)
function paint(k, r, w, color) { k.add(new THREE.RingGeometry(r - w, r + w, Math.max(24, Math.round(r * 4)), 1).rotateX(-Math.PI / 2), T(color), 0, F + 0.004, 0, { outline: 0 }); skipFloor(k, T(color)); }
function paintAt(k, x, z, r, w, color, y = 0) { k.add(new THREE.RingGeometry(r - w, r + w, Math.max(24, Math.round(r * 4)), 1).rotateX(-Math.PI / 2), T(color), x, F + y + 0.004, z, { outline: 0 }); }
function paintStrip(k, a, b, w, color, lift = 0) { k.strip(a, b, w, 0.01, T(color), F - 0.006 + lift, { outline: 0 }); if (!lift || lift < 0.05) skipFloor(k, T(color)); }

// A generic ruin: a scorched slab, broken wall stubs round its edge (stubs collide), shards and debris inside.
function ruin(k, x, z, w, d, h, yaw, color, rr, { roof = DARK } = {}) {
  within(k, x, z, yaw, () => {
    k.box(w + 1, 0.06, d + 1, T(CHAR), 0, F, 0, { outline: 0 });
    const wall = (len, along, at, rot) => {
      const n = Math.max(2, Math.round(len / 2.4));
      for (let i = 0; i < n; i++) {
        if (rr() < 0.2) continue;
        const u = -len / 2 + (i + 0.5) * (len / n), hh = 0.6 + rr() * h * 0.75;
        const px = along ? u : at, pz = along ? at : u;
        k.box(along ? len / n : 0.4, hh, along ? 0.4 : len / n, T(rr() < 0.3 ? CHAR : color), px, F, pz, { rz: (rr() - 0.5) * 0.12, outline: 0.05 });
        k.solid(along ? len / n / 2 : 0.2, (F + hh) / 2, along ? 0.2 : len / n / 2, px, pz);
      }
    };
    wall(w, true, d / 2, 0); wall(w, true, -d / 2, 0); wall(d, false, w / 2, 0); wall(d, false, -w / 2, 0);
    // a roof slab fallen in at a slant
    k.box(w * 0.6, 0.35, d * 0.55, T(roof), (rr() - 0.5) * w * 0.3, F + 0.9, (rr() - 0.5) * d * 0.3, { rx: 0.22, rz: -0.18, ry: rr(), outline: 0.06 });
    scatterDebris(k, 0, 0, w * 0.4, d * 0.4, Math.round((w * d) / 14), rr);
    for (let i = 0; i < 5; i++) k.box(0.3, 0.12, 0.3, G(i % 2 ? 0xff7a1a : 0xffb347), (rr() - 0.5) * w * 0.7, F + 0.1, (rr() - 0.5) * d * 0.7, { outline: 0 });
  });
}

// mystery crates (the kiosk's raid loot): purple with a '?'
function mysteryCrates(k, x, z, yaw) {
  within(k, x, z, yaw, () => {
    for (const [cx, cy, cz, s, ry] of [[-0.7, 0, 0, 1.2, 0.2], [0.65, 0, 0.1, 1.1, -0.3], [0, 1.15, 0.05, 1.0, 0.5]]) {
      crate(k, cx, F + cy, cz, s, 0x7b2ff7, ry);
      k.text('?', cx + Math.sin(ry) * (s / 2 + 0.01), F + cy + s * 0.5, cz + Math.cos(ry) * (s / 2 + 0.01), ry, s * 0.62, { fg: '#ff2e88', bg: '#2a1240', back: false, off: 0.02 });
    }
  });
}

// =====================================================================================================================
// TRADING KIOSK (Meridian). A: the Exchange Rotunda, a round vendor pavilion in the middle of a circular plaza, the way a
// grand exchange works: one counter ring everybody trades at, people milling round it, seating gardens in the quadrants.
// =====================================================================================================================
function kioskA(k) {
  const s = style(k, 'meridian'), c = k.c, rr = k.rr;
  yard(k, s.conc, s.dark);
  // paving: concentric rings and four avenues
  for (const [r, w] of [[12.2, 0.18], [18, 0.12], [26.5, 0.18], [34, 0.12]]) paint(k, r, w, s.panel);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; paintStrip(k, polar(12.4, a), polar(R - 1, a), 4.2, 0xd8d0c0); paintStrip(k, polar(12.4, a), polar(R - 1, a), 0.25, c, 0.002); }
  // the rotunda: plinth, back-of-house core, the counter ring, twelve columns under a ribbed dome, the lantern and the spire
  k.cyl(11.6, 12, 0.12, 48, T(s.panel), 0, F, 0, { outline: 0.04 });
  const RC = 4.6, RK0 = 6.4, RK1 = 7.4, RCOL = 10.4, HC = 7.2;
  if (!k.wreck) {
    k.cyl(RC, RC, 5.2, 24, T(s.body), 0, F, 0, { outline: 0.1 });
    k.cyl(RC + 0.12, RC + 0.12, 0.5, 24, T(c), 0, F + 3.4, 0, { outline: 0.03 });
    // eight serving windows lit from inside, the back door at -z
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      within(k, ...polar(RC, a), a, () => {
        k.box(2.2, 1.6, 0.1, G(s.glow), 0, F + 1.25, 0.04, { outline: 0 });
        k.box(2.5, 0.22, 0.4, T(s.dark), 0, F + 2.9, 0.15, { outline: 0.02 });
        k.box(2.3, 0.08, 0.5, T(WOOD), 0, F + 1.18, 0.25, { outline: 0.02 });
      });
    }
    within(k, 0, -RC, Math.PI, () => { k.box(1.6, 2.6, 0.12, T(s.dark), 0, F, 0.02, { outline: 0.02 }); k.box(0.5, 0.2, 0.2, G(WARM), 0, F + 2.8, 0.1, { outline: 0 }); });
    k.column(RC, F + 5.2, 0, 0);
    // counter ring: twelve arc segments, gaps at the back (staff) and the front
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU, a = a0 + TAU / 24;
      if (i === 5 || i === 6) continue; // (the back, -z)
      const rm = (RK0 + RK1) / 2, [x, z] = polar(rm, a), len = TAU * rm / 12 - 0.15;
      within(k, x, z, a, () => {
        k.box(len, 1.05, RK1 - RK0, T(s.body), 0, F, 0, { outline: 0.05 });
        k.box(len + 0.1, 0.1, RK1 - RK0 + 0.3, T(WOOD), 0, F + 1.05, 0.05, { outline: 0.02 });
        k.box(len, 0.25, 0.05, T(c), 0, F + 0.6, (RK1 - RK0) / 2 + 0.01, { outline: 0 });
        // goods on the counter
        for (let j = 0; j < 3; j++) k.add(j % 2 ? new THREE.BoxGeometry(0.4, 0.35, 0.4) : new THREE.SphereGeometry(0.2, 6, 4), T([0xff4f2e, YEL, 0x7dff3a, 0xff7ad9, 0x2ec4ff][Math.floor(rr() * 5)]), -len / 3 + j * (len / 3), F + 1.3, 0, { outline: 0.02 });
        k.solid(len / 2, (F + 1.15) / 2, (RK1 - RK0) / 2 + 0.15, 0, 0);
      });
      // a vendor behind each segment, and a customer or two in front of most
      person(k, ...polar(RK0 - 0.6, a), a, rr, { suit: c });
      if (rr() < 0.75) person(k, ...polar(RK1 + 0.8, a + 0.08), a + Math.PI, rr);
      if (rr() < 0.45) person(k, ...polar(RK1 + 1.9, a - 0.05), a + Math.PI, rr);
    }
    // the canopy
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, [x, z] = polar(RCOL, a);
      k.cyl(0.32, 0.4, HC, 10, T(s.body), x, F, z, { outline: 0.05 });
      k.cyl(0.5, 0.5, 0.4, 10, T(c), x, F, z, { outline: 0.03 });
      k.cyl(0.55, 0.42, 0.4, 10, T(s.panel), x, F + HC - 0.4, z, { outline: 0.03 });
      k.column(0.42, F + HC, x, z);
    }
    k.add(new THREE.TorusGeometry(RCOL, 0.45, 6, 48).rotateX(Math.PI / 2), T(s.body), 0, F + HC + 0.2, 0, { outline: 0.06 });
    // ribbed dome: a shallow cap from the ring beam, ribs in the faction colour, an oculus lantern
    const DR = RCOL + 1.4, DH = 4.2;
    k.add(new THREE.SphereGeometry(1, 36, 8, 0, TAU, 0, Math.PI / 2).scale(DR, DH, DR), T(s.roof), 0, F + HC + 0.3, 0, { outline: 0.1 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const rib = [];
      for (let j = 0; j <= 6; j++) { const t = (j / 6) * (Math.PI / 2) * 0.86; rib.push([Math.sin(a) * Math.cos(t) * (DR + 0.06), F + HC + 0.3 + Math.sin(t) * (DH + 0.06), Math.cos(a) * Math.cos(t) * (DR + 0.06)]); }
      for (let j = 0; j < 6; j++) k.beam(rib[j], rib[j + 1], 0.14, T(c), { outline: 0, seg: 4 });
    }
    const LY = F + HC + 0.3 + DH - 0.5;
    k.cyl(2.4, 2.4, 1.6, 16, G(s.glow), 0, LY, 0, { outline: 0 });
    for (let i = 0; i < 8; i++) { const [x, z] = polar(2.45, (i / 8) * TAU); k.box(0.2, 1.6, 0.2, T(s.dark), x, LY, z, { outline: 0 }); }
    k.cyl(2.9, 2.6, 0.5, 16, T(s.body), 0, LY + 1.6, 0, { outline: 0.05 });
    k.add(new THREE.ConeGeometry(2.0, 2.2, 16), T(c), 0, LY + 3.2, 0, { outline: 0.05 });
    k.cyl(0.08, 0.12, 4.5, 6, T(LIGHT), 0, LY + 4.2, 0, { outline: 0.02 });
    k.blinker(0, LY + 8.9, 0, c, 0.35);
    // the Meridian ring, standing on the lantern
    k.add(new THREE.TorusGeometry(1.4, 0.16, 6, 24), T(c), 0, LY + 6.4, 0, { outline: 0.03 });
    // stepped colliders for the dome (drawn top within 0.3 m)
    for (const [rr0, y1] of [[DR, F + HC + 0.3 + DH * 0.42], [DR * 0.8, F + HC + 0.3 + DH * 0.68], [DR * 0.55, F + HC + 0.3 + DH * 0.9], [2.9, LY + 2.1]]) k.column(rr0, y1, 0, 0, F + HC);
    // name boards hung under the ring beam, four ways
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + TAU / 24;
    }
  } else {
    ruin(k, 0, 0, RC * 1.8, RC * 1.8, 5, 0, s.body, k.wr, { roof: s.roof });
    const wr = k.wr;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, [x, z] = polar(RCOL, a), h = 0.8 + wr() * 4;
      k.cyl(0.32, 0.4, h, 10, T(wr() < 0.4 ? CHAR : s.body), x, F, z, { outline: 0.05 });
      k.column(0.42, F + h, x, z);
      if (i % 3 === 0) k.cyl(0.32, 0.32, 5, 10, T(s.body), x + Math.sin(a) * 2.5, F + 0.35, z + Math.cos(a) * 2.5, { rx: Math.PI / 2, ry: a, outline: 0.05 });
    }
    // the dome down in pieces
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + wr();
      k.add(new THREE.SphereGeometry(1, 10, 4, 0, 1.3, 0, Math.PI / 2).scale(9, 3, 9), D(s.roof), Math.sin(a) * 4, F + 0.2, Math.cos(a) * 4, { ry: a, rx: 0.4, outline: 0.06 });
    }
    for (let i = 0; i < 12; i++) if (wr() < 0.6) { const a = (i / 12) * TAU, [x, z] = polar(6.9, a); k.box(2.4, 0.9, 1, T(wr() < 0.5 ? CHAR : s.body), x, F, z, { ry: a + wr() - 0.5, rx: 0.3, outline: 0.04 }); }
    scatterDebris(k, 0, 0, 9, 9, 18, wr);
  }
  k.hit(RC, 2.6, RC, 0, 0);
  k.hit(RCOL, 1.2, 1.2, 0, RCOL);
  k.smoke = new THREE.Vector3(0, 2.5, 0);
  k.drop = new THREE.Vector3(-17, F, 17);
  // the back yard: stock in Meridian containers, the mystery crates by the back door (raid)
  cargoStack(k, -9, -30, 2, ['meridian'], 0.25, F);
  cargoStack(k, -3.6, -31.4, 1, ['meridian'], 0.25, F);
  cargoStack(k, 8, -29, 1, ['meridian'], -0.4, F);
  mysteryCrates(k, 3.8, -13.8, 0.3);
  k.raidAt(0, -14.5, 0xff2e88);
  // seating gardens in the four quadrants: trees, benches, tables
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * TAU + TAU / 8;
    if (q === 2 || q === 1) { // (the back quadrants: no tables where the containers stand)
      tree(k, ...polar(21, a - 0.22), 1.1);
      tree(k, ...polar(21, a + 0.22), 1.0, 0x6fd05a);
      for (const da of [-0.12, 0.12]) { const [x, z] = polar(17.6, a + da); bench(k, x, z, face(x, z) + Math.PI); if (rr() < 0.7) person(k, x, z, face(x, z) + Math.PI, rr, { pose: 'sit', y: F - 0.0 }); }
      continue;
    }
    tree(k, ...polar(32.5, a - 0.2), 1.25);
    tree(k, ...polar(32.5, a + 0.2), 1.1, 0x6fd05a);
    tree(k, ...polar(21, a), 1.0);
    for (const da of [-0.2, 0.2]) { const [x, z] = polar(21, a + da); bench(k, x, z, face(x, z) + Math.PI); if (rr() < 0.8) person(k, x, z + 0.0, face(x, z) + Math.PI, rr, { pose: 'sit' }); }
    for (const [r2, da] of [[27, -0.1], [27, 0.1], [30.5, 0]]) { const [x, z] = polar(r2, a + da); parasolTable(k, x, z, q % 2 ? c : 0xff5c8a, rr, k.wreck ? 0 : Math.floor(rr() * 3)); }
    for (const da of [-0.3, 0.3]) { const [x, z] = polar(35.5, a + da); bench(k, x, z, face(x, z)); }
  }
  // lamps along the avenues, a ring of them at the plaza's edge
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; lampPost(k, ...polar(15, a), 4.6, s.glow); }
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const a = (i / 4) * TAU; const [x, z] = polar(31, a); lampPost(k, x + Math.cos(a) * sd * 3, z - Math.sin(a) * sd * 3, 5.5, s.glow, false); }
  // chatting groups on the plaza
  if (!k.wreck) for (const [r2, a] of [[14, 0.7], [16, 2.3], [13.5, 4.2], [17, 5.5], [24, 1.6], [24, 4.75]]) {
    const [x, z] = polar(r2, a);
    person(k, x, z, rr() * TAU, rr); person(k, x + 0.9, z + 0.3, face(0.9, 0.3), rr, { pose: rr() < 0.3 ? 'wave' : 'stand' }); if (rr() < 0.5) person(k, x + 0.3, z + 1, face(0.3, 1) + 0.2, rr);
  }
  strollers(k, 12.6, 9, 0.09, rr);
  strollers(k, 23, 11, -0.055, rr);
  // the gate: arch sign, flags, hover-cart park
  flagPole(k, -9.5, 37.3); flagPole(k, 9.5, 37.3);
  for (const [x, z, ry] of [[19, 32, 2.6], [23, 28, 2.4]]) hoverCart(k, x, z, ry, s, rr);
}

// a hover-cart (Meridian trade runabout) with a load of crates
function hoverCart(k, x, z, ry, s, rr) {
  within(k, x, z, ry, () => {
    k.box(2.6, 1.0, 4.8, T(YEL), 0, 0.8, 0, { outline: 0.06 });
    k.box(2.62, 0.24, 4.82, T(s.trim), 0, 1.3, 0, { outline: 0 });
    k.box(2.3, 0.7, 1.3, T(YEL), 0, 1.05, 2.6, { rx: 0.5, outline: 0.04 });
    k.box(1.6, 0.9, 1.0, T(DARK), 0, 1.8, 0.8, { outline: 0.03 });
    k.box(1.9, 0.8, 0.08, GLASS(GLASSC, 0.5), 0, 1.9, 1.6, { rx: -0.4, outline: 0.02 });
    crate(k, -0.45, 1.8, -1.3, 1.0, 0x9a6a3a, 0.2);
    crate(k, 0.55, 1.8, -1.5, 0.85, 0x2b59c3, -0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl(0.5, 0.55, 0.28, 10, T(DARK), sx * 1.05, 0.5, sz * 1.75, { outline: 0.02 });
      k.cyl(0.45, 0.45, 0.05, 10, G(0x2ee6ff), sx * 1.05, 0.45, sz * 1.75, { outline: 0 });
    }
    k.solid(1.4, 1.0, 2.7, 0, 0, 0, 0.3);
  });
}

// =====================================================================================================================
// TRADING KIOSK B: the Market Cross. A two-storey trading house on the crossing of two arcaded lanes: counters on all four
// faces under deep canopies, the glazed trading floor above with its price boards, a clock lantern; four corner cafés, stall
// rows along the lanes.
// =====================================================================================================================
function kioskB(k) {
  const s = style(k, 'meridian'), c = k.c, rr = k.rr;
  yard(k, s.conc, s.dark);
  // the cross: two paved lanes, a square in the middle
  paintStrip(k, [0, -R + 1], [0, R - 1], 8, 0xd8d0c0);
  paintStrip(k, [-R + 1, 0], [R - 1, 0], 8, 0xd8d0c0);
  for (const sd of [-1, 1]) { paintStrip(k, [sd * 4.2, -R + 2], [sd * 4.2, R - 2], 0.2, c, 0.002); paintStrip(k, [-R + 2, sd * 4.2], [R - 2, sd * 4.2], 0.2, c, 0.002); }
  k.box(30, 0.12, 30, T(s.panel), 0, F, 0, { outline: 0.03 });
  const W = 13, H1 = 4.4, H2 = 4.0;
  if (!k.wreck) {
    // ground floor: a solid core with four counters, a canopy each side
    k.box(W - 3, H1, W - 3, T(s.body), 0, F, 0, { outline: 0.1 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      within(k, 0, 0, a, () => {
        const fz = (W - 3) / 2;
        k.box(7.4, 1.8, 0.1, G(s.glow), 0, F + 1.3, fz + 0.03, { outline: 0 });
        k.box(8.6, 1.08, 1.0, T(s.body), 0, F, fz + 0.9, { outline: 0.05 });
        k.box(8.8, 0.1, 1.3, T(WOOD), 0, F + 1.08, fz + 0.9, { outline: 0.02 });
        k.box(8.6, 0.25, 0.05, T(c), 0, F + 0.6, fz + 1.41, { outline: 0 });
        k.solid(4.4, (F + 1.18) / 2, 0.65, 0, fz + 0.9);
        // the canopy: a cantilevered slab with a fascia and stripes
        k.box(W + 2, 0.35, 3.6, T(s.roof), 0, F + H1 - 0.1, fz + 1.8, { outline: 0.06 });
        k.box(W + 2.1, 0.5, 0.12, T(c), 0, F + H1 - 0.25, fz + 3.62, { outline: 0.02 });
        k.solid((W + 2) / 2, 0.18, 1.8, 0, fz + 1.8, 0, F + H1 - 0.1);
        for (let j = -1; j <= 1; j++) person(k, j * 2.6, fz + 0.15, 0, rr, { suit: c });
        for (let j = -1; j <= 1; j++) if (rr() < 0.8) { person(k, j * 2.6 + (rr() - 0.5), fz + 2.1, Math.PI, rr); if (rr() < 0.5) person(k, j * 2.6, fz + 3.1, Math.PI, rr); }
        // goods along the counter
        for (let j = 0; j < 6; j++) k.add(j % 2 ? new THREE.BoxGeometry(0.4, 0.35, 0.4) : new THREE.SphereGeometry(0.2, 6, 4), T([0xff4f2e, YEL, 0x7dff3a, 0xff7ad9, 0x2ec4ff][Math.floor(rr() * 5)]), -3.6 + j * 1.45, F + 1.3, fz + 0.9, { outline: 0.02 });
      });
    }
    k.solid((W - 3) / 2, (F + H1) / 2, (W - 3) / 2, 0, 0);
    // upper floor: the glazed trading floor, price boards on its faces
    const Y2 = F + H1 + 0.25;
    k.box(W, 0.4, W, T(s.body), 0, Y2 - 0.4, 0, { outline: 0.06 });
    k.box(W - 1, H2, W - 1, GLASS(GLASSC, 0.35), 0, Y2, 0, { outline: 0.04 });
    k.box(W - 2.2, H2 - 0.2, W - 2.2, T(s.panel), 0, Y2, 0, { outline: 0 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(0.5, H2, 0.5, T(s.body), sx * (W - 1) / 2, Y2, sz * (W - 1) / 2, { outline: 0.03 });
    for (let i = 0; i < 4; i++) within(k, 0, 0, (i / 4) * TAU, () => {
      k.box(7.2, 2.0, 0.1, G(0x0d1a2a), 0, Y2 + 0.9, (W - 1) / 2 + 0.06, { outline: 0 });
      for (let j = 0; j < 5; j++) k.box(1.0 + rr() * 2.4, 0.14, 0.04, G(j % 2 ? 0x7dff6a : 0xff3b5c), -2.6 + rr() * 2, Y2 + 1.2 + j * 0.34, (W - 1) / 2 + 0.12, { outline: 0 });
    });
    k.box(W + 0.6, 0.6, W + 0.6, T(s.roof), 0, Y2 + H2, 0, { outline: 0.08 });
    k.box(W + 0.7, 0.2, W + 0.7, T(c), 0, Y2 + H2 + 0.6, 0, { outline: 0 });
    k.solid(W / 2 + 0.3, (H2 + 1.2) / 2, W / 2 + 0.3, 0, 0, 0, Y2 - 0.4);
    // the clock lantern on the roof: four faces, a cupola and the Meridian ring
    const Y3 = Y2 + H2 + 0.6;
    k.box(4.4, 4.2, 4.4, T(s.body), 0, Y3, 0, { outline: 0.06 });
    for (let i = 0; i < 4; i++) within(k, 0, 0, (i / 4) * TAU, () => {
      k.add(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24).rotateX(Math.PI / 2), G(0xfff8e0), 0, Y3 + 2.3, 2.23, { outline: 0.02 });
      k.add(new THREE.TorusGeometry(1.55, 0.12, 4, 24), T(s.dark), 0, Y3 + 2.3, 2.27, { outline: 0 });
      k.box(0.1, 1.1, 0.06, T(s.dark), 0, Y3 + 2.75, 2.32, { outline: 0 });
      k.box(0.8, 0.1, 0.06, T(s.dark), 0.35, Y3 + 2.3, 2.32, { outline: 0 });
    });
    k.add(new THREE.ConeGeometry(3.6, 3.0, 4).rotateY(Math.PI / 4), T(s.roof), 0, Y3 + 4.2 + 1.5, 0, { outline: 0.06 });
    k.add(new THREE.TorusGeometry(0.9, 0.12, 6, 20), T(c), 0, Y3 + 8.6, 0, { outline: 0.03 });
    k.cyl(0.06, 0.09, 3.2, 6, T(LIGHT), 0, Y3 + 7.0, 0, { outline: 0.02 });
    k.blinker(0, Y3 + 10.4, 0, c, 0.3);
    k.solid(2.2, 2.1, 2.2, 0, 0, 0, Y3);
    k.column(2.4, Y3 + 5.6, 0, 0, Y3 + 4.2);
  } else {
    ruin(k, 0, 0, W - 2, W - 2, 6, 0, s.body, k.wr, { roof: s.roof });
    const wr = k.wr;
    for (let i = 0; i < 4; i++) within(k, 0, 0, (i / 4) * TAU, () => { k.box(W + 2, 0.35, 3.6, T(s.roof), wr() * 2 - 1, F + 0.9, (W - 3) / 2 + 2.6, { rx: 0.35, rz: 0.1 * (wr() - 0.5), outline: 0.06 }); k.solid((W + 2) / 2, 0.6, 1.8, 0, (W - 3) / 2 + 2.6); });
    k.box(4.4, 4.2, 4.4, T(s.body), 7, F + 2.0, -6, { rx: 1.2, rz: 0.4, outline: 0.06 });
    k.solid(2.5, 2.2, 2.5, 7, -6.5);
    scatterDebris(k, 0, 0, 12, 12, 26, wr);
  }
  k.hit(W / 2, 3, W / 2, 0, 0);
  k.smoke = new THREE.Vector3(0, 3, 0);
  k.drop = new THREE.Vector3(-18, F, 18);
  // corner cafés: an open pavilion with a pyramid roof over tables, planters at its corners
  for (const [qx, qz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = qx * 20, cz = qz * 20;
    if (qx > 0 && qz < 0) { // the back-right corner is the stock yard
      cargoStack(k, cx + 3, cz - 2, 2, ['meridian'], Math.PI / 2, F);
      cargoStack(k, cx - 6, cz - 4, 1, ['meridian'], Math.PI / 2 + 0.1, F);
      cargoStack(k, cx + 3, cz + 7, 1, ['meridian'], 0.3, F);
      continue;
    }
    const P = 4.6, PH = 3.6;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { k.cyl(0.2, 0.24, PH, 8, T(s.body), cx + sx * P, F, cz + sz * P, { outline: 0.03 }); k.column(0.24, F + PH, cx + sx * P, cz + sz * P); }
    k.box(P * 2 + 1, 0.3, P * 2 + 1, T(s.body), cx, F + PH, cz, { outline: 0.05 });
    k.add(new THREE.ConeGeometry(P * 1.62, 2.4, 4).rotateY(Math.PI / 4), T(qx * qz > 0 ? c : 0xff5c8a), cx, F + PH + 0.3 + 1.2, cz, { outline: 0.06 });
    k.solid(P + 0.5, 0.15, P + 0.5, cx, cz, 0, F + PH);
    k.column(P * 1.1, F + PH + 1.2, cx, cz, F + PH + 0.3);
    k.column(P * 0.55, F + PH + 2.3, cx, cz, F + PH + 0.3);
    for (const [tx, tz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
      k.cyl(0.6, 0.6, 0.06, 14, T(LIGHT), cx + tx, F + 0.72, cz + tz, { outline: 0.02 });
      k.cyl(0.08, 0.08, 0.72, 6, T(DARK), cx + tx, F, cz + tz, { outline: 0 });
      k.column(0.6, F + 0.78, cx + tx, cz + tz);
      for (let j = 0; j < 2; j++) { const a = j * Math.PI + 0.4, sx = cx + tx + Math.sin(a) * 1.0, sz = cz + tz + Math.cos(a) * 1.0; k.cyl(0.22, 0.2, 0.46, 8, T(DARK), sx, F, sz, { outline: 0.02 }); if (!k.wreck && rr() < 0.6) person(k, sx, sz, a + Math.PI, rr, { pose: 'sit' }); }
    }
    for (const [sx, sz] of [[-1, 1], [1, -1]]) tree(k, cx + sx * (P + 2.4), cz + sz * (P + 2.4), 0.95);
  }
  // stall rows along the lanes: small awning stalls facing the lane, two each side
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    for (const sd of [-1, 1]) for (const r2 of [27, 34]) {
      if (i === 1 && sd < 0) continue; // (keeps the stock yard's corner open)
      within(k, 0, 0, a, () => stall(k, sd * 7.6, r2, sd > 0 ? -Math.PI / 2 : Math.PI / 2, [c, 0xff5c8a, YEL, 0x7dff3a][(i + (r2 > 30 ? 1 : 0)) % 4], rr));
    }
  }
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const a = (i / 4) * TAU + Math.PI / 4; const [x, z] = polar(13.5, a); lampPost(k, x + sd * 1.2 * Math.cos(a), z - sd * 1.2 * Math.sin(a), 5, s.glow); }
  strollers(k, 15.5, 10, 0.08, rr);
  strollers(k, 21.5, 12, -0.06, rr);
  if (!k.wreck) for (const [x, z] of [[2, 15], [-2.5, 22], [16, -2], [-15, 2.5], [1.5, -16]]) { person(k, x, z, rr() * TAU, rr); person(k, x + 0.9, z + 0.4, face(0.9, 0.4), rr); }
  mysteryCrates(k, 12.5, -10.5, -0.6);
  k.raidAt(10.5, -12.5, 0xff2e88);
  flagPole(k, -6.5, 37.4); flagPole(k, 6.5, 37.4);
  hoverCart(k, 24, 30, 2.5, s, rr);
}
// a market stall facing local +z: counter, posts, striped awning, goods, a stallholder
function stall(k, x, z, ry, awn, rr) {
  within(k, x, z, ry, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, 2.9, 0.14, T(WOOD), sx * 1.9, F, sz * 1.2, { outline: 0.02 });
    k.box(3.8, 1.0, 1.2, T(WOOD), 0, F, 0.5, { outline: 0.04 });
    k.box(3.82, 0.4, 0.05, T(awn), 0, F + 0.5, 1.11, { outline: 0 });
    for (let i = 0; i < 5; i++) k.box(0.78, 0.08, 2.9, T(i % 2 ? 0xffffff : awn), -1.6 + i * 0.8, F + 3.05, 0.4, { rx: 0.28, outline: 0.02 });
    for (let j = 0; j < 6; j++) k.add(j % 3 ? new THREE.SphereGeometry(0.17 + rr() * 0.1, 6, 4) : new THREE.BoxGeometry(0.36, 0.3, 0.36), T([0xff4f2e, YEL, 0x7dff3a, 0xff7ad9, 0xff9f1c, 0x2ec4ff][Math.floor(rr() * 6)]), -1.4 + j * 0.56, F + 1.18, 0.5 + (rr() - 0.5) * 0.5, { outline: 0.02 });
    crate(k, 2.6, F, -0.6, 1.0, 0x9a6a3a, 0.3);
    k.solid(1.9, (F + 1.0) / 2, 0.6, 0, 0.5);
    if (!k.wreck) person(k, 0, -0.5, 0, rr, { suit: awn });
  });
}

DRAFT_BUILD.kiosk = { a: kioskA, b: kioskB };

// ---------- faction marks and shared military pieces ----------
const CARGO_OF = { spacecom: ['spacecom'], vostok: ['vostok'], kepler: ['kepler'], meridian: ['meridian'], daedalus: ['meridian'], rustmoon: ['meridian', 'kepler', 'spacecom'] };
const cargoFor = (k, fb) => CARGO_OF[factionOf(k.c, fb)] || [fb];
function starShape(r, inner = 0.42, n = 5) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * TAU, rad = i % 2 ? r * inner : r; const x = Math.sin(a) * rad, y = Math.cos(a) * rad; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
  return sh;
}
// the owner's mark on a wall (local +z out of the wall at x, y, z, turned ry), about `sz` m across
function emblem(k, x, y, z, ry, sz, fallback) {
  const fac = factionOf(k.c, fallback), s = STYLE[fac] || STYLE[fallback];
  within(k, x, z, ry, () => {
    const flat = (geo, mat, dz = 0.03) => k.add(geo, mat, 0, y, dz, { outline: 0 });
    k.add(new THREE.CylinderGeometry(sz / 2, sz / 2, 0.06, 24).rotateX(Math.PI / 2), T(s.dark), 0, y, 0.03, { outline: 0.02 });
    if (fac === 'vostok') flat(new THREE.ExtrudeGeometry(starShape(sz * 0.4), { depth: 0.05, bevelEnabled: false }), T(s.trim), 0.06);
    else if (fac === 'daedalus') {
      const tri = new THREE.Shape(); tri.moveTo(0, sz * 0.4); tri.lineTo(sz * 0.36, -sz * 0.26); tri.lineTo(-sz * 0.36, -sz * 0.26); tri.lineTo(0, sz * 0.4);
      flat(new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false }), T(s.trim), 0.06);
      flat(new THREE.CylinderGeometry(sz * 0.09, sz * 0.09, 0.06, 12).rotateX(Math.PI / 2), G(0xffffff), 0.13);
    } else if (fac === 'spacecom') {
      for (const dy of [-0.13, 0.13]) for (const sx of [-1, 1]) k.box(sz * 0.36, sz * 0.1, 0.05, T(s.trim), sx * sz * 0.13, y + dy * sz - sz * 0.05, 0.08, { rz: sx * 0.6, outline: 0 });
    } else if (fac === 'rustmoon') {
      flat(new THREE.CylinderGeometry(sz * 0.3, sz * 0.3, 0.05, 14).rotateX(Math.PI / 2), T(0xe8e0cc), 0.07);
      for (const sx of [-1, 1]) flat(new THREE.CylinderGeometry(sz * 0.08, sz * 0.08, 0.05, 8).rotateX(Math.PI / 2).translate(sx * sz * 0.11, sz * 0.03, 0), G(s.trim), 0.1);
    } else if (fac === 'kepler') {
      flat(new THREE.CylinderGeometry(sz * 0.22, sz * 0.22, 0.05, 16).rotateX(Math.PI / 2), T(s.trim), 0.07);
      flat(new THREE.TorusGeometry(sz * 0.34, sz * 0.04, 4, 20), T(0xfff4e0), 0.07);
    } else flat(new THREE.TorusGeometry(sz * 0.3, sz * 0.06, 4, 24), T(s.trim), 0.07);
  });
}
// a soldier or guard in the owner's colours
const guard = (k, x, z, yaw, rr, s, pose = 'stand') => person(k, x, z, yaw, rr, { pose, suit: s.panel === STYLE.spacecom.panel ? 0x55607a : s.body, helmet: s.trim });
// blast wall segment (T-wall) facing local +z: footing, slab, faction band
function tWall(k, x, z, ry, s, band) {
  within(k, x, z, ry, () => {
    k.box(2.4, 0.5, 1.6, T(s.conc), 0, F, 0, { outline: 0.03 });
    k.box(2.35, 3.6, 0.5, T(s.conc), 0, F + 0.5, 0, { outline: 0.05 });
    k.box(2.36, 0.08, 0.52, T(0x5a566a), 0, F + 4.0, 0, { outline: 0 });
    if (band) k.box(2.37, 0.45, 0.52, T(s.trim), 0, F + 2.6, 0, { outline: 0 });
    k.solid(1.2, (F + 4.1) / 2, 0.3, 0, 0);
    k.solid(1.2, (F + 0.5) / 2, 0.8, 0, 0);
  });
}
// a ring of T-walls from a0 to a1 (from +z, turning to +x)
function wallRing(k, r, a0, a1, s) {
  const n = Math.floor(((a1 - a0) * r) / 2.42);
  for (let i = 0; i < n; i++) { const a = a0 + ((i + 0.5) / n) * (a1 - a0); const [x, z] = polar(r, a); tWall(k, x, z, a, s, i % 4 === 0); }
}
// a guard booth with a boom barrier across the gate (local +z out)
function checkpoint(k, x, z, ry, s, rr, gateW = 9) {
  within(k, x, z, ry, () => {
    const bx = gateW / 2 + 2.2;
    k.box(2.6, 0.3, 2.6, T(s.conc), bx, F, 0, { outline: 0.03 });
    k.box(2.2, 2.7, 2.2, T(s.body), bx, F + 0.3, 0, { outline: 0.06 });
    k.box(2.24, 1.0, 2.24, G(s.glow), bx, F + 1.6, 0, { outline: 0 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(0.18, 1.02, 0.18, T(s.dark), bx + sx * 1.1, F + 1.59, sz * 1.1, { outline: 0 });
    k.box(2.8, 0.3, 2.8, T(s.roof), bx, F + 3.0, 0, { outline: 0.04 });
    k.box(2.82, 0.1, 2.82, T(s.trim), bx, F + 3.3, 0, { outline: 0 });
    k.solid(1.4, (F + 3.4) / 2, 1.4, bx, 0);
    // the boom: a striped arm from a post by the booth across the gate, lowered
    k.box(0.5, 1.1, 0.5, T(s.dark), bx - 1.6, F, 0.4, { outline: 0.03 });
    for (let i = 0; i < 8; i++) k.box(gateW / 8, 0.16, 0.16, T(i % 2 ? 0xffffff : 0xff3b5c), bx - 1.6 - (i + 0.5) * (gateW / 8), F + 1.0, 0.4, { outline: i === 0 ? 0.02 : 0 });
    k.box(0.3, 0.9, 0.3, T(s.dark), -gateW / 2 + 0.3, F, 0.4, { outline: 0.02 });
    if (!k.wreck) guard(k, bx - 1.2, 1.8, Math.PI * 0.1, rr, s);
  });
}
function gunPit(k, x, z, s, rr, face0 = 0) {
  sandbags(k, x, z, 2.6, face0 + 0.7, face0 + TAU - 0.7, 3);
  k.cyl(0.35, 0.45, 0.9, 8, T(s.dark), x, F, z, { outline: 0.03 });
  within(k, x, z, face0, () => {
    k.box(0.6, 0.5, 1.0, T(s.dark), 0, F + 0.9, 0, { outline: 0.03 });
    k.cyl(0.09, 0.09, 2.2, 6, T(DARK), 0, F + 1.15, 1.4, { rx: Math.PI / 2, outline: 0.02 });
    k.box(1.2, 0.8, 0.08, T(s.panel), 0, F + 1.0, 0.55, { outline: 0.02 });
  });
  k.column(0.5, F + 1.5, x, z);
  if (!k.wreck) guard(k, x - Math.sin(face0) * 0.9, z - Math.cos(face0) * 0.9, face0, rr, s);
}

// =====================================================================================================================
// WATCHTOWER A: the Fortified Post. A concrete tower with a glazed observation cab, a bermed command bunker you could fit a
// squad in (20 x 12 m, 5 m to the roof), blast walls with a checkpoint, gun pits. SpaceCom cream and navy, Vostok raw
// concrete and red stars, Daedalus violet-black.
// =====================================================================================================================
function towerA(k) {
  const s = style(k, 'spacecom'), c = k.c, rr = k.rr;
  yard(k, s.conc === STYLE.spacecom.conc ? 0x8a8698 : s.conc, s.dark);
  wallRing(k, 37, 0.32, TAU - 0.32, s);
  checkpoint(k, 0, 37.5, 0, s, rr, 11);
  const TX = -13, TZ = -9, H = 24, BX = 11, BZ = -11, BW = 20, BD = 12, BH = 5;
  if (!k.wreck) {
    // the tower: footing, tapered shaft with ribs and slit windows, a door
    k.box(7.5, 0.6, 7.5, T(s.conc), TX, 0, TZ, { outline: 0.05 });
    k.add(new THREE.CylinderGeometry(2.6 * Math.SQRT2, 3.2 * Math.SQRT2, H, 4, 1).rotateY(Math.PI / 4), T(s.body), TX, F + H / 2, TZ, { outline: 0.1 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([TX + sx * 3.25, F, TZ + sz * 3.25], [TX + sx * 2.65, F + H, TZ + sz * 2.65], 0.32, T(s.panel), { outline: 0.03, seg: 4 });
    for (let y = 5; y < H - 2; y += 4.5) for (let f = 0; f < 4; f++) within(k, TX, TZ, (f / 4) * TAU, () => k.box(0.4, 1.4, 0.1, G(s.glow), 0, F + y, 3.2 - (y / H) * 0.6 + 0.02, { rx: Math.atan(0.6 / H), outline: 0 }));
    within(k, TX, TZ, 0, () => {
      k.box(2.0, 2.8, 0.15, T(s.dark), 0, F, 3.22, { outline: 0.02 });
      k.box(2.6, 0.25, 1.0, T(s.trim), 0, F + 3.0, 3.6, { outline: 0.02 });
      k.box(2.4, 0.5, 0.1, T(s.trim), 0, F + 12, 2.95, { outline: 0 });
    });
    k.column(3.2, F + H, TX, TZ);
    // the cab: a gallery slab, sloped glazing, a deep roof
    const Y = F + H;
    k.box(10, 0.5, 10, T(s.dark), TX, Y, TZ, { outline: 0.06 });
    k.solid(5, 0.25, 5, TX, TZ, 0, Y);
    for (const sd of [-1, 1]) {
      k.box(10, 0.12, 0.12, T(s.trim), TX, Y + 1.6, TZ + sd * 4.94, { outline: 0.02 });
      k.box(0.12, 0.12, 10, T(s.trim), TX + sd * 4.94, Y + 1.6, TZ, { outline: 0.02 });
      for (let t = -4; t <= 4; t += 2) { k.box(0.1, 1.1, 0.1, T(s.dark), TX + t * 1.0 + 0.0, Y + 0.5, TZ + sd * 4.94, { outline: 0 }); k.box(0.1, 1.1, 0.1, T(s.dark), TX + sd * 4.94, Y + 0.5, TZ + t, { outline: 0 }); }
    }
    k.box(7, 1.0, 7, T(s.body), TX, Y + 0.5, TZ, { outline: 0.06 });
    k.add(new THREE.CylinderGeometry(4.6 * Math.SQRT2, 3.6 * Math.SQRT2, 2.4, 4, 1).rotateY(Math.PI / 4), GLASS(GLASSC, 0.45), TX, Y + 2.7, TZ, { outline: 0.04 });
    k.add(new THREE.CylinderGeometry(4.4 * Math.SQRT2, 3.4 * Math.SQRT2, 2.3, 4, 1).rotateY(Math.PI / 4), G(s.glow), TX, Y + 2.7, TZ, { outline: 0 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([TX + sx * 3.6, Y + 1.5, TZ + sz * 3.6], [TX + sx * 4.6, Y + 3.9, TZ + sz * 4.6], 0.12, T(s.dark), { outline: 0.02, seg: 4 });
    k.box(11, 0.6, 11, T(s.roof), TX, Y + 3.9, TZ, { outline: 0.08 });
    k.box(11.1, 0.2, 11.1, T(c), TX, Y + 4.5, TZ, { outline: 0 });
    k.solid(4.7, 1.95, 4.7, TX, TZ, 0, Y + 0.5);
    k.solid(5.5, 0.4, 5.5, TX, TZ, 0, Y + 3.9);
    k.cyl(0.07, 0.1, 5, 5, T(LIGHT), TX + 4.2, Y + 4.7, TZ + 4.2, { outline: 0.02 });
    k.blinker(TX + 4.2, Y + 9.9, TZ + 4.2, 0xff2a4a, 0.35);
    k.cyl(0.07, 0.1, 3, 5, T(LIGHT), TX - 4.2, Y + 4.7, TZ - 4.2, { outline: 0.02 });
    // the searchlight on the roof
    const sl = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.0, 8), T(s.dark)); ped.position.y = 0.5; sl.add(ped);
    const head = new THREE.Group(); head.position.y = 1.5; head.rotation.x = 0.38; sl.add(head);
    head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 1.6, 12).rotateX(Math.PI / 2), T(LIGHT)));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 12).rotateX(Math.PI / 2), G(0xfffbe0)); lens.position.z = 0.82; head.add(lens);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 46, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 23.8), (() => { const m = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); return m; })());
    cone.renderOrder = 3; head.add(cone);
    sl.userData.spin = 0.45;
    k.dyn(sl, TX, Y + 4.7, TZ);
    if (!k.wreck) { guard(k, TX + 3.5, TZ + 4.4, 0, rr, s); guard(k, TX - 4.4, TZ - 2, -Math.PI / 2, rr, s); }
    // the bunker: a concrete box with chamfered roof edges, regolith berms on three sides, a blast door in a recessed portal
    within(k, BX, BZ, 0, () => {
      k.box(BW + 1, 0.5, BD + 1, T(s.conc), 0, 0, 0, { outline: 0.05 });
      k.box(BW, BH, BD, T(s.body), 0, F, 0, { outline: 0.12 });
      for (const sd of [-1, 1]) k.add(new THREE.BoxGeometry(BW + 0.01, 1.3, 1.3), T(s.panel), 0, F + BH - 0.2, sd * (BD / 2 - 0.1), { rx: Math.PI / 4, outline: 0.04 });
      k.box(BW - 1.4, 0.6, BD - 1.4, T(s.panel), 0, F + BH, 0, { outline: 0.06 });
      // portal: a frame standing proud, the door, hazard stripes, a lamp each side
      k.box(7, BH - 0.2, 1.0, T(s.conc), 0, F, BD / 2 + 0.4, { outline: 0.06 });
      k.box(4.2, 3.4, 0.2, T(s.dark), 0, F, BD / 2 + 0.92, { outline: 0.03 });
      k.box(0.08, 3.3, 0.24, T(0x55607a), 0, F + 0.05, BD / 2 + 0.95, { outline: 0 });
      for (let i = -3; i <= 3; i++) k.box(0.55, 0.3, 0.06, T(i % 2 ? YEL : DARK), i * 0.62, F + 3.6, BD / 2 + 0.93, { outline: 0 });
      for (const sd of [-1, 1]) { k.box(0.5, 0.35, 0.3, G(WARM), sd * 2.7, F + 3.4, BD / 2 + 0.95, { outline: 0 }); k.box(1.8, 0.35, 0.12, G(s.glow), sd * 6.5, F + 3.3, BD / 2 + 0.02, { outline: 0 }); k.box(1.8, 0.35, 0.12, G(s.glow), sd * (BW / 2 + 0.02), F + 3.3, 0, { ry: Math.PI / 2, outline: 0 }); }
      emblem(k, 0, F + 4.25, BD / 2 + 0.92, 0, 1.2, 'spacecom');
      // roof: a hatch, a periscope, a radio mast, sandbags along the front edge
      k.box(1.6, 0.5, 1.6, T(s.dark), -5, F + BH + 0.6, -2, { outline: 0.03 });
      k.cyl(0.18, 0.18, 1.6, 8, T(s.dark), 3, F + BH + 0.6, -1.5, { outline: 0.02 });
      k.box(0.5, 0.3, 0.5, T(s.dark), 3, F + BH + 2.2, -1.4, { outline: 0.02 });
      k.cyl(0.08, 0.12, 9, 5, T(LIGHT), 7.5, F + BH + 0.6, -3.5, { outline: 0.02 });
      k.blinker(7.5, F + BH + 9.8, -3.5, 0xff2a4a, 0.3);
      k.column(0.2, F + BH + 9.6, 7.5, -3.5);
      for (let i = 0; i < 9; i++) k.add(new THREE.SphereGeometry(0.66, 6, 3).scale(1, 0.5, 0.62), T(0xb59f74), -8 + i * 2, F + BH + 0.88, BD / 2 - 1.3, { ry: Math.PI / 2, outline: 0.03 });
      k.solid(BW / 2, (F + BH + 0.6) / 2, BD / 2, 0, 0);
      k.solid(3.5, (F + BH - 0.2) / 2, 0.5, 0, BD / 2 + 0.4);
      // berms: sloped regolith banks on the back and sides
      const bermM = T(0x75708a);
      k.add(prism(BW + 6, 6, BH - 0.6), bermM, 0, 0, -BD / 2 - 1.4, { outline: 0.08 });
      for (const sd of [-1, 1]) k.add(prism(BD + 2, 6, BH - 0.6), bermM, sd * (BW / 2 + 1.4), 0, -1, { ry: Math.PI / 2, outline: 0.08 });
      for (const [hx, hz, x, z] of [[BW / 2 + 3, 1.5, 0, -BD / 2 - 1.5], [1.5, BD / 2 + 1, BW / 2 + 1.5, -1], [1.5, BD / 2 + 1, -BW / 2 - 1.5, -1]]) k.solid(hx, (BH - 0.6) * 0.33, hz, x, z);
    });
    radarOn(k, BX - 5, F + BH + 0.6, BZ + 2, s);
  } else {
    const wr = k.wr;
    // the tower snapped off, its shaft lying across the yard towards the gate, the cab crushed at its end
    k.box(7.5, 0.6, 7.5, T(s.conc), TX, 0, TZ, { outline: 0.05 });
    k.add(new THREE.CylinderGeometry(3.0 * Math.SQRT2, 3.2 * Math.SQRT2, 6, 4, 1).rotateY(Math.PI / 4), T(s.body), TX, F + 3, TZ, { outline: 0.1 });
    k.column(3.2, F + 6, TX, TZ);
    within(k, TX + 1, TZ + 4, 0.35, () => {
      k.add(new THREE.CylinderGeometry(2.6 * Math.SQRT2, 3.0 * Math.SQRT2, 15, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI / 2 - 0.05), T(s.body), 0, F + 3, 8, { outline: 0.1 });
      k.box(9, 4, 8, T(s.roof), 0.5, F + 0.8, 18, { rx: 0.3, rz: 0.4, outline: 0.08 });
      k.solid(2.9, 2.9, 7.5, 0, 8, 0, F);
      k.solid(4.5, 2, 4, 0.5, 18);
    });
    ruin(k, BX, BZ, BW, BD, BH, 0, s.body, wr, { roof: s.panel });
    within(k, BX, BZ, 0, () => { const bermM = T(0x75708a); k.add(prism(BW + 6, 6, BH - 1.6), bermM, 0, 0, -BD / 2 - 1.4, { outline: 0.08 }); k.solid(BW / 2 + 3, 1.2, 1.5, 0, -BD / 2 - 1.5); });
    scatterDebris(k, TX, TZ, 5, 5, 10, wr);
  }
  k.hit(3.2, H / 2, 3.2, TX, TZ);
  k.hit(BW / 2, BH / 2, BD / 2, BX, BZ);
  k.smoke = new THREE.Vector3(TX, 3, TZ);
  k.drop = new THREE.Vector3(6, F, 14);
  // the lens locker by the bunker door: the raid spot
  within(k, BX + 6, BZ + BD / 2 + 2, 0, () => {
    k.box(1.6, 2.1, 0.9, T(s.panel), 0, F, 0, { outline: 0.05 });
    k.box(1.62, 0.25, 0.92, T(c), 0, F + 1.6, 0, { outline: 0 });
    k.box(1.0, 0.5, 0.05, T(YEL), 0, F + 0.9, 0.46, { outline: 0 });
    k.solid(0.8, (F + 2.1) / 2, 0.45, 0, 0);
    crate(k, 1.8, F, 0.4, 1.0, 0x6f7a5a, 0.2);
    for (const [dx, dz] of [[-0.22, -0.2], [0.22, 0.2]]) k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), G(0xfffbe0), 1.8 + dx, F + 1.03, 0.4 + dz, { outline: 0 });
  });
  k.raidAt(BX + 6, BZ + BD / 2 + 4, 0xffd23f);
  gunPit(k, -20, 18, s, rr, 0.3);
  gunPit(k, 22, 16, s, rr, -0.4);
  cargoStack(k, 27, -2, 2, cargoFor(k, 'spacecom'), 0.1, F);
  cargoStack(k, 27.5, 7, 1, cargoFor(k, 'spacecom'), 0.1, F);
  for (const [x, z] of [[-28, -14], [-4, -28], [26, -20]]) lampPost(k, x, z, 7, s.glow);
  // a squad drilling by the bunker, sentries walking the wall
  if (!k.wreck) for (let i = 0; i < 6; i++) guard(k, BX - 5 + (i % 3) * 1.4, BZ + BD / 2 + 6 + Math.floor(i / 3) * 1.4, 0, rr, s);
  if (!k.wreck) guard(k, BX - 5 + 1.4, BZ + BD / 2 + 9.5, Math.PI, rr, s, 'wave');
  sentries(k, 33.5, 5, -0.05, s, rr);
  flagPole(k, -8.5, 35); flagPole(k, 8.5, 35);
}
function sentries(k, r, n, rate, s, rr) {
  if (k.wreck) return;
  const q = new Kit(k.c, 777 + n, false);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const [x, z] = polar(r, a); person(q, x, z, a + (rate > 0 ? Math.PI / 2 : -Math.PI / 2), rr, { pose: 'walk', y: F, suit: s.panel === STYLE.spacecom.panel ? 0x55607a : s.body, helmet: s.trim }); }
  const g = q.finish().root;
  g.userData.spin = rate;
  k.dyn(g, 0, 0, 0);
}
function radarOn(k, x, y, z, s) {
  const q = new Kit(k.c, 5, false);
  q.cyl(0.5, 0.7, 1.2, 10, T(s.dark), 0, 0, 0, { outline: 0.03 });
  q.add(new THREE.CylinderGeometry(1.4, 1.4, 4.4, 16, 1, true, -0.7, 1.4).rotateZ(Math.PI / 2), D(LIGHT), 0, 1.8, -0.8, { outline: 0.04 });
  q.box(4.4, 0.15, 0.15, T(s.trim), 0, 1.8, 0.45, { outline: 0 });
  q.beam([0, 1.1, 0], [0, 1.8, 0.45], 0.08, T(DARK), { outline: 0 });
  const g = q.finish().root;
  g.userData.spin = 0.8;
  k.dyn(g, x, y, z);
}

// =====================================================================================================================
// WATCHTOWER B: the Lattice Camp. A 32 m steel lattice tower with stair landings and a hexagonal glazed cab; a 26 m Quonset
// barracks and a motor-pool Quonset, a helipad, chain-link fence with a sliding gate, sandbag pits.
// =====================================================================================================================
function towerB(k) {
  const s = style(k, 'spacecom'), c = k.c, rr = k.rr;
  yard(k, 0x8a8698, s.dark);
  // chain-link fence on posts, a gap at the gate
  for (let a = 0.24; a < TAU - 0.24; a += 3.0 / 37) {
    const [x, z] = polar(37, a), [x2, z2] = polar(37, a + 3.0 / 37);
    k.cyl(0.08, 0.08, 3.2, 5, T(s.dark), x, F, z, { outline: 0.02 });
    k.ball(0.12, T(s.dark), x, F + 3.3, z, { outline: 0 });
    if (a + 3.0 / 37 < TAU - 0.24) {
      for (const y of [0.2, 1.6, 3.0]) k.beam([x, F + y, z], [x2, F + y, z2], 0.035, T(s.dark), { outline: 0, seg: 3 });
      k.add(new THREE.PlaneGeometry(Math.hypot(x2 - x, z2 - z), 2.8), GLASS(0x3a3550, 0.35), (x + x2) / 2, F + 1.6, (z + z2) / 2, { ry: Math.atan2(x2 - x, z2 - z) + Math.PI / 2, outline: 0 });
      k.solid(Math.hypot(x2 - x, z2 - z) / 2, (F + 3.2) / 2, 0.1, (x + x2) / 2, (z + z2) / 2, Math.atan2(x2 - x, z2 - z) - Math.PI / 2);
    }
  }
  checkpoint(k, 0, 37.2, 0, s, rr, 16);
  const TX = -14, TZ = -12, H = 30;
  if (!k.wreck) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(2, 0.8, 2, T(s.conc), TX + sx * 4.2, 0, TZ + sz * 4.2, { outline: 0.04 });
    lattice(k, TX, TZ, H, 4.2, 2.4, 8, T(s.panel === STYLE.spacecom.panel ? STEEL : s.panel), T(s.dark), { r: 0.26 });
    // stair landings and flights up the middle (zigzag), a gallery at each fifth of the height
    for (let i = 0; i < 6; i++) {
      const y0 = i * 5, y1 = y0 + 5, w = 4.2 + (2.4 - 4.2) * ((y0 + 2.5) / H);
      k.box(2.6, 0.18, 1.2, T(s.dark), TX, y1, TZ + (i % 2 ? 0.9 : -0.9), { outline: 0.02 });
      k.beam([TX + (i % 2 ? -1 : 1) * 0.9, y0 + 0.1, TZ - (i % 2 ? 0.9 : -0.9)], [TX + (i % 2 ? 1 : -1) * 0.9, y1, TZ + (i % 2 ? 0.9 : -0.9)], 0.5, T(s.dark), { outline: 0.02, seg: 4 });
      if (i === 2) { k.box(w * 2 + 1, 0.25, w * 2 + 1, T(s.dark), TX, y1, TZ, { outline: 0.04 }); k.add(new THREE.TorusGeometry((w + 0.5) * Math.SQRT2, 0.05, 3, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), T(c), TX, y1 + 1.1, TZ, { outline: 0 }); }
    }
    // hexagonal cab: gallery deck, glazing, steel roof, the antenna crown
    const Y = H;
    k.add(new THREE.CylinderGeometry(6, 6, 0.5, 6), T(s.dark), TX, Y + 0.25, TZ, { outline: 0.06 });
    k.add(new THREE.CylinderGeometry(4.4, 4.4, 1.1, 6), T(s.body), TX, Y + 1.05, TZ, { outline: 0.05 });
    k.add(new THREE.CylinderGeometry(4.8, 4.3, 2.4, 6, 1, true), GLASS(GLASSC, 0.45), TX, Y + 2.8, TZ, { outline: 0.03 });
    k.add(new THREE.CylinderGeometry(4.6, 4.1, 2.3, 6), G(s.glow), TX, Y + 2.8, TZ, { outline: 0 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.beam([TX + Math.sin(a) * 4.4, Y + 1.6, TZ + Math.cos(a) * 4.4], [TX + Math.sin(a) * 4.85, Y + 4.0, TZ + Math.cos(a) * 4.85], 0.1, T(s.dark), { outline: 0.02, seg: 4 }); }
    k.add(new THREE.CylinderGeometry(3.0, 6.0, 1.6, 6), T(s.roof), TX, Y + 4.8, TZ, { outline: 0.08 });
    k.add(new THREE.CylinderGeometry(6.05, 6.05, 0.2, 6), T(c), TX, Y + 4.1, TZ, { outline: 0 });
    k.add(new THREE.TorusGeometry(5.9, 0.06, 3, 6).rotateX(Math.PI / 2), T(s.trim), TX, Y + 1.5, TZ, { outline: 0 });
    k.column(6, Y + 0.5, TX, TZ, Y);
    k.column(4.6, Y + 4.0, TX, TZ, Y + 0.5);
    k.column(5.2, Y + 5.0, TX, TZ, Y + 4.0);
    k.column(3.0, Y + 5.6, TX, TZ, Y + 5.0);
    k.cyl(0.08, 0.12, 6, 5, T(LIGHT), TX, Y + 5.6, TZ, { outline: 0.02 });
    k.blinker(TX, Y + 11.8, TZ, 0xff2a4a, 0.4);
    k.box(0.3, 2.2, 0.15, T(LIGHT), TX + 1.4, Y + 5.6, TZ, { outline: 0.02 });
    // the searchlight on the gallery
    const sl = new THREE.Group();
    const head = new THREE.Group(); head.position.y = 0.9; head.rotation.x = 0.42; sl.add(head);
    sl.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.8, 8), T(s.dark)));
    head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 1.4, 12).rotateX(Math.PI / 2), T(LIGHT)));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 12).rotateX(Math.PI / 2), G(0xfffbe0)); lens.position.z = 0.72; head.add(lens);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 48, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 24.7), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.renderOrder = 3; head.add(cone);
    const arm = new THREE.Group(); arm.add(sl); sl.position.set(0, 0, 5.2);
    arm.userData.spin = 0.35;
    k.dyn(arm, TX, Y + 0.9, TZ);
    if (!k.wreck) for (const a of [0.4, 2.9]) guard(k, TX + Math.sin(a) * 5.3, TZ + Math.cos(a) * 5.3, a, rr, s);
  } else {
    const wr = k.wr;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { k.box(2, 0.8, 2, T(s.conc), TX + sx * 4.2, 0, TZ + sz * 4.2, { outline: 0.04 }); const h = 2 + wr() * 5; k.beam([TX + sx * 4.2, 0.6, TZ + sz * 4.2], [TX + sx * 3.9, h, TZ + sz * 3.9], 0.26, T(0x3e4352), { outline: 0.05, seg: 6 }); k.column(0.4, h, TX + sx * 4.1, TZ + sz * 4.1); }
    within(k, TX, TZ, 0.6, () => {
      for (const sx of [-1, 1]) for (const y of [1.0, 4.0]) k.beam([sx * 3.6, y, 2], [sx * 2.2, y * 0.4 + 0.6, 24], 0.24, T(0x3e4352), { outline: 0.05, seg: 6 });
      for (let i = 0; i < 9; i++) { const z = 3 + i * 2.4; k.beam([-3.4 + i * 0.13, 0.8, z], [3.4 - i * 0.13, 3.2, z + 2.4], 0.1, T(DARK)); }
      k.add(new THREE.CylinderGeometry(4.8, 4.3, 2.4, 6), T(s.roof), 0, F + 2, 27, { rx: 1.2, rz: 0.4, outline: 0.08 });
      k.solid(3.4, 2.2, 11, 0, 13);
      k.solid(3.6, 2.6, 2.6, 0, 27);
    });
    scatterDebris(k, TX, TZ, 5, 5, 12, wr);
  }
  k.hit(4, H / 2, 4, TX, TZ);
  k.smoke = new THREE.Vector3(TX, 3, TZ);
  k.drop = new THREE.Vector3(-4, F, 16);
  // the barracks: a 26 m Quonset with a porch and lit windows; a motor-pool Quonset with an open end and a rover
  const QX = 12, QZ = -14;
  if (!k.wreck) {
    quonset(k, QX, QZ, 6.5, 26, s.panel === STYLE.spacecom.panel ? 0x6f7a5a : s.body, Math.PI / 2, c);
    within(k, QX, QZ, Math.PI / 2, () => {
      for (const sd of [-1, 1]) for (let t = -10; t <= 10; t += 4) k.add(new THREE.BoxGeometry(1.2, 0.8, 0.12), G(s.glow), sd * 5.9, F + 2.6, t, { ry: Math.PI / 2, rz: sd * 0.4, outline: 0 });
      k.box(6, 0.25, 3.0, T(s.roof), 0, F + 3.4, 14.3, { outline: 0.04 });
      for (const sd of [-1, 1]) { k.cyl(0.12, 0.12, 3.4, 6, T(s.dark), sd * 2.8, F, 15.6, { outline: 0.02 }); k.column(0.15, F + 3.4, sd * 2.8, 15.6); }
      emblem(k, 0, F + 5.6, 13.03, 0, 1.6, 'spacecom');
    });
    k.solid(13, 3.3, 7, QX, QZ, 0, 0);
  } else {
    ruin(k, QX, QZ, 26, 12, 4, Math.PI / 2, 0x4f5a42, k.wr);
    for (let i = 0; i < 6; i++) k.add(new THREE.TorusGeometry(6.5, 0.15, 4, 16, Math.PI * (0.3 + k.wr() * 0.5)), T(0x3a3f30), QX - 10 + i * 4, 0.3, QZ, { ry: Math.PI / 2, rz: k.wr() * 0.6, outline: 0.03 });
  }
  quonset(k, 22, 10, 4.6, 12, 0x55607a, 0, c);
  rover(k, 22, 19.5, 0.1, s);
  k.hit(13, 3.3, 7, QX, QZ);
  // the helipad
  k.cyl(7.5, 7.8, 0.1, 32, T(0x5a566a), -20, F, 14, { outline: 0.04 });
  paintAt(k, -20, 14, 6.6, 0.15, s.trim, 0.1);
  for (const sx of [-1, 1]) k.box(0.7, 0.006, 4.2, T(s.trim), -20 + sx * 1.3, F + 0.1, 14, { outline: 0 });
  k.box(2.0, 0.006, 0.7, T(s.trim), -20, F + 0.1, 14, { outline: 0 });
  for (let i = 0; i < 8; i++) { const [x, z] = polar(7.3, (i / 8) * TAU); k.box(0.3, 0.02, 0.3, G(s.trim), -20 + x, F + 0.1, 14 + z, { outline: 0 }); }
  // the lens locker at the barracks porch: the raid spot
  within(k, QX + 18, QZ - 2.5, Math.PI / 2, () => { k.box(1.6, 2.1, 0.9, T(s.panel), 0, F, 0, { outline: 0.05 }); k.box(1.62, 0.25, 0.92, T(c), 0, F + 1.6, 0, { outline: 0 }); k.solid(0.8, (F + 2.1) / 2, 0.45, 0, 0); crate(k, 1.6, F, 0.3, 1.0, 0x6f7a5a, 0.2); });
  k.raidAt(QX + 18, QZ + 1, 0xffd23f);
  gunPit(k, 4, 22, s, rr, 0);
  gunPit(k, -30, -4, s, rr, -1.3);
  cargoStack(k, -2, -30, 2, cargoFor(k, 'spacecom'), Math.PI / 2, F);
  cargoStack(k, -11, -31, 1, cargoFor(k, 'spacecom'), Math.PI / 2, F);
  for (const [x, z] of [[30, -10], [-26, 24], [8, 6]]) lampPost(k, x, z, 7, s.glow);
  // a squad drilling on the square in front of the barracks
  if (!k.wreck) { for (let i = 0; i < 8; i++) guard(k, 2 + (i % 4) * 1.4, -2 + Math.floor(i / 4) * 1.4, Math.PI / 2, rr, s); guard(k, 9, -1.3, -Math.PI / 2, rr, s, 'wave'); }
  sentries(k, 33, 4, 0.06, s, rr);
  flagPole(k, -10, 36); flagPole(k, 10, 36);
}
// a six-wheeled patrol rover in the owner's colours, facing local +z
function rover(k, x, z, ry, s) {
  within(k, x, z, ry, () => {
    k.box(2.8, 1.3, 5.6, T(s.body), 0, 0.9, 0, { outline: 0.06 });
    k.box(2.6, 1.0, 2.0, T(s.body), 0, 2.2, 0.8, { outline: 0.05 });
    k.box(2.4, 0.7, 0.08, GLASS(GLASSC, 0.6), 0, 2.4, 1.82, { outline: 0.02 });
    k.box(2.82, 0.3, 5.62, T(s.trim), 0, 1.6, 0, { outline: 0 });
    for (const sx of [-1, 1]) for (const sz of [-2, 0, 2]) k.add(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12).rotateZ(Math.PI / 2), T(TYRE), sx * 1.5, 0.6, sz, { outline: 0.03 });
    k.box(0.8, 0.4, 0.2, G(WARM), -0.8, 1.6, 2.81, { outline: 0 }); k.box(0.8, 0.4, 0.2, G(WARM), 0.8, 1.6, 2.81, { outline: 0 });
    k.solid(1.5, 1.6, 2.9, 0, 0);
  });
}

DRAFT_BUILD.tower = { a: towerA, b: towerB };

// a portal crane over a container lane (static): two A-frame legs on rails, a box girder, a trolley and a hanging spreader
function portalCrane(k, x, z, ry, span, h, s, len = 22) {
  within(k, x, z, ry, () => {
    for (const sd of [-1, 1]) {
      k.box(0.6, 0.25, len, T(s.dark), sd * span / 2, F, 0, { outline: 0.02 });
      for (const e of [-1, 1]) k.beam([sd * span / 2, F + 0.9, e * 2.6], [sd * span / 2, F + h, 0], 0.32, T(s.trim), { outline: 0.04, seg: 6 });
      k.box(1.0, 0.9, 6.2, T(s.trim), sd * span / 2, F, 0, { outline: 0.04 });
      k.column(0.5, F + h, sd * span / 2, 0);
    }
    k.box(span + 2, 1.4, 1.6, T(s.trim), 0, F + h, 0, { outline: 0.06 });
    k.box(span + 2.02, 0.25, 1.62, T(s.dark), 0, F + h + 0.6, 0, { outline: 0 });
    k.box(2.2, 1.4, 2.4, T(s.body), span * 0.15, F + h - 1.4, 0, { outline: 0.04 });
    k.box(1.0, 0.8, 0.08, GLASS(GLASSC, 0.6), span * 0.15, F + h - 1.0, 1.21, { outline: 0 });
    for (const sd of [-1, 1]) k.beam([span * 0.15 + sd * 0.8, F + h - 1.4, 0], [span * 0.15 + sd * 0.8, F + 6.6, 0], 0.04, T(DARK), { outline: 0, seg: 3 });
    k.box(2.6, 0.4, 6.4, T(YEL), span * 0.15, F + 6.2, 0, { outline: 0.04 });
    k.solid(span / 2 + 1, 0.7, 0.8, 0, 0, 0, F + h);
  });
}
// a tank farm: horizontal or vertical tanks inside a low bund wall with a gap at the front
function bund(k, x, z, w, d, ry, s) {
  within(k, x, z, ry, () => {
    for (const [len, px, pz, rot] of [[w, 0, -d / 2, 0], [d, -w / 2, 0, 1], [d, w / 2, 0, 1], [w / 2 - 1.5, -w / 4 - 0.75, d / 2, 0], [w / 2 - 1.5, w / 4 + 0.75, d / 2, 0]]) {
      k.box(rot ? 0.5 : len, 1.0, rot ? len : 0.5, T(s.conc), px, F, pz, { outline: 0.04 });
      k.solid(rot ? 0.25 : len / 2, (F + 1) / 2, rot ? len / 2 : 0.25, px, pz);
    }
    for (let i = 0; i < 9; i++) k.box(0.4, 0.02, 0.9, T(YEL), -w / 2 + 1 + i * (w - 2) / 8, F + 1.0, d / 2, { outline: 0 });
  });
}

// =====================================================================================================================
// SUPPLY DEPOT A: the Distribution Shed. A 34 m north-light warehouse with three loading bays and a raised dock, a container
// yard under a portal crane, a bunded fuel farm, a pad for supply landers, the yard office.
// =====================================================================================================================
function depotA(k) {
  const s = style(k, 'spacecom'), c = k.c, rr = k.rr;
  yard(k, 0x8a8698, s.dark);
  paintStrip(k, [0, 38], [0, 6], 6.5, 0x6f6b7e);
  paintStrip(k, [-30, 2], [30, 2], 6.5, 0x6f6b7e);
  const WX = 2, WZ = -17, W = 34, Dp = 16, H = 9;
  if (!k.wreck) {
    k.box(W + 1, 0.5, Dp + 1, T(s.conc), WX, 0, WZ, { outline: 0.05 });
    k.box(W, H, Dp, T(s.body), WX, F, WZ, { outline: 0.15 });
    for (let i = 0; i <= 8; i++) k.box(0.35, H, Dp + 0.12, T(s.panel), WX - W / 2 + (i * W) / 8, F, WZ, { outline: 0 });
    k.box(W + 0.12, 0.8, Dp + 0.12, T(c), WX, F + H - 1.6, WZ, { outline: 0 });
    // north-light roof: six teeth, the glazed slopes facing -z
    const n = 6, tw = Dp / n, th = 2.4;
    for (let i = 0; i < n; i++) {
      const tz = WZ - Dp / 2 + tw * (i + 0.5);
      k.add(new THREE.CylinderGeometry(1, 1, W, 3, 1, false, -Math.PI / 2).rotateZ(-Math.PI / 2).scale(1, th / 1.5, tw / 1.732).translate(0, th / 3, 0), T(s.roof), WX, F + H, tz, { outline: 0.05 });
      k.add(new THREE.BoxGeometry(W - 1, 0.1, th * 1.05), G(0xcfefff), WX, F + H + th / 2, tz - tw / 4 - 0.05, { rx: -Math.atan(tw / 2 / th) + Math.PI / 2, outline: 0 });
    }
    k.solid(W / 2, (F + H) / 2, Dp / 2, WX, WZ);
    for (let i = 0; i < n; i++) k.solid(W / 2, th * 0.25, tw * 0.4, WX, WZ - Dp / 2 + tw * (i + 0.5), 0, F + H);
    // the front: three roller doors (two open, a lit bay), a raised dock with bumpers and a canopy
    const fz = WZ + Dp / 2;
    for (let i = -1; i <= 1; i++) {
      const dx = WX + i * 10;
      if (i === 0) { k.box(6, 5.5, 0.12, G(0xffe6a8), dx, F + 1.3, fz + 0.03, { outline: 0 }); for (let j = 0; j < 2; j++) cargoStack(k, dx + (j ? 1.4 : -1.4), fz - 3.5, 1, cargoFor(k, 'spacecom'), Math.PI / 2, F + 1.3); }
      else { k.box(6, 5.5, 0.25, T(0x6b6880), dx, F + 1.3, fz + 0.05, { outline: 0.03 }); for (let j = 1; j < 8; j++) k.box(6, 0.1, 0.3, T(DARK), dx, F + 1.3 + j * 0.68, fz + 0.07, { outline: 0 }); }
      k.box(6.6, 0.4, 0.4, T(YEL), dx, F + 6.8, fz + 0.2, { outline: 0 });
      for (const sd of [-1, 1]) k.box(0.4, 0.8, 0.4, T(DARK), dx + sd * 2.6, F + 0.3, fz + 3.15, { outline: 0.02 });
    }
    k.box(W - 2, 1.3, 3, T(s.conc), WX, 0, fz + 1.5, { outline: 0.05 });
    for (let i = 0; i < 12; i++) k.box(1.2, 0.02, 0.2, T(i % 2 ? YEL : DARK), WX - 15 + i * 2.6, 1.3, fz + 2.95, { outline: 0 });
    k.solid((W - 2) / 2, 0.65, 1.5, WX, fz + 1.5);
    // dock stairs at the right end
    for (let i = 0; i < 4; i++) k.box(1.6, 0.32 * (i + 1), 0.4, T(s.conc), WX + W / 2 + 0.2, 0, fz + 0.4 + (3 - i) * 0.4 + 1.2, { outline: 0.02 });
    k.box(W, 0.3, 4.6, T(s.roof), WX, F + 7.5, fz + 2.3, { outline: 0.05 });
    k.solid(W / 2, 0.15, 2.3, WX, fz + 2.3, 0, F + 7.5);
    for (let i = -2; i <= 2; i++) k.beam([WX + i * 8, F + 7.5, fz + 4.4], [WX + i * 8, F + H - 0.5, fz + 0.1], 0.08, T(s.dark), { outline: 0.02 });
    for (let i = -1; i <= 1; i++) k.box(0.6, 0.3, 0.5, G(WARM), WX + i * 10, F + 7.3, fz + 3, { outline: 0 });
    emblem(k, WX - 13, F + H - 1.2, fz, 0, 1.6, 'spacecom');
    // roof vents and a rooftop plant
    for (const vx of [-10, 0, 10]) k.cyl(0.5, 0.6, 1.0, 8, T(s.dark), WX + vx, F + H + th, WZ - Dp / 2 + tw * 5.5, { outline: 0.03 });
    // workers on the dock
    if (!k.wreck) for (const [x, z, a] of [[WX - 6, fz + 1.8, 0], [WX - 4.8, fz + 2.2, 2.5], [WX + 6, fz + 1.6, 0.3], [WX + 14, fz + 5, 3]]) person(k, x, z, a, rr, { suit: YEL, helmet: c, y: x === WX + 14 ? F : 1.3 - F + F });
  } else {
    ruin(k, WX, WZ, W, Dp, H, 0, s.body, k.wr, { roof: s.roof });
    for (let i = 0; i < 4; i++) k.add(prism(W * 0.4, 2.6, 2), T(s.roof), WX - 10 + i * 7, F + 0.5, WZ - 4 + (k.wr() - 0.5) * 6, { ry: k.wr() * 0.6, rz: 0.3, outline: 0.05 });
    damage(k, 'z', WZ + Dp / 2, WX, F + 3, 2, k.wr);
  }
  k.hit(W / 2, H / 2, Dp / 2, WX, WZ);
  k.smoke = new THREE.Vector3(WX, 3, WZ);
  k.drop = new THREE.Vector3(-6, F, 14);
  // the container yard under the portal crane, on the right
  portalCrane(k, 24, 9, 0, 12, 12, s, 26);
  for (const [x, z, n] of [[21, 2, 3], [21, 12, 2], [21, 20, 1], [27, 2, 1], [27, 12, 2]]) cargoStack(k, x, z, n, cargoFor(k, 'spacecom'), 0, F);
  // the fuel farm on the left: three horizontal tanks in a bund
  bund(k, -26, 14, 12, 16, Math.PI / 2, s);
  for (const dz of [-3.6, 0, 3.6]) {
    within(k, -26, 14 + dz, 0, () => {
      k.add(new THREE.CapsuleGeometry(1.5, 7, 4, 14).rotateZ(Math.PI / 2), T(LIGHT), 0, F + 2.2, 0, { outline: 0.08 });
      k.add(new THREE.TorusGeometry(1.53, 0.12, 4, 16).rotateY(Math.PI / 2), T(c), -2, F + 2.2, 0, { outline: 0 });
      for (const sd of [-1, 1]) k.box(0.6, 1.0, 2.4, T(s.conc), sd * 2.6, F, 0, { outline: 0.03 });
      k.hcyl(1.5, 10, 0, 0, Math.PI / 2, F + 2.2);
    });
  }
  k.text('FUEL · NO FLAME', -19, F + 1.6, 14, Math.PI / 2, 4, { fg: '#ff3b5c', bg: '#ffffff', back: false, off: 0.27 });
  // the lander pad, back left
  k.cyl(8, 8.3, 0.1, 32, T(0x5a566a), -24, F, -18, { outline: 0.04 });
  paintAt(k, -24, -18, 7, 0.2, s.trim, 0.1);
  for (let i = 0; i < 8; i++) { const [x, z] = polar(7.8, (i / 8) * TAU); k.box(0.3, 0.02, 0.3, G(s.trim), -24 + x, F + 0.1, -18 + z, { outline: 0 }); }
  supplyLander(k, -24, -18, 0.4, s);
  // the yard office and its wiring rack (raid)
  within(k, 14, 24, Math.PI, () => {
    k.box(9, 0.4, 6, T(s.conc), 0, 0, 0, { outline: 0.04 });
    k.box(8.4, 3.4, 5.4, T(s.body), 0, F, 0, { outline: 0.08 });
    k.box(8.8, 0.4, 5.8, T(s.roof), 0, F + 3.4, 0, { outline: 0.05 });
    k.box(8.82, 0.15, 5.82, T(c), 0, F + 3.8, 0, { outline: 0 });
    k.box(1.4, 2.4, 0.1, T(s.dark), 2.2, F, 2.72, { outline: 0.02 });
    k.box(3.2, 1.2, 0.1, G(s.glow), -1.6, F + 1.4, 2.72, { outline: 0 });
    k.box(1.6, 0.9, 1.2, T(LIGHT), -2, F + 3.8, -1, { outline: 0.03 });
    k.solid(4.4, (F + 4) / 2, 2.9, 0, 0);
  });
  within(k, 6.5, 22, 0, () => {
    k.box(3.2, 2.4, 0.9, T(s.dark), 0, F, 0, { outline: 0.05 });
    for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(0.35, 0.12, 6, 12), T([0xff4f2e, YEL, 0x2ec4ff, 0x7dff3a][i]), -1.1 + i * 0.75, F + 1.6, 0.5, { outline: 0.02 });
    k.solid(1.6, (F + 2.4) / 2, 0.45, 0, 0);
  });
  k.raidAt(6.5, 24.5, 0xffd23f);
  hoverCart(k, -6, 22, 0.2, s, rr);
  for (const [x, z] of [[-34, -2], [34, -10], [-10, 32], [30, 28]]) lampPost(k, x, z, 8, s.glow);
  // a forklift crew between the yard and the shed
  if (!k.wreck) for (const [x, z, a] of [[14, 6, -1.5], [15, 7, 2], [-14, 6, 0.4], [-13.2, 7, 3.4], [-26, 4, 0]]) person(k, x, z, a, rr, { suit: YEL, helmet: c });
  strollers(k, 30, 3, 0.04, rr);
  flagPole(k, -8, 37); flagPole(k, 8, 37);
}
// a parked supply lander on four legs
function supplyLander(k, x, z, ry, s) {
  within(k, x, z, ry, () => {
    k.cyl(2.6, 3.2, 3.2, 8, T(s.body), 0, F + 2.0, 0, { outline: 0.08 });
    k.add(new THREE.ConeGeometry(2.6, 1.6, 8), T(s.trim), 0, F + 6.0, 0, { outline: 0.05 });
    k.cyl(1.4, 2.0, 1.2, 10, T(s.dark), 0, F + 0.9, 0, { outline: 0.04 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + TAU / 8; const [lx, lz] = polar(4.4, a), [ux, uz] = polar(2.8, a); k.beam([ux, F + 2.6, uz], [lx, F + 0.2, lz], 0.15, T(STEEL), { outline: 0.03 }); k.cyl(0.6, 0.7, 0.2, 10, T(s.dark), lx, F, lz, { outline: 0.02 }); }
    k.box(1.6, 2.0, 0.1, T(s.dark), 0, F + 2.4, 3.05, { outline: 0.02 });
    k.column(3.2, F + 6.8, 0, 0);
  });
}

// =====================================================================================================================
// SUPPLY DEPOT B: the Silo Depot. Three 18 m bulk silos on a ring beam with a catwalk across their tops and a loading tower,
// a long Quonset store, a container wall round the back, a weighbridge and a truck at the load-out.
// =====================================================================================================================
function depotB(k) {
  const s = style(k, 'spacecom'), c = k.c, rr = k.rr;
  yard(k, 0x8a8698, s.dark);
  paintStrip(k, [0, 38], [0, -4], 7, 0x6f6b7e);
  const SIL = [[-12, -14], [-3, -20], [6, -14]], SR = 4.2, SH = 16;
  if (!k.wreck) {
    for (const [x, z] of SIL) {
      k.cyl(SR + 0.6, SR + 0.8, 0.6, 24, T(s.conc), x, 0, z, { outline: 0.04 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const [px, pz] = polar(SR - 0.3, a); k.cyl(0.25, 0.3, 3, 6, T(s.dark), x + px, F, z + pz, { outline: 0.03 }); }
      k.cyl(SR, SR, SH - 3, 24, T(s.body), x, F + 3, z, { outline: 0.12 });
      k.add(new THREE.ConeGeometry(SR, 2.6, 24).rotateX(Math.PI), T(s.panel), x, F + 3 - 1.3 + 0.01, z, { outline: 0.06 });
      for (let y = 5; y < SH; y += 3) k.ring(SR + 0.03, 0.08, T(s.panel), x, F + y, z);
      k.ring(SR + 0.06, 0.5, T(c), x, F + SH - 3, z);
      k.add(new THREE.ConeGeometry(SR + 0.2, 2.4, 24), T(s.roof), x, F + SH + 1.2, z, { outline: 0.08 });
      k.cyl(0.6, 0.6, 0.8, 10, T(s.dark), x, F + SH + 2.2, z, { outline: 0.03 });
      k.cyl(0.4, 0.5, 2.2, 8, T(DARK), x, F, z, { outline: 0.03 });
      k.column(SR, F + SH, x, z);
      k.column(SR * 0.6, F + SH + 1.4, x, z, F + SH);
    }
    // the catwalk joining the tops, a stair tower at the east end
    for (let i = 0; i < SIL.length - 1; i++) {
      const [ax, az] = SIL[i], [bx, bz] = SIL[i + 1];
      k.strip([ax, az], [bx, bz], 1.6, 0.2, T(s.dark), F + SH + 1.6);
      for (const sd of [-1, 1]) { const yaw = Math.atan2(bx - ax, bz - az), ox = Math.cos(yaw) * sd * 0.8, oz = -Math.sin(yaw) * sd * 0.8; k.beam([ax + ox, F + SH + 2.7, az + oz], [bx + ox, F + SH + 2.7, bz + oz], 0.05, T(s.trim), { outline: 0.01 }); }
    }
    const [lx, lz] = [12.5, -14];
    k.box(3.6, SH + 2, 3.6, GLASS(0x3a3550, 0.25), lx, F, lz, { outline: 0.04 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(0.25, SH + 2, 0.25, T(s.trim), lx + sx * 1.8, F, lz + sz * 1.8, { outline: 0.02 });
    for (let y = 3; y < SH + 2; y += 3) k.box(3.6, 0.2, 3.6, T(s.dark), lx, F + y, lz, { outline: 0.02 });
    k.box(4.2, 0.4, 4.2, T(s.roof), lx, F + SH + 2, lz, { outline: 0.04 });
    k.strip([6, -14], [lx, lz], 1.6, 0.2, T(s.dark), F + SH + 1.6);
    k.solid(1.9, (SH + 2.4) / 2, 1.9, lx, lz, 0, F);
    // the load-out: a chute from the middle silo over the truck lane
    k.beam([-3, F + 4.2, -16], [-3, F + 6.5, -8], 0.6, T(s.panel), { outline: 0.04 });
    k.box(3, 2.4, 3, T(s.dark), -3, F + 5.4, -7.5, { outline: 0.04 });
    emblem(k, -3, F + 11, -20 + SR, 0, 2.2, 'spacecom');
  } else {
    const wr = k.wr;
    for (const [x, z] of SIL) {
      const h = 3 + wr() * 6;
      k.cyl(SR + 0.6, SR + 0.8, 0.6, 24, T(s.conc), x, 0, z, { outline: 0.04 });
      k.cyl(SR, SR, h, 24, T(wr() < 0.5 ? CHAR : s.body), x, F, z, { outline: 0.1 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + wr(); k.box(2, 2 + wr() * 3, 0.2, T(s.body), x + Math.sin(a) * (SR - 0.3), F + h, z + Math.cos(a) * (SR - 0.3), { ry: a + Math.PI / 2, rx: 0.3 * (wr() - 0.5), outline: 0.04 }); }
      k.column(SR, F + h + 2, x, z);
    }
    within(k, 6, -14, 0.9, () => { k.cyl(SR, SR, 11, 24, T(s.body), 0, F + SR, 9, { rx: Math.PI / 2, outline: 0.1 }); k.add(new THREE.ConeGeometry(SR + 0.2, 2.4, 24).rotateX(Math.PI / 2), T(s.roof), 0, F + SR, 15.6, { outline: 0.08 }); k.hcyl(SR, 11, 0, 9, 0, F + SR); });
    scatterDebris(k, -3, -14, 12, 6, 20, wr);
  }
  for (const [x, z] of SIL) k.hit(SR, SH / 2, SR, x, z);
  k.smoke = new THREE.Vector3(-3, 3, -16);
  k.drop = new THREE.Vector3(-14, F, 12);
  // the store: a long Quonset on the right, doors to the lane
  quonset(k, 24, 0, 6, 22, s.panel, 0, c);
  k.hit(6.5, 3, 11, 24, 0);
  // the container wall along the back and left
  for (let i = 0; i < 7; i++) { const a = Math.PI + 0.9 - i * 0.3; const [x, z] = polar(33, a); cargoStack(k, x, z, 1 + (i % 3 === 1 ? 1 : 0), cargoFor(k, 'spacecom'), a + Math.PI / 2, F); }
  // the weighbridge and the truck under the chute
  k.box(5, 0.12, 12, T(0x55607a), -3, F, -4, { outline: 0.03 });
  for (let i = 0; i < 6; i++) k.box(5, 0.006, 0.3, T(YEL), -3, F + 0.12, -9.5 + i * 2.2, { outline: 0 });
  hauler(k, -3, -5, 0, s);
  // weigh house and the wiring rack (raid)
  within(k, -11, 4, Math.PI / 2, () => {
    k.box(4, 3.0, 3.4, T(s.body), 0, F, 0, { outline: 0.07 });
    k.box(2.6, 1.1, 0.1, G(s.glow), 0, F + 1.4, 1.71, { outline: 0 });
    k.box(4.4, 0.35, 3.8, T(s.roof), 0, F + 3.0, 0, { outline: 0.04 });
    k.solid(2, (F + 3.35) / 2, 1.7, 0, 0);
    if (!k.wreck) person(k, 0, 2.6, 0, rr, { suit: YEL, helmet: c });
  });
  within(k, -15, 10, 0.6, () => {
    k.box(3.2, 2.4, 0.9, T(s.dark), 0, F, 0, { outline: 0.05 });
    for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(0.35, 0.12, 6, 12), T([0xff4f2e, YEL, 0x2ec4ff, 0x7dff3a][i]), -1.1 + i * 0.75, F + 1.6, 0.5, { outline: 0.02 });
    k.solid(1.6, (F + 2.4) / 2, 0.45, 0, 0);
  });
  k.raidAt(-13.6, 12.3, 0xffd23f);
  bund(k, 22, 22, 12, 10, 0, s);
  tank(k, 19, 21, 2.4, 4.5, s.body, c);
  tank(k, 25, 21, 2.4, 4.5, s.body, c);
  for (const [x, z] of [[-30, 14], [12, 14], [32, -18], [-20, 28]]) lampPost(k, x, z, 8, s.glow);
  if (!k.wreck) for (const [x, z, a] of [[1.5, 3, -1.6], [2.4, 3.5, 2.2], [17, 8, -1.2], [-6, -1, 0.5]]) person(k, x, z, a, rr, { suit: YEL, helmet: c });
  flagPole(k, -8, 37); flagPole(k, 8, 37);
}
// a bulk hauler truck (cab forward, hopper behind), facing local +z
function hauler(k, x, z, ry, s) {
  within(k, x, z, ry, () => {
    k.box(3.0, 1.0, 10, T(s.dark), 0, 0.9, 0, { outline: 0.05 });
    k.box(2.8, 2.6, 2.6, T(s.trim), 0, 1.6, 3.6, { outline: 0.06 });
    k.box(2.5, 0.9, 0.08, GLASS(GLASSC, 0.6), 0, 3.0, 4.92, { outline: 0.02 });
    k.add(new THREE.CylinderGeometry(2.0, 1.2, 2.4, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.8), T(s.body), 0, 3.1, -2, { outline: 0.06 });
    for (const sx of [-1, 1]) for (const sz of [-3.4, -1.4, 3.6]) k.add(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 12).rotateZ(Math.PI / 2), T(TYRE), sx * 1.5, 0.75, sz, { outline: 0.03 });
    k.solid(1.5, 2.15, 5, 0, 0);
  });
}

DRAFT_BUILD.depot = { a: depotA, b: depotB };

// =====================================================================================================================
// FARM DOME A: the Great Dome. One 34 m glass dome over terraced beds and an orchard (Kepler's habDome shell, glazed), two
// seed domes, a solar field on posts cut to each panel, water and nutrient tanks, the farmers' packing shed.
// =====================================================================================================================
function farmA(k) {
  const s = style(k, 'kepler'), c = k.c, rr = k.rr;
  yard(k, 0xb0a088, 0x7a6c5c);
  const DX = -4, DZ = -10, DR = 15;
  if (!k.wreck) {
    // inside: terraces in rings, rows of crops, an orchard core, glow lamps
    k.cyl(DR - 1, DR - 0.6, 0.5, 40, T(0x6b4a2a), DX, F, DZ, { outline: 0 });
    for (const [r2, h] of [[11, 0.9], [7.5, 1.6], [4, 2.3]]) { k.cyl(r2, r2 + 0.3, h, 32, T(0xd8c8b0), DX, F, DZ, { outline: 0.04 }); k.cyl(r2 - 0.3, r2 - 0.3, 0.05, 32, T(0x5a3a22), DX, F + h, DZ, { outline: 0 }); }
    for (let ring = 0; ring < 3; ring++) {
      const r2 = [12.8, 9.2, 5.7][ring], y = F + [0.5, 0.9, 1.6][ring], n = Math.round(r2 * 2.2);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const [x, z] = polar(r2, a); k.ball(0.45 + (i % 3) * 0.1, T([0x3ad15a, 0x7dff6a, 0x5fbf4a][(i + ring) % 3]), DX + x, y + 0.35, DZ + z, { outline: 0.02 }); }
    }
    for (let i = 0; i < 4; i++) { const [x, z] = polar(1.8, (i / 4) * TAU); tree(k, DX + x, DZ + z, 0.7 + (i % 2) * 0.15, i % 2 ? 0x7dff6a : 0x5fbf4a); }
    for (let i = 0; i < 6; i++) { const [x, z] = polar(9, (i / 6) * TAU); k.box(0.8, 0.12, 0.8, G(0xd8a0ff), DX + x, F + 9.5, DZ + z, { outline: 0 }); k.beam([DX + x, F + 9.6, DZ + z], [DX + x * 1.0, F + 13.5, DZ + z], 0.03, T(DARK), { outline: 0 }); }
    for (const [x, z] of [[3, 2], [-4, -3], [6, -6]]) person(k, DX + x, DZ + z, rr() * TAU, rr, { suit: c, y: 0.6 });
  }
  // the shell: habDome glazed (footing, berms, airlock to +z, cupola)
  if (!k.wreck) habDomeAt(k, DX, DZ, DR, c, s, { glass: true, door: 0 });
  else {
    const wr = k.wr;
    k.cyl(DR + 0.2, DR + 0.45, 1.05, 40, T(CONC), DX, 0, DZ, { outline: 0.08 });
    k.cyl(DR - 1, DR - 0.6, 0.6, 40, T(0x4a3a2a), DX, F, DZ, { outline: 0 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + wr() * 0.3; k.add(new THREE.TorusGeometry(DR, 0.18, 4, 16, 0.6 + wr() * 0.9), T(0xd8d4e8), DX, 1.0, DZ, { ry: a, rx: wr() * 0.4, outline: 0.03 }); }
    for (let i = 0; i < 18; i++) k.add(new THREE.BoxGeometry(1.4, 0.06, 1.2), GLASS(0x8dffb0, 0.5), DX + (wr() - 0.5) * 2 * DR, F + 0.3, DZ + (wr() - 0.5) * 2 * DR, { ry: wr() * 3, rx: wr() * 0.4, outline: 0.01 });
    scatterDebris(k, DX, DZ, 9, 9, 20, wr, [0x4a3a2a, 0x3a5a2a, CHAR, 0x55505e]);
    k.column(DR, 1.1, DX, DZ);
  }
  k.hit(DR * 0.7, 7, DR * 0.7, DX, DZ);
  k.smoke = new THREE.Vector3(DX, 3, DZ);
  k.drop = new THREE.Vector3(14, F, 14);
  // two seed domes
  habDomeAt(k, 22, -18, 6.5, c, s, { glass: true, door: -Math.PI / 2, wreck: k.wreck });
  habDomeAt(k, 26, -2, 5.5, c, s, { glass: false, door: -Math.PI / 2, wreck: k.wreck });
  // the solar field (front left): rows of panels facing +z, each post cut to the panel's underside
  solarRows(k, -22, 18, 3, 4, s);
  // water and nutrient tanks
  tank(k, 22, 16, 2.6, 5, 0xd8d4e8, c);
  tank(k, 28, 20, 2.0, 4, 0x7dd87a, c);
  pipeRun(k, [[22, 13], [12, 13], [12, 4]], 1.0);
  // the packing shed with the sapling crates: the raid spot
  within(k, 8, 24, Math.PI * 0.85, () => {
    k.box(10, 0.4, 7, T(s.conc), 0, 0, 0, { outline: 0.04 });
    k.box(9.4, 3.6, 6.4, T(s.body), 0, F, 0, { outline: 0.08 });
    k.add(prism(10.2, 7.4, 2.2), T(s.roof), 0, F + 3.6, 0, { outline: 0.06 });
    k.box(3.2, 3.0, 0.1, G(WARM), -1.8, F, 3.22, { outline: 0 });
    k.box(1.6, 1.0, 0.1, G(WARM), 2.6, F + 1.4, 3.22, { outline: 0 });
    k.box(10.3, 0.2, 0.3, T(c), 0, F + 3.55, 3.4, { outline: 0 });
    emblem(k, 0, F + 4.4, 3.36, 0, 1.0, 'kepler');
    k.solid(4.7, (F + 3.6) / 2, 3.2, 0, 0);
    k.solid(5.0, 0.7, 2.0, 0, 1.8, 0, F + 3.6);
    k.solid(5.0, 0.7, 2.0, 0, -1.8, 0, F + 3.6);
    k.solid(5.0, 0.35, 0.9, 0, 0, 0, F + 4.9);
  });
  for (const [x, z, ry] of [[3.2, 18.6, 0.2], [4.6, 18.0, -0.3]]) {
    crate(k, x, F, z, 1.0, 0x9a6a3a, ry);
    k.add(new THREE.ConeGeometry(0.35, 0.9, 5), T(0x5fbf4a), x, F + 1.45, z, { outline: 0.02 });
  }
  k.raidAt(4, 16, 0x7dff3a);
  // farmers and a hand cart
  if (!k.wreck) for (const [x, z, a] of [[0, 14, 0.4], [1, 14.6, 3.6], [-14, 6, 1.2], [16, -10, 2], [-10, 8, 0]]) person(k, x, z, a, rr, { suit: [c, 0x6a8f3a, 0xfff0d8][Math.floor(rr() * 3)] });
  for (const [x, z] of [[-14, -30], [10, 4], [-30, 0], [26, 30]]) lampPost(k, x, z, 6, s.glow);
  flagPole(k, -7.5, 37); flagPole(k, 7.5, 37);
  strollers(k, 33, 4, 0.04, rr);
}
// habDome (settlements.js) at the top level of the kit, or a ruin of one
function habDomeAt(k, x, z, r, c, s, { glass = false, door = 0, wreck = false } = {}) {
  if (wreck) { ruin(k, x, z, r * 1.6, r * 1.6, 2.5, door, 0xd8d4e8, k.wr); return; }
  const sb = k.base.clone(), sy = k.yaw;
  habDomeImpl(k, x, z, r, c, { door, trim: s.trim, glass });
  k.base.copy(sb); k.yaw = sy;
}
const habDomeImpl = (k, x, z, r, c, o) => habDome(k, x, z, r, c, o);
// rows of solar tables facing +z: tilted panels with front and back posts each cut to the panel underside at its own z
function solarRows(k, x, z, rows, cols, s) {
  const tilt = 0.45, pd = 2.4, pw = 3.4, th = 0.12;
  for (let r2 = 0; r2 < rows; r2++) for (let ci = 0; ci < cols; ci++) {
    const px = x + (ci - (cols - 1) / 2) * (pw + 0.4), pz = z + (r2 - (rows - 1) / 2) * 4.2, cy = F + 1.9;
    // +tilt about x lowers +z: the panel's front (+z, sunward) edge is low
    k.add(new THREE.BoxGeometry(pw, th, pd), T(0x2b3a8f), px, cy, pz, { rx: tilt, outline: 0.03 });
    k.add(new THREE.BoxGeometry(pw + 0.02, 0.02, 0.06), T(LIGHT), px, cy + th / 2 * Math.cos(tilt) + 0.01, pz, { rx: tilt, outline: 0 });
    for (const zz of [-0.8, 0.8]) {
      const under = cy - zz * Math.tan(tilt) - (th / 2) / Math.cos(tilt);
      for (const sx of [-1.3, 1.3]) k.box(0.1, under - F, 0.1, T(STEEL), px + sx, F, pz + zz, { outline: 0 });
    }
    k.solid(pw / 2, (pd / 2) * Math.sin(tilt) + th, (pd / 2) * Math.cos(tilt), px, pz, 0, cy - (pd / 2) * Math.sin(tilt) - th);
  }
}
function pipeRun(k, pts, y, r = 0.3, color = 0xd8d4e8) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    k.beam([a[0], F + y, a[1]], [b[0], F + y, b[1]], r, T(color), { outline: 0.03, seg: 8 });
    k.ball(r * 1.3, T(color), b[0], F + y, b[1], { outline: 0 });
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 2; t < len; t += 4) { const px = a[0] + ((b[0] - a[0]) * t) / len, pz = a[1] + ((b[1] - a[1]) * t) / len; k.box(0.5, y - r, 0.2, T(STEEL), px, F, pz, { ry: Math.atan2(b[0] - a[0], b[1] - a[1]), outline: 0 }); }
  }
}

// =====================================================================================================================
// FARM DOME B: the Greenhouse Row. Three 28 m glass barrel vaults over crop beds, a gambrel-roofed packing barn closing their
// ends, a grain silo, a compost and water yard, a solar row.
// =====================================================================================================================
function farmB(k) {
  const s = style(k, 'kepler'), c = k.c, rr = k.rr;
  yard(k, 0xb0a088, 0x7a6c5c);
  const L = 28, GR = 4.6, GX = [-12, 0, 12], GZ = -4;
  for (const gx of GX) {
    within(k, gx, GZ, 0, () => {
      k.box(GR * 2 + 0.8, 0.6, L + 0.6, T(s.conc), 0, 0, 0, { outline: 0.05 });
      if (k.wreck) {
        const wr = k.wr;
        k.box(GR * 2, 0.06, L, T(CHAR), 0, 0.6, 0, { outline: 0 });
        for (let t = -L / 2; t <= L / 2 + 0.01; t += 3.5) if (wr() < 0.6) k.add(new THREE.TorusGeometry(GR, 0.14, 4, 14, Math.PI * (0.3 + wr() * 0.6)), T(0xf3eee4), 0, 0.6, t, { rz: wr() * 0.5, outline: 0.02 });
        for (let i = 0; i < 10; i++) k.add(new THREE.BoxGeometry(1.4, 0.06, 1.2), GLASS(0x8dffb0, 0.5), (wr() - 0.5) * GR * 2, 0.7, (wr() - 0.5) * L, { ry: wr() * 3, rx: wr() * 0.4, outline: 0.01 });
        k.solid(GR, 0.4, L / 2, 0, 0);
        return;
      }
      k.add(new THREE.CylinderGeometry(GR, GR, L, 20, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), GLASS(0x8dffb0, 0.25), 0, 0.6, 0, { outline: 0 });
      for (let t = -L / 2; t <= L / 2 + 0.01; t += 3.5) k.add(new THREE.TorusGeometry(GR + 0.02, 0.12, 4, 18, Math.PI), T(0xf3eee4), 0, 0.6, t, { outline: 0.02 });
      k.box(0.25, 0.25, L, T(0xf3eee4), 0, 0.6 + GR - 0.05, 0, { outline: 0.02 });
      for (const sd of [-1, 1]) { k.box(2.4, 0.7, L - 2, T(0x6b4a2a), sd * 2.0, 0.6, 0, { outline: 0.02 }); for (let t = -L / 2 + 2; t < L / 2 - 1.5; t += 1.4) k.ball(0.5, T((t * 7) % 3 > 1.5 ? 0x7dff6a : 0x3ad15a), sd * 2.0 + (t % 2.8 > 1.4 ? 0.5 : -0.5), 1.7, t, { outline: 0 }); }
      k.box(0.3, 0.15, L - 2, G(0xd8a0ff), 0, 0.6 + GR - 0.6, 0, { outline: 0 });
      k.add(new THREE.CircleGeometry(GR, 18, 0, Math.PI), GLASS(0x8dffb0, 0.25), 0, 0.6, L / 2, { outline: 0 });
      k.box(1.6, 2.6, 0.1, T(0xf3eee4), 0, 0.6, L / 2 + 0.02, { outline: 0.02 });
      k.solid(GR, 0.3, L / 2, 0, 0);
      k.hcyl(GR, L, 0, 0, 0, 0.6);
      if (gx === 0) person(k, 0, 6, rr() * TAU, rr, { suit: c, y: 0.6 });
    });
  }
  // the packing barn across the back ends: gambrel roof, big door, hayloft lamp
  const BZ = GZ - L / 2 - 5, BW = 34, BD = 9, BH = 4.5;
  if (!k.wreck) {
    within(k, 0, BZ, 0, () => {
      k.box(BW + 0.6, 0.4, BD + 0.6, T(s.conc), 0, 0, 0, { outline: 0.04 });
      k.box(BW, BH, BD, T(0xb5452a), 0, F, 0, { outline: 0.12 });
      for (let i = -8; i <= 8; i++) k.box(0.12, BH, BD + 0.08, T(0x9a3a22), i * 2, F, 0, { outline: 0 });
      // gambrel: a steep lower pitch and a shallow upper pitch each side, gables filled
      const lw = 2.0, lh = 2.6, uh = 1.6, halfW = BD / 2 + 0.3;
      for (const sd of [-1, 1]) {
        const ang1 = Math.atan2(lh, lw), ang2 = Math.atan2(uh, halfW - lw);
        k.add(new THREE.BoxGeometry(BW + 0.8, 0.3, Math.hypot(lw, lh) + 0.2), T(s.roof), 0, F + BH + lh / 2, sd * (halfW - lw / 2), { rx: sd * ang1, outline: 0.06 });
        k.add(new THREE.BoxGeometry(BW + 0.8, 0.3, Math.hypot(halfW - lw, uh) + 0.3), T(s.roof), 0, F + BH + lh + uh / 2, sd * (halfW - lw) / 2, { rx: sd * ang2, outline: 0.06 });
        k.solid(BW / 2 + 0.4, lh / 2, lw / 2 + 0.2, 0, sd * (halfW - lw / 2), 0, F + BH);
        k.solid(BW / 2 + 0.4, uh / 2 + 0.1, (halfW - lw) / 2, 0, sd * (halfW - lw) / 2, 0, F + BH + lh);
      }
      for (const sx of [-1, 1]) {
        const sh = new THREE.Shape(); sh.moveTo(-halfW + 0.3, 0); sh.lineTo(-(halfW - lw), lh); sh.lineTo(0, lh + uh - 0.15); sh.lineTo(halfW - lw, lh); sh.lineTo(halfW - 0.3, 0); sh.lineTo(-halfW + 0.3, 0);
        k.add(new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }).rotateY(Math.PI / 2), T(0xb5452a), sx * BW / 2 - (sx > 0 ? 0.2 : 0), F + BH, 0, { outline: 0.06 });
      }
      k.box(6, 4, 0.15, T(0xf3eee4), 0, F, BD / 2 + 0.02, { outline: 0.03 });
      k.beam([-3, F, BD / 2 + 0.12], [3, F + 4, BD / 2 + 0.12], 0.08, T(0xf3eee4), { outline: 0 });
      k.beam([3, F, BD / 2 + 0.12], [-3, F + 4, BD / 2 + 0.12], 0.08, T(0xf3eee4), { outline: 0 });
      k.box(2.0, 1.2, 0.1, G(WARM), 0, F + BH + 1.0, BD / 2 + 0.05, { outline: 0 });
      emblem(k, -10, F + 2.8, BD / 2 + 0.01, 0, 1.4, 'kepler');
      k.solid(BW / 2, (F + BH) / 2, BD / 2, 0, 0);
    });
  } else ruin(k, 0, BZ, BW, BD, BH, 0, 0xb5452a, k.wr, { roof: s.roof });
  k.hit(BW / 2, BH / 2, BD / 2, 0, BZ);
  for (const gx of GX) k.hit(GR, GR / 2, L / 2, gx, GZ);
  k.smoke = new THREE.Vector3(0, 3, BZ);
  k.drop = new THREE.Vector3(-22, F, 22);
  // grain silo and feed hopper by the barn
  within(k, 23, BZ + 2, 0, () => {
    k.cyl(3.2, 3.4, 0.5, 20, T(s.conc), 0, 0, 0, { outline: 0.04 });
    k.cyl(3.0, 3.0, 13, 20, T(0xd8d4e8), 0, F, 0, { outline: 0.1 });
    for (let y = 2; y < 13; y += 2.2) k.ring(3.03, 0.08, T(0xa8a4b4), 0, F + y, 0);
    k.add(new THREE.SphereGeometry(3.0, 20, 6, 0, TAU, 0, Math.PI / 2), T(c), 0, F + 13, 0, { outline: 0.08 });
    k.beam([2.2, F + 12, 0], [-6, F + 5.5, 0], 0.3, T(s.panel), { outline: 0.03 });
    k.column(3.0, F + 15.8, 0, 0);
  });
  if (k.wreck) k.hit(3, 7, 3, 23, BZ + 2);
  // compost bins, water tanks
  for (let i = 0; i < 3; i++) within(k, -27 + i * 4, 8, 0.1, () => { k.box(3.2, 1.4, 3.2, T(WOOD), 0, F, 0, { outline: 0.04 }); k.box(3.0, 0.2, 3.0, T(0x4a3a2a), 0, F + 1.25, 0, { outline: 0 }); k.solid(1.6, (F + 1.4) / 2, 1.6, 0, 0); });
  tank(k, 25, 14, 2.4, 5, 0xd8d4e8, c);
  tank(k, 25, 21, 2.0, 4, 0x7dd87a, c);
  pipeRun(k, [[22.6, 14], [16, 14], [16, 9]], 1.0);
  solarRows(k, -20, 27, 2, 4, s);
  // the sapling cart at the middle greenhouse's door: the raid spot
  for (const [x, z, ry] of [[3, GZ + L / 2 + 2.4, 0.2], [4.3, GZ + L / 2 + 2.0, -0.3]]) { crate(k, x, F, z, 1.0, 0x9a6a3a, ry); k.add(new THREE.ConeGeometry(0.35, 0.9, 5), T(0x5fbf4a), x, F + 1.45, z, { outline: 0.02 }); }
  k.raidAt(1, GZ + L / 2 + 4.2, 0x7dff3a);
  if (!k.wreck) for (const [x, z, a] of [[-6, 13, 0.3], [-5.2, 13.7, 3.4], [7, 14, 2], [18, 2, -1.6], [-19, 2, 1.4]]) person(k, x, z, a, rr, { suit: [c, 0x6a8f3a, 0xfff0d8][Math.floor(rr() * 3)] });
  for (const [x, z] of [[-18, 14], [18, 14], [-30, -12], [30, -12]]) lampPost(k, x, z, 6, s.glow);
  flagPole(k, -8.5, 37); flagPole(k, 8.5, 37);
}

DRAFT_BUILD.farm = { a: farmA, b: farmB };

// an equipment shelter: a squat block hut with a door, AC units, a cable ladder to its mast; door to local +z
function shelter(k, x, z, ry, w, d, s, label) {
  within(k, x, z, ry, () => {
    k.box(w + 0.8, 0.4, d + 0.8, T(s.conc), 0, 0, 0, { outline: 0.04 });
    k.box(w, 3.4, d, T(s.body), 0, F, 0, { outline: 0.08 });
    k.box(w + 0.4, 0.4, d + 0.4, T(s.roof), 0, F + 3.4, 0, { outline: 0.04 });
    k.box(w + 0.42, 0.14, d + 0.42, T(s.trim), 0, F + 3.8, 0, { outline: 0 });
    k.box(1.3, 2.4, 0.1, T(s.dark), -w / 4, F, d / 2 + 0.03, { outline: 0.02 });
    k.box(0.4, 0.2, 0.2, G(WARM), -w / 4, F + 2.6, d / 2 + 0.12, { outline: 0 });
    for (let i = 0; i < 2; i++) { k.box(1.4, 1.0, 0.7, T(LIGHT), w / 2 + 0.4, F + 0.2 + i * 1.3, -d / 4 + i * 0.2, { outline: 0.03 }); k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10).rotateZ(Math.PI / 2), T(DARK), w / 2 + 1.12, F + 0.7 + i * 1.3, -d / 4 + i * 0.2, { outline: 0 }); }
    k.solid(w / 2 + 1.1, (F + 2.8) / 2, d / 4 + 0.5, w / 2 - 0.2, -d / 4);
    if (label) k.text(label, w / 8, F + 3.0, d / 2 + 0.03, 0, Math.min(w * 0.55, 5), { fg: '#' + s.trim.toString(16).padStart(6, '0'), bg: '#' + s.dark.toString(16).padStart(6, '0'), back: false, off: 0.02 });
    k.solid(w / 2, (F + 3.9) / 2, d / 2, 0, 0);
  });
}
// a security fence of posts, rails and mesh round the yard, gap at the gate (+z)
function meshFence(k, r, gap, s, h = 2.8) {
  const step = 3.2 / r;
  for (let a = gap; a < TAU - gap - 1e-3; a += step) {
    const [x, z] = polar(r, a), b = Math.min(a + step, TAU - gap), [x2, z2] = polar(r, b);
    k.cyl(0.07, 0.07, h + 0.4, 5, T(s.dark), x, F, z, { outline: 0.02 });
    if (b - a < 1e-3) continue;
    for (const y of [0.2, h]) k.beam([x, F + y, z], [x2, F + y, z2], 0.03, T(s.dark), { outline: 0, seg: 3 });
    k.add(new THREE.PlaneGeometry(Math.hypot(x2 - x, z2 - z), h - 0.2), GLASS(0x3a3550, 0.3), (x + x2) / 2, F + h / 2 + 0.1, (z + z2) / 2, { ry: Math.atan2(x2 - x, z2 - z) + Math.PI / 2, outline: 0 });
    k.solid(Math.hypot(x2 - x, z2 - z) / 2, (F + h) / 2, 0.1, (x + x2) / 2, (z + z2) / 2, Math.atan2(x2 - x, z2 - z) - Math.PI / 2);
  }
  for (const sd of [-1, 1]) { const [x, z] = polar(r, sd > 0 ? gap : TAU - gap); k.box(0.4, h + 1, 0.4, T(s.trim), x, F, z, { outline: 0.03 }); k.column(0.25, F + h + 1, x, z); }
}
// dishStation (settlements.js) with its head turning: the tick it sets doesn't survive the template's clone, so the head
// spins by a rate instead (territory movers) and the dish is tipped up once
function dishStationAt(k, x, z, size, kind, fac, no, yaw) {
  const n0 = k.root.children.length;
  const sb = k.base.clone(), sy = k.yaw;
  dishStationImpl(k, x, z, size, kind, fac, no, { yaw });
  k.base.copy(sb); k.yaw = sy;
  const head = k.root.children.slice(n0).find((o) => o.userData.tick);
  if (head) { delete head.userData.tick; head.rotation.y += 0.8; head.userData.spin = 0.06; const d = head.children.find((o) => o.isGroup || o.children.length); if (d) d.rotation.x = -0.6; }
}

// =====================================================================================================================
// RELAY MAST A: the Guyed Relay. A 52 m guyed lattice mast in red and white bands with three tiers of dish heads, a turning
// dish boom at the top, three guy anchors, an equipment shelter with its cable bridge, a fenced compound.
// =====================================================================================================================
function mastA(k) {
  const fac = factionOf(k.c, 'kepler'), s = style(k, 'kepler'), c = k.c, rr = k.rr;
  yard(k, 0x7a7686, s.dark);
  meshFence(k, 37, 0.2, s);
  const MX = -4, MZ = -6, H = 52;
  if (!k.wreck) {
    k.box(5, 0.9, 5, T(s.conc), MX, 0, MZ, { outline: 0.05 });
    const legs = [0, 1, 2].map((i) => { const a = (i * TAU) / 3 + 0.3; return [MX + Math.cos(a) * 1.3, MZ + Math.sin(a) * 1.3]; });
    const seg = 6.5;
    for (let sg = 0; sg < H / seg; sg++) for (const [lx, lz] of legs) k.beam([lx, 0.9 + sg * seg, lz], [lx, 0.9 + (sg + 1) * seg, lz], 0.17, T(sg % 2 ? 0xff4f2e : 0xf5f5f5), { outline: 0.03 });
    for (let l = 0; l < H / 3.25; l++) for (let f = 0; f < 3; f++) {
      const a = legs[f], b = legs[(f + 1) % 3], y0 = 0.9 + l * 3.25, y1 = y0 + 3.25;
      k.beam(l % 2 ? [a[0], y0, a[1]] : [b[0], y0, b[1]], l % 2 ? [b[0], y1, b[1]] : [a[0], y1, a[1]], 0.06, T(STEEL), { outline: 0 });
      if (l % 2 === 0) k.beam([a[0], y0, a[1]], [b[0], y0, b[1]], 0.07, T(STEEL), { outline: 0 });
    }
    // service platforms and three tiers of dish heads on arms
    for (const y of [18, 34, 46]) { k.add(new THREE.CylinderGeometry(3.2, 3.2, 0.25, 3), T(s.dark), MX, y, MZ, { ry: 0.3, outline: 0.04 }); k.blinker(MX + 2.8, y + 0.5, MZ, 0xff2a4a, 0.35); }
    for (const [h, ry, rim] of [[18, 0.4, 1.6], [18, 2.5, 1.4], [34, 1.5, 1.8], [34, 4.2, 1.5], [46, 3.4, 1.3]]) {
      within(k, MX, MZ, ry, () => { k.beam([0, h - 0.9, 0.6], [0, h - 0.9, 2.2], 0.1, T(DARK)); k.dishHead(0, h - 0.9, 2.2, rim, fac, { az: Math.PI, el: -1.3 }); });
    }
    for (let i = 0; i < 3; i++) within(k, MX, MZ, (i * TAU) / 3 + 1.2, () => k.box(0.7, 3.6, 0.25, T(LIGHT), 0, 40, 1.6, { outline: 0.03 }));
    k.dishHead(MX, 46.2, MZ, 1.4, fac, { az: Math.PI, el: -0.7, spin: 0.5, arm: 2.2 });
    k.cyl(0.1, 0.15, 4, 5, T(LIGHT), MX, H + 0.9, MZ, { outline: 0.02 });
    k.blinker(MX, H + 5.2, MZ, 0xff2a4a, 0.5);
    // guys to three anchors, each a concrete block with a turnbuckle frame
    for (let i = 0; i < 3; i++) {
      const a = 0.3 + (i * TAU) / 3 + Math.PI / 3;
      const ax = MX + Math.cos(a) * 24, az = MZ + Math.sin(a) * 24;
      k.box(2.6, 1.3, 2.6, T(s.conc), ax, 0, az, { outline: 0.04 });
      k.box(1.4, 0.4, 1.4, T(c), ax, 1.3, az, { outline: 0.02 });
      k.solid(1.3, 0.85, 1.3, ax, az);
      for (const h of [17, 33, 49]) k.beam([ax, 1.6, az], [MX + Math.cos(a) * 1.3, h, MZ + Math.sin(a) * 1.3], 0.05, T(0x2a2540), { outline: 0, seg: 3 });
    }
    k.column(2.0, H, MX, MZ);
    // the cable bridge from the mast to the shelter
    k.strip([MX + 1.5, MZ + 0.5], [10, -4], 0.7, 0.15, T(s.dark), F + 3.2);
    for (const t of [0.33, 0.66]) { const x = MX + 1.5 + (10 - MX - 1.5) * t, z = MZ + 0.5 + (-4 - MZ - 0.5) * t; k.beam([x, F, z], [x, F + 3.2, z], 0.08, T(STEEL), { outline: 0 }); }
  } else {
    const wr = k.wr;
    k.box(5, 0.9, 5, T(s.conc), MX, 0, MZ, { outline: 0.05 });
    for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3 + 0.3; const h = 3 + wr() * 4; k.beam([MX + Math.cos(a) * 1.3, 0.9, MZ + Math.sin(a) * 1.3], [MX + Math.cos(a) * 1.4, h, MZ + Math.sin(a) * 1.4], 0.17, T(0x9a948e), { outline: 0.03 }); }
    within(k, MX, MZ, 2.2, () => {
      for (let i = 0; i < 3; i++) k.beam([(i - 1) * 1.1, 1.0 + i * 0.2, 2], [(i - 1) * 0.9 + 0.5, 0.6, 30], 0.17, T(i % 2 ? 0xff4f2e : 0xd8d4e8), { outline: 0.03 });
      for (let t = 4; t < 30; t += 3) k.beam([-1.1, 1.0, t], [1.1, 0.7, t + 1.5], 0.06, T(STEEL), { outline: 0 });
      k.solid(1.4, 0.7, 14, 0, 16);
      k.dishHead(2.5, 0.4, 20, 1.6, 'none', { el: -0.3 });
      k.dishHead(-3, 0.4, 26, 1.4, 'none', { el: -0.6 });
    });
    scatterDebris(k, MX, MZ, 4, 4, 10, wr);
  }
  k.hit(2.0, 8, 2.0, MX, MZ);
  k.smoke = new THREE.Vector3(MX, 3, MZ);
  k.drop = new THREE.Vector3(-14, F, 16);
  shelter(k, 13, -4, -Math.PI / 2, 9, 6, s, null);
  k.hit(4.5, 2, 3, 13, -4);
  shelter(k, 20, 12, Math.PI, 6, 4.5, s, null);
  // generator and battery bank
  within(k, 14, 8, 0.2, () => { k.box(4.2, 2.2, 2.2, T(s.trim), 0, F, 0, { outline: 0.05 }); k.cyl(0.25, 0.3, 2, 6, T(DARK), 1.4, F + 2.2, 0, { outline: 0.02 }); k.solid(2.1, (F + 2.2) / 2, 1.1, 0, 0); });
  for (let i = 0; i < 4; i++) { k.box(1.0, 1.8, 2.2, T(s.panel), -16 + i * 1.3, F, -16, { outline: 0.04 }); k.box(0.6, 0.2, 0.05, G(0x7dff6a), -16 + i * 1.3, F + 1.4, -14.88, { outline: 0 }); }
  k.solid(2.6, (F + 1.8) / 2, 1.1, -14.05, -16);
  // the transponder rack (raid)
  within(k, 6, 4, 0.3, () => {
    k.box(2.2, 2.4, 0.9, T(s.dark), 0, F, 0, { outline: 0.05 });
    for (let i = 0; i < 4; i++) k.box(1.6, 0.3, 0.05, G(i % 2 ? c : 0x7dff6a), 0, F + 0.5 + i * 0.45, 0.46, { outline: 0 });
    k.solid(1.1, (F + 2.4) / 2, 0.45, 0, 0);
  });
  k.raidAt(6.8, 6.3, 0x2ee6ff);
  solarRows(k, -22, 16, 2, 3, s);
  if (!k.wreck) for (const [x, z, a] of [[8, 2, 2.8], [10.5, -1, -1.4], [-16, -13.5, 0], [-2, 10, 0.4]]) person(k, x, z, a, rr, { suit: c });
  for (const [x, z] of [[-28, -10], [26, -18], [-8, 26], [24, 26]]) lampPost(k, x, z, 6, s.glow);
  flagPole(k, -7, 36.5); flagPole(k, 7, 36.5);
}

// =====================================================================================================================
// RELAY MAST B: the Uplink Station. A 26 m dish on its gantry mount (the dish stations' model, in the owner's livery), a
// 36 m monopole with sector panels and a radome, the operations building with a glazed control room.
// =====================================================================================================================
function mastB(k) {
  const fac = factionOf(k.c, 'kepler'), s = style(k, 'kepler'), c = k.c, rr = k.rr;
  yard(k, 0x7a7686, s.dark);
  meshFence(k, 37, 0.22, s);
  const DX = -12, DZ = -12;
  if (!k.wreck) dishStationAt(k, DX, DZ, 26, 'gantry', fac, '07', 0.6);
  else {
    const wr = k.wr;
    ruin(k, DX, DZ, 10, 10, 8, 0.6, s.body, wr, { roof: s.dark });
    k.dishHead(DX + 6, 0.6, DZ + 8, 4.5, 'none', { el: -0.2, az: 1.4 });
    k.solid(4, 2.5, 4, DX + 6, DZ + 8);
  }
  k.hit(5, 8, 5, DX, DZ);
  k.smoke = new THREE.Vector3(DX, 3, DZ);
  k.drop = new THREE.Vector3(-18, F, 16);
  // the monopole: a tapered tube with three sector-panel frames, a radome on top
  const PX = 18, PZ = -16, PH = 36;
  if (!k.wreck) {
    k.box(4, 0.8, 4, T(s.conc), PX, 0, PZ, { outline: 0.04 });
    k.cyl(0.7, 1.2, PH, 12, T(0xe8e4f0), PX, 0.8, PZ, { outline: 0.06 });
    for (const y of [12, 24]) k.cyl(1.22, 1.22, 0.8, 12, T(c), PX, y, PZ, { outline: 0.02 });
    for (const y of [26, 31]) {
      k.add(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 3), T(s.dark), PX, y, PZ, { outline: 0.03 });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; const [x, z] = polar(2.2, a); k.box(0.7, 2.6, 0.25, T(LIGHT), PX + x, y + 0.2, PZ + z, { ry: a, outline: 0.03 }); }
    }
    k.ball(2.2, T(0xf3eee4), PX, PH + 2.6, PZ, { outline: 0.06 });
    k.cyl(1.0, 1.0, 1.2, 10, T(s.dark), PX, PH + 0.6, PZ, { outline: 0.03 });
    k.blinker(PX, PH + 5.2, PZ, 0xff2a4a, 0.4);
    k.column(1.2, PH + 4.8, PX, PZ);
    for (let y = 2; y < PH; y += 0.6) k.box(0.5, 0.05, 0.05, T(DARK), PX, y, PZ + 1.0 - (y / PH) * 0.3, { outline: 0 });
  } else {
    k.box(4, 0.8, 4, T(s.conc), PX, 0, PZ, { outline: 0.04 });
    k.cyl(1.1, 1.2, 5, 12, T(0xe8e4f0), PX, 0.8, PZ, { outline: 0.06 });
    within(k, PX, PZ, -0.4, () => { k.cyl(0.7, 1.1, 28, 12, T(0xe8e4f0), 0, 1.0, 16, { rx: Math.PI / 2, outline: 0.06 }); k.ball(2.2, T(0xc8c4d0), 0, 2.0, 32, { outline: 0.06 }); k.hcyl(1.0, 28, 0, 16, 0, 1.1); k.sphere(2.2, 0, 2.0, 32); });
    k.column(1.2, 5.8, PX, PZ);
  }
  k.hit(1.4, 8, 1.4, PX, PZ);
  // operations building: two storeys, a glazed control room over the yard, a roof deck with small dishes
  within(k, 14, 8, -Math.PI / 2, () => {
    if (k.wreck) { ruin(k, 0, 0, 14, 8, 6, 0, s.body, k.wr, { roof: s.roof }); return; }
    k.box(14.8, 0.4, 8.8, T(s.conc), 0, 0, 0, { outline: 0.04 });
    k.box(14, 3.8, 8, T(s.body), 0, F, 0, { outline: 0.1 });
    k.box(14.1, 0.5, 8.1, T(c), 0, F + 3.6, 0, { outline: 0 });
    k.box(9, 3.2, 8, T(s.body), -2.5, F + 4.1, 0, { outline: 0.08 });
    k.box(9.1, 2.2, 8.1, GLASS(GLASSC, 0.45), -2.5, F + 4.6, 0, { outline: 0.03 });
    k.box(8.9, 2.1, 7.9, G(s.glow), -2.5, F + 4.65, 0, { outline: 0 });
    k.box(9.6, 0.4, 8.6, T(s.roof), -2.5, F + 7.3, 0, { outline: 0.05 });
    k.box(1.6, 2.6, 0.1, T(s.dark), 4, F, 4.03, { outline: 0.02 });
    k.box(1.8, 0.2, 0.8, T(s.trim), 4, F + 2.8, 4.4, { outline: 0.02 });
    for (let i = 0; i < 3; i++) k.box(1.4, 1.0, 0.1, G(WARM), -5 + i * 2.6, F + 1.4, 4.03, { outline: 0 });
    k.dishHead(-5, F + 7.7, -2, 0.9, fac, { az: Math.PI * 0.7, el: -0.8 });
    k.dishHead(0.5, F + 7.7, 2, 0.7, fac, { az: Math.PI * 1.2, el: -0.6 });
    k.solid(7, (F + 4.1) / 2, 4, 0, 0);
    k.solid(4.8, (3.6) / 2, 4.3, -2.5, 0, 0, F + 4.1);
    emblem(k, 6, F + 5.6, 4.03, 0, 1.4, 'kepler');
  });
  k.hit(4, 3, 7, 14, 8);
  // cable trench from the dish to the building, fuel and generator
  paintStrip(k, [DX + 5, DZ + 5], [10, 2], 1.2, 0x55505e, 0.001);
  within(k, 26, 0, 0, () => { k.box(2.4, 2.2, 4.4, T(s.trim), 0, F, 0, { outline: 0.05 }); k.solid(1.2, (F + 2.2) / 2, 2.2, 0, 0); });
  tank(k, 28, 8, 1.6, 3, 0xd8d4e8, c);
  within(k, 4, 14, 0.2, () => {
    k.box(2.2, 2.4, 0.9, T(s.dark), 0, F, 0, { outline: 0.05 });
    for (let i = 0; i < 4; i++) k.box(1.6, 0.3, 0.05, G(i % 2 ? c : 0x7dff6a), 0, F + 0.5 + i * 0.45, 0.46, { outline: 0 });
    k.solid(1.1, (F + 2.4) / 2, 0.45, 0, 0);
  });
  k.raidAt(4.6, 16.3, 0x2ee6ff);
  solarRows(k, -22, 18, 2, 3, s);
  cargoStack(k, 28, -22, 1, cargoFor(k, 'kepler'), 0.3, F);
  if (!k.wreck) for (const [x, z, a] of [[6, 11, 2.8], [8.5, 3, 0.2], [-2, 4, -1.2], [20, -8, 2]]) person(k, x, z, a, rr, { suit: c });
  for (const [x, z] of [[-28, -4], [0, -30], [-8, 26], [26, 26]]) lampPost(k, x, z, 6, s.glow);
  flagPole(k, -7.5, 36.5); flagPole(k, 7.5, 36.5);
}

DRAFT_BUILD.mast = { a: mastA, b: mastB };

// ---------- Rustmoon pieces ----------
// a corrugated sheet patch on a wall (local +z face) and a neon tube
const patch = (k, x, y, z, w, h, rr) => k.box(w, h, 0.08, T([0x8a8698, 0x6b5a4a, 0x9a6a3a, 0x7a3a2a, 0x5a5f6e][Math.floor(rr() * 5)]), x, y, z, { rz: (rr() - 0.5) * 0.2, outline: 0.02 });
// a scrap-built container (pirate): a box body, ribs, rust patches; local +z the doors
function scrapBox(k, x, y0, z, ry, color, rr, len = 6.1) {
  within(k, x, z, ry, () => {
    k.box(2.45, 2.6, len, T(color), 0, y0, 0, { outline: 0.06 });
    for (let i = -2; i <= 2; i++) k.box(2.53, 2.4, 0.08, T(color), 0, y0 + 0.1, (i * len) / 5.5, { outline: 0 });
    for (const sd of [-1, 1]) k.box(2.55, 2.66, 0.2, T(DARK), 0, y0 - 0.03, sd * len / 2, { outline: 0 });
    for (let i = 0; i < 2; i++) k.box(0.08, 0.8 + rr(), 1 + rr() * 2, T(RUST), 1.24 * (rr() < 0.5 ? -1 : 1), y0 + 0.3 + rr() * 1.2, (rr() - 0.5) * len * 0.7, { outline: 0 });
    k.solid(1.25, 1.3, len / 2, 0, 0, 0, y0);
  });
}
function burnBarrel(k, x, z) {
  k.cyl(0.45, 0.45, 1.1, 10, T(RUST), x, F, z, { outline: 0.03 });
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), G(0xff9f1c));
  fire.userData.blink = true;
  k.dyn(fire, x, F + 1.5, z);
  k.column(0.45, F + 1.1, x, z);
}
const pirate = (k, x, z, yaw, rr, s, pose = 'stand') => person(k, x, z, yaw, rr, { pose, suit: [0x3a2b4f, 0x6b5a4a, 0x2a2433, 0x7a3a2a][Math.floor(rr() * 4)], helmet: rr() < 0.5 ? s.trim : 0x8a8698 });

// =====================================================================================================================
// SCRAP SHACK A: the Container Workshop. Shipping boxes stacked two high into an L-shaped workshop with a stair, a balcony and a
// corrugated lean-to over the work floor; a scrap press, a derrick with its hook, parts heaps, burning barrels, clan neon.
// =====================================================================================================================
function shackA(k) {
  const s = style(k, 'rustmoon'), c = k.c, rr = k.rr;
  yard(k, 0x6f6878, 0x3a3540);
  // a ring of scrap-plate fence panels, gaps here and there, the gate at +z
  for (let a = 0.3; a < TAU - 0.3; a += 2.8 / 37) {
    if (rr() < 0.12) continue;
    const [x, z] = polar(37, a), h = 2.2 + rr() * 1.4;
    k.box(2.7, h, 0.15, T([0x6b5a4a, 0x7a3a2a, 0x5a5f6e, 0x8a8698][Math.floor(rr() * 4)]), x, F, z, { ry: a, rz: (rr() - 0.5) * 0.12, outline: 0.04 });
    k.solid(1.35, (F + h) / 2, 0.15, x, z, a);
  }
  const SX = -8, SZ = -14;
  if (!k.wreck) {
    within(k, SX, SZ, 0, () => {
      // the L: three boxes along x, two on top; a wing of two boxes along z
      const cols = [0x6b5a4a, 0x7a3a2a, 0x4a6a5a, 0x5a5f6e, 0x8a5a3a];
      for (let i = 0; i < 3; i++) scrapBox(k, -6.3 + i * 6.3, F, 0, Math.PI / 2, cols[i], rr);
      for (let i = 0; i < 2; i++) scrapBox(k, -3.2 + i * 6.3, F + 2.6, 0.2, Math.PI / 2, cols[i + 2], rr);
      scrapBox(k, 10.6, F, 5, 0, cols[4], rr);
      scrapBox(k, 10.6, F + 2.6, 5.4, 0.05, cols[0], rr);
      // lit doorways and windows cut in the faces
      for (const x of [-6.3, 6.3]) { k.box(1.6, 2.3, 0.1, G(0xffb347), x, F, 1.29, { outline: 0 }); }
      for (const x of [-3.2, 3.1]) k.box(2.2, 1.0, 0.1, G(s.glow), x, F + 3.8, 1.49, { outline: 0 });
      // the lean-to over the work floor: posts cut to the sloping roof's underside (it falls to +z)
      const rz0 = 1.3, rz1 = 9, ry0 = F + 5.0, ry1 = F + 3.4, slope = Math.atan2(ry0 - ry1, rz1 - rz0);
      k.add(new THREE.BoxGeometry(13, 0.14, Math.hypot(rz1 - rz0, ry0 - ry1) + 0.4), T(RUST), -1, (ry0 + ry1) / 2 + 0.07, (rz0 + rz1) / 2, { rx: slope, outline: 0.05 });
      for (let i = -3; i <= 3; i++) k.add(new THREE.BoxGeometry(0.06, 0.04, Math.hypot(rz1 - rz0, ry0 - ry1)), T(0x5a3a2a), -1 + i * 1.8, (ry0 + ry1) / 2 + 0.16, (rz0 + rz1) / 2, { rx: slope, outline: 0 });
      for (const x of [-7, 5]) { const zz = rz1 - 0.3, top = ry1 + (ry0 - ry1) * ((rz1 - zz) / (rz1 - rz0)); k.box(0.2, top - F, 0.2, T(DARK), x, F, zz, { outline: 0.02 }); k.column(0.15, top, x, zz); }
      k.solidQ(6.5, 0.1, Math.hypot(rz1 - rz0, ry0 - ry1) / 2 + 0.2, -1, (ry0 + ry1) / 2, (rz0 + rz1) / 2, new THREE.Quaternion().setFromEuler(new THREE.Euler(slope, 0, 0)));
      // the stair up to the top boxes and the balcony
      for (let i = 0; i < 9; i++) k.box(1.2, 0.18, 0.4, T(DARK), -11.2, F + 0.3 + i * 0.3, 3.4 - i * 0.36, { outline: 0.02 });
      k.beam([-11.8, F, 3.6], [-11.8, F + 2.9, 0.4], 0.06, T(DARK), { outline: 0 });
      k.box(13, 0.15, 1.6, T(DARK), -3.2, F + 2.6, 2.0, { outline: 0.03 });
      for (let x = -9.5; x <= 3; x += 1.6) k.box(0.08, 1.0, 0.08, T(DARK), x, F + 2.75, 2.75, { outline: 0 });
      k.box(13, 0.08, 0.08, T(c), -3.2, F + 3.75, 2.75, { outline: 0 });
      k.solid(6.5, 0.08, 0.8, -3.2, 2.0, 0, F + 2.6);
      // clan neon on top
      emblem(k, 10.6, F + 1.5, 8.1, 0, 1.6, 'rustmoon');
      for (let i = 0; i < 5; i++) patch(k, -8 + rr() * 16, F + 0.6 + rr() * 3, 1.32, 1 + rr() * 1.5, 0.6 + rr(), rr);
      // satellite dish and a stovepipe on the roof
      k.dishHead(5, F + 5.2, 0, 0.9, 'rustmoon', { az: Math.PI * 0.8, el: -0.6 });
      k.cyl(0.25, 0.25, 3, 6, T(DARK), -6, F + 5.2, 0.4, { outline: 0.02 });
    });
  } else {
    ruin(k, SX - 1, SZ, 19, 3, 3, 0, 0x6b5a4a, k.wr, { roof: RUST });
    within(k, SX, SZ, 0, () => {
      const wr = k.wr;
      scrapBox(k, -5, F, 0.5, Math.PI / 2 + 0.2, CHAR, wr);
      within(k, 4, 3, 0, () => k.box(2.45, 2.6, 6.1, T(0x4a4048), 0, F + 1.3, 0, { rx: 0.4, rz: 1.2, outline: 0.06 }));
      k.solid(2, 1.5, 3, 4, 3);
      scrapBox(k, 10.6, F, 5, 0.3, 0x3a3540, wr);
      k.box(13, 0.14, 7, T(RUST), -1, F + 0.9, 5, { rx: 0.25, rz: 0.1, outline: 0.05 });
    });
  }
  k.hit(9, 2.6, 3, SX, SZ);
  k.hit(1.5, 2.6, 3.5, SX + 10.6, SZ + 5);
  k.smoke = new THREE.Vector3(SX, 2.5, SZ);
  k.drop = new THREE.Vector3(14, F, 16);
  // the work floor: a bench, a rover on blocks, scrap plating in a rack (raid)
  within(k, SX - 2, SZ + 6, 0, () => {
    k.box(3.4, 0.9, 1.2, T(STEEL), 0, F, 0, { outline: 0.04 });
    k.box(3.5, 0.1, 1.3, T(WOOD), 0, F + 0.9, 0, { outline: 0.02 });
    k.solid(1.7, (F + 1) / 2, 0.6, 0, 0);
    if (!k.wreck) { pirate(k, 0, -1.0, 0, rr, s); k.box(0.3, 0.3, 0.3, G(0x9be7ff), 0.4, F + 1.1, 0.1, { outline: 0 }); }
  });
  within(k, SX + 5, SZ + 6, 0.2, () => {
    for (let i = 0; i < 5; i++) k.box(2.0, 1.6, 0.08, T([0x8a8698, 0x9a6a3a, 0x5a5f6e][i % 3]), 0, F + 0.2, -0.6 + i * 0.3, { rx: -0.25, outline: 0.02 });
    k.box(2.4, 0.3, 2.0, T(DARK), 0, F, 0, { outline: 0.03 });
    k.solid(1.2, (F + 1.8) / 2, 1.0, 0, 0);
  });
  k.raidAt(SX + 5, SZ + 8.5, 0x7dff3a);
  // the scrap press and the derrick with its hook over the heap
  within(k, 15, -10, -0.5, () => {
    k.box(5, 3.2, 4, T(0x5a5f6e), 0, F, 0, { outline: 0.08 });
    k.box(4.6, 1.6, 3.6, T(RUST), 0, F + 3.2, 0, { outline: 0.05 });
    for (const sd of [-1, 1]) k.box(0.5, 4.4, 0.5, T(YEL), sd * 2.4, F + 3.2, 0, { outline: 0.03 });
    k.box(5.4, 0.6, 0.8, T(YEL), 0, F + 7.4, 0, { outline: 0.03 });
    k.box(1.4, 1.4, 1.4, T(0x6b5a4a), 0, F, 3, { ry: 0.3, outline: 0.04 });
    k.box(1.3, 1.3, 1.3, T(0x7a3a2a), 1.5, F, 3.2, { ry: 0.8, outline: 0.04 });
    k.solid(2.7, (F + 8) / 2, 2.0, 0, 0);
  });
  junkHeap(k, 22, 8, 6, 3.6, 34, k.rr);
  within(k, 14, 14, 0, () => {
    lattice(k, 0, 0, 12, 1.0, 0.6, 4, T(RUST), T(DARK), { r: 0.14 });
    k.beam([0, 11.6, 0], [7, 13, -2], 0.22, T(YEL), { outline: 0.03 });
    k.beam([0, 9, 0], [7, 13, -2], 0.08, T(DARK), { outline: 0 });
    k.beam([7, 13, -2], [7, 8.5, -2], 0.03, T(DARK), { outline: 0 });
    k.box(0.6, 0.8, 0.3, T(YEL), 7, 7.7, -2, { outline: 0.03 });
    k.add(new THREE.TorusGeometry(0.35, 0.08, 4, 10, Math.PI * 1.4), T(STEEL), 7, 7.3, -2, { outline: 0 });
  });
  burnBarrel(k, -2, 6);
  burnBarrel(k, -22, 2);
  if (!k.wreck) for (const [x, z, a] of [[-0.8, 7.2, 3.6], [-3.2, 6.5, 1.0], [-21, 3.3, 3.2], [-23, 1, 0.9], [4, 18, 2.6]]) pirate(k, x, z, a, rr, s, rr() < 0.25 ? 'wave' : 'stand');
  // a wreck of a rover and tyre stacks by the gate
  for (const [x, z] of [[-14, 24], [-12, 26], [-15.5, 26.5]]) { for (let i = 0; i < 3; i++) k.add(new THREE.TorusGeometry(0.75, 0.32, 6, 12).rotateX(Math.PI / 2), T(TYRE), x, F + 0.32 + i * 0.6, z, { outline: 0.03 }); k.column(1.05, F + 1.8, x, z); }
  cargoStack(k, -26, -12, 1, cargoFor(k, 'rustmoon'), 1.2, F);
  cargoStack(k, -28, -3, 2, cargoFor(k, 'rustmoon').slice(1), 1.4, F);
  // pirate lights on poles
  const poles = [[-14, 10], [-2, 16], [10, 22], [20, 26]];
  for (const [x, z] of poles) { k.cyl(0.1, 0.13, 6, 6, T(DARK), x, F, z, { outline: 0.03 }); k.column(0.15, F + 6, x, z); }
  lightString(k, poles.map(([x, z]) => [x, F + 5.8, z]), [0x7dff3a, 0xff2e88, YEL, 0x7dff3a]);
  flagPole(k, -7, 36.5); flagPole(k, 7, 36.5);
}

// =====================================================================================================================
// SCRAP SHACK B: the Hulk. A crashed freighter's hull, propped on its belly, turned into the clan's workshop: lean-to rooms
// down its flank, a ramp into the hold, a lookout on its back; a stockade of plates and a ring of junk round it.
// =====================================================================================================================
function shackB(k) {
  const s = style(k, 'rustmoon'), c = k.c, rr = k.rr;
  yard(k, 0x6f6878, 0x3a3540);
  // stockade: tall scrap plates on posts, the gate at +z flanked by two watch boxes on stilts
  for (let a = 0.28; a < TAU - 0.28; a += 2.4 / 37) {
    const [x, z] = polar(37, a), h = 3.2 + rr() * 1.2;
    k.box(2.5, h, 0.2, T([0x6b5a4a, 0x7a3a2a, 0x5a5f6e, 0x8a8698, 0x4a6a5a][Math.floor(rr() * 5)]), x, F, z, { ry: a, rz: (rr() - 0.5) * 0.08, outline: 0.04 });
    k.add(new THREE.ConeGeometry(0.2, 0.7, 4), T(STEEL), x, F + h + 0.3, z, { outline: 0.02 });
    k.solid(1.25, (F + h) / 2, 0.2, x, z, a);
  }
  for (const sd of [-1, 1]) within(k, sd * 7.5, 36, 0, () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([sx * 1.4, F, sz * 1.4], [sx * 1.0, F + 6, sz * 1.0], 0.1, T(DARK), { outline: 0.02 });
    k.box(2.8, 2.2, 2.8, T(RUST), 0, F + 6, 0, { outline: 0.05 });
    k.box(2.6, 0.7, 0.1, G(s.glow), 0, F + 7.0, 1.42, { outline: 0 });
    k.add(new THREE.ConeGeometry(2.4, 1.2, 4).rotateY(Math.PI / 4), T(0x5a3a2a), 0, F + 8.8, 0, { outline: 0.04 });
    k.solid(1.4, 0.5 + (F + 8.2) / 2, 1.4, 0, 0);
  });
  // the hulk
  const HX = -4, HZ = -10;
  if (!k.wreck) {
    within(k, HX, HZ, 0.35, () => {
      const r = 7.5, len = 34;
      k.add(new THREE.CapsuleGeometry(r, len * 0.55, 6, 16).rotateZ(Math.PI / 2), T(0x7a7486), 0, r * 0.7, 0, { outline: 0.22 });
      for (let t = -12; t <= 10; t += 4) k.add(new THREE.TorusGeometry(r + 0.05, 0.3, 4, 20, Math.PI * 1.2), T(0x4a4660), t, r * 0.7, 0, { ry: Math.PI / 2, rz: -0.1 - Math.PI * 0.1, outline: 0.04 });
      // patches and a clan stripe on the hull's flank, each laid on the curve at its own height
      for (let i = 0; i < 8; i++) { const y = 2 + rr() * 6, dy = y - r * 0.7, zz = Math.sqrt(r * r - dy * dy) + 0.06; k.box(2 + rr() * 2, 1 + rr() * 1.5, 0.08, T([0x8a8698, 0x6b5a4a, 0x9a6a3a, 0x7a3a2a][i % 4]), -14 + rr() * 26, y, zz, { rx: -Math.asin(dy / r), outline: 0.02 }); }
      k.add(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 3.2, 24, 1, true, 0.6, 1.2).rotateZ(Math.PI / 2), T(c), -7, r * 0.7, 0, { outline: 0 });
      // engine bells at the stern, the cockpit at the bow (glow)
      for (const dz of [-3, 0, 3]) k.cyl(1.4, 2.0, 2.6, 12, T(DARK), -len / 2 - 2.0, r * 0.7 + (dz === 0 ? 2 : 0), dz, { rz: Math.PI / 2, outline: 0.05 });
      k.add(new THREE.SphereGeometry(3, 14, 8, 0, TAU, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(1, 1.4, 1.6), GLASS(0x7dff3a, 0.5), len * 0.4, r * 0.95, 0, { outline: 0.05 });
      // the hold ramp down to the yard (+z side), its opening lit
      k.box(6, 4.6, 0.2, G(0xffb347), 2, 0.4, r * 0.9 - 0.4, { outline: 0 });
      k.add(new THREE.BoxGeometry(6, 0.25, 6.5), T(0x5a5f6e), 2, 0.4 + 1.2, r + 2.4, { rx: 0.4, outline: 0.04 });
      k.solidQ(3, 0.12, 3.25, 2, 1.6, r + 2.4, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0)));
      // lean-to rooms along the flank, roofs falling away from the hull, posts cut to the underside
      for (const [t, w] of [[-10, 6], [12.5, 5]]) {
        k.box(w, 3, 3.6, T([0x6b5a4a, 0x4a6a5a][t > 0 ? 1 : 0]), t, F, r + 1.6, { outline: 0.06 });
        k.box(1.2, 2.2, 0.1, T(DARK), t - 1, F, r + 3.42, { outline: 0.02 });
        k.box(1.2, 0.8, 0.1, G(s.glow), t + 1.4, F + 1.4, r + 3.42, { outline: 0 });
        k.add(new THREE.BoxGeometry(w + 0.6, 0.14, 4.6), T(RUST), t, F + 3.45, r + 1.6, { rx: 0.2, outline: 0.04 });
        k.solid(w / 2, (F + 3.4) / 2, 1.8, t, r + 1.6);
      }
      // the lookout on its back: a railed crow's nest and the clan banner
      k.cyl(1.6, 1.8, 2, 10, T(RUST), 4, r * 1.65, 0, { outline: 0.05 });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.box(0.08, 1.0, 0.08, T(DARK), 4 + Math.sin(a) * 1.7, r * 1.65 + 2, Math.cos(a) * 1.7, { outline: 0 }); }
      k.add(new THREE.TorusGeometry(1.7, 0.05, 3, 16).rotateX(Math.PI / 2), T(c), 4, r * 1.65 + 3.0, 0, { outline: 0 });
      k.flag(5, -1, 6, c, r * 1.6 + 2);
      emblem(k, -11, r * 0.7, r + 0.02, 0, 2.4, 'rustmoon');
      k.solid(len * 0.48, r * 0.6, r * 0.9, 0, 0, 0, 0);
      k.hcyl(r * 0.92, len * 0.75, 0, 0, Math.PI / 2, r * 0.7);
      k.column(1.8, r * 1.65 + 2, 4, 0);
      if (rr) pirate(k, 4, 0.6, 0, rr, s);
    });
  } else {
    within(k, HX, HZ, 0.35, () => {
      const wr = k.wr, r = 7.5;
      k.add(new THREE.CapsuleGeometry(r, 6, 6, 16).rotateZ(Math.PI / 2), T(0x4a4458), -8, r * 0.6, 0, { rz: 0.2, outline: 0.22 });
      for (let t = -2; t <= 14; t += 3) k.add(new THREE.TorusGeometry(r, 0.3, 4, 16, Math.PI * (0.5 + wr() * 0.6)), T(0x3a3650), t, r * 0.6, 0, { ry: Math.PI / 2, rz: wr(), outline: 0.04 });
      k.solid(9, r * 0.6, r * 0.9, -8, 0);
      k.solid(8, 1.5, r * 0.8, 8, 0);
      scatterDebris(k, 4, 0, 12, 8, 26, wr);
    });
  }
  k.hit(14, 5, 6, HX, HZ, 0.35);
  k.smoke = new THREE.Vector3(HX, 4, HZ);
  k.drop = new THREE.Vector3(18, F, 14);
  // the plating stack at the ramp's foot (raid)
  within(k, 0, 6, 0.35, () => {
    for (let i = 0; i < 5; i++) k.box(2.0, 1.6, 0.08, T([0x8a8698, 0x9a6a3a, 0x5a5f6e][i % 3]), 0, F + 0.2, -0.6 + i * 0.3, { rx: -0.25, outline: 0.02 });
    k.box(2.4, 0.3, 2.0, T(DARK), 0, F, 0, { outline: 0.03 });
    k.solid(1.2, (F + 1.8) / 2, 1.0, 0, 0);
  });
  k.raidAt(-0.8, 8.5, 0x7dff3a);
  // the yard: a heap, scrap boxes, a still on a fire, a cook pit with seats
  junkHeap(k, 24, -14, 7, 4, 38, k.rr);
  scrapBox(k, -26, F, 4, 0.4, 0x4a6a5a, rr);
  scrapBox(k, -24, F, -12, 1.2, 0x7a3a2a, rr);
  scrapBox(k, -24.3, F + 2.6, -12, 1.25, 0x5a5f6e, rr);
  burnBarrel(k, 10, 14);
  k.cyl(2.2, 2.4, 0.4, 12, T(0x3a3540), 18, F, 2, { outline: 0.03 });
  const pit = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 7), G(0xff7a1a)); pit.userData.blink = true; k.dyn(pit, 18, F + 1.2, 2);
  k.column(2.4, F + 0.4, 18, 2);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; const [x, z] = polar(3.8, a); k.cyl(0.45, 0.45, 0.5, 8, T(TYRE), 18 + x, F, 2 + z, { outline: 0.03 }); if (!k.wreck && i % 2 === 0) pirate(k, 18 + x, 2 + z, a + Math.PI, rr, s, 'sit'); }
  if (!k.wreck) for (const [x, z, a] of [[9, 15, 3.4], [11, 13, 0.6], [-20, 6, 1.0], [-6, 20, 2.8], [-5, 21, 0.4]]) pirate(k, x, z, a, rr, s, rr() < 0.2 ? 'wave' : 'stand');
  const poles = [[-20, 16], [-8, 24], [8, 24], [22, 14]];
  for (const [x, z] of poles) { k.cyl(0.1, 0.13, 6, 6, T(DARK), x, F, z, { outline: 0.03 }); k.column(0.15, F + 6, x, z); }
  lightString(k, poles.map(([x, z]) => [x, F + 5.8, z]), [0x7dff3a, 0xff2e88, YEL]);
}


// =====================================================================================================================
// SCRAP SHACK (the pick: a mix of A and B). The crashed freighter's hull, hollowed out and lived in: its plating stripped
// along the yard side so the hold stands open on two decks, the ribs left standing across the gap, rooms of containers on the
// lower deck and a railed mezzanine above, a corrugated porch roof out over the opening, the bow boarded up with a lit window,
// the stern walled off with a big lit doorway, holes cut for windows. Round it: B's stockade and watch boxes, A's container
// bunkhouse with its stair and balcony, the derrick over the heap and the scrap press, the cook-fire ring, pirate lights.
// =====================================================================================================================
function shackMix(k) {
  const s = style(k, 'rustmoon'), c = k.c, rr = k.rr, wr = k.wr;
  yard(k, 0x6f6878, 0x3a3540);
  // the stockade and the two watch boxes at the gate (B)
  for (let a = 0.28; a < TAU - 0.28; a += 2.4 / 37) {
    const [x, z] = polar(37, a), h = 3.2 + rr() * 1.2;
    k.box(2.5, h, 0.2, T([0x6b5a4a, 0x7a3a2a, 0x5a5f6e, 0x8a8698, 0x4a6a5a][Math.floor(rr() * 5)]), x, F, z, { ry: a, rz: (rr() - 0.5) * 0.08, outline: 0.04 });
    k.add(new THREE.ConeGeometry(0.2, 0.7, 4), T(STEEL), x, F + h + 0.3, z, { outline: 0.02 });
    k.solid(1.25, (F + h) / 2, 0.2, x, z, a);
  }
  for (const sd of [-1, 1]) within(k, sd * 7.5, 36, 0, () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([sx * 1.4, F, sz * 1.4], [sx * 1.0, F + 6, sz * 1.0], 0.1, T(DARK), { outline: 0.02 });
    k.box(2.8, 2.2, 2.8, T(RUST), 0, F + 6, 0, { outline: 0.05 });
    k.box(2.6, 0.7, 0.1, G(s.glow), 0, F + 7.0, 1.42, { outline: 0 });
    k.add(new THREE.ConeGeometry(2.4, 1.2, 4).rotateY(Math.PI / 4), T(0x5a3a2a), 0, F + 8.8, 0, { outline: 0.04 });
    k.solid(1.4, 0.5 + (F + 8.2) / 2, 1.4, 0, 0);
  });
  // the hull: local x along the keel, +z the open flank toward the yard
  const HX = -4, HZ = -13, HY = 0.25, r = 7.5, cy = 4.0, L = 30, NS = 6, NA = 28, DECK = 0.4;
  const secL = L / NS, hullC = [0xa8a2b4, 0x948ea2, 0xb4a890];
  within(k, HX, HZ, HY, () => {
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    // plates: NA round the hull per section; phi from straight up (0) toward +z (pi/2); none under the ground
    for (let si = 0; si < NS; si++) {
      const x = -L / 2 + secL * (si + 0.5);
      for (let i = 0; i < NA; i++) {
        const phi = (i / NA) * TAU, y = cy + r * Math.cos(phi), z = r * Math.sin(phi);
        if (y < 0.1) continue;
        const open = z > 0.5 && y > DECK - 0.5 && y < cy + r * 0.8 && si > 0 && si < NS - 1; // the stripped flank
        const gone = k.wreck ? wr() < 0.55 : open || rr() < 0.05; // (and the odd missing plate)
        if (gone) continue;
        const w = (TAU * r) / NA + 0.06;
        const lean = k.wreck ? (wr() - 0.5) * 0.3 : 0;
        k.add(new THREE.BoxGeometry(secL - 0.08, 0.22, w), T(hullC[(si + i) % 3]), x, y, z, { rx: phi + lean, outline: 0.04 });
        // a few window holes cut in the upper plates, lit from inside
        if (!k.wreck && z < -1 && y > cy && y < cy + 5 && (si + i) % 4 === 0) k.add(new THREE.BoxGeometry(1.4, 0.24, 0.8), G(0xffb347), x, y, z, { rx: phi, outline: 0 });
        if (y > DECK + 0.3) { q.setFromEuler(e.set(phi, 0, 0)); k.solidQ((secL - 0.08) / 2, 0.15, w / 2, x, y, z, q); }
      }
    }
    // ribs at every section joint: full rings, standing bare across the open flank
    for (let si = 0; si <= NS; si++) {
      const x = -L / 2 + secL * si;
      if (k.wreck && wr() < 0.4) continue;
      k.add(new THREE.TorusGeometry(r + 0.05, 0.28, 5, 28, k.wreck ? Math.PI * (0.6 + wr() * 0.5) : TAU).rotateY(Math.PI / 2), T(0x4a4660), x, cy, 0, { outline: 0.04 });
    }
    k.beam([-L / 2, cy + r + 0.1, 0], [L / 2, cy + r + 0.1, 0], 0.35, T(0x4a4660), { outline: 0.04 }); // the spine
    k.beam([-L / 2 + secL, DECK + 0.1, r * 0.9], [L / 2 - secL, DECK + 0.1, r * 0.9], 0.3, T(0x4a4660), { outline: 0.03 }); // the sill
    // the lower deck: plate floor at a step's height, hazard edge along the opening
    k.box(L - 0.4, DECK, 13, T(0x5a5f6e), 0, 0, -0.3, { outline: 0.03 });
    for (let i = 0; i < 12; i++) k.box(1.2, 0.006, 0.3, T(i % 2 ? YEL : DARK), -L / 2 + secL + 0.8 + i * 1.65, DECK, 6.0, { outline: 0 });
    if (!k.wreck) {
      // bow boarded over with a lit window; stern walled with a big doorway
      k.add(new THREE.SphereGeometry(r, 16, 10, 0, TAU, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(0.55, 1, 1), T(0x6b5a4a), L / 2, cy, 0, { outline: 0.1 });
      for (let i = 0; i < 6; i++) k.box(0.1, 1.2 + rr() * 1.2, 2 + rr() * 2, T([0x8a8698, 0x9a6a3a, 0x5a5f6e][i % 3]), L / 2 + 3.6 + rr() * 0.3, cy - 2 + rr() * 5, (rr() - 0.5) * 7, { outline: 0.02 });
      k.box(0.1, 1.4, 2.4, G(s.glow), L / 2 + 4.1, cy + 1.5, 1.2, { outline: 0 });
      k.add(new THREE.CylinderGeometry(r, r, 0.3, 28).rotateZ(Math.PI / 2), T(0x5a5f6e), -L / 2 - 0.1, cy, 0, { outline: 0.06 });
      k.box(0.32, 4, 6, G(0xffb347), -L / 2 - 0.16, DECK, 0, { outline: 0 });
      for (const sd of [-1, 1]) k.cyl(1.2, 1.7, 1.8, 12, T(DARK), -L / 2 - 1.2, cy + 3.2, sd * 3.6, { rz: Math.PI / 2, outline: 0.04 });
      k.solid(0.2, cy, r * 0.9, -L / 2, 0); k.solid(3.6, cy, r * 0.9, L / 2 + 2, 0);
      // rooms: three containers along the back of the lower deck, lit doors facing the hold
      const cols = [0x4a6a5a, 0x7a3a2a, 0x5a5f6e];
      for (let i = 0; i < 3; i++) {
        const x = -9 + i * 7.5;
        scrapBox(k, x, DECK, -3.6, Math.PI / 2, cols[i], rr);
        k.box(1.4, 2.2, 0.1, G(i === 1 ? s.glow : 0xffb347), x - 1.6, DECK, -2.33, { outline: 0 });
        k.box(1.6, 0.8, 0.1, G(0xffe6a8), x + 1.4, DECK + 1.2, -2.33, { outline: 0 });
      }
      // the mezzanine: a plate deck on the containers' roofs and posts, a rail along its edge, a stair up
      const MY = DECK + 2.7;
      k.box(L - 2 * secL + 2, 0.2, 4.4, T(0x55505e), 0, MY, -3.0, { outline: 0.03 });
      k.solid((L - 2 * secL + 2) / 2, 0.1, 2.2, 0, -3.0, 0, MY);
      for (let x = -10; x <= 10; x += 2) k.box(0.06, 1.0, 0.06, T(DARK), x, MY + 0.2, -0.85, { outline: 0 });
      k.box(L - 2 * secL + 2, 0.08, 0.08, T(c), 0, MY + 1.2, -0.85, { outline: 0 });
      for (let i = 0; i < 9; i++) k.box(1.2, 0.18, 0.4, T(DARK), 10.2 - i * 0.36, DECK + 0.3 + i * 0.3, 0.4, { ry: Math.PI / 2, outline: 0.02 });
      // a workshop on the deck: bench, lamp strip under the mezzanine, hanging chains
      k.box(4, 0.9, 1.2, T(STEEL), -4, DECK, 1.5, { outline: 0.04 });
      k.solid(2, (DECK + 0.9) / 2, 0.6, -4, 1.5);
      k.box(L - 2 * secL, 0.12, 0.3, G(0xfff3b0), 0, MY - 0.1, -0.9, { outline: 0 });
      for (const x of [-6, 2]) { k.beam([x, cy + r - 0.4, 2], [x, MY + 1.4, 2], 0.03, T(DARK), { outline: 0 }); k.box(0.6, 0.5, 0.4, T(YEL), x, MY + 0.9, 2, { outline: 0.02 }); }
      // the porch: a corrugated roof from over the opening out across the yard, falling to +z, posts cut to its underside
      const z0 = r * 0.92, z1 = r + 5, y0 = cy + 2.4, y1 = 3.6, sl = Math.atan2(y0 - y1, z1 - z0), len = Math.hypot(z1 - z0, y0 - y1);
      k.add(new THREE.BoxGeometry(2 * secL, 0.14, len + 0.4), T(RUST), -secL / 2, (y0 + y1) / 2 + 0.07, (z0 + z1) / 2, { rx: sl, outline: 0.05 });
      for (let i = -3; i <= 2; i++) k.add(new THREE.BoxGeometry(0.05, 0.04, len), T(0x5a3a2a), i * 1.8, (y0 + y1) / 2 + 0.16, (z0 + z1) / 2, { rx: sl, outline: 0 });
      for (const x of [-secL * 1.5 + 0.3, secL / 2 - 0.3]) { const zz = z1 - 0.4, top = y1 + (y0 - y1) * ((z1 - zz) / (z1 - z0)); k.box(0.22, top - F, 0.22, T(DARK), x, F, zz, { outline: 0.02 }); k.column(0.16, top, x, zz); }
      k.solidQ(secL, 0.1, len / 2 + 0.2, -secL / 2, (y0 + y1) / 2, (z0 + z1) / 2, new THREE.Quaternion().setFromEuler(new THREE.Euler(sl, 0, 0)));
      lightString(k, [[-secL * 1.5 + 0.3, y1 - 0.2, z1 - 0.4], [secL / 2 - 0.3, y1 - 0.2, z1 - 0.4]], [0x7dff3a, 0xff2e88, YEL], 8, 0.5);
      // the crow's nest and banner on its back, a dish beside it, a clan stripe
      k.cyl(1.6, 1.8, 2, 10, T(RUST), 6, cy + r, 0, { outline: 0.05 });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.box(0.08, 1.0, 0.08, T(DARK), 6 + Math.sin(a) * 1.7, cy + r + 2, Math.cos(a) * 1.7, { outline: 0 }); }
      k.add(new THREE.TorusGeometry(1.7, 0.05, 3, 16).rotateX(Math.PI / 2), T(c), 6, cy + r + 3.0, 0, { outline: 0 });
      k.flag(7, -1, 6, c, cy + r + 2);
      k.dishHead(-6, cy + r + 0.2, -1, 1.0, 'rustmoon', { az: Math.PI * 0.8, el: -0.6 });
      k.column(1.8, cy + r + 2, 6, 0);
      emblem(k, -12.5, cy + 0.5, r + 0.05, 0, 2.4, 'rustmoon');
      // people at home in the hold
      for (const [x, z, a, pose] of [[-4, 0.4, Math.PI, 'stand'], [-1, 2.6, -2, 'stand'], [5, 1.2, 2.2, 'wave'], [-7, -3.0, 0.1, 'stand']]) pirate(k, x, z, a, rr, s, pose);
      person(k, 3, -3.4, 0.2, rr, { y: MY + 0.2, suit: 0x3a2b4f, helmet: s.trim });
    } else {
      scatterDebris(k, 0, 0, L * 0.4, 5, 30, wr);
      k.box(9, 0.3, 7, T(RUST), 4, F + 1.2, r + 2, { rx: 0.5, rz: 0.2, outline: 0.05 });
      k.solid(4.5, 1.0, 3.5, 4, r + 2);
      for (let i = 0; i < 6; i++) k.box(0.3, 0.12, 0.3, G(i % 2 ? 0xff7a1a : 0xffb347), (wr() - 0.5) * L * 0.6, DECK + 0.1, (wr() - 0.5) * 8, { outline: 0 });
    }
  });
  k.hit(L / 2, cy, r, HX, HZ, HY);
  k.smoke = new THREE.Vector3(HX, 3, HZ);
  k.drop = new THREE.Vector3(16, F, 18);
  // the plating rack in the hold's mouth: the raid spot
  within(k, HX, HZ, HY, () => within(k, 6, 6.5, 0, () => {
    for (let i = 0; i < 5; i++) k.box(2.0, 1.6, 0.08, T([0x8a8698, 0x9a6a3a, 0x5a5f6e][i % 3]), 0, DECK + 0.2, -0.6 + i * 0.3, { rx: -0.25, outline: 0.02 });
    k.box(2.4, 0.3, 2.0, T(DARK), 0, DECK, 0, { outline: 0.03 });
    k.solid(1.2, (DECK + 1.8) / 2, 1.0, 0, 0);
  }));
  within(k, HX, HZ, HY, () => k.raidAt(6, 9.3, 0x7dff3a));
  // A's bunkhouse: two boxes with one on top, a stair and a railed balcony, lit doors (west of the gate road)
  within(k, -24, 10, 1.25, () => {
    const cols = [0x6b5a4a, 0x8a5a3a, 0x5a5f6e];
    if (k.wreck) { scrapBox(k, 0, F, 0, Math.PI / 2 + 0.2, CHAR, wr); scrapBox(k, 0.5, F, 3.2, Math.PI / 2 - 0.3, 0x3a3540, wr); return; }
    scrapBox(k, -3.2, F, 0, Math.PI / 2, cols[0], rr);
    scrapBox(k, 3.2, F, 0, Math.PI / 2, cols[1], rr);
    scrapBox(k, 0, F + 2.6, 0.2, Math.PI / 2, cols[2], rr);
    for (const x of [-3.2, 3.2]) k.box(1.6, 2.3, 0.1, G(0xffb347), x, F, 1.29, { outline: 0 });
    k.box(2.2, 1.0, 0.1, G(s.glow), 0, F + 3.8, 1.49, { outline: 0 });
    for (let i = 0; i < 9; i++) k.box(1.2, 0.18, 0.4, T(DARK), -7.0, F + 0.3 + i * 0.3, 3.4 - i * 0.36, { outline: 0.02 });
    k.box(9, 0.15, 1.6, T(DARK), -2.2, F + 2.6, 2.0, { outline: 0.03 });
    for (let x = -6.5; x <= 2; x += 1.5) k.box(0.08, 1.0, 0.08, T(DARK), x, F + 2.75, 2.75, { outline: 0 });
    k.box(9, 0.08, 0.08, T(c), -2.2, F + 3.75, 2.75, { outline: 0 });
    k.solid(4.5, 0.08, 0.8, -2.2, 2.0, 0, F + 2.6);
    k.cyl(0.25, 0.25, 3, 6, T(DARK), 2, F + 5.2, 0.4, { outline: 0.02 });
    pirate(k, -1, 2.0, 0.3, rr, s);
  });
  // A's derrick over the heap and the scrap press (east)
  junkHeap(k, 22, -6, 6.5, 3.8, 36, k.rr);
  within(k, 15, 6, 0, () => {
    lattice(k, 0, 0, 12, 1.0, 0.6, 4, T(RUST), T(DARK), { r: 0.14 });
    k.beam([0, 11.6, 0], [6, 13, -8], 0.22, T(YEL), { outline: 0.03 });
    k.beam([0, 9, 0], [6, 13, -8], 0.08, T(DARK), { outline: 0 });
    k.beam([6, 13, -8], [6, 8.5, -8], 0.03, T(DARK), { outline: 0 });
    k.box(0.6, 0.8, 0.3, T(YEL), 6, 7.7, -8, { outline: 0.03 });
  });
  within(k, 27, 8, -0.9, () => {
    k.box(5, 3.2, 4, T(0x5a5f6e), 0, F, 0, { outline: 0.08 });
    k.box(4.6, 1.6, 3.6, T(RUST), 0, F + 3.2, 0, { outline: 0.05 });
    for (const sd of [-1, 1]) k.box(0.5, 4.4, 0.5, T(YEL), sd * 2.4, F + 3.2, 0, { outline: 0.03 });
    k.box(5.4, 0.6, 0.8, T(YEL), 0, F + 7.4, 0, { outline: 0.03 });
    k.box(1.4, 1.4, 1.4, T(0x6b5a4a), 0, F, 3, { ry: 0.3, outline: 0.04 });
    k.solid(2.7, (F + 8) / 2, 2.0, 0, 0);
  });
  // B's cook fire with tyre seats, burning barrels, tyre stacks, stolen containers, pirate lights
  k.cyl(2.2, 2.4, 0.4, 12, T(0x3a3540), 6, F, 18, { outline: 0.03 });
  const pit = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 7), G(0xff7a1a)); pit.userData.blink = true; k.dyn(pit, 6, F + 1.2, 18);
  k.column(2.4, F + 0.4, 6, 18);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; const [x, z] = polar(3.8, a); k.cyl(0.45, 0.45, 0.5, 8, T(TYRE), 6 + x, F, 18 + z, { outline: 0.03 }); if (!k.wreck && i % 2 === 0) pirate(k, 6 + x, 18 + z, a + Math.PI, rr, s, 'sit'); }
  burnBarrel(k, -10, 20);
  burnBarrel(k, 20, 20);
  for (const [x, z] of [[-16, 24], [-14, 26], [-17.5, 26.5]]) { for (let i = 0; i < 3; i++) k.add(new THREE.TorusGeometry(0.75, 0.32, 6, 12).rotateX(Math.PI / 2), T(TYRE), x, F + 0.32 + i * 0.6, z, { outline: 0.03 }); k.column(1.05, F + 1.8, x, z); }
  cargoStack(k, -28, -12, 1, cargoFor(k, 'rustmoon'), 1.2, F);
  cargoStack(k, -29, -3, 2, cargoFor(k, 'rustmoon').slice(1), 1.4, F);
  if (!k.wreck) for (const [x, z, a] of [[-9, 21.5, 3.4], [21, 21.3, 0.6], [-2, 28, 2.8], [-1, 28.8, 0.4], [18, 12, 2]]) pirate(k, x, z, a, rr, s, rr() < 0.2 ? 'wave' : 'stand');
  const poles = [[-20, 16], [-8, 30], [8, 30], [22, 16]];
  for (const [x, z] of poles) { k.cyl(0.1, 0.13, 6, 6, T(DARK), x, F, z, { outline: 0.03 }); k.column(0.15, F + 6, x, z); }
  lightString(k, poles.map(([x, z]) => [x, F + 5.8, z]), [0x7dff3a, 0xff2e88, YEL]);
}

DRAFT_BUILD.shack = { a: shackA, b: shackB, c: shackMix };

// =====================================================================================================================
// JUNK PILE A: Scrap Mountain. A 13 m mound of wreckage worked by an electromagnet crane on a turning lattice boom, a sorting
// line into bins, a crusher, the junk-bot repair bench (raid), the yard foreman's hut.
// =====================================================================================================================
function junkA(k) {
  const s = style(k, 'rustmoon'), c = k.c, rr = k.rr;
  yard(k, 0x6f6878, 0x3a3540);
  for (let a = 0.3; a < TAU - 0.3; a += 2.8 / 37) { if (rr() < 0.15) continue; const [x, z] = polar(37.5, a); k.box(2.6, 1.0 + rr() * 0.8, 1.2, T([0x5a5f6e, 0x6b5a4a, 0x7a3a2a][Math.floor(rr() * 3)]), x, F, z, { ry: a + (rr() - 0.5) * 0.3, outline: 0.04 }); k.solid(1.3, (F + 1.6) / 2, 0.6, x, z, a); }
  const MX = -6, MZ = -10;
  if (!k.wreck) junkHeap(k, MX, MZ, 15, 11, 120, k.mr);
  else junkHeap(k, MX, MZ, 17, 5, 90, k.wr);
  // a car body, a ship's fin and a dish poking out of the top
  if (!k.wreck) {
    k.box(2.4, 1.4, 4.6, T(0xd9482b), MX + 1, F + 10.2, MZ - 1, { rx: 0.5, rz: 0.3, outline: 0.06 });
    k.add(new THREE.CylinderGeometry(0.1, 3, 5, 3), T(0x8a8698), MX - 3, F + 9.5, MZ + 2, { rz: 0.5, outline: 0.06 });
    k.dishHead(MX + 3, F + 8.5, MZ + 3, 1.4, 'none', { el: -0.2, az: 0.8 });
    k.column(4, F + 11, MX, MZ, F + 9);
  }
  k.hit(10, 5, 10, MX, MZ);
  k.smoke = new THREE.Vector3(MX, 4, MZ);
  k.drop = new THREE.Vector3(16, F, 18);
  // the magnet crane: tracks, a turning cab on a ring with a lattice boom and the magnet disc hanging over the heap
  const CX = 16, CZ = -14;
  within(k, CX, CZ, 0, () => {
    for (const sd of [-1, 1]) { k.box(1.4, 1.4, 7, T(TYRE), sd * 2.2, F, 0, { outline: 0.05 }); for (let i = -3; i <= 3; i++) k.box(1.5, 0.15, 0.4, T(DARK), sd * 2.2, F + 1.35, i, { outline: 0 }); }
    k.box(3.6, 0.8, 5, T(s.dark), 0, F + 1.0, 0, { outline: 0.04 });
    k.solid(3, (F + 1.8) / 2, 3.6, 0, 0);
  });
  if (!k.wreck) {
    const q = new Kit(k.c, 3, false);
    q.cyl(2.2, 2.2, 0.5, 16, T(DARK), 0, 0, 0, { outline: 0.04 });
    q.box(4.4, 3.2, 3.6, T(YEL), 0, 0.5, -0.6, { outline: 0.06 });
    q.box(1.8, 1.2, 0.08, GLASS(GLASSC, 0.6), 1.0, 2.2, 1.21, { outline: 0.02 });
    q.box(4.6, 0.3, 3.8, T(c), 0, 3.7, -0.6, { outline: 0 });
    q.box(3.4, 1.8, 2.2, T(0x5a5f6e), 0, 0.5, -3.3, { outline: 0.04 });
    // boom up and out over the heap (local -x), the magnet hanging from its tip
    const tip = [-17, 15, 0], foot = [-1, 2.0, 0];
    for (const sz of [-0.6, 0.6]) for (const dy of [0, 1.0]) q.beam([foot[0], foot[1] + dy, sz], [tip[0], tip[1] + dy * 0.3, sz * 0.4], 0.12, T(YEL), { outline: 0.03 });
    for (let t = 0; t < 1; t += 0.1) { const p = [foot[0] + (tip[0] - foot[0]) * t, foot[1] + (tip[1] - foot[1]) * t, 0]; q.beam([p[0], p[1], -0.6 * (1 - t * 0.6)], [p[0] - 1.6, p[1] + 1.6 * ((tip[1] - foot[1]) / -(tip[0] - foot[0])) + 1.0, 0.6 * (1 - t * 0.6)], 0.05, T(DARK), { outline: 0 }); }
    q.beam([0, 3.8, -0.6], [0, 7, -0.6], 0.15, T(DARK), { outline: 0.02 });
    q.beam([0, 7, -0.6], [tip[0], tip[1] + 0.3, 0], 0.04, T(DARK), { outline: 0 });
    q.beam([tip[0], tip[1], 0], [tip[0], tip[1] - 5.5, 0], 0.05, T(DARK), { outline: 0 });
    q.cyl(1.6, 1.6, 0.6, 16, T(0x3a3550), tip[0], tip[1] - 6.1, 0, { outline: 0.04 });
    q.cyl(1.62, 1.62, 0.1, 16, G(0xff7a1a), tip[0], tip[1] - 6.15, 0, { outline: 0 });
    for (let i = 0; i < 3; i++) q.box(1.2, 0.6, 1.6, T([0x6b5a4a, 0x8a8698, 0xa05a2a][i]), tip[0] + (i - 1) * 0.6, tip[1] - 6.8 - i * 0.2, (i - 1) * 0.3, { rx: i * 0.4, outline: 0.04 });
    const g = q.finish().root;
    g.userData.spin = 0.12;
    k.dyn(g, CX, F + 1.8, CZ);
    k.column(2.4, F + 5.5, CX, CZ);
  } else {
    k.box(4.4, 3.2, 3.6, T(0x8a6a2a), CX + 1, F + 1.8, CZ, { rz: 0.5, outline: 0.06 });
    for (const sz of [-0.6, 0.6]) k.beam([CX - 1, F + 2.6, CZ + sz], [CX + 4, F + 0.6, CZ + 15 + sz], 0.12, T(0x8a6a2a), { outline: 0.03 });
    k.solid(2.2, 1.6, 2, CX + 1, CZ);
  }
  // the sorting line: a hopper, a belt on trestles to three bins (metal, plastics, parts)
  within(k, 8, 14, -0.3, () => {
    k.add(new THREE.CylinderGeometry(2.4, 1.0, 2.4, 4).rotateY(Math.PI / 4), T(s.panel), -8, F + 3.8, 0, { outline: 0.05 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(0.2, 2.6, 0.2, T(DARK), -8 + sx * 1.2, F, sz * 1.2, { outline: 0 });
    k.add(new THREE.BoxGeometry(14, 0.3, 1.6), T(DARK), 0, F + 2.0, 0, { rz: -0.1, outline: 0.03 });
    for (const sd of [-1, 1]) k.add(new THREE.BoxGeometry(14, 0.4, 0.12), T(YEL), 0, F + 2.25, sd * 0.85, { rz: -0.1, outline: 0 });
    for (let x = -6; x <= 6; x += 3) for (const sd of [-1, 1]) k.box(0.15, 2.0 + x * 0.1 - 0.1, 0.15, T(STEEL), x, F, sd * 0.7, { outline: 0 });
    for (let i = 0; i < 6; i++) k.box(0.5, 0.4, 0.5, T([0x8a8698, 0xa05a2a, 0x5a5f6e][i % 3]), -5 + i * 2, F + 2.35 - (-5 + i * 2) * 0.1, (rr() - 0.5) * 0.6, { ry: rr(), outline: 0.02 });
    k.solidQ(7, 0.2, 0.9, 0, F + 2.0, 0, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.1)));
    for (let i = 0; i < 3; i++) {
      const bx = 4 + i * 3.4;
      k.box(3, 1.8, 3, T([0x5a5f6e, 0x4a6a5a, 0x7a3a2a][i]), bx, F, 3.2, { outline: 0.05 });
      k.box(2.6, 0.3, 2.6, T([0x8a8698, 0x7dd87a, 0xa05a2a][i]), bx, F + 1.6, 3.2, { outline: 0 });
      k.solid(1.5, (F + 1.8) / 2, 1.5, bx, 3.2);
    }
  });
  // the crusher
  within(k, -26, 10, 0.6, () => {
    k.box(5, 4, 4.5, T(0x5a5f6e), 0, F, 0, { outline: 0.08 });
    k.add(new THREE.CylinderGeometry(3, 1.6, 2.4, 4).rotateY(Math.PI / 4), T(RUST), 0, F + 5.2, 0, { outline: 0.05 });
    k.box(2.4, 1.2, 2.4, T(0x7a3a2a), 0, F, 3.4, { ry: 0.2, outline: 0.04 });
    k.solid(2.5, (F + 6.4) / 2, 2.3, 0, 0);
  });
  // the junk-bot bench under an awning (raid): a half-built bot, spare heads and a welder's spark
  within(k, 18, 6, -0.9, () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { k.box(0.15, 3.2, 0.15, T(DARK), sx * 2.4, F, sz * 1.6, { outline: 0.02 }); }
    k.box(5.4, 0.15, 3.8, T(RUST), 0, F + 3.2, 0, { outline: 0.04 });
    k.solid(2.7, 0.1, 1.9, 0, 0, 0, F + 3.2);
    k.box(3.2, 0.9, 1.2, T(STEEL), 0, F, -0.8, { outline: 0.04 });
    k.solid(1.6, (F + 0.9) / 2, 0.6, 0, -0.8);
    k.box(0.9, 0.9, 0.9, T(0xffb347), -0.6, F + 1.35, -0.8, { outline: 0.03 });
    k.ball(0.35, G(0x2ee6ff), -0.6, F + 1.5, -0.33, { outline: 0 });
    for (let i = 0; i < 3; i++) k.ball(0.3, T([0xffb347, 0x8a8698, 0xa05a2a][i]), 0.6 + i * 0.5, F + 1.2, -0.8, { outline: 0.02 });
    if (!k.wreck) { pirate(k, -0.6, -2.2, 0, rr, s); const sp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), G(0xfff3b0)); sp.userData.blink = true; k.dyn(sp, -0.2, F + 1.4, -0.5); }
  });
  k.raidAt(19.4, 7.6, 0xffb347);
  // the foreman's hut and junk bots pottering
  within(k, -22, -22, 0.8, () => { scrapBox(k, 0, F, 0, Math.PI / 2, 0x4a6a5a, rr); k.box(1.4, 0.8, 0.1, G(s.glow), 1.2, F + 1.3, 1.27, { outline: 0 }); k.add(new THREE.BoxGeometry(7.2, 0.15, 3.6), T(RUST), 0, F + 2.9, 0.6, { rx: 0.15, outline: 0.04 }); });
  for (const [x, z, a] of [[4, 22, 0.4], [-14, 18, 2.2], [26, -2, 1.2], [-2, 24, 3.6]]) junkBot(k, x, z, a, rr);
  if (!k.wreck) for (const [x, z, a] of [[10, 18, 2.6], [-24, 14, 1.2], [6, -24, 0.4]]) pirate(k, x, z, a, rr, s);
  burnBarrel(k, -12, 24);
  for (const [x, z] of [[-30, -8], [28, 20], [-8, 30]]) lampPost(k, x, z, 7, s.glow);
  flagPole(k, -6.5, 37); flagPole(k, 6.5, 37);
}
// a little junk bot: a box body on two legs, a dome head with one glowing eye
function junkBot(k, x, z, yaw, rr) {
  within(k, x, z, yaw, () => {
    const col = [0xffb347, 0x8a8698, 0x7dd87a, 0xd9482b][Math.floor(rr() * 4)];
    for (const sd of [-1, 1]) k.box(0.2, 0.6, 0.25, T(DARK), sd * 0.3, F, 0, { outline: 0.02 });
    k.box(0.9, 0.8, 0.7, T(col), 0, F + 0.6, 0, { outline: 0.03 });
    k.add(new THREE.SphereGeometry(0.35, 8, 4, 0, TAU, 0, Math.PI / 2), T(0x8a8698), 0, F + 1.4, 0, { outline: 0.02 });
    k.ball(0.12, G(0x2ee6ff), 0, F + 1.55, 0.3, { outline: 0 });
    k.cyl(0.02, 0.02, 0.5, 4, T(DARK), 0.2, F + 1.6, 0, { outline: 0 });
  });
}

// =====================================================================================================================
// JUNK PILE B: the Junk Ring. A ring wall of crushed cars and boxes stacked three high, a lookout shack on stilts over the
// central heap, tyre stacks and a scrap-built gate arch, junk bots and a tinker's caravan.
// =====================================================================================================================
function junkB(k) {
  const s = style(k, 'rustmoon'), c = k.c, rr = k.rr;
  yard(k, 0x6f6878, 0x3a3540);
  // the ring wall: crushed-car blocks three high, staggered, gate gap at +z
  const WR = 34;
  for (let a = 0.26; a < TAU - 0.26; a += 2.6 / WR) {
    const [x, z] = polar(WR, a), rows = 2 + (rr() < 0.6 ? 1 : 0);
    for (let j = 0; j < rows; j++) k.box(2.5, 1.2, 1.6, T([0xd9482b, 0x2b59c3, 0x6a8f3a, 0x8a8698, 0xffb347, 0x5a5f6e][Math.floor(rr() * 6)]), x, F + j * 1.2, z, { ry: a + (rr() - 0.5) * 0.25, rz: (rr() - 0.5) * 0.06, outline: 0.04 });
    k.solid(1.3, (F + rows * 1.2) / 2, 0.85, x, z, a);
  }
  // the gate: two car stacks and a beam with a hanging skull sign
  for (const sd of [-1, 1]) { const [x, z] = polar(WR, sd * 0.2); for (let j = 0; j < 5; j++) k.box(2.4, 1.2, 1.8, T([0xd9482b, 0x8a8698, 0x2b59c3, 0x5a5f6e, 0xffb347][j]), x, F + j * 1.2, z, { ry: (rr() - 0.5) * 0.3, outline: 0.04 }); k.solid(1.3, (F + 6) / 2, 1, x, z); }
  k.box(15, 0.6, 0.6, T(RUST), 0, F + 6.0, polar(WR, 0.2)[1], { outline: 0.05 });
  // the central heap and the lookout on stilts over it
  const MX = 0, MZ = -4;
  if (!k.wreck) {
    junkHeap(k, MX, MZ, 12, 8, 90, k.mr);
    within(k, MX + 2, MZ - 1, 0, () => {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([sx * 2.6, F + 4, sz * 2.6], [sx * 1.8, F + 13, sz * 1.8], 0.15, T(RUST), { outline: 0.03 });
      for (const y of [8, 11]) k.add(new THREE.TorusGeometry(2.4 * Math.SQRT2 - (y - 8) * 0.25, 0.06, 3, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), T(DARK), 0, F + y, 0, { outline: 0 });
      k.box(5, 0.3, 5, T(0x5a3a2a), 0, F + 13, 0, { outline: 0.04 });
      k.box(4.2, 2.6, 4.2, T(0x4a6a5a), 0, F + 13.3, 0, { outline: 0.07 });
      for (let i = 0; i < 4; i++) within(k, 0, 0, (i / 4) * TAU, () => k.box(2.4, 0.9, 0.1, G(s.glow), 0, F + 14.6, 2.12, { outline: 0 }));
      k.add(new THREE.ConeGeometry(3.8, 1.6, 4).rotateY(Math.PI / 4), T(RUST), 0, F + 16.7, 0, { outline: 0.05 });
      k.flag(1.4, 1.4, 3, c, F + 17.3);
      k.solid(2.5, 2.0, 2.5, 0, 0, 0, F + 13);
      k.column(2.6, F + 17.5, 0, 0, F + 15.9);
      // a rope ladder (beams) down the heap
      for (let y = F + 5; y < F + 13; y += 0.6) k.box(0.9, 0.06, 0.06, T(WOOD), 0, y, 2.7 + (F + 13 - y) * 0.05, { outline: 0 });
      searchHead(k, 0, F + 17.5, 0);
    });
  } else {
    junkHeap(k, MX, MZ, 14, 4, 80, k.wr);
    within(k, MX + 2, MZ + 8, 0.4, () => { k.box(4.2, 2.6, 4.2, T(0x3a4a3a), 0, F + 1.3, 0, { rx: 0.6, rz: 0.4, outline: 0.07 }); k.solid(2.4, 1.8, 2.4, 0, 0); for (let i = 0; i < 4; i++) k.beam([i - 2, F + 0.3, -2], [i - 1, F + 0.6, 9], 0.15, T(RUST), { outline: 0.03 }); });
  }
  k.hit(8, 5, 8, MX, MZ);
  k.smoke = new THREE.Vector3(MX, 4, MZ);
  k.drop = new THREE.Vector3(-16, F, 16);
  // tyre stacks, scrap boxes and the tinker's caravan
  for (const [x, z, n] of [[-20, 4, 4], [-22, 7, 3], [-18.5, 7.5, 2], [22, -10, 4], [24, -7.5, 3]]) { for (let i = 0; i < n; i++) k.add(new THREE.TorusGeometry(0.75, 0.32, 6, 12).rotateX(Math.PI / 2), T(TYRE), x, F + 0.32 + i * 0.6, z, { outline: 0.03 }); k.column(1.05, F + n * 0.6 + 0.1, x, z); }
  scrapBox(k, -16, F, -20, 0.9, 0x4a6a5a, rr);
  scrapBox(k, 18, F, -20, -0.7, 0x7a3a2a, rr);
  within(k, 18, 14, -2.2, () => {
    // the caravan: a rounded body on four wheels, an awning, a counter of salvaged bits
    k.add(new THREE.CapsuleGeometry(1.5, 4.4, 4, 12).rotateX(Math.PI / 2).scale(1.1, 1.0, 1), T(0xffb347), 0, F + 2.2, 0, { outline: 0.07 });
    k.box(3.4, 0.4, 7, T(c), 0, F + 1.5, 0, { outline: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1.8, 1.8]) k.add(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12).rotateZ(Math.PI / 2), T(TYRE), sx * 1.6, F + 0.55, sz, { outline: 0.03 });
    k.box(0.1, 1.2, 3.0, G(0xffe6a8), 1.66, F + 1.8, 0, { outline: 0 });
    k.add(new THREE.BoxGeometry(2.6, 0.08, 4.2), T(0xff5c8a), 2.8, F + 3.1, 0, { rz: -0.3, outline: 0.03 });
    for (const sz of [-2, 2]) { k.box(0.1, 2.8, 0.1, T(DARK), 4.0, F, sz, { outline: 0 }); }
    k.box(1.0, 1.0, 3.6, T(WOOD), 2.6, F, 0, { outline: 0.03 });
    k.solid(1.7, (F + 3.7) / 2, 3.3, 0, 0);
    k.solid(0.5, (F + 1) / 2, 1.8, 2.6, 0);
    if (!k.wreck) pirate(k, 1.9, 0.5, Math.PI / 2, rr, s);
  });
  // the junk-bot pen (raid): a fenced corner with bots and a charging post
  within(k, -18, -8, 0.4, () => {
    for (let i = 0; i < 6; i++) { const [x, z] = polar(3.2, (i / 6) * TAU); k.box(0.12, 1.2, 0.12, T(DARK), x, F, z, { outline: 0 }); }
    k.add(new THREE.TorusGeometry(3.2, 0.05, 3, 6).rotateX(Math.PI / 2), T(c), 0, F + 1.1, 0, { outline: 0 });
    k.cyl(0.25, 0.3, 1.8, 8, T(STEEL), 0, F, 0, { outline: 0.03 });
    k.ball(0.3, G(0x2ee6ff), 0, F + 2.0, 0, { outline: 0 });
    k.column(0.3, F + 2.1, 0, 0);
    for (let i = 0; i < 3; i++) { const [x, z] = polar(1.8, (i / 3) * TAU + 0.5); junkBot(k, x, z, (i / 3) * TAU, rr); }
  });
  k.raidAt(-14, -5.5, 0xffb347);
  for (const [x, z, a] of [[8, 22, 0.4], [-8, 24, 2.2], [26, 6, 1.2]]) junkBot(k, x, z, a, rr);
  if (!k.wreck) for (const [x, z, a] of [[-6, 20, 2.6], [-5, 21, 0.2], [12, 6, 1.2], [-24, -2, 0.9]]) pirate(k, x, z, a, rr, s);
  burnBarrel(k, 6, 18);
  burnBarrel(k, -24, -16);
  const poles = [[-26, 14], [-12, 26], [12, 26], [26, 14]];
  for (const [x, z] of poles) { k.cyl(0.1, 0.13, 6, 6, T(DARK), x, F, z, { outline: 0.03 }); k.column(0.15, F + 6, x, z); }
  lightString(k, poles.map(([x, z]) => [x, F + 5.8, z]), [0x7dff3a, 0xff2e88, YEL]);
}
// a slow-turning salvaged searchlight
function searchHead(k, x, y, z) {
  const q = new Kit(k.c, 9, false);
  q.cyl(0.3, 0.4, 0.6, 8, T(DARK), 0, 0, 0, { outline: 0.02 });
  q.add(new THREE.CylinderGeometry(0.55, 0.42, 1.0, 10).rotateX(Math.PI / 2 - 0.3), T(0x8a8698), 0, 0.9, 0, { outline: 0.03 });
  q.add(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 10).rotateX(Math.PI / 2 - 0.3), G(0x7dff3a), 0, 0.75, 0.5, { outline: 0 });
  const g = q.finish().root;
  g.userData.spin = 0.3;
  k.dyn(g, x, y, z);
}

DRAFT_BUILD.junk = { a: junkA, b: junkB };




export { within, person, strollers, bench, tree, lampPost, flagPole, paint, paintStrip, ruin, style, STYLE, factionOf, polar, face, R, F };
