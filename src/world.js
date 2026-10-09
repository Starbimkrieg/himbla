import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, ink, inkMat, glow, textSprite, setMask } from './toon.js';
import { makeDish, makeFigure, makeRover, makeRocket, makeShuttle } from './models.js';
import { mulberry32 } from './rng.js';
import { FACTIONS } from './locations.js';
import { SUN, frameQuat, arcDist, dirFromAngles } from './geo.js';
import { buildCasino } from './casinoWorld.js'; // casino
import { Traffic } from './traffic.js';
import { buildHelium, buildMeridian, buildFunpark, dressLab, dressMonolith, buildTown, dressIlmb, dressBase, dressArray, buildDen, buildPirateCamp, jobTerminal, part as kitPart } from './settlements.js';
import { T as KT, G as KG } from './outpostModels.js';

function mesh(geo, mat, outline = 0.15) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ACTIVE_DIST = 2600;
// Culling (all cheap, all per frame): a settlement within ACTIVE_DIST still leaves the scene while a
// hill or the moon's curve hides it from the camera (terrain line of sight to its top); within one
// that is drawn, small static props (ink and all) are binned into 60 m cells and a cell's props stop
// drawing beyond DETAIL_DIST of the camera. Hidden props are switched off through their layer mask
// (setMask), so game code toggling .visible never fights it.
const SHOW_NEAR = 300;   // closer than loc.r + this: always drawn
const DETAIL_DIST = 260; // a detail cell further than this: its props off
const DETAIL_CELL = 60;
const DETAIL_R = 1.8;    // "small": bounding radius under this (metres)
const _los = new THREE.Vector3(), _lp = new THREE.Vector3();

// Static-geometry batcher: parts are baked into one merged mesh per material plus a single
// merged ink (outline) shell, so a whole compound costs a handful of draw calls.
const _bm = new THREE.Matrix4(), _bh = new THREE.Matrix4(), _bt = new THREE.Matrix4();
const _bp = new THREE.Vector3(), _bs = new THREE.Vector3(), _bc = new THREE.Vector3(), _bz = new THREE.Vector3();
const _bq = new THREE.Quaternion(), _be = new THREE.Euler();
function prepGeo(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.clearGroups();
  return g;
}
class Batch {
  constructor() {
    this.byMat = new Map();
    this.ink = [];
    this.base = new THREE.Matrix4();
  }

  // Sets the frame that following parts are placed in (settlement-local x, z, yaw, y).
  at(x = 0, z = 0, yaw = 0, y = 0) {
    this.base.makeRotationY(yaw).setPosition(x, y, z);
    return this;
  }

  add(geo, mat, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, outline = 0.12, order = 'XYZ' } = {}) {
    _bm.compose(_bp.set(x, y, z), _bq.setFromEuler(_be.set(rx, ry, rz, order)), _bs.set(sx, sy, sz)).premultiply(this.base);
    let list = this.byMat.get(mat);
    if (!list) this.byMat.set(mat, (list = []));
    list.push(prepGeo(geo).applyMatrix4(_bm));
    if (outline) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getSize(_bz);
      geo.boundingBox.getCenter(_bc);
      // same inflated-hull rule as toon.ink(), sized in post-scale units
      const kx = 1 + (2 * outline) / Math.max(_bz.x * sx, 0.02), ky = 1 + (2 * outline) / Math.max(_bz.y * sy, 0.02), kz = 1 + (2 * outline) / Math.max(_bz.z * sz, 0.02);
      _bh.makeTranslation(_bc.x, _bc.y, _bc.z).multiply(_bt.makeScale(kx, ky, kz)).multiply(_bt.makeTranslation(-_bc.x, -_bc.y, -_bc.z)).premultiply(_bm);
      this.ink.push(prepGeo(geo).applyMatrix4(_bh));
    }
    return this;
  }

  build(world, loc) {
    const g = new THREE.Group();
    for (const [mat, list] of this.byMat) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = m.receiveShadow = !mat.transparent;
      if (mat.transparent) m.renderOrder = 2;
      g.add(m);
    }
    if (this.ink.length) {
      const h = new THREE.Mesh(mergeGeometries(this.ink), inkMat);
      h.userData.isInk = true;
      g.add(h);
    }
    for (const list of this.byMat.values()) for (const geo of list) geo.dispose();
    this.byMat.clear();
    this.ink.length = 0;
    world.put(g, loc, 0, 0);
    return g;
  }
}

// Builds everything that sits on the moon. Each settlement lives in its own local frame
// (Y = local up, XZ = its flat plateau) and is only attached to the scene while the
// camera is close enough to see it.
export class World {
  constructor(scene, planet, colliders, locations) {
    this.scene = scene;
    this.planet = planet;
    this.colliders = colliders;
    this.locations = locations;
    this.spinners = [];
    this.blinkers = [];
    this.dishes = [];
    this.figures = [];
    this.vehicles = [];
    this.crawlers = [];
    this.zoneWalls = [];
    this.walkers = []; // foot traffic inside the ILMB skywalks
    this.anims = []; // moving parts of kit-built settlements (settlements.js): { loc, list, seed }
    this.rides = []; // rideable funpark rides (rides.js): { loc, name, seats: [{ obj, local, face }], camDist, exitDir(p, out) }
    this._mats = new Map();
    this.rand = mulberry32(42);

    this.buildSky();
    for (const loc of locations) this.buildLocation(loc);
    this.buildLakes();
    this.buildCrystals();
    this.buildTraffic(); // after the lakes: roads steer around them
    for (const loc of locations) this.prepCulling(loc);
  }

  // Each settlement's height (for the line-of-sight test) and its small props (for detail culling).
  prepCulling(loc) {
    const G = loc.group;
    G.updateMatrixWorld(true);
    const base = loc.pos.length();
    let top = 20;
    const seen = new Set();
    loc.detail = [];
    const cells = new Map();
    G.traverse((o) => {
      if (!o.geometry || seen.has(o)) return;
      const gg = o.geometry;
      if (!gg.boundingSphere) gg.computeBoundingSphere();
      if (!gg.boundingSphere || !isFinite(gg.boundingSphere.radius)) return;
      const r = gg.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
      _lp.copy(gg.boundingSphere.center).applyMatrix4(o.matrixWorld);
      if (r < 400) top = Math.max(top, _lp.length() + r - base);
      // (only frozen static props: anything that moves, animates or gets reparented stays out)
      if (o.isMesh && !o.isInstancedMesh && !o.matrixAutoUpdate && !(o.userData && o.userData.isInk) && r < DETAIL_R) {
        const key = `${Math.round(_lp.x / DETAIL_CELL)},${Math.round(_lp.y / DETAIL_CELL)},${Math.round(_lp.z / DETAIL_CELL)}`;
        if (!cells.has(key)) cells.set(key, { c: new THREE.Vector3(), n: 0, objs: [], on: true });
        const cell = cells.get(key);
        cell.c.add(_lp);
        cell.n++;
        o.traverse((c) => { if (!seen.has(c)) { seen.add(c); loc.detail.push(c); cell.objs.push(c); } });
      }
    });
    loc.cells = [...cells.values()];
    for (const c of loc.cells) c.c.divideScalar(c.n);
    loc.topH = Math.min(top, 400);
    loc.shown = false; // (the group joins the scene on the first update in range)
    loc.occluded = false;
  }

  // Terrain-only line of sight from the camera to point p raised by `lift` (a dip of a few metres
  // under the ground along the way blocks it; ridges thinner than a sample step can slip through,
  // which only ever errs towards drawing).
  lineOfSight(cam, p, lift = 0) {
    _los.copy(p).normalize().multiplyScalar(p.length() + lift);
    const steps = Math.min(40, Math.max(8, Math.ceil(cam.distanceTo(_los) / 50)));
    for (let i = 1; i < steps; i++) {
      _lp.lerpVectors(cam, _los, i / steps);
      if (this.planet.altitude(_lp) < -3) return false;
    }
    return true;
  }



  r() { return this.rand(); }

  // Shared materials for batched geometry (a batch merges per material object).
  glowM(color) {
    const k = 'g' + color;
    if (!this._mats.has(k)) this._mats.set(k, glow(color));
    return this._mats.get(k);
  }

  glassM(color, opacity = 0.2) {
    const k = `x${color}/${opacity}`;
    if (!this._mats.has(k)) this._mats.set(k, new THREE.MeshToonMaterial({ color, gradientMap: toon(0).gradientMap, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    return this._mats.get(k);
  }

  buildSky() {
    const sky = new THREE.Group();
    this.sky = sky;
    const N = 3000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(th) * 7000;
      pos[i * 3 + 1] = u * 7000;
      pos[i * 3 + 2] = s * Math.sin(th) * 7000;
      col[i * 3] = 0.8 + Math.random() * 0.2; col[i * 3 + 1] = 0.8 + Math.random() * 0.2; col[i * 3 + 2] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true })));

    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1f6fff'; ctx.fillRect(0, 0, 512, 256);
    const rr = mulberry32(7);
    ctx.fillStyle = '#3ad15a';
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.ellipse(rr() * 512, 40 + rr() * 176, 20 + rr() * 60, 12 + rr() * 34, rr() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.ellipse(rr() * 512, rr() * 256, 10 + rr() * 50, 3 + rr() * 8, rr() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(0, 0, 512, 14); ctx.fillRect(0, 242, 512, 14);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Earth hangs over the near side; it is never visible from the dark side
    this.earthDir = dirFromAngles(14, 200);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(420, 40, 24), new THREE.MeshBasicMaterial({ map: tex }));
    earth.position.copy(this.earthDir).multiplyScalar(6000);
    const hull = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide }));
    hull.scale.setScalar(1.035);
    earth.add(hull);
    const atmo = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.25, side: THREE.BackSide }));
    atmo.scale.setScalar(1.08);
    earth.add(atmo);
    this.earth = earth;
    sky.add(earth);

    const sun = new THREE.Mesh(new THREE.CircleGeometry(160, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    sun.position.copy(SUN).multiplyScalar(6200);
    sun.lookAt(0, 0, 0);
    sky.add(sun);
    const burst = new THREE.Mesh(new THREE.RingGeometry(170, 260, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5 }));
    burst.position.copy(sun.position);
    burst.lookAt(0, 0, 0);
    sky.add(burst);
    this.scene.add(sky);
  }

  // ---------- local-frame helpers ----------
  frame(loc) {
    const g = new THREE.Group();
    // local +Z points sunward along the surface (consistent lighting per layout)
    frameQuat(loc.dir, SUN, g.quaternion);
    g.position.copy(loc.dir).multiplyScalar(loc.zr);
    g.updateMatrixWorld(true);
    loc.group = g;
    loc.pos = g.position.clone();
    loc.active = false;
    return g;
  }

  toWorld(loc, x, y, z, out = new THREE.Vector3()) {
    return loc.group.localToWorld(out.set(x, y, z));
  }

  col(loc, spec) {
    const g = loc.group;
    if (spec.type === 'sphere') {
      return this.colliders.add({ type: 'sphere', c: this.toWorld(loc, spec.x, spec.y, spec.z), r: spec.r });
    }
    if (spec.type === 'cyl') {
      return this.colliders.add({ type: 'cyl', c: this.toWorld(loc, spec.x, 0, spec.z), axis: loc.dir.clone(), y0: spec.y0, y1: spec.y1, r: spec.r });
    }
    if (spec.type === 'hcyl') {
      // a horizontal cylinder (axis along local (sin yaw, 0, cos yaw)), so arched roofs are round to bump into
      const axis = new THREE.Vector3(Math.sin(spec.yaw || 0), 0, Math.cos(spec.yaw || 0)).applyQuaternion(g.quaternion);
      return this.colliders.add({ type: 'cyl', c: this.toWorld(loc, spec.x, spec.y, spec.z), axis, y0: -spec.len / 2, y1: spec.len / 2, r: spec.r, caps: true });
    }
    // yaw, then an optional pitch about the box's own x (ramps and bowl walls tilt their top face)
    _q.setFromEuler(_e.set(spec.pitch || 0, spec.yaw || 0, spec.roll || 0, 'YXZ')).premultiply(g.quaternion);
    return this.colliders.add({
      type: 'box', c: this.toWorld(loc, spec.x, spec.y, spec.z),
      ax: new THREE.Vector3(1, 0, 0).applyQuaternion(_q), ay: new THREE.Vector3(0, 1, 0).applyQuaternion(_q), az: new THREE.Vector3(0, 0, 1).applyQuaternion(_q),
      hx: spec.hx, hy: spec.hy, hz: spec.hz,
    });
  }

  // Place object in a settlement's local frame. Static objects get frozen matrices.
  put(obj, loc, dx, dz, dy = 0, yaw = 0, dynamic = false) {
    obj.position.set(dx, dy, dz);
    obj.rotation.y = yaw;
    loc.group.add(obj);
    if (!dynamic) {
      obj.updateMatrix();
      obj.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    }
    return obj;
  }

  dome(loc, dx, dz, r, color, outline = 0.25) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon(color), outline));
    const ring = mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.08, r * 0.08, 28), toon(0x4a4660), 0.1);
    ring.position.y = r * 0.04;
    g.add(ring);
    const band = mesh(new THREE.TorusGeometry(r * 0.86, r * 0.03, 6, 32), glow(0xfff6a8), 0);
    band.rotation.x = Math.PI / 2;
    band.position.y = r * 0.5;
    g.add(band);
    this.put(g, loc, dx, dz, -0.5);
    this.col(loc, { type: 'sphere', x: dx, y: -0.5, z: dz, r });
    return g;
  }

  block(loc, dx, dz, w, h, d, color, yaw = 0, roof = 0x3a3550) {
    const g = new THREE.Group();
    const main = mesh(new THREE.BoxGeometry(w, h, d), toon(color), 0.2);
    main.position.y = h / 2;
    g.add(main);
    const rf = mesh(new THREE.BoxGeometry(w * 1.06, 0.6, d * 1.06), toon(roof), 0.1);
    rf.position.y = h + 0.3;
    g.add(rf);
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 0.12, d * 1.01), glow(0xfff6a8));
    win.position.y = h * 0.65;
    g.add(win);
    this.put(g, loc, dx, dz, 0, yaw);
    this.col(loc, { type: 'box', x: dx, y: h / 2 + 0.3, z: dz, hx: w / 2 + 0.2, hy: h / 2 + 0.3, hz: d / 2 + 0.2, yaw });
    return g;
  }

  // block() baked into a Batch (perimeter walls: dozens of identical segments).
  blockB(B, loc, dx, dz, w, h, d, color, yaw = 0, roof = 0x3a3550) {
    B.at(dx, dz, yaw);
    B.add(new THREE.BoxGeometry(w, h, d), toon(color), 0, h / 2, 0, { outline: 0.2 });
    B.add(new THREE.BoxGeometry(w * 1.06, 0.6, d * 1.06), toon(roof), 0, h + 0.3, 0, { outline: 0.1 });
    B.add(new THREE.BoxGeometry(w * 1.01, h * 0.12, d * 1.01), this.glowM(0xfff6a8), 0, h * 0.65, 0, { outline: 0 });
    this.col(loc, { type: 'box', x: dx, y: h / 2 + 0.3, z: dz, hx: w / 2 + 0.2, hy: h / 2 + 0.3, hz: d / 2 + 0.2, yaw });
  }

  // Fortress wall segment (local x along the wall, +z = outside): a battered plinth, buttresses and
  // crenellations on the outer face, a capped walkway, panel seams, an inner light strip and wall
  // lamps outside. Same collider as the old block wall.
  wallB(B, loc, dx, dz, len, h, t, color, yaw, trim) {
    B.at(dx, dz, yaw);
    const dark = toon(0x3a3550), seam = toon(0x46415c);
    B.add(new THREE.BoxGeometry(len, h, t), toon(color), 0, h / 2, 0, { outline: 0.2 });
    B.add(new THREE.BoxGeometry(len, 1.8, t + 1.6), toon(0x4a4660), 0, 0.9, 0.3, { outline: 0.1 });
    B.add(new THREE.BoxGeometry(len + 0.2, 0.25, t + 1.7), toon(trim), 0, 1.85, 0.3, { outline: 0 });
    for (let x = -len / 2 + 3.5; x < len / 2 - 1; x += 7) B.add(new THREE.BoxGeometry(1.4, h * 0.82, 1.2), toon(0x4a4660), x, h * 0.41, t / 2 + 0.6, { rx: -0.08, outline: 0.06 });
    for (let x = -len / 2 + 1.75; x < len / 2; x += 3.5) for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(0.12, h * 0.8, 0.12), seam, x, h * 0.5, sz * (t / 2 + 0.03), { outline: 0 });
    B.add(new THREE.BoxGeometry(len * 1.01, 0.5, t + 0.9), toon(trim), 0, h + 0.25, 0, { outline: 0.1 });
    B.add(new THREE.BoxGeometry(len, 0.15, t - 0.6), dark, 0, h + 0.55, -0.2, { outline: 0 });
    const n = Math.max(2, Math.round(len / 2.6));
    for (let i = 0; i < n; i++) B.add(new THREE.BoxGeometry((len / n) * 0.55, 1.3, 0.8), toon(color), -len / 2 + (len / n) * (i + 0.5), h + 1.15, t / 2 + 0.05, { outline: 0.05 });
    B.add(new THREE.BoxGeometry(len * 0.96, 0.35, 0.1), this.glowM(0xfff6a8), 0, h * 0.65, -t / 2 - 0.06, { outline: 0 });
    for (let x = -len / 2 + 7; x < len / 2 - 3; x += 14) {
      B.add(new THREE.BoxGeometry(0.8, 0.5, 0.5), dark, x, h * 0.72, t / 2 + 0.3, { outline: 0.02 });
      B.add(new THREE.BoxGeometry(0.6, 0.15, 0.3), this.glowM(0xff2a4a), x, h * 0.72 - 0.3, t / 2 + 0.45, { outline: 0 });
    }
    this.col(loc, { type: 'box', x: dx, y: h / 2 + 0.3, z: dz, hx: len / 2 + 0.2, hy: h / 2 + 0.3, hz: t / 2 + 0.2, yaw });
  }

  // Gate tower: a tapered keep with bands, slit windows, a crenellated top and an emblem panel
  // facing out (+z). Collider as the old 8x16x8 block.
  gateTowerB(B, loc, dx, dz, w, h, color, yaw, trim) {
    B.at(dx, dz, yaw);
    const half = w / 2;
    B.add(new THREE.CylinderGeometry(half * 0.82 * Math.SQRT2, half * 1.05 * Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4), toon(color), 0, h / 2, 0, { outline: 0.2 });
    B.add(new THREE.BoxGeometry(w * 1.12, 1.6, w * 1.12), toon(0x4a4660), 0, 0.8, 0, { outline: 0.1 });
    for (const y of [h * 0.35, h * 0.7]) B.add(new THREE.BoxGeometry(w * (1.02 - (y / h) * 0.2), 0.5, w * (1.02 - (y / h) * 0.2)), toon(trim), 0, y, 0, { outline: 0 });
    for (const [sx, sz, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2]]) {
      for (const y of [h * 0.5, h * 0.82]) {
        const r = half * (1.05 - (y / h) * 0.23) + 0.05;
        B.add(new THREE.BoxGeometry(0.5, 1.4, 0.12), this.glowM(0xfff6a8), sx * r, y, sz * r, { ry, outline: 0 });
      }
    }
    B.add(new THREE.BoxGeometry(w * 0.9, 0.6, w * 0.9), toon(trim), 0, h + 0.3, 0, { outline: 0.08 });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const a = (i * Math.PI) / 2;
      const ex = Math.sin(a) * half * 0.8 + Math.cos(a) * s * half * 0.45, ez = Math.cos(a) * half * 0.8 - Math.sin(a) * s * half * 0.45;
      B.add(new THREE.BoxGeometry(1.2, 1.2, 1.2), toon(color), ex, h + 1.2, ez, { outline: 0.05 });
    }
    B.add(new THREE.BoxGeometry(w * 0.5, w * 0.5, 0.3), toon(0x2a2540), 0, h * 0.58, half * 0.93 + 0.1, { rx: -0.03, outline: 0.04 });
    B.add(new THREE.TorusGeometry(w * 0.16, 0.18, 4, 16), this.glowM(color === 0xffd23f ? 0x2ee6ff : 0xffd23f), 0, h * 0.58, half * 0.93 + 0.3, { outline: 0 });
    this.col(loc, { type: 'box', x: dx, y: h / 2 + 0.3, z: dz, hx: w / 2 + 0.2, hy: h / 2 + 0.3, hz: w / 2 + 0.2, yaw });
  }

  // Defense turret mount, read by enemies.setupBase: settlement-local position of the
  // turret base. `ground` mounts are snapped to the terrain instead (outside the plateau).
  mount(loc, x, z, y, extra = {}) {
    (loc.turretMounts ||= []).push({ x, z, y, ...extra });
  }

  // Wall bastion: a squat octagonal tower set into the perimeter wall, pushed slightly
  // outward, with a gun pedestal on top so the turret's muzzle clears the parapet and can
  // fire over the wall outward and back into the compound with only a tiny dead zone.
  bastion(B, loc, a, R, { r, h, out, ped, tx = r * 0.45, color = 0x4a4660, trim = 0xffd23f, beacon = null, heavy = false }) {
    const x = Math.cos(a) * (R + out), z = Math.sin(a) * (R + out);
    const deck = h + 1.1;
    B.at(x, z, -a);
    B.add(new THREE.CylinderGeometry(r, r * 1.12, h, 8), toon(color), 0, h / 2, 0, { outline: 0.2 });
    B.add(new THREE.CylinderGeometry(r * 1.2, r * 1.32, 1.8, 8), toon(0x3a3550), 0, 0.9, 0, { outline: 0.1 });
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2, rr = r * 1.06;
      B.add(new THREE.BoxGeometry(0.7, h * 0.85, 0.7), toon(0x5b5870), Math.cos(t) * rr, h * 0.45, Math.sin(t) * rr, { ry: -t, rz: 0, outline: 0.04 });
      const ts = t + Math.PI / 8;
      B.add(new THREE.BoxGeometry(0.4, 1.6, 0.12), this.glowM(0xfff6a8), Math.cos(ts) * r * 1.0, h * 0.8, Math.sin(ts) * r * 1.0, { ry: -ts + Math.PI / 2, outline: 0 });
    }
    B.add(new THREE.CylinderGeometry(r * 1.1, r * 0.98, 1.1, 8), toon(trim), 0, h + 0.55, 0, { outline: 0.1 });
    B.add(new THREE.CylinderGeometry(r * 1.07, r * 1.1, 0.5, 8, 1, true), this.glowM(0xff2a4a), 0, h * 0.62, 0, { outline: 0 });
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2 + Math.PI / 8;
      B.add(new THREE.BoxGeometry(1.1, 1.0, r * 0.55), toon(color), Math.cos(t) * r * 0.98, deck + 0.5, Math.sin(t) * r * 0.98, { ry: -t + Math.PI / 2, outline: 0.06 });
    }
    // the gun sits on the outer half, a few metres proud of the wall, so it can also see
    // along the wall's outer face to the next bastion
    B.add(new THREE.CylinderGeometry(heavy ? 1.7 : 1.3, heavy ? 2.3 : 1.8, ped, 10), toon(0x3a3550), tx, deck + ped / 2, 0, { outline: 0.08 });
    B.add(new THREE.TorusGeometry(heavy ? 2.4 : 1.9, 0.18, 6, 16), this.glowM(0xffd23f), tx, deck + 0.15, 0, { rx: Math.PI / 2, outline: 0 });
    B.add(new THREE.CylinderGeometry(heavy ? 2.0 : 1.6, heavy ? 2.0 : 1.6, 0.4, 10), toon(trim), tx, deck + ped - 0.2, 0, { outline: 0.04 });
    if (beacon) {
      B.add(new THREE.CylinderGeometry(0.15, 0.15, 4, 6), toon(0x3a3550), -r * 0.7, deck + 2, 0, { outline: 0.04 });
      B.add(new THREE.SphereGeometry(0.7, 10, 8), beacon, -r * 0.7, deck + 4.4, 0, { outline: 0 });
    }
    this.col(loc, { type: 'cyl', x, z, y0: -2, y1: deck, r: r * 1.12 + 0.1 });
    const mx = x + Math.cos(a) * tx, mz = z + Math.sin(a) * tx;
    this.col(loc, { type: 'cyl', x: mx, z: mz, y0: deck - 0.5, y1: deck + ped, r: heavy ? 2.3 : 1.8 });
    this.mount(loc, mx, mz, deck + ped, { wall: true });
  }

  // Free-standing settlements: each defense turret stands on a short pylon so roofs and
  // domes don't hide it. Spots that land on a building or pad get nudged along the ring.
  defensePylons(loc, spots, h = 6) {
    const C = this.colliders, n = new THREE.Vector3(), p = new THREE.Vector3(), near = [];
    const free = (x, z) => {
      for (const k of [...(loc.pads || []), ...(loc.keep || [])]) if (Math.hypot(x - k.x, z - k.z) < k.r + 5) return false;
      for (const y of [1.5, h * 0.5, h + 2, h + 5]) {
        this.toWorld(loc, x, y, z, p);
        for (const c of C.query(p, 4, near)) if (C.contact(c, p, 3.6, n) > 0) return false;
      }
      return true;
    };
    for (const [a0, r0] of spots) {
      let x = Math.cos(a0) * r0, z = Math.sin(a0) * r0;
      search: for (const dr of [0, -8, 8, -16]) {
        for (let k = 0; k <= 12; k++) {
          const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
          const tx = Math.cos(a) * (r0 + dr), tz = Math.sin(a) * (r0 + dr);
          if (free(tx, tz)) { x = tx; z = tz; break search; }
        }
      }
      // an armoured pylon: octagonal column with bands and a ladder, a railed deck, faction ring
      const fcol = new THREE.Color(FACTIONS[loc.faction].color).getHex();
      const B = new Batch();
      B.at(x, z, Math.atan2(-x, -z));
      B.add(new THREE.CylinderGeometry(2.4, 2.9, 0.9, 8), toon(0x3a3550), 0, 0.45, 0, { outline: 0.08 });
      B.add(new THREE.CylinderGeometry(0.95, 1.35, h, 8), toon(0x5b5870), 0, h / 2, 0, { outline: 0.1 });
      for (const y of [h * 0.3, h * 0.62]) B.add(new THREE.CylinderGeometry(1.25 - y * 0.03, 1.3 - y * 0.03, 0.35, 8), toon(fcol), 0, y, 0, { outline: 0 });
      for (const sx of [-0.35, 0.35]) B.add(new THREE.BoxGeometry(0.08, h - 1, 0.08), toon(0x1d1a29), sx, h / 2, 1.35, { outline: 0 });
      for (let y = 1.2; y < h - 0.8; y += 0.8) B.add(new THREE.BoxGeometry(0.75, 0.06, 0.06), toon(0x1d1a29), 0, y, 1.35, { outline: 0 });
      B.add(new THREE.CylinderGeometry(2.7, 2.1, 0.7, 10), toon(0x3a3550), 0, h - 0.35, 0, { outline: 0.08 });
      for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; B.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), toon(0x55607a), Math.cos(t) * 2.55, h + 0.45, Math.sin(t) * 2.55, { outline: 0 }); }
      B.add(new THREE.TorusGeometry(2.55, 0.08, 4, 20).rotateX(Math.PI / 2), toon(fcol), 0, h + 0.9, 0, { outline: 0 });
      B.add(new THREE.TorusGeometry(2.7, 0.14, 6, 16).rotateX(Math.PI / 2), this.glowM(fcol), 0, h - 0.35, 0, { outline: 0 });
      B.build(this, loc);
      this.col(loc, { type: 'cyl', x, z, y0: -2, y1: h, r: 1.4 });
      this.mount(loc, x, z, h);
    }
  }

  tube(loc, ax, az, bx, bz, r = 2.2, color = 0xd8d4e8) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateZ(Math.PI / 2), toon(color), 0.12);
    const yaw = -Math.atan2(bz - az, bx - ax);
    this.put(m, loc, (ax + bx) / 2, (az + bz) / 2, r * 0.8, yaw);
    this.col(loc, { type: 'hcyl', x: (ax + bx) / 2, y: r * 0.8, z: (az + bz) / 2, r, len, yaw: yaw + Math.PI / 2 });
  }

  tower(loc, dx, dz, h, r, color, beacon = 0xff2e88) {
    const g = new THREE.Group();
    const t = mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 10), toon(color), 0.15);
    t.position.y = h / 2;
    g.add(t);
    const mat = new THREE.MeshBasicMaterial({ color: beacon });
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 10, 8), mat);
    b.position.y = h + r * 0.5;
    g.add(b);
    this.blinkers.push({ mat, base: new THREE.Color(beacon), phase: this.r() * 6, loc });
    this.put(g, loc, dx, dz);
    this.col(loc, { type: 'cyl', x: dx, z: dz, y0: -2, y1: h, r: r + 0.2 });
    return g;
  }

  pad(loc, dx, dz, r, color = 0xffd23f) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.5, 32), toon(0x4a4660), 0.08));
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.65, r * 0.8, 32), toon(color));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.27;
    g.add(ring);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.15, r * 0.9), toon(color));
    bar.rotation.x = -Math.PI / 2;
    bar.position.y = 0.28;
    g.add(bar);
    this.put(g, loc, dx, dz, 0);
    (loc.pads ||= []).push({ x: dx, z: dz, r }); // traffic reuses / avoids these
    return g;
  }

  flag(loc, dx, dz, colors, h = 14) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.15, 0.15, h), toon(0xe0e0e0), 0.05);
    pole.position.y = h / 2;
    g.add(pole);
    const rod = mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2).rotateZ(Math.PI / 2), toon(0xe0e0e0), 0);
    rod.position.set(2.1, h - 0.1, 0);
    g.add(rod);
    colors.forEach((c, i) => {
      const s = mesh(new THREE.BoxGeometry(4, 2.6 / colors.length, 0.06), toon(c), 0.03);
      s.position.set(2.1, h - 0.3 - (i + 0.5) * (2.6 / colors.length), 0);
      g.add(s);
    });
    this.put(g, loc, dx, dz);
    return g;
  }

  // A solar farm: rows of tilted panels on posts and concrete footings, a torque tube along each
  // row, a gravel bed with a curb, and an inverter cabinet with conduit at the end of each row.
  solarField(loc, dx, dz, rows, cols, yaw = 0) {
    const TILT = -0.5, PD = 3, H = 1.35; // panel depth and centre height
    const W = cols * 6, D = rows * 5;
    const g = kitPart(0x2b3a8f, (k) => {
      k.box(W + 3, 0.12, D + 2, KT(0x8a8698), -3, 0, -2.5, { outline: 0.04 });
      for (const s of [-1, 1]) {
        k.box(W + 3.2, 0.3, 0.3, KT(0x5b5870), -3, 0, -2.5 + s * (D / 2 + 1), { outline: 0.02 });
        k.box(0.3, 0.3, D + 2.2, KT(0x5b5870), -3 + s * (W / 2 + 1.5), 0, -2.5, { outline: 0.02 });
      }
      for (let i = 0; i < rows; i++) {
        const lz = (i - rows / 2) * 5;
        for (let j = 0; j < cols; j++) {
          const lx = (j - cols / 2) * 6;
          k.add(new THREE.BoxGeometry(5, 0.14, PD), KT(0x2b3a8f), lx, H, lz, { rx: TILT, outline: 0.05 });
          for (let c = -1; c <= 1; c++) k.add(new THREE.BoxGeometry(0.06, 0.16, PD - 0.1), KT(0xd8d4e8), lx + c * 1.65, H + 0.01, lz, { rx: TILT, outline: 0 });
          k.add(new THREE.BoxGeometry(5.04, 0.16, 0.08), KT(0xd8d4e8), lx, H + 0.01, lz, { rx: TILT, outline: 0 });
          // two posts (the back one taller) on footings, under the panel's frame
          for (const sz of [-1, 1]) {
            const pz = sz * PD * 0.32, top = H + pz * Math.tan(-TILT) - 0.1;
            k.box(0.7, 0.25, 0.7, KT(0x8a8698), lx, 0, lz + pz, { outline: 0.02 });
            k.box(0.16, top, 0.16, KT(0x55607a), lx, 0, lz + pz, { outline: 0.02 });
          }
        }
        // torque tube along the row, and an inverter box with conduit at the row's end
        k.beam([-W / 2 - 3, H - 0.25, lz], [W / 2 - 3, H - 0.25, lz], 0.08, KT(0x55607a), { outline: 0.015 });
        k.box(1.1, 1.4, 0.8, KT(0xd8d4e8), -W / 2 - 4.3, 0, lz, { outline: 0.04 });
        k.box(0.5, 0.18, 0.06, KG(0x7dff6a), -W / 2 - 4.3, 1.0, lz + 0.42, { outline: 0 });
        k.box(W - 1, 0.12, 0.25, KT(0x3a3550), -3, 0.12, lz + 1.2, { outline: 0 });
      }
    });
    this.put(g, loc, dx, dz, 0, yaw);
    (loc.keep ||= []).push({ x: dx, z: dz, r: Math.hypot(W + 4, D + 2) / 2 + 2 });
  }

  // Lamp post with a fake additive light pool: cheap "lighting" that reads in the dark.
  lamp(loc, dx, dz, color = 0xfff1b0, h = 8, pool = 16) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 6), toon(0x3a3550), 0.05);
    pole.position.y = h / 2;
    g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), glow(color));
    bulb.position.y = h + 0.3;
    g.add(bulb);
    const p = new THREE.Mesh(new THREE.CircleGeometry(pool, 24), this.poolMat(color));
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.15;
    g.add(p);
    this.put(g, loc, dx, dz);
    (loc.keep ||= []).push({ x: dx, z: dz, r: 1.5 });
  }

  poolMat(color) {
    this._pools ||= new Map();
    if (!this._pools.has(color)) {
      this._pools.set(color, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color(color) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 color; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.6); float band = step(0.5, fract(a * 3.0)) * 0.15; gl_FragColor = vec4(color * (a * 0.55 + band * a), 1.0); }',
      }));
    }
    return this._pools.get(color);
  }

  sign(loc, text, color, y = 46) {
    const s = textSprite(text, { color, scale: 1.4 });
    s.position.set(0, y, 0);
    loc.group.add(s);
    loc.sign = s;
  }

  addFigures(loc, count, opts) {
    for (let i = 0; i < count; i++) {
      const spawn = { kind: opts.kind, ...(opts.look ? opts.look(i) : {}) };
      const f = makeFigure(spawn);
      const a = this.r() * Math.PI * 2, d = (0.3 + this.r() * 0.55) * loc.r;
      f.root.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      loc.group.add(f.root);
      // residents are the damageable crowd (civilians.js): spawn remembers how to make a replacement
      this.figures.push({ ...f, loc, spawn, kind: opts.kind || 'worker', target: f.root.position.clone(), wait: this.r() * 3, phase: this.r() * 10, vy: 0, hop: 0 });
    }
  }

  // A knocked-out resident was cleared away (civilians.js): a fresh one moves in.
  respawnFigure(entry) {
    const loc = entry.loc;
    const f = makeFigure(entry.spawn);
    const a = Math.random() * Math.PI * 2, d = (0.3 + Math.random() * 0.55) * loc.r;
    f.root.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    loc.group.add(f.root);
    Object.assign(entry, f, { target: f.root.position.clone(), wait: Math.random() * 3, vy: 0, hop: 0, hp: undefined });
    delete entry.civ;
  }

  buildLocation(loc) {
    this.frame(loc);
    const fc = FACTIONS[loc.faction].color;
    switch (loc.type) {
      case 'hub': this.buildHub(loc); break;
      case 'civilian': this.buildCivilian(loc); break;
      case 'research': this.buildArray(loc); break;
      case 'industrial': this.buildMine(loc); break;
      case 'trade': this.buildTrade(loc); break;
      case 'military': this.buildMilitary(loc); break;
      case 'pirate': loc.camp ? this.buildCamp(loc) : this.buildGulch(loc); break;
      case 'lab': this.buildLab(loc); break;
      case 'monolith': this.buildMonolith(loc); break;
      case 'funpark': this.buildFunpark(loc); break;
      case 'casino': this.casino = buildCasino(this, loc); break; // casino
    }
    if (loc.dark && loc.type !== 'pirate') {
      // dark-side settlements ring themselves with lamps
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.lamp(loc, Math.cos(a) * loc.r * 0.8, Math.sin(a) * loc.r * 0.8, 0xfff1b0, 9, 20);
      }
    }
    if (loc.defense && loc.type !== 'hub') {
      const d = loc.defense;
      const spots = [];
      for (let i = 0; i < d.turrets; i++) spots.push([(i / d.turrets) * Math.PI * 2 + 0.2, d.ring]);
      for (let i = 0; i < (d.inner || 0); i++) spots.push([(i / d.inner) * Math.PI * 2 + 0.8, d.ring * 0.55]);
      this.defensePylons(loc, spots);
    }
    if (loc.hq) {
      const hq = textSprite(`★ ${FACTIONS[loc.faction].name.toUpperCase()} HQ ★`, { color: '#ffffff', size: 60, scale: 0.8 });
      hq.position.set(0, loc.type === 'hub' ? 110 : 62, 0);
      loc.group.add(hq);
    }
    this.sign(loc, loc.name.toUpperCase(), fc, loc.type === 'hub' ? 95 : loc.camp ? 26 : 50);
  }

  buildHub(loc) {
    dressIlmb(this, loc); // dome, spire, repair hangar, gantry, fuel spheres, outer domes, barracks
    const B = new Batch();
    this.buildIlmbWings(loc, B);
    // the job terminal: a kiosk of screens facing the arrival point (settlements.jobTerminal); the
    // Hall of Highlights now lives on the board's own screen (hud.openBoard)
    jobTerminal(this, loc, 0, 76, 0, 0xffd23f);
    const bs = textSprite('JOB BOARD', { color: '#ffffff', size: 80, scale: 0.6 });
    bs.position.set(0, 21, 76);
    loc.group.add(bs);

    // repair bay hangar (out past the Daedalus relay, clear of the wings; built in settlements.js)
    const rs = textSprite('REPAIR BAY', { color: '#ff9f1c', size: 70, scale: 0.6 });
    rs.position.set(-168, 24, -98);
    loc.group.add(rs);
    this.pad(loc, 95, -60, 16);
    this.pad(loc, -120, 40, 16, 0x2ec4ff);
    this.solarField(loc, 150, 60, 4, 6, 0.4);
    const dish = makeDish(14);
    this.put(dish.root, loc, -150, -40, 0, 0, true);
    this.dishes.push({ ...dish, speed: 0.2, loc });
    this.col(loc, { type: 'cyl', x: -150, z: -40, y0: -2, y1: 12, r: 2.5 });

    // Launch complex: where most new arrivals touch down on the Moon
    const lp = { x: 20, z: -185 };
    this.pad(loc, lp.x, lp.z, 30, 0xff4f2e);
    // (the gantry and fuel spheres are in settlements.dressIlmb)
    const ls = textSprite('ARRIVALS', { color: '#ff4f2e', size: 70, scale: 0.6 });
    ls.position.set(lp.x, 30, lp.z + 20);
    loc.group.add(ls);
    const rocket = makeRocket();
    this.put(rocket.root, loc, lp.x, lp.z, 900, 0, true);
    this.rocket = { ...rocket, loc, lp, t: 0, alt: 900, period: 76 };
    this.launchPad = { loc, x: lp.x, z: lp.z };

    this.fortify(loc, B);
    B.build(this, loc);
    this.addFigures(loc, 14, { kind: 'worker', look: (i) => ({ suit: [0xff9f1c, 0xffd23f, 0x2ec4ff, 0xffffff][i % 4] }) });
    this.addFigures(loc, 10, { kind: 'soldier', look: () => ({ suit: 0x55607a, helmet: 0xffd23f, visor: 0x111111 }) });
  }

  // SPACECOM fortress ring: the most heavily defended place on the Moon. Every gun sits
  // on the wall itself: one on each gate tower and two bastions per quarter between gates.
  fortify(loc, B) {
    const R = 248, segs = 40;
    const gates = [0.25 * Math.PI * 2, 0.5 * Math.PI * 2, 0.75 * Math.PI * 2, Math.PI * 2];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.1)) continue;
      const len = ((2 * Math.PI * R) / segs) * 0.96;
      this.wallB(B, loc, Math.cos(a) * R, Math.sin(a) * R, len, 9, 4, 0x5b5870, -a + Math.PI / 2, 0xffd23f);
    }
    const beacon = new THREE.MeshBasicMaterial({ color: 0xff2a4a });
    this.blinkers.push({ mat: beacon, base: new THREE.Color(0xff2a4a), phase: 0, loc });
    for (let q = 0; q < 4; q++) {
      for (const f of [1 / 3, 2 / 3]) {
        const a = (q + f) * (Math.PI / 2);
        this.bastion(B, loc, a, R, { r: 5.5, h: 10, out: 4, ped: 2.2, color: 0x4a4660, trim: 0xffd23f, beacon, heavy: true });
      }
    }
    for (const g of gates) {
      for (const s of [-1, 1]) {
        const a = g + s * 0.14;
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        this.gateTowerB(B, loc, x, z, 8, 16, 0xffd23f, -a + Math.PI / 2, 0x2a2540);
        // gun ring on the tower roof, corbelled out over the outer face
        B.at(x, z, -a);
        B.add(new THREE.CylinderGeometry(2.6, 2.2, 1.6, 10), toon(0x3a3550), 1.6, 17.4, 0, { outline: 0.08 });
        B.add(new THREE.TorusGeometry(2.7, 0.18, 6, 16), this.glowM(0xff2a4a), 1.6, 17.9, 0, { rx: Math.PI / 2, outline: 0 });
        const gx = x + Math.cos(a) * 1.6, gz = z + Math.sin(a) * 1.6;
        this.col(loc, { type: 'cyl', x: gx, z: gz, y0: 16, y1: 18.2, r: 2.6 });
        this.mount(loc, gx, gz, 18.2, { wall: true });
      }
      // a lit gantry spanning the gate between its two towers, high enough to ride (or fly) under
      const gr = R * Math.cos(0.14), half = R * Math.sin(0.14) - 4.5;
      B.at(Math.cos(g) * gr, Math.sin(g) * gr, -g + Math.PI / 2);
      B.add(new THREE.BoxGeometry(half * 2, 1.8, 2.6), toon(0x3a3550), 0, 15, 0, { outline: 0.12 });
      B.add(new THREE.BoxGeometry(half * 2, 0.5, 2.8), toon(0xffd23f), 0, 16.1, 0, { outline: 0 });
      for (let x = -half + 4; x < half - 2; x += 6) B.add(new THREE.BoxGeometry(1.6, 0.25, 0.8), this.glowM(0xfff6a8), x, 14, 0, { outline: 0 });
      for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(half * 2, 0.3, 0.2), this.glowM(0x2ee6ff), 0, 15, sz * 1.4, { outline: 0 });
      this.col(loc, { type: 'box', x: Math.cos(g) * gr, y: 15.3, z: Math.sin(g) * gr, hx: half, hy: 1.1, hz: 1.4, yaw: -g + Math.PI / 2 });
    }
    // inner ring guns on pylons, clear of the wings
    const d = loc.defense;
    const inner = [];
    for (let i = 0; i < (d.inner || 0); i++) inner.push([(i / d.inner) * Math.PI * 2 + 0.8, d.ring * 0.55]);
    this.defensePylons(loc, inner, 7);
    // (barracks and the vehicle depot are in settlements.dressIlmb)
    for (let i = 0; i < 3; i++) {
      const r = makeRover({ color: 0x55607a, trim: 0xffd23f, pirate: false, flag: 0xffd23f });
      r.root.scale.setScalar(1.15);
      this.put(r.root, loc, 150 + i * 12, -95 + i * 6, 0, 1.2);
    }
    const sc = textSprite('SPACECOM', { color: '#ffd23f', size: 90, scale: 1.1 });
    sc.position.set(0, 132, 0);
    loc.group.add(sc);
  }

  // ---------- ILMB wings: six distinct buildings joined to the main dome by glass skywalks ----------
  buildIlmbWings(loc, B) {
    const wings = [
      { a: 0.0, d: 116, walkers: 2, build: (w) => this.wingHydroponics(loc, w) },
      { a: 0.62, d: 122, walkers: 3, S: 1.3, build: (w) => this.wingLabs(loc, w) },
      { a: 2.2, d: 124, walkers: 3, S: 1.25, build: (w) => this.wingHangar(loc, w) },
      { a: 3.8, d: 120, walkers: 2, S: 1.3, build: (w) => this.wingRelay(loc, w) },
      { a: 4.5, d: 110, walkers: 2, build: (w) => this.wingPower(loc, w) },
      { a: 5.2, d: 120, walkers: 3, build: (w) => this.wingHabitat(loc, w) },
    ];
    for (const s of wings) {
      const w = this.wing(loc, B, s.a, s.d, s.S || 1);
      const E = s.build(w) * (s.S || 1); // distance from the wing's centre to the face its skywalk docks into
      this.skywalk(loc, B, s.a, 53, s.d - E + 1.2, s.walkers);
    }
  }

  // Local frame of one wing: +X points away from the hub, -X faces the skywalk.
  // A wing's local frame. S scales the whole wing up (geometry, colliders, props, signs): builders
  // keep working in their own units.
  wing(loc, B, a, d, S = 1) {
    const yaw = -a, c = Math.cos(yaw), s = Math.sin(yaw);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const P = (lx, lz) => [cx + (lx * c + lz * s) * S, cz + (-lx * s + lz * c) * S];
    return {
      a, d, yaw, P, S,
      add: (geo, mat, x, y, z, o = {}) => { B.at(cx, cz, yaw); B.add(geo, mat, x * S, y * S, z * S, { ...o, sx: (o.sx ?? 1) * S, sy: (o.sy ?? 1) * S, sz: (o.sz ?? 1) * S }); },
      box: (lx, ly, lz, hx, hy, hz, ry = 0) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'box', x, y: ly * S, z, hx: hx * S, hy: hy * S, hz: hz * S, yaw: yaw + ry }); },
      cyl: (lx, lz, y0, y1, r) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'cyl', x, z, y0: y0 * S, y1: y1 * S, r: r * S }); },
      sph: (lx, ly, lz, r) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'sphere', x, y: ly * S, z, r: r * S }); },
      // a horizontal cylinder along the wing's local x (arched roofs: round to bump into, not a box)
      hcyl: (lx, ly, lz, r, len) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'hcyl', x, y: ly * S, z, r: r * S, len: len * S, yaw: yaw + Math.PI / 2 }); },
      // the same along any wing-local direction (dx, dz)
      hcylDir: (lx, ly, lz, r, len, dx, dz) => {
        const [x, z] = P(lx, lz);
        const ex = dx * c + dz * s, ez = -dx * s + dz * c;
        return this.col(loc, { type: 'hcyl', x, y: ly * S, z, r: r * S, len: len * S, yaw: Math.atan2(ex, ez) });
      },
      sign: (text, color, lx, y, lz, scale = 0.55) => {
        const sp = textSprite(text, { color, size: 64, scale });
        const [x, z] = P(lx, lz);
        sp.position.set(x, y * S, z);
        loc.group.add(sp);
      },
      flag: (lx, lz, colors, h) => { const [x, z] = P(lx, lz); this.flag(loc, x, z, colors, h); },
      obj: (o, lx, lz, y = 0, ry = 0, dynamic = false) => { const [x, z] = P(lx, lz); o.scale.multiplyScalar(S); return this.put(o, loc, x, z, y * S, yaw + ry, dynamic); },
    };
  }

  matDS(color) {
    const k = 'ds' + color;
    if (!this._mats.has(k)) this._mats.set(k, toon(color, { side: THREE.DoubleSide }));
    return this._mats.get(k);
  }

  // Doorway vestibule every wing docks its skywalk into (front face at x = x0 - w/2).
  vestibule(w, x0, h, roof, wd = 8.4, dx = 4) {
    w.add(new THREE.BoxGeometry(dx, h, wd), toon(0xfff4e0), x0, h / 2, 0, { outline: 0.15 });
    w.add(new THREE.BoxGeometry(dx + 0.4, 0.7, wd + 0.4), toon(roof), x0, h + 0.35, 0, { outline: 0.08 });
    w.add(new THREE.BoxGeometry(dx + 0.1, 0.5, wd + 0.1), this.glowM(0xfff6a8), x0, h - 1.2, 0, { outline: 0 });
    w.box(x0, h / 2 + 0.35, 0, dx / 2, h / 2 + 0.35, wd / 2);
  }

  // Enclosed glass skywalk from the main dome out along angle a (radius r0 → r1): floor slab,
  // ink-outlined ribs every few metres, see-through walls and vaulted roof, and a few people
  // walking between the buildings. The shell is solid from outside.
  skywalk(loc, B, a, r0, r1, walkers = 2) {
    const len = r1 - r0, yaw = -a, W = 5.6, F = 0.6, wallH = 2.0, R = W / 2, top = F + wallH + R;
    const x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0;
    const mid = len / 2;
    const rib = toon(0xfff4e0), trim = toon(0xffd23f), glass = this.glassM(0x9be7ff, 0.17);
    B.at(x0, z0, yaw);
    B.add(new THREE.BoxGeometry(len, F, W + 0.8), toon(0x3a3550), mid, F / 2, 0, { outline: 0.1 });
    B.add(new THREE.BoxGeometry(len, 0.04, W - 0.8), toon(0xd8d4e8), mid, F + 0.02, 0, { outline: 0 });
    B.add(new THREE.BoxGeometry(len, 0.06, 0.28), this.glowM(0x2ee6ff), mid, F + 0.05, 0, { outline: 0 });
    for (const sz of [-1, 1]) B.add(new THREE.PlaneGeometry(len, wallH), glass, mid, F + wallH / 2, sz * R, { outline: 0 });
    B.add(new THREE.CylinderGeometry(R, R, len, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), glass, mid, F + wallH, 0, { outline: 0 });
    // structure: spine and eave rails, ribs, yellow portals where it meets the dome and the wing
    // (the spine and eave rails stop at the end rings: running on through, one poked out into the dome)
    const rs = 5.2, re = len - 1.3;
    B.add(new THREE.BoxGeometry(re - rs, 0.22, 0.22), rib, (rs + re) / 2, top, 0, { outline: 0.05 });
    for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(re - rs, 0.26, 0.26), rib, (rs + re) / 2, F + wallH, sz * R, { outline: 0.05 });
    const ribs = [5.2];
    const n = Math.max(2, Math.round((len - 7) / 5));
    for (let i = 1; i < n; i++) ribs.push(5.2 + ((len - 6.5) * i) / n);
    ribs.push(len - 1.3);
    ribs.forEach((x, i) => {
      const end = i === 0 || i === ribs.length - 1;
      const m = end ? trim : rib, t = end ? 0.42 : 0.18;
      B.add(new THREE.TorusGeometry(R, t, 6, 18, Math.PI), m, x, F + wallH, 0, { ry: Math.PI / 2, outline: 0.06 });
      for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(t * 2, wallH, t * 2), m, x, F + wallH / 2, sz * R, { outline: 0.06 });
      if (!end) B.add(new THREE.SphereGeometry(0.2, 6, 4), this.glowM(0xfff6a8), x, top - 0.25, 0, { outline: 0 });
    });
    // each end opens onto a faintly glowing doorway (the arch of the walkway's own section), not a
    // flat wall
    const arch = new THREE.Shape();
    arch.moveTo(-R + 0.35, F);
    arch.lineTo(R - 0.35, F);
    arch.lineTo(R - 0.35, F + wallH);
    arch.absarc(0, F + wallH, R - 0.35, 0, Math.PI, false);
    arch.lineTo(-R + 0.35, F);
    const archGeo = new THREE.ShapeGeometry(arch, 12).rotateY(Math.PI / 2);
    const portal = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    // (just inside the end rings: right at the very ends they were buried in the dome and the wing)
    // and a lit rim round each doorway's edge, so it reads from both sides
    const archP = (e) => { const p = new THREE.Path(); p.moveTo(-e, F); p.lineTo(e, F); p.lineTo(e, F + wallH); p.absarc(0, F + wallH, e, 0, Math.PI, false); p.lineTo(-e, F); return p; };
    const rim = new THREE.Shape(archP(R - 0.3).getPoints(24));
    rim.holes.push(new THREE.Path(archP(R - 0.62).getPoints(24)));
    const rimGeo = new THREE.ShapeGeometry(rim).rotateY(Math.PI / 2);
    for (const x of [5.55, len - 1.65]) {
      B.add(archGeo.clone(), portal, x, 0, 0, { outline: 0 });
      B.add(rimGeo.clone(), this.glowM(0x9fe8ff), x, 0, 0, { outline: 0 });
    }
    const cm = r0 + mid;
    // straight glass walls, then a round vault on top (a box here made the roof's shoulders square)
    this.col(loc, { type: 'box', x: Math.cos(a) * cm, y: (F + wallH) / 2, z: Math.sin(a) * cm, hx: mid, hy: (F + wallH) / 2, hz: R + 0.4, yaw });
    this.col(loc, { type: 'hcyl', x: Math.cos(a) * cm, y: F + wallH, z: Math.sin(a) * cm, r: R + 0.3, len, yaw: yaw + Math.PI / 2 });

    // foot traffic: a few people pacing between the dome and the wing, seen through the glass
    const grp = new THREE.Group();
    this.put(grp, loc, x0, z0, 0, yaw);
    const center = this.toWorld(loc, Math.cos(a) * cm, 2, Math.sin(a) * cm);
    const suits = [0xffd23f, 0x2ec4ff, 0xff9f1c, 0xffffff, 0xff7ad9, 0x7dff6a, 0xc77dff];
    for (let k = 0; k < walkers; k++) {
      const f = makeFigure({ suit: suits[(k * 3 + Math.round(a * 5)) % suits.length], helmet: 0xfff4e0 });
      const dir = k % 2 ? 1 : -1;
      const lane = dir * 0.9;
      const x = 7 + this.r() * (len - 13);
      f.root.position.set(x, F, lane);
      f.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      f.root.traverse((o) => { o.castShadow = false; }); // under glass: skip the shadow pass
      grp.add(f.root);
      this.walkers.push({ ...f, loc, center, x, lane, dir, min: 6.5, max: len - 3.2, F, speed: 1.1 + this.r() * 0.7, wait: this.r() * 2, phase: this.r() * 6 });
    }
  }

  updateWalkers(dt, camPos) {
    for (const w of this.walkers) {
      const on = w.loc.active && w.center.distanceToSquared(camPos) < 400 * 400;
      w.root.visible = on;
      if (!on) continue;
      const p = w.root.position;
      if (w.wait > 0) {
        w.wait -= dt;
        w.legL.rotation.x = w.legR.rotation.x = 0;
        if (w.armL) w.armL.rotation.x = w.armR.rotation.x = 0;
        p.y = w.F;
        continue;
      }
      w.x += w.dir * w.speed * dt;
      if (w.x > w.max || w.x < w.min) {
        w.x = Math.min(w.max, Math.max(w.min, w.x));
        w.dir = -w.dir;
        w.lane = -w.lane; // keep to the right
        w.wait = 0.6 + Math.random() * 2.5;
        w.root.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      w.phase += dt * 4.5 * w.speed;
      w.legL.rotation.x = Math.sin(w.phase) * 0.6;
      w.legR.rotation.x = -Math.sin(w.phase) * 0.6;
      if (w.armL) { w.armL.rotation.x = -Math.sin(w.phase) * w.swing; w.armR.rotation.x = Math.sin(w.phase) * w.swing; }
      p.set(w.x, w.F + Math.abs(Math.sin(w.phase)) * 0.12, p.z + (w.lane - p.z) * Math.min(1, dt * 2));
    }
  }

  // Hydroponics: a ribbed glass greenhouse dome full of planters under green grow-lights.
  wingHydroponics(loc, w) {
    const R = 19, cream = 0xfff4e0;
    w.add(new THREE.CylinderGeometry(R + 1.5, R + 2.2, 1.4, 32), toon(0x5b5870), 0, 0.7, 0, { outline: 0.12 });
    w.add(new THREE.SphereGeometry(R, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), this.glassM(0x8dffb0, 0.22), 0, 1.4, 0, { outline: 0 });
    for (let k = 0; k < 4; k++) w.add(new THREE.TorusGeometry(R, 0.3, 6, 28, Math.PI), toon(cream), 0, 1.4, 0, { ry: (k * Math.PI) / 4, outline: 0.06 });
    for (const [y, rr] of [[1.6, R], [1.4 + R * 0.5, R * 0.866], [1.4 + R * 0.82, R * 0.572]]) {
      w.add(new THREE.TorusGeometry(rr, 0.25, 6, 40), toon(y < 2 ? 0xffd23f : cream), 0, y, 0, { rx: Math.PI / 2, outline: 0.05 });
    }
    w.add(new THREE.CylinderGeometry(2.4, 2.9, 1.6, 12), toon(cream), 0, 1.4 + R + 0.4, 0, { outline: 0.08 });
    w.add(new THREE.SphereGeometry(0.8, 8, 6), this.glowM(0x7dff6a), 0, 1.4 + R + 1.6, 0, { outline: 0 });
    const rr = mulberry32(77);
    for (const z of [-12, -6, 0, 6, 12]) {
      const L = 2 * Math.sqrt((R - 3) ** 2 - z * z);
      w.add(new THREE.BoxGeometry(L, 1.1, 2.4), toon(0x6b4a2a), 0, 1.95, z, { outline: 0.06 });
      w.add(new THREE.BoxGeometry(L - 0.4, 0.1, 2.0), toon(0x2a1d14), 0, 2.52, z, { outline: 0 });
      for (let x = -L / 2 + 1.4; x < L / 2 - 1; x += 2.1) {
        if (rr() < 0.55) w.add(new THREE.SphereGeometry(0.75 + rr() * 0.5, 8, 6), toon(rr() < 0.5 ? 0x3ad15a : 0x7dff6a), x, 3.2, z, { outline: 0.04 });
        else w.add(new THREE.ConeGeometry(0.7, 2.2 + rr() * 1.6, 6), toon(0x1f8a3a), x, 3.8, z, { outline: 0.04 });
      }
      w.add(new THREE.BoxGeometry(L - 2, 0.25, 0.5), this.glowM(0xb8ff9e), 0, 9, z, { outline: 0 });
    }
    // nutrient tanks out back
    for (const s of [-1, 1]) {
      w.add(new THREE.CylinderGeometry(2.2, 2.2, 6, 14), toon(0x2edfa0), 9, 3, s * (R + 3.5), { outline: 0.1 });
      w.add(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 14), this.glowM(0x7dff6a), 9, 4.2, s * (R + 3.5), { outline: 0 });
      w.cyl(9, s * (R + 3.5), -2, 6, 2.4);
    }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(R - 1, 32), this.poolMat(0x5aff7a));
    pool.rotation.x = -Math.PI / 2;
    const [px, pz] = w.P(0, 0);
    this.put(pool, loc, px, pz, 1.45);
    this.vestibule(w, -R - 1, 6.6, 0x7dff6a, 8.4, 8);
    w.sph(0, 1.4, 0, R + 0.2);
    w.cyl(0, 0, -2, 1.4, R + 2.2);
    w.sign('HYDROPONICS', '#7dff6a', 0, R + 8, 0);
    return R + 5;
  }

  // Meridian Labs: stepped lab block with a tall leaning tower and a glass observation deck.
  wingLabs(loc, w) {
    const blue = 0x2ec4ff, cream = 0xfff4e0, pane = 0x9be7ff;
    w.add(new THREE.BoxGeometry(22, 10, 20), toon(cream), 0, 5, 0, { outline: 0.2 });
    w.add(new THREE.BoxGeometry(22.6, 0.8, 20.6), toon(blue), 0, 10.4, 0, { outline: 0.1 });
    w.add(new THREE.BoxGeometry(22.2, 1.4, 20.2), this.glowM(pane), 0, 6.6, 0, { outline: 0 });
    w.add(new THREE.BoxGeometry(22.2, 1.0, 20.2), this.glowM(pane), 0, 3.2, 0, { outline: 0 });
    w.add(new THREE.BoxGeometry(12, 6, 11), toon(0xd8d4e8), -3, 13.8, -3.5, { outline: 0.15 });
    w.add(new THREE.BoxGeometry(12.4, 0.6, 11.4), toon(blue), -3, 17.1, -3.5, { outline: 0.08 });
    w.add(new THREE.BoxGeometry(12.1, 1.0, 11.1), this.glowM(pane), -3, 14.6, -3.5, { outline: 0 });
    w.add(new THREE.SphereGeometry(3.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe0e0f0), -6, 17.4, -5, { outline: 0.1 });
    w.add(new THREE.BoxGeometry(0.8, 0.8, 4.6), toon(0x3a3550), -6, 19.6, -5, { rx: 0.5, outline: 0.04 });
    // the leaning tower, seated in a plinth on the roof (a tilted box's foot lifts off a flat roof at one
    // corner: the plinth swallows it)
    const lean = 0.2, th = 40, bx = 5, bz = 5, by = 10.2, ux = Math.sin(lean), uy = Math.cos(lean);
    w.add(new THREE.BoxGeometry(9.5, 2.8, 9.5), toon(cream), bx, 10.8 + 1.4, bz, { outline: 0.1 });
    w.add(new THREE.BoxGeometry(9.8, 0.5, 9.8), toon(blue), bx, 10.8 + 2.85, bz, { outline: 0.04 });
    w.box(bx, 12.2, bz, 4.75, 1.4, 4.75);
    w.add(new THREE.BoxGeometry(6, th, 6), toon(blue), bx + (ux * th) / 2, by + (uy * th) / 2, bz, { rz: -lean, outline: 0.15 });
    w.add(new THREE.BoxGeometry(6.2, th * 0.84, 1.4), this.glowM(pane), bx + (ux * th) / 2, by + (uy * th) / 2, bz, { rz: -lean, outline: 0 });
    for (const t of [0.22, 0.5, 0.78]) w.add(new THREE.BoxGeometry(6.4, 0.9, 6.4), toon(cream), bx + ux * th * t, by + uy * th * t, bz, { rz: -lean, outline: 0.06 });
    const tx = bx + ux * th, ty = by + uy * th;
    w.add(new THREE.CylinderGeometry(8.5, 5.0, 1.8, 24), toon(cream), tx, ty + 0.2, bz, { outline: 0.12 });
    w.add(new THREE.CylinderGeometry(8, 8, 3.2, 24, 1, true), this.glassM(pane, 0.3), tx, ty + 2.7, bz, { outline: 0 });
    w.add(new THREE.TorusGeometry(8.1, 0.18, 6, 32), this.glowM(0xfff6a8), tx, ty + 1.7, bz, { rx: Math.PI / 2, outline: 0 });
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      w.add(new THREE.BoxGeometry(0.3, 3.2, 0.3), toon(cream), tx + Math.cos(t) * 8, ty + 2.7, bz + Math.sin(t) * 8, { outline: 0.04 });
    }
    w.add(new THREE.CylinderGeometry(4.5, 8.8, 1.4, 24), toon(blue), tx, ty + 5, bz, { outline: 0.12 });
    w.add(new THREE.CylinderGeometry(0.2, 0.25, 7, 6), toon(0x3a3550), tx, ty + 9, bz, { outline: 0.04 });
    w.add(new THREE.SphereGeometry(0.6, 8, 6), this.glowM(0xff2e88), tx, ty + 12.6, bz, { outline: 0 });
    w.box(0, 5.3, 0, 11.3, 5.4, 10.3);
    w.box(-3, 13.8, -3.5, 6.2, 3.4, 5.7);
    for (const t of [1 / 6, 0.5, 5 / 6]) w.box(bx + ux * th * t, by + uy * th * t, bz, 4.2, (th / 6) * uy + 0.4, 3.2);
    w.cyl(tx, bz, ty - 0.8, ty + 5.8, 8.8);
    w.flag(-9, 13, [0x2ec4ff, 0xffffff, 0x1b3a8f]);
    w.sign('MERIDIAN LABS', '#2ec4ff', -6, 27, -4);
    return 11;
  }

  // Vostok hangar: ribbed quonset with a half-open door and a shuttle-bus parked on the apron.
  wingHangar(loc, w) {
    const red = 0xff3b5c, R = 13, L = 30, dark = 0x3a3550;
    w.add(new THREE.CylinderGeometry(R, R, L, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), toon(0x5b5870), 0, 0, 0, { outline: 0.2 });
    for (const x of [-L / 2 + 0.4, -7.5, 0, 7.5, L / 2 - 0.4]) w.add(new THREE.TorusGeometry(R + 0.15, 0.45, 6, 24, Math.PI), toon(red), x, 0, 0, { ry: Math.PI / 2, outline: 0.06 });
    w.add(new THREE.BoxGeometry(L - 2, 0.9, 0.3), this.glowM(0xfff6a8), 0, 8.2, R * 0.62, { rx: -0.9, outline: 0 });
    w.add(new THREE.BoxGeometry(L - 2, 0.9, 0.3), this.glowM(0xfff6a8), 0, 8.2, -R * 0.62, { rx: 0.9, outline: 0 });
    // big door (outward end), half open on a dark bay
    const dx = L / 2;
    w.add(new THREE.BoxGeometry(0.4, 9.6, 10.4), toon(0x1d1a29), dx + 0.1, 4.8, 0, { outline: 0 });
    for (const s of [-1, 1]) {
      w.add(new THREE.BoxGeometry(0.8, 9.2, 4.2), toon(0xd8d4e8), dx + 0.6, 4.6, s * 7.2, { outline: 0.1 });
      for (let k = 0; k < 4; k++) w.add(new THREE.BoxGeometry(0.9, 0.6, 4.3), toon(0xffd23f), dx + 0.6, 1.2 + k * 2.4, s * 7.2, { outline: 0 });
    }
    w.add(new THREE.BoxGeometry(1.4, 1.2, 19), toon(red), dx + 0.6, 10, 0, { outline: 0.1 });
    w.add(new THREE.BoxGeometry(18, 0.15, 20), toon(0x4a4660), dx + 9, 0.08, 0, { outline: 0 });
    for (let k = 0; k < 4; k++) w.add(new THREE.BoxGeometry(0.9, 0.06, 18), toon(0xffd23f), dx + 2 + k * 4.5, 0.18, 0, { outline: 0 });
    // a real shuttle-bus (the same ship that flies the routes), in Vostok red, parked nose-out on the
    // apron with its gear down and its ramp lowered
    const cx = dx + 10.5, SS = 0.72;
    const sh = makeShuttle({ color: 0xfff4e0, stripe: red });
    sh.root.scale.setScalar(SS);
    sh.setGear(1);
    sh.setRamp(1);
    sh.setThrust(0, 0, 0);
    sh.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(sh.root), bs = bb.getSize(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
    w.obj(sh.root, cx, 0, sh.gearH * SS, Math.PI / 2);
    // (turned a quarter: its length runs along the apron's x)
    w.box(cx + bc.z, sh.gearH * SS + bc.y, -bc.x, bs.z / 2 * 0.92, bs.y / 2, bs.x / 2 * 0.9);
    // control office on the flank
    w.add(new THREE.BoxGeometry(9, 6, 6), toon(0xfff4e0), -3, 3, R + 2, { outline: 0.15 });
    w.add(new THREE.BoxGeometry(9.4, 0.6, 6.4), toon(red), -3, 6.3, R + 2, { outline: 0.08 });
    w.add(new THREE.BoxGeometry(9.1, 1.2, 6.1), this.glowM(0xfff6a8), -3, 4.2, R + 2, { outline: 0 });
    w.add(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), toon(dark), 0, 9.6, R + 3, { outline: 0.03 });
    w.box(-3, 3.3, R + 2, 4.7, 3.3, 3.2);
    this.vestibule(w, -L / 2 - 1.6, 6.6, red);
    w.hcyl(0, 0, 0, R + 0.2, L); // the quonset is round to bump into (a box made its shoulders square)
    w.flag(6, -(R + 4), [0xff3b5c, 0xffd23f]);
    w.sign('VOSTOK HANGAR', '#ff3b5c', 0, R + 7, 0);
    return L / 2 + 3.6;
  }

  // Daedalus relay: octagonal listening bunker, roof dish cluster, big tracking dish and a mast.
  wingRelay(loc, w) {
    const purple = 0xc77dff, dark = 0x4a4660, deck = 7.9;
    w.add(new THREE.CylinderGeometry(11, 12.5, 7, 8), toon(dark), 0, 3.5, 0, { ry: Math.PI / 8, outline: 0.2 });
    w.add(new THREE.CylinderGeometry(11.6, 11.2, 0.9, 8), toon(purple), 0, 7.45, 0, { ry: Math.PI / 8, outline: 0.1 });
    w.add(new THREE.CylinderGeometry(11.95, 12.15, 0.8, 8, 1, true), this.glowM(purple), 0, 4.2, 0, { ry: Math.PI / 8, outline: 0 });
    for (const [x, z, s] of [[-4, -5, 2.6], [-4, 5, 2.6], [4, -1, 3.4]]) {
      w.add(new THREE.CylinderGeometry(0.3, 0.4, 2, 6), toon(0x3a3550), x, deck + 1, z, { outline: 0.04 });
      const cy = deck + 2 + s;
      w.add(new THREE.SphereGeometry(s, 14, 6, 0, Math.PI * 2, 0, 1.0), this.matDS(0xd8d4e8), x, cy, z, { rx: Math.PI + 0.5, outline: 0 });
      // the receiver: a feed spoke from the middle of the bowl out along its axis (tilted 0.5 rad
      // like the dish) to the glowing bead at the focus, braced by three thin struts from the rim
      const ay = Math.cos(0.5), az = Math.sin(0.5); // the bowl's axis (it opens this way)
      const vy = cy - s * ay, vz = z - s * az; // middle of the bowl
      const fy = cy + s * 0.15 * ay, fz = z + s * 0.15 * az; // the focus, just above the rim plane
      const len = s * 1.15;
      w.add(new THREE.CylinderGeometry(0.09, 0.12, len, 6), toon(0x3a3550), x, (vy + fy) / 2, (vz + fz) / 2, { rx: 0.5, outline: 0.02 });
      w.add(new THREE.SphereGeometry(0.34, 8, 6), this.glowM(purple), x, fy, fz, { outline: 0 });
      const rimR = s * Math.sin(1.0), rimO = s * Math.cos(1.0); // rim circle radius, and how far it sits along the axis from the sphere's centre
      for (let k = 0; k < 3; k++) {
        const t = (k / 3) * Math.PI * 2 + 0.4;
        // rim point: centre - axis * rimO + perpendicular offsets (x, and the axis-perpendicular in y/z)
        const px = x + Math.cos(t) * rimR, py = cy - ay * rimO - az * Math.sin(t) * rimR, pz = z - az * rimO + ay * Math.sin(t) * rimR;
        const dx = x - px, dy = fy - py, dz = fz - pz, sl = Math.hypot(dx, dy, dz);
        const sg = new THREE.CylinderGeometry(0.04, 0.04, sl, 4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / sl, dy / sl, dz / sl)));
        w.add(sg, toon(0x3a3550), (px + x) / 2, (py + fy) / 2, (pz + fz) / 2, { outline: 0 });
      }
    }
    // lattice mast
    const mh = 30, mx = 5, mz = 6;
    w.add(new THREE.CylinderGeometry(0.35, 0.65, mh, 6), toon(0x3a3550), mx, deck + mh / 2, mz, { outline: 0.05 });
    for (let k = 1; k <= 4; k++) w.add(new THREE.BoxGeometry(5.2 - k * 0.8, 0.25, 0.25), toon(purple), mx, deck + k * 6, mz, { ry: k * 0.8, outline: 0.03 });
    const bm = new THREE.MeshBasicMaterial({ color: 0xff2a4a });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), bm);
    w.obj(beacon, mx, mz, deck + mh + 0.8);
    this.blinkers.push({ mat: bm, base: new THREE.Color(0xff2a4a), phase: 1.3, loc });
    w.cyl(mx, mz, deck - 1, deck + mh, 1);
    // big tracking dish beside the bunker
    const dish = makeDish(12, 0xd8d4e8);
    w.obj(dish.root, 6, -19, 0, 0, true);
    this.dishes.push({ ...dish, speed: 0.12, loc });
    w.cyl(6, -19, -2, 11, 2.5);
    this.vestibule(w, -12.5, 6.4, purple, 8.4, 5);
    w.cyl(0, 0, -2, deck, 12.3);
    w.flag(-6, -14, [0xc77dff, 0x111111, 0xc77dff]);
    w.sign('DAEDALUS RELAY', '#c77dff', -3, 19, -3);
    return 15;
  }

  // Power block: reactor hall with a glowing core drum and two hyperboloid cooling stacks.
  wingPower(loc, w) {
    const yel = 0xffd23f, dark = 0x3a3550;
    w.add(new THREE.BoxGeometry(18, 9, 20), toon(0x5b5870), 0, 4.5, 0, { outline: 0.2 });
    w.add(new THREE.BoxGeometry(18.6, 0.8, 20.6), toon(yel), 0, 9.4, 0, { outline: 0.1 });
    w.add(new THREE.BoxGeometry(18.2, 1.2, 20.2), this.glowM(0x2ee6ff), 0, 6.2, 0, { outline: 0 });
    for (let k = 0; k < 9; k++) w.add(new THREE.BoxGeometry(18.3, 0.9, 1.1), toon(k % 2 ? yel : 0x1d1a29), 0, 1.0, -8.8 + k * 2.2, { outline: 0 });
    w.add(new THREE.CylinderGeometry(5.5, 5.5, 6, 20), toon(0xd8d4e8), -2, 12.8, 0, { outline: 0.15 });
    w.add(new THREE.TorusGeometry(5.8, 0.35, 6, 28), this.glowM(0x2ee6ff), -2, 12.8, 0, { rx: Math.PI / 2, outline: 0 });
    w.add(new THREE.TorusGeometry(5.8, 0.35, 6, 28), this.glowM(0x2ee6ff), -2, 11, 0, { rx: Math.PI / 2, outline: 0 });
    w.add(new THREE.CylinderGeometry(3.5, 5.5, 1.6, 20), toon(yel), -2, 16.6, 0, { outline: 0.1 });
    const prof = [[7, 0], [6.1, 4], [5.0, 10], [4.7, 14], [5.0, 18], [5.6, 22]].map(([x, y]) => new THREE.Vector2(x, y));
    const steam = this.glassM(0xffffff, 0.3);
    for (const [sx, sz, sc] of [[16.5, -8, 1], [17.5, 8.5, 0.85]]) {
      w.add(new THREE.LatheGeometry(prof, 24), this.matDS(0xe8e4f4), sx, 0, sz, { sx: sc, sy: sc, sz: sc, outline: 0.18 });
      w.add(new THREE.CylinderGeometry(5.45, 5.15, 2, 24, 1, true), this.matDS(0xff4f2e), sx, 19 * sc, sz, { sx: sc, sy: sc, sz: sc, outline: 0 });
      w.add(new THREE.CylinderGeometry(5.3, 5.3, 0.1, 24), toon(0x1d1a29), sx, 21 * sc, sz, { sx: sc, sy: sc, sz: sc, outline: 0 });
      w.add(new THREE.SphereGeometry(3.6 * sc, 10, 8), steam, sx, 23.5 * sc, sz, { outline: 0 });
      w.add(new THREE.SphereGeometry(4.4 * sc, 10, 8), steam, sx + 1.5, 27.5 * sc, sz + 1, { outline: 0 });
      w.add(new THREE.CylinderGeometry(0.8, 0.8, 3.4, 10), toon(yel), 10.2, 3, sz * 0.9, { rz: Math.PI / 2, outline: 0.05 });
      w.cyl(sx, sz, -2, 22 * sc, 7 * sc);
    }
    for (const s of [-1, 1]) {
      w.add(new THREE.BoxGeometry(4, 4, 3), toon(dark), -3, 2, s * 13, { outline: 0.1 });
      for (let k = -1; k <= 1; k++) w.add(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6), toon(0xd8d4e8), -3 + k * 1.2, 4.8, s * 13, { outline: 0.03 });
      w.box(-3, 2, s * 13, 2.1, 2.1, 1.6);
    }
    this.vestibule(w, -10.6, 6.6, yel);
    w.box(0, 4.8, 0, 9.3, 4.9, 10.3);
    w.cyl(-2, 0, 9, 17.4, 5.8);
    w.sign('POWER BLOCK', '#ffd23f', 0, 26, 0);
    return 12.6;
  }

  // Kepler habitat: a big ring on A-frame legs, high enough to skate under, with two glowing window
  // decks, six spokes into a central hub tower with an observation crown, and a park inside the
  // ring. The ring is a round tube, and its collider is a chain of short tubes that follow it.
  wingHabitat(loc, w) {
    const orange = 0xff9f1c, cream = 0xfff4e0, dark = 0x3a3550, RR = 22, tr = 5.4, hy = 11.5;
    const at = (t, r) => [Math.cos(t) * r, Math.sin(t) * r];
    const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    // the ring: a round tube, banded top and bottom, with two continuous window decks on the outside
    // and one on the inside (a band at angle phi round the tube sits at radius RR + tr cos(phi))
    w.add(new THREE.TorusGeometry(RR, tr, 18, 72), toon(cream), 0, hy, 0, { rx: Math.PI / 2, outline: 0.18 });
    const band = (phi, tube, mat) => w.add(new THREE.TorusGeometry(RR + tr * Math.cos(phi), tube, 6, 72), mat, 0, hy + tr * Math.sin(phi), 0, { rx: Math.PI / 2, outline: 0 });
    band(1.15, 0.42, toon(orange));
    band(-1.15, 0.42, toon(orange));
    band(0.42, 0.62, this.glowM(0xfff6a8));
    band(-0.3, 0.62, this.glowM(0xfff6a8));
    band(0.06, 0.2, toon(dark));
    band(Math.PI, 0.55, this.glowM(0xfff6a8)); // the inner side, facing the park
    // window mullions across the outer decks
    for (let k = 0; k < 36; k++) {
      const t = (k / 36) * Math.PI * 2;
      const [mx, mz] = at(t, RR + tr * Math.cos(0.06) + 0.05);
      w.add(new THREE.BoxGeometry(0.3, tr * 1.05, 0.3), toon(dark), mx, hy + 0.3, mz, { ry: -t, outline: 0 });
    }
    // A-frame legs: pairs splayed out from under the ring to footings on the ground
    const legs = 10, yTop = hy - tr + 0.6;
    for (let k = 0; k < legs; k++) {
      const t = (k / legs) * Math.PI * 2 + 0.31;
      for (const off of [-1.8, 1.8]) {
        const [tx, tz] = at(t, RR + off * 0.3);
        const [bx, bz] = at(t, RR + off * 1.6);
        const dx = tx - bx, dy = yTop, dz = tz - bz, ln = Math.hypot(dx, dy, dz);
        const lg = new THREE.CylinderGeometry(0.45, 0.65, ln, 8).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(dx / ln, dy / ln, dz / ln)));
        w.add(lg, toon(dark), (tx + bx) / 2, yTop / 2, (tz + bz) / 2, { outline: 0.04 });
        w.add(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 8), toon(0x5b5870), bx, 0.25, bz, { outline: 0.03 });
        w.cyl(bx * 0.6 + tx * 0.4, bz * 0.6 + tz * 0.4, -1, yTop, 0.7);
      }
      const [sx, sz] = at(t, RR);
      w.add(new THREE.BoxGeometry(3.2, 0.7, 1.6), toon(orange), sx, hy - tr + 0.2, sz, { ry: -t, outline: 0.04 }); // saddle under the tube
    }
    // spokes from the hub to the ring's inner wall, each with a lit strip
    const hubR = 7.2;
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const r0 = hubR - 0.6, r1 = RR - tr + 0.8, len = r1 - r0, mid = (r0 + r1) / 2;
      const dir = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
      const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
      const [px, pz] = at(t, mid);
      const [cx2, cz2] = at(t, r1 - 0.6);
      w.add(new THREE.CylinderGeometry(1.4, 1.4, len, 12).applyQuaternion(q), toon(cream), px, hy + 1.5, pz, { outline: 0.06 });
      w.add(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 12).applyQuaternion(q), toon(orange), cx2, hy + 1.5, cz2, { outline: 0.03 });
      w.add(new THREE.BoxGeometry(0.22, 0.3, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, dir)), this.glowM(0xfff6a8), px, hy + 2.85, pz, { outline: 0 });
      w.hcylDir(px, hy + 1.5, pz, 1.5, len, dir.x, dir.z);
    }
    // hub tower: drum, banded shaft, observation crown and a mast
    w.add(new THREE.CylinderGeometry(8.4, 9, 4, 28), toon(0x5b5870), 0, 2, 0, { outline: 0.1 });
    w.add(new THREE.CylinderGeometry(hubR - 0.6, hubR, 24, 28), toon(orange), 0, 16, 0, { outline: 0.15 });
    for (const y of [10, 17, 24]) {
      const r = hubR - 0.42 - (y - 4) * 0.025;
      w.add(new THREE.CylinderGeometry(r, r, 1.1, 28), this.glowM(0xfff6a8), 0, y, 0, { outline: 0 });
    }
    w.add(new THREE.CylinderGeometry(9.5, hubR - 0.6, 2, 28), toon(cream), 0, 29, 0, { outline: 0.1 });
    w.add(new THREE.CylinderGeometry(9.5, 9.5, 3.2, 28, 1, true), this.glassM(0x9be7ff, 0.3), 0, 31.6, 0, { outline: 0 });
    for (let k = 0; k < 12; k++) { const [px, pz] = at((k / 12) * Math.PI * 2, 9.5); w.add(new THREE.BoxGeometry(0.3, 3.2, 0.3), toon(cream), px, 31.6, pz, { outline: 0 }); }
    w.add(new THREE.SphereGeometry(9.5, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(cream), 0, 33.2, 0, { outline: 0.12 });
    w.add(new THREE.TorusGeometry(9.6, 0.35, 6, 40), toon(orange), 0, 33.2, 0, { rx: Math.PI / 2, outline: 0 });
    w.add(new THREE.CylinderGeometry(0.2, 0.3, 8, 6), toon(dark), 0, 46, 0, { outline: 0.03 });
    w.add(new THREE.SphereGeometry(0.6, 8, 6), this.glowM(0xff9f1c), 0, 50.3, 0, { outline: 0 });
    // the park inside the ring: lawn, paths, trees, a pond and benches
    const lawnR = RR - tr - 1;
    w.add(new THREE.CylinderGeometry(lawnR, lawnR, 0.3, 48), toon(0x3ad15a), 0, 0.15, 0, { outline: 0 });
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const [px, pz] = at(t, (hubR + 1 + lawnR) / 2);
      w.add(new THREE.BoxGeometry(lawnR - hubR - 1.5, 0.05, 1.6), toon(0xd8c9a8), px, 0.32, pz, { ry: -t, outline: 0 });
    }
    const rr = mulberry32(31);
    for (let k = 0; k < 12; k++) {
      const t = rr() * Math.PI * 2, d = hubR + 2.5 + rr() * (lawnR - hubR - 4);
      const [tx, tz] = at(t, d);
      w.add(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), toon(0x6b4a2a), tx, 1.1, tz, { outline: 0.02 });
      w.add(rr() < 0.5 ? new THREE.ConeGeometry(1.3, 3.4, 7) : new THREE.SphereGeometry(1.4, 8, 6), toon(rr() < 0.5 ? 0x1f8a3a : 0x3ad15a), tx, 3.3, tz, { outline: 0.04 });
    }
    w.add(new THREE.CylinderGeometry(2.6, 2.6, 0.1, 20), this.glowM(0x5ad8ff), 11.5, 0.36, -2, { outline: 0 });
    w.add(new THREE.TorusGeometry(2.6, 0.3, 4, 20), toon(0xb8b2cc), 11.5, 0.36, -2, { rx: Math.PI / 2, outline: 0 });
    for (let k = 0; k < 4; k++) { const t = (k / 4) * Math.PI * 2 + 0.4; const [bx, bz] = at(t, 12.5); w.add(new THREE.BoxGeometry(2.4, 0.5, 0.7), toon(0x8a5a3a), bx, 0.6, bz, { ry: -t + Math.PI / 2, outline: 0.02 }); }
    // colliders: the ring as a chain of short tubes along it, the hub as a column
    const segs = 28;
    for (let k = 0; k < segs; k++) {
      const t = ((k + 0.5) / segs) * Math.PI * 2;
      const [px, pz] = at(t, RR);
      w.hcylDir(px, hy, pz, tr + 0.1, ((2 * Math.PI * RR) / segs) * 1.08, -Math.sin(t), Math.cos(t));
    }
    w.cyl(0, 0, -2, 33, 9.6);
    // entrance: a lobby block under the ring where the skywalk docks, with a lift shaft up into it
    const ex = -(RR + tr) + 2.5;
    this.vestibule(w, ex, 8.6, orange, 9, 6);
    w.add(new THREE.CylinderGeometry(2.6, 2.6, hy - 8.6, 12), toon(cream), ex + 1, 8.6 + (hy - 8.6) / 2, 0, { outline: 0.06 });
    w.flag(8, RR + tr + 4, [0xff9f1c, 0xffffff]);
    w.sign('KEPLER HABITAT', '#ff9f1c', 0, 55, 0);
    return -ex + 3 + 1; // the lobby's outer face (it is 6 deep), plus the metre the skywalk tucks into it
  }

  // Meridian Exchange (settlements.js): trading tower, warehouses, container gantry, cranes.
  buildTrade(loc) {
    buildMeridian(this, loc);
    const cols = [0x2ec4ff, 0xff9f1c, 0x7dff6a, 0xff3b5c, 0xffd23f, 0xc77dff];
    this.addFigures(loc, 12, { kind: 'worker', look: (i) => ({ suit: cols[i % cols.length] }) });
  }

  // Kepler towns (settlements.js): hab domes and tunnels, cabins, playground, greenhouse, water
  // tower; Kepler Civic Center adds the council dome and the clock-tower town hall.
  buildCivilian(loc) {
    buildTown(this, loc, { civic: loc.id === 'kepler' });
    const palette = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff];
    this.addFigures(loc, 8, { kind: 'worker', look: (i) => ({ suit: palette[i % palette.length] }) });
    this.addFigures(loc, 7, { kind: 'kid', look: (i) => ({ suit: palette[(i + 3) % palette.length], scale: 0.55 }) });
  }

  buildArray(loc) {
    const pts = [[-60, -30, 26], [55, -40, 30], [0, 60, 34], [-80, 70, 18]];
    for (const [dx, dz, s] of pts) {
      const d = makeDish(s, 0xfff4e0);
      this.put(d.root, loc, dx, dz, 0, 0, true);
      this.dishes.push({ ...d, speed: 0.05 + this.r() * 0.1, loc });
      this.col(loc, { type: 'cyl', x: dx, z: dz, y0: -2, y1: s * 0.95, r: s * 0.2 + 0.5 });
    }
    dressArray(this, loc); // observatory, labs, control centre, mast, cable runs
    this.pad(loc, -100, -20, 13, 0x7dff6a);
    this.solarField(loc, 0, 120, 3, 8, 0);
    this.addFigures(loc, 8, { kind: 'worker', look: () => ({ suit: 0xffffff, visor: 0x2b8f4a }) });
  }

  buildBioLab(loc) {
    const greens = [0x6aff9e, 0xb8ffb0, 0x2edfa0];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      const g = this.dome(loc, Math.cos(a) * 50, Math.sin(a) * 50, 18, greens[i % 3]);
      for (let k = 0; k < 4; k++) {
        const c = mesh(new THREE.ConeGeometry(2, 7, 6), toon(0x1f8a3a), 0.05);
        c.position.set((this.r() - 0.5) * 18, 3.5, (this.r() - 0.5) * 18);
        c.updateMatrix(); c.matrixAutoUpdate = false;
        g.add(c);
      }
    }
    this.block(loc, 0, 0, 22, 12, 22, 0xfff4e0, 0.785, 0x2edfa0);
    this.tower(loc, 0, 0, 30, 1.6, 0xe0e0e0, 0x6aff9e);
    this.pad(loc, 80, -40, 12, 0x6aff9e);
    this.addFigures(loc, 6, { kind: 'worker', look: () => ({ suit: 0xffffff, visor: 0x2b8f4a }) });
  }

  // Helium-3 Exchange (settlements.js): excavator, conveyor, derrick, tank farm, ticker hall.
  buildMine(loc) {
    buildHelium(this, loc);
    this.addFigures(loc, 9, { kind: 'worker', look: () => ({ suit: 0xff9f1c, helmet: 0xffd23f }) });
  }

  buildMilitary(loc) {
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const small = !!loc.small;
    const wallR = small ? 55 : 95, segs = small ? 10 : 14;
    const B = new Batch();
    for (let i = 1; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const len = (2 * Math.PI * wallR) / segs * 0.92;
      this.wallB(B, loc, Math.cos(a) * wallR, Math.sin(a) * wallR, len, 7, 3, 0x5b5870, -a + Math.PI / 2, fc);
    }
    // gun bastions spaced evenly round the wall (the gate at angle 0 sits between two),
    // plus the outer perimeter guns out in the restricted zone
    const nb = small ? 6 : 8;
    for (let i = 0; i < nb; i++) this.bastion(B, loc, ((i + 0.5) / nb) * Math.PI * 2, wallR, { r: 4.2, h: 8, out: 3.0, ped: 2.0, color: 0x4a4660, trim: fc });
    B.build(this, loc);
    const outer = small ? 2 : 4;
    for (let i = 0; i < outer; i++) {
      const a = (i / outer) * Math.PI * 2 + 1.2, r = small ? 180 : 290;
      this.mount(loc, Math.cos(a) * r, Math.sin(a) * r, 0, { ground: true });
    }
    dressBase(this, loc); // command bunker, barracks, searchlight tower, traps, fuel
    const dish = makeDish(small ? 8 : 12, 0xb0b0c0);
    this.put(dish.root, loc, 30, 30, 0, 0, true);
    this.dishes.push({ ...dish, speed: 0.6, loc });
    this.col(loc, { type: 'cyl', x: 30, z: 30, y0: -2, y1: 11, r: 2.5 });
    this.flag(loc, 0, small ? 40 : 70, loc.faction === 'vostok' ? [0xff3b5c, 0xffd23f, 0xff3b5c] : [0xc77dff, 0x111111, 0xc77dff], 20);
    this.addFigures(loc, small ? 4 : 8, { kind: 'soldier', look: () => ({ suit: 0x55607a, helmet: fc, visor: 0x111111 }) });

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xff2a4a) }, alert: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float time; uniform vec3 color; uniform float alert; varying vec2 vUv; varying vec3 vW;
        void main(){ float s = step(0.5, fract((vW.x+vW.z)*0.04 + vW.y*0.04 - time*0.3));
          float fade = (1.0 - vUv.y);
          float a = (0.12 + 0.25*s + alert*0.25) * fade;
          gl_FragColor = vec4(color, a); }`,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(loc.zoneR, loc.zoneR, 170, 96, 1, true), mat);
    this.put(wall, loc, 0, 0, 15);
    this.zoneWalls.push({ loc, mat });
  }

  // Pirate dens (settlements.js): shanties, wrecks, junk heaps, lookout tower, green lights.
  buildGulch(loc) {
    buildDen(this, loc);
    this.flag(loc, 20, 20, [0x111111, 0x111111], 18);
    // heat lamps: sickly orange pools in the dark
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      this.lamp(loc, Math.cos(a) * 60, Math.sin(a) * 60, 0xff9f1c, 5, 14);
    }
    this.addFigures(loc, 6, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  buildCamp(loc) {
    buildPirateCamp(this, loc);
    this.flag(loc, 0, 0, [0x111111, 0x7dff3a, 0x111111], 12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.lamp(loc, Math.cos(a) * 14, Math.sin(a) * 14, 0x7dff3a, 4, 12);
    }
    this.addFigures(loc, 3, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  // ---------- traffic: freighters, shuttle-buses, road-trains (see traffic.js) ----------
  buildTraffic() {
    this.traffic = new Traffic(this);
    this.roads = this.traffic.roads;
    // keep the planet's big shaped rocks (rocks.js) off the road network
    const tr = this.traffic, pts = [];
    const rp = tr.roadMesh && tr.roadMesh.geometry.attributes.position;
    if (rp) for (let i = 0; i < rp.count; i += 6) pts.push(new THREE.Vector3().fromBufferAttribute(rp, i).normalize());
    for (const pc of tr.pieces || []) { const P = (pc.path && pc.path.pts) || pc.raw || []; for (let i = 0; i < P.length; i += 2) pts.push(P[i].clone().normalize()); }
    this.planet.keepClear(pts, 26);
  }

  // ---------- per-frame ----------
  update(dt, time, camPos) {
    this.sky.position.copy(camPos);
    this.earth.rotation.y += dt * 0.01;

    // activate settlements near the camera, drop far ones from the scene graph
    const camDir = _v.copy(camPos).normalize();
    for (const loc of this.locations) {
      loc.camDist = this.planet.R * Math.acos(Math.min(1, Math.max(-1, camDir.dot(loc.dir))));
      const want = loc.camDist < ACTIVE_DIST;
      loc.active = want;
      // drawn while in range and not behind the terrain
      if (want && loc.detail) loc.occluded = loc.camDist > loc.r + SHOW_NEAR && !this.lineOfSight(camPos, loc.pos, loc.topH + 2);
      const show = want && !loc.occluded;
      if (show !== loc.shown) {
        loc.shown = show;
        if (show) this.scene.add(loc.group); else this.scene.remove(loc.group);
      }
      if (show && loc.cells) {
        for (const c of loc.cells) {
          const d = c.c.distanceTo(camPos);
          if (c.on && d > DETAIL_DIST + 30) { c.on = false; setMask(c.objs, false); }
          else if (!c.on && d < DETAIL_DIST) { c.on = true; setMask(c.objs, true); }
        }
      }
    }
    for (const s of this.spinners) if (s.loc.active) s.obj.rotation[s.axis] += s.speed * dt;
    for (const a of this.anims) {
      if (!a.loc.active) continue;
      for (const o of a.list) {
        const u = o.userData;
        if (u.tick) u.tick(o, dt, time);
        else if (u.spin) o.rotation.y += dt * (u.spin === true ? 0.6 : u.spin);
        else if (u.blink) o.visible = Math.sin(time * 4 + a.seed) > -0.3;
        else if (u.flag) o.rotation.y = Math.sin(time * 2 + a.seed) * 0.25;
      }
    }
    for (const d of this.dishes) {
      if (!d.loc.active) continue;
      d.yaw.rotation.y += d.speed * dt;
      d.tilt.rotation.x = -0.6 + Math.sin(time * d.speed * 2) * 0.25;
    }
    for (const b of this.blinkers) {
      if (!b.loc.active) continue;
      b.mat.color.copy(b.base).multiplyScalar(Math.sin(time * 3 + b.phase) > 0.2 ? 1 : 0.25);
    }
    for (const z of this.zoneWalls) z.mat.uniforms.time.value = time;
    if (this.lakeMat) this.lakeMat.uniforms.time.value = time;
    if (this.reactor && this.reactor.loc.active) {
      const r = this.reactor;
      const k = r.spin + r.flash * 6;
      r.orb.rotation.x += dt * 9 * k; r.orb.rotation.y += dt * 13 * k;
      r.ringA.rotation.x += dt * 17 * k; r.ringB.rotation.y += dt * 21 * k; r.ringB.rotation.z += dt * 5;
      r.core.position.y = r.base + Math.sin(time * 37) * 0.25 * k;
      r.core.position.x = -2 + (Math.random() - 0.5) * 0.25 * k;
      r.orb.scale.setScalar(1 + Math.sin(time * 23) * 0.12 + r.flash * 0.8);
      r.flash = Math.max(0, r.flash - dt * 0.8);
      const near = camPos.distanceTo(this.lab.reactor);
      this.reactorLight.intensity = near < 80 ? (6 + r.flash * 30) * (0.8 + Math.random() * 0.4) : 0;
    } else if (this.reactorLight) this.reactorLight.intensity = 0;
    if (this.monolith && this.monolith.loc.active) this.monolith.halo.material.opacity = 0.3 + 0.25 * Math.sin(time * 2);
    if (this.casino && this.casino.loc.active) this.casino.update(dt, time); // casino
    if (this.crystals) for (const c of this.crystals) c.mesh.visible = !c.taken && c.pos.distanceToSquared(camPos) < 450 * 450;

    this.updateRocket(dt, camPos);
    this.updateTraffic(dt, camPos);
    this.updateFigures(dt);
    if (this.civilians) this.civilians.update(dt);
    this.updateWalkers(dt, camPos);
  }

  updateRocket(dt) {
    const r = this.rocket;
    if (!r) return;
    r.t = (r.t + dt) % r.period;
    const t = r.t;
    let alt, flame = 0;
    if (t < 20) { const k = 1 - t / 20; alt = 900 * k * k; flame = alt < 500 ? 1 : 0.3; }
    else if (t < 40) { alt = 0; flame = 0; }
    else if (t < 60) { const k = (t - 40) / 20; alt = 900 * k * k; flame = 1; }
    else { alt = 2000; flame = 0; }
    r.alt = alt;
    r.root.visible = t < 60;
    r.root.position.y = alt;
    r.flame.visible = r.core.visible = flame > 0;
    r.flame.scale.set(1, flame * (0.8 + Math.random() * 0.4), 1);
    r.firing = flame > 0.5 && alt < 120;
    if (r.loc.active) r.worldPos = r.loc.group.localToWorld(new THREE.Vector3(r.lp.x, alt + 20, r.lp.z));
  }

  updateTraffic(dt, camPos) {
    this.traffic.update(dt, camPos);
  }

  // ---------- strange places ----------

  // Dr. Zbornak's lab: a hollow building you can walk into, with a violently spinning
  // antimatter reactor in a glass tube in the middle.
  buildLab(loc) {
    const W = 22, D = 16, H = 16, T = 1;
    const wall = (x, z, w, d) => {
      const m = mesh(new THREE.BoxGeometry(w, H, d), toon(0xe8e4f4), 0.15);
      this.put(m, loc, x, z, H / 2);
      this.col(loc, { type: 'box', x, y: H / 2, z, hx: w / 2, hy: H / 2, hz: d / 2 });
    };
    wall(0, -D, W * 2, T * 2);
    wall(-W, 0, T * 2, D * 2);
    wall(W, 0, T * 2, D * 2);
    wall(-13, D, 18, T * 2);
    wall(13, D, 18, T * 2);
    const roof = mesh(new THREE.BoxGeometry(W * 2 + 2, 1.5, D * 2 + 2), toon(0x3a3550), 0.15);
    this.put(roof, loc, 0, 0, H + 0.75);
    this.col(loc, { type: 'box', x: 0, y: H + 0.75, z: 0, hx: W + 1, hy: 0.75, hz: D + 1 });
    // hazard stripes over the door + a warning sign
    const stripe = mesh(new THREE.BoxGeometry(8, 1.2, 0.3), toon(0xffd23f), 0.05);
    this.put(stripe, loc, 0, D + 1.1, H - 2);
    const sign = textSprite('☢ ANTIMATTER — KNOCK FIRST', { color: '#ffd23f', size: 60, scale: 0.55, bg: '#120a1e' });
    sign.position.set(0, H + 5, D + 2);
    loc.group.add(sign);
    // interior: checker floor, glowing strip lights, shelves, the counter
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 2, D * 2 - 2, 1, 1), new THREE.MeshToonMaterial({ map: this.checker(), gradientMap: toon(0).gradientMap }));
    floor.rotation.x = -Math.PI / 2;
    this.put(floor, loc, 0, 0, 0.06);
    for (const z of [-10, 0, 10]) this.put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 4, 0.3, 0.6), glow(0xc77dff)), loc, 0, z, H - 0.4);
    for (const x of [-18, -12]) {
      const shelf = mesh(new THREE.BoxGeometry(4, 7, 2.5), toon(0x5b5870), 0.06);
      this.put(shelf, loc, x, -13, 3.5);
      for (let k = 0; k < 3; k++) this.put(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8), glow([0x7dff3a, 0xff2e88, 0x2ec4ff][k])), loc, x - 1.2 + k * 1.2, -12, 5.5);
    }
    const counter = mesh(new THREE.BoxGeometry(8, 2.2, 2.5), toon(0x2ec4ff), 0.08);
    this.put(counter, loc, 13, 6, 1.1);
    this.col(loc, { type: 'box', x: 13, y: 1.1, z: 6, hx: 4, hy: 1.1, hz: 1.25 });
    const doc = makeFigure({ suit: 0xffffff, helmet: 0xfff4e0, visor: 0x7dff3a });
    this.put(doc.root, loc, 13, 3.5, 0, 0);
    const docSign = textSprite('DR. ZBORNAK', { color: '#7dff3a', size: 50, scale: 0.35 });
    docSign.position.set(13, 4.5, 3.5);
    loc.group.add(docSign);
    // the reactor
    const rx = -2, rz = -3;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, H - 1, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    this.put(tube, loc, rx, rz, H / 2);
    for (const y of [0.6, H - 1]) this.put(mesh(new THREE.CylinderGeometry(3.8, 3.8, 1.2, 28), toon(0x3a3550), 0.08), loc, rx, rz, y);
    this.col(loc, { type: 'cyl', x: rx, z: rz, y0: -1, y1: H, r: 3.6 });
    const core = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), glow(0xff2e88));
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.18, 8, 32), glow(0x7dff3a));
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 32), glow(0x2ee6ff));
    core.add(orb, ringA, ringB);
    this.put(core, loc, rx, rz, H / 2, 0, true);
    this.reactor = { loc, core, orb, ringA, ringB, spin: 1, flash: 0, base: H / 2 };
    loc.group.updateMatrixWorld(true);
    // the splice pod: step in with a full jar and come out… improved
    const px = -16, pz = 1;
    const podBase = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.8, 20), toon(0x3a3550), 0.08);
    this.put(podBase, loc, px, pz, 0.4);
    const podTop = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 20), toon(0x3a3550), 0.08);
    this.put(podTop, loc, px, pz, 5.6);
    const podGlass = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 4.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dff3a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    this.put(podGlass, loc, px, pz, 3.1);
    this.put(new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 6, 24).rotateX(Math.PI / 2), glow(0x7dff3a)), loc, px, pz, 0.9);
    const podSign = textSprite('SPLICE POD', { color: '#7dff3a', size: 50, scale: 0.35 });
    podSign.position.set(px, 7.4, pz);
    loc.group.add(podSign);
    // the chimera holding pen out front, with a terminal at its gate
    const pen = { x0: 28, z0: 22, x1: 62, z1: 64 };
    const rail = toon(0xffd23f), postM = toon(0x3a3550);
    const fence = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.ceil(len / 4);
      for (let i = 0; i <= n; i++) this.put(mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 6), postM, 0.04), loc, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 1.1);
      const r = mesh(new THREE.BoxGeometry(0.15, 0.25, len), rail, 0.03);
      this.put(r, loc, (ax + bx) / 2, (az + bz) / 2, 1.7, Math.atan2(bx - ax, bz - az));
      this.col(loc, { type: 'box', x: (ax + bx) / 2, y: 1.1, z: (az + bz) / 2, hx: Math.abs(bx - ax) / 2 + 0.2, hy: 1.1, hz: Math.abs(bz - az) / 2 + 0.2 });
    };
    fence(pen.x0, pen.z1, pen.x1, pen.z1);
    fence(pen.x1, pen.z0, pen.x1, pen.z1);
    fence(pen.x0, pen.z0 + 8, pen.x0, pen.z1);
    fence(pen.x0 + 8, pen.z0, pen.x1, pen.z0);
    const term = mesh(new THREE.BoxGeometry(1.6, 2.4, 1), toon(0x2ec4ff), 0.06);
    this.put(term, loc, pen.x0 - 2, pen.z0 - 2, 1.2);
    this.put(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), glow(0x7dff3a)), loc, pen.x0 - 2, pen.z0 - 1.48, 1.8);
    const penSign = textSprite('HOLDING PEN', { color: '#7dff3a', size: 50, scale: 0.35 });
    penSign.position.set(pen.x0 - 2, 4, pen.z0 - 2);
    loc.group.add(penSign);
    loc.group.updateMatrixWorld(true);
    this.lab = { loc, reactor: this.toWorld(loc, rx, 2, rz), scientist: this.toWorld(loc, 13, 0, 3.5), pod: this.toWorld(loc, px, 1, pz), penTerm: this.toWorld(loc, pen.x0 - 2, 0, pen.z0 - 2), half: { w: W, d: D, h: H } };
    // a permanent light in the scene (never added/removed, so shaders don't recompile)
    this.reactorLight = new THREE.PointLight(0xff2e88, 0, 60, 1.5);
    this.reactorLight.position.copy(this.toWorld(loc, rx, H / 2, rz));
    this.scene.add(this.reactorLight);
    dressLab(this, loc, { W, D, H });
  }

  checker() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e4f4'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#3a3550'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 8);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  buildMonolith(loc) {
    const slab = mesh(new THREE.BoxGeometry(6, 26, 1.6), new THREE.MeshBasicMaterial({ color: 0x050308 }), 0.2);
    this.put(slab, loc, 0, 0, 13);
    this.col(loc, { type: 'box', x: 0, y: 13, z: 0, hx: 3, hy: 13, hz: 0.8 });
    const halo = new THREE.Mesh(new THREE.RingGeometry(16, 17, 64), new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2;
    this.put(halo, loc, 0, 0, 0.2);
    this.monolith = { loc, pos: this.toWorld(loc, 0, 2, 0), cd: 0, halo };
    dressMonolith(this, loc);
  }

  // Bounce Dome Funpark (settlements.js): inflatables, skate park, rides.
  buildFunpark(loc) {
    buildFunpark(this, loc);
    const cols = [0xff2e88, 0xffd23f, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff];
    this.addFigures(loc, 8, { kind: 'kid', look: (i) => ({ suit: cols[i % cols.length], scale: 0.55 }) });
    this.addFigures(loc, 3, { kind: 'worker', look: (i) => ({ suit: cols[(i + 3) % cols.length] }) });
  }

  // Glowing crystal rock samples scattered across the sunlit side, for the jar.
  buildCrystals() {
    const P = this.planet;
    const rr = mulberry32(5150);
    this.crystals = [];
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mats = [glow(0x2ee6ff), glow(0x7dff6a), glow(0xc77dff)];
    for (let tries = 0; tries < 2000 && this.crystals.length < 150; tries++) {
      const u = rr() * 2 - 1, th = rr() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      const d = new THREE.Vector3(sq * Math.cos(th), u, sq * Math.sin(th));
      if (d.dot(SUN) < 0.1) continue;
      if (this.locations.some((l) => arcDist(d, l.dir) < (l.zoneR || l.r) * 1.5)) continue;
      const p = P.ground(d, new THREE.Vector3());
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(geo, mats[k % 3]);
        m.scale.set(0.5, 1.2 + rr(), 0.5);
        m.position.set((rr() - 0.5) * 1.6, 0.8, (rr() - 0.5) * 1.6);
        m.rotation.set((rr() - 0.5) * 0.6, rr() * 3, (rr() - 0.5) * 0.6);
        g.add(m);
      }
      g.position.copy(p);
      frameQuat(d, new THREE.Vector3(1, 0, 0), g.quaternion);
      g.visible = false;
      this.scene.add(g);
      this.crystals.push({ pos: p, mesh: g, taken: false });
    }
  }

  // Black lakes: still pools of dark liquid filling crater floors, mostly on the dark side.
  buildLakes() {
    const P = this.planet;
    const picks = P.craters.filter((c) => c.R > 65 && c.R < 190 && SUN.dot(c.d) < 0.15 && !c.peak) // (a central peak would make an island)
      .filter((c) => this.locations.every((l) => arcDist(c.d, l.dir) > (l.zoneR || l.r) * 2 + c.R));
    const rr = mulberry32(31);
    const chosen = [];
    for (const c of picks) {
      if (chosen.length >= 40) break;
      if (rr() < 0.25 || chosen.some((o) => arcDist(o.d, c.d) < 450)) continue;
      chosen.push(c);
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0;
          float ripple = sin(r * 40.0 - time * 1.5) * 0.5 + 0.5;
          float glint = smoothstep(0.92, 1.0, ripple) * (1.0 - r) * 0.35;
          float rim = smoothstep(0.86, 0.98, r);
          vec3 col = vec3(0.03, 0.02, 0.06) + vec3(0.35, 0.22, 0.6) * glint + vec3(0.25, 0.15, 0.45) * rim;
          gl_FragColor = vec4(col, 1.0); }`,
    });
    this.lakeMat = mat;
    this.lakes = [];
    for (const c of chosen) {
      const s0 = P.surface(c.d.clone().multiplyScalar(P.R));
      // fill only up to the lowest point of the rim, so the pool never overhangs
      const dirs = [];
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; dirs.push(c.e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(c.e2, Math.sin(a))); }
      const along = (t, r) => { const a = r / P.R; return P.surface(c.d.clone().multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a)).multiplyScalar(P.R)); };
      let rimMin = Infinity;
      for (const t of dirs) { let m = -Infinity; for (let r = 5; r < c.R * 1.4; r += 5) m = Math.max(m, along(t, r)); rimMin = Math.min(rimMin, m); }
      const level = Math.min(s0 + c.depth * 0.32, rimMin - 1.5);
      if (level < s0 + 1.2 || this.lakes.length >= 16) continue;
      // trace the real shoreline in every direction, so the pool fills the valley's shape
      const N = 64;
      const shore = [];
      let rad = Infinity, maxR = 0;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const t = c.e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(c.e2, Math.sin(a));
        let r = 4;
        while (r < c.R * 1.4 && along(t, r) <= level) r += 1.5;
        shore.push(r);
        rad = Math.min(rad, r);
        maxR = Math.max(maxR, r);
      }
      if (rad < 20) continue;
      const lake = { d: c.d.clone(), e1: c.e1.clone(), e2: c.e2.clone(), level, rad, shore, cos: Math.cos((maxR + 2) / P.R), name: 'Black Lake' };
      // a curved surface hugging the planet at the liquid level; the rim tucks just under the banks
      const RINGS = 10;
      const pos = [], uv = [], idx = [];
      pos.push(...c.d.clone().multiplyScalar(level + 0.05).toArray()); uv.push(0.5, 0.5);
      for (let k = 1; k <= RINGS; k++) {
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const r = ((shore[i] + 1.5) * k) / RINGS;
          const t = c.e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(c.e2, Math.sin(a));
          const ang = r / P.R;
          const dir = c.d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang));
          pos.push(...dir.multiplyScalar(level + 0.05).toArray());
          const f = (k / RINGS) * 0.5;
          uv.push(0.5 + Math.cos(a) * f, 0.5 + Math.sin(a) * f);
        }
      }
      for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
      for (let k = 1; k < RINGS; k++) {
        const r0 = 1 + (k - 1) * N, r1 = 1 + k * N;
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          idx.push(r0 + i, r1 + i, r1 + j, r0 + i, r1 + j, r0 + j);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      mat.side = THREE.DoubleSide;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      lake.mesh = m;
      this.lakes.push(lake);
      P.lakes.push(lake);
    }
  }

  updateFigures(dt) {
    for (const f of this.figures) {
      if (f.civ) continue; // knocked about, fleeing or cleared away: civilians.js has them
      const loc = f.loc;
      f.root.visible = !f.captured && loc.active && loc.camDist < 450;
      if (!f.root.visible) continue;
      const p = f.root.position;
      if (f.kind === 'kid') {
        f.hop -= dt;
        if (f.vy === 0 && f.hop <= 0) { f.vy = 3 + Math.random() * 3; f.hop = 0.5 + Math.random(); }
        if (f.vy !== 0 || p.y > 0) {
          f.vy -= 1.62 * 2 * dt;
          p.y += f.vy * dt;
          if (p.y <= 0) { p.y = 0; f.vy = 0; }
        }
      }
      if (f.wait > 0) { f.wait -= dt; continue; }
      const dx = f.target.x - p.x, dz = f.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1) {
        const a = Math.random() * Math.PI * 2, rr = (0.25 + Math.random() * 0.6) * loc.r;
        f.target.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        f.wait = f.kind === 'soldier' ? 0.5 : 1 + Math.random() * 4;
        continue;
      }
      const sp = f.kind === 'kid' ? 2.5 : f.kind === 'soldier' ? 2.2 : 1.4;
      const k = Math.min(d, sp * dt) / d;
      p.x += dx * k; p.z += dz * k;
      f.root.rotation.y = Math.atan2(dx, dz);
      f.phase += dt * 6;
      f.legL.rotation.x = Math.sin(f.phase) * 0.6;
      f.legR.rotation.x = -Math.sin(f.phase) * 0.6;
      if (f.armL) { f.armL.rotation.x = -Math.sin(f.phase) * f.swing; f.armR.rotation.x = Math.sin(f.phase) * f.swing; }
      if (f.kind !== 'kid') p.y = Math.abs(Math.sin(f.phase)) * 0.15;
    }
  }
}

const time = () => performance.now() / 1000;
