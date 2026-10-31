import * as THREE from 'three';
import { toon, glow, inkMat } from './toon.js';
import { loadSpiderTankKit } from './models.js';
import { makeGait } from './gait.js';

// Zbornak's spider tank, ARACHNE: the Triple Crown's reward (tools/blender/build_spidertank.py; docs/spidertank/; reviewed in
// tools/spidertank-lab.html). Eight armoured legs walk it by the chimeras' gait (src/gait.js), to a spider's rhythm: walking, a ripple
// up each side from the back leg to the front; running, two sets of four that take turns; each foot in its own lane, so the legs never
// cross. The body leads and the legs follow. The hull wants a pose from the ground under its outline and ahead of it (over a crate
// just clear of it, over a gap level with the tops either side, at a wall rearing up to its top; its lower half rides up to RIDE_ROOM
// toward the higher, so it lifts level over a low block rather than pitching at it; at a taller face it rears up it, tail down till
// its nose is at the face, then hauls itself up, REAR_*, HAUL_*; leaning toward anything tall beside it, LEAN_*) and goes
// toward it at its own rates, only never into anything (bodyPose): its legs never hold it back. Each foot takes the hold nearest the
// height that pose puts it at, in its leg's reach, on its own side of the body, its leg clear of the hull (gait.js keeps the knees up
// and out), standing with leverage or gripping a face, reaching over an edge knee-up (a climbing step picks it once, at lift-off, for
// where its hip will be when it lands, and keeps it); a planted foot the body has left out of reach holds nothing and steps at once,
// whatever else is stepping. Climbing, the legs step by need rather than to the rhythm (gait.js free): out of reach, near full
// stretch, off the height, out of lane; rearing up a face, the legs nearest it climb and the rest push (roles), their holds fanned out
// (SPREAD); a leg with nothing in reach reaches for the hold it wants. So pushed at something it rears up, nose up as steeply as
// it takes (to 88 degrees), and goes up and over: up to CLIMB (13 m) over its anchor, the ground under it; taller, it rears up the face
// as far as it can and stops. Climbing a face it goes no faster than CLIMB_SPEED; whatever it is doing, no faster than lets its hull
// rise clear of what is ahead before it gets there, and braking short of what even the pose it wants would meet. Standing, it keeps
// its holds (no shuffling between two as good, nor a step back onto the spot a foot is on). Past SKIM_AT it closes up
// into a skimming bead (overdrive), unless it is climbing or gripping something, and opens out under SKIM_OFF: each leg zigzags
// against the hull, slides in through its port and a hatch shuts over it, the cannon draws into the nose, the jets come out; every piece
// follows its own share of the fold (the model's `fold`, `foldPos`, `foldScale` and their spans). Its rams (barrel and rod pivots) aim
// at each other every frame, so they stretch as the legs move. The reactor beam charges for a second while the trigger is held, then
// channels for four from the cannon; in spider form only (held in the bead, it does nothing), slow while it does, and while fire is
// held it stays a spider (under SKIM_AT).
//
// loadSpiderTank() -> kit; makeSpiderTank(kit) -> tank: { root, update(dt, { speed, push, ground, ray, trigger }), folded(f), hits }.
// The caller places root (on the ground under the hull's middle, or anything under it: the hull keeps its own height in the world, +z
// ahead) before update; ground(p, out[, ceil]) as gait.js has it, and ray(from, dir, far, out): the first thing on that line within far,
// into out (or null), for feet on the faces of things. speed may be negative, backing up (to tank.reverseMax); push (speed, unless
// said) is what the driver asks for: pushed on but held up, it climbs. tank.hits(x, y, z, yaw) is how far into things the hull would be
// with the root there (the caller's collision: never move or turn it deeper). tank.form ('walk', 'folding', 'skim'), tank.beam
// ({ state: 'idle' | 'charge' | 'fire', t }), tank.speedCap (a fraction of the asked-for speed, while the beam is up), tank.speedMax (m/s
// it keeps under while fire is held walking, or climbing), tank.climbing and tank.pose (the hull's: H over the root, W in the world, P, R) read back.

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
const ABOVE = 3;                // m a foot may stand above its hip at most, reaching up over an edge (its knee still bends up over it)
const CLIMB = 13;               // m it climbs at most over its anchor (the ground under it, ANCHOR): taller, a foot only grips the face
const PITCH_MAX = 1.53, ROLL_MAX = 1.2;   // rad the hull tilts at most: nose up (all but upright, 88 degrees) a climb, and over sideways
const LIFT_RATE = 6, PITCH_RATE = 2.2, ROLL_RATE = 1.6, LEVEL_RATE = 1.4;   // m/s and rad/s the hull's pose changes at most (a spider's: quick)
const ANCHOR = 0.3;             // of the ground under its outline, the share lower than what it climbs from (its anchor)
const HIPS_OVER = 1.45;         // m the hips may stand over the climb's limit at most (reaching a top at it, never over a wall taller)
const RIDE_ROOM = 3;            // m higher than its standing height the hull rides on stretched legs (its lower half, toward a higher one)
// at a face from REAR_FROM to REAR_FULL m taller than under its tail it rides up only REAR_RIDE (m) and pitches over REAR_ARM (m): it
// rears up it
const REAR_FROM = 3, REAR_FULL = 6, REAR_RIDE = 1, REAR_ARM = 2;
// all round: what stands LEAN_X m out from its middle to either side, or LEAN_Z behind (and ahead) (and LEAN_OUT times that), from LEAN_FROM to LEAN_FULL m taller than
// what it stands on, leans that half of it up to LEAN_MAX m higher; under LEAN_SLOW m/s (none by twice that)
const LEAN_X = 3.8, LEAN_Z = 5, LEAN_OUT = [1, 1.3], LEAN_FROM = 1, LEAN_FULL = 4, LEAN_MAX = 1.6, LEAN_SLOW = 3, LEAN_FOOT = 1.2;
const HAUL_NEAR = 0.5, HAUL_FAR = 2.5, NOSE = 3.5;   // m from its front (NOSE ahead of its middle) to the face: rearing, its tail stays down further, and is hauled up nearer
const REAR_PITCH_RATE = 1, REAR_LIFT_RATE = 3, REAR_CREEP = 1.5;  // rad/s and m/s it pitches up and rises at most rearing up a tall face (a step at a time), and m/s it goes meanwhile
const SUPPORT = 0.6;            // of the ground under a half of the hull's outline, the share the hull stands its height over (the rest higher)
const CLEAR_HULL = 1.65;        // m its hips keep over the highest thing under the hull (its bottom 1.24 under them, and a margin)
const LOOK_MIN = 2.5, LOOK_MAX = 8, LOOK_S = 0.6, TAIL_LOOK = 3.5;   // m ahead its leading half looks, going (LOOK_S s of its speed), for what to rise to (and slow for) before it gets there
const PITCH_ARM = 4, ROLL_ARM = 3.2;  // m between where the front and back halves' heights (and the sides') pitch and roll it
const ROLL_WANT = 0.45;         // rad it rolls to the ground at most (rolled further, the feet on its low side end up under its belly)
const POSE_T = 0.4;             // s the hull takes, about, to get most of the way to the pose it wants (for where a hip will be)
const TARGET_EASE = 0.15;       // s the pose it wants eases over (so a step or a crate coming under it doesn't jolt it)
// how much of the way to the pose it wants it tries to go each frame, all together and then each way alone; the first it may go wins
const TRIES = [[1, 1, 1], [0.6, 0.6, 0.6], [0.3, 0.3, 0.3], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.4, 0, 0], [0, 0.4, 0], [0, 0, 0.4]];
const LEVER = 0.7;              // m in from an edge on its hip's side a foot must stand on a top: no hooking a lip (the far side may end)
const REVERSE = 18;             // m/s the most it backs up at
const STRETCH = 1;              // of a leg's reach, past which a trailing foot is due to step (the stride plans to 0.97; at 1.06 it goes at once)
// where the foot of a leg with nothing to hold hangs: of the way from its hip to its rest spot, and m higher (in the hull's frame), the
// first that is clear
const HANGS = [[0.75, 0], [0.75, 1.5], [0.5, 2.5], [0.9, -1], [0.15, 2.5]];
const REACH_OUT = 0.9, HANG_SPEED = 8;   // of its reach, how far a leg with nothing in reach reaches toward the hold it wants; m/s its foot goes there
const LOOSE = 1.02;             // of a leg's reach, past which a planted foot holds nothing (it steps at once)
const NEAR = 0.3;               // of a leg's reach, the closest to its hip a foot stands (its ankle folded, gait.js FEMUR_UP)
// the spots a foot looks at round where it would land (m toward its hip, m across), out to the leg's full reach: it takes the highest,
// less REACH_COST a metre away (a face counts FACE_COST less than a top)
const AROUND = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [0.8, 0.8], [0.8, -0.8], [-0.8, 0.8], [-0.8, -0.8], [0, 2], [0, -2], [-1.8, 0],
  [-3, 0], [-2.4, 1.2], [-2.4, -1.2], [1.8, 0], [2.6, 0], [3.4, 0]];
const AHEAD = [1.5, 3, 4.5, 6, 7.5];    // m further ahead (the way it is going) it looks too, for something to climb before its nose gets there
const AHEAD_SIDE = 1.5;         // m to either side of those it looks too
const HIP_AHEAD = [0.5, 1.5, 3, 4.5];   // m ahead of its hip, in line with it, it looks too (onto a block narrower than its lanes)
const REACH_COST = 0.25, FACE_COST = 0.3, CLIMB_REACH_COST = 0.35;   // (climbing: of REACH_COST)
// the ways each hip looks for a face to grip (across: out from its own side, so -1 is in under the body; down; ahead)
const FACE_RAYS = [[1, -0.3, 0], [1, -1, 0], [1, -0.3, 0.6], [1, -0.3, -0.6], [-1, -0.3, 0], [-1, -1, 0], [-1, -0.3, 0.6], [-1, -0.3, -0.6],
  [0, -0.3, 1], [0, -1, 1]];
const HOLD = 0.3;
// climbing: a hold counts SPREAD_COST less a metre nearer than SPREAD to another foot's; rearing up a face, the CLIMBERS legs nearest it
// climb, and the rest push: a face counts PUSH_FACE less for them, and a hold PUSH_HIGH less a metre over their anchor (and a metre)
const SPREAD = 2, SPREAD_COST = 1, CLIMBERS = 4, PUSH_FACE = 2, PUSH_HIGH = 0.5;
const PUSH_STRETCH = 0.95;      // of its reach, past which a pushing leg steps (it pushes from where it stands, at full stretch)
const FACE_RAY = 10, FACE_RAY_UP = 1.5, FACE_RAY_SIDE = 2;   // m: how far ahead it looks for the face, how high over its anchor, how far to either side
const STEEP = 0.9, LIFT_OUT = 0.6;   // rad of pitch by which a stepping foot lifts off the hull rather than straight up; and out to its side, of that
const KNEE_UP = 1.2;            // m its knee rises over its hip (or the foot, the higher) reaching onto a top over an edge (and over its leg's middle, standing)
const CLIMB_SPEED = 5;          // m/s the most it goes climbing, or rearing up at something (tank.speedMax)
const STEEP_WANT = 0.5;         // rad of pitch (wanted, or had) that counts as climbing for that (a crate's is less)
const BRAKE = 10, BRAKE_AT = [1, 2.5, 4.5];   // m/s/s it brakes at for what its hull would meet, and m ahead it looks for that
const TOUCH = 0.6;              // m/s it closes the last metre at
const GRAZE = 0.002;            // m of hull into something that counts as meeting it (the caller's collision stops at any)
const NEED_STRETCH = 0.8, NEED_OFF = 0.6;   // climbing, a leg steps past this of its reach, or this far (m) off the height it should stand at
const LIFT_HELD = 5;            // feet still holding with which a leg may lift even though its corner of the body keeps none
const FREE_SPIN = 0.3;          // rad/s turning, past which its legs step to the walking rhythm even while climbing (it turns on its feet)
const FREE_SPEED = 1.5;         // m/s under which, climbing, its legs step by need (gait.js free) rather than to the walking rhythm
const HEIGHT_COST = 1;          // a hold counts this much less a metre off the height the pose the hull wants puts its foot at
const MARGIN = 0.8, MARGIN_COST = 8, FOLD_MARGIN = 1.5;   // of a leg's reach from its hip in the pose the hull wants, past which a hold counts less, and how much (and of NEAR, under which)
const SIDE = 0.8;               // m in from the body's middle a foot keeps, on its own side (in the hull's frame: never across under it)               // m more the hold a foot has counts for, standing (so it doesn't shuffle between two as good)
const CHARGE = 1.0, FIRE = 4.0; // s: the beam's charge (the trigger held) and its channel
const BEAM_RANGE = 420;         // m
const BEAM_SLOW = 0.3;          // the speed it may keep while charging and firing (of what is asked)

// the hull's outline over the ground (x across, z ahead, in the root's frame: the bead and the cannon's tip), where it looks for what is
// under it; the caller can test it against what it drives into (the lab does)
// the hull itself, as points in its own frame (the bead's bottom and three rings up its side, the cannon): it is clear when none of them
// is inside anything
export const HULL3 = [new THREE.Vector3(0, 1.86, -0.1), new THREE.Vector3(0, 2.8, 4), new THREE.Vector3(0, 2.8, 5)];
// (rings close enough, and points round them, that an edge can't slip in between: 0.25 to 0.4 m up the side, 1.4 m round at most)
for (const t of [-0.97, -0.85, -0.7, -0.55, -0.35, 0]) {
  const r = Math.sqrt(1 - t * t), m = r > 0.6 ? 16 : 8;
  for (let k = 0; k < m; k++) HULL3.push(new THREE.Vector3(2.25 * r * Math.cos(k * 2 * Math.PI / m), 3.24 + 1.38 * t, -0.09 + 3.5 * r * Math.sin(k * 2 * Math.PI / m)));
}
export const HULL = [[0, 4.8]];
for (const x of [-2.1, -1.05, 0, 1.05, 2.1]) for (const z of [-3.4, -1.7, 0, 1.7, 3.3]) if ((x / 2.3) ** 2 + (z / 3.6) ** 2 <= 1.05) HULL.push([x, z]);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _side = new THREE.Vector3(), _l1 = new THREE.Vector3(), _l2 = new THREE.Vector3();
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
  let ground = null, ray = null, ref = null, push = 0, stuck = false, rearing = false, gripping = false, spin = 0, yaw0 = null;

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
  // is a foot at base on the face of something (under the top just beside it, any way round)
  const NUDGE = [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]];
  function onFace(c, base) {
    for (const [x, z] of NUDGE) {
      _e.copy(base);
      _e.x += x; _e.z += z;
      if (ground(_e, _c) && _c.sub(base).dot(_up) > 0.05) return true;
    }
    return false;
  }

  // ---- the climb: the hull's pose, and its feet after it ----
  // The hull is posed about the middle of its hips (PIVOT): their height H over the root, its pitch P and its roll R (inner's rotation
  // about x and z). The pose it wants comes from the ground under its outline and, going, ahead of it (target), not from its feet; each
  // frame it goes toward that at its own rates (LIFT_RATE, PITCH_RATE, ROLL_RATE), only never deeper into anything. The legs follow:
  // they don't set how high it gets, so it never waits on a foothold, and held up at something it rears up and goes over as fast as
  // its pose turns, and stops where the driver stops.
  const PIVOT = new THREE.Vector3(0, hipY, 0);
  // (H: over the root; W: the same, in the world; wH, wP, wR: the pose it wants, its hips' height in the world; tH, tP, tR: that eased,
  // over the root)
  const body = { H: hipY, W: hipY, P: 0, R: 0, set: false, lean: { L: 0, R: 0, B: 0, F: 0 }, wH: hipY, wP: 0, wR: 0, tH: hipY, tP: 0, tR: 0 };
  const _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _pos = new THREE.Vector3(), _w = new THREE.Vector3(), _m4 = new THREE.Matrix4();
  const _q2 = new THREE.Quaternion(), _eu2 = new THREE.Euler(), _pos2 = new THREE.Vector3(), _w2 = new THREE.Vector3();
  let footL = null, loose = null, dist0 = null;
  const poseOf = (H, P, R) => { _q.setFromEuler(_eu.set(P, 0, R)); _pos.set(0, H, 0).sub(_w.copy(PIVOT).applyQuaternion(_q)); };
  // how far the hull, posed (_pos, _q in the root's frame), is into things, the root placed by matrix M: each of its points' depth under
  // the top over it, summed (m; more of it in, deeper)
  function hullDepth(M) {
    let deep = 0;
    for (const v of HULL3) {
      _w.copy(v).applyQuaternion(_q).add(_pos).applyMatrix4(M);
      if (ground(_w, _c)) deep += Math.max(0, _c.dot(_up) - _w.dot(_up));
    }
    return deep;
  }
  const _probe = new THREE.Vector3(), _h = { F: [], B: [], L: [], R: [] }, _anchor = [];
  const pct = (arr, q) => arr.sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(q * arr.length))];
  // the pose it wants (body.wH, wP, wR), from the ground under its outline: each half of it (front and back, left and right) stands its
  // hips their height over most of what is under it (SUPPORT), and at least CLEAR_HULL over the highest thing there; the halves' heights
  // pitch and roll it. So over a crate it rises just enough to clear it, over a gap it keeps to the tops either side, and, going, its
  // leading half looks ahead (LOOK_MIN, more as it goes faster), so at a wall it rears up to the wall's top before its nose is there
  // and goes on over it. Nothing counts higher than it can climb (CLIMB over its anchor): at a wall taller it rears up as far as that.
  function target(rootUp) {
    const going = Math.abs(push) > 0.5 || vel.lengthSq() > 0.25, ahead = pushed(_probe);
    const look = going ? THREE.MathUtils.clamp(vel.length() * LOOK_S, LOOK_MIN, LOOK_MAX) : 0, lead = push < -0.5 ? -1 : 1, cap = ref + CLIMB;
    for (const k in _h) _h[k].length = 0;
    let over = false;
    for (const [x, z] of HULL) {
      // (the leading half looks ahead; the other as far on as it is long, so the hull's tail rises to clear an edge its front is over)
      const leading = Math.sign(z || 1) === lead;
      for (const f of !going ? [0] : leading ? [0, 0.5 * look, look] : [0, TAIL_LOOK / 2, TAIL_LOOK]) {
        _a.set(x, 0, z).applyMatrix4(root.matrixWorld).addScaledVector(ahead, f);
        if (!ground(_a, _b)) continue;
        const y = Math.min(_b.dot(_up), cap);
        over ||= _b.dot(_up) > cap;
        (z >= 0 ? _h.F : _h.B).push(y);
        if (f === 0 && Math.abs(x) > 0.5) (x > 0 ? _h.R : _h.L).push(y);
      }
    }
    const need = (arr) => (arr.length ? Math.max(pct(arr, SUPPORT) + hipY, arr[arr.length - 1] + CLEAR_HULL) : rootUp + hipY);
    let hf = need(_h.F), hb = need(_h.B), hl = need(_h.L), hr = need(_h.R);
    // (the lower half rides up on stretched legs, as far as RIDE_ROOM, toward the higher: so it lifts level over a step or a low block
    // rather than rearing at it, and only pitches or rolls for what is left; not at something taller than it can climb, where it only rears
    // up as far as it can)
    // (and at a face taller than that, it rears instead: the less it rides up and the steeper it pitches, the taller the face, so its tail
    // stays low on its back legs and its nose goes up the face, the legs fanned up it)
    const rear = over ? 0 : THREE.MathUtils.smoothstep(Math.abs(hf - hb), REAR_FROM, REAR_FULL);   // (not at a wall it can't climb)
    const room = THREE.MathUtils.lerp(RIDE_ROOM, REAR_RIDE, rear);
    const ride = (lo, hi) => (over ? lo : Math.max(lo, Math.min(hi, lo + room)));
    if (hf > hb) hb = ride(hb, hf); else hf = ride(hf, hb);
    if (hr > hl) hl = ride(hl, hr); else hr = ride(hr, hl);
    // (all round: something taller just outside its outline, beside it, behind or (standing) ahead, and it leans toward it, that half up
    // to LEAN_MAX higher, so its legs on that side go up its face; going faster, less, so running past a wall it doesn't sway)
    // (not rearing up something: then it climbs)
    const slow = (1 - THREE.MathUtils.smoothstep(vel.length(), LEAN_SLOW, 2 * LEAN_SLOW)) * (1 - THREE.MathUtils.smoothstep(Math.abs(body.P), 0.3, 0.6));
    if (slow > 0) {
      const base = Math.min(hf, hb, hl, hr) - hipY;
      const lean = (x0, z0, dx, dz) => {
        let top = -Infinity;
        for (const out of LEAN_OUT) for (const t of [-1, 0, 1]) {
          _a.set(x0 * out + dx * t, 0, z0 * out + dz * t).applyMatrix4(root.matrixWorld);
          if (ground(_a, _b)) top = Math.max(top, Math.min(_b.dot(_up), cap));
        }
        return slow * LEAN_MAX * THREE.MathUtils.smoothstep(top - base, LEAN_FROM, LEAN_FULL);
      };
      const L = body.lean;
      L.L = lean(-LEAN_X, 0, 0, 2.5); L.R = lean(LEAN_X, 0, 0, 2.5); L.B = lean(0, -LEAN_Z, 1.5, 0); L.F = going ? 0 : lean(0, LEAN_Z + 1.2, 1.5, 0);
      hl += L.L; hr += L.R; hb += L.B; hf += L.F;
    } else body.lean.L = body.lean.R = body.lean.B = body.lean.F = 0;
    // (and its hips no more than HIPS_OVER over the climb's limit: a wall taller, it rears up its face but never gets its hull over it)
    const top = cap + HIPS_OVER;
    hf = Math.min(hf, top); hb = Math.min(hb, top); hl = Math.min(hl, top); hr = Math.min(hr, top);
    // (leaning to a side, it rises by half that: the near side goes up, the far side stays down)
    body.wH = (hf + hb) / 2 + 0.5 * (body.lean.L + body.lean.R);
    body.wP = THREE.MathUtils.clamp(-Math.atan2(hf - hb, THREE.MathUtils.lerp(PITCH_ARM, REAR_ARM, rear)), -PITCH_MAX, PITCH_MAX);
    // (rearing up a face still ahead of it, its tail stays down on its back legs and only its front rises: it hauls itself up only once
    // its nose is at the face (HAUL_NEAR to HAUL_FAR m from it, roles found it))
    const low = over ? 0 : rear * THREE.MathUtils.smoothstep(body.faceDist ?? 0, HAUL_NEAR, HAUL_FAR);
    if (low > 0) body.wH = THREE.MathUtils.lerp(body.wH, Math.min(hf, hb) + 0.5 * PITCH_ARM * Math.sin(Math.abs(body.wP)), low);
    body.rear = over ? 1 : rear;                                     // (for how fast it rears up: at a wall too tall, as slowly)
    body.wR = THREE.MathUtils.clamp(Math.atan2(hr - hl, ROLL_ARM), -ROLL_WANT, ROLL_WANT);
  }
  // rearing up a face: which legs climb it and which push from below. The face is where three rays ahead, low over its anchor, meet
  // something (its plane, so coming at it at an angle its near side's legs climb); the CLIMBERS legs whose hips are nearest it climb, the
  // rest push (pusher: foothold keeps them down, off the face). Not rearing, no roles
  const _fa = new THREE.Vector3(), _fl = new THREE.Vector3(), _fr = new THREE.Vector3(), _fd = new THREE.Vector3(), _fo = new THREE.Vector3();
  function roles(chs, rootUp) {
    for (const c of chs) c.pusher = false;
    body.faceDist = Infinity;
    if (!ray || Math.abs(body.tP) < STEEP_WANT) return;
    pushed(_probe);
    const across = _fd.crossVectors(_probe, _up).normalize();
    const at = (side, out) => ray(_fo.setFromMatrixPosition(root.matrixWorld).addScaledVector(_up, ref - rootUp + FACE_RAY_UP).addScaledVector(across, side), _probe, FACE_RAY, out);
    if (!at(0, _fa)) return;
    body.faceDist = _fa.distanceTo(_fo.setFromMatrixPosition(root.matrixWorld).addScaledVector(_up, ref - rootUp + FACE_RAY_UP)) - NOSE;
    if (body.faceDist < HAUL_NEAR) return;                             // (hauling itself up: they all climb)
    const l = at(-FACE_RAY_SIDE, _fl), r = at(FACE_RAY_SIDE, _fr);
    if (l || r) {                                                      // (its plane's way in: across it, flat)
      const t = l && r ? _fr.sub(_fl) : r ? _fr.sub(_fa) : _fa.clone().sub(_fl);
      _fd.crossVectors(_up, t.addScaledVector(_up, -t.dot(_up))).normalize();
      if (_fd.dot(_probe) < 0) _fd.negate();
    } else _fd.copy(_probe);
    const near = chs.map((c) => [c, c.joints[0].getWorldPosition(_fo).dot(_fd)]).sort((a, b) => b[1] - a[1]);
    near.forEach(([c], i) => { c.pusher = i >= CLIMBERS; });
  }
  // how fast it pitches up: rearing up a tall face, slower (REAR_PITCH_RATE)
  const pitchRate = () => THREE.MathUtils.lerp(PITCH_RATE, REAR_PITCH_RATE, body.rear || 0);
  function bodyPose(dt) {
    _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    _inv.copy(root.matrixWorld).invert();
    const chs = tank.gait.chains;
    footL ||= chs.map(() => new THREE.Vector3());
    // (a leg with nothing in reach to hold reaches for the hold it wants (c.want, out of reach), its foot most of its reach out toward it;
    // with none in sight, it hangs off the hull in its rest shape, drawn in a little: the first of HANGS with its foot in nothing and a
    // clear line to it from its hip, so wedged against something it hangs clear of it. Either way its foot goes there at HANG_SPEED, no
    // snapping from one to the next)
    for (const c of chs) {
      if (!c.hang || c.stepping) continue;
      c.joints[0].getWorldPosition(hipW);
      let found = false;
      if (c.wanting) {
        const far = _b.subVectors(c.want, hipW).length();
        _a.copy(hipW).addScaledVector(_b.divideScalar(Math.max(far, 1e-6)), Math.min(far, REACH_OUT * c.reach));
        found = !solid(_a) && !(ray && ray(hipW, _b, _a.distanceTo(hipW), _c));
      }
      for (let k = 0; !found && k < HANGS.length; k++) {
        const [f, dy] = HANGS[k];
        _a.lerpVectors(c.hip, c.rest, f);
        _a.y += dy;
        _a.applyQuaternion(_q.copy(inner.quaternion)).add(inner.position).applyMatrix4(root.matrixWorld);
        const far = _b.subVectors(_a, hipW).length();
        found = !solid(_a) && !(ray && far > 0.1 && ray(hipW, _b.divideScalar(far), far, _c));
        if (k === 0 && !found) _d.copy(_a);
      }
      if (!found) _a.copy(_d);
      // (from wherever it was: a planted foot just let go starts from its hold)
      const go = _b.subVectors(_a, c.F), len = go.length();
      c.F.addScaledVector(go, len > HANG_SPEED * dt ? (HANG_SPEED * dt) / len : 1);
    }
    // the feet that hold it, in the root's frame; the plane through them tilts it; those standing on tops (not gripping faces) seat it
    let n = 0, sxx = 0, szz = 0, sxy = 0, szy = 0, my = 0, mx = 0, mz = 0;
    gripping = false;
    for (let i = 0; i < chs.length; i++) {
      const c = chs[i];
      if (c.stepping) continue;
      footL[i].copy(c.F).applyMatrix4(_inv);
      if (c.hang) continue;                                            // (hanging, it stands on nothing)
      n++; mx += footL[i].x; mz += footL[i].z; my += footL[i].y;
      if (onFace(c, c.F)) gripping = true;
    }
    // (its anchor, what it climbs from: the ground under its outline, as high as ANCHOR of it is lower; so a hole under a corner doesn't
    // lower it, nor its nose over a top raise it, and wherever its feet have got to, it climbs no higher than CLIMB from where it stands)
    _anchor.length = 0;
    for (const [x, z] of HULL) if (ground(_a.set(x, 0, z).applyMatrix4(root.matrixWorld), _b)) _anchor.push(_b.dot(_up));
    if (_anchor.length) ref = pct(_anchor, ANCHOR);
    const rootUp = _up.dot(_d.setFromMatrixPosition(root.matrixWorld));
    if (body.set) body.H = body.W - rootUp;                            // (its height is kept in the world: the root may be anywhere under it)
    if (!body.set && ref === null) ref = rootUp;
    let Hn = body.H, Pn = body.P, Rn = body.R;
    if (n >= 3) {
      mx /= n; mz /= n; my /= n;
      for (let i = 0; i < chs.length; i++) {
        if (chs[i].stepping || chs[i].hang) continue;
        const x = footL[i].x - mx, z = footL[i].z - mz, y = footL[i].y - my;
        sxx += x * x; szz += z * z; sxy += x * y; szy += z * y;
      }
      Pn = THREE.MathUtils.clamp(-Math.atan(szz > 1e-6 ? szy / szz : 0), -PITCH_MAX, PITCH_MAX);
      Rn = THREE.MathUtils.clamp(Math.atan(sxx > 1e-6 ? sxy / sxx : 0), -ROLL_MAX, ROLL_MAX);
      Hn = my + hipY;
      if (!body.set) Object.assign(body, { H: Hn, P: Pn, R: Rn, tH: Hn, tP: Pn, tR: Rn, set: true });   // (first on its feet: as it stands)
    }
    // (a planted foot already out of its leg's reach holds nothing: it doesn't hold the hull back either, and it steps: strain)
    poseOf(body.H, body.P, body.R);
    loose ||= chs.map(() => false);
    dist0 ||= chs.map(() => 0);
    for (let i = 0; i < chs.length; i++) {
      dist0[i] = _w.copy(chs[i].hip).applyQuaternion(_q).add(_pos).distanceTo(footL[i]);
      loose[i] = !chs[i].stepping && (chs[i].hang || dist0[i] > LOOSE * chs[i].reach);
    }
    const deep0 = hullDepth(root.matrixWorld);
    // where it wants to be: from the ground under its outline (and, going, under where its front will be), not from its feet
    target(rootUp);
    roles(chs, rootUp);
    const k = 1 - Math.exp(-dt / TARGET_EASE);
    body.tH += (body.wH - rootUp - body.tH) * k; body.tP += (body.wP - body.tP) * k; body.tR += (body.wR - body.tR) * k;
    // and the most of the way there it may go this frame, at its own rates: only the hull no deeper into anything. The legs don't hold it
    // back: they follow it, stepping to keep up (a planted foot left out of reach holds nothing, and steps at once)
    // (rearing up a tall face, slower: a step at a time, its legs going up the face with it, never a leap)
    const lr = THREE.MathUtils.lerp(LIFT_RATE, REAR_LIFT_RATE, body.rear || 0);
    const dH = THREE.MathUtils.clamp(body.tH - body.H, -LIFT_RATE * dt, lr * dt);
    // (levelling out, cresting an edge, slower than it rears up: the legs swing round with the hull)
    const pr = Math.abs(body.tP) < Math.abs(body.P) ? LEVEL_RATE : pitchRate();
    const dP = THREE.MathUtils.clamp(body.tP - body.P, -pr * dt, pr * dt);
    const dR = THREE.MathUtils.clamp(body.tR - body.R, -ROLL_RATE * dt, ROLL_RATE * dt);
    let bH = body.H, bP = body.P, bR = body.R;
    for (const [a, b, r] of TRIES) {
      const H = body.H + a * dH, P = body.P + b * dP, R = body.R + r * dR;
      poseOf(H, P, R);
      if (hullDepth(root.matrixWorld) <= deep0 + 1e-4) { bH = H; bP = P; bR = R; break; }
    }
    Object.assign(body, { H: bH, W: bH + rootUp, P: bP, R: bR });
    poseOf(bH, bP, bR);
    inner.position.copy(_pos);
    inner.quaternion.copy(_q);
    inner.updateWorldMatrix(true, false);
    _ikInv.copy(inner.matrixWorld).invert();
    // (each leg's lane along the body goes with its hip: pitched up a climb, the hips close in over the middle, and the feet with them, so
    // the back ones can come in under the hull to hoist it; they keep their order, so the legs still never cross)
    for (const c of chs) {
      if (c.zLo === undefined) continue;
      c.lane0 ||= [c.zLo, c.zHi, c.home.z];
      const shift = _w.copy(c.hip).applyQuaternion(_q).add(_pos).z - c.hip.z;
      c.zLo = c.lane0[0] + shift; c.zHi = c.lane0[1] + shift; c.home.z = c.lane0[2] + shift;
    }
    // (climbing: a foot on a face, or standing up on something, or the hull tilted or hoisted: it won't close up)
    for (const c of chs) if (!c.stepping && !c.hang && c.F.dot(_up) > ref + 0.8) gripping = true;
    if (Math.abs(bP) > 0.2 || Math.abs(bR) > 0.2 || bH + rootUp - ref > hipY + 1) gripping = true;
    tank.climbing = gripping;
  }
  // how far the hull, at its height and posed as it is, would be into things with the root at x, y, z, turned yaw (the caller's collision:
  // never deeper)
  const _mr = new THREE.Matrix4(), _qy = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _at = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  function hits(x, y, z, yaw) {
    if (!ground) return 0;
    _q.copy(inner.quaternion);
    _pos.copy(inner.position);
    _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    _pos.y += _d.setFromMatrixPosition(root.matrixWorld).y - y;              // (the hull where it is in the world, whatever the root's height)
    return hullDepth(_mr.compose(_at.set(x, y, z), _qy.setFromAxisAngle(_Y, yaw), ONE));
  }
  // where foot c may stand near p. Of the spots round it (out to its leg's reach and a little ahead), the faces it would grip where a spot
  // is too tall to stand on or its top is behind its own edge, the faces round its hip, the face below an edge going down, and (standing)
  // the hold it has: those it may take, the one nearest the height the pose the hull wants puts it at (its stance under its hip there),
  // nearer ones winning among equals. It may take one in its leg's reach (not closer than the leg folds), in its lane, on its own side
  // of the body (SIDE in from the middle), with its leg's line clear of the hull and of everything else (or it grips the face between),
  // no higher than ABOVE over its hip nor than it can climb (CLIMB over its anchor), and on a top, with leverage (LEVER in from an edge
  // on its hip's side). Nothing it may take: the spot it can nearest reach, and the hull comes down to it.
  const hipW = new THREE.Vector3(), hipT = new THREE.Vector3(), _best = new THREE.Vector3(), _far = new THREE.Vector3(), _ahead = new THREE.Vector3();
  const _hullInv = new THREE.Matrix4(), _cand = new THREE.Vector3();
  let fc = null, fUp = null, fCeil = 0, fWant = 0, fBest = -Infinity, fFar = Infinity, fGround = null, fSide = 1, fRough = false;
  // in the hull's own frame, is p inside its shell (k: of its size)
  const shell = (v, k) => (v.x / (2.1 * k)) ** 2 + ((v.y - 3.24) / (1.3 * k)) ** 2 + ((v.z + 0.09) / (3.3 * k)) ** 2 < 1;
  const inHull = (p) => shell(_l2.copy(p).applyMatrix4(_hullInv), 1);
  // (the legs' solve, after the hull is posed this frame: its shell, which the hips stand just outside)
  const _ikInv = new THREE.Matrix4(), _ik = new THREE.Vector3();
  const inShell = (p) => shell(_ik.copy(p).applyMatrix4(_ikInv), 1);
  // judge spot q for foot fc: face (gripped), cost (m it is off where it was asked), bonus; keeps the best it may take
  function consider(q, face, cost, bonus = 0) {
    const far = _f.subVectors(q, hipW).length(), y = q.dot(fUp);
    // (and less, past MARGIN of its leg's reach from where its hip will be, or folded in near the closest it goes: it keeps some stretch in
    // hand, and some fold, to hoist with)
    const dT = q.distanceTo(hipT) / fc.reach;
    // (climbing, how far it is from where it was asked counts for less: up the face ahead of it beats the ground at the back of its lane)
    let score = -HEIGHT_COST * Math.abs(y - fWant) - cost * (fRough && !fc.pusher ? CLIMB_REACH_COST : 1) - (face ? FACE_COST : 0) + bonus
      - (fRough ? MARGIN_COST * (Math.max(0, dT - MARGIN) + Math.max(0, FOLD_MARGIN * NEAR - dT)) : 0);
    if (fRough) {
      // (pushing, rearing up a face: down on what it stands on, off the face)
      if (fc.pusher) score -= (face ? PUSH_FACE : 0) + PUSH_HIGH * Math.max(0, y - ref - 1);
      // (fanned out: a hold near another foot's counts less, so they spread up and along a face rather than bunch)
      for (const o of tank.gait.chains) {
        if (o === fc || o.hang) continue;
        score -= SPREAD_COST * Math.max(0, SPREAD - q.distanceTo(o.stepping ? o.T : o.F));
      }
    }
    if (score <= fBest) return;
    if (far > 0.96 * fc.reach) {                                                  // (out of reach: the nearest such, if nothing is in it)
      if (far < fFar && !face && !(ray && ray(hipW, _l1.subVectors(q, hipW).divideScalar(far), far - 0.05, _d) && !overEdge(q))) { fFar = far; _far.copy(q); }
      return;
    }
    if (far < NEAR * fc.reach || y > fCeil + 1e-3) return;
    const z = _f.copy(q).applyMatrix4(_inv).z;
    if (fc.zLo !== undefined && ((z < fc.zLo - 0.1 && !(stuck && push < 0)) || (z > fc.zHi + 0.1 && !(stuck && push > 0)))) return;
    if (_f.copy(q).applyMatrix4(_hullInv).x * fSide < SIDE) return;               // (its own side of the body)
    for (let t = 0.65; t <= 1.001; t += 0.07) if (inHull(_l1.lerpVectors(hipW, q, t))) return;   // (its foot and shin clear of the hull)
    if (!face) {
      // (its knee, up over the middle of its leg, in nothing: a foot right at the foot of a wall would put it into the wall)
      if (fGround(_l1.lerpVectors(hipW, q, 0.5).addScaledVector(fUp, KNEE_UP), _l2) && _l2.dot(fUp) > _l1.dot(fUp)) return;
      // (leverage: LEVER in from any edge between it and its hip, so it pulls on the top, never hooks a lip; past it, away from its hip,
      // the top may end where it likes: it straddles a narrow block; something higher on its hip's side is a corner: fine)
      const toward = _l1.subVectors(hipW, q).addScaledVector(fUp, -_l1.dot(fUp));
      if (toward.lengthSq() > 1e-6) {
        toward.normalize();
        for (const d of [0.25, 0.5, LEVER]) if (fGround(_l2.copy(q).addScaledVector(toward, d), _l2, fCeil) && _l2.dot(fUp) < y - 0.25) return;
      }
      if (ray && far > 1e-3 && ray(hipW, _l1.subVectors(q, hipW).divideScalar(far), far - 0.05, _d) && !overEdge(q)) {   // (in the way: its face)
        if (grip(fc, q, fCeil, _cand)) consider(_cand.clone(), true, cost, bonus);
        return;
      }
    }
    fBest = score;
    _best.copy(q);
  }
  // can foot fc reach q on a top over the edge in the way, as a leg does, its knee up: from its hip up past the edge (KNEE_UP over the
  // higher of the foot and the hip), then on to q, both clear
  const _k1 = new THREE.Vector3(), _k2 = new THREE.Vector3(), _k3 = new THREE.Vector3();
  function overEdge(q, hip = hipW, up = fUp) {
    const rise = Math.max(0, q.dot(up) - hip.dot(up)) + KNEE_UP;
    _k1.copy(hip).addScaledVector(up, rise);
    if (ray(hip, up, rise, _k3)) return false;
    const len = _k2.subVectors(q, _k1).length();
    return !ray(_k1, _k2.divideScalar(len), len - 0.05, _k3);
  }
  function foothold(c, p, out, groundFn) {
    c.joints[0].getWorldPosition(hipW);
    const up = _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    if (ref === null) ref = up.dot(_d.setFromMatrixPosition(root.matrixWorld));   // (not yet stood: where it is)
    _inv.copy(root.matrixWorld).invert();
    _hullInv.copy(inner.matrixWorld).invert();
    // (the height it wants: its stance under where its hip will be, in the pose the hull wants)
    _q2.setFromEuler(_eu2.set(body.tP, 0, body.tR));
    _pos2.set(0, body.tH, 0).sub(_w2.copy(PIVOT).applyQuaternion(_q2));
    hipT.copy(c.hip).applyQuaternion(_q2).add(_pos2).applyMatrix4(root.matrixWorld);
    // (a step picking its hold at lift-off (c.landIn s before it lands): its hip where it will be by then, on its way to the pose the hull
    // wants and carried on with the body, so it picks once and keeps it)
    const lead = c.landIn || 0;
    if (lead > 0) {
      hipW.lerp(hipT, Math.min(1, lead / POSE_T)).addScaledVector(vel, lead);
      hipT.addScaledVector(vel, lead);
    }
    fc = c; fUp = up; fGround = groundFn; fBest = -Infinity; fFar = Infinity; fSide = Math.sign(c.hip.x) || 1;
    // (climbing: it looks wider, and keeps stretch and fold in hand; walking, it lands where the rhythm asks)
    fRough = free();
    fCeil = Math.min(hipW.dot(up) + ABOVE, ref + CLIMB);
    // (on the side it leans to, toward something beside it, a hold up its face: LEAN_FOOT times the lean higher)
    fWant = hipT.dot(up) - (c.hipY - c.rest.y) + LEAN_FOOT * Math.max(c.hip.x < 0 ? body.lean.L : body.lean.R, c.hip.z < -1 ? body.lean.B : c.hip.z > 1 ? body.lean.F : 0);
    const toHip = _b.subVectors(hipW, p).addScaledVector(up, -_b.subVectors(hipW, p).dot(up)).normalize();
    const across = _side.crossVectors(toHip, up);
    pushed(_ahead);
    // (standing, the hold it has (or stepped off) counts HOLD more: it moves for a clearly better one, not one as good)
    if (Math.abs(push) < 0.5 && vel.lengthSq() < 0.25) consider(_cand.copy(c.stepping ? c.S0 : c.F), onFace(c, c.stepping ? c.S0 : c.F), 0, HOLD);
    for (let k = 0; k < AROUND.length + 3 * AHEAD.length; k++) {
      if (!fRough && k >= AROUND.length && (k - AROUND.length) % 3 !== 1) continue;
      // (round where it was asked; and ahead of it, in line and a little to either side: onto a narrow block its lane runs beside)
      const j = k - AROUND.length, [a, s] = AROUND[k] || [0, ((j % 3) - 1) * AHEAD_SIDE], f = j < 0 ? 0 : AHEAD[Math.floor(j / 3)];
      _c.copy(p).addScaledVector(toHip, a).addScaledVector(across, s).addScaledVector(_ahead, f);
      const cost = REACH_COST * Math.hypot(a, s, f);
      if (!groundFn(_c, _e, fCeil)) {                                             // (too tall for it: its face)
        if (grip(c, _c, fCeil, _g)) consider(_g, true, cost);
        continue;
      }
      consider(_e, false, cost);
      // (far below, over an edge: the face it went over, looked for back the way it came, down from its hip, for a hold going down)
      if (ray && _e.dot(up) < hipW.dot(up) - c.reach * 0.8) {
        for (let dy = 1.5; dy < c.reach; dy += 1.2) {
          _l1.copy(_c).addScaledVector(up, hipW.dot(up) - dy - _c.dot(up)).addScaledVector(_ahead, 1);
          if (!ray(_l1, _l2.copy(_ahead).negate(), 4, _d)) continue;
          consider(_g.copy(_d), true, cost);
          break;
        }
      }
    }
    // (in line with its hip, ahead of it: the top of a block narrower than its lanes are wide, that the spots out in its lane miss)
    for (const f of fRough ? HIP_AHEAD : []) {
      _c.copy(hipW).addScaledVector(up, -hipW.dot(up) + p.dot(up)).addScaledVector(_ahead, f);
      if (groundFn(_c, _e, fCeil)) consider(_e, false, REACH_COST * _c.distanceTo(p) * 0.5);
      else if (grip(c, _c, fCeil, _g)) consider(_g, true, REACH_COST * _c.distanceTo(p) * 0.5);
    }
    // (faces round its hip: out, in under the body, down, a little ahead and behind; the face of a narrow block beside it, say, that none
    // of the spots round its lane is over: gripped as high as it reaches)
    if (ray) {
      for (const [x, y, z] of FACE_RAYS) {
        _l1.set(x * fSide, y, z).normalize().transformDirection(root.matrixWorld);
        if (!ray(hipW, _l1, 0.95 * c.reach, _d)) continue;
        if (groundFn(_l2.copy(_d).addScaledVector(_l1, 0.1), _l2, fCeil) && _l2.dot(up) < _d.dot(up) + 0.1) continue;   // (a top: not a face)
        if (!grip(c, _l2.copy(_d).addScaledVector(_l1, 0.3), fCeil, _g)) continue;
        consider(_g, true, REACH_COST * _f.subVectors(_g, p).addScaledVector(up, -_f.dot(up)).length());
      }
    }
    return fBest > -Infinity ? out.copy(_best) : fFar < Infinity ? out.copy(_far) : null;
  }
  // which way it is pushed along the ground (the way it faces, or backs), or else going
  function pushed(out) {
    if (Math.abs(push) <= 0.5) return heading(out);
    out.setFromMatrixColumn(root.matrixWorld, 2).multiplyScalar(Math.sign(push));
    return out.addScaledVector(_up, -out.dot(_up)).normalize();
  }
  // which way it is going along the ground (ahead, standing still)
  function heading(out) {
    out.copy(vel).addScaledVector(_up, -vel.dot(_up));
    if (out.lengthSq() < 0.25) out.setFromMatrixColumn(root.matrixWorld, 2).multiplyScalar(push < 0 ? -1 : 1).addScaledVector(_up, -out.dot(_up));
    return out.normalize();
  }
  // foot c on the face of what stands where it would land (p): where the line from its hip down to p meets it, then up the face as high as
  // it reaches (to ceil, and far enough from its hip for the leg to fold to); or null
  const _gd = new THREE.Vector3();
  function grip(c, p, ceil, out) {
    if (!ray) return null;
    const up = _up, far = _f.subVectors(p, hipW).length();
    if (far < 1e-3 || !ray(hipW, _gd.copy(_f).divideScalar(far), far + 0.05, _d)) return null;
    const dh = _f.subVectors(_d, hipW).addScaledVector(up, -_f.dot(up)).length(), hip = hipW.dot(up), base = _d.dot(up);
    if (base > ceil) return null;                                              // (it met a top, too high to stand on: no hold)
    if (ground(_f.copy(_d), _f) && Math.abs(_f.dot(up) - base) < 0.05) return out.copy(_d);   // (it met a top: it stands on it, there)
    // (no higher up the face than its top: what is just inside it, along the line)
    const faceTop = ground(_f.copy(_d).addScaledVector(_gd, 0.05), _f) ? _f.dot(up) - 0.1 : ceil;
    const y = Math.max(base, Math.min(ceil, faceTop, hip - Math.sqrt(Math.max(0, (NEAR * c.reach) ** 2 - dh * dh))));
    if (_f.copy(_d).addScaledVector(up, y - base).distanceTo(hipW) > 1.1 * c.reach) return null;
    return out.copy(_d).addScaledVector(up, y - base);
  }
  // how badly planted foot c wants to step: as its leg, trailing below a risen hull, nears its full stretch, or at once if something has
  // come between its hip and its foot (the hull has gone on past an edge)
  function strain(c) {
    if (c.joints[0].getWorldPosition(hipW).distanceTo(c.F) > LOOSE * c.reach) return 2;   // (out of reach: holding nothing, it goes)
    // (pushed on but held up, the legs on the side it is pushed toward step to anything better in reach: it climbs, or grips the face)
    if (stuck && c.hip.z * push > 0.3) {
      const want = foothold(c, _a.copy(c.rest).applyMatrix4(root.matrixWorld), _g, ground);
      if (want && (want.dot(_up) > c.F.dot(_up) + 0.3 || want.distanceTo(c.F) > 1)) return 1.5;
    }
    const far = _f.subVectors(c.F, hipW).length();
    const raised = -_f.dot(_up.setFromMatrixColumn(root.matrixWorld, 1).normalize()) > c.hipY - c.rest.y + 0.3;
    let k = raised && (_f.dot(vel) < 0 || vel.lengthSq() < 0.01) ? 1 + (far - STRETCH * c.reach) / (0.06 * c.reach) : 0;
    if (ray && far > 0.2 && ray(hipW, _f.divideScalar(far), far - 0.15, _e) && !overEdge(c.F, hipW, _up)) k = Math.max(k, 2);
    return k;
  }
  // is world point p inside something (under the top of what is there): a knee or ankle there turns aside (gait.js)
  const _s = new THREE.Vector3();
  // (or inside the hull's shell, a little inside it: the knees swing out round the hull rather than through it)
  const solid = (p) => (!!ground && !!ground(p, _s) && _s.sub(p).dot(_up) > 0.05) || inShell(p);
  // the climbing gait (gait.js free): while it is steep, or still rising to the pose it wants, or slowly while it climbs, each leg steps
  // as it needs to: at once out of reach, more the nearer its full stretch, the further its hold is from the height the pose wants it
  // at, with something come between its hip and its foot, carried out of its lane or in toward the body's middle; pushed on and held up,
  // a front leg also for a better hold. One may lift only while every corner of the body (front and back, each side) keeps a foot down,
  // or LIFT_HELD others hold (that is for looks: the body stands on its own; a foot out of reach, holding nothing, always goes)
  const free = () => Math.abs(spin) < FREE_SPIN && (rearing || Math.abs(body.P) > STEEP_WANT
    || (vel.length() < FREE_SPEED && (tank.climbing || stuck || Math.abs(body.tH - body.H) > 0.5 || Math.abs(body.tP - body.P) > 0.25)));
  function need(c) {
    if (c.hang) return 3;
    c.joints[0].getWorldPosition(hipW);
    const far = hipW.distanceTo(c.F), k = far / c.reach;
    if (k > LOOSE) return 3;
    // (pushing from below, rearing up a face: it stays where it stands, at full stretch, whatever height the pose would have it at)
    const st = c.pusher ? PUSH_STRETCH : NEED_STRETCH;
    let n = k > st ? 1 + (k - st) * 10 : 0;
    _q2.setFromEuler(_eu2.set(body.tP, 0, body.tR));
    _pos2.set(0, body.tH, 0).sub(_w2.copy(PIVOT).applyQuaternion(_q2));
    hipT.copy(c.hip).applyQuaternion(_q2).add(_pos2).applyMatrix4(root.matrixWorld);
    // (off the height it wants, no higher than it could stand: against a wall too tall, a foot as high as it reaches is where it belongs)
    const off = Math.abs(c.F.dot(_up) - Math.min(hipT.dot(_up) - (c.hipY - c.rest.y), hipW.dot(_up) + ABOVE, ref + CLIMB));
    if (off > NEED_OFF && !c.pusher) n = Math.max(n, 0.5 + 0.2 * off);
    if (ray && far > 0.2 && ray(hipW, _f.subVectors(c.F, hipW).divideScalar(far), far - 0.15, _e) && !overEdge(c.F, hipW, _up)) n = Math.max(n, 2);
    // (carried out of its lane, or in toward the body's middle, sliding along a wall say: back where it belongs, the latter at once)
    const z = _f.copy(c.F).applyMatrix4(_inv.copy(root.matrixWorld).invert()).z;
    if (c.zLo !== undefined && (z < c.zLo - 0.5 || z > c.zHi + 0.5)) n = Math.max(n, 1.3);
    if (_f.copy(c.F).applyMatrix4(_hullInv.copy(inner.matrixWorld).invert()).x * Math.sign(c.hip.x) < SIDE) n = Math.max(n, 2.5);
    if (stuck && c.hip.z * push > 0.3) {
      const want = foothold(c, _a.copy(c.rest).applyMatrix4(root.matrixWorld), _g, ground);
      if (want && (want.dot(_up) > c.F.dot(_up) + 0.3 || want.distanceTo(c.F) > 1)) n = Math.max(n, 1.2);
    }
    return n;
  }
  function canLift(c) {
    const chs = tank.gait.chains, held = [false, false, false, false];
    if (loose && loose[chs.indexOf(c)]) return true;                  // (holding nothing, it may always go)
    let n = 0;
    for (let i = 0; i < chs.length; i++) {
      const o = chs[i];
      if (o === c || o.stepping || (loose && loose[i])) continue;
      held[(o.hip.x > 0 ? 2 : 0) + (o.hip.z > 0 ? 1 : 0)] = true;
      n++;
    }
    return held.every(Boolean) || n >= LIFT_HELD;                    // (or plenty else holding: a corner whose other leg hangs isn't stuck)
  }
  // a stepping foot lifts up off the ground; the hull steep, up off the hull and out to its own side, so its leg swings clear of the hull
  // rather than along it
  const _lu = new THREE.Vector3(), _lx = new THREE.Vector3();
  function liftDir(c, out) {
    _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    const k = Math.min(1, Math.abs(body.P) / STEEP);
    if (k < 0.05) return out.copy(_up);
    _lu.setFromMatrixColumn(inner.matrixWorld, 1).normalize();
    _lx.setFromMatrixColumn(inner.matrixWorld, 0).normalize().multiplyScalar(Math.sign(c.hip.x) || 1);
    return out.copy(_up).lerp(_lu, k).addScaledVector(_lx, LIFT_OUT * k).normalize();
  }
  const gait = makeGait(root, inner, legs, { air: false, bodyPose, foothold, strain, solid, urge: () => (stuck ? Math.sign(push) : 0), wave: true, pole: true, free, need, canLift, liftDir });
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
    form: 'walk', fold: 0, beam: { state: 'idle', t: 0 }, speedCap: 1, speedMax: Infinity, hits, pose: body,
    skimLift: 0, yaw: 0, bank: 0, climbing: false,
    walkMax: SKIM_AT,                                                // m/s past which it closes up to skim (overdrive)
    reverseMax: REVERSE,                                             // m/s the most it backs up at
    climbMax: CLIMB,                                                 // m the most it climbs, over the ground under it (lab sweep)
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
    update(dt, { speed = 0, push: want = speed, ground: g = null, ray: r = null, trigger = false } = {}) {
      ground = g; ray = r; push = want;
      this.t += dt;
      root.updateWorldMatrix(true, false);
      _a.setFromMatrixPosition(root.matrixWorld);
      if (dt > 0 && this.t > dt) vel.lerp(_b.subVectors(_a, prev).divideScalar(dt), 1 - Math.exp(-dt * 8));
      prev.copy(_a);
      // (how fast it turns, rad/s)
      const yawIs = Math.atan2(_b.setFromMatrixColumn(root.matrixWorld, 2).x, _b.z);
      if (yaw0 !== null && dt > 0) spin += ((THREE.MathUtils.euclideanModulo(yawIs - yaw0 + Math.PI, Math.PI * 2) - Math.PI) / dt - spin) * Math.min(1, dt * 8);
      yaw0 = yawIs;
      // (held up: pushed, and not getting on the way it is pushed, though it may be sliding along what holds it up)
      // (or creeping up to something it is rearing up at: held up by its own climb)
      stuck = Math.abs(push) > 0.5 && (rearing || vel.dot(_b.setFromMatrixColumn(root.matrixWorld, 2).normalize()) * Math.sign(push) < 0.5);
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
      // (climbing a face, steeply: no faster than CLIMB_SPEED)
      if (this.fold === 0 && (Math.abs(body.tP) > STEEP_WANT || Math.abs(body.P) > STEEP_WANT)) this.speedMax = Math.min(this.speedMax, CLIMB_SPEED);
      // (still rearing up at a tall face: it creeps, so its back legs keep their footing while it lifts, and then it climbs)
      if (this.fold === 0 && (body.rear || 0) > 0.5 && Math.abs(body.tP) - Math.abs(body.P) > 0.15) this.speedMax = Math.min(this.speedMax, REAR_CREEP);
      // (still rising to the pose it wants, pushed on: its legs step by need to keep up with it, gait.js free)
      rearing = Math.abs(push) > 0.5 && (body.tH - body.H > 0.5 || Math.abs(body.tP - body.P) > 0.25);
      // (and no faster than lets its hull rise clear of what is ahead before it gets there, at its own rates; or, what even the pose it wants
      // would meet, braking short of it: a wall taller than it climbs)
      if (this.fold === 0 && body.set && Math.abs(push) > 0.5 && ground) {
        pushed(_probe);
        const turnT = Math.abs(body.tP - body.P) / pitchRate(), lr = THREE.MathUtils.lerp(LIFT_RATE, REAR_LIFT_RATE, body.rear || 0);
        for (const d of BRAKE_AT) {
          _m4.copy(root.matrixWorld).setPosition(_w.setFromMatrixPosition(root.matrixWorld).addScaledVector(_probe, d));
          poseOf(body.tH, body.tP, body.tR);
          if (hullDepth(_m4) > GRAZE) { this.speedMax = Math.min(this.speedMax, d === BRAKE_AT[0] ? TOUCH : Math.max(TOUCH, Math.sqrt(2 * BRAKE * (d - 1)))); break; }
          let lift = 0;
          for (; lift < body.tH - body.H; lift += 0.5) {
            poseOf(body.H + lift, body.P, body.R);
            if (hullDepth(_m4) <= GRAZE) break;
          }
          if (lift > 0) { this.speedMax = Math.min(this.speedMax, Math.max(TOUCH, d / Math.max(lift / lr, turnT, 0.05))); break; }
        }
      }
      // overdrive: close up past SKIM_AT, open out under SKIM_OFF (never while the beam is up or fire is held, nor start while it climbs
      // or grips)
      const skimWant = (this.fold > 0.5 ? speed > SKIM_OFF : speed >= SKIM_AT && !(this.fold === 0 && this.climbing)) && !firing && !hold;
      this.fold = THREE.MathUtils.clamp(this.fold + (skimWant ? dt : -dt) / FOLD_TIME, 0, 1);
      this.form = this.fold <= 0 ? 'walk' : this.fold >= 1 ? 'skim' : 'folding';
      // the legs: walk (IK) until they start to fold, and again as they finish opening
      // (the hull as it was posed, so its hips are where they are while it looks for footholds; folding, it settles level)
      const rootUp = _up.setFromMatrixColumn(root.matrixWorld, 1).normalize().dot(_d.setFromMatrixPosition(root.matrixWorld));
      // (first given the ground: the pose it wants there, from the start, so its feet plant from where its hips will be: put down on top of
      // something, it stands on it)
      if (!body.set && ground && this.fold < 0.15) {
        if (ref === null) ref = rootUp;
        target(rootUp);
        Object.assign(body, { H: body.wH - rootUp, W: body.wH, P: body.wP, R: body.wR, tH: body.wH - rootUp, tP: body.wP, tR: body.wR });
        if (body.wH - rootUp > hipY + 1) ref = body.wH - hipY;              // (and its anchor up there with it)
        body.set = true;
      }
      if (this.fold < 0.15 && body.set) { poseOf(body.W - rootUp, body.P, body.R); inner.position.copy(_pos); inner.quaternion.copy(_q); }
      else if (this.fold >= 0.15) { inner.position.set(0, 0, 0); inner.quaternion.identity(); Object.assign(body, { H: hipY, W: rootUp + hipY, P: 0, R: 0, tH: hipY, tP: 0, tR: 0 }); }
      gait.update(dt, ground && this.fold < 0.15 ? ground : null, false);
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
  tank.gait = gait;
  tank.folded(0);
  return tank;
}
