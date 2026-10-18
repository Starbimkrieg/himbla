import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, createNoise3D } from './rng.js';
import { INK_FULL, INK_MIN } from './toon.js';

// The Moon's boulders (planet.buildBoulders): a handful of lumpy shapes shared by every chunk (so nothing grows as you
// travel), each an icosphere pushed out by two octaves of noise and chiselled flat in a few places, then set to unit RMS
// radius. That last step is what keeps the colliders honest: a boulder's collision sphere is 0.906 of its RMS radius (the
// 0.85 s the old twelve-sided boulders had, which were 0.938 s RMS), so it still fits the new shape the way it fitted the old.
export const BOULDER_SHAPES = 6;
const DETAIL = 3; // (320 faces; the icosphere's detail is how many times each edge is cut)
export const BOULDER_COLLIDER_K = 0.906; // collision radius over RMS radius

// outline thickness, in metres, at full: a boulder's ink is its own shell pushed out along its normals (not a scaled copy)
export const BOULDER_INK_M = 0.15;

// smooth minimum of two radii: where a flat meets the lump it is rounded off over a width k
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function lumpy(seed) {
  const rnd = mulberry32(seed);
  const nz = createNoise3D(mulberry32(seed ^ 0x9e3779b1));
  let g = new THREE.IcosahedronGeometry(1, DETAIL);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4); // (one vertex per corner, so the normals come out smooth)
  // where a chisel took a face off: a few planes
  const flats = [];
  for (let i = 0, n = 4 + Math.floor(rnd() * 3); i < n; i++) {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    flats.push({ x: r * Math.cos(t), y: u, z: r * Math.sin(t), h: 0.78 + rnd() * 0.12 });
  }
  const ax = [0.9 + rnd() * 0.3, 0.9 + rnd() * 0.3, 0.9 + rnd() * 0.3]; // (lopsided)
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
  const k = 1 / Math.sqrt(sum / pos.count); // (unit RMS radius)
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function makeBoulderShapes() {
  return Array.from({ length: BOULDER_SHAPES }, (_, i) => lumpy(11 + i * 17));
}

// The ink round a boulder: the boulder's own shell, drawn from the inside, pushed out along its normals by BOULDER_INK_M at
// full. The push is made in the boulder's own space, so it is divided by the instance's size to come out the same
// thickness in metres, and it thins as you come close (the same INK_FULL and INK_MIN as the runner's outline, toon.js): a
// 15 cm line on a boulder you are standing beside took a quarter of the screen.
export function makeBoulderInk() {
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float inkSc = pow(abs(determinant(mat3(instanceMatrix))), 1.0 / 3.0);
  vec3 inkW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  float inkSc = 1.0;
  vec3 inkW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
transformed += normalize(normal) * ${BOULDER_INK_M.toFixed(2)} * clamp(distance(cameraPosition, inkW) / ${INK_FULL.toFixed(1)}, ${INK_MIN.toFixed(2)}, 1.0) / inkSc;`);
  };
  m.customProgramCacheKey = () => 'boulderInk';
  return m;
}
