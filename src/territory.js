import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { toon, glow, ink } from './toon.js';
import { arcDist, tangent, frameQuat, greatCircle, SUN } from './geo.js';
import { mulberry32 } from './rng.js';
import { makeRover } from './models.js';
import { ITEMS } from './alchemy.js';
import { outpostTemplate, SMALL_KINDS, FLAT_R } from './outpostModels.js';
import { foundedTemplate, TERMINAL_Z } from './storyAssets.js';

// Every square metre of the Moon belongs to somebody. Territory is a weighted Voronoi split
// around each faction's settlements and outposts; borders are marked with glowing pylons,
// small faction structures dot the countryside, and military patrols run between them.
const KEY = 'moonrunner-territory-v1';
const MILITARY = ['spacecom', 'vostok', 'daedalus'];
const KINDS = {
  spacecom: ['tower', 'depot'], vostok: ['tower', 'depot'], daedalus: ['tower', 'depot'],
  kepler: ['farm', 'mast'], meridian: ['kiosk', 'mast'], rustmoon: ['shack', 'junk'],
};
const KIND_NAMES = {
  tower: 'Watchtower', depot: 'Supply Depot', farm: 'Farm Dome', mast: 'Relay Mast', kiosk: 'Trading Kiosk',
  shack: 'Scrap Shack', junk: 'Junk Pile', homestead: 'Homestead', lab: 'Field Lab',
};
const OUTPOST_W = 0.42; // how strongly an outpost claims ground compared with a settlement
const BUILD_R = 900, DROP_R = 1150;
const LOOT_CD = 240, LOOT_REP = 2; // raid/rebuild cooldown (s) and reputation cost
const OUTPOST_HP = { farm: 160, depot: 220, tower: 200, mast: 180, kiosk: 140, shack: 160, junk: 200 };
const SAP_NAMES = ['Fern', 'Sprig', 'Basil', 'Twiggy', 'Moss', 'Clover'];
const BOT_NAMES = ['Bolt', 'Sprocket', 'Widget', 'Tinny', 'Gizmo', 'Rivet'];
// What each small structure gives up, raided (F at its marked spot) or shot to pieces.
const LOOT = {
  farm: { verb: 'TAKE A SAPLING', boom: 'DOME DOWN!', item: 'sapling', names: SAP_NAMES, pop: 'SAPLING SWIPED!' },
  depot: { verb: 'RAID THE SUPPLY DEPOT', boom: 'DEPOT DESTROYED!', item: 'wiring', credits: [150, 300], pop: 'CREDITS + WIRING!' },
  tower: { verb: 'SWIPE A SEARCHLIGHT LENS', boom: 'TOWER TOPPLED!', item: 'lens', pop: 'LENS LIFTED!' },
  mast: { verb: 'PULL A SIGNAL TRANSPONDER', boom: 'MAST DOWN!', item: 'transponder', pop: 'TRANSPONDER!' },
  kiosk: { verb: 'GRAB A MYSTERY CRATE', boom: 'KIOSK SMASHED!', crate: true },
  shack: { verb: 'STRIP SOME SCRAP PLATING', boom: 'SHACK FLATTENED!', item: 'plating', pop: 'SCRAP PLATING!' },
  junk: { verb: 'COAX OUT A JUNK BOT', boom: 'JUNK EVERYWHERE!', item: 'junkbot', names: BOT_NAMES, pop: 'JUNK BOT! BEEP!' },
};
const BUILT_R = 40; // founded outposts: flattened radius (the compound itself: storyAssets.js)
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _w = new THREE.Vector3();

// distance from a point (outpost frame) to a yawed box { x, y, z, hx, hy, hz, yaw }
function boxDist(p, h) {
  const dx = p.x - h.x, dz = p.z - h.z, cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const qx = Math.max(0, Math.abs(lx) - h.hx), qy = Math.max(0, Math.abs(p.y - h.y) - h.hy), qz = Math.max(0, Math.abs(lz) - h.hz);
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

const hex = (f) => new THREE.Color(FACTIONS[f] ? FACTIONS[f].color : '#c9c3d9').getHex();

export class Territory {
  constructor(game) {
    this.game = game;
    this.anchors = this.locAnchors();
    this.baseAnchors = this.anchors.slice();
    this.outposts = [];
    this.patrols = [];
    this.current = null;
    this.chip = document.createElement('div');
    this.chip.id = 'terrchip';
    this.chip.className = 'chip terr hidden';
    const tl = document.getElementById('topleft');
    tl.insertBefore(this.chip, tl.children[2] || null);
    this.genOutposts();
    this.flatten();
    this.prebake();
    this.load();
    this.rebuild();
    // farm domes and supply depots can be shot to pieces (same haul as a raid)
    game.blastHooks = game.blastHooks || [];
    game.blastHooks.push((pos, radius, damage, owner) => this.onBlast(pos, radius, damage, owner));
  }

  locAnchors() {
    const out = [];
    for (const l of this.game.locations) {
      if (l.poi || l.camp || !FACTIONS[l.faction] || l.faction === 'none') continue;
      out.push({ dir: l.dir, faction: l.faction, w: l.hq ? 1.5 : 1, loc: l });
    }
    return out;
  }

  // A finale moved the borders (main.js applyWorldLive): re-deal the outposts exactly as a fresh
  // boot would (same ids, same rolls), keeping captures, your builds and story changes.
  refreshWorld() {
    this.baseAnchors = this.locAnchors();
    const live = this.outposts;
    this.outposts = [];
    this.genOutposts(false);
    const fresh = this.outposts;
    this.outposts = live;
    for (const f of fresh) {
      const o = live.find((x) => x.id === f.id);
      if (!o || o.built || o.captured || o.kindChanged) continue;
      if (o.faction !== f.faction || o.kind !== f.kind) { o.faction = f.faction; o.kind = f.kind; if (o.model) this.despawn(o); }
    }
    const ws = this.game.ws;
    const gone = this.outposts.find((o) => o.built && ws.town && ws.town.replaces === o.id);
    if (gone) { if (gone.model) this.despawn(gone); this.outposts.splice(this.outposts.indexOf(gone), 1); }
    this.applyWs(true);
    this.rebuild();
    this.save();
  }

  // ---------- ownership ----------
  owner(dir, anchors = this.anchors) {
    let best = null, bd = Infinity;
    for (const a of anchors) {
      const d = arcDist(dir, a.dir) / a.w;
      if (d < bd) { bd = d; best = a; }
    }
    return best ? best.faction : 'spacecom';
  }

  genOutposts(clear = true) {
    const g = this.game;
    const rr = mulberry32(4242);
    for (let tries = 0; tries < 6000 && this.outposts.length < 120; tries++) {
      const u = rr() * 2 - 1, th = rr() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      const d = new THREE.Vector3(sq * Math.cos(th), u, sq * Math.sin(th));
      // late locations stay out of this pass so ids don't shift; clearSites nudges clashing outposts
      if (g.locations.some((l) => !l.late && arcDist(d, l.dir) < (l.genR || l.zoneR || l.r) * 1.6 + 120)) continue;
      if (this.outposts.some((o) => arcDist(d, o.dir) < 420)) continue;
      const faction = this.owner(d, this.baseAnchors);
      const kinds = KINDS[faction] || KINDS.kepler;
      this.outposts.push({ id: 'op' + this.outposts.length, dir: d, faction, kind: kinds[Math.floor(rr() * kinds.length)], model: null, cols: [], seed: Math.floor(rr() * 1e6) });
    }
    if (clear) this.clearSites();
  }

  // The structures stand on ~60 m flattened plateaus (blending out to ~2x): keep them off the
  // roads, black lakes and settlement plateaus that were laid down before us. A clashing outpost
  // is nudged to the nearest clear spot, or dropped (ids stay stable for saves either way).
  clearSites() {
    const g = this.game, R = g.planet.R;
    const blend = FLAT_R * 2 + 12;
    const road = [];
    const tr = g.world.traffic;
    const rp = tr && tr.roadMesh && tr.roadMesh.geometry.attributes.position;
    if (rp) for (let i = 0; i < rp.count; i += 2) road.push(new THREE.Vector3().fromBufferAttribute(rp, i).normalize());
    for (const pc of (tr && tr.pieces) || []) for (const p of (pc.path && pc.path.pts) || pc.raw || []) road.push(p.clone().normalize());
    const cosRoad = Math.cos(blend / R);
    const lakes = (g.world.lakes || []).map((lk) => ({ d: lk.d, r: Math.acos(Math.min(1, lk.cos)) * R + blend }));
    const bad = (d, self) => {
      for (const l of g.locations) if (arcDist(d, l.dir) < Math.max((l.zoneR || l.r) * 1.6 + 120, l.r * 1.95 + blend)) return true;
      for (const lk of lakes) if (arcDist(d, lk.d) < lk.r) return true;
      for (const p of road) if (p.dot(d) > cosRoad) return true;
      return this.outposts.some((o) => o !== self && !o.gone && arcDist(d, o.dir) < 420);
    };
    const rr = mulberry32(777);
    const t = new THREE.Vector3();
    for (const o of this.outposts) {
      if (!bad(o.dir, o)) continue;
      let moved = false;
      for (let k = 0; k < 48 && !moved; k++) {
        tangent(t.set(rr() - 0.5, rr() - 0.5, rr() - 0.5), o.dir).normalize();
        const d = greatCircle(o.dir, t, 40 + k * 8);
        if (!bad(d, o)) { o.dir.copy(d); moved = true; }
      }
      if (!moved) o.gone = true;
    }
    this.outposts = this.outposts.filter((o) => !o.gone);
  }

  // Bake each outpost look (kind x faction, ~10-35 ms apiece) in idle time - mostly while the title
  // screen is up - so meeting a new one doesn't hitch. Anything not baked yet is baked on spawn.
  prebake() {
    const looks = new Map();
    for (const o of this.outposts) if (SMALL_KINDS.has(o.kind)) looks.set(`${o.kind}|${o.faction}`, o);
    // intact looks first, then their wrecks (so the first time you blow one up doesn't hitch either)
    const queue = [...looks.values()].map((o) => [o, false]).concat([...looks.values()].map((o) => [o, true]));
    const later = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 40));
    const run = () => {
      const next = queue.shift();
      if (next) outpostTemplate(next[0].kind, hex(next[0].faction), next[0].seed % 2, next[1]);
      if (queue.length) later(run);
    };
    later(run);
  }

  // Register every structure's plateau before the near terrain is (re)built, so nothing pops.
  // Crystals already sitting in the blend ring are moved onto the new ground.
  flatten() {
    const g = this.game, P = g.planet;
    const t0 = performance.now();
    const cosNear = Math.cos((FLAT_R * 2.2) / P.R);
    const moved = [];
    for (const cr of (g.world.crystals || [])) {
      const d = _v.copy(cr.pos).normalize();
      if (this.outposts.some((o) => o.dir.dot(d) > cosNear)) moved.push({ cr, s0: P.surface(cr.pos) });
    }
    for (const o of this.outposts) if (!o.built) P.addFlat(o.dir, FLAT_R);
    for (const m of moved) {
      const up = m.cr.pos.clone().normalize(), dh = P.surface(m.cr.pos) - m.s0;
      m.cr.pos.addScaledVector(up, dh);
      m.cr.mesh.position.addScaledVector(up, dh);
    }
    this.flattenMs = performance.now() - t0;
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d) return;
      for (const [id, f] of Object.entries(d.captured || {})) { const o = this.outposts.find((x) => x.id === id); if (o) { o.faction = f; o.captured = true; } }
      for (const [id, k] of Object.entries(d.kinds || {})) { const o = this.outposts.find((x) => x.id === id); if (o) { o.kind = k; o.kindChanged = true; } }
      for (const b of d.built || []) {
        if (this.game.ws && this.game.ws.town && this.game.ws.town.replaces === b.id) continue; // (it grew into your town)
        const o = { ...b, dir: new THREE.Vector3().fromArray(b.dir), model: null, cols: [], built: true };
        this.outposts.push(o);
        this.game.planet.addFlat(o.dir, BUILT_R);
      }
    } catch { /* fresh moon */ }
    this.applyWs();
  }

  applyWs(live = false) {
    const ws = this.game.ws;
    if (!ws) return;
    for (const id of ws.razed || []) { const o = this.outposts.find((x) => x.id === id); if (o) o.razed = true; }
    // the ILMB fell: SPACECOM's outposts belong to the clans now
    if (ws.lawless) {
      for (const o of this.outposts) {
        if (o.faction !== 'spacecom' || o.built) continue;
        o.faction = 'rustmoon'; o.kind = o.kind === 'depot' ? 'junk' : 'shack';
        if (live && o.model) this.despawn(o);
      }
    }
  }

  save() {
    const captured = {};
    const kinds = {};
    for (const o of this.outposts) { if (o.captured) captured[o.id] = o.faction; if (o.kindChanged) kinds[o.id] = o.kind; }
    const built = this.outposts.filter((o) => o.built).map((o) => ({ id: o.id, dir: o.dir.toArray(), faction: o.faction, kind: o.kind, name: o.name, modules: o.modules || [], seed: o.seed }));
    try { localStorage.setItem(KEY, JSON.stringify({ captured, built, kinds })); } catch { /* unavailable */ }
  }

  // Outposts claim a little ground of their own (so captures move the borders).
  rebuild() {
    this.anchors = this.baseAnchors.concat(this.outposts.map((o) => ({ dir: o.dir, faction: o.faction, w: o.built ? 0.6 : OUTPOST_W })));
    this.buildBorders();
    this.mapCache = null;
    this.buildRoutes();
  }

  // Flip an outpost to a new owner (story captures).
  capture(o, faction) {
    o.faction = faction;
    o.captured = true;
    if (o.model) this.despawn(o);
    this.rebuild();
    this.save();
  }

  // A brand-new outpost (story base-building).
  found(dir, faction, kind, name) {
    const o = { id: 'built' + Date.now().toString(36), dir: dir.clone().normalize(), faction, kind, name, modules: [], model: null, cols: [], built: true, seed: Math.floor(Math.random() * 1e6) };
    this.outposts.push(o);
    this.game.planet.addFlat(o.dir, BUILT_R);
    this.rebuild();
    this.save();
    return o;
  }

  name(o) { return o.name || `${FACTIONS[o.faction] ? FACTIONS[o.faction].name : ''} ${KIND_NAMES[o.kind] || 'Outpost'}`; }

  // ---------- border pylons (one instanced mesh for the whole Moon) ----------
  buildBorders() {
    const g = this.game;
    if (this.borders) { g.scene.remove(this.borders.shaft, this.borders.cap); this.borders.shaft.dispose(); this.borders.cap.dispose(); }
    const N = 9000, pts = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    const d = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3(), o = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = ga * i;
      d.set(r * Math.cos(th), y, r * Math.sin(th));
      const f = this.owner(d);
      tangent(t.set(1, 0, 0), d, t);
      if (t.lengthSq() < 1e-4) tangent(t.set(0, 0, 1), d, t);
      t.normalize();
      s.crossVectors(d, t);
      let edge = false;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        o.copy(d).addScaledVector(t, a * 0.02).addScaledVector(s, b * 0.02).normalize();
        if (this.owner(o) !== f) { edge = true; break; }
      }
      if (edge && !g.locations.some((l) => arcDist(d, l.dir) < (l.zoneR || l.r) + 40)) pts.push({ dir: d.clone(), f });
    }
    const shaftGeo = new THREE.CylinderGeometry(0.25, 0.35, 7, 6).translate(0, 3.5, 0);
    const capGeo = new THREE.OctahedronGeometry(0.9, 0).translate(0, 7.8, 0);
    const shaft = new THREE.InstancedMesh(shaftGeo, toon(0x2a2540), pts.length);
    const cap = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
    pts.forEach((b, i) => {
      g.planet.ground(b.dir, p, -0.3);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.dir);
      m.compose(p, q, sc);
      shaft.setMatrixAt(i, m);
      cap.setMatrixAt(i, m);
      cap.setColorAt(i, col.set(FACTIONS[b.f].color));
    });
    for (const im of [shaft, cap]) { im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; g.scene.add(im); }
    if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    this.borders = { shaft, cap, count: pts.length };
  }

  // ---------- outpost structures, built only near the player ----------
  spawn(o) {
    const g = this.game;
    if (this.wrecked(o)) { this.spawnRubble(o); return; }
    const c = hex(o.faction);
    if (SMALL_KINDS.has(o.kind)) { this.place(o, outpostTemplate(o.kind, c, o.seed % 2, false)); return; }
    // player-founded outposts: a kit-built compound (storyAssets.js): a hab dome or research block,
    // a paved apron and the modules you've built on their plots round it
    this.place(o, foundedTemplate(o.kind, c, o.modules || []));
    o.terminal = o.model.localToWorld(new THREE.Vector3(0, 0, TERMINAL_Z));
  }

  // Put a baked outpost model (or its wreck) on the ground: same yaw every time for this outpost.
  place(o, tpl) {
    const g = this.game;
    const root = tpl.root.clone();
    root.position.copy(g.planet.ground(o.dir, new THREE.Vector3(), -0.2));
    frameQuat(o.dir, tangent(SUN.clone(), o.dir).normalize(), root.quaternion);
    root.rotateY(mulberry32(o.seed)() * Math.PI * 2);
    g.scene.add(root);
    root.updateMatrixWorld(true);
    o.model = root;
    const up = o.dir;
    o.cols = tpl.cols.map((b) => {
      if (b.type === 'sphere') return g.colliders.add({ type: 'sphere', c: root.localToWorld(new THREE.Vector3(b.x, b.y, b.z)), r: b.r });
      if (b.type === 'cyl') return g.colliders.add({ type: 'cyl', c: root.localToWorld(new THREE.Vector3(b.x, 0, b.z)), axis: up.clone(), y0: b.y0, y1: b.y1, r: b.r });
      const q = root.quaternion.clone().multiply(_q.setFromAxisAngle(_w.set(0, 1, 0), b.yaw));
      return g.colliders.add({
        type: 'box', c: root.localToWorld(new THREE.Vector3(b.x, b.y, b.z)), hx: b.hx, hy: b.hy, hz: b.hz,
        ax: new THREE.Vector3(1, 0, 0).applyQuaternion(q), ay: new THREE.Vector3(0, 1, 0).applyQuaternion(q), az: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
      });
    });
    o.hits = tpl.hits;
    o.raidPoint = tpl.raid ? root.localToWorld(tpl.raid.clone()) : null;
    o.mainC = tpl.smoke ? root.localToWorld(tpl.smoke.clone()) : root.position.clone().addScaledVector(o.dir, 2);
    o.dropPoint = tpl.drop ? root.localToWorld(tpl.drop.clone()) : null;
  }

  // ---------- shooting them up ----------
  wrecked(o) { return !!o.razed || (o.wreckedUntil || 0) > this.game.time; }

  onBlast(pos, radius, damage, owner) {
    if (owner !== 'player') return;
    for (const o of this.outposts) {
      if (!o.model || o.rubble || !LOOT[o.kind]) continue;
      if (pos.distanceTo(o.model.position) > radius + 45) continue;
      // distance from the blast to the main building (the depot's warehouse, the farm's domes)
      let d;
      if (o.hits && o.hits.length) {
        const lp = o.model.worldToLocal(_w.copy(pos));
        d = Infinity;
        for (const h of o.hits) d = Math.min(d, boxDist(lp, h));
      } else d = Math.max(0, pos.distanceTo(o.model.position) - 7);
      if (d > radius) continue;
      const max = OUTPOST_HP[o.kind];
      o.hp = (o.hp ?? max) - damage * Math.max(0.4, 1 - d / Math.max(1, radius));
      if (o.hp <= 0) this.destroy(o);
      else if (Math.random() < 0.5) this.game.fx.pop(`${Math.ceil(o.hp / max * 100)}%`, (o.mainC || o.model.position).clone().addScaledVector(o.dir, 8), { color: '#ff9f1c', size: 30, life: 0.6 });
    }
  }

  destroy(o) {
    const g = this.game;
    const c = (o.mainC || o.model.position).clone().addScaledVector(o.dir, 1);
    g.fx.explosion(c, 18, true);
    g.fx.explosion(c.clone().addScaledVector(tangent(_w.set(1, 0, 0), o.dir).normalize(), 6), 12, false);
    g.audio.boom(true);
    g.cam.shake = Math.max(g.cam.shake, 0.8);
    const L = LOOT[o.kind];
    g.fx.pop(L.boom, c.clone().addScaledVector(o.dir, 8), { color: '#ff4f2e', size: 64, life: 1.4 });
    // the same haul as a raid, flung out of the wreck onto open ground where you can see it
    const spots = this.landingSpots(o, (L.credits ? 1 : 0) + 1);
    if (L.credits) g.alchemy.dropLoot(null, c, { credits: L.credits[0] + Math.floor(Math.random() * (L.credits[1] - L.credits[0] + 1)), to: spots.pop() });
    if (L.crate) g.alchemy.dropLoot(null, c, { crate: true, to: spots.pop() });
    else g.alchemy.dropLoot(L.item, c, { name: L.names ? L.names[Math.floor(Math.random() * L.names.length)] : undefined, to: spots.pop() });
    g.rep.add(o.faction, -LOOT_REP, `Destroyed a ${KIND_NAMES[o.kind]}`, { war: false });
    o.hp = OUTPOST_HP[o.kind];
    o.wreckedUntil = g.time + LOOT_CD;
    o.lootAt = g.time;
    this.despawn(o);
    this.spawnRubble(o);
  }

  // Clear spots on the apron for loot to land: the template's drop point (spread a little), else a
  // ring search around the yard for ground with nothing built on it.
  landingSpots(o, n) {
    const g = this.game;
    const out = [];
    const up = o.dir;
    const t = tangent(_w.set(1, 0, 0), up).normalize();
    const b = new THREE.Vector3().crossVectors(up, t);
    const clear = (p) => !g.colliders.query(p, 4, []).some((col) => g.colliders.contact(col, p, 2.2, new THREE.Vector3()) > 0);
    const base = o.dropPoint || null;
    for (let i = 0; i < n; i++) {
      let p = null;
      if (base) {
        const q = base.clone().addScaledVector(t, (i - (n - 1) / 2) * 3).addScaledVector(up, 1);
        if (clear(q)) p = q;
      }
      for (let k = 0; k < 32 && !p; k++) {
        const a = k * 2.4 + i, r = 14 + (k % 4) * 4;
        const q = o.model.position.clone().addScaledVector(t, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r).addScaledVector(up, 1);
        if (clear(q)) p = q;
      }
      out.push(p || o.model.position.clone().addScaledVector(t, 22).addScaledVector(up, 1));
    }
    return out;
  }

  // charred remains until it's rebuilt
  spawnRubble(o) {
    const g = this.game;
    if (SMALL_KINDS.has(o.kind)) {
      this.place(o, outpostTemplate(o.kind, hex(o.faction), o.seed % 2, true));
      o.rubble = true;
      o.raidPoint = null;
      return;
    }
    const root = new THREE.Group();
    const rr = mulberry32(o.seed + 7);
    const mats = [toon(0x2a2433), toon(0x3a3550), toon(0x4a3f3a)];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8 + rr() * 2.2, 0.3 + rr() * 1.2, 0.8 + rr() * 2.2), mats[i % 3]);
      m.position.set(-5 + rr() * 10, 0.3, -5 + rr() * 10);
      m.rotation.set(rr() * 0.6, rr() * 3, rr() * 0.6);
      ink(m, 0.04);
      root.add(m);
    }
    if (o.kind === 'farm') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.3, 6, 24, Math.PI * 1.3).rotateX(Math.PI / 2), toon(0x55607a));
      ring.position.y = 0.3;
      root.add(ring);
    }
    root.position.copy(g.planet.ground(o.dir, new THREE.Vector3(), -0.2));
    frameQuat(o.dir, tangent(SUN.clone(), o.dir).normalize(), root.quaternion);
    g.scene.add(root);
    o.model = root;
    o.rubble = true;
    o.cols = [];
  }

  despawn(o) {
    o.rubble = false;
    o.raidPoint = null;
    if (o.model) { o.model.removeFromParent(); o.model = null; }
    for (const c of o.cols) this.game.colliders.remove(c);
    o.cols = [];
  }

  // ---------- military patrols between their outposts ----------
  buildRoutes() {
    this.routes = [];
    const mil = this.outposts.filter((o) => MILITARY.includes(o.faction));
    for (const a of mil) {
      let best = null, bd = 1700;
      for (const b of mil) {
        if (b === a || b.faction !== a.faction) continue;
        const d = arcDist(a.dir, b.dir);
        if (d < bd) { bd = d; best = b; }
      }
      if (best && !this.routes.some((r) => (r.a === best && r.b === a))) this.routes.push({ a, b: best, faction: a.faction, len: bd, unit: null });
      // lone outposts still get a little loop of their own
      else if (!best) this.routes.push({ a, b: null, faction: a.faction, len: 300, unit: null });
    }
    for (const p of this.patrols) p.model.root.removeFromParent();
    this.patrols = [];
  }

  spawnPatrol(r) {
    const g = this.game;
    const fc = hex(r.faction);
    const m = makeRover({ color: 0x55607a, trim: fc, pirate: false, flag: fc });
    m.root.scale.setScalar(1.15);
    g.scene.add(m.root);
    const unit = { route: r, model: m, t: Math.random(), dir: 1, pos: new THREE.Vector3(), heading: new THREE.Vector3(), fireCd: 1 + Math.random() * 2, speed: 16 };
    r.unit = unit;
    this.patrols.push(unit);
  }

  routePoint(r, t, out) {
    if (r.b) { const e = Math.min(0.3, 50 / Math.max(1, r.len)); return out.copy(r.a.dir).lerp(r.b.dir, e + t * (1 - 2 * e)).normalize(); }
    // loop around a lone outpost
    const a = t * Math.PI * 2;
    const tA = tangent(_v.set(1, 0, 0), r.a.dir).normalize();
    const tB = new THREE.Vector3().crossVectors(r.a.dir, tA);
    return out.copy(r.a.dir).addScaledVector(tA, Math.cos(a) * 0.024).addScaledVector(tB, Math.sin(a) * 0.024).normalize();
  }

  updatePatrols(dt) {
    const g = this.game;
    const P = g.player;
    for (const r of this.routes) {
      const near = arcDist(P.pos, r.a.dir) < 1000;
      if (near && !r.unit && this.patrols.length < 4) this.spawnPatrol(r);
      else if (!near && r.unit) { r.unit.model.root.removeFromParent(); this.patrols = this.patrols.filter((u) => u !== r.unit); r.unit = null; }
    }
    for (const u of this.patrols) {
      const r = u.route;
      u.t += (u.dir * u.speed * dt) / Math.max(50, r.len);
      if (r.b) { if (u.t > 1 || u.t < 0) { u.t = Math.min(1, Math.max(0, u.t)); u.dir *= -1; } }
      else u.t = (u.t + 1) % 1;
      const d = this.routePoint(r, u.t, new THREE.Vector3());
      const ahead = this.routePoint(r, Math.min(1, Math.max(0, u.t + u.dir * 0.01)), new THREE.Vector3());
      const prev = u.pos.clone();
      g.planet.ground(d, u.pos);
      const fwd = tangent(ahead.sub(d), d);
      if (fwd.lengthSq() > 1e-10) u.heading.copy(fwd.normalize());
      const m = u.model;
      m.root.position.copy(u.pos);
      frameQuat(d, u.heading, _q);
      m.root.quaternion.slerp(_q, Math.min(1, dt * 5));
      const sp = prev.lengthSq() ? prev.distanceTo(u.pos) / Math.max(dt, 1e-3) : 0;
      for (const w of m.wheels) w.rotation.x += sp * dt / 0.85;
      // they keep the roads clear of pirates
      u.fireCd -= dt;
      if (u.fireCd <= 0) {
        u.fireCd = 1.6;
        const from = u.pos.clone().addScaledVector(d, 4);
        let target = null, bd = 260;
        for (const e of g.enemies.list) {
          if (e.dead || e.faction !== 'pirate' || e.kind === 'core' || !e.center) continue;
          if (g.enemies.friendly(e)) continue;
          const dd = e.center.distanceTo(from);
          if (dd < bd && g.planet.visible(from, e.center)) { bd = dd; target = e; }
        }
        // ...and you, if their faction counts you an enemy (an outlaw riding with Rustmoon)
        const fac = u.faction || (u.route && u.route.faction);
        if (fac && g.rep.hostile(fac) && !g.player.dead) {
          const dd = g.player.center.distanceTo(from);
          if (dd < bd && g.planet.visible(from, g.player.center)) { bd = dd; target = { center: g.player.center, player: true }; }
        }
        if (target) {
          const dir = target.center.clone().sub(from).normalize();
          g.projectiles.fire('mil', from, dir.multiplyScalar(130), { damage: target.player ? 10 : 22, splash: 4, color: 0xffb02e, size: 0.45, knock: 0.5, spare: !target.player });
          m.gun.lookAt(target.center);
        }
      }
    }
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game;
    const P = g.player;
    this.t = (this.t || 0) + dt;
    for (const o of this.outposts) {
      const d = arcDist(P.pos, o.dir);
      if (!o.model && d < BUILD_R) this.spawn(o);
      else if (o.model && d > DROP_R) this.despawn(o);
      else if (o.rubble && !this.wrecked(o)) { this.despawn(o); this.spawn(o); } // rebuilt
      if (o.rubble && o.model && d < 500 && Math.random() < dt * 6) g.fx.spawn((o.mainC || o.model.position).clone().addScaledVector(o.dir, 1.5), o.dir.clone().multiplyScalar(5), { color: 0x2a2433, size: 1.4, life: 1.6, count: 1, spread: 3 });
      if (o.model && d < 400) o.model.traverse((m) => {
        if (m.userData.spin) m.rotation.y += dt * 0.6;
        if (m.userData.blink) m.visible = Math.sin(this.t * 4 + o.seed) > -0.3;
        if (m.userData.flag) m.rotation.y = Math.sin(this.t * 2 + o.seed) * 0.25;
      });
    }
    this.updatePatrols(dt);
    // which territory am I in?
    this.checkT = (this.checkT || 0) - dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      const f = this.owner(P.pos.clone().normalize());
      if (f !== this.current) {
        const first = this.current === null;
        this.current = f;
        const F = FACTIONS[f];
        this.chip.textContent = `◆ ${F.name.toUpperCase()} TERRITORY`;
        this.chip.style.background = F.color;
        this.chip.classList.remove('hidden');
        if (!first && g.state === 'play') g.hud.toast(`Entering ${F.name} territory`, 2);
      }
    }
  }

  // ---------- raiding minor structures ----------
  // Every small structure gives up something of its own (see LOOT). The owners notice and like you a
  // little less either way.
  interact() {
    const g = this.game;
    const P = g.player;
    let o = null;
    for (const x of this.outposts) {
      if (!x.model || x.rubble || !LOOT[x.kind]) continue;
      // each has a marked raid spot (a glowing ring by the goods)
      if (x.raidPoint ? x.raidPoint.distanceTo(P.pos) < 6 : x.model.position.distanceTo(P.pos) < 9) { o = x; break; }
    }
    if (!o) return false;
    const L = LOOT[o.kind];
    const F = FACTIONS[o.faction];
    const wait = (o.lootAt || -1e9) + LOOT_CD - g.time;
    if (wait > 0) { g.hud.prompt(`${KIND_NAMES[o.kind].toUpperCase()} — PICKED CLEAN. RESTOCKS IN ${Math.ceil(wait)}s`); return true; }
    g.hud.prompt(`<b>F</b> — ${L.verb} <span style="color:#ff2a4a">(−${LOOT_REP} ${F ? F.name.toUpperCase() : ''} REP)</span>`);
    if (!g.input.pressed('KeyF') || g.boardCooldown > 0) return true;
    const A = g.alchemy;
    if (L.crate) A.openCrate();
    else {
      // everything but credits rides in the jar
      if (!A.owned) { g.hud.toast(`You need a containment jar to carry a ${ITEMS[L.item].name.toLowerCase()}. Dr. Zbornak sells them.`, 3); return true; }
      if (A.used >= A.slots) { g.hud.toast('Your jar is full.', 2); return true; }
      if (L.credits) g.addCredits(L.credits[0] + Math.floor(Math.random() * (L.credits[1] - L.credits[0] + 1)), KIND_NAMES[o.kind]);
      A.add(L.item, L.names ? L.names[Math.floor(Math.random() * L.names.length)] : undefined);
      g.fx.pop(L.pop, null, { color: ITEMS[L.item].color, size: 46 });
    }
    o.lootAt = g.time;
    g.rep.add(o.faction, -LOOT_REP, `Raided a ${KIND_NAMES[o.kind]}`, { war: false });
    g.audio.pickup();
    g.boardCooldown = 0.4;
    return true;
  }

  // nearest outpost (optionally filtered)
  nearest(dir, filter = () => true) {
    let best = null, bd = Infinity;
    for (const o of this.outposts) {
      if (!filter(o)) continue;
      const d = arcDist(dir, o.dir);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // territory colour for a globe-map cell (cached per cell)
  cellColor(k, x, y, z) {
    if (!this.mapCache) this.mapCache = new Map();
    let c = this.mapCache.get(k);
    if (!c) {
      const f = this.owner(_v.set(x, y, z));
      c = new THREE.Color(FACTIONS[f].color);
      this.mapCache.set(k, c);
    }
    return c;
  }
}

export { KIND_NAMES, MILITARY };
