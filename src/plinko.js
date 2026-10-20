// Plinko physics: 2D rigid balls in the board plane (x right, y up, metres). No Three.js, so it calibrates headless in node.
//
// Layout: a peg triangle (row r has r + 3 pegs), slanted guard rails just outside the outer pegs, and ROWS + 1 slots
// between the bottom-row pegs, split by short dividers.

const ROWS = 12;
export const SPACING = 0.9; // peg pitch along a row
const ROW_H = 0.78; // vertical distance between rows
const PEG_R = 0.13;
export const BALL_R = 0.22;
const GRAVITY = 20;
const TOP_Y = ROWS * ROW_H + 0.4; // top peg row y (slot floor at y = 0)
export const DROP_Y = TOP_Y + 1.1;
const DROP_RANGE = SPACING * 0.85; // chute half-width (physics)
export const AIM_RANGE = DROP_RANGE * 0.75; // player's off-centre aim limit
export const SLOTS = ROWS + 1;
const REST = 0.42; // restitution off pegs
const WALL_REST = 0.35;
const FRICTION = 0.08; // fraction of tangential speed lost per hit
const JITTER = 0.32; // random tangential kick (m/s) per peg hit, for unpredictability
const BALL_REST = 0.6;
const REAL_HIT = 0.8; // m/s into a peg: above is a hit, below is resting / rolling
const FLOOR_Y = 0;
export const DIVIDER_TOP = 1.1;

// Measured headless (20k drops per aim point): RTP ~97% at centre and half-way out, ~94% over random aim (the 50x slots
// take ~0.35-0.4% of drops, so a few thousand drops swing it by points; hit about once in 250). Median fall ~6.7 s (p95 7.5 s).
export const MULTS = [50, 8, 3, 1.2, 0.6, 0.3, 0.2, 0.3, 0.6, 1.2, 3, 8, 50];

const rowY = (r) => TOP_Y - r * ROW_H;
const pegX = (r, i) => (i - (r + 2) / 2) * SPACING;

export const PEGS = [];
for (let r = 0; r < ROWS; r++) for (let i = 0; i < r + 3; i++) PEGS.push({ x: pegX(r, i), y: rowY(r), row: r, flash: 0 });

const lastRowY = rowY(ROWS - 1);
// slot boundaries: the bottom-row pegs
const slotEdge = (k) => pegX(ROWS - 1, k);
export const slotCentre = (k) => (slotEdge(k) + slotEdge(k + 1)) / 2;
const slotOf = (x) => Math.max(0, Math.min(SLOTS - 1, Math.floor((x - slotEdge(0)) / SPACING)));

// segments: guard rails (chute down to the outer slot walls), slot dividers, chute
export const SEGS = [];
{
  const botL = slotEdge(0), botR = slotEdge(SLOTS);
  // rails tangent to the outer pegs so a ball can't wedge between rail and peg
  const ox = pegX(ROWS - 1, 0) - pegX(0, 0), oy = lastRowY - rowY(0);
  const ol = Math.hypot(ox, oy), px = oy / ol, py = -ox / ol; // outward normal (left side)
  const off = PEG_R + 0.03;
  const lAx = pegX(0, 0) + px * off, lAy = rowY(0) + py * off;
  const lBx = pegX(ROWS - 1, 0) + px * off, lBy = lastRowY + py * off;
  SEGS.push({ ax: lAx, ay: lAy, bx: lBx, by: lBy });
  SEGS.push({ ax: -lAx, ay: lAy, bx: -lBx, by: lBy });
  SEGS.push({ ax: lBx, ay: lBy, bx: botL - 0.05, by: lastRowY - 0.3 });
  SEGS.push({ ax: -lBx, ay: lBy, bx: botR + 0.05, by: lastRowY - 0.3 });
  SEGS.push({ ax: botL - 0.05, ay: lastRowY - 0.3, bx: botL - 0.05, by: FLOOR_Y });
  SEGS.push({ ax: botR + 0.05, ay: lastRowY - 0.3, bx: botR + 0.05, by: FLOOR_Y });
  // drop chute: walls funnelling onto the outer top pegs
  const cw = DROP_RANGE + BALL_R + 0.04;
  for (const sx of [-1, 1]) {
    SEGS.push({ ax: sx * cw, ay: DROP_Y + 1, bx: sx * cw, by: rowY(0) + 0.45 });
    SEGS.push({ ax: sx * cw, ay: rowY(0) + 0.45, bx: -sx * lAx, by: lAy });
  }
  for (let k = 1; k < SLOTS; k++) SEGS.push({ ax: slotEdge(k), ay: FLOOR_Y, bx: slotEdge(k), by: DIVIDER_TOP, divider: true });
  SEGS.push({ ax: botL - 0.1, ay: FLOOR_Y, bx: botR + 0.1, by: FLOOR_Y, floor: true });
}

export class PlinkoSim {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.balls = [];
    this.onPeg = null; // (peg, ball, speed)
    this.onLand = null; // (ball, slot)
  }

  drop(x, data = {}) {
    // release wobble: no aim point is a sure thing
    const b = { x: Math.max(-DROP_RANGE, Math.min(DROP_RANGE, x)) + (this.rand() - 0.5) * 0.24, y: DROP_Y, vx: (this.rand() - 0.5) * 0.6, vy: 0, slot: -1, settle: 0, still: 0, done: false, age: 0, ...data };
    this.balls.push(b);
    return b;
  }

  step(dt) {
    // fixed sub-steps keep collisions stable at any frame rate
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let s = 0; s < n; s++) this.sub(h);
    for (let i = this.balls.length - 1; i >= 0; i--) if (this.balls[i].done) this.balls.splice(i, 1);
  }

  sub(h) {
    const R = this.rand;
    const balls = this.balls;
    for (const b of balls) {
      b.age += h;
      b.vy -= GRAVITY * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      // pegs: only check the two rows around the ball
      const r0 = Math.max(0, Math.floor((TOP_Y - b.y) / ROW_H) - 1);
      for (let r = r0; r <= Math.min(ROWS - 1, r0 + 2); r++) {
        const py = rowY(r);
        if (Math.abs(py - b.y) > PEG_R + BALL_R) continue;
        const base = (r * (r + 5)) / 2; // index of the row's first peg in PEGS
        for (let i = 0; i < r + 3; i++) {
          const p = PEGS[base + i];
          const dx = b.x - p.x, dy = b.y - py;
          const d2 = dx * dx + dy * dy, rr = PEG_R + BALL_R;
          if (d2 >= rr * rr || d2 < 1e-9) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          b.x += nx * (rr - d); b.y += ny * (rr - d);
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            if (-vn > REAL_HIT) {
              // real hit: bounce, lose some sliding speed, random kick
              const tx = -ny, ty = nx;
              let vt = b.vx * tx + b.vy * ty;
              vt = vt * (1 - FRICTION) + (R() - 0.5) * 2 * JITTER;
              const vnn = -vn * REST;
              b.vx = nx * vnn + tx * vt; b.vy = ny * vnn + ty * vt;
              if (this.onPeg) this.onPeg(p, b, -vn);
            } else {
              // resting / rolling: drop the push into the peg, keep sliding speed (friction and kicks per 1/240 s sub-step
              // would hold it there at a crawl). A ball balanced on the crown is tipped off.
              b.vx -= vn * nx; b.vy -= vn * ny;
              if (ny > 0.985 && Math.abs(b.vx) < 0.6) b.vx += (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.3);
            }
          }
        }
      }
      for (const sg of SEGS) {
        const ex = sg.bx - sg.ax, ey = sg.by - sg.ay;
        const L2 = ex * ex + ey * ey;
        let t = ((b.x - sg.ax) * ex + (b.y - sg.ay) * ey) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = sg.ax + ex * t, cy = sg.ay + ey * t;
        const dx = b.x - cx, dy = b.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= BALL_R * BALL_R) continue;
        let d = Math.sqrt(d2), nx, ny;
        if (d < 1e-6) { nx = -ey; ny = ex; const l = Math.hypot(nx, ny); nx /= l; ny /= l; d = 0; } else { nx = dx / d; ny = dy / d; }
        b.x += nx * (BALL_R - d); b.y += ny * (BALL_R - d);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          const k = sg.floor ? 0.25 : WALL_REST;
          b.vx -= (1 + k) * vn * nx; b.vy -= (1 + k) * vn * ny;
          if (sg.floor) b.vx *= 0.9;
        }
      }
    }
    // ball-ball collisions (equal masses)
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy, rr = BALL_R * 2;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (rr - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const j2 = -(1 + BALL_REST) * rv / 2;
          a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
        }
      }
    }
    for (const b of balls) {
      // committed to a slot below the dividers' tops
      if (b.slot < 0 && b.y < DIVIDER_TOP - 0.05) {
        b.slot = slotOf(b.x);
        if (this.onLand) this.onLand(b, b.slot);
      }
      // nudge balls resting above the slots (none hangs forever)
      if (b.slot < 0 && b.vx * b.vx + b.vy * b.vy < 0.04) { b.still += h; if (b.still > 0.3) { b.vx += (R() - 0.5) * 3; b.vy += 1; b.still = 0; } } else b.still = 0;
      if (b.slot >= 0) {
        b.settle += h;
        if (b.settle > 1.6) b.done = true;
      }
      if (b.age > 30 || b.y < -5) { if (b.slot < 0) { b.slot = slotOf(b.x); if (this.onLand) this.onLand(b, b.slot); } b.done = true; }
    }
  }
}
