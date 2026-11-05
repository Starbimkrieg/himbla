import * as THREE from 'three';
import { FACTIONS } from './locations.js';

// The small outposts' looks by owner, shared by the code builders (outpostDrafts.js) and the bake of the Blender-built ones
// (staticBake.js: the `style_<key>` materials, `only_faction` parts, the walkers' looks, the owner's container livery).

// each owner's palette: an outpost's `style_body`, `style_panel`... materials (docs/outpost-glb.md). metal: steelwork (SpaceCom's
// plain steel, the rest their panel colour); hut: a military hut's skin (SpaceCom's olive drab, the rest their body colour);
// livery, stripe: a dish head's body and stripe (the land-trains' liveries: models.js DISH_FACTIONS)
export const STYLE = {
  spacecom: { body: 0xf3eee4, panel: 0xd8d2c4, dark: 0x1b2a5a, roof: 0x3a4a78, trim: 0xffd23f, glow: 0xfff3b0, conc: 0xb8b2a6, metal: 0x55607a, hut: 0x6f7a5a, livery: 0xf2ecdc, stripe: 0xffd23f },
  vostok: { body: 0x8f8a84, panel: 0x77736e, dark: 0x3a3a34, roof: 0x55524c, trim: 0xff3b5c, glow: 0xffb27a, conc: 0x8a8680, metal: 0x77736e, hut: 0x8f8a84, livery: 0x6b6f78, stripe: 0xff3b5c },
  daedalus: { body: 0x3a3450, panel: 0x2c2740, dark: 0x1a1626, roof: 0x241f34, trim: 0xc77dff, glow: 0xd9a8ff, conc: 0x4a4560, metal: 0x2c2740, hut: 0x3a3450, livery: 0xc77dff, stripe: 0xf3eee4 },
  meridian: { body: 0xf2f4fa, panel: 0xd6dcea, dark: 0x1b3a8f, roof: 0x2a4aa0, trim: 0x2ec4ff, glow: 0xbff0ff, conc: 0xc8c2b8, metal: 0xd6dcea, hut: 0xf2f4fa, livery: 0x2ec4ff, stripe: 0xfff4e0 },
  kepler: { body: 0xfff0d8, panel: 0xe8d4b4, dark: 0x5a3a2a, roof: 0x8a4a2a, trim: 0xff9f1c, glow: 0xffe6a8, conc: 0xbcae98, metal: 0xe8d4b4, hut: 0xfff0d8, livery: 0xff9f1c, stripe: 0xfff4e0 },
  rustmoon: { body: 0x6b5a4a, panel: 0x7a4a32, dark: 0x2a2433, roof: 0x5a3a2a, trim: 0x7dff3a, glow: 0x7dff3a, conc: 0x6f6878, metal: 0x7a4a32, hut: 0x6b5a4a, livery: 0x6a5a48, stripe: 0x7dff3a },
};

// the owner read back from its faction colour (an outpost is built per colour)
const FAC_BY_COLOR = new Map(Object.entries(FACTIONS).map(([id, f]) => [new THREE.Color(f.color).getHex(), id]));
export const factionOf = (c, fallback) => FAC_BY_COLOR.get(new THREE.Color(c).getHex()) || fallback;

// The walking NPCs (outpostWalkers.js): two or three per outpost in the owner's colours, each on its own route through open yard
// (tools/outpost-audit.mjs checks no route runs through a collider). Troopers for the military, traders, farmhands and clan
// riggers for the rest; junk bots at a junk pile.
export const WALK_LOOK = {
  spacecom: { kind: 'soldier', suit: 0x2a3a6b, helmet: 0xf3eee4 },
  vostok: { kind: 'soldier', suit: 0x6b6f78, helmet: 0xff3b5c },
  daedalus: { kind: 'soldier', suit: 0x3a3450, helmet: 0xc77dff },
  meridian: { look: 'trader', suit: 0x2ec4ff, helmet: 0xf2f4fa },
  kepler: { look: 'coveralls', suit: 0xff9f1c, helmet: 0xfff4e0 },
  rustmoon: { look: 'engineer', suit: 0x3a2b4f, helmet: 0x7dff3a },
};

// Container liveries (cargoStack): the owner's own; Daedalus has none and buys Meridian's; Rustmoon's are taken off everyone's
// trains, a mix of liveries box by box
export const CARGO_OF = { spacecom: ['spacecom'], vostok: ['vostok'], kepler: ['kepler'], meridian: ['meridian'], daedalus: ['meridian'], rustmoon: ['vostok', 'meridian', 'kepler', 'spacecom'] };
// a salvage stack: each box in a different looted livery (the mix turned by `turn` so stacks side by side differ)
export const looted = (turn) => { const l = CARGO_OF.rustmoon; return l.map((_, i) => l[(i + turn) % l.length]); };
