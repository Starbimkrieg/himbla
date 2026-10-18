// Asset Row catalogue: props & markers, weapons & effects, nature, secrets & the Spindle's props. Items: see index.js.
// One file per category (props-*.js); props-util.js has the helpers they share.
import markers from './props-markers.js';
import weapons from './props-weapons.js';
import nature from './props-nature.js';
import secrets from './props-secrets.js';

// shown with the vehicles instead (vehicles.js)
const SHOWN_WITH_VEHICLES = new Set(['prop.turret', 'prop.rocket', 'spindle.mothership']);
for (const g of [markers, weapons, nature, secrets]) g.items = g.items.filter((it) => !SHOWN_WITH_VEHICLES.has(it.id));

export default [markers, weapons, nature, secrets];

/*
SKIPPED on purpose
- spindle.rock: the 5.4 km Spindle asteroid is its own world (gravity axis, terrain worker, sky); only its props are shown.
- spindle.sky-asteroid (world.js buildSky, spindleGeometry(2000, 260, 3) 5200 m above the Monolith): a 2 km sky object.
- sky.planets-earth-sun (models.js makePlanets, world.js buildSky): a backdrop on a 6-7 km dome round the camera. The Row has its own star dome.
- Medevac craft (medevac.js): makeShuttle in Meridian livery at x0.85, covered by the vehicles group's shuttle. Its stretcher is here (prop.stretcher).
- Xenoglide skates (secrets.js makeXenoSkates): on their pedestal inside the Fissure (and characters has runner.xenoskates).
Shown differently from the game (noted on the items' code):
- secret.fissure: the real one is 34 m underground behind a terrain shader hole. Here buildFissure runs on a stand-in, lifted 34 m,
  turned along the row, roofs off. Real colliders; the trench ramp has none (the game's floor() override does it), so it can't be walked up.
- Weapons have no held model: each is its shot in a looping test range at about quarter speed (rail beam 40 m, not up to 650 m;
  the mortar lobs higher and slower to fit).
- prop.dish: 5 of the 8 sizes (8, 12, 18, 26, 34). nature.black-lake: a flat 90 m disc with the lake shader (the game's follow a
  crater shoreline, 40-380 m).
*/
