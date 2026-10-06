// Static data for the lunar frontier. Positions are (theta, phi) in degrees relative to the
// sub-solar point: theta < 90 is the lit near side, theta > 90 the dark side.
export const FACTIONS = {
  spacecom: {
    name: 'SPACECOM', color: '#ffd23f', hq: 'ilmb', kind: 'International Moon Force',
    blurb: 'The International Moon Force. Military, civilian and research under one flag — and the biggest guns on the Moon.',
  },
  vostok: {
    name: 'Vostok', color: '#ff3b5c', hq: 'vostok', kind: 'Military (Bases 1–9)', enemy: 'daedalus',
    blurb: 'A chain of nine hard-line military bases. At open war with Daedalus.',
  },
  meridian: {
    name: 'Meridian', color: '#2ec4ff', hq: 'meridian', kind: 'Trade & Research',
    blurb: 'Merchants and scientists. If it can be shipped, sold or measured, Meridian has a contract for it.',
  },
  kepler: {
    name: 'Kepler Settlements', color: '#ff9f1c', hq: 'kepler', kind: 'Civilian Governments',
    blurb: 'The elected councils of the lunar towns. Families, farms and a lot of paperwork.',
  },
  daedalus: {
    name: 'Daedalus', color: '#c77dff', hq: 'daedalus', kind: 'Military (Dark Side)', enemy: 'vostok',
    blurb: 'A secretive dark-side military power dug into the far side. At open war with Vostok.',
  },
  none: {
    name: 'Unaffiliated', color: '#c9c3d9', kind: 'Independent', hidden: true,
    blurb: 'Nobody claims these places. Possibly for good reason.',
  },
  rustmoon: {
    name: 'Rustmoon', color: '#7dff3a', hq: 'rustmoon', kind: 'Pirate Clans', hidden: true,
    blurb: 'The pirate clans of the dark side. They remember who helped them — and who didn\'t.',
  },
};

export const LOCATIONS = [
  {
    id: 'ilmb', name: 'International Moon Base', short: 'ILMB', type: 'hub', faction: 'spacecom', hq: true,
    theta: 45, phi: 0, r: 280, jobs: ['spacecom', 'spacecom', 'meridian', 'kepler', 'vostok'], safe: true, repair: 14,
    defense: { ring: 240, turrets: 10, inner: 4, patrols: 3 },
    blurb: 'SPACECOM headquarters: the largest, most heavily defended place on the Moon.',
  },
  {
    id: 'tranq', name: 'Tranquility Commons', short: 'TRANQ', type: 'civilian', faction: 'kepler',
    theta: 33, phi: 48, r: 130, jobs: ['kepler', 'kepler'], safe: true, repair: 8, defense: { ring: 100, turrets: 2 },
    blurb: 'Family habitat domes. Kids, gardens, and the best noodle bar on the Moon.',
  },
  {
    id: 'aldrin', name: 'Aldrin Heights', short: 'ALDRIN', type: 'civilian', faction: 'kepler',
    theta: 63, phi: -32, r: 115, jobs: ['kepler', 'meridian'], safe: true, repair: 8, defense: { ring: 95, turrets: 2 },
    blurb: 'Hillside settlement for observatory crews and their families.',
  },
  {
    id: 'shackleton', name: 'Shackleton Radar Array', short: 'SHACK', type: 'research', faction: 'meridian',
    theta: 76, phi: 34, r: 140, jobs: ['meridian', 'meridian'], safe: true, repair: 4, defense: { ring: 110, turrets: 2 },
    blurb: 'Meridian deep-space radar dishes on the edge of the light.',
  },
  {
    id: 'kepler', name: 'Kepler Civic Center', short: 'KEPLER', type: 'civilian', faction: 'kepler', hq: true,
    theta: 24, phi: -75, r: 140, jobs: ['kepler', 'kepler', 'spacecom'], safe: true, repair: 10, defense: { ring: 115, turrets: 4 },
    blurb: 'Seat of the Kepler councils: town hall, greenhouses and a very long queue.',
  },
  {
    id: 'mine', name: 'Helium-3 Exchange', short: 'HE3', type: 'industrial', faction: 'meridian',
    theta: 56, phi: 82, r: 110, jobs: ['meridian'], safe: true, repair: 4, defense: { ring: 95, turrets: 2 },
    blurb: 'Meridian strip-mine and commodity exchange. Volatile canisters, volatile prices.',
  },
  {
    id: 'meridian', name: 'Meridian Exchange', short: 'MERIDIAN', type: 'trade', faction: 'meridian', hq: true,
    theta: 18, phi: 25, r: 150, jobs: ['meridian', 'meridian', 'kepler'], safe: true, repair: 8, defense: { ring: 125, turrets: 4 },
    blurb: 'Meridian headquarters: warehouses, cranes, labs and a trading floor that never sleeps.',
  },
  {
    id: 'vostok', name: 'Bastion Vostok-9', short: 'VOSTOK-9', type: 'military', faction: 'vostok', hq: true,
    theta: 72, phi: 125, r: 140, zoneR: 380, restricted: true, jobs: ['vostok', 'vostok'],
    blurb: 'Vostok command bastion. Do not linger without clearance.',
  },
  {
    id: 'vostok4', name: 'Vostok-4 Outpost', short: 'VOSTOK-4', type: 'military', faction: 'vostok', small: true,
    theta: 98, phi: 150, r: 80, zoneR: 260, restricted: true,
    blurb: 'Vostok forward artillery post, glaring across the terminator at Daedalus.',
  },
  {
    id: 'twilight', name: 'Twilight Waystation', short: 'TWILIGHT', type: 'civilian', faction: 'kepler',
    theta: 93, phi: -8, r: 110, jobs: ['kepler', 'meridian', 'spacecom'], safe: true, repair: 10, defense: { ring: 90, turrets: 2 },
    blurb: 'Last lights before the dark side. Charge your lamp and say your prayers.',
  },
  {
    id: 'farside', name: 'Farside Listening Post', short: 'FARSIDE', type: 'research', faction: 'spacecom',
    theta: 128, phi: 12, r: 115, jobs: ['spacecom', 'meridian', 'daedalus'], safe: true, repair: 4, dark: true, defense: { ring: 95, turrets: 3 },
    blurb: 'SPACECOM radio-quiet observatory. No Earth chatter — just pirates.',
  },
  {
    id: 'hertz', name: 'Hertzsprung Refuge', short: 'HERTZ', type: 'civilian', faction: 'kepler',
    theta: 140, phi: -82, r: 110, jobs: ['kepler', 'kepler'], safe: true, repair: 6, dark: true, defense: { ring: 90, turrets: 2 },
    blurb: 'A huddle of Kepler domes for people who wanted to be very, very far away.',
  },
  {
    id: 'daedalus', name: 'Daedalus Citadel', short: 'DAEDALUS', type: 'military', faction: 'daedalus', hq: true,
    theta: 155, phi: 105, r: 140, zoneR: 380, restricted: true, dark: true, jobs: ['daedalus', 'daedalus'],
    blurb: 'Daedalus command citadel, buried in the deepest dark.',
  },
  {
    id: 'daedalus2', name: 'Daedalus Forward Post', short: 'DAED-FWD', type: 'military', faction: 'daedalus', small: true,
    theta: 118, phi: 95, r: 80, zoneR: 260, restricted: true, dark: true,
    blurb: 'Daedalus listening bunker pointed straight at Vostok.',
  },
  {
    id: 'antimatter', name: 'Antimatter Research Lab', short: 'ANTIMATTER', type: 'lab', faction: 'none', poi: true,
    theta: 40, phi: -125, r: 120, safe: true, repair: 4,
    blurb: 'Dr. Zbornak\'s private lab. There is a very large, very unstable reactor inside. Bring him things.',
  },
  {
    id: 'monolith', name: 'The Monolith', short: 'MONOLITH', type: 'monolith', faction: 'none', poi: true,
    theta: 62, phi: -95, r: 60,
    blurb: 'A perfectly black slab nobody admits to building. It hums when you get close.',
  },
  {
    id: 'bounce', name: 'Bounce Dome Funpark', short: 'BOUNCE', type: 'funpark', faction: 'none', poi: true,
    theta: 30, phi: 135, r: 110, safe: true, repair: 6,
    blurb: 'Abandoned inflatable theme park. The domes still hold air. Great for tricks.',
  },
  {
    id: 'gulch', name: 'Scrapjaw Gulch', short: 'GULCH', type: 'pirate', faction: 'rustmoon',
    theta: 116, phi: -42, r: 120, hostile: true, dark: true,
    blurb: 'Pirate scrapyard. Stolen cargo ends up here.',
  },
  {
    id: 'blackrock', name: 'Blackrock Den', short: 'BLACKROCK', type: 'pirate', faction: 'rustmoon',
    theta: 152, phi: -140, r: 110, hostile: true, dark: true,
    blurb: 'Pirate warren carved into a crater wall.',
  },
  {
    id: 'gloom', name: 'Gloom Harbor', short: 'GLOOM', type: 'pirate', faction: 'rustmoon',
    theta: 165, phi: 30, r: 110, hostile: true, dark: true,
    blurb: 'Smugglers\' landing field at the darkest point on the Moon.',
  },
  {
    id: 'rustmoon', name: 'Rustmoon Hold', short: 'RUSTMOON', type: 'pirate', faction: 'rustmoon', hq: true,
    theta: 122, phi: 168, r: 130, hostile: true, dark: true, jobs: ['rustmoon', 'rustmoon'],
    blurb: 'Seat of the Rustmoon clans. A ring of wrecked ships and bad intentions.',
  },
];

export const CARGO = [
  { name: 'Medical Supplies', fragile: 0.5, hot: 1, color: 0xff3b5c },
  { name: 'Family Care Package', fragile: 0.3, hot: 0, color: 0xff9f1c },
  { name: 'Cryo-Sample Case', fragile: 1.0, hot: 1, color: 0x9be7ff },
  { name: 'Helium-3 Canister', fragile: 0.7, hot: 3, color: 0x7dff6a },
  { name: 'Radar Calibration Core', fragile: 0.8, hot: 2, color: 0xc77dff },
  { name: 'Spare Reactor Coil', fragile: 0.4, hot: 2, color: 0xffd23f },
  { name: 'Low-G Birthday Cake', fragile: 1.0, hot: 0, color: 0xff7ad9 },
  { name: 'Bio-Lab Spore Culture', fragile: 0.9, hot: 1, color: 0x6aff9e },
  { name: 'Water Ice Cores', fragile: 0.2, hot: 1, color: 0x2ec4ff },
  { name: 'Mail Sack', fragile: 0.1, hot: 0, color: 0xfff4e0 },
  { name: 'Lamp Batteries', fragile: 0.3, hot: 1, color: 0xfff6a8 },
];

export const MIL_CARGO = [
  { name: 'Encrypted Diplomatic Pouch', fragile: 0.2, hot: 2, color: 0x2b2b2b },
  { name: 'Weapons Telemetry Drive', fragile: 0.5, hot: 3, color: 0xff3b5c },
  { name: 'Ration Crate', fragile: 0.1, hot: 1, color: 0x8ac926 },
];

export const CLIENTS = {
  spacecom: ['Dispatcher Okafor', 'Quartermaster Lindqvist', 'Commander Ruiz'],
  vostok: ['Commissar Tanaka', 'Colonel Volkova'],
  meridian: ['Broker Adeyemi', 'Dr. Abernathy', 'Prof. Nakamura-Webb'],
  kepler: ['Auntie Mbeki', 'Little Juno (age 9)', 'Mayor Castellanos', 'Noodle-bar Kenji'],
  daedalus: ['Marshal Okonkwo', 'Agent Seven'],
  rustmoon: ['One-Eyed Imelda', 'Captain Grit', 'Scrapjaw Sal'],
};

// Reputation tiers. Contract pay scales with tier; faction gear unlocks by tier.
export const TIERS = [
  { min: -Infinity, name: 'HOSTILE', color: '#ff2a4a', pay: 0 },
  { min: -20, name: 'WARY', color: '#ff9f1c', pay: 0.8 },
  { min: 0, name: 'NEUTRAL', color: '#c9c3d9', pay: 1 },
  { min: 10, name: 'FRIENDLY', color: '#7dff6a', pay: 1.4 },
  { min: 25, name: 'TRUSTED', color: '#2ec4ff', pay: 1.85 },
  { min: 50, name: 'HONORED', color: '#ffd23f', pay: 2.4 },
];

// Faction gear sold at each headquarters; each level needs a higher reputation.
import { cosmeticShopItems } from './cosmetics.js';

export const SHOPS = {
  ilmb: [
    { key: 'capacitor', name: 'Flux Capacitor', desc: '+25 thruster energy', cost: 600, max: 3 },
    { key: 'armor', name: 'Ablative Suit Plating', desc: '+25 max health', cost: 550, max: 3 },
    { key: 'dampers', name: 'Mag-Cushion Dampers', desc: 'Safer hard landings, less cargo jostle', cost: 650, max: 3 },
    { key: 'spinner', name: 'Weapon Tuning Kit', desc: '+30% damage for every weapon', cost: 750, max: 3 },
    { key: 'scanner', name: 'Threat Scanner', desc: 'Look at pirates to mark them with a red outline; warns of inbound squads', cost: 700, max: 2 },
    { key: 'seeker', name: 'SPACECOM Seeker Module', desc: 'Pulse discs home in harder on targets', cost: 800, max: 3, faction: 'spacecom', req: [0, 10, 25] },
  ],
  meridian: [
    { key: 'gyro', name: 'Meridian Gyro-Edges', desc: 'Sharper ground steering on skates', cost: 700, max: 3, faction: 'meridian', req: [0, 10, 25] },
  ],
  kepler: [
    { key: 'cradle', name: 'Kepler Cargo Cradle', desc: 'Cargo, tubes, jars & tools take 30% less damage', cost: 600, max: 3, faction: 'kepler', req: [0, 10, 25] },
  ],
  vostok: [
    { key: 'scatter', name: 'Vostok Scattergun', desc: 'WEAPON (key 2): seven-pellet close-range blast', cost: 1400, max: 1, faction: 'vostok', req: [10], weapon: true },
    { key: 'flak', name: 'Vostok Flak Weave', desc: '+20 max health, less blast knockback', cost: 750, max: 3, faction: 'vostok', req: [5, 15, 30] },
  ],
  daedalus: [
    { key: 'rail', name: 'Daedalus Rail Lance', desc: 'WEAPON (key 3): instant piercing beam, long range', cost: 1600, max: 1, faction: 'daedalus', req: [10], weapon: true },
    { key: 'overcharge', name: 'Daedalus Overcharger', desc: 'Faster fire rate for every weapon', cost: 800, max: 3, faction: 'daedalus', req: [5, 15, 30] },
  ],
  rustmoon: [
    { key: 'mortar', name: 'Rustmoon Junk Mortar', desc: 'WEAPON (key 4): lobbed scrap bomb, huge blast', cost: 1200, max: 1, faction: 'rustmoon', req: [5], weapon: true },
    { key: 'shadow', name: 'Rustmoon Shadow Rig', desc: 'Lawmen and turrets have a harder time hitting you', cost: 750, max: 3, faction: 'rustmoon', req: [0, 15, 35] },
  ],
};

// faction outfits and skate finishes
for (const id of Object.keys(SHOPS)) SHOPS[id].push(...cosmeticShopItems(id));
