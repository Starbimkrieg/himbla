import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { inkMat, vcMaterial, paintVertices, dropFloorFaces, shellBounds, toonBiasOf, inkLineGeo, inkLineMesh, HALO_SLOT, glowMark, gradientMap } from './toon.js';
import { STYLE, factionOf } from './outpostLooks.js';
import { slotOf, roleOf, animOf, SHAPES } from './staticContract.js';

// Static GLBs (outposts.glb): a Blender structure -> what the Kit (outpostModels.js) makes: { root, cols, hits, raid,
// smoke, drop } in the structure's frame. Artist contract: docs/outpost-glb.md; shared rules: staticContract.js.
//
// Two steps, so a structure used in several faction colours is parsed once:
//   parseStaticGlb(scene)         loaded glTF scene -> one neutral `asset` per root node
//   bakeStatic(asset, { color })  asset -> template for one faction colour
//
// As in models.js only geometry is read: positions, normals, index, the toon attribute (`_toon`: kit.py toon_attrs),
// material name, flat base colour (and alpha for a beam), double-sided flag, and the `ink` and `inkline`
// extras; the toon material shades. The result is vertex-coloured, so hundreds
// of Blender objects bake to a few meshes (lit, unlit, one outline hull, beams, a few per moving part), like Kit.finish.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _z = new THREE.Vector3(), _e = new THREE.Euler();
const ZAXIS = new THREE.Vector3(0, 0, 1), YAXIS = new THREE.Vector3(0, 1, 0);

const IDENTITY = new THREE.Matrix4(), XAXIS = new THREE.Vector3(1, 0, 0);

// a rotation's yaw about +y (where its +z points in the ground plane)
const yawOf = (q) => { _z.copy(ZAXIS).applyQuaternion(q); return Math.atan2(_z.x, _z.z); };

// GLTFLoader makes a multi-material mesh node a Group of one Mesh per material at the node's transform. That's a
// mesh (whatever its name), not a gameplay empty or moving part.
const isPrimitiveGroup = (o) => !o.isMesh && o.children.length > 0 && !('role' in o.userData) && !('anim' in o.userData) && o.children.every((c) => c.isMesh && c.matrix.equals(IDENTITY));

// is this matrix plain TRS? (not if a rotated node sits under a non-uniformly scaled parent)
function isPlainTRS(m) {
  m.decompose(_p, _q, _s);
  const r = new THREE.Matrix4().compose(_p, _q, _s);
  for (let i = 0; i < 16; i++) if (Math.abs(r.elements[i] - m.elements[i]) > 1e-4 * Math.max(1, Math.abs(m.elements[i]))) return false;
  return true;
}

// ---------------------------------------------------------------- parse
export function parseStaticGlb(scene, { warn = console.warn } = {}) {
  scene.updateMatrixWorld(true);
  const assets = new Map();
  for (const root of scene.children) {
    if (!root.name) continue;
    const asset = parseRoot(root, (m) => warn(`${root.name}: ${m}`));
    asset.empty = asset.groups.every((g) => !g.parts.length); // nothing to draw: the loader skips it
    assets.set(root.name, asset);
  }
  return assets;
}

function parseRoot(root, warn) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const asset = { name: root.name, groups: [], cols: [], hits: [], raid: null, smoke: null, drop: null, texts: [], tickers: [], stacks: [], walkers: null };
  // the walking NPCs' routes (root extra `walkers`: { kind, routes: [[[x, z], ...], ...] }, as JSON text or an object)
  if (root.userData.walkers) {
    try { asset.walkers = typeof root.userData.walkers === 'string' ? JSON.parse(root.userData.walkers) : root.userData.walkers; } catch { warn('walkers: not readable JSON, left out'); }
  }
  // groups[0]: static body (root frame). Each animated node adds a group in its own frame.
  const body = { anim: null, matrix: null, parts: [] };
  asset.groups.push(body);
  // `only`: the owners a node is drawn for (extra `only_faction`, comma separated: an emblem per faction), passed down to its meshes
  const walk = (o, group, groupInv, only = null) => {
    for (const c of o.children) {
      const own = c.userData.only_faction ? String(c.userData.only_faction).split(',').map((f) => f.trim()) : only;
      const meshNode = c.isMesh || isPrimitiveGroup(c);
      if (meshNode) {
        const stray = animOf(c.userData) || roleOf(c.name, c.userData);
        if (stray) warn(`mesh "${c.name}" is marked "${stray}": only empties can be gameplay nodes or moving parts, so it is drawn as ordinary geometry`);
      }
      const anim = meshNode ? null : animOf(c.userData);
      if (anim) {
        if (group !== body) { warn(`animated node "${c.name}" inside another animated node: treated as part of it`); walk(c, group, groupInv); continue; }
        const g = { anim, speed: Number(c.userData.speed) || 0, matrix: new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld), parts: [] }; // (speed: a spin's rate, rad/s)
        if (!isPlainTRS(g.matrix)) warn(`animated node "${c.name}" sits under a non-uniformly scaled parent and is turned: its meshes would land wrong (apply the scale in Blender)`);
        asset.groups.push(g);
        walk(c, g, new THREE.Matrix4().copy(c.matrixWorld).invert(), own);
        continue;
      }
      const role = meshNode ? null : roleOf(c.name, c.userData);
      if (role) { gameplay(asset, role, c, inv, warn); walk(c, group, groupInv, own); continue; } // its child meshes are ordinary geometry
      if (c.isMesh) addPart(group, c, groupInv, warn, own);
      walk(c, group, groupInv, own);
    }
  };
  walk(root, body, inv);
  if (!body.parts.length) warn('no meshes');
  return asset;
}

// a plain float copy of an attribute (a compressed file's are quantized: 16-bit positions, 8-bit normals, tools/optimize-glb.mjs)
function f32(a) {
  if (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute) return a.clone();
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
  return new THREE.BufferAttribute(out, a.itemSize);
}

function addPart(group, mesh, groupInv, warn, only = null) {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const src = mesh.geometry;
  if (mesh.userData.inkline > 0) { // designed ink lines (kit.py ink_lines): drawn by inkLineMat, not a part
    (group.lines || (group.lines = [])).push(inkLineGeo(src, new THREE.Matrix4().multiplyMatrices(groupInv, mesh.matrixWorld), mesh.userData.inkline));
    return;
  }
  if (!src.attributes.position || !src.attributes.normal) { warn(`mesh "${mesh.name}" has no normals: skipped`); return; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', f32(src.attributes.position));
  geo.setAttribute('normal', f32(src.attributes.normal));
  geo.setAttribute('toonBias', toonBiasOf(src)); // (the toon shade threshold: toon.js)
  if (src.index) geo.setIndex(src.index.clone());
  else {
    const n = src.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const rel = new THREE.Matrix4().multiplyMatrices(groupInv, mesh.matrixWorld);
  geo.applyMatrix4(rel);
  if (rel.determinant() < 0) { // mirrored node: baking it in flips the faces, so re-wind
    const ix = geo.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  const ink = Number(mesh.userData.ink ?? (mesh.parent && isPrimitiveGroup(mesh.parent) ? mesh.parent.userData.ink : undefined)) || 0;
  group.parts.push({
    geo,
    slot: slotOf(mat.name),
    halo: HALO_SLOT.test(String(mat.name).replace(/[._]\d+$/, '')), // (a light source: its glow gets a halo, toon.js)
    side: mat.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
    color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
    opacity: mat.transparent ? mat.opacity : 1, // used by `additive…` and `glass…` materials only
    ink: ink > 0 ? ink : 0,
    inkW: src.attributes._toon ? f32(src.attributes._toon) : null, // (.y: the line's weight per vertex, kit.py toon_attrs)
    only, // (drawn only for these owners, or null: everyone)
  });
}

// an empty with a role: collider, blast box, point or sign face (root frame)
function gameplay(asset, role, node, inv, warn) {
  const m = new THREE.Matrix4().multiplyMatrices(inv, node.matrixWorld);
  m.decompose(_p, _q, _s);
  const sx = Math.abs(_s.x), sy = Math.abs(_s.y), sz = Math.abs(_s.z);
  const u = node.userData;
  if (role === 'col' || role === 'hit') {
    const shape = role === 'hit' ? 'box' : (SHAPES.includes(u.shape) ? u.shape : 'box');
    if (u.shape !== undefined && role === 'col' && !SHAPES.includes(u.shape)) warn(`collider "${node.name}": unknown shape "${u.shape}", using box`);
    if (shape === 'box' && role === 'hit' && _z.copy(YAXIS).applyQuaternion(_q).y < 0.9998) warn(`hit "${node.name}" is tilted: only its turn about the vertical is used`);
    if (shape === 'cyl' && _z.copy(YAXIS).applyQuaternion(_q).y < 0.9998) warn(`cylinder "${node.name}" is tilted: a cylinder collider is always upright (use boxes for a lying one)`);
    if (shape === 'cyl' && Math.abs(sx - sz) > 0.01 * Math.max(sx, sz)) warn(`cylinder "${node.name}": scale x and z differ: the radius is scale x`);
    if (shape === 'sphere' && Math.max(sx, sy, sz) - Math.min(sx, sy, sz) > 0.01 * Math.max(sx, sy, sz)) warn(`sphere "${node.name}" is scaled unevenly: the radius is scale x`);
    if (shape === 'box') {
      const b = { hx: sx, hy: sy, hz: sz, x: _p.x, y: _p.y, z: _p.z, yaw: yawOf(_q) };
      if (role === 'hit') asset.hits.push(b);
      else { // a collider keeps its tilt (a sloping roof, a fallen slab: territory.place turns it by yaw, pitch and roll) and its flags
        _e.setFromQuaternion(_q, 'YXZ');
        const c = { type: 'box', ...b, pitch: _e.x, yaw: _e.y, roll: _e.z };
        if (u.floor) c.floor = true;     // a walking floor (physics.js floorUnder): ground, not an obstacle
        if (u.lattice) c.lattice = true; // an open truss's box (the audit skips its top)
        asset.cols.push(c);
      }
    } else if (shape === 'cyl') asset.cols.push({ type: 'cyl', r: sx, y0: _p.y - sy, y1: _p.y + sy, x: _p.x, z: _p.z });
    else if (shape === 'hcyl') { // a lying cylinder (a Quonset's roof): radius scale x, length 2 x scale z along the empty's z, turned about the vertical only
      if (_z.copy(YAXIS).applyQuaternion(_q).y < 0.9998) warn(`lying cylinder "${node.name}" is tilted: only its turn about the vertical is used`);
      asset.cols.push({ type: 'hcyl', r: sx, len: sz * 2, x: _p.x, y: _p.y, z: _p.z, yaw: yawOf(_q) });
    }
    else asset.cols.push({ type: 'sphere', r: sx, x: _p.x, y: _p.y, z: _p.z });
  } else if (role === 'stack') { // a stack of standard cargo boxes the game adds (settlements.js cargoStack): extras n, factions ('owner' or a list)
    asset.stacks.push({ x: _p.x, y: _p.y, z: _p.z, yaw: yawOf(_q), n: Math.max(1, Number(u.n) || 1), factions: String(u.factions || 'owner').split(',').map((f) => f.trim()) });
  } else if (role === 'ticker') { // a scrolling price tape (outpostModels.js tickerMat): extras w, h (m), items, rows, speed (tapes a second)
    if (!(Number(u.w) > 0) || !(Number(u.h) > 0) || typeof u.items !== 'string') { warn(`ticker "${node.name}" needs w, h and items: skipped`); return; }
    asset.tickers.push({ w: Number(u.w), h: Number(u.h), items: u.items, rows: Math.max(1, Number(u.rows) || 1), speed: Number(u.speed) || 0.05, x: _p.x, y: _p.y, z: _p.z, yaw: yawOf(_q) });
  } else if (role === 'raid' || role === 'smoke' || role === 'drop') {
    if (asset[role]) warn(`more than one "${role}" point: the last one wins`);
    asset[role] = _p.clone();
  } else if (role === 'text') {
    if (typeof u.str !== 'string' || !(Number(u.w) > 0)) { warn(`text "${node.name}" needs str and w: skipped`); return; }
    // keeps the node's yaw and roll about its +z; pitch is dropped
    if (Math.abs(_z.copy(ZAXIS).applyQuaternion(_q).y) > 0.02) warn(`text "${node.name}" leans (pitch): only its turn and roll are kept`);
    asset.texts.push({
      str: u.str, w: Number(u.w), fg: u.fg, bg: u.bg, stroke: u.stroke,
      back: u.back === undefined ? true : Number(u.back) !== 0, off: u.off === undefined ? 0.17 : Number(u.off),
      rz: Math.asin(Math.max(-1, Math.min(1, _z.copy(XAXIS).applyQuaternion(_q).y))),
      x: _p.x, y: _p.y, z: _p.z, yaw: yawOf(_q),
    });
  }
}

// ---------------------------------------------------------------- bake
// Outline shell in inkMat's form (toon.js: the surface, `normal` the way out, `inkT` how far): out along normals averaged per
// shared position (seams stay closed), as models.js does for the runner. Hard edges and corners are mitred (at most 2x) so
// each face moves the full `t`; the plain average would move only t/sqrt(3) (corner) or t/sqrt(2) (edge), a thinner line.
const MITRE_MIN = 0.5;
function inkShell(geo, t, w = null) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const sum = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    const s = sum.get(k) || [0, 0, 0, 1, 1]; // x, y, z, least dot of the average with a face normal, average's length
    s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
    sum.set(k, s);
  }
  for (const s of sum.values()) s[4] = Math.hypot(s[0], s[1], s[2]) || 1;
  for (let i = 0; i < n; i++) {
    const s = sum.get(key(i)), l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) || 1;
    s[3] = Math.min(s[3], (s[0] * nor.getX(i) + s[1] * nor.getY(i) + s[2] * nor.getZ(i)) / (s[4] * l));
  }
  const dir = new Float32Array(n * 3), th = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = sum.get(key(i));
    dir[i * 3] = s[0] / s[4]; dir[i * 3 + 1] = s[1] / s[4]; dir[i * 3 + 2] = s[2] / s[4];
    th[i] = (w ? t * w.getY(i) : t) / Math.max(MITRE_MIN, s[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos.clone());
  g.setAttribute('normal', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('inkT', new THREE.BufferAttribute(th, 1));
  g.setIndex(geo.index.clone());
  return g;
}

// stand-ins vcMaterial() derives its shared materials from (reads type and side only)
const PROTO = new Map();
const proto = (kind, side, halo = false) => {
  const k = `${kind}|${side}|${halo ? 1 : 0}`;
  if (!PROTO.has(k)) PROTO.set(k, kind === 'glow' ? (halo ? glowMark(new THREE.MeshBasicMaterial({ side })) : new THREE.MeshBasicMaterial({ side })) : new THREE.MeshToonMaterial({ side }));
  return PROTO.get(k);
};

// light beam (`additive…` material): additive, unlit, no depth write, like the Kit's BEAM; one per colour and opacity
const ADDITIVE = new Map();
function additiveMaterial(color, opacity) {
  const k = `${color.getHexString()}|${opacity.toFixed(3)}`;
  if (!ADDITIVE.has(k)) ADDITIVE.set(k, new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  return ADDITIVE.get(k);
}

// see-through glazing (`glass…`): toon, transparent, no depth write, both sides, like the Kit's GLASS; one per colour and opacity
const GLASSM = new Map();
function glassMaterial(color, opacity) {
  const k = `${color.getHexString()}|${opacity.toFixed(3)}`;
  if (!GLASSM.has(k)) GLASSM.set(k, new THREE.MeshToonMaterial({ color: color.clone(), gradientMap: gradientMap(), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  return GLASSM.get(k);
}

// parts -> merged meshes: one vertex-coloured mesh per (lit | unlit, side), plus one outline hull.
// `fixed`: the static body on the ground (y = 0); as with a Kit built onGround, unseen down-facing faces on it
// (and their shells) are dropped (toon.dropFloorFaces).
function bakeParts(parts, faction, fixed, owner = null) {
  const buckets = new Map(), beams = new Map(), shells = [], out = [];
  const pal = STYLE[owner] || STYLE.spacecom;
  for (const p of parts) {
    if (p.only && !p.only.includes(owner)) continue; // another owner's emblem
    if (p.slot.kind === 'additive' || p.slot.kind === 'glass') { // beam or glazing: own material, no vertex colours, no outline
      const mat = p.slot.kind === 'glass' ? glassMaterial(p.color, p.opacity < 1 ? p.opacity : 0.35) : additiveMaterial(p.color, p.opacity);
      if (!beams.has(mat)) beams.set(mat, []);
      beams.get(mat).push(p.geo.clone());
      continue;
    }
    const g = p.geo.clone();
    paintVertices(g, p.slot.style ? new THREE.Color(pal[p.slot.style]) : p.slot.faction ? faction : p.color);
    const halo = p.slot.kind === 'glow' && p.halo;
    const k = `${p.slot.kind}|${p.side}|${halo ? 1 : 0}`;
    if (!buckets.has(k)) buckets.set(k, { kind: p.slot.kind, side: p.side, halo, list: [] });
    buckets.get(k).list.push(fixed && p.side === THREE.FrontSide ? dropFloorFaces(g) : g);
    if (p.ink) { const sh = inkShell(p.geo, p.ink, p.inkW); shells.push(fixed ? dropFloorFaces(sh) : sh); }
  }
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.list), vcMaterial(proto(b.kind, b.side, b.halo)));
    // moving parts only cast (like the Kit's flags and dishes): thin double-sided cloth receiving would self-speckle
    m.castShadow = b.kind === 'toon';
    m.receiveShadow = fixed && b.kind === 'toon';
    if (fixed) m.userData.kitMesh = true; // fixed in the structure frame: world.mergeLocation may fold it in
    for (const g of b.list) g.dispose();
    out.push(m);
  }
  for (const [mat, list] of beams) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.renderOrder = mat.blending === THREE.AdditiveBlending ? 3 : 2; // after lit scenery, like the Kit's beams and glass
    for (const g of list) g.dispose();
    out.push(m);
  }
  if (shells.length) {
    const h = new THREE.Mesh(shellBounds(mergeGeometries(shells)), inkMat);
    h.userData.isInk = true;
    if (fixed) h.userData.kitMesh = true;
    for (const g of shells) g.dispose();
    out.push(h);
  }
  return out;
}

// asset -> template. `textMat(str, fg, bg, stroke)` makes a sign face's canvas material (outpostModels.js owns it,
// so signs match the Kit's).
export function bakeStatic(asset, { color, textMat, tickerMat }) {
  const faction = new THREE.Color(color), owner = factionOf(color, null);
  const root = new THREE.Group();
  root.name = `static:${asset.name}`;
  for (const g of asset.groups) {
    const lines = inkLineMesh(g.lines);
    if (!g.anim) { for (const m of bakeParts(g.parts, faction, true, owner)) root.add(m); if (lines) root.add(lines); continue; }
    // holder (placed, turned) > pivot (territory.js swings / spins / blinks it) > meshes
    const holder = new THREE.Group(), pivot = new THREE.Group();
    g.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    pivot.userData[g.anim] = g.anim === 'spin' && g.speed ? g.speed : true; // (a spin's own rate: territory.js movers)
    for (const m of bakeParts(g.parts, faction, false, owner)) pivot.add(m);
    if (lines) pivot.add(lines);
    holder.add(pivot);
    root.add(holder);
  }
  for (const t of asset.texts) {
    const mat = textMat(t.str, t.fg || '#ffd23f', t.bg || '#241a3a', t.stroke || '#120a1e');
    const geo = new THREE.PlaneGeometry(t.w, t.w / mat.userData.aspect);
    for (const side of t.back ? [0, 1] : [0]) {
      const lz = side ? -1 : 1, m = new THREE.Mesh(geo, mat);
      m.position.set(t.x + Math.sin(t.yaw) * t.off * lz, t.y, t.z + Math.cos(t.yaw) * t.off * lz);
      m.rotation.set(0, t.yaw + (side ? Math.PI : 0), side ? -t.rz : t.rz);
      root.add(m);
    }
  }
  for (const k of asset.tickers || []) { // (the tape shows as much of itself as fits the screen's shape; territory.js slides it)
    if (!tickerMat) break;
    const mat = tickerMat(k.items, k.rows), geo = new THREE.PlaneGeometry(k.w, k.h), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * ((k.w / k.h) / mat.userData.aspect));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(k.x, k.y, k.z);
    m.rotation.y = k.yaw;
    m.userData.ticker = k.speed;
    root.add(m);
  }
  return {
    root,
    cols: asset.cols.map((c) => ({ ...c })),
    hits: asset.hits.map((h) => ({ ...h })),
    raid: asset.raid ? asset.raid.clone() : null,
    smoke: asset.smoke ? asset.smoke.clone() : null,
    drop: asset.drop ? asset.drop.clone() : null,
    stacks: asset.stacks.map((st) => ({ ...st, factions: [...st.factions] })), // (added by outpostModels.outpostTemplate)
    walkers: asset.walkers ? { ...asset.walkers } : null, // (its look is the owner's: outpostModels.outpostTemplate)
  };
}
