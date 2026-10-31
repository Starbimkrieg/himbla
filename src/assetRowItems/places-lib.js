import * as THREE from 'three';
import { World, zoneWallMaterial, stepMover } from '../world.js';
import { LOCATIONS } from '../locations.js';
import { mulberry32 } from '../rng.js';
import { NAME_TAGS, setMask } from '../toon.js';
import { Race } from '../race.js';
import { Colliders } from '../physics.js';

// Builds one settlement / HQ / landmark standalone for the Asset Row (assetRowItems/places.js).
//
// World.buildLocation(loc) sets World singletons (lab, reactor, rocket, casino, rides ...), registers colliders and adds a
// PointLight, so here it runs on a PRIVATE stub World (Object.create(World.prototype), own fields, no constructor, never
// g.world), into its own group on flat ground at y = 0. Shared with the live game: only module caches (toon materials, baked
// kits; harmless) and NAME_TAGS, which dispose() cleans up.

// the planet interface the builders use, flat (no launch-complex tilt)
const FLAT = { R: 3600, addFlat() {}, keepClear() {}, surface: () => 0, altitude: () => 10, ground: (p, o) => (o || new THREE.Vector3()).set(p.x, 0, p.z), visible: () => true };

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// A game collider (world space) -> a row spec (yawed box, possibly pitched about its x; vertical cylinder; sphere). A horizontal
// cylinder (arched roof) becomes its bounding box; a box tilted any other way the upright box round it.
function toSpec(c) {
  if (c.type === 'sphere') return { type: 'sphere', x: c.c.x, y: c.c.y, z: c.c.z, r: c.r };
  if (c.type === 'cyl') {
    if (c.axis.y > 0.99) return { type: 'cyl', x: c.c.x, z: c.c.z, y0: c.c.y + c.y0, y1: c.c.y + c.y1, r: c.r };
    const mid = _a.copy(c.c).addScaledVector(c.axis, (c.y0 + c.y1) / 2), half = (c.y1 - c.y0) / 2;
    return { type: 'box', x: mid.x, y: mid.y, z: mid.z, hx: c.r, hy: c.r, hz: half, yaw: Math.atan2(c.axis.x, c.axis.z) };
  }
  const yaw = Math.hypot(c.ax.x, c.ax.z) > 1e-6 ? Math.atan2(-c.ax.z, c.ax.x) : 0;
  const X = _a.set(Math.cos(yaw), 0, -Math.sin(yaw)), Z = _b.set(Math.sin(yaw), 0, Math.cos(yaw));
  // (x still level: the box is yawed, then pitched about its x, as World.colAdd builds it: a ramp, a leaning wall or leg)
  if (Math.abs(c.ax.y) < 1e-6) return { type: 'box', x: c.c.x, y: c.c.y, z: c.c.z, hx: c.hx, hy: c.hy, hz: c.hz, yaw, pitch: Math.atan2(c.ay.dot(Z), c.ay.y) };
  const ext = (v) => Math.abs(c.ax.dot(v)) * c.hx + Math.abs(c.ay.dot(v)) * c.hy + Math.abs(c.az.dot(v)) * c.hz;
  const hx = ext(X), hz = ext(Z), hy = ext(UP);
  return { type: 'box', x: c.c.x, y: c.c.y, z: c.c.z, hx, hy, hz, yaw };
}

// The stub World. `scene` is private: the antimatter lab adds its reactor light to it, and the live game's light count must
// not change.
function stubWorld(colList) {
  const w = Object.create(World.prototype);
  const colliders = new Colliders(); // (private: pylons look for free ground in it; also records every collider for the row)
  const add = colliders.add.bind(colliders);
  colliders.add = (c) => { colList.push(c); return add(c); };
  Object.assign(w, {
    scene: new THREE.Group(), planet: FLAT, locations: [], spinners: [], blinkers: [], dishes: [], figures: [], vehicles: [], crawlers: [],
    zoneWalls: [], walkers: [], anims: [], rides: [], _mats: new Map(), rand: mulberry32(42),
    colliders,
  });
  return w;
}

// spec: { loc: id of a LOCATIONS entry (or a whole loc object in `base`), over: fields to change, race: true for Chimera Downs,
//         yaw: turn the place about its centre, lamp: false ... }
// ctx is the shell's { game, moon } (read only: the camera, for distance switches).
export function buildPlace(ctx, spec) {
  const base = spec.base || LOCATIONS.find((l) => l.id === spec.loc);
  const tags0 = NAME_TAGS.length;
  const colList = [];
  const w = stubWorld(colList);
  const stage = new THREE.Group();
  stage.name = `place:${base.id}`;
  w.frame = (loc) => { // (the game's frame() points local +z sunward; here the row's +z unless turned)
    const g = new THREE.Group();
    g.rotation.y = spec.yaw || 0;
    stage.add(g);
    g.updateMatrixWorld(true);
    loc.group = g; loc.pos = new THREE.Vector3(); loc.active = true; loc.camDist = 0;
    return g;
  };
  const loc = { ...base, dir: new THREE.Vector3(0, 1, 0), zr: 0, restricted: false, ...(spec.over || {}) };
  w.locations.push(loc);
  w.buildLocation(loc);
  if (spec.race) {
    // Chimera Downs: race.js build() makes the course, on a fake Race with just what build() and the boards use
    const fake = Object.create(Race.prototype);
    Object.assign(fake, { game: { world: w }, loc, crowd: [], panel: null, state: 'idle', card: [], postT: 60, excite: 0, racers: [] });
    fake.build();
    fake.plates = fake.plates || [];
    fake.drawScreen(); fake.drawEnd(); fake.drawBoard(); fake.drawPlates();
    w.race = fake;
  }
  if (spec.after) spec.after(w, loc);
  // drop the reactor light (an extra light would change the live game's shaders)
  if (w.reactorLight) { w.reactorLight.removeFromParent(); w.reactorLight.dispose && w.reactorLight.dispose(); w.reactorLight = { intensity: 0 }; }
  if (w.rocket) { w.rocket.t = 22; World.prototype.updateRocket.call(w, 0); } // (parked on its pad a while, then its landing / lift-off cycle runs)
  w.prepCulling(loc);
  w.mergeLocation(loc); // (static geometry merged, as the game does on first draw)
  stage.updateMatrixWorld(true);

  // this place's NAME_TAGS (Dr. Zbornak ...), removed in dispose()
  const tags = NAME_TAGS.slice(tags0);

  const cam = ctx.game.camera.position, camL = new THREE.Vector3(), here = new THREE.Vector3();
  let cullT = 0;
  const update = (dt, t) => {
    stage.getWorldPosition(here);
    loc.camDist = here.distanceTo(cam);
    camL.copy(cam); stage.worldToLocal(camL);
    // (the place-animating part of world.js update())
    for (const s of w.spinners) s.obj.rotation[s.axis] += s.speed * dt;
    for (const a of w.anims) for (const o of a.list) stepMover(o, dt, t, a.seed);
    for (const d of w.dishes) { d.yaw.rotation.y += d.speed * dt; d.tilt.rotation.x = -0.6 + Math.sin(t * d.speed * 2) * 0.25; }
    for (const b of w.blinkers) b.mat.color.copy(b.base).multiplyScalar(Math.sin(t * 3 + b.phase) > 0.2 ? 1 : 0.25);
    for (const z of w.zoneWalls) z.mat.uniforms.time.value = t;
    if (w.reactor) {
      const r = w.reactor, k = r.spin + r.flash * 6;
      r.orb.rotation.x += dt * 9 * k; r.orb.rotation.y += dt * 13 * k;
      r.ringA.rotation.x += dt * 17 * k; r.ringB.rotation.y += dt * 21 * k; r.ringB.rotation.z += dt * 5;
      r.core.position.y = r.base + Math.sin(t * 37) * 0.25 * k;
      r.core.position.x = -2 + (Math.random() - 0.5) * 0.25 * k;
      r.orb.scale.setScalar(1 + Math.sin(t * 23) * 0.12 + r.flash * 0.8);
      r.flash = Math.max(0, r.flash - dt * 0.8);
    }
    if (w.monolith) w.monolith.halo.material.opacity = 0.3 + 0.25 * Math.sin(t * 2);
    if (w.casino) w.casino.update(dt, t);
    if (w.rocket) World.prototype.updateRocket.call(w, dt);
    w._camPos = cam; // (figures measure in world space)
    World.prototype.updateFigures.call(w, dt);
    World.prototype.updateWalkers.call(w, dt, camL);
    if (w.race) w.race.updateCrowd(t);
    // (the game's distance switches, to keep draw count down: ink outlines off past ~130 m, small props past ~290 m)
    cullT -= dt;
    if (cullT <= 0) {
      cullT = 0.25;
      if (loc.inkChunks) for (const ch of loc.inkChunks) {
        const d = ch.c.distanceTo(camL) - ch.r;
        if (ch.on && d > 130) { ch.on = false; ch.m.visible = false; }
        else if (!ch.on && d < 110) { ch.on = true; ch.m.visible = true; }
      }
      if (loc.cells) for (const c of loc.cells) {
        const d = c.c.distanceTo(camL);
        if (c.on && d > 290) { c.on = false; setMask(c.objs, false); }
        else if (!c.on && d < 260) { c.on = true; setMask(c.objs, true); }
      }
    }
  };

  const dispose = () => {
    // what the shell's geometry/material sweep misses: skinned figures' bone textures (~30 a place) and instanced meshes'
    // buffers (the Downs crowd)
    stage.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
    for (const t of tags) {
      const i = NAME_TAGS.indexOf(t);
      if (i >= 0) NAME_TAGS.splice(i, 1);
      if (t.el) t.el.remove();
    }
    tags.length = 0;
  };
  return { root: stage, cols: colList.map(toSpec), update, dispose };
}

// The red zone wall round a military post (world.js buildMilitary): 170 m striped cylinder, no colliders.
export function buildZoneWall(R) {
  const mat = zoneWallMaterial();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 170, 96, 1, true), mat);
  wall.position.y = 15;
  const root = new THREE.Group();
  root.add(wall);
  return { root, update: (dt, t) => { mat.uniforms.time.value = t; } };
}
