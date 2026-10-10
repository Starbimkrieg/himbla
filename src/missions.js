import { CARGO, MIL_CARGO, CLIENTS, FACTIONS, SHOPS } from './locations.js';
import { pick } from './rng.js';
import { arcDist } from './geo.js';

const LINES = {
  spacecom: [
    (c, t) => `SPACECOM priority manifest: ${c} to ${t}. Clock's ticking, Runner.`,
    (c, t) => `Standard courier run. ${c}, ${t}. Try not to dent it.`,
  ],
  vostok: [(c, t) => `Sealed ${c} for ${t}. Clearance codes are on your skates. Vostok does not forgive delays.`],
  daedalus: [(c, t) => `${c} for ${t}. You were never here. Daedalus will remember you were fast.`],
  kepler: [
    (c, t) => `Could you take this ${c} to ${t}? The kids are waiting!`,
    (c, t) => `${c} for ${t}, please — the council needs it before the vote!`,
  ],
  meridian: [
    (c, t) => `This ${c} is worth more than you are. Deliver to ${t}. Gently. GENTLY.`,
    (c, t) => `Market's moving — ${c} to ${t}, stat!`,
  ],
  rustmoon: [
    (c, t) => `Hot ${c}, no questions. Get it to ${t} before the lawmen sniff it out.`,
    (c, t) => `${c} for the crew at ${t}. Stay off the patrol roads.`,
  ],
  smuggle: [
    (c, t) => `SMUGGLING RUN: ${c} for a fence in ${t}. They'll shoot on sight, so don't stop.`,
    (c, t) => `Get this ${c} into ${t} under their guns. The fence pays double for the nerve.`,
  ],
};
// illicit cargo for smuggling runs into the bright-side towns
const SMUGGLE = [
  { name: 'Untaxed Antimatter', fragile: 0.8, hot: 3, color: 0x7dff3a },
  { name: 'Stolen Rail Coils', fragile: 0.5, hot: 3, color: 0xc77dff },
  { name: 'Black-Market He-3', fragile: 0.6, hot: 3, color: 0xffd23f },
  { name: 'Forged Clearance Chips', fragile: 0.3, hot: 3, color: 0xff2e88 },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.offers = {};
    this.active = null;
    this.cargoState = 'none';
    this.timer = 0;
    this.integrity = 1;
    this.stylePool = 0;
    this.nextId = 1;
    this.thief = null;
    this.dropPos = null;
  }

  get locs() { return this.game.locations; }

  civilianDestinations(exclude) {
    return this.locs.filter((l) => !l.restricted && !l.hostile && !l.poi && l.id !== exclude);
  }

  makeOffer(board, faction) {
    const L = this.locs;
    let pickup = board, to, cargo, clearance = null, smuggle = false, payload = null;
    if (faction === 'vostok' || faction === 'daedalus') {
      // military logistics between this faction's own installations (clearance granted)
      // (bases the Moon Council's ceasefire stood down count too; they just don't need clearance)
      const own = (l) => (l.restricted || l.ceasefire) && l.faction === faction;
      const bases = L.filter((l) => own(l) && l !== board);
      const base = pick(bases.length ? bases : L.filter(own)) || pick(this.civilianDestinations(board.id));
      cargo = pick(MIL_CARGO);
      if (base === board) to = pick(this.civilianDestinations(board.id));
      else if (board.restricted || Math.random() < 0.65) { to = base; clearance = base.restricted ? base.id : null; }
      else { pickup = base; to = board; clearance = base.restricted ? base.id : null; }
    } else if (faction === 'rustmoon') {
      // mostly runs between the clans' own dens; now and then a smuggling run into a bright-side
      // town, under its guns (each one counts towards the Rustmoon Hold black market)
      const dens = L.filter((l) => l.type === 'pirate' && l !== board && !l.camp);
      const towns = L.filter((l) => !l.restricted && l.type !== 'pirate' && !l.poi && l.defense && !l.dark && l !== board);
      if (Math.random() < 0.32 && towns.length) { smuggle = true; cargo = pick(SMUGGLE); to = pick(towns); payload = this.pickPayload(); }
      else { cargo = pick(CARGO.filter((c) => c.hot >= 1)); to = pick(dens.length ? dens : this.civilianDestinations(board.id)); }
    } else {
      cargo = pick(CARGO);
      if (Math.random() < 0.3) pickup = pick(this.civilianDestinations(board.id));
      let pool = this.civilianDestinations(pickup.id);
      if (faction === 'sci') pool = pool.filter((l) => l.type !== 'hub' || Math.random() < 0.5);
      to = pick(pool.length ? pool : this.civilianDestinations(pickup.id));
    }
    const d1 = pickup === board ? 0 : arcDist(pickup.dir, board.dir);
    const d2 = arcDist(to.dir, pickup.dir);
    const dist = d1 + d2;
    const dark = !!(to.dark || pickup.dark);
    // tight clocks: you need to ski well, not just survive
    const time = Math.ceil((dist / 36 + 20 + (dark ? 15 : 0)) / 5) * 5;
    let reward = 45 + dist * 0.05 + cargo.hot * 30 + cargo.fragile * 25;
    if (dark) reward *= 1.4; // hazard pay for the dark side
    if (clearance) reward += 60;
    if (faction === 'rustmoon') reward = (reward + 40) * 1.5; // the clans' hazard pay
    if (smuggle) reward *= 1.7; // ...and a smuggler's premium on top
    if (payload) reward *= 1.2; // (a payload run is a hotter one)
    reward *= this.game.rep.payMultiplier(faction) || 1;
    reward *= 1 + (this.game.upgrades.uplink || 0) * 0.1; // Meridian Market Uplink
    reward = Math.round(reward / 5) * 5;
    const client = pick(CLIENTS[faction] || CLIENTS.spacecom);
    const text = pick(LINES[smuggle ? 'smuggle' : faction] || LINES.spacecom)(cargo.name, to.name);
    return { id: this.nextId++, board, faction, client, cargo, pickup, to, dist, time, reward, clearance, text: payload ? `${text} <b>(Rides with: ${payload.name}.)</b>` : text, dark, smuggle, payload };
  }

  // Now and then a smuggling run carries something for the Rustmoon Hold black market. Each item
  // rides on one run at a time, and once it's delivered it's on sale for good (out of the pool).
  pickPayload() {
    if (Math.random() > 0.45) return null;
    const have = new Set(this.game.stats.blackMarket || []);
    const live = new Set();
    for (const list of Object.values(this.offers)) for (const o of list) if (o.payload) live.add(o.payload.key);
    for (const a of [this.active, this.extra && this.extra.a]) if (a && a.payload) live.add(a.payload.key);
    for (const k of this.batch || []) live.add(k); // (and the board being dealt right now)
    const pool = (SHOPS.rustmoon || []).filter((u) => u.unlock && u.unlock.smuggle && !have.has(u.key) && !live.has(u.key));
    const u = pick(pool);
    if (!u) return null;
    (this.batch ||= []).push(u.key);
    return { key: u.key, name: u.name };
  }

  offersFor(loc) {
    const jobs = this.game.jobsAt(loc);
    if (!jobs.length) return [];
    if (!this.offers[loc.id] || this.offers[loc.id].length === 0) {
      this.batch = [];
      const rep = this.game.rep;
      // factions that hate you won't hire you
      const list = jobs.filter((f) => !rep.hostile(f)).map((f) => this.makeOffer(loc, f));
      // well-liked runners get priority contracts: hotter cargo, bigger pay
      const fav = jobs.find((f) => rep.get(f) >= 10);
      if (fav) {
        const o = this.makeOffer(loc, fav);
        o.premium = true;
        o.reward = Math.round((o.reward * 1.5) / 5) * 5;
        o.cargo = { ...o.cargo, hot: Math.min(3, o.cargo.hot + 1) };
        o.client = `★ ${o.client}`;
        list.unshift(o);
      }
      this.offers[loc.id] = list;
    }
    return this.offers[loc.id];
  }

  refreshAll() { this.offers = {}; }

  // Kepler Twin Cradle: one more contract can ride on top of the first (its own pickup, drop-off,
  // clock and condition). Pirates go for the bottom crate; when the first job ends either way, the
  // second one moves down and carries on as the main contract.
  canTake() { return !this.active || (!!this.game.upgrades.twin && !this.extra); }

  accept(offer) {
    if (this.active && this.canTake()) return this.acceptExtra(offer);
    if (this.active) return false;
    this.active = offer;
    this.timer = offer.time;
    this.late = false;
    this.integrity = 1;
    this.stylePool = 0;
    this.cargoState = 'toPickup';
    this.offers[offer.board.id] = this.offers[offer.board.id].filter((o) => o !== offer);
    const g = this.game;
    g.hud.toast(`CONTRACT ACCEPTED — ${offer.cargo.name}`);
    g.globe.discover(offer.to, true);
    g.globe.discover(offer.pickup, true);
    if (offer.clearance) g.hud.alert(`TEMPORARY CLEARANCE: ${offer.to.restricted ? offer.to.name : offer.pickup.name}`, '#2ec4ff', 3);
    this.checkPickup();
    return true;
  }

  acceptExtra(offer) {
    const g = this.game;
    this.extra = { a: offer, timer: offer.time, late: false, integrity: 1, cargoState: 'toPickup' };
    this.offers[offer.board.id] = this.offers[offer.board.id].filter((o) => o !== offer);
    g.hud.toast(`SECOND CONTRACT ON THE CRADLE — ${offer.cargo.name}`);
    g.globe.discover(offer.to, true);
    g.globe.discover(offer.pickup, true);
    if (offer.clearance) g.hud.alert(`TEMPORARY CLEARANCE: ${offer.to.restricted ? offer.to.name : offer.pickup.name}`, '#2ec4ff', 3);
    this.checkPickup();
    return true;
  }

  // the crates on your back: the main contract's at the bottom, the second stacked on it
  refreshCargo() {
    const x = this.extra;
    const bottom = this.active && this.cargoState === 'held' ? this.active.cargo.color : null;
    const top = x && x.cargoState === 'held' ? x.a.cargo.color : null;
    this.game.player.setCargo(bottom ?? top, bottom != null ? top : null);
  }

  // the second contract takes the main slot
  promote() {
    const x = this.extra;
    this.extra = null;
    Object.assign(this, { active: x.a, timer: x.timer, late: x.late, integrity: x.integrity, stylePool: 0, cargoState: x.cargoState, thief: null, dropPos: null });
    this.game.hud.toast(`ON TO THE NEXT ONE — ${x.a.cargo.name}`, 2.5);
  }

  hasClearance(locId) {
    return !!((this.active && this.active.clearance === locId) || (this.extra && this.extra.a.clearance === locId));
  }

  // the second contract's waypoint (shown alongside the first)
  objective2() {
    const x = this.extra;
    if (!x) return null;
    if (x.cargoState === 'toPickup') return { pos: x.a.pickup.pos, label: `#2 PICK UP @ ${x.a.pickup.short}` };
    return { pos: x.a.to.pos, label: `#2 DELIVER @ ${x.a.to.short}` };
  }

  objective() {
    const a = this.active;
    if (!a) return null;
    if (this.cargoState === 'toPickup') return { pos: a.pickup.pos, label: `PICK UP @ ${a.pickup.short}` };
    if (this.cargoState === 'held') return { pos: a.to.pos, label: `DELIVER @ ${a.to.short}` };
    if (this.cargoState === 'stolen' && this.thief && !this.thief.dead) return { pos: this.thief.body.pos, label: 'RECOVER STOLEN CARGO', thief: true };
    if (this.cargoState === 'dropped' && this.dropPos) return { pos: this.dropPos, label: 'GRAB DROPPED CARGO' };
    return null;
  }

  checkPickup() {
    const a = this.active;
    const P = this.game.player;
    if (this.cargoState === 'toPickup' && arcDist(P.pos, a.pickup.dir) < a.pickup.r * 0.75) {
      this.cargoState = 'held';
      this.refreshCargo();
      this.game.audio.pickup();
      this.game.fx.pop('CARGO SECURED!', null, { color: '#2ee6ff', size: 58 });
    }
    const x = this.extra;
    if (x && x.cargoState === 'toPickup' && arcDist(P.pos, x.a.pickup.dir) < x.a.pickup.r * 0.75) {
      x.cargoState = 'held';
      this.refreshCargo();
      this.game.audio.pickup();
      this.game.fx.pop('STACKED!', null, { color: '#7dff6a', size: 58 });
    }
  }

  update(dt) {
    const a = this.active;
    if (!a) return;
    const g = this.game;
    this.timer -= dt;
    if (this.timer <= 0 && !this.late) {
      // missed the clock: the job still pays half when you finish it
      this.late = true;
      g.hud.alert('OUT OF TIME — HALF PAY ON DELIVERY', '#ff9f1c', 3);
    }
    this.checkPickup();
    const P = g.player;
    const x = this.extra;
    if (x) {
      x.timer -= dt;
      if (x.timer <= 0 && !x.late) { x.late = true; g.hud.alert('SECOND CONTRACT OUT OF TIME — HALF PAY', '#ff9f1c', 3); }
      if (x.cargoState === 'held' && arcDist(P.pos, x.a.to.dir) < x.a.to.r * 0.75) this.completeExtra();
    }
    if (this.cargoState === 'held' && arcDist(P.pos, a.to.dir) < a.to.r * 0.75) this.complete();
  }

  jostle(amount, skates) {
    if (!this.active || this.cargoState !== 'held') return;
    const soften = (skates ? 0.6 : 1.2) * (1 - this.game.upgrades.dampers * 0.15) * (1 - (this.game.upgrades.cradle || 0) * 0.3);
    const x = this.extra;
    if (x && x.cargoState === 'held') {
      x.integrity = Math.max(0, x.integrity - amount * 0.012 * x.a.cargo.fragile * soften);
      if (x.integrity <= 0) this.failExtra('The top crate is smashed to bits!');
    }
    const loss = amount * 0.012 * this.active.cargo.fragile * soften;
    if (loss <= 0) return;
    this.integrity = Math.max(0, this.integrity - loss);
    if (loss > 0.04) this.game.hud.toast(`CARGO JOLTED! ${Math.round(this.integrity * 100)}% intact`);
    if (this.integrity <= 0) this.fail('The cargo is smashed to bits!');
  }

  onDamage(dmg) {
    const x = this.extra;
    if (x && x.cargoState === 'held') {
      x.integrity = Math.max(0, x.integrity - dmg * 0.004 * (0.5 + x.a.cargo.fragile));
      if (x.integrity <= 0) this.failExtra('The top crate was blasted to scrap!');
    }
    if (!this.active || this.cargoState !== 'held') return;
    this.integrity = Math.max(0, this.integrity - dmg * 0.004 * (0.5 + this.active.cargo.fragile));
    if (this.integrity <= 0) this.fail('Your cargo was blasted to scrap!');
  }

  onStolen(thief) {
    const g = this.game;
    this.cargoState = 'stolen';
    this.thief = thief;
    this.refreshCargo();
    g.hud.alert('CARGO STOLEN! TAKE IT BACK!', '#7dff3a', 3.5);
    g.fx.pop('YOINK!', thief.center.clone(), { color: '#7dff3a', size: 84 });
    g.audio.alarm();
    g.actionPanel('stolen', thief);
  }

  onCargoDropped(pos) {
    if (!this.active) return;
    this.cargoState = 'dropped';
    this.dropPos = pos.clone();
    this.thief = null;
  }

  recoverCargo() {
    const g = this.game;
    if (!this.active) return;
    this.cargoState = 'held';
    this.dropPos = null;
    this.refreshCargo();
    g.audio.pickup();
    g.fx.pop('GOT IT BACK!', null, { color: '#2ee6ff', size: 64 });
    g.style(20, 'Recovery');
  }

  onFenced(lair) {
    this.fail(`Pirates fenced your cargo at ${lair ? lair.name : 'a pirate den'}.`);
  }

  // credits the style pool is worth right now (capped at the contract's base reward unless raw)
  styleValue(capped = true) {
    const v = Math.round(this.stylePool * 0.6);
    return capped && this.active ? Math.min(v, this.active.reward) : v;
  }

  complete() {
    this.payOut(this.active, this.timer, this.late, this.integrity, this.styleValue(false));
    this.clear();
    this.game.save();
  }

  // the second contract delivered: it pays like any other (the style pool rides with the first)
  completeExtra() {
    const x = this.extra;
    this.extra = null;
    this.payOut(x.a, x.timer, x.late, x.integrity, 0);
    this.refreshCargo();
    this.game.save();
  }

  failExtra(reason) {
    const g = this.game;
    this.extra = null;
    g.hud.failed(reason);
    g.audio.hurt();
    this.refreshCargo();
  }

  payOut(a, timer, late, integrity, styleRaw) {
    const g = this.game;
    const base = a.reward;
    const lateMult = late ? 0.5 : 1;
    const timeBonus = late ? 0 : Math.round(base * 0.3 * Math.max(0, timer / a.time));
    // style pays half what it used to and can at most double the contract (₵400 job → ₵800 tops);
    // the package's condition then scales the whole total
    const style = Math.min(styleRaw, base);
    const condition = 0.5 + 0.5 * integrity;
    const total = Math.round((base + timeBonus + style) * condition * lateMult);
    const integ = base;
    g.addCredits(total, null);
    const repGain = late ? 1 : (a.premium ? 4 : 3) + (integrity > 0.8 ? 1 : 0);
    g.rep.add(a.faction, repGain, `Delivered ${a.cargo.name}`);
    g.stats.deliveries++;
    if (a.dark) g.stats.darkDeliveries = (g.stats.darkDeliveries || 0) + 1;
    if (a.smuggle) {
      g.stats.smuggled = (g.stats.smuggled || 0) + 1;
      if (a.payload) {
        const bm = (g.stats.blackMarket ||= []);
        if (!bm.includes(a.payload.key)) bm.push(a.payload.key);
        g.hud.alert(`☠ BLACK MARKET: ${a.payload.name.toUpperCase()} NOW ON SALE AT RUSTMOON HOLD`, '#7dff3a', 4);
      } else g.hud.toast(`Smuggled! (${g.stats.smuggled} runs.)`, 3);
    }
    g.audio.cash();
    g.hud.delivered({ a, integ, timeBonus, style, styleCapped: styleRaw > base, condition, late, total, integrity, faction: FACTIONS[a.faction].name, repGain });
    g.actionPanel('delivered');
    // the contract's clearance ends with it: don't let the base you're standing in open up on you
    if (a.clearance) { const L = this.game.locations.find((l) => l.id === a.clearance); if (L) g.enemies.grantGrace(L); }
  }

  fail(reason) {
    const g = this.game;
    g.hud.failed(reason);
    g.audio.hurt();
    this.clear();
  }

  // everything on your back is lost (you went down, an emergency recall)
  failAll(reason) {
    this.extra = null;
    if (this.active) this.fail(reason);
  }

  clear() {
    const g = this.game;
    this.active = null;
    this.cargoState = 'none';
    this.thief = null;
    this.dropPos = null;
    if (this.extra) this.promote();
    this.refreshCargo();
    g.enemies.clearDrops();
    for (const e of g.enemies.list) {
      if (e.carrying) { e.carrying = false; e.state = 'chase'; }
      if (e.model && e.model.loot) { e.model.loot.removeFromParent(); e.model.loot = null; }
    }
  }

  abandon() {
    if (!this.active) return;
    this.failAll('Contract abandoned.');
  }
}
