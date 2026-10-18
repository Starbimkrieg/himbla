// Your town (Kepler story finale): a settlement founded at the surveyed site, with eight plots round
// the Moon Council hall. You build from the hall's terminal (or the job board's COUNCIL HALL tab: same
// page, see page()); each building does something (income, healing, militia guns, clinic respawn,
// motor pool, shuttle pad, roads, radio tower). The hall also calls Moon Council votes: factions vote
// with you the more they like you, and a passed motion changes the Moon (worldstate.js applies it on
// the next load, after a "one week later" cut).
import * as THREE from 'three';
import { Kit, T, G, GLASS, crate, sandbags } from './outpostModels.js';
import { habDome, cabin, quonset, lattice, warehouse } from './settlements.js';
import { makeTurret, makeRover } from './models.js';
import { FACTIONS } from './locations.js';
import { saveWorldState } from './worldstate.js';
import { SAP_NAMES } from './territory.js';
import { ITEMS } from './alchemy.js';
import { VEHICLES } from './vehicles.js';
import { terminalPage, wireTerminal, stepSel, keepScroll } from './terminalUI.js';
import { glyphHtml } from './glyphs.js';
import { RadioSweep, SWEEP } from './radio.js';
import { padPlan, padKit, padCols, padStairs } from './landingPad.js';

const DK = 0x3a3550, LT = 0xd8d4e8, CONC = 0x8a8698, CREAM = 0xfff4e0, WARM = 0xfff6a8, KEP = 0xff9f1c, GRN = 0x7dff6a;
export const SLOT_R = 64, SLOTS = 8;
// plot i round the hall, leaving the entrance (local +z) clear
export const slotAt = (i) => { const a = Math.PI / 8 + (i * Math.PI * 2) / SLOTS; return { x: Math.sin(a) * SLOT_R, z: Math.cos(a) * SLOT_R, face: a + Math.PI }; };

// plot i frame point (x across, z toward the hall: the building kits' frame) -> town frame
export const plotPoint = (i, x, z) => { const p = slotAt(i), c = Math.cos(p.face), s = Math.sin(p.face); return { x: p.x + x * c + z * s, z: p.z - x * s + z * c }; };
// SPOTS: where you stand to use a building (F), plot frame; the kit draws a glowing ring there. BAY: the motor pool apron in
// front of the quonset door where vehicles are set down, nose to the plaza (+z)
export const SPOTS = { farm: { x: 0, z: 12.8 }, motorpool: { x: -3, z: 9.8 }, radio: { x: 0, z: 6.5 }, clinic: { x: 0, z: 7.5 } };
export const BAY = { x: -3, z: 15.5 };
// shuttle pad (landingPad.js): deck big enough for the shuttle's ramp to land inside the railing; stairs toward the hall (plot +z)
const PAD_R = 14.3, PAD_PLAN = padPlan(PAD_R);

export const BANK_CAP = 1500; // town bank capacity (₵); a full bank stops earning until collected

// Key order = hall tile and number-key order. icon / tint / feature: the tile (icon names from terminalUI.js);
// income: ₵ a minute into the town bank.
export const BUILDINGS = {
  housing: { name: 'Housing Domes', cost: 1500, icon: 'housing', tint: '#ffd23f', feature: '+₵20 a minute', income: 20, desc: 'Families move in: +₵20 a minute to the town bank.' },
  market: { name: 'Market Hall', cost: 2000, icon: 'market', tint: '#ff2e88', feature: '+₵60 a minute', income: 60, desc: `Traders set up shop: +₵60 a minute to the town bank (it holds up to ₵${BANK_CAP}).` },
  clinic: { name: 'Clinic', cost: 1200, icon: 'clinic', tint: '#ff2a4a', feature: 'K.O. respawn point', desc: 'You redeploy here after a K.O. unless you have set a charted headquarters as your respawn point (set it here).' },
  farm: { name: 'Greenhouse Farm', cost: 1000, icon: 'greenhouse', tint: '#7dff6a', feature: 'Heals · +₵15/min · saplings', income: 15, desc: 'Heals you anywhere in town, +₵15 a minute, and a free sapling for your jar from the nursery bench every five minutes.' },
  motorpool: { name: 'Motor Pool', cost: 1800, icon: 'garage', tint: '#ffd23f', feature: 'Your vehicles · militia', desc: 'A Homestead Mule of your own; roll any vehicle out of its door (F), and your vehicles are patched up whenever you\'re in town. When raiders reach the town, two militia rovers roll out (every 10 minutes).' },
  barracks: { name: 'Militia Barracks', cost: 2200, icon: 'turret2', tint: '#ff9f1c', feature: '2 guns, 400 m', desc: 'Two militia guns that shoot any pirate within 400 m of town.' },
  roads: { name: 'Roads', cost: 1800, icon: 'roads', tint: '#c9c3d9', feature: 'Ring road + links', desc: 'Road crews lay a ring road round the town and link it to the settlements around it. Hover-cars and buggies start calling at once, land-trains by your next load.' },
  radio: { name: 'Radio Tower', cost: 1600, icon: 'beacon', tint: '#2ee6ff', feature: 'Charts 3 km · sweeps', desc: 'Charts 3 km of map round town and lets you sweep the rest of the Moon from the tower; you can call a council vote twice as often.' },
  pad: { name: 'Shuttle Pad', cost: 2500, icon: 'pad', tint: '#c77dff', feature: 'Shuttle · home base', desc: 'A landing pad and a shuttle service to the nearest settlement; the town is also your home base.' },
};

// ---------------------------------------------------------------------------------------------
// Moon Council motions. Members: the five non-pirate factions still standing; Kepler (you) always votes
// yes; a majority passes. hidden(ws): off the table (passed, or moot). icon / tint / feature: the tile,
// as for buildings. For the vote cutscene (chamber.js): say (two lines of ~100 chars max, typed at 34
// letters a second) and focus (delegations addressed; the camera cuts to their faces).
// ---------------------------------------------------------------------------------------------
export const MOTIONS = {
  ceasefire: {
    name: 'Vostok–Daedalus Ceasefire', icon: 'council', tint: '#ff3b5c', feature: 'Vostok & Daedalus stand down',
    desc: 'Vostok and Daedalus stand down. Their militarised zones open up, and their armour (the BTR-M APC and the Phase Skimmer), their weapons and Daedalus\' Phase Dash go on sale to anyone.',
    say: ['Vostok. Daedalus. Every shell you trade out there is one I sweep up in here.', 'I move that you both stand down: open your gates and let the Moon use its roads.'],
    focus: ['vostok', 'daedalus'],
    stance: { vostok: -0.15, daedalus: -0.15 },
    hidden: (ws) => Object.keys(ws.conquered || {}).length > 0,
  },
  openSkies: {
    name: 'Open Skies Accord', icon: 'council', tint: '#ffd23f', feature: 'SPACECOM opens its labs',
    desc: 'SPACECOM opens its motor pool and its labs: the Lunar Interceptor and the Deflector Shield go on sale at the ILMB.',
    say: ['SPACECOM keeps the best motor pool on the Moon locked up in a hangar.', 'I move the Open Skies Accord: open your labs and your interceptors to every honest runner.'],
    focus: ['spacecom', 'meridian'],
    stance: { spacecom: -0.05 },
    hidden: (ws) => !!ws.lawless,
  },
  freeTrade: {
    name: 'Free Trade Charter', icon: 'council', tint: '#2ec4ff', feature: '10% off every shop',
    desc: 'Meridian drops its tariffs: 10% off every shop on the Moon, and the Courier Light-Bike and the Personal Teleporter go on sale at the Exchange.',
    say: ['Every crate on this Moon pays a toll before it pays the people who carried it.', 'I move the Free Trade Charter: drop the tariffs, and let the Moon trade.'],
    focus: ['meridian', 'kepler'],
    stance: {},
  },
  militiaPact: {
    name: 'Militia Pact', icon: 'council', tint: '#ff9f1c', feature: '2 more guns · Militia Carrier',
    desc: 'Every Kepler town gets two more militia turrets, and the Kepler Militia Carrier (an armoured hauler with a turret cannon) goes on sale at Kepler Civic Center.',
    say: ['Raiders hit our towns, and a settler is lucky to have one turret to her name.', 'I move the Militia Pact: two more guns on every Kepler town, and the Militia Carrier on sale.'],
    focus: ['kepler', 'spacecom'],
    stance: {},
  },
};
const COUNCIL = ['spacecom', 'vostok', 'daedalus', 'meridian', 'kepler'];
const VOTE_CD = 8 * 60 * 1000; // between votes (real time; the radio tower halves it)
const SAPLING_CD = 5 * 60 * 1000; // between farm saplings (real time, so reloads can't farm them: ws.town.sapNext)
// Militia: nothing besieges a town (pirates hunt YOU), so "attacked" = a hunter or raider within ALERT_R of the hall for
// ALERT_HOLD seconds (barracks guns reach 400 m). The two rovers stay out at most MILITIA_STAY s, or until quiet for
// MILITIA_CLEAR s; recall after MILITIA_CD (real time from the call: ws.town.defNext).
const ALERT_R = 300, ALERT_HOLD = 1.5, MILITIA_STAY = 120, MILITIA_CLEAR = 12;
const MILITIA_CD = 10 * 60 * 1000;
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------------------------------------
// The town itself (built like any settlement: world.js 'hometown').
// ---------------------------------------------------------------------------------------------
const kits = new Map();
function bake(key, fn) {
  let r = kits.get(key);
  if (!r) { const k = new Kit(KEP, 11, false); fn(k); r = k.finish(); kits.set(key, r); }
  return r;
}

// Moon Council hall: domed round chamber behind a colonnade, council flags, terminal on the steps
function hallKit(k) {
  k.at();
  k.cyl(30, 31, 0.3, 48, T(0xd8d4e8), 0, 0, 0, { outline: 0.05 });
  k.ring(29.5, 0.2, T(KEP), 0, 0.32, 0);
  k.cyl(13, 13.6, 1.2, 24, T(CONC), 0, 0.3, 0, { outline: 0.08 });
  k.cyl(11.5, 11.5, 8, 24, T(CREAM), 0, 1.5, 0, { outline: 0.14 });
  for (let i = 0; i < 12; i++) k.box(1.6, 2.2, 0.15, G(WARM), Math.sin((i / 12) * Math.PI * 2) * 11.6, 4, Math.cos((i / 12) * Math.PI * 2) * 11.6, { ry: (i / 12) * Math.PI * 2, outline: 0 });
  k.cyl(12.2, 12.2, 0.8, 24, T(KEP), 0, 9.5, 0, { outline: 0.05 });
  k.add(new THREE.SphereGeometry(10.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS(0x9bffb0, 0.4), 0, 10.3, 0, { outline: 0 });
  for (let i = 0; i < 8; i++) k.add(new THREE.TorusGeometry(10.55, 0.14, 4, 24, Math.PI).rotateY((i / 8) * Math.PI), T(LT), 0, 10.3, 0, { outline: 0 });
  k.cyl(0.25, 0.3, 5, 6, T(DK), 0, 20.8, 0, { outline: 0.03 });
  k.ball(0.6, G(GRN), 0, 26, 0, { outline: 0 });
  // colonnade and steps facing the entrance (+z)
  k.box(16, 0.5, 6, T(CONC), 0, 0.3, 14, { outline: 0.05 });
  for (let i = 0; i < 3; i++) k.box(16, 0.35, 1, T(LT), 0, 0, 17.5 + i, { outline: 0.02 });
  for (let i = 0; i < 6; i++) k.cyl(0.45, 0.55, 7, 12, T(0xfffaf0), -6.25 + i * 2.5, 0.8, 15.5, { outline: 0.04 });
  k.box(17, 1.2, 4, T(CREAM), 0, 7.8, 14.6, { outline: 0.08 });
  k.box(17.2, 0.3, 4.2, T(KEP), 0, 9, 14.6, { outline: 0.03 });
  k.text('MOON COUNCIL', 0, 8.4, 16.62, 0, 10, { fg: '#ff9f1c', bg: '#241a3a', back: false, off: 0.02 });
  k.box(4, 5, 0.3, T(0x8a5a3a), 0, 0.8, 11.6, { outline: 0.03 });
  // terminal on the steps
  k.box(1.4, 1.6, 0.8, T(DK), 4, 0.8, 19.5, { outline: 0.04 });
  k.box(1.1, 0.7, 0.06, G(GRN), 4, 1.7, 19.92, { outline: 0 });
  // council flags, one per member faction
  const fl = [0xffd23f, 0xff3b5c, 0x2ec4ff, 0xff9f1c, 0xc77dff];
  for (let i = 0; i < 5; i++) k.flag(-14 + i * 7, 24, 12, fl[i]);
  // plaza paths to the plots and entrance
  for (let i = 0; i < SLOTS; i++) { const p = slotAt(i); k.strip([p.x * 0.45, p.z * 0.45], [p.x * 0.82, p.z * 0.82], 3, 0.05, T(0x6b6880), 0.3); }
  k.strip([0, 30], [0, 118], 4, 0.05, T(0x6b6880), 0.3);
  k.solid(11.5, 5, 11.5, 0, 0);
  k.solid(8, 4, 2.5, 0, 14.6, 0, 0.8);
}
export const TERMINAL = { x: 4, z: 20.4 };

// glowing use-ring in the building's tile colour (kit frame: call after k.at())
const spotRing = (k, type) => k.raidAt(SPOTS[type].x, SPOTS[type].z, parseInt(BUILDINGS[type].tint.slice(1), 16));

// one plot's building, origin at the plot centre, facing the hall (local -z → +z; the door looks
// back at the plaza)
function buildingKit(type) {
  return (k) => {
    k.at();
    k.cyl(13, 13.5, 0.3, 32, T(0xb8b4c8), 0, 0, 0, { outline: 0.04 });
    switch (type) {
      case 'housing':
        habDome(k, -5, -2, 6.5, 0x9be7ff, { door: Math.PI, trim: KEP });
        habDome(k, 6, -1, 5.5, 0xffd23f, { door: Math.PI, trim: GRN });
        habDome(k, 0, 7, 5, 0xff7ad9, { door: Math.PI, trim: KEP });
        break;
      case 'market':
        warehouse(k, 0, 2, 16, 11, 6, 0xd8d4e8, 0, KEP);
        k.at();
        for (let i = 0; i < 3; i++) {
          const x = -6 + i * 6;
          for (const sx of [-1, 1]) k.cyl(0.1, 0.1, 3, 6, T(DK), x + sx * 2, 0.3, -7, { outline: 0.02 });
          for (let j = 0; j < 4; j++) k.box(1.0, 0.12, 3.6, T(j % 2 ? CREAM : [0xff2e88, 0x2ec4ff, GRN][i]), x - 1.5 + j * 1.0, 3.3, -7.2, { rz: 0.1, outline: 0.02 });
          crate(k, x, 0.3, -7.5, 0.8, [0xff9f1c, 0x7dff6a, 0x2ec4ff][i], i);
        }
        break;
      case 'clinic':
        cabin(k, 0, 0, 12, 9, 5, 0xffffff, 0, { trim: 0xff2a4a });
        k.at();
        k.box(3, 0.8, 0.14, T(0xff2a4a), 0, 3.4, -4.62, { outline: 0 });
        k.box(0.8, 3, 0.14, T(0xff2a4a), 0, 2.3, -4.63, { outline: 0 });
        k.cyl(4, 4, 0.1, 24, T(0x5b5870), 7, 0.3, 6, { outline: 0.02 });
        k.ring(3.6, 0.12, G(0xff2a4a), 7, 0.42, 6);
        k.ball(0.4, G(0xff2a4a), 0, 6.2, 0, { outline: 0 });
        spotRing(k, 'clinic');
        break;
      case 'farm':
        for (const x of [-4.5, 4.5]) {
          k.add(new THREE.CylinderGeometry(3.6, 3.6, 16, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), GLASS(0x9bffb0, 0.32), x, 0.3, 0, { outline: 0 });
          for (let t = -7; t <= 7; t += 3.5) k.add(new THREE.TorusGeometry(3.62, 0.07, 4, 16, Math.PI), T(LT), x, 0.3, t, { outline: 0 });
          for (let r = -1; r <= 1; r++) k.box(1.2, 0.4, 14, T(0x6b4a2a), x + r * 1.6, 0.3, 0, { outline: 0.02 });
          k.hcyl(3.6, 16, x, 0, 0, 0.3);
          for (let r = -1; r <= 1; r++) for (let j = 0; j < 6; j++) k.add(new THREE.SphereGeometry(0.4, 6, 4), T(0x3f9a3a), x + r * 1.6, 1.0, -6 + j * 2.4, { outline: 0.02 });
        }
        // nursery bench in front of the domes (toward the hall) for saplings (HomeTown.farmUse). Pots empty here: addBuilding
        // adds the grown saplings, shown while one is ready
        k.at(0, 10.2);
        k.box(5.2, 0.12, 1.5, T(0x8a5a3a), 0, 1.0, 0, { outline: 0.03 });
        k.box(5.0, 0.1, 1.3, T(0x8a5a3a), 0, 0.45, 0, { outline: 0.02 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.box(0.12, 1.0, 0.12, T(0x5a3a22), sx * 2.4, 0, sz * 0.6, { outline: 0 }); k.box(0.12, 2.9, 0.12, T(DK), sx * 2.5, 0, sz * 0.7, { outline: 0.02 }); }
        for (let i = 0; i < 6; i++) k.cyl(0.24, 0.17, 0.38, 8, T(0xc0603a), -2 + i * 0.8, 1.12, 0, { outline: 0.02 });
        k.box(5.4, 0.08, 1.8, T(KEP), 0, 2.9, 0, { rx: 0.1, outline: 0.03 });
        k.text('SAPLINGS', 0, 2.45, 0.85, 0, 2.6, { fg: '#7dff6a', back: false });
        k.solid(2.7, 0.7, 0.8, 0, 0);
        k.at();
        spotRing(k, 'farm');
        break;
      case 'motorpool':
        quonset(k, -3, 0, 5, 13, 0xd8d4e8, 0, KEP);
        k.at();
        k.box(8, 0.12, 6, T(0x5b5870), 7, 0.3, -2, { outline: 0 });
        for (let i = 0; i < 3; i++) crate(k, 9, 0.3 + i * 0.9, 4, 0.9, 0x55607a, i);
        k.solid(2.2, 1.2, 2.6, 7, -2, 0.4, 0.3); // (Mule parked on its apron)
        spotRing(k, 'motorpool'); // (at the quonset door)
        break;
      case 'barracks':
        quonset(k, 0, 3, 4.5, 12, 0x6b6f78, 0, KEP);
        k.at();
        sandbags(k, 0, -6, 6, -1.4, 1.4, 2);
        k.flag(-8, -6, 12, KEP);
        break;
      case 'roads': // road crew depot: blacktop with lane dashes, bitumen silo, road roller, cones, front barrier
        k.box(18, 0.12, 11, T(0x2f2d3d), 0, 0.3, -0.5, { outline: 0 });
        for (let i = -2; i <= 2; i++) k.box(0.4, 0.05, 2.2, T(CREAM), i * 3.2, 0.42, 3.6, { outline: 0 });
        k.cyl(2.4, 2.4, 7.5, 14, T(LT), 6.5, 2.0, -4, { outline: 0.08 });
        k.add(new THREE.ConeGeometry(2.4, 1.8, 14), T(CONC), 6.5, 10.4, -4, { outline: 0.05 });
        for (const [sx, sz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) k.cyl(0.18, 0.22, 2.0, 6, T(DK), 6.5 + sx, 0.3, -4 + sz, { outline: 0.03 });
        k.cyl(0.4, 0.4, 3.2, 8, T(KEP), 6.5, 0.3, -1.2, { outline: 0.04 }); // (silo spout)
        k.column(2.5, 11, 6.5, -4);
        k.box(3.2, 1.3, 5.2, T(0xffd23f), -5.2, 1.5, -3.4, { outline: 0.06 }); // (road roller)
        k.box(2.6, 1.9, 2.0, T(0x2ec4ff), -5.2, 2.8, -4.2, { outline: 0.05 });
        for (const dz of [-1.4, -5.4]) k.add(new THREE.CylinderGeometry(1.2, 1.2, 3.0, 14).rotateZ(Math.PI / 2), T(0x7a7790), -5.2, 1.5, dz, { outline: 0.05 });
        k.solid(1.7, 1.6, 3.0, -5.2, -3.4, 0, 0.3);
        for (let i = 0; i < 7; i++) k.add(new THREE.ConeGeometry(0.34, 0.95, 6), T(0xff7a1a), -9 + i * 3, 0.8, 7.2, { outline: 0.03 });
        k.box(5, 0.5, 0.18, T(CREAM), 3.5, 0.9, 7.2, { outline: 0.02 });
        k.box(5, 0.16, 0.2, T(0xff3b5c), 3.5, 1.15, 7.2, { outline: 0 });
        k.solid(2.5, 0.5, 0.3, 3.5, 7.2, 0, 0);
        k.sign('ROAD CREW', 0, -9, { ry: 0, w: 7, y: 3.6 });
        k.lamp(-8.5, 4.8, 6);
        break;
      case 'radio':
        k.box(5, 0.5, 5, T(CONC), 0, 0.3, 0, { outline: 0.03 });
        lattice(k, 0, 0, 30, 2.2, 0.5, 8, T(LT), T(DK), { r: 0.2 });
        k.at();
        k.add(new THREE.SphereGeometry(2, 14, 6, 0, Math.PI * 2, 0, 0.8).rotateX(-1.2), T(CREAM), 0.8, 20, 0.5, { outline: 0.05 });
        k.ball(0.6, G(0xff2a4a), 0, 30.6, 0, { outline: 0 });
        cabin(k, 6, 5, 5, 4, 3, 0xd8d4e8, 0, { trim: KEP });
        k.at();
        spotRing(k, 'radio');
        break;
      case 'pad':
        padKit(k, PAD_PLAN, KEP);
        for (const c of padCols(PAD_PLAN)) k.cols.push(c);
        break;
      default: break;
    }
  };
}

// Built by the world at load (addBuilding adds each building as you buy it).
export function buildHomeTown(world, loc) {
  const hall = bake('hall', hallKit);
  const root = hall.root.clone();
  world.put(root, loc, 0, 0, 0, 0, true);
  for (const c of hall.cols) world.col(loc, c);
  const flags = [];
  root.traverse((o) => { if (o.userData.flag) flags.push(o); });
  if (flags.length) world.anims.push({ loc, list: flags, seed: 5 });
  // reserved ground, built on or not: traffic pads and stops, road crews and defence pylons keep off the hall's disc and
  // every plot's (plot disc 13.5 m; 14.5 keeps the apron edge clear)
  (loc.keep ||= []).push({ x: 0, z: 0, r: 34 });
  for (let i = 0; i < SLOTS; i++) { const p = slotAt(i); loc.keep.push({ x: p.x, z: p.z, r: 14.5 }); }
  (loc.slots || []).forEach((type, i) => { if (type) addBuilding(world, loc, i, type); });
  for (let i = 0; i < SLOTS; i++) if (!(loc.slots || [])[i]) addPlot(world, loc, i);
  // a town rebuilt in place (Council motion) lost what traffic hung on its old group: restore the shuttle pad's shelter
  // (at load and founding there is no traffic yet, or no stop here)
  if (world.traffic) world.traffic.redress(loc);
}

function addPlot(world, loc, i) {
  const p = slotAt(i);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.18, 4, 32).rotateX(Math.PI / 2), G(KEP));
  ring.name = `plot${i}`;
  world.put(ring, loc, p.x, p.z, 0.4, 0, false);
}

export function addBuilding(world, loc, i, type) {
  const p = slotAt(i);
  const plot = loc.group.getObjectByName(`plot${i}`);
  if (plot) plot.removeFromParent();
  const b = bake(`b|${type}`, buildingKit(type));
  const root = b.root.clone();
  world.put(root, loc, p.x, p.z, 0, p.face, false);
  // colliders: the kit's, turned to the plot's facing
  const c = Math.cos(p.face), s = Math.sin(p.face);
  for (const col of b.cols) {
    const { x, z } = plotPoint(i, col.x, col.z);
    world.col(loc, { ...col, x, z, yaw: (col.yaw || 0) + p.face });
  }
  // grown saplings in the bench pots: a named group (the merge skips it) that HomeTown.syncFarm shows while one is ready
  if (type === 'farm') {
    const bench = plotPoint(i, 0, 10.2), sprouts = new THREE.Group();
    sprouts.name = 'sprouts';
    for (let j = 0; j < 6; j++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.22 + (j % 3) * 0.04, 0.6, 5), T(j % 2 ? 0x7dff6a : 0x5fbf4a));
      m.position.set(-2 + j * 0.8, 1.8, 0);
      sprouts.add(m);
    }
    world.put(sprouts, loc, bench.x, bench.z, 0, p.face, false);
  }
  // the shuttle pad is a real traffic pad, never dropped. One record per pad plot however often built (a rebuilt town keeps
  // its records: world.rebuildLocation)
  if (type === 'pad' && !(loc.pads || []).some((q) => q.plot === i)) (loc.pads ||= []).push({ x: p.x, z: p.z, r: PAD_R, spare: false, mesh: null, plot: i, top: PAD_PLAN.top, stairs: padStairs(p.x, p.z, p.face, PAD_PLAN) });
  // barracks guns and motor pool Mule are proper models
  if (type === 'barracks') for (const sx of [-1, 1]) {
    const t = makeTurret({ color: KEP });
    world.put(t.root, loc, p.x + (sx * 6 * c), p.z - (sx * 6 * s), 0.3, p.face, false);
  }
  if (type === 'motorpool') {
    const m = makeRover({ color: 0x7dff6a, trim: KEP, pirate: false, flag: KEP, style: 'civil' });
    world.put(m.root, loc, p.x + 7 * c - 2 * s, p.z - 7 * s - 2 * c, 0.3, p.face + 0.4, false);
  }
}

// ---------------------------------------------------------------------------------------------
// What the hall's page shows per building, and where F does something in town. Building features add
// lines here (EXTRAS, LIVE, ON_BUILT, POINTS), not in the page code.
// ---------------------------------------------------------------------------------------------
// extra buttons on a built building's detail screen (numbered with the rest): type -> (t) => [{ id, label, short, tone, fn }]
const EXTRAS = {
  // the picker is its own screen: leave the page first; the choice returns as its message (back(msg, tone, tile))
  clinic: (t) => [{ id: 'respawn', label: 'SET RESPAWN POINT...', short: 'SET RESPAWN...', tone: 'go', fn: () => { t.leave(); t.game.respawnPt.menu((msg, tone) => t.back(msg, tone, 'clinic')); return { takeover: true }; } }],
  // (the map closes to the world, not the page: the sweep runs while you play)
  radio: (t) => [{ id: 'radio', label: 'OPEN THE WORLD MAP...', short: 'WORLD MAP...', tone: 'go', fn: () => t.openRadio() }],
  motorpool: (t) => t.powered() ? [{ id: 'garage', label: 'VEHICLES...', short: 'VEHICLES...', tone: 'go', fn: () => { t.leave(); t.garageMenu(() => t.back()); return { takeover: true }; } }] : [],
};
// live rows under a built building's text: type -> (t) => { rows: [[label, value, tone?]], meter?, note? }
const pays = (k) => () => ({ rows: [['INCOME', `₵${BUILDINGS[k].income} a minute`], ['BANK HOLDS', `₵${BANK_CAP}`]], note: 'Nothing to press: it pays into the town bank.' });
const LIVE = {
  housing: pays('housing'),
  market: pays('market'),
  // (a choice that won't take you in is shown here: no room for the plan's note beside the button)
  clinic: (t) => {
    const g = t.game, R = g.respawnPt, plan = R.plan(g.player.pos.clone().normalize()), l = R.id && g.locations.find((x) => x.id === R.id);
    const rows = [['REDEPLOY AT', plan.name, plan.kind === 'hq' ? 'gold' : '']];
    if (R.id && plan.kind !== 'hq') rows.push(['YOUR CHOICE', `${l ? l.name : 'Gone'} (${(l ? R.why(l) : 'GONE').toLowerCase()})`, 'bad']);
    else if (plan.note) rows.push(['ARRIVE AT', 'The gate: no clearance inside', 'gold']);
    return { rows };
  },
  farm: (t) => {
    const wait = t.saplingWait();
    return {
      rows: [['EFFECT', 'Heals 4 hull a second in town'], ['INCOME', `₵${BUILDINGS.farm.income} a minute`], ['SAPLING', wait > 0 ? mmss(wait) : 'READY', wait > 0 ? 'dim' : 'gold']],
      meter: { v: 1 - wait / SAPLING_CD, text: wait > 0 ? `REGROWING · ${mmss(wait)}` : 'READY AT THE NURSERY BENCH' },
      note: 'The healing and the income work by themselves. The nursery bench in front of the domes gives a sapling for your jar (F), free of reputation cost.',
    };
  },
  motorpool: (t) => {
    const on = t.powered(), mw = t.militiaWait();
    return {
      rows: [['STATUS', on ? 'READY' : 'NO POWER', on ? '' : 'bad'], ['MILITIA', mw > 0 ? `back in ${Math.ceil(mw / 60000)} min` : 'READY', mw > 0 ? 'dim' : 'gold'],
        ['VEHICLES', `${t.game.garage.owned().length} IN THE BAYS`], ['REPAIRS', 'Vehicles patched up in town']],
      note: on ? 'Roll a vehicle out with the button below, or at the door (F). V still calls your last one from anywhere. Two militia rovers roll out when raiders reach the town.'
        : 'The motor pool has no power: its door and its militia are shut down.',
    };
  },
  barracks: () => ({ rows: [['GUNS', '2 militia guns'], ['RANGE', '400 m round town'], ['FIRE', '28 dmg + splash, every 0.8 s'], ['TARGETS', 'Pirates']], note: 'Nothing to press: the guns fire by themselves.' }),
  roads: (t) => {
    const tr = t.game.world.traffic, ring = tr.rings.get(t.loc), n = tr.roads.filter((r) => r.A === t.loc || r.B === t.loc).length;
    return ring ? { rows: [['RING', `${Math.round(ring.Rb)} m round the town`], ['LINKS', `${n} ${n === 1 ? 'settlement' : 'settlements'}`]], note: 'Nothing to press: the traffic uses them.' }
      : { rows: [['RING', 'Not laid yet']], note: 'The road crews finish the ring road and the links when the game next loads.' };
  },
  radio: (t) => {
    const R = t.radio, s = R.s, pct = Math.round(R.frac * 100);
    const status = !s ? ['IDLE', 'dim'] : s.on ? [`SWEEPING ${pct}%`, 'gold'] : s.r >= SWEEP.max ? ['MAX RANGE', ''] : [`STOPPED ${pct}%`, 'dim'];
    return { rows: [['SWEEP', ...status], ['MAP CHARTED', '3 km round town'], ['VOTES', 'Council sits twice as often']], meter: s ? { v: R.frac, text: `${Math.round(s.r)} / ${SWEEP.max} m` } : null };
  },
  pad: (t) => {
    const v = t.shuttle(), home = ['HOME BASE', 'You start, recall and redeploy here'];
    return v ? { rows: [home, ['SHUTTLE TO', v.stops[1].loc.name], ['FLIGHT', `${(v.path.len / 1000).toFixed(1)} km`]], note: 'Nothing to press: the shuttle runs by itself. Hop in with F while it is parked on the pad.' }
      : { rows: [home, ['SHUTTLE TO', 'No settlement in reach']], note: 'Nothing to press.' };
  },
};
// what a building does on completion: type -> (t) => a line for the page's "BUILT" message
const ON_BUILT = {
  motorpool: (t) => {
    const S = t.game.story;
    if (S.vehicles.includes('mule')) return '';
    S.vehicles.push('mule');
    S.save();
    return 'HOMESTEAD MULE UNLOCKED (V)';
  },
  radio: (t) => { t.chart(); return 'MAP CHARTED 3 KM ROUND TOWN'; },
  farm: (t) => { t.syncFarm(); return ''; }, // (first sapling ready: show it on the bench)
  pad: (t) => t.linkShuttle(),
  roads: (t) => t.layRoads(),
};
// where F does something in town, first match wins (interact()): at(t) world position (null: absent), r reach in metres,
// use(t, player) the prompt and action (null: nothing here)
const POINTS = [
  { id: 'hall', at: (t) => t.terminal, r: 4.5, use: (t) => ({ prompt: '<b>F</b> — MOON COUNCIL HALL', act: () => t.menu() }) },
  { id: 'radio', at: (t) => t.spot('radio'), r: 5, use: (t) => ({ prompt: '<b>F</b> — RADIO TOWER: WORLD MAP', act: () => t.openRadio() }) },
  // (no page behind the picker here: the choice is a toast)
  { id: 'clinic', at: (t) => t.spot('clinic'), r: 5, use: (t) => ({ prompt: '<b>F</b> — CLINIC: SET YOUR RESPAWN POINT', act: () => t.game.respawnPt.menu((msg) => { if (msg) t.game.hud.toast(msg, 3); }) }) },
  { id: 'farm', at: (t) => t.spot('farm'), r: 4.5, use: (t) => t.farmUse() },
  // (in a vehicle or ragdolled: F stays the job board's)
  { id: 'garage', at: (t) => t.spot('motorpool'), r: 5, use: (t, P) => P.vehicle || P.rag ? null : t.powered() ? { prompt: '<b>F</b> — MOTOR POOL: YOUR VEHICLES', act: () => t.garageMenu() } : { prompt: 'MOTOR POOL — NO POWER' } },
];

// ---------------------------------------------------------------------------------------------
// Running the town: income, healing, guns, hall page, council votes.
// ---------------------------------------------------------------------------------------------
export class HomeTown {
  constructor(game) {
    this.game = game;
    this.loc = game.locations.find((l) => l.id === 'hometown') || null;
    this.fireCd = 0;
    this.saveT = 0;
    this.spots = {}; // building type -> use spot (world position; see spot())
    this.sprouts = null; // nursery bench's grown saplings (syncFarm)
    this.def = { rovers: [], hold: 0, scanT: 0, until: 0, seen: 0 }; // militia call-out (callMilitia): rovers, seconds of raiders at the gates, 4 Hz scan clock, end time, raiders last seen
    this.skin = 'hall'; // page host: 'hall' (terminal dialog) or 'board' (job board tab)
    this.ui = null; // page as last drawn: { sel, acts }
    this.view = null; // board tab's next paint: { sel, msg, tone }
    this.quietUntil = 0; // (performance.now) after a press answered in place, ignore a double-click's second half
    this.radio = new RadioSweep(this); // Radio Tower world-map sweep (radio.js)
    if (this.state) this.ws.council ||= { passed: [], next: 0 }; // (saves predating the council have none)
    if (this.loc) {
      this.terminal = game.world.toWorld(this.loc, TERMINAL.x, 0, TERMINAL.z);
      if (this.has('radio')) { this.chart(); this.radio.restore(); }
    }
  }

  get ws() { return this.game.ws; }
  get state() { return this.ws.town; }
  has(type) { return !!this.state && this.state.slots.includes(type); }
  slotWorld(type) { const i = this.state.slots.indexOf(type); if (i < 0) return null; const p = slotAt(i); return this.game.world.toWorld(this.loc, p.x * 0.75, 0, p.z * 0.75); }

  // the tower charts 3 km round the town and the places in it
  chart() {
    const G = this.game.globe;
    if (G && G.cells) G.revealAround(this.loc.dir, 3000);
  }

  // the tower's world map for sweeping the Moon: its own screen (leave() first); closing returns to the world
  openRadio() {
    if (!this.has('radio')) return { msg: 'BUILD A RADIO TOWER FIRST', tone: 'bad' };
    this.leave();
    this.game.openMap({ radio: true });
    return { takeover: true };
  }

  // building plot-frame point (x across, z toward the hall) in world space; null until built
  pt(type, x, z) {
    const i = this.state.slots.indexOf(type);
    if (i < 0) return null;
    const q = plotPoint(i, x, z);
    return this.game.world.toWorld(this.loc, q.x, 0, q.z);
  }

  // a building's use spot (cached: buildings never move)
  spot(type) { return this.spots[type] || (SPOTS[type] && this.has(type) ? (this.spots[type] = this.pt(type, SPOTS[type].x, SPOTS[type].z)) : null); }

  // after a build: drop traffic and game caches of the town's buildings (passenger doors, home spot)
  afterBuild() {
    delete this.loc._bld;
    for (const s of this.game.world.traffic.stops) if (s.loc === this.loc) delete s.doors;
    this.game._homes = {};
  }

  // the town's shuttle (traffic.js addTownShuttle), or null without a Shuttle Pad or a destination
  shuttle() { return this.game.world.traffic.vehicles.find((v) => v.stops && v.stops[0].loc === this.loc) || null; }

  // the Shuttle Pad opens a line to the nearest settlement; the first shuttle starts at the far end. (On load a built pad's
  // line starts in traffic.js buildFlights.) Returns the page's line, or '' with nowhere to fly
  linkShuttle() {
    const tr = this.game.world.traffic;
    tr.registerLocation(this.loc);
    const v = tr.addTownShuttle(this.loc, { startAtB: true });
    return v ? `SHUTTLE SERVICE TO ${v.stops[1].loc.name.toUpperCase()} OPENS: FIRST SHUTTLE ON ITS WAY` : '';
  }

  // Roads: lay the ring road and links now (traffic.js addTownRoads), as far as a running game can: traffic turns round where
  // a link meets a ring laid at load, until the next load lays the full network. Returns the page's line, or '' if the ring
  // existed. On failure the game goes on (plot built and paid; the next load lays the roads as for any town with Roads)
  layRoads() {
    const tr = this.game.world.traffic;
    try {
      const r = tr.addTownRoads(this.loc);
      if (!r) return '';
      const n = r.links.length;
      return n ? `ROAD CREWS FINISHED: RING ROAD + ${n} ${n === 1 ? 'LINK' : 'LINKS'}` : 'NO SETTLEMENT IN REACH: THE CREWS HAVE NOTHING TO LINK';
    } catch (e) {
      console.error(e);
      return 'ROAD CREWS WILL FINISH AFTER YOUR NEXT LOAD';
    }
  }

  // F in town: the first POINTS entry you stand at gives the prompt and action
  interact(P) {
    const g = this.game;
    if (!this.loc || !this.loc.active) return false;
    for (const pt of POINTS) {
      const at = pt.at(this);
      if (!at || P.pos.distanceTo(at) > pt.r) continue;
      const u = pt.use(this, P);
      if (!u) continue;
      g.hud.prompt(u.prompt);
      if (u.act && g.input.pressed('KeyF') && g.boardCooldown <= 0) u.act();
      return true;
    }
    return false;
  }

  // ---------- the farm: a sapling every 5 minutes ----------
  // Free (no reputation cost, unlike raiding a Farm Dome outpost, territory.js), on top of income. Needs jar room like outpost
  // saplings; a refusal doesn't start the clock. Real-time clock, saved with the town.
  saplingWait() {
    const st = this.state, now = Date.now();
    if (st.sapNext > now + SAPLING_CD) st.sapNext = now + SAPLING_CD; // (a clock set back must not lock the bench: cap the wait)
    return Math.max(0, (st.sapNext || 0) - now);
  }

  // nursery bench prompt and action: { prompt, act? }
  farmUse() {
    const A = this.game.alchemy, wait = this.saplingWait();
    if (wait > 0) return { prompt: `GREENHOUSE FARM — SAPLINGS REGROWING · ${mmss(wait)}` };
    if (!A.owned) return { prompt: 'GREENHOUSE FARM — SAPLINGS · YOU NEED A CONTAINMENT JAR (DR. ZBORNAK)' };
    if (A.used >= A.slots) return { prompt: 'GREENHOUSE FARM — SAPLINGS · YOUR JAR IS FULL' };
    return { prompt: '<b>F</b> — TAKE A SAPLING <span style="color:#7dff6a">(NO REPUTATION COST)</span>', act: () => this.takeSapling() };
  }

  takeSapling() {
    const g = this.game;
    g.alchemy.add('sapling', SAP_NAMES[Math.floor(Math.random() * SAP_NAMES.length)]); // (plays the jar's pickup chime)
    g.fx.pop('SAPLING!', null, { color: ITEMS.sapling.color, size: 46, life: 2.4 });
    this.state.sapNext = Date.now() + SAPLING_CD;
    saveWorldState(this.ws);
    g.boardCooldown = 0.4;
    this.syncFarm();
  }

  // bench saplings show while one is ready
  syncFarm() {
    if (!this.has('farm')) return;
    let s = this.sprouts;
    if (!s || s.parent !== this.loc.group) s = this.sprouts = this.loc.group.getObjectByName('sprouts'); // (council motions rebuild the town's group)
    if (s) s.visible = this.saplingWait() <= 0;
  }

  // ---------- the motor pool: your vehicles, and the militia ----------
  // The single hook for the pending garage power source (building, upgrade or story flag): door, page button and militia
  // stop without it. (Gate V in Garage.toggle if needed: the physical garage is the always-on route, so deploy() calls
  // Garage.summon directly.)
  powered() { return true; }

  // owned vehicles, each rolled out on its number key. back: where CLOSE / Escape go when the opening page should return (the
  // hall page's takeover exit is back()); at the door it just closes
  garageMenu(back = null) {
    const g = this.game, G = g.garage, own = G.owned(), mw = this.militiaWait();
    const buttons = own.map((id, i) => {
      const cd = G.cooldown(id);
      return { label: `${i + 1} · ${VEHICLES[id].name.toUpperCase()} — ${cd > 0 ? `REBUILDING ${Math.ceil(cd)} s` : `HULL ${Math.ceil(G.hp[id] ?? G.maxHp(id))}/${G.maxHp(id)}`}`, fn: () => this.deploy(id) };
    });
    buttons.push({ label: `${own.length + 1} · CLOSE`, fn: back || undefined });
    g.dialog(`${this.state.name.toUpperCase()} · MOTOR POOL`,
      (own.length ? '<small>Pick a vehicle to roll out of the bay. (V calls the last one you used from anywhere.)</small>' : 'The bays are empty. Vehicles come from the faction leaders as you rise in their story.')
      + `<br><br><small>Militia rovers on call: <b>${mw > 0 ? `back in ${Math.ceil(mw / 60000)} min` : 'READY'}</b></small>`, buttons);
  }

  // roll a vehicle out of the bay, nose to the plaza, and climb in. Skips Garage.canSummon on purpose (grounded, slow): you
  // walk to the garage, and the vehicle appears in its bay, not beside you
  deploy(id) {
    const g = this.game, G = g.garage, P = g.player;
    if (P.vehicle || P.rag || P.dead || !this.has('motorpool') || !this.powered() || !VEHICLES[id]) return;
    if (G.cooldown(id) > 0) { g.hud.toast(`${VEHICLES[id].name} is being rebuilt: ready in ${Math.ceil(G.cooldown(id))} s.`, 2.5); return; }
    const at = this.pt('motorpool', BAY.x, BAY.z);
    G.choice = id;
    G.summon(id, at, this.pt('motorpool', BAY.x, BAY.z + 30).sub(at));
    G.enter();
  }

  // Raiders at the gates: hunters, raiders or chapter troops (not den guards, nor friendly pirates) within ALERT_R of the hall.
  // Nothing besieges the town by itself: pirates come for YOU, and this is when they bring it to the gates.
  raiders() {
    const g = this.game, hall = this.loc.pos, out = [];
    for (const e of g.enemies.list) {
      if (e.dead || e.faction !== 'pirate' || e.kind === 'core' || e.home || !e.center || g.enemies.friendly(e)) continue;
      if (e.center.distanceTo(hall) < ALERT_R) out.push(e);
    }
    return out;
  }

  militiaWait() {
    const st = this.state, now = Date.now();
    if (st.defNext > now + MILITIA_CD) st.defNext = now + MILITIA_CD; // (a clock set back must not lock the militia: cap the wait, saved value too)
    return Math.max(0, (st.defNext || 0) - now);
  }

  // Two Kepler militia rovers (enemies.spawnAlly, chapter backup in Kepler colours; no friendly fire either way) roll out,
  // hunt what is at the gates and stand down when quiet. The cooldown starts at the call, not the stand-down
  callMilitia() {
    const g = this.game, st = this.state;
    st.defNext = Date.now() + MILITIA_CD;
    saveWorldState(this.ws);
    const anchor = this.pt('motorpool', BAY.x, BAY.z + 12); // (regroup point between targets, plaza side of the bay)
    for (let i = 0; i < 2; i++) {
      const e = g.enemies.spawnAlly('rover', this.pt('motorpool', BAY.x + (i ? 3.4 : -3.4), BAY.z - 2), 'kepler', anchor);
      e.keep = true; // (enemies.removeAllies at a chapter's end leaves these)
      this.def.rovers.push(e);
    }
    this.def.until = g.time + MILITIA_STAY;
    this.def.seen = g.time;
    g.hud.alert(`${st.name.toUpperCase()} UNDER ATTACK — MILITIA ROLLING OUT!`, '#ff9f1c', 3);
    g.audio.alarm();
  }

  standDown() {
    const g = this.game;
    for (const e of this.def.rovers) if (!e.dead) { e.dead = true; e.model.root.removeFromParent(); g.fx.pop('MILITIA STANDING DOWN', e.center.clone().addScaledVector(e.body.up, 4), { color: '#ff9f1c', size: 36, life: 1.6 }); }
    this.def.rovers = []; // (the enemies list drops dead entries itself)
  }

  // 4 Hz: call the militia once raiders have held the gates a moment; send it home when quiet, out of time, or unpowered
  updateMilitia(dt) {
    const g = this.game, D = this.def;
    D.scanT -= dt;
    if (D.scanT > 0) return;
    D.scanT = 0.25;
    if (!this.has('motorpool') || !this.powered()) { if (D.rovers.length) this.standDown(); return; }
    const hot = this.raiders().length > 0;
    if (D.rovers.length) {
      D.rovers = D.rovers.filter((e) => !e.dead);
      if (hot) D.seen = g.time;
      if (!D.rovers.length || g.time > D.until || g.time - D.seen > MILITIA_CLEAR) this.standDown();
      return;
    }
    D.hold = hot ? D.hold + 0.25 : 0; // (the first sighting starts the count: ALERT_HOLD is passed on the seventh scan)
    if (D.hold > ALERT_HOLD && this.militiaWait() <= 0 && !g.player.dead) { D.hold = 0; this.callMilitia(); }
  }

  // ---------- the hall's page ----------
  // One view-model, two skins: the hall-steps terminal (menu(): a dialog) and the job board's COUNCIL HALL tab (boardPane()).
  // Both draw page() and run acts through run(), so they can't drift apart. Tiles: the town bank, each building, each motion
  // on the table (ids 'bank', BUILDINGS keys, 'm:<motion>'); each detail screen carries acts { id, tile, label, short, tone, fn }.
  // fn returns a Result or nothing:
  //   { msg?, tone?: 'ok' | 'bad', sel?, close?, takeover? }  (the page shows msg and selects sel; takeover: the act opened its own
  //   screen after leave(), and that screen's exit calls back())
  // Number keys run the first nine acts in tile order; the rest are for mouse, arrows + Enter, and pad.
  rate() {
    let r = 0;
    for (const k of this.state.slots) if (k && BUILDINGS[k] && BUILDINGS[k].income) r += BUILDINGS[k].income;
    return r;
  }

  income() {
    const parts = Object.entries(BUILDINGS).filter(([k, b]) => b.income && this.has(k)).map(([k, b]) => [b.name.toUpperCase(), b.income]);
    return { parts, rate: this.rate() };
  }

  bankDef() {
    const st = this.state, bank = Math.floor(st.bank || 0), inc = this.income(), left = BANK_CAP - (st.bank || 0);
    return {
      id: 'bank',
      tile: { name: 'Town Bank', icon: 'bank', tint: '#ffd23f', state: bank >= 1 ? 'built' : 'open', feature: inc.rate ? `+₵${inc.rate} a minute` : 'No income yet', chip: `₵${bank}`, chipTone: '' },
      stateText: bank >= 1 ? 'READY TO COLLECT' : 'EMPTY',
      desc: 'What your town earns while you are away. Housing, the market and the farm pay into it: collect it here.',
      rows: [['INCOME', `₵${inc.rate} a minute`, inc.rate ? '' : 'dim'], ...inc.parts.map(([n, v]) => [n, `₵${v} a minute`]), ['HOLDS UP TO', `₵${BANK_CAP}`]],
      meter: { v: (st.bank || 0) / BANK_CAP, text: `₵${bank} / ₵${BANK_CAP}${inc.rate ? (left > 1 ? ` · FULL IN ${Math.ceil(left / (inc.rate / 60) / 60)} MIN` : ' · FULL') : ''}` },
      note: bank < 1 ? (inc.rate ? 'Nothing to collect yet.' : 'Build housing, a market or a farm to earn.') : '',
      acts: bank >= 1 ? [{ id: 'collect', label: `COLLECT THE TOWN BANK — ₵${bank}`, short: `COLLECT ₵${bank}`, tone: 'go', fn: () => this.collect() }] : [],
    };
  }

  buildingDef(type) {
    const g = this.game, st = this.state, B = BUILDINGS[type];
    const has = this.has(type), free = st.slots.includes(null), poor = g.credits < B.cost, cr = Math.floor(g.credits);
    const state = has ? 'built' : free ? 'open' : 'full';
    const d = has ? (LIVE[type] ? LIVE[type](this) : { rows: [] })
      : { rows: [['PRICE', `₵${B.cost}`, 'gold'], ['YOUR CREDITS', `₵${cr}`, poor ? 'bad' : ''], poor ? ['SHORT BY', `₵${Math.ceil(B.cost - g.credits)}`, 'bad'] : ['AFTER BUILDING', `₵${cr - B.cost}`]], note: free ? '' : 'Every plot is built on.' };
    const acts = has ? (EXTRAS[type] ? EXTRAS[type](this) : [])
      : free ? [{ id: 'build:' + type, label: `BUILD ${B.name.toUpperCase()} — ₵${B.cost}`, short: `BUILD ₵${B.cost}`, tone: 'build' + (poor ? ' short' : ''), fn: () => this.build(type) }] : [];
    return {
      id: type,
      tile: { name: B.name, icon: B.icon, tint: B.tint, state, feature: B.feature, chip: has ? 'BUILT' : free ? `₵${B.cost}` : 'NO PLOT', chipTone: state === 'open' && poor ? 'short' : '' },
      stateText: { built: 'BUILT', open: 'NOT BUILT', full: 'NO PLOT FREE' }[state],
      desc: B.desc, rows: d.rows, meter: d.meter, note: d.note, acts,
    };
  }

  // motions on the page: not hidden ones, unless passed
  motionKeys() {
    const c = this.ws.council;
    return Object.entries(MOTIONS).filter(([k, m]) => c.passed.includes(k) || !(m.hidden && m.hidden(this.ws))).map(([k]) => k);
  }

  motionDef(key) {
    const m = MOTIONS[key], c = this.ws.council, passed = c.passed.includes(key), cd = this.cooldown(), mem = this.members();
    const mins = Math.ceil(cd / 60000), state = passed ? 'built' : cd > 0 ? 'locked' : 'open';
    const rows = passed ? [['RESULT', 'CARRIED BY THE COUNCIL']] : mem.map((f) => {
      const p = this.chance(f, m);
      return [f === 'kepler' ? 'KEPLER (YOUR SEAT)' : FACTIONS[f].name.toUpperCase(), p >= 0.7 ? 'LIKELY YES' : p >= 0.4 ? 'LEANING' : 'UNLIKELY', p >= 0.7 ? '' : p >= 0.4 ? 'gold' : 'bad'];
    }).concat([['TO CARRY', `${Math.floor(mem.length / 2) + 1} OF ${mem.length}`]]);
    return {
      id: 'm:' + key,
      tile: { name: m.name, icon: m.icon, tint: m.tint, state, feature: m.feature, chip: passed ? 'PASSED' : cd > 0 ? `IN ${mins} MIN` : 'CALL VOTE', chipTone: '' },
      stateText: passed ? 'CARRIED' : cd > 0 ? 'NOT SITTING' : 'ON THE TABLE',
      desc: m.desc, rows, note: passed ? 'This motion has passed.' : cd > 0 ? `The next session sits in ${mins} min.` : '',
      acts: state === 'open' ? [{ id: 'vote:' + key, label: `CALL A VOTE: ${m.name.toUpperCase()}`, short: 'CALL A VOTE', tone: 'vote', fn: () => this.vote(key) }] : [],
    };
  }

  // page for tile sel (null or gone: the first tile with an act): { spec (terminalUI.js), acts, sel }; kept as this.ui
  page(sel = null, msg = '', msgTone = 'ok') {
    const g = this.game, st = this.state;
    const defs = [this.bankDef(), ...Object.keys(BUILDINGS).map((k) => this.buildingDef(k)), ...this.motionKeys().map((k) => this.motionDef(k))];
    const acts = [];
    for (const d of defs) for (const a of d.acts) { a.tile = d.id; acts.push(a); }
    const keyOf = (a) => { const i = acts.indexOf(a); return i >= 0 && i < 9 ? i + 1 : ''; };
    const tiles = defs.map((d) => ({ id: d.id, ...d.tile, key: d.acts[0] ? keyOf(d.acts[0]) : '' }));
    if (!defs.some((d) => d.id === sel)) sel = acts[0] ? acts[0].tile : defs[0].id;
    const c = defs.find((d) => d.id === sel);
    const detail = { id: c.id, name: c.tile.name, icon: c.tile.icon, tint: c.tile.tint, state: c.tile.state, stateText: c.stateText, desc: c.desc, rows: c.rows, meter: c.meter, note: c.note,
      actions: c.acts.map((a) => ({ id: a.id, label: a.short, key: keyOf(a), tone: a.tone })), msg, msgTone };
    const spec = {
      accent: '#ff9f1c', title: `${st.name.toUpperCase()} · COUNCIL HALL`, sub: 'MOON COUNCIL TERMINAL // KEPLER SETTLEMENTS', side: true, cols: 3,
      stats: [{ k: 'CREDITS', v: `₵${Math.floor(g.credits)}`, tone: 'gold' }, { k: 'PLOTS BUILT', v: `${st.slots.filter(Boolean).length} / ${SLOTS}` }, { k: 'TOWN BANK', v: `₵${Math.floor(st.bank || 0)} / ₵${BANK_CAP}` }],
      tiles, sel, detail,
    };
    this.ui = { sel, acts };
    return { spec, acts, sel };
  }

  // run an act and show its answer in place, unless it opened its own screen (or closed)
  run(a) {
    const r = a.fn() || {};
    if (r.takeover) return;
    if (r.close) { this.game.closeModal(false); return; }
    this.show(r.sel || a.tile, r.msg || '', r.tone || 'ok');
  }

  show(sel, msg = '', tone = 'ok') {
    this.quietUntil = msg ? performance.now() + 400 : 0;
    if (this.skin === 'board') { this.view = { sel, msg, tone }; this.game.refreshBoard(); } else this.menu(sel, msg, tone);
  }

  // an act with its own screen closes the page first (leave()); that screen's exit returns via back()
  leave() { const g = this.game; if (g.state === 'board' || g.state === 'dialog') g.closeModal(false); }
  // msg / tone: the left screen's message (shown once, under the buttons); sel: its tile (a digit key may have started it
  // from another tile)
  back(msg = '', tone = 'ok', sel = null) {
    sel = sel || (this.ui && this.ui.sel);
    this.quietUntil = msg ? performance.now() + 400 : 0; // (as show(): swallow a double-click's second half)
    if (this.skin === 'board') { this.view = { sel, msg, tone }; this.game.openBoard(this.loc, 'town'); } else this.menu(sel, msg, tone);
  }

  // the chamber's first draw (shaders, text textures) is a vote's slow part: warm it once while the page is read, only
  // while the council could sit, so the scene never hitches
  warm() {
    if (this._warm || this.cooldown() > 0) return;
    this._warm = true;
    this.game.chamber.prepare().catch(() => {});
  }

  // arrows / WASD and Enter on the page (both skins); false: not the page's key
  key(code) {
    const root = document.querySelector(this.skin === 'board' ? '#board .otm' : '#dialog .otm');
    if (!root || !this.ui) return false;
    const next = stepSel(root, this.ui.sel, code);
    if (next) { if (next !== this.ui.sel) { this.game.audio.click(); this.show(next); } return true; }
    if (code === 'Enter' || code === 'Space') {
      const a = this.ui.acts.find((x) => x.tile === this.ui.sel);
      if (a) this.run(a); else this.game.audio.click();
      return true;
    }
    return false;
  }

  // board tab keys: digits run the numbered acts
  boardKey(code) {
    const n = /^Digit([1-9])$/.exec(code);
    if (n) {
      const a = this.ui && this.ui.acts[+n[1] - 1];
      if (a && performance.now() >= this.quietUntil) this.run(a);
      return true;
    }
    return this.key(code);
  }

  // skin 1: the hall-steps terminal, a dialog like the outposts' (numbered buttons are the acts in order, CLOSE last, so
  // number keys and Escape need no handling of their own)
  menu(sel = null, msg = '', msgTone = 'ok') {
    const g = this.game;
    this.skin = 'hall';
    this.warm();
    const { spec, acts } = this.page(sel, msg, msgTone);
    spec.foot = { kb: `Click a tile · 1-${Math.min(9, acts.length) || 1} do it · Arrows pick · Enter acts · Esc closes`, pad: `${glyphHtml(['A'])} do what the highlighted tile offers · ${glyphHtml(['B'])} close` };
    spec.closeKey = acts.length < 9 ? acts.length + 1 : '';
    const buttons = acts.map((a, i) => ({ label: `${i + 1} · ${a.label}`, fn: () => this.run(a), keep: true })).concat([{ label: `${acts.length + 1} · CLOSE` }]);
    const settle = keepScroll('#dialog');
    g.dialog(spec.title, terminalPage(spec), buttons, { raw: true, cls: 'otm-dlg town', stay: true, quiet: msg ? 400 : 0, onKey: (code) => this.key(code) }); // (quiet: as at outpost terminals)
    settle();
    wireTerminal(document.querySelector('#dialog .otm'), { onSelect: (id) => { g.audio.click(); this.show(id); }, onAct: (id) => g.pickDialog(id === 'close' ? acts.length : acts.findIndex((x) => x.id === id)) });
  }

  // skin 2: the job board's COUNCIL HALL tab: { html, foot, wire } for hud.openBoard (which draws header and tab bar)
  boardPane() {
    const g = this.game;
    this.skin = 'board';
    this.warm();
    const v = this.view || {};
    this.view = { sel: v.sel, msg: '', tone: 'ok' }; // (an answer shows once)
    const { spec, acts } = this.page(v.sel || (this.ui && this.ui.sel), v.msg || '', v.tone || 'ok');
    spec.bare = true;
    return {
      html: terminalPage(spec),
      foot: { kb: `Click a tile · 1-${Math.min(9, acts.length) || 1} do it · Arrows pick · Enter acts · Q / E or Tab: other tab · F / Esc log off`, pad: `${glyphHtml(['A'])} do it · ${glyphHtml(['LB'])} ${glyphHtml(['RB'])} other tab · ${glyphHtml(['B'])} log off` },
      wire: (root) => wireTerminal(root, {
        onSelect: (id) => { g.audio.click(); this.show(id); },
        onAct: (id) => { if (performance.now() < this.quietUntil) return; const a = this.ui.acts.find((x) => x.id === id); if (a) this.run(a); },
      }),
    };
  }

  collect() {
    const g = this.game, st = this.state, n = Math.floor(st.bank || 0);
    if (n < 1) return { msg: 'NOTHING TO COLLECT', tone: 'bad', sel: 'bank' };
    g.addCredits(n, st.name);
    st.bank = 0;
    saveWorldState(this.ws);
    g.audio.cash();
    return { msg: `₵${n} COLLECTED`, sel: 'bank' };
  }

  // guards first: a stale click, held key or double-click must not charge twice. The answer shows on the page (the world is
  // frozen behind it): no toast, no pop
  build(type) {
    const g = this.game, st = this.state, B = BUILDINGS[type];
    if (!B || this.has(type)) return { msg: 'ALREADY BUILT', tone: 'bad', sel: type };
    const i = st.slots.indexOf(null);
    if (i < 0) return { msg: 'EVERY PLOT IS BUILT ON', tone: 'bad', sel: type };
    if (g.credits < B.cost) { g.audio.tone(180, 0.08, 'square', 0.05); return { msg: `NOT ENOUGH CREDITS: ₵${Math.ceil(B.cost - g.credits)} SHORT`, tone: 'bad', sel: type }; }
    g.credits -= B.cost;
    st.slots[i] = type;
    this.loc.slots = st.slots;
    addBuilding(g.world, this.loc, i, type);
    const extra = ON_BUILT[type] ? ON_BUILT[type](this) : '';
    this.afterBuild();
    saveWorldState(this.ws);
    g.save();
    g.audio.cash();
    return { msg: `${B.name.toUpperCase()} BUILT${extra ? ` · ${extra}` : ''}`, sel: type };
  }

  // ---------- the council ----------
  members() { return COUNCIL.filter((f) => FACTIONS[f] && !FACTIONS[f].absorbedBy && !FACTIONS[f].gone && !FACTIONS[f].fallen); }

  chance(f, motion) {
    if (f === 'kepler') return 1; // your own seat
    const rep = this.game.rep.get(f);
    return Math.min(0.97, Math.max(0.03, 0.15 + rep / 50 + (motion.stance[f] || 0)));
  }

  // (a clock set back must not lock the council: cap the wait at VOTE_CD, saved value too, as saplingWait() / militiaWait())
  cooldown() {
    const c = this.ws.council, now = Date.now();
    if (c.next > now + VOTE_CD) c.next = now + VOTE_CD;
    return Math.max(0, (c.next || 0) - now);
  }

  // Call a vote. The result is decided and saved HERE, before the cutscene (chamber.js), so skipping or quitting can't change
  // it; the scene fades to black, then announce() reads it out. The page is left first; a failed motion returns via back()
  vote(key, back = () => this.back()) {
    const g = this.game;
    const m = MOTIONS[key];
    const c = this.ws.council;
    if (!m || c.passed.includes(key)) return { msg: 'ALREADY CARRIED', tone: 'bad', sel: 'm:' + key };
    if (this.cooldown() > 0) return { msg: `THE COUNCIL SITS AGAIN IN ${Math.ceil(this.cooldown() / 60000)} MIN`, tone: 'bad', sel: 'm:' + key };
    const members = this.members();
    const ballots = members.map((f) => ({ f, yes: Math.random() < this.chance(f, m) }));
    const yes = ballots.filter((b) => b.yes).length;
    const pass = yes > members.length / 2;
    c.next = Date.now() + VOTE_CD / (this.has('radio') ? 2 : 1);
    const news = pass ? `<b>${m.name.toUpperCase()}.</b> ${m.desc}<br><br><small>Carried by the Moon Council, sitting in ${this.state.name}.</small>` : null;
    if (pass) { c.passed.push(key); this.ws.bulletin = news; } // (bulletin too: if closed before the new dawn, the next load tells the news, as after a finale)
    saveWorldState(this.ws);
    this.leave();
    // (the scene gets odds, not ballots: chamber faces match the page's forecast and spoil nothing)
    g.chamber.play({ motion: key, name: m.name, say: m.say, focus: m.focus, town: this.state.name, members: members.map((f) => ({ f, p: this.chance(f, m) })) },
      () => this.announce(m, ballots, yes, members.length, pass, news, back));
    return { takeover: true };
  }

  // After the chamber's fade to black: the roll is read out one member at a time (style.css .vote-roll), buttons held back
  // until the verdict (their labels would give it away). A failed motion fades the Moon back up under its page; a carried
  // one goes on to the new dawn, whose card already covers the picture
  announce(m, ballots, yes, n, pass, news, back) {
    const g = this.game;
    const STEP = 0.6, FIRST = 0.5; // s between lines, and before the first (match style.css delays)
    const verdictAt = FIRST + (ballots.length + 0.4) * STEP; // (verdict line and button appear)
    const roll = ballots.map((b, i) => `<div class="rc" style="--i:${i}"><span style="color:${FACTIONS[b.f].color}">${FACTIONS[b.f].name}</span>: <b style="color:${b.yes ? '#7dff6a' : '#ff3b5c'}">${b.yes ? 'AYE' : 'NAY'}</b></div>`).join('');
    const verdict = `<div class="rc" style="--i:${ballots.length + 0.4}"><br><b class="vt">${yes} to ${n - yes}. THE MOTION ${pass ? 'CARRIES' : 'FAILS'}.</b><br><small>${pass ? m.desc : 'Raise your standing with the doubters and call it again next session.'}</small></div>`;
    const title = `THE VOTE: ${m.name.toUpperCase()}`;
    // (the button is inert until the verdict shows, so mashing to skip the scene can't answer the card early, and no tone is
    // left pending when it closes. It then closes the card itself, like choices that repaint their own page)
    const born = performance.now();
    const answer = (label, then) => ({ label, keep: true, fn: () => { if (performance.now() - born < (verdictAt + 0.3) * 1000) return; g.closeModal(false); if (then) then(); } });
    if (pass) g.story.pendingDawn = () => g.newDawn(`THE COUNCIL HAS SPOKEN: ${m.name.toUpperCase()}`, news);
    g.dialog(title, roll + verdict, [pass ? answer('ONE WEEK LATER…') : answer('NEXT TIME', () => { g.chamber.reveal(0.8); back(); })], { cls: 'vote-roll' });
    const card = document.querySelector('#dialog .vote-roll');
    if (card) card.style.setProperty('--at', `${verdictAt}s`);
    const blip = (at, f, len, wave, vol) => setTimeout(() => { if (g.state === 'dialog') g.audio.tone(f, len, wave, vol); }, (FIRST + at * STEP) * 1000);
    ballots.forEach((b, i) => blip(i, b.yes ? 740 : 260, 0.12, 'square', 0.12)); // (high AYE, low NAY)
    blip(ballots.length + 0.4, pass ? 880 : 220, 0.4, 'triangle', 0.25);
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game;
    if (!this.loc || !this.state) return;
    const st = this.state;
    const P = g.player;
    st.bank = Math.min(BANK_CAP, (st.bank || 0) + (this.rate() / 60) * dt);
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 30; saveWorldState(this.ws); }
    const d = P.pos.distanceTo(this.loc.pos);
    if (this.has('farm') && d < this.loc.r && !P.dead) P.health = Math.min(P.maxHealth, P.health + 4 * dt);
    if (d < 1200) { this.syncFarm(); this.updateMilitia(dt); } else if (this.def.rovers.length) this.standDown();
    if (this.has('motorpool') && d < this.loc.r && g.garage) for (const k of Object.keys(g.garage.hp || {})) g.garage.hp[k] = Math.min(g.garage.maxHp(k), g.garage.hp[k] + 20 * dt);
    if (this.has('barracks') && d < 1200) {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.fireCd = 0.8;
        const from = g.world.toWorld(this.loc, 0, 30, 0);
        let target = null, bd = 400;
        for (const e of g.enemies.list) {
          if (e.dead || e.faction !== 'pirate' || !e.center || e.kind === 'core' || g.enemies.friendly(e)) continue;
          const dd = e.center.distanceTo(this.loc.pos);
          if (dd < bd) { bd = dd; target = e; }
        }
        if (target) g.projectiles.fire('mil', from, target.center.clone().sub(from).normalize().multiplyScalar(150), { damage: 28, splash: 4, color: 0xff9f1c, size: 0.45, knock: 0.5, spare: true });
      }
    }
  }
}
