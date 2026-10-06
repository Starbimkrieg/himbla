import * as THREE from 'three';
import { arcDist, tangent } from './geo.js';

// Guided first shift: each step waits until you've actually done the thing, then it ends with a
// short, pirate-free training delivery picked up from the ILMB job board.
const KEY = 'moonrunner-tutorial-v1';

const STEPS = [
  { id: 'look', title: 'LOOK AROUND', text: 'Move the <b>MOUSE</b> to look around.', hold: true },
  { id: 'walk', title: 'WALK', text: 'Walk with <b>W A S D</b>.', hold: true },
  { id: 'skate', title: 'QUANTUM-LOCK SKATES', text: 'Hold <b>SPACE</b> to lock your skates and <b>glide</b>. Push off with <b>W</b> and keep holding SPACE.', hold: true },
  { id: 'carve', title: 'CARVE', text: 'While gliding, steer with <b>A</b> and <b>D</b>.', hold: true },
  { id: 'jump', title: 'MAG-JUMP', text: 'Press <b>SHIFT</b> to mag-jump.' },
  { id: 'thrust', title: 'THRUSTERS', text: 'Hold <b>E</b> (or the <b>right mouse button</b>) to fire your thrusters. They use JET energy.', hold: true },
  { id: 'map', title: 'THE GLOBE MAP', text: 'Press <b>M</b> to open the globe map. Drag to spin it, then press <b>M</b> again to close it.' },
  { id: 'board', title: 'THE JOB BOARD', text: 'Follow the arrow to the yellow <b>JOB BOARD</b> and press <b>F</b>.' },
  { id: 'accept', title: 'TAKE A CONTRACT', text: 'Accept the <b>TRAINING RUN</b> contract (click it, or press <b>1</b>).' },
  { id: 'deliver', title: 'DELIVER IT', text: 'Follow the arrow and deliver the parcel. Downhill + skates = speed. Hard landings with your skates <b>off</b> hurt!' },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.step = 0;
    this.prog = 0;
    this.done = false;
    try { this.done = !!JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* fresh */ }
    this.el = document.createElement('div');
    this.el.id = 'tutorial';
    this.el.className = 'hidden';
    document.getElementById('hud').appendChild(this.el);
  }

  // Offer the training run at the start of a fresh game.
  offer() {
    const g = this.game;
    if (this.done || (g.stats.deliveries || 0) > 0) return;
    g.dialog('WELCOME, ROOKIE', '"Instructor Bolt here, SPACECOM courier school. First shift on the Moon? I\'ll walk you through the skates and your first delivery. Takes a couple of minutes."', [
      { label: '1 · TEACH ME', fn: () => this.begin() },
      { label: '2 · I KNOW WHAT I\'M DOING (skip)', fn: () => this.finish(true) },
    ]);
  }

  begin() {
    this.active = true;
    this.step = 0;
    this.prog = 0;
    this.lastFwd = null;
    this.walked = 0;
    this.lastPos = this.game.player.pos.clone();
    this.game.tipIndex = 1e9; // the old tips stay quiet while we teach
    this.render(true);
  }

  finish(skipped) {
    const g = this.game;
    this.active = false;
    this.done = true;
    this.el.classList.add('hidden');
    try { localStorage.setItem(KEY, 'true'); } catch { /* unavailable */ }
    if (skipped) return;
    g.addCredits(200, 'Training bonus');
    g.audio.cash();
    g.dialog('INSTRUCTOR BOLT', '"That\'s a delivery! You\'re officially a Moon-Runner. A few things to explore on your own:<br><br>• <b>F</b> at any settlement\'s job board for more contracts, and gear upgrades at HQs.<br>• <b>J</b> shows your reputation. Get FRIENDLY with a faction and its leader (glowing beacon at their HQ) will offer you their story.<br>• The dark side pays more, but it\'s pirate country. <b>L</b> toggles your lamp.<br>• Strange places are out there. Go look.<br>• <b>H</b> for all controls, <b>Esc</b> for settings."', [{ label: 'LET\'S GO!' }]);
  }

  // A short, safe delivery to the nearest friendly settlement.
  trainingOffer() {
    const g = this.game;
    const M = g.missions;
    const hub = g.hub;
    const dests = g.locations.filter((l) => !l.restricted && !l.hostile && !l.poi && l !== hub && !l.dark && l.type !== 'pirate');
    dests.sort((a, b) => arcDist(a.dir, hub.dir) - arcDist(b.dir, hub.dir));
    const to = dests[0];
    const o = M.makeOffer(hub, 'spacecom');
    const dist = arcDist(to.dir, hub.dir);
    Object.assign(o, {
      pickup: hub, to, dist, faction: 'spacecom', dark: false, clearance: null, premium: false, training: true,
      cargo: { name: 'TRAINING RUN: Welcome Parcel', fragile: 0.1, hot: 0, color: 0x2ec4ff },
      client: 'Instructor Bolt', time: Math.ceil((dist / 20 + 60) / 5) * 5, reward: 150,
      text: `Take this to ${to.name}. No pirates on this route, I checked. Probably.`,
    });
    return o;
  }

  next() {
    const g = this.game;
    this.step++;
    this.prog = 0;
    g.audio.tone(880, 0.12, 'triangle', 0.2);
    setTimeout(() => g.audio.tone(1320, 0.15, 'triangle', 0.2), 90);
    g.fx.pop('NICE!', null, { color: '#2ee6ff', size: 46, life: 0.8 });
    if (this.step >= STEPS.length) { this.finish(false); return; }
    // the board step needs the training contract waiting on the ILMB board
    if (STEPS[this.step].id === 'board') {
      const list = g.missions.offersFor(g.hub);
      if (!list.some((o) => o.training)) list.unshift(this.trainingOffer());
    }
    this.render(true);
  }

  render(pop) {
    const s = STEPS[this.step];
    const bar = s.hold ? `<div class="tut-bar"><div style="width:${Math.round(Math.min(1, this.prog) * 100)}%"></div></div>` : '';
    const html = `<div class="tut-head">TRAINING · ${this.step + 1}/${STEPS.length} · ${s.title}</div><div class="tut-text">${s.text}</div>${bar}`;
    if (html !== this.lastHtml) { this.el.innerHTML = html; this.lastHtml = html; }
    this.el.classList.remove('hidden');
    if (pop) { this.el.classList.remove('tut-pop'); void this.el.offsetWidth; this.el.classList.add('tut-pop'); }
  }

  // objective arrow while heading for the board
  objective() {
    if (!this.active) return null;
    const s = STEPS[this.step];
    const g = this.game;
    if (s.id === 'board') return { pos: g.world.toWorld(g.hub, 0, 0, 84), label: 'JOB BOARD' };
    return null;
  }

  // screens that pause the world report in directly
  on(what) {
    if (!this.active) return;
    const id = STEPS[this.step].id;
    if (what === 'map' && id === 'map') this.sawMap = true;
    if (what === 'board' && id === 'board') this.next();
  }

  // the training run never gets ambushed
  quiet() { return this.active; }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const P = g.player;
    const I = g.input;
    const s = STEPS[this.step];
    const b = P.body;
    const add = (amount, need) => { this.prog += amount / need; if (this.prog >= 1) this.next(); else this.render(); };
    switch (s.id) {
      case 'look': {
        const f = g.cam.fwd.clone();
        if (this.lastFwd) add(this.lastFwd.angleTo(f) + Math.abs(g.cam.pitch - (this.lastPitch ?? g.cam.pitch)), 2.2);
        this.lastFwd = f;
        this.lastPitch = g.cam.pitch;
        break;
      }
      case 'walk': {
        const d = P.pos.distanceTo(this.lastPos);
        this.lastPos.copy(P.pos);
        if (!b.skating && d < 2) add(d, 12);
        break;
      }
      case 'skate':
        if (b.skating && P.speed > 8) add(dt, 2.5);
        break;
      case 'carve':
        if (b.skating && P.speed > 5 && (I.down('KeyA') || I.down('KeyD'))) add(dt, 1.2);
        break;
      case 'jump':
        if (b.jumped || (!b.grounded && b.airTime > 0.3 && P.vel.dot(P.up) > 2)) this.next();
        break;
      case 'thrust':
        if (b.thrusting) add(dt, 1.2);
        break;
      case 'map':
        if (this.sawMap && g.state === 'play') { this.sawMap = false; this.next(); }
        break;
      case 'accept':
        if (g.missions.active) {
          if (g.missions.active.training) this.next();
          else { this.step = STEPS.length - 1; this.render(true); } // they picked a different job: fine, deliver that
        } else if (g.state === 'play') {
          // closed the board without taking it: send them back
          this.step = STEPS.findIndex((x) => x.id === 'board');
          this.render(true);
        }
        break;
      case 'deliver':
        if (!g.missions.active) {
          if ((g.stats.deliveries || 0) > 0) this.next();
          else { this.step = STEPS.findIndex((x) => x.id === 'board'); this.render(true); g.hud.toast('No worries, grab another contract from the board.', 3); }
        }
        break;
      default: break;
    }
  }
}
