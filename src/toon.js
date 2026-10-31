import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pixelFont } from './fonts.js';
import { receiveFar } from './farshadow.js';

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
		#ifdef FAR_SHADOW_READY
		// past the sun map's box: the wider, coarser maps (farshadow.js), blended in from its edge
		if ( directLight.visible && receiveShadow ) grazeSh = farShadowBlend( grazeSh, vDirectionalShadowCoord[ i ], geometryNormal );
		#endif
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

// Rocks cast their sun-facing sides into the shadow map (shadowSide FrontSide; by default a front-sided material casts its far
// side, which comes down to the ground at a rock's foot level with it, so the bias let the ground there through: a lit line
// between a rock and its shadow). Their own lit faces then shadow themselves in a fine hatch at the light's normal bias, so as
// receivers they get FRONT_NB more (in the shader); the ground round them keeps the light's own.
const FRONT_NB = 0.25; // m
const NB_LINE = 'shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias';
export function frontCaster(mat) {
  mat.shadowSide = THREE.FrontSide;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    if (!THREE.ShaderChunk.shadowmap_vertex.includes(NB_LINE)) { console.warn('[toon] shadow normal bias line not found: rocks keep the light\'s'); return; }
    sh.vertexShader = sh.vertexShader.replace('#include <shadowmap_vertex>', THREE.ShaderChunk.shadowmap_vertex.replace(NB_LINE, `shadowWorldNormal * ( directionalLightShadows[ i ].shadowNormalBias + ${FRONT_NB.toFixed(2)} )`));
  };
  mat.customProgramCacheKey = () => `${prevKey.call(mat)}|frontCaster`;
  return mat;
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
      const m = receiveFar(new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() }));
      m.userData.shared = true; // (cached, never animated: world.mergeLocation may bake it to vertex colours)
      cache.set(key, m);
    }
    return cache.get(key);
  }
  return receiveFar(new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts }));
}

// ---------------- ink shells ----------------
// An outline is a shell drawn back faces only: where it shows past the object, a line. A shell's geometry is the surface itself,
// its `normal` the way the outline grows (unit) and its `inkT` how far (m) at the follow camera's distance; inkMat pushes it out
// in the vertex shader by inkPush(inkT, distance) x the Ink setting:
//   - inside INK_REF it thins to keep its on-screen width (to INK_MIN of inkT: a 6 cm line up close would swallow small details);
//   - beyond it grows with distance to hold that width, up to INK_GROW x inkT, so far props keep a line, not a hairline;
//   - never wider on screen than INK_CAP (radians, about 7 px at 720p): thick shells (boulders' 15 cm, buildings' 20 to 25)
//     would otherwise hold 11 to 18 px out to 36 m, heavier than everything round them;
//   - from INK_EASE to INK_DIST it eases to INK_FAR of that, near the post pass's depth line (post.js), which carries the
//     silhouettes where a place's merged shells stop drawing (world.js INK_DIST); props out in the open keep theirs, thinning.
// Every shell (toon.ink, the Kit's, world.js's batches, models.js's Blender ones, downsKit, staticBake) is made this way, so
// one weight rule holds for all. The skinned figures' hulls (models.js bakeFigure) stay baked: inkMatBaked.
export const INK_REF = 9, INK_MIN = 0.3, INK_GROW = 4, INK_CAP = 0.012, INK_EASE = 60, INK_DIST = 110, INK_FAR = 0.45;
// (live uniform: settings.js) the Ink strength
export const INK_U = { uInkK: { value: 1 } };
export const INK_SCALE_GLSL = `
float inkPush(float t, float d) {
  return min(t * clamp(d / ${INK_REF.toFixed(1)}, ${INK_MIN.toFixed(2)}, ${INK_GROW.toFixed(1)}), ${INK_CAP.toFixed(3)} * d)
    * mix(1.0, ${INK_FAR.toFixed(2)}, smoothstep(${INK_EASE.toFixed(1)}, ${INK_DIST.toFixed(1)}, d));
}
// far ink shifts from near-black toward the shade's deep indigo, so far shapes recede (the post pass's lines do too: post.js)
vec3 inkTint(vec3 c, float d) { return mix(c, vec3(0.16, 0.13, 0.30), 0.75 * smoothstep(40.0, 420.0, d)); }`;
export const INK_COLOR = 0x0b0612;
export const inkMat = new THREE.MeshBasicMaterial({ color: INK_COLOR, side: THREE.BackSide });
// An ink shell material's shader: the vertex pushed out by `push` (GLSL, a vec3 in object space, given vInkD the distance,
// inkK the Ink setting and inkPush(t, vInkD) the metres for a t m line), the colour tinted with distance; `decl`
// adds declarations. `pull` (GLSL, a vec4: a centre in object space and metres) pulls the shell's far side toward the camera,
// along each vertex's own line of sight (so nothing moves on screen), to half those metres in front of the centre's depth but by
// no more than 1.5 times them. What shows of a shell past its object's edge is its far side, up to a metre behind the edge on a
// rounded rock: the ground at a rock's foot is nearer than that, so it showed through the line, a hollow between the outline and
// the rock. Pulled forward, the far side can come in front of the object's own near side (a faceted rock's edges): a pulled
// shell needs inkMarks, which keep it off its own object. `pullK` (GLSL, 0 to 1, given inkW the vertex in the world) scales the
// pull: 0 under the ground, where a buried part's shell (a ramp's lead-in, a monolith's driven-in foot) pulled toward a camera
// overhead would come up through the ground, a black sheet over it (the marks keep a shell off its own rock, not the ground).
export function inkCompile(sh, push, decl = '', pull = null, pullK = '1.0') {
  Object.assign(sh.uniforms, INK_U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${decl}\nuniform float uInkK;\nvarying float vInkD;\n${INK_SCALE_GLSL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 inkW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  inkW = instanceMatrix * inkW;
  #endif
  inkW = modelMatrix * inkW;
  vInkD = distance(cameraPosition, inkW.xyz);
  float inkK = uInkK;
  transformed += ${push};`);
  if (pull) sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 inkP = ${pull}, inkC = vec4(inkP.xyz, 1.0);
  #ifdef USE_INSTANCING
  inkC = instanceMatrix * inkC;
  #endif
  float inkDc = -(modelViewMatrix * inkC).z, inkDv = -mvPosition.z, inkTo = max(inkDc - inkP.w * 0.5, inkDv - inkP.w * 1.5);
  inkTo = mix(inkDv, inkTo, clamp(${pullK}, 0.0, 1.0));
  if (inkTo < inkDv && inkTo > 0.05) { mvPosition.xyz *= inkTo / inkDv; gl_Position = projectionMatrix * mvPosition; }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying float vInkD;\n${INK_SCALE_GLSL}`)
    .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = inkTint(diffuseColor.rgb, vInkD);');
}
inkMat.onBeforeCompile = (sh) => inkCompile(sh, 'normalize(normal) * inkPush(inkT, vInkD) * inkK', 'attribute float inkT;');
inkMat.customProgramCacheKey = () => 'inkShell';
// Ink marks (the stencil): a solid object writes its mark where it's drawn, and its shell, drawn after, only where that mark
// isn't, so a shell pulled forward (inkCompile's pull) never covers its own object. A mark per object, cycling through 1 to 255:
// two sharing one only lose the shell's line where they overlap (the post pass's line stays). Needs the stencil in the post
// pass's target (post.js); without one the test always passes.
let inkMarkN = 0;
export function inkMarks(solid, shell) {
  const mark = (inkMarkN = (inkMarkN % 255) + 1);
  for (const o of [solid, shell]) o.onBeforeRender = (r, s, c, g, m) => { m.stencilRef = mark; };
  const sm = solid.material;
  sm.stencilWrite = true; sm.stencilFunc = THREE.AlwaysStencilFunc; sm.stencilZPass = THREE.ReplaceStencilOp;
  shell.renderOrder = 1; // after every solid has marked its pixels
}
// a shell material's side of it: drawn where the stencil isn't its object's mark, writing nothing
export function inkMarkTest(m) {
  m.stencilWrite = true; m.stencilWriteMask = 0; m.stencilFunc = THREE.NotEqualStencilFunc;
  return m;
}
// shells of solid pieces, their far side pulled forward (inkCompile's pull; solidShell gives them inkC; inkMarks)
export const inkMatSolid = inkMarkTest(new THREE.MeshBasicMaterial({ color: INK_COLOR, side: THREE.BackSide }));
// (nothing under the ground grows out either: a ramp's lead-in lies just under it, and its shell pushed out came up through the
// ground in thin black lines)
inkMatSolid.onBeforeCompile = (sh) => inkCompile(sh, 'normalize(normal) * inkPush(inkT, vInkD) * inkK * smoothstep(0.0, 0.15, inkH)', 'attribute float inkT; attribute vec4 inkC; attribute float inkH;', 'inkC', 'smoothstep(0.0, 0.3, inkH)');
inkMatSolid.customProgramCacheKey = () => 'inkShellSolid';
export const inkMatNear = inkMat; // (was the runner's own distance-scaled outline: every shell is now)
// a shell whose push is baked into its positions (the skinned figures' hulls): no distance rule, no Ink setting
export const inkMatBaked = new THREE.MeshBasicMaterial({ color: INK_COLOR, side: THREE.BackSide });

// A shell for `geo` (indexed or not, any attributes): its positions and index (always indexed), `normal` = the outline's way out and `inkT` its
// thickness t. Each corner moves to where its surrounding face planes, pushed out by t, meet (least squares over the planes,
// damped for near-equal ones, at most 4 t), so a box's faces all stand off by exactly t and a curved part's by about t.
// Cached per geometry and t (ink() is called on many meshes sharing one geometry).
const shellCache = new WeakMap();
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sm = new THREE.Matrix3();
export function shellGeo(geo, t) {
  let byT = shellCache.get(geo);
  if (byT && byT.has(t)) return byT.get(t);
  const P = geo.attributes.position, p = P.array, idx = geo.index ? geo.index.array : null;
  const tris = (idx ? idx.length : P.count) / 3;
  const key = (i) => `${Math.round(p[i * 3] * 1e3)},${Math.round(p[i * 3 + 1] * 1e3)},${Math.round(p[i * 3 + 2] * 1e3)}`;
  const planes = new Map();
  for (let f = 0; f < tris; f++) {
    const a = idx ? idx[f * 3] : f * 3, b = idx ? idx[f * 3 + 1] : f * 3 + 1, c = idx ? idx[f * 3 + 2] : f * 3 + 2;
    _sa.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    _sb.set(p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]);
    _sa.cross(_sb);
    const l = _sa.length();
    if (l < 1e-12) continue;
    const nx = _sa.x / l, ny = _sa.y / l, nz = _sa.z / l;
    for (const v of [a, b, c]) {
      const k = key(v), list = planes.get(k) || [];
      if (!list.some((n) => n[0] * nx + n[1] * ny + n[2] * nz > 0.99999)) list.push([nx, ny, nz]);
      planes.set(k, list);
    }
  }
  const offs = new Map();
  for (const [k, list] of planes) {
    const m = [1e-4, 0, 0, 0, 1e-4, 0, 0, 0, 1e-4], b = [0, 0, 0];
    for (const n of list) for (let r = 0; r < 3; r++) { b[r] += n[r]; for (let c = 0; c < 3; c++) m[r * 3 + c] += n[r] * n[c]; }
    const o = new THREE.Vector3(...b).applyMatrix3(_sm.set(...m).invert()); // (the offset for t = 1)
    if (o.length() > 4) o.setLength(4);
    offs.set(k, o);
  }
  const nor = new Float32Array(P.count * 3), th = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const o = offs.get(key(i));
    const l = o ? o.length() : 0;
    if (l > 1e-6) { nor[i * 3] = o.x / l; nor[i * 3 + 1] = o.y / l; nor[i * 3 + 2] = o.z / l; th[i] = l * t; } else nor[i * 3 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('inkT', new THREE.BufferAttribute(th, 1));
  // (always indexed: the Kit bends shells by index, curve.js, and merges them with others)
  if (idx) g.setIndex(new THREE.BufferAttribute(new idx.constructor(idx), 1));
  else { const ix = new (P.count > 65535 ? Uint32Array : Uint16Array)(P.count); for (let i = 0; i < P.count; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  if (!byT) shellCache.set(geo, (byT = new Map()));
  byT.set(t, g);
  return g;
}
// One shell for several solid pieces (a rock and its crumbs), each pulled toward its own middle (inkMatSolid): `inkC` is the
// piece's bounding-box centre and half its smallest size (inkCompile's pull), `inkH` each point's height over the ground
// (`ground(x, z)`, in the pieces' frame, y up: none pulled under it).
const _sbx = new THREE.Box3(), _sc = new THREE.Vector3(), _ss = new THREE.Vector3();
export function solidShell(geos, t, ground = () => 0) {
  const parts = geos.map((geo) => {
    const g = shellGeo(geo, t).clone(), P = g.attributes.position, n = P.count, a = new Float32Array(n * 4), h = new Float32Array(n);
    _sbx.setFromBufferAttribute(geo.attributes.position).getCenter(_sc); _sbx.getSize(_ss);
    const m = Math.min(_ss.x, _ss.y, _ss.z) * 0.5;
    for (let i = 0; i < n; i++) {
      a[i * 4] = _sc.x; a[i * 4 + 1] = _sc.y; a[i * 4 + 2] = _sc.z; a[i * 4 + 3] = m;
      h[i] = P.getY(i) - ground(P.getX(i), P.getZ(i));
    }
    g.setAttribute('inkC', new THREE.BufferAttribute(a, 4));
    g.setAttribute('inkH', new THREE.BufferAttribute(h, 1));
    return g;
  });
  return shellBounds(parts.length > 1 ? mergeGeometries(parts) : parts[0]);
}

// grow a shell's bounding sphere by its widest reach (inkT x INK_GROW), so it isn't culled while it shows

export function shellBounds(g) {
  g.computeBoundingSphere();
  const T = g.attributes.inkT;
  let mx = 0;
  if (T) for (let i = 0; i < T.count; i++) mx = Math.max(mx, T.getX(i));
  g.boundingSphere.radius += mx * INK_GROW * 1.5;
  return g;
}

// Inverted-hull outline: a shell (shellGeo) t thick at the follow camera's distance, as a child of the mesh.
export function ink(mesh, t = 0.06) {
  const g = shellGeo(mesh.geometry, t);
  if (!g.boundingSphere) shellBounds(g);
  const hull = new THREE.Mesh(g, inkMat);
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
