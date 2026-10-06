// Static data for the lunar frontier.
export const FACTIONS = {
  intl: { name: 'ILMB Authority', color: '#ffd23f' },
  accord: { name: 'Atlantic Accord', color: '#2ec4ff' },
  directorate: { name: 'Pan-Pacific Directorate', color: '#ff3b5c' },
  civ: { name: "Settlers' Union", color: '#ff9f1c' },
  sci: { name: 'Lunar Science Consortium', color: '#7dff6a' },
  equa: { name: 'Equatorial Federation', color: '#c77dff' },
  pirate: { name: 'Scrapjaw Pirates', color: '#9a9a9a' },
};

export const LOCATIONS = [
  {
    id: 'ilmb', name: 'International Moon Base', short: 'ILMB', type: 'hub', faction: 'intl',
    x: 0, z: 0, r: 190, jobs: ['intl', 'intl', 'accord', 'directorate', 'equa'], safe: true, repair: 14, shop: true,
    blurb: 'Neutral hub of the lunar frontier. Embassies, mission boards, repair bays.',
  },
  {
    id: 'tranq', name: 'Tranquility Commons', short: 'TRANQ', type: 'civilian', faction: 'civ',
    x: -950, z: 700, r: 130, jobs: ['civ', 'civ'], safe: true, repair: 8,
    blurb: 'Family habitat domes. Kids, gardens, and the best noodle bar on the Moon.',
  },
  {
    id: 'aldrin', name: 'Aldrin Heights', short: 'ALDRIN', type: 'civilian', faction: 'civ',
    x: 760, z: 980, r: 115, jobs: ['civ', 'sci'], safe: true, repair: 8,
    blurb: 'Hillside settlement for observatory crews and their families.',
  },
  {
    id: 'shackleton', name: 'Shackleton Radar Array', short: 'SHACK', type: 'research', faction: 'sci',
    x: 1380, z: 1250, r: 140, jobs: ['sci', 'sci'], safe: true, repair: 4,
    blurb: 'Deep-space radar dishes. High-value calibration cargo.',
  },
  {
    id: 'kepler', name: 'Kepler Bio-Lab', short: 'KEPLER', type: 'research', faction: 'sci',
    x: -1430, z: 120, r: 115, jobs: ['sci', 'civ'], safe: true, repair: 4,
    blurb: 'Sealed bio-domes growing lunar crops and stranger things.',
  },
  {
    id: 'mine', name: 'Helium-3 Extractor 7', short: 'HE3-7', type: 'industrial', faction: 'equa',
    x: -380, z: 1480, r: 110, jobs: ['equa'], safe: true, repair: 4,
    blurb: 'Regolith strip-mine. Volatile canisters, volatile workers.',
  },
  {
    id: 'meridian', name: 'Fort Meridian', short: 'MERIDIAN', type: 'military', faction: 'accord',
    x: 1280, z: -560, r: 140, zoneR: 430, restricted: true,
    blurb: 'Atlantic Accord forward base. Restricted airspace.',
  },
  {
    id: 'vostok', name: 'Bastion Vostok-9', short: 'VOSTOK', type: 'military', faction: 'directorate',
    x: -1150, z: -980, r: 140, zoneR: 430, restricted: true,
    blurb: 'Directorate artillery bastion. Do not linger.',
  },
  {
    id: 'gulch', name: 'Scrapjaw Gulch', short: 'GULCH', type: 'pirate', faction: 'pirate',
    x: 240, z: -1480, r: 120, hostile: true,
    blurb: 'Pirate scrapyard. Stolen cargo ends up here.',
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
];

export const MIL_CARGO = [
  { name: 'Encrypted Diplomatic Pouch', fragile: 0.2, hot: 2, color: 0x2b2b2b },
  { name: 'Weapons Telemetry Drive', fragile: 0.5, hot: 3, color: 0xff3b5c },
  { name: 'Ration Crate', fragile: 0.1, hot: 1, color: 0x8ac926 },
];

export const CLIENTS = {
  intl: ['Dispatcher Okafor', 'Quartermaster Lindqvist', 'Chief Ambassador Ruiz'],
  accord: ['Major Halvorsen', 'Attaché Bell'],
  directorate: ['Commissar Tanaka', 'Colonel Zhou'],
  civ: ['Auntie Mbeki', 'Little Juno (age 9)', 'Mayor Castellanos', 'Noodle-bar Kenji'],
  sci: ['Dr. Abernathy', 'Prof. Nakamura-Webb', 'Lab Tech Priya'],
  equa: ['Foreman Adeyemi', 'Shift Boss Ortega'],
};
