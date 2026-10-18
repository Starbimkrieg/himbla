import * as THREE from 'three';
import { toon } from '../toon.js';

// Helpers shared by the props-*.js catalogue files (props & markers, weapons & effects, nature, secrets & the Spindle).

const _box = new THREE.Box3();

// The world-space box of an object whose parent chain is just its own wrapper (matrices brought up to date first).
export function boxOf(obj) {
  obj.updateMatrixWorld(true);
  return _box.makeEmpty().setFromObject(obj).clone();
}

// Wraps `obj` so it is centred on x = z = 0 and (lift) stands with its lowest point on y = 0. Returns a lineUp part:
// { root, w, d, h } with w / d / h what was measured (so a variant row never needs its widths hand-typed).
export function seat(obj, { lift = true, y = 0 } = {}) {
  const root = new THREE.Group();
  root.add(obj);
  const b = boxOf(root), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  if (lift) obj.position.y -= b.min.y;
  obj.position.y += y;
  return { root, w: s.x, d: s.z, h: s.y };
}

// A random-number function that follows mulberry32(seed) but returns `over[i]` for the i-th call (0-based) when it has one:
// how a game factory that picks its colour from rr() is made to show the other colour.
export function rngWith(base, over = {}) {
  let i = 0;
  return () => { const v = base(); const o = over[i++]; return o === undefined ? v : o; };
}

// A flat, low plate: a showroom base for things that are only effects (the footprint it declares is the plate's)
export function plate(w, d, color = 0x2a2540, h = 0.12) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.y = h / 2;
  m.receiveShadow = true;
  return m;
}

// the faction colours as hex numbers (locations.js FACTIONS has CSS strings)
export const hexOf = (css) => new THREE.Color(css).getHex();
