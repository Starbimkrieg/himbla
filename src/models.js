import * as THREE from 'three';
import { toon, ink, glow } from './toon.js';

function part(geo, mat, x = 0, y = 0, z = 0, outline = 0.05) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) ink(m, outline);
  return m;
}

// The Moon-runner (also used for pirate skaters). Pivot at the feet.
export function makeRunner({
  suit = 0xff4f2e, accent = 0x2ee6ff, helmet = 0xfff4e0, visor = 0x241a5c,
  scarf = 0xffd23f, scale = 1, pirate = false,
} = {}) {
  const root = new THREE.Group();
  // trick pivot sits at the centre of mass so flips rotate around the body, not the feet
  const trick = new THREE.Group();
  trick.position.y = 1.2;
  root.add(trick);
  const body = new THREE.Group();
  body.position.y = -1.2;
  trick.add(body);
  const suitM = toon(suit), dark = toon(0x221d33), helmetM = toon(helmet), accentM = toon(accent);
  const glowM = glow(accent);

  const hip = 0.95;
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.2, hip, 0);
    leg.add(part(new THREE.CapsuleGeometry(0.14, 0.5, 4, 8), suitM, 0, -0.4, 0));
    leg.add(part(new THREE.BoxGeometry(0.28, 0.2, 0.44), dark, 0, -0.84, 0.05));
    const skate = part(new THREE.BoxGeometry(0.24, 0.07, 0.68), glowM, 0, -0.96, 0.05, 0.04);
    leg.add(skate);
    body.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = hip;
  body.add(torso);
  torso.add(part(new THREE.CapsuleGeometry(0.33, 0.42, 4, 10), suitM, 0, 0.5, 0));
  torso.add(part(new THREE.BoxGeometry(0.46, 0.3, 0.2), accentM, 0, 0.6, 0.24, 0.03));
  torso.add(part(new THREE.BoxGeometry(0.56, 0.66, 0.3), dark, 0, 0.58, -0.36));
  const cargoSlot = new THREE.Group();
  cargoSlot.position.set(0, 0.62, -0.72);
  torso.add(cargoSlot);

  const head = new THREE.Group();
  head.position.y = 1.18;
  torso.add(head);
  head.add(part(new THREE.SphereGeometry(0.36, 18, 14), helmetM, 0, 0, 0));
  const visorMesh = part(new THREE.SphereGeometry(0.27, 16, 12), toon(visor), 0, 0.02, 0.17, 0.02);
  visorMesh.scale.set(1.1, 0.75, 0.75);
  head.add(visorMesh);
  head.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.4), dark, 0.22, 0.38, -0.1, 0));
  head.add(part(new THREE.SphereGeometry(0.06, 8, 6), glowM, 0.22, 0.6, -0.1, 0));
  if (pirate) {
    const band = part(new THREE.TorusGeometry(0.34, 0.06, 6, 16), toon(0xd7263d), 0, 0.12, 0, 0.02);
    band.rotation.x = Math.PI / 2;
    head.add(band);
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.45, 0.85, 0);
    arm.add(part(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), suitM, 0, -0.3, 0));
    arm.add(part(new THREE.SphereGeometry(0.13, 8, 6), dark, 0, -0.62, 0, 0.03));
    torso.add(arm);
    arms.push(arm);
  }

  // Comic scarf streaming behind
  const scarfPivot = new THREE.Group();
  scarfPivot.position.set(0, 0.98, -0.2);
  torso.add(scarfPivot);
  const scarfMesh = part(new THREE.BoxGeometry(0.22, 0.04, 1.3), toon(scarf, { side: THREE.DoubleSide }), 0, 0, -0.62, 0.03);
  scarfPivot.add(scarfMesh);
  const collar = part(new THREE.TorusGeometry(0.24, 0.08, 6, 14), toon(scarf), 0, 0, 0.2, 0.03);
  collar.rotation.x = Math.PI / 2;
  scarfPivot.add(collar);

  // helmet lamp lens (the actual light is owned by the player)
  const lamp = part(new THREE.SphereGeometry(0.08, 8, 6), glow(0xfff6a8), 0.26, 0.12, 0.26, 0);
  head.add(lamp);

  root.scale.setScalar(scale);
  return { root, trick, body, bodyBase: -1.2, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], scarf: scarfPivot, cargoSlot, glowM, accent };
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
