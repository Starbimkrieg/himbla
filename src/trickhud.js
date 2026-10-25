// Trick meter: what the trick in the air would score if you landed it now (player.trickLive, from trickScore in
// player.js), then how it ended (player.trickDone). Two drafts, picked with ?trickhud=a|b (A by default) or
// game.hud.trick.setDraft('b') from the console:
//   A  style meter (bottom right): a rank letter that climbs with the score, the moves, the combo, the total and a
//      CLEAN / CROOKED light, after Ultrakill's.
//   B  ticker (beside the runner): the score, the trick string and a landing gauge, as outlined text with no panel.
// DOM writes only when a value changes; the gauge marker moves every frame while a trick is going.

const RANKS = [
  // min points, letters, the rest of the word, colour
  [0, 'D', 'USTY', '#8f84c4'],
  [50, 'C', 'OSMIC', '#2ee6ff'],
  [100, 'B', 'LASTOFF', '#7dff6a'],
  [175, 'A', 'POLLO', '#ffd23f'],
  [275, 'S', 'TELLAR', '#ff7b4f'],
  [400, 'SS', 'TARBURST', '#ff2e88'],
  [600, 'SSS', 'UPERMOON', '#ff2a4a'],
];
const MOVE_COLORS = ['#2ee6ff', '#ff4f6a', '#7dff6a', '#ffb43f'];
const RESULT_TIME = 1.6; // s the landing (or wipeout) stays up before the meter fades

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

export class TrickHud {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    const q = new URLSearchParams(location.search).get('trickhud');
    this.resultT = 0;
    this.lastDone = null;
    this.build();
    this.setDraft(q === 'b' ? 'b' : 'a');
  }

  build() {
    // A: style meter
    const a = this.a = el('div', 'hidden', this.root);
    a.id = 'trickmeter';
    const head = el('div', 'tm-rank', a);
    this.aLetter = el('b', 'tm-letter', head);
    this.aWord = el('span', 'tm-word', head);
    this.aBar = el('i', '', el('div', 'tm-bar', a));
    this.aMoves = el('div', 'tm-moves', a);
    this.aCombo = el('div', 'tm-combo', a);
    const foot = el('div', 'tm-foot', a);
    this.aLand = el('span', 'tm-land', foot);
    this.aTotal = el('b', 'tm-total', foot);
    // B: ticker
    const b = this.b = el('div', 'hidden', this.root);
    b.id = 'trickticker';
    this.bPts = el('b', 'tt-pts', b);
    this.bName = el('div', 'tt-name', b);
    const gauge = el('div', 'tt-gauge', b);
    el('i', 'tt-zone', gauge);
    this.bMark = el('i', 'tt-mark', gauge);
    this.last = {};
  }

  setDraft(d) {
    this.draft = d;
    this.a.classList.add('hidden');
    this.b.classList.add('hidden');
    this.last = {};
  }

  // set text / a class only when it changed (keyed per element)
  put(key, e, text) { if (this.last[key] !== text) { e.textContent = text; this.last[key] = text; return true; } return false; }

  update(dt) {
    const P = this.game.player;
    const box = this.draft === 'b' ? this.b : this.a;
    const live = P.trickLive;
    const done = P.trickDone;
    if (done && done !== this.lastDone) {
      this.lastDone = done;
      this.resultT = RESULT_TIME;
      this.showResult(done);
    }
    if (live) {
      this.resultT = 0;
      box.classList.remove('hidden', 'tk-out', 'tk-stuck', 'tk-wiped');
      if (this.draft === 'b') this.liveB(live); else this.liveA(live);
    } else if (this.resultT > 0) {
      this.resultT -= dt;
      if (this.resultT <= 0.35) box.classList.add('tk-out'); // fades over its last 0.35 s
      if (this.resultT <= 0) box.classList.add('hidden');
    } else if (!box.classList.contains('hidden')) box.classList.add('hidden');
  }

  liveA(s) {
    const r = rankOf(s.pts), R = RANKS[r], next = RANKS[r + 1];
    if (this.put('aL', this.aLetter, R[1])) { this.aLetter.style.color = R[3]; kick(this.aLetter, 'tk-bump'); }
    this.put('aW', this.aWord, R[2]);
    const f = next ? (s.pts - R[0]) / (next[0] - R[0]) : 1;
    this.aBar.style.width = Math.round(Math.min(1, f) * 100) + '%';
    this.aBar.style.background = R[3];
    const moves = [];
    if (s.flips) moves.push([s.parts[0], s.flipPts]);
    if (s.spins) moves.push([s.parts[s.flips ? 1 : 0], s.spinPts]);
    if (s.pts) moves.push([`AIR ${(s.airPts / 5).toFixed(1)}s`, s.airPts]);
    const key = moves.map((m) => m.join(':')).join('|');
    if (this.last.aM !== key) {
      const fresh = moves.length > (this.last.aMn || 0);
      this.aMoves.textContent = '';
      moves.forEach(([name, pts], i) => {
        const row = el('div', 'tm-move', this.aMoves);
        el('span', '', row, '+ ' + name).style.color = MOVE_COLORS[i % MOVE_COLORS.length];
        el('span', 'tm-pts', row, pts);
        if (fresh && i === moves.length - 1) row.classList.add('tk-in');
      });
      this.last.aM = key; this.last.aMn = moves.length;
    }
    this.put('aC', this.aCombo, s.combo > 1 ? `COMBO ×${s.combo.toFixed(1)}` : '');
    if (this.put('aT', this.aTotal, s.pts ? '+' + s.pts : '')) kick(this.aTotal, 'tk-bump');
    this.landLight(this.aLand, s);
  }

  liveB(s) {
    if (this.put('bP', this.bPts, '+' + s.pts)) { kick(this.bPts, 'tk-bump'); this.bPts.classList.toggle('tt-zero', !s.pts); }
    this.put('bN', this.bName, s.name ? s.name + (s.combo > 1 ? `  ×${s.combo.toFixed(1)}` : '') : 'TRICK…');
    // marker: the left end is dead upright, the green zone's end (tilt 1 of 1.6) the wipeout line
    this.bMark.style.left = Math.min(1, s.tilt / 1.6) * 100 + '%';
    const cls = s.clean ? 'ok' : 'bad';
    if (this.last.bG !== cls) { this.bMark.className = 'tt-mark ' + cls; this.last.bG = cls; }
  }

  landLight(e, s) {
    const cls = s.clean ? 'ok' : 'bad';
    if (this.last.land !== cls) {
      e.className = 'tm-land ' + cls;
      e.textContent = s.clean ? '▲ CLEAN' : '▼ CROOKED';
      this.last.land = cls;
    }
  }

  showResult(d) {
    const box = this.draft === 'b' ? this.b : this.a;
    box.classList.remove('hidden', 'tk-out');
    box.classList.toggle('tk-stuck', !d.wiped);
    box.classList.toggle('tk-wiped', d.wiped);
    if (this.draft === 'b') {
      this.put('bP', this.bPts, d.wiped ? 'WIPEOUT' : 'STUCK +' + d.pts);
      kick(this.bPts, 'tk-bump');
    } else {
      this.aLand.className = 'tm-land ' + (d.wiped ? 'bad' : 'ok');
      this.aLand.textContent = d.wiped ? 'WIPEOUT' : 'STUCK IT!';
      this.last.land = null;
      this.put('aT', this.aTotal, '+' + d.pts);
      kick(this.aTotal, 'tk-bump');
    }
  }
}
