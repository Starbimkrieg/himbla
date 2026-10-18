// The Lucky Crater Casino's plan ("the Crater Cross", docs/casino-layouts.md): where the hall's floor is and where every game stands. No three.js in here, so the layout
// checker (tools/casino-layouts.mjs) imports the same numbers the game builds from. casinoWorld.js re-exports the game positions; casinoGames.js reads them.
//
// The casino's own frame (metres): +x right, +z toward the doors, y up. A cruciform hall round a crossing with four rounded corners:
//   the foyer (south arm, the doors at its front), the Plinko arm (north), and a wing each side (west: the claw, the classic slots, blackjack; east: the Duck Derby).
// `floor` is the inside; the walls stand outside it, WALL thick.

export const WALL = 2.4;
export const HALL = {
  H: 16, DOOR: 6, DOOR_H: 10,                    // the ceiling; the doors' half width and height
  FRONT: 14,                                     // the doors' wall: its inner face
  C: [0, -13], R: 16.5,                          // the crossing: its centre and the radius of its rounded corners
  ARM: 9,                                        // the foyer's and the Plinko arm's half width
  S0: 0,                                         // the foyer's far end (it opens into the crossing)
  N1: -44,                                       // the Plinko arm's end wall
  WING: { x0: 10, x1: 55, z0: -24, z1: -2 },     // the east wing (the west one mirrors it)
};
export const FRONT_OUT = HALL.FRONT + WALL;      // the doors' wall's outer face: the forecourt starts here

// ---- the games, in the hall's frame ----
// Blackjack: the table stands against the west wing's north wall facing +z (its dealer's counter on the wall, the players coming from +z): (x, z) is the middle of its flat edge on the floor,
// `yaw` its turn. The game thinks in the table's own frame (x right, z toward the player); bjPt gives a point of it in the hall's.
export const BJ = { x: -42.9833, z: -21.96, R: 3.4, top: 1.16, yaw: 0 };
export const bjPt = (lx, y, lz) => { const c = Math.cos(BJ.yaw), s = Math.sin(BJ.yaw); return [BJ.x + lx * c + lz * s, y, BJ.z - lx * s + lz * c]; };
// The zero-g claw's machine stands on the west wing's south wall, turned to face the wing (its back on the wall at z = `z`); the machine's frame (x along the tank, y up,
// z toward the glass) goes to the hall's through clawPt.
export const CLAW = { x: -26.65, z: -2.02, yaw: Math.PI };
export const clawPt = (lx, y, lz) => [CLAW.x - lx, y, CLAW.z - lz];
// The Duck Derby runs along x on the east wing's north wall, its viewers on +z: the lanes' z (lane 0 nearest the viewers), the gate at x0 and the finish arch at x1.
export const DUCK = { x0: 20.8, x1: 44.8, lanes: [-15.8, -17.4, -19, -20.6], water: 0.86, kiosk: [32.8, -10.4], wallZ: -24 };
export const PLK = { x: 0, y: 1.2, z: -42, wallZ: -44 };   // the Plinko board's plane (2 m off the arm's end wall)
// The classic games' four slot cabinets stand in a row along the west wing's south wall facing -z, 3.2 m apart, 1.75 m off the wall.
export const CLASSIC = { z: -2.78, xs: [-52.4, -49.2, -46, -42.8], yaw: Math.PI, station: [-47.6, -6.6], wallZ: -2 };
// The prize counter stands against the foyer's east wall facing -x (the counter's frame: lx along it, lz out from the prize wall's face toward the player).
export const PRIZE = { x: 6.07, z: 5.1, wallX: 9 };

// ---- the floor ----
export const floorShapes = () => {
  const { C, R, ARM, S0, N1, WING, FRONT } = HALL;
  return [
    { k: 'c', x: C[0], z: C[1], r: R },
    { k: 'r', x0: -ARM, x1: ARM, z0: S0, z1: FRONT },
    { k: 'r', x0: -ARM, x1: ARM, z0: N1, z1: C[1] + 8 },
    { k: 'r', x0: -WING.x1, x1: -WING.x0, z0: WING.z0, z1: WING.z1 },
    { k: 'r', x0: WING.x0, x1: WING.x1, z0: WING.z0, z1: WING.z1 },
  ];
};
const inShape = (s, x, z) => (s.k === 'r' ? x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 : Math.hypot(x - s.x, z - s.z) <= s.r);
// is (x, z) inside the hall? With `m` > 0, at least m metres in from the walls; with `m` < 0, or within |m| metres outside them
export function inHall(x, z, m = 0) {
  const P = hallPolygon();
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (m > 0) return inside && edgeDist(P, x, z) >= m;
  if (m < 0) return inside || edgeDist(P, x, z) <= -m;
  return inside;
}
const edgeDist = (P, x, z) => {
  let best = 1e9;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};

// ---- the outline: the inside's boundary, walked once round, the doors' two jambs among its points ----
let _poly = null;
export function hallPolygon() {
  if (_poly) return _poly;
  const { C, R, ARM, N1, WING, FRONT, DOOR } = HALL;
  const dz = (WING.z1 - WING.z0) / 2;                                   // the wing's half width
  const aArm = Math.acos(ARM / R), aWing = Math.asin(dz / R);          // where the arms' and the wings' walls meet the corners' arc
  const zs = C[1] + Math.sqrt(R * R - ARM * ARM), zn = C[1] - Math.sqrt(R * R - ARM * ARM), xw = Math.sqrt(R * R - dz * dz);
  const arc = (a0, a1, n = 6) => { const out = []; for (let i = 1; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]); } return out; };
  const P = [
    [DOOR, FRONT], [ARM, FRONT], [ARM, zs], ...arc(aArm, aWing), [xw, WING.z1],
    [WING.x1, WING.z1], [WING.x1, WING.z0], [xw, WING.z0], ...arc(-aWing, -aArm), [ARM, zn],
    [ARM, N1], [-ARM, N1], [-ARM, zn], ...arc(-(Math.PI - aArm), -(Math.PI - aWing)), [-xw, WING.z0],
    [-WING.x1, WING.z0], [-WING.x1, WING.z1], [-xw, WING.z1], ...arc(Math.PI - aWing, Math.PI - aArm), [-ARM, zs],
    [-ARM, FRONT], [-DOOR, FRONT],
  ];
  return (_poly = P);
}
// the polygon pushed outward by d (a mitre at every corner); the outline runs one way, so work out which side is out from its area
export function offsetPolygon(P, d) {
  let a = 0;
  for (let i = 0; i < P.length; i++) { const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length]; a += x1 * z2 - x2 * z1; }
  const s = a > 0 ? 1 : -1;                                            // the sign that turns an edge's direction into its outward normal
  const nrm = (p, q) => { const x = q[0] - p[0], z = q[1] - p[1], l = Math.hypot(x, z) || 1; return [s * z / l, -s * x / l]; };
  return P.map((v, i) => {
    const n1 = nrm(P[(i + P.length - 1) % P.length], v), n2 = nrm(v, P[(i + 1) % P.length]);
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [v[0] + (n1[0] + n2[0]) * k, v[1] + (n1[1] + n2[1]) * k];
  });
}
// the walls as a list of straight runs of the outline (the doors' gap left out): each with its inner and outer end points, its direction (u), its outward normal (n), the yaw a box along it takes
// and the extent of the wall's band along the run (tmin..tmax from the run's start: the mitres at the corners make the outer face longer or shorter than the inner one)
export function wallEdges() {
  const P = hallPolygon(), PO = offsetPolygon(P, WALL), E = [];
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length, p = P[i], q = P[j], o = PO[i], o2 = PO[j];
    if (p[1] === HALL.FRONT && q[1] === HALL.FRONT && Math.abs(p[0]) <= HALL.DOOR && Math.abs(q[0]) <= HALL.DOOR) continue;   // (the doors' gap)
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / len, uz = (q[1] - p[1]) / len;
    let nx = uz, nz = -ux;
    if ((o[0] - p[0]) * nx + (o[1] - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
    const t = [0, len, (o[0] - p[0]) * ux + (o[1] - p[1]) * uz, (o2[0] - p[0]) * ux + (o2[1] - p[1]) * uz];
    E.push({ i, p, q, o, o2, len, olen: Math.hypot(o2[0] - o[0], o2[1] - o[1]), ux, uz, nx, nz, yaw: Math.atan2(-uz, ux), tmin: Math.min(...t), tmax: Math.max(...t),
      mx: (p[0] + q[0]) / 2, mz: (p[1] + q[1]) / 2, omx: (o[0] + o2[0]) / 2, omz: (o[1] + o2[1]) / 2 });
  }
  return E;
}
// one collider box a run: its middle (x, z), half length hx along the run and half thickness hz across it, and its yaw
export const wallBoxes = (E = wallEdges()) => E.map((e) => {
  const tc = (e.tmin + e.tmax) / 2;
  return { x: e.p[0] + e.ux * tc + e.nx * WALL / 2, z: e.p[1] + e.uz * tc + e.nz * WALL / 2, hx: (e.tmax - e.tmin) / 2, hz: WALL / 2, yaw: e.yaw };
});
// is (x, z) inside a box (as the colliders read it: yaw about y turns its local x to (cos, -sin))?
export const inBox = (b, x, z, grow = 0) => { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), sn = Math.sin(b.yaw); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) <= b.hx + grow && Math.abs(lz) <= b.hz + grow; };
export const floorArea = () => { let area = 0; const sh = floorShapes(); for (let x = -70; x < 70; x += 0.25) for (let z = -60; z < 30; z += 0.25) if (sh.some((s) => inShape(s, x + 0.125, z + 0.125))) area += 0.0625; return area; };
