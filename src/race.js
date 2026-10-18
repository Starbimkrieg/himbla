import * as THREE from 'three';
import { toon, inkMat } from './toon.js';
import { frameQuat } from './geo.js';
import { pick } from './rng.js';
import { spliceGenes, makeChimera, LIVING } from './chimera.js';
import { ensureStats, statTotal, newRunner, stepRunner, raceOdds, CONDITIONS } from './chimerastats.js';
import { chimeraCard, cardList } from './chimeracard.js';
import { makeDownsPart, downsNode } from './models.js';
import { buildDowns } from './downsWorld.js';
import { LAP, LANES, RAIL_IN, RAIL_OUT, FINISH_U, STAND, FAR, CLUB, WINDOW, BOARD, DRUM, PODIUMS, ENTRIES, oval } from './downsPlan.js';
import { pixelFont } from './fonts.js';
import { bendPoint, bendQuat } from './curve.js';

// Chimera Downs: a proper racecourse for the things that crawl out of Dr. Zbornak's reactor.
// A dirt oval with four lanes, a grandstand full of cheering spectators, a screen drum, a finish
// arch, winners' podiums, and a clubhouse whose board posts races over time (up to three at once): each has
// its own distance (450 m sprints to 3.6 km marathons, so stamina matters), class, going, purse
// and field. Enter one of your chimeras, bet on it, and the camera locks onto it for the race
// (1-5 or C switch cameras, the mouse orbits, SPACE spends one of three crowd cheers). When it is
// over, the first three stand on a podium and the camera swings round to them behind the result.

// The oval, the stands and the grounds are in downsPlan.js (the location's frame: two 180 m straights joined by half circles; the finish at x = 45 on the home straight).
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
  MILE: ['Copernicus Mile', 'Kepler Cup', 'Mare Imbrium Mile', 'Crater Handicap', 'Tranquility Trot'],
  STAKES: ['Antimatter Classic', 'Zbornak Invitational', 'Lucky Crater Stakes', 'Meridian Gold Cup', 'Vostok Grand Prix'],
  MARATHON: ['Dark Side Marathon', 'Long Night Endurance', 'Terminator Trek', 'Grand Lunar Marathon', 'Earthrise Ultra'],
};
const CAMS = ['chase', 'rail', 'leader', 'stands', 'blimp'];
const CAM_NAME = { chase: 'CHASE', rail: 'RAIL', leader: 'LEADER', stands: 'GRANDSTAND', blimp: 'BLIMP' };
const MOD_KINDS = ['water', 'rock', 'dirt', 'mud', 'wiring', 'engine'];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(), _f = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _o = {}, _bq = new THREE.Quaternion();
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const rand = (a, b) => a + Math.random() * (b - a);
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
    buildDowns(w, loc);

    // ---- moving parts ----
    // the drum's four screens (dn_drum) are live canvases: one shared by the two long faces, one by the two ends; the race card board hangs in the clubhouse's recess, and each podium set
    // has a plate on its backdrop
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
    // the starting gate (moved to wherever the next race starts)
    this.gate = this.makeGate();
    this.gate.root.visible = false;
    w.put(this.gate.root, loc, 0, 0, 0, 0, true);
    // the crowd: outlined spectators in both stands
    this.buildCrowd();
    // foot traffic: racegoers wandering the forecourt, the apron and the infield
    w.addFigures(loc, 40, {
      kind: 'worker',
      look: (i) => (i % 7 === 6 ? { kind: 'kid', scale: 0.6 } : { look: ['casual', 'casual', 'trader', 'elder'][i % 4] }),
      // (each walker keeps to its own patch: the forecourt, the apron in front of the stands, the arcades' rail walk, the fairground or the infield)
      area: (out, f) => {
        if (f.zone === undefined) { const q = Math.random(); f.zone = q < 0.3 ? 0 : q < 0.45 ? 1 : q < 0.75 ? 2 : q < 0.88 ? 3 : 4; }
        if (f.zone === 0) out.set(-60 + Math.random() * 120, 0, CLUB.z1 + 6 + Math.random() * 36);
        else if (f.zone === 1) out.set(-100 + Math.random() * 200, 0, (Math.random() < 0.5 ? 1 : -1) * (RAIL_OUT + 3 + Math.random() * 5));
        else if (f.zone === 2) {
          // the rail walk round a turn (the west one or the east one), between the rail and the arcade
          const a = (125 + Math.random() * 120) * Math.PI / 180, r = RAIL_OUT + 3 + Math.random() * 14, s = f.side ?? (f.side = Math.random() < 0.5 ? -1 : 1);
          out.set(s * (-90 + r * Math.cos(a)), 0, r * Math.sin(a));
        } else if (f.zone === 3) out.set(136 + Math.random() * 66, 0, 112 + Math.random() * 50);
        else out.set(-80 + Math.random() * 160, 0, -30 + Math.random() * 60);
        return out;
      },
    });
    loc.group.updateMatrixWorld(true);
    this.booth = w.toWorld(loc, WINDOW[0], 0, WINDOW[1]);
    // the six betting windows, along the clubhouse's front
    this.windows = [-24.5, -17, -9.5, 9.5, 17, 24.5].map((x) => w.toWorld(loc, x, 0, CLUB.z1 - 3.2));
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

  // A four-stall starting gate (tools/blender/build_downs_course.py): a frame across the lanes and stall doors that spring open.
  makeGate() {
    const root = new THREE.Group();
    const mid = (LANES[0] + LANES[3]) / 2;
    // across the lanes = local x (outer lanes at -x), forward = +z
    root.add(makeDownsPart('dn_gate_frame'));
    const doors = [];
    for (let i = 0; i < 4; i++) {
      const xc = -(LANES[i] - mid);
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(xc + s * 1.95, 0, 0.1);
        const d = makeDownsPart('dn_gate_door');
        d.scale.x = s > 0 ? 1 : -1;          // (the model reaches toward -x from its hinge)
        hinge.add(d);
        root.add(hinge);
        doors.push({ g: hinge, s });
      }
      const num = this.numberPlate(i + 1);
      num.position.set(xc, 4.85, 0.14);
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
    const yaw = Math.atan2(_o.hx, _o.hz), R = this.game.world.curveR(this.loc);
    G0.root.position.set(_o.x, 0.05, _o.z);
    G0.root.rotation.y = yaw;
    if (R) { // (stood on the curved plateau, curve.js)
      bendPoint(R, _o.x, 0.05, _o.z, G0.root.position);
      G0.root.quaternion.setFromAxisAngle(_Y, yaw).premultiply(bendQuat(R, _o.x, _o.z, _bq));
    }
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
    // (seat strips stand 0.95 m behind each tier's front edge; none in the aisles, the front corners' towers or the main stand's top tier, which carries the suites)
    const sit = (S, count, face, sign, towerW) => {
      for (let i = 0; i < count; i++) {
        const tier = Math.floor(Math.random() * (S === STAND ? S.tiers - 1 : S.tiers));
        let x;
        do x = S.x0 + 1 + Math.random() * (S.x1 - S.x0 - 2); while (S.aisles.some((a) => Math.abs(x - a) < 1.6) || (tier < 4 && Math.abs(x) > S.x1 - towerW - 1) || (tier <= (S === STAND ? 3 : 4) && ENTRIES.some((e) => Math.abs(x - e) < 4.6)));   // (nor in the trench where a tunnel comes out through the lower tiers)
        seats.push({ x, y: (tier + 1) * S.rise + 0.3, z: sign * (S.z0 + tier * S.depth + 0.95), face });
      }
    };
    sit(STAND, 760, Math.PI, 1, 8.7);
    sit(FAR, 300, 0, -1, 7.7);
    const N = seats.length;
    // the spectator's parts come from the kit (tools/blender/build_downs_crowd.py): a seated body, a head, a cap, hair and a pair of raised arms, each one white mesh tinted per fan
    const part = (n) => downsNode(n);
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, N); m.frustumCulled = false; return m; };
    const body = mk(part('dn_fan_body').parts[0].geo, toon(0xffffff)), head = mk(part('dn_fan_head').parts[0].geo, toon(0xffffff)), hat = mk(part('dn_fan_cap').parts[0].geo, toon(0xffffff));
    const arms = mk(part('dn_fan_arms').parts[0].geo, toon(0xffffff)), hair = mk(part('dn_fan_hair').parts[0].geo, toon(0xffffff));
    const bodyInk = mk(part('dn_fan_body').ink, inkMat), headInk = mk(part('dn_fan_head').ink, inkMat);
    // racegoers' colours: smart jackets, a few loud shirts, skin and hair tones, hats
    const cols = [0x3b393a, 0x8b4044, 0x7b9a6e, 0xcfb352, 0xb07c57, 0xf8fff8, 0x2f4f7a, 0x5b7a52, 0xdfe8dd, 0x6a2e33];
    const skin = [0xf1c9a5, 0xd8a47f, 0xa8714f, 0x6e4632, 0xe9b98f];
    const hats = [0x3b393a, 0xdfe8dd, 0x8b4044, 0x5b7a52, 0xcfb352];
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
    const ex = this.excite, R = this.game.world.curveR(this.loc);
    for (let i = 0; i < this.crowd.length; i++) {
      const p = this.crowd[i];
      // fans bob in their seats; when the crowd is excited, they leap and wave
      const hop = ex > 0.05 ? Math.max(0, Math.sin(t * p.f + p.ph)) * (0.25 + p.jump * 0.9) * ex : Math.max(0, Math.sin(t * 1.3 + p.ph)) * 0.05;
      const sway = Math.sin(t * 0.9 + p.ph) * 0.06;
      const k = p.sc;
      const y = p.y + 0.5 * k + hop;
      // (the stands are on a curved plateau: each fan is stood on the sphere and turned with it, curve.js)
      const set = (m, yy, sc) => {
        _q.setFromAxisAngle(_Y, p.face + sway);
        _p.set(p.x, yy, p.z);
        if (R) { _q.premultiply(bendQuat(R, p.x, p.z, _bq)); bendPoint(R, p.x, yy, p.z, _p); }
        m.setMatrixAt(i, _m4.compose(_p, _q, _s.set(sc, sc, sc)));
      };
      set(body, y, k);
      set(bodyInk, y, k);
      set(arms, y, ex > 0.35 && p.wave ? k : 0);
      set(head, y + 0.66 * k, k);
      set(headInk, y + 0.66 * k, k);
      set(hat, y + 0.66 * k, p.hat ? k : 0);
      set(hair, y + 0.66 * k, p.hat ? 0 : k);
    }
    for (const m of [body, head, hat, arms, hair, bodyInk, headInk]) m.instanceMatrix.needsUpdate = true;
  }

  // the race keeps the camera while the result dialog is up: the finishers are on the podium
  holdsCamera() { return this.state === 'cooldown' && this.camMode === 'podium'; }

  near(p) { return !!this.booth && this.loc.active && this.windows.some((q) => p.distanceTo(q) < 5.5); }

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
    race.slot = Math.max(0, Math.min(2, this.card.indexOf(race)));      // (which podium set is this race's)
    this.card = this.card.filter((r) => r !== race);
    this.race = race;
    this.podiumResult = null;
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
      if (this.screenT <= 0) { this.screenT = 0.3; this.drawScreen(); this.drawEnd(); this.drawBoard(); this.drawPlates(); }
      if (this.gate.root.visible && this.state !== 'countdown') this.setGate(Math.min(1, this.gate.open + dt * 4));
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
          g.fx.pop(r.place === 1 ? `${r.genes.name.toUpperCase()} WINS!` : `#${r.place}`, r.pos.clone().addScaledVector(r.pos.clone().normalize(), 6), { color: r.mine ? '#7dff3a' : '#ffffff', size: r.place === 1 ? 70 : 40, prio: 1 });
          if (r.place === 1) g.audio.tone(660, 0.6, 'square', 0.25);
          if (r.mine) g.audio.roar(r.place === 1 ? 1.5 : r.place <= 3 ? 0.9 : 0.4);
          if (r.mine && r.place <= 3) this.confetti(r.pos);
        }
      }
      if (!this.finishAt && (this.finished >= this.racers.length || this.racers[0].done)) this.finishAt = this.t + 2.2;
      if (this.finishAt && this.t >= this.finishAt) { this.finishAt = 0; this.finish(); }
    } else if (this.state === 'cooldown') {
      for (const r of this.racers) {
        r.t += dt;
        if (r.podium) { r.m.anim(r.t, 0); continue; }                     // (on the podium: standing there, nodding)
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
    } else if (this.camMode === 'podium') {
      // the winners' podium, from the front and a little above, once the race is over
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
    } else g.hud.alert(`${genes.name.toUpperCase()} FINISHED #${place}`, place <= 3 ? '#ffd23f' : '#ff9f1c', 3);
    if (prize) g.addCredits(prize, `${race.name} purse`);
    if (betWin) g.addCredits(betWin, 'Derby bet');
    g.alchemy.save();
    g.save();
    this.state = 'cooldown';
    const order = this.order();
    // the first three go up on their steps, and the camera swings round to them
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

  // ---------- the drum's screens, the race board and the podium plates (the palette: Black, Gold Gleam, Touch of Mint, Barn Red, Money, Saddle Brown) ----------
  drawScreen() {
    const { ctx: x, c, tex } = this.screen;
    const W = c.width, H = c.height;
    x.fillStyle = '#2b2a2c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#8b4044'; x.fillRect(0, 0, W, 40);
    x.fillStyle = '#cfb352'; x.fillRect(0, 40, W, 3);
    x.fillStyle = '#f8fff8'; x.font = pixelFont(20); x.textBaseline = 'middle';
    if (this.state !== 'idle' && this.race) {
      x.textAlign = 'left';
      x.fillText(this.race.name.toUpperCase(), 14, 21);
      x.textAlign = 'right';
      const togo = Math.max(0, this.race.dist - this.order()[0].s);
      x.fillText(this.state === 'countdown' ? 'GET READY' : this.state === 'cooldown' ? 'RESULT' : togo > 0 ? `${fmt(togo)} M` : 'FINISH!', W - 14, 21);
      this.order().forEach((r, i) => {
        const y = 68 + i * 46;
        x.fillStyle = r.mine ? '#a8d08d' : '#cfb352'; x.textAlign = 'left'; x.font = pixelFont(24);
        x.fillText(`${r.done ? r.place : i + 1}`, 16, y);
        x.fillStyle = '#f8fff8'; x.font = pixelFont(18);
        x.fillText(r.genes.name.slice(0, 22).toUpperCase(), 56, y);
        x.fillStyle = '#3b393a'; x.fillRect(56, y + 14, 300, 6);
        x.fillStyle = r.stam < 0.25 ? '#b07c57' : '#7b9a6e'; x.fillRect(56, y + 14, 300 * r.stam, 6);
      });
    } else {
      x.textAlign = 'center';
      x.fillText('★ CHIMERA DOWNS ★', W / 2, 21);
      x.font = pixelFont(16);
      if (!this.card.length) { x.fillStyle = '#cfb352'; x.fillText(`NEXT RACE POSTS IN ${Math.ceil(this.postT)}s`, W / 2, H / 2); }
      this.card.forEach((r, i) => {
        const y = 72 + i * 62;
        x.fillStyle = '#cfb352'; x.textAlign = 'left'; x.font = pixelFont(18);
        x.fillText(`${i + 1} · ${r.name.toUpperCase()}`, 16, y);
        x.fillStyle = '#f8fff8'; x.font = pixelFont(13);
        x.fillText(`${fmt(r.dist)} M · CLASS ${r.cls} · ${CONDITIONS[r.cond].name} · PURSE ${fmt(r.purse)}`, 16, y + 24);
      });
    }
    tex.needsUpdate = true;
  }

  // the drum's end faces: tall and narrow, seen down the arcades
  drawEnd() {
    const { ctx: x, c, tex } = this.endScreen;
    const W = c.width, H = c.height;
    x.fillStyle = '#2b2a2c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#8b4044'; x.fillRect(0, 0, W, 46);
    x.fillStyle = '#cfb352'; x.fillRect(0, 46, W, 3);
    x.fillStyle = '#f8fff8'; x.font = pixelFont(17); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('CHIMERA DOWNS', W / 2, 24);
    const running = this.state !== 'idle' && this.race && this.racers.length;
    const lines = (str, y, size, col) => { x.fillStyle = col; x.font = pixelFont(size); x.fillText(str, W / 2, y); };
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
        x.fillStyle = '#f8fff8'; x.font = pixelFont(13); x.fillText(r.genes.name.slice(0, 15).toUpperCase(), 52, y);
        x.textAlign = 'center';
      });
    } else {
      lines('NEXT RACE', 86, 16, '#cfb352');
      const r = this.card[0];
      if (r) {
        lines(r.name.toUpperCase().slice(0, 18), 130, 14, '#f8fff8');
        lines(`${fmt(r.dist)} M`, 184, 36, '#f8fff8');
        lines(`${r.cat} · CLASS ${r.cls}`, 226, 13, '#b07c57');
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
    if (!this.card.length) { x.fillStyle = '#f8fff8'; x.font = pixelFont(15); x.fillText('NEXT RACE POSTING SOON', W / 2, H / 2); }
    this.card.forEach((r, i) => {
      const y = 76 + i * 76;
      x.textAlign = 'left';
      x.fillStyle = '#cfb352'; x.font = pixelFont(22); x.fillText(String(i + 1), 14, y);
      x.fillStyle = '#f8fff8'; x.font = pixelFont(16); x.fillText(r.name.toUpperCase(), 48, y);
      x.fillStyle = '#b07c57'; x.font = pixelFont(12);
      x.fillText(`${fmt(r.dist)} M ${r.cat} · CLASS ${r.cls} · ${CONDITIONS[r.cond].name}`, 48, y + 22);
      x.fillStyle = '#a8d08d';
      x.fillText(`PURSE ₵${fmt(r.purse)} · ENTRY ₵${r.fee} · ${Math.ceil(r.ttl / 60)} MIN`, 48, y + 40);
    });
    tex.needsUpdate = true;
  }

  // the plates on the podium backdrops: each set shows its slot of the race card, or, once a race from that slot has finished, its first three
  drawPlates() {
    this.plates.forEach((p, i) => {
      const { ctx: x, c, tex } = p;
      const W = c.width, H = c.height;
      const res = this.podiumResult && this.podiumResult.slot === i ? this.podiumResult : null;
      x.fillStyle = res ? '#cfb352' : '#2b2a2c'; x.fillRect(0, 0, W, H);
      x.textBaseline = 'middle'; x.textAlign = 'left';
      if (res) {
        x.fillStyle = '#3b393a'; x.font = pixelFont(26); x.fillText(res.name.toUpperCase().slice(0, 22), 16, 26);
        x.font = pixelFont(24);
        x.fillText(`1 ${res.top[0] || ''}`.toUpperCase().slice(0, 18), 16, 66);
        x.textAlign = 'right';
        x.font = pixelFont(18);
        x.fillText(`2 ${res.top[1] || ''}  3 ${res.top[2] || ''}`.toUpperCase().slice(0, 34), W - 16, 66);
      } else {
        const r = this.card[i];
        x.fillStyle = '#cfb352'; x.font = pixelFont(26); x.fillText(`RACE ${i + 1}`, 16, 26);
        x.fillStyle = '#f8fff8'; x.font = pixelFont(22);
        x.fillText(r ? `${r.name.toUpperCase()}` : 'NEXT RACE POSTING SOON', 16, 64);
        if (r) { x.textAlign = 'right'; x.fillStyle = '#b07c57'; x.font = pixelFont(18); x.fillText(`${fmt(r.dist)} M · CLASS ${r.cls}`, W - 16, 64); }
      }
      tex.needsUpdate = true;
    });
  }
}
