import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { makeSeismo, makeTube, makeCrate, makeRover, makeFreighter, makeFigure } from './models.js';
import { frameQuat, greatCircle, arcDist, darkness, tangent, R } from './geo.js';
import { pick, randRange } from './rng.js';
import { textSprite } from './toon.js';

// Which kinds of events each faction posts. One open event per faction at a time.
const TYPES = {
  spacecom: ['clearCamp', 'blackLake', 'relay'],
  vostok: ['strike', 'clearCamp'],
  daedalus: ['strike', 'clearCamp'],
  meridian: ['seismic', 'blackLake', 'escort'],
  kepler: ['pods', 'escort'],
  rustmoon: ['raid'],
};
const ICON = { clearCamp: '☠', strike: '✸', seismic: '≋', blackLake: '⚗', escort: '⛟', pods: '✚', relay: '📡', raid: '⚔', wreck: '✖' };
const OPEN_LIFETIME = 420;

const _v = new THREE.Vector3();

export class Events {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.active = null;
    this.protect = [];
    this.cooldown = {};
    for (const f of Object.keys(TYPES)) this.cooldown[f] = 8 + Math.random() * 30;
    this.nextId = 1;
    this.fluid = null;
    this.carry = null;
    this.wreckTimer = 45;
  }

  // ---------- helpers ----------
  locs(filter) { return this.game.locations.filter(filter); }

  ground(dir, lift = 0) { return this.game.planet.ground(dir, new THREE.Vector3(), lift); }

  // Random open ground at a given arc distance from a direction, away from settlements.
  site(fromDir, minD, maxD, wantDark = null) {
    const g = this.game;
    const up = fromDir.clone().normalize();
    for (let i = 0; i < 60; i++) {
      const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      const d = greatCircle(up, t, randRange(minD, maxD));
      if (g.locations.some((l) => arcDist(d, l.dir) < (l.zoneR || l.r) * 1.6)) continue;
      if (wantDark !== null && (darkness(d) > 0.5) !== wantDark) continue;
      return d;
    }
    return greatCircle(up, tangent(new THREE.Vector3(1, 0, 0), up).normalize(), minD);
  }

  // A pickup spot inside a settlement (so events don't start just by arriving).
  depot(loc) {
    const a = loc.id === 'ilmb' ? -2.3 : 0.9;
    const r = loc.id === 'ilmb' ? 160 : loc.r * 0.5;
    return this.ground(this.game.world.toWorld(loc, Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  nearestSafe(dir, { lit = false } = {}) {
    let best = null, bd = Infinity;
    for (const l of this.game.locations) {
      if (!l.safe || l.restricted || l.type === 'pirate' || l.poi) continue;
      if (lit && l.dark) continue;
      const d = arcDist(dir, l.dir);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  marker(pos, faction, label) {
    const g = new THREE.Group();
    const up = pos.clone().normalize();
    g.position.copy(pos);
    frameQuat(up, new THREE.Vector3(1, 0, 0), g.quaternion);
    const col = new THREE.Color(FACTIONS[faction] ? FACTIONS[faction].color : '#ffffff');
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 400, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 200;
    g.add(beam);
    const s = textSprite(label, { color: '#ffffff', size: 64, scale: 0.7, bg: FACTIONS[faction] ? FACTIONS[faction].color : '#3a3550' });
    s.position.y = 22;
    g.add(s);
    this.game.scene.add(g);
    return g;
  }

  removeMarker(ev) {
    if (ev.marker) { this.game.scene.remove(ev.marker); ev.marker = null; }
    for (const o of ev.props || []) o.removeFromParent();
    ev.props = [];
  }

  hasClearance() { return false; }

  isRaidTarget(loc) {
    const a = this.active;
    return !!(a && a.type === 'raid' && a.target === loc);
  }

  objective() {
    const a = this.active;
    if (!a || !a.goal) return null;
    return { pos: a.goal, label: a.goalLabel || a.title };
  }

  // ---------- event creation ----------
  create(faction) {
    const type = pick(TYPES[faction]);
    const ev = this.build(faction, type);
    if (!ev) return null;
    ev.id = this.nextId++;
    ev.faction = faction;
    ev.type = type;
    ev.state = 'open';
    ev.age = 0;
    ev.props = ev.props || [];
    ev.reward = Math.round(((ev.reward || 400) * 0.5 * Math.max(0.8, this.game.rep.payMultiplier(faction) || 1)) / 10) * 10;
    ev.marker = this.marker(ev.start, faction, `${ICON[type] || '!'} ${ev.short || ev.title}`);
    if (ev.needsCrawler) {
      ev.model = this.makeCrawler(ev);
      ev.model.root.position.copy(ev.start);
      frameQuat(ev.spotDir, tangent(new THREE.Vector3(1, 0, 0), ev.spotDir), ev.model.root.quaternion);
      ev.model.root.rotateZ(0.25);
    }
    this.list.push(ev);
    const g = this.game;
    g.hud.toast(`📡 ${FACTIONS[faction].name.toUpperCase()}: ${ev.title}`, 4);
    return ev;
  }

  build(faction, type) {
    const g = this.game;
    const L = (id) => g.locations.find((l) => l.id === id);
    const hq = L(FACTIONS[faction].hq);
    switch (type) {
      case 'clearCamp': {
        const lairs = g.enemies.lairs.filter((l) => g.enemies.lairActive(l) && !l.hq);
        if (!lairs.length) return null;
        const target = lairs.sort((a, b) => arcDist(a.dir, hq.dir) - arcDist(b.dir, hq.dir))[Math.floor(Math.random() * Math.min(3, lairs.length))];
        return {
          title: `Clear out ${target.name}`, short: 'CLEAR DEN', target,
          brief: `Destroy the signal pylon at ${target.name}. Its guards will fight back.`,
          start: target.pos.clone(), startR: 650, reward: 650,
        };
      }
      case 'strike': {
        const enemy = FACTIONS[faction].enemy;
        const opts = g.locations.filter((l) => l.faction === enemy && l.restricted);
        const target = opts.find((l) => l.small) || opts[0];
        return {
          title: `Strike ${target.name}`, short: 'STRIKE', target, need: 3,
          brief: `${FACTIONS[faction].name} wants ${target.name} softened up. Destroy 3 of its turrets.`,
          start: target.pos.clone(), startR: 700, reward: 900,
        };
      }
      case 'seismic': {
        const station = pick(g.locations.filter((l) => l.faction === faction && l.safe && !l.restricted));
        const siteDir = this.site(station.dir, 700, 1400);
        return {
          title: 'Seismic survey', short: 'SURVEY', station, siteDir,
          brief: `Collect the seismograph at ${station.name}, plant it at the survey site and protect it while it records.`,
          start: this.depot(station), startR: 18, reward: 700,
        };
      }
      case 'blackLake': {
        const station = pick(g.locations.filter((l) => l.faction === faction && l.safe && !l.restricted));
        const lakes = g.world.lakes;
        if (!lakes.length) return null;
        const lake = lakes.slice().sort((a, b) => arcDist(a.d, station.dir) - arcDist(b.d, station.dir))[0];
        const dist = arcDist(lake.d, station.dir);
        return {
          title: 'Black lake sample', short: 'SAMPLE', station, lake, time: Math.round((dist * 2) / 32 + 70),
          brief: `Take a vacuum tube from ${station.name}, fill it at the black lake and bring it back. Don't slosh it — and don't crash.`,
          start: this.depot(station), startR: 18, reward: 750 + Math.round(dist * 0.15),
        };
      }
      case 'escort': {
        const from = pick(g.locations.filter((l) => l.safe && !l.restricted && l.type !== 'pirate' && !l.poi));
        const spot = this.site(from.dir, 900, 1700);
        return {
          title: 'Downed transit', short: 'ESCORT', spotDir: spot,
          brief: 'A transit crawler broke down out in the open. Escort it to the nearest outpost before raiders tear it apart.',
          start: this.ground(spot), startR: 45, reward: 800, needsCrawler: true,
        };
      }
      case 'pods':
      case 'relay': {
        const near = pick(g.locations.filter((l) => l.faction === faction && l.safe));
        const center = this.site(near.dir, 600, 1300);
        const relay = type === 'relay';
        return {
          title: relay ? 'Relay sweep' : 'Supply drop rescue', short: relay ? 'RELAYS' : 'PODS', center, count: 4, time: 115,
          brief: relay ? 'A comms storm knocked out four relay beacons. Touch all of them before SPACECOM loses the link.' : 'A supply drop scattered pods across the regolith. Grab all four before they freeze.',
          start: this.ground(center), startR: 320, reward: 550,
        };
      }
      case 'raid': {
        const rep = g.rep.get('rustmoon');
        const tiers = [
          { min: -999, ids: ['tranq', 'aldrin', 'twilight', 'hertz'] },
          { min: 10, ids: ['shackleton', 'mine', 'farside'] },
          { min: 25, ids: ['meridian', 'kepler'] },
          { min: 50, ids: ['ilmb'] },
        ];
        const pool = tiers.filter((t) => rep >= t.min).flatMap((t) => t.ids);
        const target = L(pick(pool.slice(-4)));
        const base = g.enemies.bases.find((b) => b.loc === target);
        if (!base) return null;
        const need = target.id === 'ilmb' ? 6 : Math.min(base.turrets.length, target.hq ? 3 : 2);
        return {
          title: `Raid ${target.name}`, short: 'RAID', target, need,
          brief: `Rustmoon wants ${target.name} shaken down. Knock out ${need} of its defenses.${target.id === 'ilmb' ? ' This is SPACECOM\'s fortress — bring everything.' : ''}`,
          start: target.pos.clone(), startR: 750, reward: target.id === 'ilmb' ? 3000 : 900 + need * 200,
        };
      }
    }
    return null;
  }

  // The Pirate Wreck: a one-time chance to earn Rustmoon's trust.
  spawnWreck() {
    const g = this.game;
    const near = g.locations.find((l) => l.id === 'twilight') || g.locations[0];
    const dir = this.site(near.dir, 1200, 2200, true);
    const pos = this.ground(dir);
    const up = dir.clone();
    const ship = makeFreighter({ color: 0x3a2b4f, stripe: 0x7dff3a });
    ship.root.scale.setScalar(0.45);
    ship.root.position.copy(pos).addScaledVector(up, 2);
    frameQuat(up, tangent(new THREE.Vector3(1, 0, 0), up), ship.root.quaternion);
    ship.root.rotateZ(0.35);
    ship.root.rotateX(0.2);
    g.scene.add(ship.root);
    const pirate = makeFigure({ suit: 0x3a2b4f, helmet: 0x2b2b2b, visor: 0x7dff3a });
    pirate.root.position.copy(pos).addScaledVector(tangent(new THREE.Vector3(0, 1, 0), up).normalize(), 9);
    frameQuat(up, tangent(new THREE.Vector3(1, 0, 0), up), pirate.root.quaternion);
    pirate.root.rotateX(-1.4);
    g.scene.add(pirate.root);
    const ev = {
      id: this.nextId++, faction: 'rustmoon', type: 'wreck', state: 'open', age: 0, special: true,
      title: 'Pirate Wreck', short: 'WRECK', start: pos.clone(), startR: 35, reward: 400,
      brief: 'A Rustmoon smuggler is pinned under a crashed ship, losing air. Get med supplies from the nearest lit outpost and get back before it runs out.',
      props: [ship.root, pirate.root],
    };
    ev.marker = this.marker(pos, 'rustmoon', '✖ SOS');
    this.list.push(ev);
    g.hud.toast('📡 WEAK DISTRESS SIGNAL FROM THE DARK SIDE…', 5);
    return ev;
  }

  // ---------- lifecycle ----------
  start(ev) {
    const g = this.game;
    if (this.active) { g.hud.toast('Finish your current event first.'); ev.cool = 6; return; }
    ev.state = 'active';
    ev.t = 0;
    this.active = ev;
    g.audio.pickup();
    g.hud.eventBanner(ev);
    const s = this['start_' + ev.type];
    if (s) s.call(this, ev);
  }

  complete(ev, text) {
    const g = this.game;
    const mult = ev.payFactor ?? 1;
    const credits = Math.round(ev.reward * mult);
    g.addCredits(credits, null);
    g.audio.cash();
    const repGain = ev.type === 'wreck' ? 0 : 8;
    if (repGain) g.rep.add(ev.faction, repGain, ev.title);
    if (ev.type === 'strike') g.rep.add(ev.target.faction, -4, `Struck ${ev.target.name}`, { war: false });
    if (ev.type === 'raid') { g.rep.add(ev.target.faction, -12, `Raided ${ev.target.name}`, { war: false }); g.rep.add('spacecom', -4, 'Piracy', { silent: true }); }
    g.hud.eventResult(ev, true, text || `+₵${credits}`);
    g.actionPanel('delivered', null, `${ev.title.toUpperCase()} — DONE!`);
    g.stats.events = (g.stats.events || 0) + 1;
    if (ev.faction === 'meridian') g.stats.meridianEvents = (g.stats.meridianEvents || 0) + 1;
    this.finish(ev);
    if (ev.type === 'wreck') g.wreckChoice();
  }

  fail(ev, reason) {
    const g = this.game;
    g.hud.eventResult(ev, false, reason);
    g.audio.hurt();
    if (ev.type === 'wreck') {
      g.rep.rustmoon = 'locked';
      g.rep.save();
      g.hud.alert('THE PIRATE DIDN\'T MAKE IT. RUSTMOON WILL NOT FORGET.', '#3a2b4f', 5);
    }
    this.finish(ev);
  }

  finish(ev) {
    const g = this.game;
    this.removeMarker(ev);
    for (const o of this.protect) if (o.mesh) o.mesh.removeFromParent();
    this.protect = this.protect.filter((o) => o.ev !== ev);
    if (this.carry) { this.carry.removeFromParent(); this.carry = null; }
    this.fluid = null;
    ev.state = 'done';
    this.list = this.list.filter((e) => e !== ev);
    if (this.active === ev) this.active = null;
    this.cooldown[ev.faction] = randRange(45, 90);
    g.hud.eventPanel(null);
  }

  abandon() {
    if (this.active) this.fail(this.active, 'Event abandoned.');
  }

  // ---------- per-type start/update ----------
  carryProp(obj, offset = [0, 0.2, -0.15]) {
    if (this.carry) this.carry.removeFromParent();
    obj.position.set(...offset);
    this.game.player.model.cargoSlot.add(obj);
    this.carry = obj;
  }

  start_clearCamp(ev) {
    ev.goal = ev.target.pos;
    ev.goalLabel = `DESTROY PYLON @ ${ev.target.short}`;
    this.game.enemies.spawnWave(ev.target.pos, 2, null, 220);
  }

  update_clearCamp(ev) {
    ev.status = `Pylon: ${Math.max(0, Math.round(ev.target.core.hp))} / ${ev.target.core.maxHp}`;
    ev.bar = ev.target.core.hp / ev.target.core.maxHp;
  }

  start_strike(ev) {
    ev.kills = 0;
    ev.goal = ev.target.pos;
    ev.goalLabel = `STRIKE ${ev.target.short}`;
  }

  update_strike(ev) {
    ev.status = `Turrets destroyed: ${ev.kills} / ${ev.need}`;
    ev.bar = ev.kills / ev.need;
    if (ev.kills >= ev.need) this.complete(ev);
  }

  start_raid(ev) { this.start_strike(ev); ev.goalLabel = `RAID ${ev.target.short}`; }
  update_raid(ev) { this.update_strike(ev); }

  start_seismic(ev) {
    const m = makeSeismo();
    m.root.scale.setScalar(0.5);
    this.carryProp(m.root);
    ev.phase = 'carry';
    ev.site = this.ground(ev.siteDir);
    ev.goal = ev.site;
    ev.goalLabel = 'PLANT SEISMOGRAPH';
    ev.siteMarker = this.marker(ev.site, ev.faction, '≋ SURVEY SITE');
    ev.props.push(ev.siteMarker);
  }

  update_seismic(ev, dt) {
    const g = this.game;
    const P = g.player;
    if (ev.phase === 'carry') {
      ev.status = 'Carry the seismograph to the survey site.';
      if (P.pos.distanceTo(ev.site) < 22) {
        if (this.carry) { this.carry.removeFromParent(); this.carry = null; }
        const m = makeSeismo();
        const up = ev.site.clone().normalize();
        m.root.position.copy(ev.site);
        frameQuat(up, tangent(new THREE.Vector3(1, 0, 0), up), m.root.quaternion);
        g.scene.add(m.root);
        ev.props.push(m.root);
        ev.obj = { ev, center: ev.site.clone().addScaledVector(up, 2), vel: new THREE.Vector3(), radius: 2.2, hp: 420, maxHp: 420, dead: false, label: 'SEISMOGRAPH', mesh: null, light: m.light };
        this.protect.push(ev.obj);
        ev.phase = 'record';
        ev.timer = 45;
        ev.waveT = 0;
        g.fx.pop('PLANTED!', null, { color: '#2ec4ff', size: 60 });
        ev.goalLabel = 'DEFEND THE SEISMOGRAPH';
      }
    } else {
      ev.timer -= dt;
      ev.waveT -= dt;
      if (ev.waveT <= 0) { g.enemies.spawnWave(ev.site, 2, ev.obj); ev.waveT = 18; }
      ev.obj.light.visible = Math.sin(g.time * 8) > 0;
      ev.status = `Recording… ${Math.ceil(ev.timer)}s · Seismograph ${Math.round(ev.obj.hp)}`;
      ev.bar = ev.obj.hp / ev.obj.maxHp;
      if (ev.obj.dead) this.fail(ev, 'The seismograph was destroyed.');
      else if (ev.timer <= 0) this.complete(ev);
    }
  }

  start_blackLake(ev) {
    const tube = makeTube();
    tube.fluid.scale.y = 0.02;
    this.carryProp(tube.root);
    ev.tube = tube;
    ev.phase = 'toLake';
    ev.timer = ev.time;
    ev.fill = 0;
    ev.goal = this.ground(ev.lake.d);
    ev.goalLabel = 'FILL AT THE BLACK LAKE';
  }

  update_blackLake(ev, dt) {
    const g = this.game;
    const P = g.player;
    ev.timer -= dt;
    if (ev.timer <= 0) { this.fail(ev, 'The sample window closed.'); return; }
    if (ev.phase === 'toLake') {
      ev.status = 'Skate onto the black lake to fill the vacuum tube.';
      if (P.body.onLake === ev.lake && P.body.grounded) {
        ev.fill = Math.min(1, ev.fill + dt / 2.5);
        ev.status = `Filling… ${Math.round(ev.fill * 100)}%`;
        if (Math.random() < dt * 20) g.fx.spawn(P.pos, P.up.clone().multiplyScalar(4), { color: 0x3a2b6f, size: 0.4, life: 0.5, count: 1, spread: 2 });
      }
      ev.tube.fluid.scale.y = Math.max(0.02, ev.fill);
      ev.bar = ev.fill;
      if (ev.fill >= 1) {
        ev.phase = 'deliver';
        this.fluid = { level: 1, crack: 0, sx: 0, sy: 0, vx: 0, vy: 0, spill: 0 };
        ev.goal = ev.station.pos;
        ev.goalLabel = `DELIVER SAMPLE @ ${ev.station.short}`;
        g.fx.pop('SEALED!', null, { color: '#c77dff', size: 60 });
      }
    } else {
      const f = this.fluid;
      this.slosh(f, dt);
      ev.tube.fluid.scale.y = Math.max(0.02, f.level);
      ev.status = `Fluid ${Math.round(f.level * 100)}%${f.crack > 0.05 ? ' · CRACKED — LEAKING' : ''}`;
      ev.bar = f.level;
      if (f.level < 0.25) { this.fail(ev, 'Too much fluid lost — the sample is useless.'); return; }
      if (arcDist(P.pos, ev.station.dir) < ev.station.r * 0.75) {
        ev.payFactor = 0.3 + 0.7 * f.level;
        this.complete(ev, `${Math.round(f.level * 100)}% of the sample delivered`);
      }
    }
  }

  // Fluid in a vacuum tube: a damped spring driven by your acceleration. Jerk it around and
  // it sloshes past the seal and spills; hard knocks crack the glass and it leaks.
  slosh(f, dt) {
    const P = this.game.player;
    const a = P.accel || _v.set(0, 0, 0);
    const fwd = P.heading, right = _v.clone().crossVectors(P.heading, P.up);
    const ax = THREE.MathUtils.clamp(a.dot(right), -200, 200), ay = THREE.MathUtils.clamp(a.dot(fwd), -200, 200);
    const k = 22, c = 1.6, gain = 0.07;
    f.vx += (-k * f.sx - c * f.vx - ax * gain) * dt;
    f.vy += (-k * f.sy - c * f.vy - ay * gain) * dt;
    f.sx += f.vx * dt;
    f.sy += f.vy * dt;
    const amp = Math.hypot(f.sx, f.sy);
    f.spill = 0;
    if (amp > 1) {
      f.spill = (amp - 1) * 0.6 * dt;
      f.level -= f.spill;
      f.sx /= amp; f.sy /= amp;
      f.vx *= 0.6; f.vy *= 0.6;
      if (Math.random() < 0.3) this.game.fx.spawn(P.center.clone().addScaledVector(P.up, 0.5), P.up.clone().multiplyScalar(3), { color: 0x2a1f4f, size: 0.25, life: 0.6, gravity: 3, count: 2, spread: 2 });
    }
    if (f.crack > 0) f.level -= f.crack * 0.02 * dt;
  }

  // Called by the player on hard impacts: splash the fluid and maybe crack the tube.
  onImpact(speed) {
    const f = this.fluid;
    if (!f) return;
    const cradle = 1 - (this.game.upgrades.cradle || 0) * 0.3;
    f.vy += speed * 0.05;
    f.vx += (Math.random() - 0.5) * speed * 0.05;
    if (speed > 16) {
      f.crack = Math.min(1, f.crack + (speed - 16) * 0.03 * cradle);
      this.game.fx.pop('CRACK!', null, { color: '#c77dff', size: 50 });
    }
  }

  start_escort(ev) {
    const g = this.game;
    const dest = this.nearestSafe(ev.spotDir);
    ev.dest = dest;
    ev.goal = dest.pos;
    ev.goalLabel = `ESCORT TO ${dest.short}`;
    ev.obj = { ev, center: ev.start.clone(), vel: new THREE.Vector3(), radius: 4, hp: 700, maxHp: 700, dead: false, label: 'TRANSIT' };
    this.protect.push(ev.obj);
    ev.dir = ev.spotDir.clone();
    ev.waveT = 6;
    if (!ev.model) ev.model = this.makeCrawler(ev);
    ev.model.root.rotation.set(0, 0, 0);
  }

  makeCrawler(ev) {
    const r = makeRover({ color: 0xffd23f, trim: 0xfff4e0, pirate: false, flag: FACTIONS[ev.faction].color === '#2ec4ff' ? 0x2ec4ff : 0xff9f1c });
    r.root.scale.setScalar(1.4);
    this.game.scene.add(r.root);
    ev.props.push(r.root);
    return r;
  }

  update_escort(ev, dt) {
    const g = this.game;
    const P = g.player;
    const o = ev.obj;
    const pos = this.ground(ev.dir);
    const near = P.pos.distanceTo(pos) < 260;
    const left = arcDist(ev.dir, ev.dest.dir);
    if (near) {
      const step = Math.min(left, 13 * dt);
      const t = tangent(ev.dest.dir.clone().sub(ev.dir), ev.dir).normalize();
      const before = pos.clone();
      ev.dir = greatCircle(ev.dir, t, step);
      const after = this.ground(ev.dir);
      o.vel.copy(after).sub(before).divideScalar(Math.max(dt, 1e-3));
      ev.model.root.position.copy(after);
      frameQuat(ev.dir, t, ev.model.root.quaternion);
      for (const w of ev.model.wheels) w.rotation.x += dt * 10;
    } else {
      o.vel.set(0, 0, 0);
      ev.model.root.position.copy(pos);
    }
    o.center.copy(ev.model.root.position).addScaledVector(ev.dir, 2);
    ev.waveT -= dt;
    if (ev.waveT <= 0) { g.enemies.spawnWave(o.center, 2 + Math.floor(Math.random() * 2), o, 380); ev.waveT = 24; }
    ev.status = `${near ? 'Rolling' : 'WAITING FOR ESCORT'} · ${Math.round(left)}m to go · Hull ${Math.round(o.hp)}`;
    ev.bar = o.hp / o.maxHp;
    if (o.dead) this.fail(ev, 'The transit was destroyed.');
    else if (left < ev.dest.r * 0.6) this.complete(ev);
  }

  start_pods(ev) {
    const g = this.game;
    ev.pods = [];
    const up = ev.center.clone();
    for (let i = 0; i < ev.count; i++) {
      const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      const p = this.ground(greatCircle(up, t, 80 + Math.random() * 280), 1);
      const crate = makeCrate(ev.type === 'relay' ? 0x2ec4ff : 0xff9f1c, 1.6);
      crate.position.copy(p);
      frameQuat(p.clone().normalize(), new THREE.Vector3(1, 0, 0), crate.quaternion);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: ev.type === 'relay' ? 0x2ec4ff : 0xff9f1c, transparent: true, opacity: 0.4, depthWrite: false }));
      beam.position.y = 45;
      crate.add(beam);
      g.scene.add(crate);
      ev.props.push(crate);
      ev.pods.push({ pos: p, mesh: crate, got: false });
    }
    ev.timer = ev.time;
    ev.goalLabel = ev.type === 'relay' ? 'TOUCH RELAY' : 'GRAB POD';
  }

  update_pods(ev, dt) {
    const g = this.game;
    const P = g.player;
    ev.timer -= dt;
    let left = 0, nearest = null, nd = Infinity;
    for (const p of ev.pods) {
      if (p.got) continue;
      p.mesh.rotateY(dt * 2);
      const d = p.pos.distanceTo(P.pos);
      if (d < 6) {
        p.got = true;
        p.mesh.removeFromParent();
        g.audio.pickup();
        g.fx.pop(ev.type === 'relay' ? 'RELAY ONLINE!' : 'GOT ONE!', null, { color: '#ffd23f', size: 50 });
        continue;
      }
      left++;
      if (d < nd) { nd = d; nearest = p; }
    }
    ev.goal = nearest ? nearest.pos : null;
    const total = ev.pods.length;
    ev.status = `${total - left} / ${total} · ${Math.ceil(ev.timer)}s`;
    ev.bar = (total - left) / total;
    if (!left) this.complete(ev);
    else if (ev.timer <= 0) this.fail(ev, 'Out of time.');
  }

  start_relay(ev) { this.start_pods(ev); }
  update_relay(ev, dt) { this.update_pods(ev, dt); }

  start_wreck(ev) {
    const g = this.game;
    const out = this.nearestSafe(ev.start.clone().normalize(), { lit: true });
    ev.outpost = out;
    ev.phase = 'fetch';
    const dist = arcDist(ev.start, out.dir);
    ev.timer = Math.round((dist * 2) / 30 + 60);
    ev.goal = out.pos;
    ev.goalLabel = `MED SUPPLIES @ ${out.short}`;
    g.dialog('PIRATE WRECK', `"Hey… you. Runner. I'm stuck under this junk and my air's going. ${out.name} has med-kits. Please… ${ev.timer} seconds, maybe less."`, [{ label: 'ON MY WAY' }]);
  }

  update_wreck(ev, dt) {
    const P = this.game.player;
    ev.timer -= dt;
    ev.bar = Math.max(0, ev.timer) / 300;
    if (ev.timer <= 0) { this.fail(ev, 'The pirate ran out of air.'); return; }
    if (ev.phase === 'fetch') {
      ev.status = `Get med supplies from ${ev.outpost.name} · ${Math.ceil(ev.timer)}s of air left`;
      if (arcDist(P.pos, ev.outpost.dir) < ev.outpost.r * 0.75) {
        ev.phase = 'return';
        ev.goal = ev.start;
        ev.goalLabel = 'BACK TO THE WRECK';
        const kit = makeCrate(0xff3b5c, 0.6);
        this.carryProp(kit);
        this.game.fx.pop('MED-KIT!', null, { color: '#ff3b5c', size: 60 });
      }
    } else {
      ev.status = `Get back to the wreck · ${Math.ceil(ev.timer)}s of air left`;
      if (P.pos.distanceTo(ev.start) < 30) this.complete(ev, 'The pirate lives.');
    }
  }

  // ---------- per-frame ----------
  onKill(e) {
    const a = this.active;
    if (!a) return;
    if ((a.type === 'strike' || a.type === 'raid') && e.kind === 'turret' && e.base.loc === a.target) a.kills++;
    if (a.type === 'clearCamp' && e.kind === 'core' && e.lair === a.target) this.complete(a);
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    // post new events: one per faction
    for (const f of Object.keys(TYPES)) {
      if (f === 'rustmoon' && !g.rep.aligned()) continue;
      if (this.list.some((e) => e.faction === f && !e.special)) continue;
      this.cooldown[f] -= dt;
      if (this.cooldown[f] <= 0) {
        if (!this.create(f)) this.cooldown[f] = 20;
      }
    }
    if (g.rep.rustmoon === 'unknown' && !this.list.some((e) => e.type === 'wreck')) {
      this.wreckTimer -= dt;
      if (this.wreckTimer <= 0) this.spawnWreck();
    }
    for (const ev of this.list.slice()) {
      if (ev.state === 'open') {
        ev.age += dt;
        if (ev.cool > 0) ev.cool -= dt;
        if (!ev.special && ev.age > OPEN_LIFETIME) { this.removeMarker(ev); this.list = this.list.filter((e) => e !== ev); this.cooldown[ev.faction] = 10; continue; }
        if (ev.marker) ev.marker.children[1].material.rotation = Math.sin(g.time * 2) * 0.05;
        if (!P.dead && !(ev.cool > 0) && P.pos.distanceTo(ev.start) < ev.startR) this.start(ev);
      } else if (ev.state === 'active') {
        ev.t += dt;
        const u = this['update_' + ev.type];
        if (u) u.call(this, ev, dt);
      }
    }
    if (this.active) g.hud.eventPanel(this.active, this.fluid);
  }
}
