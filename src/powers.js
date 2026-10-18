// Powers: earned actives on one key. E uses the selected one; the mouse wheel cycles them. A chip by the weapon
// readout shows the selected power and whether it's ready.
//
//   dash      Daedalus Phase Dash (story tech)
//   teleport  Meridian Personal Teleporter (story tech; T still works)
//   vanes     Meridian Quantum Slipstream Vanes (story tech: steer in the air for 10 s, story.js)
//   winch     Kepler Hitch-Line Winch (E toggles it: winch.js)
//   pen       Dr. Zbornak's holding-pen link (P still works)
//   meteor    dev: drops a meteor on you (granted on first use of the dev menu's SPAWN A METEOR ON ME: cheats.js)
//
// Controller: d-pad ↓ opens the radial menu, whose POWERS wedge opens the power wheel (below): right stick picks,
// A equips (like a mouse-wheel notch), RB / E uses.

import { glyphHtml } from './glyphs.js';
import { DEV_TOOLS } from './devtools.js';

const KEY = 'mr-power';
const POWERS = {
  dash: { name: 'Phase Dash', has: (g) => g.story.tech.includes('dash'), cd: (g) => g.story.techCd.dash || 0 },
  teleport: { name: 'Teleporter', has: (g) => g.story.tech.includes('teleport'), cd: (g) => g.story.techCd.teleport || 0 },
  vanes: { name: 'Slipstream Vanes', has: (g) => g.story.tech.includes('vanes'), cd: (g) => (g.story.vanesActive() ? 0 : g.story.techCd.vanes || 0), status: (g) => (g.story.vanesActive() ? `ON ${Math.ceil(g.story.vanesT)} s` : null) },
  winch: { name: 'Hitch-Line Winch', has: (g) => (g.upgrades.winch || 0) > 0, cd: (g) => (g.winch.on ? 0 : g.winch.cd), status: (g) => g.winch.status() },
  pen: { name: 'Pen Link', has: (g) => (g.upgrades.penlink || 0) > 0, cd: () => 0 },
  ...(DEV_TOOLS ? { meteor: { name: 'Meteor Spawn (dev)', has: (g) => !!(g.cheats && g.cheats.meteorPower), cd: () => 0 } } : {}),
};

export class Powers {
  constructor(game) {
    this.game = game;
    try { this.sel = localStorage.getItem(KEY) || null; } catch { this.sel = null; }
    this.chipT = 0;
    this.flash = 0;
    this.radial = null; // open power wheel { sel, items, hub, t }, null when closed
    this.radialEl = null;
  }

  owned() { return Object.keys(POWERS).filter((k) => POWERS[k].has(this.game)); }

  current() {
    const own = this.owned();
    if (!own.length) return null;
    if (!own.includes(this.sel)) this.sel = own[0];
    return this.sel;
  }

  select(k) {
    this.sel = k;
    try { localStorage.setItem(KEY, k); } catch { /* unavailable */ }
    this.flash = 0.6;
    this.chipT = 0;
  }

  // mouse wheel: one notch, one power (wraps)
  cycle(dir) {
    const own = this.owned();
    if (own.length < 2) return;
    const i = Math.max(0, own.indexOf(this.current()));
    this.select(own[(i + dir + own.length) % own.length]);
    this.game.audio.tone(dir > 0 ? 760 : 640, 0.05, 'square', 0.05);
  }

  // readout: live status (winch cable, Vanes on), else READY or the cooldown
  status(k) {
    const g = this.game, P = POWERS[k], cd = P.cd(g);
    return (P.status && P.status(g)) || (cd > 0 ? `${Math.ceil(cd)} s` : 'READY');
  }

  // ---- power wheel (same wheel as the controller menu and vehicles': gamepad.js) ----
  // Opened from the POWERS wedge. Right stick picks (sticky), A equips, d-pad ↓ equips the pick or closes if none,
  // B / Start cancels. The equipped power has an orange edge. Every owned power is on it.
  openRadial() {
    const items = this.owned();
    if (!items.length) return;
    if (!this.radialEl) {
      this.radialEl = document.createElement('div');
      this.radialEl.id = 'powradial';
      document.getElementById('hud').appendChild(this.radialEl);
    }
    this.radial = { sel: -1, items, hub: '', t: 0 };
    const n = items.length;
    this.radialEl.innerHTML = '<div class="pr-ring"></div><div class="pr-hub"></div>' + items.map((k, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return `<div class="pr-item" data-i="${i}" style="left:${50 + Math.cos(a) * 38}%;top:${50 + Math.sin(a) * 38}%"><b>${POWERS[k].name}</b><small></small></div>`;
    }).join('');
    this.radialEl.classList.remove('hidden');
    this.radialDraw();
    this.game.audio.tone(520, 0.08, 'triangle', 0.12);
  }

  // wedge readouts and the equipped mark (a few times a second: the winch's reads its target)
  radialDraw() {
    const R = this.radial;
    if (!R) return;
    const cur = this.current();
    this.radialEl.querySelectorAll('.pr-item').forEach((it) => {
      const k = R.items[+it.dataset.i];
      const cd = POWERS[k].cd(this.game) > 0;
      const s = it.querySelector('small'), t = this.status(k);
      if (s.textContent !== t) s.textContent = t;
      it.classList.toggle('cd', cd);
      it.classList.toggle('cur', k === cur);
    });
    this.radialHub();
  }

  // wheel hub: the picked power (or the title) and button hints
  radialHub() {
    const R = this.radial;
    if (!R) return;
    const k = R.sel >= 0 ? R.items[R.sel] : null;
    const hub = `<b>${k ? POWERS[k].name : 'POWERS'}</b><small><span>${glyphHtml(['RS'])} pick</span><span>${glyphHtml(['A'])} equip</span><span>${glyphHtml(['B'])} cancel</span></small>`;
    if (R.hub !== hub) { R.hub = hub; this.radialEl.querySelector('.pr-hub').innerHTML = hub; }
  }

  // highlight: -1 for none
  radialSelect(sel) {
    const R = this.radial;
    if (!R || sel === R.sel) return;
    R.sel = sel;
    for (const el of this.radialEl.querySelectorAll('.pr-item')) el.classList.toggle('on', +el.dataset.i === sel);
    if (sel >= 0) this.game.audio.tone(700 + sel * 60, 0.04, 'square', 0.05);
    this.radialHub();
  }

  // right stick picks a wedge; the pick stays until you push to another
  radialStick(rx, ry) {
    const R = this.radial;
    if (!R || Math.hypot(rx, ry) <= 0.55) return;
    const n = R.items.length;
    const a = Math.atan2(rx, -ry); // 0 at the top, clockwise
    this.radialSelect(((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n);
  }

  // the picked power, or null for none
  radialPick() {
    const R = this.radial;
    return R && R.sel >= 0 ? R.items[R.sel] : null;
  }

  // not while the cable's on: swapping mid-swing would drop you (as with the mouse wheel)
  pickable(k) { return !k || k === this.current() || !this.game.winch.on; }

  closeRadial(commit) {
    const k = commit ? this.radialPick() : null;
    this.radial = null;
    if (this.radialEl) this.radialEl.classList.add('hidden');
    if (k && k !== this.current() && this.pickable(k)) { this.select(k); this.game.audio.tone(760, 0.05, 'square', 0.05); }
  }

  use(k) {
    const g = this.game;
    if (k === 'dash' || k === 'teleport' || k === 'vanes') g.story.useTech(k);
    else if (k === 'winch') { if (g.winch.on) g.winch.release(); else g.winch.fire(); } // E again lets go
    else if (k === 'pen') g.alchemy.penMenu();
    else if (k === 'meteor') g.cheats.spawnMeteor(false);
  }

  // each frame in play (input is the game's)
  update(dt) {
    const g = this.game;
    const I = g.input;
    // not while the cable's on: swapping mid-swing would drop you
    const steps = I.consumeWheel();
    if (steps && !g.winch.on) this.cycle(steps > 0 ? 1 : -1);
    const limp = !!g.player.rag; // no powers while ragdolled
    if (I.pressed('KeyE') && !limp) {
      const k = this.current();
      if (k) this.use(k);
      else g.hud.toast('No powers yet. Phase Dash, the Teleporter, the Kepler winch and the pen link all go on E.', 2.5);
    }
    // winch stays on until E again (or it runs out, snaps or slips)
    g.winch.update(dt, this.current() === 'winch' && !limp);
    if (this.flash > 0) this.flash -= dt;
    if (this.radial && (this.radial.t -= dt) <= 0) { this.radial.t = 0.1; this.radialDraw(); }
    this.chipT -= dt;
    if (this.chipT <= 0) { this.chipT = 0.2; this.drawChip(); }
  }

  drawChip() {
    const g = this.game;
    let el = document.getElementById('powerchip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'powerchip';
      el.className = 'chip';
      const w = document.getElementById('weaponchip');
      if (w) w.after(el); else document.getElementById('hud').appendChild(el);
    }
    const k = this.current();
    if (!k) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const cd = POWERS[k].cd(g);
    const extra = this.status(k);
    const many = this.owned().length > 1;
    el.classList.toggle('swap', this.flash > 0);
    el.innerHTML = `<b>E</b> ${POWERS[k].name.toUpperCase()} <span class="${cd > 0 ? 'pc-cd' : 'pc-ok'}">${extra}</span>${many ? ` <small>WHEEL: ${this.owned().indexOf(k) + 1}/${this.owned().length}</small>` : ''}`;
  }
}
