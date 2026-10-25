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
//   coverage   solid surfaces nothing collides with (you'd run, fall or fly through them): points sampled over every opaque surface
//              from 0.3 m up, each tested against the game's live colliders (world space, the physics' own contact test, 0.35 m
//              tolerance). Listed by builder > part with the bare area and where it is (flat frame). Not in `all` (slow): name it.
//   blocked    ground a walker could cross before the Blender parts' own colliders (downs_common.py Acc, `auto` in the kit's
//              colliders) and now can't: walkBlocker (downsPlan.js) with and without them on a 0.5 m grid, by builder > part.
//              Read each: a bench or a stall counter should block; a doorway, an arch or a passage shouldn't.
//   floating   the reverse of coverage: the standable top of each of those colliders sampled every 0.5 m, and any spot with no
//              drawn surface within 0.3 m listed by builder > part (you'd stand on air there).
// Blender side: build_downs_*.py run audit_coplanar (z-fight within a model) and audit_flips (inside-out primitives) on every build.
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const MODE = process.argv[2] || 'all';
const SEP = Number(process.env.SEP || 0.0008);
const run = (m) => (MODE === 'all' && !['coverage', 'blocked', 'floating'].includes(m)) || MODE === m;

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
    const poly = (c) => {
      if (c.type === 'box') { const s = Math.sin(c.yaw || 0), k = Math.cos(c.yaw || 0); return { P: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c.x + a * c.hx * k + b * c.hz * s, c.z - a * c.hx * s + b * c.hz * k]), y0: c.y - c.hy, y1: c.y + c.hy }; }
      if (c.type === 'cyl') return { P: Array.from({ length: 12 }, (_, i) => [c.x + Math.cos(i / 12 * 2 * Math.PI) * c.r, c.z + Math.sin(i / 12 * 2 * Math.PI) * c.r]), y0: c.y0 ?? 0, y1: c.y1 };
      if (c.type === 'hcyl') { const s = Math.sin(c.yaw || 0), k = Math.cos(c.yaw || 0); return { P: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c.x + a * c.r * k + b * c.len / 2 * s, c.z - a * c.r * s + b * c.len / 2 * k]), y0: c.y - c.r, y1: c.y + c.r }; }
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

if (run('blocked')) {
  const res = await pg.evaluate(async () => {
    const { walkBlocker } = await import('/src/downsPlan.js');
    const loc = window.game.locations.find((l) => l.id === 'downs'), cols = loc._kitCols || [];
    const before = walkBlocker(cols.filter((c) => !c.auto), 0.2), after = walkBlocker(cols, 0.2);
    const autos = cols.filter((c) => c.auto && c.y - c.hy <= 1.5 && c.y + c.hy >= 0.4);
    const by = new Map();
    for (let x = -260; x <= 260; x += 0.5) for (let z = -200; z <= 220; z += 0.5) {
      if (before(x, z) || !after(x, z)) continue;
      // whose: the first walk-height auto box over the spot
      const c = autos.find((o) => { const cs = Math.cos(o.yaw || 0), sn = Math.sin(o.yaw || 0), dx = x - o.x, dz = z - o.z; return Math.abs(dx * cs - dz * sn) <= o.hx + 0.2 && Math.abs(dx * sn + dz * cs) <= o.hz + 0.2; });
      const key = c ? c.tag : '(cylinder)';
      let e = by.get(key);
      if (!e) by.set(key, (e = { n: 0, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }));
      e.n++; e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z);
    }
    return { n: cols.filter((c) => c.auto).length, out: [...by].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => `${(e.n * 0.25).toFixed(1).padStart(8)} m2  ${k}   x ${e.x0}..${e.x1}  z ${e.z0}..${e.z1}`) };
  });
  console.log(`blocked: ${res.n} colliders from the parts' geometry; ground they newly block (walk height, 0.2 m pad), by builder > part:`);
  for (const o of res.out) console.log('  ' + o);
}

if (run('floating')) {
  const res = await pg.evaluate(() => {
    const { P } = window.__downs, N = P.length / 9, loc = window.game.locations.find((l) => l.id === 'downs'), cols = (loc._kitCols || []).filter((c) => c.auto && c.type === 'box');
    // triangles by the 2 m (x, z) cells their footprint touches
    const C = 2, grid = new Map(), k2 = (i, j) => i * 100003 + j;
    for (let t = 0; t < N; t++) {
      const p = t * 9, x0 = Math.min(P[p], P[p + 3], P[p + 6]), x1 = Math.max(P[p], P[p + 3], P[p + 6]), z0 = Math.min(P[p + 2], P[p + 5], P[p + 8]), z1 = Math.max(P[p + 2], P[p + 5], P[p + 8]);
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const k = k2(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(t); }
    }
    // distance from (x, y, z) to triangle t (closest point on a triangle, Ericson)
    const dist = (t, x, y, z) => {
      const p = t * 9, ax = P[p], ay = P[p + 1], az = P[p + 2], bx = P[p + 3] - ax, by = P[p + 4] - ay, bz = P[p + 5] - az, cx = P[p + 6] - ax, cy = P[p + 7] - ay, cz = P[p + 8] - az;
      const px = x - ax, py = y - ay, pz = z - az;
      const d1 = bx * px + by * py + bz * pz, d2 = cx * px + cy * py + cz * pz;
      let u, v;
      if (d1 <= 0 && d2 <= 0) { u = 0; v = 0; } else {
        const bp = [px - bx, py - by, pz - bz], d3 = bx * bp[0] + by * bp[1] + bz * bp[2], d4 = cx * bp[0] + cy * bp[1] + cz * bp[2];
        const cp = [px - cx, py - cy, pz - cz], d5 = bx * cp[0] + by * cp[1] + bz * cp[2], d6 = cx * cp[0] + cy * cp[1] + cz * cp[2];
        const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
        if (d3 >= 0 && d4 <= d3) { u = 1; v = 0; } else if (d6 >= 0 && d5 <= d6) { u = 0; v = 1; }
        else if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); v = 0; }
        else if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; v = d2 / (d2 - d6); }
        else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 1 - w; v = w; }
        else { const den = 1 / (va + vb + vc); u = vb * den; v = vc * den; }
      }
      const qx = bx * u + cx * v - px, qy = by * u + cy * v - py, qz = bz * u + cz * v - pz;
      return Math.sqrt(qx * qx + qy * qy + qz * qz);
    };
    const near = (x, y, z) => { let best = 1e9; for (let i = Math.floor(x / C) - 1; i <= Math.floor(x / C) + 1; i++) for (let j = Math.floor(z / C) - 1; j <= Math.floor(z / C) + 1; j++) for (const t of grid.get(k2(i, j)) || []) { best = Math.min(best, dist(t, x, y, z)); if (best < 0.3) return best; } return best; };
    const E = window.game.camera.rotation.constructor, Q = window.game.camera.quaternion.constructor, V = window.game.camera.position.constructor;
    const by = new Map(); let total = 0;
    for (const c of cols) {
      const q = new Q().setFromEuler(new E(c.pitch || 0, c.yaw || 0, c.roll || 0, 'YXZ'));
      const ax = new V(1, 0, 0).applyQuaternion(q), ay = new V(0, 1, 0).applyQuaternion(q), az = new V(0, 0, 1).applyQuaternion(q);
      // the face whose normal is most upward
      const faces = [[ay, c.hy, ax, c.hx, az, c.hz], [ax, c.hx, ay, c.hy, az, c.hz], [az, c.hz, ax, c.hx, ay, c.hy]].flatMap(([n, h, u, hu, w, hw]) => [[n, h, u, hu, w, hw, 1], [n, h, u, hu, w, hw, -1]]);
      const [n, h, u, hu, w, hw, s] = faces.sort((a, b) => b[0].y * b[6] - a[0].y * a[6])[0];
      if (n.y * s < 0.5) continue;
      const nu = Math.max(1, Math.round(hu * 2 / 0.5)), nw = Math.max(1, Math.round(hw * 2 / 0.5)), cell = (hu * 2 / nu) * (hw * 2 / nw);
      for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) {
        const a = -hu + (2 * hu * (i + 0.5)) / nu, b = -hw + (2 * hw * (j + 0.5)) / nw;
        const x = c.x + n.x * h * s + u.x * a + w.x * b, y = c.y + n.y * h * s + u.y * a + w.y * b, z = c.z + n.z * h * s + u.z * a + w.z * b;
        total += cell;
        if (near(x, y, z) < 0.3) continue;
        let e = by.get(c.tag);
        if (!e) by.set(c.tag, (e = { area: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 }));
        e.area += cell; e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z);
      }
    }
    return { total, out: [...by].sort((a, b) => b[1].area - a[1].area).map(([k, e]) => `${e.area.toFixed(1).padStart(8)} m2  ${k}   x ${e.x0.toFixed(1)}..${e.x1.toFixed(1)}  y ${e.y0.toFixed(1)}..${e.y1.toFixed(1)}  z ${e.z0.toFixed(1)}..${e.z1.toFixed(1)}`) };
  });
  console.log(`floating: of ${res.total.toFixed(0)} m2 of standable collider tops (the parts' own), spots with nothing drawn within 0.3 m, by builder > part:`);
  for (const o of res.out.slice(0, 40)) console.log('  ' + o);
}

if (run('coverage')) {
  const res = await pg.evaluate(async () => {
    const { unbendPoint } = await import('/src/curve.js');
    const g = window.game, loc = g.locations.find((l) => l.id === 'downs'), R = g.world.curveR(loc), names = window.__kitTagNames || [];
    const M4 = g.camera.matrixWorld.constructor, V3 = g.camera.position.constructor;
    // stand the runner in the Downs so everything near is built and its colliders are live
    g.player.body.pos.copy(loc.dir).multiplyScalar(g.planet.surface(loc.dir) + 2);
    loc.group.updateMatrixWorld(true);
    const inv = new M4().copy(loc.group.matrixWorld).invert(), M = new M4();
    const cols = g.colliders, near = [], n = new V3(), w = [new V3(), new V3(), new V3()], f = [new V3(), new V3(), new V3()], p = new V3(), q = new V3();
    const covered = (pt) => { for (const c of cols.query(pt, 1.5, near)) if (cols.contact(c, pt, 0.35, n) > 0) return true; return false; };
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const by = new Map(), totBy = {}; let tot = 0, bare = 0;
    loc.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.isInk || o.visible === false) return;
      for (let a = o; a && a !== loc.group; a = a.parent) if (a.userData && (a.userData.tick || a.userData.spin)) return;
      const m = o.material;
      if (!m || m.transparent || (m.userData && m.userData.aspect)) return;
      const geo = o.geometry, pos = geo.attributes.position, tg = geo.attributes.tag, idx = geo.index;
      if (!pos) return;
      o.updateWorldMatrix(true, false); M.multiplyMatrices(inv, o.matrixWorld);
      const N = idx ? idx.count : pos.count;
      for (let t = 0; t < N; t += 3) {
        const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
        for (let k = 0; k < 3; k++) { w[k].set(pos.getX(ii[k]), pos.getY(ii[k]), pos.getZ(ii[k])); f[k].copy(w[k]).applyMatrix4(M); if (R) unbendPoint(R, f[k].x, f[k].y, f[k].z, f[k]); w[k].applyMatrix4(o.matrixWorld); }
        if (Math.max(f[0].y, f[1].y, f[2].y) < 0.3) continue; // ground level: the terrain and the floor sheets
        const area = q.subVectors(f[1], f[0]).cross(p.subVectors(f[2], f[0])).length() / 2;
        if (area < 1e-4) continue;
        const ns = Math.min(40, Math.max(1, Math.round(area / 0.25)));
        const tag = tg ? Math.round(tg.getX(ii[0])) : -1, key = names[tag] || o.name || '(untagged)';
        for (let s = 0; s < ns; s++) {
          let a = rnd(), b = rnd(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
          const fy = f[0].y + (f[1].y - f[0].y) * a + (f[2].y - f[0].y) * b;
          if (fy < 0.3) continue;
          p.copy(w[0]).addScaledVector(q.subVectors(w[1], w[0]), a).addScaledVector(n.subVectors(w[2], w[0]), b);
          tot += area / ns;
          totBy[key] = (totBy[key] || 0) + area / ns;
          if (covered(p)) continue;
          bare += area / ns;
          const fx = f[0].x + (f[1].x - f[0].x) * a + (f[2].x - f[0].x) * b, fz = f[0].z + (f[1].z - f[0].z) * a + (f[2].z - f[0].z) * b;
          let e = by.get(key);
          if (!e) by.set(key, (e = { area: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 }));
          e.area += area / ns; e.x0 = Math.min(e.x0, fx); e.x1 = Math.max(e.x1, fx); e.y0 = Math.min(e.y0, fy); e.y1 = Math.max(e.y1, fy); e.z0 = Math.min(e.z0, fz); e.z1 = Math.max(e.z1, fz);
        }
      }
    });
    const out = [...by].filter(([, e]) => e.area >= 0.5).sort((a, b) => b[1].area - a[1].area).map(([k, e]) =>
      `${e.area.toFixed(1).padStart(8)} m2 of ${totBy[k].toFixed(0).padStart(6)}  ${k}   x ${e.x0.toFixed(1)}..${e.x1.toFixed(1)}  y ${e.y0.toFixed(1)}..${e.y1.toFixed(1)}  z ${e.z0.toFixed(1)}..${e.z1.toFixed(1)}`);
    return { tot, bare, out };
  });
  console.log(`coverage: ${res.bare.toFixed(0)} of ${res.tot.toFixed(0)} m2 of solid surface (0.3 m up and over) has no collider within 0.35 m; by builder > part, 0.5 m2 and over:`);
  for (const o of res.out) console.log('  ' + o);
}

console.log(errs.slice(0, 5).join('\n') || 'no page errors');
await b.close();
