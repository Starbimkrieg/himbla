import * as THREE from 'three';
import { toon, glow, ink } from './toon.js';
import { Wardrobe } from './wardrobe.js';

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

// Dress any runner from makeRunner({ own: true }) in an outfit: recolour its private
// materials and hang the outfit's extra parts on it. Returns the extra meshes (caller removes
// them before re-dressing). Shared by the player and the wardrobe's preview mannequin.
export function dressRunner(M, outfitId) {
  const o = OUTFITS[outfitId] || OUTFITS.courier;
  const m = M.mats;
  m.suit.color.setHex(o.suit);
  m.accent.color.setHex(o.accent);
  m.helmet.color.setHex(o.helmet);
  m.visor.color.setHex(o.visor);
  m.scarf.color.setHex(o.scarf);
  m.collar.color.setHex(o.scarf);
  m.glow.color.setHex(o.accent);
  const out = [];
  const add = (parent, mesh, outline = 0.03) => { if (outline) ink(mesh, outline); parent.add(mesh); out.push(mesh); return mesh; };
  for (const e of o.extras || []) {
    if (e === 'crest') {
      // a swept fin over the helmet: a rounded blade instead of a flat slab
      const c = add(M.head, new THREE.Mesh(EXTRA_GEO().crest, toon(o.accent)));
      c.position.set(0, 0.26, -0.04);
    } else if (e === 'pads') {
      for (const s of [-1, 1]) {
        const p = add(M.torso, new THREE.Mesh(EXTRA_GEO().pad, toon(o.accent)));
        p.position.set(s * 0.45, 0.88, 0);
        p.scale.set(1.1, 0.7, 1);
      }
    } else if (e === 'halo') {
      const h = add(M.head, new THREE.Mesh(EXTRA_GEO().halo, glow(o.accent)), 0);
      h.rotation.x = Math.PI / 2;
      h.position.y = 0.62;
    } else if (e === 'band') {
      const b = add(M.head, new THREE.Mesh(EXTRA_GEO().band, toon(0xd7263d)), 0.02);
      b.rotation.x = Math.PI / 2;
      b.position.y = 0.12;
    } else if (e === 'cape') {
      const c = add(M.torso, new THREE.Mesh(EXTRA_GEO().cape, toon(o.scarf, { side: THREE.DoubleSide })), 0);
      c.position.set(0, 0.9, -0.56);
      c.rotation.x = 0.25;
      c.userData.cape = true;
    }
  }
  return out;
}

// Skate finish: rail colour and the Derby horseshoes.
export function dressSkates(M, skatesId) {
  const s = SKATES[skatesId] || SKATES.stock;
  M.mats.skate.color.setHex(s.color);
  for (const h of M.hoofMeshes || []) h.removeFromParent();
  M.hoofMeshes = [];
  if (s.hooves) {
    for (const leg of [M.legL, M.legR]) {
      const shoe = new THREE.Mesh(EXTRA_GEO().shoe, HOOF_M);
      shoe.rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
      shoe.position.set(0, -1.0, 0.1);
      leg.add(shoe);
      M.hoofMeshes.push(shoe);
    }
  }
}

let extraGeo = null;
const HOOF_M = glow(0xd8d0c4);
function EXTRA_GEO() {
  if (!extraGeo) {
    // crest: a bevelled fin profile extruded thin, front edge low, sweeping up and back
    const sh = new THREE.Shape();
    sh.moveTo(0.3, -0.06); sh.quadraticCurveTo(0.22, 0.12, 0.02, 0.2); sh.quadraticCurveTo(-0.2, 0.26, -0.34, 0.1); sh.lineTo(-0.3, -0.06); sh.closePath();
    const crest = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 6 });
    crest.translate(0, 0, -0.035).rotateY(-Math.PI / 2);
    extraGeo = {
      crest,
      pad: new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      halo: new THREE.TorusGeometry(0.34, 0.035, 6, 24),
      band: new THREE.TorusGeometry(0.35, 0.06, 6, 16),
      cape: new THREE.PlaneGeometry(0.58, 1.1, 1, 4).translate(0, -0.55, 0),
      shoe: new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI * 1.4),
    };
  }
  return extraGeo;
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
    for (const x of this.extraMeshes) x.removeFromParent();
    this.extraMeshes = dressRunner(M, this.outfit);
    this.applySkates();
    this.save();
  }

  applySkates() {
    dressSkates(this.game.player.model, this.skates);
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
    for (const x of this.extraMeshes) if (x.userData.cape) { x.visible = !P.cargoMesh; x.rotation.x = 0.25 + Math.min(1.1, P.speed / 40) + Math.sin(g.time * 8) * 0.05; }
  }

  // C: the wardrobe screen (live preview + click-to-equip grids, see wardrobe.js).
  wardrobe() {
    if (!this.ui) this.ui = new Wardrobe(this.game, this);
    this.ui.open();
  }
}
