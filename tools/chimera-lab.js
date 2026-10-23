// Dev-only: the chimera builder's lab. Puts chimeras together with src/chimerabuild.js and draws them through the game's comic post pass:
// one at a time (pick its parts, mutations and seed) or a grid of twelve random ones (the reactor's own random draw, chimeragenes.js).
// The mouse orbits (drag) and zooms (wheel).
import * as THREE from 'three';
import { ComicPost } from '../src/post.js';
import { chimeraBuilder, BUILT_KINDS, MUTATIONS } from '../src/chimerabuild.js';
import { spliceGenes, MODIFIERS } from '../src/chimeragenes.js';
import { mulberry32 } from '../src/rng.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const build = await chimeraBuilder();

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2440');
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.05, 500);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -12; sun.shadow.camera.right = sun.shadow.camera.top = 12;
scene.add(sun, new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85));
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x8a8398 }));
ground.receiveShadow = true;
scene.add(ground);
const post = new ComicPost(renderer, camera);

// ---- the panel ----
const MOD_ITEM = Object.fromEntries(Object.entries(MODIFIERS).map(([item, m]) => [m, item]));
const S = {
  body: Q.get('body') || 'car', legs: Q.get('legs') || 'mite', head: Q.get('head') || 'person', extra: Q.get('extra') || '',
  mods: new Set((Q.get('mods') || '').split(',').filter(Boolean)), seed: num('seed', 7), size: num('size', 1.1), crown: Q.get('crown') === '1',
  grid: Q.get('grid') === '1', modgrid: Q.get('modgrid') === '1',
};
const ui = document.getElementById('ui');
if (Q.get('ui') === '0') ui.style.display = 'none';
const sel = (key, opts) => `<label>${key}<select data-k="${key}">${opts.map((o) => `<option${S[key] === o ? ' selected' : ''} value="${o}">${o || '(none)'}</option>`).join('')}</select></label>`;
ui.innerHTML = `<h1>CHIMERA LAB</h1>${sel('body', BUILT_KINDS)}${sel('legs', BUILT_KINDS)}${sel('head', BUILT_KINDS)}${sel('extra', ['', ...BUILT_KINDS])}
  <div class="mods">${MUTATIONS.map((m) => `<label><input type="checkbox" data-m="${m}"${S.mods.has(m) ? ' checked' : ''}> ${m}</label>`).join('')}</div>
  <label>seed<input type="number" data-k="seed" value="${S.seed}"></label>
  <label>size<input type="number" data-k="size" value="${S.size}" step="0.05" min="0.75" max="1.45"></label>
  <label style="justify-content:flex-start"><input type="checkbox" data-k="crown"${S.crown ? ' checked' : ''}> Triple Crown</label>
  <button data-a="seed">NEW SEED (other looks, grafts)</button><button data-a="random">RANDOM CHIMERA</button><button data-a="grid">GRID OF 12 RANDOM</button><button data-a="modgrid">THIS ONE, EACH MUTATION</button>
  <small>Drag to orbit, wheel to zoom. The seed picks each part's look, the people's outfits, and where the grafts and mutations grow.</small>`;
ui.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.m) { if (t.checked) S.mods.add(t.dataset.m); else S.mods.delete(t.dataset.m); }
  else if (t.dataset.k === 'crown') S.crown = t.checked;
  else if (t.dataset.k) S[t.dataset.k] = t.type === 'number' ? parseFloat(t.value) : t.value;
  S.grid = S.modgrid = false;
  show();
});
ui.addEventListener('click', (e) => {
  const a = e.target.dataset && e.target.dataset.a;
  if (!a) return;
  if (a !== 'modgrid') S.seed = Math.floor(Math.random() * 1e6);
  ui.querySelector('[data-k=seed]').value = S.seed;
  if (a === 'random') {
    const g = randomGenes(mulberry32(S.seed));
    Object.assign(S, { body: g.body, legs: g.legs, head: g.head, extra: g.extraHead || '', mods: new Set(g.mods), size: g.size, grid: false });
    for (const k of ['body', 'legs', 'head', 'extra']) ui.querySelector(`[data-k=${k}]`).value = S[k];
    for (const c of ui.querySelectorAll('[data-m]')) c.checked = S.mods.has(c.dataset.m);
  }
  S.grid = a === 'grid' ? true : a === 'seed' ? S.grid : false;
  S.modgrid = a === 'modgrid';
  show();
});

// the reactor's own random draw: two or three living kinds (at least two different), a material now and then
function randomGenes(rr) {
  const pick = (a) => a[Math.floor(rr() * a.length)];
  const a = pick(BUILT_KINDS);
  const items = [{ kind: a }, { kind: pick(BUILT_KINDS.filter((k) => k !== a)) }];
  if (rr() < 0.35) items.push({ kind: pick(BUILT_KINDS) });
  for (const m of MUTATIONS) if (rr() < 0.14) items.push({ kind: MOD_ITEM[m] });
  return spliceGenes(items, Math.floor(rr() * 1e9));
}

// ---- the scene ----
let shown = [], tags = [];
function clear() {
  for (const s of shown) scene.remove(s.root);
  for (const t of tags) t.remove();
  shown = []; tags = [];
}
function add(genes, x, z, label) {
  const c = build(genes);
  c.root.position.set(x, 0, z);
  c.root.rotation.y = 0.5;
  scene.add(c.root);
  shown.push(c);
  if (label) { const el = document.createElement('div'); el.className = 'tag'; el.textContent = label; document.body.appendChild(el); tags.push(el); c.tag = el; c.tagY = c.height + 0.2; }
}
const describe = (g) => `${g.body} body · ${g.legs} legs · ${g.head} head${g.extraHead ? ` + ${g.extraHead}` : ''}${g.mods.length ? ` · ${g.mods.join(', ')}` : ''}`;
let target = new THREE.Vector3(), dist = 4;
function show() {
  clear();
  const one = (mods) => ({ seed: S.seed, body: S.body, legs: S.legs, head: S.head, extraHead: S.extra || null, mods, size: S.size, crown: S.crown, parents: [...new Set([S.body, S.legs, S.head, S.extra].filter(Boolean))] });
  if (S.grid) {
    const rr = mulberry32(S.seed);
    for (let i = 0; i < 12; i++) {
      const g = randomGenes(rr);
      add(g, (i % 4 - 1.5) * 2.8, (Math.floor(i / 4) - 1) * 3.4, describe(g));
    }
    target.set(0, 0.5, 0); dist = 15;
    document.getElementById('info').textContent = `twelve random chimeras, seed ${S.seed}`;
  } else if (S.modgrid) {
    MUTATIONS.forEach((m, i) => add(one([m]), (i % 4 - 1.5) * 2.4, (Math.floor(i / 4) - 0.5) * 3, m));
    target.set(0, 0.5, 0); dist = 11;
    document.getElementById('info').textContent = `${describe(one([]))}: each mutation, seed ${S.seed}`;
  } else {
    const genes = one([...S.mods]);
    add(genes, 0, 0);
    target.set(0, shown[0].height * 0.45, 0); dist = Math.max(2.6, shown[0].height * 2.6);
    document.getElementById('info').textContent = `${describe(genes)}\nseed ${S.seed} · ${shown[0].height.toFixed(2)} m tall`;
  }
}
show();

// ---- the camera: drag to orbit, wheel to zoom ----
let yaw = THREE.MathUtils.degToRad(num('yaw', 25)), pitch = THREE.MathUtils.degToRad(num('pitch', 14)), drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw -= (e.clientX - drag[0]) * 0.008; pitch = Math.max(-0.2, Math.min(1.3, pitch + (e.clientY - drag[1]) * 0.006));
  drag = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener('wheel', (e) => { dist *= Math.exp(e.deltaY * 0.001); }, { passive: true });

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
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  for (const c of shown) {
    c.anim(t, num('speed', 0));
    if (c.tag) {
      const p = c.root.position.clone().add(new THREE.Vector3(0, c.tagY, 0)).project(camera);
      c.tag.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`; c.tag.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    }
  }
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.lab = { scene, camera, build, show, S };
