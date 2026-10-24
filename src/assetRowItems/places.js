// Asset Row group: places (item format: index.js). Every settlement, HQ and landmark the World builds, each on a private
// stub World (places-lib.js). w x d are measured footprints, including the floating name sign.
import { buildPlace, buildZoneWall } from './places-lib.js';
import { LOCATIONS } from '../locations.js';

const loc = (id) => LOCATIONS.find((l) => l.id === id);

// one place: id, label, w, d, build spec (places-lib buildPlace), extra item fields
const P = (id, label, w, d, spec, extra = {}) => ({ id: `places.${id}`, label, w, d, big: Math.max(w, d) > 100, make: (ctx) => buildPlace(ctx, spec), ...extra });

const CAMP = { id: 'camp0', name: 'Grimtooth Camp', short: 'CAMP', type: 'pirate', faction: 'rustmoon', camp: true, r: 55, hostile: true, dark: true };
const HOMETOWN = { id: 'hometown', name: 'Your Hometown', short: 'HOMETOWN', type: 'hometown', faction: 'kepler', r: 120, defense: { ring: 100, turrets: 2 } };

const towns = [
  P('tranq', 'TRANQUILITY COMMONS', 202, 196, { loc: 'tranq' }),
  P('aldrin', 'ALDRIN HEIGHTS', 195, 183, { loc: 'aldrin' }),
  P('kepler', 'KEPLER CIVIC CENTER', 231, 231, { loc: 'kepler' }),
  P('twilight', 'TWILIGHT WAYSTATION', 187, 183, { loc: 'twilight' }),
  P('hertz', 'HERTZSPRUNG REFUGE', 216, 207, { loc: 'hertz' }),
  P('hometown', 'HOMETOWN (8 BUILDINGS)', 202, 191, { base: HOMETOWN, over: { slots: ['housing', 'market', 'clinic', 'farm', 'motorpool', 'barracks', 'roads', 'radio'] } }),
  P('hometown.new', 'HOMETOWN (EMPTY PLOTS)', 202, 189, { base: HOMETOWN, over: { slots: [] } }),
];
const hq = [
  P('ilmb', 'INTERNATIONAL MOON BASE', 502, 502, { loc: 'ilmb' }),
  P('ilmb.lawless', 'ILMB (RUSTMOON TAKEOVER)', 502, 502, { loc: 'ilmb', over: { lawless: true } }),
  P('meridian', 'MERIDIAN EXCHANGE', 251, 280, { loc: 'meridian' }),
];
const science = [
  P('shackleton', 'SHACKLETON RADAR ARRAY', 225, 229, { loc: 'shackleton' }),
  P('farside', 'FARSIDE LISTENING POST', 226, 234, { loc: 'farside' }),
  P('mine', 'HELIUM-3 EXCHANGE', 192, 153, { loc: 'mine' }),
  P('antimatter', 'ANTIMATTER LAB', 124, 83, { loc: 'antimatter' }, { big: false }),
  P('monolith', 'THE MONOLITH', 74, 78, { loc: 'monolith' }),
];
const military = [
  P('vostok', 'BASTION VOSTOK-9', 195, 199, { loc: 'vostok' }),
  P('vostok4', 'VOSTOK-4 OUTPOST', 114, 127, { loc: 'vostok4' }),
  P('daedalus', 'DAEDALUS CITADEL', 264, 253, { loc: 'daedalus' }),
  P('daedalus2', 'DAEDALUS FORWARD POST', 168, 162, { loc: 'daedalus2' }),
  P('daedalus2.blacksun', 'FORWARD POST + BLACK SUN', 168, 162, { loc: 'daedalus2', over: { blackSun: true } }),
];
const pirates = [
  P('gulch', 'SCRAPJAW GULCH', 170, 181, { loc: 'gulch' }),
  P('blackrock', 'BLACKROCK DEN', 163, 181, { loc: 'blackrock' }),
  P('gloom', 'GLOOM HARBOR', 163, 181, { loc: 'gloom' }),
  P('rustmoon', 'RUSTMOON HOLD', 196, 191, { loc: 'rustmoon' }),
  P('rustmoon.ruin', 'RUSTMOON HOLD (RUIN)', 248, 238, { loc: 'rustmoon', over: { type: 'ruin', faction: 'spacecom' } }),
  P('camp', 'GRIMTOOTH CAMP', 77, 60, { base: CAMP }),
  P('camp.ruin', 'PIRATE CAMP (ABANDONED)', 128, 124, { base: CAMP, over: { type: 'ruin', faction: 'none', small: true, hostile: false } }, { big: false }),
];
const fun = [
  P('casino', 'LUCKY CRATER CASINO', 152, 174, { loc: 'casino' }),
  P('downs', 'CHIMERA DOWNS', 470, 345, { loc: 'downs', race: true, yaw: Math.PI }),
];

const zones = [
  // last on the row: its 170 m red cylinder would tint its neighbours
  { id: 'places.zonewall', label: 'ZONE WALL (R260)', w: 520, d: 520, big: true, solid: false, make: () => buildZoneWall(260) },
];

export default [
  { id: 'places.hq', title: '13 · PLACES · HEADQUARTERS', items: hq },
  { id: 'places.towns', title: '13 · PLACES · TOWNS', items: towns },
  { id: 'places.science', title: '13 · PLACES · SCIENCE', items: science },
  { id: 'places.military', title: '13 · PLACES · MILITARY', items: military },
  { id: 'places.pirates', title: '13 · PLACES · PIRATES', items: pirates },
  { id: 'places.fun', title: '13 · PLACES · FUN', items: fun },
  { id: 'places.zones', title: '13 · PLACES · ZONES', items: zones },
];

/* SKIPPED
 - Whispering Fissure (LOCATIONS 'fissure', type 'tunnel'): a trench, spindle/terrain content; buildLocation has no case for it.
 - Meridian launch complex by the Monolith (loc.launchPad): needs the Moon's tilt; same model as the 'launch' story prop.
*/
