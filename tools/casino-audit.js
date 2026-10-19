// Dev-only audit of the Lucky Crater Casino, run inside the page (the browser pane, devtools, or Playwright's evaluate). Not in the build.
// Load the game with the static merge off so every piece keeps its name (localStorage.setItem('mr-nomerge', '1'), reload), stand
// near the casino, then:
//   const A = await import('/tools/casino-audit.js');
//   A.zfight()       coplanar overlaps in different colours (they shimmer), largest first
//   A.floating()     pieces that touch nothing: no other piece's box within 2 cm and not on the floor
//   A.near(x, y, z)  what is there (which piece an unnamed finding is)
// Everything is in the casino frame (m: +x right, +z toward the doors, y up), over x +-75, z -55..125 (hall, forecourt, lot).
// tools/casino-zfight.mjs is the same z-fight test without the colour filter, for Playwright.

const BOX = { x0: -75, x1: 75, z0: -55, z1: 125, y0: -1, y1: 90 };

// every visible, non-outline mesh near the casino as { o, tag, color, M (to casino frame) }
function pieces() {
  const g = window.game, grp = g.world.casino.loc.group;
  g.scene.updateMatrixWorld(true);
  const inv = grp.matrixWorld.clone().invert(), out = [];
  g.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    for (let a = o; a; a = a.parent) if (a.visible === false) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat || mat.side === 1 || o.userData.isInk) return;   // outline shells draw back faces only
    if (mat.blending === 2) return;                           // additive light beams: not surfaces
    const M = inv.clone().multiply(o.matrixWorld);
    const names = []; for (let a = o; a && a !== g.scene && names.length < 3; a = a.parent) if (a.name) names.push(a.name);
    const color = mat.color ? mat.color.getHex() + (mat.map ? 0x2000000 : 0) + (mat.transparent ? 0x1000000 : 0) : -1;
    const w = o.getWorldPosition(window.game.camera.position.clone()).applyMatrix4(inv);   // unnamed pieces: where their origin is
    const where = `${o.geometry.type.replace('Geometry', '')} @(${w.x.toFixed(1)}, ${w.y.toFixed(1)}, ${w.z.toFixed(1)})`;
    out.push({ o, M, tag: (names.length ? names.join('<') + ' ' : '') + where + ' #' + (mat.color ? mat.color.getHexString() : '?') + (mat.map ? ' map' : '') + (mat.transparent ? ' (tr)' : ''), color });
  });
  return out;
}

// triangles of the pieces inside BOX, in the casino frame
function triangles(list) {
  const V = window.game.camera.position.constructor, a = new V(), b = new V(), c = new V(), tris = [];
  list.forEach((p, k) => {
    const g = p.o.geometry, pos = g.attributes.position, idx = g.index, col = g.attributes.color;
    if (p.o.isInstancedMesh) return;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(p.M); b.fromBufferAttribute(pos, i1).applyMatrix4(p.M); c.fromBufferAttribute(pos, i2).applyMatrix4(p.M);
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
      if (cx < BOX.x0 || cx > BOX.x1 || cz < BOX.z0 || cz > BOX.z1 || cy < BOX.y0 || cy > BOX.y1) continue;
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz);
      if (l < 2e-4) continue;
      nx /= l; ny /= l; nz /= l;
      if (ny < -0.9 && cy < 0.3) continue;                    // undersides of things on the floor are never seen
      const vc = col ? ((Math.round(col.getX(i0) * 255) << 16) | (Math.round(col.getY(i0) * 255) << 8) | Math.round(col.getZ(i0) * 255)) : -1;
      tris.push({ p: [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], n: [nx, ny, nz], d: nx * a.x + ny * a.y + nz * a.z, piece: k, color: vc >= 0 ? vc : p.color, at: [cx, cy, cz] });
    }
  });
  return tris;
}

const area2 = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; s += x1 * y2 - x2 * y1; } return s / 2; };
const clip = (subject, tri) => {
  let out = subject;
  for (let i = 0; i < 3 && out.length; i++) {
    const A = tri[i], B = tri[(i + 1) % 3], inp = out; out = [];
    const side = (P) => (B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]);
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
};

// Coplanar (within eps m), same-facing, overlapping triangles of different colours, from different pieces or within one piece
// (a merged kit model). Returns groups by piece pair and plane, largest first.
export function zfight({ eps = 0.002, min = 1e-4, top = 60 } = {}) {
  const list = pieces(), tris = triangles(list), bucket = new Map();
  // filed by plane: normal to 1/100, offset on two grids 1 cm apart (a pair within eps shares a cell in one; tested in the first only).
  // Lighter than kit.py audit_coplanar's 16 grids, for the 600k triangles round the casino; a turned pair across a normal cell edge
  // can still slip through.
  const combos = [[0, 0, 0, 0], [0, 0, 0, 0.5]];
  const cell = (t, c) => `${Math.round(t.n[0] * 100)},${Math.round(t.n[1] * 100)},${Math.round(t.n[2] * 100)},${Math.floor(t.d / 0.02 + c[3])}`;
  tris.forEach((t, i) => combos.forEach((c, ci) => { const k = ci + ':' + cell(t, c); (bucket.get(k) || bucket.set(k, []).get(k)).push(i); }));
  const found = new Map();
  const test = (i, j) => {
    const A = tris[i], B = tris[j];
    if (A.color === B.color) return;
    if (A.n[0] * B.n[0] + A.n[1] * B.n[1] + A.n[2] * B.n[2] < 0.9999) return;
    // gap measured at the faces, not at the origin (a small tilt 50 m out would hide or fake one)
    if (Math.abs(A.n[0] * B.at[0] + A.n[1] * B.at[1] + A.n[2] * B.at[2] - A.d) > eps || Math.abs(B.n[0] * A.at[0] + B.n[1] * A.at[1] + B.n[2] * A.at[2] - B.d) > eps) return;
    const ax = Math.abs(A.n[0]) > Math.abs(A.n[1]) && Math.abs(A.n[0]) > Math.abs(A.n[2]) ? 0 : Math.abs(A.n[1]) > Math.abs(A.n[2]) ? 1 : 2;
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const flat = (T) => [[T.p[u], T.p[v]], [T.p[3 + u], T.p[3 + v]], [T.p[6 + u], T.p[6 + v]]];
    let ta = flat(A), tb = flat(B);
    if (area2(ta) < 0) ta = [ta[0], ta[2], ta[1]];
    if (area2(tb) < 0) tb = [tb[0], tb[2], tb[1]];
    const ov = Math.abs(area2(clip(ta, tb)));
    if (ov < 1e-6) return;
    const k = Math.min(A.piece, B.piece) + ':' + Math.max(A.piece, B.piece) + ':' + Math.round(A.d * 20) + ':' + A.n.map((q) => Math.round(q * 10));
    const f = found.get(k) || { a: list[A.piece].tag, b: list[B.piece].tag, n: A.n.map((q) => +q.toFixed(2)), area: 0, at: A.at.map((q) => +q.toFixed(2)) };
    f.area += ov; found.set(k, f);
  };
  for (const [k, l] of bucket) {
    const ci = Number(k.slice(0, k.indexOf(':')));
    for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
      const A = tris[l[x]], B = tris[l[y]];
      if (A.color === B.color) continue;
      let first = true;
      for (let c = 0; c < ci && first; c++) if (cell(A, combos[c]) === cell(B, combos[c])) first = false;
      if (first) test(l[x], l[y]);
    }
  }
  // a pair buried inside a solid never shows: a ray from 1 cm in front crosses an odd number of faces within 4 m
  const hits = (o, d) => {
    let n = 0;
    for (const T of tris) {
      const p = T.p, e1x = p[3] - p[0], e1y = p[4] - p[1], e1z = p[5] - p[2], e2x = p[6] - p[0], e2y = p[7] - p[1], e2z = p[8] - p[2];
      const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x, det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-9) continue;
      const f = 1 / det, sx = o[0] - p[0], sy = o[1] - p[1], sz = o[2] - p[2], u = f * (sx * hx + sy * hy + sz * hz);
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
      if (v < 0 || u + v > 1) continue;
      const t = f * (e2x * qx + e2y * qy + e2z * qz);
      if (t > 1e-4 && t < 4) n++;
    }
    return n;
  };
  const out = [...found.values()].filter((f) => f.area >= min).sort((p, q) => q.area - p.area);
  for (const f of out.slice(0, top)) {
    const n = f.n, o = [f.at[0] + n[0] * 0.01, f.at[1] + n[1] * 0.01, f.at[2] + n[2] * 0.01];
    f.buried = hits(o, n) % 2 === 1;
  }
  return { tris: tris.length, pieces: list.length, pairs: out.length, list: out.slice(0, top).filter((f) => !f.buried) };
}

// Pieces whose box (grown by `gap` m) meets no other piece's box and that do not stand on the floor (y under `floor`): a sign
// hung on nothing, a finial over a post, a lamp beside its arm. Box overlap is generous, so this finds the clear cases only.
export function floating({ gap = 0.02, floor = 0.05, minSize = 0.02 } = {}) {
  const list = pieces(), V = window.game.camera.position.constructor, v = new V(), boxes = [];
  list.forEach((p, k) => {
    const pos = p.o.geometry.attributes.position;
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    if (p.o.isInstancedMesh) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(p.M);
      b[0] = Math.min(b[0], v.x); b[1] = Math.min(b[1], v.y); b[2] = Math.min(b[2], v.z); b[3] = Math.max(b[3], v.x); b[4] = Math.max(b[4], v.y); b[5] = Math.max(b[5], v.z);
    }
    const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2;
    if (cx < BOX.x0 || cx > BOX.x1 || cz < BOX.z0 || cz > BOX.z1) return;
    if (Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) < minSize) return;
    boxes.push({ k, b });
  });
  const touch = (A, B) => A[0] - gap <= B[3] && B[0] - gap <= A[3] && A[1] - gap <= B[4] && B[1] - gap <= A[4] && A[2] - gap <= B[5] && B[2] - gap <= A[5];
  const out = [];
  for (const A of boxes) {
    if (A.b[1] < floor) continue;
    if (boxes.some((B) => B !== A && touch(A.b, B.b))) continue;
    out.push({ tag: list[A.k].tag, at: [(A.b[0] + A.b[3]) / 2, A.b[1], (A.b[2] + A.b[5]) / 2].map((q) => +q.toFixed(2)), size: [A.b[3] - A.b[0], A.b[4] - A.b[1], A.b[5] - A.b[2]].map((q) => +q.toFixed(2)) });
  }
  return out;
}

// Pieces with a vertex within r m of (x, y, z) in the casino frame, with their box: to tell which code built an unnamed piece.
export function near(x, y, z, r = 0.5) {
  const v = window.game.camera.position.clone(), out = [];
  for (const p of pieces()) {
    const pos = p.o.geometry.attributes.position;
    let best = 1e9;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(p.M); best = Math.min(best, Math.hypot(v.x - x, v.y - y, v.z - z)); }
    if (best > r) continue;
    p.o.geometry.computeBoundingBox();
    const b = p.o.geometry.boundingBox.clone().applyMatrix4(p.M);
    out.push(`${best.toFixed(2)} m  ${p.tag}  box (${b.min.x.toFixed(2)}, ${b.min.y.toFixed(2)}, ${b.min.z.toFixed(2)})..(${b.max.x.toFixed(2)}, ${b.max.y.toFixed(2)}, ${b.max.z.toFixed(2)})`);
  }
  return out.sort();
}
