// Asset Row catalogue: props & markers, weapons & effects, nature, secrets & the Spindle's props. Items: see index.js.
// One file per category (props-*.js); props-util.js has the helpers they share.
import markers from './props-markers.js';
import weapons from './props-weapons.js';
import nature from './props-nature.js';
import secrets from './props-secrets.js';

// (the turrets, the ILMB rocket and the mothership are shown with the vehicles and ships: vehicles.js)
const SHOWN_WITH_VEHICLES = new Set(['prop.turret', 'prop.rocket', 'spindle.mothership']);
for (const g of [markers, weapons, nature, secrets]) g.items = g.items.filter((it) => !SHOWN_WITH_VEHICLES.has(it.id));

export default [markers, weapons, nature, secrets];

/*
SKIPPED (left out of the Row on purpose)
- spindle.rock: the Spindle itself, a 5.4 km asteroid with its own world (own gravity axis, terrain worker, sky). Only its props are
  shown (lander, spires, obelisk, core shrine, extraction pad, mothership, drones).
- spindle.sky-asteroid (world.js buildSky, spindleGeometry(2000, 260, 3) 5200 m above the Monolith): an overhead sky object 2 km long.
- sky.planets-earth-sun (models.js makePlanets, world.js buildSky): a backdrop strung on a 6-7 km dome round the camera, not an
  object that can stand in a line. The Row has its own star dome.
- The Medevac craft (medevac.js): models.js makeShuttle in a Meridian livery at x0.85 (the recall shuttle); it belongs to the vehicles
  group's shuttle. Its stretcher is here (prop.stretcher).
- The Xenoglide skates (secrets.js makeXenoSkates) have no item of their own here: they stand on their pedestal inside the Fissure (and
  the characters group has runner.xenoskates).
Shown differently from the game (all noted on the items' code):
- secret.fissure: the real one is 34 m underground, cut into the terrain by a shader hole (not reproducible on the Row's flat floor): the
  game's own buildFissure is run on a stand-in, lifted 34 m (the rooms' floor on the Row's), turned to run along the row, roofs off.
  Its colliders are the real ones; the trench ramp has none (the game's floor() override does that job), so it cannot be walked up.
- Weapons have no held model: each is shown as its shot, in a looping test range, at about a quarter of the real speed (the rail
  beam is 40 m, not up to 650 m; the mortar's lob is higher and slower so it fits the range).
- prop.dish: 5 of the 8 sizes (8, 12, 18, 26, 34); 10, 14 and 30 sit between them. nature.black-lake: a flat 90 m disc with the lake
  shader (the game's follow a crater's shoreline, 40-380 m).
*/
