import { padKind, activePad } from './gamepad.js';
import xboxImg from './assets/pads/xbox.webp?inline';
import psImg from './assets/pads/ps.webp?inline';

// Dev overlay (dev menu → INPUT & CONTROLLER MONITOR): the pad's photo with live state lit on top, beside what
// the game thinks is held and the trick state. For stuck inputs: game Q down with neither keyboard Q nor pad
// Circle / B held turns the readout red.
//
// Read straight from navigator.getGamepads() (standard mapping), so it shows even when the game ignores the pad.
// Buttons: 0-3 face (bottom, right, left, top), 4/5 bumpers, 6/7 triggers, 8 View / Create, 9 Start / Options,
// 10/11 stick clicks, 12-15 d-pad, 16 Home, 17 Share / PlayStation touchpad.

// each button's action in play (gamepad.js)
const ACTION = {
  0: 'jump / dive', 1: 'trick (Q)', 2: 'interact', 3: 'vehicle', 4: 'skates', 5: 'power', 6: 'thrust / scope', 7: 'fire',
  8: 'map / recall', 9: 'pause', 10: 'thrust', 11: 'scoop', 12: 'next power', 13: 'radial menu', 14: 'prev weapon', 15: 'next weapon',
};
// button names per pad family
const NAMES = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '↑', '↓', '←', '→', 'Guide', 'Share'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'Touchpad'],
  switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→', 'Home', 'Capture'],
};
const KEYS = [['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['ShiftLeft', 'Shift'], ['Space', 'Space']];
const NS = 'http://www.w3.org/2000/svg';
const DEAD = 0.18;
const TAU = Math.PI * 2;
const f2 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" -> "Wireless Controller · 054c:0ce6"
const padName = (id = '') => {
  const m = id.match(/Vendor: (\w+) Product: (\w+)/i);
  return id.replace(/\s*\(.*$/, '').slice(0, 30) + (m ? ` · ${m[1]}:${m[2]}` : '');
};

// ---- the two photos ----
// Positions in the original picture's pixels (assets/pads files are crops, drawn back at `box`).
// Shapes: ['c', cx, cy, r] circle · ['r', x, y, w, h, rx] rounded rect · ['p', [[x, y], ...]] polygon.
// `face`: coloured buttons (bottom, right, left, top); `sticks`: [button index, cx, cy, radius, travel, x axis, y axis].
const mirror = (pts, axis) => pts.map(([x, y]) => [axis - x, y]);
const XBOX_L1 = [[320, 418], [382, 360], [482, 332], [577, 335], [582, 352], [492, 362], [414, 392], [347, 440]];
const PADS = {
  xbox: {
    img: xboxImg, box: [82, 290, 1520, 1313], head: 130,
    face: [[0, 1154, 675, 46, '#62d84e'], [1, 1248, 583, 46, '#ff4d4d'], [2, 1060, 583, 46, '#4da3ff'], [3, 1154, 494, 46, '#ffd23f']],
    hit: {
      4: ['p', XBOX_L1], 5: ['p', mirror(XBOX_L1, 1602)],
      8: ['c', 700, 579, 34], 9: ['c', 900, 580, 34], 16: ['c', 801, 437, 54], 17: ['r', 760, 635, 80, 52, 24],
      12: ['r', 589, 700, 60, 78, 10], 13: ['r', 589, 832, 60, 78, 10], 14: ['r', 514, 775, 78, 60, 10], 15: ['r', 648, 775, 78, 60, 10],
    },
    sticks: [[10, 453, 577, 100, 42, 0, 1], [11, 975, 795, 100, 42, 2, 3]],
    trig: { 6: [300, 300], 7: [1002, 300] }, // meter x and width above the shoulders
  },
  ps: {
    img: psImg, box: [363, 193, 1638, 1060], head: 130,
    face: [[0, 1375, 548, 48, '#6aa8ff'], [1, 1463, 458, 48, '#ff5470'], [2, 1288, 458, 48, '#ff8ad8'], [3, 1375, 368, 48, '#4ff0a0']],
    hit: {
      4: ['p', [[531, 291], [663, 275], [751, 269], [751, 295], [535, 318]]], 5: ['p', [[1253, 269], [1338, 275], [1468, 293], [1463, 318], [1253, 295]]],
      6: ['r', 541, 225, 167, 62, 14], 7: ['r', 1292, 225, 168, 62, 14],
      8: ['r', 700, 295, 36, 58, 18], 9: ['r', 1262, 295, 36, 58, 18], 16: ['c', 1000, 610, 34], 17: ['r', 775, 250, 460, 250, 40],
      12: ['r', 591, 361, 68, 72, 10], 13: ['r', 591, 491, 68, 68, 10], 14: ['r', 526, 426, 80, 67, 10], 15: ['r', 646, 426, 77, 67, 10],
    },
    sticks: [[10, 809, 624, 95, 36, 0, 1], [11, 1191, 624, 95, 36, 2, 3]],
    trig: { 6: [530, 190], 7: [1280, 190] },
  },
};
PADS.switch = PADS.xbox; // drawn as the Xbox photo; letters differ

export class InputMonitor {
  constructor(game) {
    this.game = game;
    this.rawKeys = new Set(); // physical keys, translated to default codes like Input does
    this.on = false;
    this.kind = null;
    const I = game.input;
    window.addEventListener('keydown', (e) => this.rawKeys.add(I.translate(e.code)), true);
    window.addEventListener('keyup', (e) => this.rawKeys.delete(I.translate(e.code)), true);
    window.addEventListener('blur', () => this.rawKeys.clear());
    const el = this.el = document.createElement('div');
    el.id = 'input-mon';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="im-top"><b class="im-badge"></b><span class="im-name"></span></div>
      <div class="im-sub"></div>
      <div class="im-map"></div>
      <div class="im-sec">INPUT</div><dl class="im-in"></dl>
      <div class="im-sec">GAME</div><dl class="im-game"></dl>
      <div class="im-sec">TRICK</div><dl class="im-trick"></dl>
      <div class="im-alert hidden"></div>`;
    const q = (s) => el.querySelector(s);
    this.badge = q('.im-badge'); this.nameEl = q('.im-name'); this.sub = q('.im-sub');
    this.mapEl = q('.im-map'); this.inEl = q('.im-in'); this.gameEl = q('.im-game'); this.trickEl = q('.im-trick'); this.alertEl = q('.im-alert');
    document.body.appendChild(el);
  }

  setOn(on) {
    this.on = on;
    this.el.classList.toggle('hidden', !on);
    if (!on) this.kind = null;
  }

  mk(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // a highlight shape from a PADS entry
  shape(s, cls, parent) {
    if (s[0] === 'c') return this.mk('circle', { cx: s[1], cy: s[2], r: s[3], class: cls }, parent);
    if (s[0] === 'r') return this.mk('rect', { x: s[1], y: s[2], width: s[3], height: s[4], rx: s[5], class: cls }, parent);
    return this.mk('polygon', { points: s[1].map((p) => p.join(',')).join(' '), class: cls }, parent);
  }

  // the photo with a highlight per control
  build(kind) {
    this.kind = kind;
    const P = PADS[kind], [x0, y0, x1, y1] = P.box, w = x1 - x0, h = y1 - y0;
    const svg = this.mk('svg', { viewBox: `${x0} ${y0 - P.head} ${w} ${h + P.head}`, class: `im-svg im-${kind}` });
    this.mk('image', { href: P.img, x: x0, y: y0, width: w, height: h }, svg);
    this.btn = {};
    this.trig = {};
    for (const [i, s] of Object.entries(P.hit)) this.btn[i] = this.shape(s, 'im-hit', svg);
    for (const [i, cx, cy, r, col] of P.face) this.btn[i] = this.mk('circle', { cx, cy, r, class: 'im-hit im-hit-face', style: `--c:${col}` }, svg);
    // trigger meters in the margin above the pad
    const fs = Math.round(w / 31), mh = Math.round(w / 26), my = y0 - P.head + Math.round(P.head * 0.3);
    for (const i of [6, 7]) {
      const [mx, mw] = P.trig[i];
      this.mk('rect', { x: mx, y: my, width: mw, height: mh, rx: mh / 2, class: 'im-meter' }, svg);
      const fill = this.mk('rect', { x: mx, y: my, width: 0, height: mh, rx: mh / 2, class: 'im-meter-fill' }, svg);
      const t = this.mk('text', { x: mx + mw / 2, y: my + mh / 2, 'font-size': fs, class: 'im-meter-t' }, svg);
      this.trig[i] = { fill, t, x: mx, w: mw, label: NAMES[kind][i] };
    }
    // sticks: click ring and a dot following the axes
    this.sticks = P.sticks.map(([i, cx, cy, r, travel, ax, ay]) => {
      this.btn[i] = this.mk('circle', { cx, cy, r, class: 'im-hit im-hit-ring' }, svg);
      const dot = this.mk('circle', { cx, cy, r: Math.round(r * 0.3), class: 'im-dot' }, svg);
      return { dot, cx, cy, travel, ax, ay };
    });
    this.mapEl.replaceChildren(svg);
  }

  // ---- per frame ----
  update() {
    if (!this.on) return;
    const g = this.game, I = g.input, P = g.player, b = P && P.body;
    const gp = activePad();
    const kind = gp ? padKind(gp.id) : null;
    if (kind !== this.kind) { if (kind) this.build(kind); else { this.kind = null; this.mapEl.replaceChildren(); } }
    const N = NAMES[kind] || NAMES.xbox;
    const lab = (i) => N[i] || '#' + i;

    // header
    this.badge.textContent = kind ? { ps: 'PS', xbox: 'XBOX', switch: 'SWITCH' }[kind] : '—';
    this.badge.className = 'im-badge' + (kind ? '' : ' off');
    this.nameEl.textContent = gp ? padName(gp.id) : 'no controller';
    this.sub.innerHTML = (gp
      ? (gp.mapping === 'standard' ? 'standard mapping' : '<span class="bad">non-standard mapping: the buttons below may be wrong</span>')
      : 'press a button on the pad (browsers hide pads until one is used)')
      + (kind === 'switch' ? ' · drawn as an Xbox pad, the letters differ' : '')
      + ` · <span class="${I.padActive ? 'src-on' : ''}">${I.padActive ? 'pad in control' : 'keyboard / mouse in control'}</span>`;
    this.mapEl.classList.toggle('empty', !gp);

    // the pad
    const pressed = [];
    if (gp) {
      gp.buttons.forEach((bt, i) => {
        const v = bt.value || (bt.pressed ? 1 : 0), on = !!bt.pressed || v > 0.5;
        if (this.btn[i]) {
          if (i === 6 || i === 7) this.btn[i].style.fill = `rgba(125,255,58,${(v * 0.7).toFixed(2)})`; // L2 / R2 caps fill with the pull
          else this.btn[i].classList.toggle('on', on);
        }
        const t = this.trig[i];
        if (t) { t.fill.setAttribute('width', (t.w * Math.min(1, v)).toFixed(1)); t.t.textContent = `${t.label}  ${v.toFixed(2)}`; }
        if (on) pressed.push(i);
      });
      for (const s of this.sticks) {
        const ax = gp.axes[s.ax] || 0, ay = gp.axes[s.ay] || 0, m = Math.hypot(ax, ay), k = m > 1 ? 1 / m : 1;
        s.dot.setAttribute('cx', (s.cx + ax * k * s.travel).toFixed(1));
        s.dot.setAttribute('cy', (s.cy + ay * k * s.travel).toFixed(1));
        s.dot.classList.toggle('live', m > DEAD);
      }
    }

    // INPUT: what the pad is doing
    const lx = gp ? gp.axes[0] || 0 : 0, ly = gp ? gp.axes[1] || 0 : 0, rx = gp ? gp.axes[2] || 0 : 0, ry = gp ? gp.axes[3] || 0 : 0;
    const chips = pressed.filter((i) => i !== 6 && i !== 7).map((i) => `<i class="on">${esc(lab(i))}${ACTION[i] ? ` <small>${ACTION[i]}</small>` : ''}</i>`);
    for (const i of [6, 7]) { const v = gp && gp.buttons[i] ? gp.buttons[i].value : 0; if (v > 0.05) chips.push(`<i class="on">${esc(lab(i))} <small>${v.toFixed(2)}</small></i>`); }
    const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    this.inEl.innerHTML = gp
      ? row('buttons', chips.join('') || '<span class="dim">none</span>') + row('left stick', `${f2(lx)}  ${f2(ly)}`) + row('right stick', `${f2(rx)}  ${f2(ry)}`)
      : row('buttons', '<span class="dim">-</span>');

    // GAME: what the game thinks
    const chip = (code, txt) => `<i class="${I.down(code) ? 'on' : ''}">${txt}</i>`;
    const hold = g.pad && g.pad.holding ? [...g.pad.holding].map((c) => c.replace('Key', '')) : [];
    this.gameEl.innerHTML = row('keys down', KEYS.map(([c, t]) => chip(c, t)).join(''))
      + row('from the pad', hold.length ? hold.join(' ') : '<span class="dim">none</span>')
      + row('move input', I.padMove.on ? `${f2(I.padMove.x)}  ${f2(I.padMove.y)}` : '<span class="dim">idle</span>');

    // TRICK
    if (P && b) {
      const t = P.trick, held = I.down('KeyQ') && !b.grounded && b.airTime > 0.12 && !P.rag;
      this.trickEl.innerHTML = row('button', held ? '<b class="hot">HELD</b>' : '<span class="dim">not held</span>')
        + row('state', `${t.active ? 'active' : 'idle'} · ${t.tucked ? 'tucked' : 'upright'}${P.rag ? ' · <span class="bad">ragdoll</span>' : ''}`)
        + row('flip · spin', `${(t.flip / TAU).toFixed(2)} · ${(t.spin / TAU).toFixed(2)} turns`)
        + row('air', `${b.grounded ? 'grounded' : 'airborne'} · ${b.airTime.toFixed(2)} s`);
    }
    const gy = g.pad && g.pad.gyro;
    if (gy && (gy.dev || kind === 'ps')) this.trickEl.insertAdjacentHTML('beforeend', row('gyro', `${gy.live() ? '<b class="hot">live</b>' : '<span class="dim">off</span>'}${g.pad.gyroOn ? ' · steering' : ''} <small>${esc(gy.status)}</small>`));

    // stuck trick button: game has Q down, nothing physical does
    const gameQ = I.down('KeyQ'), physQ = this.rawKeys.has('KeyQ'), padB = pressed.includes(1);
    const stuck = gameQ && !physQ && !padB;
    this.alertEl.classList.toggle('hidden', !stuck);
    if (stuck) this.alertEl.textContent = `STUCK: the game has Q (trick) down, but neither the keyboard Q nor the pad's ${kind === 'ps' ? '○' : 'B'} is.`;
  }
}
