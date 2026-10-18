import * as THREE from 'three';
import { textSprite } from '../toon.js';
import { ScarfSim } from '../models.js';
import { lineUp } from './common.js';

// Helpers shared by the characters files (characters.js): a variant with its name tag, a line of them, a runner's rest pose.

export const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();

// the width a line of n cells takes (cell width pw, gap between them), for an item's declared footprint
export const span = (n, pw, gap = 0.6) => n * pw + (n - 1) * gap;

// a small name tag (the game's pixel-font sign as a sprite), h metres tall
export function tag(text, color = '#ffd23f', h = 0.7) {
  return textSprite(text, { color, scale: h / 10 });
}

// One variant: the model with its name tag in front of its feet. w, d: its cell (m).
export function cell(obj, label, w, d, { color = '#ffd23f', h = 0.7, z = d / 2 + 0.5 } = {}) {
  const root = new THREE.Group();
  root.add(obj);
  if (label) {
    const s = tag(label, color, h);
    s.position.set(0, h / 2 + 0.06, z);
    root.add(s);
  }
  return { root, w, d };
}

// a line of cells as one item's root; returns { root, w, d } (see common.js lineUp)
export function line(cells, gap = 0.6) {
  return lineUp(cells, gap);
}

// A runner standing at rest, as the player does when nobody is steering: arms a little out from the sides, and the
// scarf (the outfit's own style: models.js ScarfSim) let to hang. gear: what is on its back (the sim keeps the scarf clear of it).
export function restRunner(M, gear) {
  M.armL.rotation.z = -0.15;
  M.armR.rotation.z = 0.15;
  const sim = new ScarfSim(M);
  for (let i = 0; i < 45; i++) sim.update(1 / 60, ZERO, UP, gear);
  return M;
}
