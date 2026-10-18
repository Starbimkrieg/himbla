import * as THREE from 'three';
import { World, zoneWallMaterial } from '../world.js';
import { LOCATIONS } from '../locations.js';
import { mulberry32 } from '../rng.js';
import { NAME_TAGS, setMask } from '../toon.js';
import { Race } from '../race.js';
import { Colliders } from '../physics.js';

// Builds one of the game's settlements / headquarters / landmarks standalone, for the Asset Row (assetRowItems/places.js).
//
// The game builds a place by calling World.buildLocation(loc) on its one World; that sets singletons on the World (lab, reactor,
// rocket, casino, rides ...), registers colliders and adds a PointLight to the scene. So a place here is built on a PRIVATE
// stub World (Object.create(World.prototype) with its own fields: only the builders' put / col / rand / pad / flag / anims /
// rides ... are used, never the constructor, never g.world), into a group of its own at the item's origin, on a flat ground at
// y = 0. Nothing is shared with the live game except module-level caches (toon materials, baked kits) which are harmless, and
// the NAME_TAGS list, which is cleaned up in dispose().

// The Moon's planet interface as far as the builders use it (flat stand-in; the launch complex's tilt is not shown here)
const FLAT = { R: 3600, addFlat() {}, keepClear() {}, surface: () => 0, altitude: () => 10, ground: (p, o) => (o || new THREE.Vector3()).set(p.x, 0, p.z), visible: () => true };

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// A world-space collider the builders registered (as the game's Colliders takes it) -> a spec in the row's format
// (box with a yaw only, vertical cylinders, spheres). A horizontal cylinder (an arched roof) becomes the box round it, and a
// tilted box (a ramp) the upright box round its tilted shape.
function toSpec(c) {
  if (c.type === 'sphere') return { type: 'sphere', x: c.c.x, y: c.c.y, z: c.c.z, r: c.r };
  if (c.type === 'cyl') {
    if (c.axis.y > 0.99) return { type: 'cyl', x: c.c.x, z: c.c.z, y0: c.c.y + c.y0, y1: c.c.y + c.y1, r: c.r };
    const mid = _a.copy(c.c).addScaledVector(c.axis, (c.y0 + c.y1) / 2), half = (c.y1 - c.y0) / 2;
    return { type: 'box', x: mid.x, y: mid.y, z: mid.z, hx: c.r, hy: c.r, hz: half, yaw: Math.atan2(c.axis.x, c.axis.z) };
  }
  const yaw = Math.hypot(c.ax.x, c.ax.z) > 1e-6 ? Math.atan2(-c.ax.z, c.ax.x) : 0;
  const X = _a.set(Math.cos(yaw), 0, -Math.sin(yaw)), Z = _b.set(Math.sin(yaw), 0, Math.cos(yaw));
  const ext = (v) => Math.abs(c.ax.dot(v)) * c.hx + Math.abs(c.ay.dot(v)) * c.hy + Math.abs(c.az.dot(v)) * c.hz;
  const hx = ext(X), hz = ext(Z), hy = ext(UP);
  return { type: 'box', x: c.c.x, y: c.c.y, z: c.c.z, hx, hy, hz, yaw };
}

// The stub World a place is built on. `scene` is private (the antimatter lab adds its reactor light to it: the live game's
// light count must not change).
function stubWorld(colList) {
  const w = Object.create(World.prototype);
  const colliders = new Colliders(); // (a private one: the pylons look for free ground in it; it also records every collider for the row)
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
// ctx is the shell's { game, moon } (read only: the camera, for the distance switches).
export function buildPlace(ctx, spec) {
  const base = spec.base || LOCATIONS.find((l) => l.id === spec.loc);
  const tags0 = NAME_TAGS.length;
  const colList = [];
  const w = stubWorld(colList);
  const stage = new THREE.Group();
  stage.name = `place:${base.id}`;
  w.frame = (loc) => { // (the game's frame() points local +z sunward on the Moon: here, along the row's +z unless turned)
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
    // Chimera Downs: the course is built by the Race (race.js build()), on a fake Race with just what build() and the two
    // canvas boards use; the racing state and panel are untouched
    const fake = Object.create(Race.prototype);
    Object.assign(fake, { game: { world: w }, loc, crowd: [], panel: null, state: 'idle', card: [], postT: 60, excite: 0, racers: [] });
    fake.build();
    fake.plates = fake.plates || [];
    fake.drawScreen(); fake.drawEnd(); fake.drawBoard(); fake.drawPlates();
    w.race = fake;
  }
  if (spec.after) spec.after(w, loc);
  // the reactor's light belongs to the game's scene: not here (it would change the live game's shaders)
  if (w.reactorLight) { w.reactorLight.removeFromParent(); w.reactorLight.dispose && w.reactorLight.dispose(); w.reactorLight = { intensity: 0 }; }
  if (w.rocket) { w.rocket.t = 22; World.prototype.updateRocket.call(w, 0); } // (parked on its pad for the next while, then its cycle runs: landing, lift-off)
  w.prepCulling(loc);
  w.mergeLocation(loc); // (static geometry folded to a few meshes, as the game does the first time a place is drawn)
  stage.updateMatrixWorld(true);

  // my NAME_TAGS (Dr. Zbornak ...): taken off again in dispose()
  const tags = NAME_TAGS.slice(tags0);

  const cam = ctx.game.camera.position, camL = new THREE.Vector3(), here = new THREE.Vector3();
  let cullT = 0;
  const update = (dt, t) => {
    stage.getWorldPosition(here);
    loc.camDist = here.distanceTo(cam);
    camL.copy(cam); stage.worldToLocal(camL);
    // (World.update, the part that moves things in a place: world.js update())
    for (const s of w.spinners) s.obj.rotation[s.axis] += s.speed * dt;
    for (const a of w.anims) for (const o of a.list) {
      const u = o.userData;
      if (u.tick) u.tick(o, dt, t);
      else if (u.spin) o.rotation.y += dt * (u.spin === true ? 0.6 : u.spin);
      else if (u.blink) o.visible = Math.sin(t * 4 + a.seed) > -0.3;
      else if (u.flag) o.rotation.y = Math.sin(t * 2 + a.seed) * 0.25;
    }
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
    // (the game's distance switches: ink outlines past ~130 m, small props past ~290 m; in the row they keep the draw count down)
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
    // what the shell's geometry/material sweep does not reach: a skinned figure's bone texture (residents, patrons: ~30 a place)
    // and instanced meshes' own buffers (the Downs crowd)
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

// The red zone wall round a restricted military post (world.js buildMilitary): a 170 m tall striped cylinder, no colliders.
export function buildZoneWall(R) {
  const mat = zoneWallMaterial();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 170, 96, 1, true), mat);
  wall.position.y = 15;
  const root = new THREE.Group();
  root.add(wall);
  return { root, update: (dt, t) => { mat.uniforms.time.value = t; } };
}
