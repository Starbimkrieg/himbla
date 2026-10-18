#!/usr/bin/env node
// Checks a static outposts GLB against the contract in docs/outpost-glb.md, before it is committed.
//
//   npm run check:outposts                         checks src/assets/outposts.glb for the kinds the game uses
//   node tools/check-outposts.mjs file.glb [--kind mast ...] [--all] [--json]
//
// Reads the GLB's JSON directly (no three.js) and follows the same rules as the game (src/staticContract.js,
// src/staticBake.js): what it reports is what the game will do with the file. Errors (exit 1) are things the game
// would mis-handle or fall back on; warnings are things it ignores or papers over. Exit 2: could not read the file
// or bad arguments.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slotOf, roleOf, animOf, ROLES, SHAPES, stripSuffix, rootName, GLB_KINDS } from '../src/staticContract.js';

const USAGE = 'usage: node tools/check-outposts.mjs [file.glb] [--kind NAME ...] [--all] [--json]';
const die = (m) => { console.error(`${m}\n${USAGE}`); process.exit(2); };
const args = process.argv.slice(2);
const kinds = [];
let file = fileURLToPath(new URL('../src/assets/outposts.glb', import.meta.url)), asJson = false, all = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--kind') { const v = args[++i]; if (!v || v.startsWith('--')) die('--kind needs a name'); kinds.push(v); }
  else if (a === '--json') asJson = true;
  else if (a === '--all') all = true;
  else if (a.startsWith('--')) die(`unknown option ${a}`);
  else file = a;
}

// GLTFLoader's node-name sanitising (PropertyBinding.sanitizeNodeName): the game sees these names
const gameName = (n) => String(n || '').replace(/\s/g, '_').replace(/[[\]./:]/g, '');

// ---- 4x4 column-major helpers (only what a node-relative transform needs) ----
const ID = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(n) {
  if (n.matrix) return n.matrix.slice();
  const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
    2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
    2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const col = (m, c) => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function decompose(m) {
  const cx = col(m, 0), cy = col(m, 1), cz = col(m, 2), s = [len(cx), len(cy), len(cz)];
  const n = (v, k) => v.map((x) => x / (k || 1));
  return { pos: [m[12], m[13], m[14]], scale: s, xaxis: n(cx, s[0]), yaxis: n(cy, s[1]), zaxis: n(cz, s[2]) };
}
const yawOf = (z) => Math.atan2(z[0], z[2]);
// can a position / turn / scale hold this matrix? (its axes must stay at right angles)
const isPlainTRS = (d) => Math.abs(dot(d.xaxis, d.yaxis)) < 1e-3 && Math.abs(dot(d.xaxis, d.zaxis)) < 1e-3 && Math.abs(dot(d.yaxis, d.zaxis)) < 1e-3;

// ---- load ----
let buf, j;
try { buf = readFileSync(file); } catch (e) { die(`cannot read ${file}: ${e.code || e.message}`); }
if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) die(`${file}: not a GLB 2.0 file`);
try { j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')); } catch (e) { die(`${file}: unreadable JSON chunk (${e.message})`); }
const nodes = j.nodes || [];
// extras as the game sees them: GLTFLoader merges the mesh's extras under the node's
const extrasOf = (n) => ({ ...(n.mesh !== undefined ? j.meshes?.[n.mesh]?.extras : {}), ...(n.extras || {}) });
const roots = (j.scenes?.[j.scene ?? 0]?.nodes || []).map((i) => ({ i, name: gameName(nodes[i].name) }));
const byRoot = new Map(roots.map((r) => [r.name, r.i]));

const report = { file, kinds: {}, errors: [], warnings: [] };
const errors = [], warns = new Map(); // (a repeated warning is shown once with a count)
const E = (m) => errors.push(m);
const W = (m, key = m) => { const w = warns.get(key); if (w) w.n++; else warns.set(key, { m, n: 1 }); };

for (const k of ['images', 'textures', 'skins', 'animations', 'cameras']) if (j[k]?.length) W(`${j[k].length} ${k} in the file: ignored by the game`);
for (const x of j.extensionsRequired || []) {
  if (x === 'KHR_draco_mesh_compression' || x === 'EXT_meshopt_compression') E(`the file needs ${x}, and the game's loader has no decoder for it (export without compression)`);
  else W(`required extension ${x}: the game's loader may not support it`);
}
if (!(j.extensionsRequired || []).length && j.extensionsUsed?.length) W(`extensions used: ${j.extensionsUsed.join(', ')}`);

// which roots to check: the kinds the game uses (default), the ones named, or every kind in the file
const fileKinds = roots.map((r) => r.name).filter((n) => !n.endsWith('_wreck'));
const wanted = kinds.length ? kinds : all ? fileKinds : [...GLB_KINDS];
if (!kinds.length && !all) for (const n of fileKinds) if (!GLB_KINDS.has(n)) W(`root "${n}" is in the file but not in GLB_KINDS (src/staticContract.js): the game will not use it yet (--all checks it anyway)`);
if (!wanted.length) E('no root nodes in the scene');

for (const kind of wanted) {
  for (const wreck of [false, true]) {
    const name = rootName(kind, wreck);
    if (!byRoot.has(name)) { if (wreck) W(`no root node "${name}": its wreck will stay Kit-built`); else E(`no root node "${name}": the game would build the Kit version instead`); continue; }
    report.kinds[name] = checkRoot(name, byRoot.get(name), wreck);
  }
}

function checkRoot(name, rootIdx, wreck) {
  const e = (m) => E(`${name}: ${m}`), w = (m, key) => W(`${name}: ${m}`, key && `${name}|${key}`);
  const root = nodes[rootIdx];
  if (root.mesh !== undefined) w('the root node is a mesh: use an empty');
  const st = { meshes: 0, verts: 0, tris: 0, materials: {}, cols: [], hits: [], points: {}, pointPos: {}, texts: 0, textDraws: 0, anims: { flag: 0, blink: 0, spin: 0 }, buckets: new Set(), inkMeshes: 0, anyExtras: false };
  const names = new Map();
  const walk = (idx, m, group) => {
    const n = nodes[idx], x = extrasOf(n), nm = gameName(n.name);
    if (Object.keys(x).length) st.anyExtras = true;
    if (nm) names.set(nm, (names.get(nm) || 0) + 1);
    const mm = mul(m, local(n));
    let g = group; // (the bake group the meshes below land in: the static body, or one animated node)
    if (n.mesh !== undefined) {
      const stray = animOf(x) || roleOf(nm, x);
      if (stray) w(`mesh "${n.name}" is marked "${stray}": only empties can be gameplay nodes or moving parts, so it is drawn as ordinary geometry`);
      mesh(n, x, group, e, w, st);
    } else {
      if (x.role !== undefined && !ROLES.includes(x.role)) e(`node "${n.name}": unknown role "${x.role}"`);
      if (x.anim !== undefined && !animOf(x)) e(`node "${n.name}": unknown anim "${x.anim}" (flag, blink or spin)`);
      const anim = animOf(x), role = anim ? null : roleOf(nm, x); // (a moving part comes before a gameplay role, as in the game)
      if (anim) {
        st.anims[anim]++;
        if (group !== 'body') w(`animated node "${n.name}" inside another animated node: treated as part of it`);
        else {
          g = `${anim}:${idx}`;
          if (!isPlainTRS(decompose(mm))) w(`animated node "${n.name}" sits under a non-uniformly scaled parent and is turned: its meshes would land wrong (apply the scale in Blender)`);
        }
      } else if (role) gameplay(role, n, mm, x, e, w, st);
    }
    for (const c of n.children || []) walk(c, mm, g); // (a gameplay empty's children are ordinary geometry)
  };
  for (const c of root.children || []) walk(c, ID(), 'body');
  for (const [nm, c] of names) if (c > 1) w(`${c} nodes named "${nm}" (names should be unique)`, `dup:${nm}`);
  if (!st.meshes) e('no meshes: the game would leave this root out and build the Kit version');
  if (!st.anyExtras) e('no custom properties anywhere: was the file exported without export_extras? Colliders, moving parts and outlines are all read from them');
  const cnt = (r) => st.points[r] || 0;
  if (!wreck && !cnt('raid')) w('no raid point: raiding falls back to standing within 9 m of the yard centre, with no marked spot');
  if (wreck && cnt('raid')) w('a wreck should have no raid point');
  for (const r of ['smoke', 'drop', 'raid']) if (cnt(r) > 1) w(`${cnt(r)} ${r} points: the last one wins`);
  for (const r of ['smoke', 'drop']) if (!cnt(r)) w(`no ${r} point: the game falls back to a default`);
  if (!st.hits.length) w('no hit boxes: blast damage falls back to the distance from the yard centre');
  if (!st.cols.length) w('no colliders: you could walk through it');
  return {
    meshes: st.meshes, verts: st.verts, tris: st.tris, inkMeshes: st.inkMeshes, draws: st.buckets.size + st.textDraws,
    materials: st.materials, cols: st.cols, hits: st.hits, points: st.points, pointPos: st.pointPos, texts: st.texts, anims: st.anims,
  };
}

function mesh(n, x, group, e, w, st) {
  const md = j.meshes[n.mesh], nm = n.name;
  if (md.primitives.length > 1) w(`mesh "${nm}" has ${md.primitives.length} materials: each becomes its own part (it works, but one material per mesh is the convention)`, 'multi');
  for (const p of md.primitives) {
    if (p.mode !== undefined && p.mode !== 4) { e(`mesh "${nm}": not triangles`); continue; }
    if (p.attributes.NORMAL === undefined) e(`mesh "${nm}": no normals`);
    if (p.indices === undefined) w('some meshes are not indexed', 'noindex');
    for (const a of ['TEXCOORD_0', 'COLOR_0', 'JOINTS_0']) if (p.attributes[a] !== undefined) w(`meshes carry ${a}: ignored (export without UVs to keep the file small)`, `attr:${a}`);
    st.verts += j.accessors[p.attributes.POSITION].count;
    st.tris += (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
    const mat = p.material !== undefined ? j.materials[p.material] : null;
    if (!mat) { w('some meshes have no material: they render as plain white toon', 'nomat'); st.buckets.add(`${group}|toon|fs`); continue; }
    const mn = mat.name || '', slot = slotOf(mn), side = mat.doubleSided ? 'ds' : 'fs', label = stripSuffix(mn) || '(unnamed)';
    if (!mn) w('a material has no name: it renders as a plain toon colour', 'unnamed');
    const pbr = mat.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture) w(`material "${label}": a texture: ignored (flat base colour only)`, `tex:${label}`);
    const alpha = (pbr.baseColorFactor || [1, 1, 1, 1])[3];
    if (slot.kind === 'additive') {
      if (mat.alphaMode !== 'BLEND') w(`material "${label}": an additive beam needs alpha blending (alphaMode BLEND), or it draws at full strength`, `addblend:${label}`);
      else if (!(alpha > 0 && alpha < 1)) w(`material "${label}": an additive beam with alpha ${alpha} draws at full strength or not at all`, `addalpha:${label}`);
    } else if (mat.alphaMode === 'BLEND' || mat.alphaMode === 'MASK') w(`material "${label}": ${mat.alphaMode} is not supported: it renders opaque (only an additive… material may be see-through)`, `alpha:${label}`);
    if (mat.emissiveFactor && mat.emissiveFactor.some((v) => v > 0)) w(`material "${label}": emission is ignored (use a glow* material for unlit)`, `emit:${label}`);
    const rgb = (pbr.baseColorFactor || [1, 1, 1, 1]).slice(0, 3).map((v) => +v.toFixed(3));
    st.materials[label] = { treatment: `${slot.faction ? 'faction ' : ''}${slot.kind}${slot.kind === 'additive' ? ` (alpha ${+alpha.toFixed(3)})` : ''}`, color: slot.faction ? null : rgb, doubleSided: !!mat.doubleSided };
    st.buckets.add(slot.kind === 'additive' ? `${group}|additive|${rgb.join(',')}|${alpha.toFixed(3)}` : `${group}|${slot.kind}|${side}`);
  }
  st.meshes++;
  if (x.ink !== undefined) {
    if (typeof x.ink !== 'number') { if (Number.isFinite(Number(x.ink))) w(`mesh "${nm}": ink is the text "${x.ink}" (the game accepts it, but make it a number)`, 'inktext'); else e(`mesh "${nm}": ink must be a number`); }
    else if (x.ink < 0) w(`mesh "${nm}": a negative ink is ignored`, 'inkneg');
  }
  if (Number(x.ink) > 0) {
    const onBeam = md.primitives.every((p) => p.material !== undefined && slotOf(j.materials[p.material]?.name).kind === 'additive');
    if (onBeam) w(`mesh "${nm}": a beam gets no outline: its ink is ignored`, 'beamink');
    else { st.inkMeshes++; st.buckets.add(`${group}|ink`); }
  }
}

function gameplay(role, n, m, x, e, w, st) {
  const d = decompose(m), nm = n.name, [sx, sy, sz] = d.scale, r3 = (v) => +v.toFixed(4);
  if (role === 'col' || role === 'hit') {
    const shape = role === 'hit' ? 'box' : (x.shape === undefined ? 'box' : x.shape);
    if (!SHAPES.includes(shape)) { e(`collider "${nm}": unknown shape "${shape}" (box, cyl or sphere)`); return; }
    if (![sx, sy, sz].every((v) => v > 1e-6 && Number.isFinite(v))) e(`${role} "${nm}": zero or invalid scale (scale = half-extents)`);
    if (shape === 'box' && d.yaxis[1] < 0.9998) w(`${role} "${nm}" is tilted: only its turn about the vertical is used`);
    if (shape === 'cyl' && d.yaxis[1] < 0.9998) w(`cylinder "${nm}" is tilted: a cylinder collider is always upright (use boxes for a lying one)`);
    if (shape === 'cyl' && Math.abs(sx - sz) > 0.01 * Math.max(sx, sz)) w(`cylinder "${nm}": scale x and z differ: the radius is scale x`);
    if (shape === 'sphere' && Math.max(sx, sy, sz) - Math.min(sx, sy, sz) > 0.01 * Math.max(sx, sy, sz)) w(`sphere "${nm}" is scaled unevenly: the radius is scale x`);
    const rec = shape === 'box'
      ? { type: 'box', hx: r3(sx), hy: r3(sy), hz: r3(sz), x: r3(d.pos[0]), y: r3(d.pos[1]), z: r3(d.pos[2]), yaw: r3(yawOf(d.zaxis)) }
      : shape === 'cyl' ? { type: 'cyl', r: r3(sx), y0: r3(d.pos[1] - sy), y1: r3(d.pos[1] + sy), x: r3(d.pos[0]), z: r3(d.pos[2]) }
        : { type: 'sphere', r: r3(sx), x: r3(d.pos[0]), y: r3(d.pos[1]), z: r3(d.pos[2]) };
    if (role === 'hit') { delete rec.type; st.hits.push(rec); } else st.cols.push(rec);
    if (d.pos.some((v) => !Number.isFinite(v))) e(`${role} "${nm}": invalid position`);
  } else if (role === 'text') {
    if (typeof x.str !== 'string' || !x.str) e(`text "${nm}": needs a string property str`);
    if (!(Number(x.w) > 0)) e(`text "${nm}": needs a number property w > 0 (the board width in metres)`);
    if (Math.abs(d.zaxis[1]) > 0.02) w(`text "${nm}" leans (pitch): only its turn and roll are kept`);
    st.texts++;
    st.textDraws += x.back === undefined || Number(x.back) !== 0 ? 2 : 1;
  } else { st.points[role] = (st.points[role] || 0) + 1; st.pointPos[role] = d.pos.map(r3); }
}

// ---- report ----
report.errors = errors;
report.warnings = [...warns.values()].map((w) => (w.n > 1 ? `${w.m} (x${w.n})` : w.m));
if (asJson) console.log(JSON.stringify(report, null, 1));
else {
  console.log(`${file}  (${(buf.length / 1024).toFixed(0)} KB)`);
  for (const [name, k] of Object.entries(report.kinds)) {
    const pts = Object.entries(k.points).map(([r, c]) => `${r}${c > 1 ? '×' + c : ''}`).join(' ');
    console.log(`  ${name}: ${k.meshes} meshes (${k.verts} verts, ${k.tris} tris) -> ${k.draws} draw calls; ${k.cols.length} colliders, ${k.hits.length} hit boxes, ${k.texts} signs, points: ${pts || 'none'}; moving: ${k.anims.flag} flag, ${k.anims.blink} blink, ${k.anims.spin} spin`);
    const mats = Object.entries(k.materials).map(([m, v]) => `${m}${v.doubleSided ? '(2s)' : ''}→${v.treatment}`);
    console.log(`    materials: ${mats.join(', ')}`);
  }
  for (const m of report.errors) console.log(`ERROR  ${m}`);
  for (const m of report.warnings) console.log(`warn   ${m}`);
  console.log(report.errors.length ? `\n${report.errors.length} error(s), ${report.warnings.length} warning(s)` : `\nok: ${report.warnings.length} warning(s)`);
}
process.exit(report.errors.length ? 1 : 0);
