// The Kepler towns' layouts (docs/kepler-proposals, picked November 2026): three for the towns and the Civic Center's.
// settlements.js buildTown lays a town from these with the pieces of kepler.glb (tools/blender/build_kepler.py);
// tools/kepler-layouts.mjs checks them (clearances, the pad's flight disc) and draws the plans.
//
// Frame: the town's own, metres, +x right, +z up the plan and sunward. A piece's yaw (degrees) turns its front (+z, its
// door) toward (sin yaw, cos yaw). The landing pad stays where the towns have always had it, (-65, 55), r 13.
//
// The regular towns have no roads: their lanes and courts are cleared regolith (`clear`, `clearing`, `path`: drawn as
// graded ground, walked, never driven; `markers` lines a lane with route markers). Only the Civic Center has a road, its
// avenue (`road`: traffic.js pavedStrip lays it, as the Meridian Exchange's).
//
// Pieces: domeA / domeB { r, door } (r one of DOME_A / DOME_B, the sizes kepler.glb holds; `door` a household colour,
// DOOR_HEX), stilt { feature, stairs, door }, longhouse { door }, shop { name } (the ILMB quarter's shop units, SHOP_UNITS),
// stall, bench, greenhouse, tank, mast, solar { n }, hall, lamp, sign (the town's name board), link { a, b } (a tunnel
// between the layout's a-th and b-th domes).

export const KEPLER_PAD = { x: -65, z: 55, r: 13 };
export const DOME_A = [6, 10, 12, 14, 18];
export const DOME_B = [6, 11, 13, 16, 22];
// a household's door (kepler_kit.py HEX): muted, the one place a home shows its own colour
export const DOOR_HEX = { sage: 0x8fb28a, dusk: 0x6f8fb8, ochre: 0xe0b050, rose: 0xc98a9a, teal: 0x5fa8a0, pink: 0xff7ad9, gold: 0xffd23f };
// the tunnel (kepler_kit.py TUNNEL_R, TUNNEL_Y, TUNNEL_SEG): its radius, its axis' height, one segment's length
export const TUNNEL = { r: 1.5, y: 1.75, seg: 4.5 };
// the hall's flag masts, in its frame (kepler_kit.py HALL_FLAGS: the game hangs the cloth)
export const HALL_FLAGS = [[-12.5, 25], [12.5, 25]];
// The shops are the ILMB quarter's units (10 m wide, ilmb_quarters.py) at 0.86, so they stand 8.6 m apart, set 0.25 m
// forward of the piece's spot (their awning is shallower than their back); the name goes on the fascia.
export const SHOP_SCALE = 0.86, SHOP_OFF = 0.25;
export const SHOP_UNITS = {
  'NOODLE BAR': 'shop_noodle', CANTEEN: 'shop_canteen', 'SUIT SHOP': 'shop_suits', PARTS: 'shop_parts', CLINIC: 'shop_clinic',
  POST: 'shop_suits', GROCER: 'shop_canteen', 'TOOL LIBRARY': 'shop_parts', BARBER: 'shop_clinic', BAKERY: 'shop_noodle',
};
// which layout each town takes (docs/kepler-proposals: 3 the Courtyard, 2 the Caterpillar, 1 Main Street)
export const TOWN_LAYOUT = { tranq: '3', aldrin: '2', kepler: 'civic', twilight: '1', hertz: '3' };

const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const r1 = (v) => Math.round(v * 10) / 10;
const DOORS = ['sage', 'dusk', 'ochre', 'rose', 'teal'];
const SHOPS = ['NOODLE BAR', 'CANTEEN', 'SUIT SHOP', 'PARTS', 'CLINIC', 'POST', 'GROCER', 'TOOL LIBRARY', 'BARBER', 'BAKERY'];

const dome = (kind, x, z, r, yaw, i = 0) => ({ k: 'dome' + kind, x, z, r, yaw, door: DOORS[i % DOORS.length] });
const shop = (x, z, yaw, name) => ({ k: 'shop', x, z, yaw, name });
const stall = (x, z, yaw) => ({ k: 'stall', x, z, yaw });
const bench = (x, z, yaw) => ({ k: 'bench', x, z, yaw });
const longhouse = (x, z, yaw, i = 0) => ({ k: 'longhouse', x, z, yaw, door: DOORS[(i + 2) % DOORS.length] });
const clear = (x0, z0, x1, z1, markers = false) => ({ k: 'clear', x0, z0, x1, z1, markers });
const clearing = (x, z, r) => ({ k: 'clearing', x, z, r });
const path = (x, z, x2, z2, w = 6) => ({ k: 'path', x, z, x2, z2, w, markers: true });
const lamp = (x, z) => ({ k: 'lamp', x, z });
const sign = (x, z, yaw) => ({ k: 'sign', x, z, yaw });
const link = (a, b) => ({ k: 'link', a, b });
export const toward = (x, z, tx = 0, tz = 0) => r1(deg(Math.atan2(tx - x, tz - z)));

// ---- 1: Main Street ----
function mainStreet() {
  const p = [clear(-72, -5, 72, 5), clear(-67, 5, -61, 32, true), path(-64, 31, -52, 42, 5), clearing(0, 19, 14)];
  [-21.5, -12.9, -4.3, 4.3, 12.9, 21.5].forEach((x, i) => p.push(shop(x, -9.4, 0, SHOPS[i])));
  [-30.6, -22, 22, 30.6].forEach((x, i) => p.push(shop(x, 9.4, 180, SHOPS[6 + i])));
  [[-7, 26], [0, 29], [7, 26]].forEach(([x, z]) => p.push(stall(x, z, 180)));
  p.push(bench(-9, 13, 90), bench(9, 13, -90));
  [-27, -9, 9, 27].forEach((x, i) => p.push(longhouse(x, -30, 0, i)));
  p.push(dome('A', -30, 48, 12, 180, 0), dome('B', 4, 60, 16, 180, 1), dome('A', 40, 46, 12, 180, 2), link(0, 1), link(1, 2));
  p.push(dome('A', 58, -34, 12, -45, 3), dome('B', -58, -34, 11, 45, 4));
  p.push({ k: 'greenhouse', x: -49, z: 22, yaw: 90 }, { k: 'greenhouse', x: 62, z: 22, yaw: 90 });
  p.push({ k: 'tank', x: 84, z: 0 }, { k: 'mast', x: -84, z: -12 }, { k: 'solar', x: 0, z: -62, yaw: 0, n: 4 });
  p.push(sign(-74, 22, toward(-74, 22, -65, 40)));
  for (const x of [-68, -52, -34, 34, 52, 68]) p.push(lamp(x, -6.5));
  for (const x of [-56, -44, 44, 60]) p.push(lamp(x, 6.5));
  return {
    id: '1', name: 'Main Street', r: 110,
    idea: 'One street of cleared regolith, 144 m end to end, in place of the hub dome. Shops line the sunward side, a market square opens off the other; homes stand in rows behind: longhouses on the back lane, domes at the corners.',
    pieces: p,
  };
}

// ---- 2: the Caterpillar ----
function caterpillar() {
  const p = [clear(-52, 6, 52, 16), clear(-14, 16, 14, 46), path(-50, 42, -44, 16)];
  for (let i = 0; i < 9; i++) {
    const f = (i - 4) * (11.5 / 95);
    p.push({ k: 'stilt', x: r1(95 * Math.sin(f)), z: r1(-95 + 95 * Math.cos(f)), yaw: r1(deg(f)), feature: i === 4, stairs: i % 2 === 0, door: DOORS[i % DOORS.length] });
  }
  [21.5, 30.1, 38.7].forEach((z, i) => p.push(shop(-18.4, z, 90, SHOPS[i]), shop(18.4, z, -90, SHOPS[i + 3])));
  [[-5, 24], [5, 31], [-5, 38]].forEach(([x, z]) => p.push(stall(x, z, 0)));
  p.push(bench(-8, 10, 0), bench(8, 10, 0), bench(-30, 10, 0), bench(30, 10, 0));
  p.push(dome('B', -74, 4, 16, toward(-74, 4, -52, 11), 0), dome('B', 72, 4, 11, toward(72, 4, 52, 11), 1), dome('A', 0, -52, 14, 0, 2));
  p.push(longhouse(-40, 34, 90, 0), longhouse(40, 34, -90, 1));
  p.push({ k: 'greenhouse', x: -30, z: -34, yaw: 90 }, { k: 'greenhouse', x: 30, z: -34, yaw: 90 });
  p.push({ k: 'tank', x: 62, z: -30 }, { k: 'mast', x: -62, z: -32 }, { k: 'solar', x: 0, z: -80, yaw: 0, n: 4 });
  p.push(sign(-34, 52, toward(-34, 52, -52, 46)));
  for (const x of [-46, -30, 30, 46]) p.push(lamp(x, 17.5));
  p.push(lamp(-13, 48), lamp(13, 48));
  return {
    id: '2', name: 'The Caterpillar', r: 115,
    idea: 'Nine raised modules on hydraulic legs, chained in a shallow arc 100 m long, the orange commons module in the middle: the polar-station type. A cleared promenade runs along the chain and a market court opens off it, under the commons\' stair. Three domes anchor the ends and the back.',
    pieces: p,
  };
}

// ---- 3: the Courtyard ----
function courtyard() {
  const R = 60, p = [clearing(0, 0, 38)];
  const gate = [R * Math.cos(rad(140)), R * Math.sin(rad(140))];
  p.push(path(r1(gate[0] * 0.55), r1(gate[1] * 0.55), KEPLER_PAD.x + 13, KEPLER_PAD.z - 11, 7));
  [50, 110, 170, 230, 290, 350].forEach((t, i) => {
    const x = r1(R * Math.cos(rad(t))), z = r1(R * Math.sin(rad(t)));
    p.push(dome(i % 2 ? 'A' : 'B', x, z, [11, 12, 13, 14, 13, 12][i], toward(x, z), i));
  });
  p.push(link(0, 1), link(2, 3), link(3, 4), link(4, 5), link(5, 0));
  [275, 293, 311, 329, 347, 365].forEach((t, i) => {
    const x = r1(32 * Math.cos(rad(t))), z = r1(32 * Math.sin(rad(t)));
    p.push(shop(x, z, toward(x, z), SHOPS[i]));
  });
  [60, 100, 180, 220].forEach((t) => {
    const x = r1(14 * Math.cos(rad(t))), z = r1(14 * Math.sin(rad(t)));
    p.push(stall(x, z, toward(0, 0, x, z)));
  });
  for (const t of [140, 260, 300]) p.push(bench(r1(22 * Math.cos(rad(t))), r1(22 * Math.sin(rad(t))), toward(r1(22 * Math.cos(rad(t))), r1(22 * Math.sin(rad(t))))));
  p.push({ k: 'tank', x: 0, z: 0 });
  p.push({ k: 'greenhouse', x: 7.8, z: 29, yaw: -75 }, { k: 'greenhouse', x: -28.2, z: -10.3, yaw: 160 });
  p.push({ k: 'mast', x: -82, z: -28 }, { k: 'solar', x: 10, z: 88, yaw: 0, n: 3 });
  p.push(sign(-64, 32, toward(-64, 32, -52, 44)));
  for (const t of [20, 125, 155, 250]) p.push(lamp(r1(37 * Math.cos(rad(t))), r1(37 * Math.sin(rad(t)))));
  return {
    id: '3', name: 'The Courtyard', r: 110,
    idea: 'Six domes in a ring 120 m across, joined by tunnels into one wall with a single gate toward the landing pad; inside, a cleared market court round the water tank, the shops along its far side facing the gate.',
    pieces: p,
  };
}

// ---- the Civic Center ----
function civic() {
  const p = [{ k: 'hall', x: 0, z: 0, yaw: 0 }, { k: 'road', x0: 0, z0: 44, x1: 0, z1: 140 }];
  [56, 64.6, 73.2, 81.8].forEach((z, i) => p.push(shop(-16.4, z, 90, SHOPS[i]), shop(16.4, z, -90, SHOPS[i + 4])));
  [200, 235, 270, 305, 340].forEach((t, i) => {
    const x = r1(70 * Math.cos(rad(t))), z = r1(70 * Math.sin(rad(t)));
    p.push(dome(i % 2 ? 'B' : 'A', x, z, [14, 16, 18, 16, 14][i], toward(x, z), i));
  });
  p.push(link(0, 1), link(1, 2), link(2, 3), link(3, 4));
  p.push(longhouse(48, 62, -90, 0), longhouse(48, 80, -90, 1), longhouse(-48, 84, 90, 2), longhouse(-46, 99, 90, 3));
  p.push(path(-50, 44, -24, 40, 6), clear(-24, 38, -8, 50));
  p.push({ k: 'greenhouse', x: 72, z: 16, yaw: 0 }, { k: 'greenhouse', x: 84, z: 16, yaw: 0 });
  p.push({ k: 'tank', x: -80, z: 8 }, { k: 'mast', x: 86, z: -12 }, { k: 'solar', x: 0, z: -108, yaw: 0, n: 5 });
  p.push(sign(-16, 100, 0));
  for (const z of [50, 70, 90, 110]) p.push(lamp(-8, z), lamp(8, z));
  return {
    id: 'civic', name: 'Kepler Civic Center', r: 140,
    idea: 'The new hall stands where the gold council dome was, replacing it and the clock-tower hall both. Civic Avenue, the one road in the Kepler towns, runs from the arrivals side to its forecourt between two rows of shops; the big family domes close the back in an arc.',
    pieces: p,
  };
}

export const KEPLER_LAYOUTS = [mainStreet(), caterpillar(), courtyard(), civic()];
export const keplerLayout = (id) => KEPLER_LAYOUTS.find((L) => L.id === id);
