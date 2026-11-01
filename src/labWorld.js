import * as THREE from 'three';
import { settle } from './settlements.js';
import { zlabNode, zlabMat, zlabGroup } from './models.js';
import { makeChimera, PALETTE } from './chimera.js';
import { textSprite, nameTag } from './toon.js';
import { pixelFont } from './fonts.js';
import drone0 from './assets/zlab-drone0.jpg?inline';
import drone1 from './assets/zlab-drone1.jpg?inline';
import drone2 from './assets/zlab-drone2.jpg?inline';
import drone3 from './assets/zlab-drone3.jpg?inline';

// Dr. Zbornak's Antimatter Research Lab (docs/zbornak-proposals/): the Rotunda, built in Blender (tools/blender/build_zbornak_lab.py
// ZB_GAME=1 -> zlab.glb) and baked here into the place's kit, with what moves and what you use:
//   the reactor's core and rings spin (faster after a feed: world.reactor.flash);
//   the robot cell works its cycle (CELL_KEYS, the builder's: tool points eased between keys, the joints solved by armIk);
//   Dr. Zbornak turns his head to watch you;
//   the airlock: step on the stand plate and the camera scans you, the screen shows your picture and ACCESS GRANTED, the
//   outer door sinks into its slot (its collider goes); 6 m into the tube it rises behind you, the tube cycles (a hiss) and the inner door
//   rises into the portal's wall. Going out, the inner door opens as you come to it and the outer once it has shut. A door
//   opens only once the other has been shut a moment, and never shuts on you in its doorway;
//   the screens: the security screen, LABNET's attract screen (the console; main.js opens LABNET itself, labnet.js), the
//   holding pen's residents (the ranch office), four drone feeds (frames filmed in the game, tools/zbornak-drones.mjs).
//   the lift to the catwalk: its car carries you up or down, its gates rise only where it stands (updateLift);
// Spots (lab.spots, world positions): plate, outer_door, inner_door, lift, intake (the reactor's intake hatch, where X feeds the jar), reactor,
// doctor, labnet, pod, pen.

const ROOTS = ['zl_lab', 'zl_roof', 'zl_out', 'zl_ranch'];
const FIXED = new Set(['cargo', 'livery']);                        // pivots that are only grouping: baked with the place
const ONE = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
const _M = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const nodeM = (n, parent) => new THREE.Matrix4().compose(n.pos, n.quat, ONE).premultiply(parent);
const TAU = Math.PI * 2;

// the chimeras in the cryo pods and on the robots' bench (the renders' eight, tools/zbornak-chimeras.mjs)
const GENES = [
  { seed: 3, body: 'mite', legs: 'car', head: 'person', extraHead: null, mods: ['crystal'], size: 1, tint: PALETTE.mite[0] },
  { seed: 5, body: 'sapling', legs: 'mite', head: 'mite', extraHead: null, mods: [], size: 1, tint: PALETTE.sapling[0] },
  { seed: 8, body: 'car', legs: 'mite', head: 'alien', extraHead: null, mods: ['spark'], size: 1, tint: PALETTE.car[0] },
  { seed: 11, body: 'person', legs: 'sapling', head: 'car', extraHead: null, mods: [], size: 1, tint: PALETTE.person[0] },
  { seed: 13, body: 'junkbot', legs: 'mite', head: 'sapling', extraHead: 'mite', mods: ['void'], size: 1, tint: PALETTE.junkbot[0] },
  { seed: 17, body: 'alien', legs: 'car', head: 'mite', extraHead: null, mods: ['armor'], size: 1, tint: PALETTE.alien[0] },
  { seed: 19, body: 'mite', legs: 'mite', head: 'pirate', extraHead: null, mods: ['radio'], size: 1, tint: PALETTE.mite[1] || PALETTE.mite[0] },
  { seed: 23, body: 'pirate', legs: 'car', head: 'sapling', extraHead: null, mods: ['turbo'], size: 1, tint: PALETTE.pirate[0] },
];

// ---- the robot cell (build_zbornak_lab.py: ARM_BASES, CELL_KEYS, arm_ik; bench frame, the welder's side +z) ----
const DOWN = -Math.PI / 2, CYCLE = 16;                              // s per work cycle
const ARM_BASES = { arm0: [-2.2, -3.6, 0], arm1: [2.2, -3.6, 0], arm2: [0.5, 4.3, Math.PI] };
const ARM_TOOL = { arm0: 1.05, arm1: 1.05, arm2: 1.22 };
const CELL_KEYS = {
  arm0: [[0.00, [-1.3, 2.9, -1.4], -0.6], [0.05, [-1.3, 2.9, -1.4], -0.6], [0.14, [-0.38, 2.35, -0.62], -0.25], [0.20, [-0.22, 2.3, -0.34], -0.25],
    [0.86, [-0.22, 2.3, -0.34], -0.25], [0.92, [-0.38, 2.35, -0.62], -0.25], [1.00, [-1.3, 2.9, -1.4], -0.6]],
  arm1: [[0.00, [2.5, 2.6, 0.75], DOWN], [0.06, [2.5, 2.6, 0.75], DOWN], [0.13, [2.5, 1.91, 0.75], DOWN], [0.17, [2.5, 1.91, 0.75], DOWN],
    [0.24, [2.5, 2.95, 0.75], DOWN], [0.34, [0.8, 2.95, 0.0], DOWN], [0.40, [0.355, 2.58, 0.0], DOWN], [0.80, [0.355, 2.58, 0.0], DOWN],
    [0.84, [0.36, 2.85, 0.0], DOWN], [0.88, [0.9, 3.0, 0.2], DOWN], [1.00, [2.5, 2.6, 0.75], DOWN]],
  arm2: [[0.00, [1.3, 3.0, 1.9], -0.5], [0.36, [1.3, 3.0, 1.9], -0.5], [0.44, [0.44, 2.06, 0.34], -0.35], [0.46, [0.405, 2.08, 0.27], -0.35],
    [0.74, [0.405, 2.52, 0.27], -0.35], [0.80, [0.9, 2.9, 1.0], -0.4], [0.88, [1.3, 3.0, 1.9], -0.5], [1.00, [1.3, 3.0, 1.9], -0.5]],
};
const PICK_T = 0.17, RELEASE_T = 0.82, WELD_T = [0.46, 0.74];
// The cell runs three cycles in turn, CYCLE s each, every one starting and ending with the arms parked:
//   WELD          (the builder's CELL_KEYS) the left arm clamps the chimera on the jig, the right one takes an armour plate
//                 from the carrier and holds it on the flank, the welder runs a bead up the seam;
//   HOIST & DOCK  the hoist's trolley runs out along the gantry and pays out a power cell on its hook; the right arm reaches
//                 up under it, takes it, flips it and seats it in the charging dock on the bench; the welder tacks it twice;
//   INSPECT       the left arm takes the scanner wand from its holder and sweeps it over the chimera while the jig turns it a
//                 full turn; the right arm leans in to watch; the wand goes back, and the docked cell sinks into the dock.
// Keys: [t, tool point (bench frame), pitch]; the trolley's: [t, [its x along the beam, cable paid out, 0], 0].
const UP = Math.PI / 2;
const P0 = [-1.3, 2.9, -1.4], P1 = [2.5, 2.6, 0.75], P2 = [1.3, 3.0, 1.9], CLAMP_A = [-0.38, 2.35, -0.62], CLAMP = [-0.22, 2.3, -0.34];
const DOCK = [1.6, 1.76, -0.6], HOLD = [-2.3, 1.76, 0.6], HAND = [2.2, 4.5, -1.8];   // a seated cell's middle, the wand in its holder, the hand-off under the hook
const CYCLES = [
  { name: 'WELD', keys: CELL_KEYS, weld: [WELD_T] },
  { name: 'HOIST & DOCK', weld: [[0.64, 0.67], [0.71, 0.74]], pick: 0.33, drop: 0.585, keys: {
    arm0: [[0, P0, -0.6], [0.06, CLAMP_A, -0.25], [0.12, CLAMP, -0.25], [0.88, CLAMP, -0.25], [0.94, CLAMP_A, -0.25], [1, P0, -0.6]],
    arm1: [[0, P1, DOWN], [0.10, P1, DOWN], [0.20, [2.3, 3.3, -1.4], 0], [0.27, [2.2, 3.9, -1.8], UP], [0.31, HAND, UP], [0.345, HAND, UP],
      [0.41, [2.2, 3.8, -1.8], UP], [0.46, [1.9, 3.2, -1.0], 0], [0.52, [1.6, 2.4, -0.6], DOWN], [0.57, DOCK, DOWN], [0.60, DOCK, DOWN],
      [0.64, [1.6, 2.45, -0.6], DOWN], [0.76, P1, DOWN], [1, P1, DOWN]],
    arm2: [[0, P2, -0.5], [0.58, P2, -0.5], [0.63, [1.45, 1.62, -0.3], -0.35], [0.67, [1.45, 1.62, -0.3], -0.35], [0.70, [1.75, 1.62, -0.3], -0.35],
      [0.74, [1.75, 1.62, -0.3], -0.35], [0.82, P2, -0.5], [1, P2, -0.5]],
  }, trolley: [[0, [-2.6, 0.1, 0], 0], [0.04, [-2.6, 0.1, 0], 0], [0.16, [2.2, 0.1, 0], 0], [0.26, [2.2, 2.25, 0], 0], [0.345, [2.2, 2.25, 0], 0],
    [0.44, [2.2, 0.1, 0], 0], [0.50, [2.2, 0.1, 0], 0], [0.62, [-2.6, 0.1, 0], 0], [1, [-2.6, 0.1, 0], 0]] },
  { name: 'INSPECT', weld: [], pick: 0.155, drop: 0.835, beam: [0.30, 0.68], spin: [0.30, 0.68], keys: {
    // (the sweep, 0.30 to 0.68: the wand 0.9 m short of the chimera on the line from the arm's base, tipped down at it)
    arm0: [[0, P0, -0.6], [0.08, [-2.3, 2.5, 0.6], DOWN], [0.14, HOLD, DOWN], [0.17, HOLD, DOWN], [0.22, [-2.3, 2.6, 0.6], DOWN],
      [0.30, [-0.62, 3.0, -0.62], -0.78], [0.40, [-0.30, 3.2, -0.78], -0.95], [0.50, [-0.62, 2.7, -0.62], -0.55], [0.60, [-0.75, 3.2, -0.40], -0.95],
      [0.68, [-0.62, 3.0, -0.62], -0.78], [0.76, [-2.3, 2.6, 0.6], DOWN], [0.82, HOLD, DOWN], [0.85, HOLD, DOWN], [0.90, [-2.3, 2.5, 0.6], DOWN], [1, P0, -0.6]],
    arm1: [[0, P1, DOWN], [0.25, [1.4, 3.4, -0.4], -0.7], [0.70, [1.4, 3.4, -0.4], -0.7], [0.85, P1, DOWN], [1, P1, DOWN]],
    arm2: [[0, P2, -0.5], [0.45, [1.0, 3.2, 1.6], -0.6], [0.9, P2, -0.5], [1, P2, -0.5]],
  } },
];
const _rx = new THREE.Quaternion(), _ry = new THREE.Quaternion(), X1 = new THREE.Vector3(1, 0, 0);
const _tp = [0, 0, 0];
function track(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0, f0] = keys[i], [t1, p1, f1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      let u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      u = u * u * (3 - 2 * u);
      for (let k = 0; k < 3; k++) _tp[k] = p0[k] + (p1[k] - p0[k]) * u;
      return f0 + (f1 - f0) * u;
    }
  }
  const last = keys[keys.length - 1];
  for (let k = 0; k < 3; k++) _tp[k] = last[1][k];
  return last[2];
}
// the joint angles that put a tool point at (tx, ty, tz) in the arm's base frame, pitched phi (elbow up): yaw, shoulder (up), elbow, wrist (down)
const IK = [0, 0, 0, 0];
function armIk(tx, ty, tz, phi, tool, baseH = 0.9, L1 = 3.2, L2 = 2.8) {
  const yaw = Math.atan2(tx, tz);
  const d = Math.hypot(tx, tz), h = ty - (baseH + 0.95);
  const wd = d - tool * Math.cos(phi), wh = h - tool * Math.sin(phi);
  const D = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(Math.hypot(wd, wh), L1 + L2 - 1e-3));
  const a1 = Math.atan2(wh, wd) + Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
  const a2 = Math.atan2(wh - L1 * Math.sin(a1), wd - L1 * Math.cos(a1));
  IK[0] = yaw; IK[1] = a1; IK[2] = a1 - a2; IK[3] = a2 - phi;
  return IK;
}

// ---- screens ----
function canvasScreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), tex };
}
function scanlines(g, w, h) {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
}
function drawLines(g, w, h, head, hc, lines, scan = true) {
  g.fillStyle = '#07120c'; g.fillRect(0, 0, w, h);
  g.fillStyle = hc; g.fillRect(0, 0, w, Math.round(h * 0.16));
  g.fillStyle = '#07120c'; g.font = pixelFont(Math.round(h * 0.075)); g.textBaseline = 'middle';
  g.fillText(head, w * 0.03, h * 0.08);
  g.font = pixelFont(Math.round(h * 0.06)); g.textBaseline = 'top';
  lines.forEach((ln, i) => {
    g.fillStyle = ln.startsWith('!') ? '#ff3b5c' : ln.startsWith('*') ? '#ffd23f' : '#8dffb4';
    g.fillText(ln.replace(/^[!*]/, ''), w * 0.04, h * (0.22 + i * 0.11));
  });
  if (scan) scanlines(g, w, h);
}

export function buildZbornakLab(world, loc) {
  const lab = { loc, spots: {}, local: {}, screens: {}, arms: {}, chims: [], t: 0, doors: {}, gate: { state: 'idle', t: 0, granted: false } };
  const dyn = [];
  settle(world, loc, 6607, (k) => {
    k.floorCols = true;
    const bake = (node, M) => {
      const tag0 = k.tag;
      if (node.name) k.tag = node.name; // dev audit: each piece named by its Blender node (outpostModels.js Kit.tags)
      k.baked(node, zlabMat, M);
      for (const kid of node.kids) {
        const Mk = nodeM(kid, M);
        const d = kid.data, role = kid.role;
        if (role === 'col') {
          _p.copy(kid.pos).applyMatrix4(M);
          if (d.shape === 'cyl') k.column(d.r, _p.y + d.h, _p.x, _p.z, _p.y);
          else k.solidQ(d.hx, d.hy, d.hz, _p.x, _p.y, _p.z, _q.setFromEuler(_e.set(d.rx || 0, d.ry || 0, d.rz || 0, 'ZYX')), { auto: true, ...(d.stick ? { stick: true } : {}), ...(d.see ? { see: true } : {}) });   // (see: glass the camera looks through)
        } else if (FIXED.has(role)) bake(kid, Mk);
        else if (role === 'spot') {
          Mk.decompose(_p, _q, _s);
          lab.local[d.spot] = _p.clone();
          lab.local[d.spot + 'Yaw'] = _e.setFromQuaternion(_q, 'YXZ').y;
          (lab.spotData ||= {})[d.spot] = d;
        } else if (role === 'text') {
          Mk.decompose(_p, _q, _s);
          const c = '#' + (zlabMat(d.slot).color || new THREE.Color(0x7dff3a)).getHexString();
          k.text(d.text, _p.x, _p.y + d.size * 0.5, _p.z, _e.setFromQuaternion(_q, 'YXZ').y, d.size * d.text.length * 0.66, { fg: c, bg: '#120a1e', stroke: '#120a1e', back: false, off: 0.03 });
        } else if (role === 'screen') {
          const geo = new THREE.PlaneGeometry(d.w, d.h).rotateX(-(d.tilt || 0));
          const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0a1a10 }));
          Mk.decompose(m.position, m.quaternion, _s);
          k.root.add(m);
          lab.screens[d.sid] = m;
        } else if (role === 'chim') {
          const c = makeChimera(GENES[d.idx % GENES.length]);
          Mk.decompose(c.root.position, c.root.quaternion, _s);
          c.root.scale.setScalar(d.scale || 1);
          k.root.add(c.root);
          lab.chims.push(c);
        } else {
          // a moving part: built whole as Groups in its place (colliders under it are the place's, at rest)
          const g = zlabGroup(kid);
          Mk.decompose(g.position, g.quaternion, _s);
          k.root.add(g);
          dyn.push({ role, node: kid, g, M: Mk });
          const cols = (n, Mn) => { for (const c of n.kids) { if (c.role === 'col') bake({ parts: [], ink: null, kids: [c] }, Mn); else cols(c, nodeM(c, Mn)); } };
          cols(kid, Mk);
        }
      }
      k.tag = tag0;
    };
    for (const name of ROOTS) bake(zlabNode(name), new THREE.Matrix4());
  });
  // the moving parts by role
  for (const { role, g } of dyn) {
    if (role === 'arm') {
      const n = g.name;
      lab.arms[n] = { turret: g.getObjectByName(n + '_turret'), shoulder: g.getObjectByName(n + '_shoulder'), elbow: g.getObjectByName(n + '_elbow'),
        wrist: g.getObjectByName(n + '_wrist'), roll: g.getObjectByName(n + '_roll'), weld: g.getObjectByName(n + '_weld'), carry: g.getObjectByName('plate_carry') };
    } else if (role === 'plate') lab[g.name.replace('plate_', 'plate')] = g;
    else if (role === 'jig') lab.jig = { g, q0: g.quaternion.clone() };
    else if (role === 'trolley') lab.hoist = { g, p0: g.position.clone(), ax: X1.clone().applyQuaternion(g.quaternion), cable: g.getObjectByName('hoist_cable'), hook: g.getObjectByName('hoist_hook') };
    else if (role === 'scanner') lab.scanner = { g, parent: g.parent, p0: g.position.clone(), q0: g.quaternion.clone(), beam: g.getObjectByName('scanner_beam') };
    else if (role === 'dockpt') lab.dock = g;
    else if (role === 'core') { lab.core = g; lab.coreY = g.position.y; lab.rings = g.children.filter((o) => o.userData.role === 'ring'); }
    else if (role === 'lift') lab.lift = { g, y0: g.position.y, travel: g.userData.travel || 6.5, pos: 0, lv: 0, state: 'idle', dwell: 0, armed: true, rider: false };
    else if (role === 'liftgate') (lab.liftGates ||= [])[g.name.endsWith('1') ? 1 : 0] = { g, y0: g.position.y, travel: g.userData.travel || 2.3, open: 0 };
    else if (role === 'door') lab.doors[g.name.startsWith('inner') ? 'inner' : 'outer'] = { g, y0: g.position.y, travel: g.userData.travel || 5.4, open: 0, shut: 99, dir: 0 };
    else if (role === 'scan') { lab.scan = g; g.visible = false; }
    else if (role === 'seccam') lab.seccam = { g, q0: g.quaternion.clone(), yaw: 0, pitch: 0 };
    else if (role === 'doctor') { lab.doctor = g; lab.head = g.getObjectByName('head'); }
  }
  for (const [k, p] of Object.entries(lab.local)) if (p.isVector3) lab.spots[k] = world.toWorld(loc, p.x, p.y, p.z);
  // the supply pad: the game's standard landing pad (world.pad), its stairs toward the plaza; no flights use it (it is not
  // listed in loc.pads, so traffic neither lands there nor rebuilds it)
  const pd = lab.spotData && lab.spotData.pad, pp = lab.local.pad;
  if (pd && pp && world.pad) {
    const rec = world.pad(loc, pp.x, pp.z, pd.r || 10.5, 0xffd23f, false, { face: Math.atan2(pd.fz, pd.fx) });
    if (rec && loc.pads) loc.pads = loc.pads.filter((q) => q !== rec);
  }
  // the camera's rest aim (at the plate): what it turns from to follow you
  if (lab.seccam && lab.spots.plate) {
    const S = lab.seccam, d = S.g.parent.worldToLocal(lab.spots.plate.clone()).sub(S.g.position);
    S.yaw0 = Math.atan2(d.x, d.z); S.el0 = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
  // the robot cell's moving props: the chimera and the welded plate ride the jig; the cell starts on the hoist's hook
  if (lab.jig) {
    const J = lab.jig.g, root = J.parent;
    root.updateMatrixWorld(true);
    const jp = J.getWorldPosition(new THREE.Vector3());
    for (const c of lab.chims) if (c.root.getWorldPosition(_v).distanceTo(jp) < 0.6) J.attach(c.root);
    if (lab.plateweld) J.attach(lab.plateweld);
  }
  if (lab.hoist) {
    const cell = lab.hoist.hook && lab.hoist.hook.getObjectByName('cell');
    if (cell) lab.cell = { g: cell, owner: 'hook', p0: cell.position.clone(), q0: cell.quaternion.clone() };
  }
  if (lab.scanner && lab.scanner.beam) lab.scanner.beam.visible = false;
  // Dr. Zbornak's name over him
  if (lab.doctor) {
    const tag = nameTag(textSprite('DR. ZBORNAK', { color: '#7dff3a', size: 50, scale: 0.35 }), 'DR. ZBORNAK', '#7dff3a');
    tag.position.set(0, 2.85, 0);
    lab.doctor.add(tag);
  }
  // each door's collider: off while it is up (updateGate)
  for (const [k, D] of Object.entries(lab.doors)) {
    const p = lab.local[k + '_door'];
    if (p) { D.col = world.col(loc, { type: 'box', x: p.x, y: p.y, z: p.z, hx: 2.9, hy: 2.95, hz: 0.3, yaw: 0 }); D.colOn = true; }
  }
  // the lift's colliders: each gate's (off while it is up), the car's deck at the top (on only while it is up there; below,
  // the lab's floor holds you)
  if (lab.lift) {
    const c = lab.lift.g.position;
    for (const G of lab.liftGates || []) {
      if (!G) continue;
      G.col = world.col(loc, { type: 'box', x: G.g.position.x, y: G.y0 + 0.6, z: G.g.position.z, hx: 0.1, hy: 0.6, hz: 1.1, yaw: 0, see: true });
      G.colOn = true;
    }
    lab.lift.top = world.col(loc, { type: 'box', x: c.x, y: lab.lift.y0 + lab.lift.travel - 0.06, z: c.z, hx: 1.05, hy: 0.06, hz: 1.05, yaw: 0, see: true });
    world.colliders.remove(lab.lift.top);
  }
  // screens: the drone feeds (pictures), the security screen, LABNET's attract screen, the pen's residents (canvases)
  const feeds = [drone0, drone1, drone2, drone3];
  const loader = new THREE.TextureLoader();
  for (let i = 0; i < 4; i++) {
    const m = lab.screens['drone' + i];
    if (!m) continue;
    const tex = loader.load(feeds[i]);
    tex.colorSpace = THREE.SRGBColorSpace;
    m.material = new THREE.MeshBasicMaterial({ map: tex });
  }
  for (const [sid, w, h] of [['sec', 512, 350], ['lab', 1024, 587], ['pen', 500, 300]]) {
    const m = lab.screens[sid];
    if (!m) continue;
    const s = canvasScreen(w, h);
    m.material = new THREE.MeshBasicMaterial({ map: s.tex });
    lab.screens[sid] = Object.assign(s, { mesh: m });
  }
  // the wall projections (holo0 over the holotable, holo1 over the splice pod, holo2 over the robots): canvases glowing over
  // the projector's blue panel, redrawn a few times a second while you're near (drawHolo)
  for (const sid of ['holo0', 'holo1', 'holo2']) {
    const m = lab.screens[sid];
    if (!m) continue;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox, aspect = (bb.max.x - bb.min.x) / (bb.max.y - bb.min.y);
    const sc = canvasScreen(1024, Math.round(1024 / aspect));
    m.material = new THREE.MeshBasicMaterial({ map: sc.tex, transparent: true, depthWrite: false });
    lab.screens[sid] = Object.assign(sc, { mesh: m });
  }
  lab.holoT = 0;
  lab.drawSec = (state, photo) => drawSecurity(lab.screens.sec, state, photo);
  lab.drawSec('idle');
  // the security camera's snapshot: a small render target, read back into the security screen's canvas
  lab.photo = { rt: new THREE.WebGLRenderTarget(240, 180, { colorSpace: THREE.SRGBColorSpace }), cam: new THREE.PerspectiveCamera(44, 240 / 180, 0.1, 200), px: new Uint8Array(240 * 180 * 4) };
  lab.update = (dt, time, camPos) => updateLab(world, lab, dt, time, camPos);
  return lab;
}

function drawSecurity(s, state, photo) {
  if (!s) return;
  const { g, c, tex } = s, w = c.width, h = c.height;
  g.fillStyle = '#06120a'; g.fillRect(0, 0, w, h);
  const px = w * 0.03, py = h * 0.04, pw = w * 0.52, ph = h * 0.72;
  if (photo) g.drawImage(photo, px, py, pw, ph);
  else { g.fillStyle = '#0b2014'; g.fillRect(px, py, pw, ph); }
  g.strokeStyle = '#7dff3a'; g.lineWidth = 4; g.strokeRect(px + pw * 0.22, py + ph * 0.12, pw * 0.56, ph * 0.56);
  g.textBaseline = 'top';
  const line = (t, y, col, f = 0.06) => { g.font = pixelFont(Math.round(h * f)); g.fillStyle = col; g.fillText(t, w * 0.58, h * y); };
  if (state === 'idle') {
    line('STAND ON', 0.08, '#ffd23f'); line('THE PLATE', 0.18, '#ffd23f'); line('VISITORS', 0.36, '#8dffb4'); line('WILL BE', 0.46, '#8dffb4'); line('PHOTOGRAPHED', 0.56, '#8dffb4', 0.05);
  } else if (state === 'scan') {
    line('SCANNING', 0.08, '#ffd23f'); line('HOLD STILL', 0.2, '#8dffb4'); line('...', 0.34, '#8dffb4');
  } else {
    line('VISITOR', 0.06, '#ffd23f'); line('COURIER', 0.18, '#8dffb4'); line('MATCH 99%', 0.32, '#8dffb4'); line('ZBORNAK:', 0.46, '#c77dff'); line('"OH. YOU."', 0.56, '#c77dff');
  }
  g.fillStyle = state === 'granted' ? '#7dff3a' : state === 'scan' ? '#ffd23f' : '#2a2540';
  g.fillRect(0, h * 0.82, w, h * 0.18);
  g.fillStyle = '#06120a'; g.font = pixelFont(Math.round(h * 0.09)); g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(state === 'granted' ? 'ACCESS GRANTED' : state === 'scan' ? 'SCANNING' : 'ZBORNAK LABORATORIES', w / 2, h * 0.91);
  g.textAlign = 'left';
  scanlines(g, w, h);
  tex.needsUpdate = true;
}

// The courier's picture from the camera on the arm: one render into a small target, read back as a canvas.
function snapshot(world, lab) {
  const game = world.game;
  if (!game || !game.renderer || !lab.local.plate) return null;
  const L = lab.local.plate, P = lab.photo;
  world.toWorld(lab.loc, L.x + 0.25, 2.9, L.z - 2.9, P.cam.position);
  P.cam.up.copy(lab.loc.dir);
  P.cam.lookAt(world.toWorld(lab.loc, L.x, 1.7, L.z, _v));
  const r = game.renderer, prev = r.getRenderTarget();
  r.setRenderTarget(P.rt);
  r.render(world.scene, P.cam);
  r.readRenderTargetPixels(P.rt, 0, 0, 240, 180, P.px);
  r.setRenderTarget(prev);
  const c = document.createElement('canvas');
  c.width = 240; c.height = 180;
  const img = c.getContext('2d').createImageData(240, 180);
  for (let y = 0; y < 180; y++) img.data.set(P.px.subarray((179 - y) * 240 * 4, (180 - y) * 240 * 4), y * 240 * 4);   // (rows come bottom up)
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// one frame of the robot cell: which cycle, where it is in it, the arms by IK, the props (lab.cellNow: { cycle, t })
function updateCell(lab) {
  const ct = lab.t / CYCLE, ci = Math.floor(ct) % CYCLES.length, t = ct % 1, C = CYCLES[ci];
  lab.cellNow = { cycle: ci, name: C.name, t };
  for (const [n, A] of Object.entries(lab.arms)) {
    const phi = track(C.keys[n], t);
    const [bx, bz, by] = ARM_BASES[n];
    const lx = _tp[0] - bx, lz = _tp[2] - bz, c = Math.cos(-by), s = Math.sin(-by);
    const [yaw, sh, el, wr] = armIk(lx * c + lz * s, _tp[1], -lx * s + lz * c, phi, ARM_TOOL[n]);
    A.turret.rotation.y = yaw; A.shoulder.rotation.x = -sh; A.elbow.rotation.x = el; A.wrist.rotation.x = wr;
    if (A.roll) A.roll.rotation.z = n === 'arm1' ? yaw + by : 0;
    if (A.weld) {
      const on = C.weld.some(([a, b]) => t >= a && t <= b);
      A.weld.visible = on && Math.random() > 0.08;
      if (on) A.weld.scale.setScalar(0.75 + Math.random() * 0.5);
    }
    if (A.carry) A.carry.visible = ci === 0 && t >= PICK_T && t < RELEASE_T;
  }
  if (lab.platerack) lab.platerack.visible = ci === 0 && t < PICK_T;
  if (lab.plateweld) lab.plateweld.visible = ci > 0 || t >= RELEASE_T;
  // the jig turns the chimera a full turn while it is scanned
  if (lab.jig) {
    const sp = C.spin, u = sp && t > sp[0] ? Math.min(1, (t - sp[0]) / (sp[1] - sp[0])) : 0;
    lab.jig.g.quaternion.copy(lab.jig.q0).multiply(_ry.setFromAxisAngle(Y, TAU * u * u * (3 - 2 * u)));
  }
  // the hoist: its trolley along the beam, the cable paid out, the hook at its end
  const H = lab.hoist;
  if (H) {
    let x = -2.6, L = 0.1;
    if (C.trolley) { track(C.trolley, t); x = _tp[0]; L = _tp[1]; }
    H.g.position.copy(H.p0).addScaledVector(H.ax, x + 2.6);
    if (H.cable) H.cable.scale.y = L / 0.1;
    if (H.hook) H.hook.position.y = -0.3 - L - 0.15;
  }
  // the power cell: on the hook, in the right arm's grip, seated in the dock (and sinking into it at INSPECT's end)
  const cell = lab.cell;
  if (cell) {
    const owner = ci === 0 ? 'none' : ci === 1 ? (t < C.pick ? 'hook' : t < C.drop ? 'arm' : 'dock') : 'dock';
    if (owner !== cell.owner) {
      const A = lab.arms.arm1;
      if (owner === 'hook' && H && H.hook) { H.hook.add(cell.g); cell.g.position.copy(cell.p0); cell.g.quaternion.copy(cell.q0); }
      else if (owner === 'arm' && A && A.roll) { A.roll.add(cell.g); cell.g.position.copy(A.carry.position); cell.g.quaternion.copy(_rx.setFromAxisAngle(X1, Math.PI / 2)); }
      else if (owner === 'dock' && lab.dock) { lab.dock.add(cell.g); cell.g.quaternion.identity(); }
      cell.owner = owner;
    }
    cell.g.visible = owner !== 'none' && !(ci === 2 && t > 0.99);
    if (owner === 'dock') cell.g.position.set(0, 0.2 - (ci === 2 && t > 0.88 ? 0.5 * Math.min(1, (t - 0.88) / 0.1) : 0), 0);
  }
  // the scanner: in its holder, or in the left arm's grip at INSPECT, its beam on while it sweeps
  const S = lab.scanner;
  if (S) {
    const held = ci === 2 && t >= C.pick && t < C.drop;
    if (held !== !!S.held) {
      const A = lab.arms.arm0;
      if (held && A && A.roll) { A.roll.add(S.g); S.g.position.copy(lab.arms.arm1.carry.position); S.g.quaternion.copy(_rx.setFromAxisAngle(X1, -Math.PI / 2)); }
      else { S.parent.add(S.g); S.g.position.copy(S.p0); S.g.quaternion.copy(S.q0); }
      S.held = held;
    }
    if (S.beam) S.beam.visible = !!(C.beam && t >= C.beam[0] && t <= C.beam[1]);
  }
}

function updateLab(world, lab, dt, time, camPos) {
  const loc = lab.loc;
  if (!loc.active) return;
  const game = world.game, P = game && game.player;
  lab.t += dt;
  // the reactor: core and rings spin, harder after a feed
  const r = world.reactor;
  if (lab.core && r) {
    const k = r.spin + r.flash * 6;
    lab.core.rotation.y += dt * 2.5 * k;
    lab.rings.forEach((g, i) => { g.rotation.x += dt * (1.7 + i) * k; g.rotation.y += dt * (2.1 - i * 0.5) * k; });
    lab.core.scale.setScalar(1 + Math.sin(time * 23) * 0.04 + r.flash * 0.25);
    lab.core.position.y = lab.coreY + Math.sin(time * 0.8) * 0.45 + Math.sin(time * 2.1) * 0.07;   // it bobs in the column
    lab.core.rotation.x = Math.sin(time * 0.6) * 0.07; lab.core.rotation.z = Math.cos(time * 0.5) * 0.07;
    r.flash = Math.max(0, r.flash - dt * 0.8);
    if (world.reactorLight) world.reactorLight.intensity = camPos.distanceTo(lab.reactor) < 90 ? (6 + r.flash * 30) * (0.8 + Math.random() * 0.4) : 0;
  }
  // the robot cell
  const near = camPos.distanceTo(lab.reactor) < 140;
  if (near && lab.arms.arm0) updateCell(lab);
  if (near && (lab.holoT -= dt) <= 0) { lab.holoT = 0.15; drawHolo(world, lab, time); }
  // Dr. Zbornak watches you
  if (lab.head && P) {
    lab.doctor.worldToLocal(_w.copy(P.pos));
    const want = _w.lengthSq() < 30 * 30 ? Math.max(-1.1, Math.min(1.1, Math.atan2(_w.x, _w.z))) : Math.sin(time * 0.3) * 0.4;
    lab.head.rotation.y += (want - lab.head.rotation.y) * Math.min(1, dt * 3);
  }
  // the airlock
  if (P && lab.doors.outer) updateGate(world, lab, P, dt);
  if (P && lab.seccam && lab.seccam.yaw0 !== undefined) updateSecCam(lab, P, dt);
  if (P && lab.lift) updateLift(world, lab, P, dt);
}

// The security camera follows you while you're in front of the lock (within 14 m of the plate), and swings back to the plate
// when you go.
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0), YA = new THREE.Vector3(0, 1, 0);
function updateSecCam(lab, P, dt) {
  const S = lab.seccam, plate = lab.spots.plate;
  let wy = 0, wp = 0;
  if (P.pos.distanceTo(plate) < 14) {
    const d = S.g.parent.worldToLocal(_w.copy(P.pos)).sub(S.g.position);
    d.y += 1.2;                                                                       // (your head, not your feet)
    const dy = Math.atan2(d.x, d.z) - S.yaw0;
    wy = Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(dy), Math.cos(dy))));
    wp = Math.max(-0.5, Math.min(0.5, Math.atan2(d.y, Math.hypot(d.x, d.z)) - S.el0));
  }
  const k = Math.min(1, dt * 4);
  S.yaw += (wy - S.yaw) * k; S.pitch += (wp - S.pitch) * k;
  // turned about the parent's up, then tipped about its own x (+ about x lowers its +z: up is negative)
  S.g.quaternion.copy(_qa.setFromAxisAngle(YA, S.yaw)).multiply(S.q0).multiply(_qb.setFromAxisAngle(XA, -S.pitch));
}

const DOOR_T = 1.6, CYCLE_T = 1.2;     // s for a door to rise or drop; s the tube cycles between one door shutting and the other opening

function updateGate(world, lab, P, dt) {
  const G = lab.gate, O = lab.doors.outer, I = lab.doors.inner, plate = lab.spots.plate;
  const audio = world.game && world.game.audio;
  const lo = lab.local.outer_door, li = lab.local.inner_door;
  const l = lab.loc.group.worldToLocal(_v.copy(P.pos));
  // where you are along the tube's line: outside the outer door, in the tube (or the housing), in the lab
  const lane = Math.abs(l.x - lo.x) < 4.5 && l.y < lo.y + 6;
  const zone = !lane ? 'off' : l.z > lo.z ? 'out' : (!li || l.z > li.z) ? 'tube' : 'lab';
  const dO = Math.abs(l.z - lo.z), dI = li ? Math.abs(l.z - li.z) : 99;
  // the scan: on the plate the camera looks you over and takes your picture, and the outer door is yours
  const onPlate = plate && P.pos.distanceTo(plate) < 1.6;
  if (G.state === 'idle' && onPlate && !G.granted) { G.state = 'scan'; G.t = 0; if (lab.scan) lab.scan.visible = true; lab.drawSec('scan'); }
  if (G.state === 'scan') {
    G.t += dt;
    if (G.t > 1.2 && !G.shot) { G.shot = true; lab.drawSec('granted', snapshot(world, lab)); if (audio && audio.click) audio.click(); }
    if (G.t > 2.0) { G.state = 'idle'; G.shot = false; G.granted = true; if (lab.scan) lab.scan.visible = false; }
  }
  if (G.granted && ((zone === 'tube' && dO > 6) || zone === 'lab' || P.pos.distanceTo(plate) > 18)) { G.granted = false; lab.drawSec('idle'); }
  // what each door wants: the outer one for you granted outside or coming to it in the tube, the inner one for you coming
  // to it from either side; either stays up while you're in its doorway
  O.want = (zone === 'out' && G.granted) || (zone === 'tube' && dO < 6) || (O.open > 0 && lane && dO < 4);
  if (I) I.want = (zone === 'tube' && dI < 6) || (zone === 'lab' && dI < 5) || (I.open > 0 && lane && dI < 4);
  for (const [D, X] of [[O, I], [I, O]]) {
    if (!D) continue;
    const may = !X || (X.open === 0 && X.shut > CYCLE_T);
    if (D.want && X && X.open === 0 && !may && !D.hiss) { D.hiss = true; if (audio && audio.burst) audio.burst(CYCLE_T, 2200, 0.14); }   // the tube cycles
    if (!D.want) D.hiss = false;
    const dir = D.want && may ? 1 : D.open > 0 && !D.want ? -1 : 0;
    if (dir && dir !== D.dir && audio && audio.tone) audio.tone(dir > 0 ? 55 : 80, DOOR_T, 'sawtooth', 0.05, dir > 0 ? 1.6 : 0.6);   // the motor
    D.dir = dir;
    D.open = Math.min(1, Math.max(0, D.open + dir * dt / DOOR_T));
    D.shut = D.open === 0 ? D.shut + dt : 0;
    if (D.col) {
      if (D.open > 0.4 && D.colOn) { world.colliders.remove(D.col); D.colOn = false; }
      else if (D.open < 0.4 && !D.colOn) { world.colliders.add(D.col); D.colOn = true; }
    }
    const e = D.open * D.open * (3 - 2 * D.open);
    D.g.position.y = D.y0 + e * D.travel;
  }
}

// ---- the wall projections, live telemetry: the drone net on a lunar map, the splicer's helix and the save's splice figures,
// the robot cell's cycle, progress and each arm's state
const HC = { cy: '#7fe8ff', lime: '#7dff3a', pink: '#ff4fa3', amber: '#ffd23f', dim: '#2a6f8a', vio: '#c77dff' };
const DRONES = [['D1', 'meridian'], ['D2', 'ilmb'], ['D3', 'vostok'], ['D4', 'kepler']];

function holoText(g, t, x, y, size, col, align = 'left') {
  g.font = pixelFont(Math.round(size)); g.fillStyle = col; g.textAlign = align; g.textBaseline = 'top'; g.fillText(t, x, y); g.textAlign = 'left';
}
function holoFrame(g, w, h, title, sub) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(6,24,44,0.88)'; g.fillRect(0, 0, w, h);                // dark glass, the projection's light on it
  g.strokeStyle = HC.dim; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
  holoText(g, title, 24, 20, h * 0.075, HC.cy);
  if (sub) holoText(g, sub, w - 24, 24, h * 0.05, HC.dim, 'right');
  g.fillStyle = HC.dim; g.fillRect(24, 22 + h * 0.09, w - 48, 2);
}

function drawHolo(world, lab, time) {
  const game = world.game, s0 = lab.screens.holo0, s1 = lab.screens.holo1, s2 = lab.screens.holo2;
  if (s0 && s0.g) { holoSurvey(s0, world, time); s0.tex.needsUpdate = true; }
  if (s1 && s1.g) { holoSplicer(s1, game, time); s1.tex.needsUpdate = true; }
  if (s2 && s2.g) { holoCell(s2, lab, time); s2.tex.needsUpdate = true; }
}

// the drone net on an equirectangular lunar map: every place a dot, the four watched ones ringed, a drone circling each
function holoSurvey(sc, world, time) {
  const { g, c } = sc, w = c.width, h = c.height;
  holoFrame(g, w, h, 'LUNAR SURVEY', null);
  const mx = 24, my = h * 0.2, mw = w * 0.58, mh = h * 0.72;
  g.strokeStyle = HC.dim; g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(mx + mw * i / 8, my); g.lineTo(mx + mw * i / 8, my + mh); g.stroke(); }
  for (let j = 0; j <= 4; j++) { g.beginPath(); g.moveTo(mx, my + mh * j / 4); g.lineTo(mx + mw, my + mh * j / 4); g.stroke(); }
  const at = (d) => [mx + mw * (0.5 + Math.atan2(d.z, d.x) / TAU), my + mh * (0.5 - Math.asin(Math.max(-1, Math.min(1, d.y))) / Math.PI)];
  const locs = (world.locations || []).filter((l) => l.dir);
  for (const l of locs) { const [x, y] = at(l.dir); g.fillStyle = HC.cy; g.fillRect(x - 2, y - 2, 4, 4); }
  const lab = locs.find((l) => l.id === 'antimatter');
  if (lab) { const [x, y] = at(lab.dir); g.strokeStyle = HC.pink; g.lineWidth = 2; g.strokeRect(x - 7, y - 7, 14, 14); holoText(g, 'LAB', x + 10, y - 8, h * 0.045, HC.pink); }
  DRONES.forEach(([id, lid], i) => {
    const l = locs.find((q) => q.id === lid);
    if (!l) return;
    const [x, y] = at(l.dir), a = time * 1.3 + i * 1.7;
    g.strokeStyle = HC.lime; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.stroke();
    g.fillStyle = HC.lime; g.fillRect(x + Math.cos(a) * 12 - 3, y + Math.sin(a) * 12 - 3, 6, 6);
    holoText(g, id, x + 16, y + 4, h * 0.04, HC.lime);
  });
  // the status column
  const tx = mx + mw + 30;
  holoText(g, 'FEEDS 4/4 LIVE', tx, my, h * 0.042, HC.lime);
  DRONES.forEach(([id, lid], i) => {
    const l = locs.find((q) => q.id === lid), y = my + h * 0.11 * (i + 1);
    holoText(g, `${id} ${(l ? l.name : lid).toUpperCase()}`.slice(0, 15), tx, y, h * 0.036, HC.cy);
    holoText(g, `ALT ${Math.round(60 + 8 * Math.sin(time * 0.7 + i))}M SIG ${88 + ((i * 7 + Math.floor(time)) % 11)}%`, tx, y + h * 0.05, h * 0.032, HC.dim);
  });
  holoText(g, `UPLINK ${'|'.repeat(1 + (Math.floor(time * 3) % 6))}`, tx, my + mh - h * 0.05, h * 0.04, HC.amber);
}

// the splicer: a turning double helix with coloured base pairs, the save's splice figures beside it
function holoSplicer(sc, game, time) {
  const { g, c } = sc, w = c.width, h = c.height;
  const A = game && game.alchemy, log = (A && A.log) || {};
  holoFrame(g, w, h, 'GENOME SPLICER', 'SEQ ' + String(Math.floor(time * 37) % 100000).padStart(5, '0'));
  const x0 = 30, x1 = w * 0.6, cy = h * 0.58, amp = h * 0.26, cols = [HC.lime, HC.pink, HC.amber, HC.cy];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, x = x0 + (x1 - x0) * u, a = u * TAU * 2.2 + time * 1.4;
    const ya = cy + Math.sin(a) * amp, yb = cy + Math.sin(a + Math.PI) * amp, front = Math.cos(a) > 0;
    g.strokeStyle = front ? cols[i % 4] : HC.dim; g.lineWidth = front ? 3 : 1.5;
    g.beginPath(); g.moveTo(x, ya); g.lineTo(x, yb); g.stroke();
    g.fillStyle = HC.cy; g.fillRect(x - 3, ya - 3, 6, 6); g.fillStyle = HC.vio; g.fillRect(x - 3, yb - 3, 6, 6);
  }
  const tx = x1 + 30, rows = [
    ['SPLICES', Object.keys(log.splices || {}).length],
    ['MUTATIONS', A ? A.mutations.length : 0],
    ['CHIMERAS', A ? A.chimeras.length : 0],
    ['REACTOR RUNS', Object.keys(log.reactor || {}).length],
  ];
  rows.forEach(([k, v], i) => { holoText(g, k, tx, h * (0.22 + i * 0.13), h * 0.045, HC.dim); holoText(g, String(v), tx, h * (0.27 + i * 0.13), h * 0.06, HC.cy); });
  const st = 0.78 + 0.12 * Math.sin(time * 0.9);
  holoText(g, `STABILITY ${Math.round(st * 100)}%`, tx, h * 0.76, h * 0.045, HC.amber);
  g.strokeStyle = HC.dim; g.strokeRect(tx, h * 0.84, w - tx - 30, h * 0.06);
  g.fillStyle = HC.amber; g.fillRect(tx + 3, h * 0.84 + 3, (w - tx - 36) * st, h * 0.06 - 6);
}

// the robot cell: the cycle running, its progress, the three cycles, each arm's job right now
function holoCell(sc, lab, time) {
  const { g, c } = sc, w = c.width, h = c.height, now = lab.cellNow || { cycle: 0, name: 'WELD', t: 0 };
  holoFrame(g, w, h, 'ROBOTICS CELL', `CYCLE ${Math.floor(lab.t / CYCLE) + 1}`);
  holoText(g, now.name, 30, h * 0.22, h * 0.1, HC.lime);
  g.strokeStyle = HC.dim; g.lineWidth = 2; g.strokeRect(30, h * 0.38, w * 0.55, h * 0.08);
  g.fillStyle = HC.lime; g.fillRect(33, h * 0.38 + 3, (w * 0.55 - 6) * now.t, h * 0.08 - 6);
  CYCLES.forEach((C, i) => holoText(g, `${i === now.cycle ? '>' : ' '} ${i + 1} ${C.name}`, 30, h * (0.54 + i * 0.12), h * 0.05, i === now.cycle ? HC.cy : HC.dim));
  const C = CYCLES[now.cycle], t = now.t, wOn = C.weld.some(([a, b2]) => t >= a && t <= b2);
  const jobs = now.cycle === 0 ? ['CLAMP', 'PLATE', wOn ? 'WELDING' : 'STANDBY'] : now.cycle === 1 ? ['CLAMP', t < 0.33 ? 'REACH' : t < 0.6 ? 'CARRY CELL' : 'PARK', wOn ? 'TACK' : 'STANDBY'] : ['SCAN', 'OBSERVE', 'STANDBY'];
  const tx = w * 0.64;
  ['ARM 0', 'ARM 1', 'WELDER'].forEach((n, i) => {
    holoText(g, n, tx, h * (0.22 + i * 0.22), h * 0.045, HC.dim);
    holoText(g, jobs[i], tx, h * (0.28 + i * 0.22), h * 0.06, i === 2 && wOn ? HC.amber : HC.cy);
  });
}

// The lift to the catwalk: stand on the car a moment and it takes you to the other level, standing (player.seat, stand), and
// lets you off once the gate there is up; come to the shaft at the level it isn't at and it comes for you. A gate (the
// barrier across the shaft's opening at each level) is up only while the car stands at that level, and drops before it
// moves.
const LIFT_T = 4.5, GATE_T = 0.6;     // s to travel; s for a gate to rise or drop
const ease = (t) => t * t * (3 - 2 * t);

function updateLift(world, lab, P, dt) {
  const L = lab.lift, gates = lab.liftGates || [], c = L.g.position, audio = world.game && world.game.audio;
  const l = lab.loc.group.worldToLocal(_v.copy(P.pos));
  const dx = l.x - c.x, dz = l.z - c.z, carY = L.y0 + L.travel * ease(L.pos);
  if (L.rider && P.seat !== L.seat) L.rider = false;                              // (knocked off: a K.O.)
  const onCar = !P.seat && Math.abs(dx) < 0.95 && Math.abs(dz) < 0.95 && Math.abs(l.y - carY) < 0.8;
  const near = (k) => !onCar && !P.seat && Math.abs(l.y - (L.y0 + L.travel * k)) < 1.5 && Math.hypot(dx, dz) < 4;
  const go = (to) => { L.state = 'shut'; L.to = to; };
  if (L.state === 'idle') {
    if (onCar) {
      if (L.armed && (L.dwell += dt) > 0.7) {
        L.g.updateMatrixWorld(true);
        const local = L.g.worldToLocal(P.pos.clone());
        local.y = 0.02;
        P.seat = L.seat = { obj: L.g, local, stand: true };
        L.rider = true;
        go(1 - L.lv);
      }
    } else {
      L.armed = true; L.dwell = 0;
      if (near(1 - L.lv)) go(1 - L.lv);                                           // called from the other level
    }
  } else if (L.state === 'shut') {
    if (!gates[L.lv] || gates[L.lv].open === 0) {
      L.state = 'go';
      if (L.topOn) { world.colliders.remove(L.top); L.topOn = false; }
      if (audio && audio.tone) audio.tone(62, LIFT_T, 'sawtooth', 0.04, 1.25);   // the winding motor
    }
  } else if (L.state === 'go') {
    L.pos = Math.min(1, Math.max(0, L.pos + (L.to ? 1 : -1) * dt / LIFT_T));
    if (L.pos === L.to) {
      L.lv = L.to; L.state = 'open';
      if (L.lv === 1 && !L.topOn) { world.colliders.add(L.top); L.topOn = true; }
      if (audio && audio.tone) audio.tone(880, 0.25, 'triangle', 0.1);
    }
  } else if (L.state === 'open') {
    if (!gates[L.lv] || gates[L.lv].open > 0.6) {
      L.state = 'idle';
      if (L.rider) { P.seat = null; L.rider = false; L.armed = false; }        // off you get (step off and on to go back)
    }
  }
  L.g.position.y = L.y0 + L.travel * ease(L.pos);
  gates.forEach((G, k) => {
    if (!G) return;
    const up = (L.state === 'idle' || L.state === 'open') && L.lv === k;
    G.open = Math.min(1, Math.max(0, G.open + (up ? 1 : -1) * dt / GATE_T));
    if (G.col) {
      if (G.open > 0.5 && G.colOn) { world.colliders.remove(G.col); G.colOn = false; }
      else if (G.open <= 0.5 && !G.colOn) { world.colliders.add(G.col); G.colOn = true; }
    }
    G.g.position.y = G.y0 + G.travel * ease(G.open);
  });
}

// LABNET's attract screen and the pen's residents (repainted by main.js when they change)
export function drawLabScreens(lab, alchemy) {
  const s = lab.screens.lab;
  if (s && s.g) {
    const log = alchemy.log || {};
    const last = log.last || 'NO EXPERIMENTS YET';
    const { g, c } = s, w = c.width, h = c.height;
    drawLines(g, w, h, 'LABNET v3.1 · ZBORNAK', '#7dff3a', ['RESEARCH LOG', '', `SPLICES  ${Object.keys(log.splices || {}).length}`, `REACTOR  ${Object.keys(log.reactor || {}).length}`, `CHIMERAS ${alchemy.chimeras.length}`, '! F: LABNET'], false);
    // the wall display is big: the newest reactor results down the right, the last experiment along the foot
    g.fillStyle = '#1d4a2c'; g.fillRect(w * 0.5, h * 0.21, 3, h * 0.6);
    g.textBaseline = 'top'; g.font = pixelFont(Math.round(h * 0.05));
    g.fillStyle = '#ffd23f'; g.fillText('REACTOR · NEWEST', w * 0.53, h * 0.22);
    const rows = Object.values(log.reactor || {}).sort((x, y) => y.first - x.first).slice(0, 6);
    g.font = pixelFont(Math.round(h * 0.036));                     // (a pixel face: each character as wide as the size)
    rows.forEach((e, i) => {
      g.fillStyle = '#4fa36b'; g.fillText(`#${e.first}`, w * 0.53, h * (0.31 + i * 0.08));
      g.fillStyle = '#8dffb4'; g.fillText(`${e.title}`.slice(0, 16) + (e.times > 1 ? ` x${e.times}` : ''), w * 0.6, h * (0.31 + i * 0.08));
    });
    if (!rows.length) { g.fillStyle = '#4fa36b'; g.fillText('NOTHING THROWN IN YET', w * 0.53, h * 0.31); }
    g.fillStyle = '#ffd23f'; g.font = pixelFont(Math.round(h * 0.05));
    g.fillText(`LAST: ${last}`.slice(0, 33), w * 0.03, h * 0.88);
    scanlines(g, w, h);
    s.tex.needsUpdate = true;
  }
  const p = lab.screens.pen;
  if (p && p.g) {
    const rows = alchemy.chimeras.slice(0, 5).map((c) => `> ${(c.name || 'UNNAMED').toUpperCase()}`.slice(0, 22) + (c.tier ? `  ${c.tier}` : ''));
    drawLines(p.g, p.c.width, p.c.height, `HOLDING PEN · ${alchemy.chimeras.length}`, '#7dff3a', rows.length ? rows : ['NO RESIDENTS', '', '*TWO LIVING THINGS', '*IN THE REACTOR']);
    p.tex.needsUpdate = true;
  }
}
