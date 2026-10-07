import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, ink, inkMat, glow, textSprite } from './toon.js';
import { makeDish, makeFigure, makeRover, makeRocket } from './models.js';
import { mulberry32 } from './rng.js';
import { FACTIONS } from './locations.js';
import { SUN, frameQuat, arcDist, dirFromAngles } from './geo.js';
import { buildCasino } from './casinoWorld.js'; // casino
import { Traffic } from './traffic.js';

function mesh(geo, mat, outline = 0.15) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const ACTIVE_DIST = 2600;

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
    this._mats = new Map();
    this.rand = mulberry32(42);

    this.buildSky();
    for (const loc of locations) this.buildLocation(loc);
    this.buildLakes();
    this.buildCrystals();
    this.buildTraffic(); // after the lakes: roads steer around them
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
    const yaw = spec.yaw || 0;
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).premultiply(g.quaternion);
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
      const g = new THREE.Group();
      const col = mesh(new THREE.CylinderGeometry(0.9, 1.3, h, 8), toon(0x5b5870), 0.08);
      col.position.y = h / 2;
      g.add(col);
      const foot = mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 8), toon(0x3a3550), 0.08);
      foot.position.y = 0.4;
      g.add(foot);
      const deck = mesh(new THREE.CylinderGeometry(2.6, 2.2, 0.7, 10), toon(0x3a3550), 0.08);
      deck.position.y = h - 0.35;
      g.add(deck);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 6, 16).rotateX(Math.PI / 2), this.glowM(new THREE.Color(FACTIONS[loc.faction].color).getHex()));
      ring.position.y = h - 0.35;
      g.add(ring);
      this.put(g, loc, x, z);
      this.col(loc, { type: 'cyl', x, z, y0: -2, y1: h, r: 1.4 });
      this.mount(loc, x, z, h);
    }
  }

  tube(loc, ax, az, bx, bz, r = 2.2, color = 0xd8d4e8) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateZ(Math.PI / 2), toon(color), 0.12);
    const yaw = -Math.atan2(bz - az, bx - ax);
    this.put(m, loc, (ax + bx) / 2, (az + bz) / 2, r * 0.8, yaw);
    this.col(loc, { type: 'box', x: (ax + bx) / 2, y: r * 0.8, z: (az + bz) / 2, hx: len / 2, hy: r, hz: r, yaw });
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

  solarField(loc, dx, dz, rows, cols, yaw = 0) {
    const geo = new THREE.BoxGeometry(5, 0.2, 3);
    const im = new THREE.InstancedMesh(geo, toon(0x2b3a8f), rows * cols);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, yaw, 0, 'YXZ'));
    let k = 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const lx = (j - cols / 2) * 6, lz = (i - rows / 2) * 5;
      m4.compose(new THREE.Vector3(dx + lx * cos + lz * sin, 1.8, dz - lx * sin + lz * cos), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(k++, m4);
    }
    im.castShadow = true;
    this.put(im, loc, 0, 0);
    (loc.keep ||= []).push({ x: dx, z: dz, r: Math.hypot(cols * 6, rows * 5) / 2 + 2 });
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
    const f = makeFigure({ ...entry.spawn, seed: undefined });
    const a = Math.random() * Math.PI * 2, d = (0.3 + Math.random() * 0.55) * loc.r;
    f.root.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    loc.group.add(f.root);
    Object.assign(entry, f, { target: f.root.position.clone(), wait: Math.random() * 3, vy: 0, hop: 0, hp: undefined, civ: undefined });
    delete entry.civ;
  }

  buildLocation(loc) {
    this.frame(loc);
    const fc = FACTIONS[loc.faction].color;
    switch (loc.type) {
      case 'hub': this.buildHub(loc); break;
      case 'civilian': this.buildCivilian(loc); if (loc.id === 'kepler') this.buildCivic(loc); break;
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
    this.dome(loc, 0, 0, 58, 0x9be7ff, 0.35);
    this.tower(loc, 0, 0, 82, 4, 0xfff4e0, 0xffd23f);
    const B = new Batch();
    this.buildIlmbWings(loc, B);
    const board = this.block(loc, 0, 76, 16, 9, 3, 0xffd23f, 0, 0xff3b5c);
    const bs = textSprite('JOB BOARD', { color: '#ffffff', size: 80, scale: 0.6 });
    bs.position.set(0, 14, 0);
    board.add(bs);
    bs.updateMatrix();

    // Hall of Highlights: your best action shots, pinned up for the whole base to see
    const hall = new THREE.Group();
    const frameM = mesh(new THREE.BoxGeometry(34, 22, 1.6), toon(0xff2e88), 0.25);
    frameM.position.y = 14;
    hall.add(frameM);
    for (const sx of [-1, 1]) {
      const leg = mesh(new THREE.BoxGeometry(1.4, 6, 1.4), toon(0x3a3550), 0.08);
      leg.position.set(sx * 14, 2, 0);
      hall.add(leg);
    }
    this.highlightCanvas = document.createElement('canvas');
    this.highlightCanvas.width = 1024; this.highlightCanvas.height = 640;
    this.highlightTex = new THREE.CanvasTexture(this.highlightCanvas);
    this.highlightTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 20), new THREE.MeshBasicMaterial({ map: this.highlightTex }));
    screen.position.set(0, 14, 0.85);
    hall.add(screen);
    // open ground between the job board and the Meridian embassy, angled toward the arrival point
    const hx = 44, hz = 72, hyaw = Math.atan2(0 - hx, 108 - hz);
    this.put(hall, loc, hx, hz, 0, hyaw);
    this.col(loc, { type: 'box', x: hx, y: 12, z: hz, hx: 17, hy: 12, hz: 1.2, yaw: hyaw });
    this.highlightSpot = { loc, x: hx, z: hz };

    // repair bay hangar (out past the Daedalus relay, clear of the wings)
    const hangar = mesh(new THREE.CylinderGeometry(16, 16, 34, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xff9f1c), 0.25);
    this.put(hangar, loc, -168, -98, 0, 1.05);
    this.col(loc, { type: 'box', x: -168, y: 7, z: -98, hx: 17, hy: 8, hz: 16, yaw: 1.05 });
    const rs = textSprite('REPAIR BAY', { color: '#ff9f1c', size: 70, scale: 0.6 });
    rs.position.set(-168, 24, -98);
    loc.group.add(rs);
    this.pad(loc, 95, -60, 16);
    this.pad(loc, -120, 40, 16, 0x2ec4ff);
    this.dome(loc, 70, 140, 16, 0xff7ad9);
    this.dome(loc, -60, 145, 14, 0xffd23f);
    this.solarField(loc, 150, 60, 4, 6, 0.4);
    this.tower(loc, 140, -120, 30, 1.5, 0xe0e0e0);
    const dish = makeDish(14);
    this.put(dish.root, loc, -150, -40, 0, 0, true);
    this.dishes.push({ ...dish, speed: 0.2, loc });
    this.col(loc, { type: 'cyl', x: -150, z: -40, y0: -2, y1: 12, r: 2.5 });

    // Launch complex: where most new arrivals touch down on the Moon
    const lp = { x: 20, z: -185 };
    this.pad(loc, lp.x, lp.z, 30, 0xff4f2e);
    const gantry = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const seg = mesh(new THREE.BoxGeometry(5, 9, 5), toon(i % 2 ? 0xff4f2e : 0xfff4e0), 0.12);
      seg.position.y = 4.5 + i * 9;
      gantry.add(seg);
    }
    const arm = mesh(new THREE.BoxGeometry(14, 1.5, 2), toon(0x3a3550), 0.08);
    arm.position.set(-8, 40, 0);
    gantry.add(arm);
    this.put(gantry, loc, lp.x + 40, lp.z, 0);
    this.col(loc, { type: 'box', x: lp.x + 40, y: 27, z: lp.z, hx: 2.8, hy: 27, hz: 2.8 });
    for (const [tx, tz] of [[lp.x - 40, lp.z + 12], [lp.x - 40, lp.z - 12]]) {
      const t = mesh(new THREE.SphereGeometry(7, 16, 12), toon(0xfff4e0), 0.15);
      this.put(t, loc, tx, tz, 7);
      this.col(loc, { type: 'sphere', x: tx, y: 7, z: tz, r: 7 });
    }
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
      this.blockB(B, loc, Math.cos(a) * R, Math.sin(a) * R, len, 9, 4, 0x5b5870, -a + Math.PI / 2, 0xffd23f);
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
        this.blockB(B, loc, x, z, 8, 16, 8, 0xffd23f, -a + Math.PI / 2, 0x2a2540);
        // gun ring on the tower roof, corbelled out over the outer face
        B.at(x, z, -a);
        B.add(new THREE.CylinderGeometry(2.6, 2.2, 1.6, 10), toon(0x3a3550), 1.6, 17.4, 0, { outline: 0.08 });
        B.add(new THREE.TorusGeometry(2.7, 0.18, 6, 16), this.glowM(0xff2a4a), 1.6, 17.9, 0, { rx: Math.PI / 2, outline: 0 });
        const gx = x + Math.cos(a) * 1.6, gz = z + Math.sin(a) * 1.6;
        this.col(loc, { type: 'cyl', x: gx, z: gz, y0: 16, y1: 18.2, r: 2.6 });
        this.mount(loc, gx, gz, 18.2, { wall: true });
      }
    }
    // inner ring guns on pylons, clear of the wings
    const d = loc.defense;
    const inner = [];
    for (let i = 0; i < (d.inner || 0); i++) inner.push([(i / d.inner) * Math.PI * 2 + 0.8, d.ring * 0.55]);
    this.defensePylons(loc, inner, 7);
    // barracks, vehicle depot, command bunker
    this.block(loc, 175, 120, 34, 10, 16, 0x5b5870, -0.6, 0xffd23f);
    this.block(loc, -175, 125, 34, 10, 16, 0x5b5870, 0.6, 0xffd23f);
    this.block(loc, 190, -40, 26, 12, 26, 0x4a4660, 0.3, 0x2a2540);
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
      { a: 0.62, d: 118, walkers: 3, build: (w) => this.wingLabs(loc, w) },
      { a: 2.2, d: 118, walkers: 3, build: (w) => this.wingHangar(loc, w) },
      { a: 3.8, d: 114, walkers: 2, build: (w) => this.wingRelay(loc, w) },
      { a: 4.5, d: 110, walkers: 2, build: (w) => this.wingPower(loc, w) },
      { a: 5.2, d: 120, walkers: 3, build: (w) => this.wingHabitat(loc, w) },
    ];
    for (const s of wings) {
      const w = this.wing(loc, B, s.a, s.d);
      const E = s.build(w); // distance from the wing's centre to the face its skywalk docks into
      this.skywalk(loc, B, s.a, 53, s.d - E + 1.2, s.walkers);
    }
  }

  // Local frame of one wing: +X points away from the hub, -X faces the skywalk.
  wing(loc, B, a, d) {
    const yaw = -a, c = Math.cos(yaw), s = Math.sin(yaw);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    return {
      a, d, yaw, P,
      add: (geo, mat, x, y, z, o) => { B.at(cx, cz, yaw); B.add(geo, mat, x, y, z, o); },
      box: (lx, ly, lz, hx, hy, hz, ry = 0) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'box', x, y: ly, z, hx, hy, hz, yaw: yaw + ry }); },
      cyl: (lx, lz, y0, y1, r) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'cyl', x, z, y0, y1, r }); },
      sph: (lx, ly, lz, r) => { const [x, z] = P(lx, lz); return this.col(loc, { type: 'sphere', x, y: ly, z, r }); },
      sign: (text, color, lx, y, lz, scale = 0.55) => {
        const sp = textSprite(text, { color, size: 64, scale });
        const [x, z] = P(lx, lz);
        sp.position.set(x, y, z);
        loc.group.add(sp);
      },
      flag: (lx, lz, colors, h) => { const [x, z] = P(lx, lz); this.flag(loc, x, z, colors, h); },
      obj: (o, lx, lz, y = 0, ry = 0, dynamic = false) => { const [x, z] = P(lx, lz); return this.put(o, loc, x, z, y, yaw + ry, dynamic); },
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
    B.add(new THREE.BoxGeometry(len, 0.22, 0.22), rib, mid, top, 0, { outline: 0.05 });
    for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(len, 0.26, 0.26), rib, mid, F + wallH, sz * R, { outline: 0.05 });
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
    const cm = r0 + mid;
    this.col(loc, { type: 'box', x: Math.cos(a) * cm, y: top / 2, z: Math.sin(a) * cm, hx: mid, hy: top / 2 + 0.1, hz: R + 0.4, yaw });

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
    // the leaning tower
    const lean = 0.2, th = 34, bx = 5, bz = 5, by = 10.8, ux = Math.sin(lean), uy = Math.cos(lean);
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
    w.sign('MERIDIAN LABS', '#2ec4ff', -6, 25, -4);
    return 11;
  }

  // Vostok hangar: ribbed quonset with a half-open door and a shuttle parked on the apron.
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
    // the shuttle
    const cx = dx + 12;
    w.add(new THREE.CapsuleGeometry(2.0, 8, 6, 12), toon(0xfff4e0), cx, 3.6, 0, { rz: Math.PI / 2, outline: 0.1 });
    w.add(new THREE.BoxGeometry(6, 0.45, 0.3), toon(red), cx, 3.8, 2.05, { outline: 0 });
    w.add(new THREE.BoxGeometry(6, 0.45, 0.3), toon(red), cx, 3.8, -2.05, { outline: 0 });
    w.add(new THREE.SphereGeometry(1.4, 12, 8), toon(0x241a5c), cx + 4.4, 4.7, 0, { sx: 1.5, outline: 0.06 });
    w.add(new THREE.BoxGeometry(5, 0.4, 15), toon(red), cx - 1, 3.0, 0, { outline: 0.08 });
    w.add(new THREE.BoxGeometry(3.4, 3.4, 0.4), toon(red), cx - 4.6, 6.2, 0, { rz: -0.35, outline: 0.06 });
    for (const s of [-1, 1]) {
      w.add(new THREE.CylinderGeometry(0.9, 1.1, 2.6, 10), toon(dark), cx - 6.4, 3.4, s * 1.3, { rz: Math.PI / 2, outline: 0.06 });
      w.add(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 10), this.glowM(0xff9f1c), cx - 7.75, 3.4, s * 1.3, { rz: Math.PI / 2, outline: 0 });
      w.add(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 6), toon(dark), cx - 1, 1.2, s * 4, { outline: 0.03 });
      w.add(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 8), toon(dark), cx - 1, 0.1, s * 4, { outline: 0 });
      w.add(new THREE.SphereGeometry(0.3, 6, 4), this.glowM(s > 0 ? 0x7dff6a : 0xff2a4a), cx - 1, 3.1, s * 7.6, { outline: 0 });
    }
    w.add(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 6), toon(dark), cx + 3.5, 1.2, 0, { outline: 0.03 });
    w.box(cx, 3.6, 0, 6.5, 3.4, 7.6);
    // control office on the flank
    w.add(new THREE.BoxGeometry(9, 6, 6), toon(0xfff4e0), -3, 3, R + 2, { outline: 0.15 });
    w.add(new THREE.BoxGeometry(9.4, 0.6, 6.4), toon(red), -3, 6.3, R + 2, { outline: 0.08 });
    w.add(new THREE.BoxGeometry(9.1, 1.2, 6.1), this.glowM(0xfff6a8), -3, 4.2, R + 2, { outline: 0 });
    w.add(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), toon(dark), 0, 9.6, R + 3, { outline: 0.03 });
    w.box(-3, 3.3, R + 2, 4.7, 3.3, 3.2);
    this.vestibule(w, -L / 2 - 1.6, 6.6, red);
    w.box(0, 6.6, 0, L / 2, 6.6, R);
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
      w.add(new THREE.SphereGeometry(s, 14, 6, 0, Math.PI * 2, 0, 1.0), this.matDS(0xd8d4e8), x, deck + 2 + s, z, { rx: Math.PI + 0.5, outline: 0 });
      w.add(new THREE.SphereGeometry(0.3, 6, 4), this.glowM(purple), x, deck + 2.4 + s * 0.5, z, { outline: 0 });
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

  // Kepler habitat: a windowed torus on struts around a garden, with a central hub tower.
  wingHabitat(loc, w) {
    const orange = 0xff9f1c, cream = 0xfff4e0, RR = 14, tr = 4, hy = 6;
    w.add(new THREE.TorusGeometry(RR, tr, 14, 40), toon(cream), 0, hy, 0, { rx: Math.PI / 2, outline: 0.15 });
    w.add(new THREE.TorusGeometry(RR + tr - 0.05, 0.35, 6, 48), toon(orange), 0, hy, 0, { rx: Math.PI / 2, outline: 0.04 });
    for (let k = 0; k < 32; k++) {
      const t = (k / 32) * Math.PI * 2;
      w.add(new THREE.BoxGeometry(0.4, 1.1, 1.5), this.glowM(0xfff6a8), Math.cos(t) * (RR + 3.75), hy + 1.4, Math.sin(t) * (RR + 3.75), { ry: -t, outline: 0 });
    }
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2;
      w.add(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 6), toon(0x3a3550), Math.cos(t) * RR, 1.2, Math.sin(t) * RR, { outline: 0.04 });
    }
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * Math.PI * 2 + Math.PI / 4;
      w.add(new THREE.CylinderGeometry(0.9, 0.9, RR - 5, 8), toon(cream), Math.cos(t) * (RR + 5) / 2, hy, -Math.sin(t) * (RR + 5) / 2, { rz: Math.PI / 2, ry: t, order: 'YXZ', outline: 0.05 });
    }
    w.add(new THREE.CylinderGeometry(4.5, 5, 13, 16), toon(orange), 0, 6.5, 0, { outline: 0.15 });
    w.add(new THREE.SphereGeometry(4.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(cream), 0, 13, 0, { outline: 0.1 });
    w.add(new THREE.CylinderGeometry(4.6, 4.6, 0.8, 16), this.glowM(0xfff6a8), 0, 10, 0, { outline: 0 });
    w.add(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), toon(0x3a3550), 0, 19, 0, { outline: 0.03 });
    w.add(new THREE.CylinderGeometry(9.6, 9.6, 0.3, 32), toon(0x3ad15a), 0, 0.15, 0, { outline: 0 });
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2 + 0.3;
      w.add(new THREE.ConeGeometry(1.1, 3.4, 6), toon(0x1f8a3a), Math.cos(t) * 7.4, 2, Math.sin(t) * 7.4, { outline: 0.05 });
    }
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * Math.PI * 2;
      w.sph(Math.cos(t) * RR, hy, Math.sin(t) * RR, tr + 0.3);
    }
    w.cyl(0, 0, -2, 15, 5.2);
    this.vestibule(w, -(RR + tr) + 1, 7.2, orange, 8.4, 6);
    w.flag(6, RR + tr + 3, [0xff9f1c, 0xffffff]);
    w.sign('KEPLER HABITAT', '#ff9f1c', 0, 25, 0);
    return RR + tr + 2;
  }

  buildCivic(loc) {
    this.dome(loc, 0, 0, 30, 0xffd23f, 0.3);
    this.block(loc, 0, 36, 30, 14, 10, 0xfff4e0, 0, 0xff9f1c);
    this.flag(loc, -20, 46, [0xff9f1c, 0xffffff, 0xff9f1c], 18);
    this.flag(loc, 20, 46, [0xff9f1c, 0xffffff, 0xff9f1c], 18);
  }

  // Meridian Exchange: warehouses, container stacks, cranes and a lab dome.
  buildTrade(loc) {
    const cols = [0x2ec4ff, 0xff9f1c, 0x7dff6a, 0xff3b5c, 0xffd23f, 0xc77dff];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.block(loc, Math.cos(a) * 70, Math.sin(a) * 70, 34, 12, 18, 0xd8d4e8, -a, 0x2ec4ff);
    }
    for (let i = 0; i < 18; i++) {
      const x = -30 + (i % 6) * 10, z = -100 + Math.floor(i / 6) * 6;
      const h = 1 + Math.floor((i * 7) % 3);
      this.block(loc, x, z, 8, h * 3.6 - 0.6, 4.5, cols[i % cols.length], 0, cols[(i + 1) % cols.length]);
    }
    for (const [x, z] of [[-60, 10], [60, -10]]) {
      this.tower(loc, x, z, 34, 1.4, 0xffd23f, 0x2ec4ff);
      const arm = mesh(new THREE.BoxGeometry(30, 1.6, 1.6), toon(0xffd23f), 0.08);
      this.put(arm, loc, x + 13, z, 33);
    }
    this.dome(loc, 0, 40, 24, 0x9be7ff, 0.3);
    this.pad(loc, 100, 60, 16, 0x2ec4ff);
    this.pad(loc, -100, -60, 16, 0x2ec4ff);
    this.flag(loc, 0, 110, [0x2ec4ff, 0xffffff, 0x2ec4ff], 20);
    this.addFigures(loc, 12, { kind: 'worker', look: (i) => ({ suit: cols[i % cols.length] }) });
  }

  buildCivilian(loc) {
    const palette = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff];
    const domes = [];
    const n = loc.id === 'tranq' ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.r() * 0.3;
      const d = 40 + this.r() * 35;
      const r = 11 + this.r() * 9;
      const dx = Math.cos(a) * d, dz = Math.sin(a) * d;
      this.dome(loc, dx, dz, r, palette[i % palette.length]);
      domes.push([dx, dz, r]);
    }
    this.dome(loc, 0, 0, 22, 0xb8ffb0, 0.3);
    for (const [dx, dz, r] of domes) {
      const k = 22 / Math.hypot(dx, dz);
      const k2 = 1 - r / Math.hypot(dx, dz);
      this.tube(loc, dx * k, dz * k, dx * k2, dz * k2, 1.6, 0xfff4e0);
    }
    for (let i = 0; i < 5; i++) {
      const a = this.r() * Math.PI * 2, d = 90 + this.r() * 15;
      this.block(loc, Math.cos(a) * Math.min(d, loc.r * 0.85), Math.sin(a) * Math.min(d, loc.r * 0.85), 10, 6, 8, palette[(i + 2) % palette.length], a);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.tower(loc, 55 + Math.cos(a) * 10, -60 + Math.sin(a) * 10, 3, 0.4, 0xfff4e0, palette[i]);
    }
    this.pad(loc, -65, 55, 13);
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
    this.dome(loc, 70, 50, 20, 0xe0e0f0);
    this.block(loc, -10, -80, 30, 10, 16, 0x7dff6a, 0.2);
    this.block(loc, 30, -95, 14, 8, 12, 0xfff4e0, -0.3);
    this.tower(loc, 100, -20, 40, 2, 0xe0e0e0, 0x7dff6a);
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

  buildMine(loc) {
    const rig = mesh(new THREE.CylinderGeometry(3, 6, 45, 8), toon(0xffd23f), 0.2);
    this.put(rig, loc, 0, 0, 22.5);
    this.col(loc, { type: 'cyl', x: 0, z: 0, y0: -2, y1: 45, r: 6 });
    const arm = mesh(new THREE.BoxGeometry(60, 3, 3), toon(0xff9f1c), 0.12);
    this.put(arm, loc, 0, 0, 40, 0, true);
    this.spinners.push({ obj: arm, axis: 'y', speed: 0.15, loc });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const t = mesh(new THREE.CylinderGeometry(7, 7, 14, 14), toon(i % 2 ? 0x7dff6a : 0xc77dff), 0.15);
      this.put(t, loc, Math.cos(a) * 60, Math.sin(a) * 60, 7);
      this.col(loc, { type: 'cyl', x: Math.cos(a) * 60, z: Math.sin(a) * 60, y0: -2, y1: 14, r: 7.2 });
    }
    this.block(loc, -40, 70, 24, 9, 12, 0x8a8aa0, 0.3);
    this.pad(loc, 70, 50, 12);
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
      this.blockB(B, loc, Math.cos(a) * wallR, Math.sin(a) * wallR, len, 7, 3, 0x5b5870, -a + Math.PI / 2, fc);
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
    this.block(loc, 0, 0, small ? 18 : 30, small ? 9 : 12, small ? 18 : 30, 0x4a4660, 0.785, fc);
    if (!small) {
      this.block(loc, 40, -30, 26, 8, 14, 0x5b5870, 0.2, 0x2a2540);
      this.block(loc, -35, 35, 20, 10, 20, 0x5b5870, -0.4, 0x2a2540);
    }
    this.tower(loc, -30, -30, small ? 30 : 50, 2.2, 0x5b5870, 0xff2a4a);
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

  buildGulch(loc) {
    const rust = [0x8a4b2a, 0x6b5a3a, 0x9a9a9a, 0x5a3a5a];
    for (let i = 0; i < 14; i++) {
      const a = this.r() * Math.PI * 2, d = 20 + this.r() * 80;
      const w = 4 + this.r() * 10, h = 3 + this.r() * 8;
      this.block(loc, Math.cos(a) * d, Math.sin(a) * d, w, h, 4 + this.r() * 8, rust[i % 4], this.r() * 3, 0x2a2a2a);
    }
    const hull = mesh(new THREE.CapsuleGeometry(9, 40, 6, 12).rotateZ(Math.PI / 2 - 0.2), toon(0x6b6880), 0.3);
    this.put(hull, loc, 0, -40, 6, 0.5);
    this.col(loc, { type: 'box', x: 0, y: 6, z: -40, hx: 28, hy: 9, hz: 9, yaw: 0.5 });
    this.flag(loc, 20, 20, [0x111111, 0x111111], 18);
    this.tower(loc, -30, 30, 18, 1.2, 0x3a3a3a, 0xff9f1c);
    // heat lamps: sickly orange pools in the dark
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      this.lamp(loc, Math.cos(a) * 60, Math.sin(a) * 60, 0xff9f1c, 5, 14);
    }
    this.addFigures(loc, 6, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  buildCamp(loc) {
    const rust = [0x8a4b2a, 0x6b5a3a, 0x5a3a5a];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + this.r();
      this.block(loc, Math.cos(a) * 28, Math.sin(a) * 28, 6 + this.r() * 5, 4, 6, rust[i % 3], a, 0x2a2a2a);
    }
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
      if (want !== loc.active) {
        loc.active = want;
        if (want) this.scene.add(loc.group); else this.scene.remove(loc.group);
      }
    }
    for (const s of this.spinners) if (s.loc.active) s.obj.rotation[s.axis] += s.speed * dt;
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
  }

  buildFunpark(loc) {
    const cols = [0xff2e88, 0xffd23f, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff];
    const spots = [[0, 0, 26], [55, 20, 16], [-50, 30, 18], [20, -60, 20], [-40, -50, 14], [70, -40, 12], [-80, -10, 12]];
    spots.forEach(([x, z, r], i) => {
      const g = new THREE.Group();
      const top = mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(cols[i % cols.length]), 0.25);
      g.add(top);
      const band = mesh(new THREE.TorusGeometry(r * 0.75, r * 0.08, 6, 24), toon(cols[(i + 2) % cols.length]), 0.1);
      band.rotation.x = Math.PI / 2;
      band.position.y = r * 0.62;
      g.add(band);
      this.put(g, loc, x, z, -0.5);
      const c = this.col(loc, { type: 'sphere', x, y: -0.5, z, r });
      c.bouncy = true;
    });
    // a bouncy castle
    const castle = mesh(new THREE.BoxGeometry(24, 6, 24), toon(0xff2e88), 0.2);
    this.put(castle, loc, 0, 70, 3);
    const cc = this.col(loc, { type: 'box', x: 0, y: 3, z: 70, hx: 12, hy: 3, hz: 12 });
    cc.bouncy = true;
    for (const [x, z] of [[-12, 58], [12, 58], [-12, 82], [12, 82]]) this.put(mesh(new THREE.CylinderGeometry(2, 2, 10, 10), toon(0xffd23f), 0.08), loc, x, z, 5);
    this.addFigures(loc, 4, { kind: 'kid', look: (i) => ({ suit: cols[i], scale: 0.55 }) });
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
    const picks = P.craters.filter((c) => c.R > 65 && c.R < 190 && SUN.dot(c.d) < 0.15)
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
