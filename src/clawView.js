import * as THREE from 'three';
import { toon, inkMat } from './toon.js';
import { clawKindParts, clawNode, makeClawHead } from './models.js';
import { KINDS, TANK, CLAW_HOME } from './clawSim.js';

// Draws the Zero-G claw's tank (clawSim.js): each kind as InstancedMeshes, the claw, hose, beam, chains, blasts and shuffle
// jets. `group` is in the machine's frame, which is also the sim's coordinate frame.

const CAP = { crate: 18, canister: 12, gear: 14, girder: 6, mine: 8, magnet: 4, tyre: 10, hullplate: 10, lockbox: 8, gem: 28, engine: 3, case: 8, chip: 3 };
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color(), _a = new THREE.Quaternion(), _v = new THREE.Vector3();
const AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_X = new THREE.Vector3(1, 0, 0);

export class ClawView {
  constructor(spots) {
    this.group = new THREE.Group();
    this.spots = spots;
    this.kinds = {};
    for (const kind of Object.keys(KINDS)) {
      const { parts, ink } = clawKindParts(kind);
      const cap = CAP[kind] || 8, meshes = [];
      for (const { geo, material, slot } of parts) {
        const im = new THREE.InstancedMesh(geo, material, cap);
        im.count = 0; im.frustumCulled = false; im.castShadow = false;
        if (kind === 'crate' && slot === 'crate') { for (let i = 0; i < cap; i++) im.setColorAt(i, _c.set(0xffffff)); im.tint = true; }
        this.group.add(im);
        meshes.push(im);
      }
      let inkMesh = null;
      if (ink) { inkMesh = new THREE.InstancedMesh(ink, inkMat, cap); inkMesh.count = 0; inkMesh.frustumCulled = false; inkMesh.userData.isInk = true; this.group.add(inkMesh); }
      this.kinds[kind] = { meshes, ink: inkMesh, cap };
    }
    // chains: links along the tow lines
    const link = clawNode('claw_link');
    this.links = new THREE.InstancedMesh(link.parts[0].geo, toon(0x8a87a0), 160);
    this.links.count = 0; this.links.frustumCulled = false;
    this.group.add(this.links);
    // the claw on its hose
    this.claw = new THREE.Group();
    this.head = makeClawHead();
    this.claw.add(this.head);
    this.hose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), toon(0x2a2540));
    this.carriage = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.5), toon(0xd8aa2e));
    this.group.add(this.claw, this.hose, this.carriage);
    // beam, and the depth guide (floor ring under the claw, line down to it)
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.visible = false;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 5, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.8 }));
    this.line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.group.add(this.beam, this.ring, this.line);
    // fireball pool
    this.booms = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffb21f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.userData = { life: 0, dur: 0.6, r: 1 };
      this.group.add(m);
      this.booms.push(m);
    }
    // the shuffle jets' plumes
    this.plumes = spots.jets.map((j) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.4, 10, 1, true).translate(0, -2.2, 0), new THREE.MeshBasicMaterial({ color: 0xff7ad9, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.copy(j.pos);
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.ghosts = [];   // last tank's items, flying out through the roof
    this.shuffleT = 0;
    this.spin = new Map();
    this.t = 0;
  }

  // old tank's items fly up into the nearest jet, shrinking
  retire(items) {
    const jets = this.spots.jets;
    for (const it of items) {
      let best = jets[0], bd = 1e9;
      for (const j of jets) { const d = Math.abs(j.pos.x - it.x); if (d < bd) { bd = d; best = j; } }
      this.ghosts.push({ it: { ...it }, jet: best.pos, t: 0, dur: 1.1 + Math.random() * 0.5 });
    }
    this.shuffleT = 3.2;
  }

  boom(x, y, z, r, dull = false) {
    const m = this.booms.find((b) => !b.visible) || this.booms[0];
    m.position.set(x, y, z);
    m.userData.life = 0; m.userData.dur = dull ? 0.4 : 0.65; m.userData.r = r;
    m.material.color.set(dull ? 0xff5a36 : 0xffb21f);
    m.visible = true;
  }

  setMatrix(kind, i, it, scale, extraSpin = 0) {
    _p.set(it.x, it.y, it.z);
    _q.set(it.qx, it.qy, it.qz, it.qw);
    if (extraSpin) { _a.setFromAxisAngle(AXIS_Y, extraSpin); _q.multiply(_a); }
    _s.setScalar(scale);
    _m.compose(_p, _q, _s);
    for (const im of this.kinds[kind].meshes) im.setMatrixAt(i, _m);
    const ink = this.kinds[kind].ink;
    if (ink) ink.setMatrixAt(i, _m);
  }

  // draw the sim's state
  sync(sim, dt) {
    this.t += dt;
    const counts = {};
    for (const k in this.kinds) counts[k] = 0;
    const put = (it, scale) => {
      const kind = it.kind, i = counts[kind];
      if (i >= this.kinds[kind].cap) return;
      counts[kind]++;
      let spin = 0;
      if (kind === 'gear') { spin = (this.spin.get(it.id) || 0) + (it.spin || 0) * dt; this.spin.set(it.id, spin); }
      this.setMatrix(kind, i, it, scale, spin);
      if (kind === 'crate') this.kinds.crate.meshes[0].setColorAt(i, _c.set(it.tint || 0xffffff));
    };
    for (const it of sim.items) {
      if (it.st === 'out') continue;
      const s = it.age < 0 ? 0 : Math.min(1, it.age / 0.7);
      const e = s * s * (3 - 2 * s);
      if (e > 0.01) put(it, e * (it.fuse >= 0 && !KINDS[it.kind].mine ? 1 + 0.06 * Math.sin(this.t * 40) : 1));
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      const k = Math.min(1, g.t / g.dur), e = k * k;
      const it = g.it;
      it.x += (g.jet.x - it.x) * Math.min(1, dt * 3 * (0.4 + e)); it.y += (6.5 - it.y) * Math.min(1, dt * 2.4); it.z += (g.jet.z - it.z) * Math.min(1, dt * 3);
      it.qx += dt * 0.6;
      const n = Math.hypot(it.qx, it.qy, it.qz, it.qw) || 1; it.qx /= n; it.qy /= n; it.qz /= n; it.qw /= n;
      if (k >= 1) { this.ghosts.splice(i, 1); continue; }
      put(it, 1 - e);
    }
    for (const kind in this.kinds) {
      const K = this.kinds[kind];
      for (const im of K.meshes) { im.count = counts[kind]; im.instanceMatrix.needsUpdate = true; if (im.tint && im.instanceColor) im.instanceColor.needsUpdate = true; }
      if (K.ink) { K.ink.count = counts[kind]; K.ink.instanceMatrix.needsUpdate = true; }
    }
    // chains
    let n = 0;
    for (const l of sim.links) {
      const a = l.a, b = l.b;
      if (a.st === 'out' || b.st === 'out') continue;
      _v.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const d = _v.length(), cnt = Math.max(2, Math.round(d / 0.2));
      _v.normalize();
      _q.setFromUnitVectors(AXIS_X, _v);
      for (let i = 0; i < cnt && n < 160; i++, n++) {
        const t = (i + 0.5) / cnt, sag = Math.sin(t * Math.PI) * Math.max(0, 0.9 - d * 0.5) * 0.22;
        _p.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag, a.z + (b.z - a.z) * t);
        _a.setFromAxisAngle(AXIS_X, (i % 2) * Math.PI / 2);
        const qq = _q.clone().multiply(_a);
        _m.compose(_p, qq, _s.setScalar(1));
        this.links.setMatrixAt(n, _m);
      }
    }
    this.links.count = n; this.links.instanceMatrix.needsUpdate = true;
    // the claw
    const c = sim.claw;
    this.claw.position.set(c.x, c.y, c.z);
    this.claw.rotation.set(c.vz * 0.05, c.spin, -c.vx * 0.05);
    const top = 6.4, hl = Math.max(0.01, top - (c.y + 0.75));
    this.hose.scale.set(1, hl, 1);
    this.hose.position.set(c.x, c.y + 0.75 + hl / 2, c.z);
    this.carriage.position.set(c.x, top + 0.02, c.z);
    this.beam.visible = c.beam;
    if (c.beam) {
      const pulse = 1 + 0.06 * Math.sin(this.t * 22);
      this.beam.position.set(c.x, c.y - 0.2, c.z);
      this.beam.scale.set(1.4 * pulse, 3.3, 1.4 * pulse);
      this.beam.material.opacity = 0.16 + 0.07 * Math.sin(this.t * 30);
    }
    this.ring.position.set(c.x, TANK.y0 + 0.02, c.z);
    this.ring.material.color.set(c.stun > 0 ? 0xff2a4a : 0x2ee6ff);
    const ll = Math.max(0.01, c.y - 0.5 - (TANK.y0 + 0.02));
    this.line.scale.set(1, ll, 1);
    this.line.position.set(c.x, TANK.y0 + 0.02 + ll / 2, c.z);
    // blasts
    for (const b of this.booms) {
      if (!b.visible) continue;
      const u = b.userData;
      u.life += dt;
      const k = u.life / u.dur;
      if (k >= 1) { b.visible = false; continue; }
      const e = 1 - (1 - k) * (1 - k);
      b.scale.setScalar(Math.max(0.01, u.r * (0.25 + 0.85 * e)));
      b.material.opacity = 0.75 * (1 - k);
    }
    // the shuffle's plumes
    if (this.shuffleT > 0) this.shuffleT -= dt;
    const on = this.shuffleT > 0 ? Math.min(1, this.shuffleT / 0.6, (3.2 - this.shuffleT) / 0.3) : 0;
    for (let i = 0; i < this.plumes.length; i++) {
      const pl = this.plumes[i];
      pl.visible = on > 0.01;
      if (pl.visible) { pl.material.opacity = 0.38 * on * (0.7 + 0.3 * Math.sin(this.t * 18 + i * 1.7)); pl.scale.set(1 + 0.15 * Math.sin(this.t * 12 + i), 0.9 + 0.2 * Math.sin(this.t * 9 + i * 2.1), 1); }
    }
  }
}

export { CLAW_HOME };
