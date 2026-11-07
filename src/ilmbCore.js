import * as THREE from 'three';
import { GLASS, G, T } from './outpostModels.js';
import { ilmbModel, ilmbSlot, vehicleParts, rocketModel, rocketSlot } from './models.js';
import { settle, part, cargoStack } from './settlements.js';
import { QUARTERS, ROCKET, LOT_BAY, at, yawFor } from './ilmbLayout.js';

// The ILMB's core from Blender (tools/blender/build_ilmb.py -> src/assets/ilmb.glb): the central complex and the fortress wall
// (proposal A of docs/ilmb-proposals, "the Crown" and "the Rampart", the one chosen), the glass skywalks to the wings and the
// base's other pieces. world.js buildHub and fortify, and settlements.js dressIlmb, hand over to this unless the old
// code-built core is asked for.
//
//   ?ilmbCore=old        the code-built dome, spire and wall as they were (the URL beats the saved setting,
//                        localStorage['mr-ilmb-core'])
export const ILMB_DRAFTS = ['a'];
export const ILMB_CORE = (() => {
  try {
    const v = new URLSearchParams(location.search).get('ilmbCore') || localStorage.getItem('mr-ilmb-core');
    if (v === 'old' || ILMB_DRAFTS.includes(v)) return v;
  } catch { /* (no location or storage: the default) */ }
  return 'a';
})();
export const ilmbBlender = () => ILMB_CORE !== 'old';

const PAINT = new Map();
const slotMat = (slot) => {
  if (slot === 'glass') return GLASS(0x9be7ff, 0.22);
  const c = ilmbSlot(slot);
  if (!c.paint) return c.glow ? G(c.color) : T(c.color);
  if (!PAINT.has(slot)) {            // (models.js ilmbSlot: painted on, pulled toward the camera like the ink lines)
    const m = (c.glow ? G(c.color) : T(c.color)).clone();
    Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    PAINT.set(slot, m);
  }
  return PAINT.get(slot);
};

// Bake one piece (`ilmb_<name>`) into a kit's current frame: its meshes, lamps, turning parts and colliders. Returns the model.
export function bakeIlmbInto(k, name) {
  return bakeModelInto(k, ilmbModel(name), slotMat);
}
// (any baked model with the same pivots: ilmb.glb's pieces, rocket.glb's gantries and pad), moved dx along the frame's x
function bakeModelInto(k, M, slotMat, dx = 0) {
  const I = new THREE.Matrix4().makeTranslation(dx, 0, 0);
  k.baked(M.root, slotMat, I);
  for (const b of M.blinkers) k.blinker(b.pos.x + dx, b.pos.y, b.pos.z, b.data.color || 0xff2a4a, b.data.radius || 0.3);
  for (const f of M.fans) {
    const piece = part(0xffffff, (q) => q.baked(f, slotMat, I));
    piece.userData.spin = f.data.spin || 0.5;
    k.dyn(piece, f.pos.x + dx, f.pos.y, f.pos.z);
  }
  for (const { pos: p, data: d } of M.cols) {
    if (d.shape === 'box') k.solid(d.hx, d.hy, d.hz, p.x + dx, p.z, d.yaw || 0, p.y, d.pitch || 0);
    else if (d.shape === 'cyl') k.column(d.r, p.y + d.h, p.x + dx, p.z, p.y);
    else if (d.shape === 'hcyl') k.hcyl(d.r, d.len, p.x + dx, p.z, d.yaw || 0, p.y);
    else if (d.shape === 'sphere') k.sphere(d.r, p.x + dx, p.y, p.z);
  }
  return M;
}

// Bake one piece into the place at (x, z) turned by yaw (the hub's frame when all three are 0); its turret mounts go to
// world.mount. Returns the model.
// floor: colliders under its low drawn floors (Kit.floorColliders: plinths, footings, slabs the feet would sink into)
export function bakeIlmbPiece(world, loc, name, { x = 0, z = 0, yaw = 0, seed = 7700, floor = false } = {}) {
  let M;
  settle(world, loc, seed, (k) => { k.tag = name; k.floorCols = floor; k.at(x, z, yaw); M = bakeIlmbInto(k, name); });   // (tag: the dev audits name the piece)
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const m of M.mounts) world.mount(loc, x + m.pos.x * c + m.pos.z * s, z - m.pos.x * s + m.pos.z * c, m.pos.y, { wall: !!m.data.wall });
  return M;
}

// The central complex and the skywalks (world.js buildHub), and the wall with its gates, towers and bastions (world.js fortify)
export function buildIlmbCore(world, loc) {
  bakeIlmbPiece(world, loc, `core_${ILMB_CORE}`, { seed: 7701 });
  bakeIlmbPiece(world, loc, 'skywalks', { seed: 7702 });
}
export function buildIlmbWall(world, loc) {
  bakeIlmbPiece(world, loc, `wall_${ILMB_CORE}`, { seed: 7703 });
}

// ---------------- the quarters (ilmbLayout.js QUARTERS: Draft A of docs/ilmb-layouts.md) ----------------

// Bake a road vehicle standing still (models.js vehicleParts) into the kit's current frame at (x, y, z) turned by yaw, scale
// s; `drop(node)`: leave a pivot out (a wheel off on the lift). Its collider is the caller's.
const ONE = new THREE.Vector3(1, 1, 1);
function bakeVehicle(k, kind, opts, x, y, z, yaw, s = 1, drop = () => false) {
  const { node, mat, keep } = vehicleParts(kind, opts);
  const walk = (n, m) => {
    k.baked({ ...n, parts: n.parts.filter((p) => mat(p.slot)) }, mat, m);
    for (const c of n.kids) if (keep(c) && !drop(c)) walk(c, new THREE.Matrix4().compose(c.pos, c.quat, ONE).premultiply(m));
  };
  walk(node, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)));
}

// A lot's parked cars: one letter per bay (ilmbLayout.js), a faction's hover-car, a civilian one, a SPACECOM patrol rover
const PARKED = { S: ['car', { faction: 'spacecom' }], K: ['car', { faction: 'kepler' }], M: ['car', { faction: 'meridian' }], V: ['car', { faction: 'vostok' }], R: ['rover', { style: 'military', color: 0x55607a, trim: 0xffd23f }] };
// e: a lot of ilmbLayout.js QUARTERS (cars, bay, a), in the kit's current frame, the bays open toward +z
export function parkingLot(k, e) {
  const [bw, bd] = e.bay || LOT_BAY, n = e.cars.length, wide = !!e.bay;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * bw, c = e.cars[i];
    k.tag = 'lot';
    const m = new THREE.Matrix4().makeTranslation(x, 0, 0);
    k.baked(ilmbModel(wide ? 'lot_bay_wide' : 'lot_bay').root, slotMat, m);
    if (c === '.') continue;
    // backed in, nose to the lane; a hover-car rests low on its pads, a rover on its wheels
    const [kind, opts] = c === 'c' ? ['car', { paint: (i * 3 + e.a) | 0 }] : PARKED[c];
    const cz = -bd / 2 + 1.0 + (kind === 'car' ? 3.45 : 3.7);   // (its tail a metre off the kerb: a hover-car 6.9 m long, a rover 7.4)
    bakeVehicle(k, kind, opts, x, kind === 'car' ? 0.4 : 0.06, cz, 0, kind === 'rover' ? 1.15 : 1);
    if (kind === 'car') k.solid(1.8, 1.0, 3.4, x, cz, 0, 0.4);
    else k.solid(1.9, 1.45, 3.6, x, cz, 0, 0.06);
  }
  // a lamp and charge point at each end, behind the kerb
  for (const s of [-1, 1]) {
    k.tag = 'lot';
    const lamp = ilmbModel('lot_lamp');
    const lx = s * (n * bw) / 2 - s * 0.4, lz = -bd / 2 - 0.9;
    k.baked(lamp.root, slotMat, new THREE.Matrix4().makeTranslation(lx, 0, lz));
    for (const { pos: p, data: d } of lamp.cols) {
      if (d.shape === 'box') k.solid(d.hx, d.hy, d.hz, lx + p.x, lz + p.z, 0, p.y);
      else k.column(d.r, p.y + d.h, lx + p.x, lz + p.z, p.y);
    }
  }
}

// The motor pool's lifts and what stands on them (build_ilmb.py ilmb_quarters.py build_motorpool): a buggy on the two-post
// lift, a wheel off; a SPACECOM patrol car on the four-post; the Interceptor on the scissor lift. [x, y, z] in its frame.
export const MOTORPOOL_LIFTS = [
  { at: [-9.6, 1.25, 12.0], kind: 'rover', opts: { style: 'civil', color: 0xff9f1c, trim: 0xfff4e0 }, s: 1.3, wheelOff: true },
  { at: [0, 0.25 + 1.7, 12.0], kind: 'rover', opts: { style: 'military', color: 0x55607a, trim: 0xffd23f }, s: 1.15 },
  { at: [9.6, 0.25 + 1.1, 12.0], kind: 'interceptor', opts: { color: 0xfff4e0, trim: 0xffd23f }, s: 1 },
];
const SHOP_NAMES = { shop_canteen: 'CANTEEN', shop_suits: 'SUITS + SEALS', shop_parts: 'PARTS', shop_noodle: 'NOODLES', shop_clinic: 'CLINIC' };
const SHOP_SIGN = [0, 5.1, 2.62, 5.8];  // (ilmb_quarters.py SHOP_SIGN: the fascia board's face, x y z, and its width)
// name boards: [text, x, y, z of the face in the piece's frame, the letters' height, the widest it may be]
const SIGNS = { terminal_pax: ['ARRIVALS + DEPARTURES', 0, 7.7, 3.21, 1.0, 20], cargo_shed: ['SPACECOM CARGO', 0, 9.2, 7.32, 1.2, 16], motorpool: ['MOTOR POOL', 0, 8.65, 26.13, 1.1, 11] };
// a sign's width for letters about h tall (outpostModels textMat: the pixel font's cells), no wider than max
const fit = (str, h, max) => Math.min(max, h * (0.62 * str.length + 0.8));

// A piece's extras in the kit's current frame (the piece's): its name board, and the motor pool's vehicles on their lifts
export function bakeIlmbExtras(k, piece) {
  const sign = SIGNS[piece];
  if (sign) k.text(sign[0], sign[1], sign[2], sign[3], 0, fit(sign[0], sign[4], sign[5]), { back: false, off: 0.02 });
  if (piece !== 'motorpool') return;
  for (const L of MOTORPOOL_LIFTS) {
    const [lx, ly, lz] = L.at;
    let off = L.wheelOff;
    bakeVehicle(k, L.kind, L.opts, lx, ly, lz, 0, L.s, (c) => { if (off && c.role === 'wheel' && c.pos.x > 0 && c.pos.z > 0) { off = false; return true; } return false; });
    k.solid(1.8 * L.s, 1.0 * L.s, 3.0 * L.s, lx, lz, 0, ly + 0.4);
  }
}

// A row of units (houses, shops) side by side along x from (x, z) turned by yaw, each `unit` m wide; shops get their names
export function bakeUnitRow(k, units, unit, x = 0, z = 0, yaw = 0) {
  units.forEach((u, i) => {
    const lx = (i - (units.length - 1) / 2) * unit;
    k.tag = u; k.at(x + lx * Math.cos(yaw), z - lx * Math.sin(yaw), yaw);
    bakeIlmbInto(k, u);
    if (SHOP_NAMES[u]) k.text(SHOP_NAMES[u], SHOP_SIGN[0], SHOP_SIGN[1], SHOP_SIGN[2], 0, fit(SHOP_NAMES[u], 0.75, SHOP_SIGN[3]), { back: false, off: 0.02 });
  });
}

// The rocket's pad in the kit's current frame and its gantry on its edge, out along +x (its arms reach back in to the ship at
// the middle)
const rocketMat = (slot) => { const s = rocketSlot(slot); return s.glass ? GLASS(s.color, 0.22) : s.glow ? G(s.color) : T(s.color); };
export function bakeRocketPad(k) {
  bakeModelInto(k, rocketModel('pad'), rocketMat);
  bakeModelInto(k, rocketModel('gantry'), rocketMat, ROCKET.gantryOff);
}

// Everything in the band between the inner ring road and the wall, and the dish and visitor parking inside it
export function buildIlmbQuarters(world, loc) {
  QUARTERS.forEach((e, n) => {
    const [x, z] = at(e.a, e.r), yaw = yawFor(e.a, e.face), seed = 7720 + n;
    if (e.kind === 'piece') {
      bakeIlmbPiece(world, loc, e.piece, { x, z, yaw, seed, floor: true });
      if (SIGNS[e.piece] || e.piece === 'motorpool') settle(world, loc, seed + 500, (k) => { k.at(x, z, yaw); bakeIlmbExtras(k, e.piece); });
      return;
    }
    settle(world, loc, seed, (k) => {
      k.tag = e.kind; k.floorCols = true; k.at(x, z, yaw);
      if (e.kind === 'row') bakeUnitRow(k, e.units, e.unit, x, z, yaw);
      else if (e.kind === 'lot') {
        k.floorCols = true;  // (the bays' slabs: walked on at their drawn height)
        parkingLot(k, e);
      } else if (e.kind === 'yard') {
        // container stacks, two rows of three along the yard, in the liveries of the lines that bring them
        const F = ['spacecom', 'meridian', 'kepler', 'vostok'];
        for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
          if (row === 1 && i === 1) continue;                      // (a gap, as yards have)
          cargoStack(k, (i - 1) * 8.6, (row - 0.5) * 4.4, 1 + ((i + row * 2) % 3), [F[(i + row) % 4], F[(i * 3 + row + 1) % 4], F[(i + 2) % 4]], Math.PI / 2, 0);
        }
      }
    });
  });
}

// The Earth rocket's flat pad (rocket.glb rocket_pad) and the launch gantry fitted to the ship, on the pad's
// outer edge, its arms reaching in to the ship (ilmbLayout.js ROCKET). Returns the pad's record for loc.pads (traffic keeps off).
export function buildIlmbRocketPad(world, loc) {
  const t = (ROCKET.a * Math.PI) / 180, [x, z] = at(ROCKET.a, ROCKET.r);
  settle(world, loc, 7790, (k) => { k.tag = 'rocket_pad'; k.floorCols = true; k.at(x, z, -t); bakeRocketPad(k); });   // (the frame's +x out toward the wall)
  const rec = { x, z, r: ROCKET.padR, flat: true, top: 0.25, cols: [], keep: null, mesh: null };
  (loc.pads ||= []).push(rec);
  return rec;
}
