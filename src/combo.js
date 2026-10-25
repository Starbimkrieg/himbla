// Style combo: every style move (flips and spins, air, dive landings, grinds, meteor bounces, arches, fast winching)
// feeds one run, shown live by the style meter (stylemeter.js). The run stays open while you're in the air, grinding
// or hitched; back on the ground it banks after COMBO_WINDOW s unless another move keeps it going. Banked, it pays
// (sum of the moves) x (multiplier) into the style pool; a wipeout loses it.
// The multiplier is +0.5 per kind of move in the run beyond the first (air time doesn't count as a kind).
// Moves come in two ways: add() commits one (merged with an earlier one of the same label: METEOR BOUNCE x3), live()
// shows one still building this frame (a trick in the air, a grind, the winch), rebuilt every frame by its source.

export const COMBO_WINDOW = 2.5;
const MAX_MOVES = 6; // lines on the meter (the newest)

export class Combo {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.moves = []; // committed: { label, pts, kind, n }
    this.liveNext = []; // filled by the sources during the frame
    this.live = [];
    this.window = COMBO_WINDOW;
    this.result = null; // the last run's end, for the meter: { total, mult, moves, wiped } (a new object per end)
  }

  add(label, pts, kind) {
    if (pts <= 0) return;
    const m = this.moves.find((x) => x.label === label);
    if (m) { m.pts += pts; m.n++; this.moves.splice(this.moves.indexOf(m), 1); this.moves.push(m); } // (to the bottom: newest)
    else this.moves.push({ label, pts, kind, n: 1 });
    this.window = COMBO_WINDOW;
  }

  addLive(label, pts, kind) { if (pts > 0) this.liveNext.push({ label, pts, kind, n: 1 }); }

  get open() { return this.moves.length > 0 || this.live.length > 0; }

  // the run so far, the moves still building included
  view() {
    const all = this.moves.concat(this.live);
    const kinds = new Set();
    let sum = 0;
    for (const m of all) { sum += m.pts; if (m.kind !== 'air') kinds.add(m.kind); }
    const mult = 1 + 0.5 * Math.max(0, kinds.size - 1);
    return { moves: all.slice(-MAX_MOVES), more: Math.max(0, all.length - MAX_MOVES), mult, sum, total: Math.round(sum * mult) };
  }

  bank() {
    if (!this.moves.length) return;
    const v = this.view();
    const g = this.game;
    g.style(v.total, null);
    g.stats.bestTrick = Math.max(g.stats.bestTrick || 0, v.total);
    this.result = { total: v.total, mult: v.mult, moves: v.moves, wiped: false };
    this.moves = [];
  }

  wipe() {
    if (!this.open) return;
    const v = this.view();
    this.result = { total: v.total, mult: v.mult, moves: v.moves, wiped: true };
    this.moves = [];
    this.live = [];
    this.liveNext = [];
  }

  // after the player's step: swap in this frame's live moves, run the landing window
  update(dt) {
    const P = this.player, g = this.game;
    this.live = this.liveNext;
    this.liveNext = [];
    if (P.dead) { this.wipe(); return; }
    if (P.vehicle || P.seat) { this.live = []; this.bank(); return; }
    const busy = this.live.length > 0 || !P.body.grounded || (g.grind && g.grind.active) || (g.winch && g.winch.on);
    if (busy) this.window = COMBO_WINDOW;
    else if (this.moves.length && (this.window -= dt) <= 0) this.bank();
  }
}
