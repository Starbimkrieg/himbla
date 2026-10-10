import * as THREE from 'three';
import { toon, glow, ink, inkMat } from './toon.js';
import { frameQuat } from './geo.js';
import { pick } from './rng.js';
import { spliceGenes, makeChimera, LIVING } from './chimera.js';
import { ensureStats, statTotal, newRunner, stepRunner, raceOdds, CONDITIONS } from './chimerastats.js';
import { chimeraCard, cardList } from './chimeracard.js';
import { settle, floodMast } from './settlements.js';
import { T, G, lightString } from './outpostModels.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pixelFont } from './fonts.js';

// Chimera Downs: a proper racecourse for the things that crawl out of Dr. Zbornak's reactor.
// A dirt oval with four lanes, a grandstand full of cheering spectators, a jumbotron, a finish
// gantry, and a race office whose board posts races over time (up to three at once): each has
// its own distance (450 m sprints to 3.6 km marathons, so stamina matters), class, going, purse
// and field. Enter one of your chimeras, bet on it, and the camera locks onto it for the race
// (1-5 or C switch cameras, the mouse orbits, SPACE spends one of three crowd cheers).

// ---- the oval, in the location's frame: two 180 m straights joined by half circles ----
const STRAIGHT = 180, HALF = STRAIGHT / 2, R0 = 55;
const SEGS = [STRAIGHT, Math.PI * R0, STRAIGHT, Math.PI * R0];
const LAP = SEGS[0] + SEGS[1] + SEGS[2] + SEGS[3]; // ~706 m round the centre line
const LANES = [48.5, 52.5, 56.5, 60.5];
const RAIL_IN = 45, RAIL_OUT = 64.4;
const FINISH_U = 135; // finish line: x = +45 on the home straight (in front of the grandstand)
const STAND = { x0: -95, x1: 95, z0: 70.5, tiers: 11, rise: 1.1, depth: 2.6 };
const STAND_AISLES = [-57, -19, 19, 57];
const BACK_STAND = { x0: -60, x1: 60, z0: 70.5, tiers: 5, rise: 1.0, depth: 2.4 }; // (across the course, on the back straight)
const CONCOURSE = { z1: 140 }; // the paved concourse behind the grandstand runs back to here
const OFFICE = { x: -118, z: 82 };
const WINDOW = [OFFICE.x, 74.5]; // where you stand to talk to the bookie
const SCREEN = { x: 0, z: -14, w: 25, h: 12.5, y: 14 };
const MAX_CARD = 3;

const BETS = [0, 50, 200, 500];
const SHARE = [0.6, 0.25, 0.15]; // purse split for 1st / 2nd / 3rd
const TIERS = ['C', 'B', 'A', 'S'];
const CLASS_BAND = { C: [196, 218], B: [222, 242], A: [246, 258], S: [262, 284], OPEN: [206, 266] };
const PURSE = { C: 160, B: 320, A: 640, S: 1250, OPEN: 480 };
const RIVALS = [
  'Glue Factory Escapee', 'Mare-y Poppins', 'Hoof Hearted', 'Sir Trots-a-Lot', 'Neigh Sayer', 'Seabiscuit II (Moon)',
  'Gallop Poll', 'Unbridled Horror', 'Bad Genes', 'Whinny the Pooh', 'Stable Genius', 'Foal Play', 'Hay Hey Hey', 'Clip Clop Cthulhu',
  'Legs Eleven', 'Regolith Rocket', 'Six Knees', 'Mostly Harmless', 'Crater Tot', 'Sample 7B', 'Do Not Feed', 'Lunar Tick',
];
const RACE_NAMES = {
  SPRINT: ['Tycho Dash', 'Regolith Sprint', 'Crater Rim Scurry', 'Pulse Spinner Sprint', 'Short Fuse Stakes'],
  MILE: ['Copernicus Mile', 'Kepler Cup', 'Mare Imbrium Mile', 'Bounce Dome Handicap', 'Tranquility Trot'],
  STAKES: ['Antimatter Classic', 'Zbornak Invitational', 'Lucky Crater Stakes', 'Meridian Gold Cup', 'Vostok Grand Prix'],
  MARATHON: ['Dark Side Marathon', 'Long Night Endurance', 'Terminator Trek', 'Grand Lunar Marathon', 'Earthrise Ultra'],
};
const CAMS = ['chase', 'rail', 'leader', 'stands', 'blimp'];
const CAM_NAME = { chase: 'CHASE', rail: 'RAIL', leader: 'LEADER', stands: 'GRANDSTAND', blimp: 'BLIMP' };
const MOD_KINDS = ['water', 'rock', 'dirt', 'mud', 'wiring', 'engine'];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(), _f = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _o = {};
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const rand = (a, b) => a + Math.random() * (b - a);
// width of a Kit.text sign for a given letter height (the pixel font is ~square per character)
const tw = (str, h) => h * (0.347 * str.length + 0.667);

// Where centre-line distance u (wrapped) puts you on the oval of radius r, plus the heading.
function oval(u, r, out = {}) {
  u = ((u % LAP) + LAP) % LAP;
  if (u < SEGS[0]) {
    out.x = -HALF + u; out.z = r; out.hx = 1; out.hz = 0;
  } else if ((u -= SEGS[0]) < SEGS[1]) {
    const a = Math.PI / 2 - Math.PI * (u / SEGS[1]);
    out.x = HALF + r * Math.cos(a); out.z = r * Math.sin(a); out.hx = Math.sin(a); out.hz = -Math.cos(a);
  } else if ((u -= SEGS[1]) < SEGS[2]) {
    out.x = HALF - u; out.z = -r; out.hx = -1; out.hz = 0;
  } else {
    u -= SEGS[2];
    const a = -Math.PI / 2 - Math.PI * (u / SEGS[3]);
    out.x = -HALF + r * Math.cos(a); out.z = r * Math.sin(a); out.hx = Math.sin(a); out.hz = -Math.cos(a);
  }
  return out;
}
const lapLen = (r) => 2 * STRAIGHT + 2 * Math.PI * r;

// A flat band round the oval between radii r0 and r1 (track surface, lane lines, turf stripes).
function ovalStrip(r0, r1, y, perCurve = 48) {
  const us = [];
  const n = perCurve;
  us.push(0, SEGS[0] / 2);
  for (let i = 0; i <= n; i++) us.push(SEGS[0] + (SEGS[1] * i) / n);
  us.push(SEGS[0] + SEGS[1] + SEGS[2] / 2);
  for (let i = 0; i <= n; i++) us.push(SEGS[0] + SEGS[1] + SEGS[2] + (SEGS[3] * i) / n);
  const pos = [], nor = [], idx = [];
  for (const u of us) {
    for (const r of [r0, r1]) { oval(u, r, _o); pos.push(_o.x, y, _o.z); nor.push(0, 1, 0); }
  }
  const m = us.length;
  for (let i = 0; i < m - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function distCat(d) { return d < 900 ? 'SPRINT' : d < 1900 ? 'MILE' : d < 2900 ? 'STAKES' : 'MARATHON'; }

export class Race {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.racers = [];
    this.entrant = null;
    this.card = [];
    this.nextId = 1;
    this.postT = rand(40, 70);
    this.camMode = 'chase';
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camP = new THREE.Vector3();
    this.camL = new THREE.Vector3();
    this.excite = 0;
    this.screenT = 0;
    this.t = 0;
    this.loc = game.locations.find((l) => l.id === 'downs');
    this.panel = document.createElement('div');
    this.panel.id = 'racepanel';
    this.panel.className = 'panel hidden';
    document.getElementById('hud').appendChild(this.panel);
    if (this.loc) {
      this.build();
      // the board opens with a couple of races already posted
      this.post();
      this.post();
    }
  }

  // ================= the racecourse =================
  build() {
    const w = this.game.world;
    const loc = this.loc;
    // a proper old racecourse: racing green and cream, brass trim, navy steel (no funfair colours)
    const WHITE = 0xfff4e0, DARK = 0x23304f, CONC = 0x9a96a6, CONC2 = 0x7e7a8c, PANEL = 0x3c4a6a;
    const GREEN = 0x245c40, GREEN2 = 0x2f7350, CREAM = 0xeee4c8, BRASS = 0xd9a441, RED = 0x9c2a2f;
    settle(w, loc, 9091, (k) => {
      // ---- infield turf (mown stripes), the dirt track and its lane lines ----
      k.add(ovalStrip(0, 44.6, 0.05), T(0x3f8f5a), 0, 0, 0, { outline: 0 });
      for (let r = 4; r < 42; r += 8) k.add(ovalStrip(r, r + 4, 0.07), T(0x4aa36a), 0, 0, 0, { outline: 0 });
      k.add(ovalStrip(44.6, 64.8, 0.08), T(0xb9875a), 0, 0, 0, { outline: 0 });
      for (const r of [46.5, 50.5, 54.5, 58.5, 62.5]) k.add(ovalStrip(r - 0.08, r + 0.08, 0.1, 64), T(WHITE), 0, 0, 0, { outline: 0 });
      // ---- rails: white posts and a top rail, inside and out ----
      for (const [r, h] of [[RAIL_IN, 1.0], [RAIL_OUT, 1.2]]) {
        const n = Math.round(lapLen(r) / 5);
        let prev = null;
        for (let i = 0; i <= n; i++) {
          oval((i / n) * LAP, r, _o);
          const p = [_o.x, h, _o.z];
          if (i < n) k.cyl(0.08, 0.1, h, 6, T(WHITE), _o.x, 0, _o.z, { outline: 0.02 });
          if (prev) k.beam(prev, p, 0.07, T(WHITE), { outline: 0.015 });
          prev = p;
        }
      }
      // ---- finish line: a checkered strip across the track and a gantry over it ----
      const FX = 45;
      for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) k.box(0.9, 0.03, 0.9, T((i + j) % 2 ? 0x16121f : WHITE), FX - 0.45 + j * 0.9, 0.08, 45.2 + i * 0.95, { outline: 0 });
      for (const z of [43.6, 65.8]) {
        k.box(1.3, 11, 1.3, T(GREEN), FX, 0, z, { outline: 0.06 });
        k.box(1.5, 0.4, 1.5, T(BRASS), FX, 11, z, { outline: 0.03 });
      }
      k.box(1.6, 1.8, 23.6, T(GREEN), FX, 9.2, 54.7, { outline: 0.08 });
      for (let i = 0; i < 12; i++) k.box(1.64, 0.5, 1.9, T(i % 2 ? WHITE : 0x16121f), FX, 9.2, 44.3 + i * 1.9, { outline: 0 });
      k.text('FINISH', FX, 10.1, 54.7, -Math.PI / 2, tw('FINISH', 1.4), { fg: '#f2d27a', bg: '#1d4632', off: 0.82 });
      k.box(2.6, 3.2, 2.2, T(CREAM), FX + 2, 0, 68.4, { outline: 0.05 }); // photo-finish booth
      k.box(2.8, 0.3, 2.4, T(GREEN), FX + 2, 3.2, 68.4, { outline: 0.03 });
      k.box(1.8, 0.8, 0.1, G(0x9be7ff), FX + 2, 1.8, 67.25, { outline: 0 });
      // ---- distance poles counting down to the finish, on the inside rail ----
      for (let d = 100; d <= 600; d += 100) {
        oval(FINISH_U - d, RAIL_IN - 0.6, _o);
        k.cyl(0.14, 0.14, 3.4, 8, T(d % 200 ? RED : WHITE), _o.x, 0, _o.z, { outline: 0.03 });
        k.text(`${d}`, _o.x, 3.9, _o.z, Math.atan2(-_o.hz, _o.hx), tw(`${d}`, 0.8), { fg: '#ffffff', bg: '#1d4632', off: 0.16 });
      }
      // ---- the grandstand ----
      const { x0, x1, z0, tiers, rise, depth } = STAND;
      const len = x1 - x0;
      const aisles = STAND_AISLES;
      for (let i = 0; i < tiers; i++) {
        const top = (i + 1) * rise, zc = z0 + i * depth + depth / 2;
        // each step its own block, with a dark nosing along its front edge so the rake reads
        k.box(len, top, depth, T(i % 2 ? CONC : CONC2), 0, 0, zc, { outline: 0.03 });
        k.box(len, 0.12, 0.16, T(DARK), 0, top - 0.12, zc - depth / 2 + 0.06, { outline: 0 });
        k.solid(len / 2, top / 2, depth / 2, 0, zc);
        // seats: a row of bucket seats in each section, green rows and cream rows, brass in the
        // middle section (the members' enclosure)
        let xa = x0;
        for (const ax of [...aisles, x1 + 1.2]) {
          const xb = ax - 1.2;
          if (xb > xa) {
            const mid = xa < 0 && xb > 0;
            const c = mid && i > tiers - 4 ? RED : i % 2 ? CREAM : GREEN2;
            const n = Math.floor((xb - xa) / 0.9);
            for (let s = 0; s < n; s++) {
              const sx = xa + (s + 0.5) * ((xb - xa) / n);
              k.box(0.72, 0.32, 0.7, T(c), sx, top, zc - 0.4, { outline: 0.015 });
              k.box(0.72, 0.62, 0.12, T(c), sx, top + 0.25, zc + 0.02, { rx: -0.12, outline: 0.015 });
            }
          }
          xa = ax + 1.2;
        }
        // aisle stairs: two half-steps per tier, and brass handrails up both sides
        for (const ax of aisles) {
          k.box(2.4, top - rise / 2, depth / 2, T(CONC2), ax, 0, zc - depth / 4, { outline: 0.015 });
          k.box(2.4, 0.06, 0.12, T(BRASS), ax, top - rise / 2 - 0.06, zc - depth / 2 + 0.06, { outline: 0 });
        }
      }
      for (const ax of aisles) for (const s of [-1, 1]) k.beam([ax + s * 1.25, 1.9, z0], [ax + s * 1.25, tiers * rise + 0.9, z0 + tiers * depth - 1], 0.05, T(BRASS), { outline: 0.01 });
      const zBack = z0 + tiers * depth;
      const topY = tiers * rise;
      // the members' boxes across the back: a glazed row with dividers, over the top tier
      k.box(len, 3.4, 3.2, T(CREAM), 0, topY, zBack - 0.4, { outline: 0.06 });
      k.box(len + 0.2, 0.3, 3.4, T(GREEN), 0, topY + 3.4, zBack - 0.4, { outline: 0.03 });
      k.box(len - 1, 1.7, 0.1, G(0xfff0c0), 0, topY + 1.1, zBack - 2.05, { outline: 0 });
      for (let x = x0 + 5; x < x1; x += 10) k.box(0.3, 3.4, 0.4, T(GREEN), x, topY, zBack - 2.0, { outline: 0 });
      k.solid(len / 2, 1.7, 1.6, 0, zBack - 0.4, 0, topY);
      // the back wall and the ends, cream with green banding; two vomitories through each end
      const wallH = topY + 7;
      k.box(len + 2, wallH, 0.8, T(CREAM), 0, 0, zBack + 0.4, { outline: 0.08 });
      for (const y of [2.6, topY + 3.6]) k.box(len + 2.1, 0.5, 0.9, T(GREEN), 0, y, zBack + 0.4, { outline: 0 });
      k.solid(len / 2 + 1, wallH / 2, 0.4, 0, zBack + 0.4);
      for (const sx of [-1, 1]) {
        k.box(0.8, wallH - 2, zBack - z0, T(CREAM), sx * (len / 2 + 0.4), 0, (z0 + zBack) / 2, { outline: 0.06 });
        k.box(0.9, 0.5, zBack - z0, T(GREEN), sx * (len / 2 + 0.4), 2.6, (z0 + zBack) / 2, { outline: 0 });
        k.solid(0.4, (wallH - 2) / 2, (zBack - z0) / 2, sx * (len / 2 + 0.4), (z0 + zBack) / 2);
      }
      // the back wall's concourse face: a row of lit windows up top (the members' bar), and racing
      // posters between the entrances
      for (let x = x0 + 4; x < x1 - 2; x += 6) {
        k.box(3.2, 1.6, 0.12, G(0xfff0c0), x, topY + 1.2, zBack + 0.86, { outline: 0 });
        k.box(3.5, 0.2, 0.25, T(GREEN), x, topY + 2.8, zBack + 0.9, { outline: 0 });
      }
      const POSTERS = [['TODAY · THE MOON CUP', '#f2d27a'], ['BET RESPONSIBLY. ISH.', '#fff4e0'], ['CHIMERA DOWNS', '#f2d27a'], ['THE FAR TURN CLUB · MEMBERS', '#fff4e0']];
      POSTERS.forEach(([t, c], i) => {
        const x = [-72, -24, 24, 72][i];
        k.box(16, 4.2, 0.2, T(i % 2 ? RED : GREEN), x, 4.6, zBack + 0.9, { outline: 0.03 });
        k.box(16.4, 0.2, 0.3, T(BRASS), x, 8.8, zBack + 0.92, { outline: 0 });
        k.text(t, x, 6.7, zBack + 1.02, 0, Math.min(14.5, tw(t, 1.0)), { fg: c, bg: i % 2 ? '#5e1a1e' : '#16301f', back: false, off: 0.02 });
      });
      for (let x = x0 + 12; x < x1; x += 24) k.box(0.6, 0.6, 0.6, G(0xfff0c0), x, 3.3, zBack + 1.0, { outline: 0 });
      // entrances through the back wall (from the concourse), dark tunnels under a brass lintel
      for (const x of [-48, 0, 48]) {
        k.box(5, 4, 0.3, T(0x16121f), x, 0, zBack + 0.86, { outline: 0 });
        k.box(5.8, 0.5, 0.5, T(BRASS), x, 4, zBack + 0.95, { outline: 0.02 });
      }
      // the front parapet, its sponsor boards, and a brass rail along the top
      k.box(len, 1.3, 0.35, T(GREEN), 0, 0, z0 - 0.2, { outline: 0.04 });
      k.beam([x0, 1.45, z0 - 0.2], [x1, 1.45, z0 - 0.2], 0.06, T(BRASS), { outline: 0.01 });
      const ads = [['ANTIMATTER LAB · WE BREED WINNERS', '#9be36a'], ['LUCKY CRATER CASINO', '#f2d27a'], ['MERIDIAN EXCHANGE', '#9bd7ff'], ['QUANTUM-LOCK SKATES', '#f2d27a']];
      ads.forEach(([t, c], i) => k.text(t, -66 + i * 44, 0.66, z0 - 0.38, Math.PI, Math.min(38, tw(t, 1.0)), { fg: c, bg: '#16301f', back: false, off: 0.02 }));
      // the roof: a raked cantilever on columns at the back, trussed underneath, with a green
      // fascia, the course name in brass, a clock in the middle, and pennants along the edge
      const roofY = topY + 8.5;
      k.add(new THREE.BoxGeometry(len + 6, 0.6, zBack - z0 + 6), T(CREAM), 0, roofY, (z0 + zBack) / 2 - 2, { rx: -0.07, outline: 0.1 });
      k.add(new THREE.BoxGeometry(len + 6.2, 0.25, zBack - z0 + 6.2), T(GREEN), 0, roofY + 0.38, (z0 + zBack) / 2 - 2, { rx: -0.07, outline: 0 });
      const fz = z0 - 4.3;
      k.add(new THREE.BoxGeometry(len + 6.2, 1.8, 0.4), T(GREEN), 0, roofY - 0.9, fz, { rx: -0.07, outline: 0.06 });
      k.add(new THREE.BoxGeometry(len + 6.4, 0.18, 0.5), T(BRASS), 0, roofY - 1.8, fz, { rx: -0.07, outline: 0 });
      k.text('CHIMERA DOWNS', -48, roofY - 0.95, fz - 0.25, Math.PI, tw('CHIMERA DOWNS', 1.3), { fg: '#f2d27a', bg: '#1d4632', back: false, off: 0.02 });
      k.text('EST. YEAR ONE', 48, roofY - 0.95, fz - 0.25, Math.PI, tw('EST. YEAR ONE', 1.1), { fg: '#f2d27a', bg: '#1d4632', back: false, off: 0.02 });
      // the clock: a brass bezel, a cream face, two hands (it's always nearly post time)
      k.add(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 24).rotateX(Math.PI / 2), T(BRASS), 0, roofY + 0.9, fz - 0.2, { outline: 0.04 });
      k.add(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 24).rotateX(Math.PI / 2), T(CREAM), 0, roofY + 0.9, fz - 0.47, { outline: 0 });
      k.box(0.18, 1.6, 0.06, T(0x16121f), 0, roofY + 0.9, fz - 0.55, { outline: 0 });
      k.box(1.2, 0.2, 0.06, T(0x16121f), 0.5, roofY + 0.9, fz - 0.55, { rz: -0.35, outline: 0 });
      for (let x = x0; x <= x1 + 0.1; x += 12) {
        k.add(new THREE.ConeGeometry(0.6, 1.4, 3).rotateZ(Math.PI), T((x / 12) % 2 ? RED : CREAM), x, roofY - 2.6, fz - 0.1, { outline: 0.02 });
      }
      for (let x = x0; x <= x1 + 0.1; x += 19) {
        k.box(0.9, roofY + 0.6, 0.9, T(DARK), x, 0, zBack - 0.6, { outline: 0.04 });
        k.beam([x, topY + 4, zBack - 0.6], [x, roofY - 0.3, z0 + 2], 0.18, T(DARK), { outline: 0.03 });
        k.beam([x, roofY - 0.4, zBack - 0.6], [x, roofY - 1.2, z0 - 3], 0.12, T(DARK), { outline: 0.02 }); // the truss's bottom chord
      }
      for (let x = x0 + 10; x < x1; x += 20) k.lamp(x, z0 - 2.4, 6);
      // ---- the back-straight stand: smaller, open, across the course ----
      const B = BACK_STAND;
      for (let i = 0; i < B.tiers; i++) {
        const top = (i + 1) * B.rise, zc = -(B.z0 + i * B.depth + B.depth / 2);
        k.box(B.x1 - B.x0, top, B.depth, T(i % 2 ? CONC : CONC2), 0, 0, zc, { outline: 0.03 });
        k.box(B.x1 - B.x0, 0.12, 0.16, T(DARK), 0, top - 0.12, zc + B.depth / 2 - 0.06, { outline: 0 });
        k.solid((B.x1 - B.x0) / 2, top / 2, B.depth / 2, 0, zc);
        k.box(B.x1 - B.x0 - 2, 0.32, 0.7, T(i % 2 ? CREAM : GREEN2), 0, top, zc + 0.4, { outline: 0.015 });
        k.box(B.x1 - B.x0 - 2, 0.62, 0.12, T(i % 2 ? CREAM : GREEN2), 0, top + 0.25, zc - 0.02, { rx: 0.12, outline: 0.015 });
      }
      const bBack = -(B.z0 + B.tiers * B.depth);
      k.box(B.x1 - B.x0 + 1, B.tiers * B.rise + 2.5, 0.6, T(CREAM), 0, 0, bBack - 0.3, { outline: 0.06 });
      k.box(B.x1 - B.x0 + 1.1, 0.5, 0.7, T(GREEN), 0, B.tiers * B.rise + 2.5, bBack - 0.3, { outline: 0.03 });
      k.solid((B.x1 - B.x0) / 2, (B.tiers * B.rise + 2.5) / 2, 0.3, 0, bBack - 0.3);
      k.box(B.x1 - B.x0, 1.3, 0.35, T(GREEN), 0, 0, -B.z0 + 0.2, { outline: 0.04 });
      k.text('THE FAR TURN CLUB', 0, 0.66, -B.z0 + 0.38, 0, tw('THE FAR TURN CLUB', 1.0), { fg: '#f2d27a', bg: '#16301f', back: false, off: 0.02 });
      // ---- race office: the bookie's windows and the race card board ----
      const ox = OFFICE.x, oz = OFFICE.z;
      k.box(18, 6.5, 12, T(CREAM), ox, 0, oz, { outline: 0.08 });
      k.box(18.2, 0.6, 12.2, T(GREEN), ox, 0, oz, { outline: 0.03 });
      k.solid(9, 3.25, 6, ox, oz);
      k.box(18.6, 0.6, 12.6, T(GREEN), ox, 6.5, oz, { outline: 0.05 });
      // a striped awning over the windows
      for (let i = 0; i < 9; i++) k.add(new THREE.BoxGeometry(2, 0.22, 3.2), T(i % 2 ? CREAM : GREEN2), ox - 8 + i * 2, 4.4, oz - 7.4, { rx: 0.25, outline: 0.02 });
      for (const sx of [-1, 0, 1]) {
        k.box(3.6, 1.8, 0.2, G(0xfff0c0), ox + sx * 5, 1.6, oz - 6.05, { outline: 0 });
        k.box(4, 0.25, 0.8, T(0x8a5a3a), ox + sx * 5, 1.3, oz - 6.35, { outline: 0.03 });
        k.box(4, 0.12, 0.12, T(BRASS), ox + sx * 5, 3.4, oz - 6.15, { outline: 0 });
      }
      // the name sits above the awning, on the fascia (under it, the awning hides it)
      k.text('RACE OFFICE · BETS', ox, 5.65, oz - 6.05, Math.PI, tw('RACE OFFICE · BETS', 1.0), { fg: '#f2d27a', bg: '#1d4632', back: false, off: 0.05 });
      for (const sx of [-1, 1]) k.box(0.4, 7, 0.4, T(DARK), ox + sx * 6.5, 6.8, oz - 5.2, { outline: 0.03 });
      // ---- jumbotron in the infield, facing the stands ----
      const S = SCREEN;
      for (const sx of [-1, 1]) k.box(1.4, S.y + S.h / 2 + 1, 1.4, T(DARK), S.x + sx * (S.w / 2 + 1), 0, S.z - 0.8, { outline: 0.06 });
      k.box(S.w + 3.4, S.h + 2.4, 1.2, T(0x16121f), S.x, S.y - S.h / 2 - 1.2, S.z - 0.8, { outline: 0.1 });
      k.box(S.w + 3.6, 0.6, 1.4, T(GREEN), S.x, S.y + S.h / 2 + 1.2, S.z - 0.8, { outline: 0.04 });
      k.box(S.w + 3.7, 0.15, 1.5, T(BRASS), S.x, S.y + S.h / 2 + 1.8, S.z - 0.8, { outline: 0 });
      // ---- winner's circle by the finish: a lit dais under a garland arch ----
      const wx = 30, wz = 26;
      k.cyl(6, 6.4, 0.5, 28, T(CREAM), wx, 0, wz, { outline: 0.06 });
      k.ring(5.6, 0.12, G(0xf2d27a), wx, 0.52, wz);
      k.add(new THREE.TorusGeometry(5, 0.35, 8, 24, Math.PI), T(0x2f6b3a), wx, 0.4, wz, { outline: 0.05 });
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        k.ball(0.45, T(i % 2 ? RED : CREAM), wx + Math.cos(a) * 5, 0.4 + Math.sin(a) * 5, wz + 0.3, { outline: 0.02 });
      }
      k.text("WINNER'S CIRCLE", wx, 6.4, wz + 0.4, 0, tw("WINNER'S CIRCLE", 0.9), { fg: '#f2d27a', bg: '#1d4632', off: 0.3 });
      // statue plinth in the infield (the statue itself is added below)
      k.cyl(3, 3.5, 2.4, 20, T(CONC), -40, 0, 8, { outline: 0.08 });
      k.text('THE FIRST CHIMERA', -40, 1.5, 11.55, 0, tw('THE FIRST CHIMERA', 0.42), { fg: '#f2d27a', bg: '#1d4632', back: false, off: 0.02 });
      k.text('PLEASE DO NOT RIDE', -40, 0.95, 11.55, 0, tw('PLEASE DO NOT RIDE', 0.32), { fg: '#e8b06a', bg: '#1d4632', back: false, off: 0.02 });
      // ---- the concourse behind the grandstand: paving, food stalls, tables, strings of lights ----
      const cz0 = zBack + 1.2, cz1 = CONCOURSE.z1;
      k.box(len + 40, 0.12, cz1 - cz0, T(0x8f8a9a), 0, 0, (cz0 + cz1) / 2, { outline: 0 });
      for (let x = -(len + 40) / 2 + 6; x < (len + 40) / 2; x += 12) k.box(0.18, 0.13, cz1 - cz0, T(0x77728a), x, 0, (cz0 + cz1) / 2, { outline: 0 });
      const STALLS = [
        ['MOON DOGS', RED, '#f2d27a'], ['CRATER FRIES', 0xd98a2b, '#fff4e0'], ['HE-3 FIZZ', 0x2e7fa8, '#fff4e0'],
        ['CHIMERA CHOW', GREEN2, '#f2d27a'], ['ROCK CANDY', 0xa8457a, '#fff4e0'], ['TOTE · BETS', DARK, '#f2d27a'],
      ];
      STALLS.forEach(([name, c, fg], i) => {
        const sx = -85 + i * 34, sz = cz1 - 5;
        k.at(sx, sz, 0);
        k.box(8, 3, 3.6, T(CREAM), 0, 0, 0.8, { outline: 0.06 }); // the kiosk
        k.box(8.4, 1.1, 1.0, T(c), 0, 0, -1.5, { outline: 0.04 }); // the counter
        k.box(8.5, 0.12, 1.2, T(0x8a5a3a), 0, 1.1, -1.5, { outline: 0 });
        k.box(7, 1.2, 0.08, G(0xfff0c0), 0, 1.4, -1.03, { outline: 0 }); // the lit hatch
        // the striped awning
        for (let s = 0; s < 8; s++) k.add(new THREE.BoxGeometry(1.05, 0.12, 2.2), T(s % 2 ? CREAM : c), -3.68 + s * 1.05, 3.25, -1.6, { rx: 0.32, outline: 0.015 });
        k.box(8.2, 1.0, 0.25, T(c), 0, 3.6, 0.8 - 1.9, { outline: 0.03 });
        k.text(name, 0, 4.1, -1.25, Math.PI, Math.min(7.4, tw(name, 0.8)), { fg, bg: '#16121f', back: false, off: 0.04 });
        // a menu board, and something on the counter
        k.box(1.6, 1.2, 0.1, T(0x16121f), 2.8, 1.5, -1.0, { outline: 0.02 });
        k.cyl(0.25, 0.25, 0.5, 8, T(i % 2 ? RED : BRASS), -2.6, 1.2, -1.5, { outline: 0.02 });
        k.solid(4.2, 1.5, 2.6, 0, 0);
        k.at();
      });
      // picnic tables under umbrellas, set back from the walkway down the middle
      for (let i = 0; i < 10; i++) {
        const tx = -90 + i * 20 + (i % 2) * 4, tz = cz0 + 7 + (i % 3) * 4;
        if (Math.abs(tx) < 6) continue;
        k.box(2.6, 0.12, 1.2, T(0x8a5a3a), tx, 0.9, tz, { outline: 0.02 });
        for (const s of [-1, 1]) k.box(2.6, 0.1, 0.4, T(0x8a5a3a), tx, 0.5, tz + s * 0.9, { outline: 0.015 });
        k.cyl(0.05, 0.05, 2.8, 5, T(DARK), tx, 0, tz, { outline: 0 });
        k.add(new THREE.ConeGeometry(1.8, 0.7, 8), T(i % 2 ? GREEN2 : CREAM), tx, 3.1, tz, { outline: 0.03 });
        k.solid(1.3, 0.5, 0.6, tx, tz);
      }
      // strings of festoon lights over the concourse
      for (let x = -100; x <= 100; x += 25) k.cyl(0.1, 0.13, 6.5, 6, T(DARK), x, 0, cz0 + 3, { outline: 0.02 });
      for (let x = -100; x < 100; x += 25) lightString(k, [[x, 6.3, cz0 + 3], [x + 25, 6.3, cz0 + 3]], [0xfff0c0, 0xf2d27a], 8, 0.7);
      for (const x of [-105, 105]) k.lamp(x, cz1 - 1, 7);
      // ---- floodlights on the corners and an entrance arch out west ----
      for (const [x, z] of [[-150, -78], [150, -78], [-150, 78], [150, 78]]) floodMast(k, x, z, 24);
      k.at(-176, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        k.box(2.4, 12, 2.4, T(CREAM), sx * 9, 0, 0, { outline: 0.06 });
        k.box(2.6, 0.6, 2.6, T(GREEN), sx * 9, 12, 0, { outline: 0.03 });
        k.ball(0.8, T(BRASS), sx * 9, 13.4, 0, { outline: 0.03 });
      }
      k.box(21, 2.6, 1.6, T(GREEN), 0, 11, 0, { outline: 0.08 });
      k.box(21.2, 0.2, 1.7, T(BRASS), 0, 11, 0, { outline: 0 });
      k.text('CHIMERA DOWNS', 0, 12.3, 0, Math.PI, tw('CHIMERA DOWNS', 1.8), { fg: '#f2d27a', bg: '#1d4632', off: 0.85 });
      k.at();
    });

    // ---- moving parts ----
    // the jumbotron screen and the race card board are live canvases
    this.screen = this.canvasPlane(512, 256, SCREEN.w, SCREEN.h);
    w.put(this.screen.mesh, loc, SCREEN.x, SCREEN.z - 0.15, SCREEN.y, 0, true);
    this.board = this.canvasPlane(512, 300, 13, 7.6);
    w.put(this.board.mesh, loc, OFFICE.x, OFFICE.z - 5.0, 10.6, Math.PI, true);
    const back = new THREE.Mesh(new THREE.BoxGeometry(13.8, 8.4, 0.4), toon(0x1d4632));
    ink(back, 0.06);
    w.put(back, loc, OFFICE.x, OFFICE.z - 4.75, 10.6);
    // the starting gate (moved to wherever the next race starts)
    this.gate = this.makeGate();
    this.gate.root.visible = false;
    w.put(this.gate.root, loc, 0, 0, 0, 0, true);
    // a golden chimera on the infield plinth
    const statue = makeChimera({ seed: 1, body: 'mite', legs: 'car', head: 'person', extraHead: 'alien', mods: ['turbo'], size: 2.4, tint: 0xffd23f });
    const gold = toon(0xffd23f);
    statue.anim(0.4, 0);
    statue.root.traverse((o) => { if (o.isMesh && o.material !== inkMat) o.material = o.material.isMeshBasicMaterial ? glow(0xfff6a8) : gold; });
    w.put(statue.root, loc, -40, 8, 2.4, 0.6);
    // the crowd: outlined spectators in both stands
    this.buildCrowd();
    // foot traffic: racegoers wandering the concourse, the apron and the way in
    w.addFigures(loc, 26, {
      kind: 'worker',
      look: (i) => (i % 7 === 6 ? { kind: 'kid', scale: 0.6 } : { look: ['casual', 'casual', 'trader', 'elder'][i % 4] }),
      // (each walker keeps to its own patch: the concourse, the apron, the way in, or behind the far stand)
      area: (out, f) => {
        if (f.zone === undefined) { const q = Math.random(); f.zone = q < 0.55 ? 0 : q < 0.75 ? 1 : q < 0.9 ? 2 : 3; }
        const r = [0.1, 0.6, 0.8, 0.95][f.zone];
        if (r < 0.55) out.set(-100 + Math.random() * 200, 0, STAND.z0 + STAND.tiers * STAND.depth + 4 + Math.random() * (CONCOURSE.z1 - (STAND.z0 + STAND.tiers * STAND.depth) - 12));
        else if (r < 0.75) out.set(-88 + Math.random() * 176, 0, 66.5 + Math.random() * 2.6); // the apron in front of the stand
        else if (r < 0.9) out.set(-170 + Math.random() * 50, 0, -8 + Math.random() * 16); // the way in, from the arch
        else out.set(-60 + Math.random() * 120, 0, -(BACK_STAND.z0 + BACK_STAND.tiers * BACK_STAND.depth) - 3 - Math.random() * 6);
        return out;
      },
    });
    loc.group.updateMatrixWorld(true);
    this.booth = w.toWorld(loc, WINDOW[0], 0, WINDOW[1]);
  }

  canvasPlane(cw, ch, w, h) {
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    return { c, ctx: c.getContext('2d'), tex, mesh };
  }

  // A four-stall starting gate: a frame across the lanes and front doors that spring open.
  makeGate() {
    const root = new THREE.Group();
    const frameM = toon(0xeee4c8), padM = toon(0x2f7350), doorM = toon(0x9c2a2f);
    const span = LANES[3] - LANES[0] + 4.4;
    const mid = (LANES[0] + LANES[3]) / 2;
    const add = (geo, mat, x, y, z, t = 0.04) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; if (t) ink(m, t); root.add(m); return m; };
    // across the lanes = local x (outer lanes at -x), forward = +z
    add(new THREE.BoxGeometry(span + 0.6, 0.5, 0.5), frameM, 0, 3.6, 0);
    add(new THREE.BoxGeometry(span + 0.6, 0.5, 0.5), frameM, 0, 3.6, -3);
    add(new THREE.BoxGeometry(span, 0.5, 3.4), toon(0x2a2540), 0, 3.95, -1.5);
    const doors = [];
    for (let i = 0; i <= 4; i++) {
      const x = span / 2 - i * (span / 4);
      add(new THREE.BoxGeometry(0.35, 3.6, 3.2), i === 0 || i === 4 ? frameM : padM, x, 1.8, -1.5);
    }
    for (let i = 0; i < 4; i++) {
      const xc = -(LANES[i] - mid);
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(xc + s * 1.95, 0, 0.1);
        const d = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.12), doorM);
        d.position.set(-s * 0.95, 1.5, 0);
        ink(d, 0.03);
        hinge.add(d);
        root.add(hinge);
        doors.push({ g: hinge, s });
      }
      const num = this.numberPlate(i + 1);
      num.position.set(xc, 4.0, 0.3);
      root.add(num);
    }
    return { root, doors, open: 0, mid };
  }

  numberPlate(n) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#ffd23f'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#16121f'; x.font = pixelFont(40); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(n), 32, 35);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
  }

  placeGate(u) {
    const G0 = this.gate;
    oval(u, G0.mid, _o);
    G0.root.position.set(_o.x, 0.05, _o.z);
    G0.root.rotation.y = Math.atan2(_o.hx, _o.hz);
    G0.root.visible = true;
    this.setGate(0);
  }

  setGate(k) {
    this.gate.open = k;
    for (const d of this.gate.doors) d.g.rotation.y = d.s * k * 1.9;
  }

  // The crowd: seated spectators in both stands, drawn as instanced bodies, heads, hats and raised
  // arms, each with a black ink shell so they read as figures (not coloured pegs). They bob in
  // their seats; when the race gets exciting they jump and throw their arms up.
  buildCrowd() {
    const seats = [];
    const S = STAND, B = BACK_STAND;
    for (let i = 0; i < 430; i++) {
      const tier = Math.floor(Math.random() * S.tiers);
      let x;
      do x = S.x0 + 1 + Math.random() * (S.x1 - S.x0 - 2); while (STAND_AISLES.some((a) => Math.abs(x - a) < 1.6));
      seats.push({ x, y: (tier + 1) * S.rise + 0.3, z: S.z0 + tier * S.depth + S.depth / 2 - 0.4, face: Math.PI });
    }
    for (let i = 0; i < 120; i++) {
      const tier = Math.floor(Math.random() * B.tiers);
      seats.push({ x: B.x0 + 1.5 + Math.random() * (B.x1 - B.x0 - 3), y: (tier + 1) * B.rise + 0.3, z: -(B.z0 + tier * B.depth + B.depth / 2) + 0.4, face: 0 });
    }
    const N = seats.length;
    const torsoG = new THREE.CapsuleGeometry(0.3, 0.42, 3, 10).scale(1, 1, 0.78);
    const headG = new THREE.SphereGeometry(0.27, 12, 9);
    const hatG = new THREE.CylinderGeometry(0.2, 0.3, 0.2, 10).translate(0, 0.2, 0); // (a cap or a bowler)
    const hairG = new THREE.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.02, -0.02); // (hair, under no hat)
    // both arms, raised: two capsules angled up and out from the shoulders
    const armUp = new THREE.CapsuleGeometry(0.09, 0.5, 2, 6);
    const armsUpG = mergeGeometries([armUp.clone().rotateZ(0.5).translate(0.36, 0.38, 0), armUp.clone().rotateZ(-0.5).translate(-0.36, 0.38, 0)]);
    const inkM = new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide });
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, N); m.frustumCulled = false; return m; };
    const body = mk(torsoG, toon(0xffffff)), head = mk(headG, toon(0xffffff)), hat = mk(hatG, toon(0xffffff)), arms = mk(armsUpG, toon(0xffffff)), hair = mk(hairG, toon(0xffffff));
    const bodyInk = mk(torsoG, inkM), headInk = mk(headG, inkM);
    // racegoers' colours: smart jackets, a few loud shirts, skin and hair tones, hats
    const cols = [0x2f4f7a, 0x7a2f3a, 0x3f6a4a, 0xd8cfb8, 0x4a4660, 0xc7863a, 0x2c6f8a, 0x8a5aa8, 0xe2d6a0, 0x5e5e6e];
    const skin = [0xf1c9a5, 0xd8a47f, 0xa8714f, 0x6e4632, 0xe9b98f];
    const hats = [0x2a2a33, 0xe8dfc4, 0x7a2f3a, 0x245c40, 0xc7a24a];
    const hairs = [0x2a1d18, 0x5a3a22, 0x9a6a3a, 0xd8b56a, 0x8a8698, 0x1d1a29];
    const c = new THREE.Color();
    this.crowd = seats.map((s, i) => {
      const p = { ...s, ph: Math.random() * 10, f: 6 + Math.random() * 5, jump: Math.random(), sc: 0.92 + Math.random() * 0.2, hat: Math.random() < 0.45, wave: Math.random() < 0.6 };
      body.setColorAt(i, c.setHex(cols[(i * 7) % cols.length]));
      arms.setColorAt(i, c);
      head.setColorAt(i, c.setHex(skin[(i * 3) % skin.length]));
      hat.setColorAt(i, c.setHex(hats[i % hats.length]));
      hair.setColorAt(i, c.setHex(hairs[(i * 5) % hairs.length]));
      return p;
    });
    for (const m of [body, head, hat, arms, hair]) m.instanceColor.needsUpdate = true;
    this.crowdParts = { body, head, hat, arms, hair, bodyInk, headInk };
    for (const m of Object.values(this.crowdParts)) this.game.world.put(m, this.loc, 0, 0, 0, 0, true);
    this.updateCrowd(0);
  }

  updateCrowd(t) {
    const { body, head, hat, arms, hair, bodyInk, headInk } = this.crowdParts;
    const ex = this.excite;
    for (let i = 0; i < this.crowd.length; i++) {
      const p = this.crowd[i];
      // fans bob in their seats; when the crowd is excited, they leap and wave
      const hop = ex > 0.05 ? Math.max(0, Math.sin(t * p.f + p.ph)) * (0.25 + p.jump * 0.9) * ex : Math.max(0, Math.sin(t * 1.3 + p.ph)) * 0.05;
      const sway = Math.sin(t * 0.9 + p.ph) * 0.06;
      _q.setFromAxisAngle(_Y, p.face + sway);
      const k = p.sc;
      _p.set(p.x, p.y + 0.5 * k + hop, p.z);
      _m4.compose(_p, _q, _s.set(k, k, k));
      body.setMatrixAt(i, _m4);
      _m4.compose(_p, _q, _s.set(k * 1.13, k * 1.08, k * 1.15));
      bodyInk.setMatrixAt(i, _m4);
      const armsOn = ex > 0.35 && p.wave;
      _m4.compose(_p, _q, _s.set(armsOn ? k : 0, armsOn ? k : 0, armsOn ? k : 0));
      arms.setMatrixAt(i, _m4);
      _p.y += 0.66 * k;
      _m4.compose(_p, _q, _s.set(k, k, k));
      head.setMatrixAt(i, _m4);
      _m4.compose(_p, _q, _s.set(k * 1.14, k * 1.14, k * 1.14));
      headInk.setMatrixAt(i, _m4);
      _m4.compose(_p, _q, _s.set(p.hat ? k : 0, p.hat ? k : 0, p.hat ? k : 0));
      hat.setMatrixAt(i, _m4);
      _m4.compose(_p, _q, _s.set(p.hat ? 0 : k, p.hat ? 0 : k, p.hat ? 0 : k));
      hair.setMatrixAt(i, _m4);
    }
    for (const m of [body, head, hat, arms, hair, bodyInk, headInk]) m.instanceMatrix.needsUpdate = true;
  }

  near(p) { return this.booth && this.loc.active && p.distanceTo(this.booth) < 7; }

  // ================= the race card =================
  post() {
    const cat = pick(['SPRINT', 'SPRINT', 'MILE', 'MILE', 'STAKES', 'STAKES', 'MARATHON']);
    const [a, b] = { SPRINT: [450, 850], MILE: [1000, 1800], STAKES: [2000, 2800], MARATHON: [3000, 3600] }[cat];
    const dist = Math.round(rand(a, b) / 50) * 50;
    const cls = pick(['C', 'C', 'C', 'B', 'B', 'B', 'A', 'A', 'S', 'OPEN', 'OPEN']);
    const cond = pick(['fast', 'fast', 'dusty', 'dusty', 'dusty', 'heavy', 'heavy', 'lowg']);
    const used = new Set(this.card.map((r) => r.name));
    let name;
    for (let i = 0; i < 8 && (!name || used.has(name)); i++) name = pick(RACE_NAMES[cat]);
    const purse = Math.round((PURSE[cls] * (0.75 + dist / 2400)) / 10) * 10;
    const race = {
      id: this.nextId++, name, cat, dist, cls, cond, purse,
      fee: Math.max(10, Math.round((purse * 0.12) / 10) * 10),
      field: this.makeRivals(cls), ttl: rand(360, 540),
    };
    this.card.push(race);
    const g = this.game;
    if (this.loc.active && g.currentZone === this.loc) g.hud.toast(`🏁 Posted: ${race.name} · ${fmt(dist)} m · class ${cls}`, 3);
    return race;
  }

  makeRivals(cls) {
    const [lo, hi] = CLASS_BAND[cls];
    const out = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const target = rand(lo, hi);
      let best = null;
      for (let c = 0; c < 14; c++) {
        const items = [];
        const n = 2 + (Math.random() < 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) items.push({ kind: pick(LIVING) });
        if (Math.random() < 0.5) items.push({ kind: pick(MOD_KINDS) });
        const gn = spliceGenes(items);
        const t = statTotal(gn.stats);
        // class races keep to their tier; within that, the closest to the target total
        const ok = cls === 'OPEN' || TIERS.indexOf(gn.tier) <= TIERS.indexOf(cls);
        gn.dist = Math.abs(t - target) + (ok ? 0 : 1000);
        if (!best || gn.dist < best.dist) best = gn;
      }
      delete best.dist;
      let name;
      do name = pick(RIVALS); while (used.has(name));
      used.add(name);
      best.name = name;
      out.push(best);
    }
    return out;
  }

  eligible(race, genes) {
    return race.cls === 'OPEN' || TIERS.indexOf(genes.tier) <= TIERS.indexOf(race.cls);
  }

  raceLine(r) {
    const C = CONDITIONS[r.cond];
    const mins = Math.max(1, Math.ceil(r.ttl / 60));
    return `<b>${r.name.toUpperCase()}</b> · ${fmt(r.dist)} m ${r.cat.toLowerCase()} · ${r.cls === 'OPEN' ? 'OPEN CLASS' : r.cls === 'C' ? 'CLASS C' : `CLASS ${r.cls} &amp; under`} · going <b>${C.name}</b> <small>(${C.blurb})</small><br><small>Purse ₵${fmt(r.purse)} (1st ₵${fmt(r.purse * SHARE[0])} · 2nd ₵${fmt(r.purse * SHARE[1])} · 3rd ₵${fmt(r.purse * SHARE[2])}) · entry ₵${r.fee} · closes in ${mins} min · field: ${r.field.map((f) => `${f.name} (${f.tier})`).join(', ')}</small>`;
  }

  // ---------- at the window ----------
  open() {
    const g = this.game;
    if (this.state !== 'idle') { g.hud.toast('A race is already running! Watch the track.', 2); return; }
    const ch = g.alchemy.chimeras;
    if (!ch.length) {
      g.dialog('CHIMERA DOWNS', '"No chimera, no race, pal. Go see the egghead at the Antimatter Lab, put two living things in his reactor, and bring me whatever crawls out. Cars count. Mites count. People… legally count."', [{ label: 'FINE' }]);
      return;
    }
    if (!this.card.length) {
      g.dialog('CHIMERA DOWNS', `"Card's empty, friend. Next race posts in about ${Math.ceil(this.postT)} seconds. Grab a hot dog. It's mostly regolith."`, [{ label: 'OK' }]);
      return;
    }
    const rows = this.card.map((r, i) => `<p class="race-card"><b>${i + 1}.</b> ${this.raceLine(r)}</p>`).join('');
    g.dialog('RACE CARD', `"Pick a race. Distances vary, so mind the stamina: sprinters gas out on the long ones." <small>Record: ${g.stats.raceWins || 0} wins · ${g.stats.raceStarts || 0} starts.</small>${rows}`, this.card.map((r, i) => ({
      label: `${i + 1} · ${r.name.toUpperCase()} (${fmt(r.dist)} m, ${r.cls})`,
      fn: () => this.pickRunner(r),
    })).concat([{ label: `${this.card.length + 1} · NEVER MIND` }]));
  }

  pickRunner(race) {
    const g = this.game;
    if (!this.card.includes(race)) { g.hud.toast('That race just closed.', 2); return; }
    const ch = g.alchemy.chimeras;
    const recent = [...ch.filter((c) => c.follow), ...ch.filter((c) => !c.follow).reverse()].slice(0, 8);
    recent.forEach(ensureStats);
    const long = race.dist >= 2000;
    const cards = recent.map((c, i) => {
      const ok = this.eligible(race, c);
      const fit = long ? (c.stats.stamina >= 60 ? 'built to last' : c.stats.stamina < 45 ? '⚠ will tire' : '') : (c.stats.speed >= 60 ? 'quick' : '');
      return chimeraCard(g, c, { key: i + 1, button: true, status: ok ? `${c.follow ? '★ WITH YOU' : 'IN PEN'}${c.wins ? ` · 🏆 ${c.wins}` : ''}${fit ? ` · ${fit}` : ''}` : `✖ GRADE ${c.tier}: TOO STRONG FOR CLASS ${race.cls}` });
    });
    g.dialog(race.name.toUpperCase(), `${this.raceLine(race)}<br>"Which of your… <i>creatures</i>… is running?" <small>(number key or click)</small>${cardList(cards, recent.length)}`, recent.map((c, i) => ({
      label: `${i + 1} · ${c.name.toUpperCase()} (${c.tier})`,
      fn: () => {
        if (!this.eligible(race, c)) { g.hud.toast(`Grade ${c.tier} is too strong for a class ${race.cls} race.`, 2.5); this.pickRunner(race); return; }
        this.chooseBet(race, c);
      },
    })).concat([{ label: `${recent.length + 1} · BACK`, fn: () => this.open() }]));
  }

  chooseBet(race, genes) {
    const g = this.game;
    const field = [genes, ...race.field];
    const cond = CONDITIONS[race.cond];
    // the bookie runs this exact race a few hundred times in his head
    const book = raceOdds(field, 300, Math.random, race.dist, cond);
    const odds = book[0].odds;
    const cards = field.map((r, i) => chimeraCard(g, r, { mine: i === 0, tag: i === 0 ? 'YOUR ENTRY' : `LANE ${i + 1}`, odds: book[i], status: `${(r.parents || []).join(' + ')} · chaos ${r.chaos}` }));
    g.dialog('PLACE YOUR BET', `${race.name} · ${fmt(race.dist)} m · going ${cond.name}. Entry ₵${race.fee}. Your <b>${genes.name}</b> pays <b>${odds.toFixed(1)}×</b> a bet if it wins.<small> Odds come from the bookie's simulations of this race: distance, going, speed, power, stamina and wit all count, and chaos is chaos.</small>${cardList(cards, 0, 'derby')}`, BETS.map((b, i) => ({
      label: b ? `${i + 1} · ENTER + BET ₵${b} (PAYS ₵${fmt(b * odds)})` : `${i + 1} · JUST ENTER (₵${race.fee})`,
      fn: () => {
        const cost = race.fee + b;
        if (g.credits < cost) { g.hud.toast(`Not enough credits (need ₵${cost}).`, 2); return; }
        if (!this.card.includes(race)) { g.hud.toast('That race just closed.', 2); return; }
        g.credits -= cost;
        g.audio.cash();
        this.start(race, field, b, odds);
      },
    })).concat([{ label: `${BETS.length + 1} · BACK`, fn: () => this.pickRunner(race) }]));
  }

  // ================= the race =================
  start(race, field, bet, odds) {
    const g = this.game;
    this.card = this.card.filter((r) => r !== race);
    this.race = race;
    this.cond = CONDITIONS[race.cond];
    this.bet = bet;
    this.odds = odds;
    this.entrant = field[0];
    this.startU = FINISH_U - race.dist;
    this.cheers = 3;
    this.excite = 0.4;
    g.stats.raceStarts = (g.stats.raceStarts || 0) + 1;
    g.alchemy.syncChimeras();
    this.racers = field.map((genes, i) => {
      const m = makeChimera(genes);
      g.scene.add(m.root);
      return Object.assign(newRunner(genes), { m, lane: LANES[i], hop: 0, vy: 0, mine: i === 0, tiredSaid: false, weave: Math.random() * 6 });
    });
    this.placeGate(this.startU);
    this.state = 'countdown';
    this.timer = 4.5;
    this.finished = 0;
    for (const r of this.racers) this.place(r);
    // lock the camera to your runner
    this.camMode = 'chase';
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camP.copy(g.camera.position);
    this.camL.copy(this.racers[0].pos);
    this.camT = 0;
    g.state = 'derby';
    g.hud.prompt(null);
    g.hud.alert(`${race.name.toUpperCase()} — ${fmt(race.dist)} M`, '#ff2e88', 3);
  }

  place(r) {
    const g = this.game;
    const w = g.world;
    const u = this.startU + r.s;
    const off = Math.sin(r.t * 0.6 + r.weave) * 0.5;
    oval(u, r.lane + off, _o);
    w.toWorld(this.loc, _o.x, 0, _o.z, _v);
    g.planet.ground(_v, _v);
    _up.copy(_v).normalize();
    const dir = r.ev === 'wrong' ? -1 : 1;
    w.toWorld(this.loc, _o.x + _o.hx * dir, 0, _o.z + _o.hz * dir, _f);
    _f.sub(w.toWorld(this.loc, _o.x, 0, _o.z, _w));
    r.m.root.position.copy(_v).addScaledVector(_up, r.hop + 0.1);
    frameQuat(_up, _f, r.m.root.quaternion);
    r.pos = r.m.root.position;
    r.fwd = (r.fwd || new THREE.Vector3()).copy(_f).normalize();
  }

  // the race model rolled an event for this runner: make it visible
  chaosFx(r, ev) {
    const g = this.game;
    const at = r.m.root.position.clone().addScaledVector(r.m.root.position.clone().normalize(), 4);
    if (ev === 'stumble') g.fx.pop('STUMBLE!', at, { color: '#ffd23f', size: 36 });
    else if (ev === 'trip') g.fx.pop(pick(['TRIPPED!', 'OOPS', 'WHICH LEG?!']), at, { color: '#ffd23f', size: 30 });
    else if (ev === 'zoom') g.fx.pop('ZOOOM!', at, { color: '#2ee6ff', size: 40 });
    else if (ev === 'wrong') g.fx.pop('WRONG WAY!', at, { color: '#ff4f2e', size: 36 });
    else if (ev === 'hop') { r.vy = this.cond === CONDITIONS.lowg ? 22 : 14; g.fx.pop('BOING!', at, { color: '#ff2e88', size: 36 }); }
    else if (ev === 'boom') {
      g.fx.explosion(r.m.root.position, 4, false);
      r.m.root.visible = false;
      g.fx.pop('IT EXPLODED?!', at, { color: '#ff4f2e', size: 40 });
    } else if (ev === 'dread') g.fx.pop(r.genes.extraHead ? 'HEADS ARGUING' : 'EXISTENTIAL DREAD', at, { color: '#c77dff', size: 32 });
    if (r.mine || ev === 'boom') this.excite = Math.min(1, this.excite + 0.3);
  }

  // SPACE while your runner races: the crowd roars, it surges (and burns stamina doing it)
  cheer() {
    const g = this.game;
    const r = this.racers[0];
    if (this.state !== 'run' || !r || r.done) return;
    if (this.cheers <= 0) { g.hud.toast('The crowd is hoarse. No cheers left.', 1.5); return; }
    this.cheers--;
    this.excite = 1;
    g.audio.roar(1.1);
    const at = r.pos.clone().addScaledVector(r.pos.clone().normalize(), 5);
    if (r.st.wit < 38 && Math.random() < 0.35) {
      // a dim creature panics at the noise instead
      r.ev = 'trip'; r.evT = 0.9;
      g.fx.pop('SPOOKED BY THE CROWD!', at, { color: '#ff9f1c', size: 34 });
    } else {
      r.boost = 1.6;
      g.fx.pop(pick(['GO GO GO!', 'C\'MON!!', 'RUN, BABY!', 'YOU CAN DO IT!']), at, { color: '#7dff3a', size: 40 });
    }
    [523, 659, 784].forEach((f, i) => setTimeout(() => g.audio.tone(f, 0.12, 'square', 0.12), i * 70));
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    // the board posts races over time and closes stale ones
    if (this.loc && this.state === 'idle') {
      for (const r of this.card) r.ttl -= dt;
      this.card = this.card.filter((r) => r.ttl > 0);
      this.postT -= dt;
      if (this.postT <= 0) {
        if (this.card.length < MAX_CARD) this.post();
        this.postT = rand(50, 90);
      }
    }
    // the crowd you hear: a murmur at the course, a roar during a race, louder while you lead
    const racing = this.state === 'countdown' || this.state === 'run';
    const here = this.loc && (racing || (this.loc.active && g.player.pos.distanceTo(this.booth) < 260));
    let crowd = 0;
    if (here) {
      crowd = 0.08;
      if (racing) {
        const lead = this.order()[0];
        const leading = this.state === 'run' && lead && lead.mine;
        if (leading && !this.wasLeading && this.racers[0].s > 30) g.audio.roar(0.6);
        this.wasLeading = leading;
        crowd = 0.42 + this.excite * 0.3 + (leading ? 0.28 : 0);
      }
    }
    g.audio.setCrowd(crowd);
    if (this.loc && this.loc.active) {
      this.excite = Math.max(this.state === 'run' ? 0.25 : 0, this.excite - dt * 0.25);
      this.updateCrowd(this.t);
      this.screenT -= dt;
      if (this.screenT <= 0) { this.screenT = 0.3; this.drawScreen(); this.drawBoard(); }
      if (this.gate.root.visible && this.state !== 'countdown') this.setGate(Math.min(1, this.gate.open + dt * 4));
    }
    if (this.state === 'idle') { this.panel.classList.add('hidden'); return; }
    if (this.state === 'countdown') {
      const before = Math.ceil(this.timer);
      this.timer -= dt;
      const now = Math.ceil(this.timer);
      const r0 = this.racers[0];
      if (now !== before && now > 0 && now <= 3) { g.fx.pop(String(now), r0.pos.clone().addScaledVector(r0.pos.clone().normalize(), 6), { color: '#ffd23f', size: 80 }); g.audio.tone(440, 0.2, 'square', 0.08); }
      if (this.timer <= 0) {
        this.state = 'run';
        this.excite = 1;
        g.fx.pop('AND THEY\'RE OFF!', null, { color: '#ff2e88', size: 70 });
        g.audio.roar(1);
        g.audio.tone(880, 0.4, 'square', 0.1);
      }
      for (const r of this.racers) { r.t += dt; r.m.anim(r.t, 0); this.place(r); }
    } else if (this.state === 'run') {
      const len = this.race.dist;
      for (const r of this.racers) {
        if (r.done) {
          // past the line: trot on round the bend and slow down
          r.v = Math.max(0, r.v - dt * 6);
          r.s += r.v * dt; r.t += dt;
          this.place(r);
          r.m.anim(r.t, r.v);
          continue;
        }
        const ev = stepRunner(r, dt, Math.random, this.cond);
        if (ev) this.chaosFx(r, ev);
        if (r.ended === 'boom') { r.m.root.visible = true; g.fx.pop('REASSEMBLED!', r.pos.clone().addScaledVector(r.pos.clone().normalize(), 4), { color: '#7dff6a', size: 32 }); }
        if (!r.tiredSaid && r.stam < 0.2) { r.tiredSaid = true; g.fx.pop(r.mine ? 'YOURS IS GASSED!' : 'RUNNING ON FUMES', r.pos.clone().addScaledVector(r.pos.clone().normalize(), 5), { color: '#ff9f1c', size: 28 }); }
        r.hop += r.vy * dt; r.vy -= (this.cond === CONDITIONS.lowg ? 18 : 30) * dt;
        if (r.hop <= 0) { r.hop = 0; r.vy = r.genes.hop > 0.5 && Math.random() < dt * 4 ? 5 : 0; }
        this.place(r);
        r.m.anim(r.t, Math.abs(r.v));
        if (r.s >= len) {
          r.done = true;
          r.place = ++this.finished;
          this.excite = 1;
          g.fx.pop(r.place === 1 ? `${r.genes.name.toUpperCase()} WINS!` : `#${r.place}`, r.pos.clone().addScaledVector(r.pos.clone().normalize(), 6), { color: r.mine ? '#7dff3a' : '#ffffff', size: r.place === 1 ? 70 : 40 });
          if (r.place === 1) g.audio.tone(660, 0.6, 'square', 0.25);
          if (r.mine) g.audio.roar(r.place === 1 ? 1.5 : r.place <= 3 ? 0.9 : 0.4);
          if (r.mine && r.place <= 3) this.confetti(r.pos);
        }
      }
      if (!this.finishAt && (this.finished >= this.racers.length || this.racers[0].done)) this.finishAt = this.t + 2.2;
      if (this.finishAt && this.t >= this.finishAt) { this.finishAt = 0; this.finish(); }
    } else if (this.state === 'cooldown') {
      for (const r of this.racers) { r.t += dt; r.v = Math.max(0, r.v - dt * 6); r.s += r.v * dt; this.place(r); r.m.anim(r.t, r.v); }
    }
    this.drawPanel();
  }

  confetti(pos) {
    const g = this.game;
    const up = pos.clone().normalize();
    for (let i = 0; i < 6; i++) {
      g.fx.spawn(pos.clone().addScaledVector(up, 3), up.clone().multiplyScalar(10).add(new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12)), { color: [0xff2e88, 0xffd23f, 0x2ee6ff, 0x7dff6a][i % 4], size: 0.5, life: 1.6, count: 8, spread: 3 });
    }
  }

  // ---------- watching: the 'derby' game state (main.js) calls this instead of the player ----------
  watch(dt) {
    const g = this.game;
    const [mx, my] = g.input.consumeMouse();
    const sens = 0.0022 * (g.settings ? g.settings.v.sensitivity : 1);
    this.camYaw -= mx * sens;
    this.camPitch = Math.max(-0.1, Math.min(1.2, this.camPitch + my * sens));
    this.update(dt);
    if (this.state === 'idle' || !this.racers.length) return;
    this.updateCam(dt);
  }

  onKey(code) {
    const n = parseInt(code.replace('Digit', ''), 10);
    if (code.startsWith('Digit') && n >= 1 && n <= CAMS.length) this.setCam(CAMS[n - 1]);
    else if (code === 'KeyC') this.setCam(CAMS[(CAMS.indexOf(this.camMode) + 1) % CAMS.length]);
    else if (code === 'Space') this.cheer();
  }

  setCam(mode) {
    if (mode === this.camMode) return;
    this.camMode = mode;
    this.camYaw = 0;
    this.camT = 0;
    this.game.audio.click();
  }

  updateCam(dt) {
    const g = this.game, w = g.world, cam = g.camera;
    const mine = this.racers[0];
    const lead = [...this.racers].sort((a, b) => b.s - a.s)[0];
    const subject = this.camMode === 'leader' ? lead : mine;
    const P = subject.pos, up = _up.copy(P).normalize();
    const size = subject.genes.size || 1;
    const want = _v, look = _w;
    if (this.camMode === 'chase' || this.camMode === 'leader') {
      // behind and above the runner, swung round by the mouse
      const back = _f.copy(subject.fwd).negate().applyAxisAngle(up, this.camYaw);
      const dist = 7.5 + size * 2.5;
      want.copy(P).addScaledVector(back, dist * Math.cos(this.camPitch)).addScaledVector(up, 1.6 + size * 1.2 + dist * Math.sin(this.camPitch));
      look.copy(P).addScaledVector(up, 1.0 + size * 0.6).addScaledVector(subject.fwd, 4);
    } else if (this.camMode === 'rail') {
      // tracking shot from the infield, level with the runner (the crowd behind it on the straight)
      oval(this.startU + subject.s, RAIL_IN - 7, _o);
      w.toWorld(this.loc, _o.x, 3 + size, _o.z, want);
      look.copy(P).addScaledVector(up, 1 + size * 0.5);
    } else if (this.camMode === 'stands') {
      // high in the stands, sliding along with the runner
      oval(this.startU + subject.s, 0, _o);
      w.toWorld(this.loc, Math.max(-60, Math.min(60, _o.x * 0.6)), 17, STAND.z0 + 14, want);
      look.copy(P).addScaledVector(up, 1);
    } else {
      // blimp: high over the pack, trailing it
      _f.set(0, 0, 0);
      for (const r of this.racers) _f.add(r.pos);
      _f.divideScalar(this.racers.length);
      const back = _p.copy(subject.fwd).negate();
      want.copy(_f).addScaledVector(up, 55).addScaledVector(back, 35);
      look.copy(_f);
    }
    // keep it above the ground
    const alt = g.planet.altitude(want);
    if (alt < 1.5) want.addScaledVector(_p.copy(want).normalize(), 1.5 - alt);
    this.camT += dt;
    const k = 1 - Math.exp(-dt * (this.camT < 1.2 ? 3 : this.camMode === 'rail' ? 8 : 6));
    this.camP.lerp(want, k);
    this.camL.lerp(look, Math.min(1, k * 1.6));
    cam.position.copy(this.camP);
    const sk = g.cam.shake * (g.settings ? g.settings.v.shake : 1);
    if (sk > 0) { g.cam.shake = Math.max(0, g.cam.shake - dt * 2.5); cam.position.x += (Math.random() - 0.5) * sk; cam.position.y += (Math.random() - 0.5) * sk; }
    cam.up.copy(up);
    cam.lookAt(this.camL);
    const fov = this.camMode === 'stands' ? 38 : this.camMode === 'blimp' ? 55 : 66;
    g.cam.fov += (fov - g.cam.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - g.cam.fov) > 0.01) { cam.fov = g.cam.fov; cam.updateProjectionMatrix(); }
  }

  drawPanel() {
    const order = this.order();
    const len = this.race.dist;
    const EV = { stumble: 'stumbling', trip: 'tripped', zoom: 'ZOOMING', wrong: 'wrong way!', hop: 'airborne', boom: 'in pieces', dread: 'having doubts' };
    const rows = order.map((r, i) => `<div class="race-row ${r.mine ? 'mine' : ''}"><b>${r.done ? r.place : i + 1}</b> ${r.genes.name}${r.ev ? ` <i>${EV[r.ev]}</i>` : r.boost > 0 ? ' <i>SURGING</i>' : !r.done && r.stam < 0.25 ? ' <i>tired</i>' : ''}<span>${r.done ? (r.behind !== undefined ? `+${fmt(r.behind)} m` : `${r.time.toFixed(1)}s`) : `${fmt(Math.max(0, len - r.s))} m`}</span><em class="race-stam" title="stamina"><u style="width:${Math.round(r.stam * 20) * 5}%"></u></em></div>`).join('');
    const togo = Math.max(0, len - order[0].s);
    const head = this.state === 'countdown' ? `${this.race.name.toUpperCase()} · STARTING IN ${Math.max(1, Math.ceil(this.timer))}` : `${this.race.name.toUpperCase()} · ${togo > 0 ? `${fmt(togo)} M TO GO` : 'FINISHED'}`;
    const info = `<div class="race-info">${fmt(len)} m · going ${this.cond.name}${this.bet ? ` · ₵${this.bet} @ ${this.odds.toFixed(1)}×` : ''}</div>`;
    const foot = this.state === 'cooldown' ? '' : `<div class="race-keys"><b>SPACE</b> cheer ×${this.cheers} · <b>1-5</b>/<b>C</b> camera: ${CAM_NAME[this.camMode]} · mouse orbits</div>`;
    const html = `<div class="m-head">${head}</div>${info}${rows}${foot}`;
    if (html !== this.lastHtml) { this.panel.innerHTML = html; this.lastHtml = html; }
    this.panel.classList.remove('hidden');
  }

  order() {
    return [...this.racers].sort((a, b) => (a.done && b.done ? a.place - b.place : a.done ? -1 : b.done ? 1 : b.s - a.s));
  }

  finish() {
    const g = this.game;
    const mine = this.racers[0];
    // whoever hasn't crossed yet gets ranked by distance
    const rest = this.racers.filter((r) => !r.done).sort((a, b) => b.s - a.s);
    for (const r of rest) { r.done = true; r.place = ++this.finished; r.behind = Math.max(0, this.race.dist - r.s); }
    const race = this.race;
    const place = mine.place;
    const prize = place <= 3 ? Math.round(race.purse * SHARE[place - 1]) : 0;
    const betWin = place === 1 ? Math.round(this.bet * this.odds) : 0;
    const genes = mine.genes;
    genes.races = (genes.races || 0) + 1;
    if (place === 1) {
      g.stats.raceWins = (g.stats.raceWins || 0) + 1;
      genes.wins = (genes.wins || 0) + 1;
      g.style(60, 'DERBY WIN');
      g.hud.alert(`${genes.name.toUpperCase()} WINS THE ${race.name.toUpperCase()}!`, '#7dff3a', 4);
      if (g.highlights && g.highlights.capture) {
        try { g.highlights.capture(g.camera, `${genes.name} won the ${race.name}`, 60); } catch { /* no snapshot */ }
      }
    } else g.hud.alert(`${genes.name.toUpperCase()} FINISHED #${place}`, place <= 3 ? '#ffd23f' : '#ff9f1c', 3);
    if (prize) g.addCredits(prize, `${race.name} purse`);
    if (betWin) g.addCredits(betWin, 'Derby bet');
    g.alchemy.save();
    g.save();
    this.state = 'cooldown';
    const order = this.order();
    const rows = order.map((r) => `<div class="race-row ${r.mine ? 'mine' : ''}"><b>${r.place}</b> ${r.genes.name} <small>(${r.genes.tier})</small><span>${r.behind !== undefined ? `+${fmt(r.behind)} m` : `${r.time.toFixed(1)}s`}</span></div>`).join('');
    const quip = place === 1 ? pick(['Wire to wire. Beautiful. Terrifying, but beautiful.', 'The crowd is chanting its name. One of its names.', 'Dr. Zbornak will want a sample.'])
      : place <= 3 ? pick(['In the money!', 'A podium finish. The podium is slightly sticky now.'])
        : this.bet ? `Lost your ₵${this.bet} bet. ${pick(['It tried its best. Probably.', 'One of its heads wasn\'t committed.', 'Maybe add more legs.', race.dist >= 2000 ? 'It ran out of puff. Breed for stamina for the long ones.' : 'Have you tried more antimatter?'])}` : pick(['Next time.', 'It had fun. Probably.']);
    const money = [prize ? `purse ₵${fmt(prize)}` : '', betWin ? `bet ₵${fmt(betWin)}` : ''].filter(Boolean).join(' + ');
    g.dialog(`${race.name.toUpperCase()} · RESULT`, `<div class="race-result">${rows}</div><p>Your <b>${genes.name}</b> finished <b>#${place}</b>${money ? `: you collect ${money}` : ''}. ${quip}</p>`, [
      { label: '1 · BACK TO THE STANDS', fn: () => this.clear() },
      { label: '2 · SEE THE RACE CARD', fn: () => { this.clear(); this.open(); } },
    ]);
  }

  clear() {
    const g = this.game;
    for (const r of this.racers) r.m.root.removeFromParent();
    this.racers = [];
    this.entrant = null;
    this.race = null;
    this.state = 'idle';
    this.gate.root.visible = false;
    this.panel.classList.add('hidden');
    this.lastHtml = '';
    g.alchemy.syncChimeras();
    if (g.state === 'derby') g.state = 'play';
    g.updateCamera(0.016, true);
  }

  // ---------- the big screen and the race board ----------
  drawScreen() {
    const { ctx: x, c, tex } = this.screen;
    const W = c.width, H = c.height;
    x.fillStyle = '#0d0a1a'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1d4632'; x.fillRect(0, 0, W, 40);
    x.fillStyle = '#ffffff'; x.font = pixelFont(20); x.textBaseline = 'middle';
    if (this.state !== 'idle' && this.race) {
      x.textAlign = 'left';
      x.fillText(this.race.name.toUpperCase(), 14, 21);
      x.textAlign = 'right';
      const togo = Math.max(0, this.race.dist - this.order()[0].s);
      x.fillText(this.state === 'countdown' ? 'GET READY' : togo > 0 ? `${fmt(togo)} M` : 'FINISH!', W - 14, 21);
      this.order().forEach((r, i) => {
        const y = 66 + i * 46;
        x.fillStyle = r.mine ? '#7dff3a' : '#ffd23f'; x.textAlign = 'left'; x.font = pixelFont(24);
        x.fillText(`${r.done ? r.place : i + 1}`, 16, y);
        x.fillStyle = '#ffffff'; x.font = pixelFont(18);
        x.fillText(r.genes.name.slice(0, 22).toUpperCase(), 56, y);
        x.fillStyle = '#2a2540'; x.fillRect(56, y + 14, 300, 6);
        x.fillStyle = r.stam < 0.25 ? '#ff9f1c' : '#7dff6a'; x.fillRect(56, y + 14, 300 * r.stam, 6);
      });
    } else {
      x.textAlign = 'center';
      x.fillText('★ CHIMERA DOWNS ★', W / 2, 21);
      x.font = pixelFont(16);
      if (!this.card.length) { x.fillStyle = '#ffd23f'; x.fillText(`NEXT RACE POSTS IN ${Math.ceil(this.postT)}s`, W / 2, H / 2); }
      this.card.forEach((r, i) => {
        const y = 70 + i * 62;
        x.fillStyle = '#ffd23f'; x.textAlign = 'left'; x.font = pixelFont(18);
        x.fillText(r.name.toUpperCase(), 16, y);
        x.fillStyle = '#9be7ff'; x.font = pixelFont(13);
        x.fillText(`${fmt(r.dist)} M · CLASS ${r.cls} · ${CONDITIONS[r.cond].name} · PURSE ${fmt(r.purse)}`, 16, y + 24);
      });
    }
    tex.needsUpdate = true;
  }

  drawBoard() {
    const { ctx: x, c, tex } = this.board;
    const W = c.width, H = c.height;
    x.fillStyle = '#16121f'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ffd23f'; x.fillRect(0, 0, W, 44);
    x.fillStyle = '#16121f'; x.font = pixelFont(22); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('TODAY\'S RACE CARD', W / 2, 23);
    if (!this.card.length) { x.fillStyle = '#9be7ff'; x.font = pixelFont(15); x.fillText('NEXT RACE POSTING SOON', W / 2, H / 2); }
    this.card.forEach((r, i) => {
      const y = 76 + i * 76;
      x.textAlign = 'left';
      x.fillStyle = '#f2d27a'; x.font = pixelFont(22); x.fillText(String(i + 1), 14, y);
      x.fillStyle = '#ffffff'; x.font = pixelFont(16); x.fillText(r.name.toUpperCase(), 48, y);
      x.fillStyle = '#9be7ff'; x.font = pixelFont(12);
      x.fillText(`${fmt(r.dist)} M ${r.cat} · CLASS ${r.cls} · ${CONDITIONS[r.cond].name}`, 48, y + 22);
      x.fillStyle = '#7dff6a';
      x.fillText(`PURSE ₵${fmt(r.purse)} · ENTRY ₵${r.fee} · ${Math.ceil(r.ttl / 60)} MIN`, 48, y + 40);
    });
    tex.needsUpdate = true;
  }
}
