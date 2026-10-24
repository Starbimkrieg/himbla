// Chimera racing skills: what each one does and when it can fire, and the roll that teaches one after a win. No three.js in
// here: the race model (chimerastats.js) applies them, and tools/race-sim.mjs runs them headless.
//
// A triggered skill gets one wit roll per chance (activationChance) and fires at most once a race. Single-chance skills (the
// start, halfway, the home straight) get one roll; the others (every bend, every pass, each second of the Chimera Soul window)
// keep rolling until they fire. Nothing fires while a runner is Rushed. The four distance skills are passive: always on in their
// own distance, no roll.
//
// Effects: speed / accel are fractions added to top speed / acceleration while the skill lasts (`dur` seconds, Infinity = to the
// line); `odds` scales the wit roll (Chimera Soul rolls every second, so each roll is a long shot); drain scales stamina use; stamina is a refill; laneSpeed speeds the move to the rail; pass makes a pass succeed for free.

export const SKILLS = {
  sprinter: { name: "SPRINTER'S INSTINCT", short: 'SPRINT', passive: 'SPRINT', fx: { speed: 0.03, accel: 0.1 }, blurb: 'Sprints (450-850 m): +3% top speed, +10% acceleration.' },
  miler: { name: "MILER'S RHYTHM", short: 'MILE', passive: 'MILE', fx: { speed: 0.02, drain: -0.08 }, blurb: 'Miles (1000-1800 m): +2% top speed, 8% less stamina used.' },
  stakes: { name: 'STAKES SAVVY', short: 'MEDIUM', passive: 'MEDIUM', fx: { drain: -0.12, lateSpeed: 0.03 }, blurb: 'Medium races (2000-2800 m): 12% less stamina used, +3% speed in the last third.' },
  marathon: { name: 'MARATHON HEART', short: 'LONG', passive: 'LONG', fx: { drain: -0.18, floor: 0.82 }, blurb: 'Long races (3000-3600 m): 18% less stamina used, and fades less once the tank is empty.' },
  gateBurst: { name: 'GATE BURST', short: 'GATE', on: 'start', once: true, fx: { accel: 0.4, dur: 3 }, blurb: 'At the start: never misses the break, +40% acceleration for 3 s.' },
  railHugger: { name: 'RAIL HUGGER', short: 'RAIL', on: 'bend', fx: { speed: 0.05, laneSpeed: 0.8, dur: 5 }, blurb: 'Entering a bend: dives for the rail, +5% speed for 5 s. Rolls at every bend until it fires.' },
  slipstream: { name: 'SLIPSTREAM', short: 'SLIP', on: 'pass', fx: { speed: 0.04, pass: true, dur: 3 }, blurb: 'Starting a pass: the pass costs no extra stamina and needs no wit check, +4% speed. Rolls at every pass until it fires.' },
  secondWind: { name: 'SECOND WIND', short: 'WIND', on: 'half', once: true, fx: { stamina: 0.2 }, blurb: 'At halfway: gets back 20% of its stamina, which the final sprint turns into speed.' },
  homeStretch: { name: 'HOME STRETCH', short: 'HOME', on: 'straight', once: true, fx: { speed: 0.08, accel: 0.25, dur: 5 }, blurb: 'Into the final straight: +8% speed and +25% acceleration for 5 s.' },
  chimeraSoul: { name: 'CHIMERA SOUL', short: 'SOUL', on: 'soul', rare: true, odds: 0.35, fx: { speed: 0.15, accel: 0.6, dur: Infinity }, blurb: 'Rare. Between 80% and 90% of the race: +15% speed and +60% acceleration all the way to the line. Rolls each second until it fires.' },
};
export const SKILL_IDS = Object.keys(SKILLS);
export const DIST_SKILL = { SPRINT: 'sprinter', MILE: 'miler', MEDIUM: 'stakes', LONG: 'marathon' };

// one wit roll: 37% at wit 30, 60% at 60, 82% at 90
export const activationChance = (wit) => Math.min(0.9, 0.15 + 0.0075 * wit);

// The chance a win teaches a skill, and Chimera Soul's share of it, by the race's section (tournaments always teach one).
export const LEARN = {
  easy: { p: 0.3, soul: 0 },
  medium: { p: 0.45, soul: 0.03 },
  hard: { p: 0.6, soul: 0.08 },
  tournament: { p: 1, soul: 0.15 },
};

// What a race can teach: its own distance skill weighs most; the others lean on the race (a sprint teaches the break, a long one
// the second wind, a race with many bends the rail).
export function skillPool(cat, dist) {
  const bends = Math.max(1, Math.round(dist / 353));     // (about one bend per 353 m of the 706 m oval)
  return {
    [DIST_SKILL[cat]]: 5,
    gateBurst: cat === 'SPRINT' ? 3 : 1,
    railHugger: 1 + bends * 0.5,
    slipstream: 2,
    secondWind: cat === 'LONG' ? 3 : cat === 'MEDIUM' ? 2 : 1,
    homeStretch: 2,
  };
}

// After a win: maybe learn a skill. Returns the skill id learned (and adds it to genes.skills), or null. A skill it already knows is
// re-rolled among the ones it doesn't; one that knows them all learns nothing.
export function rollSkill(genes, section, cat, dist, rnd = Math.random) {
  const L = LEARN[section] || LEARN.easy;
  const known = new Set(genes.skills || []);
  if (rnd() >= L.p) return null;
  let id = null;
  if (L.soul && !known.has('chimeraSoul') && rnd() < L.soul) id = 'chimeraSoul';
  else {
    const pool = Object.entries(skillPool(cat, dist)).filter(([k]) => !known.has(k));
    let tot = 0;
    for (const [, w] of pool) tot += w;
    let x = rnd() * tot;
    for (const [k, w] of pool) { x -= w; if (x <= 0) { id = k; break; } }
    if (!id && pool.length) id = pool[pool.length - 1][0];
  }
  if (!id) return null;
  genes.skills = [...known, id];
  return id;
}
