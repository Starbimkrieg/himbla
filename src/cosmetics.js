import * as THREE from 'three';
import { toon, glow, ink } from './toon.js';

// Suits. Each faction sells a base outfit (FRIENDLY) and an elite one (HONORED).
export const OUTFITS = {
  courier: { name: 'Courier Orange', suit: 0xff4f2e, accent: 0x2ee6ff, helmet: 0xfff4e0, visor: 0x241a5c, scarf: 0xffd23f },
  spacecom: { name: 'SPACECOM Fatigues', faction: 'spacecom', shop: 'ilmb', req: 10, cost: 450, suit: 0x55607a, accent: 0xffd23f, helmet: 0xffffff, visor: 0x2ec4ff, scarf: 0x2ec4ff },
  spacecom2: { name: 'SPACECOM Admiral Whites', faction: 'spacecom', shop: 'ilmb', req: 50, cost: 1800, elite: true, suit: 0xf4f1ff, accent: 0xffd23f, helmet: 0xf4f1ff, visor: 0xffd23f, scarf: 0xd7263d, extras: ['crest', 'pads'] },
  meridian: { name: 'Meridian Trader Silks', faction: 'meridian', shop: 'meridian', req: 10, cost: 450, suit: 0x1fa89a, accent: 0xffd23f, helmet: 0xfff4e0, visor: 0x123a3a, scarf: 0xffd23f },
  meridian2: { name: 'Meridian Gilded Executive', faction: 'meridian', shop: 'meridian', req: 50, cost: 1800, elite: true, suit: 0xffc83a, accent: 0xffffff, helmet: 0xffe27a, visor: 0x1a1030, scarf: 0xffffff, extras: ['halo'] },
  kepler: { name: 'Kepler Settler Overalls', faction: 'kepler', shop: 'kepler', req: 10, cost: 450, suit: 0x6a8f3a, accent: 0xff9f1c, helmet: 0xe8d8b0, visor: 0x3a2a1a, scarf: 0xc0392b },
  kepler2: { name: 'Kepler Founder\'s Greatcoat', faction: 'kepler', shop: 'kepler', req: 50, cost: 1800, elite: true, suit: 0x7a4a2a, accent: 0x7dff6a, helmet: 0xfff4e0, visor: 0x2b8f4a, scarf: 0x7dff6a, extras: ['pads', 'cape'] },
  vostok: { name: 'Vostok Field Greys', faction: 'vostok', shop: 'vostok', req: 10, cost: 450, suit: 0x6b6f78, accent: 0xd7263d, helmet: 0x8a8f99, visor: 0x111111, scarf: 0xd7263d },
  vostok2: { name: 'Vostok Hero of the Moon', faction: 'vostok', shop: 'vostok', req: 50, cost: 1800, elite: true, suit: 0xb3121f, accent: 0xffd23f, helmet: 0xb3121f, visor: 0xffd23f, scarf: 0xffd23f, extras: ['pads', 'crest'] },
  daedalus: { name: 'Daedalus Lab Jumpsuit', faction: 'daedalus', shop: 'daedalus', req: 10, cost: 450, suit: 0xeeeaf8, accent: 0xc77dff, helmet: 0xffffff, visor: 0x7b2ff7, scarf: 0xc77dff },
  daedalus2: { name: 'Daedalus Prototype Shell', faction: 'daedalus', shop: 'daedalus', req: 50, cost: 1800, elite: true, suit: 0x1a1426, accent: 0xff2e88, helmet: 0x1a1426, visor: 0xff2e88, scarf: 0xff2e88, extras: ['crest', 'halo'] },
  rustmoon: { name: 'Rustmoon Scrapper Leathers', faction: 'rustmoon', shop: 'rustmoon', req: 5, cost: 450, suit: 0x5a3a2a, accent: 0x7dff3a, helmet: 0x2b2b2b, visor: 0x7dff3a, scarf: 0xd7263d, extras: ['band'] },
  rustmoon2: { name: 'Rustmoon Dread Captain', faction: 'rustmoon', shop: 'rustmoon', req: 50, cost: 1800, elite: true, suit: 0x111111, accent: 0x7dff3a, helmet: 0x111111, visor: 0x7dff3a, scarf: 0x7dff3a, extras: ['band', 'pads', 'cape'] },
};

// Quantum-Lock Skate finishes, all sold by Meridian. Some need a deed, not just credits.
export const SKATES = {
  stock: { name: 'Q-Lock Standard', color: 0x2ee6ff, trail: null },
  chrome: { name: 'Chrome Comets', cost: 900, req: 0, color: 0xffffff, trail: 0xe8f6ff },
  solar: { name: 'Solar Flares', cost: 1400, req: 10, color: 0xff7b1c, trail: 0xffb02e, flame: true },
  seismic: { name: 'Seismic Striders', cost: 1200, req: 0, color: 0xffd23f, trail: 0xffd23f, unlock: { stat: 'meridianEvents', n: 3, text: 'Complete 3 Meridian events' } },
  hooves: { name: 'Derby Hooves', cost: 800, req: 0, color: 0xa0612b, trail: 0xc9a06b, hooves: true, unlock: { stat: 'raceWins', n: 1, text: 'Win the Chimera Derby' } },
  void: { name: 'Void Gliders', cost: 1600, req: 25, color: 0x9b4dff, trail: 0x7b2ff7 },
  survivor: { name: 'Dark-Side Survivors', cost: 1500, req: 0, color: 0x7dff3a, trail: 0x7dff3a, unlock: { stat: 'darkDeliveries', n: 5, text: 'Deliver 5 contracts on the dark side' } },
  prism: { name: 'Prism Drive', cost: 2500, req: 50, color: 0xff2e88, trail: 'rainbow', rainbow: true },
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

// Shop entries for the job boards (bought once, then equipped from the wardrobe with C).
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

const KEY = 'moonrunner-style-v1';

export class Cosmetics {
  constructor(game) {
    this.game = game;
    this.outfit = 'courier';
    this.skates = 'stock';
    this.laser = 0;
    this.extraMeshes = [];
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d) Object.assign(this, { outfit: d.outfit || 'courier', skates: d.skates || 'stock', laser: d.laser || 0 });
    } catch { /* default look */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ outfit: this.outfit, skates: this.skates, laser: this.laser })); } catch { /* unavailable */ }
  }

  owned(kind, id) {
    if (kind === 'outfit') return id === 'courier' || (this.game.upgrades['outfit_' + id] || 0) > 0;
    return id === 'stock' || (this.game.upgrades['skates_' + id] || 0) > 0;
  }

  get laserColor() { return LASERS[this.laser].color; }
  get skate() { return SKATES[this.skates] || SKATES.stock; }

  trailColor(t) {
    const s = this.skate;
    if (s.trail === 'rainbow') return new THREE.Color().setHSL((t * 0.4) % 1, 1, 0.6).getHex();
    return s.trail;
  }

  // Recolour the runner's own materials and swap the outfit's extra parts.
  apply() {
    const M = this.game.player.model;
    const o = OUTFITS[this.outfit] || OUTFITS.courier;
    const m = M.mats;
    m.suit.color.setHex(o.suit);
    m.accent.color.setHex(o.accent);
    m.helmet.color.setHex(o.helmet);
    m.visor.color.setHex(o.visor);
    m.scarf.color.setHex(o.scarf);
    m.collar.color.setHex(o.scarf);
    m.glow.color.setHex(o.accent);
    for (const x of this.extraMeshes) x.removeFromParent();
    this.extraMeshes = [];
    const add = (parent, mesh, outline = 0.03) => { if (outline) ink(mesh, outline); parent.add(mesh); this.extraMeshes.push(mesh); return mesh; };
    for (const e of o.extras || []) {
      if (e === 'crest') {
        const c = add(M.head, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.6), toon(o.accent)));
        c.position.set(0, 0.36, -0.05);
      } else if (e === 'pads') {
        for (const s of [-1, 1]) {
          const p = add(M.torso, new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(o.accent)));
          p.position.set(s * 0.45, 0.88, 0);
          p.scale.set(1.1, 0.7, 1);
        }
      } else if (e === 'halo') {
        const h = add(M.head, new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 24), glow(o.accent)), 0);
        h.rotation.x = Math.PI / 2;
        h.position.y = 0.62;
      } else if (e === 'band') {
        const b = add(M.head, new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 16), toon(0xd7263d)), 0.02);
        b.rotation.x = Math.PI / 2;
        b.position.y = 0.12;
      } else if (e === 'cape') {
        const c = add(M.torso, new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.1), toon(o.scarf, { side: THREE.DoubleSide })), 0);
        c.position.set(0, 0.35, -0.55);
        c.rotation.x = 0.25;
        c.userData.cape = true;
      }
    }
    this.applySkates();
    this.save();
  }

  applySkates() {
    const M = this.game.player.model;
    const s = this.skate;
    M.mats.skate.color.setHex(s.color);
    for (const h of M.hoofMeshes || []) h.removeFromParent();
    M.hoofMeshes = [];
    if (s.hooves) {
      for (const leg of [M.legL, M.legR]) {
        const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI * 1.4), glow(0xd8d0c4));
        shoe.rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
        shoe.position.set(0, -1.0, 0.1);
        leg.add(shoe);
        M.hoofMeshes.push(shoe);
      }
    }
  }

  // Per frame: skate glow, prism hue, trails.
  update(dt) {
    const g = this.game;
    const P = g.player;
    const b = P.body;
    const s = this.skate;
    const mat = P.model.mats.skate;
    if (s.rainbow) mat.color.setHSL((g.time * 0.4) % 1, 1, 0.6);
    else mat.color.setHex(b.skating ? s.color : 0x3a3550);
    if (s.trail && b.skating && b.grounded && P.speed > 12 && Math.random() < dt * (s.flame ? 60 : 35)) {
      const back = P.pos.clone().addScaledVector(P.up, s.flame ? 0.3 : 0.15);
      g.fx.spawn(back, P.vel.clone().multiplyScalar(-0.15).addScaledVector(P.up, s.flame ? 2.5 : 0.5), { color: this.trailColor(g.time), size: s.flame ? 0.45 : 0.3, life: s.flame ? 0.45 : 0.7, count: 1, spread: 0.6 });
    }
    for (const x of this.extraMeshes) if (x.userData.cape) x.rotation.x = 0.25 + Math.min(1.1, P.speed / 40) + Math.sin(g.time * 8) * 0.05;
  }

  // C: the wardrobe. Cycles through what you own.
  wardrobe() {
    const g = this.game;
    const outfits = Object.keys(OUTFITS).filter((k) => this.owned('outfit', k));
    const skates = Object.keys(SKATES).filter((k) => this.owned('skates', k));
    const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
    const sw = (c) => `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span>`;
    const o = OUTFITS[this.outfit], s = this.skate, l = LASERS[this.laser];
    const lockedO = Object.keys(OUTFITS).length - outfits.length, lockedS = Object.keys(SKATES).length - skates.length;
    g.dialog('WARDROBE', `${sw(o.suit)}${sw(o.accent)}${sw(o.scarf)} <b>${o.name}</b><br>${sw(s.color)} <b>${s.name}</b><br>${sw(l.color)} <b>${l.name}</b> pulse discs<br><br><small>${lockedO} outfits and ${lockedS} skate finishes still to find: faction outfits are sold at each HQ (elite ones need HONORED standing); skate finishes at Meridian Exchange.</small>`, [
      { label: `1 · NEXT OUTFIT (${outfits.length} owned)`, fn: () => { this.outfit = next(outfits, this.outfit); this.apply(); this.wardrobe(); } },
      { label: `2 · NEXT SKATES (${skates.length} owned)`, fn: () => { this.skates = next(skates, this.skates); this.apply(); this.wardrobe(); } },
      { label: '3 · NEXT LASER COLOUR', fn: () => { this.laser = (this.laser + 1) % LASERS.length; this.save(); this.wardrobe(); } },
      { label: '4 · DONE' },
    ]);
  }
}
