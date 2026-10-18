import * as THREE from 'three';
import { T, G } from './outpostModels.js';
import { downsNode, downsSlot } from './models.js';
import { waterMesh } from './fountainFx.js';
import { part } from './settlements.js';
import { ARCADE, WEDGE } from './downsPlan.js';
import { inkMat } from './toon.js';

// What Chimera Downs' builders share: the palette, the text widths and the way a Blender kit part is baked into a settlement's kit (docs/downs-layouts.md).
// The palette: Gold Gleam, Saddle Brown, Black, Money, Barn Red, Touch of Mint (a darker tint of each for shading).
export const PAL = { gold: 0xcfb352, saddle: 0xb07c57, black: 0x3b393a, money: 0x7b9a6e, barn: 0x8b4044, mint: 0xf8fff8 };
export const MINT2 = 0xdfe8dd, MONEY2 = 0x5b7a52, SADDLE2 = 0x8c5f3f, BLACK2 = 0x5a5760, CONC = 0xc6d1c4, CONC2 = 0xb2bfb0;
export const FG = { gold: '#cfb352', mint: '#f8fff8' }, BG = { black: '#3b393a', money: '#5b7a52', barn: '#6a2e33' };
// width of a Kit.text sign for a given letter height (the pixel font is ~square per character)
export const tw = (str, h) => h * (0.347 * str.length + 0.667);

const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const matFor = (slot, over) => { const c = downsSlot(slot, over); return c.glow ? G(c.color) : T(c.color); };

// Bake a kit part into `k` in its current frame: at (x, y, z) turned `ry` about y, scaled (sx, sy, sz); `over` maps a slot to the colour it should wear instead.
export function bake(k, name, x = 0, y = 0, z = 0, { ry = 0, sx = 1, sy = 1, sz = 1, over } = {}) {
  _M.compose(_P.set(x, y, z), _Q.setFromAxisAngle(_Y, ry), _S.set(sx, sy, sz));
  const tag = k.tag;
  k.tag = `${tag}>${name}`;
  k.baked(downsNode(name), (slot) => matFor(slot, over), _M);
  k.tag = tag;
}

// The forecourt's fountain (dn_fountain, tools/blender/build_downs_arcade.py) at (x, z) of the kit's frame: the basin, pedestal, bowl and stem are baked in; the derby cup on top turns, and the two tiers'
// ripples, the curtain over the bowl's lip and the jets run on the shaders the casino's fountain uses (fountainFx.js). Colliders for the basin, the pedestal and the stem.
export function fountain(k, x, z) {
  const F = downsNode('dn_fountain'), I = new THREE.Matrix4();
  k.at(x, z);
  bake(k, 'dn_fountain');
  for (const n of F.kids) {
    if (n.role === 'spin') {
      const piece = part(0xffffff, (q) => q.baked(n, (slot) => matFor(slot), I));
      piece.userData.spin = n.data.speed || 0.7;
      k.dyn(piece, n.pos.x, n.pos.y, n.pos.z);
    } else k.dyn(waterMesh(n), n.pos.x, n.pos.y, n.pos.z);
  }
  k.at();
  k.column(9.8, 1.05, x, z);
  k.column(2.7, 4.7, x, z);
  k.column(1.7, 9.2, x, z, 4.7);
}

// ---- the arcades' continuous parts ----
// A closed solid from convex polygons that share edges: polys [{ pts: [[x, z]...], yb(x, z), yt?(x, z) }], each from its own yb up to yt (or h above yb). An edge that two
// polygons share gets no side faces, so the pieces join into one surface with no seam where they meet (shared edges must have the same ends, and the same heights from both sides).
export function sheet(polys, h = 0) {
  const K = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const ek = (p, q) => { const a = K(p), b = K(q); return a < b ? `${a}|${b}` : `${b}|${a}`; };
  const uses = new Map();
  const rings = polys.map(({ pts, yb, yt }) => {
    const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ring = area > 0 ? [...pts].reverse() : pts;                         // (clockwise on the x-right, z-up plan: the top faces up, the sides face out)
    ring.forEach((p, i) => { const e = ek(p, ring[(i + 1) % ring.length]); uses.set(e, (uses.get(e) || 0) + 1); });
    return { ring, yb, yt };
  });
  const pos = [], tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (const { ring, yb, yt } of rings) {
    const lo = (p) => [p[0], yb(p[0], p[1]), p[1]], hi = (p) => [p[0], yt ? yt(p[0], p[1]) : yb(p[0], p[1]) + h, p[1]];
    for (let i = 1; i < ring.length - 1; i++) {
      tri(hi(ring[0]), hi(ring[i]), hi(ring[i + 1]));
      tri(lo(ring[0]), lo(ring[i + 1]), lo(ring[i]));
    }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      if (uses.get(ek(p, q)) > 1) continue;
      tri(lo(p), lo(q), hi(q));
      tri(lo(p), hi(q), hi(p));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// The outline shell of a solid made of flat faces (a sheet): each corner pushed out to where the planes of the faces round it, moved out by `ink`, meet. The kit's own
// outline (Kit.add) scales a part about its middle, which only suits compact parts: a long curved one needs its shell offset face by face.
export function inkShell(geo, ink) {
  const p = geo.attributes.position.array, key = (i) => `${Math.round(p[i] * 1e3)},${Math.round(p[i + 1] * 1e3)},${Math.round(p[i + 2] * 1e3)}`;
  const planes = new Map();
  for (let t = 0; t < p.length; t += 9) {
    const ax = p[t + 3] - p[t], ay = p[t + 4] - p[t + 1], az = p[t + 5] - p[t + 2], bx = p[t + 6] - p[t], by = p[t + 7] - p[t + 1], bz = p[t + 8] - p[t + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    for (let v = 0; v < 9; v += 3) {
      const k = key(t + v), list = planes.get(k) || [];
      if (!list.some((n) => n[0] * nx + n[1] * ny + n[2] * nz > 0.99999)) list.push([nx, ny, nz]);
      planes.set(k, list);
    }
  }
  const off = new Map();
  for (const [k, list] of planes) {                                             // least squares for o . n = ink over the corner's planes (a little damped, for planes almost alike)
    const a = [1e-4, 0, 0, 0, 1e-4, 0, 0, 0, 1e-4], b = [0, 0, 0];
    for (const n of list) for (let r = 0; r < 3; r++) { b[r] += ink * n[r]; for (let c = 0; c < 3; c++) a[r * 3 + c] += n[r] * n[c]; }
    const o = new THREE.Vector3(...b).applyMatrix3(new THREE.Matrix3().set(...a).invert());
    if (o.length() > 4 * ink) o.setLength(4 * ink);
    off.set(k, o);
  }
  const q = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { const o = off.get(key(i)) || _P.set(0, 0, 0); q[i] = p[i] + o.x; q[i + 1] = p[i + 1] + o.y; q[i + 2] = p[i + 2] + o.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(q, 3));
  g.setIndex(Array.from({ length: q.length / 3 }, (_, i) => i));                // (the kit's shells are indexed: curve.js bends them by their index)
  return g;
}

// Where arcadeShell puts its pieces: into a kit (in its plain frame: k.at() first), with the shell as the piece's outline.
export const kitSink = (k) => (geo, color, ink) => {
  if (ink) k.ink.push(inkShell(geo, ink));
  k.add(geo, T(color), 0, 0, 0, { outline: 0 });
};

// The parts of an arcade that run on from bay to bay, built as one piece per run so no seam shows where two bays meet: the back wall with its wainscot, string course and
// cornice, the architrave over the colonnade with its gold band, the gold inlay along the walk's edge, the fascia and its gold lip, and the roof with its Mint ceiling. The
// bays' own fittings (floor, column, windows, lamps, rafter, roof ribs, pennants) are the Blender wedge, dn_arcade, which is authored to these measures.
// `edges`: the run's radial edges, in degrees round the turn's centre (cx, 0) (the west arcade's way round; `mir` -1 mirrors it for the east one). `stand`: the run's end at a
// stand ({ atStart, wallU, rearZ }, as joiner in downsWorld.js): the run goes on past its last edge to the stand's end wall, along the chords of its back and front circles
// from that edge to the wall, every piece ending inside the wall (behind the far stand, the back wall ends on the diagonal it shares with the return). A wedge's local z
// runs outward from its inner chord, so a radial edge's point at local z is at radius ri + z / cos(half the step).
// The roof's underside rises from 7.15 m at its front edge (local z -0.8) to 8.38 m just past the back wall's outer face (z = d + 0.1), so it rests on the cornice (8.1 to 8.4).
export const ROOF = { y0: 7.15, k: (8.38 - 7.15) / (WEDGE.d + 0.9) };
export function arcadeShell(sink, { mir = 1, cx = ARCADE.cx, edges, stand = null }) {
  const R = Math.PI / 180, ca = Math.cos(WEDGE.a2), D = WEDGE.d;
  const polar = (r, t) => [mir * (-cx + r * Math.cos(t * R)), r * Math.sin(t * R)];
  const Pz = (t, z) => polar(ARCADE.ri + z / ca, t);
  const Oc = [mir * -cx, 0];
  let J = null;
  if (stand) {
    const { atStart, wallU, rearZ } = stand, south = rearZ !== null && rearZ !== undefined;
    const te = atStart ? edges[0] : edges[edges.length - 1];
    const onWall = (r) => { const t = Math.acos((wallU + cx) / r) / R; return south ? 360 - t : t; };   // (the angle at which circle r meets the wall)
    const chord = (p0, p1) => {
      const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), u = [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
      let n = [-u[1], u[0]];
      if (n[0] * (p0[0] - Oc[0]) + n[1] * (p0[1] - Oc[1]) < 0) n = [-n[0], -n[1]];                    // (outward, away from the turn's centre)
      return { p0, u, n };
    };
    const at = (c, off, [Q, m]) => {                                                                    // the chord's line moved `off` outward, where it crosses plane [Q, m]
      const ox = c.p0[0] + c.n[0] * off, oz = c.p0[1] + c.n[1] * off, s = ((Q[0] - ox) * m[0] + (Q[1] - oz) * m[1]) / (c.u[0] * m[0] + c.u[1] * m[1]);
      return [ox + c.u[0] * s, oz + c.u[1] * s];
    };
    const xPlane = (x) => [[mir * x, 0], [1, 0]];
    const back = chord(Pz(te, D), polar(ARCADE.ro, onWall(ARCADE.ro))), front = chord(Pz(te, 0), polar(ARCADE.ri, onWall(ARCADE.ri)));
    const inWall = xPlane(wallU + 0.4), outFace = xPlane(wallU + 0.82);
    const K1 = at(back, 0, outFace), Jin = at(back, -0.7, xPlane(wallU));
    J = { te, tm: te + (atStart ? 1 : -1) * ARCADE.step / 2, south, rearZ, wallU, back, front, at, inWall, outFace, diag: [K1, [-(Jin[1] - K1[1]), Jin[0] - K1[0]]] };
  }
  const band = (zA, zB, y0, y1, color, ink, side, end = 'inWall') => {
    const polys = [];
    for (let i = 0; i < edges.length - 1; i++) polys.push({ pts: [Pz(edges[i], zA), Pz(edges[i + 1], zA), Pz(edges[i + 1], zB), Pz(edges[i], zB)], yb: () => y0 });
    if (J) {
      const c = side === 'back' ? J.back : J.front, zr = side === 'back' ? D : 0, pl = J[end];
      polys.push({ pts: [Pz(J.te, zA), Pz(J.te, zB), J.at(c, zB - zr, pl), J.at(c, zA - zr, pl)], yb: () => y0 });
    }
    sink(sheet(polys, y1 - y0), color, ink);
  };
  band(D - 0.7, D, 0.14, 8.3, PAL.mint, 0.03, 'back', J && J.south ? 'diag' : 'inWall');   // the back wall
  band(D - 0.84, D - 0.7, 0.14, 2.4, MONEY2, 0, 'back');                                       // its wainscot
  band(D - 0.78, D - 0.7, 4.4, 4.75, MONEY2, 0, 'back');                                       // the string course
  band(D - 1.0, D + 0.1, 8.1, 8.4, PAL.gold, 0.012, 'back');                                   // the cornice
  band(0, 0.35, 0.14, 0.17, PAL.gold, 0, 'front');                                             // the inlay along the walk's edge
  band(0.1, 1.0, 6.5, 7.1, MINT2, 0.012, 'front');                                             // the architrave over the colonnade
  band(0.08, 1.06, 6.44, 6.58, PAL.gold, 0.012, 'front');                                      // its gold band
  band(-0.92, -0.68, 6.15, 7.2, PAL.mint, 0.03, 'front');                                      // the fascia, up into the roof
  band(-0.98, -0.62, 6.05, 6.15, PAL.gold, 0.012, 'front');                                    // its gold lip
  // the roof: each bay's deck a plane raked along its own middle radius (so two bays' decks meet on their shared edge), and the bay at the stand on its neighbour's plane
  const yOn = (tm, dy) => { const c = Math.cos(tm * R), s = Math.sin(tm * R); return (x, z) => ROOF.y0 + ((mir * x + cx) * c + z * s - WEDGE.r0 + 0.8) * ROOF.k + dy; };
  const roof = (zf, zb, dy) => {
    const polys = [];
    for (let i = 0; i < edges.length - 1; i++) polys.push({ pts: [Pz(edges[i], zf), Pz(edges[i + 1], zf), Pz(edges[i + 1], zb), Pz(edges[i], zb)], yb: yOn((edges[i] + edges[i + 1]) / 2, dy) });
    if (J) {
      const pts = J.south ? [Pz(J.te, zf), Pz(J.te, zb), J.at(J.back, zb - D, J.outFace), [mir * (J.wallU + 0.82), J.rearZ], J.at(J.front, zf, J.inWall)]
        : [Pz(J.te, zf), Pz(J.te, zb), J.at(J.back, zb - D, J.inWall), J.at(J.front, zf, J.inWall)];
      polys.push({ pts, yb: yOn(J.tm, dy) });
    }
    return polys;
  };
  sink(sheet(roof(-0.8, D + 0.2, 0), 0.32), PAL.barn, 0.025);
  sink(sheet(roof(-0.7, D + 0.1, -0.07), 0.07), MINT2, 0);                                    // the ceiling, one piece under the whole run
}

// One bay's run pieces as plain meshes in the wedge's own frame (dn_arcade's: the inner chord's middle at the origin, +z outward), for the Asset Row, which shows the wedge alone.
export function arcadeBayShell() {
  const g = new THREE.Group(), s2 = ARCADE.step / 2;
  arcadeShell((geo, color, ink) => {
    g.add(new THREE.Mesh(geo, T(color)));
    if (ink) g.add(new THREE.Mesh(inkShell(geo, ink), inkMat));
  }, { cx: 0, edges: [90 + s2, 90 - s2] });
  g.position.z = -WEDGE.r0;
  return g;
}
