import * as THREE from 'three';
import { T, G } from './outpostModels.js';
import { downsNode, downsSlot } from './models.js';
import { waterMesh } from './fountainFx.js';
import { part } from './settlements.js';

// What Chimera Downs' builders share: the palette, the text widths and the way a Blender kit part is baked into a settlement's kit (docs/downs-layouts.md).
// The palette: Gold Gleam, Saddle Brown, Black, Money, Barn Red, Touch of Mint (a darker tint of each for shading).
export const PAL = { gold: 0xcfb352, saddle: 0xb07c57, black: 0x3b393a, money: 0x7b9a6e, barn: 0x8b4044, mint: 0xf8fff8 };
export const MINT2 = 0xdfe8dd, MONEY2 = 0x5b7a52, SADDLE2 = 0x8c5f3f, BLACK2 = 0x5a5760, CONC = 0xc6d1c4, CONC2 = 0xb2bfb0;
export const FG = { gold: '#cfb352', mint: '#f8fff8' }, BG = { black: '#3b393a', money: '#5b7a52', barn: '#6a2e33' };
// width of a Kit.text sign for a given letter height (the pixel font is ~square per character)
export const tw = (str, h) => h * (0.347 * str.length + 0.667);

const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const matFor = (slot, over) => { const c = downsSlot(slot, over); return c.glow ? G(c.color) : T(c.color); };

// Bake a kit part into `k` in its current frame: at (x, y, z) turned `ry` about y, scaled (sx, sy, sz); `over` maps a slot to the colour it should wear instead.
export function bake(k, name, x = 0, y = 0, z = 0, { ry = 0, sx = 1, sy = 1, sz = 1, over } = {}) {
  _M.compose(_P.set(x, y, z), _Q.setFromAxisAngle(_Y, ry), _S.set(sx, sy, sz));
  const tag = k.tag;
  k.tag = `${tag}>${name}`;
  k.baked(downsNode(name), (slot) => matFor(slot, over), _M);
  k.tag = tag;
}

// The forecourt's fountain (dn_fountain, tools/blender/build_downs_arcade.py) at (x, z) of the kit's frame: the basin, pedestal, bowl and stem are baked in; the derby cup on top turns, and the two tiers'
// ripples, the curtain over the bowl's lip and the jets run on the shaders the casino's fountain uses (fountainFx.js). Colliders for the basin, the pedestal and the stem.
export function fountain(k, x, z) {
  const F = downsNode('dn_fountain'), I = new THREE.Matrix4();
  k.at(x, z);
  bake(k, 'dn_fountain');
  for (const n of F.kids) {
    if (n.role === 'spin') {
      const piece = part(0xffffff, (q) => q.baked(n, (slot) => matFor(slot), I));
      piece.userData.spin = n.data.speed || 0.7;
      k.dyn(piece, n.pos.x, n.pos.y, n.pos.z);
    } else k.dyn(waterMesh(n), n.pos.x, n.pos.y, n.pos.z);
  }
  k.at();
  k.column(9.8, 1.05, x, z);
  k.column(2.7, 4.7, x, z);
  k.column(1.7, 9.2, x, z, 4.7);
}
