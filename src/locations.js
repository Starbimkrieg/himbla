// Static frontier data. Positions are (theta, phi) degrees from the sub-solar point: theta < 90 lit side, > 90 dark side.
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
    blurb: 'Family habitat domes joined by tunnels: a playground, greenhouses, and the best noodle bar on the Moon.',
  },
  {
    id: 'aldrin', name: 'Aldrin Heights', short: 'ALDRIN', type: 'civilian', faction: 'kepler',
    theta: 63, phi: -32, r: 115, jobs: ['kepler', 'meridian'], safe: true, repair: 8, defense: { ring: 95, turrets: 2 },
    blurb: 'Domes and cabins for observatory crews and their families, under a water tower you can see for miles.',
  },
  {
    id: 'shackleton', name: 'Shackleton Radar Array', short: 'SHACK', type: 'research', faction: 'meridian',
    theta: 76, phi: 34, r: 140, jobs: ['meridian', 'meridian'], safe: true, repair: 4, defense: { ring: 110, turrets: 2 },
    blurb: 'Meridian deep-space radar dishes and a turning observatory, on the edge of the light.',
  },
  {
    id: 'kepler', name: 'Kepler Civic Center', short: 'KEPLER', type: 'civilian', faction: 'kepler', hq: true,
    theta: 24, phi: -75, r: 140, jobs: ['kepler', 'kepler', 'spacecom'], safe: true, repair: 10, defense: { ring: 115, turrets: 4 },
    blurb: 'Seat of the Kepler councils: the gold council dome, the clock-tower town hall and a very long queue.',
  },
  {
    id: 'mine', name: 'Helium-3 Exchange', short: 'HE3', type: 'industrial', faction: 'meridian',
    theta: 56, phi: 82, r: 110, jobs: ['meridian'], safe: true, repair: 4, defense: { ring: 95, turrets: 2 },
    blurb: 'Meridian strip-mine: a bucket-wheel excavator, a pumping derrick and a He-3 tank farm. Volatile canisters, volatile prices.',
  },
  {
    id: 'meridian', name: 'Meridian Exchange', short: 'MERIDIAN', type: 'trade', faction: 'meridian', hq: true,
    theta: 18, phi: 25, r: 150, jobs: ['meridian', 'meridian', 'kepler'], safe: true, repair: 8, defense: { ring: 125, turrets: 4 },
    blurb: 'Meridian headquarters: a gate arch, an avenue to the glass trading tower whose ticker never sleeps, a trade hall, a container port and cranes.',
  },
  {
    id: 'vostok', name: 'Bastion Vostok-9', short: 'VOSTOK-9', type: 'military', faction: 'vostok', hq: true,
    theta: 72, phi: 125, r: 140, zoneR: 380, restricted: true, jobs: ['vostok', 'vostok'],
    blurb: 'Vostok command bastion: gun walls, a radar bunker and searchlights. Do not linger without clearance.',
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
    blurb: 'Daedalus command citadel behind gun walls, buried in the deepest dark.',
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
    theta: 62, phi: -95, r: 80,
    blurb: 'A perfectly black slab nobody admits to building, ringed by an abandoned survey dig. It hums when you get close.',
  },
  {
    id: 'fissure', name: 'The Whispering Fissure', short: 'FISSURE', type: 'tunnel', faction: 'none', poi: true,
    theta: 96, phi: -138, r: 150,
    blurb: 'A clean-cut trench sliding into the Moon. It hums. Something down there is waiting for a key.',
  },
  { // casino
    id: 'casino', name: 'Lucky Crater Casino', short: 'CASINO', type: 'casino', faction: 'none', poi: true,
    theta: 50, phi: -22, r: 110, safe: true, repair: 6,
    blurb: 'Neon, slot machines and a pit boss in a visor. The house always wins. Usually.',
  },
  {
    id: 'gulch', name: 'Scrapjaw Gulch', short: 'GULCH', type: 'pirate', faction: 'rustmoon',
    theta: 116, phi: -42, r: 120, hostile: true, dark: true,
    blurb: 'Pirate scrapyard. Stolen cargo ends up here.',
  },
  {
    id: 'blackrock', name: 'Blackrock Den', short: 'BLACKROCK', type: 'pirate', faction: 'rustmoon',
    theta: 152, phi: -140, r: 110, hostile: true, dark: true,
    blurb: 'Pirate den of shanties and gutted wrecks. Lights off, guns on.',
  },
  {
    id: 'gloom', name: 'Gloom Harbor', short: 'GLOOM', type: 'pirate', faction: 'rustmoon',
    theta: 165, phi: 30, r: 110, hostile: true, dark: true,
    blurb: 'Smugglers\' den at the darkest point on the Moon, under a searchlight that never stops turning.',
  },
  {
    id: 'rustmoon', name: 'Rustmoon Hold', short: 'RUSTMOON', type: 'pirate', faction: 'rustmoon', hq: true,
    theta: 122, phi: 168, r: 130, hostile: true, dark: true, jobs: ['rustmoon', 'rustmoon'],
    blurb: 'Seat of the Rustmoon clans. A ring of wrecked ships and bad intentions.',
  },
  // late: kept out of crater and outpost generation so old saves keep their terrain and outpost ids;
  // its plateau flattens what's there
  {
    id: 'downs', name: 'Chimera Downs', short: 'DOWNS', type: 'derby', faction: 'none', poi: true, late: true,
    theta: 22, phi: 160, r: 280, curved: true, safe: true, repair: 6,
    blurb: "A proper racecourse for the things that crawl out of Dr. Zbornak's reactor: a roofed grandstand, a screen the size of a barn and a race card that never sleeps.",
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

// reputation tiers: contract pay scales (1 to 1.8x: the tier gates what you are offered more than what it pays) and faction gear unlocks by tier
export const TIERS = [
  { min: -Infinity, name: 'HOSTILE', color: '#ff2a4a', pay: 0 },
  { min: -20, name: 'WARY', color: '#ff9f1c', pay: 0.9 },
  { min: 0, name: 'NEUTRAL', color: '#c9c3d9', pay: 1 },
  { min: 10, name: 'FRIENDLY', color: '#7dff6a', pay: 1.2 },
  { min: 25, name: 'TRUSTED', color: '#2ec4ff', pay: 1.4 },
  { min: 50, name: 'HONORED', color: '#ffd23f', pay: 1.6 },
  { min: 80, name: 'REVERED', color: '#ff7ad9', pay: 1.8 },
];

// faction gear at each HQ; each level needs more reputation: level 1 FRIENDLY, 2 TRUSTED, 3 HONORED (ILMB: NEUTRAL, FRIENDLY, TRUSTED); weapons HONORED (or the story hands them out)
const REP = Object.fromEntries(TIERS.map((t) => [t.name.toLowerCase(), t.min]));
const LADDER = [REP.friendly, REP.trusted, REP.honored]; // other factions' three-level gear
const ILMB_LADDER = [REP.neutral, REP.friendly, REP.trusted]; // SPACECOM's own kit starts at NEUTRAL
import { cosmeticShopItems } from './cosmetics.js';

export const SHOPS = {
  ilmb: [
    { key: 'capacitor', name: 'Flux Capacitor', desc: '+25 thruster energy', cost: 600, max: 3, faction: 'spacecom', req: ILMB_LADDER },
    { key: 'armor', name: 'Ablative Suit Plating', desc: '+15 max health', cost: 550, max: 3, faction: 'spacecom', req: ILMB_LADDER },
    { key: 'dampers', name: 'Mag-Cushion Dampers', desc: 'Safer hard landings', cost: 650, max: 3, faction: 'spacecom', req: ILMB_LADDER },
    { key: 'scanner', name: 'Threat Scanner', desc: 'Look at pirates to mark them with a red outline; warns of inbound squads', cost: 700, max: 2, faction: 'spacecom', req: ILMB_LADDER },
    { key: 'seeker', name: 'SPACECOM Seeker Module', desc: 'Pulse discs, mortar shells and scattergun pellets steer harder onto the target you aimed at (the disc most)', cost: 800, max: 3, faction: 'spacecom', req: ILMB_LADDER },
    { key: 'v_interceptor', name: 'SPACECOM Lunar Interceptor', desc: 'VEHICLE: the fast one, yours to call with V', cost: 3500, max: 1, faction: 'spacecom', req: [REP.revered], vehicle: 'interceptor' },
  ],
  meridian: [
    { key: 'gyro', name: 'Meridian Gyro-Edges', desc: 'Sharper ground steering on skates', cost: 700, max: 3, faction: 'meridian', req: LADDER },
    { key: 'uplink', name: 'Meridian Market Uplink', desc: '+10% pay on every contract (per level)', cost: 900, max: 3, faction: 'meridian', req: LADDER },
    { key: 'v_van', name: 'Meridian Courier Light-Bike', desc: 'VEHICLE: the light-bike, yours to call with V', cost: 3200, max: 1, faction: 'meridian', req: [REP.revered], vehicle: 'van' },
  ],
  kepler: [
    { key: 'winch', name: 'Kepler Hitch-Line Winch', desc: 'POWER (E, again to let go): steel cable onto a vehicle or a structure within 120 m; the drum reels you in to 2 m. Swing under shuttles, trail behind rovers. Up to 20 s', cost: 2400, max: 1, faction: 'kepler', req: [REP.trusted] },
    { key: 'twin', name: 'Kepler Twin Cradle', desc: 'Carry two contracts at once: the second crate stacks on top of the first', cost: 2600, max: 1, faction: 'kepler', req: [REP.friendly] },
    { key: 'cradle', name: 'Kepler Cargo Foam', desc: 'Cargo takes 25% less jostle damage per level (hauled loads, fragile crates)', cost: 700, max: 3, faction: 'kepler', req: LADDER },
    { key: 'v_mule', name: 'Kepler Homestead Mule', desc: 'VEHICLE: the padded hauler, yours to call with V', cost: 2800, max: 1, faction: 'kepler', req: [REP.revered], vehicle: 'mule' },
    { key: 'v_carrier', name: 'Kepler Militia Carrier', desc: 'VEHICLE: the armoured militia hauler with a turret cannon, yours to call with V', cost: 3500, max: 1, faction: 'kepler', req: [REP.revered], vehicle: 'carrier' },
  ],
  vostok: [
    { key: 'scatter', name: 'Vostok Scattergun', desc: 'WEAPON (key 2): seven-pellet close-range blast', cost: 1400, max: 1, faction: 'vostok', req: [REP.honored], weapon: true },
    { key: 'flak', name: 'Vostok Flak Weave', desc: '+10 max health, +1 HP regen per level (a tick every 3 s), less blast knockback', cost: 750, max: 3, faction: 'vostok', req: LADDER },
    { key: 'spinner', name: 'Vostok Weapon Tuning Kit', desc: '+15% damage for every weapon', cost: 750, max: 3, faction: 'vostok', req: LADDER },
    { key: 'v_apc', name: 'Vostok BTR-M APC', desc: 'VEHICLE: the Moon APC, yours to call with V', cost: 4000, max: 1, faction: 'vostok', req: [REP.revered], vehicle: 'apc' },
  ],
  daedalus: [
    { key: 'rail', name: 'Daedalus Rail Lance', desc: 'WEAPON (key 3): instant piercing beam, long range', cost: 1600, max: 1, faction: 'daedalus', req: [REP.honored], weapon: true },
    { key: 'overcharge', name: 'Daedalus Overcharger', desc: 'Faster fire rate for every weapon', cost: 800, max: 3, faction: 'daedalus', req: LADDER },
    { key: 'cloak', name: 'Daedalus Dark-Side Cloak', desc: 'Roaming pirates check for you less often on the dark side: +5 s per level (doubled on Daedalus ground). Den guards unaffected', cost: 900, max: 3, faction: 'daedalus', req: LADDER },
    { key: 'v_skimmer', name: 'Daedalus Phase Skimmer', desc: 'VEHICLE: the hover skimmer, yours to call with V', cost: 4000, max: 1, faction: 'daedalus', req: [REP.revered], vehicle: 'skimmer' },
  ],
  rustmoon: [
    { key: 'mortar', name: 'Rustmoon Junk Mortar', desc: 'WEAPON (key 4): lobbed scrap bomb, huge blast', cost: 1200, max: 1, faction: 'rustmoon', req: [REP.honored], weapon: true },
    { key: 'shadow', name: 'Rustmoon Shadow Rig', desc: 'Lawmen and turrets have a harder time hitting you', cost: 750, max: 3, faction: 'rustmoon', req: LADDER },
    // black market: the SPACECOM kit is on sale from the start; the rest comes in on smuggling runs to bright-side towns, one a run,
    // drawn at random, cheaper items likelier (the board names it: missions.js pickPayload). Deliver it and it's on sale here for good.
    // `n` is only the legacy order, used to credit old saves that counted deliveries (main.js load)
    { key: 'armor', name: 'Black-Market Suit Plating', desc: '+15 max health', cost: 700, max: 3, faction: 'rustmoon', req: [0] },
    { key: 'dampers', name: 'Black-Market Dampers', desc: 'Safer hard landings', cost: 800, max: 3, faction: 'rustmoon', req: [0] },
    { key: 'scatter', name: 'Black-Market Scattergun', desc: 'WEAPON (key 2): a Vostok scattergun, serial filed off', cost: 1800, max: 1, faction: 'rustmoon', req: [0], weapon: true, unlock: { smuggle: true, n: 1 } },
    { key: 'capacitor', name: 'Black-Market Flux Capacitor', desc: '+25 thruster energy', cost: 750, max: 3, faction: 'rustmoon', req: [0] },
    { key: 'overcharge', name: 'Black-Market Overcharger', desc: 'Faster fire rate for every weapon', cost: 1000, max: 3, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 2 } },
    { key: 'spinner', name: 'Black-Market Tuning Kit', desc: '+15% damage for every weapon', cost: 950, max: 3, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 3 } },
    { key: 'scanner', name: 'Black-Market Threat Scanner', desc: 'Look at lawmen and pirates to mark them; warns of inbound squads', cost: 900, max: 2, faction: 'rustmoon', req: [0] },
    { key: 'rail', name: 'Black-Market Rail Lance', desc: 'WEAPON (key 3): a Daedalus rail lance, borrowed forever', cost: 2200, max: 1, faction: 'rustmoon', req: [0], weapon: true, unlock: { smuggle: true, n: 4 } },
    { key: 'gyro', name: 'Black-Market Gyro-Edges', desc: 'Sharper ground steering on skates', cost: 900, max: 3, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 5 } },
    { key: 'seeker', name: 'Black-Market Seeker Module', desc: 'Pulse discs, mortar shells and scattergun pellets steer harder onto the target you aimed at (the disc most)', cost: 1050, max: 3, faction: 'rustmoon', req: [0] },
    { key: 'flak', name: 'Black-Market Flak Weave', desc: '+10 max health, +1 HP regen per level (a tick every 3 s), less blast knockback', cost: 950, max: 3, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 6 } },
    { key: 'cloak', name: 'Black-Market Dark-Side Cloak', desc: 'Roaming pirates check for you less often on the dark side: +5 s per level', cost: 1150, max: 3, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 7 } },
    { key: 'v_interceptor', name: 'Hot-Wired Interceptor', desc: 'VEHICLE: a SPACECOM Interceptor, liberated', cost: 4200, max: 1, faction: 'rustmoon', req: [0], vehicle: 'interceptor', unlock: { smuggle: true, n: 8 } },
    { key: 't_shield', name: 'Black-Market Deflector', desc: 'TECH: soaks the first 25 damage, back 12 s after it breaks', cost: 3600, max: 1, faction: 'rustmoon', req: [0], tech: 'shield', unlock: { smuggle: true, n: 9 } },
    { key: 'uplink', name: 'Black-Market Market Uplink', desc: '+10% pay on every contract (per level)', cost: 1150, max: 3, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 10 } },
    { key: 'v_mule', name: 'Hot-Wired Homestead Mule', desc: 'VEHICLE: a Kepler hauler, liberated', cost: 3700, max: 1, faction: 'rustmoon', req: [0], vehicle: 'mule', unlock: { smuggle: true, n: 11 } },
    { key: 'v_skimmer', name: 'Hot-Wired Phase Skimmer', desc: 'VEHICLE: a Daedalus skimmer, liberated', cost: 4800, max: 1, faction: 'rustmoon', req: [0], vehicle: 'skimmer', unlock: { smuggle: true, n: 12 } },
    { key: 't_dash', name: 'Black-Market Phase Dash', desc: 'TECH (E): swing all your momentum to wherever you look', cost: 4200, max: 1, faction: 'rustmoon', req: [0], tech: 'dash', unlock: { smuggle: true, n: 13 } },
    { key: 'winch', name: 'Black-Market Hitch-Line', desc: 'POWER (E, again to let go): steel cable onto a vehicle or a structure within 120 m and reel in', cost: 3000, max: 1, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 14 } },
    { key: 'twin', name: 'Black-Market Twin Cradle', desc: 'Carry two contracts at once: the second crate stacks on top of the first', cost: 3200, max: 1, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 15 } },
    { key: 'cradle', name: 'Black-Market Cargo Foam', desc: 'Cargo takes 25% less jostle damage per level (hauled loads, fragile crates)', cost: 850, max: 3, faction: 'rustmoon', req: [0], unlock: { smuggle: true, n: 16 } },
    { key: 'v_van', name: 'Hot-Wired Light-Bike', desc: 'VEHICLE: a Meridian courier bike, liberated', cost: 4200, max: 1, faction: 'rustmoon', req: [0], vehicle: 'van', unlock: { smuggle: true, n: 17 } },
    { key: 'v_apc', name: 'Hot-Wired BTR-M', desc: 'VEHICLE: a Vostok APC, liberated', cost: 5200, max: 1, faction: 'rustmoon', req: [0], vehicle: 'apc', unlock: { smuggle: true, n: 18 } },
    { key: 'v_carrier', name: 'Hot-Wired Militia Carrier', desc: 'VEHICLE: a Kepler militia carrier, liberated', cost: 4600, max: 1, faction: 'rustmoon', req: [0], vehicle: 'carrier', unlock: { smuggle: true, n: 19 } },
    { key: 't_teleport', name: 'Black-Market Personal Teleporter', desc: 'TECH (T): jump to any discovered settlement or your outposts, from the map', cost: 5800, max: 1, faction: 'rustmoon', req: [0], tech: 'teleport', unlock: { smuggle: true, n: 20 } },
    { key: 't_vanes', name: 'Black-Market Slipstream Vanes', desc: 'TECH (E): your skates keep their grip in the air for 10 s', cost: 4800, max: 1, faction: 'rustmoon', req: [0], tech: 'vanes', unlock: { smuggle: true, n: 21 } },
    { key: 'v_warrig_bm', name: 'Hot-Wired War-Rig', desc: 'VEHICLE: a Scrapjaw war-rig, no questions', cost: 5000, max: 1, faction: 'rustmoon', req: [0], vehicle: 'warrig', unlock: { smuggle: true, n: 22 } },
    { key: 'v_warrig', name: 'Rustmoon Scrapjaw War-Rig', desc: 'VEHICLE: stolen, welded, painted green, yours to call with V', cost: 4200, max: 1, faction: 'rustmoon', req: [REP.revered], vehicle: 'warrig' },
  ],
};

// faction outfits and skate finishes
for (const id of Object.keys(SHOPS)) SHOPS[id].push(...cosmeticShopItems(id));
// the Chimera Downs betting office's shop tab (race.js): no faction, so only the deed gates it
export const DOWNS_SHOP = cosmeticShopItems('downs');
