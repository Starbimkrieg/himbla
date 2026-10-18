// Dev-only: the Lucky Crater Casino's forecourt (the boulevard, the car parks, the plaza), today and as proposed in docs/casino-forecourt.md.
//   node tools/casino-forecourt.mjs docs     writes docs/casino-forecourt-current.svg and docs/casino-forecourt-proposed.svg
//   node tools/casino-forecourt.mjs json     prints both layouts as json (the page that shows them reads this)
// Nothing here is read by the game: the "current" plan copies the numbers of settlements.js (dressCasinoLot) and casinoWorld.js, the "proposed" one is the study.
// The frame is the casino's: x across, z out from the doors' wall (the doors' outer face is z 16.4); the boulevard runs along +z to the fountain plaza.
import { writeFileSync } from 'node:fs';
import { FRONT_OUT, HALL } from '../src/casinoPlan.js';

const FZ = 98, PR = 17;                                   // the plaza: its centre and radius
const rect = (id, x0, x1, z0, z1, cls, extra = {}) => ({ id, s: { k: 'r', x0, x1, z0, z1 }, cls, ...extra });
const circ = (id, x, z, r, cls, extra = {}) => ({ id, s: { k: 'c', x, z, r }, cls, ...extra });

// ---- today ----
const current = () => {
  const L = { name: 'Today', asphalt: [], paving: [], items: [], lamps: [], bays: [], barrier: [], notes: [] };
  L.asphalt.push({ k: 'poly', pts: [[-6.5, FRONT_OUT], [6.5, FRONT_OUT], [7.5, 44], [-7.5, 44]] }, { k: 'r', x0: -7, x1: 7, z0: 44, z1: FZ - PR + 3 });
  for (const s of [-1, 1]) {
    const cx = s * 52, cz = 70;
    L.asphalt.push({ k: 'r', x0: cx - 22, x1: cx + 22, z0: cz - 17, z1: cz + 17 });
    L.barrier.push({ k: 'r', x0: cx - 22, x1: cx + 22, z0: cz - 18.9, z1: cz - 17.7 }, { k: 'r', x0: cx - 22, x1: cx + 22, z0: cz + 17.7, z1: cz + 18.9 }, { k: 'r', x0: cx + s * 22.7, x1: cx + s * 24.1, z0: cz - 19, z1: cz + 19 });
    for (let row of [-1, 1]) for (let i = 0; i < 8; i++) L.bays.push({ x: cx - 22 + 4 + i * 4.5 + 2.25, z: cz + row * 9 - row * 0.2, w: 4.5, d: 6, taken: (i * 3 + (s > 0 ? 1 : 0) + (row > 0 ? 2 : 0)) % 4 !== 0 });
    L.items.push(rect('P sign', cx - s * 22 - s * 1.5, cx - s * 22 - s * 0.9, 76, 77.2, 'prop'));
    for (const lz of [cz - 4, cz + 4]) L.lamps.push({ x: cx + s * 20.5, z: lz, sc: 0.5, kind: 'stock' });
  }
  L.paving.push({ k: 'c', x: 0, z: FZ, r: PR });
  L.items.push(circ('Fountain', 0, FZ, 5.5, 'game'));
  for (const s of [-1, 1]) {
    L.items.push(circ('Slot carousel', s * 19.5, 40, 7.6, 'ext'));
    L.items.push(circ('Chip stack', s * 14, FRONT_OUT + 5, 1.7, 'ext'), circ('Chip stack', s * 27, s < 0 ? 44 : 46, 1.7, 'ext'));
    for (let i = 0; i < 3; i++) L.lamps.push({ x: s * 8.5, z: 50 + i * 11, sc: 0.92, kind: 'post' });
  }
  L.carpet = { x0: -3, x1: 3, z0: FRONT_OUT, z1: FRONT_OUT + 36 };
  L.notes = ['The boulevard is asphalt the whole way, 65 m of it, to the fountain.', 'Two lots stand 22 m clear of it at x 30..74, edged in hedge.', 'Lot lamps are the old thin poles; the boulevard ones are the neon posts.'];
  return L;
};

// ---- proposed (as built: settlements.js dressCasinoLot, casinoWorld.js, models/lot.glb) ----
const proposed = () => {
  const L = { name: 'The Valet Court', asphalt: [], paving: [], items: [], lamps: [], bays: [], barrier: [], bollards: [], roads: [], notes: [] };
  const AV = 8.6, W0 = 38.4, W1 = 58.4, MID = (W0 + W1) / 2, MOD = 2.4, NMOD = 14, XA = AV + 0.36, XB = XA + 0.72 + NMOD * MOD;
  const BX0 = 11, BAYW = 5.2, NB = 6, BAYD = 6.2;
  const bayZ = [W0 + 1.0 + BAYD / 2, W1 - 1.0 - BAYD / 2];  // the two rows' middles
  L.asphalt.push({ k: 'poly', pts: [[-AV, FRONT_OUT], [AV, FRONT_OUT], [AV, W1], [-AV, W1]] });
  for (const s of [-1, 1]) {
    L.asphalt.push({ k: 'r', x0: Math.min(s * AV, s * (XB + 0.36)), x1: Math.max(s * AV, s * (XB + 0.36)), z0: W0, z1: W1 });
    L.roads.push({ x0: Math.min(s * (XB - 4), s * 140), x1: Math.max(s * (XB - 4), s * 140), z0: MID - 9, z1: MID + 9 });
    for (const [row, rz] of bayZ.entries()) for (let i = 0; i < NB; i++) {
      L.bays.push({ x: s * (BX0 + (i + 0.5) * BAYW), z: rz, w: BAYW, d: BAYD, taken: (i * 5 + (row === 0 ? 1 : 3) + (s > 0 ? 2 : 0)) % 4 !== 0 });
    }
    // the card wall: the north and south runs between their posts, the outer end's two stubs either side of the aisle's mouth (the posts are 0.72 m square, the wall 0.6 thick)
    const run = (x0, x1, z0, z1) => ({ k: 'r', x0: Math.min(s * x0, s * x1), x1: Math.max(s * x0, s * x1), z0, z1 });
    L.barrier.push(run(XA - 0.36, XB + 0.36, W0, W0 + 0.6), run(XA - 0.36, XB + 0.36, W1 - 0.6, W1));
    const stub = W0 + 0.3 + 0.36 + 2 * MOD + 0.72;
    L.barrier.push(run(XB - 0.3, XB + 0.3, W0, stub), run(XB - 0.3, XB + 0.3, W0 + W1 - stub, W1));
    for (const x of [AV + 1.2, XB + 1.1]) L.lamps.push({ x: s * x, z: W0 - 1.2, sc: 0.92, kind: 'post' });
    L.lamps.push({ x: s * (XB + 1.1), z: W1 + 1.2, sc: 0.92, kind: 'post' }, { x: s * 7.4, z: W1 + 2, sc: 0.92, kind: 'post' });
    for (const dz of [-6.4, 6.4]) L.items.push(rect('P pylon', s * (XB + 2.4) - 0.5, s * (XB + 2.4) + 0.5, MID + dz - 0.5, MID + dz + 0.5, 'prop'));
    L.items.push(circ('Slot carousel', s * 19.5, FRONT_OUT + 11.6, 7.6, 'ext'));
    L.items.push(circ('Chip stack', s * 11, FRONT_OUT + 4.2, 1.7, 'ext'), circ('Chip stack', s * 49, 64, 1.7, 'ext'));
  }
  // the walkway: from the court's edge to the plaza, paved, the carpet running on down its middle
  L.paving.push({ k: 'r', x0: -5.2, x1: 5.2, z0: W1, z1: FZ - PR + 1 }, { k: 'c', x: 0, z: FZ, r: PR });
  L.crossing = { x0: -AV, x1: AV, z0: W1 - 2, z1: W1 };
  for (const s of [-1, 1]) for (let z = W1 + 2; z < FZ - PR; z += 3) L.bollards.push({ x: s * 5.6, z });
  L.items.push(circ('Fountain', 0, FZ, 5.5, 'game'));
  L.carpet = { x0: -3, x1: 3, z0: FRONT_OUT, z1: FZ - PR + 1 };
  L.notes = [
    'The asphalt ends halfway: the central court runs from the doors to z 58.4 (the fountain is at 98, the doors at 16.4: the middle is 57).',
    'A 10 m paved walkway takes over for the last 24 m to the plaza, the red carpet running on down its middle.',
    'The two outer lots become wings of the one court: 24 bays of 5.2 x 6.2 m (it was 32), either side of a 5.6 m aisle that is open at each outer end, and a road runs out of each end to the ring road.',
    'Hedges are gone: a card wall (giant cards dominoed on a plum and gold kerb) edges the court; chip-stack bollards edge the walkway.',
    'Every lamp is the casino neon post (eight, one at each corner of the court and one each side where the walkway starts); the old thin poles are gone.',
    'The slot carousels moved 12 m toward the doors so the wings can sit behind them.',
  ];
  return L;
};

// ---- checks (the proposal only) ----
const shapeBox = (s) => (s.k === 'r' ? s : { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r });
const gap = (a, b) => {                                    // distance between two shapes (negative: they overlap)
  if (a.k === 'c' && b.k === 'c') return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.k === 'c' || b.k === 'c') {
    const c = a.k === 'c' ? a : b, r = a.k === 'c' ? b : a;
    const dx = Math.max(r.x0 - c.x, 0, c.x - r.x1), dz = Math.max(r.z0 - c.z, 0, c.z - r.z1);
    if (dx === 0 && dz === 0) return -Math.min(c.x - r.x0, r.x1 - c.x, c.z - r.z0, r.z1 - c.z) - c.r;
    return Math.hypot(dx, dz) - c.r;
  }
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1), dz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
};
export function check(L) {
  const issues = [], solids = [];
  for (const it of L.items) solids.push({ id: it.id, s: it.s });
  for (const l of L.lamps) solids.push({ id: 'Lamp post', s: { k: 'c', x: l.x, z: l.z, r: 0.7 * l.sc } });
  for (const b of L.bays) solids.push({ id: 'Bay', s: { k: 'r', x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, bay: true });
  for (const b of L.barrier) solids.push({ id: 'Card wall', s: b, wall: true });
  let tight = 1e9, tightPair = '';
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (a.bay && b.bay) continue;
    if ((a.wall && b.wall) || (a.id === 'Lamp post' && b.wall) || (b.id === 'Lamp post' && a.wall)) continue;   // (lamps stand in the wall's line, in place of a card)
    const g = gap(a.s, b.s);
    const need = a.id === 'Bay' || b.id === 'Bay' ? 0.3 : 1.5;   // (a bay is paint: the cars in it stand a hand's breadth inside)
    if (g < need) issues.push(`${a.id} / ${b.id}: ${g.toFixed(2)} m (needs ${need})`);
    else if (g < tight) { tight = g; tightPair = `${a.id} / ${b.id}`; }
  }
  const road = L.asphalt.filter((a) => a.k === 'r');
  for (const w of L.items.filter((i) => i.id === 'Slot carousel')) for (const r of road) { const g = gap(w.s, r); if (g < 1.5 && g > -50) issues.push(`Carousel / asphalt: ${g.toFixed(2)} m`); }
  return { issues, tight: tight === 1e9 ? null : `${tightPair} ${tight.toFixed(2)} m` };
}

// ---- drawing ----
const PXM = 7, X0 = -80, Z0 = -2, W = 160, H = 126;
const px = (x) => ((x - X0) * PXM).toFixed(1), pz = (z) => ((z - Z0) * PXM).toFixed(1), len = (m) => (m * PXM).toFixed(1);
const C = { ground: '#2a2442', gridl: '#3b3459', asphalt: '#4a4060', paving: '#8a6fb0', gold: '#ffd23f', carpet: '#d7263d', game: '#ff2e88', ext: '#2ee6ff', prop: '#ffd23f', hall: '#5a1a8f', wall: '#7a2fb0', hedge: '#2f6b3a', card: '#fff4e0', lamp: '#fff6a8', bay: '#c9c3d9', car: '#7dff6a' };
const sh = (s, fill, extra = '') => (s.k === 'r' ? `<rect x="${px(s.x0)}" y="${pz(s.z0)}" width="${len(s.x1 - s.x0)}" height="${len(s.z1 - s.z0)}" fill="${fill}" ${extra}/>` : s.k === 'c' ? `<circle cx="${px(s.x)}" cy="${pz(s.z)}" r="${len(s.r)}" fill="${fill}" ${extra}/>` : `<polygon points="${s.pts.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="${fill}" ${extra}/>`);
export function svg(L, proposed) {
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * PXM} ${H * PXM}" font-family="ui-monospace,Menlo,monospace">`, `<rect width="100%" height="100%" fill="${C.ground}"/>`];
  for (let x = -80; x <= 80; x += 10) o.push(`<line x1="${px(x)}" y1="0" x2="${px(x)}" y2="${H * PXM}" stroke="${C.gridl}" stroke-width="${x === 0 ? 1.4 : 0.6}"/>`);
  for (let z = 0; z <= 124; z += 10) o.push(`<line x1="0" y1="${pz(z)}" x2="${W * PXM}" y2="${pz(z)}" stroke="${C.gridl}" stroke-width="0.6"/><text x="6" y="${(+pz(z) - 3).toFixed(1)}" fill="#8c84b0" font-size="11">z ${z}</text>`);
  // the casino's front: the hall's wings behind the doors' wall
  o.push(sh({ k: 'r', x0: -HALL.WING.x1 - 2.4, x1: HALL.WING.x1 + 2.4, z0: -2, z1: 0 }, 'none'));
  o.push(sh({ k: 'r', x0: -57.4, x1: 57.4, z0: 0, z1: 16.4 }, C.hall, 'opacity="0.55"'));
  o.push(sh({ k: 'r', x0: -9, x1: 9, z0: 0, z1: 16.4 }, C.wall, 'opacity="0.9"'));
  o.push(sh({ k: 'r', x0: -6, x1: 6, z0: 14, z1: 16.4 }, C.ground));
  for (const r of L.roads || []) o.push(sh({ k: 'r', ...r }, '#6b6580', 'opacity="0.85"'));
  for (const a of L.asphalt) o.push(sh(a, C.asphalt));
  for (const a of L.paving) o.push(sh(a, C.paving, 'opacity="0.9"'));
  if (L.crossing) for (let i = 0; i < 9; i++) o.push(sh({ k: 'r', x0: -8.6 + i * 1.9 + 0.2, x1: -8.6 + i * 1.9 + 1.3, z0: L.crossing.z0, z1: L.crossing.z1 }, i % 2 ? C.gold : '#2a1450'));
  if (L.carpet) o.push(sh({ k: 'r', ...L.carpet }, C.carpet));
  for (const b of L.bays) { o.push(sh({ k: 'r', x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, 'none', `stroke="${C.bay}" stroke-width="0.8" opacity="0.6"`)); if (b.taken) o.push(sh({ k: 'r', x0: b.x - 1.5, x1: b.x + 1.5, z0: b.z - 2.2, z1: b.z + 2.2 }, C.car, 'opacity="0.75" rx="6"')); }
  for (const b of L.barrier) o.push(sh(b, proposed ? C.card : C.hedge));
  for (const b of L.bollards || []) o.push(sh({ k: 'c', x: b.x, z: b.z, r: 0.45 }, C.gold));
  for (const it of L.items) o.push(sh(it.s, C[it.cls] || '#fff', `opacity="${it.cls === 'ext' ? 0.55 : 0.8}" stroke="#120a1e" stroke-width="1"`));
  for (const l of L.lamps) o.push(sh({ k: 'c', x: l.x, z: l.z, r: l.kind === 'stock' ? 0.35 : 0.7 }, l.kind === 'stock' ? '#9a93b8' : C.lamp, 'stroke="#120a1e" stroke-width="1"'));
  const label = (t, x, z, anchor = 'middle', size = 11) => `<text x="${px(x)}" y="${pz(z)}" fill="#f3efff" font-size="${size}" text-anchor="${anchor}" paint-order="stroke" stroke="#120a1e" stroke-width="3">${t}</text>`;
  o.push(label('CASINO', 0, 8.5, 'middle', 13), label('doors', 0, 16, 'middle', 10), label('FOUNTAIN PLAZA', 0, FZ + PR + 4, 'middle', 12));
  const seen = new Set();
  for (const it of L.items) if (it.cls === 'ext' && it.id === 'Slot carousel' && !seen.has(it.s.x)) { seen.add(it.s.x); o.push(label('slot carousel', it.s.x, it.s.z + 0.5, 'middle', 10)); }
  if (proposed) { o.push(label('CENTRAL COURT', 0, 40, 'middle', 12), label('WALKWAY', 0, 70, 'middle', 12), label('WEST WING', -25, 49, 'middle', 11), label('EAST WING', 25, 49, 'middle', 11)); }
  else { o.push(label('BOULEVARD', 0, 62, 'middle', 12), label('WEST LOT', -52, 70, 'middle', 12), label('EAST LOT', 52, 70, 'middle', 12)); }
  o.push('</svg>');
  return o.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cur = current(), pro = proposed();
  const mode = process.argv[2];
  if (mode === 'docs') {
    writeFileSync(new URL('../docs/casino-forecourt-current.svg', import.meta.url), svg(cur, false));
    writeFileSync(new URL('../docs/casino-forecourt-proposed.svg', import.meta.url), svg(pro, true));
    console.log('wrote docs/casino-forecourt-{current,proposed}.svg');
  } else if (mode === 'json') console.log(JSON.stringify({ current: cur, proposed: pro }));
  const r = check(pro);
  console.log(`Proposed: ${pro.bays.length} bays, ${pro.bays.filter((b) => b.taken).length} cars, ${pro.lamps.length} lamp posts, ${pro.bollards.length} bollards`);
  console.log(r.issues.length ? r.issues.map((i) => '  PROBLEM  ' + i).join('\n') : '  clear: every check holds');
  console.log('  tightest:', r.tight);
  process.exitCode = r.issues.length ? 1 : 0;
}
