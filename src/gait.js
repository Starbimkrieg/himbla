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
//   foothold(c, p, out, ground)   where foot c may stand near p (null: nowhere); the tank's keeps to what the leg can reach
//   strain(c)   how badly planted foot c wants to step, besides its stride (past 1 it is due; past 2 it goes even while the other set
//               is stepping): the tank's, when a leg nears its full stretch or something comes between its hip and its foot
//   long        true: each leg strides as far as it can reach ahead and behind (not only as far as the tightest leg), and the steps
//               are timed by a duty factor (the share of a stride a foot is down, DUTY_WALK to DUTY_TOP): from a walk to a run each
//               foot's swing grows as long as its stance, then a little longer (a moment with no foot down: the tank's jets carry it)
//   pole        true: two- and three-bone legs are solved exactly with the knee bent up (as built), the ankle folding with the
//               reach, so a leg never flips between shapes from one frame to the next (FABRIK can, with three bones)
//   solid(p)    (with pole) true where world point p is inside something: a knee or ankle that would be turns about its hip-to-foot line
//               (forward, back, further) to the nearest way that is clear, and eases there

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
const FOLD = 0.55;      // pole: the ankle's bend at the shortest reach (of its rest angle; straighter out to 1.15 of it)

const _p = new THREE.Vector3(), _up = new THREE.Vector3(), _g = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _vh = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _e = new THREE.Euler(), _X = new THREE.Vector3(1, 0, 0);
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Matrix4(), _Y = new THREE.Vector3(0, 1, 0);
const _vt = new THREE.Vector3(), _vs = new THREE.Vector3();
const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3();
const smooth = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };

export function makeGait(root, inner, legs, { lift: follow = 0.4, air = true, body = null, followRate = FOLLOW, foothold = null, strain = null, solid = null, long = false, pole = false } = {}) {
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
  const G = { w: 0, run: false, planted: false, seen: false, prev: new THREE.Vector3(), vel: new THREE.Vector3(), lift: 0, pitch: 0, roll: 0, h: 0 };
  let groundFn = null;
  const footAt = foothold ? (c, p, out) => foothold(c, p, out, groundFn) : (c, p, out) => groundFn(p, out);

  const stepping = (group) => chains.some((c) => c.group === group && c.stepping);
  // what stands between a foot and where it will land (a crate, a wall top, a hump): the step goes over it, high early and late
  function clear(c, dur, lead) {
    restSpot(c, _r1).addScaledVector(_vh, dur);
    const v = _vh.length();
    if (v > 1e-3) _r1.addScaledVector(_vh, lead / v);
    let top = 0;
    for (let k = 1; k <= 4; k++) {
      _r2.lerpVectors(c.F, _r1, k / 5);
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
  const restSpot = (c, out) => out.copy(c.rest).applyMatrix4(root.matrixWorld);
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
    for (const c of chains) {
      const D = c.thr * grow * (1 + LEAD);                             // (how far the body carries a planted foot between steps)
      // (long: landing far enough ahead that it trails no further than SLACK of its room behind, left for waiting on the other set)
      const lead = long ? THREE.MathUtils.clamp(LEAD * c.thr * grow, D - SLACK * c.back, c.fwd) : LEAD * c.thr * grow;
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
      for (const c of chains) {
        if (c.group !== group) continue;
        Object.assign(c, { stepping: true, s: 0, dur, lift: lift * c.span });
        c.S0.copy(c.F);
        c.T.copy(c.F);
        if (footAt(c, landing(c, speed, _r2), _r3)) c.T.copy(_r3);
        clear(c, dur, c.lead);
      }
    }
    // the feet: planted, or along their arcs: up first onto something higher, over first and then down onto something lower
    for (const c of chains) {
      if (!c.stepping) { c.at.copy(c.F); c.base.copy(c.F); continue; }
      c.s = Math.min(1, c.s + dt / c.dur);
      // (the landing follows the body; past SETTLED it keeps its height, unless the ground under it only rises or falls a little)
      if (footAt(c, landing(c, speed, _r2), _r3)) {
        const jump = _r3.dot(_up) - c.T.dot(_up);
        if (c.s < SETTLED || Math.abs(jump) < 0.15 * c.span) c.T.copy(_r3);
        else c.T.copy(_r3).addScaledVector(_up, -jump);
      }
      const hS = c.S0.dot(_up), hT = c.T.dot(_up), rise = hT - hS, step = 0.1 * c.span;
      const eh = smooth((c.s - 0.1) / 0.8);
      const ev = rise > step ? smooth(c.s / 0.5) : rise < -step ? smooth((c.s - 0.5) / 0.5) : eh;
      c.base.lerpVectors(c.S0, c.T, eh).addScaledVector(_up, hS + rise * ev - c.base.dot(_up));
      const arc = Math.sin(Math.PI * c.s);
      c.at.copy(c.base).addScaledVector(_up, c.over ? Math.max(c.lift * arc, c.over * Math.min(1, arc * 2.5)) : c.lift * arc);
      if (c.s >= 1) { c.F.copy(c.T); c.stepping = false; }
    }
    // the body on its feet: their mean height off their rest spots lifts it, their slope across and along it rolls and pitches it
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
    G.pitch += (want ? THREE.MathUtils.clamp(-Math.atan(szz > 1e-6 ? sz / szz : 0), -TILT, TILT) - G.pitch : -G.pitch) * k;
    G.roll += (want ? THREE.MathUtils.clamp(Math.atan(sxx > 1e-6 ? sx / sxx : 0), -TILT, TILT) - G.roll : -G.roll) * k;
    inner.position.y += (G.lift - inner.position.y) * G.w;
    inner.quaternion.setFromEuler(_e.set(G.pitch * G.w, 0, G.roll * G.w));
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

  return { update, chains, vmax, growMax, vFull, get weight() { return G.w; }, get lift() { return G.lift; } };
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
  let Lv = L1;
  if (n === 3) {
    const L2 = c.len[2], th = Math.min(Math.PI - 0.02, B.theta * THREE.MathUtils.clamp(FOLD + (1 - FOLD) * d / B.d0, FOLD, 1.15));
    Lv = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(th));
  }
  const dd = THREE.MathUtils.clamp(d, Math.abs(L0 - Lv) + 1e-4, L0 + Lv - 1e-4);
  const A = Math.acos(THREE.MathUtils.clamp((L0 * L0 + dd * dd - Lv * Lv) / (2 * L0 * dd), -1, 1));
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
