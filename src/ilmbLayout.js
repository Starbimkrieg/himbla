// The ILMB's grounds as built (Draft A of docs/ilmb-layouts.md, "the Circle"): a ring road inside the wall at LOOP_R, a gate
// road out through each gate to the ring road outside, and four quarters in the band between the loop and the wall, each
// centred on its gate: transit at the main gate (passengers right of the gate road, freight left), the motor pool at the
// west gate, power and industry at the south, the civilian quarter at the east. Pure data, read by the game
// (ilmbCore.js buildIlmbQuarters, world.js buildHub, traffic.js) and by the clearance check that draws the plan
// (tools/ilmb-layouts.mjs).
//
// Hub frame: metres, angles in degrees as Math.atan2(z, x), +z the side the Crown's atrium faces (the main gate, 90°).
// Each entry: `a`, `r` its centre; `face` which way its front (+z of its model) looks: 'in' (to the hub), 'out' (to the
// wall), 'ccw' / 'cw' (along the circle, toward larger / smaller angles); `foot` its footprint for the check: [w, d] a box
// w deep (radially) and d long (round the circle), or a number, a circle's radius.

export const LOOP_R = 170;                       // the inner ring road's centreline
export const GATES = [0, 90, 180, 270];          // build_ilmb.py GATES
export const AVENUE = { r0: 67.6, r1: LOOP_R };  // Arrivals Avenue: the main gate road carried on to the atrium (drawn, not driven; flared into the inner ring)

const RAD = Math.PI / 180;
export const at = (a, r) => [Math.cos(a * RAD) * r, Math.sin(a * RAD) * r];
// a model's yaw (its +z turned to (sin yaw, cos yaw), as Kit.at) for an entry's `face` at angle a
export function yawFor(a, face) {
  const t = a * RAD;
  if (typeof face === 'number') return Math.PI / 2 - face * RAD;  // (a direction, degrees)
  return { in: -Math.PI / 2 - t, out: Math.PI / 2 - t, ccw: -t, cw: Math.PI - t }[face];
}

// Flyer pads (traffic.js pins the ILMB's lines to these; world.js buildHub lays them, the bus pads' stairs toward the
// terminal). The bus pads stand in a row along the wall, 8 m between decks, an 8 m concourse between their stairs and the
// terminal's airside.
export const BUS_PADS = [81.5, 72.6, 63.7, 54.8].map((a) => ({ a, r: 221, deck: 14.2, clear: 15.7 }));
export const SHIP_PADS = [{ a: 111, r: 209 }, { a: 132, r: 207 }].map((p) => ({ ...p, deck: 21, clear: 31 }));
// The Earth rocket's flat pad, and its launch gantry standing on the pad's outer edge (its arms reach in to the rocket)
export const ROCKET = { a: 41, r: 212, padR: 26, gantryOff: 14.5 };   // (padR: build_rocket.py PAD_R)

// Everything else. kind: 'piece' (an ilmb.glb piece), 'row' (units of one kind side by side round the circle, each `unit`
// m wide, `scale` times their built size: houses, shops), 'lot' (parking: `cars` one letter per bay, a faction's hover-car (S SPACECOM, K Kepler, M
// Meridian, V Vostok), c a civilian one, R a SPACECOM patrol rover, . empty), 'yard' (container stacks under a gantry
// crane), 'solar' (a solar field), 'dish' (the SPACECOM dish).
export const QUARTERS = [
  // ---- transit, the main gate (33° to 141°): passengers east of the gate road, freight west ----
  { name: 'passenger terminal', kind: 'piece', piece: 'terminal_pax', a: 68.5, r: 187.5, face: 'in', foot: [14, 44], q: 'pass' },
  { name: 'arrivals car park', kind: 'lot', a: 55.5, r: 186, face: 'in', cars: 'Sc.Kc', foot: [9, 24], q: 'pass' },
  { name: 'cargo shed', kind: 'piece', piece: 'cargo_shed', a: 98, r: 205, face: 'cw', foot: [44, 20], q: 'freight' },
  { name: 'container yard', kind: 'yard', a: 121.5, r: 230, face: 'in', foot: [12, 26], q: 'freight' },
  // ---- the motor pool, the west gate (141° to 228°) ----
  { name: 'motor pool', kind: 'piece', piece: 'motorpool', a: 162, r: 207, face: 'ccw', foot: [30, 52], q: 'motor' },
  { name: 'patrol rover lot', kind: 'lot', a: 149.5, r: 206, face: 'in', cars: 'RR.RS', bay: [4.4, 8.4], foot: [9.4, 22.5], q: 'motor' },
  { name: 'fuel and charge island', kind: 'piece', piece: 'fuel_island', a: 186, r: 196, face: 'in', foot: [8, 12], q: 'motor' },
  { name: 'vehicle depot', kind: 'piece', piece: 'depot', a: 196, r: 207, face: 'cw', foot: [27, 31], q: 'motor' },
  { name: 'barracks', kind: 'piece', piece: 'barracks', a: 209, r: 202, face: 'in', scale: 1.2, foot: [42, 18], q: 'motor' },
  { name: 'barracks', kind: 'piece', piece: 'barracks', a: 221, r: 202, face: 'in', scale: 1.2, foot: [42, 18], q: 'motor' },
  // ---- power and industry, the south gate (228° to 312°): the tank farm west of the gate road, solar east ----
  { name: 'fuel sphere', kind: 'piece', piece: 'horton_red', a: 255, r: 200, face: 'in', foot: 7, q: 'ind' },
  { name: 'fuel sphere', kind: 'piece', piece: 'horton_blue', a: 249.5, r: 222, face: 'in', foot: 7, q: 'ind' },
  { name: 'fuel sphere', kind: 'piece', piece: 'horton_red', a: 245, r: 200, face: 'in', foot: 7, q: 'ind' },
  { name: 'tank', kind: 'piece', piece: 'tank', a: 258.5, r: 226, face: 'in', foot: 5, q: 'ind' },
  { name: 'tank', kind: 'piece', piece: 'tank', a: 241, r: 222, face: 'in', foot: 5, q: 'ind' },
  { name: 'tank', kind: 'piece', piece: 'tank', a: 236, r: 202, face: 'in', foot: 5, q: 'ind' },
  { name: 'pump house', kind: 'piece', piece: 'pump_house', a: 232, r: 225, face: 'ccw', foot: [14, 16], q: 'ind' },
  { name: 'pipe bridge', kind: 'piece', piece: 'pipe_bridge', a: 262, r: 162, face: 'in', foot: [70, 4], q: 'ind', soft: true },
  { name: 'solar field', kind: 'solar', a: 283, r: 205, face: 'in', foot: [22, 39], q: 'ind' },
  { name: 'solar field', kind: 'solar', a: 298, r: 205, face: 'in', foot: [22, 39], q: 'ind' },
  { name: 'comms mast', kind: 'piece', piece: 'mast', a: 290, r: 230, face: 'in', foot: 2, q: 'ind' },
  { name: 'works car park', kind: 'lot', a: 308.5, r: 202, face: 'in', cars: 'S.cV', foot: [9, 19], q: 'ind' },
  // ---- the civilian quarter, the east gate (312° to 33°): shops on a market lane north of the gate road, houses south ----
  { name: 'shops', kind: 'row', units: ['shop_canteen', 'shop_suits', 'shop_parts', 'shop_noodle'], unit: 10, scale: 1.25, a: 12, r: 191, face: 'out', foot: [14, 50], q: 'civ' },
  { name: 'shops', kind: 'row', units: ['shop_clinic', 'shop_noodle', 'shop_canteen', 'shop_suits'], unit: 10, scale: 1.25, a: 12, r: 223, face: 'in', foot: [14, 50], q: 'civ' },
  { name: 'family dome (pink)', kind: 'piece', piece: 'dome_pink', a: 27, r: 207, face: 'cw', foot: 19, q: 'civ' },
  { name: 'houses', kind: 'row', units: ['house_a', 'house_b', 'house_c', 'house_a'], unit: 10, scale: 1.25, a: 348, r: 191, face: 'out', foot: [14, 50], q: 'civ' },
  { name: 'houses', kind: 'row', units: ['house_b', 'house_c', 'house_a', 'house_b'], unit: 10, scale: 1.25, a: 348, r: 223, face: 'in', foot: [14, 50], q: 'civ' },
  { name: 'houses', kind: 'row', units: ['house_c', 'house_a', 'house_b'], unit: 10, scale: 1.25, a: 333, r: 191, face: 'out', foot: [14, 37.5], q: 'civ' },
  { name: 'houses', kind: 'row', units: ['house_a', 'house_c', 'house_b'], unit: 10, scale: 1.25, a: 333, r: 223, face: 'in', foot: [14, 37.5], q: 'civ' },
  { name: 'family dome (gold)', kind: 'piece', piece: 'dome_gold', a: 318, r: 206, face: 'ccw', foot: 17, q: 'civ' },
  // ---- inside the loop ----
  { name: 'SPACECOM dish', kind: 'dish', a: 184, r: 128, face: 'out', foot: 14, q: 'ind' },
  { name: 'visitor parking', kind: 'lot', a: 75, r: 147, face: 'out', cars: 'M.Sc.', foot: [9, 24], q: 'pass' },
  { name: 'visitor parking', kind: 'lot', a: 105, r: 147, face: 'out', cars: 'cS.VS', foot: [9, 24], q: 'pass' },
];

// A parking lot's bays (unless it gives its own `bay`: [w, d]): 4.6 m wide, 8 deep (a hover-car is 3.9 m over its pods and
// 6.9 long), in a row round the circle, open toward its front
export const LOT_BAY = [4.6, 8.0];

// Where traffic on the inside roads pulls in for a while (traffic.js innerStops): [angle, 'out' (the loop's outer lane, by
// the quarters) or 'in' (its inner lane, by the visitor parking)]. At least ~35 m from a gate (the junctions' connectors).
export const INNER_STOPS = [[55.5, 'out'], [75, 'in'], [105, 'in'], [149.5, 'out'], [196, 'out'], [308.5, 'out'], [16, 'out'], [340, 'out']];
