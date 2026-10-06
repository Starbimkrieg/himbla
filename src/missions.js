import { CARGO, MIL_CARGO, CLIENTS, FACTIONS } from './locations.js';
import { pick } from './rng.js';

const LINES = {
  intl: [
    (c, t) => `Priority manifest: ${c} to ${t}. Clock's ticking, Runner.`,
    (c, t) => `Standard courier run. ${c}, ${t}. Try not to dent it.`,
  ],
  accord: [(c, t) => `Sealed ${c} for ${t}. Clearance codes uploaded to your skates. Don't make us regret it.`],
  directorate: [(c, t) => `The Directorate requires ${c} at ${t}. Your clearance is temporary. Your failure would be permanent.`],
  civ: [
    (c, t) => `Could you take this ${c} to ${t}? The kids are waiting!`,
    (c, t) => `${c} for ${t}, please — and mind the craters, it's precious!`,
  ],
  sci: [
    (c, t) => `This ${c} is irreplaceable. Deliver to ${t}. Gently. GENTLY.`,
    (c, t) => `Experiment window closes soon — ${c} to ${t}, stat!`,
  ],
  equa: [(c, t) => `${c} bound for ${t}. Pirates love this stuff, so move fast.`],
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
    return this.locs.filter((l) => !l.restricted && !l.hostile && l.id !== exclude);
  }

  makeOffer(board, faction) {
    const L = this.locs;
    let pickup = board, to, cargo, clearance = null;
    if (faction === 'accord' || faction === 'directorate') {
      const base = L.find((l) => l.type === 'military' && l.faction === faction);
      cargo = pick(MIL_CARGO);
      if (Math.random() < 0.65) { to = base; clearance = base.id; }
      else { pickup = base; to = board; clearance = base.id; }
    } else {
      cargo = pick(CARGO);
      if (Math.random() < 0.3) pickup = pick(this.civilianDestinations(board.id));
      let pool = this.civilianDestinations(pickup.id);
      if (faction === 'sci') pool = pool.filter((l) => l.type !== 'hub' || Math.random() < 0.5);
      to = pick(pool.length ? pool : this.civilianDestinations(pickup.id));
    }
    const d1 = pickup === board ? 0 : Math.hypot(pickup.x - board.x, pickup.z - board.z);
    const d2 = Math.hypot(to.x - pickup.x, to.z - pickup.z);
    const dist = d1 + d2;
    const time = Math.ceil((dist / 30 + 30) / 5) * 5;
    let reward = 90 + dist * 0.18 + cargo.hot * 70 + cargo.fragile * 60;
    if (clearance) reward += 150;
    reward = Math.round(reward / 5) * 5;
    const client = pick(CLIENTS[faction] || CLIENTS.intl);
    const text = pick(LINES[faction] || LINES.intl)(cargo.name, to.name);
    return { id: this.nextId++, board, faction, client, cargo, pickup, to, dist, time, reward, clearance, text };
  }

  offersFor(loc) {
    if (!loc.jobs) return [];
    if (!this.offers[loc.id] || this.offers[loc.id].length === 0) {
      this.offers[loc.id] = loc.jobs.map((f) => this.makeOffer(loc, f));
    }
    return this.offers[loc.id];
  }

  refreshAll() { this.offers = {}; }

  accept(offer) {
    if (this.active) return false;
    this.active = offer;
    this.timer = offer.time;
    this.integrity = 1;
    this.stylePool = 0;
    this.cargoState = 'toPickup';
    this.offers[offer.board.id] = this.offers[offer.board.id].filter((o) => o !== offer);
    const g = this.game;
    g.hud.toast(`CONTRACT ACCEPTED — ${offer.cargo.name}`);
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
    if (this.cargoState === 'toPickup') return { pos: a.pickup, label: `PICK UP @ ${a.pickup.short}` };
    if (this.cargoState === 'held') return { pos: a.to, label: `DELIVER @ ${a.to.short}` };
    if (this.cargoState === 'stolen' && this.thief && !this.thief.dead) return { pos: { x: this.thief.body.pos.x, z: this.thief.body.pos.z }, label: 'RECOVER STOLEN CARGO', thief: true };
    if (this.cargoState === 'dropped' && this.dropPos) return { pos: { x: this.dropPos.x, z: this.dropPos.z }, label: 'GRAB DROPPED CARGO' };
    return null;
  }

  checkPickup() {
    const a = this.active;
    const P = this.game.player;
    if (this.cargoState === 'toPickup' && Math.hypot(P.pos.x - a.pickup.x, P.pos.z - a.pickup.z) < a.pickup.r * 0.75) {
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
    if (this.timer <= 0) { this.fail('Out of time! The client found another runner.'); return; }
    this.checkPickup();
    const P = g.player;
    if (this.cargoState === 'held' && Math.hypot(P.pos.x - a.to.x, P.pos.z - a.to.z) < a.to.r * 0.75) this.complete();
  }

  jostle(amount, skates) {
    if (!this.active || this.cargoState !== 'held') return;
    const loss = amount * 0.012 * this.active.cargo.fragile * (skates ? 0.6 : 1.2) * (1 - this.game.upgrades.dampers * 0.15);
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

  onFenced() {
    this.fail('Pirates fenced your cargo at Scrapjaw Gulch.');
  }

  complete() {
    const g = this.game;
    const a = this.active;
    const base = a.reward;
    const integ = Math.round(base * (0.5 + 0.5 * this.integrity));
    const timeBonus = Math.round(base * 0.4 * Math.max(0, this.timer / a.time));
    const style = Math.round(this.stylePool * 2);
    const total = integ + timeBonus + style;
    g.addCredits(total, null);
    g.rep[a.faction] = (g.rep[a.faction] || 0) + 1;
    g.stats.deliveries++;
    g.audio.cash();
    g.hud.delivered({ a, integ, timeBonus, style, total, integrity: this.integrity, faction: FACTIONS[a.faction].name });
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
