import { CARGO, MIL_CARGO, CLIENTS, FACTIONS, SHOPS, TIERS } from './locations.js';
import { pick } from './rng.js';
import { arcDist, tangent, greatCircle, darkness } from './geo.js';
import * as THREE from 'three';

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
// illicit cargo for smuggling runs into bright-side towns
const SMUGGLE = [
  { name: 'Untaxed Antimatter', fragile: 0.8, hot: 3, color: 0x7dff3a },
  { name: 'Stolen Rail Coils', fragile: 0.5, hot: 3, color: 0xc77dff },
  { name: 'Black-Market He-3', fragile: 0.6, hot: 3, color: 0xffd23f },
  { name: 'Forged Clearance Chips', fragile: 0.3, hot: 3, color: 0xff2e88 },
];

// cosmetics a smuggling run may carry (w: weight)
const RIDERS = [
  { key: 'outfit_rustmoon', name: 'Rustmoon Scrapper Leathers', w: 2 },
  { key: 'skates_survivor', name: 'Dark-Side Survivors (skates)', w: 1 },
];
const RIDER_CHANCE = 0.3;

// Contract kinds beyond the standard run, and the standing each opens with its faction:
//   express    FRIENDLY  a short clock and a steep speed bonus
//   bounty     TRUSTED   no cargo: a pirate squad roams a patch of the bright side, marked on the map only roughly; take them all down
//   showpiece  HONORED   fragile cargo and a style par to hit on the way (miss it and it pays less)
const tierMin = (name) => TIERS.find((t) => t.name === name).min;
const KIND_TIER = { express: tierMin('FRIENDLY'), bounty: tierMin('TRUSTED'), showpiece: tierMin('HONORED') };
const KIND_FACTIONS = { express: ['spacecom', 'vostok', 'daedalus', 'kepler', 'meridian'], bounty: ['spacecom', 'vostok', 'daedalus', 'kepler', 'meridian'], showpiece: ['spacecom', 'kepler', 'meridian'] };
export const KIND_INFO = {
  express: { name: 'EXPRESS', blurb: 'Short clock, steep speed bonus' },
  bounty: { name: 'BOUNTY', blurb: 'Hunt a pirate squad: the map marks the area only roughly' },
  showpiece: { name: 'SHOWPIECE', blurb: 'Fragile cargo: hit the style par on the way for ×1.6, miss it for ×0.8' },
};
const BOUNTY_FUZZ = 450; // m: how far the map's marker can sit from the squad's true patch
const BOUNTY_RADIUS = 700; // m: its drawn radius

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

  makeOffer(board, faction, kind = 'standard') {
    if (kind === 'bounty') return this.makeBounty(board, faction);
    const L = this.locs;
    let pickup = board, to, cargo, clearance = null, smuggle = false, payload = null, rider = null;
    if (faction === 'vostok' || faction === 'daedalus') {
      // military logistics between the faction's own bases (clearance granted; ceasefire bases need none)
      const own = (l) => (l.restricted || l.ceasefire) && l.faction === faction;
      const bases = L.filter((l) => own(l) && l !== board);
      const base = pick(bases.length ? bases : L.filter(own)) || pick(this.civilianDestinations(board.id));
      cargo = pick(MIL_CARGO);
      if (base === board) to = pick(this.civilianDestinations(board.id));
      else if (board.restricted || Math.random() < 0.65) { to = base; clearance = base.restricted ? base.id : null; }
      else { pickup = base; to = board; clearance = base.restricted ? base.id : null; }
    } else if (faction === 'rustmoon') {
      // mostly den-to-den; sometimes a smuggling run into a defended bright-side town (feeds the Rustmoon Hold black market)
      const dens = L.filter((l) => l.type === 'pirate' && l !== board && !l.camp);
      const towns = L.filter((l) => !l.restricted && l.type !== 'pirate' && !l.poi && l.defense && !l.dark && l !== board);
      if (Math.random() < 0.32 && towns.length) { smuggle = true; cargo = pick(SMUGGLE); to = pick(towns); payload = this.pickPayload(); rider = this.pickRider(); }
      else { cargo = pick(CARGO.filter((c) => c.hot >= 1)); to = pick(dens.length ? dens : this.civilianDestinations(board.id)); }
    } else {
      cargo = kind === 'showpiece' ? pick(CARGO.filter((c) => c.fragile >= 0.8)) : pick(CARGO);
      if (Math.random() < 0.3) pickup = pick(this.civilianDestinations(board.id));
      let pool = this.civilianDestinations(pickup.id);
      if (faction === 'sci') pool = pool.filter((l) => l.type !== 'hub' || Math.random() < 0.5);
      to = pick(pool.length ? pool : this.civilianDestinations(pickup.id));
    }
    const d1 = pickup === board ? 0 : arcDist(pickup.dir, board.dir);
    const d2 = arcDist(to.dir, pickup.dir);
    const dist = d1 + d2;
    const dark = !!(to.dark || pickup.dark);
    // tight clocks: you have to skate well
    let time = Math.ceil((dist / 36 + 20 + (dark ? 15 : 0)) / 5) * 5;
    if (kind === 'express') time = Math.ceil((dist / 52 + 12 + (dark ? 10 : 0)) / 5) * 5; // a real sprint
    // each skull is +15 % of the job (it was a flat ₵30: too much on a short hop, nothing on a long one)
    let reward = (45 + dist * 0.05 + cargo.fragile * 25) * (1 + cargo.hot * 0.15);
    if (dark) reward *= 1.4; // hazard pay for the dark side
    if (clearance) reward += 60;
    if (faction === 'rustmoon') reward = (reward + 40) * 1.5; // clan hazard pay
    if (smuggle) reward *= 1.7; // smuggler's premium
    if (payload) reward *= 1.2; // payload runs are hotter
    if (kind === 'express') reward *= 1.3;
    if (kind === 'showpiece') reward *= 1.15;
    reward *= this.game.rep.payMultiplier(faction) || 1;
    reward *= 1 + (this.game.upgrades.uplink || 0) * 0.1; // Meridian Market Uplink
    reward = Math.round(reward / 5) * 5;
    const client = pick(CLIENTS[faction] || CLIENTS.spacecom);
    const text = pick(LINES[smuggle ? 'smuggle' : faction] || LINES.spacecom)(cargo.name, to.name);
    // showpiece: the style to land between pickup and drop (raw style points: tricks, big air, grinds)
    const par = kind === 'showpiece' ? Math.min(400, Math.round((120 + dist / 60) / 10) * 10) : 0;
    return { id: this.nextId++, kind, par, board, faction, client, cargo, pickup, to, dist, time, reward, clearance, text: payload ? `${text} <b>(Rides with: ${payload.name}.)</b>` : text, dark, smuggle, payload, rider };
  }

  // A bounty: a squad of pirates holds a patch of the bright side 1.8 to 5 km from the board; take them all down. The map and the
  // objective arrow point at a spot up to BOUNTY_FUZZ m off their true patch. Its squad is spawned when you accept (spawnBounty).
  makeBounty(board, faction) {
    const g = this.game;
    let dir = null;
    for (let i = 0; i < 40 && !dir; i++) {
      const up = board.dir.clone().normalize();
      const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      const d = greatCircle(up, t, 1800 + Math.random() * 3200);
      if (darkness(d) < 0.3 && !g.zoneAt(d, 2)) dir = d.normalize();
    }
    if (!dir) return null;
    const n = this.game.rep.get(faction) >= tierMin('HONORED') ? 4 : 3;
    const up = dir.clone();
    const fuzzDir = greatCircle(up, tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize(), Math.random() * BOUNTY_FUZZ).normalize();
    const dist = arcDist(dir, board.dir);
    const time = Math.ceil((dist / 30 + 240) / 5) * 5;
    let reward = 180 + n * 100 + dist * 0.03;
    reward *= this.game.rep.payMultiplier(faction) || 1;
    reward *= 1 + (this.game.upgrades.uplink || 0) * 0.1;
    reward = Math.round(reward / 5) * 5;
    const zone = { name: 'the marked area', short: 'ZONE', dir: fuzzDir, pos: g.planet.ground(fuzzDir, new THREE.Vector3()), r: BOUNTY_RADIUS };
    const client = pick(CLIENTS[faction] || CLIENTS.spacecom);
    const cargo = { name: `Bounty: ${n} pirates`, fragile: 0, hot: 0, color: 0xff2a4a };
    const text = `Renegade pirates are working the bright side near ${zone.name}. ${n} of them. Find them and put them down: nobody here will miss them.`;
    return { id: this.nextId++, kind: 'bounty', board, faction, client, cargo, pickup: board, to: zone, dist, time, reward, clearance: null, text, dark: false, smuggle: false, payload: null, rider: null, bounty: { dir, n, squad: [] } };
  }

  // Every smuggling run carries the next black-market item, in the Hold's order: the n-th run delivered unlocks the n-th item, so
  // the whole stock is 13 runs, not luck. Runs on the boards at once carry different ones; one that fails or is dropped leaves its
  // item for the next. (The kit the ILMB sells is on sale at the Hold from the start.)
  pickPayload() {
    const have = new Set(this.game.stats.blackMarket || []);
    const live = new Set();
    for (const list of Object.values(this.offers)) for (const o of list) if (o.payload) live.add(o.payload.key);
    for (const a of [this.active, this.extra && this.extra.a]) if (a && a.payload) live.add(a.payload.key);
    for (const k of this.batch || []) live.add(k); // and the board being dealt now
    const u = (SHOPS.rustmoon || []).find((x) => x.unlock && x.unlock.smuggle && !have.has(x.key) && !live.has(x.key));
    if (!u) return null;
    (this.batch ||= []).push(u.key);
    return { key: u.key, name: u.name };
  }

  // Cosmetics ride on top of the run, and are luck: a smuggling run may also have one tucked in the crate (the Scrapper Leathers a
  // little likelier than the skates). Delivering it gives it to you.
  pickRider() {
    const up = this.game.upgrades;
    const live = new Set();
    for (const list of Object.values(this.offers)) for (const o of list) if (o.rider) live.add(o.rider.key);
    for (const a of [this.active, this.extra && this.extra.a]) if (a && a.rider) live.add(a.rider.key);
    const pool = RIDERS.filter((r) => !up[r.key] && !live.has(r.key));
    if (!pool.length || Math.random() > RIDER_CHANCE) return null;
    let roll = Math.random() * pool.reduce((t, r) => t + r.w, 0);
    for (const r of pool) if ((roll -= r.w) <= 0) return r;
    return pool[0];
  }

  offersFor(loc) {
    const jobs = this.game.jobsAt(loc);
    if (!jobs.length) return [];
    if (!this.offers[loc.id] || this.offers[loc.id].length === 0) {
      this.batch = [];
      const rep = this.game.rep;
      // factions that hate you won't hire you
      const list = jobs.filter((f) => !rep.hostile(f)).map((f) => this.makeOffer(loc, f));
      // well-liked runners get a priority contract: hotter cargo, bigger pay
      const fav = jobs.find((f) => rep.get(f) >= 10);
      if (fav) {
        const o = this.makeOffer(loc, fav);
        o.premium = true;
        o.reward = Math.round((o.reward * 1.5) / 5) * 5;
        o.cargo = { ...o.cargo, hot: Math.min(3, o.cargo.hot + 1) };
        o.client = `★ ${o.client}`;
        list.unshift(o);
      }
      // the kinds your standing opens (at most two a board): express, bounty, showpiece
      const extra = [];
      for (const f of jobs) {
        if (rep.hostile(f) || rep.aligned()) continue;
        for (const k of Object.keys(KIND_TIER)) if (rep.get(f) >= KIND_TIER[k] && KIND_FACTIONS[k].includes(f)) extra.push([f, k]);
      }
      extra.sort(() => Math.random() - 0.5);
      for (const [f, k] of extra.slice(0, 2)) {
        const o = this.makeOffer(loc, f, k);
        if (o) list.push(o);
      }
      this.offers[loc.id] = list;
    }
    return this.offers[loc.id];
  }

  // Kepler Twin Cradle: a second contract rides on top (own pickup, drop-off, clock, condition). Pirates go for the
  // bottom crate; when the first job ends either way, the second becomes the main contract.
  canTake() { return !this.active || (!!this.game.upgrades.twin && !this.extra && this.active.kind !== 'bounty'); }

  accept(offer) {
    // a bounty needs your hands free, and a showpiece needs the style it counts on the main contract
    if (this.active && (offer.kind === 'bounty' || offer.kind === 'showpiece' || this.active.kind === 'bounty')) {
      this.game.hud.toast(offer.kind === 'bounty' ? 'Finish what you are carrying first: a bounty needs your hands free.' : offer.kind === 'showpiece' ? 'A showpiece rides alone: nothing else on your back.' : 'You are out on a bounty: nothing else until it is done.', 3);
      return false;
    }
    if (this.active && this.canTake()) return this.acceptExtra(offer);
    if (this.active) return false;
    this.active = offer;
    this.timer = offer.time;
    this.late = false;
    this.integrity = 1;
    this.stylePool = 0;
    this.cargoState = offer.kind === 'bounty' ? 'hunt' : 'toPickup';
    this.parHit = false;
    this.parBase = 0;
    this.offers[offer.board.id] = this.offers[offer.board.id].filter((o) => o !== offer);
    const g = this.game;
    g.hud.toast(offer.kind === 'bounty' ? `BOUNTY ACCEPTED — ${offer.bounty.n} pirates, somewhere in the marked area` : `${KIND_INFO[offer.kind] ? KIND_INFO[offer.kind].name + ' ' : ''}CONTRACT ACCEPTED — ${offer.cargo.name}`);
    if (offer.kind === 'bounty') offer.bounty.squad = g.enemies.spawnBountySquad(offer.bounty.dir, offer.bounty.n);
    else { g.globe.discover(offer.to, true); g.globe.discover(offer.pickup, true); }
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

  // crates on your back: main contract at the bottom, the second on top
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
    Object.assign(this, { active: x.a, timer: x.timer, late: x.late, integrity: x.integrity, stylePool: 0, cargoState: x.cargoState, thief: null, dropPos: null, parHit: false, parBase: 0 });
    this.game.hud.toast(`ON TO THE NEXT ONE — ${x.a.cargo.name}`, 2.5);
  }

  hasClearance(locId) {
    return !!((this.active && this.active.clearance === locId) || (this.extra && this.extra.a.clearance === locId));
  }

  // the second contract's waypoint
  objective2() {
    const x = this.extra;
    if (!x) return null;
    if (x.cargoState === 'toPickup') return { pos: x.a.pickup.pos, label: `#2 PICK UP @ ${x.a.pickup.short}` };
    return { pos: x.a.to.pos, label: `#2 DELIVER @ ${x.a.to.short}` };
  }

  objective() {
    const a = this.active;
    if (!a) return null;
    if (a.kind === 'bounty') return { pos: a.to.pos, label: 'BOUNTY AREA (APPROX.)' };
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
      this.parBase = this.stylePool; // a showpiece's par counts from here
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
      // missed the clock: half pay on delivery
      this.late = true;
      g.hud.alert('OUT OF TIME — HALF PAY ON DELIVERY', '#ff9f1c', 3);
    }
    if (a.kind === 'bounty') {
      if (a.bounty.squad.every((e) => e.dead)) this.completeBounty();
      return;
    }
    this.checkPickup();
    if (a.par && !this.parHit && this.cargoState === 'held' && this.parPts() >= a.par) {
      this.parHit = true;
      g.hud.alert(`PAR REACHED (${a.par})! NOW GET IT HOME`, '#ff7ad9', 3);
    }
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

  // credits the style pool is worth (capped at the base reward unless raw)
  styleValue(capped = true) {
    const v = Math.round(this.stylePool * 0.6);
    return capped && this.active ? Math.min(v, this.active.reward) : v;
  }

  // style landed since the pickup (a showpiece's par)
  parPts() { return this.cargoState === 'held' ? Math.max(0, this.stylePool - this.parBase) : 0; }

  // bounties alive in the squad
  bountyLeft() { const a = this.active; return a && a.bounty ? a.bounty.squad.filter((e) => !e.dead).length : 0; }

  completeBounty() {
    const a = this.active;
    this.payOut(a, this.timer, this.late, 1, this.styleValue(false));
    this.clear();
    this.game.save();
  }

  complete() {
    this.payOut(this.active, this.timer, this.late, this.integrity, this.styleValue(false));
    this.clear();
    this.game.save();
  }

  // second contract delivered: pays normally (the style pool goes with the first)
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
    const timeBonus = late ? 0 : Math.round(base * (a.kind === 'express' ? 0.8 : 0.3) * Math.max(0, timer / a.time));
    // style can at most double the contract (₵400 job → ₵800 tops); condition scales the total
    const style = Math.min(styleRaw, base);
    const condition = 0.5 + 0.5 * integrity;
    // showpiece: the par is the point (it counts only on the main contract)
    const met = a.kind === 'showpiece' && a === this.active && this.parHit;
    const showMult = a.kind === 'showpiece' ? (met ? 1.6 : 0.8) : 1;
    const note = a.kind === 'showpiece' ? (met ? `Par ${a.par} made ×1.6` : `Par ${a.par} missed ×0.8`) : '';
    const total = Math.round((base + timeBonus + style) * condition * lateMult * showMult);
    const integ = base;
    g.addCredits(total, null);
    const repGain = a.kind === 'bounty' ? (late ? 2 : 5) : late ? 1 : (a.premium ? 4 : 3) + (integrity > 0.8 ? 1 : 0);
    g.rep.add(a.faction, repGain, a.kind === 'bounty' ? 'Collected a bounty' : `Delivered ${a.cargo.name}`);
    if (a.kind === 'bounty') g.stats.bounties = (g.stats.bounties || 0) + 1; else g.stats.deliveries++;
    if (a.dark) g.stats.darkDeliveries = (g.stats.darkDeliveries || 0) + 1;
    if (a.smuggle) {
      g.stats.smuggled = (g.stats.smuggled || 0) + 1;
      if (a.payload) {
        const bm = (g.stats.blackMarket ||= []);
        if (!bm.includes(a.payload.key)) bm.push(a.payload.key);
        g.hud.alert(`☠ BLACK MARKET: ${a.payload.name.toUpperCase()} NOW ON SALE AT RUSTMOON HOLD`, '#7dff3a', 4);
      } else g.hud.toast(`Smuggled! (${g.stats.smuggled} runs.)`, 3);
      if (a.rider && !g.upgrades[a.rider.key]) {
        g.upgrades[a.rider.key] = 1;
        g.hud.alert(`☠ TUCKED IN THE CRATE: ${a.rider.name.toUpperCase()} (wardrobe: C)`, '#c77dff', 4);
      }
    }
    g.audio.cash();
    g.hud.delivered({ a, note, integ, timeBonus, style, styleCapped: styleRaw > base, condition, late, total, integrity, faction: FACTIONS[a.faction].name, repGain });
    // clearance ends with the contract: grace so the base you're in doesn't open fire
    if (a.clearance) { const L = this.game.locations.find((l) => l.id === a.clearance); if (L) g.enemies.grantGrace(L); }
  }

  // quiet: the caller shows its own message (an emergency recall lists all failures in one panel)
  fail(reason, quiet = false) {
    const g = this.game;
    if (!quiet) { g.hud.failed(reason); g.audio.hurt(); }
    this.clear();
  }

  // lose everything on your back (you went down, emergency recall)
  failAll(reason, quiet = false) {
    this.extra = null; // first, so clear() doesn't promote it
    if (this.active) this.fail(reason, quiet);
  }

  clear() {
    const g = this.game;
    if (this.active && this.active.bounty) g.enemies.removeBounty(this.active.bounty.squad); // (a squad left standing goes with the contract)
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
