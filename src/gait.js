import * as THREE from 'three';

// Walking on jointed legs: the kit's `leg` pivots that have `knee` pivots down them and a `foot` at the ground contact (the mites' legs,
// the mandrake's roots; tools/blender/chimera_common.py limb_chain). Each foot stays planted where it last stepped until the body has
// carried its rest spot a stride away, then steps to just ahead of that spot in an arc. The legs step in two sets that take turns (the
// builder's two swing phases: a tripod on six legs, every other root round a tuber). Each leg reaches its foot by IK (FABRIK along its
// joints, started from the rest pose each frame so the knees bend the way they were built), and the body rides on its feet: raised or
// lowered to them, pitched and rolled to their slope. Trotting, the strides lengthen with the speed (the steps no quicker than DUR_MIN)
// as far as the legs reach. Past a trot (RUN), in the air, or not given the ground, it eases back to the plain swing (chimerabuild.js
// anim): stepping any faster looks like a gallop or a twitch.
//
// makeGait(root, inner, legs, { lift }) -> null (no jointed legs) or { update(dt, ground, gap) }, called by anim after the swing is set (each
// jointed leg's swing angle in L.swing). ground(p, out) puts the ground point under world point p in out. The root's world transform
// must be this frame's (the caller places it before calling anim).

const STRIDE = 0.5;     // a foot steps once its rest spot is this far from it (of the leg's span: hip to foot, along the ground)
const LEAD = 0.55;      // walking, it lands this far ahead of its rest spot (of the stride)
const LIFT = 0.35;      // the step's arc (of the span)
const SETTLE = 0.3;     // standing, a set further than this from its spots (of the stride) steps back under the body
const STRIDE_MAX = 2.2; // trotting, the stride stretches up to this (of the span), or as far as the legs reach: feet land far ahead
const REACH = 0.94;     // of a leg's length, the furthest it stretches to a foot
const DUR_MIN = 0.075, DUR_MAX = 0.22;    // s a step takes: quick at a scurry, slower at a stroll (trotting, the stride grows instead)
const DUR_FAST = 0.05;  // s the quickest step, once the stride is at its longest
const RUN = 13.5;       // spans a second past which it runs on the plain swing (5.4 m/s on the lab's mite; back on its feet under 0.85 of it)
const AIR = 0.04;       // m above the ground (of the span) that counts as off it
const BLEND = 7;        // 1/s the ease between the IK and the plain swing
const FOLLOW = 12;      // 1/s the body follows its feet
const TILT = 0.45;      // rad the most the body pitches or rolls to its feet
const ITER = 8;         // FABRIK passes (it is usually within a tenth of a millimetre in three)

const _p = new THREE.Vector3(), _up = new THREE.Vector3(), _g = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _vh = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _e = new THREE.Euler(), _X = new THREE.Vector3(1, 0, 0);
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Matrix4();
const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3();

export function makeGait(root, inner, legs, { lift: follow = 0.4 } = {}) {   // (follow: how far the feet raise or lower the body, of the hip height)
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
      L, joints, space, pts, len, dir, W, nRest, basis, rest, span, grow, thr: STRIDE * span, hipY: hip.y, group: L.ph ? 1 : 0,
      bind: joints.map((j) => j.quaternion.clone()), work: pts.map((p) => p.clone()), ik: joints.map(() => new THREE.Quaternion()),
      turned: joints.map(() => new THREE.Quaternion()),
      F: new THREE.Vector3(), S0: new THREE.Vector3(), T: new THREE.Vector3(), at: new THREE.Vector3(), base: new THREE.Vector3(), s: 0, dur: DUR_MAX, lift: 0, over: 0, stepping: false,
    });
  }
  if (!chains.length) return null;
  const span = chains.reduce((s, c) => s + c.span, 0) / chains.length;
  const thr = STRIDE * span;
  const growMax = THREE.MathUtils.clamp(Math.min(...chains.map((c) => c.grow)), 1, STRIDE_MAX / STRIDE);
  const vmax = RUN * span;                                           // m/s past which it runs on the swing (it scales with the legs)
  const hipY = chains.reduce((s, c) => s + c.hipY, 0) / chains.length;
  const G = { w: 0, run: false, planted: false, seen: false, prev: new THREE.Vector3(), vel: new THREE.Vector3(), lift: 0, pitch: 0, roll: 0 };

  const stepping = (group) => chains.some((c) => c.group === group && c.stepping);
  const lead0 = (grow) => Math.min(1, along(_d.copy(G.vel)).length() / (2 * thr * grow)) * LEAD * grow;
  // what stands between a foot and where it will land (a crate, a wall top, a hump): the step goes over it, high early and late
  function clear(c, ground, dur, lead) {
    restSpot(c, _r1).addScaledVector(_vh, dur);
    const v = _vh.length();
    if (v > 1e-3) _r1.addScaledVector(_vh, (lead * c.thr) / v);
    let top = 0;
    for (let k = 1; k <= 4; k++) {
      _r2.lerpVectors(c.F, _r1, k / 5);
      ground(_r2, _r3);
      top = Math.max(top, _r3.sub(_r2).dot(_up));
    }
    c.over = top > 0.05 * c.span ? top + 0.15 * c.span : 0;
  }
  const restSpot = (c, out) => out.copy(c.rest).applyMatrix4(root.matrixWorld);
  const along = (v) => v.addScaledVector(_up, -v.dot(_up));          // (its part along the ground)

  function update(dt, ground, gap) {
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
      ground(_p, _g);
      if (_a.subVectors(_p, _g).dot(_up) < AIR * span) want = 1;
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
      for (const c of chains) { ground(restSpot(c, c.F), c.F); c.stepping = false; }
      G.planted = true;
    }
    // which set steps: the one whose feet are furthest behind, once the other set is down (or at once, if it is stretched past reach)
    const moving = speed > 0.1 * thr / DUR_MAX;
    const grow = THREE.MathUtils.clamp((speed * DUR_MIN) / (0.8 * thr), 1, growMax);   // (the stride, running: of a walk's)
    for (const group of [0, 1]) {
      if (stepping(group)) continue;
      let worst = 0;
      for (const c of chains) if (c.group === group) worst = Math.max(worst, along(_a.subVectors(c.F, restSpot(c, _b))).length() / (c.thr * grow));
      if (!(worst > 1 || (!moving && worst > SETTLE)) || (stepping(1 - group) && worst < 2)) continue;
      const dur = THREE.MathUtils.clamp((0.8 * thr * grow) / Math.max(speed, 1e-3), DUR_FAST, DUR_MAX);
      const lift = LIFT * Math.sqrt(grow);                            // (a longer stride, a higher arc)
      for (const c of chains) if (c.group === group) { c.stepping = true; c.s = 0; c.dur = dur; c.lift = lift * c.span; c.S0.copy(c.F); clear(c, ground, dur, lead0(grow)); }
    }
    // the feet: planted, or along their arcs (each step's landing kept up to date as the body goes on)
    const lead = Math.min(1, speed / (2 * thr * grow)) * LEAD * grow;
    for (const c of chains) {
      if (!c.stepping) { c.at.copy(c.F); c.base.copy(c.F); continue; }
      c.s = Math.min(1, c.s + dt / c.dur);
      restSpot(c, c.T).addScaledVector(_vh, c.dur * (1 - c.s));
      if (speed > 1e-3) c.T.addScaledVector(_vh, (lead * c.thr) / speed);
      ground(c.T, c.T);
      const e = c.s * c.s * (3 - 2 * c.s);
      c.base.lerpVectors(c.S0, c.T, e);
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
    const k = Math.min(1, dt * FOLLOW);                               // (leaving the ground, it eases back level)
    G.lift += (want ? THREE.MathUtils.clamp(h, -follow * hipY, follow * hipY) - G.lift : -G.lift) * k;
    G.pitch += (want ? THREE.MathUtils.clamp(-Math.atan(szz > 1e-6 ? sz / szz : 0), -TILT, TILT) - G.pitch : -G.pitch) * k;
    G.roll += (want ? THREE.MathUtils.clamp(Math.atan(sxx > 1e-6 ? sx / sxx : 0), -TILT, TILT) - G.roll : -G.roll) * k;
    inner.position.y += (G.lift - inner.position.y) * G.w;
    inner.quaternion.setFromEuler(_e.set(G.pitch * G.w, 0, G.roll * G.w));
    // the legs reach their feet
    let space = null;
    for (const c of chains) {
      if (c.space !== space) { space = c.space; space.updateWorldMatrix(true, false); _m.copy(space.matrixWorld).invert(); }
      solve(c, _t.copy(c.at).applyMatrix4(_m));
      pose(c, G.w);
    }
  }

  return { update, chains, vmax, get weight() { return G.w; } };
}

// the frame of a bone along d, across it toward the leg's plane normal n (columns: along, across, their cross)
function frameOf(d, n, out) {
  _x.copy(d);
  _y.copy(n).addScaledVector(d, -n.dot(d)).normalize();
  _z.crossVectors(_x, _y);
  return out.makeBasis(_x, _y, _z);
}

// FABRIK from the rest pose to target t (in the legs part's frame), then each bone turned from its rest frame to its new one
function solve(c, t) {
  const p = c.work, n = p.length - 1;
  for (let i = 0; i <= n; i++) p[i].copy(c.pts[i]);
  for (let it = 0; it < ITER; it++) {
    p[n].copy(t);
    for (let i = n - 1; i >= 0; i--) p[i].sub(p[i + 1]).normalize().multiplyScalar(c.len[i]).add(p[i + 1]);
    p[0].copy(c.pts[0]);
    for (let i = 0; i < n; i++) p[i + 1].sub(p[i]).normalize().multiplyScalar(c.len[i]).add(p[i]);
    if (p[n].distanceToSquared(t) < 1e-8) break;
  }
  const plane = _n.crossVectors(_a.subVectors(p[1], p[0]), _b.subVectors(p[n], p[0]));
  const flat = !c.nRest || plane.lengthSq() < 1e-10;
  if (!flat) plane.normalize();
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
