// Chimera Downs' plan numbers (no three.js, so tools/downs-layouts.mjs can read them). Location frame: metres, +x along the
// straights, +z toward the main grandstand (home straight at z = +r). Layout B, The Horseshoe (docs/downs-layouts.md).

// ---- the oval: two 180 m straights, half circles of centre-line radius 55, four lanes, rails at 45 and 64.4 ----
const STRAIGHT = 180, HALF = STRAIGHT / 2, R0 = 55;
export const SEGS = [STRAIGHT, Math.PI * R0, STRAIGHT, Math.PI * R0];
const LAP = SEGS[0] + SEGS[1] + SEGS[2] + SEGS[3]; // ~706 m round the centre line
export const LANES = [48.5, 52.5, 56.5, 60.5];
export const RAIL_IN = 45, RAIL_OUT = 64.4;
export const DIRT = [44.6, 64.8];                         // dirt band inner/outer radius
export const FINISH_U = 135;                              // finish line: x = +45 on the home straight, before the grandstand
export const FINISH_X = 45;

// position and heading at centre-line distance u (wrapped), offset r from the centre line
export function oval(u, r, out = {}) {
  u = ((u % LAP) + LAP) % LAP;
  if (u < SEGS[0]) {
    out.x = -HALF + u; out.z = r; out.hx = 1; out.hz = 0;
  } else if ((u -= SEGS[0]) < SEGS[1]) {
    const a = Math.PI / 2 - Math.PI * (u / SEGS[1]);
    out.x = HALF + r * Math.cos(a); out.z = r * Math.sin(a); out.hx = Math.sin(a); out.hz = -Math.cos(a);
  } else if ((u -= SEGS[1]) < SEGS[2]) {
    out.x = HALF - u; out.z = -r; out.hx = -1; out.hz = 0;
  } else {
    u -= SEGS[2];
    const a = -Math.PI / 2 - Math.PI * (u / SEGS[3]);
    out.x = -HALF + r * Math.cos(a); out.z = r * Math.sin(a); out.hx = Math.sin(a); out.hz = -Math.cos(a);
  }
  return out;
}
export const lapLen = (r) => 2 * STRAIGHT + 2 * Math.PI * r;

// ---- grandstands face the track; tier i is rise * (i + 1) high, `depth` deeper than the one below ----
// Main stand front z = 76 (11.6 m apron from the rail for the photo-finish tower, crossings, camera crews); 14 tiers reach 15.4 m, z = 112.4.
export const STAND = { x0: -114, x1: 114, z0: 76, tiers: 14, rise: 1.1, depth: 2.6, aisles: [-76, -38, 0, 38, 76], wall: 0.8, roof: 8.5 };
// far stand: across the course (z negative), smaller
export const FAR = { x0: -95, x1: 95, z0: 76, tiers: 8, rise: 1.0, depth: 2.4, aisles: [-47.5, 0, 47.5], wall: 0.8 };

// ---- clubhouse and tote hall behind the main stand's centre; front (forecourt side) at z = 142 ----
export const CLUB = { x0: -30, x1: 30, z0: 115, z1: 142 };
export const WINDOW = [0, 144];                             // bookie spot, middle of the clubhouse's six windows
export const BOARD = { x: 0, y: 13.2, w: 13.3, h: 7.8 };    // race card board's live canvas, in the clubhouse face recess

// ---- the stand's entries (through its back wall) and poster places ----
export const ENTRIES = [-47.5, 47.5];

// ---- infield screen drum (dn_drum): 41 x 15 m shell, y = 17.2 to 38.8, on a 10 x 10 core. Four screens, bottom edge at 18 m:
// 40 x 20 on the long faces (z = +-7.5, facing the stands), 14 x 20 on the ends (x = +-20.5, facing the arcades) ----
export const DRUM = { x: 0, z: 0, w: 40, d: 15, h: 20, yc: 28, end: 14, core: 10 };

// ---- winners' podiums: a dn_podium set per race in front of the drum, facing the main stand; steps at x offsets from the set's middle ----
export const PODIUMS = { z: 18.5, xs: [-30, 0, 30], steps: { 1: [0, 1.4], 2: [-6.5, 1.0], 3: [6.5, 0.7] }, plate: { y: 4.6, z: -2.2, w: 11, h: 1.4 } };

// ---- arcades: a covered market hall round each turn (docs/downs-layouts.md). Runs of 6.3 degree wedges between radius 84 and 100
// round the turn's centre (west (-90, 0); east (90, 0), mirrored), gate hall in the middle (180 degrees on the west). Angles in degrees
// from the turn's centre (x = cx + r cos a, z = r sin a), west arcade's way round: main stand end (108), gate (180), far stand (264.6) ----
// `stalls`: bays (0 = run's first edge) holding a stall, five a run, every second bay, spare room at the ends. The gate hall's block
// reaches into the next bay (171 to 169 degrees at the walk, ~170.6 at stall depth; mirrored past 189), so that bay never has one:
// main stand run 0 to 8 (joiner past bay 0, bay 9 open at the gate), far stand run 2 to 10 (bays 0, 1 at the gate; 11 and joiner at the stand).
export const ARCADE = { cx: 90, ri: 84, ro: 100, step: 6.3, runs: [{ a0: 108, n: 10, stalls: [0, 2, 4, 6, 8] }, { a0: 189, n: 12, stalls: [2, 4, 6, 8, 10] }], gate: 180, walk: [112, 262] };
export const WEDGE = (() => {
  const a2 = (ARCADE.step / 2) * Math.PI / 180, s = Math.sin(a2), c = Math.cos(a2);
  return { a2, wi: ARCADE.ri * s, wo: ARCADE.ro * s, d: (ARCADE.ro - ARCADE.ri) * c, r0: ARCADE.ri * c };
})();
// stalls in the ARCADE.runs[].stalls bays (other bays: a bench and two planters); ten per arcade
export const STALLS = [
  { d: 0, name: 'MOON DOGS', accent: 0x8b4044 }, { d: 1, name: 'CRATER FRIES', accent: 0xcfb352 }, { d: 2, name: 'HE-3 FIZZ', accent: 0x7b9a6e },
  { d: 3, name: 'CHIMERA CHOW', accent: 0xb07c57 }, { d: 4, name: 'ROCK CANDY', accent: 0x8b4044 }, { d: 5, name: 'TOTE · BETS', accent: 0x3b393a },
  { d: 6, name: 'SPACE SLUSH', accent: 0x7b9a6e }, { d: 7, name: 'LUNAR COFFEE', accent: 0xb07c57 }, { d: 8, name: 'DERBY DONUTS', accent: 0x8b4044 },
  { d: 9, name: "JOCKEY'S GRILL", accent: 0xcfb352 }, { d: 10, name: 'FOAM FINGERS', accent: 0x7b9a6e }, { d: 11, name: 'RAIL BAR', accent: 0x3b393a },
];
// stall per slot: [west, east], slots 0 to 9 from the main stand
export const STALL_ORDER = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 0, 2, 4, 1, 3, 5, 7, 9]];

// ---- track crossings: 8 m rail gaps at x = +-70 on both straights, a barrier post each end ----
export const CROSSINGS = [-70, 70];
export const CROSS_GAP = 8;

// ---- forecourt and concourse behind the main stand ----
export const FORECOURT = { x0: -76, x1: 76, z0: 114, z1: 191, avenue: 14, fountain: [0, 166], gate: 193, promenade: [143, 149] };

// ---- infield: parade ring and weighing room west, picnic lawn east ----
export const RING = { x: -96, z: 0, rx: 26, rz: 18 };                // parade ring rail ellipse; gate on the east end, toward the weighing room
export const PAVILION = { x: -62, z: 0 };                             // weighing room front wall (porch 3.2 m west of it)
export const LAWN = { x: 100, z: 0, r: 28, tables: [[84, -12, 0], [92, 12, 1], [104, -16, 2], [110, 6, 3], [96, -2, 4], [118, -6, 5]] };

// ---- stables behind the far stand: four blocks of six boxes round a lane, hay barn between the back two ----
export const STABLES = { blocks: [[-36, -126, 0], [36, -126, 0], [-36, -114, Math.PI], [36, -114, Math.PI]], barn: [0, -126] };

// ---- fairground annex, behind the main stand's east end ----
export const ANNEX = {
  x0: 124, x1: 206, z0: 106, z1: 168, gate: [124, 139], wheel: [175, 156], carousel: [142, 134], ticket: [171, 118],
  kiosks: [[170, 133, 6], [194, 133, 8]],
};
