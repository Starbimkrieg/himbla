import * as THREE from 'three';
import { Kit, T, G, D, GLASS, sandbags, crate, tank, lightString, PALETTE, DRAFT_BUILD, GLB_HOOKS } from './outpostModels.js';
import { cargoStack, lattice, quonset } from './settlements.js';
import { STYLE, factionOf, WALK_LOOK, CARGO_OF, looted } from './outpostLooks.js';

// The seven small outposts as the game builds them (docs/outpost-proposals/README.md): the picked draft of each kind (its letter
// is the draft's, from the proposals: OUTPOST_PICK in outpostModels.js, which builds them; `?outpostDraft=off` brings back the
// old Kit builders). On a 40 m yard (FLAT_R 44), buildings to the townsfolk's scale (an adult 2.4 m): doors 3 m and up, storeys
// 4 to 5 m, most grown in place by a scaled frame (within, grow). Each keeps the template contract (cols, hits, raid, smoke,
// drop), has a wreck and two or three walking NPCs (walkers, outpostWalkers.js). Faction styling: the owner is read back from
// the faction colour (factionOf), and each faction has its own palette (STYLE). Checked by tools/outpost-audit.mjs.
const { STEEL, DARK, LIGHT, YEL, WOOD, RUST, TYRE, CHAR } = PALETTE;
const F = 0.3; // apron top
const R = 40; // yard radius
const TAU = Math.PI * 2;
const WARM = 0xfff6a8, GLASSC = 0x9be7ff;

// ---------- faction look ----------
const style = (k, fallback) => STYLE[factionOf(k.c, fallback)] || STYLE[fallback];

function walkers(k, fallback, routes, kind = 'person') {
  if (k.wreck) return; // (they've fled)
  k.walkers = { kind, look: WALK_LOOK[factionOf(k.c, fallback)] || WALK_LOOK[fallback], routes };
}

// ---------- frames ----------
const _M = new THREE.Matrix4();
// draw fn() in a frame at (x, z) turned by yaw, inside the current one (Kit.at replaces the frame; this nests). Colliders follow
// the frame's x, z and yaw; keep frames at ground level. sc scales everything drawn in it (and its colliders, text, moving parts:
// Kit.sc) about the apron's top, so a building stands on the apron at any size. Settlement helpers that call Kit.at (quonset,
// habDome, dishStation, cargoStack's standard boxes) stay outside scaled frames.
const _S = new THREE.Matrix4(), _T = new THREE.Matrix4();
function within(k, x, z, yaw, fn, sc = 1) {
  const sb = k.base.clone(), sy = k.yaw, ss = k.sc;
  if (sc === 1) k.base.multiply(_M.makeRotationY(yaw).setPosition(x, 0, z));
  else k.base.multiply(_M.makeRotationY(yaw).setPosition(x, F, z)).multiply(_S.makeScale(sc, sc, sc)).multiply(_T.makeTranslation(0, -F, 0));
  k.yaw += yaw;
  k.sc *= sc;
  fn();
  k.base.copy(sb);
  k.yaw = sy;
  k.sc = ss;
}
// draw fn() scaled by sc about the ground point (px, pz) (a whole building group grown in place)
const grow = (k, px, pz, sc, fn) => within(k, px, pz, 0, () => within(k, -px, -pz, 0, fn), sc);
const polar = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];

// ---------- yard furniture ----------
function tree(k, x, z, s = 1, leaf = 0x5fbf4a) {
  k.cyl(1.1 * s, 1.2 * s, 0.7, 12, T(0xd8d0c0), x, F, z, { outline: 0.04 });
  k.cyl(1.0 * s, 1.0 * s, 0.04, 12, T(0x4a3a2a), x, F + 0.7, z, { outline: 0 });
  k.cyl(0.14 * s, 0.2 * s, 2.6 * s, 6, T(WOOD), x, F + 0.7, z, { outline: 0.03 });
  k.add(new THREE.IcosahedronGeometry(1.5 * s, 0), T(leaf), x, F + 0.7 + 3.2 * s, z, { outline: 0.05 });
  k.add(new THREE.IcosahedronGeometry(1.0 * s, 0), T(0x4aa83a), x + 0.8 * s, F + 0.7 + 2.6 * s, z + 0.3 * s, { ry: 0.6, outline: 0.04 });
  k.column(1.2 * s, F + 0.7, x, z);
  k.sphere(1.35 * s, x, F + 0.7 + 3.2 * s, z); // (the canopy: you can land on a tree)
  k.sphere(0.9 * s, x + 0.8 * s, F + 0.7 + 2.6 * s, z + 0.3 * s);
}
// colliders for a square pyramid roof (a 4-sided cone turned 45°, its square edge-on to x and z: corner radius R at y0, apex h
// above): square boxes stepped up it, each as wide as the roof at its top, so none stands out past the slopes
function pyramidCols(k, x, z, y0, R, h, steps = 8) {
  for (let i = 0; i < steps; i++) { const b0 = (i / steps) * h * 0.94, top = ((i + 1) / steps) * h * 0.94, w = R * Math.SQRT1_2 * (1 - top / h); k.solid(w, (top - b0) / 2, w, x, z, 0, y0 + b0); }
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
    // a roof slab fallen in at a slant, one edge on the floor
    const sx = (rr() - 0.5) * w * 0.3, sz = (rr() - 0.5) * d * 0.3, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, rr(), -0.18));
    k.add(new THREE.BoxGeometry(w * 0.6, 0.35, d * 0.55), T(roof), sx, F + 1.1, sz, { q, outline: 0.06 });
    k.solidQ(w * 0.3, 0.18, d * 0.275, sx, F + 1.1, sz, q);
    debris(k, 0, 0, w * 0.4, d * 0.4, Math.round((w * d) / 14), rr);
    for (let i = 0; i < 5; i++) k.box(0.3, 0.12, 0.3, G(i % 2 ? 0xff7a1a : 0xffb347), (rr() - 0.5) * w * 0.7, F, (rr() - 0.5) * d * 0.7, { outline: 0 }); // (embers on the floor)
  });
}

// rubble: scatterDebris's broken slabs, each lying on the ground, with a collider on any big enough to stand on
function debris(k, cx, cz, hx, hz, n, rr, colors = [CHAR, 0x3a3540, 0x4a3f3a, 0x55505e]) {
  for (let i = 0; i < n; i++) {
    const w = 0.6 + rr() * 2.2, h = 0.3 + rr() * 1.1, d = 0.6 + rr() * 2, x = cx + (rr() * 2 - 1) * hx, z = cz + (rr() * 2 - 1) * hz;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rr() - 0.5) * 0.5, rr() * 3, (rr() - 0.5) * 0.5));
    k.add(new THREE.BoxGeometry(w, h, d), T(colors[i % colors.length]), x, F + h * 0.35, z, { q, outline: 0.04 }); // (sunk a little: tipped, an edge in the ground)
    k.solidQ(w / 2, h / 2, d / 2, x, F + h * 0.35, z, q);
  }
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

// a hover-cart (Meridian trade runabout) with a load of crates
function hoverCart(k, x, z, ry, s, rr) {
  within(k, x, z, ry, () => {
    k.box(2.6, 1.0, 4.8, T(YEL), 0, 0.8, 0, { outline: 0.06 });
    k.box(2.62, 0.24, 4.82, T(s.trim), 0, 1.3, 0, { outline: 0 });
    k.box(2.3, 0.7, 1.3, T(YEL), 0, 1.05, 2.6, { rx: 0.5, outline: 0.04 });
    k.box(1.6, 0.9, 1.0, T(DARK), 0, 1.8, 0.8, { outline: 0.03 });
    k.solid(0.8, 0.45, 0.5, 0, 0.8, 0, 1.8);
    k.solid(1.15, 0.4, 0.55, 0, 2.75, 0, 0.8); // (the sloped nose)
    k.box(1.9, 0.8, 0.08, GLASS(GLASSC, 0.5), 0, 1.9, 1.6, { rx: -0.4, outline: 0.02 });
    crate(k, -0.45, 1.8, -1.3, 1.0, 0x9a6a3a, 0.2);
    crate(k, 0.55, 1.8, -1.5, 0.85, 0x2b59c3, -0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl(0.5, 0.55, 0.28, 10, T(DARK), sx * 1.05, 0.5, sz * 1.75, { outline: 0.02 });
      k.cyl(0.45, 0.45, 0.05, 10, G(0x2ee6ff), sx * 1.05, 0.45, sz * 1.75, { outline: 0 });
    }
    k.solid(1.3, 0.75, 2.4, 0, 0, 0, 0.3); // (the body to its deck, 1.8 m)
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
  k.box(34, 0.12, 34, T(s.panel), 0, F, 0, { outline: 0.03 });
  const W = 13, H1 = 4.4, H2 = 4.0, HS = 1.45; // (the house is drawn at 1x and grown 1.45x: 19 m square, the clock 27 m up)
  grow(k, 0, 0, HS, () => {
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
    pyramidCols(k, 0, 0, Y3 + 4.2, 3.6, 3.0);
  } else {
    ruin(k, 0, 0, W - 2, W - 2, 6, 0, s.body, k.wr, { roof: s.roof });
    const wr = k.wr;
    for (let i = 0; i < 4; i++) within(k, 0, 0, (i / 4) * TAU, () => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0, 0.1 * (wr() - 0.5))), x = wr() * 2 - 1; k.add(new THREE.BoxGeometry(W + 2, 0.35, 3.6), T(s.roof), x, F + 0.8, (W - 3) / 2 + 2.6, { q, outline: 0.06 }); k.solidQ((W + 2) / 2, 0.18, 1.8, x, F + 0.8, (W - 3) / 2 + 2.6, q); }); // (each canopy down, one edge on the paving)
    { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0, 0.4)); k.add(new THREE.BoxGeometry(4.4, 4.2, 4.4), T(s.body), 7, F + 2.3, -6, { q, outline: 0.06 }); k.solidQ(2.2, 2.1, 2.2, 7, F + 2.3, -6, q); } // (the clock lantern, fallen)
    debris(k, 0, 0, 12, 12, 26, wr);
  }
  k.hit(W / 2, 3, W / 2, 0, 0);
  });
  k.smoke = new THREE.Vector3(0, 4, 0);
  k.drop = new THREE.Vector3(0, F, 20);
  // corner cafés: an open pavilion with a pyramid roof over tables, planters at its corners
  for (const [qx, qz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = qx * 20, cz = qz * 20;
    if (qx > 0 && qz < 0) { // the back-right corner is the stock yard
      cargoStack(k, cx + 3, cz - 2, 2, ['meridian'], Math.PI / 2, F);
      cargoStack(k, cx - 6, cz - 4, 1, ['meridian'], Math.PI / 2 + 0.1, F);
      cargoStack(k, cx + 3, cz + 7, 1, ['meridian'], 0.3, F);
      continue;
    }
    grow(k, cx, cz, 1.25, () => { // (each café grown 1.25x: 11.5 m square, 4.5 m to the eaves)
    const P = 4.6, PH = 3.6;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { k.cyl(0.2, 0.24, PH, 8, T(s.body), cx + sx * P, F, cz + sz * P, { outline: 0.03 }); k.column(0.24, F + PH, cx + sx * P, cz + sz * P); }
    k.box(P * 2 + 1, 0.3, P * 2 + 1, T(s.body), cx, F + PH, cz, { outline: 0.05 });
    k.add(new THREE.ConeGeometry(P * 1.62, 2.4, 4).rotateY(Math.PI / 4), T(qx * qz > 0 ? c : 0xff5c8a), cx, F + PH + 0.3 + 1.2, cz, { outline: 0.06 });
    k.solid(P + 0.5, 0.15, P + 0.5, cx, cz, 0, F + PH);
    pyramidCols(k, cx, cz, F + PH + 0.3, P * 1.62, 2.4);
    for (const [tx, tz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
      k.cyl(0.6, 0.6, 0.06, 14, T(LIGHT), cx + tx, F + 0.72, cz + tz, { outline: 0.02 });
      k.cyl(0.08, 0.08, 0.72, 6, T(DARK), cx + tx, F, cz + tz, { outline: 0 });
      k.column(0.6, F + 0.78, cx + tx, cz + tz);
      for (let j = 0; j < 2; j++) { const a = j * Math.PI + 0.4, sx = cx + tx + Math.sin(a) * 1.0, sz = cz + tz + Math.cos(a) * 1.0; k.cyl(0.22, 0.2, 0.46, 8, T(DARK), sx, F, sz, { outline: 0.02 });  }
    }
    for (const [sx, sz] of [[qx, -qz], [-qx, qz]]) tree(k, cx + sx * (P + 2.4), cz + sz * (P + 2.4), 0.95); // (out by the lanes and the rim, clear of the walk round the house)
    });
  }
  // stall rows along the lanes: small awning stalls facing the lane, two each side
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    for (const sd of [-1, 1]) for (const r2 of [27, 34]) {
      if (i === 1 && sd < 0) continue; // (keeps the stock yard's corner open)
      within(k, 0, 0, a, () => stall(k, sd * 7.6, r2, sd > 0 ? -Math.PI / 2 : Math.PI / 2, [c, 0xff5c8a, YEL, 0x7dff3a][(i + (r2 > 30 ? 1 : 0)) % 4], rr));
    }
  }
  // lamps along the lanes, past the canopies
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) within(k, 0, 0, (i / 4) * TAU, () => lampPost(k, sd * 5.3, 19.5, 5.5, s.glow));
  mysteryCrates(k, 18, -17.5, -0.6);
  k.raidAt(15.6, -15.4, 0xff2e88);
  flagPole(k, -6.5, 37.4); flagPole(k, 6.5, 37.4);
  hoverCart(k, 24, 30, 2.5, s, rr);
  // three traders: round the house under its canopies and out along the lanes
  walkers(k, 'meridian', [
    [[0, 36], [0, 11.5], [11.5, 11.5], [11.5, -11.5], [-11.5, -11.5], [-11.5, 11.5], [-1, 11.5]],
    [[-35, 0], [-11.5, 0], [-11.5, -11.5], [11.5, -11.5], [11.5, 0], [35, 0]],
    [[0, -35], [0, -11.5], [-11.5, -11.5], [-11.5, 11.5], [-2, 22]],
  ]);
}
// a market stall facing local +z: counter, posts, striped awning, goods, a stallholder
function stall(k, x, z, ry, awn, rr, sc = 1.3) {
  within(k, x, z, ry, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, 2.9, 0.14, T(WOOD), sx * 1.9, F, sz * 1.2, { outline: 0.02 });
    k.box(3.8, 1.0, 1.2, T(WOOD), 0, F, 0.5, { outline: 0.04 });
    k.box(3.82, 0.4, 0.05, T(awn), 0, F + 0.5, 1.11, { outline: 0 });
    for (let i = 0; i < 5; i++) k.box(0.78, 0.08, 2.9, T(i % 2 ? 0xffffff : awn), -1.6 + i * 0.8, F + 3.05, 0.4, { rx: 0.28, outline: 0.02 });
    k.solidQ(1.95, 0.06, 1.45, 0, F + 3.09, 0.4, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28, 0, 0))); // (the awning, as one slab)
    // goods sitting on the counter top (1.0 m)
    for (let j = 0; j < 6; j++) { const r0 = 0.17 + rr() * 0.1, ball = j % 3; k.add(ball ? new THREE.SphereGeometry(r0, 6, 4) : new THREE.BoxGeometry(0.36, 0.3, 0.36), T([0xff4f2e, YEL, 0x7dff3a, 0xff7ad9, 0xff9f1c, 0x2ec4ff][Math.floor(rr() * 6)]), -1.4 + j * 0.56, F + 1.0 + (ball ? r0 * 0.85 : 0.15), 0.5 + (rr() - 0.5) * 0.5, { outline: 0.02 }); }
    crate(k, 2.6, F, -0.6, 1.0, 0x9a6a3a, 0.3);
    k.solid(1.9, (F + 1.0) / 2, 0.6, 0, 0.5);
  }, sc);
}

// ---------- faction marks and shared military pieces ----------
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
    k.solid(0.25, (F + 1.1) / 2, 0.25, bx - 1.6, 0.4);
    for (let i = 0; i < 8; i++) k.box(gateW / 8, 0.16, 0.16, T(i % 2 ? 0xffffff : 0xff3b5c), bx - 1.6 - (i + 0.5) * (gateW / 8), F + 1.0, 0.4, { outline: i === 0 ? 0.02 : 0 });
    k.box(0.3, 0.9, 0.3, T(s.dark), -gateW / 2 + 0.3, F, 0.4, { outline: 0.02 });
  });
}
// A sandbagged gun pit: three courses of bags round a heavy machine gun on a tripod pedestal. The gun is put together from the
// pedestal up, each part meeting the one it hangs on: tripod legs into a collar on the post, a yoke on the post's head, the
// receiver between the yoke's cheeks on a trunnion pin, the barrel out of the receiver's front through a cooling jacket to a
// muzzle brake, spade grips and a seat at the back, the ammunition box on the feed side, a shield on two arms from the yoke.
// face0: where it points (from +z, turning to +x).
function gunPit(k, x, z, s, rr, face0 = 0) {
  sandbags(k, x, z, 2.7, face0 - Math.PI + 0.7, face0 + Math.PI - 0.7, 3); // (the way in at the back; the gun fires over the bags)
  const GUN = T(0x3a3f4a), MET = T(0x6a7088), Dk = T(DARK);
  within(k, x, z, face0, () => {
    const PH = F + 1.55, Y = PH + 0.32; // pedestal head; the bore line (clear over the top bags, 1.75 m)
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI; k.beam([Math.sin(a) * 0.85, F, Math.cos(a) * 0.85], [0, F + 0.75, 0], 0.05, Dk, { outline: 0.015 }); k.cyl(0.1, 0.1, 0.04, 8, Dk, Math.sin(a) * 0.85, F, Math.cos(a) * 0.85, { outline: 0 }); }
    k.cyl(0.07, 0.08, PH - F, 8, MET, 0, F, 0, { outline: 0.02 });
    k.cyl(0.12, 0.12, 0.12, 10, Dk, 0, F + 0.7, 0, { outline: 0.01 });
    k.cyl(0.16, 0.13, 0.08, 10, Dk, 0, PH, 0, { outline: 0.01 }); // traverse ring
    k.box(0.36, 0.06, 0.22, GUN, 0, PH + 0.08, 0, { outline: 0.01 }); // yoke base
    for (const sd of [-1, 1]) k.box(0.05, 0.3, 0.2, GUN, sd * 0.155, PH + 0.08, 0, { outline: 0.01 }); // cheeks
    k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 6).rotateZ(Math.PI / 2), MET, 0, Y, 0, { outline: 0 }); // trunnion pin
    k.box(0.24, 0.24, 1.1, GUN, 0, Y - 0.12, -0.1, { outline: 0.02 }); // receiver
    k.box(0.2, 0.06, 0.8, Dk, 0, Y + 0.12, -0.1, { outline: 0 }); // top cover
    k.box(0.06, 0.1, 0.16, Dk, 0, Y + 0.18, 0.2, { outline: 0 }); // rear sight
    k.beam([0, Y, 0.45], [0, Y, 1.25], 0.075, MET, { outline: 0.015, seg: 8 }); // cooling jacket
    for (let t = 0.6; t < 1.25; t += 0.16) k.add(new THREE.TorusGeometry(0.078, 0.012, 3, 10), Dk, 0, Y, t, { outline: 0 });
    k.beam([0, Y, 1.25], [0, Y, 1.95], 0.035, GUN, { outline: 0.012, seg: 6 }); // barrel
    k.beam([0, Y, 1.95], [0, Y, 2.12], 0.055, Dk, { outline: 0.012, seg: 8 }); // muzzle brake
    k.box(0.04, 0.08, 0.04, Dk, 0, Y + 0.02, 1.85, { outline: 0 }); // front sight, on the barrel
    for (const sd of [-1, 1]) k.beam([sd * 0.08, Y - 0.08, -0.65], [sd * 0.14, Y - 0.08, -0.88], 0.025, Dk, { outline: 0.01 }); // spade grips
    k.beam([-0.14, Y - 0.08, -0.88], [0.14, Y - 0.08, -0.88], 0.025, Dk, { outline: 0.01 });
    k.box(0.32, 0.26, 0.22, T(0x5a6a48), -0.31, Y - 0.2, 0.0, { outline: 0.015 }); // ammunition box on the feed side
    k.box(0.12, 0.04, 0.2, T(0xc9a227), -0.17, Y - 0.04, 0.0, { rz: 0.5, outline: 0 }); // the belt into the feed
    // the shield: a plate with a notch for the barrel, on two arms from the yoke
    for (const sd of [-1, 1]) k.box(0.42, 0.75, 0.05, T(s.panel), sd * 0.33, PH - 0.2, 0.62, { outline: 0.015 });
    k.box(1.08, 0.2, 0.05, T(s.panel), 0, PH + 0.55, 0.62, { outline: 0.015 });
    for (const sd of [-1, 1]) k.beam([sd * 0.155, PH + 0.18, 0.1], [sd * 0.3, PH + 0.18, 0.6], 0.025, Dk, { outline: 0.01 });
    // a step for the gunner behind (the bore is chest high from it)
    k.box(0.9, 0.35, 0.6, T(0x8a8698), 0, F, -1.1, { outline: 0.02 });
    k.column(0.2, Y + 0.2, 0, 0);
  });
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
  // the tower: 39 m of lattice in 15 bays of 2.6 m, a switchback stair up its middle, a gallery halfway, the hexagonal cab
  const TX = -19, TZ = -6, H = 39, W0 = 5.4, W1 = 3.2, BAYS = 15, BAY = H / BAYS;
  const hw = (y) => W0 + (W1 - W0) * (y / H);
  const legM = T(s.metal);
  if (!k.wreck) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { k.box(2.4, 0.9, 2.4, T(s.conc), TX + sx * W0, 0, TZ + sz * W0, { outline: 0.04 }); k.box(1.0, 0.25, 1.0, T(s.dark), TX + sx * W0, 0.9, TZ + sz * W0, { outline: 0.02 }); k.solid(1.2, 0.575, 1.2, TX + sx * W0, TZ + sz * W0); }
    lattice(k, TX, TZ, H, W0, W1, BAYS, legM, T(s.dark), { r: 0.3 });
    k.cols.splice(-2); // (lattice's two stepped cylinders left a ledge in the air halfway up: a box a bay instead, following the taper)
    for (let i = 0; i < BAYS; i++) { const w = hw(i * BAY) + 0.3; k.solidQ(w, BAY / 2, w, TX, i * BAY + BAY / 2, TZ, new THREE.Quaternion(), { lattice: true }); } // (marked: an open truss's top is its braces, tools/outpost-audit.mjs)
    // The stair: flights of 13 risers (0.2 m) and 3 m going, one a bay, running +x then -x in two lanes (z -0.65, +0.65),
    // landings at each end level with the tower's horizontal braces and tied to them. Drawn, not walked (no colliders: the
    // tower is one solid core to the runner).
    const RUN = 3.0, LW = 1.1, Dk = T(s.dark), TREAD = T(0x55607a), RAIL = T(s.trim);
    for (let i = 0; i < BAYS; i++) {
      const y0 = i * BAY, y1 = y0 + BAY, dir = i % 2 ? -1 : 1, lz = i % 2 ? 0.65 : -0.65;
      const x0 = -dir * RUN / 2, x1 = dir * RUN / 2, n = 13;
      within(k, TX, TZ, 0, () => {
        for (const e of [-1, 1]) k.beam([x0, y0 + (i ? 0.08 : F), lz + e * LW / 2], [x1, y1, lz + e * LW / 2], 0.06, Dk, { outline: 0.012, seg: 4 }); // stringers
        const ys = y0 + (i ? 0.08 : F); // (where the stringers start: the first flight's on the apron)
        for (let j = 1; j <= n - 1; j++) { const t = j / n; k.box(RUN / n + 0.04, 0.05, LW, TREAD, x0 + (x1 - x0) * t, ys + (y1 - ys) * t - 0.02, lz, { outline: 0 }); }
        const oz = lz + Math.sign(lz) * LW / 2; // the outer side's handrail on three posts
        for (const t of [0, 0.5, 1]) { const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t; k.beam([px, py, oz], [px, py + 1.0, oz], 0.025, Dk, { outline: 0 }); }
        k.beam([x0, y0 + 1.0, oz], [x1, y1 + 1.0, oz], 0.03, RAIL, { outline: 0 });
        // the landing at the top of this flight, both lanes wide, tied to the brace on that face
        const lx = dir * (RUN / 2 + 0.6), w = hw(y1);
        k.box(1.2, 0.08, LW * 2 + 0.2, TREAD, lx, y1 - 0.08, 0, { outline: 0.012 });
        for (const e of [-1, 1]) k.beam([lx + dir * 0.6, y1 - 0.06, e * LW], [dir * w, y1 - 0.06, e * LW], 0.04, Dk, { outline: 0 });
        k.beam([lx + dir * 0.6, y1 + 1.0, -LW], [lx + dir * 0.6, y1 + 1.0, LW], 0.03, RAIL, { outline: 0 });
        for (const e of [-1, 1]) k.beam([lx + dir * 0.6, y1, e * LW], [lx + dir * 0.6, y1 + 1.0, e * LW], 0.025, Dk, { outline: 0 });
      });
    }
    // the gallery halfway up (a grating ring round the tower at a brace level, railed in the faction colour)
    const GY = 7 * BAY, gw = hw(GY);
    k.box(gw * 2 + 2.2, 0.15, gw * 2 + 2.2, T(s.dark), TX, GY - 0.15, TZ, { outline: 0.03 });
    for (const sd of [-1, 1]) { k.box(gw * 2 + 2.2, 0.06, 0.06, T(c), TX, GY + 1.05, TZ + sd * (gw + 1.08), { outline: 0 }); k.box(0.06, 0.06, gw * 2 + 2.2, T(c), TX + sd * (gw + 1.08), GY + 1.05, TZ, { outline: 0 }); }
    for (let t = -1; t <= 1; t += 0.25) for (const sd of [-1, 1]) { k.box(0.05, 1.05, 0.05, T(s.dark), TX + t * (gw + 1.08), GY, TZ + sd * (gw + 1.08), { outline: 0 }); k.box(0.05, 1.05, 0.05, T(s.dark), TX + sd * (gw + 1.08), GY, TZ + t * (gw + 1.08), { outline: 0 }); }
    k.solid(gw + 1.1, 0.08, gw + 1.1, TX, TZ, 0, GY - 0.15);
    // the cab, 1.3x: a hexagonal deck on the tower head, glazed walls leaning out, a steel roof, the antenna crown
    within(k, TX, TZ, 0, () => {
      const Y = F + (H - F) / 1.3;
      k.add(new THREE.CylinderGeometry(6, 6, 0.5, 6), T(s.dark), 0, Y + 0.25, 0, { outline: 0.06 });
      k.add(new THREE.CylinderGeometry(4.4, 4.4, 1.1, 6), T(s.body), 0, Y + 1.05, 0, { outline: 0.05 });
      k.add(new THREE.CylinderGeometry(4.8, 4.3, 2.4, 6, 1, true), GLASS(GLASSC, 0.45), 0, Y + 2.8, 0, { outline: 0.03 });
      k.add(new THREE.CylinderGeometry(4.6, 4.1, 2.3, 6), G(s.glow), 0, Y + 2.8, 0, { outline: 0 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.beam([Math.sin(a) * 4.4, Y + 1.6, Math.cos(a) * 4.4], [Math.sin(a) * 4.85, Y + 4.0, Math.cos(a) * 4.85], 0.1, T(s.dark), { outline: 0.02, seg: 4 }); }
      k.add(new THREE.CylinderGeometry(3.0, 6.0, 1.6, 6), T(s.roof), 0, Y + 4.8, 0, { outline: 0.08 });
      k.add(new THREE.CylinderGeometry(6.05, 6.05, 0.2, 6), T(c), 0, Y + 4.1, 0, { outline: 0 });
      // the gallery rail round the deck: posts and a top rail on the hexagon's edge
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6, b2 = a + TAU / 6, R6 = 5.75; const p = [Math.sin(a) * R6, Math.cos(a) * R6], q = [Math.sin(b2) * R6, Math.cos(b2) * R6]; k.beam([p[0], Y + 1.5, p[1]], [q[0], Y + 1.5, q[1]], 0.05, T(s.trim), { outline: 0 }); k.beam([p[0], Y + 0.5, p[1]], [p[0], Y + 1.5, p[1]], 0.04, T(s.dark), { outline: 0 }); }
      k.column(6, Y + 0.5, 0, 0, Y);
      k.column(4.6, Y + 4.0, 0, 0, Y + 0.5);
      k.column(5.2, Y + 5.0, 0, 0, Y + 4.0);
      k.column(3.0, Y + 5.6, 0, 0, Y + 5.0);
      k.cyl(0.08, 0.12, 6, 5, T(LIGHT), 0, Y + 5.6, 0, { outline: 0.02 });
      k.blinker(0, Y + 11.8, 0, 0xff2a4a, 0.4);
      k.box(0.3, 2.2, 0.15, T(LIGHT), 1.4, Y + 5.6, 0, { outline: 0.02 });
      // the searchlight rides round the gallery
      const sl = new THREE.Group();
      const head = new THREE.Group(); head.position.y = 0.9; head.rotation.x = 0.42; sl.add(head);
      sl.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.8, 8), T(s.dark)));
      head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 1.4, 12).rotateX(Math.PI / 2), T(LIGHT)));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 12).rotateX(Math.PI / 2), G(0xfffbe0)); lens.position.z = 0.72; head.add(lens);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 48, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 24.7), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.renderOrder = 3; head.add(cone);
      const arm = new THREE.Group(); arm.add(sl); sl.position.set(0, 0, 5.2);
      arm.userData.spin = 0.35;
      k.dyn(arm, 0, Y + 0.5, 0);
    }, 1.3);
  } else {
    const wr = k.wr;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { k.box(2.4, 0.9, 2.4, T(s.conc), TX + sx * W0, 0, TZ + sz * W0, { outline: 0.04 }); k.solid(1.2, 0.45, 1.2, TX + sx * W0, TZ + sz * W0); const h = 2 + wr() * 6; k.beam([TX + sx * W0, 0.8, TZ + sz * W0], [TX + sx * (W0 - 0.3), h, TZ + sz * (W0 - 0.3)], 0.3, T(0x3e4352), { outline: 0.05, seg: 6 }); k.column(0.3, h, TX + sx * W0, TZ + sz * W0); }
    within(k, TX, TZ, 0.5, () => {
      for (const sx of [-1, 1]) for (const y of [1.0, 5.0]) k.beam([sx * 4.6, y, 3], [sx * 2.8, y * 0.4 + 0.6, 30], 0.3, T(0x3e4352), { outline: 0.05, seg: 6 });
      for (let i = 0; i < 10; i++) { const z = 4 + i * 2.6; k.beam([-4.4 + i * 0.16, 0.9, z], [4.4 - i * 0.16, 4.0, z + 2.6], 0.12, T(DARK)); }
      const cq = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0, 0.4));
      k.add(new THREE.CylinderGeometry(6.2, 5.6, 3.1, 6), T(s.roof), 0, F + 4.2, 33, { q: cq, outline: 0.08 }); // (the cab, on its side at the end)
      k.solidQ(4.4, 2.6, 13.5, 0, 2.6, 16.5, new THREE.Quaternion(), { lattice: true }); // (the fallen truss)
      k.solidQ(5.2, 1.55, 5.2, 0, F + 4.2, 33, cq);
    });
    debris(k, TX, TZ, 6, 6, 14, wr);
  }
  k.hit(W0, H / 2, W0, TX, TZ);
  k.smoke = new THREE.Vector3(TX, 3, TZ);
  k.drop = new THREE.Vector3(-4, F, 16);
  // the barracks: a 30 m Quonset (8.2 m radius) along x, windows set into its shell, a porch and the mark on the door end
  const QX = 6, QZ = -20, QR = 8.2, QL = 30;
  if (!k.wreck) {
    quonset(k, QX, QZ, QR, QL, s.hut, Math.PI / 2, c);
    within(k, QX, QZ, Math.PI / 2, () => {
      const wa = 1.0; // windows a radian down from the crown each side, their frames on the shell
      for (const sd of [-1, 1]) for (let t = -QL / 2 + 3.5; t <= QL / 2 - 3; t += 4) {
        const th = sd > 0 ? Math.PI / 2 - wa : Math.PI / 2 + wa, wx = sd * (QR + 0.02) * Math.sin(wa), wy = 0.4 + (QR + 0.02) * Math.cos(wa);
        k.add(new THREE.BoxGeometry(0.1, 1.0, 1.7), G(s.glow), wx, wy, t, { rz: th, outline: 0 });
        k.add(new THREE.BoxGeometry(0.14, 1.2, 1.9), T(s.dark), wx - sd * 0.03 * Math.sin(wa), wy - 0.03 * Math.cos(wa), t, { rz: th, outline: 0.01 });
      }
      k.box(7, 0.3, 3.4, T(s.roof), 0, F + 3.6, QL / 2 + 1.7, { outline: 0.04 });
      for (const sd of [-1, 1]) { k.cyl(0.14, 0.14, 3.6, 6, T(s.dark), sd * 3.2, F, QL / 2 + 3.2, { outline: 0.02 }); k.column(0.16, F + 3.6, sd * 3.2, QL / 2 + 3.2); }
      k.solid(3.5, 0.15, 1.7, 0, QL / 2 + 1.7, 0, F + 3.6);
      emblem(k, 0, F + 6.8, QL / 2 + 0.03, 0, 2.0, 'spacecom');
    });
  } else {
    ruin(k, QX, QZ, QL, QR * 2, 5, 0, 0x4f5a42, k.wr); // (its length along x, where the barracks stood)
    for (let i = 0; i < 7; i++) k.add(new THREE.TorusGeometry(QR, 0.18, 4, 16, Math.PI * (0.3 + k.wr() * 0.5)), T(0x3a3f30), QX - 12 + i * 4, 0.3, QZ, { ry: Math.PI / 2, outline: 0.03 }); // (ribs still standing from the pad)
  }
  k.hit(QL / 2, QR / 2, QR, QX, QZ);
  // the motor pool: a second Quonset with its door to the yard, a patrol rover out front
  quonset(k, 24, 10, 6, 16, 0x55607a, 0, c);
  rover(k, 24, 21.5, 0.1, s);
  // the helipad
  const HPX = -18, HPZ = 16;
  k.cyl(7.5, 7.8, 0.1, 32, T(0x5a566a), HPX, F, HPZ, { outline: 0.04 });
  paintAt(k, HPX, HPZ, 6.6, 0.15, s.trim, 0.1);
  for (const sx of [-1, 1]) k.box(0.7, 0.006, 4.2, T(s.trim), HPX + sx * 1.3, F + 0.1, HPZ, { outline: 0 });
  k.box(2.0, 0.006, 0.7, T(s.trim), HPX, F + 0.1, HPZ, { outline: 0 });
  for (let i = 0; i < 8; i++) { const [x, z] = polar(7.3, (i / 8) * TAU); k.box(0.3, 0.02, 0.3, G(s.trim), HPX + x, F + 0.1, HPZ + z, { outline: 0 }); }
  // the lens locker at the barracks porch: the raid spot
  const PX = QX + QL / 2 + 4.5;
  within(k, PX, QZ - 3.4, Math.PI / 2, () => { k.box(1.6, 2.1, 0.9, T(s.panel), 0, F, 0, { outline: 0.05 }); k.box(1.62, 0.25, 0.92, T(c), 0, F + 1.6, 0, { outline: 0 }); k.solid(0.8, (F + 2.1) / 2, 0.45, 0, 0); crate(k, 1.6, F, 0.3, 1.0, 0x6f7a5a, 0.2); });
  k.raidAt(PX + 1.2, QZ + 0.5, 0xffd23f);
  gunPit(k, 4, 24, s, rr, 0);
  gunPit(k, -31, -12, s, rr, -1.3);
  cargoStack(k, -1, -33.2, 2, cargoFor(k, 'spacecom'), Math.PI / 2, F);
  cargoStack(k, -10, -33.2, 1, cargoFor(k, 'spacecom'), Math.PI / 2, F);
  for (const [x, z] of [[31, -8], [-28, 26], [8, 4]]) lampPost(k, x, z, 7, s.glow);
  flagPole(k, -10, 36); flagPole(k, 10, 36);
  // three troopers (each walks its route there and back): along the fence from the gate round the back, between the barracks
  // door and the motor pool, from the gate past the pad
  walkers(k, 'spacecom', [
    [[-6, 32], [-25, 26], [-33, 4], [-27, -4], [-26, -22], [-15, -29.7], [13, -29.7]],
    [[PX + 1.5, QZ + 4], [PX + 1.5, -1.5], [15, -1.5], [15, 4], [10, 0]],
    [[-3, 30], [-7, 18], [-9, 4], [2, 6], [0, 18]],
  ]);
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
    k.solid(1.5, 1.1, 2.9, 0, 0); // (the body to its roof, 2.2 m, and the cab on it)
    k.solid(1.3, 0.5, 1.0, 0, 0.8, 0, 2.2);
  });
}

// a tank farm: horizontal or vertical tanks inside a low bund wall with a gap at the front
function bund(k, x, z, w, d, ry, s) {
  within(k, x, z, ry, () => {
    for (const [len, px, pz, rot] of [[w, 0, -d / 2, 0], [d, -w / 2, 0, 1], [d, w / 2, 0, 1], [w / 2 - 1.5, -w / 4 - 0.75, d / 2, 0], [w / 2 - 1.5, w / 4 + 0.75, d / 2, 0]]) {
      k.box(rot ? 0.5 : len, 1.0, rot ? len : 0.5, T(s.conc), px, F, pz, { outline: 0.04 });
      k.solid(rot ? 0.25 : len / 2, (F + 1) / 2, rot ? len / 2 : 0.25, px, pz);
    }
    for (let i = 0; i < 9; i++) { const x = -w / 2 + 1 + i * (w - 2) / 8; if (Math.abs(x) > 1.6) k.box(0.4, 0.02, 0.5, T(YEL), x, F + 1.0, d / 2, { outline: 0 }); } // (on the wall tops, not over the gap)
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
  // the silo complex, the weighbridge and the hauler drawn at 1x and grown 1.3x about (-3, -12): silos 11 m across and 24 m to
  // the hoppers' caps
  grow(k, -3, -12, 1.3, () => {
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
      for (let j = 0; j < 4; j++) k.column((SR + 0.2) * (1 - ((j + 1) * 0.55) / 2.4), F + SH + (j + 1) * 0.55, x, z, F + SH + j * 0.55); // (the roof cone, stepped)
      k.column(0.6, F + SH + 3.0, x, z, F + SH + 2.2); // (the vent cap)
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
    k.solidQ(0.6, 0.6, 4.2, -3, F + 5.35, -12, new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(2.3, 8), 0, 0))); // (the chute)
    k.solid(1.5, 1.2, 1.5, -3, -7.5, 0, F + 5.4); // (its hopper; the hauler drives under it)
    emblem(k, -3, F + 11, -20 + SR, 0, 2.2, 'spacecom');
  } else {
    const wr = k.wr;
    for (const [x, z] of SIL) {
      const h = 3 + wr() * 6;
      k.cyl(SR + 0.6, SR + 0.8, 0.6, 24, T(s.conc), x, 0, z, { outline: 0.04 });
      k.cyl(SR, SR, h, 24, T(wr() < 0.5 ? CHAR : s.body), x, F, z, { outline: 0.1 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + wr(), sh = 2 + wr() * 3, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3 * (wr() - 0.5), a + Math.PI / 2, 0)), px = x + Math.sin(a) * (SR - 0.3), pz = z + Math.cos(a) * (SR - 0.3); k.add(new THREE.BoxGeometry(2, sh, 0.2), T(s.body), px, F + h + sh / 2 - 0.1, pz, { q, outline: 0.04 }); k.solidQ(1, sh / 2, 0.15, px, F + h + sh / 2 - 0.1, pz, q); } // (torn wall standing up off the stub)
      k.column(SR, F + h, x, z);
    }
    within(k, 6, -14, 0.9, () => { k.add(new THREE.CylinderGeometry(SR, SR, 11, 24).rotateX(Math.PI / 2), T(s.body), 0, F + SR - 0.3, 9, { outline: 0.1 }); // (a silo down on its side)
      k.add(new THREE.ConeGeometry(SR + 0.2, 2.4, 24).rotateX(Math.PI / 2), T(s.roof), 0, F + SR - 0.3, 15.7, { outline: 0.08 }); k.hcyl(SR, 11, 0, 9, 0, F + SR - 0.3); k.hcyl(SR * 0.6, 2.4, 0, 15.7, 0, F + SR - 0.3); });
    debris(k, -3, -14, 12, 6, 20, wr);
  }
  for (const [x, z] of SIL) k.hit(SR, SH / 2, SR, x, z);
  });
  k.smoke = new THREE.Vector3(-3, 3, -18);
  k.drop = new THREE.Vector3(-12, F, 16);
  // the store: a long Quonset on the right, doors to the yard
  quonset(k, 25, 2, 7.6, 26, s.panel, 0, c);
  k.hit(8, 3.8, 13, 25, 2);
  // the container wall along the back and left
  for (let i = 0; i < 7; i++) { const a = Math.PI + 0.9 - i * 0.3; const [x, z] = polar(33, a); cargoStack(k, x, z, 1 + (i % 3 === 1 ? 1 : 0), cargoFor(k, 'spacecom'), a + Math.PI / 2, F); }
  // the weighbridge and the truck under the chute
  k.box(5, 0.12, 12, T(0x55607a), -3, F, -4, { outline: 0.03 });
  for (let i = 0; i < 6; i++) k.box(5, 0.006, 0.3, T(YEL), -3, F + 0.12, -9.5 + i * 2.2, { outline: 0 });
  hauler(k, -3, -5, 0, s);
  // weigh house and the wiring rack (raid)
  within(k, -12, 6, Math.PI / 2, () => {
    k.box(4, 3.0, 3.4, T(s.body), 0, F, 0, { outline: 0.07 });
    k.box(2.6, 1.1, 0.1, G(s.glow), 0, F + 1.4, 1.71, { outline: 0 });
    k.box(4.4, 0.35, 3.8, T(s.roof), 0, F + 3.0, 0, { outline: 0.04 });
    k.solid(2, (F + 3.35) / 2, 1.7, 0, 0);
  }, 1.35);
  within(k, -16, 12, 0.6, () => {
    k.box(3.2, 2.4, 0.9, T(s.dark), 0, F, 0, { outline: 0.05 });
    for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(0.35, 0.12, 6, 12), T([0xff4f2e, YEL, 0x2ec4ff, 0x7dff3a][i]), -1.1 + i * 0.75, F + 1.6, 0.5, { outline: 0.02 });
    k.solid(1.6, (F + 2.4) / 2, 0.45, 0, 0);
  }, 1.3);
  k.raidAt(-14.2, 14.8, 0xffd23f);
  bund(k, -25, 22, 12, 10, 0, s);
  tank(k, -28, 21, 2.6, 5.5, s.body, c);
  tank(k, -22, 21, 2.6, 5.5, s.body, c);
  for (const [x, z] of [[-31, 8], [12, 14], [33, -16], [-10, 31]]) lampPost(k, x, z, 8, s.glow);
  flagPole(k, -8, 37); flagPole(k, 8, 37);
  // three loaders: gate to the weigh house and the bridge, round the west of the silos, the store's door to the gate
  walkers(k, 'spacecom', [
    [[0, 34], [0, 16], [-7, 12], [-7, 2]],
    [[-30, 4], [-26, -6], [-22, -17]],
    [[25, 18], [25, 24], [8, 30], [3, 34]],
  ]);
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
    k.solidQ(pw / 2, th / 2 + 0.03, pd / 2, px, cy, pz, new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0))); // (the panel as it lies)
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
  // the greenhouses, the barn, the silo and the sapling cart drawn at 1x and grown 1.3x about (0, -8): vaults 12 m wide and
  // 36 m long, the barn 36 m long and 11 m to its ridge
  grow(k, 0, -8, 1.3, () => {
  for (const gx of GX) {
    within(k, gx, GZ, 0, () => {
      k.box(GR * 2 + 0.8, 0.6, L + 0.6, T(s.conc), 0, 0, 0, { outline: 0.05 });
      if (k.wreck) {
        const wr = k.wr;
        k.box(GR * 2, 0.06, L, T(CHAR), 0, 0.6, 0, { outline: 0 });
        for (let t = -L / 2; t <= L / 2 + 0.01; t += 3.5) if (wr() < 0.6) k.add(new THREE.TorusGeometry(GR, 0.14, 4, 14, Math.PI * (0.3 + wr() * 0.6)), T(0xf3eee4), 0, 0.6, t, { outline: 0.02 }); // (hoops still standing from the pad)
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
    });
  }
  // the packing barn across the back ends: gambrel roof, big door, hayloft lamp
  const BZ = GZ - L / 2 - 5, BW = 28, BD = 9, BH = 4.5;
  if (!k.wreck) {
    within(k, 0, BZ, 0, () => {
      k.box(BW + 0.6, 0.4, BD + 0.6, T(s.conc), 0, 0, 0, { outline: 0.04 });
      k.box(BW, BH, BD, T(0xb5452a), 0, F, 0, { outline: 0.12 });
      for (let i = -6; i <= 6; i++) k.box(0.12, BH, BD + 0.08, T(0x9a3a22), i * 2, F, 0, { outline: 0 });
      // gambrel: a steep lower pitch and a shallow upper pitch each side, gables filled
      const lw = 2.0, lh = 2.6, uh = 1.6, halfW = BD / 2 + 0.3;
      for (const sd of [-1, 1]) {
        const ang1 = Math.atan2(lh, lw), ang2 = Math.atan2(uh, halfW - lw);
        k.add(new THREE.BoxGeometry(BW + 0.8, 0.3, Math.hypot(lw, lh) + 0.2), T(s.roof), 0, F + BH + lh / 2, sd * (halfW - lw / 2), { rx: sd * ang1, outline: 0.06 });
        k.add(new THREE.BoxGeometry(BW + 0.8, 0.3, Math.hypot(halfW - lw, uh) + 0.3), T(s.roof), 0, F + BH + lh + uh / 2, sd * (halfW - lw) / 2, { rx: sd * ang2, outline: 0.06 });
        // colliders on the two pitches, as the slabs lie
        k.solidQ(BW / 2 + 0.4, 0.15, (Math.hypot(lw, lh) + 0.2) / 2, 0, F + BH + lh / 2, sd * (halfW - lw / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(sd * ang1, 0, 0)));
        k.solidQ(BW / 2 + 0.4, 0.15, (Math.hypot(halfW - lw, uh) + 0.3) / 2, 0, F + BH + lh + uh / 2, sd * (halfW - lw) / 2, new THREE.Quaternion().setFromEuler(new THREE.Euler(sd * ang2, 0, 0)));
      }
      for (const sx of [-1, 1]) {
        const sh = new THREE.Shape(); sh.moveTo(-halfW + 0.3, 0); sh.lineTo(-(halfW - lw), lh); sh.lineTo(0, lh + uh - 0.15); sh.lineTo(halfW - lw, lh); sh.lineTo(halfW - 0.3, 0); sh.lineTo(-halfW + 0.3, 0);
        k.add(new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }).rotateY(Math.PI / 2), T(0xb5452a), sx * BW / 2 - (sx > 0 ? 0.2 : 0), F + BH, 0, { outline: 0.06 });
      }
      k.box(6, 4, 0.15, T(0xf3eee4), 0, F, BD / 2 + 0.02, { outline: 0.03 });
      k.beam([-3, F, BD / 2 + 0.12], [3, F + 4, BD / 2 + 0.12], 0.08, T(0xf3eee4), { outline: 0 });
      k.beam([3, F, BD / 2 + 0.12], [-3, F + 4, BD / 2 + 0.12], 0.08, T(0xf3eee4), { outline: 0 });
      k.box(2.0, 1.2, 0.1, G(WARM), 0, F + BH + 1.0, BD / 2 + 0.05, { outline: 0 });
      emblem(k, -8, F + 2.8, BD / 2 + 0.01, 0, 1.4, 'kepler');
      k.solid(BW / 2, (F + BH) / 2, BD / 2, 0, 0);
    });
  } else ruin(k, 0, BZ, BW, BD, BH, 0, 0xb5452a, k.wr, { roof: s.roof });
  k.hit(BW / 2, BH / 2, BD / 2, 0, BZ);
  for (const gx of GX) k.hit(GR, GR / 2, L / 2, gx, GZ);
  // grain silo by the barn's east end, its chute into a hatch on the barn roof
  within(k, 19, BZ + 2, 0, () => {
    k.cyl(3.2, 3.4, 0.5, 20, T(s.conc), 0, 0, 0, { outline: 0.04 });
    k.cyl(3.0, 3.0, 13, 20, T(0xd8d4e8), 0, F, 0, { outline: 0.1 });
    for (let y = 2; y < 13; y += 2.2) k.ring(3.03, 0.08, T(0xa8a4b4), 0, F + y, 0);
    k.add(new THREE.SphereGeometry(3.0, 20, 6, 0, TAU, 0, Math.PI / 2), T(c), 0, F + 13, 0, { outline: 0.08 });
    if (!k.wreck) { // (its chute into a hatch on the barn roof: gone with the barn)
      k.beam([-2.6, F + 11, 0], [-5.5, F + 8.1, 0], 0.3, T(s.panel), { outline: 0.03 });
      k.box(1.2, 0.5, 1.2, T(s.panel), -5.5, F + 7.6, 0, { outline: 0.03 });
    }
    k.column(3.0, F + 14, 0, 0); // (the shaft and the dome, stepped)
    k.column(2.2, F + 15, 0, 0, F + 14);
    k.column(1.2, F + 15.8, 0, 0, F + 15);
  });
  if (k.wreck) k.hit(3, 7, 3, 19, BZ + 2);
  // the sapling cart at the middle greenhouse's door: the raid spot
  for (const [x, z, ry] of [[3, GZ + L / 2 + 2.4, 0.2], [4.3, GZ + L / 2 + 2.0, -0.3]]) { crate(k, x, F, z, 1.0, 0x9a6a3a, ry); k.add(new THREE.ConeGeometry(0.35, 0.9, 5), T(0x5fbf4a), x, F + 1.45, z, { outline: 0.02 }); k.column(0.2, F + 1.9, x, z, F + 1.0); }
  k.raidAt(1, GZ + L / 2 + 4.2, 0x7dff3a);
  });
  k.smoke = new THREE.Vector3(0, 3, -27);
  k.drop = new THREE.Vector3(-22, F, 22);
  // compost bins on the west side, water tanks on the east with a pipe to the near vault
  for (let i = 0; i < 3; i++) within(k, -33, -5 + i * 4, Math.PI / 2, () => { k.box(3.2, 1.4, 3.2, T(WOOD), 0, F, 0, { outline: 0.04 }); k.box(3.0, 0.2, 3.0, T(0x4a3a2a), 0, F + 1.25, 0, { outline: 0 }); k.solid(1.6, (F + 1.4) / 2, 1.6, 0, 0); });
  tank(k, 29, 12, 2.4, 5, 0xd8d4e8, c);
  tank(k, 29, 19, 2.0, 4, 0x7dd87a, c);
  pipeRun(k, [[26.6, 12], [21.5, 12]], 1.0);
  solarRows(k, -18.5, 26.5, 2, 4, s); // (its corner posts on the apron)
  for (const [x, z] of [[-27, 16], [11, 24], [-31, -16], [31, -6]]) lampPost(k, x, z, 6, s.glow);
  flagPole(k, -8.5, 37); flagPole(k, 8.5, 37);
  // three farmhands: gate to the vaults' doors, up the gap between two vaults to the barn, down the east side by the tanks
  walkers(k, 'kepler', [
    [[0, 36], [0, 21], [-8, 20], [-15, 21]],
    [[7.8, 19], [7.8, -18]],
    [[18, 30], [24, 22], [24.2, 0], [27, -12]],
  ]);
}

// an equipment shelter: a squat block hut with a door, AC units, a cable ladder to its mast; door to local +z
function shelter(k, x, z, ry, w, d, s, label, sc = 1.45) {
  within(k, x, z, ry, () => {
    k.box(w + 0.8, 0.4, d + 0.8, T(s.conc), 0, 0, 0, { outline: 0.04 });
    k.box(w, 3.4, d, T(s.body), 0, F, 0, { outline: 0.08 });
    k.box(w + 0.4, 0.4, d + 0.4, T(s.roof), 0, F + 3.4, 0, { outline: 0.04 });
    k.box(w + 0.42, 0.14, d + 0.42, T(s.trim), 0, F + 3.8, 0, { outline: 0 });
    k.box(1.3, 2.4, 0.1, T(s.dark), -w / 4, F, d / 2 + 0.03, { outline: 0.02 });
    k.box(0.4, 0.2, 0.2, G(WARM), -w / 4, F + 2.6, d / 2 + 0.12, { outline: 0 });
    // two air-conditioning units stacked on a steel frame against the end wall, their fans out
    for (const sz of [-1, 1]) for (const sx of [0.05, 0.75]) k.box(0.08, 2.05, 0.08, T(STEEL), w / 2 + sx, F, -d / 4 + sz * 0.4, { outline: 0 });
    for (let i = 0; i < 2; i++) { k.box(0.7, 0.95, 1.4, T(LIGHT), w / 2 + 0.4, F + 0.05 + i * 1.0, -d / 4, { outline: 0.03 }); k.add(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12).rotateZ(Math.PI / 2), T(DARK), w / 2 + 0.77, F + 0.52 + i * 1.0, -d / 4, { outline: 0 }); }
    k.solid(0.35, 1.0, 0.7, w / 2 + 0.4, -d / 4, 0, F);
    // a door canopy, a vent hood, a cable entry with its tray on the roof
    k.box(1.9, 0.12, 0.9, T(s.roof), -w / 4, F + 2.75, d / 2 + 0.45, { outline: 0.02 });
    for (const sd of [-1, 1]) k.beam([-w / 4 + sd * 0.85, F + 2.75, d / 2 + 0.85], [-w / 4 + sd * 0.85, F + 2.2, d / 2 + 0.02], 0.03, T(DARK), { outline: 0 });
    k.box(0.9, 0.5, 0.35, T(STEEL), w / 4, F + 2.3, d / 2 + 0.17, { outline: 0.02 });
    k.solid(0.45, 0.25, 0.18, w / 4, d / 2 + 0.17, 0, F + 2.3);
    k.box(0.8, 0.35, 0.8, T(STEEL), -w / 2 + 1.2, F + 3.8, 0, { outline: 0.02 });
    k.solid(0.4, 0.17, 0.4, -w / 2 + 1.2, 0, 0, F + 3.8);
    if (label) k.text(label, w / 8, F + 3.0, d / 2 + 0.03, 0, Math.min(w * 0.55, 5), { fg: '#' + s.trim.toString(16).padStart(6, '0'), bg: '#' + s.dark.toString(16).padStart(6, '0'), back: false, off: 0.02 });
    k.solid(w / 2, (F + 3.9) / 2, d / 2, 0, 0);
  }, sc);
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
    k.solid(2.5, 0.45, 2.5, MX, MZ);
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
      k.solid(1.3, 0.65, 1.3, ax, az);
      k.solid(0.7, 0.15, 0.7, ax, az, 0, 1.3);
      for (const h of [17, 33, 49]) k.beam([ax, 1.6, az], [MX + Math.cos(a) * 1.3, h, MZ + Math.sin(a) * 1.3], 0.05, T(0x2a2540), { outline: 0, seg: 3 });
    }
    k.column(1.6, 46.1, MX, MZ); // (to the top platform; the pole and the boom above it are thin)
    // the cable bridge from the mast to the shelter
    k.strip([MX + 1.5, MZ + 0.5], [8.4, -4], 0.7, 0.15, T(s.dark), F + 3.2);
    for (const t of [0.33, 0.66]) { const x = MX + 1.5 + (8.4 - MX - 1.5) * t, z = MZ + 0.5 + (-4 - MZ - 0.5) * t; k.beam([x, F, z], [x, F + 3.2, z], 0.08, T(STEEL), { outline: 0 }); }
  } else {
    const wr = k.wr;
    k.box(5, 0.9, 5, T(s.conc), MX, 0, MZ, { outline: 0.05 });
    k.solid(2.5, 0.45, 2.5, MX, MZ);
    for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3 + 0.3; const h = 3 + wr() * 4; k.beam([MX + Math.cos(a) * 1.3, 0.9, MZ + Math.sin(a) * 1.3], [MX + Math.cos(a) * 1.4, h, MZ + Math.sin(a) * 1.4], 0.17, T(0x9a948e), { outline: 0.03 }); }
    within(k, MX, MZ, 2.2, () => {
      for (let i = 0; i < 3; i++) k.beam([(i - 1) * 1.1, 1.0 + i * 0.2, 2], [(i - 1) * 0.9 + 0.5, 0.6, 30], 0.17, T(i % 2 ? 0xff4f2e : 0xd8d4e8), { outline: 0.03 });
      for (let t = 4; t < 30; t += 3) k.beam([-1.1, 1.0, t], [1.1, 0.7, t + 1.5], 0.06, T(STEEL), { outline: 0 });
      k.solidQ(1.4, 0.5, 14, 0, 0.9, 16, new THREE.Quaternion(), { lattice: true }); // (the mast down: its legs and bracing)
      k.dishHead(2.5, 0.4, 20, 1.6, 'none', { el: -0.3 });
      k.dishHead(-3, 0.4, 26, 1.4, 'none', { el: -0.6 });
    });
    debris(k, MX, MZ, 4, 4, 10, wr);
  }
  k.hit(2.0, 8, 2.0, MX, MZ);
  k.smoke = new THREE.Vector3(MX, 3, MZ);
  k.drop = new THREE.Vector3(-14, F, 16);
  shelter(k, 13, -4, -Math.PI / 2, 9, 6, s, null);
  k.hit(4.4, 2.9, 6.5, 13, -4);
  shelter(k, 20, 12, Math.PI, 6, 4.5, s, null);
  // generator and battery bank
  within(k, 11.5, 8.5, 0.2, () => { k.box(4.2, 2.2, 2.2, T(s.trim), 0, F, 0, { outline: 0.05 }); k.cyl(0.25, 0.3, 2, 6, T(DARK), 1.4, F + 2.2, 0, { outline: 0.02 }); k.solid(2.1, (F + 2.2) / 2, 1.1, 0, 0); }, 1.3);
  // the battery cabinet: one steel case, four doors with their charge lamps
  k.box(5.2, 1.8, 2.2, T(s.panel), -14.05, F, -16, { outline: 0.04 });
  for (let i = 0; i < 4; i++) { k.box(1.1, 1.6, 0.04, T(s.dark), -16 + i * 1.3, F + 0.1, -14.89, { outline: 0 }); k.box(0.6, 0.2, 0.05, G(0x7dff6a), -16 + i * 1.3, F + 1.4, -14.86, { outline: 0 }); }
  k.solid(2.6, (F + 1.8) / 2, 1.1, -14.05, -16);
  // the transponder rack (raid)
  within(k, 6, 4, 0.3, () => {
    k.box(2.2, 2.4, 0.9, T(s.dark), 0, F, 0, { outline: 0.05 });
    for (let i = 0; i < 4; i++) k.box(1.6, 0.3, 0.05, G(i % 2 ? c : 0x7dff6a), 0, F + 0.5 + i * 0.45, 0.46, { outline: 0 });
    k.solid(1.1, (F + 2.4) / 2, 0.45, 0, 0);
  });
  k.raidAt(6.8, 6.3, 0x2ee6ff);
  solarRows(k, -22, 16, 2, 3, s);
  for (const [x, z] of [[-28, -10], [26, -18], [-8, 26], [24, 26]]) lampPost(k, x, z, 6, s.glow);
  flagPole(k, -7, 36.5); flagPole(k, 7, 36.5);
  // three technicians: gate past the rack to the shelter's door, the battery bank and the mast's foot, the east fence line
  walkers(k, 'kepler', [
    [[0, 34], [-3, 20], [4, 0], [7.4, -7.3]],
    [[-10, 10], [-16, -4], [-10, -12]],
    [[6, 30], [20, 24], [30, 16], [30, 0]],
  ]);
}

// ---------- Rustmoon pieces ----------
// a corrugated sheet patch on a wall (local +z face) and a neon tube
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
    k.solid(1.25, (F + h) / 2, 0.12, x, z, a);
  }
  for (const sd of [-1, 1]) within(k, sd * 7.5, 36, 0, () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([sx * 1.4, F, sz * 1.4], [sx * 1.0, F + 6, sz * 1.0], 0.1, T(DARK), { outline: 0.02 });
    k.box(2.8, 2.2, 2.8, T(RUST), 0, F + 6, 0, { outline: 0.05 });
    k.box(2.6, 0.7, 0.1, G(s.glow), 0, F + 7.0, 1.42, { outline: 0 });
    k.add(new THREE.ConeGeometry(2.4, 1.2, 4).rotateY(Math.PI / 4), T(0x5a3a2a), 0, F + 8.8, 0, { outline: 0.04 });
    k.solid(1.4, 1.1, 1.4, 0, 0, 0, F + 6); // (the box on its stilts; the legs are thin)
    pyramidCols(k, 0, 0, F + 8.2, 2.4, 1.2, 4);
  });
  // the hull: local x along the keel, +z the open flank toward the yard
  const HX = -4, HZ = -13, HY = 0.25, r = 7.5, cy = 4.0, L = 30, NS = 6, NA = 28, DECK = 0.4;
  const secL = L / NS, hullC = [0xa8a2b4, 0x948ea2, 0xb4a890];
  within(k, HX, HZ, HY, () => {
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    // plates: NA round the hull per section; phi from straight up (0) toward +z (pi/2); none under the ground
    for (let si = 0; si < NS; si++) {
      const x = -L / 2 + secL * (si + 0.5), gone = [];
      for (let i = 0; i < NA; i++) {
        const phi = (i / NA) * TAU, y = cy + r * Math.cos(phi), z = r * Math.sin(phi);
        if (y < 0.1) { gone[i] = true; continue; }
        const open = z > 0.5 && y > DECK - 0.5 && y < cy + r * 0.8 && si > 0 && si < NS - 1; // the stripped flank
        gone[i] = k.wreck ? y > cy + 1 || wr() < 0.3 : open || rr() < 0.05; // (and the odd missing plate; a wreck keeps its lower hull)
      }
      if (k.wreck) for (const side of [1, -1]) { // (nothing hangs over a burnt-away plate: up each side from the ground)
        const up = [...Array(NA).keys()].filter((i) => cy + r * Math.cos((i / NA) * TAU) >= 0.1 && Math.sin((i / NA) * TAU) * side > 1e-9).sort((a, b) => Math.cos((a / NA) * TAU) - Math.cos((b / NA) * TAU));
        let lost = false;
        for (const i of up) { if (gone[i]) lost = true; else if (lost) gone[i] = true; }
      }
      for (let i = 0; i < NA; i++) {
        const phi = (i / NA) * TAU, y = cy + r * Math.cos(phi), z = r * Math.sin(phi);
        if (gone[i]) continue;
        const w = (TAU * r) / NA + 0.06;
        const lean = 0;
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
      k.add(new THREE.SphereGeometry(r * 1.184, 18, 8, 0, TAU, 0, Math.acos(0.634 / 1.184)).rotateZ(-Math.PI / 2), T(0x6b5a4a), L / 2 - r * 0.634, cy, 0, { outline: 0.1 }); // (a spherical cap 0.55 r deep on the hull's rim: its collider is the same sphere)
      const bowX = (y, zz) => L / 2 - r * 0.634 + Math.sqrt(Math.max(0, (r * 1.184) ** 2 - (y - cy) ** 2 - zz ** 2)); // (the bow cap's face at height y, across zz)
      const X1 = new THREE.Vector3(1, 0, 0);
      for (let i = 0; i < 8; i++) { const y = cy - 2.5 + rr() * 6, zz = (rr() - 0.5) * 8, bx = bowX(y, zz), n = new THREE.Vector3(bx - (L / 2 - r * 0.634), y - cy, zz).normalize(); k.add(new THREE.BoxGeometry(0.1, 1.0 + rr() * 0.8, 1.2 + rr() * 0.8), T([0x8a8698, 0x9a6a3a, 0x5a5f6e][i % 3]), bx + n.x * 0.06, y + n.y * 0.06, zz + n.z * 0.06, { q: new THREE.Quaternion().setFromUnitVectors(X1, n), outline: 0.02 }); } // (boards nailed flat on its face)
      k.box(0.1, 1.4, 2.4, G(s.glow), bowX(cy + 1.5, 1.2) + 0.08, cy + 1.5, 1.2, { outline: 0 });
      k.add(new THREE.CylinderGeometry(r, r, 0.3, 28).rotateZ(Math.PI / 2), T(0x5a5f6e), -L / 2 - 0.1, cy, 0, { outline: 0.06 });
      k.box(0.32, 4, 6, G(0xffb347), -L / 2 - 0.16, DECK, 0, { outline: 0 });
      for (const sd of [-1, 1]) k.cyl(1.2, 1.7, 1.8, 12, T(DARK), -L / 2 - 1.2, cy + 3.2, sd * 3.6, { rz: Math.PI / 2, outline: 0.04 });
      // the stern wall boxed in bands up its curve, the boarded bow's dome, the engine bells
      for (const [y0, y1] of [[0, cy + 2], [cy + 2, cy + 4], [cy + 4, cy + 5.5], [cy + 5.5, cy + 6.7]]) {
        const dy = Math.max(Math.abs(y0 - cy), Math.abs(y1 - cy)), e = Math.sqrt(Math.max(0, 1 - (dy / r) ** 2)); // (the curve's narrowest over the band)
        k.solid(0.3, (y1 - y0) / 2, r * e, -L / 2 - 0.1, 0, 0, y0);
      }
      k.sphere(r * 1.184, L / 2 - r * 0.634, cy, 0); // (the bow's dome: a sphere through its tip and its rim)
      for (const sd of [-1, 1]) k.hcyl(1.6, 1.8, -L / 2 - 1.2, sd * 3.6, Math.PI / 2, cy + 3.2);
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
      for (let i = -3; i <= 2; i++) k.add(new THREE.BoxGeometry(0.05, 0.04, len), T(0x5a3a2a), -secL / 2 + i * 1.6 + 0.8, (y0 + y1) / 2 + 0.16, (z0 + z1) / 2, { rx: sl, outline: 0 }); // (ribs across the porch roof, over it end to end)
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
    } else {
      debris(k, 0, 0, L * 0.4, 5, 30, wr);
      { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0.2)); k.add(new THREE.BoxGeometry(9, 0.3, 7), T(RUST), 4, F + 1.6, r + 2, { q, outline: 0.05 }); k.solidQ(4.5, 0.15, 3.5, 4, F + 1.6, r + 2, q); } // (the porch roof, down)
      for (let i = 0; i < 6; i++) k.box(0.3, 0.12, 0.3, G(i % 2 ? 0xff7a1a : 0xffb347), (wr() - 0.5) * L * 0.6, DECK, (wr() - 0.5) * 8, { outline: 0 });
    }
  }, 1.3); // (the hull at 1.3x: 39 m long, 19.5 m across)
  k.hit(L / 2 * 1.3, cy * 1.3, r * 1.3, HX, HZ, HY);
  k.smoke = new THREE.Vector3(HX, 3, HZ);
  k.drop = new THREE.Vector3(16, F, 18);
  // the plating rack in the hold's mouth: the raid spot
  within(k, HX, HZ, HY, () => within(k, 6, 6.5, 0, () => {
    for (let i = 0; i < 9; i++) k.box(2.0 - (i % 2) * 0.1, 0.09, 1.4 - (i % 3) * 0.05, T([0x8a8698, 0x9a6a3a, 0x5a5f6e][i % 3]), (i % 2) * 0.06, DECK + 0.3 + i * 0.1, 0, { ry: (i % 3 - 1) * 0.04, outline: 0.015 }); // (plates stacked on the pallet)
    k.box(2.4, 0.3, 2.0, T(DARK), 0, DECK, 0, { outline: 0.03 });
    k.solid(1.0, (DECK + 1.2) / 2, 0.7, 0, 0);
  }), 1.3);
  within(k, HX, HZ, HY, () => k.raidAt(6, 9.3, 0x7dff3a), 1.3);
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
    for (const sd of [-1, 1]) k.beam([-7.0 + sd * 0.62, F, 3.75], [-7.0 + sd * 0.62, F + 2.75, 0.5], 0.06, T(DARK), { outline: 0.01 }); // (the stringers the treads sit on)
    k.box(9, 0.15, 1.6, T(DARK), -2.2, F + 2.6, 2.0, { outline: 0.03 });
    for (let x = -6.5; x <= 2; x += 1.5) k.box(0.08, 1.0, 0.08, T(DARK), x, F + 2.75, 2.75, { outline: 0 });
    k.box(9, 0.08, 0.08, T(c), -2.2, F + 3.75, 2.75, { outline: 0 });
    k.solid(4.5, 0.08, 0.8, -2.2, 2.0, 0, F + 2.6);
    k.cyl(0.25, 0.25, 3, 6, T(DARK), 2, F + 5.2, 0.4, { outline: 0.02 });
  }, 1.35);
  // A's derrick over the heap and the scrap press (east)
  scrapHeap(k, 23, -6, 7, 4.5, 36, k.rr);
  within(k, 15, 6, 0, () => {
    lattice(k, 0, 0, 12, 1.0, 0.6, 4, T(RUST), T(DARK), { r: 0.14 });
    k.cols.splice(-2); // (a box a bay instead of lattice's two cylinders, which stood out over air)
    for (let i = 0; i < 4; i++) { const w = 1.0 - 0.4 * (i / 4) + 0.15; k.solidQ(w, 1.5, w, 0, i * 3 + 1.5, 0, new THREE.Quaternion(), { lattice: true }); }
    k.beam([0, 11.6, 0], [6, 13, -8], 0.22, T(YEL), { outline: 0.03 });
    k.beam([0, 9, 0], [6, 13, -8], 0.08, T(DARK), { outline: 0 });
    k.beam([6, 13, -8], [6, 8.5, -8], 0.03, T(DARK), { outline: 0 });
    k.box(0.6, 0.8, 0.3, T(YEL), 6, 7.7, -8, { outline: 0.03 });
  }, 1.3);
  within(k, 27, 8, -0.9, () => {
    k.box(5, 3.2, 4, T(0x5a5f6e), 0, F, 0, { outline: 0.08 });
    k.box(4.6, 1.6, 3.6, T(RUST), 0, F + 3.2, 0, { outline: 0.05 });
    for (const sd of [-1, 1]) { k.box(0.5, 4.4, 0.5, T(YEL), sd * 2.4, F + 3.2, 0, { outline: 0.03 }); k.solid(0.25, 2.2, 0.25, sd * 2.4, 0, 0, F + 3.2); }
    k.box(5.4, 0.6, 0.8, T(YEL), 0, F + 7.4, 0, { outline: 0.03 });
    k.box(1.4, 1.4, 1.4, T(0x6b5a4a), 0, F, 3, { ry: 0.3, outline: 0.04 });
    k.solid(0.7, 0.7, 0.7, 0, 3, 0.3, F);
    k.solid(2.5, 2.4, 2.0, 0, 0, 0, F); // (the body and its ram case; the frame's beam)
    k.solid(2.7, 0.3, 0.4, 0, 0, 0, F + 7.4);
  }, 1.3);
  // B's cook fire with tyre seats, burning barrels, tyre stacks, stolen containers, pirate lights
  k.cyl(2.2, 2.4, 0.4, 12, T(0x3a3540), 6, F, 18, { outline: 0.03 });
  const pit = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 7), G(0xff7a1a)); pit.userData.blink = true; k.dyn(pit, 6, F + 1.2, 18);
  k.column(2.4, F + 0.4, 6, 18);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; const [x, z] = polar(3.8, a); k.cyl(0.45, 0.45, 0.5, 8, T(TYRE), 6 + x, F, 18 + z, { outline: 0.03 });  }
  burnBarrel(k, -10, 20);
  burnBarrel(k, 20, 20);
  for (const [x, z] of [[-16, 24], [-14, 26], [-17.5, 26.5]]) { for (let i = 0; i < 3; i++) k.add(new THREE.TorusGeometry(0.75, 0.32, 6, 12).rotateX(Math.PI / 2), T(TYRE), x, F + 0.28 + i * 0.54, z, { outline: 0.03 }); k.column(1.05, F + 1.8, x, z); } // (each tyre on the one under it)
  // stolen containers, each box another faction's livery
  cargoStack(k, -31, -6, 2, looted(0), Math.atan2(-31, -6) + Math.PI / 2, F);
  cargoStack(k, -20, -28, 1, looted(1), Math.atan2(-20, -28) + Math.PI / 2, F);
  cargoStack(k, -2, -33, 2, looted(2), Math.atan2(-2, -33) + Math.PI / 2, F);
  const poles = [[-20, 16], [-8, 30], [8, 30], [22, 16]];
  for (const [x, z] of poles) { k.cyl(0.1, 0.13, 6, 6, T(DARK), x, F, z, { outline: 0.03 }); k.column(0.15, F + 6, x, z); }
  lightString(k, poles.map(([x, z]) => [x, F + 5.8, z]), [0x7dff3a, 0xff2e88, YEL]);
  // three clan riggers: the gate to the hold, round the cook fire, between the derrick and the press
  walkers(k, 'rustmoon', [
    [[0, 34], [-2, 12], [-4, 3]],
    [[-14, 19], [-4, 26], [14, 25]],
    [[14, 13], [30, 13]],
  ]);
}

// A heap of wreckage (junkHeap's look) with colliders that follow it: the mound in 1 m steps, each as wide as the slope at its
// top, and every piece big enough to stand on boxed as it lies (junkHeap's own two cylinders stood out past the slopes and left
// the pieces open).
function scrapHeap(k, cx, cz, R, H, n, rr) {
  const top = R * 0.22, q = new THREE.Quaternion(), e = new THREE.Euler();
  k.add(new THREE.CylinderGeometry(top, R, H, 20, 1), T(0x75685a), cx, F + H / 2 - 0.05, cz, { outline: 0.06 });
  const steps = Math.max(Math.ceil(H), Math.ceil((R - top) / 0.7)); // (short of 0.7 m across or 1 m up a step)
  for (let i = 0; i < steps; i++) { const y1 = ((i + 1) / steps) * H; k.column(R - (R - top) * (y1 / H), F + y1 - 0.05, cx, cz, F + (i / steps) * H - 0.05); }
  const hh = (r) => (r < top ? H : H * (R - r) / (R - top));
  const cols = [0x6b5a4a, 0x7a3a2a, 0x5a5f6e, 0x8a8698, 0x3a3550, 0xa05a2a, 0x4a6a5a, 0xc9a227];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rr()) * R * 0.9, a = rr() * TAU;
    const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r, y = F + hh(r) - 0.2;
    const rx = (rr() - 0.5) * 1.2, ry = rr() * 6.3, rz = (rr() - 0.5) * 1.2, col = cols[Math.floor(rr() * cols.length)];
    q.setFromEuler(e.set(rx, ry, rz));
    switch (Math.floor(rr() * 6)) {
      case 0: { const w = 1.8 + rr() * 2.5, h = 1.1 + rr() * 1.2, d = 1.4 + rr(); k.add(new THREE.BoxGeometry(w, h, d), T(col), x, y + 0.3, z, { q, outline: 0.05 }); k.solidQ(w / 2, h / 2, d / 2, x, y + 0.3, z, q); break; }
      case 1: { const rad = 1 + rr(), len = 2.5 + rr() * 2, o = new THREE.Vector3(rad / 2, 0, 0).applyQuaternion(q); k.add(new THREE.CylinderGeometry(rad, rad, len, 10, 1, true, 0, Math.PI), D(col), x, y + 0.4, z, { q, outline: 0.05 }); k.solidQ(rad / 2, len / 2, rad, x + o.x, y + 0.4 + o.y, z + o.z, q); break; } // (a half-pipe: the box over its half)
      case 2: k.add(new THREE.TorusGeometry(0.85, 0.36, 6, 12), T(TYRE), x, y + 0.3, z, { q, outline: 0.05 }); break;
      case 3: k.add(new THREE.CylinderGeometry(0.12, 0.12, 3 + rr() * 3, 5), T(STEEL), x, y + 1, z, { rx: rx * 0.6, ry, rz, outline: 0.03 }); break;
      case 4: k.add(new THREE.BoxGeometry(2.4, 0.16, 1.6), T(col), x, y + 0.2, z, { q, outline: 0.05 }); k.solidQ(1.2, 0.1, 0.8, x, y + 0.2, z, q); break;
      default: { k.add(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 8), T(col), x, y + 0.4, z, { q, outline: 0.05 }); k.solidQ(0.45, 0.55, 0.45, x, y + 0.4, z, q); }
    }
  }
}

// =====================================================================================================================
// JUNK PILE A: Scrap Mountain. A 13 m mound of wreckage worked by an electromagnet crane on a turning lattice boom, a sorting
// line into bins, a crusher, the junk-bot repair bench (raid), the yard foreman's hut.
// =====================================================================================================================
function junkA(k) {
  const s = style(k, 'rustmoon'), c = k.c, rr = k.rr;
  yard(k, 0x6f6878, 0x3a3540);
  // a rim of scrap blocks, gaps here and there, the gate open at +z (each block's collider its own height)
  for (let a = 0.3; a < TAU - 0.3; a += 2.8 / 37) { if (rr() < 0.15) continue; const [x, z] = polar(37.5, a), h = 1.0 + rr() * 0.8, ry = a + (rr() - 0.5) * 0.3; k.box(2.6, h, 1.2, T([0x5a5f6e, 0x6b5a4a, 0x7a3a2a][Math.floor(rr() * 3)]), x, F, z, { ry, outline: 0.04 }); k.solid(1.3, h / 2, 0.6, x, z, ry, F); }
  const MX = -6, MZ = -10;
  if (!k.wreck) scrapHeap(k, MX, MZ, 15, 13, 130, k.mr);
  else scrapHeap(k, MX, MZ, 17, 5, 90, k.wr);
  // a car body, a ship's fin and a dish poking out of the top
  if (!k.wreck) {
    k.box(2.4, 1.4, 4.6, T(0xd9482b), MX + 1, F + 12.2, MZ - 1, { rx: 0.5, rz: 0.3, outline: 0.06 });
    k.solidQ(1.2, 0.7, 2.3, MX + 1, F + 12.9, MZ - 1, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0.3)));
    k.add(new THREE.CylinderGeometry(0.1, 3, 5, 3), T(0x8a8698), MX - 3, F + 11.5, MZ + 2, { rz: 0.5, outline: 0.06 });
    k.dishHead(MX + 3, F + 10.2, MZ + 3, 1.4, 'none', { el: -0.2, az: 0.8 });
    k.column(3.4, F + 13, MX, MZ, F + 11);
  }
  k.hit(10, 5, 10, MX, MZ);
  k.smoke = new THREE.Vector3(MX, 4, MZ);
  k.drop = new THREE.Vector3(16, F, 18);
  // the magnet crane: tracks, a turning cab on a ring with a lattice boom and the magnet disc hanging over the heap
  const CX = 16, CZ = -14;
  within(k, CX, CZ, 0, () => { // (the crane at 1.35x: tracks 9.5 m long, the boom's tip 23 m out and 20 m up)
  within(k, 0, 0, 0, () => {
    for (const sd of [-1, 1]) { k.box(1.4, 1.4, 7, T(TYRE), sd * 2.2, F, 0, { outline: 0.05 }); for (let i = -3; i <= 3; i++) k.box(1.5, 0.15, 0.4, T(DARK), sd * 2.2, F + 1.35, i, { outline: 0 }); }
    k.box(3.6, 0.8, 5, T(s.dark), 0, F + 1.0, 0, { outline: 0.04 });
    for (const sd of [-1, 1]) k.solid(0.7, 0.7, 3.5, sd * 2.2, 0, 0, F); // (each track, and the deck between and over them)
    k.solid(1.8, 0.4, 2.5, 0, 0, 0, F + 1.0);
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
    k.dyn(g, 0, F + 1.8, 0);
    k.column(2.4, F + 5.5, 0, 0, F + 1.8);
  } else {
    { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.5)); k.add(new THREE.BoxGeometry(4.4, 3.2, 3.6), T(0x8a6a2a), 1, F + 3.2, 0, { q, outline: 0.06 }); k.solidQ(2.2, 1.6, 1.8, 1, F + 3.2, 0, q); } // (the cab, tipped on its deck)
    for (const sz of [-0.6, 0.6]) k.beam([-1, F + 2.6, sz], [4, F + 0.6, 15 + sz], 0.12, T(0x8a6a2a), { outline: 0.03 });
  }
  }, 1.35);
  // the sorting line: a hopper, a belt on trestles to three bins (metal, plastics, parts)
  within(k, 8, 14, -0.3, () => {
    k.add(new THREE.CylinderGeometry(2.4, 1.0, 2.4, 4).rotateY(Math.PI / 4), T(s.panel), -8, F + 3.8, 0, { outline: 0.05 });
    k.solid(1.5, 1.2, 1.5, -8, 0, 0, F + 2.6); // (the hopper)
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
  }, 1.3);
  // the crusher
  within(k, -26, 10, 0.6, () => {
    k.box(5, 4, 4.5, T(0x5a5f6e), 0, F, 0, { outline: 0.08 });
    k.add(new THREE.CylinderGeometry(3, 1.6, 2.4, 4).rotateY(Math.PI / 4), T(RUST), 0, F + 5.2, 0, { outline: 0.05 });
    k.box(2.4, 1.2, 2.4, T(0x7a3a2a), 0, F, 3.4, { ry: 0.2, outline: 0.04 });
    k.solid(1.2, 0.6, 1.2, 0, 3.4, 0.2, F);
    k.solid(2.5, (F + 4) / 2, 2.3, 0, 0); // (the body)
    k.solid(1.8, 1.2, 1.8, 0, 0, 0, F + 4); // (the hopper on it)
  }, 1.35);
  // the junk-bot bench under an awning (raid): a half-built bot, spare heads and a welder's spark
  within(k, 18, 6, -0.9, () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { k.box(0.15, 3.2, 0.15, T(DARK), sx * 2.4, F, sz * 1.6, { outline: 0.02 }); }
    k.box(5.4, 0.15, 3.8, T(RUST), 0, F + 3.2, 0, { outline: 0.04 });
    k.solid(2.7, 0.1, 1.9, 0, 0, 0, F + 3.2);
    k.box(3.2, 0.9, 1.2, T(STEEL), 0, F, -0.8, { outline: 0.04 });
    k.solid(1.6, (F + 0.9) / 2, 0.6, 0, -0.8);
    k.box(0.9, 0.9, 0.9, T(0xffb347), -0.6, F + 1.35, -0.8, { outline: 0.03 });
    k.solid(0.45, 0.45, 0.45, -0.6, -0.8, 0, F + 1.35);
    k.ball(0.35, G(0x2ee6ff), -0.6, F + 1.5, -0.33, { outline: 0 });
    for (let i = 0; i < 3; i++) k.ball(0.3, T([0xffb347, 0x8a8698, 0xa05a2a][i]), 0.6 + i * 0.5, F + 1.2, -0.8, { outline: 0.02 });
    if (!k.wreck) {  const sp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), G(0xfff3b0)); sp.userData.blink = true; k.dyn(sp, -0.2, F + 1.4, -0.5); }
  }, 1.3);
  k.raidAt(19.8, 8.0, 0xffb347);
  // the foreman's hut and junk bots pottering
  within(k, -22, -22, 0.8, () => { scrapBox(k, 0, F, 0, Math.PI / 2, 0x4a6a5a, rr); k.box(1.4, 0.8, 0.1, G(s.glow), 1.2, F + 1.3, 1.27, { outline: 0 }); k.add(new THREE.BoxGeometry(7.2, 0.15, 3.6), T(RUST), 0, F + 2.77, 0.6, { rx: 0.15, outline: 0.04 }); k.solidQ(3.6, 0.08, 1.8, 0, F + 2.77, 0.6, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0))); }, 1.35);
  burnBarrel(k, -12, 24);
  for (const [x, z] of [[-30, -8], [28, 20], [-8, 30]]) lampPost(k, x, z, 7, s.glow);
  flagPole(k, -6.5, 37); flagPole(k, 6.5, 37);
  // salvage stacks round the rim: containers off everyone's trains, each box another livery
  cargoStack(k, 27, -12, 2, looted(0), Math.atan2(27, -12) + Math.PI / 2, F);
  cargoStack(k, 19, -25, 1, looted(2), Math.atan2(19, -25) + Math.PI / 2, F);
  cargoStack(k, -28, 0, 3, looted(1), Math.atan2(-28, 0) + Math.PI / 2, F);
  // three junk bots pottering about the yard (outpostWalkers.js)
  walkers(k, 'rustmoon', [
    [[0, 30], [10, 27], [22, 27]],
    [[-8, 22], [-16, 16], [-22, 4]],
    [[28, 4], [28, -4], [24, 0]],
  ], 'junkbot');
}

// the picks (outpostModels.js OUTPOST_PICK; the other drafts are in git history and docs/outpost-proposals)
DRAFT_BUILD.kiosk = { b: kioskB };
DRAFT_BUILD.tower = { b: towerB };
DRAFT_BUILD.depot = { b: depotB };
DRAFT_BUILD.farm = { b: farmB };
DRAFT_BUILD.mast = { a: mastA };
DRAFT_BUILD.junk = { a: junkA };
DRAFT_BUILD.shack = { c: shackMix };

// what the Blender-built outposts take from here once baked (outpostModels.js glbExtras): their container stacks (a `stack`
// point: 'owner' boxes in the owner's livery, else the named ones) and their walkers' look
GLB_HOOKS.stack = (k, st, color) => cargoStack(k, st.x, st.z, st.n, st.factions[0] === 'owner' ? CARGO_OF[factionOf(color, 'spacecom')] || ['spacecom'] : st.factions, st.yaw, st.y);
GLB_HOOKS.look = (color) => WALK_LOOK[factionOf(color, 'spacecom')] || WALK_LOOK.spacecom;
