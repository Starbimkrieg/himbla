import * as THREE from 'three';
import { pixelFont } from './fonts.js';

// Grazing sunlight: a face the sun skims along (dot(N, L) near 0) picks up the shadow map's
// self-shadowing noise as streaks and blotches (every settlement's east and west walls are exactly
// edge-on to the sun). On those faces the shadow map gives way to a smooth ramp from lit (sunny side)
// to dark (far side), so they read as one flat toon tone; and a face turned away from the sun is
// simply unlit rather than self-shadowed through the shadow map (which blotched curved undersides). Terrain opts out
// (KEEP_GRAZE_SHADOW: planet.js), so hills still throw long shadows across the ground at dusk.
{
  const SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (chunk.includes(SHADOW_LINE)) {
    THREE.ShaderChunk.lights_fragment_begin = chunk.replace(SHADOW_LINE, `{
		float grazeSh = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#ifndef KEEP_GRAZE_SHADOW
		float grazeD = dot( geometryNormal, directLight.direction );
		float grazeRamp = smoothstep( -0.2, 0.2, grazeD );
		// facing away: unlit, full stop (its own back faces in the shadow map only ever added blotches);
		// facing the sun: the shadow map, eased in from edge-on (continuous through 0: no flicker)
		grazeSh = grazeD <= 0.0 ? grazeRamp : mix( grazeRamp, grazeSh, smoothstep( 0.04, 0.22, grazeD ) );
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
      m.userData.shared = true; // (a cached colour nobody animates: world.mergeLocation may bake it into vertex colours)
      cache.set(key, m);
    }
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

// One vertex-coloured stand-in per kind (toon or glow) and side: merged geometry built from many
// shared plain colours carries each piece's colour in its vertices and draws in one call
// (outpostModels Kit.finish, world.mergeLocation). Only for colours nobody animates (userData.shared).
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

// Named NPCs wear an HTML name tag (hud.js updateTags) instead of a floating sign in the world: it
// stays crisp and solid over busy scenery, and shrinks as you walk up so it never fills the screen.
// The sprite stays as the anchor (its position, and whether it and its parents are visible), but
// never draws.
export const NAME_TAGS = [];
export function nameTag(sprite, text, color = '#ffd23f') {
  sprite.material.visible = false;
  NAME_TAGS.push({ sprite, text, color, el: null, seen: true, losT: Math.random() * 0.3 });
  return sprite;
}

// Switch a set of objects' drawing off/on through their layer masks (restoring what they had), for
// distance culling: unlike .visible, game code toggling visibility never fights it.
export function setMask(list, on) {
  for (const o of list) {
    if (on) { if (o.userData._lm !== undefined) { o.layers.mask = o.userData._lm; delete o.userData._lm; } }
    else if (o.userData._lm === undefined) { o.userData._lm = o.layers.mask; o.layers.mask = 0; }
  }
}
