import * as THREE from 'three';
import { toon, glow, inkMat } from './toon.js';
import { loadSpiderTankKit } from './models.js';
import { makeGait } from './gait.js';

// Zbornak's spider tank, ARACHNE: the Triple Crown's reward (tools/blender/build_spidertank.py; docs/spidertank/; reviewed in
// tools/spidertank-lab.html). Eight armoured legs walk it by the chimeras' gait (src/gait.js), to a spider's rhythm: walking, a ripple
// up each side from the back leg to the front; running, two sets of four that take turns; each foot in its own lane, so the legs never
// cross. Each foot reaches for the highest spot near where it would land that its leg reaches and stands on with leverage, or grips the
// face of what is too tall; the hull is posed on them each frame (bodyPose: its height, pitch and roll, searched round the pose it has
// for every planted foot in reach, no point of the hull in anything, and, driven on, the hull clear a step further on), so pushed at
// something it rears up, nose up as steeply as it takes, and hoists itself over: up to CLIMB (twice its height) over its lowest foot
// on a top; taller, it gets as high up the face as it can and stops. With too few feet holding it, it drops. Past SKIM_AT it closes up
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
// it keeps under while fire is held, walking), tank.climbing and tank.pose (the hull's: H over the root, W in the world, P, R) read back.

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
const PROBE = 1.5;              // m ahead it looks at least (standing at the foot of something, it rears up to climb it)
const SKIM_RISE = 2.5;          // m the folded hull rises on its jets over what is under it, at most
const HOVER = 0.9;              // m higher the folded hull floats than its jets alone would hold it (1.5 m off the ground)
const BOB = 0.14;               // m it rises and falls on its jets, floating (and a little roll and pitch with it)
const BANK = 0.5;               // rad of roll per rad/s of turn, floating (at most 0.3)
const TRAIL = 0.34, TRAIL_W = 0.32;   // s a jet's trail lasts, m its width at the nozzle (the belly jets': 0.6 of both)
const ABOVE = 0.6;              // m a foot may stand above its hip at most, reaching up over an edge (its knee still bends up over it)
const CLIMB = 9.5;              // m a foot stands at most above the lowest foot standing on top of something: taller, it only grips the face
const PITCH_MAX = 1.45, ROLL_MAX = 1.2;   // rad the hull tilts at most: nose up (near upright) a climb, and over sideways
const LIFT_RATE = 6, PITCH_RATE = 2.2, ROLL_RATE = 1.6;   // m/s and rad/s the hull's pose changes at most (a spider's: quick)
const FALL = 6;                 // m/s/s it drops at, with too few feet holding it
const HIPS_OVER = 1.6;          // m the hips may stand over the climb's limit at most (reaching a top at it, never over a wall taller)
const LEVER = 0.7;              // m a top must go on past a foot (away from its hip) for it to stand there: no hooking a lip
const REVERSE = 18;             // m/s the most it backs up at
const STRETCH = 1;              // of a leg's reach, past which a trailing foot is due to step (the stride plans to 0.97; at 1.06 it goes at once)
const NEAR = 0.45;              // of a leg's reach, the closest to its hip a foot stands (on the face of something beside it)
// the spots a foot looks at round where it would land (m toward its hip, m across), out to the leg's full reach: it takes the highest,
// less REACH_COST a metre away (a face counts FACE_COST less than a top)
const AROUND = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [0.8, 0.8], [0.8, -0.8], [-0.8, 0.8], [-0.8, -0.8], [0, 2], [0, -2], [-1.8, 0],
  [-3, 0], [-2.4, 1.2], [-2.4, -1.2], [1.8, 0], [2.6, 0], [3.4, 0]];
const AHEAD = [1.5, 3, 4.5, 6, 7.5];    // m further ahead (the way it is going) it looks too, for something to climb before its nose gets there
const REACH_COST = 0.25, FACE_COST = 0.3;
const CHARGE = 1.0, FIRE = 4.0; // s: the beam's charge (the trigger held) and its channel
const BEAM_RANGE = 420;         // m
const BEAM_SLOW = 0.3;          // the speed it may keep while charging and firing (of what is asked)

// the hull's outline over the ground (x across, z ahead, in the root's frame: the bead and the cannon's tip), where it looks for what is
// under it; the caller can test it against what it drives into (the lab does)
// the hull itself, as points in its own frame (the bead's bottom and three rings up its side, the cannon): it is clear when none of them
// is inside anything
export const HULL3 = [new THREE.Vector3(0, 1.86, -0.1), new THREE.Vector3(0, 2.8, 4), new THREE.Vector3(0, 2.8, 5)];
for (const t of [-0.92, -0.55, 0]) {
  const r = Math.sqrt(1 - t * t);
  for (let k = 0; k < 8; k++) HULL3.push(new THREE.Vector3(2.25 * r * Math.cos(k * Math.PI / 4), 3.24 + 1.38 * t, -0.09 + 3.5 * r * Math.sin(k * Math.PI / 4)));
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
  let ground = null, ray = null, ref = null, push = 0, stuck = false, gripping = false;

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

  // ---- the climb: the hull's pose on its feet ----
  // The hull is posed about the middle of its hips (PIVOT): their height H over the root, its pitch P and its roll R (inner's rotation
  // about x and z). Each frame it looks round the pose it has for a better one: every planted foot within its leg's reach (and no closer
  // than the leg folds), no point of the hull inside anything, sat on its feet at its own height and tilted to them; and, pushed on, one
  // that would let it go on (the hull clear a step further that way): so held up at something, it hoists itself up and over it, nose up
  // as steeply as it takes, as fast as its legs let it, and stops where the driver stops. With too few feet holding it, it drops.
  const PIVOT = new THREE.Vector3(0, hipY, 0);
  const body = { H: hipY, W: hipY, P: 0, R: 0, vy: 0, held: 0, set: false };   // (H: over the root; W: the same, in the world)
  const _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _pos = new THREE.Vector3(), _w = new THREE.Vector3(), _m4 = new THREE.Matrix4();
  let footL = null;
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
  const _ahead4 = new THREE.Matrix4(), _probe = new THREE.Vector3();
  function bodyPose(dt) {
    _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    _inv.copy(root.matrixWorld).invert();
    const chs = tank.gait.chains;
    footL ||= chs.map(() => new THREE.Vector3());
    // the feet that hold it, in the root's frame; the plane through them tilts it; those standing on tops (not gripping faces) seat it
    let n = 0, sy = 0, nTop = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxy = 0, szy = 0, my = 0, mx = 0, mz = 0;
    gripping = false;
    let low = Infinity;
    for (let i = 0; i < chs.length; i++) {
      const c = chs[i];
      if (c.stepping) continue;
      footL[i].copy(c.F).applyMatrix4(_inv);
      n++; mx += footL[i].x; mz += footL[i].z; my += footL[i].y;
      if (onFace(c, c.F)) gripping = true;
      else { nTop++; sy += footL[i].y; low = Math.min(low, c.F.dot(_up)); }
    }
    if (low < Infinity) ref = low;
    const rootUp = _up.dot(_d.setFromMatrixPosition(root.matrixWorld));
    if (body.set) body.H = body.W - rootUp;                            // (its height is kept in the world: the root may be anywhere under it)
    if (!body.set && ref === null) ref = rootUp;
    let Hn = body.H, Pn = body.P, Rn = body.R;
    if (n >= 3) {
      mx /= n; mz /= n; my /= n;
      for (let i = 0; i < chs.length; i++) {
        if (chs[i].stepping) continue;
        const x = footL[i].x - mx, z = footL[i].z - mz, y = footL[i].y - my;
        sxx += x * x; szz += z * z; sxy += x * y; szy += z * y;
      }
      Pn = THREE.MathUtils.clamp(-Math.atan(szz > 1e-6 ? szy / szz : 0), -PITCH_MAX, PITCH_MAX);
      Rn = THREE.MathUtils.clamp(Math.atan(sxx > 1e-6 ? sxy / sxx : 0), -ROLL_MAX, ROLL_MAX);
      Hn = my + hipY;
      if (!body.set) Object.assign(body, { H: Hn, P: Pn, R: Rn, set: true });   // (first on its feet: as it stands)
    }
    // pushed on (or going), the root a step further that way: the pose should leave the hull clear there too
    const going = Math.abs(push) > 0.5 || vel.lengthSq() > 0.25;
    if (going) {
      heading(_probe).multiplyScalar(Math.max(PROBE, vel.length() * 0.25));
      _ahead4.copy(root.matrixWorld).setPosition(_w.setFromMatrixPosition(root.matrixWorld).add(_probe));
    }
    const hipsTop = ref - rootUp + CLIMB + HIPS_OVER;
    const cost = (H, P, R) => {
      poseOf(H, P, R);
      let miss = 0;
      for (let i = 0; i < chs.length; i++) {
        const c = chs[i];
        // (every hip kept under the top of anything too tall to climb, nose up or not, so no leg ever reaches over one)
        if (_w.copy(c.hip).applyQuaternion(_q).add(_pos).y > Math.max(hipsTop, body.top)) return Infinity;
        if (c.stepping) continue;
        const d = _w.distanceTo(footL[i]);
        miss += Math.max(0, d - 0.97 * c.reach) + Math.max(0, 0.95 * NEAR * c.reach - d);
      }
      const into = hullDepth(root.matrixWorld), on = going ? hullDepth(_ahead4) : 0;
      return 400 * miss + 2000 * into + 40 * on + 0.3 * (H - Hn) ** 2 + 3 * ((P - Pn) ** 2 + (R - Rn) ** 2);
    };
    const dH = LIFT_RATE * dt, dP = PITCH_RATE * dt, dR = ROLL_RATE * dt;
    poseOf(body.H, body.P, body.R);                                    // (over the cap already, as a foot stood up on something: no higher)
    body.top = -Infinity;
    for (const c of chs) body.top = Math.max(body.top, _w.copy(c.hip).applyQuaternion(_q).add(_pos).y);
    let best = Infinity, bH = body.H, bP = body.P, bR = body.R;
    for (const a of [0, -1, 1]) for (const b of [0, -1, 1]) for (const r of [0, -1, 1]) {
      const H = body.H + a * dH, P = THREE.MathUtils.clamp(body.P + b * dP, -PITCH_MAX, PITCH_MAX), R = THREE.MathUtils.clamp(body.R + r * dR, -ROLL_MAX, ROLL_MAX);
      const k = cost(H, P, R);
      if (k < best - 1e-6) { best = k; bH = H; bP = P; bR = R; }
    }
    // (too few feet holding it, or none of them in reach: it drops, onto what is under it)
    let holding = 0;
    poseOf(bH, bP, bR);
    for (let i = 0; i < chs.length; i++) {
      const c = chs[i];
      if (!c.stepping && _w.copy(c.hip).applyQuaternion(_q).add(_pos).distanceTo(footL[i]) < c.reach * 1.02) holding++;
    }
    if (holding >= 3 || n < 3 && body.held < 0.4) { body.vy = 0; body.held = holding >= 3 ? 0 : body.held + dt; }
    else {
      body.vy -= FALL * dt;
      bH += body.vy * dt;
      poseOf(bH, bP, bR);
      if (hullDepth(root.matrixWorld) > 0) { bH -= body.vy * dt; body.vy = 0; }   // (landed on something: no further)
    }
    Object.assign(body, { H: bH, W: bH + rootUp, P: bP, R: bR });
    poseOf(bH, bP, bR);
    inner.position.copy(_pos);
    inner.quaternion.copy(_q);
    // (climbing: a foot on a face, or standing up on something, or the hull tilted or hoisted: it won't close up)
    for (const c of chs) if (!c.stepping && c.F.dot(_up) > ref + 0.8) gripping = true;
    if (Math.abs(bP) > 0.2 || Math.abs(bR) > 0.2 || bH > hipY + 1) gripping = true;
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
  // where foot c may stand near p: of the spots round it, out to its leg's reach and a little ahead, and in its lane (gait.js: zLo..zHi
  // along the body, so it never crosses its neighbours), the highest it reaches. A top counts if it is no more than ABOVE over its hip,
  // nor CLIMB over the lowest foot standing on a top, and on a clear line from its hip; at a spot too tall for that, the face it would grip
  // (grip) counts for a little less. Nearer ones win among equals.
  const hipW = new THREE.Vector3(), _best = new THREE.Vector3(), _far = new THREE.Vector3(), _ahead = new THREE.Vector3();
  function foothold(c, p, out, groundFn) {
    c.joints[0].getWorldPosition(hipW);
    const up = _up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
    if (ref === null) ref = up.dot(_d.setFromMatrixPosition(root.matrixWorld));   // (not yet stood: where it is)
    const ceil = Math.min(hipW.dot(up) + ABOVE, ref + CLIMB);
    const toHip = _b.subVectors(hipW, p).addScaledVector(up, -_b.subVectors(hipW, p).dot(up)).normalize();
    const across = _side.crossVectors(toHip, up);
    heading(_ahead);
    _inv.copy(root.matrixWorld).invert();
    let best = -Infinity, far0 = -Infinity;
    for (let k = 0; k < AROUND.length + AHEAD.length; k++) {
      const [a, s] = AROUND[k] || [0, 0], f = k < AROUND.length ? 0 : AHEAD[k - AROUND.length];
      _c.copy(p).addScaledVector(toHip, a).addScaledVector(across, s).addScaledVector(_ahead, f);
      const cost = REACH_COST * Math.hypot(a, s, f), z = _f.copy(_c).applyMatrix4(_inv).z;
      // (in its lane; pushed on and held up, it may reach on past it, for the face or the top of what holds it: the legs gather to climb)
      if (c.zLo !== undefined && ((z < c.zLo - 0.1 && !(stuck && push < 0)) || (z > c.zHi + 0.1 && !(stuck && push > 0)))) continue;
      if (!groundFn(_c, _e, ceil)) {                                              // (too tall for it: its face)
        if (grip(c, _c, ceil, _e) && _e.dot(up) - cost - FACE_COST > best) { best = _e.dot(up) - cost - FACE_COST; _best.copy(_e); }
        continue;
      }
      const score = _e.dot(up) - cost;
      if (score <= best) continue;
      const far = _f.subVectors(_e, hipW).length();
      if (far > 0.98 * c.reach) {                                                   // (out of reach: kept, if nothing is in it)
        if (score > far0) { far0 = score; _far.copy(_e); }
        // (far below, over an edge: the face it went over, looked for back the way it came, down from its hip, for a hold going down)
        if (ray && _e.dot(up) < hipW.dot(up) - c.reach * 0.8) {
          for (let dy = 1.5; dy < c.reach; dy += 1.2) {
            _l1.copy(_c).addScaledVector(up, hipW.dot(up) - dy - _c.dot(up)).addScaledVector(_ahead, 1);
            if (!ray(_l1, _l2.copy(_ahead).negate(), 4, _d)) continue;
            const reachD = _d.distanceTo(hipW);
            if (reachD > 0.95 * c.reach || reachD < NEAR * c.reach) continue;
            const k = _d.dot(up) - cost - FACE_COST;
            if (k > best) { best = k; _best.copy(_d); }
            break;
          }
        }
        continue;
      }
      if (far < NEAR * c.reach) continue;                                          // (too close to fold to)
      // (leverage: the top goes on LEVER past the foot, away from its hip, and doesn't drop away just behind it: no hooking a lip)
      const away = _l1.subVectors(_e, hipW).addScaledVector(up, -_l1.dot(up)).normalize(), y = _e.dot(up);
      if (!groundFn(_l2.copy(_e).addScaledVector(away, LEVER), _l2) || Math.abs(_l2.dot(up) - y) > 0.25) continue;
      if (!groundFn(_l2.copy(_e).addScaledVector(away, -0.3), _l2) || _l2.dot(up) < y - 0.25) continue;
      if (ray && far > 1e-3 && ray(hipW, _f.divideScalar(far), far - 0.05, _d)) {     // (something between: its face, then)
        if (grip(c, _c, ceil, _l1) && _l1.dot(up) - cost - FACE_COST > best) { best = _l1.dot(up) - cost - FACE_COST; _best.copy(_l1); }
        continue;
      }
      best = score;
      _best.copy(_e);
    }
    // (nothing in reach, the hull too high over the ground, coming off something: the best out of it, and the hull comes down to it)
    return best > -Infinity ? out.copy(_best) : far0 > -Infinity ? out.copy(_far) : null;
  }
  // which way it is going along the ground (ahead, standing still)
  function heading(out) {
    out.copy(vel).addScaledVector(_up, -vel.dot(_up));
    if (out.lengthSq() < 0.25) out.setFromMatrixColumn(root.matrixWorld, 2).multiplyScalar(push < 0 ? -1 : 1).addScaledVector(_up, -out.dot(_up));
    return out.normalize();
  }
  // foot c on the face of what stands where it would land (p): where the line from its hip down to p meets it, then up the face as high as
  // it reaches (to ceil, and far enough from its hip for the leg to fold to); or null
  function grip(c, p, ceil, out) {
    if (!ray) return null;
    const up = _up, far = _f.subVectors(p, hipW).length();
    if (far < 1e-3 || !ray(hipW, _f.divideScalar(far), far + 0.05, _d)) return null;
    const dh = _f.subVectors(_d, hipW).addScaledVector(up, -_f.dot(up)).length(), hip = hipW.dot(up), base = _d.dot(up);
    if (base > ceil) return null;                                              // (it met a top, too high to stand on: no hold)
    const y = Math.max(base, Math.min(ceil, hip - Math.sqrt(Math.max(0, (NEAR * c.reach) ** 2 - dh * dh))));
    if (_f.copy(_d).addScaledVector(up, y - base).distanceTo(hipW) > 1.1 * c.reach) return null;
    return out.copy(_d).addScaledVector(up, y - base);
  }
  // how badly planted foot c wants to step: as its leg, trailing below a risen hull, nears its full stretch, or at once if something has
  // come between its hip and its foot (the hull has gone on past an edge)
  function strain(c) {
    // (pushed on but held up, the legs on the side it is pushed toward step to anything better in reach: it climbs, or grips the face)
    if (stuck && c.hip.z * push > 0.3) {
      const want = foothold(c, _a.copy(c.rest).applyMatrix4(root.matrixWorld), _g, ground);
      if (want && (want.dot(_up) > c.F.dot(_up) + 0.3 || want.distanceTo(c.F) > 1)) return 1.5;
    }
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
  const gait = makeGait(root, inner, legs, { air: false, bodyPose, foothold, strain, solid, urge: () => (stuck ? Math.sign(push) : 0), wave: true, pole: true });
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
    climbMax: CLIMB,                                                 // m the most it climbs, over its lowest foot on a top (lab sweep)
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
      stuck = Math.abs(push) > 0.5 && vel.length() < 0.5;
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
      // overdrive: close up past SKIM_AT, open out under SKIM_OFF (never while the beam is up or fire is held, nor start while it climbs
      // or grips)
      const skimWant = (this.fold > 0.5 ? speed > SKIM_OFF : speed >= SKIM_AT && !(this.fold === 0 && this.climbing)) && !firing && !hold;
      this.fold = THREE.MathUtils.clamp(this.fold + (skimWant ? dt : -dt) / FOLD_TIME, 0, 1);
      this.form = this.fold <= 0 ? 'walk' : this.fold >= 1 ? 'skim' : 'folding';
      // the legs: walk (IK) until they start to fold, and again as they finish opening
      // (the hull as it was posed, so its hips are where they are while it looks for footholds; folding, it settles level)
      const rootUp = _up.setFromMatrixColumn(root.matrixWorld, 1).normalize().dot(_d.setFromMatrixPosition(root.matrixWorld));
      if (this.fold < 0.15 && body.set) { poseOf(body.W - rootUp, body.P, body.R); inner.position.copy(_pos); inner.quaternion.copy(_q); }
      else if (this.fold >= 0.15) { inner.position.set(0, 0, 0); inner.quaternion.identity(); Object.assign(body, { H: hipY, W: rootUp + hipY, P: 0, R: 0, vy: 0 }); }
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
