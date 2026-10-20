#!/usr/bin/env node
// Plays the Zero-G claw (src/clawSim.js) with bots of four skill levels and prints their take against the entry price,
// for tuning item values, combo and jackpot (average bots should about break even, the best clear the entry, a bad round
// still pay something).
//
//   node tools/check-claw.mjs                 200 rounds of each bot
//   node tools/check-claw.mjs 500 expert      500 rounds of the expert only
//
// Bots only know what a player sees, and are simpler than a person (none throws a mine at a lockbox on purpose).
import { ClawSim, KINDS, CLAW_COST, CLAW_TIME, DROP, HOLD_CAP } from '../src/clawSim.js';
import { mulberry32, clamp } from '../src/rng.js';

const SKILLS = {
  // vmax: claw speed; think: s of dithering before a grab; noise: stick wander; hold: how steadily it keeps the beam on
  novice:  { vmax: 2.4, think: 1.6, noise: 0.9, pick: 'near', mines: 0.3, multi: false, hold: 0.8 },   // grabs what's close, wobbles, lets go early, takes mines
  average: { vmax: 3.0, think: 0.9, noise: 0.4, pick: 'value', mines: 0, multi: false, hold: 0.95 },
  skilled: { vmax: 3.8, think: 0.45, noise: 0.15, pick: 'value', mines: 0, multi: true, hold: 1 },
  expert:  { vmax: 4.6, think: 0.2, noise: 0.05, pick: 'value', mines: 0, multi: true, hold: 1 },
};

const WHY = {};
function playRound(seed, S, rng) {
  const sim = new ClawSim(seed);
  sim.start();
  const c = sim.claw;
  let mode = 'seek', target = null, tmr = 0, wobX = 0, wobZ = 0, lastMode = '';
  const dt = 1 / 30;
  const stats = { banked: 0, mines: 0, chipBanked: false, booms: 0, opens: 0, chipLoose: false, chipPay: 0 };
  const hover = (tx, ty, tz) => {
    const k = 2.6;
    const des = (e) => clamp(e * k, -S.vmax, S.vmax);
    const ex = des(tx + wobX - c.x), ey = des(ty - c.y), ez = des(tz + wobZ - c.z);
    return { mx: clamp((ex - c.vx) / 0.3 / 18, -1, 1), my: clamp((ey - c.vy) / 0.3 / 14, -1, 1), mz: clamp((ez - c.vz) / 0.3 / 18, -1, 1) };
  };
  const free = () => sim.items.filter((i) => i.st === 'free');
  const score = (it) => {
    const K = KINDS[it.kind];
    if (K.mine && rng() > S.mines) return -1;
    if (K.lock && S.pick === 'value') return -1;              // a closed lockbox is too heavy for 70 credits
    const d = Math.hypot(it.x - c.x, it.z - c.z, (it.y - c.y) * 0.5);
    if (S.pick === 'near') return 10 - d + rng() * 3;
    const dd = Math.hypot(it.x - DROP.x, it.z - DROP.z);
    const t = d / S.vmax + dd / S.vmax + 2.2 + K.w * 0.6;
    return K.value / t;
  };
  for (let step = 0; step < CLAW_TIME * 30 + 30 && sim.state === 'play'; step++) {
    tmr -= dt;
    wobX += (rng() - 0.5) * S.noise * 0.6 - wobX * 3 * dt; wobZ += (rng() - 0.5) * S.noise * 0.4 - wobZ * 3 * dt;
    const held = sim.holding;
    let input = { mx: 0, my: 0, mz: 0, beam: held.length > 0 };
    if (c.stun > 0) { sim.update(dt, input); continue; }
    if (mode === 'seek') {
      if (held.length && (!S.multi || sim.heldWeight >= HOLD_CAP - 0.5)) mode = 'carry';
      else {
        let best = null, bs = 0;
        for (const it of free()) { const sc = score(it); if (sc > bs && sim.heldWeight + KINDS[it.kind].w <= HOLD_CAP) { bs = sc; best = it; } }
        if (!best) mode = held.length ? 'carry' : 'wait';
        else if (S.multi && held.length && Math.hypot(best.x - c.x, best.y - c.y, best.z - c.z) > 2.6) mode = 'carry';
        else { target = best; mode = 'approach'; tmr = S.think * (0.6 + rng() * 0.8); }
      }
    }
    if (mode === 'wait') { input = { ...hover(c.x, 5.5, c.z), beam: false }; tmr = tmr > 0 ? tmr : 1; if (rng() < 0.05) mode = 'seek'; }
    else if (mode === 'approach') {
      if (!target || target.st !== 'free') mode = 'seek';
      else {
        input = { ...hover(target.x, target.y + 2.3, target.z), beam: held.length > 0 };
        if (tmr < 0 && Math.hypot(target.x - c.x, target.z - c.z) < 0.45 && Math.hypot(c.vx, c.vz) < 1.2) { mode = 'grab'; tmr = 3.2; }
      }
    } else if (mode === 'grab') {
      if (!target || target.st === 'out' || target.st === 'held') mode = 'seek';
      else {
        input = { ...hover(target.x, Math.min(c.y, target.y + 1.9), target.z), beam: true };
        if (rng() > S.hold ** (1 / 30)) { mode = 'seek'; input.beam = false; }
        if (tmr < 0) mode = 'seek';
      }
    } else if (mode === 'carry') {
      if (!held.length) mode = 'seek';
      else {
        input = { ...hover(DROP.x, 3.7, DROP.z), beam: true };
        if (Math.hypot(DROP.x - c.x, DROP.z - c.z) < 0.5 && Math.hypot(c.vx, c.vz) < 1.4) { mode = 'release'; tmr = 1.8; }
      }
    } else if (mode === 'release') {
      input = { ...hover(DROP.x, 3.8, DROP.z), beam: false };
      if (tmr < 0 || (!sim.holding.length && free().every((i) => !(i.rel > 0)))) mode = 'seek';
    }
    if (input.beam && c.energy < 0.03) input.beam = false;
    if (process.env.CLAW_TRACE && mode !== lastMode) { console.log((CLAW_TIME - sim.timeLeft).toFixed(1), mode, target ? target.kind + '#' + target.id + ' st=' + target.st : '', 'held', held.length, 'claw', c.x.toFixed(1), c.y.toFixed(1), c.z.toFixed(1)); lastMode = mode; }
    sim.update(dt, input);
    for (const e of sim.events) { if (e.type === 'bank') { stats.banked++; if (e.value < 0) stats.mines++; if (e.item.kind === 'chip') { stats.chipBanked = true; stats.chipPay += e.value; } } else if (e.type === 'fuse') { WHY[e.why] = (WHY[e.why] || 0) + 1; } else if (e.type === 'boom') stats.booms++; else if (e.type === 'open') { stats.opens++; if (e.jackpot) stats.chipLoose = true; } }
    sim.events.length = 0;
  }
  return { pay: sim.payout, ...stats };
}

const rounds = parseInt(process.argv[2] || '200', 10) || 200;
const only = process.argv[3];
console.log(`entry ₵${CLAW_COST}, ${CLAW_TIME} s, ${rounds} rounds each\n`);
console.log('bot      mean  ratio  p10  p50  p90  max   <entry  >=2x  jackpot  banks/round  mines/round  booms  opens  chip freed  mean w/o chip');
for (const [name, S] of Object.entries(SKILLS)) {
  if (only && only !== name) continue;
  const rng = mulberry32(777 + name.length);
  const res = [];
  for (let i = 0; i < rounds; i++) res.push(playRound(1000 + i * 7 + name.length, S, rng));
  const pays = res.map((r) => r.pay).sort((a, b) => a - b);
  const mean = pays.reduce((a, b) => a + b, 0) / pays.length, q = (p) => pays[Math.min(pays.length - 1, Math.floor(p * pays.length))];
  const f = (n, w) => String(Math.round(n)).padStart(w);
  console.log(`${name.padEnd(8)} ${f(mean, 5)} ${(mean / CLAW_COST).toFixed(2).padStart(5)} ${f(q(0.1), 4)} ${f(q(0.5), 4)} ${f(q(0.9), 4)} ${f(pays[pays.length - 1], 5)}  ${(pays.filter((p) => p < CLAW_COST).length / pays.length * 100).toFixed(0).padStart(5)}% ${(pays.filter((p) => p >= 2 * CLAW_COST).length / pays.length * 100).toFixed(0).padStart(4)}% ${(res.filter((r) => r.chipBanked).length / res.length * 100).toFixed(0).padStart(6)}%   ${(res.reduce((a, r) => a + r.banked, 0) / res.length).toFixed(1).padStart(8)}  ${(res.reduce((a, r) => a + r.mines, 0) / res.length).toFixed(2).padStart(10)}  ${(res.reduce((a, r) => a + r.booms, 0) / res.length).toFixed(1).padStart(5)} ${(res.reduce((a, r) => a + r.opens, 0) / res.length).toFixed(1).padStart(6)} ${(res.filter((r) => r.chipLoose).length / res.length * 100).toFixed(0).padStart(8)}%  ${f(res.reduce((a, r) => a + r.pay - r.chipPay, 0) / res.length, 8)}`);
}

if (process.env.CLAW_WHY) console.log('mine fuses by cause:', WHY);
