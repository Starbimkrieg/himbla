// Dev-only Z-fighting audit for the Lucky Crater Casino (docs/casino-layouts.md, "Z-fighting"). Not in the build.
//   npx vite --port 5199 --host 127.0.0.1      (in one shell)
//   node tools/casino-zfight.mjs                (Playwright from PLAYWRIGHT, default /opt/node-tools/node_modules/playwright/index.mjs; the game from GAME_URL)
// Surfaces fight when coplanar (within depth precision), facing the same way and overlapping. This takes every mesh near the casino into
// the casino frame, buckets triangles by plane (normal, offset), and reports pairs from DIFFERENT meshes sharing a plane and overlapping
// by more than 1 cm2. EPS: plane distance under which two surfaces count as one. The 24-bit depth buffer separates 0.1 mm at 30 m and
// ~1 mm at 100 m, so 2 mm is the floor for a layout (decals, panels and trim stand off by at least 2 cm; textured planes also use
// polygonOffset). Outline shells (back faces only) and floor-standing undersides are skipped. Run before and after a rebuild; aim for zero.
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const EPS = Number(process.env.EPS || 0.002);

const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 900, height: 560 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(process.env.GAME_URL || 'http://127.0.0.1:5199/', { waitUntil: 'load' });
await pg.waitForFunction('window.game && window.game.world', null, { timeout: 180000 });
await pg.keyboard.press('Enter'); await pg.waitForTimeout(4000);
for (let i = 0; i < 14; i++) { let st = null; try { st = await pg.evaluate('window.game.state'); } catch (e) { await pg.waitForTimeout(2500); continue; } if (st === 'play') break; await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); }
await pg.waitForTimeout(2000);
await pg.evaluate(() => {
  const g = window.game, loc = g.locations.find((l) => l.id === 'casino');
  const start = g.world.toWorld(loc, 0, 1, 20);
  g.player.body.pos.copy(start); g.player.vel.set(0, 0, 0); g.player.center.copy(start);
});
await pg.waitForTimeout(6000);

const report = await pg.evaluate((EPS) => {
  const g = window.game, W = g.world, loc = g.locations.find((l) => l.id === 'casino');
  const V = g.player.pos.constructor, M = W.casino.loc.group.matrixWorld.constructor;
  const inv = new M().copy(W.casino.loc.group.matrixWorld).invert();
  // hall and forecourt in the casino frame (generous: whole building, canopy, carousels)
  const inBox = (p) => p.x > -70 && p.x < 70 && p.z > -50 && p.z < 60 && p.y > -1 && p.y < 90;
  const tris = [];
  const a = new V(), c = new V(), d = new V(), n = new V(), e1 = new V(), e2 = new V();
  g.scene.updateMatrixWorld(true);
  let meshes = 0;
  g.scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.visible) return;
    const pos = o.geometry.attributes.position; if (!pos) return;
    const mat0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat0.side === 1) return;                                                  // outline shells draw back faces only, never through a front face
    const m = new M().multiplyMatrices(inv, o.matrixWorld);
    const idx = o.geometry.index;
    const nt = idx ? idx.count / 3 : pos.count / 3;
    let used = false;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const tag = (o.name || mat.name || '') + (o.parent && o.parent.name ? '<' + o.parent.name + '>' : '') + '#' + (mat.color ? mat.color.getHexString() : mat.map ? 'map' : '?') + (mat.side === 2 ? ' (double-sided)' : '') + (mat.transparent ? ' (transparent)' : '');
    for (let t = 0; t < nt; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m); c.fromBufferAttribute(pos, i1).applyMatrix4(m); d.fromBufferAttribute(pos, i2).applyMatrix4(m);
      e1.subVectors(c, a); e2.subVectors(d, a); n.crossVectors(e1, e2);
      const area = n.length() / 2; if (area < 1e-4) continue;
      n.divideScalar(area * 2);
      const cx = (a.x + c.x + d.x) / 3, cy = (a.y + c.y + d.y) / 3, cz = (a.z + c.z + d.z) / 3;
      if (!inBox({ x: cx, y: cy, z: cz })) continue;
      if (n.y < -0.9 && cy < 1.2) continue;                                      // undersides of floor-standing things are never seen
      used = true;
      tris.push({ p: [a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z], n: [n.x, n.y, n.z], d: n.x * a.x + n.y * a.y + n.z * a.z, area, mesh: meshes, tag, ds: mat.side === 2 });
    }
    if (used) meshes++;
  });
  // file by plane
  const bucket = new Map();
  const key = (t, k) => `${Math.round(t.n[0] * 200)},${Math.round(t.n[1] * 200)},${Math.round(t.n[2] * 200)},${Math.floor(t.d / 0.02) + k}`;
  tris.forEach((t, i) => { const k = key(t, 0); (bucket.get(k) || bucket.set(k, []).get(k)).push(i); });
  // convex clip area of two coplanar triangles in the plane's dominant axes
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
  const found = new Map();
  const test = (i, j) => {
    const A = tris[i], B = tris[j];
    if (A.mesh === B.mesh) return;
    if (A.n[0] * B.n[0] + A.n[1] * B.n[1] + A.n[2] * B.n[2] < 0.9999) return;     // same way round only
    if (Math.abs(A.d - B.d) > EPS) return;
    const ax = Math.abs(A.n[0]) > Math.abs(A.n[1]) && Math.abs(A.n[0]) > Math.abs(A.n[2]) ? 0 : Math.abs(A.n[1]) > Math.abs(A.n[2]) ? 1 : 2;
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const flat = (T) => [[T.p[u], T.p[v]], [T.p[3 + u], T.p[3 + v]], [T.p[6 + u], T.p[6 + v]]];
    let ta = flat(A), tb = flat(B);
    if (area2(ta) < 0) ta = [ta[0], ta[2], ta[1]];
    if (area2(tb) < 0) tb = [tb[0], tb[2], tb[1]];
    const ov = Math.abs(area2(clip(ta, tb)));
    if (ov < 1e-4) return;
    const k = Math.min(A.mesh, B.mesh) + ':' + Math.max(A.mesh, B.mesh) + ':' + Math.round(A.d * 20);
    const f = found.get(k) || { a: A.tag, b: B.tag, n: A.n, d: +A.d.toFixed(3), gap: 0, area: 0, at: [(A.p[0] + A.p[3] + A.p[6]) / 3, (A.p[1] + A.p[4] + A.p[7]) / 3, (A.p[2] + A.p[5] + A.p[8]) / 3], ds: A.ds || B.ds };
    f.area += ov; f.gap = Math.max(f.gap, Math.abs(A.d - B.d));
    found.set(k, f);
  };
  for (const [k, list] of bucket) {
    const [n0, n1, n2, db] = k.split(',').map(Number);
    const nb = bucket.get(`${n0},${n1},${n2},${db + 1}`) || [];
    for (let x = 0; x < list.length; x++) { for (let y = x + 1; y < list.length; y++) test(list[x], list[y]); for (const y of nb) test(list[x], y); }
  }
  // a face buried in a solid (e.g. the back of a panel set into a wall) never shows: a ray from 1 cm in front along its normal crosses
  // an odd number of surfaces when that point is inside something closed
  const hits = (o, d) => {
    let n = 0;
    for (const T of tris) {
      const p = T.p;
      const e1x = p[3] - p[0], e1y = p[4] - p[1], e1z = p[5] - p[2], e2x = p[6] - p[0], e2y = p[7] - p[1], e2z = p[8] - p[2];
      const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-9) continue;
      const f = 1 / det, sx = o[0] - p[0], sy = o[1] - p[1], sz = o[2] - p[2];
      const u = f * (sx * hx + sy * hy + sz * hz);
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
      if (v < 0 || u + v > 1) continue;
      const t = f * (e2x * qx + e2y * qy + e2z * qz);
      if (t > 1e-4 && t < 4) n++;                   // within 4 m only (a wall, a counter); a lone far plane would flip the count
    }
    return n;
  };
  const list = [...found.values()].sort((p, q) => q.area - p.area);
  let buried = 0;
  for (const f of list) {
    const n = f.n, o = [f.at[0] + n[0] * 0.01, f.at[1] + n[1] * 0.01, f.at[2] + n[2] * 0.01];
    f.buried = hits(o, n) % 2 === 1;
    if (f.buried) buried++;
  }
  return { tris: tris.length, meshes, found: list.filter((f) => !f.buried), buried };
}, EPS);

console.log(`${report.tris} triangles in ${report.meshes} meshes near the casino; plane tolerance ${EPS * 100} cm; ${report.buried} overlapping pairs are buried inside solids and left out`);
if (!report.found.length) console.log('no coplanar overlaps');
for (const f of report.found.slice(0, 40)) console.log(`${f.area.toFixed(2).padStart(7)} m2  gap ${(f.gap * 100).toFixed(1)} cm  normal (${f.n.map((x) => x.toFixed(2))}) at (${f.at.map((x) => x.toFixed(1))})  ${f.a}  <>  ${f.b}${f.ds ? '  [double-sided]' : ''}`);
if (report.found.length > 40) console.log(`... and ${report.found.length - 40} more`);
console.log(errs.slice(0, 3).join('\n') || 'no page errors');
await b.close();
process.exitCode = report.found.length ? 1 : 0;
