// What you can wear: outfits, skate finishes and laser colours, and the shop entries they make. Plain data with no
// imports, so locations.js (the shops), wardrobe.js and cosmetics.js (dressing the runner) all read it without
// importing each other.

// Suits. Each faction sells a base outfit (FRIENDLY) and an elite one (HONORED).
export const OUTFITS = {
  courier: { name: 'Courier Orange', suit: 0xff4f2e, accent: 0x2ee6ff, helmet: 0xfff4e0, visor: 0x241a5c, scarf: 0xffd23f, sc: [1.3, 0.22, 1] },
  spacecom: { name: 'SPACECOM Fatigues', faction: 'spacecom', shop: 'ilmb', req: 10, cost: 450, suit: 0x55607a, accent: 0xffd23f, helmet: 0xffffff, visor: 0x2ec4ff, scarf: 0x2ec4ff, sc: [1.0, 0.2, 1] },
  spacecom2: { name: 'SPACECOM Admiral Whites', faction: 'spacecom', shop: 'ilmb', req: 50, cost: 1800, elite: true, suit: 0xf4f1ff, accent: 0xffd23f, helmet: 0xf4f1ff, visor: 0xffd23f, scarf: 0xd7263d, sc: [1.5, 0.26, 2], extras: ['crest', 'pads'] },
  meridian: { name: 'Meridian Trader Silks', faction: 'meridian', shop: 'meridian', req: 10, cost: 450, suit: 0x1fa89a, accent: 0xffd23f, helmet: 0xfff4e0, visor: 0x123a3a, scarf: 0xffd23f, sc: [1.75, 0.17, 1] },
  meridian2: { name: 'Meridian Gilded Executive', faction: 'meridian', shop: 'meridian', req: 50, cost: 1800, elite: true, suit: 0xffc83a, accent: 0xffffff, helmet: 0xffe27a, visor: 0x1a1030, scarf: 0xffffff, sc: [1.6, 0.28, 2], extras: ['halo'] },
  kepler: { name: 'Kepler Settler Overalls', faction: 'kepler', shop: 'kepler', req: 10, cost: 450, suit: 0x6a8f3a, accent: 0xff9f1c, helmet: 0xe8d8b0, visor: 0x3a2a1a, scarf: 0xc0392b, sc: [1.2, 0.27, 1] },
  kepler2: { name: 'Kepler Founder\'s Greatcoat', faction: 'kepler', shop: 'kepler', req: 50, cost: 1800, elite: true, suit: 0x7a4a2a, accent: 0x7dff6a, helmet: 0xfff4e0, visor: 0x2b8f4a, scarf: 0x7dff6a, sc: [1.9, 0.36, 2], extras: ['pads'] },
  vostok: { name: 'Vostok Field Greys', faction: 'vostok', shop: 'vostok', req: 10, cost: 450, suit: 0x6b6f78, accent: 0xd7263d, helmet: 0x8a8f99, visor: 0x111111, scarf: 0xd7263d, sc: [1.0, 0.2, 1] },
  vostok2: { name: 'Vostok Hero of the Moon', faction: 'vostok', shop: 'vostok', req: 50, cost: 1800, elite: true, suit: 0xb3121f, accent: 0xffd23f, helmet: 0xb3121f, visor: 0xffd23f, scarf: 0xffd23f, sc: [1.6, 0.3, 2], extras: ['pads', 'crest'] },
  daedalus: { name: 'Daedalus Lab Jumpsuit', faction: 'daedalus', shop: 'daedalus', req: 10, cost: 450, suit: 0xeeeaf8, accent: 0xc77dff, helmet: 0xffffff, visor: 0x7b2ff7, scarf: 0xc77dff, sc: [1.1, 0.16, 1] },
  daedalus2: { name: 'Daedalus Prototype Shell', faction: 'daedalus', shop: 'daedalus', req: 50, cost: 1800, elite: true, suit: 0x1a1426, accent: 0xff2e88, helmet: 0x1a1426, visor: 0xff2e88, scarf: 0xff2e88, sc: [1.55, 0.13, 2], extras: ['crest', 'halo'] },
  rustmoon: { name: 'Rustmoon Scrapper Leathers', faction: 'rustmoon', shop: 'rustmoon', req: 5, cost: 450, suit: 0x5a3a2a, accent: 0x7dff3a, helmet: 0x2b2b2b, visor: 0x7dff3a, scarf: 0xd7263d, sc: [1.25, 0.25, 1], extras: ['band'] },
  rustmoon2: { name: 'Rustmoon Dread Captain', faction: 'rustmoon', shop: 'rustmoon', req: 50, cost: 1800, elite: true, suit: 0x111111, accent: 0x7dff3a, helmet: 0x111111, visor: 0x7dff3a, scarf: 0x7dff3a, sc: [2.0, 0.34, 2], extras: ['band', 'pads'] },
};

// Quantum-Lock Skate finishes, all sold by Meridian; some need a deed as well as credits.
export const SKATES = {
  // tone: the skate hum's voice (audio.js setSkateTone): hum, glide or rumble (gold rollers: jackpot)
  stock: { name: 'Q-Lock Standard', color: 0x2ee6ff, trail: null, tone: 'hum' },
  chrome: { name: 'Chrome Comets', cost: 900, req: 0, color: 0xffffff, trail: 0xe8f6ff, tone: 'hum' },
  solar: { name: 'Solar Flares', cost: 1400, req: 10, color: 0xff7b1c, trail: 0xffb02e, flame: true, tone: 'rumble' },
  seismic: { name: 'Seismic Striders', cost: 1200, req: 0, color: 0xffd23f, trail: 0xffd23f, unlock: { stat: 'meridianEvents', n: 3, text: 'Complete 3 Meridian events' }, tone: 'rumble' },
  hooves: { name: 'Derby Hooves', cost: 800, req: 0, color: 0xa0612b, trail: 0xc9a06b, hooves: true, unlock: { stat: 'raceWins', n: 1, text: 'Win the Chimera Derby' }, tone: 'rumble' },
  void: { name: 'Void Gliders', cost: 1600, req: 25, color: 0x9b4dff, trail: 0x7b2ff7, tone: 'glide' },
  survivor: { name: 'Dark-Side Survivors', cost: 1500, req: 0, color: 0x7dff3a, trail: 0x7dff3a, unlock: { stat: 'darkDeliveries', n: 5, text: 'Deliver 5 contracts on the dark side' }, tone: 'hum' },
  prism: { name: 'Prism Drive', cost: 2500, req: 50, color: 0xff2e88, trail: 'rainbow', rainbow: true, tone: 'glide' },
};

export const LASERS = [
  { name: 'Ice Blue', color: 0x9be7ff },
  { name: 'Hot Pink', color: 0xff2e88 },
  { name: 'Acid Lime', color: 0x9dff2e },
  { name: 'Solar Orange', color: 0xff8a1c },
  { name: 'Ultraviolet', color: 0xb26bff },
  { name: 'Gold Rush', color: 0xffd23f },
  { name: 'Blood Red', color: 0xff2a3a },
  { name: 'Pure White', color: 0xffffff },
];

// Job-board shop entries (bought once, equipped in the wardrobe with C).
export function cosmeticShopItems(locId) {
  const out = [];
  for (const [id, o] of Object.entries(OUTFITS)) {
    if (o.shop !== locId) continue;
    out.push({ key: 'outfit_' + id, name: `${o.elite ? '★ ' : ''}${o.name}`, desc: o.elite ? 'Elite outfit — HONORED standing only' : 'Faction outfit', cost: o.cost, max: 1, faction: o.faction, req: [o.req], cosmetic: true, swatch: [o.suit, o.accent, o.scarf] });
  }
  if (locId === 'meridian') {
    for (const [id, s] of Object.entries(SKATES)) {
      if (!s.cost) continue;
      out.push({ key: 'skates_' + id, name: `${s.name} (skates)`, desc: s.unlock ? `Unlock: ${s.unlock.text}` : 'Skate finish + glide trail', cost: s.cost, max: 1, faction: 'meridian', req: [s.req], unlock: s.unlock, cosmetic: true, swatch: [s.color] });
    }
  }
  return out;
}
