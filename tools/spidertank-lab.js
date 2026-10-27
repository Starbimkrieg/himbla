// Dev-only: Zbornak's spider tank lab (src/spidertank.js; docs/spidertank/). It drives round a circle over rolling ground with
// crates, low walls and a few tall blocks on it: walking on its eight legs (src/gait.js), running, closing up into its skimming bead
// and back, stopping to fire the reactor beam. It drives itself until you press a key: W/S speed,
// A/D turn, SHIFT overdrive, hold SPACE for the beam. Query parameters are in the HTML file.
import * as THREE from 'three';
import { ComicPost } from '../src/post.js';
import { loadSpiderTank, makeSpiderTank } from '../src/spidertank.js';

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
  boxes.push({ cx, cz, c: Math.cos(yaw), s: Math.sin(yaw), hx: w / 2, hz: d / 2, top });
}
for (let k = 0; k < 16; k++) {                                         // crates on the way round, some under the feet, some under the hull
  const a = (k / 16) * Math.PI * 2 + 0.25, off = (rr() - 0.5) * 9;
  addBox(Math.cos(a) * (R + off), Math.sin(a) * (R + off), rr() * 3, 1.8 + rr() * 2.4, 1.8 + rr() * 2.4, 0.7 + rr() * 1.9, boxMat);
}
for (let k = 0; k < 4; k++) {                                          // low walls across the way
  const a = (k / 4) * Math.PI * 2 + 1.0;
  addBox(Math.cos(a) * R, Math.sin(a) * R, -a, 14, 0.7, 0.9, wallMat);
}
for (let k = 0; k < 9; k++) {                                          // tall blocks round about, for scale
  const a = (k / 9) * Math.PI * 2, rad = R + 22 + rr() * 30;
  addBox(Math.cos(a) * rad, Math.sin(a) * rad, rr() * 3, 6 + rr() * 8, 6 + rr() * 8, 6 + rr() * 12, blockMat);
}
const groundGeo = new THREE.PlaneGeometry(420, 420, 300, 300).rotateX(-Math.PI / 2);
{
  const P = groundGeo.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, terrain(P.getX(i), P.getZ(i)));
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshToonMaterial({ color: 0x8a8398 }));
ground.receiveShadow = true;
scene.add(ground);
// the highest thing under a point: a box's top, or the ground
function topAt(x, z) {
  let y = terrain(x, z);
  for (const b of boxes) {
    const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz && b.top > y) y = b.top;
  }
  return y;
}
const groundAt = (p, out) => out.set(p.x, topAt(p.x, p.z), p.z);

// ---- the drive: scripted until a key is pressed (and again a few seconds after the last) ----
const keys = new Set();
let lastKey = Q.get('auto') === '0' ? 0 : -1e9;
addEventListener('keydown', (e) => { keys.add(e.code); lastKey = performance.now(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', (e) => keys.delete(e.code));
// the whole drive, looped: [until (s), speed (m/s), overdrive, trigger]
const DRIVE = [[5, 5, 0, 0], [10, 14, 0, 0], [14, 26, 0, 0], [20, 70, 1, 0], [23, 22, 0, 0], [26, 6, 0, 0], [27, 1.5, 0, 0], [32.5, 1.5, 0, 1], [35, 4, 0, 0]];
function script(t) {
  if (DEMO === 'walk') return [num('speed', 4), 0, 0];
  if (DEMO === 'run') return [num('speed', 24), 0, 0];
  if (DEMO === 'skim') return [70, 1, 0];
  if (DEMO === 'beam') return [0.8, 0, t % 7 < 6 ? 1 : 0];
  if (DEMO === 'fold') return [5, t % 5 < 2.5 ? 1 : 0, 0];
  const s = t % DRIVE[DRIVE.length - 1][0];
  const p = DRIVE.find((d) => s < d[0]);
  return [p[1], p[2], p[3]];
}

const kit = await loadSpiderTank();
const tank = makeSpiderTank(kit);
scene.add(tank.root);
const S = { x: R, z: 0, yaw: 0, v: 0, y: terrain(R, 0), lap: 0 };
const fwd = new THREE.Vector3(), side = new THREE.Vector3(), camAt = new THREE.Vector3(), camLook = new THREE.Vector3(), _p = new THREE.Vector3();
let t = 0, last = performance.now(), auto = true;
const info = document.getElementById('info');
if (Q.get('ui') === '0') info.style.display = 'none';

// the orbit camera
let oyaw = THREE.MathUtils.degToRad(num('yaw', 35)), opitch = THREE.MathUtils.degToRad(num('pitch', 16)), odist = num('dist', 24), drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  oyaw -= (e.clientX - drag[0]) * 0.008; opitch = Math.max(-0.1, Math.min(1.3, opitch + (e.clientY - drag[1]) * 0.006));
  drag = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener('wheel', (e) => { odist *= Math.exp(e.deltaY * 0.001); }, { passive: true });

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  const sz = renderer.getSize(new THREE.Vector2());
  if (innerWidth > 0 && (sz.x !== innerWidth || sz.y !== innerHeight)) {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize();
  }
  auto = now - lastKey > 6000;
  let want, overdrive, trigger, turn = 0;
  if (auto) {
    [want, overdrive, trigger] = script(t);
  } else {
    const top = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 85 : tank.walkMax;
    want = keys.has('KeyW') ? top : keys.has('KeyS') ? 0 : Math.min(S.v, top);
    overdrive = top > tank.walkMax && S.v > tank.walkMax * 0.6;
    trigger = keys.has('Space');
    turn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  }
  if (overdrive && tank.form === 'walk' && S.v < tank.walkMax * 0.6) overdrive = auto;      // (it folds once it's going)
  want = Math.min(want, tank.form === 'skim' ? 90 : tank.walkMax) * tank.speedCap;
  const acc = tank.form === 'skim' ? 22 : 9;
  S.v += THREE.MathUtils.clamp(want - S.v, -14 * dt, acc * dt);
  // round the circle (auto) or where it's steered
  if (auto) {
    const r = Math.hypot(S.x, S.z), a = Math.atan2(S.z, S.x) + (S.v * dt) / R;
    S.x = Math.cos(a) * R; S.z = Math.sin(a) * R; S.yaw = -a;
    if (Math.abs(r - R) > 1) { S.x = Math.cos(a) * R; S.z = Math.sin(a) * R; }
  } else {
    S.yaw += turn * dt * (1.1 - 0.7 * Math.min(1, S.v / 60));
    S.x += Math.sin(S.yaw) * S.v * dt; S.z += Math.cos(S.yaw) * S.v * dt;
  }
  // its height: the ground under the hull, or what stands under it taller than its belly clears
  fwd.set(Math.sin(S.yaw), 0, Math.cos(S.yaw)); side.set(fwd.z, 0, -fwd.x);
  let top = -Infinity;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) top = Math.max(top, topAt(S.x + side.x * a * 1.8 + fwd.x * b * 2.8, S.z + side.z * a * 1.8 + fwd.z * b * 2.8));
  const belly = tank.hipY * (tank.form === 'skim' ? 0.35 : 0.62);
  const y = Math.max(terrain(S.x, S.z), top - belly);
  S.y += (y - S.y) * Math.min(1, dt * (y > S.y ? 6 : 3));
  tank.root.position.set(S.x, S.y, S.z);
  tank.root.rotation.set(0, S.yaw, 0);
  tank.update(dt, { speed: S.v, ground: groundAt, overdrive: !!overdrive, trigger: !!trigger });
  // the camera
  const P = tank.root.position;
  if (CAM === 'orbit') {
    camera.position.set(P.x + Math.sin(oyaw) * Math.cos(opitch) * odist, P.y + 3 + Math.sin(opitch) * odist, P.z + Math.cos(oyaw) * Math.cos(opitch) * odist);
    camera.lookAt(P.x, P.y + 3, P.z);
  } else {
    const d = num('dist', CAM === 'chase' ? 17 + S.v * 0.12 : 20);
    if (CAM === 'side') camAt.copy(P).addScaledVector(side, -d).addScaledVector(fwd, 2).setY(P.y + 4);
    else if (CAM === 'top') camAt.copy(P).addScaledVector(fwd, -0.5).setY(P.y + d * 1.2);
    else if (CAM === 'rear') camAt.copy(P).addScaledVector(fwd, -d).addScaledVector(side, -d * 0.35).setY(P.y + 3);
    else if (CAM === 'front') camAt.copy(P).addScaledVector(fwd, d).addScaledVector(side, -d * 0.45).setY(P.y + 3.5);
    else camAt.copy(P).addScaledVector(fwd, -d).addScaledVector(side, -d * 0.35).setY(P.y + 6.5 + S.v * 0.03);
    camAt.y = Math.max(camAt.y, terrain(camAt.x, camAt.z) + 1.5);
    if (t < 0.1) camera.position.copy(camAt);
    camera.position.lerp(camAt, 1 - Math.exp(-dt * 5));
    camLook.lerp(_p.copy(P).setY(P.y + 2.8), t < 0.1 ? 1 : 1 - Math.exp(-dt * 8));
    camera.lookAt(camLook);
  }
  sun.position.copy(P).add(_p.set(14, 26, 10));
  sun.target.position.copy(P);
  const B = tank.beam;
  info.innerHTML = `<b>${tank.model.userData.title}</b>  ${auto ? 'driving itself (press a key to drive)' : 'W/S speed, A/D turn, SHIFT overdrive, SPACE beam'}\n`
    + `${S.v.toFixed(1)} m/s  ${tank.form.toUpperCase()}${B.state !== 'idle' ? `  BEAM ${B.state.toUpperCase()} ${B.t.toFixed(1)} s` : ''}  (folds past ${tank.walkMax.toFixed(0)} m/s)`;
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
