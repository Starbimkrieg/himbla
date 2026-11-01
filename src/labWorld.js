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
//   outer door rises (its collider goes); 6 m into the tube it drops behind you, the tube cycles (a hiss) and the inner door
//   rises into the portal's wall. Going out, the inner door opens as you come to it and the outer once it has shut. A door
//   opens only once the other has been shut a moment, and never shuts on you in its doorway;
//   the screens: the security screen, LABNET's attract screen (the console; main.js opens LABNET itself, labnet.js), the
//   holding pen's residents (the ranch office), four drone feeds (frames filmed in the game, tools/zbornak-drones.mjs).
// Spots (lab.spots, world positions): plate, outer_door, inner_door, intake (the reactor's intake hatch, where X feeds the jar), reactor,
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
          else k.solidQ(d.hx, d.hy, d.hz, _p.x, _p.y, _p.z, _q.setFromEuler(_e.set(d.rx || 0, d.ry || 0, d.rz || 0, 'ZYX')), { auto: true, ...(d.stick ? { stick: true } : {}) });
        } else if (FIXED.has(role)) bake(kid, Mk);
        else if (role === 'spot') {
          Mk.decompose(_p, _q, _s);
          lab.local[d.spot] = _p.clone();
          lab.local[d.spot + 'Yaw'] = _e.setFromQuaternion(_q, 'YXZ').y;
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
    else if (role === 'core') { lab.core = g; lab.rings = g.children.filter((o) => o.userData.role === 'ring'); }
    else if (role === 'door') lab.doors[g.name.startsWith('inner') ? 'inner' : 'outer'] = { g, y0: g.position.y, travel: g.userData.travel || 5.4, open: 0, shut: 99, dir: 0 };
    else if (role === 'scan') { lab.scan = g; g.visible = false; }
    else if (role === 'doctor') { lab.doctor = g; lab.head = g.getObjectByName('head'); }
  }
  for (const [k, p] of Object.entries(lab.local)) if (p.isVector3) lab.spots[k] = world.toWorld(loc, p.x, p.y, p.z);
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
    r.flash = Math.max(0, r.flash - dt * 0.8);
    if (world.reactorLight) world.reactorLight.intensity = camPos.distanceTo(lab.reactor) < 90 ? (6 + r.flash * 30) * (0.8 + Math.random() * 0.4) : 0;
  }
  // the robot cell
  const near = camPos.distanceTo(lab.reactor) < 140;
  if (near && lab.arms.arm0) {
    const t = (lab.t / CYCLE) % 1;
    for (const [n, A] of Object.entries(lab.arms)) {
      const phi = track(CELL_KEYS[n], t);
      const [bx, bz, by] = ARM_BASES[n];
      const lx = _tp[0] - bx, lz = _tp[2] - bz, c = Math.cos(-by), s = Math.sin(-by);
      const [yaw, sh, el, wr] = armIk(lx * c + lz * s, _tp[1], -lx * s + lz * c, phi, ARM_TOOL[n]);
      A.turret.rotation.y = yaw; A.shoulder.rotation.x = -sh; A.elbow.rotation.x = el; A.wrist.rotation.x = wr;
      if (A.roll) A.roll.rotation.z = n === 'arm1' ? yaw + by : 0;
      if (A.weld) {
        const on = t >= WELD_T[0] && t <= WELD_T[1];
        A.weld.visible = on && Math.random() > 0.08;
        if (on) A.weld.scale.setScalar(0.75 + Math.random() * 0.5);
      }
      if (A.carry) A.carry.visible = t >= PICK_T && t < RELEASE_T;
    }
    if (lab.platerack) lab.platerack.visible = t < PICK_T;
    if (lab.plateweld) lab.plateweld.visible = t >= RELEASE_T;
  }
  // Dr. Zbornak watches you
  if (lab.head && P) {
    lab.doctor.worldToLocal(_w.copy(P.pos));
    const want = _w.lengthSq() < 30 * 30 ? Math.max(-1.1, Math.min(1.1, Math.atan2(_w.x, _w.z))) : Math.sin(time * 0.3) * 0.4;
    lab.head.rotation.y += (want - lab.head.rotation.y) * Math.min(1, dt * 3);
  }
  // the airlock
  if (P && lab.doors.outer) updateGate(world, lab, P, dt);
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
