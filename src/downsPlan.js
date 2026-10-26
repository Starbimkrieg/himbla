// Chimera Downs' plan numbers (no three.js, so tools/downs-layouts.mjs can read them). Location frame: metres, +x along the
// straights, +z toward the main grandstand (home straight at z = +r). Layout B, The Horseshoe (docs/downs-layouts.md).

// ---- the oval: two 180 m straights joined by half circles of radius 55 (the centre line), six starting lanes 3 m apart, rails at 45 and 64.4 ----
export const STRAIGHT = 180, HALF = STRAIGHT / 2, R0 = 55;
export const SEGS = [STRAIGHT, Math.PI * R0, STRAIGHT, Math.PI * R0];
export const LAP = SEGS[0] + SEGS[1] + SEGS[2] + SEGS[3]; // ~706 m round the centre line
export const LANES = [47.5, 50.5, 53.5, 56.5, 59.5, 62.5];   // (the stalls' centres; out of the gate the runners go where they like)
export const RAIL_IN = 45, RAIL_OUT = 64.4;
export const DIRT = [44.6, 64.8];                         // dirt band inner/outer radius
export const FINISH_U = 135;                              // finish line: x = +45 on the home straight, before the grandstand
export const FINISH_X = 45;

// plateau radius (locations.js `r`); the farthest solid is 257 m out
export const LOC_R = 280;

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
export const standBack = (S) => S.z0 + S.tiers * S.depth;   // back wall's front face

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

// ---- the stables behind the far stand (docs/stable-proposals/): two layouts, A and B; STABLE picks the one built (B, the Twin Lanes). Both hang off the far stand's
// back wall (its outer face at z = -96), so its two tunnels (x = +-47.5) come out into the yard. Each is mirrored about x = 0.
//   pieces  [name, x, z, yaw]: dn_stable_4 / dn_stable_6 (yaw 0: front +z; PI/2: front +x; -PI/2: front -x), dn_stable_corner (yaw 0: its inner corner toward
//           +x +z; -PI/2: toward -x +z), dn_hay_barn (front +z), dn_lunge_ring, dn_trough, dn_tack
//   fences  runs of post and rail, as polylines [[x, z]...] (cut into equal bays of about 4 m)
//   gates   [x, z, yaw]: dn_yard_gate (yaw 0: its leaves swung toward -z)
//   ground  [x0, x1, z0, z1, colour]: the yard's earth (and B's turnout grass), laid flat
//   trainer where the Training Yard's trainer stands; hay [x, z, yaw] stacks; walks [x0, x1, z0, z1]: the ways through, kept clear of props (tools/stable-layouts.mjs)
const mirror = (L) => {
  const flip = (yaw) => (yaw === 0 || yaw === Math.PI ? yaw : -yaw);
  const corner = (yaw) => (yaw === 0 ? -Math.PI / 2 : 0);                 // (an L's knuckle: its inner corner turned from +x to -x)
  const half = (list) => list.map(([n, x, z, yaw]) => [n, -x, z, n === 'dn_stable_corner' ? corner(yaw) : flip(yaw)]);
  return {
    ...L,
    pieces: [...L.pieces, ...half(L.pieces.filter((p) => p[1] < 0))],
    fences: [...L.fences, ...L.fences.filter((f) => f.every(([x]) => x <= 0) && f.some(([x]) => x < 0)).map((f) => f.map(([x, z]) => [-x, z]))],
    gates: [...L.gates, ...L.gates.filter((g) => g[0] < 0).map(([x, z, yaw]) => [-x, z, flip(yaw)])],
    hay: [...L.hay, ...L.hay.filter((h) => h[0] < 0).map(([x, z, yaw]) => [-x, z, -yaw])],
  };
};
const Q = Math.PI / 2;
export const STABLE_LAYOUTS = {
  // A, The Stable Court: one court the width of the stand's middle, closed by an L of boxes on each side (a wing coming back from the stand, a row along the
  // back, a clock-towered tack room at the knuckle), the hay barn in the middle of the back row, a lunge ring in the middle; a gate at each wing's end
  a: mirror({
    name: 'A: The Stable Court',
    pieces: [
      ['dn_stable_corner', -70.3, -160.3, 0],
      ['dn_stable_6', -55, -160, 0], ['dn_stable_4', -28, -160, 0],          // the back row, front to the stand
      ['dn_stable_6', -70, -145, Q], ['dn_stable_4', -70, -118, Q],           // the wing, front into the court
      ['dn_hay_barn', 0, -160, 0], ['dn_lunge_ring', 0, -128, 0],
      ['dn_trough', -63, -124, Q], ['dn_trough', -36, -153, 0], ['dn_tack', -62, -150, 0.6], ['dn_tack', -63, -136, -0.3],
    ],
    fences: [
      [[-74.5, -96.2], [-74.5, -98.5]], [[-74.5, -105.5], [-74.5, -108.2]],   // either side of the wing's gate
      [[-74.5, -129.7], [-74.5, -128.3]],                                       // across the gap between the wing's blocks
      [[-39.7, -164.5], [-38.3, -164.5]], [[-17.7, -165], [-12.2, -165]],       // across the back row's gaps
    ],
    gates: [[-74.5, -102, -Q]],                                                // (its leaves swung into the court)
    hay: [[-18, -151, 0.15], [-9, -153.5, -0.1]],
    ground: [[-80, 80, -173, -96, 'earth']],
    trainer: [3, -116],
  }),
  // B, The Twin Lanes: each tunnel comes out into a lane of boxes running straight back, an L at its far end (the outer row turning along the back at a clock
  // tower), the two lanes joined across the back by a yard in front of the hay barn; between them a fenced turnout paddock with the lunge ring, a gate to it
  // from each lane and one from the back yard. The lanes and the back yard are kept clear: the troughs, the saddle rack and the hay stand in the paddock or
  // in the nook between the back row and the barn
  b: mirror({
    name: 'B: The Twin Lanes',
    pieces: [
      ['dn_stable_6', -53.5, -115.3, Q], ['dn_stable_4', -53.5, -142.1, Q],  // each lane's outer row, front into the lane
      ['dn_stable_corner', -53.8, -152.3, 0], ['dn_stable_6', -38.5, -152, 0], // its knuckle and the back row
      ['dn_stable_6', -41.5, -116, -Q],                                        // the inner row, front into the lane, its back to the paddock
      ['dn_hay_barn', 0, -152, 0], ['dn_lunge_ring', 0, -120, 0],
      ['dn_trough', -22, -100.6, 0], ['dn_trough', -18, -155.5, 0], ['dn_tack', -14.8, -155.3, 0.3],
    ],
    fences: [
      [[-63.4, -98.2], [-51, -98.2]], [[-44, -98.2], [-33, -98.2], [0, -98.2]],   // across the lanes' mouths (a gate in each) and the paddock's north side
      [[-37, -131.6], [-37, -135.5]], [[-36.55, -142], [-3.5, -142]],             // the paddock's side by the lane (its gate) and its south side, from that gate's pier (a gate to the back yard)
      [[-58, -130.6], [-58, -131.8]], [[-23.2, -157], [-12.2, -157]],              // across the gaps in the outer row and the back row
    ],
    gates: [[-47.5, -98.2, 0], [-37, -139, Q], [0, -142, 0]],
    hay: [[-21, -154.6, 0.1], [-30, -103.5, 0.2]],
    ground: [[-64, 64, -163, -96, 'earth'], [-36.8, 36.8, -141.8, -98.4, 'grass']],
    walks: [[-51.1, -43.9, -149.6, -96], [43.9, 51.1, -149.6, -96], [-51.1, 51.1, -149.6, -142.3], [-12.6, 12.6, -151.5, -142.3]],   // the two lanes, the back yard, the barn's apron
    trainer: [3, -108],
  }),
};
const DEV = typeof __DEV_TOOLS__ === 'undefined' ? true : __DEV_TOOLS__;     // (in a dev build ?stables=a|b picks the layout, to compare them)
const asked = DEV && typeof location !== 'undefined' ? /[?&]stables=(a|b)\b/.exec(location.search) : null;
export const STABLE = asked ? asked[1] : 'b';
export const STABLES = STABLE_LAYOUTS[STABLE];
// The boxes a layout's blocks hold: [x, z, yaw] of where a chimera stands in each box, 1.6 m in from the door (its head over it), the way it looks out (the game stands a chimera in some)
export const BOX_PITCH = 5;
export function stallsOf(L) {
  const out = [];
  for (const [n, x, z, yaw] of L.pieces) {
    const m = /^dn_stable_(\d)$/.exec(n);
    if (!m) continue;
    const k = +m[1], c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < k; i++) {
      const lx = -(k - 1) * BOX_PITCH / 2 + i * BOX_PITCH, lz = -1.6;
      out.push([x + lx * c + lz * s, z - lx * s + lz * c, yaw]);
    }
  }
  return out;
}

// ---- fairground annex, behind the main stand's east end ----
export const ANNEX = {
  x0: 124, x1: 206, z0: 106, z1: 168, gate: [124, 139], wheel: [175, 156], carousel: [142, 134], ticket: [171, 118],
  kiosks: [[170, 133, 6], [194, 133, 8]],
};

// ---- foot traffic: where walkers may not go (world.js updateFigures asks loc.walkBlocked(x, z); downsWorld.js sets it) ----
// Racegoers keep to the forecourt, the aprons, the arcades and the fairground: never onto the track (dirt, rails and 2.5 m beyond,
// so the infield and crossings stay empty) and never through a solid (stands, stalls, columns, the fountain, rails).
export const TRACK_KEEP = RAIL_OUT + 2.5;
export const onTrack = (x, z) => Math.hypot(Math.max(Math.abs(x) - STRAIGHT / 2, 0), z) < TRACK_KEEP;

// From a kit's colliders (flat local coordinates: box {x, y, z, hx, hy, hz, yaw}, cyl {x, z, r, y0, y1}) those a walker would bump
// (feet below 1.5 m, top above 0.4 m), in a 6 m grid. Returns blocked(x, z): on the track or within `pad` of such a footprint.
export function walkBlocker(cols, pad = 0.45) {
  const CELL = 6, grid = new Map(), key = (i, j) => i * 4096 + j;
  for (const c of cols) {
    let o;
    if (c.type === 'box') {
      if (c.floor || c.y - c.hy > 1.5 || c.y + c.hy < 0.4) continue;   // (a floor under a walk is walked on: Kit.floorColliders)
      const cs = Math.cos(c.yaw || 0), sn = Math.sin(c.yaw || 0);
      o = { box: true, x: c.x, z: c.z, hx: c.hx + pad, hz: c.hz + pad, cs, sn, ex: Math.abs(cs) * c.hx + Math.abs(sn) * c.hz + pad, ez: Math.abs(sn) * c.hx + Math.abs(cs) * c.hz + pad };
    } else if (c.type === 'cyl') {
      if (c.y0 > 1.5 || c.y1 < 0.4) continue;
      o = { x: c.x, z: c.z, r: c.r + pad, ex: c.r + pad, ez: c.r + pad };
    } else continue;
    for (let i = Math.floor((o.x - o.ex) / CELL); i <= Math.floor((o.x + o.ex) / CELL); i++)
      for (let j = Math.floor((o.z - o.ez) / CELL); j <= Math.floor((o.z + o.ez) / CELL); j++) {
        const k = key(i + 2048, j + 2048);
        (grid.get(k) || grid.set(k, []).get(k)).push(o);
      }
  }
  return (x, z) => {
    if (onTrack(x, z)) return true;
    const list = grid.get(key(Math.floor(x / CELL) + 2048, Math.floor(z / CELL) + 2048));
    if (!list) return false;
    for (const o of list) {
      const dx = x - o.x, dz = z - o.z;
      if (o.box) {
        if (Math.abs(dx * o.cs - dz * o.sn) <= o.hx && Math.abs(dx * o.sn + dz * o.cs) <= o.hz) return true;
      } else if (dx * dx + dz * dz <= o.r * o.r) return true;
    }
    return false;
  };
}
