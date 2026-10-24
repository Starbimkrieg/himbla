// Meridian Exchange layout study (docs/meridian-layouts.md): each layout is a list of footprints in the settlement frame
// (+x right, +z up / "north", metres). `node tools/meridian-layouts.mjs` checks every layout (footprints 4 m apart, 6 m
// off the turrets, inside loc.r, podium spot clear); `node tools/meridian-layouts.mjs docs` also writes the SVG plans there.
import { writeFileSync } from 'node:fs';

const LOC_R = 150, RING = 182; // loc.r and the ring road centreline (RING_GAP 32)
const deg = (a) => (a * Math.PI) / 180;
// world.js defensePylons: 4 turrets at angle 0.2 + i*pi/2 on r 125
const TURRETS = [0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2 + 0.2; return { x: Math.cos(a) * 125, z: Math.sin(a) * 125, r: 4 }; });
// settlements.js GARAGE_AT: angle 236 deg, r 128, long axis along the ring's tangent, bays facing out
const GA = { x: Math.cos(deg(236)) * 128, z: Math.sin(deg(236)) * 128, a: deg(236) };

// kinds: box {x,z,w,d,rot?} (w along x before rot, d along z), circle {x,z,r}
const box = (id, x, z, w, d, o = {}) => ({ kind: 'box', id, x, z, w, d, ...o });
const circ = (id, x, z, r, o = {}) => ({ kind: 'circle', id, x, z, r, ...o });
// main garage: hall 38x20, office end (x to +25.5) and tank yard (x to -25) as one rotated 52x20 box
const mainGarage = () => box('main garage (fixed)', GA.x, GA.z, 52, 21, { rot: -(deg(236) - Math.PI / 2), cls: 'fixed' });
const tower = (x, z, doorDeg) => [circ('trading tower', x, z, 22.5, { cls: 'tower' }), box('portico + steps', x + Math.sin(deg(doorDeg)) * 22, z + Math.cos(deg(doorDeg)) * 22, 24, 11, { rot: -deg(doorDeg), cls: 'tower', soft: true })];
const dome = (x, z) => circ('lab dome', x, z, 23, { cls: 'dome' });
const smallGarage = (id, x, z, faceDeg) => box(id, x, z, 33, 17.5, { rot: -deg(faceDeg), cls: 'garage' });
const pad = (id, x, z, r) => circ(id, x, z, r, { cls: 'pad' });
const crane = (id, x, z) => circ(id, x, z, 3, { cls: 'crane', jib: 30 });
const mast = (id, x, z) => circ(id, x, z, 1.2, { cls: 'mast' });

const current = {
  name: 'Current', items: [
    ...tower(0, -42, 0), dome(0, 60), circ('plaza + fountain', 0, 6, 10.5, { cls: 'plaza' }),
    mainGarage(), smallGarage('small garage NW', -60.8, 60.8, 225), smallGarage('small garage SE', 60.8, -60.8, 45),
    box('container yard', -5, -100, 62, 30, { cls: 'yard' }), crane('tower crane W', -78, 6), crane('tower crane E', 78, -6),
    pad('shuttle pad (spare)', 94, 98, 12), pad('pad (spare)', -100, -60, 16),
    mast('flood', 30, -84), mast('flood', -40, -84), circ('gate sign', 0, 120, 1, { cls: 'sign' }), circ('flag', 0, 110, 0.5, { cls: 'sign' }),
  ],
};

const bourse = {
  name: 'A: The Bourse', items: [
    ...tower(0, -24, 0), circ('plaza + fountain', 0, 34, 12, { cls: 'plaza' }),
    box('the avenue', 0, 97, 18, 106, { cls: 'road', soft: true }),
    dome(-58, 40), box('trade hall (new)', 64, 24, 24, 56, { cls: 'hall' }),
    mainGarage(),
    box('container yard', 0, -97, 70, 30, { cls: 'yard' }), crane('tower crane W', -54, -72), crane('tower crane E', 62, -78),
    pad('shuttle pad (spare)', -96, 96, 14), pad('pad (spare, mirrors the shuttle pad)', 96, 96, 14),
    mast('flood', 40, -124), mast('flood', -44, -118), circ('gate arch + sign', 0, 140, 1, { cls: 'sign' }), circ('flags', 18, 110, 0.5, { cls: 'sign' }), circ('flags', -18, 110, 0.5, { cls: 'sign' }),
    circ("leader's podium (findSpot)", 38, 67, 3.5, { cls: 'podium' }),
  ],
};

const freeport = {
  name: 'B: Freeport', items: [
    ...tower(-66, 40, 90), circ('plaza + fountain', 0, 36, 12, { cls: 'plaza' }),
    box('the spine', 0, -12, 240, 14, { cls: 'road', soft: true }),
    dome(70, 52),
    mainGarage(),
    box('container yard', 0, -62, 96, 34, { cls: 'yard' }), crane('tower crane W', -28, -100), crane('tower crane E', 64, -60),
    pad('shuttle pad (spare)', -96, 96, 14), pad('pad (spare, mirrors the shuttle pad)', 96, 96, 14),
    mast('flood', -58, -62), mast('flood', 74, -86), circ('gate sign', 0, 120, 1, { cls: 'sign' }), circ('flag', 0, 110, 0.5, { cls: 'sign' }),
    circ("leader's podium (findSpot)", 38, 67, 3.5, { cls: 'podium' }),
  ],
};

// ---- clearance check: items as polygons (boxes) or circles ----
const corners = (b) => { const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [b.x + (u * b.w / 2) * c - (v * b.d / 2) * s, b.z + (u * b.w / 2) * s + (v * b.d / 2) * c]); };
const distPtSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const inPoly = (p, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside; } return inside; };
const distPtPoly = (p, poly) => inPoly(p, poly) ? -1 : Math.min(...poly.map((a, i) => distPtSeg(p, a, poly[(i + 1) % poly.length])));
function sep(a, b) {
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.kind === 'box' && b.kind === 'circle') return distPtPoly([b.x, b.z], corners(a)) - b.r;
  if (a.kind === 'circle') return sep(b, a);
  const A = corners(a), B = corners(b);
  let d = Infinity;
  for (const p of A) d = Math.min(d, distPtPoly(p, B));
  for (const p of B) d = Math.min(d, distPtPoly(p, A));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) d = Math.min(d, distPtSeg(A[i], B[j], B[(j + 1) % 4]), distPtSeg(B[j], A[i], A[(i + 1) % 4]));
  return d;
}
function check(L) {
  const out = [];
  const hard = L.items.filter((i) => !i.soft);
  for (let i = 0; i < hard.length; i++) for (let j = i + 1; j < hard.length; j++) {
    const d = sep(hard[i], hard[j]);
    if (d < 4) out.push(`  ${d < 0 ? 'OVERLAP' : 'tight  '} ${d.toFixed(1).padStart(6)} m  ${hard[i].id}  <->  ${hard[j].id}`);
  }
  for (const it of hard) for (const t of TURRETS) { const d = sep(it, { kind: 'circle', ...t }); if (d < 6) out.push(`  ${d < 0 ? 'OVERLAP' : 'tight  '} ${d.toFixed(1).padStart(6)} m  ${it.id}  <->  turret (${t.x.toFixed(0)}, ${t.z.toFixed(0)})`); }
  for (const it of hard) { const ext = it.kind === 'circle' ? Math.hypot(it.x, it.z) + it.r : Math.max(...corners(it).map(([x, z]) => Math.hypot(x, z))); if (ext > LOC_R) out.push(`  outside loc.r by ${(ext - LOC_R).toFixed(1)} m: ${it.id}`); }
  // podium: story.findSpot wants no collider within 8 m of its first candidate (38, 67), else it moves on
  const pod = L.items.find((i) => i.cls === 'podium');
  if (pod) for (const it of hard) if (it !== pod && !it.soft) { const d = sep({ kind: 'circle', x: pod.x, z: pod.z, r: 0 }, it); if (d < 8) out.push(`  podium candidate (38,67) blocked (${d.toFixed(1)} m) by ${it.id}: findSpot moves it`); }
  console.log(`${L.name}:\n${out.length ? out.join('\n') : '  all clear (>= 4 m between footprints, >= 6 m to turrets, inside loc.r)'}`);
}

// ---- SVG plan ----
const S = 1.0, W = 420, H = 446, cx = W / 2, cz = 228;
const X = (x) => (cx + x * S).toFixed(1), Z = (z) => (cz - z * S).toFixed(1);
const FILL = { tower: '#2ec4ff', dome: '#9be7ff', plaza: '#d8d4e8', garage: '#8a8aa0', fixed: '#8a8aa0', yard: '#6b6880', hall: '#ff9f1c', pad: '#4a4660', crane: '#ffd23f', mast: '#ffd23f', road: '#2a2a38', sign: '#2ec4ff', podium: '#ff3b5c' };
function svg(L, caption) {
  const e = [];
  e.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${L.name}: plan of the Meridian Exchange, ${caption}">`);
  e.push(`<style>text{font:10px ui-monospace,Menlo,monospace;fill:#eef}.t{font-size:12px;font-weight:bold}.k{fill:#9aa}</style>`);
  e.push(`<rect width="${W}" height="${H}" fill="#14121c"/>`);
  e.push(`<text x="8" y="16" class="t">${L.name}</text><text x="8" y="29" class="k">${caption}</text>`);
  e.push(`<circle cx="${X(0)}" cy="${Z(0)}" r="${RING * S}" fill="none" stroke="#5a5870" stroke-width="3" stroke-dasharray="8 6"/>`);
  e.push(`<text x="${X(0)}" y="${Z(-RING - 6)}" text-anchor="middle" class="k">ring road (r 182)</text>`);
  e.push(`<circle cx="${X(0)}" cy="${Z(0)}" r="${LOC_R * S}" fill="none" stroke="#3a3850" stroke-width="1"/>`);
  e.push(`<text x="${X(0)}" y="${Z(LOC_R + 4)}" text-anchor="middle" class="k">loc.r 150 (+z, "north")</text>`);
  for (const t of TURRETS) e.push(`<circle cx="${X(t.x)}" cy="${Z(t.z)}" r="4" fill="#ff3b5c"/>`);
  for (const it of L.items) {
    const f = FILL[it.cls] || '#ccc', op = it.soft ? 0.35 : 0.85;
    if (it.kind === 'circle') {
      e.push(`<circle cx="${X(it.x)}" cy="${Z(it.z)}" r="${(it.r * S).toFixed(1)}" fill="${f}" fill-opacity="${op}" stroke="#eef" stroke-width="0.6"/>`);
      if (it.jib) e.push(`<circle cx="${X(it.x)}" cy="${Z(it.z)}" r="${it.jib * S}" fill="none" stroke="${f}" stroke-width="0.8" stroke-dasharray="3 3"/>`);
    } else {
      const pts = corners(it).map(([x, z]) => `${X(x)},${Z(z)}`).join(' ');
      e.push(`<polygon points="${pts}" fill="${f}" fill-opacity="${op}" stroke="#eef" stroke-width="0.6"/>`);
    }
    if (it.cls !== 'mast' && it.cls !== 'sign' || it.id.includes('sign') || it.id.includes('arch')) {
      const lab = it.id.replace(/ \(.*\)$/, '').replace('small garage', 'garage').replace('tower crane', 'crane').replace("leader's podium", 'podium');
      if (!['flood', 'flags', 'flag', 'portico + steps'].includes(lab)) e.push(`<text x="${X(it.x)}" y="${(+Z(it.z) + 3.5).toFixed(1)}" text-anchor="middle">${lab}</text>`);
    }
  }
  e.push(`<text x="${W - 8}" y="${H - 8}" text-anchor="end" class="k">red: turrets (r 125) · dashed: jib reach · 1 px = 1 m</text>`);
  e.push('</svg>');
  return e.join('\n');
}

for (const L of [current, bourse, freeport]) check(L);
const out = process.argv[2];
if (out) {
  writeFileSync(`${out}/meridian-layout-current.svg`, svg(current, 'as built today (settlements.js buildMeridian)'));
  writeFileSync(`${out}/meridian-layout-a.svg`, svg(bourse, 'civic: tower on the axis, avenue to the gate, freight behind'));
  writeFileSync(`${out}/meridian-layout-b.svg`, svg(freeport, 'industrial: a freight spine splits port (south) from campus (north)'));
  console.log('wrote 3 svgs to', out);
}
