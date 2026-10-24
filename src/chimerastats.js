import { mulberry32 } from './rng.js';
import { SEGS, LAP, R0, RAIL_IN, RAIL_OUT, LANES, FINISH_U } from './downsPlan.js';
import { SKILLS, DIST_SKILL, activationChance } from './chimeraskills.js';

// Racing stats for chimeras, their careers and training, and the Derby race model that uses them. No three.js in here, so the
// race can be simulated headlessly (tools/race-sim.mjs runs thousands to tune it).
//
//   SPEED   top speed (and so how fast it cruises)
//   POWER   acceleration, how quickly it moves across the track, and so whether a pass gets done before the gap closes
//   STAMINA the tank: cruising sips it, pushing and passing gulp it, and whatever is left at the end becomes the final sprint
//   WIT     skills firing, judging the final sprint, and dodging the three bad moments (Late Start, Spot Struggle, Rushed)

export const STATS_V = 2;
export const STAT_KEYS = ['speed', 'power', 'stamina', 'wit'];
// (the hover tips on the chimera cards: chimeracard.js)
export const STAT_TIPS = {
  speed: 'SPEED: top speed, and so how fast it cruises. Mostly from the legs, some from the body. Big chimeras are a little slower.',
  power: 'POWER: acceleration, and how quickly it moves across the track. It decides whether a pass gets done before the gap closes. Legs and body.',
  stamina: 'STAMINA: the tank. Cruising sips it; pushing for position and passing gulp it; what is left at the end becomes the final sprint. Mostly the body.',
  wit: 'WIT: how often its skills fire, how well it judges the final sprint, and fewer Late Starts, Spot Struggles and Rushed spells. Mostly the head.',
};
export const STAT_INFO = {
  speed: { short: 'SPD', name: 'SPEED', blurb: 'top speed' },
  power: { short: 'POW', name: 'POWER', blurb: 'pickup, passing' },
  stamina: { short: 'STA', name: 'STAMINA', blurb: 'the tank' },
  wit: { short: 'WIT', name: 'WIT', blurb: 'skills, judgement' },
};

// What each part brings to the table (0-100 per stat).
// Legs drive speed and power, the body stamina and power, the head wit.
export const LEGS = {
  car: { speed: 86, power: 55, stamina: 50, wit: 38 }, // wheels: fast, mid pickup
  mite: { speed: 60, power: 88, stamina: 36, wit: 45 }, // six legs: explosive starts, gasses out
  sapling: { speed: 28, power: 40, stamina: 90, wit: 52 }, // walking roots: slow, never tires
  junkbot: { speed: 52, power: 60, stamina: 86, wit: 32 }, // treads: tireless, clumsy
  alien: { speed: 62, power: 50, stamina: 50, wit: 82 }, // graceful, deliberate
  person: { speed: 55, power: 55, stamina: 56, wit: 56 }, // balanced
  pirate: { speed: 52, power: 74, stamina: 72, wit: 44 }, // stompy boots
  voidling: { speed: 74, power: 50, stamina: 44, wit: 70 }, // glides
};
export const BODY = {
  car: { speed: 66, power: 62, stamina: 55, wit: 40 },
  mite: { speed: 55, power: 66, stamina: 44, wit: 45 },
  sapling: { speed: 34, power: 40, stamina: 86, wit: 50 },
  junkbot: { speed: 45, power: 60, stamina: 82, wit: 40 },
  alien: { speed: 56, power: 46, stamina: 50, wit: 70 },
  person: { speed: 52, power: 52, stamina: 56, wit: 54 },
  pirate: { speed: 50, power: 72, stamina: 72, wit: 46 },
  voidling: { speed: 66, power: 50, stamina: 46, wit: 66 },
};
export const HEAD_WIT = { alien: 92, person: 76, junkbot: 72, voidling: 64, pirate: 54, sapling: 50, mite: 30, car: 26 };
export const MOD_FX = {
  turbo: { power: 12, speed: 4, stamina: -4 },
  crystal: { speed: 8 },
  armor: { stamina: 12, speed: -8 },
  spark: { power: 9, wit: -3 },
  radio: { wit: 10 },
  lens: { wit: 12 },
  void: { speed: 10, wit: -10 },
  mud: { stamina: 10, speed: -6 },
};
const PERSON = LEGS.person;

// Running styles, rolled at birth: where it wants to sit in the pack, how it cruises in each phase (opening, middle, late:
// fractions of top speed; in short races they bunch toward the pace chaser's), when its final sprint starts (in a sprint, then from a
// mile on: the closers go early in a short race, or the field is gone), the most it can kick to
// in it (a fraction of top speed, if the tank allows), and the rank band it keeps to (0 = the leader, 1 = last).
export const STYLES = {
  front: { name: 'FRONT RUNNER', short: 'FRONT', cruise: [0.89, 0.87, 0.91], sprintAt: [0.72, 0.72], spurt: 1.03, band: [0, 0.2], blurb: 'wants the lead and the rail from the gate, and pushes early to get there; holds on at the end' },
  pace: { name: 'PACE CHASER', short: 'PACE', cruise: [0.87, 0.875, 0.93], sprintAt: [0.62, 0.68], spurt: 1.06, band: [0.15, 0.55], blurb: 'sits just off the leader, burns evenly, moves up from two-thirds' },
  late: { name: 'LATE SURGER', short: 'LATE', cruise: [0.84, 0.865, 0.94], sprintAt: [0.5, 0.63], spurt: 1.11, band: [0.45, 1], blurb: 'saves itself in the pack, then a long late run on a full tank' },
};
export const STYLE_KEYS = Object.keys(STYLES);

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// The stats its parts give it (no randomness: a chimera's luck is its growth and its style).
export function computeBase(genes) {
  const L = LEGS[genes.legs] || PERSON, B = BODY[genes.body] || PERSON;
  const hw = HEAD_WIT[genes.head] ?? 50;
  const s = (genes.size ?? 1.1) - 1.1; // -0.35 .. +0.35: big = more stamina/power, less speed
  const st = {
    speed: 0.66 * L.speed + 0.3 * B.speed + 2 - s * 30,
    power: 0.6 * L.power + 0.35 * B.power + 2.5 + s * 20,
    stamina: 0.45 * L.stamina + 0.5 * B.stamina + 2.5 + s * 26,
    wit: 0.6 * hw + 0.2 * L.wit + 0.2 * B.wit,
  };
  if (genes.extraHead) st.wit += ((HEAD_WIT[genes.extraHead] ?? 50) - 40) * 0.22; // a smart spare head helps; a dumb one argues
  for (const m of genes.mods || []) for (const [k, v] of Object.entries(MOD_FX[m] || {})) st[k] += v;
  for (const k of STAT_KEYS) st[k] = Math.round(clamp(st[k], 1, 100));
  return st;
}

// Growth and running style, rolled from the seed at birth. Growth: training gains on one stat are 25-40 % bigger, or on two 15-25 % each,
// and a growth stat trains at the full rate past 80 (any other halves there), so only growth stats really reach the 90s.
export const GROWTH = { one: [0.25, 0.4], two: [0.15, 0.25] };
function rollNature(genes, base) {
  const rr = mulberry32(((genes.seed | 0) ^ 0x9a0d5) >>> 0);
  rr();
  const keys = [...STAT_KEYS];
  const growth = {};
  const n0 = rr() < 0.6 ? 1 : 2, [lo, hi] = n0 === 1 ? GROWTH.one : GROWTH.two;
  for (let n = n0; n > 0; n--) {
    const k = keys.splice(Math.floor(rr() * keys.length), 1)[0];
    growth[k] = Math.round((lo + rr() * (hi - lo)) * 100) / 100;
  }
  // a punchy, short-winded build leans to the front; a deep tank leans to waiting
  const lean = (base.power - base.stamina) / 15;
  const w = { front: 1 + Math.max(0, lean), pace: 1.4, late: 1 + Math.max(0, -lean) };
  let x = rr() * (w.front + w.pace + w.late), style = 'pace';
  for (const k of STYLE_KEYS) { x -= w[k]; if (x <= 0) { style = k; break; } }
  return { growth, style };
}

export const statTotal = (st) => st.speed + st.power + st.stamina + st.wit;
export function tierOf(st) {
  const t = statTotal(st);
  return t >= 260 ? 'S' : t >= 244 ? 'A' : t >= 220 ? 'B' : 'C';
}
// top speed in m/s on the Derby track
export const topSpeedOf = (st) => Math.round((33.5 + st.speed * 0.075) * 10) / 10;

// A career: three seasons of three races and a tournament, then retirement. `train` is the banked training sessions (one per race run).
export const SEASONS = 3, SEASON_RACES = 3;
export const newCareer = () => ({ season: 1, races: 0, train: 0, log: [], trophies: [], retired: false });
// what a retired racer fetches: its record (wins, places, tournament trophies, a Triple Crown) and a little for its stats
export const resaleValue = (g) => Math.round((150 + 2 * statTotal(g.stats) + 300 * (g.wins || 0) + 90 * (g.placed || 0) + 1500 * ((g.career && g.career.trophies.length) || 0) + (g.crown ? 12000 : 0)) / 10) * 10;
// what it may run next: 'race' (a normal race), 'tournament' (its season's three are done) or null (retired)
export const careerNext = (c) => (c.retired ? null : c.races >= SEASON_RACES ? 'tournament' : 'race');

// Give a gene sheet its stats (new chimeras, and old saves that predate them), growth, style, skills and career, and fold its
// training into its stats. Mutates and returns it.
export function ensureStats(genes) {
  if (!genes) return genes;
  if (!genes.base || !genes.stats || genes.stats.v !== STATS_V) genes.base = computeBase(genes);
  if (!genes.trained) genes.trained = { speed: 0, power: 0, stamina: 0, wit: 0 };
  if (!genes.growth || !genes.style) Object.assign(genes, rollNature(genes, genes.base), { growthV: 2 });
  if (!genes.growthV) {                       // (a chimera from before growth was raised: its old 5-15 % moved to the same place in the new range)
    const ks = Object.keys(genes.growth), [lo, hi] = ks.length === 1 ? GROWTH.one : GROWTH.two;
    for (const k of ks) genes.growth[k] = Math.round((lo + Math.max(0, Math.min(1, (genes.growth[k] - 0.05) / 0.1)) * (hi - lo)) * 100) / 100;
    genes.growthV = 2;
  }
  const st = { v: STATS_V };
  for (const k of STAT_KEYS) st[k] = Math.min(100, genes.base[k] + (genes.trained[k] || 0));
  genes.stats = st;
  genes.tier = tierOf(st);
  genes.speed = topSpeedOf(st);
  if (!genes.skills) genes.skills = [];
  if (!genes.career) genes.career = newCareer();
  if (genes.chaos === undefined) genes.chaos = new Set(genes.parents || []).size + (genes.mods || []).length + (genes.extraHead ? 1 : 0) + ((genes.mods || []).includes('void') ? 1 : 0);
  return genes;
}

// ---------------------------------------------------------------------------------------------
// Training: one session per race run, banked. A drill works one stat hard and another a little; growth multiplies both, and
// gains halve once a stat is past 80 (none past 100).
export const DRILLS = {
  sprints: { name: 'SPRINTS', main: 'speed', side: 'power', blurb: 'flat-out dashes down the back lane' },
  hills: { name: 'HILL PULLS', main: 'power', side: 'stamina', blurb: 'hauling a sledge of regolith up the spoil heap' },
  laps: { name: 'LONG LAPS', main: 'stamina', side: 'speed', blurb: 'lap after lap of the training ring' },
  maze: { name: 'MAZE RUN', main: 'wit', side: 'power', blurb: 'the hay-bale maze, with a hot dog at the end' },
};
// Returns { gains: { stat: points }, bonus: { stat: how many of those points the growth gave } }.
export function train(genes, drill, rnd = Math.random) {
  ensureStats(genes);
  const D = DRILLS[drill];
  const gains = {}, bonus = {};
  const add = (k, amt) => {
    const cur = genes.base[k] + genes.trained[k];
    if (cur >= 100) return;
    const gr = genes.growth[k] || 0;
    const soft = cur >= 80 && !gr ? 0.5 : 1;                  // (past 80 a stat trains at half the rate, unless it is a growth stat)
    const plain = Math.max(1, Math.round(amt * soft));
    const got = Math.min(Math.max(1, Math.round(amt * (1 + gr) * soft)), 100 - cur);
    genes.trained[k] += got;
    gains[k] = (gains[k] || 0) + got;
    if (got > plain) bonus[k] = (bonus[k] || 0) + got - plain;
  };
  add(D.main, 4 + rnd() * 3);
  add(D.side, 1 + rnd() * 1.2);
  ensureStats(genes);
  return { gains, bonus };
}

// ---------------------------------------------------------------------------------------------
// The Derby race model. Races at Chimera Downs run from a 450 m sprint to a 3.6 km marathon on a 706 m oval (two 180 m straights,
// two bends), the field of up to six breaks from the gate in its lanes and fights for the inner rail.
//
// Everyone cruises below top speed (each style at its own pace per phase) and keeps to its style's place in the pack. Pushing (up to
// top speed, for position or to get past) costs stamina fast, so a runner pushes only when its tank can spare it. A runner close
// behind another, in its line, is held to the leader's pace: to pass it needs room to one side, a faster pace than the one ahead
// (its current speed, not its SPEED stat, so a slower chimera can pass a faster one that is cruising), and the POWER to get across
// and by before the gap closes. Once the final sprint begins, a runner spends what it has left: the fastest pace its tank (as its wit
// judges it) will hold to the line.
export const RACE_LEN = 1400; // default distance (tests, old callers)
export const CATS = { SPRINT: [450, 850], MILE: [1000, 1800], MEDIUM: [2000, 2800], LONG: [3000, 3600] };
export const catOf = (dist) => (dist < 1000 ? 'SPRINT' : dist < 2000 ? 'MILE' : dist < 3000 ? 'MEDIUM' : 'LONG');
export const CONDITIONS = {
  fast: { name: 'FAST', speed: 1.05, drain: 0.95, chaos: 0.85, blurb: 'hard-packed regolith: speed tells' },
  dusty: { name: 'DUSTY', speed: 1, drain: 1, chaos: 1, blurb: 'ordinary lunar going' },
  heavy: { name: 'HEAVY', speed: 0.93, drain: 1.3, chaos: 1, blurb: 'deep dust: tiring, stamina tells' },
  lowg: { name: 'LOW-G', speed: 1.02, drain: 1, chaos: 1.45, blurb: 'gravity hiccups: bouncy, and more bad moments' },
};
const NO_COND = CONDITIONS.dusty;

const BEND_LEN = SEGS[1];
const BEND_K = 0.35;            // how much the inside line pays on a bend: (R0 / radius) ^ BEND_K (the full geometry, ^1, was worth ~38 m a bend between the rails)
const PUSH_U = 0.98;            // pushing: this fraction of top speed
const RATION_U = 0.8;           // the slowest a runner short of stamina eases down to
const STRUGGLE_T = 1.2;
const CHECK_T = 1.5;            // seconds between position checks
const DRAIN_POW = 4;            // stamina use grows with (speed / top) ^ 4: cruising at 0.88 costs 0.6 of flat out
const RESERVE = 0.015;          // what a runner tries to keep in the tank at the line
const X_MAX = 15;               // how wide a runner goes, from the inner rail (the outer 4 m are where the starting gate is towed once the field has gone)
export const onBend = (u) => { u = ((u % LAP) + LAP) % LAP; return (u >= SEGS[0] && u < SEGS[0] + BEND_LEN) || u >= SEGS[0] * 2 + BEND_LEN; };
export const widthOf = (genes) => 0.9 * (genes.size ?? 1.1);   // body width in metres (the models are drawn at 0.72 of their size)
export const lengthOf = (genes) => 1.1 * (genes.size ?? 1.1);
// six stalls, 3 m apart, from the rail out; fewer runners take the inside ones
export const laneRadius = (i) => LANES[i] ?? LANES[0] + i * 3;

export function newRunner(genes, lane = 0, rnd = Math.random, cat = 'MILE') {
  ensureStats(genes);
  const st = genes.stats, S = STYLES[genes.style] || STYLES.pace;
  const r = {
    genes, st, style: S, lane,
    s: 0, x: laneRadius(lane) - RAIL_IN, v: 0, stam: 1, t: rnd() * 5, time: 0,
    w: widthOf(genes), len: lengthOf(genes),
    top: topSpeedOf(st), drainK: 0.012 + (100 - st.stamina) * 0.00022, accel: 2 + 0.12 * st.power, side: 0.6 + 0.03 * st.power,
    delay: 0, struggleT: 0, rushedT: 0, rushCheck: 0, rushAt: 0.08 + rnd() * 0.4, rushRolled: false,
    pass: null, passCool: 0, blocked: null, pushing: false, sprint: 0, sprintT: 0, checkT: rnd() * CHECK_T, gassed: false,
    judge: 1 + (rnd() - 0.5) * 0.3 * (1 - st.wit / 100),           // how far off its read of its own tank is: a dim one over- or under-spends
    skills: new Set(genes.skills || []), used: new Set(), tried: new Set(), buffs: [],
    mSpeed: 1, mAccel: 1, mDrain: 1, lateSpeed: 0, floor: 0.74,
    wasBend: false, half: false, straight: false,
    done: false, place: 0, ev: null, evT: 0,
  };
  // the passive distance skill for this race
  const ps = DIST_SKILL[cat];
  if (r.skills.has(ps)) {
    const fx = SKILLS[ps].fx;
    r.mSpeed += fx.speed || 0; r.mAccel += fx.accel || 0; r.mDrain += fx.drain || 0;
    r.lateSpeed = fx.lateSpeed || 0; if (fx.floor) r.floor = fx.floor;
    r.used.add(ps);
  }
  return r;
}

// A race in progress. opts: dist, cond (one of CONDITIONS), rnd. Advance it with stepRace; R.events lists what happened in the last step.
export function newRace(field, opts = {}) {
  const rnd = opts.rnd || Math.random, dist = opts.dist || RACE_LEN, cond = opts.cond || NO_COND;
  const cat = catOf(dist);
  const R = { dist, cond, cat, rnd, t: 0, finished: 0, startU: FINISH_U - dist, events: [], order: [] };
  R.runners = field.map((g, i) => newRunner(g, i, rnd, cat));
  // every race is run to the tank: an average runner (STA 55, cruising at 0.88 of 36 m/s) would use this share of it, from 0.7 of
  // a sprint's to 1.15 of a marathon's (so the long ones still tire everyone, and the short ones are not just a speed contest)
  const tank = Math.min(1.15, 0.65 + 0.15 * dist / 1000);
  R.drainScale = (tank * 31.7) / (0.0131 * dist);
  R.styleK = clamp(dist / 2400, 0.4, 1.2);       // (how far the styles' cruising paces spread)
  const kS = clamp((dist - 650) / 1000, 0, 1);
  for (const r of R.runners) r.sprintAt = r.style.sprintAt[0] + (r.style.sprintAt[1] - r.style.sprintAt[0]) * kS;
  for (const r of R.runners) r.drainK *= R.drainScale;
  // the break: Gate Burst, or (failing that) a Late Start for the dim
  for (const r of R.runners) {
    if (trySkill(R, r, 'start')) continue;
    if (rnd() < (0.3 - 0.0028 * r.st.wit) * cond.chaos) { r.delay = 0.3 + rnd() * 0.7; emit(R, r, 'late'); }
  }
  return R;
}

function emit(R, r, kind, id) { R.events.push({ r, kind, id }); }

// Roll the runner's skill(s) for this trigger. Returns true if one fired.
function trySkill(R, r, on) {
  if (r.rushedT > 0) return false;
  for (const id of r.skills) {
    const S = SKILLS[id];
    if (!S || S.on !== on || r.used.has(id) || r.tried.has(id)) continue;
    if (S.once) r.tried.add(id);
    if (R.rnd() >= activationChance(r.st.wit) * (S.odds || 1)) continue;
    r.used.add(id);
    const fx = S.fx;
    if (fx.stamina) r.stam = Math.min(1, r.stam + fx.stamina);
    if (fx.dur) r.buffs.push({ id, t: fx.dur, speed: fx.speed || 0, accel: fx.accel || 0, laneSpeed: fx.laneSpeed || 0, pass: !!fx.pass });
    emit(R, r, 'skill', id);
    return true;
  }
  return false;
}

// how much of the tank finishing from here at pace u (a fraction of top) takes
const need = (r, R, u, dist) => r.drainK * r.mDrain * R.cond.drain * Math.pow(u, DRAIN_POW - 1) * dist / (r.top * R.cond.speed) * r.judge;

// the fastest pace (a fraction of top) that `fuel` holds for `dist` metres, as the runner judges it
const fitPace = (r, R, fuel, dist) => Math.cbrt(fuel * r.top * R.cond.speed / (r.drainK * r.mDrain * R.cond.drain * Math.max(1, dist) * r.judge));

// another runner overlapping r's line, at lateral position x
const overlap = (r, o, x) => Math.abs(o.x - x) < (r.w + o.w) / 2 + 0.15;

export function stepRace(R, dt) {
  R.events.length = 0;
  R.t += dt;
  const rs = R.runners;
  // ranks for keeping position (the leader is 0)
  const order = R.order;
  order.length = 0;
  for (const r of rs) if (!r.done) order.push(r);
  order.sort((a, b) => b.s - a.s);
  const n = rs.length;
  for (let i = 0; i < order.length; i++) stepRunner(R, order[i], dt, n > 1 ? (i + R.finished) / (n - 1) : 0);
  for (const r of rs) {
    if (r.done || r.s < R.dist) continue;
    r.done = true;
    r.place = ++R.finished;
    r.time -= (r.s - R.dist) / Math.max(1, r.v);    // (the fraction of a step past the line)
  }
  return R.events;
}

function stepRunner(R, r, dt, q) {
  const st = r.st, wit = st.wit / 100, rnd = R.rnd, cond = R.cond;
  r.t += dt;
  r.time += dt;
  if (r.delay > 0) { r.delay -= dt; return; }            // still in the stall (a Late Start)
  const frac = r.s / R.dist, remain = R.dist - r.s;
  const phase = frac < 0.15 ? 0 : frac < 0.65 ? 1 : 2;
  const u = R.startU + r.s;
  // ---- triggers ----
  const bend = onBend(u);
  if (bend && !r.wasBend) trySkill(R, r, 'bend');
  r.wasBend = bend;
  if (!r.half && frac >= 0.5) { r.half = true; trySkill(R, r, 'half'); }
  if (!r.straight && remain <= FINISH_U && frac > 0.3) { r.straight = true; trySkill(R, r, 'straight'); }
  if (frac >= 0.8 && frac < 0.9 && (r.soulT = (r.soulT || 0) - dt) <= 0) { r.soulT = 1; trySkill(R, r, 'soul'); }
  // ---- skill buffs ----
  let bSpeed = 0, bAccel = 0, bLane = 0, bPass = false;
  for (let i = r.buffs.length - 1; i >= 0; i--) {
    const b = r.buffs[i];
    b.t -= dt;
    if (b.t <= 0) { r.buffs.splice(i, 1); continue; }
    bSpeed += b.speed; bAccel += b.accel; bLane += b.laneSpeed; if (b.pass) bPass = true;
  }
  const top = r.top * cond.speed;
  const eTop = top * (r.mSpeed + bSpeed + (phase === 2 ? r.lateSpeed : 0));    // skills lift the ceiling without costing stamina
  // ---- the bad moments ----
  if (!r.rushRolled && frac >= r.rushAt) {
    r.rushRolled = true;
    if (rnd() < clamp((0.2 - 0.17 * wit + 0.012 * (r.genes.chaos || 2)) * cond.chaos, 0.01, 0.35)) { r.rushedT = 9; r.rushCheck = 3; emit(R, r, 'rushed'); }
  }
  if (r.rushedT > 0) {
    r.rushedT -= dt;
    if ((r.rushCheck -= dt) <= 0) { r.rushCheck = 3; if (rnd() < 0.35 + 0.5 * wit) r.rushedT = 0; }
    if (r.rushedT <= 0) { r.rushedT = 0; emit(R, r, 'calm'); }
  }
  if (r.struggleT > 0) r.struggleT -= dt;
  // ---- who is around: the runner ahead in its line, and anyone close ----
  let ahead = null, close = false;
  for (const o of R.runners) {
    if (o === r || o.done) continue;
    const ds = o.s - r.s;
    if (Math.abs(ds) < 3 && Math.abs(o.x - r.x) < (r.w + o.w) / 2 + 0.8) close = true;
    if (ds > 0 && ds < (r.len + o.len) / 2 + 2.5 && overlap(r, o, r.x) && (!ahead || ds < ahead.s - r.s)) ahead = o;
  }
  if ((r.checkT -= dt) <= 0) {
    r.checkT = CHECK_T;
    // a position check: crowded, a dim runner hesitates and gives ground
    if (close && r.struggleT <= 0 && rnd() < 0.12 * (1 - wit) * cond.chaos) { r.struggleT = STRUGGLE_T; emit(R, r, 'struggle'); }
  }
  // ---- the pace it wants ----
  const cruiseU = STYLES.pace.cruise[phase] + (r.style.cruise[phase] - STYLES.pace.cruise[phase]) * R.styleK;
  const spare = r.stam - RESERVE - need(r, R, cruiseU, remain);
  let target = top * cruiseU;
  r.pushing = false;
  if (frac >= r.sprintAt) {
    // the final sprint: the fastest pace the tank (as it judges it) holds to the line, re-judged each second
    if ((r.sprintT -= dt) <= 0) {
      r.sprintT = 1;
      const was = r.sprint;
      const fuel = Math.max(0, r.stam - RESERVE);
      r.sprint = clamp(fitPace(r, R, fuel, remain), RATION_U, r.style.spurt);
      if (!was) emit(R, r, 'sprint');
    }
    target = top * r.sprint;
    r.pushing = r.sprint > cruiseU + 0.02;
  } else if (spare < 0) {
    // short of stamina for the distance: ease off to what the tank can hold
    target = top * Math.max(RATION_U, Math.min(cruiseU, fitPace(r, R, Math.max(0, r.stam - RESERVE), remain)));
  } else if (phase < 2) {
    // keeping its place: behind its band it pushes (if the tank can spare it); ahead of it, it eases off
    const [lo, hi] = r.style.band;
    if (q > hi + 0.05 && spare > 0.12) { target = top * PUSH_U; r.pushing = true; }
    else if (q < lo - 0.05) target *= 0.97;
    // a front runner being passed fights for its lead
    if (r.style === STYLES.front && spare > 0.1 && R.runners.some((o) => o.pass && o.pass.q === r)) { target = top * PUSH_U; r.pushing = true; }
  }
  if (r.rushedT > 0) { target = Math.max(target, top * Math.min(1, cruiseU * 1.08)); r.pushing = true; }
  if (r.stam <= 0) {
    target = Math.min(target, top * r.floor);
    if (!r.gassed) { r.gassed = true; emit(R, r, 'gassed'); }
  }
  target *= eTop / top;
  if (r.struggleT > 0) target *= 0.9;
  // ---- passing ----
  let drainX = 1;
  if (r.pass) {
    const P = r.pass;
    P.t += dt;
    if (P.q.done || r.s > P.q.s + (r.len + P.q.len) / 2 + 0.5) { r.pass = null; r.passCool = 1; emit(R, r, 'passed'); }
    else if (P.t > 4.5 || (!P.auto && r.stam < RESERVE * 2)) { r.pass = null; r.passCool = 2.5; }          // couldn't get by: tuck back in for a bit
    else {
      target = Math.max(target, eTop * PUSH_U);
      drainX = P.drain;
      r.pushing = true;
    }
  }
  r.blocked = null;
  if (r.passCool > 0) r.passCool -= dt;
  if (!r.pass && ahead && r.struggleT <= 0) {
    if (target > ahead.v + 0.35 && r.passCool <= 0) {
      // wants by: room inside, else outside?
      const gap = (r.w + ahead.w) / 2 + 0.3;
      const xin = ahead.x - gap, xout = ahead.x + gap;
      const free = (x) => x >= r.w / 2 + 0.5 && x <= X_MAX && !R.runners.some((o) => o !== r && o !== ahead && !o.done && Math.abs(o.s - r.s) < 3.5 && overlap(r, o, x));
      const x = free(xin) ? xin : free(xout) ? xout : null;
      if (x !== null && (spare > 0 || frac >= r.sprintAt)) {
        r.pass = { q: ahead, x, t: 0, drain: 1.4, auto: false };
        if (trySkill(R, r, 'pass') || bPass) { r.pass.auto = true; r.pass.drain = 1; }
        else if (rnd() >= 0.35 + 0.55 * wit) {
          // fumbled it: burns more going round, and may lose its nerve
          r.pass.drain = 2.2;
          if (rnd() < 0.5) { r.struggleT = STRUGGLE_T; emit(R, r, 'struggle'); }
        }
        emit(R, r, 'pass');
        target = Math.max(target, eTop * PUSH_U);
        drainX = r.pass.drain;
      }
    }
    if (!r.pass) { r.blocked = ahead; target = Math.min(target, ahead.v + 0.05); }
  }
  // ---- across the track: to the passing line, else the rail, if there is room ----
  const want = r.pass ? r.pass.x : r.w / 2 + 0.5;
  let dx = clamp(want - r.x, -1, 1) * r.side * (1 + bLane) * dt;
  if (r.struggleT > 0) dx = 0.6 * dt;                     // drifting wide
  if (Math.abs(dx) > Math.abs(want - r.x) && r.struggleT <= 0) dx = want - r.x;
  if (dx) {
    const nx = r.x + dx;
    let ok = true;
    for (const o of R.runners) {
      if (o === r || o.done || Math.abs(o.s - r.s) > (r.len + o.len) / 2 + 0.3) continue;
      if (overlap(r, o, nx) && !overlap(r, o, r.x)) { ok = false; break; }
    }
    if (ok) r.x = clamp(nx, r.w / 2 + 0.5, Math.max(X_MAX, r.x));     // (the outer stalls start wider, and may only come in)
  }
  // ---- speed ----
  if (target > r.v) r.v = Math.min(target, r.v + r.accel * r.mAccel * (1 + bAccel) * (r.pushing ? 1.15 : 1) * dt);
  else r.v += (target - r.v) * Math.min(1, dt * 2.5);
  // tucked in behind another runner it drafts, and uses 20% less
  const draft = ahead && ahead.s - r.s < (r.len + ahead.len) / 2 + 3 ? 0.8 : 1;
  const drain = r.drainK * r.mDrain * cond.drain * Math.pow(Math.max(0, r.v) / eTop, DRAIN_POW) * (r.rushedT > 0 ? 1.6 : 1) * drainX * draft;
  r.stam = Math.max(0, r.stam - drain * dt);
  // the inside line is shorter on a bend
  const k = bend ? Math.pow(R0 / (RAIL_IN + r.x), BEND_K) : 1;
  r.s += r.v * dt * k;
  // never through the one ahead
  if (ahead && overlap(r, ahead, r.x)) {
    const minS = ahead.s - (r.len + ahead.len) / 2;
    if (r.s > minS) { r.s = Math.max(r.s - r.v * dt * k, minS); r.v = Math.min(r.v, ahead.v); }
  }
  // what the live race shows over its head
  r.ev = r.delay > 0 ? 'late' : r.struggleT > 0 ? 'struggle' : r.rushedT > 0 ? 'rushed' : r.pass ? 'passing' : r.blocked ? 'blocked' : null;
}

// Run the model to the finish line; returns the runners (each with .place and .time).
export function simulateRace(field, opts = {}) {
  const R = newRace(field, opts);
  const dt = opts.dt || 1 / 15;
  for (let step = 0; step < 20000 && R.finished < R.runners.length; step++) stepRace(R, dt);
  return R.runners;
}
