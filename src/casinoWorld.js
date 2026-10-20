import * as THREE from 'three';
import { toon, ink, glow, glowShared, textSprite, nameTag } from './toon.js';
import { makeFigure, makeSlotCabinet, SLOT_LAMP_OFF, plinkoConsoleModel, plinkoFrameModel, makeBouncer, makeChandelier, makeCasinoSign, makeBlackjackTable, makeClawMachine, makeDerbyPart, makeHallPart, makeRacer } from './models.js';
import { pxCanvas } from './pixelIcons.js';
import { pixelFont } from './fonts.js';
import { faceInfo, glyphState } from './glyphs.js';
import { PEGS, SEGS, SLOTS, MULTS, SPACING, DROP_Y, DIVIDER_TOP, slotCentre } from './plinko.js';
import { HALL, WALL, FRONT_OUT, BJ, bjPt, CLAW, clawPt, DUCK, PLK, CLASSIC, PRIZE, hallPolygon, offsetPolygon, wallEdges, wallBoxes, floorShapes, inHall } from './casinoPlan.js';
export { HALL, BJ, bjPt, CLAW, clawPt, DUCK, PLK, CLASSIC, PRIZE, inHall };

// The Lucky Crater Casino: neon hall, spinning sign, giant die, house-sized roulette wheel, slot-lined carpet. Inside:
// BLACKJACK, the DUCK DERBY, giant PLINKO, the CLASSIC GAMES cabinets (overlay casino) and the prize counter.
// Game logic is in casinoGames.js; this file builds the place and hands back the props.

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
export const fmt = (n) => Math.floor(n).toLocaleString('en-US'); // credits, as every casino screen shows them
export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export function disc(x, cx, cy, r, fill) { x.fillStyle = fill; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }

// shrink the font until the text fits
export function fitText(x, text, maxW, px) {
  let s = px;
  x.font = FONT(s);
  while (s > 10 && x.measureText(text).width > maxW) { s -= 4; x.font = FONT(s); }
  return s;
}

// A face button in the pad family's style (Xbox: coloured letter; PlayStation: coloured symbol; Switch: white letter)
const PAD_COL = { g: '#8ad63a', r: '#ff4a4a', b: '#3a8fe8', y: '#f0b020', p: '#ff7ad9' };
function drawFaceGlyph(x, token, kind, cx, cy, r) {
  const [txt, col] = faceInfo(token, kind);
  x.save();
  x.shadowBlur = 0;
  x.strokeStyle = '#0a0810'; x.lineWidth = r * 0.16;
  disc(x, cx, cy, r, '#26232e'); x.stroke();
  const c = kind === 'switch' ? '#fff4e0' : PAD_COL[col === 'b' && kind === 'ps' ? 'b' : col] || '#fff4e0';
  x.strokeStyle = c; x.fillStyle = c; x.lineWidth = r * 0.2; x.lineCap = 'round'; x.lineJoin = 'round';
  const s = r * 0.5;
  if (txt === '✕') { x.beginPath(); x.moveTo(cx - s, cy - s); x.lineTo(cx + s, cy + s); x.moveTo(cx + s, cy - s); x.lineTo(cx - s, cy + s); x.stroke(); }
  else if (txt === '○') { x.beginPath(); x.arc(cx, cy, s * 1.05, 0, Math.PI * 2); x.stroke(); }
  else if (txt === '□') { x.strokeRect(cx - s, cy - s, s * 2, s * 2); }
  else if (txt === '△') { x.beginPath(); x.moveTo(cx, cy - s * 1.1); x.lineTo(cx + s * 1.1, cy + s * 0.8); x.lineTo(cx - s * 1.1, cy + s * 0.8); x.closePath(); x.stroke(); }
  else { x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = FONT(r * 1.3); x.fillText(txt, cx, cy + r * 0.06); }
  x.restore();
}

// Neon sign board. `pad` (a pad family, or null for keyboard) picks how "{F}" in the sub line draws: F, or that
// family's button.
function neonTex(text, { w = 1024, h = 256, color = '#ffd23f', edge = '#ff2e88', bg = '#120a1e', sub = null, pad = null } = {}) {
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
      const plain = sub.replace('{F}', pad ? 'XX' : 'F');
      const px = fitText(x, plain, w - 80, h * 0.2);
      x.fillStyle = '#fff4e0';
      if (pad && sub.includes('{F}')) {
        const [a, b] = sub.split('{F}');
        const gr = px * 0.62, gap = px * 0.35;
        const wa = x.measureText(a).width, wb = x.measureText(b).width, total = wa + gr * 2 + gap * 2 + wb;
        let cx = w / 2 - total / 2;
        x.textAlign = 'left'; x.fillText(a, cx, h * 0.76); cx += wa + gap;
        drawFaceGlyph(x, 'X', pad, cx + gr, h * 0.76, gr); cx += gr * 2 + gap;
        x.fillStyle = '#fff4e0'; x.fillText(b, cx, h * 0.76);
        x.textAlign = 'center';
      } else x.fillText(plain, w / 2, h * 0.76);
    }
  });
}

function pipTex(n) {
  return canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#fff4e0'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#120a1e'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, w - 8);
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n];
    for (const [a, b] of P) disc(x, a * 32, b * 32, n === 1 ? 18 : 12, n === 1 ? '#ff2a4a' : '#120a1e');
  });
}

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// the pockets round (c, c) in wheel order, numbers `inset` in from the rim; `edge`: a line between pockets
export function roulettePockets(x, c, font, inset, edge = null) {
  const n = WHEEL.length;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const v = WHEEL[i];
    x.fillStyle = v === 0 ? '#1f8a4a' : REDS.has(v) ? '#d7263d' : '#1a1426';
    x.beginPath(); x.moveTo(c, c); x.arc(c, c, c - 10, a0, a1); x.closePath(); x.fill();
    if (edge) { x.strokeStyle = edge; x.lineWidth = 1; x.stroke(); }
    x.save(); x.translate(c, c); x.rotate((a0 + a1) / 2 + Math.PI / 2);
    x.fillStyle = '#fff4e0'; x.font = font; x.textAlign = 'center';
    x.fillText(String(v), 0, -c + inset);
    x.restore();
  }
}

function wheelTex() {
  return canvasTex(512, 512, (x, w) => {
    const c = w / 2;
    disc(x, c, c, c, '#120a1e');
    roulettePockets(x, c, FONT(30), 44);
    disc(x, c, c, c * 0.52, '#ffd23f');
    disc(x, c, c, c * 0.44, '#5a1a8f');
    x.strokeStyle = '#ffd23f'; x.lineWidth = 14;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(i * Math.PI / 2) * c * 0.44, c + Math.sin(i * Math.PI / 2) * c * 0.44); x.stroke(); }
    disc(x, c, c, 26, '#ffd23f');
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
    for (const [cx, cy] of [[w / 2, 0], [0, w / 2], [w, w / 2], [w / 2, w]]) disc(x, cx, cy, 14, '#ff2e88');
    disc(x, w / 2, w / 2, 9, '#2ee6ff');
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.2, 0.2); // floor uv are metres: a tile per 5 m
  return t;
}

// Blackjack felt print: a half disc, dealer's flat edge at the top; the plane is 2R by R (1024 px = 2R m). Laid out to
// build_blackjack.py ZONES (the model keeps out of them): red card rows with gold corner brackets on the edge, the bet
// circle alone, lettering round the rim outside the bet stacks.
const BJ_AREAS = { x: 1.6, dealer: [0.26, 0.98], player: [1.39, 2.26] }; // x: half width; z from, to (table-local m)
function feltTex(R) {
  return canvasTex(1024, 512, (x, w, h) => {
    const PX = w / (2 * R), mx = (m) => w / 2 + m * PX, mz = (m) => m * PX;
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#14603a';
    x.beginPath(); x.moveTo(0, 0); x.arc(w / 2, 0, w / 2, 0, Math.PI); x.closePath(); x.fill();
    const g = x.createRadialGradient(w / 2, 0, 40, w / 2, 0, w / 2);
    g.addColorStop(0, 'rgba(125,255,106,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    x.fillStyle = g; x.fill();
    // double gold pinstripe and an inner arc
    x.strokeStyle = '#ffd23f'; x.lineWidth = 5;
    x.beginPath(); x.arc(w / 2, 0, w / 2 - 8, 0.02 * Math.PI, 0.98 * Math.PI); x.stroke();
    x.lineWidth = 2; x.beginPath(); x.arc(w / 2, 0, w / 2 - 19, 0.02 * Math.PI, 0.98 * Math.PI); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.arc(w / 2, 0, mz(2.42), 0.17 * Math.PI, 0.83 * Math.PI); x.stroke();
    // rim lettering
    x.font = FONT(26); x.textAlign = 'center'; x.textBaseline = 'middle';
    const msg = 'BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17', r = mz(3.12);
    let a = Math.PI / 2 + (x.measureText(msg).width / r) / 2;
    for (const ch of msg) {
      const cw = x.measureText(ch).width;
      a -= cw / 2 / r;
      x.save(); x.translate(w / 2 + Math.cos(a) * r, Math.sin(a) * r); x.rotate(a - Math.PI / 2);
      x.lineWidth = 6; x.lineJoin = 'round'; x.strokeStyle = '#0a3a22'; x.strokeText(ch, 0, 0);
      x.fillStyle = '#ffd23f'; x.fillText(ch, 0, 0); x.restore();
      a -= cw / 2 / r;
    }
    // card rows: red areas, gold corner brackets
    for (const [z0, z1] of [BJ_AREAS.dealer, BJ_AREAS.player]) {
      const x0 = mx(-BJ_AREAS.x), x1 = mx(BJ_AREAS.x), y0 = mz(z0), y1 = mz(z1);
      x.fillStyle = '#a81c3e';
      x.beginPath(); x.roundRect(x0, y0, x1 - x0, y1 - y0, 8); x.fill();
      x.strokeStyle = '#ffd23f'; x.lineWidth = 4; x.lineJoin = 'miter'; x.lineCap = 'butt';
      const L = 28, o = 2; // line centred on the area's edge
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        x.beginPath(); x.moveTo(cx + sx * L, cy + sy * o); x.lineTo(cx + sx * o, cy + sy * o); x.lineTo(cx + sx * o, cy + sy * L); x.stroke();
      }
    }
    // bet circle
    x.strokeStyle = '#fff4e0'; x.lineWidth = 4; x.beginPath(); x.arc(mx(0), mz(2.72), 0.34 * PX, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2; x.beginPath(); x.arc(mx(0), mz(2.72), 0.28 * PX, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff4e0'; x.font = FONT(22); x.fillText('BET', mx(0), mz(2.72));
    // between the rows: the house joke
    x.fillStyle = 'rgba(255,244,224,0.8)'; x.font = FONT(20); x.fillText('INSURANCE IS FOR COWARDS', mx(0), mz(1.18));
    // suits round the arc, a gold crescent at the dealer's edge
    x.fillStyle = '#ffd23f'; x.font = '52px serif';
    x.fillText('♠', mx(-2.9), mz(0.52)); x.fillText('♥', mx(2.9), mz(0.52));
    x.fillText('♦', mx(-2.55), mz(1.55)); x.fillText('♣', mx(2.55), mz(1.55));
    disc(x, mx(0), mz(0.1), 22, 'rgba(255,210,63,0.9)');
    disc(x, mx(0) + 8, mz(0.1) - 4, 19, '#14603a');
  });
}

// finish line: two columns of squares across the lanes (plane: 0.5 m along the track by the basin's width)
export function finishTex() {
  return canvasTex(32, 256, (x) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 16; j++) { x.fillStyle = (i + j) % 2 ? '#120a1e' : '#fff4e0'; x.fillRect(i * 16, j * 16, 16, 16); } });
}
export function checkerTex() {
  return canvasTex(256, 64, (x) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#120a1e' : '#fff4e0'; x.fillRect(i * 16, j * 16, 16, 16); }
  });
}

export function waterTex() {
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

// ---- Slot cabinets (carousels outside, Classic Games corner inside) ----
// Model from build_slots.py (models.js makeSlotCabinet); here it gets the marquee, side sprites and the pixel-reel screen
// (scrolls while played). Static parts go in `userData.stat`, merged by the world (shared materials: a carousel is a few
// draw calls); the cabinet itself is the lever, lamp bar and screen, worked through its userData.
const SLOT_FACES = ['777', 'BAR', '$$$', 'JKP', '7♦7', 'WIN', 'SPIN'];
const SLOT_REELS = ['moon', 'comet', 'rocket', 'alien', 'ufo', 'diamond', 'wild']; // the overlay slots' symbols
const SLOT_ART = { low: ['ufo', 'alien', 'rocket', 'moon', 'comet', 'diamond', 'wild'], up: ['star', 'crown', 'coin', 'chip', 'flame', 'heart', 'spade'] };
const SLOT_POLY = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }; // planes a few mm off the face
const slotMats = { marquee: new Map(), art: new Map(), idle: new Map() };
const slotLampOff = glowShared(SLOT_LAMP_OFF), slotLampOn = glowShared(0xffd23f);

function marqueeMat(face, color) {
  const key = face + color;
  let m = slotMats.marquee.get(key);
  if (!m) {
    const col = hex(color);
    m = new THREE.MeshBasicMaterial({
      map: canvasTex(256, 92, (x, w, h) => {
        x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#3d1366'; x.fillRect(5, 5, w - 10, h - 10);
        for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#fff6a8' : col; x.fillRect(10 + i * 15.6, 8, 6, 6); x.fillRect(10 + i * 15.6, h - 14, 6, 6); }
        fitText(x, face, w - 40, 56);
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 8; x.lineJoin = 'round'; x.strokeStyle = '#120a1e'; x.strokeText(face, w / 2, h / 2 + 2);
        x.fillStyle = '#ffd23f'; x.fillText(face, w / 2, h / 2 + 2);
      }),
      ...SLOT_POLY,
    });
    slotMats.marquee.set(key, m);
  }
  return m;
}

// a pixel sprite in a gold-framed dark square, for a cabinet's side
function artMat(name) {
  let m = slotMats.art.get(name);
  if (!m) {
    const t = canvasTex(64, 64, (x, w, h) => {
      x.fillStyle = '#ffd23f'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#1b1430'; x.fillRect(3, 3, w - 6, h - 6);
      const cv = pxCanvas(name);
      if (cv) {
        const k = Math.max(1, Math.floor(46 / Math.max(cv.width, cv.height)));
        x.imageSmoothingEnabled = false;
        x.drawImage(cv, Math.round((w - cv.width * k) / 2), Math.round((h - cv.height * k) / 2), cv.width * k, cv.height * k);
      }
    });
    t.magFilter = THREE.NearestFilter;
    m = new THREE.MeshBasicMaterial({ map: t, ...SLOT_POLY });
    slotMats.art.set(name, m);
  }
  return m;
}

// Pixel-reel screen: three reels; `pos` is each reel's position in symbols (fractions scroll)
function drawReels(x, w, h, pos) {
  x.fillStyle = '#0b0820'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1b1040'; x.fillRect(6, 6, w - 12, h - 12);
  x.save();
  x.beginPath(); x.rect(8, 8, w - 16, h - 16); x.clip();
  x.imageSmoothingEnabled = false;
  const n = SLOT_REELS.length;
  for (let c = 0; c < 3; c++) {
    const base = Math.floor(pos[c]), f = pos[c] - base;
    for (let r = -1; r <= 3; r++) {
      const cv = pxCanvas(SLOT_REELS[(((base - r + c * 2) % n) + n) % n]);
      if (cv) x.drawImage(cv, 14 + c * 78, 12 + (r + f) * 56, 52, 52);
    }
  }
  x.restore();
  x.fillStyle = '#ff2a4a'; x.fillRect(6, h / 2 - 1, w - 12, 3);
}
const reelPos = (seed) => [seed, seed + 1, seed + 2];
function idleMat(seed) { // unplayed cabinet's screen: shared, one per seed
  let m = slotMats.idle.get(seed);
  if (!m) slotMats.idle.set(seed, m = new THREE.MeshBasicMaterial({ map: canvasTex(256, 192, (x, w, h) => drawReels(x, w, h, reelPos(seed))), ...SLOT_POLY }));
  return m;
}

export function slotCabinet(color, idx) {
  const M = makeSlotCabinet(color);
  const sp = M.spots, n = SLOT_FACES.length;
  const plane = (spot, mat, ry = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(spot.w, spot.h), mat);
    p.position.copy(spot.pos);
    p.rotation.set(-spot.tilt, ry, 0);
    return p;
  };
  M.stat.add(plane(sp.screen, marqueeMat(SLOT_FACES[idx % n], color)));
  for (const d of sp.decals) M.stat.add(plane(d, artMat(SLOT_ART[d.id][(idx + (d.side > 0 ? 0 : 3)) % SLOT_ART[d.id].length]), d.side * Math.PI / 2));
  const display = plane(sp.display, idleMat(idx % n));
  M.dyn.add(display);
  M.dyn.userData = { stat: M.stat, pull: M.pull, lamp: M.lamp, display, seed: idx % n, playing: 0, pullT: 0, lampOn: false, reel: null };
  return M.dyn;
}

// A frame of a worked cabinet: lever swings, lamp bar flashes, reels stop one by one (a played cabinet keeps its last
// picture on its own screen).
const REEL_STOP = [1.0, 0.65, 0.3];
export function updateSlot(u, dt, time) {
  u.playing = Math.max(0, u.playing - dt);
  const flash = u.playing > 0 && Math.sin(time * 18) > 0;
  if (flash !== u.lampOn) { u.lampOn = flash; u.lamp.material = flash ? slotLampOn : slotLampOff; }
  u.pull.rotation.x += ((u.pullT > 0 ? 1.1 : 0) - u.pull.rotation.x) * Math.min(1, dt * 14);
  u.pullT = Math.max(0, u.pullT - dt);
  if (u.playing > 0 && !u.reel) {
    const tex = canvasTex(256, 192, () => {});
    u.reel = { tex, ctx: tex.image.getContext('2d'), mat: new THREE.MeshBasicMaterial({ map: tex, ...SLOT_POLY }), pos: reelPos(u.seed), acc: 1, live: [true, true, true] };
    u.display.material = u.reel.mat;
  }
  const r = u.reel;
  if (!r || (!u.playing && !r.live.some(Boolean))) return;
  let draw = false;
  r.acc += dt;
  for (let c = 0; c < 3; c++) {
    if (u.playing > REEL_STOP[c]) { r.pos[c] += dt * 16; r.live[c] = true; }
    else if (r.live[c]) { r.pos[c] = Math.ceil(r.pos[c]); r.live[c] = false; draw = true; } // land on a symbol
  }
  if (draw || r.acc > 1 / 15) {
    r.acc = 0;
    drawReels(r.ctx, 256, 192, r.pos);
    r.tex.needsUpdate = true;
  }
}

// Racing duck, ~1.3 m, facing +x (build_duck.py): { root, bob, head, wings }. `n`: 1 QUACKERS, 2 SIR WADDLES, 3 DUCKTOR WHO, 4 MOONBILL.
export function makeDuck(color, bill = 0xff9f1c, n = 1) {
  return makeRacer(n, color, bill);
}

// ---- layout: numbers in casinoPlan.js (casino frame: facade faces +z) ----
export const BJ_RACK = new THREE.Vector3(-0.85, 1.3, -0.26); // dealer's chip rack, table-local

// Blackjack table in its own frame (buildCasino places it at BJ and freezes it): the build_blackjack.py model plus the
// feltTex plane at its `felt` pivot.
export function blackjackTable() {
  const bjt = makeBlackjackTable();
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(bjt.spots.felt.w, bjt.spots.felt.h), new THREE.MeshToonMaterial({ map: feltTex(BJ.R), gradientMap: toon(0).gradientMap, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.copy(bjt.spots.felt.pos);
  felt.receiveShadow = true;
  bjt.stat.add(felt);
  return bjt.stat;
}

export function buildCasino(w, loc) {
  // signs naming a button: redrawn with the pad's glyph when a controller is in use
  const padSigns = [];
  const padSign = (mesh, text, opts) => padSigns.push({ mesh, text, opts, key: 'kb', cache: { kb: mesh.material.map } });
  const { H, DOOR, DOOR_H, FRONT, C: [HCX, CZ] } = HALL;
  const put = (o, x, z, y = 0, yaw = 0, dyn = false) => w.put(o, loc, x, z, y, yaw, dyn);
  const col = (spec) => w.col(loc, spec);
  // slot: frozen body (merged) plus the cabinet, frozen too unless a patron works it
  const placeSlot = (cab, x, z, yaw, animated) => { put(cab.userData.stat, x, z, 0, yaw); put(cab, x, z, 0, yaw, animated); };
  // glow materials shared by colour so trim merges (glow() makes a new one each call)
  const glowS = glowShared;
  const flat2 = (pts, flipZ) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, flipZ ? -z : z)));

  // ---------- outline (casinoPlan.js): IN inner boundary, PO wall outer face, PE roof gold edge; E the straight runs ----------
  const IN = hallPolygon(), PO = offsetPolygon(IN, WALL), PE = offsetPolygon(IN, WALL + 0.9), PB = offsetPolygon(IN, WALL + 0.6);
  const E = wallEdges();

  // ---------- hall: wall band with the door gap, lintel, roof, drum and dome over the crossing ----------
  const wallM = toon(0x2a1450);
  put(mesh(new THREE.ExtrudeGeometry(flat2([...IN, ...[...PO].reverse()], true), { depth: H, bevelEnabled: false }).rotateX(-Math.PI / 2), wallM, 0.15), 0, 0);
  put(mesh(new THREE.BoxGeometry(DOOR * 2, H - DOOR_H, WALL), wallM, 0.15), 0, FRONT + WALL / 2, (DOOR_H + H) / 2);
  col({ type: 'box', x: 0, y: (DOOR_H + H) / 2, z: FRONT + WALL / 2, hx: DOOR, hy: (H - DOOR_H) / 2, hz: WALL / 2 });
  for (const bx of wallBoxes(E)) col({ type: 'box', x: bx.x, y: H / 2, z: bx.z, hx: bx.hx, hy: H / 2, hz: bx.hz, yaw: bx.yaw });   // one box per run, mitres included
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(flat2(PO, true), { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2), wallM);
  roof.receiveShadow = true; // casts none: the hall stays bright inside
  ink(roof, 0.15);
  put(roof, 0, 0, H);
  put(new THREE.Mesh(new THREE.ExtrudeGeometry(flat2(PE, true), { depth: 0.8, bevelEnabled: false }).rotateX(-Math.PI / 2), toon(0xffd23f)), 0, 0, H + 0.9);
  for (const s of floorShapes()) {        // walkable roof: each plan piece grown by the wall
    if (s.k === 'c') col({ type: 'cyl', x: s.x, z: s.z, y0: H, y1: H + 1.7, r: s.r + WALL });
    else col({ type: 'box', x: (s.x0 + s.x1) / 2, y: H + 0.85, z: (s.z0 + s.z1) / 2, hx: (s.x1 - s.x0) / 2 + WALL, hy: 0.85, hz: (s.z1 - s.z0) / 2 + WALL });
  }
  const crown = H + 1.7;      // drum, dome and lantern (build_hall.py facade_crown); the sign's mast sits on the lantern
  put(makeHallPart('facade_crown'), HCX, CZ, crown);
  col({ type: 'cyl', x: HCX, z: CZ, y0: crown, y1: crown + 3, r: 16.6 });
  col({ type: 'sphere', x: HCX, y: crown + 3, z: CZ, r: 13 });
  const bandMats = [glow(0xff2e88), glow(0x2ee6ff)];       // the hall's two pulsing neon lines
  // Rings round the outline, between two offsets of it: mitred corners, and each buried in the wall by a different depth so
  // no faces coincide. `a` buried side, `b` front: metres from the wall's inner face, + outward, - into the room.
  // Built quad by quad between the mitred chains: tight corners make a thin ring's edges cross, breaking a polygon fill.
  const bandGeo = (a, b, y0, y1, end = 0.01) => {
    const A = offsetPolygon(IN, a), B = offsetPolygon(IN, b), pos = [];
    for (const V of [A, B]) { V[0] = [V[0][0] + end, V[0][1]]; V[V.length - 1] = [V[V.length - 1][0] - end, V[V.length - 1][1]]; }     // ends `end` m back from the jambs: each ring its own, so no two end caps share a plane
    const quad = (p0, p1, p2, p3, n) => {     // two triangles, wound to face n
      const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const tris = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] >= 0 ? [p0, p1, p2, p0, p2, p3] : [p0, p2, p1, p0, p3, p2];
      for (const q of tris) pos.push(q[0], q[1], q[2]);
    };
    const P = (V, i, y) => [V[i][0], y, V[i][1]];
    for (let i = 0; i < IN.length - 1; i++) {      // jamb to jamb: the door gap stays open
      const dx = (B[i][0] + B[i + 1][0] - A[i][0] - A[i + 1][0]) / 2, dz = (B[i][1] + B[i + 1][1] - A[i][1] - A[i + 1][1]) / 2, dl = Math.hypot(dx, dz) || 1;
      quad(P(A, i, y1), P(A, i + 1, y1), P(B, i + 1, y1), P(B, i, y1), [0, 1, 0]);
      quad(P(A, i, y0), P(A, i + 1, y0), P(B, i + 1, y0), P(B, i, y0), [0, -1, 0]);
      quad(P(B, i, y0), P(B, i + 1, y0), P(B, i + 1, y1), P(B, i, y1), [dx / dl, 0, dz / dl]);
      quad(P(A, i, y0), P(A, i + 1, y0), P(A, i + 1, y1), P(A, i, y1), [-dx / dl, 0, -dz / dl]);
    }
    for (const [i, sgn] of [[0, -1], [IN.length - 1, 1]]) {       // end caps
      const j = sgn < 0 ? 1 : IN.length - 2, ex = (IN[i][0] - IN[j][0]), ez = (IN[i][1] - IN[j][1]), el = Math.hypot(ex, ez) || 1;
      quad(P(A, i, y0), P(B, i, y0), P(B, i, y1), P(A, i, y1), [ex / el, 0, ez / el]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const band = (a, b, y0, y1, mat, ol = 0, end = 0.01) => { const g = bandGeo(a, b, y0, y1, end); put(ol ? mesh(g, mat, ol) : new THREE.Mesh(g, mat), 0, 0); };
  const across = (off0, off1, y0, y1, mat, ol = 0.012) => put(mesh(new THREE.BoxGeometry(DOOR * 2 + 0.04, y1 - y0, off1 - off0), mat, ol), 0, FRONT + off0 + (off1 - off0) / 2, (y0 + y1) / 2);   // the same ring over the doors, its ends 1 cm into the ring's
  const GOLD = toon(0xffd23f), BRASS = toon(0xc79a1f);
  // outside: plinth, belt, cornice with dentils and neon channel; a suit panel per long run; the door frame
  band(WALL - 0.02, WALL + 0.35, 0, 1.3, BRASS, 0.02);
  band(WALL - 0.03, WALL + 0.18, 9.65, 9.95, GOLD, 0.015);
  band(WALL - 0.04, WALL + 0.55, H - 0.9, H, GOLD, 0.02);
  band(WALL - 0.05, WALL + 0.4, H - 1.05, H - 0.9, BRASS, 0.012);
  band(WALL - 0.06, WALL + 0.12, H - 1.4, H - 1.2, glowS(0xff2e88));
  across(WALL - 0.04, WALL + 0.55, H - 0.9, H, GOLD, 0.02);
  across(WALL - 0.05, WALL + 0.4, H - 1.05, H - 0.9, BRASS);
  across(WALL - 0.06, WALL + 0.12, H - 1.4, H - 1.2, glowS(0xff2e88), 0);
  let facadeN = 0;
  for (const e of E) {
    if (e.olen < 6.5) continue;
    const n = Math.floor(e.olen / 6.5);
    for (let q = 0; q < n; q++) {
      const f = (q + 0.5) / n;
      put(makeHallPart('facade_panel' + (facadeN++ % 4)), e.o[0] + (e.o2[0] - e.o[0]) * f, e.o[1] + (e.o2[1] - e.o[1]) * f, 0, Math.atan2(e.nx, e.nz));
    }
  }
  put(makeHallPart('hall_gate'), 0, FRONT_OUT, 0, 0);
  // suit icons (prize counter panels): spots collected here, drawn at the end as one instanced mesh per suit
  const suitMats = ['♠', '♥', '♦', '♣'].map((s, i) => new THREE.MeshBasicMaterial({
    transparent: true,
    map: canvasTex(128, 128, (x) => {
      x.font = '110px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.strokeText(s, 64, 70);
      x.fillStyle = i % 3 ? '#ff2a4a' : '#fff4e0'; x.fillText(s, 64, 70);
    }),
  }));
  const suitGeo = new THREE.PlaneGeometry(4, 4);
  const suitSpots = [[], [], [], []];
  const suitAt = (i, x, z, yaw, y = H * 0.8, size = 4) => suitSpots[i % 4].push({ x, y, z, yaw, size });
  // marquee canopy over the open doors
  const CAN = FRONT_OUT + 1.6 + 3.5, CANY = 9.0;       // middle z and height (1.6 m clear of the door frame)
  put(mesh(new THREE.BoxGeometry(16, 0.8, 7), toon(0xff2e88), 0.1), 0, CAN, CANY);
  for (const sx of [-1, 1]) put(mesh(new THREE.CylinderGeometry(0.3, 0.3, CANY, 8), toon(0xffd23f), 0.06), sx * 7.6, CAN + 2.9, CANY / 2);
  const bulbMats = [glow(0xfff6a8), glow(0xfff6a8), glow(0xfff6a8)];
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  let k = 0;
  const bulb = (x, z, y) => put(new THREE.Mesh(bulbGeo, bulbMats[k++ % 3]), x, z, y);
  const edgeM = toon(0xffd23f);
  const slotsSignM = new THREE.MeshBasicMaterial({ map: neonTex('SLOTS', { w: 512, h: 160, color: '#ffd23f', edge: '#ff2e88' }) });
  for (let i = 0; i <= 18; i++) bulb(-8 + i * (16 / 18), CAN + 3.55, CANY - 0.4);
  for (const sx of [-1, 1]) for (let i = 1; i <= 8; i++) bulb(sx * 8.05, CAN + 3.5 - i * (7 / 8), CANY - 0.4);
  // chase bulbs on the roof edge: coarse spheres, they're 17 m up; each sunk 6 cm into the gold edge's top (H + 1.7)
  const edgeBulbGeo = new THREE.SphereGeometry(0.28, 6, 4);
  const edgeBulb = (x, z, y) => put(new THREE.Mesh(edgeBulbGeo, bulbMats[k++ % 3]), x, z, y);
  for (let i = 0; i < PB.length; i++) {
    const a = PB[i], b = PB[(i + 1) % PB.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.3));
    for (let q = 0; q < n; q++) edgeBulb(a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n, H + 1.92);
  }
  // red carpet + velvet ropes outside, and on inside up to the games
  const ASPH = 0.1; // asphalt thickness
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6, 65.6), toon(0xd7263d));   // all the way to the plaza
  carpet.rotation.x = -Math.PI / 2;
  put(carpet, 0, FRONT_OUT + 32.8, ASPH + 0.03); // on the court's asphalt and walkway paving, same height (settlements.js dressCasinoLot)
  // through the doors: a sloped strip over the wall thickness, from the runner inside (y 0.08) to the carpet outside
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(6, FRONT_OUT - HALL.FRONT, 1, 1), toon(0xd7263d));
  { const pos = sill.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getY(i) < 0 ? 0.05 : 0); pos.needsUpdate = true; sill.geometry.computeVertexNormals(); }
  sill.rotation.x = -Math.PI / 2;
  put(sill, 0, (HALL.FRONT + FRONT_OUT) / 2, 0.08);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) put(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6), toon(0xffd23f), 0.04), sx * 3.6, FRONT_OUT + 3 + i * 5.5, ASPH + 0.7);   // first 17 m, to the carousels' far edge
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 16.5, 5).rotateX(Math.PI / 2), toon(0x8a1030)), sx * 3.6, FRONT_OUT + 3 + 8.25, ASPH + 1.1);
  }

  // tumbling die on a pedestal, west court
  put(mesh(new THREE.CylinderGeometry(4, 4.8, 3, 16), toon(0xff2e88), 0.12), -34, 7, 1.5);
  col({ type: 'cyl', x: -34, z: 7, y0: -2, y1: 3, r: 4.8 });
  const dieMats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshToonMaterial({ map: pipTex(n), gradientMap: toon(0).gradientMap }));
  const die = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), dieMats);
  ink(die, 0.2);
  put(die, -34, 7, 10, 0, true);
  col({ type: 'sphere', x: -34, y: 10, z: 7, r: 5 });

  // upright roulette wheel, east court
  for (const sx of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(1.2, 13, 1.2), toon(0xffd23f), 0.08);
    leg.rotation.z = sx * 0.28;
    put(leg, 34 + sx * 3, 7, 6);
  }
  col({ type: 'box', x: 34, y: 5, z: 7, hx: 5, hy: 5, hz: 1 });
  const face = new THREE.MeshBasicMaterial({ map: wheelTex() });
  const wheel = new THREE.Group();
  const wheelDisc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.4, 48), [toon(0x5a1a8f), face, face]);
  wheelDisc.rotation.x = Math.PI / 2;
  ink(wheelDisc, 0.2);
  wheel.add(wheelDisc);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.45, 8, 48), toon(0xffd23f)));
  put(wheel, 34, 7, 12.5, 0, true);
  const pointer = mesh(new THREE.ConeGeometry(1, 2.4, 4), toon(0xfff4e0), 0.08);
  pointer.rotation.x = Math.PI;
  put(pointer, 34, 7.9, 22.6);
  col({ type: 'box', x: 34, y: 12.5, z: 7, hx: 9.5, hy: 9.5, hz: 1 });

  // slot carousels either side of the carpet: seven cabinets facing out round a pillar with a spinning SLOTS topper,
  // under a bulb-ringed canopy, a stool at each
  const cols = [0xff2e88, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff, 0xffd23f, 0x4d7cff];
  const cabinets = [], toppers = [], yardSpots = [];
  const CAR_R = 3.6, STAND_R = 6.2, CAR_N = 7;
  let n = 0;
  for (const sx of [-1, 1]) {
    const cx = sx * 19.5, cz = FRONT_OUT + 11.6;   // z 28: clear of the court's wings behind
    put(mesh(new THREE.CylinderGeometry(7.4, 7.6, 0.3, 32), toon(0x2a1450), 0.06), cx, cz, 0.15);
    put(new THREE.Mesh(new THREE.TorusGeometry(7.3, 0.12, 6, 40).rotateX(Math.PI / 2), glow(sx < 0 ? 0xff2e88 : 0x2ee6ff)), cx, cz, 0.33);
    put(mesh(new THREE.CylinderGeometry(1.4, 1.6, 7.5, 16), toon(0x5a1a8f), 0.08), cx, cz, 3.75);
    for (const y of [1.5, 3.5, 5.5]) put(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 6, 20).rotateX(Math.PI / 2), glow(0xffd23f)), cx, cz, y);
    // canopy and chase bulbs
    const canopy = mesh(new THREE.CylinderGeometry(6.6, 6.9, 0.6, 32), toon(0xff2e88), 0.08);
    put(canopy, cx, cz, 7.6);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; bulb(cx + Math.cos(a) * 6.95, cz + Math.sin(a) * 6.95, 7.6); }
    const topper = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 0.3), [edgeM, edgeM, edgeM, edgeM, slotsSignM, slotsSignM]);
    ink(topper, 0.06);
    put(topper, cx, cz, 9.4, 0, true);
    put(mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.85, 10), edgeM, 0.04), cx, cz, 8.2);   // spindle from the canopy (top 7.9) into the topper (bottom 8.6), thinner than the sign
    toppers.push(topper);
    col({ type: 'cyl', x: cx, z: cz, y0: -1, y1: 8, r: CAR_R + 1.2 });   // cabinet fronts reach 4.7 m
    for (let k2 = 0; k2 < CAR_N; k2++) {
      const a = (k2 / CAR_N) * Math.PI * 2 + (sx < 0 ? 0.3 : 0);
      const ox = Math.cos(a), oz = Math.sin(a);
      const yaw = Math.atan2(ox, oz); // front (+z) faces out
      const cab = slotCabinet(cols[n % cols.length], n);
      placeSlot(cab, cx + ox * CAR_R, cz + oz * CAR_R, yaw, true);
      cabinets.push(cab);
      put(mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.9, 10), toon(0xd7263d), 0.04), cx + ox * (CAR_R + 1.65), cz + oz * (CAR_R + 1.65), 0.45);
      // patron's play spot, and a clear waypoint further out
      yardSpots.push({ kind: 'slot', cab, x: cx + ox * STAND_R, z: cz + oz * STAND_R, yaw: yaw + Math.PI, ax: cx + ox * (STAND_R + 2.4), az: cz + oz * (STAND_R + 2.4), busy: false });
      n++;
    }
  }
  // gawping spots: round the die, before the wheel, by the chip towers, chatting by the doors
  const CHIPS = [[-11, FRONT_OUT + 4.2], [11, FRONT_OUT + 4.2], [-49, 64], [49, 64]];   // a pair by the doors, one per court wing corner
  for (let i = 0; i < 3; i++) { const a = 0.5 + i * 0.55; yardSpots.push({ kind: 'watch', x: -34 + Math.cos(a) * 8, z: 7 + Math.sin(a) * 8, look: [-34, 7], busy: false }); }
  for (let i = 0; i < 3; i++) yardSpots.push({ kind: 'watch', x: 30 + i * 4, z: 16, look: [34, 7], busy: false });
  for (const [x, z] of CHIPS) yardSpots.push({ kind: 'watch', x: x * 0.85, z: z + 3, look: [x, z], busy: false });
  for (const [x, z] of [[-4.6, FRONT_OUT + 5], [4.6, FRONT_OUT + 7], [-4.6, FRONT_OUT + 23], [4.6, FRONT_OUT + 25]]) yardSpots.push({ kind: 'chat', x, z, look: [0, z], busy: false });
  for (const sp of yardSpots) if (sp.ax === undefined) { sp.ax = sp.x; sp.az = sp.z; }
  for (const sp of yardSpots) if (sp.look) sp.yaw = Math.atan2(sp.look[0] - sp.x, sp.look[1] - sp.z);
  // patrons wander game to game
  const patrons = [];
  const suitCols = [0x16121f, 0xffc83a, 0xff7ad9, 0x2ee6ff, 0x7dff6a, 0xc77dff, 0xff9f1c, 0xfff4e0];
  for (let i = 0; i < 12; i++) {
    const f = makeFigure({ suit: suitCols[i % suitCols.length], helmet: 0xfff4e0, visor: [0xff2e88, 0x2ee6ff, 0xffd23f][i % 3], seed: 900 + i });
    const free = yardSpots.filter((sp) => !sp.busy);
    const sp = free[(i * 7) % free.length];
    sp.busy = true;
    f.root.position.set(sp.x, 0, sp.z);
    f.root.rotation.y = sp.yaw;
    loc.group.add(f.root);
    patrons.push({ ...f, spot: sp, path: [], stay: 3 + ((i * 1.7) % 9), phase: i, pull: 0 });
  }
  // bouncer (build_casino.py): buff alien in a tux, arms crossed; breathes and watches people go in
  const bouncer = makeBouncer();
  bouncer.root.scale.setScalar(0.94);
  put(bouncer.root, 7.6, FRONT_OUT + 1.6, 0, 0, true); // no collider: people here are walked through

  // chip stacks out front
  const chipCols = [0xff2a4a, 0x2ee6ff, 0x111111, 0x7dff6a, 0xffd23f];
  CHIPS.forEach(([x, z], i) => {
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
    put(pivot, sx * 30, CZ, H + 2, sx, true);
    put(mesh(new THREE.CylinderGeometry(1, 1.3, 1.2, 10), toon(0x3a3550), 0.06), sx * 30, CZ, H + 2);
    beams.push(pivot);
  }

  // ================= INTERIOR =================
  const floorMat = new THREE.MeshToonMaterial({ map: carpetTex(), gradientMap: toon(0).gradientMap });
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(flat2(IN, true), 24).rotateX(-Math.PI / 2), floorMat);
  floor.receiveShadow = true;
  put(floor, 0, 0, 0.05);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(6, 18), toon(0xd7263d));   // as wide as the carpet outside
  runner.rotation.x = -Math.PI / 2;
  put(runner, 0, FRONT - 9, 0.08);
  // the wall (rings via `band`): damask field, brass skirting, wainscot girdle over a cyan line, gold cornice with pink
  // neon, brass crown; then a hall-kit bay (half pilasters, suit panels, arched panel) per bay of each long run
  band(0.02, -0.04, 0, H - 0.02, toon(0x45207a));
  band(0.03, -0.16, 0, 0.25, BRASS, 0.01, 0.015);            // (last argument: each ring ends at its own distance from the jambs)
  band(0.04, -0.14, 1.84, 1.99, GOLD, 0.01, 0.02);
  band(0.04, -0.10, 1.756, 1.826, bandMats[1], 0, 0.025);   // 7 cm, between the wainscot top (1.75) and the girdle
  band(0.05, -0.55, 13.12, 13.55, GOLD, 0.012, 0.03);
  band(-0.45, -0.52, 13.06, 13.12, bandMats[0]);
  band(0.06, -0.28, 15.4, 15.95, BRASS, 0.01, 0.035);
  band(-0.02, -0.42, 0.05, 0.09, BRASS, 0, 0.04);         // floor border inlay
  // things against the wall, as plan rectangles: no bay where one overlaps (they cover the wall behind)
  const clX = CLASSIC.xs.reduce((a, b) => a + b) / CLASSIC.xs.length;
  const wallItems = [];
  {
    const R = (x0, x1, z0, z1) => wallItems.push({ x0, x1, z0, z1 });
    R(CLAW.x - 8.4, CLAW.x + 8.4, CLAW.z - 5.4, CLAW.z + 0.2);
    R(PLK.x - 8.2, PLK.x + 8.2, PLK.wallZ - 0.2, PLK.wallZ + 3);
    const bc = [[-3.8, -2], [3.8, -2], [-3.8, 4.7], [3.8, 4.7]].map(([a, b]) => bjPt(a, 0, b));
    R(Math.min(...bc.map((c) => c[0])) - 0.3, Math.max(...bc.map((c) => c[0])) + 0.3, Math.min(...bc.map((c) => c[2])) - 0.3, Math.max(...bc.map((c) => c[2])) + 0.3);
    R(PRIZE.wallX - 4.8, PRIZE.wallX + 0.2, PRIZE.z - 4.3, PRIZE.z + 4.3);
    R((DUCK.x0 + DUCK.x1) / 2 - 8.7, (DUCK.x0 + DUCK.x1) / 2 + 8.7, DUCK.wallZ - 0.2, DUCK.wallZ + 1.0);
    R(clX - 6.5, clX + 6.5, CLASSIC.wallZ - 0.5, CLASSIC.wallZ + 0.2);
  }
  const onItem = (x, z) => wallItems.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  const turnAt = (i) => {      // outline turn at vertex i (radians)
    const a = IN[(i + IN.length - 1) % IN.length], v = IN[i], b = IN[(i + 1) % IN.length];
    const d1 = [v[0] - a[0], v[1] - a[1]], d2 = [b[0] - v[0], b[1] - v[1]];
    return Math.acos(Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / (Math.hypot(...d1) * Math.hypot(...d2)))));
  };
  let bayN = 0;
  for (const e of E) {
    const jamb = (i) => Math.abs(IN[i][0]) === DOOR && IN[i][1] === FRONT;
    const m0 = jamb(e.i) || turnAt(e.i) > 0.5 ? 0.35 : 0, m1 = jamb((e.i + 1) % IN.length) || turnAt((e.i + 1) % IN.length) > 0.5 ? 0.35 : 0;     // clear of hard corners so half pilasters never meet
    const L = e.len - m0 - m1;
    const yaw = Math.atan2(-e.nx, -e.nz);
    const at = (t, d = 0) => [e.p[0] + e.ux * t - e.nx * d, e.p[1] + e.uz * t - e.nz * d];
    if (L < 3.4) {        // too short for a bay: wainscot only
      if (L < 0.5) continue;
      const f = makeHallPart('hall_filler'), [x, z] = at(m0 + L / 2);
      f.scale.x = L;
      put(f, x, z, 0, yaw);
      continue;
    }
    const n = Math.max(1, Math.round(L / 4.5)), bw = L / n;
    for (let q = 0; q < n; q++) {
      const t0 = m0 + q * bw;
      let hit = false;
      for (let t = t0; t <= t0 + bw + 1e-6 && !hit; t += 0.6) hit = onItem(...at(t, 0.2));
      if (hit) continue;
      const b = makeHallPart('hall_bay' + (bayN++ % 4)), [x, z] = at(t0 + bw / 2);
      b.scale.x = bw / 4.5;
      put(b, x, z, 0, yaw);
    }
  }
  // ceiling with coffer tiles: 4.5 m grid from the crossing, checkerboard (diagonal rows), where a tile clears the walls
  const ceilM = toon(0x1c0f33); ceilM.side = THREE.DoubleSide;
  const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(flat2(IN, false), 24).rotateX(Math.PI / 2), ceilM);
  put(ceiling, 0, 0, H - 0.02);
  for (let i = -13; i <= 13; i++) for (let j = -13; j <= 13; j++) {
    const x = HCX + 4.5 * i, z = CZ + 4.5 * j;
    if ((i + j) % 2 === 0 && inHall(x, z, 2.3)) put(makeHallPart('hall_coffer'), x, z, H - 0.03);
  }
  // crossing: floor medallion and the Chip Bar (its chip turns)
  put(makeHallPart('hall_medallion'), HCX, CZ, 0.05);
  const bar = makeHallPart('hall_bar'), barSpin = bar.getObjectByName('bar_spin');
  bar.remove(barSpin);
  put(bar, HCX, CZ, 0.05);
  put(barSpin, HCX, CZ, 0.05 + barSpin.position.y, 0, true);
  col({ type: 'cyl', x: HCX, z: CZ, y0: -1, y1: 4.4, r: 4.7 });
  // lounges at the wings' far ends: banquettes and a small table
  const lounge = (sofas, table) => {
    for (const [x, z, yaw] of sofas) {
      put(makeHallPart('hall_sofa'), x, z, 0, yaw);
      col({ type: 'box', x: x + Math.sin(yaw) * 0.45, y: 0.5, z: z + Math.cos(yaw) * 0.45, hx: yaw === 0 ? 1.8 : 0.45, hy: 0.5, hz: yaw === 0 ? 0.45 : 1.8 });
    }
    put(makeHallPart('hall_table'), table[0], table[1], 0);
    col({ type: 'cyl', x: table[0], z: table[1], y0: -1, y1: 0.7, r: 0.5 });
  };
  const WZ = DUCK.wallZ;
  lounge([[-51.8, WZ + 0.02, 0]], [-51.8, WZ + 2.2]);
  lounge([[52.3, WZ + 0.02, 0], [HALL.WING.x1 - 0.02, WZ + 2.7, -Math.PI / 2]], [52.4, WZ + 2.6]);
  // chandeliers (build_casino.py): rose and chain frozen, crystal tiers turn
  const chandeliers = [];
  for (const [x, z] of [[0, 6], [-32, CZ], [33, CZ]]) {
    const ch = makeChandelier();
    ch.root.remove(ch.spin);
    put(ch.root, x, z, H - 3.3);
    put(ch.spin, x, z, H - 3.3, 0, true);
    chandeliers.push(ch.spin);
  }
  // ---------- BLACKJACK TABLE (build_blackjack.py) ----------
  // `bjStat`: the frozen table; `bj`: moving parts (dealer, and the cards and chips casinoGames.js lays)
  const bj = new THREE.Group();
  const R = BJ.R;
  const bjStat = blackjackTable();
  const dealer = makeFigure({ suit: 0x16121f, helmet: 0xfff4e0, visor: 0xffd23f, scale: 1.05 });
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), glow(0xd7263d));
  bow.position.set(0, 1.62, 0.33);
  dealer.root.add(bow);
  dealer.root.position.set(0, 0, -0.9);
  bj.add(dealer.root);
  put(bjStat, BJ.x, BJ.z, 0, BJ.yaw);
  put(bj, BJ.x, BJ.z, 0, BJ.yaw, true);
  // table, and the dealer's station (so you can't walk behind the dealer)
  const [tx, , tz] = bjPt(0, 0, R / 2), [dx, , dz] = bjPt(0, 0, -1.05);
  col({ type: 'box', x: tx, y: 0.7, z: tz, hx: R + 0.2, hy: 0.7, hz: R / 2 + 0.2, yaw: BJ.yaw });
  col({ type: 'box', x: dx, y: 0.7, z: dz, hx: R + 0.2, hy: 0.7, hz: 0.95, yaw: BJ.yaw });
  // BLACKJACK sign on the wall over the dealer's counter
  {
    const sg = makeCasinoSign('wall_sign');
    const bjSign = new THREE.Mesh(new THREE.PlaneGeometry(sg.face.w, sg.face.h), new THREE.MeshBasicMaterial({ map: neonTex('BLACKJACK', { color: '#7dff6a', edge: '#ffd23f', sub: 'PAYS 3 TO 2 · {F} AT THE STOOL TO PLAY' }) }));
    bjSign.position.copy(sg.face.pos);
    sg.root.add(bjSign);
    put(sg.root, BJ.x, BJ.z - 2.04 + 0.06, 5.0, 0); // on the wallpaper panel, facing +z, above the neon band
    padSign(bjSign, 'BLACKJACK', { color: '#7dff6a', edge: '#ffd23f', sub: 'PAYS 3 TO 2 · {F} AT THE STOOL TO PLAY' });
  }

  // ---------- ZERO-G CLAW (build_claw.py): glass tank on the west wing's south wall ----------
  // `cm.stat`: frozen machine (glass kept); `clawDyn`: where casinoGames.js hangs the moving parts and boards.
  const cm = makeClawMachine();
  put(cm.stat, CLAW.x, CLAW.z, 0, CLAW.yaw);
  const clawDyn = new THREE.Group();
  put(clawDyn, CLAW.x, CLAW.z, 0, CLAW.yaw, true);
  col({ type: 'box', x: CLAW.x, y: 3.3, z: CLAW.z - 2.7, hx: 8.3, hy: 3.3, hz: 2.75 });
  // patron watch spots
  for (const dx of [-4.8, 3.6, 7.2]) yardSpots.push({ kind: 'watch', x: CLAW.x + dx, z: CLAW.z - 7.4, ax: CLAW.x + dx, az: CLAW.z - 7.4, look: [CLAW.x + dx, CLAW.z - 3], yaw: Math.PI, busy: false });

  // ---------- DUCK DERBY (build_duck.py): basin with lane floats, start gate, finish arch with photo-finish camera, odds
  // board frame, kiosk, roped rail. The game adds the pictures: water, lane numbers, finish line, banner, board, screen. ----------
  const L0 = DUCK.x0 - 2, L1 = DUCK.x1 + 2;
  const tlen = L1 - L0, tcx = (L0 + L1) / 2;
  const lz0 = DUCK.lanes[0] + 0.95, lz1 = DUCK.lanes[3] - 0.95, tcz = (lz0 + lz1) / 2, tdep = lz0 - lz1;
  const trough = makeDerbyPart('dd_trough');
  put(trough, tcx, tcz, 0);
  col({ type: 'box', x: tcx, y: 1.1, z: tcz, hx: tlen / 2 + 0.3, hy: 1.1, hz: tdep / 2 + 0.6 });
  const water = waterTex();
  const waterMat = new THREE.MeshBasicMaterial({ map: water });
  const laneCols = [0xffd23f, 0xff2e88, 0x2ee6ff, 0x7dff6a];
  const flat = (geo, mat, p) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; put(m, tcx + p.x, tcz + p.z, p.y); return m; };
  laneCols.forEach((c, i) => {
    const wp = trough.getObjectByName('water' + (i + 1)), np = trough.getObjectByName('num' + (i + 1));
    flat(new THREE.PlaneGeometry(wp.userData.w, wp.userData.h), waterMat, wp.position);
    flat(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (x) => {
      disc(x, 32, 32, 30, hex(c));
      x.fillStyle = '#120a1e'; x.font = FONT(44); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 32, 35);
    }) }), np.position);
  });
  const checker = new THREE.MeshBasicMaterial({ map: checkerTex(), side: THREE.DoubleSide });
  const fl = trough.getObjectByName('finishLine');
  flat(new THREE.PlaneGeometry(fl.userData.w, fl.userData.h), new THREE.MeshBasicMaterial({ map: finishTex() }), fl.position);
  // rails: a post every 3.5 m along both long sides, rope between
  for (const railZ of [lz0 + 0.55, lz1 - 0.55]) {
    for (let x = L0, k = 0; k <= 8; x += 3.5, k++) {
      put(makeDerbyPart('dd_railpost'), x, railZ, 0);
      if (k < 8) put(makeDerbyPart('dd_rope'), x, railZ, 0);
    }
  }
  // start gate: the grille lifts; three countdown lamps (a lit disc each side of each lens)
  const gate = makeDerbyPart('dd_grille');
  put(gate, DUCK.x0 - 0.9, tcz, 1.35, 0, true);
  const gateFrame = makeDerbyPart('dd_gate');
  put(gateFrame, DUCK.x0 - 0.9, tcz, 0);
  const lamps = [0xff2a4a, 0xff9f1c, 0x7dff6a].map((c, k) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.22) });
    const lp = gateFrame.getObjectByName('lamp' + (k + 1));
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 14), mat);
      d.rotation.z = Math.PI / 2;
      put(d, DUCK.x0 - 0.9 + sx * lp.position.x, tcz + lp.position.z, lp.position.y, 0, true);
    }
    return { mat, color: new THREE.Color(c) };
  });
  const startPlate = gateFrame.getObjectByName('startSign');
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(startPlate.userData.w, startPlate.userData.h), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (x, pw, ph) => {
      x.fillStyle = '#120a1e'; x.fillRect(0, 0, pw, ph); x.fillStyle = '#ffd23f'; x.font = FONT(40); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('START', pw / 2, ph / 2 + 2);
    }) }));
    put(sp, DUCK.x0 - 0.9 + sx * (startPlate.position.x + 0.012), tcz + startPlate.position.z, startPlate.position.y, sx * Math.PI / 2);   // faces along the track
  }
  // finish arch and its checker banner
  const arch = makeDerbyPart('dd_finish');
  put(arch, DUCK.x1, tcz, 0);
  const bn = arch.getObjectByName('banner');
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bn.userData.w, bn.userData.h), checker);
  put(banner, DUCK.x1, tcz, bn.position.y, Math.PI / 2);   // across the lanes
  const ducks = laneCols.map((c, i) => {
    const d = makeDuck(c, i === 0 ? 0xff5a1f : 0xff9f1c, i + 1);
    put(d.root, DUCK.x0, DUCK.lanes[i], DUCK.water - 0.25, 0, true);
    return d;
  });
  // odds board on the back wall: frame (model faces +x, turned to the hall) and the painted plane
  const oddsCanvas = document.createElement('canvas');
  oddsCanvas.width = 1024; oddsCanvas.height = 384;
  const oddsTex = new THREE.CanvasTexture(oddsCanvas);
  oddsTex.colorSpace = THREE.SRGBColorSpace;
  const board = makeDerbyPart('dd_board');
  put(board, tcx, DUCK.wallZ, 7.0, -Math.PI / 2);
  const oddsFace = board.getObjectByName('face');
  // polygon offset: in front of the frame's face (no z-fighting)
  const oddsBoard = new THREE.Mesh(new THREE.PlaneGeometry(oddsFace.userData.w, oddsFace.userData.h), new THREE.MeshBasicMaterial({ map: oddsTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  put(oddsBoard, tcx, DUCK.wallZ + oddsFace.position.x, 7.0);
  // betting kiosk: screen, and a button per duck colour
  const kiosk = makeDerbyPart('dd_kiosk');
  const ksp = kiosk.getObjectByName('screen');
  const kscr = new THREE.Mesh(new THREE.PlaneGeometry(ksp.userData.w, ksp.userData.h), new THREE.MeshBasicMaterial({ map: neonTex('DUCK DERBY', { w: 512, h: 256, color: '#ffd23f', edge: '#2ee6ff', sub: '{F} · PICK A DUCK' }) }));
  padSign(kscr, 'DUCK DERBY', { w: 512, h: 256, color: '#ffd23f', edge: '#2ee6ff', sub: '{F} · PICK A DUCK' });
  kscr.position.copy(ksp.position);
  kscr.position.z += 0.02;
  kiosk.add(kscr);
  put(kiosk, DUCK.kiosk[0], DUCK.kiosk[1], 0, 0);
  col({ type: 'box', x: DUCK.kiosk[0], y: 0.9, z: DUCK.kiosk[1] - 0.1, hx: 1.5, hy: 0.9, hz: 0.85 });

  // ---------- PLINKO ----------
  const P = PLK;
  const bw = SLOTS * SPACING + 2.4, bh = DROP_Y + 2.4;
  put(mesh(new THREE.BoxGeometry(bw, bh, 0.5), toon(0x1a0f2e), 0.1), P.x, P.z - 0.45, P.y + bh / 2 - 0.9);
  // frame tying the board to the wall: plinth, pillars, cornice, sign backing (build_plinko.py)
  const plkFrame = plinkoFrameModel();
  if (plkFrame) put(plkFrame, P.x, P.z, 0);
  col({ type: 'box', x: P.x, y: 6.9, z: P.z - 0.675, hx: bw / 2 + 0.95, hy: 6.9, hz: 1.375 });
  // header
  const plkSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neonTex('PLINKO', { color: '#2ee6ff', edge: '#ffd23f', sub: 'UP TO 50× · REAL MOON PHYSICS' }) }));
  put(plkSign, P.x, P.z - 0.1, P.y + bh + 0.4); // sits on the frame's sign backing
  // pegs: instanced, per-peg colour so hits flash
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
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, s.divider ? 0.1 : 0.14, s.divider ? 0.56 : 0.6), glow(s.divider ? 0xfff4e0 : 0x2ee6ff));   // dividers 2 cm inside the rails' faces
    bar.rotation.z = Math.atan2(s.by - s.ay, s.bx - s.ax);
    bar.position.set(P.x + (s.ax + s.bx) / 2, P.y + (s.ay + s.by) / 2, P.z);
    bar.updateMatrix();
    bar.matrixAutoUpdate = false;
    loc.group.add(bar);
  }
  // slots: back panels that light up, multiplier underneath
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
  // aim ball and arrow on top of the chute
  const aim = new THREE.Group();
  const aimBall = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), glow(0xffd23f));
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), glow(0xff2e88));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 0.7;
  aim.add(aimBall, arrow);
  put(aim, P.x, P.z + 0.1, P.y + DROP_Y, 0, true);
  // player booth, prize-counter style (build_plinko.py)
  const con = plinkoConsoleModel();
  if (con) put(con, P.x, P.z + 6, 0);
  col({ type: 'box', x: P.x, y: 0.7, z: P.z + 6, hx: 1.8, hy: 0.7, hz: 0.7 });

  // ---------- CLASSIC GAMES row on the west wing's south wall + prize counter ----------
  CLASSIC.xs.forEach((x, i) => {
    placeSlot(slotCabinet([0xc77dff, 0x2ee6ff, 0xff9f1c, 0x7dff6a][i], [0, 3, 1, 5][i]), x, CLASSIC.z, CLASSIC.yaw, false);
    const c = Math.cos(CLASSIC.yaw), sn = Math.sin(CLASSIC.yaw), lx = 0.2, lz = 0.1;   // box off-centre: lever side is local +x
    col({ type: 'box', x: x + lx * c + lz * sn, y: 2.2, z: CLASSIC.z - lx * sn + lz * c, hx: 1.3, hy: 2.2, hz: 0.85, yaw: CLASSIC.yaw });
  });
  const clSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: neonTex('CLASSIC GAMES', { color: '#ff7ad9', edge: '#7dff6a', sub: 'SLOTS · ROULETTE · PRIZE WHEEL · HIGH-LOW' }) }));
  put(clSign, clX, CLASSIC.wallZ - 0.15, 8.2, Math.PI);
  const vinnie = makeFigure({ suit: 0x1f8a4a, helmet: 0x7dff6a, visor: 0xffd23f, scale: 1.1 });
  put(vinnie.root, CLASSIC.xs[3] + 3.2, CLASSIC.z - 1.4, 0, Math.PI / 2 - 0.4);
  const vin = nameTag(textSprite('VINNIE "THE VISOR" · PIT BOSS', { color: '#7dff6a', size: 44, scale: 0.22, bg: '#120a1e' }), 'VINNIE "THE VISOR" · PIT BOSS', '#7dff6a');
  vin.position.set(CLASSIC.xs[3] + 3.2, 3.4, CLASSIC.z - 1.4);
  loc.group.add(vin);
  // ---------- prize counter: gold booth on the foyer's east wall; display case, till, pennant header, lit prize wall.
  // Booth frame: pcPut(o, lx, y, lz), lx along the counter, lz from its back toward the player (faces -x). One collider. ----------
  const pcPut = (o, lx, y, lz, yaw = 0, dyn = false) => put(o, PRIZE.x - lz, PRIZE.z + lx, y, yaw - Math.PI / 2, dyn);
  const pcBox = (sx, sy, sz, mat, lx, y, lz, ol = 0.03) => pcPut(mesh(new THREE.BoxGeometry(sx, sy, sz), mat, ol), lx, y, lz);
  const pcGlow = (sx, sy, sz, color, lx, y, lz) => pcPut(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), glowS(color)), lx, y, lz);
  const PCL = 7.2; // counter (and collider) length
  const pm = {
    gold: toon(0xffd23f), brass: toon(0xc79a1f), plum: toon(0x3b0f4f), dark: toon(0x1a1030), pink: toon(0xff2e88), white: toon(0xfff4e0),
    red: toon(0xd7263d), green: toon(0x7dff6a), cyan: toon(0x2ee6ff), steel: toon(0xc9c3d9), felt: toon(0x5a1a8f),
  };
  const prizeSpin = []; // prizes that turn on their stands

  // prize models (~0.5 m tall, on y = 0) for the case and the wall
  const PRIZES_3D = ['trophy', 'rocket', 'crown', 'mite', 'duck', 'gem', 'helmet', 'hover', 'star', 'disco', 'rock'];
  const prize = (kind) => {
    const g = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0, ol = 0.02) => { const m = mesh(geo, mat, ol); m.position.set(x, y, z); g.add(m); return m; };
    if (kind === 'trophy') {
      add(new THREE.BoxGeometry(0.3, 0.06, 0.3), pm.felt, 0, 0.03, 0);
      add(new THREE.CylinderGeometry(0.035, 0.05, 0.18, 8), pm.gold, 0, 0.15, 0);
      add(new THREE.CylinderGeometry(0.2, 0.09, 0.26, 12), pm.gold, 0, 0.37, 0);
      for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.07, 0.022, 6, 12), pm.gold, sx * 0.22, 0.38, 0, 0.01);
    } else if (kind === 'rocket') {
      add(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 10), pm.felt, 0, 0.025, 0);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.38, 10), pm.white, 0, 0.24, 0);
      add(new THREE.ConeGeometry(0.1, 0.2, 10), pm.red, 0, 0.53, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        add(new THREE.BoxGeometry(0.02, 0.14, 0.12), pm.red, Math.cos(a) * 0.12, 0.14, Math.sin(a) * 0.12, 0.01).rotation.y = Math.PI / 2 - a;
      }
      add(new THREE.SphereGeometry(0.045, 8, 6), glowS(0x2ee6ff), 0, 0.32, 0.095, 0);
    } else if (kind === 'crown') {
      add(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 12), pm.pink, 0, 0.05, 0);
      add(new THREE.CylinderGeometry(0.2, 0.17, 0.12, 12), pm.gold, 0, 0.16, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, cx = Math.cos(a) * 0.17, cz = Math.sin(a) * 0.17;
        add(new THREE.ConeGeometry(0.05, 0.16, 6), pm.gold, cx, 0.3, cz, 0.01);
        add(new THREE.SphereGeometry(0.03, 6, 5), glowS(i % 2 ? 0xff2a4a : 0x2ee6ff), cx, 0.4, cz, 0);
      }
    } else if (kind === 'mite') { // a moon-mite plush
      add(new THREE.SphereGeometry(0.2, 12, 10), pm.green, 0, 0.19, 0, 0.025).scale.set(1.1, 0.9, 1);
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.05, 8, 6), pm.white, sx * 0.08, 0.26, 0.17, 0.01);
        add(new THREE.SphereGeometry(0.025, 6, 5), pm.dark, sx * 0.08, 0.26, 0.215, 0);
        add(new THREE.CylinderGeometry(0.01, 0.01, 0.17, 5), pm.dark, sx * 0.07, 0.43, 0, 0).rotation.z = -sx * 0.35;
        add(new THREE.SphereGeometry(0.03, 6, 5), glowS(0xff2e88), sx * 0.105, 0.5, 0, 0);
      }
    } else if (kind === 'duck') {
      const d = makeDuck(0xffd23f);
      d.root.scale.setScalar(0.32);
      d.root.rotation.y = -Math.PI / 2; // duck faces +x; prizes face +z
      g.add(d.root);
    } else if (kind === 'gem') {
      add(new THREE.CylinderGeometry(0.08, 0.12, 0.06, 10), pm.felt, 0, 0.03, 0);
      add(new THREE.OctahedronGeometry(0.2), pm.cyan, 0, 0.3, 0, 0.02).scale.y = 1.3;
    } else if (kind === 'helmet') {
      add(new THREE.CylinderGeometry(0.09, 0.13, 0.05, 10), pm.felt, 0, 0.025, 0);
      add(new THREE.CylinderGeometry(0.15, 0.17, 0.05, 10), pm.steel, 0, 0.09, 0, 0.01);
      add(new THREE.SphereGeometry(0.2, 14, 10), pm.white, 0, 0.26, 0, 0.025).scale.y = 0.95;
      add(new THREE.SphereGeometry(0.15, 10, 8), glowS(0xffd23f), 0, 0.27, 0.11, 0).scale.set(1, 0.65, 0.6);
    } else if (kind === 'hover') { // a toy hover-car
      add(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 10), pm.felt, 0, 0.04, 0);
      add(new THREE.BoxGeometry(0.5, 0.1, 0.24), pm.pink, 0, 0.17, 0, 0.02);
      add(new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), pm.cyan, 0.03, 0.22, 0, 0.015);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), glowS(0x2ee6ff), sx * 0.18, 0.115, sz * 0.09, 0);
    } else if (kind === 'star') {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.1 : 0.22;
        if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false });
      geo.translate(0, 0, -0.035);
      add(new THREE.CylinderGeometry(0.03, 0.05, 0.2, 8), pm.brass, 0, 0.1, 0);
      add(geo, pm.gold, 0, 0.42, 0, 0.015);
    } else if (kind === 'disco') {
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6), pm.steel, 0, 0.075, 0, 0);
      add(new THREE.IcosahedronGeometry(0.2, 1), pm.steel, 0, 0.35, 0, 0.02);
    } else { // a certified moon rock on a cushion
      add(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 10), pm.red, 0, 0.04, 0);
      add(new THREE.DodecahedronGeometry(0.17), toon(0x6a5a52), 0, 0.2, 0, 0.02).scale.set(1.2, 0.8, 1);
    }
    return g;
  };
  // a spinning prize is its own draw call, so only the case's gem and star turn; the rest merge
  const stand = (kind, lx, y, lz, spin = false) => {
    const o = prize(kind);
    pcPut(o, lx, y, lz, 0, spin);
    if (spin) prizeSpin.push(o);
  };

  // dais and counter: kick plate, gold body with five suit panels, neon, pink top
  pcBox(PCL + 1.0, 0.08, 5.0, pm.felt, 0, 0.04, -1.1, 0.02);
  pcBox(PCL + 1.04, 0.1, 0.12, pm.gold, 0, 0.05, 1.4, 0.01);   // nosing 2 cm past the dais' ends
  pcBox(PCL, 0.3, 1.5, pm.dark, 0, 0.23, 0);
  pcBox(PCL, 1.1, 1.6, pm.gold, 0, 0.93, 0, 0.06);
  pcBox(PCL + 0.4, 0.16, 1.95, pm.pink, 0, 1.56, 0, 0.04);
  pcBox(PCL + 0.5, 0.06, 0.1, pm.gold, 0, 1.67, 0.9, 0.01);
  pcGlow(PCL - 0.2, 0.06, 0.06, 0xff2e88, 0, 1.44, 0.83);
  pcGlow(PCL - 0.2, 0.05, 0.05, 0x2ee6ff, 0, 0.42, 0.78);
  for (let i = 0; i < 5; i++) {
    const lx = (i - 2) * 1.44;
    pcBox(1.22, 0.84, 0.04, pm.brass, lx, 0.93, 0.8, 0.01);
    pcBox(1.04, 0.68, 0.05, pm.plum, lx, 0.93, 0.81, 0);
    suitAt(i, PRIZE.x - 0.845, PRIZE.z + lx, -Math.PI / 2, 0.93, 0.6);
  }

  // display case: two lit tiers of prizes
  const CX = -0.5;
  pcBox(3.6, 0.12, 0.9, pm.felt, CX, 1.70, 0, 0.02);
  // glass sits 2 cm above the felt top (y 1.76) so the faces don't z-fight
  pcPut(new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.38, 0.8), new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })), CX, 2.47, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pcBox(0.07, 1.44, 0.07, pm.gold, CX + sx * 1.77, 2.46, sz * 0.42, 0.01);
  pcBox(3.65, 0.07, 0.95, pm.gold, CX, 3.2, 0, 0.02);
  pcBox(3.45, 0.04, 0.7, pm.felt, CX, 2.46, 0, 0);
  pcGlow(3.4, 0.04, 0.04, 0xfff6a8, CX, 3.14, 0.4);
  ['trophy', 'rocket', 'crown', 'helmet'].forEach((kind, i) => stand(kind, CX - 1.35 + i * 0.9, 1.76, 0));
  ['duck', 'mite', 'gem', 'star'].forEach((kind, i) => stand(kind, CX - 1.35 + i * 0.9, 2.48, 0, kind === 'gem' || kind === 'star'));

  // till at the clerk's end; bell and chip stacks at the other
  const till = new THREE.Group();
  till.add(mesh(new THREE.BoxGeometry(0.7, 0.34, 0.55), pm.steel, 0.03));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: screenTex('CHIPS', '#16703d') }));
  const screenTilt = new THREE.Group();
  screen.rotation.x = -0.5;
  screenTilt.add(screen);
  screenTilt.position.set(0, 0.34, -0.05);
  till.add(screenTilt);
  [pm.red, pm.green, pm.cyan, pm.gold].forEach((m, i) => { const key = mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), m, 0); key.position.set(-0.24 + i * 0.16, 0.18, 0.17); till.add(key); });
  pcPut(till, -3.05, 1.82, 0);
  const bell = new THREE.Group();
  const bellBase = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 12), pm.dark, 0.01);
  bellBase.position.y = 0.02;
  const bellDome = mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), pm.gold, 0.01);
  bellDome.position.y = 0.04;
  const bellKnob = mesh(new THREE.SphereGeometry(0.03, 6, 5), pm.steel, 0);
  bellKnob.position.y = 0.18;
  bell.add(bellBase, bellDome, bellKnob);
  pcPut(bell, 1.95, 1.64, 0.4);
  [5, 8, 3].forEach((n, i) => {
    for (let s = 0; s < n; s++) pcPut(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), toon(chipCols[(s + i) % chipCols.length]), 0.01), 2.6 + i * 0.36, 1.67 + s * 0.065, 0.25);
  });

  // header: posts, PRIZES board, chase bulbs, pennants
  for (const sx of [-1, 1]) pcPut(mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 8), pm.gold, 0.04), sx * 3.45, 3.14, -0.1);
  pcBox(PCL, 0.9, 0.26, pm.plum, 0, 4.25, -0.1, 0.04);
  pcBox(PCL + 0.1, 0.07, 0.34, pm.gold, 0, 4.72, -0.1, 0.01);   // 2 cm proud of the PRIZES plane, so the flags hang from it
  pcBox(PCL + 0.1, 0.07, 0.34, pm.gold, 0, 3.8, -0.1, 0.01);
  pcPut(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: neonTex('PRIZES', { w: 512, h: 128, color: '#ffd23f', edge: '#ff2e88' }) })), 0, 4.25, 0.05);
  const smallBulb = new THREE.SphereGeometry(0.07, 6, 5);
  for (let i = 0; i <= 22; i++) {
    const lx = -3.45 + i * 0.3;
    put(new THREE.Mesh(smallBulb, bulbMats[k++ % 3]), PRIZE.x - 0.1, PRIZE.z + lx, 4.82);
  }
  const flagGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.17, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0, -0.38)]));
  const flagMats = [0xff2e88, 0x2ee6ff, 0xffd23f, 0x7dff6a].map((c) => toon(c)); // front-facing only
  for (let i = 0; i < 15; i++) pcPut(mesh(flagGeo, flagMats[i % 4], 0), -3.3 + i * 0.47, 3.77, 0.06);

  // prize wall: three lit shelves behind the staff
  pcBox(PCL - 0.2, 3.9, 0.1, pm.plum, 0, 2.0, -2.93, 0.02);
  for (const sx of [-1, 1]) pcBox(0.14, 3.96, 0.6, pm.gold, sx * 3.45, 2.03, -2.65, 0.02);   // tops 6 cm over the back panel's
  [1.5, 2.4, 3.3].forEach((y, row) => {
    pcBox(6.8, 0.07, 0.56, pm.felt, 0, y, -2.62, 0.015);              // ends 2 cm into the gold posts (inner faces at 3.38)
    pcBox(6.84, 0.1, 0.05, pm.gold, 0, y + 0.01, -2.34, 0.01);
    pcGlow(PCL - 0.7, 0.035, 0.035, row % 2 ? 0xff2e88 : 0x2ee6ff, 0, y - 0.07, -2.35);
    for (let i = 0; i < 6; i++) stand(PRIZES_3D[(row * 5 + i * 3) % PRIZES_3D.length], -2.75 + i * 1.1, y + 0.04, -2.62);
  });
  col({ type: 'box', x: PRIZE.x + 1.5, y: 1.5, z: PRIZE.z, hx: 2.4, hy: 1.5, hz: 3.6 });
  suitSpots.forEach((spots, i) => {
    const inst = new THREE.InstancedMesh(suitGeo, suitMats[i], spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    spots.forEach((sp, j) => inst.setMatrixAt(j, m4.compose(at.set(sp.x, sp.y, sp.z), q.setFromAxisAngle(Y, sp.yaw), sc.setScalar(sp.size / 4))));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false; // spread round the building: always one draw
    put(inst, 0, 0);
  });
  const prSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neonTex('PRIZE COUNTER', { color: '#ffd23f', edge: '#ff2e88', sub: 'CHIPS → DRIP' }) }));
  put(prSign, PRIZE.wallX - 0.15, PRIZE.z, 6.5, -Math.PI / 2);
  const clerk = makeFigure({ suit: 0xff7ad9, helmet: 0xfff4e0, visor: 0x2ee6ff });
  put(clerk.root, PRIZE.x + 1.5, PRIZE.z - 1.5, 0, -Math.PI / 2);

  // bobbing spectators
  const crowd = [];
  const spots = [[24, -13, Math.PI], [29, -12.2, Math.PI + 0.3], [38, -13, Math.PI - 0.3], [-36, -13, 0.3], [-20, -10.6, -1], [3, -2, 0.6], [-4.5, -22, 2.5]];
  spots.forEach(([x, z, yaw], i) => {
    const f = makeFigure({ suit: [0xffc83a, 0x2ee6ff, 0xff7ad9, 0x16121f, 0x7dff6a, 0xc77dff, 0xff9f1c][i], helmet: 0xfff4e0, visor: [0xff2e88, 0x241a5c, 0xffd23f][i % 3] });
    put(f.root, x, z, 0, yaw, true); // no collider: skaters would stop dead on them
    crowd.push({ root: f.root, phase: i * 1.7, cheer: 0 });
  });

  loc.group.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(loc.group.quaternion);

  let chase = 0;
  // Patrons walk spot to spot round obstacles (navPath); at a slot they yank the handle every few seconds, elsewhere they
  // watch the attraction and shift about.
  // Nav grid: 1 m cells over the casino and forecourt, blocked within a patron's width of any collider. Built from the
  // world's colliders on first use (the forecourt's are laid after this runs). A* gives the way, pulled straight where clear.
  let nav = null;
  const NAV = { x0: -72, z0: -48, nx: 144, nz: 160, r: 0.95 };   // r: patron radius plus half a cell diagonal
  const free = (i, j) => i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz && !nav.blocked[j * NAV.nx + i];
  function buildNav() {
    const { x0, z0, nx, nz, r } = NAV, blocked = new Uint8Array(nx * nz);
    const qi = loc.group.quaternion.clone().invert(), tmp = new THREE.Vector3();
    const mark = (bx0, bx1, bz0, bz1, inside) => {
      for (let j = Math.max(0, Math.floor(bz0 - z0)); j <= Math.min(nz - 1, Math.floor(bz1 - z0)); j++) for (let i = Math.max(0, Math.floor(bx0 - x0)); i <= Math.min(nx - 1, Math.floor(bx1 - x0)); i++) if (inside(x0 + i + 0.5, z0 + j + 0.5)) blocked[j * nx + i] = 1;
    };
    const reach = (lo, hi) => hi > 0.25 && lo < 2.2;   // walker height: skip lintels and roofs
    for (const c of loc._cols || []) {
      const m = loc.group.worldToLocal(c.c.clone());
      if (c.type === 'sphere' || c.type === 'cyl') {
        if (c.type === 'sphere' ? !reach(m.y - c.r, m.y + c.r) : tmp.copy(c.axis).applyQuaternion(qi).y < 0.9 || !reach(m.y + c.y0, m.y + c.y1)) continue;
        mark(m.x - c.r - r, m.x + c.r + r, m.z - c.r - r, m.z + c.r + r, (x, z) => Math.hypot(x - m.x, z - m.z) <= c.r + r);
      } else if (c.type === 'box') {
        const ax = c.ax.clone().applyQuaternion(qi), az = c.az.clone().applyQuaternion(qi), ay = c.ay.clone().applyQuaternion(qi);
        if (Math.abs(ay.y) < 0.9 || !reach(m.y - c.hy, m.y + c.hy)) continue;
        const ex = Math.abs(ax.x) * c.hx + Math.abs(az.x) * c.hz + r, ez = Math.abs(ax.z) * c.hx + Math.abs(az.z) * c.hz + r;
        mark(m.x - ex, m.x + ex, m.z - ez, m.z + ez, (x, z) => {
          const dx = x - m.x, dz = z - m.z;
          return Math.abs(dx * ax.x + dz * ax.z) <= c.hx + r && Math.abs(dx * az.x + dz * az.z) <= c.hz + r;
        });
      }
    }
    return { blocked };
  }
  function navPath(sx, sz, gx, gz) {
    nav ||= buildNav();
    const { x0, z0, nx, nz } = NAV;
    const cell = (x, z) => [Math.min(nx - 1, Math.max(0, Math.floor(x - x0))), Math.min(nz - 1, Math.max(0, Math.floor(z - z0)))];
    const snap = ([i, j]) => {                       // nearest open cell
      if (free(i, j)) return [i, j];
      for (let d = 1; d <= 6; d++) for (let b = -d; b <= d; b++) for (const [a, c] of [[b, -d], [b, d], [-d, b], [d, b]]) if (free(i + a, j + c)) return [i + a, j + c];
      return null;
    };
    const s = snap(cell(sx, sz)), g = snap(cell(gx, gz));
    if (!s || !g) return null;
    const idx = (i, j) => j * nx + i, G = new Float64Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1);
    const heap = [[0, idx(...s)]];
    const push = (e) => { heap.push(e); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (heap[q][0] <= heap[k][0]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let m = k; const l = 2 * k + 1, rr = l + 1; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    G[idx(...s)] = 0;
    const goal = idx(...g);
    const h = (i, j) => { const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let found = false;
    while (heap.length) {
      const [f, cur] = pop();
      if (cur === goal) { found = true; break; }
      const ci = cur % nx, cj = (cur / nx) | 0;
      if (f > G[cur] + h(ci, cj) + 1e-6) continue;                 // stale entry
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!free(ni, nj) || (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj)))) continue;   // no corner cutting
        const ng = G[cur] + (di && dj ? 1.414 : 1), n = idx(ni, nj);
        if (ng < G[n]) { G[n] = ng; from[n] = cur; push([ng + h(ni, nj), n]); }
      }
    }
    if (!found || G[goal] > 110) return null;
    const cells = [];
    for (let n = goal; n >= 0; n = from[n]) cells.push([x0 + (n % nx) + 0.5, z0 + ((n / nx) | 0) + 0.5]);
    cells.reverse();
    cells[0] = [sx, sz];
    const clear = (a, b) => {                        // straight line over open cells only
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4);
      for (let k = 1; k < n; k++) { const f = k / n, [i, j] = cell(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f); if (!free(i, j)) return false; }
      return true;
    };
    const out = [];
    let at = 0;
    while (at < cells.length - 1) {
      let to = cells.length - 1;
      while (to > at + 1 && !clear(cells[at], cells[to])) to--;
      out.push({ x: cells[to][0], z: cells[to][1] });
      at = to;
    }
    out[out.length - 1] = { x: gx, z: gz };
    return out;
  }
  function pickSpot(pt) {
    const cand = yardSpots.filter((sp) => !sp.busy && sp !== pt.spot), p = pt.root.position;
    for (let tries = 0; tries < 6 && cand.length; tries++) {
      const sp = cand.splice(Math.floor(Math.random() * cand.length), 1)[0], path = navPath(p.x, p.z, sp.x, sp.z);
      if (!path) continue;
      pt.spot.busy = false;
      pt.path = path;
      sp.busy = true;
      pt.spot = sp;
      pt.stay = sp.kind === 'slot' ? 8 + Math.random() * 14 : 4 + Math.random() * 8;
      return;
    }
    pt.stay = 2;                                     // nowhere to go: retry shortly
  }
  function updatePatrons(dt, time) {
    for (const c of cabinets) updateSlot(c.userData, dt, time);
    for (const pt of patrons) {
      const p = pt.root.position;
      const tgt = pt.path[0];
      if (tgt) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.4) { pt.path.shift(); continue; }
        const k = Math.min(d, 1.5 * dt) / d;
        p.x += dx * k; p.z += dz * k;
        pt.root.rotation.y = Math.atan2(dx, dz);
        pt.phase += dt * 6;
        pt.legL.rotation.x = Math.sin(pt.phase) * 0.6;
        pt.legR.rotation.x = -Math.sin(pt.phase) * 0.6;
        if (pt.armL) { pt.armL.rotation.x = -Math.sin(pt.phase) * pt.swing; pt.armR.rotation.x = Math.sin(pt.phase) * pt.swing; }
        p.y = Math.abs(Math.sin(pt.phase)) * 0.12;
        continue;
      }
      // arrived: face the attraction
      const sp = pt.spot;
      let dy = sp.yaw - pt.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      pt.root.rotation.y += dy * Math.min(1, dt * 5);
      pt.legL.rotation.x = pt.legR.rotation.x = 0;
      p.y = 0;
      if (sp.kind === 'slot') {
        // yank the handle every few seconds
        pt.pull -= dt;
        if (pt.pull <= 0) { pt.pull = 2.5 + Math.random() * 3; sp.cab.userData.pullT = 0.35; sp.cab.userData.playing = 1.6; }
        if (pt.armR) pt.armR.rotation.x = sp.cab.userData.pullT > 0 ? -2.0 : -0.9;
        if (pt.armL) pt.armL.rotation.x = -0.3;
      } else {
        if (pt.armL) { pt.armL.rotation.x = Math.sin(time * 1.3 + pt.phase) * 0.1; pt.armR.rotation.x = sp.kind === 'chat' ? -0.6 + Math.sin(time * 4 + pt.phase) * 0.4 : 0; }
      }
      pt.stay -= dt;
      if (pt.stay <= 0) pickSpot(pt);
    }
  }

  return {
    loc,
    up,
    entrance: w.toWorld(loc, 0, 1, HALL.FRONT + 3),
    near(p) { const l = loc.group.worldToLocal(p.clone()); return inHall(l.x, l.z, -6); },
    toWorld: (x, y, z, out) => w.toWorld(loc, x, y, z, out),
    toLocal: (p, out = new THREE.Vector3()) => loc.group.worldToLocal(out.copy(p)),
    bj: { group: bj, dealer },
    claw: { dyn: clawDyn, spots: cm.spots },
    duck: { ducks, gate, lamps, water, oddsCanvas, oddsTex, crowd },
    plinko: { pegs, pegBase, slotMats, aim },
    crowd,
    navPath,                                                   // also read by the checks and the Asset Row
    navFree: (x, z) => { nav ||= buildNav(); return free(Math.floor(x - NAV.x0), Math.floor(z - NAV.z0)); },
    onUpdate: null, // set by casinoGames.js
    update(dt, time) {
      const gm = globalThis.game;
      const want = gm && gm.input && gm.input.padActive ? glyphState.kind : 'kb';
      for (const s of padSigns) {
        if (s.key === want) continue;
        s.key = want;
        s.mesh.material.map = s.cache[want] || (s.cache[want] = neonTex(s.text, { ...s.opts, pad: want === 'kb' ? null : want }));
      }
      die.rotation.x += dt * 0.7; die.rotation.y += dt * 1.1;
      die.position.y = 10 + Math.sin(time * 1.6) * 0.8;
      wheel.rotation.z -= dt * 1.4;
      beams[0].rotation.y = 1 + Math.sin(time * 0.5) * 1.3;
      beams[1].rotation.y = -1 + Math.sin(time * 0.5 + 2) * 1.3;
      chase += dt;
      const step = Math.floor(chase * 7) % 3;
      bulbMats.forEach((m, i) => m.color.setHex(i === step ? 0xfff6a8 : 0x8a5a2a));
      for (const c of chandeliers) c.rotation.y += dt * 0.3;
      barSpin.rotation.y += dt * 0.9;
      bouncer.head.rotation.y = Math.sin(time * 0.55) * 0.55 * Math.max(0, Math.sin(time * 0.17) + 0.4); // occasional glances
      bouncer.root.scale.y = 0.94 * (1 + Math.sin(time * 1.6) * 0.006);
      const pulse = 0.75 + 0.25 * Math.sin(time * 3);
      bandMats[0].color.setRGB(1 * pulse, 0.18 * pulse, 0.53 * pulse);
      bandMats[1].color.setRGB(0.18 * (1.75 - pulse), 0.9 * (1.75 - pulse), 1 * (1.75 - pulse));
      water.offset.x -= dt * 0.25;
      for (const t of toppers) t.rotation.y += dt * 0.6;
      for (const o of prizeSpin) o.rotation.y += dt * 0.9;
      updatePatrons(dt, time);
      for (const c of crowd) {
        c.cheer = Math.max(0, c.cheer - dt);
        c.root.position.y = c.cheer > 0 ? Math.abs(Math.sin(time * 9 + c.phase)) * 0.5 : Math.abs(Math.sin(time * 2 + c.phase)) * 0.05;
      }
      if (this.onUpdate) this.onUpdate(dt, time);
    },
  };
}
