import * as THREE from 'three';
import { toon, glow, ink } from './toon.js';
import { canvasTex, FONT, fitText, BJ, DUCK, PLK, CLASSIC, PRIZE } from './casinoWorld.js';
import { PlinkoSim, MULTS, AIM_RANGE, DROP_Y, BALL_R, PEGS, slotCentre } from './plinko.js';

// The walk-in Lucky Crater games: BLACKJACK at a real table, the DUCK DERBY and a giant PLINKO
// board with real ball physics. Everything here is driven from the casino's per-frame update
// (casinoWorld's onUpdate), so it only ticks while the casino location is active. While you are
// "seated" the game sits in the 'casino' modal state and this class flies the camera.

const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------- cards ----------
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const cardVal = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r);
export function handValue(h) {
  let t = 0, aces = 0;
  for (const c of h) { t += cardVal(c); if (c.r === 'A') aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const isBJ = (h) => h.length === 2 && handValue(h).t === 21;
const CARD_W = 0.42, CARD_H = 0.6;

const faceCache = new Map();
function faceTex(c) {
  const key = c.r + c.s;
  if (faceCache.has(key)) return faceCache.get(key);
  const red = c.s === '♥' || c.s === '♦';
  const t = canvasTex(168, 240, (x, w, h) => {
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fffaf0';
    x.beginPath(); x.roundRect(5, 5, w - 10, h - 10, 16); x.fill();
    const col = red ? '#d7263d' : '#16121f';
    x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = FONT(c.r === '10' ? 46 : 54); x.fillText(c.r, 32, 36);
    x.font = '38px serif'; x.fillText(c.s, 32, 80);
    x.save(); x.translate(w - 32, h - 36); x.rotate(Math.PI);
    x.font = FONT(c.r === '10' ? 46 : 54); x.fillText(c.r, 0, 0);
    x.font = '38px serif'; x.fillText(c.s, 0, -44);
    x.restore();
    if (['J', 'Q', 'K'].includes(c.r)) {
      x.fillStyle = red ? '#ffe0e6' : '#e6e0ff'; x.fillRect(48, 64, w - 96, h - 128);
      x.strokeStyle = col; x.lineWidth = 4; x.strokeRect(48, 64, w - 96, h - 128);
      x.fillStyle = col; x.font = FONT(80); x.fillText(c.r, w / 2, h / 2 - 8);
      x.font = '34px serif'; x.fillText(c.s, w / 2, h / 2 + 44);
    } else {
      x.font = c.r === 'A' ? '120px serif' : '96px serif';
      x.fillText(c.s, w / 2, h / 2 + 6);
    }
  });
  const m = new THREE.MeshBasicMaterial({ map: t });
  faceCache.set(key, m);
  return m;
}
let backMat = null;
function cardBack() {
  if (backMat) return backMat;
  backMat = new THREE.MeshBasicMaterial({ map: canvasTex(168, 240, (x, w, h) => {
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5a1a8f'; x.beginPath(); x.roundRect(5, 5, w - 10, h - 10, 16); x.fill();
    x.strokeStyle = '#ffd23f'; x.lineWidth = 3;
    for (let i = -h; i < w + h; i += 18) { x.beginPath(); x.moveTo(i, 10); x.lineTo(i + h, h - 10); x.stroke(); x.beginPath(); x.moveTo(i + h, 10); x.lineTo(i, h - 10); x.stroke(); }
    x.fillStyle = '#5a1a8f'; x.beginPath(); x.arc(w / 2, h / 2, 40, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffd23f'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(w / 2, h / 2, 26, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5a1a8f'; x.beginPath(); x.arc(w / 2 + 11, h / 2 - 6, 22, 0, Math.PI * 2); x.fill();
  }) });
  return backMat;
}
const cardFrontGeo = new THREE.PlaneGeometry(CARD_W, CARD_H).rotateX(-Math.PI / 2).translate(0, 0.003, 0);
const cardBackGeo = new THREE.PlaneGeometry(CARD_W, CARD_H).rotateX(Math.PI / 2).translate(0, -0.003, 0);

const CHIP_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.07, 14);
const CHIP_TIERS = [[5000, 0xffd23f], [1000, 0xc77dff], [250, 0x16121f], [100, 0x7dff6a], [25, 0x2ee6ff], [10, 0xff2a4a], [0, 0xfff4e0]];
const chipMat = (v) => toon(CHIP_TIERS.find(([min]) => v >= min)[1]);
const chipCount = (v) => Math.max(1, Math.min(14, 1 + Math.floor(Math.log2(Math.max(1, v / 10)))));

// ---------- duck derby ----------
const DUCKS = [
  { name: 'QUACKERS', color: 0xffd23f },
  { name: 'SIR WADDLES', color: 0xff2e88 },
  { name: 'DUCKTOR WHO', color: 0x2ee6ff },
  { name: 'MOONBILL', color: 0x7dff6a },
];
const RACE_L = DUCK.x1 - DUCK.x0;
const DUCK_DT = 1 / 30;
const DUCK_BASE = 2.15;
const SURGE = 0.35, STUMBLE = 0.22; // events per second
const DUCK_EDGE = 0.95; // payout = EDGE / P(win)

function duckInit() {
  return [0, 1, 2, 3].map(() => ({ x: 0, v: 0, mult: 1, ev: 0, kind: null, ph: Math.random() * 6, fin: -1 }));
}
// One fixed step of the race model. Used both for the live race and the odds simulation, so the
// displayed odds are the true odds of the race you watch.
function duckStep(ds, forms, rand) {
  for (let i = 0; i < 4; i++) {
    const d = ds[i];
    if (d.ev > 0) {
      d.ev -= DUCK_DT;
      if (d.ev <= 0) { d.mult = 1; d.kind = null; }
    } else {
      const r = rand();
      if (r < SURGE * DUCK_DT) { d.mult = 1.65; d.ev = 0.5 + rand() * 0.8; d.kind = 'surge'; } else if (r < (SURGE + STUMBLE) * DUCK_DT) { d.mult = 0.2; d.ev = 0.35 + rand() * 0.5; d.kind = 'stumble'; }
    }
    d.ph += DUCK_DT * 3;
    const target = DUCK_BASE * forms[i] * d.mult * (1 + 0.1 * Math.sin(d.ph));
    d.v += (target - d.v) * Math.min(1, DUCK_DT * 2.5);
    d.x += d.v * DUCK_DT;
  }
}
// first duck past the line (exact crossing time within the step) or -1
function duckCross(ds, t) {
  let best = -1, bt = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = ds[i];
    if (d.fin < 0 && d.x >= RACE_L) {
      d.fin = t - (d.x - RACE_L) / Math.max(0.01, d.v);
      if (d.fin < bt) { bt = d.fin; best = i; }
    }
  }
  return best;
}
function duckOdds(forms, n = 2500) {
  const wins = [0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    const ds = duckInit();
    let t = 0, w = -1;
    while (w < 0 && t < 60) { duckStep(ds, forms, Math.random); t += DUCK_DT; w = duckCross(ds, t); }
    wins[Math.max(0, w)]++;
  }
  return wins.map((x) => Math.max(0.01, x / n));
}

// ---------- interaction spots (casino-local x/z) ----------
export const STATIONS = [
  { id: 'bj', x: BJ.x, z: BJ.z + BJ.R + 1.4, r: 2.8, label: 'SIT AT THE BLACKJACK TABLE' },
  { id: 'duck', x: DUCK.kiosk[0], z: DUCK.kiosk[1] + 2, r: 2.8, label: 'DUCK DERBY — PICK A DUCK &amp; BET' },
  { id: 'plinko', x: PLK.x, z: PLK.z + 7.8, r: 3.2, label: 'PLAY PLINKO' },
  { id: 'classic', x: CLASSIC.x - 3.2, z: CLASSIC.zs[1], r: 4.2, label: 'CLASSIC GAMES (SLOTS · ROULETTE · WHEEL · HIGH-LOW)' },
  { id: 'prizes', x: PRIZE.x - 2.8, z: PRIZE.z, r: 3.8, label: 'PRIZE COUNTER &amp; RUSTY THE LOAN SHARK' },
];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3();

export class CasinoGames {
  constructor(game, casino) {
    this.game = game;
    this.casino = casino;
    this.cw = game.world && game.world.casino;
    this.ok = !!this.cw;
    this.mode = null;
    this.clock = 0;
    this.queue = [];
    this.tweens = [];
    this.camP = new THREE.Vector3();
    this.camL = new THREE.Vector3();
    this.camT = 0;
    if (!this.ok) return;
    this.cw.onUpdate = (dt, t) => this.update(dt, t);
    this.buildUI();
    // blackjack
    this.shoe = [];
    this.bj = { phase: 'bet', player: [], dealer: [], stake: 0, doubled: false, cards: [], chips: [], msg: 'PLACE YOUR BET', auto: false };
    // duck derby
    this.dk = { phase: 'bet', pick: 0, stake: 0, ds: duckInit(), forms: [1, 1, 1, 1], odds: [4, 4, 4, 4], t: 0, acc: 0, winner: -1, order: [], history: [], msg: 'PICK A DUCK', scale: 1, lastBoard: 0 };
    this.newRace();
    // plinko
    this.sim = new PlinkoSim();
    this.sim.onPeg = (p, b, sp) => this.pegHit(p, b, sp);
    this.sim.onLand = (b, s) => this.plinkoLand(b, s);
    this.pk = { aim: 0, cd: 0, dropped: 0, net: 0, tick: 0, msg: 'AIM AND DROP!', last: [] };
    this.slotGlow = new Array(MULTS.length).fill(0);
    this.ballGeo = new THREE.SphereGeometry(BALL_R, 14, 10);
    this.ballMats = [0xffd23f, 0xff7ad9, 0x2ee6ff, 0x7dff6a, 0xfff4e0].map((c) => toon(c));
    this.ballPool = [];
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
  }

  get g() { return this.game; }
  get st() { return this.casino.st; }

  // ---------- where are you standing? ----------
  stationAt(p) {
    if (!this.ok || !this.cw.loc.active) return null;
    const l = this.cw.toLocal(p, _l);
    if (l.y < -3 || l.y > 6) return null;
    for (const s of STATIONS) if (Math.hypot(l.x - s.x, l.z - s.z) < s.r) return s;
    return null;
  }

  // ---------- seat / unseat ----------
  enter(id) {
    const g = this.g;
    this.mode = id;
    this.camP.copy(g.camera.position);
    _v.set(0, 0, -10).applyQuaternion(g.camera.quaternion);
    this.camL.copy(g.camera.position).add(_v);
    this.camT = 0;
    g.hud.prompt(null);
    this.playerWasVisible = g.player.model.root.visible;
    g.player.model.root.visible = false;
    this.ui.classList.remove('hidden');
    this.audio.tone(660, 0.08, 'triangle', 0.12);
    if (id === 'bj') { this.bj.auto = false; if (this.bj.phase === 'done') this.bj.msg = 'ANOTHER HAND?'; }
    if (id === 'duck' && this.dk.phase === 'done') this.newRace();
    this.render();
  }

  leave() {
    const g = this.g;
    if (this.mode === 'bj' && (this.bj.phase === 'play' || this.bj.phase === 'dealing')) {
      // walking away mid-hand stands on whatever you hold
      this.bj.auto = true;
      if (this.bj.phase === 'play') this.stand();
    }
    this.mode = null;
    this.ui.classList.add('hidden');
    if (!g.player.dead) g.player.model.root.visible = true;
  }

  get audio() { return this.g.audio; }

  onKey(code) {
    if (code === 'ArrowLeft' || code === 'Minus') { this.betStep(-1); return; }
    if (code === 'ArrowRight' || code === 'Equal') { this.betStep(1); return; }
    const go = code === 'Space' || code === 'Enter';
    if (this.mode === 'bj') {
      const b = this.bj;
      if (go && (b.phase === 'bet' || b.phase === 'done')) this.deal();
      else if (code === 'KeyH') this.hit();
      else if (code === 'KeyS' || (go && b.phase === 'play')) this.stand();
      else if (code === 'KeyD') this.double();
    } else if (this.mode === 'duck') {
      const n = parseInt(code.replace('Digit', ''), 10);
      if (code.startsWith('Digit') && n >= 1 && n <= 4) this.pickDuck(n - 1);
      else if (go) this.startRace();
    } else if (this.mode === 'plinko') {
      if (go) this.dropBall();
    }
  }

  betStep(d) {
    if ((this.mode === 'bj' && this.bj.phase !== 'bet' && this.bj.phase !== 'done') || (this.mode === 'duck' && this.dk.phase === 'race')) return;
    this.casino.stepBet(d);
    this.render();
  }

  afford(n, where) {
    if (this.g.credits >= n) return true;
    this.g.fx.pop('NOT ENOUGH CREDITS!', where || null, { color: '#ff2a4a', size: 44, life: 1.4 });
    this.audio.tone(140, 0.25, 'square', 0.12);
    this.say(this.casino.debt() > 0 ? 'Broke AND in debt? Bold.' : 'Broke? Rusty the loan shark is at the prize counter…', 'bad');
    return false;
  }

  say(text, cls = '') {
    if (this.mode === 'bj') this.bj.msg = text;
    else if (this.mode === 'duck') this.dk.msg = text;
    else if (this.mode === 'plinko') this.pk.msg = text;
    this.msgCls = cls;
    this.render();
  }

  // ---------- timeline + tweens (dt-driven, so they pause with the casino) ----------
  after(t, fn) { this.queue.push({ at: this.clock + t, fn }); }

  tween(obj, to, dur, { arc = 0, rotTo = null, onDone = null, delay = 0 } = {}) {
    this.tweens = this.tweens.filter((t) => t.obj !== obj);
    this.tweens.push({ obj, from: obj.position.clone(), to: to.clone(), dur, t: -delay, arc, rotFrom: obj.rotation.z, rotTo, onDone });
  }

  update(dt, time) {
    this.clock += dt;
    if (this.queue.length) {
      const due = this.queue.filter((q) => q.at <= this.clock);
      if (due.length) {
        this.queue = this.queue.filter((q) => q.at > this.clock);
        due.sort((a, b) => a.at - b.at).forEach((q) => q.fn());
      }
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      const e = 1 - Math.pow(1 - k, 3);
      tw.obj.position.lerpVectors(tw.from, tw.to, e);
      tw.obj.position.y += Math.sin(Math.PI * k) * tw.arc;
      if (tw.rotTo !== null) tw.obj.rotation.z = tw.rotFrom + (tw.rotTo - tw.rotFrom) * e;
      if (k >= 1) { this.tweens.splice(i, 1); if (tw.onDone) tw.onDone(); }
    }
    this.updateDealer(dt, time);
    this.updateDucks(dt, time);
    this.updatePlinko(dt, time);
    if (this.mode) this.updateCam(dt);
    this.uiTick = (this.uiTick || 0) - dt;
    if (this.mode && this.uiTick <= 0) { this.uiTick = 0.25; this.renderHead(); }
  }

  // ---------- camera ----------
  view() {
    const R = BJ.R;
    if (this.mode === 'bj') return [[BJ.x, 3.9, BJ.z + R + 1.9], [BJ.x, 0.75, BJ.z + 0.7]];
    if (this.mode === 'duck') {
      const d = this.dk;
      if (d.phase === 'race' || (d.phase === 'done' && this.clock - d.doneAt < 2.5)) {
        if (d.photo) return [[DUCK.x1 + 0.3, 3.2, DUCK.lanes[0] + 5.5], [DUCK.x1, 0.8, (DUCK.lanes[0] + DUCK.lanes[3]) / 2]];
        const lead = Math.max(...d.ds.map((q) => Math.min(RACE_L, q.x)));
        const cx = Math.max(DUCK.x0 + 5, Math.min(DUCK.x1 - 3, DUCK.x0 + lead));
        return [[cx - 4, 6.2, DUCK.lanes[0] + 7.5], [cx + 1.5, 0.6, (DUCK.lanes[1] + DUCK.lanes[2]) / 2]];
      }
      return [[DUCK.kiosk[0], 9, DUCK.kiosk[1] + 7.5], [DUCK.kiosk[0], 0, (DUCK.lanes[1] + DUCK.lanes[2]) / 2 - 1]];
    }
    // framed so the whole board sits above the action bar
    if (this.mode === 'plinko') return [[PLK.x, 6.4, PLK.z + 16.5], [PLK.x, 4.4, PLK.z]];
    return null;
  }

  updateCam(dt) {
    const g = this.g, cw = this.cw;
    const v = this.view();
    if (!v) return;
    this.camT += dt;
    const p = cw.toWorld(v[0][0], v[0][1], v[0][2], _v);
    const l = cw.toWorld(v[1][0], v[1][1], v[1][2], _w);
    const k = Math.min(1, dt * (this.camT < 1 ? 4 : 6));
    this.camP.lerp(p, k);
    this.camL.lerp(l, k);
    const cam = g.camera;
    cam.position.copy(this.camP);
    const sk = g.cam.shake * (g.settings && g.settings.v ? g.settings.v.shake ?? 1 : 1);
    if (sk > 0) cam.position.add(_v.set((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk));
    cam.up.copy(cw.up);
    g.player.model.root.visible = false; // the follow camera re-shows the runner every frame
    cam.lookAt(this.camL);
    cam.updateMatrixWorld();
  }

  // ---------- juice ----------
  confetti(lx, ly, lz, n = 60, spread = 7) {
    const fx = this.g.fx;
    const pos = this.cw.toWorld(lx, ly, lz);
    const up = this.cw.up;
    for (const c of [0xffd23f, 0xff2e88, 0x2ee6ff, 0x7dff6a, 0xc77dff]) {
      fx.spawn(pos, up.clone().multiplyScalar(7), { color: c, size: 0.16, life: 2.2, gravity: 6, drag: 1.2, count: Math.ceil(n / 5), spread });
    }
  }

  popAt(text, lx, ly, lz, opts) { this.g.fx.pop(text, this.cw.toWorld(lx, ly, lz), opts); }

  fanfare() { this.casino.fanfare(); }

  cheer(n = 7) { for (const c of this.cw.crowd.slice(0, n)) c.cheer = 2 + Math.random(); }

  // big wins get the full treatment
  celebrate(win, stake, at) {
    const m = win / Math.max(1, stake);
    const [x, y, z] = at;
    if (m >= 10) {
      this.popAt(pick(['KA-CHING!!', 'MOONSHOT!!', 'KA-BLAMMO!!', 'JACKPOT!!']), x, y + 1.5, z, { color: '#ffd23f', size: 96, life: 2 });
      this.confetti(x, y, z, 160, 10);
      this.g.cam.shake = Math.max(this.g.cam.shake, 0.9);
      this.fanfare();
      this.cheer();
    } else if (m >= 2) {
      this.popAt(pick(['WIN!', 'NICE!', 'ZING!', 'CHA-CHING!']), x, y + 1.2, z, { color: '#7dff6a', size: 70, life: 1.4 });
      this.confetti(x, y, z, 50, 6);
      this.audio.cash();
      this.cheer(3);
    } else if (win > 0) {
      this.popAt(m > 1 ? 'WIN!' : 'MONEY BACK', x, y + 1, z, { color: '#2ee6ff', size: 48 });
      this.audio.tone(880, 0.12, 'triangle', 0.12);
    }
  }

  // ===================== BLACKJACK =====================
  draw() {
    if (this.shoe.length < 60) {
      this.shoe = [];
      for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) this.shoe.push({ r, s });
      for (let i = this.shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.shoe[i], this.shoe[j]] = [this.shoe[j], this.shoe[i]]; }
      this.popAt('SHUFFLING THE SHOE…', BJ.x, 2.8, BJ.z + 1, { color: '#fff4e0', size: 36 });
    }
    return this.shoe.pop();
  }

  shoeLocal() { return new THREE.Vector3(BJ.R * 0.62 - 0.12, BJ.top + 0.36, 0.95); }

  spawnCard(c, who, faceUp) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cardFrontGeo, faceTex(c)), new THREE.Mesh(cardBackGeo, cardBack()));
    g.position.copy(this.shoeLocal());
    g.rotation.z = Math.PI; // face down out of the shoe
    this.cw.bj.group.add(g);
    const card = { c, who, obj: g, up: faceUp };
    this.bj.cards.push(card);
    this.audio.burst(0.05, 5000, 0.18);
    this.layoutCards(card);
    return card;
  }

  layoutCards(fresh) {
    for (const who of ['p', 'd']) {
      const list = this.bj.cards.filter((k) => k.who === who && !k.gone);
      const n = list.length;
      const z = who === 'p' ? 1.75 : 0.62;
      const sp = n > 5 ? 0.36 : 0.47;
      list.forEach((k, i) => {
        const to = new THREE.Vector3((i - (n - 1) / 2) * sp, BJ.top + 0.012 + i * 0.006, z + (who === 'p' ? i * 0.02 : 0));
        if (k === fresh) this.tween(k.obj, to, 0.38, { arc: 0.5, rotTo: k.up ? 0 : Math.PI });
        else this.tween(k.obj, to, 0.22);
      });
    }
  }

  flipHole() {
    const k = this.bj.cards.find((c) => c.who === 'd' && !c.up && !c.gone);
    if (!k) return;
    k.up = true;
    this.tween(k.obj, k.obj.position.clone(), 0.35, { arc: 0.35, rotTo: 0 });
    this.audio.tone(900, 0.05, 'triangle', 0.1);
  }

  clearTable() {
    const b = this.bj;
    for (const k of b.cards) {
      if (k.gone) continue;
      k.gone = true;
      const obj = k.obj;
      this.tween(obj, new THREE.Vector3(-BJ.R * 0.7, BJ.top + 0.3, 0.3), 0.35, { arc: 0.3, rotTo: Math.PI, onDone: () => obj.parent && obj.parent.remove(obj) });
    }
    b.cards = [];
    for (const c of b.chips) if (c.parent) c.parent.remove(c);
    b.chips = [];
  }

  chipStack(value, at, from = null) {
    const n = chipCount(value);
    const mat = chipMat(value / Math.max(1, n) * 3);
    const group = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const ch = new THREE.Mesh(CHIP_GEO, mat);
      ch.position.set(Math.sin(i * 2.3) * 0.015, 0.035 + i * 0.072, Math.cos(i * 1.7) * 0.015);
      ch.rotation.y = i;
      group.add(ch);
    }
    ink(group.children[0], 0.015);
    this.cw.bj.group.add(group);
    group.position.copy(from || at);
    if (from) this.tween(group, at, 0.45, { arc: 0.5 });
    this.bj.chips.push(group);
    this.audio.tone(2200, 0.03, 'triangle', 0.08);
    return group;
  }

  deal() {
    const b = this.bj;
    if (b.phase !== 'bet' && b.phase !== 'done') return;
    const bet = this.casino.bet;
    if (!this.afford(bet, this.cw.toWorld(BJ.x, 2, BJ.z + 2))) return;
    this.clearTable();
    this.casino.take(bet);
    Object.assign(b, { phase: 'dealing', player: [], dealer: [], stake: bet, doubled: false, msg: 'DEALING…' });
    this.st.hands++;
    this.chipStack(bet, new THREE.Vector3(0, BJ.top, 2.72), new THREE.Vector3(0, BJ.top + 0.6, BJ.R + 0.5));
    for (let k = 0; k < 4; k++) {
      this.after(0.3 + k * 0.42, () => {
        const toP = k % 2 === 0;
        const c = this.draw();
        (toP ? b.player : b.dealer).push(c);
        this.spawnCard(c, toP ? 'p' : 'd', k !== 3);
        this.render();
      });
    }
    this.after(0.3 + 4 * 0.42 + 0.25, () => {
      const pBJ = isBJ(b.player), dBJ = isBJ(b.dealer);
      if (pBJ || dBJ) {
        this.flipHole();
        this.after(0.5, () => {
          if (pBJ && dBJ) this.settle('push', 'BOTH BLACKJACK — PUSH.');
          else if (pBJ) this.settle('bj', 'BLACKJACK! PAYS 3 TO 2!');
          else this.settle('lose', 'DEALER BLACKJACK. OUCH.');
        });
        return;
      }
      b.phase = 'play';
      b.msg = 'HIT, STAND OR DOUBLE?';
      if (b.auto) this.stand();
      this.render();
    });
    this.render();
  }

  hit() {
    const b = this.bj;
    if (b.phase !== 'play') return;
    const c = this.draw();
    b.player.push(c);
    this.spawnCard(c, 'p', true);
    const v = handValue(b.player).t;
    if (v > 21) {
      b.phase = 'busy';
      this.after(0.45, () => { this.flipHole(); this.settle('bust', `BUST WITH ${v}!`); });
    } else if (v === 21) {
      b.phase = 'busy';
      this.after(0.4, () => { b.phase = 'play'; this.stand(); });
    }
    this.render();
  }

  double() {
    const b = this.bj;
    if (b.phase !== 'play' || b.player.length !== 2 || b.doubled) return;
    if (!this.afford(b.stake, this.cw.toWorld(BJ.x, 2, BJ.z + 2))) return;
    this.casino.take(b.stake);
    b.doubled = true;
    this.chipStack(b.stake, new THREE.Vector3(0.36, BJ.top, 2.72), new THREE.Vector3(0.3, BJ.top + 0.6, BJ.R + 0.5));
    b.stake *= 2;
    this.popAt('DOUBLE DOWN!', BJ.x, 2.4, BJ.z + 2, { color: '#ffd23f', size: 54 });
    const c = this.draw();
    b.player.push(c);
    this.spawnCard(c, 'p', true);
    const v = handValue(b.player).t;
    b.phase = 'busy';
    if (v > 21) this.after(0.5, () => { this.flipHole(); this.settle('bust', `DOUBLE BUST WITH ${v}!`); });
    else this.after(0.5, () => { b.phase = 'play'; this.stand(); });
    this.render();
  }

  stand() {
    const b = this.bj;
    if (b.phase !== 'play') return;
    b.phase = 'dealer';
    b.msg = 'DEALER PLAYS…';
    this.flipHole();
    const step = () => {
      if (handValue(b.dealer).t < 17) {
        const c = this.draw();
        b.dealer.push(c);
        this.spawnCard(c, 'd', true);
        this.render();
        this.after(0.65, step);
      } else this.after(0.35, () => this.compare());
    };
    this.after(0.6, step);
    this.render();
  }

  compare() {
    const b = this.bj;
    const p = handValue(b.player).t, d = handValue(b.dealer).t;
    if (d > 21) this.settle('win', `DEALER BUSTS WITH ${d}!`);
    else if (p > d) this.settle('win', `${p} BEATS ${d}!`);
    else if (p === d) this.settle('push', `PUSH AT ${p}.`);
    else this.settle('lose', `DEALER ${d} BEATS ${p}.`);
  }

  settle(kind, text) {
    const b = this.bj;
    b.phase = 'done';
    const stake = b.stake;
    const where = [BJ.x, 1.6, BJ.z + 2.4];
    let win = 0;
    if (kind === 'bj') { win = Math.floor(stake * 2.5); this.st.bjs++; } else if (kind === 'win') win = stake * 2;
    else if (kind === 'push') win = stake;
    if (win > 0) this.casino.pay(win, stake);
    const pay = win - stake;
    b.msg = `${text} ${pay > 0 ? `+₵${fmt(pay)}` : kind === 'push' ? 'STAKE BACK.' : `−₵${fmt(stake)}`}`;
    this.msgCls = pay > 0 ? 'good' : kind === 'push' ? '' : 'bad';
    b.last = { kind, pay };
    if (kind === 'bj') {
      this.popAt('BLACKJACK!!', BJ.x, 2.6, BJ.z + 2, { color: '#ffd23f', size: 92, life: 2 });
      this.confetti(BJ.x, 1.6, BJ.z + 2, 120, 8);
      this.g.cam.shake = Math.max(this.g.cam.shake, 0.6);
      this.fanfare();
      this.cheer(4);
    } else if (kind === 'win') this.celebrate(win, stake, where);
    else if (kind === 'push') this.popAt('PUSH', BJ.x, 2.2, BJ.z + 2, { color: '#2ee6ff', size: 54 });
    else {
      this.popAt(kind === 'bust' ? 'BUST!' : pick(['NOPE!', 'OOF!', 'WHIFF!']), BJ.x, 2.4, BJ.z + 2, { color: '#ff2a4a', size: 80 });
      if (kind === 'bust') this.casino.sadTrombone(); else this.audio.tone(220, 0.25, 'sawtooth', 0.08, 0.6);
    }
    // chips: winnings slide out of the dealer's tray, then everything slides to you (or to the house)
    if (pay > 0) this.chipStack(pay, new THREE.Vector3(-0.42, BJ.top, 2.72), new THREE.Vector3(-0.4, BJ.top + 0.1, 0.3));
    const chips = b.chips.slice();
    this.after(1.1, () => {
      for (const c of chips) {
        const to = win > 0 ? new THREE.Vector3(c.position.x, BJ.top + 0.4, BJ.R + 0.8) : new THREE.Vector3(-0.4, BJ.top + 0.1, 0.3);
        this.tween(c, to, 0.45, { arc: 0.3, onDone: () => { if (c.parent) c.parent.remove(c); } });
      }
      b.chips = b.chips.filter((c) => !chips.includes(c));
    });
    this.g.save();
    this.render();
  }

  updateDealer(dt, time) {
    const d = this.cw.bj.dealer.root;
    const busy = this.bj.phase === 'dealing' || this.bj.phase === 'dealer';
    d.rotation.y = busy ? Math.sin(time * 6) * 0.25 + 0.2 : Math.sin(time * 0.8) * 0.12;
    d.position.y = Math.abs(Math.sin(time * (busy ? 6 : 1.5))) * 0.06;
  }

  // ===================== DUCK DERBY =====================
  newRace() {
    const d = this.dk;
    d.forms = [0, 1, 2, 3].map(() => 0.93 + Math.random() * 0.14);
    const p = duckOdds(d.forms);
    d.probs = p;
    d.odds = p.map((q) => Math.max(1.2, Math.floor((DUCK_EDGE / q) * 10) / 10));
    d.ds = duckInit();
    d.phase = 'bet';
    d.winner = -1;
    d.order = [];
    d.photo = false;
    d.t = 0;
    d.acc = 0;
    d.msg = 'PICK A DUCK (1–4), SET YOUR BET, RACE!';
    this.cw.duck.gate.position.y = 1.35;
    this.cw.duck.ducks.forEach((q, i) => { q.root.position.set(DUCK.x0, DUCK.water - 0.25, DUCK.lanes[i]); q.root.rotation.set(0, 0, 0); });
    this.drawOddsBoard();
  }

  pickDuck(i) {
    if (this.dk.phase === 'race') return;
    if (this.dk.phase === 'done') this.newRace();
    this.dk.pick = i;
    this.audio.tone(500 + i * 120, 0.12, 'square', 0.08);
    const q = this.cw.duck.ducks[i];
    this.popAt('QUACK!', DUCK.x0, 2.4, DUCK.lanes[i], { color: hex(DUCKS[i].color), size: 40, life: 0.8 });
    q.hop = 0.5;
    this.drawOddsBoard();
    this.render();
  }

  startRace() {
    const d = this.dk;
    if (d.phase === 'race') return;
    if (d.phase === 'done') { this.newRace(); this.render(); return; }
    const bet = this.casino.bet;
    if (!this.afford(bet, null)) return;
    this.casino.take(bet);
    this.st.ducks = (this.st.ducks || 0) + 1;
    d.stake = bet;
    d.bet = d.pick;
    d.phase = 'count';
    d.msg = `₵${fmt(bet)} ON #${d.pick + 1} ${DUCKS[d.pick].name} AT ×${d.odds[d.pick]}`;
    const cx = (DUCK.x0 + DUCK.x1) / 2;
    ['3', '2', '1'].forEach((t, i) => this.after(i * 0.6, () => { this.popAt(t, DUCK.x0 + 3, 3.2, DUCK.lanes[1], { color: '#fff4e0', size: 90, life: 0.6 }); this.audio.tone(440, 0.15, 'square', 0.12); }));
    this.after(1.8, () => {
      d.phase = 'race';
      d.t = 0;
      this.popAt('QUACK OFF!', cx - 6, 3.5, DUCK.lanes[1], { color: '#ffd23f', size: 80, life: 1.2 });
      this.audio.tone(880, 0.4, 'square', 0.14);
      this.audio.burst(0.3, 3000, 0.3);
      this.tween(this.cw.duck.gate, new THREE.Vector3(DUCK.x0 - 0.9, 3.4, (DUCK.lanes[0] + DUCK.lanes[3]) / 2), 0.4);
      this.render();
    });
    this.drawOddsBoard();
    this.render();
  }

  updateDucks(dt, time) {
    const d = this.dk, ducks = this.cw.duck.ducks;
    if (d.phase === 'race') {
      // photo-finish slow motion: the model still runs in fixed steps, only the clock slows
      const xs = d.ds.map((q) => q.x).sort((a, b) => b - a);
      const tense = !d.order.length && xs[0] > RACE_L - 2.6 && xs[0] - xs[1] < 0.55;
      d.scale += ((tense ? 0.3 : 1) - d.scale) * Math.min(1, dt * 6);
      if (tense && !d.photo) { d.photo = true; this.popAt('PHOTO FINISH?!', DUCK.x1 - 2, 4, DUCK.lanes[1], { color: '#fff4e0', size: 60, life: 1.5 }); }
      d.acc += dt * d.scale;
      while (d.acc >= DUCK_DT && d.phase === 'race') {
        d.acc -= DUCK_DT;
        const before = d.ds.map((q) => q.kind);
        duckStep(d.ds, d.forms, Math.random);
        d.t += DUCK_DT;
        const w = duckCross(d.ds, d.t);
        if (w >= 0 && d.winner < 0) this.duckWin(w);
        d.ds.forEach((q, i) => {
          if (q.fin >= 0 && !d.order.includes(i)) d.order.push(i);
          if (q.kind !== before[i] && q.kind && q.x < RACE_L) {
            const lx = DUCK.x0 + q.x;
            if (q.kind === 'surge') {
              this.popAt(pick(['ZOOM!', 'PADDLE!', 'WHOOSH!']), lx, 2.4, DUCK.lanes[i], { color: hex(DUCKS[i].color), size: 34, life: 0.7 });
              this.g.fx.spawn(this.cw.toWorld(lx - 0.6, DUCK.water + 0.2, DUCK.lanes[i]), this.cw.up.clone().multiplyScalar(3), { color: 0x9be7ff, size: 0.14, life: 0.6, gravity: 8, count: 12, spread: 3 });
              this.audio.tone(700 + i * 90, 0.1, 'triangle', 0.06, 1.6);
            } else {
              this.popAt(pick(['QUACK?!', 'BONK!', 'WOBBLE!']), lx, 2.4, DUCK.lanes[i], { color: '#ff7ad9', size: 34, life: 0.7 });
              this.audio.tone(300, 0.15, 'sawtooth', 0.06, 0.6);
            }
          }
        });
        // keep paddling a bit past the line, then stop
        if (d.order.length === 4 || d.t > 40) { d.phase = 'done'; d.doneAt = this.clock; }
      }
      if (time - d.lastBoard > 0.3) { d.lastBoard = time; this.drawOddsBoard(); if (this.mode === 'duck') this.render(); }
    } else d.scale = 1;
    ducks.forEach((q, i) => {
      const s = d.ds[i];
      const x = Math.min(RACE_L + 1.6, s.x);
      q.root.position.x = DUCK.x0 + x;
      let y = DUCK.water - 0.25 + Math.sin(time * 7 + i * 1.3) * 0.06;
      if (q.hop > 0) { q.hop -= dt; y += Math.sin((q.hop / 0.5) * Math.PI) * 0.6; }
      if (d.winner === i && d.phase !== 'race' && d.phase !== 'count' && d.phase !== 'bet') y += Math.abs(Math.sin(time * 8)) * 0.7;
      q.root.position.y = y;
      const racing = d.phase === 'race' && s.x < RACE_L;
      q.bob.rotation.z = racing ? (s.kind === 'surge' ? -0.22 : -0.06) + Math.sin(time * 14 + i) * 0.05 : Math.sin(time * 2 + i) * 0.05;
      q.root.rotation.y = racing && s.kind === 'stumble' ? Math.sin(time * 20) * 0.6 : 0;
      const flap = racing && s.kind === 'surge' ? Math.sin(time * 30) * 0.6 : 0;
      q.wings[0].rotation.x = flap; q.wings[1].rotation.x = -flap;
      if (racing && s.kind === 'surge' && Math.random() < dt * 20) this.g.fx.spawn(this.cw.toWorld(DUCK.x0 + x - 0.7, DUCK.water + 0.1, DUCK.lanes[i]), this.cw.up.clone().multiplyScalar(2), { color: 0xc8f4ff, size: 0.1, life: 0.4, gravity: 8, count: 2, spread: 2 });
    });
  }

  duckWin(w) {
    const d = this.dk;
    d.winner = w;
    d.history.unshift(w);
    d.history.length = Math.min(d.history.length, 8);
    const close = d.ds.filter((q, i) => i !== w).some((q) => RACE_L - q.x < 0.45);
    const lx = DUCK.x1;
    this.popAt(close ? `PHOTO FINISH — #${w + 1}!` : `#${w + 1} ${DUCKS[w].name} WINS!`, lx, 4.2, DUCK.lanes[1], { color: hex(DUCKS[w].color), size: 70, life: 2.2 });
    this.confetti(lx, 4.5, (DUCK.lanes[0] + DUCK.lanes[3]) / 2, 140, 9);
    if (close) this.audio.tone(1600, 0.08, 'square', 0.1);
    this.cheer();
    if (d.bet === w) {
      const win = Math.floor(d.stake * d.odds[w] + 1e-6);
      this.casino.pay(win, d.stake);
      d.msg = `#${w + 1} ${DUCKS[w].name} WINS! YOU COLLECT ₵${fmt(win)}`;
      this.msgCls = 'good';
      this.celebrate(win, d.stake, [lx - 1, 2.5, DUCK.lanes[w]]);
      this.popAt(`+₵${fmt(win)}`, lx - 2, 3, DUCK.lanes[w], { color: '#7dff6a', size: 60, life: 1.8 });
      this.g.cam.shake = Math.max(this.g.cam.shake, 0.4);
    } else {
      d.msg = `#${w + 1} ${DUCKS[w].name} WINS. YOUR DUCK #${d.bet + 1} WAS ${['', '2ND', '3RD', '4TH'][Math.max(1, this.placeOf(d.bet))] || 'SLOW'}.`;
      this.msgCls = 'bad';
      this.audio.tone(220, 0.3, 'sawtooth', 0.08, 0.6);
    }
    this.g.save();
    this.render();
  }

  placeOf(i) {
    const xs = this.dk.ds.map((q, k) => [q.fin >= 0 ? -1e6 + q.fin : -q.x, k]).sort((a, b) => a[0] - b[0]);
    return xs.findIndex(([, k]) => k === i);
  }

  drawOddsBoard() {
    const c = this.cw.duck.oddsCanvas, x = c.getContext('2d');
    const w = c.width, h = c.height, d = this.dk;
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#2ee6ff'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
    x.textBaseline = 'middle';
    x.textAlign = 'center'; x.fillStyle = '#ffd23f';
    fitText(x, 'DUCK DERBY', 500, 64);
    x.fillText('DUCK DERBY', w / 2, 52);
    x.font = FONT(26); x.fillStyle = '#c9c3d9';
    x.fillText(d.phase === 'race' ? 'AND THEY\'RE OFF!' : d.phase === 'done' ? 'RESULT' : 'BETS OPEN · ODDS PAY YOUR STAKE ×', w / 2, 100);
    const places = d.phase === 'race' || d.phase === 'done' ? d.ds.map((q, i) => this.placeOf(i)) : null;
    DUCKS.forEach((dk, i) => {
      const y = 150 + i * 52;
      x.fillStyle = hex(dk.color); x.beginPath(); x.arc(70, y, 20, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#120a1e'; x.font = FONT(30); x.textAlign = 'center'; x.fillText(String(i + 1), 70, y + 2);
      x.textAlign = 'left'; x.fillStyle = d.bet === i && d.phase !== 'bet' ? '#ffd23f' : '#fff4e0'; x.font = FONT(38);
      x.fillText(dk.name + (d.phase !== 'bet' && d.bet === i ? '  ← YOU' : d.phase === 'bet' && d.pick === i ? '  ◀' : ''), 110, y + 2);
      x.textAlign = 'right'; x.fillStyle = '#7dff6a'; x.fillText(`×${d.odds[i].toFixed(1)}`, w - 260, y + 2);
      if (places) {
        x.fillStyle = places[i] === 0 ? '#ffd23f' : '#c9c3d9';
        x.fillText(['1ST', '2ND', '3RD', '4TH'][places[i]], w - 140, y + 2);
        // progress bar
        x.fillStyle = '#2a1450'; x.fillRect(w - 120, y - 8, 90, 16);
        x.fillStyle = hex(dk.color); x.fillRect(w - 120, y - 8, 90 * Math.min(1, d.ds[i].x / RACE_L), 16);
      }
    });
    if (d.history.length) {
      x.textAlign = 'left'; x.font = FONT(24); x.fillStyle = '#c9c3d9';
      x.fillText('LAST WINNERS:', 40, h - 32);
      d.history.forEach((k, j) => { x.fillStyle = hex(DUCKS[k].color); x.beginPath(); x.arc(250 + j * 40, h - 32, 14, 0, Math.PI * 2); x.fill(); });
    }
    this.cw.duck.oddsTex.needsUpdate = true;
  }

  // ===================== PLINKO =====================
  dropBall() {
    const p = this.pk;
    if (p.cd > 0) return;
    if (this.sim.balls.length >= 30) { this.say('EASY! THE BOARD IS FULL.'); return; }
    const bet = this.casino.bet;
    const top = [PLK.x + p.aim, PLK.y + DROP_Y + 0.6, PLK.z + 0.3];
    if (!this.afford(bet, this.cw.toWorld(...top))) { p.cd = 0.5; return; }
    this.casino.take(bet);
    p.cd = 0.16;
    p.dropped++;
    p.net -= bet;
    this.st.plinko = (this.st.plinko || 0) + 1;
    let mesh = this.ballPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.ballGeo, this.ballMats[0]);
      ink(mesh, 0.035);
      this.cw.loc.group.add(mesh);
    }
    mesh.material = this.ballMats[p.dropped % this.ballMats.length];
    mesh.visible = true;
    const b = this.sim.drop(p.aim, { bet, mesh });
    mesh.position.set(PLK.x + b.x, PLK.y + b.y, PLK.z + 0.12);
    this.audio.tone(520, 0.08, 'triangle', 0.1, 1.5);
    this.render();
  }

  pegHit(peg, b, sp) {
    peg.flash = 1;
    const p = this.pk;
    if (p.tick <= 0) {
      p.tick = 0.03;
      this.audio.tone(1300 + (TOP_ROW_Y - peg.y) * 90 + Math.random() * 200, 0.035, 'triangle', Math.min(0.07, 0.02 + sp * 0.01));
    }
  }

  plinkoLand(b, s) {
    const m = MULTS[s];
    const win = Math.floor(b.bet * m);
    if (win > 0) this.casino.pay(win, b.bet);
    const p = this.pk;
    p.net += win;
    p.last.unshift(m);
    p.last.length = Math.min(p.last.length, 10);
    this.slotGlow[s] = 1;
    const lx = PLK.x + slotCentre(s), ly = PLK.y + 1.6;
    const col = m >= 8 ? '#ff2a4a' : m >= 2 ? '#ffd23f' : m >= 1 ? '#7dff6a' : '#9be7ff';
    this.popAt(`${m}×`, lx, ly, PLK.z + 0.5, { color: col, size: m >= 8 ? 64 : m >= 1 ? 40 : 28, life: 0.9 });
    if (m >= 8) {
      this.celebrate(win, b.bet, [lx, ly, PLK.z + 0.6]);
      p.msg = `${m}× !!! +₵${fmt(win)}`;
      this.msgCls = 'good';
      if (m >= 50) {
        this.g.cam.shake = Math.max(this.g.cam.shake, 1.4);
        this.popAt('MEGA PLINKO!!!', PLK.x, PLK.y + 6, PLK.z + 1, { color: '#ffd23f', size: 110, life: 2.6 });
        this.confetti(PLK.x, PLK.y + 10, PLK.z + 1, 250, 14);
      }
    } else if (m >= 2) { this.audio.cash(); this.confetti(lx, ly, PLK.z + 0.6, 30, 4); p.msg = `${m}× — +₵${fmt(win)}`; this.msgCls = 'good'; } else if (m >= 1) this.audio.tone(990, 0.1, 'triangle', 0.1);
    else this.audio.tone(330, 0.1, 'triangle', 0.06, 0.7);
    this.render();
  }

  updatePlinko(dt, time) {
    const p = this.pk, cw = this.cw;
    p.cd -= dt;
    p.tick -= dt;
    if (this.mode === 'plinko') {
      const inp = this.g.input;
      const dir = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
      if (dir) p.aim = Math.max(-AIM_RANGE, Math.min(AIM_RANGE, p.aim + dir * dt * 1.6));
      if (inp.down('Space') && p.cd <= 0) this.dropBall();
    }
    cw.plinko.aim.position.x = PLK.x + p.aim;
    cw.plinko.aim.children[1].position.y = 0.7 + Math.sin(time * 6) * 0.12;
    if (this.sim.balls.length) {
      this.sim.step(Math.min(dt, 1 / 20));
      for (const b of this.sim.balls) b.mesh.position.set(PLK.x + b.x, PLK.y + b.y, PLK.z + 0.12);
    }
    // balls the sim finished go back to the pool
    for (const m of this.liveMeshes()) { if (!m.inSim) { m.visible = false; this.ballPool.push(m); } }
    // peg flashes
    const pegs = cw.plinko.pegs;
    let dirty = false;
    PEGS.forEach((pg, i) => {
      if (pg.flash > 0) {
        pg.flash = Math.max(0, pg.flash - dt * 4);
        pegs.setColorAt(i, _col.copy(cw.plinko.pegBase).lerp(HOT, pg.flash));
        dirty = true;
      }
    });
    if (dirty) pegs.instanceColor.needsUpdate = true;
    this.slotGlow.forEach((gl, s) => {
      const mat = cw.plinko.slotMats[s];
      if (gl > 0) this.slotGlow[s] = Math.max(0, gl - dt * 1.5);
      const k = 0.45 + 0.55 * this.slotGlow[s] + (MULTS[s] >= 8 ? 0.15 * Math.sin(time * 6 + s) : 0);
      mat.color.copy(mat.userData.base).multiplyScalar(k).lerp(WHITE, this.slotGlow[s] * 0.6);
    });
  }

  liveMeshes() {
    // meshes currently attached to sim balls are tagged; anything visible and untagged is done
    const live = new Set(this.sim.balls.map((b) => b.mesh));
    const out = [];
    for (const b of this.allBallMeshes || (this.allBallMeshes = new Set())) { b.inSim = live.has(b); if (b.visible) out.push(b); }
    for (const m of live) this.allBallMeshes.add(m);
    return out;
  }

  aimFromScreen(clientX) {
    // map the mouse across the board's on-screen width onto the chute's aim range
    const cam = this.g.camera;
    const a = this.cw.toWorld(PLK.x - 6, PLK.y + DROP_Y, PLK.z).project(cam);
    const b = this.cw.toWorld(PLK.x + 6, PLK.y + DROP_Y, PLK.z).project(cam);
    const sx = (clientX / window.innerWidth) * 2 - 1;
    const t = (sx - a.x) / (b.x - a.x || 1);
    this.pk.aim = Math.max(-AIM_RANGE, Math.min(AIM_RANGE, (t * 2 - 1) * AIM_RANGE));
  }

  onMouseMove(e) {
    if (this.mode !== 'plinko' || this.g.state !== 'casino') return;
    if (e.target && e.target.closest && e.target.closest('#cas3d')) return;
    this.aimFromScreen(e.clientX);
  }

  onMouseDown(e) {
    if (this.mode !== 'plinko' || this.g.state !== 'casino' || e.button !== 0) return;
    if (e.target !== this.g.renderer.domElement) return;
    this.aimFromScreen(e.clientX);
    this.dropBall();
  }

  // ===================== the action bar =====================
  buildUI() {
    const el = document.createElement('div');
    el.id = 'cas3d';
    el.className = 'hidden';
    el.innerHTML = `<div class="c3-head"><b class="c3-title"></b><span class="c3-cred"></span><span class="c3-bet"></span></div>
      <div class="c3-body"></div><div class="c3-msg"></div><div class="c3-btns"></div>
      <div class="c3-foot"><span>◀ ▶ CHANGE BET</span><span>ESC · STAND UP</span></div>`;
    document.body.appendChild(el);
    this.ui = el;
    this.$ = (q) => el.querySelector(q);
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || b.disabled) return;
      if (b.dataset.k === 'Escape') { this.casino.close(false); return; }
      this.onKey(b.dataset.k);
    });
  }

  renderHead() {
    const c = this.casino;
    this.$('.c3-cred').textContent = `₵${fmt(this.g.credits)}`;
    this.$('.c3-bet').innerHTML = `BET <b>₵${fmt(c.bet)}</b> <small>MAX ₵${fmt(c.maxBet)} · VIP ${c.tier.name}</small>`;
  }

  render() {
    if (!this.mode || !this.ui) return;
    const btn = (label, k, { on = false, dis = false, cls = '' } = {}) => `<button data-k="${k}" class="${on ? 'on ' : ''}${cls}" ${dis ? 'disabled' : ''}>${label}</button>`;
    const betBtns = (dis) => btn('◀', 'ArrowLeft', { dis, cls: 'sm' }) + btn('▶', 'ArrowRight', { dis, cls: 'sm' });
    let title = '', body = '', msg = '', btns = '';
    if (this.mode === 'bj') {
      const b = this.bj;
      title = 'BLACKJACK';
      const hide = b.phase === 'dealing' || b.phase === 'play' || b.phase === 'busy' || (b.dealer.length === 2 && !this.bj.cards.some((k) => k.who === 'd' && k.up && b.dealer.indexOf(k.c) === 1));
      const pv = handValue(b.player), dv = handValue(b.dealer);
      const dShown = b.dealer.length ? (hide && b.dealer.length >= 2 ? `${handValue([b.dealer[0]]).t} + ?` : dv.t) : '–';
      const pShown = b.player.length ? `${pv.soft && pv.t < 21 ? 'SOFT ' : ''}${pv.t}` : '–';
      body = `<div class="c3-row"><span>DEALER <b>${dShown}</b></span><span>YOU <b>${pShown}</b></span><span>STAKE <b>₵${fmt(b.stake || this.casino.bet)}</b></span></div>`;
      msg = b.msg;
      if (b.phase === 'play') btns = btn('HIT <i>H</i>', 'KeyH') + btn('STAND <i>S</i>', 'KeyS') + btn('DOUBLE <i>D</i>', 'KeyD', { dis: b.player.length !== 2 || b.doubled || this.g.credits < b.stake });
      else if (b.phase === 'bet' || b.phase === 'done') btns = betBtns(false) + btn(`DEAL ₵${fmt(this.casino.bet)} <i>SPACE</i>`, 'Space', { cls: 'big' });
      else btns = btn('…', 'x', { dis: true });
    } else if (this.mode === 'duck') {
      const d = this.dk;
      title = 'DUCK DERBY';
      const racing = d.phase === 'race' || d.phase === 'count';
      body = `<div class="c3-ducks">${DUCKS.map((q, i) => `<button data-k="Digit${i + 1}" class="c3-duck${(racing || d.phase === 'done' ? d.bet : d.pick) === i ? ' on' : ''}" ${racing ? 'disabled' : ''}><i style="background:${hex(q.color)}">${i + 1}</i><span>${q.name}</span><b>×${d.odds[i].toFixed(1)}</b>${racing || d.phase === 'done' ? `<em>${['1ST', '2ND', '3RD', '4TH'][this.placeOf(i)]}</em>` : ''}</button>`).join('')}</div>`;
      msg = d.msg;
      if (d.phase === 'bet') btns = betBtns(false) + btn(`RACE! ₵${fmt(this.casino.bet)} ON #${d.pick + 1} <i>SPACE</i>`, 'Space', { cls: 'big' });
      else if (d.phase === 'done') btns = btn('NEW RACE <i>SPACE</i>', 'Space', { cls: 'big' });
      else btns = btn('THEY\'RE OFF…', 'x', { dis: true });
    } else if (this.mode === 'plinko') {
      const p = this.pk;
      title = 'PLINKO';
      body = `<div class="c3-row"><span>IN PLAY <b>${this.sim.balls.length}</b></span><span>DROPPED <b>${p.dropped}</b></span><span>SESSION <b class="${p.net >= 0 ? 'up' : 'down'}">${p.net >= 0 ? '+' : '−'}₵${fmt(Math.abs(p.net))}</b></span></div>
        <div class="c3-last">${p.last.map((m) => `<i class="${m >= 8 ? 'hot' : m >= 1 ? 'ok' : ''}">${m}×</i>`).join('')}</div>`;
      msg = p.msg;
      btns = betBtns(false) + btn('◀ AIM <i>A</i>', 'x', { dis: true, cls: 'hint' }) + btn(`DROP ₵${fmt(this.casino.bet)} <i>SPACE</i>`, 'Space', { cls: 'big' }) + btn('AIM ▶ <i>D</i>', 'x', { dis: true, cls: 'hint' });
    }
    this.$('.c3-title').textContent = title;
    this.$('.c3-body').innerHTML = body;
    const m = this.$('.c3-msg');
    m.textContent = msg;
    m.className = `c3-msg ${this.msgCls || ''}`;
    this.$('.c3-btns').innerHTML = btns + btn('LEAVE <i>ESC</i>', 'Escape', { cls: 'sm' });
    this.$('.c3-foot').firstChild.textContent = this.mode === 'plinko' ? 'MOUSE / A · D AIM · CLICK OR HOLD SPACE TO DROP · ◀ ▶ BET' : this.mode === 'duck' ? '1–4 PICK A DUCK · ◀ ▶ BET' : 'H HIT · S STAND · D DOUBLE · ◀ ▶ BET';
    this.renderHead();
  }
}

const _col = new THREE.Color();
const HOT = new THREE.Color(0xffd23f);
const WHITE = new THREE.Color(0xffffff);
const TOP_ROW_Y = PEGS[0].y;
void glow;
