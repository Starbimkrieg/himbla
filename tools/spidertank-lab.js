// Dev-only: Zbornak's spider tank lab (src/spidertank.js; docs/spidertank/). It drives round a circle over rolling ground with
// crates, low walls and a few tall blocks on it: walking on its eight legs (src/gait.js), running, closing up into its skimming bead
// past 25 m/s and back, stopping to fire the reactor beam. It drives itself until you press a key: W ahead, S back (to 18 m/s), A/D
// turn, hold SPACE for the beam. A test lane off the circle (&demo=wall) has things to climb and a block it can't. Look round with the
// mouse; pause and slow it down. F9 saves the session's flight (every tick's input) to replay exactly; &sweep drives fresh tanks at
// every box, unseen, and tables what each did. Query parameters and keys are in the HTML.
import * as THREE from 'three';
import { ComicPost } from '../src/post.js';
import { loadSpiderTank, makeSpiderTank, HULL, HULL3 } from '../src/spidertank.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const DEMO = Q.get('demo') || '';
const CAM = Q.get('cam') || 'chase';

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1c1630');
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 2000);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -22; sun.shadow.camera.right = sun.shadow.camera.top = 22;
scene.add(sun, sun.target, new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85));
const post = new ComicPost(renderer, camera);

// ---- the ground: rolling regolith, and on it crates, low walls and tall blocks (feet stand on their tops; gait.js steps over them) ----
const terrain = (x, z) => 0.9 * Math.sin(x * 0.045 + 0.5) * Math.cos(z * 0.038) + 0.35 * Math.sin(x * 0.13 + z * 0.09) + 0.12 * Math.cos(x * 0.41 - z * 0.33);
const R = 55;                                                          // m: the circle it drives round
const boxes = [];
const rr = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(7);
const boxMat = new THREE.MeshToonMaterial({ color: 0x8a87a0 }), wallMat = new THREE.MeshToonMaterial({ color: 0x6b5a4a }), blockMat = new THREE.MeshToonMaterial({ color: 0x55607a });
function addBox(cx, cz, yaw, w, d, h, mat) {
  const base = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => terrain(cx + a * w / 2, cz + b * d / 2)));
  const top = Math.max(terrain(cx, cz), base) + h;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, top - base + 0.5, d), mat);
  m.position.set(cx, (top + base - 0.5) / 2, cz);
  m.rotation.y = yaw;
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  const ink = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide }));
  ink.scale.setScalar(1.02);
  m.add(ink);
  boxes.push({ cx, cz, c: Math.cos(yaw), s: Math.sin(yaw), hx: w / 2, hz: d / 2, top, bot: base - 0.5 });
}
for (let k = 0; k < 16; k++) {                                         // crates on the way round, some under the feet, some under the hull
  const a = (k / 16) * Math.PI * 2 + 0.25, off = (rr() - 0.5) * 9;
  addBox(Math.cos(a) * (R + off), Math.sin(a) * (R + off), rr() * 3, 1.8 + rr() * 2.4, 1.8 + rr() * 2.4, 0.7 + rr() * 1.3, boxMat);
}
for (let k = 0; k < 4; k++) {                                          // low walls across the way
  const a = (k / 4) * Math.PI * 2 + 1.0;
  addBox(Math.cos(a) * R, Math.sin(a) * R, -a, 14, 0.7, 0.9, wallMat);
}
for (let k = 0; k < 9; k++) {                                           // blocks round about: platforms to climb (to 9.5 m), and walls taller
  const a = (k / 9) * Math.PI * 2, rad = R + 22 + rr() * 30;
  addBox(Math.cos(a) * rad, Math.sin(a) * rad, rr() * 3, 6 + rr() * 8, 6 + rr() * 8, k % 2 ? 3 + rr() * 6.5 : 12 + rr() * 8, blockMat);
}
// the test lane, south of the circle: a crate it walks over, a 3.2 m step and a 4.6 m block it climbs, a 9.5 m block (twice its own
// height: nose up, feet on the face and then the top, hoisting itself over) and down off each, then a 12 m wall too tall to climb: it
// gets as high up its face as it can and stops there
const LANE = { x: 0, z0: -205 };
addBox(LANE.x, -185, 0, 6, 3.5, 2.3, boxMat);
addBox(LANE.x, -155, 0, 16, 16, 3.2, blockMat);
addBox(LANE.x, -122, 0, 14, 9, 4.6, blockMat);
addBox(LANE.x, -88, 0, 18, 14, 9.5, blockMat);
addBox(LANE.x, -50, 0, 20, 8, 12, blockMat);
const groundGeo = new THREE.PlaneGeometry(420, 420, 300, 300).rotateX(-Math.PI / 2);
{
  const P = groundGeo.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, terrain(P.getX(i), P.getZ(i)));
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshToonMaterial({ color: 0x8a8398 }));
ground.receiveShadow = true;
scene.add(ground);
// the highest thing under a point: a box's top, or the ground; with ceil, the highest no higher than ceil (NaN: inside a box taller)
function topAt(x, z, ceil = Infinity) {
  let y = terrain(x, z);
  for (const b of boxes) {
    const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) > b.hx || Math.abs(lz) > b.hz) continue;
    if (b.top > ceil) return NaN;
    if (b.top > y) y = b.top;
  }
  return y;
}
// gait.js's ground: the point under p, or null where p is inside something taller than ceil
const groundAt = (p, out, ceil) => {
  const y = topAt(p.x, p.z, ceil);
  return Number.isNaN(y) ? null : out.set(p.x, y, p.z);
};

// the first thing on the line from o along unit dir within far (a box's top or face, or the ground), into out; or null
const _q = new THREE.Vector3();
function rayAt(o, dir, far, out) {
  let best = far;
  for (const b of boxes) {                                             // (in the box's frame: a slab test)
    const dx = o.x - b.cx, dz = o.z - b.cz;
    const lo = [dx * b.c - dz * b.s, o.y, dx * b.s + dz * b.c], ld = [dir.x * b.c - dir.z * b.s, dir.y, dir.x * b.s + dir.z * b.c];
    const lo3 = [-b.hx, b.bot, -b.hz], hi3 = [b.hx, b.top, b.hz];
    let t0 = 0, t1 = best;
    for (let k = 0; k < 3 && t0 <= t1; k++) {
      if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < lo3[k] || lo[k] > hi3[k]) t1 = -1; continue; }
      let a = (lo3[k] - lo[k]) / ld[k], c = (hi3[k] - lo[k]) / ld[k];
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    }
    if (t0 <= t1 && t0 > 1e-4) best = t0;
  }
  let prevT = 0;                                                       // (the ground: stepped along, then halved down to it)
  for (let tt = 0.25; tt < best; tt += 0.25) {
    _q.copy(o).addScaledVector(dir, tt);
    if (_q.y < terrain(_q.x, _q.z)) {
      let a = prevT, c = tt;
      for (let k = 0; k < 8; k++) { const m = (a + c) / 2; _q.copy(o).addScaledVector(dir, m); if (_q.y < terrain(_q.x, _q.z)) c = m; else a = m; }
      best = c;
      break;
    }
    prevT = tt;
  }
  return best < far ? out.copy(o).addScaledVector(dir, best) : null;
}

// ---- the drive: scripted until a key is pressed (and again a few seconds after the last) ----
const keys = new Set();
let lastKey = Q.get('auto') === '0' ? 0 : -1e9;
const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (DRIVE_KEYS.has(e.code)) lastKey = performance.now();
  if (e.code === 'Space') e.preventDefault();
  view(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
// the whole drive, looped: [until (s), speed (m/s), trigger]; it closes up by itself past 25 m/s and opens out under 21 (not while it climbs)
const DRIVE = [[5, 4, 0], [10, 10, 0], [15, 16, 0], [19, 22, 0], [25, 60, 0], [30, 14, 0], [33, 6, 0], [34, 1.5, 0], [39.5, 1.5, 1], [42, 4, 0]];
function script(t) {
  if (DEMO === 'walk' || DEMO === 'climb') return [num('speed', 4), 0];
  if (DEMO === 'wall') return [num('speed', 3), 0];
  if (DEMO === 'run') return [num('speed', 18), 0];
  if (DEMO === 'skim') return [num('speed', 70), 0];
  if (DEMO === 'beam') return [0.8, t % 7 < 6 ? 1 : 0];
  if (DEMO === 'fold') return [t % 10 < 5 ? 32 : 14, 0];
  const s = t % DRIVE[DRIVE.length - 1][0];
  const p = DRIVE.find((d) => s < d[0]);
  return [p[1], p[2]];
}

const kit = await loadSpiderTank();
const tank = makeSpiderTank(kit);
scene.add(tank.root);
const S = DEMO === 'wall' ? { x: LANE.x, z: LANE.z0, yaw: 0, v: 0 } : { x: R, z: 0, yaw: 0, v: 0 };
if (DEMO === 'skim') { tank.fold = 1; S.v = num('speed', 70); }                    // (skimming from the start)
const _p = new THREE.Vector3();
let t = 0, last = performance.now(), auto = true;
const info = document.getElementById('info');
if (Q.get('ui') === '0') info.style.display = 'none';

// the camera: an orbit round the tank, turning with it, from where &cam puts it (yaw from straight ahead, pitch, distance); drag to
// turn it, right-drag (or shift-drag) to slide what it looks at, wheel to zoom, H to stop it turning with the tank, R or double-click
// to put it back. P pauses, . steps a frame while paused, [ and ] slow the clock down and back up (1, 1/2, 1/4, 1/10).
const deg = THREE.MathUtils.degToRad;
const PRESET = {
  chase: [-160, 14, 17], side: [-84, 5, 20], front: [-24, 6, 20], rear: [-161, 4, 20], top: [180, 80, 20], orbit: [35, 16, 24],
}[CAM] || [-160, 14, 17];
const cam = { yaw: 0, pitch: 0, dist: 0, zoom: 1, pan: new THREE.Vector3(), follow: true, head: 0, at: new THREE.Vector3(), set: false };
const home = () => {
  Object.assign(cam, { yaw: deg(num('yaw', PRESET[0])), pitch: deg(num('pitch', PRESET[1])), dist: num('dist', PRESET[2]), zoom: 1, follow: true });
  cam.pan.set(0, 0, 0);
};
home();
const SLOW = [1, 0.5, 0.25, 0.1];
const clock = { paused: false, step: false, slow: 0 };
function view(code) {
  if (code === 'KeyP') clock.paused = !clock.paused;
  else if (code === 'Period') clock.step = true;
  else if (code === 'BracketLeft') clock.slow = Math.min(SLOW.length - 1, clock.slow + 1);
  else if (code === 'BracketRight') clock.slow = Math.max(0, clock.slow - 1);
  else if (code === 'KeyH') { cam.follow = !cam.follow; if (!cam.follow) cam.yaw += cam.head; else cam.yaw -= cam.head; }
  else if (code === 'KeyR') home();
}
let drag = null;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; });
renderer.domElement.addEventListener('dblclick', home);
addEventListener('pointerup', () => { drag = null; });
const _r = new THREE.Vector3(), _u = new THREE.Vector3();
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (drag.pan) {                                                      // (in the tank's frame, so it stays on the same leg)
    const k = cam.dist * cam.zoom * 0.0016;
    _r.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-dx * k);
    _u.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * k);
    cam.pan.add(_r.add(_u).applyAxisAngle(THREE.Object3D.DEFAULT_UP, cam.follow ? -cam.head : 0));
  } else {
    cam.yaw -= dx * 0.008;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.006, -0.25, 1.5);
  }
  drag.x = e.clientX; drag.y = e.clientY;
});
renderer.domElement.addEventListener('wheel', (e) => { cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(e.deltaY * 0.001), 0.15, 6); }, { passive: true });

// ---- the drive: what is asked of it each tick (the keys, the script, or a replay), and the tank driven by it ----
function readInput(now) {
  const self = now - lastKey > 6000 && ![...keys].some((k) => DRIVE_KEYS.has(k));   // (not while a key is held)
  if (self) { const [want, trigger] = script(t); return [self, want, trigger ? 1 : 0, 0]; }
  return [false, keys.has('KeyW') ? 90 : keys.has('KeyS') ? -tank.reverseMax : S.v, keys.has('Space') ? 1 : 0,
    (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0)];
}
// one tick of dt for sim ({ S, tank }), given [driving itself, the speed asked, trigger, turn]: its speed eased to what is asked, moved
// (round the circle or down the lane driving itself, else where it's steered), never deeper into anything (driven, it slides along what
// it meets; driving itself, it stops), and the tank updated
function drive(sim, dt, [self, ask, trigger, turn]) {
  const { S, tank } = sim;
  const want = THREE.MathUtils.clamp(ask, -tank.reverseMax, Math.min(90, tank.speedMax)) * tank.speedCap;
  const acc = tank.form === 'walk' ? 7 : 20;                           // (braking, and backing up, at 14)
  S.v += THREE.MathUtils.clamp(want - S.v, want < S.v ? -14 * dt : 0, want > S.v ? (S.v < 0 ? 14 : acc) * dt : 0);
  let nx, nz, nyaw = S.yaw;
  if (self && DEMO === 'wall') { nx = LANE.x; nz = S.z + S.v * dt; nyaw = 0; }
  else if (self) {
    const a = Math.atan2(S.z, S.x) + (S.v * dt) / R;
    nx = Math.cos(a) * R; nz = Math.sin(a) * R; nyaw = -a;
  } else {
    nyaw += turn * dt * (tank.form === 'walk' ? 2.6 - 1.6 * Math.min(1, Math.abs(S.v) / 25) : 1.1 - 0.7 * Math.min(1, S.v / 60));   // (a spider spins quick)
    nx = S.x + Math.sin(nyaw) * S.v * dt; nz = S.z + Math.cos(nyaw) * S.v * dt;
  }
  const sink = (x, z, yaw) => tank.hits(x, terrain(x, z), z, yaw);
  const deep = sink(S.x, S.z, S.yaw) + 1e-3, ok = (x, z, yaw) => sink(x, z, yaw) <= deep;
  if (ok(nx, nz, nyaw)) { S.x = nx; S.z = nz; S.yaw = nyaw; }
  else if (!self && ok(nx, nz, S.yaw)) { S.x = nx; S.z = nz; }
  else if (!self && ok(nx, S.z, S.yaw)) S.x = nx;
  else if (!self && ok(S.x, nz, S.yaw)) S.z = nz;
  else { S.v = 0; if (ok(S.x, S.z, nyaw)) S.yaw = nyaw; }
  // on the terrain under its middle: it climbs over things on its own legs (spidertank.js); how far into things its hull, posed as it is,
  // would be at x, z, turned yaw is tank.hits
  tank.root.position.set(S.x, terrain(S.x, S.z), S.z);
  tank.root.rotation.set(0, S.yaw, 0);
  tank.update(dt, { speed: S.v, push: want, ground: groundAt, ray: rayAt, trigger: !!trigger });   // (push: held up, it climbs)
}
const sim = { S, tank };

// ---- the obstacle sweep (&sweep, or &sweep=quick): fresh tanks, unseen, driven straight at every box in the lab from 8 sides (box-on,
// corner-on) at a walk and a run, and parked beside the sides of the tall blocks; each one over it, round it or stopped, against what
// it should do (over anything up to tank.climbMax tall), with its hull and legs in things, steps and shuffling. Any row opens in the
// lab as a replay (&case=box,side,speed; or stand,box,side), to watch. The table is in window.__sweep too.
const BLOCKS = boxes.map((b, i) => i).filter((i) => i >= 20);          // (the blocks round about, and the lane's; quick: only these)
// a case as a flight the lab replays: where it starts (out from the box, facing it, its middle on the line through the box's middle),
// and its ticks, each asking the same speed, steering nowhere
function sweepCase(spec) {
  const [kind, ...rest] = spec.split(','), stand = kind === 'stand';
  const [i, side, speed, out = 4.2] = (stand ? [...rest.slice(0, 2), 0, ...rest.slice(2)] : [kind, ...rest]).map(Number);
  const b = boxes[i], ang = Math.atan2(b.s, b.c) + side * Math.PI / 4;  // (the box's yaw, and on round by eighths)
  const dx = Math.sin(ang), dz = Math.cos(ang);                         // (the way it heads: into the box)
  const ax = b.c * dx - b.s * dz, az = b.s * dx + b.c * dz;              // (that way in the box's frame)
  const reach = Math.abs(ax) * b.hx + Math.abs(az) * b.hz;              // m from the box's middle to its side, along the way
  let start, frames, dur;
  if (stand) {                                                          // beside a side, facing along it, 4.2 m out (its legs against it), or out
    start = { x: b.cx - dx * (reach + out), z: b.cz - dz * (reach + out), yaw: ang + Math.PI / 2, v: 0 };
    dur = 10;
    frames = Array.from({ length: dur * 30 }, () => [1 / 30, 0, 0, 0, 0]);
  } else {
    let back = reach + 14;                                              // (further back while its hull, a metre round, would start in something)
    const clear = (k) => HULL.every(([hx, hz]) => [1, 1.25].every((m) => {
      const lx = hx * m * (1 + 1 / 2.3), lz = hz * m * (1 + 1 / 3.6), x = b.cx - dx * k + Math.cos(ang) * lx + dx * lz, z = b.cz - dz * k - Math.sin(ang) * lx + dz * lz;
      return topAt(x, z) - terrain(x, z) < 0.3;
    }));
    while (back < reach + 44 && !clear(back)) back += 2;
    start = { x: b.cx - dx * back, z: b.cz - dz * back, yaw: ang, v: 0 };
    dur = Math.min(45, 2 + (2 * back) / speed + 14);
    frames = Array.from({ length: Math.round(dur * 30) }, (_, f) => [1 / 30, 0, f < 60 ? 0 : speed, 0, 0]);   // (2 s to settle)
  }
  // rise: the box's top over the ground round it (where its feet start)
  const rise = b.top - Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([p, q]) => terrain(b.cx + (p * b.hx * b.c + q * b.hz * b.s), b.cz + (-p * b.hx * b.s + q * b.hz * b.c))));
  // crowded: something it can't climb within 4 m of it (crates 11 and 12 lean on the lane's 12 m wall), so stopping or going round is right
  const crowded = boxes.some((o) => o !== b && o.top - b.top > 3 && Math.hypot(o.cx - b.cx, o.cz - b.cz) < Math.hypot(o.hx, o.hz) + Math.hypot(b.hx, b.hz) + 4);
  return { spec, i, side, speed, out, stand, b, crowded, dx, dz, reach, rise, flight: { kind: 'spidertank-flight', version: 1, query: '', start, frames } };
}
const _w = new THREE.Vector3(), _j0 = new THREE.Vector3(), _j1 = new THREE.Vector3();
function inBoxes(p, near) {                                             // m deep the point is inside a box, or under the ground (0: not)
  let worst = Math.max(0, terrain(p.x, p.z) - p.y);
  for (const b of near) {
    const dx = p.x - b.cx, dz = p.z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    worst = Math.max(worst, Math.min(b.hx - Math.abs(lx), b.hz - Math.abs(lz), b.top - p.y, p.y - b.bot));
  }
  return worst;
}
function runCase(spec) {
  const C = sweepCase(spec), T = makeSpiderTank(kit), s = { ...C.flight.start }, me = { S: s, tank: T };
  const near = boxes.filter((b) => Math.hypot(b.cx - C.b.cx, b.cz - C.b.cz) < 60);
  const r = { spec, box: C.i, side: C.side, speed: C.speed, rise: C.rise, hull: 0, hullWorst: 0, bones: 0, bonesWorst: 0, steps: 0, roll: 0, pitch: 0, topW: -Infinity, inside: false };
  const along = () => (s.x - C.b.cx) * C.dx + (s.z - C.b.cz) * C.dz;    // m past the box's middle, along the way
  const was = T.gait.chains.map(() => false);
  const end = C.flight.frames.length / 30;
  let last = null, tail = 0, tailSteps = 0, t = 0;
  for (const f of C.flight.frames) {
    if (!C.stand && along() > C.reach + 10) break;                      // (well past it: done)
    t += f[0];
    drive(me, f[0], [false, f[2], f[3], f[4]]);
    T.root.updateMatrixWorld(true);
    if (t < 2) continue;                                                // (settling)
    let hc = 0;
    for (const v of HULL3) hc = Math.max(hc, inBoxes(_w.copy(v).applyMatrix4(T.inner.matrixWorld), near));
    if (hc > 0.05) r.hull++;
    r.hullWorst = Math.max(r.hullWorst, hc);
    T.gait.chains.forEach((c, k) => {
      let worst = 0;
      for (let j = 0; j < c.joints.length; j++) {
        c.joints[j].getWorldPosition(_j0);
        const next = c.joints[j + 1] || c.joints[j].children.find((o) => o.userData.role === 'foot');
        next.getWorldPosition(_j1);
        for (let q = 1; q <= 6; q++) worst = Math.max(worst, inBoxes(_w.lerpVectors(_j0, _j1, q / 7), near));
      }
      if (worst > 0.15) r.bones++;
      r.bonesWorst = Math.max(r.bonesWorst, worst);
      if (c.stepping && !was[k]) { r.steps++; if (t > end - 6) tailSteps++; }
      was[k] = c.stepping;
    });
    const p = T.pose;
    if (last && t > end - 6) tail += Math.abs(p.W - last[0]) + Math.abs(p.P - last[1]) + Math.abs(p.R - last[2]);
    last = [p.W, p.P, p.R];
    r.roll = Math.max(r.roll, Math.abs(p.R));
    r.pitch = Math.max(r.pitch, -p.P);
    r.topW = Math.max(r.topW, p.W - T.hipY);
    const dx = s.x - C.b.cx, dz = s.z - C.b.cz;
    if (Math.abs(dx * C.b.c - dz * C.b.s) < C.b.hx && Math.abs(dx * C.b.s + dz * C.b.c) < C.b.hz) r.inside = true;
  }
  const past = along() > C.reach + 1;
  r.tailSteps = tailSteps;                                              // steps begun in its last 6 s
  r.tailJitter = tail / 180;                                            // pose change a frame, its last 6 s (m and rad)
  r.result = C.stand ? (r.tailSteps > 8 || r.tailJitter > 0.01 ? 'shuffles' : 'still') : past ? (r.inside ? 'over' : 'round') : 'stopped';
  // m past its near side (negative: short of it); standing, m it has drifted
  r.at = +(C.stand ? Math.hypot(s.x - C.flight.start.x, s.z - C.flight.start.z) : along() - C.reach).toFixed(1);
  // (within half a metre of its limit, either is right: the ground round a box isn't level)
  r.should = C.stand ? 'still' : Math.abs(C.rise - T.climbMax) < 0.5 || C.crowded ? 'either' : C.rise < T.climbMax ? 'over' : 'stopped';
  r.crowded = C.crowded;
  r.ok = r.result === r.should || (r.should === 'either' && (C.crowded || r.result !== 'round')) || (r.should === 'stopped' && r.result === 'round');
  r.form = T.form;
  return r;
}
async function runSweep() {
  const quick = Q.get('sweep') === 'quick', only = Q.has('box') ? Q.get('box').split(',').map(Number) : null;
  const specs = [];
  const open = `stand,${BLOCKS[0]},0,30`;                               // (the same, out in the open: what standing still looks like)
  if (!only) specs.push(open);
  for (const i of only || (quick ? BLOCKS : boxes.map((b, k) => k))) {
    for (const side of quick ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7]) for (const v of quick ? [10] : [4, 12]) specs.push(`${i},${side},${v}`);
    if (boxes[i].top - terrain(boxes[i].cx, boxes[i].cz) > 5) for (const side of quick ? [0] : [0, 2, 4, 6]) specs.push(`stand,${i},${side}`);
  }
  info.style.display = 'none';
  renderer.domElement.style.display = 'none';
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;padding:12px;color:#e8e4f0;font:12px/1.35 monospace;white-space:pre';
  document.body.append(pre);
  const rows = [], head = `case            rise   should   got       at m   hull in  worst  bones in worst  steps  last6s  jit6s  roll  pitch  top W  form`;
  const line = (r) => `<a href="?case=${r.spec}" style="color:${r.ok ? '#9fd39b' : '#ff8a7a'}">${r.spec.padEnd(14)}</a>  ${r.rise.toFixed(1).padStart(4)}  ${r.should.padEnd(7)}  ${r.result.padEnd(8)}  ${String(r.at).padStart(5)}  ${String(r.hull).padStart(7)}  ${r.hullWorst.toFixed(2)}  ${String(r.bones).padStart(8)}  ${r.bonesWorst.toFixed(2)}  ${String(r.steps).padStart(5)}  ${String(r.tailSteps).padStart(6)}  ${r.tailJitter.toFixed(3)}  ${(r.roll * 57.3).toFixed(0).padStart(4)}  ${(r.pitch * 57.3).toFixed(0).padStart(5)}  ${r.topW.toFixed(1).padStart(5)}  ${r.form}`;
  window.__sweep = { done: false, rows };
  for (const spec of specs) {
    rows.push(runCase(spec));
    const bad = rows.filter((r) => !r.ok).length;
    pre.innerHTML = `SPIDER TANK SWEEP${quick ? ' (quick)' : ''}: ${rows.length} / ${specs.length}, ${bad} not as they should be  (climbs up to ${tank.climbMax} m)\n\n${head}\n${rows.map(line).join('\n')}`;
    await new Promise((res) => setTimeout(res, 0));
  }
  window.__sweep.done = true;
}

// ---- the flight recorder: every tick's dt and input from the page's load, so a session can be run again exactly; F9 saves it (with
// the last 15 s of the tank's state, to read), and dropping the file on the page (or &replay=url, or window.__replay) runs it again,
// in this same lab (&at=s jumps to a time). Nothing else moves the tank, so the replay is the session, frame for frame.
const rec = { kind: 'spidertank-flight', version: 1, query: location.search.replace(/[?&](replay|at)=[^&]*/g, ''), start: { ...S }, frames: [], last: [] };
let replay = null;
window.__lab = { S, tank, rec, time: () => t, replaying: () => replay && replay.i < replay.data.frames.length };   // (for scripts driving the lab)
function remember(dt, input) {
  rec.frames.push([dt, input[0] ? 1 : 0, input[1], input[2], input[3]]);
  rec.last.push({ t: +t.toFixed(3), S: { x: +S.x.toFixed(2), z: +S.z.toFixed(2), yaw: +S.yaw.toFixed(3), v: +S.v.toFixed(2) }, form: tank.form,
    pose: { W: +tank.pose.W.toFixed(2), P: +tank.pose.P.toFixed(3), R: +tank.pose.R.toFixed(3) }, climbing: tank.climbing,
    feet: tank.gait.chains.map((c) => [+c.F.x.toFixed(2), +c.F.y.toFixed(2), +c.F.z.toFixed(2), c.stepping ? 1 : 0]) });
  while (rec.last.length && rec.last[0].t < t - 15) rec.last.shift();
}
function save() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(rec)], { type: 'application/json' }));
  a.download = `spidertank-flight-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  flash = 'SAVED (F9)';
  flashT = 2;
}
let flash = '', flashT = 0;
addEventListener('keydown', (e) => { if (e.code === 'F9') { e.preventDefault(); if (!replay) save(); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  sessionStorage.setItem('spidertankReplay', JSON.stringify(data));
  const q = new URLSearchParams(data.query || '');
  q.set('replay', 'session');
  location.search = q;
});
async function loadReplay() {
  const src = Q.get('replay');
  const data = window.__replay || (Q.has('case') ? sweepCase(Q.get('case')).flight : src === 'session' ? JSON.parse(sessionStorage.getItem('spidertankReplay') || 'null') : src ? await (await fetch(src)).json() : null);
  if (!data) return;
  replay = { data, i: 0, clock: 0 };
  Object.assign(S, data.start);
  const at = num('at', 0);
  while (replay.i < data.frames.length && t < at) replayTick();         // (jumped to: run there unseen)
}
function replayTick() {
  const f = replay.data.frames[replay.i++];
  t += f[0];
  drive(sim, f[0], [!!f[1], f[2], f[3], f[4]]);
}

function frame() {
  const now = performance.now();
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = clock.paused ? (clock.step ? 1 / 30 : 0) : real * SLOW[clock.slow];
  clock.step = false;
  const sz = renderer.getSize(new THREE.Vector2());
  if (innerWidth > 0 && (sz.x !== innerWidth || sz.y !== innerHeight)) {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize();
  }
  if (replay) {                                                         // (the recorded ticks, at the lab's clock)
    replay.clock += dt;
    if (clock.paused && dt > 0) replay.clock = replay.data.frames[replay.i]?.[0] ?? 0;
    while (replay.i < replay.data.frames.length && replay.clock >= replay.data.frames[replay.i][0]) { replay.clock -= replay.data.frames[replay.i][0]; replayTick(); }
    if (replay.i >= replay.data.frames.length) clock.paused = true;
  } else if (dt > 0) {
    const input = readInput(now);
    auto = input[0];
    t += dt;
    drive(sim, dt, input);
    remember(dt, input);
  }
  flashT -= real;
  // the camera: round the tank (turning with it, smoothly), at what it looks at plus the slide
  const P = tank.root.position;
  cam.head += (THREE.MathUtils.euclideanModulo(S.yaw - cam.head + Math.PI, Math.PI * 2) - Math.PI) * (cam.set ? 1 - Math.exp(-real * 4) : 1);
  const k = cam.set ? 1 - Math.exp(-real * 20) : 1;                 // (a touch of smoothing: the hull bobs)
  cam.at.lerp(_p.set(P.x, Math.max(P.y, tank.pose.W - tank.hipY) + 2.8, P.z).add(_r.copy(cam.pan).applyAxisAngle(THREE.Object3D.DEFAULT_UP, cam.follow ? cam.head : 0)), k);
  cam.set = true;
  const yaw = cam.yaw + (cam.follow ? cam.head : 0), d = (cam.dist + (CAM === 'chase' && !Q.has('dist') ? S.v * 0.12 : 0)) * cam.zoom;
  camera.position.set(Math.sin(yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(yaw) * Math.cos(cam.pitch)).multiplyScalar(d).add(cam.at);
  camera.position.y = Math.max(camera.position.y, terrain(camera.position.x, camera.position.z) + 0.6);
  camera.lookAt(cam.at);
  sun.position.copy(P).add(_p.set(14, 26, 10));
  sun.target.position.copy(P);
  const B = tank.beam;
  const tick = clock.paused ? '  PAUSED (P, . a frame)' : clock.slow ? `  x${SLOW[clock.slow]}` : '';
  const mode = replay ? `REPLAY ${t.toFixed(1)} / ${replay.data.frames.reduce((a, f) => a + f[0], 0).toFixed(1)} s${replay.i >= replay.data.frames.length ? ' (end)' : ''}`
    : auto ? 'driving itself (press a key to drive)' : 'W ahead, S back, A/D turn, SPACE beam';
  info.innerHTML = `<b>${tank.model.userData.title}</b>  ${mode}${flashT > 0 ? `  ${flash}` : ''}\n`
    + `${S.v.toFixed(1)} m/s  ${tank.form.toUpperCase()}${B.state !== 'idle' ? `  BEAM ${B.state.toUpperCase()} ${B.t.toFixed(1)} s` : ''}  (closes up past ${tank.walkMax.toFixed(0)} m/s${tank.climbing ? ': not while climbing' : ''})${tick}\n`
    + `<span class="dim">drag: look round  right-drag: slide  wheel: zoom  H: ${cam.follow ? 'turning with it' : 'fixed'}  R: reset  P: pause  [ ]: slow  F9: save the flight (drop it here to replay)</span>`;
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
if (Q.has('sweep')) runSweep();
else { await loadReplay(); frame(); }
