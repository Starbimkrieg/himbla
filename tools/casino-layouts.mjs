// Lucky Crater Casino layout study (docs/casino-layouts.md). Each layout: a floor plan (union of rectangles and circles),
// footprints, and the clear space the seated games need, in the casino frame (metres, +x right, +z toward the doors; plans
// drawn looking down, doors at the bottom). Dev-only, not in the build.
//   node tools/casino-layouts.mjs          check every layout, print the tightest gaps
//   node tools/casino-layouts.mjs docs     also draw docs/casino-layout-{current,a,b}.svg
//   node tools/casino-layouts.mjs dump     also list A and B's footprints, stations and lens corridors
//   node tools/casino-layouts.mjs json     also print the layouts as JSON
// Checks (the doc's "Rules the checker holds every layout to"):
//   - every footprint is on the floor; free-standing ones keep AISLE from the walls
//   - footprints of different groups keep AISLE apart (a group is built as one: counter and cage, a slot row)
//   - a game's trigger zone (station circle, casinoGames.js STATIONS) touches no other footprint or station
//   - the seated camera's corridor (casinoGames.js view(): the lens path) holds nothing taller than the lens
import { writeFileSync } from 'node:fs';
import { HALL, WALL, BJ, CLAW, DUCK, PLK, CLASSIC, PRIZE, floorShapes, wallEdges, wallBoxes, inBox, inHall } from '../src/casinoPlan.js';

const AISLE = 2.4;            // narrowest walkable gap, m
const WALL_T = 2.4;           // wall thickness drawn in the plans, m
const TAU = Math.PI * 2;

// ---------- shapes: rect {x0,x1,z0,z1}, circle {x,z,r} ----------
const R = (x0, x1, z0, z1) => ({ k: 'r', x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
const C = (x, z, r) => ({ k: 'c', x, z, r });
const C_ = C;
const rc = (cx, cz, w, d) => R(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
const dist = (a, b) => {
  if (a.k === 'c' && b.k === 'c') return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.k === 'r' && b.k === 'r') {
    const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1), gz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
    return gx < 0 && gz < 0 ? Math.max(gx, gz) : Math.hypot(Math.max(0, gx), Math.max(0, gz));   // negative when overlapping: how far in
  }
  const [c, r] = a.k === 'c' ? [a, b] : [b, a];
  return Math.hypot(c.x - Math.max(r.x0, Math.min(c.x, r.x1)), c.z - Math.max(r.z0, Math.min(c.z, r.z1))) - c.r;
};
const inside = (s, x, z) => (s.k === 'r' ? x >= s.x0 - 1e-6 && x <= s.x1 + 1e-6 && z >= s.z0 - 1e-6 && z <= s.z1 + 1e-6 : Math.hypot(x - s.x, z - s.z) <= s.r + 1e-6);
const onFloor = (L, x, z) => L.floor.some((s) => inside(s, x, z));
const samples = (s, grow = 0) => {
  const out = [];
  if (s.k === 'c') { for (let i = 0; i < 48; i++) out.push([s.x + Math.cos((i / 48) * TAU) * (s.r + grow), s.z + Math.sin((i / 48) * TAU) * (s.r + grow)]); return out; }
  const x0 = s.x0 - grow, x1 = s.x1 + grow, z0 = s.z0 - grow, z1 = s.z1 + grow;
  for (let t = 0; t <= 1.0001; t += 1 / 24) { out.push([x0 + (x1 - x0) * t, z0], [x0 + (x1 - x0) * t, z1], [x0, z0 + (z1 - z0) * t], [x1, z0 + (z1 - z0) * t]); }
  return out;
};
const onFloorShape = (L, s, grow = 0) => samples(s, grow).every(([x, z]) => onFloor(L, x, z));

// ---------- the games, as built (casinoWorld.js, casinoGames.js, tools/blender/build_*.py) ----------
// Each helper returns { items, stations, corridors } for one game at a wall.
//   claw     16.4 wide x 5.2 deep x 8.4 tall, glass facing away from the wall; station 6.3 m out (r 3.3); lens 6.6 m (16:9) to
//            9.2 m (4:3) beyond the glass at 3.95 m up, so the corridor runs 14.5 m from the wall
const claw = (wallZ, cx) => ({
  items: [{ id: 'Zero-G claw', s: R(cx - 8.2, cx + 8.2, wallZ - 5.2, wallZ), h: 8.4, cls: 'game' }],
  stations: [{ of: 'Zero-G claw', s: C(cx, wallZ - 6.3, 3.3), cls: 'game' }],
  corridors: [{ of: 'Zero-G claw', s: R(cx - 8.6, cx + 8.6, wallZ - 14.5, wallZ - 5.2), y: 3.95, label: 'claw lens' }],
});
//   plinko   frame 15.9 wide x 14.4 tall x 2.7 deep, back on the wall; board plane 2.0 m out; booth 6.0 m out (3.6 x 1.4);
//            station 7.8 m out (r 3.2); lens 16.5 m out, 6.4 m up. Its view cone is 16 m wide at the board, 0 at the lens:
//            the corridor uses the mean width, 13 m (a pier at the cone's edge frames the board)
const plinko = (wallZ, cx) => {
  const pz = wallZ + 2.0;
  return {
    items: [{ id: 'Plinko frame', s: R(cx - 7.95, cx + 7.95, wallZ, wallZ + 2.7), h: 14.4, cls: 'game' }, { id: 'Plinko booth', s: rc(cx, pz + 6, 3.6, 1.4), h: 1.4, cls: 'game', grp: 'plinko' }],
    stations: [{ of: 'Plinko booth', s: C(cx, pz + 7.8, 3.2), cls: 'game' }],
    corridors: [{ of: 'Plinko frame', s: R(cx - 6.5, cx + 6.5, wallZ + 2.7, pz + 17.2), y: 6.4, label: 'plinko lens' }],
  };
};
//   blackjack  table-local x across (+-3.8 with the rail), z toward the player: counter at -2.0 (on the wall), stool at 4.7;
//              station 4.8 out (r 2.8). yaw as bjPt: 0 faces +z, PI/2 +x, -PI/2 -x
const blackjack = (x0, z0, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, lz) => [x0 + lx * c + lz * s, z0 - lx * s + lz * c];
  const pts = [[-3.8, -2], [3.8, -2], [-3.8, 4.7], [3.8, 4.7]].map(([a, b]) => P(a, b));
  const st = P(0, 4.8);
  return {
    items: [{ id: 'Blackjack table', s: R(Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))), h: 2.1, cls: 'game' }],
    stations: [{ of: 'Blackjack table', s: C(st[0], st[1], 2.8), cls: 'game' }],
    corridors: [],
  };
};
//   duck derby  basin 28.4 long x 7.8 over its rails (rails 0.55 beyond the lane edges); lanes 1.6 apart, lane 0 nearest the
//            viewers; kiosk 3.0 x 1.7, 5.4 m off lane 0 at mid-track, station 2.0 m further (r 2.8); gate and finish arches
//            1.2 thick, 6.5 tall; odds board (17.2 x 6.8, y 5 to 11.8) on the wall behind. Two lenses: kiosk (9 m up, 7.5 m
//            out) and race (6.2 m up, 7.5 m off lane 0, following the lead down the track).
//            `f(u, v)` maps track coordinates (u along, v from the far wall toward the viewers) to hall (x, z).
const duck = (f, u0, farRail, ko = 5.4, pillars = false) => {   // pillars: gate and arch piers 1 m in from the wall face (centre), 0.8 wide, 9.6 m apart
  const lane0 = farRail + 6.3, mid = u0 + 14.2;
  const box = (ua, ub, va, vb) => { const a = f(ua, va), b = f(ub, vb); return R(a[0], b[0], a[1], b[1]); };
  const k = f(mid, lane0 + ko), ks = f(mid, lane0 + ko + 2);
  const along = f(1, 0)[0] !== f(0, 0)[0];  // u runs along x
  const kw = along ? 3.0 : 1.7, kd = along ? 1.7 : 3.0;
  return {
    items: [
      { id: 'Duck basin', s: box(u0, u0 + 28.4, farRail, lane0 + 1.5), h: 1.4, cls: 'game', grp: 'duck' },
      { id: 'Start gate', s: box(u0 + 1.1, u0 + 2.3, pillars ? farRail - 1.3 : farRail, pillars ? farRail + 9.1 : lane0 + 1.5), h: 6.5, cls: 'game', grp: 'duck' },
      { id: 'Finish arch', s: box(u0 + 26.1, u0 + 27.3, pillars ? farRail - 1.3 : farRail, pillars ? farRail + 9.1 : lane0 + 1.5), h: 6.5, cls: 'game', grp: 'duck' },
      { id: 'Duck kiosk', s: rc(k[0], k[1], kw, kd), h: 2.4, cls: 'game', free: true },
    ],
    stations: [{ of: 'Duck kiosk', s: C(ks[0], ks[1], 2.8), cls: 'game' }],
    corridors: [
      { of: 'Duck basin', s: box(mid - 2, mid + 2, lane0 + ko, lane0 + ko + 8), y: 9, label: 'derby kiosk lens' },
      { of: 'Duck basin', s: box(u0, u0 + 28.4, lane0 + 6.8, lane0 + 8.2), y: 6.2, label: 'derby race lens' },
    ],
  };
};
//   prize counter  8.2 long x 4.6 deep from its wall (dais and header included); station 5.8 m out (r 3.8). Chip cage 3.6 x 4,
//                  same group as the counter
//   classic games  four slot cabinets 3.2 m apart (12.2 long overall), 1.7 deep, 1.75 m off the wall; station 3.2 m out from
//                  the cabinet line (r 5.4)
const prizeAt = (wall, pos, face) => { // face: 'N' (south wall, counter faces -z), 'W' (wall at x, faces -x), 'E' (faces +x)
  const [x, z] = pos;
  const s = face === 'N' ? R(x - 4.1, x + 4.1, wall - 4.6, wall) : face === 'W' ? R(wall - 4.6, wall, z - 4.1, z + 4.1) : R(wall, wall + 4.6, z - 4.1, z + 4.1);
  const st = face === 'N' ? C(x, wall - 5.8, 3.8) : face === 'W' ? C(wall - 5.8, z, 3.8) : C(wall + 5.8, z, 3.8);
  return { items: [{ id: 'Prize counter', s, h: 4.8, cls: 'game', grp: 'prize' }], stations: [{ of: 'Prize counter', s: st, cls: 'game' }], corridors: [] };
};
const classic = (wall, pos, face) => {
  const [x, z] = pos, L = 12.2, D = 1.7, off = 1.75;
  let s, st;
  if (face === 'W') { s = R(wall - off - D, wall - off, z - L / 2, z + L / 2); st = C(wall - off - D / 2 - 3.2, z, 5.4); }
  else if (face === 'E') { s = R(wall + off, wall + off + D, z - L / 2, z + L / 2); st = C(wall + off + D / 2 + 3.2, z, 5.4); }
  else { s = R(x - L / 2, x + L / 2, wall - off - D, wall - off); st = C(x, wall - off - D / 2 - 3.2, 5.4); }
  return { items: [{ id: 'Classic games', s, h: 4.3, cls: 'game' }], stations: [{ of: 'Classic games', s: st, cls: 'game' }], corridors: [] };
};
const merge = (...parts) => ({ items: parts.flatMap((p) => p.items), stations: parts.flatMap((p) => p.stations), corridors: parts.flatMap((p) => p.corridors) });
const prop = (id, s, h, cls, o = {}) => ({ id, s, h, cls, ...o });

// =====================================================================================================================================
// CURRENT: the box hall casinoWorld.js built before layout B, kept for contrast (HALL W 26 FRONT 12 BACK -34: inner faces x +-25, z -33 .. 11; doors 5 m either side of x 0)
// =====================================================================================================================================
const current = (() => {
  const g = merge(
    { items: [{ id: 'Zero-G claw', s: R(-23.8, -7.4, 5.78, 10.98), h: 8.4, cls: 'game' }], stations: [{ of: 'Zero-G claw', s: C(-15.6, 4.68, 3.3), cls: 'game' }], corridors: [{ of: 'Zero-G claw', s: R(-24.8, -6.4, -3.5, 5.78), y: 3.95, label: 'claw lens' }] },
    blackjack(-22.96, -8, Math.PI / 2),
    { items: [{ id: 'Duck basin', s: R(-24.3, 4.3, -27.8, -20), h: 1.4, cls: 'game', grp: 'duck' }, { id: 'Duck kiosk', s: rc(-10, -17.4, 3, 1.7), h: 2.4, cls: 'game', free: true }],
      stations: [{ of: 'Duck kiosk', s: C(-10, -15.4, 2.8), cls: 'game' }],
      corridors: [{ of: 'Duck basin', s: R(-12, -8, -17.4, -9.5), y: 9, label: 'derby kiosk lens' }, { of: 'Duck basin', s: R(-24, 4, -14.5, -13), y: 6.2, label: 'derby race lens' }] },
    { items: [{ id: 'Plinko frame', s: R(6, 22, -33, -30.3), h: 14.4, cls: 'game' }, { id: 'Plinko booth', s: rc(14, -25, 3.6, 1.4), h: 1.4, cls: 'game', grp: 'plinko' }],
      stations: [{ of: 'Plinko booth', s: C(14, -23.2, 3.2), cls: 'game' }], corridors: [{ of: 'Plinko frame', s: R(5.5, 22.5, -30.3, -14.5), y: 6.4, label: 'plinko lens' }] },
    { items: [{ id: 'Classic games', s: R(21.55, 23.25, -3.4, 8.6), h: 4.3, cls: 'game' }], stations: [{ of: 'Classic games', s: C(19.2, 2.5, 5.4), cls: 'game' }], corridors: [] },
    { items: [{ id: 'Prize counter', s: R(20.5, 25, -16.6, -9.4), h: 4.8, cls: 'game', grp: 'prize' }], stations: [{ of: 'Prize counter', s: C(19.2, -13, 3.8), cls: 'game' }], corridors: [] },
  );
  return {
    name: 'Current', file: 'casino-layout-current.svg',
    floor: [R(-25, 25, -33, 11)], doors: [{ x: 0, z: 11, w: 10 }], ...g,
    overhead: [['chandelier', -12, -14], ['chandelier', 12, -14], ['chandelier', 0, -2], ['sign', 0, 5, 9.6, 2.5]],
    walls: 'box',
    outside: [prop('Slot carousel W', C(-15.8, 31, 7.6), 10, 'ext'), prop('Slot carousel E', C(15.8, 31, 7.6), 10, 'ext'), prop('Giant die', C(-36, 22, 4.8), 14, 'ext'), prop('Roulette wheel', R(31, 41, 19, 21), 22, 'ext'), prop('Chip stack', C(-24, 16, 1.7), 4, 'ext'), prop('Chip stack', C(24, 16, 1.7), 4, 'ext'), prop('Chip stack', C(-27, 44, 1.7), 7, 'ext'), prop('Chip stack', C(27, 46, 1.7), 7, 'ext'), prop('Canopy', R(-7, 7, 12.6, 19.6), 9.6, 'canopy')],
    note: 'Footprint 50 x 44 m, one box. The middle (x -17..17, z -17..0) is bare apart from three chandeliers; the doors lead at nothing.',
  };
})();

// =====================================================================================================================================
// A: THE GILDED NAVE. One axial hall, 50 x 49 m inside: a nave from the doors to the Plinko cabinet, gold-pier arcades opening
// into two wings (Duck Derby left, Blackjack and Classic Games right); claw and prize pavilion flank the doors.
// =====================================================================================================================================
const nave = (() => {
  const W = 25, ZB = -37, ZF = 12, PIER = 8.0;
  const wingDuck = duck((u, v) => [-W + v, u], -33.45, 0.9);       // along z on the left wall, viewers to +x; start gate at the back
  const g = merge(
    claw(ZF, -16.2),
    prizeAt(ZF, [16.2, 0], 'N'),
    { items: [prop('Chip cage', R(21.6, 24.6, 8, 12), 3.2, 'game', { grp: 'prize' })], stations: [], corridors: [] },
    plinko(ZB, 0),
    wingDuck,
    blackjack(W - 2.04, -30, -Math.PI / 2),
    classic(W, [0, -12.2], 'W'),
    { items: [prop('Chip bar', C(0, -4, 4.7), 4.2, 'new', { free: true })], stations: [], corridors: [] },
  );
  const piers = [];
  for (const z of [-6.5, -15, -23.5, -32]) for (const sx of [-1, 1]) piers.push(prop('Pier', rc(sx * PIER, z, 1.4, 1.4), 16, 'struct', { struct: true }));
  return {
    name: 'A: The Gilded Nave', file: 'casino-layout-a.svg',
    floor: [R(-W, W, ZB, ZF)], doors: [{ x: 0, z: ZF, w: 12 }], ...g, items: [...g.items, ...piers],
    overhead: [['chandelier', 0, 4], ['chandelier', 0, -10], ['chandelier', -17, -19.5], ['chandelier', 17, -19.5], ['sign', 0, 7, 12, 2.5]],
    walls: 'box',
    outside: [
      prop('Portico (6 gold columns)', R(-9, 9, 14.4, 21.6), 12, 'new'), prop('Slot carousel W', C(-19.5, 38, 7.6), 10, 'ext'), prop('Slot carousel E', C(19.5, 38, 7.6), 10, 'ext'),
      prop('Giant die', C(-40, 20, 4.8), 14, 'ext'), prop('Roulette wheel', R(35, 45, 19, 21), 22, 'ext'),
      prop('Chip gate pier', C(-11.5, 24, 1.7), 7, 'new'), prop('Chip gate pier', C(11.5, 24, 1.7), 7, 'new'),
    ],
    note: 'Footprint 50 x 49 m inside (5 m deeper), outer 54.8 x 54.8. One long axis: doors, foyer, chip bar, nave, Plinko.',
  };
})();

// =====================================================================================================================================
// B: THE CRATER CROSS. Cruciform round a domed rotunda: foyer south, Plinko arm north, wings east and west; every game has its
// own room. Wings 22 wide, 42 long; frontage 110 m.
// =====================================================================================================================================
const cross = (() => {
  // numbers from src/casinoPlan.js (what the game builds), so drift from the game fails here
  const { C, WING } = HALL, CZ = C[1];
  const floor = floorShapes();
  const eDuck = duck((u, v) => [u, DUCK.wallZ + v], DUCK.x0 - 2.2, 1.9, 5.4, true);
  const lane0 = DUCK.wallZ + 1.9 + 6.3;
  if (Math.abs(lane0 - DUCK.lanes[0]) > 1e-6 || Math.abs(DUCK.kiosk[1] - (lane0 + 5.4)) > 1e-6) throw new Error('DUCK in casinoPlan.js does not match the checker\'s derby');
  const g = merge(
    prizeAt(PRIZE.wallX, [0, PRIZE.z], 'W'),
    plinko(PLK.wallZ, PLK.x),
    claw(WING.z1, CLAW.x),
    classic(CLASSIC.wallZ, [CLASSIC.xs.reduce((a, b) => a + b) / CLASSIC.xs.length, 0], 'N'),
    blackjack(BJ.x, BJ.z, BJ.yaw),
    eDuck,
    { items: [prop('Chip bar', C_(0, CZ, 4.7), 4.2, 'new', { free: true }), prop('Roped lounge (W)', R(-54.4, -49.2, WING.z0, WING.z0 + 3.2), 1.1, 'new'), prop('Roped lounge (E)', R(49.6, 55, WING.z0, WING.z0 + 5.6), 1.1, 'new')], stations: [], corridors: [] },
  );
  const piers = [];
  for (const a of [45, 135, 225, 315]) piers.push(prop('Rotunda pier', C_(Math.cos((a * Math.PI) / 180) * 13, CZ + Math.sin((a * Math.PI) / 180) * 13, 1.0), 14, 'struct', { struct: true }));
  return {
    name: 'B: The Crater Cross', file: 'casino-layout-b.svg',
    floor, doors: [{ x: 0, z: HALL.FRONT, w: HALL.DOOR * 2 }], ...g, items: [...g.items, ...piers],
    overhead: [['chandelier', 0, 6], ['dome', 0, CZ, 14], ['chandelier', -32, -13], ['chandelier', 33, -13], ['sign', 0, 8, 12, 2.5]],
    walls: 'union', planWalls: true,
    outside: [
      prop('Porte-cochere', R(-10, 10, 16.4, 23.6), 11, 'new'), prop('Slot carousel W', C_(-19.5, 40, 7.6), 10, 'ext'), prop('Slot carousel E', C_(19.5, 40, 7.6), 10, 'ext'),
      prop('Giant die (W court)', C_(-34, 7, 4.8), 14, 'ext'), prop('Roulette wheel (E court)', R(29, 39, 6, 8), 22, 'ext'),
      prop('Court pool W', R(-24, -14, 2.5, 10.5), 0.2, 'new'), prop('Court pool E', R(14, 24, 2.5, 10.5), 0.2, 'new'),
    ],
    note: 'Footprint: a crossing with four rounded corners (r 16.5), foyer and Plinko arm 18 wide, wings 22 x 45; about 3,090 m2 inside (the current hall is 2,200).',
  };
})();

// ---------- the checks ----------
function check(L) {
  const bad = [], tight = [];
  const all = L.items;
  for (const it of all) {
    if (!onFloorShape(L, it.s)) bad.push(`${it.id}: not on the floor`);
    if (it.free && !onFloorShape(L, it.s, AISLE)) bad.push(`${it.id}: free-standing but under ${AISLE} m from a wall`);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.struct && b.struct) continue;
    const d = dist(a.s, b.s);
    const same = (a.grp && a.grp === b.grp) || (a.id === b.id);
    if (d < 0 && !same) bad.push(`${a.id} overlaps ${b.id}`);
    else if (d < (a.struct || b.struct ? 1.2 : AISLE) && !same) bad.push(`${a.id} to ${b.id}: ${d.toFixed(2)} m (needs ${a.struct || b.struct ? 1.2 : AISLE})`);
    else if (!same && d < 12) tight.push([d, `${a.id} / ${b.id}${a.struct || b.struct ? ' (pier)' : ''}`, !(a.struct || b.struct)]);
  }
  for (const st of L.stations) {
    if (!onFloorShape(L, st.s)) bad.push(`${st.of} station: spills off the floor`);
    for (const it of all) {
      if (it.id === st.of || (it.grp && all.find((x) => x.id === st.of).grp === it.grp)) continue;
      if (dist(st.s, it.s) < 0) bad.push(`${st.of} station reaches ${it.id}`);
    }
    for (const o of L.stations) if (o !== st && dist(st.s, o.s) < 0) bad.push(`${st.of} station overlaps ${o.of} station`);
  }
  for (const cr of L.corridors) {
    for (const it of all) {
      if (it.id === cr.of || it.h < cr.y - 0.7 || (it.grp && all.find((x) => x.id === cr.of).grp === it.grp)) continue;
      if (dist(cr.s, it.s) < 0) bad.push(`${cr.label}: ${it.id} (${it.h} m) stands in the lens's way`);
    }
    if (!onFloorShape(L, cr.s)) bad.push(`${cr.label}: runs off the floor`);
  }
  if (L.planWalls) {      // wall colliders (casinoPlan.js wallBoxes) must tile the outline band and leave floor and doors free
    const boxes = wallBoxes(), E = wallEdges();
    let blocked = 0, gaps = 0;
    for (let x = -60; x <= 60; x += 0.5) for (let z = -50; z <= 22; z += 0.5) {
      const hit = boxes.some((bx) => inBox(bx, x, z));
      if (hit && inHall(x, z, 0.05)) blocked++;                                   // collider on the floor
      if (hit && Math.abs(x) < HALL.DOOR - 0.3 && z > HALL.FRONT && z < HALL.FRONT + WALL) blocked++;   // or in the doors
    }
    for (const e of E) for (let f = 0.05; f <= 0.951; f += 0.1) for (const d of [0.15, WALL / 2, WALL - 0.15]) {
      const x = e.p[0] + (e.q[0] - e.p[0]) * f + e.nx * d, z = e.p[1] + (e.q[1] - e.p[1]) * f + e.nz * d;
      if (!boxes.some((bx) => inBox(bx, x, z, 0.02))) gaps++;                    // hole in the wall band
    }
    if (blocked) bad.push(`wall colliders stand on ${blocked} sampled points of the floor or the doors`);
    if (gaps) bad.push(`the wall colliders leave ${gaps} sampled points of the wall's band open`);
  }
  tight.sort((a, b) => a[0] - b[0]);
  return { bad, tight: tight.filter((t) => t[2]).slice(0, 4), piers: tight.filter((t) => !t[2]).slice(0, 2) };
}

// ---------- the drawing ----------
const S = 9, PAD = 36;
function draw(L) {
  const pts = [...L.floor.flatMap((s) => (s.k === 'r' ? [[s.x0, s.z0], [s.x1, s.z1]] : [[s.x - s.r, s.z - s.r], [s.x + s.r, s.z + s.r]])), ...L.outside.flatMap((o) => (o.s.k === 'r' ? [[o.s.x0, o.s.z0], [o.s.x1, o.s.z1]] : [[o.s.x - o.s.r, o.s.z - o.s.r], [o.s.x + o.s.r, o.s.z + o.s.r]]))];
  const x0 = Math.min(...pts.map((p) => p[0])) - WALL_T - 3, x1 = Math.max(...pts.map((p) => p[0])) + WALL_T + 3;
  const z0 = Math.min(...pts.map((p) => p[1])) - WALL_T - 3, z1 = Math.max(...pts.map((p) => p[1])) + WALL_T + 3;
  const W = (x1 - x0) * S + PAD * 2, H = (z1 - z0) * S + PAD * 2 + 44;
  const X = (x) => (x - x0) * S + PAD, Z = (z) => (z - z0) * S + PAD + 30;
  const shape = (s, attr) => (s.k === 'r' ? `<rect x="${X(s.x0)}" y="${Z(s.z0)}" width="${(s.x1 - s.x0) * S}" height="${(s.z1 - s.z0) * S}" ${attr}/>` : `<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="${s.r * S}" ${attr}/>`);
  const fills = { game: ['#f3d98a', '#8a5a00'], new: ['#c9a6ff', '#4a1f8a'], struct: ['#d9b03a', '#5a4000'], ext: ['#bfe0c8', '#2a6a4a'], canopy: ['#ffc2dd', '#a01a5a'] };
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`);
  o.push(`<rect width="${W}" height="${H}" fill="#f4f1ea"/>`);
  o.push(`<text x="${PAD}" y="24" font-size="17" font-weight="bold" fill="#2a1450">${L.name}</text>`);
  o.push(`<text x="${PAD + 300}" y="24" font-size="11" fill="#555">looking down: +x right, the doors at the bottom (+z); 10 m grid</text>`);
  for (let gx = Math.ceil(x0 / 10) * 10; gx <= x1; gx += 10) o.push(`<line x1="${X(gx)}" y1="${Z(z0)}" x2="${X(gx)}" y2="${Z(z1)}" stroke="#e1dccf" stroke-width="1"/>`);
  for (let gz = Math.ceil(z0 / 10) * 10; gz <= z1; gz += 10) o.push(`<line x1="${X(x0)}" y1="${Z(gz)}" x2="${X(x1)}" y2="${Z(gz)}" stroke="#e1dccf" stroke-width="1"/>`);
  for (const f of L.floor) o.push(shape(f, `fill="#3a1d63" stroke="#3a1d63" stroke-width="${WALL_T * 2 * S}" stroke-linejoin="miter"`));
  for (const f of L.floor) o.push(shape(f, 'fill="#fbf5e6"'));
  for (const d of L.doors) o.push(`<rect x="${X(d.x - d.w / 2)}" y="${Z(d.z) - WALL_T * S - 1}" width="${d.w * S}" height="${WALL_T * S + 2}" fill="#d7263d"/>`);
  for (const ov of L.overhead) {
    if (ov[0] === 'chandelier') o.push(`<circle cx="${X(ov[1])}" cy="${Z(ov[2])}" r="${1.5 * S}" fill="none" stroke="#b08a00" stroke-dasharray="3 3"/>`);
    else if (ov[0] === 'dome') o.push(`<circle cx="${X(ov[1])}" cy="${Z(ov[2])}" r="${ov[3] * S}" fill="none" stroke="#b08a00" stroke-dasharray="6 4" stroke-width="1.5"/>`);
    else if (ov[0] === 'sign') o.push(`<rect x="${X(ov[1] - ov[3] / 2)}" y="${Z(ov[2]) - 3}" width="${ov[3] * S}" height="6" fill="none" stroke="#b08a00" stroke-dasharray="3 3"/>`);
  }
  for (const cr of L.corridors) o.push(shape(cr.s, 'fill="#2ee6ff" fill-opacity="0.10" stroke="#1aa6c0" stroke-dasharray="2 4"'));
  for (const st of L.stations) o.push(shape(st.s, 'fill="#7dff6a" fill-opacity="0.18" stroke="#2f9a1f" stroke-dasharray="4 3"'));
  const label = (it, s) => {
    const cx = s.k === 'c' ? s.x : (s.x0 + s.x1) / 2, cz = s.k === 'c' ? s.z : (s.z0 + s.z1) / 2;
    const w = s.k === 'c' ? s.r * 2 : s.x1 - s.x0;
    const size = Math.max(7, Math.min(10.5, (w * S) / (it.id.length * 0.55)));
    return `<text x="${X(cx)}" y="${Z(cz) + 3}" font-size="${size}" text-anchor="middle" fill="#1a1030">${it.id}</text>`;
  };
  for (const it of [...L.outside, ...L.items]) {
    const [f, s] = fills[it.cls] || fills.game;
    o.push(shape(it.s, `fill="${f}" stroke="${s}" stroke-width="${it.struct ? 1 : 1.5}"`));
    if (!it.struct) o.push(label(it, it.s));
  }
  o.push(`<g font-size="10" fill="#333"><rect x="${PAD}" y="${H - 26}" width="12" height="10" fill="#f3d98a" stroke="#8a5a00"/><text x="${PAD + 16}" y="${H - 17}">game / existing model</text>`
    + `<rect x="${PAD + 150}" y="${H - 26}" width="12" height="10" fill="#c9a6ff" stroke="#4a1f8a"/><text x="${PAD + 166}" y="${H - 17}">new model</text>`
    + `<rect x="${PAD + 240}" y="${H - 26}" width="12" height="10" fill="#d9b03a" stroke="#5a4000"/><text x="${PAD + 256}" y="${H - 17}">pier / column</text>`
    + `<rect x="${PAD + 340}" y="${H - 26}" width="12" height="10" fill="#7dff6a" fill-opacity="0.4" stroke="#2f9a1f" stroke-dasharray="3 2"/><text x="${PAD + 356}" y="${H - 17}">trigger zone</text>`
    + `<rect x="${PAD + 440}" y="${H - 26}" width="12" height="10" fill="#2ee6ff" fill-opacity="0.25" stroke="#1aa6c0" stroke-dasharray="2 3"/><text x="${PAD + 456}" y="${H - 17}">seated lens corridor</text>`
    + `<text x="${PAD + 590}" y="${H - 17}">dashed circles / bars: chandeliers, dome, hung sign</text></g>`);
  o.push('</svg>');
  return o.join('\n');
}

// ---------- run ----------
let failed = 0;
for (const L of [current, nave, cross]) {
  const r = check(L);
  let area = 0; for (let x = -70; x < 70; x += 0.25) for (let z = -60; z < 30; z += 0.25) if (onFloor(L, x + 0.125, z + 0.125)) area += 0.0625;
  console.log(`\n${L.name}: ${L.items.length} footprints, ${L.stations.length} trigger zones, ${L.corridors.length} lens corridors; floor ${Math.round(area)} m2`);
  console.log(`  ${L.note}`);
  console.log(r.bad.length ? r.bad.map((b) => '  PROBLEM  ' + b).join('\n') : '  clear: every check holds');
  console.log('  tightest gaps: ' + r.tight.map(([d, n]) => `${n} ${d.toFixed(1)} m`).join(' · '));
  if (r.piers.length) console.log('  nearest piers: ' + r.piers.map(([d, n]) => `${n} ${d.toFixed(1)} m`).join(' · '));
  if (r.bad.length && L !== current) failed++;
}
if (process.argv[2] === 'docs') for (const L of [current, nave, cross]) { writeFileSync(new URL(`../docs/${L.file}`, import.meta.url), draw(L)); console.log('wrote docs/' + L.file); }
if (failed && process.argv[2] !== 'docs') process.exitCode = 1;
if (process.argv[2] === 'dump') {
  const f = (s) => (s.k === 'r' ? `x ${s.x0.toFixed(1)}..${s.x1.toFixed(1)}, z ${s.z0.toFixed(1)}..${s.z1.toFixed(1)}` : `centre (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) r ${s.r}`);
  for (const L of [nave, cross]) { console.log('\n== ' + L.name); for (const it of L.items.filter((i) => !i.struct)) console.log(`${it.id.padEnd(18)} ${f(it.s)}  h ${it.h}`); for (const st of L.stations) console.log(`  station ${st.of.padEnd(16)} ${f(st.s)}`); for (const c of L.corridors) console.log(`  lens ${c.label.padEnd(18)} ${f(c.s)} y ${c.y}`); }
}
if (process.argv[2] === 'json') {
  const pick = (L) => ({ name: L.name, floor: L.floor, doors: L.doors, items: L.items.map(({ id, s, h, cls, struct, grp }) => ({ id, s, h, cls, struct: !!struct, grp })), stations: L.stations.map(({ of, s }) => ({ of, s })), corridors: L.corridors.map(({ of, s, y, label }) => ({ of, s, y, label })), outside: L.outside.map(({ id, s, cls }) => ({ id, s, cls })), note: L.note });
  console.log(JSON.stringify({ current: pick(current), a: pick(nave), b: pick(cross) }));
}
