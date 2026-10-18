import * as THREE from 'three';
import { Kit, T, G, outpostTemplate, container, crate, tank, junkHeap, sandbags, lightString } from '../outpostModels.js';
import { foundedTemplate } from '../storyAssets.js';
import { rubbleModel } from '../territory.js';
import { FACTIONS } from '../locations.js';
import { mulberry32 } from '../rng.js';
import { World } from '../world.js';
import { DISH_SIZE } from '../models.js';
import { buildHomeTown, addBuilding, slotAt } from '../hometown.js';
import {
  habDome, cabin, warehouse, quonset, lattice, hortonSphere, floodMast, stack, ticker, conveyor, pipe, radar, searchlight, shanty,
  wreckHull, penTerminal, jobTerminal, playground, waterTower, greenhouse, commsMast, townHall, towerCrane, gantryCrane, cargoStack, garage, dishStation,
} from '../settlements.js';
import { ferrisWheel, carousel } from '../downsFair.js';
import { animate, together, lineUp } from './common.js';

// Asset Row catalogue group: the small faction outposts (intact and wreck), the building parts the settlements are made of, and the
// hometown buildings. Items: see index.js. Every make() builds from scratch (a fresh Kit, a fresh stand-in world) or clones a baked
// template; nothing is kept between calls.

const hex = (c) => new THREE.Color(c).getHex();
const fc = (f) => hex(FACTIONS[f].color);
const YEL = 0xffd23f;

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

// The Kit's colliders may be 'hcyl' (a lying cylinder: quonset roofs), which the Row's collider builder does not know: a box that
// covers the same roof instead.
const fixCols = (cols) => cols.map((c) => (c.type === 'hcyl'
  ? { type: 'box', x: c.x, y: c.y + c.r / 2, z: c.z, hx: c.r, hy: c.r / 2, hz: c.len / 2, yaw: c.yaw || 0 }
  : c));
const shiftCols = (cols, dx, dz = 0) => { for (const c of cols) { c.x += dx; c.z += dz; } };

// One kit-built part: fn(k) draws into a fresh Kit as a settlement does (onGround), returns { root, cols, update }.
function kitPart(fn, { color = YEL, seed = 1 } = {}) {
  const k = new Kit(color, seed, false);
  k.onGround = true;
  fn(k);
  k.at();
  const t = k.finish();
  return { root: t.root, cols: fixCols(t.cols), update: animate(t.root, seed) };
}

// The stand-in for the World and a settlement location, for the builders that take (world, loc, ...): put() puts into loc.group
// (optionally re-framed: a plot's building comes out facing +z at the origin), col() collects the collider specs, flag() is the
// real World's. Returns { root, cols, update }.
function viaWorld(fn, { faction = 'spacecom', frame = null } = {}) {
  const loc = { id: 'row', name: 'ROW', faction, group: new THREE.Group(), pads: [], r: 100, slots: [] };
  const cols = [];
  const c = frame ? Math.cos(frame.face) : 1, s = frame ? Math.sin(frame.face) : 0;
  const local = (x, z) => (frame ? [(x - frame.x) * c - (z - frame.z) * s, (x - frame.x) * s + (z - frame.z) * c] : [x, z]);
  const world = {
    rand: mulberry32(42),
    anims: [],
    put(obj, l, dx, dz, dy = 0, yaw = 0) {
      const [x, z] = local(dx, dz);
      obj.position.set(x, dy, z);
      obj.rotation.y = yaw - (frame ? frame.face : 0);
      l.group.add(obj);
      return obj;
    },
    col(l, spec) {
      const [x, z] = local(spec.x, spec.z);
      const out = { ...spec, x, z };
      if (spec.yaw !== undefined && frame) out.yaw = spec.yaw - frame.face;
      cols.push(out);
      return out;
    },
    flag: World.prototype.flag,
  };
  fn(world, loc);
  return { root: loc.group, cols: fixCols(cols), update: animate(loc.group) };
}

// A kit part that needs the stand-in world as well: fn(world, loc, k)
function worldPart(fn, { color = YEL, seed = 1 } = {}) {
  const k = new Kit(color, seed, false);
  k.onGround = true;
  const extra = viaWorld((world, loc) => { fn(world, loc, k); });
  k.at();
  const t = k.finish();
  extra.root.add(t.root);
  return { root: extra.root, cols: fixCols(t.cols).concat(extra.cols), update: animate(extra.root, seed) };
}

// centre a part on the origin in x and z (its feet stay on y = 0) and read off its size: w along x, d along z
function tidy(p) {
  p.root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(p.root), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
  p.root.position.x -= c.x;
  p.root.position.z -= c.z;
  shiftCols(p.cols, -c.x, -c.z);
  p.w = sz.x;
  p.d = sz.z;
  return p;
}

// several parts side by side as one item (lineUp): { root, cols, update }
function row(parts, gap = 3) {
  for (const p of parts) tidy(p);
  const x0 = parts.map((p) => p.root.position.x);
  const L = lineUp(parts, gap);
  const cols = [];
  parts.forEach((p, i) => { shiftCols(p.cols, p.root.position.x - x0[i]); cols.push(...p.cols); });
  return { root: L.root, cols, update: together(...parts.map((p) => p.update)) };
}

const item = (id, label, w, d, make, extra = {}) => ({ id, label, w, d, make, ...extra });

// ---------------------------------------------------------------------------------------------
// 08 OUTPOSTS: the seven small faction kinds, each intact and as its wreck (always the Kit build: src 'kit')
// ---------------------------------------------------------------------------------------------
const OUTPOSTS = [
  // kind, label, owner (a faction that has one in the game), w, d
  ['tower', 'WATCHTOWER', 'spacecom', 50, 55],
  ['depot', 'SUPPLY DEPOT', 'vostok', 56, 56],
  ['farm', 'FARM DOME', 'kepler', 58, 58],
  ['mast', 'RELAY MAST', 'meridian', 50, 50],
  ['kiosk', 'TRADING KIOSK', 'meridian', 54, 54],
  ['shack', 'SCRAP SHACK', 'rustmoon', 52, 52],
  ['junk', 'JUNK PILE', 'rustmoon', 56, 56],
];

function outpostItem(kind, label, faction, w, d, wreck) {
  return item(`outpost.${kind}${wreck ? '.wreck' : ''}`, `${label}${wreck ? ' (WRECK)' : ''}`, w, d, () => {
    const t = outpostTemplate(kind, fc(faction), 0, wreck, 'kit');
    const root = t.root.clone();
    return { root, cols: fixCols(t.cols), update: animate(root) };
  });
}

// the compounds a player founds (storyAssets.js), bare and with all six modules and the second gun built
const MODULES = ['greenhouse', 'clinic', 'beacon', 'turret', 'market', 'garage', 'turret2'];
function foundedItem(kind, label, modules, w, d) {
  return item(`outpost.founded.${kind}${modules.length ? '.built' : ''}`, `${label}${modules.length ? ' (ALL MODULES)' : ' (BARE)'}`, w, d, () => {
    const t = foundedTemplate(kind, fc('kepler'), modules);
    const root = t.root.clone();
    // (the militia guns sweep idly, as territory.updateGuns does with nothing to shoot at)
    const guns = [];
    root.traverse((o) => { if (o.userData.outpostGun) guns.push(o); });
    const sweep = guns.length ? (dt) => { for (const g of guns) g.rotation.y += dt * 0.3; } : undefined;
    return { root, cols: fixCols(t.cols), update: together(animate(root), sweep) };
  });
}

const outposts = {
  id: 'buildings.outposts',
  title: '08 · OUTPOSTS',
  items: [
    ...OUTPOSTS.flatMap(([kind, label, faction, w, d]) => [outpostItem(kind, label, faction, w, d, false), outpostItem(kind, label, faction, w, d, true)]),
    foundedItem('homestead', 'FOUNDED HOMESTEAD', [], 74, 74),
    foundedItem('homestead', 'FOUNDED HOMESTEAD', MODULES, 74, 74),
    foundedItem('lab', 'FOUNDED FIELD LAB', [], 74, 74),
    foundedItem('lab', 'FOUNDED FIELD LAB', MODULES, 74, 74),
    item('outpost.founded.rubble', 'FOUNDED OUTPOST RUBBLE', 11, 9, () => {
      const root = rubbleModel('homestead', 1234);
      return { root };
    }, { solid: false }),
  ],
};

// ---------------------------------------------------------------------------------------------
// 09 BUILDING PARTS: what the settlements are built from (settlements.js, outpostModels.js)
// ---------------------------------------------------------------------------------------------
const WH = 0xd8d4e8, GREY = 0x5b5870;
const TICKER_TEXT = 'HE-3 ▲ 412.70 | REGOLITH ▼ 3.15 | DEUTERIUM ▲ 88.20 | ICE ▲ 19.95 | ANTIMATTER ▼ 9,999.00 | PIRATE RISK ▲ HIGH';

const parts = {
  id: 'buildings.parts',
  title: '09 · BUILDING PARTS',
  items: [
    item('part.habdome.family', 'HAB DOMES 6 · 12 · 16 M', 89, 41, () => row([
      kitPart((k) => habDome(k, 0, 0, 6, 0xff7ad9, { trim: 0xff9f1c })),
      kitPart((k) => habDome(k, 0, 0, 12, 0x2ec4ff, { trim: 0xffd23f })),
      kitPart((k) => habDome(k, 0, 0, 16, 0xb8ffb0, { trim: 0xff9f1c, glass: true })),
    ])),
    item('part.habdome.hub', 'HAB DOME 22 M (TOWN HUB)', 51, 54, () => kitPart((k) => habDome(k, 0, 0, 22, 0xb8ffb0, { trim: 0xff9f1c }))),
    item('part.habdome.council', 'HAB DOME 30 M (COUNCIL)', 68, 71, () => kitPart((k) => habDome(k, 0, 0, 30, 0xffd23f, { trim: 0xff9f1c }))),
    item('part.habdome.great', 'HAB DOME 58 M (ILMB GREAT DOME)', 124, 128, () => kitPart((k) => habDome(k, 0, 0, 58, 0x9be7ff, { trim: YEL, cupola: false })), { big: true }),
    item('part.cabin', 'PREFAB CABINS', 38, 9, () => row([
      kitPart((k) => cabin(k, 0, 0, 10, 8, 4.6, 0xff9f1c, 0, { trim: 0xffd23f })),
      kitPart((k) => cabin(k, 0, 0, 10, 8, 4.6, 0x2ec4ff, 0, { trim: 0xff7ad9, solar: true })),
      kitPart((k) => cabin(k, 0, 0, 10, 8, 4.6, 0x7dff6a, 0, { trim: 0xc77dff })),
    ])),
    item('part.warehouse', 'WAREHOUSE', 16.5, 14.3, () => kitPart((k) => warehouse(k, 0, 0, 16, 11, 6, WH, 0, YEL))),
    item('part.quonset', 'QUONSET HUTS', 28, 35, () => row([
      kitPart((k) => quonset(k, 0, 0, 4.5, 12, WH, 0, YEL)),
      kitPart((k) => quonset(k, 0, 0, 7, 34, GREY, 0, YEL)),
    ])),
    item('part.lattice', 'LATTICE TOWERS 30 · 40 · 54 M', 38, 11, () => row([
      kitPart((k) => lattice(k, 0, 0, 30, 2.2, 0.5, 8, T(WH), T(0x3a3550))),
      kitPart((k) => lattice(k, 0, 0, 40, 5, 1.6, 9, T(YEL), T(0xff9f1c), { r: 0.32 })),
      kitPart((k) => lattice(k, 0, 0, 54, 2.8, 2.8, 12, T(0xff4f2e), T(0xfff4e0), { r: 0.32 })),
    ], 8)),
    item('part.horton', 'HORTON SPHERES', 33, 15, () => row([
      kitPart((k) => hortonSphere(k, 0, 0, 6.5, 0xfff4e0, 0x7dff6a)),
      kitPart((k) => hortonSphere(k, 0, 0, 6.5, 0xfff4e0, 0xff4f2e)),
    ])),
    item('part.flood-mast', 'FLOODLIGHT MAST', 1.7, 3.3, () => kitPart((k) => floodMast(k, 20, 0, 14))),
    item('part.stack', 'EXHAUST STACKS', 12, 7, () => row([
      kitPart((k) => stack(k, 0, 0, 26, 1.6)),
      kitPart((k) => stack(k, 0, 0, 20, 3)),
    ])),
    item('part.ticker', 'PRICE TICKER DRUM', 12.7, 12.7, () => kitPart((k) => ticker(k, 0, 0.5, 0, 6, 2.6, TICKER_TEXT))),
    item('part.conveyor', 'ORE CONVEYOR', 36, 26, () => kitPart((k) => conveyor(k, [[0, 0], [14, 0], [26, 10], [34, 24]], 4.6))),
    item('part.pipe', 'PIPE RUN', 21, 15, () => kitPart((k) => pipe(k, [[0, 0], [14, 0], [14, 10], [20, 14]], 3.2, 0.5))),
    item('part.radar', 'RADAR', 8, 2, () => kitPart((k) => radar(k, 0, 0, 0, 8, 0x2ec4ff))),
    item('part.searchlight', 'SEARCHLIGHT', 10.4, 41, () => kitPart((k) => searchlight(k, 0, 0, 0, 40))),
    item('part.shanty', 'PIRATE SHANTIES', 19.4, 6.9, () => row([
      kitPart((k) => shanty(k, 0, 0, 8, 4, 6, 0x8a4b2a, 0, () => 0.1)),
      kitPart((k) => shanty(k, 0, 0, 8, 4, 6, 0x6b5a3a, 0, () => 0.9)),
    ])),
    item('part.wreck-hull', 'WRECKED SHIP HULL', 33, 23, () => kitPart((k) => wreckHull(k, 0, 0, 0, 24, 0x6b4a32))),
    item('part.pen-terminal', 'PEN TERMINAL', 4, 3, () => kitPart((k) => penTerminal(k, 0, 0, 0))),
    item('part.job-terminal', 'JOB TERMINAL', 20, 9, () => viaWorld((world, loc) => jobTerminal(world, loc, 0, 0, 0, YEL))),
    item('part.playground', 'PLAYGROUND', 26.5, 26.5, () => worldPart((world, loc, k) => playground(world, loc, k, 0, 0, 0))),
    item('part.water-tower', 'WATER TOWER', 9, 9, () => worldPart((world, loc, k) => waterTower(world, loc, k, 0, 0, 0xff9f1c))),
    item('part.greenhouse', 'GREENHOUSE', 7.5, 18.5, () => worldPart((world, loc, k) => greenhouse(world, loc, k, 0, 0, 0))),
    item('part.comms-mast', 'COMMS MASTS 16 · 30 M', 12, 3, () => row([
      worldPart((world, loc, k) => commsMast(world, loc, k, 0, 0, 16, 0xff9f1c, 'kepler')),
      worldPart((world, loc, k) => commsMast(world, loc, k, 0, 0, 30, 0xffd23f, 'spacecom')),
    ], 6)),
    item('part.town-hall', 'KEPLER TOWN HALL', 44, 19, () => worldPart((world, loc, k) => townHall(world, loc, k))),
    item('part.ferris-wheel', 'FERRIS WHEEL', 50, 12, () => worldPart((world, loc, k) => ferrisWheel(world, loc, k, 0, 0))),
    item('part.carousel', 'CAROUSEL', 22, 22, () => worldPart((world, loc, k) => carousel(world, loc, k, 0, 0))),
    item('part.tower-crane', 'TOWER CRANE', 44, 9, () => kitPart((k) => towerCrane(k, 0, 0, 34, 30, YEL, { speed: 0.12 }))),
    item('part.gantry-crane', 'GANTRY CRANE', 58, 36, () => kitPart((k) => gantryCrane(k, 0, 0, YEL, { speed: 1 / 40, phase: 0.3, travel: 24 }))),
    item('part.cargo-stacks', 'CARGO CONTAINER STACKS', 42, 9, () => kitPart((k) => {
      ['spacecom', 'vostok', 'kepler', 'meridian'].forEach((f, i) => cargoStack(k, -16 + i * 10.5, 0, 1 + (i % 3), [f, f, f], Math.PI / 2));
    })),
    // (the motor pool with its compound, 61 by 45 m: shifted so the compound, not the hall, is centred on the item)
    item('part.garage.main', 'MOTOR POOL GARAGE', 62, 46, () => kitPart((k) => garage(k, -2.8, 5.5, 0, [true, false, true], 'main'))),
    item('part.garage.small', 'SMALL GARAGE', 34, 20, () => kitPart((k) => garage(k, 0, 0, 0, [true, true], 'small'))),
    item('part.dish-stations', 'DISH STATIONS (CRYO · GANTRY)', 66, 30, () => row([
      kitPart((k) => dishStation(k, 0, 0, DISH_SIZE, 'cryo', 'meridian', '01', { speed: 0.1 })),
      kitPart((k) => dishStation(k, 0, 0, DISH_SIZE, 'gantry', 'kepler', '02', { speed: 0.1, phase: 1 })),
    ], 6)),
    // the Kit's shared props (outpostModels.js), as the outposts and settlements use them
    item('kit.containers', 'CARGO CONTAINERS', 18.2, 2.6, () => kitPart((k) => {
      k.at(0, 0, 0, -0.3); // (the helpers stand things on the outposts' apron, 0.3 m up)
      container(k, -3, 0.3, 0, 0xff9f1c, Math.PI / 2);
      container(k, 3, 0.3, 0, 0x2ec4ff, Math.PI / 2);
      container(k, 0, 2.92, 0, 0x7dff6a, Math.PI / 2);
      container(k, 9, 0.3, 0, 0xff3b5c, Math.PI / 2);
    })),
    item('kit.crates', 'CRATES', 5, 2, () => kitPart((k) => {
      k.at(0, 0, 0, -0.3);
      crate(k, -2, 0.3, 0, 1.2, 0x9a6a3a, 0.2);
      crate(k, 0, 0.3, 0, 0.8, 0x4f5a42, -0.3);
      crate(k, 1.6, 0.3, 0, 1.0, 0xff9f1c, 0);
      crate(k, -2, 1.5, 0, 0.9, 0x2ec4ff, 0.4);
    })),
    item('kit.tanks', 'STORAGE TANKS', 9.6, 4.8, () => kitPart((k) => {
      k.at(0, 0, 0, -0.3);
      tank(k, -3, 0, 2.2, 5, 0xe8e2f4, 0xffd23f);
      tank(k, 2, 0, 2, 4.5, 0x4f8fc0, 0x2ec4ff);
    })),
    item('kit.junk-heap', 'JUNK HEAP', 13, 13.5, () => kitPart((k) => {
      k.at(0, 0, 0, -0.3);
      junkHeap(k, 0, 0, 6.5, 3.2, 22, mulberry32(5));
    })),
    item('kit.sandbags', 'SANDBAG ARCS', 18, 11, () => kitPart((k) => {
      k.at(0, 0, 0, -0.3);
      sandbags(k, -4, 0, 3.6, -1.6, 1.6, 2);
      sandbags(k, 4, 0, 5, -1, 3.2, 3);
    })),
    item('kit.light-string', 'STRING LIGHTS', 14.3, 1, () => kitPart((k) => {
      k.at();
      for (const x of [-7, 0, 7]) k.cyl(0.12, 0.15, 4.4, 6, T(0x3a3550), x, 0, 0, { outline: 0.03 });
      lightString(k, [[-7, 4.3, 0], [0, 4.3, 0], [7, 4.3, 0]], [0xff2e88, YEL, 0x2ee6ff, 0x7dff3a]);
    })),
    item('kit.sign-boards', 'SIGN BOARDS', 33, 1, () => kitPart((k) => {
      k.sign('SUPPLY DEPOT', -10, 0, { w: 10, fg: '#ffd23f', bg: '#241a3a' });
      k.sign('KEEP OUT', 4, 0, { w: 8, fg: '#ff3b5c', bg: '#1a1426', y: 3 });
      k.sign('MOON-RUNNER', 14, 0, { w: 8, fg: '#2ee6ff', bg: '#10243a', y: 3.2 });
    })),
  ],
};

// ---------------------------------------------------------------------------------------------
// 10 HOMETOWN: the Moon Council hall and the nine buildings you can put on its plots (hometown.js)
// ---------------------------------------------------------------------------------------------
const HOME = [
  ['housing', 'HOUSING DOMES'], ['market', 'MARKET HALL'], ['clinic', 'CLINIC'], ['farm', 'GREENHOUSE FARM'], ['motorpool', 'MOTOR POOL'],
  ['barracks', 'MILITIA BARRACKS'], ['roads', 'ROADS'], ['radio', 'RADIO TOWER'], ['pad', 'SHUTTLE PAD'],
];
const hometown = {
  id: 'buildings.hometown',
  title: '10 · HOMETOWN',
  items: [
    // (the Shuttle Pad's deck is 28.6 m across and its stairs run 6 m further toward the hall)
    ...HOME.map(([type, label]) => item(`hometown.${type}`, label, type === 'pad' ? 31 : 27, type === 'pad' ? 37 : 27, () => {
      const slot = slotAt(0);
      return viaWorld((world, loc) => addBuilding(world, loc, 0, type), { faction: 'kepler', frame: slot });
    })),
    item('hometown.hall', 'MOON COUNCIL HALL (EMPTY PLOTS)', 139, 188, () => viaWorld((world, loc) => buildHomeTown(world, loc), { faction: 'kepler' }), { big: true }),
  ],
};

export default [outposts, parts, hometown];

// SKIPPED
// - outpost.mast.glb / outpost.tower.glb (the Blender-GLB pilot outposts): not shown on purpose. The brief says the live game's GLB path
//   must stay untouched, and outpostTemplate(.., 'glb') needs loadOutpostParts({ force }), which flips the game's own outposts.
// - part.tower-crane / part.garage.* in their plain models.js form (makeTowerCrane, makeGarage): the Kit-baked settlement versions
//   (towerCrane, garage) are shown instead; they are the same Blender models baked into the settlement kit. (The plain makeTowerCrane /
//   makeGarage are vehicle-style models with a live crane rig / garage doors; the settlements never use them.)
// - faction colour variants of the outposts: each kind is shown once intact and once as a wreck, in the colour of the faction that owns
//   that kind in the game (territory.js KINDS); the other colours only change trim and flag colours.
// - the farm ring of the founded-outpost rubble (territory.js spawnRubble): dead code in the game, since a farm is a small kind and
//   takes the outpostTemplate wreck instead.
// - World's generic primitives (dome, block, tube, wall pieces) and the settlement-sized dress* routines: those are places, not parts.
