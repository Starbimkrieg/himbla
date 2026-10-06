// Static data for the lunar frontier. Positions are (theta, phi) in degrees relative to the
// sub-solar point: theta < 90 is the lit near side, theta > 90 the dark side.
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
    theta: 45, phi: 0, r: 230, jobs: ['intl', 'intl', 'accord', 'directorate', 'equa'], safe: true, repair: 14, shop: true,
    blurb: 'Neutral hub of the lunar frontier. Embassies, mission boards, repair bays — and the launch pad.',
  },
  {
    id: 'tranq', name: 'Tranquility Commons', short: 'TRANQ', type: 'civilian', faction: 'civ',
    theta: 33, phi: 48, r: 130, jobs: ['civ', 'civ'], safe: true, repair: 8,
    blurb: 'Family habitat domes. Kids, gardens, and the best noodle bar on the Moon.',
  },
  {
    id: 'aldrin', name: 'Aldrin Heights', short: 'ALDRIN', type: 'civilian', faction: 'civ',
    theta: 63, phi: -32, r: 115, jobs: ['civ', 'sci'], safe: true, repair: 8,
    blurb: 'Hillside settlement for observatory crews and their families.',
  },
  {
    id: 'shackleton', name: 'Shackleton Radar Array', short: 'SHACK', type: 'research', faction: 'sci',
    theta: 76, phi: 34, r: 140, jobs: ['sci', 'sci'], safe: true, repair: 4,
    blurb: 'Deep-space radar dishes on the edge of the light. High-value calibration cargo.',
  },
  {
    id: 'kepler', name: 'Kepler Bio-Lab', short: 'KEPLER', type: 'research', faction: 'sci',
    theta: 24, phi: -75, r: 115, jobs: ['sci', 'civ'], safe: true, repair: 4,
    blurb: 'Sealed bio-domes growing lunar crops and stranger things.',
  },
  {
    id: 'mine', name: 'Helium-3 Extractor 7', short: 'HE3-7', type: 'industrial', faction: 'equa',
    theta: 56, phi: 82, r: 110, jobs: ['equa'], safe: true, repair: 4,
    blurb: 'Regolith strip-mine. Volatile canisters, volatile workers.',
  },
  {
    id: 'meridian', name: 'Fort Meridian', short: 'MERIDIAN', type: 'military', faction: 'accord',
    theta: 18, phi: 25, r: 140, zoneR: 380, restricted: true,
    blurb: 'Atlantic Accord forward base. Restricted airspace.',
  },
  {
    id: 'vostok', name: 'Bastion Vostok-9', short: 'VOSTOK', type: 'military', faction: 'directorate',
    theta: 72, phi: 125, r: 140, zoneR: 380, restricted: true,
    blurb: 'Directorate artillery bastion. Do not linger.',
  },
  {
    id: 'twilight', name: 'Twilight Waystation', short: 'TWILIGHT', type: 'civilian', faction: 'civ',
    theta: 93, phi: -8, r: 110, jobs: ['civ', 'sci', 'intl'], safe: true, repair: 10,
    blurb: 'Last lights before the dark side. Charge your lamp and say your prayers.',
  },
  {
    id: 'farside', name: 'Farside Listening Post', short: 'FARSIDE', type: 'research', faction: 'sci',
    theta: 128, phi: 12, r: 115, jobs: ['sci', 'sci'], safe: true, repair: 4, dark: true,
    blurb: 'Radio-quiet far side observatory. No Earth chatter — just pirates.',
  },
  {
    id: 'hertz', name: 'Hertzsprung Refuge', short: 'HERTZ', type: 'civilian', faction: 'civ',
    theta: 140, phi: -82, r: 110, jobs: ['civ', 'civ'], safe: true, repair: 6, dark: true,
    blurb: 'A huddle of domes for people who wanted to be very, very far away.',
  },
  {
    id: 'daedalus', name: 'Daedalus Deep Observatory', short: 'DAEDALUS', type: 'research', faction: 'sci',
    theta: 155, phi: 105, r: 120, jobs: ['sci', 'equa'], safe: true, repair: 4, dark: true,
    blurb: 'The quietest place in the solar system. Mostly.',
  },
  {
    id: 'gulch', name: 'Scrapjaw Gulch', short: 'GULCH', type: 'pirate', faction: 'pirate',
    theta: 116, phi: -42, r: 120, hostile: true, dark: true,
    blurb: 'Pirate scrapyard. Stolen cargo ends up here.',
  },
  {
    id: 'blackrock', name: 'Blackrock Den', short: 'BLACKROCK', type: 'pirate', faction: 'pirate',
    theta: 152, phi: -140, r: 110, hostile: true, dark: true,
    blurb: 'Pirate warren carved into a crater wall.',
  },
  {
    id: 'gloom', name: 'Gloom Harbor', short: 'GLOOM', type: 'pirate', faction: 'pirate',
    theta: 165, phi: 30, r: 110, hostile: true, dark: true,
    blurb: 'Smugglers\' landing field at the darkest point on the Moon.',
  },
  {
    id: 'rustmoon', name: 'Rustmoon Camp', short: 'RUSTMOON', type: 'pirate', faction: 'pirate',
    theta: 122, phi: 168, r: 110, hostile: true, dark: true,
    blurb: 'A ring of wrecked rovers and bad intentions.',
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
  intl: ['Dispatcher Okafor', 'Quartermaster Lindqvist', 'Chief Ambassador Ruiz'],
  accord: ['Major Halvorsen', 'Attaché Bell'],
  directorate: ['Commissar Tanaka', 'Colonel Zhou'],
  civ: ['Auntie Mbeki', 'Little Juno (age 9)', 'Mayor Castellanos', 'Noodle-bar Kenji'],
  sci: ['Dr. Abernathy', 'Prof. Nakamura-Webb', 'Lab Tech Priya'],
  equa: ['Foreman Adeyemi', 'Shift Boss Ortega'],
};
