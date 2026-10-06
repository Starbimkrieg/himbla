import { FACTIONS, TIERS } from './locations.js';

const KEY = 'moonrunner-rep-v2';

// Standing with each faction. Unlocks better-paying contracts, faction gear and (for the
// military blocs) permanent clearance. Rustmoon stays hidden until the Pirate Wreck.
export class Reputation {
  constructor(game) {
    this.game = game;
    this.values = { spacecom: 5, vostok: 0, meridian: 0, kepler: 5, daedalus: 0, rustmoon: 0 };
    // rustmoon: 'unknown' → 'known' (helped, declined) | 'aligned' | 'locked' (let the pirate die)
    this.rustmoon = 'unknown';
    this.history = [];
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d) return;
      Object.assign(this.values, d.values || {});
      this.rustmoon = d.rustmoon || 'unknown';
      this.history = d.history || [];
    } catch { /* corrupt or unavailable */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ values: this.values, rustmoon: this.rustmoon, history: this.history.slice(-30) })); } catch { /* unavailable */ }
  }

  get(f) { return this.values[f] ?? 0; }

  tier(f) {
    const v = this.get(f);
    let t = TIERS[0];
    for (const x of TIERS) if (v >= x.min) t = x;
    return t;
  }

  nextTier(f) {
    const v = this.get(f);
    return TIERS.find((x) => x.min > v) || null;
  }

  visible(f) {
    if (f === 'rustmoon') return this.rustmoon !== 'unknown';
    return !!FACTIONS[f] && !FACTIONS[f].hidden;
  }

  aligned() { return this.rustmoon === 'aligned'; }
  hostile(f) { return this.get(f) <= -20; }
  // FRIENDLY military factions let you into their zones (and their HQ shops)
  cleared(f) { return this.get(f) >= 10; }

  // Change standing. War: helping one side of Vostok/Daedalus annoys the other.
  add(f, amount, reason, { silent = false, war = true } = {}) {
    if (!FACTIONS[f] || !amount) return;
    if (f === 'rustmoon' && this.rustmoon === 'locked') return;
    const before = this.tier(f).name;
    this.values[f] = Math.max(-100, Math.min(100, this.get(f) + amount));
    const enemy = FACTIONS[f].enemy;
    if (war && enemy && amount > 0) this.values[enemy] = Math.max(-100, this.get(enemy) - Math.ceil(amount / 2));
    if (reason) this.history.push({ f, amount, reason, at: Date.now() });
    const after = this.tier(f).name;
    if (!silent && this.visible(f)) {
      const sign = amount > 0 ? '+' : '';
      this.game.fx.pop(`${FACTIONS[f].name} ${sign}${amount}`, null, { color: amount > 0 ? FACTIONS[f].color : '#ff2a4a', size: 34, life: 1.6, rot: -3 });
      if (after !== before) this.game.hud.alert(`${FACTIONS[f].name.toUpperCase()}: ${after}`, FACTIONS[f].color, 3);
    }
    this.save();
  }

  payMultiplier(f) { return this.tier(f).pay || 0; }

  // Does the player meet the reputation needed for the next level of a shop item?
  canBuy(item, level) {
    if (!item.faction) return true;
    if (item.faction === 'rustmoon' && !this.aligned()) return false;
    return this.get(item.faction) >= (item.req ? item.req[Math.min(level, item.req.length - 1)] : 0);
  }
}
