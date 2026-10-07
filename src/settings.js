// Settings menu: graphics / gameplay / audio / controls. Values live in `settings.v`, are saved
// to localStorage and pushed into the running game by apply(game). Game code reads them as
// `g.settings ? g.settings.v.<key> : <default>` so it still works without this module.

const KEY = 'moonrunner-settings-v1';

// Remappable actions: the game always checks the DEFAULT code; Input translates.
export const ACTIONS = [
  { code: 'KeyW', label: 'Forward / flip forward' },
  { code: 'KeyS', label: 'Back / flip backward' },
  { code: 'KeyA', label: 'Left / carve / spin' },
  { code: 'KeyD', label: 'Right / carve / spin' },
  { code: 'Space', label: 'Quantum-Lock skates (hold)' },
  { code: 'ShiftLeft', label: 'Mag-jump / Dive (hold in the air)' },
  { code: 'KeyE', label: 'Thrusters (hold)' },
  { code: 'KeyQ', label: 'Tricks (hold in the air)' },
  { code: 'KeyF', label: 'Interact / job board' },
  { code: 'KeyG', label: 'Scoop into jar' },
  { code: 'KeyX', label: 'Empty jar' },
  { code: 'KeyL', label: 'Helmet lamp mode' },
  { code: 'KeyM', label: 'Globe map' },
  { code: 'KeyJ', label: 'Reputation log' },
  { code: 'KeyC', label: 'Wardrobe' },
  { code: 'KeyP', label: 'Holding pen' },
  { code: 'KeyR', label: 'Emergency recall (hold 1.5 s)' },
  { code: 'KeyN', label: 'Music on / off' },
  { code: 'KeyV', label: 'Vehicle: call / board / leave' },
  { code: 'KeyZ', label: 'Phase Dash (tech)' },
  { code: 'KeyT', label: 'Personal Teleporter (tech)' },
  { code: 'KeyH', label: 'Help panel' },
];
// keys the game hard-wires for menus and weapon slots
const RESERVED = ['Escape', 'Enter', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

const LEVELS = [['off', 'OFF'], ['rare', 'RARE'], ['normal', 'NORMAL'], ['often', 'OFTEN']];
const pct = (v) => `${Math.round(v * 100)}%`;
const mult = (v) => `×${v.toFixed(2).replace(/0$/, '')}`;

// type: range | toggle | choice
export const SCHEMA = {
  graphics: [
    { key: 'renderScale', label: 'Render scale', type: 'range', min: 0.4, max: 1.5, step: 0.05, def: 1, fmt: pct, hint: 'Lower = faster, blurrier' },
    { key: 'fov', label: 'Field of view', type: 'range', min: 50, max: 100, step: 1, def: 72, fmt: (v) => `${v}°` },
    { key: 'viewDist', label: 'View distance', type: 'range', min: 0.4, max: 1.5, step: 0.05, def: 1, fmt: pct },
    { key: 'terrainDetail', label: 'Terrain detail', type: 'range', min: 0.6, max: 1.6, step: 0.05, def: 1, fmt: pct, hint: 'How far the detailed ground reaches' },
    { key: 'shadows', label: 'Shadows', type: 'toggle', def: true },
    { key: 'shadowRes', label: 'Shadow quality', type: 'choice', def: 2048, options: [[1024, 'LOW'], [2048, 'MEDIUM'], [4096, 'HIGH']] },
    { key: 'halftone', label: 'Comic halftone dots', type: 'toggle', def: true },
    { key: 'speedLines', label: 'Speed lines', type: 'toggle', def: true },
    { key: 'ink', label: 'Ink outline strength', type: 'range', min: 0, max: 2, step: 0.1, def: 1, fmt: pct },
    { key: 'particles', label: 'Particle density', type: 'range', min: 0, max: 2, step: 0.1, def: 1, fmt: pct },
    { key: 'shake', label: 'Screen shake', type: 'range', min: 0, max: 2, step: 0.1, def: 1, fmt: pct },
    { key: 'damageFlash', label: 'Damage flash', type: 'range', min: 0, max: 1.5, step: 0.1, def: 1, fmt: pct },
    { key: 'fpsCap', label: 'Frame-rate cap', type: 'choice', def: 0, options: [[0, 'UNCAPPED'], [120, '120'], [60, '60'], [30, '30 · BATTERY SAVER']] },
  ],
  gameplay: [
    { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.1, max: 3, step: 0.05, def: 1, fmt: mult },
    { key: 'invertY', label: 'Invert mouse Y', type: 'toggle', def: false },
    { key: 'camDist', label: 'Camera distance', type: 'range', min: 0.5, max: 2.2, step: 0.05, def: 1, fmt: mult },
    { key: 'camHeight', label: 'Camera height', type: 'range', min: -1, max: 4, step: 0.1, def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} m` },
    { key: 'shoulder', label: 'Shoulder offset', type: 'range', min: -2.5, max: 2.5, step: 0.1, def: 0, fmt: (v) => (Math.abs(v) < 0.05 ? 'CENTRE' : `${Math.abs(v).toFixed(1)} m ${v < 0 ? 'LEFT' : 'RIGHT'}`) },
    { key: 'camSmooth', label: 'Camera smoothing', type: 'range', min: 0, max: 3, step: 0.1, def: 1, fmt: (v) => (v < 0.05 ? 'OFF' : mult(v)) },
    { key: 'panels', label: 'Action panel pop-ups', type: 'choice', def: 'normal', options: LEVELS.slice(0, 3), hint: 'The comic picture-in-picture panels' },
    { key: 'photos', label: 'Highlight photo frequency', type: 'choice', def: 'normal', options: LEVELS, hint: 'Snapshots pinned to the Hall of Highlights' },
    { key: 'tips', label: 'Show tips', type: 'toggle', def: true },
    { key: 'lampDefault', label: 'Helmet lamp at start', type: 'choice', def: 'auto', options: [['auto', 'AUTO'], ['on', 'ON'], ['off', 'OFF']] },
    { key: 'minimap', label: 'Minimap', type: 'toggle', def: true },
    { key: 'hudScale', label: 'HUD scale', type: 'range', min: 0.6, max: 1.4, step: 0.05, def: 1, fmt: pct },
    { key: 'units', label: 'Speed units', type: 'choice', def: 'kmh', options: [['kmh', 'KM/H'], ['ms', 'M/S']] },
  ],
  audio: [
    { key: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'music', label: 'Music volume', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'sfx', label: 'Effects volume', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
  ],
};
const TABS = [['graphics', 'GRAPHICS'], ['gameplay', 'GAMEPLAY'], ['audio', 'AUDIO'], ['controls', 'CONTROLS']];

export function keyName(code) {
  if (!code) return '—';
  const named = {
    Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Backslash: '\\', Comma: ',', Period: '.', Slash: '/', Tab: 'TAB', CapsLock: 'CAPS',
    Backspace: 'BKSP', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', MetaLeft: 'META', MetaRight: 'META',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
  return code.toUpperCase();
}

// Help-table / title-card labels rebuilt from the current bindings (k = code -> label).
const HELP_ROWS = {
  'W A S D': (k) => `${k('KeyW')} ${k('KeyA')} ${k('KeyS')} ${k('KeyD')}`,
  'SPACE (hold)': (k) => `${k('Space')} (hold)`,
  'A / D on skates': (k) => `${k('KeyA')} / ${k('KeyD')} on skates`,
  'E / Right mouse': (k) => `${k('KeyE')} / Right mouse`,
  SHIFT: (k) => (k('ShiftLeft') === 'L-SHIFT' ? 'SHIFT' : k('ShiftLeft')),
  'Q + W/S · Q + A/D': (k) => `${k('KeyQ')} + ${k('KeyW')}/${k('KeyS')} · ${k('KeyQ')} + ${k('KeyA')}/${k('KeyD')}`,
  L: (k) => k('KeyL'), J: (k) => k('KeyJ'), C: (k) => k('KeyC'), N: (k) => k('KeyN'), P: (k) => k('KeyP'),
  'G · X': (k) => `${k('KeyG')} · ${k('KeyX')}`,
  F: (k) => k('KeyF'), M: (k) => k('KeyM'), R: (k) => k('KeyR'), H: (k) => k('KeyH'),
  '` (backtick)': (k) => (k('Backquote') === '`' ? '` (backtick)' : k('Backquote')),
};
const MINI_ROWS = {
  SPACE: (k) => k('Space'), WASD: (k) => `${k('KeyW')}${k('KeyA')}${k('KeyS')}${k('KeyD')}`, 'E/RMB': (k) => `${k('KeyE')}/RMB`,
  SHIFT: (k) => (k('ShiftLeft') === 'L-SHIFT' ? 'SHIFT' : k('ShiftLeft')), Q: (k) => k('KeyQ'), M: (k) => k('KeyM'), J: (k) => k('KeyJ'), L: (k) => k('KeyL'),
  F: (k) => k('KeyF'), C: (k) => k('KeyC'), H: (k) => k('KeyH'),
};

export class Settings {
  constructor() {
    this.v = this.defaults();
    this.load();
    this.tab = 'graphics';
    this.open = false;
    this.from = null;
    this.rebinding = null;
    this.lastFrame = 0;
    this.game = null;
    this.el = document.getElementById('settings');
    window.addEventListener('keydown', (e) => this.onKeyCapture(e), true);
  }

  defaults() {
    const v = { binds: {} };
    for (const tab of Object.values(SCHEMA)) for (const s of tab) v[s.key] = s.def;
    return v;
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d || typeof d !== 'object') return;
      for (const tab of Object.values(SCHEMA)) {
        for (const s of tab) if (d[s.key] !== undefined && typeof d[s.key] === typeof s.def) this.v[s.key] = d[s.key];
      }
      if (d.binds && typeof d.binds === 'object') this.v.binds = { ...d.binds };
    } catch { /* corrupt or unavailable */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* storage unavailable */ }
  }

  // physical key currently bound to an action's default code
  bound(code) { return this.v.binds[code] || code; }
  label(code) { return keyName(this.bound(code)); }

  // seconds between highlight photos (Infinity = never)
  photoGap() { return { off: Infinity, rare: 60, normal: 15, often: 4 }[this.v.photos] ?? 15; }

  // frame-rate cap: true when this frame should be skipped
  skip(now) {
    const cap = this.v.fpsCap;
    if (!cap) return false;
    if (now - this.lastFrame < 1000 / cap - 1.5) return true;
    this.lastFrame = now;
    return false;
  }

  // Push every value into the running game. Each subsystem is optional (may not exist yet).
  apply(g = this.game, initial = false) {
    if (!g) return;
    this.game = g;
    const v = this.v;
    const R = g.renderer;
    if (R) {
      const pr = Math.min(window.devicePixelRatio || 1, 2) * v.renderScale;
      if (Math.abs(R.getPixelRatio() - pr) > 1e-3) {
        R.setPixelRatio(pr);
        if (g.post && g.resize) g.resize();
      }
    }
    if (g.sun) {
      g.sun.castShadow = v.shadows;
      const sh = g.sun.shadow;
      if (sh.mapSize.x !== v.shadowRes) {
        sh.mapSize.set(v.shadowRes, v.shadowRes);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
      }
    }
    if (g.planet) g.planet.lodScale = v.terrainDetail;
    if (g.fx) g.fx.density = v.particles;
    for (const post of [g.post, g.highlights && g.highlights.post]) {
      if (!post) continue;
      const u = post.material.uniforms;
      if (u.halftone) u.halftone.value = v.halftone ? 1 : 0;
      if (u.lines) u.lines.value = v.speedLines ? 1 : 0;
      if (u.inkK) u.inkK.value = v.ink;
    }
    if (g.audio && g.audio.setVolumes) g.audio.setVolumes(v.master, v.music, v.sfx);
    if (g.input && g.input.setBindings) g.input.setBindings(v.binds);
    if (initial && g.lampMode !== undefined) g.lampMode = v.lampDefault;
    const mm = document.getElementById('minimap');
    if (mm) mm.style.display = v.minimap ? '' : 'none';
    for (const id of ['topleft', 'minimap', 'speedo']) {
      const el = document.getElementById(id);
      if (el) el.style.zoom = v.hudScale === 1 ? '' : String(v.hudScale);
    }
    const unit = document.querySelector('#speedo .unit');
    if (unit) unit.textContent = v.units === 'ms' ? 'M/S' : 'KM/H';
    if (g.hud) g.hud.lastSpeedTxt = '';
    if (!v.tips) { const t = document.getElementById('tip'); if (t) t.classList.add('hidden'); }
    this.updateHelp();
  }

  updateHelp() {
    const k = (c) => this.label(c);
    for (const td of document.querySelectorAll('#help td:first-child')) {
      if (!td.dataset.orig) td.dataset.orig = td.textContent;
      const f = HELP_ROWS[td.dataset.orig];
      if (f) td.textContent = f(k);
    }
    for (const b of document.querySelectorAll('.controls-mini b')) {
      if (!b.dataset.orig) b.dataset.orig = b.textContent;
      const f = MINI_ROWS[b.dataset.orig];
      if (f) b.textContent = f(k);
    }
  }

  // ---------- rebinding ----------
  rebind(def, phys) {
    if (def === 'Escape' || RESERVED.includes(phys)) return false;
    const binds = { ...this.v.binds };
    const prev = binds[def] || def;
    if (phys === prev) return true;
    // whoever had this key gets our old one (swap)
    const other = ACTIONS.find((a) => a.code !== def && (binds[a.code] || a.code) === phys);
    if (other) binds[other.code] = prev;
    binds[def] = phys;
    for (const c of Object.keys(binds)) if (binds[c] === c) delete binds[c];
    this.v.binds = binds;
    return true;
  }

  onKeyCapture(e) {
    if (!this.open) return;
    if (this.rebinding) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') { this.rebinding = null; this.render(); return; }
      if (RESERVED.includes(e.code)) {
        this.flash(`${keyName(e.code)} is reserved for menus / weapon slots`);
        return;
      }
      this.rebind(this.rebinding, e.code);
      this.rebinding = null;
      this.commit();
      this.render();
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    }
  }

  flash(msg) {
    const n = this.el.querySelector('.set-note');
    if (n) { n.textContent = msg; n.classList.remove('hidden'); }
  }

  // ---------- UI ----------
  attach(g) {
    this.game = g;
    const btn = (id, from) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.show(from);
      });
    };
    btn('settings-btn-title', 'title');
    btn('settings-btn-pause', 'pause');
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onInput(e));
  }

  show(from) {
    this.open = true;
    this.from = from;
    this.rebinding = null;
    if (from === 'pause') document.getElementById('pause').classList.add('hidden');
    this.el.classList.remove('hidden');
    this.render();
    const g = this.game;
    if (g && g.audio && g.audio.click) g.audio.click();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.rebinding = null;
    this.el.classList.add('hidden');
    this.save();
    const g = this.game;
    // back to the pause card unless the game was resumed some other way meanwhile
    if (this.from === 'pause' && g && g.state === 'paused') document.getElementById('pause').classList.remove('hidden');
  }

  commit() {
    this.save();
    this.apply();
  }

  find(key) {
    for (const tab of Object.values(SCHEMA)) for (const s of tab) if (s.key === key) return s;
    return null;
  }

  resetTab() {
    if (this.tab === 'controls') this.v.binds = {};
    else for (const s of SCHEMA[this.tab]) this.v[s.key] = s.def;
    this.commit();
    this.render();
  }

  onInput(e) {
    const r = e.target.closest('input[type=range]');
    if (!r) return;
    const s = this.find(r.dataset.key);
    if (!s) return;
    this.v[s.key] = parseFloat(r.value);
    const out = r.closest('.set-row').querySelector('.set-val');
    if (out) out.textContent = s.fmt ? s.fmt(this.v[s.key]) : this.v[s.key];
    this.commit();
  }

  onClick(e) {
    e.stopPropagation();
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const g = this.game;
    if (g && g.audio && g.audio.click && act !== 'bind') g.audio.click();
    if (act === 'tab') { this.tab = t.dataset.tab; this.rebinding = null; this.render(); } else if (act === 'back') this.close();
    else if (act === 'reset') this.resetTab();
    else if (act === 'toggle') { const k = t.dataset.key; this.v[k] = !this.v[k]; this.commit(); this.render(); } else if (act === 'choice') {
      const s = this.find(t.dataset.key);
      const opt = s.options[+t.dataset.i];
      this.v[s.key] = opt[0];
      this.commit();
      this.render();
    } else if (act === 'bind') {
      this.rebinding = this.rebinding === t.dataset.code ? null : t.dataset.code;
      this.render();
    }
  }

  render() {
    const v = this.v;
    const tabs = TABS.map(([id, name]) => `<button class="set-tab ${id === this.tab ? 'on' : ''}" data-act="tab" data-tab="${id}">${name}</button>`).join('');
    let body = '';
    if (this.tab === 'controls') {
      body = `<div class="set-hint">Click an action, then press the new key. <b>ESC</b> cancels. Taking a key that's already used swaps the two. ESC, ENTER and 1–9 (weapons / menu picks) are fixed.</div>`;
      body += ACTIONS.map((a) => {
        const wait = this.rebinding === a.code;
        const changed = this.bound(a.code) !== a.code;
        return `<div class="set-row bind"><span class="set-label">${a.label}</span>
          <button class="set-key ${wait ? 'wait' : ''} ${changed ? 'changed' : ''}" data-act="bind" data-code="${a.code}">${wait ? 'PRESS A KEY…' : keyName(this.bound(a.code))}</button></div>`;
      }).join('');
      body += `<div class="set-row bind fixed"><span class="set-label">Pause / back</span><span class="set-key">ESC</span></div>`;
      body += `<div class="set-row bind fixed"><span class="set-label">Fire · thrust</span><span class="set-key">LMB · RMB</span></div>`;
      body += `<div class="set-row bind fixed"><span class="set-label">Weapon slots</span><span class="set-key">1 2 3 4</span></div>`;
    } else {
      body = SCHEMA[this.tab].map((s) => {
        const val = v[s.key];
        let ctl = '';
        if (s.type === 'range') {
          ctl = `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${val}" data-key="${s.key}"><span class="set-val">${s.fmt ? s.fmt(val) : val}</span>`;
        } else if (s.type === 'toggle') {
          ctl = `<button class="set-toggle ${val ? 'on' : ''}" data-act="toggle" data-key="${s.key}">${val ? 'ON' : 'OFF'}</button>`;
        } else {
          ctl = `<span class="set-choices">${s.options.map(([ov, name], i) => `<button class="set-choice ${ov === val ? 'on' : ''}" data-act="choice" data-key="${s.key}" data-i="${i}">${name}</button>`).join('')}</span>`;
        }
        return `<div class="set-row"><span class="set-label">${s.label}${s.hint ? `<small>${s.hint}</small>` : ''}</span><span class="set-ctl">${ctl}</span></div>`;
      }).join('');
    }
    this.el.innerHTML = `<div class="panel set-card">
      <h1>SETTINGS</h1>
      <div class="set-tabs">${tabs}</div>
      <div class="set-body">${body}</div>
      <div class="set-note hidden"></div>
      <div class="set-foot"><button class="set-btn reset" data-act="reset">RESET ${this.tab === 'controls' ? 'KEYS' : 'TAB'}</button><button class="set-btn back" data-act="back">BACK</button></div>
    </div>`;
  }
}
