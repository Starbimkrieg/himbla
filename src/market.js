// The Meridian Exchange's market: a handful of made-up lunar stocks whose prices wander on a short
// random walk and refresh every REFRESH seconds of game time (the board on the trading tower and
// its scrolling ticker both read from here, so they always agree). No three.js in here.
//
//   price     the latest price
//   hist      the last HIST closes, oldest first (the sparkline); `open` is its first entry
//   high/low  the highest and lowest close in that window
//   change    price - open, and pct the same as a percentage; `tick` is the move since the last refresh
//   volume    shares traded over the window (each refresh adds a lump), shown as 412K / 1.2M
//
// The Composite is an index of the other stocks rather than a walk of its own.

export const REFRESH = 15;   // seconds of game time between price updates
export const HIST = 48;      // refreshes kept (48 x 15 s = a 12-minute session)

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
const PULL = 0.04;   // the walk is tugged back towards the start price, so nothing runs off for ever
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
    // the move since the last refresh drives the next one a little (momentum), the pull to the
    // start price a little the other way, noise and the odd news jump do the rest
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
      // the index: the average of the others' price against their start price
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
    // advance to game time `t` (seconds): one step per whole REFRESH that has gone by. The first
    // call pins the clock; a long absence only replays what the history can hold.
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
    // [gainer, loser] by change over the window (the index is left out of it)
    movers() {
      const a = parts.slice().sort((x, y) => y.pct - x.pct);
      return [a[0], a[a.length - 1]];
    },
  };
  // a session already under way when the player first looks: a full window of history
  for (let i = 0; i < HIST; i++) m.step();
  m.version = 0;
  return m;
}

export const market = createMarket();

// Number formats shared by the board and the ticker.
export const fmtPrice = (p) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// the scrolling ticker's line: one entry per stock, an arrow for the session move
export const tickerText = (m = market) => m.stocks.map((s) => `${s.name} ${s.change >= 0 ? '▲' : '▼'} ${fmtPrice(s.price)}`).join(' | ');
