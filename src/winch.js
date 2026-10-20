// Kepler Hitch-Line Winch (Kepler's unique upgrade, active on E). Fire a cable onto a vehicle or structure and the drum
// reels you in: it spools up, runs steady and eases off to leave ~2 m of cable. Hooked on a vehicle you ride its pull
// (swing under a flying transit like a pendulum, or trail a rover or land-train). Holds hands-free up to 20 s; E lets go.
//
// Targeting: a faint tow-line marker sits on whatever E would hook (hud: markerFor). The surface under the reticle wins,
// else the target nearest the reticle. The hook bites the nearest surface, and the cable is only as long as the gap.
//
// It's a cable, not a rod: it pulls only when taut, both ways, split by mass. A hover-car (a couple of you) goes where
// you drag it; rovers are a handful; a shuttle gives a few metres; freighters and land-trains barely notice; structures
// don't budge. Dragged traffic eases back onto its route on release (traffic.js applyTug); rovers drive back. SAT-7
// doesn't move: hook it and you go round with it.
//
// Wrapping: each frame every leg is checked for a structure in the way and bent round it (a box at the best edge point,
// a cylinder or sphere along a tangent-to-tangent arc counted as one structure; up to WRAP_MAX). Slim things don't bend
// it, bend points must be in the open, and anything it can't bend round it passes through. A bend lets go once the
// straight line past it has been clear, with margin, for a moment. You are pulled along the first leg, the hook along
// the last. If the drum runs but you aren't coming in, the cable strains (creaking louder and higher, pull rising to
// yank you free) and slips off after STRAIN_MAX s.
import * as THREE from 'three';
import { upAt } from './geo.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { rayCollider } from './physics.js';
import { toon } from './toon.js';
import markUrl from './assets/towmark.png?inline';

const RANGE = 120;       // m, cable reach
const HOLD = 20;         // s before the line lets go on its own
const SEG = 20;          // cable points (slack sag); more with many bends, up to SEG_MAX
const SEG_MAX = 56;
const REST = 2;          // m of cable left when the reel has finished
const REEL_MAX = 18;     // m/s, drum top speed
const REEL_ACC = 6;      // m/s², drum spool-up
const REEL_DEC = 5;      // m/s², wind-down, easing to a stop at REST
const PULL_ACC = 14;     // m/s², max tug bringing you up to drum speed
const LEAD = 0.6;        // m the drum may run ahead of you (a blocked pull doesn't snap)
const PICK_EVERY = 0.1;  // s between targeting scans
const AIM_W = 12;        // score lost per radian off the reticle (distance counts for little beside it)
const MIN_COS = 0.35;    // max angle off the reticle (cosine)
const MIN_GAP = 4;       // too close to hook
const MIN_STRUCT_R = 2.5; // smaller colliders are props and rocks, not structures
const EMBED = 0.42;      // how far the claw sinks into the surface
const EYE_OUT = 1.08;    // grapple eye, this far back from the tip along the shank (cable ends there)
const SLOT = { gold: 0xffd23f, steel: 0x9aa3b2, dark: 0x2a2540, tracer: 0xff9f1c }; // every cable has the Kepler orange tracer strand
const WRAP_MAX = 5;      // max structures the cable bends round; it passes through further ones
const WRAP_PTS = 40;     // max bend points in all (a round structure takes a chain)
const BOX_BENDS = 12;    // max bends on one box (three laps of a post), then it passes through
const WRAP_MIN_R = 4;    // only structures this big (bounding radius) bend it
const WRAP_STEPS = 4;    // max wrap passes per frame (each adds a bend or arc, or lets one go)
const WRAP_MARGIN = 0.4; // a wrap point sits this far outside its corner
const UNWRAP_FAT = 0.5;  // a wrap lets go only when the straight line clears it by this much (no flicker)
const UNWRAP_HOLD = 0.2; // ... for this long
const STRAIN_MAX = 2.5;  // s of straining against something solid before the line slips
const YANK = 2.5;        // ... meanwhile the pull rises by up to this many times PULL_ACC
const YANK_FULL = 1.2;   // ... reaching it after this many s
const MAX_PIECES = Math.ceil(RANGE * 1.6) + 8; // a metre of cable each, up to the snap length

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _look = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _to = new THREE.Vector3();
const _lo = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ray = new THREE.Ray();
const _cols = [];
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const _z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _hn = new THREE.Vector3();
const _nv = new THREE.Vector3();
const _nn = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const _up = new THREE.Vector3(); // your pull direction along the cable
const _ut = new THREE.Vector3(); // the hook's pull direction
const _gUp = new THREE.Vector3(); // first leg as it lies (position correction)
const _gUt = new THREE.Vector3(); // last leg
const _upv = new THREE.Vector3();
const _hA = new THREE.Vector3(), _hB = new THREE.Vector3(), _lat = new THREE.Vector3();

// what's worth hooking, and how heavy it is
function massOf(v) {
  if (v.kind === 'ship') return 16;
  if (v.kind === 'bus') return 6; // transit shuttles
  if (v.kind === 'landtrain') return 14;
  if (v.kind === 'buggy') return 5; // crawler buggies
  if (v.kind === 'car') return 2.6;
  return 6;
}

// ---- aiming at a model's real meshes (a bounding box round a hull with booms is mostly air) ----
const _parts = new WeakMap();
const _rc = new THREE.Raycaster();
const _rinv = new THREE.Matrix4();
const _im = new THREE.Matrix4();
const _wp = new THREE.Vector3();
const _wl = new THREE.Vector3();
const _np = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _wc = new THREE.Vector3();
const _bb = new THREE.Box3();
const _hits = [], _inside = [];
const aim = { point: new THREE.Vector3(), nrm: new THREE.Vector3(), looked: false };

// A model's solid meshes (no shadow blob, glow or flames) and cutY, the top of the hull's bottom 30%, below which
// nothing is hooked (the body, not what hangs under it). Measured once, in its own frame.
function partsOf(root) {
  let p = _parts.get(root);
  if (p) return p;
  root.updateWorldMatrix(true, true);
  _rinv.copy(root.matrixWorld).invert();
  const list = [], hull = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.depthWrite === false || m.side === THREE.BackSide || m.blending === THREE.AdditiveBlending) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    list.push(o);
    if (shown(o, root)) hull.union(_bb.copy(o.geometry.boundingBox).applyMatrix4(_im.multiplyMatrices(_rinv, o.matrixWorld)));
  });
  p = { list, cutY: hull.isEmpty() ? -Infinity : hull.min.y + (hull.max.y - hull.min.y) * 0.3 };
  _parts.set(root, p);
  return p;
}

function shown(o, root) {
  for (let q = o; q; q = q.parent) { if (!q.visible) return false; if (q === root) break; }
  return true;
}

// a hit's surface normal (world), facing the side the ray came from
function hitNormal(h, dir, out) {
  if (h.face) out.copy(h.face.normal).transformDirection(h.object.matrixWorld); else out.copy(dir).negate();
  if (out.dot(dir) > 0) out.negate();
  return out.normalize();
}

// Where the sightline meets a model, else its spot nearest the reticle (snapped onto the surface). Fills and returns
// `aim` (in the last drawn pose), or null.
function modelHit(root, eye, look) {
  const P = partsOf(root);
  _rinv.copy(root.matrixWorld).invert();
  _hits.length = 0;
  _inside.length = 0;
  let near = null, nearAng = Infinity;
  for (const o of P.list) {
    if (!shown(o, root)) continue;
    const bb = o.geometry.boundingBox;
    _im.copy(o.matrixWorld).invert();
    _lo.copy(eye).applyMatrix4(_im);
    _ld.copy(look).transformDirection(_im);
    _ray.origin.copy(_lo);
    _ray.direction.copy(_ld);
    // standing on a ship you're inside its hull boxes, which say nothing; those get a triangle test below, so the deck
    // under the reticle can be hooked
    if (bb.containsPoint(_lo)) _inside.push(o);
    else if (_ray.intersectBox(bb, _hp)) {
      _wp.copy(_hp).applyMatrix4(o.matrixWorld);
      if (_wl.copy(_wp).applyMatrix4(_rinv).y >= P.cutY) _hits.push({ o, t: eye.distanceTo(_wp) });
    }
    nearestOnBox(bb, _lo, _hp);
    _wp.copy(_hp).applyMatrix4(o.matrixWorld);
    if (_wl.copy(_wp).applyMatrix4(_rinv).y < P.cutY) continue;
    _to.copy(_wp).sub(eye);
    const d = _to.length();
    const c = d > 1e-3 ? _to.dot(look) / d : 0;
    if (c > 0.2 && 1 - c < nearAng) { nearAng = 1 - c; near = o; _np.copy(_wp); }
  }
  if (_hits.length || _inside.length) {
    _hits.sort((a, b) => a.t - b.t);
    _rc.set(eye, look);
    _rc.far = 400;
    let best = null;
    for (let i = 0; i < _hits.length && i < 6; i++) {
      const h = _rc.intersectObject(_hits[i].o, false)[0];
      if (!h || _wl.copy(h.point).applyMatrix4(_rinv).y < P.cutY) continue;
      best = h;
      break;
    }
    for (const o of _inside) {
      const h = _rc.intersectObject(o, false)[0];
      if (h && (!best || h.distance < best.distance) && _wl.copy(h.point).applyMatrix4(_rinv).y >= P.cutY) best = h;
    }
    if (best) {
      aim.point.copy(best.point);
      aim.looked = true;
      hitNormal(best, look, aim.nrm);
      return aim;
    }
  }
  if (!near) return null;
  // from the spot nearest the reticle, cast toward that piece's middle to find its surface
  near.geometry.boundingBox.getCenter(_lc);
  _wc.copy(_lc).applyMatrix4(near.matrixWorld);
  _dir.copy(_wc).sub(_np);
  const L = _dir.length();
  aim.looked = false;
  if (L > 1e-3) {
    _dir.divideScalar(L);
    _rc.set(_np, _dir);
    _rc.far = L + 1;
    const h = _rc.intersectObject(near, false)[0];
    if (h) { aim.point.copy(h.point); hitNormal(h, _dir, aim.nrm); return aim; }
  }
  aim.point.copy(_np);
  aim.nrm.copy(eye).sub(_np).normalize();
  return aim;
}

// the point on (or in) box b nearest to p; from inside, the nearest face
function nearestOnBox(b, p, out) {
  out.copy(p).clamp(b.min, b.max);
  if (!out.equals(p)) return out;
  const dx0 = p.x - b.min.x, dx1 = b.max.x - p.x, dy0 = p.y - b.min.y, dy1 = b.max.y - p.y, dz0 = p.z - b.min.z, dz1 = b.max.z - p.z;
  const m = Math.min(dx0, dx1, dy0, dy1, dz0, dz1);
  if (m === dx0) out.x = b.min.x; else if (m === dx1) out.x = b.max.x;
  else if (m === dy0) out.y = b.min.y; else if (m === dy1) out.y = b.max.y;
  else if (m === dz0) out.z = b.min.z; else out.z = b.max.z;
  return out;
}

// nearest point to p on a collider's surface (sphere, box or cylinder), and the normal there
function colliderPoint(c, p, out, nOut) {
  _d.copy(p).sub(c.c);
  if (c.type === 'sphere') {
    const l = _d.length() || 1;
    nOut.copy(_d).divideScalar(l);
    return out.copy(c.c).addScaledVector(_d, c.r / l);
  }
  if (c.type === 'cyl') {
    const a = c.axis;
    const h = _d.dot(a);
    const qh = Math.min(Math.max(h, c.y0), c.y1);
    _n.copy(_d).addScaledVector(a, -h); // radial part
    const rad = _n.length();
    const cap = h < c.y0 || h > c.y1;
    out.copy(c.c).addScaledVector(a, qh);
    if (rad > 1e-5) out.addScaledVector(_n, (cap ? Math.min(rad, c.r) : c.r) / rad);
    if (cap) nOut.copy(a).multiplyScalar(h > c.y1 ? 1 : -1); else if (rad > 1e-5) nOut.copy(_n).divideScalar(rad); else nOut.copy(a);
    return out;
  }
  const axes = [c.ax, c.ay, c.az], h = [c.hx, c.hy, c.hz];
  const lp = [_d.dot(c.ax), _d.dot(c.ay), _d.dot(c.az)];
  let k = 0, best = -Infinity;
  for (let i = 0; i < 3; i++) { const ex = Math.abs(lp[i]) - h[i]; if (ex > best) { best = ex; k = i; } } // nearest face, or the one it's furthest past
  const l = lp.map((v, i) => Math.max(-h[i], Math.min(h[i], v)));
  const sg = Math.sign(lp[k] || 1);
  if (best < 0) l[k] = sg * h[k]; // from inside: out through that face
  nOut.copy(axes[k]).multiplyScalar(sg);
  return out.copy(c.c).addScaledVector(c.ax, l[0]).addScaledVector(c.ay, l[1]).addScaledVector(c.az, l[2]);
}


// ---- wrapping round structures like a rope round pegs ----
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fd = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _oa = new THREE.Vector3(), _ob = new THREE.Vector3(), _wq = [];
let _ws = 0;
let _ignore = null; // structures the cable gave up wrapping and passes through (set by tendWraps while it runs)

// Too thin to bend a cable (column, rail, post; by thickness, not height). Wrapping these only ties you in knots.
function thin(c) {
  if (c.type === 'cyl') return c.r < 1.6;
  if (c.type === 'sphere') return c.r < 2;
  return Math.min(c.hx, c.hy, c.hz) < 0.6;
}

// Nearest structure the line a->b hits, as { c, t }, or null. The first `skip` and last `endSkip` m don't count (the
// hook's surface, a wall you lean on); a line starting inside a collider isn't stopped by it. `only`: test just that one.
// Colliders are filed under every 64 m grid cell their bounds touch, so sampling every 24 m finds them all.
function blocker(cols, a, b, skip = 0.35, only = null, endSkip = skip) {
  _fd.subVectors(b, a);
  const L = _fd.length();
  if (L < 1) return null;
  _fd.divideScalar(L);
  if (only) {
    const t = rayCollider(only, a, _fd, L);
    return t > skip && t < L - endSkip ? { c: only, t } : null;
  }
  let best = null, bt = Infinity;
  _ws++;
  const n = Math.max(1, Math.ceil(L / 24));
  for (let i = 0; i <= n; i++) {
    _v1.lerpVectors(a, b, i / n);
    for (const c of cols.query(_v1, 1, _wq)) {
      if (c._ws === _ws) continue;
      c._ws = _ws;
      if (c.platform || c.br < WRAP_MIN_R || thin(c) || (_ignore && _ignore.has(c))) continue;
      const t = rayCollider(c, a, _fd, L);
      if (t > skip && t < L - endSkip && t < bt) { bt = t; best = c; }
    }
  }
  return best ? { c: best, t: bt } : null;
}

// p in the open (no structure within 0.3 m)? A bend point inside a wall can never be reached.
const _fq = [];
function pointFree(cols, p) {
  for (const c of cols.query(p, 1, _fq)) if (!c.platform && cols.contact(c, p, 0.3, _nv) > 0) return false;
  return true;
}

// Line a->b clear with `r` m to spare (centre line plus four offset by r)? Offset lines ignore the last `endSkip` m, since a
// line ending on a wall at a shallow angle always grazes it.
function clearFat(cols, a, b, r, endSkip = 0.35) {
  if (blocker(cols, a, b)) return false;
  _e1.subVectors(b, a).normalize();
  _e2.copy(a).normalize().cross(_e1);
  if (_e2.lengthSq() < 1e-6) _e2.set(0, 1, 0).cross(_e1);
  _e2.normalize();
  _e1.crossVectors(_e1, _e2).normalize(); // perpendicular to the line and _e2
  for (let k = 0; k < 4; k++) {
    const e = k < 2 ? _e1 : _e2, sg = k % 2 ? -r : r;
    _oa.copy(a).addScaledVector(e, sg);
    _ob.copy(b).addScaledVector(e, sg);
    if (blocker(cols, _oa, _ob, 0.35, null, endSkip)) return false;
  }
  return true;
}

// Where a cable A->B could bend round c: on each box edge, the point making A->edge->B shortest (where a rope bends);
// likewise a cylinder's sides and rims, and a ring round a sphere. Each stands WRAP_MARGIN off the surface.
const _ep = new THREE.Vector3();
function wrapCandidates(c, A, B) {
  const out = [];
  const along = (p0, p1, outward) => { // best point on p0->p1 (ternary search; path length is convex along it)
    let lo = 0, hi = 1;
    for (let k = 0; k < 18; k++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      _ep.lerpVectors(p0, p1, m1); const f1 = A.distanceTo(_ep) + _ep.distanceTo(B);
      _ep.lerpVectors(p0, p1, m2); const f2 = A.distanceTo(_ep) + _ep.distanceTo(B);
      if (f1 < f2) hi = m2; else lo = m1;
    }
    out.push(new THREE.Vector3().lerpVectors(p0, p1, (lo + hi) / 2).addScaledVector(outward, WRAP_MARGIN));
  };
  if (c.type === 'box') {
    const ax = [c.ax, c.ay, c.az], h = [c.hx, c.hy, c.hz];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, k = (i + 2) % 3;
      for (const sj of [-1, 1]) for (const sk of [-1, 1]) {
        const mid = c.c.clone().addScaledVector(ax[j], sj * h[j]).addScaledVector(ax[k], sk * h[k]);
        const p0 = mid.clone().addScaledVector(ax[i], -h[i]), p1 = mid.clone().addScaledVector(ax[i], h[i]);
        along(p0, p1, _v2.copy(ax[j]).multiplyScalar(sj).addScaledVector(ax[k], sk).normalize());
      }
    }
    return out;
  }
  const axis = c.type === 'cyl' ? c.axis : _fd.subVectors(B, A).normalize();
  _e1.set(1, 0, 0); if (Math.abs(axis.x) > 0.9) _e1.set(0, 1, 0);
  _e1.cross(axis).normalize();
  _e2.crossVectors(axis, _e1);
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8;
    const rad = new THREE.Vector3().addScaledVector(_e1, Math.cos(a)).addScaledVector(_e2, Math.sin(a));
    if (c.type === 'cyl') {
      const p0 = c.c.clone().addScaledVector(axis, c.y0).addScaledVector(rad, c.r), p1 = c.c.clone().addScaledVector(axis, c.y1).addScaledVector(rad, c.r);
      along(p0, p1, rad); // side
      out.push(p0.clone().addScaledVector(_v2.copy(rad).addScaledVector(axis, -1).normalize(), WRAP_MARGIN)); // the two rims
      out.push(p1.clone().addScaledVector(_v2.copy(rad).addScaledVector(axis, 1).normalize(), WRAP_MARGIN));
    } else out.push(c.c.clone().addScaledVector(rad, c.r + WRAP_MARGIN));
  }
  return out;
}

// Round structures get an arc, not pegs: tangent from A, the short way round just off the surface, tangent to B. Returns
// the points between A and B (exclusive). A cylinder wraps across its axis (climbing evenly along it); a sphere in the
// plane through its centre, A and B.
const TAU = Math.PI * 2;
const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3(), _a4 = new THREE.Vector3();
function arcPoints(c, A, B) {
  const r = c.r, R = r + Math.min(1.2, Math.max(WRAP_MARGIN, 0.06 * r)), O = c.c;
  const a = _a1;
  if (c.type === 'cyl') a.copy(c.axis);
  else { a.subVectors(A, O).cross(_a2.subVectors(B, O)); if (a.lengthSq() < 1e-6) return null; a.normalize(); }
  const hA = _a2.subVectors(A, O).dot(a), hB = _a3.subVectors(B, O).dot(a);
  const vA = _a2.subVectors(A, O).addScaledVector(a, -hA);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  if (vA.lengthSq() < 1e-6) { e1.set(1, 0, 0); if (Math.abs(a.x) > 0.9) e1.set(0, 1, 0); e1.cross(a).normalize(); } else e1.copy(vA).normalize();
  e2.crossVectors(a, e1);
  const dA = vA.length();
  const vB = _a4.subVectors(B, O).addScaledVector(a, -hB);
  const xB = vB.dot(e1), yB = vB.dot(e2), dB = Math.hypot(xB, yB), thB = Math.atan2(yB, xB);
  const alpha = dA > R ? Math.acos(R / dA) : 0, tA = dA > R ? Math.sqrt(dA * dA - R * R) : 0;
  const beta = dB > R ? Math.acos(R / dB) : 0, tB = dB > R ? Math.sqrt(dB * dB - R * R) : 0;
  const mod = (x) => ((x % TAU) + TAU) % TAU;
  const d1 = mod((thB - beta) - alpha);      // counter-clockwise
  const d2 = mod(-alpha - (thB + beta));     // clockwise
  const dir = d1 <= d2 ? 1 : -1, delta = dir > 0 ? d1 : d2, s0 = dir * alpha;
  const step = Math.min(Math.PI / 6, 1.8 * Math.acos(r / R)); // small enough that chords stay outside the surface
  const n = Math.max(1, Math.ceil(delta / step));
  const total = tA + R * delta + tB || 1;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const ang = s0 + dir * delta * k / n, h = hA + (hB - hA) * ((tA + R * delta * k / n) / total);
    out.push(new THREE.Vector3().copy(O).addScaledVector(a, h).addScaledVector(e1, Math.cos(ang) * R).addScaledVector(e2, Math.sin(ang) * R));
  }
  return out;
}

export class Winch {
  constructor(game) {
    this.game = game;
    this.on = null; // { target, off, len, t, reel, dist }
    this.cd = 0;
    this.cand = null; // what E would hook now
    this.pickT = 0;
    this.pts = Array.from({ length: SEG_MAX + 1 }, () => new THREE.Vector3());
    this.old = Array.from({ length: SEG_MAX + 1 }, () => new THREE.Vector3());
    this.path = Array.from({ length: WRAP_PTS + 2 }, () => new THREE.Vector3()); // hand, wrap points, hook (rebuilt per frame)
    this.pathN = 0;
    this.poly = Array.from({ length: WRAP_PTS + 2 }, () => new THREE.Vector3()); // same, ending at the grapple's eye (drawn)
    this.pin = [0, SEG]; // cable points sitting on a wrap point or an end
    this.pinned = new Uint8Array(SEG_MAX + 1);
    this.restSeg = new Float32Array(SEG_MAX);
    this.nseg = SEG;
    this.ropeDirty = true;
    this.legs = [];
    this.strand = null; // the cable: one instance per metre of winch.glb's twisted strand, once loaded
    this.tracer = null;
    this.hook = new THREE.Group(); // the grapple is added when winch.glb loads
    this.hook.visible = false;
    game.scene.add(this.hook);
    loadParts().then((P) => {
      this.hook.add(P.hook.clone());
      const mk = (geo, color) => {
        const im = new THREE.InstancedMesh(geo, toon(color), MAX_PIECES);
        im.count = 0;
        im.frustumCulled = false;
        im.visible = false;
        game.scene.add(im);
        return im;
      };
      this.strand = mk(P.strand, SLOT.steel);
      this.tracer = mk(P.tracer, SLOT.tracer);
    }).catch((e) => console.warn('winch.glb:', e));
    this.markEl = null;
    this.markTxt = '';
    this.tick = 0;
  }

  get owned() { return (this.game.upgrades.winch || 0) > 0; }

  // Everything hookable in reach (traffic, crawlers, rovers of any side), each as a target with model, velocity and push.
  targets() {
    const g = this.game;
    const P = g.player;
    const out = [];
    const tr = g.world.traffic;
    const near = (p) => p.distanceToSquared(P.pos) < (RANGE + 25) * (RANGE + 25);
    // land-train trailers are targets of their own; pulling one pulls the whole train
    const traffic = (v, t = null) => ({
      obj: t || v, mass: massOf(v), flying: !v.piece && !v.offroad && !!v.path, root: t ? t.root : v.root,
      pos: () => (t ? t.plat.pos : v.pos),
      vel: () => (t ? t.plat.vel : v.vel),
      alive: () => v.root.visible && v.state !== 'dead' && v.state !== 'wreck' && !(v.captured > 0),
      push: (J) => { v.tug ||= new THREE.Vector3(); v.tugVel ||= new THREE.Vector3(); v.tugVel.addScaledVector(J, 1 / massOf(v)); },
      shift: (d) => { v.tug ||= new THREE.Vector3(); v.tugVel ||= new THREE.Vector3(); v.tug.add(d); },
    });
    if (tr) {
      for (const v of tr.vehicles) {
        if (!v.root || !v.root.visible || v.state === 'dead') continue;
        if (near(v.pos)) out.push(traffic(v));
        if (v.trailers) for (const t of v.trailers) if (t.root && t.root.visible && near(t.plat.pos)) out.push(traffic(v, t));
      }
      for (const c of tr.crawlers || []) if (c.root && c.root.visible && near(c.pos)) out.push(traffic(c));
    }
    // rovers of every side (pirates, patrols, allies, bosses, Kade's truck)
    for (const e of g.enemies.list) {
      if (e.dead || !e.body || !(e.kind === 'rover' || e.kind === 'milrover' || e.kind === 'kade') || !near(e.body.pos)) continue;
      const m = e.kind === 'kade' ? 9 : e.bossName ? 10 : 3.5;
      out.push({
        obj: e, mass: m, flying: false, root: e.model && e.model.root,
        pos: () => e.body.pos, vel: () => e.body.vel, alive: () => !e.dead,
        push: (J) => { e.body.vel.addScaledVector(J, 1 / m); e.body.grounded = false; },
        shift: (d) => e.body.pos.add(d),
      });
    }
    // SAT-7 in low orbit: an anchor that doesn't budge
    const S = g.secrets && g.secrets.sat;
    if (S && S.root && S.root.visible !== false && near(S.pos)) {
      out.push({ obj: { kind: 'sat7' }, mass: 1e6, flying: true, root: S.root, pos: () => S.pos, vel: () => S.vel, alive: () => true, push: () => {}, shift: () => {} });
    }
    return out;
  }

  // a structure's collider as a target: it never moves
  structure(c) {
    return { obj: { kind: 'structure' }, col: c, mass: 1e6, flying: false, root: null, pos: () => c.mid, vel: () => ZERO, alive: () => true, push: () => {}, shift: () => {} };
  }

  // A hook point and normal on target T, kept in its model's frame (a structure: offset from its middle) so the hook rides
  // the vehicle however it bobs, banks or is dragged.
  handle(T, point, nrm, looked, dist) {
    let off, n;
    if (T.root) { _rinv.copy(T.root.matrixWorld).invert(); off = point.clone().applyMatrix4(_rinv); n = nrm.clone().transformDirection(_rinv); } // in the pose it was found in
    else { off = point.clone().sub(T.pos()); n = nrm.clone(); }
    return { target: T, off, goal: off.clone(), nrm: n, looked, dist, len: dist, t: 0, reel: 0, wraps: [], free: [], grp: [], ignore: new Set(), bends: new Map(), strain: 0, creakT: 0 };
  }

  // where a handle's hook point is now
  anchorOf(h, out) {
    const T = h.target;
    if (T.root) return T.root.localToWorld(out.copy(h.off));
    return out.copy(h.off).add(T.pos());
  }

  // the surface normal there now
  normalOf(h, out) {
    out.copy(h.nrm);
    if (h.target.root) out.applyQuaternion(h.target.root.getWorldQuaternion(_q));
    return out.normalize();
  }

  // What E would hook: the nearest surface under the reticle, else whatever is closest to it (nearer wins a near tie).
  // Vehicles and structures compete alike; the best of the top few that's actually visible wins.
  pick() {
    const g = this.game;
    const P = g.player;
    const eye = g.camera.position;
    const look = g.camera.getWorldDirection(_look);
    const prev = this.cand && this.cand.target; // the current mark keeps a lead (no flicker between two)
    const best = []; // top four, best first
    const offer = (T, col, looked, nrm) => {
      const dP = P.center.distanceTo(_pt);
      if (dP > RANGE || dP < MIN_GAP) return;
      _to.copy(_pt).sub(eye);
      const dE = _to.length() || 1e-6;
      const cos = _to.divideScalar(dE).dot(look);
      if (cos < MIN_COS) return;
      // Under the reticle beats everything else (nearest first). Off it, score by angle off the reticle (same cost near
      // or far), distance only a tiebreak: 5 degrees off beats a closer target 10 degrees off.
      const sticky = prev && (col ? prev.col === col : T.obj === prev.obj) ? 0.6 : 0;
      const score = looked ? 10 - dP / RANGE + sticky : 6 - Math.acos(Math.min(1, cos)) * AIM_W - dP / RANGE * 0.3 + sticky;
      if (best.length >= 4 && score <= best[3].score) return;
      best.push({ T, col, looked, dP, score, point: _pt.clone(), nrm: nrm.clone() });
      best.sort((p, q) => q.score - p.score);
      if (best.length > 4) best.pop();
    };
    for (const T of this.targets()) {
      if (!T.alive()) continue;
      if (T.root) {
        const hit = modelHit(T.root, eye, look);
        if (hit) { _pt.copy(hit.point); offer(T, null, hit.looked, hit.nrm); }
      } else { _pt.copy(T.pos()); offer(T, null, false, _nv.copy(eye).sub(_pt).normalize()); }
    }
    for (const c of g.colliders.query(P.pos, RANGE + 20, _cols)) {
      if (c.platform || c.br < MIN_STRUCT_R) continue;
      if (c.mid.distanceTo(P.pos) - c.br > RANGE) continue;
      const t = rayCollider(c, eye, look, RANGE + 80);
      const looked = t < Infinity;
      if (looked) { _pt.copy(look).multiplyScalar(t).add(eye); colliderPoint(c, _pt, _wp, _nv); _nv.normalize(); } else {
        // surface spot nearest the reticle line (not the eye: for a tower that's its foot, nowhere near your aim)
        let u = Math.min(Math.max(_wp.copy(c.mid).sub(eye).dot(look), 0), RANGE + 80);
        for (let i = 0; i < 4; i++) {
          colliderPoint(c, _wp.copy(look).multiplyScalar(u).add(eye), _pt, _nv);
          u = Math.min(Math.max(_wp.copy(_pt).sub(eye).dot(look), 0), RANGE + 80);
        }
      }
      offer(null, c, looked, _nv);
    }
    for (const b of best) {
      // sightline must be clear of all but the target, whose own hull boxes are ignored; except when you stand on that ship,
      // where its tower between you and the hook is in the way (the reel would drag you into it)
      const plat = b.T ? b.T.obj.plat || b.T.obj : null;
      if (!g.enemies.clearShot(eye, b.point, plat && P.body.platform === plat ? null : plat)) continue;
      return this.handle(b.T || this.structure(b.col), b.point, b.nrm, b.looked, b.dP);
    }
    return null;
  }

  hasHand() {
    const P = this.game.player;
    return !(P.dead || P.vehicle || P.seat || P.rag) && this.game.state === 'play';
  }

  // E with the winch selected and the cable off (powers.js: with it on, E releases)
  fire() {
    const g = this.game;
    if (this.on || this.cd > 0 || !this.hasHand()) return;
    let h = this.cand && this.cand.target.alive() ? this.cand : null; // exactly what the marker is on
    if (h && this.hand(_a).distanceTo(this.anchorOf(h, _b)) > RANGE + 5) h = null;
    h = h || this.pick();
    if (!h) {
      g.hud.toast(`Hitch-Line: nothing in reach. Aim at a vehicle or a structure within ${RANGE} m.`, 1.6);
      g.audio.tone(220, 0.12, 'square', 0.06, 0.7);
      return;
    }
    const anchor = this.anchorOf(h, _b);
    const hand = this.hand(_a);
    h.len = hand.distanceTo(anchor); // as long as the gap: taut from the start
    h.dist = h.len;
    this.on = h;
    this.cand = null;
    this.tick = h.len;
    for (let i = 0; i <= SEG; i++) { this.pts[i].lerpVectors(hand, anchor, i / SEG); this.old[i].copy(this.pts[i]); }
    this.ropeDirty = true; this.nseg = SEG; this.curve = null;
    g.fx.pop('HITCHED!', null, { color: '#ff9f1c', size: 46, life: 0.7 });
    g.audio.burst(0.12, 3000, 0.25);
    g.audio.tone(380, 0.25, 'sawtooth', 0.08, 2.2);
  }

  release(quiet = false) {
    if (!this.on) return;
    this.on = null;
    this.cd = 1.5;
    this.hook.visible = false;
    if (this.strand) this.strand.visible = this.tracer.visible = false;
    if (!quiet) this.game.audio.tone(900, 0.06, 'square', 0.06, 0.5);
  }

  hand(out) { const P = this.game.player; return out.copy(P.center).addScaledVector(P.up, 0.4); }

  // the cable's path into this.path (hand, wrap points, hook), its point count into pathN. pathLen(): its length
  buildPath(o, hand, anchor) {
    const P = this.path;
    P[0].copy(hand);
    for (let i = 0; i < o.wraps.length; i++) P[i + 1].copy(o.wraps[i]);
    const k = o.wraps.length + 1;
    P[k].copy(anchor);
    this.pathN = k + 1;
  }

  pathLen() {
    let L = 0;
    for (let i = 0; i < this.pathN - 1; i++) L += this.path[i].distanceTo(this.path[i + 1]);
    return L;
  }

  // Per frame: drop bends the cable has straightened past, bend it round structures it hits (box edge, or arc for a
  // cylinder or sphere). Returns 'changed' or null. A structure it can't bend round (no free spot, over the cap, still in
  // the way after a bend or two) is given up on and passed through.
  tendWraps(o, el) {
    try { return this.tendWrapsIn(o, el); } finally { _ignore = null; }
  }

  tendWrapsIn(o, el) {
    const cols = this.game.colliders, P = this.path, n = o.wraps.length;
    _ignore = o.ignore;
    // letting go: only the ends of a run of bends on one structure (it holds an arc's middle). Right up at the bend a clear
    // line is enough; otherwise it needs room to spare
    for (let k = n - 1; k >= 0; k--) {
      if (!(k === 0 || k === n - 1 || o.grp[k - 1] !== o.grp[k] || o.grp[k + 1] !== o.grp[k])) continue;
      const fat = Math.min(P[k].distanceTo(P[k + 1]), P[k + 1].distanceTo(P[k + 2])) < 2.5 ? 0.1 : UNWRAP_FAT;
      if (clearFat(cols, P[k], P[k + 2], fat, k === n - 1 ? 3 : 0.35)) { // hook end: a shallow line grazes the hook's own surface
        o.free[k] += el; // frame time, credited once (repeat passes in a frame get el = 0)
        if (o.free[k] >= UNWRAP_HOLD) {
          o.wraps.splice(k, 1); o.free.splice(k, 1); o.grp.splice(k, 1); this.ropeDirty = true;
          this.buildPath(o, _hA.copy(P[0]), _hB.copy(P[this.pathN - 1])); // the next step reads the rebuilt path
          return 'changed';
        }
      } else o.free[k] = 0;
    }
    // bending: check each leg, bar chords within one arc (they can't be blocked by what they hug)
    for (let i = 0; i < this.pathN - 1; i++) {
      if (i >= 1 && i <= n - 1 && o.grp[i - 1] === o.grp[i]) continue;
      // the hook's leg forgives its last 2.5 m, as targeting does (a ledge overlapping the hooked wall isn't in the way)
      const hit = blocker(cols, P[i], P[i + 1], 0.35, null, i === this.pathN - 2 ? 2.5 : 0.35);
      if (!hit) continue;
      // a box counts the bends it holds now (a post can take a few laps, four corners each; unwinding frees room); a
      // cylinder or sphere counts arcs laid over the whole ride. Over the cap: passed through.
      const box = hit.c.type === 'box';
      const bends = box ? o.grp.reduce((n, q) => n + (q === hit.c), 0) : o.bends.get(hit.c) || 0;
      if ((!o.grp.includes(hit.c) && new Set(o.grp).size >= WRAP_MAX) || bends >= (box ? BOX_BENDS : 2)) { o.ignore.add(hit.c); continue; }
      const A = P[i], B = P[i + 1];
      const before = this.pathLen();
      let pts = hit.c.type === 'cyl' || hit.c.type === 'sphere' ? arcPoints(hit.c, A, B) : null;
      if (pts && !pts.every((q) => pointFree(cols, q))) pts = null; // arc runs through something else: try the edges
      // nor an arc that still hits what it wraps (no bend; with the hook buried in it, arcs would pile up)
      if (pts && (blocker(cols, A, pts[0], 0.35, hit.c) || blocker(cols, pts[pts.length - 1], B, 0.35, hit.c, i === this.pathN - 2 ? 2.5 : 0.35))) pts = null;
      if (!pts) {
        let best = null, bs = -Infinity;
        for (const p of wrapCandidates(hit.c, A, B)) {
          if (p.distanceTo(A) < 0.8 || p.distanceTo(B) < 0.8) continue;
          const clear = (blocker(cols, A, p, 0.35, hit.c) ? 0 : 1) + (blocker(cols, p, B, 0.35, hit.c) ? 0 : 1);
          if (!pointFree(cols, p)) continue; // must be in the open, or you could never reach it
          const score = clear * 1000 - (A.distanceTo(p) + p.distanceTo(B)); // clear legs first, then the shortest way round
          if (score > bs) { bs = score; best = p; }
        }
        pts = best ? [best] : null;
      }
      if (!pts || n + pts.length > WRAP_PTS) { o.ignore.add(hit.c); continue; }
      o.bends.set(hit.c, bends + 1);
      o.wraps.splice(i, 0, ...pts);
      o.free.splice(i, 0, ...pts.map(() => 0));
      o.grp.splice(i, 0, ...pts.map(() => hit.c));
      this.ropeDirty = true;
      this.buildPath(o, _hA.copy(P[0]), _hB.copy(P[this.pathN - 1])); // copies: the rebuild overwrites what it reads
      o.len += Math.max(0, this.pathLen() - before); // pay out the extra so a new wrap doesn't jerk you
      return 'changed';
    }
    return null;
  }

  // The bend nearest you, every frame with no hold: once you're at it and the line past it is clear, let it go at once
  // (a hold here leaves the cable running past a passed corner, drawing you back: a jerk round every corner).
  releaseFirst(o) {
    if (!o.wraps.length || this.pathN < 3) return;
    const P = this.path;
    if (P[0].distanceTo(P[1]) >= 2.5) return;
    _ignore = o.ignore;
    try {
      if (clearFat(this.game.colliders, P[0], P[2], 0.1, o.wraps.length === 1 ? 3 : 0.35)) {
        o.wraps.splice(0, 1); o.free.splice(0, 1); o.grp.splice(0, 1);
        this.ropeDirty = true;
        this.buildPath(o, _hA.copy(P[0]), _hB.copy(P[this.pathN - 1]));
      }
    } finally { _ignore = null; }
  }

  // per frame, after the player moves: reel in, pull when taut
  update(dt, usable) {
    const g = this.game;
    const P = g.player;
    if (this.cd > 0) this.cd -= dt;
    const equipped = this.owned && g.powers && g.powers.current() === 'winch' && this.hasHand();
    if (equipped && !this.on) {
      if ((this.pickT -= dt) <= 0) {
        this.pickT = PICK_EVERY;
        const old = this.cand, nc = this.pick();
        // same target: ease the hook point to the new spot
        if (nc && old && (nc.target.col ? nc.target.col === old.target.col : nc.target.obj === old.target.obj)) { nc.goal.copy(nc.off); nc.off.copy(old.off); }
        this.cand = nc;
      }
      if (this.cand) this.cand.off.lerp(this.cand.goal, 1 - Math.exp(-dt * 12));
    } else { this.cand = null; this.pickT = 0; }
    this.drawMarker(equipped);
    const o = this.on;
    if (!o) return;
    o.t += dt;
    const T = o.target;
    if (!usable || o.t > HOLD || !this.hasHand() || !T.alive()) { this.release(); return; }
    this.buildPath(o, this.hand(_a), this.anchorOf(o, _b));
    // wraps checked every frame (a slower rate lets the cable run through a post you sprint at). el = frame time, so the
    // unwrap hold counts real time once. A frame may need several passes (a post and the edge it overlaps). Pairs with the
    // position step along the real legs below.
    let r = this.tendWraps(o, dt);
    for (let it = 1; r && it < WRAP_STEPS; it++) r = this.tendWraps(o, 0);
    this.releaseFirst(o);
    const nP = this.pathN;
    let len = this.pathLen();
    if (len > RANGE * 1.6) { this.release(); g.hud.toast('The line snapped!', 1.5); return; }
    // you are pulled along the first leg, the hook along the last (with no wraps: one line, opposite ways)
    const P0 = this.path[0], P1 = this.path[1], Pn = this.path[nP - 1], Pm = this.path[nP - 2];
    _up.subVectors(P1, P0); if (_up.lengthSq() > 1e-8) _up.normalize();
    _ut.subVectors(Pm, Pn); if (_ut.lengthSq() > 1e-8) _ut.normalize();
    _gUp.copy(_up); _gUt.copy(_ut);
    // pull directions jump when a bend comes or goes, so ease them (~80 ms) to swing round corners. The eased copies drive
    // pull and velocity only; the position step uses the real legs (the eased one can lag a quarter turn and would
    // lengthen the path)
    if (!o.dirP) { o.dirP = _up.clone(); o.dirT = _ut.clone(); }
    else {
      const sm = 1 - Math.exp(-dt * 12);
      o.dirP.lerp(_up, sm); if (o.dirP.lengthSq() < 1e-6) o.dirP.copy(_up); else o.dirP.normalize();
      o.dirT.lerp(_ut, sm); if (o.dirT.lengthSq() < 1e-6) o.dirT.copy(_ut); else o.dirT.normalize();
      _up.copy(o.dirP); _ut.copy(o.dirT);
    }

    o.len = Math.min(o.len, Math.max(REST, len + 0.1)); // ratchet: never longer than the path
    const closeNow = P.vel.dot(_up) + T.vel().dot(_ut); // closing speed of the ends along the cable
    // the drum: spools up, runs steady, eases to a stop at REST
    const remain = o.len - REST;
    if (remain > 0.02) {
      const want = Math.min(REEL_MAX, Math.sqrt(2 * REEL_DEC * 0.6 * remain) + 0.4); // braking curve, slow creep at the end
      o.reel += Math.max(-REEL_DEC * 2.5 * dt, Math.min(REEL_ACC * dt, want - o.reel)); // spools up slower than it winds down
      o.len = Math.min(o.len, Math.max(REST, o.len - o.reel * dt, len - LEAD));
      // a bounded tug each frame brings you up to drum speed (and stops you overshooting it)
      const closing = closeNow;
      if (closing < o.reel) {
        const yank = 1 + YANK * Math.min(1, o.strain / YANK_FULL); // straining: the pull builds to yank you free
        const dv = Math.min(o.reel - closing, PULL_ACC * yank * dt);
        P.vel.addScaledVector(_up, dv);
        T.push(_a.copy(_ut).multiplyScalar(dv)); // the reaction (a building takes none)
      } else if (closing > o.reel + 0.4) {
        P.vel.addScaledVector(_up, -Math.min(closing - o.reel, PULL_ACC * dt));
      }
      // ratchet tick per metre taken in
      if (this.tick - o.len > 1.5) { this.tick = o.len; g.audio.tone(170 + Math.min(o.reel, REEL_MAX) * 5, 0.03, 'square', 0.035, 1); }
    } else {
      if (o.reel > 0) { o.reel = 0; g.audio.tone(120, 0.12, 'square', 0.07, 0.6); } // clunk as the drum locks
      // arrival: shed leftover inward speed so you stop short of the hook
      if (closeNow > 0.05 && len < REST + 1.5) P.vel.addScaledVector(_up, -Math.min(closeNow, PULL_ACC * dt));
    }

    // strain: drum running but you aren't coming in (blocked, or the target won't budge). Creaks rising, then the line slips
    if (o.reel > 0.5 && len - o.len > LEAD * 0.5 && closeNow < 1) o.strain = Math.min(STRAIN_MAX, o.strain + dt);
    else o.strain = Math.max(0, o.strain - dt * 1.5);
    if (o.strain > 0.3 && (o.creakT -= dt) <= 0) { o.creakT = 0.28; g.audio.tone(170 + (o.strain / STRAIN_MAX) * 260, 0.1, 'sawtooth', 0.03 + 0.03 * (o.strain / STRAIN_MAX), 1.4); }
    // while straining, a growing sideways wiggle and lift so a player wedged on a wall or corner slides free
    if (o.strain > 0.25) {
      const k = o.strain / STRAIN_MAX;
      _lat.crossVectors(_up, upAt(P.pos, _upv));
      if (_lat.lengthSq() > 1e-6) {
        _lat.normalize();
        P.vel.addScaledVector(_lat, Math.sin(o.t * 6) * (6 + 12 * k) * dt);
        P.vel.addScaledVector(_upv, (3 + 6 * k) * dt);
      }
    }
    if (o.strain >= STRAIN_MAX) { this.release(); g.hud.toast('The line slipped!', 1.5); g.audio.tone(300, 0.18, 'square', 0.07, 0.4); return; }

    if (len > o.len && len > 1e-3) {
      const mP = 1, mT = T.mass;
      const share = mT / (mP + mT); // you take most of the correction
      // positions: back to the cable's length
      const over = len - o.len;
      const ease = 1 - Math.exp(-dt * 20); // over a few frames (a one-frame snap of up to LEAD visibly jumps)
      // along the real legs, never past the bend: the path shortens by exactly the step (pairs with the every-frame wrap check)
      const sP = Math.min(over * share * ease, Math.max(0, P0.distanceTo(P1) - 0.05));
      const sT = Math.min(over * (1 - share) * ease, Math.max(0, Pn.distanceTo(Pm) - 0.05));
      P.body.pos.addScaledVector(_gUp, sP);
      T.shift(_d.copy(_gUt).multiplyScalar(sT));
      // velocities: no separating along the cable (swing, tow and drag all come from this)
      const rel = -(P.vel.dot(_up) + T.vel().dot(_ut));
      if (rel > 0) {
        const j = rel / (1 / mP + 1 / mT) * (1 - Math.exp(-dt * 60)); // most of it each frame, not all at once
        P.vel.addScaledVector(_up, j / mP);
        T.push(_d.copy(_ut).multiplyScalar(j));
      }
      // taut: lift you off the ground so it can swing you
      if (_up.dot(upAt(P.pos)) > 0.3) { P.body.grounded = false; P.body.sinceContact = 1; }
      if (o.reel === 0 && Math.random() < dt * 3) g.audio.tone(140 + Math.random() * 60, 0.08, 'sawtooth', 0.025, 1.3); // the cable creaks
    }
    o.dist = len;
    this.buildPath(o, this.hand(_a), this.anchorOf(o, _b));
    this.drawRope(dt, o.len, this.normalOf(o, _nn));
  }

  // Verlet cable from hand through the wrap points to the hook: straight when taut, a stiff steel hang when slack. Wrap
  // points are pins; each stretch between pins is a rope of its own.
  drawRope(dt, len, nrm = null) {
    const pts = this.pts, old = this.old, path = this.path, poly = this.poly;
    const k = this.pathN - 1;
    const up = upAt(path[0], _upv);
    const hookEnd = path[k]; // surface point the claw is driven into along the normal
    const N = (nrm ? _hn.copy(nrm) : _hn.copy(path[k - 1]).sub(hookEnd)).normalize();
    for (let i = 0; i < k; i++) poly[i].copy(path[i]);
    poly[k].copy(hookEnd).addScaledVector(N, EYE_OUT - EMBED); // cable ends at the eye
    const legs = this.legs;
    legs.length = 0;
    let total = 0;
    for (let i = 0; i < k; i++) { const l = poly[i].distanceTo(poly[i + 1]); legs.push(l); total += l; }
    // more points for more bends
    const nseg = Math.min(SEG_MAX, Math.max(SEG, 3 * k));
    // which points sit on pins: re-laid whenever the wraps change
    if (this.ropeDirty || this.pin.length !== k + 1 || nseg !== this.nseg) {
      this.nseg = nseg;
      this.curve = null;
      const pin = [0];
      let used = 0;
      for (let i = 0; i < k - 1; i++) {
        const left = k - 1 - i; // legs still to place after this one
        const want = Math.round(nseg * legs[i] / (total || 1));
        const n = Math.max(1, Math.min(want, nseg - used - left));
        used += n;
        pin.push(used);
      }
      pin.push(nseg);
      this.pin = pin;
      this.pinned.fill(0);
      for (const p of pin) this.pinned[p] = 1;
      for (let m = 0; m < k; m++) for (let i = pin[m]; i <= pin[m + 1]; i++) { pts[i].lerpVectors(poly[m], poly[m + 1], (i - pin[m]) / (pin[m + 1] - pin[m])); old[i].copy(pts[i]); }
      this.ropeDirty = false;
    }
    const pin = this.pin, pinned = this.pinned;
    // each stretch: its leg's length plus its share of slack
    const slack = Math.max(1, (len - (EYE_OUT - EMBED)) / (total || 1));
    for (let m = 0; m < k; m++) { const r = legs[m] * slack / (pin[m + 1] - pin[m]); for (let i = pin[m]; i < pin[m + 1]; i++) this.restSeg[i] = r; }
    const gdt = 3.5 * dt * dt;
    for (let i = 1; i < nseg; i++) {
      if (pinned[i]) continue;
      const p = pts[i], q = old[i];
      const vx = (p.x - q.x) * 0.9, vy = (p.y - q.y) * 0.9, vz = (p.z - q.z) * 0.9;
      q.copy(p);
      p.x += vx - up.x * gdt; p.y += vy - up.y * gdt; p.z += vz - up.z * gdt;
    }
    for (let m = 0; m <= k; m++) pts[pin[m]].copy(poly[m]);
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < nseg; i++) {
        const p = pts[i], q = pts[i + 1];
        _d.subVectors(q, p);
        const l = _d.length() || 1e-6;
        const kk = (l - this.restSeg[i]) / l;
        if (pinned[i] && pinned[i + 1]) continue;
        if (pinned[i]) q.addScaledVector(_d, -kk);
        else if (pinned[i + 1]) p.addScaledVector(_d, kk);
        else { p.addScaledVector(_d, kk * 0.5); q.addScaledVector(_d, -kk * 0.5); }
      }
      // stiffness: ease each point toward the line through its neighbours
      for (let i = 1; i < nseg; i++) if (!pinned[i]) pts[i].lerp(_d.addVectors(pts[i - 1], pts[i + 1]).multiplyScalar(0.5), 0.2);
      for (let m = 0; m <= k; m++) pts[pin[m]].copy(poly[m]);
    }
    this.hook.visible = true;
    this.hook.position.copy(hookEnd).addScaledVector(N, -EMBED);
    this.hook.quaternion.setFromUnitVectors(_z, N); // claw into the surface, eye out along the normal
    if (!this.strand) return;
    // the cable model, one stretched metre-piece per step along the line. One curve kept over the same point objects
    // (just flagged as moved)
    const curve = this.curve ||= Object.assign(new THREE.CatmullRomCurve3(pts.slice(0, this.nseg + 1)), { arcLengthDivisions: 100 });
    curve.needsUpdate = true;
    const n = Math.min(MAX_PIECES, Math.max(1, Math.round(curve.getLength())));
    let p0 = curve.getPointAt(0, _a), p1 = _b;
    for (let i = 0; i < n; i++) {
      curve.getPointAt((i + 1) / n, p1);
      _dir.subVectors(p1, p0);
      const l = _dir.length() || 1e-6;
      _q.setFromUnitVectors(_z, _dir.divideScalar(l));
      _m.compose(p0, _q, _s.set(1, 1, l));
      this.strand.setMatrixAt(i, _m);
      this.tracer.setMatrixAt(i, _m);
      p0.copy(p1);
    }
    this.strand.count = this.tracer.count = n;
    this.strand.instanceMatrix.needsUpdate = this.tracer.instanceMatrix.needsUpdate = true;
    this.strand.visible = this.tracer.visible = true;
  }

  // Tow-line marker: a faint HUD bracket where E would hook (brighter under the reticle); once hooked, at the hook with
  // the distance left.
  drawMarker(equipped) {
    const g = this.game;
    const h = this.on || (equipped ? this.cand : null);
    let el = this.markEl;
    if (!h || !h.target.alive()) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = this.markEl = document.createElement('div');
      el.id = 'towmark';
      el.innerHTML = '<i></i><span></span>'; // bracket is a Blender render, tinted by a CSS mask
      el.style.setProperty('--tm', `url(${markUrl})`);
      document.getElementById('hud').appendChild(el);
    }
    this.anchorOf(h, _pt);
    const v = _to.copy(_pt).project(g.camera);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { el.classList.add('hidden'); return; }
    const W = window.innerWidth, H = window.innerHeight;
    el.classList.remove('hidden');
    el.classList.toggle('looked', !!h.looked && !this.on);
    el.classList.toggle('hooked', !!this.on);
    el.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -50%)`;
    const m = Math.round(g.player.center.distanceTo(_pt));
    if (m !== this.markTxt) { this.markTxt = m; el.querySelector('span').textContent = `${m} m`; }
  }

  // the E chip's line
  status() {
    if (this.on) return this.on.strain > 0.4 ? 'LINE STRAINING' : this.on.reel > 0 ? `REELING ${Math.round(this.on.dist)} m` : `HITCHED ${Math.ceil(HOLD - this.on.t)} s`;
    if (this.cd > 0) return `${Math.ceil(this.cd)} s`;
    const equipped = this.game.powers && this.game.powers.current() === 'winch';
    const c = equipped ? this.cand : this.hasHand() ? this.pick() : null; // the power wheel asks when not equipped
    return c ? 'TARGET IN REACH' : 'NO TARGET';
  }
}

// winch.glb (tools/blender/build_winch.py): grapple and a metre of cable, loaded once
let partsP = null;
function loadParts() {
  return partsP ||= import('./assets/winch.glb?inline').then(async (m) => {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(m.default);
    gltf.scene.updateMatrixWorld(true);
    const hook = gltf.scene.getObjectByName('winch_hook');
    const strand = gltf.scene.getObjectByName('winch_strand'), tracer = gltf.scene.getObjectByName('winch_tracer');
    if (!hook || !strand || !tracer) throw new Error('winch.glb is missing a part');
    hook.traverse((o) => { if (o.isMesh) o.material = toon(SLOT[o.material.name] ?? SLOT.steel); });
    const geo = (o) => o.geometry.clone().applyMatrix4(o.matrixWorld); // cable frame: a metre along +z
    return { hook, strand: geo(strand), tracer: geo(tracer) };
  });
}
