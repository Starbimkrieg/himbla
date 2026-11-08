// ILMB layout study (docs/ilmb-layouts.md): the base's quarters, roads and pads as footprints in the hub's frame (metres,
// +x right, +z up the plan: the side the Crown's main atrium faces). The Crown, its six wings and their skywalks, the job
// board and the wall stay where they are in every layout; what moves is everything else.
//   node tools/ilmb-layouts.mjs          checks every layout (4 m between footprints, 3 m off road edges, pads' decks and
//                                        flight discs, inside the wall, the spawn spot clear)
//   node tools/ilmb-layouts.mjs docs     also writes the SVG plans there
import { writeFileSync } from 'node:fs';
import { LOOP_R, AVENUE, BUS_PADS, SHIP_PADS, ROCKET, QUARTERS } from '../src/ilmbLayout.js';

const TAU = Math.PI * 2, deg = (a) => (a * Math.PI) / 180;
const P = (aDeg, r) => [Math.cos(deg(aDeg)) * r, Math.sin(deg(aDeg)) * r];
const WALL_R = 248, WALL_IN = 245, RING = 312;          // build_ilmb.py WALL_R (inner face R - 3); ring road: loc.r 280 + RING_GAP 32
const GATES = [0, 90, 180, 270];                          // build_ilmb.py GATES
const GATE_HALF = 0.13;                                   // gate towers at gate +- this (rad), drums r 8.3 on WALL_R
const BASTIONS = [0, 1, 2, 3].flatMap((q) => [1 / 3, 2 / 3].map((f) => (q + f) * 90)); // drums r 8.4 on WALL_R + 3

// kinds: box {x,z,w,d,rot} (w along x before rot, rot counter-clockwise on the plan), circle {x,z,r}
const box = (id, x, z, w, d, o = {}) => ({ kind: 'box', id, x, z, w, d, rot: 0, ...o });
const circ = (id, x, z, r, o = {}) => ({ kind: 'circle', id, x, z, r, ...o });
// a box on the polar grid: centre at angle a (deg), radius r; w runs out from the centre, d along the circle
const rb = (id, a, r, w, d, o = {}) => { const [x, z] = P(a, r); return box(id, x, z, w, d, { rot: deg(a), ...o }); };
const rc = (id, a, r, rad, o = {}) => { const [x, z] = P(a, r); return circ(id, x, z, rad, o); };
// a straight road from (x0, z0) to (x1, z1), w wide (soft: nothing solid, but buildings keep 3 m off its edges)
const road = (id, x0, z0, x1, z1, w = 14, o = {}) => box(id, (x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0), w, { rot: Math.atan2(z1 - z0, x1 - x0), cls: 'road', soft: true, ...o });
const radialRoad = (id, a, r0, r1, w = 14) => road(id, ...P(a, r0), ...P(a, r1), w);
// pads (traffic.js addFlyer): deck radius and the flight disc nothing tall may stand in (clearR)
const busPad = (id, x, z) => circ(id, x, z, 14.2, { cls: 'pass', pad: true, clear: 15.7 });
const shipPad = (id, x, z) => circ(id, x, z, 21, { cls: 'freight', pad: true, clear: 31 });

// ---- what every layout keeps (locations.js ILMB_WINGS_AT, build_ilmb.py, the wings' .glb bounds) ----
// wing: angle (deg), distance, out (radial extent each side of the centre, from the model), across (half width), centre shift
const WINGS = [
  ['Hydroponics', 0.0, 116, 30.5, 28.5, 0], ['Meridian Labs', 0.62, 122, 25, 13, 5], ['Vostok Hangar', 2.2, 112, 34, 27, 11.5],
  ['Daedalus Relay', 3.8, 120, 17.5, 17, 0], ['Power Block', 4.5, 110, 16.5, 22, 0], ['Kepler Habitat', 5.2, 120, 27.5, 27.5, 0],
];
const SKYWALK_END = [93.2, 104.6, 91.6, 107.2, 98.6, 92.6]; // d - dock + 1.2 (build_ilmb.py WING_END)
const BOARD = [Math.cos(1.1) * 80, Math.sin(1.1) * 80];  // locations.js ILMB_BOARD
const fixed = () => [
  circ('the Crown', 0, 0, 53, { cls: 'core', fixed: true }),
  box('atrium + canopy', 0, 57.6, 24.8, 20, { cls: 'core', fixed: true, roadOk: true }),
  ...WINGS.map(([id, a, d, out, across, shift], i) => id === 'Kepler Habitat'
    ? circ(id, Math.cos(a) * d, Math.sin(a) * d, 27.5, { cls: 'wing', fixed: true })
    : box(id, Math.cos(a) * (d + shift), Math.sin(a) * (d + shift), out * 2, across * 2, { rot: a, cls: 'wing', fixed: true })),
  ...WINGS.map(([id, a], i) => box(`skywalk (${id})`, Math.cos(a) * (56 + SKYWALK_END[i]) / 2, Math.sin(a) * (56 + SKYWALK_END[i]) / 2, SKYWALK_END[i] - 56, 6.4, { rot: a, cls: 'skywalk', fixed: true })),
  box('job board', BOARD[0], BOARD[1], 20, 10, { rot: 1.1 - Math.PI / 2, cls: 'board', fixed: true }),
  circ('spawn (main.js: 0, 108)', 0, 108, 1.5, { cls: 'spawn', fixed: true, roadOk: true }),
];
// ILMB_GUNS today: one between each pair of wings
const GUNS_NOW = [[0.31, 119], [1.41, 123], [3.0, 100], [4.15, 115], [4.85, 115], [5.74, 140]];
const gun = (id, x, z) => circ(id, x, z, 3.5, { cls: 'gun' });
const gunsAt = (list) => list.map(([a, r], i) => gun(`inner gun ${i + 1}`, Math.cos(a) * r, Math.sin(a) * r));
const spokes = (r0 = WALL_IN - 14) => GATES.map((g) => radialRoad(`gate road ${g}°`, g, r0, RING, 14)); // (from the inner loop's edge, or the wall)

// ---------------- today ----------------
const current = {
  name: 'Today', caption: 'as built (world.js buildHub, ilmbCore.js PIECES)', items: [
    ...fixed(),
    box('repair bay', -168, -98, 36, 36, { rot: -1.05, cls: 'motor' }),
    box('vehicle depot', 190, -40, 27, 31, { rot: -(0.3 - Math.PI / 2), cls: 'motor' }),
    box('patrol rovers', 162, -89, 30, 10, { rot: 0.4, cls: 'motor' }),
    box('barracks', 175, 120, 15, 35, { rot: -(-0.6 + Math.PI), cls: 'motor' }),
    box('barracks', -175, 125, 15, 35, { rot: -(0.6 + Math.PI), cls: 'motor' }),
    circ('family dome (pink)', 70, 140, 19, { cls: 'civ' }), circ('family dome (gold)', -60, 145, 17, { cls: 'civ' }),
    circ('rocket pad', 20, -185, 30, { cls: 'rocket' }), box('launch gantry', 60, -185, 13, 10, { cls: 'rocket' }),
    circ('fuel sphere', -20, -173, 7, { cls: 'ind' }), circ('fuel sphere', -20, -197, 7, { cls: 'ind' }),
    box('solar field', 150, 60, 39, 22, { rot: -0.4, cls: 'ind' }), circ('comms mast', 140, -120, 2, { cls: 'ind' }),
    circ('SPACECOM dish', -150, -40, 14, { cls: 'ind' }),
    circ('shuttle pad', 95, -60, 16, { cls: 'pass' }), circ('shuttle pad', -120, 40, 16, { cls: 'pass' }),
    ...gunsAt(GUNS_NOW),
  ],
  note: 'Flyer pads beyond these two are laid by traffic.js at load, at the edge toward each line\'s destination.',
};

// ---------------- Draft A: the Circle ----------------
// A ring road inside the wall at r 170, just clear of the wings; the four quarters fill the 68 m band between it and the wall,
// each centred on its own gate, the gate road splitting it in two.
const A_LOOP = LOOP_R;
const draftA = {
  name: 'Draft A: the Circle (as built)', caption: 'src/ilmbLayout.js: a ring road at r 170; each quarter fills the band behind its own gate',
  loop: { r: A_LOOP, w: 14 },
  zones: [
    { name: 'TRANSIT', cls: 'pass', a0: 33, a1: 141, r0: A_LOOP + 7, r1: WALL_IN },
    { name: 'MOTOR POOL', cls: 'motor', a0: 141, a1: 228, r0: A_LOOP + 7, r1: WALL_IN },
    { name: 'POWER + INDUSTRY', cls: 'ind', a0: 228, a1: 312, r0: A_LOOP + 7, r1: WALL_IN },
    { name: 'CIVILIAN QUARTER', cls: 'civ', a0: 312, a1: 393, r0: A_LOOP + 7, r1: WALL_IN },
  ],
  items: [
    ...fixed(),
    ...spokes(LOOP_R + 7),
    road('Arrivals Avenue', 0, AVENUE.r0, 0, LOOP_R - 7),
    // as built: src/ilmbLayout.js
    ...BUS_PADS.map((p, i) => busPad(`bus pad ${i + 1}`, ...P(p.a, p.r))),
    ...SHIP_PADS.map((p, i) => shipPad(`freighter pad ${i + 1}`, ...P(p.a, p.r))),
    rc('rocket pad + gantry', ROCKET.a, ROCKET.r, ROCKET.padR, { cls: 'rocket' }),
    ...QUARTERS.map((e) => (typeof e.foot === 'number'
      ? rc(e.name, e.a, e.r, e.foot, { cls: e.q, soft: !!e.soft })
      : rb(e.name, e.a, e.r, e.foot[0], e.foot[1], { cls: e.soft ? 'pipe' : e.kind === 'lot' ? 'apron' : e.q, soft: !!e.soft }))),
    ...gunsAt(GUNS_NOW),
  ],
};

// ---------------- Draft B: the Rampart Road ----------------
// A ring road just inside the wall at r 224; the quarters sit inside it, in the wedges between the wings. Arrivals come in by
// the west gate (the Port Gate); the main gate opens on Crown Street, the civilian quarter's high street, to the atrium.
const B_LOOP = 224;
const draftB = {
  name: 'Draft B: the Rampart Road', caption: 'a ring road under the wall at r 224; the quarters sit in the wedges between the wings',
  loop: { r: B_LOOP, w: 14 },
  zones: [
    { name: 'CIVILIAN QUARTER', cls: 'civ', a0: 38, a1: 118, r0: 62, r1: B_LOOP - 7 },
    { name: 'TRANSIT', cls: 'pass', a0: 136, a1: 212, r0: 62, r1: B_LOOP - 7 },
    { name: 'POWER + INDUSTRY', cls: 'ind', a0: 224, a1: 300, r0: 140, r1: B_LOOP - 7 },
    { name: 'MOTOR POOL', cls: 'motor', a0: 304, a1: 358, r0: 120, r1: B_LOOP - 7 },
  ],
  items: [
    ...fixed(),
    ...spokes(),
    road('Crown Street', 0, 67.6, 0, B_LOOP - 7),
    road('Port Road', -(B_LOOP - 7), 0, -134, 0),
    road('Power Road', 0, -(B_LOOP - 7), 0, -134),
    road('Works Road', B_LOOP - 7, 0, 176, 0),
    // civilian, north: shops both sides of Crown Street, houses behind, the domes at the far corners
    box('shops', 20, 128, 12, 40, { cls: 'civ' }), box('shops', -20, 128, 12, 40, { cls: 'civ' }),
    box('shops', 20, 178, 12, 44, { cls: 'civ' }), box('shops', -20, 178, 12, 44, { cls: 'civ' }),
    box('houses', 46, 122, 12, 30, { cls: 'civ' }), box('houses', 46, 168, 12, 40, { cls: 'civ' }),
    box('houses', 70, 140, 12, 30, { cls: 'civ' }),
    box('houses', -46, 178, 12, 40, { cls: 'civ' }), box('houses', -46, 132, 12, 20, { cls: 'civ' }),
    circ('family dome (pink)', 100, 160, 19, { cls: 'civ' }), circ('family dome (gold)', -78, 172, 17, { cls: 'civ' }),
    rb('houses', 22, 185, 12, 36, { cls: 'civ' }), rb('houses', 22, 160, 12, 34, { cls: 'civ' }),
    circ('square', 0, 197, 12, { cls: 'apron', soft: true }),
    // transit, west: passengers north of the Port Road, freight south, the rocket at its inner end facing the Crown
    rc('rocket pad + gantry', 180, 100, 31, { cls: 'rocket' }),
    box('passenger terminal', -170, 23, 58, 16, { cls: 'pass' }),
    busPad('bus pad 1', -120, 64), busPad('bus pad 2', -152, 52), busPad('bus pad 3', -186, 52), busPad('bus pad 4', -158, 85),
    shipPad('freighter pad 1', -180, -40), shipPad('freighter pad 2', -150, -108),
    box('cargo shed + stacks', -132, -50, 18, 36, { rot: deg(10), cls: 'freight' }),
    // power and industry, south: tank farm by the port, solar east of the Power Road
    rc('fuel sphere', 236, 162, 7, { cls: 'ind' }), rc('fuel sphere', 236, 186, 7, { cls: 'ind' }), rc('fuel sphere', 245, 174, 7, { cls: 'ind' }),
    rc('tank', 228, 196, 5, { cls: 'ind' }), rc('tank', 245, 197, 5, { cls: 'ind' }), rc('tank', 254, 182, 5, { cls: 'ind' }),
    rb('pump house', 258, 205, 16, 14, { cls: 'ind' }),
    rb('pipe rack to the rocket', 208, 152, 4, 40, { cls: 'pipe', soft: true }),
    rb('solar field', 292, 190, 22, 39, { cls: 'ind' }),
    rc('comms mast', 262, 196, 2, { cls: 'ind' }),
    rc('SPACECOM dish', 278, 190, 14, { cls: 'ind' }),
    // motor pool, east: the repair bay on the Works Road, depot and garrison behind
    rb('repair bay (new)', 342, 186, 30, 52, { cls: 'motor' }),
    rb('apron + lifts out front', 352, 172, 26, 14, { cls: 'apron', soft: true }),
    rb('vehicle depot', 322, 194, 27, 31, { cls: 'motor' }),
    rb('patrol rover lot', 334, 150, 14, 26, { cls: 'motor' }),
    rb('fuel + charge island', 354, 200, 8, 12, { cls: 'motor' }),
    rb('barracks', 306, 202, 15, 35, { cls: 'motor' }), rb('barracks', 316, 150, 15, 35, { cls: 'motor' }),
    ...gunsAt([[0.31, 119], [0.95, 100], [2.75, 100], [4.15, 115], [4.85, 115], [5.74, 125]]),
  ],
};

// ---- clearance check ----
const corners = (b) => { const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [b.x + (u * b.w / 2) * c - (v * b.d / 2) * s, b.z + (u * b.w / 2) * s + (v * b.d / 2) * c]); };
const distPtSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const inPoly = (p, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside; } return inside; };
const distPtPoly = (p, poly) => inPoly(p, poly) ? -1 : Math.min(...poly.map((a, i) => distPtSeg(p, a, poly[(i + 1) % poly.length])));
function sep(a, b) {
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.kind === 'box' && b.kind === 'circle') return distPtPoly([b.x, b.z], corners(a)) - b.r;
  if (a.kind === 'circle') return sep(b, a);
  const A = corners(a), B = corners(b);
  let d = Infinity;
  for (const p of A) d = Math.min(d, distPtPoly(p, B));
  for (const p of B) d = Math.min(d, distPtPoly(p, A));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) d = Math.min(d, distPtSeg(A[i], B[j], B[(j + 1) % 4]), distPtSeg(B[j], A[i], A[(i + 1) % 4]));
  return d;
}
// an item's nearest and farthest distance from the hub's centre
const radii = (it) => {
  if (it.kind === 'circle') { const d = Math.hypot(it.x, it.z); return [Math.max(0, d - it.r), d + it.r]; }
  const C = corners(it);
  return [inPoly([0, 0], C) ? 0 : Math.min(...C.map((p, i) => distPtSeg([0, 0], p, C[(i + 1) % 4]))), Math.max(...C.map(([x, z]) => Math.hypot(x, z)))];
};
const DRUMS = [
  ...GATES.flatMap((g) => [-1, 1].map((s) => { const a = deg(g) + s * GATE_HALF; return circ(`gate tower ${g}°`, Math.cos(a) * WALL_R, Math.sin(a) * WALL_R, 8.3, { cls: 'wall' }); })),
  ...BASTIONS.map((b) => circ(`bastion ${b}°`, ...P(b, WALL_R + 3), 8.4, { cls: 'wall' })),
];
function check(L) {
  const out = [], f = (d) => d.toFixed(1).padStart(6);
  const hard = L.items.filter((i) => !i.soft);
  const roads = L.items.filter((i) => i.cls === 'road');
  for (let i = 0; i < hard.length; i++) for (let j = i + 1; j < hard.length; j++) {
    const a = hard[i], b = hard[j];
    if (a.fixed && b.fixed) continue;
    const d = sep(a, b);
    if (d < 4) out.push(`  ${d < 0 ? 'OVERLAP' : 'tight  '} ${f(d)} m  ${a.id}  <->  ${b.id}`);
  }
  for (const it of hard) {
    if (it.cls === 'gun' && it.fixed) continue;
    if (!it.roadOk) for (const r of roads) { const d = sep(it, r) - 0; if (d < 3) out.push(`  ${d < 0 ? 'ON ROAD' : 'tight  '} ${f(d)} m  ${it.id}  <->  ${r.id}`); }
    if (L.loop) { const [lo, hi] = radii(it), d = Math.max(L.loop.r - L.loop.w / 2 - hi, lo - (L.loop.r + L.loop.w / 2)); if (d < 3) out.push(`  ${d < 0 ? 'ON ROAD' : 'tight  '} ${f(d)} m  ${it.id}  <->  the ring road (r ${L.loop.r})`); }
    if (!it.fixed) {
      const hi = radii(it)[1]; if (hi > WALL_IN - 3) out.push(`  ${hi > WALL_IN ? 'IN WALL' : 'tight  '} ${f(WALL_IN - hi)} m  ${it.id}  <->  the wall's inner face`);
      for (const dr of DRUMS) { const d = sep(it, dr); if (d < 4) out.push(`  ${d < 0 ? 'OVERLAP' : 'tight  '} ${f(d)} m  ${it.id}  <->  ${dr.id}`); }
    }
  }
  // flight discs: nothing else that stands up inside a pad's clearR (roads, aprons and other pads' decks are fine)
  for (const p of L.items.filter((i) => i.pad)) for (const it of hard) {
    if (it === p || it.pad || it.cls === 'spawn' || it.cls === 'skywalk') continue;
    const d = sep({ kind: 'circle', x: p.x, z: p.z, r: p.clear }, it); if (d < 0) out.push(`  flight  ${f(d)} m  ${p.id}'s clear disc (r ${p.clear})  <->  ${it.id}`);
  }
  console.log(`${L.name}:\n${out.length ? out.join('\n') : '  all clear'}`);
  return out.length;
}

// ---- SVG plan ----
const W = 720, H = 760, cx = W / 2, cz = 392;
const X = (x) => (cx + x).toFixed(1), Z = (z) => (cz - z).toFixed(1);
const FILL = { core: '#2ec4ff', wing: '#9be7ff', skywalk: '#9be7ff', board: '#ffd23f', spawn: '#ffffff', pass: '#2ec4ff', freight: '#ff9f1c', rocket: '#ff4f2e', motor: '#c77dff', civ: '#7dff6a', ind: '#ffd23f', gun: '#ff3b5c', road: '#3a3850', apron: '#6b6880', pipe: '#ffd23f', wall: '#5b5870' };
const ZONE = { pass: '#2ec4ff', motor: '#c77dff', ind: '#ffd23f', civ: '#7dff6a' };
const arcPath = (r0, r1, a0, a1) => {
  const p = (a, r) => `${X(Math.cos(deg(a)) * r)},${Z(Math.sin(deg(a)) * r)}`, big = a1 - a0 > 180 ? 1 : 0;
  return `M${p(a0, r1)} A${r1},${r1} 0 ${big} 0 ${p(a1, r1)} L${p(a1, r0)} A${r0},${r0} 0 ${big} 1 ${p(a0, r0)} Z`;
};
function svg(L) {
  const e = [];
  e.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${L.name}: plan of the International Moon Base, ${L.caption}">`);
  e.push(`<style>text{font:10px ui-monospace,Menlo,monospace;fill:#eef}.t{font-size:14px;font-weight:bold}.k{fill:#9aa}.z{font-size:12px;font-weight:bold;letter-spacing:1px}.s{font-size:8.5px}</style>`);
  e.push(`<rect width="${W}" height="${H}" fill="#14121c"/>`);
  e.push(`<text x="10" y="20" class="t">${L.name}</text><text x="10" y="35" class="k">${L.caption}</text>`);
  // outer ring road and the wall
  e.push(`<circle cx="${X(0)}" cy="${Z(0)}" r="${RING}" fill="none" stroke="#3a3850" stroke-width="14"/>`);
  e.push(`<text x="${X(0)}" y="${Z(-RING - 14)}" text-anchor="middle" class="k">ring road outside (r ≈ 312)</text>`);
  for (const z of L.zones || []) e.push(`<path d="${arcPath(z.r0, z.r1, z.a0, z.a1)}" fill="${ZONE[z.cls]}" fill-opacity="0.09" stroke="${ZONE[z.cls]}" stroke-opacity="0.5" stroke-dasharray="4 4"/>`);
  if (L.loop) e.push(`<circle cx="${X(0)}" cy="${Z(0)}" r="${L.loop.r}" fill="none" stroke="#3a3850" stroke-width="${L.loop.w}"/><circle cx="${X(0)}" cy="${Z(0)}" r="${L.loop.r}" fill="none" stroke="#ffd23f" stroke-opacity="0.5" stroke-width="0.6" stroke-dasharray="6 6"/>`);
  // the wall, with its four gates open
  const gapA = GATE_HALF * 180 / Math.PI - 5.6;
  for (const g of GATES) e.push(`<path d="${arcPath(WALL_IN, WALL_R + 5, g + gapA, g + 90 - gapA)}" fill="#5b5870" fill-opacity="0.9"/>`);
  for (const d of DRUMS) e.push(`<circle cx="${X(d.x)}" cy="${Z(d.z)}" r="${d.r}" fill="#4a4660" stroke="#ff3b5c" stroke-width="1"/>`);
  const order = (i) => (i.cls === 'road' ? 0 : i.cls === 'apron' || i.cls === 'pipe' ? 1 : 2);
  for (const it of [...L.items].sort((a, b) => order(a) - order(b))) {
    const fcol = FILL[it.cls] || '#ccc', op = it.cls === 'road' ? 1 : it.soft ? 0.35 : it.fixed ? 0.55 : 0.8;
    const stroke = it.cls === 'road' ? 'none' : '#eef';
    if (it.kind === 'circle') {
      e.push(`<circle cx="${X(it.x)}" cy="${Z(it.z)}" r="${it.r}" fill="${fcol}" fill-opacity="${op}" stroke="${stroke}" stroke-width="0.6"/>`);
      if (it.clear) e.push(`<circle cx="${X(it.x)}" cy="${Z(it.z)}" r="${it.clear}" fill="none" stroke="${fcol}" stroke-width="0.7" stroke-dasharray="3 3"/>`);
      if (it.pad) e.push(`<text x="${X(it.x)}" y="${(+Z(it.z) + 3.5).toFixed(1)}" text-anchor="middle" font-weight="bold" font-size="11">H</text>`);
    } else {
      e.push(`<polygon points="${corners(it).map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="${fcol}" fill-opacity="${op}" stroke="${stroke}" stroke-width="0.6"/>`);
    }
  }
  // labels: one per distinct name, at the first item that has it (roads along their length)
  const said = new Set();
  for (const it of L.items) {
    if (['gun', 'spawn', 'skywalk', 'pipe', 'board', 'apron'].includes(it.cls) || it.pad || it.id.startsWith('gate road') || it.id === 'comms mast' || it.id.startsWith('fuel +')) continue;
    const lab = it.id.replace(/ \(new\)$/, '*').replace(/^family dome \((\w+)\)$/, '$1 dome').replace(/ \+ gantry$/, '');
    if (it.cls !== 'road' && said.has(lab)) continue;
    said.add(lab);
    if (it.cls === 'road') {
      let a = (it.rot * 180) / Math.PI; if (a > 90) a -= 180; if (a < -90) a += 180;
      e.push(`<text transform="translate(${X(it.x)} ${Z(it.z)}) rotate(${(-a).toFixed(1)})" y="3" text-anchor="middle" class="s" fill="#ffd23f">${lab}</text>`);
    } else e.push(`<text x="${X(it.x)}" y="${(+Z(it.z) + 3).toFixed(1)}" text-anchor="middle" class="${it.fixed ? 's' : 's'}">${lab}</text>`);
  }
  for (const z of L.zones || []) { const m = (z.a0 + z.a1) / 2, r = RING + 30; e.push(`<text x="${X(Math.cos(deg(m)) * r)}" y="${Z(Math.sin(deg(m)) * r)}" text-anchor="middle" class="z" fill="${ZONE[z.cls]}">${z.name}</text>`); }
  if (L.loop) e.push(`<text x="${X(Math.cos(deg(-62)) * L.loop.r)}" y="${Z(Math.sin(deg(-62)) * L.loop.r)}" text-anchor="middle" class="s" fill="#ffd23f">inner ring road (r ${L.loop.r})</text>`);
  for (const g of GATES) { const [x, z] = P(g, 282); e.push(`<text x="${X(x)}" y="${(+Z(z) + 3).toFixed(1)}" text-anchor="middle" class="s" fill="#ff9f9f">${{ 0: 'E gate', 90: 'MAIN GATE', 180: 'W gate', 270: 'S gate' }[g]}</text>`); }
  if (L.note) e.push(`<text x="10" y="${H - 30}" class="k">${L.note}</text>`);
  e.push(`<text x="10" y="${H - 12}" class="k">H: flyer pad (dashed: its flight disc) · red dots: inner guns · * new model · 1 px = 1 m · +z (the atrium's side) up</text>`);
  e.push('</svg>');
  return e.join('\n');
}

let bad = 0;
bad += check(draftA);  // (as built: a finding fails the check)
check(draftB);         // (the draft not taken, for the record: drawn and listed, not failed; today's plan is drawn, not checked)
const outDir = process.argv[2];
if (outDir) {
  writeFileSync(`${outDir}/ilmb-layout-current.svg`, svg(current));
  writeFileSync(`${outDir}/ilmb-layout-a.svg`, svg(draftA));
  writeFileSync(`${outDir}/ilmb-layout-b.svg`, svg(draftB));
  console.log('wrote 3 plans to', outDir);
}
process.exitCode = bad ? 1 : 0;
