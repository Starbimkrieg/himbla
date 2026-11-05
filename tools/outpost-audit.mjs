// Dev-only audit of the small outposts (src/outpostDrafts.js, the picks in OUTPOST_PICK): the same rules every place follows
// (CLAUDE.md "Model structure" and "Collision and ledge grinds", docs/collision.md), checked on each outpost's template in the
// model viewer, with the Kit's dev tags on so every finding names the piece and where it is (the outpost's frame: metres,
// +y up, ground at 0, +z to the gate). Not part of the build.
//   npx vite --port 5199 --host 127.0.0.1                         (in one shell)
//   node tools/outpost-audit.mjs [kind ...]                       (default: all seven; KIND=draft as kiosk=a to audit another draft;
//                                                                   COLOR=rrggbb for the owner, WRECK=1 for the wrecks)
// Checks:
//   floating   pieces that touch nothing: no other piece's box within 3 cm and not on the ground (a barrel off its gun, a sign in
//              the air, a lamp off its post). Rotated pieces are tested by their bounds, so a piece listed is surely loose;
//              one that touches only by its bounds' corners can still be loose, so look at the renders as well.
//   uncovered  solid pieces (40 cm and thicker, not glow or glass) whose surfaces 0.3 m up and higher have no collider within
//              0.35 m: you'd run, fall or fly through them. Thin parts (rails, beams and tubes under 0.36 m, trims) are left out,
//              as docs/collision.md says.
//   overair    colliders whose standable top is over nothing drawn (no surface from 2 m above it to 0.3 m under a sample): you'd
//              stand on air.
//   routes     the walking NPCs' routes (outpostWalkers.js) checked every 0.5 m against the colliders (a 0.45 m body): nobody
//              walks through a wall.
// Exit 1 when anything is found. Read every finding: fix it, or say why it stays.
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const PICK = { kiosk: 'b', tower: 'b', depot: 'b', farm: 'b', mast: 'a', junk: 'a', shack: 'c' };
const OWNER = { kiosk: '2ec4ff', tower: 'ffd23f', depot: 'ffd23f', farm: 'ff9f1c', mast: 'ff9f1c', junk: '7dff3a', shack: '7dff3a' };
const args = process.argv.slice(2);
const kinds = (args.length ? args : Object.keys(PICK)).map((a) => { const [k, d] = a.split('='); return [k, d || PICK[k]]; });
const URL = process.env.GAME_URL || 'http://127.0.0.1:5199';

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 320, height: 200 } });
pg.setDefaultTimeout(300000);
await pg.addInitScript(() => { window.__kitTags = true; });
let bad = 0;
for (const [kind, draft] of kinds) {
  await pg.goto(`${URL}/tools/viewer.html?m=outpost&kind=${kind}&draft=${draft}&cols=0&color=${process.env.COLOR || OWNER[kind]}${process.env.WRECK ? '&wreck=1' : ''}`);
  await pg.waitForFunction(() => window.viewer && window.outpostTpls && window.outpostTpls.kit, null, { timeout: 180000 });
  const r = await pg.evaluate(() => {
    const THREE = window.viewer.THREE, t = window.outpostTpls.kit, F = 0.3;
    const boxes = (window.__kitBoxes || []).filter((x) => x.t && !x.t.includes('|') && x.t === x.t); // (this template's pieces: the viewer builds one)
    const byInst = new Map(boxes.map((x) => [x.i, x]));
    const fmt = (v) => v.map((n) => n.toFixed(1)).join(', ');
    // ---- floating: pieces whose bounds touch no other piece's and not the ground
    const TOL = 0.03, floating = [];
    for (const p of boxes) {
      if (p.a[1] <= F + 0.05) continue;
      let ok = false;
      for (const q of boxes) {
        if (q === p) continue;
        if (q.a[0] - TOL <= p.b[0] && p.a[0] - TOL <= q.b[0] && q.a[1] - TOL <= p.b[1] && p.a[1] - TOL <= q.b[1] && q.a[2] - TOL <= p.b[2] && p.a[2] - TOL <= q.b[2]) { ok = true; break; }
      }
      if (!ok) floating.push(`#${p.i} ${p.glow ? 'glow ' : ''}#${p.c.toString(16).padStart(6, '0')} at (${fmt(p.a.map((v, i) => (v + p.b[i]) / 2))}) size ${fmt(p.a.map((v, i) => p.b[i] - v))}`);
    }
    // ---- the colliders, as the game places them (territory.place: yaw, then pitch and roll)
    const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3();
    const cols = t.cols.map((c) => {
      if (c.type === 'box') { Q.setFromEuler(E.set(c.pitch || 0, c.yaw || 0, c.roll || 0, 'YXZ')); return { ...c, inv: Q.clone().invert() }; }
      return c;
    });
    const inside = (c, x, y, z, tol) => {
      if (c.type === 'box') { V.set(x - c.x, y - c.y, z - c.z).applyQuaternion(c.inv); return Math.abs(V.x) <= c.hx + tol && Math.abs(V.y) <= c.hy + tol && Math.abs(V.z) <= c.hz + tol; }
      if (c.type === 'cyl') return y >= c.y0 - tol && y <= c.y1 + tol && Math.hypot(x - c.x, z - c.z) <= c.r + tol;
      if (c.type === 'sphere') return Math.hypot(x - c.x, y - c.y, z - c.z) <= c.r + tol;
      if (c.type === 'hcyl') { const s = Math.sin(-c.yaw), co = Math.cos(-c.yaw), dx = x - c.x, dz = z - c.z, lx = dx * co + dz * s, lz = -dx * s + dz * co; return Math.abs(lz) <= c.len / 2 + tol && Math.hypot(lx, y - c.y) <= c.r + tol; }
      return false;
    };
    const covered = (x, y, z, tol) => cols.some((c) => !c.floor && inside(c, x, y, z, tol));
    // ---- uncovered: sample the opaque surfaces of solid pieces
    let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // (the same samples every run)
    const meshes = [];
    t.root.updateMatrixWorld(true);
    // (the template's own merged meshes only: a moving part is a kit of its own, whose piece ids would collide with these)
    for (const o of t.root.children) if (o.isMesh && !o.userData.isInk && o.geometry.attributes.inst && !o.material.transparent && !o.material.isMeshBasicMaterial) meshes.push(o);
    const bare = new Map(), seen = new Map();
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), P = new THREE.Vector3();
    for (const m of meshes) {
      const g = m.geometry, pos = g.attributes.position, ins = g.attributes.inst, idx = g.index, n = idx ? idx.count : pos.count;
      for (let k = 0; k < n; k += 3) {
        const ia = idx ? idx.getX(k) : k, ib = idx ? idx.getX(k + 1) : k + 1, ic = idx ? idx.getX(k + 2) : k + 2;
        const p = byInst.get(Math.round(ins.getX(ia)));
        if (!p || p.glow || p.tube) continue;
        const dims = p.a.map((v, i) => p.b[i] - v).sort((x, y) => x - y);
        if (dims[0] < 0.4 || dims[2] < 1) continue; // (thin parts and small props: no collider wanted)
        A.fromBufferAttribute(pos, ia); B.fromBufferAttribute(pos, ib); C.fromBufferAttribute(pos, ic);
        const area = B.clone().sub(A).cross(C.clone().sub(A)).length() / 2;
        if (area < 1e-4) continue;
        const ns = Math.min(40, Math.max(1, Math.round(area / 0.5)));
        for (let s = 0; s < ns; s++) {
          let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          P.copy(A).addScaledVector(B.clone().sub(A), u).addScaledVector(C.clone().sub(A), v);
          if (P.y < F + 0.3) continue;
          seen.set(p.i, (seen.get(p.i) || 0) + area / ns);
          if (!covered(P.x, P.y, P.z, 0.35)) bare.set(p.i, (bare.get(p.i) || 0) + area / ns);
        }
      }
    }
    const uncovered = [...bare].filter(([i, a]) => a > 0.6 && a / seen.get(i) > 0.25).sort((x, y) => y[1] - x[1])
      .map(([i, a]) => { const p = byInst.get(i); return `#${i} #${p.c.toString(16).padStart(6, '0')} at (${fmt(p.a.map((v, j) => (v + p.b[j]) / 2))}) size ${fmt(p.a.map((v, j) => p.b[j] - v))}: ${a.toFixed(1)} m2 bare of ${seen.get(i).toFixed(1)}`; });
    // ---- overair: collider tops over nothing drawn
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), solids = []; // (anything drawn, see-through mesh fences too)
    t.root.traverse((o) => { if (o.isMesh && !o.userData.isInk) solids.push(o); });
    const overair = [];
    for (const c of t.cols) {
      if (c.floor || c.lattice || c.type === 'sphere' || c.type === 'hcyl') continue; // (a lattice's box: an open truss, its top only braces)
      let top, pts = [];
      if (c.type === 'cyl') { if (c.r < 0.35) continue; /* (a pole: nothing to stand on) */ top = c.y1; for (let a = 0; a < 6; a++) pts.push([c.x + Math.sin(a) * c.r * 0.7, c.z + Math.cos(a) * c.r * 0.7]); pts.push([c.x, c.z]); }
      else {
        if (Math.abs(c.pitch || 0) > 0.05 || Math.abs(c.roll || 0) > 0.05) continue; // (a tilted plate: checked by eye)
        if (Math.min(c.hx, c.hz) < 0.2) continue; // (a thin wall or fence: its top is a rail, not something a ray from above finds)
        top = c.y + c.hy;
        const cs = Math.cos(c.yaw || 0), sn = Math.sin(c.yaw || 0);
        for (let u = -1; u <= 1; u += 0.5) for (let w = -1; w <= 1; w += 0.5) { const lx = u * c.hx * 0.9, lz = w * c.hz * 0.9; pts.push([c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs]); }
      }
      if (top < F + 0.45) continue;
      let air = 0;
      pts = pts.filter(([x, z]) => !cols.some((o) => o !== c && !o.floor && o.type !== 'hcyl' && o.type !== 'sphere' && inside(o, x, top + 0.05, z, 0)));
      if (!pts.length) continue; // (buried in the next collider up)
      for (const [x, z] of pts) {
        ray.set(new THREE.Vector3(x, top + 2, z), down); ray.far = 2.3; // (from 2 m up: a top inside a sloping roof counts as covered)
        if (!ray.intersectObjects(solids, false).length) air++;
      }
      if (air / pts.length > 0.3) overair.push(`${c.type} top ${top.toFixed(2)} at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})${c.type === 'box' ? ` ${(c.hx * 2).toFixed(1)} x ${(c.hz * 2).toFixed(1)}` : ` r ${c.r.toFixed(1)}`}: ${air}/${pts.length} samples over air`);
    }
    // ---- routes
    const routes = [];
    ((t.walkers && t.walkers.routes) || []).forEach((route, ri) => {
      for (let i = 0; i < route.length - 1; i++) {
        const [ax, az] = route[i], [bx, bz] = route[i + 1], L = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d <= L; d += 0.5) {
          const x = ax + ((bx - ax) * d) / L, z = az + ((bz - az) * d) / L;
          if ([0.5, 1.2].some((y) => covered(x, F + y, z, 0.45))) { routes.push(`route ${ri} leg ${i} blocked at (${x.toFixed(1)}, ${z.toFixed(1)})`); break; }
        }
      }
    });
    let tris = 0; t.root.traverse((o) => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3; });
    return { floating, uncovered, overair, routes, stats: `${t.cols.length} colliders (${t.cols.filter((c) => c.floor).length} floor), ${Math.round(tris / 1000)}k triangles, ${(t.walkers && t.walkers.routes.length) || 0} walkers` };
  });
  const n = r.floating.length + r.uncovered.length + r.overair.length + r.routes.length;
  bad += n;
  console.log(`\n== ${kind} (draft ${draft}${process.env.WRECK ? ', wreck' : ''}): ${n ? n + ' findings' : 'clean'}; ${r.stats}`);
  for (const [name, list] of [['floating', r.floating], ['uncovered', r.uncovered], ['overair', r.overair], ['routes', r.routes]]) {
    if (!list.length) continue;
    console.log(`  ${name} (${list.length}):`);
    for (const l of list.slice(0, 25)) console.log('    ' + l);
    if (list.length > 25) console.log(`    ... and ${list.length - 25} more`);
  }
}
await b.close();
process.exit(bad ? 1 : 0);
