import * as THREE from 'three';
import { toon, ink, glow, textSprite } from './toon.js';
import { makeFigure } from './models.js';
import { pixelFont } from './fonts.js';
import { PEGS, SEGS, SLOTS, MULTS, SPACING, DROP_Y, DIVIDER_TOP, slotEdge, slotCentre } from './plinko.js';

// The Lucky Crater Casino: a neon box in the sun with a spinning sign, a giant tumbling die, a
// roulette wheel the size of a house and a carpet lined with slot machines. Walk in through the
// open doors for the big three: a BLACKJACK table, the DUCK DERBY track and a giant PLINKO board,
// plus the CLASSIC GAMES cabinets (the old overlay casino) and the prize counter / loan shark.
// Game logic lives in casinoGames.js; this file only builds the place and hands back the props.

function mesh(geo, mat, outline = 0.12) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// canvas text uses the game's pixel display face (Press Start 2P is wide: scale sizes ~0.6x)
export const FONT = (px) => pixelFont(px * 0.6);

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
    fitText(x, 'LUCKY CRATER CASINO', w - 80, 118);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 16; x.strokeStyle = '#120a1e'; x.lineJoin = 'round';
    x.strokeText('LUCKY CRATER CASINO', w / 2, h / 2 + 6);
    const g = x.createLinearGradient(0, 60, 0, 170);
    g.addColorStop(0, '#fff6a8'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff9f1c');
    x.fillStyle = g;
    x.fillText('LUCKY CRATER CASINO', w / 2, h / 2 + 6);
  });
}

// shrink the font until the text fits
export function fitText(x, text, maxW, px) {
  let s = px;
  x.font = FONT(s);
  while (s > 10 && x.measureText(text).width > maxW) { s -= 4; x.font = FONT(s); }
  return s;
}

// A neon sign board: dark panel, glowing border, big text.
export function neonTex(text, { w = 1024, h = 256, color = '#ffd23f', edge = '#ff2e88', bg = '#120a1e', sub = null } = {}) {
  return canvasTex(w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = edge; x.lineWidth = 14; x.strokeRect(12, 12, w - 24, h - 24);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    fitText(x, text, w - 80, sub ? h * 0.5 : h * 0.62);
    x.shadowColor = color; x.shadowBlur = 24;
    x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.lineJoin = 'round';
    const y = sub ? h * 0.4 : h / 2 + 4;
    x.strokeText(text, w / 2, y);
    x.fillStyle = color; x.fillText(text, w / 2, y);
    if (sub) {
      x.shadowBlur = 0;
      fitText(x, sub, w - 80, h * 0.2);
      x.fillStyle = '#fff4e0'; x.fillText(sub, w / 2, h * 0.76);
    }
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
    fitText(x, text, w - 30, 84);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.strokeText(text, w / 2, h / 2 + 4);
    x.fillStyle = '#ffd23f'; x.fillText(text, w / 2, h / 2 + 4);
  });
}

function carpetTex() {
  const t = canvasTex(256, 256, (x, w) => {
    x.fillStyle = '#3b0f4f'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#ffd23f'; x.lineWidth = 6;
    for (const [cx, cy] of [[0, 0], [w, 0], [0, w], [w, w], [w / 2, w / 2]]) {
      x.beginPath(); x.moveTo(cx, cy - 60); x.lineTo(cx + 60, cy); x.lineTo(cx, cy + 60); x.lineTo(cx - 60, cy); x.closePath(); x.stroke();
    }
    x.fillStyle = '#ff2e88';
    for (const [cx, cy] of [[w / 2, 0], [0, w / 2], [w, w / 2], [w / 2, w]]) { x.beginPath(); x.arc(cx, cy, 14, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#2ee6ff';
    x.beginPath(); x.arc(w / 2, w / 2, 9, 0, Math.PI * 2); x.fill();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 9);
  return t;
}

function feltTex(R) {
  return canvasTex(1024, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    // half-disc: flat edge along the top (dealer side), bulging toward the player
    x.fillStyle = '#16703d';
    x.beginPath(); x.moveTo(0, 0); x.arc(w / 2, 0, w / 2, 0, Math.PI); x.closePath(); x.fill();
    const g = x.createRadialGradient(w / 2, 0, 40, w / 2, 0, w / 2);
    g.addColorStop(0, 'rgba(125,255,106,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    x.fillStyle = g; x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = '#ffd23f'; x.lineWidth = 6;
    x.beginPath(); x.arc(w / 2, 0, w * 0.36, 0.12 * Math.PI, 0.88 * Math.PI); x.stroke();
    x.save();
    x.fillStyle = '#ffd23f'; x.font = FONT(30);
    const msg = 'BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17';
    // text along the arc
    const r = w * 0.39;
    const total = x.measureText(msg).width;
    let a = Math.PI / 2 + (total / r) / 2;
    for (const ch of msg) {
      const cw = x.measureText(ch).width;
      a -= cw / 2 / r;
      x.save(); x.translate(w / 2 + Math.cos(a) * r, Math.sin(a) * r); x.rotate(a - Math.PI / 2); x.fillText(ch, 0, 0); x.restore();
      a -= cw / 2 / r;
    }
    x.restore();
    // betting circle (player's spot) and the card box
    const bx = w / 2, by = h * 0.8;
    x.strokeStyle = '#fff4e0'; x.lineWidth = 6;
    x.beginPath(); x.arc(bx, by, 44, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff4e0'; x.font = FONT(26); x.fillText('BET', bx, by);
    x.strokeStyle = 'rgba(255,244,224,0.5)'; x.lineWidth = 4;
    x.strokeRect(w / 2 - 170, h * 0.38, 340, 120);
    x.strokeRect(w / 2 - 150, h * 0.06, 300, 110);
    x.fillStyle = 'rgba(255,244,224,0.55)'; x.font = FONT(24);
    x.fillText('INSURANCE IS FOR COWARDS', w / 2, h * 0.58);
  });
}

function checkerTex() {
  return canvasTex(256, 64, (x, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#120a1e' : '#fff4e0'; x.fillRect(i * 16, j * 16, 16, 16); }
    void w; void h;
  });
}

function waterTex() {
  const t = canvasTex(128, 64, (x, w, h) => {
    x.fillStyle = '#1aa9d6'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#7fe8ff'; x.lineWidth = 5;
    for (let k = 0; k < 2; k++) {
      x.beginPath();
      for (let i = 0; i <= w; i += 4) x.lineTo(i, h * (0.3 + k * 0.45) + Math.sin((i / w) * Math.PI * 4) * 5);
      x.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  return t;
}

// A slot-machine cabinet (outside along the carpet, and the Classic Games corner inside).
function slotCabinet(color, face) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(3, 4.4, 2.2), toon(color), 0.08);
  body.position.y = 2.2;
  const top = mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xffd23f), 0.06);
  top.position.y = 4.4;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), new THREE.MeshBasicMaterial({ map: screenTex(face, '#5a1a8f') }));
  scr.position.set(0, 3.1, 1.11);
  const tray = mesh(new THREE.BoxGeometry(2.4, 0.4, 0.6), toon(0x3a3550), 0.04);
  tray.position.set(0, 1.4, 1.3);
  const arm = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 6), toon(0xc9c3d9), 0.03);
  arm.position.set(1.7, 3.4, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), glow(0xff2a4a));
  knob.position.set(1.7, 4.45, 0);
  g.add(body, top, scr, tray, arm, knob);
  return g;
}

// A rubber duck, ~1.3 m long, facing +x.
export function makeDuck(color, bill = 0xff9f1c) {
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const mat = toon(color);
  const body = mesh(new THREE.SphereGeometry(0.55, 16, 12), mat, 0.05);
  body.scale.set(1.25, 0.8, 0.95);
  body.position.y = 0.35;
  const tail = mesh(new THREE.ConeGeometry(0.25, 0.5, 8), mat, 0.04);
  tail.rotation.z = Math.PI / 2 + 0.7;
  tail.position.set(-0.68, 0.62, 0);
  const head = mesh(new THREE.SphereGeometry(0.36, 14, 12), mat, 0.05);
  head.position.set(0.42, 1.0, 0);
  const beak = mesh(new THREE.ConeGeometry(0.15, 0.4, 8), toon(bill), 0.03);
  beak.rotation.z = -Math.PI / 2;
  beak.scale.set(1, 1, 0.55);
  beak.position.set(0.86, 0.94, 0);
  bob.add(body, tail, head, beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0x120a1e));
    eye.position.set(0.66, 1.1, s * 0.18);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), glow(0xffffff));
    shine.position.set(0.73, 1.14, s * 0.2);
    bob.add(eye, shine);
  }
  const wingMat = toon(new THREE.Color(color).multiplyScalar(0.85).getHex());
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = mesh(new THREE.SphereGeometry(0.3, 10, 8), wingMat, 0.03);
    wing.scale.set(1.3, 0.5, 0.35);
    wing.position.set(-0.05, 0.5, s * 0.5);
    bob.add(wing);
    wings.push(wing);
  }
  return { root, bob, head, wings };
}

// ---- layout (casino local frame; the facade faces +z) ----
export const HALL = { W: 26, FRONT: 12, BACK: -34, H: 16, DOOR: 5, DOOR_H: 9 };
export const BJ = { x: -14, z: -8, R: 3.4, top: 1.16 };
export const DUCK = { x0: -22, x1: 2, lanes: [-21.5, -23.1, -24.7, -26.3], water: 0.86, kiosk: [-10, -17.4] };
export const PLK = { x: 14, y: 1.2, z: -31 };
export const CLASSIC = { x: 22.4, zs: [-1.5, 2.5, 6.5] };
export const PRIZE = { x: 22, z: -13 };

export function buildCasino(w, loc) {
  const { W, FRONT: D, BACK, H, DOOR, DOOR_H } = HALL;
  const CZ = (D + BACK) / 2, DEP = D - BACK;
  const put = (o, x, z, y = 0, yaw = 0, dyn = false) => w.put(o, loc, x, z, y, yaw, dyn);
  const col = (spec) => w.col(loc, spec);

  // ---------- the hall: four walls with a wide door gap, a roof, a stepped crown ----------
  const wallM = toon(0x2a1450);
  const wall = (x, z, sx, sz, y0 = 0, y1 = H) => {
    const m = mesh(new THREE.BoxGeometry(sx, y1 - y0, sz), wallM, 0.15);
    put(m, x, z, (y0 + y1) / 2);
    col({ type: 'box', x, y: (y0 + y1) / 2, z, hx: sx / 2, hy: (y1 - y0) / 2, hz: sz / 2 });
  };
  wall(0, BACK, W * 2 + 2, 2);
  wall(-W, CZ, 2, DEP);
  wall(W, CZ, 2, DEP);
  wall(-(W + DOOR) / 2, D, W - DOOR, 2);
  wall((W + DOOR) / 2, D, W - DOOR, 2);
  wall(0, D, DOOR * 2, 2, DOOR_H, H);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 2, 1, DEP + 2), wallM);
  roof.receiveShadow = true; // no shadow cast: the hall stays bright inside (comic licence)
  ink(roof, 0.15);
  put(roof, 0, CZ, H + 0.5);
  col({ type: 'box', x: 0, y: H + 0.5, z: CZ, hx: W + 1, hy: 0.5, hz: DEP / 2 + 1 });
  put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 3.5, 1, DEP + 3.5), toon(0xffd23f)), 0, CZ, H + 1.4);
  put(mesh(new THREE.BoxGeometry(30, 4, 22), toon(0x5a1a8f), 0.15), 0, CZ, H + 4);
  put(mesh(new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xffd23f), 0.15), 0, CZ, H + 6);
  col({ type: 'box', x: 0, y: H + 4, z: CZ, hx: 15, hy: 3, hz: 11 });
  // neon trim: pink roofline, cyan corners, gold belt
  const neon = (geo, color, x, z, y) => put(new THREE.Mesh(geo, glow(color)), x, z, y);
  neon(new THREE.BoxGeometry(W * 2 + 2.4, 0.5, 0.5), 0xff2e88, 0, D + 1.2, H - 0.4);
  neon(new THREE.BoxGeometry(W - DOOR + 0.4, 0.4, 0.4), 0xffd23f, -(W + DOOR) / 2, D + 1.2, H * 0.62);
  neon(new THREE.BoxGeometry(W - DOOR + 0.4, 0.4, 0.4), 0xffd23f, (W + DOOR) / 2, D + 1.2, H * 0.62);
  for (const sx of [-1, 1]) {
    neon(new THREE.BoxGeometry(0.5, H, 0.5), 0x2ee6ff, sx * (W + 1.2), D + 1.2, H / 2);
    neon(new THREE.BoxGeometry(0.5, H, 0.5), 0x2ee6ff, sx * (W + 1.2), BACK - 1.2, H / 2);
    neon(new THREE.BoxGeometry(0.5, 0.5, DEP + 2.4), 0xff2e88, sx * (W + 1.2), CZ, H - 0.4);
    // glowing door frame
    neon(new THREE.BoxGeometry(0.6, DOOR_H, 0.6), 0xffd23f, sx * DOOR, D + 1.1, DOOR_H / 2);
  }
  neon(new THREE.BoxGeometry(DOOR * 2 + 0.6, 0.6, 0.6), 0xffd23f, 0, D + 1.1, DOOR_H);
  // card suits on the facade
  const suits = ['♠', '♥', '♦', '♣'];
  suits.forEach((s, i) => {
    const t = canvasTex(128, 128, (x) => {
      x.font = '110px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.strokeText(s, 64, 70);
      x.fillStyle = i % 3 ? '#ff2a4a' : '#fff4e0'; x.fillText(s, 64, 70);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    put(p, [-19, -11, 11, 19][i], D + 1.05, H * 0.8);
  });
  // marquee canopy over the open doors
  put(mesh(new THREE.BoxGeometry(14, 0.8, 7), toon(0xff2e88), 0.1), 0, D + 4.5, 9.6);
  for (const sx of [-1, 1]) put(mesh(new THREE.CylinderGeometry(0.3, 0.3, 9.6, 8), toon(0xffd23f), 0.06), sx * 6.5, D + 7.6, 4.8);
  const bulbMats = [glow(0xfff6a8), glow(0xfff6a8), glow(0xfff6a8)];
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  let k = 0;
  const bulb = (x, z, y) => put(new THREE.Mesh(bulbGeo, bulbMats[k++ % 3]), x, z, y);
  for (let i = 0; i <= 18; i++) bulb(-7 + i * (14 / 18), D + 8.05, 9.2);
  for (const sx of [-1, 1]) for (let i = 1; i <= 8; i++) bulb(sx * 7.05, D + 8 - i * (7 / 8), 9.2);
  for (let i = 0; i <= 40; i++) bulb(-W + i * (W * 2 / 40), D + 1.5, H + 2.1);
  // red carpet + velvet ropes outside, and on inside up to the games
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6, 34), toon(0xd7263d));
  carpet.rotation.x = -Math.PI / 2;
  put(carpet, 0, D + 18, 0.08);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) put(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6), toon(0xffd23f), 0.04), sx * 3.6, D + 4 + i * 5.5, 0.7);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 27.5, 5).rotateX(Math.PI / 2), toon(0x8a1030)), sx * 3.6, D + 4 + 13.75, 1.1);
  }

  // the giant rotating sign
  put(mesh(new THREE.CylinderGeometry(0.6, 0.8, 10, 8), toon(0x3a3550), 0.08), 0, CZ, H + 12);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex() });
  const edge = toon(0xffd23f);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(32, 7, 1.2), [edge, edge, edge, edge, signMat, signMat]);
  ink(sign, 0.25);
  put(sign, 0, CZ, H + 19.5, 0, true);

  // a huge tumbling die on a pedestal
  put(mesh(new THREE.CylinderGeometry(4, 4.8, 3, 16), toon(0xff2e88), 0.12), -36, 22, 1.5);
  col({ type: 'cyl', x: -36, z: 22, y0: -2, y1: 3, r: 4.8 });
  const dieMats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshToonMaterial({ map: pipTex(n), gradientMap: toon(0).gradientMap }));
  const die = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), dieMats);
  ink(die, 0.2);
  put(die, -36, 22, 10, 0, true);
  col({ type: 'sphere', x: -36, y: 10, z: 22, r: 5 });

  // the upright roulette wheel
  for (const sx of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(1.2, 13, 1.2), toon(0xffd23f), 0.08);
    leg.rotation.z = sx * 0.28;
    put(leg, 36 + sx * 3, 20, 6);
  }
  col({ type: 'box', x: 36, y: 5, z: 20, hx: 5, hy: 5, hz: 1 });
  const face = new THREE.MeshBasicMaterial({ map: wheelTex() });
  const wheel = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.4, 48), [toon(0x5a1a8f), face, face]);
  disc.rotation.x = Math.PI / 2;
  ink(disc, 0.2);
  wheel.add(disc);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.45, 8, 48), toon(0xffd23f)));
  put(wheel, 36, 20, 12.5, 0, true);
  const pointer = mesh(new THREE.ConeGeometry(1, 2.4, 4), toon(0xfff4e0), 0.08);
  pointer.rotation.x = Math.PI;
  put(pointer, 36, 20.9, 22.6);
  col({ type: 'box', x: 36, y: 12.5, z: 20, hx: 9.5, hy: 9.5, hz: 1 });

  // slot machines lining the carpet outside, with gamblers glued to them
  const cols = [0xff2e88, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff, 0xffd23f];
  const faces = ['777', 'BAR', '$$$', 'JKP', '7♦7', 'WIN'];
  let n = 0;
  for (const sx of [-1, 1]) for (const z of [D + 10, D + 18, D + 26]) {
    const x = sx * 9, yaw = -sx * Math.PI / 2;
    put(slotCabinet(cols[n % cols.length], faces[n % faces.length]), x, z, 0, yaw);
    col({ type: 'box', x, y: 2.5, z, hx: 1.2, hy: 2.5, hz: 1.6 });
    if (n % 2 === 0 || n === 3) {
      const f = makeFigure({ suit: [0x16121f, 0xffc83a, 0xff7ad9, 0x2ee6ff][n % 4], helmet: 0xfff4e0, visor: 0xff2e88 });
      put(f.root, x - sx * 2.4, z, 0, yaw + Math.PI);
    }
    n++;
  }
  // bouncer in a tux by the door
  const bouncer = makeFigure({ suit: 0x16121f, helmet: 0x16121f, visor: 0xffd23f, scale: 1.35 });
  put(bouncer.root, 7.6, D + 2.6, 0, 0);
  col({ type: 'cyl', x: 7.6, z: D + 2.6, y0: -1, y1: 3, r: 0.7 });

  // chip stacks out front
  const chipCols = [0xff2a4a, 0x2ee6ff, 0x111111, 0x7dff6a, 0xffd23f];
  [[-17, D + 13], [17, D + 13], [-24, D + 26], [24, D + 28]].forEach(([x, z], i) => {
    const hgt = 4 + (i % 2) * 3;
    for (let s = 0; s < hgt; s++) {
      const c = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 16), toon(chipCols[(s + i) % chipCols.length]), 0.05);
      c.rotation.y = s;
      put(c, x + Math.sin(s * 1.7) * 0.15, z, 0.3 + s * 0.62);
    }
    col({ type: 'cyl', x, z, y0: -2, y1: hgt * 0.62, r: 1.7 });
  });

  // sweeping searchlights on the roof
  const beamGeo = new THREE.ConeGeometry(7, 80, 16, 1, true).rotateX(Math.PI).translate(0, 40, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6a8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.rotation.z = 0.4;
    pivot.add(b);
    put(pivot, sx * 20, CZ - 6, H + 2, sx, true);
    put(mesh(new THREE.CylinderGeometry(1, 1.3, 1.2, 10), toon(0x3a3550), 0.06), sx * 20, CZ - 6, H + 2);
    beams.push(pivot);
  }

  const small = textSprite('THE HOUSE ALWAYS WINS. USUALLY.', { color: '#ff7ad9', size: 50, scale: 0.2, bg: '#120a1e' });
  small.position.set(0, 11.2, D + 8.5);
  loc.group.add(small);
  const open = textSprite('OPEN 25/8 · WALK RIGHT IN', { color: '#7dff6a', size: 50, scale: 0.3, bg: '#120a1e' });
  open.position.set(0, 13.6, D + 8.5);
  loc.group.add(open);

  // ================= INTERIOR =================
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 1, DEP - 1), new THREE.MeshToonMaterial({ map: carpetTex(), gradientMap: toon(0).gradientMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  put(floor, 0, CZ, 0.05);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(5, 16), toon(0xd7263d));
  runner.rotation.x = -Math.PI / 2;
  put(runner, 0, D - 8, 0.08);
  // wallpaper panels just inside each wall + neon bands
  const paper = toon(0x45207a);
  const panel = (x, z, len, yaw) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.2), paper);
    put(p, x, z, H / 2, yaw);
  };
  panel(0, BACK + 1.02, W * 2 - 2, 0);
  panel(-W + 1.02, CZ, DEP - 2, Math.PI / 2);
  panel(W - 1.02, CZ, DEP - 2, -Math.PI / 2);
  for (const [x0, x1] of [[-W + 1, -DOOR - 1], [DOOR + 1, W - 1]]) panel((x0 + x1) / 2, D - 1.02, x1 - x0, Math.PI);
  const bandMats = [glow(0xff2e88), glow(0x2ee6ff)];
  for (const [y, m] of [[H - 0.8, bandMats[0]], [3.2, bandMats[1]]]) {
    put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 2, 0.25, 0.25), m), 0, BACK + 1.1, y);
    for (const sx of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, DEP - 2), m), sx * (W - 1.1), CZ, y);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 2, DEP - 2), toon(0x1c0f33));
  ceiling.rotation.x = Math.PI / 2;
  put(ceiling, 0, CZ, H - 0.02);
  // ceiling strip lights
  for (const z of [-26, -16, -6, 4]) put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 6, 0.2, 0.5), glow(0xfff6a8)), 0, z, H - 0.15);
  // chandeliers (spinning slowly)
  const chandeliers = [];
  for (const [x, z] of [[-12, -14], [12, -14], [0, -2]]) {
    const g = new THREE.Group();
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 5), toon(0xffd23f)), x, z, H - 1.5);
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), glow(0xfff6a8)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.12, 6, 24).rotateX(Math.PI / 2), toon(0xffd23f));
    g.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glow(i % 2 ? 0x9be7ff : 0xff9fdc));
      drop.position.set(Math.cos(a) * 1.8, -0.45, Math.sin(a) * 1.8);
      g.add(drop);
    }
    put(g, x, z, H - 3.3, 0, true);
    chandeliers.push(g);
  }
  // a welcome sign hanging inside the door
  const wel = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: neonTex('BLACKJACK · DUCK DERBY · PLINKO', { color: '#fff6a8', edge: '#2ee6ff' }) }));
  put(wel, 0, 5, 9.6);

  // ---------- BLACKJACK TABLE ----------
  const bj = new THREE.Group();
  const R = BJ.R;
  const wood = toon(0x6b3a1f);
  const tbody = mesh(new THREE.CylinderGeometry(R, R, 0.3, 32, 1, false, -Math.PI / 2, Math.PI), wood, 0.06);
  tbody.position.y = BJ.top - 0.2;
  const flat = mesh(new THREE.BoxGeometry(R * 2, 0.36, 0.25), wood, 0.05);
  flat.position.set(0, BJ.top - 0.12, -0.05);
  const pedestal = mesh(new THREE.CylinderGeometry(0.6, 1, BJ.top - 0.3, 12), toon(0x2a1450), 0.06);
  pedestal.position.set(0, (BJ.top - 0.3) / 2, R * 0.45);
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R), new THREE.MeshToonMaterial({ map: feltTex(R), gradientMap: toon(0).gradientMap, transparent: true, alphaTest: 0.5 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.set(0, BJ.top - 0.04, R / 2);
  felt.receiveShadow = true;
  const rail = mesh(new THREE.TorusGeometry(R, 0.16, 8, 40, Math.PI), toon(0x3a0d16), 0.04);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = BJ.top;
  bj.add(tbody, flat, pedestal, felt, rail);
  // card shoe and chip tray
  const shoe = mesh(new THREE.BoxGeometry(0.55, 0.4, 0.85), toon(0xd7263d), 0.04);
  shoe.position.set(R * 0.62, BJ.top + 0.12, 0.55);
  shoe.rotation.y = -0.4;
  const shoeLip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.1), glow(0xffd23f));
  shoeLip.position.set(R * 0.62 - 0.12, BJ.top + 0.3, 0.95);
  shoeLip.rotation.y = -0.4;
  const tray = mesh(new THREE.BoxGeometry(2, 0.12, 0.45), toon(0x2a1450), 0.03);
  tray.position.set(-0.4, BJ.top + 0.02, 0.3);
  bj.add(shoe, shoeLip, tray);
  const chipGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.07, 14);
  const CHIP_COLS = [0xfff4e0, 0xff2a4a, 0x2ee6ff, 0x7dff6a, 0x16121f, 0xc77dff, 0xffd23f];
  for (let c = 0; c < 5; c++) for (let s = 0; s < 6; s++) {
    const ch = new THREE.Mesh(chipGeo, toon(CHIP_COLS[c]));
    ch.position.set(-1.2 + c * 0.4, BJ.top + 0.1 + s * 0.072, 0.3);
    bj.add(ch);
  }
  // the dealer, the player's stool, a hanging sign
  const dealer = makeFigure({ suit: 0x16121f, helmet: 0xfff4e0, visor: 0xffd23f, scale: 1.05 });
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), glow(0xd7263d));
  bow.position.set(0, 1.62, 0.33);
  dealer.root.add(bow);
  dealer.root.position.set(0, 0, -0.9);
  bj.add(dealer.root);
  const stool = mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.15, 14), toon(0xd7263d), 0.04);
  stool.position.set(0, 0.85, R + 0.9);
  const stoolLeg = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6), toon(0xffd23f), 0.02);
  stoolLeg.position.set(0, 0.4, R + 0.9);
  bj.add(stool, stoolLeg);
  put(bj, BJ.x, BJ.z, 0, 0, true);
  col({ type: 'box', x: BJ.x, y: 0.7, z: BJ.z + R / 2, hx: R + 0.2, hy: 0.7, hz: R / 2 + 0.2 });
  col({ type: 'cyl', x: BJ.x, z: BJ.z - 0.9, y0: -1, y1: 2.4, r: 0.6 });
  const bjSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: neonTex('BLACKJACK', { color: '#7dff6a', edge: '#ffd23f', sub: 'PAYS 3 TO 2 · F AT THE STOOL TO PLAY' }) }));
  put(bjSign, BJ.x, BJ.z - 0.3, 7.5);
  for (const sx of [-1, 1]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H - 8.4, 4), toon(0xffd23f)), BJ.x + sx * 3, BJ.z - 0.3, 8.4 + (H - 8.4) / 2);

  // ---------- DUCK DERBY TRACK ----------
  const L0 = DUCK.x0 - 2, L1 = DUCK.x1 + 2;
  const tlen = L1 - L0, tcx = (L0 + L1) / 2;
  const lz0 = DUCK.lanes[0] + 0.95, lz1 = DUCK.lanes[3] - 0.95, tcz = (lz0 + lz1) / 2, tdep = lz0 - lz1;
  put(mesh(new THREE.BoxGeometry(tlen, 0.8, tdep), toon(0x3a3550), 0.1), tcx, tcz, 0.4);
  col({ type: 'box', x: tcx, y: 1.1, z: tcz, hx: tlen / 2, hy: 1.1, hz: tdep / 2 + 0.6 });
  const water = waterTex();
  const waterMat = new THREE.MeshBasicMaterial({ map: water });
  const laneCols = [0xffd23f, 0xff2e88, 0x2ee6ff, 0x7dff6a];
  DUCK.lanes.forEach((z, i) => {
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(tlen - 0.4, 1.3), waterMat);
    wm.rotation.x = -Math.PI / 2;
    put(wm, tcx, z, DUCK.water);
    // lane number at the start, coloured
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (x) => {
      x.fillStyle = '#' + laneCols[i].toString(16).padStart(6, '0'); x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#120a1e'; x.font = FONT(44); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 32, 35);
    }) }));
    num.rotation.x = -Math.PI / 2;
    put(num, L0 + 0.7, z, DUCK.water + 0.02);
  });
  for (let i = 0; i <= 4; i++) {
    const z = DUCK.lanes[0] + 0.8 - i * 1.6;
    put(new THREE.Mesh(new THREE.BoxGeometry(tlen, 0.22, 0.2), i % 4 === 0 ? toon(0xffd23f) : toon(0xfff4e0)), tcx, z, 0.95);
  }
  // front rail with posts, so you watch from the carpet
  const railZ = lz0 + 0.5;
  put(mesh(new THREE.BoxGeometry(tlen, 0.16, 0.16), toon(0xffd23f), 0.03), tcx, railZ, 1.5);
  for (let x = L0; x <= L1 + 0.01; x += 2) put(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 5), toon(0xffd23f)), x, railZ, 0.75);
  // start gate + finish arch with a checkered banner
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, tdep), toon(0xd7263d));
  ink(gate, 0.04);
  put(gate, DUCK.x0 - 0.9, tcz, 1.35, 0, true);
  const checker = new THREE.MeshBasicMaterial({ map: checkerTex() });
  for (const z of [lz0 + 0.2, lz1 - 0.2]) put(mesh(new THREE.BoxGeometry(0.4, 5.5, 0.4), toon(0xfff4e0), 0.04), DUCK.x1, z, 2.75);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, tdep + 0.8), [checker, checker, toon(0x120a1e), toon(0x120a1e), checker, checker]);
  put(banner, DUCK.x1, tcz, 5.2);
  const finLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, tdep), checker);
  finLine.rotation.x = -Math.PI / 2;
  put(finLine, DUCK.x1, tcz, DUCK.water + 0.03);
  const ducks = laneCols.map((c, i) => {
    const d = makeDuck(c, i === 0 ? 0xff5a1f : 0xff9f1c);
    put(d.root, DUCK.x0, DUCK.lanes[i], DUCK.water - 0.25, 0, true);
    return d;
  });
  // odds board on the back wall
  const oddsCanvas = document.createElement('canvas');
  oddsCanvas.width = 1024; oddsCanvas.height = 384;
  const oddsTex = new THREE.CanvasTexture(oddsCanvas);
  oddsTex.colorSpace = THREE.SRGBColorSpace;
  const oddsBoard = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: oddsTex }));
  put(oddsBoard, tcx, BACK + 1.15, 8.4);
  put(mesh(new THREE.BoxGeometry(16.6, 6.6, 0.3), toon(0xffd23f), 0.05), tcx, BACK + 1.0, 8.4);
  // betting kiosk
  const kiosk = new THREE.Group();
  const kb = mesh(new THREE.BoxGeometry(2.6, 1.3, 1.2), toon(0xffd23f), 0.06);
  kb.position.y = 0.65;
  const kt = mesh(new THREE.BoxGeometry(2.8, 0.18, 1.4), toon(0xff2e88), 0.04);
  kt.position.y = 1.38;
  const kscr = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: neonTex('DUCK DERBY', { w: 512, h: 256, color: '#ffd23f', edge: '#2ee6ff', sub: 'F · PICK A DUCK' }) }));
  kscr.position.set(0, 2.35, -0.25);
  kscr.rotation.x = -0.25;
  const kpost = mesh(new THREE.BoxGeometry(2.6, 1.5, 0.2), toon(0x2a1450), 0.04);
  kpost.position.set(0, 2.3, -0.4);
  kpost.rotation.x = -0.25;
  kiosk.add(kb, kt, kpost, kscr);
  laneCols.forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12), glow(c));
    b.position.set(-0.75 + i * 0.5, 1.5, 0.15);
    kiosk.add(b);
  });
  put(kiosk, DUCK.kiosk[0], DUCK.kiosk[1], 0, 0);
  col({ type: 'box', x: DUCK.kiosk[0], y: 0.8, z: DUCK.kiosk[1], hx: 1.4, hy: 0.8, hz: 0.7 });

  // ---------- PLINKO ----------
  const P = PLK;
  const bw = SLOTS * SPACING + 2.4, bh = DROP_Y + 2.4;
  put(mesh(new THREE.BoxGeometry(bw, bh, 0.5), toon(0x1a0f2e), 0.1), P.x, P.z - 0.45, P.y + bh / 2 - 0.9);
  col({ type: 'box', x: P.x, y: (P.y + bh) / 2, z: P.z - 0.2, hx: bw / 2 + 0.2, hy: (P.y + bh) / 2, hz: 0.9 });
  // legs + neon frame
  for (const sx of [-1, 1]) {
    put(mesh(new THREE.BoxGeometry(0.6, P.y + 0.4, 0.6), toon(0xffd23f), 0.04), P.x + sx * (bw / 2 - 0.5), P.z - 0.4, (P.y + 0.4) / 2 - 0.4);
    neon(new THREE.BoxGeometry(0.3, bh, 0.3), 0xff2e88, P.x + sx * bw / 2, P.z - 0.15, P.y + bh / 2 - 0.9);
  }
  neon(new THREE.BoxGeometry(bw + 0.3, 0.3, 0.3), 0xff2e88, P.x, P.z - 0.15, P.y + bh - 0.9);
  neon(new THREE.BoxGeometry(bw + 0.3, 0.3, 0.3), 0xff2e88, P.x, P.z - 0.15, P.y - 0.9);
  // header
  const plkSign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: neonTex('PLINKO', { color: '#2ee6ff', edge: '#ffd23f', sub: 'UP TO 50× · REAL MOON PHYSICS' }) }));
  put(plkSign, P.x, P.z - 0.1, P.y + bh + 0.3);
  // pegs: one instanced mesh, per-peg colour so hits can flash
  const pegGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.55, 10).rotateX(Math.PI / 2);
  const pegs = new THREE.InstancedMesh(pegGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PEGS.length);
  const m4 = new THREE.Matrix4();
  const pegBase = new THREE.Color(0xd8d0ff);
  PEGS.forEach((p, i) => { m4.makeTranslation(p.x, p.y, 0); pegs.setMatrixAt(i, m4); pegs.setColorAt(i, pegBase); });
  pegs.frustumCulled = false;
  put(pegs, P.x, P.z, P.y, 0, true);
  // rails, dividers, floor
  for (const s of SEGS) {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, s.divider ? 0.1 : 0.14, 0.6), glow(s.divider ? 0xfff4e0 : 0x2ee6ff));
    bar.rotation.z = Math.atan2(s.by - s.ay, s.bx - s.ax);
    bar.position.set(P.x + (s.ax + s.bx) / 2, P.y + (s.ay + s.by) / 2, P.z);
    bar.updateMatrix();
    bar.matrixAutoUpdate = false;
    loc.group.add(bar);
  }
  // slots: glowing back panels that light up, with the multiplier underneath
  const slotMats = [];
  const slotCol = (m) => (m >= 20 ? 0xff2a4a : m >= 5 ? 0xff9f1c : m >= 2 ? 0xffd23f : m >= 1 ? 0x7dff6a : m >= 0.5 ? 0x2ee6ff : 0x7b5cff);
  for (let s = 0; s < SLOTS; s++) {
    const c = new THREE.Color(slotCol(MULTS[s]));
    const mat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.45) });
    mat.userData.base = c;
    slotMats.push(mat);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(SPACING - 0.08, DIVIDER_TOP), mat);
    put(back, P.x + slotCentre(s), P.z - 0.18, P.y + DIVIDER_TOP / 2);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(SPACING - 0.05, 0.62), new THREE.MeshBasicMaterial({ map: canvasTex(128, 88, (x, w, h) => {
      x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#' + c.getHexString(); x.fillRect(5, 5, w - 10, h - 10);
      const t = `${MULTS[s]}×`;
      fitText(x, t, w - 16, 60);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#120a1e'; x.fillText(t, w / 2, h / 2 + 3);
    }) }));
    put(label, P.x + slotCentre(s), P.z + 0.08, P.y - 0.42);
  }
  void slotEdge;
  // the aim ball that rides the top of the chute, plus an arrow
  const aim = new THREE.Group();
  const aimBall = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), glow(0xffd23f));
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), glow(0xff2e88));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 0.7;
  aim.add(aimBall, arrow);
  put(aim, P.x, P.z + 0.1, P.y + DROP_Y, 0, true);
  // the console you stand at
  const con = new THREE.Group();
  const cb = mesh(new THREE.BoxGeometry(3.4, 1.1, 1.2), toon(0x2a1450), 0.06);
  cb.position.y = 0.55;
  const ct = mesh(new THREE.BoxGeometry(3.6, 0.16, 1.4), toon(0xffd23f), 0.04);
  ct.position.y = 1.18;
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.2, 16), glow(0xff2a4a));
  btn.position.set(0, 1.34, 0);
  con.add(cb, ct, btn);
  for (const sx of [-1, 1]) {
    const ab = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), glow(0x2ee6ff));
    ab.rotation.z = sx * Math.PI / 2;
    ab.position.set(sx * 1.1, 1.36, 0);
    con.add(ab);
  }
  put(con, P.x, P.z + 6, 0);
  col({ type: 'box', x: P.x, y: 0.7, z: P.z + 6, hx: 1.8, hy: 0.7, hz: 0.7 });

  // ---------- CLASSIC GAMES corner + prize counter / loan shark ----------
  CLASSIC.zs.forEach((z, i) => {
    put(slotCabinet([0xc77dff, 0x2ee6ff, 0xff9f1c][i], ['777', 'JKP', 'BAR'][i]), CLASSIC.x, z, 0, -Math.PI / 2);
    col({ type: 'box', x: CLASSIC.x, y: 2.5, z, hx: 1.2, hy: 2.5, hz: 1.6 });
  });
  const clSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: neonTex('CLASSIC GAMES', { color: '#ff7ad9', edge: '#7dff6a', sub: 'SLOTS · ROULETTE · PRIZE WHEEL · HIGH-LOW' }) }));
  put(clSign, W - 1.15, CLASSIC.zs[1], 8.2, -Math.PI / 2);
  const vinnie = makeFigure({ suit: 0x1f8a4a, helmet: 0x7dff6a, visor: 0xffd23f, scale: 1.1 });
  put(vinnie.root, CLASSIC.x - 2.5, CLASSIC.zs[0] - 3, 0, -Math.PI / 2 - 0.5);
  const vin = textSprite('VINNIE "THE VISOR" · PIT BOSS', { color: '#7dff6a', size: 44, scale: 0.22, bg: '#120a1e' });
  vin.position.set(CLASSIC.x - 2.5, 3.4, CLASSIC.zs[0] - 3);
  loc.group.add(vin);
  // prize counter booth
  put(mesh(new THREE.BoxGeometry(1.6, 1.4, 7), toon(0xffd23f), 0.06), PRIZE.x, PRIZE.z, 0.7);
  put(mesh(new THREE.BoxGeometry(1.9, 0.16, 7.3), toon(0xff2e88), 0.04), PRIZE.x, PRIZE.z, 1.48);
  col({ type: 'box', x: PRIZE.x + 1.5, y: 1.5, z: PRIZE.z, hx: 2.4, hy: 1.5, hz: 3.6 });
  const prSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neonTex('PRIZE COUNTER', { color: '#ffd23f', edge: '#ff2e88', sub: 'CHIPS → DRIP · RUSTY\'S LOANS IN THE BACK' }) }));
  put(prSign, W - 1.15, PRIZE.z, 6.5, -Math.PI / 2);
  const shark = makeFigure({ suit: 0x6d7a8f, helmet: 0x9aa7bb, visor: 0xff2a4a });
  const fin = mesh(new THREE.ConeGeometry(0.3, 0.8, 3), toon(0x6d7a8f), 0.03);
  fin.position.set(0, 2.6, -0.1);
  shark.root.add(fin);
  put(shark.root, PRIZE.x + 1.8, PRIZE.z + 1.5, 0, -Math.PI / 2);
  const clerk = makeFigure({ suit: 0xff7ad9, helmet: 0xfff4e0, visor: 0x2ee6ff });
  put(clerk.root, PRIZE.x + 1.8, PRIZE.z - 1.5, 0, -Math.PI / 2);
  // prize shelves behind
  for (let i = 0; i < 3; i++) put(new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 40, 6), glow([0xffd23f, 0xc77dff, 0x7dff6a][i])), W - 1.8, PRIZE.z - 2.2 + i * 2.2, 3.4);

  // a handful of spectators who bob along
  const crowd = [];
  const spots = [[-4, -18.6, Math.PI], [-16, -18.4, Math.PI], [-21, -18.8, Math.PI + 0.3], [8.5, -23, 2.5], [19.5, -23.5, -2.6], [-8.5, -4, -1.2], [5, 2, 0.6]];
  spots.forEach(([x, z, yaw], i) => {
    const f = makeFigure({ suit: [0xffc83a, 0x2ee6ff, 0xff7ad9, 0x16121f, 0x7dff6a, 0xc77dff, 0xff9f1c][i], helmet: 0xfff4e0, visor: [0xff2e88, 0x241a5c, 0xffd23f][i % 3] });
    put(f.root, x, z, 0, yaw, true);
    col({ type: 'cyl', x, z, y0: -1, y1: 2.4, r: 0.55 });
    crowd.push({ root: f.root, phase: i * 1.7, cheer: 0 });
  });

  loc.group.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(loc.group.quaternion);

  let chase = 0;
  return {
    loc,
    up,
    entrance: w.toWorld(loc, 0, 1, D + 3),
    near(p) { return p.distanceTo(this.entrance) < 10; },
    toWorld: (x, y, z, out) => w.toWorld(loc, x, y, z, out),
    toLocal: (p, out = new THREE.Vector3()) => loc.group.worldToLocal(out.copy(p)),
    bj: { group: bj, dealer, shoe },
    duck: { ducks, gate, water, oddsCanvas, oddsTex, crowd },
    plinko: { pegs, pegBase, slotMats, aim },
    crowd,
    onUpdate: null, // set by the game logic (casinoGames.js)
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
      for (const c of chandeliers) c.rotation.y += dt * 0.3;
      const pulse = 0.75 + 0.25 * Math.sin(time * 3);
      bandMats[0].color.setRGB(1 * pulse, 0.18 * pulse, 0.53 * pulse);
      bandMats[1].color.setRGB(0.18 * (1.75 - pulse), 0.9 * (1.75 - pulse), 1 * (1.75 - pulse));
      water.offset.x -= dt * 0.25;
      for (const c of crowd) {
        c.cheer = Math.max(0, c.cheer - dt);
        c.root.position.y = c.cheer > 0 ? Math.abs(Math.sin(time * 9 + c.phase)) * 0.5 : Math.abs(Math.sin(time * 2 + c.phase)) * 0.05;
      }
      if (this.onUpdate) this.onUpdate(dt, time);
    },
  };
}
