// Settings menu: graphics / gameplay / audio / controls. Values in `settings.v`, saved to localStorage, pushed into the
// game by apply(game). Game code reads `g.settings ? g.settings.v.<key> : <default>`, so it works without this module.

import { glyphHtml, glyphState, tokensFor } from './glyphs.js';
import { gyroSupported } from './gyro.js';
import { DEV_TOOLS } from './devtools.js';
import { SKIN_FROM_URL } from './moonSkins.js';
import { INK_U, inkMat, inkMatBaked, inkMatSolid } from './toon.js';

const KEY = 'moonrunner-settings-v1';
const BINDS_V = 2; // 2: no thruster key (right mouse only); power on E, not Z

// Migrates pre-v2 binds: drop the thruster key (E); the power's binding moves from Z to E.
function migrateBinds(old) {
  const out = {};
  for (const [def, phys] of Object.entries(old)) {
    if (def === 'KeyE') continue;
    out[def === 'KeyZ' ? 'KeyE' : def] = phys;
  }
  // an action on physical E swaps with the power
  if (!out.KeyE) for (const def of Object.keys(out)) if (out[def] === 'KeyE') out[def] = 'KeyZ';
  return out;
}

// Remappable actions: the game always checks the DEFAULT code; Input translates.
export const ACTIONS = [
  { code: 'KeyW', label: 'Forward / flip forward' },
  { code: 'KeyS', label: 'Back / flip backward' },
  { code: 'KeyA', label: 'Left / carve / spin' },
  { code: 'KeyD', label: 'Right / carve / spin' },
  { code: 'Space', label: 'Quantum-Lock skates (hold)' },
  { code: 'ShiftLeft', label: 'Mag-jump / Dive (hold in the air)' },
  { code: 'KeyQ', label: 'Tricks (hold in the air)' },
  { code: 'KeyF', label: 'Interact / job board' },
  { code: 'KeyG', label: 'Scoop into jar' },
  { code: 'KeyX', label: 'Empty jar' },
  { code: 'KeyM', label: 'Globe map' },
  { code: 'KeyJ', label: 'Reputation log' },
  { code: 'KeyC', label: 'Wardrobe' },
  { code: 'KeyP', label: 'Holding pen' },
  { code: 'KeyR', label: 'Emergency recall (hold 1.5 s)' },
  { code: 'KeyN', label: 'Music on / off' },
  { code: 'KeyV', label: 'Vehicle: call / board / leave' },
  { code: 'KeyE', label: 'Power (mouse wheel: pick one)' },
  { code: 'KeyT', label: 'Personal Teleporter (tech)' },
  { code: 'KeyH', label: 'Blackjack: hit' }, // (the casino reads this code)
];
// keys the game hard-wires for menus and weapon slots
const RESERVED = ['Escape', 'Enter', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];


// Quality presets: picking one sets these; changing one by hand makes it CUSTOM. Ground detail is for the regolith
// texture (moonSkins.js; dev builds only, via its setting or ?moonskin=1), so release presets leave it out.
const gd = (n) => (DEV_TOOLS ? { groundDetail: n } : {});
const PRESETS = {
  low: { renderScale: 0.75, viewDist: 0.7, terrainDetail: 0.75, shadows: true, shadowRes: 1024, particles: 0.6, ...gd(0) },
  medium: { renderScale: 1, viewDist: 1, terrainDetail: 1, shadows: true, shadowRes: 2048, particles: 1, ...gd(1) },
  high: { renderScale: 1, viewDist: 1.3, terrainDetail: 1.3, shadows: true, shadowRes: 4096, particles: 1.3, ...gd(2) },
};
const PRESET_KEYS = Object.keys(PRESETS.medium);
const PRESET_NAME = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
const pct = (v) => `${Math.round(v * 100)}%`;
const mult = (v) => `×${v.toFixed(2).replace(/0$/, '')}`;

// type: range | toggle | choice
export const SCHEMA = {
  graphics: [
    { key: 'preset', label: 'Quality preset', type: 'choice', def: 'medium', options: [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH'], ['custom', 'CUSTOM']], hint: 'Sets the options below in one go' },
    { key: 'renderScale', label: 'Render scale', type: 'range', min: 0.4, max: 1.5, step: 0.05, def: 1, fmt: pct, hint: 'Lower = faster, blurrier' },
    { key: 'fov', label: 'Field of view', type: 'range', min: 50, max: 100, step: 1, def: 72, fmt: (v) => `${v}°` },
    { key: 'viewDist', label: 'View distance', type: 'range', min: 0.4, max: 1.5, step: 0.05, def: 1, fmt: pct },
    { key: 'terrainDetail', label: 'Terrain detail', type: 'range', min: 0.6, max: 1.6, step: 0.05, def: 1, fmt: pct, hint: 'How far the detailed ground reaches' },
    { key: 'shadows', label: 'Shadows', type: 'toggle', def: true },
    { key: 'shadowRes', label: 'Shadow quality', type: 'choice', def: 2048, options: [[1024, 'LOW'], [2048, 'MEDIUM'], [4096, 'HIGH']] },
    { key: 'lunarLight', label: 'Lunar light', type: 'toggle', def: true, hint: 'Crisp shadows and deep shade, as under a sun with no air. Off: softer shadows, brighter shade' },
    // (regolith ground texture, moonSkins.js: dev builds only, off by default)
    ...(DEV_TOOLS ? [
      { key: 'regolith', label: 'Regolith ground texture', type: 'toggle', def: false, hint: 'Lunar dust, pebbles and craters on the ground, and grain and dust on the rocks' },
      { key: 'groundDetail', label: 'Ground detail', type: 'choice', def: 1, options: [[0, 'LOW'], [1, 'MEDIUM'], [2, 'HIGH']], hint: 'How much of the regolith texture is drawn: lower is faster' },
    ] : []),
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
    { key: 'minimap', label: 'Minimap', type: 'toggle', def: true },
    { key: 'hudScale', label: 'HUD scale', type: 'range', min: 0.6, max: 1.4, step: 0.05, def: 1, fmt: pct },
    { key: 'units', label: 'Speed units', type: 'choice', def: 'kmh', options: [['kmh', 'KM/H'], ['ms', 'M/S']] },
    { key: 'gyro', label: 'PlayStation gyro', type: 'toggle', def: true, hint: 'Hold Circle and tilt the pad: it works like the left stick' },
    { key: 'gyroRange', label: 'Gyro: tilt for a full push', type: 'range', min: 15, max: 60, step: 5, def: 30, fmt: (v) => `${v}°`, hint: 'Smaller = more sensitive' },
    { key: 'gyroInvX', label: 'Gyro: flip left / right', type: 'toggle', def: false },
    { key: 'gyroInvY', label: 'Gyro: flip forward / back', type: 'toggle', def: false },
    { key: 'rumble', label: 'Controller vibration', type: 'toggle', def: true, hint: 'Jumps, landings, hits, blasts and weapons, and a hum from the skates, thrusters and rails' },
    { key: 'rumbleLevel', label: 'Vibration strength', type: 'range', min: 0.2, max: 1.5, step: 0.1, def: 1, fmt: pct },
    { key: 'padLight', label: 'Controller lightbar', type: 'toggle', def: true, hint: 'PlayStation pads, through the link below: your skates\' colour, red when hurt, and the player lights count your health' },
    { key: 'padTriggers', label: 'Adaptive triggers', type: 'toggle', def: true, hint: 'DualSense, through the link below: the weapon\'s click, the thrusters\' spring and buzz' },
  ],
  audio: [
    { key: 'mute', label: 'Mute all audio', type: 'toggle', def: false, hint: 'Silences everything: music, effects, wind, skates and thrusters' },
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

// [what it does, the buttons]; '#text' is plain text between glyphs
const PAD_ROWS = [
  ['Move / steer / carve', ['LS']],
  ['Look', ['RS']],
  ['Quantum-Lock skates (hold)', ['LB']],
  ['Mag-jump / Dive (hold in the air)', ['A']],
  ['Thrusters (hold)', ['LT']],
  ['Tricks (hold in the air)', ['B']],
  ['PlayStation gyro: tilt like the left stick', ['B', '#+', '#tilt']],
  ['Interact / job board', ['X']],
  ['Scoop into jar', ['R3']],
  ['Vehicle: call / board / leave', ['Y']],
  ['Power (again to let go of the winch)', ['RB']],
  ['Next power', ['DU']],
  ['Fire', ['RT']],
  ['Previous / next weapon', ['DL', 'DR']],
  ['Radial menu: open / use the pick', ['DD']],
  ['Radial menu: pick a wedge', ['RS']],
  ['Radial menu: use / cancel', ['A', 'B']],
  ['Globe map', ['VIEW', '#tap']],
  ['Emergency recall', ['VIEW', '#hold']],
  ['Pause / resume', ['START']],
  ['Menus: press / back', ['A', 'B']],
  ['Menus: previous / next tab', ['LB', 'RB']],
];

// Help-table rows that aren't a single key (the rest go through tokensFor)
const HELP_PAD = {
  Mouse: ['RS'], 'Left mouse': ['RT'], 'SPACE (hold)': ['LB'], 'A / D on skates': ['LS'], 'Right mouse': ['LT'],
  'Q + W/S · Q + A/D': ['B', '#+', 'LS'], '1 2 3 4': ['DL', 'DR'], 'X (hold)': ['DD'], 'R (hold)': ['VIEW', '#hold'], M: ['VIEW', '#tap'],
};

// Help-table rows with no pad button (music: Settings → Audio), hidden while a pad is in use
const HELP_PAD_HIDE = ['N'];

// Help-table / title-card labels rebuilt from the current bindings (k = code -> label).
const HELP_ROWS = {
  'W A S D': (k) => `${k('KeyW')} ${k('KeyA')} ${k('KeyS')} ${k('KeyD')}`,
  'SPACE (hold)': (k) => `${k('Space')} (hold)`,
  'A / D on skates': (k) => `${k('KeyA')} / ${k('KeyD')} on skates`,
  SHIFT: (k) => (k('ShiftLeft') === 'L-SHIFT' ? 'SHIFT' : k('ShiftLeft')),
  'Q + W/S · Q + A/D': (k) => `${k('KeyQ')} + ${k('KeyW')}/${k('KeyS')} · ${k('KeyQ')} + ${k('KeyA')}/${k('KeyD')}`,
  J: (k) => k('KeyJ'), C: (k) => k('KeyC'), N: (k) => k('KeyN'), P: (k) => k('KeyP'), V: (k) => k('KeyV'), E: (k) => k('KeyE'), T: (k) => k('KeyT'),
  'X (hold)': (k) => `${k('KeyX')} (hold)`, G: (k) => k('KeyG'),
  F: (k) => k('KeyF'), M: (k) => k('KeyM'), R: (k) => k('KeyR'),
  '` (backtick)': (k) => (k('Backquote') === '`' ? '` (backtick)' : k('Backquote')),
};
const MINI_ROWS = {
  SPACE: (k) => k('Space'), WASD: (k) => `${k('KeyW')}${k('KeyA')}${k('KeyS')}${k('KeyD')}`,
  SHIFT: (k) => (k('ShiftLeft') === 'L-SHIFT' ? 'SHIFT' : k('ShiftLeft')), Q: (k) => k('KeyQ'), M: (k) => k('KeyM'), J: (k) => k('KeyJ'),
  F: (k) => k('KeyF'), C: (k) => k('KeyC'),
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
      if (d.binds && typeof d.binds === 'object') this.v.binds = d.bindsV >= 2 ? { ...d.binds } : migrateBinds(d.binds);
      if (typeof d.autoTuned === 'boolean') this.v.autoTuned = d.autoTuned;
      if (d.preset === undefined) this.v.preset = this.matchPreset(); // (saves with no preset)
      // (saves with no Ground detail take the preset's, so LOW doesn't get HIGH detail)
      else if (d.groundDetail === undefined && PRESETS[d.preset] && PRESETS[d.preset].groundDetail !== undefined) this.v.groundDetail = PRESETS[d.preset].groundDetail;
      this.stored = true;
    } catch { /* corrupt or unavailable */ }
  }

  // Which preset the current values amount to ('custom' if none).
  matchPreset() {
    for (const [id, p] of Object.entries(PRESETS)) if (PRESET_KEYS.every((k) => this.v[k] === p[k])) return id;
    return 'custom';
  }

  usePreset(id) {
    const p = PRESETS[id];
    if (!p) return;
    Object.assign(this.v, p);
    this.v.preset = id;
  }

  // First launch (no saved settings): guess a preset from GPU and CPU before anything is drawn. Software renderer,
  // integrated Intel or a small CPU: LOW; a big discrete card: HIGH; else MEDIUM. perfSample then times the first
  // half-minute of play and steps down once if it struggles.
  autoDetect(renderer) {
    if (this.stored) return;
    // (brand-new installs only: existing players keep what they had)
    try { for (let i = 0; i < localStorage.length; i++) if (/^mr-slot|^mr-slots-init|^moonrunner-save/.test(localStorage.key(i) || '')) return; } catch { return; }
    let gpu = '';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').toLowerCase();
    } catch { /* not available */ }
    const cores = navigator.hardwareConcurrency || 4;
    let id = 'medium';
    if (/swiftshader|llvmpipe|software|basic render|mali|adreno|powervr/.test(gpu) || (/intel/.test(gpu) && !/arc/.test(gpu)) || cores <= 4) id = 'low';
    else if (cores >= 8 && /rtx|rx ?[67]\d{3}|rx ?9\d{3}|radeon pro w|arc a7|apple m\d (pro|max|ultra)/.test(gpu)) id = 'high';
    this.usePreset(id);
    this.v.autoTuned = false;
    this.gpu = gpu;
    this.save();
  }

  // Per frame (raw ms between frames), first launch: 5 s to settle, then 25 s timed.
  perfSample(ms, playing) {
    if (this.v.autoTuned !== false || !playing || ms > 250 || document.hidden) return;
    this.pf ||= { t: 0, n: 0, sum: 0 };
    const pf = this.pf;
    pf.t += ms / 1000;
    if (pf.t < 5) return;
    pf.n++; pf.sum += ms;
    if (pf.t < 30) return;
    const avg = pf.sum / pf.n;
    this.v.autoTuned = true;
    const down = { high: 'medium', medium: 'low' }[this.v.preset];
    if (avg > 24 && down) {
      this.usePreset(down);
      this.apply();
      const g = this.game;
      if (g && g.hud) g.hud.toast(`Graphics set to ${PRESET_NAME[down]} for smoother play. Change it any time in Settings.`, 6);
    }
    this.save();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ...this.v, bindsV: BINDS_V })); } catch { /* storage unavailable */ }
  }

  // physical key currently bound to an action's default code
  bound(code) { return this.v.binds[code] || code; }
  label(code) { return keyName(this.bound(code)); }

  // frame-rate cap: true when this frame should be skipped
  skip(now) {
    const cap = this.v.fpsCap;
    if (!cap) return false;
    if (now - this.lastFrame < 1000 / cap - 1.5) return true;
    this.lastFrame = now;
    return false;
  }

  // Push every value into the game. Each subsystem is optional (may not exist yet).
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
      if (g.farShadow) g.farShadow.setRes(v.shadowRes);
    }
    if (g.planet) {
      g.planet.lodScale = v.terrainDetail;
      if (DEV_TOOLS && g.planet.holeU.uSkinQ) {
        g.planet.holeU.uSkinQ.value = v.groundDetail;
        // regolith toggle: look 1 or classic 0. ?moonskin=N wins until the toggle is first changed (so opening Settings
        // doesn't undo it).
        const sk = g.planet.holeU.uSkin;
        if (this.regolithOn === undefined) { if (!SKIN_FROM_URL) sk.value = v.regolith ? 1 : 0; }
        else if (this.regolithOn !== v.regolith) sk.value = v.regolith ? 1 : 0;
        this.regolithOn = v.regolith;
      }
    }
    if (g.fx) g.fx.density = v.particles;
    for (const post of [g.post]) {
      if (!post) continue;
      const u = post.material.uniforms;
      if (u.halftone) u.halftone.value = v.halftone ? 1 : 0;
      if (u.lines) u.lines.value = v.speedLines ? 1 : 0;
      if (u.inkK) u.inkK.value = v.ink;
    }
    // every outline shell (toon.js inkMat and inkMatSolid, the boulders' ink) reads it; at 0 they aren't drawn at all
    INK_U.uInkK.value = v.ink;
    inkMat.visible = inkMatBaked.visible = inkMatSolid.visible = v.ink > 0;
    if (g.planet && g.planet.boulderInk) g.planet.boulderInk.visible = v.ink > 0;
    if (g.haptics) g.haptics.configure(v.rumble, v.rumbleLevel, v.padLight, v.padTriggers);
    if (g.audio && g.audio.setVolumes) g.audio.setVolumes(v.master, v.music, v.sfx, v.mute);
    if (g.input && g.input.setBindings) g.input.setBindings(v.binds);
    const mm = document.getElementById('minimap');
    if (mm) mm.style.display = v.minimap ? '' : 'none';
    for (const id of ['topleft', 'minimap', 'speedo']) {
      const el = document.getElementById(id);
      if (el) el.style.zoom = v.hudScale === 1 ? '' : String(v.hudScale);
    }
    const unit = document.querySelector('#speedo .unit');
    if (unit) unit.textContent = v.units === 'ms' ? 'M/S' : 'KM/H';
    if (g.hud) g.hud.lastSpeedTxt = '';
    this.updateHelp();
  }

  updateHelp() {
    const k = (c) => this.label(c);
    const pad = !!(this.game && this.game.input && this.game.input.padActive);
    for (const td of document.querySelectorAll('#help td:first-child')) {
      if (!td.dataset.orig) td.dataset.orig = td.textContent;
      if (HELP_PAD_HIDE.includes(td.dataset.orig)) td.parentElement.style.display = pad ? 'none' : '';
      const toks = pad && (HELP_PAD[td.dataset.orig] || tokensFor(td.dataset.orig));
      if (toks) { td.innerHTML = glyphHtml(toks); continue; }
      const f = HELP_ROWS[td.dataset.orig];
      td.textContent = f ? f(k) : td.dataset.orig;
    }
    for (const b of document.querySelectorAll('.controls-mini b')) {
      if (!b.dataset.orig) b.dataset.orig = b.textContent;
      const toks = pad && tokensFor(b.dataset.orig);
      if (toks) { b.innerHTML = glyphHtml(toks); continue; }
      const f = MINI_ROWS[b.dataset.orig];
      b.textContent = f ? f(k) : b.dataset.orig;
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
    // (the PlayStation link row tracks the pad connecting / leaving)
    const gy = g && g.pad && g.pad.gyro;
    if (gy) gy.onStatus = () => { if (this.open && this.tab === 'gameplay') this.render(); };
    if (g && g.audio && g.audio.click) g.audio.click();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.rebinding = null;
    const gy = this.game && this.game.pad && this.game.pad.gyro;
    if (gy) gy.onStatus = null;
    this.el.classList.add('hidden');
    this.save();
    const g = this.game;
    // back to the pause card, unless the game was resumed meanwhile
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
    if (PRESET_KEYS.includes(s.key)) {
      const was = this.v.preset;
      this.v.preset = this.matchPreset();
      if (was !== this.v.preset) for (const b of this.el.querySelectorAll('[data-key="preset"]')) b.classList.toggle('on', s && b.textContent === (PRESET_NAME[this.v.preset] || 'CUSTOM'));
    }
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
    else if (act === 'toggle') { const k = t.dataset.key; this.v[k] = !this.v[k]; if (PRESET_KEYS.includes(k)) this.v.preset = this.matchPreset(); this.commit(); this.render(); } else if (act === 'choice') {
      const s = this.find(t.dataset.key);
      const opt = s.options[+t.dataset.i];
      if (s.key === 'preset') { if (opt[0] !== 'custom') this.usePreset(opt[0]); }
      else {
        this.v[s.key] = opt[0];
        if (PRESET_KEYS.includes(s.key)) this.v.preset = this.matchPreset();
      }
      this.commit();
      this.render();
    } else if (act === 'bind') {
      this.rebinding = this.rebinding === t.dataset.code ? null : t.dataset.code;
      this.render();
    } else if (act === 'fx-test') {
      if (g && g.haptics) { g.haptics.test(); this.render(); }
    } else if (act === 'gyro-connect') {
      const gy = g && g.pad && g.pad.gyro;
      if (gy) gy.request().then(() => this.render());
    }
  }

  render() {
    const v = this.v;
    const tabs = TABS.map(([id, name]) => `<button class="set-tab ${id === this.tab ? 'on' : ''}" data-act="tab" data-tab="${id}">${name}</button>`).join('');
    let body = '';
    const pad = this.game && this.game.input && this.game.input.padActive;
    if (this.tab === 'controls' && pad) {
      body = `<div class="set-hint">Controller in use: these buttons are fixed. Touch the keyboard or mouse to see (and change) the key binds.</div>`;
      body += PAD_ROWS.map(([label, toks]) => `<div class="set-row bind fixed"><span class="set-label">${label}</span><span class="set-pad">${glyphHtml(toks, glyphState.kind)}</span></div>`).join('');
    } else if (this.tab === 'controls') {
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
      if (this.tab === 'gameplay') {
        // gyro read from the pad over WebHID: may need a one-time CONNECT
        const gy = this.game && this.game.pad && this.game.pad.gyro;
        const g_ = this.game && this.game.haptics;
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        if (g_) body += `<div class="set-row"><span class="set-label">Controller feedback<small>${esc(g_.status)}</small></span><span class="set-ctl"><button class="set-btn" data-act="fx-test">TEST</button></span></div>`;
        if (gy) body += `<div class="set-row"><span class="set-label">PlayStation controller link<small>${esc(gy.status)}</small></span><span class="set-ctl">${gyroSupported() ? '<button class="set-btn" data-act="gyro-connect">CONNECT</button>' : ''}</span></div>`;
      }
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
