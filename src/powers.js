// Powers: the actives you've earned, all on one key. Z uses the selected one; the mouse wheel steps
// through them. A chip by the weapon readout shows which power Z will use and whether it's ready.
//
//   dash      Daedalus Phase Dash (story tech)
//   teleport  Meridian Personal Teleporter (story tech; T still works)
//   winch     Kepler Hitch-Line Winch (hold Z: winch.js)
//   pen       Dr. Zbornak's holding-pen link (P still works)

const KEY = 'mr-power';
const POWERS = {
  dash: { name: 'Phase Dash', has: (g) => g.story.tech.includes('dash'), cd: (g) => g.story.techCd.dash || 0 },
  teleport: { name: 'Teleporter', has: (g) => g.story.tech.includes('teleport'), cd: (g) => g.story.techCd.teleport || 0 },
  winch: { name: 'Hitch-Line Winch', has: (g) => (g.upgrades.winch || 0) > 0, cd: (g) => (g.winch.on ? 0 : g.winch.cd) },
  pen: { name: 'Pen Link', has: (g) => (g.upgrades.penlink || 0) > 0, cd: () => 0 },
};

export class Powers {
  constructor(game) {
    this.game = game;
    try { this.sel = localStorage.getItem(KEY) || null; } catch { this.sel = null; }
    this.chipT = 0;
    this.flash = 0;
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

  // the wheel: one notch, one power along (wrapping round)
  cycle(dir) {
    const own = this.owned();
    if (own.length < 2) return;
    const i = Math.max(0, own.indexOf(this.current()));
    this.select(own[(i + dir + own.length) % own.length]);
    this.game.audio.tone(dir > 0 ? 760 : 640, 0.05, 'square', 0.05);
  }

  use(k) {
    const g = this.game;
    if (k === 'dash' || k === 'teleport') g.story.useTech(k);
    else if (k === 'winch') g.winch.fire();
    else if (k === 'pen') g.alchemy.penMenu();
  }

  // each frame in play (input is the game's)
  update(dt) {
    const g = this.game;
    const I = g.input;
    // (not while the cable's on: swapping mid-swing would drop you)
    const steps = I.consumeWheel();
    if (steps && !g.winch.on) this.cycle(steps > 0 ? 1 : -1);
    if (I.pressed('KeyZ')) {
      const k = this.current();
      if (k) this.use(k);
      else g.hud.toast('No powers yet. Phase Dash, the Teleporter, the Kepler winch and the pen link all go on Z.', 2.5);
    }
    // the winch holds while Z does
    g.winch.update(dt, I.down('KeyZ') && this.current() === 'winch');
    if (this.flash > 0) this.flash -= dt;
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
    const extra = k === 'winch' ? g.winch.status() : cd > 0 ? `${Math.ceil(cd)} s` : 'READY';
    const many = this.owned().length > 1;
    el.classList.toggle('swap', this.flash > 0);
    el.innerHTML = `<b>Z</b> ${POWERS[k].name.toUpperCase()} <span class="${cd > 0 ? 'pc-cd' : 'pc-ok'}">${extra}</span>${many ? ` <small>WHEEL: ${this.owned().indexOf(k) + 1}/${this.owned().length}</small>` : ''}`;
  }
}
