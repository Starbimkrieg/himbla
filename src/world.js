import * as THREE from 'three';
import { toon, ink, glow, textSprite } from './toon.js';
import { makeDish, makeFigure, makeShuttle, makeRover } from './models.js';
import { mulberry32 } from './rng.js';
import { FACTIONS } from './locations.js';

function mesh(geo, mat, outline = 0.15) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}

// Builds everything that sits on the terrain.
export class World {
  constructor(scene, terrain, colliders, locations) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders;
    this.locations = locations;
    this.spinners = []; // {obj, axis, speed}
    this.blinkers = []; // {mat, phase, on, off}
    this.dishes = [];
    this.figures = [];
    this.shuttles = [];
    this.crawlers = [];
    this.zoneWalls = [];
    this.rand = mulberry32(42);

    this.buildSky();
    for (const loc of locations) this.buildLocation(loc);
    this.buildBoulders();
    this.buildTraffic();
  }

  r() { return this.rand(); }

  buildSky() {
    const sky = new THREE.Group();
    this.sky = sky;
    // stars
    const N = 2600;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(th) * 7000;
      pos[i * 3 + 1] = Math.abs(u) * 7000 - 600;
      pos[i * 3 + 2] = s * Math.sin(th) * 7000;
      const t = Math.random();
      col[i * 3] = 0.8 + t * 0.2; col[i * 3 + 1] = 0.8 + Math.random() * 0.2; col[i * 3 + 2] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false })));

    // Earth: comic-style blue marble
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
    const earth = new THREE.Mesh(new THREE.SphereGeometry(420, 40, 24), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(0).gradientMap }));
    earth.position.set(2600, 2400, -5200);
    earth.rotation.z = 0.4;
    const hull = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide }));
    hull.scale.setScalar(1.035);
    earth.add(hull);
    const atmo = new THREE.Mesh(earth.geometry, new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.25, side: THREE.BackSide }));
    atmo.scale.setScalar(1.08);
    earth.add(atmo);
    this.earth = earth;
    sky.add(earth);

    // Sun
    const sun = new THREE.Mesh(new THREE.CircleGeometry(160, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    sun.position.set(-4200, 2300, 3600);
    sun.lookAt(0, 0, 0);
    sky.add(sun);
    const burst = new THREE.Mesh(new THREE.RingGeometry(170, 260, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5 }));
    burst.position.copy(sun.position);
    burst.lookAt(0, 0, 0);
    sky.add(burst);
    this.scene.add(sky);
  }

  ground(x, z) { return this.terrain.height(x, z); }

  // Place object relative to location center (on plateau).
  put(obj, loc, dx, dz, dy = 0, yaw = 0) {
    obj.position.set(loc.x + dx, loc.h + dy, loc.z + dz);
    obj.rotation.y = yaw;
    this.scene.add(obj);
    return obj;
  }

  dome(loc, dx, dz, r, color, outline = 0.25) {
    const g = new THREE.Group();
    const d = mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon(color), outline);
    g.add(d);
    const ring = mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.08, r * 0.08, 28), toon(0x4a4660), 0.1);
    ring.position.y = r * 0.04;
    g.add(ring);
    // comic window bands
    const band = mesh(new THREE.TorusGeometry(r * 0.86, r * 0.03, 6, 32), glow(0xfff6a8), 0);
    band.rotation.x = Math.PI / 2;
    band.position.y = r * 0.5;
    g.add(band);
    this.put(g, loc, dx, dz, -0.5);
    this.colliders.add({ type: 'sphere', x: loc.x + dx, y: loc.h - 0.5, z: loc.z + dz, r });
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
    this.colliders.add({ type: 'box', x: loc.x + dx, y: loc.h + h / 2 + 0.3, z: loc.z + dz, hx: w / 2 + 0.2, hy: h / 2 + 0.3, hz: d / 2 + 0.2, yaw });
    return g;
  }

  tube(loc, ax, az, bx, bz, r = 2.2, color = 0xd8d4e8) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateZ(Math.PI / 2), toon(color), 0.12);
    const yaw = -Math.atan2(bz - az, bx - ax);
    this.put(m, loc, (ax + bx) / 2, (az + bz) / 2, r * 0.8, yaw);
    this.colliders.add({ type: 'box', x: loc.x + (ax + bx) / 2, y: loc.h + r * 0.8, z: loc.z + (az + bz) / 2, hx: len / 2, hy: r, hz: r, yaw });
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
    this.blinkers.push({ mat, base: new THREE.Color(beacon), phase: this.r() * 6 });
    this.put(g, loc, dx, dz);
    this.colliders.add({ type: 'cyl', x: loc.x + dx, z: loc.z + dz, y0: loc.h - 2, y1: loc.h + h, r: r + 0.2 });
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
    // lunar flags are held out by a horizontal rod
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
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(-0.5, yaw, 0, 'YXZ');
    q.setFromEuler(e);
    let k = 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const lx = (j - cols / 2) * 6, lz = (i - rows / 2) * 5;
      const x = loc.x + dx + lx * cos + lz * sin, z = loc.z + dz - lx * sin + lz * cos;
      m4.compose(new THREE.Vector3(x, loc.h + 1.8, z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(k++, m4);
    }
    im.castShadow = true;
    this.scene.add(im);
  }

  sign(loc, text, color, y = 46) {
    const s = textSprite(text, { color, scale: 1.4 });
    s.position.set(loc.x, loc.h + y, loc.z);
    this.scene.add(s);
    loc.sign = s;
  }

  addFigures(loc, count, opts) {
    for (let i = 0; i < count; i++) {
      const f = makeFigure(opts.look ? opts.look(i) : {});
      const a = this.r() * Math.PI * 2, d = (0.3 + this.r() * 0.55) * loc.r;
      f.root.position.set(loc.x + Math.cos(a) * d, loc.h, loc.z + Math.sin(a) * d);
      this.scene.add(f.root);
      this.figures.push({ ...f, loc, kind: opts.kind || 'worker', target: new THREE.Vector3().copy(f.root.position), wait: this.r() * 3, phase: this.r() * 10, vy: 0, hop: 0 });
    }
  }

  buildLocation(loc) {
    const fc = FACTIONS[loc.faction].color;
    switch (loc.type) {
      case 'hub': this.buildHub(loc); break;
      case 'civilian': this.buildCivilian(loc); break;
      case 'research': loc.id === 'shackleton' ? this.buildArray(loc) : this.buildBioLab(loc); break;
      case 'industrial': this.buildMine(loc); break;
      case 'military': this.buildMilitary(loc); break;
      case 'pirate': this.buildGulch(loc); break;
    }
    this.sign(loc, loc.name.toUpperCase(), fc, loc.type === 'hub' ? 95 : 50);
  }

  buildHub(loc) {
    this.dome(loc, 0, 0, 58, 0x9be7ff, 0.35);
    // central spire
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
    // mission board kiosk
    const board = this.block(loc, 0, 76, 16, 9, 3, 0xffd23f, 0, 0xff3b5c);
    const bs = textSprite('JOB BOARD', { color: '#ffffff', size: 80, scale: 0.6 });
    bs.position.set(0, 14, 0);
    board.add(bs);
    // repair bay hangar
    const hangar = mesh(new THREE.CylinderGeometry(16, 16, 34, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xff9f1c), 0.25);
    this.put(hangar, loc, -80, -70, 0, 0.7);
    this.colliders.add({ type: 'box', x: loc.x - 80, y: loc.h + 7, z: loc.z - 70, hx: 17, hy: 8, hz: 16, yaw: 0.7 });
    const rs = textSprite('REPAIR BAY', { color: '#ff9f1c', size: 70, scale: 0.6 });
    rs.position.set(loc.x - 80, loc.h + 24, loc.z - 70);
    this.scene.add(rs);
    // pads + social area
    this.pad(loc, 95, -60, 16);
    this.pad(loc, -120, 40, 16, 0x2ec4ff);
    this.dome(loc, 70, 140, 16, 0xff7ad9);
    this.dome(loc, -60, 145, 14, 0xffd23f);
    this.solarField(loc, 150, 60, 4, 6, 0.4);
    this.tower(loc, 140, -120, 30, 1.5, 0xe0e0e0);
    const dish = makeDish(14);
    this.put(dish.root, loc, -150, -40);
    this.dishes.push({ ...dish, speed: 0.2 });
    this.colliders.add({ type: 'cyl', x: loc.x - 150, z: loc.z - 40, y0: loc.h - 2, y1: loc.h + 12, r: 2.5 });
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
    this.dome(loc, 0, 0, 22, 0xb8ffb0, 0.3); // garden dome
    for (const [dx, dz, r] of domes) {
      const k = 22 / Math.hypot(dx, dz);
      const k2 = 1 - r / Math.hypot(dx, dz);
      this.tube(loc, dx * k, dz * k, dx * k2, dz * k2, 1.6, 0xfff4e0);
    }
    // houses
    for (let i = 0; i < 5; i++) {
      const a = this.r() * Math.PI * 2, d = 90 + this.r() * 20;
      this.block(loc, Math.cos(a) * d, Math.sin(a) * d, 10, 6, 8, palette[(i + 2) % palette.length], a);
    }
    // playground: little ring of beacons
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.tower(loc, 60 + Math.cos(a) * 10, -70 + Math.sin(a) * 10, 3, 0.4, 0xfff4e0, palette[i]);
    }
    this.pad(loc, -70, 60, 13);
    this.addFigures(loc, 8, { kind: 'worker', look: (i) => ({ suit: palette[i % palette.length] }) });
    this.addFigures(loc, 7, { kind: 'kid', look: (i) => ({ suit: palette[(i + 3) % palette.length], scale: 0.55 }) });
  }

  buildArray(loc) {
    const pts = [[-60, -30, 26], [55, -40, 30], [0, 60, 34], [-80, 70, 18]];
    for (const [dx, dz, s] of pts) {
      const d = makeDish(s, 0xfff4e0);
      this.put(d.root, loc, dx, dz);
      this.dishes.push({ ...d, speed: 0.05 + this.r() * 0.1 });
      this.colliders.add({ type: 'cyl', x: loc.x + dx, z: loc.z + dz, y0: loc.h - 2, y1: loc.h + s * 0.95, r: s * 0.2 + 0.5 });
    }
    // observatory dome with slit
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
      // plants inside (visible through outline style as cones)
      for (let k = 0; k < 4; k++) {
        const c = mesh(new THREE.ConeGeometry(2, 7, 6), toon(0x1f8a3a), 0.05);
        c.position.set((this.r() - 0.5) * 18, 3.5, (this.r() - 0.5) * 18);
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
    this.colliders.add({ type: 'cyl', x: loc.x, z: loc.z, y0: loc.h - 2, y1: loc.h + 45, r: 6 });
    const arm = mesh(new THREE.BoxGeometry(60, 3, 3), toon(0xff9f1c), 0.12);
    arm.position.set(loc.x, loc.h + 40, loc.z);
    this.scene.add(arm);
    this.spinners.push({ obj: arm, axis: 'y', speed: 0.15 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const t = mesh(new THREE.CylinderGeometry(7, 7, 14, 14), toon(i % 2 ? 0x7dff6a : 0xc77dff), 0.15);
      this.put(t, loc, Math.cos(a) * 60, Math.sin(a) * 60, 7);
      this.colliders.add({ type: 'cyl', x: loc.x + Math.cos(a) * 60, z: loc.z + Math.sin(a) * 60, y0: loc.h - 2, y1: loc.h + 14, r: 7.2 });
    }
    this.block(loc, -40, 70, 24, 9, 12, 0x8a8aa0, 0.3);
    this.pad(loc, 70, 50, 12);
    this.addFigures(loc, 9, { kind: 'worker', look: () => ({ suit: 0xff9f1c, helmet: 0xffd23f }) });
  }

  buildMilitary(loc) {
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const wallR = 95;
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      if (i === 0) continue; // gate gap
      const a = (i / segs) * Math.PI * 2;
      const dx = Math.cos(a) * wallR, dz = Math.sin(a) * wallR;
      const len = (2 * Math.PI * wallR) / segs * 0.92;
      this.block(loc, dx, dz, len, 7, 3, 0x5b5870, -a + Math.PI / 2, fc);
    }
    this.block(loc, 0, 0, 30, 12, 30, 0x4a4660, 0.785, fc);
    this.block(loc, 40, -30, 26, 8, 14, 0x5b5870, 0.2, 0x2a2540);
    this.block(loc, -35, 35, 20, 10, 20, 0x5b5870, -0.4, 0x2a2540);
    this.tower(loc, -40, -40, 50, 2.2, 0x5b5870, 0xff2a4a);
    const dish = makeDish(12, 0xb0b0c0);
    this.put(dish.root, loc, 50, 40);
    this.dishes.push({ ...dish, speed: 0.6 });
    this.colliders.add({ type: 'cyl', x: loc.x + 50, z: loc.z + 40, y0: loc.h - 2, y1: loc.h + 11, r: 2.5 });
    this.flag(loc, 0, 70, loc.faction === 'accord' ? [0x2ec4ff, 0xffffff, 0x1b3a8f] : [0xff3b5c, 0xffd23f], 20);
    this.addFigures(loc, 8, { kind: 'soldier', look: () => ({ suit: 0x55607a, helmet: fc, visor: 0x111111 }) });

    // Restricted-zone boundary: striped energy wall
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
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(loc.zoneR, loc.zoneR, 120, 96, 1, true), mat);
    wall.position.set(loc.x, loc.h - 20, loc.z);
    this.scene.add(wall);
    this.zoneWalls.push({ loc, mat });
  }

  buildGulch(loc) {
    const rust = [0x8a4b2a, 0x6b5a3a, 0x9a9a9a, 0x5a3a5a];
    for (let i = 0; i < 14; i++) {
      const a = this.r() * Math.PI * 2, d = 20 + this.r() * 80;
      const w = 4 + this.r() * 10, h = 3 + this.r() * 8;
      this.block(loc, Math.cos(a) * d, Math.sin(a) * d, w, h, 4 + this.r() * 8, rust[i % 4], this.r() * 3, 0x2a2a2a);
    }
    // crashed freighter hull
    const hull = mesh(new THREE.CapsuleGeometry(9, 40, 6, 12).rotateZ(Math.PI / 2 - 0.2), toon(0x6b6880), 0.3);
    this.put(hull, loc, 0, -40, 6, 0.5);
    this.colliders.add({ type: 'box', x: loc.x, y: loc.h + 6, z: loc.z - 40, hx: 28, hy: 9, hz: 9, yaw: 0.5 });
    this.flag(loc, 20, 20, [0x111111, 0x111111], 18);
    this.tower(loc, -30, 30, 18, 1.2, 0x3a3a3a, 0xff9f1c);
    this.addFigures(loc, 6, { kind: 'worker', look: () => ({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a }) });
  }

  buildBoulders() {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const count = 700;
    const im = new THREE.InstancedMesh(geo, toon(0x8d8898), count);
    const hullIm = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const rr = mulberry32(99);
    let k = 0;
    while (k < count) {
      const x = (rr() * 2 - 1) * 1750, z = (rr() * 2 - 1) * 1750;
      if (Math.hypot(x, z) > 1750) continue;
      let ok = true;
      for (const l of this.locations) if (Math.hypot(x - l.x, z - l.z) < l.r * 1.4) { ok = false; break; }
      if (!ok) continue;
      const s = 1.2 + Math.pow(rr(), 3) * 7;
      const y = this.terrain.height(x, z) + s * 0.3;
      e.set(rr() * 3, rr() * 3, rr() * 3);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 0.8, s));
      im.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s + 0.15, s * 0.8 + 0.15, s + 0.15));
      hullIm.setMatrixAt(k, m4);
      this.colliders.add({ type: 'sphere', x, y: y - s * 0.1, z, r: s * 0.85 });
      k++;
    }
    im.castShadow = true;
    im.receiveShadow = true;
    this.scene.add(im, hullIm);
  }

  // Civilian shuttles flying between settlements, plus ground crawlers.
  buildTraffic() {
    const L = Object.fromEntries(this.locations.map((l) => [l.id, l]));
    const routes = [
      ['ilmb', 'tranq', 0x2ec4ff], ['ilmb', 'aldrin', 0xff9f1c], ['ilmb', 'shackleton', 0x7dff6a],
      ['tranq', 'kepler', 0xff7ad9], ['ilmb', 'mine', 0xffd23f], ['aldrin', 'shackleton', 0xc77dff],
    ];
    for (const [a, b, stripe] of routes) {
      const A = L[a], B = L[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const steps = Math.ceil(len / 20);
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
        let h = -1e9;
        for (let k = -3; k <= 3; k++) {
          const tt = Math.min(1, Math.max(0, t + (k * 20) / len));
          h = Math.max(h, this.terrain.height(A.x + (B.x - A.x) * tt, A.z + (B.z - A.z) * tt));
        }
        const end = Math.min(t, 1 - t) * len;
        const cruise = h + 22;
        pts.push(new THREE.Vector3(x, Math.max(h + 8, cruise - Math.max(0, 60 - end) * 0.25), z));
      }
      const s = makeShuttle({ stripe });
      this.scene.add(s.root);
      this.shuttles.push({ ...s, pts, t: this.r(), dir: 1, speed: 28 / len, wait: 0, len, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    // ground crawlers between hub and mine / tranq
    for (const [a, b] of [['ilmb', 'mine'], ['ilmb', 'tranq'], ['aldrin', 'shackleton']]) {
      const r = makeRover({ color: 0xffd23f, trim: 0xfff4e0, pirate: false, flag: 0x2ec4ff });
      r.root.scale.setScalar(1.3);
      this.scene.add(r.root);
      this.crawlers.push({ ...r, A: L[a], B: L[b], t: this.r(), dir: 1, speed: 12 / Math.hypot(L[b].x - L[a].x, L[b].z - L[a].z), pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
  }

  update(dt, time, camPos) {
    this.sky.position.copy(camPos);
    this.earth.rotation.y += dt * 0.01;
    for (const s of this.spinners) s.obj.rotation[s.axis] += s.speed * dt;
    for (const d of this.dishes) {
      d.yaw.rotation.y += d.speed * dt;
      d.tilt.rotation.x = -0.6 + Math.sin(time * d.speed * 2) * 0.25;
    }
    for (const b of this.blinkers) {
      const on = Math.sin(time * 3 + b.phase) > 0.2;
      b.mat.color.copy(b.base).multiplyScalar(on ? 1 : 0.25);
    }
    for (const z of this.zoneWalls) z.mat.uniforms.time.value = time;

    // shuttles
    const tmp = new THREE.Vector3();
    for (const s of this.shuttles) {
      if (s.wait > 0) { s.wait -= dt; s.vel.set(0, 0, 0); continue; }
      s.t += s.speed * s.dir * dt;
      if (s.t >= 1 || s.t <= 0) { s.t = Math.min(1, Math.max(0, s.t)); s.dir *= -1; s.wait = 5; }
      const f = s.t * (s.pts.length - 1);
      const i = Math.min(s.pts.length - 2, Math.floor(f));
      tmp.copy(s.pts[i]).lerp(s.pts[i + 1], f - i);
      s.vel.copy(tmp).sub(s.pos).divideScalar(Math.max(dt, 1e-3));
      s.pos.copy(tmp);
      s.root.position.copy(tmp);
      const nxt = s.pts[Math.min(s.pts.length - 1, Math.max(0, i + (s.dir > 0 ? 1 : 0)))];
      const prv = s.pts[Math.min(s.pts.length - 1, Math.max(0, i + (s.dir > 0 ? 0 : 1)))];
      s.root.rotation.y = Math.atan2(nxt.x - prv.x, nxt.z - prv.z);
      s.root.position.y += Math.sin(time * 2 + s.len) * 0.4;
    }
    for (const c of this.crawlers) {
      c.t += c.speed * c.dir * dt;
      if (c.t >= 1 || c.t <= 0) { c.t = Math.min(1, Math.max(0, c.t)); c.dir *= -1; }
      // offset lane so they don't drive through the settlements' centres
      const t = 0.12 + c.t * 0.76;
      const x = c.A.x + (c.B.x - c.A.x) * t + 18 * c.dir, z = c.A.z + (c.B.z - c.A.z) * t;
      tmp.set(x, this.terrain.height(x, z), z);
      c.vel.copy(tmp).sub(c.pos).divideScalar(Math.max(dt, 1e-3));
      c.pos.copy(tmp);
      c.root.position.copy(tmp);
      c.root.rotation.y = Math.atan2((c.B.x - c.A.x) * c.dir, (c.B.z - c.A.z) * c.dir);
      for (const w of c.wheels) w.rotation.x += dt * 8;
    }

    // ambient figures
    for (const f of this.figures) {
      const p = f.root.position;
      const dist = p.distanceTo(camPos);
      f.root.visible = dist < 500;
      if (!f.root.visible) continue;
      if (f.kind === 'kid') {
        // low-gravity hopping
        f.hop -= dt;
        if (f.vy === 0 && f.hop <= 0) { f.vy = 3 + Math.random() * 3; f.hop = 0.5 + Math.random(); }
        if (f.vy !== 0 || p.y > f.loc.h) {
          f.vy -= 1.62 * 2 * dt;
          p.y += f.vy * dt;
          if (p.y <= f.loc.h) { p.y = f.loc.h; f.vy = 0; }
        }
      }
      if (f.wait > 0) { f.wait -= dt; continue; }
      tmp.copy(f.target).sub(p);
      tmp.y = 0;
      const d = tmp.length();
      if (d < 1) {
        const a = Math.random() * Math.PI * 2, rr = (0.25 + Math.random() * 0.6) * f.loc.r;
        f.target.set(f.loc.x + Math.cos(a) * rr, f.loc.h, f.loc.z + Math.sin(a) * rr);
        f.wait = f.kind === 'soldier' ? 0.5 : 1 + Math.random() * 4;
        continue;
      }
      const sp = f.kind === 'kid' ? 2.5 : f.kind === 'soldier' ? 2.2 : 1.4;
      tmp.multiplyScalar(Math.min(d, sp * dt) / d);
      p.x += tmp.x; p.z += tmp.z;
      f.root.rotation.y = Math.atan2(tmp.x, tmp.z);
      f.phase += dt * 6;
      f.legL.rotation.x = Math.sin(f.phase) * 0.6;
      f.legR.rotation.x = -Math.sin(f.phase) * 0.6;
      if (f.kind !== 'kid') p.y = f.loc.h + Math.abs(Math.sin(f.phase)) * 0.15;
    }
  }
}
