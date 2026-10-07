import * as THREE from 'three';
import { toon, glow, ink, textSprite } from './toon.js';
import { frameQuat, tangent, arcDist, darkness } from './geo.js';
import { SKATES } from './cosmetics.js';

// The Moon's two big secrets.
// 1. SAT-7 "Lantern": a derelict satellite on a low, inclined orbit around the whole Moon. It
//    skims close to the ground near the ILMB once per lap; match its speed and land on it to
//    take the alien artifact on board (it rides in a sealed compartment of your jar).
// 2. The Whispering Fissure: a trench sliding into the Moon on the twilight side, leading to an
//    alien gate. Bring the artifact and the gate opens onto a shrine holding the legendary
//    Xenoglide Quantum-Lock Skates.
const KEY = 'moonrunner-secrets-v1';

SKATES.alien = { name: 'Xenoglide (Legendary)', color: 0x7dffd4, trail: 0x7dffd4, alien: true };

// Fissure layout, in the location's local frame (y up, ground at y = 0)
const FLOOR = -34;
const RAMP = { x: 6, z0: -70, z1: 20 };
const ROOMS = [
  { x0: -6, x1: 6, z0: 20, z1: 60, ceil: -24 }, // corridor
  { x0: -22, x1: 22, z0: 60, z1: 110, ceil: -16 }, // gate chamber
  { x0: -12, x1: 12, z0: 110, z1: 142, ceil: -18 }, // shrine (behind the gate)
];
const GATE_Z = 110;

// Satellite orbit
const SAT_SPEED = 55; // m/s along its path
const LOW_ALT = 34; // metres above the (smoothed) ground at the low point of each lap
const N_ORBIT = 1440;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Secrets {
  constructor(game) {
    this.game = game;
    this.state = { artifactTaken: false, gateOpen: false, skatesTaken: false };
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* fresh */ }
    this.loc = game.locations.find((l) => l.id === 'fissure');
    if (this.loc) this.buildFissure();
    this.buildSatellite();
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* unavailable */ } }

  // =====================================================================================
  // The Whispering Fissure
  // =====================================================================================
  buildFissure() {
    const g = this.game;
    const W = g.world;
    const loc = this.loc;
    const grp = loc.group;
    grp.updateMatrixWorld(true);
    this.inv = grp.matrixWorld.clone().invert();
    this.mat = grp.matrixWorld.clone();
    this.groundR = loc.pos.length();
    // cut the entrance in the terrain
    const H = g.planet.holeU;
    H.uHoleOn.value = 1;
    H.uHoleO.value.copy(loc.pos);
    H.uHoleX.value.set(1, 0, 0).applyQuaternion(grp.quaternion);
    H.uHoleY.value.set(0, 1, 0).applyQuaternion(grp.quaternion);
    H.uHoleZ.value.set(0, 0, 1).applyQuaternion(grp.quaternion);
    H.uHoleMin.value.set(-RAMP.x, RAMP.z0);
    H.uHoleMax.value.set(RAMP.x, RAMP.z1);
    this.rampN = new THREE.Vector3(0, 1, 34 / 90).normalize().applyQuaternion(grp.quaternion);
    g.planet.tunnel = { floor: (p, len, dx, dy, dz, r, outN) => this.floor(p, len, dx, dy, dz, r, outN) };
    this.cosNear = Math.cos(260 / g.planet.R);

    // ---- the build ----
    const rock = new THREE.MeshBasicMaterial({ color: 0x1d1830 });
    const rock2 = new THREE.MeshBasicMaterial({ color: 0x251f3d });
    const floorM = new THREE.MeshBasicMaterial({ color: 0x15111f });
    const box = (x0, x1, y0, y1, z0, z1, mat = rock, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      W.put(m, loc, (x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
      return collide ? W.col(loc, { type: 'box', x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2 }) : null;
    };
    const strip = (x0, x1, y, z0, z1, color) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.15, x1 - x0), 0.25, Math.max(0.15, z1 - z0)), glow(color));
      W.put(m, loc, (x0 + x1) / 2, (z0 + z1) / 2, y);
    };
    // ramp trench walls + sloped floor
    box(-RAMP.x - 1, -RAMP.x, FLOOR - 2, -0.3, RAMP.z0, RAMP.z1);
    box(RAMP.x, RAMP.x + 1, FLOOR - 2, -0.3, RAMP.z0, RAMP.z1);
    const rampLen = Math.hypot(RAMP.z1 - RAMP.z0, -FLOOR);
    const rf = new THREE.Mesh(new THREE.BoxGeometry(RAMP.x * 2, 0.4, rampLen), floorM);
    rf.rotation.x = Math.atan2(-FLOOR, RAMP.z1 - RAMP.z0);
    W.put(rf, loc, 0, (RAMP.z0 + RAMP.z1) / 2, FLOOR / 2 - 0.25, 0);
    rf.rotation.x = Math.atan2(-FLOOR, RAMP.z1 - RAMP.z0);
    rf.updateMatrix();
    // the cliff face over the tunnel mouth
    box(-RAMP.x - 1, RAMP.x + 1, ROOMS[0].ceil, -0.3, RAMP.z1, RAMP.z1 + 1, rock2);
    // rooms: walls, ceilings, floors
    for (const [i, rm] of ROOMS.entries()) {
      box(rm.x0 - 1, rm.x0, FLOOR - 2, rm.ceil, rm.z0, rm.z1);
      box(rm.x1, rm.x1 + 1, FLOOR - 2, rm.ceil, rm.z0, rm.z1);
      box(rm.x0 - 1, rm.x1 + 1, rm.ceil, rm.ceil + 1.2, rm.z0, rm.z1, rock2);
      box(rm.x0, rm.x1, FLOOR - 0.6, FLOOR, rm.z0, rm.z1, floorM, false);
      // glowing guide strips along the walls
      const col = i === 2 ? 0x7dffd4 : 0x2ee6ff;
      strip(rm.x0 + 0.05, rm.x0 + 0.2, FLOOR + 1.2, rm.z0, rm.z1, col);
      strip(rm.x1 - 0.2, rm.x1 - 0.05, FLOOR + 1.2, rm.z0, rm.z1, col);
      strip(rm.x0 + 0.05, rm.x0 + 0.2, rm.ceil - 1.5, rm.z0, rm.z1, 0xc77dff);
      strip(rm.x1 - 0.2, rm.x1 - 0.05, rm.ceil - 1.5, rm.z0, rm.z1, 0xc77dff);
    }
    // chamber front wall around the corridor mouth
    box(-22, -6, FLOOR, ROOMS[1].ceil, 59, 60, rock2);
    box(6, 22, FLOOR, ROOMS[1].ceil, 59, 60, rock2);
    box(-6, 6, ROOMS[0].ceil, ROOMS[1].ceil, 59, 60, rock2);
    // gate wall with a 14 m opening, and the shrine's back wall
    box(-22, -7, FLOOR, ROOMS[1].ceil, GATE_Z - 0.5, GATE_Z + 0.5, rock2);
    box(7, 22, FLOOR, ROOMS[1].ceil, GATE_Z - 0.5, GATE_Z + 0.5, rock2);
    box(-7, 7, FLOOR + 13, ROOMS[1].ceil, GATE_Z - 0.5, GATE_Z + 0.5, rock2);
    box(-12, 12, FLOOR, ROOMS[2].ceil, 142, 143, rock2);
    // alien glyph panels on the chamber walls
    const glyphTex = this.glyphTexture();
    for (const [x, z, yaw] of [[-21.4, 72, Math.PI / 2], [-21.4, 92, Math.PI / 2], [21.4, 72, -Math.PI / 2], [21.4, 92, -Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      W.put(p, loc, x, z, FLOOR + 7, yaw);
    }
    // floor sigil in the chamber
    const sig = new THREE.Mesh(new THREE.RingGeometry(9, 9.6, 48), glow(0x2ee6ff));
    sig.rotation.x = -Math.PI / 2;
    W.put(sig, loc, 0, 85, FLOOR + 0.05);
    sig.rotation.x = -Math.PI / 2; sig.updateMatrix();
    // hanging crystals
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), glow([0x7dffd4, 0xc77dff, 0x2ee6ff][i % 3]));
      c.scale.set(0.6, 2.4, 0.6);
      W.put(c, loc, -16 + (i % 5) * 8, 66 + Math.floor(i / 5) * 30, ROOMS[1].ceil - 2.5);
    }
    const warn = textSprite('◬ ◭ ◮ ◬', { color: '#7dffd4', size: 70, scale: 0.28, bg: '#120a1e' });
    warn.position.set(0, 7, RAMP.z0 - 8);
    grp.add(warn);

    // ---- the gate ----
    const gate = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.9, 10, 40), toon(0x2a2440));
    ink(ring, 0.1);
    gate.add(ring);
    const runes = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.3), glow(0x7dffd4));
      const a = (i / 12) * Math.PI * 2;
      r.position.set(Math.cos(a) * 6.4, Math.sin(a) * 6.4, 0.9);
      r.rotation.z = a;
      runes.add(r);
    }
    gate.add(runes);
    const barrier = new THREE.Mesh(new THREE.CircleGeometry(6.3, 40), new THREE.MeshBasicMaterial({ color: 0x9b4dff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    gate.add(barrier);
    W.put(gate, loc, 0, GATE_Z, FLOOR + 6.4, 0, true);
    this.barrierCol = W.col(loc, { type: 'box', x: 0, y: FLOOR + 6, z: GATE_Z, hx: 7, hy: 7, hz: 0.6 });
    // the socket for the artifact
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 2.2, 8), toon(0x2a2440));
    ink(plinth, 0.06);
    W.put(plinth, loc, 0, GATE_Z - 7, FLOOR + 1.1);
    W.col(loc, { type: 'cyl', x: 0, z: GATE_Z - 7, y0: FLOOR - 1, y1: FLOOR + 2.2, r: 1.1 });
    const socket = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), glow(0x7dffd4));
    socket.visible = this.state.gateOpen;
    W.put(socket, loc, 0, GATE_Z - 7, FLOOR + 2.9, 0, true);
    this.gate = { gate, ring, runes, barrier, socket, open: this.state.gateOpen, t: 0 };
    if (this.state.gateOpen) this.applyGateOpen();

    // ---- the shrine ----
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 1.6, 10), toon(0x2a2440));
    ink(ped, 0.06);
    W.put(ped, loc, 0, 132, FLOOR + 0.8);
    W.col(loc, { type: 'cyl', x: 0, z: 132, y0: FLOOR - 1, y1: FLOOR + 1.6, r: 2.4 });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dffd4, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    W.put(beam, loc, 0, 132, FLOOR + 8, 0, true);
    const skates = new THREE.Group();
    for (const s of [-1, 1]) {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 1.5), glow(0x7dffd4));
      ink(sk, 0.05);
      sk.position.set(s * 0.45, 0, 0);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 4), glow(0xc77dff));
      fin.rotation.x = -Math.PI / 2;
      fin.position.set(s * 0.45, 0.2, -0.85);
      skates.add(sk, fin);
    }
    W.put(skates, loc, 0, 132, FLOOR + 3.2, 0, true);
    skates.visible = !this.state.skatesTaken;
    this.shrine = { skates, beam, t: 0 };

    this.points = {
      gate: W.toWorld(loc, 0, FLOOR + 1, GATE_Z - 6),
      skates: W.toWorld(loc, 0, FLOOR + 1, 129),
      mouth: W.toWorld(loc, 0, 0, RAMP.z0 + 4),
    };
  }

  // Floor override: the ramp is always the floor inside its slot; underground rooms are the
  // floor only for things already down there (so walking over them on the surface is unchanged).
  floor(p, len, dx, dy, dz, r, outN) {
    const ld = this.loc.dir;
    if (dx * ld.x + dy * ld.y + dz * ld.z < this.cosNear) return null;
    // local coordinates (directions are lifted onto the ground plane first)
    if (len < 100) _v.set(dx, dy, dz).multiplyScalar(this.groundR / Math.max(0.5, dx * ld.x + dy * ld.y + dz * ld.z));
    else _v.copy(p);
    _v.applyMatrix4(this.inv);
    const lx = _v.x, ly = len < 100 ? 0 : _v.y, lz = _v.z;
    if (Math.abs(lx) < RAMP.x && lz > RAMP.z0 && lz < RAMP.z1) {
      const y = (FLOOR * (lz - RAMP.z0)) / (RAMP.z1 - RAMP.z0);
      _w.set(lx, y, lz).applyMatrix4(this.mat);
      if (outN) outN.copy(this.rampN);
      return _w.length();
    }
    if (ly > -9) return null;
    for (const rm of ROOMS) {
      if (lx > rm.x0 && lx < rm.x1 && lz > rm.z0 && lz < rm.z1) {
        _w.set(lx, FLOOR, lz).applyMatrix4(this.mat);
        if (outN) outN.set(dx, dy, dz);
        return _w.length();
      }
    }
    return null;
  }

  isUnder(p) {
    if (!this.loc) return false;
    if (arcDist(p, this.loc.dir) > 260) return false;
    _v.copy(p).applyMatrix4(this.inv);
    return _v.y < -6;
  }

  glyphTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 170;
    const x = c.getContext('2d');
    x.strokeStyle = '#7dffd4';
    x.lineWidth = 4;
    x.shadowColor = '#7dffd4';
    x.shadowBlur = 8;
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      const cx = 22 + col * 42, cy = 30 + row * 55;
      x.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2, b = r() * Math.PI * 2;
        x.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
        x.lineTo(cx + Math.cos(b) * 14, cy + Math.sin(b) * 14);
      }
      if (r() < 0.5) x.arc(cx, cy, 6 + r() * 6, 0, Math.PI * 2);
      x.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  applyGateOpen() {
    const G = this.gate;
    G.open = true;
    G.barrier.visible = false;
    G.socket.visible = true;
    if (this.barrierCol) { this.game.colliders.remove(this.barrierCol); this.barrierCol = null; }
  }

  openGate() {
    const g = this.game;
    const A = g.alchemy;
    A.artifact = false;
    A.save();
    A.refreshJarMesh();
    this.state.gateOpen = true;
    this.save();
    this.gate.opening = 3;
    g.cam.shake = 1.2;
    g.audio.tone(55, 3, 'sine', 0.35, 4);
    g.audio.tone(110, 2.5, 'triangle', 0.2, 3);
    g.fx.pop('THE GATE AWAKENS', null, { color: '#7dffd4', size: 70, life: 2 });
    g.hud.alert('✧ THE ALIEN GATE IS OPEN ✧', '#7dffd4', 4);
  }

  takeSkates() {
    const g = this.game;
    this.state.skatesTaken = true;
    this.save();
    this.shrine.skates.visible = false;
    g.upgrades.alien = 1;
    g.upgrades.skates_alien = 1;
    g.player.applyUpgrades(g.upgrades);
    g.cosmetics.skates = 'alien';
    g.cosmetics.apply();
    g.save();
    g.cam.shake = 0.8;
    g.style(250, 'LEGENDARY');
    g.audio.cash();
    g.fx.explosion(this.points.skates.clone(), 6, false);
    g.dialog('✧ XENOGLIDE QUANTUM-LOCK SKATES ✧', 'The skates fold themselves around your boots and hum in a key you can feel in your teeth.<br><br><b>Unrivalled handling</b>: carve tighter than anything on the Moon.<br><b>Antimatter propellant</b>: your jet tank now burns antimatter. Thrusters push more than twice as hard and refill far faster.<br><br><small>The finish is in your wardrobe (C) as "Xenoglide (Legendary)".</small>', [{ label: 'WHOA' }]);
  }

  // =====================================================================================
  // SAT-7 "Lantern"
  // =====================================================================================
  buildSatellite() {
    const g = this.game;
    const P = g.planet;
    const hub = g.hub;
    // inclined great circle through the sky above the ILMB
    const a = hub.dir.clone();
    const tilt = new THREE.Vector3(0.3, 1, -0.4).normalize();
    const n = new THREE.Vector3().crossVectors(a, tilt).normalize();
    const b = new THREE.Vector3().crossVectors(n, a).normalize();
    this.orbit = { a, b, n };
    // altitude profile: high everywhere, dipping low over the ground once per lap near the ILMB
    const ground = new Float32Array(N_ORBIT);
    for (let i = 0; i < N_ORBIT; i++) {
      const th = (i / N_ORBIT) * Math.PI * 2;
      ground[i] = P.surface(_v.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th)).multiplyScalar(P.R));
    }
    let maxG = 0;
    for (let i = 0; i < N_ORBIT; i++) maxG = Math.max(maxG, ground[i]);
    const high = maxG + 160;
    const lowAt = 0.32; // radians past the ILMB
    this.radius = new Float32Array(N_ORBIT);
    for (let i = 0; i < N_ORBIT; i++) {
      // smoothed (max over a window) ground, so it never clips a hill
      let m = 0;
      for (let k = -12; k <= 12; k++) m = Math.max(m, ground[(i + k + N_ORBIT) % N_ORBIT]);
      const th = (i / N_ORBIT) * Math.PI * 2;
      let d = Math.abs(th - lowAt); d = Math.min(d, Math.PI * 2 - d);
      const w = d < 0.55 ? 0.5 + 0.5 * Math.cos((d / 0.55) * Math.PI) : 0; // smooth dip, widest at lowAt
      this.radius[i] = high + (m + LOW_ALT - high) * w;
    }
    this.lowAt = lowAt;
    this.clock = (this.state.satPhase || 0);
    // the model
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 15), toon(0xc9a24a));
    ink(body, 0.12);
    root.add(body);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.3, 15.4), toon(0x3a3550));
    deck.position.y = 1.6;
    root.add(deck);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 0.4), toon(0x8a8f99));
      arm.position.set(s * 6.5, 0, 0);
      root.add(arm);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 7), toon(0x2b59c3));
      ink(panel, 0.06);
      panel.position.set(s * 14.5, 0, 0);
      root.add(panel);
      for (let k = 0; k < 4; k++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 7), toon(0x9be7ff));
        line.position.set(s * (9.5 + k * 3), 0, 0);
        root.add(line);
      }
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), toon(0xf5f5f5, { side: THREE.DoubleSide }));
    dish.position.set(0, -1.6, -5);
    dish.rotation.x = Math.PI;
    root.add(dish);
    const nameSign = textSprite('SAT-7 "LANTERN"', { color: '#ffd23f', size: 60, scale: 0.3, bg: '#120a1e' });
    nameSign.position.set(0, 12, -4);
    root.add(nameSign);
    const lights = [];
    for (const [x, z, c] of [[-4.4, 7.4, 0xff2a3a], [4.4, 7.4, 0x7dff3a], [0, -7.4, 0xffffff]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), glow(c));
      l.position.set(x, 1.9, z);
      root.add(l);
      lights.push(l);
    }
    // a big soft beacon so you can spot it in the sky
    const halo = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    root.add(halo);
    // the artifact cradle on deck
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 8, 20), toon(0x2a2440));
    cradle.rotation.x = Math.PI / 2;
    cradle.position.set(0, 2.0, 2);
    root.add(cradle);
    const artifact = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), glow(0x7dffd4));
    artifact.position.set(0, 2.9, 2);
    artifact.visible = !this.state.artifactTaken;
    root.add(artifact);
    const aGlow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dffd4, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    aGlow.position.copy(artifact.position);
    aGlow.visible = artifact.visible;
    root.add(aGlow);
    root.frustumCulled = false;
    g.scene.add(root);
    // it behaves like a moving platform you can land on (body + both solar panels)
    this.sat = { root, nameSign, artifact, aGlow, lights, pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(), cols: [], passAlert: 0 };
    this.placeSat(0);
    this.sat.prevPos.copy(this.sat.pos);
  }

  orbitPoint(theta, out = new THREE.Vector3()) {
    const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const f = (t / (Math.PI * 2)) * N_ORBIT;
    const i = Math.floor(f) % N_ORBIT, j = (i + 1) % N_ORBIT;
    const r = this.radius[i] + (this.radius[j] - this.radius[i]) * (f - Math.floor(f));
    const o = this.orbit;
    return out.copy(o.a).multiplyScalar(Math.cos(t)).addScaledVector(o.b, Math.sin(t)).multiplyScalar(r);
  }

  satTheta() { return (this.clock * SAT_SPEED) / 3750; }

  placeSat(dt) {
    const S = this.sat;
    const th = this.satTheta();
    S.prevPos.copy(S.pos);
    this.orbitPoint(th, S.pos);
    const ahead = this.orbitPoint(th + 0.002, new THREE.Vector3());
    const up = S.pos.clone().normalize();
    // velocity straight from the orbit (so a time skip can never fling you off the deck)
    S.vel.copy(ahead).sub(S.pos).multiplyScalar(SAT_SPEED / 3750 / 0.002);
    S.fwd.copy(tangent(ahead.sub(S.pos), up)).normalize();
    if (dt <= 0 || S.prevPos.distanceTo(S.pos) > SAT_SPEED * dt * 3 + 1) S.prevPos.copy(S.pos);
    S.root.position.copy(S.pos);
    frameQuat(up, S.fwd, S.root.quaternion);
    S.root.updateMatrixWorld(true);
  }

  // re-register the satellite's deck colliders where it is now (only when you're close)
  syncSatCols() {
    const g = this.game;
    const S = this.sat;
    for (const c of S.cols) g.colliders.remove(c);
    S.cols = [];
    if (S.pos.distanceTo(g.player.pos) > 700) return;
    const q = S.root.quaternion;
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q), az = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    for (const [x, hx, hy, hz] of [[0, 4.7, 1.75, 7.7], [-14.5, 6, 0.3, 3.5], [14.5, 6, 0.3, 3.5]]) {
      const c = S.root.localToWorld(new THREE.Vector3(x, 0, 0));
      S.cols.push(g.colliders.add({ type: 'box', c, ax: ax.clone(), ay: ay.clone(), az: az.clone(), hx, hy, hz, platform: S }));
    }
  }

  // runs before the player moves, so riding the deck carries you along
  preUpdate(dt) {
    this.clock += dt;
    this.placeSat(dt);
    this.syncSatCols();
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    const S = this.sat;
    // decoration
    S.t = (S.t || 0) + dt;
    S.lights.forEach((l, i) => { l.visible = Math.sin(S.t * 3 + i * 2) > 0; });
    S.artifact.rotation.y += dt * 1.5;
    S.nameSign.visible = S.pos.distanceTo(P.pos) > 45; // don't fill the screen while you're aboard
    S.aGlow.scale.setScalar(1 + Math.sin(S.t * 4) * 0.15);
    // heads-up when it's coming in low near you
    const d = S.pos.distanceTo(P.pos);
    S.passAlert -= dt;
    if (d < 1600 && S.passAlert <= 0 && g.planet.visible(P.center, S.pos)) {
      S.passAlert = 90;
      g.hud.toast(`📡 SAT-7 "LANTERN" passing ${Math.round(S.pos.length() - g.planet.surface(S.pos))} m up${this.state.artifactTaken ? '' : ' (something on its deck is glowing)'}`, 4);
    }
    if (P.body.platform === S && !S.landedOnce) {
      S.landedOnce = true;
      g.style(200, 'ORBITAL LANDING');
      g.fx.pop('YOU LANDED ON A SATELLITE?!', null, { color: '#ffd23f', size: 60 });
      g.actionPanel('launch', null, 'ONE SMALL STEP FOR A RUNNER…');
    }
    if (!this.loc) return;
    const G = this.gate;
    if (G.opening > 0) {
      G.opening -= dt;
      G.barrier.material.opacity = Math.max(0, 0.55 * (G.opening / 3));
      G.socket.visible = true;
      if (G.opening <= 0) this.applyGateOpen();
    }
    G.runes.rotation.z += dt * (G.open || G.opening > 0 ? 1.4 : 0.15);
    this.shrine.skates.rotation.y += dt;
    this.shrine.skates.position.y = FLOOR + 3.2 + Math.sin(S.t * 2) * 0.25;
  }

  // prompts + F actions; returns true when it owns the prompt this frame
  interact() {
    const g = this.game;
    const P = g.player;
    const S = this.sat;
    if (P.dead) return false;
    // the artifact on deck
    if (!this.state.artifactTaken && P.body.platform === S && P.pos.distanceTo(S.artifact.getWorldPosition(_v)) < 5) {
      g.hud.prompt('<b>F</b> — TAKE THE ALIEN ARTIFACT');
      if (g.input.pressed('KeyF')) this.takeArtifact();
      return true;
    }
    if (!this.loc) return false;
    const G = this.gate;
    if (!G.open && !(G.opening > 0) && P.pos.distanceTo(this.points.gate) < 9) {
      if (g.alchemy.artifact) {
        g.hud.prompt('<b>F</b> — PLACE THE ARTIFACT IN THE SOCKET');
        if (g.input.pressed('KeyF')) this.openGate();
      } else g.hud.prompt('A SEALED GATE. THE SOCKET IN FRONT OF IT IS EMPTY…');
      return true;
    }
    if (G.open && !this.state.skatesTaken && P.pos.distanceTo(this.points.skates) < 6) {
      g.hud.prompt('<b>F</b> — TAKE THE XENOGLIDE SKATES');
      if (g.input.pressed('KeyF')) this.takeSkates();
      return true;
    }
    return false;
  }

  takeArtifact() {
    const g = this.game;
    const A = g.alchemy;
    if (!A.owned) { g.hud.toast('Your glove passes straight through it. You need a containment jar (Dr. Zbornak, Antimatter Lab).', 4); return; }
    if (A.used >= A.slots) { g.hud.toast('No room in your jar. Shift+X dumps it.', 3); return; }
    A.artifact = true;
    A.save();
    A.refreshJarMesh();
    this.state.artifactTaken = true;
    this.save();
    this.sat.artifact.visible = this.sat.aGlow.visible = false;
    g.style(300, 'ALIEN ARTIFACT');
    g.audio.tone(330, 1.2, 'sine', 0.3, 3);
    g.fx.pop('ALIEN ARTIFACT ACQUIRED!', null, { color: '#7dffd4', size: 64, life: 2 });
    g.hud.toast('It sealed itself into a compartment of your jar. It hums louder when you face the twilight side…', 5);
  }

  // is the satellite pin worth drawing on the globe map
  mapInfo() { return { pos: this.sat.pos, orbit: this.orbit, radius: this.radius, theta: this.satTheta() }; }
}
