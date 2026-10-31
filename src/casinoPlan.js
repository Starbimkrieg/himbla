// The Lucky Crater Casino's plan ("the Crater Cross", docs/casino-layouts.md): the hall's floor and where each game stands.
// No three.js, so tools/casino-layouts.mjs checks the same numbers the game builds from. casinoWorld.js re-exports the
// game positions; casinoGames.js reads them.
//
// Frame (m): +x right, +z toward the doors, y up. A cruciform hall round a crossing with rounded corners: foyer (south,
// doors at its front), Plinko arm (north), west wing (claw, classic slots, blackjack), east wing (Duck Derby).
// `floor` is the inside; the walls stand outside it, WALL thick.

export const WALL = 2.4;
export const HALL = {
  H: 16, DOOR: 6, DOOR_H: 10,                    // ceiling; doors' half width and height
  FRONT: 14,                                     // doors' wall, inner face
  C: [0, -13], R: 16.5,                          // crossing centre; corner radius
  ARM: 9,                                        // foyer and Plinko arm half width
  S0: 0,                                         // foyer's far end (opens into the crossing)
  N1: -44,                                       // Plinko arm's end wall
  WING: { x0: 10, x1: 55, z0: -24, z1: -2 },     // east wing (west mirrors it)
};
export const FRONT_OUT = HALL.FRONT + WALL;      // doors' wall outer face: the forecourt starts here

// ---- games, in the hall's frame ----
// Blackjack: table against the west wing's north wall facing +z (dealer at the wall). (x, z) is the middle of its flat
// edge, `yaw` its turn. The game works in the table's frame (x right, z toward the player); bjPt maps it to the hall's.
export const BJ = { x: -42.9833, z: -21.96, R: 3.4, top: 1.16, yaw: 0 };
export const bjPt = (lx, y, lz) => { const c = Math.cos(BJ.yaw), s = Math.sin(BJ.yaw); return [BJ.x + lx * c + lz * s, y, BJ.z - lx * s + lz * c]; };
// Zero-g claw: on the west wing's south wall facing the wing (back on the wall at z = `z`). clawPt maps its frame
// (x along the tank, y up, z toward the glass) to the hall's.
export const CLAW = { x: -26.65, z: -2.02, yaw: Math.PI };
export const clawPt = (lx, y, lz) => [CLAW.x - lx, y, CLAW.z - lz];
// Duck Derby: along x on the east wing's north wall, viewers on +z. Lane z's (lane 0 nearest the viewers), gate at x0,
// finish arch at x1.
export const DUCK = { x0: 20.8, x1: 44.8, lanes: [-15.8, -17.4, -19, -20.6], water: 0.86, kiosk: [32.8, -10.4], wallZ: -24 };
export const PLK = { x: 0, y: 1.2, z: -42, wallZ: -44 };   // Plinko board's plane (2 m off the end wall)
// Classic slots: four cabinets along the west wing's south wall facing -z, 3.2 m apart, 1.75 m off the wall.
export const CLASSIC = { z: -2.78, xs: [-52.4, -49.2, -46, -42.8], yaw: Math.PI, station: [-47.6, -6.6], wallZ: -2 };
// Prize counter: against the foyer's east wall facing -x (its frame: lx along it, lz from the prize wall toward the player).
export const PRIZE = { x: 6.07, z: 5.1, wallX: 9 };

// ---- floor ----
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
// is (x, z) in the hall? m > 0: at least m in from the walls; m < 0: or within |m| outside them
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

// ---- outline: the inside's boundary walked once round, the door jambs among its points ----
let _poly = null;
export function hallPolygon() {
  if (_poly) return _poly;
  const { C, R, ARM, N1, WING, FRONT, DOOR } = HALL;
  const dz = (WING.z1 - WING.z0) / 2;                                   // wing half width
  const aArm = Math.acos(ARM / R), aWing = Math.asin(dz / R);          // where arm and wing walls meet the corner arc
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
// the polygon pushed outward by d (mitred corners); its signed area says which side is out
export function offsetPolygon(P, d) {
  let a = 0;
  for (let i = 0; i < P.length; i++) { const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length]; a += x1 * z2 - x2 * z1; }
  const s = a > 0 ? 1 : -1;                                            // turns an edge direction into its outward normal
  const nrm = (p, q) => { const x = q[0] - p[0], z = q[1] - p[1], l = Math.hypot(x, z) || 1; return [s * z / l, -s * x / l]; };
  return P.map((v, i) => {
    const n1 = nrm(P[(i + P.length - 1) % P.length], v), n2 = nrm(v, P[(i + 1) % P.length]);
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [v[0] + (n1[0] + n2[0]) * k, v[1] + (n1[1] + n2[1]) * k];
  });
}
// the walls as straight runs of the outline (door gap left out): inner and outer end points, direction (u), outward
// normal (n), a box's yaw along it, and the band's extent tmin..tmax from the run's start (mitres change the outer length)
export function wallEdges() {
  const P = hallPolygon(), PO = offsetPolygon(P, WALL), E = [];
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length, p = P[i], q = P[j], o = PO[i], o2 = PO[j];
    if (p[1] === HALL.FRONT && q[1] === HALL.FRONT && Math.abs(p[0]) <= HALL.DOOR && Math.abs(q[0]) <= HALL.DOOR) continue;   // door gap
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / len, uz = (q[1] - p[1]) / len;
    let nx = uz, nz = -ux;
    if ((o[0] - p[0]) * nx + (o[1] - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
    const t = [0, len, (o[0] - p[0]) * ux + (o[1] - p[1]) * uz, (o2[0] - p[0]) * ux + (o2[1] - p[1]) * uz];
    E.push({ i, p, q, o, o2, len, olen: Math.hypot(o2[0] - o[0], o2[1] - o[1]), ux, uz, nx, nz, yaw: Math.atan2(-uz, ux), tmin: Math.min(...t), tmax: Math.max(...t),
      mx: (p[0] + q[0]) / 2, mz: (p[1] + q[1]) / 2, omx: (o[0] + o2[0]) / 2, omz: (o[1] + o2[1]) / 2 });
  }
  return E;
}
// one collider box per run: middle (x, z), half length hx along, half thickness hz across, yaw
export const wallBoxes = (E = wallEdges()) => E.map((e) => {
  const tc = (e.tmin + e.tmax) / 2;
  return { x: e.p[0] + e.ux * tc + e.nx * WALL / 2, z: e.p[1] + e.uz * tc + e.nz * WALL / 2, hx: (e.tmax - e.tmin) / 2, hz: WALL / 2, yaw: e.yaw };
});
// is (x, z) in a box? (as the colliders read it: yaw about y turns local x to (cos, -sin))
export const inBox = (b, x, z, grow = 0) => { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), sn = Math.sin(b.yaw); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) <= b.hx + grow && Math.abs(lz) <= b.hz + grow; };
