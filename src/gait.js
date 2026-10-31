import * as THREE from 'three';

// Walking on jointed legs: the kit's `leg` pivots that have `knee` pivots down them and a `foot` at the ground contact (the mites' legs,
// the mandrake's roots; tools/blender/chimera_common.py limb_chain; the spider tank's). Each foot stays planted where it last stepped until
// the body has carried its rest spot a stride away, then steps to just ahead of that spot in an arc. The legs step in two sets that take
// turns (the builder's two swing phases: a tripod on six legs, every other root round a tuber, a tetrapod on eight). Each leg reaches its
// foot by IK (FABRIK along its joints, started from the rest pose each frame so the knees bend the way they were built), and the body rides
// on its feet: raised or lowered to them, pitched and rolled to their slope. Trotting, the strides lengthen with the speed (the steps no
// quicker than DUR_MIN) as far as the legs reach. Past a trot (RUN), in the air, or not given the ground, it eases back to the plain swing
// (chimerabuild.js anim): stepping any faster looks like a gallop or a twitch.
//
// A step onto something higher reaches up first and then over; one down goes over first and then down; one whose path crosses something
// taller (a crate, a wall top, a hump) arcs over it. Its landing's height is settled part way through, so a foot never flops between two.
// Big legs step slower, as a pendulum swings (DUR_REF).
//
// makeGait(root, inner, legs, opts) -> null (no jointed legs) or { update(dt, ground, gap), chains, vmax, weight }, called by anim after
// the swing is set (each jointed leg's swing angle in L.swing). ground(p, out[, ceil]) puts the ground point under world point p in out
// and returns it (with ceil: the highest one no higher than ceil, or null where p is inside something taller). The root's world transform
// must be this frame's (the caller places it before calling anim). opts:
//   lift        how far the feet may raise or lower the body (of the hip height; 0.4)
//   air         false: never off the ground (the caller says when it is: the spider tank sets its own ride height)
//   body(h)     the body's lift, given its feet's mean height off their rest spots (replaces lift's clamp)
//   followRate  1/s the body follows (FOLLOW)
//   bodyPose(dt)   sets the body (inner) itself, from the feet as they are this frame, in place of the lift, pitch and roll above
//               (the spider tank's climb)
//   pitchMax, rollMax   rad the most the body pitches and rolls to its feet (TILT; the tank's climbs at a steeper pitch)
//   foothold(c, p, out, ground)   where foot c may stand near p (null: nowhere); the tank's keeps to what the leg can reach
//   strain(c)   how badly planted foot c wants to step, besides its stride (past 1 it is due; past 2 it goes even while the other set
//               is stepping): the tank's, when a leg nears its full stretch or something comes between its hip and its foot
//   long        true: each leg strides as far as it can reach ahead and behind (not only as far as the tightest leg), and the steps
//               are timed by a duty factor (the share of a stride a foot is down, DUTY_WALK to DUTY_TOP): from a walk to a run each
//               foot's swing grows as long as its stance, then a little longer (a moment with no foot down: the tank's jets carry it)
//   wave        true: the legs step to one rhythm, each at its own place in it: walking, a ripple up each side from the back leg to
//               the front (the sides half a stride apart), running, two sets of four that take turns; and each foot keeps to its own
//               lane along the body, so the legs never cross (the strides stay short: the tank's). strain(c) past 1 keeps it stepping.
//   urge()      (wave) +1 or -1 while the caller pushes ahead or back and the body is held up: each foot lands at that end of its lane,
//               drawing the legs under the body so it can hoist itself over what holds it (the tank's climb)
//   pole        true: two- and three-bone legs are solved exactly with the knee bent up (as built), the ankle folding with the
//               reach, so a leg never flips between shapes from one frame to the next (FABRIK can, with three bones)
//   solid(p)    (with pole) true where world point p is inside something: a knee or ankle that would be turns about its hip-to-foot line
//               (forward, back, further) to the nearest way that is clear, and eases there
//   free(), need(c), canLift(c)   (wave) while free() (the tank: climbing, slow), no rhythm: each planted leg steps as it needs to
//               (need(c) past 0, the neediest first; FREE_MAX at once, never two neighbours), if the rest still hold the body
//               (canLift(c)), and lands where it would in its lane, taking FREE_DUR; one needing to go (need(c) 3) with nowhere to go
//               hangs (c.hang: the caller holds its foot where it hangs)
//   liftDir(c, out)   the way a stepping foot lifts (world up, without it): the tank's, off the hull when it is steep

const STRIDE = 0.5;     // a foot steps once its rest spot is this far from it (of the leg's span: hip to foot, along the ground)
const LEAD = 0.55;      // walking, it lands this far ahead of its rest spot (of the stride)
const LIFT = 0.35;      // the step's arc (of the span)
const SETTLE = 0.3;     // standing, a set further than this from its spots (of the stride) steps back under the body
const STRIDE_MAX = 2.2; // trotting, the stride stretches up to this (of the span), or as far as the legs reach: feet land far ahead
const REACH = 0.94;     // of a leg's length, the furthest it stretches to a foot
const DUR_MIN = 0.075, DUR_MAX = 0.22;    // s a step takes: quick at a scurry, slower at a stroll (trotting, the stride grows instead)
const DUR_FAST = 0.05;  // s the quickest step, once the stride is at its longest
const DUR_REF = 0.65;   // m of span past which steps slow as the square root of the span (a pendulum): a mite's are as above
const RUN = 13.5;       // spans a second past which it runs on the plain swing (5.4 m/s on the lab's mite; back on its feet under 0.85 of it)
const AIR = 0.04;       // m above the ground (of the span) that counts as off it
const BLEND = 7;        // 1/s the ease between the IK and the plain swing
const FOLLOW = 12;      // 1/s the body follows its feet
const TILT = 0.45;      // rad the most the body pitches or rolls to its feet
const SETTLED = 0.4;    // of a step, after which its landing keeps its height (a foot doesn't flop between two)
const ITER = 24;        // FABRIK passes at most (a mite's leg is within a tenth of a millimetre in three; a long leg swung far takes more)
const STANCE = 0.3;     // s (of the pendulum's scale) a long stride's foot stays down, walking: the stride grows to keep it so
const DUTY_WALK = 0.65, DUTY_RUN = 0.5, DUTY_TOP = 0.42;   // long: a foot's share of the stride down, walking, at full stride, flat out
const FLAT_OUT = 3;     // long: of the speed the stride is full at, where the duty reaches DUTY_TOP
const LONG_REACH = 0.82; // long: of the room a foot has ahead and behind, the most a stride uses (the legs stay bent at its ends)
const LOW = 0.4;        // long: how much flatter the arc gets per full-stride speed past it
const SLACK = 0.85;     // long: of a foot's room behind its rest spot, how much a stride plans to use
const SWIVELS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2];   // pole, solid: rad a leg may turn about its hip-to-foot line, nearest first
const SWIVEL_RATE = 9;  // rad/s it eases to a new one
const FOLD = 0.55;
const FEMUR_UP = 1.2;   // pole, three bones: rad the thigh rises over the level at most (out from the hip); closer in, the ankle folds
const GAP = 0.3;        // wave: m between two neighbours' lanes (the feet always in order along the body)
const LANE_REACH = 0.9;  // wave: of the front leg's room ahead and the back leg's behind, how far the lanes reach
const DUTY_RIPPLE = 0.75, DUTY_SETS = 0.5, DUTY_FAST = 0.45;   // wave: a foot's share of the rhythm down: a walk's ripple, a run's sets, flat out
const WALK_SPANS = 1, RUN_SPANS = 2.4;   // wave: spans a second under which it ripples, and past which it runs in sets (blending between)
const WAVE_STANCE = 0.75; // wave: s a foot stays down, walking, as long as its lane allows
const SETTLE_SPEED = 0.3; // wave: of a span a second, the pace it steps at to settle its feet, standing      // pole: the ankle's bend at the shortest reach (of its rest angle; straighter out to 1.15 of it)
const FREE_MAX = 2, FREE_DUR = 0.42;   // wave, free: legs stepping at once at most, and s a step takes
const FIX_AT = 0.45;      // wave, free: of a step, after which its landing stays put (it no longer follows the best hold it sees)
const SAME_HOLD = 0.12;   // wave, settling: of its span, the nearest to where a foot stands that a step may land (nearer: it stays put)

const _p = new THREE.Vector3(), _up = new THREE.Vector3(), _g = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _vh = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _e = new THREE.Euler(), _X = new THREE.Vector3(1, 0, 0);
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Matrix4(), _Y = new THREE.Vector3(0, 1, 0);
const _vt = new THREE.Vector3(), _vs = new THREE.Vector3(), _vw = new THREE.Vector3();
const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _ld = new THREE.Vector3();
const smooth = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };

export function makeGait(root, inner, legs, { lift: follow = 0.4, air = true, body = null, followRate = FOLLOW, foothold = null, strain = null, urge = null, solid = null, bodyPose = null, long = false, wave = false, pole = false, pitchMax = TILT, rollMax = TILT, free = null, need = null, canLift = null, liftDir = null } = {}) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const chains = [];
  for (const L of legs) {
    const joints = [L.node];
    let foot = null;
    for (let n = L.node; n && !foot;) {
      foot = n.children.find((c) => c.userData.role === 'foot') || null;
      const knee = n.children.find((c) => c.userData.role === 'knee');
      if (!foot && knee) joints.push(knee);
      n = knee;
    }
    if (!foot || joints.length < 2) continue;
    L.chain = true;
    const space = L.node.parent;                                      // (the legs part: the hips' frame, where the IK works)
    const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert();
    const pts = [...joints, foot].map((o) => new THREE.Vector3().setFromMatrixPosition(_m.multiplyMatrices(toSpace, o.matrixWorld)));
    const inRoot = [...joints, foot].map((o) => new THREE.Vector3().setFromMatrixPosition(_m.multiplyMatrices(rootInv, o.matrixWorld)));
    const len = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
    const dir = pts.slice(1).map((p, i) => p.clone().sub(pts[i]).normalize());
    // each bone's rest orientation in the legs part's frame, and its frame (along it; across it, in the leg's plane) to turn from
    const W = [];
    joints.forEach((j, i) => W.push(i ? W[i - 1].clone().multiply(j.quaternion) : j.quaternion.clone()));
    const plane = _n.crossVectors(_a.subVectors(pts[1], pts[0]), _b.subVectors(pts[pts.length - 1], pts[0]));
    const nRest = plane.lengthSq() > 1e-10 ? plane.clone().normalize() : null;
    const basis = dir.map((d) => (nRest ? frameOf(d, nRest, new THREE.Matrix4()).transpose() : null));
    const hip = inRoot[0], rest = inRoot[inRoot.length - 1];
    const span = Math.hypot(rest.x - hip.x, rest.z - hip.z);
    // how far its foot can go ahead of its rest spot and behind it, along the ground, before the leg is straight
    const reach = REACH * inRoot.slice(1).reduce((s, p, i) => s + p.distanceTo(inRoot[i]), 0);
    const ux = rest.x - hip.x, uz = rest.z - hip.z, room = Math.sqrt(Math.max(0, reach * reach - (hip.y - rest.y) ** 2 - ux * ux));
    const grow = Math.min((uz + room) / (STRIDE * span), (room - uz) / (LEAD * STRIDE * span));     // (the stride it allows, of a walk's)
    chains.push({
      L, joints, space, pts, len, dir, W, nRest, basis, rest, span, grow, reach, back: 0.95 * (uz + room), fwd: 0.95 * (room - uz),
      bend: pole && nRest && pts.length <= 4 ? bendOf(pts) : null,
      thr: STRIDE * span, hipY: hip.y, hip, group: L.ph ? 1 : 0,
      bind: joints.map((j) => j.quaternion.clone()), work: pts.map((p) => p.clone()), ik: joints.map(() => new THREE.Quaternion()),
      turned: joints.map(() => new THREE.Quaternion()), lead: 0, trip: 0, swivel: 0,
      F: new THREE.Vector3(), S0: new THREE.Vector3(), T: new THREE.Vector3(), at: new THREE.Vector3(), base: new THREE.Vector3(), s: 0, dur: DUR_MAX, lift: 0, over: 0, stepping: false,
    });
  }
  if (!chains.length) return null;
  const span = chains.reduce((s, c) => s + c.span, 0) / chains.length;
  const thr = STRIDE * span;
  const kd = Math.max(1, Math.sqrt(span / DUR_REF));                 // (big legs swing slower)
  const durMin = DUR_MIN * kd, durMax = DUR_MAX * kd, durFast = DUR_FAST * kd;
  // the longest stride, of a walk's: as far as the tightest leg reaches both ways, or (long) as far as each reaches ahead and behind
  const growMax = long
    ? THREE.MathUtils.clamp((LONG_REACH * Math.min(...chains.map((c) => (c.back + c.fwd) / c.span))) / (STRIDE * (1 + LEAD)), 1, 2 * STRIDE_MAX / STRIDE)
    : THREE.MathUtils.clamp(Math.min(...chains.map((c) => c.grow)), 1, STRIDE_MAX / STRIDE);
  const vmax = RUN * span;                                           // m/s past which it runs on the swing (it scales with the legs)
  const vFull = (thr * growMax * (1 + LEAD)) / (STANCE * kd);        // long: m/s at which the stride is full
  const hipY = chains.reduce((s, c) => s + c.hipY, 0) / chains.length;
  const G = { w: 0, run: false, planted: false, seen: false, prev: new THREE.Vector3(), vel: new THREE.Vector3(), lift: 0, pitch: 0, roll: 0, h: 0,
    phase: 0, yaw: null, drive: 0, stride: 0, run01: 0 };
  // wave: each side's legs front to back, their places in the rhythm (rippling up from the back; in sets), and their lanes
  let strideMax = 0;
  if (wave) {
    for (const side of [-1, 1]) {
      const row = chains.filter((c) => Math.sign(c.rest.x) === side).sort((a, b) => b.rest.z - a.rest.z);
      // (the side's reach, front leg's furthest ahead to the back leg's furthest behind, cut into even lanes with a GAP between)
      const top = row[0].rest.z + LANE_REACH * row[0].fwd, end = row[row.length - 1].rest.z - LANE_REACH * row[row.length - 1].back;
      const lane = (top - end) / row.length;
      row.forEach((c, r) => {
        c.ripple = ((row.length - 1 - r) / row.length + (side > 0 ? 0.5 : 0)) % 1;
        c.sets = ((r + (side > 0 ? 1 : 0)) % 2) * 0.5;
        c.zHi = top - r * lane - (r ? GAP / 2 : 0);
        c.zLo = top - (r + 1) * lane + (r < row.length - 1 ? GAP / 2 : 0);
        c.row = r;
        c.home = c.rest.clone().setZ((c.zHi + c.zLo) / 2);             // (where its stance centres: its lane's middle)
        c.rv = new THREE.Vector3();
      });
    }
    strideMax = Math.min(...chains.map((c) => c.zHi - c.zLo));
  }
  let groundFn = null;
  const footAt = foothold ? (c, p, out) => foothold(c, p, out, groundFn) : (c, p, out) => groundFn(p, out);

  const stepping = (group) => chains.some((c) => c.group === group && c.stepping);
  // what stands between a foot and where it will land (a crate, a wall top, a hump): the step goes over it, high early and late
  function clear(c, to) {
    let top = 0;
    for (let k = 1; k <= 4; k++) {
      _r2.lerpVectors(c.F, to, k / 5);
      if (footAt(c, _r2, _r3)) top = Math.max(top, _r3.sub(_r2).dot(_up));
    }
    c.over = top > 0.05 * c.span ? top + 0.15 * c.span : 0;
  }
  // where a stepping foot lands: its rest spot where the body will be when it lands, and the lead ahead of it
  function landing(c, speed, out) {
    restSpot(c, out).addScaledVector(_vh, c.dur * (1 - c.s));
    if (speed > 1e-3) out.addScaledVector(_vh, c.lead / speed);
    return out;
  }
  const restSpot = (c, out) => out.copy(c.home || c.rest).applyMatrix4(root.matrixWorld);   // (wave: its lane's middle)
  // wave: where a stepping foot lands: its rest spot where the body will have carried it, and half a stride on (in its lane)
  function landWave(c, out) {
    out.copy(c.home).applyMatrix4(root.matrixWorld).addScaledVector(c.rv, c.dur * (1 - c.s));
    const v = c.rv.length();
    if (v > 1e-3) out.addScaledVector(c.rv, (0.5 * G.stride * Math.min(1, G.drive / (0.5 * SETTLE_SPEED * span + 1e-6))) / v);
    _vw.copy(out).applyMatrix4(_inv.copy(root.matrixWorld).invert());
    const u = urge ? urge() : 0;
    const z = u ? (u > 0 ? c.zHi - 0.05 : c.zLo + 0.05) : THREE.MathUtils.clamp(_vw.z, c.zLo, c.zHi);
    return z === _vw.z ? out : out.copy(_vw.setZ(z)).applyMatrix4(root.matrixWorld);
  }
  // wave: the rhythm. How fast each rest spot goes (the body's way, and its turn) drives it; the stride grows with the pace to the
  // lanes' length; walking it ripples, running it steps in sets; a leg swings while its place in the rhythm is in its swing
  function waveStep(dt) {
    _vw.setFromMatrixColumn(root.matrixWorld, 2);
    const yaw = Math.atan2(_vw.x, _vw.z);
    const turn = G.yaw === null || dt <= 0 ? 0 : (THREE.MathUtils.euclideanModulo(yaw - G.yaw + Math.PI, Math.PI * 2) - Math.PI) / dt;
    G.yaw = yaw;
    let drive = 0, far = 0;
    for (const c of chains) {
      restSpot(c, _a).sub(_p);
      along(c.rv.set(G.vel.x + turn * _a.z, G.vel.y, G.vel.z - turn * _a.x));
      drive = Math.max(drive, c.rv.length());
      if (!c.stepping) far = Math.max(far, along(_b.subVectors(c.F, _a.copy(c.home).applyMatrix4(root.matrixWorld))).length());
    }
    if (free && free()) { freeStep(dt); return; }
    // (standing: it steps its feet back under it, or on to better holds the caller wants)
    const settle = SETTLE_SPEED * span;
    const settling = drive < 0.5 * settle && (far > 0.3 * strideMax || (strain && chains.some((c) => !c.stepping && strain(c) >= 1)));
    if (settling) drive = settle;
    const run = smooth((drive - WALK_SPANS * span) / ((RUN_SPANS - WALK_SPANS) * span));
    const duty = THREE.MathUtils.lerp(DUTY_RIPPLE, DUTY_SETS, run) - (DUTY_SETS - DUTY_FAST) * THREE.MathUtils.clamp((drive - RUN_SPANS * span) / (4 * RUN_SPANS * span), 0, 1);
    G.stride = THREE.MathUtils.clamp(drive * WAVE_STANCE, 0.35 * strideMax, strideMax);
    G.drive = drive;
    G.run01 = run;
    const f = drive > 0.05 ? (drive * duty) / G.stride : 0;          // (strides a second)
    G.phase = (G.phase + f * dt) % 1;
    const swing = 1 - duty;
    for (const c of chains) {
      const d = THREE.MathUtils.euclideanModulo(c.sets - c.ripple + 0.5, 1) - 0.5;   // (its place, eased from ripple to sets)
      const at = THREE.MathUtils.euclideanModulo(G.phase - (c.ripple + d * run), 1);
      // (a planted foot carried out of its lane, by a turn or a change of pace, steps at once, timed by itself)
      if (!c.stepping && f > 0 && !(at < swing)) {
        const z = _vw.copy(c.F).applyMatrix4(_inv.copy(root.matrixWorld).invert()).z;
        if (z < c.zLo - 0.05 || z > c.zHi + 0.05) {
          const to = footAt(c, landWave(c, _r2), _r3);
          if (settling && to && to.distanceTo(c.F) < 0.5 * SAME_HOLD * c.span && !(strain && strain(c) >= 2)) continue;   // (standing: back where it is, no step)
          Object.assign(c, { stepping: true, own: true, s: 0, dur: Math.max(0.25, Math.min(swing / f, 0.6)), lift: LIFT * c.span * (1 - 0.45 * run) });
          c.S0.copy(c.F);
          (c.S0L ||= new THREE.Vector3()).copy(c.F).applyMatrix4(_inv.copy(root.matrixWorld).invert());
          c.T.copy(to || c.F);
          clear(c, c.T);
          continue;
        }
      }
      if (c.own) { c.s = Math.min(1, c.s + dt / c.dur); if (c.s >= 1) c.own = c.free = false; continue; }
      if (f > 0 && at < swing) {
        if (!c.stepping) {
          if (at > 0.3 * swing) continue;                            // (come into its swing late, as the rhythm changed: next time)
          const to = footAt(c, landWave(c, _r2), _r3);
          // (settling, standing: a foot that would land where it stands stays put, so one on a hold it keeps, a wall's face, never
          // shuffles on it; the others still come back under it)
          if (settling && (!to || to.distanceTo(c.F) < SAME_HOLD * c.span) && !(strain && strain(c) >= 2)) continue;
          Object.assign(c, { stepping: true, s: at / swing, dur: swing / f, lift: LIFT * c.span * (1 - 0.45 * run) });
          c.S0.copy(c.F);
          (c.S0L ||= new THREE.Vector3()).copy(c.F).applyMatrix4(_inv.copy(root.matrixWorld).invert());
          c.T.copy(to || c.F);
          clear(c, c.T);
        }
        c.dur = swing / f;
        c.s = Math.max(c.s, Math.min(1, at / swing));
      } else if (c.stepping) c.s = f > 0 ? 1 : Math.min(1, c.s + dt / 0.35);   // (out of its swing: down; stopped mid-step: finishing it)
    }
  }
  // wave, free: where a step lands: its lane's middle (which goes with its hip), where the body will have carried it
  const landFree = (c, out) => restSpot(c, out).addScaledVector(c.rv, FREE_DUR * (1 - c.s));
  // wave, free: the steps by need. Each leg's neighbours along its side, and its opposite, never step with it
  const nextTo = (a, b) => (Math.sign(a.rest.x) === Math.sign(b.rest.x) ? Math.abs(a.row - b.row) === 1 : a.row === b.row);
  function freeStep(dt) {
    for (const c of chains) if (c.stepping) { c.s = Math.min(1, c.s + dt / c.dur); if (c.s >= 1) c.own = c.free = false; }
    let lifted = chains.filter((c) => c.stepping && c.s < 1).length;
    const want = chains.filter((c) => !c.stepping).map((c) => [c, need(c)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    for (const [c] of want) {
      if (lifted >= FREE_MAX) break;
      if (chains.some((o) => o.stepping && o.s < 1 && nextTo(o, c)) || !canLift(c)) continue;
      const to = footAt(c, landFree(c, _r2), _r3);
      // (nothing to hold, or nothing in its reach: it hangs, and keeps looking)
      if (!to || (need(c) >= 3 && to.distanceTo(c.joints[0].getWorldPosition(_r1)) > c.reach)) { if (need(c) >= 3) c.hang = true; continue; }
      if (to.distanceTo(c.F) < SAME_HOLD * c.span) continue;
      Object.assign(c, { stepping: true, own: true, free: true, hang: false, s: 0, dur: FREE_DUR, lift: LIFT * c.span });
      c.S0.copy(c.F);
      (c.S0L ||= new THREE.Vector3()).copy(c.F).applyMatrix4(_inv.copy(root.matrixWorld).invert());
      c.T.copy(to);
      clear(c, c.T);
      lifted++;
    }
  }
  const along = (v) => v.addScaledVector(_up, -v.dot(_up));          // (its part along the ground)

  function update(dt, ground, gap) {
    groundFn = ground;
    root.updateWorldMatrix(true, false);
    _p.setFromMatrixPosition(root.matrixWorld);
    _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    // how fast the body goes over the ground (measured: callers' speeds are what they ask for, not what they get)
    if (!G.seen || gap || _p.distanceTo(G.prev) > span * 6) { G.planted = false; G.vel.set(0, 0, 0); }
    else if (dt > 0) G.vel.lerp(_a.subVectors(_p, G.prev).divideScalar(dt), 1 - Math.exp(-dt * 10));
    G.seen = true;
    G.prev.copy(_p);
    const speed = along(_vh.copy(G.vel)).length();
    G.run = speed > (G.run ? 0.85 : 1) * vmax;                          // (a little either way, so it doesn't flicker at the edge)
    let want = 0;
    if (ground && !G.run) {
      if (!air) want = 1;
      else {
        ground(_p, _g);
        if (_a.subVectors(_p, _g).dot(_up) < AIR * span) want = 1;
      }
    }
    G.w = want ? Math.min(1, G.w + dt * BLEND) : Math.max(0, G.w - dt * BLEND);
    if (G.w === 0 || !ground) {
      G.planted = false;
      for (const c of chains) pose(c, 0);
      inner.quaternion.identity();
      return;
    }
    // (back on the ground: the feet go down under the body)
    if (!G.planted) {
      for (const c of chains) {
        if (!footAt(c, restSpot(c, _r2), c.F)) c.F.copy(_r2);
        c.stepping = false;
      }
      G.planted = true;
    }
    if (wave) waveStep(dt);
    else {
    // the stride: each leg's lead ahead of its rest spot, and how far behind it it may go (trip) before its set steps
    const moving = speed > 0.1 * thr / durMax;
    const grow = long
      ? THREE.MathUtils.clamp((speed * STANCE * kd) / (thr * (1 + LEAD)), 1, growMax)
      : THREE.MathUtils.clamp((speed * durMin) / (0.8 * thr), 1, growMax);
    // (long: the share of the stride a foot is down, from a walk's to a run's as the stride grows, then less, flat out)
    const duty = speed < vFull
      ? THREE.MathUtils.lerp(DUTY_WALK, DUTY_RUN, (grow - 1) / Math.max(1e-6, growMax - 1))
      : THREE.MathUtils.lerp(DUTY_RUN, DUTY_TOP, THREE.MathUtils.clamp((speed / vFull - 1) / (FLAT_OUT - 1), 0, 1));
    const slow = Math.min(1, speed / (2 * thr * grow));                // (barely moving, it lands on its rest spot, not ahead)
    const back = moving && _vh.dot(_a.setFromMatrixColumn(root.matrixWorld, 2)) < 0;   // (backing up)
    for (const c of chains) {
      const D = c.thr * grow * (1 + LEAD);                             // (how far the body carries a planted foot between steps)
      // (long: landing far enough ahead that it trails no further than SLACK of its room behind, left for waiting on the other set;
      // backing up, ahead is behind it, and the other way round)
      const [ahead, behind] = back ? [c.back, c.fwd] : [c.fwd, c.back];
      const lead = long ? THREE.MathUtils.clamp(LEAD * c.thr * grow, D - SLACK * behind, ahead) : LEAD * c.thr * grow;
      c.trip = D - lead;
      c.lead = lead * slow;
    }
    // which set steps: the one whose feet are furthest behind, once the other set is down (or half way through its step, running at
    // full stride; or at once, if it is stretched past reach)
    // (how far behind its rest spot a foot is, or to the side: one landed far ahead isn't due, unless it is stretched past its stride)
    if (moving) _g.copy(_vh).normalize();
    const due = (c) => {
      const d = along(_a.subVectors(c.F, restSpot(c, _b))), len = d.length(), more = strain ? strain(c) : 0;
      if (!moving) return Math.max(more, len / c.trip);
      const ahead = d.dot(_g);
      return Math.max(more, ahead <= 0 ? len / c.trip : Math.max(d.addScaledVector(_g, -ahead).length() / c.trip, len / (1.25 * Math.max(c.trip, c.lead))));
    };
    for (const group of [0, 1]) {
      if (stepping(group)) continue;
      let worst = 0;
      for (const c of chains) if (c.group === group) worst = Math.max(worst, due(c));
      const other = chains.find((c) => c.group !== group && c.stepping);
      // (long, under half the stride down: it lifts as the other set is that far through its swing, so both are up a moment)
      const overlap = long && moving && other && other.s >= Math.min(1, 0.5 / (1 - duty)) - 0.03;
      if (!(worst > 1 || (!moving && worst > SETTLE)) || (other && worst < 2 && !overlap)) continue;
      const dur = long && moving
        ? THREE.MathUtils.clamp((thr * grow * (1 + LEAD) / speed) * (1 - duty) / duty, durMin, durMax * 1.5)
        : THREE.MathUtils.clamp((0.8 * thr * grow) / Math.max(speed, 1e-3), durFast, durMax);
      // (a longer stride, a higher arc; long, running, a flatter one: the feet skim forward rather than climb)
      const lift = long ? (LIFT * Math.min(Math.sqrt(grow), 1.3)) / (1 + LOW * Math.max(0, speed / vFull - 1)) : LIFT * Math.sqrt(grow);
      let moves = moving;
      for (const c of chains) {
        if (c.group !== group) continue;
        Object.assign(c, { stepping: true, s: 0, dur, lift: lift * c.span });
        c.S0.copy(c.F);
        c.T.copy(c.F);
        if (footAt(c, landing(c, speed, _r2), _r3)) c.T.copy(_r3);
        if (c.T.distanceTo(c.F) > 0.1 * c.thr) moves = true;
        clear(c, landing(c, speed, _r1));
      }
      // (standing, a set whose feet would only land where they are doesn't step: it would never stop, nor let the other set go)
      if (!moves) for (const c of chains) if (c.group === group) c.stepping = false;
    }
    }
    // the feet: planted, or along their arcs: up first onto something higher, over first and then down onto something lower
    for (const c of chains) {
      if (!c.stepping) { c.at.copy(c.F); c.base.copy(c.F); continue; }
      if (!wave) c.s = Math.min(1, c.s + dt / c.dur);
      // (the landing follows the body; past SETTLED it keeps its height, unless the ground under it only rises or falls a little)
      if ((!c.free || c.s < FIX_AT) && footAt(c, wave ? (c.free ? landFree(c, _r2) : landWave(c, _r2)) : landing(c, speed, _r2), _r3)) {
        const jump = _r3.dot(_up) - c.T.dot(_up);
        if (c.s < SETTLED || Math.abs(jump) < 0.15 * c.span || wave) c.T.copy(_r3);   // (wave: always where it will stand, up or down)
        else c.T.copy(_r3).addScaledVector(_up, -jump);
      }
      const hS = c.S0.dot(_up), hT = c.T.dot(_up), rise = hT - hS, step = 0.1 * c.span;
      const eh = smooth((c.s - 0.1) / 0.8);
      const ev = rise > step ? smooth(c.s / 0.5) : rise < -step ? smooth((c.s - 0.5) / 0.5) : eh;
      if (c.S0L) {                                                   // (wave: carried with the body, so it only goes forward in its lane)
        _inv.copy(root.matrixWorld).invert();
        c.base.lerpVectors(c.S0L, _vw.copy(c.T).applyMatrix4(_inv), smooth(c.s)).applyMatrix4(root.matrixWorld);
      } else c.base.lerpVectors(c.S0, c.T, eh);
      c.base.addScaledVector(_up, hS + rise * ev - c.base.dot(_up));
      const arc = Math.sin(Math.PI * c.s);
      c.at.copy(c.base).addScaledVector(liftDir ? liftDir(c, _ld) : _up, c.over ? Math.max(c.lift * arc, c.over * Math.min(1, arc * 2.5)) : c.lift * arc);
      if (c.s >= 1) { c.F.copy(c.T); c.stepping = false; }
    }
    // the body on its feet: their mean height off their rest spots lifts it, their slope across and along it rolls and pitches it
    if (bodyPose) bodyPose(dt);
    else {
    _inv.copy(root.matrixWorld).invert();
    let h = 0, sx = 0, sz = 0, sxx = 0, szz = 0, mx = 0, mz = 0;
    for (const c of chains) { mx += c.rest.x; mz += c.rest.z; }
    mx /= chains.length; mz /= chains.length;
    for (const c of chains) h += _a.copy(c.base).applyMatrix4(_inv).y - c.rest.y;
    h /= chains.length;
    for (const c of chains) {
      const d = _a.copy(c.base).applyMatrix4(_inv).y - c.rest.y - h, x = c.rest.x - mx, z = c.rest.z - mz;
      sx += x * d; sz += z * d; sxx += x * x; szz += z * z;
    }
    G.h = h;
    const k = Math.min(1, dt * followRate);                           // (leaving the ground, it eases back level)
    const target = body ? body(h) : THREE.MathUtils.clamp(h, -follow * hipY, follow * hipY);
    G.lift += (want ? target - G.lift : -G.lift) * k;
    G.pitch += (want ? THREE.MathUtils.clamp(-Math.atan(szz > 1e-6 ? sz / szz : 0), -pitchMax, pitchMax) - G.pitch : -G.pitch) * k;
    G.roll += (want ? THREE.MathUtils.clamp(Math.atan(sxx > 1e-6 ? sx / sxx : 0), -rollMax, rollMax) - G.roll : -G.roll) * k;
    inner.position.y += (G.lift - inner.position.y) * G.w;
    inner.quaternion.setFromEuler(_e.set(G.pitch * G.w, 0, G.roll * G.w));
    }
    // the legs reach their feet
    let space = null;
    for (const c of chains) {
      if (c.space !== space) { space = c.space; space.updateWorldMatrix(true, false); _m.copy(space.matrixWorld).invert(); }
      _t.copy(c.at).applyMatrix4(_m);
      if (c.bend && solid) {                                         // (the nearest turn that keeps it out of things, eased to)
        const T = _vt.copy(_t);
        let want = c.swivel;                                           // (straight back when it can; else as it is, if that is clear)
        solveBent(c, T, 0);
        if (inside(c)) {
          solveBent(c, T, c.swivel);
          if (inside(c)) for (const sw of SWIVELS) { solveBent(c, T, sw); if (!inside(c)) { want = sw; break; } }
        } else want = 0;
        c.swivel += THREE.MathUtils.clamp(want - c.swivel, -SWIVEL_RATE * dt, SWIVEL_RATE * dt);
        _t.copy(T);
      }
      solve(c, _t);
      pose(c, G.w);
    }
  }

  // (pole, solid: is any of the leg's joints or bones, as just solved, inside something)
  function inside(c) {
    const p = c.work, w = c.space.matrixWorld;
    for (let i = 1; i < p.length; i++) {
      if (i < p.length - 1 && solid(_vs.copy(p[i]).applyMatrix4(w))) return true;
      for (const k of [0.25, 0.5, 0.75]) if (solid(_vs.lerpVectors(p[i - 1], p[i], k).applyMatrix4(w))) return true;
    }
    return false;
  }

  return { update, chains, vmax, growMax, vFull, strideMax, get stride() { return G.stride; }, get drive() { return G.drive; }, get weight() { return G.w; }, get lift() { return G.lift; }, get pitch() { return G.pitch * G.w; }, get roll() { return G.roll * G.w; } };
}

// the frame of a bone along d, across it toward the leg's plane normal n (columns: along, across, their cross)
function frameOf(d, n, out) {
  _x.copy(d);
  _y.copy(n).addScaledVector(d, -n.dot(d)).normalize();
  _z.crossVectors(_x, _y);
  return out.makeBasis(_x, _y, _z);
}

// a two- or three-bone leg's rest shape, for the exact solve: its hip-to-foot line, the knee's side of it (the pole), and the ankle's
// angle and side (all in the legs part's frame, y up)
function bendOf(pts) {
  const n = pts.length - 1, ax = new THREE.Vector3().subVectors(pts[n], pts[0]), d0 = ax.length();
  ax.divideScalar(d0);
  const k = new THREE.Vector3().subVectors(pts[1], pts[0]);
  const pole = k.addScaledVector(ax, -k.dot(ax)).normalize();
  const B = { pole, h0: Math.atan2(ax.x, ax.z), d0, theta: Math.PI, side: 1 };
  if (n === 3) {
    _a.subVectors(pts[1], pts[2]).normalize(); _b.subVectors(pts[3], pts[2]).normalize();
    B.theta = Math.acos(THREE.MathUtils.clamp(_a.dot(_b), -1, 1));
    const kf = _d.subVectors(pts[3], pts[1]).normalize(), e = _x.copy(pole).addScaledVector(kf, -pole.dot(kf)).normalize();
    B.side = Math.sign(_y.subVectors(pts[2], pts[1]).dot(e)) || 1;
  }
  return B;
}

// the joints of a bent leg reaching t, exactly: in the upright plane through its hip and t (turned from the rest one about up, and by
// swivel about the hip-to-t line), the knee on its pole's side, the ankle's angle folding as t comes in; returns the plane's normal (as
// the rest one's sign)
function solveBent(c, t, swivel = c.swivel) {
  const p = c.work, B = c.bend, n = p.length - 1, L0 = c.len[0], L1 = c.len[1];
  p[0].copy(c.pts[0]);
  const a = _a.subVectors(t, p[0]), d = a.length();
  a.divideScalar(Math.max(d, 1e-6));
  const b = _b.copy(B.pole).applyAxisAngle(_Y, Math.atan2(a.x, a.z) - B.h0);
  b.addScaledVector(a, -b.dot(a));
  if (b.lengthSq() < 1e-8) b.set(0, 1, 0).addScaledVector(a, -a.y);
  b.normalize();
  if (swivel) b.applyAxisAngle(a, swivel);
  let Lv = L1, th = 0;
  if (n === 3) {
    const L2 = c.len[2];
    th = Math.min(Math.PI - 0.02, B.theta * THREE.MathUtils.clamp(FOLD + (1 - FOLD) * d / B.d0, FOLD, 1.15));
    Lv = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(th));
  }
  let dd = THREE.MathUtils.clamp(d, Math.abs(L0 - Lv) + 1e-4, L0 + Lv - 1e-4);
  let A = Math.acos(THREE.MathUtils.clamp((L0 * L0 + dd * dd - Lv * Lv) / (2 * L0 * dd), -1, 1));
  // (the thigh no steeper than FEMUR_UP over the level, out from the hip: a foot drawn in close, the ankle folds further instead, so
  // the knee stays up and out over its foot, never back over the body)
  if (n === 3) {
    const Amax = FEMUR_UP - Math.atan2(a.y, Math.hypot(a.x, a.z));
    if (A > Amax && Amax > 0.05) {
      const L2 = c.len[2];
      Lv = Math.sqrt(Math.max(1e-6, L0 * L0 + dd * dd - 2 * L0 * dd * Math.cos(Amax)));
      Lv = THREE.MathUtils.clamp(Lv, Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.05);
      th = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - Lv * Lv) / (2 * L1 * L2), -1, 1));
      dd = THREE.MathUtils.clamp(d, Math.abs(L0 - Lv) + 1e-4, L0 + Lv - 1e-4);
      A = Math.acos(THREE.MathUtils.clamp((L0 * L0 + dd * dd - Lv * Lv) / (2 * L0 * dd), -1, 1));
    }
  }
  p[1].copy(p[0]).addScaledVector(a, L0 * Math.cos(A)).addScaledVector(b, L0 * Math.sin(A));
  const end = _t.copy(p[0]).addScaledVector(a, dd);
  if (n === 3) {
    const L2 = c.len[2], kf = _d.subVectors(end, p[1]).normalize(), e = _x.copy(b).addScaledVector(kf, -b.dot(kf));
    if (e.lengthSq() < 1e-8) e.crossVectors(kf, a).cross(kf);                            // (the shin along the pole: any way across)
    e.normalize();
    const Bk = Math.acos(THREE.MathUtils.clamp((L1 * L1 + Lv * Lv - L2 * L2) / (2 * L1 * Lv), -1, 1));
    p[2].copy(p[1]).addScaledVector(kf, L1 * Math.cos(Bk)).addScaledVector(e, B.side * L1 * Math.sin(Bk));
    p[3].copy(end);
  } else p[2].copy(end);
  return _n.crossVectors(b, a).normalize();
}

// FABRIK from the rest pose to target t (in the legs part's frame), or the exact solve; then each bone turned from its rest frame to its
// new one
function solve(c, t) {
  const p = c.work, n = p.length - 1;
  let plane, flat;
  if (c.bend) { plane = solveBent(c, t); flat = false; }
  else {
    for (let i = 0; i <= n; i++) p[i].copy(c.pts[i]);
    for (let it = 0; it < ITER; it++) {
      p[n].copy(t);
      for (let i = n - 1; i >= 0; i--) p[i].sub(p[i + 1]).normalize().multiplyScalar(c.len[i]).add(p[i + 1]);
      p[0].copy(c.pts[0]);
      for (let i = 0; i < n; i++) p[i + 1].sub(p[i]).normalize().multiplyScalar(c.len[i]).add(p[i]);
      if (p[n].distanceToSquared(t) < 1e-8) break;
    }
    plane = _n.crossVectors(_a.subVectors(p[1], p[0]), _b.subVectors(p[n], p[0]));
    flat = !c.nRest || plane.lengthSq() < 1e-10;
    if (!flat) plane.normalize();
  }
  for (let i = 0; i < n; i++) {
    const d = _d.subVectors(p[i + 1], p[i]).normalize();
    const q = c.turned[i];                                           // (the bone's new orientation in the part's frame)
    if (flat) q.setFromUnitVectors(c.dir[i], d);
    else q.setFromRotationMatrix(frameOf(d, plane, _r).multiply(c.basis[i]));
    q.multiply(c.W[i]);
    if (i) c.ik[i].copy(c.turned[i - 1]).invert().multiply(q);
    else c.ik[i].copy(q);
  }
}

// the joints between the plain swing (w = 0: the hip turned by L.swing about x, the knees as built) and the IK's pose (w = 1)
function pose(c, w) {
  c.joints.forEach((j, i) => {
    j.quaternion.copy(c.bind[i]);
    if (i === 0) j.quaternion.multiply(_q.setFromAxisAngle(_X, c.L.swing || 0));
    if (w > 0) j.quaternion.slerp(c.ik[i], w);
  });
}
