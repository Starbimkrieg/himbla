import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, glow, inkMat, textSprite } from './toon.js';
import { mulberry32 } from './rng.js';

// The small faction structures that dot the countryside (watchtowers, depots, farm domes, relay
// masts, kiosks, scrap shacks, junk piles). Each is a ~50 m compound on its own flattened plateau.
// A model is baked once per kind / faction colour / variant into a handful of merged meshes (one
// per material plus a single ink hull) and every outpost of that look clones it, sharing geometry
// and materials. Only flags, blinking lamps, spinning dishes and searchlights stay separate.
export const FLAT_R = 30; // flattened core radius (the terrain blends back out to ~2x this)
export const SMALL_KINDS = new Set(['tower', 'depot', 'farm', 'mast', 'kiosk', 'shack', 'junk']);

const STEEL = 0x55607a, DARK = 0x3a3550, LIGHT = 0xd8d4e8, CREAM = 0xfff4e0, CONC = 0x8a8698, YEL = 0xffd23f;
const WOOD = 0x8a5a3a, RUST = 0x7a4a32, TYRE = 0x221d33, CHAR = 0x2a2433;
const F = 0.3; // apron top: small props stand on this

// ---------- shared materials ----------
const mats = new Map();
const memo = (k, make) => { let m = mats.get(k); if (!m) mats.set(k, (m = make())); return m; };
const G = (c) => memo('g' + c, () => glow(c));
const T = (c) => toon(c);
const D = (c) => memo('d' + c, () => toon(c, { side: THREE.DoubleSide }));
const GLASS = (c, op) => memo(`x${c}/${op}`, () => new THREE.MeshToonMaterial({ color: c, gradientMap: toon(0).gradientMap, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
const BEAM = (c, op) => memo(`b${c}/${op}`, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
function textMat(text, fg, bg, stroke) {
  return memo(`t${text}|${fg}|${bg}|${stroke}`, () => {
    const s = textSprite(text, { color: fg, stroke, bg, size: 96 });
    const m = new THREE.MeshBasicMaterial({ map: s.material.map });
    m.userData.aspect = s.scale.x / s.scale.y;
    s.material.dispose();
    return m;
  });
}
const FLAG_GEO = new THREE.PlaneGeometry(3, 1.8).translate(1.55, 0, 0);

// a triangular prism lying along x, base on y=0: gable roofs and tents
function prism(len, width, height) {
  return new THREE.CylinderGeometry(1, 1, len, 3, 1, false, -Math.PI / 2).rotateZ(-Math.PI / 2)
    .scale(1, height / 1.5, width / 1.732).translate(0, height / 3, 0);
}
// a shallow dish facing local +z
const dishGeo = (r) => new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, 0.75).rotateX(-Math.PI / 2).translate(0, 0, r * 0.85);

// ---------- static-geometry kit ----------
const _m = new THREE.Matrix4(), _h = new THREE.Matrix4(), _t = new THREE.Matrix4(), _r = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Vector3(), _z = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
// in place: indexed, position + normal only, no groups (so everything merges)
function prep(g) {
  if (!g.index) { const n = g.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.clearGroups();
  return g;
}

class Kit {
  constructor(c, seed, wreck) {
    this.c = c;
    // separate streams so the shared props come out the same whether or not the main building
    // stands: rr for the yard, mr for the intact main building, wr for its wreckage
    this.rr = mulberry32(seed); this.mr = mulberry32(seed + 1); this.wr = mulberry32(seed + 2);
    this.wreck = wreck;
    this.drop = null; // open apron spot where loot can be thrown to
    this.byMat = new Map();
    this.ink = [];
    this.base = new THREE.Matrix4();
    this.yaw = 0;
    this.root = new THREE.Group();
    this.cols = []; // collider specs in the outpost frame
    this.hits = []; // boxes a blast has to reach to damage the main building
    this.raid = null; // where you stand to raid it
    this.smoke = null; // where a wreck smoulders
  }

  // frame for the following parts: position, yaw, and an optional tilt (for wrecks)
  at(x = 0, z = 0, yaw = 0, y = 0, rx = 0, rz = 0) {
    this.base.makeRotationY(yaw).setPosition(x, y, z);
    if (rx || rz) this.base.multiply(_r.makeRotationFromEuler(_e.set(rx, 0, rz)));
    this.yaw = yaw;
    return this;
  }

  P(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.base); }

  add(geo, mat, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, outline = 0.06, q = null } = {}) {
    if (q) _q.copy(q); else _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_p.set(x, y, z), _q, _s).premultiply(this.base);
    let list = this.byMat.get(mat);
    if (!list) this.byMat.set(mat, (list = []));
    prep(geo);
    if (outline) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getSize(_z);
      geo.boundingBox.getCenter(_c);
      const kx = 1 + (2 * outline) / Math.max(_z.x, 0.02), ky = 1 + (2 * outline) / Math.max(_z.y, 0.02), kz = 1 + (2 * outline) / Math.max(_z.z, 0.02);
      _h.makeTranslation(_c.x, _c.y, _c.z).multiply(_t.makeScale(kx, ky, kz)).multiply(_t.makeTranslation(-_c.x, -_c.y, -_c.z)).premultiply(_m);
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', geo.attributes.position.clone());
      hg.setIndex(geo.index);
      this.ink.push(hg.applyMatrix4(_h));
    }
    list.push(geo.applyMatrix4(_m));
    return this;
  }

  // boxes and cylinders by their base height
  box(w, h, d, mat, x, y0, z, o) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y0 + h / 2, z, o); }
  cyl(rt, rb, h, seg, mat, x, y0, z, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y0 + h / 2, z, o); }
  ball(r, mat, x, y, z, o) { return this.add(new THREE.SphereGeometry(r, 8, 6), mat, x, y, z, o); }
  ring(r, tube, mat, x, y, z, o = {}) { return this.add(new THREE.TorusGeometry(r, tube, 4, Math.max(12, Math.round(r * 5))).rotateX(Math.PI / 2), mat, x, y, z, { outline: 0, ...o }); }
  // a strut between two points
  beam(a, b, r, mat, { outline = 0.03, seg = 5 } = {}) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, _d.divideScalar(len));
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { q, outline });
  }
  // a flat strip (cable tray, road paint) between two ground points
  strip(a, b, w, h, mat, y0, o = {}) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    return this.box(w, h, Math.hypot(dx, dz), mat, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, { ry: Math.atan2(dx, dz), outline: 0.02, ...o });
  }

  // separate (animated or textured) objects
  dyn(obj, x, y, z, ry = 0) {
    obj.position.copy(this.P(x, y, z));
    obj.rotation.y += this.yaw + ry;
    this.root.add(obj);
    return obj;
  }
  blinker(x, y, z, color = 0xff2a4a, r = 0.4) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), G(color));
    m.userData.blink = true;
    return this.dyn(m, x, y, z);
  }
  flag(x, z, h = 10, color = this.c, y0 = 0) {
    this.cyl(0.1, 0.13, h, 6, T(DARK), x, y0, z, { outline: 0.03 });
    this.ball(0.22, G(color), x, y0 + h + 0.15, z, { outline: 0 });
    const holder = new THREE.Group(), pivot = new THREE.Group();
    const f = new THREE.Mesh(FLAG_GEO, D(color));
    f.castShadow = true;
    pivot.add(f);
    pivot.userData.flag = true;
    holder.add(pivot);
    return this.dyn(holder, x, y0 + h - 1.0, z, 0);
  }
  // a text panel (both faces); returns its height
  text(str, x, y, z, ry, w, { fg = '#ffd23f', bg = '#241a3a', stroke = '#120a1e', rz = 0, back = true, off = 0.17 } = {}) {
    const mat = textMat(str, fg, bg, stroke);
    const h = w / mat.userData.aspect;
    const geo = new THREE.PlaneGeometry(w, h);
    for (const side of back ? [0, 1] : [0]) {
      const m = new THREE.Mesh(geo, mat);
      const lz = side ? -1 : 1;
      m.position.copy(this.P(x, y, z)).add(_d.set(Math.sin(this.yaw + ry), 0, Math.cos(this.yaw + ry)).multiplyScalar(off * lz));
      m.rotation.set(0, this.yaw + ry + (side ? Math.PI : 0), side ? -rz : rz);
      this.root.add(m);
    }
    return h;
  }
  // a name board on two posts, face towards local +z (rotated by ry)
  sign(str, x, z, { ry = 0, w = 8, y = 3.4, rz = 0, fg, bg, stroke } = {}) {
    const mat = textMat(str, fg || '#ffd23f', bg || '#241a3a', stroke || '#120a1e');
    const pw = w - 0.5, ph = pw / mat.userData.aspect;
    const save = this.base.clone(), saveYaw = this.yaw;
    const local = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
    this.base.multiply(local);
    this.yaw += ry;
    for (const s of [-1, 1]) this.box(0.3, y + ph / 2 + 0.2, 0.3, T(DARK), s * (w / 2 - 0.6), 0, 0, { outline: 0.04 });
    this.box(w, ph + 0.5, 0.26, T(DARK), 0, y - ph / 2 - 0.25, 0, { rz, outline: 0.06 });
    this.box(w + 0.2, 0.3, 0.4, T(this.c), 0, y + ph / 2 + 0.2, 0, { rz, outline: 0.04 });
    this.text(str, 0, y, 0, 0, pw, { fg, bg, stroke, rz });
    this.base.copy(save); this.yaw = saveYaw;
  }
  lamp(x, z, h = 7, color = 0xfff3b0) {
    const l = Math.hypot(x, z) || 1, dx = -x / l, dz = -z / l;
    this.cyl(0.12, 0.17, h, 6, T(DARK), x, 0, z, { outline: 0.03 });
    this.beam([x, h, z], [x + dx * 1.5, h, z + dz * 1.5], 0.08, T(DARK));
    this.box(0.8, 0.3, 0.55, T(DARK), x + dx * 1.6, h - 0.05, z + dz * 1.6, { ry: Math.atan2(dx, dz), outline: 0.03 });
    this.box(0.66, 0.08, 0.42, G(color), x + dx * 1.6, h - 0.12, z + dz * 1.6, { ry: Math.atan2(dx, dz), outline: 0 });
  }
  apron(r, color, edge = 0x5a566a) {
    this.cyl(r, r + 0.6, 0.3, 48, T(color), 0, 0, 0, { outline: 0.05 });
    this.ring(r - 0.3, 0.16, T(edge), 0, 0.3, 0);
  }
  // little glowing marker posts round the apron edge, with a gap at the entrance (+z)
  perimeter(r, step = 0.32, gap = 0.3, skip = () => false) {
    for (let a = gap; a < Math.PI * 2 - gap + 1e-3; a += step) {
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (skip(x, z)) continue;
      this.box(0.26, 1.3, 0.26, T(DARK), x, 0, z, { outline: 0.03 });
      this.box(0.32, 0.22, 0.32, G(this.c), x, 1.3, z, { outline: 0 });
    }
  }
  // the raid marker: a glowing ring on the ground plus the stand point
  raidAt(x, z, color) {
    if (this.wreck) return; // nothing left to raid
    this.ring(1.7, 0.14, G(color), x, F + 0.04, z);
    this.ring(1.1, 0.07, G(color), x, F + 0.04, z);
    this.raid = this.P(x, F, z);
  }

  // colliders / blast boxes, given in the current frame
  solid(hx, hy, hz, x, z, ry = 0, y0 = 0) { const p = this.P(x, 0, z); this.cols.push({ type: 'box', hx, hy, hz, x: p.x, y: y0 + hy, z: p.z, yaw: this.yaw + ry }); }
  sphere(r, x, y, z) { const p = this.P(x, y, z); this.cols.push({ type: 'sphere', r, x: p.x, y: p.y, z: p.z }); }
  column(r, h, x, z, y0 = 0) { const p = this.P(x, 0, z); this.cols.push({ type: 'cyl', r, y0, y1: h, x: p.x, z: p.z }); }
  // a lying-down cylinder (quonset huts, hangars, pipes): axis along local z (turned by ry), centre at height y
  hcyl(r, len, x, z, ry = 0, y = 0) { const p = this.P(x, 0, z); this.cols.push({ type: 'hcyl', r, len, x: p.x, y, z: p.z, yaw: this.yaw + ry }); }
  hit(hx, hy, hz, x, z, ry = 0) { const p = this.P(x, 0, z); this.hits.push({ hx, hy, hz, x: p.x, y: hy, z: p.z, yaw: this.yaw + ry }); }

  finish() {
    for (const [mat, list] of this.byMat) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      const lit = mat.isMeshToonMaterial && !mat.transparent;
      m.castShadow = m.receiveShadow = lit;
      if (mat.transparent) m.renderOrder = 2;
      this.root.add(m);
      for (const g of list) g.dispose();
    }
    if (this.ink.length) {
      const h = new THREE.Mesh(mergeGeometries(this.ink), inkMat);
      h.userData.isInk = true;
      this.root.add(h);
      for (const g of this.ink) g.dispose();
    }
    this.byMat.clear();
    this.ink.length = 0;
    return { root: this.root, cols: this.cols, hits: this.hits, raid: this.raid, smoke: this.smoke, drop: this.drop };
  }
}

// ---------- shared bits ----------
function sandbags(k, cx, cz, r, a0, a1, rows = 2) {
  for (let row = 0; row < rows; row++) {
    const step = 1.25 / r;
    for (let a = a0 + (row % 2) * step * 0.5; a <= a1; a += step) {
      k.add(new THREE.SphereGeometry(0.66, 6, 3).scale(1, 0.5, 0.62), T(0xb59f74), cx + Math.sin(a) * r, F + 0.28 + row * 0.5, cz + Math.cos(a) * r, { ry: a + Math.PI / 2, outline: 0.03 });
    }
  }
}
function crate(k, x, y0, z, s = 1.2, color = 0x9a6a3a, ry = 0) {
  k.box(s, s, s, T(color), x, y0, z, { ry, outline: 0.04 });
  k.box(s * 1.02, s * 0.14, s * 1.02, T(0x5a3a22), x, y0 + s * 0.43, z, { ry, outline: 0 });
}
function container(k, x, y0, z, color, ry = 0) {
  k.box(2.45, 2.6, 6.1, T(color), x, y0, z, { ry, outline: 0.06 });
  for (const s of [-1, 1]) k.box(2.55, 2.66, 0.2, T(DARK), x + Math.sin(ry) * s * 3, y0 - 0.03, z + Math.cos(ry) * s * 3, { ry, outline: 0 });
  for (let i = -2; i <= 2; i++) k.box(2.53, 2.4, 0.08, T(color), x + Math.sin(ry) * i * 1.1, y0 + 0.1, z + Math.cos(ry) * i * 1.1, { ry, outline: 0 });
}
function tank(k, x, z, r, h, color, band) {
  k.cyl(r, r, h, 16, T(color), x, F, z, { outline: 0.08 });
  k.add(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), T(color), x, F + h, z, { outline: 0.06 });
  k.ring(r + 0.05, 0.16, T(band), x, F + h * 0.72, z);
  k.ring(r + 0.05, 0.16, T(band), x, F + h * 0.62, z);
}
// a lumpy heap of wreckage over a frustum mound
function junkHeap(k, cx, cz, R, H, n, rr) {
  const sc = R < 5 ? 0.5 : 1;
  const put = (geo, mat, x, y, z, o) => k.add(geo.scale(sc, sc, sc), mat, x, y, z, o);
  const top = R * 0.22;
  k.add(new THREE.CylinderGeometry(top, R, H, 16, 1), T(0x75685a), cx, F + H / 2 - 0.05, cz, { outline: 0.06 });
  const hh = (r) => (r < top ? H : H * (R - r) / (R - top));
  const cols = [0x6b5a4a, 0x7a3a2a, 0x5a5f6e, 0x8a8698, 0x3a3550, 0xa05a2a, 0x4a6a5a, 0xc9a227];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rr()) * R * 0.9, a = rr() * Math.PI * 2;
    const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r, y = F + hh(r) - 0.2;
    const rot = { rx: (rr() - 0.5) * 1.2, ry: rr() * 6.3, rz: (rr() - 0.5) * 1.2, outline: 0.05 };
    const col = cols[Math.floor(rr() * cols.length)];
    switch (Math.floor(rr() * 6)) {
      case 0: put(new THREE.BoxGeometry(1.8 + rr() * 2.5, 1.1 + rr() * 1.2, 1.4 + rr()), T(col), x, y + 0.3, z, rot); break;
      case 1: { const rad = 1 + rr(); put(new THREE.CylinderGeometry(rad, rad, 2.5 + rr() * 2, 10, 1, true, 0, Math.PI), D(col), x, y + 0.4, z, rot); break; }
      case 2: put(new THREE.TorusGeometry(0.85, 0.36, 6, 12), T(TYRE), x, y + 0.3, z, rot); break;
      case 3: put(new THREE.CylinderGeometry(0.12, 0.12, 3 + rr() * 3, 5), T(STEEL), x, y + 1, z, { ...rot, rx: rot.rx * 0.6, outline: 0.03 }); break;
      case 4: put(new THREE.BoxGeometry(2.4, 0.16, 1.6), T(col), x, y + 0.2, z, rot); break;
      default: put(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 8), T(col), x, y + 0.4, z, rot);
    }
  }
}
// string of party / pirate lights sagging between posts
function lightString(k, pts, colors, n = 8, sag = 1.1) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    let prev = [ax, ay, az];
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      const p = [ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t];
      k.beam(prev, p, 0.03, T(0x1a1428), { outline: 0, seg: 3 });
      if (j < n) k.ball(0.17, G(colors[(i * n + j) % colors.length]), p[0], p[1] - 0.15, p[2], { outline: 0 });
      prev = p;
    }
  }
}
function scatterDebris(k, cx, cz, hx, hz, n, rr, colors = [CHAR, 0x3a3540, 0x4a3f3a, 0x55505e]) {
  for (let i = 0; i < n; i++) {
    const s = 0.6 + rr() * 2.2;
    k.add(new THREE.BoxGeometry(s, 0.3 + rr() * 1.1, 0.6 + rr() * 2), T(colors[i % colors.length]), cx + (rr() * 2 - 1) * hx, F + 0.3, cz + (rr() * 2 - 1) * hz, { rx: (rr() - 0.5) * 0.7, ry: rr() * 3, rz: (rr() - 0.5) * 0.7, outline: 0.04 });
  }
}

// =====================================================================================
// Watchtower: a lattice tower with a lit cab and a sweeping searchlight, a Quonset barracks,
// a gun nest and a ring of concrete barriers with a gate arch.
// =====================================================================================
function tower(k) {
  const c = k.c;
  k.apron(24, 0x7e7a8c);
  // jersey barriers round the edge, gap at the gate (+z)
  let n = 0;
  for (let a = 0.38; a < Math.PI * 2 - 0.37; a += 3.25 / 22, n++) {
    const x = Math.sin(a) * 22, z = Math.cos(a) * 22;
    k.box(2.95, 0.55, 1.05, T(0xa8a4b4), x, F - 0.05, z, { ry: a, outline: 0.04 });
    k.box(2.95, 0.6, 0.5, T(0xa8a4b4), x, F + 0.5, z, { ry: a, outline: 0.04 });
    if (n % 3 === 0) k.box(2.97, 0.16, 0.52, T(c), x, F + 0.85, z, { ry: a, outline: 0 });
  }
  const TX = -7, TZ = -7, H = 22, BX = 8.5, BZ = -8;
  if (!k.wreck) {
    // the tower
    const hw = (y) => 3.4 + (2.0 - 3.4) * (y / H);
    const cn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    k.box(8, 0.5, 8, T(CONC), TX, 0, TZ);
    for (const [sx, sz] of cn) k.beam([TX + sx * 3.4, 0.4, TZ + sz * 3.4], [TX + sx * 2.0, H, TZ + sz * 2.0], 0.24, T(STEEL), { outline: 0.05, seg: 6 });
    const lv = [0.5, 5.8, 11.1, 16.4, H];
    for (let i = 0; i < 4; i++) {
      const y0 = lv[i], y1 = lv[i + 1], w0 = hw(y0), w1 = hw(y1);
      for (let f = 0; f < 4; f++) {
        const [ax, az] = cn[f], [bx, bz] = cn[(f + 1) % 4];
        k.beam([TX + ax * w0, y0, TZ + az * w0], [TX + bx * w1, y1, TZ + bz * w1], 0.08, T(DARK));
        k.beam([TX + bx * w0, y0, TZ + bz * w0], [TX + ax * w1, y1, TZ + az * w1], 0.08, T(DARK));
        if (i > 0) k.beam([TX + ax * w0, y0, TZ + az * w0], [TX + bx * w0, y0, TZ + bz * w0], 0.1, T(STEEL));
      }
    }
    // ladder up the gate-facing side
    for (const s of [-0.5, 0.5]) k.beam([TX + s, 0.5, TZ + 3.5], [TX + s, H, TZ + 2.1], 0.05, T(DARK), { outline: 0.02 });
    for (let y = 1.5; y < H; y += 1.2) { const zz = TZ + 3.5 - (1.4 * (y - 0.5)) / (H - 0.5); k.beam([TX - 0.5, y, zz], [TX + 0.5, y, zz], 0.04, T(DARK), { outline: 0 }); }
    // platform, railing and the observation cab
    k.box(7.6, 0.4, 7.6, T(DARK), TX, H, TZ);
    for (const s of [-1, 1]) {
      k.box(7.6, 0.12, 0.12, T(c), TX, H + 1.1, TZ + s * 3.74, { outline: 0.02 });
      k.box(0.12, 0.12, 7.6, T(c), TX + s * 3.74, H + 1.1, TZ, { outline: 0.02 });
      for (const t of [-1, 0, 1]) { k.box(0.1, 1.1, 0.1, T(DARK), TX + t * 3.7, H + 0.4, TZ + s * 3.74, { outline: 0 }); k.box(0.1, 1.1, 0.1, T(DARK), TX + s * 3.74, H + 0.4, TZ + t * 3.7, { outline: 0 }); }
    }
    k.box(5, 2.8, 5, T(STEEL), TX, H + 0.4, TZ, { outline: 0.08 });
    k.box(5.1, 1.0, 5.1, G(0xfff0a0), TX, H + 1.5, TZ, { outline: 0 });
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
      k.box(0.18, 1.02, 0.18, T(DARK), TX + i * 1.6, H + 1.49, TZ + s * 2.56, { outline: 0 });
      k.box(0.18, 1.02, 0.18, T(DARK), TX + s * 2.56, H + 1.49, TZ + i * 1.6, { outline: 0 });
    }
    k.box(6, 0.45, 6, T(c), TX, H + 3.2, TZ, { outline: 0.06 });
    k.cyl(0.07, 0.09, 4, 5, T(DARK), TX + 2.2, H + 3.6, TZ + 2.2, { outline: 0.02 });
    k.blinker(TX + 2.2, H + 7.8, TZ + 2.2, 0xff2a4a, 0.35);
    // searchlight sweeping round on the roof
    const sl = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.8, 8), T(DARK)); ped.position.y = 0.4; sl.add(ped);
    const head = new THREE.Group(); head.position.y = 1.15; head.rotation.x = 0.42; sl.add(head);
    const hous = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.48, 1.3, 10).rotateX(Math.PI / 2), T(LIGHT));
    hous.castShadow = true; head.add(hous);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 10).rotateX(Math.PI / 2), G(0xfffbe0)); lens.position.z = 0.66; head.add(lens);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5, 38, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 19.7), BEAM(0xfff3b0, 0.13));
    cone.renderOrder = 3; head.add(cone);
    sl.userData.spin = true;
    k.dyn(sl, TX, H + 3.62, TZ);
    k.solid(3.4, 12.6, 3.4, TX, TZ);
    // the barracks: a Quonset hut
    k.add(new THREE.CylinderGeometry(3.4, 3.4, 11, 16).rotateX(Math.PI / 2), T(0x6f7a5a), BX, 0, BZ, { outline: 0.1 });
    for (const dz of [-4.5, -1.5, 1.5, 4.5]) k.add(new THREE.TorusGeometry(3.44, 0.1, 4, 18, Math.PI), T(0x4f5a42), BX, 0, BZ + dz, { outline: 0 });
    k.add(new THREE.TorusGeometry(3.46, 0.22, 4, 18, Math.PI), T(c), BX, 0, BZ + 3, { outline: 0 });
    k.box(1.6, 2.4, 0.2, T(0x2a2540), BX, F, BZ + 5.52, { outline: 0.03 });
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10).rotateX(Math.PI / 2), G(0xffe6a8), BX + s * 1.9, 1.8, BZ + 5.52, { outline: 0 });
    k.box(0.6, 0.2, 0.3, G(0xfff3b0), BX, 2.95, BZ + 5.6, { outline: 0 });
    k.box(2, 1.4, 1.4, T(0xc9a227), BX + 5.2, F, BZ + 1, { outline: 0.05 });
    k.cyl(0.12, 0.12, 1.6, 6, T(DARK), BX + 5.8, F + 1.4, BZ + 1.3, { outline: 0.02 });
    k.solid(3.4, 1.8, 5.5, BX, BZ);
  } else {
    const wr = k.wr;
    // the tower snapped above the first bay and folded over towards the gate
    k.box(8, 0.5, 8, T(CONC), TX, 0, TZ);
    k.box(9, 0.06, 9, T(CHAR), TX, 0.5, TZ, { outline: 0 });
    const cn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of cn) { const h = 2.5 + wr() * 3.5; k.beam([TX + sx * 3.4, 0.4, TZ + sz * 3.4], [TX + sx * 3.1 + (wr() - 0.5), h, TZ + sz * 3.1 + (wr() - 0.5)], 0.24, T(0x3e4352), { outline: 0.05, seg: 6 }); }
    for (const sx of [-1, 1]) for (const y of [1.0, 1.9]) k.beam([TX + sx * 2.1, y, TZ + 2], [TX + sx * 2.3 + (wr() - 0.5) * 0.6, y + 0.3, TZ + 14], 0.22, T(0x3e4352), { outline: 0.05, seg: 6 });
    for (let i = 0; i < 6; i++) { const z = TZ + 3 + i * 2; k.beam([TX - 2.2, 1.0 + (i % 2) * 0.9, z], [TX + 2.2, 1.9 - (i % 2) * 0.9, z + 2], 0.08, T(DARK)); }
    k.box(5, 2.2, 5, T(0x4a5068), TX, F + 0.3, TZ + 16.5, { rx: 0.25, rz: 0.35, outline: 0.08 });
    k.box(6, 0.45, 6, T(0x3a3f50), TX + 0.8, F, TZ + 19.5, { ry: 0.5, rx: 0.15, outline: 0.06 });
    // the barracks burnt out: ribs and buckled skin
    k.box(7.4, 0.06, 11.5, T(CHAR), BX, F, BZ, { outline: 0 });
    for (const dz of [-4.5, -1.5, 1.5, 4.5]) if (wr() < 0.75) k.add(new THREE.TorusGeometry(3.4, 0.12, 4, 14, Math.PI * (0.35 + wr() * 0.5)), T(0x3a3f30), BX, 0, BZ + dz, { rz: wr() * 0.6, outline: 0.03 });
    for (let i = 0; i < 4; i++) k.add(new THREE.CylinderGeometry(3.4, 3.4, 2 + wr() * 2, 8, 1, true, wr() * 6, 0.9).rotateX(Math.PI / 2), D(0x4f5a42), BX + (wr() - 0.5) * 2, 0.2, BZ - 4 + i * 2.6, { rz: (wr() - 0.5) * 0.8, outline: 0.04 });
    scatterDebris(k, BX, BZ, 3.2, 5, 12, wr);
    scatterDebris(k, TX, TZ, 4, 4, 8, wr);
  }
  k.hit(3.6, 12.8, 3.6, TX, TZ);
  k.hit(3.4, 1.8, 5.5, BX, BZ);
  k.smoke = new THREE.Vector3(TX, 2, TZ);
  k.drop = new THREE.Vector3(1, F, 8);
  // ammo locker by the barracks door, with a crate of searchlight lenses: the raid spot
  k.box(1.4, 2.0, 0.8, T(0x4f5a42), BX + 2.6, F, BZ + 6.4, { outline: 0.05 });
  k.box(1.42, 0.25, 0.82, T(c), BX + 2.6, F + 1.5, BZ + 6.4, { outline: 0 });
  k.box(0.9, 0.5, 0.05, T(YEL), BX + 2.6, F + 0.8, BZ + 6.82, { outline: 0 });
  crate(k, BX + 2.6, F, BZ + 8.0, 1.0, 0x6f7a5a, 0.2);
  for (const [dx, dz] of [[-0.22, -0.2], [0.22, 0.2]]) k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), G(0xfffbe0), BX + 2.6 + dx, F + 1.03, BZ + 8.0 + dz, { outline: 0 });
  k.raidAt(BX, BZ + 8.3, 0xffd23f);
  // gun nest
  sandbags(k, -12, 8, 2.4, 0.6, 5.7, 2);
  for (const a of [0, 2.1, 4.2]) k.beam([-12, F + 1.1, 8], [-12 + Math.sin(a) * 0.8, F, 8 + Math.cos(a) * 0.8], 0.05, T(DARK));
  k.box(0.4, 0.4, 2.2, T(DARK), -12, F + 1.05, 8.6, { rx: -0.15, outline: 0.03 });
  sandbags(k, 9, 12, 1.8, -0.6, 3.6, 2);
  crate(k, 9, F, 12, 1.1, 0x4f5a42);
  // gate arch, flags and floodlights
  k.sign('WATCHTOWER', 0, 22, { w: 9.8, y: 5.4 });
  k.flag(-6.6, 21.2, 10);
  k.flag(6.6, 21.2, 10);
  k.lamp(16, 13, 8); k.lamp(-17, -10, 8); k.lamp(18, -8, 8);
}

// =====================================================================================
// Supply depot: a warehouse with roll-up doors, a container yard under a gantry crane, fuel
// tanks in a bund, a landing pad, and the wiring rack you raid.
// =====================================================================================
function depot(k, wreck) {
  const c = k.c, rr = k.rr;
  k.apron(27, CONC);
  // warehouse
  const WX = 3, WZ = -13, W = 20, Dp = 11, H = 8;
  if (!wreck) {
    k.box(W, H, Dp, T(0x4a4f5e), WX, 0, WZ, { outline: 0.12 });
    k.box(W + 0.3, 0.7, Dp + 0.3, T(c), WX, H - 0.7, WZ, { outline: 0.05 });
    k.add(prism(W + 0.8, Dp + 1, 2.6), T(0x6a7088), WX, H, WZ, { outline: 0.1 });
    for (const vx of [-5, 0, 5]) k.cyl(0.45, 0.55, 0.9, 8, T(DARK), WX + vx, H + 2.1, WZ, { outline: 0.03 });
    const fz = WZ + Dp / 2;
    for (const px of [-9.8, -6.4, 0, 6.4, 9.8]) k.box(0.5, H - 0.7, 0.3, T(0x3e4352), WX + px, 0, fz + 0.1, { outline: 0.02 });
    [-6.5, 0, 6.5].forEach((dx, i) => {
      const x = WX + dx;
      k.box(5.2, 5.4, 0.3, T(DARK), x, 0, fz + 0.05, { outline: 0.03 });
      if (i === 2) { // half open, lit inside
        k.box(4.6, 2.4, 0.36, T(0xb8b4c8), x, 2.8, fz + 0.12, { outline: 0.02 });
        k.box(4.5, 2.6, 0.1, G(0xffcf7a), x, 0.2, fz + 0.02, { outline: 0 });
        crate(k, x - 1, F, fz + 1.2, 1.1, 0x9a6a3a, 0.3);
      } else {
        k.box(4.6, 5, 0.36, T(0xb8b4c8), x, 0.2, fz + 0.12, { outline: 0.02 });
        for (let s = 0; s < 6; s++) k.box(4.6, 0.07, 0.42, T(0x8a8698), x, 0.9 + s * 0.75, fz + 0.12, { outline: 0 });
      }
      k.box(0.8, 0.25, 0.3, G(0xfff3b0), x, 5.55, fz + 0.3, { outline: 0 });
      for (let s = 0; s < 4; s++) k.box(1.0, 0.04, 0.6, T(s % 2 ? 0x221d33 : YEL), x - 1.6 + s * 1.07, F, fz + 0.9, { outline: 0 });
    });
    k.at(WX, WZ + 2.6, 0, H + 0.9);
    k.sign('SUPPLY DEPOT', 0, 0, { w: 11, y: 2.4 });
    k.at();
    // office annex on the side
    k.box(5, 3.6, 4.5, T(CREAM), WX - 12.6, 0, WZ + 2, { outline: 0.08 });
    k.box(5.4, 0.35, 4.9, T(c), WX - 12.6, 3.6, WZ + 2, { outline: 0.04 });
    k.box(2.4, 1, 0.1, G(0xffe6a8), WX - 13.2, 1.7, WZ + 4.27, { outline: 0 });
    k.box(1.1, 2.2, 0.12, T(0x2ec4ff), WX - 11, F, WZ + 4.27, { outline: 0.02 });
    k.cyl(0.05, 0.05, 3.5, 4, T(DARK), WX - 14.4, 3.9, WZ + 0.6, { outline: 0 });
    k.solid(W / 2, H / 2, Dp / 2, WX, WZ);
    k.solid(2.5, 1.8, 2.25, WX - 12.6, WZ + 2);
  } else {
    k.box(W + 1, 0.06, Dp + 1, T(CHAR), WX, F, WZ, { outline: 0 });
    for (let x = -W / 2 + 1.25; x < W / 2; x += 2.5) for (const s of [-1, 1]) {
      const h = 0.5 + k.wr() * (s < 0 ? 3.5 : 2);
      k.box(2.45, h, 0.5, T(k.wr() < 0.5 ? 0x3a3540 : 0x4a4f5e), WX + x, 0, WZ + s * Dp / 2, { rz: (k.wr() - 0.5) * 0.1, outline: 0.05 });
    }
    for (let z = -Dp / 2 + 1.4; z < Dp / 2; z += 2.75) for (const s of [-1, 1]) k.box(0.5, 0.5 + k.wr() * 2.5, 2.7, T(0x3a3540), WX + s * W / 2, 0, WZ + z, { outline: 0.05 });
    for (let i = 0; i < 3; i++) k.box(6.5, 0.3, 5.5, T(0x4a4f62), WX - 6 + i * 6, 1 + k.wr() * 1.2, WZ + (k.wr() - 0.5) * 3, { rx: (k.wr() - 0.5) * 0.7, rz: (k.wr() - 0.5) * 0.6, outline: 0.05 });
    k.box(4.6, 0.36, 5, T(0x8a8698), WX + 6.5, F + 0.2, WZ + Dp / 2 + 3, { ry: 0.4, rx: 0.08, outline: 0.03 });
    scatterDebris(k, WX, WZ, W / 2, Dp / 2, 22, k.wr);
    for (let i = 0; i < 6; i++) k.beam([WX + (k.wr() - 0.5) * W, F, WZ + (k.wr() - 0.5) * Dp], [WX + (k.wr() - 0.5) * W, 2 + k.wr() * 3, WZ + (k.wr() - 0.5) * Dp], 0.12, T(DARK));
    k.box(5, 1.2, 4.5, T(0x5a5560), WX - 12.6, 0, WZ + 2, { outline: 0.05 });
  }
  k.hit(W / 2, H / 2, Dp / 2, WX, WZ);
  k.smoke = new THREE.Vector3(WX, 1.5, WZ);
  k.drop = new THREE.Vector3(1, F, 2);
  // container yard
  const colors = [0xd9482b, 0x2b59c3, 0x3f9a3a, 0xffd23f, 0x8a8698, c];
  let top = 1;
  for (let col = 0; col < 3; col++) for (const z of [-2, 5]) {
    const n = 1 + Math.floor(rr() * 3);
    top = Math.max(top, n);
    for (let s = 0; s < n; s++) container(k, -21 + col * 2.8, s * 2.62, z, colors[Math.floor(rr() * colors.length)]);
    // each stack its own height (one box at the tallest made invisible walls over the short ones)
    k.solid(1.3, n * 1.31, 3.1, -21 + col * 2.8, z);
  }
  // gantry crane over it
  for (const xe of [-24, -12.4]) {
    k.beam([xe, 0.3, -4], [xe, 11, 1.5], 0.3, T(YEL), { outline: 0.05, seg: 6 });
    k.beam([xe, 0.3, 7], [xe, 11, 1.5], 0.3, T(YEL), { outline: 0.05, seg: 6 });
    k.beam([xe, 3, -2.65], [xe, 3, 5.65], 0.15, T(DARK));
    k.box(0.8, 0.5, 1.4, T(DARK), xe, 0, -4, { outline: 0.03 });
    k.box(0.8, 0.5, 1.4, T(DARK), xe, 0, 7, { outline: 0.03 });
  }
  k.box(12.6, 1.3, 1.3, T(c), -18.2, 10.6, 1.5, { outline: 0.06 });
  k.box(2, 1, 1.8, T(YEL), -17, 9.6, 1.5, { outline: 0.04 });
  k.beam([-17, 9.6, 1.5], [-17, top * 2.62 + 1.4, 1.5], 0.05, T(DARK), { outline: 0 });
  k.box(2.2, 0.4, 6, T(YEL), -17, top * 2.62 + 1.0, 1.5, { outline: 0.04 });
  // fuel tanks in a bund
  for (const [x, z] of [[15.5, 2], [20.5, 5.5], [16, 9.5]]) tank(k, x, z, 2.2, 5, 0xe8e2f4, c);
  for (const [a, b] of [[[12.2, -0.8], [23, -0.8]], [[23, -0.8], [23, 12.4]], [[23, 12.4], [12.2, 12.4]], [[12.2, 12.4], [12.2, -0.8]]]) k.strip(a, b, 0.4, 0.8, T(0xa8a4b4), 0, { outline: 0.03 });
  k.beam([15.5, 1.1, -0.2], [13.2, 1.1, -7.3], 0.2, T(LIGHT), { outline: 0.04, seg: 6 });
  k.beam([15.5, 1.1, 2], [20.5, 1.1, 5.5], 0.16, T(LIGHT), { outline: 0.03, seg: 6 });
  k.beam([15.5, 1.1, 2], [16, 1.1, 9.5], 0.16, T(LIGHT), { outline: 0.03, seg: 6 });
  for (const [x, z] of [[15.5, 2], [20.5, 5.5], [16, 9.5]]) k.column(2.3, 7.6, x, z);
  // landing pad
  k.cyl(6.5, 6.5, 0.12, 32, T(0x4f4b5e), -8, F, 16, { outline: 0 });
  k.ring(5.6, 0.2, T(YEL), -8, F + 0.14, 16);
  for (const s of [-1, 1]) k.box(0.6, 0.05, 4, T(YEL), -8 + s * 1.3, F + 0.12, 16, { outline: 0 });
  k.box(2.6, 0.05, 0.6, T(YEL), -8, F + 0.12, 16, { outline: 0 });
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; k.cyl(0.2, 0.25, 0.25, 8, G(0x2ee6ff), -8 + Math.sin(a) * 6.2, F, 16 + Math.cos(a) * 6.2, { outline: 0 }); }
  // the wiring rack (raid point in front of it)
  k.at(6, 15, Math.PI);
  for (const s of [-1, 1]) k.box(0.2, 3.4, 1.4, T(DARK), s * 2.6, F, 0, { outline: 0.03 });
  for (const y of [0.9, 1.9, 2.9]) k.box(5.4, 0.12, 1.4, T(STEEL), 0, F + y, 0, { outline: 0.02 });
  const coil = [0xff9f1c, 0xff2a4a, 0x2ec4ff, 0x7dff3a, YEL];
  for (const [j, y] of [0.9, 1.9, 2.9].entries()) for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(0.42, 0.15, 5, 12).rotateX(Math.PI / 2), T(coil[(i + j * 2) % 5]), -1.8 + i * 1.2, F + y + 0.2, 0, { outline: 0.02 });
  for (const s of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(0.9, 0.9, 1.0, 14).rotateZ(Math.PI / 2), T(s < 0 ? 0xff9f1c : 0x2ec4ff), s * 4.3, F + 1.3, 0, { outline: 0.04 });
    for (const f of [-1, 1]) k.add(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 16).rotateZ(Math.PI / 2), T(WOOD), s * 4.3 + f * 0.56, F + 1.3, 0, { outline: 0.03 });
  }
  k.box(3.2, 0.9, 0.1, T(DARK), 0, F + 3.5, 0.3, { outline: 0.02 });
  k.text('WIRING', 0, F + 3.95, 0.3, 0, 2.8, { fg: '#ffb347', back: false });
  k.solid(5.4, 1.75, 0.9, 0, 0);
  k.raidAt(0, 3.2, 0xffb347);
  k.at();
  // flags, perimeter, lights
  k.flag(-1.2, 24.2, 10); k.flag(2.8, 24.2, 10);
  k.perimeter(26.2, 0.3, 0.24);
  k.lamp(-15, -12, 8); k.lamp(21, -9, 8); k.lamp(-4.5, 21.5, 7);
}

// =====================================================================================
// Farm dome: two glass greenhouse domes full of crop beds under magenta grow lights, joined by a
// tube; irrigation tanks, a solar array, and the sapling nursery bench you raid.
// =====================================================================================
const FARM_DOMES = [[-11, -8, 10], [10, -10, 7]];
function farm(k, wreck) {
  const c = k.c, rr = k.rr;
  k.apron(28, 0x948a7a, 0x6a604f);
  k.box(4, 0.05, 22, T(0xb0a898), 0, F - 0.02, 16, { outline: 0 });
  for (const [x, z, R] of FARM_DOMES) {
    if (!wreck) {
      k.cyl(R + 0.2, R + 0.4, 1.1, 36, T(LIGHT), x, 0, z, { outline: 0.08 });
      k.ring(R + 0.25, 0.26, T(c), x, 1.15, z);
      k.add(new THREE.SphereGeometry(R, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), GLASS(0xa8f0ff, 0.28), x, 1.1, z, { outline: 0 });
      for (let i = 0; i < 6; i++) k.add(new THREE.TorusGeometry(R + 0.04, 0.13, 4, 24, Math.PI), T(0xe8f4ff), x, 1.1, z, { ry: (i * Math.PI) / 6, outline: 0.03 });
      for (const ph of [0.45, 0.95]) k.ring(R * Math.cos(ph) + 0.04, 0.12, T(0xe8f4ff), x, 1.1 + R * Math.sin(ph), z, { outline: 0.03 });
      k.cyl(0.9, 1.1, 0.6, 10, T(LIGHT), x, 1.0 + R, z, { outline: 0.04 });
      k.blinker(x, 1.9 + R, z, 0x7dff6a, 0.32);
      // crop beds, plants and grow lights
      const plantCols = [0x5fbf4a, 0x7dd65a, 0x3f9a3a, 0x9be05a];
      for (let bz = -R * 0.6; bz <= R * 0.6 + 0.01; bz += 2.4) {
        const half = Math.sqrt((R * 0.8) ** 2 - bz * bz);
        k.box(half * 2, 0.6, 1.2, T(0x5a3f2a), x, F, z + bz, { outline: 0.03 });
        for (let px = -half + 0.6; px < half - 0.4; px += 1.05) {
          const t = k.mr(), pc = plantCols[Math.floor(k.mr() * 4)];
          if (t < 0.4) k.add(new THREE.ConeGeometry(0.34, 0.9 + k.mr() * 0.6, 5), T(pc), x + px, F + 1.2, z + bz, { outline: 0.02 });
          else if (t < 0.75) k.add(new THREE.SphereGeometry(0.42, 6, 4), T(pc), x + px, F + 0.95, z + bz, { outline: 0.02 });
          else if (t < 0.92) k.add(new THREE.ConeGeometry(0.2, 1.8, 5), T(0x3f9a3a), x + px, F + 1.5, z + bz, { outline: 0.02 });
          else k.add(new THREE.SphereGeometry(0.3, 6, 4), T(0xff9f1c), x + px, F + 0.85, z + bz, { outline: 0.02 });
        }
        k.box(half * 1.7, 0.12, 0.3, G(0xff5fd2), x, 3.9, z + bz, { outline: 0 });
        for (const s of [-1, 1]) k.beam([x + s * half * 0.8, 4.0, z + bz], [x + s * half * 0.8, 5.4, z + bz], 0.03, T(DARK), { outline: 0 });
      }
      // airlock towards the yard centre
      const a = Math.atan2(-x, -z);
      k.at(x + Math.sin(a) * (R - 0.6), z + Math.cos(a) * (R - 0.6), a);
      k.add(new THREE.CylinderGeometry(1.5, 1.5, 3.2, 12).rotateX(Math.PI / 2), T(LIGHT), 0, 1.2, 1.6, { outline: 0.06 });
      k.ring(1.55, 0.12, T(c), 0, 1.2, 2.6, { rx: Math.PI / 2 });
      k.box(1.3, 2.1, 0.2, T(0x2ec4ff), 0, F, 3.2, { outline: 0.03 });
      k.box(0.6, 0.18, 0.2, G(0x7dff3a), 0, 2.5, 3.25, { outline: 0 });
      k.at();
      k.sphere(R + 0.35, x, 1.1, z);
    } else {
      k.cyl(R + 0.6, R + 0.6, 0.06, 28, T(CHAR), x, F, z, { outline: 0 });
      let th = k.wr();
      while (th < Math.PI * 2 - 0.5) {
        const len = 0.5 + k.wr() * 0.9;
        k.add(new THREE.CylinderGeometry(R + 0.3, R + 0.4, 0.3 + k.wr() * 0.8, 6, 1, true, th, len), D(0x8a8698), x, 0.4, z, { outline: 0.04 });
        th += len + 0.2 + k.wr() * 0.5;
      }
      for (let i = 0; i < 6; i++) k.add(new THREE.TorusGeometry(R * (0.5 + k.wr() * 0.5), 0.13, 4, 12, 0.8 + k.wr()), T(0xb8c4d8), x + (k.wr() - 0.5) * R, 0.5 + k.wr(), z + (k.wr() - 0.5) * R, { rx: Math.PI / 2 + (k.wr() - 0.5) * 0.6, ry: k.wr() * 6, outline: 0.03 });
      for (let i = 0; i < 10; i++) k.add(new THREE.TetrahedronGeometry(0.5 + k.wr() * 0.9), GLASS(0xa8f0ff, 0.4), x + (k.wr() - 0.5) * R * 1.6, F + 0.2, z + (k.wr() - 0.5) * R * 1.6, { rx: k.wr() * 3, ry: k.wr() * 3, outline: 0 });
      for (let bz = -R * 0.5; bz <= R * 0.5; bz += 2.4) {
        k.box(R * 1.1, 0.4, 1.1, T(0x2e2420), x, F, z + bz, { ry: (k.wr() - 0.5) * 0.3, outline: 0.03 });
        for (let j = 0; j < 4; j++) k.add(new THREE.ConeGeometry(0.25, 0.9, 5), T(0x6a5a3a), x + (k.wr() - 0.5) * R, F + 0.5, z + bz, { rz: 1 + k.wr(), ry: k.wr() * 6, outline: 0.02 });
      }
      scatterDebris(k, x, z, R * 0.7, R * 0.7, 8, k.wr);
    }
    k.hit(R * 0.8, (R + 1.1) / 2, R * 0.8, x, z);
  }
  k.smoke = new THREE.Vector3(FARM_DOMES[0][0], 2, FARM_DOMES[0][1]);
  k.drop = new THREE.Vector3(3, F, 7);
  if (!wreck) { // tube between the domes
    const [[ax, az, ar], [bx, bz, br]] = FARM_DOMES;
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    k.beam([ax + ux * (ar - 0.5), 1.3, az + uz * (ar - 0.5)], [bx - ux * (br - 0.5), 1.3, bz - uz * (br - 0.5)], 1.2, T(LIGHT), { outline: 0.06, seg: 10 });
  }
  // irrigation: tanks, pump, pipes
  tank(k, -20, 9, 2, 4.5, 0x4f8fc0, c);
  tank(k, -15.5, 14, 2, 4.5, 0x4f8fc0, c);
  for (const [x, z] of [[-20, 9], [-15.5, 14]]) {
    const l = Math.hypot(x, z);
    k.box(0.18, 3, 0.1, G(0x2ee6ff), x - (x / l) * 2.02, F + 0.6, z - (z / l) * 2.02, { ry: Math.atan2(x, z), outline: 0 });
    k.column(2.1, 7, x, z);
  }
  k.box(1.6, 1.1, 1.2, T(STEEL), -17.5, F, 6.5, { outline: 0.04 });
  k.beam([-17.5, 0.9, 6.5], [-15.2, 0.9, 1.1], 0.18, T(LIGHT), { outline: 0.03, seg: 6 });
  k.beam([-20, 0.9, 9], [-17.5, 0.9, 6.5], 0.18, T(LIGHT), { outline: 0.03, seg: 6 });
  k.beam([-15.5, 0.9, 14], [-17.5, 0.9, 6.5], 0.18, T(LIGHT), { outline: 0.03, seg: 6 });
  k.beam([9, 0.7, 1], [9.6, 0.7, -2.6], 0.14, T(LIGHT), { outline: 0.03, seg: 6 });
  // solar array
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const x = -11 + i * 2.8, z = 17 + j * 2.7;
    k.cyl(0.08, 0.08, 1.2, 5, T(DARK), x, F, z, { outline: 0 });
    k.box(2.6, 0.08, 2.0, T(0x26306a), x, F + 1.3, z, { rx: -0.45, outline: 0.03 });
    k.box(2.62, 0.04, 0.05, T(LIGHT), x, F + 1.38, z, { rx: -0.45, outline: 0 });
  }
  // the nursery bench (raid point in front of it)
  k.at(10, 13, Math.PI);
  k.box(6, 0.12, 1.6, T(WOOD), 0, F + 1.0, 0, { outline: 0.03 });
  k.box(5.8, 0.1, 1.4, T(WOOD), 0, F + 0.45, 0, { outline: 0.02 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.12, 1.0, 0.12, T(0x5a3a22), sx * 2.8, F, sz * 0.65, { outline: 0 });
  for (let row = 0; row < 2; row++) for (let i = 0; i < 7; i++) {
    const x = -2.4 + i * 0.8, z = -0.35 + row * 0.7;
    k.cyl(0.24, 0.17, 0.38, 8, T(0xc0603a), x, F + 1.12, z, { outline: 0.02 });
    k.cyl(0.03, 0.03, 0.4, 4, T(0x3f6a2a), x, F + 1.45, z, { outline: 0 });
    k.add(new THREE.ConeGeometry(0.22 + (i % 3) * 0.04, 0.55, 5), T(i % 2 ? 0x7dff6a : 0x5fbf4a), x, F + 2.0, z, { outline: 0.02 });
  }
  for (let i = 0; i < 3; i++) k.box(1.5, 0.12, 1.0, T(0x3f6a2a), -1.8 + i * 1.8, F + 0.55, 0, { outline: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.12, 2.9, 0.12, T(DARK), sx * 3.2, F, sz * 1.15, { outline: 0.02 });
  k.box(6.9, 0.08, 3, T(c), 0, F + 2.85, 0, { rx: 0.1, outline: 0.03 });
  k.text('SAPLINGS', 0, F + 2.45, 1.4, 0, 2.6, { fg: '#7dff6a', back: false });
  k.solid(3.3, 0.7, 1.2, 0, 0);
  k.raidAt(0, 3.0, 0x7dff6a);
  k.at();
  // name board, flags, perimeter, lights
  k.sign('FARM DOME', 0, 24.6, { w: 9 });
  k.flag(-6.2, 24.4, 9); k.flag(6.2, 24.4, 9);
  k.perimeter(27.2, 0.3, 0.3);
  k.lamp(1, -21, 7); k.lamp(22, 6, 7); k.lamp(-24, -2, 7);
}

// =====================================================================================
// Relay mast: a 40 m guyed lattice mast in aviation red and white with dishes and beacons, an
// equipment shed, a cable tray, and a big dish on the ground.
// =====================================================================================
function mast(k) {
  const c = k.c;
  k.apron(24, 0x7a7686);
  const MX = -3, MZ = -6, H = 40.7, SX = 10, SZ = 8;
  if (!k.wreck) {
    k.box(3.6, 0.7, 3.6, T(CONC), MX, 0, MZ, { outline: 0.05 });
    const legs = [0, 1, 2].map((i) => { const a = (i * Math.PI * 2) / 3 + 0.3; return [MX + Math.cos(a) * 0.95, MZ + Math.sin(a) * 0.95]; });
    for (let s = 0; s < 8; s++) for (const [lx, lz] of legs) k.beam([lx, 0.7 + s * 5, lz], [lx, 0.7 + (s + 1) * 5, lz], 0.13, T(s % 2 ? 0xff4f2e : 0xf5f5f5), { outline: 0.03 });
    for (let l = 0; l < 16; l++) for (let f = 0; f < 3; f++) {
      const a = legs[f], b = legs[(f + 1) % 3], y0 = 0.7 + l * 2.5, y1 = y0 + 2.5;
      if (l % 2) k.beam([a[0], y0, a[1]], [b[0], y1, b[1]], 0.05, T(STEEL), { outline: 0 });
      else k.beam([b[0], y0, b[1]], [a[0], y1, a[1]], 0.05, T(STEEL), { outline: 0 });
      if (l % 2 === 0) k.beam([a[0], y0, a[1]], [b[0], y0, b[1]], 0.06, T(STEEL), { outline: 0 });
    }
    for (const y of [20.7, 32.7]) {
      k.add(new THREE.CylinderGeometry(2.3, 2.3, 0.2, 3), T(DARK), MX, y, MZ, { ry: 0.3, outline: 0.04 });
      k.blinker(MX + 2.0, y + 0.45, MZ, 0xff2a4a, 0.3);
    }
    k.cyl(0.08, 0.12, 2.6, 5, T(LIGHT), MX, H, MZ, { outline: 0.02 });
    k.blinker(MX, H + 2.9, MZ, 0xff2a4a, 0.45);
    for (const [h, ry, r] of [[17, 0.5, 1.6], [25, 2.6, 1.9], [28.5, 4.4, 1.4]]) {
      k.at(MX, MZ, ry);
      k.add(dishGeo(r), D(0xf5f5f5), 0, h, 1.2, { outline: 0.04 });
      k.beam([0, h, 0.4], [0, h, 1.4], 0.08, T(DARK));
      k.beam([0, h, 1.4], [0, h, 1.2 + r * 1.2], 0.04, T(DARK), { outline: 0 });
      k.at();
    }
    for (let i = 0; i < 3; i++) { k.at(MX, MZ, (i * Math.PI * 2) / 3 + 1.2); k.box(0.55, 2.8, 0.2, T(LIGHT), 0, 35.6, 1.15, { outline: 0.03 }); k.at(); }
    // the spinning dish on the top platform
    const pv = new THREE.Group();
    const dm = new THREE.Mesh(dishGeo(1.5), D(0xf5f5f5));
    dm.position.set(0, 1.0, 1.6); dm.rotation.x = -0.4; dm.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.6), T(DARK)); arm.position.set(0, 1.0, 0.8);
    pv.add(dm, arm);
    pv.userData.spin = true;
    k.dyn(pv, MX, 32.8, MZ);
    // guy wires to three anchors
    for (let i = 0; i < 3; i++) {
      const a = 0.5 + (i * Math.PI * 2) / 3;
      const ax = MX + Math.cos(a) * 17, az = MZ + Math.sin(a) * 17;
      k.box(1.8, 1, 1.8, T(CONC), ax, 0, az, { outline: 0.04 });
      k.box(1.0, 0.3, 1.0, T(c), ax, 1, az, { outline: 0.02 });
      for (const h of [14, 27, 39.5]) k.beam([ax, 1.1, az], [MX + Math.cos(a) * 0.9, h, MZ + Math.sin(a) * 0.9], 0.045, T(0x2a2540), { outline: 0, seg: 3 });
    }
    k.column(1.6, H, MX, MZ);
    // equipment shed
    k.box(8, 3.4, 5.5, T(0xe8e4f0), SX, 0, SZ, { outline: 0.1 });
    k.box(8.5, 0.35, 6, T(c), SX, 3.4, SZ, { outline: 0.04 });
    k.box(0.2, 2.4, 1.4, T(0x2a2540), SX - 4.02, F, SZ + 0.8, { outline: 0.02 });
    for (let i = 0; i < 3; i++) k.box(0.08, 0.18, 0.18, G([0x7dff3a, 0x7dff3a, 0xff2a4a][i]), SX - 4.06, 1.8 + i * 0.3, SZ - 0.6, { outline: 0 });
    for (const dx of [-2, 1.2]) {
      k.box(1.6, 1.3, 0.9, T(LIGHT), SX + dx, F, SZ + 3.2, { outline: 0.04 });
      k.add(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12).rotateX(Math.PI / 2), T(DARK), SX + dx, F + 0.65, SZ + 3.66, { outline: 0 });
    }
    for (let i = 0; i < 3; i++) k.box(1.2, 1.6, 0.9, T(0x3a3f50), SX + 4.6, F, SZ - 1.8 + i * 1.3, { outline: 0.03 });
    k.solid(4, 1.9, 2.75, SX, SZ);
  } else {
    const wr = k.wr;
    // the mast buckled at the base and came down in two folded lengths
    k.box(3.6, 0.7, 3.6, T(CONC), MX, 0, MZ, { outline: 0.05 });
    k.box(5, 0.06, 5, T(CHAR), MX, 0.7, MZ, { outline: 0 });
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3 + 0.3; k.beam([MX + Math.cos(a) * 0.95, 0.7, MZ + Math.sin(a) * 0.95], [MX + Math.cos(a) * 1.3 + (wr() - 0.5), 2.5 + wr() * 3, MZ + Math.sin(a) * 1.3 + (wr() - 0.5)], 0.13, T(i % 2 ? 0xff4f2e : 0xf5f5f5), { outline: 0.03 }); }
    const lying = (a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, px = -uz * 0.8, pz = ux * 0.8;
      const legs = [[px, F + 0.2], [-px, F + 0.2], [0, F + 1.4]].map(([o, y]) => [o, y]);
      for (let s = 0; s < Math.floor(L / 5); s++) for (const [o, y] of legs) {
        const t0 = s * 5, t1 = Math.min(L, t0 + 5);
        const oz = o === 0 ? 0 : (o === px ? pz : -pz);
        k.beam([a[0] + ux * t0 + o, y, a[1] + uz * t0 + oz], [a[0] + ux * t1 + o, y, a[1] + uz * t1 + oz], 0.13, T(s % 2 ? 0xff4f2e : 0xf5f5f5), { outline: 0.03 });
      }
      for (let t = 0; t < L - 1; t += 2.5) k.beam([a[0] + ux * t + px, F + 0.2, a[1] + uz * t + pz], [a[0] + ux * (t + 2.5), F + 1.4, a[1] + uz * (t + 2.5)], 0.05, T(STEEL), { outline: 0 });
    };
    lying([MX + 1, MZ - 2], [5, -20]);
    lying([5.5, -19], [17, -12]);
    k.add(dishGeo(1.9), D(0xb8b4c8), -8, F + 0.6, -14, { rx: -1.3, ry: 0.7, outline: 0.04 });
    k.add(dishGeo(1.5), D(0xb8b4c8), 9, F + 0.5, -16, { rx: 1.2, ry: 2.1, outline: 0.04 });
    for (let i = 0; i < 3; i++) {
      const a = 0.5 + (i * Math.PI * 2) / 3, ax = MX + Math.cos(a) * 17, az = MZ + Math.sin(a) * 17;
      k.box(1.8, 1, 1.8, T(CONC), ax, 0, az, { outline: 0.04 });
      k.beam([ax, 1.1, az], [ax - Math.cos(a) * 3, F, az - Math.sin(a) * 3 + 0.5], 0.045, T(0x2a2540), { outline: 0, seg: 3 });
    }
    scatterDebris(k, MX, MZ, 4, 4, 8, wr);
    // the shed burnt out
    k.box(8.6, 0.06, 6, T(CHAR), SX, F, SZ, { outline: 0 });
    for (let x = -3.5; x <= 3.5; x += 1.75) for (const s of [-1, 1]) k.box(1.7, 0.4 + wr() * 1.8, 0.3, T(wr() < 0.5 ? 0x8a8698 : 0x4a4652), SX + x, 0, SZ + s * 2.6, { outline: 0.04 });
    for (const s of [-1, 1]) k.box(0.3, 0.4 + wr() * 1.5, 5, T(0x4a4652), SX + s * 3.85, 0, SZ, { outline: 0.04 });
    k.box(8, 0.3, 5, T(c), SX + 0.5, 0.9, SZ + 0.4, { rx: 0.18, rz: -0.22, outline: 0.05 });
    k.box(1.6, 1.3, 0.9, T(LIGHT), SX - 2, F, SZ + 3.6, { rz: 1.4, outline: 0.04 });
    scatterDebris(k, SX, SZ, 3.5, 2.5, 8, wr);
  }
  k.hit(1.8, 20.6, 1.8, MX, MZ);
  k.hit(4, 1.9, 2.75, SX, SZ);
  k.smoke = new THREE.Vector3(MX, 2, MZ);
  k.drop = new THREE.Vector3(-4, F, 10);
  // transponder rack by the shed door: the raid spot
  k.box(0.8, 2.2, 1.2, T(DARK), SX - 4.6, F, SZ + 2.8, { outline: 0.05 });
  for (let i = 0; i < 4; i++) k.box(0.05, 0.1, 0.9, G(i % 2 ? 0x2ee6ff : 0x7dff3a), SX - 5.02, F + 0.5 + i * 0.4, SZ + 2.8, { outline: 0 });
  k.box(0.84, 0.2, 1.24, T(c), SX - 4.6, F + 2.2, SZ + 2.8, { outline: 0 });
  k.cyl(0.03, 0.03, 1.6, 4, T(LIGHT), SX - 4.6, F + 2.4, SZ + 3.2, { outline: 0 });
  k.ball(0.1, G(0xff2a4a), SX - 4.6, F + 4.05, SZ + 3.2, { outline: 0 });
  k.raidAt(SX - 6.6, SZ + 1.2, 0x2ee6ff);
  // cable tray from the shed to the mast
  const t0 = [SX - 4.2, SZ - 1.5], t1 = [MX + 1.4, MZ + 1.6];
  k.strip(t0, t1, 0.7, 0.15, T(STEEL), 1.3);
  for (const cc of [[0.2, 0xff9f1c], [0, 0x2ec4ff], [-0.2, 0x111111]]) k.strip([t0[0], t0[1] + cc[0]], [t1[0], t1[1] + cc[0]], 0.12, 0.1, T(cc[1]), 1.45, { outline: 0 });
  for (let i = 0; i <= 4; i++) { const t = i / 4; k.cyl(0.06, 0.06, 1.3, 4, T(DARK), t0[0] + (t1[0] - t0[0]) * t, 0, t0[1] + (t1[1] - t0[1]) * t, { outline: 0 }); }
  // the big ground dish
  k.at(-13, 10, 2.4);
  k.cyl(0.6, 0.9, 2.4, 8, T(LIGHT), 0, 0, 0, { outline: 0.05 });
  k.box(1.4, 0.8, 1.0, T(DARK), 0, 2.2, 0, { outline: 0.03 });
  k.add(dishGeo(3.2), D(0xf5f5f5), 0, 3.2, -0.4, { rx: -0.8, outline: 0.05 });
  k.beam([0, 3.2, 0.3], [0, 5.2, 2.2], 0.06, T(DARK), { outline: 0 });
  k.column(1.2, 3, 0, 0);
  k.at();
  // name board, flags, perimeter, lights
  k.sign('RELAY MAST', 0, 21.6, { w: 9 });
  k.flag(-5.8, 21.4, 9); k.flag(5.8, 21.4, 9);
  k.perimeter(23.4, 0.32, 0.32);
  k.lamp(17, -6, 7); k.lamp(-17, -10, 7);
}

// =====================================================================================
// Trading kiosk: a little market plaza round a planter, the kiosk with its striped awning and lit
// billboard, three stalls, crates of goods, benches, a parked hover-cart and strings of lights.
// =====================================================================================
function kiosk(k) {
  const c = k.c, rr = k.rr;
  k.apron(26, 0xb0a290, 0x7a6c5c);
  k.ring(9, 0.5, T(0x8a7c6c), 0, F, 0);
  k.ring(18, 0.5, T(0x8a7c6c), 0, F, 0);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.box(0.5, 0.04, 8.4, T(0x9a8c7c), Math.sin(a) * 13.5, F - 0.02, Math.cos(a) * 13.5, { ry: a, outline: 0 }); }
  // planter in the middle
  k.cyl(2.4, 2.6, 0.8, 16, T(0xd8c8b0), 0, F, 0, { outline: 0.05 });
  k.cyl(2.2, 2.2, 0.05, 16, T(0x4a3a2a), 0, F + 0.8, 0, { outline: 0 });
  for (let i = 0; i < 6; i++) { const a = i * 1.05; k.add(new THREE.ConeGeometry(0.45, 1.4 + (i % 3) * 0.5, 5), T(i % 2 ? 0xb36bff : 0x2ec4ff), Math.sin(a) * 1.3, F + 1.5, Math.cos(a) * 1.3, { outline: 0.03 }); }
  k.column(2.6, 1.1, 0, 0);
  if (!k.wreck) {
    // the kiosk
    k.at(0, -13, 0);
    k.box(9.2, 0.5, 5.2, T(c), 0, 0, 0, { outline: 0.04 });
    k.box(9, 3.6, 5, T(CREAM), 0, 0, 0, { outline: 0.1 });
    k.box(6.4, 1.5, 0.1, G(0xffe6a8), 0, 1.4, 2.52, { outline: 0 });
    k.box(7.2, 0.15, 1.0, T(WOOD), 0, 1.25, 2.9, { outline: 0.03 });
    k.box(9.8, 0.4, 5.8, T(c), 0, 3.6, 0, { outline: 0.05 });
    for (let i = 0; i < 6; i++) k.box(1.6, 0.08, 2.6, T(i % 2 ? 0xffffff : c), -4 + i * 1.6, 3.3, 3.6, { rx: 0.32, outline: 0.02 });
    for (let i = 0; i < 6; i++) k.add(i % 2 ? new THREE.BoxGeometry(0.4, 0.4, 0.4) : new THREE.SphereGeometry(0.22, 6, 4), T([0xff4f2e, YEL, 0x7dff3a, 0xff7ad9, 0x2ec4ff, 0xff9f1c][i]), -2.6 + i * 1.05, 1.55, 2.9, { outline: 0.02 });
    for (const s of [-1, 1]) {
      crate(k, s * 6.1, F, 0.4, 1.2, 0x9a6a3a, 0.2 * s);
      crate(k, s * 6.1, F + 1.2, 0.4, 1.0, s < 0 ? 0x2b59c3 : 0xd9482b, -0.3 * s);
      crate(k, s * 6.4, F, -1.2, 1.1, 0x9a6a3a, 0.5);
    }
    // billboard
    for (const s of [-1, 1]) k.box(0.4, 12.6, 0.4, T(DARK), s * 4.5, 0, -3.75, { outline: 0.04 });
    k.box(12.6, 5.6, 0.36, T(c), 0, 7.2, -3.25, { outline: 0.08 });
    k.text('TRADING KIOSK', 0, 10, -3.25, 0, 11.6, { fg: '#ffd23f', bg: '#241a3a', off: 0.21 });
    for (const x of [-4, 0, 4]) { k.beam([x, 12.6, -3.2], [x, 13.2, -2.0], 0.05, T(DARK)); k.box(0.7, 0.2, 0.3, G(0xfff3b0), x, 12.95, -1.9, { outline: 0 }); }
    k.solid(4.6, 1.9, 2.6, 0, 0);
    k.at();
    // stalls facing the centre
    const awn = [c, 0xff2e88, 0x2ec4ff];
    [[-15, -1], [15, -1], [-11, 14]].forEach(([x, z], i) => {
      k.at(x, z, Math.atan2(-x, -z));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, 2.7, 0.14, T(WOOD), sx * 1.7, F, sz * 1.1, { outline: 0.02 });
      k.box(3.4, 0.9, 1.6, T(WOOD), 0, F, 0.2, { outline: 0.04 });
      k.box(3.42, 0.45, 0.05, T(awn[i]), 0, F + 0.4, 1.03, { outline: 0 });
      k.add(new THREE.ConeGeometry(2.7, 1.1, 4).rotateY(Math.PI / 4).scale(1, 1, 0.72), T(awn[i]), 0, F + 3.25, 0, { outline: 0.05 });
      for (let j = 0; j < 7; j++) k.add(j % 3 ? new THREE.SphereGeometry(0.18 + k.mr() * 0.12, 6, 4) : new THREE.BoxGeometry(0.4, 0.3, 0.4), T([0xff4f2e, YEL, 0x7dff3a, 0xff7ad9, 0xff9f1c, 0x2ec4ff][Math.floor(k.mr() * 6)]), -1.3 + j * 0.43, F + 1.1, 0.2 + (k.mr() - 0.5) * 0.8, { outline: 0.02 });
      crate(k, 2.4, F, -0.4, 1.0, 0x9a6a3a, 0.3);
      k.solid(1.8, 0.7, 1.2, 0, 0.1);
      k.at();
    });
  } else {
    const wr = k.wr;
    // the kiosk gutted, its billboard face-down behind it
    k.at(0, -13, 0);
    k.box(10, 0.06, 6, T(CHAR), 0, F, 0, { outline: 0 });
    for (let x = -4; x <= 4; x += 2) for (const s of [-1, 1]) k.box(2, 0.4 + wr() * 2, 0.3, T(wr() < 0.5 ? 0x8a8070 : 0x4a4448), x, 0, s * 2.4, { outline: 0.04 });
    for (const s of [-1, 1]) k.box(0.3, 0.5 + wr() * 1.6, 4.6, T(0x4a4448), s * 4.4, 0, 0, { outline: 0.04 });
    k.box(9.4, 0.35, 5.4, T(c), 0.3, 1.2, 0.2, { rx: 0.2, rz: 0.15, outline: 0.05 });
    for (let i = 0; i < 6; i++) k.box(1.6, 0.08, 2.6, T(i % 2 ? 0xd8d4e8 : c), -5 + wr() * 10, F + 0.05, 3.5 + wr() * 2.5, { ry: wr() * 3, outline: 0.02 });
    for (const s of [-1, 1]) k.box(0.4, 1.5 + wr() * 2, 0.4, T(DARK), s * 4.5, 0, -3.75, { rz: (wr() - 0.5) * 0.4, outline: 0.04 });
    k.box(12.6, 0.36, 5.6, T(c), 0, F + 0.5, -7.6, { rx: 0.12, rz: 0.05, outline: 0.06 });
    for (const s of [-1, 1]) { crate(k, s * 6.1, F, 0.4, 1.2, 0x4a3a2a, 0.5 * s); crate(k, s * 6.8, F, -1.6, 1.0, 0x3a2a22, 0.9); }
    scatterDebris(k, 0, 0, 4.5, 3, 12, wr);
    k.at();
    // the stalls knocked flat
    const awnW = [c, 0xff2e88, 0x2ec4ff];
    [[-15, -1], [15, -1], [-11, 14]].forEach(([x, z], i) => {
      k.at(x, z, Math.atan2(-x, -z));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, 0.4 + wr() * 1.2, 0.14, T(0x4a3a2a), sx * 1.7, F, sz * 1.1, { outline: 0.02 });
      k.box(3.4, 0.9, 1.6, T(0x5a3a22), 0.3, F + 0.45, 0.6, { rx: 1.3, outline: 0.04 });
      k.add(new THREE.ConeGeometry(2.7, 1.1, 4).rotateY(Math.PI / 4).scale(1, 1, 0.72), T(awnW[i]), -0.8, F + 0.9, -1.2, { rz: 0.9 + wr() * 0.4, outline: 0.05 });
      for (let j = 0; j < 6; j++) k.add(new THREE.SphereGeometry(0.2, 6, 4), T([0xff4f2e, YEL, 0x7dff3a, 0xff7ad9][j % 4]), (wr() - 0.5) * 5, F + 0.2, 1 + wr() * 2.5, { outline: 0.02 });
      crate(k, 2.4, F, -0.4, 1.0, 0x4a3a2a, 0.9);
      k.at();
    });
  }
  k.hit(4.6, 2.0, 2.6, 0, -13);
  for (const [x, z] of [[-15, -1], [15, -1], [-11, 14]]) { k.at(x, z, Math.atan2(-x, -z)); k.hit(1.8, 1.5, 1.2, 0, 0); k.at(); }
  k.smoke = new THREE.Vector3(0, 1.5, -13);
  k.drop = new THREE.Vector3(-9, F, 5);
  // a stack of mystery crates at the counter: the raid spot
  for (const [x, y, z, s, ry] of [[4.4, 0, -9.0, 1.1, 0.2], [5.7, 0, -9.2, 1.0, -0.3], [5.0, 1.05, -9.1, 0.9, 0.5]]) {
    crate(k, x, F + y, z, s, 0x7b2ff7, ry);
    k.text('?', x + Math.sin(ry) * (s / 2 + 0.01), F + y + s * 0.5, z + Math.cos(ry) * (s / 2 + 0.01), ry, s * 0.62, { fg: '#ff2e88', bg: '#2a1240', back: false, off: 0.02 });
  }
  k.raidAt(0, -7.8, 0xff2e88);
  // hover-cart
  k.at(13, 12, 2.4);
  k.box(2.4, 0.9, 4.4, T(YEL), 0, 0.75, 0, { outline: 0.06 });
  k.box(2.42, 0.22, 4.42, T(c), 0, 1.2, 0, { outline: 0 });
  k.box(2.2, 0.6, 1.2, T(YEL), 0, 1.0, 2.4, { rx: 0.5, outline: 0.04 });
  k.box(1.4, 0.8, 0.9, T(DARK), 0, 1.65, 0.7, { outline: 0.03 });
  k.box(1.7, 0.7, 0.08, GLASS(0x9be7ff, 0.5), 0, 1.75, 1.45, { rx: -0.4, outline: 0.02 });
  crate(k, -0.4, 1.65, -1.2, 0.9, 0x9a6a3a, 0.2);
  crate(k, 0.5, 1.65, -1.4, 0.8, 0x2b59c3, -0.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl(0.45, 0.5, 0.25, 10, T(DARK), sx * 0.95, 0.5, sz * 1.6, { outline: 0.02 });
    k.cyl(0.4, 0.4, 0.05, 10, G(0x2ee6ff), sx * 0.95, 0.45, sz * 1.6, { outline: 0 });
  }
  k.solid(1.3, 0.9, 2.5, 0, 0, 0, 0.3);
  k.at();
  // benches round the planter
  for (const a of [0.8, 2.35, 3.95, 5.5]) {
    k.at(Math.sin(a) * 6.5, Math.cos(a) * 6.5, a + Math.PI);
    k.box(2.6, 0.12, 0.6, T(WOOD), 0, F + 0.45, 0, { outline: 0.03 });
    k.box(2.6, 0.55, 0.1, T(WOOD), 0, F + 0.65, -0.32, { rx: -0.12, outline: 0.03 });
    for (const s of [-1, 1]) k.box(0.12, 0.45, 0.5, T(DARK), s * 1.1, F, 0, { outline: 0 });
    k.at();
  }
  // strings of lights
  const poles = [];
  for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + Math.PI / 6; poles.push([Math.sin(a) * 19.5, Math.cos(a) * 19.5]); }
  for (const [x, z] of poles) { k.cyl(0.1, 0.13, 5.4, 6, T(DARK), x, 0, z, { outline: 0.03 }); k.ball(0.25, G(0xfff3b0), x, 5.5, z, { outline: 0 }); }
  const pts = poles.concat([poles[0]]).map(([x, z]) => [x, 5.2, z]);
  lightString(k, pts.slice(0, 3), [0xff2e88, YEL, 0x2ee6ff, 0x7dff3a]);
  lightString(k, pts.slice(3), [0xff2e88, YEL, 0x2ee6ff, 0x7dff3a]);
  k.flag(-4.2, 23.5, 9); k.flag(4.2, 23.5, 9);
  k.lamp(-6, 23.5, 6); k.lamp(6, 23.5, 6);
}

// =====================================================================================
// Scrap shack: welded huts patched from whatever was lying around, a scrap press, a derrick
// crane with a hook, heaps of parts, a burning barrel and strings of pirate lights.
// =====================================================================================
function shack(k) {
  const c = k.c, rr = k.rr;
  k.apron(25, 0x6e6058, 0x4a3a32);
  for (let i = 0; i < 6; i++) { const a = rr() * 6.3, r = 5 + rr() * 15; k.cyl(0.8 + rr() * 1.4, 0.8 + rr() * 1.4, 0.04, 12, T(0x584a48), Math.sin(a) * r, F - 0.02, Math.cos(a) * r, { outline: 0 }); }
  const patchCols = [0x8a8698, 0x5a6a5a, 0xa05a2a, 0x6b5a4a, 0x4a5a7a];
  if (!k.wreck) {
    // hut A with the name board
    k.at(-9, -9, 0.2);
    k.box(9, 3.8, 7, T(RUST), 0, 0, 0, { outline: 0.1 });
    for (let i = 0; i < 6; i++) k.box(1 + k.mr() * 2, 0.8 + k.mr() * 1.4, 0.08, T(patchCols[i % 5]), -3.3 + k.mr() * 6.6, 0.5 + k.mr() * 2, 3.53, { rz: (k.mr() - 0.5) * 0.3, outline: 0.02 });
    for (let i = 0; i < 4; i++) k.box(0.08, 0.8 + k.mr() * 1.4, 1 + k.mr() * 2, T(patchCols[(i + 2) % 5]), 4.53, 0.5 + k.mr() * 2, -2.5 + k.mr() * 5, { rx: (k.mr() - 0.5) * 0.3, outline: 0.02 });
    k.box(9.8, 0.25, 7.8, T(0x8a7a6a), 0, 3.85, 0, { rx: 0.1, outline: 0.05 });
    for (let i = 0; i < 9; i++) k.box(0.14, 0.12, 7.8, T(0x6a5a4a), -4.4 + i * 1.1, 4.02, 0, { rx: 0.1, outline: 0 });
    k.cyl(0.3, 0.3, 2.6, 8, T(DARK), 3, 3.8, -2, { outline: 0.03 });
    k.box(0.9, 0.12, 0.9, T(DARK), 3, 6.5, -2, { outline: 0.02 });
    k.box(1.4, 2.4, 0.15, T(0x3a2a22), -1.6, F - 0.1, 3.55, { outline: 0.03 });
    k.box(1.8, 1.0, 0.1, G(0xffa040), 2, 1.5, 3.55, { outline: 0 });
    for (let i = 0; i < 4; i++) k.box(0.07, 1.0, 0.07, T(DARK), 1.3 + i * 0.47, 1.5, 3.62, { outline: 0 });
    k.text('SCRAP SHACK', 0.2, 3.05, 3.55, 0, 5.2, { fg: '#ffb347', bg: '#3a2418', rz: -0.04, back: false });
    k.box(0.5, 0.2, 0.3, G(0xff7a1a), -1.6, 2.7, 3.7, { outline: 0 });
    k.solid(4.5, 1.9, 3.5, 0, 0);
    k.at();
  } else {
    const wr = k.wr;
    // hut A collapsed in on itself
    k.at(-9, -9, 0.2);
    k.box(9.6, 0.06, 7.6, T(CHAR), 0, F, 0, { outline: 0 });
    for (let x = -3.5; x <= 3.5; x += 1.75) for (const s of [-1, 1]) k.box(1.7, 0.4 + wr() * 2.2, 0.25, T(wr() < 0.5 ? RUST : 0x3a2e2a), x, 0, s * 3.4, { rz: (wr() - 0.5) * 0.2, outline: 0.04 });
    for (const s of [-1, 1]) k.box(0.25, 0.5 + wr() * 1.8, 6.6, T(0x3a2e2a), s * 4.4, 0, 0, { outline: 0.04 });
    k.box(9.8, 0.25, 7.8, T(0x5a4e44), 0.4, 1.4, 0.3, { rx: 0.28, rz: -0.12, outline: 0.05 });
    k.beam([3, F, -2], [5.5, 0.8, 1.2], 0.3, T(DARK), { outline: 0.03 });
    for (let i = 0; i < 6; i++) k.box(1 + wr() * 2, 0.08, 0.8 + wr() * 1.4, T(patchCols[i % 5]), (wr() - 0.5) * 12, F + 0.05, (wr() - 0.5) * 10, { ry: wr() * 3, outline: 0.02 });
    scatterDebris(k, 0, 0, 4, 3, 14, wr);
    k.at();
  }
  k.at(-9, -9, 0.2);
  k.hit(4.5, 1.9, 3.5, 0, 0);
  k.smoke = k.P(0, 1.5, 0);
  k.at();
  k.drop = new THREE.Vector3(-1, F, 3);
  // hut B: two storeys, a ladder and a tarp
  k.at(9, -12, -0.35);
  k.box(6, 3.4, 5, T(0x5a5f6e), 0, 0, 0, { outline: 0.1 });
  k.box(4, 2.4, 3.6, T(0x8a4a2a), -0.6, 3.4, -0.3, { outline: 0.08 });
  k.box(4.6, 0.2, 4.2, T(0x7a6a5a), -0.6, 5.8, -0.3, { rz: -0.12, outline: 0.04 });
  k.box(6.4, 0.2, 5.4, T(0x7a6a5a), 0, 3.4, 0, { outline: 0.04 });
  k.box(1.2, 0.8, 0.1, G(0x7dff6a), -0.6, 4.5, 1.52, { outline: 0 });
  k.box(1.2, 2.2, 0.12, T(0x2a2422), 1.6, F - 0.1, 2.55, { outline: 0.02 });
  for (const s of [-0.35, 0.35]) k.beam([3.1, 0, 1 + s], [3.1, 5.4, 0.6 + s], 0.05, T(DARK), { outline: 0.02 });
  for (let y = 0.6; y < 5.2; y += 0.6) k.beam([3.1, y, 0.65 + 0.4 * (1 - y / 5.4)], [3.1, y, 1.35 + 0.4 * (1 - y / 5.4)], 0.035, T(DARK), { outline: 0 });
  k.box(3.6, 0.06, 2.4, T(c), -1, 2.8, 3.6, { rx: 0.25, outline: 0.03 });
  for (const s of [-1, 1]) k.cyl(0.06, 0.06, 2.4, 4, T(DARK), -1 + s * 1.6, 0, 4.7, { outline: 0 });
  k.solid(3, 2.9, 2.5, 0, 0);
  k.at();
  // a container turned into a hut
  k.at(15, 5, 1.3);
  container(k, 0, 0, 0, 0x2b59c3, Math.PI / 2);
  for (let i = 0; i < 4; i++) k.box(0.8 + rr(), 0.6 + rr(), 0.06, T(0x8a4a2a), -2 + rr() * 4, 0.4 + rr() * 1.5, 1.27, { outline: 0 });
  k.box(1.4, 0.8, 0.08, G(0xffa040), 1.2, 1.2, 1.28, { outline: 0 });
  k.solid(3.1, 1.3, 1.3, 0, 0);
  k.at();
  // scrap press with crushed cubes
  k.at(-13, 8, 0.6);
  k.box(4.4, 1, 3.2, T(DARK), 0, 0, 0, { outline: 0.05 });
  for (const s of [-1, 1]) k.box(0.6, 6, 0.6, T(STEEL), s * 1.9, 1, 0, { outline: 0.04 });
  k.box(4.6, 0.8, 1.0, T(0xe0a020), 0, 7, 0, { outline: 0.05 });
  for (let i = 0; i < 5; i++) k.box(0.45, 0.82, 1.02, T(0x221d33), -1.8 + i * 0.9, 7, 0, { rz: 0.5, outline: 0 });
  k.cyl(0.35, 0.35, 3.2, 8, T(LIGHT), 0, 3.8, 0, { outline: 0.03 });
  k.box(3.2, 0.5, 2.4, T(STEEL), 0, 3.3, 0, { outline: 0.04 });
  k.box(2.4, 1.2, 1.8, T(0x7a3a2a), 0, 1, 0, { ry: 0.1, outline: 0.04 });
  k.cyl(0.6, 0.6, 2, 10, T(0xc9a227), 3, 0, 0.6, { outline: 0.04 });
  k.beam([3, 1.6, 0.6], [1.9, 6.6, 0.3], 0.08, T(DARK));
  const cubeCols = [0x7a3a2a, 0x5a5f6e, 0xa05a2a, 0x4a6a5a, 0x8a8698];
  for (let i = 0; i < 6; i++) k.box(1.2, 1.2, 1.2, T(cubeCols[i % 5]), -1.6 + (i % 3) * 1.3, F + Math.floor(i / 3) * 1.2, 3.2 + (rr() - 0.5) * 0.3, { ry: (rr() - 0.5) * 0.4, outline: 0.04 });
  k.solid(2.3, 3.9, 1.7, 0, 0);
  // a pile of pressed scrap plates beside it: the raid spot
  for (let i = 0; i < 7; i++) k.box(1.7, 0.1, 1.15, T(i % 2 ? STEEL : 0x8a8698), -3.4 + (rr() - 0.5) * 0.2, F + 0.05 + i * 0.11, -1.4 + (rr() - 0.5) * 0.2, { ry: (rr() - 0.5) * 0.5, outline: 0.02 });
  for (const s of [-1, 1]) k.box(1.6, 0.1, 1.1, T(0x6a6e80), -3.4 + s * 1.1, F + 0.55, -1.4, { rz: s * 1.1, outline: 0.02 });
  k.raidAt(-0.5, -3.6, 0xff9f1c);
  k.at();
  // parts heaps
  for (const [x, z] of [[3, 16], [-2, -19], [19, -6]]) junkHeap(k, x, z, 3, 1.1, 9, rr);
  // derrick crane with a hook over the heap
  k.cyl(0.35, 0.45, 12, 8, T(0x8a6a3a), 6, 0, 9, { outline: 0.05 });
  k.box(1.6, 0.8, 1.6, T(DARK), 6, 0, 9, { outline: 0.04 });
  k.beam([6, 9.5, 9], [2.5, 12.5, 14.5], 0.18, T(0xe0a020), { outline: 0.04 });
  k.beam([6, 12, 9], [2.5, 12.5, 14.5], 0.04, T(DARK), { outline: 0 });
  k.beam([6, 9.5, 9], [8.5, 9.6, 6.5], 0.16, T(0xe0a020), { outline: 0.04 });
  k.box(1.2, 1.2, 1.2, T(CONC), 8.5, 8.6, 6.5, { outline: 0.04 });
  k.beam([2.5, 12.5, 14.5], [2.5, 5.2, 14.5], 0.04, T(DARK), { outline: 0 });
  k.box(0.6, 0.6, 0.4, T(YEL), 2.5, 4.7, 14.5, { outline: 0.03 });
  k.add(new THREE.TorusGeometry(0.45, 0.12, 5, 10, Math.PI * 1.3), T(STEEL), 2.5, 4.1, 14.5, { rz: 2.2, outline: 0.03 });
  k.column(0.7, 12, 6, 9);
  // burning barrel, crates to sit on, a tyre stack
  k.cyl(0.5, 0.45, 1.1, 10, T(RUST), 2.5, F, -2, { outline: 0.04 });
  k.add(new THREE.ConeGeometry(0.35, 0.9, 6), G(YEL), 2.5, F + 1.5, -2, { outline: 0 });
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6), G(0xff7a1a));
  fire.userData.blink = true;
  k.dyn(fire, 2.5, F + 1.75, -2);
  crate(k, 4, F, -1, 0.7, 0x6b5a4a, 0.4); crate(k, 1, F, -3.4, 0.7, 0x5a5f6e, 0.9);
  for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(0.85, 0.36, 6, 12).rotateX(Math.PI / 2), T(TYRE), -17, F + 0.36 + i * 0.7, -2 + (rr() - 0.5) * 0.3, { outline: 0.03 });
  // corrugated fence along the back
  for (const [a0, a1] of [[1.7, 2.6], [3.7, 4.7]]) for (let a = a0; a < a1; a += 2.5 / 24) {
    k.box(2.5, 2 + rr() * 0.7, 0.12, T(patchCols[Math.floor(rr() * 5)]), Math.sin(a) * 24, 0, Math.cos(a) * 24, { ry: a, rz: (rr() - 0.5) * 0.12, outline: 0.03 });
  }
  // pirate lights
  const lp = [[-4, -3], [5, -5], [11, 2], [-6, 4]];
  for (const [x, z] of lp) k.beam([x, 0, z], [x + 0.2, 4.8, z - 0.1], 0.09, T(DARK), { outline: 0.03 });
  lightString(k, lp.concat([lp[0]]).map(([x, z]) => [x + 0.2, 4.7, z - 0.1]), [0xff2a4a, 0x7dff3a, YEL], 6, 0.8);
  k.flag(-3, 22, 9); k.flag(3, 22, 9, 0x141018);
  k.sign('SCRAP SHACK', 0, 22.6, { w: 8.4, rz: 0.05, fg: '#ffb347', bg: '#3a2418', y: 2.8 });
  k.lamp(-18, 10, 6, 0xff9f40); k.lamp(16, -14, 6, 0xff9f40);
}

// =====================================================================================
// Junk pile: a big heap of wrecked hulls, containers and tyres (you can climb it), a rocket nose
// sticking out, a half-buried rover, and a scavenger's tent with a campfire.
// =====================================================================================
function junk(k) {
  const c = k.c, rr = k.rr;
  k.apron(27, 0x8a8478, 0x5a5048);
  junkHeap(k, -17, 6, 6.5, 3, 18, rr);
  k.sphere(8.54, -17, -5.29, 6); // a cap matching the mound, so you can climb it
  if (!k.wreck) {
    // the big heap, a rocket nose sticking out of it, a flag on top
    junkHeap(k, -10, -9, 12, 6, 56, k.mr);
    k.sphere(15, -10, -8.75, -9);
    k.add(new THREE.ConeGeometry(2.2, 6.5, 12), T(LIGHT), -7, 6.4, -11.5, { rx: 0.9, rz: -0.5, outline: 0.08 });
    k.add(new THREE.TorusGeometry(2.0, 0.2, 4, 16).rotateX(Math.PI / 2), T(c), -7.9, 5.2, -13, { rx: 0.9, rz: -0.5, outline: 0 });
    k.box(0.2, 2.6, 2.2, T(0xff4f2e), -13, 5.6, -13, { rz: 0.4, ry: 0.6, outline: 0.04 });
    k.flag(-10, -9, 6, c, 6.1);
  } else {
    // blown flat: a scorched low mound with burnt wreckage flung about
    const wr = k.wr;
    k.add(new THREE.CylinderGeometry(4, 13, 2, 16, 1), T(0x3e3638), -10, F + 0.95, -9, { outline: 0.06 });
    k.sphere(43.25, -10, -40.99, -9);
    const burnt = [CHAR, 0x3a3540, 0x4a3f3a, 0x55505e, 0x5a3a2a];
    for (let i = 0; i < 40; i++) {
      const r = Math.sqrt(wr()) * 14, a = wr() * Math.PI * 2, x = -10 + Math.sin(a) * r, z = -9 + Math.cos(a) * r;
      if (Math.hypot(x, z) > 25) continue;
      const y = F + (r < 13 ? 2 * Math.min(1, (13 - r) / 9) : 0);
      const rot = { rx: (wr() - 0.5) * 1.2, ry: wr() * 6.3, rz: (wr() - 0.5) * 1.2, outline: 0.04 };
      if (i % 4 === 0) k.add(new THREE.TorusGeometry(0.85, 0.36, 6, 12), T(TYRE), x, y + 0.2, z, rot);
      else if (i % 4 === 1) k.add(new THREE.CylinderGeometry(0.12, 0.12, 2 + wr() * 3, 5), T(DARK), x, y + 0.4, z, rot);
      else k.add(new THREE.BoxGeometry(0.8 + wr() * 2, 0.3 + wr() * 0.8, 0.8 + wr() * 1.5), T(burnt[i % 5]), x, y + 0.2, z, rot);
    }
    k.add(new THREE.ConeGeometry(2.2, 6.5, 12), T(0x8a8698), -2, F + 1.6, -15, { rz: 1.45, ry: 0.4, outline: 0.08 });
    k.beam([-10, 2.2, -9], [-12, 5.2, -10.5], 0.1, T(DARK));
  }
  k.hit(8.5, 3, 8.5, -10, -9);
  k.smoke = new THREE.Vector3(-10, 3, -9);
  k.drop = new THREE.Vector3(6, F, 1);
  // half-buried rover
  k.cyl(2.8, 5, 1.0, 12, T(0x6b6672), 11, 0, -10, { outline: 0.04 });
  k.at(11, -10, 0.7, 0.6, 0.18, 0.38);
  k.box(4.8, 1.8, 2.8, T(0x5a7a9a), 0, -0.9, 0, { outline: 0.08 });
  k.box(2.2, 1.0, 2.4, T(0x5a7a9a), 0.6, 0.9, 0, { outline: 0.06 });
  k.box(0.1, 0.7, 2.0, T(0x2a2540), 1.72, 1.05, 0, { outline: 0 });
  k.box(4.82, 0.3, 2.82, T(0xff9f1c), 0, 0.2, 0, { outline: 0 });
  for (const sx of [-1, 1]) { k.add(new THREE.CylinderGeometry(1.0, 1.0, 0.7, 12).rotateX(Math.PI / 2), T(TYRE), sx * 1.6, -0.9, 1.6, { outline: 0.04 }); k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.74, 8).rotateX(Math.PI / 2), T(LIGHT), sx * 1.6, -0.9, 1.6, { outline: 0 }); }
  k.beam([-1.5, 0.9, -0.8], [-2.5, 3.2, -1.4], 0.05, T(DARK), { outline: 0 });
  k.beam([-2.5, 3.2, -1.4], [-3.4, 3.4, -0.6], 0.05, T(DARK), { outline: 0 });
  k.at();
  k.solid(2.8, 1.3, 2, 11, -10, 0.7);
  // tyre stack
  for (let i = 0; i < 5; i++) k.add(new THREE.TorusGeometry(0.85, 0.36, 6, 12).rotateX(Math.PI / 2), T(TYRE), 17, F + 0.36 + i * 0.7, 4, { outline: 0.03 });
  for (const a of [0.6, 2.2]) k.add(new THREE.TorusGeometry(0.85, 0.36, 6, 12), T(TYRE), 17 + Math.sin(a) * 1.7, F + 0.9, 4 + Math.cos(a) * 1.7, { ry: a, rx: 0.3, outline: 0.03 });
  k.column(1.2, 3.8, 17, 4);
  // the scavenger's tent and camp
  k.at(9, 11, Math.atan2(-11, 9));
  k.add(prism(4.5, 3.6, 2.6), T(c), 0, F, 0, { outline: 0.06 });
  k.add(prism(0.06, 2.2, 1.7), T(0x1a1428), -2.27, F, 0, { outline: 0 });
  for (let i = 0; i < 3; i++) k.box(0.9, 0.7, 0.05, T(patch(i)), -1 + i * 0.9, F + 0.9 + (i % 2) * 0.3, 0.98 - (i % 2) * 0.3, { rx: -0.62, outline: 0 });
  for (const s of [-1, 1]) k.beam([-2.25, F + 2.6, 0], [-3.4, F, s * 1.6], 0.025, T(0xd8c8b0), { outline: 0 });
  k.solid(2.3, 1.4, 1.9, 0, 0);
  // campfire
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.add(new THREE.DodecahedronGeometry(0.3, 0), T(0x7a7686), -4.8 + Math.cos(a) * 0.85, F + 0.15, 0.6 + Math.sin(a) * 0.85, { outline: 0.02 }); }
  for (const a of [0.4, 2.0]) k.add(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 5), T(0x5a3a22), -4.8, F + 0.2, 0.6, { rx: Math.PI / 2, ry: a, outline: 0.02 });
  k.add(new THREE.ConeGeometry(0.3, 0.7, 6), G(YEL), -4.8, F + 0.6, 0.6, { outline: 0 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 6), G(0xff7a1a));
  flame.userData.blink = true;
  k.dyn(flame, -4.8, F + 0.85, 0.6);
  for (const [x, z] of [[-4.2, 2.2], [-6.3, 0]]) k.cyl(0.32, 0.32, 0.5, 8, T(0x5a5f6e), x, F, z, { outline: 0.02 });
  // lantern pole and washing line
  k.beam([-2.6, 0, -2], [-2.6, 2.6, -2], 0.05, T(DARK), { outline: 0.02 });
  k.box(0.3, 0.4, 0.3, G(0xffd27a), -2.6, 2.2, -1.75, { outline: 0 });
  for (const x of [1, 4.5]) k.beam([x, 0, -2.6], [x, 2.2, -2.6], 0.05, T(DARK), { outline: 0.02 });
  k.beam([1, 2.1, -2.6], [4.5, 2.1, -2.6], 0.02, T(DARK), { outline: 0 });
  for (let i = 0; i < 3; i++) k.box(0.7, 0.9, 0.04, T(patch(i + 2)), 1.6 + i * 1.1, 1.6, -2.6, { outline: 0 });
  // the scavenger's junk-bot on its charging pad: the raid spot
  k.cyl(1.0, 1.1, 0.12, 16, T(DARK), 1.6, F, 3.4, { outline: 0.03 });
  k.ring(0.85, 0.06, G(0x2ee6ff), 1.6, F + 0.14, 3.4);
  k.box(0.75, 0.55, 0.55, T(0xc9a227), 1.6, F + 0.42, 3.4, { outline: 0.04 });
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8).rotateX(Math.PI / 2), T(TYRE), 1.6 + s * 0.3, F + 0.34, 3.4 + 0.3, { outline: 0.02 });
  k.add(new THREE.SphereGeometry(0.26, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), T(0x8a8698), 1.6, F + 0.97, 3.4, { outline: 0.03 });
  k.box(0.22, 0.08, 0.05, G(0x2ee6ff), 1.6, F + 1.05, 3.67, { outline: 0 });
  k.beam([1.75, F + 1.2, 3.35], [1.85, F + 1.75, 3.3], 0.02, T(DARK), { outline: 0 });
  k.ball(0.06, G(0xff2a4a), 1.85, F + 1.78, 3.3, { outline: 0 });
  k.beam([1.6, F + 0.1, 2.4], [0.2, F + 0.05, 1.1], 0.04, T(0x1a1428), { outline: 0, seg: 3 });
  k.raidAt(-1.4, 3.6, 0x2ee6ff);
  k.at();
  k.sign('JUNK PILE', 0, 24, { w: 8, rz: -0.06, fg: '#ffd23f', bg: '#4a3a2a', y: 2.8 });
  k.flag(5.5, 23, 8);
  k.lamp(-20, 12, 6, 0xffd27a); k.lamp(20, -12, 6, 0xffd27a);
}
const patch = (i) => [0xa05a2a, 0x4a6a5a, 0xc9a227, 0x2b59c3, 0xff7ad9][i % 5];

const BUILD = { tower, depot, farm, mast, kiosk, shack, junk };
const VARIANTS = 1; // prop scatter variants per look (each one is a separate bake)
const KIND_SEED = { tower: 11, depot: 23, farm: 37, mast: 41, kiosk: 53, shack: 67, junk: 79 };
const templates = new Map();

// A baked model for one look, in the outpost's local frame (y up, ground at y = 0, the yard centre
// at the origin kept clear). Clone root to place it. Fields:
//   root  - THREE.Group to clone
//   cols  - collider specs { type: 'box'|'sphere'|'cyl', ... } (box: x, y, z, hx, hy, hz, yaw)
//   hits  - boxes { x, y, z, hx, hy, hz, yaw } a blast must reach to damage the main building
//   raid  - Vector3 stand point for raiding (null on a wreck)
//   smoke - Vector3 where the wreck smoulders (the main building's centre)
//   drop  - Vector3 open apron spot 10-16 m from the main building where loot can land
// wreck = true gives the same compound with the main building reduced to rubble.
export function outpostTemplate(kind, color, variant = 0, wreck = false) {
  variant %= VARIANTS;
  const key = `${kind}|${color}|${variant}|${wreck ? 1 : 0}`;
  let t = templates.get(key);
  if (!t) {
    const k = new Kit(color, KIND_SEED[kind] * 977 + variant * 131, wreck);
    BUILD[kind](k, wreck);
    t = k.finish();
    templates.set(key, t);
  }
  return t;
}

// The kit and its shared props also build the bigger settlements (settlements.js).
export { Kit, T, G, D, GLASS, BEAM, prism, dishGeo, sandbags, crate, container, tank, junkHeap, lightString, scatterDebris };
export const PALETTE = { STEEL, DARK, LIGHT, CREAM, CONC, YEL, WOOD, RUST, TYRE, CHAR };
