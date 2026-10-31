import * as THREE from 'three';

// Far shadows: two coarse sun shadow maps round the near one, so shadows hold at every distance.
//
// The sun's own shadow map (main.js) is a 320 m box in a 2048² depth map: sharp up close, but past 160 m there was nothing, so
// a hill's shadow ended in a ragged blob where the box did. Two more maps of the same light, wider and coarser, fill the rest:
//   cascade 0  600 m half-width (about 0.6 m a texel): every static caster (terrain, boulders, settlements)
//   cascade 1  3300 m half-width (about 3 m a texel):  terrain only, out to the horizon
// They are drawn rarely (a map only moves in big whole-texel steps, and static things don't change), through three's own shadow
// pass on lights that aren't in the scene (so casters, shadow sides, instancing and draw hooks work as in the near map). A
// receiver (receiveFar) reads the finest map that holds it, with soft seams: near map -> cascade 0 -> cascade 1 -> lit. The
// code that blends them is in the lights chunk patched by toon.js.

export const FAR_LAYER = 29; // static casters the far pass draws (tagged each pass)
export const TERRAIN_LAYER = 30; // terrain chunks (planet.js tags them once); the far pass also draws coarse ones

const CASCADES = [
  { half: 600, step: 96, depth: 2400, every: 1.2, statics: true, maxSize: 2048 },
  { half: 3300, step: 48, depth: 5000, every: 4, statics: false, maxSize: 4096 },
];

// shared uniforms: one object for every receiving material
export const FAR_U = {
  uFarMap0: { value: null }, uFarMap1: { value: null },
  uFarM0: { value: new THREE.Matrix4() }, uFarM1: { value: new THREE.Matrix4() },
  uFarP0: { value: new THREE.Vector4() }, uFarP1: { value: new THREE.Vector4() }, // texel (m), normal offset (m), depth offset (m), 1 / map size
  uFarL: { value: new THREE.Vector3(0, 1, 0) }, // toward the sun
  uFarOn: { value: new THREE.Vector2() }, // which cascades hold a valid map
};

const FAR_GLSL = /* glsl */`
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( SHADOWMAP_TYPE_PCF )
#define FAR_SHADOW_READY
uniform sampler2DShadow uFarMap0;
uniform sampler2DShadow uFarMap1;
uniform mat4 uFarM0, uFarM1;
uniform vec4 uFarP0, uFarP1;
uniform vec3 uFarL;
uniform vec2 uFarOn;
varying vec3 vFarW;

// one cascade's shadow at a world point, and (edge) how far inside its box the point is (0 at the edge, 0.5 in the middle)
float farTap( sampler2DShadow map, mat4 M, vec4 P, vec3 wp, vec3 wn, out float edge ) {
	vec4 c = M * vec4( wp + wn * P.y + uFarL * P.z, 1.0 );
	edge = min( min( c.x, 1.0 - c.x ), min( c.y, 1.0 - c.y ) );
	if ( edge <= 0.0 || c.z > 1.0 || c.z < 0.0 ) return 1.0;
	float radius = 1.5 * P.w;
	float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
	return (
		texture( map, vec3( c.xy + vogelDiskSample( 0, 5, phi ) * radius, c.z ) ) +
		texture( map, vec3( c.xy + vogelDiskSample( 1, 5, phi ) * radius, c.z ) ) +
		texture( map, vec3( c.xy + vogelDiskSample( 2, 5, phi ) * radius, c.z ) ) +
		texture( map, vec3( c.xy + vogelDiskSample( 3, 5, phi ) * radius, c.z ) ) +
		texture( map, vec3( c.xy + vogelDiskSample( 4, 5, phi ) * radius, c.z ) )
	) * 0.2;
}

// the near map's shadow nearSh (its coord nearCoord) carried on into the far maps: the near one inside its box, fading out over
// the box's outer 16 %, then cascade 0, then cascade 1 (fading to lit at its own edge)
float farShadowBlend( float nearSh, vec4 nearCoord, vec3 geomN ) {
	vec2 nuv = nearCoord.xy / nearCoord.w;
	float wn = smoothstep( 0.0, 0.16, min( min( nuv.x, 1.0 - nuv.x ), min( nuv.y, 1.0 - nuv.y ) ) );
	if ( wn >= 1.0 || uFarOn.x + uFarOn.y < 0.5 ) return nearSh;
	vec3 wn3 = inverseTransformDirection( geomN, viewMatrix );
	float e0 = 0.0, e1 = 0.0, t0 = 1.0, t1 = 1.0, w0 = 0.0;
	if ( uFarOn.x > 0.5 ) { t0 = farTap( uFarMap0, uFarM0, uFarP0, vFarW, wn3, e0 ); w0 = smoothstep( 0.0, 0.14, e0 ); }
	float s = t0;
	if ( w0 < 1.0 ) {
		float s1 = 1.0;
		if ( uFarOn.y > 0.5 ) { t1 = farTap( uFarMap1, uFarM1, uFarP1, vFarW, wn3, e1 ); s1 = mix( 1.0, t1, smoothstep( 0.0, 0.06, e1 ) ); }
		s = mix( s1, t0, w0 );
	}
	return mix( s, nearSh, wn );
}
#endif
`;

// Make a lit (toon) material take far shadows: its world position to the fragment shader and the blend's declarations in. The
// lights chunk (toon.js) calls farShadowBlend where FAR_SHADOW_READY is defined, so a material without this just keeps the near map.
export function receiveFar(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, FAR_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFarW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
	vec4 farW = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
	farW = instanceMatrix * farW;
	#endif
	vFarW = ( modelMatrix * farW ).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>\n${FAR_GLSL}`);
  };
  mat.customProgramCacheKey = () => `${prevKey.call(mat)}|farShadow`;
  return mat;
}

const _v = new THREE.Vector3();

export class FarShadow {
  constructor(game) {
    this.g = game;
    this.enabled = true;
    this.on = false; // sun up and shadows on
    this.frame = 0;
    this.dir = new THREE.Vector3(0, 1, 0); // toward the sun, the one every map was drawn for
    this.lx = new THREE.Vector3(); this.ly = new THREE.Vector3(); this.lz = new THREE.Vector3();
    this.dirOk = false;
    this.lastPass = -99;
    this._sm = null;
    this.stats = { passes: [0, 0], ms: [0, 0] };
    this.cam = new THREE.Camera(); // the "camera" of a far pass: only its layers matter (three tests casters against them)
    this.cs = CASCADES.map((cfg, i) => {
      const light = new THREE.DirectionalLight(0xffffff, 0); // never in the scene: only its shadow is used
      light.castShadow = true;
      const sc = light.shadow.camera;
      sc.left = -cfg.half; sc.right = cfg.half; sc.top = cfg.half; sc.bottom = -cfg.half;
      sc.near = 1; sc.far = cfg.depth * 2 + 400;
      light.shadow.radius = 1;
      return {
        i, cfg, light, valid: false, stale: true, ver: -1, frame: -99, have: false,
        cx: 0, cy: 0, cz: 0, size: 0, texel: 0, grid: 0,
        tx: 0, ty: 0, tz: 0, // where the next pass puts the box
        layers: new THREE.Layers(),
      };
    });
    this.cs[0].layers.mask = (1 << FAR_LAYER) | (1 << TERRAIN_LAYER);
    this.cs[1].layers.mask = 1 << TERRAIN_LAYER;
    // A shadow sampler needs a real depth texture with compare mode bound even while its cascade has no map (an unset one binds
    // an empty texture, and the driver flags every draw): a 1x1 stand-in.
    this.dummy = new THREE.WebGLRenderTarget(1, 1);
    this.dummy.depthTexture = new THREE.DepthTexture(1, 1);
    this.dummy.depthTexture.format = THREE.DepthFormat;
    this.dummy.depthTexture.compareFunction = game.renderer.state.buffers.depth.getReversed() ? THREE.GreaterEqualCompare : THREE.LessEqualCompare;
    game.renderer.initRenderTarget(this.dummy);
    FAR_U.uFarMap0.value = FAR_U.uFarMap1.value = this.dummy.depthTexture;
    this.setRes(2048);
  }

  // map sizes follow the Shadow quality setting (settings.js)
  setRes(res) {
    for (const c of this.cs) {
      const size = Math.min(res, c.cfg.maxSize);
      if (c.size === size) continue;
      c.size = size;
      c.texel = (2 * c.cfg.half) / size;
      c.grid = c.cfg.step * c.texel;
      c.light.shadow.mapSize.set(size, size);
      if (c.light.shadow.map) { c.light.shadow.map.dispose(); c.light.shadow.map = null; }
      FAR_U[`uFarMap${c.i}`].value = this.dummy.depthTexture;
      c.valid = false; c.stale = true;
    }
  }

  invalidate() { for (const c of this.cs) { c.valid = false; c.stale = true; } }

  // every frame (main.js updateLighting): where each box should be for a player at p
  update(p, day) {
    const g = this.g, sun = g.sun;
    this.on = this.enabled && day > 0.01 && sun.castShadow && !!g.planet;
    _v.copy(sun.position).sub(sun.target.position).normalize();
    if (_v.distanceToSquared(this.dir) > 1e-10 || !this.dirOk) {
      this.dir.copy(_v);
      // the shadow camera's own axes (lookAt: z toward the sun, x = up x z, y = z x x)
      this.lz.copy(_v);
      this.lx.set(0, 1, 0).cross(this.lz).normalize();
      this.ly.crossVectors(this.lz, this.lx);
      this.dirOk = true;
      this.invalidate();
      for (const c of this.cs) c.have = false;
    }
    const px = p.dot(this.lx), py = p.dot(this.ly), pz = p.dot(this.lz);
    for (const c of this.cs) {
      const grid = c.grid, GZ = 512;
      // (written so a NaN recentres rather than sticks)
      if (!c.have || !(Math.abs(px - c.cx) <= grid * 0.6) || !(Math.abs(py - c.cy) <= grid * 0.6) || !(Math.abs(pz - c.cz) <= GZ * 0.6)) {
        c.cx = Math.round(px / grid) * grid; c.cy = Math.round(py / grid) * grid; c.cz = Math.round(pz / GZ) * GZ;
        c.have = true;
        c.stale = true;
      }
    }
    const U = FAR_U;
    U.uFarL.value.copy(this.dir);
    U.uFarOn.value.set(this.on && this.cs[0].valid ? 1 : 0, this.on && this.cs[1].valid ? 1 : 0);
  }

  // the casters' draw rules for the pass: which terrain chunks cast (coarse ones only here; the near map leaves them out)
  tag(scene) {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.castShadow && o.matrixAutoUpdate === false && !o.isSkinnedMesh) o.layers.enable(FAR_LAYER);
      else o.layers.disable(FAR_LAYER);
    });
  }

  // called at the start of every shadow pass (shadowcache.js render, `orig` the stock WebGLShadowMap.render): draws one cascade
  // if one is due. At most one a frame and none right after another, so the cost is spread out.
  run(sm, orig, scene) {
    const r = this.g.renderer;
    if (scene !== this.g.scene) return; // (only the game's own scene: other renders of the renderer have their own lights)
    if (this._sm !== sm) {
      if (this._sm) { r.initRenderTarget(this.dummy); for (const c of this.cs) FAR_U[`uFarMap${c.i}`].value = this.dummy.depthTexture; }
      this._sm = sm; this.invalidate();
    } // (a lost WebGL context gives a new shadow map)
    const frame = performance.now() / 1000; // (seconds: a pass is cheap or dear in time, not frames)
    if (!this.on || !this.g.planet || frame - this.lastPass < 0.05) return;
    let pick = null;
    for (const c of this.cs) {
      const due = !c.valid || c.stale || (c.ver !== this.g.planet.shadowVer && frame - c.frame >= c.cfg.every);
      if (due && (!pick || (!c.valid && pick.valid))) pick = c;
    }
    if (!pick) return;
    const t0 = performance.now();
    const c = pick, L = c.light, sh = L.shadow, planet = this.g.planet;
    c.tx = c.cx * this.lx.x + c.cy * this.ly.x + c.cz * this.lz.x;
    c.ty = c.cx * this.lx.y + c.cy * this.ly.y + c.cz * this.lz.y;
    c.tz = c.cx * this.lx.z + c.cy * this.ly.z + c.cz * this.lz.z;
    L.target.position.set(c.tx, c.ty, c.tz);
    L.position.copy(L.target.position).addScaledVector(this.dir, c.cfg.depth);
    L.updateMatrixWorld(); L.target.updateMatrixWorld();
    sh.camera._reversedDepth = r.state.buffers.depth.getReversed();
    sh.camera.updateProjectionMatrix();
    if (c.cfg.statics) this.tag(scene);
    this.cam.layers.mask = c.layers.mask;
    planet.farCasters(true);
    const wasNeeded = sm.needsUpdate;
    sm.needsUpdate = true; // (the stock pass runs only when asked)
    try { orig.call(sm, [L], scene, this.cam); } finally { planet.farCasters(false); sm.needsUpdate = wasNeeded; }
    // the receivers switch to the new map in the same breath
    const U = FAR_U, i = c.i;
    U[`uFarM${i}`].value.copy(sh.matrix);
    U[`uFarMap${i}`].value = sh.map.depthTexture;
    U[`uFarP${i}`].value.set(c.texel, c.texel * 0.9, c.texel * 0.6, 1 / c.size);
    c.valid = true; c.stale = false; c.ver = planet.shadowVer; c.frame = frame;
    this.lastPass = frame;
    U.uFarOn.value.set(this.cs[0].valid ? 1 : 0, this.cs[1].valid ? 1 : 0);
    this.stats.passes[i]++; this.stats.ms[i] = performance.now() - t0;
  }
}
