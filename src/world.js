import * as THREE from 'three';
import { toon, ink, glow, textSprite } from './toon.js';
import { makeDish, makeFigure, makeShuttle, makeRover, makeHoverCar, makeFreighter, makeRocket } from './models.js';
import { mulberry32 } from './rng.js';
import { FACTIONS } from './locations.js';
import { SUN, frameQuat, arcDist, dirFromAngles } from './geo.js';

function mesh(geo, mat, outline = 0.15) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const ACTIVE_DIST = 2600;

// Builds everything that sits on the moon. Each settlement lives in its own local frame
// (Y = local up, XZ = its flat plateau) and is only attached to the scene while the
// camera is close enough to see it.
export class World {
  constructor(scene, planet, colliders, locations) {
    this.scene = scene;
    this.planet = planet;
    this.colliders = colliders;
    this.locations = locations;
    this.spinners = [];
    this.blinkers = [];
    this.dishes = [];
    this.figures = [];
    this.vehicles = [];
    this.crawlers = [];
    this.zoneWalls = [];
    this.rand = mulberry32(42);

    this.buildSky();
    for (const loc of locations) this.buildLocation(loc);
    this.buildTraffic();
  }

  r() { return this.rand(); }

  buildSky() {
    const sky = new THREE.Group();
    this.sky = sky;
    const N = 3000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(th) * 7000;
      pos[i * 3 + 1] = u * 7000;
      pos[i * 3 + 2] = s * Math.sin(th) * 7000;
      col[i * 3] = 0.8 + Math.random() * 0.2; col[i * 3 + 1] = 0.8 + Math.random() * 0.2; col[i * 3 + 2] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true })));

    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1f6fff'; ctx.fillRect(0, 0, 512, 256);
    const rr = mulberry32(7);
    ctx.fillStyle = '#3ad15a';
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.ellipse(rr() * 512, 40 + rr() * 176, 20 + rr() * 60, 12 + rr() * 34, rr() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.ellipse(rr() * 512, rr() * 256, 10 + rr() * 50, 3 + rr() * 8, rr() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(0, 0, 512, 14); ctx.fillRect(0, 242, 512, 14);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Earth hangs over the near side; it is never visible from the dark side
    this.earthDir = dirFromAngles(14, 200);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(420, 40, 24), new THREE.MeshBasicMaterial({ map: tex }));
    earth.position.copy(this.earthDir).multiplyScalar(6000);
    const hull = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide }));
    hull.scale.setScalar(1.035);
    earth.add(hull);
    const atmo = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.25, side: THREE.BackSide }));
    atmo.scale.setScalar(1.08);
    earth.add(atmo);
    this.earth = earth;
    sky.add(earth);

    const sun = new THREE.Mesh(new THREE.CircleGeometry(160, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    sun.position.copy(SUN).multiplyScalar(6200);
    sun.lookAt(0, 0, 0);
    sky.add(sun);
    const burst = new THREE.Mesh(new THREE.RingGeometry(170, 260, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5 }));
    burst.position.copy(sun.position);
    burst.lookAt(0, 0, 0);
    sky.add(burst);
    this.scene.add(sky);
  }

  // ---------- local-frame helpers ----------
  frame(loc) {
    const g = new THREE.Group();
    // local +Z points sunward along the surface (consistent lighting per layout)
    frameQuat(loc.dir, SUN, g.quaternion);
    g.position.copy(loc.dir).multiplyScalar(loc.zr);
    g.updateMatrixWorld(true);
    loc.group = g;
    loc.pos = g.position.clone();
    loc.active = false;
    return g;
  }

  toWorld(loc, x, y, z, out = new THREE.Vector3()) {
    return loc.group.localToWorld(out.set(x, y, z));
  }

  col(loc, spec) {
    const g = loc.group;
    if (spec.type === 'sphere') {
      return this.colliders.add({ type: 'sphere', c: this.toWorld(loc, spec.x, spec.y, spec.z), r: spec.r });
    }
    if (spec.type === 'cyl') {
      return this.colliders.add({ type: 'cyl', c: this.toWorld(loc, spec.x, 0, spec.z), axis: loc.dir.clone(), y0: spec.y0, y1: spec.y1, r: spec.r });
    }
    const yaw = spec.yaw || 0;
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).premultiply(g.quaternion);
    return this.colliders.add({
      type: 'box', c: this.toWorld(loc, spec.x, spec.y, spec.z),
      ax: new THREE.Vector3(1, 0, 0).applyQuaternion(_q), ay: new THREE.Vector3(0, 1, 0).applyQuaternion(_q), az: new THREE.Vector3(0, 0, 1).applyQuaternion(_q),
      hx: spec.hx, hy: spec.hy, hz: spec.hz,
    });
  }

  // Place object in a settlement's local frame. Static objects get frozen matrices.
  put(obj, loc, dx, dz, dy = 0, yaw = 0, dynamic = false) {
    obj.position.set(dx, dy, dz);
    obj.rotation.y = yaw;
    loc.group.add(obj);
    if (!dynamic) {
      obj.updateMatrix();
      obj.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    }
    return obj;
  }

  dome(loc, dx, dz, r, color, outline = 0.25) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon(color), outline));
    const ring = mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.08, r * 0.08, 28), toon(0x4a4660), 0.1);
    ring.position.y = r * 0.04;
    g.add(ring);
    const band = mesh(new THREE.TorusGeometry(r * 0.86, r * 0.03, 6, 32), glow(0xfff6a8), 0);
    band.rotation.x = Math.PI / 2;
    band.position.y = r * 0.5;
    g.add(band);
    this.put(g, loc, dx, dz, -0.5);
    this.col(loc, { type: 'sphere', x: dx, y: -0.5, z: dz, r });
    return g;
  }

  block(loc, dx, dz, w, h, d, color, yaw = 0, roof = 0x3a3550) {
    const g = new THREE.Group();
    const main = mesh(new THREE.BoxGeometry(w, h, d), toon(color), 0.2);
    main.position.y = h / 2;
    g.add(main);
    const rf = mesh(new THREE.BoxGeometry(w * 1.06, 0.6, d * 1.06), toon(roof), 0.1);
    rf.position.y = h + 0.3;
    g.add(rf);
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 0.12, d * 1.01), glow(0xfff6a8));
    win.position.y = h * 0.65;
    g.add(win);
    this.put(g, loc, dx, dz, 0, yaw);
    this.col(loc, { type: 'box', x: dx, y: h / 2 + 0.3, z: dz, hx: w / 2 + 0.2, hy: h / 2 + 0.3, hz: d / 2 + 0.2, yaw });
    return g;
  }

  tube(loc, ax, az, bx, bz, r = 2.2, color = 0xd8d4e8) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateZ(Math.PI / 2), toon(color), 0.12);
    const yaw = -Math.atan2(bz - az, bx - ax);
    this.put(m, loc, (ax + bx) / 2, (az + bz) / 2, r * 0.8, yaw);
    this.col(loc, { type: 'box', x: (ax + bx) / 2, y: r * 0.8, z: (az + bz) / 2, hx: len / 2, hy: r, hz: r, yaw });
  }

  tower(loc, dx, dz, h, r, color, beacon = 0xff2e88) {
    const g = new THREE.Group();
    const t = mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 10), toon(color), 0.15);
    t.position.y = h / 2;
    g.add(t);
    const mat = new THREE.MeshBasicMaterial({ color: beacon });
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 10, 8), mat);
    b.position.y = h + r * 0.5;
    g.add(b);
    this.blinkers.push({ mat, base: new THREE.Color(beacon), phase: this.r() * 6, loc });
    this.put(g, loc, dx, dz);
    this.col(loc, { type: 'cyl', x: dx, z: dz, y0: -2, y1: h, r: r + 0.2 });
    return g;
  }

  pad(loc, dx, dz, r, color = 0xffd23f) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.5, 32), toon(0x4a4660), 0.08));
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.65, r * 0.8, 32), toon(color));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.27;
    g.add(ring);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.15, r * 0.9), toon(color));
    bar.rotation.x = -Math.PI / 2;
    bar.position.y = 0.28;
    g.add(bar);
    this.put(g, loc, dx, dz, 0);
    return g;
  }

  flag(loc, dx, dz, colors, h = 14) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.15, 0.15, h), toon(0xe0e0e0), 0.05);
    pole.position.y = h / 2;
    g.add(pole);
    const rod = mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2).rotateZ(Math.PI / 2), toon(0xe0e0e0), 0);
    rod.position.set(2.1, h - 0.1, 0);
    g.add(rod);
    colors.forEach((c, i) => {
      const s = mesh(new THREE.BoxGeometry(4, 2.6 / colors.length, 0.06), toon(c), 0.03);
      s.position.set(2.1, h - 0.3 - (i + 0.5) * (2.6 / colors.length), 0);
      g.add(s);
    });
    this.put(g, loc, dx, dz);
    return g;
  }

  solarField(loc, dx, dz, rows, cols, yaw = 0) {
    const geo = new THREE.BoxGeometry(5, 0.2, 3);
    const im = new THREE.InstancedMesh(geo, toon(0x2b3a8f), rows * cols);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, yaw, 0, 'YXZ'));
    let k = 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const lx = (j - cols / 2) * 6, lz = (i - rows / 2) * 5;
      m4.compose(new THREE.Vector3(dx + lx * cos + lz * sin, 1.8, dz - lx * sin + lz * cos), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(k++, m4);
    }
    im.castShadow = true;
    this.put(im, loc, 0, 0);
  }

  // Lamp post with a fake additive light pool: cheap "lighting" that reads in the dark.
  lamp(loc, dx, dz, color = 0xfff1b0, h = 8, pool = 16) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 6), toon(0x3a3550), 0.05);
    pole.position.y = h / 2;
    g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), glow(color));
    bulb.position.y = h + 0.3;
    g.add(bulb);
    const p = new THREE.Mesh(new THREE.CircleGeometry(pool, 24), this.poolMat(color));
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.15;
    g.add(p);
    this.put(g, loc, dx, dz);
  }

  poolMat(color) {
    this._pools ||= new Map();
    if (!this._pools.has(color)) {
      this._pools.set(color, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color(color) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 color; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.6); float band = step(0.5, fract(a * 3.0)) * 0.15; gl_FragColor = vec4(color * (a * 0.55 + band * a), 1.0); }',
      }));
    }
    return this._pools.get(color);
  }

  sign(loc, text, color, y = 46) {
    const s = textSprite(text, { color, scale: 1.4 });
    s.position.set(0, y, 0);
    loc.group.add(s);
    loc.sign = s;
  }

  addFigures(loc, count, opts) {
    for (let i = 0; i < count; i++) {
      const f = makeFigure(opts.look ? opts.look(i) : {});
      const a = this.r() * Math.PI * 2, d = (0.3 + this.r() * 0.55) * loc.r;
      f.root.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      loc.group.add(f.root);
      this.figures.push({ ...f, loc, kind: opts.kind || 'worker', target: f.root.position.clone(), wait: this.r() * 3, phase: this.r() * 10, vy: 0, hop: 0 });
    }
  }

  buildLocation(loc) {
    this.frame(loc);
    const fc = FACTIONS[loc.faction].color;
    switch (loc.type) {
      case 'hub': this.buildHub(loc); break;
      case 'civilian': this.buildCivilian(loc); break;
      case 'research': loc.id === 'shackleton' || loc.id === 'farside' ? this.buildArray(loc) : this.buildBioLab(loc); break;
      case 'industrial': this.buildMine(loc); break;
      case 'military': this.buildMilitary(loc); break;
      case 'pirate': loc.camp ? this.buildCamp(loc) : this.buildGulch(loc); break;
    }
    if (loc.dark && loc.type !== 'pirate') {
      // dark-side settlements ring themselves with lamps
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.lamp(loc, Math.cos(a) * loc.r * 0.8, Math.sin(a) * loc.r * 0.8, 0xfff1b0, 9, 20);
      }
    }
    this.sign(loc, loc.name.toUpperCase(), fc, loc.type === 'hub' ? 95 : loc.camp ? 26 : 50);
  }

  buildHub(loc) {
    this.dome(loc, 0, 0, 58, 0x9be7ff, 0.35);
    this.tower(loc, 0, 0, 82, 4, 0xfff4e0, 0xffd23f);
    const embassies = [
      { f: 'accord', a: 0.6, colors: [0x2ec4ff, 0xffffff, 0x1b3a8f] },
      { f: 'directorate', a: 2.2, colors: [0xff3b5c, 0xffd23f] },
      { f: 'equa', a: 3.8, colors: [0xc77dff, 0x7dff6a, 0xc77dff] },
      { f: 'sci', a: 5.2, colors: [0x7dff6a, 0xffffff] },
    ];
    for (const e of embassies) {
      const dx = Math.cos(e.a) * 112, dz = Math.sin(e.a) * 112;
      const col = new THREE.Color(FACTIONS[e.f].color).getHex();
      this.block(loc, dx, dz, 26, 14, 18, col, -e.a + Math.PI / 2, 0x2a2540);
      this.flag(loc, dx + Math.cos(e.a) * 20, dz + Math.sin(e.a) * 20, e.colors);
      this.tube(loc, Math.cos(e.a) * 57, Math.sin(e.a) * 57, Math.cos(e.a) * 99, Math.sin(e.a) * 99, 2.4);
    }
    const board = this.block(loc, 0, 76, 16, 9, 3, 0xffd23f, 0, 0xff3b5c);
    const bs = textSprite('JOB BOARD', { color: '#ffffff', size: 80, scale: 0.6 });
    bs.position.set(0, 14, 0);
    board.add(bs);
    bs.updateMatrix();

    // Hall of Highlights: your best action shots, pinned up for the whole base to see
    const hall = new THREE.Group();
    const frameM = mesh(new THREE.BoxGeometry(34, 22, 1.6), toon(0xff2e88), 0.25);
    frameM.position.y = 14;
    hall.add(frameM);
    for (const sx of [-1, 1]) {
      const leg = mesh(new THREE.BoxGeometry(1.4, 6, 1.4), toon(0x3a3550), 0.08);
      leg.position.set(sx * 14, 2, 0);
      hall.add(leg);
    }
    this.highlightCanvas = document.createElement('canvas');
    this.highlightCanvas.width = 1024; this.highlightCanvas.height = 640;
    this.highlightTex = new THREE.CanvasTexture(this.highlightCanvas);
    this.highlightTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 20), new THREE.MeshBasicMaterial({ map: this.highlightTex }));
    screen.position.set(0, 14, 0.85);
    hall.add(screen);
    this.put(hall, loc, -44, 92, 0, 0);
    this.col(loc, { type: 'box', x: -44, y: 12, z: 92, hx: 17, hy: 12, hz: 1.2 });
    this.highlightSpot = { loc, x: -44, z: 92 };

    // repair bay hangar
    const hangar = mesh(new THREE.CylinderGeometry(16, 16, 34, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xff9f1c), 0.25);
    this.put(hangar, loc, -80, -70, 0, 0.7);
    this.col(loc, { type: 'box', x: -80, y: 7, z: -70, hx: 17, hy: 8, hz: 16, yaw: 0.7 });
    const rs = textSprite('REPAIR BAY', { color: '#ff9f1c', size: 70, scale: 0.6 });
    rs.position.set(-80, 24, -70);
    loc.group.add(rs);
    this.pad(loc, 95, -60, 16);
    this.pad(loc, -120, 40, 16, 0x2ec4ff);
    this.dome(loc, 70, 140, 16, 0xff7ad9);
    this.dome(loc, -60, 145, 14, 0xffd23f);
    this.solarField(loc, 150, 60, 4, 6, 0.4);
    this.tower(loc, 140, -120, 30, 1.5, 0xe0e0e0);
    const dish = makeDish(14);
    this.put(dish.root, loc, -150, -40, 0, 0, true);
    this.dishes.push({ ...dish, speed: 0.2, loc });
    this.col(loc, { type: 'cyl', x: -150, z: -40, y0: -2, y1: 12, r: 2.5 });

    // Launch complex: where most new arrivals touch down on the Moon
    const lp = { x: 20, z: -185 };
    this.pad(loc, lp.x, lp.z, 30, 0xff4f2e);
    const gantry = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const seg = mesh(new THREE.BoxGeometry(5, 9, 5), toon(i % 2 ? 0xff4f2e : 0xfff4e0), 0.12);
      seg.position.y = 4.5 + i * 9;
      gantry.add(seg);
    }
    const arm = mesh(new THREE.BoxGeometry(14, 1.5, 2), toon(0x3a3550), 0.08);
    arm.position.set(-8, 40, 0);
    gantry.add(arm);
    this.put(gantry, loc, lp.x + 40, lp.z, 0);
    this.col(loc, { type: 'box', x: lp.x + 40, y: 27, z: lp.z, hx: 2.8, hy: 27, hz: 2.8 });
    for (const [tx, tz] of [[lp.x - 40, lp.z + 12], [lp.x - 40, lp.z - 12]]) {
      const t = mesh(new THREE.SphereGeometry(7, 16, 12), toon(0xfff4e0), 0.15);
      this.put(t, loc, tx, tz, 7);
      this.col(loc, { type: 'sphere', x: tx, y: 7, z: tz, r: 7 });
    }
    const ls = textSprite('ARRIVALS', { color: '#ff4f2e', size: 70, scale: 0.6 });
    ls.position.set(lp.x, 30, lp.z + 20);
    loc.group.add(ls);
    const rocket = makeRocket();
    this.put(rocket.root, loc, lp.x, lp.z, 900, 0, true);
    this.rocket = { ...rocket, loc, lp, t: 0, alt: 900, period: 76 };
    this.launchPad = { loc, x: lp.x, z: lp.z };

    this.addFigures(loc, 14, { kind: 'worker', look: (i) => ({ suit: [0xff9f1c, 0xffd23f, 0x2ec4ff, 0xffffff][i % 4] }) });
  }

  buildCivilian(loc) {
    const palette = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff];
    const domes = [];
    const n = loc.id === 'tranq' ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.r() * 0.3;
      const d = 40 + this.r() * 35;
      const r = 11 + this.r() * 9;
      const dx = Math.cos(a) * d, dz = Math.sin(a) * d;
      this.dome(loc, dx, dz, r, palette[i % palette.length]);
      domes.push([dx, dz, r]);
    }
    this.dome(loc, 0, 0, 22, 0xb8ffb0, 0.3);
    for (const [dx, dz, r] of domes) {
      const k = 22 / Math.hypot(dx, dz);
      const k2 = 1 - r / Math.hypot(dx, dz);
      this.tube(loc, dx * k, dz * k, dx * k2, dz * k2, 1.6, 0xfff4e0);
    }
    for (let i = 0; i < 5; i++) {
      const a = this.r() * Math.PI * 2, d = 90 + this.r() * 15;
      this.block(loc, Math.cos(a) * Math.min(d, loc.r * 0.85), Math.sin(a) * Math.min(d, loc.r * 0.85), 10, 6, 8, palette[(i + 2) % palette.length], a);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.tower(loc, 55 + Math.cos(a) * 10, -60 + Math.sin(a) * 10, 3, 0.4, 0xfff4e0, palette[i]);
    }
    this.pad(loc, -65, 55, 13);
    this.addFigures(loc, 8, { kind: 'worker', look: (i) => ({ suit: palette[i % palette.length] }) });
    this.addFigures(loc, 7, { kind: 'kid', look: (i) => ({ suit: palette[(i + 3) % palette.length], scale: 0.55 }) });
  }

  buildArray(loc) {
    const pts = [[-60, -30, 26], [55, -40, 30], [0, 60, 34], [-80, 70, 18]];
    for (const [dx, dz, s] of pts) {
      const d = makeDish(s, 0xfff4e0);
      this.put(d.root, loc, dx, dz, 0, 0, true);
      this.dishes.push({ ...d, speed: 0.05 + this.r() * 0.1, loc });
      this.col(loc, { type: 'cyl', x: dx, z: dz, y0: -2, y1: s * 0.95, r: s * 0.2 + 0.5 });
    }
    this.dome(loc, 70, 50, 20, 0xe0e0f0);
    this.block(loc, -10, -80, 30, 10, 16, 0x7dff6a, 0.2);
    this.block(loc, 30, -95, 14, 8, 12, 0xfff4e0, -0.3);
    this.tower(loc, 100, -20, 40, 2, 0xe0e0e0, 0x7dff6a);
    this.pad(loc, -100, -20, 13, 0x7dff6a);
    this.solarField(loc, 0, 120, 3, 8, 0);
    this.addFigures(loc, 8, { kind: 'worker', look: () => ({ suit: 0xffffff, visor: 0x2b8f4a }) });
  }

  buildBioLab(loc) {
    const greens = [0x6aff9e, 0xb8ffb0, 0x2edfa0];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      const g = this.dome(loc, Math.cos(a) * 50, Math.sin(a) * 50, 18, greens[i % 3]);
      for (let k = 0; k < 4; k++) {
        const c = mesh(new THREE.ConeGeometry(2, 7, 6), toon(0x1f8a3a), 0.05);
        c.position.set((this.r() - 0.5) * 18, 3.5, (this.r() - 0.5) * 18);
        c.updateMatrix(); c.matrixAutoUpdate = false;
        g.add(c);
      }
    }
    this.block(loc, 0, 0, 22, 12, 22, 0xfff4e0, 0.785, 0x2edfa0);
    this.tower(loc, 0, 0, 30, 1.6, 0xe0e0e0, 0x6aff9e);
    this.pad(loc, 80, -40, 12, 0x6aff9e);
    this.addFigures(loc, 6, { kind: 'worker', look: () => ({ suit: 0xffffff, visor: 0x2b8f4a }) });
  }

  buildMine(loc) {
    const rig = mesh(new THREE.CylinderGeometry(3, 6, 45, 8), toon(0xffd23f), 0.2);
    this.put(rig, loc, 0, 0, 22.5);
    this.col(loc, { type: 'cyl', x: 0, z: 0, y0: -2, y1: 45, r: 6 });
    const arm = mesh(new THREE.BoxGeometry(60, 3, 3), toon(0xff9f1c), 0.12);
    this.put(arm, loc, 0, 0, 40, 0, true);
    this.spinners.push({ obj: arm, axis: 'y', speed: 0.15, loc });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const t = mesh(new THREE.CylinderGeometry(7, 7, 14, 14), toon(i % 2 ? 0x7dff6a : 0xc77dff), 0.15);
      this.put(t, loc, Math.cos(a) * 60, Math.sin(a) * 60, 7);
      this.col(loc, { type: 'cyl', x: Math.cos(a) * 60, z: Math.sin(a) * 60, y0: -2, y1: 14, r: 7.2 });
    }
    this.block(loc, -40, 70, 24, 9, 12, 0x8a8aa0, 0.3);
    this.pad(loc, 70, 50, 12);
    this.addFigures(loc, 9, { kind: 'worker', look: () => ({ suit: 0xff9f1c, helmet: 0xffd23f }) });
  }

  buildMilitary(loc) {
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const wallR = 95, segs = 14;
    for (let i = 1; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const len = (2 * Math.PI * wallR) / segs * 0.92;
      this.block(loc, Math.cos(a) * wallR, Math.sin(a) * wallR, len, 7, 3, 0x5b5870, -a + Math.PI / 2, fc);
    }
    this.block(loc, 0, 0, 30, 12, 30, 0x4a4660, 0.785, fc);
    this.block(loc, 40, -30, 26, 8, 14, 0x5b5870, 0.2, 0x2a2540);
    this.block(loc, -35, 35, 20, 10, 20, 0x5b5870, -0.4, 0x2a2540);
    this.tower(loc, -40, -40, 50, 2.2, 0x5b5870, 0xff2a4a);
    const dish = makeDish(12, 0xb0b0c0);
    this.put(dish.root, loc, 50, 40, 0, 0, true);
    this.dishes.push({ ...dish, speed: 0.6, loc });
    this.col(loc, { type: 'cyl', x: 50, z: 40, y0: -2, y1: 11, r: 2.5 });
    this.flag(loc, 0, 70, loc.faction === 'accord' ? [0x2ec4ff, 0xffffff, 0x1b3a8f] : [0xff3b5c, 0xffd23f], 20);
    this.addFigures(loc, 8, { kind: 'soldier', look: () => ({ suit: 0x55607a, helmet: fc, visor: 0x111111 }) });

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xff2a4a) }, alert: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float time; uniform vec3 color; uniform float alert; varying vec2 vUv; varying vec3 vW;
        void main(){ float s = step(0.5, fract((vW.x+vW.z)*0.04 + vW.y*0.04 - time*0.3));
          float fade = (1.0 - vUv.y);
          float a = (0.12 + 0.25*s + alert*0.25) * fade;
          gl_FragColor = vec4(color, a); }`,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(loc.zoneR, loc.zoneR, 170, 96, 1, true), mat);
    this.put(wall, loc, 0, 0, 15);
    this.zoneWalls.push({ loc, mat });
  }

  buildGulch(loc) {
    const rust = [0x8a4b2a, 0x6b5a3a, 0x9a9a9a, 0x5a3a5a];
    for (let i = 0; i < 14; i++) {
      const a = this.r() * Math.PI * 2, d = 20 + this.r() * 80;
      const w = 4 + this.r() * 10, h = 3 + this.r() * 8;
      this.block(loc, Math.cos(a) * d, Math.sin(a) * d, w, h, 4 + this.r() * 8, rust[i % 4], this.r() * 3, 0x2a2a2a);
    }
    const hull = mesh(new THREE.CapsuleGeometry(9, 40, 6, 12).rotateZ(Math.PI / 2 - 0.2), toon(0x6b6880), 0.3);
    this.put(hull, loc, 0, -40, 6, 0.5);
    this.col(loc, { type: 'box', x: 0, y: 6, z: -40, hx: 28, hy: 9, hz: 9, yaw: 0.5 });
    this.flag(loc, 20, 20, [0x111111, 0x111111], 18);
    this.tower(loc, -30, 30, 18, 1.2, 0x3a3a3a, 0xff9f1c);
    // heat lamps: sickly orange pools in the dark
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      this.lamp(loc, Math.cos(a) * 60, Math.sin(a) * 60, 0xff9f1c, 5, 14);
    }
    this.addFigures(loc, 6, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  buildCamp(loc) {
    const rust = [0x8a4b2a, 0x6b5a3a, 0x5a3a5a];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + this.r();
      this.block(loc, Math.cos(a) * 28, Math.sin(a) * 28, 6 + this.r() * 5, 4, 6, rust[i % 3], a, 0x2a2a2a);
    }
    this.flag(loc, 0, 0, [0x111111, 0x7dff3a, 0x111111], 12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.lamp(loc, Math.cos(a) * 14, Math.sin(a) * 14, 0x7dff3a, 4, 12);
    }
    this.addFigures(loc, 3, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  // ---------- traffic: cars, buses and big freighters ----------
  port(loc, out = new THREE.Vector3()) {
    const off = loc.id === 'ilmb' ? [95, -60] : [loc.r * 0.55, -loc.r * 0.35];
    return this.toWorld(loc, off[0], 0, off[1], out);
  }

  route(A, B, cruise, endAlt, step = 25) {
    const a = this.port(A).normalize(), b = this.port(B).normalize();
    const len = arcDist(a, b);
    const steps = Math.max(2, Math.ceil(len / step));
    const raw = [];
    for (let i = 0; i <= steps; i++) {
      const d = new THREE.Vector3().lerpVectors(a, b, i / steps).normalize();
      raw.push({ d, r: this.planet.surface(d.clone().multiplyScalar(this.planet.R)) });
    }
    const pts = raw.map((p, i) => {
      let rmax = -Infinity;
      for (let k = -3; k <= 3; k++) rmax = Math.max(rmax, raw[Math.min(steps, Math.max(0, i + k))].r);
      const fromEnd = Math.min(i, steps - i) * step;
      const blend = Math.min(1, fromEnd / 180);
      const alt = endAlt + (cruise - endAlt) * blend * blend * (3 - 2 * blend);
      return p.d.clone().multiplyScalar(Math.max(rmax + Math.min(alt, 8 + blend * cruise), p.r + alt));
    });
    return { pts, len };
  }

  addVehicle(kind, A, B) {
    let model, cruise, endAlt, speed, radius, view;
    if (kind === 'car') {
      model = makeHoverCar({ color: [0xff7ad9, 0x2ec4ff, 0x7dff6a, 0xffd23f][this.vehicles.length % 4] });
      cruise = 6; endAlt = 2.5; speed = 34; radius = 2.5; view = 900;
    } else if (kind === 'bus') {
      model = makeShuttle({ stripe: [0x2ec4ff, 0xff9f1c, 0x7dff6a, 0xc77dff][this.vehicles.length % 4] });
      cruise = 22; endAlt = 4; speed = 26; radius = 5.5; view = 1600;
    } else {
      model = makeFreighter({ stripe: [0xff9f1c, 0xff2e88, 0x2ec4ff][this.vehicles.length % 3] });
      cruise = 150; endAlt = 70; speed = 42; radius = 20; view = 4200;
    }
    const { pts, len } = this.route(A, B, cruise, endAlt);
    model.root.matrixAutoUpdate = true;
    this.scene.add(model.root);
    this.vehicles.push({ ...model, kind, pts, len, t: this.r(), dir: 1, speed: speed / len, wait: 0, radius, view, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3() });
  }

  buildTraffic() {
    const L = Object.fromEntries(this.locations.map((l) => [l.id, l]));
    const cars = [['ilmb', 'tranq'], ['ilmb', 'aldrin'], ['tranq', 'kepler'], ['ilmb', 'meridian'], ['aldrin', 'shackleton'], ['shackleton', 'twilight']];
    const buses = [['ilmb', 'tranq'], ['ilmb', 'shackleton'], ['ilmb', 'mine'], ['tranq', 'kepler'], ['aldrin', 'twilight'], ['twilight', 'farside']];
    const ships = [['ilmb', 'farside'], ['ilmb', 'daedalus'], ['mine', 'hertz'], ['twilight', 'gloom'], ['kepler', 'vostok']];
    for (const [a, b] of cars) if (L[a] && L[b]) this.addVehicle('car', L[a], L[b]);
    for (const [a, b] of buses) if (L[a] && L[b]) this.addVehicle('bus', L[a], L[b]);
    for (const [a, b] of ships) if (L[a] && L[b]) this.addVehicle('ship', L[a], L[b]);
    for (const [a, b] of [['ilmb', 'mine'], ['ilmb', 'tranq'], ['aldrin', 'shackleton']]) {
      const r = makeRover({ color: 0xffd23f, trim: 0xfff4e0, pirate: false, flag: 0x2ec4ff });
      r.root.scale.setScalar(1.3);
      this.scene.add(r.root);
      const A = this.port(L[a]).normalize(), B = this.port(L[b]).normalize();
      this.crawlers.push({ ...r, A, B, t: this.r(), dir: 1, speed: 12 / arcDist(A, B), pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
  }

  // ---------- per-frame ----------
  update(dt, time, camPos) {
    this.sky.position.copy(camPos);
    this.earth.rotation.y += dt * 0.01;

    // activate settlements near the camera, drop far ones from the scene graph
    const camDir = _v.copy(camPos).normalize();
    for (const loc of this.locations) {
      loc.camDist = this.planet.R * Math.acos(Math.min(1, Math.max(-1, camDir.dot(loc.dir))));
      const want = loc.camDist < ACTIVE_DIST;
      if (want !== loc.active) {
        loc.active = want;
        if (want) this.scene.add(loc.group); else this.scene.remove(loc.group);
      }
    }
    for (const s of this.spinners) if (s.loc.active) s.obj.rotation[s.axis] += s.speed * dt;
    for (const d of this.dishes) {
      if (!d.loc.active) continue;
      d.yaw.rotation.y += d.speed * dt;
      d.tilt.rotation.x = -0.6 + Math.sin(time * d.speed * 2) * 0.25;
    }
    for (const b of this.blinkers) {
      if (!b.loc.active) continue;
      b.mat.color.copy(b.base).multiplyScalar(Math.sin(time * 3 + b.phase) > 0.2 ? 1 : 0.25);
    }
    for (const z of this.zoneWalls) z.mat.uniforms.time.value = time;

    this.updateRocket(dt, camPos);
    this.updateTraffic(dt, camPos);
    this.updateFigures(dt);
  }

  updateRocket(dt) {
    const r = this.rocket;
    if (!r) return;
    r.t = (r.t + dt) % r.period;
    const t = r.t;
    let alt, flame = 0;
    if (t < 20) { const k = 1 - t / 20; alt = 900 * k * k; flame = alt < 500 ? 1 : 0.3; }
    else if (t < 40) { alt = 0; flame = 0; }
    else if (t < 60) { const k = (t - 40) / 20; alt = 900 * k * k; flame = 1; }
    else { alt = 2000; flame = 0; }
    r.alt = alt;
    r.root.visible = t < 60;
    r.root.position.y = alt;
    r.flame.visible = r.core.visible = flame > 0;
    r.flame.scale.set(1, flame * (0.8 + Math.random() * 0.4), 1);
    r.firing = flame > 0.5 && alt < 120;
    if (r.loc.active) r.worldPos = r.loc.group.localToWorld(new THREE.Vector3(r.lp.x, alt + 20, r.lp.z));
  }

  updateTraffic(dt, camPos) {
    const tmp = _v;
    for (const s of this.vehicles) {
      if (s.wait > 0) { s.wait -= dt; s.vel.set(0, 0, 0); continue; }
      s.t += s.speed * s.dir * dt;
      if (s.t >= 1 || s.t <= 0) { s.t = Math.min(1, Math.max(0, s.t)); s.dir *= -1; s.wait = s.kind === 'ship' ? 2 : 5; }
      const f = s.t * (s.pts.length - 1);
      const i = Math.min(s.pts.length - 2, Math.floor(f));
      tmp.copy(s.pts[i]).lerp(s.pts[i + 1], f - i);
      s.vel.copy(tmp).sub(s.pos).divideScalar(Math.max(dt, 1e-3));
      s.pos.copy(tmp);
      const vis = s.pos.distanceTo(camPos) < s.view;
      s.root.visible = vis;
      if (!vis) continue;
      s.root.position.copy(s.pos);
      s.fwd.copy(s.pts[i + 1]).sub(s.pts[i]).multiplyScalar(s.dir);
      frameQuat(tmp.copy(s.pos).normalize(), s.fwd, s.root.quaternion);
      s.root.position.addScaledVector(tmp, Math.sin(time() + s.len) * 0.3);
    }
    for (const c of this.crawlers) {
      c.t += c.speed * c.dir * dt;
      if (c.t >= 1 || c.t <= 0) { c.t = Math.min(1, Math.max(0, c.t)); c.dir *= -1; }
      const d = new THREE.Vector3().lerpVectors(c.A, c.B, 0.08 + c.t * 0.84).normalize();
      const vis = d.clone().multiplyScalar(this.planet.R).distanceTo(camPos) < 1200;
      c.root.visible = vis;
      if (!vis) { c.vel.set(0, 0, 0); continue; }
      const p = this.planet.ground(d, new THREE.Vector3());
      c.vel.copy(p).sub(c.pos).divideScalar(Math.max(dt, 1e-3));
      if (c.vel.length() > 60) c.vel.set(0, 0, 0);
      c.pos.copy(p);
      c.root.position.copy(p);
      frameQuat(d, new THREE.Vector3().subVectors(c.B, c.A).multiplyScalar(c.dir), c.root.quaternion);
      for (const w of c.wheels) w.rotation.x += dt * 8;
    }
  }

  updateFigures(dt) {
    for (const f of this.figures) {
      const loc = f.loc;
      f.root.visible = loc.active && loc.camDist < 450;
      if (!f.root.visible) continue;
      const p = f.root.position;
      if (f.kind === 'kid') {
        f.hop -= dt;
        if (f.vy === 0 && f.hop <= 0) { f.vy = 3 + Math.random() * 3; f.hop = 0.5 + Math.random(); }
        if (f.vy !== 0 || p.y > 0) {
          f.vy -= 1.62 * 2 * dt;
          p.y += f.vy * dt;
          if (p.y <= 0) { p.y = 0; f.vy = 0; }
        }
      }
      if (f.wait > 0) { f.wait -= dt; continue; }
      const dx = f.target.x - p.x, dz = f.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1) {
        const a = Math.random() * Math.PI * 2, rr = (0.25 + Math.random() * 0.6) * loc.r;
        f.target.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        f.wait = f.kind === 'soldier' ? 0.5 : 1 + Math.random() * 4;
        continue;
      }
      const sp = f.kind === 'kid' ? 2.5 : f.kind === 'soldier' ? 2.2 : 1.4;
      const k = Math.min(d, sp * dt) / d;
      p.x += dx * k; p.z += dz * k;
      f.root.rotation.y = Math.atan2(dx, dz);
      f.phase += dt * 6;
      f.legL.rotation.x = Math.sin(f.phase) * 0.6;
      f.legR.rotation.x = -Math.sin(f.phase) * 0.6;
      if (f.kind !== 'kid') p.y = Math.abs(Math.sin(f.phase)) * 0.15;
    }
  }
}

const time = () => performance.now() / 1000;
