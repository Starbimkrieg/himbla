// Style meter (bottom right, mirroring the speedometer; after Ultrakill's): the style run (combo.js) as it builds. A rank
// letter that climbs with the total and a bar to the next rank, the moves (the newest six, live ones included), the
// multiplier, the total, a CLEAN / CROOKED light while a trick is in the air, and a bar draining through the landing
// window. When the run ends it shows BANKED or WIPEOUT for RESULT_TIME s, then fades.
// DOM writes only when a value changes.
import { COMBO_WINDOW } from './combo.js';

const RANKS = [
  // min points (a lone backflip is about 60; a five-kind run with the winch about 1000), letters, the rest of the word, colour
  [0, 'D', 'USTY', '#8f84c4'],
  [150, 'C', 'OSMIC', '#2ee6ff'],
  [350, 'B', 'LASTOFF', '#7dff6a'],
  [700, 'A', 'POLLO', '#ffd23f'],
  [1200, 'S', 'TELLAR', '#ff7b4f'],
  [2000, 'SS', 'TARBURST', '#ff2e88'],
  [3200, 'SSS', 'UPERMOON', '#ff2a4a'],
];
const MOVE_COLORS = ['#2ee6ff', '#ff4f6a', '#7dff6a', '#ffb43f'];
const RESULT_TIME = 3.2; // s the end of a run stays up (its last 0.35 s fading)

const rankOf = (pts) => {
  let i = 0;
  while (i + 1 < RANKS.length && pts >= RANKS[i + 1][0]) i++;
  return i;
};

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// restart a one-shot CSS animation
function kick(e, cls) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

export class StyleMeter {
  constructor(game, root) {
    this.game = game;
    this.resultT = 0;
    this.lastResult = null;
    this.last = {};
    const a = this.box = el('div', 'hidden', root);
    a.id = 'stylemeter';
    const head = el('div', 'sm-rank', a);
    this.letter = el('b', 'sm-letter', head);
    this.word = el('span', 'sm-word', head);
    this.bar = el('i', '', el('div', 'sm-bar', a));
    this.movesEl = el('div', 'sm-moves', a);
    this.multEl = el('div', 'sm-mult', a);
    const foot = el('div', 'sm-foot', a);
    this.land = el('span', 'sm-land', foot);
    this.totalEl = el('b', 'sm-total', foot);
    this.win = el('i', '', el('div', 'sm-window', a));
  }

  // set text only when it changed (keyed per element); true if it did
  put(key, e, text) { if (this.last[key] !== text) { e.textContent = text; this.last[key] = text; return true; } return false; }

  update(dt) {
    const P = this.game.player;
    const C = P.combo;
    const box = this.box;
    if (C.result && C.result !== this.lastResult) {
      this.lastResult = C.result;
      this.resultT = RESULT_TIME;
      this.showResult(C.result);
    }
    if (C.open) {
      if (this.resultT > 0) { this.resultT = 0; this.last = {}; }
      box.classList.remove('hidden', 'sm-out', 'sm-banked', 'sm-wiped');
      this.showRun(C.view(), P.trickLive, C.window / COMBO_WINDOW);
    } else if (this.resultT > 0) {
      this.resultT -= dt;
      if (this.resultT <= 0.35) box.classList.add('sm-out');
      if (this.resultT <= 0) box.classList.add('hidden');
    } else if (!box.classList.contains('hidden')) box.classList.add('hidden');
  }

  showRank(total) {
    const r = rankOf(total), R = RANKS[r], next = RANKS[r + 1];
    if (this.put('L', this.letter, R[1])) { this.letter.style.color = R[3]; kick(this.letter, 'sm-bump'); }
    this.put('W', this.word, R[2]);
    const f = next ? (total - R[0]) / (next[0] - R[0]) : 1;
    this.bar.style.width = Math.round(Math.min(1, f) * 100) + '%';
    this.bar.style.background = R[3];
  }

  showMoves(moves, more) {
    const key = more + '|' + moves.map((m) => `${m.label}:${m.n}:${m.pts}`).join('|');
    if (this.last.M === key) return;
    const fresh = moves.length && (!this.last.top || this.last.top !== moves[moves.length - 1].label);
    this.movesEl.textContent = '';
    if (more) el('div', 'sm-move sm-more', this.movesEl, `+ ${more} MORE`);
    moves.forEach((m, i) => {
      const row = el('div', 'sm-move', this.movesEl);
      el('span', '', row, `+ ${m.label}${m.n > 1 ? ` ×${m.n}` : ''}`).style.color = MOVE_COLORS[(i + more) % MOVE_COLORS.length];
      el('span', 'sm-pts', row, m.pts);
      if (fresh && i === moves.length - 1) row.classList.add('sm-in');
    });
    this.last.M = key;
    this.last.top = moves.length ? moves[moves.length - 1].label : null;
  }

  showRun(v, trick, win) {
    this.showRank(v.total);
    this.showMoves(v.moves, v.more);
    this.put('X', this.multEl, v.mult > 1 ? `MULTIPLIER ×${v.mult.toFixed(1)}` : '');
    if (this.put('T', this.totalEl, v.total ? '+' + v.total : '')) kick(this.totalEl, 'sm-bump');
    // the light while a trick is in the air, else nothing; the window bar drains on the ground
    const land = trick ? (trick.clean ? 'ok' : 'bad') : '';
    if (this.last.land !== land) {
      this.land.className = 'sm-land ' + land;
      this.land.textContent = trick ? (trick.clean ? '▲ CLEAN' : '▼ CROOKED') : '';
      this.last.land = land;
    }
    this.win.style.width = Math.round(Math.max(0, Math.min(1, win)) * 100) + '%';
  }

  showResult(r) {
    const box = this.box;
    box.classList.remove('hidden', 'sm-out');
    box.classList.toggle('sm-banked', !r.wiped);
    box.classList.toggle('sm-wiped', r.wiped);
    this.showRank(r.total);
    this.showMoves(r.moves, 0);
    this.put('X', this.multEl, r.mult > 1 ? `MULTIPLIER ×${r.mult.toFixed(1)}` : '');
    this.put('T', this.totalEl, '+' + r.total);
    kick(this.totalEl, 'sm-bump');
    this.land.className = 'sm-land ' + (r.wiped ? 'bad' : 'ok');
    this.land.textContent = r.wiped ? 'WIPEOUT' : 'BANKED!';
    this.last.land = null;
    this.win.style.width = '0%';
  }
}
