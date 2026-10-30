// Dev-only: Zbornak's spider tank lab (src/spidertank.js; docs/spidertank/). It drives round a circle over rolling ground with
// crates, low walls and a few tall blocks on it: walking on its eight legs (src/gait.js), running, closing up into its skimming bead
// past 40 m/s and back, stopping to fire the reactor beam. It drives itself until you press a key: W/S speed, A/D turn, hold SPACE
// for the beam. A test lane off the circle (&demo=wall) has a crate it climbs and a block it can't. Query parameters are in the HTML.
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
  addBox(Math.cos(a) * (R + off), Math.sin(a) * (R + off), rr() * 3, 1.8 + rr() * 2.4, 1.8 + rr() * 2.4, 0.7 + rr() * 1.3, boxMat);
}
for (let k = 0; k < 4; k++) {                                          // low walls across the way
  const a = (k / 4) * Math.PI * 2 + 1.0;
  addBox(Math.cos(a) * R, Math.sin(a) * R, -a, 14, 0.7, 0.9, wallMat);
}
for (let k = 0; k < 9; k++) {                                          // tall blocks round about, for scale
  const a = (k / 9) * Math.PI * 2, rad = R + 22 + rr() * 30;
  addBox(Math.cos(a) * rad, Math.sin(a) * rad, rr() * 3, 6 + rr() * 8, 6 + rr() * 8, 6 + rr() * 12, blockMat);
}
// the test lane, south of the circle: a crate it climbs over, then a block too tall to clear (its legs reach up onto it; it stops)
const LANE = { x: 0, z0: -175 };
addBox(LANE.x, -152, 0, 6, 3.5, 2.3, boxMat);
addBox(LANE.x, -128, 0, 12, 6, 4.8, blockMat);
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

// ---- the drive: scripted until a key is pressed (and again a few seconds after the last) ----
const keys = new Set();
let lastKey = Q.get('auto') === '0' ? 0 : -1e9;
addEventListener('keydown', (e) => { keys.add(e.code); lastKey = performance.now(); if (e.code === 'Space') e.preventDefault(); });
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
const hull = [-1.9, 0, 1.9].flatMap((x) => [-2.8, 0, 2.8].map((z) => [x, z]));
// the highest thing under its hull at x, z
function underHull(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return Math.max(...hull.map(([hx, hz]) => topAt(x + hx * c + hz * s, z - hx * s + hz * c)));
}
// what it can't clear stops it: moving onto something higher than what its legs can lift it over (never stuck where it already is)
const blocked = (x, z, yaw) => { const top = underHull(x, z, yaw); return top > tank.clearTop && top > underHull(S.x, S.z, S.yaw) + 0.05; };
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
  let want, trigger, turn = 0;
  if (auto) {
    [want, trigger] = script(t);
  } else {
    want = keys.has('KeyW') ? 90 : keys.has('KeyS') ? 0 : S.v;
    trigger = keys.has('Space');
    turn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  }
  want = Math.min(want, 90) * tank.speedCap;
  const acc = tank.form === 'walk' ? 7 : 20;
  S.v += THREE.MathUtils.clamp(want - S.v, -14 * dt, acc * dt);
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
  S.yaw = nyaw;
  if (blocked(nx, nz, nyaw)) S.v = 0;
  else { S.x = nx; S.z = nz; }
  fwd.set(Math.sin(S.yaw), 0, Math.cos(S.yaw)); side.set(fwd.z, 0, -fwd.x);
  // on the terrain under its middle: it rides up over crates on its own legs (spidertank.js)
  tank.root.position.set(S.x, terrain(S.x, S.z), S.z);
  tank.root.rotation.set(0, S.yaw, 0);
  tank.update(dt, { speed: S.v, ground: groundAt, trigger: !!trigger });
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
  info.innerHTML = `<b>${tank.model.userData.title}</b>  ${auto ? 'driving itself (press a key to drive)' : 'W/S speed, A/D turn, SPACE beam'}\n`
    + `${S.v.toFixed(1)} m/s  ${tank.form.toUpperCase()}${B.state !== 'idle' ? `  BEAM ${B.state.toUpperCase()} ${B.t.toFixed(1)} s` : ''}  (closes up past ${tank.walkMax.toFixed(0)} m/s)`;
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
