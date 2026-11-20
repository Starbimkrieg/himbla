// The Kepler towns' layouts (src/keplerLayout.js: the three the towns take, and the Civic Center's; docs/kepler-proposals).
//
//   node tools/kepler-layouts.mjs         checks every layout: 2 m between footprints, everything inside 0.85 of the town's
//                                         radius, the landing pad's flight disc clear, each dome a size kepler.glb holds
//   node tools/kepler-layouts.mjs docs    also writes docs/kepler-proposals/layout-<id>.svg and layouts.json (the pieces,
//                                         which tools/blender/proposals/kepler_town.py stands up in 3D)
//
// Frame: the town's own (settlements.js buildTown), metres, +x right and +z up the plan; +z is the sunward side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEPLER_LAYOUTS as LAYOUTS, KEPLER_PAD, DOME_A, DOME_B } from '../src/keplerLayout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'kepler-proposals');
const rad = (d) => (d * Math.PI) / 180;
const r1 = (v) => Math.round(v * 10) / 10;
const PAD = { k: 'pad', ...KEPLER_PAD };
const FLIGHT = 15.7; // a bus's flight disc (traffic.js addFlyer)

// ---- footprints: polygons in the town's frame ----
function turn(pts, x, z, yaw) {
  const c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
  return pts.map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]);
}
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const circle = (r, n = 20) => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)]);
// what a dome covers: A's terraces reach r + 3.6 and its airlock r + 7; B's drum r + 0.5, its airlock r + 5.5
const domeR = (q) => (q.k === 'domeA' ? q.r + 3.6 : q.r + 0.5);
const lockEnd = (q) => (q.k === 'domeA' ? q.r + 7 : q.r + 5.5);
function footprints(q) {
  const T = (pts) => turn(pts, q.x, q.z, q.yaw || 0);
  switch (q.k) {
    case 'domeA': case 'domeB': return [T(circle(domeR(q))), T(rect(-2.3, 0, 2.3, lockEnd(q)))];
    case 'stilt': return [T(rect(-5.75, -3.2, 5.75, q.stairs ? 4.8 : 3.2))];
    case 'longhouse': return [T(rect(-5, -q.len / 2 - 0.4, 5, q.len / 2 + 1.8))];
    case 'shop': return [T(rect(-4.3, -4.5, 4.3, 4.45))];      // (an ILMB shop unit at 0.86, 0.25 m forward)
    case 'stall': return [T(rect(-2.1, -1.45, 2.1, 1.45))];
    case 'bench': return [T(rect(-1.2, -0.4, 1.2, 0.4))];
    case 'sign': return [T(rect(-7.2, -0.4, 7.2, 0.4))];
    case 'greenhouse': return [T(rect(-3.8, -9.2, 3.8, 9.2))];
    case 'tank': return [T(circle(5.4, 12))];
    case 'mast': return [T(circle(2.2, 8))];
    case 'solar': return [T(rect(-q.n * 2.7, -1.7, q.n * 2.7, 1.7))];
    case 'hall': return [T(circle(21.5, 28)), T(rect(17, 28, 21, 32))];
    case 'pad': return [T(circle(q.r, 24))];
    default: return [];
  }
}

// ---- clearance ----
function segDist(a, b, c, d) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  const pt = (p, u, v) => {
    const dx = v[0] - u[0], dz = v[1] - u[1], t = Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p[0] - u[0] - t * dx, p[1] - u[1] - t * dz);
  };
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}
const inside = (p, poly) => poly.reduce((odd, a, i) => {
  const b = poly[(i + 1) % poly.length];
  return (a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0]) ? !odd : odd;
}, false);
function polyDist(P, Q) {
  if (inside(P[0], Q) || inside(Q[0], P)) return 0;
  let m = Infinity;
  for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) m = Math.min(m, segDist(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length]));
  return m;
}
const label = (q) => `${q.k}${q.name ? ' ' + q.name : ''} (${q.x}, ${q.z})`;
function check(L) {
  const solids = [...L.pieces, PAD].filter((q) => footprints(q).length), bad = [];
  for (let i = 0; i < solids.length; i++) {
    const a = solids[i];
    for (const poly of footprints(a)) for (const [x, z] of poly) if (a.k !== 'pad' && Math.hypot(x, z) > L.r * 0.85) { bad.push(`${label(a)} reaches past 0.85 r`); break; }
    for (let j = i + 1; j < solids.length; j++) {
      const b = solids[j];
      let d = Infinity;
      for (const P of footprints(a)) for (const Q of footprints(b)) d = Math.min(d, polyDist(P, Q));
      if (a.k === 'stilt' && b.k === 'stilt') continue; // chained: their collars meet
      const row = a.k === 'shop' && b.k === 'shop'; // a row of shops stands wall to wall
      const small = (q) => q.k === 'stall' || q.k === 'bench';
      const need = a.k === 'pad' || b.k === 'pad' ? FLIGHT - PAD.r : row ? 0 : small(a) || small(b) ? 1.5 : 2;
      if (d < need) bad.push(`${label(a)} and ${label(b)}: ${d.toFixed(1)} m apart, want ${need.toFixed(1)}`);
    }
  }
  for (const q of L.pieces) if ((q.k === 'domeA' && !DOME_A.includes(q.r)) || (q.k === 'domeB' && !DOME_B.includes(q.r))) bad.push(`${label(q)}: kepler.glb has no ${q.k} of r ${q.r}`);
  return bad;
}

// ---- the plan, as SVG ----
const FILL = {
  domeA: '#fff4e0', domeB: '#f3eee4', stilt: '#fff4e0', longhouse: '#fff4e0', shop: '#ff9f1c', stall: '#ffd23f', greenhouse: '#9be7ff',
  tank: '#d8d4e8', mast: '#8a87a0', solar: '#1d2f6b', hall: '#fff4e0', pad: '#b8b2cc', bench: '#c9ced8', sign: '#2a2540',
};
function svg(L) {
  const S = 3.2, R = L.r + 14, W = Math.round(2 * R * S), H = W + 150;
  const X = (x) => r1((x + R) * S), Z = (z) => r1((R - z) * S);
  const poly = (pts, fill, stroke = '#2a2540', sw = 1.2, extra = '') => `<polygon points="${pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  const text = (x, z, s, size = 9, fill = '#2a2540', anchor = 'middle') => `<text x="${X(x)}" y="${Z(z)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="Verdana, sans-serif">${s}</text>`;
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`, `<rect width="${W}" height="${H}" fill="#c9c1d8"/>`];
  o.push(`<circle cx="${X(0)}" cy="${Z(0)}" r="${L.r * S}" fill="none" stroke="#8a87a0" stroke-dasharray="6 6"/>`);
  o.push(`<circle cx="${X(0)}" cy="${Z(0)}" r="${L.r * 0.85 * S}" fill="none" stroke="#8a87a0" stroke-dasharray="2 6"/>`);
  const domes = L.pieces.filter((q) => q.k.startsWith('dome'));
  for (const q of L.pieces) {
    if (q.k === 'clear') o.push(poly(rect(q.x0, q.z0, q.x1, q.z1), '#b3adc2', 'none'));
    if (q.k === 'clearing') o.push(`<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="${q.r * S}" fill="#b3adc2"/>`);
    if (q.k === 'path') o.push(`<line x1="${X(q.x)}" y1="${Z(q.z)}" x2="${X(q.x2)}" y2="${Z(q.z2)}" stroke="#b3adc2" stroke-width="${q.w * S}"/>`);
    if (q.k === 'road') o.push(poly(rect(q.x0 - 6, q.z0, q.x1 + 6, q.z1), '#6f6a80', 'none'));
  }
  for (const q of L.pieces) if (q.k === 'link') {
    const a = domes[q.a], b = domes[q.b];
    o.push(`<line x1="${X(a.x)}" y1="${Z(a.z)}" x2="${X(b.x)}" y2="${Z(b.z)}" stroke="#2a2540" stroke-width="${3.4 * S}"/>`, `<line x1="${X(a.x)}" y1="${Z(a.z)}" x2="${X(b.x)}" y2="${Z(b.z)}" stroke="#fff4e0" stroke-width="${2.8 * S}"/>`);
  }
  o.push(`<circle cx="${X(PAD.x)}" cy="${Z(PAD.z)}" r="${FLIGHT * S}" fill="none" stroke="#ff3b5c" stroke-dasharray="3 4"/>`);
  for (const q of [...L.pieces, PAD]) {
    const f = footprints(q);
    if (!f.length) { if (q.k === 'lamp') o.push(`<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="2.2" fill="#fff6a8" stroke="#2a2540" stroke-width="0.8"/>`); continue; }
    if (q.k.startsWith('dome')) {
      o.push(poly(f[1], '#fff4e0'), poly(f[0], q.k === 'domeA' ? '#8a8296' : FILL[q.k]));
      if (q.k === 'domeA') o.push(`<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="${q.r * S}" fill="#fff4e0" stroke="#ff9f1c" stroke-width="2"/>`);
      o.push(text(q.x, q.z - 1, `${q.k === 'domeA' ? 'A' : 'B'} ${q.r}`, 9));
    } else if (q.k === 'hall') {
      o.push(poly(f[0], '#b8b2cc'), `<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="${13.5 * S}" fill="#fff4e0" stroke="#ff9f1c" stroke-width="2"/>`, poly(f[1], '#ff9f1c'), text(q.x, q.z - 1, 'TOWN HALL', 10));
    } else {
      f.forEach((p) => o.push(poly(p, q.k === 'stilt' && q.feature ? '#ff9f1c' : FILL[q.k])));
      if (q.k === 'pad') o.push(text(q.x, q.z - 1, 'PAD', 9));
      if (q.k === 'tank') o.push(text(q.x, q.z + 7, 'WATER', 8));
      if (q.k === 'mast') o.push(text(q.x, q.z + 4.5, 'MAST', 8));
      if (q.k === 'greenhouse') o.push(text(q.x, q.z - 1, 'GH', 8));
      if (q.k === 'solar') o.push(text(q.x, q.z + 3.5, 'SOLAR', 8));
    }
  }
  o.push(text(-R + 4, R - 9, `${L.id === 'civic' ? 'Kepler Civic Center' : `Layout ${L.id}: ${L.name}`}`, 17, '#2a2540', 'start'));
  o.push(`<line x1="${X(R - 60)}" y1="${Z(-R + 8)}" x2="${X(R - 10)}" y2="${Z(-R + 8)}" stroke="#2a2540" stroke-width="2"/>`, text(R - 35, -R + 10.5, '50 m', 10));
  o.push(text(R - 8, R - 9, '+z: sunward', 10, '#55607a', 'end'));
  // legend
  const leg = [['#8a8296', 'Dome A (terraced)'], ['#f3eee4', 'Dome B (geodesic on a drum)'], ['#fff4e0', 'Raised module / longhouse'], ['#ff9f1c', 'Shop; the commons module'],
    ['#ffd23f', 'Market stall'], ['#9be7ff', 'Greenhouse'], ['#b3adc2', 'Cleared ground (no road)'], ['#6f6a80', 'Road (Civic only)']];
  leg.forEach(([c, s], i) => {
    const lx = 14 + (i % 4) * (W / 4), ly = W + 26 + Math.floor(i / 4) * 22;
    o.push(`<rect x="${lx}" y="${ly - 10}" width="14" height="12" fill="${c}" stroke="#2a2540"/>`, `<text x="${lx + 20}" y="${ly}" font-size="11" fill="#2a2540" font-family="Verdana, sans-serif">${s}</text>`);
  });
  o.push(`<text x="14" y="${W + 78}" font-size="11" fill="#55607a" font-family="Verdana, sans-serif">Dashed: the town's radius (${L.r} m) and 0.85 of it. Red: the pad's flight disc. Thick cream lines: tunnels.</text>`);
  const words = L.idea.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    if ((line + ' ' + w).length > W / 6.3) { o.push(`<text x="14" y="${W + 100 + n * 15}" font-size="11" fill="#2a2540" font-family="Verdana, sans-serif">${line}</text>`); line = w; n++; } else line = line ? line + ' ' + w : w;
  }
  o.push(`<text x="14" y="${W + 100 + n * 15}" font-size="11" fill="#2a2540" font-family="Verdana, sans-serif">${line}</text>`, '</svg>');
  return o.join('\n');
}

let fail = 0;
for (const L of LAYOUTS) {
  const bad = check(L);
  const count = (k) => L.pieces.filter((q) => q.k.startsWith(k)).length;
  console.log(`${L.id} ${L.name}: ${count('dome')} domes, ${count('stilt')} modules, ${count('longhouse')} longhouses, ${count('shop')} shops, ${count('stall')} stalls: ${bad.length ? 'FAIL' : 'clear'}`);
  for (const b of bad) console.log('   ' + b);
  fail += bad.length;
}
if (process.argv[2] === 'docs') {
  fs.mkdirSync(OUT, { recursive: true });
  for (const L of LAYOUTS) fs.writeFileSync(path.join(OUT, `layout-${L.id}.svg`), svg(L));
  fs.writeFileSync(path.join(OUT, 'layouts.json'), JSON.stringify({ pad: PAD, layouts: LAYOUTS }, null, 1));
  console.log('wrote', LAYOUTS.length, 'plans and layouts.json to', path.relative(ROOT, OUT));
}
process.exit(fail ? 1 : 0);
