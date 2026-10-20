// Dev-only model viewer: renders one model through the game's comic post pass on a turntable.
import * as THREE from 'three';
import { loadFonts } from '../src/fonts.js';
import { loadRunnerParts, loadShipParts, makeRunner, makeCrate, ScarfSim, makeShuttle, makeFreighter, makeHoverCar, makeRover, makeInterceptor, makeApc, makeLandTrain, makeTowerCrane, CRANE_TROLLEY_MIN, CRANE_TROLLEY_SPAN, makeGantryCrane, makeCargoBox, GANTRY_TROLLEY_SPAN, makeGarage, makeDishStation, DISH_SIZE, makeLampPost, makeFountain, makeBouncer, makeChandelier, makeCasinoSign, makeChipStack, makeClawMachine, makeClawHead, clawKindParts, makeDerbyPart, makeRacer } from '../src/models.js';
import { outpostTemplate } from '../src/outpostModels.js';
import { loadOutpostParts, GLB_KINDS } from '../src/outpostGlb.js';
import { makeChimera, makeMite, LIVING, MODIFIERS, spliceGenes } from '../src/chimera.js';
import { ComicPost } from '../src/post.js';
import { dressRunner } from '../src/cosmetics.js';
import { slotCabinet, updateSlot, blackjackTable } from '../src/casinoWorld.js';
import { KINDS } from '../src/clawSim.js';
import { inkMat } from '../src/toon.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

await Promise.all([loadFonts(), loadRunnerParts(), loadShipParts({ ships: Q.get('ships') || undefined }), loadOutpostParts({ force: true })]);

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

// ---- outposts: draw a template's colliders, blast boxes and gameplay points ----
const lineMat = (c) => new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true });
function outpostOverlay(t) {
  const g = new THREE.Group();
  const edges = (geo, mat) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat); l.renderOrder = 10; return l; };
  for (const c of t.cols) {
    let l;
    if (c.type === 'box') { l = edges(new THREE.BoxGeometry(c.hx * 2, c.hy * 2, c.hz * 2), lineMat(0x2ee6ff)); l.position.set(c.x, c.y, c.z); l.rotation.y = c.yaw; }
    else if (c.type === 'cyl') { l = edges(new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 20), lineMat(0x2ee6ff)); l.position.set(c.x, (c.y0 + c.y1) / 2, c.z); }
    else { l = edges(new THREE.SphereGeometry(c.r, 12, 8), lineMat(0x2ee6ff)); l.position.set(c.x, c.y, c.z); }
    g.add(l);
  }
  for (const h of t.hits) {
    const l = edges(new THREE.BoxGeometry(h.hx * 2, h.hy * 2, h.hz * 2), lineMat(0xff9f1c));
    l.position.set(h.x, h.y, h.z); l.rotation.y = h.yaw;
    g.add(l);
  }
  const mark = (p, color, r) => { if (!p) return; const l = edges(new THREE.OctahedronGeometry(r), lineMat(color)); l.position.copy(p); g.add(l); };
  mark(t.raid, 0x7dff3a, 1.2); mark(t.smoke, 0xff2a4a, 1.2); mark(t.drop, 0x5a8bff, 1.2);
  return g;
}
// Does template b hold a's gameplay data (within tol m)? A box as (hx, hz, yaw) or turned a quarter counts as the same.
function outpostParity(a, b, tol = 0.01) {
  const same = (x, y) => Math.abs(x - y) <= tol;
  const turn = (p, q) => { const d = Math.abs(Math.sin(p - q)); return d <= tol; };
  const eq = {
    box: (p, q) => same(p.x, q.x) && same(p.y, q.y) && same(p.z, q.z) && same(p.hy, q.hy) &&
      ((same(p.hx, q.hx) && same(p.hz, q.hz) && turn(p.yaw, q.yaw)) || (same(p.hx, q.hz) && same(p.hz, q.hx) && turn(p.yaw + Math.PI / 2, q.yaw))),
    cyl: (p, q) => same(p.r, q.r) && same(p.y0, q.y0) && same(p.y1, q.y1) && same(p.x, q.x) && same(p.z, q.z),
    sphere: (p, q) => same(p.r, q.r) && same(p.x, q.x) && same(p.y, q.y) && same(p.z, q.z),
  };
  const lists = (what, xs, ys, typed) => {
    const left = ys.slice(), miss = [];
    for (const p of xs) {
      const k = left.findIndex((q) => (typed ? p.type === q.type : true) && eq[typed ? p.type : 'box'](p, q));
      if (k < 0) miss.push(p); else left.splice(k, 1);
    }
    return { what, of: xs.length, matched: xs.length - miss.length, missing: miss, extra: left };
  };
  const pt = (what, p, q) => { const ok = !!(p && q && p.distanceTo(q) <= tol); return { what, of: p ? 1 : 0, matched: ok ? 1 : 0, missing: p && !ok ? [p] : [], extra: q && !ok ? [q] : [] }; };
  const rows = [lists('colliders', a.cols, b.cols, true), lists('hit boxes', a.hits, b.hits, false), pt('raid', a.raid, b.raid), pt('smoke', a.smoke, b.smoke), pt('drop', a.drop, b.drop)];
  return { ok: rows.every((r) => !r.missing.length && !r.extra.length), rows };
}
function outpostStats(t) {
  let draws = 0, tris = 0, verts = 0;
  t.root.traverse((o) => {
    if (!o.isMesh) return;
    draws++;
    verts += o.geometry.attributes.position.count;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return { draws, verts, tris };
}

const m = Q.get('m') || 'shuttle';
let model, rig = null, anim = null, height = 2;
if (m === 'shuttle' || m === 'freighter') {
  rig = m === 'shuttle' ? makeShuttle({ stripe: Q.has('stripe') ? parseInt(Q.get('stripe'), 16) : undefined }) : makeFreighter({ faction: Q.get('faction') || undefined });
  model = rig.root;
  rig.setGear(num('gear', 1));
  rig.setRamp(num('ramp', 0));
  if (Q.has('sign')) rig.setSign(Q.get('sign')); // (shuttle route board: &sign=TRANQ)
  model.position.y = rig.gearH * num('gear', 1) + (num('gear', 1) < 1 ? 4 : 0);
  height = m === 'shuttle' ? 8 : 20;
  // &cols=1 draws the freighter's collision boxes (straight from rig.decks)
  if (Q.get('cols') === '1' && rig.decks) {
    const cm = new THREE.LineBasicMaterial({ color: 0xff2e63, depthTest: false, transparent: true });
    for (const d of rig.decks) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(d.hx * 2, d.hy * 2, d.hz * 2)), cm);
      l.position.set(d.x || 0, d.y, d.z);
      l.renderOrder = 10;
      model.add(l);
    }
  }
} else if (m === 'interceptor') {
  // &color=hex &trim=hex  &speed=<m/s> (stretches the rocket flames, lays the whips back)
  const hex = (k, d) => (Q.has(k) ? parseInt(Q.get(k), 16) : d);
  const ic = makeInterceptor({ color: hex('color', 0xfff4e0), trim: hex('trim', 0xffd23f) });
  model = ic.root;
  anim = (t) => ic.anim(t, num('speed', 0));
  height = 3;
} else if (m === 'apc') {
  // &turret=<yaw rad>&barrel=<elevation rad> to pose it; &color=hex &trim=hex (faction colours)
  const apc = makeApc({ color: Q.has('color') ? parseInt(Q.get('color'), 16) : 0x6b6f78, trim: Q.has('trim') ? parseInt(Q.get('trim'), 16) : 0xff3b5c });
  apc.turret.rotation.y = num('turret', 0);
  apc.barrel.rotation.x = -num('barrel', 0);
  model = apc.root;
  model.scale.setScalar(1.35);
  model.position.y = 0.2;
  height = 4;
} else if (m === 'landtrain') {
  // &type=moonliner|prospector  &faction=spacecom|vostok|kepler|meridian  &cars=pax,pax,pax | tank,cargo,blast
  // &unit=0 tractor alone, 1..n that trailer alone
  const lt = makeLandTrain({ faction: Q.get('faction') || 'kepler', type: Q.get('type') || 'moonliner', cars: Q.has('cars') ? Q.get('cars').split(',').filter(Boolean) : undefined });
  model = new THREE.Group();
  const only = Q.has('unit') ? num('unit', 0) : -1; // (camera frames just that unit)
  if (only <= 0) model.add(lt.root);
  lt.trailers.forEach((t, i) => {
    t.root.position.set(0, 0, only > 0 ? 0 : -9.9 * (i + 1));
    t.rod.scale.z = 1.5;
    t.eye.position.z = 1.5;
    if (only < 0 || only === i + 1) model.add(t.root);
  });
  height = 3;
} else if (m === 'crane') {
  // &h=34 (mast m; the model is 34)  &slew=<rad>  &trolley=0..1 (along its run)  &rope=<m>  &color=hex  &faction=kepler|meridian|spacecom|vostok (cargo)
  const c = makeTowerCrane({ color: Q.has('color') ? parseInt(Q.get('color'), 16) : 0xffd23f, faction: Q.get('faction') || 'kepler', h: num('h', 34) });
  const sc = num('h', 34) / 34;
  c.slew.rotation.y = num('slew', 0);
  c.trolley.position.x = (CRANE_TROLLEY_MIN + CRANE_TROLLEY_SPAN * num('trolley', 0.5)) * sc;
  c.cable.scale.y = num('rope', 14);
  c.hook.position.y = (-0.7 - num('rope', 14)) * sc;
  model = c.root;
  height = 25;
} else if (m === 'gantry') {
  // &trolley=0..1 (along the girder)  &rope=<m>  &color=hex  &faction=kepler|meridian|spacecom|vostok (cargo)
  const c = makeGantryCrane({ color: Q.has('color') ? parseInt(Q.get('color'), 16) : 0xffd23f, faction: Q.get('faction') || 'meridian' });
  c.trolley.position.z = GANTRY_TROLLEY_SPAN * (2 * num('trolley', 0.5) - 1);
  c.cable.scale.y = num('rope', 6);
  c.hook.position.y = -0.7 - num('rope', 6);
  model = c.root;
  height = 14;
} else if (m === 'cargobox') {
  // yard box container alone: &faction=kepler|meridian|spacecom|vostok  &n=3 (a stack)
  model = new THREE.Group();
  const n = num('n', 1);
  for (let i = 0; i < n; i++) { const b = makeCargoBox({ faction: Q.get('faction') || 'meridian' }).root; b.position.y = i * 3.2; model.add(b); }
  height = 2;
} else if (m === 'garage') {
  // &kind=main|small  &open=101 (bays up, bay 0 first: 1 open, 0 shut)  &trim=hex
  const o = (Q.get('open') || '101').padEnd(3, '0').split('').map((c) => c === '1');
  const gar = makeGarage({ open: o, kind: Q.get('kind') || 'main', trim: Q.has('trim') ? parseInt(Q.get('trim'), 16) : 0x2ec4ff });
  model = gar.root;
  anim = (t) => gar.update(t);
  height = 12;
} else if (m === 'slots') {
  // casino slot cabinet (build_slots.py). &n=4 in a row, &gap=3.2 apart  &ring=7 a carousel round a pillar at &rr=3.6  &idx=0 first one's colour and name
  // &pull=rad turns the lever  &play=1 plays them like a patron (lever, lamp bar, reels)
  const COLS = [0xff2e88, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff, 0xffd23f, 0x4d7cff];
  const cabs = [];
  model = new THREE.Group();
  const first = num('idx', 0), ring = num('ring', 0), rr = num('rr', 3.6);
  const add = (i, x, z, yaw) => {
    const cab = slotCabinet(COLS[(first + i) % COLS.length], first + i);
    for (const o of [cab.userData.stat, cab]) { o.position.set(x, 0, z); o.rotation.y = yaw; model.add(o); }
    if (Q.has('pull')) cab.userData.pull.rotation.x = num('pull', 0);
    cabs.push(cab);
  };
  if (ring) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(rr + 3.8, rr + 4, 0.3, 40), new THREE.MeshToonMaterial({ color: 0x2a1450 })); base.position.y = 0.15; model.add(base);
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 7.5, 16), new THREE.MeshToonMaterial({ color: 0x5a1a8f })); pil.position.y = 3.75; model.add(pil);
    for (let k = 0; k < ring; k++) { const a = (k / ring) * Math.PI * 2; add(k, Math.cos(a) * rr, Math.sin(a) * rr, Math.atan2(Math.cos(a), Math.sin(a))); }
    height = 9;
  } else {
    const n = num('n', 4), gap = num('gap', 3.2);
    for (let i = 0; i < n; i++) add(i, (i - (n - 1) / 2) * gap, 0, 0);
    height = 5;
  }
  let nextPull = 0;
  anim = (t, sp, dt) => {
    for (const c of cabs) {
      if (Q.get('play') === '1' && t > nextPull) { c.userData.pullT = 0.35; c.userData.playing = 1.6; }
      updateSlot(c.userData, dt, t);
    }
    if (t > nextPull) nextPull = t + 3.2;
  };
} else if (m === 'casino') {
  // casino props (build_casino.py). &part=lamp|fountain|bouncer|chandelier|welcome|wall|blackjack|claw|clawthings|duckderby  &accent=hex (lamp post colour)  &n=3 lamps in a row
  const part = Q.get('part') || 'lamp';
  model = new THREE.Group();
  if (part === 'lamp') {
    const acc = Q.has('accent') ? parseInt(Q.get('accent'), 16) : 0xff2e88;
    for (let i = 0; i < num('n', 1); i++) { const l = makeLampPost(i % 2 ? 0x2ee6ff : acc); l.position.x = i * 4; model.add(l); }
    height = 9;
  } else if (part === 'fountain') {
    // &top=chip|dollar (centrepiece)  &accent=hex (dollar sign colour)
    const f = makeFountain({ top: Q.get('top') || 'chip', accent: Q.has('accent') ? parseInt(Q.get('accent'), 16) : 0x2ec4ff });
    model.add(f.root);
    anim = (t, sp, dt) => f.update(t, dt);
    height = 9;
  } else if (part === 'bouncer') {
    const b = makeBouncer();
    model.add(b.root);
    anim = (t) => { b.head.rotation.y = Math.sin(t * 0.7) * 0.5; };
    height = 2.5;
  } else if (part === 'chandelier') {
    const c = makeChandelier();
    c.root.position.y = 3;   // (hangs from a ceiling 3.3 m above its centre)
    model.add(c.root);
    anim = (t, sp, dt) => { c.spin.rotation.y += dt * 0.3; };
    height = 6;
  } else if (part === 'blackjack') {
    model.add(blackjackTable());
    [0xfff4e0, 0xff2a4a, 0x2ee6ff, 0x7dff6a, 0x16121f, 0xc77dff, 0xffd23f].forEach((c, i) => { const g = makeChipStack(c, 5); g.position.set(-1.5 + i * 0.5, 1.155, 1.7); model.add(g); });
    height = 5;
  } else if (part === 'duckderby') {
    // Duck Derby pieces in a row (build_duck.py): four racers, kiosk, rail post and rope, start gate and grille, finish arch
    let x = 0;
    const put = (g, w, y = 0) => { g.position.x = x + w / 2; g.position.y = y; x += w + 1; model.add(g); };
    [0xffd23f, 0xff2e88, 0x2ee6ff, 0x7dff6a].forEach((c, i) => { const d = makeRacer(i + 1, c, 0xff9f1c); put(d.root, 1.8, 0.4); });
    put(makeDerbyPart('dd_kiosk'), 3);
    const post = makeDerbyPart('dd_railpost'), rope = makeDerbyPart('dd_rope');
    put(post, 3.5); rope.position.x = post.position.x - 0.0; model.add(rope);
    const gate = makeDerbyPart('dd_gate'), grille = makeDerbyPart('dd_grille');
    put(gate, 1); grille.position.set(gate.position.x, 1.35, 0); model.add(grille);
    put(makeDerbyPart('dd_finish'), 1);
    model.position.x = -x / 2;
    height = 7;
  } else if (part === 'claw') {
    model.add(makeClawMachine().stat);   // (empty; the game fills it via clawSim.js / clawView.js)
    height = 12;
  } else if (part === 'clawthings') {
    // every claw-tank item kind at its floating size, then the claw (build_claw.py)
    let x = 0;
    const put = (g, w) => { g.position.x = x + w / 2; x += w + 0.4; model.add(g); };
    for (const kind of Object.keys(KINDS)) {
      const { parts, ink } = clawKindParts(kind), g = new THREE.Group();
      for (const { geo, material } of parts) g.add(new THREE.Mesh(geo, material));
      if (ink) { const k = new THREE.Mesh(ink, inkMat); k.userData.isInk = true; g.add(k); }
      const w = KINDS[kind].r * 2 + 0.3, h = new THREE.Group();
      g.position.y = KINDS[kind].r;
      h.add(g);
      put(h, w);
    }
    const hd = makeClawHead(); hd.position.y = 1; put(hd, 1.8);
    model.position.x = -x / 2;
    height = 2.5;
  } else {
    const sg = makeCasinoSign(part === 'welcome' ? 'welcome_sign' : 'wall_sign');
    sg.root.position.y = part === 'welcome' ? 7 : 3;
    model.add(sg.root);
    height = 6;
  }
} else if (m === 'dish') {
  // &kind=cryo|gantry|field|head  &faction=kepler|meridian|spacecom|vostok|daedalus  &no=01..04 (array dish number)  &size=30 (the 30 m mount scales to it)
  // (field: makeDish, the small bases' dish; head: the light head alone for masts and roofs; both take any faction, incl. daedalus and unclaimed 'none')
  // &tilt=rad (elevation; the game sweeps -0.35 to -0.85)  &az=rad (azimuth)  &sweep=1 turns and nods it like the game; lamps blink
  const st = makeDishStation({ kind: Q.get('kind') || 'cryo', faction: Q.get('faction') || 'meridian', no: Q.get('no') || '01', size: num('size', DISH_SIZE) });
  st.tilt.rotation.x = num('tilt', -0.6);
  st.yaw.rotation.y = num('az', 0);
  model = st.root;
  const lamps = [];
  model.traverse((o) => { if (o.userData.blink) lamps.push(o); });
  anim = (t) => {
    if (Q.get('sweep') === '1') { st.yaw.rotation.y = num('az', 0) + t * 0.12; st.tilt.rotation.x = -0.6 + Math.sin(t * 0.24) * 0.25; }
    for (const o of lamps) o.visible = Math.sin(t * 4) > -0.3;
  };
  height = 24;
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
} else if (m === 'runner') {
  // &outfit=courier|spacecom2|meridian2|daedalus2|rustmoon|rustmoon2|kepler2|vostok2...  &speed=m/s (scarf and halo simulated at that forward speed)
  // &cargo=1|2 (a crate, or the Twin Cradle's two, on the back)  &manual=1 (the page steps window.scarfSim)  &stop=s (speed drops to 0 after this many simulated s)  &lean=rad (torso pitch)  &arms=rad (arm swing)  &fore=rad (forearm bend; negative bends the hand forward)  &armz=rad (arms out from the sides)
  const R = makeRunner({ own: true });
  dressRunner(R, Q.get('outfit') || 'courier');
  R.torso.rotation.x = num('lean', 0);
  R.armL.rotation.set(num('arms', 0), 0, -num('armz', 0.15));
  R.armR.rotation.set(num('arms', 0), 0, num('armz', 0.15));
  if (R.foreL) { R.foreL.rotation.x = R.foreR.rotation.x = num('fore', 0); }
  const cargo = num('cargo', 0); // (as Player.setCargo)
  if (cargo) {
    const c = makeCrate(0xffd23f, 0.7);
    if (cargo > 1) { const t = makeCrate(0x2ec4ff, 0.62); t.position.y = 0.55; t.rotation.y = 0.25; c.add(t); }
    R.cargoSlot.add(c);
  }
  const sim = new ScarfSim(R);
  window.scarfSim = sim;
  const fwd = new THREE.Vector3(0, 0, 1), upv = new THREE.Vector3(0, 1, 0);
  let simT = 0;
  anim = (t, sp, dt) => { if (Q.get('manual') === '1') { sim.draw && sim.tails && sim.tails.forEach((T) => sim.draw(T)); return; } simT += dt; sim.update(Math.max(dt, 1e-3), fwd.clone().multiplyScalar(Q.has('stop') && simT > num('stop', 0) ? 0 : num('speed', 0)), upv, { cargo }); };
  model = R.root;
  height = 2.2;
  window.runner = R;
} else if (m === 'rover') {
  // &style=civil|military|pirate|all (all three side by side)  &color=hex &trim=hex &flag=hex  &driver=1 (road-traffic buggy with driver; &k=<n> picks it)
  // &gun=<yaw rad>
  const hex = (k, d) => (Q.has(k) ? parseInt(Q.get(k), 16) : d);
  const LOOKS = { civil: { color: 0x6a8f3a, trim: 0xff9f1c }, military: { color: 0x55607a, trim: 0x2ec4ff }, pirate: { color: 0x7b2ff7, trim: 0x7dff3a } };
  const styles = Q.get('style') === 'all' ? ['civil', 'military', 'pirate'] : [Q.get('style') || 'civil'];
  const { buildBuggyRig } = Q.get('driver') === '1' ? await import('../src/traffic.js') : {};
  model = new THREE.Group();
  const anims = [];
  styles.forEach((s, i) => {
    const L = LOOKS[s] || LOOKS.civil;
    const r = buildBuggyRig && s === 'civil' ? buildBuggyRig(num('k', 0) | 0) : makeRover({ color: hex('color', L.color), trim: hex('trim', L.trim), flag: hex('flag', L.trim), pirate: s === 'pirate', style: s });
    r.gun.rotation.y = num('gun', 0);
    r.root.position.x = (i - (styles.length - 1) / 2) * 7;
    model.add(r.root);
    if (r.anim) anims.push(r.anim);
  });
  anim = (t, sp) => anims.forEach((a) => a(t, sp));
  height = 3;
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
} else if (m === 'outpost') {
  // &kind=mast|tower (any kind in outposts.glb; src=kit takes any Kit kind)  &src=kit|glb|both (default both, side by side)  &wreck=1  &color=rrggbb  &cols=0 hides the colliders
  const kind = Q.get('kind') || 'mast', wreck = Q.get('wreck') === '1', color = Q.has('color') ? parseInt(Q.get('color'), 16) : 0x2ec4ff;
  const srcs = Q.get('src') === 'kit' ? ['kit'] : Q.get('src') === 'glb' ? ['glb'] : ['kit', 'glb'];
  model = new THREE.Group();
  const lines = [];
  const stats = {}, tpls = {};
  srcs.forEach((s, i) => {
    let t;
    try { t = outpostTemplate(kind, color, 0, wreck, s); } catch (e) { lines.push(`${s}: ${e.message}`); return; }
    const g = new THREE.Group();
    g.position.x = (i - (srcs.length - 1) / 2) * 70;
    g.add(t.root.clone());
    if (Q.get('cols') !== '0') g.add(outpostOverlay(t));
    model.add(g);
    tpls[s] = t;
    stats[s] = outpostStats(t);
    lines.push(`${s}: ${stats[s].draws} draws, ${stats[s].tris} tris, ${t.cols.length} colliders, ${t.hits.length} hit boxes`);
  });
  if (tpls.kit && tpls.glb) {
    const par = outpostParity(tpls.kit, tpls.glb);
    window.outpostParity = par;
    lines.push(`GLB vs Kit gameplay data: ${par.ok ? 'same' : 'DIFFERENT'} (${par.rows.map((r) => `${r.what} ${r.matched}/${r.of}${r.extra.length ? ' +' + r.extra.length : ''}`).join(', ')})`);
  }
  const ui = document.getElementById('ui'); // (text, not HTML: `kind` comes from the URL)
  ui.style.whiteSpace = 'pre-line';
  ui.textContent = [`${kind}${wreck ? ' (wreck)' : ''}${GLB_KINDS.has(kind) ? '' : ' (not in GLB_KINDS: the game would not use the GLB for it yet)'}`, ...lines, 'cyan = collider, orange = blast box, green = raid, red = smoke, blue = drop'].join('\n');
  const swing = [];
  model.traverse((o) => { if (o.userData.spin || o.userData.blink || o.userData.flag) swing.push(o); });
  anim = (t) => { // (what territory.js does to a placed outpost)
    for (const o of swing) {
      if (o.userData.spin) o.rotation.y = t * 0.6;
      if (o.userData.blink) o.visible = Math.sin(t * 4) > -0.3;
      if (o.userData.flag) o.rotation.y = Math.sin(t * 2) * 0.25;
    }
  };
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  window.outpostStats = stats;
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
if (Q.has('at')) ctr.set(...Q.get('at').split(',').map(parseFloat)); // &at=x,y,z: look at this point instead (to zoom in on a part)
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
  if (anim) anim(t, num('speed', 6), dt);
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.viewer = { scene, camera, model, rig };
