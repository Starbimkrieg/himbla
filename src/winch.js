// The Kepler Hitch-Line Winch (Kepler's unique upgrade, an active on E). Fire a steel cable onto a passing
// vehicle or a structure and let the drum reel you in: the pull builds up, runs at a steady speed and eases
// off to leave about two metres of cable between you and the hook. Hooked on a vehicle you then ride its pull:
// swing under a flying transit like a pendulum (momentum and all), or trail along behind a rover or a land-train.
// It stays on without holding anything, up to twenty seconds, until you press E again to let go.
//
// Targeting: with the winch equipped, a faint tow-line marker sits on whatever E would hook (hud: markerFor).
// Whatever the reticle is on wins (the nearest such surface); otherwise the target nearest the reticle. The hook
// bites the nearest surface of the thing, not its middle, and the cable is only as long as the gap.
//
// The cable is a cable, not a rod: it only pulls when it's taut, and when it is, the pull goes both
// ways, split by mass. A hover-car weighs a couple of you and goes where you drag it, well off the
// road; rovers (pirate rigs, patrols, allies, bosses) are a handful; a transit shuttle takes some
// hauling but still gives a few metres; freighters and land-trains barely notice, and a building (any
// structure's collider) doesn't budge at all. A traffic vehicle you've dragged off its route eases back onto
// it when you let go (traffic.js applyTug), and a rover's own driving takes it back. SAT-7 doesn't move
// at all: hook it and you go round with it.
//
// The cable bends round structures like a rope round pegs: every frame it checks each leg of its path for a structure in the
// way and, if there is one, bends round it: a box at the best point along its edges, a cylinder or sphere along an arc from tangent to tangent
// (a round tower is a chain of bend points, counted as one structure; up to WRAP_MAX structures). Slim things (a column, a rail) don't bend it,
// a bend point has to be out in the open, and what it can't be bent round it passes through; your own physics and the pull sort the rest out,
// and lets a bend go once the straight line past it has been clear, with room to spare, for a moment. You are pulled along the first
// leg and the hook along the last. If the drum is running and you are not coming in (something solid is in the way) the cable strains,
// creaking louder and higher while the pull builds to yank you free, and slips off after STRAIN_MAX seconds.
import * as THREE from 'three';
import { upAt } from './geo.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { rayCollider } from './physics.js';
import { toon } from './toon.js';
import markUrl from './assets/towmark.png?inline';

const RANGE = 120;       // how far the cable reaches
const HOLD = 20;         // seconds before the line lets go on its own
const SEG = 20;          // cable points (for the sag when it's slack); more when it has many bends to follow, up to SEG_MAX
const SEG_MAX = 56;
const REST = 2;          // metres of cable left between you and the hook when the reel has finished
const REEL_MAX = 18;     // m/s: the drum's top speed
const REEL_ACC = 6;      // m/s²: how gently the drum spools up
const REEL_DEC = 5;      // m/s²: and winds down, so it eases to a stop at REST
const PULL_ACC = 14;     // m/s²: the most the cable tugs you up to the drum's speed
const LEAD = 0.6;        // the drum never gets further than this ahead of you (so a blocked pull doesn't snap)
const PICK_EVERY = 0.1;  // seconds between targeting scans
const AIM_W = 12;        // targeting score lost per radian the target is off the reticle (distance counts for little beside it)
const MIN_COS = 0.35;    // how far off the reticle a target can be (cosine of the angle)
const MIN_GAP = 4;       // too close to hook
const MIN_STRUCT_R = 2.5; // (smaller colliders are props and rocks, not structures)
const EMBED = 0.42;      // how far the claw is driven into the surface it bites
const EYE_OUT = 1.08;    // the grapple's eye, this far back from its tip along the shank (the cable ends there)
const SLOT = { gold: 0xffd23f, steel: 0x9aa3b2, dark: 0x2a2540, tracer: 0xff9f1c }; // (the Kepler orange tracer strand is in every cable)
const WRAP_MAX = 5;      // the cable bends round at most this many different structures; it passes through any further ones
const WRAP_PTS = 40;     // ... and has at most this many bend points in all (a round structure takes a chain of them)
const BOX_BENDS = 12;    // bend points on one box at once (three laps round a post), then the cable passes through it
const WRAP_MIN_R = 4;    // (only structures this big, by bounding radius, bend it: boulders and props smaller than that don't)
const WRAP_STEPS = 4;    // wrap passes per frame, at most (a pass adds a bend or a whole arc, or lets one go)
const WRAP_MARGIN = 0.4; // a wrap point stands this far outside the corner it bends round
const UNWRAP_FAT = 0.5;  // a wrap lets go only when the straight line past it is clear with this much room to spare (so it can't flicker)
const UNWRAP_HOLD = 0.2; // ... and has been for this long
const STRAIN_MAX = 2.5;  // seconds the drum can strain against something that won't give before the line slips
const YANK = 2.5;        // ... while it strains the pull rises, up to this many times PULL_ACC more, to yank you free
const YANK_FULL = 1.2;   // ... reaching that after this many seconds of strain
const MAX_PIECES = Math.ceil(RANGE * 1.6) + 8; // (a metre of cable each, up to where the line snaps)

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
const _inv = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _cols = [];
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const _z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _hn = new THREE.Vector3();
const _nv = new THREE.Vector3();
const _nn = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const _up = new THREE.Vector3(); // (the way you are pulled along the cable)
const _ut = new THREE.Vector3(); // (the way the hook is)
const _gUp = new THREE.Vector3(); // (the first leg as it really lies: for the position correction)
const _gUt = new THREE.Vector3(); // (and the last leg)
const _upv = new THREE.Vector3();
const _hA = new THREE.Vector3(), _hB = new THREE.Vector3(), _lat = new THREE.Vector3();

// what's worth hooking, and how heavy it is
function massOf(v) {
  if (v.kind === 'ship') return 16;
  if (v.kind === 'bus') return 6; // (the little transit shuttles)
  if (v.kind === 'landtrain') return 14;
  if (v.kind === 'buggy') return 5; // (the crawler buggies)
  if (v.kind === 'car') return 2.6;
  return 6;
}

// ---- aiming at a model: its real meshes (not a box round them, which for a long hull with a boom and a gantry is mostly air) ----
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

// A model's solid meshes (not the shadow blob, the glow or the flames), and the height below which it's underside: the
// bottom third of its hull, so the hook goes on the body and not on whatever hangs beneath. Measured once, in its own frame.
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

// Where the sightline meets a model's surface; failing that, the spot on it nearest the reticle (snapped onto the surface).
// Fills `aim` (all in the pose last drawn, the meshes' own matrices being from the same pass) and returns it, or null.
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
    // (standing on a ship you are inside its big hull meshes' boxes, which tell nothing about where the sightline meets them:
    // those are tested triangle by triangle, below, so the deck under the reticle can be hooked and not just the parts round it)
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
  // the spot nearest the reticle: in from there toward the middle of that piece finds the surface under it
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

// the point on a structure's surface nearest to p (colliders: sphere, box or cylinder), and the surface's normal there
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
    _n.copy(_d).addScaledVector(a, -h); // (the radial part)
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
  for (let i = 0; i < 3; i++) { const ex = Math.abs(lp[i]) - h[i]; if (ex > best) { best = ex; k = i; } } // (the face it's nearest, or past most)
  const l = lp.map((v, i) => Math.max(-h[i], Math.min(h[i], v)));
  const sg = Math.sign(lp[k] || 1);
  if (best < 0) l[k] = sg * h[k]; // (from inside: out through that face)
  nOut.copy(axes[k]).multiplyScalar(sg);
  return out.copy(c.c).addScaledVector(c.ax, l[0]).addScaledVector(c.ay, l[1]).addScaledVector(c.az, l[2]);
}


// ---- wrapping: the cable bends round structures' corners like a rope round pegs ----
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fd = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _oa = new THREE.Vector3(), _ob = new THREE.Vector3(), _wq = [];
let _ws = 0;
let _ignore = null; // structures this cable has given up wrapping: it passes through them (set by tendWraps while it works)

// Too thin to bend a cable: a slim column, a rail, a post (judged by thickness, not height: a 14 m pillar is tall, not big). The
// cable passes such things; wrapping it round one only ties you in knots.
function thin(c) {
  if (c.type === 'cyl') return c.r < 1.6;
  if (c.type === 'sphere') return c.r < 2;
  return Math.min(c.hx, c.hy, c.hz) < 0.6;
}

// The nearest structure the straight line a->b runs into, as { c, t }, or null. The first and last `skip` metres don't count (the
// hook's own surface, a wall you are standing against), and a line that starts inside a collider isn't stopped by it. With `only`,
// just that collider is tested. Colliders sit in a 64 m grid and are filed under every cell their bounds touch, so a sample
// every 24 m along the line finds every one the line could meet.
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

// Is p out in the open (no structure within 0.3 m of it)? A bend point inside a wall is a point you can never be drawn to.
const _fq = [];
function pointFree(cols, p) {
  for (const c of cols.query(p, 1, _fq)) if (!c.platform && cols.contact(c, p, 0.3, _nv) > 0) return false;
  return true;
}

// Is the line a->b clear with `r` metres to spare on every side? (the centre line and four lines r off it). A line that ends on a wall
// at a shallow angle always grazes it near the end, so for the offset lines the last `endSkip` metres don't count.
function clearFat(cols, a, b, r, endSkip = 0.35) {
  if (blocker(cols, a, b)) return false;
  _e1.subVectors(b, a).normalize();
  _e2.copy(a).normalize().cross(_e1);
  if (_e2.lengthSq() < 1e-6) _e2.set(0, 1, 0).cross(_e1);
  _e2.normalize();
  _e1.crossVectors(_e1, _e2).normalize(); // (a perpendicular to the line and to _e2)
  for (let k = 0; k < 4; k++) {
    const e = k < 2 ? _e1 : _e2, sg = k % 2 ? -r : r;
    _oa.copy(a).addScaledVector(e, sg);
    _ob.copy(b).addScaledVector(e, sg);
    if (blocker(cols, _oa, _ob, 0.35, null, endSkip)) return false;
  }
  return true;
}

// Where a cable from A to B could bend round structure c: for each edge of a box, the point along it that makes the path A->edge->B
// shortest (a rope bends round an edge where that is least, not at its ends); the same for a cylinder's rim and its sides, and a
// ring round a sphere. Each stands WRAP_MARGIN outside the surface.
const _ep = new THREE.Vector3();
function wrapCandidates(c, A, B) {
  const out = [];
  const along = (p0, p1, outward) => { // the best point of the segment p0->p1 (ternary search on the path length, which is convex along it)
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
      along(p0, p1, rad); // (the side)
      out.push(p0.clone().addScaledVector(_v2.copy(rad).addScaledVector(axis, -1).normalize(), WRAP_MARGIN)); // (the two rims)
      out.push(p1.clone().addScaledVector(_v2.copy(rad).addScaledVector(axis, 1).normalize(), WRAP_MARGIN));
    } else out.push(c.c.clone().addScaledVector(rad, c.r + WRAP_MARGIN));
  }
  return out;
}

// Round structures (a cylinder, a sphere) are wrapped by an arc, not by pegs: the cable leaves the line from A on the tangent, lies on the
// surface (standing a little off it) the short way round, and leaves on the tangent to B. Returns the chain of points, A->B (none of
// them A or B). A cylinder is wrapped in the plane across its axis (the cable climbs or falls along it evenly); a sphere in the plane
// through its centre, A and B.
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
  const d1 = mod((thB - beta) - alpha);      // round the one way (counter-clockwise)
  const d2 = mod(-alpha - (thB + beta));     // and the other
  const dir = d1 <= d2 ? 1 : -1, delta = dir > 0 ? d1 : d2, s0 = dir * alpha;
  const step = Math.min(Math.PI / 6, 1.8 * Math.acos(r / R)); // (small enough that a chord between two points stays outside the surface)
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
    this.cand = null; // what E would hook right now (while the winch is equipped)
    this.pickT = 0;
    this.pts = Array.from({ length: SEG_MAX + 1 }, () => new THREE.Vector3());
    this.old = Array.from({ length: SEG_MAX + 1 }, () => new THREE.Vector3());
    this.path = Array.from({ length: WRAP_PTS + 2 }, () => new THREE.Vector3()); // hand, the wrap points, the hook (rebuilt every frame)
    this.pathN = 0;
    this.poly = Array.from({ length: WRAP_PTS + 2 }, () => new THREE.Vector3()); // the same, ending at the grapple's eye (what is drawn)
    this.pin = [0, SEG]; // the cable's points that sit on a wrap point (or an end)
    this.pinned = new Uint8Array(SEG_MAX + 1);
    this.restSeg = new Float32Array(SEG_MAX);
    this.nseg = SEG;
    this.ropeDirty = true;
    this.legs = [];
    this.strand = null; // the cable: an instance per metre of the model's twisted strand (winch.glb), once it has loaded
    this.tracer = null;
    this.hook = new THREE.Group(); // (the grapple goes on it when winch.glb arrives)
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

  // Everything hookable in reach: road and air traffic, crawlers, and any rover (allies, pirates,
  // patrols). Each comes back as a target with its model, velocity and a way to push on it.
  targets() {
    const g = this.game;
    const P = g.player;
    const out = [];
    const tr = g.world.traffic;
    const near = (p) => p.distanceToSquared(P.pos) < (RANGE + 25) * (RANGE + 25);
    // (a land-train's trailers are targets in their own right: each has a model and a position, and pulling on one pulls the whole train)
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
    // rovers of every side (pirate rigs, patrols, allies, the bosses, Kade's truck): yank them around in a fight
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
    // SAT-7: the derelict in its low orbit is an anchor that doesn't budge
    const S = g.secrets && g.secrets.sat;
    if (S && S.root && S.root.visible !== false && near(S.pos)) {
      out.push({ obj: { kind: 'sat7' }, mass: 1e6, flying: true, root: S.root, pos: () => S.pos, vel: () => S.vel, alive: () => true, push: () => {}, shift: () => {} });
    }
    return out;
  }

  // a structure (a collider) as a target: it never moves, and neither does the cable's end
  structure(c) {
    return { obj: { kind: 'structure' }, col: c, mass: 1e6, flying: false, root: null, pos: () => c.mid, vel: () => ZERO, alive: () => true, push: () => {}, shift: () => {} };
  }

  // A hook point on target T, and the surface's normal there, kept in the frame of what you see (its model; a structure has none and
  // keeps them as they are, the point as an offset from its middle), so the hook rides the vehicle however it bobs, banks or is dragged.
  handle(T, point, nrm, looked, dist) {
    let off, n;
    if (T.root) { _rinv.copy(T.root.matrixWorld).invert(); off = point.clone().applyMatrix4(_rinv); n = nrm.clone().transformDirection(_rinv); } // (the pose it was found in)
    else { off = point.clone().sub(T.pos()); n = nrm.clone(); }
    return { target: T, off, goal: off.clone(), nrm: n, looked, dist, len: dist, t: 0, reel: 0, wraps: [], free: [], grp: [], ignore: new Set(), bends: new Map(), strain: 0, creakT: 0 };
  }

  // where a handle's hook point is now
  anchorOf(h, out) {
    const T = h.target;
    if (T.root) return T.root.localToWorld(out.copy(h.off));
    return out.copy(h.off).add(T.pos());
  }

  // which way the surface faces there now
  normalOf(h, out) {
    out.copy(h.nrm);
    if (h.target.root) out.applyQuaternion(h.target.root.getWorldQuaternion(_q));
    return out.normalize();
  }

  // What E would hook: the nearest surface of whatever the reticle is on; failing that, whatever's closest to
  // the reticle (nearer wins a near tie). Vehicles and structures compete alike; the first of the best few that
  // you could actually see is the one (a vehicle behind a wall is out).
  pick() {
    const g = this.game;
    const P = g.player;
    const eye = g.camera.position;
    const look = g.camera.getWorldDirection(_look);
    const prev = this.cand && this.cand.target; // (what's marked now keeps a lead, so the lock doesn't flicker between two near ones)
    const best = []; // (the top four, best first)
    const offer = (T, col, looked, nrm) => {
      const dP = P.center.distanceTo(_pt);
      if (dP > RANGE || dP < MIN_GAP) return;
      _to.copy(_pt).sub(eye);
      const dE = _to.length() || 1e-6;
      const cos = _to.divideScalar(dE).dot(look);
      if (cos < MIN_COS) return;
      // The reticle rules. Under it: that surface, the nearest of them. Off it: whatever it points nearest, weighted by how far
      // off it is (an angle, so 1 degree costs the same near or far) with distance only a tiebreak. A target 5 degrees
      // off the reticle beats a closer one 10 degrees off, and anything under the reticle beats everything that is not.
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
        // the spot on its surface nearest the reticle's line (not nearest the eye: for a tower that is its foot, nowhere near where you are aiming)
        let u = Math.min(Math.max(_wp.copy(c.mid).sub(eye).dot(look), 0), RANGE + 80);
        for (let i = 0; i < 4; i++) {
          colliderPoint(c, _wp.copy(look).multiplyScalar(u).add(eye), _pt, _nv);
          u = Math.min(Math.max(_wp.copy(_pt).sub(eye).dot(look), 0), RANGE + 80);
        }
      }
      offer(null, c, looked, _nv);
    }
    for (const b of best) {
      // (the line is clear of everything but the thing itself: its own solid boxes round the hull must not hide it from its own hook)
      // (a hull's own deck boxes enclose it, so they are ignored for its hook; but not when you stand on that very ship: its tower
      // between you and a hook on its nose is in the way, and the reel would drag you into it)
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

  // E pressed with the winch selected and the cable off (powers.js: with it on, E releases)
  fire() {
    const g = this.game;
    if (this.on || this.cd > 0 || !this.hasHand()) return;
    let h = this.cand && this.cand.target.alive() ? this.cand : null; // (what the marker is on, exactly)
    if (h && this.hand(_a).distanceTo(this.anchorOf(h, _b)) > RANGE + 5) h = null;
    h = h || this.pick();
    if (!h) {
      g.hud.toast(`Hitch-Line: nothing in reach. Aim at a vehicle or a structure within ${RANGE} m.`, 1.6);
      g.audio.tone(220, 0.12, 'square', 0.06, 0.7);
      return;
    }
    const anchor = this.anchorOf(h, _b);
    const hand = this.hand(_a);
    h.len = hand.distanceTo(anchor); // (the cable is as long as the gap: taut from the start, and the drum takes it in)
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

  // The cable's path: your hand, each wrap point, the hook (into this.path; returns the number of points) and its length
  buildPath(o, hand, anchor) {
    const P = this.path;
    P[0].copy(hand);
    for (let i = 0; i < o.wraps.length; i++) P[i + 1].copy(o.wraps[i]);
    const k = o.wraps.length + 1;
    P[k].copy(anchor);
    this.pathN = k + 1;
    return k + 1;
  }

  pathLen() {
    let L = 0;
    for (let i = 0; i < this.pathN - 1; i++) L += this.path[i].distanceTo(this.path[i + 1]);
    return L;
  }

  // Every frame: let go of any bend the cable has straightened past, and bend it round any structure it has run into (a
  // corner or edge for a box, an arc for a cylinder or sphere). Returns 'changed' or null. A structure it can't bend round (no free place to
  // bend, the cap, still in the way after a bend or two) is given up on: the cable passes through it.
  tendWraps(o, el) {
    try { return this.tendWrapsIn(o, el); } finally { _ignore = null; }
  }

  tendWrapsIn(o, el) {
    const cols = this.game.colliders, P = this.path, n = o.wraps.length;
    _ignore = o.ignore;
    // letting go: only the ends of a run of bends round one structure can (the middle of an arc is held by the structure itself); with
    // you right up at the bend only a clear line is needed, otherwise the line past it must be clear with room to spare
    for (let k = n - 1; k >= 0; k--) {
      if (!(k === 0 || k === n - 1 || o.grp[k - 1] !== o.grp[k] || o.grp[k + 1] !== o.grp[k])) continue;
      const fat = Math.min(P[k].distanceTo(P[k + 1]), P[k + 1].distanceTo(P[k + 2])) < 2.5 ? 0.1 : UNWRAP_FAT;
      if (clearFat(cols, P[k], P[k + 2], fat, k === n - 1 ? 3 : 0.35)) { // (the hook end: a shallow line to the hook's own surface grazes it)
        o.free[k] += el; // (the frame's time, credited once: the repeat passes within a frame come with el = 0)
        if (o.free[k] >= UNWRAP_HOLD) {
          o.wraps.splice(k, 1); o.free.splice(k, 1); o.grp.splice(k, 1); this.ropeDirty = true;
          this.buildPath(o, _hA.copy(P[0]), _hB.copy(P[this.pathN - 1])); // (the path is stale until rebuilt, and the next step reads it)
          return 'changed';
        }
      } else o.free[k] = 0;
    }
    // bending: each leg is checked, bar the chords between two points of one arc (those can't be blocked by what they hug)
    for (let i = 0; i < this.pathN - 1; i++) {
      if (i >= 1 && i <= n - 1 && o.grp[i - 1] === o.grp[i]) continue;
      // (the leg that ends on the hook forgives the last 2.5 m, as the targeting does: a ledge or a rail overlapping the wall you hooked
      // is not in the way of a cable that is about to land)
      const hit = blocker(cols, P[i], P[i + 1], 0.35, null, i === this.pathN - 2 ? 2.5 : 0.35);
      if (!hit) continue;
      // (what the cable can't be bent round it passes through, and your own physics and the pull sort the rest out: more structures than
      // the cap, a structure that is still in the way after it has been bent round, no free place to bend)
      // (a box is counted by the bends it holds now, so a post can be wound round for a few laps (four corners a lap) and every bend that
      // unwinds is room for another; a cylinder or sphere by the arcs laid round it over the whole ride)
      const box = hit.c.type === 'box';
      const bends = box ? o.grp.reduce((n, q) => n + (q === hit.c), 0) : o.bends.get(hit.c) || 0;
      if ((!o.grp.includes(hit.c) && new Set(o.grp).size >= WRAP_MAX) || bends >= (box ? BOX_BENDS : 2)) { o.ignore.add(hit.c); continue; }
      const A = P[i], B = P[i + 1];
      const before = this.pathLen();
      let pts = hit.c.type === 'cyl' || hit.c.type === 'sphere' ? arcPoints(hit.c, A, B) : null;
      if (pts && !pts.every((q) => pointFree(cols, q))) pts = null; // (an arc through something else won't do: try the edges)
      // (nor will an arc that still runs into what it wraps: that is no bend, and with the hook buried in the structure it would pile up)
      if (pts && (blocker(cols, A, pts[0], 0.35, hit.c) || blocker(cols, pts[pts.length - 1], B, 0.35, hit.c, i === this.pathN - 2 ? 2.5 : 0.35))) pts = null;
      if (!pts) {
        let best = null, bs = -Infinity;
        for (const p of wrapCandidates(hit.c, A, B)) {
          if (p.distanceTo(A) < 0.8 || p.distanceTo(B) < 0.8) continue;
          const clear = (blocker(cols, A, p, 0.35, hit.c) ? 0 : 1) + (blocker(cols, p, B, 0.35, hit.c) ? 0 : 1);
          if (!pointFree(cols, p)) continue; // (a bend point has to be out in the open, or you could never be drawn to it)
          const score = clear * 1000 - (A.distanceTo(p) + p.distanceTo(B)); // (both legs clear first, then the shortest way round)
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
      this.buildPath(o, _hA.copy(P[0]), _hB.copy(P[this.pathN - 1])); // (copies: the rebuild overwrites the points it reads)
      o.len += Math.max(0, this.pathLen() - before); // (the drum pays out the extra the bends take, so a new wrap doesn't jerk you)
      return 'changed';
    }
    _ignore = null;
    return null;
  }

  // The bend nearest you, checked every frame and with no hold: once you are up at it and the line past it is clear, it is let go at
  // once. (At 20 Hz with a hold of 0.2 s the cable ran on past a bend you had already passed, stretching by a metre or more and
  // drawing you back, until it let go and drew you forward again: a visible jerk round every corner.)
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

  // every frame (after the player has moved): the drum reels you in and the cable pulls when it's taut
  update(dt, usable) {
    const g = this.game;
    const P = g.player;
    if (this.cd > 0) this.cd -= dt;
    const equipped = this.owned && g.powers && g.powers.current() === 'winch' && this.hasHand();
    if (equipped && !this.on) {
      if ((this.pickT -= dt) <= 0) {
        this.pickT = PICK_EVERY;
        const old = this.cand, nc = this.pick();
        // (the same target again: its hook point eases to the new spot rather than jumping there)
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
    // (the wraps are checked every frame, bent or not: at 20 Hz a player running at a post at 15 m/s covers 0.75 m between checks, and the
    // cable ran through the post for up to three frames before the first bend. el = the frame time, so the 0.2 s unwrap hold counts real
    // time, once. A frame can need more than one pass: a post and the board edge it overlaps, a second post. This ships with the position step
    // along the real legs below: checked every frame alone, the old step along the eased direction ran away more often.)
    let r = this.tendWraps(o, dt);
    for (let it = 1; r && it < WRAP_STEPS; it++) r = this.tendWraps(o, 0);
    this.releaseFirst(o);
    const nP = this.pathN;
    let len = this.pathLen();
    if (len > RANGE * 1.6) { this.release(); g.hud.toast('The line snapped!', 1.5); return; }
    // the two ends: you are pulled along the first leg, the hook along the last (with no wraps they are one line, opposite ways)
    const P0 = this.path[0], P1 = this.path[1], Pn = this.path[nP - 1], Pm = this.path[nP - 2];
    _up.subVectors(P1, P0); if (_up.lengthSq() > 1e-8) _up.normalize();
    _ut.subVectors(Pm, Pn); if (_ut.lengthSq() > 1e-8) _ut.normalize();
    _gUp.copy(_up); _gUt.copy(_ut);
    // (the directions you and the hook are pulled along change in one step when a bend is added or let go: eased over about 80 ms, so the
    // pull swings round the corner and doesn't flip, and the player isn't thrown by it. The eased copies drive the pull and the velocity
    // constraint only; the position correction runs along the real legs, since the eased direction can trail the real one by more than a
    // quarter turn after a bend and a step along it would lengthen the path)
    if (!o.dirP) { o.dirP = _up.clone(); o.dirT = _ut.clone(); }
    else {
      const sm = 1 - Math.exp(-dt * 12);
      o.dirP.lerp(_up, sm); if (o.dirP.lengthSq() < 1e-6) o.dirP.copy(_up); else o.dirP.normalize();
      o.dirT.lerp(_ut, sm); if (o.dirT.lengthSq() < 1e-6) o.dirT.copy(_ut); else o.dirT.normalize();
      _up.copy(o.dirP); _ut.copy(o.dirT);
    }

    o.len = Math.min(o.len, Math.max(REST, len + 0.1)); // (the cable is only ever as long as the path: a ratchet takes up any slack)
    const closeNow = P.vel.dot(_up) + T.vel().dot(_ut); // (how fast the two ends are closing, along the cable)
    // the drum: spools up gently, runs steady, and eases to a stop with REST metres of cable left
    const remain = o.len - REST;
    if (remain > 0.02) {
      const want = Math.min(REEL_MAX, Math.sqrt(2 * REEL_DEC * 0.6 * remain) + 0.4); // (a braking curve the drum can follow, with a slow creep at the end)
      o.reel += Math.max(-REEL_DEC * 2.5 * dt, Math.min(REEL_ACC * dt, want - o.reel)); // (it spools up slower than it winds down)
      o.len = Math.min(o.len, Math.max(REST, o.len - o.reel * dt, len - LEAD));
      // you're drawn up to the drum's speed (and held back from overshooting it), a bounded tug each frame
      const closing = closeNow;
      if (closing < o.reel) {
        const yank = 1 + YANK * Math.min(1, o.strain / YANK_FULL); // (straining against something: the pull builds to try to yank you free)
        const dv = Math.min(o.reel - closing, PULL_ACC * yank * dt);
        P.vel.addScaledVector(_up, dv);
        T.push(_a.copy(_ut).multiplyScalar(dv)); // (the other end takes the reaction; a building takes none)
      } else if (closing > o.reel + 0.4) {
        P.vel.addScaledVector(_up, -Math.min(closing - o.reel, PULL_ACC * dt));
      }
      // the drum's ratchet: a tick for every metre taken in
      if (this.tick - o.len > 1.5) { this.tick = o.len; g.audio.tone(170 + Math.min(o.reel, REEL_MAX) * 5, 0.03, 'square', 0.035, 1); }
    } else {
      if (o.reel > 0) { o.reel = 0; g.audio.tone(120, 0.12, 'square', 0.07, 0.6); } // the clunk as the drum locks
      // (the arrival: whatever inward speed is left is taken off in a couple of strides, so you stop short of the hook)
      if (closeNow > 0.05 && len < REST + 1.5) P.vel.addScaledVector(_up, -Math.min(closeNow, PULL_ACC * dt));
    }

    // the strain: the drum is running but you are not coming in (something is in the way, or what you hooked won't budge); it creaks
    // louder and higher, and after a moment the line slips off, gently
    if (o.reel > 0.5 && len - o.len > LEAD * 0.5 && closeNow < 1) o.strain = Math.min(STRAIN_MAX, o.strain + dt);
    else o.strain = Math.max(0, o.strain - dt * 1.5);
    if (o.strain > 0.3 && (o.creakT -= dt) <= 0) { o.creakT = 0.28; g.audio.tone(170 + (o.strain / STRAIN_MAX) * 260, 0.1, 'sawtooth', 0.03 + 0.03 * (o.strain / STRAIN_MAX), 1.4); }
    // (and while it strains, a jostle: a small sideways wiggle and lift on the pull, growing with the strain, so that a player wedged against
    // a wall or a corner slides free of it and the pull carries on, instead of sitting pinned by a taut line)
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
      const share = mT / (mP + mT); // (you take almost all of the correction; it takes a little)
      // positions: back to the cable's length
      const over = len - o.len;
      const ease = 1 - Math.exp(-dt * 20); // (the correction is taken up over a few frames: a snap of up to LEAD in one frame was a visible jump)
      // (along the real legs, never past the bend: a step along a leg shortens the path by exactly the step, so the cable can't come out longer;
      // this goes with the every-frame wrap check above)
      const sP = Math.min(over * share * ease, Math.max(0, P0.distanceTo(P1) - 0.05));
      const sT = Math.min(over * (1 - share) * ease, Math.max(0, Pn.distanceTo(Pm) - 0.05));
      P.body.pos.addScaledVector(_gUp, sP);
      T.shift(_d.copy(_gUt).multiplyScalar(sT));
      // velocities: no moving apart along the cable (the swing, the tow, the drag all come from this)
      const rel = -(P.vel.dot(_up) + T.vel().dot(_ut));
      if (rel > 0) {
        const j = rel / (1 / mP + 1 / mT) * (1 - Math.exp(-dt * 60)); // (most of it each frame, not all at once)
        P.vel.addScaledVector(_up, j / mP);
        T.push(_d.copy(_ut).multiplyScalar(j));
      }
      // a taut cable lifts you off the ground (so it can swing you)
      if (_up.dot(upAt(P.pos)) > 0.3) { P.body.grounded = false; P.body.sinceContact = 1; }
      if (o.reel === 0 && Math.random() < dt * 3) g.audio.tone(140 + Math.random() * 60, 0.08, 'sawtooth', 0.025, 1.3); // the cable creaks
    }
    o.dist = len;
    this.buildPath(o, this.hand(_a), this.anchorOf(o, _b));
    this.drawRope(dt, o.len, this.normalOf(o, _nn));
  }

  // A verlet cable along the path from your hand through the wrap points to the hook: dead straight when taut, a stiff steel hang when
  // it's slack. The wrap points are pins the cable is held on; between two pins it is a rope of its own.
  drawRope(dt, len, nrm = null) {
    const pts = this.pts, old = this.old, path = this.path, poly = this.poly;
    const k = this.pathN - 1;
    const up = upAt(path[0], _upv);
    const hookEnd = path[k]; // (the surface point the claw is driven into, along the surface's normal; the cable runs to the grapple's eye)
    const N = (nrm ? _hn.copy(nrm) : _hn.copy(path[k - 1]).sub(hookEnd)).normalize();
    for (let i = 0; i < k; i++) poly[i].copy(path[i]);
    poly[k].copy(hookEnd).addScaledVector(N, EYE_OUT - EMBED); // (the cable ends at the eye)
    const legs = this.legs;
    legs.length = 0;
    let total = 0;
    for (let i = 0; i < k; i++) { const l = poly[i].distanceTo(poly[i + 1]); legs.push(l); total += l; }
    // how many points the cable has: more when it has many bends to follow
    const nseg = Math.min(SEG_MAX, Math.max(SEG, 3 * k));
    // which of the cable's points sit on the pins: re-laid along the path whenever the wraps change
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
    // each stretch of cable between pins: as long as its leg, plus its share of any slack
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
      // (the stiffness: a steel cable resists bending, so each point is eased toward the line through its neighbours)
      for (let i = 1; i < nseg; i++) if (!pinned[i]) pts[i].lerp(_d.addVectors(pts[i - 1], pts[i + 1]).multiplyScalar(0.5), 0.2);
      for (let m = 0; m <= k; m++) pts[pin[m]].copy(poly[m]);
    }
    this.hook.visible = true;
    this.hook.position.copy(hookEnd).addScaledVector(N, -EMBED);
    this.hook.quaternion.setFromUnitVectors(_z, N); // (the claw faces into the surface, the eye out along its normal)
    if (!this.strand) return;
    // the cable model, a metre at a time, laid along the line (each stretched to the length of its stretch of it)
    // (one curve for good, over the same point objects: it only has to be told they moved, and 60 arc-length steps are plenty for 20 points)
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

  // The tow-line marker: a faint bracket on the HUD where E would hook (brighter when it's what the reticle is
  // on), and, once hooked, at the hook with the cable still to reel.
  drawMarker(equipped) {
    const g = this.game;
    const h = this.on || (equipped ? this.cand : null);
    let el = this.markEl;
    if (!h || !h.target.alive()) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = this.markEl = document.createElement('div');
      el.id = 'towmark';
      el.innerHTML = '<i></i><span></span>'; // (the bracket is a Blender render, tinted by the CSS mask)
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
    const c = equipped ? this.cand : this.hasHand() ? this.pick() : null; // (the power wheel asks for the ones not equipped)
    return c ? 'TARGET IN REACH' : 'NO TARGET';
  }
}

// winch.glb (tools/blender/build_winch.py): the grapple and a metre of cable, loaded once
let partsP = null;
function loadParts() {
  return partsP ||= import('./assets/winch.glb?inline').then(async (m) => {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(m.default);
    gltf.scene.updateMatrixWorld(true);
    const hook = gltf.scene.getObjectByName('winch_hook');
    const strand = gltf.scene.getObjectByName('winch_strand'), tracer = gltf.scene.getObjectByName('winch_tracer');
    if (!hook || !strand || !tracer) throw new Error('winch.glb is missing a part');
    hook.traverse((o) => { if (o.isMesh) o.material = toon(SLOT[o.material.name] ?? SLOT.steel); });
    const geo = (o) => o.geometry.clone().applyMatrix4(o.matrixWorld); // (in the cable's own frame: a metre along +z)
    return { hook, strand: geo(strand), tracer: geo(tracer) };
  });
}
