import { ensureStats } from './chimerastats.js';
import { makeChimera } from './chimerabuild.js';
import { CHIMERA_DRAWN } from './chimeragenes.js';

// Chimeras: splicing is chimeragenes.js, racing chimerastats.js, and the models chimerabuild.js (from the Blender kit, chimera.glb).
export { LIVING, MODIFIERS, PALETTE, spliceGenes } from './chimeragenes.js';
export { ensureStats, makeChimera };

export const DRAWN = CHIMERA_DRAWN;

// Small wild critter of the sunlit craters.
export function makeMite() {
  const genes = { seed: Math.floor(Math.random() * 1e9), body: 'mite', legs: 'mite', head: 'mite', extraHead: null, mods: [], size: 0.8, tint: 0xb8e986 };
  return makeChimera(genes);
}
