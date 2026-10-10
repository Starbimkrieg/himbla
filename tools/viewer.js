// Dev-only model viewer: renders one model through the game's comic post pass on a turntable.
import * as THREE from 'three';
import { loadFonts } from '../src/fonts.js';
import { loadRunnerParts, loadShipParts, makeShuttle, makeFreighter, makeHoverCar } from '../src/models.js';
import { makeChimera, makeMite, LIVING, MODIFIERS, spliceGenes } from '../src/chimera.js';
import { ComicPost } from '../src/post.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

await Promise.all([loadFonts(), loadRunnerParts(), loadShipParts()]);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(Q.get('bg') || '#2a2440');
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 3000);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
sun.position.set(30, 60, 40);
sun.castShadow = true;
scene.add(sun, new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85));
const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x8a8398 }));
ground.receiveShadow = true;
scene.add(ground);
const post = new ComicPost(renderer, camera);

const m = Q.get('m') || 'shuttle';
let model, rig = null, anim = null, height = 2;
if (m === 'shuttle' || m === 'freighter') {
  rig = m === 'shuttle' ? makeShuttle({ stripe: Q.has('stripe') ? parseInt(Q.get('stripe'), 16) : undefined }) : makeFreighter({});
  model = rig.root;
  rig.setGear(num('gear', 1));
  rig.setRamp(num('ramp', 0));
  model.position.y = rig.gearH * num('gear', 1) + (num('gear', 1) < 1 ? 4 : 0);
  height = m === 'shuttle' ? 8 : 20;
} else if (m === 'hovercar') {
  model = makeHoverCar({}).root;
  model.position.y = 2;
} else if (m === 'lineup') {
  // &list=body/legs/head[/extra][/mod+mod],...  laid out in a row
  model = new THREE.Group();
  const anims = [];
  const list = (Q.get('list') || 'person/person/person,mite/mite/mite,car/car/car,junkbot/junkbot/junkbot,sapling/sapling/sapling,alien/alien/alien,pirate/pirate/pirate,voidling/voidling/voidling').split(',');
  list.forEach((spec, i) => {
    const [body, legs, head, extra, mods] = spec.split('/');
    const genes = { seed: 11 + i, body, legs, head, extraHead: extra && extra !== '-' ? extra : null, mods: (mods || '').split(/[+ ]/).filter(Boolean), size: 1.0, tint: { person: 0xff9f1c, voidling: 0xc77dff, mite: 0xb8e986, car: 0xff7ad9, pirate: 0x3a2b4f, sapling: 0x5fbf4a, junkbot: 0xffb347, alien: 0x7dd87a }[body] };
    const c = makeChimera(genes);
    c.root.position.x = (i - (list.length - 1) / 2) * 3.2;
    model.add(c.root);
    anims.push(c.anim);
  });
  anim = (t, sp) => anims.forEach((a) => a(t, sp));
} else {
  let genes;
  if (m === 'mite') genes = null;
  else if (Q.has('parts')) {
    const [body, legs, head, extraHead] = Q.get('parts').split(',');
    genes = { seed: num('seed', 1) | 0, body, legs, head, extraHead: extraHead || null, mods: (Q.get('mods') || '').split(',').filter(Boolean), size: num('size', 1.1), tint: Q.has('tint') ? parseInt(Q.get('tint'), 16) : 0xff9f1c };
  } else {
    const rr = (() => { let s = num('seed', 7) | 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const items = [{ kind: LIVING[Math.floor(rr() * LIVING.length)] }, { kind: LIVING[Math.floor(rr() * LIVING.length)] }];
    if (rr() < 0.5) items.push({ kind: Object.keys(MODIFIERS)[Math.floor(rr() * 10)] });
    genes = spliceGenes(items, num('seed', 7) | 0);
  }
  const c = genes ? makeChimera(genes) : makeMite();
  model = c.root;
  anim = c.anim;
  height = c.height;
  document.getElementById('ui').textContent = genes ? `${genes.body}/${genes.legs}/${genes.head}${genes.extraHead ? '+' + genes.extraHead : ''} [${genes.mods.join(',')}] size ${genes.size.toFixed(2)}` : 'mite';
}
scene.add(model);
model.traverse((o) => { if (o.isMesh && !o.userData.isInk) o.castShadow = true; });
const box = new THREE.Box3().setFromObject(model);
const ctr = box.getCenter(new THREE.Vector3());
const rad = box.getSize(new THREE.Vector3()).length() / 2;
let yaw = THREE.MathUtils.degToRad(num('yaw', 35)), pitch = THREE.MathUtils.degToRad(num('pitch', 18));
const dist = num('dist', rad * 2.6);
let t = 0, last = performance.now();
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
  if (Q.get('spin') === '1') yaw += dt * 0.4;
  camera.position.set(ctr.x + Math.sin(yaw) * Math.cos(pitch) * dist, ctr.y + Math.sin(pitch) * dist, ctr.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(ctr);
  if (rig) rig.setThrust(num('thrust', 0), num('lift', 0), t);
  if (anim) anim(t, num('speed', 6));
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.viewer = { scene, camera, model, rig };
