// Dev-only: runs the Chimera Downs race model (src/chimerastats.js) headless, thousands of times, and reports how it plays: what
// the stats are worth, how the styles and lanes do, how often passes, skills and the bad moments happen, and what is left in the
// tank at the line. For tuning the model's numbers.
//
//   node tools/race-sim.mjs [races=2000] [dist=all|sprint|mile|medium|long|<metres>] [field=6] [skills=0|1]
//
// skills=1 gives every runner every skill (to measure how often each fires); the default is none.
import { spliceGenes, LIVING, MODIFIERS } from '../src/chimeragenes.js';
import { newRace, stepRace, CONDITIONS, CATS, STAT_KEYS, STYLE_KEYS, statTotal, tierOf, train, DRILLS } from '../src/chimerastats.js';
import { SKILL_IDS, SKILLS } from '../src/chimeraskills.js';
import { mulberry32 } from '../src/rng.js';

const arg = (i, d) => process.argv[2 + i] ?? d;
const N = +arg(0, 2000), DIST = arg(1, 'all'), FIELD = +arg(2, 6), ALLSK = arg(3, '0') === '1';
const rnd = mulberry32(12345);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const MODS = Object.keys(MODIFIERS);

function breed() {
  const items = [];
  const a = pick(LIVING);
  items.push({ kind: a }, { kind: pick(LIVING.filter((k) => k !== a)) });
  if (rnd() < 0.3) items.push({ kind: pick(LIVING) });
  if (rnd() < 0.5) items.push({ kind: pick(MODS) });
  return spliceGenes(items, Math.floor(rnd() * 1e9));
}
function distOf() {
  if (/^\d+$/.test(DIST)) return +DIST;
  const cat = DIST === 'all' ? pick(Object.keys(CATS)) : DIST.toUpperCase();
  const [a, b] = CATS[cat];
  return Math.round((a + rnd() * (b - a)) / 50) * 50;
}

// ---- the population: stat totals and tiers straight out of the reactor ----
const pop = Array.from({ length: 4000 }, breed);
const totals = pop.map((g) => statTotal(g.stats)).sort((a, b) => a - b);
const tiers = { C: 0, B: 0, A: 0, S: 0 };
for (const g of pop) tiers[g.tier]++;
const styles = Object.fromEntries(STYLE_KEYS.map((k) => [k, 0]));
for (const g of pop) styles[g.style]++;
const q = (p) => totals[Math.floor(p * (totals.length - 1))];
console.log(`reactor: total p10 ${q(0.1)} · p50 ${q(0.5)} · p90 ${q(0.9)} · max ${q(1)} | tiers ${Object.entries(tiers).map(([k, v]) => `${k} ${(v / 40).toFixed(0)}%`).join(' ')} | styles ${Object.entries(styles).map(([k, v]) => `${k} ${(v / 40).toFixed(0)}%`).join(' ')}`);
// a career of training (12 sessions, each on its weakest stat)
{
  const after = pop.slice(0, 400).map((g0) => {
    const g = JSON.parse(JSON.stringify(g0));
    for (let i = 0; i < 12; i++) {
      const weak = STAT_KEYS.reduce((a, b) => (g.stats[a] <= g.stats[b] ? a : b));
      train(g, Object.keys(DRILLS).find((d) => DRILLS[d].main === weak), rnd);
    }
    return statTotal(g.stats) - statTotal(g0.stats);
  }).sort((a, b) => a - b);
  console.log(`12 trainings add: p10 ${after[40]} · p50 ${after[200]} · p90 ${after[360]}`);
}

// ---- races ----
const conds = Object.values(CONDITIONS);
const acc = {
  wins: 0, races: 0, steps: 0,
  styleWins: Object.fromEntries(STYLE_KEYS.map((k) => [k, [0, 0]])),
  laneWins: Array(FIELD).fill(0),
  statHi: Object.fromEntries(STAT_KEYS.map((k) => [k, [0, 0]])),
  ev: {}, skill: Object.fromEntries(SKILL_IDS.map((k) => [k, 0])), left: [], time: 0, favWin: 0, gassed: 0,
};
for (let i = 0; i < N; i++) {
  const field = Array.from({ length: FIELD }, breed);
  if (ALLSK) for (const g of field) g.skills = [...SKILL_IDS];
  const dist = distOf();
  const R = newRace(field, { dist, cond: pick(conds), rnd });
  const tally = (evs) => { for (const e of evs) { acc.ev[e.kind] = (acc.ev[e.kind] || 0) + 1; if (e.kind === 'skill') acc.skill[e.id]++; } };
  tally(R.events);
  let steps = 0;
  while (R.finished < R.runners.length && steps < 30000) { tally(stepRace(R, 1 / 15)); steps++; }
  acc.steps += steps;
  acc.races++;
  const rs = R.runners;
  const win = rs.find((r) => r.place === 1);
  acc.styleWins[win.genes.style][0]++;
  for (const r of rs) acc.styleWins[r.genes.style][1]++;
  acc.laneWins[rs.indexOf(win)]++;
  // does the runner with the field's best X win more than 1 in FIELD?
  for (const k of STAT_KEYS) {
    const best = rs.reduce((a, b) => (a.st[k] >= b.st[k] ? a : b));
    acc.statHi[k][0] += best === win ? 1 : 0;
    acc.statHi[k][1]++;
  }
  const fav = rs.reduce((a, b) => (statTotal(a.st) >= statTotal(b.st) ? a : b));
  if (fav === win) acc.favWin++;
  for (const r of rs) { acc.left.push(r.stam); if (r.gassed) acc.gassed++; }
  acc.time += win.time / (dist / 1000);
}
const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
const per = (k) => ((acc.ev[k] || 0) / acc.races).toFixed(2);
console.log(`${acc.races} races of ${FIELD}, dist ${DIST}: winner ${(acc.time / acc.races).toFixed(1)} s/km`);
console.log(`best-stat wins (fair = ${pct(1, FIELD)}): ${STAT_KEYS.map((k) => `${k} ${pct(...acc.statHi[k])}`).join(' · ')} · best total ${pct(acc.favWin, acc.races)}`);
console.log(`style win share vs field share: ${STYLE_KEYS.map((k) => `${k} ${pct(acc.styleWins[k][0], acc.races)} / ${pct(acc.styleWins[k][1], acc.races * FIELD)}`).join(' · ')}`);
console.log(`wins by starting lane (inside first): ${acc.laneWins.map((w) => pct(w, acc.races)).join(' ')}`);
console.log(`per race: passes ${per('pass')} (done ${per('passed')}) · late starts ${per('late')} · spot struggles ${per('struggle')} · rushed ${per('rushed')} · gassed ${per('gassed')}`);
const left = acc.left.sort((a, b) => a - b);
console.log(`stamina at the line: p10 ${left[Math.floor(left.length * 0.1)].toFixed(2)} · p50 ${left[Math.floor(left.length * 0.5)].toFixed(2)} · p90 ${left[Math.floor(left.length * 0.9)].toFixed(2)}`);
if (ALLSK) console.log(`skills fired per runner-race (the four distance skills are passive, always on): ${SKILL_IDS.filter((k) => !SKILLS[k].passive).map((k) => `${k} ${pct(acc.skill[k], acc.races * FIELD)}`).join(' · ')}`);
