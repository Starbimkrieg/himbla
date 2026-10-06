import { CARGO, MIL_CARGO, CLIENTS, FACTIONS } from './locations.js';
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
  rustmoon: [(c, t) => `Hot ${c}, no questions. Get it to ${t} before the lawmen sniff it out.`],
};

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
    let pickup = board, to, cargo, clearance = null;
    if (faction === 'vostok' || faction === 'daedalus') {
      // military logistics between this faction's own installations (clearance granted)
      const bases = L.filter((l) => l.restricted && l.faction === faction && l !== board);
      const base = pick(bases.length ? bases : L.filter((l) => l.restricted && l.faction === faction));
      cargo = pick(MIL_CARGO);
      if (board.restricted || Math.random() < 0.65) { to = base; clearance = base.id; }
      else { pickup = base; to = board; clearance = base.id; }
    } else if (faction === 'rustmoon') {
      cargo = pick(CARGO.filter((c) => c.hot >= 1));
      const dens = L.filter((l) => l.type === 'pirate' && l !== board);
      to = Math.random() < 0.6 ? pick(dens) : pick(this.civilianDestinations(board.id));
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
    if (faction === 'rustmoon') reward *= 1.4;
    reward *= this.game.rep.payMultiplier(faction) || 1;
    reward = Math.round(reward / 5) * 5;
    const client = pick(CLIENTS[faction] || CLIENTS.spacecom);
    const text = pick(LINES[faction] || LINES.spacecom)(cargo.name, to.name);
    return { id: this.nextId++, board, faction, client, cargo, pickup, to, dist, time, reward, clearance, text, dark };
  }

  offersFor(loc) {
    const jobs = this.game.jobsAt(loc);
    if (!jobs.length) return [];
    if (!this.offers[loc.id] || this.offers[loc.id].length === 0) {
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

  accept(offer) {
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

  hasClearance(locId) {
    return !!(this.active && this.active.clearance === locId);
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
      P.setCargo(a.cargo.color);
      this.game.audio.pickup();
      this.game.fx.pop('CARGO SECURED!', null, { color: '#2ee6ff', size: 58 });
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
    if (this.cargoState === 'held' && arcDist(P.pos, a.to.dir) < a.to.r * 0.75) this.complete();
  }

  jostle(amount, skates) {
    if (!this.active || this.cargoState !== 'held') return;
    const loss = amount * 0.012 * this.active.cargo.fragile * (skates ? 0.6 : 1.2) * (1 - this.game.upgrades.dampers * 0.15) * (1 - (this.game.upgrades.cradle || 0) * 0.3);
    if (loss <= 0) return;
    this.integrity = Math.max(0, this.integrity - loss);
    if (loss > 0.04) this.game.hud.toast(`CARGO JOLTED! ${Math.round(this.integrity * 100)}% intact`);
    if (this.integrity <= 0) this.fail('The cargo is smashed to bits!');
  }

  onDamage(dmg) {
    if (!this.active || this.cargoState !== 'held') return;
    this.integrity = Math.max(0, this.integrity - dmg * 0.004 * (0.5 + this.active.cargo.fragile));
    if (this.integrity <= 0) this.fail('Your cargo was blasted to scrap!');
  }

  onStolen(thief) {
    const g = this.game;
    this.cargoState = 'stolen';
    this.thief = thief;
    g.player.setCargo(null);
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
    g.player.setCargo(this.active.cargo.color);
    g.audio.pickup();
    g.fx.pop('GOT IT BACK!', null, { color: '#2ee6ff', size: 64 });
    g.style(20, 'Recovery');
  }

  onFenced(lair) {
    this.fail(`Pirates fenced your cargo at ${lair ? lair.name : 'a pirate den'}.`);
  }

  complete() {
    const g = this.game;
    const a = this.active;
    const base = a.reward;
    const lateMult = this.late ? 0.5 : 1;
    const integ = Math.round(base * (0.5 + 0.5 * this.integrity) * lateMult);
    const timeBonus = this.late ? 0 : Math.round(base * 0.3 * Math.max(0, this.timer / a.time));
    const style = Math.round(this.stylePool * 1.2);
    const total = integ + timeBonus + style;
    g.addCredits(total, null);
    const repGain = this.late ? 1 : (a.premium ? 4 : 3) + (this.integrity > 0.8 ? 1 : 0);
    g.rep.add(a.faction, repGain, `Delivered ${a.cargo.name}`);
    g.stats.deliveries++;
    g.audio.cash();
    g.hud.delivered({ a, integ, timeBonus, style, total, integrity: this.integrity, faction: FACTIONS[a.faction].name, repGain });
    g.actionPanel('delivered');
    this.clear();
    g.save();
  }

  fail(reason) {
    const g = this.game;
    g.hud.failed(reason);
    g.audio.hurt();
    this.clear();
  }

  clear() {
    const g = this.game;
    this.active = null;
    this.cargoState = 'none';
    this.thief = null;
    this.dropPos = null;
    g.player.setCargo(null);
    g.enemies.clearDrops();
    for (const e of g.enemies.list) {
      if (e.carrying) { e.carrying = false; e.state = 'chase'; }
      if (e.model && e.model.loot) { e.model.loot.removeFromParent(); e.model.loot = null; }
    }
  }

  abandon() {
    if (!this.active) return;
    this.fail('Contract abandoned.');
  }
}
