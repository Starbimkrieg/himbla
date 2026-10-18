// The Asset Row's catalogue (assetRow.js): the game's assets, in the order they stand along the row.
//
// A GROUP is { id, title, items: [item, ...] }: one section of the row, with its own board (a group file's default export is
// one group, or an array of them: one per category). An ITEM is
//
//   id      'group.name'      unique
//   label   'NAME BOARD'      what the board says (short, upper case)
//   w, d    metres            footprint along the row (x) and across it (z); the layout is worked out from these before
//                             anything is built, so they must be right to within a few metres (the checks compare them
//                             with what is really built, tools/asset-row-check.mjs)
//   big     true              a place wider than 100 m: stands in lane B instead of lane A
//   solid   false             no colliders at all (the default: the item's own `cols`, or one box round what it built)
//   labelH, labelZ  metres    the name board's height, and its distance in front of the footprint (the default board is big: a small
//                             low item can shrink it and push it out of the way)
//   make(ctx)                 builds it: ctx = { game, moon } (moon: the Moon's planet, for what needs its look). Returns
//                               { root,            an Object3D standing on y = 0, with an IDENTITY transform of its own
//                                 cols?,           colliders in root's frame (an empty array = none, e.g. a line of figures): [{ type: 'box'|'cyl'|'sphere', ... }] as
//                                                  outpostTemplate gives them (box: x y z hx hy hz yaw; cyl: x z y0 y1 r;
//                                                  sphere: x y z r); a box may carry its whole frame instead of a yaw (ax ay az: unit axes, for a tilted
//                                                  one) and a `rail`: the index into `rails` of the grind rail it belongs to
//                                 rails?,          grind rails (rails.js): [[Vector3, ...], ...], the crest line of each snake rock in root's frame; they stand
//                                                  in the flat world while the item is built, so the rock can be ground like the Moon's
//                                 update?(dt, t),  called every frame while it is built (a spinner, a blinker, a lifted gear); one that throws is switched off
//                                 dispose?() }     anything beyond the geometry and materials under root
//                             and is called each time you come near it (it is let go of when you walk off), so it must be
//                             repeatable and must not touch the Moon, the player or the game's registries.
//
// An item that cannot be built is shown as a red "DID NOT BUILD" board, so one bad factory never stops the row.
import characters from './characters.js';
import props from './props.js';
import vehicles from './vehicles.js';
import buildings from './buildings.js';
import downs from './downs.js';
import places from './places.js';

// (small things first, so the first stretch of the row is cheap and dense; the places, the biggest and heaviest, last)
export const GROUPS = [characters, props, vehicles, buildings, downs, places].flat();
