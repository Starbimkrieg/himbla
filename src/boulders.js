import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, createNoise3D } from './rng.js';
import { inkCompile, INK_COLOR } from './toon.js';

// The Moon's boulders (planet.buildBoulders): a few lumpy shapes shared by every chunk, each an icosphere pushed out by two
// noise octaves and chiselled flat in places, then scaled to unit RMS radius so the colliders (BOULDER_COLLIDER_K) fit.
export const BOULDER_SHAPES = 6;
const DETAIL = 3; // 320 faces
export const BOULDER_COLLIDER_K = 0.906; // collision radius over RMS radius

// full outline thickness (m); the ink is the shell pushed out along its normals, not a scaled copy
export const BOULDER_INK_M = 0.15;

// smooth min of two radii: rounds a flat into the lump over width k
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function lumpy(seed) {
  const rnd = mulberry32(seed);
  const nz = createNoise3D(mulberry32(seed ^ 0x9e3779b1));
  let g = new THREE.IcosahedronGeometry(1, DETAIL);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4); // smooth normals
  // chisel planes
  const flats = [];
  for (let i = 0, n = 4 + Math.floor(rnd() * 3); i < n; i++) {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    flats.push({ x: r * Math.cos(t), y: u, z: r * Math.sin(t), h: 0.78 + rnd() * 0.12 });
  }
  const ax = [0.9 + rnd() * 0.3, 0.9 + rnd() * 0.3, 0.9 + rnd() * 0.3]; // lopsided
  const o = [rnd() * 50, rnd() * 50, rnd() * 50];
  const pos = g.attributes.position;
  let sum = 0;
  for (let i = 0; i < pos.count; i++) {
    const l = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
    const x = pos.getX(i) / l, y = pos.getY(i) / l, z = pos.getZ(i) / l;
    let r = 1 + 0.14 * nz(x * 1.25 + o[0], y * 1.25 + o[1], z * 1.25 + o[2]) + 0.055 * nz(x * 2.9 + o[1], y * 2.9 + o[2], z * 2.9 + o[0]);
    for (const f of flats) {
      const dp = x * f.x + y * f.y + z * f.z;
      if (dp > 0.12) r = smin(r, f.h / dp, 0.14);
    }
    pos.setXYZ(i, x * r * ax[0], y * r * ax[1], z * r * ax[2]);
    sum += pos.getX(i) ** 2 + pos.getY(i) ** 2 + pos.getZ(i) ** 2;
  }
  const k = 1 / Math.sqrt(sum / pos.count); // unit RMS radius
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function makeBoulderShapes() {
  return Array.from({ length: BOULDER_SHAPES }, (_, i) => lumpy(11 + i * 17));
}

// Boulder ink: the back-faced shell pushed out by BOULDER_INK_M along its normals, by toon.js's ink rule (inkCompile: the distance
// scale, the Ink setting). The push is in local space, so it's divided by the instance's scale to stay in metres.
export function makeBoulderInk() {
  const m = new THREE.MeshBasicMaterial({ color: INK_COLOR, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => inkCompile(sh, `normalize(normal) * ${BOULDER_INK_M.toFixed(2)} * inkK / inkSc()`, `float inkSc() {
#ifdef USE_INSTANCING
  return pow(abs(determinant(mat3(instanceMatrix))), 1.0 / 3.0);
#else
  return 1.0;
#endif
}`);
  m.customProgramCacheKey = () => 'boulderInk';
  return m;
}
