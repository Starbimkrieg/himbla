import * as THREE from 'three';
import { toon, inkMat } from './toon.js';
import { frameQuat } from './geo.js';
import { pick } from './rng.js';
import { spliceGenes, makeChimera, LIVING, DRAWN } from './chimera.js';
import { chimeraReady } from './chimerabuild.js';
import { ensureStats, statTotal, newRace, stepRace, CONDITIONS, CATS, DRILLS, train, careerNext, SEASONS, SEASON_RACES, STAT_INFO } from './chimerastats.js';
import { SKILLS, skillPool, rollSkill } from './chimeraskills.js';
import { chimeraCard, cardList } from './chimeracard.js';
import { makeDownsPart, downsNode, downsSlot, makeFigure } from './models.js';
import { buildDowns } from './downsWorld.js';
import { LAP, LANES, RAIL_IN, RAIL_OUT, FINISH_U, STAND, FAR, CLUB, WINDOW, BOARD, DRUM, PODIUMS, ENTRIES, STABLES, ARCADE, stallsOf, oval } from './downsPlan.js';
import { pixelFont } from './fonts.js';
import { DOWNS_SHOP } from './locations.js';
import { bendPoint, bendQuat } from './curve.js';

// Chimera Downs: a proper racecourse for the things that crawl out of Dr. Zbornak's reactor.
// A dirt oval, a grandstand full of cheering spectators, a screen drum, a finish arch, winners' podiums, and a clubhouse whose
// board posts three races at a time, one in each section (EASY, MEDIUM, HARD), each with its own distance (450 m sprints to
// 3.6 km marathons), going, purse and field of five rivals. Enter one of your chimeras, scout the field, bet on it, and the
// camera locks onto it for the race (1-5 or C switch cameras, the mouse orbits). The race itself is chimerastats.js's model:
// six runners fighting for the rail, drafting, passing, pushing on their stamina and firing their skills. When it is over, the
// first three stand on a podium and the camera swings round to them behind the result.
//
// Every chimera has a career (chimerastats.js): three seasons of three races and a tournament (the Regolith Guineas, the Lunar
// Derby, the Dark Side St. Leger), a training session banked for each race run (spent at the Training Yard in the stables), a
// skill to learn now and then from a win, and retirement after the third tournament. Win all three tournaments: the Triple Crown.

// The oval, the stands and the grounds are in downsPlan.js (the location's frame: two 180 m straights joined by half circles; the finish at x = 45 on the home straight).
const FIELD = 6;

const BETS = [0, 50, 200, 500];
const SHARE = [0.6, 0.25, 0.15]; // purse split for 1st / 2nd / 3rd
const TIERS = ['C', 'B', 'A', 'S'];
// The card's three sections: who may enter (grades), how strong the rivals are (their stat totals, with training on top of
// their parts to reach them) and how many skills they know, the purse, and the flat bet payout (no odds: you find out by racing).
const SECTIONS = {
  easy: { name: 'EASY', i: 0, grades: ['C', 'B'], band: [196, 226], skills: [0, 0], purse: 160, pays: 2.5 },
  medium: { name: 'MEDIUM', i: 1, grades: ['C', 'B', 'A'], band: [228, 258], skills: [0, 1], purse: 380, pays: 3.5 },
  hard: { name: 'HARD', i: 2, grades: TIERS, band: [258, 296], skills: [1, 3], purse: 850, pays: 5 },
};
const SEC_KEYS = ['easy', 'medium', 'hard'];
// one tournament a season, each longer and stronger than the last
const CUPS = [
  { name: 'Regolith Guineas', dist: 1600, band: [236, 262], skills: [1, 1], purse: 2000, pays: 4 },
  { name: 'Lunar Derby', dist: 2400, band: [262, 290], skills: [1, 2], purse: 4000, pays: 5 },
  { name: 'Dark Side St. Leger', dist: 3200, band: [286, 318], skills: [2, 4], purse: 8000, pays: 6 },
];
const RIVALS = [
  'Glue Factory Escapee', 'Mare-y Poppins', 'Hoof Hearted', 'Sir Trots-a-Lot', 'Neigh Sayer', 'Seabiscuit II (Moon)',
  'Gallop Poll', 'Unbridled Horror', 'Bad Genes', 'Whinny the Pooh', 'Stable Genius', 'Foal Play', 'Hay Hey Hey', 'Clip Clop Cthulhu',
  'Legs Eleven', 'Regolith Rocket', 'Six Knees', 'Mostly Harmless', 'Crater Tot', 'Sample 7B', 'Do Not Feed', 'Lunar Tick',
  'Tranquility Base Jumper', 'Furlong Shot', 'Dust Devil', 'Odd Socks', 'Photon Finish', 'Earthshine', 'Sir Gallops-a-Lot', 'Pyroclast',
];
const RACE_NAMES = {
  SPRINT: ['Tycho Dash', 'Regolith Sprint', 'Crater Rim Scurry', 'Pulse Spinner Sprint', 'Short Fuse Stakes'],
  MILE: ['Copernicus Mile', 'Kepler Cup', 'Mare Imbrium Mile', 'Crater Handicap', 'Tranquility Trot'],
  MEDIUM: ['Antimatter Classic', 'Zbornak Invitational', 'Lucky Crater Stakes', 'Meridian Gold Cup', 'Vostok Grand Prix'],
  LONG: ['Dark Side Marathon', 'Long Night Endurance', 'Terminator Trek', 'Grand Lunar Marathon', 'Earthrise Ultra'],
};
const CAT_NAME = { SPRINT: 'sprint', MILE: 'mile', MEDIUM: 'medium', LONG: 'long' };
// The six-stall starting gate (tools/blender/build_downs_course.py builds two designs, A and B; GATE picks the one the course uses):
// where each stall's doors hang (their hinges, either side of the stall's centre) and its number plate.
const GATES = { a: { hinge: 1.45, doorZ: 0.1, plateY: 4.05, plateZ: 0.16 }, b: { hinge: 1.45, doorZ: 0.1, plateY: 4.46, plateZ: 0.24 } };
export const GATE = 'b';
const GATE_PARK = RAIL_OUT - 2.7;          // where the gate is towed to once the field has gone: lying along the track, its back (2.3 m deep, toward the outside) 0.4 m inside the outer rail
const CAMS = ['chase', 'rail', 'leader', 'stands', 'blimp'];
const CAM_NAME = { chase: 'CHASE', rail: 'RAIL', leader: 'LEADER', stands: 'GRANDSTAND', blimp: 'BLIMP' };
const MOD_KINDS = ['water', 'rock', 'dirt', 'mud', 'wiring', 'engine'];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(), _f = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _o = {}, _bq = new THREE.Quaternion();
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const rand = (a, b) => a + Math.random() * (b - a);
// Canvas text fitted to `maxW`: at `size` px if it fits, else the largest whole size that does (not under `min`), else ellipsised.
// The pixel face is wide (full-em glyphs), so long names would run into neighbours. Uses the context's fill, align and baseline
// at (px, py); returns the size used.
function fitText(x, str, px, py, maxW, size, min = 10) {
  x.font = pixelFont(size);
  let w = x.measureText(str).width;
  if (w > maxW) {
    size = Math.max(min, Math.floor((size * maxW) / w));
    x.font = pixelFont(size);
    w = x.measureText(str).width;
    while (w > maxW && size > min) { x.font = pixelFont(--size); w = x.measureText(str).width; }
    if (w > maxW) {
      while (str.length > 1 && x.measureText(str + '…').width > maxW) str = str.slice(0, -1);
      str = str.trimEnd() + '…';
    }
  }
  x.fillText(str, px, py);
  return size;
}
export class Race {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.racers = [];
    this.entrant = null;
    this.card = [];                       // the posted races, at most one per section
    this.postT = { easy: rand(20, 40), medium: rand(30, 50), hard: rand(40, 60) };
    this.cups = new Map();                // a chimera's tournament field, drawn once per season (so backing out of the scouting can't re-roll it)
    this.nextId = 1;
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
    this.viewing = false;
    this.drag = null;                     // a drag in progress: the standings panel's, or the camera's (orbiting)
    this.orbit = [0, 0];                  // the camera drag's movement since the last frame
    this.panelAt = null;                  // where you dragged the standings to (null: its place at the top centre)
    this.hookView();
    if (this.loc) {
      this.build();
      // the board opens with two of its three sections posted
      this.post('easy');
      this.post('medium');
    }
  }

  // ================= the racecourse =================
  build() {
    const w = this.game.world;
    const loc = this.loc;
    buildDowns(w, loc);

    // ---- moving parts ----
    // live canvases: drum screens (dn_drum; one for both long faces, one for both ends), the race card board in the
    // clubhouse recess, and a plate on each podium backdrop
    this.screen = this.canvasPlane(512, 256, DRUM.w, DRUM.h);
    w.put(this.screen.mesh, loc, DRUM.x, DRUM.z + DRUM.d / 2 + 0.03, DRUM.yc, 0, true);
    w.put(new THREE.Mesh(this.screen.mesh.geometry, this.screen.mesh.material), loc, DRUM.x, DRUM.z - DRUM.d / 2 - 0.03, DRUM.yc, Math.PI, true);
    this.endScreen = this.canvasPlane(256, 366, DRUM.end, DRUM.h);
    w.put(this.endScreen.mesh, loc, DRUM.x + DRUM.w / 2 + 0.53, DRUM.z, DRUM.yc, Math.PI / 2, true);
    w.put(new THREE.Mesh(this.endScreen.mesh.geometry, this.endScreen.mesh.material), loc, DRUM.x - DRUM.w / 2 - 0.53, DRUM.z, DRUM.yc, -Math.PI / 2, true);
    this.board = this.canvasPlane(512, 300, BOARD.w, BOARD.h);
    w.put(this.board.mesh, loc, BOARD.x, CLUB.z1 - 5 + 0.37, BOARD.y, 0, true);
    this.plates = PODIUMS.xs.map((px) => {
      const p = this.canvasPlane(704, 90, PODIUMS.plate.w, PODIUMS.plate.h);
      w.put(p.mesh, loc, px, PODIUMS.z + PODIUMS.plate.z + 0.03, PODIUMS.plate.y, 0, true);
      return p;
    });
    this.podiumResult = null;
    // starting gate (moved to each race's start)
    this.gate = this.makeGate();
    this.gate.root.visible = false;
    w.put(this.gate.root, loc, 0, 0, 0, 0, true);
    // crowd: outlined spectators in both stands
    this.buildCrowd();
    // foot traffic: racegoers on the forecourt, the aprons, round the arcades and at the fairground, never on the track or the infield (loc.walkBlocked,
    // set by buildDowns, also keeps them out of the stands, stalls and fountain; world.js clearWalk)
    w.addFigures(loc, 40, {
      kind: 'worker',
      look: (i) => (i % 7 === 6 ? { kind: 'kid', scale: 0.6 } : { look: ['casual', 'casual', 'trader', 'elder'][i % 4] }),
      // each walker keeps to one patch: forecourt, apron, arcade walk, fairground or the gates
      area: (out, f) => {
        if (f.zone === undefined) { const q = Math.random(); f.zone = q < 0.35 ? 0 : q < 0.5 ? 1 : q < 0.8 ? 2 : q < 0.95 ? 3 : 4; f.side = Math.random() < 0.5 ? -1 : 1; f.arc = 114 + Math.random() * 144; }
        for (let n = 0; n < 24; n++) {
          if (f.zone === 0) out.set(-60 + Math.random() * 120, 0, CLUB.z1 + 6 + Math.random() * 36);
          else if (f.zone === 1) out.set(-100 + Math.random() * 200, 0, (f.side > 0 ? 1 : -1) * (RAIL_OUT + 4 + Math.random() * 5));
          else if (f.zone === 2) {
            // paces round its own turn's arcade (between the turn and the stands): a few metres along it at a time
            f.arc = THREE.MathUtils.clamp(f.arc + (Math.random() - 0.5) * 30, ARCADE.walk[0] + 2, ARCADE.walk[1] - 2);
            const a = f.arc * Math.PI / 180, r = ARCADE.ri + 1 + Math.random() * (ARCADE.ro - ARCADE.ri - 2);
            out.set(f.side * (90 - r * Math.cos(a)), 0, r * Math.sin(a));
          } else if (f.zone === 3) out.set(136 + Math.random() * 66, 0, 112 + Math.random() * 50);
          else out.set(f.side * (198 + Math.random() * 18), 0, -24 + Math.random() * 48);
          if (!loc.walkBlocked(out.x, out.z)) break;
        }
        return out;
      },
    });
    loc.group.updateMatrixWorld(true);
    this.booth = w.toWorld(loc, WINDOW[0], 0, WINDOW[1]);
    // six betting windows along the clubhouse front
    this.windows = [-24.5, -17, -9.5, 9.5, 17, 24.5].map((x) => w.toWorld(loc, x, 0, CLUB.z1 - 3.2));
    // the Training Yard: a trainer in the stable yard, by the lunge ring
    const [tx, tz] = STABLES.trainer;
    const trainer = makeFigure({ look: 'trader', seed: 4417, suit: 0x8b4044 });
    w.put(trainer.root, loc, tx, tz, 0, 0, true);
    this.yard = w.toWorld(loc, tx, 0, tz);
    this.stabled = null;                  // the chimeras in the boxes: put in when the kit has loaded and you are at the course (stable())
  }

  // A third of the boxes have a chimera in them, a rival's sort (two kinds or three), sized so its head is over the shut lower door (2.6 m tall, the
  // straw 0.58 m up), looking out. They idle while you are in the yard.
  stable() {
    const w = this.game.world, boxes = stallsOf(STABLES);
    this.stabled = [];
    for (let i = boxes.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [boxes[i], boxes[j]] = [boxes[j], boxes[i]]; }
    for (const [x, z, yaw] of boxes.slice(0, Math.round(boxes.length / 3))) {
      const a = pick(LIVING), items = [{ kind: a }, { kind: pick(LIVING.filter((q) => q !== a)) }];
      if (Math.random() < 0.3) items.push({ kind: pick(LIVING) });
      const genes = spliceGenes(items), m = makeChimera(genes);
      m.root.scale.setScalar(THREE.MathUtils.clamp(2.6 / m.height, 0.7, 2.6));
      w.put(m.root, this.loc, x, z, 0.58, yaw, true);
      this.stabled.push({ m, genes, t: Math.random() * 10 });
    }
    this.stableAt = w.toWorld(this.loc, 0, 0, -130);
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

  // The six-stall starting gate (tools/blender/build_downs_course.py, design A or B): a frame across the lanes and stall doors that spring open.
  makeGate(style = GATE) {
    const root = new THREE.Group();
    const n = LANES.length, mid = (LANES[0] + LANES[n - 1]) / 2, G = GATES[style];
    // across the lanes = local x (outer lanes at -x), forward = +z
    root.add(makeDownsPart(`dn_gate6_frame_${style}`));
    const doors = [];
    for (let i = 0; i < n; i++) {
      const xc = -(LANES[i] - mid);
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(xc + s * G.hinge, 0, G.doorZ);
        const d = makeDownsPart(`dn_gate6_door_${style}`);
        d.scale.x = s > 0 ? 1 : -1;          // (the model reaches toward -x from its hinge)
        hinge.add(d);
        root.add(hinge);
        doors.push({ g: hinge, s });
      }
      const num = this.numberPlate(i + 1);
      num.position.set(xc, G.plateY, G.plateZ);
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

  // the gate at centre-line distance u, its middle `rad` from the oval's centre, turned `turn` from across the track
  placeGate(u, rad = this.gate.mid, turn = 0) {
    const G0 = this.gate;
    oval(u, rad, _o);
    const yaw = Math.atan2(_o.hx, _o.hz) + turn, R = this.game.world.curveR(this.loc);
    G0.root.position.set(_o.x, 0.05, _o.z);
    G0.root.rotation.y = yaw;
    if (R) { // on the curved plateau (curve.js)
      bendPoint(R, _o.x, 0.05, _o.z, G0.root.position);
      G0.root.quaternion.setFromAxisAngle(_Y, yaw).premultiply(bendQuat(R, _o.x, _o.z, _bq));
    }
    G0.root.visible = true;
  }

  // Once the whole field is 30 m clear, the gate is towed out of the way before they come round again (any race over a lap): the
  // doors close, it swings round to lie along the track and slides to the outer edge, where it stands just inside the outer rail (the
  // race model keeps the runners off that strip: X_MAX in chimerastats.js). 5 s in all; a lap takes about 20.
  towGate(dt) {
    const G0 = this.gate;
    if (G0.towT === undefined) {
      if (this.racers.some((r) => !r.done && r.s < 30)) return;
      G0.towT = 0;
    }
    if (G0.towT >= 5) return;
    G0.towT = Math.min(5, G0.towT + dt);
    const t = G0.towT, ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    this.setGate(1 - ease(t / 1.2));
    this.placeGate(this.startU, G0.mid + (GATE_PARK - G0.mid) * ease((t - 1.6) / 3.4), (Math.PI / 2) * ease((t - 0.6) / 1.6));
  }

  setGate(k) {
    this.gate.open = k;
    for (const d of this.gate.doors) d.g.rotation.y = d.s * k * 1.9;
  }

  // Crowd: seated fans dressed from the kit wardrobe (tools/blender/build_downs_crowd.py): suit or frock, arms resting, on a
  // programme or binoculars, hairdo, some a hat, a rosette or scarf in derby colours. Each part is instanced (one InstancedMesh per
  // slot plus one for its ink shell) holding only its wearers, so a variant costs only those fans; a part's meshes share one
  // matrix buffer. Fans bob; in exciting moments they jump and wavers throw up arms (or a pennant).
  buildCrowd() {
    const seats = [];
    // seat strips 0.95 m behind each tier's front edge; none in aisles, front-corner towers or the main stand's top tier (suites)
    const sit = (S, count, face, sign, towerW) => {
      for (let i = 0; i < count; i++) {
        const tier = Math.floor(Math.random() * (S === STAND ? S.tiers - 1 : S.tiers));
        let x;
        do x = S.x0 + 1 + Math.random() * (S.x1 - S.x0 - 2); while (S.aisles.some((a) => Math.abs(x - a) < 1.6) || (tier < 4 && Math.abs(x) > S.x1 - towerW - 1) || (tier <= (S === STAND ? 3 : 4) && ENTRIES.some((e) => Math.abs(x - e) < 4.6)));   // nor where a tunnel cuts through the lower tiers
        seats.push({ x, y: (tier + 1) * S.rise + 0.3, z: sign * (S.z0 + tier * S.depth + 0.95), face });
      }
    };
    sit(STAND, 760, Math.PI, 1, 8.7);
    sit(FAR, 300, 0, -1, 7.7);
    const N = seats.length;
    // racegoer colours: clothes from the Downs palette, its darker tints and navy; skin and hair tones; favours (ties, rosettes,
    // scarves, hat bands) in derby colours only: Barn Red and its maroon, Gold, Money Green, Mint
    const COAT = [0x3b393a, 0x8b4044, 0x7b9a6e, 0xcfb352, 0xb07c57, 0xf8fff8, 0x2f4f7a, 0x5b7a52, 0xdfe8dd, 0x6a2e33];
    const FROCK = [0x8b4044, 0x7b9a6e, 0xcfb352, 0xf8fff8, 0xdfe8dd, 0x2f4f7a, 0xb07c57, 0x6a2e33, 0x5b7a52];
    const SHIRT = [0xf8fff8, 0xf8fff8, 0xdfe8dd, 0xcfb352];
    const LEGS = [0x3b393a, 0x5a5760, 0x8c5f3f, 0x2f4f7a, 0xdfe8dd, 0x3b393a];
    const SKIN = [0xf1c9a5, 0xd8a47f, 0xa8714f, 0x6e4632, 0xe9b98f];
    const HAT = [0x3b393a, 0xdfe8dd, 0x8b4044, 0x5b7a52, 0xcfb352, 0xf8fff8, 0xb07c57];
    const HAIR = [0x2a1d18, 0x5a3a22, 0x9a6a3a, 0xd8b56a, 0x8a8698, 0x1d1a29];
    const BAND = [0x8b4044, 0xcfb352, 0x7b9a6e, 0xf8fff8, 0x6a2e33];
    const any = (a) => a[Math.floor(Math.random() * a.length)];
    const other = (a, not) => { let v; do v = any(a); while (not.includes(v)); return v; };    // contrast: shirt vs jacket; favour vs shirt, jacket and hat
    const pickw = (w) => { let r = Math.random() * w.reduce((s, e) => s + e[1], 0); for (const [n, k] of w) if ((r -= k) < 0) return n; return w[0][0]; };
    this.crowd = seats.map((s) => {
      const suit = Math.random() < 0.55;
      const rest = pickw([['dn_fan_lap', 70], ['dn_fan_prog', 18], ['dn_fan_bino', 12]]);
      const wave = rest !== 'dn_fan_bino' && Math.random() < 0.6;                                  // binocular fans keep watching
      const coat = suit ? any(COAT) : any(FROCK), hat = any(HAT);
      const p = {
        ...s, ph: Math.random() * 10, f: 6 + Math.random() * 5, jump: Math.random(), sc: 0.92 + Math.random() * 0.2, wave,
        body: suit ? 'dn_fan_body' : 'dn_fan_body2', rest, cheer: wave ? (Math.random() < 0.35 ? 'dn_fan_arm1' : 'dn_fan_arms') : null,
        hair: pickw(suit ? [['dn_fan_hair', 5], ['dn_fan_hair_thin', 3], ['dn_fan_hair_bun', 1], ['dn_fan_hair_long', 1]] : [['dn_fan_hair_bun', 4], ['dn_fan_hair_long', 4], ['dn_fan_hair', 2]]),
        // no flat cap or race-day hat with binoculars: peak and brim hit the barrels
        hat: Math.random() < 0.5 ? pickw((suit ? [['dn_fan_derby', 4], ['dn_fan_cap', 3], ['dn_fan_boater', 3], ['dn_fan_tophat', 2]] : [['dn_fan_sunhat', 4], ['dn_fan_fascinator', 4], ['dn_fan_boater', 2], ['dn_fan_derby', 1]])
          .filter(([n]) => rest !== 'dn_fan_bino' || (n !== 'dn_fan_cap' && n !== 'dn_fan_sunhat'))) : null,
        favour: Math.random() < 0.22 ? 'dn_fan_rosette' : Math.random() < 0.12 ? 'dn_fan_scarf' : null,
      };
      const shirt = other(SHIRT, [coat]);
      p.tint = { coat, shirt, legs: suit ? any(LEGS) : coat, skin: any(SKIN), hair: any(HAIR), hat, band: other(BAND, [shirt, coat, hat]) };
      return p;
    });
    // one layer per part: its wearers (resting-arm wavers last, so a cheer hides them by count), in the body frame or the head's (0.66 m up)
    const HEAD = new Set(['dn_fan_head', 'dn_fan_hair', 'dn_fan_hair_bun', 'dn_fan_hair_long', 'dn_fan_hair_thin', 'dn_fan_cap', 'dn_fan_derby', 'dn_fan_tophat', 'dn_fan_boater', 'dn_fan_sunhat', 'dn_fan_fascinator']);
    const TINT = new Set(['coat', 'shirt', 'legs', 'skin', 'hair', 'hat', 'band']);             // per-fan tinted slots; the rest keep Downs colours
    const wear = new Map();
    const put = (name, i, kind) => { if (!wear.has(name)) wear.set(name, { name, kind, fans: [] }); wear.get(name).fans.push(i); };
    this.crowd.forEach((p, i) => {
      put('dn_fan_legs', i, 'all'); put(p.body, i, 'all'); put('dn_fan_head', i, 'all'); put(p.hair, i, 'all');
      put(p.rest, i, 'rest');
      if (p.cheer) put(p.cheer, i, 'cheer');
      if (p.hat) put(p.hat, i, 'all');
      if (p.favour) put(p.favour, i, 'all');
    });
    const c = new THREE.Color();
    this.crowdLayers = [...wear.values()].map((L) => {
      if (L.kind === 'rest') L.fans.sort((a, b) => this.crowd[a].wave - this.crowd[b].wave);
      const n = L.fans.length, node = downsNode(L.name);
      const mat4 = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16).setUsage(THREE.DynamicDrawUsage);
      const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, n); m.instanceMatrix = mat4; m.frustumCulled = false; return m; };
      const meshes = node.parts.map(({ slot, geo }) => {
        const m = mk(geo, TINT.has(slot) ? toon(0xffffff) : toon(downsSlot(slot).color));
        if (TINT.has(slot)) { L.fans.forEach((i, j) => m.setColorAt(j, c.setHex(this.crowd[i].tint[slot]))); m.instanceColor.needsUpdate = true; }
        return m;
      });
      if (node.ink) meshes.push(mk(node.ink, inkMat));
      return { ...L, head: HEAD.has(L.name), calm: L.kind === 'rest' ? L.fans.filter((i) => !this.crowd[i].wave).length : n, meshes, mat4 };
    });
    this.crowdM = new Float32Array(N * 32);                                                          // each fan's body and head matrices, per frame
    for (const L of this.crowdLayers) for (const m of L.meshes) this.game.world.put(m, this.loc, 0, 0, 0, 0, true);
    this.updateCrowd(0);
  }

  updateCrowd(t) {
    const ex = this.excite, R = this.game.world.curveR(this.loc), M = this.crowdM, cheer = ex > 0.35;
    for (let i = 0; i < this.crowd.length; i++) {
      const p = this.crowd[i];
      // fans bob; when excited they leap and wave
      const hop = ex > 0.05 ? Math.max(0, Math.sin(t * p.f + p.ph)) * (0.25 + p.jump * 0.9) * ex : Math.max(0, Math.sin(t * 1.3 + p.ph)) * 0.05;
      const sway = Math.sin(t * 0.9 + p.ph) * 0.06;
      const k = p.sc;
      const y = p.y + 0.5 * k + hop;
      // stands are on a curved plateau: each fan is placed and turned on the sphere (curve.js)
      _q.setFromAxisAngle(_Y, p.face + sway);
      if (R) _q.premultiply(bendQuat(R, p.x, p.z, _bq));
      _s.set(k, k, k);
      _p.set(p.x, y, p.z);
      if (R) bendPoint(R, p.x, y, p.z, _p);
      _m4.compose(_p, _q, _s).toArray(M, i * 32);
      const yh = y + 0.66 * k;
      _p.set(p.x, yh, p.z);
      if (R) bendPoint(R, p.x, yh, p.z, _p);
      _m4.compose(_p, _q, _s).toArray(M, i * 32 + 16);
    }
    // each layer copies its fans' matrices; cheer arms only while cheering, when wavers' resting arms drop out (sorted last, cut by count)
    for (const L of this.crowdLayers) {
      const n = L.kind === 'cheer' ? (cheer ? L.fans.length : 0) : L.kind === 'rest' && cheer ? L.calm : L.fans.length;
      for (const m of L.meshes) m.count = n;
      const a = L.mat4.array, off = L.head ? 16 : 0;
      for (let j = 0; j < n; j++) {
        const src = L.fans[j] * 32 + off, dst = j * 16;
        for (let e = 0; e < 16; e++) a[dst + e] = M[src + e];
      }
      L.mat4.needsUpdate = true;
    }
  }

  // race keeps the camera during the result dialog (finishers on the podium)
  holdsCamera() { return this.state === 'cooldown' && this.camMode === 'podium'; }

  near(p) { return !!this.booth && this.loc.active && this.windows.some((q) => p.distanceTo(q) < 5.5); }
  nearYard(p) { return !!this.yard && this.loc.active && p.distanceTo(this.yard) < 4.5; }

  // ================= the race card =================
  post(sec) {
    const cat = pick(sec === 'easy' ? ['SPRINT', 'SPRINT', 'MILE', 'MILE', 'MEDIUM'] : sec === 'medium' ? ['SPRINT', 'MILE', 'MILE', 'MEDIUM', 'MEDIUM', 'LONG'] : ['SPRINT', 'MILE', 'MEDIUM', 'MEDIUM', 'LONG', 'LONG']);
    const [a, b] = CATS[cat];
    const dist = Math.round(rand(a, b) / 50) * 50;
    const cond = pick(['fast', 'fast', 'dusty', 'dusty', 'dusty', 'heavy', 'heavy', 'lowg']);
    const used = new Set(this.card.map((r) => r.name));
    let name;
    for (let i = 0; i < 8 && (!name || used.has(name)); i++) name = pick(RACE_NAMES[cat]);
    const S = SECTIONS[sec];
    const purse = Math.round((S.purse * (0.75 + dist / 2400)) / 10) * 10;
    const race = {
      id: this.nextId++, name, cat, dist, sec, cond, purse, pays: S.pays,
      fee: Math.max(10, Math.round((purse * 0.12) / 10) * 10),
      field: this.makeRivals(S.band, S.skills, cat, dist, sec === 'hard' ? 0.08 : 0), ttl: rand(360, 540),
    };
    this.card.push(race);
    this.card.sort((x, y) => SECTIONS[x.sec].i - SECTIONS[y.sec].i);
    const g = this.game;
    if (this.loc.active && g.currentZone === this.loc) g.hud.toast(`🏁 Posted (${S.name}): ${race.name} · ${fmt(dist)} m`, 3);
    return race;
  }

  // Five rivals for a field: each a fresh splice, trained up to a stat total in `band`, knowing a few skills (the race's kind of
  // skills, and now and then Chimera Soul).
  makeRivals(band, skills, cat, dist, soul = 0) {
    const out = [];
    const used = new Set();
    for (let i = 0; i < FIELD - 1; i++) {
      const target = rand(band[0], band[1]);
      // the splice whose parts come closest to the target from below, trained the rest of the way
      let best = null;
      for (let c = 0; c < 14; c++) {
        const items = [];
        const a = pick(LIVING);
        items.push({ kind: a }, { kind: pick(LIVING.filter((k) => k !== a)) });          // (two kinds at least: a chimera, never a pair)
        if (Math.random() < 0.3) items.push({ kind: pick(LIVING) });
        if (Math.random() < 0.5) items.push({ kind: pick(MOD_KINDS) });
        const gn = spliceGenes(items);
        const t = statTotal(gn.stats);
        gn.miss = t <= target ? target - t : (t - target) * 3;
        if (!best || gn.miss < best.miss) best = gn;
      }
      delete best.miss;
      const drills = Object.keys(DRILLS);
      for (let k = 0; k < 40 && statTotal(best.stats) < target; k++) train(best, pick(drills));
      const nk = skills[0] + Math.floor(Math.random() * (skills[1] - skills[0] + 1));
      const pool = Object.entries(skillPool(cat, dist));
      for (let k = 0; k < nk; k++) {
        if (soul && !best.skills.includes('chimeraSoul') && Math.random() < soul) { best.skills.push('chimeraSoul'); continue; }
        const left = pool.filter(([id]) => !best.skills.includes(id));
        let x = Math.random() * left.reduce((sum, e) => sum + e[1], 0);
        for (const [id, w] of left) if ((x -= w) <= 0) { best.skills.push(id); break; }
      }
      let name;
      do name = pick(RIVALS); while (used.has(name));
      used.add(name);
      best.name = name;
      best.rival = true;
      out.push(best);
    }
    return out;
  }

  // why `genes` can't run `race` (null if it can)
  barred(race, genes) {
    const c = genes.career, next = careerNext(c);
    if (!next) return 'RETIRED';
    if (race.sec === 'tournament') return next === 'tournament' ? null : `${SEASON_RACES - c.races} RACE${SEASON_RACES - c.races > 1 ? 'S' : ''} TO GO THIS SEASON`;
    if (next === 'tournament') return `SEASON ${c.season} TOURNAMENT DUE`;
    if (!SECTIONS[race.sec].grades.includes(genes.tier)) return `GRADE ${genes.tier}: TOO STRONG FOR ${SECTIONS[race.sec].name}`;
    return null;
  }

  // a race as a tile, the way the screen over the windows shows it: section, name, the distance big, the going, the purse and the
  // terms. The field is left out (the scouting shows it, runner by runner).
  raceTile(r) {
    const C = CONDITIONS[r.cond];
    const sec = r.sec === 'tournament' ? `SEASON ${r.season} CUP` : SECTIONS[r.sec].name;
    const closes = r.sec === 'tournament' ? '' : `<span>closes in ${Math.max(1, Math.ceil(r.ttl / 60))} min</span>`;
    return `<div class="rt rt-${r.sec}"><b class="rt-sec">${sec}</b><b class="rt-name">${r.name.toUpperCase()}</b>`
      + `<b class="rt-dist">${fmt(r.dist)} M</b><span class="rt-cat">${r.cat} · going <i title="${C.blurb}">${C.name}</i></span>`
      + `<b class="rt-purse">PURSE ₵${fmt(r.purse)}</b><span>entry ₵${r.fee} · pays ${r.pays}×</span>${closes}</div>`;
  }

  // ---------- at the window ----------
  open() {
    const g = this.game;
    if (this.state !== 'idle') { g.hud.toast('A race is already running! Watch the track.', 2); return; }
    const ch = g.alchemy.chimeras;
    if (!ch.length) {
      g.dialog('CHIMERA DOWNS', '"No chimera, no race, pal. Go see the egghead at the Antimatter Lab, put two living things in his reactor, and bring me whatever crawls out. Cars count. Mites count. People… legally count."', [{ label: '1 · SHOP', fn: () => this.shop() }, { label: '2 · FINE' }]);
      return;
    }
    ch.forEach(ensureStats);
    const due = ch.filter((c) => careerNext(c.career) === 'tournament');
    const rows = `<div class="rt-row">${SEC_KEYS.map((k) => {
      const r = this.card.find((x) => x.sec === k);
      return r ? this.raceTile(r) : `<div class="rt rt-${k} rt-wait"><b class="rt-sec">${SECTIONS[k].name}</b><span>next race posts in about ${Math.ceil(this.postT[k])} s</span></div>`;
    }).join('')}</div>`;
    const buttons = this.card.map((r) => ({ label: `${SECTIONS[r.sec].name} · ${r.name.toUpperCase()} (${fmt(r.dist)} m)`, fn: () => this.pickRunner(r) }));
    buttons.push({ label: `TOURNAMENTS${due.length ? ` (${due.length} DUE)` : ''}`, fn: () => this.cupMenu() });
    buttons.push({ label: 'HALL OF FAME', fn: () => this.hallOfFame() });
    buttons.push({ label: 'SHOP', fn: () => this.shop() });
    buttons.push({ label: 'NEVER MIND' });
    buttons.forEach((b, i) => { b.label = `${i + 1} · ${b.label}`; });
    g.dialog('RACE CARD', `<small>EASY: grades C, B · MEDIUM: up to A · HARD: anyone · record ${g.stats.raceWins || 0} wins from ${g.stats.raceStarts || 0} starts</small>${rows}`, buttons);
  }

  // the shop at the end of the counter: racing gear, bought with credits once the deed is done. Skates so far (cosmetics.js SKATES, shop 'downs')
  shop() {
    const g = this.game;
    const rows = DOWNS_SHOP.map((u) => {
      const owned = (g.upgrades[u.key] || 0) >= u.max, ok = g.rep.canBuy(u, 0), can = !owned && ok && g.credits >= u.cost;
      const note = owned ? 'OWNED' : ok ? `₵${fmt(u.cost)}` : `🔒 ${u.unlock.text} (${Math.min(u.unlock.n, g.stats[u.unlock.stat] || 0)}/${u.unlock.n})`;
      return { u, can, html: `<p class="race-card"><b>${u.name}</b> · ${note}<br><small>${u.desc}</small></p>` };
    });
    const buttons = rows.map(({ u, can }, i) => ({ label: `${i + 1} · ${u.name.toUpperCase()}`, keep: true, fn: () => { if (can) g.buy(u.key, DOWNS_SHOP, () => this.shop()); } }));
    buttons.push({ label: `${rows.length + 1} · BACK`, fn: () => this.open() });
    g.dialog('DOWNS SHOP', `"Racing gear, tack and trinkets. Credits only; the tote doesn't take IOUs." <small>You have ₵${fmt(g.credits)}.</small>${rows.map((r) => r.html).join('')}`, buttons, { stay: true });
  }

  // the tournaments: one per season, for chimeras that have run their three races
  cupMenu() {
    const g = this.game;
    const ch = g.alchemy.chimeras;
    const due = ch.filter((c) => careerNext(c.career) === 'tournament');
    const rows = CUPS.map((C, i) => `<p class="race-card"><b>SEASON ${i + 1} · ${C.name.toUpperCase()}</b> · ${fmt(C.dist)} m · purse ₵${fmt(C.purse)} · a win always teaches a skill${i === 2 ? ' · win all three for the <b>Triple Crown</b>' : ''}</p>`).join('');
    const cards = due.slice(0, 8).map((c, i) => chimeraCard(g, c, { key: i + 1, button: true, status: `SEASON ${c.career.season} · ${CUPS[c.career.season - 1].name.toUpperCase()}` }));
    g.dialog('TOURNAMENTS', `"The big ones. A chimera gets in once it has run its three races of the season, and the season ends with it, win or lose."${rows}${due.length ? cardList(cards, cards.length) : '<p><small>None of your chimeras is due for one yet.</small></p>'}`, due.slice(0, 8).map((c, i) => ({
      label: `${i + 1} · ${c.name.toUpperCase()} (SEASON ${c.career.season})`,
      fn: () => this.scout(this.cupRace(c), c),
    })).concat([{ label: `${Math.min(8, due.length) + 1} · BACK`, fn: () => this.open() }]));
  }

  cupRace(genes) {
    const c = genes.career, key = `${genes.seed}|${c.season}`;
    if (!this.cups.has(key)) {
      const C = CUPS[c.season - 1];
      const cat = C.dist < 2000 ? 'MILE' : C.dist < 3000 ? 'MEDIUM' : 'LONG';
      this.cups.set(key, { id: this.nextId++, name: C.name, cat, dist: C.dist, sec: 'tournament', season: c.season, cond: pick(['fast', 'dusty', 'dusty', 'heavy']), purse: C.purse, pays: C.pays, fee: Math.round(C.purse * 0.05), field: this.makeRivals(C.band, C.skills, cat, C.dist, 0.1 * c.season) });
    }
    return this.cups.get(key);
  }

  hallOfFame() {
    const g = this.game;
    const list = g.stats.crowns || [];
    const rows = list.length ? list.map((e, i) => `<p class="race-card"><b>${i + 1}. ${e.name}</b> · Triple Crown ${new Date(e.at).toLocaleDateString()} · ${e.wins} win${e.wins === 1 ? '' : 's'} from ${e.races} starts</p>`).join('') : '<p><small>No Triple Crown winner yet. Win the Regolith Guineas, the Lunar Derby and the Dark Side St. Leger with one chimera.</small></p>';
    g.dialog('HALL OF FAME', `"The immortals. Well. The chimeras."${rows}`, [{ label: '1 · BACK', fn: () => this.open() }]);
  }

  pickRunner(race) {
    const g = this.game;
    if (!this.card.includes(race)) { g.hud.toast('That race just closed.', 2); return; }
    const ch = g.alchemy.chimeras.filter((c) => !c.career.retired);
    const recent = [...ch.filter((c) => c.follow), ...ch.filter((c) => !c.follow).reverse()].slice(0, 8);
    recent.forEach(ensureStats);
    const long = race.dist >= 2000;
    const cards = recent.map((c, i) => {
      const no = this.barred(race, c);
      const fit = long ? (c.stats.stamina >= 60 ? 'built to last' : c.stats.stamina < 45 ? '⚠ will tire' : '') : (c.stats.speed >= 60 ? 'quick' : '');
      return chimeraCard(g, c, { key: i + 1, button: true, status: no ? `✖ ${no}` : `${c.follow ? '★ WITH YOU' : 'IN PEN'}${fit ? ` · ${fit}` : ''}` });
    });
    g.dialog(race.name.toUpperCase(), `<div class="rt-row one">${this.raceTile(race)}</div>"Which of your… <i>creatures</i>… is running?" <small>(number key or click)</small>${recent.length ? cardList(cards, recent.length) : '<p><small>All your chimeras are retired. Breed a new one at the lab.</small></p>'}`, recent.map((c, i) => ({
      label: `${i + 1} · ${c.name.toUpperCase()} (${c.tier})`,
      fn: () => {
        const no = this.barred(race, c);
        if (no) { g.hud.toast(`${c.name}: ${no.toLowerCase()}.`, 2.5); this.pickRunner(race); return; }
        this.scout(race, c);
      },
    })).concat([{ label: `${recent.length + 1} · BACK`, fn: () => this.open() }]));
  }

  // Scouting the field, then the bet: every runner's full card (stats, style, skills, growth), and no odds. A win pays the
  // race's flat multiple of the bet.
  scout(race, genes) {
    const g = this.game;
    const field = [genes, ...race.field];
    const cond = CONDITIONS[race.cond];
    const cards = field.map((r, i) => chimeraCard(g, r, { mine: i === 0, tag: i === 0 ? 'YOUR ENTRY' : `STALL ${i + 1}`, full: true }));
    const back = race.sec === 'tournament' ? () => this.cupMenu() : () => this.pickRunner(race);
    g.dialog('SCOUTING THE FIELD', `${race.name} · ${fmt(race.dist)} m ${CAT_NAME[race.cat]} · going ${cond.name}. Entry ₵${race.fee}. A win pays <b>${race.pays}×</b> a bet.<small> No bookie's odds here: read the cards and trust your creature. Distance, going, stats, style and skills all count.</small>${cardList(cards, 0, 'derby')}`, BETS.map((b, i) => ({
      label: b ? `${i + 1} · ENTER + BET ₵${b} (A WIN PAYS ₵${fmt(b * race.pays)})` : `${i + 1} · JUST ENTER (₵${race.fee})`,
      fn: () => {
        const cost = race.fee + b;
        if (g.credits < cost) { g.hud.toast(`Not enough credits (need ₵${cost}).`, 2); return; }
        if (race.sec !== 'tournament' && !this.card.includes(race)) { g.hud.toast('That race just closed.', 2); return; }
        g.credits -= cost;
        g.audio.cash();
        this.start(race, field, b);
      },
    })).concat([{ label: `${BETS.length + 1} · BACK`, fn: back }]));
  }

  // ================= the race =================
  start(race, field, bet) {
    const g = this.game;
    // (which podium set is this race's: its section's, the middle one for a tournament)
    race.slot = race.sec === 'tournament' ? 1 : SECTIONS[race.sec].i;
    this.card = this.card.filter((r) => r !== race);
    if (race.sec !== 'tournament') this.postT[race.sec] = rand(25, 45);
    this.race = race;
    this.podiumResult = null;
    this.cond = CONDITIONS[race.cond];
    this.bet = bet;
    this.entrant = field[0];
    this.startU = FINISH_U - race.dist;
    this.excite = 0.4;
    g.stats.raceStarts = (g.stats.raceStarts || 0) + 1;
    g.alchemy.syncChimeras();
    this.R = newRace(field, { dist: race.dist, cond: this.cond });
    this.racers = this.R.runners.map((r, i) => {
      const m = makeChimera(r.genes);
      g.scene.add(m.root);
      return Object.assign(r, { m, hop: 0, vy: 0, mine: i === 0, tiredSaid: false });
    });
    this.placeGate(this.startU);
    this.setGate(0);
    this.gate.towT = undefined;
    this.state = 'countdown';
    this.timer = 4.5;
    this.finishAt = 0;
    for (const r of this.racers) this.place(r);
    // lock the camera to your runner
    this.camMode = 'chase';
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camP.copy(g.camera.position);
    this.camL.copy(this.racers[0].pos);
    this.camT = 0;
    g.state = 'derby';
    this.setView(true);
    g.hud.prompt(null);
    g.hud.alert(`${race.name.toUpperCase()} — ${fmt(race.dist)} M`, '#ff2e88', 3);
  }

  place(r) {
    const g = this.game;
    const w = g.world;
    const u = this.startU + r.s;
    oval(u, RAIL_IN + r.x, _o);
    w.toWorld(this.loc, _o.x, 0, _o.z, _v);
    g.planet.ground(_v, _v);
    _up.copy(_v).normalize();
    w.toWorld(this.loc, _o.x + _o.hx, 0, _o.z + _o.hz, _f);
    _f.sub(w.toWorld(this.loc, _o.x, 0, _o.z, _w));
    r.m.root.position.copy(_v).addScaledVector(_up, r.hop + 0.1);
    frameQuat(_up, _f, r.m.root.quaternion);
    r.pos = r.m.root.position;
    r.fwd = (r.fwd || new THREE.Vector3()).copy(_f).normalize();
  }

  // the race model reported something for a runner: show it over its head (the bad moments and the skills for everyone; the
  // passes, the sprint and the empty tank for yours)
  eventFx(e) {
    const g = this.game, r = e.r;
    if (!r.pos) return;
    const at = r.pos.clone().addScaledVector(r.pos.clone().normalize(), 4 + (r.genes.size || 1) * DRAWN);
    const mine = r.mine;
    if (e.kind === 'skill') {
      const S = SKILLS[e.id];
      g.fx.pop(`${S.name}!`, at, { color: e.id === 'chimeraSoul' ? '#ff2e88' : mine ? '#7dff3a' : '#2ee6ff', size: e.id === 'chimeraSoul' ? 46 : 32, prio: mine ? 1 : 0 });
      if (e.id === 'chimeraSoul') { g.fx.explosion(r.m.root.position, 2, false); g.audio.roar(0.8); }
      if (mine || e.id === 'chimeraSoul') this.excite = Math.min(1, this.excite + 0.35);
      if (mine) g.audio.tone(988, 0.15, 'square', 0.1);
    } else if (e.kind === 'late') g.fx.pop('LATE START!', at, { color: '#ffd23f', size: 30 });
    else if (e.kind === 'struggle') g.fx.pop(r.genes.extraHead ? 'HEADS ARGUING' : 'SPOT STRUGGLE', at, { color: '#ff9f1c', size: 26 });
    else if (e.kind === 'rushed') g.fx.pop('RUSHED!', at, { color: '#ff4f2e', size: 32 });
    else if (mine && e.kind === 'calm') g.fx.pop('SETTLED', at, { color: '#a8d08d', size: 24 });
    else if (mine && e.kind === 'passed') { g.fx.pop('PASSED!', at, { color: '#7dff3a', size: 30 }); this.excite = Math.min(1, this.excite + 0.2); }
    else if (mine && e.kind === 'sprint') g.fx.pop('FINAL SPRINT!', at, { color: '#2ee6ff', size: 34 });
    else if (e.kind === 'gassed') g.fx.pop(mine ? 'YOURS IS GASSED!' : 'RUNNING ON FUMES', at, { color: '#ff9f1c', size: 26 });
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    // the board keeps one race posted per section, and closes stale ones
    if (this.loc && this.state === 'idle') {
      for (const r of this.card) r.ttl -= dt;
      for (const r of this.card) if (r.ttl <= 0) this.postT[r.sec] = rand(20, 40);
      this.card = this.card.filter((r) => r.ttl > 0);
      for (const k of SEC_KEYS) {
        if (this.card.some((r) => r.sec === k)) continue;
        if ((this.postT[k] -= dt) <= 0) this.post(k);
      }
    }
    // crowd audio: murmur at the course, roar in a race, louder while you lead
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
      if (this.screenT <= 0) { this.screenT = 0.3; this.drawScreen(); this.drawEnd(); this.drawBoard(); this.drawPlates(); }
      if (this.gate.root.visible && this.state !== 'countdown' && this.gate.towT === undefined) this.setGate(Math.min(1, this.gate.open + dt * 4));
      if (this.gate.root.visible && this.state === 'run') this.towGate(dt);
      if (!this.stabled && chimeraReady()) this.stable();
      if (this.stabled && g.player.pos.distanceTo(this.stableAt) < 110) for (const s of this.stabled) s.m.anim((s.t += dt), 0);
    }
    if (this.state === 'idle') { this.panel.classList.add('hidden'); return; }
    if (this.state === 'countdown') {
      const before = Math.ceil(this.timer);
      this.timer -= dt;
      const now = Math.ceil(this.timer);
      const r0 = this.racers[0];
      if (now !== before && now > 0 && now <= 3) { g.fx.pop(String(now), r0.pos.clone().addScaledVector(r0.pos.clone().normalize(), 6), { color: '#ffd23f', size: 80, prio: 1 }); g.audio.tone(440, 0.2, 'square', 0.08); }
      if (this.timer <= 0) {
        this.state = 'run';
        this.excite = 1;
        g.fx.pop('AND THEY\'RE OFF!', null, { color: '#ff2e88', size: 70, prio: 1 });
        g.audio.roar(1);
        g.audio.tone(880, 0.4, 'square', 0.1);
        for (const e of this.R.events) this.eventFx(e);      // (the break: Gate Bursts and Late Starts, rolled at the gate)
      }
      for (const r of this.racers) { r.t += dt; r.m.anim(r.t, 0); this.place(r); }
    } else if (this.state === 'run') {
      // past the line: trot on round the bend and slow down (the model leaves finishers alone)
      for (const r of this.racers) if (r.done) { r.v = Math.max(0, r.v - dt * 6); r.s += r.v * dt; r.t += dt; }
      const before = this.R.finished;
      for (const e of stepRace(this.R, dt)) this.eventFx(e);
      for (const r of this.racers) {
        r.hop += r.vy * dt; r.vy -= (this.cond === CONDITIONS.lowg ? 18 : 30) * dt;
        if (r.hop <= 0) { r.hop = 0; r.vy = r.genes.hop > 0.5 && r.v > 5 && Math.random() < dt * 4 ? (this.cond === CONDITIONS.lowg ? 8 : 5) : 0; }
        this.place(r);
        r.m.anim(r.t, Math.abs(r.v));
      }
      for (const r of this.racers) {
        if (!r.done || r.place <= before) continue;
        this.excite = 1;
        g.fx.pop(r.place === 1 ? `${r.genes.name.toUpperCase()} WINS!` : `#${r.place}`, r.pos.clone().addScaledVector(r.pos.clone().normalize(), 6), { color: r.mine ? '#7dff3a' : '#ffffff', size: r.place === 1 ? 70 : 40, prio: 1 });
        if (r.place === 1) g.audio.tone(660, 0.6, 'square', 0.25);
        if (r.mine) g.audio.roar(r.place === 1 ? 1.5 : r.place <= 3 ? 0.9 : 0.4);
        if (r.mine && r.place <= 3) this.confetti(r.pos);
      }
      if (!this.finishAt && (this.R.finished >= this.racers.length || this.racers[0].done)) this.finishAt = this.t + 2.2;
      if (this.finishAt && this.t >= this.finishAt) { this.finishAt = 0; this.finish(); }
    } else if (this.state === 'cooldown') {
      for (const r of this.racers) {
        r.t += dt;
        if (r.podium) { r.m.anim(r.t, 0); continue; }                     // on the podium: standing, nodding
        r.v = Math.max(0, r.v - dt * 6); r.s += r.v * dt; this.place(r); r.m.anim(r.t, r.v);
      }
    }
    this.drawPanel();
  }

  // stand a finisher on step `n` (1 to 3) of podium set `slot`, facing the main stand
  toPodium(r, n, slot) {
    const g = this.game, w = g.world;
    const [dx, h] = PODIUMS.steps[n], px = PODIUMS.xs[slot] + dx;
    w.toWorld(this.loc, px, 0, PODIUMS.z, _v);
    g.planet.ground(_v, _v);
    _up.copy(_v).normalize();
    w.toWorld(this.loc, px, 0, PODIUMS.z + 1, _f).sub(w.toWorld(this.loc, px, 0, PODIUMS.z, _w));
    r.podium = n;
    r.m.root.visible = true;
    r.m.root.position.copy(_v).addScaledVector(_up, h + 0.1);
    frameQuat(_up, _f, r.m.root.quaternion);
    r.pos = r.m.root.position;
    r.fwd = (r.fwd || new THREE.Vector3()).copy(_f).normalize();
    r.m.anim(r.t, 0);
  }

  confetti(pos) {
    const g = this.game;
    const up = pos.clone().normalize();
    for (let i = 0; i < 6; i++) {
      g.fx.spawn(pos.clone().addScaledVector(up, 3), up.clone().multiplyScalar(10).add(new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12)), { color: [0xff2e88, 0xffd23f, 0x2ee6ff, 0x7dff6a][i % 4], size: 0.5, life: 1.6, count: 8, spread: 3 });
    }
  }

  // ---------- watching: the 'derby' state (main.js) calls this instead of the player ----------
  watch(dt) {
    const g = this.game;
    let [mx, my] = g.input.consumeMouse();
    mx += this.orbit[0]; my += this.orbit[1];
    this.orbit[0] = this.orbit[1] = 0;
    const sens = 0.0022 * (g.settings ? g.settings.v.sensitivity : 1);
    this.camYaw -= mx * sens;
    this.camPitch = Math.max(-0.1, Math.min(1.2, this.camPitch + my * sens));
    this.update(dt);
    if (this.state === 'idle' || !this.racers.length) return;
    this.updateCam(dt);
  }

  // Watching a race: the HUD hides but for the standings (and the pop-ups over the runners), the mouse is free, its cursor the game's
  // reticle; drag the standings anywhere (kept for the next race), or drag anywhere else to swing the camera round.
  setView(on) {
    if (on === this.viewing) return;
    const g = this.game;
    this.viewing = on;
    document.body.classList.toggle('race-view', on);
    this.drag = null;
    if (on) {
      if (g.input.ptrLocked) { g.releasing = true; g.input.unlock(); }
      this.placePanel();
    } else {
      this.panel.style.left = this.panel.style.top = this.panel.style.transform = '';
    }
  }

  placePanel() {
    if (!this.panelAt) return;
    const P = this.panel, w = P.offsetWidth || 330, h = P.offsetHeight || 200;
    const x = Math.max(0, Math.min(innerWidth - w, this.panelAt[0])), y = Math.max(0, Math.min(innerHeight - h, this.panelAt[1]));   // (kept wholly on screen)
    P.style.left = `${x}px`; P.style.top = `${y}px`; P.style.transform = 'none';
  }

  hookView() {
    const canvas = this.game.renderer && this.game.renderer.domElement;
    this.panel.addEventListener('mousedown', (e) => {
      if (!this.viewing || e.button !== 0) return;
      const r = this.panel.getBoundingClientRect();
      this.drag = { kind: 'panel', dx: e.clientX - r.left, dy: e.clientY - r.top };
      this.panel.classList.add('dragging');
      e.preventDefault();
    });
    if (canvas) canvas.addEventListener('mousedown', (e) => {
      if (!this.viewing || this.game.state !== 'derby') return;
      this.drag = { kind: 'orbit', x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    addEventListener('mousemove', (e) => {
      const d = this.drag;
      if (!d) return;
      if (d.kind === 'panel') { this.panelAt = [e.clientX - d.dx, e.clientY - d.dy]; this.placePanel(); }
      else { this.orbit[0] += e.clientX - d.x; this.orbit[1] += e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; }
    });
    addEventListener('mouseup', () => { this.drag = null; this.panel.classList.remove('dragging'); });
    addEventListener('resize', () => { if (this.viewing) this.placePanel(); });
  }

  onKey(code) {
    const n = parseInt(code.replace('Digit', ''), 10);
    if (code.startsWith('Digit') && n >= 1 && n <= CAMS.length) this.setCam(CAMS[n - 1]);
    else if (code === 'KeyC') this.setCam(CAMS[(CAMS.indexOf(this.camMode) + 1) % CAMS.length]);
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
    const size = (subject.genes.size || 1) * DRAWN;     // (as drawn)
    const want = _v, look = _w;
    if (this.camMode === 'chase' || this.camMode === 'leader') {
      // behind and above the runner, swung round by the mouse
      const back = _f.copy(subject.fwd).negate().applyAxisAngle(up, this.camYaw);
      const dist = 6.5 + size * 3;
      want.copy(P).addScaledVector(back, dist * Math.cos(this.camPitch)).addScaledVector(up, 1.4 + size * 1.4 + dist * Math.sin(this.camPitch));
      look.copy(P).addScaledVector(up, 1.0 + size * 0.6).addScaledVector(subject.fwd, 4);
    } else if (this.camMode === 'rail') {
      // tracking shot from the infield, level with the runner (crowd behind on the straight)
      oval(this.startU + subject.s, RAIL_IN - 7, _o);
      w.toWorld(this.loc, _o.x, 3 + size, _o.z, want);
      look.copy(P).addScaledVector(up, 1 + size * 0.5);
    } else if (this.camMode === 'podium') {
      // after the race: podium from the front, a little above
      const px = PODIUMS.xs[this.podiumSlot ?? 1];
      w.toWorld(this.loc, px + 3, 6.5, PODIUMS.z + 17, want);
      w.toWorld(this.loc, px, 3.1, PODIUMS.z, look);
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
    const fov = this.camMode === 'stands' ? 38 : this.camMode === 'blimp' ? 55 : this.camMode === 'podium' ? 52 : 66;
    g.cam.fov += (fov - g.cam.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - g.cam.fov) > 0.01) { cam.fov = g.cam.fov; cam.updateProjectionMatrix(); }
  }

  drawPanel() {
    const order = this.order();
    const len = this.race.dist;
    const EV = { late: 'late start', struggle: 'spot struggle', rushed: 'RUSHED', passing: 'passing', blocked: 'boxed in' };
    const tag = (r) => (r.done ? '' : r.ev ? ` <i>${EV[r.ev]}</i>` : r.sprint && r.pushing ? ' <i>SPRINTING</i>' : r.stam < 0.15 ? ' <i>tired</i>' : '');
    const rows = order.map((r, i) => `<div class="race-row ${r.mine ? 'mine' : ''}"><b>${r.done ? r.place : i + 1}</b> ${r.genes.name}${tag(r)}<span>${r.done ? (r.behind !== undefined ? `+${fmt(r.behind)} m` : `${r.time.toFixed(1)}s`) : `${fmt(Math.max(0, len - r.s))} m`}</span><em class="race-stam" title="stamina"><u style="width:${Math.round(r.stam * 20) * 5}%"></u></em></div>`).join('');
    const togo = Math.max(0, len - order[0].s);
    const head = this.state === 'countdown' ? `${this.race.name.toUpperCase()} · STARTING IN ${Math.max(1, Math.ceil(this.timer))}` : `${this.race.name.toUpperCase()} · ${togo > 0 ? `${fmt(togo)} M TO GO` : 'FINISHED'}`;
    const info = `<div class="race-info">${fmt(len)} m · going ${this.cond.name}${this.bet ? ` · ₵${this.bet} at ${this.race.pays}×` : ''}</div>`;
    const foot = this.state === 'cooldown' ? '' : `<div class="race-keys"><b>1-5</b>/<b>C</b> camera: ${CAM_NAME[this.camMode]} · mouse orbits</div>`;
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
    for (const r of rest) { r.done = true; r.place = ++this.R.finished; r.behind = Math.max(0, this.race.dist - r.s); }
    const race = this.race;
    const place = mine.place;
    const prize = place <= 3 ? Math.round(race.purse * SHARE[place - 1]) : 0;
    const betWin = place === 1 ? Math.round(this.bet * race.pays) : 0;
    const genes = mine.genes;
    genes.races = (genes.races || 0) + 1;
    if (place <= 3) genes.placed = (genes.placed || 0) + 1;
    const cup = race.sec === 'tournament';
    let learned = null;
    if (place === 1) {
      g.stats.raceWins = (g.stats.raceWins || 0) + 1;
      genes.wins = (genes.wins || 0) + 1;
      g.style(cup ? 150 : 60, cup ? 'TOURNAMENT WIN' : 'DERBY WIN');
      g.hud.alert(`${genes.name.toUpperCase()} WINS THE ${race.name.toUpperCase()}!`, '#7dff3a', 4);
      learned = rollSkill(genes, race.sec, race.cat, race.dist);
    } else g.hud.alert(`${genes.name.toUpperCase()} FINISHED #${place}`, place <= 3 ? '#ffd23f' : '#ff9f1c', 3);
    // the career moves on: a training session banked, the season's count, and after a tournament the next season (or retirement)
    const c = genes.career;
    const season = c.season;
    c.log.push({ season, sec: race.sec, name: race.name, dist: race.dist, place });
    c.train++;
    let career = '';
    if (cup) {
      this.cups.delete(`${genes.seed}|${season}`);
      if (place === 1) c.trophies.push(season);
      c.season++;
      c.races = 0;
      if (c.season > SEASONS) { c.retired = true; c.season = SEASONS; }
      if (place === 1 && c.trophies.length === SEASONS && !genes.crown) {
        genes.crown = true;
        (g.stats.crowns ||= []).push({ name: genes.name, at: Date.now(), wins: genes.wins, races: genes.races });
        g.style(500, 'TRIPLE CROWN');
        career = `<p><b>🏆 THE TRIPLE CROWN!</b> ${genes.name} has won the Regolith Guineas, the Lunar Derby and the Dark Side St. Leger. Its name goes up in the Hall of Fame.</p>`;
      }
      career += c.retired ? `<p>That was ${genes.name}'s last season: it <b>retires</b> with ${genes.wins || 0} win${genes.wins === 1 ? '' : 's'} from ${genes.races} starts. It keeps its place in your pen (and could fetch a price there).</p>`
        : `<p>Season ${season} is over. Season ${c.season} begins: three races, then the ${CUPS[c.season - 1].name}.</p>`;
    } else {
      c.races++;
      career = `<p>Season ${c.season}: ${c.races} of ${SEASON_RACES} races run.${c.races >= SEASON_RACES ? ` Next up: the <b>${CUPS[c.season - 1].name}</b> (TOURNAMENTS, at the window).` : ''}</p>`;
    }
    career += `<p><small>A training session is banked (${c.train} now): spend it at the Training Yard in the stables, behind the far stand.</small></p>`;
    if (prize) g.addCredits(prize, `${race.name} purse`);
    if (betWin) g.addCredits(betWin, 'Derby bet');
    g.alchemy.save();
    g.save();
    this.state = 'cooldown';
    const order = this.order();
    // top three onto their steps; camera swings round to them
    const slot = race.slot ?? 1;
    this.podiumResult = { slot, name: race.name, top: order.slice(0, 3).map((r) => r.genes.name) };
    order.slice(0, 3).forEach((r, i) => this.toPodium(r, i + 1, slot));
    this.podiumSlot = slot;
    this.camMode = 'podium';
    this.camT = 0;
    this.confetti(order[0].pos);
    const rows = order.map((r) => `<div class="race-row ${r.mine ? 'mine' : ''}"><b>${r.place}</b> ${r.genes.name} <small>(${r.genes.tier})</small><span>${r.behind !== undefined ? `+${fmt(r.behind)} m` : `${r.time.toFixed(1)}s`}</span></div>`).join('');
    const quip = place === 1 ? pick(['Wire to wire. Beautiful. Terrifying, but beautiful.', 'The crowd is chanting its name. One of its names.', 'Dr. Zbornak will want a sample.'])
      : place <= 3 ? pick(['In the money!', 'A podium finish. The podium is slightly sticky now.'])
        : this.bet ? `Lost your ₵${this.bet} bet. ${pick(['It tried its best. Probably.', 'One of its heads wasn\'t committed.', 'Train it up and try again.', race.dist >= 2000 ? 'It ran out of puff. Long laps at the Training Yard.' : 'Sprints at the Training Yard might help.'])}` : pick(['Next time.', 'It had fun. Probably.']);
    const money = [prize ? `purse ₵${fmt(prize)}` : '', betWin ? `bet ₵${fmt(betWin)}` : ''].filter(Boolean).join(' + ');
    const skill = learned ? `<p>✨ <b>${genes.name} learned ${SKILLS[learned].name}</b>: ${SKILLS[learned].blurb}</p>` : '';
    const fired = [...mine.used].filter((id) => !SKILLS[id].passive).map((id) => SKILLS[id].name);
    const used = fired.length ? `<p><small>Skills it fired: ${fired.join(', ')}.</small></p>` : '';
    g.dialog(`${race.name.toUpperCase()} · RESULT`, `<div class="race-result">${rows}</div><p>Your <b>${genes.name}</b> finished <b>#${place}</b>${money ? `: you collect ${money}` : ''}. ${quip}</p>${skill}${used}${career}`, [
      { label: '1 · BACK TO THE STANDS', fn: () => this.clear() },
      { label: '2 · SEE THE RACE CARD', fn: () => { this.clear(); this.open(); } },
    ]);
  }

  // ---------- the Training Yard (the stables): spend a banked session on a drill ----------
  trainMenu() {
    const g = this.game;
    const ch = g.alchemy.chimeras.filter((c) => { ensureStats(c); return c.career.train > 0; });
    if (!ch.length) {
      g.dialog('TRAINING YARD', '"Nothing to train, boss. Every race a chimera runs earns it one session here. Come back after the next one."', [{ label: 'OK' }]);
      return;
    }
    const list = ch.slice(0, 8);
    const cards = list.map((c, i) => chimeraCard(g, c, { key: i + 1, button: true, status: `${c.career.train} session${c.career.train > 1 ? 's' : ''} banked` }));
    g.dialog('TRAINING YARD', `"One session per race run. Pick a creature." <span class="cc-hint">Growth (the +% on a card) makes those stats train faster; past 80 a stat is slow to move.</span>${cardList(cards, list.length)}`, list.map((c, i) => ({
      label: `${i + 1} · ${c.name.toUpperCase()} (${c.career.train})`, fn: () => this.drillMenu(c),
    })).concat([{ label: `${list.length + 1} · DONE` }]));
  }

  drillMenu(genes) {
    const g = this.game;
    const keys = Object.keys(DRILLS);
    const gr = (k) => (genes.growth[k] ? ` +${Math.round(genes.growth[k] * 100)}%` : '');
    g.dialog('TRAINING YARD', `${chimeraCard(g, genes, { big: true, full: true, status: `${genes.career.train} session${genes.career.train > 1 ? 's' : ''} banked` })}"Which drill?"`, keys.map((k, i) => {
      const D = DRILLS[k];
      return {
        label: `${i + 1} · ${D.name}: ${STAT_INFO[D.main].short}${gr(D.main)}, a little ${STAT_INFO[D.side].short}${gr(D.side)} (${D.blurb})`,
        fn: () => {
          if (genes.career.train <= 0) { this.trainMenu(); return; }
          genes.career.train--;
          const { gains: got, bonus } = train(genes, k);
          g.alchemy.save();
          g.audio.tone(660, 0.12, 'square', 0.1);
          // the growth's share of a gain shown apart: +7 SPEED (+2 growth)
          const grow = (s) => (bonus[s] ? ` (+${bonus[s]} growth)` : '');
          const txt = Object.entries(got).map(([s, v]) => `+${v} ${STAT_INFO[s].name}${grow(s)}`).join(', ') || 'nothing (it is as good as it gets there)';
          g.fx.pop(Object.entries(got).map(([s, v]) => `+${v} ${STAT_INFO[s].short}${bonus[s] ? ` (+${bonus[s]})` : ''}`).join(' ') || 'MAXED', null, { color: '#7dff3a', size: 40 });
          g.dialog('TRAINING YARD', `${chimeraCard(g, genes, { big: true, full: true })}<p>${D.name}: ${genes.name} gains ${txt}.</p>`, [
            ...(genes.career.train > 0 ? [{ label: `1 · ANOTHER SESSION (${genes.career.train} left)`, fn: () => this.drillMenu(genes) }] : []),
            { label: `${genes.career.train > 0 ? 2 : 1} · BACK`, fn: () => this.trainMenu() },
          ]);
        },
      };
    }).concat([{ label: `${keys.length + 1} · BACK`, fn: () => this.trainMenu() }]));
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
    this.setView(false);
    g.alchemy.syncChimeras();
    if (g.state === 'derby') g.state = 'play';
    g.updateCamera(0.016, true);
  }

  // ---------- drum screens, race board, podium plates (Black, Gold Gleam, Touch of Mint, Barn Red, Money, Saddle Brown) ----------
  drawScreen() {
    const { ctx: x, c, tex } = this.screen;
    const W = c.width, H = c.height;
    x.fillStyle = '#2b2a2c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#8b4044'; x.fillRect(0, 0, W, 40);
    x.fillStyle = '#cfb352'; x.fillRect(0, 40, W, 3);
    x.fillStyle = '#f8fff8'; x.font = pixelFont(20); x.textBaseline = 'middle';
    if (this.state !== 'idle' && this.race) {
      // header: state on the right, race name fitted into the rest of the bar so they never overlap
      const togo = Math.max(0, this.race.dist - this.order()[0].s);
      const status = this.state === 'countdown' ? 'GET READY' : this.state === 'cooldown' ? 'RESULT' : togo > 0 ? `${fmt(togo)} M` : 'FINISH!';
      x.textAlign = 'right';
      x.fillText(status, W - 14, 21);
      x.textAlign = 'left';
      fitText(x, this.race.name.toUpperCase(), 14, 21, W - 28 - x.measureText(status).width - 18, 20);
      // six rows: the place, the name, and the stamina bar under it
      this.order().forEach((r, i) => {
        const y = 60 + i * 33;
        x.fillStyle = r.mine ? '#a8d08d' : '#cfb352'; x.textAlign = 'left'; x.font = pixelFont(20);
        x.fillText(`${r.done ? r.place : i + 1}`, 16, y);
        x.fillStyle = '#f8fff8';
        fitText(x, r.genes.name.toUpperCase(), 52, y - 2, W - 52 - 14, 15);
        x.fillStyle = '#3b393a'; x.fillRect(52, y + 10, 300, 4);
        x.fillStyle = r.stam < 0.25 ? '#b07c57' : '#7b9a6e'; x.fillRect(52, y + 10, 300 * r.stam, 4);
      });
    } else {
      x.textAlign = 'center';
      x.fillText('★ CHIMERA DOWNS ★', W / 2, 21);
      x.font = pixelFont(16);
      if (!this.card.length) { x.fillStyle = '#cfb352'; x.fillText('NEXT RACES POSTING SOON', W / 2, H / 2); }
      this.card.forEach((r, i) => {
        const y = 72 + i * 62;
        x.fillStyle = '#cfb352'; x.textAlign = 'left';
        fitText(x, `${SECTIONS[r.sec].name} · ${r.name.toUpperCase()}`, 16, y, W - 32, 18);
        x.fillStyle = '#f8fff8';
        fitText(x, `${fmt(r.dist)} M ${r.cat} · ${CONDITIONS[r.cond].name} · PURSE ${fmt(r.purse)}`, 16, y + 24, W - 32, 13);
      });
    }
    tex.needsUpdate = true;
  }

  // drum end faces: tall and narrow, seen down the arcades
  drawEnd() {
    const { ctx: x, c, tex } = this.endScreen;
    const W = c.width, H = c.height;
    x.fillStyle = '#2b2a2c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#8b4044'; x.fillRect(0, 0, W, 46);
    x.fillStyle = '#cfb352'; x.fillRect(0, 46, W, 3);
    x.fillStyle = '#f8fff8'; x.font = pixelFont(17); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('CHIMERA DOWNS', W / 2, 24);
    const running = this.state !== 'idle' && this.race && this.racers.length;
    const lines = (str, y, size, col) => { x.fillStyle = col; fitText(x, str, W / 2, y, W - 20, size); };      // centred, fitted inside 10 px margins (narrow face)
    if (running) {
      const order = this.order();
      lines(this.race.name.toUpperCase(), 80, 14, '#cfb352');
      if (this.state === 'cooldown') lines('FINAL', 130, 30, '#f8fff8');
      else {
        const togo = Math.max(0, this.race.dist - order[0].s);
        lines(this.state === 'countdown' ? 'READY' : togo > 0 ? fmt(togo) : 'FINISH', 128, 38, '#f8fff8');
        lines(this.state === 'countdown' ? '' : 'METRES TO GO', 158, 11, '#b07c57');
      }
      order.slice(0, 3).forEach((r, i) => {
        const y = 215 + i * 50;
        x.fillStyle = [ '#cfb352', '#f8fff8', '#b07c57' ][i]; x.font = pixelFont(26); x.textAlign = 'left'; x.fillText(String(r.done ? r.place : i + 1), 16, y);
        x.fillStyle = '#f8fff8'; fitText(x, r.genes.name.toUpperCase(), 52, y, W - 52 - 8, 13);
        x.textAlign = 'center';
      });
    } else {
      lines('NEXT RACE', 86, 16, '#cfb352');
      const r = this.card[0];
      if (r) {
        lines(r.name.toUpperCase(), 130, 14, '#f8fff8');
        lines(`${fmt(r.dist)} M`, 184, 36, '#f8fff8');
        lines(`${r.cat} · ${SECTIONS[r.sec].name}`, 226, 13, '#b07c57');
        lines(CONDITIONS[r.cond].name, 252, 13, '#7b9a6e');
        lines(`PURSE ₵${fmt(r.purse)}`, 296, 16, '#cfb352');
        lines(`CLOSES IN ${Math.ceil(r.ttl / 60)} MIN`, 330, 11, '#f8fff8');
      } else lines('POSTING SOON', 200, 16, '#f8fff8');
    }
    tex.needsUpdate = true;
  }

  drawBoard() {
    const { ctx: x, c, tex } = this.board;
    const W = c.width, H = c.height;
    x.fillStyle = '#2b2a2c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#cfb352'; x.fillRect(0, 0, W, 44);
    x.fillStyle = '#3b393a'; x.font = pixelFont(22); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('TODAY\'S RACE CARD', W / 2, 23);
    // a row per section, posted or not
    SEC_KEYS.forEach((k, i) => {
      const r = this.card.find((c) => c.sec === k);
      const y = 76 + i * 76;
      x.textAlign = 'left';
      x.fillStyle = '#cfb352'; x.font = pixelFont(15); x.fillText(SECTIONS[k].name, 14, y);
      x.fillStyle = '#f8fff8';
      fitText(x, r ? r.name.toUpperCase() : 'POSTING SOON', 112, y, W - 112 - 12, 16);
      if (!r) return;
      x.fillStyle = '#b07c57'; x.font = pixelFont(12);
      x.fillText(`${fmt(r.dist)} M ${r.cat} · ${CONDITIONS[r.cond].name}`, 112, y + 22);
      x.fillStyle = '#a8d08d';
      x.fillText(`PURSE ₵${fmt(r.purse)} · ENTRY ₵${r.fee} · ${Math.ceil(r.ttl / 60)} MIN`, 112, y + 40);
    });
    tex.needsUpdate = true;
  }

  // the plates on the podium backdrops: each set shows its section of the race card (EASY, MEDIUM, HARD; a tournament finishes on the middle one), or, once a race from it has finished, its first three. No line holds two things that can
  // grow into each other (the name used to share its line with the distance and class, and VOSTOK GRAND PRIX ran into 2,400 M · CLASS OPEN): the card view heads the plate with
  // the section on the left and the distance and category on the right, fitted to the room the slot leaves, and gives the name the line under them to itself, fitted to the plate's
  // width; the result view stacks the race's name, the winner, and second and third side by side, each fitted to its own room. The top 14 px stay bare: the backdrop's valance
  // (dn_podium) hangs its pennant tips 2 cm in front of the plate's top 20 cm.
  drawPlates() {
    this.plates.forEach((p, i) => {
      const { ctx: x, c, tex } = p;
      const W = c.width, H = c.height, L = 16, R = W - 16;
      const res = this.podiumResult && this.podiumResult.slot === i ? this.podiumResult : null;
      x.fillStyle = res ? '#cfb352' : '#2b2a2c'; x.fillRect(0, 0, W, H);
      x.textBaseline = 'middle'; x.textAlign = 'left';
      if (res) {
        const half = (R - L - 24) / 2;
        x.fillStyle = '#3b393a';
        fitText(x, res.name.toUpperCase(), L, 25, R - L, 18);
        fitText(x, `1 ${res.top[0] || ''}`.toUpperCase(), L, 51, R - L, 24);
        const pair = [[`2 ${res.top[1] || '-'}`.toUpperCase(), L], [`3 ${res.top[2] || '-'}`.toUpperCase(), R - half]];
        x.font = pixelFont(15);
        pair.sort((a, b) => x.measureText(b[0]).width - x.measureText(a[0]).width);     // longer first; the other uses its size so they match
        fitText(x, pair[1][0], pair[1][1], 77, half, fitText(x, pair[0][0], pair[0][1], 77, half, 15));
      } else {
        const k = SEC_KEYS[i], r = this.card.find((c) => c.sec === k), slot = SECTIONS[k].name;
        x.fillStyle = '#cfb352'; x.font = pixelFont(20); x.fillText(slot, L, 28);
        if (r) {
          const room = R - L - x.measureText(slot).width - 24;
          x.textAlign = 'right'; x.fillStyle = '#b07c57';
          fitText(x, `${fmt(r.dist)} M ${r.cat}`, R, 28, room, 18);
          x.textAlign = 'left';
        }
        x.fillStyle = '#f8fff8';
        fitText(x, r ? r.name.toUpperCase() : 'NEXT RACE POSTING SOON', L, 64, R - L, 28);
      }
      tex.needsUpdate = true;
    });
  }
}
