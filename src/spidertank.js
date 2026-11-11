import * as THREE from 'three';
import { toon, glow, inkMat } from './toon.js';
import { loadSpiderTankKit } from './models.js';
import { makeSpiderWalk, HULL, HULL3 } from './spiderwalk.js';

// Zbornak's spider tank, ARACHNE: the Triple Crown's reward (tools/blender/build_spidertank.py; docs/spidertank/; reviewed in
// tools/spidertank-lab.html). Eight armoured legs carry it any way it is driven (ahead, back, sideways, turning to where it is aimed):
// the hull stands on its feet and goes only as far as its planted legs reach, each foot planted, stepping or reaching, and it climbs
// what its legs can (src/spiderwalk.js has how). Past SKIM_AT it closes up into a skimming bead (overdrive), unless it is climbing,
// and opens out under SKIM_OFF: each leg zigzags against the hull, slides in through its port and a hatch shuts over it, the cannon
// draws into the nose, the jets come out; every piece follows its own share of the fold (the model's `fold`, `foldPos`, `foldScale`
// and their spans). Its rams (barrel and rod pivots) aim at each other every frame, so they stretch as the legs move. The reactor beam
// charges for a second while the trigger is held, then channels for four from the cannon; in spider form only (held in the bead, it
// does nothing), slow while it does, and while fire is held it stays a spider (under SKIM_AT).
//
// loadSpiderTank() -> kit; makeSpiderTank(kit) -> tank: { root, update(dt, { speed, push, ground, ray, trigger }), folded(f), hits }.
// The caller places root (on the ground under the hull's middle, or anything under it: the hull keeps its own height in the world, +z
// ahead) before update; ground(p, out[, ceil]) puts the top under world point p in out (with ceil: null where p is inside something
// taller), and ray(from, dir, far, out) the first thing on that line within far (or null), for feet on the faces of things. speed is how
// fast it goes ahead (negative, backing up); push is what the driver asks for: a number (m/s ahead) or { x, z } (m/s across and ahead,
// in the root's frame: +x is its left), whatever it is making: pushed on but held up, it climbs. tank.hits(x, y, z, yaw) is how far into
// things the hull would be with the root there (the caller's collision: never move or turn it deeper). tank.form ('walk', 'folding',
// 'skim'), tank.beam ({ state: 'idle' | 'charge' | 'fire', t }), tank.speedCap (a fraction of the asked-for speed, while the beam is
// up), tank.speedMax (m/s it keeps under: fire held, climbing, or its legs holding it back), tank.climbing and tank.pose (the hull's:
// H over the root, W in the world, P, R) read back.
const URL_GLB = new URL('./assets/spidertank.glb', import.meta.url).href;
let KIT = null;
export const loadSpiderTank = () => KIT || (KIT = loadSpiderTankKit(URL_GLB));

// Zbornak's lab: its off-white and pale grey panels, dark frame, the reactor's violet; his green only on the LEDs
export const PALETTE = {
  toon: { armor: 0xe8e4f4, armor2: 0xc9c4d8, frame: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0 },
  glow: { core: 0xc77dff, visor: 0x9be7ff, led: 0x7dff3a, thrust: 0xd9a6ff },
  beam: 0xc77dff, hot: 0xf4e6ff,
};

const SKIM_AT = 25, SKIM_OFF = 21; // m/s: it closes up past the first, opens out under the second
const FOLD_TIME = 1.3;          // s to close up into the bead, or open out of it
const CLEAR = 0.5;              // m the bead keeps over whatever it skims over (and what it will be over in LOOK s)
const LOOK = 0.6;               // s ahead it looks for what it will be over
const SKIM_RISE = 2.5;          // m the folded hull rises on its jets over what is under it, at most
const HOVER = 0.9;              // m higher the folded hull floats than its jets alone would hold it (1.5 m off the ground)
const BOB = 0.14;               // m it rises and falls on its jets, floating (and a little roll and pitch with it)
const BANK = 0.5;               // rad of roll per rad/s of turn, floating (at most 0.3)
const TRAIL = 0.34, TRAIL_W = 0.32;   // s a jet's trail lasts, m its width at the nozzle (the belly jets': 0.6 of both)
const REVERSE = 18;             // m/s the most it backs up at
const STRAFE = 12;              // m/s the most it goes sideways
const TURN = 1.8, TURN_ROUGH = 0.6;   // rad/s the most it turns on its legs: as fast as they step round; and on rough ground
const CLIMB = 10;               // m it climbs (tank.climbMax), measured: its rear legs straight under it, its front legs over the edge
const CHARGE = 1.0, FIRE = 4.0; // s: the beam's charge (the trigger held) and its channel
const BEAM_RANGE = 420;         // m
const BEAM_SLOW = 0.3;          // the speed it may keep while charging and firing (of what is asked)

export { HULL, HULL3 };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(), _push = new THREE.Vector3();

function group(node, pal, mats) {
  const g = new THREE.Group();
  g.name = node.name;
  g.position.copy(node.pos);
  g.quaternion.copy(node.quat);
  Object.assign(g.userData, node.data);
  if (node.role && node.role !== 'root') g.userData.role = node.role;
  for (const { slot, geo } of node.parts) {
    const lit = slot in pal.glow;
    const m = new THREE.Mesh(geo, mats[slot] || (mats[slot] = lit ? glow(pal.glow[slot]) : toon(pal.toon[slot] ?? 0xff00ff)));
    m.castShadow = !lit;
    g.add(m);
  }
  if (node.ink) { const m = new THREE.Mesh(node.ink, inkMat); m.userData.isInk = true; g.add(m); }
  for (const k of node.kids) g.add(group(k, pal, mats));
  return g;
}

// a piece's share of the fold: 0 before its span, 1 after, eased in between
const share = (f, [a, b]) => { const k = THREE.MathUtils.clamp((f - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export function makeSpiderTank(kit) {
  const node = kit.spidertank, pal = PALETTE, mats = {};
  const root = new THREE.Group(), inner = new THREE.Group();
  const model = group(node, pal, mats);
  model.position.set(0, 0, 0);
  root.add(inner);
  inner.add(model);
  const find = (role) => { let o = null; model.traverse((c) => { if (!o && c.userData.role === role) o = c; }); return o; };
  const legs = [], rams = [];
  model.traverse((c) => {
    if (c.userData.role === 'ram') rams.push({ barrel: c, rod: model.getObjectByName(c.userData.to) });
    if (c.userData.role !== 'leg') return;
    // a tetrapod: the left front, right second, left third and right back legs step together, then the other four
    const set = (c.userData.n + (c.userData.side > 0 ? 1 : 0)) % 2;
    legs.push({ node: c, ph: set ? Math.PI : 0, swing: 0 });
  });
  // what moves for overdrive, each over its own span
  const parts = [];
  model.traverse((o) => {
    const d = o.userData;
    if (!d.fold && !d.foldPos && !d.foldScale) return;
    parts.push({
      o, gait: d.role === 'leg' || d.role === 'knee', span: d.foldSpan || [0, 1], posSpan: d.foldPosSpan || d.foldSpan || [0, 1],
      q0: o.quaternion.clone(), q1: d.fold && new THREE.Quaternion().fromArray(d.fold),
      p0: o.position.clone(), p1: d.foldPos && new THREE.Vector3().fromArray(d.foldPos), scale: d.foldScale,
    });
  });
  const { hipY, skimDrop, belly } = node.data;
  let ground = null;

  const vel = new THREE.Vector3(), prev = new THREE.Vector3();         // (how fast it goes, measured)
  // the highest thing under the hull's outline (now, and where it will be in LOOK s), over the root, along up: what the bead skims over
  function under() {
    _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    _d.setFromMatrixPosition(root.matrixWorld);
    let top = -Infinity;
    for (const ahead of [0, LOOK]) {
      for (const [x, z] of HULL) {
        _a.set(x, 0, z).applyMatrix4(root.matrixWorld).addScaledVector(vel, ahead);
        if (ground(_a, _b)) top = Math.max(top, _b.sub(_d).dot(_up));
      }
    }
    return top;
  }
  const walk = makeSpiderWalk(root, inner, legs, hipY);
  const muzzle = find('muzzle');
  const core0 = new THREE.Color(pal.glow.core), hot = new THREE.Color(pal.hot);

  // the beam: a glow round a white-hot core, from the muzzle along its +z, and a flare where it leaves
  const beamMat = new THREE.MeshBasicMaterial({ color: pal.beam, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const hotMat = new THREE.MeshBasicMaterial({ color: pal.hot, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Group();
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const outer = new THREE.Mesh(tubeGeo, beamMat), core = new THREE.Mesh(tubeGeo, hotMat);
  const flare = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), hotMat);
  beam.add(outer, core);
  muzzle.add(beam, flare);
  beam.visible = false;
  flare.visible = false;
  for (const m of [outer, core, flare]) m.renderOrder = 3;

  // the jets' trails: in the world (tank.fx, put beside the root), a ribbon each, crossed with a second so it reads from any side, from
  // white-hot at the nozzle to the thrust's violet, thinning and fading as it ages
  const fx = new THREE.Group();
  fx.name = 'spidertank-fx';
  const thrust = new THREE.Color(pal.glow.thrust), _col = new THREE.Color();
  const trails = [];
  model.traverse((o) => {
    if (!/^(jet\d|tailjet)$/.test(o.name)) return;
    const tail = o.name === 'tailjet', N = 48;               // (points at most: 0.34 s at 140 frames a second)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i + 1 < N; i++) for (const r of [0, 2]) { const a = i * 4 + r, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    fx.add(mesh);
    trails.push({ jet: o, mesh, pts: [], life: TRAIL * (tail ? 1 : 0.6), width: TRAIL_W * (tail ? 1 : 0.6), at: new THREE.Vector3(0, tail ? 0 : -0.08, tail ? -0.45 : 0) });
  });
  const _side = new THREE.Vector3(), _top = new THREE.Vector3(), _n2 = new THREE.Vector3();
  // each trail's newest point at its nozzle (k: how lit the jets are; t flickers them), the old ones aged out, and its ribbons rebuilt
  function trailsTo(dt, k, t) {
    if (!fx.parent && root.parent) root.parent.add(fx);
    _side.setFromMatrixColumn(root.matrixWorld, 0).normalize();
    _top.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    for (const T of trails) {
      for (const q of T.pts) q.age += dt;
      while (T.pts.length && T.pts[0].age > T.life) T.pts.shift();
      if (k > 0.01) {
        const q = T.pts.length >= 48 ? T.pts.shift() : { p: new THREE.Vector3(), age: 0, k: 0 };
        q.p.copy(T.at).applyMatrix4(T.jet.matrixWorld); q.age = 0; q.k = k;
        T.pts.push(q);
      }
      const P = T.mesh.geometry.attributes.position, C = T.mesh.geometry.attributes.color, n = T.pts.length;
      for (let i = 0; i < n; i++) {
        const q = T.pts[n - 1 - i], a = q.age / T.life, w = T.width * q.k * (1 - a) ** 0.6 * (0.85 + 0.15 * Math.sin(t * 47 + i));
        _col.copy(hot).lerp(thrust, Math.min(1, a * 2.2)).multiplyScalar(q.k * (1 - a) ** 1.6);
        for (let r = 0; r < 4; r++) {
          _n2.copy(r < 2 ? _top : _side).multiplyScalar(r % 2 ? -w : w).add(q.p);
          P.setXYZ(i * 4 + r, _n2.x, _n2.y, _n2.z);
          C.setXYZ(i * 4 + r, _col.r, _col.g, _col.b);
        }
      }
      T.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 12);
      P.needsUpdate = C.needsUpdate = true;
      T.mesh.visible = n > 1;
    }
  }

  const tank = {
    root, model, inner, walk, legs, muzzle, hipY, span: node.data.span, fx,
    form: 'walk', fold: 0, beam: { state: 'idle', t: 0 }, speedCap: 1, speedMax: Infinity, hits: walk.hits, pose: walk.pose,
    skimLift: 0, yaw: 0, bank: 0, climbing: false,
    shove: walk.shove,                                               // a velocity (world) it asks its driver for besides the push: backing off a wall it gave up at
    walkMax: SKIM_AT,                                                // m/s past which it closes up to skim (overdrive)
    reverseMax: REVERSE,                                             // m/s the most it backs up at
    strafeMax: STRAFE,                                               // m/s the most it goes sideways
    turnMax: TURN,                                                   // rad/s the most it turns, on its legs (to where it is aimed); less on rough ground
    climbMax: CLIMB,                                                 // m the most it climbs: as measured in the lab's sweep (its legs set it: src/spiderwalk.js)
    t: 0,
    // the pieces f of the way into the bead (the legs from where the gait left them, or, still, from as built), the hull settled
    folded(f, still = true) {
      for (const P of parts) {
        if (P.q1) {
          if (still || !P.gait) P.o.quaternion.copy(P.q0);
          const k = share(f, P.span);
          if (k > 0) P.o.quaternion.slerp(P.q1, k);
          if (P.o.userData.role === 'hatch') P.o.visible = k > 0;                         // (stowed open inside the hull: out of sight)
        }
        if (P.p1) P.o.position.lerpVectors(P.p0, P.p1, share(f, P.posSpan));
        if (P.scale) {
          const k = share(f, P.span);
          P.o.scale.setScalar(Math.max(0.001, P.scale[0] + (P.scale[1] - P.scale[0]) * k));
          P.o.visible = k > 0.01;
        }
      }
      if (still) inner.position.set(0, 0, 0);
      inner.position.y -= skimDrop * share(f, [0.3, 1]);
      this.aimRams();
      return this;
    },
    // each ram's barrel and rod turned to face each other, so it stretches and shortens as its joint moves
    aimRams() {
      inner.updateMatrixWorld(true);
      for (const R of rams) {
        R.barrel.lookAt(R.rod.getWorldPosition(_a));
        R.rod.lookAt(R.barrel.getWorldPosition(_b));
      }
    },
    update(dt, { speed = 0, push: want = speed, ground: g = null, ray = null, trigger = false } = {}) {
      ground = g;
      this.t += dt;
      root.updateWorldMatrix(true, false);
      _a.setFromMatrixPosition(root.matrixWorld);
      if (dt > 0 && this.t > dt) vel.lerp(_b.subVectors(_a, prev).divideScalar(dt), 1 - Math.exp(-dt * 8));
      prev.copy(_a);
      const B = this.beam;
      // the beam: hold to charge (in spider form only), let go early and it fizzles; charged, it channels FIRE seconds
      if (B.state === 'idle' && trigger && this.fold === 0) Object.assign(B, { state: 'charge', t: 0 });
      else if (B.state === 'charge') { B.t += dt; if (!trigger) B.state = 'idle'; else if (B.t >= CHARGE) Object.assign(B, { state: 'fire', t: 0 }); }
      else if (B.state === 'fire') { B.t += dt; if (B.t >= FIRE) B.state = 'idle'; }
      const firing = B.state !== 'idle';
      this.speedCap = firing ? BEAM_SLOW : 1;
      // (fire counts in spider form only: in the bead it does nothing; held walking, it stays a spider, under SKIM_AT)
      const hold = trigger && this.fold === 0;
      this.speedMax = hold || firing ? SKIM_AT - 0.5 : Infinity;
      // overdrive: close up past SKIM_AT, open out under SKIM_OFF (never while the beam is up or fire is held, nor start while it climbs)
      const skimWant = (this.fold > 0.5 ? speed > SKIM_OFF : speed >= SKIM_AT && !(this.fold === 0 && this.climbing)) && !firing && !hold;
      this.fold = THREE.MathUtils.clamp(this.fold + (skimWant ? dt : -dt) / FOLD_TIME, 0, 1);
      this.form = this.fold <= 0 ? 'walk' : this.fold >= 1 ? 'skim' : 'folding';
      // the legs: on their feet until they start to fold, and again as they finish opening (folding, they keep the shape they had, and
      // the hull settles level)
      if (ground && this.fold < 0.15) {
        // (what the driver asks for, in the world: a number is ahead)
        if (typeof want === 'number') _push.set(0, 0, want); else _push.set(want.x, 0, want.z);
        walk.update(dt, { ground, ray, push: _push.transformDirection(root.matrixWorld).multiplyScalar(typeof want === 'number' ? Math.abs(want) : Math.hypot(want.x, want.z)) });
        this.climbing = walk.climbing;
        if (this.fold === 0) this.speedMax = Math.min(this.speedMax, walk.speedMax);
        this.turnMax = walk.rough ? TURN_ROUGH : TURN;                    // (picking its footing, it turns slowly)
      } else {
        walk.freeze();
        walk.shove.set(0, 0, 0);
        inner.position.set(0, 0, 0);
        inner.quaternion.identity();
        const rootUp = _up.setFromMatrixColumn(root.matrixWorld, 1).normalize().dot(_d.setFromMatrixPosition(root.matrixWorld));
        Object.assign(walk.pose, { H: hipY, W: rootUp + hipY, P: 0, R: 0 });
        this.climbing = false;
      }
      // folded, the hull rides its jets over what is under it
      const f = share(this.fold, [0.5, 1]);
      if (ground && this.fold > 0) {
        const rise = THREE.MathUtils.clamp(under() - (belly - skimDrop + HOVER) + CLEAR, 0, SKIM_RISE);
        this.skimLift += (rise - this.skimLift) * Math.min(1, dt * 6);
      } else this.skimLift = 0;
      inner.position.y += this.skimLift * share(this.fold, [0.3, 1]);
      this.folded(this.fold, false);
      // floating: higher on its jets, bobbing (never lower than HOVER), rolling into its turns and swaying a little
      const yawNow = Math.atan2(_a.setFromMatrixColumn(root.matrixWorld, 2).x, _a.z);
      const turn = dt > 0 ? (THREE.MathUtils.euclideanModulo(yawNow - this.yaw + Math.PI, Math.PI * 2) - Math.PI) / dt : 0;
      this.yaw = yawNow;
      this.bank += (THREE.MathUtils.clamp(-turn * BANK, -0.3, 0.3) - this.bank) * Math.min(1, dt * 3);
      if (f > 0) {
        inner.position.y += (HOVER + (1 + Math.sin(this.t * 2.3)) * BOB) * f;
        inner.rotation.set(Math.sin(this.t * 1.7) * 0.025 * f, 0, (this.bank + Math.sin(this.t * 1.3) * 0.02) * f);
      }
      // the jets' trails, as lit as the jets are out
      root.updateMatrixWorld(true);
      trailsTo(dt, share(this.fold, [0.7, 1]) * (0.75 + 0.25 * Math.min(1, speed / 60)), this.t);
      // the reactor and the cannon: brighter as it charges, flickering as it fires
      const heat = B.state === 'charge' ? B.t / CHARGE : B.state === 'fire' ? 1 : 0;
      mats.core.color.copy(core0).lerp(hot, heat * (0.6 + 0.4 * Math.sin(this.t * 40)));
      flare.visible = heat > 0;
      flare.scale.setScalar(B.state === 'charge' ? 0.15 + 0.5 * B.t / CHARGE : 0.7 + Math.sin(this.t * 37) * 0.1);
      beam.visible = B.state === 'fire';
      if (beam.visible) {
        const k = Math.min(1, B.t / 0.12) * Math.min(1, (FIRE - B.t) / 0.3);                // (snaps on, tails off)
        const w = (0.42 + Math.sin(this.t * 53) * 0.05) * k;
        outer.scale.set(w, w, BEAM_RANGE);
        core.scale.set(w * 0.38, w * 0.38, BEAM_RANGE);
        beamMat.opacity = 0.5 * k;
      }
      return this;
    },
  };
  tank.folded(0);
  return tank;
}
