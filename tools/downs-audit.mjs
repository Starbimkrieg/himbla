// Dev-only audit of Chimera Downs' build (docs/downs-layouts.md, "Audit"). Not part of the build.
//   npx vite --port 5199 --host 127.0.0.1                       (in one shell)
//   node tools/downs-audit.mjs [zfight|colliders|text|gaps|all]  (Playwright from PLAYWRIGHT, default /opt/node-tools/node_modules/playwright/index.mjs; the game from GAME_URL)
//   SEP=0.0008: plane distance under which two surfaces count as one (zfight). Under 1 mm is safe only on the reversed-Z depth buffer (main.js); 2 cm is safe on any.
// All checks run in the place's FLAT design frame (its builders' frame; src/curve.js bends it onto the Moon), with the static merge off (localStorage mr-nomerge)
// and kit dev tags on (globalThis.__kitTags: outpostModels.js Kit.tags), so findings name the builder and Blender part.
//   zfight     triangle pairs on one plane (within SEP), facing the same way, overlapping, in different colours: they shimmer. Listed by builder > part.
//   colliders  collider footprints inside each other (a mast through a stable, a column through a wall): over 25 cm deep with 0.5 m of shared height.
//   text       every text plane (signs, numbers, name boards) needs a wall within 1.5 m behind and 1.5 m clear in front: none faces a wall or hangs in air.
//   gaps       bare-ground strips under 0.7 m wide between ground slabs, or between a slab and a wall's foot: a terrain seam showing.
// Blender side: build_downs_*.py run audit_coplanar (z-fight within a model) and audit_flips (inside-out primitives) on every build.
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const MODE = process.argv[2] || 'all';
const SEP = Number(process.env.SEP || 0.0008);
const run = (m) => MODE === 'all' || MODE === m;

const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 640, height: 360 } });
pg.setDefaultTimeout(900000);
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { window.__kitTags = true; try { localStorage.setItem('mr-nomerge', '1'); } catch (e) { /* unavailable */ } });
await pg.goto(process.env.GAME_URL || 'http://127.0.0.1:5199/', { waitUntil: 'load' });
await pg.waitForFunction('window.game && window.game.world', null, { timeout: 180000 });
await pg.keyboard.press('Enter'); await pg.waitForTimeout(4000);
for (let i = 0; i < 14; i++) { let st = null; try { st = await pg.evaluate('window.game.state'); } catch (e) { await pg.waitForTimeout(2500); continue; } if (st === 'play') break; await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); }
await pg.waitForTimeout(3000);

// The Downs' triangles in its flat frame: { P: [x,y,z ×3 per triangle], C: per-triangle colour (vertex or material), T: tag id, text: [text plane triangles] }
await pg.evaluate(async () => {
  const { unbendPoint } = await import('/src/curve.js');
  const g = window.game, loc = g.locations.find((l) => l.id === 'downs'), R = g.world.curveR(loc);
  const M4 = g.camera.matrixWorld.constructor, V3 = g.camera.position.constructor;
  loc.group.updateMatrixWorld(true);
  const inv = new M4().copy(loc.group.matrixWorld).invert(), M = new M4(), v = new V3();
  const S = { P: [], C: [], T: [], text: [], names: window.__kitTagNames || [] };
  loc.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.isInk || o.visible === false) return;
    for (let a = o; a && a !== loc.group; a = a.parent) if (a.userData && (a.userData.tick || a.userData.spin)) return;
    const geo = o.geometry, pos = geo.attributes.position, col = geo.attributes.color, tg = geo.attributes.tag, idx = geo.index, m = o.material;
    if (!pos) return;
    o.updateWorldMatrix(true, false); M.multiplyMatrices(inv, o.matrixWorld);
    const V = [], vc = [], vt = [];
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(M); if (R) unbendPoint(R, v.x, v.y, v.z, v);
      V.push([v.x, v.y, v.z]);
      vc.push(col ? ((Math.round(col.getX(i) * 255) << 16) | (Math.round(col.getY(i) * 255) << 8) | Math.round(col.getZ(i) * 255)) : (m && m.color ? m.color.getHex() : 0) + (m && m.transparent ? 0x1000000 : 0));
      vt.push(tg ? Math.round(tg.getX(i)) : -1);
    }
    const n = idx ? idx.count : pos.count;
    const tri = (t) => [idx ? idx.getX(t) : t, idx ? idx.getX(t + 1) : t + 1, idx ? idx.getX(t + 2) : t + 2];
    if (m && m.userData && m.userData.aspect) { const tr = []; for (let t = 0; t < n; t += 3) tr.push(tri(t).map((i) => V[i])); S.text.push(tr); return; }
    if (m && m.transparent) return;
    for (let t = 0; t < n; t += 3) { const [a, b2, c] = tri(t); S.P.push(...V[a], ...V[b2], ...V[c]); S.C.push(vc[a]); S.T.push(vt[a]); }
  });
  window.__downs = S;
});

if (run('zfight')) {
  const res = await pg.evaluate((SEP) => {
    const { P, C, T, names } = window.__downs, N = C.length;
    const nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N), dd = new Float32Array(N), ar = new Float32Array(N), cen = new Float32Array(N * 3), ok = new Uint8Array(N), bb = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const p = i * 9, ux = P[p + 3] - P[p], uy = P[p + 4] - P[p + 1], uz = P[p + 5] - P[p + 2], wx = P[p + 6] - P[p], wy = P[p + 7] - P[p + 1], wz = P[p + 8] - P[p + 2];
      let X = uy * wz - uz * wy, Y = uz * wx - ux * wz, Z = ux * wy - uy * wx; const l = Math.hypot(X, Y, Z); if (l < 1e-5) continue;
      ar[i] = l / 2; X /= l; Y /= l; Z /= l; nx[i] = X; ny[i] = Y; nz[i] = Z; dd[i] = X * P[p] + Y * P[p + 1] + Z * P[p + 2];
      for (let c = 0; c < 3; c++) { bb[6 * i + c] = Math.min(P[p + c], P[p + 3 + c], P[p + 6 + c]); bb[6 * i + 3 + c] = Math.max(P[p + c], P[p + 3 + c], P[p + 6 + c]); }
      cen[3 * i] = (P[p] + P[p + 3] + P[p + 6]) / 3; cen[3 * i + 1] = (P[p + 1] + P[p + 4] + P[p + 7]) / 3; cen[3 * i + 2] = (P[p + 2] + P[p + 5] + P[p + 8]) / 3; ok[i] = 1;
    }
    const CELL = 12, bucket = new Map();
    const nk = (i) => ((Math.round(nx[i] * 100) + 101) * 203 + (Math.round(ny[i] * 100) + 101)) * 203 + Math.round(nz[i] * 100) + 101;
    const key = (k, ob, cx, cy, cz) => ((((k * 4096 + ob + 2048) * 128 + cx + 64) * 128 + cy + 64) * 128 + cz + 64);
    const grids = (i) => [Math.floor(dd[i] / SEP), Math.floor(dd[i] / SEP + 0.5) + 1000];   // (two grids half a step apart: a pair under SEP shares a cell in one)
    for (let i = 0; i < N; i++) {
      if (!ok[i]) continue;
      const k = nk(i), cx = Math.floor(cen[3 * i] / CELL), cy = Math.floor(cen[3 * i + 1] / CELL), cz = Math.floor(cen[3 * i + 2] / CELL);
      for (const ob of grids(i)) { const kk = key(k, ob % 4000, cx, cy, cz); let a = bucket.get(kk); if (!a) bucket.set(kk, (a = [])); a.push(i); }
    }
    const inside = (i, qx, qy, qz) => {
      const p = i * 9, ax = P[p], ay = P[p + 1], az = P[p + 2], e1x = P[p + 3] - ax, e1y = P[p + 4] - ay, e1z = P[p + 5] - az, e2x = P[p + 6] - ax, e2y = P[p + 7] - ay, e2z = P[p + 8] - az, px = qx - ax, py = qy - ay, pz = qz - az;
      const d11 = e1x * e1x + e1y * e1y + e1z * e1z, d12 = e1x * e2x + e1y * e2y + e1z * e2z, d22 = e2x * e2x + e2y * e2y + e2z * e2z, dp1 = px * e1x + py * e1y + pz * e1z, dp2 = px * e2x + py * e2y + pz * e2z;
      const den = d11 * d22 - d12 * d12; if (Math.abs(den) < 1e-12) return false;
      const u = (d22 * dp1 - d12 * dp2) / den, w = (d11 * dp2 - d12 * dp1) / den;
      return u > 1e-3 && w > 1e-3 && u + w < 1 - 1e-3;
    };
    const samples = (i) => { const p = i * 9, c = [cen[3 * i], cen[3 * i + 1], cen[3 * i + 2]], out = [c]; for (let k = 0; k < 3; k++) out.push([(c[0] + P[p + 3 * k]) / 2, (c[1] + P[p + 3 * k + 1]) / 2, (c[2] + P[p + 3 * k + 2]) / 2]); return out; };
    const overlaps = (i, j) => { for (const s of samples(i)) if (inside(j, ...s)) return true; for (const s of samples(j)) if (inside(i, ...s)) return true; return false; };
    const seen = new Set(), found = [];
    const test = (i, j) => {
      if (i === j || C[i] === C[j]) return;
      if (bb[6 * i] > bb[6 * j + 3] || bb[6 * j] > bb[6 * i + 3] || bb[6 * i + 1] > bb[6 * j + 4] + SEP || bb[6 * j + 1] > bb[6 * i + 4] + SEP || bb[6 * i + 2] > bb[6 * j + 5] || bb[6 * j + 2] > bb[6 * i + 5]) return;   // (boxes apart)
      if (nx[i] * nx[j] + ny[i] * ny[j] + nz[i] * nz[j] < 0.9995) return;
      const sep = Math.abs(nx[i] * (cen[3 * j] - cen[3 * i]) + ny[i] * (cen[3 * j + 1] - cen[3 * i + 1]) + nz[i] * (cen[3 * j + 2] - cen[3 * i + 2]));
      if (sep > SEP) return;
      const pk = Math.min(i, j) * 4194304 + Math.max(i, j); if (seen.has(pk)) return;
      if (overlaps(i, j)) { seen.add(pk); found.push({ i, j, sep }); }      // (remember overlapping pairs only: the two grids and neighbour cells test a pair more than once)
    };
    for (const list of bucket.values()) for (let a = 0; a < list.length; a++) for (let c = a + 1; c < list.length; c++) test(list[a], list[c]);
    const fwd = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x > 0 || (x === 0 && y > 0) || (x === 0 && y === 0 && z > 0)) fwd.push([x, y, z]);
    for (let i = 0; i < N; i++) {
      if (!ok[i]) continue;
      const k = nk(i), cx = Math.floor(cen[3 * i] / CELL), cy = Math.floor(cen[3 * i + 1] / CELL), cz = Math.floor(cen[3 * i + 2] / CELL);
      for (const ob of grids(i)) for (const [x, y, z] of fwd) for (const s of [1, -1]) { const l = bucket.get(key(k, ob % 4000, cx + s * x, cy + s * y, cz + s * z)); if (l) for (const j of l) test(i, j); }
    }
    const groups = new Map();
    for (const { i, j, sep } of found) {
      const a = [names[T[i]] || '?', names[T[j]] || '?'].sort(), ax = Math.abs(ny[i]) > 0.9 ? 'up/down' : Math.abs(nx[i]) > 0.9 ? 'x wall' : Math.abs(nz[i]) > 0.9 ? 'z wall' : 'slope', k = `${a.join('  X  ')}  [${ax}, ${C[i].toString(16)} / ${C[j].toString(16)}]`;
      const gr = groups.get(k) || { k, n: 0, area: 0, sep: 1, at: [cen[3 * i], cen[3 * i + 1], cen[3 * i + 2]] };
      gr.n++; gr.area += Math.min(ar[i], ar[j]); gr.sep = Math.min(gr.sep, sep); groups.set(k, gr);
    }
    return { tris: N, pairs: found.length, groups: [...groups.values()].sort((a, b2) => b2.area - a.area).slice(0, 30) };
  }, SEP);
  console.log(`zfight: ${res.tris} triangles, ${res.pairs} overlapping coplanar pairs of different colours within ${SEP * 1000} mm`);
  for (const g of res.groups) console.log(`  ${g.area.toFixed(2).padStart(7)} m2  ${String(g.n).padStart(5)} tris  ${g.k}   e.g. (${g.at.map((q) => q.toFixed(1)).join(', ')})`);
}

if (run('colliders')) {
  const res = await pg.evaluate(() => {
    const loc = window.game.locations.find((l) => l.id === 'downs'), cols = loc._kitCols || [];
    const rect = (c, hx, hz, hy) => { const s = Math.sin(c.yaw || 0), k = Math.cos(c.yaw || 0); return { P: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c.x + a * hx * k + b * hz * s, c.z - a * hx * s + b * hz * k]), y0: c.y - hy, y1: c.y + hy }; };
    const poly = (c) => {
      if (c.type === 'box') return rect(c, c.hx, c.hz, c.hy);
      if (c.type === 'cyl') return { P: Array.from({ length: 12 }, (_, i) => [c.x + Math.cos(i / 12 * 2 * Math.PI) * c.r, c.z + Math.sin(i / 12 * 2 * Math.PI) * c.r]), y0: c.y0 ?? 0, y1: c.y1 };
      if (c.type === 'hcyl') return rect(c, c.r, c.len / 2, c.r);
      return null;
    };
    const items = cols.map((c) => ({ c, g: poly(c) })).filter((o) => o.g);
    const axes = (P) => P.map((p, i) => { const q = P[(i + 1) % P.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; });
    const proj = (P, a) => { let lo = 1e9, hi = -1e9; for (const p of P) { const v = p[0] * a[0] + p[1] * a[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };
    const depth = (A, B) => { let best = 1e9; for (const a of [...axes(A), ...axes(B)]) { const [a0, a1] = proj(A, a), [b0, b1] = proj(B, a), o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return 0; best = Math.min(best, o); } return best; };
    const out = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i].g, B = items[j].g;
      if (Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) < 0.5) continue;
      const d = depth(A.P, B.P); if (d < 0.25) continue;
      const a = items[i].c, c2 = items[j].c;
      out.push(`${d.toFixed(2)} m  ${a.tag}:${a.type}(${a.x.toFixed(0)}, ${a.z.toFixed(0)})  X  ${c2.tag}:${c2.type}(${c2.x.toFixed(0)}, ${c2.z.toFixed(0)})`);
    }
    return { n: cols.length, out };
  });
  console.log(`colliders: ${res.n}, ${res.out.length} footprint overlaps over 25 cm (a builder's own nested colliders show too: read the pairs)`);
  for (const o of res.out) console.log('  ' + o);
}

if (run('text')) {
  const res = await pg.evaluate(() => {
    const { P, text } = window.__downs, N = P.length / 9;
    const hit = (o, d, max) => {
      let best = 1e9;
      for (let t = 0; t < N; t++) {
        const p = t * 9, e1x = P[p + 3] - P[p], e1y = P[p + 4] - P[p + 1], e1z = P[p + 5] - P[p + 2], e2x = P[p + 6] - P[p], e2y = P[p + 7] - P[p + 1], e2z = P[p + 8] - P[p + 2];
        const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue;
        const iv = 1 / det, tx = o[0] - P[p], ty = o[1] - P[p + 1], tz = o[2] - P[p + 2], u = (tx * px + ty * py + tz * pz) * iv; if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, w = (d[0] * qx + d[1] * qy + d[2] * qz) * iv; if (w < 0 || u + w > 1) continue;
        const s = (e2x * qx + e2y * qy + e2z * qz) * iv; if (s > 0 && s < best && s < max) best = s;
      }
      return best < 1e8 ? best : null;
    };
    return text.map((tr) => {
      const [a, b2, c] = tr[0], ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      let cx = 0, cy = 0, cz = 0, k = 0; for (const t of tr) for (const q of t) { cx += q[0]; cy += q[1]; cz += q[2]; k++; } cx /= k; cy /= k; cz /= k;
      const front = hit([cx + nx * 0.02, cy + ny * 0.02, cz + nz * 0.02], [nx, ny, nz], 1.5), back = hit([cx - nx * 0.02, cy - ny * 0.02, cz - nz * 0.02], [-nx, -ny, -nz], 1.5);
      return { at: [cx, cy, cz].map((q) => +q.toFixed(1)), n: [nx, ny, nz].map((q) => +q.toFixed(2)), front, back };
    });
  });
  const bad = res.filter((t) => t.front !== null || t.back === null);
  console.log(`text: ${res.length} planes, ${bad.length} to check (something within 1.5 m in front, or nothing behind)`);
  for (const t of bad) console.log(`  at (${t.at.join(', ')}) facing (${t.n.join(', ')})  in front: ${t.front === null ? 'clear' : t.front.toFixed(2) + ' m'}  behind: ${t.back === null ? 'NOTHING' : t.back.toFixed(2) + ' m'}`);
}

if (run('gaps')) {
  const res = await pg.evaluate(() => {
    const { P } = window.__downs, N = P.length / 9;
    const X0 = -290, Z0 = -160, S = 0.1, NX = 5800, NZ = 4000, grid = new Uint8Array(NX * NZ);
    const mark = (x, z) => { const i = Math.floor((x - X0) / S), j = Math.floor((z - Z0) / S); if (i >= 0 && i < NX && j >= 0 && j < NZ && !grid[j * NX + i]) grid[j * NX + i] = 2; };
    const line = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (S * 0.5))); for (let k = 0; k <= n; k++) mark(ax + (bx - ax) * k / n, az + (bz - az) * k / n); };
    const fill = (a, b2, c) => {
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b2[0], c[0]) - X0) / S)), i1 = Math.min(NX - 1, Math.floor((Math.max(a[0], b2[0], c[0]) - X0) / S)), j0 = Math.max(0, Math.floor((Math.min(a[2], b2[2], c[2]) - Z0) / S)), j1 = Math.min(NZ - 1, Math.floor((Math.max(a[2], b2[2], c[2]) - Z0) / S));
      const d = (b2[2] - c[2]) * (a[0] - c[0]) + (c[0] - b2[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-9) return;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = X0 + (i + 0.5) * S, z = Z0 + (j + 0.5) * S, l1 = ((b2[2] - c[2]) * (x - c[0]) + (c[0] - b2[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
        if (l1 >= -0.02 && l2 >= -0.02 && 1 - l1 - l2 >= -0.02) grid[j * NX + i] = 1;
      }
    };
    for (let t = 0; t < N; t++) {
      const p = t * 9, a = [P[p], P[p + 1], P[p + 2]], b2 = [P[p + 3], P[p + 4], P[p + 5]], c = [P[p + 6], P[p + 7], P[p + 8]];
      if (Math.min(a[1], b2[1], c[1]) > 0.45) continue;
      const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
      if (Math.abs(ny) / l > 0.3) fill(a, b2, c); else { line(a[0], a[2], b2[0], b2[2]); line(b2[0], b2[2], c[0], c[2]); line(c[0], c[2], a[0], a[2]); }   // (floor or roof footprint / wall foot)
    }
    const sl = new Uint8Array(NX * NZ);
    for (let j = 0; j < NZ; j++) { let i = 0; while (i < NX) { if (grid[j * NX + i]) { i++; continue; } let e = i; while (e < NX && !grid[j * NX + e]) e++; if (i > 0 && e < NX && e - i <= 7 && !(grid[j * NX + i - 1] === 2 && grid[j * NX + e] === 2)) for (let k = i; k < e; k++) sl[j * NX + k] = 1; i = e; } }
    for (let i = 0; i < NX; i++) { let j = 0; while (j < NZ) { if (grid[j * NX + i]) { j++; continue; } let e = j; while (e < NZ && !grid[e * NX + i]) e++; if (j > 0 && e < NZ && e - j <= 7 && !(grid[(j - 1) * NX + i] === 2 && grid[e * NX + i] === 2)) for (let k = j; k < e; k++) sl[k * NX + i] = 1; j = e; } }
    const seen = new Uint8Array(NX * NZ), out = [];
    for (let s = 0; s < NX * NZ; s++) {
      if (!sl[s] || seen[s]) continue;
      const st = [s]; seen[s] = 1; let n = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      while (st.length) { const c = st.pop(); n++; const j = Math.floor(c / NX), i = c % NX; x0 = Math.min(x0, i); x1 = Math.max(x1, i); z0 = Math.min(z0, j); z1 = Math.max(z1, j);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue; const q = nj * NX + ni; if (sl[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
      const len = Math.max(x1 - x0, z1 - z0) * S;
      if (len >= 1.5) out.push({ len: +len.toFixed(1), x: [+(X0 + x0 * S).toFixed(1), +(X0 + x1 * S).toFixed(1)], z: [+(Z0 + z0 * S).toFixed(1), +(Z0 + z1 * S).toFixed(1)] });
    }
    return out.sort((a, b2) => b2.len - a.len).slice(0, 40);
  });
  console.log(`gaps: ${res.length} strips of bare ground under 0.7 m wide and over 1.5 m long (a hidden strip under a wall's thickness can show: look at the spot)`);
  for (const r of res) console.log(`  ${String(r.len).padStart(6)} m  x ${r.x[0]}..${r.x[1]}  z ${r.z[0]}..${r.z[1]}`);
}

console.log(errs.slice(0, 5).join('\n') || 'no page errors');
await b.close();
