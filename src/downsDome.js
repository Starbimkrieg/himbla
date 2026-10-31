import * as THREE from 'three';
import { settle } from './settlements.js';
import { downsNode, makeDownsKid } from './models.js';
import { matFor } from './downsKit.js';
import { toon } from './toon.js';
import { unbendPoint } from './curve.js';
import { DOME } from './downsPlan.js';

// Chimera Downs' glass dome and its three airlocks (tools/blender/build_downs_dome.py has the model, its frames and measures;
// downsPlan.js DOME the footprint). buildDome bakes shell, drum and locks into a settlement kit of their own, adds the colliders
// (the drum, a skin of tilted panels over the shell, every wall of the locks) and hangs the door leaves and status lamps as moving
// parts. The object it returns runs the airlocks: update(dt, game) while the Downs is in view (race.js).
//
// An airlock, in its own frame (origin on the drum's centre line on the gate's axis, +z out of the dome): the vehicle doors are
// 8 x 7 m, the outer pair in the head at z 2.2, the inner pair in the gatehouse at z -45.7; between them the chamber, 11 m clear.
// The chamber is at one side's pressure at a time (`mode`, out or in): walk or drive up to that side and its door opens; go in
// and, once 6 m past the door, it shuts behind you, the chamber cycles (lamps red, the crown strip pulses amber, a hiss) and the
// far door opens. Walk up to a door of the other side and the chamber cycles back first. A door never shuts on someone in it.
// The pedestrian doors either side stay shut.

const BAY = (Math.PI * 2) / DOME.bays;
const DOOR_OUT = 2.2, DOOR_IN = -45.7;   // the vehicle door leaves' planes
const NEAR = 12;                          // m out from a door at which its lock wakes (the teleports land 15 m out: just short of it)
const IN_DEEP = 6;                        // m past the door you came in by before it shuts behind you
const OPEN_T = 2.4, CYCLE_T = 4.5;        // s for a door to slide open or shut / to vent or fill the chamber
const AMBER = new THREE.Color(0xffa830);

// the lattice: a little emissive, the Downs' own lamps on its undersides (else, seen through the glass, the far side of the
// lattice reads near-black against the shaded half of each strut)
const FRAME = toon(0xf8fff8, { emissive: 0x5a606c });
// the glass: nearly clear face on, a pale sheen toward grazing angles, and it writes depth, so post.js's depth ink outlines the
// dome rather than every strut against the depth behind it (which inked the whole lattice dark from a few hundred metres)
const GLASS = new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, side: THREE.DoubleSide });
GLASS.onBeforeCompile = (s) => {
  s.vertexShader = 'varying vec3 vFN; varying vec3 vFV;\n' + s.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\n  vFN = normalize(normalMatrix * normal); vFV = normalize(-mvPosition.xyz);');
  s.fragmentShader = 'varying vec3 vFN; varying vec3 vFV;\n' + s.fragmentShader.replace('#include <opaque_fragment>',
    `float fres = pow(1.0 - abs(dot(normalize(vFN), normalize(vFV))), 3.0);
  diffuseColor.a = mix(0.05, 0.55, fres);
  outgoingLight = mix(outgoingLight, vec3(1.0), fres * 0.35);
#include <opaque_fragment>`);
};
GLASS.customProgramCacheKey = () => 'downsDomeGlass';
const mat = (slot) => (slot === 'domeframe' ? FRAME : slot === 'domeglass' ? GLASS : matFor(slot));

// a lock's frame in the Downs: origin and yaw (its +z along the gate's axis, out of the dome)
const lockFrame = (bay) => {
  const a = bay * BAY;
  return { ox: DOME.r * Math.cos(a), oz: DOME.r * Math.sin(a), yaw: Math.PI / 2 - a };
};

// a box from (x0, y0, z0) to (x1, y1, z1) in the kit's current frame
function box(k, x0, x1, y0, y1, z0, z1) {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)];
  k.solid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, (x0 + x1) / 2, (z0 + z1) / 2, 0, y0);
}

// the drum: a box a bay, from below ground to the ring beam's top; over a lock's head only the ring beam (the head has its own)
function drumCols(k) {
  const [r0, r1] = DOME.drum, rc = (r0 + r1) / 2, hw = DOME.r * Math.sin(BAY / 2) + 0.2;
  for (let c = 0; c < DOME.bays; c++) {
    const a = c * BAY, head = DOME.locks.some((l) => Math.abs((((c - l.bay) % DOME.bays) + DOME.bays + 1) % DOME.bays - 1) <= 1);
    const y0 = head ? DOME.beam : -1;
    k.solid(hw, (DOME.top - y0) / 2, head ? 1.8 : (r1 - r0) / 2, rc * Math.cos(a), rc * Math.sin(a), Math.PI / 2 - a, y0);
  }
}

// the shell: 48 sectors x 11 panels, each a 1.6 m slab on the chord of its stretch of the profile (pitched to it, a little wider
// than its sector at its outer end so neighbours overlap), and a cap over the crown. A jump reaches ~30 m and thrusters more,
// so all of it, not only the drum, keeps players in or out.
function shellCols(k) {
  const N = 1000, SEG = 12, SECT = 48;
  const pts = [], cum = [0];
  for (let i = 0; i <= N; i++) {
    const t = (Math.PI / 2) * (1 - i / N);
    pts.push([DOME.r * Math.cos(t) ** (2 / DOME.exp), DOME.foot + DOME.rise * Math.sin(t) ** (2 / DOME.exp)]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const at = (s) => {                                                                    // the profile s metres down from the crown
    let j = 0;
    while (j < N - 1 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    return [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f];
  };
  const L = cum[N];
  const [cr, cy] = at(L / SEG);
  k.column(cr + 2, pts[0][1] + 0.8, 0, 0, cy - 1);                                        // crown cap
  for (let s = 2; s <= SEG; s++) {
    const A = at((L * (s - 1)) / SEG), B = at((L * s) / SEG);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]), dr = (B[0] - A[0]) / len, dy = (B[1] - A[1]) / len;
    const pitch = Math.atan2(dr, dy);                                                    // slab's z onto the outward normal (dy, -dr)
    const mr = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, hy = len / 2 + 0.6;
    const hx = Math.max(A[0], B[0]) * Math.sin(Math.PI / SECT) * 1.08 + 0.3;
    for (let j = 0; j < SECT; j++) {
      const a = ((j + 0.5) / SECT) * Math.PI * 2;
      k.solid(hx, hy, 0.8, mr * Math.cos(a), mr * Math.sin(a), Math.PI / 2 - a, my - hy, pitch);
    }
  }
}

// a lock's walls, in its frame. The vehicle doors' own colliders come and go with them (Lock below).
function lockCols(k) {
  // head: solid either side of the vehicle door (its pedestrian doors stay shut) and over it; the attic and buttresses outside
  box(k, -27, -4, -1, 12.65, -3.9, 2.6); box(k, 4, 27, -1, 12.65, -3.9, 2.6); box(k, -4, 4, 7, 12.65, -3.9, 2.6);
  box(k, -9.6, 9.6, 11.6, 17.1, 1.3, 3.4);
  for (const sx of [-1, 1]) box(k, sx * 7.2, sx * 8.8, -1, 16.2, 2.4, 3.6);
  // chamber walls and roof; the pedestrian tubes either side
  for (const sx of [-1, 1]) box(k, sx * 5.5, sx * 6.1, -1, 11.1, -34.3, -3.9);
  box(k, -6.1, 6.1, 10.5, 11.5, -34.3, -3.9);
  for (const sx of [-1, 1]) k.hcyl(1.9, 29.7, sx * 17.79, -18.45, 0, 1.9);
  // gatehouse: the block round its passage, the front wall beside and over the inner door, the towers, the pump house
  for (const sx of [-1, 1]) box(k, sx * 5.52, sx * 13.5, -1, 15, -46, -34);
  box(k, -5.52, 5.52, 10.52, 15, -46, -34);
  for (const sx of [-1, 1]) box(k, sx * 4, sx * 5.52, -1, 10.52, -46, -45.4);
  box(k, -4, 4, 7, 10.52, -46, -45.4);
  for (const sx of [-1, 1]) box(k, sx * 13.29, sx * 22.29, -1, 18.9, -47.5, -33);
  box(k, -5, 5, 14.9, 19, -42.5, -36.5);
}

class Lock {
  constructor(key, f) {
    Object.assign(this, { key, ...f });
    this.c = Math.cos(f.yaw); this.s = Math.sin(f.yaw);
    this.mode = 'out';                 // the side the chamber's pressure matches
    this.open = { out: 0, in: 0 };     // door open fractions
    this.moving = { out: 0, in: 0 };   // which way each door last moved (for its sounds)
    this.cycle = 0; this.toward = null; this.from = null; this.was = null;
    this.leaves = { out: [], in: [] }; this.cols = {}; this.signals = []; this.strips = [];
  }

  // the Downs' flat (x, z) -> this lock's frame
  local(x, z, out) {
    const dx = x - this.ox, dz = z - this.oz;
    out.x = dx * this.c - dz * this.s; out.z = dx * this.s + dz * this.c;
    return out;
  }

  // its frame -> the Downs' flat (x, z)
  downs(lx, lz) { return { x: this.ox + lx * this.c + lz * this.s, z: this.oz - lx * this.s + lz * this.c }; }

  where(l, y) {
    if (y > 12) return null;
    if (Math.abs(l.x) < 5.6 && l.z < DOOR_OUT && l.z > DOOR_IN) return 'chamber';
    if (Math.abs(l.x) < 12 && l.z >= DOOR_OUT && l.z < 2.6 + NEAR) return 'out';
    if (Math.abs(l.x) < 12 && l.z <= DOOR_IN && l.z > -47.5 - NEAR) return 'in';
    return null;
  }

  startCycle(to, g) {
    if (this.open.out > 0 || this.open.in > 0) return;   // (both doors shut first)
    this.cycle = CYCLE_T; this.toward = to;
    g.audio.alarm();
    g.audio.burst(CYCLE_T, to === 'in' ? 2600 : 1600, 0.16);   // air in, or out
    g.fx.pop(to === 'in' ? 'PRESSURISING' : 'VENTING', null, { color: '#ffa830', size: 30 });
  }

  update(dt, g, w, l, y, t) {
    const here = this.where(l, y);
    if (here !== this.was) {
      if (here === 'chamber' && (this.was === 'out' || this.was === 'in')) this.from = this.was;
      else if (here !== 'chamber') this.from = null;
      this.was = here;
    }
    const want = { out: 0, in: 0 };
    if (this.cycle > 0) {
      this.cycle -= dt;
      if (this.cycle <= 0) { this.cycle = 0; this.mode = this.toward; this.toward = null; g.audio.tone(880, 0.3, 'triangle', 0.12); }
    } else if (here === 'out' || here === 'in') {
      if (this.mode === here) want[here] = 1; else this.startCycle(here, g);
    } else if (here === 'chamber') {
      const from = this.from || this.mode, to = from === 'out' ? 'in' : 'out';
      const past = from === 'out' ? DOOR_OUT - l.z : l.z - DOOR_IN;     // metres in from the door they came by
      if (this.mode === from) { if (past < IN_DEEP) want[from] = 1; else this.startCycle(to, g); }
      else want[to] = 1;
    }
    for (const side of ['out', 'in']) {
      const plane = side === 'out' ? DOOR_OUT : DOOR_IN;
      if (this.open[side] > 0 && Math.abs(l.x) < 4.6 && Math.abs(l.z - plane) < 1.6 && y < 8) want[side] = 1;   // never shut on anyone
      const o0 = this.open[side], o = THREE.MathUtils.clamp(o0 + Math.sign(want[side] - o0) * (dt / OPEN_T), 0, 1);
      const dir = Math.sign(o - o0);
      if (dir && dir !== this.moving[side]) g.audio.tone(dir > 0 ? 55 : 80, OPEN_T, 'sawtooth', 0.05, dir > 0 ? 1.6 : 0.6);   // the motor
      if (!dir && this.moving[side]) g.audio.burst(0.3, 420, 0.25);                                                           // and the stop
      this.moving[side] = dir;
      this.open[side] = o;
      const e = o * o * (3 - 2 * o);
      for (const lf of this.leaves[side]) lf.obj.position.x = lf.slide * e;
      const c = this.cols[side], block = o < 0.85;
      if (c && block !== c.on) { if (block) w.colliders.add(c); else w.colliders.remove(c); c.on = block; }
    }
    // lamps: green over the door you may use, red otherwise (blinking while the chamber cycles); the crown strip pulses amber
    const blink = this.cycle > 0 && Math.sin(t * 9) > 0;
    for (const sg of this.signals) {
      const go = this.cycle <= 0 && this.mode === sg.side;
      const lit = sg.color === 'green' ? go : !go && (this.cycle <= 0 || blink);
      sg.mat.color.copy(sg.base).multiplyScalar(lit ? 1 : 0.18);
    }
    const k = this.cycle > 0 ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
    for (const st of this.strips) st.mat.color.lerpColors(st.base, AMBER, k);
  }
}

// a node's pivot (door leaf, lamp) as a moving part in kit `k`, in its place in the dome's frame; its slot materials cloned when
// it is to be lit by state
function hang(k, kid, own) {
  const obj = makeDownsKid(kid);
  obj.position.set(0, 0, 0); obj.quaternion.identity();
  const mats = [];
  if (own) obj.traverse((m) => { if (m.isMesh && !m.userData.isInk) { m.material = m.material.clone(); mats.push(m.material); } });
  k.dyn(obj, kid.pos.x, kid.pos.y, kid.pos.z, new THREE.Euler().setFromQuaternion(kid.quat, 'YXZ').y);
  return { obj, mat: mats[0] };
}

export function buildDome(w, loc) {
  const node = downsNode('dn_dome');
  const locks = new Map(DOME.locks.map((l) => [l.key, new Lock(l.key, lockFrame(l.bay))]));
  settle(w, loc, 7071, (k) => {
    k.bendLen = 30;                       // (a 30 m piece of the shell sags 3 cm off the sphere; 8 m pieces would make it 540k triangles)
    k.tag = 'dome';
    k.baked(node, mat, new THREE.Matrix4());
    drumCols(k);
    shellCols(k);
    for (const L of locks.values()) { k.at(L.ox, L.oz, L.yaw); lockCols(k); }
    k.at();
    for (const kid of node.kids) {
      const L = locks.get(kid.name.split('_')[2]);
      if (!L) continue;
      const d = kid.data;
      if (kid.role === 'door' && /door(Out|In)/.test(kid.name)) L.leaves[/doorOut/.test(kid.name) ? 'out' : 'in'].push({ ...hang(k, kid), slide: d.slide });
      else if (kid.role === 'signal') {
        const h = hang(k, kid, true);
        (d.side === 'cycle' ? L.strips : L.signals).push({ ...h, side: d.side, color: d.color, base: h.mat.color.clone() });
      } else hang(k, kid);                // (the pedestrian doors: shut)
    }
    k.tag = '';
  });
  // the vehicle doors' colliders, in place while a door is less than 85 % open
  for (const L of locks.values()) {
    for (const [side, lz] of [['out', DOOR_OUT], ['in', DOOR_IN]]) {
      const p = L.downs(0, lz);
      L.cols[side] = w.col(loc, { type: 'box', x: p.x, y: 3.5, z: p.z, hx: 4.05, hy: 4, hz: 0.4, yaw: L.yaw });
      L.cols[side].on = true;
    }
  }
  const R = w.curveR(loc), q = new THREE.Vector3(), l = { x: 0, z: 0 };
  let t = 0;
  return {
    locks,
    update(dt, g) {
      t += dt;
      loc.group.worldToLocal(q.copy(g.player.pos));
      if (R) unbendPoint(R, q.x, q.y, q.z, q);
      for (const L of locks.values()) L.update(dt, g, w, L.local(q.x, q.z, l), q.y, t);
    },
  };
}
