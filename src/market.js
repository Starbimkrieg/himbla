// Meridian Exchange market: made-up lunar stocks on a random walk, refreshed every REFRESH s of game time.
// The trading-tower board and its ticker both read from here, so they agree. No three.js.
//
//   price     latest price
//   hist      last HIST closes, oldest first (sparkline); `open` is its first entry
//   high/low  highest / lowest close in that window
//   change    price - open; pct as a percentage; `tick` is the move since the last refresh
//   volume    shares traded over the window, shown as 412K / 1.2M
//
// The Composite is an index of the others, not a walk of its own.

export const REFRESH = 15;   // s of game time between price updates
export const HIST = 48;      // refreshes kept (48 x 15 s = 12-minute session)

// [symbol, name, start price, volatility per refresh, typical volume per refresh]
const SEED = [
  ['MRC', 'MERIDIAN COMPOSITE', 1204.5, 0, 0],
  ['HE3', 'HELIUM-3 SPOT', 412.7, 0.011, 54000],
  ['H2O', 'WATER ICE', 19.95, 0.008, 310000],
  ['KPL', 'KEPLER BONDS', 98.1, 0.0035, 120000],
  ['VSK', 'VOSTOK SCRAP', 12.4, 0.014, 640000],
  ['DPT', 'DAEDALUS PHASE-TECH', 777.0, 0.012, 38000],
  ['SLN', 'SELENE SOLAR', 64.3, 0.009, 205000],
  ['RGL', 'REGOLITH FUTURES', 8.75, 0.016, 880000],
];
const PULL = 0.04;   // tug back towards the start price so nothing runs away
const SHOCK = 0.035; // chance per refresh, per stock, of a news jump
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

export function createMarket(rng = Math.random) {
  const stocks = SEED.map(([sym, name, p0, vol, v0]) => ({
    sym, name, p0, vol, v0, price: p0, last: 0, hist: [p0], vols: [], open: p0, high: p0, low: p0, volume: 0, change: 0, pct: 0, tick: 0, index: sym === 'MRC',
  }));
  const parts = stocks.filter((s) => !s.index);
  const comp = stocks[0];
  const m = {
    stocks, version: 0, nextAt: null,
    // a bit of momentum from the last move, pull to start price, noise, and the odd news jump
    step() {
      for (const s of parts) {
        let r = gauss(rng) * s.vol + s.last * 0.25 + ((s.p0 - s.price) / s.p0) * PULL;
        if (rng() < SHOCK) r += (rng() < 0.5 ? -1 : 1) * s.vol * (3 + rng() * 3);
        r = Math.max(-0.12, Math.min(0.12, r));
        s.last = r;
        s.tick = s.price * r;
        s.price = Math.max(0.05, s.price * (1 + r));
        s.vols.push(Math.round(s.v0 * (0.55 + rng() * 0.9) * (1 + Math.abs(r) * 40)));
      }
      // index: mean of the others' price relative to start
      let rel = 0, vsum = 0;
      for (const s of parts) rel += s.price / s.p0;
      const prev = comp.price;
      comp.price = comp.p0 * (rel / parts.length);
      comp.tick = comp.price - prev;
      for (const s of parts) vsum += s.vols[s.vols.length - 1];
      comp.vols.push(Math.round(vsum / 6));
      for (const s of stocks) {
        s.hist.push(s.price);
        if (s.hist.length > HIST) s.hist.shift();
        if (s.vols.length > HIST) s.vols.shift();
        s.open = s.hist[0];
        s.high = Math.max(...s.hist);
        s.low = Math.min(...s.hist);
        s.volume = s.vols.reduce((a, b) => a + b, 0);
        s.change = s.price - s.open;
        s.pct = (s.change / s.open) * 100;
      }
      m.version++;
    },
    // advance to game time `t` (s): one step per elapsed REFRESH. First call pins the clock;
    // a long absence replays at most HIST steps.
    update(t) {
      if (m.nextAt === null) { m.nextAt = t + REFRESH; return false; }
      if (t < m.nextAt) return false;
      const n = Math.min(HIST, Math.floor((t - m.nextAt) / REFRESH) + 1);
      for (let i = 0; i < n; i++) m.step();
      m.nextAt = t + REFRESH - ((t - m.nextAt) % REFRESH);
      return true;
    },
    // seconds until the next refresh, as of game time t
    countdown(t) { return m.nextAt === null ? REFRESH : Math.max(0, m.nextAt - t); },
    // [gainer, loser] over the window (index excluded)
    movers() {
      const a = parts.slice().sort((x, y) => y.pct - x.pct);
      return [a[0], a[a.length - 1]];
    },
  };
  // start with a full window of history
  for (let i = 0; i < HIST; i++) m.step();
  m.version = 0;
  return m;
}

export const market = createMarket();

// Number formats shared by the board and the ticker.
export const fmtPrice = (p) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// ticker line: one entry per stock, arrow for the session move
export const tickerText = (m = market) => m.stocks.map((s) => `${s.name} ${s.change >= 0 ? '▲' : '▼'} ${fmtPrice(s.price)}`).join(' | ');
