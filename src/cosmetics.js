import * as THREE from 'three';
import { toon, glow, ink } from './toon.js';
import { Wardrobe } from './wardrobe.js';
import { runnerExtra } from './models.js';

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

// Quantum-Lock Skate finishes, all sold by Meridian. Some need a deed, not just credits.
export const SKATES = {
  // tone: the skate hum's voice (audio.js setSkateTone): hum, glide or rumble (the gold rollers: jackpot)
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
  // the outfit's scarf: length, width, one tail or two (models.js ScarfSim)
  const [len, w, tails] = o.sc || [1.3, 0.22, 1];
  M.scarfStyle = { len, w, tails };
  const out = [];
  M.halo = null;
  if (M.antenna) M.antenna.visible = !(o.extras || []).includes('halo');
  const add = (parent, mesh, outline = 0.03) => { if (outline) ink(mesh, outline); parent.add(mesh); out.push(mesh); return mesh; };
  for (const e of o.extras || []) {
    if (e === 'crest') {
      // the Blender-built swept fin, its base sunk into the helmet (its outline is its own thin shell: see build_runner.py). The
      // code-built slab only if the file has none
      const g = runnerExtra('crest', { accent: toon(o.accent) });
      if (g) { M.head.add(g); out.push(g); }
      else {
        const c = add(M.head, new THREE.Mesh(EXTRA_GEO().crest, toon(o.accent)));
        c.position.set(0, 0.26, -0.04);
      }
    } else if (e === 'pads') {
      // Blender-built shoulder pads (three stepped lames, trim, ridge, studs) that turn with the arm; the
      // plain dome on the torso only if the file has none
      const mats = { accent: toon(o.accent), helmet: toon(o.helmet), metal: toon(0x3a3550) };
      for (const [s, arm, key] of [[-1, M.armL, 'padL'], [1, M.armR, 'padR']]) {
        const g = runnerExtra(key, mats);
        if (g) { arm.add(g); out.push(g); continue; }
        const p = add(M.torso, new THREE.Mesh(EXTRA_GEO().pad, toon(o.accent)));
        p.position.set(s * 0.45, 0.88, 0);
        p.scale.set(1.1, 0.7, 1);
      }
    } else if (e === 'halo') {
      // floats over the helmet on a magnetic spring (updateHalo); the antenna comes off, so the ring has nothing to pass through
      const h = add(M.head, new THREE.Mesh(EXTRA_GEO().halo, glow(o.accent)), 0);
      h.rotation.x = Math.PI / 2;
      h.position.y = HALO_Y;
      M.halo = new HaloSim(h);
    } else if (e === 'band') {
      // the Blender headband: a strip hugging the helmet, a knot with two tails behind the left ear. (Its outline
      // is a shell along its normals: ink()'s box scaling floated a black line above a torus.)
      const g = runnerExtra('band', { accent: toon(0xd7263d), dark: toon(0x3a0f18) });
      if (g) { M.head.add(g); out.push(g); }
      else {
        const b = add(M.head, new THREE.Mesh(EXTRA_GEO().band, toon(0xd7263d)), 0);
        b.rotation.x = Math.PI / 2;
        b.position.y = 0.12;
      }
    }
  }
  return out;
}

// The halo hangs above the helmet as if linked to it by magnets: a spring-and-damper in the head's own frame
// that the head's acceleration pushes on (so it lags behind a sprint, swings out in a turn, bobs on a landing)
// and that bumps (kick) set ringing. It slides a few centimetres and tilts at most 0.25 rad. A runner with a halo
// has no antenna (dressRunner), so nothing is there for it to pass through.
const HALO_Y = 0.62;
const _hp = new THREE.Vector3(), _ha = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hQ = new THREE.Quaternion(), _hE = new THREE.Euler();
export class HaloSim {
  constructor(mesh) {
    this.mesh = mesh;
    this.o = new THREE.Vector3(); this.ov = new THREE.Vector3(); // offset from rest (head frame) and its speed
    this.tx = 0; this.tz = 0; this.vx = 0; this.vz = 0;           // tilt about x and z, and its speed
    this.prev = null; this.prevVel = new THREE.Vector3(); this.t = Math.random() * 6;
  }

  // a bump of strength 0..1 (a landing, a hit): it rings, a little different every time
  kick(k) {
    this.vx += (Math.random() - 0.5) * 9 * k; this.vz += (Math.random() - 0.5) * 9 * k;
    this.ov.y += (Math.random() < 0.5 ? -1 : 1) * 0.35 * k;
  }

  // head: the model's head group
  update(dt, head) {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    head.getWorldPosition(_hp);
    head.getWorldQuaternion(_hq).invert();
    if (this.prev) {
      _ha.copy(_hp).sub(this.prev).divideScalar(dt); // world velocity of the head
      if (_ha.length() > 120) _ha.set(0, 0, 0);      // (a teleport isn't a swing)
      const v = _ha.clone();
      _ha.sub(this.prevVel).divideScalar(dt);        // ...and its acceleration
      this.prevVel.copy(v);
      if (_ha.length() > 80) _ha.setLength(80);
      _ha.applyQuaternion(_hq);                      // in the head's frame
    } else _ha.set(0, 0, 0);
    if (!this.prev) this.prev = new THREE.Vector3();
    this.prev.copy(_hp);
    // the airflow, a gentle hover wobble so it is never quite still, and the head's acceleration pushing on it
    const wob = Math.sin(this.t * 1.9) * 0.012, wob2 = Math.cos(this.t * 1.4) * 0.012;
    const K = 60, C = 7, KT = 45, CT = 5;
    this.ov.x += (-_ha.x * 0.12 - K * this.o.x - C * this.ov.x) * dt;
    this.ov.z += (-_ha.z * 0.12 - K * this.o.z - C * this.ov.z) * dt;
    this.ov.y += (-_ha.y * 0.08 - K * this.o.y - C * this.ov.y) * dt;
    this.vx += (-_ha.z * 0.34 - KT * (this.tx - wob) - CT * this.vx) * dt;
    this.vz += (_ha.x * 0.34 - KT * (this.tz - wob2) - CT * this.vz) * dt;
    this.o.addScaledVector(this.ov, dt);
    this.tx += this.vx * dt; this.tz += this.vz * dt;
    this.o.x = Math.max(-0.05, Math.min(0.05, this.o.x)); this.o.z = Math.max(-0.05, Math.min(0.05, this.o.z));
    this.o.y = Math.max(-0.025, Math.min(0.06, this.o.y));
    this.tx = Math.max(-0.25, Math.min(0.25, this.tx)); this.tz = Math.max(-0.25, Math.min(0.25, this.tz));
    this.mesh.position.set(this.o.x, HALO_Y + this.o.y, this.o.z);
    _hE.set(this.tx, 0, this.tz, 'XYZ');
    this.mesh.quaternion.setFromEuler(_hE).multiply(_hQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  }
}

// Per frame, for whatever runner wears a halo (the player, the wardrobe's mannequin)
export function updateHalo(M, dt) {
  if (M.halo) M.halo.update(dt, M.head);
}

// Skate finish: rail colour and the Derby horseshoes.
export function dressSkates(M, skatesId) {
  const s = SKATES[skatesId] || SKATES.stock;
  M.mats.skate.color.setHex(s.color);
  for (const h of M.hoofMeshes || []) h.removeFromParent();
  M.hoofMeshes = [];
  if (s.coins) {
    // casino bling: a big medallion on the outside of each boot and a row of studs along the rail
    const face = s.coins === 'gold' ? COIN_GOLD : CHIP_GREEN;
    for (const [leg, side] of [[M.legL, -1], [M.legR, 1]]) {
      const med = new THREE.Mesh(EXTRA_GEO().coin, face);
      med.rotation.z = Math.PI / 2;
      med.position.set(side * 0.13, -0.86, 0.02);
      leg.add(med);
      M.hoofMeshes.push(med);
      for (let k = 0; k < 3; k++) {
        const stud = new THREE.Mesh(EXTRA_GEO().stud, s.coins === 'gold' ? COIN_RIM : CHIP_RIM);
        stud.position.set(side * 0.09, -0.98, -0.12 + k * 0.12);
        leg.add(stud);
        M.hoofMeshes.push(stud);
      }
    }
  }
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
const COIN_GOLD = new THREE.MeshToonMaterial({ color: 0xffd23f, emissive: 0x6a4a00 });
const COIN_RIM = glow(0xfff6a8);
const CHIP_GREEN = new THREE.MeshToonMaterial({ color: 0x1f8a4a, emissive: 0x0a3a1a });
const CHIP_RIM = glow(0xffffff);
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
      coin: new THREE.CylinderGeometry(0.075, 0.075, 0.02, 14),
      stud: new THREE.SphereGeometry(0.022, 6, 4),
      trailCoin: new THREE.CylinderGeometry(0.13, 0.13, 0.03, 12),
      band: new THREE.TorusGeometry(0.35, 0.06, 6, 16),
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
    this.jarShown = true; // wear the containment jar on your pack (if you own one)
    this.extraMeshes = [];
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d) Object.assign(this, { outfit: d.outfit || 'courier', skates: d.skates || 'stock', laser: d.laser || 0, jarShown: d.jarShown !== false });
    } catch { /* default look */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ outfit: this.outfit, skates: this.skates, laser: this.laser, jarShown: this.jarShown })); } catch { /* unavailable */ }
  }

  owned(kind, id) {
    if (kind === 'outfit') return id === 'courier' || (this.game.upgrades['outfit_' + id] || 0) > 0;
    return id === 'stock' || (this.game.upgrades['skates_' + id] || 0) > 0;
  }

  // the jar on your pack: only there to show once Dr. Zbornak has sold you one
  get hasJar() { return !!(this.game.alchemy && this.game.alchemy.owned); }
  setJarShown(on) {
    this.jarShown = on;
    this.save();
    if (this.game.alchemy) this.game.alchemy.refreshJarMesh();
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
    const a = this.game.audio;
    if (a && a.setSkateTone) a.setSkateTone(this.skate.tone || 'hum'); // (each pair of skates hums in its own voice)
  }

  // Per frame: skate glow, prism hue, trails.
  update(dt) {
    const g = this.game;
    const P = g.player;
    const b = P.body;
    const s = this.skate;
    const mat = P.model.mats.skate;
    // the glide ribbons under the skates take the finish's trail colour (cyan on the stock skates)
    if (g.fx.trails) { const tc = s.trail ? this.trailColor(g.time) : 0x2ee6ff; for (const t of g.fx.trails) t.mat.uniforms.color.value.set(tc); }
    if (s.rainbow) mat.color.setHSL((g.time * 0.4) % 1, 1, 0.6);
    else mat.color.setHex(b.skating ? s.color : 0x3a3550);
    if (s.coins) this.updateCoins(dt, s);
    else if (this.coins) for (const c of this.coins) if (c.on) { c.on = false; c.mesh.visible = false; }
    else if (s.trail && b.skating && b.grounded && P.speed > 12 && Math.random() < dt * (s.flame ? 60 : 35)) {
      const back = P.pos.clone().addScaledVector(P.up, s.flame ? 0.3 : 0.15);
      g.fx.spawn(back, P.vel.clone().multiplyScalar(-0.15).addScaledVector(P.up, s.flame ? 2.5 : 0.5), { color: this.trailColor(g.time), size: s.flame ? 0.45 : 0.3, life: s.flame ? 0.45 : 0.7, count: 1, spread: 0.6 });
    }
  }

  // Casino skates: puffs of glittery smoke at the heels, and every so often a shiny coin (or a poker
  // chip) pops out of the smoke, spins up, bounces and fades.
  updateCoins(dt, s) {
    const g = this.game;
    const P = g.player;
    const b = P.body;
    const gold = s.coins === 'gold';
    if (!this.coins) this.coins = [];
    const going = b.skating && b.grounded && P.speed > 12;
    if (going && Math.random() < dt * 30) {
      g.fx.spawn(P.pos.clone().addScaledVector(P.up, 0.25), P.vel.clone().multiplyScalar(-0.12).addScaledVector(P.up, 1.2), { color: Math.random() < 0.7 ? (gold ? 0xe8dcc0 : 0xc8e8c8) : s.trail, size: 0.7, life: 0.9, count: 1, spread: 0.8 });
    }
    if (going && Math.random() < dt * Math.min(9, P.speed / 7)) {
      let c = this.coins.find((x) => !x.on);
      if (!c && this.coins.length < 28) {
        const mesh = new THREE.Mesh(EXTRA_GEO().trailCoin, gold ? COIN_GOLD : (this.coins.length % 3 === 0 ? CHIP_RIM : CHIP_GREEN));
        ink(mesh, 0.015);
        g.scene.add(mesh);
        c = { mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
        this.coins.push(c);
      }
      if (c) {
        const side = new THREE.Vector3().crossVectors(P.heading, P.up);
        c.on = true; c.t = 0; c.bounced = false;
        c.mesh.visible = true;
        c.mesh.scale.setScalar(1);
        c.mesh.position.copy(P.pos).addScaledVector(P.up, 0.4).addScaledVector(P.heading, -0.6);
        c.vel.copy(P.vel).multiplyScalar(0.12).addScaledVector(P.up, 4 + Math.random() * 3).addScaledVector(side, (Math.random() - 0.5) * 5);
        c.spin.set(Math.random() * 14, Math.random() * 8, Math.random() * 14);
      }
    }
    for (const c of this.coins) {
      if (!c.on) continue;
      c.t += dt;
      const up = c.mesh.position.clone().normalize();
      c.vel.addScaledVector(up, -6 * dt);
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
      const sr = g.planet.surface(c.mesh.position);
      if (c.mesh.position.length() < sr + 0.05) {
        c.mesh.position.setLength(sr + 0.05);
        const vn = c.vel.dot(up);
        if (vn < 0) c.vel.addScaledVector(up, -vn * (c.bounced ? 1 : 1.55));
        c.vel.multiplyScalar(0.6);
        if (!c.bounced) { c.bounced = true; if (Math.random() < 0.3 && P.pos.distanceTo(c.mesh.position) < 40) g.audio.tone(gold ? 2400 + Math.random() * 600 : 1600, 0.05, 'triangle', 0.03); }
      }
      if (c.t > 1.1) c.mesh.scale.setScalar(Math.max(0.01, 1 - (c.t - 1.1) / 0.4));
      if (c.t > 1.5) { c.on = false; c.mesh.visible = false; }
    }
  }

  // C: the wardrobe screen (live preview + click-to-equip grids, see wardrobe.js).
  wardrobe() {
    if (!this.ui) this.ui = new Wardrobe(this.game, this);
    this.ui.open();
  }
}
