import * as THREE from 'three';
import { SUN } from './geo.js';

// Static shadow cache.
//
// The sun's shadow map is the heaviest pass (every caster within 160 m into one 2048² depth map), and most settlement casters
// never move (merged buildings, terrain, boulders). Those are drawn once into a depth-only map S; each refresh blits S into the
// live map and draws only moving casters on top. Depth keeps the nearest surface whatever the order, so the result equals a
// single pass.
//
// Nothing is assumed about what moves:
//  - The shadow box recentres in steps (centre(): whole texels along the light's axes, with slack), so S stays valid within a
//    cell. A recentre redraws S.
//  - Every cached caster is checked each pass (in scene, visible, in the box, fingerprint unchanged: id, geometry + version,
//    world matrix, material flags, instances); the whole scene is walked every cfg.WALK passes. S is redrawn when one is gone or
//    changed (chunks streaming out, a settlement hidden, a door swinging) or a new fixed caster appears; a changed caster sits out
//    for cfg.BAN passes, drawn live. Untracked casters are drawn live, so nothing is missed, only not yet cached.
//  - Skinned and morphing meshes are never cached. Fixed meshes (matrixAutoUpdate false: merged settlement chunks, terrain,
//    boulders) are cached at once; others must stay still for cfg.STILL passes (parked vehicle, idle prop) and join in batches
//    every cfg.PROMO passes or whenever S is redrawn anyway.
//  - Runs only while the light direction holds (the Spindle turns its sun: plain pass there), for a single PCF directional light,
//    where there's enough static geometry to pay for a whole-map copy, and the world isn't churning S most passes (fast
//    skating, heavy streaming).
//  - Any error falls back to the plain pass for good.

// tunables; ShadowCache.cfg holds the live copy
const CFG = {
  BAN: 900, // passes a changed cached caster sits out
  STILL: 480, // passes an ordinary caster must be unchanged before caching
  PROMO: 120, // passes between batches of ordinary casters joining
  WALK: 16, // passes between full scene walks (only cached casters checked in between)
  ENTER_TRIS: 80000, // cached tris (at 2048², scaled by sqrt of map area) that make a whole-map copy worth it
  LOOK: 24, // passes between looks while idle
  HOLD: 40, // passes the cache stays off after churning
  RELEASE: 900, // idle passes before S's memory is freed
};
const HYST = 0.6; // recentre once the player is this many cells from the centre
const GRID_Z = 128; // m: recentring step along the light axis (box reaches 590 m sunward, 800 m behind, so this barely matters)

const _f = new Float32Array(16);
const _u = new Uint32Array(_f.buffer);
let _a = 0, _b = 0;
const mix = (v) => { _a = Math.imul(_a ^ v, 16777619); _b = Math.imul(_b + v | 0, 0x9e3779b1) ^ (_b >>> 15); };
const attrIds = new WeakMap(); // buffer attribute -> small int, so a swap shows even when counts and versions match
let attrNext = 1;
const attrId = (a) => { if (!a) return 0; let v = attrIds.get(a); if (!v) attrIds.set(a, (v = attrNext++)); return v; };
const mixMat = (m) => {
  if (!m) { mix(-7); return; }
  mix(m.id); mix(m.visible ? 1 : 0); mix(m.side); mix(m.shadowSide == null ? -1 : m.shadowSide); mix(m.version);
  mix((m.alphaTest * 1e4) | 0); mix(m.alphaToCoverage ? 1 : 0); mix(m.wireframe ? 1 : 0);
  mix(m.map ? m.map.id : 0); mix(m.map ? m.map.version : 0); mix(m.alphaMap ? m.alphaMap.id : 0);
  mix(m.displacementMap ? m.displacementMap.id : 0); mix((m.displacementScale * 1e4) | 0); mix((m.displacementBias * 1e4) | 0);
  mix(m.clipShadows ? 1 : 0); mix(m.clippingPlanes ? m.clippingPlanes.length : 0);
};
const noop = () => {};

// what the depth pass sees of a mesh, hashed to two 32-bit words
function fingerprint(o, rec) {
  _a = 0x811c9dc5 | 0; _b = 0x2545f491;
  mix(o.id);
  const g = o.geometry, pos = g.attributes.position;
  mix(g.id);
  if (pos) { mix(attrId(pos)); mix(pos.isInterleavedBufferAttribute ? pos.data.version : pos.version); mix(pos.count); }
  if (g.index) { mix(attrId(g.index)); mix(g.index.version); mix(g.index.count); }
  mix(g.drawRange.start); mix(g.drawRange.count);
  if (g.isInstancedBufferGeometry) mix(g.instanceCount);
  const m = o.material;
  if (Array.isArray(m)) { for (const k of m) mixMat(k); for (const gr of g.groups) { mix(gr.start); mix(gr.count); mix(gr.materialIndex); } } else mixMat(m);
  if (o.isInstancedMesh) { mix(o.count); mix(attrId(o.instanceMatrix)); mix(o.instanceMatrix.version); }
  _f.set(o.matrixWorld.elements);
  for (let i = 0; i < 16; i++) mix(_u[i]);
  rec.h1 = _a; rec.h2 = _b;
}
// triangles in one instance of the mesh
const trisOf = (o) => {
  const g = o.geometry, n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
  return Math.min(n, g.drawRange.count) / 3;
};

export class ShadowCache {
  constructor(game) {
    this.g = game;
    this.enabled = true;
    this.failed = false; // an error switched it off for good (see console)
    this.cfg = { ...CFG };
    this.recs = new WeakMap(); // caster -> { h1, h2 (fingerprint), tris, since, ban, strikes, promoted }
    this.statics = []; this.srecs = []; this.dyns = []; this.pend = []; // statics and srecs are parallel arrays
    this.passes = 0; // shadow passes with a steady light
    this.nextWalk = 0; this.nextPromo = 0;
    this.on = false; // cache in use (false: idle, not enough static geometry)
    this.nextLook = 0; this.holdUntil = 0; this.churn = 0; this.offSince = 0;
    this.blitChecks = 3; // first few depth blits are checked for GL errors
    this.S = null; // cached static depth (render target of the live map's size)
    this.M = null; // the live map it was drawn for
    this.valid = false;
    this.have = { sig: null, tx: 0, ty: 0, tz: 0, dx: 0, dy: 0, dz: 0, sx: 0, sy: 0, sz: 0 }; // what S was drawn for: box centre, sun dir (d: last pass, s: S's), caster set
    this.stats = { mode: 'off', full: 0, dyn: 0, plain: 0, walks: 0, statics: 0, dyns: 0, staticTris: 0, promoted: 0, demoted: 0 };
    // light axes as the shadow camera's lookAt builds them (z toward the sun, x = up × z, y = z × x)
    this._lz = null; this._lx = null; this._ly = null;
    this._c = false; this.cx = 0; this.cy = 0; this.cz = 0;
    this._orig = null; this._sm = null; this._type = null;
    this._tmp = { h1: 0, h2: 0 };
  }

  // Take over the shadow map's render (a plain property on WebGLShadowMap). The original still draws, with some casters off per pass.
  install() {
    const sm = this.g.renderer.shadowMap;
    this._sm = sm;
    this._orig = sm.render;
    this._type = sm.type;
    sm.render = (lights, scene, camera) => this.render(lights, scene, camera);
  }

  invalidate() { this.valid = false; this.have.sig = null; }

  // after a lost WebGL context three makes a new shadow map (stock render) and all GL objects are gone
  reinstallIfLost() {
    if (this.g.renderer.shadowMap === this._sm) return;
    this.install();
    this.S = null; this.M = null; this.valid = false; this.on = false; this.blitChecks = 3;
  }

  // Shadow box centre for a player at p, snapped to whole texels along the light axes (shadows don't crawl) and moved only
  // once the player is well off it (hysteresis), so S outlasts a few steps. The step is whole texels at every quality
  // (24 of the coarsest: 7.5 m).
  centre(p, out) {
    this.reinstallIfLost();
    if (this.S && (!this.g.sun.castShadow || !this.enabled)) this.dropS(); // shadows or cache off: free the map
    const cam = this.g.sun.shadow.camera;
    if (!this._lz) {
      this._lz = SUN.clone().normalize();
      this._lx = new THREE.Vector3(0, 1, 0).cross(this._lz).normalize();
      this._ly = this._lz.clone().cross(this._lx);
    }
    const grid = (24 * (cam.right - cam.left)) / 1024;
    const px = p.dot(this._lx), py = p.dot(this._ly), pz = p.dot(this._lz);
    // written so a NaN recentres rather than sticks
    if (!this._c || !(Math.abs(px - this.cx) <= grid * HYST) || !(Math.abs(py - this.cy) <= grid * HYST) || !(Math.abs(pz - this.cz) <= GRID_Z * HYST)) {
      this.cx = Math.round(px / grid) * grid; this.cy = Math.round(py / grid) * grid; this.cz = Math.round(pz / GRID_Z) * GRID_Z;
      this._c = true;
    }
    return out.copy(this._lx).multiplyScalar(this.cx).addScaledVector(this._ly, this.cy).addScaledVector(this._lz, this.cz);
  }

  makeS(M) {
    this.dropS();
    const w = M.width, h = M.height;
    // depth is what's kept; one byte of colour is enough for the pass's output
    const S = new THREE.WebGLRenderTarget(w, h, { format: THREE.RedFormat, type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    S.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    S.depthTexture.format = THREE.DepthFormat;
    S.texture.name = 'sun.shadowCache';
    S.depthTexture.name = 'sun.shadowCache.depth';
    this.g.renderer.initRenderTarget(S);
    this.S = S;
    this.valid = false;
    this.blitChecks = Math.max(this.blitChecks, 1);
  }

  dropS() {
    if (!this.S) return;
    this.S.depthTexture.dispose();
    this.S.dispose();
    this.S = null;
    this.valid = false;
  }

  hide(list) { for (let i = 0; i < list.length; i++) list[i].castShadow = false; }
  show(list) { for (let i = 0; i < list.length; i++) list[i].castShadow = true; }

  // visits every caster the original shadow pass would draw, walked the same way
  walk(o, layers, fr) {
    if (o.visible === false) return;
    if (o.castShadow && (o.isMesh || o.isLine || o.isPoints) && o.layers.test(layers) && (!o.frustumCulled || o.intersectsFrustum(fr))) this.take(o, fr);
    const c = o.children;
    for (let i = 0, l = c.length; i < l; i++) this.walk(c[i], layers, fr);
  }

  member(o, rec) {
    this._cnt++;
    this._s1 = (this._s1 + Math.imul(o.id, 0x9e3779b1)) | 0;
    this._s2 = (this._s2 ^ Math.imul(o.id + 0x5bd1e995, 0x85ebca6b)) | 0;
    this._tris += rec.tris * (o.isInstancedMesh ? o.count : 1);
    this.statics.push(o);
    this.srecs.push(rec);
  }

  take(o, fr) {
    const pass = this.passes;
    let rec = this.recs.get(o);
    const first = !rec;
    if (first) this.recs.set(o, (rec = { h1: 0, h2: 0, tris: 0, since: pass, ban: 0, strikes: 0, promoted: false }));
    const p1 = rec.h1, p2 = rec.h2;
    fingerprint(o, rec);
    const changed = !first && (p1 !== rec.h1 || p2 !== rec.h2);
    if (first || changed) {
      rec.tris = trisOf(o);
      if (changed) rec.since = pass;
    }
    // skinned/morphing meshes change shape invisibly to the fingerprint: never cached
    if (o.isSkinnedMesh || (o.morphTargetInfluences && o.morphTargetInfluences.length)) {
      if (rec.promoted) { rec.promoted = false; this._demoted++; }
      this.dyns.push(o);
      return;
    }
    if (changed && rec.promoted) { rec.promoted = false; rec.ban = pass + this.cfg.BAN * Math.min(8, ++rec.strikes); this._demoted++; }
    // never culled but outside the box: not worth tracking (its coming and going would redraw S for nothing)
    if (o.frustumCulled === false && !o.intersectsFrustum(fr)) {
      if (rec.promoted) { rec.promoted = false; this._demoted++; }
      this.dyns.push(o);
      return;
    }
    if (rec.promoted) { this.member(o, rec); return; }
    if (o.matrixAutoUpdate === false) {
      if (pass >= rec.ban) { rec.promoted = true; this.member(o, rec); return; }
    } else if (pass >= rec.ban && pass - rec.since >= this.cfg.STILL) { this.pend.push(o); return; }
    this.dyns.push(o);
  }

  // Every cached caster still present, drawn and unchanged? (caller checked the box didn't move; an unchanged caster can't leave it)
  stillSo(scene, layers) {
    const st = this.statics, rs = this.srecs, t = this._tmp;
    for (let i = 0; i < st.length; i++) {
      const o = st[i];
      if (!o.castShadow) return false;
      let p = o;
      for (; p.parent; p = p.parent) if (p.visible === false) return false; // it or a parent is hidden
      if (p !== scene || p.visible === false || !o.layers.test(layers)) return false; // removed from the scene
      fingerprint(o, t);
      const rec = rs[i];
      if (t.h1 !== rec.h1 || t.h2 !== rec.h2) return false;
    }
    return true;
  }

  render(lights, scene, camera) {
    const g = this.g, r = g.renderer, sm = r.shadowMap, orig = this._orig, st = this.stats, cfg = this.cfg;
    if (!sm.enabled || (sm.autoUpdate === false && sm.needsUpdate === false) || lights.length === 0) return orig.call(sm, lights, scene, camera);
    const light = lights[0], sh = light.shadow, M = sh.map;
    const plain = (why) => { this.valid = false; st.mode = why; st.plain++; return orig.call(sm, lights, scene, camera); };
    if (!this.enabled) { this.dropS(); return plain('off'); }
    if (lights.length !== 1 || light !== g.sun || sm.type !== THREE.PCFShadowMap || sh.getViewportCount() !== 1) return plain('other light');
    // shadow type or map size changes: the original rebuilds the map
    if (this._type !== sm.type) { this._type = sm.type; return plain('type changed'); }
    if (!M || !M.depthTexture || r.properties.get(M).__webglFramebuffer === undefined) return plain('no map yet');
    if (M.width !== sh.mapSize.x || M.height !== sh.mapSize.y) return plain('resizing');
    // needs a steady light direction (the Spindle turns its sun)
    const hv = this.have;
    const dx = light.position.x - light.target.position.x, dy = light.position.y - light.target.position.y, dz = light.position.z - light.target.position.z;
    const steady = Math.abs(dx - hv.dx) + Math.abs(dy - hv.dy) + Math.abs(dz - hv.dz) < 1e-6;
    hv.dx = dx; hv.dy = dy; hv.dz = dz;
    if (!steady) return plain('light turning');
    const pass = ++this.passes;
    if (pass < this.holdUntil) return plain('churning');
    if (!this.on && pass < this.nextLook) {
      // idle long enough: free the map
      if (this.S && pass - this.offSince > cfg.RELEASE) this.dropS();
      return plain('idle');
    }

    const rt = r.getRenderTarget(), face = r.getActiveCubeFace(), mip = r.getActiveMipmapLevel();
    const clear = r.clear;
    let dirty = false;
    try {
      sh.updateMatrices(light, camera);
      const fr = sh.getFrustum(0);
      // between full walks only cached casters are checked (uncached ones draw live, so nothing new is missed)
      const tx = light.target.position.x, ty = light.target.position.y, tz = light.target.position.z;
      const fits = this.S && this.S.width === M.width && this.S.height === M.height; // S matches the live map
      const same = hv.tx === tx && hv.ty === ty && hv.tz === tz && hv.sx === dx && hv.sy === dy && hv.sz === dz; // box and sun S was drawn for
      const quick = this.on && this.valid && this.M === M && fits && pass < this.nextWalk && same && this.stillSo(scene, camera.layers);
      if (!quick) {
        // walk every caster in the box
        st.walks++;
        this.nextWalk = pass + cfg.WALK;
        this.statics.length = this.srecs.length = this.dyns.length = this.pend.length = 0;
        this._cnt = 0; this._s1 = 0; this._s2 = 0; this._tris = 0; this._demoted = 0;
        this.walk(scene, camera.layers, fr);

        dirty = !this.valid || this.M !== M || !fits || this._demoted > 0 || !same
          || !hv.sig || hv.sig[0] !== this._cnt || hv.sig[1] !== this._s1 || hv.sig[2] !== this._s2;
        // still ordinary casters join in a batch when S is redrawn anyway or every PROMO passes
        // (take() files each caster under exactly one of statics, dyns and pend, and the walk meets each once)
        if (this.pend.length && (dirty || pass >= this.nextPromo)) {
          for (const o of this.pend) { const rec = this.recs.get(o); rec.promoted = true; this.member(o, rec); }
          this.nextPromo = pass + cfg.PROMO;
          st.promoted += this.pend.length;
          dirty = true;
        } else for (const o of this.pend) this.dyns.push(o); // waiting: drawn live meanwhile
        st.demoted += this._demoted;
        st.statics = this.statics.length; st.dyns = this.dyns.length; st.staticTris = Math.round(this._tris);

        // worth it? (enough static tris to pay for a whole-map copy)
        const worth = cfg.ENTER_TRIS * Math.sqrt((M.width * M.height) / (2048 * 2048));
        if (this.on ? this._tris < worth * 0.6 : this._tris < worth) {
          if (this.on || !this.offSince) this.offSince = pass;
          this.on = false;
          this.nextLook = pass + cfg.LOOK;
          return plain('idle');
        }
        if (!this.on) { this.on = true; this.churn = 0.3; }
      }

      if (dirty) {
        if (!fits) this.makeS(M);
        // static casters into S ...
        this.hide(this.dyns);
        sh.map = this.S;
        sm.needsUpdate = true;
        try { orig.call(sm, lights, scene, camera); } finally { sh.map = M; this.show(this.dyns); }
        this.M = M;
        hv.tx = tx; hv.ty = ty; hv.tz = tz;
        hv.sx = dx; hv.sy = dy; hv.sz = dz;
        hv.sig = [this._cnt, this._s1, this._s2];
        this.valid = true;
        st.full++; st.mode = 'full';
      } else { st.dyn++; st.mode = 'dynamic'; }
      // ... then S into the live map, moving casters on top
      r.state.setScissorTest(false); // a blit obeys the scissor
      const gl = r.getContext();
      const drain = () => { let e = gl.NO_ERROR, last = gl.NO_ERROR; for (let i = 0; i < 16 && (e = gl.getError()) !== gl.NO_ERROR; i++) last = e; return last; };
      const check = this.blitChecks > 0;
      if (check) drain();
      r.copyTextureToTexture(this.S.depthTexture, M.depthTexture);
      if (check) { this.blitChecks--; const e = drain(); if (e === gl.INVALID_OPERATION || e === gl.INVALID_FRAMEBUFFER_OPERATION || e === gl.INVALID_ENUM || e === gl.INVALID_VALUE || e === gl.CONTEXT_LOST_WEBGL) throw new Error(`depth copy failed (GL error ${e})`); }
      r.clear = noop; // the copy replaces the clear
      this.hide(this.statics);
      sm.needsUpdate = true;
      try { orig.call(sm, lights, scene, camera); } finally { r.clear = clear; this.show(this.statics); }
    } catch (e) {
      // on any error: plain shadows this frame, cache off for good
      console.warn('[shadowcache] falling back to the plain shadow pass for good', e);
      r.clear = clear;
      this.valid = false;
      this.enabled = false;
      this.failed = true;
      sh.map = M;
      r.setRenderTarget(rt, face, mip);
      sm.needsUpdate = true;
      orig.call(sm, lights, scene, camera);
      return;
    }
    // S redrawn most passes (fast skating, heavy streaming) costs more than it saves: step aside a while
    this.churn = this.churn * 0.9 + (dirty ? 0.1 : 0);
    if (this.churn > 0.55) { this.on = false; this.offSince = pass; this.valid = false; this.holdUntil = pass + cfg.HOLD; this.nextLook = this.holdUntil; }
  }
}
