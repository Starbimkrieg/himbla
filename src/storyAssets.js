// Story-mission assets: who the troops are (per faction), the three faction war machines that
// stand in as chapter bosses, the props a chapter plants (relay masts, generators, the Black Sun
// reactor, charges, sensor pylons, ballot stands, phase emitters) and the outposts you found.
// Everything is kit-built (outpostModels.js) like the settlements, so it reads as the same world.
import * as THREE from 'three';
import { Kit, T, G, D, GLASS, BEAM, crate, sandbags } from './outpostModels.js';
import { rWheel, makeTurret } from './models.js';
import { habDome, cabin, lattice, quonset } from './settlements.js';

const DK = 0x1d1a29, ST = 0x55607a, LT = 0xd8d4e8, CONC = 0x8a8698, CREAM = 0xfff4e0, WARM = 0xfff6a8;
const cache = new Map();
// a kit build, made once per key and cloned after that
function bake(key, fn, color = 0xffd23f) {
  let r = cache.get(key);
  if (!r) {
    const k = new Kit(color, 7, false);
    fn(k);
    r = k.finish();
    cache.set(key, r);
  }
  return r;
}
const bakedRoot = (key, fn, color) => bake(key, fn, color).root.clone();

// ---------------------------------------------------------------------------------------------
// Troops: what a faction's soldiers wear and drive, and what their shots look like.
// ---------------------------------------------------------------------------------------------
export const FOES = {
  rustmoon: { label: 'PIRATES!', shot: 0x7dff3a, glow: 0x7dff3a, look: { suit: 0x3a2b4f, accent: 0x7dff3a, helmet: 0x2b2b2b, visor: 0x7dff3a, scarf: 0xd7263d, pirate: true }, rover: null },
  spacecom: { label: 'SPACECOM TROOPS!', shot: 0x2ee6ff, glow: 0xffd23f, look: { suit: 0xf4f1ff, accent: 0xffd23f, helmet: 0xf4f1ff, visor: 0x2ec4ff, scarf: 0x2ec4ff }, rover: { color: 0xe8e6f2, trim: 0xffd23f, flag: 0x2ec4ff } },
  vostok: { label: 'VOSTOK TROOPS!', shot: 0xff3b5c, glow: 0xff3b5c, look: { suit: 0x6b6f78, accent: 0xff3b5c, helmet: 0x8a8f99, visor: 0x111111, scarf: 0xff3b5c }, rover: { color: 0x5a6340, trim: 0xff3b5c, flag: 0xff3b5c } },
  daedalus: { label: 'DAEDALUS SECURITY!', shot: 0xc77dff, glow: 0xff2e88, look: { suit: 0x1a1426, accent: 0xff2e88, helmet: 0xeeeaf8, visor: 0xc77dff, scarf: 0xc77dff }, rover: { color: 0x2a2440, trim: 0xc77dff, flag: 0xff2e88 } },
  meridian: { label: 'MERIDIAN SECURITY!', shot: 0x2ec4ff, glow: 0x2ec4ff, look: { suit: 0x22304a, accent: 0x2ec4ff, helmet: 0xffc83a, visor: 0x1a1030, scarf: 0x2ec4ff }, rover: { color: 0xd8d4e8, trim: 0x2ec4ff, flag: 0x2ec4ff } },
  kepler: { label: 'KEPLER MILITIA!', shot: 0xff9f1c, glow: 0x7dff6a, look: { suit: 0x7a4a2a, accent: 0x7dff6a, helmet: 0xfff4e0, visor: 0x2b8f4a, scarf: 0xff9f1c }, rover: { color: 0x7dff6a, trim: 0xff9f1c, flag: 0xff9f1c, civil: true } },
};

// ---------------------------------------------------------------------------------------------
// Bosses. Each returns the rover layout the AI drives ({ root, chassis, gun, wheels }), plus a
// radius and a ride height for its centre.
// ---------------------------------------------------------------------------------------------

// SPACECOM armoured hauler: the lead truck of the night convoy. Three axles, an armoured cab, a
// long cargo module with the SPACECOM band, a twin-cannon turret on the roof.
export function makeConvoyRig() {
  const W = 0xeeecf6, Y = 0xffd23f, B = 0x2ec4ff;
  const root = new THREE.Group(), chassis = new THREE.Group();
  root.add(chassis);
  chassis.add(bakedRoot('boss|convoy', (k) => {
    k.box(3.4, 0.6, 11.2, T(DK), 0, 0.7, 0, { outline: 0.06 });
    // the cab: armoured box, a sloped brow, a glazed slit, a hazard-striped ram bumper
    k.box(3.6, 2.2, 3.0, T(W), 0, 1.2, 4.0, { outline: 0.1 });
    k.add(new THREE.BoxGeometry(3.6, 0.5, 1.6), T(W), 0, 3.4, 4.6, { rx: 0.45, outline: 0.05 });
    k.box(3.0, 0.65, 0.12, G(0x9be7ff), 0, 2.45, 5.52, { outline: 0 });
    k.box(3.9, 0.8, 0.5, T(ST), 0, 0.7, 5.75, { outline: 0.05 });
    for (let i = 0; i < 6; i++) k.box(0.62, 0.8, 0.06, T(i % 2 ? DK : Y), -1.6 + i * 0.64, 0.7, 6.02, { outline: 0 });
    for (const sx of [-1.1, 1.1]) k.box(0.6, 0.3, 0.1, G(WARM), sx, 1.75, 5.52, { outline: 0 });
    // the cargo module, banded in SPACECOM yellow and blue, with its name down both flanks
    k.box(3.6, 2.6, 6.8, T(W), 0, 1.2, -1.7, { outline: 0.12 });
    k.box(3.64, 0.45, 6.8, T(Y), 0, 2.15, -1.7, { outline: 0 });
    k.box(3.64, 0.14, 6.8, T(B), 0, 2.72, -1.7, { outline: 0 });
    for (const s of [-1, 1]) k.text('SPACECOM', s * 1.83, 3.25, -1.7, s * Math.PI / 2, 4.2, { fg: '#1d1a29', bg: '#eeecf6', back: false, off: 0.01 });
    k.box(2.6, 1.9, 0.12, T(DK), 0, 1.4, -5.12, { outline: 0.02 });
    // skirts, roof ring for the turret, beacons and aerials
    for (const s of [-1, 1]) k.box(0.2, 0.9, 9.8, T(ST), s * 1.9, 0.9, 0.1, { outline: 0.04 });
    k.cyl(1.2, 1.3, 0.4, 14, T(ST), 0, 3.8, -1.7, { outline: 0.03 });
    k.ball(0.26, G(B), -1.4, 3.75, 4.9, { outline: 0 });
    k.ball(0.26, G(0xff2a4a), 1.4, 3.75, 4.9, { outline: 0 });
    k.cyl(0.03, 0.05, 3.2, 4, T(DK), 1.5, 3.8, -4.6, { outline: 0 });
    k.cyl(0.03, 0.05, 2.4, 4, T(DK), -1.5, 3.8, -4.6, { outline: 0 });
  }));
  const gun = new THREE.Group();
  gun.position.set(0, 4.2, -1.7);
  gun.add(bakedRoot('boss|convoy|gun', (k) => {
    k.box(2.0, 0.9, 2.2, T(W), 0, -0.2, 0, { outline: 0.06 });
    k.box(2.02, 0.2, 2.22, T(Y), 0, 0.3, 0, { outline: 0 });
    for (const sx of [-0.45, 0.45]) k.add(new THREE.CylinderGeometry(0.16, 0.2, 2.6, 8).rotateX(Math.PI / 2), T(DK), sx, 0.25, 2.2, { outline: 0.03 });
  }));
  chassis.add(gun);
  const wheels = [];
  for (const sx of [-1, 1]) for (const z of [-3.9, -1.2, 3.9]) {
    const w = rWheel(1.0, 0.8);
    w.position.set(sx * 1.85, 1.0, z);
    root.add(w);
    wheels.push(w);
  }
  return { root, chassis, gun, wheels, radius: 6.2, rideH: 2.4 };
}

// The Daedalus Warden: a hovering hex-hulled war machine, seams lit pink, a phase crystal in its
// turret. No wheels: it floats on four lift pads.
export function makeWarden() {
  const HULL = 0x1a1426, DECK = 0x2a2440, PINK = 0xff2e88, VIO = 0xc77dff;
  const root = new THREE.Group(), chassis = new THREE.Group();
  root.add(chassis);
  chassis.add(bakedRoot('boss|warden', (k) => {
    k.add(new THREE.CylinderGeometry(2.7, 3.5, 1.5, 6).scale(1, 1, 1.75), T(HULL), 0, 2.1, 0, { outline: 0.12 });
    k.add(new THREE.CylinderGeometry(1.9, 2.5, 1.1, 6).scale(1, 1, 1.5), T(DECK), 0, 3.35, -0.2, { outline: 0.08 });
    k.add(new THREE.TorusGeometry(3.15, 0.09, 4, 6).rotateX(Math.PI / 2).scale(1, 1, 1.75), G(PINK), 0, 2.15, 0, { outline: 0 });
    k.add(new THREE.TorusGeometry(2.2, 0.07, 4, 6).rotateX(Math.PI / 2).scale(1, 1, 1.5), G(VIO), 0, 3.4, -0.2, { outline: 0 });
    // the prow: a wedge with a lit visor
    k.add(new THREE.ConeGeometry(1.6, 2.6, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1.3, 0.55, 1), T(HULL), 0, 2.1, 6.4, { outline: 0.06 });
    k.box(2.4, 0.3, 0.1, G(PINK), 0, 2.55, 5.2, { rx: -0.2, outline: 0 });
    // lift pads in armoured housings, side fins
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl(1.0, 1.2, 0.7, 10, T(DECK), sx * 2.3, 0.9, sz * 3.2, { outline: 0.04 });
      k.cyl(0.85, 0.85, 0.1, 12, G(VIO), sx * 2.3, 0.82, sz * 3.2, { outline: 0 });
    }
    for (const sx of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.25, 1.6, 3.4), T(HULL), sx * 3.25, 2.9, -2.6, { rz: sx * -0.5, outline: 0.04 });
      k.box(0.08, 0.2, 3.0, G(PINK), sx * 3.55, 3.4, -2.6, { rz: sx * -0.5, outline: 0 });
    }
    k.ball(0.3, G(PINK), 0, 4.0, -3.4, { outline: 0 });
  }, 0xc77dff));
  const gun = new THREE.Group();
  gun.position.set(0, 4.1, -0.2);
  gun.add(bakedRoot('boss|warden|gun', (k) => {
    k.cyl(1.1, 1.3, 0.6, 6, T(DECK), 0, -0.2, 0, { outline: 0.04 });
    k.add(new THREE.OctahedronGeometry(0.75, 0).scale(0.7, 1.6, 0.7), G(VIO), 0, 1.1, 0, { outline: 0 });
    for (const sx of [-0.55, 0.55]) {
      k.box(0.22, 0.3, 2.6, T(HULL), sx, 0.3, 1.4, { outline: 0.03 });
      k.box(0.24, 0.32, 0.3, G(PINK), sx, 0.3, 2.75, { outline: 0 });
    }
  }, 0xc77dff));
  chassis.add(gun);
  return { root, chassis, gun, wheels: [], radius: 6.4, rideH: 2.6, hover: true };
}

// The Vostok Hammer: a tracked heavy with a dozer-hammer plate, a long cannon and the red star.
export function makeHammer() {
  const OLIVE = 0x4a5236, RED = 0xff3b5c;
  const root = new THREE.Group(), chassis = new THREE.Group();
  root.add(chassis);
  chassis.add(bakedRoot('boss|hammer', (k) => {
    // tracks (the road wheels spin, below) under track guards
    for (const sx of [-1, 1]) {
      k.box(1.3, 0.4, 9.2, T(DK), sx * 2.35, 0.1, 0, { outline: 0.04 });
      k.box(1.3, 0.4, 9.2, T(DK), sx * 2.35, 1.75, 0, { outline: 0.04 });
      k.box(1.5, 0.25, 9.6, T(OLIVE), sx * 2.35, 2.15, 0, { outline: 0.05 });
      k.box(0.06, 0.18, 9.6, T(RED), sx * 3.11, 2.2, 0, { outline: 0 });
    }
    // hull and glacis
    k.box(3.4, 1.7, 8.2, T(OLIVE), 0, 1.0, -0.3, { outline: 0.12 });
    k.add(new THREE.BoxGeometry(3.4, 0.4, 2.4), T(OLIVE), 0, 2.0, 4.4, { rx: 0.55, outline: 0.06 });
    // the hammer: a massive plate on two rams, studded and striped
    k.box(5.6, 2.4, 0.6, T(ST), 0, 0.3, 6.2, { outline: 0.08 });
    for (let i = 0; i < 5; i++) k.box(0.9, 2.42, 0.06, T(i % 2 ? DK : RED), -2.2 + i * 1.1, 0.3, 6.52, { outline: 0 });
    for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry(0.22, 0.9, 5).rotateX(Math.PI / 2), T(LT), -1.8 + i * 1.2, 1.5, 6.95, { outline: 0.02 });
    for (const sx of [-1.2, 1.2]) k.add(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 8).rotateX(Math.PI / 2), T(LT), sx, 1.4, 5.0, { outline: 0.03 });
    // exhausts, lamps, the star on the glacis
    for (const sx of [-1, 1]) { k.cyl(0.22, 0.26, 1.6, 8, T(DK), sx * 1.2, 2.6, -4.0, { outline: 0.03 }); k.box(0.5, 0.25, 0.1, G(WARM), sx * 1.2, 2.0, 5.3, { rx: 0.55, outline: 0 }); }
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.32 : 0.8; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, -Math.sin(a) * r); }
    k.add(new THREE.ShapeGeometry(star), T(RED), 0, 2.25, 4.62, { rx: -1.02, outline: 0 });
  }, 0xff3b5c));
  const gun = new THREE.Group();
  gun.position.set(0, 3.4, -0.8);
  gun.add(bakedRoot('boss|hammer|gun', (k) => {
    k.add(new THREE.CylinderGeometry(1.6, 1.9, 1.3, 8).scale(1, 1, 1.25), T(OLIVE), 0, -0.1, 0, { outline: 0.08 });
    k.box(3.2, 0.18, 0.5, T(RED), 0, 0.25, -1.9, { outline: 0 });
    k.add(new THREE.CylinderGeometry(0.24, 0.3, 6.4, 10).rotateX(Math.PI / 2), T(DK), 0, 0.1, 4.6, { outline: 0.03 });
    k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 10).rotateX(Math.PI / 2), T(DK), 0, 0.1, 7.7, { outline: 0.03 });
    k.cyl(0.4, 0.5, 0.5, 8, T(OLIVE), 0.7, 0.55, -0.5, { outline: 0.03 });
  }, 0xff3b5c));
  chassis.add(gun);
  const wheels = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
    const w = rWheel(0.62, 1.32);
    w.position.set(sx * 2.35, 0.95, -3.6 + i * 1.8);
    root.add(w);
    wheels.push(w);
  }
  return { root, chassis, gun, wheels, radius: 6.6, rideH: 2.8 };
}

export const BOSS_MODELS = { convoy: makeConvoyRig, warden: makeWarden, hammer: makeHammer };

// ---------------------------------------------------------------------------------------------
// Props a chapter plants. Each returns a Group whose local y is up, base on the ground.
// ---------------------------------------------------------------------------------------------
const PROPS = {
  // SPACECOM signal relay: a lattice mast on a container base, a dish and beacons
  relay: (k) => {
    k.box(4.4, 2.2, 2.6, T(0xeeecf6), 0, 0, 0, { outline: 0.08 });
    k.box(4.42, 0.35, 2.62, T(0xffd23f), 0, 1.6, 0, { outline: 0 });
    k.box(1.2, 1.4, 0.1, T(DK), 1.2, 0.1, 1.32, { outline: 0 });
    k.at(0, 0, 0, 2.2); // the mast stands on the container's roof
    lattice(k, -0.6, 0, 11, 0.8, 0.3, 4, T(LT), T(DK), { r: 0.12 });
    k.at();
    k.add(new THREE.SphereGeometry(1.4, 14, 6, 0, Math.PI * 2, 0, 0.8).rotateX(-Math.PI / 2 + 0.3), T(CREAM), -0.6, 10.2, 0.6, { outline: 0.05 });
    k.ball(0.3, G(0x2ec4ff), -0.6, 13.4, 0, { outline: 0 });
    k.ball(0.2, G(0xff2a4a), 1.8, 2.6, 1.0, { outline: 0 });
  },
  // Vostok field generator: an olive bunker with three coil stacks and red lamps
  fieldgen: (k) => {
    k.cyl(3.2, 3.6, 1.2, 8, T(0x4a5236), 0, 0, 0, { outline: 0.08 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const x = Math.cos(a) * 1.7, z = Math.sin(a) * 1.7;
      k.cyl(0.55, 0.65, 3.4, 10, T(LT), x, 1.2, z, { outline: 0.05 });
      for (let j = 0; j < 3; j++) k.ring(0.68, 0.1, G(0xff3b5c), x, 1.8 + j * 0.9, z);
      k.ball(0.4, G(0xff3b5c), x, 4.8, z, { outline: 0 });
    }
    k.box(1.4, 0.9, 0.3, T(DK), 0, 1.2, 3.0, { outline: 0.02 });
    k.box(0.9, 0.2, 0.32, G(0xff3b5c), 0, 1.75, 3.02, { outline: 0 });
  },
  // Kepler homestead generator: a cream fusion tank with a green band, a solar wing and pipes
  homegen: (k) => {
    k.box(4.6, 0.4, 3.2, T(CONC), 0, 0, 0, { outline: 0.04 });
    k.add(new THREE.CapsuleGeometry(1.0, 1.8, 4, 12).rotateZ(Math.PI / 2), T(CREAM), -0.5, 1.6, 0, { outline: 0.06 });
    k.add(new THREE.CylinderGeometry(1.03, 1.03, 0.4, 14).rotateZ(Math.PI / 2), T(0x7dff6a), -0.5, 1.6, 0, { outline: 0 });
    k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 12).rotateX(Math.PI / 2), G(WARM), -0.5, 1.6, 1.03, { outline: 0 });
    k.beam([1.4, 0.4, 0], [1.4, 3.0, 0], 0.08, T(DK));
    k.add(new THREE.BoxGeometry(2.6, 0.08, 1.6), T(0x1b2a6b), 1.4, 3.2, 0, { rx: 0.5, outline: 0.03 });
    k.beam([0.8, 1.2, 0.6], [1.9, 0.5, 1.2], 0.1, T(0xff9f1c));
  },
  // the Black Sun: Daedalus' reactor. A ring of pylons round a black core, its halo turning
  reactor: (k) => {
    k.cyl(7.5, 8.2, 0.6, 24, T(0x2a2440), 0, 0, 0, { outline: 0.08 });
    k.ring(7.3, 0.18, G(0xff2e88), 0, 0.62, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 5.6, z = Math.sin(a) * 5.6;
      k.beam([x, 0.6, z], [x * 0.55, 7.5, z * 0.55], 0.32, T(0x1a1426), { outline: 0.05 });
      k.ball(0.4, G(0xc77dff), x * 0.55, 7.7, z * 0.55, { outline: 0 });
    }
    k.cyl(1.6, 2.4, 2.2, 12, T(0x1a1426), 0, 0.6, 0, { outline: 0.06 });
    k.ball(2.4, T(0x07050c), 0, 5.4, 0, { outline: 0.1 });
  },
  // Daedalus phase jammer: a tripod round a humming crystal
  jammer: (k) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.beam([Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6], [0, 2.6, 0], 0.1, T(0x1a1426));
    }
    k.cyl(0.5, 0.6, 0.5, 8, T(0x2a2440), 0, 2.4, 0, { outline: 0.03 });
    k.add(new THREE.OctahedronGeometry(0.5, 0).scale(0.7, 1.5, 0.7), G(0xc77dff), 0, 3.6, 0, { outline: 0 });
    k.cyl(0.03, 0.05, 2.0, 4, T(DK), 0.3, 2.9, 0, { outline: 0 });
    k.ball(0.12, G(0xff2e88), 0.3, 4.95, 0, { outline: 0 });
  },
  // Rustmoon demolition charge: a strapped crate of explosives, a blinking detonator, wires
  charge: (k) => {
    crate(k, 0, 0, 0, 1.6, 0x7a4a32, 0.2);
    for (const y of [0.4, 1.2]) k.box(1.72, 0.14, 1.72, T(0x2a2433), 0, y, 0, { ry: 0.2, outline: 0 });
    for (let i = 0; i < 3; i++) k.cyl(0.18, 0.18, 1.0, 8, T(0xd7263d), -0.5 + i * 0.5, 1.6, 0.3, { outline: 0.02 });
    k.box(0.6, 0.35, 0.4, T(DK), 0, 2.6, -0.3, { outline: 0.02 });
    k.ball(0.14, G(0xff2a4a), 0, 2.85, -0.3, { outline: 0 });
    k.cyl(0.02, 0.03, 1.4, 4, T(DK), 0.2, 2.95, -0.3, { outline: 0 });
    k.beam([0.8, 0.3, 0.6], [2.6, 0.05, 1.8], 0.04, T(0xffd23f), { outline: 0 });
  },
  // Meridian sensor pylon: a slim gold pylon with a blue lens and a data ring
  sensor: (k) => {
    k.cyl(0.9, 1.1, 0.4, 10, T(CONC), 0, 0, 0, { outline: 0.03 });
    k.cyl(0.18, 0.32, 5.2, 8, T(0xffc83a), 0, 0.4, 0, { outline: 0.04 });
    k.ring(0.7, 0.08, G(0x2ec4ff), 0, 3.6, 0);
    k.add(new THREE.SphereGeometry(0.42, 12, 8), G(0x2ec4ff), 0, 5.8, 0, { outline: 0 });
    k.box(0.5, 0.7, 0.08, T(DK), 0.3, 1.4, 0.2, { outline: 0.02 });
  },
  // Kepler ballot stand: a podium with a signing slate and a little Kepler flag
  ballot: (k) => {
    k.box(1.6, 1.3, 1.0, T(0x8a5a3a), 0, 0, 0, { outline: 0.05 });
    k.add(new THREE.BoxGeometry(1.4, 0.06, 0.9), T(0x241a3a), 0, 1.38, 0.1, { rx: -0.3, outline: 0.02 });
    k.box(1.0, 0.06, 0.6, G(0x7dff6a), 0, 1.42, 0.1, { rx: -0.3, outline: 0 });
    k.cyl(0.04, 0.05, 2.6, 5, T(DK), -0.7, 0, -0.4, { outline: 0 });
    k.box(1.0, 0.6, 0.04, T(0xff9f1c), -0.2, 2.1, -0.4, { outline: 0.02 });
  },
  // Daedalus phase emitter: a tall pylon with a crystal head (four ring an experiment)
  emitter: (k) => {
    k.cyl(1.1, 1.4, 0.6, 8, T(0x2a2440), 0, 0, 0, { outline: 0.04 });
    k.cyl(0.25, 0.45, 7, 6, T(0x1a1426), 0, 0.6, 0, { outline: 0.05 });
    for (let j = 0; j < 3; j++) k.ring(0.5, 0.07, G(0xff2e88), 0, 2.2 + j * 1.6, 0);
    k.add(new THREE.OctahedronGeometry(0.7, 0).scale(0.8, 1.6, 0.8), G(0xc77dff), 0, 8.4, 0, { outline: 0 });
  },
  // a Meridian relay gate (Flash Crash): a lit ring on two posts you skate through
  gate: (k) => {
    k.add(new THREE.TorusGeometry(5.4, 0.35, 6, 32), G(0x2ec4ff), 0, 5.6, 0, { outline: 0 });
    k.add(new THREE.TorusGeometry(5.9, 0.18, 4, 32), T(0xffc83a), 0, 5.6, 0, { outline: 0 });
  },
  // the Meridian launch complex beside the Monolith: a pad, a gantry, a rocket, tanks and a sign
  launch: (k) => {
    k.cyl(19, 19.6, 0.5, 40, T(0x5b5870), 0, 0, 0, { outline: 0.06 });
    k.ring(18.4, 0.25, G(0x2ec4ff), 0, 0.52, 0);
    k.cyl(4.2, 4.6, 1.6, 16, T(0x2a2440), 0, 0.5, 0, { outline: 0.05 });
    k.cyl(2.6, 2.8, 22, 20, T(0xeeecf6), 0, 2.1, 0, { outline: 0.12 });
    k.cyl(2.65, 2.65, 2.4, 20, T(0x2ec4ff), 0, 12, 0, { outline: 0 });
    k.cyl(2.65, 2.65, 0.9, 20, T(0xffc83a), 0, 15.2, 0, { outline: 0 });
    k.add(new THREE.ConeGeometry(2.6, 7, 20), T(0xeeecf6), 0, 27.6, 0, { outline: 0.1 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; k.add(new THREE.BoxGeometry(0.35, 6, 3.4), T(0x2ec4ff), Math.cos(a) * 3.3, 4.8, Math.sin(a) * 3.3, { ry: -a, outline: 0.05 }); }
    lattice(k, 9, 0, 32, 1.6, 1.2, 8, T(0xd8d4e8), T(0x3a3550), { r: 0.22 });
    k.at();
    for (let j = 0; j < 3; j++) k.box(6, 0.4, 1.6, T(0x3a3550), 5.5, 10 + j * 8, 0, { outline: 0.03 });
    for (const [x, z] of [[-12, 8], [-12, -8]]) { k.add(new THREE.SphereGeometry(3.2, 16, 12), T(0xeeecf6), x, 3.6, z, { outline: 0.08 }); k.add(new THREE.TorusGeometry(3.25, 0.2, 4, 20).rotateX(Math.PI / 2), T(0x2ec4ff), x, 3.6, z, { outline: 0 }); k.cyl(0.3, 0.3, 1, 6, T(0x3a3550), x, 0, z, { outline: 0 }); }
    k.text('MERIDIAN LAUNCH COMPLEX', 0, 3.2, 19.2, 0, 14, { fg: '#2ec4ff', bg: '#0d1a33', back: false, off: 0.02 });
    k.box(15, 2.6, 0.3, T(0x3a3550), 0, 1.9, 19.0, { outline: 0.03 });
    k.flag(14, 10, 12, 0x2ec4ff);
    k.column(3.2, 30, 0, 0);
    k.column(1.8, 32, 9, 0);
    k.sphere(3.2, -12, 3.6, 8);
    k.sphere(3.2, -12, 3.6, -8);
  },
  // a calibration node for the phase trial: a glowing gyro ring you fly through
  node: (k) => {
    k.add(new THREE.TorusGeometry(2.4, 0.22, 6, 24), G(0xc77dff), 0, 0, 0, { outline: 0 });
    k.add(new THREE.TorusGeometry(1.7, 0.1, 6, 20).rotateY(Math.PI / 2), G(0xff2e88), 0, 0, 0, { outline: 0 });
  },
};

export function makeProp(kind) {
  const root = bakedRoot(`prop|${kind}`, PROPS[kind]);
  if (kind === 'launch') root.userData.cols = bake(`prop|${kind}`, PROPS[kind]).cols;
  // the reactor's halo and the jammer's crystal turn; marked for the story's spin loop
  if (kind === 'reactor') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.18, 6, 40), G(0xc77dff));
    halo.rotation.x = Math.PI / 2 - 0.35;
    halo.position.y = 5.4;
    const spin = new THREE.Group();
    spin.position.y = 0;
    spin.add(halo);
    spin.userData.spin = true;
    const glowBall = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 12), BEAM(0xc77dff, 0.18));
    glowBall.position.y = 5.4;
    root.add(spin, glowBall);
  }
  if (kind === 'node') root.userData.spin = true;
  return root;
}

// ---------------------------------------------------------------------------------------------
// Outposts you found (story base-building): a proper little compound. A hab dome hub (homesteads)
// or a research block with a dish (labs), on a paved apron, with the modules you build standing on
// their plots round it. Returns a kit template ({ root, cols, ... }) for territory.place().
// ---------------------------------------------------------------------------------------------
export const BUILT_R = 40, MOD_R = 26, TERMINAL_Z = 16.4;
const MODS_ORDER = ['greenhouse', 'clinic', 'beacon', 'turret', 'market', 'garage'];

export function foundedTemplate(kind, color, modules) {
  const key = `founded|${kind}|${color}|${modules.join(',')}`;
  return bake(key, (k) => {
    k.at();
    k.cyl(BUILT_R - 4, BUILT_R - 3, 0.3, 48, T(0x8a8698), 0, 0, 0, { outline: 0.06 });
    k.ring(BUILT_R - 4.4, 0.18, T(color), 0, 0.32, 0);
    // a path from the hub's door out to the edge
    k.box(4, 0.06, BUILT_R - 18, T(0x6b6880), 0, 0.3, (BUILT_R - 18) / 2 + 14, { outline: 0 });
    if (kind === 'lab') {
      // research block: a long lab with a rooftop dish and a little glass observatory
      cabin(k, 0, 0, 16, 10, 6, 0xeeecf6, 0, { trim: color });
      k.at();
      k.cyl(1.2, 1.5, 1.4, 10, T(DK), -4, 6.9, -1, { outline: 0.03 });
      k.add(new THREE.SphereGeometry(3, 16, 6, 0, Math.PI * 2, 0, 0.8).rotateX(-0.9), T(CREAM), -4, 9.4, -1, { outline: 0.05 });
      k.add(new THREE.SphereGeometry(2.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS(0x9be7ff, 0.35), 4.5, 7.0, -1.5, { outline: 0 });
      k.box(10, 0.8, 0.12, G(WARM), 0, 3.4, 5.06, { outline: 0 });
      k.solid(8, 3.5, 5, 0, 0);
    } else {
      habDome(k, 0, 0, 10, kind === 'homestead' ? 0xb8ffb0 : 0xeeecf6, { door: 0, trim: color });
      k.at();
    }
    // the terminal at the end of the path
    k.box(1.4, 1.6, 0.8, T(DK), 0, 0.3, TERMINAL_Z, { outline: 0.04 });
    k.box(1.1, 0.7, 0.06, G(color), 0, 1.2, TERMINAL_Z + 0.42, { outline: 0 });
    k.flag(-12, 9, 14, color);
    // module plots: built ones get their building, the rest a glowing marker ring
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.6;
      const x = Math.cos(a) * MOD_R, z = Math.sin(a) * MOD_R;
      const face = Math.atan2(-x, -z); // doors towards the hub
      const mod = modules[i];
      if (!mod) { k.at(); k.ring(5.5, 0.12, G(color), x, 0.35, z); continue; }
      buildModule(k, mod, x, z, face, color);
      k.at();
    }
  }, color);
}

function buildModule(k, mod, x, z, face, color) {
  if (mod === 'greenhouse') {
    k.at(x, z, face);
    k.cyl(5.6, 5.9, 0.5, 20, T(CONC), 0, 0, 0, { outline: 0.04 });
    k.add(new THREE.SphereGeometry(5.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS(0x9bffb0, 0.32), 0, 0.5, 0, { outline: 0 });
    for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(5.22, 0.08, 4, 20, Math.PI).rotateY((i / 4) * Math.PI), T(LT), 0, 0.5, 0, { outline: 0 });
    for (let r = -1; r <= 1; r++) {
      k.box(7.4 - Math.abs(r) * 2.4, 0.5, 1.0, T(0x6b4a2a), 0, 0.5, r * 2.0, { outline: 0.02 });
      for (let j = 0; j < 5 - Math.abs(r) * 2; j++) k.add(new THREE.SphereGeometry(0.45, 7, 5), T(0x3f9a3a), -2.4 + Math.abs(r) * 1.2 + j * 1.2, 1.3, r * 2.0, { outline: 0.02 });
    }
    k.solid(4, 2.6, 4, 0, 0);
  } else if (mod === 'clinic') {
    cabin(k, x, z, 9, 7, 4.4, 0xffffff, face, { trim: 0xff2a4a });
    k.box(2.6, 0.7, 0.14, T(0xff2a4a), 0, 3.0, 3.62, { outline: 0 });
    k.box(0.7, 2.6, 0.14, T(0xff2a4a), 0, 2.05, 3.63, { outline: 0 });
    k.ball(0.35, G(0xff2a4a), 0, 5.6, 0, { outline: 0 });
    k.solid(4.5, 2.4, 3.5, 0, 0);
  } else if (mod === 'beacon') {
    k.at(x, z, face);
    k.box(3.6, 0.5, 3.6, T(CONC), 0, 0, 0, { outline: 0.03 });
    lattice(k, 0, 0, 16, 1.4, 0.4, 5, T(LT), T(DK), { r: 0.16 });
    k.at(x, z, face);
    k.cyl(0.9, 0.6, 0.6, 8, T(DK), 0, 16, 0, { outline: 0.03 });
    k.ball(0.75, G(color), 0, 17.2, 0, { outline: 0 });
    k.column(1.5, 16, 0, 0);
  } else if (mod === 'turret') {
    k.at(x, z, face);
    k.cyl(3.4, 3.8, 0.6, 14, T(CONC), 0, 0, 0, { outline: 0.04 });
    sandbags(k, 0, 0, 3.6, -2.4, 2.4, 2);
    k.dyn(makeTurret({ color }).root, 0, 0.6, 0);
    k.column(2.4, 4, 0, 0);
  } else if (mod === 'market') {
    k.at(x, z, face);
    k.box(9, 0.3, 6, T(CONC), 0, 0, 0, { outline: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.12, 0.12, 3.6, 6, T(DK), sx * 3.8, 0.3, sz * 2.4, { outline: 0.02 });
    for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(1.36, 0.14, 5.6), T(i % 2 ? CREAM : 0xff2e88), -3.4 + i * 1.36, 4.1, 0, { rx: 0, rz: 0.12, outline: 0.02 });
    k.box(7, 1.1, 1.0, T(0x8a5a3a), 0, 0.3, 1.8, { outline: 0.04 });
    for (const [cx, c] of [[-2.2, 0xff9f1c], [0, 0x7dff6a], [2.2, 0x2ec4ff]]) crate(k, cx, 1.4, 1.8, 0.7, c, cx);
    crate(k, -3, 0.3, -1.6, 1.2, 0x9a6a3a, 0.4); crate(k, -1.6, 0.3, -1.8, 1.0, 0x4f5a42, -0.3);
    k.solid(4.2, 1.6, 2.8, 0, 0);
  } else if (mod === 'garage') {
    quonset(k, x, z, 4.6, 10, 0xd8d4e8, face, color);
  }
}

export { MODS_ORDER };
