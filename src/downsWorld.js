import * as THREE from 'three';
import { settle } from './settlements.js';
import { ferrisWheel, carousel, queue } from './downsFair.js';
import { T, G } from './outpostModels.js';
import { PAL, MINT2, MONEY2, SADDLE2, BLACK2, CONC, CONC2, FG, BG, tw, bake, fountain, sheet, kitSink, arcadeShell, ROOF } from './downsKit.js';
import {
  SEGS, RAIL_IN, RAIL_OUT, DIRT, FINISH_U, FINISH_X, STAND, FAR, CLUB, ENTRIES, ARCADE, WEDGE, STALLS, STALL_ORDER, CROSSINGS, CROSS_GAP, FORECOURT, DRUM, PODIUMS, RING, PAVILION, LAWN, STABLES, ANNEX, oval, lapLen, walkBlocker,
} from './downsPlan.js';

// Chimera Downs' static scenery, from the Blender kits (tools/blender/build_downs_*.py) plus a few code-made surfaces. race.js builds
// the live parts (screens, gate, crowd) and calls buildDowns for the rest. Layout: docs/downs-layouts.md, Layout B: The Horseshoe.
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

// A kit lamp post (dn_lamp: arm and globe reach toward model +x) at (x, z), its head turned toward (tx, tz).
function lamp(k, x, z, tx, tz) {
  k.at(x, z, 0);
  bake(k, 'dn_lamp', 0, 0, 0, { ry: Math.atan2(-(tz - z), tx - x) });
  k.at();
}

// ---- the oval: turf, dirt, lanes, rails, finish ----
function course(k) {
  // mown infield bands, raked dirt strips, a white line per lane: one layer of edge-sharing bands, not strips over a base
  // (layers 1 to 3 cm apart z-fight from a distance)
  const GRASS = 0x86a578, RAKE = 0xa4714e, FLAT = 0.06, SEG = 64;
  const band = (r0, r1, color) => k.add(ovalStrip(r0, r1, FLAT, SEG), T(color), 0, 0, 0, { outline: 0 });
  for (let r = 0; r < DIRT[0] - 1e-6;) {                                                  // mown stripes: 4 m of each 8
    const stripe = r >= 4 && (r - 4) % 8 === 0 && r < 40;
    const r1 = stripe ? r + 4 : (r < 4 ? 4 : r < 40 ? r + 4 : DIRT[0]);
    band(r, Math.min(r1, DIRT[0]), stripe ? GRASS : PAL.money);
    r = r1;
  }
  for (let i = 0; i < 5; i++) {                                                           // per lane: raked strip, white line on its outer edge, bare dirt between
    const s = DIRT[0] + i * 4;
    band(s, s + 1.82, RAKE); band(s + 1.82, s + 2, PAL.mint); band(s + 2, i < 4 ? s + 4 : DIRT[1], PAL.saddle);
  }
  // inner and outer rails, a thin collider wall under each bay. The crossings cut each loop into four runs between barrier posts
  // (dn_crossing), each split into equal ~5 m bays (dn_rail: post at the bay's start, rails into the next post). A run's first post
  // hides inside its barrier post and its last rails end inside the far one, so all runs end alike. Bays are spaced by distance
  // round the rail itself, so they stay equal on the bends.
  const XP = CROSS_GAP / 2 + 0.3;                                                         // barrier post centre from its crossing's: its 0.5 m foot 5 cm off the road
  // the rail `r` from the home straight's start (u = 0): its length, the centre-line distance u at s m round it, and the four crossing gaps as [from, to] in s
  // (home straight runs +x, far one -x), sorted
  const railWalk = (r) => {
    const L = lapLen(r), C = Math.PI * r, S = SEGS[0];
    const uOf = (s) => {
      s = ((s % L) + L) % L;
      return s < S ? s : s < S + C ? S + ((s - S) / C) * SEGS[1] : s < 2 * S + C ? S + SEGS[1] + (s - S - C) : 2 * S + SEGS[1] + ((s - 2 * S - C) / C) * SEGS[3];
    };
    const gaps = [];
    for (const cx of CROSSINGS) gaps.push([S / 2 + cx - XP, S / 2 + cx + XP], [S + C + S / 2 - cx - XP, S + C + S / 2 - cx + XP]);
    return { L, uOf, gaps: gaps.sort((a, b) => a[0] - b[0]) };
  };
  for (const [r, h] of [[RAIL_IN, 1.0], [RAIL_OUT, 1.2]]) {
    const { L, uOf, gaps } = railWalk(r);
    const at = (s) => oval(uOf(s), r, {});                                                // point s m round the rail
    gaps.forEach(([, s0], i) => {
      const s1 = i < gaps.length - 1 ? gaps[i + 1][0] : gaps[0][0] + L, n = Math.max(1, Math.round((s1 - s0) / 5));
      for (let j = 0; j < n; j++) {
        const p = at(s0 + ((s1 - s0) * j) / n), q = at(s0 + ((s1 - s0) * (j + 1)) / n);
        const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz);
        k.at(p.x, p.z, Math.atan2(-dz, dx));
        bake(k, 'dn_rail', 0, 0, 0, { sx: l / 5, sy: h });
        k.at();
        const a = j === 0 ? 0.25 : 0, b = j === n - 1 ? 0.25 : 0, m = (a + (l - b)) / 2 / l;      // wall stops at a barrier post's foot (the post has its own column)
        k.solid(0.15, h / 2, (l - a - b) / 2, p.x + dx * m, p.z + dz * m, Math.atan2(dx, dz));
      }
    });
  }
  // gold inlay along the boardwalk's inner edge, all the way round the track, as the arcades' walk-edge inlay (arcadeShell: 0.35 m wide, 5 cm
  // proud of the deck). It stops at the crossings where the rails do, at the barrier posts.
  {
    const { L, uOf, gaps } = railWalk(RAIL_OUT), r0 = DIRT[1] - 0.05, r1 = r0 + 0.35, polys = [];
    gaps.forEach(([, s0], i) => {
      const s1 = i < gaps.length - 1 ? gaps[i + 1][0] : gaps[0][0] + L, n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
      for (let j = 0; j < n; j++) {
        const ua = uOf(s0 + ((s1 - s0) * j) / n), ub = uOf(s0 + ((s1 - s0) * (j + 1)) / n), a0 = oval(ua, r0, {}), a1 = oval(ua, r1, {}), b0 = oval(ub, r0, {}), b1 = oval(ub, r1, {});
        polys.push({ pts: [[a0.x, a0.z], [b0.x, b0.z], [b1.x, b1.z], [a1.x, a1.z]], yb: () => 0.14 });
      }
    });
    kitSink(k)(sheet(polys, 0.03), PAL.gold, 0);
  }
  // the crossings: four, at x = +-70 on both straights. One deck as wide as the rails' gap (CROSS_GAP), from 0.5 m inside the
  // infield to 0.5 m onto the apron; top 16 cm up, clear of dirt (6 cm) and apron (12 cm) so no surfaces share a plane. Markings
  // are 0.4 m skins 6 mm proud: a gold edge line each side 0.3 m in, and seven Barn Red bars evenly spaced between the rails.
  // Barrier posts (dn_crossing) stand at the gap's corners on the rail lines, feet 5 cm off the deck, hinge boxes toward the road,
  // booms up; the far-side one is the same model turned half round (symmetric about its rail, so a mirror).
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
      k.column(0.3, 2.0, x, z);                                                            // up to the cap lamp
      k.column(0.08, 5.2, x - dx * 0.3, z);                                               // the boom
    }
  }
  // finish: chequered strip, arch, photo-finish tower on the apron
  for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) k.box(0.9, 0.03, 0.9, T((i + j) % 2 ? PAL.black : PAL.mint), FINISH_X - 0.45 + j * 0.9, 0.06, 45.2 + i * 0.95, { outline: 0 });
  k.at(FINISH_X, 54.7, -Math.PI / 2);
  bake(k, 'dn_finish_arch');
  for (const sz of [-1, 1]) k.text('FINISH', 0, 10.1, sz * 0.715, sz > 0 ? 0 : Math.PI, tw('FINISH', 1.4), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });   // 1 cm in front of its panel
  for (const sx of [-1, 1]) k.solid(0.7, 5.7, 0.8, sx * 11.8, 0);
  k.solid(12.6, 1.3, 0.9, 0, 0, 0, 8.6);                                                  // beam and its two belts
  k.at();
  k.at(FINISH_X - 6, 70.2, 0);                                   // short of the line: the stand's tunnel exits past it
  bake(k, 'dn_photo_tower');
  k.solid(1.5, 4.2, 1.5, 0, 0);
  k.solid(2.6, 1.4, 2.1, 0, 0, 0, 5.1);
  k.at();
  // distance poles counting down to the finish on the inside rail, boards facing the stands
  for (let d = 100; d <= 600; d += 100) {
    oval(FINISH_U - d, RAIL_IN - 0.6, _o);
    k.at(_o.x, _o.z, Math.atan2(-_o.hz, _o.hx));
    bake(k, 'dn_furlong', 0, 0, 0, { over: { barn: d % 200 ? PAL.barn : PAL.mint } });
    k.text(`${d}`, 0, 2.86, 0.225, 0, tw(`${d}`, 0.5), { fg: FG.mint, bg: BG.money, back: false, off: 0.01 });   // 1 cm in front of the board
    k.at();
    k.column(0.2, 3.56, _o.x, _o.z);
  }
}

// ---- a grandstand: seat tiers, aisles, parapet, suites, roof, towers, back wall. In the stand's own frame (spectators face -z,
// front edge z = 0), turned half round for the far stand ----
// Every outlined piece along the stand is one piece end to end (roof, back wall, suites: build_downs_stand.py; the tunnelled tiers;
// the parapet), or meets its neighbour at a step of 5 cm or more, or ends inside a bigger solid: outlined pieces meeting flush show
// a dark line on the joint. The Blender parts are baked once each at the stand's origin, authored to these numbers (MAIN / FAR there).
function grandstand(k, S, { far = false } = {}) {
  // A prism: polygon `pts` [[u, v]...] (any winding, concave ok) extruded a0 to a1 along the third axis, as flat-shaded triangles
  // sharing no vertices (for inkShell). axis 'z': polygon in (x, y), along z (a tier with tunnels cut from its foot); 'x': in (z, y),
  // along x (a tunnel wall's profile).
  function prism(pts, a0, a1, axis = 'z') {
    const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ring = area < 0 ? [...pts].reverse() : pts;                                       // CCW in (u, v): cap at a1 faces +a, sides face out
    const P = (p, a) => (axis === 'z' ? [p[0], p[1], a] : [a, p[1], p[0]]);
    const flip = axis === 'x', pos = [];                                                     // (z, y, x) mirrors (x, y, z): flip every triangle
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
  
  // A prism made in the current frame, outlined face by face (inkShell; the kit's scaled-copy hull only fits boxes), added in the
  // kit's plain frame as kitSink wants.
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
  const seatTiers = far ? S.tiers : S.tiers - 1;           // main stand's top tier carries the suites
  const towerW = far ? 7.7 : 8.7, towerD = far ? 8.7 : 9.7, TZ = 0.51;   // corner tower plinth; shaft front TZ behind the stand front so the parapet runs past
  const wallH = far ? 14.6 : 22.4;
  const back = (far ? S.tiers * S.depth : (S.tiers - 1) * S.depth + 3.2) + S.wall;   // back wall's rear face (past the suites on the main stand)
  const wallZ = back - S.wall;                                                         // and its front face
  const edges = [S.x0 + 0.8, ...S.aisles.flatMap((a) => [a - 1.2, a + 1.2]), S.x1 - 0.8];
  // Entries are tunnels from the back wall straight through at ground level, 6 m wide, 4 m high. Under tiers taller than TUN_CH it is
  // roofed (those tiers have their foot cut out); in front, where tiers are low, it is an open trench through the steps, exiting via a
  // gap in the front parapet. `spans` splits a width of the stand at the tunnels (`m` either side of each).
  const TUN_W = 3.0, TUN_CH = 4.2, MOUTH = TUN_W + 0.2, CEIL = 4.0;    // tunnel half width; cut in the tiers' feet (MOUTH a side, TUN_CH high); ceiling underside
  const LINE = MOUTH + 0.05;                                            // tunnel walls run from TUN_W into the steps' ends, 5 cm deep
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
    const d = !far && i === S.tiers - 1 ? S.depth + 0.6 : S.depth;     // top tier is deeper, under the suites
    const zc = z0 + d / 2;
    const conc = i % 2 ? CONC : CONC2;
    if (roofed(top)) {
      // tunnelled tier: ONE step the full length with the tunnels cut from its foot (separate pieces show joints), 2 cm short of
      // each end so its ends aren't in the towers' and end walls' planes
      const xa = -(len - 0.04) / 2, xb = (len - 0.04) / 2, pts = [[xa, 0]];
      for (const ex of [...ENTRIES].sort((p, q) => p - q)) pts.push([ex - MOUTH, 0], [ex - MOUTH, TUN_CH], [ex + MOUTH, TUN_CH], [ex + MOUTH, 0]);
      pts.push([xb, 0], [xb, top], [xa, top]);
      addSolid(k, prism(pts, z0, z0 + d), conc, 0.03);
      for (const [sa, sb] of spans(xa, xb)) k.solid((sb - sa) / 2, top / 2, d / 2, (sa + sb) / 2, zc);
      for (const ex of ENTRIES) k.solid(MOUTH, (top - CEIL) / 2, d / 2, ex, zc, 0, CEIL);
    } else {
      // trenched tier: a step each side, ends let into the trench wall
      for (const [xa, xb] of spans(-(len - 0.04) / 2, (len - 0.04) / 2)) {
        k.box(xb - xa, top, d, T(conc), (xa + xb) / 2, 0, zc, { outline: 0.03 });
        k.solid((xb - xa) / 2, top / 2, d / 2, (xa + xb) / 2, zc);
      }
    }
    // dark nosing on each step's front edge so the rake reads: 1.5 cm proud, 4 cm short of the ends (at a trench, 2 cm into the
    // wall); none on the first step, whose edge is inside the parapet
    if (i > 0) for (const [xa, xb] of spans(-(len - 0.08) / 2, (len - 0.08) / 2, !roofed(top), MOUTH + 0.02)) k.box(xb - xa, 0.135, 0.16, T(PAL.black), (xa + xb) / 2, top - 0.12, z0 + 0.06, { outline: 0 });
    if (i === firstRoofed) for (const ex of ENTRIES) {                                                  // step where a tunnel's roof starts: a themed barrier instead of seats over the cut
      k.box(2 * MOUTH, 0.9, 0.3, T(PAL.barn), ex, top, z0 + 0.5, { outline: 0.03 });
      k.box(2 * MOUTH + 0.2, 0.12, 0.5, T(PAL.gold), ex, top + 0.9, z0 + 0.5, { outline: 0.01 });
      for (let j = -2; j <= 2; j++) k.box(0.9, 0.5, 0.012, T(j % 2 ? PAL.mint : PAL.gold), ex + j * 1.3, top + 0.2, z0 + 0.35, { outline: 0 });        // banner panels, 6 mm proud
      k.solid(MOUTH, 0.55, 0.2, ex, z0 + 0.5, 0, top);
    }
    if (i < seatTiers) {
      // seats in strips of three per section; members' enclosure (middle sections' upper tiers) in Barn Red
      const clip = z0 < towerD + 0.5 ? hw - towerW - 0.5 : hw;     // clear of the front-corner towers
      for (let e = 0; e < edges.length; e += 2) {
        const xa = Math.max(edges[e], -clip), xb = Math.min(edges[e + 1], clip);
        const n = Math.floor((xb - xa) / 2.7);
        if (n < 1) continue;
        const mid = Math.abs((xa + xb) / 2) < 30;
        const col = mid && i > S.tiers - 6 ? PAL.barn : i % 2 ? PAL.mint : PAL.money;
        const x0 = xa + ((xb - xa) - n * 2.7) / 2 + 1.35;
        for (let s = 0; s < n; s++) {
          const sx = x0 + s * 2.7;
          if (i <= firstRoofed && ENTRIES.some((ex) => Math.abs(sx - ex) < MOUTH + 1.5)) continue;          // none in or beside the trench, nor above its roof
          bake(k, 'dn_seat3', sx, top, z0 + 0.95, { over: { seat: col } });
        }
      }
    }
  }
  // aisle stairs: a half-step on each tread down each aisle's middle (over a tunnel, from its roof up), brass handrails both sides
  const Z1 = S.tiers * S.depth - 1;
  for (const ax of S.aisles) {
    const over = ENTRIES.some((ex) => Math.abs(ex - ax) < 0.1);
    for (let i = 1; i < seatTiers; i++) {
      if (over && i <= firstRoofed) continue;
      const y0 = over ? CEIL + 0.3 : 0, h = i * S.rise + S.rise / 2 - y0;                           // on tier i - 1's tread
      const zf = i * S.depth - S.depth / 2, zb = i * S.depth + 0.05;                                 // back let 5 cm into the riser
      k.box(2.4, h, zb - zf, T(CONC2), ax, y0, (zf + zb) / 2, { outline: 0.015 });
      k.box(2.38, 0.06, 0.12, T(PAL.gold), ax, y0 + h - 0.045, zf + 0.045, { outline: 0 });         // brass edge, 1.5 cm proud
      k.solid(1.2, h / 2, (zb - zf) / 2, ax, (zf + zb) / 2, 0, y0);
    }
    const zr = over ? firstRoofed * S.depth + 0.8 : 0, rail = (z) => 1.9 + (topY + 0.9 - 1.9) * (z / Z1);   // over a tunnel: from just behind its barrier
    const tread = (z) => (Math.floor(z / S.depth) + 1) * S.rise;
    const posts = [zr + 0.25];
    for (let i = 0; i < S.tiers; i += 2) if (i * S.depth + 1.45 > zr + 1 && i * S.depth + 1.45 < Z1 - 1) posts.push(i * S.depth + 1.45);
    if (far) posts.push(Z1 - 0.1);                                                                    // main stand's rails end in the suites
    for (const s of [-1, 1]) {
      const x = ax + s * 1.25;
      k.beam([x, rail(zr), zr], [x, topY + 0.9, Z1], 0.05, T(PAL.gold), { outline: 0.01 });
      for (const z of posts) k.beam([x, tread(z) - 0.02, z], [x, rail(z), z], 0.03, T(PAL.gold), { outline: 0.008 });
    }
  }
  // front parapet with sponsor boards and a gold top rail. Runs past the towers to 6 cm past the end walls' trim (a step, not a
  // seam); at tunnels its ends sit in the mouth piers. Its back is let 16 cm into the first step, end walls and tower plinths so no
  // slot shows; the end walls' trim rises out of its top.
  for (const [xa, xb] of spans(-(hw + 1.0), hw + 1.0, true, MOUTH + 0.1)) {               // ends 10 cm past the steps', inside the piers
    k.box(xb - xa, 1.3, 0.535, T(MONEY2), (xa + xb) / 2, 0, -0.1075, { outline: 0.04 });                  // z -0.375 to 0.16
    k.beam([xa + 0.04, 1.33, -0.2], [xb - 0.04, 1.33, -0.2], 0.06, T(PAL.gold), { outline: 0.01 });          // rail sits 3 cm into the top
    k.solid((xb - xa) / 2, 0.65, 0.2675, (xa + xb) / 2, -0.1075);
  }
  const ads = far ? [['THE FAR TURN CLUB', FG.gold]]
    : [['ANTIMATTER LAB · WE BREED WINNERS', '#9bd37a'], ['LUCKY CRATER CASINO', FG.gold], ['MERIDIAN EXCHANGE', '#9bd7ff'], ['QUANTUM-LOCK SKATES', FG.gold]];
  ads.forEach(([t, c], i) => k.text(t, far ? 0 : -75 + i * 50, 0.66, -0.38, Math.PI, Math.min(far ? 60 : 44, tw(t, 1.0)), { fg: c, bg: BG.black, back: false, off: 0.02 }));
  // back wall, one piece with an opening per entry (dn_backwall: 5.8 x 3.9 m; tunnel walls and ceiling 10 cm proud of the jambs and
  // head), a frame round each opening; end walls close the sides
  bake(k, far ? 'dn_backwall_s' : 'dn_backwall', 0, 0, back);
  for (const ex of ENTRIES) bake(k, 'dn_entry', ex, 0, back + 0.02);
  const OPEN = 2.9, HEAD = 3.9;
  for (const [xa, xb] of spans(-hw - 1, hw + 1, true, OPEN)) k.solid((xb - xa) / 2, wallH / 2, 0.4, (xa + xb) / 2, back - 0.4);
  for (const ex of ENTRIES) k.solid(OPEN, (wallH - HEAD) / 2, 0.4, ex, back - 0.4, 0, HEAD);
  if (!far) for (const sx of [-1, 1]) k.solid(0.575, wallH / 2, 0.29, sx * (hw + 0.375), back - 0.01);     // main stand's rear quoins (the far stand's are in the arcades' returns)
  // Tunnels: ONE wall a side from apron to back wall, so no joints show inside. In front of the roofed tiers it is the trench cheek
  // (coping 12 cm over each step, stepping up 10 cm short of each riser); under them it is the tunnel wall, top let into the tiers'
  // feet, with a flat lit ceiling. A mouth pier takes the parapet's end. The floor is the apron's (aprons()).
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
      k.box(0.55, 1.75, 0.85, T(MONEY2), ex + s * 3.225, 0, -0.075, { outline: 0.03 });                      // pier: 5 cm proud of the wall inside, 12.5 cm in front of the parapet
      k.box(0.65, 0.11, 0.95, T(PAL.gold), ex + s * 3.225, 1.74, -0.075, { outline: 0.012 });                // and its cap
      k.solid(0.275, 0.9, 0.425, ex + s * 3.225, -0.075);
    }
    k.box(2 * TUN_W, TUN_CH + 0.02 - CEIL, wallZ + 0.05 - (roofZ + 0.1), T(MINT2), ex, CEIL, (wallZ + 0.05 + roofZ + 0.1) / 2, { outline: 0.02 });   // ceiling, 10 cm in under the cut
    for (let z = roofZ + 3; z < back - 1.5; z += 7) k.box(1.4, 0.08, 0.9, G(0xffe9a0), ex, CEIL - 0.06, z, { outline: 0 });
  }
  // End walls: a Money band round the seats' side. Their outer faces sit in the arcades (joiner) up to where the arcade's back wall
  // meets them (zA; all the way on the far stand) and carry the arcade's trim there so it turns the corner: wainscot to 2.4 m (14 cm
  // proud), string course at 4.4 m (8 cm). The trim starts 10 cm behind the wall's front and is let 2 cm into the wall.
  const zA = Math.min(back, Math.sqrt(ARCADE.ro ** 2 - (hw + 0.8 - ARCADE.cx) ** 2) - S.z0);
  for (const sx of [-1, 1]) {
    const xo = sx * (hw + 0.8), out = (a, b) => xo + sx * (a + b) / 2;          // middle of a strip a to b m out of the outer face
    k.box(0.8, wallH - 2, back, T(PAL.mint), sx * (hw + 0.4), 0, back / 2, { outline: 0.06 });
    k.box(0.15, 0.5, back - 0.12, T(MONEY2), sx * (hw + 0.025), 2.6, (back + 0.08) / 2, { outline: 0 });
    k.box(0.16, 2.38, zA - 0.15, T(MONEY2), out(-0.02, 0.14), 0.02, (zA + 0.05) / 2, { outline: 0 });       // to 5 cm short of zA, inside the arcade's back
    k.box(0.1, 0.35, zA - 0.15, T(MONEY2), out(-0.02, 0.08), 4.4, (zA + 0.05) / 2, { outline: 0 });         // wall (or the far stand's corner pilaster)
    if (zA < back - 0.1) k.box(0.15, 0.5, back - 0.02 - zA, T(MONEY2), out(-0.1, 0.05), 2.6, (zA + back - 0.02) / 2, { outline: 0 });
    k.solid(0.4, (wallH - 2) / 2, back / 2, sx * (hw + 0.4), back / 2);
  }
  if (!far) bake(k, 'dn_suites', 0, topY, (S.tiers - 1) * S.depth + 0.1);              // end wall to end wall, 10 cm back from the top riser (a ledge, not a seam)
  // roof: one piece end wall to end wall (dn_roof / dn_roof_s) through the corner towers, on columns behind the back wall at bay
  // edges (entries are at bay middles) and the beam along the back wall's cap
  bake(k, far ? 'dn_roof_s' : 'dn_roof', 0, 0, 0);
  for (let j = 1; j < Math.round(len / 19); j++) k.column(0.5, wallH + 0.85, S.x0 + 19 * j, back + 0.4);
  const names = far ? [] : [['CHIMERA DOWNS', 0], ['EST. YEAR ONE', -57], ['EST. YEAR ONE', 57]];
  for (const [t, x] of names) k.text(t, x, 22.1, -4.62, Math.PI, Math.min(14, tw(t, 1.1)), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  // front-corner towers, the roof deck running through them
  for (const sx of [-1, 1]) {
    bake(k, far ? 'dn_tower_s' : 'dn_tower', sx * (hw - towerW / 2), 0, TZ);
    k.solid(towerW / 2 + 0.1, (far ? 18 : 26) / 2, (towerD + 0.2) / 2, sx * (hw - towerW / 2), TZ + (towerD - 0.7) / 2);
  }
  k.at();
}

// ---- clubhouse and tote hall: behind the main stand's centre, facing the forecourt ----
function clubhouse(k) {
  k.at(0, CLUB.z1, 0);
  bake(k, 'dn_club');
  k.solid(30, 9.4, 11, 0, -16, 0, 0);                              // body (the portico's counters stand clear of it)
  k.solid(30.3, 0.4, 0.15, 0, -27.15);                             // plinth, 0.3 m proud at the back and sides
  for (const s of [-1, 1]) k.solid(0.15, 0.4, 11.15, s * 30.15, -16.15);
  for (let i = 0; i < 10; i++) k.column(0.62, 9, -27 + i * 6, -0.8);
  k.solid(6, 12, 6, 0, -13, 0, 18);                                // tower's foot, on the roof
  k.at();
}

// ---- the apron: a timber promenade along each stand, with lamps ----
// Each side's floor is ONE solid (sheet), from just under the dirt's edge to 10 cm under the stand's front and on through each
// tunnel, so no joints show. It ends at x = +-90, edge to edge with the arcades' rail walk (arcades()) at the same height. Behind
// the main stand the tunnel floors end under the back wall where the forecourt slate begins; behind the far stand, 0.5 m outside.
function aprons(k) {
  const END = ARCADE.cx, W = 3.1;                                                 // apron ends at the rail walk's straight edge; W: half a tunnel floor (10 cm under each wall)
  const ex = [...ENTRIES].sort((a, b) => a - b), xs = [-END, ...ex.flatMap((e) => [e - W, e + W]), END];
  k.at();
  for (const s of [-1, 1]) {
    const S = s > 0 ? STAND : FAR, zf = s * (DIRT[1] - 0.1), zs = s * (S.z0 + 0.1);
    // tunnel floor ends: main stand, where forecourt()'s slate begins (FORECOURT.z0 - 0.6 = 113.4); far stand, 0.5 m outside
    const zt = s > 0 ? FORECOURT.z0 - 0.6 : -(FAR.z0 + FAR.tiers * FAR.depth + FAR.wall + 0.5);
    const polys = [];
    for (let i = 0; i < xs.length - 1; i++) polys.push({ pts: [[xs[i], zf], [xs[i + 1], zf], [xs[i + 1], zs], [xs[i], zs]], yb: () => 0 });
    for (const e of ex) polys.push({ pts: [[e - W, zs], [e + W, zs], [e + W, zt], [e - W, zt]], yb: () => 0 });
    kitSink(k)(sheet(polys, 0.12), SADDLE2, 0);
    for (let x = -100; x <= 100; x += 20) {
      if (Math.abs(x - FINISH_X) < 7) continue;
      lamp(k, x, s * (STAND.z0 - 3), x, 0);                                  // head toward the track
      k.column(0.4, 6.5, x, s * (STAND.z0 - 3));
    }
  }
}

// A flat-shaded prism over a convex plan polygon [[x, z]...], bottom at yb(x, z), `h` thick (the joiner bays aren't boxes).
function slab(poly, yb, h) {
  const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const ring = area > 0 ? [...poly].reverse() : poly;                       // clockwise on the x-right, z-up plan: tops face up, sides out
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

// The arcade's last wedge ends on a radial line but the stand's end wall is straight, leaving a tapering gap; this bay fills it.
// Its back wall chord, trim, architrave, fascia, roof and ceiling come from the run's continuous pieces (arcadeShell, downsKit.js);
// this adds the floor (in the adjacent wedge's frame: `th` its middle, `side0` +1 when the stand is on the west arcade's local +x),
// the back wall's collider and, behind the far stand, the return.
// wallU: the stand end wall's face x (west arcade's sense); rearZ: far stand only, that wall's rear corner.
function joiner(k, mir, th, side0, wallU, rearZ) {
  const R = Math.PI / 180, side = side0 * mir;                                   // east arcade mirrors the west: stand on the wedge's other side
  const polar = (r, t) => [mir * (-ARCADE.cx + r * Math.cos(t * R)), r * Math.sin(t * R)];
  const [px, pz] = polar(WEDGE.r0, th), yaw = mir * (Math.PI / 2 - th * R), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const local = ([wx, wz]) => [(wx - px) * cy - (wz - pz) * sy, (wx - px) * sy + (wz - pz) * cy];
  const south = rearZ !== null;
  const onWall = (r) => { const t = Math.acos((wallU + ARCADE.cx) / r) / R; return south ? 360 - t : t; };          // angle where circle r meets the wall
  const D = [side * WEDGE.wi, 0];                                                                                  // wedge's front corner on the shared edge
  // The floor runs from the wedge into the stand's end wall (and under the return): its far edge 10 cm inside the wall so it doesn't
  // z-fight the stand's wainscot.
  const toX = (p, q, x) => { const s = (mir * x - p[0]) / (q[0] - p[0]); return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]; };
  const edgeT = th - side0 * ARCADE.step / 2;
  const A = local(toX(polar(ARCADE.ri, edgeT), polar(ARCADE.ri, onWall(ARCADE.ri)), wallU + 0.1));               // where the walk's edge reaches that line
  const rB = ARCADE.ro - 0.35 / Math.cos(WEDGE.a2), C = local(polar(rB, edgeT));                                    // back edge down the back wall's middle, like the wedges' floors
  const B = local(toX(polar(rB, edgeT), polar(rB, onWall(rB)), wallU + 0.1));
  k.at(px, pz, yaw);
  // the floor (inlay, walls, trim, roof and ceiling are arcadeShell's)
  k.add(slab([D, C, B, A], () => 0, 0.14), T(SADDLE2), 0, 0, 0, { outline: 0 });
  k.at();
  // Back wall chord from the wedge's back corner (Cw) to the stand's wall (Bw): arcadeShell builds it, here its collider. Behind
  // the far stand the arcade's back is 3.8 m behind the stand's, so a return closes it: the end wall carried on 0.82 m thick from
  // the stand's rear corner to the chord, bay face flush and trimmed like the end wall, meeting the chord on the diagonal so joints
  // fall on corners. Its top runs into the roof (raked along the wedge's radius, ROOF); its gold cornice meets the chord's (8.1 to 8.4 m).
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
    for (const [d, t, y0, y1] of [[0.14, 0.84, 0.14, 2.4], [0.08, 0.78, 4.4, 4.75]]) {                           // wainscot and string course on its bay face
      k.add(slab([[mir * (wallU - d), rearZ], [x0, rearZ], onLine(t, xPlane(wallU)), onLine(t, xPlane(wallU - d))], () => y0, y1 - y0), T(MONEY2), 0, 0, 0, { outline: 0 });
    }
    sink(sheet([{ pts: [[mir * (wallU + 0.3), rearZ + 0.02], [mir * (wallU + 0.92), rearZ + 0.02], onLine(-0.1, xPlane(wallU + 0.92)), onLine(-0.1, xPlane(wallU + 0.3))],   // 2 cm into the stand's walls, off the return's end plane
      yb: (x, z) => under(x, z) - 0.28, yt: (x, z) => under(x, z) + 0.02 }]), PAL.gold, 0);
    k.solid(0.41, 4.2, Math.abs(K1[1] - rearZ) / 2, mir * (wallU + 0.41), (K1[1] + rearZ) / 2);
    // pilaster hiding the end wall / return joint (the outline would show), floor to ceiling, trim dying into it; back sunk 15 cm
    // into the walls and foot 4 cm into the floor so no face is coplanar (z-fighting)
    sink(sheet([{ pts: [[mir * (wallU - 0.2), rearZ - 0.3], [mir * (wallU + 0.15), rearZ - 0.3], [mir * (wallU + 0.15), rearZ + 0.3], [mir * (wallU - 0.2), rearZ + 0.3]],
      yb: () => 0.1, yt: (x, z) => under(x, z) - 0.03 }]), MINT2, 0.02);
  }
}

// ---- the arcades round the turns ----
// A wedge's origin is its inner chord's middle, local +z outward along the radius. The east arcade mirrors the west (x and yaws negated).
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
        k.solid(WEDGE.wo, 4.2, 0.4, 0, WEDGE.d - 0.35);                // back wall
        k.column(0.4, 6.5, -WEDGE.wi + 0.55, 0.55);                    // colonnade
        const si = run.stalls.indexOf(i);
        if (si >= 0) {
          // a stall built into the bay (dn_stall_*, build_downs_stalls.py: alcove on a plinth before the back wall, bay frame, cornice
          // 0.6 m under the ceiling), a vendor behind the counter
          const st = STALLS[STALL_ORDER[mir > 0 ? 0 : 1][ri * 5 + si]];
          bake(k, `dn_stall_${st.d}`, 0, 0, 0, { over: { accent: st.accent } });
          for (const sx of [-1, 1]) {
            k.solid(0.35, 1.78, 0.25, sx * 4.65, 11.55, 0, 0.34);          // screen wall piers
            k.solid(0.15, 3.55, 1.59, sx * 4.85, 13.39, 0, 0.34);          // alcove side walls
          }
          k.solid(5, 1.74, 0.25, 0, 11.55, 0, 3.9);                        // screen above the arch
          k.solid(5, 3.55, 0.125, 0, 14.855, 0, 0.34);                     // alcove back wall
          k.solid(4.4, 0.65, 0.87, 0, 12.65, 0, 0);                        // counter
          vendors.push({ x: x + 14.1 * Math.sin(yaw), z: z + 14.1 * Math.cos(yaw), yaw: yaw + Math.PI, accent: st.accent });
        } else {
          // open bay: a bench facing the walk, a planter each side, on the bay floor (0.14 m). Bench (3.2 m) keeps 0.16 m off the
          // wainscot and 0.74 m from each planter (x 2.34 to 4.86); its collider is the seat block. Bays beside the gate (run 1's
          // first, run 0's last) have the gate tower's plinth across a corner (bay x 4.39 to 4.63, gate side; mirrored east): there the
          // group moves 0.5 m off it and the planters close to 0.54 m, keeping the gate-side rim 0.23 m off the plinth
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
    // gate hall mid-arcade (dn_gate_hall: two 10 m towers either side of a 12 m vaulted passage, arch block set back to z = +-10.4).
    // Name boards on the arch block faces (z = +-10.65), letters 1 cm in front: track name on the track face (-z), gate name outside.
    const [gx, gz] = at(ARCADE.ri + 8, ARCADE.gate), gyaw = yawOf(ARCADE.gate);
    k.at(gx, gz, gyaw);
    bake(k, 'dn_gate_hall');
    const nm = mir > 0 ? 'WEST GATE' : 'EAST GATE';
    k.text(nm, 0, 9.7, 10.66, 0, tw(nm, 1.7), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    k.text('CHIMERA DOWNS', 0, 9.7, -10.66, Math.PI, tw('CHIMERA DOWNS', 1.5), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    for (const sx of [-1, 1]) {
      k.solid(5.25, 0.3, 11.25, sx * 11, 0);                           // tower plinth, 0.25 m proud into the passage and round the faces
      k.solid(5, 6.7, 11, sx * 11, 0, 0, 0.6);                         // tower, to its cornice (14 m)
      k.solid(0.06, 1.56, 11.08, sx * 5.94, 0, 0, 0.6);               // passage rustication and wainscot to the string course (3.72 m), face at |x| = 5.88
    }
    k.at();
    // rail walk: a timber slab ring between dirt and arcade, apron height, covering the whole turn so no bare ground shows where
    // apron, walk and stand ends meet
    const [t0, t1] = mir > 0 ? [90, 270] : [-90, 90];
    const ring = new THREE.Shape(), steps = 120, r0 = DIRT[1] - 0.1, r1 = ARCADE.ri;
    for (let i = 0; i <= steps; i++) { const t = (t0 + (t1 - t0) * i / steps) * Math.PI / 180; ring[i ? 'lineTo' : 'moveTo'](r1 * Math.cos(t), r1 * Math.sin(t)); }
    for (let i = steps; i >= 0; i--) { const t = (t0 + (t1 - t0) * i / steps) * Math.PI / 180; ring.lineTo(r0 * Math.cos(t), r0 * Math.sin(t)); }
    k.add(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.12, 0), T(SADDLE2), mir * -ARCADE.cx, 0, 0, { outline: 0 });
    // continuous parts, one piece per run (gate hall into the stand's end wall): arcadeShell
    k.at();
    ARCADE.runs.forEach((run, ri) => arcadeShell(kitSink(k), {
      solid: (hx, hy, hz, x, y, z, q) => k.solidQ(hx, hy, hz, x, y, z, q),
      mir, edges: Array.from({ length: run.n + 1 }, (_, i) => run.a0 + ARCADE.step * i),
      stand: ri === 0 ? { atStart: true, wallU: -(STAND.x1 + 0.8), rearZ: null } : { atStart: false, wallU: -(FAR.x1 + 0.8), rearZ: -(FAR.z0 + FAR.tiers * FAR.depth + FAR.wall) },
    }));
    // a joiner bay where each arcade end meets a stand
    {
      joiner(k, mir, ARCADE.runs[0].a0 + ARCADE.step * 0.5, 1, -(STAND.x1 + 0.8), null);
      const last = ARCADE.runs[1];
      joiner(k, mir, last.a0 + ARCADE.step * (last.n - 0.5), -1, -(FAR.x1 + 0.8), -(FAR.z0 + FAR.tiers * FAR.depth + FAR.wall), true);
    }
  }
}

// forecourt slate: cool against the pale ground and the timber (the only paving off the palette)
const SLATE = 0x6c7683, SLATE2 = 0x5c6571;

// ---- concourse and forecourt behind the main stand: paving, timber avenue, fountain, festoon masts, lamps, benches, planters, valet bays, gate ----
function forecourt(k) {
  const F = FORECOURT, w = F.x1 - F.x0;
  // Paving: one layer of slate slabs with a darker joint every 12 m, slabs and joints sharing edges (no overlays to z-fight). Runs
  // from under the stand's back wall to 0.8 m past the gate's pylons, so the gate stands on it.
  const Z0 = F.z0 - 0.6, Z1 = F.gate + 2.5, JW = 0.14;
  let xa = F.x0;
  for (let jx = -66; jx <= 66; jx += 12) {                                                                             // symmetric about the avenue
    k.box(jx - JW / 2 - xa, 0.12, Z1 - Z0, T(SLATE), (xa + jx - JW / 2) / 2, 0, (Z0 + Z1) / 2, { outline: 0 });
    k.box(JW, 0.12, Z1 - Z0, T(SLATE2), jx, 0, (Z0 + Z1) / 2, { outline: 0 });
    xa = jx + JW / 2;
  }
  k.box(F.x1 - xa, 0.12, Z1 - Z0, T(SLATE), (xa + F.x1) / 2, 0, (Z0 + Z1) / 2, { outline: 0 });
  // timber avenue from the promenade out through the gate, 2 cm short of the paving's end, planks across and gold edges, each layer
  // 2 cm short of the one under it
  const A0 = F.promenade[1], A1 = Z1 - 0.02;
  k.box(2 * F.avenue, 0.16, A1 - A0, T(SADDLE2), 0, 0, (A0 + A1) / 2, { outline: 0 });
  for (let z = A0 + 3; z < A1 - 0.1; z += 3) k.box(2 * F.avenue - 0.04, 0.17, 0.08, T(0x7a5236), 0, 0, z, { outline: 0 });
  for (const s of [-1, 1]) k.box(0.3, 0.18, A1 - A0 - 0.04, T(PAL.gold), s * F.avenue, 0, (A0 + A1) / 2, { outline: 0 });
  k.box(w - 0.04, 0.16, F.promenade[1] - F.promenade[0], T(SADDLE2), 0, 0, (F.promenade[0] + F.promenade[1]) / 2, { outline: 0 });   // promenade along the clubhouse front
  // paths from the stand's entries (10 cm inside the back wall, over the tunnel floor's end) to the promenade
  const wallIn = STAND.z0 + (STAND.tiers - 1) * STAND.depth + 3.2 - 0.1;
  for (const ex of ENTRIES) k.box(8, 0.16, F.promenade[0] - wallIn, T(SADDLE2), ex, 0, (wallIn + F.promenade[0]) / 2, { outline: 0 });
  // the fountain, ringed in gold
  const [fx, fz] = F.fountain;
  fountain(k, fx, fz, 0.16);                                                     // on the avenue's timber, 0.16 m up
  k.column(12, 1.36, fx, fz);
  k.ring(13.2, 0.12, G(PAL.gold), fx, 0.17, fz);
  // masts both sides of the avenue, lights strung across every other pair
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
    lamp(k, s * (F.avenue + 4.2), z, 0, z);                                  // over the avenue
    k.column(0.4, 6.5, s * (F.avenue + 4.2), z);
  }
  // benches (3.2 m along z) facing the avenue on the paving (0.12 m), a planter along z midway between each pair
  for (const s of [-1, 1]) for (let z = 156; z < 188; z += 10) {
    k.at(s * 26, z, 0);
    bake(k, 'dn_bench', 0, 0.12, 0, { ry: -s * Math.PI / 2 });
    if (z + 10 < 188) bake(k, 'dn_planter', 0, 0.12, 5, { ry: s * Math.PI / 2 });
    k.at();
    k.solid(0.465, 0.28, 1.6, s * 26.135, z);
    if (z + 10 < 188) k.solid(0.56, 0.52, 1.26, s * 26, z + 5);
  }
  // valet bays: two diagonal blocks of six, heads toward the sides, on the paving (dn_bay's paint lines are 1.5 cm thick)
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

// ---- infield screen drum (the winners' podiums stand in front of it) ----
function drum(k) {
  k.at(DRUM.x, DRUM.z, 0);
  bake(k, 'dn_drum');
  k.solid(5.4, 9, 5.4, 0, 0);
  k.at();
}

// Each step's number is a plate 1.2 cm off its front face (z = 2.0), fitted between the platform's lip (0.3) and the Black nosing
// (from h - 0.14) with a few cm clear; the plate is about square (tw), so that band sets its size.
function podiums(k) {
  const medals = [['1', 0, 1.4, '#cfb352', '#3b393a'], ['2', -6.5, 1.0, '#f8fff8', '#3b393a'], ['3', 6.5, 0.7, '#b07c57', '#f8fff8']];
  for (const px of PODIUMS.xs) {
    k.at(px, PODIUMS.z, 0);
    bake(k, 'dn_podium');
    for (const [n, x, h, bg, fg] of medals) {
      const y0 = 0.31, y1 = h - 0.14 - 0.03, ph = Math.min(0.9, y1 - y0);          // y0 over the platform's gold lip (0.3)
      k.text(n, x, (y0 + y1) / 2, 2.012, 0, tw(n, ph), { fg, bg, back: false, off: 0.0 });
      k.solid(3, h / 2, 1.75, x, 0.25);
    }
    k.solid(9.6, 0.15, 2.575, 0, -0.075);                             // platform (19.2 m, under the outer steps; 15 cm behind the frame)
    k.solid(8.2, 3.1, 0.2, 0, -2.35);                                 // backdrop in its frame
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

// ---- infield parade ring and weighing room; picnic lawn on the east side ----
function paddock(k) {
  const { x: rx, z: rz, rx: a, rz: b } = RING;
  const g = new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2).scale(a - 0.6, 1, b - 0.6);
  k.add(g, T(SADDLE2), rx, 0.08, rz, { outline: 0 });                                                  // ring's tan bark
  // rail: ~5 m bays round the ellipse, leaving the east gate's opening (posts 1.8 m either side of the axis); the end bays finish
  // inside the gate posts so the rail runs into the gate
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
  const gx = rx + Math.cos(tg) * a;                                                                     // gate posts stand on the ellipse where the rail ends
  k.at(gx, rz, Math.PI / 2);
  bake(k, 'dn_ring_gate');
  k.at();
  for (const s of [-1, 1]) k.column(0.25, 2.5, gx, rz + s * 1.8);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {                                          // lamps round the outside
    const px2 = rx + lx * (a + 3) * 0.72, pz2 = rz + lz * (b + 3) * 0.72;
    lamp(k, px2, pz2, rx, rz);                                               // over the ring
    k.column(0.4, 6.5, px2, pz2);
  }
  // weighing room, porch toward the ring
  k.at(PAVILION.x, PAVILION.z, -Math.PI / 2);
  bake(k, 'dn_pavilion');
  k.text('WEIGHING ROOM', 0, 4.48, 3.27, 0, Math.min(8.6, tw('WEIGHING ROOM', 0.3)), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  k.solid(9.2, 2.5, 5.0, 0, -5);
  for (const x of [-8.4, -2.8, 2.8, 8.4]) k.column(0.3, 4.3, x, 2.8);
  k.at();
  // lawn: picnic tables under sunshades
  const SHADES = [PAL.barn, PAL.gold, PAL.money, PAL.saddle, PAL.barn, PAL.money];
  for (const [x, z, i] of LAWN.tables) {
    k.at(x, z, i * 1.1);
    bake(k, 'dn_picnic', 0, 0, 0, { over: { accent: SHADES[i % 6] } });
    k.at();
    k.solid(1.3, 0.5, 1.1, x, z, i * 1.1);
  }
}

// ---- fairground annex: fenced plaza gated toward the forecourt, ticket hall, wheel, carousel, two kiosks, queue posts ----
function annex(w, loc, k) {
  const A = ANNEX, zc = (A.z0 + A.z1) / 2, xc = (A.x0 + A.x1) / 2, [gx, gz] = A.gate;
  k.box(A.x1 - A.x0, 0.12, A.z1 - A.z0, T(PAL.money), xc, 0, zc, { outline: 0 });                      // plaza turf
  // paths: timber strips from the gate, a disc at each bend (angled square ends leave a notch of bare turf)
  const path = (a, b, wd = 5) => k.strip(a, b, wd, 0.14, T(SADDLE2), 0.0, { outline: 0 });
  const knee = ([x, z], wd = 5) => k.cyl(wd / 2, wd / 2, 0.14, 24, T(SADDLE2), x, 0, z, { outline: 0 });
  const fork = [A.wheel[0] - 18, A.wheel[1] - 14];
  path(A.gate, fork);
  path(A.gate, [A.carousel[0] + 2, A.carousel[1] + 10]);
  path(fork, [A.ticket[0] - 7, A.ticket[1] + 6]);                                                     // to the ticket hall's first window, clear of the kiosk at x 170
  knee(fork);
  // gate threshold: timber 2 cm over the paths, sides in the pillars' plinths; paths end on it
  k.box(6, 0.16, 9.6, T(SADDLE2), gx, 0, gz, { outline: 0 });
  // fence all round; on the west, two runs ending at the gate pillars' middles
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
  // ticket hall, front toward the plaza
  k.at(A.ticket[0], A.ticket[1], 0);
  bake(k, 'dn_ticket_hall');
  k.text('TICKETS', 0, 4.8, -7.38, 0, tw('TICKETS', 1.6), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  k.solid(11, 1.8, 4, 0, -4);
  k.at();
  // two free-standing kiosks (dn_kiosk), name on the board over the serving bay
  for (const [sx, sz, d] of A.kiosks) {
    k.at(sx, sz, 0);
    bake(k, 'dn_kiosk', 0, 0, 0, { over: { accent: d === 6 ? PAL.money : PAL.barn } });
    const nm = d === 6 ? 'SPACE SLUSH' : 'DERBY DONUTS';
    k.text(nm, 0, 3.325, 0.06, 0, tw(nm, 0.45), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    k.solid(2.5, 1.95, 1.8, 0, -1.7);
    k.at();
  }
  // queue posts: a rope snake before the wheel's boarding steps (clear of them and the fence), a line before the carousel
  queue(k, A.wheel[0] - 9, A.wheel[1] + 9.2, 4, 0.12);
  queue(k, A.wheel[0], A.wheel[1] + 10.7, 4, 0.12);
  queue(k, A.carousel[0] - 5, A.carousel[1] + 12, 3, 0.12);
  // rides: the wheel (plane along x) and the carousel
  ferrisWheel(w, loc, k, A.wheel[0], A.wheel[1]);
  carousel(w, loc, k, A.carousel[0], A.carousel[1]);
  // lamps
  for (const [lx, lz] of [[132, 112], [200, 112], [200, 162], [132, 162], [165, 140]]) {
    lamp(k, lx, lz, xc, zc); k.column(0.4, 6.5, lx, lz);                      // over the plaza
  }
  // path from the forecourt onto the gate's threshold
  path([70, 158], [100, 150], 4);
  path([100, 150], A.gate, 4);
  knee([100, 150], 4);
}

export function buildDowns(w, loc) {
  const vendors = [];
  const kit = settle(w, loc, 9091, (k) => {
    const as = (name, f) => { k.tag = name; f(); k.tag = ''; };      // dev audit names each triangle's builder (outpostModels.js Kit.tags)
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
  loc.walkBlocked = walkBlocker(kit.cols);                           // racegoers keep off the track and out of the solids (world.js updateFigures)
  // stall vendors behind their counters facing the walk (world.addFigures; `vendor` figures hold their post and gesture: world.updateFigures)
  if (w.addFigures && vendors.length) {
    let next = 0;
    w.addFigures(loc, vendors.length, {
      kind: 'worker',
      look: (i) => ({ look: i % 3 === 1 ? 'trader' : 'casual', suit: vendors[i].accent, scale: 1.3 }),     // taller than walkers, to clear the counter
      area: (out, f) => {
        const v = vendors[f.vi ??= next++];
        f.vendor = true; f.yaw = v.yaw;
        return out.set(v.x, 0.34, v.z);
      },
    });
  }
  return kit;
}
