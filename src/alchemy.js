import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeFigure } from './models.js';
import { toon, glow, ink } from './toon.js';
import { frameQuat, tangent, greatCircle, SUN, arcDist } from './geo.js';
import { pick, mulberry32 } from './rng.js';
import { LIVING, spliceGenes, makeChimera, makeMite } from './chimera.js';

// What can go in a containment jar.
export const ITEMS = {
  rock: { name: 'Rock Sample', icon: '◆', color: '#2ee6ff' },
  dirt: { name: 'Moon Dirt', icon: '▲', color: '#c9b79c' },
  water: { name: 'Black Water', icon: '●', color: '#7b5cff' },
  person: { name: 'A Person', icon: '☺', color: '#ff9f1c' },
  mite: { name: 'Moon Mite', icon: '✶', color: '#b8e986' },
  car: { name: 'Hover-Car', icon: '▣', color: '#ff7ad9', slots: 2 },
  pirate: { name: 'Knocked-Out Pirate', icon: '☠', color: '#7dff3a' },
  sapling: { name: 'Farm Sapling', icon: '♣', color: '#5fbf4a' },
  wiring: { name: 'Electrical Wiring', icon: '≋', color: '#ffb347' },
  engine: { name: 'Salvaged Engine', icon: '⚙', color: '#ff6a2a' },
  lens: { name: 'Searchlight Lens', icon: '◎', color: '#fff6a8' },
  transponder: { name: 'Signal Transponder', icon: '⌁', color: '#2ec4ff' },
  plating: { name: 'Scrap Plating', icon: '▤', color: '#9aa7bb' },
  junkbot: { name: 'Junk Bot', icon: '☐', color: '#ffb347' },
  // things that happen when items sit together in a jar
  mud: { name: 'Moon Mud', icon: '≈', color: '#8a6a4a' },
  slickrock: { name: 'Slick Rock', icon: '◈', color: '#9be7ff' },
  voidling: { name: 'Void-Touched Person', icon: '☻', color: '#c77dff' },
};

// Slow reactions inside the jar (pairs that sit together for a while turn into something else).
const JAR_MIXES = [
  { a: 'dirt', b: 'water', into: 'mud', text: 'The dirt and the black water turned into MOON MUD.' },
  { a: 'rock', b: 'water', into: 'slickrock', text: 'The rock sample is coated in black slime. SLICK ROCK!' },
  { a: 'person', b: 'water', into: 'voidling', text: 'Your passenger has gone… purple. VOID-TOUCHED!' },
  { a: 'mite', b: 'person', into: null, text: 'The mite has crawled into your passenger\'s helmet. They seem… fine?' },
];
const MIX_TIME = 12;

// What splicing yourself in the pod does, by jar item.
export const MUTATIONS = {
  wheels: { name: 'WHEEL FEET', from: ['car'], desc: 'Run at 22 m/s in boots' },
  wings: { name: 'MITE WINGS', from: ['mite'], desc: 'Fall slowly: 60% gravity while airborne' },
  arms: { name: 'EXTRA ARMS', from: ['person'], desc: 'Fire 30% faster' },
  void: { name: 'VOID SKIN', from: ['water', 'voidling'], desc: 'See in the dark; harder to hit' },
  stone: { name: 'STONE HIDE', from: ['rock', 'slickrock'], desc: '+40 max hull, a bit more drag' },
  claws: { name: 'BURROWER CLAWS', from: ['dirt', 'mud'], desc: 'Painless landings in boots' },
  blood: { name: 'PIRATE BLOOD', from: ['pirate'], desc: 'Pirates hunt you far less' },
  roots: { name: 'ROOT GRIP', from: ['sapling'], desc: 'Skates grip 30% harder' },
  hawk: { name: 'HAWK EYE', from: ['lens'], desc: 'Red enemy outlines reach 50% farther; sharper scope' },
};
const MAX_MUTATIONS = 3;
const MAX_FOLLOW = 3;
// holding pen area behind the lab (lab-local coordinates) and how many pen residents get models
export const PEN = { x0: 28, z0: 22, x1: 62, z1: 64 };
const PEN_SHOWN = 36;
const KEY = 'moonrunner-lab-v1';

const NAMES = ['Gary', 'Priya', 'Tomasz', 'Little Juno', 'Ade', 'Wen', 'Marisol', 'Big Lars', 'Fen', 'Doris', 'Okon', 'Bea'];

const _v = new THREE.Vector3();

// Containment jar + Dr. Zbornak's reactor and splice pod: scoop things up, let them stew,
// feed them to the antimatter, breed chimeras, and occasionally mutate yourself.
export class Alchemy {
  constructor(game) {
    this.game = game;
    this.jar = [];
    this.mixT = 0;
    this.followers = [];
    this.wanderers = [];
    this.statues = 0;
    this.buffs = { lowGrav: 0, slick: 0, bouncy: 0, invert: 0, rain: 0, cushion: 0 };
    this.monoCd = 0;
    this.jarMesh = null;
    this.chimeras = [];
    this.mutations = [];
    this.mutMeshes = [];
    this.pen = [];
    this.loot = []; // salvage lying on the ground (engines from wrecks, depot wiring, farm saplings)
    this.load();
    this.buildMites();
  }

  get owned() { return (this.game.upgrades.jar || 0) > 0; }
  get slots() { return 2 + (this.game.upgrades.jar || 0); }
  // the alien artifact rides in its own sealed compartment of the jar: it takes a slot but is never dumped or fed
  get used() { return this.jar.reduce((n, i) => n + (ITEMS[i.kind].slots || 1), 0) + (this.artifact ? 1 : 0); }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d) return;
      this.chimeras = d.chimeras || [];
      this.mutations = d.mutations || [];
      this.artifact = !!d.artifact;
    } catch { /* fresh lab */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ chimeras: this.chimeras, mutations: this.mutations, artifact: !!this.artifact })); } catch { /* unavailable */ }
  }

  // called once the world and player exist
  start() {
    this.syncChimeras();
    this.applyMutations();
  }

  // ---------- wild Moon Mites ----------
  buildMites() {
    // herds of 3–6 mites around sunlit craters, well away from settlements
    const rr = mulberry32(8080);
    const g = this.game;
    this.mites = [];
    let herds = 0;
    for (let tries = 0; tries < 4000 && herds < 34; tries++) {
      const u = rr() * 2 - 1, th = rr() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      const d = new THREE.Vector3(sq * Math.cos(th), u, sq * Math.sin(th));
      if (d.dot(SUN) < 0.15) continue;
      if (g.locations.some((l) => arcDist(d, l.dir) < (l.zoneR || l.r) * 1.3)) continue;
      herds++;
      const n = 3 + Math.floor(rr() * 4);
      for (let k = 0; k < n; k++) {
        const t = tangent(new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5), d).normalize();
        const home = greatCircle(d, t, rr() * 18);
        this.mites.push({ home, pos: null, dir: tangent(new THREE.Vector3(1, 0, 0), home).normalize(), model: null, gone: 0, t: rr() * 10, hop: 0, vy: 0 });
      }
    }
  }

  updateMites(dt) {
    const g = this.game;
    const P = g.player;
    for (const m of this.mites) {
      if (m.gone > 0) { m.gone -= dt; continue; }
      const near = arcDist(P.pos, m.home) < 400;
      if (!near) { if (m.model) { m.model.root.removeFromParent(); m.model = null; } continue; }
      if (!m.model) {
        m.model = makeMite();
        g.scene.add(m.model.root);
        m.pos = g.planet.ground(m.home, new THREE.Vector3());
      }
      m.t += dt;
      const up = m.pos.clone().normalize();
      const d = m.pos.distanceTo(P.pos);
      let speed = 2.5;
      if (d < 14 && P.speed > 6) { m.dir = tangent(m.pos.clone().sub(P.pos), up).normalize(); speed = 9; }
      else if (Math.random() < dt * 0.5) m.dir = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      if (arcDist(m.pos, m.home) > 35) m.dir = tangent(m.home.clone().sub(up), up).normalize();
      const next = greatCircle(up, m.dir, speed * dt);
      m.hop += m.vy * dt; m.vy -= 4 * dt;
      if (m.hop <= 0) { m.hop = 0; m.vy = Math.random() < dt * 2 ? 2.5 : 0; }
      m.pos.copy(g.planet.ground(next, new THREE.Vector3()));
      m.model.root.position.copy(m.pos).addScaledVector(next, m.hop);
      frameQuat(next, m.dir, m.model.root.quaternion);
      m.model.anim(m.t, speed);
    }
  }

  // ---------- collecting ----------
  scoop() {
    const g = this.game;
    const P = g.player;
    if (!this.owned) { g.hud.toast('You need a containment jar. Dr. Zbornak sells them at the Antimatter Lab.', 3); return; }
    if (this.used >= this.slots) { g.hud.toast('Jar is full. Empty it with X (into the reactor, if you\'re brave).', 2.5); return; }
    // knocked-out pirates first
    for (const e of g.enemies.list) {
      if (e.dead || e.kind !== 'skater' || e.faction !== 'pirate' || e.hp > e.maxHp * 0.45) continue;
      if (e.center.distanceTo(P.center) > 7) continue;
      e.dead = true;
      e.model.root.removeFromParent();
      if (e.carrying) { e.carrying = false; g.enemies.dropCargo(e.center.clone()); }
      if (g.rep.aligned()) g.rep.add('rustmoon', -3, 'Jarred a pirate');
      this.add('pirate', pick(['Grit', 'Sal', 'Imelda', 'Rusty', 'Knuckles']));
      g.fx.pop('PIRATE IN A JAR!', null, { color: '#7dff3a', size: 50 });
      return;
    }
    // hover-cars (they take two slots)
    for (const v of g.world.vehicles) {
      if (v.kind !== 'car' || v.captured > 0 || v.pos.distanceTo(P.pos) > 10) continue;
      if (this.slots - this.used < 2) { g.hud.toast('A whole hover-car needs two free slots.', 2); return; }
      v.captured = 150;
      v.root.visible = false;
      if (v.col) { g.colliders.remove(v.col); v.col = null; }
      this.add('car');
      g.fx.pop('IT… FIT?!', null, { color: '#ff7ad9', size: 56 });
      return;
    }
    // wild mites
    for (const m of this.mites) {
      if (!m.model || m.gone > 0 || m.pos.distanceTo(P.pos) > 5) continue;
      m.model.root.removeFromParent();
      m.model = null;
      m.gone = 120;
      this.add('mite');
      g.fx.pop('MITE CAUGHT!', null, { color: '#b8e986', size: 46 });
      return;
    }
    // people
    let best = null, bd = 6;
    for (const f of g.world.figures) {
      if (!f.root.visible || f.captured || f.loc.restricted) continue;
      const d = f.root.getWorldPosition(_v).distanceTo(P.pos);
      if (d < bd) { bd = d; best = { kind: 'figure', f }; }
    }
    for (const w of this.wanderers) {
      const d = w.root.position.distanceTo(P.pos);
      if (d < bd) { bd = d; best = { kind: 'wanderer', w }; }
    }
    if (best) {
      const name = best.kind === 'figure' ? pick(NAMES) : best.w.name;
      if (best.kind === 'figure') { best.f.captured = true; best.f.root.visible = false; }
      else { best.w.root.removeFromParent(); this.wanderers = this.wanderers.filter((w) => w !== best.w); }
      this.add(best.kind === 'wanderer' && best.w.purple ? 'voidling' : 'person', name);
      g.fx.pop(`GOTCHA, ${name.toUpperCase()}!`, null, { color: '#ff9f1c', size: 46 });
      if (best.kind === 'figure') g.rep.add(best.f.loc.faction, -1, 'Jarred a resident', { silent: true });
      return;
    }
    for (const c of g.world.crystals) {
      if (c.taken || c.pos.distanceTo(P.pos) > 6) continue;
      c.taken = true;
      this.add('rock');
      g.fx.pop('ROCK SAMPLE!', null, { color: '#2ee6ff', size: 46 });
      return;
    }
    if (P.body.onLake && P.body.grounded) { this.add('water'); g.fx.pop('BLACK WATER!', null, { color: '#c77dff', size: 46 }); return; }
    if (P.body.grounded || P.body.altitude < 1.5) { this.add('dirt'); g.fx.dust(P.pos, P.vel, 6, P.up); g.fx.pop('MOON DIRT!', null, { color: '#c9b79c', size: 40 }); return; }
    g.hud.toast('Nothing to scoop up here.', 1.5);
  }

  // ---------- salvage on the ground ----------
  // Something worth scooping drops out of a wreck. Skate over it to bag it (needs jar room); credits
  // are picked up whether or not you have a jar.
  // to: optional landing point — the loot is flung out of the wreck along an arc and lands there,
  // in the open where you can see it (with a beacon so it isn't lost in rubble).
  dropLoot(kind, pos, { name, credits = 0, to = null, crate = false } = {}) {
    const g = this.game;
    const up = pos.clone().normalize();
    const land = to || pos.clone().addScaledVector(tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize(), 1 + Math.random() * 2);
    const at = g.planet.ground(land, new THREE.Vector3(), 0.9);
    const root = new THREE.Group();
    const color = crate ? 0xff7ad9 : credits && !kind ? 0xffd23f : new THREE.Color(ITEMS[kind].color).getHex();
    const geo = crate ? new THREE.BoxGeometry(0.9, 0.9, 0.9) : kind === 'engine' ? new THREE.CylinderGeometry(0.5, 0.5, 0.9, 8).rotateZ(Math.PI / 2) : kind === 'plating' ? new THREE.BoxGeometry(1, 0.15, 0.8) : kind === 'junkbot' ? new THREE.BoxGeometry(0.6, 0.5, 0.6) : new THREE.OctahedronGeometry(0.45, 0);
    const core = new THREE.Mesh(geo, toon(color));
    ink(core, 0.05);
    root.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 20).rotateX(Math.PI / 2), glow(color));
    halo.position.y = -0.6;
    root.add(halo);
    // a thin light pillar so it's easy to spot
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.25, 9, 6, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 4;
    root.add(beam);
    frameQuat(at.clone().normalize(), tangent(SUN.clone(), up).normalize(), root.quaternion);
    g.scene.add(root);
    const from = pos.clone().addScaledVector(up, 2);
    root.position.copy(to ? from : at);
    this.loot.push({ kind, name, credits, crate, root, core, pos: at, from, fly: to ? 0 : 1, flyT: 0.9 + from.distanceTo(at) / 25, t: 0 });
  }

  updateLoot(dt) {
    const g = this.game;
    const P = g.player;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      L.t += dt;
      if (L.fly < 1) {
        // ballistic hop from the wreck to its landing spot
        L.fly = Math.min(1, L.fly + dt / L.flyT);
        const k = L.fly;
        L.root.position.lerpVectors(L.from, L.pos, k).addScaledVector(L.pos.clone().normalize(), Math.sin(k * Math.PI) * (6 + L.from.distanceTo(L.pos) * 0.25));
        if (L.fly >= 1) { this.game.fx.dust(L.pos, new THREE.Vector3(), 6, L.pos.clone().normalize()); this.game.audio.thud(8); }
        continue;
      }
      L.core.rotation.y += dt * 2;
      L.core.position.y = Math.sin(L.t * 3) * 0.15;
      let take = false;
      if (!P.dead && L.pos.distanceTo(P.pos) < 3.5) {
        if (L.crate) { this.openCrate(); take = true; }
        if (L.credits) { g.addCredits(L.credits, 'Salvage'); g.fx.pop(`+₵${L.credits}`, null, { color: '#ffd23f', size: 44 }); L.credits = 0; if (!L.kind) take = true; }
        if (L.kind) {
          if (this.owned && this.used + (ITEMS[L.kind].slots || 1) <= this.slots) {
            this.add(L.kind, L.name);
            g.fx.pop(`${ITEMS[L.kind].name.toUpperCase()}!`, null, { color: ITEMS[L.kind].color, size: 42 });
            take = true;
          } else if (!L.warned) { L.warned = true; g.hud.toast(this.owned ? `Jar is full: no room for the ${ITEMS[L.kind].name.toLowerCase()}.` : `A ${ITEMS[L.kind].name.toLowerCase()}! You need a containment jar to carry it.`, 2.5); }
        }
      } else if (L.warned && L.pos.distanceTo(P.pos) > 8) L.warned = false;
      if (take || L.t > 240) { L.root.removeFromParent(); this.loot.splice(i, 1); }
    }
  }

  // a Trading Kiosk mystery crate: open it on the spot
  openCrate() {
    const g = this.game;
    const r = Math.random();
    g.audio.cash();
    if (r < 0.6) {
      const n = 120 + Math.floor(Math.random() * 331);
      g.addCredits(n, 'Mystery crate');
      g.fx.pop(`CRATE: +₵${n}!`, null, { color: '#ffd23f', size: 50 });
    } else if (r < 0.92 && g.casino) {
      const n = 8 + Math.floor(Math.random() * 18);
      g.casino.st.chips += n;
      g.fx.pop(`CRATE: ${n} LUCKY CHIPS!`, null, { color: '#7dff6a', size: 50 });
      g.hud.toast('Lucky Chips spend at the Lucky Crater Casino prize counter.', 3);
    } else {
      // jackpot: a big wad and a style splash
      const n = 900 + Math.floor(Math.random() * 600);
      g.addCredits(n, 'Mystery crate');
      g.fx.pop(`JACKPOT CRATE! +₵${n}`, null, { color: '#ff7ad9', size: 64 });
      g.style(60, 'JACKPOT CRATE');
    }
    g.save();
  }

  add(kind, name) {
    if (kind === 'transponder' && this.game.globe && this.game.globe.revealAround) {
      // it pings as you bag it: the map around you lights up
      this.game.globe.revealAround(this.game.player.up, 1400);
      this.game.fx.pop('SIGNAL PING: MAP REVEALED NEARBY', null, { color: '#2ec4ff', size: 34 });
    }
    this.jar.push({ kind, name });
    this.mixT = 0;
    this.game.audio.pickup();
    this.refreshJarMesh();
  }

  // ---------- emptying ----------
  // X: into the reactor if you're beside it, otherwise tip it out. Shift+X always tips it out.
  empty(forceDump = false) {
    const g = this.game;
    if (!this.jar.length) { g.hud.toast(this.owned ? (this.artifact ? 'Only the alien artifact is left, and its compartment is sealed.' : 'The jar is empty. Scoop something with G.') : 'You don\'t have a jar yet.', 1.8); return; }
    const lab = g.world.lab;
    if (!forceDump && lab && g.player.pos.distanceTo(lab.reactor) < 11) this.feedReactor();
    else this.dump();
    this.jar = [];
    this.refreshJarMesh();
  }

  dump() {
    const g = this.game;
    const P = g.player;
    for (const it of this.jar) {
      if (it.kind === 'person' || it.kind === 'voidling' || it.kind === 'pirate') this.spawnWanderer(it.name, it.kind === 'voidling', it.kind === 'pirate');
      else if (it.kind === 'mite') { const m = this.mites.find((x) => x.gone > 0); if (m) { m.gone = 0; m.home = P.pos.clone().normalize(); } }
      else if (it.kind === 'sapling') { g.fx.spawn(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().multiplyScalar(2), { color: 0x5fbf4a, size: 0.4, life: 1, gravity: 2, count: 10, spread: 3 }); g.fx.pop('REPLANTED!', null, { color: '#5fbf4a', size: 36 }); }
      else if (it.kind === 'junkbot') { g.fx.pop(`${(it.name || 'BOT').toUpperCase()}: BEEP BOOP!`, null, { color: '#ffb347', size: 36 }); g.fx.spawn(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().multiplyScalar(3), { color: 0xffb347, size: 0.3, life: 0.6, gravity: 2, count: 8, spread: 2 }); }
      else if (it.kind === 'engine') { this.dropLoot('engine', P.pos.clone().addScaledVector(g.cam.right, 3)); continue; }
      else if (it.kind === 'wiring') g.fx.spawn(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().multiplyScalar(3), { color: 0xffb347, size: 0.3, life: 0.6, gravity: 2, count: 8, spread: 2 });
      else if (it.kind === 'car') { const v = this.game.world.vehicles.find((x) => x.captured > 0); if (v) v.captured = 0.01; g.fx.pop('BEEP BEEP!', null, { color: '#ff7ad9', size: 40 }); }
      else if (it.kind === 'rock' || it.kind === 'slickrock') g.fx.spawn(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().multiplyScalar(3), { color: 0x2ee6ff, size: 0.5, life: 1, gravity: 2, count: 6, spread: 3 });
      else g.fx.spawn(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().multiplyScalar(2), { color: it.kind === 'dirt' ? 0xc9b79c : 0x2a1f4f, size: 0.4, life: 1, gravity: 2, count: 10, spread: 3 });
    }
    const freed = this.jar.filter((i) => LIVING.includes(i.kind)).length;
    const lost = this.jar.length - freed;
    g.fx.pop(freed && lost ? 'DUMPED!' : freed ? 'SET FREE!' : 'DESTROYED!', null, { color: '#c9c3d9', size: 44 });
    g.hud.toast(`Jar dumped: ${freed ? `${freed} creature${freed > 1 ? 's' : ''} popped back out` : ''}${freed && lost ? ', ' : ''}${lost ? `${lost} material${lost > 1 ? 's' : ''} destroyed` : ''}.`, 2.5);
  }

  // Free people wander off (and can be scooped up again).
  spawnWanderer(name, purple, pirate, at) {
    const g = this.game;
    const P = g.player;
    const f = makeFigure({ suit: pirate ? 0x3a2b4f : purple ? 0xc77dff : 0xff9f1c, visor: purple || pirate ? 0x7dff3a : 0x241a5c, helmet: pirate ? 0x2b2b2b : 0xfff4e0 });
    const pos = g.planet.ground(at || P.pos.clone().addScaledVector(g.cam.right, 3), new THREE.Vector3());
    f.root.position.copy(pos);
    g.scene.add(f.root);
    this.wanderers.push({ ...f, purple, name: name || pick(NAMES), dir: tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), pos.clone().normalize()).normalize(), t: 0 });
    g.fx.pop(`${(name || 'THEY').toUpperCase()} IS FREE!`, null, { color: '#ff9f1c', size: 36 });
  }

  // ---------- the reactor ----------
  feedReactor() {
    const g = this.game;
    const kinds = this.jar.map((i) => i.kind).sort();
    const key = kinds.join('+');
    const names = this.jar.filter((i) => i.name).map((i) => i.name);
    const r = g.world.reactor;
    r.flash = 1.5;
    g.audio.boom(false);
    g.cam.shake = Math.max(g.cam.shake, 0.6);
    const living = this.jar.filter((i) => LIVING.includes(i.kind));
    const mods = this.jar.length - living.length;
    const unique = new Set(kinds);
    let res;
    if (living.length >= 2 || (living.length === 1 && living[0].kind !== 'person' && living[0].kind !== 'voidling' && mods > 0)) res = this.breed(this.jar);
    else if (kinds.length >= 3 && unique.size === kinds.length) res = this.singularity();
    else if (kinds.length >= 3 && unique.size === 1) res = this.resonance(kinds[0]);
    else res = (RECIPES[key] || RECIPES._default).call(this, names);
    g.stats.experiments = (g.stats.experiments || 0) + 1;
    g.dialog('DR. ZBORNAK', `<b>${res.title}</b><br>${res.text}`, [{ label: 'FOR SCIENCE!' }]);
  }

  // Two or more bodies in the reactor: out comes a chimera.
  breed(items) {
    const g = this.game;
    const genes = spliceGenes(items);
    genes.follow = this.followingCount() < MAX_FOLLOW;
    this.chimeras.push(genes);
    this.save();
    this.syncChimeras();
    if (items.some((i) => i.kind === 'person' || i.kind === 'voidling')) g.rep.add('kepler', -2, 'Spliced a resident', { silent: true });
    g.fx.pop(`IT'S ${genes.name.toUpperCase()}!`, null, { color: '#7dff3a', size: 60 });
    g.style(40, 'NEW CHIMERA');
    const parts = `${genes.body} body, ${genes.legs} legs, ${genes.head} head${genes.extraHead ? `, and a spare ${genes.extraHead} head` : ''}`;
    return {
      title: `BEHOLD: ${genes.name.toUpperCase()}`,
      text: `"It has a ${parts}${genes.mods.length ? `, ${genes.mods.join(' and ')}-touched` : ''}. Top speed about ${Math.round(genes.speed * 3.6)} km/h, chaos rating ${genes.chaos}. It loves you. ${genes.follow ? 'Race it at the Bounce Dome Funpark!' : 'Three already follow you, so it\'s gone to the holding pen behind the lab.'}"`,
    };
  }

  singularity() {
    const g = this.game;
    const P = g.player;
    g.world.reactor.flash = 4;
    g.fx.explosion(g.world.lab.reactor, 22, true);
    P.vel.addScaledVector(P.up, 70);
    this.buffs.cushion = 25; // the reactor's field softens the landing
    P.body.grounded = false;
    P.body.sinceContact = 1;
    g.style(120, 'SINGULARITY');
    g.addCredits(300, 'Data');
    g.actionPanel('launch', null, 'THE REACTOR SAID NO.');
    return { title: 'SINGULARITY!', text: '"Three different things at once?! The containment field folded in half and spat you through the roof. Magnificent. Here is your share of the data."' };
  }

  resonance(kind) {
    this.buffs.bouncy = 40;
    return { title: 'RESONANCE', text: `"Three ${ITEMS[kind].name}s, perfectly in tune. You are now… springy. Everything you land on will bounce you for a while."` };
  }

  // ---------- the MEGA MITE ----------
  spawnMegaMite() {
    const g = this.game;
    const lab = g.world.lab;
    const P = g.player;
    // out by the lab door if you're there (it came out of the reactor), otherwise right in front of you
    const atLab = lab && P.pos.distanceTo(lab.reactor) < 300;
    const spot = atLab ? g.world.toWorld(lab.loc, 0, 0, 60) : P.pos.clone().addScaledVector(P.heading, 70);
    const pos = g.planet.ground(spot, new THREE.Vector3());
    const m = makeChimera({ seed: 7, body: 'mite', legs: 'mite', head: 'mite', extraHead: 'mite', mods: ['void'], size: 6, tint: 0xb8e986 });
    m.root.position.copy(pos);
    g.scene.add(m.root);
    const e = { kind: 'megamite', faction: 'beast', model: m, hp: 600, maxHp: 600, body: { pos: pos.clone(), vel: new THREE.Vector3() }, center: pos.clone(), radius: 7, dead: false, t: 0, hop: 0, vy: 0, dir: tangent(P.pos.clone().sub(pos), pos.clone().normalize()).normalize(), stompCd: 0 };
    g.enemies.list.push(e);
    g.hud.alert('MEGA MITE ON THE LOOSE!', '#b8e986', 4);
    g.audio.alarm();
  }

  updateBeast(e, dt) {
    const g = this.game;
    const P = g.player;
    e.t += dt;
    const up = e.body.pos.clone().normalize();
    const to = tangent(P.pos.clone().sub(e.body.pos), up);
    const d = to.length();
    if (d > 2) e.dir.copy(to).normalize();
    const speed = d < 400 ? 16 : 6;
    const next = greatCircle(up, e.dir, speed * dt);
    e.hop += e.vy * dt; e.vy -= 8 * dt;
    if (e.hop <= 0) {
      if (e.vy < -6) {
        // STOMP (only felt, seen and heard when you're nearby)
        const dist = P.pos.distanceTo(e.body.pos);
        if (dist < 400) {
          g.fx.explosion(e.body.pos.clone().addScaledVector(up, 1), 10, true);
          if (g.planet.visible(g.camera.position, e.center)) g.fx.pop('STOMP!', e.body.pos.clone().addScaledVector(up, 6), { color: '#b8e986', size: 70 });
          g.audio.thud(Math.max(5, 40 - dist / 10));
        }
        if (dist < 16) { g.damagePlayer(14, 'ram'); P.vel.addScaledVector(P.up, 12); P.body.grounded = false; }
        if (dist < 120) g.cam.shake = Math.max(g.cam.shake, 0.8);
      }
      e.hop = 0;
      e.vy = 9 + Math.random() * 4;
    }
    const before = e.body.pos.clone();
    e.body.pos.copy(g.planet.ground(next, new THREE.Vector3()));
    e.body.vel.copy(e.body.pos).sub(before).divideScalar(Math.max(dt, 1e-3));
    e.model.root.position.copy(e.body.pos).addScaledVector(next, e.hop);
    frameQuat(next, e.dir, e.model.root.quaternion);
    e.model.anim(e.t, speed);
    e.center.copy(e.model.root.position).addScaledVector(next, 5);
  }

  // ---------- chimeras: followers and the lab pen ----------
  followingCount() { return this.chimeras.filter((c) => c.follow).length; }

  // Followers hop after you; everyone else lives in the holding pen behind the lab.
  syncChimeras() {
    const g = this.game;
    const lab = g.world.lab;
    // old saves: the newest three follow
    for (let i = this.chimeras.length - 1; i >= 0; i--) {
      const c = this.chimeras[i];
      if (c.follow === undefined) c.follow = this.followingCount() < MAX_FOLLOW;
    }
    for (const f of this.followers.filter((f) => f.kind === 'chimera')) f.root.removeFromParent();
    this.followers = this.followers.filter((f) => f.kind !== 'chimera');
    for (const p of this.pen) p.root.removeFromParent();
    this.pen = [];
    const racing = g.race && g.race.entrant;
    for (const genes of this.chimeras) {
      if (racing === genes) continue;
      if (genes.follow) {
        const m = makeChimera(genes);
        m.root.position.copy(g.player.pos);
        g.scene.add(m.root);
        this.followers.push({ root: m.root, anim: m.anim, kind: 'chimera', genes, vy: 0, h: 0, t: Math.random() * 5 });
      } else if (lab && this.pen.length < PEN_SHOWN) {
        // the pen holds any number; only the first few dozen are shown milling about
        const m = makeChimera(genes);
        const k = this.pen.length;
        m.root.position.set(PEN.x0 + 3 + (k % 6) * 5, 0, PEN.z0 + 3 + Math.floor(k / 6) * 5);
        lab.loc.group.add(m.root);
        this.pen.push({ root: m.root, anim: m.anim, genes, t: Math.random() * 5 });
      }
    }
    this.save();
  }

  // Holding pen menu: at the lab terminal, or anywhere with the remote pen link.
  penMenu(page = 0) {
    const g = this.game;
    const list = this.chimeras;
    if (!list.length) { g.dialog('HOLDING PEN', '"Empty. Put two living things in the reactor and come back."', [{ label: 'OK' }]); return; }
    const per = 6;
    const pages = Math.ceil(list.length / per);
    page = Math.min(page, pages - 1);
    const slice = list.slice(page * per, page * per + per);
    const buttons = slice.map((c, i) => ({ label: `${i + 1} · ${c.follow ? '★ ' : ''}${c.name}${c.wins ? ` 🏆${c.wins}` : ''} — ${c.follow ? 'WITH YOU' : 'IN PEN'}`, fn: () => this.chimeraMenu(c, page) }));
    if (pages > 1) buttons.push({ label: `${buttons.length + 1} · NEXT PAGE (${page + 1}/${pages})`, fn: () => this.penMenu((page + 1) % pages) });
    buttons.push({ label: `${buttons.length + 1} · CLOSE` });
    g.dialog('HOLDING PEN', `<small>${list.length} chimera${list.length === 1 ? '' : 's'} · ${this.followingCount()}/${MAX_FOLLOW} following you. Pick one to call it out or send it back.</small>`, buttons);
  }

  chimeraMenu(c, page) {
    const g = this.game;
    const info = `<b>${c.name}</b><br><small>${c.parents.join(' + ')}${c.mods.length ? ` · ${c.mods.join(', ')}` : ''} · ${Math.round(c.speed * 3.6)} km/h · chaos ${c.chaos}${c.wins ? ` · ${c.wins} Derby win${c.wins > 1 ? 's' : ''}` : ''}</small>`;
    g.dialog('HOLDING PEN', info, [
      {
        label: c.follow ? '1 · SEND TO THE PEN' : '1 · BRING ALONG',
        fn: () => {
          if (!c.follow && this.followingCount() >= MAX_FOLLOW) { g.hud.toast(`Only ${MAX_FOLLOW} can follow you. Send one back first.`, 2.5); this.penMenu(page); return; }
          c.follow = !c.follow;
          this.syncChimeras();
          g.fx.pop(c.follow ? `${c.name.toUpperCase()}, HEEL!` : 'BACK TO THE PEN', null, { color: '#7dff3a', size: 40 });
          this.penMenu(page);
        },
      },
      { label: '2 · RELEASE INTO THE WILD (gone for good)', fn: () => this.confirmRelease(c, page) },
      { label: '3 · BACK', fn: () => this.penMenu(page) },
    ]);
  }

  confirmRelease(c, page) {
    this.game.dialog('RELEASE?', `${c.name} will wander off into the craters forever.`, [
      { label: '1 · GOODBYE, FRIEND', fn: () => { this.chimeras = this.chimeras.filter((x) => x !== c); this.syncChimeras(); this.game.fx.pop('BYE!', null, { color: '#ff9f1c', size: 40 }); this.penMenu(page); } },
      { label: '2 · NO, KEEP IT', fn: () => this.chimeraMenu(c, page) },
    ]);
  }

  // ---------- splicing yourself ----------
  spliceSelf() {
    const g = this.game;
    if (!this.jar.length) { g.hud.toast('The pod needs something from your jar to splice with.', 2.5); return; }
    const got = [];
    for (const it of this.jar) {
      const key = Object.keys(MUTATIONS).find((k) => MUTATIONS[k].from.includes(it.kind));
      if (!key || this.mutations.includes(key) || this.mutations.length >= MAX_MUTATIONS) continue;
      this.mutations.push(key);
      got.push(MUTATIONS[key].name);
    }
    this.jar = [];
    this.refreshJarMesh();
    this.save();
    this.applyMutations();
    g.world.reactor.flash = 2;
    g.cam.shake = 0.8;
    g.audio.boom(true);
    if (got.length) {
      g.fx.pop(got.join(' + ') + '!', null, { color: '#7dff3a', size: 54 });
      g.style(30, 'MUTATED');
      g.dialog('SPLICE POD', `"Fascinating. You now have: <b>${got.join(', ')}</b>. ${this.mutations.length >= MAX_MUTATIONS ? 'That is as many mutations as one body can hold. Probably.' : 'Come back for more. Or a cure. Mostly more.'}"`, [{ label: 'I FEEL… DIFFERENT' }]);
    } else {
      g.dialog('SPLICE POD', '"Nothing took. Either you already have that mutation, or your body is full. The jar contents were… absorbed anyway."', [{ label: 'OK' }]);
    }
  }

  cure() {
    this.mutations = [];
    this.save();
    this.applyMutations();
  }

  // Mutations change both how you play and how you look.
  applyMutations() {
    const g = this.game;
    const P = g.player;
    const has = (k) => this.mutations.includes(k);
    P.params.runSpeed = has('wheels') ? 22 : PHYS.runSpeed;
    P.params.runAccel = has('wheels') ? 60 : PHYS.runAccel;
    P.params.airGravMult = has('wings') ? 0.6 : 1;
    P.params.drag = has('stone') ? PHYS.drag * 1.4 : PHYS.drag;
    P.params.bootSafeImpact = has('claws') ? 60 : PHYS.bootSafeImpact;
    P.mutFire = has('arms') ? 0.7 : 1;
    P.mutHealth = has('stone') ? 40 : 0;
    P.mutGrip = has('roots') ? 0.3 : 0;
    g.player.applyUpgrades(g.upgrades);
    for (const m of this.mutMeshes) m.removeFromParent();
    this.mutMeshes = [];
    const M = P.model;
    const add = (parent, mesh) => { parent.add(mesh); this.mutMeshes.push(mesh); return mesh; };
    if (has('wheels')) for (const leg of [M.legL, M.legR]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12).rotateZ(Math.PI / 2), toon(0x221d33));
      ink(w, 0.03);
      w.position.set(0, -0.98, 0.05);
      add(leg, w);
    }
    if (has('wings')) for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ color: 0xb8e986, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      wing.position.set(s * 0.95, 0.85, -0.45);
      wing.rotation.y = s * 0.5;
      wing.userData.flap = s;
      add(M.torso, wing);
    }
    if (has('arms')) for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 3, 6), toon(0xff4f2e));
      ink(arm, 0.03);
      arm.position.set(s * 0.48, 0.28, 0.1);
      arm.rotation.z = s * 0.9;
      add(M.torso, arm);
    }
    if (has('void')) {
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7b2ff7, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
      aura.position.y = 0.6;
      add(M.torso, aura);
    }
    if (has('stone')) for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glow(0x2ee6ff));
      sp.scale.set(0.6, 1.8, 0.6);
      // along the flanks of the backpack, clear of the scarf, crate, jar and cape
      sp.position.set((i < 2 ? -1 : 1) * 0.36, 0.8 - (i % 2) * 0.26, -0.28);
      sp.rotation.z = (i < 2 ? 1 : -1) * 1.0;
      add(M.torso, sp);
    }
    if (has('claws')) for (const arm of [M.armL, M.armR]) for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), toon(0xfff4e0));
      c.position.set((k - 1) * 0.06, -0.78, 0.06);
      c.rotation.x = Math.PI;
      add(arm, c);
    }
    if (has('roots')) for (const leg of [M.legL, M.legR]) for (let k = 0; k < 3; k++) {
      const r = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.5, 4), toon(0x6b4a2a));
      r.position.set((k - 1) * 0.09, -0.7, -0.1);
      r.rotation.set(-0.5, 0, (k - 1) * 0.6);
      add(leg, r);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), toon(0x5fbf4a));
      leaf.position.set((k - 1) * 0.12, -0.35, 0.12);
      leaf.rotation.z = (k - 1) * 0.8;
      add(leg, leaf);
    }
    if (has('hawk')) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 14), toon(0xffd23f));
      lens.position.set(0.17, 0.25, 0.38);
      add(M.head, lens);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), glow(0xfff6a8));
      glass.position.set(0.17, 0.25, 0.39);
      add(M.head, glass);
    }
    if (has('blood')) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 16), toon(0xd7263d));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.12;
      add(M.head, band);
    }
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    const P = g.player;
    for (const k of Object.keys(this.buffs)) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    // buffs change how the skates and gravity behave
    P.params.gravity = this.buffs.lowGrav > 0 ? PHYS.gravity * 0.45 : PHYS.gravity;
    P.params.slopeAssist = this.buffs.slick > 0 ? 1.1 : PHYS.slopeAssist;
    P.params.skateFriction = this.buffs.slick > 0 ? 0 : PHYS.skateFriction;
    if (this.buffs.rain > 0 && Math.random() < dt * 40) {
      const p = P.pos.clone().addScaledVector(P.up, 14).addScaledVector(g.cam.right, (Math.random() - 0.5) * 16).addScaledVector(g.cam.fwd, (Math.random() - 0.3) * 16);
      g.fx.spawn(p, P.up.clone().multiplyScalar(-14), { color: 0x2a1f4f, size: 0.25, life: 1, count: 1, spread: 0.5 });
    }
    // slow reactions inside the jar
    if (this.jar.length >= 2) {
      this.mixT += dt;
      if (this.mixT > MIX_TIME) {
        this.mixT = 0;
        for (const m of JAR_MIXES) {
          const ia = this.jar.findIndex((i) => i.kind === m.a), ib = this.jar.findIndex((i) => i.kind === m.b);
          if (ia < 0 || ib < 0) continue;
          if (!m.into) { if (!this.jar[ib].mited) { this.jar[ib].mited = true; g.hud.toast(m.text, 3.5); } continue; }
          const keep = this.jar[m.a === 'person' ? ia : ib];
          this.jar = this.jar.filter((_, i) => i !== ia && i !== ib);
          this.jar.push({ kind: m.into, name: keep.name });
          g.hud.toast(m.text, 3.5);
          g.fx.pop('BLOOP!', null, { color: ITEMS[m.into].color, size: 50 });
          this.refreshJarMesh();
          break;
        }
      }
    }
    // the Monolith
    const mono = g.world.monolith;
    this.monoCd -= dt;
    if (mono && this.monoCd <= 0 && P.pos.distanceTo(mono.pos) < 9) {
      this.monoCd = 90;
      this.buffs.lowGrav = 30;
      g.audio.tone(55, 2.5, 'sine', 0.35, 1);
      g.fx.pop('THE MONOLITH HUMS…', null, { color: '#c77dff', size: 56 });
      g.hud.toast('Gravity feels… optional. (Low gravity for 30 s)', 4);
    }
    // bouncy buff: landings spring you back up
    if (this.buffs.bouncy > 0 && P.body.bounceReady && P.body.grounded) {
      P.vel.addScaledVector(P.body.groundN, P.body.bounceReady * 0.85);
      P.body.grounded = false;
      P.body.sinceContact = 1;
    }
    P.body.bounceReady = 0;
    // wing flap
    for (const m of this.mutMeshes) if (m.userData.flap) m.rotation.y = m.userData.flap * (0.5 + Math.sin(g.time * (P.body.grounded ? 3 : 18)) * 0.35);
    // captured cars come back eventually
    for (const v of g.world.vehicles) if (v.captured > 0) { v.captured -= dt; if (v.captured <= 0) { v.captured = 0; v.root.visible = true; } }
    this.updateFollowers(dt);
    this.updateWanderers(dt);
    this.updateMites(dt);
    this.updateLoot(dt);
    const lab = g.world.lab;
    if (lab && lab.loc.active) for (const p of this.pen) { p.t += dt; p.anim(p.t, 1.5); p.root.rotation.y = Math.sin(p.t * 0.3) * 2; }
  }

  // Pets made in the reactor hop after you.
  addFollower(kind) {
    const g = this.game;
    const P = g.player;
    let root;
    if (kind === 'rock') {
      root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), toon(0x8d8898));
      ink(body, 0.08);
      body.position.y = 1;
      root.add(body);
      for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), glow(0x2ee6ff)); eye.position.set(s * 0.35, 1.3, 0.85); root.add(eye); }
    } else {
      const f = makeFigure({ suit: 0x8a6a4a, helmet: 0x6b5a3a, visor: 0xffd23f, scale: 0.7 });
      root = f.root;
    }
    root.position.copy(P.pos);
    g.scene.add(root);
    this.followers.push({ root, kind, vy: 0, h: 0, t: 0 });
  }

  updateFollowers(dt) {
    const P = this.game.player;
    this.followers.forEach((f, i) => {
      const up = f.root.position.clone().normalize();
      const target = P.pos.clone().addScaledVector(this.game.cam.right, (i % 2 ? 3 + i : -3 - i)).addScaledVector(P.heading, -4 - i * 2);
      const to = tangent(target.clone().sub(f.root.position), up);
      const d = to.length();
      if (d > 300) { f.root.position.copy(P.pos); return; }
      const sp = Math.min(d, (8 + d * 1.5) * dt);
      if (d > 2) f.root.position.addScaledVector(to.normalize(), sp);
      f.h += f.vy * dt; f.vy -= 9 * dt;
      const hop = f.kind === 'chimera' ? f.genes.hop : 1;
      if (f.h <= 0) { f.h = 0; f.vy = d > 3 && Math.random() < hop ? 4 * hop : 0; }
      const gp = this.game.planet.ground(f.root.position, new THREE.Vector3());
      f.root.position.copy(gp).addScaledVector(up, f.h);
      frameQuat(up, d > 0.5 ? to : P.heading, f.root.quaternion);
      f.t = (f.t || 0) + dt;
      if (f.anim) f.anim(f.t, sp / Math.max(dt, 1e-3));
    });
  }

  updateWanderers(dt) {
    for (const w of this.wanderers) {
      const p = w.root.position;
      const up = p.clone().normalize();
      w.t += dt;
      if (Math.random() < dt * 0.3) w.dir = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      const next = greatCircle(up, w.dir, 1.2 * dt);
      p.copy(this.game.planet.ground(next, new THREE.Vector3()));
      frameQuat(next, w.dir, w.root.quaternion);
      w.legL.rotation.x = Math.sin(w.t * 6) * 0.5; w.legR.rotation.x = -Math.sin(w.t * 6) * 0.5;
    }
  }

  // The jar rides on your back and shows what's inside.
  refreshJarMesh() {
    const P = this.game.player;
    if (this.jarMesh) this.jarMesh.removeFromParent();
    this.jarMesh = null;
    if (!this.owned) return;
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 12), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.3 }));
    g.add(glass);
    this.jar.forEach((it, i) => {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(it.kind === 'car' ? 0.24 : 0.17, 8, 6), glow(new THREE.Color(ITEMS[it.kind].color).getHex()));
      blob.position.set(Math.sin(i * 2.1) * 0.12, -0.25 + i * 0.2, Math.cos(i * 2.1) * 0.12);
      g.add(blob);
    });
    if (this.artifact) {
      const art = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(0x7dffd4));
      art.position.set(0, 0.28, 0);
      g.add(art);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 12), toon(0x3a3550));
    cap.position.y = 0.45;
    g.add(cap);
    g.position.set(0.45, 0.1, -0.05);
    P.model.cargoSlot.add(g);
    this.jarMesh = g;
  }

  hudText() {
    const parts = [];
    if (this.owned) {
      const cells = [];
      let used = 0;
      if (this.artifact) { cells.push('<span class="artifact-slot" title="Alien Artifact (sealed)">✧</span>'); used++; }
      for (const it of this.jar) {
        const n = ITEMS[it.kind].slots || 1;
        used += n;
        for (let k = 0; k < n; k++) cells.push(`<span style="color:${ITEMS[it.kind].color}" title="${ITEMS[it.kind].name}">${ITEMS[it.kind].icon}</span>`);
      }
      for (let i = used; i < this.slots; i++) cells.push('<span class="empty-slot">·</span>');
      parts.push(`JAR ${cells.join('')}${this.jar.length >= 2 ? ' <i>stewing…</i>' : ''}${this.jar.length ? ' <i>· X empty · ⇧X dump</i>' : ''}`);
    }
    const buff = Object.entries(this.buffs).filter(([, v]) => v > 0).map(([k, v]) => `${BUFF_NAMES[k]} ${Math.ceil(v)}s`).join(' · ');
    if (buff) parts.push(`<div class="buffs">${buff}</div>`);
    if (this.mutations.length) parts.push(`<div class="muts">${this.mutations.map((k) => MUTATIONS[k].name).join(' · ')}</div>`);
    return parts.join('');
  }
}

const BUFF_NAMES = { lowGrav: 'LOW-G', slick: 'MOON MUD', bouncy: 'SPRINGY', invert: 'NEGATIVE', rain: 'BLACK RAIN', cushion: 'SOFT LANDING' };

// Reactor recipes, keyed by the sorted item kinds fed in together.
const RECIPES = {
  sapling() { this.buffs.cushion = 40; return { title: 'MOON MOSS', text: '"The sapling went into the antimatter and came out as a fine green fuzz. It has settled on your boots. Landings will be very soft for a while."' }; },
  lens() {
    const g = this.game;
    let n = 0;
    for (const e of g.enemies.list) if (!e.dead && e.kind === 'skater' && e.center && e.center.distanceTo(g.world.lab.reactor) < 400) { e.dazed = 6; n++; }
    g.world.reactor.flash = 4;
    return { title: 'BLINDING FLASH', text: `"The lens focused the reactor into one tremendous flash. ${n ? `${n} pirate${n > 1 ? 's' : ''} out there are now seeing stars.` : 'Nobody was outside to be blinded. A pity.'} I can still see purple."` };
  },
  transponder() {
    const g = this.game;
    if (g.globe && g.globe.revealAround) g.globe.revealAround(g.world.lab.reactor.clone().normalize(), 2600);
    g.addCredits(40, 'Data');
    return { title: 'BROADCAST', text: '"I wired the transponder straight into the antimatter. It screamed across half the Moon and bounced back. Your map just got a lot less foggy. Forty credits of data, too."' };
  },
  plating() { this.game.addCredits(60, 'Scrap'); return { title: 'SLAG', text: '"One plate melts into sixty credits of slag. Bring me THREE and I will bolt them onto you properly."' }; },
  junkbot(names) { this.game.addCredits(30, 'Parts'); return { title: 'DISASSEMBLED', text: `"${names[0] || 'The little robot'} went into the reactor, very bravely, and came out as thirty credits of parts. It waved."` }; },
  engine() { this.buffs.lowGrav = 30; this.game.addCredits(80, 'Scrap'); return { title: 'ANTIMATTER TURBO', text: '"I bolted your engine to the reactor and it achieved, briefly, anti-gravity. Some of it is still on you: you weigh less than half for a while. Also, eighty credits of scrap."' }; },
  wiring() { this.game.addCredits(45, 'Copper'); return { title: 'MELTED COPPER', text: '"One wire alone is just scrap. Here are forty-five credits for it. Bring me THREE and I can do something useful with your skates."' }; },
  rock() { this.game.addCredits(60, 'Sample'); return { title: 'ROCK… ANALYSED', text: '"A fine rock. It is now slightly radioactive and worth sixty credits to someone."' }; },
  dirt() { this.game.addCredits(20, 'Glass'); return { title: 'MOON GLASS', text: '"The dirt fused into a tiny glass bead. I will treasure it. Have twenty credits."' }; },
  water() { this.buffs.rain = 45; return { title: 'BLACK RAIN', text: '"The black water went UP. It is now raining on you specifically. That will stop. Probably."' }; },
  person(names) {
    const g = this.game;
    const P = g.player;
    const n = names[0] || 'Your passenger';
    g.fx.explosion(g.world.lab.reactor.clone().addScaledVector(P.up, 8), 6, true);
    g.fx.pop(`${n.toUpperCase()}: WHEEEEE!`, null, { color: '#ff9f1c', size: 60 });
    g.rep.add('kepler', -3, 'Fed a resident to a reactor');
    g.schedule(6, () => this.spawnWanderer(n));
    return { title: 'YEET', text: `"${n} has been launched through the roof at roughly escape velocity, and also back down again. Somewhere. Kepler will be filing a complaint."` };
  },
  mite() { this.spawnMegaMite(); return { title: 'MEGA MITE', text: '"Ah. The mite absorbed the entire antimatter flux and is now… the size of a house. It\'s outside. It seems upset. Perhaps shoot it? Science!"' }; },
  car() {
    const g = this.game;
    g.fx.explosion(g.world.lab.reactor.clone().addScaledVector(g.player.up, 14), 8, true);
    g.addCredits(150, 'Orbital car');
    g.actionPanel('launch', null, 'THAT CAR IS IN ORBIT NOW.');
    return { title: 'ORBITAL HOVER-CAR', text: '"The hover-car went straight up through the roof and is now orbiting the Moon. Somebody\'s commute just got a lot longer. Here, hush money."' };
  },
  pirate(names) {
    const g = this.game;
    g.rep.add('spacecom', 3, 'Reformed a pirate');
    if (g.rep.aligned()) g.rep.add('rustmoon', -3, 'Reformed a pirate');
    g.schedule(1, () => this.spawnWanderer(`Dr. ${names[0] || 'Grit'}`, false, false));
    return { title: 'REFORMED', text: `"${names[0] || 'The pirate'} came out with a doctorate in applied physics and a deep sense of regret. They are walking to SPACECOM to turn themselves in."` };
  },
  mud() { this.buffs.slick = 60; return { title: 'MOON MUD COATING', text: '"Your skates are now coated in antimatter mud. Downhills will be… extreme. One minute."' }; },
  slickrock() { this.addFollower('rock'); return { title: 'IT\'S ALIVE', text: '"The slick rock has developed opinions, eyes, and an attachment to you. It will follow you now. Name it something nice."' }; },
  voidling(names) { this.buffs.lowGrav = 45; return { title: 'VOID TWIN', text: `"${names[0] || 'Your passenger'} split into two people and one of them took most of your weight with them. Enjoy the low gravity."` }; },
  'person+water'(names) { return RECIPES.voidling.call(this, names); },
  'dirt+water'() { return RECIPES.mud.call(this); },
  'rock+water'() { return RECIPES.slickrock.call(this); },
  'rock+rock'() { this.game.addCredits(160, 'Twin rock'); return { title: 'TWINNED ROCK', text: '"Two rocks went in. Four rocks came out. Two of them are worth a lot. Here."' }; },
  'dirt+dirt'() { this.game.addCredits(70, 'Concrete'); return { title: 'MOON CONCRETE', text: '"Congratulations, you invented concrete. Again."' }; },
  'dirt+rock'() { this.game.addCredits(90, 'Concrete'); return { title: 'REINFORCED MOON CONCRETE', text: '"Ah, aggregate. Very construction. Ninety credits."' }; },
  'dirt+person'() { this.addFollower('dirt'); return { title: 'DIRT GOLEM', text: '"The person is fine. The DIRT, however, has stood up and decided you are its parent."' }; },
  'person+rock'(names) { this.game.rep.add('kepler', -2, 'Petrified a resident', { silent: true }); this.statue(names[0]); return { title: 'PETRIFIED', text: `"${names[0] || 'They'} turned to stone. Beautiful work. I'm putting them in the lab's gallery."` }; },
  'water+water'() { this.buffs.invert = 40; return { title: 'DEEP BLACK', text: '"You have seen the other side of light. For the next forty seconds, so will your eyes."' }; },
  'mud+person'() { this.addFollower('dirt'); return RECIPES['dirt+person'].call(this); },
  _default() { this.game.addCredits(15, 'Fizzle'); this.game.fx.pop('FIZZLE', null, { color: '#c9c3d9', size: 50 }); return { title: 'FIZZLE', text: '"Hm. Nothing interesting. Try putting two living things in at once. Or three different things. No, wait—"' }; },
};

// statue for the lab gallery
Alchemy.prototype.statue = function statue(name) {
  const g = this.game;
  const lab = g.world.lab;
  const loc = lab.loc;
  const f = makeFigure({ suit: 0x9a9a9a, helmet: 0x9a9a9a, visor: 0x5b5870 });
  const i = this.statues++;
  f.root.position.set(-16 + (i % 6) * 3, 0, 10);
  f.root.rotation.y = Math.PI;
  f.root.userData.name = name;
  loc.group.add(f.root);
};
