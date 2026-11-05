import * as THREE from 'three';
import { GLASS, G, T } from './outpostModels.js';
import { ilmbModel, ilmbSlot } from './models.js';
import { settle, part } from './settlements.js';

// The ILMB's core from Blender (tools/blender/build_ilmb.py -> src/assets/ilmb.glb; docs/ilmb-proposals): the central complex
// and the fortress wall, in two proposals, the glass skywalks to the wings and the base's other pieces. world.js buildHub and
// fortify, and settlements.js dressIlmb, hand over to this unless the old code-built core is asked for.
//
//   ?ilmbCore=a | b      the proposal shown (the URL beats the saved setting, localStorage['mr-ilmb-core']); default a
//   ?ilmbCore=old        the code-built dome, spire and wall as they were
export const ILMB_DRAFTS = ['a', 'b'];
export const ILMB_CORE = (() => {
  try {
    const v = new URLSearchParams(location.search).get('ilmbCore') || localStorage.getItem('mr-ilmb-core');
    if (v === 'old' || ILMB_DRAFTS.includes(v)) return v;
  } catch { /* (no location or storage: the default) */ }
  return 'a';
})();
export const ilmbBlender = () => ILMB_CORE !== 'old';

const slotMat = (slot) => {
  if (slot === 'glass') return GLASS(0x9be7ff, 0.22);
  const c = ilmbSlot(slot);
  return c.glow ? G(c.color) : T(c.color);
};

// Bake one piece (`ilmb_<name>`) into a kit's current frame: its meshes, lamps, turning parts and colliders. Returns the model.
export function bakeIlmbInto(k, name) {
  const M = ilmbModel(name), I = new THREE.Matrix4();
  k.baked(M.root, slotMat, I);
  for (const b of M.blinkers) k.blinker(b.pos.x, b.pos.y, b.pos.z, b.data.color || 0xff2a4a, b.data.radius || 0.3);
  for (const f of M.fans) {
    const piece = part(0xffffff, (q) => q.baked(f, slotMat, I));
    piece.userData.spin = f.data.spin || 0.5;
    k.dyn(piece, f.pos.x, f.pos.y, f.pos.z);
  }
  for (const { pos: p, data: d } of M.cols) {
    if (d.shape === 'box') k.solid(d.hx, d.hy, d.hz, p.x, p.z, d.yaw || 0, p.y, d.pitch || 0);
    else if (d.shape === 'cyl') k.column(d.r, p.y + d.h, p.x, p.z, p.y);
    else if (d.shape === 'hcyl') k.hcyl(d.r, d.len, p.x, p.z, d.yaw || 0, p.y);
    else if (d.shape === 'sphere') k.sphere(d.r, p.x, p.y, p.z);
  }
  return M;
}

// Bake one piece into the place at (x, z) turned by yaw (the hub's frame when all three are 0); its turret mounts go to
// world.mount. Returns the model.
export function bakeIlmbPiece(world, loc, name, { x = 0, z = 0, yaw = 0, seed = 7700 } = {}) {
  let M;
  settle(world, loc, seed, (k) => { k.at(x, z, yaw); M = bakeIlmbInto(k, name); });
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

// The base's other pieces where the code-built ones stood (settlements.dressIlmb): repair bay, launch gantry, fuel spheres,
// the two family domes, comms mast, barracks, vehicle depot
const PIECES = [
  ['repair', -168, -98, 1.05], ['gantry', 60, -185, 0], ['horton_red', -20, -173, 0], ['horton_blue', -20, -197, 0],
  ['dome_pink', 70, 140, Math.PI], ['dome_gold', -60, 145, Math.PI], ['mast', 140, -120, 0],
  ['barracks', 175, 120, -0.6 + Math.PI], ['barracks', -175, 125, 0.6 + Math.PI], ['depot', 190, -40, 0.3 - Math.PI / 2],
];
export function buildIlmbPieces(world, loc) {
  PIECES.forEach(([name, x, z, yaw], i) => bakeIlmbPiece(world, loc, name, { x, z, yaw, seed: 7710 + i }));
}
