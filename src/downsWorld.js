import * as THREE from 'three';
import { settle } from './settlements.js';
import { ferrisWheel, carousel, queue } from './downsFair.js';
import { T, G } from './outpostModels.js';
import { PAL, MINT2, MONEY2, SADDLE2, BLACK2, CONC, CONC2, FG, BG, tw, bake, fountain, sheet, kitSink, arcadeShell, ROOF } from './downsKit.js';
import {
  SEGS, RAIL_IN, RAIL_OUT, DIRT, FINISH_U, FINISH_X, STAND, FAR, CLUB, ENTRIES, ARCADE, WEDGE, STALLS, STALL_ORDER, CROSSINGS, CROSS_GAP, FORECOURT, DRUM, PODIUMS, RING, PAVILION, LAWN, STABLES, ANNEX, oval, lapLen,
} from './downsPlan.js';

// Chimera Downs' scenery, built from the Blender kits (tools/blender/build_downs_*.py) and a few code-made surfaces. race.js builds the racecourse itself (the live screens, the
// gate, the crowd) and calls buildDowns for everything that stands still. The layout is docs/downs-layouts.md, Layout B: The Horseshoe.
export { PAL, FG, BG, tw, bake };
const _o = {};

// A flat band round the oval between radii r0 and r1 (track surface, lane lines, turf stripes).
function ovalStrip(r0, r1, y, perCurve = 48) {
  const us = [0, SEGS[0] / 2];
  for (let i = 0; i <= perCurve; i++) us.push(SEGS[0] + (SEGS[1] * i) / perCurve);
  us.push(SEGS[0] + SEGS[1] + SEGS[2] / 2);
  for (let i = 0; i <= perCurve; i++) us.push(SEGS[0] + SEGS[1] + SEGS[2] + (SEGS[3] * i) / perCurve);
  const pos = [], nor = [], idx = [];
  for (const u of us) for (const r of [r0, r1]) { oval(u, r, _o); pos.push(_o.x, y, _o.z); nor.push(0, 1, 0); }
  for (let i = 0; i < us.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// A lamp post of the kit (dn_lamp: its arm and lit globe reach toward the model's +x) at (x, z) with its head turned toward (tx, tz).
function lamp(k, x, z, tx, tz) {
  k.at(x, z, 0);
  bake(k, 'dn_lamp', 0, 0, 0, { ry: Math.atan2(-(tz - z), tx - x) });
  k.at();
}

// ---- the oval: the turf, the dirt, the lanes, the rails, the finish ----
function course(k) {
  // the infield mown in bands, the dirt raked in strips, one white line per lane: the surface is one layer, cut into bands that share their edges, not strips laid over a base (layers
  // 1 to 3 cm apart z-fight from a distance)
  const GRASS = 0x86a578, RAKE = 0xa4714e, FLAT = 0.06, SEG = 64;
  const band = (r0, r1, color) => k.add(ovalStrip(r0, r1, FLAT, SEG), T(color), 0, 0, 0, { outline: 0 });
  for (let r = 0; r < DIRT[0] - 1e-6;) {                                                  // (the mown stripes: 4 m of each 8)
    const stripe = r >= 4 && (r - 4) % 8 === 0 && r < 40;
    const r1 = stripe ? r + 4 : (r < 4 ? 4 : r < 40 ? r + 4 : DIRT[0]);
    band(r, Math.min(r1, DIRT[0]), stripe ? GRASS : PAL.money);
    r = r1;
  }
  for (let i = 0; i < 5; i++) {                                                           // (each lane: a raked strip, its outer edge the white line, and bare dirt between)
    const s = DIRT[0] + i * 4;
    band(s, s + 1.82, RAKE); band(s + 1.82, s + 2, PAL.mint); band(s + 2, i < 4 ? s + 4 : DIRT[1], PAL.saddle);
  }
  // rails, inside and out, with a thin wall to hop under each bay. The crossings cut each rail's loop into four runs, each from the barrier post on the far side of one crossing to
  // the post on the near side of the next (the posts are the runs' end posts: dn_crossing), and each run is cut into equal bays of about 5 m (dn_rail: its post at the bay's start,
  // its rails running on into the next bay's post). A run's first bay's own post stands hidden inside the barrier post it starts from and its last bay's rails end inside the
  // barrier post at its far end, so every run of both rails ends the same way, at the same distance from the road. The bays are laid by distance round the rail itself, not round
  // the centre line, so a run's bays are equal on the bends too.
  const XP = CROSS_GAP / 2 + 0.3;                                                         // (a barrier post's middle from its crossing's: its 0.5 m foot 5 cm off the road's edge)
  for (const [r, h] of [[RAIL_IN, 1.0], [RAIL_OUT, 1.2]]) {
    const L = lapLen(r), C = Math.PI * r, S = SEGS[0];
    const at = (s) => {                                                                   // the point s metres round the rail from the home straight's start (u = 0)
      s = ((s % L) + L) % L;
      const u = s < S ? s : s < S + C ? S + ((s - S) / C) * SEGS[1] : s < 2 * S + C ? S + SEGS[1] + (s - S - C) : 2 * S + SEGS[1] + ((s - 2 * S - C) / C) * SEGS[3];
      return oval(u, r, {});
    };
    const gaps = [];                                                                      // each crossing's gap as [from, to] round the rail (the home straight runs +x, the far one -x)
    for (const cx of CROSSINGS) gaps.push([S / 2 + cx - XP, S / 2 + cx + XP], [S + C + S / 2 - cx - XP, S + C + S / 2 - cx + XP]);
    gaps.sort((a, b) => a[0] - b[0]);
    gaps.forEach(([, s0], i) => {
      const s1 = i < gaps.length - 1 ? gaps[i + 1][0] : gaps[0][0] + L, n = Math.max(1, Math.round((s1 - s0) / 5));
      for (let j = 0; j < n; j++) {
        const p = at(s0 + ((s1 - s0) * j) / n), q = at(s0 + ((s1 - s0) * (j + 1)) / n);
        const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz);
        k.at(p.x, p.z, Math.atan2(-dz, dx));
        bake(k, 'dn_rail', 0, 0, 0, { sx: l / 5, sy: h });
        k.at();
        const a = j === 0 ? 0.25 : 0, b = j === n - 1 ? 0.25 : 0, m = (a + (l - b)) / 2 / l;      // (the wall stops at a barrier post's foot, whose column is the post's own)
        k.solid(0.15, h / 2, (l - a - b) / 2, p.x + dx * m, p.z + dz * m, Math.atan2(dx, dz));
      }
    });
  }
  // the crossings: four, at x = +-70 on both straights. The road is one deck exactly as wide as the rails' gap (CROSS_GAP), across the dirt from 0.5 m inside the infield's edge to
  // 0.5 m past the dirt's outer edge (onto the apron), with an outline of its own; its top is 16 cm up, clear of the dirt (6 cm), the apron (12 cm) and the apron's plank lines
  // (13 cm), so no two surfaces share a plane. Its markings are skins 6 mm proud, all 0.4 m wide: a gold edge line down each side 0.3 m in from the deck's sides and ends, and seven
  // Barn Red bars across between the lines, evenly spaced from one rail's line to the other's. The barrier posts (dn_crossing, which end the rail runs) stand at the gap's four
  // corners, on the rails' lines, their feet 5 cm off the deck's sides and their hinge boxes toward the road, the booms all raised straight up; the one across the road is the
  // same model turned half round, which, the model being symmetric about its rail, is its mirror image.
  const DECK = 0.16, DL = DIRT[1] - DIRT[0] + 1.0, ML = 0.4;
  for (const cx of CROSSINGS) for (const sz of [-1, 1]) {
    const zc = sz * (DIRT[0] + DIRT[1]) / 2, zr = sz * (RAIL_IN + RAIL_OUT) / 2;
    k.box(CROSS_GAP, DECK, DL, T(MINT2), cx, 0, zc, { outline: 0.02 });
    for (const sx of [-1, 1]) k.box(ML, 0.016, DL - 0.6, T(PAL.gold), cx + sx * (CROSS_GAP / 2 - 0.3 - ML / 2), DECK - 0.01, zc, { outline: 0 });
    for (let i = 0; i < 7; i++) k.box(CROSS_GAP - 2 * (0.3 + ML), 0.016, ML, T(PAL.barn), cx, DECK - 0.01, zr + ((i - 3) * (RAIL_OUT - RAIL_IN)) / 6, { outline: 0 });
    for (const rz of [RAIL_IN, RAIL_OUT]) for (const dx of [-1, 1]) {
      const x = cx + dx * XP, z = sz * rz;
      k.at(x, z, dx > 0 ? Math.PI : 0);
      bake(k, 'dn_crossing');
      k.at();
      k.column(0.3, 2.0, x, z);                                                            // (up to the lamp on its cap)
      k.column(0.08, 5.2, x - dx * 0.3, z);                                               // (the boom)
    }
  }
  // the finish: a chequered strip across the dirt, the arch over it, the photo-finish tower on the apron
  for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) k.box(0.9, 0.03, 0.9, T((i + j) % 2 ? PAL.black : PAL.mint), FINISH_X - 0.45 + j * 0.9, 0.06, 45.2 + i * 0.95, { outline: 0 });
  k.at(FINISH_X, 54.7, -Math.PI / 2);
  bake(k, 'dn_finish_arch');
  for (const sz of [-1, 1]) k.text('FINISH', 0, 10.1, sz * 0.715, sz > 0 ? 0 : Math.PI, tw('FINISH', 1.4), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });   // (1 cm in front of its panel)
  for (const sx of [-1, 1]) k.solid(0.7, 5.7, 0.8, sx * 11.8, 0);
  k.solid(12.6, 1.3, 0.9, 0, 0, 0, 8.6);                                                  // (the beam and its two belts)
  k.at();
  k.at(FINISH_X - 6, 70.2, 0);                                   // (just short of the line: its far side is where the stand's tunnel comes out onto the apron)
  bake(k, 'dn_photo_tower');
  k.solid(1.5, 4.2, 1.5, 0, 0);
  k.solid(2.6, 1.4, 2.1, 0, 0, 0, 5.1);
  k.at();
  // distance poles counting down to the finish, on the inside rail, the board facing the stands' side of each straight
  for (let d = 100; d <= 600; d += 100) {
    oval(FINISH_U - d, RAIL_IN - 0.6, _o);
    k.at(_o.x, _o.z, Math.atan2(-_o.hz, _o.hx));
    bake(k, 'dn_furlong', 0, 0, 0, { over: { barn: d % 200 ? PAL.barn : PAL.mint } });
    k.text(`${d}`, 0, 2.86, 0.225, 0, tw(`${d}`, 0.5), { fg: FG.mint, bg: BG.money, back: false, off: 0.01 });   // (1 cm in front of the board's face)
    k.at();
    k.column(0.2, 3.56, _o.x, _o.z);
  }
}

// ---- a grandstand: tiers of seats, aisles, a parapet, the suites over the top tier, the roof, the towers and the back wall. Built in the stand's own frame
// (spectators face -z, the front edge is z = 0), turned half way round for the far stand ----
// Every outlined piece that runs along the stand is one piece from end to end (the roof, the back wall, the suites: build_downs_stand.py; the tiers the tunnels run under, the
// parapet between the tunnels), or meets its neighbour at a step of 5 cm or more, or ends inside a bigger solid: two outlined pieces that meet flush show a dark line on the joint
// (one's outline shell pokes out of the other's face). The Blender parts are baked once each, at the stand's origin, and are authored to these numbers (MAIN / FAR there).
function grandstand(k, S, { far = false } = {}) {
  // A prism: the polygon `pts` [[u, v]...] (either winding; concave is fine) in a plane of the current frame, from a0 to a1 along the third axis, as flat-shaded triangles that share no
  // vertices (inkShell offsets it face by face). axis 'z': the polygon is in (x, y), along z (a tier's elevation with the tunnels cut out of its foot); 'x': in (z, y), along x (a
  // tunnel wall's side profile).
  function prism(pts, a0, a1, axis = 'z') {
    const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ring = area < 0 ? [...pts].reverse() : pts;                                       // (counter-clockwise in (u, v): the cap at a1 faces +a, the sides face out)
    const P = (p, a) => (axis === 'z' ? [p[0], p[1], a] : [a, p[1], p[0]]);
    const flip = axis === 'x', pos = [];                                                     // ((z, y, x) is a mirror of (x, y, z): every triangle turned over)
    const tri = (A, B, C) => (flip ? pos.push(...A, ...C, ...B) : pos.push(...A, ...B, ...C));
    for (const [i, j, l] of THREE.ShapeUtils.triangulateShape(ring.map(([u, v]) => new THREE.Vector2(u, v)), [])) {
      let a = ring[i], b = ring[j], c = ring[l];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) [b, c] = [c, b];
      tri(P(a, a1), P(b, a1), P(c, a1));
      tri(P(a, a0), P(c, a0), P(b, a0));
    }
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      tri(P(p, a0), P(q, a0), P(q, a1));
      tri(P(p, a0), P(q, a1), P(p, a1));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  
  // A solid made in the current frame (a prism) with its outline offset face by face (inkShell; the kit's own hull, a scaled copy, only fits a box): both go into the kit in its
  // plain frame, as kitSink wants them.
  function addSolid(k, geo, color, ink) {
    const base = k.base.clone(), yaw = k.yaw;
    geo.applyMatrix4(base);
    k.at();
    kitSink(k)(geo, color, ink);
    k.base.copy(base); k.yaw = yaw;
  }
  const sign = far ? -1 : 1;
  k.at(0, sign * S.z0, far ? Math.PI : 0);
  const len = S.x1 - S.x0, hw = len / 2;
  const topY = S.tiers * S.rise;
  const seatTiers = far ? S.tiers : S.tiers - 1;           // (the main stand's top tier carries the suites)
  const towerW = far ? 7.7 : 8.7, towerD = far ? 8.7 : 9.7, TZ = 0.51;   // (a corner tower's plinth; its shaft's front face is TZ behind the stand's front, so the parapet runs past it)
  const wallH = far ? 14.6 : 22.4;
  const back = (far ? S.tiers * S.depth : (S.tiers - 1) * S.depth + 3.2) + S.wall;   // the back wall's rear face: past the suites on the main stand
  const wallZ = back - S.wall;                                                         // and its front face
  const edges = [S.x0 + 0.8, ...S.aisles.flatMap((a) => [a - 1.2, a + 1.2]), S.x1 - 0.8];
  // The ways in are tunnels: from each entry in the back wall straight through the stand at ground level to the front, 6 m wide and 4 m high. Under the tiers that stand higher than
  // that (TUN_CH) it is a roofed passage: those tiers are cut out at their foot to let it through; in front of them, where the tiers are lower than a person, it is an open trench cut
  // through the steps, and it comes out through a gap in the front parapet onto the apron. `spans` is a width of the stand cut at the tunnels (at `m` either side of each).
  const TUN_W = 3.0, TUN_CH = 4.2, MOUTH = TUN_W + 0.2, CEIL = 4.0;    // (half the tunnel's width; the cut in the tiers' feet, MOUTH a side and TUN_CH high; the ceiling's underside)
  const LINE = MOUTH + 0.05;                                            // (the tunnel's walls run from its side, TUN_W, into the steps' ends, 5 cm deep)
  const spans = (xa, xb, cut = true, m = MOUTH) => {
    const out = [];
    let a = xa;
    if (cut) for (const ex of [...ENTRIES].sort((p, q) => p - q)) { if (ex + m <= xa || ex - m >= xb) continue; if (ex - m > a) out.push([a, ex - m]); a = Math.max(a, ex + m); }
    if (xb > a) out.push([a, xb]);
    return out;
  };
  const roofed = (top) => top > TUN_CH + 0.05;
  const firstRoofed = Array.from({ length: S.tiers }, (_, i) => i).find((i) => roofed((i + 1) * S.rise));
  for (let i = 0; i < S.tiers; i++) {
    const top = (i + 1) * S.rise, z0 = i * S.depth;
    const d = !far && i === S.tiers - 1 ? S.depth + 0.6 : S.depth;     // (the top tier is deeper, under the suites)
    const zc = z0 + d / 2;
    const conc = i % 2 ? CONC : CONC2;
    if (roofed(top)) {
      // a tier the tunnels run under: ONE step the stand's whole length, the tunnels cut out of its foot (a step that ended at each side of a tunnel, with a lintel between,
      // showed a joint across its tread and riser at each side of the tunnel), 2 cm short of each end, so its ends are not in the towers' and end walls' planes
      const xa = -(len - 0.04) / 2, xb = (len - 0.04) / 2, pts = [[xa, 0]];
      for (const ex of [...ENTRIES].sort((p, q) => p - q)) pts.push([ex - MOUTH, 0], [ex - MOUTH, TUN_CH], [ex + MOUTH, TUN_CH], [ex + MOUTH, 0]);
      pts.push([xb, 0], [xb, top], [xa, top]);
      addSolid(k, prism(pts, z0, z0 + d), conc, 0.03);
      for (const [sa, sb] of spans(xa, xb)) k.solid((sb - sa) / 2, top / 2, d / 2, (sa + sb) / 2, zc);
      for (const ex of ENTRIES) k.solid(MOUTH, (top - CEIL) / 2, d / 2, ex, zc, 0, CEIL);
    } else {
      // a tier the trench cuts through: a step each side of it, its end let into the trench's wall
      for (const [xa, xb] of spans(-(len - 0.04) / 2, (len - 0.04) / 2)) {
        k.box(xb - xa, top, d, T(conc), (xa + xb) / 2, 0, zc, { outline: 0.03 });
        k.solid((xb - xa) / 2, top / 2, d / 2, (xa + xb) / 2, zc);
      }
    }
    // a dark nosing along each step's front edge so the rake reads, 1.5 cm proud of the step's top, 4 cm short of its ends (at a trench: 2 cm past the step's end, inside the wall);
    // none on the first step, whose front edge is inside the parapet
    if (i > 0) for (const [xa, xb] of spans(-(len - 0.08) / 2, (len - 0.08) / 2, !roofed(top), MOUTH + 0.02)) k.box(xb - xa, 0.135, 0.16, T(PAL.black), (xa + xb) / 2, top - 0.12, z0 + 0.06, { outline: 0 });
    if (i === firstRoofed) for (const ex of ENTRIES) {                                                  // the step just above where a tunnel's roof starts: a themed barrier, not seats looking down into the cut
      k.box(2 * MOUTH, 0.9, 0.3, T(PAL.barn), ex, top, z0 + 0.5, { outline: 0.03 });
      k.box(2 * MOUTH + 0.2, 0.12, 0.5, T(PAL.gold), ex, top + 0.9, z0 + 0.5, { outline: 0.01 });
      for (let j = -2; j <= 2; j++) k.box(0.9, 0.5, 0.012, T(j % 2 ? PAL.mint : PAL.gold), ex + j * 1.3, top + 0.2, z0 + 0.35, { outline: 0 });        // (banner panels on its face, 6 mm proud)
      k.solid(MOUTH, 0.55, 0.2, ex, z0 + 0.5, 0, top);
    }
    if (i < seatTiers) {
      // seats: strips of three, a run in each section between the aisles; the members' enclosure (the middle sections' upper tiers) in Barn Red
      const clip = z0 < towerD + 0.5 ? hw - towerW - 0.5 : hw;     // (the tower stands in each front corner)
      for (let e = 0; e < edges.length; e += 2) {
        const xa = Math.max(edges[e], -clip), xb = Math.min(edges[e + 1], clip);
        const n = Math.floor((xb - xa) / 2.7);
        if (n < 1) continue;
        const mid = Math.abs((xa + xb) / 2) < 30;
        const col = mid && i > S.tiers - 6 ? PAL.barn : i % 2 ? PAL.mint : PAL.money;
        const x0 = xa + ((xb - xa) - n * 2.7) / 2 + 1.35;
        for (let s = 0; s < n; s++) {
          const sx = x0 + s * 2.7;
          if (i <= firstRoofed && ENTRIES.some((ex) => Math.abs(sx - ex) < MOUTH + 1.5)) continue;          // (no seats where the trench runs, nor against its walls, nor in the row above its roof)
          bake(k, 'dn_seat3', sx, top, z0 + 0.95, { over: { seat: col } });
        }
      }
    }
  }
  // aisle stairs: a half-step on each tread in front of the next riser, down the middle of each aisle (over a tunnel, from the tunnel's roof up: the trench and its barrier are
  // below it), and brass handrails up both sides on posts
  const Z1 = S.tiers * S.depth - 1;
  for (const ax of S.aisles) {
    const over = ENTRIES.some((ex) => Math.abs(ex - ax) < 0.1);
    for (let i = 1; i < seatTiers; i++) {
      if (over && i <= firstRoofed) continue;
      const y0 = over ? CEIL + 0.3 : 0, h = i * S.rise + S.rise / 2 - y0;                           // (it stands on the tread of tier i - 1, i rises up)
      const zf = i * S.depth - S.depth / 2, zb = i * S.depth + 0.05;                                 // (its back let 5 cm into the riser)
      k.box(2.4, h, zb - zf, T(CONC2), ax, y0, (zf + zb) / 2, { outline: 0.015 });
      k.box(2.38, 0.06, 0.12, T(PAL.gold), ax, y0 + h - 0.045, zf + 0.045, { outline: 0 });         // (its brass edge 1.5 cm proud of its front and top)
      k.solid(1.2, h / 2, (zb - zf) / 2, ax, (zf + zb) / 2, 0, y0);
    }
    const zr = over ? firstRoofed * S.depth + 0.8 : 0, rail = (z) => 1.9 + (topY + 0.9 - 1.9) * (z / Z1);   // (over a tunnel: from just behind its barrier)
    const tread = (z) => (Math.floor(z / S.depth) + 1) * S.rise;
    const posts = [zr + 0.25];
    for (let i = 0; i < S.tiers; i += 2) if (i * S.depth + 1.45 > zr + 1 && i * S.depth + 1.45 < Z1 - 1) posts.push(i * S.depth + 1.45);
    if (far) posts.push(Z1 - 0.1);                                                                    // (the main stand's rails end in the suites)
    for (const s of [-1, 1]) {
      const x = ax + s * 1.25;
      k.beam([x, rail(zr), zr], [x, topY + 0.9, Z1], 0.05, T(PAL.gold), { outline: 0.01 });
      for (const z of posts) k.beam([x, tread(z) - 0.02, z], [x, rail(z), z], 0.03, T(PAL.gold), { outline: 0.008 });
    }
  }
  // the front parapet, its sponsor boards and a gold rail along its top. It runs past the corner towers to 6 cm past the end walls' trim (so its end is a step, not a seam); at a
  // tunnel its ends are let into the piers at the trench's mouth (below). Its back is let 16 cm into the first step, the end walls and the towers' plinths (10 cm: their fronts are at
  // 6 cm), so no slot shows between it and them, and the first step's front edge is inside it; the end walls' trim (from 10 cm) comes up out of its top.
  for (const [xa, xb] of spans(-(hw + 1.0), hw + 1.0, true, MOUTH + 0.1)) {               // (its ends 10 cm past the steps' ends, inside the piers: not in their plane)
    k.box(xb - xa, 1.3, 0.535, T(MONEY2), (xa + xb) / 2, 0, -0.1075, { outline: 0.04 });                  // (z -0.375 to 0.16)
    k.beam([xa + 0.04, 1.33, -0.2], [xb - 0.04, 1.33, -0.2], 0.06, T(PAL.gold), { outline: 0.01 });          // (the rail sits 3 cm into the parapet's top)
    k.solid((xb - xa) / 2, 0.65, 0.2675, (xa + xb) / 2, -0.1075);
  }
  const ads = far ? [['THE FAR TURN CLUB', FG.gold]]
    : [['ANTIMATTER LAB · WE BREED WINNERS', '#9bd37a'], ['LUCKY CRATER CASINO', FG.gold], ['MERIDIAN EXCHANGE', '#9bd7ff'], ['QUANTUM-LOCK SKATES', FG.gold]];
  ads.forEach(([t, c], i) => k.text(t, far ? 0 : -75 + i * 50, 0.66, -0.38, Math.PI, Math.min(far ? 60 : 44, tw(t, 1.0)), { fg: c, bg: BG.black, back: false, off: 0.02 }));
  // the back wall, one piece end to end with an opening for each way in (dn_backwall: 5.8 x 3.9 m, the tunnel's walls and ceiling standing 10 cm proud of its jambs and head), and
  // the frame round each opening; the end walls close the sides
  bake(k, far ? 'dn_backwall_s' : 'dn_backwall', 0, 0, back);
  for (const ex of ENTRIES) bake(k, 'dn_entry', ex, 0, back + 0.02);
  const OPEN = 2.9, HEAD = 3.9;
  for (const [xa, xb] of spans(-hw - 1, hw + 1, true, OPEN)) k.solid((xb - xa) / 2, wallH / 2, 0.4, (xa + xb) / 2, back - 0.4);
  for (const ex of ENTRIES) k.solid(OPEN, (wallH - HEAD) / 2, 0.4, ex, back - 0.4, 0, HEAD);
  if (!far) for (const sx of [-1, 1]) k.solid(0.575, wallH / 2, 0.29, sx * (hw + 0.375), back - 0.01);     // (the main stand's rear quoins; the far one's stand in the arcades' returns)
  // The tunnels. Each is lined with ONE wall a side from the apron to the back wall, so its inside shows no joint where one tier's step ends and the next one's begins: in front of
  // the tiers it runs under, the wall is the trench's cheek, a coping 12 cm over each step it passes, stepping up 10 cm short of each riser; under them it is the tunnel's wall, its
  // top let into the tiers' feet, with a flat ceiling between the two (the tiers' cut-out ends over it), lamps under it. A pier at the mouth takes the front parapet's end. The
  // floor is the apron's (aprons()), on under the back wall.
  const roofZ = firstRoofed * S.depth, segs = [];
  const prof = [[-0.3, 0]];
  for (let i = 0; i < firstRoofed; i++) {
    const y = (i + 1) * S.rise + 0.12, za = i ? i * S.depth - 0.1 : -0.3, zb = (i + 1) * S.depth - 0.1;
    prof.push([za, y], [zb, y]);
    segs.push([za, zb, y]);
  }
  prof.push([roofZ - 0.1, TUN_CH + 0.05], [wallZ + 0.05, TUN_CH + 0.05], [wallZ + 0.05, 0]);
  segs.push([roofZ - 0.1, wallZ + 0.05, TUN_CH + 0.05]);
  for (const ex of ENTRIES) {
    for (const s of [-1, 1]) {
      addSolid(k, prism(prof, ex + Math.min(s * TUN_W, s * LINE), ex + Math.max(s * TUN_W, s * LINE), 'x'), MONEY2, 0.03);
      for (const [za, zb, y] of segs) k.solid((LINE - TUN_W) / 2, y / 2, (zb - za) / 2, ex + s * (TUN_W + LINE) / 2, (za + zb) / 2);
      k.box(0.55, 1.75, 0.85, T(MONEY2), ex + s * 3.225, 0, -0.075, { outline: 0.03 });                      // the pier (5 cm proud of the wall inside, 12.5 cm in front of the parapet)
      k.box(0.65, 0.11, 0.95, T(PAL.gold), ex + s * 3.225, 1.74, -0.075, { outline: 0.012 });                // and its cap
      k.solid(0.275, 0.9, 0.425, ex + s * 3.225, -0.075);
    }
    k.box(2 * TUN_W, TUN_CH + 0.02 - CEIL, wallZ + 0.05 - (roofZ + 0.1), T(MINT2), ex, CEIL, (wallZ + 0.05 + roofZ + 0.1) / 2, { outline: 0.02 });   // the ceiling, 10 cm in under the cut
    for (let z = roofZ + 3; z < back - 1.5; z += 7) k.box(1.4, 0.08, 0.9, G(0xffe9a0), ex, CEIL - 0.06, z, { outline: 0 });
  }
  // The end walls: a Money band round the seats' side. Their outer faces are in the arcades (joiner) from the front to where the arcade's back wall meets them (zA, all the way on the far
  // stand), and carry the arcade's own trim there, at its heights and depths, so it runs on round the bay's corner: a wainscot to 2.4 m (14 cm proud) and a string course at 4.4 m (8 cm).
  // The trim starts 10 cm behind the wall's front face (a step there, not a near-flush end) and is let 2 cm into the wall (its back is not in the plane of the arcade's floor's edge).
  const zA = Math.min(back, Math.sqrt(ARCADE.ro ** 2 - (hw + 0.8 - ARCADE.cx) ** 2) - S.z0);
  for (const sx of [-1, 1]) {
    const xo = sx * (hw + 0.8), out = (a, b) => xo + sx * (a + b) / 2;          // (the middle of a strip from a to b metres out of the outer face)
    k.box(0.8, wallH - 2, back, T(PAL.mint), sx * (hw + 0.4), 0, back / 2, { outline: 0.06 });
    k.box(0.15, 0.5, back - 0.12, T(MONEY2), sx * (hw + 0.025), 2.6, (back + 0.08) / 2, { outline: 0 });
    k.box(0.16, 2.38, zA - 0.15, T(MONEY2), out(-0.02, 0.14), 0.02, (zA + 0.05) / 2, { outline: 0 });       // (to 5 cm short of zA: inside the arcade's back
    k.box(0.1, 0.35, zA - 0.15, T(MONEY2), out(-0.02, 0.08), 4.4, (zA + 0.05) / 2, { outline: 0 });         // wall there, or the pilaster on the far stand's corner)
    if (zA < back - 0.1) k.box(0.15, 0.5, back - 0.02 - zA, T(MONEY2), out(-0.1, 0.05), 2.6, (zA + back - 0.02) / 2, { outline: 0 });
    k.solid(0.4, (wallH - 2) / 2, back / 2, sx * (hw + 0.4), back / 2);
  }
  if (!far) bake(k, 'dn_suites', 0, topY, (S.tiers - 1) * S.depth + 0.1);              // (end wall to end wall, 10 cm back from the top riser, so the riser's top edge is a ledge, not a seam)
  // the roof: one piece from end wall to end wall (dn_roof / dn_roof_s), over the end sections and through the corner towers, on a column behind the back wall at each bay's edge
  // (never behind a way in: those are at the bays' middles) and on the beam that lies along the back wall's cap
  bake(k, far ? 'dn_roof_s' : 'dn_roof', 0, 0, 0);
  for (let j = 1; j < Math.round(len / 19); j++) k.column(0.5, wallH + 0.85, S.x0 + 19 * j, back + 0.4);
  const names = far ? [] : [['CHIMERA DOWNS', 0], ['EST. YEAR ONE', -57], ['EST. YEAR ONE', 57]];
  for (const [t, x] of names) k.text(t, x, 22.1, -4.62, Math.PI, Math.min(14, tw(t, 1.1)), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  // the end towers (one in each front corner), the roof's deck running through them
  for (const sx of [-1, 1]) {
    bake(k, far ? 'dn_tower_s' : 'dn_tower', sx * (hw - towerW / 2), 0, TZ);
    k.solid(towerW / 2 + 0.1, (far ? 18 : 26) / 2, (towerD + 0.2) / 2, sx * (hw - towerW / 2), TZ + (towerD - 0.7) / 2);
  }
  k.at();
}

// ---- the clubhouse and tote hall: behind the main stand's centre, its front toward the forecourt ----
function clubhouse(k) {
  k.at(0, CLUB.z1, 0);
  bake(k, 'dn_club');
  k.solid(30, 9.4, 11, 0, -16, 0, 0);                              // the body (the portico's counters stand clear of it)
  k.solid(30.3, 0.4, 0.15, 0, -27.15);                             // the plinth, 0.3 m proud of the body at the back and the sides
  for (const s of [-1, 1]) k.solid(0.15, 0.4, 11.15, s * 30.15, -16.15);
  for (let i = 0; i < 10; i++) k.column(0.62, 9, -27 + i * 6, -0.8);
  k.solid(6, 12, 6, 0, -13, 0, 18);                                // the tower's foot, up on the roof
  k.at();
}

// ---- the apron: a timber promenade along the front of each stand, and lamps along it ----
// Each side's floor is ONE solid (sheet): the apron from just under the dirt's edge to 10 cm under the stand's front, and on through each of the stand's tunnels to its back wall,
// so no joint shows anywhere on it (its pieces share their edges; the plank lines laid over it read as seams and are gone). It ends at x = +-90, edge to edge with the arcades'
// rail walk (arcades()), which carries on at the same height round the turns and under the stands' ends (the apron used to run on over the walk, the two tops in one plane).
// Behind the main stand the tunnels' floors end where the forecourt's slate begins, under the back wall (the slate is the doorway's threshold); behind the far stand they run
// 0.5 m out of the doorway.
function aprons(k) {
  const END = ARCADE.cx, W = 3.1;                                                 // (the apron's ends: the rail walk's straight edge; half a tunnel's floor: 10 cm under each of its walls)
  const ex = [...ENTRIES].sort((a, b) => a - b), xs = [-END, ...ex.flatMap((e) => [e - W, e + W]), END];
  k.at();
  for (const s of [-1, 1]) {
    const S = s > 0 ? STAND : FAR, zf = s * (DIRT[1] - 0.1), zs = s * (S.z0 + 0.1);
    // (the tunnels' floors' ends: behind the main stand, where forecourt()'s slate begins, FORECOURT.z0 - 0.6 = 113.4 (its paving is dz + 1.1 long round a centre 5 cm short
    // of the middle); behind the far stand, 0.5 m out of the doorway)
    const zt = s > 0 ? FORECOURT.z0 - 0.6 : -(FAR.z0 + FAR.tiers * FAR.depth + FAR.wall + 0.5);
    const polys = [];
    for (let i = 0; i < xs.length - 1; i++) polys.push({ pts: [[xs[i], zf], [xs[i + 1], zf], [xs[i + 1], zs], [xs[i], zs]], yb: () => 0 });
    for (const e of ex) polys.push({ pts: [[e - W, zs], [e + W, zs], [e + W, zt], [e - W, zt]], yb: () => 0 });
    kitSink(k)(sheet(polys, 0.12), SADDLE2, 0);
    for (let x = -100; x <= 100; x += 20) {
      if (Math.abs(x - FINISH_X) < 7) continue;
      lamp(k, x, s * (STAND.z0 - 3), x, 0);                                  // (its head turned toward the track)
      k.column(0.4, 6.5, x, s * (STAND.z0 - 3));
    }
  }
}

// A prism over a flat polygon [[x, z]...] in the current frame's plan, convex, its bottom at yb(x, z) and `h` thick: flat-shaded triangles (the joiner bays below are not boxes).
function slab(poly, yb, h) {
  const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const ring = area > 0 ? [...poly].reverse() : poly;                       // (clockwise on the x-right, z-up plan: then the triangles below face up, and the sides face out)
  const pos = [], tri = (a, b, d) => pos.push(...a, ...b, ...d);
  const lo = (p) => [p[0], yb(p[0], p[1]), p[1]], hi = (p) => [p[0], yb(p[0], p[1]) + h, p[1]];
  for (let i = 1; i < ring.length - 1; i++) {
    tri(hi(ring[0]), hi(ring[i]), hi(ring[i + 1]));
    tri(lo(ring[0]), lo(ring[i + 1]), lo(ring[i]));
  }
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    tri(lo(p), lo(q), hi(q));
    tri(lo(p), hi(q), hi(p));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// The arcade's last wedge stops on a radial line and the stand's end wall is straight, so there is a gap between them, wide at the back wall and tapering to the walk. This is a bay shaped
// to fill it. Its back wall (the arc from the wedge's corner to the stand's wall, as a chord), trim, architrave, fascia, roof and ceiling are the last stretch of the run's own continuous
// pieces (arcadeShell, downsKit.js); this adds its floor, built in the adjacent wedge's frame (`th` its middle, `side0` +1 when, on the west arcade, the stand is on its local +x), so the
// shared edge is the wedge's own, the back wall's collider, and behind the far stand the return.
// wallU: where the stand's end wall's face is (x, the west arcade's way round); rearZ: for the far stand, where that wall's rear corner is (the arcade's back wall runs on past it).
function joiner(k, mir, th, side0, wallU, rearZ) {
  const R = Math.PI / 180, side = side0 * mir;                                   // (the east arcade is the west one's mirror: the stand is on the other side of the wedge)
  const polar = (r, t) => [mir * (-ARCADE.cx + r * Math.cos(t * R)), r * Math.sin(t * R)];
  const [px, pz] = polar(WEDGE.r0, th), yaw = mir * (Math.PI / 2 - th * R), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const local = ([wx, wz]) => [(wx - px) * cy - (wz - pz) * sy, (wx - px) * sy + (wz - pz) * cy];
  const south = rearZ !== null;
  const onWall = (r) => { const t = Math.acos((wallU + ARCADE.cx) / r) / R; return south ? 360 - t : t; };          // (the angle at which circle r meets the wall)
  const D = [side * WEDGE.wi, 0];                                                                                  // the wedge's front corner on the shared edge
  // The floor runs from the wedge's edge into the stand's end wall (and, behind the far stand, under the return): its far edge is 10 cm inside the wall, on the lines of the walk's edge
  // and the back wall's middle carried on, so its side is not in the wall's face (the stand's wainscot comes down to the floor there and would z-fight with it).
  const toX = (p, q, x) => { const s = (mir * x - p[0]) / (q[0] - p[0]); return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]; };
  const edgeT = th - side0 * ARCADE.step / 2;
  const A = local(toX(polar(ARCADE.ri, edgeT), polar(ARCADE.ri, onWall(ARCADE.ri)), wallU + 0.1));               // where the walk's edge and the back wall's outer face reach that line
  const rB = ARCADE.ro - 0.35 / Math.cos(WEDGE.a2), C = local(polar(rB, edgeT));                                    // (the back edge runs down the back wall's middle, as the wedges' floors do)
  const B = local(toX(polar(rB, edgeT), polar(rB, onWall(rB)), wallU + 0.1));
  k.at(px, pz, yaw);
  // the floor (the inlay along the walk's edge, the walls, trim, roof and ceiling are the run's own: arcadeShell)
  k.add(slab([D, C, B, A], () => 0, 0.14), T(SADDLE2), 0, 0, 0, { outline: 0 });
  k.at();
  // The back wall's chord, from the wedge's back corner (Cw) to the stand's wall (Bw): arcadeShell builds it; here its collider, and behind the far stand the return. There the arcade's
  // back is 3.8 m behind the stand's, so a return closes it: the stand's end wall carried on, 0.82 m thick, from the stand's rear corner to the chord's outer face, its bay face flush
  // with the end wall's and trimmed as it is (the stand's end wall carries the wainscot and string course itself: grandstand), its outer face against the back wall's last pilaster.
  // It meets the chord's wall on the diagonal from the outer corner to the bay's inner corner, so the joint falls only on corners. Its top runs up into the roof, which is raked along
  // the neighbouring wedge's radius (ROOF), and its gold cornice follows the roof down from the corner, where it meets the chord's (8.1 to 8.4 m).
  const Oc = [mir * -ARCADE.cx, 0], edge = th - side0 * ARCADE.step / 2;
  const Cw = polar(ARCADE.ro, edge), Bw = polar(ARCADE.ro, onWall(ARCADE.ro));
  const len0 = Math.hypot(Bw[0] - Cw[0], Bw[1] - Cw[1]), u = [(Bw[0] - Cw[0]) / len0, (Bw[1] - Cw[1]) / len0];
  let n = [-u[1], u[0]];
  if (n[0] * (Oc[0] - Cw[0]) + n[1] * (Oc[1] - Cw[1]) < 0) n = [-n[0], -n[1]];
  const xPlane = (x) => [[mir * x, 0], [1, 0]];
  const onLine = (t, [Q, m]) => {                                                                                // where the chord's line at offset t (toward the bay) crosses plane [Q, m]
    const ox = Cw[0] + n[0] * t, oz = Cw[1] + n[1] * t, s = ((Q[0] - ox) * m[0] + (Q[1] - oz) * m[1]) / (u[0] * m[0] + u[1] * m[1]);
    return [ox + u[0] * s, oz + u[1] * s];
  };
  const wm = onLine(0.35, [[(Cw[0] + Bw[0]) / 2, (Cw[1] + Bw[1]) / 2], u]);
  k.solid(len0 / 2 + 0.2, 4.2, 0.4, wm[0], wm[1], Math.atan2(-u[1], u[0]));
  if (south) {
    const c = Math.cos(th * R), s = Math.sin(th * R), under = (x, z) => ROOF.y0 + ((mir * x + ARCADE.cx) * c + z * s - WEDGE.r0 + 0.8) * ROOF.k;
    const x0 = mir * wallU, x1 = mir * (wallU + 0.82), K1 = onLine(0, xPlane(wallU + 0.82)), Jin = onLine(0.7, xPlane(wallU));
    const sink = kitSink(k);
    sink(sheet([{ pts: [[x0, rearZ], [x1, rearZ], K1, Jin], yb: () => 0, yt: (x, z) => under(x, z) + 0.1 }]), PAL.mint, 0.03);
    for (const [d, t, y0, y1] of [[0.14, 0.84, 0.14, 2.4], [0.08, 0.78, 4.4, 4.75]]) {                           // (the wainscot and string course on its bay face, from the stand's to the chord's)
      k.add(slab([[mir * (wallU - d), rearZ], [x0, rearZ], onLine(t, xPlane(wallU)), onLine(t, xPlane(wallU - d))], () => y0, y1 - y0), T(MONEY2), 0, 0, 0, { outline: 0 });
    }
    sink(sheet([{ pts: [[mir * (wallU + 0.3), rearZ + 0.02], [mir * (wallU + 0.92), rearZ + 0.02], onLine(-0.1, xPlane(wallU + 0.92)), onLine(-0.1, xPlane(wallU + 0.3))],   // (2 cm into the stand's walls: not in the return's end plane)
      yb: (x, z) => under(x, z) - 0.28, yt: (x, z) => under(x, z) + 0.02 }]), PAL.gold, 0);
    k.solid(0.41, 4.2, Math.abs(K1[1] - rearZ) / 2, mir * (wallU + 0.41), (K1[1] + rearZ) / 2);
    // a pilaster over the joint where the stand's end wall stops and the return goes on (the end wall's outline would show there as a line), floor to ceiling, the trim dying into it. Its
    // back is sunk 15 cm into the walls and its foot 4 cm into the floor, so none of its faces lies on the walls' face or on the trims' faces and feet (they would z-fight)
    sink(sheet([{ pts: [[mir * (wallU - 0.2), rearZ - 0.3], [mir * (wallU + 0.15), rearZ - 0.3], [mir * (wallU + 0.15), rearZ + 0.3], [mir * (wallU - 0.2), rearZ + 0.3]],
      yb: () => 0.1, yt: (x, z) => under(x, z) - 0.03 }]), MINT2, 0.02);
  }
}

// ---- the arcades round the turns ----
// A wedge's origin is the middle of its inner chord; its local +z points outward along the radius. The east arcade is the west one's mirror (x negated, yaws negated).
function arcades(k, vendors) {
  for (const mir of [1, -1]) {                                       // 1 = west, -1 = east
    const at = (r, th) => [mir * (-ARCADE.cx + r * Math.cos(th * Math.PI / 180)), r * Math.sin(th * Math.PI / 180)];
    const yawOf = (th) => mir * (Math.PI / 2 - th * Math.PI / 180);
    ARCADE.runs.forEach((run, ri) => {
      for (let i = 0; i < run.n; i++) {
        const th = run.a0 + ARCADE.step * (i + 0.5);
        const [x, z] = at(WEDGE.r0, th), yaw = yawOf(th);
        k.at(x, z, yaw);
        bake(k, 'dn_arcade');
        k.solid(WEDGE.wo, 4.2, 0.4, 0, WEDGE.d - 0.35);                // the back wall
        k.column(0.4, 6.5, -WEDGE.wi + 0.55, 0.55);                    // the colonnade
        const si = run.stalls.indexOf(i);
        if (si >= 0) {
          // a stall in this bay: built into it (dn_stall_*, tools/blender/build_downs_stalls.py: an alcove on a plinth in front of the back wall, in the bay's own frame, its cornice 0.6 m
          // under the ceiling all along), a vendor behind its counter
          const st = STALLS[STALL_ORDER[mir > 0 ? 0 : 1][ri * 5 + si]];
          bake(k, `dn_stall_${st.d}`, 0, 0, 0, { over: { accent: st.accent } });
          for (const sx of [-1, 1]) {
            k.solid(0.35, 1.78, 0.25, sx * 4.65, 11.55, 0, 0.34);          // the screen wall's piers
            k.solid(0.15, 3.55, 1.59, sx * 4.85, 13.39, 0, 0.34);          // the alcove's side walls
          }
          k.solid(5, 1.74, 0.25, 0, 11.55, 0, 3.9);                        // the screen above its arch
          k.solid(5, 3.55, 0.125, 0, 14.855, 0, 0.34);                     // the alcove's back wall
          k.solid(4.4, 0.65, 0.87, 0, 12.65, 0, 0);                        // the counter
          vendors.push({ x: x + 14.1 * Math.sin(yaw), z: z + 14.1 * Math.cos(yaw), yaw: yaw + Math.PI, accent: st.accent });
        } else {
          // an open bay: a bench against the back wall facing the walk, a planter each side of it, all standing on the bay's floor (0.14 m). The bench (3.2 m, for two runners) keeps 0.16 m
          // off the wainscot (its back at d - 1, the wainscot's face at d - 0.84) and 0.74 m from each planter (x 2.34 to 4.86); its collider is the seat's block. The bays next to the
          // gate (run 1's first and run 0's last, both open) have the gate tower's side running across their corner (the tower's plinth at bay x 4.39 to 4.63 over the planter's depth,
          // on the gate's side: in run 1's first bay +x in the west and -x in the east, the arcade's frame being mirrored, and the other way round in run 0's last): there the group
          // moves 0.5 m off the tower and the planters close in to 0.54 m from the bench, so the gate-side planter's rim (1.64 to 4.16) keeps 0.23 m off the plinth
          const nearGate = (ri === 1 && i === 0) || (ri === 0 && i === run.n - 1), gs = nearGate ? (ri === 1 ? mir : -mir) : 0;
          const bx = -0.5 * gs, pxs = nearGate ? [-3.9 * gs, 2.9 * gs] : [-3.6, 3.6];
          k.at(x, z, yaw);
          bake(k, 'dn_bench', bx, 0.14, WEDGE.d - 1.6, { ry: Math.PI });
          k.solid(1.6, 0.29, 0.465, bx, WEDGE.d - 1.6 + 0.135);
          for (const px of pxs) { bake(k, 'dn_planter', px, 0.14, WEDGE.d - 1.7); k.solid(1.26, 0.53, 0.56, px, WEDGE.d - 1.7); }
        }
        k.at();
      }
    });
    // the gate hall, at the middle of the arcade (dn_gate_hall: two towers 10 m wide either side of a 12 m vaulted passage, the arch block between them set back to z = +-10.4).
    // Its name boards are on the arch block's faces, their fronts at z = +-10.65: the letters 1 cm in front, the track's name on the track face (-z), the gate's own outside.
    const [gx, gz] = at(ARCADE.ri + 8, ARCADE.gate), gyaw = yawOf(ARCADE.gate);
    k.at(gx, gz, gyaw);
    bake(k, 'dn_gate_hall');
    const nm = mir > 0 ? 'WEST GATE' : 'EAST GATE';
    k.text(nm, 0, 9.7, 10.66, 0, tw(nm, 1.7), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    k.text('CHIMERA DOWNS', 0, 9.7, -10.66, Math.PI, tw('CHIMERA DOWNS', 1.5), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    for (const sx of [-1, 1]) {
      k.solid(5.25, 0.3, 11.25, sx * 11, 0);                           // a tower's plinth, 0.25 m out into the passage and round the faces
      k.solid(5, 6.7, 11, sx * 11, 0, 0, 0.6);                         // the tower on it, to its cornice (14 m)
      k.solid(0.06, 1.56, 11.08, sx * 5.94, 0, 0, 0.6);               // the passage's rustication and wainscot, to the string course (3.72 m): their face at |x| = 5.88
    }
    k.at();
    // the rail walk: a timber ring between the dirt and the arcade, a solid slab as high as the aprons it runs into (and under them: it covers the whole turn, from the straight's end to
    // the far straight's, so no bare ground shows where the apron, the walk and the stands' ends meet)
    const [t0, t1] = mir > 0 ? [90, 270] : [-90, 90];
    const ring = new THREE.Shape(), steps = 120, r0 = DIRT[1] - 0.1, r1 = ARCADE.ri;
    for (let i = 0; i <= steps; i++) { const t = (t0 + (t1 - t0) * i / steps) * Math.PI / 180; ring[i ? 'lineTo' : 'moveTo'](r1 * Math.cos(t), r1 * Math.sin(t)); }
    for (let i = steps; i >= 0; i--) { const t = (t0 + (t1 - t0) * i / steps) * Math.PI / 180; ring.lineTo(r0 * Math.cos(t), r0 * Math.sin(t)); }
    k.add(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.12, 0), T(SADDLE2), mir * -ARCADE.cx, 0, 0, { outline: 0 });
    // the parts that run on from bay to bay, one piece per run (from the gate hall to the stand, on into the stand's end wall): arcadeShell
    k.at();
    ARCADE.runs.forEach((run, ri) => arcadeShell(kitSink(k), {
      mir, edges: Array.from({ length: run.n + 1 }, (_, i) => run.a0 + ARCADE.step * i),
      stand: ri === 0 ? { atStart: true, wallU: -(STAND.x1 + 0.8), rearZ: null } : { atStart: false, wallU: -(FAR.x1 + 0.8), rearZ: -(FAR.z0 + FAR.tiers * FAR.depth + FAR.wall) },
    }));
    // where each end of the arcade meets a stand: a bay to fill the gap between the arcade's last wedge and the stand's straight end wall
    {
      joiner(k, mir, ARCADE.runs[0].a0 + ARCADE.step * 0.5, 1, -(STAND.x1 + 0.8), null);
      const last = ARCADE.runs[1];
      joiner(k, mir, last.a0 + ARCADE.step * (last.n - 0.5), -1, -(FAR.x1 + 0.8), -(FAR.z0 + FAR.tiers * FAR.depth + FAR.wall), true);
    }
  }
}

// the forecourt's paving: a cool slate that sits against the moon's pale ground and the timber of the avenue and promenade (the only paving off the palette)
const SLATE = 0x6c7683, SLATE2 = 0x5c6571;

// ---- the concourse behind the main stand and the grand forecourt: paving, a timber avenue, the fountain, masts with festoons, lamps, benches, planters, valet bays and the gate ----
function forecourt(k) {
  const F = FORECOURT, w = F.x1 - F.x0;
  // The paving: one layer of slate slabs with a darker joint every 12 m, cut along x so that slabs and joints share their edges (the joints were strips laid 1 cm over a base, and
  // their ends stood in the plane of the avenue's end at the gate's foot: z-fighting). It runs from under the stand's back wall to 0.8 m past the gate's pylons (their plinths are
  // 3.4 m deep round the gate's line), so the gate stands on it instead of at its edge.
  const Z0 = F.z0 - 0.6, Z1 = F.gate + 2.5, JW = 0.14;
  let xa = F.x0;
  for (let jx = -66; jx <= 66; jx += 12) {                                                                             // (symmetric about the avenue)
    k.box(jx - JW / 2 - xa, 0.12, Z1 - Z0, T(SLATE), (xa + jx - JW / 2) / 2, 0, (Z0 + Z1) / 2, { outline: 0 });
    k.box(JW, 0.12, Z1 - Z0, T(SLATE2), jx, 0, (Z0 + Z1) / 2, { outline: 0 });
    xa = jx + JW / 2;
  }
  k.box(F.x1 - xa, 0.12, Z1 - Z0, T(SLATE), (xa + F.x1) / 2, 0, (Z0 + Z1) / 2, { outline: 0 });
  // the avenue, in timber: from the promenade out through the gate, 2 cm short of the paving's end (its sides and the gold edges run into the pylons' plinths), planks across it and gold
  // edges along it, every layer 2 cm short of the one under it
  const A0 = F.promenade[1], A1 = Z1 - 0.02;
  k.box(2 * F.avenue, 0.16, A1 - A0, T(SADDLE2), 0, 0, (A0 + A1) / 2, { outline: 0 });
  for (let z = A0 + 3; z < A1 - 0.1; z += 3) k.box(2 * F.avenue - 0.04, 0.17, 0.08, T(0x7a5236), 0, 0, z, { outline: 0 });
  for (const s of [-1, 1]) k.box(0.3, 0.18, A1 - A0 - 0.04, T(PAL.gold), s * F.avenue, 0, (A0 + A1) / 2, { outline: 0 });
  k.box(w - 0.04, 0.16, F.promenade[1] - F.promenade[0], T(SADDLE2), 0, 0, (F.promenade[0] + F.promenade[1]) / 2, { outline: 0 });   // the promenade along the clubhouse's front
  // the ways from the stand's entries: from 10 cm inside the back wall's inner face (over the end of the tunnel's floor, under the entry's jambs) to the promenade
  const wallIn = STAND.z0 + (STAND.tiers - 1) * STAND.depth + 3.2 - 0.1;
  for (const ex of ENTRIES) k.box(8, 0.16, F.promenade[0] - wallIn, T(SADDLE2), ex, 0, (wallIn + F.promenade[0]) / 2, { outline: 0 });
  // the fountain, ringed in gold
  const [fx, fz] = F.fountain;
  fountain(k, fx, fz, 0.16);                                                     // (standing on the avenue's timber, 0.16 m up: on the ground its stepped foot was under it)
  k.column(12, 1.36, fx, fz);
  k.ring(13.2, 0.12, G(PAL.gold), fx, 0.17, fz);
  // masts down both sides of the avenue, a string of lights across it at every other pair
  const cols = [PAL.barn, PAL.gold, PAL.money, PAL.mint, PAL.saddle, PAL.black];
  for (let i = 0; i < 9; i++) {
    const z = 150.5 + i * 4.5;
    for (const s of [-1, 1]) {
      k.at(s * (F.avenue + 1.2), z, 0);
      bake(k, 'dn_mast', 0, 0, 0, { over: { cloth: cols[(i + (s > 0 ? 3 : 0)) % 6] }, ry: s > 0 ? 0 : Math.PI });
      k.at();
      k.column(0.3, 10, s * (F.avenue + 1.2), z);
    }
    if (i % 2 === 0) { k.at(0, z, 0); bake(k, 'dn_festoon', 0, 10.3, 0, { sx: (2 * (F.avenue + 1.2)) / 30 }); k.at(); }
  }
  for (const s of [-1, 1]) for (let z = 154; z < 190; z += 12) {                                                   // lamps just outside the masts
    lamp(k, s * (F.avenue + 4.2), z, 0, z);                                  // (over the avenue)
    k.column(0.4, 6.5, s * (F.avenue + 4.2), z);
  }
  // benches facing the avenue with planters between them, either side, on the paving (0.12 m): each bench 3.2 m long along z, a planter (turned to run along z) midway to the next.
  // (The planters stood 3.5 m behind the benches, off the line, with their colliders between them.)
  for (const s of [-1, 1]) for (let z = 156; z < 188; z += 10) {
    k.at(s * 26, z, 0);
    bake(k, 'dn_bench', 0, 0.12, 0, { ry: -s * Math.PI / 2 });
    if (z + 10 < 188) bake(k, 'dn_planter', 0, 0.12, 5, { ry: s * Math.PI / 2 });
    k.at();
    k.solid(0.465, 0.28, 1.6, s * 26.135, z);
    if (z + 10 < 188) k.solid(0.56, 0.52, 1.26, s * 26, z + 5);
  }
  // valet bays: two blocks of six, diagonal, their heads toward the sides, standing on the paving (dn_bay's paint lines are 1.5 cm thick: on the ground they were under it)
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const hx = s * (56 + 1.8 * i), hz = 152 + 2.14 * i;
    k.at(hx, hz, -s * (50 * Math.PI) / 180, 0.12);
    bake(k, 'dn_bay');
    k.text(String(i + 1 + (s > 0 ? 6 : 0)), 0, 0.78, -0.37, 0, 0.36, { fg: '#3b393a', bg: '#cfb352', back: false, off: 0.01 });
    k.at();
  }
  // the gate
  k.at(0, F.gate, 0);
  bake(k, 'dn_gate_main');
  for (const s of [-1, 1]) k.solid(1.5, 6.6, 1.5, s * 12.5, 0);
  k.at();
}

// ---- the screen drum in the middle of the infield and the three sets of winners' podiums in front of it ----
function drum(k) {
  k.at(DRUM.x, DRUM.z, 0);
  bake(k, 'dn_drum');
  k.solid(5.4, 9, 5.4, 0, 0);
  k.at();
}

// Each step's number is a plate on its front face (z = 2.0), 1.2 cm off it, between the platform's lip (0.3) and the step's Black nosing (from h - 0.14), a few centimetres clear of both: the
// plate is about as tall as it is wide (tw), so its width is what that band leaves. (It was 1.5 times the step's height wide and stood over the nosing and the step's top.)
function podiums(k) {
  const medals = [['1', 0, 1.4, '#cfb352', '#3b393a'], ['2', -6.5, 1.0, '#f8fff8', '#3b393a'], ['3', 6.5, 0.7, '#b07c57', '#f8fff8']];
  for (const px of PODIUMS.xs) {
    k.at(px, PODIUMS.z, 0);
    bake(k, 'dn_podium');
    for (const [n, x, h, bg, fg] of medals) {
      const y0 = 0.31, y1 = h - 0.14 - 0.03, ph = Math.min(0.9, y1 - y0);          // (y0 over the platform's gold lip, 0.3)
      k.text(n, x, (y0 + y1) / 2, 2.012, 0, tw(n, ph), { fg, bg, back: false, off: 0.0 });
      k.solid(3, h / 2, 1.75, x, 0.25);
    }
    k.solid(9.6, 0.15, 2.575, 0, -0.075);                             // the platform (19.2 m: the outer steps stand on it now; it runs 15 cm behind the frame)
    k.solid(8.2, 3.1, 0.2, 0, -2.35);                                 // the backdrop in its frame
    k.at();
  }
}

// ---- the stable yard behind the far stand (STABLES, docs/stable-proposals/): blocks of boxes in Ls round a court or down two lanes, a clock-towered tack room at each
// knuckle, the hay barn, a lunge ring, fences with gates, troughs, saddle racks, hay. The chimeras in the boxes are race.js's (they move) ----
function stables(k) {
  for (const [n, x, z, yaw] of STABLES.pieces) {
    k.at(x, z, yaw);
    bake(k, n);
    const boxes = /^dn_stable_(\d)$/.exec(n);
    if (boxes) {
      const Lh = +boxes[1] * 2.5;
      k.solid(Lh + 0.2, 3.7, 4.6, 0, -4.4);                                                          // (the body to its ridge, the boxes shut: you look in over the doors)
      for (let i = 0; i <= +boxes[1]; i++) k.column(0.2, 4.0, -Lh + i * 5, 2.18);                      // the porch posts
      for (let i = 0; i < +boxes[1]; i++) k.solid(0.6, 0.23, 0.35, -Lh + 2.5 + i * 5, 0.95);           // and each box's feed trough
    } else if (n === 'dn_stable_corner') {
      k.solid(4.8, 4.3, 4.8, -4.5, -4.5);
      k.column(0.2, 4.0, 2.18, 2.18);                                                                // (the post where the porch beams cross)
    } else if (n === 'dn_hay_barn') k.solid(12.2, 6.2, 7.2, 0, -7);
    else if (n === 'dn_trough') k.solid(1.2, 0.38, 0.45, 0, 0);
    else if (n === 'dn_tack') k.column(0.5, 1.2, 0, 0);
    else if (n === 'dn_lunge_ring') {
      // the rail: a wall along each bay but the gate's, at +z; the ring's sand inside it
      const R = 9, N = 22, at = (i) => { const a = (2 * Math.PI * (i + 0.5)) / N + Math.PI / 2; return [Math.cos(a) * R, Math.sin(a) * R]; };
      for (let i = 0; i < N - 1; i++) {
        const [ax, az] = at(i), [bx, bz] = at(i + 1);
        k.solid(0.12, 0.8, Math.hypot(bx - ax, bz - az) / 2, (ax + bx) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az));
      }
      k.cyl(R - 0.15, R - 0.15, 0.15, 48, T(PAL.saddle), 0, 0, 0, { outline: 0 });
    }
    k.at();
  }
  // the fences: each run cut into equal bays of about 4 m (a bay's rails stretched to fit), a post to end it; a bay squeezed under 3 m gets a whole post at its start
  for (const run of STABLES.fences) {
    for (let j = 0; j + 1 < run.length; j++) {
      const [ax, az] = run[j], [bx, bz] = run[j + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), n = Math.max(1, Math.round(l / 4));
      for (let i = 0; i < n; i++) {
        k.at(ax + (dx * i) / n, az + (dz * i) / n, Math.atan2(-dz, dx));
        bake(k, 'dn_stable_fence', 0, 0, 0, { sx: l / n / 4 });
        if (l / n < 3) bake(k, 'dn_stable_post');
        k.at();
      }
      k.solid(0.15, 0.75, l / 2, (ax + bx) / 2, (az + bz) / 2, Math.atan2(dx, dz));
    }
    const [ex, ez] = run[run.length - 1];
    k.at(ex, ez, 0);
    bake(k, 'dn_stable_post');
    k.at();
  }
  // the gates
  for (const [x, z, yaw] of STABLES.gates) {
    k.at(x, z, yaw);
    bake(k, 'dn_yard_gate');
    for (const s of [-1, 1]) k.column(0.5, 3.6, s * 3, 0);
    k.at();
  }
  // hay: stacks (a pair of bales 6 cm apart with a third laid across them, so a lifted bale always rests on two)
  for (const [x, z, yaw] of STABLES.hay) {
    k.at(x, z, yaw);
    for (const s of [-1, 1]) bake(k, 'dn_hay', 0, 0, s * 0.33);
    bake(k, 'dn_hay', 0, 0.6, 0, { ry: Math.PI / 2 });
    k.at();
  }
  for (const [x0, x1, z0, z1, c] of STABLES.ground) {                                                  // the yard's trodden earth, a turnout's grass on it
    k.box(x1 - x0, c === 'grass' ? 0.12 : 0.1, z1 - z0, T(c === 'grass' ? PAL.money : SADDLE2), (x0 + x1) / 2, 0, (z0 + z1) / 2, { outline: 0 });
  }
}

// ---- the parade ring and the weighing room in the infield, the picnic lawn on the east side ----
function paddock(k) {
  const { x: rx, z: rz, rx: a, rz: b } = RING;
  const g = new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2).scale(a - 0.6, 1, b - 0.6);
  k.add(g, T(SADDLE2), rx, 0.08, rz, { outline: 0 });                                                  // the ring's tan bark
  // the rail: bays of about 5 m round the ellipse, leaving the gate's opening on the east end. The opening is exactly the gate's width (its posts 1.8 m either side of the axis): the
  // first bay's post and the last bay's rails end inside the gate's posts, so the rail runs into the gate instead of stopping short of it
  const per = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const tg = Math.asin(1.8 / b), n = Math.round((per - 3.6) / 5);
  const at = (t) => [rx + Math.cos(t) * a, rz + Math.sin(t) * b];
  let [px, pz] = at(tg);
  for (let i = 1; i <= n; i++) {
    const [qx, qz] = at(tg + (i / n) * (Math.PI * 2 - 2 * tg));
    const dx = qx - px, dz = qz - pz, l = Math.hypot(dx, dz);
    k.at(px, pz, Math.atan2(-dz, dx));
    bake(k, 'dn_rail', 0, 0, 0, { sx: l / 5, sy: 1.1 });
    k.at();
    k.solid(0.15, 0.55, l / 2, (px + qx) / 2, (pz + qz) / 2, Math.atan2(dx, dz));
    px = qx; pz = qz;
  }
  const gx = rx + Math.cos(tg) * a;                                                                     // (the gate's posts stand on the ellipse, where the rail ends)
  k.at(gx, rz, Math.PI / 2);
  bake(k, 'dn_ring_gate');
  k.at();
  for (const s of [-1, 1]) k.column(0.25, 2.5, gx, rz + s * 1.8);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {                                          // lamps round the outside
    const px2 = rx + lx * (a + 3) * 0.72, pz2 = rz + lz * (b + 3) * 0.72;
    lamp(k, px2, pz2, rx, rz);                                               // (over the ring)
    k.column(0.4, 6.5, px2, pz2);
  }
  // the weighing room: its porch toward the ring
  k.at(PAVILION.x, PAVILION.z, -Math.PI / 2);
  bake(k, 'dn_pavilion');
  k.text('WEIGHING ROOM', 0, 4.48, 3.27, 0, Math.min(8.6, tw('WEIGHING ROOM', 0.3)), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  k.solid(9.2, 2.5, 5.0, 0, -5);
  for (const x of [-8.4, -2.8, 2.8, 8.4]) k.column(0.3, 4.3, x, 2.8);
  k.at();
  // the lawn: picnic tables under sunshades
  const SHADES = [PAL.barn, PAL.gold, PAL.money, PAL.saddle, PAL.barn, PAL.money];
  for (const [x, z, i] of LAWN.tables) {
    k.at(x, z, i * 1.1);
    bake(k, 'dn_picnic', 0, 0, 0, { over: { accent: SHADES[i % 6] } });
    k.at();
    k.solid(1.3, 0.5, 1.1, x, z, i * 1.1);
  }
}

// ---- the fairground annex: a plaza behind a striped fence with a gate toward the forecourt, a ticket hall, the wheel and the carousel, two kiosks and queue posts ----
function annex(w, loc, k) {
  const A = ANNEX, zc = (A.z0 + A.z1) / 2, xc = (A.x0 + A.x1) / 2, [gx, gz] = A.gate;
  k.box(A.x1 - A.x0, 0.12, A.z1 - A.z0, T(PAL.money), xc, 0, zc, { outline: 0 });                      // the plaza's turf
  // the paths: timber strips from the gate, a round where two meet (two square ends at an angle leave a notch of bare turf on the outside of the bend)
  const path = (a, b, wd = 5) => k.strip(a, b, wd, 0.14, T(SADDLE2), 0.0, { outline: 0 });
  const knee = ([x, z], wd = 5) => k.cyl(wd / 2, wd / 2, 0.14, 24, T(SADDLE2), x, 0, z, { outline: 0 });
  const fork = [A.wheel[0] - 18, A.wheel[1] - 14];
  path(A.gate, fork);
  path(A.gate, [A.carousel[0] + 2, A.carousel[1] + 10]);
  path(fork, [A.ticket[0] - 7, A.ticket[1] + 6]);                                                     // (to the ticket hall's first window, clear of the kiosk at x 170)
  knee(fork);
  // the gate's threshold: a timber apron 2 cm over the paths, between the pillars' feet (its sides in their plinths); the paths inside and out end on it
  k.box(6, 0.16, 9.6, T(SADDLE2), gx, 0, gz, { outline: 0 });
  // the fence all round; on the west side two runs, each ending at the middle of one of the gate's pillars
  const edge = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 4)), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      k.at(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, yaw);
      bake(k, 'dn_fence', 0, 0, 0, { sx: len / n / 4 });
      k.at();
    }
    k.solid(0.1, 0.65, len / 2, (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0));
  };
  edge(A.x0, A.z0, A.x1, A.z0); edge(A.x1, A.z0, A.x1, A.z1); edge(A.x1, A.z1, A.x0, A.z1);
  edge(A.x0, A.z1, gx, gz + 5.2); edge(gx, gz - 5.2, A.x0, A.z0);
  // the gate
  k.at(gx, gz, -Math.PI / 2);
  bake(k, 'dn_fair_gate');
  k.text('THE FAIRGROUND', 0, 7.4, 0.46, 0, tw('THE FAIRGROUND', 0.8), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  k.text('THE FAIRGROUND', 0, 7.4, -0.46, Math.PI, tw('THE FAIRGROUND', 0.8), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  k.solid(1.0, 4.5, 1.0, -5.2, 0);
  k.solid(1.0, 4.5, 1.0, 5.2, 0);
  k.at();
  // the ticket hall, its front toward the plaza
  k.at(A.ticket[0], A.ticket[1], 0);
  bake(k, 'dn_ticket_hall');
  k.text('TICKETS', 0, 4.8, -7.38, 0, tw('TICKETS', 1.6), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  k.solid(11, 1.8, 4, 0, -4);
  k.at();
  // two kiosks (dn_kiosk: free-standing, the arcades' stalls are built into their bays), the name on the board over the serving bay
  for (const [sx, sz, d] of A.kiosks) {
    k.at(sx, sz, 0);
    bake(k, 'dn_kiosk', 0, 0, 0, { over: { accent: d === 6 ? PAL.money : PAL.barn } });
    const nm = d === 6 ? 'SPACE SLUSH' : 'DERBY DONUTS';
    k.text(nm, 0, 3.325, 0.06, 0, tw(nm, 0.45), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    k.solid(2.5, 1.95, 1.8, 0, -1.7);
    k.at();
  }
  // queue posts on the turf: a snake of ropes in front of the wheel's boarding steps (clear of them and of the fence) and a line before the carousel's
  queue(k, A.wheel[0] - 9, A.wheel[1] + 9.2, 4, 0.12);
  queue(k, A.wheel[0], A.wheel[1] + 10.7, 4, 0.12);
  queue(k, A.carousel[0] - 5, A.carousel[1] + 12, 3, 0.12);
  // the rides: the wheel (its plane along x) and the carousel
  ferrisWheel(w, loc, k, A.wheel[0], A.wheel[1]);
  carousel(w, loc, k, A.carousel[0], A.carousel[1]);
  // lamps and a bench or two
  for (const [lx, lz] of [[132, 112], [200, 112], [200, 162], [132, 162], [165, 140]]) {
    lamp(k, lx, lz, xc, zc); k.column(0.4, 6.5, lx, lz);                      // (over the plaza)
  }
  // a way from the forecourt to the gate, onto its threshold
  path([70, 158], [100, 150], 4);
  path([100, 150], A.gate, 4);
  knee([100, 150], 4);
}

export function buildDowns(w, loc) {
  const vendors = [];
  const kit = settle(w, loc, 9091, (k) => {
    const as = (name, f) => { k.tag = name; f(); k.tag = ''; };      // (the dev audit names each triangle's builder: outpostModels.js Kit.tags)
    as('course', () => course(k));
    as('aprons', () => aprons(k));
    as('stand', () => grandstand(k, STAND));
    as('farstand', () => grandstand(k, FAR, { far: true }));
    as('clubhouse', () => clubhouse(k));
    as('arcades', () => arcades(k, vendors));
    as('forecourt', () => forecourt(k));
    as('drum', () => drum(k));
    as('podiums', () => podiums(k));
    as('stables', () => stables(k));
    as('paddock', () => paddock(k));
    as('annex', () => annex(w, loc, k));
  });
  // the stalls' vendors: stand behind their counters facing the walk, serving (world.addFigures; `vendor` figures keep their post and wave their arms a little: world.updateFigures)
  if (w.addFigures && vendors.length) {
    let next = 0;
    w.addFigures(loc, vendors.length, {
      kind: 'worker',
      look: (i) => ({ look: i % 3 === 1 ? 'trader' : 'casual', suit: vendors[i].accent, scale: 1.3 }),     // (a bit taller than the walkers, to stand over the counter)
      area: (out, f) => {
        const v = vendors[f.vi ??= next++];
        f.vendor = true; f.yaw = v.yaw;
        return out.set(v.x, 0.34, v.z);
      },
    });
  }
  return kit;
}
