// Dev-only: Zbornak's spider tank lab (src/spidertank.js; docs/spidertank/). It drives round a circle over rolling ground with
// crates, low walls and a few tall blocks on it: walking on its eight legs (src/gait.js), running, closing up into its skimming bead
// past 40 m/s and back, stopping to fire the reactor beam. It drives itself until you press a key: W ahead, S back (to 18 m/s), A/D
// turn, hold SPACE for the beam. A test lane off the circle (&demo=wall) has things to climb and a block it can't. Look round with the
// mouse; pause and slow it down. Query parameters and keys are in the HTML.
import * as THREE from 'three';
import { ComicPost } from '../src/post.js';
import { loadSpiderTank, makeSpiderTank, HULL } from '../src/spidertank.js';

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
for (let k = 0; k < 9; k++) {                                           // blocks round about: platforms to climb (to 5 m), and taller
  const a = (k / 9) * Math.PI * 2, rad = R + 22 + rr() * 30;
  addBox(Math.cos(a) * rad, Math.sin(a) * rad, rr() * 3, 6 + rr() * 8, 6 + rr() * 8, k % 2 ? 3 + rr() * 2 : 6 + rr() * 12, blockMat);
}
// the test lane, south of the circle: a crate it walks over, a 3.2 m step and a 4.6 m block it climbs (nose up, its front feet on the
// face and then the top) and down off, then an 8 m block too tall to climb: it stops at it, its front feet gripping its face
const LANE = { x: 0, z0: -185 };
addBox(LANE.x, -165, 0, 6, 3.5, 2.3, boxMat);
addBox(LANE.x, -132, 0, 16, 16, 3.2, blockMat);
addBox(LANE.x, -100, 0, 14, 9, 4.6, blockMat);
addBox(LANE.x, -70, 0, 14, 6, 8, blockMat);
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
// the whole drive, looped: [until (s), speed (m/s), trigger]; it closes up by itself past 40 m/s and opens out under 34
const DRIVE = [[5, 5, 0], [10, 14, 0], [15, 28, 0], [19, 38, 0], [25, 70, 0], [30, 20, 0], [33, 6, 0], [34, 1.5, 0], [39.5, 1.5, 1], [42, 4, 0]];
function script(t) {
  if (DEMO === 'walk' || DEMO === 'climb') return [num('speed', 4), 0];
  if (DEMO === 'wall') return [num('speed', 3), 0];
  if (DEMO === 'run') return [num('speed', 24), 0];
  if (DEMO === 'skim') return [num('speed', 70), 0];
  if (DEMO === 'beam') return [0.8, t % 7 < 6 ? 1 : 0];
  if (DEMO === 'fold') return [t % 10 < 5 ? 46 : 26, 0];
  const s = t % DRIVE[DRIVE.length - 1][0];
  const p = DRIVE.find((d) => s < d[0]);
  return [p[1], p[2]];
}

const kit = await loadSpiderTank();
const tank = makeSpiderTank(kit);
scene.add(tank.root);
const S = DEMO === 'wall' ? { x: LANE.x, z: LANE.z0, yaw: 0, v: 0 } : { x: R, z: 0, yaw: 0, v: 0 };
if (DEMO === 'skim') { tank.fold = 1; S.v = num('speed', 70); }                    // (skimming from the start)
// how far into what it can't clear its hull would be, at x, z, turned yaw (0: clear). It never moves or turns deeper in than it is:
// driving, it slides along what it meets; driving itself, it stops.
function sink(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let deep = 0;
  HULL.forEach(([hx, hz], i) => { deep = Math.max(deep, topAt(x + hx * c + hz * s, z - hx * s + hz * c) - tank.clearAt[i]); });
  return deep;
}
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

// the drive and the tank, one tick of dt (the lab's clock: paused, slowed or stepped)
function step(dt, now) {
  auto = now - lastKey > 6000 && ![...keys].some((k) => DRIVE_KEYS.has(k));   // (not while a key is held)
  let want, trigger, turn = 0;
  if (auto) {
    [want, trigger] = script(t);
  } else {
    want = keys.has('KeyW') ? 90 : keys.has('KeyS') ? -tank.reverseMax : S.v;
    trigger = keys.has('Space');
    turn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  }
  want = THREE.MathUtils.clamp(want, -tank.reverseMax, 90) * tank.speedCap;
  const acc = tank.form === 'walk' ? 7 : 20;                           // (braking, and backing up, at 14)
  S.v += THREE.MathUtils.clamp(want - S.v, want < S.v ? -14 * dt : 0, want > S.v ? (S.v < 0 ? 14 : acc) * dt : 0);
  // round the circle (auto), down the test lane, or where it's steered; not into what it can't clear
  let nx, nz, nyaw = S.yaw;
  if (auto && DEMO === 'wall') { nx = LANE.x; nz = S.z + S.v * dt; nyaw = 0; }
  else if (auto) {
    const a = Math.atan2(S.z, S.x) + (S.v * dt) / R;
    nx = Math.cos(a) * R; nz = Math.sin(a) * R; nyaw = -a;
  } else {
    nyaw += turn * dt * (1.1 - 0.7 * Math.min(1, S.v / 60));
    nx = S.x + Math.sin(nyaw) * S.v * dt; nz = S.z + Math.cos(nyaw) * S.v * dt;
  }
  const deep = sink(S.x, S.z, S.yaw) + 1e-3, ok = (x, z, yaw) => sink(x, z, yaw) <= deep;
  if (ok(nx, nz, nyaw)) { S.x = nx; S.z = nz; S.yaw = nyaw; }
  else if (!auto && ok(nx, nz, S.yaw)) { S.x = nx; S.z = nz; }
  else if (!auto && ok(nx, S.z, S.yaw)) S.x = nx;
  else if (!auto && ok(S.x, nz, S.yaw)) S.z = nz;
  else { S.v = 0; if (ok(S.x, S.z, nyaw)) S.yaw = nyaw; }
  // on the terrain under its middle: it rides up over crates on its own legs (spidertank.js)
  tank.root.position.set(S.x, terrain(S.x, S.z), S.z);
  tank.root.rotation.set(0, S.yaw, 0);
  tank.update(dt, { speed: S.v, push: want, ground: groundAt, ray: rayAt, trigger: !!trigger });   // (push: held up, it climbs)
}

function frame() {
  const now = performance.now();
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = clock.paused ? (clock.step ? 1 / 30 : 0) : real * SLOW[clock.slow];
  clock.step = false;
  t += dt;
  const sz = renderer.getSize(new THREE.Vector2());
  if (innerWidth > 0 && (sz.x !== innerWidth || sz.y !== innerHeight)) {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize();
  }
  if (dt > 0) step(dt, now);
  // the camera: round the tank (turning with it, smoothly), at what it looks at plus the slide
  const P = tank.root.position;
  cam.head += (THREE.MathUtils.euclideanModulo(S.yaw - cam.head + Math.PI, Math.PI * 2) - Math.PI) * (cam.set ? 1 - Math.exp(-real * 4) : 1);
  const k = cam.set ? 1 - Math.exp(-real * 20) : 1;                 // (a touch of smoothing: the hull bobs)
  cam.at.lerp(_p.set(P.x, P.y + 2.8, P.z).add(_r.copy(cam.pan).applyAxisAngle(THREE.Object3D.DEFAULT_UP, cam.follow ? cam.head : 0)), k);
  cam.set = true;
  const yaw = cam.yaw + (cam.follow ? cam.head : 0), d = (cam.dist + (CAM === 'chase' && !Q.has('dist') ? S.v * 0.12 : 0)) * cam.zoom;
  camera.position.set(Math.sin(yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(yaw) * Math.cos(cam.pitch)).multiplyScalar(d).add(cam.at);
  camera.position.y = Math.max(camera.position.y, terrain(camera.position.x, camera.position.z) + 0.6);
  camera.lookAt(cam.at);
  sun.position.copy(P).add(_p.set(14, 26, 10));
  sun.target.position.copy(P);
  const B = tank.beam;
  const tick = clock.paused ? '  PAUSED (P, . a frame)' : clock.slow ? `  x${SLOW[clock.slow]}` : '';
  info.innerHTML = `<b>${tank.model.userData.title}</b>  ${auto ? 'driving itself (press a key to drive)' : 'W ahead, S back, A/D turn, SPACE beam'}\n`
    + `${S.v.toFixed(1)} m/s  ${tank.form.toUpperCase()}${B.state !== 'idle' ? `  BEAM ${B.state.toUpperCase()} ${B.t.toFixed(1)} s` : ''}  (closes up past ${tank.walkMax.toFixed(0)} m/s)${tick}\n`
    + `<span class="dim">drag: look round  right-drag: slide  wheel: zoom  H: ${cam.follow ? 'turning with it' : 'fixed'}  R: reset  P: pause  [ ]: slow</span>`;
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
