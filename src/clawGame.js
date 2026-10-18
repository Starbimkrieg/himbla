import * as THREE from 'three';
import { ClawSim, CLAW_COST, CLAW_TIME, DROP } from './clawSim.js';
import { ClawView } from './clawView.js';
import { canvasTex, FONT, clawPt } from './casinoWorld.js';

// The Zero-G claw as a seated game (casinoGames.js hands over to this while `mode` is 'claw'): the sim (clawSim.js), its drawing (clawView.js), the camera, the keys and the
// action bar, and what the sim's events do to the room (sounds, pop-ups, blasts). ₵200 buys a round: the tank is shuffled, then 45 seconds to bank what you can.

const MOOD_TEXT = ['CALM TANK', 'THICK AIR: THINGS STAY PUT', 'STORM: EVERYTHING KEEPS MOVING', 'SURGE: GRAVITY WILL HICCUP'];
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const _v = new THREE.Vector3();
const CLAW_EARSHOT = 40; // metres from the machine within which its sounds, pop-ups and shakes play when nobody is seated
// the machine's frame (build_claw.py): the front glass, and the part of the tank the camera frames (the frame's width, the floor to the roof)
const GLASS_Z = 3.62, TANK_HALF_W = 8.55, TANK_MID_Y = 3.95, TANK_H = 5.5;

export class ClawGame {
  constructor(games) {
    this.G = games;
    this.sim = new ClawSim((Math.random() * 1e9) | 0);
    this.phase = 'idle';       // 'idle' | 'shuffle' | 'play' | 'over'
    this.shuffleT = 0;
    this.msg = '';
    this.msgT = 0;
    this.pad = { x: 0, z: 0, y: 0 };
    this.mouse = [false, false, false];   // (the buttons held while seated: left lowers the claw, right raises it)
    this.view = null;
    this.hitT = 0;
    this.last = null;          // how the last round went: { bank, tank }
    this.drawn = '';
    this.sparks = 0;
    window.addEventListener('mousedown', (e) => { if (this.G.mode === 'claw' && !(e.target && e.target.closest && e.target.closest('#cas3d'))) this.mouse[e.button] = true; });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    window.addEventListener('blur', () => { this.mouse = [false, false, false]; });
  }

  get cw() { return this.G.cw; }

  // built the first time the casino is up (the machine is part of the hall)
  build() {
    const cw = this.cw;
    if (this.view || !cw || !cw.claw) return;
    this.view = new ClawView(cw.claw.spots);
    cw.claw.dyn.add(this.view.group);
    const mk = (w, h, pw, ph) => {
      const tex = canvasTex(pw, ph, () => {});
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      return { tex, ctx: tex.image.getContext('2d'), mesh, pw, ph };
    };
    const S = cw.claw.spots;
    this.marq = mk(S.marquee.w, S.marquee.h, 1024, 120);
    this.marq.mesh.position.copy(S.marquee.pos);
    this.scr = mk(S.screen.w, S.screen.h, 512, 150);
    this.scr.mesh.position.copy(S.screen.pos);
    this.scr.mesh.rotation.x = -S.screen.tilt;
    cw.claw.dyn.add(this.marq.mesh, this.scr.mesh);
    this.view.sync(this.sim, 0.016);
  }

  // ---------- seat ----------
  enter() {
    this.build();
    this.mouse = [false, false, false];
    if (this.phase === 'idle' || this.phase === 'over') this.setMsg(this.phase === 'over' ? 'ANOTHER GO?' : 'FLY THE CLAW · HOLD THE BEAM · BANK IT DOWN THE DROP HOLE', 99);
  }

  leave() {
    if (this.phase === 'play') this.sim.end();     // (walking away ends the round: you are paid what you have banked)
    this.mouse = [false, false, false];
  }

  setMsg(t, s = 3) { this.msg = t; this.msgT = s; this.G.msgCls = ''; }

  // ---------- keys ----------
  onKey(code) {
    if ((code === 'Space' || code === 'Enter') && (this.phase === 'idle' || this.phase === 'over')) { this.start(); return true; }
    return code.startsWith('Arrow') || code.startsWith('Key') || code === 'Space' || code === 'Minus' || code === 'Equal'; // (the rest of the bar's keys do nothing here)
  }

  padClaw(x, z, y) { this.pad.x = x; this.pad.z = z; this.pad.y = y; }

  // ₵200 for a round: the old tank is flushed out through the roof jets, a new one dealt in
  start() {
    const G = this.G;
    if (this.phase === 'shuffle' || this.phase === 'play') return;
    if (!G.afford(CLAW_COST, G.cw.toWorld(...clawPt(0, 3.4, 4)))) return;
    G.casino.take(CLAW_COST);
    G.st.claws = (G.st.claws || 0) + 1;
    this.phase = 'shuffle';
    this.shuffleT = 3.4;
    const old = this.sim.shuffle((Math.random() * 1e9) | 0, true);
    this.view.retire(old);
    this.setMsg(`TANK #${this.sim.tank}: ${MOOD_TEXT[this.sim.mood]}`, 6);
    G.audio.burst(0.9, 600, 0.3);
    G.audio.tone(220, 0.8, 'sawtooth', 0.12, 300);
    G.render();
  }

  // ---------- one frame ----------
  update(dt, time) {
    if (!this.view) this.build();
    if (!this.view) return;
    const G = this.G, sim = this.sim, seated = G.mode === 'claw';
    // the claw: your stick in play, autopilot home while the tank shuffles
    let input = {};
    if (seated && this.phase === 'play') input = this.readInput();
    else if (this.phase === 'shuffle') input = this.home();
    sim.update(dt, input);
    this.view.sync(sim, dt);
    for (const e of sim.events) this.event(e);
    sim.events.length = 0;
    // the round
    if (this.phase === 'shuffle') {
      this.shuffleT -= dt;
      if (this.shuffleT <= 0) { this.phase = 'play'; sim.start(); this.setMsg('GO!  ' + MOOD_TEXT[sim.mood], 3); G.render(); }
    }
    if (this.msgT > 0 && (this.msgT -= dt) <= 0) { this.msg = ''; }
    this.hitT -= dt;
    this.drawBoards(time);
  }

  readInput() {
    const d = (k) => this.G.g.input.down(k);
    const p = this.pad;
    const mx = (d('KeyD') || d('ArrowRight') ? 1 : 0) - (d('KeyA') || d('ArrowLeft') ? 1 : 0) + p.x;
    const mz = (d('KeyS') || d('ArrowDown') ? 1 : 0) - (d('KeyW') || d('ArrowUp') ? 1 : 0) + p.z;
    const my = (this.mouse[2] ? 1 : 0) - (this.mouse[0] ? 1 : 0) + p.y;   // right click up, left click down
    const cl = (v) => Math.max(-1, Math.min(1, v));
    return { mx: cl(mx), my: cl(my), mz: cl(mz), beam: d('Space') };
  }

  home() {
    const c = this.sim.claw, k = 2.6;
    const ex = (0 - c.x) * k, ey = (6.0 - c.y) * k, ez = (1.9 - c.z) * k;
    return { mx: Math.max(-1, Math.min(1, (ex - c.vx) / 5)), my: Math.max(-1, Math.min(1, (ey - c.vy) / 4)), mz: Math.max(-1, Math.min(1, (ez - c.vz) / 5)), beam: false };
  }

  // Whether what happens in the tank is for the player: seated at the machine, or within earshot of it. The tank runs its sim
  // whenever the casino is active (world.js: within 2.6 km of the player), and an idle tank's magnets keep catching things that
  // drift by, so without this its clicks, thuds and pop-ups played for the whole Moon.
  near() {
    const G = this.G;
    if (G.mode === 'claw') return true;
    const P = G.g.player;
    return !!P && P.pos.distanceToSquared(G.cw.toWorld(...clawPt(0, 3, 4), _v)) < CLAW_EARSHOT * CLAW_EARSHOT;
  }

  // ---------- what the sim says happened ----------
  event(e) {
    const G = this.G, A = G.audio;
    const at = (x, y, z) => clawPt(x, y, z);
    if (e.type !== 'end' && !this.near()) return; // (a round only runs seated; its end settles the bank regardless)
    switch (e.type) {
      case 'bank': {
        const v = e.value, label = e.tags.length ? e.tags.join(' ') : '';
        G.popAt(v < 0 ? `−₵${fmt(-v)}  ${label}` : `+₵${fmt(v)}${label ? '  ' + label : ''}`, ...at(DROP.x + 0.6, DROP.y + 2.2, DROP.z + 1.2), { color: v < 0 ? '#ff2a4a' : e.item.kind === 'chip' ? '#ffd23f' : '#7dff6a', size: e.item.kind === 'chip' ? 90 : v < 0 ? 56 : 44, life: e.item.kind === 'chip' ? 2.4 : 1.2 });
        if (v < 0) A.burst(0.5, 160, 0.4);
        else { A.tone(520 + Math.min(500, v * 3), 0.12, 'triangle', 0.16); setTimeout(() => A.tone(780 + Math.min(500, v * 3), 0.14, 'triangle', 0.14), 90); }
        if (e.item.kind === 'chip') { G.confetti(...at(0, 4, 3), 160, 12); G.g.cam.shake = Math.max(G.g.cam.shake, 0.8); G.fanfare(); G.cheer(); }
        this.setMsg(v < 0 ? 'A MINE IN THE DROP HOLE! OUCH.' : `BANKED ₵${fmt(v)}  ${label}`, 2.5);
        G.render();
        break;
      }
      case 'boom': {
        this.view.boom(e.x, e.y, e.z, e.r * (e.dull ? 0.6 : 1), e.dull);
        A.burst(0.5, e.dull ? 200 : 140, 0.45); A.tone(90, 0.4, 'sawtooth', 0.14, -40);
        G.g.cam.shake = Math.max(G.g.cam.shake, e.dull ? 0.3 : 0.55);
        const pos = G.cw.toWorld(...at(e.x, e.y, e.z), _v);
        for (const c of [0xffb21f, 0xff5a36, 0xfff1a0]) G.g.fx.spawn(pos, G.cw.up.clone().multiplyScalar(0.5), { color: c, size: 0.22, life: 0.9, gravity: 0, drag: 2, count: 8, spread: 5 });
        break;
      }
      case 'open':
        G.popAt(e.jackpot ? 'THE LUCKY CHIP!!' : 'LOCKBOX POPPED!', ...at(e.x, e.y + 0.8, e.z), { color: e.jackpot ? '#ffd23f' : '#2ee6ff', size: e.jackpot ? 84 : 48, life: 1.8, prio: e.jackpot ? 1 : 0 });
        A.tone(660, 0.1, 'square', 0.14); setTimeout(() => A.tone(990, 0.2, 'triangle', 0.16), 100);
        if (e.jackpot) this.setMsg('THE LUCKY CHIP IS LOOSE! GRAB IT!', 4);
        break;
      case 'dent': A.tone(300, 0.08, 'square', 0.1); break;
      case 'grab': A.tone(740, 0.07, 'triangle', 0.1); break;
      case 'release': A.tone(500, 0.05, 'triangle', 0.06); break;
      case 'stick': A.tone(1200, 0.04, 'square', 0.05); break;
      case 'stun': G.popAt('STUNNED!', ...at(this.sim.claw.x, this.sim.claw.y + 0.6, this.sim.claw.z), { color: '#ff2a4a', size: 56, life: 1.3 }); break;
      case 'overheat': G.popAt('BEAM OVERHEATED', ...at(this.sim.claw.x, this.sim.claw.y + 0.8, this.sim.claw.z), { color: '#ff9f1c', size: 44, life: 1.1 }); A.tone(180, 0.25, 'square', 0.12); break;
      case 'surge': G.popAt('GRAVITY SURGE!', ...at(0, 5.5, 3), { color: '#ff7ad9', size: 80, life: 1.8, prio: 1 }); A.tone(110, 0.9, 'sawtooth', 0.14, 90); this.setMsg('GRAVITY SURGE!', 2.5); break;
      case 'hit': if (this.hitT <= 0 && e.speed > 1.6) { this.hitT = 0.06; A.tone(180 + Math.random() * 120, 0.05, 'triangle', Math.min(0.1, e.speed * 0.02)); } break;
      case 'end': this.finish(e.bank); break;
      default: break;
    }
  }

  finish(bank) {
    const G = this.G;
    this.phase = 'over';
    this.last = { bank, tank: this.sim.tank };
    const at = clawPt(0, 3.2, 4.2);
    if (bank > 0) {
      G.casino.pay(bank, CLAW_COST);
      G.celebrate(bank, CLAW_COST, at);
      const st = G.st;
      if (bank > (st.clawBest || 0)) { st.clawBest = bank; if (bank > CLAW_COST) this.setMsg(`NEW BEST: ₵${fmt(bank)}!`, 6); }
    }
    if (!this.msg || this.msgT < 1) this.setMsg(bank >= CLAW_COST ? `YOU TAKE ₵${fmt(bank)}.  HOUSE SULKS.` : bank > 0 ? `₵${fmt(bank)} BACK. THE TANK KEEPS THE REST.` : 'NOTHING BANKED. THE TANK THANKS YOU.', 8);
    G.render();
  }

  // ---------- the boards on the machine ----------
  drawBoards(time) {
    const sim = this.sim, ph = this.phase;
    const left = Math.ceil(sim.timeLeft);
    let m = '', s1 = '', s2 = '', col = '#ffd23f';
    if (ph === 'play') { m = `TANK #${sim.tank}   BANK ₵${fmt(sim.bank)}   ${left}s`; s1 = `BANK ₵${fmt(sim.bank)}`; s2 = `TIME ${left}`; col = left <= 8 ? '#ff2a4a' : '#7dff6a'; }
    else if (ph === 'shuffle') { m = 'SHUFFLING THE TANK...'; s1 = 'SHUFFLE'; s2 = `TANK #${sim.tank}`; col = '#ff7ad9'; }
    else if (ph === 'over') { m = `ROUND OVER   ₵${fmt(this.last ? this.last.bank : 0)}`; s1 = 'ROUND OVER'; s2 = `₵${fmt(this.last ? this.last.bank : 0)}`; col = '#2ee6ff'; }
    else { m = Math.floor(time / 3) % 2 ? `₵${CLAW_COST} A GAME   BEST ₵${fmt(this.G.st.clawBest || 0)}` : 'ZERO-G CLAW'; s1 = `₵${CLAW_COST}`; s2 = 'INSERT'; col = '#ffd23f'; }
    const key = m + s1 + s2 + col;
    if (key === this.drawn) return;
    this.drawn = key;
    const M = this.marq, x = M.ctx, w = M.pw, h = M.ph;
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.strokeStyle = col; x.lineWidth = 8; x.strokeRect(5, 5, w - 10, h - 10);
    x.fillStyle = col; x.font = FONT(m.length > 18 ? 56 : 78); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(m, w / 2, h / 2 + 4);
    M.tex.needsUpdate = true;
    const S = this.scr, y = S.ctx;
    y.fillStyle = '#05030c'; y.fillRect(0, 0, S.pw, S.ph);
    y.fillStyle = col; y.font = FONT(40); y.textAlign = 'center'; y.textBaseline = 'middle';
    y.fillText(s1, S.pw / 2, S.ph * 0.32); y.fillStyle = '#fff4e0'; y.fillText(s2, S.pw / 2, S.ph * 0.72);
    S.tex.needsUpdate = true;
  }

  // ---------- the camera ----------
  camView() {
    // (close to the glass: the tank's width just fills the screen (or its height, on a very wide one), sitting in the part above the action bar)
    const cam = this.G.g.camera, tv = Math.tan(cam.fov * Math.PI / 360);
    const bar = Math.min(0.45, ((this.G.ui && this.G.ui.offsetHeight) || 190) / window.innerHeight + 0.02);   // (the share of the screen the bar covers)
    const dist = Math.max(TANK_HALF_W / (tv * cam.aspect), TANK_H / (1 - bar) / (2 * tv));
    const lookY = TANK_MID_Y - bar * dist * tv;
    return [clawPt(0, TANK_MID_Y, GLASS_Z + dist), clawPt(0, lookY, GLASS_Z)];
  }

  // ---------- the action bar ----------
  bodyHtml() {
    const sim = this.sim, ph = this.phase;
    const held = sim.holding;
    const en = Math.round(sim.claw.energy * 100);
    const mult = sim.comboMult;
    return `<div class="c3-row"><span>TIME <b>${ph === 'play' ? Math.ceil(sim.timeLeft) : ph === 'shuffle' ? '—' : CLAW_TIME}</b></span><span>BANK <b class="up">₵${fmt(sim.bank)}</b></span><span>COMBO <b>${sim.combo > 1 && sim.comboT > 0 ? '×' + (Math.round(mult * 100) / 100) : '—'}</b></span><span>TANK <b>#${sim.tank}</b></span></div>
      <div class="c3-meter"><span>BEAM</span><i><u style="width:${en}%" class="${en < 25 ? 'low' : ''}"></u></i><span>${held.length ? held.map((h) => h.kind.toUpperCase()).join(' · ') : '—'}</span></div>`;
  }

  ui({ btn, key, gl, pad }) {
    const ph = this.phase;
    const body = this.bodyHtml();
    let btns;
    if (ph === 'idle' || ph === 'over') btns = btn(`INSERT ₵${CLAW_COST} ${key('SPACE', 'A')}`, 'Space', { cls: 'big' });
    else if (ph === 'shuffle') btns = btn('SHUFFLING…', 'x', { dis: true });
    else btns = btn(pad ? `BEAM ${gl('A')} HOLD` : 'BEAM <i>SPACE</i> HOLD', 'x', { dis: true, cls: 'hint' }) + btn(pad ? `MOVE ${gl('LS')} · ${gl('LB')}${gl('RB')} DOWN/UP` : 'MOVE <i>WASD</i> · <i>CLICK</i> DOWN · <i>R-CLICK</i> UP', 'x', { dis: true, cls: 'hint' });
    const foot = pad ? `${gl('LS')} MOVE · ${gl('LB')} / ${gl('RB')} DOWN / UP · ${gl('A')} BEAM` : 'WASD MOVE · LEFT CLICK DOWN · RIGHT CLICK UP · HOLD SPACE FOR THE BEAM';
    return { title: 'ZERO-G CLAW', body, msg: this.msg || (ph === 'idle' ? `₵${CLAW_COST} A ROUND · ${CLAW_TIME} SECONDS · A NEW TANK EVERY TIME` : ''), btns, foot, bet: `ENTRY <b>₵${CLAW_COST}</b>` };
  }
}

