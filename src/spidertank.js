import * as THREE from 'three';
import { toon, glow, inkMat } from './toon.js';
import { loadSpiderTankKit } from './models.js';
import { makeGait } from './gait.js';

// Zbornak's spider tank, ARACHNE: the Triple Crown's reward (tools/blender/build_spidertank.py; docs/spidertank/; reviewed in
// tools/spidertank-lab.html). Eight armoured legs walk it by the chimeras' gait (src/gait.js: planted feet, two sets of four that take
// turns, IK), striding longer the faster it goes. Its hull rides on its feet: at least CLEAR over whatever is under it, never higher
// than its planted legs can hold it (what it can't clear, tank.clearTop, is a wall to the caller), and each foot only steps where its
// leg can reach. Past SKIM_AT it closes up into a skimming bead (overdrive) and back under SKIM_OFF: each leg zigzags against the hull,
// slides in through its port and a hatch shuts over it, the cannon draws into the nose, the jets come out; every piece follows its own
// share of the fold (the model's `fold`, `foldPos`, `foldScale` and their spans). Its rams (barrel and rod pivots) aim at each other
// every frame, so they stretch as the legs move. The reactor beam charges for a second while the trigger is held, then channels for
// four from the cannon; walking only, and slow while it does.
//
// loadSpiderTank() -> kit; makeSpiderTank(kit) -> tank: { root, update(dt, { speed, ground, trigger }), folded(f) }. The caller places
// root (on the terrain under the hull's middle, +z ahead) before update; ground(p, out[, ceil]) as gait.js has it, and (optional)
// ray(from, dir, far, out): the first thing on that line within far, into out (or null), for feet on the faces of things. tank.form ('walk',
// 'folding', 'skim'), tank.beam ({ state: 'idle' | 'charge' | 'fire', t }), tank.speedCap (a fraction of the asked-for speed, while the
// beam is up) and tank.clearTop (the highest top, along up, the hull can pass over now) read back.

const URL_GLB = new URL('./assets/spidertank.glb', import.meta.url).href;
let KIT = null;
export const loadSpiderTank = () => KIT || (KIT = loadSpiderTankKit(URL_GLB));

// Zbornak's lab: its off-white and pale grey panels, dark frame, the reactor's violet; his green only on the LEDs
export const PALETTE = {
  toon: { armor: 0xe8e4f4, armor2: 0xc9c4d8, frame: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0 },
  glow: { core: 0xc77dff, visor: 0x9be7ff, led: 0x7dff3a, thrust: 0xd9a6ff },
  beam: 0xc77dff, hot: 0xf4e6ff,
};

const SKIM_AT = 40, SKIM_OFF = 34; // m/s: it closes up past the first, opens out under the second
const FOLD_TIME = 1.3;          // s to close up into the bead, or open out of it
const CLEAR = 0.5;              // m the hull keeps over whatever is under it (and what it will be over in LOOK s)
const LOOK = 0.6;               // s ahead it looks for what it will be over
const SKIM_RISE = 2.5;          // m the folded hull rises on its jets over what is under it, at most
const HOVER = 0.9;              // m higher the folded hull floats than its jets alone would hold it (1.5 m off the ground)
const BOB = 0.14;               // m it rises and falls on its jets, floating (and a little roll and pitch with it)
const BANK = 0.5;               // rad of roll per rad/s of turn, floating (at most 0.3)
const TRAIL = 0.34, TRAIL_W = 0.32;   // s a jet's trail lasts, m its width at the nozzle (the belly jets': 0.6 of both)
const RIDE = 4;                 // 1/s the hull follows its feet
const DROP = 0.9;               // m a foot stands below its hip at least (the knee bends up over it; higher, the hull rises first)
const STRETCH = 1;              // of a leg's reach, past which a trailing foot is due to step (the stride plans to 0.97; at 1.06 it goes at once)
const NEAR = 0.45;              // of a leg's reach, the closest to its hip a foot stands (on the face of something beside it)
const CHARGE = 1.0, FIRE = 4.0; // s: the beam's charge (the trigger held) and its channel
const BEAM_RANGE = 420;         // m
const BEAM_SLOW = 0.3;          // the speed it may keep while charging and firing (of what is asked)

// the hull's outline over the ground (x across, z ahead, in the root's frame: the bead and the cannon's tip), where it looks for what is
// under it; the caller can test it against what it drives into (the lab does)
export const HULL = [[0, 4.8]];
for (const x of [-2.1, -1.05, 0, 1.05, 2.1]) for (const z of [-3.4, -1.7, 0, 1.7, 3.3]) if ((x / 2.3) ** 2 + (z / 3.6) ** 2 <= 1.05) HULL.push([x, z]);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _inv = new THREE.Matrix4();

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
  let ground = null, ray = null, lastCap = 0, underNow = 0;

  // the highest thing under the hull (now, and where it will be in LOOK s), over the root, along up (now alone: underNow)
  const vel = new THREE.Vector3(), prev = new THREE.Vector3();
  function under() {
    _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    _d.setFromMatrixPosition(root.matrixWorld);
    let top = -Infinity;
    for (const ahead of [0, LOOK]) {
      for (const [x, z] of HULL) {
        _a.set(x, 0, z).applyMatrix4(root.matrixWorld).addScaledVector(vel, ahead);
        if (ground(_a, _b)) top = Math.max(top, _b.sub(_d).dot(_up));
      }
      if (!ahead) underNow = top;
    }
    return top;
  }
  // the hull's lift: as its feet go, but CLEAR over what is under it, and no higher than every planted leg can still reach down from
  // (what it can't clear past that, it won't walk onto: clearTop)
  function rideHeight() {
    const need = under() - belly + CLEAR;
    _inv.copy(root.matrixWorld).invert();
    let cap = Infinity, h = 0;
    for (const c of tank.gait.chains) {
      // (its feet's mean height lifts it, but not a foot on the face of something, under the top just past it: it would climb the wall)
      c.joints[0].getWorldPosition(_b);
      _e.subVectors(c.base, _b).addScaledVector(_up, -_e.subVectors(c.base, _b).dot(_up)).setLength(0.1).add(c.base);
      if (!(ground(_e, _c) && _c.sub(c.base).dot(_up) > 0.05)) h += _a.copy(c.base).applyMatrix4(_inv).y - c.rest.y;
      if (c.stepping) continue;                                       // (the planted feet hold it up)
      const f = _a.copy(c.F).applyMatrix4(_inv);
      const dh = Math.hypot(f.x - c.hip.x, f.z - c.hip.z);
      cap = Math.min(cap, f.y - c.hipY + Math.sqrt(Math.max(0, c.reach * c.reach - dh * dh)));
    }
    h /= tank.gait.chains.length;
    if (cap === Infinity) cap = lastCap;                              // (every foot up at once: as far as they last held it)
    lastCap = cap;
    // it passes over what's under its hull now, or what it can rise to clear (a low wall at speed, crouched on long strides, is no wall)
    tank.clearTop = _d.dot(_up) + Math.max(cap - CLEAR, inner.position.y) + belly;
    // (facing what it can't clear, it doesn't strain up at it; over it already, it never sinks into it, at worst resting on it)
    return need <= cap ? Math.max(h, need) : Math.max(Math.min(h, cap), underNow - belly);
  }
  // where foot c may stand near p: the highest thing there at least DROP below its hip (its knee bends up over it, as built), or where
  // the line from its hip down to that first meets something (the face of a crate or a wall: the foot grips its side); else the nearest
  // such spot toward its hip, or beside it (a face no closer to its hip than NEAR of its reach, nor past it).
  const hipW = new THREE.Vector3();
  function foothold(c, p, out, groundFn) {
    c.joints[0].getWorldPosition(hipW);
    const up = _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    const ceil = hipW.dot(up) - DROP;
    for (let k = 0; k <= 9; k++) {
      _c.copy(p);
      if (k) {
        _b.subVectors(hipW, p).addScaledVector(up, -_b.subVectors(hipW, p).dot(up));
        const toHip = _b.normalize();
        if (k <= 6) _c.addScaledVector(toHip, 0.5 * k);
        else _c.addScaledVector(_b.crossVectors(toHip, up), (k - 7.5) * 1.6);          // (beside it: -0.8, 0.8, 2.4)
      }
      const top = groundFn(_c, _e, ceil);                                         // (null: inside something taller)
      const aim = top || _c;
      const far = _f.subVectors(aim, hipW).length();
      if (ray && far > 1e-3 && ray(hipW, _f.divideScalar(far), far - 0.05, _d)) {  // (something in the way: the foot stands on it)
        const at = _d.distanceTo(hipW);
        if (_d.dot(up) <= ceil + 1e-3 && at >= NEAR * c.reach && at <= 1.1 * c.reach) return out.copy(_d);
        continue;
      }
      if (top) return out.copy(top);
    }
    return null;
  }
  // how badly planted foot c wants to step: as its leg, trailing below a risen hull, nears its full stretch, or at once if something has
  // come between its hip and its foot (the hull has gone on past an edge)
  function strain(c) {
    c.joints[0].getWorldPosition(hipW);
    const far = _f.subVectors(c.F, hipW).length();
    const raised = -_f.dot(_up.setFromMatrixColumn(root.matrixWorld, 1).normalize()) > c.hipY - c.rest.y + 0.3;
    let k = raised && (_f.dot(vel) < 0 || vel.lengthSq() < 0.01) ? 1 + (far - STRETCH * c.reach) / (0.06 * c.reach) : 0;
    if (ray && far > 0.2 && ray(hipW, _f.divideScalar(far), far - 0.15, _e)) k = Math.max(k, 2);
    return k;
  }
  // is world point p inside something (under the top of what is there): a knee or ankle there turns aside (gait.js)
  const _s = new THREE.Vector3();
  const solid = (p) => !!ground && !!ground(p, _s) && _s.sub(p).dot(_up) > 0.05;
  const gait = makeGait(root, inner, legs, { air: false, body: rideHeight, followRate: RIDE, foothold, strain, solid, long: true, pole: true });
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
    root, model, inner, gait, legs, muzzle, hipY, span: node.data.span, fx,
    form: 'walk', fold: 0, beam: { state: 'idle', t: 0 }, speedCap: 1, clearTop: Infinity, skimLift: 0, yaw: 0, bank: 0,
    walkMax: SKIM_AT,                                                // m/s past which it closes up to skim (overdrive)
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
    update(dt, { speed = 0, ground: g = null, ray: r = null, trigger = false } = {}) {
      ground = g; ray = r;
      this.t += dt;
      root.updateWorldMatrix(true, false);
      _a.setFromMatrixPosition(root.matrixWorld);
      if (dt > 0 && this.t > dt) vel.lerp(_b.subVectors(_a, prev).divideScalar(dt), 1 - Math.exp(-dt * 8));
      prev.copy(_a);
      const B = this.beam;
      // the beam: hold to charge (walking only: it opens up first), let go early and it fizzles; charged, it channels FIRE seconds
      if (B.state === 'idle' && trigger && this.fold === 0) Object.assign(B, { state: 'charge', t: 0 });
      else if (B.state === 'charge') { B.t += dt; if (!trigger) B.state = 'idle'; else if (B.t >= CHARGE) Object.assign(B, { state: 'fire', t: 0 }); }
      else if (B.state === 'fire') { B.t += dt; if (B.t >= FIRE) B.state = 'idle'; }
      const firing = B.state !== 'idle';
      this.speedCap = firing ? BEAM_SLOW : 1;
      // overdrive: close up past SKIM_AT, open out under SKIM_OFF (never while the beam is up)
      const skimWant = (this.fold > 0.5 ? speed > SKIM_OFF : speed >= SKIM_AT) && !firing && !trigger;
      this.fold = THREE.MathUtils.clamp(this.fold + (skimWant ? dt : -dt) / FOLD_TIME, 0, 1);
      this.form = this.fold <= 0 ? 'walk' : this.fold >= 1 ? 'skim' : 'folding';
      // the legs: walk (IK) until they start to fold, and again as they finish opening
      // (the hull where the gait left it, so its hips are where they are while it looks for footholds; folding, it settles)
      inner.position.set(0, this.fold < 0.15 ? gait.lift * gait.weight : 0, 0);
      gait.update(dt, ground && this.fold < 0.15 ? ground : null, false);
      if (this.fold >= 0.15) this.clearTop = Infinity;
      // folded, the hull rides its jets over what is under it
      const f = share(this.fold, [0.5, 1]);
      if (ground && this.fold > 0) {
        const rise = THREE.MathUtils.clamp(under() - (belly - skimDrop + HOVER) + CLEAR, 0, SKIM_RISE);
        this.skimLift += (rise - this.skimLift) * Math.min(1, dt * 6);
        if (this.fold >= 0.15) this.clearTop = _d.dot(_up) + SKIM_RISE + HOVER + belly - skimDrop - CLEAR;
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
  tank.gait = gait;
  tank.folded(0);
  return tank;
}
