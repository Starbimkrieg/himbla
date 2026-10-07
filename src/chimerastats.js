import { mulberry32 } from './rng.js';

// Racing stats for chimeras, and the Derby race model that uses them. No three.js in here, so
// the race can be simulated headlessly (odds are a Monte-Carlo of this exact model).
//
//   SPEED   top speed
//   POWER   acceleration (and how fast it gets going again after a stumble)
//   STAMINA how slowly it tires; tired racers lose top speed late in the race
//   WIT     fewer stumbles / wrong-way / existential moments, quicker recovery

export const STATS_V = 1;
export const STAT_KEYS = ['speed', 'power', 'stamina', 'wit'];
export const STAT_INFO = {
  speed: { short: 'SPD', name: 'SPEED', blurb: 'top speed' },
  power: { short: 'POW', name: 'POWER', blurb: 'acceleration' },
  stamina: { short: 'STA', name: 'STAMINA', blurb: 'tires slowly' },
  wit: { short: 'WIT', name: 'WIT', blurb: 'fewer derps' },
};

// What each part brings to the table (0-100 per stat).
// Legs drive speed and power, the body stamina and power, the head wit.
const LEGS = {
  car: { speed: 86, power: 55, stamina: 50, wit: 38 }, // wheels: fast, mid pickup
  mite: { speed: 60, power: 88, stamina: 36, wit: 45 }, // six legs: explosive starts, gasses out
  sapling: { speed: 28, power: 40, stamina: 90, wit: 52 }, // walking roots: slow, never tires
  junkbot: { speed: 52, power: 60, stamina: 86, wit: 32 }, // treads: tireless, clumsy
  alien: { speed: 62, power: 50, stamina: 50, wit: 82 }, // graceful, deliberate
  person: { speed: 55, power: 55, stamina: 56, wit: 56 }, // balanced
  pirate: { speed: 52, power: 74, stamina: 72, wit: 44 }, // stompy boots
  voidling: { speed: 74, power: 50, stamina: 44, wit: 70 }, // glides
};
const BODY = {
  car: { speed: 66, power: 62, stamina: 55, wit: 40 },
  mite: { speed: 55, power: 66, stamina: 44, wit: 45 },
  sapling: { speed: 34, power: 40, stamina: 86, wit: 50 },
  junkbot: { speed: 45, power: 60, stamina: 82, wit: 40 },
  alien: { speed: 56, power: 46, stamina: 50, wit: 70 },
  person: { speed: 52, power: 52, stamina: 56, wit: 54 },
  pirate: { speed: 50, power: 72, stamina: 72, wit: 46 },
  voidling: { speed: 66, power: 50, stamina: 46, wit: 66 },
};
const HEAD_WIT = { alien: 92, person: 76, junkbot: 72, voidling: 64, pirate: 54, sapling: 50, mite: 30, car: 26 };
const MOD_FX = {
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

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Deterministic from the gene sheet + seed, so old saves migrate to the same numbers every time.
export function computeStats(genes) {
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
  const rr = mulberry32(((genes.seed | 0) ^ 0x5eed5) >>> 0);
  rr();
  for (const k of STAT_KEYS) st[k] = Math.round(clamp(st[k] * (0.87 + rr() * 0.26), 1, 100)); // +-13% spread
  return st;
}

export const statTotal = (st) => st.speed + st.power + st.stamina + st.wit;
export function tierOf(st) {
  const t = statTotal(st);
  return t >= 260 ? 'S' : t >= 244 ? 'A' : t >= 220 ? 'B' : 'C';
}
// top speed in m/s on the Derby track
export const topSpeedOf = (st) => Math.round((32 + st.speed * 0.1) * 10) / 10;

// Give a gene sheet its stats (new chimeras, and old saves that predate them). Mutates and returns it.
export function ensureStats(genes) {
  if (!genes) return genes;
  if (!genes.stats || genes.stats.v !== STATS_V) {
    const st = computeStats(genes);
    genes.stats = { v: STATS_V, ...st };
  }
  genes.tier = tierOf(genes.stats);
  genes.speed = topSpeedOf(genes.stats);
  if (genes.chaos === undefined) genes.chaos = new Set(genes.parents || []).size + (genes.mods || []).length + (genes.extraHead ? 1 : 0);
  return genes;
}

// ---------------------------------------------------------------------------------------------
// The Derby race model.
export const RACE_LEN = 2 * Math.PI * 100 * 2; // two laps of the 100 m (centre-line) track

export function newRunner(genes, rnd = Math.random) {
  ensureStats(genes);
  return { genes, st: genes.stats, s: 0, v: 0, stam: 1, t: rnd() * 5, ev: null, evT: 0, done: false, place: 0, time: 0 };
}

// Event weights. "Bad" ones are scaled by low wit.
const EVENTS = [
  ['stumble', 25, true], ['zoom', 25, false], ['wrong', 15, true], ['hop', 15, false], ['boom', 12, false], ['dread', 8, true],
];
const EV_T = { stumble: 1.4, zoom: 2, wrong: 1.2, hop: 0.2, boom: 2.2, dread: 2.5, trip: 0.8 };

// Advance one runner by dt. Returns the name of an event that just started (or null);
// r.ended is set to the event that just finished this step (or null).
export function stepRunner(r, dt, rnd = Math.random) {
  const st = r.st;
  const top = r.genes.speed;
  const wit = st.wit / 100;
  const recov = 1.3 - st.wit * 0.006; // wit 100 -> 0.7x as long stuck, wit 0 -> 1.3x
  let fired = null;
  r.ended = null;
  r.t += dt;
  r.time += dt;
  if (r.evT > 0) {
    r.evT -= dt;
    if (r.evT <= 0) { r.ended = r.ev; r.ev = null; }
  } else if (rnd() < dt * (0.05 + (r.genes.chaos || 2) * 0.035)) {
    const bad = 1.45 - wit * 0.95;
    let tot = 0;
    for (const [, w, b] of EVENTS) tot += b ? w * bad : w;
    let x = rnd() * tot;
    for (const [name, w, b] of EVENTS) { x -= b ? w * bad : w; if (x <= 0) { fired = name; break; } }
    fired = fired || 'zoom';
  } else if (rnd() < dt * 0.07 * (1 - wit)) fired = 'trip'; // plain derp: tripping over its own feet
  if (fired) {
    r.ev = fired;
    r.evT = EV_T[fired] * (fired === 'zoom' || fired === 'hop' || fired === 'boom' ? 1 : recov);
  }
  // fatigue: below 40% stamina the top speed sags, down to 72% when empty
  const fatigue = 0.72 + 0.28 * Math.min(1, r.stam / 0.4);
  const surge = 0.9 + Math.sin(r.t * 0.7 + (r.genes.seed % 100)) * 0.08 + rnd() * 0.04;
  let target = top * surge * fatigue;
  if (r.ev === 'stumble' || r.ev === 'boom' || r.ev === 'dread' || r.ev === 'trip') target = 0;
  else if (r.ev === 'zoom') target *= 1.6;
  else if (r.ev === 'wrong') target = -top * 0.5;
  if (target > r.v && r.v >= 0) r.v = Math.min(target, r.v + (3 + st.power * 0.14) * dt); // power: m/s² of pickup
  else r.v += (target - r.v) * Math.min(1, dt * 3.5); // everyone brakes (or gets flung backwards) alike
  const drain = (0.01 + (100 - st.stamina) * 0.00035) * (Math.abs(r.v) / top) * (r.ev === 'zoom' ? 2.5 : 1);
  r.stam = Math.max(0, Math.min(1, r.stam - drain * dt + (target === 0 ? 0.01 * dt : 0)));
  r.s = Math.max(0, r.s + r.v * dt);
  return fired;
}

// Run the model to the finish line; returns runners sorted by finish.
export function simulateRace(field, rnd = Math.random, dt = 1 / 15) {
  const rs = field.map((g) => newRunner(g, rnd));
  let finished = 0;
  for (let step = 0; step < 6000 && finished < rs.length; step++) {
    for (const r of rs) {
      if (r.done) continue;
      stepRunner(r, dt, rnd);
      if (r.s >= RACE_LEN) { r.done = true; r.place = ++finished; }
    }
  }
  return rs;
}

// Monte-Carlo win chances for each runner, and fair-ish odds with a small house edge.
export function raceOdds(field, n = 400, rnd = Math.random) {
  const wins = field.map(() => 0);
  for (let i = 0; i < n; i++) {
    const rs = simulateRace(field, rnd);
    const w = rs.findIndex((r) => r.place === 1);
    if (w >= 0) wins[w]++;
  }
  return wins.map((w) => {
    const p = (w + 0.5) / (n + 0.5 * field.length);
    return { p, odds: Math.round(clamp(0.9 / p, 1.2, 25) * 10) / 10 };
  });
}
