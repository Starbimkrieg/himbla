import { Cheats as CheatsStub } from './cheatsStub.js';

// Dev tools (the hidden dev menu, the cheat menu, the debug overlays, the Asset Row showroom, the trailer director) are in
// every build except a release one: `vite build --mode release` (the desktop downloads) sets __DEV_TOOLS__ to false
// (vite.config.js), the code behind the check below is dropped from the bundle, and the game gets the inert stand-in
// from cheatsStub.js. `npm run check:dev-strip` proves it on a real release build.
export const DEV_TOOLS = typeof __DEV_TOOLS__ === 'undefined' ? true : __DEV_TOOLS__;

// The class the game builds as game.cheats: the real one (cheats.js, fetched as its own chunk) with dev tools, else the stand-in.
// loadDevTools() has to have resolved before the Game is made (main.js).
export let Cheats = CheatsStub;
export async function loadDevTools() {
  if (!DEV_TOOLS) return;
  try { Cheats = (await import('./cheats.js')).Cheats; } catch (e) { console.warn('dev tools unavailable (their chunk would not load):', e); } // (the game then runs without them)
}
