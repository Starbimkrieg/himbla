import * as THREE from 'three';
import { upAt, toScreen } from './geo.js';

const MAX_P = 1200;
// skate trail ribbons: a point every 1/60 s, tail 40 points (2/3 s), up to 2 s while grinding
const TRAIL_STEP = 1 / 60, TRAIL_LIFE = 40 * TRAIL_STEP, TRAIL_MAX = 2, TRAIL_N = Math.ceil(TRAIL_MAX / TRAIL_STEP) + 10;

// Phase Dash afterimages: one every GHOST_GAP m, each fading over GHOST_LIFE s
const GHOST_GAP = 3, GHOST_LIFE = 0.55, GHOST_ALPHA = 0.55;
const GHOST_NEW = new THREE.Color(0xc77dff), GHOST_OLD = new THREE.Color(0x5b3bff); // violet, deepening as it fades

// Comic popups: at most POP_MAX on screen, the rest queue; each runs its full time once started. A world-pinned popup
// that waits past POP_WAIT_WORLD is dropped (prio 1, the runner's own, waits longer; prio 2, the K.O., never goes stale);
// one pinned off screen isn't shown. Past POP_QUEUE_MAX the oldest lowest-rank popup is shed.
const POP_MAX = 2, POP_QUEUE_MAX = 8, POP_WAIT_WORLD = 1.2, POP_WAIT_WORLD_PRIO = 3;

// Particles, explosions, warning rings, skate trails and comic onomatopoeia.
export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = [];
    this.density = 1; // settings: particle density multiplier
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_P);
    this.pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_P * 3), 3);
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    this.pMesh.userData.persist = true; // the Spindle hides the Moon's scene, not this
    scene.add(this.pMesh);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();

    this.booms = [];
    this.rings = [];
    this.embers = []; // burning phosphor fragments, each trailing smoke
    this.shells = []; // Deflector Shield hits
    this.ghosts = []; // Phase Dash afterimages
    this.ghostRun = null; // the dash laying them: { model, left, last }
    this.popLayer = document.getElementById('popups');
    this.pops = []; // on screen
    this.popQueue = []; // waiting for a slot
    this.popSeq = 0;

    // skate trails (two ribbons)
    this.trails = [this.makeTrail(0x2ee6ff), this.makeTrail(0x2ee6ff)];
  }

  makeTrail(color) {
    const N = TRAIL_N;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const alpha = new Float32Array(N * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color(color) }, strength: { value: 0 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float strength; varying float vA; void main(){ gl_FragColor = vec4(color, vA * vA * strength); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.persist = true; // the Spindle hides the Moon's scene, not this
    this.scene.add(mesh);
    return { mesh, pts: [], N, mat, life: TRAIL_LIFE };
  }

  // The ribbon is the foot's last 2 s, aged in seconds; each stretch fades out over `life`. A grind asks for a longer
  // life; t.life eases towards it so the tail grows and shrinks without popping.
  updateTrail(i, footPos, side, strength, up, dt = TRAIL_STEP, life = TRAIL_LIFE) {
    const t = this.trails[i];
    t.life += Math.max(-dt, Math.min(2 * dt, life - t.life));
    for (const q of t.pts) q.age += dt;
    const head = t.pts[0];
    if (head && head.age < TRAIL_STEP) { head.p.copy(footPos).addScaledVector(up, 0.05); head.s.copy(side); } // high frame rate: the newest point follows the foot
    else t.pts.unshift({ p: footPos.clone().addScaledVector(up, 0.05), s: side.clone(), age: 0 });
    while (t.pts.length > t.N || (t.pts.length > 1 && t.pts[t.pts.length - 1].age > TRAIL_MAX)) t.pts.pop();
    const pos = t.mesh.geometry.attributes.position.array, alpha = t.mesh.geometry.attributes.alpha.array;
    for (let k = 0; k < t.N; k++) {
      const q = t.pts[Math.min(k, t.pts.length - 1)];
      const w = 0.18;
      pos[k * 6] = q.p.x - q.s.x * w; pos[k * 6 + 1] = q.p.y - q.s.y * w; pos[k * 6 + 2] = q.p.z - q.s.z * w;
      pos[k * 6 + 3] = q.p.x + q.s.x * w; pos[k * 6 + 4] = q.p.y + q.s.y * w; pos[k * 6 + 5] = q.p.z + q.s.z * w;
      alpha[k * 2] = alpha[k * 2 + 1] = Math.max(0, 1 - q.age / t.life);
    }
    t.mesh.geometry.attributes.position.needsUpdate = true;
    t.mesh.geometry.attributes.alpha.needsUpdate = true;
    t.mat.uniforms.strength.value += (strength - t.mat.uniforms.strength.value) * 0.2;
  }

  spawn(pos, vel, { color = 0xffffff, size = 0.3, life = 0.8, gravity = 0, drag = 0.5, count = 1, spread = 2 } = {}) {
    if (this.density !== 1) count = Math.floor(count * this.density + Math.random()); // settings
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_P) this.particles.shift();
      this.particles.push({
        pos: pos.clone(),
        vel: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)),
        life, max: life, size: size * (0.6 + Math.random() * 0.8), color: new THREE.Color(color), gravity, drag,
      });
    }
  }

  dust(pos, vel, amount = 4, up = upAt(pos), color = 0xd8d0c4, size = 0.5) {
    this.spawn(pos, vel.clone().multiplyScalar(0.25).addScaledVector(up, 2), { color, size, life: 1.2, gravity: 1.62, drag: 0.6, count: amount, spread: 4 });
  }

  explosion(pos, radius = 6, big = false) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true }));
    const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff4f2e, transparent: true }));
    const ink = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide, transparent: true }));
    outer.scale.setScalar(1.3);
    ink.scale.setScalar(1.42);
    g.add(core, outer, ink);
    g.position.copy(pos);
    this.scene.add(g);
    this.booms.push({ g, t: 0, dur: big ? 0.7 : 0.45, radius, mats: [core.material, outer.material, ink.material] });
    const up = upAt(pos);
    this.spawn(pos, up.clone().multiplyScalar(3), { color: 0xffd23f, size: radius * 0.08, life: 0.7, gravity: 1, count: big ? 26 : 12, spread: radius * 4 });
    this.spawn(pos, up.clone().multiplyScalar(2), { color: 0x3a3550, size: radius * 0.1, life: 1.4, gravity: 1.62, count: big ? 18 : 8, spread: radius * 2.5 });
  }

  // White phosphorus: white-hot fragments arcing down on smoke trails, plus a hanging cloud. Burns out over ~2 s.
  phosphor(pos, n = 9, power = 1) {
    const up = upAt(pos);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      dir.addScaledVector(up, 0.35).normalize(); // mostly outward, a little up
      this.embers.push({ pos: pos.clone(), vel: dir.multiplyScalar((7 + Math.random() * 7) * power), life: 1.4 + Math.random() * 0.9, max: 2.3, smoke: 0 });
    }
    // the cloud and a white-hot flash
    this.spawn(pos, up.clone().multiplyScalar(0.6), { color: 0xe9e4f2, size: 2.2 * power, life: 2.2, drag: 2.2, count: 7, spread: 3 });
    this.spawn(pos, up.clone(), { color: 0xfffbe6, size: 1.6 * power, life: 0.35, drag: 3, count: 4, spread: 1.5 });
  }

  updateEmbers(dt) {
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life -= dt;
      if (e.life <= 0) { this.embers.splice(i, 1); continue; }
      e.vel.addScaledVector(upAt(e.pos, this.v), -4 * dt).multiplyScalar(1 - 0.7 * dt);
      e.pos.addScaledVector(e.vel, dt);
      const k = e.life / e.max;
      // core: flickers white / pale yellow, shrinking as it burns out
      this.spawn(e.pos, this.v.set(0, 0, 0), { color: Math.random() < 0.5 ? 0xfffbe6 : 0xfff1a8, size: 0.6 + 0.7 * k, life: 0.08, drag: 0, count: 1, spread: 0 });
      // smoke trail
      e.smoke -= dt;
      if (e.smoke <= 0) {
        e.smoke = 0.055;
        this.spawn(e.pos, upAt(e.pos, this.v).multiplyScalar(0.4), { color: k > 0.5 ? 0xf2eef8 : 0xc9c3d6, size: 0.8 + 0.9 * (1 - k), life: 1.2 + Math.random() * 0.6, drag: 2.5, count: 1, spread: 0.3 });
      }
    }
  }

  // Straight energy beam that fades out (Rail Lance).
  beam(a, b, color) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, len, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.lerpVectors(a, b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    m.add(core);
    this.scene.add(m);
    this.rings.push({ m, inner: core, t: 0, dur: 0.3, beam: true });
  }

  // Phase Dash: for `secs`, leave a violet ghost of the runner every few metres: its meshes frozen in world space,
  // sharing the model's geometry, so only the ghost's material is disposed.
  startGhosts(model, secs = 0.6) { this.ghostRun = { model, left: secs, last: null }; }

  spawnGhost(model) {
    const root = model.root;
    root.updateWorldMatrix(true, true);
    const mat = new THREE.MeshBasicMaterial({ color: GHOST_NEW, transparent: true, opacity: GHOST_ALPHA, depthWrite: false });
    const g = new THREE.Group();
    g.userData.persist = true; // the Spindle hides the Moon's scene, not this
    const skip = [model.scarf, model.cargoSlot]; // the scarf's geometry is live (it would keep moving); cargo isn't the runner
    const walk = (o) => {
      if (!o.visible || skip.includes(o)) return;
      if (o.isMesh && o.material && o.material.side !== THREE.BackSide) { // not the ink outline shells
        const c = new THREE.Mesh(o.geometry, mat);
        c.matrixAutoUpdate = false;
        c.matrix.copy(o.matrixWorld);
        g.add(c);
      }
      for (const ch of o.children) walk(ch);
    };
    walk(root);
    this.scene.add(g);
    this.ghosts.push({ g, mat, t: 0, pos: root.getWorldPosition(new THREE.Vector3()) });
  }

  updateGhosts(dt) {
    const run = this.ghostRun;
    if (run) {
      run.left -= dt;
      const p = run.model.root.getWorldPosition(this.v);
      if (!run.last || p.distanceTo(run.last) >= GHOST_GAP) { this.spawnGhost(run.model); run.last = (run.last || new THREE.Vector3()).copy(p); }
      if (run.left <= 0) this.ghostRun = null;
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.t += dt;
      const k = gh.t / GHOST_LIFE;
      if (k >= 1) { gh.g.removeFromParent(); gh.mat.dispose(); this.ghosts.splice(i, 1); continue; }
      // fade with age, and near the camera (they're left between it and you)
      const near = Math.min(1, Math.max(0, (this.camera.position.distanceTo(gh.pos) - 3) / 8));
      gh.mat.opacity = GHOST_ALPHA * Math.pow(1 - k, 1.5) * near;
      gh.mat.color.lerpColors(GHOST_NEW, GHOST_OLD, k);
    }
  }

  // Deflector Shield hit: a faceted shell flashes, swells and fades, sparking off the side that was hit.
  shieldHit(follow, from = null) {
    const c = follow();
    const dir = from ? from.clone().sub(c).normalize() : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(2.14, 1), new THREE.MeshBasicMaterial({ color: 0xbff8ff, wireframe: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    // scorch cap on the hit side
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 6, 0, Math.PI * 2, 0, 0.75), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(shell, wire, cap);
    g.position.copy(c);
    this.scene.add(g);
    this.shells.push({ g, follow, t: 0, dur: 0.55, mats: [shell.material, wire.material, cap.material], base: [0.32, 0.9, 0.9] });
    this.spawn(c.clone().addScaledVector(dir, 2.1), dir.clone().multiplyScalar(9), { color: 0x9be7ff, size: 0.2, life: 0.5, count: 14, spread: 7, drag: 2 });
    this.spawn(c.clone().addScaledVector(dir, 2.1), dir.clone().multiplyScalar(5), { color: 0xffffff, size: 0.14, life: 0.35, count: 8, spread: 4, drag: 2 });
  }

  updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) { s.g.removeFromParent(); this.shells.splice(i, 1); continue; }
      s.g.position.copy(s.follow());
      s.g.scale.setScalar(1 + k * 0.35);
      s.g.rotation.y += dt * 3;
      // flicker, then fade (the cap fastest)
      const f = (1 - k) * (0.75 + 0.25 * Math.sin(s.t * 70));
      s.mats[0].opacity = s.base[0] * f;
      s.mats[1].opacity = s.base[1] * f;
      s.mats[2].opacity = s.base[2] * Math.max(0, 1 - k * 2.2);
    }
  }

  // Strike warning: a disc draped on the terrain, a pulsing dashed rim and a hatched fill creeping out as the strike
  // nears. this.ground is the current world's ground function (Moon or Spindle).
  warningRing(pos, radius, dur) {
    const up = upAt(pos);
    const t1 = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x);
    if (t1.lengthSq() < 1e-6) t1.set(0, 1, 0).addScaledVector(up, -up.y);
    t1.normalize();
    const t2 = new THREE.Vector3().crossVectors(up, t1);
    const NA = 40, NR = 7;
    const P = [], R = [], A = [], idx = [];
    const q = new THREE.Vector3(), o = new THREE.Vector3();
    const drop = (x, y) => { q.copy(pos).addScaledVector(t1, x).addScaledVector(t2, y); return this.ground ? this.ground(q, o, 0.22) : o.copy(q).addScaledVector(up, 0.4); };
    const c = drop(0, 0); P.push(c.x, c.y, c.z); R.push(0); A.push(0);
    for (let j = 1; j <= NR; j++) for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2, rr = (j / NR) * radius;
      const v = drop(Math.cos(a) * rr, Math.sin(a) * rr);
      P.push(v.x, v.y, v.z); R.push(j / NR); A.push(i / NA);
    }
    for (let i = 0; i < NA; i++) idx.push(0, 1 + i, 1 + ((i + 1) % NA));
    for (let j = 1; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a0 = 1 + (j - 1) * NA + i, a1 = 1 + (j - 1) * NA + ((i + 1) % NA), b0 = a0 + NA, b1 = a1 + NA;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('aR', new THREE.Float32BufferAttribute(R, 1));
    geo.setAttribute('aA', new THREE.Float32BufferAttribute(A, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { k: { value: 0 }, pulse: { value: 1 } },
      vertexShader: 'attribute float aR; attribute float aA; varying float vR; varying float vA; void main(){ vR=aR; vA=aA; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float k; uniform float pulse; varying float vR; varying float vA;
        void main(){
          float rim = step(0.86, vR) * (0.55 + 0.45 * step(0.5, fract(vA * 20.0)));
          float hatch = step(0.5, fract(vA * 24.0 + vR * 5.0));
          float fill = step(vR, k) * (0.12 + 0.18 * hatch);
          float a = rim * (0.45 + 0.55 * pulse) + fill;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vec3(1.0, 0.16, 0.29), vec3(1.0, 0.82, 0.25), rim * 0.25), a);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 3;
    this.scene.add(m);
    const r = { m, inner: m, t: 0, dur, decal: true };
    this.rings.push(r);
    return r;
  }

  // Onomatopoeia at a world position (screen centre if pos is null), queued past POP_MAX. prio 1 (the runner's own)
  // jumps ordinary chatter; prio 2 is the K.O.
  pop(text, pos = null, { color = '#ffd23f', size = 64, life = 1.0, rot = null, prio = 0 } = {}) {
    const q = this.popQueue;
    let i = q.length;
    while (i > 0 && q[i - 1].prio < prio) i--; // behind everything of its rank or higher
    q.splice(i, 0, { text, pos: pos ? pos.clone() : null, color, size, life: Math.max(0.2, life), rot, prio, wait: 0 });
    if (q.length > POP_QUEUE_MAX) q.splice(q.findIndex((e) => e.prio === q[q.length - 1].prio), 1); // oldest of the lowest rank
    this.pumpPops();
  }

  // start queued popups while there's room; run time counts from here. Off-screen ones are dropped, not started.
  pumpPops() {
    while (this.pops.length < POP_MAX && this.popQueue.length) this.startPop(this.popQueue.shift());
  }

  startPop(e) {
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = e.text;
    el.style.color = e.color;
    // pixel font: sizes scaled by 0.55, only a slight tilt (pixels hate rotation)
    el.style.fontSize = Math.round(Math.max(10, e.size * 0.55)) + 'px';
    el.style.setProperty('--rot', Math.round((e.rot ?? (Math.random() * 24 - 12)) * 0.25) + 'deg');
    el.style.animationDuration = e.life + 's';
    const p = { el, pos: e.pos, t: 0, life: e.life, lp: 50, tp: 36, w: 0, h: 0, nudge: 0, fresh: true, done: false };
    if (!e.pos) { p.lp = 50 + (Math.random() * 20 - 10); p.tp = 32 + Math.random() * 10; }
    if (!this.placePop(p)) return;
    this.popLayer.appendChild(el);
    p.w = el.offsetWidth; p.h = el.offsetHeight;
    el.addEventListener('animationend', () => { p.done = true; }); // CSS runs on the wall clock: frees the slot however slow the frames
    this.pops.push(p);
  }

  // world popups follow their spot, screen ones stay put. False: the spot is off screen
  placePop(p) {
    if (p.pos) {
      this.camera.updateMatrixWorld();
      if (!toScreen(this.v.copy(p.pos), this.camera) || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) return false;
      p.lp = ((this.v.x + 1) / 2) * 100;
      p.tp = ((1 - this.v.y) / 2) * 100;
    }
    p.el.style.left = p.lp + '%';
    p.el.style.top = p.tp + '%';
    return true;
  }

  // If the newer popup overlaps the older, nudge it up or down clear. Sizes are read once at start; the nudge eases so a
  // moving anchor doesn't jitter.
  separatePops(dt) {
    const [a, b] = this.pops, W = window.innerWidth, H = window.innerHeight;
    if (a && !b) { a.nudge += -a.nudge * Math.min(1, dt * 4); a.el.style.marginTop = a.nudge.toFixed(1) + 'px'; return; } // alone: settle back
    if (!b) return;
    const ay = (a.tp / 100) * H + a.nudge, by = (b.tp / 100) * H;
    const needY = ((a.h + b.h) / 2) * 1.35 + 8; // headroom for the pop's overshoot and upward drift
    let target = 0;
    if (Math.abs((a.lp - b.lp) / 100 * W) < ((a.w + b.w) / 2) * 1.1 && Math.abs(by - ay) < needY) {
      const dir = by >= ay ? 1 : -1; // keep to its current side, unless that runs off screen
      target = ay + dir * needY - by;
      const y = by + target;
      if (y > H - b.h || y < b.h) target = ay - dir * needY - by;
    }
    b.nudge = b.fresh ? target : b.nudge + (target - b.nudge) * Math.min(1, dt * 14);
    b.fresh = false;
    b.el.style.marginTop = b.nudge.toFixed(1) + 'px';
  }

  clearPops() {
    for (const p of this.pops) p.el.remove();
    this.pops.length = 0;
    this.popQueue.length = 0;
  }

  // popDt: real time, like the popups' CSS; pause or Monolith time dilation mustn't stall them or the queue never drains
  update(dt, popDt = dt) {
    this.updateEmbers(dt);
    this.updateShells(dt);
    this.updateGhosts(dt);
    // particles
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      if (p.gravity) p.vel.addScaledVector(upAt(p.pos, this.v), -p.gravity * dt);
      p.vel.multiplyScalar(1 - p.drag * dt);
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      this.s.setScalar(p.size * (0.3 + 0.7 * k));
      this.m4.compose(p.pos, this.q, this.s);
      this.pMesh.setMatrixAt(n, this.m4);
      this.pMesh.setColorAt(n, p.color);
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) {
        this.scene.remove(b.g);
        b.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        b.mats.forEach((m) => m.dispose());
        this.booms.splice(i, 1);
        continue;
      }
      b.g.scale.setScalar(b.radius * (0.3 + Math.pow(k, 0.4) * 0.9));
      b.mats.forEach((m) => (m.opacity = 1 - k * k));
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.dur) {
        this.scene.remove(r.m);
        r.m.geometry.dispose(); if (r.inner !== r.m) r.inner.geometry.dispose(); if (r.decal) r.m.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const k = r.t / r.dur;
      if (r.beam) { r.m.material.opacity = 1 - k; r.inner.material.opacity = 1 - k; r.m.scale.set(1 - k * 0.8, 1, 1 - k * 0.8); continue; }
      if (r.decal) { r.m.material.uniforms.k.value = k; r.m.material.uniforms.pulse.value = 0.5 + 0.5 * Math.sin(r.t * (8 + k * 20)); continue; }
      r.m.material.opacity = 0.5 + 0.5 * Math.sin(r.t * (8 + k * 20));
      r.inner.material.opacity = 0.1 + k * 0.3;
      r.inner.scale.setScalar(k);
    }

    const q = this.popQueue;
    for (let i = q.length - 1; i >= 0; i--) {
      const e = q[i];
      e.wait += popDt;
      if (e.pos && e.prio < 2 && e.wait > (e.prio ? POP_WAIT_WORLD_PRIO : POP_WAIT_WORLD)) q.splice(i, 1);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += popDt;
      if (p.t >= p.life || p.done || (p.pos && !this.placePop(p))) { p.el.remove(); this.pops.splice(i, 1); } // ended, or its spot left the screen
    }
    this.pumpPops();
    this.separatePops(popDt);
  }
}
