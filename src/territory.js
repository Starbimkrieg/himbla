import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { toon, ink } from './toon.js';
import { arcDist, tangent, frameQuat, greatCircle, SUN, R as PLANET_R, collectNodes } from './geo.js';
import { mulberry32 } from './rng.js';
import { ITEMS } from './alchemy.js';
import { outpostTemplate, SMALL_KINDS, FLAT_R } from './outpostModels.js';
import { foundedTemplate, TERMINAL_Z, OUTPOST_GUN as GUN } from './storyAssets.js';

// Every square metre of the Moon belongs to somebody: a weighted Voronoi split round faction settlements and outposts.
// Small faction structures dot the countryside, with military patrols between them.
const KEY = 'moonrunner-territory-v1';
const MILITARY = ['spacecom', 'vostok', 'daedalus'];
const LOOP_ARC = 0.024; // rad: radius of a patrol's loop round a lone outpost (~86 m)
const KINDS = {
  spacecom: ['tower', 'depot'], vostok: ['tower', 'depot'], daedalus: ['tower', 'depot'],
  kepler: ['farm', 'mast'], meridian: ['kiosk', 'mast'], rustmoon: ['shack', 'junk'],
};
const KIND_NAMES = {
  tower: 'Watchtower', depot: 'Supply Depot', farm: 'Farm Dome', mast: 'Relay Mast', kiosk: 'Trading Kiosk',
  shack: 'Scrap Shack', junk: 'Junk Pile', homestead: 'Homestead', lab: 'Field Lab',
};
const OUTPOST_W = 0.42; // outpost claim weight relative to a settlement
const BUILD_R = 900, DROP_R = 1150;
const LOOT_CD = 240, LOOT_REP = 2; // raid/rebuild cooldown (s) and reputation cost
const OUTPOST_HP = { farm: 160, depot: 220, tower: 200, mast: 180, kiosk: 140, shack: 160, junk: 200 };
const SAP_NAMES = ['Fern', 'Sprig', 'Basil', 'Twiggy', 'Moss', 'Clover'];
const BOT_NAMES = ['Bolt', 'Sprocket', 'Widget', 'Tinny', 'Gizmo', 'Rivet'];
// Loot per small structure, raided (F at its marked spot) or destroyed.
const LOOT = {
  farm: { verb: 'TAKE A SAPLING', boom: 'DOME DOWN!', item: 'sapling', names: SAP_NAMES, pop: 'SAPLING SWIPED!' },
  depot: { verb: 'RAID THE SUPPLY DEPOT', boom: 'DEPOT DESTROYED!', item: 'wiring', credits: [150, 300], pop: 'CREDITS + WIRING!' },
  tower: { verb: 'SWIPE A SEARCHLIGHT LENS', boom: 'TOWER TOPPLED!', item: 'lens', pop: 'LENS LIFTED!' },
  mast: { verb: 'PULL A SIGNAL TRANSPONDER', boom: 'MAST DOWN!', item: 'transponder', pop: 'TRANSPONDER!' },
  kiosk: { verb: 'GRAB A MYSTERY CRATE', boom: 'KIOSK SMASHED!', crate: true },
  shack: { verb: 'STRIP SOME SCRAP PLATING', boom: 'SHACK FLATTENED!', item: 'plating', pop: 'SCRAP PLATING!' },
  junk: { verb: 'COAX OUT A JUNK BOT', boom: 'JUNK EVERYWHERE!', item: 'junkbot', names: BOT_NAMES, pop: 'JUNK BOT! BEEP!' },
};
const MAP_GRID = 96; // owner cells per cube-face edge for the globe map's territory lookup
const BUILT_R = 40; // founded outposts: flat radius (compound: storyAssets.js)
const TOWN_R = 120; // your town's flat radius (worldstate.js); blend reaches 1.95x
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _w = new THREE.Vector3();
const _gp = new THREE.Vector3(), _gt = new THREE.Vector3(), _gl = new THREE.Vector3(), _gf = new THREE.Vector3();
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// distance from a point (outpost frame) to a yawed box { x, y, z, hx, hy, hz, yaw }
function boxDist(p, h) {
  const dx = p.x - h.x, dz = p.z - h.z, cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const qx = Math.max(0, Math.abs(lx) - h.hx), qy = Math.max(0, Math.abs(p.y - h.y) - h.hy), qz = Math.max(0, Math.abs(lz) - h.hz);
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

// Charred heap of a wrecked founded outpost (a farm also gets its dome ring); a pure builder so the Asset Row can show it.
export function rubbleModel(kind, seed) {
  const root = new THREE.Group();
  const rr = mulberry32(seed + 7);
  const mats = [toon(0x2a2433), toon(0x3a3550), toon(0x4a3f3a)];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8 + rr() * 2.2, 0.3 + rr() * 1.2, 0.8 + rr() * 2.2), mats[i % 3]);
    m.position.set(-5 + rr() * 10, 0.3, -5 + rr() * 10);
    m.rotation.set(rr() * 0.6, rr() * 3, rr() * 0.6);
    ink(m, 0.04);
    root.add(m);
  }
  if (kind === 'farm') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.3, 6, 24, Math.PI * 1.3).rotateX(Math.PI / 2), toon(0x55607a));
    ring.position.y = 0.3;
    root.add(ring);
  }
  return root;
}

// Settlement claims before outposts: one anchor per faction location (HQs claim more). Pirate camps and neutral POIs hold none.
export function locationAnchors(locations) {
  const out = [];
  for (const l of locations) {
    if (l.poi || l.camp || !FACTIONS[l.faction] || l.faction === 'none') continue;
    out.push({ dir: l.dir, faction: l.faction, w: l.hq ? 1.5 : 1, loc: l });
  }
  return out;
}

// Who holds dir, and how safely: nearest rival's weighted distance over the holder's (1 = on a border, bigger = deeper in).
export function holderOf(dir, anchors) {
  let best = null, bd = Infinity;
  for (const a of anchors) {
    const d = arcDist(dir, a.dir) / a.w;
    if (d < bd) { bd = d; best = a; }
  }
  if (!best) return { faction: 'spacecom', depth: 1 };
  let rival = Infinity;
  for (const a of anchors) {
    if (a.faction === best.faction) continue;
    const d = arcDist(dir, a.dir) / a.w;
    if (d < rival) rival = d;
  }
  return { faction: best.faction, depth: rival / Math.max(bd, 1e-6) };
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
    this.placeName = null; // settlement you're in (shown under the territory line in the chip)
    this.chip = document.createElement('div');
    this.chip.id = 'terrchip';
    this.chip.className = 'chip terr hidden';
    document.getElementById('undermap').appendChild(this.chip); // territory chip sits under the minimap
    this.t = 0; // play time (no chip flash while settling in at session start)
    // drop the flash class when its animation ends or is cancelled (HUD hidden mid-flash); a restart also cancels, but leaves
    // the new animation running, so only remove when none remain
    const flashDone = () => { if (!this.chip.getAnimations().length) this.chip.classList.remove('flash'); };
    this.chip.addEventListener('animationend', flashDone);
    this.chip.addEventListener('animationcancel', flashDone);
    this.genOutposts();
    this.flatten();
    this.prebake();
    this.load();
    this.rebuild();
    // farm domes and supply depots can be destroyed (same haul as a raid)
    game.blastHooks = game.blastHooks || [];
    game.blastHooks.push((pos, radius, damage, owner) => this.onBlast(pos, radius, damage, owner));
  }

  locAnchors() {
    return locationAnchors(this.game.locations);
  }

  // After a finale moves borders (main.js applyWorldLive): re-deal outposts as a fresh boot would (same ids, rolls),
  // keeping captures, your builds and story changes.
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

  // All road points as unit directions in one flat xyz array (every other mesh vertex, plus traffic paths).
  // Cached; rebuilt when the network's size changes.
  roadDirs() {
    const tr = this.game.world.traffic;
    const rp = tr && tr.roadMesh && tr.roadMesh.geometry.attributes.position;
    const pieces = (tr && tr.pieces) || [];
    const c = this._roads;
    if (c && c.mesh === (rp || null) && c.verts === (rp ? rp.count : 0) && c.pieces === pieces.length) return c.a;
    const a = [];
    const push = (v) => { v.normalize(); a.push(v.x, v.y, v.z); };
    if (rp) for (let i = 0; i < rp.count; i += 2) push(_w.fromBufferAttribute(rp, i));
    for (const pc of pieces) for (const p of (pc.path && pc.path.pts) || pc.raw || []) push(_w.copy(p));
    this._roads = { mesh: rp || null, verts: rp ? rp.count : 0, pieces: pieces.length, a: Float64Array.from(a) };
    return this._roads.a;
  }

  // Is any road within dist metres of unit direction d?
  nearRoad(d, dist) {
    const road = this.roadDirs(), cos = Math.cos(dist / this.game.planet.R);
    for (let i = 0; i < road.length; i += 3) if (road[i] * d.x + road[i + 1] * d.y + road[i + 2] * d.z > cos) return true;
    return false;
  }

  // Would a town founded at d crowd what's laid down? Its 120 m plateau blends to 234 m; an outpost's flat is applied after the
  // zones (overlaying the blend ring), roads and lakes are baked into the old ground. Gaps match clearSites round a late
  // settlement: 312 m to an unbuilt outpost, 306 m to a road (blend + an outpost's 72 m), a lake's reach + 250 m (clear of
  // townScore's 240 m ring).
  siteClash(d) {
    const g = this.game, R = g.planet.R;
    const reach = TOWN_R * 1.95 + FLAT_R * 2 + 12;
    for (const o of this.outposts) if (!o.built && arcDist(d, o.dir) < Math.max(TOWN_R * 1.6 + 120, reach)) return true;
    for (const lk of g.world.lakes || []) if (arcDist(d, lk.d) < Math.acos(Math.min(1, lk.cos)) * R + 250) return true;
    return this.nearRoad(d, reach);
  }

  // Structures sit on ~60 m plateaus (blending to ~2x): keep them off earlier roads, black lakes and settlement plateaus.
  // A clash is nudged to the nearest clear spot or dropped (ids stay stable for saves).
  clearSites() {
    const g = this.game, R = g.planet.R;
    const blend = FLAT_R * 2 + 12;
    const lakes = (g.world.lakes || []).map((lk) => ({ d: lk.d, r: Math.acos(Math.min(1, lk.cos)) * R + blend }));
    const bad = (d, self) => {
      for (const l of g.locations) if (arcDist(d, l.dir) < Math.max((l.zoneR || l.r) * 1.6 + 120, l.r * 1.95 + blend)) return true;
      for (const lk of lakes) if (arcDist(d, lk.d) < lk.r) return true;
      if (this.nearRoad(d, blend)) return true;
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

  // Bake each outpost look (kind x faction, ~10-35 ms each) in idle time (mostly on the title screen) so a new one doesn't
  // hitch. Anything unbaked bakes on spawn.
  prebake() {
    const looks = new Map();
    for (const o of this.outposts) if (SMALL_KINDS.has(o.kind)) looks.set(`${o.kind}|${o.faction}`, o);
    // intact looks first, then wrecks (so the first kill doesn't hitch either)
    const queue = [...looks.values()].map((o) => [o, false]).concat([...looks.values()].map((o) => [o, true]));
    const later = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 40));
    const run = () => {
      const next = queue.shift();
      if (next) outpostTemplate(next[0].kind, hex(next[0].faction), next[0].seed % 2, next[1]);
      if (queue.length) later(run);
    };
    later(run);
  }

  // Register every plateau before near terrain is (re)built, so nothing pops. Crystals in the blend ring move onto the new ground.
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
        // grew into your town: no outpost, no 40 m flat (applyWorldLive removes it live too, so a reload matches)
        if (this.game.ws && this.game.ws.town && this.game.ws.town.replaces === b.id) continue;
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
    // ILMB fell: SPACECOM's outposts go to the clans
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

  // Outposts claim a little ground (so captures move borders).
  rebuild() {
    this.anchors = this.baseAnchors.concat(this.outposts.map((o) => ({ dir: o.dir, faction: o.faction, w: o.built ? 0.6 : OUTPOST_W })));
    this.mapG = null;
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

  // ---------- outpost structures (built only near the player) ----------
  spawn(o) {
    const g = this.game;
    if (this.wrecked(o)) { this.spawnRubble(o); return; }
    const c = hex(o.faction);
    if (SMALL_KINDS.has(o.kind)) { this.place(o, outpostTemplate(o.kind, c, o.seed % 2, false)); return; }
    // player-founded outposts: kit-built compound (storyAssets.js): hab dome or research block, paved apron, built modules
    this.place(o, foundedTemplate(o.kind, c, o.modules || []));
    o.terminal = o.model.localToWorld(new THREE.Vector3(0, 0, TERMINAL_Z));
    this.findGuns(o);
  }

  // Your militia turrets: place() clones the template, so live heads are re-found by tag on each spawn
  // (clone() copies plain userData only, never references).
  findGuns(o) {
    o.guns = [];
    o.model.updateMatrixWorld(true);
    o.model.traverse((m) => {
      if (!m.userData.outpostGun) return;
      m.rotation.order = 'YXZ'; // clone() drops Euler order: pitch about the head's x, then yaw
      o.guns.push({ head: m, root: m.parent, cd: 0.5 + 0.45 * o.guns.length, scanT: 0, target: null, skips: new WeakMap(), side: 1 });
    });
  }

  // Each gun yaws and pitches onto the nearest raider's lead point and fires alternating twin barrels, with the same
  // aim-lead and line-of-fire checks as enemies.updateTurret. Idle heads keep sweeping so the shadow cache never caches them.
  updateGuns(o, dt) {
    const g = this.game, E = g.enemies;
    for (const gun of o.guns) {
      const head = gun.head;
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(_gp);
      let tg = gun.target;
      if (tg && (tg.dead || tg.center.distanceTo(_gp) > GUN.range * 1.05)) tg = gun.target = null;
      gun.scanT -= dt; gun.cd = Math.max(-1, gun.cd - dt);
      if (!tg && gun.scanT <= 0) {
        gun.scanT = 0.4;
        let bd = GUN.range;
        for (const e of E.list) {
          if (!E.gunTarget(e) || gun.skips.get(e) > g.time) continue; // no line of fire a moment ago
          let d = e.center.distanceTo(_gp);
          if (o.guns.some((x) => x !== gun && x.target === e)) d += 80; // a second gun prefers another raider
          if (d < bd) { bd = d; tg = e; }
        }
        gun.target = tg;
      }
      let yawErr = 0, pitchErr = 0;
      if (tg) { // track the lead point
        _gl.copy(tg.center).addScaledVector(tg.body.vel, _gp.distanceTo(tg.center) / GUN.speed);
        gun.root.worldToLocal(_gl).sub(head.position); // never read root.rotation.y: clone() re-decomposes it
        yawErr = wrapPi(Math.atan2(_gl.x, _gl.z) - head.rotation.y);
        // pitch clamped to the mount, -0.5..0.6 rad (lower stop clears the deck rail). Raiders within ~10 m or well above are still
        // engaged: the shell leaves along the aim-lead line, not exactly the barrel
        pitchErr = THREE.MathUtils.clamp(Math.atan2(-_gl.y, Math.hypot(_gl.x, _gl.z)), -0.5, 0.6) - head.rotation.x; // +rotation.x = barrel down
        head.rotation.y += THREE.MathUtils.clamp(yawErr, -GUN.turn * dt, GUN.turn * dt);
        head.rotation.x += THREE.MathUtils.clamp(pitchErr, -GUN.pitchTurn * dt, GUN.pitchTurn * dt);
      } else {
        head.rotation.y = wrapPi(head.rotation.y + dt * 0.3);
        head.rotation.x -= THREE.MathUtils.clamp(head.rotation.x, -dt, dt);
      }
      if (!tg || gun.cd > 0 || Math.abs(yawErr) > GUN.cone || Math.abs(pitchErr) > GUN.pitchCone) continue;
      head.updateWorldMatrix(false, false); // rotation just changed: keep the muzzle current
      gun.side = -gun.side;
      head.localToWorld(_gt.set(gun.side * GUN.tip[0], GUN.tip[1], GUN.tip[2]));
      gun.cd = GUN.interval;
      if (!E.clearShot(_gt, tg.center)) { gun.cd = 0.3; gun.skips.set(tg, g.time + 3); gun.target = null; continue; }
      const dir = E.aimLead(_gt, GUN.speed, 0.01, tg.center, tg.body.vel);
      g.projectiles.fire('mil', _gt, dir.multiplyScalar(GUN.speed), { damage: GUN.damage, splash: GUN.splash, color: 0xffb02e, size: 0.5, knock: 0.6, spare: true });
      g.fx.spawn(_gt, _gf.set(0, 0, 1).transformDirection(head.matrixWorld).multiplyScalar(5), { color: 0xffe08a, size: 0.9, life: 0.12, count: 3, spread: 1.5, drag: 3 });
      if (_gt.distanceTo(g.player.center) < 300) g.audio.tone(300, 0.1, 'square', 0.07, 0.4);
    }
  }

  // Place a baked outpost model (or wreck); same yaw every time per outpost.
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
      // blast distance to the main building (depot warehouse, farm domes)
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
    g.fx.pop(L.boom, c.clone().addScaledVector(o.dir, 8), { color: '#ff4f2e', size: 64, life: 2.4 });
    // raid haul, flung onto open ground where you can see it
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

  // Clear loot spots: the template's drop point (spread a little), else a ring search for unbuilt ground round the yard.
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
    const root = rubbleModel(o.kind, o.seed);
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
    o.guns = [];
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
      else if (!best) this.routes.push({ a, b: null, faction: a.faction, len: Math.round(Math.PI * 2 * LOOP_ARC * PLANET_R), unit: null });
    }
    for (const p of this.patrols) this.game.enemies.removeRoamer(p);
    this.patrols = [];
  }

  // patrol cars themselves: enemies.js spawnRoamer
  spawnPatrol(r) {
    const g = this.game;
    const P = g.player;
    // start out of the player's sight along the route
    let t = Math.random();
    for (let i = 0; i < 8; i++) {
      const c = Math.random();
      const d = this.routePoint(r, c, new THREE.Vector3());
      t = c;
      if (arcDist(d, P.pos) > 450) break;
    }
    r.unit = g.enemies.spawnRoamer(r, t, Math.random() < 0.5 ? 1 : -1);
  }

  routePoint(r, t, out) {
    if (r.b) { const e = Math.min(0.3, 50 / Math.max(1, r.len)); return out.copy(r.a.dir).lerp(r.b.dir, e + t * (1 - 2 * e)).normalize(); }
    // loop around a lone outpost
    const a = t * Math.PI * 2;
    const tA = tangent(_v.set(1, 0, 0), r.a.dir).normalize();
    const tB = new THREE.Vector3().crossVectors(r.a.dir, tA);
    return out.copy(r.a.dir).addScaledVector(tA, Math.cos(a) * LOOP_ARC).addScaledVector(tB, Math.sin(a) * LOOP_ARC).normalize();
  }

  // One patrol car per route while you're near (an ordinary self-driving enemy entity). Here we only send it out, recall it
  // once you're far away, and give a wrecked route a breather before the next.
  updatePatrols(dt) {
    const g = this.game;
    const P = g.player;
    this.patrols = [];
    for (const r of this.routes) {
      if (r.unit && r.unit.dead) { r.unit = null; r.cool = g.time + 150; }
      const near = arcDist(P.pos, r.a.dir) < 1000;
      if (near && !r.unit && !(r.cool > g.time) && g.enemies.list.filter((e) => e.roam && !e.dead).length < 4) this.spawnPatrol(r);
      else if (r.unit && r.unit.body.pos.distanceTo(P.pos) > 1500 && arcDist(P.pos, r.a.dir) > 1000) { g.enemies.removeRoamer(r.unit); r.unit = null; }
      if (r.unit) this.patrols.push(r.unit);
    }
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game;
    const P = g.player;
    this.t += dt;
    for (const o of this.outposts) {
      const d = arcDist(P.pos, o.dir);
      if (!o.model && d < BUILD_R) this.spawn(o);
      else if (o.model && d > DROP_R) this.despawn(o);
      else if (o.rubble && !this.wrecked(o)) { this.despawn(o); this.spawn(o); } // rebuilt
      if (o.guns && o.guns.length && o.model && !o.rubble) this.updateGuns(o, dt);
      if (o.rubble && o.model && d < 500 && Math.random() < dt * 6) g.fx.spawn((o.mainC || o.model.position).clone().addScaledVector(o.dir, 1.5), o.dir.clone().multiplyScalar(5), { color: 0x2a2433, size: 1.4, life: 1.6, count: 1, spread: 3 });
      if (o.model && d < 400) {
        const movers = o.model.userData.movers || (o.model.userData.movers = collectNodes(o.model, (m) => m.userData.spin || m.userData.blink || m.userData.flag));
        for (const m of movers) {
          if (m.userData.spin) m.rotation.y += dt * 0.6;
          if (m.userData.blink) m.visible = Math.sin(this.t * 4 + o.seed) > -0.3;
          if (m.userData.flag) m.rotation.y = Math.sin(this.t * 2 + o.seed) * 0.25;
        }
      }
    }
    this.updatePatrols(dt);
    // which territory am I in?
    this.checkT = (this.checkT || 0) - dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      const f = this.owner(P.pos.clone().normalize());
      if (f !== this.current) {
        this.current = f;
        const F = FACTIONS[f];
        this.chip.style.background = F.color;
        this.chip.style.setProperty('--glow', F.color);
        this.drawChip();
        this.chip.classList.remove('hidden');
        this.flashChip(); // no "Entering X territory" popup: the chip says it and flashes
      }
    }
  }

  // glow flash in the owner's colour, restarted whenever the chip text changes
  flashChip() {
    if (this.t < 1) return;
    const el = this.chip;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // chip: territory line, and under it (centred, same box) the settlement you're in
  drawChip() {
    const F = FACTIONS[this.current];
    if (!F) return;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    this.chip.innerHTML = `◆ ${esc(F.name.toUpperCase())} TERRITORY${this.placeName ? `<div class="terr-place">${esc(this.placeName.toUpperCase())}</div>` : ''}`;
  }

  setPlace(name) {
    if (name === this.placeName) return;
    this.placeName = name;
    this.drawChip();
    this.flashChip();
  }

  // ---------- raiding minor structures ----------
  // Each small structure gives its own loot (LOOT); the owners like you a little less either way.
  interact() {
    const g = this.game;
    const P = g.player;
    let o = null;
    for (const x of this.outposts) {
      if (!x.model || x.rubble || !LOOT[x.kind]) continue;
      // marked raid spot: a glowing ring by the goods
      if (x.raidPoint ? x.raidPoint.distanceTo(P.pos) < 6 : x.model.position.distanceTo(P.pos) < 9) { o = x; break; }
    }
    if (!o) return false;
    const L = LOOT[o.kind];
    const F = FACTIONS[o.faction];
    const wait = (o.lootAt || -1e9) + LOOT_CD - g.time;
    // restocks, but the player isn't told when
    if (wait > 0) { g.hud.prompt(`${KIND_NAMES[o.kind].toUpperCase()} — PICKED CLEAN`); return true; }
    g.hud.prompt(`<b>F</b> — ${L.verb} <span style="color:#ff2a4a">(−${LOOT_REP} ${F ? F.name.toUpperCase() : ''} REP)</span>`);
    if (!g.input.pressed('KeyF') || g.boardCooldown > 0) return true;
    const A = g.alchemy;
    if (L.crate) A.openCrate();
    else {
      // everything but credits rides in the jar
      if (!A.owned) { g.hud.toast(`You need a containment jar to carry a ${ITEMS[L.item].name.toLowerCase()}. Dr. Zbornak sells them.`, 5); return true; }
      if (A.used >= A.slots) { g.hud.toast('Your jar is full.', 3.5); return true; }
      if (L.credits) g.addCredits(L.credits[0] + Math.floor(Math.random() * (L.credits[1] - L.credits[0] + 1)), KIND_NAMES[o.kind]);
      A.add(L.item, L.names ? L.names[Math.floor(Math.random() * L.names.length)] : undefined);
      g.fx.pop(L.pop, null, { color: ITEMS[L.item].color, size: 46, life: 2.4 });
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

  // ---------- globe map ----------
  // The map colours each pixel by the exact owner below it, so borders are crisp. owner() per pixel (a loop over every
  // anchor) is too slow, so a coarse cube-face grid answers where a cell and its neighbours share one faction; border cells
  // keep the few anchors claiming them or their neighbours, and only those compete. Rebuilt lazily after border changes.
  mapGrid() {
    if (this.mapG) return this.mapG;
    const T = MAP_GRID, S = T + 2; // one spare cell ring per face, so rims need no special case
    const names = Object.keys(FACTIONS), fi = {};
    names.forEach((n, i) => { fi[n] = i; });
    const A = this.anchors, n = A.length;
    const ad = new Float32Array(n * 3), aw = new Float32Array(n), af = new Uint8Array(n);
    A.forEach((a, i) => { const l = a.dir.length() || 1; ad[i * 3] = a.dir.x / l; ad[i * 3 + 1] = a.dir.y / l; ad[i * 3 + 2] = a.dir.z / l; aw[i] = a.w; af[i] = fi[a.faction] || 0; }); // owner() normalises too
    const own = new Uint16Array(6 * S * S), d = new THREE.Vector3();
    let k = 0;
    for (let f = 0; f < 6; f++) for (let j = -1; j <= T; j++) for (let i = -1; i <= T; i++) {
      const a = ((i + 0.5) / T) * 2 - 1, b = ((j + 0.5) / T) * 2 - 1;
      switch (f) {
        case 0: d.set(1, b, -a); break;
        case 1: d.set(-1, b, a); break;
        case 2: d.set(a, 1, -b); break;
        case 3: d.set(a, -1, b); break;
        case 4: d.set(a, b, 1); break;
        default: d.set(-a, b, -1);
      }
      d.normalize();
      let best = 0, bd = Infinity;
      for (let q = 0; q < n; q++) {
        const dd = Math.acos(Math.min(1, ad[q * 3] * d.x + ad[q * 3 + 1] * d.y + ad[q * 3 + 2] * d.z)) / aw[q];
        if (dd < bd) { bd = dd; best = q; }
      }
      own[k++] = best;
    }
    // per cell: a lone faction (colour from the grid) or, at a border, the anchors in play
    const col = new Uint8Array(T * T * 6), edge = new Int32Array(T * T * 6).fill(-1), cand = [];
    for (let f = 0; f < 6; f++) for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const c = (f * T + j) * T + i, base = (f * S + (j + 1)) * S + (i + 1);
      const ids = [];
      let mixed = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const q = own[base + dj * S + di];
        if (!ids.includes(q)) ids.push(q);
        if (af[q] !== af[own[base]]) mixed = true;
      }
      col[c] = af[own[base]];
      if (mixed) { edge[c] = cand.length; cand.push(ids.length, ...ids); }
    }
    const rgb = names.map((nm) => { const c = new THREE.Color(FACTIONS[nm].color); return [c.r * 255, c.g * 255, c.b * 255]; });
    return (this.mapG = { T, col, edge, cand: Uint16Array.from(cand), ad, aw, af, rgb });
  }

  // colour [r, g, b] (0-255) of the territory holding the unit direction (x, y, z)
  mapColor(x, y, z) {
    const G = this.mapGrid(), T = G.T;
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y, az = z < 0 ? -z : z;
    let f, a, b;
    if (ax >= ay && ax >= az) { if (x > 0) { f = 0; a = -z / x; b = y / x; } else { f = 1; a = z / -x; b = y / -x; } }
    else if (ay >= az) { if (y > 0) { f = 2; a = x / y; b = -z / y; } else { f = 3; a = x / -y; b = z / -y; } }
    else if (z > 0) { f = 4; a = x / z; b = y / z; } else { f = 5; a = x / z; b = y / -z; }
    const i = Math.min(T - 1, Math.max(0, ((a + 1) * 0.5 * T) | 0)), j = Math.min(T - 1, Math.max(0, ((b + 1) * 0.5 * T) | 0));
    const c = (f * T + j) * T + i, e = G.edge[c];
    if (e < 0) return G.rgb[G.col[c]];
    // at a border: closest nearby anchor (owner()'s weighted distance)
    const { cand, ad, aw } = G;
    let best = 0, bd = Infinity;
    for (let q = 1; q <= cand[e]; q++) {
      const m = cand[e + q];
      const dd = Math.acos(Math.min(1, ad[m * 3] * x + ad[m * 3 + 1] * y + ad[m * 3 + 2] * z)) / aw[m];
      if (dd < bd) { bd = dd; best = m; }
    }
    return G.rgb[G.af[best]];
  }
}

export { KIND_NAMES, MILITARY, SAP_NAMES };
