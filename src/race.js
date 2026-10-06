import * as THREE from 'three';
import { toon, glow, ink, textSprite } from './toon.js';
import { frameQuat } from './geo.js';
import { pick } from './rng.js';
import { spliceGenes, makeChimera, LIVING } from './chimera.js';

// The Chimera Derby at the Bounce Dome Funpark: bet on (or race) the things you made in the lab.
const TRACK_R = 100;
const LANES = [91, 96, 101, 106];
const LAPS = 2;
const LAP = Math.PI * 2 * TRACK_R;
const BOOTH = [-15, -32];
const ODDS = [1.8, 2.6, 3.8, 6];
const BETS = [50, 200, 500];
const RIVALS = [
  'Glue Factory Escapee', 'Mare-y Poppins', 'Hoof Hearted', 'Sir Trots-a-Lot', 'Neigh Sayer', 'Seabiscuit II (Moon)',
  'Gallop Poll', 'Unbridled Horror', 'Bad Genes', 'Whinny the Pooh', 'Stable Genius', 'Foal Play', 'Hay Hey Hey', 'Clip Clop Cthulhu',
];
const MOD_KINDS = ['water', 'rock', 'dirt', 'mud'];

const _v = new THREE.Vector3();
const _up = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Race {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.racers = [];
    this.entrant = null;
    this.loc = game.locations.find((l) => l.id === 'bounce');
    this.panel = document.createElement('div');
    this.panel.id = 'racepanel';
    this.panel.className = 'panel hidden';
    document.getElementById('hud').appendChild(this.panel);
    if (this.loc) this.build();
  }

  build() {
    const w = this.game.world;
    const loc = this.loc;
    // betting booth
    const booth = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 3), toon(0xffd23f));
    ink(base, 0.08);
    base.position.y = 1.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.4, 4), toon(0xff2e88));
    ink(roof, 0.08);
    roof.position.y = 5.4;
    roof.rotation.y = Math.PI / 4;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4.2, 6), toon(0x3a3550));
      post.position.set(s * 2.7, 2.1, 1.2);
      booth.add(post);
    }
    booth.add(base, roof);
    w.put(booth, loc, BOOTH[0], BOOTH[1], 0, Math.PI);
    w.col(loc, { type: 'box', x: BOOTH[0], y: 1.5, z: BOOTH[1], hx: 3, hy: 1.5, hz: 1.5 });
    const sign = textSprite('CHIMERA DERBY · BETS', { color: '#ff2e88', size: 60, scale: 0.5, bg: '#120a1e' });
    sign.position.set(BOOTH[0], 8.5, BOOTH[1]);
    loc.group.add(sign);
    // track: posts around the outside, a start/finish arch
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 6), toon(i % 2 ? 0xffffff : 0xff2e88));
      w.put(post, loc, Math.cos(a) * 111, Math.sin(a) * 111, 1.5);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), glow([0x2ee6ff, 0xffd23f, 0x7dff6a][i % 3]));
      w.put(flag, loc, Math.cos(a) * 111, Math.sin(a) * 111, 3.4);
    }
    const arch = new THREE.Group();
    for (const r of [86, 112]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), toon(0x221d33));
      ink(p, 0.06);
      p.position.set(0, 4.5, -r);
      arch.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 27), new THREE.MeshBasicMaterial({ map: checkerTex() }));
    bar.position.set(0, 9, -99);
    arch.add(bar);
    w.put(arch, loc, 0, 0, 0);
    loc.group.updateMatrixWorld(true);
    this.booth = w.toWorld(loc, BOOTH[0], 0, BOOTH[1]);
  }

  near(p) { return this.booth && p.distanceTo(this.booth) < 9; }

  // ---------- signing up ----------
  open() {
    const g = this.game;
    if (this.state !== 'idle') { g.hud.toast('A race is already running! Watch the track.', 2); return; }
    const ch = g.alchemy.chimeras;
    if (!ch.length) {
      g.dialog('CHIMERA DERBY', '"No chimera, no race, pal. Go see the egghead at the Antimatter Lab, put two living things in his reactor, and bring me whatever crawls out. Cars count. Mites count. People… legally count."', [{ label: 'FINE' }]);
      return;
    }
    const recent = [...ch.filter((c) => c.follow), ...ch.filter((c) => !c.follow).reverse()].slice(0, 8);
    g.dialog('CHIMERA DERBY', `"Which of your… <i>creatures</i>… is running today?" <br><small>Two laps. Anything goes. Literally anything. Record: ${g.stats.raceWins || 0} wins.</small>`, recent.map((c, i) => ({
      label: `${i + 1} · ${c.name.toUpperCase()} — ${Math.round(c.speed * 3.6)} km/h · chaos ${c.chaos}`,
      fn: () => this.chooseBet(c),
    })).concat([{ label: `${recent.length + 1} · NEVER MIND` }]));
  }

  chooseBet(genes) {
    const g = this.game;
    const field = [genes, ...this.makeRivals(genes)];
    const ranked = [...field].sort((a, b) => b.speed - a.speed);
    const odds = ODDS[ranked.indexOf(genes)];
    const rivals = field.slice(1).map((r) => `<b>${r.name}</b> (${r.parents.join('-')}, ${Math.round(r.speed * 3.6)} km/h)`).join('<br>');
    g.dialog('PLACE YOUR BET', `Your <b>${genes.name}</b> pays <b>${odds.toFixed(1)}×</b>.<br><br>Up against:<br>${rivals}`, BETS.map((b, i) => ({
      label: `${i + 1} · BET ₵${b}`,
      fn: () => { if (g.credits < b) { g.hud.toast(`Not enough credits (need ₵${b}).`, 2); return; } g.credits -= b; g.audio.cash(); this.start(field, b, odds); },
    })).concat([{ label: `${BETS.length + 1} · JUST FOR GLORY`, fn: () => this.start(field, 0, odds) }]));
  }

  makeRivals(mine) {
    const out = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const items = [];
      const n = 2 + (Math.random() < 0.3 ? 1 : 0);
      for (let k = 0; k < n; k++) items.push({ kind: pick(LIVING) });
      if (Math.random() < 0.5) items.push({ kind: pick(MOD_KINDS) });
      const gn = spliceGenes(items);
      let name;
      do name = pick(RIVALS); while (used.has(name));
      used.add(name);
      gn.name = name;
      // keep the field roughly competitive with your creature
      gn.speed = Math.round(mine.speed * (0.82 + Math.random() * 0.36) * 10) / 10;
      out.push(gn);
    }
    return out;
  }

  // ---------- the race ----------
  start(field, bet, odds) {
    const g = this.game;
    this.bet = bet;
    this.odds = odds;
    this.entrant = field[0];
    g.alchemy.syncChimeras();
    this.racers = field.map((genes, i) => {
      const m = makeChimera(genes);
      g.scene.add(m.root);
      return { genes, m, lane: LANES[i], s: 0, v: 0, t: Math.random() * 5, ev: null, evT: 0, hop: 0, vy: 0, done: false, place: 0, mine: i === 0 };
    });
    this.state = 'countdown';
    this.timer = 3.5;
    this.finished = 0;
    this.lastCall = '';
    g.hud.alert('CHIMERA DERBY — TO THE TRACK!', '#ff2e88', 3);
    for (const r of this.racers) this.place(r);
  }

  place(r) {
    const g = this.game;
    const a = -Math.PI / 2 + r.s / TRACK_R;
    const w = g.world;
    w.toWorld(this.loc, Math.cos(a) * r.lane, 0, Math.sin(a) * r.lane, _v);
    g.planet.ground(_v, _v);
    _up.copy(_v).normalize();
    const dirSign = r.ev === 'wrong' ? -1 : 1;
    w.toWorld(this.loc, Math.cos(a) * r.lane - Math.sin(a) * dirSign, 0, Math.sin(a) * r.lane + Math.cos(a) * dirSign, _f);
    _f.sub(w.toWorld(this.loc, Math.cos(a) * r.lane, 0, Math.sin(a) * r.lane, new THREE.Vector3()));
    r.m.root.position.copy(_v).addScaledVector(_up, r.hop);
    frameQuat(_up, _f, r.m.root.quaternion);
    r.pos = r.m.root.position;
  }

  chaos(r) {
    const g = this.game;
    const roll = Math.random();
    const at = r.m.root.position.clone().addScaledVector(r.m.root.position.clone().normalize(), 4);
    if (roll < 0.25) { r.ev = 'stumble'; r.evT = 1.4; g.fx.pop('STUMBLE!', at, { color: '#ffd23f', size: 36 }); }
    else if (roll < 0.5) { r.ev = 'zoom'; r.evT = 2; g.fx.pop('ZOOOM!', at, { color: '#2ee6ff', size: 40 }); }
    else if (roll < 0.65) { r.ev = 'wrong'; r.evT = 1.2; g.fx.pop('WRONG WAY!', at, { color: '#ff4f2e', size: 36 }); }
    else if (roll < 0.8) { r.ev = 'hop'; r.evT = 0.2; r.vy = 14; g.fx.pop('BOING!', at, { color: '#ff2e88', size: 36 }); }
    else if (roll < 0.92) {
      r.ev = 'boom'; r.evT = 2.2;
      g.fx.explosion(r.m.root.position, 4, false);
      r.m.root.visible = false;
      g.fx.pop('IT EXPLODED?!', at, { color: '#ff4f2e', size: 40 });
    } else {
      // gets distracted by a nearby head
      r.ev = 'stumble'; r.evT = 2.5;
      g.fx.pop(r.genes.extraHead ? 'HEADS ARGUING' : 'EXISTENTIAL DREAD', at, { color: '#c77dff', size: 32 });
    }
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'idle') { this.panel.classList.add('hidden'); return; }
    if (this.state === 'countdown') {
      const before = Math.ceil(this.timer);
      this.timer -= dt;
      const now = Math.ceil(this.timer);
      if (now !== before && now > 0) { g.fx.pop(String(now), this.racers[0].pos.clone().addScaledVector(this.racers[0].pos.clone().normalize(), 8), { color: '#ffd23f', size: 80 }); g.audio.tone(440, 0.2, 'square', 0.2); }
      if (this.timer <= 0) { this.state = 'run'; g.fx.pop('AND THEY\'RE OFF!', null, { color: '#ff2e88', size: 70 }); g.audio.tone(880, 0.4, 'square', 0.25); }
      for (const r of this.racers) { r.t += dt; r.m.anim(r.t, 0); }
    } else if (this.state === 'run') {
      for (const r of this.racers) {
        r.t += dt;
        if (r.done) { r.m.anim(r.t, 1); continue; }
        if (r.evT > 0) { r.evT -= dt; if (r.evT <= 0) { if (r.ev === 'boom') { r.m.root.visible = true; g.fx.pop('REASSEMBLED!', r.pos.clone().addScaledVector(r.pos.clone().normalize(), 4), { color: '#7dff6a', size: 32 }); } r.ev = null; } }
        else if (Math.random() < dt * (0.05 + r.genes.chaos * 0.035)) this.chaos(r);
        const surge = 0.9 + Math.sin(r.t * 0.7 + r.genes.seed) * 0.08 + Math.random() * 0.04;
        let target = r.genes.speed * surge;
        if (r.ev === 'stumble' || r.ev === 'boom') target = 0;
        else if (r.ev === 'zoom') target *= 1.8;
        else if (r.ev === 'wrong') target = -r.genes.speed * 0.5;
        r.v += (target - r.v) * Math.min(1, dt * 2.5);
        r.s = Math.max(0, r.s + r.v * dt * (TRACK_R / r.lane));
        r.hop += r.vy * dt; r.vy -= 30 * dt;
        if (r.hop <= 0) { r.hop = 0; r.vy = r.genes.hop > 0.5 && Math.random() < dt * 4 ? 5 : 0; }
        this.place(r);
        r.m.anim(r.t, Math.abs(r.v));
        if (r.s >= LAP * LAPS) {
          r.done = true;
          r.place = ++this.finished;
          g.fx.pop(r.place === 1 ? `${r.genes.name.toUpperCase()} WINS!` : `#${r.place}`, r.pos.clone().addScaledVector(r.pos.clone().normalize(), 6), { color: r.mine ? '#7dff3a' : '#ffffff', size: r.place === 1 ? 70 : 40 });
          if (r.place === 1) g.audio.tone(660, 0.6, 'square', 0.25);
        }
      }
      if (this.finished >= this.racers.length || this.racers[0].done) this.finish();
    }
    this.drawPanel();
  }

  drawPanel() {
    const order = [...this.racers].sort((a, b) => (a.done && b.done ? a.place - b.place : b.s - a.s));
    const rows = order.map((r, i) => `<div class="race-row ${r.mine ? 'mine' : ''}"><b>${r.done ? r.place : i + 1}</b> ${r.genes.name}${r.ev ? ` <i>${{ stumble: 'stumbling', zoom: 'ZOOMING', wrong: 'wrong way!', hop: 'airborne', boom: 'in pieces' }[r.ev]}</i>` : ''}<span>${Math.min(LAPS, Math.floor(r.s / LAP) + 1)}/${LAPS}</span></div>`).join('');
    const head = this.state === 'countdown' ? `STARTING IN ${Math.ceil(this.timer)}` : 'CHIMERA DERBY';
    const html = `<div class="m-head">${head}${this.bet ? ` · ₵${this.bet} @ ${this.odds.toFixed(1)}×` : ''}</div>${rows}`;
    if (html !== this.lastHtml) { this.panel.innerHTML = html; this.lastHtml = html; }
    this.panel.classList.remove('hidden');
  }

  finish() {
    const g = this.game;
    const mine = this.racers[0];
    // whoever hasn't crossed yet gets ranked by distance
    const rest = this.racers.filter((r) => !r.done).sort((a, b) => b.s - a.s);
    for (const r of rest) { r.done = true; r.place = ++this.finished; }
    const won = mine.place === 1;
    if (won) {
      g.stats.raceWins = (g.stats.raceWins || 0) + 1;
      mine.genes.wins = (mine.genes.wins || 0) + 1;
      g.alchemy.save();
      const pay = Math.round(this.bet * this.odds);
      if (pay) g.addCredits(pay, 'Derby');
      g.style(60, 'DERBY WIN');
      g.hud.alert(`${mine.genes.name.toUpperCase()} WINS THE DERBY!`, '#7dff3a', 4);
      if (g.highlights && g.highlights.capture) {
        try { g.highlights.capture(g.camera, `${mine.genes.name} won the Chimera Derby`, 60); } catch { /* no snapshot */ }
      }
    } else {
      g.hud.alert(`${mine.genes.name.toUpperCase()} FINISHED #${mine.place}`, '#ff9f1c', 3);
      if (this.bet) g.hud.toast(`Lost your ₵${this.bet} bet. ${pick(['It tried its best. Probably.', 'One of its heads wasn\'t committed.', 'Maybe add more legs.', 'Have you tried more antimatter?'])}`, 4);
    }
    g.save();
    this.state = 'cooldown';
    g.schedule(4, () => this.clear());
  }

  clear() {
    for (const r of this.racers) r.m.root.removeFromParent();
    this.racers = [];
    this.entrant = null;
    this.state = 'idle';
    this.panel.classList.add('hidden');
    this.game.alchemy.syncChimeras();
  }
}

function checkerTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const x = c.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}
