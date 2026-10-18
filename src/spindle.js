// The Spindle (Meridian finale): a 7 km asteroid rolling on its long axis round the Moon, tied to the Monolith.
// Meridian's rocket drops you at one end, the Quantum Core is at the other; an alien mothership hunts you across, then
// throws everything at the extraction pad while Meridian's pod comes down.
//
// A real rock cylinder along x that you can run all the way round: while here "up" points away from that axis
// (geo.js GRAV; physics, camera, shots and effects all ask upAt), so the girth is a loop and the length a straight
// run; the blunt ends drop into space. The Moon is hidden and frozen, g.planet points at this world, and the sky
// (Moon, Earth, stars, sun) wheels round the axis for the roll. From the Moon it's a spinning rock in the sky
// (spindleGeometry).
import * as THREE from 'three';
import { Kit, T, G, GLASS, BEAM } from './outpostModels.js';
import { toon, glow, ink } from './toon.js';
import { mulberry32 } from './rng.js';
import { SUN, GRAV } from './geo.js';
import { makeShuttle, makePlanets } from './models.js';
import { Medevac } from './medevac.js';
import { RC, L, CIRC, START_S, CORE_S, PAD_S, wrapW, pointAt, smooth, heightAt, meshHeightAt, buildRockArrays, ROCK_S0, ROCK_S1 } from './spindleTerrain.js';

const AX = new THREE.Vector3(1, 0, 0);
const TEAL = 0x7dffd4, PINK = 0xff2e88, VIO = 0xc77dff;

// ---------- the shape (also the asteroid in the Moon's sky) ----------
export function spindleGeometry(len = 1000, rad = 120, seed = 3) {
  const g = new THREE.CylinderGeometry(rad, rad, len, 28, 60, false);
  const p = g.attributes.position;
  const rr = mulberry32(seed);
  const ph = [rr() * 6, rr() * 6, rr() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / len + 0.5; // 0..1 along the length
    const a = Math.atan2(z, x);
    const taper = Math.pow(Math.max(0.02, Math.sin(Math.PI * t)), 0.55);
    const lump = 1 + 0.18 * Math.sin(t * 13 + ph[0]) * Math.cos(a * 3 + ph[1]) + 0.1 * Math.sin(t * 31 + a * 5 + ph[2]) + 0.12 * Math.sin(t * 5 + 1.3);
    const r = taper * lump;
    p.setXYZ(i, x * r, y + Math.sin(a * 2 + t * 9) * len * 0.004, z * r * 0.82);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- the rock ----------
// (s, w): m along the axis, m round the girth (w wraps every CIRC; w = 0 is the top, +y)
const _d = new THREE.Vector3();
function radial(p, out = new THREE.Vector3()) { out.set(0, p.y, p.z); if (out.lengthSq() < 1e-8) out.set(0, 1, 0); return out.normalize(); }
function rad(p) { return Math.hypot(p.y, p.z); }

const PAD_DECK = 2.4; // launch pad deck height on its plinth (m)

// Mothership station: hovers SHIP_LIFT up, climbs to stay SHIP_OVER above you if you go higher (jets, a bounce), and
// swings in on arrival from round the far side.
const SHIP_LIFT = 92, SHIP_OVER = 70, SHIP_LIFT_MAX = 420; // m above the rock
const SHIP_ENTER = 5; // s: swing in from behind the rock
const SHIP_HIDE = Math.PI / 3; // start angle round the girth: 60°, below your horizon
// Above this altitude the beam and mines (both on the ground) can't reach you, so it spams the barrage.
const AIR_ALT = 14;
const DRONE_REBOOT = 10; // s a shot-down drone stays powered down

// The planet interface physics, camera and effects use (planet.js has the Moon's). Heights are from the axis.
class SpindleWorld {
  constructor() { this.colliders = null; this.lastLake = null; this.R = RC; this.craters = []; this.rails = []; }
  rimRailsNear() { return []; } // no grind rails here
  sw(p) { return [p.x, Math.atan2(p.z, p.y) * RC]; }
  surface(p, outN) {
    const [s, w] = this.sw(p);
    const h = heightAt(s, w);
    if (outN) {
      const e = 0.8;
      const hs = (heightAt(s + e, w) - heightAt(s - e, w)) / (2 * e);
      const hw = (heightAt(s, w + e) - heightAt(s, w - e)) / (2 * e);
      const up = radial(p, _d);
      const tw = new THREE.Vector3().crossVectors(AX, up); // toward +w
      outN.copy(up).addScaledVector(AX, -hs).addScaledVector(tw, -hw).normalize();
    }
    return RC + h;
  }
  ground(v, out = new THREE.Vector3(), lift = 0) {
    const r = this.surface(v) + lift;
    const up = radial(v, _d);
    return out.set(v.x, up.y * r, up.z * r);
  }
  altitude(p) { return rad(p) - this.surface(p); }
  // How far the drawn rock stands above the true ground at p (>= 0): the mesh is a 5 m grid of flat triangles over
  // heightAt, so in hollows it hides anything laid on the true surface.
  meshLift(p) {
    const [s, w] = this.sw(p);
    return Math.max(0, meshHeightAt(s, w) - heightAt(s, w));
  }
  visible(a, b, steps = 12) { const q = new THREE.Vector3(); for (let i = 1; i < steps; i++) { q.lerpVectors(a, b, i / steps); if (this.altitude(q) < -0.5) return false; } return true; }
  inLake() { return null; }
  update() {}
}

// a point on the rock, and a frame there (up away from the axis, forward along it)
function bandPoint(s, w, lift = 0) { return pointAt(s, w, RC + heightAt(s, w) + lift); }
function bandFrame(s, w, obj, lift = 0) {
  const p = bandPoint(s, w, lift);
  const up = radial(p);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, AX), up, AX);
  obj.position.copy(p);
  obj.quaternion.setFromRotationMatrix(m);
  return obj;
}
// a glowing tube through points on the rock
function groundLine(pts, r, color, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, r, 4, closed), glow(color));
}

// ---------- kit pieces ----------
const kits = new Map();
function bake(key, fn) { let r = kits.get(key); if (!r) { const k = new Kit(TEAL, 5, false); fn(k); r = k.finish(); kits.set(key, r); } return r.root.clone(); }

export const spire = (k) => {
  const rr = mulberry32(17);
  k.cyl(3.4, 4.2, 1.6, 7, T(0x4a4260), 0, 0, 0, { outline: 0.06 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, h = 4 + rr() * 6;
    k.add(new THREE.OctahedronGeometry(1, 0).scale(0.9, h / 1.6, 0.9), G(i % 2 ? TEAL : VIO), Math.cos(a) * 1.6, h * 0.45, Math.sin(a) * 1.6, { rx: Math.sin(a) * 0.3, rz: Math.cos(a) * 0.3, outline: 0.04 });
  }
};
export const obelisk = (k) => { k.box(2.2, 11, 0.9, T(0x0d0a14), 0, 0, 0, { outline: 0.08 }); k.box(0.12, 9, 0.92, G(TEAL), 0, 1, 0, { outline: 0 }); };
export const lander = (k) => {
  k.cyl(12, 12.5, 0.6, 28, T(0x5b5870), 0, 0, 0, { outline: 0.05 });
  k.ring(11.6, 0.2, G(0x2ec4ff), 0, 0.62, 0);
  // the Meridian rocket that brought you, on its fins
  k.cyl(2.4, 2.6, 18, 18, T(0xeeecf6), 0, 1.8, 0, { outline: 0.1 });
  k.cyl(2.45, 2.45, 2.2, 18, T(0x2ec4ff), 0, 10, 0, { outline: 0 });
  k.cyl(2.45, 2.45, 0.8, 18, T(0xffc83a), 0, 13, 0, { outline: 0 });
  k.add(new THREE.ConeGeometry(2.4, 6, 18), T(0xeeecf6), 0, 22.8, 0, { outline: 0.08 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.add(new THREE.BoxGeometry(0.3, 5, 3), T(0x2ec4ff), Math.cos(a) * 3, 3.6, Math.sin(a) * 3, { ry: -a, outline: 0.04 }); }
  k.cyl(1.6, 2.2, 1.8, 14, T(0x2a2440), 0, 0.6, 0, { outline: 0.04 });
  for (const sx of [-1, 1]) k.flag(sx * 9, 6, 8, 0x2ec4ff);
};
export const shrine = (k) => {
  k.cyl(16, 17, 0.6, 32, T(0x2a2440), 0, 0, 0, { outline: 0.06 });
  k.ring(15.6, 0.25, G(TEAL), 0, 0.62, 0);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.at(Math.cos(a) * 13, Math.sin(a) * 13, -a); obelisk(k); k.at(); }
  k.cyl(2.2, 2.8, 2.2, 8, T(0x0d0a14), 0, 0.6, 0, { outline: 0.06 });
  k.ring(2.3, 0.12, G(TEAL), 0, 2.8, 0);
};
// the extraction pad: a 32 m deck on a plinth with four ramps
const PAD_R = 16, RAMP_L = 12;
export const extract = (k) => {
  const D = PAD_DECK;
  k.cyl(PAD_R + 1.5, PAD_R + 2.2, 1.2, 36, T(0x3a3550), 0, -0.6, 0, { outline: 0.06 }); // footing
  k.cyl(PAD_R, PAD_R + 0.6, D, 36, T(0x5b5870), 0, 0, 0, { outline: 0.06 }); // plinth
  k.cyl(PAD_R + 0.2, PAD_R + 0.2, 0.3, 36, T(0x7a7690), 0, D - 0.3, 0, { outline: 0.04 }); // deck
  k.ring(PAD_R - 1.2, 0.3, G(0xffc83a), 0, D + 0.02, 0);
  k.ring(PAD_R * 0.45, 0.25, G(0x2ec4ff), 0, D + 0.02, 0);
  k.box(1.6, 0.06, PAD_R * 1.4, T(0xffc83a), 0, D + 0.02, 0, { outline: 0 });
  k.box(PAD_R * 1.4, 0.06, 1.6, T(0xffc83a), 0, D + 0.02, 0, { outline: 0 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.ball(0.35, G(0x2ec4ff), Math.cos(a) * (PAD_R - 0.4), D + 0.3, Math.sin(a) * (PAD_R - 0.4), { outline: 0 }); }
  // ramps at N, E, S, W with lamp masts between them
  // wedge: from the deck edge (deck height) down to the ground RAMP_L out; 7 wide
  const wedge = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(RAMP_L, 0), new THREE.Vector2(0, D)]);
  const wg = new THREE.ExtrudeGeometry(wedge, { depth: 7, bevelEnabled: false }).translate(0, 0, -3.5);
  const stripe = new THREE.BoxGeometry(Math.hypot(D, RAMP_L) * 0.92, 0.05, 0.5).rotateZ(-Math.atan2(D, RAMP_L)).translate(RAMP_L / 2, D / 2 + 0.04, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rx = Math.sin(a), rz = Math.cos(a);
    k.add(wg.clone(), T(0x6b6684), rx * (PAD_R - 0.05), 0, rz * (PAD_R - 0.05), { ry: a - Math.PI / 2, outline: 0.05 });
    k.add(stripe.clone(), G(0xffc83a), rx * (PAD_R - 0.05), 0, rz * (PAD_R - 0.05), { ry: a - Math.PI / 2, outline: 0 });
    const b = a + Math.PI / 4;
    k.cyl(0.25, 0.3, 9, 8, T(0x2a2440), Math.sin(b) * (PAD_R + 1), D, Math.cos(b) * (PAD_R + 1), { outline: 0.04 });
    k.ball(0.55, G(0xffc83a), Math.sin(b) * (PAD_R + 1), D + 9.2, Math.cos(b) * (PAD_R + 1), { outline: 0 });
  }
};

// the mothership: dark ribbed saucer, teal rim, glass dome, three weapon eyes
export function makeMothership() {
  const root = new THREE.Group();
  root.add(bake('mother', (k) => {
    k.add(new THREE.SphereGeometry(38, 36, 14).scale(1, 0.26, 1), T(0x241a33), 0, 0, 0, { outline: 0.4 });
    k.add(new THREE.TorusGeometry(37.5, 1.4, 6, 48).rotateX(Math.PI / 2), G(TEAL), 0, 0, 0, { outline: 0 });
    k.add(new THREE.SphereGeometry(14, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS(TEAL, 0.45), 0, 7, 0, { outline: 0 });
    k.add(new THREE.TorusGeometry(14.2, 0.6, 4, 32).rotateX(Math.PI / 2), T(0x3a2b4f), 0, 7, 0, { outline: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.add(new THREE.BoxGeometry(1.2, 2.2, 30), T(0x3a2b4f), Math.cos(a) * 20, 6.2, Math.sin(a) * 20, { ry: -a + Math.PI / 2, rx: 0.18, outline: 0.06 });
      k.add(new THREE.ConeGeometry(1.4, 9, 6).rotateX(Math.PI), T(0x1a1426), Math.cos(a) * 28, -9, Math.sin(a) * 28, { outline: 0.05 });
    }
    k.add(new THREE.CylinderGeometry(9, 6, 5, 16), T(0x1a1426), 0, -9, 0, { outline: 0.1 });
    k.add(new THREE.CircleGeometry(7, 20).rotateX(Math.PI / 2), G(VIO), 0, -11.6, 0, { outline: 0 });
  }));
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(40, 3, 6, 48), BEAM(TEAL, 0.18));
  glowRing.rotation.x = Math.PI / 2;
  root.add(glowRing);
  const eyes = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10), glow(PINK));
    pod.position.set(Math.cos(a) * 22, -8.5, Math.sin(a) * 22);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.5, 6, 18).rotateX(Math.PI / 2), toon(0x1a1426));
    ring.position.copy(pod.position);
    ink(ring, 0.06);
    root.add(pod, ring);
    eyes.push(pod);
  }
  return { root, eyes };
}

export function makeDrone() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), glow(PINK));
  core.userData.lit = core.material;
  core.userData.dark = toon(0x2a2236);
  g.userData.core = core;
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(1.7, 0), toon(0x241a33));
  ink(shell, 0.05);
  shell.scale.set(1, 0.6, 1);
  g.add(shell, core);
  for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 4), toon(0x3a2b4f)); const a = (i / 4) * Math.PI * 2; sp.position.set(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7); sp.rotation.z = -Math.PI / 2; sp.rotation.y = -a; g.add(sp); }
  return g;
}

// the Moon in the asteroid's sky (canvas craters)
function moonTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#b7b0c8'; x.fillRect(0, 0, 512, 256);
  const rr = mulberry32(4);
  for (let i = 0; i < 90; i++) { x.fillStyle = rr() < 0.5 ? 'rgba(90,82,110,0.55)' : 'rgba(220,214,235,0.5)'; x.beginPath(); x.ellipse(rr() * 512, rr() * 256, 4 + rr() * 26, 3 + rr() * 16, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = 'rgba(40,30,60,0.55)'; x.fillRect(300, 0, 212, 256); // dark side
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------------------------------------
export class Spindle {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.world = new SpindleWorld();
  }

  // Builds the rock in a worker (story.js calls this once the mission is under way) to avoid a ~2 s freeze at the
  // start. If it isn't ready in time, build() makes it.
  prefetch() {
    if (this.root || this.rockTried || typeof Worker === 'undefined') return;
    this.rockTried = true; // once: if the worker fails, build() makes it
    try {
      const wk = new Worker(new URL('./spindleWorker.js', import.meta.url), { type: 'module' });
      wk.onmessage = (e) => { if (!this.root) this.rockData = e.data; wk.terminate(); };
      wk.onerror = () => wk.terminate();
      wk.postMessage('build');
    } catch { /* no workers here */ }
  }

  // Built on first need (a lot of geometry to keep around otherwise).
  build() {
    if (this.root) return;
    const root = new THREE.Group();
    this.root = root;
    // the rock: a grid over (s, w) all the way round (spindleTerrain.js; usually prebuilt by prefetch's worker)
    const R = this.rockData || buildRockArrays();
    this.rockData = null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(R.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(R.col, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(R.nor, 3));
    geo.setIndex(new THREE.BufferAttribute(R.idx, 1));
    geo.computeBoundingSphere();
    const S0 = ROCK_S0, S1 = ROCK_S1;
    // double-sided: the rock is never a window onto the stars
    // toon bands with softened edges: hard ones traced the 7 m triangles as pale polygons under a low sun, a fully
    // smooth ramp made every bump a soft stain. A dark band then one gentle rise to full sun: a mid-to-bright step
    // lit every crater's outer slope as a pale smudge.
    const RAMP = [55, 55, 70, 125, 160, 195, 230, 255, 255];
    const ramp = new THREE.DataTexture(new Uint8Array(RAMP.flatMap((v) => [v, v, v, 255])), RAMP.length, 1, THREE.RGBAFormat);
    ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
    ramp.needsUpdate = true;
    const rock = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide }));
    // lit like the Moon's ground (toon.js KEEP_GRAZE_SHADOW): a crisp turn into shade facing away from the sun. The
    // props' wide fade darkens slopes within ~12° of edge-on, which under the roll's low sun smears dark patches.
    rock.material.defines = { KEEP_GRAZE_SHADOW: '' };
    rock.receiveShadow = true;
    // no self-shadow: double-sided and coarse, it breaks into patches and blotches at the roll's low sun angles.
    // Ship, drones, props and you still shadow it; toon shading does day and night.
    rock.castShadow = false;
    root.add(rock);
    // the blunt tips, capped
    for (const [sx, dir] of [[S0, -1], [S1, 1]]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshToonMaterial({ color: 0x3e3656, gradientMap: toon(0).gradientMap, side: THREE.DoubleSide }));
      cap.position.set(sx, 0, 0);
      cap.rotation.y = dir * Math.PI / 2;
      root.add(cap);
    }
    // the Monolith's veins: two glowing threads spiralling along the rock
    for (const off of [0, CIRC / 2]) {
      const vp = [];
      for (let s = 30; s < L - 30; s += 12) vp.push(bandPoint(s, off + (s / L) * CIRC * 1.5 + Math.sin(s / 97) * 18, 0.25));
      root.add(groundLine(vp, 0.35, TEAL));
    }
    // props: lander, crystal spires, shrine, extraction pad
    this.cols = [];
    const C = this.game.colliders;
    const place = (obj, s, w, lift = 0, colR = 0, colH = 0) => {
      bandFrame(s, w, obj, lift);
      root.add(obj);
      if (colR) this.cols.push(C.add({ type: 'cyl', c: obj.position.clone(), axis: radial(obj.position), y0: -1, y1: colH, r: colR }));
      return obj;
    };
    place(bake('lander', lander), START_S, 0, -0.2, 3, 24);
    const sr = mulberry32(29);
    // spires and obelisks all round (clear of the start line along the top)
    for (let i = 0; i < 220; i++) {
      const s = 420 + sr() * (L - 1000);
      let w = (sr() - 0.5) * CIRC;
      if (Math.abs(w) < 25) w += w < 0 ? -30 : 30;
      const o = place(bake('spire', spire), s, w, -0.4, 3.6, 8);
      o.scale.setScalar(0.8 + sr() * 0.9);
      o.rotateY(sr() * 6);
    }
    for (let i = 0; i < 80; i++) {
      const s = 450 + sr() * (L - 1000), w = (sr() - 0.5) * CIRC;
      const o = place(bake('obelisk', obelisk), s, w, -0.3, 1.6, 11);
      o.rotateY(sr() * 6);
    }
    place(bake('shrine', shrine), CORE_S, 0, -0.2);
    place(bake('extract', extract), PAD_S, 0, 0);
    this.padColliders();
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), glow(TEAL));
    this.core.add(new THREE.Mesh(new THREE.SphereGeometry(3, 16, 10), BEAM(TEAL, 0.22)));
    place(this.core, CORE_S, 0, 4.2);
    this.corePos = this.core.position.clone();
    this.padPos = bandPoint(PAD_S, 0, PAD_DECK + 0.6);
    // sky: stars, the Moon filling a quarter of it, a small Earth, the sun
    const sky = new THREE.Group();
    this.sky = sky;
    const N = 2500, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = sr() * 2 - 1, th = sr() * Math.PI * 2, q = Math.sqrt(1 - u * u); sp[i * 3] = q * Math.cos(th) * 7600; sp[i * 3 + 1] = u * 7600; sp[i * 3 + 2] = q * Math.sin(th) * 7600; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: 0xe8e8ff })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 32), new THREE.MeshBasicMaterial({ map: moonTexture() }));
    moon.position.set(0, -6800, 1200);
    sky.add(moon);
    this.moonMesh = moon;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 16), new THREE.MeshBasicMaterial({ color: 0x2f7fff }));
    earth.position.set(5200, 3000, -3200);
    sky.add(earth);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(170, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    sun.position.copy(SUN).multiplyScalar(7000);
    sun.lookAt(0, 0, 0);
    sky.add(sun);
    sky.add(makePlanets(SUN, 7100));
    root.add(sky);
    // mothership and extraction pod
    this.ship = makeMothership();
    // no shadow: 90 m up under the roll's low sun it lays huge crawling smudges across the rock
    this.ship.root.traverse((o) => { o.castShadow = false; });
    root.add(this.ship.root);
    const pod = makeShuttle({ color: 0xeeecf6, stripe: 0x2ec4ff });
    pod.setSign('EXTRACT');
    pod.root.scale.setScalar(0.6);
    pod.setGear(1);
    this.pod = pod;
    root.add(pod.root);
    pod.root.visible = false;
    this.root.visible = false;
    this.game.scene.add(root);
  }

  // ---------------------------------------------------------------------------------------------
  start(onDone) {
    const g = this.game;
    this.build();
    this.onDone = onDone;
    this.active = true;
    this.phase = 'cross';
    this.rec = null; // recovery transit in progress (recover())
    this.attackT = 6;
    this.attackN = 0;
    this.droneT = 14;
    this.drones = [];
    this.hazards = [];
    this.extractT = 0;
    this.gotCore = false;
    this.podCalled = false;
    this.spin = 0;
    // hide (and freeze) the Moon; this world takes over
    // (userData.persist objects, e.g. particles and skate ribbons, belong to every world and stay)
    this.hidden = g.scene.children.filter((o) => o.visible && o !== this.root && o !== g.player.model.root && !o.isLight && !o.userData.persist && o !== g.sun.target && o !== g.earthLight.target);
    for (const o of this.hidden) o.visible = false;
    this.root.visible = true;
    this.savedPlanet = g.planet;
    g.planet = this.world;
    // sky fill nearly even all round: it's most of the night-turn light, and the Moon's bright-above / dark-below split
    // turns every tilt of the curving ground into dark smudges. Similar overall brightness.
    this.savedHemi = [g.hemi.color.getHex(), g.hemi.groundColor.getHex()];
    g.hemi.color.setHex(0x8578d8);
    g.hemi.groundColor.setHex(0x6457ac);
    GRAV.axis = AX; // up is away from the rock's axis
    this.world.colliders = g.colliders;
    if (g.player.vehicle) g.garage.exit();
    if (g.garage.active) { g.garage.active.model.root.visible = false; }
    // the mothership's eyes are targets (each powers an attack; knock one out to stop it)
    this.eyes = this.ship.eyes.map((m, i) => ({ kind: 'alieneye', faction: 'beast', model: { root: m }, hp: 380, maxHp: 380, center: new THREE.Vector3(), radius: 4, dead: false, eye: i }));
    for (const e of this.eyes) g.enemies.list.push(e);
    this.ship.root.visible = true;
    this.shipS = 0;
    this.shipW = 0;
    this.pod.root.visible = false;
    this.core.visible = true;
    this.respawnAt(0);
    document.getElementById('minimap').style.visibility = 'hidden'; // it maps the Moon
    g.audio.boom(true);
    g.hud.alert('THE SPINDLE', '#7dffd4', 3);
    g.hud.toast('Cross the asteroid to the Quantum Core at the far end. It\'s round: run all the way round it if you like. Don\'t fall off the ends.', 6);
    this.shipArrive = 9; // s until the mothership turns up
    this.shipLift = SHIP_LIFT;
    this.shipEnter = 1;
    this.shipSide = 1;
    this.ship.root.visible = false;
  }

  respawnAt(i) {
    const g = this.game;
    const s = i < 0 ? PAD_S - 30 : START_S + 60;
    const p = bandPoint(s, 0, 1.5);
    const up = radial(p);
    const fwd = AX.clone();
    g.player.respawn(p, fwd);
    g.cam.fwd.copy(fwd);
    g.cam.up.copy(up);
    g.cam.pitch = -0.1;
    g.updateCamera(0.016, true); // snap behind you (else it swings in from the Moon, through the rock)
  }

  // fell off the rock (a K.O. gets recover() instead): back to the start, or the pad once you've the core
  respawn() { const g = this.game; this.respawnAt(this.gotCore ? -1 : 0); g.player.model.root.visible = true; g.player.dead = false; this.clearHazards(); }

  exit(quiet = false) {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    this.rec = null;
    for (const o of this.hidden || []) o.visible = true;
    document.getElementById('minimap').style.visibility = '';
    this.hidden = null;
    this.root.visible = false;
    g.planet = this.savedPlanet;
    if (this.savedHemi) { g.hemi.color.setHex(this.savedHemi[0]); g.hemi.groundColor.setHex(this.savedHemi[1]); this.savedHemi = null; }
    GRAV.axis = null; // back to the Moon's centre
    for (const c of this.cols || []) g.colliders.remove(c);
    this.cols = null;
    for (const e of [...(this.eyes || []), ...(this.drones || [])]) { e.dead = true; if (e.model.root.parent && e.kind === 'drone') e.model.root.removeFromParent(); }
    g.enemies.list = g.enemies.list.filter((e) => e.kind !== 'alieneye' && e.kind !== 'drone');
    this.clearHazards();
    g.player.setCargo(null);
    // back on the Moon, beside the launch complex
    const ml = g.locations.find((l) => l.id === 'monolith');
    if (ml) g.story.teleportTo(g.world.toWorld(ml, ml.r * 1.25 + 26, 0, 12).normalize(), quiet);
    // props were placed with the colliders: rebuild next time
    g.scene.remove(this.root);
    this.root = null;
  }

  // ---- recovery transit ----
  // A K.O. on the rock: a Meridian recovery craft lands beside you, medics stretcher you aboard and it flies you home
  // (medevac.js). You land at the Monolith's launch complex (exit()) and the mission restarts there
  // (story.retrySpindle). A cutscene: state 'cutscene', the scene drives its camera, main.js calls updateRecovery.
  recover() {
    const g = this.game;
    this.clearHazards(); // the beams would hang frozen over the rock
    // hide the mothership (eyes ride on it) and the drones: they'd hang frozen in frame
    this.recHidden = [this.ship.root, ...this.drones.map((d) => d.model.root)].filter((o) => o.visible);
    for (const o of this.recHidden) o.visible = false;
    this.rec = new Medevac(g, this);
    g.state = 'cutscene';
  }

  // the ground at (s, w) as drawn (above heightAt in hollows), `lift` m up
  groundAt(s, w, lift = 0) { return bandPoint(s, w, this.world.meshLift(bandPoint(s, w)) + lift); }

  // the roll: the sky (and sun) turns round the rock's axis
  rollSky(dt) {
    this.spin += dt;
    this.sky.quaternion.setFromAxisAngle(AX, this.spin * ((Math.PI * 2) / 140));
    this.sky.position.copy(this.game.camera.position);
  }

  updateRecovery(dt) {
    const r = this.rec;
    if (!r) return;
    const g = this.game;
    if (g.state !== 'cutscene') { this.endRecovery(); return; } // the game moved on (quit to menu)
    r.update(dt);
    this.rollSky(dt);
    if (r.done) this.finishRecovery();
  }

  // landed at the Monolith: the Spindle is over, the mission restarts from the launch complex
  finishRecovery() {
    const g = this.game, r = this.rec;
    this.rec = null;
    r.dispose();
    this.exit(true); // quiet: no teleport flash, you came by shuttle
    g.story.retrySpindle();
    g.hud.eventPanel(g.story.panel()); // else the stale Spindle chip shows for a frame as the HUD returns
    g.state = 'play';
    g.updateCamera(0.016, true);
    const bars = g.recall.bars;
    bars.classList.add('cb-out');
    setTimeout(() => bars.classList.add('hidden'), 400);
    if (r.dawn) { r.dawn.classList.add('out'); setTimeout(() => r.dawn.remove(), 1200); }
    g.hud.toast('Meridian\'s transit set you down at the launch complex. Head for the rocket to try again.', 5);
  }

  // the game left the cutscene (quit to menu): tidy up, go nowhere
  endRecovery() {
    const r = this.rec;
    this.rec = null;
    r.dispose();
    for (const o of this.recHidden || []) o.visible = true; // the Spindle carries on
    const bars = this.game.recall.bars;
    bars.classList.add('hidden');
    if (r.dawn) r.dawn.remove();
  }

  clearHazards() { for (const h of this.hazards || []) if (h.mesh) h.mesh.removeFromParent(); this.hazards = []; }

  // HUD waypoint (easy to get lost on a rock you can run round)
  objective() {
    if (!this.active || this.rec) return null; // nothing to chase during a recovery
    if (this.phase === 'cross' && !this.gotCore) return { pos: this.corePos, label: 'THE PACKAGE' };
    if (this.phase === 'extract') return { pos: this.padPos, label: this.podCalled ? 'EXTRACTION PAD · POD INBOUND' : 'EXTRACTION PAD' };
    return null;
  }

  progress() { const [s] = this.world.sw(this.game.player.pos); return Math.max(0, Math.min(1, s / L)); }

  status() {
    if (!this.active) return '';
    const [s] = this.world.sw(this.game.player.pos);
    if (this.phase === 'cross') return `Cross the Spindle · ${Math.max(0, (CORE_S - s) / 1000).toFixed(1)} km to the core`;
    if (this.phase === 'extract') return this.podCalled ? `Survive: the pod lands in ${Math.ceil(Math.max(0, this.extractT))} s` : `Get the Package to the extraction pad · ${Math.round(this.game.player.pos.distanceTo(this.padPos))} m`;
    return '';
  }

  // ---------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    if (!this.active) return;
    const P = g.player;
    const [s, w] = this.world.sw(P.pos);
    this.spin += dt;
    // the roll: the sky (and sun) turns round the rock's axis
    const q = new THREE.Quaternion().setFromAxisAngle(AX, this.spin * ((Math.PI * 2) / 140));
    this.sky.quaternion.copy(q);
    this.sky.position.copy(g.camera.position);
    const sunDir = SUN.clone().applyQuaternion(q);
    const up = P.up;
    const day = THREE.MathUtils.smoothstep(up.dot(sunDir), -0.15, 0.2);
    // no sun on the night turn (shining through the rock smears shadow blotches); the Moon's glow lights it
    g.sun.intensity = 1.7 * day;
    g.hemi.position.copy(up);
    g.hemi.intensity = 0.95; // moonlight from below keeps the night turn readable
    g.earthLight.intensity = 0.25;
    // shadow box follows you in whole shadow-map texels along the light's axes (main.js updateLighting): no shimmer
    const lz = sunDir.clone().normalize(), lx = new THREE.Vector3(0, 1, 0).cross(lz).normalize(), ly = lz.clone().cross(lx);
    const snap = 320 / 2048;
    const sp = lx.multiplyScalar(Math.round(P.pos.dot(lx) / snap) * snap).addScaledVector(ly, Math.round(P.pos.dot(ly) / snap) * snap).addScaledVector(lz, P.pos.dot(lz));
    g.sun.target.position.copy(sp);
    g.sun.position.copy(sp).addScaledVector(sunDir, 600);
    g.earthLight.target.position.copy(P.pos);
    g.earthLight.position.copy(P.pos).addScaledVector(new THREE.Vector3(0, -1, 0).applyQuaternion(q), 600); // moonlight from below
    g.renderer.shadowMap.autoUpdate = true;
    // off either end: lost to the void, back to the start (or the pad, with the core)
    if (s < -30 || s > L + 30 || rad(P.pos) < RC - 150) {
      g.fx.pop('LOST TO THE VOID', null, { color: '#ff2e88', size: 60 });
      g.damagePlayer(20, 'void');
      if (!P.dead) this.respawn();
    }
    // the core
    this.core.rotation.y += dt * 1.8;
    if (this.phase === 'cross' && !this.gotCore && P.center.distanceTo(this.corePos) < 6) {
      this.gotCore = true;
      this.core.visible = false;
      P.setCargo(TEAL);
      this.phase = 'extract';
      this.extractT = 35;
      g.hud.alert('THE CORE IS YOURS — HOLD THE EXTRACTION PAD!', '#7dffd4', 4);
      g.cam.shake = 0.8;
      g.audio.boom(true);
      this.pod.root.visible = true;
    }
    if (this.phase === 'extract') {
      // reaching the pad calls the pod; it comes whatever you do after
      if (!this.podCalled && P.pos.distanceTo(this.padPos) < 70) {
        this.podCalled = true;
        g.hud.alert('POD INBOUND — SURVIVE!', '#7dffd4', 3);
        g.audio.tone(660, 0.5, 'triangle', 0.15, 1.5);
      }
      if (this.podCalled) this.extractT -= dt;
      // pod descends over the pad
      const t = Math.max(0, this.extractT / 35);
      const up2 = radial(this.padPos);
      this.pod.root.position.copy(this.padPos).addScaledVector(up2, 2 + t * 420);
      this.pod.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up2);
      if (this.extractT <= 0) { this.phase = 'done'; this.finish(); return; }
    }
    this.updateShip(dt, s, w);
    this.updateHazards(dt);
    this.updateDrones(dt);
  }

  updateShip(dt, s, w) {
    const g = this.game;
    const P = g.player;
    // it gets AHEAD: parks over where your speed along the rock takes you, and follows round the girth (the short way)
    const along = P.vel.dot(AX);
    // never past the tapered ends: holds station over the terrain there
    const want = Math.min(L - 260, Math.max(260, s + 60 + Math.max(0, along) * 2.2));
    if (this.shipArrive > 0) {
      this.shipArrive -= dt;
      if (this.shipArrive <= 0) {
        // appears ahead of you on one flank, out of sight round the curve as if lying in wait, then swings up over the
        // top onto station
        this.ship.root.visible = true;
        this.shipS = want;
        this.shipSide = Math.random() < 0.5 ? -1 : 1;
        this.shipW = wrapW(w + this.shipSide * SHIP_HIDE * RC);
        this.shipLift = SHIP_LIFT;
        this.shipEnter = 0;
        this.attackT = Math.max(this.attackT, SHIP_ENTER * 0.7); // no shots from behind the rock: fires as it clears the horizon
        g.hud.alert('SOMETHING IS RISING AHEAD', '#ff2e88', 4);
        g.audio.tone(70, 1.4, 'sawtooth', 0.3, 0.4);
        g.cam.shake = 1;
      }
      return;
    }
    this.shipS += Math.max(-140, Math.min(140, (want - this.shipS) * 1.4)) * dt;
    this.shipS = Math.min(L - 260, Math.max(200, this.shipS));
    // while swinging in, its station is offset round the girth, easing to zero
    this.shipEnter = Math.min(1, this.shipEnter + dt / SHIP_ENTER);
    const hide = this.shipSide * SHIP_HIDE * RC * (1 - smooth(0, 1, this.shipEnter));
    const round = P.vel.dot(new THREE.Vector3().crossVectors(AX, P.up));
    this.shipW = wrapW(this.shipW + wrapW(w + round * 1.2 + hide - this.shipW) * Math.min(1, dt * 1.2));
    // tracks your height too: SHIP_LIFT over the rock below it, or SHIP_OVER above you if higher. Rises fast, settles slowly.
    const need = THREE.MathUtils.clamp(rad(P.pos) + SHIP_OVER - (RC + heightAt(this.shipS, this.shipW)), SHIP_LIFT, SHIP_LIFT_MAX);
    this.shipLift += THREE.MathUtils.clamp((need - this.shipLift) * 2, -35, 90) * dt;
    bandFrame(this.shipS, this.shipW, this.ship.root, this.shipLift);
    this.ship.root.rotateY(this.spin * 0.25);
    for (const e of this.eyes) {
      if (e.dead) {
        e.downT = (e.downT ?? 15) - dt;
        if (e.downT <= 0) {
          // re-armed: back on the hull
          e.dead = false; e.hp = e.maxHp; e.downT = undefined;
          this.ship.root.add(e.model.root);
          g.fx.pop('WEAPON RE-ARMED', e.center.clone(), { color: '#ff2e88', size: 44 });
        }
      }
      e.model.root.getWorldPosition(e.center);
      e.model.root.visible = !e.dead;
    }
    // attacks: each live eye powers one (barrage, beam, mines), faster after the core. Above AIR_ALT only the barrage
    // reaches you, so it throws only that
    this.attackT -= dt;
    if (this.attackT <= 0) {
      const live = this.eyes.filter((e) => !e.dead).map((e) => e.eye);
      const air = this.world.altitude(P.pos) > AIR_ALT;
      this.attackT = air ? (this.gotCore ? 1.1 : 1.5) : (this.gotCore ? 1.8 : 2.6);
      if (live.length) {
        const kind = air ? (live.includes(0) ? 0 : -1) : live[this.attackN++ % live.length];
        if (kind === 0) this.barrage();
        else if (kind === 1) {
          // past halfway: two beams from opposite sides, sweeping toward each other either side of your line
          if (s > L / 2) { this.sweep(s, w, -5.5, 1); this.sweep(s, w, 5.5, -1); } else this.sweep(s, w);
        }
        else if (kind === 2) this.mines(s, w);
      }
    }
    this.droneT -= dt;
    // at most three drones (shot-down ones reboot rather than being replaced)
    if (this.droneT <= 0) { this.droneT = this.gotCore ? 5 : 7; if (this.drones.length < 3) this.spawnDrone(); }
  }

  shipBelly() { return this.ship.root.localToWorld(new THREE.Vector3(0, -12, 0)); }

  // 1: plasma barrage: a stream of leading bolts walked onto you, plus a wide spray over wherever you might swerve
  barrage() {
    const g = this.game;
    const P = g.player;
    for (let i = 0; i < 14; i++) g.schedule(i * 0.056, () => {
      if (!this.active || P.dead) return;
      const from = this.shipBelly();
      const aim = P.center.clone().addScaledVector(P.vel, from.distanceTo(P.center) / 120).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
      g.projectiles.fire('alien', from, aim.sub(from).normalize().multiplyScalar(120), { damage: 7, splash: 2.5, color: PINK, size: 0.6, knock: 0.5 });
    });
    const side = new THREE.Vector3().crossVectors(AX, P.up);
    for (let i = 0; i < 26; i++) g.schedule(0.16 + Math.random() * 0.88, () => {
      if (!this.active || P.dead) return;
      const from = this.shipBelly();
      const spot = P.center.clone().addScaledVector(P.vel, 0.6 + Math.random() * 0.8).addScaledVector(side, (Math.random() - 0.5) * 80).addScaledVector(AX, (Math.random() - 0.3) * 60);
      g.projectiles.fire('alien', from, spot.sub(from).normalize().multiplyScalar(95), { damage: 6, splash: 3, color: VIO, size: 0.5, knock: 0.4 });
    });
    g.audio.tone(180, 0.3, 'square', 0.15, 0.3);
    g.audio.tone(90, 0.8, 'sawtooth', 0.1, 0.5);
  }

  // 2: a beam sweeping round the rock. Its track shows first (pulsing hazard stripes), then it burns along it,
  // leaving a glowing scorch.
  sweep(s, w, ds = 0, dir = 1) {
    const g = this.game;
    const s0 = s + 30 + Math.max(0, g.player.vel.dot(AX)) * 1.3 + ds;
    const W = 170; // arc either side of you round the girth (m)
    const HW = 4.5; // track half width (m)
    const P = [], U = [], V = [], idx = [];
    const n = Math.ceil((W * 2) / 3);
    for (let i = 0; i <= n; i++) {
      const ww = w - W + (i / n) * W * 2;
      for (const side of [-1, 1]) { const q = bandPoint(s0 + side * HW, ww, 0.2); P.push(q.x, q.y, q.z); U.push(dir > 0 ? i / n : 1 - i / n); V.push(side); }
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1));
    geo.setAttribute('aV', new THREE.Float32BufferAttribute(V, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { pulse: { value: 1 }, prog: { value: -1 }, fade: { value: 1 }, len: { value: W * 2 } },
      vertexShader: 'attribute float aU; attribute float aV; varying float vU; varying float vV; void main(){ vU=aU; vV=aV; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float pulse; uniform float prog; uniform float fade; uniform float len; varying float vU; varying float vV;
        void main(){
          float edge = step(0.78, abs(vV));
          float hatch = step(0.5, fract(vU * len / 5.0 + vV * 0.6));
          // ahead of the beam: the warning; behind it: the burn
          float burnt = step(vU, prog);
          float warn = (edge * (0.55 + 0.45 * pulse) + (1.0 - edge) * hatch * 0.28) * (1.0 - burnt);
          float hot = burnt * smoothstep(0.0, 0.08, prog - vU + 0.001) ;
          float core = 1.0 - abs(vV);
          vec3 scorch = mix(vec3(0.12, 0.05, 0.1), vec3(1.0, 0.45, 0.15), core * (1.0 - smoothstep(0.0, 0.25, prog - vU)));
          float a = warn + burnt * (0.35 + 0.5 * core) * fade;
          if (a < 0.01) discard;
          vec3 c = mix(mix(vec3(1.0, 0.16, 0.29), vec3(1.0, 0.82, 0.25), edge * 0.25), scorch, burnt);
          gl_FragColor = vec4(c, a);
        }`,
    });
    const line = new THREE.Mesh(geo, mat);
    line.renderOrder = 3;
    this.root.add(line);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 1, 12, 1, true), BEAM(PINK, 0.7));
    beam.visible = false;
    this.root.add(beam);
    this.hazards.push({ type: 'sweep', s: s0, w0: w, W, dir, twin: ds !== 0, t: 0, line, beam, mesh: line, hitCd: 0 });
  }

  // 3: mines where your velocity puts you when they burst: a tight cluster there and a wider scatter round it
  mines(s, w) {
    const g = this.game;
    const P = g.player;
    const T = 1.8; // fuse (s): time to read them and pick a gap
    const side = new THREE.Vector3().crossVectors(AX, radial(P.pos)).normalize(); // +w
    const vs = P.vel.dot(AX), vw = P.vel.dot(side);
    const ps = s + vs * T, pw = w + vw * T;
    const R = 10; // ring radius (m); rings never stack
    const placed = [];
    for (let i = 0; i < 14; i++) {
      // a few on your line, the rest wide: a field to thread, not a carpet
      const tight = i < 4;
      const spread = tight ? 26 : 110;
      let ms = 0, mw = 0;
      for (let k = 0; k < 8; k++) {
        ms = ps + (Math.random() - (tight ? 0.5 : 0.35)) * spread; mw = pw + (Math.random() - 0.5) * spread;
        if (placed.every(([a, b]) => Math.hypot(a - ms, b - mw) > R * 1.9)) break;
      }
      placed.push([ms, mw]);
      const p = bandPoint(ms, mw, 0.3);
      g.fx.warningRing(p, R, T);
      g.schedule(T, () => { if (this.active) g.explode(p.clone().addScaledVector(radial(p), 1), R, 26, 'alien', 1.4); });
    }
  }

  updateHazards(dt) {
    const g = this.game;
    const P = g.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;
      if (h.type === 'sweep') {
        const U = h.line.material.uniforms;
        U.pulse.value = 0.5 + 0.5 * Math.sin(h.t * 22);
        if (h.t < 1.1) continue;
        const k = (h.t - 1.1) / 2.2;
        U.prog.value = Math.min(1, k);
        // scorch fades for a couple of seconds after the beam
        if (k > 1) { h.beam.visible = false; U.fade.value = Math.max(0, 1 - (k - 1) * 1.1); if (k > 2) { h.line.removeFromParent(); h.beam.removeFromParent(); this.hazards.splice(i, 1); } continue; }
        const gw = h.w0 - h.dir * h.W + h.dir * k * h.W * 2;
        const gp = bandPoint(h.s, gw, 0);
        const from = this.shipBelly();
        // a twin beam leaves from its own side of the hull
        if (h.twin) from.addScaledVector(new THREE.Vector3().crossVectors(radial(from), AX).normalize(), -h.dir * 22);
        h.beam.visible = true;
        h.beam.position.lerpVectors(from, gp, 0.5);
        h.beam.scale.set(1, from.distanceTo(gp), 1);
        h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), gp.clone().sub(from).normalize());
        if (Math.random() < dt * 8) g.fx.explosion(gp.clone(), 2.5, false);
        h.hitCd -= dt;
        if (h.hitCd <= 0 && !P.dead && P.center.distanceTo(gp) < 5.5) { h.hitCd = 0.5; g.damagePlayer(32, 'alien'); g.fx.pop('SEARED!', null, { color: '#ff2e88', size: 50 }); }
      }
    }
  }

  // 4: drones: spiked gunships pacing you off each flank, a little ahead, firing short bursts. Shot down, one goes dark
  // and can't fire for DRONE_REBOOT s, keeping its place meanwhile.
  spawnDrone() {
    const g = this.game;
    const m = makeDrone();
    const from = this.shipBelly();
    m.position.copy(from);
    this.root.add(m);
    const side = this.drones.length % 2 ? 1 : -1;
    const e = { kind: 'drone', faction: 'beast', model: { root: m }, hp: 40, maxHp: 40, center: from.clone(), radius: 1.8, dead: false, vel: new THREE.Vector3(), wob: Math.random() * 6, side, slot: 18 + Math.random() * 16, fireCd: 1 + Math.random() * 1.5 };
    this.drones.push(e);
    g.enemies.list.push(e);
  }

  updateDrones(dt) {
    const g = this.game;
    const P = g.player;
    const up = P.up;
    // your heading on the rock (the axis when standing still)
    const fwd = P.vel.clone().addScaledVector(up, -P.vel.dot(up));
    const sp = fwd.length();
    if (sp > 3) fwd.divideScalar(sp); else fwd.copy(AX);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    for (const d of this.drones) {
      // shot down: dark and silent for DRONE_REBOOT s but still keeping station
      if (d.dead && !(d.downT > 0)) {
        d.downT = DRONE_REBOOT;
        d.model.root.userData.core.material = d.model.root.userData.core.userData.dark;
        this.root.add(d.model.root); // the kill removed it from the scene
      }
      if (d.downT > 0) {
        d.downT -= dt;
        if (d.downT <= 0) {
          d.dead = false; d.hp = d.maxHp; d.fireCd = 1.5;
          d.model.root.userData.core.material = d.model.root.userData.core.userData.lit;
          if (d.center.distanceTo(P.center) < 200) g.fx.pop('DRONE REBOOTED', d.center.clone(), { color: '#ff2e88', size: 40 });
          g.audio.tone(300, 0.4, 'sawtooth', 0.06, 3);
        }
      }
      const down = d.dead;
      d.wob += dt * 2.4;
      const goal = P.center.clone().addScaledVector(right, d.side * d.slot).addScaledVector(up, 8 + Math.sin(d.wob) * 3).addScaledVector(fwd, 6 + Math.min(40, sp * 0.3) + Math.cos(d.wob * 0.7) * 5);
      const want = goal.sub(d.center).multiplyScalar(2.4);
      if (want.length() > 95) want.setLength(95);
      d.vel.lerp(want.add(P.vel.clone().multiplyScalar(0.6)), Math.min(1, dt * 3));
      d.center.addScaledVector(d.vel, dt);
      const floor = this.world.surface(d.center) + 3;
      if (rad(d.center) < floor) this.world.ground(d.center, d.center, 3);
      d.model.root.position.copy(d.center);
      d.model.root.rotation.y += dt * (down ? 0.6 : 4);
      if (down) continue;
      // short bursts, leading you
      d.fireCd -= dt;
      const dist = d.center.distanceTo(P.center);
      if (d.fireCd <= 0 && dist < 160 && !P.dead) {
        d.fireCd = 1.1 + Math.random() * 0.8;
        for (let i = 0; i < 3; i++) g.schedule(i * 0.09, () => {
          if (d.dead || !this.active || P.dead) return;
          // fast leading bolts with a little splash, so a moving runner still gets clipped
          const aim = P.center.clone().addScaledVector(P.vel, d.center.distanceTo(P.center) / 150).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5));
          g.projectiles.fire('alien', d.center.clone(), aim.sub(d.center).normalize().multiplyScalar(150), { damage: 5, splash: 1.4, color: PINK, size: 0.3, knock: 0.2 });
        });
        if (dist < 90) g.audio.tone(1300, 0.06, 'square', 0.04, 0.6);
      }
    }
  }

  // launch pad plinth and ramps as colliders
  padColliders() {
    const C = this.game.colliders;
    const p = bandPoint(PAD_S, 0, 0);
    const up = radial(p);
    const fwd = AX.clone();
    const right = new THREE.Vector3().crossVectors(up, fwd);
    this.cols.push(C.add({ type: 'cyl', c: p.clone(), axis: up.clone(), y0: -3, y1: PAD_DECK, r: PAD_R }));
    const slope = Math.atan2(PAD_DECK, RAMP_L), hyp = Math.hypot(PAD_DECK, RAMP_L);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      // ramp run (outward) and surface normal
      const out = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
      const along = out.clone().multiplyScalar(Math.cos(slope)).addScaledVector(up, -Math.sin(slope)); // down the ramp
      const n = new THREE.Vector3().crossVectors(along, new THREE.Vector3().crossVectors(up, out)).normalize();
      if (n.dot(up) < 0) n.negate();
      const side = new THREE.Vector3().crossVectors(n, along).normalize();
      // top face matches the wedge: deck edge at deck height down to the ground
      const c = p.clone().addScaledVector(out, PAD_R + RAMP_L / 2).addScaledVector(up, PAD_DECK / 2).addScaledVector(n, -0.3);
      this.cols.push(C.add({ type: 'box', c, ax: side, ay: n, az: along, hx: 3.5, hy: 0.3, hz: hyp / 2 }));
    }
  }

  finish() {
    const g = this.game;
    const done = this.onDone;
    g.hud.alert('EXTRACTED!', '#7dffd4', 3);
    g.fx.explosion(this.padPos.clone(), 10, true);
    const el = document.createElement('div');
    el.id = 'dawn';
    el.innerHTML = '<div class="dw-t">BACK TO THE MOON</div><div class="dw-s">THE QUANTUM CORE IS ABOARD</div>';
    document.body.appendChild(el);
    setTimeout(() => {
      this.exit();
      el.remove();
      if (done) done();
    }, 2600);
  }
}
