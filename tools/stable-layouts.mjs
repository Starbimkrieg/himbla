// The stable yard behind Chimera Downs' far stand: its two layouts (STABLE_LAYOUTS in src/downsPlan.js) as plans, and their clearances. Dev-only.
//   node tools/stable-layouts.mjs          checks both layouts: every piece clear of the far stand, the arcades and each other (an L's knuckle meets its blocks)
//   node tools/stable-layouts.mjs docs     also draws docs/stable-proposals/plan-{current,a,b}.svg
// Plan frame: the Downs' own (metres, +x right, z down the page: the far stand at the top, the yard behind it below).
import { writeFileSync, mkdirSync } from 'node:fs';
import { STABLE_LAYOUTS, stallsOf, FAR, ARCADE, ENTRIES } from '../src/downsPlan.js';

const BACK = -(FAR.z0 + FAR.tiers * FAR.depth + FAR.wall);       // the far stand's back wall's outer face (-96)
// each piece's footprint in its own frame: [x0, x1, z0, z1] (front +z), or a circle's radius
const FOOT = {
  dn_stable_4: [-10.3, 10.3, -9.2, 2.4], dn_stable_6: [-15.3, 15.3, -9.2, 2.4], dn_stable_corner: [-9.6, 0.6, -9.6, 0.6],
  dn_hay_barn: [-12.6, 12.6, -14.7, 0.5], dn_trough: [-1.2, 1.2, -0.5, 0.5], dn_tack: [-0.6, 0.6, -0.45, 0.45], dn_yard_gate: [-3.55, 3.55, -0.55, 0.55],
};
const RING_R = 9.1;
const PAL = { gold: '#cfb352', saddle: '#b07c57', black: '#3b393a', money: '#7b9a6e', barn: '#8b4044', mint: '#f8fff8', earth: '#a4714e', grass: '#86a578' };
// the yard as it was: four blocks of six round a lane, the barn between the back two
const CURRENT = {
  name: 'Now: four blocks round a lane',
  pieces: [['dn_stable_6', -36, -126, 0], ['dn_stable_6', 36, -126, 0], ['dn_stable_6', -36, -114, Math.PI], ['dn_stable_6', 36, -114, Math.PI], ['dn_hay_barn', 0, -126, 0]],
  fences: [], gates: [], hay: [], ground: [[-56, 56, -136, -104, 'earth']], trainer: [0, -119.5],
};

const corners = ([x0, x1, z0, z1], x, z, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
};
const shapes = (L) => L.pieces.map(([n, x, z, yaw], i) => (n === 'dn_lunge_ring' ? { i, n, circle: [x, z, RING_R] } : { i, n, poly: corners(FOOT[n], x, z, yaw) }))
  .concat(L.gates.map(([x, z, yaw], j) => ({ i: 100 + j, n: 'dn_yard_gate', poly: corners(FOOT.dn_yard_gate, x, z, yaw) })));
const pts = (sh) => (sh.circle ? Array.from({ length: 48 }, (_, k) => [sh.circle[0] + Math.cos((k / 48) * 2 * Math.PI) * sh.circle[2], sh.circle[1] + Math.sin((k / 48) * 2 * Math.PI) * sh.circle[2]]) : sh.poly);
const insidePoly = (P, [x, z]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
const segDist = ([px, pz], [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - ax - t * dx, pz - az - t * dz); };
function gap(a, b) {
  const A = pts(a), B = pts(b);
  if (A.some((p) => (b.circle ? Math.hypot(p[0] - b.circle[0], p[1] - b.circle[1]) < b.circle[2] : insidePoly(B, p))) || B.some((p) => (a.circle ? Math.hypot(p[0] - a.circle[0], p[1] - a.circle[1]) < a.circle[2] : insidePoly(A, p)))) return -1;
  let g = 1e9;
  for (const p of A) for (let k = 0; k < B.length; k++) g = Math.min(g, segDist(p, B[k], B[(k + 1) % B.length]));
  for (const p of B) for (let k = 0; k < A.length; k++) g = Math.min(g, segDist(p, A[k], A[(k + 1) % A.length]));
  return g;
}

function check(L) {
  const S = shapes(L), out = [];
  for (const s of S) {
    for (const [x, z] of pts(s)) {
      if (z > BACK - 0.2 && s.n !== 'dn_yard_gate') out.push(`${s.n} #${s.i} reaches the far stand (z ${z.toFixed(1)})`);
      for (const cx of [-ARCADE.cx, ARCADE.cx]) {                                        // (the arcades run from 105 to 270 degrees round the west turn's centre, and the mirror)
        const r = Math.hypot(x - cx, z);
        let a = (Math.atan2(z, cx < 0 ? x - cx : cx - x) * 180) / Math.PI; if (a < 0) a += 360;
        if (r < ARCADE.ro + 2 && a >= 105 && a <= 272) out.push(`${s.n} #${s.i} within 2 m of an arcade (r ${r.toFixed(1)})`);
      }
    }
  }
  let tight = [];
  // an L's two arms cross in its inner corner (porch on porch), where the knuckle lays its porch square over them: the knuckle's inner corner, in the plan
  const knuckles = L.pieces.filter((p) => p[0] === 'dn_stable_corner').map(([, x, z, yaw]) => corners([1.4, 1.4, 1.4, 1.4], x, z, yaw)[0]);
  const atKnuckle = (A, B) => knuckles.some(([kx, kz]) => [A, B].every((S2) => pts(S2).some(([x, z]) => Math.hypot(x - kx, z - kz) < 2.2)));
  for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
    const A = S[a], B = S[b];
    if (A.n === 'dn_stable_corner' || B.n === 'dn_stable_corner') continue;          // (an L's knuckle meets its blocks on purpose)
    if (/stable/.test(A.n) && /stable/.test(B.n) && atKnuckle(A, B)) continue;
    if ([A.n, B.n].some((n) => n === 'dn_trough' || n === 'dn_tack') && [A.n, B.n].some((n) => /stable/.test(n))) continue;   // (props stand on the porches)
    const g = gap(A, B);
    if (g < 1.0) out.push(`${A.n} #${A.i} and ${B.n} #${B.i}: ${g < 0 ? 'overlap' : `${g.toFixed(2)} m apart`}`);
    else tight.push([g, `${A.n} #${A.i} / ${B.n} #${B.i}`]);
  }
  tight = tight.sort((p, q) => p[0] - q[0]).slice(0, 3).map(([g, t]) => `${t} ${g.toFixed(1)} m`);
  return { problems: out, tight };
}

// ---------- the plans ----------
const X0 = -100, X1 = 100, Z0 = -180, Z1 = -70, SC = 6, PAD = 14, HEAD = 46;
const W = (X1 - X0) * SC + PAD * 2, H = (Z1 - Z0) * SC + PAD * 2 + HEAD;
const px = (x) => ((x - X0) * SC + PAD).toFixed(1), pz = (z) => ((Z1 - z) * SC + PAD + HEAD).toFixed(1);    // (z up the plan: the stand at the top)
const poly = (P, fill, line, op = 1, w = 1.5) => `<polygon points="${P.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="${fill}" fill-opacity="${op}" stroke="${line}" stroke-width="${w}"/>`;
const FILL = { dn_stable_4: PAL.barn, dn_stable_6: PAL.barn, dn_stable_corner: PAL.gold, dn_hay_barn: PAL.barn, dn_trough: PAL.saddle, dn_tack: PAL.saddle, dn_yard_gate: PAL.mint };
function svg(L) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="monospace"><rect width="100%" height="100%" fill="#2a2440"/>`;
  s += `<text x="${PAD}" y="30" fill="${PAL.gold}" font-size="22" font-weight="bold">${L.name}</text>`;
  // the far stand, its tunnels, the ends of the arcades
  s += poly([[-95, -76], [95, -76], [95, BACK], [-95, BACK]], '#4a4466', PAL.mint, 1);
  s += `<text x="${px(0)}" y="${+pz(-86) + 5}" fill="${PAL.mint}" font-size="16" text-anchor="middle">FAR STAND (its back wall)</text>`;
  for (const ex of ENTRIES) s += poly([[ex - 3, -76], [ex + 3, -76], [ex + 3, BACK - 0.5], [ex - 3, BACK - 0.5]], PAL.saddle, PAL.mint, 0.9) + `<text x="${px(ex)}" y="${+pz(-80) + 4}" fill="#2a2440" font-size="11" text-anchor="middle">TUNNEL</text>`;
  for (const cx of [-ARCADE.cx, ARCADE.cx]) {
    const P = [];
    for (let a = 245; a <= 275; a += 2) P.push([cx + Math.cos((a * Math.PI) / 180) * ARCADE.ro * Math.sign(cx || 1) * (cx < 0 ? 1 : -1) * -1, Math.sin((a * Math.PI) / 180) * ARCADE.ro]);
    for (let a = 275; a >= 245; a -= 2) P.push([cx + Math.cos((a * Math.PI) / 180) * ARCADE.ri * (cx < 0 ? -1 : 1) * -1, Math.sin((a * Math.PI) / 180) * ARCADE.ri]);
    s += poly(P.map(([x, z]) => [x, z]), '#4a4466', PAL.mint, 0.6, 1);
  }
  for (const [x0, x1, z0, z1, k] of L.ground) s += poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], PAL[k], 'none', 0.45, 0);
  for (const f of L.fences) s += `<polyline points="${f.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="none" stroke="${PAL.mint}" stroke-width="2.5" stroke-dasharray="6 3"/>`;
  for (const sh of shapes(L)) {
    if (sh.circle) s += `<circle cx="${px(sh.circle[0])}" cy="${pz(sh.circle[1])}" r="${(sh.circle[2] * SC).toFixed(1)}" fill="${PAL.saddle}" fill-opacity="0.55" stroke="${PAL.mint}" stroke-width="2"/>`;
    else s += poly(sh.poly, FILL[sh.n], PAL.mint, sh.n === 'dn_yard_gate' ? 1 : 0.9);
  }
  for (const [x, z, yaw] of stallsOf(L)) s += `<circle cx="${px(x)}" cy="${pz(z)}" r="3.5" fill="${PAL.gold}"/><line x1="${px(x)}" y1="${pz(z)}" x2="${px(x + Math.sin(yaw) * 2.6)}" y2="${pz(z + Math.cos(yaw) * 2.6)}" stroke="${PAL.gold}" stroke-width="2"/>`;
  for (const [x, z, , n] of L.gates) if (n) s += `<text x="${px(x)}" y="${+pz(z) - 14}" fill="${PAL.mint}" font-size="12" text-anchor="middle">${n}</text>`;
  for (const [n, x, z] of L.pieces) {
    const label = { dn_stable_corner: 'CLOCK TOWER', dn_hay_barn: 'HAY BARN', dn_lunge_ring: 'LUNGE RING' }[n];
    if (label) s += `<text x="${px(x + (n === 'dn_stable_corner' ? -4.5 * Math.sign(x) : 0))}" y="${+pz(z - (n === 'dn_hay_barn' ? 7 : n === 'dn_stable_corner' ? 4.5 : 0)) + 5}" fill="${n === 'dn_lunge_ring' ? PAL.black : PAL.mint}" font-size="12" text-anchor="middle" font-weight="bold">${label}</text>`;
  }
  const [tx, tz] = L.trainer;
  s += `<circle cx="${px(tx)}" cy="${pz(tz)}" r="5" fill="#7dff3a" stroke="#2a2440" stroke-width="1.5"/><text x="${+px(tx) + 8}" y="${+pz(tz) + 4}" fill="#7dff3a" font-size="11">trainer</text>`;
  s += `<text x="${PAD}" y="${H - 8}" fill="${PAL.mint}" font-size="12">${stallsOf(L).length} boxes (gold dots, looking out) · 10 m grid · the far stand's tunnels at x = +-47.5</text>`;
  for (let x = -100; x <= 100; x += 10) s += `<line x1="${px(x)}" y1="${pz(Z1)}" x2="${px(x)}" y2="${pz(Z0)}" stroke="#ffffff" stroke-opacity="0.05"/>`;
  return s + '</svg>';
}

for (const [k, L] of [['current', CURRENT], ['a', STABLE_LAYOUTS.a], ['b', STABLE_LAYOUTS.b]]) {
  const r = check(L);
  console.log(`${L.name}: ${stallsOf(L).length} boxes · ${r.problems.length ? `${r.problems.length} problems\n  ${r.problems.join('\n  ')}` : 'clear'} · tightest: ${r.tight.join(', ')}`);
  if (process.argv[2] === 'docs') { mkdirSync('docs/stable-proposals', { recursive: true }); writeFileSync(`docs/stable-proposals/plan-${k}.svg`, svg(L)); }
}
