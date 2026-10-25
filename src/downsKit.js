import * as THREE from 'three';
import { T, G } from './outpostModels.js';
import { downsNode, downsSlot } from './models.js';
import { waterMesh } from './fountainFx.js';
import { part } from './settlements.js';
import { ARCADE, WEDGE } from './downsPlan.js';
import { inkMat } from './toon.js';

// Shared by Chimera Downs' builders: palette, text widths, baking a Blender kit part into a settlement kit (docs/downs-layouts.md).
// Palette: Gold Gleam, Saddle Brown, Black, Money, Barn Red, Touch of Mint (darker tints for shading).
export const PAL = { gold: 0xcfb352, saddle: 0xb07c57, black: 0x3b393a, money: 0x7b9a6e, barn: 0x8b4044, mint: 0xf8fff8 };
export const MINT2 = 0xdfe8dd, MONEY2 = 0x5b7a52, SADDLE2 = 0x8c5f3f, BLACK2 = 0x5a5760, CONC = 0xc6d1c4, CONC2 = 0xb2bfb0;
export const FG = { gold: '#cfb352', mint: '#f8fff8' }, BG = { black: '#3b393a', money: '#5b7a52', barn: '#6a2e33' };
// Kit.text sign width for a letter height (pixel font is ~square per character)
export const tw = (str, h) => h * (0.347 * str.length + 0.667);

const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Vector3(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler();
const matFor = (slot, over) => { const c = downsSlot(slot, over); return c.glow ? G(c.color) : T(c.color); };

// Bake a kit part into `k`'s current frame at (x, y, z), turned `ry` about y, scaled (sx, sy, sz); `over` maps slot to replacement colour.
export function bake(k, name, x = 0, y = 0, z = 0, { ry = 0, sx = 1, sy = 1, sz = 1, over } = {}) {
  _M.compose(_P.set(x, y, z), _Q.setFromAxisAngle(_Y, ry), _S.set(sx, sy, sz));
  const tag = k.tag;
  k.tag = `${tag}>${name}`;
  const node = downsNode(name);
  k.baked(node, (slot) => matFor(slot, over), _M);
  // its colliders, written by the Blender build from the part's own geometry (downs_common.py Acc, parts(..., solid=True))
  for (const n of node.kids) {
    if (n.role !== 'col') continue;
    const d = n.data;
    _c.copy(n.pos).applyMatrix4(_M);
    if (d.shape === 'cyl') { const by = k.P(0, 0, 0).y; k.column(d.r * Math.max(sx, sz), by + _c.y + d.h * sy, _c.x, _c.z, by + _c.y); }   // (column takes heights unlifted by the frame; the part is lifted)
    else {
      _cq.setFromEuler(_ce.set(d.rx || 0, d.ry || 0, d.rz || 0, 'ZYX')).premultiply(_Q);   // (xf's euler: X, then Y, then Z)
      k.solidQ(d.hx * sx, d.hy * sy, d.hz * sz, _c.x, _c.y, _c.z, _cq, { auto: true });
    }
  }
  k.tag = tag;
}

// Forecourt fountain (dn_fountain, tools/blender/build_downs_arcade.py) at (x, z) of the kit frame: basin, pedestal, bowl, stem baked;
// the derby cup turns; ripples, lip curtain and jets use the casino fountain's shaders (fountainFx.js). Colliders: basin, pedestal, stem.
export function fountain(k, x, z, y = 0) {
  const F = downsNode('dn_fountain'), I = new THREE.Matrix4();
  k.at(x, z, 0, y);                                                               // y: ground it stands on (the forecourt avenue)
  bake(k, 'dn_fountain');
  for (const n of F.kids) {
    if (n.role === 'spin') {
      const piece = part(0xffffff, (q) => q.baked(n, (slot) => matFor(slot), I));
      piece.userData.spin = n.data.speed || 0.7;
      k.dyn(piece, n.pos.x, n.pos.y, n.pos.z);
    } else if (n.role !== 'col') k.dyn(waterMesh(n), n.pos.x, n.pos.y, n.pos.z);
  }
  k.at();
  k.column(9.8, 1.05 + y, x, z, y);
  k.column(2.7, 4.7 + y, x, z, y);
  k.column(1.7, 9.2 + y, x, z, 4.7 + y);
}

// ---- arcade continuous parts ----
// Closed solid from edge-sharing convex polygons: polys [{ pts: [[x, z]...], yb(x, z), yt?(x, z) }], each from yb up to yt (or h above yb).
// Shared edges get no side faces, so pieces join seamlessly (shared edges need the same ends and the same heights on both sides).
export function sheet(polys, h = 0) {
  const K = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const ek = (p, q) => { const a = K(p), b = K(q); return a < b ? `${a}|${b}` : `${b}|${a}`; };
  const uses = new Map();
  const rings = polys.map(({ pts, yb, yt }) => {
    const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ring = area > 0 ? [...pts].reverse() : pts;                         // clockwise on the x-right, z-up plan: top faces up, sides out
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

// Outline shell of a flat-faced solid (a sheet): each corner moves to where its surrounding face planes, offset by `ink`, meet.
// Kit.add's outline scales about the middle, fine for compact parts; long curved ones need a per-face offset.
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
  for (const [k, list] of planes) {                                             // least squares for o . n = ink over the corner's planes (damped for near-equal planes)
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
  g.setIndex(Array.from({ length: q.length / 3 }, (_, i) => i));                // kit shells are indexed: curve.js bends them by index
  return g;
}

// arcadeShell sink into a kit (plain frame: k.at() first), with inkShell as the outline.
export const kitSink = (k) => (geo, color, ink) => {
  if (ink) k.ink.push(inkShell(geo, ink));
  k.add(geo, T(color), 0, 0, 0, { outline: 0 });
};

// A box round a flat piece: outline `pts` [[x, z]...] on the plane y = yb(x, z) (linear), h thick above it, squared to its first edge.
// Calls solid(hx, hy, hz, x, y, z, q) with the box's centre and turn.
const _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sz = new THREE.Vector3(), _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion();
function slabBox(pts, yb, h, solid) {
  let ux = pts[1][0] - pts[0][0], uz = pts[1][1] - pts[0][1];
  const l = Math.hypot(ux, uz); ux /= l; uz /= l;
  const vx = -uz, vz = ux;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const [x, z] of pts) { const u = (x - pts[0][0]) * ux + (z - pts[0][1]) * uz, v = (x - pts[0][0]) * vx + (z - pts[0][1]) * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, cx = pts[0][0] + ux * cu + vx * cv, cz = pts[0][1] + uz * cu + vz * cv;
  const y = yb(cx, cz), gx = yb(cx + 1, cz) - y, gz = yb(cx, cz + 1) - y;                 // the plane's rise per metre in x and z
  const su = gx * ux + gz * uz, sv = gx * vx + gz * vz;                                      // and along the box's two ground axes
  _sx.set(ux, su, uz).normalize(); _sz.set(vx, sv, vz).normalize();
  _sy.crossVectors(_sz, _sx).normalize(); _sz.crossVectors(_sx, _sy);
  _sq.setFromRotationMatrix(_sm.makeBasis(_sx, _sy, _sz));
  solid(((u1 - u0) / 2) * Math.hypot(1, su), h / 2, ((v1 - v0) / 2) * Math.hypot(1, sv), cx + _sy.x * h / 2, y + _sy.y * h / 2, cz + _sy.z * h / 2, _sq);
}

// Arcade parts that run across bays, one piece per run so bays show no seam: back wall (wainscot, string course, cornice), architrave
// with gold band, walk-edge gold inlay, fascia with gold lip, roof with Mint ceiling. Per-bay fittings are the Blender wedge dn_arcade,
// authored to these measures.
// `edges`: radial edges in degrees round the turn centre (cx, 0), west arcade's way round (`mir` -1 mirrors for the east).
// `stand`: the run's stand end ({ atStart, wallU, rearZ }, as joiner in downsWorld.js): the run continues past its last edge along the
// back/front circle chords into the stand's end wall, every piece ending inside it (behind the far stand the back wall ends on the
// diagonal shared with the return). Wedge local z runs outward from the inner chord: radius ri + z / cos(half step).
// Roof underside rises 7.15 m at the front (z -0.8) to 8.38 m just past the back wall (z = d + 0.1), resting on the cornice (8.1 to 8.4).
export const ROOF = { y0: 7.15, k: (8.38 - 7.15) / (WEDGE.d + 0.9) };
// `solid(hx, hy, hz, x, y, z, q)`, if given, takes a collider for each roof deck piece (a box on its raked plane; the walls have theirs
// in downsWorld.js).
export function arcadeShell(sink, { mir = 1, cx = ARCADE.cx, edges, stand = null, solid = null }) {
  const R = Math.PI / 180, ca = Math.cos(WEDGE.a2), D = WEDGE.d;
  const polar = (r, t) => [mir * (-cx + r * Math.cos(t * R)), r * Math.sin(t * R)];
  const Pz = (t, z) => polar(ARCADE.ri + z / ca, t);
  const Oc = [mir * -cx, 0];
  let J = null;
  if (stand) {
    const { atStart, wallU, rearZ } = stand, south = rearZ !== null && rearZ !== undefined;
    const te = atStart ? edges[0] : edges[edges.length - 1];
    const onWall = (r) => { const t = Math.acos((wallU + cx) / r) / R; return south ? 360 - t : t; };   // angle where circle r meets the wall
    const chord = (p0, p1) => {
      const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), u = [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
      let n = [-u[1], u[0]];
      if (n[0] * (p0[0] - Oc[0]) + n[1] * (p0[1] - Oc[1]) < 0) n = [-n[0], -n[1]];                    // outward, away from the turn centre
      return { p0, u, n };
    };
    const at = (c, off, [Q, m]) => {                                                                    // chord line offset `off` outward, crossing plane [Q, m]
      const ox = c.p0[0] + c.n[0] * off, oz = c.p0[1] + c.n[1] * off, s = ((Q[0] - ox) * m[0] + (Q[1] - oz) * m[1]) / (c.u[0] * m[0] + c.u[1] * m[1]);
      return [ox + c.u[0] * s, oz + c.u[1] * s];
    };
    const xPlane = (x) => [[mir * x, 0], [1, 0]];
    const back = chord(Pz(te, D), polar(ARCADE.ro, onWall(ARCADE.ro))), front = chord(Pz(te, 0), polar(ARCADE.ri, onWall(ARCADE.ri)));
    const outFace = xPlane(wallU + 0.82);
    const K1 = at(back, 0, outFace), Jin = at(back, -0.7, xPlane(wallU));
    J = { te, tm: te + (atStart ? 1 : -1) * ARCADE.step / 2, south, rearZ, wallU, back, front, at, xPlane, outFace, diag: [K1, [-(Jin[1] - K1[1]), Jin[0] - K1[0]]] };
  }
  // Every piece ends buried: in the gate hall block at the open end, in the stand's end wall at the other. Each ends on its own plane,
  // `ov` m apart (along the edge tangent into the block; from wallU + 0.4 into the wall), so no two end faces z-fight.
  const gi = !stand ? -1 : stand.atStart ? edges.length - 1 : 0, gs = gi < 0 ? 0 : Math.sign(edges[gi] - edges[gi ? gi - 1 : 1]);
  const Pe = (i, z, ov) => {                                                                      // point at local z on edge i; the gate end's moved ov out of the run
    const p = Pz(edges[i], z);
    if (i !== gi || !ov) return p;
    const t = edges[i] * R, d = gs * ov;
    return [p[0] - mir * Math.sin(t) * d, p[1] + Math.cos(t) * d];
  };
  const inWall = (ov) => J.xPlane(J.wallU + 0.4 + ov);
  const band = (zA, zB, y0, y1, color, ink, side, ov, diag = false) => {
    const polys = [];
    for (let i = 0; i < edges.length - 1; i++) polys.push({ pts: [Pe(i, zA, ov), Pe(i + 1, zA, ov), Pe(i + 1, zB, ov), Pe(i, zB, ov)], yb: () => y0 });
    if (J) {
      const c = side === 'back' ? J.back : J.front, zr = side === 'back' ? D : 0, pl = diag ? J.diag : inWall(ov);
      polys.push({ pts: [Pz(J.te, zA), Pz(J.te, zB), J.at(c, zB - zr, pl), J.at(c, zA - zr, pl)], yb: () => y0 });
    }
    sink(sheet(polys, y1 - y0), color, ink);
  };
  band(D - 0.7, D, -0.05, 8.3, PAL.mint, 0.03, 'back', 0, J && J.south);                      // back wall from below ground (bay floors end inside it, burying floor edges and the outline foot; behind the far stand it ends on the return diagonal)
  band(D - 0.84, D - 0.7, 0.14, 2.4, MONEY2, 0, 'back', 0.02);                                 // wainscot
  band(D - 0.78, D - 0.7, 4.4, 4.75, MONEY2, 0, 'back', 0.04);                                 // string course
  band(D - 1.0, D + 0.1, 8.1, 8.4, PAL.gold, 0.012, 'back', 0.06);                             // cornice
  band(0, 0.35, 0.14, 0.17, PAL.gold, 0, 'front', 0.08);                                       // walk-edge inlay
  band(0.1, 1.0, 6.5, 7.1, MINT2, 0.012, 'front', 0.1);                                        // architrave over the colonnade
  band(0.08, 1.06, 6.44, 6.58, PAL.gold, 0.012, 'front', 0.12);                                // its gold band
  band(-0.92, -0.68, 6.15, 7.2, PAL.mint, 0.03, 'front', 0.14);                                // fascia, up into the roof
  band(-0.98, -0.62, 6.05, 6.15, PAL.gold, 0.012, 'front', 0.16);                              // its gold lip
  // roof: each bay's deck is a plane raked along its middle radius (neighbours meet on the shared edge); the stand bay uses its
  // neighbour's plane. Behind the far stand the deck runs over the return and 18 cm past its outer face as an eave (off that face's plane)
  const yOn = (tm, dy) => { const c = Math.cos(tm * R), s = Math.sin(tm * R); return (x, z) => ROOF.y0 + ((mir * x + cx) * c + z * s - WEDGE.r0 + 0.8) * ROOF.k + dy; };
  const roof = (zf, zb, dy, ov, overReturn) => {
    const polys = [];
    for (let i = 0; i < edges.length - 1; i++) polys.push({ pts: [Pe(i, zf, ov), Pe(i + 1, zf, ov), Pe(i + 1, zb, ov), Pe(i, zb, ov)], yb: yOn((edges[i] + edges[i + 1]) / 2, dy) });
    if (J && overReturn && J.south) {
      const K = J.at(J.back, zb - D, J.outFace), E = [mir * (J.wallU + 0.82), J.rearZ], eave = J.xPlane(J.wallU + 1.0);
      polys.push({ pts: [Pz(J.te, zf), Pz(J.te, zb), K, E, J.at(J.front, zf, inWall(ov))], yb: yOn(J.tm, dy) });
      polys.push({ pts: [K, J.at(J.back, zb - D, eave), [mir * (J.wallU + 1.0), J.rearZ], E], yb: yOn(J.tm, dy) });
    } else if (J) polys.push({ pts: [Pz(J.te, zf), Pz(J.te, zb), J.at(J.back, zb - D, inWall(ov)), J.at(J.front, zf, inWall(ov))], yb: yOn(J.tm, dy) });
    return polys;
  };
  const deck = roof(-0.8, D + 0.2, 0, 0.18, true);
  sink(sheet(deck, 0.32), PAL.barn, 0.025);
  if (solid) for (const p of deck) slabBox(p.pts, p.yb, 0.32, solid);
  // ceiling, one piece under the run: from inside the fascia to inside the cornice (back edge buried), at the stands into the end wall
  // and the return (not out to its outer face)
  sink(sheet(roof(-0.7, D - 0.3, -0.07, 0.2, false), 0.07), MINT2, 0);
}

// One bay's run pieces as plain meshes in dn_arcade's frame (inner chord middle at origin, +z outward), for the Asset Row's lone wedge.
export function arcadeBayShell() {
  const g = new THREE.Group(), s2 = ARCADE.step / 2;
  arcadeShell((geo, color, ink) => {
    g.add(new THREE.Mesh(geo, T(color)));
    if (ink) g.add(new THREE.Mesh(inkShell(geo, ink), inkMat));
  }, { cx: 0, edges: [90 + s2, 90 - s2] });
  g.position.z = -WEDGE.r0;
  return g;
}
