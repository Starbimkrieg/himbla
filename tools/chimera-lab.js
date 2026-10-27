// Dev-only: the chimera builder's lab. Puts chimeras together with src/chimerabuild.js (the kit: tools/blender/build_chimera.py) and draws
// them through the game's comic post pass: one at a time (pick its parts, a settler's outfit, mutations and seed), a grid of twelve random
// ones (the reactor's own random draw, chimeragenes.js), one in each mutation, every kind in its looks, or the showcase.
// The mouse orbits (drag) and zooms (wheel).
import * as THREE from 'three';
import { ComicPost } from '../src/post.js';
import { chimeraBuilder, KINDS, MUTATIONS } from '../src/chimerabuild.js';
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
sun.shadow.camera.left = sun.shadow.camera.bottom = -14; sun.shadow.camera.right = sun.shadow.camera.top = 14;
scene.add(sun, new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85));
// &walk=1: the chimera walks a circle over bumpy ground (stopping now and then), its jointed legs on it (src/gait.js)
const WALK = Q.get('walk') === '1';
const bump = (x, z) => (WALK ? 0.14 * Math.sin(x * 1.1 + 0.4) * Math.cos(z * 0.9) + 0.06 * Math.sin(x * 2.7 + z * 1.9) + 0.03 * Math.cos(x * 5.3 - z * 4.1) : 0);
const groundAt = (p, out) => out.set(p.x, bump(p.x, p.z), p.z);
const groundGeo = WALK ? new THREE.PlaneGeometry(40, 40, 240, 240).rotateX(-Math.PI / 2) : new THREE.CircleGeometry(80, 48).rotateX(-Math.PI / 2);
if (WALK) {
  const P = groundGeo.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, bump(P.getX(i), P.getZ(i)));
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshToonMaterial({ color: 0x8a8398 }));
ground.receiveShadow = true;
scene.add(ground);
const post = new ComicPost(renderer, camera);

// ---- the panel ----
const MOD_ITEM = Object.fromEntries(Object.entries(MODIFIERS).map(([item, m]) => [m, item]));
const OUTFITS = ['', 'coveralls', 'engineer', 'lab', 'trader', 'elder', 'casual'];
const MODES = ['grid', 'modgrid', 'kinds', 'showcase'];
const S = {
  body: Q.get('body') || 'car', legs: Q.get('legs') || 'mite', head: Q.get('head') || 'person', extra: Q.get('extra') || '',
  outfit: Q.get('outfit') || '', headgear: Q.get('headgear') || '',
  mods: new Set((Q.get('mods') || '').split(',').filter(Boolean)), seed: num('seed', 7), size: num('size', 1.1), crown: Q.get('crown') === '1',
  style: Q.has('style') ? Q.get('style').split(',').map(Number) : null,     // (&style=legs,body,head: a mite's, car's or sapling's looks, 0 to 2)
  far: Q.get('far') === '1', mode: MODES.find((m) => Q.get(m) === '1') || '',
};
const ui = document.getElementById('ui');
if (Q.get('ui') === '0') ui.style.display = 'none';
const sel = (key, opts) => `<label>${key}<select data-k="${key}">${opts.map((o) => `<option${S[key] === o ? ' selected' : ''} value="${o}">${o || '(any)'}</option>`).join('')}</select></label>`;
ui.innerHTML = `<h1>CHIMERA LAB</h1>${sel('body', KINDS)}${sel('legs', KINDS)}${sel('head', KINDS)}${sel('extra', ['', ...KINDS])}
  ${sel('outfit', OUTFITS)}${sel('headgear', ['', 'sealed', 'bowl'])}
  <div class="mods">${MUTATIONS.map((m) => `<label><input type="checkbox" data-m="${m}"${S.mods.has(m) ? ' checked' : ''}> ${m}</label>`).join('')}</div>
  <label>seed<input type="number" data-k="seed" value="${S.seed}"></label>
  <label>size<input type="number" data-k="size" value="${S.size}" step="0.05" min="0.75" max="1.45"></label>
  <label style="justify-content:flex-start"><input type="checkbox" data-k="crown"${S.crown ? ' checked' : ''}> Triple Crown</label>
  <label style="justify-content:flex-start"><input type="checkbox" data-k="far"${S.far ? ' checked' : ''}> far LOD</label>
  <button data-a="seed">NEW SEED (other looks)</button><button data-a="random">RANDOM CHIMERA</button><button data-a="grid">GRID OF 12 RANDOM</button>
  <button data-a="modgrid">THIS ONE, EACH MUTATION</button><button data-a="kinds">EVERY KIND, THREE SEEDS</button><button data-a="showcase">SHOWCASE</button>
  <small>Drag to orbit, wheel to zoom. The seed picks each part's look, the people's outfits (unless picked), and the colours.</small>`;
ui.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.m) { if (t.checked) S.mods.add(t.dataset.m); else S.mods.delete(t.dataset.m); }
  else if (t.dataset.k === 'crown' || t.dataset.k === 'far') S[t.dataset.k] = t.checked;
  else if (t.dataset.k) S[t.dataset.k] = t.type === 'number' ? parseFloat(t.value) : t.value;
  if (t.dataset.k !== 'far') S.mode = '';
  show();
});
ui.addEventListener('click', (e) => {
  const a = e.target.dataset && e.target.dataset.a;
  if (!a) return;
  if (a === 'seed' || a === 'random' || a === 'grid') S.seed = Math.floor(Math.random() * 1e6);
  ui.querySelector('[data-k=seed]').value = S.seed;
  if (a === 'random') {
    const g = randomGenes(mulberry32(S.seed));
    Object.assign(S, { body: g.body, legs: g.legs, head: g.head, extra: g.extraHead || '', mods: new Set(g.mods), size: g.size });
    for (const k of ['body', 'legs', 'head', 'extra']) ui.querySelector(`[data-k=${k}]`).value = S[k];
    for (const c of ui.querySelectorAll('[data-m]')) c.checked = S.mods.has(c.dataset.m);
  }
  S.mode = MODES.includes(a) ? a : a === 'seed' ? S.mode : '';
  show();
});

// the reactor's own random draw: two or three living kinds (at least two different), a material now and then
function randomGenes(rr) {
  const pick = (a) => a[Math.floor(rr() * a.length)];
  const a = pick(KINDS);
  const items = [{ kind: a }, { kind: pick(KINDS.filter((k) => k !== a)) }];
  if (rr() < 0.35) items.push({ kind: pick(KINDS) });
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
  if (S.far) { c.root.autoUpdate = false; c.root.levels[0].object.visible = false; c.root.levels[1].object.visible = true; }
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
  const looks = () => {
    const o = {};
    if (S.outfit) o.arch = S.outfit;
    if (S.headgear) o.headgear = S.headgear;
    return Object.keys(o).length ? { person: o, voidling: { ...o, headgear: undefined } } : undefined;
  };
  const one = (mods, over = {}) => {
    const g = { seed: S.seed, body: S.body, legs: S.legs, head: S.head, extraHead: S.extra || null, mods, size: S.size, crown: S.crown, looks: looks(), ...over };
    if (S.style && !g.style) g.style = { legs: S.style[0], body: S.style[1], head: S.style[2] };
    g.parents = [...new Set([g.body, g.legs, g.head, g.extraHead].filter(Boolean))];
    return g;
  };
  const info = document.getElementById('info');
  if (S.mode === 'grid') {
    const rr = mulberry32(S.seed);
    for (let i = 0; i < 12; i++) {
      const g = randomGenes(rr);
      add(g, (i % 4 - 1.5) * 2.8, (Math.floor(i / 4) - 1) * 3.4, describe(g));
    }
    target.set(0, 0.5, 0); dist = 15;
    info.textContent = `twelve random chimeras, seed ${S.seed}`;
  } else if (S.mode === 'modgrid') {
    MUTATIONS.forEach((m, i) => add(one([m]), (i % 4 - 1.5) * 2.4, (Math.floor(i / 4) - 0.5) * 3, m));
    target.set(0, 0.5, 0); dist = 11;
    info.textContent = `${describe(one([]))}: each mutation, seed ${S.seed}`;
  } else if (S.mode === 'kinds') {
    // every kind on its own legs, body and head, three seeds (other looks, outfits and colours)
    KINDS.forEach((k, i) => { for (let j = 0; j < 3; j++) add(one([], { body: k, legs: k, head: k, extraHead: null, seed: S.seed + j * 101, looks: undefined, parents: [k], style: { legs: j, body: j, head: j } }), (i - 3.5) * 2.2, (j - 1) * 3, j === 2 ? k : null); });
    target.set(0, 0.5, 0.5); dist = 14;
    info.textContent = `every kind in three seeds (seed ${S.seed})`;
  } else if (S.mode === 'showcase') {
    // amalgams across all eight kinds: plain, armoured, crystalled, two-headed, in mud and sparks
    const rows = [[], ['armor'], ['crystal'], null, ['mud', 'spark']];
    for (let i = 0; i < 8; i++) {
      rows.forEach((mods, j) => {
        const g = one(mods || [], { legs: KINDS[i], body: KINDS[(i + 3) % 8], head: KINDS[(i + 5) % 8], extraHead: mods ? null : KINDS[(i + 6) % 8], seed: S.seed + i * 13 + j, looks: undefined });
        g.parents = [...new Set([g.body, g.legs, g.head, g.extraHead].filter(Boolean))];
        add(g, (i - 3.5) * 2.3, (j - 2) * 2.8, j === 4 ? `${g.legs} · ${g.body} · ${g.head}` : null);
      });
    }
    target.set(0, 0.4, 0.6); dist = 18;
    info.textContent = `the showcase, back to front: plain, armour, crystal, two heads, mud and spark (seed ${S.seed})`;
  } else {
    const genes = one([...S.mods]);
    add(genes, 0, 0);
    target.set(0, shown[0].height * 0.45, 0); dist = Math.max(2.6, shown[0].height * 2.6);
    info.textContent = `${describe(genes)}\nseed ${S.seed} · ${shown[0].height.toFixed(2)} m tall`;
  }
  if (Q.has('dist')) dist = num('dist', dist);                       // (a close-up: &dist=m &ty=m, the height looked at)
  if (Q.has('ty')) target.y = num('ty', target.y);
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

let t = 0, last = performance.now(), lap = 0;
const R = 2.6;
// a lap of the circle at &speed (default 1.2 m/s), easing to a stop for a moment every few seconds
function walk(c, dt) {
  const v = num('speed', 1.2) * THREE.MathUtils.smoothstep(Math.sin(t * 0.45) + 0.35, 0, 0.5);
  lap += (v * dt) / R;
  const x = Math.cos(lap) * R, z = Math.sin(lap) * R;
  c.root.position.set(x, bump(x, z), z);
  c.root.rotation.set(0, -lap, 0);                                  // (+z, its front, along the way it goes)
  target.set(x, 0.4, z);
  c.anim(t, v, groundAt);
}
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
    if (WALK && shown.length === 1) walk(c, dt);
    else c.anim(t, num('speed', 0));
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
