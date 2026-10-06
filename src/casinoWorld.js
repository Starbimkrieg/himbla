import * as THREE from 'three';
import { toon, ink, glow, textSprite } from './toon.js';
import { makeFigure } from './models.js';

// The Lucky Crater Casino: a neon box in the sun with a spinning sign, a giant tumbling
// die, a roulette wheel the size of a house and a carpet lined with slot machines.

function mesh(geo, mat, outline = 0.12) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = (px) => `${px}px Bangers, Impact, sans-serif`;

function signTex() {
  return canvasTex(1024, 224, (x, w, h) => {
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5a1a8f'; x.fillRect(10, 10, w - 20, h - 20);
    // marquee bulbs around the edge
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const p = t < 0.5 ? [30 + t * 2 * (w - 60), 26] : [30 + (t - 0.5) * 2 * (w - 60), h - 26];
      x.fillStyle = i % 2 ? '#fff6a8' : '#ff2e88';
      x.beginPath(); x.arc(p[0], p[1], 9, 0, Math.PI * 2); x.fill();
    }
    x.font = FONT(118);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 16; x.strokeStyle = '#120a1e'; x.lineJoin = 'round';
    x.strokeText('LUCKY CRATER CASINO', w / 2, h / 2 + 6);
    const g = x.createLinearGradient(0, 60, 0, 170);
    g.addColorStop(0, '#fff6a8'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff9f1c');
    x.fillStyle = g;
    x.fillText('LUCKY CRATER CASINO', w / 2, h / 2 + 6);
  });
}

function pipTex(n) {
  return canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#fff4e0'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#120a1e'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, w - 8);
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n];
    x.fillStyle = n === 1 ? '#ff2a4a' : '#120a1e';
    for (const [a, b] of P) { x.beginPath(); x.arc(a * 32, b * 32, n === 1 ? 18 : 12, 0, Math.PI * 2); x.fill(); }
  });
}

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function wheelTex() {
  return canvasTex(512, 512, (x, w) => {
    const c = w / 2, n = WHEEL.length;
    x.fillStyle = '#120a1e'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const v = WHEEL[i];
      x.fillStyle = v === 0 ? '#1f8a4a' : REDS.has(v) ? '#d7263d' : '#1a1426';
      x.beginPath(); x.moveTo(c, c); x.arc(c, c, c - 10, a0, a1); x.closePath(); x.fill();
      x.save();
      x.translate(c, c); x.rotate((a0 + a1) / 2 + Math.PI / 2);
      x.fillStyle = '#fff4e0'; x.font = FONT(30); x.textAlign = 'center';
      x.fillText(String(v), 0, -c + 44);
      x.restore();
    }
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(c, c, c * 0.52, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5a1a8f'; x.beginPath(); x.arc(c, c, c * 0.44, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffd23f'; x.lineWidth = 14;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(i * Math.PI / 2) * c * 0.44, c + Math.sin(i * Math.PI / 2) * c * 0.44); x.stroke(); }
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(c, c, 26, 0, Math.PI * 2); x.fill();
  });
}

function screenTex(text, bg) {
  return canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.fillStyle = bg; x.fillRect(8, 8, w - 16, h - 16);
    x.font = FONT(84); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.strokeText(text, w / 2, h / 2 + 4);
    x.fillStyle = '#ffd23f'; x.fillText(text, w / 2, h / 2 + 4);
  });
}

export function buildCasino(w, loc) {
  const W = 20, D = 12, H = 14;
  const put = (o, x, z, y = 0, yaw = 0, dyn = false) => w.put(o, loc, x, z, y, yaw, dyn);

  // main hall + stepped crown
  put(mesh(new THREE.BoxGeometry(W * 2, H, D * 2), toon(0x2a1450), 0.2), 0, 0, H / 2);
  w.col(loc, { type: 'box', x: 0, y: H / 2, z: 0, hx: W, hy: H / 2, hz: D });
  put(mesh(new THREE.BoxGeometry(W * 2 + 1.5, 1, D * 2 + 1.5), toon(0xffd23f), 0.1), 0, 0, H + 0.5);
  put(mesh(new THREE.BoxGeometry(26, 4, 16), toon(0x5a1a8f), 0.15), 0, -2, H + 3);
  put(mesh(new THREE.SphereGeometry(6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xffd23f), 0.15), 0, -2, H + 5);
  w.col(loc, { type: 'box', x: 0, y: H + 3, z: -2, hx: 13, hy: 3, hz: 8 });
  // neon trim: pink roofline, cyan corners, gold belt
  const neon = (geo, color, x, z, y) => put(new THREE.Mesh(geo, glow(color)), x, z, y);
  neon(new THREE.BoxGeometry(W * 2 + 0.4, 0.5, 0.5), 0xff2e88, 0, D + 0.2, H - 0.4);
  neon(new THREE.BoxGeometry(W * 2 + 0.4, 0.4, 0.4), 0xffd23f, 0, D + 0.2, H * 0.62);
  for (const sx of [-1, 1]) {
    neon(new THREE.BoxGeometry(0.5, H, 0.5), 0x2ee6ff, sx * (W + 0.2), D + 0.2, H / 2);
    neon(new THREE.BoxGeometry(0.5, H, 0.5), 0x2ee6ff, sx * (W + 0.2), -D - 0.2, H / 2);
    neon(new THREE.BoxGeometry(0.5, 0.5, D * 2 + 0.4), 0xff2e88, sx * (W + 0.2), 0, H - 0.4);
  }
  // card suits on the facade
  const suits = ['♠', '♥', '♦', '♣'];
  suits.forEach((s, i) => {
    const t = canvasTex(128, 128, (x) => {
      x.font = '110px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.strokeText(s, 64, 70);
      x.fillStyle = i % 3 ? '#ff2a4a' : '#fff4e0'; x.fillText(s, 64, 70);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    put(p, [-15, -10, 10, 15][i], D + 0.3, H * 0.8);
  });
  // golden doors under a marquee canopy
  const door = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), glow(0xffd23f));
  put(door, 0, D + 0.05, 3);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 0.1), glow(0x120a1e)), 0, D + 0.1, 3);
  put(mesh(new THREE.BoxGeometry(14, 0.8, 7), toon(0xff2e88), 0.1), 0, D + 3.5, 8);
  for (const sx of [-1, 1]) put(mesh(new THREE.CylinderGeometry(0.3, 0.3, 8, 8), toon(0xffd23f), 0.06), sx * 6.5, D + 6.6, 4);
  const bulbMats = [glow(0xfff6a8), glow(0xfff6a8), glow(0xfff6a8)];
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  let k = 0;
  const bulb = (x, z, y) => put(new THREE.Mesh(bulbGeo, bulbMats[k++ % 3]), x, z, y);
  for (let i = 0; i <= 18; i++) bulb(-7 + i * (14 / 18), D + 7.05, 7.6);
  for (const sx of [-1, 1]) for (let i = 1; i <= 8; i++) bulb(sx * 7.05, D + 7 - i * (7 / 8), 7.6);
  for (let i = 0; i <= 40; i++) bulb(-W + i * (W * 2 / 40), D + 0.5, H + 1.1);
  // red carpet + velvet ropes
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6, 34), toon(0xd7263d));
  carpet.rotation.x = -Math.PI / 2;
  put(carpet, 0, D + 17, 0.08);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) put(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6), toon(0xffd23f), 0.04), sx * 3.6, D + 3 + i * 5.5, 0.7);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 27.5, 5).rotateX(Math.PI / 2), toon(0x8a1030)), sx * 3.6, D + 3 + 13.75, 1.1);
  }

  // the giant rotating sign
  put(mesh(new THREE.CylinderGeometry(0.6, 0.8, 10, 8), toon(0x3a3550), 0.08), 0, -2, H + 10);
  const st = signTex();
  const signMat = new THREE.MeshBasicMaterial({ map: st });
  const edge = toon(0xffd23f);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(32, 7, 1.2), [edge, edge, edge, edge, signMat, signMat]);
  ink(sign, 0.25);
  put(sign, 0, -2, H + 17.5, 0, true);

  // a huge tumbling die on a pedestal
  put(mesh(new THREE.CylinderGeometry(4, 4.8, 3, 16), toon(0xff2e88), 0.12), -34, 18, 1.5);
  w.col(loc, { type: 'cyl', x: -34, z: 18, y0: -2, y1: 3, r: 4.8 });
  const dieMats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshToonMaterial({ map: pipTex(n), gradientMap: toon(0).gradientMap }));
  const die = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), dieMats);
  ink(die, 0.2);
  put(die, -34, 18, 10, 0, true);
  w.col(loc, { type: 'sphere', x: -34, y: 10, z: 18, r: 5 });

  // the upright roulette wheel
  for (const sx of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(1.2, 13, 1.2), toon(0xffd23f), 0.08);
    leg.rotation.z = sx * 0.28;
    put(leg, 34 + sx * 3, 16, 6);
  }
  w.col(loc, { type: 'box', x: 34, y: 5, z: 16, hx: 5, hy: 5, hz: 1 });
  const wt = wheelTex();
  const face = new THREE.MeshBasicMaterial({ map: wt });
  const wheel = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.4, 48), [toon(0x5a1a8f), face, face]);
  disc.rotation.x = Math.PI / 2;
  ink(disc, 0.2);
  wheel.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.45, 8, 48), toon(0xffd23f));
  wheel.add(rim);
  put(wheel, 34, 16, 12.5, 0, true);
  const pointer = mesh(new THREE.ConeGeometry(1, 2.4, 4), toon(0xfff4e0), 0.08);
  pointer.rotation.x = Math.PI;
  put(pointer, 34, 16.9, 22.6);
  w.col(loc, { type: 'box', x: 34, y: 12.5, z: 16, hx: 9.5, hy: 9.5, hz: 1 });

  // slot machines lining the carpet, with gamblers glued to them
  const cols = [0xff2e88, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff, 0xffd23f];
  const faces = ['777', 'BAR', '$$$', 'JKP', '7♦7', 'WIN'];
  let n = 0;
  for (const sx of [-1, 1]) for (const z of [D + 9, D + 17, D + 25]) {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(3, 4.4, 2.2), toon(cols[n % cols.length]), 0.08);
    body.position.y = 2.2;
    const top = mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xffd23f), 0.06);
    top.position.y = 4.4;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), new THREE.MeshBasicMaterial({ map: screenTex(faces[n % faces.length], '#5a1a8f') }));
    scr.position.set(0, 3.1, 1.11);
    const tray = mesh(new THREE.BoxGeometry(2.4, 0.4, 0.6), toon(0x3a3550), 0.04);
    tray.position.set(0, 1.4, 1.3);
    const arm = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 6), toon(0xc9c3d9), 0.03);
    arm.position.set(1.7, 3.4, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), glow(0xff2a4a));
    knob.position.set(1.7, 4.45, 0);
    g.add(body, top, scr, tray, arm, knob);
    const x = sx * 9, yaw = -sx * Math.PI / 2;
    put(g, x, z, 0, yaw);
    w.col(loc, { type: 'box', x, y: 2.5, z, hx: 1.2, hy: 2.5, hz: 1.6 });
    if (n % 2 === 0 || n === 3) {
      const f = makeFigure({ suit: [0x16121f, 0xffc83a, 0xff7ad9, 0x2ee6ff][n % 4], helmet: 0xfff4e0, visor: 0xff2e88 });
      put(f.root, x - sx * 2.4, z, 0, yaw + Math.PI);
    }
    n++;
  }
  // bouncer in a tux by the door
  const bouncer = makeFigure({ suit: 0x16121f, helmet: 0x16121f, visor: 0xffd23f, scale: 1.35 });
  put(bouncer.root, 4.8, D + 2.5, 0, 0);

  // chip stacks out front
  const chipCols = [0xff2a4a, 0x2ee6ff, 0x111111, 0x7dff6a, 0xffd23f];
  [[-16, D + 12], [16, D + 12], [-22, D + 24], [22, D + 26]].forEach(([x, z], i) => {
    const hgt = 4 + (i % 2) * 3;
    for (let s = 0; s < hgt; s++) {
      const c = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 16), toon(chipCols[(s + i) % chipCols.length]), 0.05);
      c.rotation.y = s;
      put(c, x + Math.sin(s * 1.7) * 0.15, z, 0.3 + s * 0.62);
    }
    w.col(loc, { type: 'cyl', x, z, y0: -2, y1: hgt * 0.62, r: 1.7 });
  });

  // sweeping searchlights
  const beamGeo = new THREE.ConeGeometry(7, 80, 16, 1, true).rotateX(Math.PI).translate(0, 40, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6a8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.rotation.z = 0.4;
    pivot.add(b);
    put(pivot, sx * 17, -8, H + 1, sx, true);
    put(mesh(new THREE.CylinderGeometry(1, 1.3, 1.2, 10), toon(0x3a3550), 0.06), sx * 17, -8, H + 1);
    beams.push(pivot);
  }

  const small = textSprite('THE HOUSE ALWAYS WINS. USUALLY.', { color: '#ff7ad9', size: 50, scale: 0.2, bg: '#120a1e' });
  small.position.set(0, 9.6, D + 7.5);
  loc.group.add(small);
  const open = textSprite('OPEN 25/8 · F TO ENTER', { color: '#7dff6a', size: 50, scale: 0.3, bg: '#120a1e' });
  open.position.set(0, 12.3, D + 7.5);
  loc.group.add(open);

  w.addFigures(loc, 6, { kind: 'worker', look: (i) => ({ suit: [0x16121f, 0xffc83a, 0xff2e88][i % 3], helmet: 0xfff4e0, visor: 0xffd23f }) });
  loc.group.updateMatrixWorld(true);

  let chase = 0;
  return {
    loc,
    entrance: w.toWorld(loc, 0, 1, D + 3),
    near(p) { return p.distanceTo(this.entrance) < 10; },
    update(dt, time) {
      sign.rotation.y += dt * 0.45;
      die.rotation.x += dt * 0.7; die.rotation.y += dt * 1.1;
      die.position.y = 10 + Math.sin(time * 1.6) * 0.8;
      wheel.rotation.z -= dt * 1.4;
      beams[0].rotation.y = 1 + Math.sin(time * 0.5) * 1.3;
      beams[1].rotation.y = -1 + Math.sin(time * 0.5 + 2) * 1.3;
      chase += dt;
      const step = Math.floor(chase * 7) % 3;
      bulbMats.forEach((m, i) => m.color.setHex(i === step ? 0xfff6a8 : 0x8a5a2a));
    },
  };
}
