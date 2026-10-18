import * as THREE from 'three';
import { animate, lineUp } from './common.js';
import { seat } from './props-util.js';
import { toon, glow, ink } from '../toon.js';
import { Kit, BEAM } from '../outpostModels.js';
import { makeSat7, Secrets } from '../secrets.js';
import { spire, obelisk, lander, shrine, extract, makeMothership, makeDrone } from '../spindle.js';
import { World } from '../world.js';

// 12 · SECRETS & THE SPINDLE'S PROPS (the Spindle rock itself is skipped: see the note at the bottom).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TEAL = 0x7dffd4;

// ---- SAT-7 "Lantern" (secrets.js makeSat7) ---------------------------------------------------------------------------
// Orbits 34 to 300 m up in the game; here on four posts, dish just clear of the floor. Animation mirrors Secrets.update.
function sat7() {
  const s = makeSat7(true);
  s.nameSign.visible = false; // the board says it
  const LIFT = 7.2;
  const root = new THREE.Group();
  s.root.position.y = LIFT;
  root.add(s.root);
  const post = toon(0x3a3550);
  for (const x of [-4.5, 4.5]) for (const z of [-9, 9]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, LIFT - 2.4, 8), post);
    m.position.set(x * 1.5 * 0.7, (LIFT - 2.4) / 2, z);
    ink(m, 0.05);
    root.add(m);
  }
  const S = 1.5; // SAT_SCALE
  const cols = [
    { type: 'box', x: 0, y: LIFT, z: 0, hx: 4.7 * S, hy: 1.75 * S, hz: 7.7 * S, yaw: 0 }, // body and both wings (secrets.js syncSatCols)
    { type: 'box', x: -14.5 * S, y: LIFT, z: 0, hx: 6 * S, hy: 0.3 * S, hz: 3.5 * S, yaw: 0 },
    { type: 'box', x: 14.5 * S, y: LIFT, z: 0, hx: 6 * S, hy: 0.3 * S, hz: 3.5 * S, yaw: 0 },
  ];
  return {
    root,
    cols,
    update: (dt, t) => {
      for (const l of s.lights) l.mesh.visible = ((t + l.phase) % l.period) < l.period * l.duty;
      s.halo.scale.setScalar(s.lights[6].mesh.visible ? 1.35 : 1);
      s.artifact.rotation.y += dt * 1.5;
      s.aGlow.scale.setScalar(1 + Math.sin(t * 4) * 0.15);
    },
  };
}

// The alien artifact (secrets.js makeSat7: cradle, octahedron, glow; same stone as in the jar), on a stand.
function artifact() {
  const root = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 12), toon(0x3a3550));
  stand.position.y = 0.3;
  ink(stand, 0.04);
  root.add(stand);
  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 8, 20), toon(0x2a2440));
  cradle.rotation.x = Math.PI / 2;
  cradle.position.y = 0.9;
  root.add(cradle);
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), glow(TEAL));
  stone.position.y = 1.8;
  root.add(stone);
  const aGlow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  aGlow.position.copy(stone.position);
  root.add(aGlow);
  return {
    root,
    update: (dt, t) => { stone.rotation.y += dt * 1.5; aGlow.scale.setScalar(1 + Math.sin(t * 4) * 0.15); },
  };
}

// ---- the Whispering Fissure ------------------------------------------------------------------------------------------
// Secrets.buildFissure (trench, tunnel, gate chamber, shrine; local frame y up, ground y = 0, rooms 34 m below) runs here
// unchanged on a stand-in `this`: bare location group, real World.put / toWorld, a col() that records colliders, and a
// dummy planet whose hole uniforms soak up the terrain cut. Lifted 34 m (rooms on the Row floor), turned along the row,
// roofs hidden.
function fissure() {
  const FLOOR = -34, LIFT = 34, TURN = Math.PI / 2;
  const W = World.prototype;
  const specs = [];
  const loc = { group: new THREE.Group(), pos: V(0, 3600, 0), dir: V(0, 1, 0) };
  const hole = { uHoleOn: { value: 0 }, uHoleO: { value: V(0, 0, 0) }, uHoleX: { value: V(0, 0, 0) }, uHoleY: { value: V(0, 0, 0) }, uHoleZ: { value: V(0, 0, 0) }, uHoleMin: { value: new THREE.Vector2() }, uHoleMax: { value: new THREE.Vector2() } };
  const self = {
    game: { world: { put: W.put, curveR: W.curveR, toWorld: W.toWorld, col: (l, spec) => { specs.push(spec); return spec; } }, planet: { R: 3600, holeU: hole }, colliders: { remove() {} } },
    loc,
    state: { artifactTaken: false, gateOpen: false, skatesTaken: false },
    glyphTexture: Secrets.prototype.glyphTexture,
    applyGateOpen() {},
  };
  Secrets.prototype.buildFissure.call(self);
  const inner = loc.group;
  // roofs: the 1.2 m thick boxes (buildFissure's `box(..., rm.ceil, rm.ceil + 1.2, ...)`)
  inner.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && Math.abs(o.geometry.parameters.height - 1.2) < 1e-6) o.visible = false; });
  inner.rotation.y = TURN;
  inner.position.y = LIFT;
  const root = new THREE.Group();
  root.add(inner);
  const c = Math.cos(TURN), s = Math.sin(TURN);
  const cols = specs.map((k) => {
    const x = k.x * c + k.z * s, z = -k.x * s + k.z * c;
    if (k.type === 'sphere') return { type: 'sphere', x, y: k.y + LIFT, z, r: k.r };
    if (k.type === 'cyl') return { type: 'cyl', x, z, y0: k.y0 + LIFT, y1: k.y1 + LIFT, r: k.r };
    return { type: 'box', x, y: k.y + LIFT, z, hx: k.hx, hy: k.hy, hz: k.hz, yaw: (k.yaw || 0) + TURN };
  });
  const G = self.gate, S = self.shrine;
  return {
    root,
    cols,
    update: (dt, t) => { // as Secrets.update
      G.runes.rotation.z += dt * 0.15;
      S.skates.rotation.y += dt;
      const sh = S.skates.userData.shards;
      if (sh) { sh.rotation.y -= dt * 2.2; for (const k of sh.children) k.rotation.x += dt * 3; }
      S.skates.position.y = FLOOR + 3.2 + Math.sin(t * 2) * 0.25;
    },
  };
}

// ---- the Spindle's props (spindle.js Kit pieces) ---------------------------------------------------------------------
const kit = (fn) => { const k = new Kit(TEAL, 5, false); fn(k); return k.finish().root; };

function landerItem() {
  const root = kit(lander);
  return { root: seat(root).root, update: animate(root) };
}
function spires() {
  const parts = [[0.8, 0.5], [1.25, 2.2], [1.7, 4]].map(([sc, yaw]) => { const o = kit(spire); o.scale.setScalar(sc); o.rotation.y = yaw; return seat(o); });
  return { root: lineUp(parts, 3).root };
}
function obeliskItem() {
  return { root: seat(kit(obelisk)).root };
}
function shrineItem() {
  const root = new THREE.Group();
  root.add(kit(shrine));
  // the Quantum Core on its pedestal as spindle.js places it (core 4.2 m up, shrine sunk 0.2): octahedron in a soft sphere, turning
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), glow(TEAL));
  core.add(new THREE.Mesh(new THREE.SphereGeometry(3, 16, 10), BEAM(TEAL, 0.22)));
  core.position.y = 4.4;
  root.add(core);
  return { root: seat(root).root, update: (dt) => { core.rotation.y += dt * 1.8; } };
}
function extractionPad() {
  return { root: seat(kit(extract)).root };
}
function mothership() {
  const m = makeMothership();
  const p = seat(m.root, { y: 14 }); // hovering (92 m up in the game)
  return {
    root: p.root,
    update: (dt, t) => { m.eyes.forEach((e, i) => e.scale.setScalar(1 + Math.sin(t * 3 + i * 2.1) * 0.12)); },
  };
}
function drones() {
  const lit = makeDrone(), dark = makeDrone();
  dark.userData.core.material = dark.userData.core.userData.dark; // dark = stunned (spindle.js updateDrones)
  lit.position.y = dark.position.y = 1.5;
  const parts = [seat(lit, { lift: false }), seat(dark, { lift: false })];
  const root = lineUp(parts, 3).root;
  return { root, update: (dt, t) => { lit.rotation.y += dt * 0.8; dark.rotation.y += dt * 0.8; lit.position.y = 2.4 + Math.sin(t * 2) * 0.25; dark.position.y = 2.4 + Math.sin(t * 2 + 1) * 0.25; } };
}

export default {
  id: 'props.secrets',
  title: '12 · SECRETS & THE SPINDLE',
  items: [
    { id: 'secret.sat7', label: 'SAT-7 "LANTERN"', w: 66, d: 27, make: sat7 },
    { id: 'secret.alien-artifact', label: 'ALIEN ARTIFACT', w: 2.8, d: 2.8, solid: false, make: artifact },
    { id: 'secret.fissure', label: 'WHISPERING FISSURE (ROOFS OFF)', w: 221, d: 46, big: true, make: fissure },
    { id: 'spindle.lander', label: 'SPINDLE LANDER', w: 25, d: 25, make: landerItem },
    { id: 'spindle.spire', label: 'CRYSTAL SPIRES', w: 49, d: 20, make: spires },
    { id: 'spindle.obelisk', label: 'OBELISK', w: 2.2, d: 1, make: obeliskItem },
    { id: 'spindle.shrine', label: 'CORE SHRINE', w: 34, d: 34, make: shrineItem },
    { id: 'spindle.extraction-pad', label: 'EXTRACTION PAD', w: 56, d: 56, make: extractionPad },
    { id: 'spindle.mothership', label: 'MOTHERSHIP', w: 86, d: 86, solid: false, make: mothership },
    { id: 'spindle.drone', label: 'ALIEN DRONES', w: 13, d: 5, solid: false, make: drones },
  ],
};

/*
SKIPPED:
- The Spindle rock (spindle.rock): a 5.4 km asteroid with its own world (gravity axis, terrain worker, sky); the Row is
  already one such world. Only its props are here.
- The Spindle in the Moon's sky (spindle.sky-asteroid, world.js buildSky: spindleGeometry(2000, 260, 3), 5200 m above the
  Monolith): a 2 km overhead sky object of the same shape.
- Far planets, Earth and sun (sky.planets-earth-sun, models.js makePlanets, world.js buildSky): a backdrop on a 6-7 km
  dome round the camera. The Row has its own star dome (assetRow.js).
- The Xenoglide skates (secrets.js makeXenoSkates) sit on their Fissure pedestal; their showcase is runner.xenoskates.
*/
