import * as THREE from 'three';
import { toon, glow, inkMat } from './toon.js';
import { loadSpiderTankKit } from './models.js';
import { makeGait } from './gait.js';

// Zbornak's spider tank: the Triple Crown's reward, two proposals (tools/blender/build_spidertank.py; docs/spidertank-proposals/;
// reviewed in tools/spidertank-lab.html). Eight armoured legs walk it by the chimeras' gait (src/gait.js: planted feet, two sets that
// take turns, a tetrapod here, IK); past a run it folds them into the armour of a skimming frame (overdrive: each joint eases to its
// `fold` pose, the thrusters light). Its reactor beam charges for a second while the trigger is held, then channels for four, from
// the central cannon; walking only, and slow while it does.
//
// loadSpiderTanks() -> kit; makeSpiderTank(kit, 'a' | 'b') -> tank: { root, update(dt, { speed, ground, overdrive, trigger }) }.
// The caller places root (on the ground under the hull, +z ahead) before update. tank.form ('walk', 'folding', 'skim'), tank.beam
// ({ state: 'idle' | 'charge' | 'fire', t }) and tank.speedCap (a fraction of the asked-for speed, while the beam is up) read back.

const URL_GLB = new URL('./assets/spidertank.glb', import.meta.url).href;
let KIT = null;
export const loadSpiderTanks = () => KIT || (KIT = loadSpiderTankKit(URL_GLB));

export const PALETTES = {
  a: {
    toon: { armor: 0xf3eee4, trim: 0x7b2ff7, frame: 0x2a2540, steel: 0x55607a, metal: 0x8a87a0 },
    glow: { core: 0xc77dff, visor: 0x9be7ff, thrust: 0xd9a6ff },
    beam: 0xc77dff, hot: 0xf4e6ff,
  },
  b: {
    toon: { armor: 0x535a70, trim: 0x2ee6ff, frame: 0x1d1a29, steel: 0x8a87a0, metal: 0xb8b4c8 },
    glow: { core: 0x2ee6ff, visor: 0xffb347, thrust: 0x9cf6ff },
    beam: 0x2ee6ff, hot: 0xe6fdff,
  },
};

const FOLD_TIME = 0.7;          // s to fold into the skimming frame, or out of it
const SKIM_DROP = 0.28;         // folded, the hull rides this much lower (of the hip height): the tucked feet just clear the ground
const CHARGE = 1.0, FIRE = 4.0; // s: the beam's charge (the trigger held) and its channel
const BEAM_RANGE = 420;         // m
const BEAM_SLOW = 0.3;          // the speed it may keep while charging and firing (of what is asked)

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

export function makeSpiderTank(kit, which = 'a') {
  const node = kit['spider_' + which];
  const pal = PALETTES[which];
  const mats = {};
  const root = new THREE.Group(), inner = new THREE.Group();
  const model = group(node, pal, mats);
  model.position.set(0, 0, 0);
  root.add(inner);
  inner.add(model);
  const find = (role) => { let o = null; model.traverse((c) => { if (!o && c.userData.role === role) o = c; }); return o; };
  const legs = [];
  model.traverse((c) => {
    if (c.userData.role !== 'leg') return;
    // a tetrapod: the left front, right second, left third and right back legs step together, then the other four
    const set = (c.userData.n + (c.userData.side > 0 ? 1 : 0)) % 2;
    legs.push({ node: c, ph: set ? Math.PI : 0, swing: 0 });
  });
  const joints = [];
  for (const L of legs) for (let j = L.node; j; j = j.children.find((c) => c.userData.role === 'knee')) joints.push({ j, bind: j.quaternion.clone(), fold: new THREE.Quaternion().fromArray(j.userData.fold) });
  const gait = makeGait(root, inner, legs, { lift: 0.12 });
  const hipY = node.data.hipY;
  const cannon = find('cannon'), muzzle = find('muzzle'), skim = find('skim');
  const core0 = new THREE.Color(pal.glow.core), hot = new THREE.Color(pal.hot);
  skim.scale.setScalar(0.001);
  skim.visible = false;

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

  const tank = {
    root, model, inner, gait, legs, cannon, muzzle, which, hipY, span: node.data.span,
    form: 'walk', fold: 0, beam: { state: 'idle', t: 0 }, speedCap: 1,
    walkMax: 0.55 * gait.vmax,                                         // m/s past which it folds to skim (overdrive), at a run's end
    t: 0,
    // the joints part way (f) to the overdrive pose, from where the gait left them (or, still, from as built), the hull lowered
    folded(f, still = true) {
      for (const J of joints) {
        if (still) J.j.quaternion.copy(J.bind);
        if (f > 0) J.j.quaternion.slerp(J.fold, f);
      }
      if (still) inner.position.set(0, 0, 0);
      inner.position.y -= SKIM_DROP * hipY * f;
      skim.visible = f > 0.02;
      skim.scale.setScalar(Math.max(0.001, f));
      return this;
    },
    update(dt, { speed = 0, ground = null, overdrive = false, trigger = false } = {}) {
      this.t += dt;
      const B = this.beam;
      // the beam: hold to charge (walking only: it unfolds first), let go early and it fizzles; charged, it channels FIRE seconds
      if (B.state === 'idle' && trigger && this.fold < 0.05) Object.assign(B, { state: 'charge', t: 0 });
      else if (B.state === 'charge') { B.t += dt; if (!trigger) B.state = 'idle'; else if (B.t >= CHARGE) Object.assign(B, { state: 'fire', t: 0 }); }
      else if (B.state === 'fire') { B.t += dt; if (B.t >= FIRE) B.state = 'idle'; }
      const firing = B.state !== 'idle';
      this.speedCap = firing ? BEAM_SLOW : 1;
      // overdrive: fold when asked (the caller asks past walkMax; never while the beam is up), unfold when not
      const skimWant = overdrive && !firing && !trigger;
      this.fold = THREE.MathUtils.clamp(this.fold + (skimWant ? dt : -dt) / FOLD_TIME, 0, 1);
      this.form = this.fold <= 0 ? 'walk' : this.fold >= 1 ? 'skim' : 'folding';
      const f = this.fold * this.fold * (3 - 2 * this.fold);
      // the legs: walk (IK) while mostly unfolded, then ease each joint to its folded pose
      inner.position.set(0, 0, 0);
      gait.update(dt, this.fold < 0.35 ? ground : null, false);
      this.folded(f, false);
      if (f > 0.5) inner.position.y += (1 + Math.sin(this.t * 3.1)) * 0.04 * f;            // (riding its jets, never lower)
      // the reactor and the cannon: brighter as it charges, flickering as it fires
      const heat = B.state === 'charge' ? B.t / CHARGE : B.state === 'fire' ? 1 : 0;
      mats.core.color.copy(core0).lerp(hot, heat * (0.6 + 0.4 * Math.sin(this.t * 40)));
      flare.visible = heat > 0;
      const r = B.state === 'charge' ? 0.15 + 0.55 * B.t / CHARGE : 0.75 + Math.sin(this.t * 37) * 0.12;
      flare.scale.setScalar(r * (which === 'a' ? 1 : 0.85));
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
  return tank;
}
