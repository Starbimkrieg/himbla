// Style combo: every style move (flips and spins, air, dive landings, grinds, meteor bounces, fast winching) feeds one
// run, shown live by the style meter (stylemeter.js). It stays open in the air, on a rail and hitched; back on the ground
// it banks after COMBO_WINDOW s unless another move keeps it going: a rail, the winch, or taking off again. The window is
// short, and taking off from the ground with the run open (a jump link) only saves it if the jump turns into a BIG AIR
// (BIG_AIR s up) or meets a rail or a meteor: till then the window runs on in the air and waits at 0, and an ordinary
// jump's landing banks the run (its trick counts; add(..., landing) doesn't fill the window off a jump link). So landing
// and jumping again doesn't chain simple tricks into a huge run: a big jump is what makes one. Banked, it pays
// (sum of the moves) x (multiplier) into the style pool; a wipeout loses it.
// The multiplier is +0.5 per kind of move in the run beyond the first (air time doesn't count as a kind).
// Moves come in two ways: add() commits one (merged with an earlier one of the same label: METEOR BOUNCE x3), live()
// shows one still building this frame (a trick in the air, a grind, the winch), rebuilt every frame by its source.

export const COMBO_WINDOW = 0.7; // s after a landing before the run banks
export const BIG_AIR = 5; // s in the air that makes a jump a BIG AIR (a standing jump is 4.6 s, a skating one about 3), which keeps the run open
const MAX_MOVES = 6; // lines on the meter (the newest)

export class Combo {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.moves = []; // committed: { label, pts, kind, n }
    this.liveNext = []; // filled by the sources during the frame
    this.live = [];
    this.window = COMBO_WINDOW;
    this.link = false; // in the air off the ground with the run open (a jump link): the window isn't held
    this.onFoot = true; // last frame on the ground (not on a rail)
    this.result = null; // the last run's end, for the meter: { total, mult, moves, wiped } (a new object per end)
  }

  // landing: a move scored as you land (a trick, the air, a dive landing), which off a jump link doesn't fill the window;
  // any other move does, and makes the jump a link that holds (a meteor bounce)
  add(label, pts, kind, landing = false) {
    if (pts <= 0) return;
    if (!this.moves.length || !(landing && this.link)) { this.window = COMBO_WINDOW; if (!landing) this.link = false; }
    const m = this.moves.find((x) => x.label === label);
    if (m) { m.pts += pts; m.n++; this.moves.splice(this.moves.indexOf(m), 1); this.moves.push(m); } // (to the bottom: newest)
    else this.moves.push({ label, pts, kind, n: 1 });
  }

  addLive(label, pts, kind) { if (pts > 0) this.liveNext.push({ label, pts, kind, n: 1 }); }

  get open() { return this.moves.length > 0 || this.live.length > 0; }

  // the run so far, the moves still building included
  view() {
    const all = this.moves.concat(this.live);
    const kinds = new Set();
    const seen = {};
    let sum = 0;
    for (const m of all) {
      sum += m.pts;
      if (m.kind !== 'air') kinds.add(m.kind);
      m.id = m.kind + (seen[m.kind] = (seen[m.kind] || 0) + 1); // which move it is (air2: the run's second air), for the meter: a live label changes as it counts
    }
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
    const b = P.body, rail = (g.grind && g.grind.active) || (g.winch && g.winch.on), ground = b.grounded && !rail;
    if (!b.grounded && this.onFoot && this.moves.length) this.link = true;
    this.onFoot = ground;
    if (rail || (!b.grounded && (!this.link || b.airTime >= BIG_AIR))) { this.window = COMBO_WINDOW; this.link = false; }
    else if (this.moves.length) {
      this.window = Math.max(0, this.window - dt);  // (on a jump link too: it waits at 0 for the landing, or a BIG AIR)
      if (ground && this.window <= 0) this.bank();
    }
    if (ground) this.link = false;
  }
}
