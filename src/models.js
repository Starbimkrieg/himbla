import * as THREE from 'three';
import { toon, ink, glow } from './toon.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function part(geo, mat, x = 0, y = 0, z = 0, outline = 0.05) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) ink(m, outline);
  return m;
}

// ---- runner geometry: built once and shared by the player, pirate skaters and story NPCs ----
let RUNNER_GEO = null;
const SCARF_LINK = 0.32, SCARF_N = 4;
const v2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
function runnerGeo() {
  if (RUNNER_GEO) return RUNNER_GEO;
  // a flat ribbon that narrows and ripples towards its tail
  const scarf = new THREE.BoxGeometry(0.22, 0.04, 1.3, 1, 1, 8);
  const sp = scarf.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const t = (0.65 - sp.getZ(i)) / 1.3;
    sp.setX(i, sp.getX(i) * (1 - 0.4 * t));
    sp.setY(i, sp.getY(i) + Math.sin(t * Math.PI * 1.6) * 0.05 * t);
  }
  scarf.computeVertexNormals();
  // the scarf is a chain of links (see ScarfSim); each link a short tapered ribbon from z=0 to z=-L
  const links = [0, 1, 2, 3].map((k) => {
    const g = new THREE.BoxGeometry(0.22 * (1 - k * 0.1), 0.035, SCARF_LINK + 0.04, 1, 1, 2).translate(0, 0, -SCARF_LINK / 2);
    return g;
  });
  RUNNER_GEO = {
    scarfLinks: links,
    // one smooth lathe per limb: hip/thigh/knee/calf/ankle, shoulder/bicep/elbow/forearm/wrist
    leg: new THREE.LatheGeometry(v2([[0, -0.8], [0.085, -0.79], [0.105, -0.72], [0.118, -0.62], [0.122, -0.54], [0.11, -0.45], [0.124, -0.36], [0.145, -0.2], [0.155, -0.06], [0.14, 0.04], [0.09, 0.1], [0, 0.12]]), 10),
    arm: new THREE.LatheGeometry(v2([[0, -0.56], [0.075, -0.55], [0.086, -0.48], [0.096, -0.4], [0.087, -0.3], [0.1, -0.22], [0.114, -0.1], [0.12, 0], [0.1, 0.08], [0, 0.12]]), 10),
    // pelvis, hips, waist, ribs, chest, shoulders, neck (flattened front-to-back by the mesh)
    torso: new THREE.LatheGeometry(v2([[0, -0.02], [0.16, -0.01], [0.25, 0.04], [0.29, 0.14], [0.255, 0.32], [0.29, 0.5], [0.34, 0.68], [0.335, 0.8], [0.29, 0.92], [0.2, 1.0], [0.14, 1.05], [0, 1.07]]), 16),
    kneePad: new THREE.SphereGeometry(0.08, 8, 6),
    boot: new RoundedBoxGeometry(0.27, 0.19, 0.44, 2, 0.08),
    cuff: new THREE.CylinderGeometry(0.13, 0.135, 0.08, 12),
    chassis: new RoundedBoxGeometry(0.21, 0.045, 0.6, 1, 0.02),
    rail: new THREE.CapsuleGeometry(0.032, 0.62, 3, 8).rotateX(Math.PI / 2),
    belt: new THREE.TorusGeometry(0.262, 0.042, 6, 20).rotateX(Math.PI / 2),
    buckle: new RoundedBoxGeometry(0.15, 0.1, 0.05, 1, 0.02),
    plate: new RoundedBoxGeometry(0.42, 0.28, 0.1, 2, 0.04),
    lightDot: new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10).rotateX(Math.PI / 2),
    pack: new RoundedBoxGeometry(0.52, 0.62, 0.26, 2, 0.08),
    packLid: new RoundedBoxGeometry(0.4, 0.06, 0.04, 1, 0.015),
    nozzle: new THREE.CylinderGeometry(0.075, 0.1, 0.16, 10),
    flame: new THREE.CylinderGeometry(0.065, 0.065, 0.02, 10),
    shoulder: new THREE.SphereGeometry(0.15, 12, 8),
    wristCuff: new THREE.CylinderGeometry(0.1, 0.095, 0.07, 10),
    glove: new THREE.SphereGeometry(0.12, 10, 8),
    thumb: new THREE.SphereGeometry(0.05, 6, 5),
    helmet: new THREE.SphereGeometry(0.36, 20, 16),
    visorFrame: new THREE.SphereGeometry(0.37, 20, 10, Math.PI / 2 - 0.95, 1.9, 0.86, 1.22),
    visor: new THREE.SphereGeometry(0.38, 20, 10, Math.PI / 2 - 0.85, 1.7, 0.94, 1.06),
    glint: new THREE.SphereGeometry(0.05, 8, 6),
    pod: new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14).rotateZ(Math.PI / 2),
    rim: new THREE.TorusGeometry(0.275, 0.035, 6, 22).rotateX(Math.PI / 2),
    antenna: new THREE.CylinderGeometry(0.02, 0.02, 0.4),
    bead: new THREE.SphereGeometry(0.06, 8, 6),
    lampHousing: new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10).rotateX(Math.PI / 2),
    lens: new THREE.SphereGeometry(0.05, 8, 6),
    band: new THREE.TorusGeometry(0.34, 0.06, 6, 16).rotateX(Math.PI / 2),
    scarf,
    collar: new THREE.TorusGeometry(0.235, 0.07, 6, 16).rotateX(Math.PI / 2),
  };
  return RUNNER_GEO;
}
const GLINT_M = new THREE.MeshBasicMaterial({ color: 0xffffff });
const LENS_M = new THREE.MeshBasicMaterial({ color: 0xfff6a8 });

// The Moon-runner (also used for pirate skaters and story NPCs). Pivot at the feet.
// Smooth lathed limbs and torso, rounded boots/gloves/backpack and a shelled visor, but the
// same pivots (legL/legR at the hips, armL/armR at the shoulders, head on the torso) and
// dimensions as always, because cosmetics, mutations, cargo and story props hang off them.
// The scarf is a little chain of links simulated in the torso's frame (side view, the y-z plane):
// gravity pulls it down, the airflow from moving pushes it back, body acceleration makes it swing,
// neighbouring links pull on each other, and it drapes over whatever is on your back (the pack, a
// cargo crate, a cape) instead of passing through it. phi = angle of a link: 0 = straight back,
// -PI/2 = hanging straight down, positive = streaming up.
const _sq = new THREE.Quaternion(), _sg = new THREE.Vector3(), _sw = new THREE.Vector3(), _sa = new THREE.Vector3();
export class ScarfSim {
  constructor(model) {
    this.m = model;
    this.phi = new Array(SCARF_N).fill(-1.2);
    this.w = new Array(SCARF_N).fill(0);
    this.prevVel = null;
    this.t = Math.random() * 10;
  }

  // vel: the body's world velocity; up: world up at the body; back: how far behind the spine the
  // back gear reaches (pack 0.55, cape 0.62, crate 1.14), top: the height of its top edge
  update(dt, vel, up, { back = 0.55, top = 0.96 } = {}) {
    if (dt <= 0) return;
    const m = this.m;
    const links = m.scarf.userData.links;
    if (!links) return;
    this.t += dt;
    m.torso.getWorldQuaternion(_sq).invert();
    // forces in the torso frame
    _sg.copy(up).multiplyScalar(-6).applyQuaternion(_sq); // gravity (stylised: the Moon's is too lazy to read)
    _sw.copy(vel).negate().applyQuaternion(_sq); // relative wind
    const ws = _sw.length();
    _sw.multiplyScalar(0.08 * ws);
    if (this.prevVel) _sa.copy(vel).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3)).negate().multiplyScalar(0.12).applyQuaternion(_sq);
    else _sa.set(0, 0, 0);
    this.prevVel = (this.prevVel || new THREE.Vector3()).copy(vel);
    const fy = _sg.y + _sw.y + _sa.y, fz = _sg.z + _sw.z + _sa.z;
    const flutter = Math.min(1, ws / 15) * 0.25;
    const steps = Math.min(6, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      let y = 1.04, z = -0.26; // pivot in torso space
      for (let k = 0; k < SCARF_N; k++) {
        // the link wants to point along the net force; neighbours stiffen the chain a little
        let target = Math.atan2(fy, -fz) + Math.sin(this.t * 9 - k * 1.3) * flutter * (k + 1) / SCARF_N;
        const prev = k ? this.phi[k - 1] : target;
        const acc = 70 * wrapAngle(target - this.phi[k]) + 40 * wrapAngle(prev - this.phi[k]) - 9 * this.w[k];
        this.w[k] += acc * h;
        this.phi[k] += this.w[k] * h;
        // never fold over the head or through the body
        if (this.phi[k] > 1.1) { this.phi[k] = 1.1; this.w[k] = Math.min(0, this.w[k]); }
        if (this.phi[k] < -1.65) { this.phi[k] = -1.65; this.w[k] = Math.max(0, this.w[k]); }
        // drape over the back gear: a link starting above its top edge or alongside it must end
        // behind its back face
        if (y > 0.2) {
          const cmin = (z + back) / SCARF_LINK; // cos(phi) must be at least this
          if (cmin >= 1) { if (this.phi[k] < 0) { this.phi[k] = 0; this.w[k] = Math.max(0, this.w[k]); } }
          else if (cmin > -1 && Math.cos(this.phi[k]) < cmin && this.phi[k] < 0) { this.phi[k] = -Math.acos(cmin); this.w[k] = Math.max(0, this.w[k]); }
        }
        y += Math.sin(this.phi[k]) * SCARF_LINK;
        z -= Math.cos(this.phi[k]) * SCARF_LINK;
        if (y < top && z > -back) { y = top; } // (approximate: keeps later links from tunnelling)
      }
    }
    // write the chain: each joint's rotation is relative to its parent link
    let acc = 0;
    for (let k = 0; k < SCARF_N; k++) { links[k].rotation.x = this.phi[k] - acc; acc = this.phi[k]; }
    m.scarf.rotation.y = Math.sin(this.t * 2.3) * 0.12 * Math.min(1, ws / 10);
  }
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function makeRunner({
  suit = 0xff4f2e, accent = 0x2ee6ff, helmet = 0xfff4e0, visor = 0x241a5c,
  scarf = 0xffd23f, scale = 1, pirate = false, own = false,
} = {}) {
  const G = runnerGeo();
  const root = new THREE.Group();
  // trick pivot sits at the centre of mass so flips rotate around the body, not the feet
  const trick = new THREE.Group();
  trick.position.y = 1.2;
  root.add(trick);
  const body = new THREE.Group();
  body.position.y = -1.2;
  trick.add(body);
  // `own` gives this runner private materials so it can be recoloured (the player's wardrobe)
  const mk = (c) => (own ? toon(c, {}) : toon(c));
  const suitM = mk(suit), dark = toon(0x221d33), metal = toon(0x3a3550), helmetM = mk(helmet), accentM = mk(accent);
  const glowM = glow(accent);
  const skateM = own ? glow(accent) : glowM;
  const visorM = mk(visor), scarfM = toon(scarf, { side: THREE.DoubleSide }), collarM = mk(scarf);

  const hip = 0.95;
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.2, hip, 0);
    leg.add(part(G.leg, suitM, 0, 0, 0, 0.045));
    const pad = part(G.kneePad, metal, 0, -0.45, 0.095, 0.02);
    pad.scale.set(1.15, 1, 0.6);
    leg.add(pad);
    leg.add(part(G.cuff, accentM, 0, -0.73, 0.01, 0.025));
    leg.add(part(G.boot, dark, 0, -0.83, 0.07, 0.04));
    leg.add(part(G.chassis, metal, 0, -0.935, 0.07, 0.02));
    const rail = part(G.rail, skateM, 0, -0.972, 0.07, 0.025);
    rail.scale.x = 1.6;
    leg.add(rail);
    body.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = hip;
  body.add(torso);
  const trunk = part(G.torso, suitM, 0, 0, 0, 0.04);
  trunk.scale.z = 0.78;
  torso.add(trunk);
  const belt = part(G.belt, dark, 0, 0.3, 0, 0.02);
  belt.scale.z = 0.8;
  torso.add(belt);
  torso.add(part(G.buckle, accentM, 0, 0.3, 0.215, 0.02));
  const plate = part(G.plate, accentM, 0, 0.64, 0.235, 0.03);
  plate.rotation.x = -0.06;
  torso.add(plate);
  torso.add(part(G.lightDot, glowM, 0.11, 0.67, 0.29, 0));
  // backpack: rounded shell, a lid strip and two thruster nozzles with glowing throats
  torso.add(part(G.pack, dark, 0, 0.6, -0.35, 0.045));
  torso.add(part(G.packLid, accentM, 0, 0.78, -0.48, 0.015));
  for (const side of [-1, 1]) {
    torso.add(part(G.nozzle, metal, side * 0.14, 0.24, -0.38, 0.025));
    torso.add(part(G.flame, glowM, side * 0.14, 0.155, -0.38, 0));
  }
  const cargoSlot = new THREE.Group();
  cargoSlot.position.set(0, 0.62, -0.72);
  torso.add(cargoSlot);

  const head = new THREE.Group();
  head.position.y = 1.18;
  torso.add(head);
  head.add(part(G.helmet, helmetM, 0, 0, 0, 0.05));
  head.add(part(G.visorFrame, dark, 0, 0, 0, 0));
  head.add(part(G.visor, visorM, 0, 0, 0, 0));
  const glint = part(G.glint, GLINT_M, -0.13, 0.13, 0.33, 0);
  glint.scale.set(1.3, 0.55, 0.35);
  glint.rotation.set(-0.35, -0.35, 0.5);
  glint.castShadow = false;
  head.add(glint);
  for (const side of [-1, 1]) head.add(part(G.pod, accentM, side * 0.352, -0.01, -0.03, 0.02));
  head.add(part(G.rim, dark, 0, -0.215, 0, 0.02));
  head.add(part(G.antenna, dark, 0.22, 0.38, -0.1, 0));
  head.add(part(G.bead, glowM, 0.22, 0.6, -0.1, 0));
  if (pirate) head.add(part(G.band, toon(0xd7263d), 0, 0.12, 0, 0.02));

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.45, 0.85, 0);
    arm.add(part(G.arm, suitM, 0, 0, 0, 0.04));
    arm.add(part(G.shoulder, helmetM, side * 0.01, 0.0, 0, 0.03));
    arm.add(part(G.wristCuff, accentM, 0, -0.52, 0, 0.02));
    const glove = part(G.glove, dark, 0, -0.63, 0.01, 0.03);
    glove.scale.set(0.95, 1.15, 0.85);
    arm.add(glove);
    arm.add(part(G.thumb, dark, -side * 0.05, -0.6, 0.08, 0.02));
    torso.add(arm);
    arms.push(arm);
  }

  // Comic scarf streaming behind. The tail leaves from the top of the backpack and is kept above
  // everything worn on the back (pack, cargo crate, jar, cape): see ScarfSim.
  torso.add(part(G.collar, collarM, 0, 0.98, 0, 0.03));
  const scarfPivot = new THREE.Group();
  scarfPivot.position.set(0, 1.04, -0.26);
  torso.add(scarfPivot);
  // a chain of links: each joint is a child group of the previous link, rotated about x
  const scarfLinks = [];
  let parentLink = scarfPivot;
  for (let k = 0; k < SCARF_N; k++) {
    const j = new THREE.Group();
    if (k) j.position.z = -SCARF_LINK;
    j.add(part(G.scarfLinks[k], scarfM, 0, 0, 0, 0.025));
    parentLink.add(j);
    scarfLinks.push(j);
    parentLink = j;
  }
  scarfPivot.userData.links = scarfLinks;
  // resting drape (for figures nobody simulates): over the pack's top edge, then straight down
  [-0.45, -1.05, -0.05, -0.05].forEach((r, k) => { scarfLinks[k].rotation.x = r; });

  // helmet lamp on the right temple (the actual light is owned by the player)
  head.add(part(G.lampHousing, dark, 0.3, 0.15, 0.17, 0.015));
  head.add(part(G.lens, LENS_M, 0.3, 0.15, 0.225, 0));

  root.scale.setScalar(scale);
  return { root, trick, body, bodyBase: -1.2, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], scarf: scarfPivot, cargoSlot, glowM, accent, mats: { suit: suitM, accent: accentM, helmet: helmetM, visor: visorM, scarf: scarfM, collar: collarM, glow: glowM, skate: skateM } };
}

// Cheap NPC figure for ambient life.
export function makeFigure({ suit = 0xffffff, helmet = 0xfff4e0, visor = 0x241a5c, scale = 1 } = {}) {
  const root = new THREE.Group();
  const suitM = toon(suit);
  const body = part(new THREE.CapsuleGeometry(0.32, 0.6, 3, 8), suitM, 0, 1.2, 0, 0.05);
  root.add(body);
  root.add(part(new THREE.SphereGeometry(0.34, 12, 10), toon(helmet), 0, 2.0, 0, 0.05));
  const v = part(new THREE.SphereGeometry(0.24, 10, 8), toon(visor), 0, 2.02, 0.16, 0);
  v.scale.set(1.1, 0.75, 0.75);
  root.add(v);
  const legL = part(new THREE.BoxGeometry(0.22, 0.7, 0.24), suitM, -0.16, 0.38, 0, 0);
  const legR = part(new THREE.BoxGeometry(0.22, 0.7, 0.24), suitM, 0.16, 0.38, 0, 0);
  root.add(legL, legR);
  root.add(part(new THREE.BoxGeometry(0.5, 0.55, 0.26), toon(0x3a3550), 0, 1.3, -0.36, 0));
  root.scale.setScalar(scale);
  return { root, legL, legR };
}

export function makeRover({ color = 0x7b2ff7, trim = 0xffd23f, pirate = true, flag = 0x111111 } = {}) {
  const root = new THREE.Group();
  const bodyM = toon(color), trimM = toon(trim), dark = toon(0x1d1a29);
  const chassis = new THREE.Group();
  root.add(chassis);
  chassis.add(part(new THREE.BoxGeometry(3.2, 1.0, 5.2), bodyM, 0, 1.4, 0, 0.08));
  chassis.add(part(new THREE.BoxGeometry(2.4, 1.0, 2.0), trimM, 0, 2.3, -0.6, 0.08));
  chassis.add(part(new THREE.BoxGeometry(2.0, 0.5, 0.6), glow(0xfff6a8), 0, 1.5, 2.65, 0.04));
  // roll cage
  for (const sx of [-1, 1]) chassis.add(part(new THREE.CylinderGeometry(0.08, 0.08, 1.8), dark, sx * 1.1, 3.0, 0.6, 0.03));
  const gun = new THREE.Group();
  gun.position.set(0, 3.0, 0.8);
  gun.add(part(new THREE.BoxGeometry(0.8, 0.6, 0.8), dark, 0, 0, 0, 0.05));
  gun.add(part(new THREE.CylinderGeometry(0.12, 0.12, 2.0).rotateX(Math.PI / 2), dark, 0, 0.05, 1.1, 0.04));
  chassis.add(gun);
  const pole = part(new THREE.CylinderGeometry(0.05, 0.05, 3), dark, -1.2, 3.6, -2.2, 0.02);
  chassis.add(pole);
  const flagM = toon(flag, { side: THREE.DoubleSide });
  chassis.add(part(new THREE.PlaneGeometry(1.4, 0.9), flagM, -1.9, 4.6, -2.2, 0));
  if (pirate) chassis.add(part(new THREE.SphereGeometry(0.22, 8, 6), toon(0xffffff), -1.9, 4.65, -2.17, 0));
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = part(new THREE.CylinderGeometry(0.85, 0.85, 0.7, 12).rotateZ(Math.PI / 2), dark, sx * 1.85, 0.85, sz * 1.8, 0.05);
    root.add(w);
    wheels.push(w);
  }
  return { root, chassis, gun, wheels };
}

export function makeShuttle({ color = 0xfff4e0, stripe = 0x2ec4ff } = {}) {
  const root = new THREE.Group();
  const hull = part(new THREE.CapsuleGeometry(2.4, 9, 6, 14).rotateX(Math.PI / 2), toon(color), 0, 0, 0, 0.12);
  root.add(hull);
  const band = part(new THREE.CylinderGeometry(2.48, 2.48, 1.2, 14).rotateX(Math.PI / 2), toon(stripe), 0, 0, 1, 0);
  root.add(band);
  root.add(part(new THREE.BoxGeometry(3.6, 0.8, 5).translate(0, 0.9, 3), glow(0x9be7ff), 0, 0, 0, 0.06));
  for (const sx of [-1, 1]) {
    root.add(part(new THREE.BoxGeometry(4, 0.4, 2.4), toon(stripe), sx * 3.6, -0.6, -2, 0.08));
    root.add(part(new THREE.CylinderGeometry(0.7, 0.9, 1.6, 10), glow(0xff9f1c), sx * 5.2, -1.4, -2, 0.05));
  }
  return { root };
}

export function makeTurret({ color = 0x2b59c3 } = {}) {
  const root = new THREE.Group();
  root.add(part(new THREE.CylinderGeometry(1.6, 2.2, 2.4, 10), toon(0x4a4660), 0, 1.2, 0, 0.08));
  const head = new THREE.Group();
  head.position.y = 3.1;
  root.add(head);
  head.add(part(new THREE.BoxGeometry(2.4, 1.4, 2.4), toon(color), 0, 0, 0, 0.08));
  const lens = part(new THREE.SphereGeometry(0.35, 8, 6), glow(0xff2a4a), 0, 0.2, 1.2, 0);
  head.add(lens);
  for (const sx of [-0.5, 0.5]) head.add(part(new THREE.CylinderGeometry(0.16, 0.16, 2.6).rotateX(Math.PI / 2), toon(0x1d1a29), sx, -0.1, 1.8, 0.04));
  return { root, head };
}

export function makeCrate(color = 0xffd23f, size = 0.9) {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(size, size * 0.8, size), toon(color), 0, 0, 0, 0.05));
  g.add(part(new THREE.BoxGeometry(size * 1.04, size * 0.18, size * 1.04), toon(0x1d1a29), 0, 0, 0, 0));
  g.add(part(new THREE.SphereGeometry(size * 0.12, 6, 4), glow(0x2ee6ff), 0, size * 0.45, 0, 0));
  return g;
}

export function makeDish(size = 10, color = 0xf5f5f5) {
  const root = new THREE.Group();
  root.add(part(new THREE.CylinderGeometry(size * 0.12, size * 0.2, size * 0.9, 10), toon(0x6b6880), 0, size * 0.45, 0, 0.1));
  const yaw = new THREE.Group();
  yaw.position.y = size * 0.95;
  root.add(yaw);
  const tilt = new THREE.Group();
  yaw.add(tilt);
  tilt.rotation.x = -0.7;
  const r = size * 0.6;
  const dish = part(new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, Math.PI - 0.9, 0.9), toon(color, { side: THREE.DoubleSide }), 0, r, 0, 0.12);
  tilt.add(dish);
  tilt.add(part(new THREE.CylinderGeometry(size * 0.03, size * 0.03, r * 0.9), toon(0x333344), 0, r * 0.45, 0, 0.04));
  tilt.add(part(new THREE.SphereGeometry(size * 0.06, 8, 6), glow(0xff2e88), 0, r * 0.9, 0, 0));
  return { root, yaw, tilt };
}

// --- traffic of all sizes ---

export function makeHoverCar({ color = 0xff7ad9, trim = 0xfff4e0 } = {}) {
  const root = new THREE.Group();
  root.add(part(new THREE.CapsuleGeometry(1.1, 2.6, 4, 10).rotateX(Math.PI / 2), toon(color), 0, 0, 0, 0.08));
  root.add(part(new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x9be7ff), 0, 0.5, 0.2, 0.05));
  for (const sx of [-1, 1]) root.add(part(new THREE.CylinderGeometry(0.45, 0.6, 0.4, 10), glow(0x2ee6ff), sx * 1.1, -0.9, 0, 0.04));
  root.add(part(new THREE.BoxGeometry(2.6, 0.2, 0.6), toon(trim), 0, -0.2, -1.8, 0.04));
  return { root, size: 3 };
}

export function makeFreighter({ color = 0xb8b4c8, stripe = 0xff9f1c } = {}) {
  const root = new THREE.Group();
  const hullM = toon(color), stripeM = toon(stripe), dark = toon(0x2a2540);
  root.add(part(new THREE.BoxGeometry(14, 10, 46), hullM, 0, 0, 0, 0.3));
  root.add(part(new THREE.CylinderGeometry(6, 8, 12, 12).rotateX(Math.PI / 2), hullM, 0, 1, 28, 0.3));
  root.add(part(new THREE.BoxGeometry(8, 4, 8), toon(0x9be7ff), 0, 4, 30, 0.15));
  root.add(part(new THREE.BoxGeometry(14.4, 2, 46.4), stripeM, 0, -1, 0, 0));
  // cargo pods
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) root.add(part(new THREE.BoxGeometry(5, 5, 7), toon([0xffd23f, 0x2ec4ff, 0xff3b5c, 0x7dff6a][i]), sx * 10, -2, -14 + i * 9, 0.15));
  for (const sx of [-1, 1]) {
    root.add(part(new THREE.BoxGeometry(14, 1.2, 10), dark, sx * 13, 3, -10, 0.15));
    root.add(part(new THREE.CylinderGeometry(3, 3.6, 7, 12).rotateX(Math.PI / 2), dark, sx * 6, 0, -26, 0.2));
    root.add(part(new THREE.CylinderGeometry(2.4, 2.4, 1, 12).rotateX(Math.PI / 2), glow(0xff9f1c), sx * 6, 0, -30, 0));
  }
  // nav lights so they read in the dark
  root.add(part(new THREE.SphereGeometry(0.8, 8, 6), glow(0xff2a4a), -20, 3, -10, 0));
  root.add(part(new THREE.SphereGeometry(0.8, 8, 6), glow(0x7dff6a), 20, 3, -10, 0));
  return { root, size: 30 };
}

export function makeRocket({ color = 0xfff4e0, stripe = 0xff4f2e } = {}) {
  const root = new THREE.Group();
  const bodyM = toon(color), stripeM = toon(stripe);
  root.add(part(new THREE.CylinderGeometry(4, 4.4, 30, 18), bodyM, 0, 19, 0, 0.25));
  root.add(part(new THREE.ConeGeometry(4, 10, 18), stripeM, 0, 39, 0, 0.25));
  root.add(part(new THREE.CylinderGeometry(4.45, 4.45, 3, 18), stripeM, 0, 22, 0, 0));
  root.add(part(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 12).rotateX(Math.PI / 2), toon(0x9be7ff), 0, 30, 4.3, 0.05));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = part(new THREE.BoxGeometry(0.6, 9, 5), stripeM, Math.cos(a) * 5, 6, Math.sin(a) * 5, 0.1);
    fin.rotation.y = -a;
    root.add(fin);
    const leg = part(new THREE.CylinderGeometry(0.3, 0.3, 6), toon(0x4a4660), Math.cos(a + 0.78) * 5.5, 2.5, Math.sin(a + 0.78) * 5.5, 0.05);
    root.add(leg);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(3.2, 14, 14, 1, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false }));
  flame.position.y = -4;
  const core = new THREE.Mesh(new THREE.ConeGeometry(1.8, 9, 12, 1, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  core.position.y = -2;
  root.add(flame, core);
  return { root, flame, core };
}

// Pirate den signal pylon: destructible heart of a den.
export function makePylon() {
  const root = new THREE.Group();
  root.add(part(new THREE.CylinderGeometry(2.6, 3.4, 3, 8), toon(0x3a2b4f), 0, 1.5, 0, 0.1));
  root.add(part(new THREE.CylinderGeometry(0.6, 1.2, 10, 6), toon(0x6b5a3a), 0, 8, 0, 0.08));
  for (const s of [-1, 1]) root.add(part(new THREE.BoxGeometry(6, 0.5, 0.5), toon(0x8a4b2a), 0, 9 + s * 2, 0, 0.04));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), glow(0x7dff3a));
  orb.position.y = 14;
  root.add(orb);
  const flag = part(new THREE.PlaneGeometry(3, 2), toon(0x111111, { side: THREE.DoubleSide }), 1.6, 11, 0, 0);
  root.add(flag);
  return { root, orb };
}

// Seismograph tripod for survey events.
export function makeSeismo() {
  const root = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = part(new THREE.CylinderGeometry(0.08, 0.08, 2.6), toon(0x3a3550), Math.cos(a) * 0.7, 1.1, Math.sin(a) * 0.7, 0.03);
    leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    root.add(leg);
  }
  root.add(part(new THREE.BoxGeometry(1.2, 0.8, 1.2), toon(0x2ec4ff), 0, 2.4, 0, 0.05));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), glow(0x7dff6a));
  light.position.y = 3;
  root.add(light);
  return { root, light };
}

// Vacuum tube for black-lake fluid (carried on the back).
export function makeTube() {
  const root = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.35 }));
  root.add(glass);
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 12), new THREE.MeshBasicMaterial({ color: 0x2a1f4f }));
  root.add(fluid);
  for (const s of [-1, 1]) root.add(part(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 12), toon(0x3a3550), 0, s * 0.58, 0, 0.03));
  root.rotation.z = Math.PI / 2;
  return { root, fluid };
}
