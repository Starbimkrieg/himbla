import * as THREE from 'three';
import { Kit, T, G, D, GLASS, BEAM, prism, sandbags, container, crate, tank, lightString, junkHeap, PALETTE } from './outpostModels.js';
import { FACTIONS } from './locations.js';
import { pixelFont } from './fonts.js';
import { glow } from './toon.js';

// Settlements, HQs and landmarks built with the outpost Kit (outpostModels.js): every static part
// of a place bakes into one merged mesh per material plus one ink hull, so a detailed settlement
// still costs a handful of draw calls. Moving parts (cranes, wheels, tickers, rides) are separate
// objects tagged with userData.tick / spin / blink / flag, which World.update animates while the
// settlement is active. Colliders are registered in the settlement's local frame.
const { STEEL, DARK, LIGHT, CREAM, CONC, YEL, RUST, TYRE, CHAR } = PALETTE;
const WHITE = 0xfff4e0, PANEL = 0x5b5870, ROOF = 0x3a3550, WARM = 0xfff6a8;
const TAU = Math.PI * 2;
const hex = (c) => new THREE.Color(c).getHex();

// Build one settlement: fn(k, ctx) draws into a Kit in the settlement's own frame; the result is
// placed, its colliders registered and its moving parts handed to the world's animator.
export function settle(world, loc, seed, fn) {
  const fc = hex((FACTIONS[loc.faction] || FACTIONS.spacecom).color || 0xffd23f);
  const k = new Kit(fc, seed, false);
  const ctx = { world, loc, k, fc, rr: k.rr, moving: [] };
  fn(k, ctx);
  k.at();
  const t = k.finish();
  world.put(t.root, loc, 0, 0, 0, 0, true);
  for (const c of t.cols) world.col(loc, c);
  const list = [];
  t.root.traverse((o) => { const u = o.userData; if (u.tick || u.spin || u.blink || u.flag) list.push(o); });
  if (list.length) world.anims.push({ loc, list, seed });
  return t;
}

// A moving piece built from its own small Kit (merged meshes + ink), returned as a Group.
export function part(color, fn, seed = 1) {
  const k = new Kit(color, seed, false);
  fn(k);
  return k.finish().root;
}

// ---------------------------------------------------------------------------------------------
// shared structures (each sets its own frame with k.at and leaves k at the origin)
// ---------------------------------------------------------------------------------------------

// Hab dome: plinth, ribbed shell, latitude bands, a ring of lit windows (curved panes laid on the
// shell between the ribs), a ribbed tunnel out to an airlock (housing, hazard-striped frame, split
// doors with portholes, cycle lights, keypad and a step; facing local yaw `door`), and a roof cupola
// with an antenna.
export function habDome(k, x, z, r, color, { door = 0, trim = 0xffd23f, windows = true, cupola = true, glass = false } = {}) {
  k.at(x, z, door);
  const seg = Math.max(20, Math.min(40, Math.round(r * 2)));
  k.cyl(r + 0.9, r + 1.4, 1.1, seg, T(PANEL), 0, 0, 0, { outline: 0.12 });
  k.ring(r + 1.0, 0.22, T(trim), 0, 1.1, 0);
  const shell = glass ? GLASS(color, 0.28) : T(color);
  k.add(new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg / 3)), 0, TAU, 0, Math.PI / 2), shell, 0, 1.0, 0, { outline: glass ? 0 : Math.min(0.3, 0.1 + r * 0.008) });
  // ribs over the top and two latitude bands
  const ribT = Math.max(0.12, r * 0.014);
  for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(r + ribT * 0.4, ribT, 4, seg, Math.PI), T(WHITE), 0, 1.0, 0, { ry: (i * Math.PI) / 4, outline: 0 });
  for (const phi of [0.42, 0.85]) k.ring(r * Math.cos(phi) + ribT * 0.3, ribT * 0.9, T(WHITE), 0, 1.0 + r * Math.sin(phi), 0);
  if (windows) {
    // curved panes on the shell itself (a flat box stood proud of it and cut through the ribs): in
    // each 45-degree bay between two ribs, a few panes with a dark frame, clear of the rib either side
    const el = 0.2; // elevation above the equator
    const pr = r + 0.06, fr = r + 0.03;
    const dTheta = Math.min(0.32, 1.0 / r), dTh2 = dTheta * 1.35;
    const per = Math.max(1, Math.round(((TAU / 8) * r * Math.cos(el)) / 3.6));
    const gap = (ribT * 2.5 + 0.5) / (r * Math.cos(el)); // keep this far off each rib (radians)
    const bay = TAU / 8, wA = Math.min((bay - 2 * gap) / per * 0.62, 1.5 / (r * Math.cos(el)));
    for (let b = 0; b < 8; b++) for (let j = 0; j < per; j++) {
      const a = b * bay + gap + ((j + 0.5) / per) * (bay - 2 * gap);
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue; // the airlock side
      const phi0 = a + Math.PI / 2; // SphereGeometry azimuth for direction (sin a, cos a)
      k.add(new THREE.SphereGeometry(fr, 4, 2, phi0 - wA * 0.62, wA * 1.24, Math.PI / 2 - el - dTh2 / 2, dTh2), T(DARK), 0, 1.0, 0, { outline: 0 });
      k.add(new THREE.SphereGeometry(pr, 4, 2, phi0 - wA / 2, wA, Math.PI / 2 - el - dTheta / 2, dTheta), G(WARM), 0, 1.0, 0, { outline: 0 });
    }
  }
  if (cupola && r > 9) {
    const top = 1.0 + r;
    k.cyl(r * 0.16, r * 0.2, 1.2, 12, T(WHITE), 0, top - 0.6, 0, { outline: 0.06 });
    k.ring(r * 0.17, 0.12, G(trim), 0, top + 0.2, 0);
    k.cyl(0.1, 0.14, r * 0.35, 5, T(DARK), r * 0.08, top, 0, { outline: 0.03 });
    k.blinker(r * 0.08, top + r * 0.35 + 0.3, 0, 0xff2a4a, 0.3);
  }
  // airlock: a ribbed tunnel out to +z, flared where it meets the dome, ending in an airlock housing
  const ar = Math.min(2.6, 1.4 + r * 0.06), L = Math.min(5, 2 + r * 0.12), ay = ar + 0.2;
  k.add(new THREE.CylinderGeometry(ar, ar, L + 1, 16).rotateX(Math.PI / 2), T(WHITE), 0, ay, r - 0.6 + L / 2, { outline: 0.06 });
  // where it meets the dome: a solid collar flaring into the shell, a docking ring and a row of bolts
  k.add(new THREE.CylinderGeometry(ar + 0.3, ar + 1.0, 1.6, 18).rotateX(Math.PI / 2), T(PANEL), 0, ay, r - 0.55, { outline: 0.05 });
  k.add(new THREE.TorusGeometry(ar + 0.34, 0.24, 6, 18), T(trim), 0, ay, r + 0.27, { outline: 0 });
  for (let i = 0; i < 10; i++) { const t = (i / 10) * TAU; k.add(new THREE.SphereGeometry(0.11, 6, 4), T(LIGHT), Math.cos(t) * (ar + 0.62), ay + Math.sin(t) * (ar + 0.62), r - 0.05, { outline: 0 }); }
  for (let i = 1; i <= 3; i++) k.add(new THREE.TorusGeometry(ar + 0.06, 0.13, 4, 16), T(i === 2 ? trim : PANEL), 0, ay, r - 0.4 + (L * i) / 4, { outline: 0 });
  // the housing: a squared-off lock chamber the tunnel plugs into
  const hw = ar * 1.35, hh = ar * 2.3, hz = r + L - 0.4, hd = 1.8;
  k.box(hw * 2, hh, hd, T(WHITE), 0, 0, hz, { outline: 0.08 });
  k.box(hw * 2 + 0.2, 0.35, hd + 0.2, T(trim), 0, hh, hz, { outline: 0.03 });
  k.box(hw * 2 + 0.1, 0.3, hd + 0.1, T(PANEL), 0, 0, hz, { outline: 0 });
  // the doorway: a recessed dark frame ringed with hazard stripes, split doors with portholes
  const dw = ar * 1.0, dh = ar * 1.65, fz = hz + hd / 2;
  k.box(dw * 2 + 0.5, dh + 0.5, 0.12, T(DARK), 0, 0.35, fz + 0.02, { outline: 0 });
  const nStripe = 7;
  for (let i = 0; i < nStripe; i++) {
    const m = T(i % 2 ? DARK : YEL);
    k.box((dw * 2 + 0.5) / nStripe, 0.22, 0.1, m, -dw - 0.25 + (i + 0.5) * ((dw * 2 + 0.5) / nStripe), dh + 0.62, fz + 0.06, { outline: 0 });
  }
  for (const sx of [-1, 1]) {
    k.box(dw - 0.06, dh, 0.14, T(0x3a3550), sx * (dw / 2 + 0.03), 0.35, fz + 0.08, { outline: 0.02 });
    k.add(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12).rotateX(Math.PI / 2), G(0x9be7ff), sx * (dw / 2 + 0.03), 0.35 + dh * 0.68, fz + 0.17, { outline: 0 });
    k.add(new THREE.TorusGeometry(0.3, 0.05, 4, 12), T(LIGHT), sx * (dw / 2 + 0.03), 0.35 + dh * 0.68, fz + 0.18, { outline: 0 });
    for (let j = 0; j < 3; j++) k.box(dw - 0.3, 0.1, 0.05, T(j % 2 ? DARK : YEL), sx * (dw / 2 + 0.03), 0.45 + j * 0.12, fz + 0.16, { outline: 0 });
  }
  k.box(0.05, dh, 0.16, T(DARK), 0, 0.35, fz + 0.1, { outline: 0 }); // the seam between the doors
  // status lamp over the door, cycle lights either side (green: outer door, red: inner), a keypad
  k.box(dw * 1.4, 0.22, 0.25, G(WARM), 0, dh + 0.9, fz + 0.05, { outline: 0 });
  k.add(new THREE.SphereGeometry(0.16, 8, 6), G(0x7dff6a), -dw - 0.55, 0.35 + dh * 0.85, fz + 0.1, { outline: 0 });
  k.add(new THREE.SphereGeometry(0.16, 8, 6), G(0xff2a4a), dw + 0.55, 0.35 + dh * 0.85, fz + 0.1, { outline: 0 });
  k.box(0.4, 0.55, 0.12, T(DARK), dw + 0.55, 0.35 + dh * 0.4, fz + 0.06, { outline: 0.02 });
  k.box(0.28, 0.2, 0.05, G(0x2ee6ff), dw + 0.55, 0.35 + dh * 0.4 + 0.25, fz + 0.13, { outline: 0 });
  // a step plate in front
  k.box(dw * 2 + 1, 0.22, 1.6, T(CONC), 0, 0, fz + 0.8, { outline: 0.03 });
  k.sphere(r, 0, 0.6, 0);
  k.solid(ar + 0.2, ar + 0.2, L / 2 + 0.3, 0, r + L / 2 - 0.4);
  k.solid(hw, hh / 2, hd / 2, 0, hz);
  k.at();
}

// Prefab cabin: body with corner posts, a lit window band, a door with a lamp, roof with a
// parapet, an AC unit and a vent. Door faces local +z.
export function cabin(k, x, z, w, d, h, color, yaw = 0, { roof = ROOF, trim = YEL, solar = false } = {}) {
  k.at(x, z, yaw);
  k.box(w + 0.5, 0.5, d + 0.5, T(CONC), 0, 0, 0, { outline: 0.05 });
  k.box(w, h, d, T(color), 0, 0.4, 0, { outline: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.4, h, 0.4, T(PANEL), sx * (w / 2), 0.4, sz * (d / 2), { outline: 0 });
  k.box(w + 0.6, 0.5, d + 0.6, T(roof), 0, h + 0.4, 0, { outline: 0.06 });
  k.box(w + 0.7, 0.18, d + 0.7, T(trim), 0, h + 0.85, 0, { outline: 0 });
  // windows: lit panes with dark mullions on all four faces
  const wy = 0.4 + h * 0.55;
  for (const [len, face, rot] of [[w, d / 2, 0], [w, -d / 2, Math.PI], [d, w / 2, Math.PI / 2], [d, -w / 2, -Math.PI / 2]]) {
    const n = Math.max(1, Math.floor((len - 2.4) / 2.6));
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * 2.6;
      if (rot === 0 && Math.abs(u) < 1.6) continue; // the door
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
    // tilted panels on little rack legs standing on the roof (top of the trim: h + 1.03)
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

// A tall industrial shed: sawtooth roof with glazing, roll-up doors and a loading dock (+z).
export function warehouse(k, x, z, w, d, h, color, yaw, trim) {
  k.at(x, z, yaw);
  k.box(w, h, d, T(color), 0, 0, 0, { outline: 0.15 });
  for (let i = 0; i < 6; i++) {
    const x0 = -w / 2 + (w / 6) * (i + 0.5);
    k.box(0.3, h, d + 0.15, T(PANEL), x0 - w / 12, 0, 0, { outline: 0 });
  }
  // north-light roof: a row of ridges running front to back, one slope of each glazed and lit
  const teeth = Math.max(3, Math.round(w / 6)), tw = w / teeth, th = 2.6, lean = Math.atan(tw / 2 / th);
  for (let i = 0; i < teeth; i++) {
    const tx = -w / 2 + tw * (i + 0.5);
    k.add(prism(d, tw, th), T(trim), tx, h + 0.4, 0, { ry: Math.PI / 2, outline: 0.06 });
    k.add(new THREE.BoxGeometry(0.12, th * 0.85 / Math.cos(lean), d - 1.2), G(0xcfefff), tx + tw / 4 + 0.08, h + 0.4 + th / 2, 0, { rz: lean, outline: 0 });
  }
  k.box(w + 0.4, 0.4, d + 0.4, T(ROOF), 0, h, 0, { outline: 0.05 });
  // two roll-up doors with striped frames and a raised dock
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

// Four-legged lattice tower (masts, derricks, crane towers): legs taper from base half-width
// w0 to top half-width w1, X-braced in `bays` bays. Returns nothing; draws in the current frame.
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
}

// Tower crane: lattice mast, slewing jib with a trolley running in and out and a hook that
// rises and falls. The slewing part, trolley and hook are moving objects.
export function towerCrane(k, x, z, h, jib, color, { speed = 0.12, phase = 0 } = {}) {
  k.at(x, z);
  k.box(6, 1, 6, T(CONC), 0, 0, 0, { outline: 0.06 });
  lattice(k, 0, 0, h, 1.4, 1.4, Math.round(h / 4), T(color), T(color));
  k.column(1.8, h, 0, 0);
  const top = new THREE.Group();
  top.add(part(color, (q) => {
    q.cyl(1.9, 1.9, 1.2, 12, T(DARK), 0, 0, 0, { outline: 0.06 });
    // jib out to +x and counter-jib with its weights to -x, a tower head and stays
    for (const s of [-1, 1]) {
      q.beam([0, 1.2, s * 0.8], [jib, 1.2, s * 0.8], 0.16, T(color), { outline: 0.04 });
      q.beam([-jib * 0.32, 1.2, s * 0.8], [0, 1.2, s * 0.8], 0.16, T(color), { outline: 0.04 });
    }
    q.beam([0, 3.4, 0], [jib, 1.4, 0], 0.12, T(color), { outline: 0.03 });
    for (let i = 1; i < jib / 3; i++) q.beam([i * 3, 1.2, -0.8], [i * 3 + 1.5, 3.2 - (i * 3 * 2) / jib, 0], 0.07, T(color), { outline: 0 });
    q.box(1.2, 4.6, 1.2, T(color), 0, 1.2, 0, { outline: 0.04 });
    q.beam([0, 5.8, 0], [jib * 0.75, 1.4, 0], 0.06, T(DARK), { outline: 0 });
    q.beam([0, 5.8, 0], [-jib * 0.3, 1.4, 0], 0.06, T(DARK), { outline: 0 });
    q.box(3, 2.6, 2.4, T(CONC), -jib * 0.28, 0.2, 0, { outline: 0.05 });
    q.box(2.2, 2.2, 2, T(WHITE), 1.6, -1.2, 1.6, { outline: 0.05 });
    q.box(2.24, 0.8, 2.04, G(0xcfefff), 1.6, -0.4, 1.6, { outline: 0 });
    q.blinker(jib, 1.8, 0, 0xff2a4a, 0.3);
    q.blinker(0, 6.2, 0, 0xff2a4a, 0.3);
  }));
  const trolley = new THREE.Group();
  const cart = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.4), T(DARK));
  trolley.add(cart);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4).translate(0, -0.5, 0), T(DARK));
  trolley.add(cable);
  const hook = part(color, (q) => {
    q.box(0.9, 0.7, 0.9, T(YEL), 0, -0.7, 0, { outline: 0.03 });
    q.add(new THREE.TorusGeometry(0.35, 0.1, 4, 10, Math.PI * 1.4), T(DARK), 0, -1.0, 0, { rz: Math.PI, outline: 0 });
    q.box(3, 1.6, 3, T([0xff3b5c, 0x2ec4ff, 0x7dff6a][Math.abs(Math.round(phase * 3)) % 3]), 0, -3.4, 0, { outline: 0.05 });
  });
  trolley.add(hook);
  top.add(trolley);
  top.position.y = h;
  top.userData.tick = (o, dt, t) => {
    const u = t * speed + phase;
    o.rotation.y = phase * 2 + Math.sin(u) * 1.6;
    trolley.position.set(jib * (0.45 + 0.35 * Math.sin(u * 1.7 + 1)), 0.6, 0);
    const drop = 6 + (h - 10) * (0.5 + 0.5 * Math.sin(u * 1.3));
    cable.scale.y = drop; hook.position.y = -drop;
  };
  k.dyn(top, 0, h, 0);
  k.at();
}

// Horton sphere: a pressure sphere on legs with an equator walkway, coloured bands and a ladder.
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
  // the canvas is exactly one pass of the text (whole passes repeat round the drum), so the wrap
  // never cuts an item in half (a fixed-width canvas used to: "HMERIDIAN")
  const c = document.createElement('canvas');
  const parts = text.split('|').map((s) => s.trim() + '   ');
  const g0 = c.getContext('2d');
  let fs = 64;
  g0.font = pixelFont(fs);
  let W = parts.reduce((a, s) => a + g0.measureText(s).width, 0);
  // a small drum: smaller lettering, so one pass fits round it instead of being squeezed
  const nat = (h * W) / 128;
  if (nat > TAU * r * 1.25) fs = Math.max(28, Math.floor((fs * TAU * r) / nat));
  if ((W * fs) / 64 > 8000) fs = Math.floor((fs * 8000 * 64) / (W * fs));
  g0.font = pixelFont(fs);
  W = parts.reduce((a, s) => a + g0.measureText(s).width, 0);
  c.width = Math.ceil(W); c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.font = pixelFont(fs);
  g.textBaseline = 'middle';
  let px = 0;
  for (const s of parts) {
    g.fillStyle = s.includes('▼') ? '#ff3b5c' : fg;
    g.fillText(s, px, 68);
    px += g.measureText(s).width;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  // whole passes round the drum, each about the text's natural aspect
  tex.repeat.set(Math.max(1, Math.round((TAU * r) / ((h * c.width) / c.height))), 1);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1, true), new THREE.MeshBasicMaterial({ map: tex }));
  drum.userData.tick = (o, dt) => { tex.offset.x = (tex.offset.x + dt * speed) % 1; };
  k.dyn(drum, x, y + h / 2, z);
  k.ring(r + 0.1, 0.25, T(ring), x, y + h + 0.1, z);
  k.ring(r + 0.1, 0.25, T(ring), x, y - 0.1, z);
}

// Elevated conveyor on trestles along a polyline, with lumps of ore riding it.
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

// Floodlight mast: lattice pole with a bank of lamps tilted at the yard centre.
export function floodMast(k, x, z, h = 14, color = YEL) {
  k.at(x, z, Math.atan2(-x, -z));
  k.box(1.6, 0.4, 1.6, T(CONC), 0, 0, 0, { outline: 0.03 });
  lattice(k, 0, 0, h, 0.6, 0.35, Math.round(h / 3), T(STEEL), T(DARK), { r: 0.12 });
  k.box(3.2, 0.3, 0.3, T(color), 0, h, 0.4, { outline: 0.03 });
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

// Pipe run along a polyline at height y (with supports).
export function pipe(k, pts, y, r = 0.35, color = 0xd8d4e8) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    k.beam([a[0], y, a[1]], [b[0], y, b[1]], r, T(color), { outline: 0.03, seg: 8 });
    k.ball(r * 1.3, T(color), b[0], y, b[1], { outline: 0 });
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 4; t < len; t += 8) {
      const px = a[0] + ((b[0] - a[0]) * t) / len, pz = a[1] + ((b[1] - a[1]) * t) / len;
      k.beam([px, 0, pz], [px, y - r, pz], 0.1, T(STEEL), { outline: 0 });
    }
  }
}

// =============================================================================================
// Helium-3 Exchange: a working strip-mine. A bucket-wheel excavator chews a regolith heap onto a
// conveyor that runs to the refinery; a drilling derrick pumps in the middle; He-3 sits in
// Horton spheres; the trading hall wears a scrolling price ticker; a tower crane slews overhead.
// =============================================================================================
export function buildHelium(world, loc) {
  settle(world, loc, 3301, (k, ctx) => {
    const blue = 0x2ec4ff;
    // the derrick: a lattice tower over a rotary deck, with the drill string pumping and turning
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
    // mud and separator tanks beside it
    k.at(14, 8);
    tank(k, 0, 0, 2.6, 6, LIGHT, 0x7dff6a);
    tank(k, 0, 6.5, 2.2, 5, LIGHT, 0xc77dff);
    k.column(2.8, 6.5, 0, 0); k.column(2.4, 5.5, 0, 6.5);
    k.at();
    pipe(k, [[4, 4], [14, 4], [14, 8]], 3.2, 0.4);
    // He-3 tank farm: four Horton spheres in the old green / purple colours, piped to a manifold
    for (const [x, z, b] of [[58, -20, 0x7dff6a], [76, -20, 0xc77dff], [58, 2, 0xc77dff], [76, 2, 0x7dff6a]]) hortonSphere(k, x, z, 6, WHITE, b);
    pipe(k, [[44, -36], [44, -9], [67, -9]], 1.4, 0.45, 0x9be7ff);
    pipe(k, [[67, -9], [67, -20]], 1.4, 0.45, 0x9be7ff);
    pipe(k, [[67, -9], [67, 2]], 1.4, 0.45, 0x9be7ff);
    k.at(67, -9);
    k.box(3.4, 2.4, 2.4, T(STEEL), 0, 0, 0, { outline: 0.04 });
    for (const s of [-1, 0, 1]) k.add(new THREE.TorusGeometry(0.5, 0.12, 4, 10), T(0xff3b5c), s * 1.1, 2.7, 0, { rx: Math.PI / 2, outline: 0 });
    k.solid(1.8, 1.2, 1.3, 0, 0);
    k.at();
    // refinery: process hall, two stacks, cold boxes, and pipe racks to the farm
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
    // the bucket-wheel excavator chewing a regolith heap, feeding the conveyor
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
    // the heap it eats
    k.at(-52, 66);
    // a closed mound (lathe from rim to a rounded top, so it's solid from every side)
    k.add(new THREE.LatheGeometry([[15, 0], [13, 2.6], [9.5, 5.6], [5, 8], [1.5, 8.9], [0, 9]].map(([r, y]) => new THREE.Vector2(r, y)), 16), T(0x8a8296), 0, 0, 0, { outline: 0.12 });
    for (let i = 0; i < 9; i++) { const a = i * 0.7; k.add(new THREE.DodecahedronGeometry(1 + (i % 3) * 0.6, 0), T(0x6b6378), Math.cos(a) * (6 + i), 0.6, Math.sin(a) * (6 + i), { ry: a, outline: 0.04 }); }
    k.at();
    world.col(loc, { type: 'cyl', x: -52, z: 66, y0: -2, y1: 6, r: 9 });
    // conveyor from the excavator boom to the refinery, ore riding it
    conveyor(k, [[-30, 28], [-6, 22], [8, 12], [16, -20], [22, -34]], 4.6);
    // trading hall with the price ticker on its roof, flags and a plaza sign
    cabin(k, -28, -58, 26, 14, 9, WHITE, -0.35, { roof: blue, trim: YEL, solar: true });
    k.at(-28, -58, -0.35);
    k.box(10, 3.2, 8, T(blue), 0, 9.8, 0, { outline: 0.06 });
    k.at();
    ticker(k, -28, 13.4, -58, 6, 2.6, 'HE-3 ▲ 412.70 | REGOLITH ▼ 3.15 | DEUTERIUM ▲ 88.20 | ICE ▲ 19.95 | ANTIMATTER ▼ 9,999.00 | PIRATE RISK ▲ HIGH');
    k.at(-28, -58);
    k.cyl(0.25, 0.3, 6, 6, T(DARK), 0, 16.2, 0, { outline: 0.03 });
    k.blinker(0, 22.5, 0, 0x2ec4ff, 0.4);
    k.at();
    k.at(-18, -38, -0.35);
    k.sign('HE-3 EXCHANGE', 0, 0, { w: 14, y: 5, fg: '#2ec4ff' });
    k.at();
    k.flag(-44, -44, 12, blue);
    k.flag(-12, -72, 12, 0x7dff6a);
    // canister racks by the pad, glowing green
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
    // the tower crane over the yard, the old site office, floodlights
    towerCrane(k, -50, -18, 30, 26, YEL, { speed: 0.1, phase: 0.6 });
    cabin(k, -64, -46, 16, 8, 5, 0x8a8aa0, Math.atan2(64, 46), { trim: blue });
    floodMast(k, 26, 22, 14); floodMast(k, -24, -24, 14); floodMast(k, 50, -60, 14); floodMast(k, -60, 20, 14);
    // site clutter
    for (const [x, z, c] of [[8, 34, 0x9a6a3a], [10, 36.5, 0x4f5a42], [6, 37.5, 0x9a6a3a]]) crate(k, x, 0, z, 1.4, c, x * 0.3);
    world.pad(loc, 70, 50, 12);
  });
}

// =============================================================================================
// Meridian Exchange: the trade HQ. A stepped glass trading tower wearing a price ticker, four
// sawtooth warehouses with docks, a container yard under a travelling gantry crane, two tower
// cranes, the lab dome and the pads.
// =============================================================================================
export function buildMeridian(world, loc) {
  settle(world, loc, 4409, (k, ctx) => {
    const blue = 0x2ec4ff, cols = [0x2ec4ff, 0xff9f1c, 0x7dff6a, 0xff3b5c, 0xffd23f, 0xc77dff];
    // layout: plaza at the centre, the trading tower south of it, the lab dome north, warehouses
    // out on the four corners (docks along the ring, not at each other), cranes in the gaps
    const TZ = -42;
    // the trading tower: three stepped octagonal tiers of glass and white bands (1.5x the old one,
    // set further back off the plaza)
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
    // the ticker rides on a round collar wider than the tier below it (the old drum hugged an
    // octagon whose corners poked through it), under a canopy back to the second tier
    const TY = tierTop[0];
    k.at(0, TZ);
    k.cyl(19.6, 19.6, 0.9, 48, T(blue), 0, TY, 0, { outline: 0.06 });
    k.add(new THREE.RingGeometry(13.9, 20.0, 48, 1).rotateX(-Math.PI / 2), T(blue), 0, TY + 3.75, 0, { outline: 0 });
    k.add(new THREE.RingGeometry(13.9, 20.0, 48, 1).rotateX(Math.PI / 2), T(0x1b3a8f), 0, TY + 3.7, 0, { outline: 0 });
    k.at();
    ticker(k, 0, TY + 1.0, TZ, 19.8, 2.6, 'MERIDIAN COMPOSITE ▲ 1,204.5 | HE-3 ▲ 412.70 | WATER ICE ▲ 19.95 | KEPLER BONDS ▼ 98.10 | VOSTOK SCRAP ▼ 12.40 | DAEDALUS PHASE-TECH ▲ 777.00', { fg: '#ffd23f', speed: 0.014 });
    // the entrance: a columned portico on the plaza side, steps up to it, glass doors and the
    // exchange's name over them, banners either side
    {
      const fz = 16.6; // the front face of the bottom tier (an octagon's flat side faces the plaza)
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
      // the doors: a bronze frame, four glass leaves, a lit transom
      k.box(9.5, 7.4, 0.4, T(0x8a5a3a), 0, 1.6, fz + 0.15, { outline: 0.04 });
      for (let i = 0; i < 4; i++) k.box(2.0, 5.6, 0.2, G(0xbfe9ff), -3.3 + i * 2.2, 1.9, fz + 0.4, { outline: 0 });
      for (let i = 0; i < 5; i++) k.box(0.18, 5.8, 0.25, T(0x8a5a3a), -4.4 + i * 2.2, 1.8, fz + 0.45, { outline: 0 });
      k.box(9.0, 1.0, 0.2, G(WARM), 0, 7.7, fz + 0.4, { outline: 0 });
      // banners on poles, and a pair of lamps at the foot of the steps
      for (const sx of [-1, 1]) {
        k.cyl(0.12, 0.14, 12, 6, T(DARK), sx * 11.5, 0, fz + 6, { outline: 0.02 });
        k.box(2.2, 6, 0.1, T(blue), sx * 11.5 + sx * 1.15, 5.4, fz + 6, { outline: 0.03 });
        k.box(2.2, 0.6, 0.12, T(YEL), sx * 11.5 + sx * 1.15, 6.4, fz + 6, { outline: 0 });
      }
      k.at();
      k.lamp(-11, TZ + fz + 10.5, 6); k.lamp(11, TZ + fz + 10.5, 6);
    }
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
    // four warehouses on the corners, docks facing along the ring
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      warehouse(k, Math.cos(a) * 86, Math.sin(a) * 86, 34, 18, 10, 0xd8d4e8, -a, blue);
    }
    // container yard under a travelling gantry crane
    const yx = -5, yz = -100;
    k.at(yx, yz);
    k.box(62, 0.3, 30, T(0x6b6880), 0, 0, 0, { outline: 0.04 });
    for (const s of [-1, 1]) k.box(64, 0.3, 0.6, T(STEEL), 0, 0.3, s * 15, { outline: 0 });
    for (let i = 0; i < 18; i++) {
      const cx = -25 + (i % 6) * 10, cz = -6 + Math.floor(i / 6) * 6;
      const hgt = 1 + ((i * 7) % 3);
      for (let j = 0; j < hgt; j++) container(k, cx, 0.3 + j * 2.62, cz, cols[(i + j) % cols.length], Math.PI / 2);
      k.solid(3.2, (hgt * 2.62) / 2, 1.4, cx, cz, 0, 0.3);
    }
    k.at();
    const gantry = part(YEL, (q) => {
      for (const s of [-1, 1]) {
        for (const t of [-1, 1]) q.beam([t * 2.4, 0.6, s * 15], [t * 1.2, 15, s * 15], 0.45, T(YEL), { outline: 0.05 });
        q.box(5.6, 1.2, 2, T(DARK), 0, 0, s * 15, { outline: 0.04 });
        q.box(3, 0.8, 1.2, T(YEL), 0, 6, s * 15, { outline: 0 });
      }
      q.box(2.2, 1.6, 33, T(YEL), 0, 15, 0, { outline: 0.06 });
      q.box(2.6, 2.2, 2.6, T(WHITE), 0, 12.6, 13, { outline: 0.04 });
      q.box(2.64, 0.8, 2.64, G(0xcfefff), 0, 13.6, 13, { outline: 0 });
      q.blinker(0, 17, -15, 0xffd23f, 0.3);
      q.blinker(0, 17, 15, 0xffd23f, 0.3);
    });
    const trolley = new THREE.Group();
    trolley.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 1, 2.6), T(DARK)));
    const spreader = part(YEL, (q) => {
      q.box(2.8, 0.5, 6.4, T(YEL), 0, -0.25, 0, { outline: 0.04 });
      container(q, 0, -3.2, 0, 0xff3b5c, 0);
    });
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 4).translate(0, -0.5, 0), T(DARK));
    trolley.add(cab, spreader);
    gantry.add(trolley);
    gantry.userData.tick = (o, dt, t) => {
      o.position.x = yx + Math.sin(t * 0.07) * 24;
      trolley.position.set(0, 15, Math.sin(t * 0.21) * 10);
      const drop = 3 + 6 * (0.5 + 0.5 * Math.sin(t * 0.33));
      cab.scale.y = drop; spreader.position.y = -drop;
    };
    k.dyn(gantry, yx, 0.3, yz);
    // two tower cranes (the old ones, now lattice and slewing)
    towerCrane(k, -78, 6, 34, 30, YEL, { speed: 0.09, phase: 0 });
    towerCrane(k, 78, -6, 34, 30, YEL, { speed: 0.11, phase: 2.2 });
    // the lab dome, a plaza with benches and lamps, signage
    habDome(k, 0, 60, 22, 0x9be7ff, { door: Math.PI, trim: blue });
    k.at(0, 6);
    k.cyl(10, 10.4, 0.25, 32, T(0xd8d4e8), 0, 0, 0, { outline: 0.04 });
    k.ring(10.2, 0.15, T(blue), 0, 0.25, 0);
    k.cyl(1.6, 2, 3.2, 10, T(blue), 0, 0, 0, { outline: 0.05 });
    k.ball(1.4, G(0xbfe9ff), 0, 4.2, 0, { outline: 0 });
    k.column(2, 3.4, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      k.box(2.6, 0.5, 0.8, T(0x8a5a3a), Math.cos(a) * 7.5, 0.5, Math.sin(a) * 7.5, { ry: -a + Math.PI / 2, outline: 0.03 });
    }
    k.at();
    k.sign('MERIDIAN EXCHANGE', 0, 120, { w: 18, y: 6, fg: '#2ec4ff', ry: Math.PI });
    k.lamp(14, 16, 8); k.lamp(-14, 16, 8); k.lamp(16, -4, 8); k.lamp(-16, -4, 8);
    floodMast(k, 30, -84, 14); floodMast(k, -40, -84, 14);
    world.pad(loc, 100, 60, 16, 0x2ec4ff);
    world.pad(loc, -100, -60, 16, 0x2ec4ff);
    world.flag(loc, 0, 110, [0x2ec4ff, 0xffffff, 0x2ec4ff], 20);
  });
}

// ---------------------------------------------------------------------------------------------
// skateable shapes: a visible solid plus tilted box colliders whose top faces are the riding
// surface (anything under ~55 degrees counts as ground in physics.stepSkater)
// ---------------------------------------------------------------------------------------------

// Collider slab whose top surface runs from A (x, y, z) to B, w wide (settlement frame).
function slope(world, loc, A, B, w, thick = 0.5, extra = {}) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  const run = Math.hypot(dx, dz), len = Math.hypot(run, dy);
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, run);
  const n = [Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw)];
  const c = world.col(loc, {
    type: 'box', hx: w / 2, hy: thick, hz: len / 2, yaw, pitch,
    x: (A[0] + B[0]) / 2 - n[0] * thick, y: (A[1] + B[1]) / 2 - n[1] * thick, z: (A[2] + B[2]) / 2 - n[2] * thick,
  });
  Object.assign(c, extra);
  return c;
}

// A kicker: a wedge rising towards local +z (len long, h high at the lip, w wide) with deck
// stripes, glowing side rails and a coping bar.
function kicker(world, loc, k, x, z, yaw, len, h, w, color) {
  const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, h)]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2).rotateY(-Math.PI / 2);
  k.at(x, z, yaw);
  k.add(geo, T(color), 0, 0, 0, { outline: 0.1 });
  const ang = Math.atan2(h, len);
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    k.add(new THREE.BoxGeometry(w + 0.04, 0.06, 0.5), T(YEL), 0, h * t + 0.04, len * t, { rx: -ang, outline: 0 });
  }
  k.add(new THREE.CylinderGeometry(0.16, 0.16, w + 0.2, 8).rotateZ(Math.PI / 2), T(LIGHT), 0, h + 0.05, len - 0.1, { outline: 0.03 });
  for (const s of [-1, 1]) k.beam([s * (w / 2 + 0.1), 0.2, 0.4], [s * (w / 2 + 0.1), h + 0.2, len - 0.2], 0.08, G(color === YEL ? 0x2ee6ff : YEL), { outline: 0 });
  k.at();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (lz, y) => [x + s * lz, y, z + c * lz];
  slope(world, loc, P(-0.6, 0), P(len, h), w);
  world.col(loc, { type: 'box', x: x + s * (len - 0.3), y: h / 2, z: z + c * (len - 0.3), hx: w / 2, hy: h / 2, hz: 0.3, yaw });
}

// the gored shapes are outlined by one shell that draws nothing itself (only its ink hull shows)
let _inkShell = null;
function inkShell() {
  if (!_inkShell) _inkShell = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return _inkShell;
}

// Inflatable bounce dome: alternating coloured gores, a puffy base tube, tethers and a valve.
function bounceDome(world, loc, k, x, z, r, c1, c2) {
  k.at(x, z);
  const n = 10;
  for (let i = 0; i < n; i++) k.add(new THREE.SphereGeometry(r, 4, 10, (i / n) * TAU, TAU / n, 0, Math.PI / 2), T(i % 2 ? c1 : c2), 0, -0.4, 0, { outline: 0 });
  k.add(new THREE.SphereGeometry(r * 1.003, 20, 10, 0, TAU, 0, Math.PI / 2), inkShell(), 0, -0.4, 0, { outline: 0.25 });
  k.add(new THREE.TorusGeometry(r * 0.98, Math.max(0.6, r * 0.06), 8, 28), T(c2), 0, 0.3, 0, { rx: Math.PI / 2, outline: 0.08 });
  k.ring(r * 0.72, r * 0.05, T(WHITE), 0, r * 0.66, 0);
  k.cyl(r * 0.08, r * 0.1, r * 0.08, 10, T(WHITE), 0, r - 0.6, 0, { outline: 0.04 });
  k.ball(r * 0.05, G(YEL), 0, r - 0.4 + r * 0.08, 0, { outline: 0 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const stake = [Math.cos(a) * (r + 3), 0, Math.sin(a) * (r + 3)];
    k.beam([Math.cos(a) * r * 0.7, r * 0.7, Math.sin(a) * r * 0.7], stake, 0.05, T(DARK), { outline: 0 });
    k.cyl(0.18, 0.12, 0.7, 5, T(YEL), stake[0], 0, stake[2], { outline: 0.02 });
  }
  k.at();
  world.col(loc, { type: 'sphere', x, y: -0.5, z, r }).bouncy = true;
}

// =============================================================================================
// Bounce Dome Funpark: the inflatables, now joined by a skate park (a volcano bowl you drop into,
// a kicker line ending in a big launch off the plateau, a big half-pipe and a pyramid funbox), a ferris wheel, a carousel, trampolines and an entrance arch strung with lights.
// =============================================================================================
export function buildFunpark(world, loc) {
  const cols = [0xff2e88, 0xffd23f, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff];
  settle(world, loc, 5507, (k) => {
    // ---- the inflatables ----
    [[0, 0, 26], [-50, 30, 18], [20, -60, 20], [-40, -50, 14], [-80, -10, 12]].forEach(([x, z, r], i) => bounceDome(world, loc, k, x, z, r, cols[i % 6], cols[(i + 2) % 6]));
    // bouncy castle: puffy walls, four turrets, crenellations and an arched way in
    k.at(0, 70);
    k.box(24, 1.2, 24, T(0x2ee6ff), 0, 0, 0, { outline: 0.12 });
    k.box(22, 5, 22, T(0xff2e88), 0, 1.2, 0, { outline: 0.2 });
    for (let i = -4; i <= 4; i++) {
      if (!(i % 2)) continue;
      for (const [fx, fz, ry] of [[i * 2.4, 11, 0], [i * 2.4, -11, 0], [11, i * 2.4, Math.PI / 2], [-11, i * 2.4, Math.PI / 2]]) k.add(new THREE.CapsuleGeometry(0.7, 1.2, 4, 8), T(YEL), fx, 7.2, fz, { ry, outline: 0.05 });
    }
    for (const [tx, tz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
      k.cyl(2.4, 2.6, 10, 14, T(YEL), tx, 0, tz, { outline: 0.1 });
      k.add(new THREE.ConeGeometry(3, 4.5, 14), T(0x2ee6ff), tx, 12.2, tz, { outline: 0.08 });
      k.ball(0.6, G(0xff2e88), tx, 14.8, tz, { outline: 0 });
      world.col(loc, { type: 'cyl', x: tx, z: 70 + tz, y0: -2, y1: 10, r: 2.6 }).bouncy = true;
    }
    k.add(new THREE.TorusGeometry(4, 1.0, 8, 16, Math.PI), T(YEL), 0, 1.2, -11.4, { outline: 0.08 });
    k.box(8, 0.8, 5, T(0x7dff6a), 0, 0, -14, { outline: 0.06 });
    k.at();
    world.col(loc, { type: 'box', x: 0, y: 3, z: 70, hx: 12, hy: 3.2, hz: 12 }).bouncy = true;
    // trampolines: a row of springy discs
    for (let i = 0; i < 4; i++) {
      const x = -34 + i * 8, z = -73 + (i % 2) * 4;
      k.at(x, z);
      k.cyl(3.2, 3.2, 0.9, 20, T(DARK), 0, 0, 0, { outline: 0.06 });
      k.add(new THREE.TorusGeometry(3.1, 0.35, 6, 20), T(cols[i]), 0, 0.95, 0, { rx: Math.PI / 2, outline: 0.04 });
      k.cyl(2.7, 2.7, 0.05, 20, T(0x1d1a29), 0, 0.92, 0, { outline: 0 });
      k.ring(1.2, 0.08, G(cols[i]), 0, 1.0, 0);
      k.at();
      world.col(loc, { type: 'cyl', x, z, y0: -2, y1: 0.95, r: 3.2 }).bouncy = true;
    }

    // ---- skate park ----
    // volcano bowl: ride up the outside, over the deck and drop in
    const bx = 148, bz = -4, r0 = 5, r1 = 11, r2 = 14, r3 = 26, H = 4.2;
    k.at(bx, bz);
    const lathe = (pts, c, o) => k.add(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 48), D(c), 0, 0, 0, { outline: o });
    lathe([[r3, 0], [r2, H]], 0x6d78c8, 0.15);
    lathe([[r2, H], [r1, H]], 0xe8e4f4, 0);
    lathe([[r1, H], [r0, 0.02]], 0xb8b2cc, 0);
    k.cyl(r0 + 0.2, r0 + 0.2, 0.06, 32, T(0xb0aac2), 0, 0, 0, { outline: 0 });
    k.add(new THREE.TorusGeometry(r1, 0.22, 6, 48), T(LIGHT), 0, H + 0.05, 0, { rx: Math.PI / 2, outline: 0.03 });
    k.add(new THREE.TorusGeometry(r2, 0.12, 4, 48), G(0xff2e88), 0, H + 0.05, 0, { rx: Math.PI / 2, outline: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, rm = (r1 + r0) / 2;
      k.add(new THREE.BoxGeometry(1.2, 0.05, (r1 - r0) * 1.1), T(cols[i % 6]), Math.sin(a) * rm, H / 2 + 0.06, Math.cos(a) * rm, { q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(H, r1 - r0), a, 0, 'YXZ')), outline: 0 });
    }
    k.at();
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, sa = Math.sin(a), ca = Math.cos(a);
      const at = (r, y) => [bx + sa * r, y, bz + ca * r];
      slope(world, loc, at(r0 - 0.8, 0), at(r1, H), (TAU * r1) / N + 0.6);
      slope(world, loc, at(r3 + 0.8, 0), at(r2, H), (TAU * r3) / N + 0.6);
      slope(world, loc, at(r1 - 0.2, H), at(r2 + 0.2, H), (TAU * r2) / N + 0.6);
    }
    // kicker line heading east: small, medium, then a big launch off the plateau edge
    // (the big one launches you clean over the Derby track)
    kicker(world, loc, k, 120, -52, Math.PI / 2, 6, 1.4, 5, 0x2ee6ff);
    kicker(world, loc, k, 134, -52, Math.PI / 2, 9, 2.8, 6, 0xff9f1c);
    kicker(world, loc, k, 151, -52, Math.PI / 2, 14, 5, 7, 0xff2e88);
    for (const x of [120, 136, 153]) k.lamp(x, -60, 7, 0xff7ad9);
    // half-pipe along the north-east: two matching walls facing each other across a flat bottom
    // (each a big quarter-pipe, ~7 m to the coping), with a deck, coloured tiles and a railing on top
    const hx0 = 106, hx1 = 152, hw = hx1 - hx0, hm = (hx0 + hx1) / 2, S = 1.35;
    const prof = [[0, 0], [2.2, 0.3], [4, 1.1], [5.4, 2.3], [6.3, 3.7], [6.8, 5.2]].map(([zz, y]) => [zz * S, y * S]);
    const topY = prof[prof.length - 1][1], lipZ = prof[prof.length - 1][0], deckZ = 9.5 * S;
    const flatZ0 = 46, flatZ1 = 60; // the flat bottom between the walls
    k.at(hm, (flatZ0 + flatZ1) / 2);
    k.box(hw, 0.06, flatZ1 - flatZ0 + 1, T(0x8a87c8), 0, 0, 0, { outline: 0 });
    for (let x = -hw / 2 + 4; x < hw / 2; x += 8) k.box(0.4, 0.07, flatZ1 - flatZ0 - 2, T(YEL), x, 0, 0, { outline: 0 });
    k.at();
    const wall = (z0, dir, color) => {
      // dir +1: the wall rises towards +z from z0; -1: towards -z (the local frame is turned round)
      k.at(hm, z0, dir > 0 ? 0 : Math.PI);
      const shape = new THREE.Shape([...prof.map(([zz, y]) => new THREE.Vector2(zz, y)), new THREE.Vector2(deckZ, topY), new THREE.Vector2(deckZ, 0)]);
      k.add(new THREE.ExtrudeGeometry(shape, { depth: hw, bevelEnabled: false }).translate(0, 0, -hw / 2).rotateY(-Math.PI / 2), T(color), 0, 0, 0, { outline: 0.12 });
      k.add(new THREE.CylinderGeometry(0.24, 0.24, hw, 8).rotateZ(Math.PI / 2), T(LIGHT), 0, topY + 0.05, lipZ + 0.05, { outline: 0.03 });
      for (let x = -hw / 2 + 3, i = 0; x <= hw / 2 - 3; x += 6, i++) {
        k.box(0.12, 1.2, 0.12, T(DARK), x, topY, deckZ - 0.2, { outline: 0 });
        k.box(1.3, 0.06, 3.2, T(cols[(i + (dir > 0 ? 0 : 3)) % 6]), x, topY + 0.01, (lipZ + deckZ) / 2, { outline: 0 });
      }
      k.box(hw, 0.12, 0.12, T(YEL), 0, topY + 1.2, deckZ - 0.2, { outline: 0.02 });
      // a glowing strip along the transition, so the line reads at night
      k.box(hw, 0.05, 0.25, G(dir > 0 ? 0x2ee6ff : 0xff2e88), 0, 0.32, 2.4, { rx: -0.2, outline: 0 });
      k.at();
      for (let i = 0; i < prof.length - 1; i++) {
        const [za, ya] = prof[i], [zb, yb] = prof[i + 1];
        slope(world, loc, [hm, ya, z0 + dir * (za - (i ? 0 : 0.8))], [hm, yb, z0 + dir * zb], hw);
      }
      slope(world, loc, [hm, topY, z0 + dir * lipZ], [hm, topY, z0 + dir * deckZ], hw);
      world.col(loc, { type: 'box', x: hm, y: topY / 2, z: z0 + dir * (deckZ - 1.2), hx: hw / 2, hy: topY / 2, hz: 1.2 });
    };
    wall(flatZ1, 1, 0x9be7ff);
    wall(flatZ0, -1, 0xc8b6ff);
    // stairs up to each deck at the west end
    for (const [z0, dir] of [[flatZ1, 1], [flatZ0, -1]]) {
      const zc = z0 + dir * (lipZ + deckZ) / 2;
      for (let i = 0; i < 6; i++) {
        const h = ((i + 1) / 6) * topY;
        k.at(hx0 - 1.2 - (6 - i) * 0.9, zc);
        k.box(0.9, h, 3, T(CONC), 0, 0, 0, { outline: 0.03 });
        k.at();
        world.col(loc, { type: 'box', x: hx0 - 1.2 - (6 - i) * 0.9, y: h / 2, z: zc, hx: 0.45, hy: h / 2, hz: 1.5 });
      }
    }
    // pyramid funbox: four ramps up to a flat top
    const fx = 100, fz = -32, top = 2.6, half = 3.5, run = 7;
    k.at(fx, fz);
    k.add(new THREE.CylinderGeometry(half * Math.SQRT2, (half + run) * Math.SQRT2, top, 4, 1).rotateY(Math.PI / 4), T(0xffd23f), 0, top / 2, 0, { outline: 0.12 });
    k.box(half * 2 + 0.1, 0.08, half * 2 + 0.1, T(0xff2e88), 0, top, 0, { outline: 0 });
    k.at();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU, sa = Math.sin(a), ca = Math.cos(a);
      slope(world, loc, [fx + sa * (half + run + 0.6), 0, fz + ca * (half + run + 0.6)], [fx + sa * half, top, fz + ca * half], half * 2 + 1);
    }
    world.col(loc, { type: 'box', x: fx, y: top - 0.5, z: fz, hx: half, hy: 0.5, hz: half });
    k.at(96, 30, -Math.PI / 2);
    k.sign('SKATE ZONE', 0, 0, { w: 9, y: 4.4, fg: '#ff2e88' });
    k.at();

    // ---- rides ----
    // ferris wheel: an A-frame, a big turning wheel with lit rims, open gondolas that hang level
    // (rideable: rides.js seats you in the nearest gondola)
    const wx = -40, wz = 62, hub = 27, R = 22; // (bottom gondola just clears the platform)
    k.at(wx, wz);
    k.box(16, 0.8, 10, T(CONC), 0, 0, 0, { outline: 0.06 });
    for (const s of [-1, 1]) for (const t of [-1, 1]) k.beam([t * 7, 0.8, s * 3.4], [0, hub, s * 1.4], 0.6, T(WHITE), { outline: 0.06 });
    for (const s of [-1, 1]) k.beam([-3.5, hub * 0.5, s * 2.4], [3.5, hub * 0.5, s * 2.4], 0.3, T(WHITE), { outline: 0.04 });
    k.beam([0, hub, -1.9], [0, hub, 1.9], 0.6, T(DARK), { outline: 0.04 });
    k.box(3, 2.6, 2.4, T(0xff2e88), 6, 0.8, 4.2, { outline: 0.05 });
    k.at();
    world.col(loc, { type: 'box', x: wx, y: 0.6, z: wz, hx: 8, hy: 0.6, hz: 5 });
    for (const t of [-1, 1]) world.col(loc, { type: 'cyl', x: wx + t * 5.5, z: wz, y0: -2, y1: 8, r: 1.1 });
    const wheel = part(0xff2e88, (q) => {
      for (const s of [-1, 1]) {
        q.add(new THREE.TorusGeometry(R, 0.3, 6, 40), T(0xff2e88), 0, 0, s * 1.0, { outline: 0.04 });
        q.add(new THREE.TorusGeometry(R * 0.55, 0.18, 4, 28), T(YEL), 0, 0, s * 1.0, { outline: 0 });
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * TAU;
          q.beam([0, 0, s * 1.0], [Math.cos(a) * R, Math.sin(a) * R, s * 1.0], 0.1, T(WHITE), { outline: 0 });
          q.ball(0.32, G(cols[i % 6]), Math.cos(a) * R, Math.sin(a) * R, s * 1.4, { outline: 0 });
        }
      }
      q.add(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 14).rotateX(Math.PI / 2), T(YEL), 0, 0, 0, { outline: 0.05 });
    });
    const gondolas = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const g = part(cols[i % 6], (q) => {
        // an open basket under a little canopy on posts, so you can see who's riding
        q.beam([0, 0, 0], [0, -1.4, 0], 0.06, T(DARK), { outline: 0 });
        q.add(new THREE.CylinderGeometry(1.15, 0.95, 0.9, 12, 1, true), D(cols[i % 6]), 0, -3.0, 0, { outline: 0.04 });
        q.cyl(1.0, 0.95, 0.2, 12, T(DARK), 0, -3.55, 0, { outline: 0 });
        q.add(new THREE.TorusGeometry(1.15, 0.08, 4, 16).rotateX(Math.PI / 2), T(YEL), 0, -2.55, 0, { outline: 0 });
        for (let p = 0; p < 3; p++) { const b = (p / 3) * TAU; q.beam([Math.cos(b) * 1.05, -2.55, Math.sin(b) * 1.05], [Math.cos(b) * 1.05, -1.5, Math.sin(b) * 1.05], 0.05, T(WHITE), { outline: 0 }); }
        q.add(new THREE.ConeGeometry(1.35, 0.8, 12), T(WHITE), 0, -1.1, 0, { outline: 0.03 });
      });
      g.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      wheel.add(g);
      gondolas.push(g);
    }
    wheel.userData.tick = (o, dt) => {
      o.rotation.z += dt * 0.12;
      for (const g of gondolas) g.rotation.z = -o.rotation.z;
    };
    k.dyn(wheel, wx, hub, wz);
    const P0 = new THREE.Vector3(), P1 = new THREE.Vector3();
    world.rides.push({
      loc, name: 'FERRIS WHEEL', camDist: 16,
      seats: gondolas.map((g) => ({ obj: g, local: new THREE.Vector3(0, -3.35, 0), face: new THREE.Vector3(0, 0, 1) })),
      // step off sideways, out of the wheel's plane
      exitDir: (p, out) => { wheel.updateMatrixWorld(true); wheel.localToWorld(P0.set(0, 0, 0)); wheel.localToWorld(P1.set(0, 0, 1)); return out.subVectors(P1, P0).normalize(); },
    });
    // carousel: striped canopy, rotating deck, horses bobbing on poles
    const cx = -58, cz = -22;
    k.at(cx, cz);
    k.cyl(8.6, 9, 0.7, 24, T(DARK), 0, 0, 0, { outline: 0.06 });
    k.cyl(0.6, 0.6, 7.4, 10, T(YEL), 0, 0.7, 0, { outline: 0.04 });
    k.at();
    world.col(loc, { type: 'cyl', x: cx, z: cz, y0: -2, y1: 0.7, r: 9 });
    world.col(loc, { type: 'cyl', x: cx, z: cz, y0: 0, y1: 8, r: 1.4 });
    const carousel = part(0xff2e88, (q) => {
      q.cyl(8, 8, 0.3, 24, T(WHITE), 0, 0, 0, { outline: 0.04 });
      for (let i = 0; i < 12; i++) q.add(new THREE.ConeGeometry(9.6, 3.2, 2, 1, true, (i / 12) * TAU, TAU / 12), D(i % 2 ? 0xff2e88 : WHITE), 0, 8.9, 0, { outline: 0 });
      q.add(new THREE.ConeGeometry(9.65, 3.25, 24, 1, true), inkShell(), 0, 8.9, 0, { outline: 0.12 });
      q.ring(9.4, 0.2, T(YEL), 0, 7.3, 0);
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; q.ball(0.18, G(cols[i % 6]), Math.cos(a) * 9.5, 7.1, Math.sin(a) * 9.5, { outline: 0 }); }
      q.ball(0.6, G(YEL), 0, 10.8, 0, { outline: 0 });
    });
    const horses = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const h = part(cols[i % 6], (q) => {
        q.beam([0, -1.6, 0], [0, 5, 0], 0.06, T(YEL), { outline: 0 });
        q.add(new THREE.CapsuleGeometry(0.45, 1.4, 4, 8).rotateZ(Math.PI / 2), T(WHITE), 0, 0, 0, { outline: 0.04 });
        q.add(new THREE.CapsuleGeometry(0.25, 0.7, 4, 6), T(WHITE), 0.85, 0.5, 0, { rz: -0.6, outline: 0.03 });
        q.box(0.5, 0.35, 0.3, T(WHITE), 1.15, 0.85, 0, { outline: 0.02 });
        q.box(0.8, 0.15, 0.7, T(cols[i % 6]), -0.1, 0.45, 0, { outline: 0 });
        for (const [lx, lz] of [[-0.6, -0.2], [-0.6, 0.2], [0.6, -0.2], [0.6, 0.2]]) q.beam([lx, -0.2, lz], [lx * 1.2, -0.9, lz], 0.1, T(WHITE), { outline: 0 });
      });
      h.position.set(Math.cos(a) * 6, 1.6, Math.sin(a) * 6);
      h.rotation.y = -a;
      carousel.add(h);
      horses.push(h);
    }
    carousel.userData.tick = (o, dt, t) => {
      o.rotation.y += dt * 0.5;
      horses.forEach((h, i) => { h.position.y = 1.6 + Math.sin(t * 2 + i * 1.3) * 0.5; });
    };
    k.dyn(carousel, cx, 0.7, cz);
    const C0 = new THREE.Vector3();
    world.rides.push({
      loc, name: 'CAROUSEL', camDist: 9,
      seats: horses.map((h) => ({ obj: h, local: new THREE.Vector3(-0.1, -0.05, 0), face: new THREE.Vector3(1, 0, 0) })),
      // hop off outward, away from the centre pole
      exitDir: (p, out) => {
        carousel.updateMatrixWorld(true);
        carousel.localToWorld(C0.set(0, 0, 0));
        const up = p.clone().normalize();
        out.subVectors(p, C0);
        return out.addScaledVector(up, -out.dot(up)).normalize();
      },
    });

    // ---- entrance: a banner arch spanning the Derby track, ticket booth, strings of lights ----
    k.at(Math.cos(Math.PI / 4) * 99, Math.sin(Math.PI / 4) * 99, Math.PI / 4);
    for (const s of [-1, 1]) {
      k.cyl(1.6, 2, 12, 10, T(0xff2e88), s * 17, 0, 0, { outline: 0.08 });
      k.add(new THREE.ConeGeometry(2.2, 3, 10), T(YEL), s * 17, 13.5, 0, { outline: 0.06 });
      k.column(2, 12, s * 17, 0);
    }
    k.add(new THREE.TorusGeometry(17, 0.8, 8, 32, Math.PI), T(0x2ee6ff), 0, 9, 0, { outline: 0.1 });
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; k.ball(0.4, G(cols[i % 6]), Math.cos(a) * 17, 9 + Math.sin(a) * 17, -0.9, { outline: 0 }); }
    // the banner hangs on two cables inside the arch, clear of the hoop
    const bh = k.text('BOUNCE DOME FUNPARK', 0, 15.5, 0, 0, 15, { fg: '#ffd23f', bg: '#ff2e88' });
    k.box(15.6, bh + 0.6, 0.2, T(0xff2e88), 0, 15.5 - bh / 2 - 0.3, 0, { outline: 0.04 });
    for (const s of [-1, 1]) k.beam([s * 6.5, 15.5 + bh / 2 + 0.3, 0], [s * 6.5, 9 + Math.sqrt(16.2 * 16.2 - 6.5 * 6.5), 0], 0.06, T(DARK), { outline: 0 });
    k.box(3.4, 3, 2.6, T(YEL), -12, 0, -5, { outline: 0.06 });
    k.box(3.6, 0.4, 2.8, T(0xff2e88), -12, 3, -5, { outline: 0.04 });
    k.box(2.2, 1, 0.1, G(WARM), -12, 1.6, -6.32, { outline: 0 });
    k.solid(1.8, 1.7, 1.4, -12, -5);
    k.at();
    lightString(k, [[-31, 6, 50], [-4, 6, 55], [14, 6, 52]], cols, 10, 1.2);
    lightString(k, [[118, 6, -40], [140, 6, -40], [162, 6, -38]], cols, 10, 1.2);
    for (const [x, z] of [[-31, 50], [-4, 55], [14, 52], [118, -40], [140, -40], [162, -38]]) k.cyl(0.15, 0.2, 6, 6, T(DARK), x, 0, z, { outline: 0.03 });
    for (const [x, z] of [[-20, -20], [30, 20], [-4, 36], [40, -30], [-62, 48], [-66, 10], [116, 0], [96, 53]]) k.lamp(x, z, 7, 0xff7ad9);
  });
}

// =============================================================================================
// Dr. Zbornak's lab, outside: the hall itself stays in world.buildLab (you walk into it); this
// dresses it with ribbed walls, fake windows, a hazard-striped doorway under a lit canopy, roof
// fans that spin, a crackling Tesla coil, a reactor flue that pulses, gas racks, barrels, a
// generator, a giant specimen jar on a plinth, and a proper holding-pen yard.
// =============================================================================================
export function dressLab(world, loc, { W, D, H }) {
  settle(world, loc, 6607, (k) => {
    const lime = 0x7dff3a, pink = 0xff2e88, wall = 0xe8e4f4;
    // pilasters, a plinth and fake windows round the hall
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
      // conduit pipes climbing the side walls to the roof
      k.beam([sx * (W + 1.5), 0.4, -D + 2], [sx * (W + 1.5), H + 1, -D + 2], 0.3, T(LIGHT), { outline: 0.03 });
      k.beam([sx * (W + 1.5), 0.4, D - 3], [sx * (W + 1.5), H + 1, D - 3], 0.3, T(0x9be7ff), { outline: 0.03 });
    }
    // doorway: hazard-striped frame, canopy with lights, a mat and two warning beacons
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
    // roof: parapet, two spinning cooling fans, vent stacks, a flue over the reactor, the Tesla coil
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
    // the reactor flue: a squat chimney over the tube, its glow ring breathing
    k.cyl(4.2, 4.6, 3, 20, T(DARK), -2, roofY, -3, { outline: 0.08 });
    k.cyl(3.4, 3.8, 2.2, 20, T(LIGHT), -2, roofY + 3, -3, { outline: 0.05 });
    const flue = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.3, 6, 28).rotateX(Math.PI / 2), glow(pink));
    flue.userData.tick = (o, dt, t) => { const s = 1 + Math.sin(t * 3.1) * 0.06 + (Math.sin(t * 17) > 0.97 ? 0.15 : 0); o.scale.set(s, 1, s); };
    k.dyn(flue, -2, roofY + 4.4, -3);
    k.solid(4.6, 2.6, 4.6, -2, -3, 0, roofY);
    // Tesla coil: a stack of rings under a glowing torus, with sparks that flicker on and off
    const cx = -14, cz = 8;
    k.cyl(1.4, 1.8, 1, 12, T(DARK), cx, roofY, cz, { outline: 0.04 });
    k.cyl(0.6, 0.7, 7, 10, T(0xb87333), cx, roofY + 1, cz, { outline: 0.04 });
    for (let i = 0; i < 7; i++) k.ring(0.75, 0.08, T(0xd8a060), cx, roofY + 1.5 + i * 0.9, cz);
    k.add(new THREE.TorusGeometry(2, 0.6, 10, 24).rotateX(Math.PI / 2), T(LIGHT), cx, roofY + 8.4, cz, { outline: 0.05 });
    k.ring(2.05, 0.2, G(0xc77dff), cx, roofY + 8.4, cz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const spark = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 4.5, 4).translate(0, 2.25, 0), glow(0xe8d8ff));
      spark.rotation.set(0, 0, 0);
      spark.userData.tick = (o, dt, t) => {
        o.visible = Math.sin(t * 23 + i * 2.1) * Math.sin(t * 7.3 + i) > 0.55;
        o.rotation.set(Math.sin(t * 31 + i) * 0.8, a, 1.2 + Math.sin(t * 19 + i * 3) * 0.4);
      };
      k.dyn(spark, cx + Math.cos(a) * 2, roofY + 8.4, cz + Math.sin(a) * 2);
    }
    k.solid(1.8, 4.5, 1.8, cx, cz, 0, roofY);
    // antenna mast and a rooftop tank
    k.cyl(0.12, 0.2, 9, 6, T(DARK), 18, roofY, -13, { outline: 0.03 });
    for (let i = 1; i <= 3; i++) k.box(2.6 - i * 0.5, 0.1, 0.1, T(lime), 18, roofY + i * 2.4, -13, { ry: i, outline: 0 });
    k.blinker(18, roofY + 9.4, -13, 0xff2a4a, 0.35);
    k.cyl(2.2, 2.2, 3.2, 16, T(LIGHT), 6, roofY, -10, { outline: 0.06 });
    k.add(new THREE.SphereGeometry(2.2, 16, 6, 0, TAU, 0, Math.PI / 2), T(LIGHT), 6, roofY + 3.2, -10, { outline: 0.04 });
    k.ring(2.25, 0.15, G(lime), 6, roofY + 2.2, -10);
    k.solid(2.2, 2.6, 2.2, 6, -10, 0, roofY);
    // outside: a gas-cylinder rack, hazard barrels, a generator, cable spools
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
    }
    // the giant specimen jar by the door: a plinth, a glass jar, a glowing thing inside, a brass lid
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
    // the label: a flat brass-rimmed plaque standing proud of the round plinth, so the text can't
    // sink into the curve
    k.box(4.6, 1.3, 0.3, T(DARK), jx, 0.2, jz + 2.95, { outline: 0.05 });
    k.box(4.8, 0.14, 0.36, T(0xd8a060), jx, 1.5, jz + 2.95, { outline: 0 });
    k.text('SPECIMEN #1', jx, 1.12, jz + 3.1, 0, 2.6, { fg: '#7dff3a', bg: '#10241a', back: false, off: 0.02 });
    k.text('DO NOT TAP GLASS', jx, 0.62, jz + 3.1, 0, 3.6, { fg: '#ffd23f', bg: '#10241a', back: false, off: 0.02 });
    // holding-pen yard: a gravel pad, a feeding trough, a floodlight on each corner
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
// The Monolith: the slab itself stays in world.buildMonolith; around it now, a survey dig:
// a trampled berm, floodlight tripods aimed at it, a scaffold, the researchers' tent and
// generator, a laser theodolite, glyph lines in the dust, and black shards circling it.
// =============================================================================================
export function dressMonolith(world, loc) {
  settle(world, loc, 7703, (k) => {
    const vio = 0xc77dff;
    // a low ring berm of dug-out regolith (open on the approach side)
    for (let i = 0; i < 26; i++) {
      const a = (i / 30) * TAU + 0.5;
      k.add(new THREE.SphereGeometry(2.6, 8, 5, 0, TAU, 0, Math.PI / 2), T(0x9a92a8), Math.cos(a) * 24, -0.6, Math.sin(a) * 24, { outline: 0.06 });
      k.sphere(2.6, Math.cos(a) * 24, -0.6, Math.sin(a) * 24);
    }
    // glyph lines radiating through the dust, and a carved ring
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13;
      k.box(0.25, 0.04, 9 + (i % 3) * 3, G(vio), Math.cos(a) * 9, 0.03, Math.sin(a) * 9, { ry: -a + Math.PI / 2, outline: 0 });
    }
    k.ring(6, 0.12, G(vio), 0, 0.05, 0);
    // floodlight tripods aimed at the slab
    for (const a of [0.6, 2.3, 4.0, 5.3]) {
      const x = Math.cos(a) * 15, z = Math.sin(a) * 15;
      k.at(x, z, Math.atan2(-x, -z));
      for (let j = 0; j < 3; j++) { const b = (j / 3) * TAU; k.beam([Math.sin(b) * 1.4, 0, Math.cos(b) * 1.4], [0, 5, 0], 0.07, T(DARK), { outline: 0.02 }); }
      k.box(1.4, 1, 0.9, T(LIGHT), 0, 5, 0, { rx: -0.25, outline: 0.04 });
      k.box(1.2, 0.8, 0.1, G(0xfffbe0), 0, 5.12, 0.47, { rx: -0.25, outline: 0 });
      k.at();
    }
    // scaffold tower on one side of the slab, with a platform level with its top
    k.at(5.5, -2.5);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam([sx * 1.5, 0, sz * 1.5], [sx * 1.5, 24, sz * 1.5], 0.1, T(YEL), { outline: 0.02 });
    for (let y = 4; y <= 24; y += 4) {
      for (const [a, b] of [[[-1.5, -1.5], [1.5, -1.5]], [[1.5, -1.5], [1.5, 1.5]], [[1.5, 1.5], [-1.5, 1.5]], [[-1.5, 1.5], [-1.5, -1.5]]]) k.beam([a[0], y, a[1]], [b[0], y, b[1]], 0.07, T(YEL), { outline: 0 });
      k.beam([-1.5, y - 4, -1.5], [1.5, y, -1.5], 0.05, T(DARK), { outline: 0 });
    }
    k.box(3.4, 0.2, 3.4, T(0x8a5a3a), 0, 24, 0, { outline: 0.03 });
    k.box(3.4, 0.2, 3.4, T(0x8a5a3a), 0, 12, 0, { outline: 0.03 });
    k.solid(1.7, 12.2, 1.7, 0, 0);
    k.at();
    // researchers' tent, generator, crates and a laser theodolite with its beam on the slab
    k.at(-16, 9, 0.8);
    k.add(prism(7, 5, 3.6), T(0xff9f1c), 0, 0, 0, { outline: 0.08 });
    k.box(0.1, 2.4, 1.8, T(0x2a2540), 3.55, 0, 0, { outline: 0 });
    k.box(0.4, 0.2, 0.1, G(WARM), 3.56, 2.6, 0, { outline: 0 });
    k.solid(3.5, 1.8, 2.5, 0, 0);
    k.at();
    for (const [x, z, c] of [[-10, 15, 0x9a6a3a], [-9, 13.4, 0x4f5a42], [-11.4, 14, 0x9a6a3a]]) crate(k, x, 0, z, 1.1, c, x);
    k.at(-17, -6, 0.4);
    k.box(2.4, 1.6, 1.4, T(YEL), 0, 0, 0, { outline: 0.05 });
    k.cyl(0.15, 0.2, 1, 6, T(DARK), 0.7, 1.6, 0, { outline: 0.02 });
    k.solid(1.2, 0.8, 0.7, 0, 0);
    k.at();
    k.at(12, 10);
    for (let j = 0; j < 3; j++) { const b = (j / 3) * TAU; k.beam([Math.sin(b) * 0.8, 0, Math.cos(b) * 0.8], [0, 1.6, 0], 0.05, T(DARK), { outline: 0 }); }
    k.box(0.6, 0.5, 0.8, T(0xff9f1c), 0, 1.6, 0, { outline: 0.03 });
    k.at();
    const beamLen = Math.hypot(12, 10) - 1.2;
    k.add(new THREE.CylinderGeometry(0.04, 0.04, beamLen, 4).rotateZ(Math.PI / 2), G(0xff2a4a), 6, 1.85, 5, { ry: Math.atan2(10, -12) + Math.PI, outline: 0 });
    k.at(-4, 22, Math.PI);
    k.sign('DO NOT TOUCH. SERIOUSLY.', 0, 0, { w: 10, y: 3, fg: '#c77dff' });
    k.at();
    // black shards circling the slab, each with a violet edge, at different heights and speeds
    for (let i = 0; i < 9; i++) {
      const shard = new THREE.Group();
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + (i % 3) * 0.3, 0), new THREE.MeshBasicMaterial({ color: 0x050308 }));
      s.scale.set(0.6, 1.8, 0.6);
      const edge = new THREE.Mesh(s.geometry, new THREE.MeshBasicMaterial({ color: vio, side: THREE.BackSide }));
      edge.scale.setScalar(1.15);
      s.add(edge);
      shard.add(s);
      const r = 6 + (i % 4) * 1.6, h = 4 + i * 2.3, w = (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.08), ph = i * 0.7;
      shard.userData.tick = (o, dt, t) => {
        const a = ph + t * w;
        s.position.set(Math.cos(a) * r, h + Math.sin(t * 0.8 + i) * 0.8, Math.sin(a) * r);
        s.rotation.set(t * 0.5 + i, t * 0.7, 0);
      };
      k.dyn(shard, 0, 0, 0);
    }
  });
}

// Ribbed connector tunnel between two ground points (radius r), with a lit window strip.
export function tunnel(world, loc, k, ax, az, bx, bz, r = 1.6, color = WHITE) {
  const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
  k.at((ax + bx) / 2, (az + bz) / 2, yaw);
  k.add(new THREE.CylinderGeometry(r, r, len, 14).rotateX(Math.PI / 2), T(color), 0, r * 0.8, 0, { outline: 0.1 });
  for (let t = -len / 2 + 1.5; t < len / 2 - 1; t += 3) k.add(new THREE.TorusGeometry(r + 0.06, 0.14, 4, 16), T(PANEL), 0, r * 0.8, t, { outline: 0 });
  for (const s of [-1, 1]) k.box(0.1, 0.4, len - 1, G(WARM), s * r * 0.93, r * 1.15, 0, { rz: s * 0.5, outline: 0 });
  k.box(r * 1.6, 0.3, len, T(PANEL), 0, 0, 0, { outline: 0 });
  k.at();
  world.col(loc, { type: 'box', x: (ax + bx) / 2, y: r * 0.8, z: (az + bz) / 2, hx: r, hy: r, hz: len / 2, yaw });
}

// Free spot for a footprint of radius r on the ring rmin..rmax, clear of the circles in occ.
function freeSpot(occ, r, rmin, rmax, rr, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const a = rr() * TAU, d = rmin + rr() * (rmax - rmin);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (occ.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > r + or + 3)) { occ.push([x, z, r]); return [x, z]; }
  }
  return null;
}

// Playground: a spinning merry-go-round, a swing set with swaying swings, a slide, a climbing
// dome and a sandpit, on a soft rubber pad (local frame at x, z).
function playground(world, loc, k, x, z, yaw = 0) {
  const pk = 0xff7ad9, cy = 0x2ec4ff;
  k.at(x, z, yaw);
  k.cyl(13, 13.2, 0.15, 28, T(0x3ad1a0), 0, 0, 0, { outline: 0.04 });
  k.ring(13.05, 0.15, T(YEL), 0, 0.15, 0);
  // swings: an A-frame, three seats on chains (each swings)
  for (const s of [-1, 1]) for (const t of [-1, 1]) k.beam([s * 4.5, 0, t * 1.6 - 5], [s * 4.5, 4.5, -5], 0.12, T(cy), { outline: 0.03 });
  k.beam([-4.7, 4.5, -5], [4.7, 4.5, -5], 0.14, T(cy), { outline: 0.03 });
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
  // slide: a ladder tower with a little roof and a chute
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
  k.at();
  // merry-go-round
  const [mx, mz] = L(0, 0);
  k.at(mx, mz);
  k.cyl(0.4, 0.5, 0.6, 10, T(DARK), 0, 0, 0, { outline: 0.03 });
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

// Water tower: a tank on four legs with a ladder and the town's colour band.
function waterTower(world, loc, k, x, z, color) {
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

// Greenhouse: a long glass barrel vault over planter rows under violet grow-lights.
function greenhouse(world, loc, k, x, z, yaw, len = 18) {
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

// Comms mast with a small dish that turns.
function commsMast(world, loc, k, x, z, h, color) {
  k.at(x, z);
  k.box(3, 0.5, 3, T(CONC), 0, 0, 0, { outline: 0.03 });
  lattice(k, 0, 0, h, 1, 0.4, Math.round(h / 3.5), T(LIGHT), T(DARK), { r: 0.14 });
  k.blinker(0, h + 0.4, 0, 0xff2a4a, 0.35);
  k.column(1, h, 0, 0);
  const dish = part(color, (q) => {
    q.add(new THREE.SphereGeometry(1.6, 14, 6, 0, TAU, 0, 0.8).rotateX(-Math.PI / 2), D(LIGHT), 0, 0, 0.8, { outline: 0.03 });
    q.beam([0, 0, 0.3], [0, 0, 1.6], 0.05, T(DARK), { outline: 0 });
    q.box(0.5, 0.5, 0.5, T(color), 0, 0, 0, { outline: 0.02 });
  });
  dish.userData.spin = 0.25;
  k.dyn(dish, 0, h * 0.75, 0);
  k.at();
}

// =============================================================================================
// Kepler towns (Tranquility, Aldrin, Kepler, Twilight, Hertzsprung): a hub dome with a ring of
// family domes joined by ribbed tunnels, prefab cabins round the edge facing the square, a
// playground, a greenhouse, a water tower and a comms mast. Kepler Civic Center trades the hub
// for a gold council dome and adds the town hall with its clock tower.
// =============================================================================================
export function buildTown(world, loc, { civic = false } = {}) {
  const palette = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff];
  const occ = [];
  settle(world, loc, 8101 + loc.id.length * 31, (k) => {
    const rr = world.rand;
    const hubR = civic ? 30 : 22;
    habDome(k, 0, 0, hubR, civic ? 0xffd23f : 0xb8ffb0, { door: Math.PI, trim: 0xff9f1c });
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
      // the tunnel's line is busy too
      for (let t = k1 + 0.1; t < k2; t += 0.15) occ.push([dx * t, dz * t, 2.5]);
    }
    for (const p of loc.pads || []) occ.push([p.x, p.z, p.r + 2]);
    occ.push([-65, 55, 15]);
    // cabins round the edge, doors to the square
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
    if (cm) commsMast(world, loc, k, cm[0], cm[1], 16, 0xff9f1c);
    for (let i = 0; i < 6; i++) { const sp = freeSpot(occ, 1.5, 30, 95, rr); if (sp) k.lamp(sp[0], sp[1], 7); }
    // the town sign by the hub's door
    k.at(0, -hubR - 9, Math.PI);
    k.sign(loc.name.toUpperCase(), 0, 0, { w: Math.max(10, loc.name.length * 0.75), y: 4, fg: '#ff9f1c' });
    k.at();
    if (civic) townHall(world, loc, k);
  });
  world.pad(loc, -65, 55, 13);
}

// Kepler town hall: a colonnaded civic block under a pediment, steps, and a clock tower whose
// hands go round. Its colonnade faces out of town, towards the way you ride in (it used to face the
// hub dome, so arriving you saw a blank back wall).
function townHall(world, loc, k) {
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
  // clock tower rising from the roof
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
  world.flag(loc, -20, 64, [0xff9f1c, 0xffffff, 0xff9f1c], 18);
  world.flag(loc, 20, 64, [0xff9f1c, 0xffffff, 0xff9f1c], 18);
}

// Quonset hut (barracks, garages): a ribbed half-barrel with an end wall, door and lamps; the
// door end faces local +z.
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
  k.solid(r + 0.5, 0.2, len / 2 + 0.5, 0, 0); // the concrete pad
  k.hcyl(r + 0.1, len, 0, 0, 0, 0.4); // a round roof you can roll over, not a box
  k.at();
}

// A turning radar: a lattice reflector on a yoke, spinning on a pedestal (dynamic).
function radar(k, x, y, z, w, color, speed = 0.8) {
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

// Searchlight: pedestal, tilted housing and a soft light cone, sweeping round (dynamic).
function searchlight(k, x, y, z, reach = 40) {
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
// ILMB core (the wings, skywalks, walls and boards stay in world.js): the great dome, a control
// spire through its crown, the arched repair-bay hangar, the launch gantry and its fuel spheres,
// two outlying domes, a comms mast and the barracks blocks.
// =============================================================================================
export function dressIlmb(world, loc) {
  settle(world, loc, 9203, (k) => {
    habDome(k, 0, 0, 58, 0x9be7ff, { door: 0, trim: 0xffd23f, cupola: false });
    // control spire rising through the crown: banded shaft, an observation pod, antenna and beacon
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
    // the repair bay: an arched hangar with ribs and a lit doorway (+z faces the base)
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
    // launch gantry: a lattice umbilical tower with two swing arms, and the fuel spheres
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
    commsMast(world, loc, k, 140, -120, 30, 0xffd23f);
    // barracks and the vehicle depot
    quonset(k, 175, 120, 7, 34, 0x5b5870, -0.6 + Math.PI, YEL);
    quonset(k, -175, 125, 7, 34, 0x5b5870, 0.6 + Math.PI, YEL);
    cabin(k, 190, -40, 26, 26, 11, 0x4a4660, 0.3 - Math.PI / 2, { roof: 0x2a2540, trim: YEL });
  });
}

// =============================================================================================
// Military bases (Vostok, Daedalus): inside the walls, a sloped command bunker with slit
// windows, an antenna farm and a turning radar; Quonset barracks; a searchlight tower; tank traps
// and sandbag nests; fuel and ammo.
// =============================================================================================
export function dressBase(world, loc) {
  const small = !!loc.small;
  settle(world, loc, 9901 + loc.id.length * 17, (k, ctx) => {
    const fc = ctx.fc;
    // command bunker: an armoured octagonal frustum. Everything on it (firing slits, the faction
    // band, armour plates) sits flush on its own face and leans with the wall, so it reads square
    // from every side; a glazed command deck and a ring of masts on top; a recessed blast door
    const R = small ? 11 : 18, H = small ? 8 : 11;
    const tilt = Math.atan((R * 0.18) / H);                 // the walls' lean
    const face = (j) => (j + 0.5) * (TAU / 8);              // face centres (cylinder vertices sit at j*45deg)
    const ap = (h) => (R - R * 0.18 * (h / H)) * Math.cos(Math.PI / 8); // apothem at height h
    k.at(0, 0, -Math.PI / 8); // (turned so face 0 looks straight down the approach, +z: the door's face)
    k.cyl(R * 1.12, R * 1.16, 0.8, 8, T(CONC), 0, 0, 0, { outline: 0.06 });
    k.cyl(R * 0.82, R, H, 8, T(0x4a4660), 0, 0.8, 0, { outline: 0.18 });
    for (let j = 0; j < 8; j++) {
      const a = face(j);
      const at = (h, out) => [Math.sin(a) * (ap(h) + out), 0.8 + h, Math.cos(a) * (ap(h) + out)];
      const plate = (w, hh, d, h, out, mat) => { const [x, y, z] = at(h, out); k.add(new THREE.BoxGeometry(w, hh, d), mat, x, y, z, { ry: a, rx: -tilt, outline: 0.03 }); };
      const side = 2 * ap(0.62 * H) * Math.tan(Math.PI / 8) * 0.86;
      if (j !== 0) plate(side * 0.7, 0.55, 0.2, H * 0.55, 0.06, T(0x1d1a29));   // firing slit
      if (j !== 0) plate(side * 0.6, 0.18, 0.14, H * 0.55 - 0.42, 0.1, G(fc)); // its glow
      plate(side, 0.4, 0.16, H * 0.86, 0.08, T(fc));                           // the faction band
      plate(side * 0.92, H * 0.28, 0.25, H * 0.18, 0.1, T(0x3a3550));          // armour skirt
    }
    // the eaves, the command deck (glass all round) and its cap
    k.cyl(R * 0.86, R * 0.86, 0.8, 8, T(0x3a3550), 0, H + 0.8, 0, { outline: 0.06 });
    k.cyl(R * 0.52, R * 0.6, 2.6, 8, T(0x5b5870), 0, H + 1.6, 0, { outline: 0.1 });
    k.cyl(R * 0.53, R * 0.58, 0.9, 8, G(0x9be7ff), 0, H + 2.4, 0, { outline: 0 });
    k.cyl(R * 0.62, R * 0.62, 0.5, 8, T(fc), 0, H + 4.2, 0, { outline: 0.04 });
    // four masts at the corners, the same height, a beacon on each
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + TAU / 8, rr = R * 0.5;
      k.cyl(0.08, 0.12, 6, 5, T(DARK), Math.sin(a) * rr, H + 4.7, Math.cos(a) * rr, { outline: 0.02 });
      k.ball(0.25, G(i % 2 ? 0xff2a4a : fc), Math.sin(a) * rr, H + 10.9, Math.cos(a) * rr, { outline: 0 });
    }
    radar(k, 0, H + 4.7, 0, small ? 4 : 6, fc, 0.9);
    // the blast door, recessed into the front face (+z), hazard-striped, a lamp each side
    {
      k.at(0, 0, 0);
      k.box(6.4, 5, 2.2, T(0x3a3550), 0, 0.8, R * 0.98, { outline: 0.06 });
      k.box(4.6, 3.8, 0.2, T(0x1d1a29), 0, 0.8, R * 0.98 + 1.12, { outline: 0 });
      k.box(0.08, 3.8, 0.24, T(DARK), 0, 0.8, R * 0.98 + 1.14, { outline: 0 });
      for (let i = 0; i < 7; i++) k.box(0.66, 0.4, 0.22, T(i % 2 ? DARK : YEL), -2.0 + i * 0.66, 4.7, R * 0.98 + 1.13, { outline: 0 });
      for (const sx of [-1, 1]) { k.box(0.5, 0.5, 0.3, G(WARM), sx * 2.8, 3.6, R * 0.98 + 1.15, { outline: 0 }); }
      k.box(5.2, 0.3, 2.6, T(CONC), 0, 0, R * 0.98 + 2.4, { outline: 0.03 });
    }
    k.at();
    // the bunker's walls slope in (R at the foot, 0.82R at the eaves), then a stepped roof:
    // stacked columns follow the slope instead of one full-width cylinder
    for (let i = 0; i < 4; i++) k.column(R * (1 - 0.18 * (i + 0.5) / 4) + 0.2, (H * (i + 1)) / 4, 0, 0, (H * i) / 4);
    k.column(R * 0.72, H + 3, 0, 0, H);
    if (!small) {
      quonset(k, 40, -30, 6, 26, 0x5b5870, 0.2 + Math.PI / 2, fc);
      quonset(k, -35, 35, 7, 22, 0x5b5870, -0.4, fc);
      // fuel tanks and an ammo dump
      k.at(-48, -20);
      tank(k, 0, 0, 3, 7, 0x6b6f78, fc);
      tank(k, 7.5, 0, 3, 7, 0x6b6f78, fc);
      k.column(3.1, 9, 0, 0); k.column(3.1, 9, 7.5, 0);
      k.at();
      for (let i = 0; i < 6; i++) crate(k, 48 + (i % 3) * 1.6, 0, 22 + Math.floor(i / 3) * 1.6, 1.4, 0x4f5a42, 0.1);
    } else {
      quonset(k, 22, -20, 5, 16, 0x5b5870, 0.4, fc);
    }
    // searchlight tower (replaces the old pole)
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
    // tank traps inside the gate and sandbag nests
    const wallR = small ? 55 : 95;
    for (let i = 0; i < (small ? 4 : 6); i++) {
      const x = wallR - 10 - (i % 3) * 4, z = (i % 2 ? 1 : -1) * (9 + (i % 3) * 2.5);
      k.at(x, z, i);
      for (const r of [[0, 0, 0.7], [0.7, 0, -0.7], [0, 0.7, 0.7]]) k.add(new THREE.BoxGeometry(0.35, 2.4, 0.35), T(0x55505e), 0, 0.9, 0, { rx: r[0] + 0.3, ry: r[1], rz: r[2], outline: 0.03 });
      k.at();
    }
    sandbags(k, 18, 18, 3.2, 0.3, 4.2, 2);
    sandbags(k, -16, 22, 2.6, 2.2, 6.0, 2);
    floodMast(k, wallR * 0.65, -wallR * 0.6, 12); floodMast(k, -wallR * 0.6, wallR * 0.45, 12);
  });
}

// =============================================================================================
// Research arrays (Shackleton, Farside): the dishes stay (world.js); here an observatory whose
// cupola turns, two lab blocks and a control centre with a big screen, a tall comms mast,
// cable runs between the dishes, floodlights.
// =============================================================================================
export function dressArray(world, loc) {
  settle(world, loc, 7301 + loc.id.length * 13, (k, ctx) => {
    const green = 0x7dff6a;
    // observatory: a drum with a turning slit cupola and a telescope peeking out
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
    // the array's control centre: a two-tier block with a raked, glazed front, a radome and antennas
    // on the roof, a canopy over the door and its name on the upper tier; its solar field stands on
    // the ground beside it, and the status display on its own frame by the entrance
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
    // radome and antennas on the lower roof
    k.cyl(2.2, 2.6, 1.6, 14, T(DARK), 8, 9.1, -2.5, { outline: 0.04 });
    k.add(new THREE.SphereGeometry(3.2, 18, 12), T(WHITE), 8, 13.2, -2.5, { outline: 0.08 });
    k.ring(3.25, 0.12, G(green), 8, 13.2, -2.5);
    k.beam([-9, 14.5, -4], [-9, 23, -4], 0.12, T(DARK), { outline: 0.02 });
    k.beam([-6, 14.5, -5], [-6, 19.5, -5], 0.08, T(DARK), { outline: 0.02 });
    k.blinker(-9, 23.3, -4, 0xff2a4a, 0.35);
    // the entrance: a door under a canopy, a lamp
    k.box(4, 4, 0.3, T(DARK), 0, 0.6, 7.1, { outline: 0.02 });
    k.box(6.5, 0.35, 2.8, T(green), 0, 4.9, 8.4, { outline: 0.04 });
    for (const sx of [-1, 1]) k.beam([sx * 3, 0.6, 9.6], [sx * 3, 4.9, 9.6], 0.1, T(DARK), { outline: 0 });
    k.box(1.4, 0.25, 0.3, G(WARM), 0, 4.6, 7.3, { outline: 0 });
    k.solid(14, 4.3, 7, 0, 0);
    k.solid(8, 2.5, 4.5, -3, -1.5, 0, 9.1);
    k.solid(3.2, 1.6, 1.6, 8, -2.5, 0, 11.6);
    // the status display, out front on its own frame (waveform bars and a sweep)
    k.box(11, 6, 0.4, T(DARK), 19, 2.6, 9, { ry: -0.35, outline: 0.05 });
    k.box(10, 5, 0.1, G(0x2ee6ff), 19 + Math.sin(-0.35) * 0.25, 3.1, 9 + Math.cos(-0.35) * 0.25, { ry: -0.35, outline: 0 });
    for (let i = 0; i < 6; i++) {
      const u = -3.75 + i * 1.5, h = 0.6 + ((i * 7) % 5) * 0.75;
      k.box(1.0, h, 0.05, G(green), 19 + Math.cos(-0.35) * u + Math.sin(-0.35) * 0.32, 3.4, 9 - Math.sin(-0.35) * u + Math.cos(-0.35) * 0.32, { ry: -0.35, outline: 0 });
    }
    for (const sx of [-1, 1]) k.beam([19 + Math.cos(-0.35) * sx * 4.5, 0, 9 - Math.sin(-0.35) * sx * 4.5], [19 + Math.cos(-0.35) * sx * 4.5, 2.6, 9 - Math.sin(-0.35) * sx * 4.5], 0.15, T(DARK), { outline: 0 });
    k.solid(5.5, 4.3, 0.5, 19, 9, -0.35);
    // the solar field beside it: three rows of tilted panels on posts
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const x = 23 + row * 5, z = -13 + i * 4;
      k.add(new THREE.BoxGeometry(4.2, 0.12, 3.2), T(0x2d4fc4), x, 2.0, z, { rz: -0.5, outline: 0.03 });
      k.add(new THREE.BoxGeometry(4.25, 0.14, 0.12), T(LIGHT), x, 2.02, z, { rz: -0.5, outline: 0 });
      k.cyl(0.1, 0.12, 2.0, 6, T(DARK), x, 0, z, { outline: 0 });
    }
    k.at();
    commsMast(world, loc, k, 100, -20, 40, green);
    // cable runs from each dish to the control centre
    for (const [x, z] of [[-60, -30], [55, -40], [0, 60], [-80, 70]]) k.strip([x, z], [-10, -72], 0.6, 0.12, T(DARK), 0);
    floodMast(k, 30, 10, 12); floodMast(k, -40, 30, 12);
  });
}

// =============================================================================================
// Pirate dens (Scrapjaw Gulch, Blackrock, Gloom Harbor, Rustmoon Hold): container shanties with
// lean-to roofs and lit windows, scrap huts under rusty gables, junk heaps, wrecked ship hulls
// gutted to their ribs, a lookout tower with a sweeping searchlight and strings of green lights.
// Rustmoon Hold is ringed by its wrecks.
// =============================================================================================
function shanty(k, x, z, w, h, d, color, yaw, rr) {
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
  k.at();
}
function wreckHull(k, x, z, yaw, len, color, tilt = 0.12) {
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
  k.at();
}
// The ILMB after the clans took it: junk barricades across the approaches, a wreck dragged in for
// a trophy, scrap heaps, crates and green clan lamps round the plaza and the outer ring.
export function dressScrap(world, loc) {
  settle(world, loc, 6601, (k) => {
    const rr = world.rand;
    const R = loc.r;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2 + rr() * 0.3, d = R * (0.55 + rr() * 0.3);
      junkHeap(k, Math.cos(a) * d, Math.sin(a) * d, 4 + rr() * 3, 1.6 + rr() * 1.4, 12, rr);
    }
    // barricades: tipped containers and sheet metal across the plaza approach
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

// A demolished den: Rustmoon Hold after SPACECOM's finale (scorched ground, its wreck-ships broken
// open, scrap, a SPACECOM field post and a memorial), or an abandoned camp (just the wreckage).
export function buildRuin(world, loc) {
  settle(world, loc, 7301 + loc.id.length * 13, (k) => {
    const rr = world.rand, R = loc.r;
    const hold = !loc.small;
    k.at();
    k.cyl(R * 0.75, R * 0.8, 0.18, 40, T(0x2a2433), 0, 0, 0, { outline: 0 });
    const n = hold ? 6 : 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rr() * 0.6, d = R * (0.4 + rr() * 0.3);
      wreckHull(k, Math.cos(a) * d, Math.sin(a) * d, rr() * TAU, 9 + rr() * 10, [0x6b4a32, 0x4a4f5e, 0x3a3550][i % 3], 0.3 + rr() * 0.25);
    }
    // scrap: tipped containers, sheet metal, barrels, scorch-blackened crates
    for (let i = 0; i < (hold ? 26 : 8); i++) {
      const a = rr() * TAU, d = R * (0.15 + rr() * 0.6);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const r = rr();
      if (r < 0.3) container(k, x, 0, z, [0x6b4a32, 0x55607a, 0x3a3550][i % 3], rr() * TAU);
      else if (r < 0.6) k.add(new THREE.BoxGeometry(2 + rr() * 3, 0.15, 1.5 + rr() * 2), T(RUST), x, 0.3 + rr() * 0.6, z, { rx: rr() - 0.5, ry: rr() * TAU, rz: rr() - 0.5, outline: 0.03 });
      else if (r < 0.8) k.cyl(0.55, 0.55, 1.3, 8, T([0xa05a2a, 0x3a3550][i % 2]), x, 0, z, { rx: rr() < 0.4 ? Math.PI / 2 : 0, outline: 0.03 });
      else crate(k, x, 0, z, 1.2, 0x2a2433, rr() * TAU);
    }
    k.at();
    if (hold) {
      // the SPACECOM field post on the cleared ground, and a memorial plinth with the clans' end
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
  settle(world, loc, 6151 + loc.id.length * 7, (k, ctx) => {
    const rr = world.rand, occ = [[0, 0, 12], [-30, 30, 5], [20, 20, 3]];
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
    // green pirate lights strung round the yard
    const ring = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU * 0.75 + 0.3; ring.push([Math.cos(a) * 48, 5, Math.sin(a) * 48]); }
    lightString(k, ring, [0x7dff3a, 0x2ee6ff, 0x7dff3a, 0xff9f1c], 7, 1.3);
    for (const [x, y, z] of ring) k.cyl(0.15, 0.2, y, 6, T(DARK), x, 0, z, { outline: 0.03 });
  });
}

// Pirate camp: tents, crates, a fire pit that flickers, a string of green lights.
export function buildPirateCamp(world, loc) {
  settle(world, loc, 5101 + loc.id.length * 11, (k) => {
    const rr = world.rand;
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
    // fire pit (the camp flag stands at the centre)
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

// A canvas "screen": a terminal page of phosphor text lines (static, or scrolling when scroll > 0).
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
// Job terminal (ILMB): a kiosk on a stepped plinth, a main contract screen flanked by two angled
// side screens (a scrolling uplink feed and a route map), a status ticker under a canopy, a holo
// ring turning over the top and an antenna. Faces local +z.
// =============================================================================================
export function jobTerminal(world, loc, x, z, yaw = 0, color = 0xffd23f) {
  settle(world, loc, 1201, (k) => {
    k.at(x, z, yaw);
    k.box(18, 0.5, 9, T(CONC), 0, 0, 0, { outline: 0.06 });
    k.box(15, 0.4, 7, T(PANEL), 0, 0.5, 0.4, { outline: 0.04 });
    k.box(15.2, 0.12, 0.2, G(0x2ee6ff), 0, 0.9, 3.9, { outline: 0 });
    // the body: a tall console with a sloped desk in front of the main screen
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
    // the screens
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
    // a holo ring turning above the canopy
    const holo = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 6, 32), glow(0x2ee6ff));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 6, 28), glow(color));
    ring2.rotation.x = Math.PI / 2;
    holo.add(ring, ring2);
    holo.userData.tick = (o, dt, t) => { ring.rotation.y += dt * 1.2; ring2.rotation.z += dt * 0.8; o.position.y = 15.2 + Math.sin(t * 1.5) * 0.25; };
    k.dyn(holo, 0, 15.2, 0.8);
    k.at();
  });
}
