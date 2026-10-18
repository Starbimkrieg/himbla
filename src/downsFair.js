import * as THREE from 'three';
import { makeDownsPart } from './models.js';
import { bake } from './downsKit.js';

// The fairground's two rides, rebuilt in Blender for Chimera Downs (tools/blender/build_downs_fair.py). Each is built into a settlement kit `k` at (x, z) in the place's frame, and
// registers its rideable seats in world.rides (rides.js: `F` beside it pops you into the nearest gondola or onto the nearest horse).
const TAU = Math.PI * 2;
const ACCENTS = [0x8b4044, 0xcfb352, 0x7b9a6e, 0xb07c57];   // Barn Red, Gold Gleam, Money, Saddle Brown

// Ferris wheel: a Mint A-frame on a platform, a big turning wheel with lit bulbs, twelve open gondolas that hang level (about 50 m tall; 48 m across the wheel's plane).
export function ferrisWheel(world, loc, k, wx, wz) {
  const hub = 27, R = 22; // (the bottom gondola just clears the platform)
  k.at(wx, wz);
  bake(k, 'dn_wheel_frame');
  k.at();
  world.col(loc, { type: 'box', x: wx, y: 0.6, z: wz, hx: 8, hy: 0.6, hz: 5 });
  for (const t of [-1, 1]) world.col(loc, { type: 'cyl', x: wx + t * 5.5, z: wz, y0: -2, y1: 8, r: 1.1 });
  const wheel = makeDownsPart('dn_wheel');
  const gondolas = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const g = makeDownsPart('dn_gondola', { accent: ACCENTS[i % 4] });
    g.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    wheel.add(g);
    gondolas.push(g);
  }
  wheel.userData.tick = (o, dt) => {
    o.rotation.z += dt * 0.12;
    for (const g of gondolas) g.rotation.z = -o.rotation.z;
  };
  k.dyn(wheel, wx, hub, wz);
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3();
  (world.rides ||= []).push({
    loc, name: 'FERRIS WHEEL', camDist: 16,
    seats: gondolas.map((g) => ({ obj: g, local: new THREE.Vector3(0, -3.35, 0), face: new THREE.Vector3(0, 0, 1) })),
    // step off sideways, out of the wheel's plane
    exitDir: (p, out) => { wheel.updateMatrixWorld(true); wheel.localToWorld(P0.set(0, 0, 0)); wheel.localToWorld(P1.set(0, 0, 1)); return out.subVectors(P1, P0).normalize(); },
  });
}

// Carousel: a Barn Red and Mint canopy, a turning deck, eight horses bobbing on poles (r about 10 m, 12 m tall).
export function carousel(world, loc, k, cx, cz) {
  k.at(cx, cz);
  bake(k, 'dn_carousel_base');
  k.at();
  world.col(loc, { type: 'cyl', x: cx, z: cz, y0: -2, y1: 0.7, r: 9 });
  world.col(loc, { type: 'cyl', x: cx, z: cz, y0: 0, y1: 8, r: 1.4 });
  const deck = makeDownsPart('dn_carousel');
  const horses = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const h = makeDownsPart('dn_horse', { accent: ACCENTS[i % 4] });
    h.position.set(Math.cos(a) * 6, 1.6, Math.sin(a) * 6);
    h.rotation.y = -a;
    deck.add(h);
    horses.push(h);
  }
  deck.userData.tick = (o, dt, t) => {
    o.rotation.y += dt * 0.5;
    horses.forEach((h, i) => { h.position.y = 1.6 + Math.sin(t * 2 + i * 1.3) * 0.5; });
  };
  k.dyn(deck, cx, 0.7, cz);
  const C0 = new THREE.Vector3();
  (world.rides ||= []).push({
    loc, name: 'CAROUSEL', camDist: 9,
    seats: horses.map((h) => ({ obj: h, local: new THREE.Vector3(-0.1, -0.05, 0), face: new THREE.Vector3(1, 0, 0) })),
    // hop off outward, away from the centre pole
    exitDir: (p, out) => {
      deck.updateMatrixWorld(true);
      deck.localToWorld(C0.set(0, 0, 0));
      const up = p.clone().normalize();
      out.subVectors(p, C0);
      return out.addScaledVector(up, -out.dot(up)).normalize();
    },
  });
}
