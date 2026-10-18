import { Cheats as CheatsStub } from './cheatsStub.js';

// Dev tools (dev menu, cheats, debug overlays, Asset Row, trailer director) are in every build but a release one:
// `vite build --mode release` sets __DEV_TOOLS__ false (vite.config.js), the code behind it is dropped, and the game
// gets the inert stand-in from cheatsStub.js. `npm run check:dev-strip` proves it.
export const DEV_TOOLS = typeof __DEV_TOOLS__ === 'undefined' ? true : __DEV_TOOLS__;

// game.cheats' class: the real one (cheats.js, its own chunk) with dev tools, else the stand-in.
// loadDevTools() must resolve before the Game is made (main.js).
export let Cheats = CheatsStub;
export async function loadDevTools() {
  if (!DEV_TOOLS) return;
  try { Cheats = (await import('./cheats.js')).Cheats; } catch (e) { console.warn('dev tools unavailable (their chunk would not load):', e); } // game runs without them
}
