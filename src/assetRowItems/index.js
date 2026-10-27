// The Asset Row's catalogue (assetRow.js): the game's assets, in row order.
//
// A GROUP is { id, title, items: [item, ...] }: one section of the row with its own board (a group file exports one group,
// or an array of them, one per category). An ITEM is
//
//   id      'group.name'      unique
//   label   'NAME BOARD'      board text (short, upper case)
//   w, d    metres            footprint along the row (x) and across it (z); the layout uses these before anything is built,
//                             so they must be right to within a few metres (tools/asset-row-check.mjs compares them)
//   big     true              a place wider than 100 m: stands in lane B instead of lane A
//   solid   false             no colliders at all (default: the item's own `cols`, or one box round what it built)
//   labelH, labelZ  metres    name board height, and its distance in front of the footprint (the default board is big;
//                             a small low item can shrink it and push it aside)
//   make(ctx)                 builds it: ctx = { game, moon } (moon: the Moon's planet, for its look). Returns
//                               { root,            an Object3D standing on y = 0, with an IDENTITY transform of its own
//                                 cols?,           colliders in root's frame (empty array = none): [{ type: 'box'|'cyl'|'sphere', ... }] as
//                                                  outpostTemplate gives them (box: x y z hx hy hz yaw; cyl: x z y0 y1 r;
//                                                  sphere: x y z r); a box may carry its whole frame instead of a yaw (ax ay az: unit
//                                                  axes, for a tilted one) and a `rail`: index into `rails` of its grind rail
//                                 rails?,          grind rails (rails.js): [[Vector3, ...], ...], a crest line in root's
//                                                  frame; placed in the flat world while the item is built, so it grinds like the Moon's
//                                 update?(dt, t),  called every frame while built (spinner, blinker, lifted gear); one that throws is switched off
//                                 dispose?() }     anything beyond the geometry and materials under root
//                             Called each time you come near (let go when you walk off), so it must be repeatable and
//                             must not touch the Moon, the player or the game's registries.
//
// An item that fails to build shows a red "DID NOT BUILD" board, so one bad factory never stops the row.
import characters from './characters.js';
import props from './props.js';
import vehicles from './vehicles.js';
import buildings from './buildings.js';
import downs from './downs.js';
import places from './places.js';

// small things first so the row's first stretch is cheap and dense; places (biggest, heaviest) last
export const GROUPS = [characters, props, vehicles, buildings, downs, places].flat();
