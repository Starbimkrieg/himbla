import { mulberry32 } from './rng.js';
import { ensureStats } from './chimerastats.js';

// Splicing: what comes out of the reactor, as a gene sheet (no three.js, so tools/race-sim.mjs can breed fields headless).
// chimera.js builds the model from the sheet.

// Chimeras are drawn at this fraction of their gene size (a field of six fits the gate's 3 m stalls; the race model's widths match).
export const CHIMERA_DRAWN = 0.95;

// Things with bodies. Two or more of these in the reactor make a Chimera.
export const LIVING = ['person', 'voidling', 'mite', 'car', 'pirate', 'sapling', 'junkbot', 'alien'];
// Things that only mutate whatever they get spliced into.
export const MODIFIERS = { water: 'void', rock: 'crystal', slickrock: 'crystal', dirt: 'mud', mud: 'mud', wiring: 'spark', engine: 'turbo', lens: 'lens', transponder: 'radio', plating: 'armor' };

export const PALETTE = {
  person: [0xff9f1c, 0x2ec4ff, 0xffd23f, 0x7dff6a],
  voidling: [0xc77dff, 0x7b2ff7],
  mite: [0xb8e986, 0xd8d0c4, 0x9be7ff],
  car: [0xff7ad9, 0x2ec4ff, 0x7dff6a, 0xffd23f],
  pirate: [0x3a2b4f, 0x5a3a5a],
  sapling: [0x5fbf4a, 0x8fd16a, 0x3f9a3a],
  junkbot: [0xffb347, 0x9aa7bb, 0x55607a],
  alien: [0x7dd87a, 0x5fc9b8, 0xb59cff, 0xc9f27a],
};
const SYLL = { car: 'Vroom', mite: 'Skitter', pirate: 'Grit', sapling: 'Sprout', junkbot: 'Bolt', alien: 'Zorp' };
const EPITHET = { void: 'the Unholy', crystal: 'the Crystalline', mud: 'of the Mud', spark: 'the Electric', turbo: 'the Turbocharged', lens: 'the All-Seeing', radio: 'the Broadcaster', armor: 'the Ironclad' };

// Mix the parents into a gene sheet: which body, legs and head; mutations; stats; a name.
// Body, legs and head are each drawn from the living parents at random (the order they went in counts for nothing), and when the
// parents are of two or more kinds the three parts always come from at least two of them: a chimera is never one creature.
export function spliceGenes(items, seed = Math.floor(Math.random() * 1e9)) {
  const rr = mulberry32(seed);
  const living = items.filter((i) => LIVING.includes(i.kind));
  const mods = [...new Set(items.map((i) => MODIFIERS[i.kind]).filter(Boolean))];
  const draw = () => living[Math.floor(rr() * living.length)];
  const kinds = new Set(living.map((i) => i.kind));
  let bodyI = draw(), legsI = draw(), headI = draw();
  if (kinds.size > 1) {
    for (let k = 0; k < 12 && bodyI.kind === legsI.kind && legsI.kind === headI.kind; k++) { legsI = draw(); headI = draw(); }
    if (bodyI.kind === legsI.kind && legsI.kind === headI.kind) legsI = living.find((i) => i.kind !== bodyI.kind);
  }
  const body = bodyI.kind, legs = legsI.kind, head = headI.kind;
  const extraHead = rr() < 0.15 + 0.12 * kinds.size ? draw().kind : null;
  const size = 0.75 + rr() * 0.7;
  const tint = PALETTE[body][Math.floor(rr() * PALETTE[body].length)];
  const nameOf = (i) => i.name || SYLL[i.kind] || 'Blob';
  // named after its two biggest parts: the body's parent first, then the legs'
  const a = nameOf(bodyI), b = nameOf(legsI.kind !== body ? legsI : headI.kind !== body ? headI : living[living.length - 1]);
  let name = a.replace(/^Little /, '').slice(0, Math.max(2, Math.ceil(a.length / 2))) + b.replace(/^Little /, '').slice(Math.floor(b.length / 2)).toLowerCase();
  if (living.length === 1) name = `Mutant ${a}`;
  if (mods.length) name += ' ' + EPITHET[mods[0]];
  // the people's outfits, as they were scooped up (the first of each kind's): the chimera wears them
  const looks = {};
  for (const i of living) if (i.outfit && !looks[i.kind]) looks[i.kind] = i.outfit;
  const chaos = kinds.size + mods.length + (extraHead ? 1 : 0) + (mods.includes('void') ? 1 : 0);
  // racing stats (speed / power / stamina / wit), growth, running style, tier and top speed come from the parts + seed
  return ensureStats({ seed, body, legs, head, extraHead, mods, size, tint, name, looks, speed: 0, hop: legs === 'mite' ? 1 : 0.3, chaos, parents: living.map((i) => i.kind), born: Date.now() });
}
