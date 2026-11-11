import * as THREE from 'three';
import { legChain, solveLeg, solveBent, poseLeg } from './gait.js';

// The spider tank's legs and the hull on them (src/spidertank.js; docs/spidertank/). Any way it goes: ahead, back, sideways, turning.
//
// The hull stands on its feet. Each leg has a home: its rest stance, carried with the hull and dropped onto whatever is under it. The
// pose the hull wants is the one that puts every home nearest its foot's hold (fitPose: its height, pitch and roll, so feet up on a
// block and feet down on the ground tilt and raise it between them), raised to clear what is under it and just ahead; and it may only
// go as far toward that as its planted legs reach (constrain: no planted leg past its length, nor folded closer than it folds), so a
// planted foot never leaves its hold. A leg is always planted, stepping (a timed arc to a hold it chose at lift-off), or, with nothing
// in reach to stand on, reaching for where it would (probing, and it steps the moment a hold comes in reach).
//
// On easy ground the legs step to one rhythm (a ripple at a walk, two sets of four at a run), each foot in its own lane of the hull so
// the legs never cross. On rough ground (tilted, feet at different heights, held up against something) they step by need instead:
// the leg that holds the hull back the most goes first (needOf), never two neighbours at once.
//
// Climbing. Pushed at something and held up, the tank's urge grows: its feet look further on, the legs whose homes come over the
// thing step up onto its top if they reach it, and the hull wants to follow. A leg that can't reach the top may take a hold up the
// face instead, but only a reaching leg: four others must still stand on tops (the ground, or the thing's top), so the legs that
// carry it from below never stand on a wall. With its front legs over the edge the hull is pulled up between them and its rear legs
// straighten together under it, as far as they go; with four feet on top the rest let go and come up the face after it. Against a
// wall too tall the same thing happens short of the top: it rears up on its rear legs, its front legs pawing up the face, then
// gives up and comes down (STALL).
//
// makeSpiderWalk(root, inner, legs, hipY) -> walk: { chains, pose, update(dt, { ground, ray, push }), freeze(), hits(x, y, z, yaw),
// climbing, speedMax, shove, rough }. shove is a velocity (world) the walk asks the driver for, besides what is pushed: backing off
// what it gave up at, so its hull can come down level. The caller places root before update (the hull keeps its own height in the world); ground(p, out[,
// ceil]) puts the top under world point p in out (with ceil: null where p is inside something taller); ray(from, dir, far, out) the
// first thing along a line; push is the velocity the driver asks for, in the world.

const ABOVE = 3;                // m a foot may stand above its hip at most, reaching up over an edge
const PITCH_MAX = 1.35, ROLL_MAX = 0.6;   // rad the hull tilts at most
const TILT_OFF = 0.45;           // rad its planted legs may tilt the hull away from the pose it wants
const AXIAL = 0.64, SIDE_PITCH = 0.3;   // of its push, the share along its length under which it is going sideways; rad it pitches at most then
const LIFT_RATE = 5, TILT_RATE = 1.6;     // m/s and rad/s the hull's pose changes at most
const CLEAR_HULL = 1.65;        // m its hips keep over the highest thing under the hull (its bottom 1.24 under them, and a margin)
const RIDE = 2.2;               // m the hull rises over where its feet would have it, at most, to clear what is under it
const LOOK_S = 0.5, LOOK_MIN = 1.2, LOOK_MAX = 6;   // s of its speed (and m) ahead it looks for what to rise over
const LEVER = 0.7;              // m in from an edge on its hip's side a foot must stand on a top
const NEAR = 0.33;              // of a leg's reach, the closest to its hip a foot stands
const HOLD_R = 0.9;             // of a leg's reach, the furthest a hold may be when it is chosen (stretch in hand)
const R_MAX = 0.985;            // of a leg's reach, the furthest a planted foot may be: the hull goes no further
const LOOSE = 1.03;             // of a leg's reach, past which a planted foot lets go at once (the caller moved the root on)
const SIDE = 0.8;               // m out from the hull's middle a foot keeps, on its own side
const X_ROOM = 1.6, X_IN = 2.3; // m either way across the hull a foot may stand from its home; and in toward the hull, held up at something narrower than its stance
const LANE_REACH = 0.78, GAP = 0.3;   // of the front leg's room ahead and the back leg's behind, how far the lanes reach; m between lanes
const SETTLE_SPEED = 1.1, SETTLE_FAR = 0.9;   // m/s it steps at to bring its feet home, standing; m from home a foot must be for that
const WALK = 3.8, RUN = 9.1;    // m/s under which it ripples, and past which it runs in two sets
const STANCE = 0.75;            // s a foot stays down, walking, as long as its lane allows
const LIFT = 1.3;               // m a step arcs up
const OVER_EDGE = 0.4;          // m the most a step up or down arcs over what is between
const FOOT_SPEED = 9, STEP_MIN = 0.3, STEP_MAX = 0.9;   // rough: m/s a stepping foot goes, s a step takes at least and at most
const SAME_HOLD = 0.45;         // m: a hold nearer than this to where a foot stands is the same one (no step)
const NEED_STRETCH = 0.86;      // of its reach, past which a planted leg wants to step
const LET_GO = 1;                // s a leg holds the hull back with nowhere better to stand before it lets go and reaches
const COOL = 0.35;              // s a leg that looked and found nothing better waits before it looks again
const ROUGH_MAX = 2;            // rough: legs stepping at once at most (more only when they have let go)
const KEEP_DOWN = 4;            // feet that stay down whatever
const URGE_MAX = 6, URGE_UP = 2.5, URGE_DOWN = 8;   // m further on its feet look, held up; m/s it grows and goes
const ANT = 0.5;                // held up: how far toward what is ahead of a foot the hull counts its hold (it leans into the climb)
const UP_BONUS = 0.8;           // held up: a hold counts this much more a metre higher
const SLACK_COST = 1.5;          // a hold counts this much less a metre past 0.8 of its leg's reach from its hip in the pose the hull wants
const POSE_T = 0.4;             // s the hull takes, about, to reach the pose it wants (for where a hip will be when a step lands)
const CLIMB_SPEED = 4, CREEP = 1.2;   // m/s the most it goes on rough ground, and while its legs hold the hull back
const BRAKE = 10, BRAKE_AT = [1, 2.5, 4.5], TOUCH = 0.6, GRAZE = 0.002;   // braking for what its hull would meet (m/s/s, m ahead, m/s, m)
const BACK_OFF = 6, BACK_SPEED = 1.5;   // m it backs off what it gave up at, at most, and m/s
const STALL = 4;                // s held up without its hull rising or getting on, after which it gives up and comes down
const OVERHANG = 3;              // m its middle may go out past an edge over a drop, its hull still up at the top
const HANG_SPEED = 6;           // m/s a reaching foot moves
const SWIVELS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2];   // rad a leg may turn about its hip-to-foot line, clear of things
const SWIVEL_RATE = 9;
// the spots a foot looks at round where it would land (m toward its hip, m across)
const AROUND = [[0, 0], [0.7, 0], [0, 0.7], [0, -0.7], [-0.7, 0], [1.4, 0], [1, 1], [1, -1], [0, 1.4], [0, -1.4], [-1.4, 0], [-1, 1], [-1, -1],
  [2.1, 0], [2.8, 0], [3.5, 0], [2.1, 1.2], [2.1, -1.2]];
const FACE_PITCH = [0.6, 0.2, -0.2, -0.7, -1.1];   // rad over the level a leg feels for a face
// how much of the way to the pose it wants it tries to go each frame (height, pitch, roll); the first that takes the hull no deeper wins
const TRIES = [[1, 1, 1], [0.6, 0.6, 0.6], [0.3, 0.3, 0.3], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.4, 0, 0], [0, 0.4, 0], [0, 0, 0.4]];

// the hull as points in its own frame (the bead's bottom and rings up its side, the cannon): it is clear when none is inside anything
export const HULL3 = [new THREE.Vector3(0, 1.86, -0.1), new THREE.Vector3(0, 2.8, 4), new THREE.Vector3(0, 2.8, 5)];
for (const t of [-0.97, -0.85, -0.7, -0.55, -0.35, 0]) {
  const r = Math.sqrt(1 - t * t), m = r > 0.6 ? 16 : 8;
  for (let k = 0; k < m; k++) HULL3.push(new THREE.Vector3(2.25 * r * Math.cos(k * 2 * Math.PI / m), 3.24 + 1.38 * t, -0.09 + 3.5 * r * Math.sin(k * 2 * Math.PI / m)));
}
// and the room its legs need beside it, out from its hips: counted with the hull, so it never stands flank-on against a wall with its
// legs crushed between
const FLANK = [];
for (const x of [-3.6, 3.6]) for (const z of [-1.6, 0, 1.6]) FLANK.push(new THREE.Vector3(x, 3.3, z));
const SOLID = [...HULL3, ...FLANK];
// its outline over the ground (x across, z ahead)
export const HULL = [[0, 4.8]];
for (const x of [-2.1, -1.05, 0, 1.05, 2.1]) for (const z of [-3.4, -1.7, 0, 1.7, 3.3]) if ((x / 2.3) ** 2 + (z / 3.6) ** 2 <= 1.05) HULL.push([x, z]);

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _g = V(), _h = V(), _k1 = V(), _k2 = V(), _k3 = V(), _w = V(), _s = V();
const _vt = V(), _vs = V(), _t = V(), _hold = V(), _best = V(), _cand = V(), _q0 = V(), _toHip = V(), _across = V(), _flat = V(), _hw = V(), _hp = V();
const _m = new THREE.Matrix4(), _mr = new THREE.Matrix4(), _qy = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _pp = V();
const smooth = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
// in the hull's own frame, is v inside its shell
const shell = (v) => (v.x / 2.1) ** 2 + ((v.y - 3.24) / 1.3) ** 2 + ((v.z + 0.09) / 3.3) ** 2 < 1;

export function makeSpiderWalk(root, inner, legs, hipY) {
  root.updateMatrixWorld(true);
  const chains = [];
  {
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    for (const L of legs) { const c = legChain(L, rootInv, true); if (c) chains.push(c); }
  }
  // each side's legs front to back: their lanes along the hull, their homes (their lanes' middles), their places in the rhythm
  let strideMax = Infinity;
  for (const side of [-1, 1]) {
    const row = chains.filter((c) => Math.sign(c.rest.x) === side).sort((a, b) => b.rest.z - a.rest.z);
    const top = row[0].rest.z + LANE_REACH * row[0].fwd, end = row[row.length - 1].rest.z - LANE_REACH * row[row.length - 1].back;
    const lane = (top - end) / row.length;
    row.forEach((c, r) => {
      c.side = side; c.row = r;
      c.ripple = ((row.length - 1 - r) / row.length + (side > 0 ? 0.5 : 0)) % 1;
      c.sets = ((r + (side > 0 ? 1 : 0)) % 2) * 0.5;
      c.zHi = top - r * lane - (r ? GAP / 2 : 0);
      c.zLo = top - (r + 1) * lane + (r < row.length - 1 ? GAP / 2 : 0);
      c.home = new THREE.Vector3(c.rest.x, c.rest.y, (c.zHi + c.zLo) / 2);   // (in the hull's frame)
      strideMax = Math.min(strideMax, c.zHi - c.zLo);
      c.foot = c.joints[c.joints.length - 1].children.find((o) => o.userData.role === 'foot');
      // (the furthest its solve reaches a foot, exactly: a planted foot is never asked further)
      c.ikMax = c.len[0] + c.len[1] + c.len[2] - 0.05;
      Object.assign(c, { state: 'plant', face: false, short: false, cool: 0, press: 0, tries: 0, paw: 0, yAhead: 0, over: false, faceT: false, shortT: false, track: false, held: false,
        strand: 0, failAt: -1, reachAt: 0, S0L: V(), rv: V(), homeW: V(), P: V(), want: V(), liftS: V(), liftT: V() });
    });
  }
  const neighbours = (a, b) => a.side === b.side && Math.abs(a.row - b.row) === 1;
  const mirror = (a, b) => a.side !== b.side && a.row === b.row;
  const PIVOT = new THREE.Vector3(0, hipY, 0);
  // the hull's pose: its hips' height H over the root (W: in the world), pitch P and roll R; tH, tP, tR: the pose it wants
  const body = { H: hipY, W: hipY, P: 0, R: 0, set: false, tH: hipY, fH: hipY, tP: 0, tR: 0, tW: hipY };
  const M = new THREE.Matrix4(), Minv = new THREE.Matrix4(), hullInv = new THREE.Matrix4();
  const up = V(), rootPos = V(), prev = V(), vel = V(), push = V(), pushDir = V(), fwd = V();
  let ground = null, ray = null, seen = false, spin = 0, yaw0 = 0, pushing = false, urge = 0, blocked = false, phase = 0, frozen = true, gaveUp = false;
  const gaveAt = V(), gaveDir = V(), gotDir = V();
  let gotBest = 0, gotAt = 0;
  let rough = false, pressMax = 0, t = 0, lowStand = 0, drive = 0;                   // (drive: m/s the fastest of its homes goes over the ground)

  // ---- the hull's pose ----
  const tiltTo = (P, R) => _pq.setFromEuler(_pe.set(P, 0, R));
  // (after tiltTo) a hull-frame point, in the root's frame, with its hips H over the root
  const inRoot = (v, H, out) => { out.copy(v).sub(PIVOT).applyQuaternion(_pq); out.y += H; return out; };
  const hipW = (c, out) => c.joints[0].getWorldPosition(out);
  function setInner(H, P, R) {
    tiltTo(P, R);
    inner.position.set(0, H, 0).sub(_pp.copy(PIVOT).applyQuaternion(_pq));
    inner.quaternion.copy(_pq);
    inner.updateWorldMatrix(true, true);
    hullInv.copy(inner.matrixWorld).invert();
  }
  // how far the hull, posed (H, and tiltTo), is into things with the root placed by matrix Mx: its points' depths under the tops over
  // them, summed
  function hullDepth(Mx, H) {
    let deep = 0;
    for (const v of SOLID) {
      inRoot(v, H, _w).applyMatrix4(Mx);
      if (ground(_w, _c)) deep += Math.max(0, _c.dot(up) - _w.dot(up));
    }
    return deep;
  }
  // the pose that puts each leg's home nearest its hold (planted, or where it is stepping to; held up, part way to what is ahead of
  // it): a few Gauss-Newton steps on height, pitch and roll from the pose it wanted last frame
  const _A = new THREE.Matrix3(), _J = [V(), V(), V()], _ax = V(), _X = new THREE.Vector3(1, 0, 0), _r = V(), _rho = V();
  function fitPose() {
    let H = body.fH, P = body.tP, R = body.tR;                         // (fH: the height its feet would have it at, before it rises to clear things)
    const ant = ANT * smooth(urge / 2);
    for (let it = 0; it < 2; it++) {
      tiltTo(P, R);
      _ax.set(0, -Math.sin(P), Math.cos(P));
      const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], g = [0, 0, 0];
      let n = 0;
      for (const c of chains) {
        if (c.state === 'reach') continue;
        const hold = _a.copy(c.stepping ? c.T : c.F).applyMatrix4(Minv);
        if (ant > 0) hold.y += ant * clamp(c.yAhead - hold.y, -2 * ABOVE, 2 * ABOVE);   // (up at a wall; down over an edge)
        // (a foot gone over an edge onto the face below it, the ground further down: the hull follows it down)
        else if ((c.stepping ? c.faceT : c.face) && c.yAhead < hold.y - 1) hold.y += ANT * Math.max(c.yAhead - hold.y, -2 * ABOVE);
        _rho.copy(c.home).sub(PIVOT).applyQuaternion(_pq);
        _r.copy(_rho); _r.y += H; _r.sub(hold);
        _r.x *= 0.5; _r.z *= 0.5;                                      // (its feet wander in their lanes: their heights count most)
        _J[0].set(0, 1, 0);
        _J[1].crossVectors(_X, _rho); _J[1].x *= 0.5; _J[1].z *= 0.5;
        _J[2].crossVectors(_ax, _rho); _J[2].x *= 0.5; _J[2].z *= 0.5;
        for (let i = 0; i < 3; i++) { g[i] += _J[i].dot(_r); for (let j = 0; j < 3; j++) A[i * 3 + j] += _J[i].dot(_J[j]); }
        n++;
      }
      if (n < 3) break;
      A[4] += 2; A[8] += 2;                                            // (damped: few feet, or feet in a line, tilt it little)
      _A.set(...A).invert();
      const e = _A.elements;                                           // (column-major)
      H -= 0.7 * (e[0] * g[0] + e[3] * g[1] + e[6] * g[2]);
      P -= 0.7 * (e[1] * g[0] + e[4] * g[1] + e[7] * g[2]);
      R -= 0.7 * (e[2] * g[0] + e[5] * g[1] + e[8] * g[2]);
      // (pushed sideways at something, it leans over toward it and no more: it rears up only nose or tail first)
      const pMax = pushing && urge > 0 && Math.abs(pushDir.dot(fwd)) < AXIAL ? SIDE_PITCH : PITCH_MAX;
      P = clamp(P, -pMax, pMax); R = clamp(R, -ROLL_MAX, ROLL_MAX);
    }
    // (and its hips CLEAR_HULL over the highest thing under its outline, here and where it will be shortly; no more than RIDE over
    // where its feet would have it: past that, its legs take it up)
    tiltTo(P, R);
    const look = pushing ? clamp(vel.length() * LOOK_S + Math.min(urge, 2.5), LOOK_MIN, LOOK_MAX) : 0;
    let need = -Infinity;
    for (const f of look ? [0, 0.5, 1] : [0]) {
      for (const [x, z] of HULL) {
        _a.set(x, hipY, z).sub(PIVOT).applyQuaternion(_pq);
        const lift = _a.y;
        _a.y = 0;
        _a.applyMatrix4(M).addScaledVector(pushDir, f * look);
        if (ground(_a, _b)) need = Math.max(need, _b.sub(rootPos).dot(up) + CLEAR_HULL - lift);
      }
    }
    body.fH = H;
    if (need > H) H = Math.min(need, H + RIDE);
    body.tH = H; body.tP = P; body.tR = R;
  }
  // a pose (o.H, o.P, o.R) brought within its planted legs' reach: none further from its hip than it reaches, nor nearer than it
  // folds, nor its foot more than ABOVE over its hip; each is corrected in turn, a few times round. press: each leg's share is
  // kept (c.press, m): how hard it holds the hull back from that pose
  const _o = { H: 0, P: 0, R: 0 };
  function constrain(o, press, shift = null) {
    for (let it = 0; it < 8; it++) {
      let any = false;
      for (const c of chains) {
        if (c.state !== 'plant' || c.stepping) continue;
        tiltTo(o.P, o.R);
        const f = _a.copy(c.F);
        if (shift) f.sub(shift);                                         // (the root that much further on)
        f.applyMatrix4(Minv);
        const h = inRoot(c.hip, o.H, _b), rho = _c.copy(h); rho.y -= o.H;
        const over = f.y - h.y - ABOVE;
        if (over > 0) { o.H += over; if (press) c.press += over; any = true; continue; }
        const v = _d.subVectors(h, f), d = v.length();
        const e = d > c.rMax ? d - c.rMax : d < c.rMin ? d - c.rMin : 0;
        if (!e) continue;
        v.divideScalar(d);
        const gH = v.y, gP = v.dot(_e.crossVectors(_X, rho)), gR = v.dot(_e.crossVectors(_ax.set(0, -Math.sin(o.P), Math.cos(o.P)), rho));
        const den = gH * gH + (gP * gP + gR * gR) / 9;                // (a radian is worth 3 m)
        if (den < 1e-6) continue;
        const k = (-0.9 * e) / den;
        o.H += k * gH; o.P += (k * gP) / 9; o.R += (k * gR) / 9;
        if (press) c.press += Math.abs(e);
        any = true;
      }
      if (!any) break;
    }
    // (on easy ground its legs tilt it no further than TILT_OFF from the pose it wants: past that a foot lets go instead)
    const off = walk.climbing ? 9 : TILT_OFF;                          // (climbing, as far as it takes)
    o.P = clamp(o.P, Math.max(-PITCH_MAX, body.tP - off), Math.min(PITCH_MAX, body.tP + off));
    o.R = clamp(o.R, Math.max(-ROLL_MAX, body.tR - off), Math.min(ROLL_MAX, body.tR + off));
    return o;
  }
  // with the root moved on by shift (world), could the hull still be posed within its planted legs' reach: m the worst is past it
  const _sh = V();
  function strandedBy(shift) {
    constrain(Object.assign(_o, { H: body.H, P: body.P, R: body.R }), false, shift);
    tiltTo(_o.P, _o.R);
    let worst = 0;
    for (const c of chains) {
      if (c.state !== 'plant' || c.stepping) continue;
      c.strand = inRoot(c.hip, _o.H, _b).distanceTo(_a.copy(c.F).sub(shift).applyMatrix4(Minv)) - c.rMax;   // (how far it would be left behind)
      worst = Math.max(worst, c.strand);
    }
    return worst;
  }
  function bodyPose(dt) {
    const rootUp = rootPos.dot(up);
    body.H = body.W - rootUp;                                          // (its height is kept in the world: the root may be anywhere under it)
    body.fH += body.tW - rootUp - body.tH;                             // (and so is the one it wants)
    body.tH = body.tW - rootUp;
    fitPose();
    // how hard each planted leg holds it back from the pose it wants
    for (const c of chains) c.press = 0;
    constrain(Object.assign(_o, { H: body.tH, P: body.tP, R: body.tR }), true);
    body.cH = _o.H; body.cP = _o.P; body.cR = _o.R;                    // (as near that as its planted legs let it)
    pressMax = Math.max(...chains.map((c) => c.press));
    tiltTo(body.P, body.R);
    const deep0 = hullDepth(M, body.H);
    // toward it at its own rates, within its legs' reach, and never deeper into anything
    const rate = rough ? 0.7 : 1;
    const dH = clamp(body.tH - body.H, -LIFT_RATE * dt, LIFT_RATE * rate * dt);
    const dP = clamp(body.tP - body.P, -TILT_RATE * rate * dt, TILT_RATE * rate * dt), dR = clamp(body.tR - body.R, -TILT_RATE * rate * dt, TILT_RATE * rate * dt);
    let bH = body.H, bP = body.P, bR = body.R, went = false;
    for (const [a, b, r] of TRIES) {
      constrain(Object.assign(_o, { H: body.H + a * dH, P: body.P + b * dP, R: body.R + r * dR }), false);
      tiltTo(_o.P, _o.R);
      if (hullDepth(M, _o.H) <= deep0 + 1e-4) { bH = _o.H; bP = _o.P; bR = _o.R; went = true; break; }
    }
    if (!went) {                                                       // (nowhere to go but as its legs let it: they come first unless that is deeper)
      constrain(Object.assign(_o, { H: body.H, P: body.P, R: body.R }), false);
      tiltTo(_o.P, _o.R);
      if (hullDepth(M, _o.H) <= deep0 + 1e-4) { bH = _o.H; bP = _o.P; bR = _o.R; }
    }
    Object.assign(body, { H: bH, W: bH + rootUp, P: bP, R: bR, tW: body.tH + rootUp });
    setInner(bH, bP, bR);
  }
  // how far into things the hull, at its height and posed as it is, would be with the root at x, y, z, turned yaw (the caller's
  // collision: never deeper)
  function hits(x, y, z, yaw) {
    if (!ground || !body.set) return 0;
    tiltTo(body.P, body.R);
    return hullDepth(_mr.compose(_a.set(x, y, z), _qy.setFromAxisAngle(_Y, yaw), ONE), body.W - y);
  }

  // ---- holds ----
  const solid = (p) => (!!ground(p, _s) && _s.sub(p).dot(up) > 0.05) || shell(_s.copy(p).applyMatrix4(hullInv));
  // can a leg reach q on a top over the edge in the way, knee up: from its hip up past the edge, then on to q, both clear
  function overEdge(q, hip) {
    const rise = Math.max(0, q.dot(up) - hip.dot(up)) + 1.2;
    _k1.copy(hip).addScaledVector(up, rise);
    if (ray(hip, up, rise, _k3)) return false;
    const len = _k2.subVectors(q, _k1).length();
    return !ray(_k1, _k2.divideScalar(len), len - 0.05, _k3);
  }
  const blockedLine = (hip, q) => {
    const far = _k2.subVectors(q, hip).length();
    return !!ray && far > 0.2 && !!ray(hip, _k2.divideScalar(far), far - 0.15, _k3) && !overEdge(q, hip);
  };
  // may leg c stand at q (world) and its legs still not cross (slack: m of give). On a top: within its lane's length and X_ROOM of
  // its home (both less as the hull tilts and the homes close up), on its own side. On a face: in order along the hull with its
  // neighbours' feet (the leg ahead of it higher up the hull's length, the leg behind it lower), on its own side
  const _lz = V(), _lx = V();
  function inLane(c, q, slack = 0.1, face = false) {
    // (its own side: of the hull as it is tilted; with slack to stand anywhere, of the root)
    if (slack > 1 ? _s.subVectors(q, rootPos).dot(_lx.crossVectors(up, fwd)) * c.side < SIDE + 0.6 : _s.copy(q).applyMatrix4(hullInv).x * c.side < (face ? 0.3 : SIDE) - slack) return false;
    if (face) {
      const z = _s.z;
      for (const o of chains) {
        if (!neighbours(o, c) || o.state === 'reach') continue;
        const oz = _s.copy(o.stepping ? o.T : o.F).applyMatrix4(hullInv).z;
        if (o.row < c.row ? z > oz - 0.4 + slack : z < oz + 0.4 - slack) return false;
      }
      return true;
    }
    _lz.copy(fwd); _lx.crossVectors(up, fwd);
    const dz = _s.subVectors(q, c.homeW).addScaledVector(c.rv, -laneLead).dot(_lz), dx = _s.dot(_lx);   // (laneLead: s on, where its home will be)
    const inward = dx * c.side < 0 && urge > 0.5 ? X_IN : X_ROOM;
    return Math.abs(dz) < Math.max(0.6, 0.5 * (c.zHi - c.zLo) * Math.cos(body.P)) + slack && Math.abs(dx) < Math.max(0.6, inward * Math.cos(body.R)) + slack;
  }
  // where leg c may put its foot near P, its hip at hip: into out, and 1 (on a top) or 2 (on a face), or 0 for nowhere. A top: in its
  // reach with stretch in hand, in its lane, LEVER in from any edge on its hip's side, its leg's line clear (or over the edge,
  // knee up); the nearest such to P, and to its standing height (wantUp: the higher the better). No top (wantUp: none higher than it
  // stands), and mayFace: the face of what is in the way, as high up it as it reaches (short: the top is out of its reach), or going
  // down, the face below the edge
  let foundShort = false, laneSlack = 0, laneLead = 0;
  function findHold(c, P, hip, mayFace, wantUp, out) {
    hipWant(c);
    const hipUp = hip.dot(up), ceil = hipUp + ABOVE, stand = hipUp - hipY, rHold = HOLD_R * c.reach;
    _flat.subVectors(P, hip).addScaledVector(up, -_flat.dot(up));
    let flat = _flat.length();
    // (further out than its leg reaches down to there: drawn in)
    if (ground(P, _a) && hipUp - _a.dot(up) < rHold && hipUp > _a.dot(up)) {
      const room = Math.sqrt(Math.max(1, rHold * rHold - (hipUp - _a.dot(up)) ** 2));
      if (flat > room) { P = _q0.copy(P).addScaledVector(_flat, -(flat - room) / flat); flat = room; }
    }
    _toHip.copy(_flat).negate().normalize();
    _across.crossVectors(_toHip, up);
    let best = -Infinity, bestUp = -Infinity;
    for (const [a, s] of AROUND) {
      _cand.copy(P).addScaledVector(_toHip, a).addScaledVector(_across, s);
      if (!ground(_cand, _g, ceil)) continue;
      const y = _g.dot(up), far = _g.distanceTo(hip);
      if (far > rHold || far < 1.2 * NEAR * c.reach || !inLane(c, _g, 0.1 + laneSlack)) continue;
      // (and less, the further past most of its reach from where its hip would be in the pose the hull wants: it steps in under a
      // hull that wants up, so its leg has room to straighten)
      let score = -Math.hypot(a, s) - 0.35 * Math.abs(y - stand) + (wantUp ? UP_BONUS * Math.max(0, y - stand) : 0) - SLACK_COST * Math.max(0, _g.distanceTo(_want) - 0.8 * c.reach);
      if (score <= best) continue;
      // (leverage: nothing lower within LEVER of it on its hip's side)
      _e.subVectors(hip, _g).addScaledVector(up, -_e.dot(up));
      if (_e.lengthSq() > 1e-6) {
        _e.normalize();
        let lip = false;
        for (const d of [0.25, 0.5, LEVER]) if (ground(_f.copy(_g).addScaledVector(_e, d), _f, ceil) && _f.dot(up) < y - 0.25) { lip = true; break; }
        if (lip) continue;
      }
      if (blockedLine(hip, _g)) continue;
      best = score; bestUp = y;
      _best.copy(_g);
    }
    foundShort = false;
    const tall = wantUp && bestUp < stand + 1;                         // (it wants up, and found nothing up there to stand on)
    if (best > -Infinity && !tall) { out.copy(_best); return 1; }
    if (mayFace && ray) {
      let fb = -Infinity;
      const feel = (dir) => {
        for (const pitch of FACE_PITCH) {
          _e.copy(dir).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));
          if (!ray(hip, _e, rHold, _d)) continue;
          // (a face: what is just inside it is higher)
          const top = ground(_f.copy(_d).addScaledVector(dir, 0.1), _f) ? _f.dot(up) : Infinity;
          if (top < _d.dot(up) + 0.15) continue;
          const dh = _f.subVectors(_d, hip).addScaledVector(up, -_f.dot(up)).length();
          let y = Math.min(top - 0.25, ceil, hipUp + Math.sqrt(Math.max(0, rHold * rHold - dh * dh)));
          // (a face closer than its leg folds: below the height its hip is at, far enough down it)
          const fold = Math.sqrt(Math.max(0, (1.25 * NEAR * c.reach) ** 2 - dh * dh));
          if (Math.abs(y - hipUp) < fold) y = hipUp - fold;
          if (y < _d.dot(up) - 0.05 && y < hipUp - rHold) continue;
          _g.copy(_d).addScaledVector(up, y - _d.dot(up));
          if (_g.distanceTo(hip) < 1.2 * NEAR * c.reach || !inLane(c, _g, 0.1, true)) continue;
          const score = (wantUp ? y : -Math.abs(y - stand)) - 0.2 * _g.distanceTo(P);
          if (score > fb) { fb = score; _best.copy(_g); foundShort = top > y + 0.5; }
        }
      };
      if (flat > 0.3) feel(_h.copy(_toHip).negate());
      // (and in under the hull from its own side: the far face of something its other side stands on)
      feel(_h.crossVectors(up, fwd).multiplyScalar(-c.side));
      if (pushing) { feel(pushDir); feel(_h.copy(pushDir).addScaledVector(_across, 0.5).normalize()); feel(_h.copy(pushDir).addScaledVector(_across, -0.5).normalize()); }
      // (going down: the face below the edge it is over, felt for back toward its hip from out over the drop)
      if (!wantUp) {
        const below = (back, far, drawn) => {
          for (let dy = 1.5; dy < rHold; dy += 0.8) {
            _e.copy(P).addScaledVector(_toHip, drawn).addScaledVector(up, hipUp - dy - P.dot(up));
            if (solid(_e) || !ray(_e, back, far, _d)) continue;
            if (_d.distanceTo(hip) > rHold || _d.distanceTo(hip) < 1.2 * NEAR * c.reach || !inLane(c, _d, 0.1, true)) continue;
            // (where it would stand under its hip in the pose the hull wants, a little further on: it comes down with the hull)
            const score = -Math.abs(_d.dot(up) - (_want.dot(up) - hipY)) - SLACK_COST * Math.max(0, _d.distanceTo(_want) - 0.8 * c.reach) - 0.2 * _d.distanceTo(P);
            if (score > fb) { fb = score; _best.copy(_d); foundShort = false; }
          }
        };
        if (flat > 0.5) below(_h.copy(_toHip), flat + 1.5, 0);
        // (and back the way it came, from out where it would stand and from nearer its hip)
        if (pushing) for (const drawn of [0, 0.35 * flat, 0.7 * flat]) below(_h.copy(pushDir).negate(), 8, drawn);
      }
      if (fb > -Infinity) { out.copy(_best); return 2; }
    }
    if (best > -Infinity) { out.copy(_best); return 1; }
    return 0;
  }
  // has the haul begun for leg c: two feet stand on a top well above its own (the reaching pair has hooked the edge, and pulls)
  const axial = () => !pushing || Math.abs(pushDir.dot(fwd)) >= AXIAL;
  const hauled = (c) => {
    if (!axial()) return false;
    let left = false, right = false;                                   // (one of the pair each side: corner-on, with one side's feet up, it is not)
    for (const o of chains) if (o.state === 'plant' && !o.stepping && !o.face && o.F.dot(up) > c.F.dot(up) + 2) { if (o.side > 0) left = true; else right = true; }
    return left && right;
  };
  // may leg c take a hold on a face: while four others stand on tops (the legs that carry it from below never stand on a wall), or
  // once the haul has begun; and only going nose or tail first (sideways on, its flank is too near the face for a leg to fold to)
  const mayFace = (c) => axial() && (chains.filter((o) => o !== c && o.state === 'plant' && !o.stepping && !o.face).length >= 4 || hauled(c));

  // ---- steps ----
  // what stands between a foot and where it will land: the step arcs over it (a step up or down, or from or to a face, only just)
  function clearOver(c) {
    let top = 0;
    for (let k = 1; k <= 4; k++) {
      _a.lerpVectors(c.S0, c.T, k / 5);
      if (ground(_a, _b)) top = Math.max(top, _b.sub(_a).dot(up));
    }
    c.over = top > 0.2 ? top + 0.5 : 0;
    if (Math.abs(_a.subVectors(c.T, c.S0).dot(up)) > 0.4 || c.face || c.faceT) c.over = Math.min(c.over, OVER_EDGE);
  }
  // the way a foot lifts off a hold at p: up; off a face, out from it (toward its hip) and up
  function liftOff(c, p, face, out) {
    if (!face) return out.copy(up);
    hipW(c, _a).sub(p);
    _a.addScaledVector(up, -_a.dot(up));
    return out.copy(up).multiplyScalar(0.5).addScaledVector(_a.normalize(), 0.9).normalize();
  }
  function begin(c, to, kind, dur, track) {
    c.S0.copy(c.at);
    c.S0L.copy(c.at).applyMatrix4(Minv);
    c.T.copy(to);
    liftOff(c, c.S0, c.face && c.state === 'plant', c.liftS);
    c.failAt = -1;
    Object.assign(c, { stepping: true, state: 'swing', s: 0, dur, faceT: kind === 2, shortT: kind === 2 && foundShort, track, cool: 0 });
    liftOff(c, c.T, c.faceT, c.liftT);
    clearOver(c);
  }
  function land(c) {
    c.F.copy(c.T);
    Object.assign(c, { stepping: false, state: 'plant', face: c.faceT, short: c.shortT, cool: 0.12 });
  }
  // where a stepping foot is: from where it lifted (carried with the hull) to its hold; up first onto something higher, over first
  // and then down onto something lower; arcing off the one and onto the other; never past its leg's reach
  function swingAt(c) {
    const hS = c.S0.dot(up), hT = c.T.dot(up), rise = hT - hS;
    const ev = rise > 0.4 ? smooth(c.s / 0.5) : rise < -0.4 ? smooth((c.s - 0.5) / 0.5) : smooth((c.s - 0.1) / 0.8);
    c.at.copy(c.S0L).applyMatrix4(M).lerp(c.T, 1 - (1 - c.s) ** 1.5);
    c.at.addScaledVector(up, hS + rise * ev - c.at.dot(up));
    const arc = Math.sin(Math.PI * c.s), lift = c.over ? Math.max(LIFT * arc, c.over * Math.min(1, arc * 2.5)) : LIFT * arc;
    c.at.addScaledVector(c.liftS, lift * (1 - c.s)).addScaledVector(c.liftT, lift * c.s);
    const far = hipW(c, _a).distanceTo(c.at), most = 0.97 * c.reach;
    if (far > most) c.at.lerp(_a.addScaledVector(_b.subVectors(c.at, _a), most / far), c.s < 0.85 ? 1 : (1 - c.s) / 0.15);
  }
  // each leg's home on the ground and how fast it goes over it; where it would stand now, pushed on (c.P), and how high that is
  function homes() {
    const ceilOf = (c) => hipW(c, _a).dot(up) + ABOVE;
    const lead = _b.copy(pushDir).multiplyScalar(urge);
    drive = 0;
    for (const c of chains) {
      c.homeW.copy(c.home).applyMatrix4(inner.matrixWorld);
      c.homeW.addScaledVector(up, rootPos.dot(up) - c.homeW.dot(up));
      _a.subVectors(c.homeW, rootPos);
      c.rv.crossVectors(up, _a).multiplyScalar(spin).add(vel);
      c.rv.addScaledVector(up, -c.rv.dot(up));
      // (pushed on and held up: as far on as its lane goes)
      _d.copy(c.rv).multiplyScalar(0.3).clampLength(0, 1.2).add(lead);
      drive = Math.max(drive, c.rv.length());
      _lz.copy(fwd); _lx.crossVectors(up, fwd);
      const hz = Math.max(0.5, 0.5 * (c.zHi - c.zLo) * Math.cos(body.P) - 0.1), hx = Math.max(0.5, X_ROOM * Math.cos(body.R) - 0.1);
      c.P.copy(c.homeW).addScaledVector(_lz, clamp(_d.dot(_lz), -hz, hz)).addScaledVector(_lx, clamp(_d.dot(_lx), -hx, hx));
      c.yFar = ground(_d.copy(vel).multiplyScalar(0.8).clampLength(0, 5).add(c.homeW), _d) ? _d.dot(up) : rootPos.dot(up);   // (and where it will be shortly)
      let top = ground(c.P, _d) ? _d.dot(up) : rootPos.dot(up);
      // (held up at something its lane runs beside, narrower than its stance: in toward it)
      if (urge > 0.5) for (const k of [0.8, 1.5, 2.1]) {
        _d.copy(c.P).addScaledVector(_lx, -c.side * k);
        if (ground(_d, _g) && _g.dot(up) > top + 1) { top = _g.dot(up); c.P.copy(_d); break; }
      }
      c.yAhead = top - rootPos.dot(up);
      c.tooTall = top > ceilOf(c);
      c.P.addScaledVector(up, top - c.P.dot(up));
    }
  }
  // where leg c's hip will be in s seconds: on its way to the pose the hull wants, as far as its planted legs let it, carried on with
  // the root
  function hipIn(c, s, out) {
    const k = Math.min(1, s / POSE_T);
    tiltTo(lerp(body.P, body.cP, k), lerp(body.R, body.cR, k));
    inRoot(c.hip, lerp(body.H, body.cH, k), out).applyAxisAngle(_Y, spin * s);   // (and turned on with it)
    return out.applyMatrix4(M).addScaledVector(vel, s);
  }
  // and where it would be in the pose the hull wants, whether or not its legs let it get there
  const _want = V();
  function hipWant(c) {
    tiltTo(body.tP, body.tR);
    inRoot(c.hip, body.tH, _want).applyMatrix4(M);
    return rough && pushing ? _want.addScaledVector(pushDir, 1) : _want;   // (and where it is going)
  }
  // the rhythm, on easy ground: how fast the homes go drives it; the stride grows with the pace to the lanes' length; walking it
  // ripples up each side from the back, running it steps in two sets of four
  function rhythm(dt) {
    let far = 0, drive = 0;                                            // (its own: settling counts as a pace)
    for (const c of chains) {
      drive = Math.max(drive, c.rv.length());
      if (!c.stepping) far = Math.max(far, _a.subVectors(c.F, c.homeW).addScaledVector(up, -_a.dot(up)).length());
    }
    const settling = drive < 0.5 * SETTLE_SPEED && far > SETTLE_FAR;
    if (settling) drive = SETTLE_SPEED;
    const run = smooth((drive - WALK) / (RUN - WALK));
    const duty = lerp(0.75, 0.5, run) - 0.05 * clamp((drive - RUN) / (4 * RUN), 0, 1);
    const stride = clamp(drive * STANCE, 0.35 * strideMax, strideMax);
    const f = drive > 0.05 ? (drive * duty) / stride : 0, swing = 1 - duty;
    phase = (phase + f * dt) % 1;
    for (const c of chains) {
      if (c.stepping) {
        // (its landing follows the hull part of the way, on the level)
        if (c.track && c.s < 0.5 && ground(landing(c, stride, drive, c.dur * (1 - c.s), _a), _b) && _b.distanceTo(c.T) < 0.6 && Math.abs(_b.dot(up) - c.T.dot(up)) < 0.3) c.T.copy(_b);
        continue;
      }
      if (c.state !== 'plant' || c.cool > 0) continue;
      const d = THREE.MathUtils.euclideanModulo(c.sets - c.ripple + 0.5, 1) - 0.5;
      const at = THREE.MathUtils.euclideanModulo(phase - (c.ripple + d * run), 1);
      // (carried out of its lane, or nearly out of reach; at a run a frame carries it a good way, so with more give)
      const gone = !inLane(c, c.F, 0.15 + 0.06 * drive, c.face) || hipW(c, _hw).distanceTo(c.F) > 0.97 * c.rMax;
      if (!gone && !(f > 0 && at < 0.3 * swing)) continue;
      // (carried out of its lane, by a turn say: at once, but not with a neighbour, nor with fewer than four others down)
      if (gone && (chains.some((o) => o.stepping && o.s < 0.7 && neighbours(o, c)) || chains.filter((o) => o !== c && !o.stepping && o.state === 'plant').length < 4) && hipW(c, _hw).distanceTo(c.F) < c.rMax) continue;
      const dur = gone ? clamp(swing / Math.max(f, 0.5), 0.2, 0.5) : clamp((swing - at) / f, 0.1, 0.6);
      laneLead = dur;
      const kind = findHold(c, landing(c, stride, drive, dur, _hp), hipIn(c, dur, _hw), false, false, _hold);
      laneLead = 0;
      if (!kind) { c.cool = 0.1; continue; }
      const moved = _hold.distanceTo(c.F);
      if (moved < (settling ? SAME_HOLD : 0.12 * stride) && !gone) continue;
      begin(c, _hold, kind, dur, true);
    }
  }
  // where a rhythm's step lands: its home where the hull will have carried it, and half a stride on
  function landing(c, stride, drive, left, out) {
    out.copy(c.homeW).addScaledVector(c.rv, left);
    const v = c.rv.length();
    if (v > 1e-3) out.addScaledVector(c.rv, (0.5 * stride * Math.min(1, drive / (0.5 * SETTLE_SPEED))) / v);
    return out;
  }
  // rough ground: how badly planted leg c wants to step (1: due; Infinity: the root has gone on out of its reach, and it has let go)
  function needOf(c) {
    hipW(c, _hw);
    const far = _hw.distanceTo(c.F);
    if (far > LOOSE * c.reach || far < 0.95 * c.rMin) return Infinity;   // (or the hull has come closer than its leg folds)
    let n = far > NEED_STRETCH * c.reach ? 1 + (far / c.reach - NEED_STRETCH) * 10 : 0;
    if (c.press > 0.01) n = Math.max(n, Math.min(2.5, 1.1 + 2 * c.press));
    if (c.strand > 0 && walk.speedMax === 0) n = Math.max(n, 2.2);     // (it is what stops the root going on)
    if (far < 1.15 * NEAR * c.reach) n = Math.max(n, 1.1);
    if (!inLane(c, c.F, 0.5, c.face)) n = Math.max(n, 1.5);
    if (blockedLine(_hw, c.F)) n = Math.max(n, 2);
    if (c.cool > 0) return n >= 2 ? n : 0;
    // (where it would stand now is higher or lower than where it does, or well away from it)
    const dy = Math.abs(c.P.dot(up) - c.F.dot(up));
    if (dy > 1 && !c.tooTall) n = Math.max(n, 0.8 + 0.2 * dy);
    if (c.tooTall && urge > 0.5 && !c.short) n = Math.max(n, 1);
    if (c.face && urge > 0.5 && _hw.dot(up) + ABOVE - c.F.dot(up) > 1.2 && c.P.dot(up) > c.F.dot(up) + 1) n = Math.max(n, 1);   // (it could grip higher now)
    const off = _a.subVectors(c.P, c.F).addScaledVector(up, -_a.dot(up)).length();
    if (off > 0.6 * strideMax && !c.face) n = Math.max(n, off / (0.6 * strideMax));
    // (pawing: a foot up a face short of its top tries again, a few times)
    if (c.short && pushing && !gaveUp && t - c.paw > 0.9) n = Math.max(n, 1);
    return Math.min(n, 2.9);
  }
  function roughSteps() {
    let lifted = chains.filter((c) => c.stepping).length, down = chains.filter((c) => c.state === 'plant' && !c.stepping).length;
    const want = chains.filter((c) => c.state === 'plant' && !c.stepping).map((c) => [c, needOf(c)]).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]);
    for (const [c, n] of want) {
      const gone = n === Infinity;
      if (!gone && (lifted >= ROUGH_MAX + Math.min(2, Math.floor(drive / 1.5)) || down <= KEEP_DOWN)) continue;
      if (!gone && chains.some((o) => o.stepping && o.s < 0.8 && (neighbours(o, c) || mirror(o, c)))) continue;
      // (up: what is ahead of it is higher; or it holds the hull back from below once the haul has begun)
      const haul = hauled(c);
      const wantUp = urge > 0.5 && !gaveUp && (c.P.dot(up) > c.F.dot(up) + 1 || (c.press > 0.05 && haul));
      const dur0 = 0.5;
      // (going down, any leg may come down the face after the hull; going up, only a reaching leg)
      const down1 = !wantUp && c.P.dot(up) < c.F.dot(up) - 1;
      // (given up: back down, wherever on its own side it can stand)
      laneSlack = gaveUp ? 3 : 0;
      const kind = findHold(c, c.P, hipIn(c, dur0, _hw), !gaveUp && (down1 || mayFace(c)), wantUp, _hold);
      laneSlack = 0;
      const pawing = c.short && kind === 2 && foundShort;
      if (kind && (_hold.distanceTo(c.F) > SAME_HOLD || pawing) && _hold.distanceTo(hipW(c, _hp)) < c.reach) {
        if (pawing) {                                                  // (another go at it, a little along the face)
          c.tries++;
          _a.crossVectors(up, _b.subVectors(_hold, _hp)).normalize();
          _b.copy(_hold).addScaledVector(_a, (c.tries % 2 ? 0.6 : -0.6)).addScaledVector(up, -0.4 * (c.tries % 2)).sub(_hp);
          const far = _b.length();
          if (ray(_hp, _b.divideScalar(far), far + 1, _d)) _hold.copy(_d);   // (on the face, where its leg meets it)
          c.paw = t;
        } else if (kind === 2 && foundShort) { c.paw = t; c.tries = 0; }
        begin(c, _hold, kind, clamp(_hold.distanceTo(c.F) / FOOT_SPEED, STEP_MIN, STEP_MAX), false);
        lifted++; down--;
        continue;
      }
      // (coming down, or hauled up: holding the hull back or the root from going on, with nowhere better to stand for LET_GO s, it
      // lets go, if five others hold; a leg that carries it from below never does)
      if (!(c.press > 0.2 || (c.strand > 0 && walk.speedMax === 0))) c.failAt = -1;
      else if (c.failAt < 0) c.failAt = t;
      if (gone || (c.failAt >= 0 && t - c.failAt > LET_GO && down > KEEP_DOWN + 1 && (down1 || haul))) {     // (let go, and nothing to stand on: it reaches for where it would)
        c.failAt = -1;
        Object.assign(c, { state: 'reach', face: false, short: false, cool: 0.2, reachAt: t });
        c.want.copy(kind ? _hold : c.P);
        down--;
        continue;
      }
      c.cool = COOL;
      if (c.short) c.paw = t;
    }
  }
  // held up and getting nowhere for STALL s (a wall too tall: reared up on its rear legs, its front legs pawing at the face): it comes
  // down and stands, till it is pushed another way or from somewhere else
  function giveUp() {
    gaveUp = true;
    gaveAt.copy(rootPos); gaveDir.copy(pushDir);
    urge = 0;
    // (its feet let go of the face, and of any top it could not get its hull onto, and reach back down for the ground)
    for (const c of chains) {
      c.tries = 0; c.cool = 0;
      const hold = c.stepping ? c.T : c.F;                              // (or was on its way to)
      if (c.state === 'reach' || !((c.stepping ? c.faceT : c.face) || hold.dot(up) > lowStand + ABOVE - 0.5)) continue;
      Object.assign(c, { state: 'reach', stepping: false, face: false, short: false, cool: 0.3, reachAt: t });
      c.want.copy(c.homeW);
    }
  }
  // a leg with nothing in reach to stand on reaches for where it would, its foot most of its reach out toward it, and looks again
  function reaching(c, dt) {
    hipW(c, _hw);
    const far = _a.subVectors(c.want, _hw).length();
    _b.copy(_hw).addScaledVector(_a, Math.min(1, (0.8 * c.reach) / Math.max(far, 1e-6)));
    _b.addScaledVector(up, 0.25 * Math.sin(t * 5 + c.row));          // (probing)
    const go = _a.subVectors(_b, c.at), len = go.length();
    c.at.addScaledVector(go, len > HANG_SPEED * dt ? (HANG_SPEED * dt) / len : 1);
    if (gaveUp) c.want.copy(c.homeW);                                   // (given up: back under it)
    if (c.cool > 0) return;
    // (anywhere it can, on its own side, once it has reached a while)
    laneSlack = t - c.reachAt > 0.6 ? 3 : 0;
    const kind = findHold(c, c.P, hipIn(c, 0.3, _hp), !gaveUp && mayFace(c), urge > 0.5 && !gaveUp, _hold);
    laneSlack = 0;
    if (kind && _hold.distanceTo(_hw) < c.reach) begin(c, _hold, kind, clamp(_hold.distanceTo(c.at) / FOOT_SPEED, STEP_MIN, STEP_MAX), false);
    else { c.cool = 0.2; c.want.copy(kind ? _hold : c.P); }
  }
  // put down where it is: the hull over the ground under its homes, its feet on their holds
  function stand() {
    // (its hips their height over the highest thing under its outline, to start from: put down on top of something, it stands on it)
    let top = -Infinity;
    for (const [x, z] of HULL) if (ground(_a.set(x, 0, z).applyMatrix4(M), _b)) top = Math.max(top, _b.dot(up));
    const H0 = (top > -Infinity ? top - rootPos.dot(up) : 0) + hipY;
    body.tH = body.fH = body.cH = body.H = H0; body.tP = body.cP = body.P = 0; body.tR = body.cR = body.R = 0;
    for (let pass = 0; pass < 3; pass++) {
      setInner(body.H, body.P, body.R);
      homes();
      for (const c of chains) {
        // (where its home is in something, or over nothing in reach: the nearest it can stand to it; else it starts out reaching)
        let kind = findHold(c, c.homeW, hipW(c, _hw), false, false, _hold);
        if (!kind) { laneSlack = 3; kind = findHold(c, c.homeW, _hw, false, false, _hold); laneSlack = 0; }
        Object.assign(c, { state: kind ? 'plant' : 'reach', stepping: false, face: false, short: false, cool: 0, tries: 0, reachAt: t - 1 });
        c.F.copy(kind ? _hold : _hw.lerp(c.homeW, 0.6));
        c.want.copy(c.homeW);
        c.at.copy(c.F);
      }
      for (let k = 0; k < 6; k++) fitPose();
      constrain(Object.assign(_o, { H: body.tH, P: body.tP, R: body.tR }), false);
      Object.assign(body, { H: _o.H, P: _o.P, R: _o.R });
    }
    // (and clear of whatever it was put down against)
    tiltTo(body.P, body.R);
    for (let k = 0; k < 16 && hullDepth(M, body.H) > GRAZE; k++) body.H += 0.25;
    body.tH = Math.max(body.tH, body.H);
    Object.assign(body, { W: body.H + rootPos.dot(up), tW: body.tH + rootPos.dot(up), set: true });
    setInner(body.H, body.P, body.R);
  }

  const walk = {
    chains, pose: body, hits, climbing: false, speedMax: Infinity, rough: false, urge: 0, gaveUp: false, shove: V(),
    // folded away, or off the ground: the legs keep the shape they had (the caller folds them from it)
    freeze() {
      frozen = true;
      for (const c of chains) poseLeg(c, 1);
    },
    update(dt, env) {
      ground = env.ground; ray = env.ray;
      t += dt;
      root.updateWorldMatrix(true, false);
      M.copy(root.matrixWorld); Minv.copy(M).invert();
      up.setFromMatrixColumn(M, 1).normalize();
      rootPos.setFromMatrixPosition(M);
      fwd.setFromMatrixColumn(M, 2).normalize();
      const yaw = Math.atan2(fwd.x, fwd.z);
      if (seen && dt > 0 && rootPos.distanceTo(prev) < 12) {
        vel.lerp(_a.subVectors(rootPos, prev).divideScalar(dt), 1 - Math.exp(-dt * 10));
        spin += ((THREE.MathUtils.euclideanModulo(yaw - yaw0 + Math.PI, Math.PI * 2) - Math.PI) / dt - spin) * Math.min(1, dt * 10);
      } else if (seen && dt > 0) { body.set = false; vel.set(0, 0, 0); spin = 0; }
      seen = true; yaw0 = yaw;
      prev.copy(rootPos);
      push.copy(env.push).addScaledVector(up, -env.push.dot(up));
      pushing = push.length() > 0.5;
      if (pushing) pushDir.copy(push).normalize(); else pushDir.copy(fwd);
      if (!body.set) stand();
      else if (frozen) {
        // (opening out: its feet from where they hang, stepping down)
        Object.assign(body, { W: rootPos.dot(up) + hipY, H: hipY, P: 0, R: 0, tH: hipY, fH: hipY, cH: hipY, tP: 0, cP: 0, tR: 0, cR: 0, tW: rootPos.dot(up) + hipY });
        setInner(hipY, 0, 0);
        homes();
        for (const c of chains) {
          c.foot.getWorldPosition(c.at);
          Object.assign(c, { state: 'reach', stepping: false, face: false, short: false, cool: 0 });
          const kind = findHold(c, c.homeW, hipW(c, _hw), false, false, _hold);
          c.F.copy(kind ? _hold : c.homeW);
          begin(c, c.F, 1, 0.35, false);
        }
      }
      frozen = false;
      // held up (pushed, and not getting on; or about to meet something): its feet look further on, and the hull leans into it
      const stuck = pushing && vel.dot(pushDir) < Math.max(0.4, 0.4 * Math.min(push.length(), 2));
      if (gaveUp && (!pushing || pushDir.dot(gaveDir) < 0.7)) gaveUp = false;
      const held = pushing && (stuck || (blocked && vel.length() < 2)) && !gaveUp;
      urge = held ? Math.min(URGE_MAX, urge + URGE_UP * dt) : Math.max(0, urge - URGE_DOWN * dt);
      // (getting somewhere: its hull higher, or further on)
      const got = body.W + rootPos.dot(pushDir);
      if (!held || got > gotBest + 0.2 || pushDir.dot(gotDir) < 0.9) { gotBest = got; gotAt = t; gotDir.copy(pushDir); }
      else if (t - gotAt > STALL) giveUp();
      for (const c of chains) {
        if (!pushing) c.strand = 0;
        c.cool -= dt;
        if (!c.stepping || !body.set || frozen) continue;
        c.s = Math.min(1, c.s + dt / c.dur);
        // (it lands only on a hold in its reach)
        if (c.s < 1) continue;
        if (hipW(c, _hw).distanceTo(c.T) < c.rMax) land(c);
        else {                                                          // (the hull turned or went another way: to a hold it can reach, or reaching)
          const kind = findHold(c, c.track ? c.homeW : c.P, _hw, !c.track && !gaveUp && mayFace(c), false, _hold);
          if (kind) { c.T.copy(_hold); c.faceT = kind === 2; c.shortT = false; c.S0.copy(c.at); c.S0L.copy(c.at).applyMatrix4(Minv); c.s = 0.6; }
          else { Object.assign(c, { stepping: false, state: 'reach', face: false, short: false, cool: 0.2, reachAt: t }); c.want.copy(c.P); }
        }
      }
      bodyPose(dt);
      homes();
      // rough ground: tilted, its feet at different heights or on a face, or held up
      let lo = Infinity, hi = -Infinity, faces = false, edge = false, edgeFar = false;
      for (const c of chains) {
        if (c.state !== 'plant') continue;
        const y = c.F.dot(up);
        // (a step or a drop where it would put a foot now, or shortly)
        edge ||= Math.abs(c.P.dot(up) - y) > (rough ? 1 : 1.6);
        edgeFar ||= Math.abs(c.yFar - y) > 1.6;
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        faces ||= c.face;
      }
      const tilt = Math.max(Math.abs(body.P), Math.abs(body.R), Math.abs(body.tP), Math.abs(body.tR)), fast = vel.length();   // (at a run it keeps to its rhythm)
      rough = urge > 0.3 || faces || tilt > (rough ? 0.2 : 0.3) || hi - lo > (rough ? 1 : 1.6) || ((chains.some((c) => c.state === 'reach') || pressMax > 0.05) && fast < 11) || (edge && pushing);
      // a planted foot the root has been carried out of reach of lets go
      for (const c of chains) if (c.state === 'plant' && !c.stepping && hipW(c, _hw).distanceTo(c.F) > LOOSE * c.reach) rough = true;
      // (where its hips would be, standing level on the lower half of its feet: what it comes back down to, given up)
      const ys = chains.filter((c) => c.state === 'plant' && !c.face).map((c) => c.F.dot(up)).sort((a, b) => a - b), half = Math.ceil(ys.length / 2);
      lowStand = (half ? ys.slice(0, half).reduce((a, b) => a + b, 0) / half : rootPos.dot(up)) + hipY;
      if (rough) roughSteps(); else rhythm(dt);
      // the feet, and the legs to them
      let space = null;
      for (const c of chains) {
        if (c.stepping) swingAt(c);
        else if (c.state === 'reach') reaching(c, dt);
        else c.at.copy(c.F);
        if (c.space !== space) { space = c.space; space.updateWorldMatrix(true, false); _m.copy(space.matrixWorld).invert(); }
        _t.copy(c.at).applyMatrix4(_m);
        const T = _vt.copy(_t);
        let want = c.swivel;                                           // (the nearest turn that keeps it out of things, eased to)
        solveBent(c, T, 0);
        if (inside(c)) {
          solveBent(c, T, c.swivel);
          if (inside(c)) for (const sw of SWIVELS) { solveBent(c, T, sw); if (!inside(c)) { want = sw; break; } }
        } else want = 0;
        c.swivel += clamp(want - c.swivel, -SWIVEL_RATE * dt, SWIVEL_RATE * dt);
        solveLeg(c, _t.copy(T));
        poseLeg(c, 1);
      }
      // what it tells the driver: climbing (it won't close up), and how fast it may go
      walk.climbing = rough && (faces || tilt > 0.2 || hi - lo > 1 || body.W - lo > hipY + 1);
      walk.rough = rough; walk.urge = urge; walk.gaveUp = gaveUp;
      let most = rough || edgeFar ? CLIMB_SPEED : Infinity;
      // (its legs holding the hull back: slower; and where going on would take the hull out of a planted leg's reach whatever its
      // pose, not at all, till that leg has stepped: the root never leaves a planted foot behind)
      if (rough && pressMax > 0.02) most = Math.min(most, lerp(CLIMB_SPEED, CREEP, smooth((pressMax - 0.02) / 0.3)));
      if (rough && pushing && strandedBy(_sh.copy(pushDir).multiplyScalar(0.6)) > 0.05) most = 0;
      // (coming down off something: it waits for its hull to come down with its feet, rather than walk on out over the drop)
      if (rough && body.H - body.tH > 0.2) {
        tiltTo(body.P, body.R);
        if (hullDepth(M, body.H - 0.3) <= GRAZE) most = Math.min(most, CLIMB_SPEED * (1 - smooth((body.H - body.tH - 0.2) / 0.8)));   // (it is free to)
      }
      // (nor out over a drop further than OVERHANG from its edge, till its hull is down near the ground below; what it is climbing
      // onto, just ahead, counts as its own ground too)
      if (pushing) {
        let own = -Infinity;
        for (let k = -4.5; k <= OVERHANG; k += 0.75) if (ground(_a.copy(rootPos).addScaledVector(pushDir, 0.4 - k), _b)) own = Math.max(own, _b.dot(up));
        if (own < body.W - hipY - 3.5) most = 0;
      }
      if (rough && chains.some((c) => c.state === 'reach')) most = Math.min(most, CREEP);
      if (gaveUp) most = Math.min(most, 0);
      // (and no faster than lets its hull rise clear of what is ahead before it gets there; braking short of what even the pose it
      // wants would meet)
      blocked = false;
      if (pushing) {
        const wait = Math.max((body.tH - body.H) / LIFT_RATE, Math.abs(body.tP - body.P) / TILT_RATE, Math.abs(body.tR - body.R) / TILT_RATE, 0.05);
        for (const d of BRAKE_AT) {
          _mr.copy(M).setPosition(_a.copy(rootPos).addScaledVector(pushDir, d));
          tiltTo(body.P, body.R);
          if (hullDepth(_mr, body.H) <= GRAZE) continue;
          if (d <= 2.5) blocked = true;
          tiltTo(body.tP, body.tR);
          most = Math.min(most, hullDepth(_mr, body.tH) > GRAZE ? (d === BRAKE_AT[0] ? TOUCH : Math.max(TOUCH, Math.sqrt(2 * BRAKE * (d - 1)))) : Math.max(TOUCH, d / wait));
          break;
        }
      }
      walk.speedMax = most;
      // (given up, and its hull still tilted against what it gave up at: it asks to back off it, till it stands level)
      const tilted = Math.max(Math.abs(body.P), Math.abs(body.R)) > 0.3 || chains.some((c) => c.face);
      if (gaveUp && tilted && rootPos.distanceTo(gaveAt) < BACK_OFF) walk.shove.copy(gaveDir).multiplyScalar(-BACK_SPEED); else walk.shove.set(0, 0, 0);
    },
  };
  // (is any of the leg's joints or bones, as just solved, inside something)
  function inside(c) {
    const p = c.work, w = c.space.matrixWorld;
    for (let i = 1; i < p.length; i++) {
      if (i < p.length - 1 && solid(_vs.copy(p[i]).applyMatrix4(w))) return true;
      for (const k of [0.25, 0.5, 0.75]) if (solid(_vs.lerpVectors(p[i - 1], p[i], k).applyMatrix4(w))) return true;
    }
    return false;
  }
  for (const c of chains) { c.rMax = Math.min(R_MAX * c.reach, c.ikMax); c.rMin = NEAR * c.reach; }
  return walk;
}
