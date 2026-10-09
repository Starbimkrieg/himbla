import * as THREE from 'three';
import { pixelFont } from './fonts.js';

let grad = null;
export function gradientMap() {
  if (!grad) {
    const data = new Uint8Array([60, 60, 60, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
    grad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    grad.minFilter = THREE.NearestFilter;
    grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
  }
  return grad;
}

const cache = new Map();
export function toon(color, opts) {
  if (!opts) {
    const key = typeof color === 'number' ? color : String(color);
    if (!cache.has(key)) cache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() }));
    return cache.get(key);
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}

export const inkMat = new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide });

// Inverted-hull outline: a slightly larger black back-face shell for bold silhouettes.
export function ink(mesh, t = 0.06) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox;
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  bb.getSize(size); bb.getCenter(center);
  const hull = new THREE.Mesh(g, inkMat);
  hull.scale.set(1 + (2 * t) / Math.max(size.x, 0.02), 1 + (2 * t) / Math.max(size.y, 0.02), 1 + (2 * t) / Math.max(size.z, 0.02));
  hull.position.set(center.x * (1 - hull.scale.x), center.y * (1 - hull.scale.y), center.z * (1 - hull.scale.z));
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.userData.isInk = true;
  mesh.add(hull);
  return mesh;
}

export function glow(color) {
  return new THREE.MeshBasicMaterial({ color });
}

// Canvas text texture in the pixel display font, for in-world signs. Press Start 2P is much
// wider than the old comic face, so it is drawn at ~half the nominal size on the same canvas.
export function textSprite(text, { color = '#ffd23f', stroke = '#120a1e', bg = null, size = 96, scale = 1 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const fs = size * 0.52;
  const font = pixelFont(fs);
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  const h = Math.ceil(size * 1.5);
  c.width = w; c.height = h;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bg) {
    ctx.fillStyle = stroke;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(8, 8, w - 16, h - 16);
  }
  ctx.lineWidth = fs * 0.28;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, w / 2, h / 2 + fs * 0.06);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + fs * 0.06);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set((w / h) * 10 * scale, 10 * scale, 1);
  return s;
}

// Switch a set of objects' drawing off/on through their layer masks (restoring what they had), for
// distance culling: unlike .visible, game code toggling visibility never fights it.
export function setMask(list, on) {
  for (const o of list) {
    if (on) { if (o.userData._lm !== undefined) { o.layers.mask = o.userData._lm; delete o.userData._lm; } }
    else if (o.userData._lm === undefined) { o.userData._lm = o.layers.mask; o.layers.mask = 0; }
  }
}
