import * as THREE from 'three';
import { pixelFont } from './fonts.js';

// Grazing sunlight: faces edge-on to the sun (dot(N, L) near 0; every settlement's east and west walls)
// pick up shadow-map self-shadowing noise as streaks. There the shadow map gives way to a smooth lit-to-dark
// ramp, one flat toon tone; faces turned away are simply unlit, not self-shadowed (which blotches curved
// undersides). Terrain opts out (KEEP_GRAZE_SHADOW: planet.js) so hills still cast long dusk shadows.
{
  const SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (chunk.includes(SHADOW_LINE)) {
    THREE.ShaderChunk.lights_fragment_begin = chunk.replace(SHADOW_LINE, `{
		float grazeSh = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, abs( directionalLightShadow.shadowRadius ), vDirectionalShadowCoord[ i ] ) : 1.0;
		// lunar light (a negative shadow radius, main.js updateLighting): no air to soften a shadow, so the filtered edge is
		// cut hard. It stays anti-aliased (a narrow ramp across the soft PCF edge, never the raw texels' stair-steps)
		if ( directionalLightShadow.shadowRadius < 0.0 ) grazeSh = smoothstep( 0.38, 0.62, grazeSh );
		#ifndef KEEP_GRAZE_SHADOW
		float grazeD = dot( geometryNormal, directLight.direction );
		float grazeRamp = smoothstep( -0.2, 0.2, grazeD );
		// facing away: unlit, full stop (its own back faces in the shadow map only ever added blotches);
		// facing the sun: the shadow map, eased in from edge-on (continuous through 0: no flicker)
		grazeSh = grazeD <= 0.0 ? grazeRamp : mix( grazeRamp, grazeSh, smoothstep( 0.04, 0.22, grazeD ) );
		#else
		// the ground too, but only right round edge-on (hills keep their long dusk shadows): where a slope
		// turns from the sun it shades smoothly into the dark instead of shadowing itself through the
		// shadow map, which drew a band of saw-teeth down the far wall of a crater under a low sun
		{
			float gd = dot( geometryNormal, directLight.direction );
			grazeSh *= smoothstep( -0.02, 0.14, gd ); // (only ever darker: the turn into shadow eased, never lit up)
		}
		#endif
		directLight.color *= grazeSh;
		}`);
  } else console.warn('[toon] shadow line not found: grazing-shadow fade is off');
}

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
    if (!cache.has(key)) {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
      m.userData.shared = true; // (cached, never animated: world.mergeLocation may bake it to vertex colours)
      cache.set(key, m);
    }
    return cache.get(key);
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}

export const inkMat = new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide });

// Outline for shells carrying their offset in an `off` attribute (`position` is the surface, `off` the full-thickness push:
// models.js shellOff, for the Blender-built runner). Full thickness in metres beyond INK_FULL from the camera (the follow cam
// is 7.5 m+ away); closer in it thins to keep its on-screen width, down to INK_MIN of full (a 3 cm shell is 6 px at 8 m but
// 40 px at 1 m, swallowing small details in the wardrobe, cutscenes and close cameras).
// (Separate from inkMat so shells without `off` never run it: a missing attribute reads the last program's slot.)
export const INK_FULL = 7, INK_MIN = 0.3;
export const inkMatNear = new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide });
inkMatNear.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\nattribute vec3 off;\nconst float INK_FULL = ${INK_FULL.toFixed(1)}; const float INK_MIN = ${INK_MIN.toFixed(2)};`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += off * clamp(-(modelViewMatrix * vec4(position, 1.0)).z / INK_FULL, INK_MIN, 1.0);`);
};
inkMatNear.customProgramCacheKey = () => 'inkNear';

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

// One vertex-coloured stand-in per kind (toon or glow) and side: merged geometry from many shared plain
// colours keeps each colour in its vertices and draws in one call (outpostModels Kit.finish,
// world.mergeLocation). Only for never-animated colours (userData.shared).
const vcCache = new Map();
export function vcMaterial(m) {
  const k = `${m.type}-${m.side}`;
  let v = vcCache.get(k);
  if (!v) {
    v = m.isMeshToonMaterial
      ? new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(), side: m.side })
      : new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: m.side });
    vcCache.set(k, v);
  }
  return v;
}
export const vcable = (m) => !!(m && m.userData.shared && !m.map && !m.vertexColors && !m.transparent && (m.isMeshToonMaterial || m.isMeshBasicMaterial));
export function paintVertices(g, color) {
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Drops downward-facing triangles lying on the ground (box undersides, cylinder caps, aprons): never seen
// from above, and their ink shells sit below ground. For pieces baked into a settlement (`g` in the place's
// frame, ground at y = 0; indexed or not). Uses positions only. Returns g.
export function dropFloorFaces(g, maxY = 0.05) {
  const pos = g.attributes.position.array, idx = g.index ? g.index.array : null;
  const tris = (idx ? idx.length : g.attributes.position.count) / 3;
  const keep = new Uint8Array(tris);
  let kept = 0;
  for (let t = 0; t < tris; t++) {
    const a = (idx ? idx[t * 3] : t * 3) * 3, b = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
    if (pos[a + 1] <= maxY && pos[b + 1] <= maxY && pos[c + 1] <= maxY) {
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-9 && ny / len < -0.98) continue; // (floor: drop)
    }
    keep[t] = 1; kept++;
  }
  if (kept === tris) return g;
  if (idx) {
    const out = new idx.constructor(kept * 3);
    for (let t = 0, o = 0; t < tris; t++) if (keep[t]) { out[o++] = idx[t * 3]; out[o++] = idx[t * 3 + 1]; out[o++] = idx[t * 3 + 2]; }
    g.setIndex(new THREE.BufferAttribute(out, 1));
    return g;
  }
  for (const k of Object.keys(g.attributes)) {
    const at = g.attributes[k], s = at.itemSize, out = new at.array.constructor(kept * 3 * s);
    for (let t = 0, o = 0; t < tris; t++) if (keep[t]) { out.set(at.array.subarray(t * 3 * s, t * 3 * s + 3 * s), o); o += 3 * s; }
    g.setAttribute(k, new THREE.BufferAttribute(out, s));
  }
  return g;
}

export function glow(color) {
  return new THREE.MeshBasicMaterial({ color });
}
// Glow material shared by colour, so same-colour glows merge into one draw call (the world's static merge).
const sharedGlows = new Map();
export function glowShared(color) {
  let m = sharedGlows.get(color);
  if (!m) sharedGlows.set(color, m = glow(color));
  return m;
}

// Canvas text sprite in the pixel display font for in-world signs. Press Start 2P is wide, so it is
// drawn at ~half the nominal size.
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

// Named NPCs get an HTML name tag (hud.js updateTags), not a world sign: crisp over busy scenery, and it
// shrinks as you approach. The sprite stays as the anchor (position and visibility) but never draws.
export const NAME_TAGS = [];
export function nameTag(sprite, text, color = '#ffd23f') {
  sprite.material.visible = false;
  NAME_TAGS.push({ sprite, text, color, el: null, seen: true, losT: Math.random() * 0.3 });
  return sprite;
}

// Distance culling via layer masks (restoring the old mask): unlike .visible, it never fights game code
// toggling visibility.
export function setMask(list, on) {
  for (const o of list) {
    if (on) { if (o.userData._lm !== undefined) { o.layers.mask = o.userData._lm; delete o.userData._lm; } }
    else if (o.userData._lm === undefined) { o.userData._lm = o.layers.mask; o.layers.mask = 0; }
  }
}
