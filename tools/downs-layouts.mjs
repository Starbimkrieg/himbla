// Chimera Downs layout study (docs/downs-layouts.md): the course as it is today and two proposals for the overhaul, as plans in the
// Downs' own frame (metres, +x right, +z DOWN the page: the plans are drawn looking down, the main grandstand at the bottom). Dev-only,
// not part of the build.
//   node tools/downs-layouts.mjs          checks both proposals and prints the tightest gaps
//   node tools/downs-layouts.mjs docs     also draws docs/downs-layout-{current,a,b}.svg
// The racing oval is NOT moved by either proposal (race lengths, lanes and the finish line stay as race.js has them); everything else is.
// What is checked:
//   - every solid footprint lies inside the plateau (RMAX from the origin)
//   - 'in' footprints sit inside the infield, 'out' ones outside the outer rail, each with a margin (rail-side things 1.5 m, the rest 2.5 m)
//   - two solid footprints of different groups keep GAP between them (a group is a thing built as one: a stand and its stairs, an arcade and its stalls)
import { writeFileSync } from 'node:fs';

const GAP = 2.4;
const RMAX = 272;                 // proposed plateau r 280, less 8 m of margin for the plateau's blend ring
const HALF = 90, R_IN = 45, R_OUT = 64.4, LANE_IN = 44.6, LANE_OUT = 64.8; // race.js: STRAIGHT/2, RAIL_IN, RAIL_OUT, dirt from 44.6 to 64.8
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const PAL = { gold: '#cfb352', saddle: '#b07c57', black: '#3b393a', money: '#7b9a6e', barn: '#8b4044', mint: '#f8fff8' };

// ---------- shapes ----------
const R = (x0, x1, z0, z1) => ({ k: 'r', x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
const C = (x, z, r) => ({ k: 'c', x, z, r });
const E = (x, z, rx, rz) => ({ k: 'e', x, z, rx, rz });
const A = (x, z, r0, r1, a0, a1) => ({ k: 'a', x, z, r0, r1, a0, a1 });     // an annular band, angles in degrees (x = cx + r cos a, z = cz + r sin a)
const stad = (x, z) => Math.hypot(Math.max(Math.abs(x) - HALF, 0), z);      // distance from the oval's centre line (the track is 44.6 to 64.8 of it)
const inside = (s, x, z) => {
  if (s.k === 'r') return x >= s.x0 - 1e-6 && x <= s.x1 + 1e-6 && z >= s.z0 - 1e-6 && z <= s.z1 + 1e-6;
  if (s.k === 'c') return Math.hypot(x - s.x, z - s.z) <= s.r + 1e-6;
  if (s.k === 'e') return ((x - s.x) / s.rx) ** 2 + ((z - s.z) / s.rz) ** 2 <= 1 + 1e-6;
  const r = Math.hypot(x - s.x, z - s.z);
  if (r < s.r0 - 1e-6 || r > s.r1 + 1e-6) return false;
  let a = Math.atan2(z - s.z, x - s.x) / D2R; while (a < s.a0 - 1e-6) a += 360; return a <= s.a1 + 1e-6;
};
const boundary = (s) => {
  const out = [];
  if (s.k === 'r') { for (let t = 0; t <= 1.0001; t += 1 / 40) out.push([s.x0 + (s.x1 - s.x0) * t, s.z0], [s.x0 + (s.x1 - s.x0) * t, s.z1], [s.x0, s.z0 + (s.z1 - s.z0) * t], [s.x1, s.z0 + (s.z1 - s.z0) * t]); }
  else if (s.k === 'c') { for (let i = 0; i < 72; i++) out.push([s.x + Math.cos((i / 72) * TAU) * s.r, s.z + Math.sin((i / 72) * TAU) * s.r]); }
  else if (s.k === 'e') { for (let i = 0; i < 72; i++) out.push([s.x + Math.cos((i / 72) * TAU) * s.rx, s.z + Math.sin((i / 72) * TAU) * s.rz]); }
  else {
    const n = Math.max(12, Math.ceil(s.a1 - s.a0)), m = 6;
    for (let i = 0; i <= n; i++) { const a = (s.a0 + ((s.a1 - s.a0) * i) / n) * D2R; for (const r of [s.r0, s.r1]) out.push([s.x + Math.cos(a) * r, s.z + Math.sin(a) * r]); }
    for (const a of [s.a0, s.a1]) for (let j = 0; j <= m; j++) { const r = s.r0 + ((s.r1 - s.r0) * j) / m; out.push([s.x + Math.cos(a * D2R) * r, s.z + Math.sin(a * D2R) * r]); }
  }
  return out;
};
const distTo = (s, x, z) => {          // 0 when inside; otherwise (about) the distance to the shape
  if (inside(s, x, z)) return 0;
  if (s.k === 'r') return Math.hypot(x - Math.max(s.x0, Math.min(x, s.x1)), z - Math.max(s.z0, Math.min(z, s.z1)));
  if (s.k === 'c') return Math.hypot(x - s.x, z - s.z) - s.r;
  let best = 1e9;
  for (const [bx, bz] of boundary(s)) best = Math.min(best, Math.hypot(x - bx, z - bz));
  return best;
};
const gap = (a, b) => {                // negative when they overlap
  let g = 1e9;
  for (const [x, z] of boundary(a)) { const d = distTo(b, x, z); if (d === 0) return -1; g = Math.min(g, d); }
  for (const [x, z] of boundary(b)) { const d = distTo(a, x, z); if (d === 0) return -1; g = Math.min(g, d); }
  return g;
};

// ---------- element helpers ----------
// cls: 'solid' (checked), 'free' (paving, lawn, queues: drawn, never blocks), 'over' (a screen or deck overhead: drawn dashed, not checked)
const el = (id, label, s, o = {}) => ({ id, label, s, cls: 'solid', fill: PAL.mint, line: PAL.gold, zone: 'any', margin: 2.5, ...o });
const free = (id, s, o = {}) => el(id, '', s, { cls: 'free', fill: PAL.saddle, op: 0.35, line: PAL.saddle, ...o });
const over = (id, label, s, o = {}) => el(id, label, s, { cls: 'over', fill: PAL.black, line: PAL.mint, op: 0.55, ...o });
const stall = (id, s, o = {}) => el(id, '', s, { fill: PAL.barn, line: PAL.mint, ...o });
const mirrorX = (s) => (s.k === 'r' ? R(-s.x1, -s.x0, s.z0, s.z1) : s.k === 'c' ? C(-s.x, s.z, s.r) : s.k === 'e' ? E(-s.x, s.z, s.rx, s.z) : A(-s.x, s.z, s.r0, s.r1, 180 - s.a1, 180 - s.a0));

// ---------- the course as it is today (race.js; drawn for comparison, not checked) ----------
const current = {
  name: 'Today', sub: 'one stand, one back stand, the concourse and the stalls behind the stand',
  note: [[0, 118, 'CONCESSIONS BEHIND THE STAND'], [20, -22, 'jumbotron 25 x 12.5'], [-40, 22, 'golden statue'], [30, 34, "winner's circle"], [-176, 14, 'way in'], [-118, 70, 'race office'], [0, 86, 'GRANDSTAND (11 tiers)'], [0, -78, 'back stand (5 tiers)']],
  plateau: 215,
  els: [
    el('stand', '', R(-96, 96, 70.5, 100.5), {}),
    el('back', '', R(-61, 61, -83.5, -70.5), {}),
    free('conc', R(-120, 120, 101.2, 140), { fill: '#8f8a9a' }),
    ...[0, 1, 2, 3, 4, 5].map((i) => stall(`s${i}`, R(-85 + i * 34 - 4.2, -85 + i * 34 + 4.2, 130, 137))),
    el('office', '', R(-127, -109, 76, 88), { fill: PAL.mint }),
    over('screen', '', R(-14.7, 14.7, -15.4, -14.2)),
    el('circle', '', C(30, 26, 6.4), { fill: PAL.gold, line: PAL.mint }),
    el('plinth', '', C(-40, 8, 3.5), { fill: PAL.gold, line: PAL.mint }),
    el('arch', '', R(-178.5, -173.5, -10.5, 10.5), {}),
  ],
};

// ---------- the parts both proposals share ----------
// The stands: the front moves back 5.5 m (an 11.6 m apron for the photo-finish tower, the bridge landings and the camera crews), the main stand grows
// to 14 tiers and 228 m, the far stand to 8 tiers and 184 m; both roofed. The clubhouse tower stands behind the main stand's centre.
const shared = () => [
  el('stand', 'MAIN GRANDSTAND', R(-114, 114, 76, 115), { zone: 'out', g: 'stands' }),
  el('far', 'FAR TURN STAND', R(-92, 92, -97, -76), { zone: 'out', g: 'stands' }),
  el('photo', '', R(43, 49, 67.2, 73), { zone: 'out', margin: 1.5, fill: PAL.gold, line: PAL.black }),
];

// ---------- Layout A: The Midway ----------
const stallsA = () => {
  const xs = [-109, -97, -85, -73, -47, -35, -23, -11], out = [];
  for (const x of xs) for (const s of [-1, 1]) out.push(stall(`m${x}${s}`, s > 0 ? R(x - 5, x + 5, 10, 18) : R(x - 5, x + 5, -18, -10), { zone: 'in', g: 'midway' }));
  for (const s of [-1, 1]) for (const x of [-69.8, -50.2]) out.push(stall(`k${x}${s}`, s > 0 ? R(x - 2.2, x + 2.2, 22, 27) : R(x - 2.2, x + 2.2, -27, -22), { zone: 'in', g: 'midway' }));
  return out;
};
const layoutA = {
  name: 'A: The Midway', sub: 'the infield becomes the show: stalls line a promenade between the two stands, the screen and the podiums at its heart',
  plateau: 280,
  note: [
    [-65, 0, 'THE MIDWAY (20 stalls)'], [30, 0, ''], [30, 34, "WINNERS' PLAZA"], [30, -34, ''], [-195, 0, 'WEST GATE BOULEVARD'], [-198, 26, 'TOTE HALL'], [-198, -26, 'STABLES'],
    [0, 92, 'MAIN GRANDSTAND'], [0, -85, 'FAR TURN STAND'], [0, 125, 'CLUBHOUSE'], [0, 160, "MEMBERS' PLAZA"], [92, 0, 'PARADE RING'], [88, 29, 'saddling'],
    [152, -135, 'FAIRGROUND ANNEX'], [30, -9.5, 'TWIN SCREEN 48 x 22.5'], [175, -141, 'ferris wheel'], [122, -129, 'carousel'], [-60, 52, 'S bridge'], [-60, -52, 'N bridge'], [-145, -9, 'W bridge'], [145, -9, 'E bridge'],
  ],
  els: [
    ...shared(),
    el('club', '', R(-22, 22, 115, 137), { zone: 'out', g: 'stands' }),
    free('plaza', R(-70, 70, 139, 178), { zone: 'out' }),
    el('gateS', '', R(-10, 10, 178, 181), { zone: 'out' }),
    // the west end: gate, boulevard, tote hall and stables, then the bridge over the turn
    el('gateW', '', R(-232, -226, -11, 11), { zone: 'out' }),
    free('blvd', R(-226, -174, -10, 10)),
    el('tote', '', R(-216, -180, 14, 38), { zone: 'out' }),
    el('stables', '', R(-216, -180, -38, -14), { zone: 'out' }),
    el('wst1', '', R(-174, -162, -5, 5), { zone: 'out', g: 'wb' }), over('wdeck', '', R(-162, -128, -5, 5), { g: 'wb' }), el('wst2', '', R(-128, -116, -5, 5), { zone: 'in', g: 'wb' }),
    el('est2', '', R(116, 128, -5, 5), { zone: 'in', g: 'eb' }), over('edeck', '', R(128, 162, -5, 5), { g: 'eb' }), el('est1', '', R(162, 174, -5, 5), { zone: 'out', g: 'eb' }),
    // the cross-street: a bridge from each stand, straight over the track, down into the Midway
    over('sdeck', '', R(-64, -56, 38, 66), { g: 'sb' }), el('sst0', '', R(-64, -56, 28, 38), { zone: 'in', g: 'sb' }),
    el('sst1', '', R(-86, -64, 66.8, 70.4), { zone: 'out', margin: 1.5, g: 'sb' }), el('sst2', '', R(-56, -34, 66.8, 70.4), { zone: 'out', margin: 1.5, g: 'sb' }),
    over('ndeck', '', R(-64, -56, -66, -38), { g: 'nb' }), el('nst0', '', R(-64, -56, -38, -28), { zone: 'in', g: 'nb' }),
    el('nst1', '', R(-86, -64, -70.4, -66.8), { zone: 'out', margin: 1.5, g: 'nb' }), el('nst2', '', R(-56, -34, -70.4, -66.8), { zone: 'out', margin: 1.5, g: 'nb' }),
    // the Midway: a promenade down the infield with a row of stalls each side, picnic lawns behind them
    free('prom', R(-126, -4, -10, 10), { fill: PAL.gold }),
    free('lawnS', R(-110, -6, 22, 36), { fill: PAL.money, line: PAL.money }), free('lawnN', R(-110, -6, -36, -22), { fill: PAL.money, line: PAL.money }),
    ...stallsA(),
    // the heart: twin-faced screen on two pylons straddling the promenade, a podium set at the foot of each face
    free('wplaza', E(30, 0, 32, 31), { fill: PAL.gold, op: 0.28, line: PAL.gold }),
    el('pyl1', '', R(6, 10, -3, 3), { zone: 'in', g: 'screen', fill: PAL.black, line: PAL.mint }), el('pyl2', '', R(50, 54, -3, 3), { zone: 'in', g: 'screen', fill: PAL.black, line: PAL.mint }),
    over('screen', 'SCREEN 48 x 22.5 (two faces)', R(6, 54, -2.4, 2.4), { g: 'screen' }),
    el('podS', '', R(20, 40, 15, 21), { zone: 'in', fill: PAL.gold, line: PAL.black }), el('podN', '', R(20, 40, -21, -15), { zone: 'in', fill: PAL.gold, line: PAL.black }),
    // the paddock end of the axis
    el('ring', '', E(92, 0, 20, 16), { zone: 'in', fill: PAL.money, line: PAL.mint }), el('pavil', '', R(80, 96, 24, 34), { zone: 'in' }),
    // the fairground annex, offset to the north-east behind the far stand's east end
    free('annex', R(100, 204, -168, -100), { fill: PAL.money, op: 0.3, line: PAL.money }),
    el('wheel', 'FERRIS WHEEL', R(150, 200, -160, -148), { zone: 'out', fill: PAL.gold, line: PAL.black }), el('carou', 'CAROUSEL', C(122, -146, 11), { zone: 'out', fill: PAL.barn, line: PAL.gold }),
    el('ticket', '', R(140, 162, -118, -108), { zone: 'out' }), stall('fk1', R(104, 112, -124, -116), { zone: 'out' }), stall('fk2', R(190, 198, -124, -116), { zone: 'out' }),
    el('gateF', '', R(146, 156, -101, -98), { zone: 'out' }),
  ],
  paths: [[[174, 0], [196, -44], [172, -96], [151, -99]]],
};

// ---------- Layout B: The Horseshoe ----------
const arcStalls = () => {
  const west = [118, 131, 144, 157, 170, 190, 203, 216, 229, 242], out = [];
  for (const a of west) {
    const w = A(-90, 0, 92, 100, a - 2.7, a + 2.7);
    out.push(stall(`w${a}`, w, { zone: 'out', g: 'arc' }), stall(`e${a}`, mirrorX(w), { zone: 'out', g: 'arc' }));
  }
  return out;
};
const layoutB = {
  name: 'B: The Horseshoe', sub: 'the stands joined by two colonnaded arcades round the turns, stalls in the arcades; a calm infield with the screen drum and a podium row',
  plateau: 280,
  note: [
    [-176, -20, 'WEST ARCADE (10 stalls)'], [176, -20, 'EAST ARCADE (10 stalls)'], [0, 94, 'MAIN GRANDSTAND'], [0, -86, 'FAR TURN STAND'], [0, 128, 'CLUBHOUSE + TOTE HALL'], [0, 167, 'GRAND FORECOURT'],
    [0, 33, 'PODIUM ROW (3 sets)'], [-96, 0, 'PARADE RING'], [100, 18, 'INFIELD LAWN'], [0, -122, 'CHIMERA STABLES'], [165, 100, 'FAIRGROUND ANNEX'], [0, -10, 'SCREEN DRUM'], [175, 146, 'ferris wheel'], [142, 152, 'carousel'], [-204, 0, 'WEST GATE'], [196, 0, 'EAST GATE'],
    [70, 40, 'crossing'], [-70, 40, 'crossing'],
  ],
  els: [
    ...shared(),
    el('club', '', R(-30, 30, 115, 142), { zone: 'out', g: 'stands' }),
    free('forecourt', R(-70, 70, 144, 190), { zone: 'out' }),
    el('gateS', '', R(-14, 14, 191, 195), { zone: 'out' }),
    // the horseshoe: an arcade round each turn, joined to both stands, with a gate hall at its centre
    free('arcW', A(-90, 0, 84, 100, 105, 270), { fill: PAL.mint, op: 0.3, line: PAL.gold, g: 'arc' }), free('arcE', mirrorX(A(-90, 0, 84, 100, 105, 270)), { fill: PAL.mint, op: 0.3, line: PAL.gold, g: 'arc' }),
    el('hallW', '', A(-90, 0, 82, 104, 172, 188), { zone: 'out', g: 'arc' }), el('hallE', '', mirrorX(A(-90, 0, 82, 104, 172, 188)), { zone: 'out', g: 'arc' }),
    ...arcStalls(),
    // the infield: the screen drum on one core, a row of three podium sets, the parade ring, a lawn
    over('drum', 'SCREEN DRUM 40 x 20 + 14 x 20 ends', R(-20, 20, -7, 7), { g: 'drum' }), el('core', '', R(-5, 5, -5, 5), { zone: 'in', fill: PAL.black, line: PAL.mint, g: 'drum' }),
    ...[-30, 0, 30].map((x) => el(`pod${x}`, '', R(x - 9, x + 9, 16, 21), { zone: 'in', fill: PAL.gold, line: PAL.black })),
    free('winplaza', R(-44, 44, 10, 28), { fill: PAL.gold, op: 0.25, line: PAL.gold }),
    el('ring', '', E(-96, 0, 26, 18), { zone: 'in', fill: PAL.money, line: PAL.mint }), el('weigh', '', R(-65.2, -52, -9.2, 9.2), { zone: 'in' }),
    free('lawn', C(100, 0, 28), { fill: PAL.money, op: 0.4, line: PAL.money }),
    // at-grade crossings with barrier arms, four of them
    ...[[-70, 1], [70, 1], [-70, -1], [70, -1]].map(([x, s]) => free(`x${x}${s}`, R(x - 4, x + 4, s > 0 ? LANE_IN : -LANE_OUT, s > 0 ? LANE_OUT : -LANE_IN), { fill: PAL.mint, op: 0.5, line: PAL.mint })),
    // stables behind the far stand
    ...[[-36, -135.2, -123.6], [36, -135.2, -123.6], [-36, -116.4, -104.8], [36, -116.4, -104.8]].map(([x, z0, z1], i) => el(`stable${i}`, '', R(x - 15.3, x + 15.3, z0, z1), { zone: 'out' })),
    el('barn', '', R(-12.2, 12.2, -140.2, -126), { zone: 'out' }),
    // the fairground annex, offset to the south-east behind the main stand's east end
    free('annex', R(124, 206, 106, 168), { fill: PAL.money, op: 0.3, line: PAL.money }),
    el('wheel', 'FERRIS WHEEL', R(150, 200, 150, 162), { zone: 'out', fill: PAL.gold, line: PAL.black }), el('carou', 'CAROUSEL', C(142, 134, 10.5), { zone: 'out', fill: PAL.barn, line: PAL.gold }),
    el('ticket', '', R(160, 182, 110, 118), { zone: 'out' }), stall('fk1', R(165.6, 174.4, 125.8, 134), { zone: 'out' }), stall('fk2', R(189.6, 198.4, 125.8, 134), { zone: 'out' }),
    el('gateF', '', R(123, 125, 133, 145), { zone: 'out' }),
  ],
  paths: [[[70, 160], [100, 150], [122, 140]]],
};

// ---------- checks ----------
function check(L) {
  const solid = L.els.filter((e) => e.cls === 'solid');
  const bad = [], pairs = [];
  let far = 0;
  for (const e of solid) {
    const pts = boundary(e.s);
    for (const [x, z] of pts) {
      far = Math.max(far, Math.hypot(x, z));
      if (Math.hypot(x, z) > RMAX) { bad.push(`${e.id}: outside the plateau (r ${Math.hypot(x, z).toFixed(0)})`); break; }
    }
    for (const [x, z] of pts) {
      const d = stad(x, z);
      if (e.zone === 'in' && d > LANE_IN - e.margin + 1e-6) { bad.push(`${e.id}: leaves the infield (${(d).toFixed(1)} from the centre line, limit ${(LANE_IN - e.margin).toFixed(1)})`); break; }
      if (e.zone === 'out' && d < LANE_OUT + e.margin - 1e-6) { bad.push(`${e.id}: too near the track (${d.toFixed(1)}, need ${(LANE_OUT + e.margin).toFixed(1)})`); break; }
    }
  }
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    if (a.g && a.g === b.g) continue;
    const g = gap(a.s, b.s);
    if (g < GAP) bad.push(`${a.id} / ${b.id}: ${g < 0 ? 'overlap' : `gap ${g.toFixed(1)}`}`);
    if (g >= 0 && g < 12) pairs.push([g, a.id, b.id]);
  }
  pairs.sort((p, q) => p[0] - q[0]);
  return { bad, far, tight: pairs.slice(0, 6), solids: solid.length, stalls: solid.filter((e) => e.fill === PAL.barn && e.id.match(/^[mkwe]/)).length };
}

// ---------- drawing ----------
const S = 1.7, X0 = -250, X1 = 250, Z0 = -190, Z1 = 206, PAD = 12, HEAD = 40;
const W = Math.round((X1 - X0) * S + PAD * 2), H = Math.round((Z1 - Z0) * S + PAD * 2 + HEAD);
const px = (x) => ((x - X0) * S + PAD).toFixed(1), pz = (z) => ((z - Z0) * S + PAD + HEAD).toFixed(1);
const sc = (v) => (v * S).toFixed(1);
const stadium = (r) => `M ${px(-HALF)} ${pz(-r)} L ${px(HALF)} ${pz(-r)} A ${sc(r)} ${sc(r)} 0 0 1 ${px(HALF)} ${pz(r)} L ${px(-HALF)} ${pz(r)} A ${sc(r)} ${sc(r)} 0 0 1 ${px(-HALF)} ${pz(-r)} Z`;
const P = (s, r, a) => [s.x + Math.cos(a * D2R) * r, s.z + Math.sin(a * D2R) * r];
function shapeSvg(e, f) {
  const s = e.s, a = `fill="${e.fill}" fill-opacity="${e.op ?? 0.85}" stroke="${e.line}" stroke-width="${e.cls === 'over' ? 1.2 : 0.8}"${e.cls === 'over' ? ' stroke-dasharray="4 3"' : ''}`;
  if (s.k === 'r') return `<rect x="${px(s.x0)}" y="${pz(s.z0)}" width="${sc(s.x1 - s.x0)}" height="${sc(s.z1 - s.z0)}" ${a}/>`;
  if (s.k === 'c') return `<circle cx="${px(s.x)}" cy="${pz(s.z)}" r="${sc(s.r)}" ${a}/>`;
  if (s.k === 'e') return `<ellipse cx="${px(s.x)}" cy="${pz(s.z)}" rx="${sc(s.rx)}" ry="${sc(s.rz)}" ${a}/>`;
  const [ox0, oz0] = P(s, s.r1, s.a0), [ox1, oz1] = P(s, s.r1, s.a1), [ix1, iz1] = P(s, s.r0, s.a1), [ix0, iz0] = P(s, s.r0, s.a0);
  const big = s.a1 - s.a0 > 180 ? 1 : 0;
  return `<path d="M ${px(ox0)} ${pz(oz0)} A ${sc(s.r1)} ${sc(s.r1)} 0 ${big} 1 ${px(ox1)} ${pz(oz1)} L ${px(ix1)} ${pz(iz1)} A ${sc(s.r0)} ${sc(s.r0)} 0 ${big} 0 ${px(ix0)} ${pz(iz0)} Z" ${a}/>`;
}
function svg(L, key) {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${L.name}: plan of Chimera Downs, ${L.sub}">`);
  out.push(`<style>text{font:9px ui-monospace,Menlo,monospace;fill:#f8fff8}.t{font-size:14px;font-weight:bold}.k{fill:#cfb352;font-size:10px}.n{fill:#f8fff8;font-size:9px}</style>`);
  out.push(`<rect width="${W}" height="${H}" fill="#242326"/>`);
  out.push(`<text x="${PAD}" y="19" class="t">${L.name}</text><text x="${PAD}" y="33" class="k">${L.sub}</text>`);
  out.push(`<circle cx="${px(0)}" cy="${pz(0)}" r="${sc(L.plateau)}" fill="none" stroke="#7b9a6e" stroke-width="1" stroke-dasharray="7 5"/>`);
  out.push(`<text x="${px(0)}" y="${pz(-L.plateau) - -10}" text-anchor="middle" class="k">plateau r ${L.plateau}${key ? ' (proposed; today 215)' : ''}</text>`);
  // the oval: turf infield, dirt band, rails, finish line
  out.push(`<path d="${stadium(LANE_IN)}" fill="${PAL.money}" fill-opacity="0.55"/>`);
  out.push(`<path d="${stadium((LANE_IN + LANE_OUT) / 2)}" fill="none" stroke="${PAL.saddle}" stroke-width="${sc(LANE_OUT - LANE_IN)}"/>`);
  out.push(`<path d="${stadium(R_IN)}" fill="none" stroke="${PAL.mint}" stroke-width="0.8"/><path d="${stadium(R_OUT)}" fill="none" stroke="${PAL.mint}" stroke-width="0.8"/>`);
  out.push(`<rect x="${px(44.5)}" y="${pz(LANE_IN)}" width="${sc(1)}" height="${sc(LANE_OUT - LANE_IN)}" fill="${PAL.mint}"/><text x="${px(43.5)}" y="${pz(54.7)}" text-anchor="end" class="n">finish</text>`);
  for (const p of L.paths || []) out.push(`<polyline points="${p.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="none" stroke="${PAL.gold}" stroke-width="3" stroke-dasharray="5 4" stroke-opacity="0.7"/>`);
  for (const e of L.els.filter((e) => e.cls !== 'solid')) out.push(shapeSvg(e));
  for (const e of L.els.filter((e) => e.cls === 'solid')) out.push(shapeSvg(e));
  for (const [x, z, t] of L.note || []) if (t) out.push(`<text x="${px(x)}" y="${pz(z)}" text-anchor="middle" class="n" style="paint-order:stroke;stroke:#242326;stroke-width:3px">${t}</text>`);
  out.push('</svg>');
  return out.join('\n');
}

// ---------- main ----------
let failed = 0;
for (const [key, L] of [['a', layoutA], ['b', layoutB]]) {
  const r = check(L);
  console.log(`\n${L.name}: ${r.solids} solid footprints, ${r.stalls} stalls, farthest point r ${r.far.toFixed(0)} (limit ${RMAX})`);
  for (const [g, a, b] of r.tight) console.log(`  gap ${g.toFixed(1)} m  ${a} / ${b}`);
  for (const b of r.bad) { console.log(`  PROBLEM: ${b}`); failed++; }
}
if (process.argv[2] === 'docs') {
  writeFileSync(new URL('../docs/downs-layout-current.svg', import.meta.url), svg(current, false));
  writeFileSync(new URL('../docs/downs-layout-a.svg', import.meta.url), svg(layoutA, true));
  writeFileSync(new URL('../docs/downs-layout-b.svg', import.meta.url), svg(layoutB, true));
  console.log('\nwrote docs/downs-layout-{current,a,b}.svg');
}
process.exit(failed ? 1 : 0);
