import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeBody, stepSkater } from './physics.js';
import { makeRunner, makeRover, makeTurret, makeCrate, makePylon, ScarfSim } from './models.js';
import { randRange } from './rng.js';
import { FACTIONS } from './locations.js';
import { frameQuat, greatCircle, arcDist, darkness, tangent } from './geo.js';
import { FOES, BOSS_MODELS } from './storyAssets.js';

const PIRATE_SKATER = { ...PHYS, skatePushMax: 34, thrustAccel: 13, maxEnergy: 120, handling: 2.2 };
const MAX_PIRATES = 6;
// roaming hunters (squads, not den guards or event raiders) are capped per kind, and give up once
// you're further than THREAT_RANGE away (a clean escape at speed loses them)
const MAX_HUNTERS = { skater: 4, rover: 2 };
const THREAT_RANGE = 700;
const DEN_RESPAWN = 300; // seconds until a destroyed pirate den repopulates
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _near = [];
const _sv = new THREE.Vector3();
const _sn = new THREE.Vector3();

function steerToward(heading, up, target, maxAngle) {
  const t = tangent(target, up).normalize();
  heading.addScaledVector(up, -heading.dot(up)).normalize();
  const ang = Math.atan2(_v.crossVectors(heading, t).dot(up), heading.dot(t));
  heading.applyQuaternion(_q.setFromAxisAngle(up, THREE.MathUtils.clamp(ang, -maxAngle, maxAngle)));
}

// Wheeled vehicle on the sphere: engine along heading, strong lateral grip and downforce.
// stick: hold the ground over crests and bumps (pirate and military rovers). It's the speed above
// which a real crest may throw the rig clear (a pirate ram run at full tilt); below it the rig
// snaps back down over crests, and once airborne it's pulled down hard
export function stepRover(e, dt, planet, colliders, targetDir, maxSpeed, { engine = 16, grip = 0, turn = 1.8, radius = 2.4, stick = false, traction = 0, weight = 1 } = {}) {
  const b = e.body;
  const up = b.up.copy(b.pos).normalize();
  steerToward(e.heading, up, targetDir, (turn / (1 + b.vel.length() / 60)) * dt);
  const launchy = stick && b.vel.length() > stick;
  // (weight: a vehicle you're driving comes down harder than a runner in the air)
  b.vel.addScaledVector(up, -PHYS.gravity * (stick && !b.grounded ? (launchy ? 2.2 : 5) : 1) * (b.grounded ? 1 : weight) * dt);
  const n = b.groundN;
  if (b.grounded) {
    const fwd = _v.copy(e.heading).addScaledVector(n, -e.heading.dot(n)).normalize();
    const along = b.vel.dot(fwd);
    b.vel.addScaledVector(fwd, along < maxSpeed ? engine * dt : -engine * 0.5 * dt);
    const vn = b.vel.dot(n);
    const lat = b.vel.clone().addScaledVector(fwd, -b.vel.dot(fwd)).addScaledVector(n, -vn);
    b.vel.addScaledVector(lat, -Math.min(1, (traction || (grip ? 9 : 5)) * dt)); // how hard the tyres resist sliding sideways
  }
  // downforce keeps the heavy pirate rigs planted over crests
  if (grip && (b.grounded || b.altitude < 3)) b.vel.addScaledVector(n, -grip * dt);
  const sp = b.vel.length();
  b.pos.addScaledVector(b.vel, dt);
  const sr = planet.surface(b.pos, _n);
  const len = b.pos.length();
  b.altitude = len - sr;
  if (len <= sr + 0.05) {
    b.pos.multiplyScalar(sr / len);
    const vn = b.vel.dot(_n);
    if (vn < 0) b.vel.addScaledVector(_n, -vn);
    b.grounded = true;
    b.groundN.lerp(_n, 0.3).normalize();
  } else if (stick && b.wasGround && len - sr < 1.5 + sp * 0.06 && (!launchy || b.vel.dot(_n) < 3 + sp * 0.06)) {
    b.pos.multiplyScalar(sr / len);
    const vn = b.vel.dot(_n);
    if (vn > 0) b.vel.addScaledVector(_n, -vn);
    b.grounded = true;
    b.altitude = 0;
    b.groundN.lerp(_n, 0.3).normalize();
  } else b.grounded = len - sr < 0.4;
  b.wasGround = b.grounded;
  if (colliders) {
    const cp = b.pos.clone().addScaledVector(up, radius * 0.7);
    for (const c of colliders.query(cp, radius + 3, _near)) {
      if (c.platform) continue;
      const pen = colliders.contact(c, cp, radius, _n);
      if (pen > 0) {
        b.pos.addScaledVector(_n, pen);
        cp.addScaledVector(_n, pen);
        const vn = b.vel.dot(_n);
        if (vn < 0) b.vel.addScaledVector(_n, -vn * 1.3);
      }
    }
  }
}

// Pirates, base defenses (turrets + patrols at every settlement), restricted military
// zones and destructible pirate dens.
export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.drops = [];
    this.pirateTimer = 25;
    this.darkTimer = 15;
    this.lairTimer = 0;
    this.bases = [];
    this._targets = [];
    this.lairs = game.locations.filter((l) => l.type === 'pirate');
    // (a fallen SPACECOM has no guns left to man: worldstate.js)
    for (const loc of game.locations) if ((loc.restricted || loc.defense) && !loc.lawless) this.setupBase(loc);
    for (const l of this.lairs) this.setupCore(l);
  }

  ground(dir, lift = 0) { return this.game.planet.ground(dir, new THREE.Vector3(), lift); }

  setupBase(loc) {
    const g = this.game;
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const base = { loc, faction: loc.faction, restricted: !!loc.restricted, time: 0, hostile: false, aggro: 0, outside: 0, artyCd: 0, warnBeep: 0, turrets: [], patrols: [], awake: false, inside: false };
    base.group = new THREE.Group();
    const spots = [];
    let patrols = 0;
    if (loc.restricted) {
      const small = !!loc.small;
      const inner = small ? 3 : 4, outer = small ? 2 : 4;
      for (let i = 0; i < inner; i++) spots.push([(i / inner) * Math.PI * 2 + 0.4, small ? 68 : 112]);
      for (let i = 0; i < outer; i++) spots.push([(i / outer) * Math.PI * 2 + 1.2, small ? 180 : 290]);
      patrols = small ? 1 : 2;
    } else {
      const d = loc.defense;
      for (let i = 0; i < d.turrets; i++) spots.push([(i / d.turrets) * Math.PI * 2 + 0.2, d.ring]);
      for (let i = 0; i < (d.inner || 0); i++) spots.push([(i / d.inner) * Math.PI * 2 + 0.8, d.ring * 0.55]);
      patrols = d.patrols || 0;
    }
    const heavy = loc.id === 'ilmb';
    // world.js lays out the gun mounts (wall bastions, gate towers, pylons) in loc.turretMounts;
    // fall back to bare ground spots on the defense ring for anything it didn't.
    const mounts = loc.turretMounts || spots.map(([a, r]) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0, ground: true }));
    for (const m of mounts) {
      let p, up;
      if (m.ground) {
        p = this.ground(g.world.toWorld(loc, m.x, 0, m.z), -0.3);
        up = p.clone().normalize();
      } else {
        p = g.world.toWorld(loc, m.x, m.y, m.z);
        up = loc.dir.clone();
      }
      const t = makeTurret({ color: fc });
      if (heavy) t.root.scale.setScalar(1.35);
      t.root.position.copy(p);
      frameQuat(up, g.world.toWorld(loc, 0, m.y, 0).sub(p), t.root.quaternion);
      base.group.add(t.root);
      const hp = heavy ? 650 : 420; // tanky: the head is what you knock out
      const e = { kind: 'turret', faction: 'mil', base, model: t, hp, maxHp: hp, heavy, fireCd: Math.random() * 2, center: p.clone().addScaledVector(up, heavy ? 4 : 3), radius: heavy ? 3 : 2.2, dead: false, respawn: 0, up, wall: !!m.wall };
      base.turrets.push(e);
      this.list.push(e);
      (base.cols ||= []).push(g.colliders.add({ type: 'cyl', c: p.clone(), axis: up, y0: -1, y1: heavy ? 5 : 3.8, r: heavy ? 3 : 2.2 }));
    }
    for (let i = 0; i < patrols; i++) this.spawnPatrol(base, i);
    // a town that's hostile to you shows it: a red zone wall round its defence ring (only drawn while
    // its faction counts you an enemy; restricted bases have their own)
    if (!loc.restricted && loc.defense && loc.type !== 'hometown') {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xff2a4a) }, alert: { value: 0.5 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
        fragmentShader: 'uniform float time; uniform vec3 color; uniform float alert; varying vec2 vUv; varying vec3 vW; void main(){ float s = step(0.5, fract((vW.x+vW.z)*0.04 + vW.y*0.04 - time*0.3)); gl_FragColor = vec4(color, (0.1 + 0.22*s + alert*0.2) * (1.0 - vUv.y)); }',
      });
      const R = loc.defense.ring + 30;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 120, 72, 1, true), mat);
      wall.position.copy(g.world.toWorld(loc, 0, 40, 0));
      wall.quaternion.copy(loc.group.quaternion);
      wall.visible = false;
      base.group.add(wall);
      base.hostileWall = wall;
    }
    this.bases.push(base);
  }

  // A finale reshaped these places (main.js applyWorldLive): their turrets, patrols and pylons are
  // rebuilt for what they are now (a ruin has none, a resettled den gets turrets, a taken town a pylon).
  refreshLocations(locs) {
    const g = this.game;
    for (const loc of locs) {
      for (const base of this.bases.filter((b) => b.loc === loc)) {
        base.group.removeFromParent();
        for (const c of base.cols || []) g.colliders.remove(c);
        this.list = this.list.filter((e) => e.base !== base);
      }
      this.bases = this.bases.filter((b) => b.loc !== loc);
      if (loc.core) {
        const core = loc.core;
        core.model.root.removeFromParent();
        this.list = this.list.filter((e) => e !== core);
        loc.core = null;
      }
      if ((loc.restricted || loc.defense) && !loc.lawless) this.setupBase(loc);
      if (loc.type === 'pirate') this.setupCore(loc);
    }
    this.lairs = g.locations.filter((l) => l.type === 'pirate');
  }

  spawnPatrol(base, i) {
    const loc = base.loc;
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const a = i * ((Math.PI * 2) / 3) + Math.random();
    const R = (loc.zoneR || loc.r) * 0.55;
    const p = this.ground(this.game.world.toWorld(loc, Math.cos(a) * R, 0, Math.sin(a) * R));
    const m = makeRover({ color: 0x55607a, trim: fc, pirate: false, flag: fc, style: 'military' });
    m.root.scale.setScalar(1.15);
    base.group.add(m.root);
    const e = {
      kind: 'milrover', faction: 'mil', base, model: m, hp: 160, maxHp: 160, fireCd: 2,
      heading: tangent(loc.dir, p.clone().normalize()).normalize(),
      body: makeBody(p), center: new THREE.Vector3(), radius: 3.2, dead: false, patrolA: a, slot: i, patrolR: R,
    };
    base.patrols.push(e);
    this.list.push(e);
    return e;
  }

  // Every pirate den has a signal pylon: destroy it to shut the den down for a while.
  setupCore(l) {
    const g = this.game;
    const off = l.camp ? [0, 18] : [24, 24];
    const p = this.ground(g.world.toWorld(l, off[0], 0, off[1]));
    const up = p.clone().normalize();
    const m = makePylon();
    m.root.position.copy(p);
    frameQuat(up, l.dir.clone().sub(up), m.root.quaternion);
    g.scene.add(m.root);
    const hp = l.hq ? 900 : l.camp ? 260 : 450;
    const e = { kind: 'core', faction: 'pirate', lair: l, model: m, hp, maxHp: hp, center: p.clone().addScaledVector(up, 6), radius: 3.2, dead: false, respawn: 0 };
    l.core = e;
    this.list.push(e);
  }

  lairActive(l, time = this.game.time) { return !(l.destroyedUntil && time < l.destroyedUntil); }

  // foe: whose troops these are (storyAssets FOES: a story chapter's SPACECOM, Vostok or Daedalus
  // soldiers wear and drive their own kit). They all fight as hostiles ('pirate' to the AI).
  spawnPirate(kind, pos, home = null, { rogue = false, targetObj = null, foe = 'rustmoon' } = {}) {
    const g = this.game;
    pos = this.ground(pos, 0.5);
    let e;
    const up = pos.clone().normalize();
    const F = FOES[foe] || FOES.rustmoon;
    if (kind === 'skater') {
      const m = makeRunner({ ...F.look });
      g.scene.add(m.root);
      e = { kind, model: m, hp: 70, maxHp: 70, body: makeBody(pos), radius: 1.3 };
      e.body.maxEnergy = e.body.energy = PIRATE_SKATER.maxEnergy;
    } else if (F.rover) {
      // faction troops drive their own armoured cars
      const m = makeRover({ color: F.rover.color, trim: F.rover.trim, flag: F.rover.flag, pirate: false, style: F.rover.civil ? 'civil' : 'military' });
      m.root.scale.setScalar(1.3);
      g.scene.add(m.root);
      e = { kind: 'rover', model: m, hp: 210, maxHp: 210, body: makeBody(pos), radius: 3.8 };
    } else {
      // pirate war-rigs: big, heavy, planted and fast
      const m = makeRover({ color: 0x7b2ff7, trim: 0x7dff3a, pirate: true });
      m.root.scale.setScalar(1.35); // (Captain Kade's truck is the big one)
      g.scene.add(m.root);
      e = { kind: 'rover', model: m, hp: 210, maxHp: 210, body: makeBody(pos), radius: 4.0 };
    }
    const toP = tangent(g.player.pos.clone().sub(pos), up);
    if (toP.lengthSq() < 1e-4) toP.copy(tangent(new THREE.Vector3(1, 0, 0), up));
    Object.assign(e, { faction: 'pirate', state: 'chase', grab: 0, carrying: false, fireCd: randRange(1, 3), center: new THREE.Vector3(), dead: false, impacts: [], heading: toP.normalize(), home, rogue, targetObj, aggro: false, wander: null });
    if (foe !== 'rustmoon') Object.assign(e, { foe, shotColor: F.shot, glowColor: F.glow });
    this.list.push(e);
    if (pos.distanceTo(g.player.pos) < 700 && !this.friendly(e)) g.fx.pop(foe !== 'rustmoon' ? F.label : rogue ? 'RENEGADES!' : 'PIRATES!', pos.clone().addScaledVector(up, 6), { color: '#' + new THREE.Color(F.glow).getHexString(), size: 56 });
    return e;
  }

  // A chapter boss: one of the faction war machines (storyAssets BOSS_MODELS), driven by the rover
  // AI with its own habits (the convoy keeps to its route, the Warden hovers and blinks, the Hammer
  // rams and shells).
  spawnBoss(pos, boss, foe = 'rustmoon') {
    const g = this.game;
    pos = this.ground(pos, 0.5);
    const M = (BOSS_MODELS[boss.model] || BOSS_MODELS.hammer)();
    M.root.scale.setScalar(1.25); // (bosses read as bosses: bigger than anything else out there)
    M.radius *= 1.25;
    M.rideH *= 1.25;
    g.scene.add(M.root);
    const F = FOES[foe] || FOES.rustmoon;
    const up = pos.clone().normalize();
    const e = {
      kind: 'rover', model: M, hp: boss.hp, maxHp: boss.hp, body: makeBody(pos), radius: M.radius, rideH: M.rideH, hover: !!M.hover,
      boss: boss.model, bossName: boss.name, foe, shotColor: F.shot, glowColor: F.glow,
      faction: 'pirate', state: 'chase', grab: 0, carrying: false, fireCd: 2, center: new THREE.Vector3(), dead: false, impacts: [],
      heading: tangent(new THREE.Vector3(1, 0, 0), up).normalize(), home: null, rogue: true, targetObj: null, aggro: false, wander: null,
      route: pos.clone(), routeA: 0, blinkCd: 6, shellCd: 3,
    };
    this.list.push(e);
    return e;
  }

  // ---------- allied backup (story captures and assaults) ----------
  // Friendly troops in your faction's colours roll in when a big fight starts and go after whatever
  // the chapter has you fighting. Faction 'ally': your shots and blasts pass them by, theirs never
  // touch you.
  spawnAlly(kind, pos, foe, anchor) {
    const g = this.game;
    pos = this.ground(pos, 0.5);
    const F = FOES[foe] || FOES.spacecom;
    let e;
    if (kind === 'skater') {
      const m = makeRunner({ ...F.look });
      g.scene.add(m.root);
      e = { kind: 'ally', sub: 'skater', model: m, hp: 120, maxHp: 120, body: makeBody(pos), radius: 1.3 };
      e.body.maxEnergy = e.body.energy = PIRATE_SKATER.maxEnergy;
    } else {
      const m = F.rover ? makeRover({ color: F.rover.color, trim: F.rover.trim, flag: F.rover.flag, pirate: false, style: F.rover.civil ? 'civil' : 'military' }) : makeRover({ color: 0x7b2ff7, trim: 0x7dff3a, pirate: true });
      m.root.scale.setScalar(1.3);
      g.scene.add(m.root);
      e = { kind: 'ally', sub: 'rover', model: m, hp: 340, maxHp: 340, body: makeBody(pos), radius: 3.6, rideH: 2.2 };
    }
    const up = pos.clone().normalize();
    let h = tangent(anchor.clone().sub(pos), up);
    if (h.lengthSq() < 1e-4) h = tangent(new THREE.Vector3(1, 0, 0), up);
    Object.assign(e, { faction: 'ally', foe, shotColor: F.shot, center: pos.clone(), dead: false, impacts: [], heading: h.normalize(), anchor: anchor.clone(), fireCd: randRange(0.5, 1.5), slot: Math.random() * Math.PI * 2, target: null, retarget: 0 });
    this.list.push(e);
    return e;
  }

  allies() { return this.list.filter((e) => e.faction === 'ally' && !e.dead); }

  // what allies (and their shots) go after: the chapter's hostiles, and a stormed base's guns
  allyTarget(t) {
    if (t.dead || !t.center || t.faction === 'ally') return false;
    if (t.base && t.base.assault) return t.kind === 'turret' || t.kind === 'milrover';
    if (t.kind === 'core') return !!t.assaultTarget;
    return t.faction === 'pirate' && !this.friendly(t);
  }

  updateAlly(e, dt) {
    const g = this.game;
    const b = e.body;
    e.retarget -= dt;
    if (e.retarget <= 0 || !e.target || e.target.dead) {
      e.retarget = 1.5;
      let best = null, bd = 450;
      for (const t of this.list) {
        if (!this.allyTarget(t)) continue;
        const d = t.center.distanceTo(b.pos);
        if (d < bd) { bd = d; best = t; }
      }
      e.target = best;
    }
    const up = b.up.copy(b.pos).normalize();
    let goal;
    if (e.target) {
      // close to fighting range, then circle it
      const tp = e.target.center;
      const r = tangent(b.pos.clone().sub(tp), up);
      if (r.lengthSq() < 1e-4) r.copy(e.heading);
      r.normalize();
      const side = new THREE.Vector3().crossVectors(up, r);
      const want = e.sub === 'rover' ? 45 : 30;
      goal = tp.clone().addScaledVector(r, want).addScaledVector(side, want * 0.7);
    } else {
      // regroup round the objective
      const au = e.anchor.clone().normalize();
      const t1 = tangent(new THREE.Vector3(1, 0, 0), au).normalize();
      const t2 = new THREE.Vector3().crossVectors(au, t1);
      const a = e.slot + g.time * 0.05;
      goal = e.anchor.clone().addScaledVector(t1, Math.cos(a) * 30).addScaledVector(t2, Math.sin(a) * 30);
    }
    // stuck behind a wall (no line of fire to a target in range, or barely moving): pick a detour off
    // to one side for a few seconds, then try again
    e.stuckT = (e.stuckT || 0) + dt;
    if (e.stuckT > 1) {
      e.stuckT = 0;
      const blocked = e.target && e.target.center.distanceTo(b.pos) < 270 && !this.clearShot(e.center.clone().addScaledVector(up, 1.5), e.target.center);
      const slow = b.vel.length() < 3 && (!e.target || e.target.center.distanceTo(b.pos) > 60);
      if ((blocked || slow) && !(e.detourT > 0)) {
        const side = new THREE.Vector3().crossVectors(up, e.heading).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
        e.detour = b.pos.clone().addScaledVector(side, 45).addScaledVector(e.heading, -15);
        e.detourT = 3.5;
      }
    }
    if (e.detourT > 0) { e.detourT -= dt; goal = e.detour; }
    if (e.sub === 'rover') {
      stepRover(e, dt, g.planet, g.colliders, goal.clone().sub(b.pos), e.target ? 42 : 28, { engine: 20, grip: 12, turn: 2.2, radius: 3.4, stick: 60 });
      this.poseVehicle(e, dt);
    } else {
      const to = goal.clone().sub(b.pos);
      const wish = tangent(to, up);
      const dist = wish.length();
      wish.normalize();
      const ctrl = { wish: dist < 6 ? wish.multiplyScalar(0) : wish, skates: dist > 12, thrust: b.energy > 30 && dist > 120, jump: false, thrustDir: wish.clone().addScaledVector(up, 0.2).normalize() };
      const steps = Math.ceil(dt / (1 / 60));
      for (let i = 0; i < steps; i++) stepSkater(b, ctrl, dt / steps, g.planet, g.colliders, PIRATE_SKATER, e.impacts);
      e.center.copy(b.pos).addScaledVector(up, 1.3);
      const hv = tangent(b.vel, up);
      if (hv.lengthSq() > 4) e.heading.copy(hv.normalize());
      const m = e.model;
      m.root.position.copy(b.pos);
      frameQuat(up, e.heading, m.root.quaternion);
      m.torso.rotation.x = b.grounded ? 0.5 : 0.1;
      m.armL.rotation.z = -0.5; m.armR.rotation.z = 0.5;
      if (!e.scarfSim) e.scarfSim = new ScarfSim(m);
      e.scarfSim.update(dt, b.vel, up);
      m.glowM.color.setHex(e.flash > 0 ? 0xffffff : 0x2ee6ff);
    }
    if (e.flash > 0) e.flash -= dt;
    e.fireCd -= dt;
    if (e.target && e.fireCd <= 0) {
      const from = e.center.clone().addScaledVector(up, e.sub === 'rover' ? 1.2 : 0.6);
      const tc = e.target.center;
      if (from.distanceTo(tc) < 270 && g.planet.visible(from, tc)) {
        e.fireCd = e.sub === 'rover' ? randRange(0.9, 1.4) : randRange(1.2, 1.9);
        const dir = this.aimLead(from, 110, 0.03, tc, e.target.body ? e.target.body.vel : _n.set(0, 0, 0));
        g.projectiles.fire('ally', from, dir.multiplyScalar(110), { damage: e.sub === 'rover' ? 18 : 11, splash: 3, color: e.shotColor, size: 0.45, knock: 0.4, spare: true });
      } else e.fireCd = 0.4;
    }
  }

  removeAllies() {
    for (const e of this.list) if (e.faction === 'ally') { e.dead = true; e.model.root.removeFromParent(); }
    this.list = this.list.filter((e) => e.faction !== 'ally');
  }

  // Rustmoon pirates leave you alone once you've joined them — unless you start it.
  friendly(e) {
    return e.faction === 'pirate' && this.game.rep.aligned() && !e.rogue && !e.aggro;
  }

  isHostileTarget(t) {
    if (t.dead) return false;
    if (t.faction === 'beast') return true;
    if (t.faction === 'pirate') return !this.friendly(t) && !(t.kind === 'core' && this.game.rep.aligned());
    return t.base && t.base.hostile;
  }

  pirateCount() { return this.list.filter((e) => e.faction === 'pirate' && e.kind !== 'core' && !e.dead).length; }

  // The settlement you're standing in, within job-board range (its own radius, not its faction's
  // territory), if it isn't hostile to you: pirate squads don't spawn on you there. Everywhere else
  // they hunt as normal, friendly territory included.
  shelterAt(pos) {
    const g = this.game;
    const l = g.zoneAt(pos);
    if (!l || l.type === 'pirate' || g.rep.hostile(l.faction)) return null;
    return l;
  }

  // roaming hunters of a kind (not den guards, not event raiders)
  hunters(kind) { return this.list.filter((e) => e.faction === 'pirate' && !e.dead && !e.home && !e.targetObj && (!kind || e.kind === kind)).length; }

  // what the next hunter should be: a coin flip between whatever is still under its cap
  huntKind() {
    const open = ['skater', 'rover'].filter((k) => this.hunters(k) < MAX_HUNTERS[k]);
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
  }

  spawnSquad(n, opts = {}) {
    const g = this.game;
    const P = g.player;
    const up = P.up;
    const dir = tangent(P.vel, up);
    if (dir.lengthSq() < 4) dir.copy(g.cam.fwd);
    dir.normalize();
    n = Math.min(n, MAX_PIRATES - this.pirateCount());
    let spawned = 0;
    for (let i = 0; i < n * 3 && spawned < n; i++) {
      const t = dir.clone().applyAxisAngle(up, (Math.random() - 0.5) * 2.2);
      const d = greatCircle(up, t, randRange(320, 520));
      if (g.zoneAt(d, 1.4)) continue;
      const kind = this.huntKind();
      if (!kind) break;
      this.spawnPirate(kind, d, null, opts);
      spawned++;
    }
    if (spawned) {
      g.hud.alert(opts.rogue ? 'RENEGADE RAIDERS INBOUND!' : 'PIRATE INTERCEPT INBOUND!', '#7dff3a', 3);
      g.audio.alarm();
      // now and then the King of Rustmoon comes along for the ride
      if (!opts.rogue && g.story) g.story.maybeKade();
    }
    return spawned;
  }

  // Event waves: spawn around a point and go after something you're protecting.
  spawnWave(center, n, targetObj, dist = 360, foe = 'rustmoon') {
    const up = center.clone().normalize();
    const t0 = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = t0.clone().applyAxisAngle(up, (i / n) * Math.PI * 2 + Math.random() * 0.6);
      out.push(this.spawnPirate(Math.random() < 0.5 ? 'skater' : 'rover', greatCircle(up, t, dist + Math.random() * 120), null, { rogue: true, targetObj, foe }));
    }
    const F = FOES[foe] || FOES.rustmoon;
    this.game.hud.alert(foe === 'rustmoon' ? 'RAIDERS INBOUND — DEFEND IT!' : `${F.label.replace('!', '')} INBOUND — DEFEND IT!`, '#' + new THREE.Color(F.glow).getHexString(), 3);
    this.game.audio.alarm();
    return out;
  }

  targets() {
    const t = this._targets;
    t.length = 0;
    for (const e of this.list) {
      if (e.dead) continue;
      if (e.base && !e.base.awake) continue;
      if (e.kind === 'core' && !e.lair.active) continue;
      t.push(e);
    }
    return t;
  }

  damage(e, amount, fromPlayer = true) {
    if (e.dead) return;
    const g = this.game;
    e.hp -= amount;
    e.flash = 0.15;
    // a battered pirate skater gets dizzy for a moment (long enough to be jarred)
    if (e.kind === 'skater' && e.faction === 'pirate' && e.hp > 0 && e.hp <= e.maxHp * 0.45) {
      if (!(e.dazed > 0)) g.fx.pop('DAZED!', e.center.clone().addScaledVector(e.center.clone().normalize(), 3), { color: '#7dff3a', size: 40 });
      e.dazed = 6;
    }
    if (fromPlayer) {
      if (e.faction === 'pirate' && g.rep.aligned() && !e.rogue && !e.aggro) {
        // shooting your own crew
        e.aggro = true;
        if (e.kind !== 'core') g.rep.add('rustmoon', -2, 'Shot a Rustmoon pirate');
      }
      if (e.base) {
        const base = e.base;
        base.grace = false;
        if (base.restricted && !base.hostile) {
          base.hostile = true;
          base.time = Math.max(base.time, 6);
          g.hud.alert(`${FACTIONS[base.faction].name.toUpperCase()} IS ENGAGING!`, '#ff2a4a', 3);
        } else if (!base.restricted && base.aggro <= 0 && !base.hostile) {
          g.hud.alert(`${FACTIONS[base.faction].name.toUpperCase()} DEFENSES ENGAGING!`, '#ff2a4a', 3);
        }
        base.aggro = Math.max(base.aggro, 25); // a civilian-harm alert (civilians.js) may already be longer
      }
    }
    if (e.hp <= 0) this.kill(e, fromPlayer);
  }

  kill(e, byPlayer = true) {
    const g = this.game;
    e.dead = true;
    const big = e.kind !== 'skater';
    g.fx.explosion(e.center, big ? 11 : 6, true);
    g.fx.pop(e.kind === 'skater' ? 'KA-POW!' : e.kind === 'core' ? 'KRA-KA-BOOOM!' : 'KA-BOOM!', e.center.clone().addScaledVector(e.center.clone().normalize(), 4), { color: '#ff4f2e', size: e.kind === 'core' ? 100 : 80 });
    g.audio.boom(true);
    if (e.kind === 'megamite') {
      e.model.root.removeFromParent();
      if (byPlayer) { g.addCredits(400, 'MEGA MITE'); g.style(150, 'MITE SLAYER'); g.rep.add('meridian', 2, 'Stopped the Mega Mite'); }
      g.hud.alert('THE MEGA MITE IS DOWN!', '#b8e986', 3);
      return;
    }
    if (byPlayer) {
      if (e.faction === 'pirate' && e.kind !== 'core') {
        if (g.rep.aligned() && !e.rogue) g.rep.add('rustmoon', -3, 'Killed a Rustmoon pirate');
        else {
          const darkBonus = darkness(e.center.clone().normalize()) > 0.5 ? 1.5 : 1;
          g.addCredits(Math.round((e.kind === 'skater' ? 25 : 45) * darkBonus), 'Bounty');
          this.pirateKills = (this.pirateKills || 0) + 1;
          if (this.pirateKills % 3 === 0) g.rep.add('spacecom', 1, 'Pirate bounties', { silent: true });
        }
      }
      if (e.base) {
        const ordered = g.events.active && g.events.active.target === e.base.loc;
        g.rep.add(e.base.faction, ordered ? -1 : e.kind === 'turret' ? -3 : -2, `Destroyed ${FACTIONS[e.base.faction].name} defenses`, { silent: ordered });
        const enemy = FACTIONS[e.base.faction].enemy;
        if (enemy) g.rep.add(enemy, 1, `Hit ${FACTIONS[e.base.faction].name}`, { silent: true, war: false });
      }
    }
    if (e.kind === 'core') {
      const l = e.lair;
      l.destroyedUntil = g.time + DEN_RESPAWN;
      e.respawn = DEN_RESPAWN;
      e.model.root.visible = false;
      g.hud.alert(`${l.name.toUpperCase()} KNOCKED OUT!`, '#ffd23f', 3);
      if (byPlayer) {
        if (g.rep.aligned()) g.rep.add('rustmoon', -5, `Destroyed ${l.name}`);
        else { g.addCredits(l.hq ? 350 : 150, 'Den destroyed'); g.rep.add('spacecom', 2, `Destroyed ${l.name}`); }
      }
      // its guards scatter
      for (const p of this.list) if (p.home === l && p.kind !== 'core' && !p.dead) p.home = null;
    }
    if (e.carrying) {
      e.carrying = false;
      this.dropCargo(e.center.clone());
    }
    if (e.kind === 'turret') {
      e.model.head.visible = false;
      e.respawn = 60;
    } else if (e.kind !== 'core') {
      e.model.root.removeFromParent();
      if (e.kind === 'milrover') e.respawn = 60;
    }
    g.events.onKill(e, byPlayer);
    g.story.onKill(e);
  }

  dropCargo(pos) {
    const g = this.game;
    const color = g.missions.active ? g.missions.active.cargo.color : 0xffd23f;
    const crate = makeCrate(color, 1.4);
    const p = this.ground(pos, 1.2);
    const up = p.clone().normalize();
    crate.position.copy(p);
    frameQuat(up, new THREE.Vector3(1, 0, 0), crate.quaternion);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.35, depthWrite: false }));
    beam.position.y = 60;
    crate.add(beam);
    g.scene.add(crate);
    this.drops.push({ mesh: crate, pos: p.clone(), up });
    g.missions.onCargoDropped(p);
    g.fx.pop('CARGO DROPPED!', p.clone().addScaledVector(up, 5), { color: '#2ee6ff', size: 52 });
  }

  clearDrops() {
    for (const d of this.drops) this.game.scene.remove(d.mesh);
    this.drops.length = 0;
  }

  clearPirates() {
    for (const e of this.list) if (e.faction === 'pirate' && e.kind !== 'core') { e.model.root.removeFromParent(); e.dead = true; }
    this.list = this.list.filter((e) => !(e.faction === 'pirate' && e.kind !== 'core'));
  }

  nearestLair(pos) {
    let best = null, bd = Infinity;
    for (const l of this.lairs) {
      if (!this.lairActive(l)) continue;
      const d = arcDist(pos, l.dir);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  update(dt, time) {
    const g = this.game;
    const P = g.player;
    const ms = g.missions;
    const dark = darkness(P.up);
    const aligned = g.rep.aligned();
    const shadow = 1 + (g.upgrades.shadow || 0) * 0.35;
    // pirate blood (a lab mutation) makes the hunters mostly lose interest in you
    const blood = g.alchemy && g.alchemy.mutations.includes('blood') ? 0.35 : 1;

    // --- spawning: hunting squads (not if you ride with Rustmoon) ---
    const carrying = ms.active && ms.cargoState === 'held';
    const inSafe = g.isSafe(g.currentZone);
    // no new squads while you're sheltered: in a settlement that isn't hostile to you (within its
    // job-board range), or riding a transit ship
    const riding = g.rides && g.rides.ride && g.rides.ride.kind === 'ship';
    const home = this.shelterAt(P.pos);
    // (and none at all once SPACECOM has dismantled the clans)
    const storyFight = g.story && g.story.engaged(); // (a chapter's objective is close: its own enemies only)
    if (!P.dead && !inSafe && !riding && !home && !aligned && !FACTIONS.rustmoon.gone && !storyFight && !(g.tutorial && g.tutorial.quiet())) {
      if (carrying) {
        this.pirateTimer -= dt * (1 + dark) * blood;
        if (this.pirateTimer <= 0) {
          const hot = ms.active.cargo.hot;
          if ((hot > 0 || Math.random() < 0.35 + dark * 0.5) && this.pirateCount() < MAX_PIRATES) this.spawnSquad(Math.min(4, 1 + Math.floor(Math.max(1, hot) * 0.8 + Math.random() + dark)));
          this.pirateTimer = randRange(30, 50) / Math.max(1, hot * 0.8);
          this.darkTimer = Math.max(this.darkTimer, 14);
        }
      }
      if (dark > 0.5) {
        this.darkTimer -= dt * blood;
        if (this.darkTimer <= 0) {
          if (this.hunters() < 3) this.spawnSquad(1 + Math.floor(Math.random() * 2));
          this.darkTimer = randRange(20, 34);
          this.pirateTimer = Math.max(this.pirateTimer, 14);
        }
      }
    }
    // pirate dens are guarded (unless knocked out)
    this.lairTimer -= dt;
    if (!P.dead && this.lairTimer <= 0) {
      this.lairTimer = 10;
      for (const l of this.lairs) {
        if (!this.lairActive(l, time) || arcDist(P.pos, l.dir) > 650) continue;
        const guards = this.list.filter((e) => e.home === l && e.kind !== 'core' && !e.dead).length;
        if (guards < (l.camp ? 2 : l.hq ? 4 : 3) && this.pirateCount() < MAX_PIRATES + 2) {
          const a = Math.random() * Math.PI * 2;
          this.spawnPirate(Math.random() < 0.5 ? 'skater' : 'rover', g.world.toWorld(l, Math.cos(a) * 50, 0, Math.sin(a) * 50), l);
        }
      }
    }
    for (const l of this.lairs) l.active = arcDist(g.camera.position, l.dir) < 2200;

    for (const base of this.bases) this.updateBase(base, dt);

    let lost = 0;
    for (const e of this.list) {
      if (e.dead) {
        if (e.respawn > 0) {
          e.respawn -= dt;
          if (e.respawn <= 0) this.revive(e);
        }
        continue;
      }
      if (e.base && !e.base.awake) continue;
      if (e.kind === 'core') { this.updateCore(e, dt, time); continue; }
      if (e.kind === 'megamite') { g.alchemy.updateBeast(e, dt); if (e.flash > 0) e.flash -= dt; continue; }
      if (e.kind === 'kade') { g.story.updateKade(e, dt); if (e.dead) continue; }
      if (e.kind === 'skater') this.updateSkater(e, dt, time);
      else if (e.kind === 'rover') this.updateRover(e, dt);
      else if (e.kind === 'milrover') this.updateMilRover(e, dt);
      else if (e.kind === 'ally') this.updateAlly(e, dt);
      else if (e.kind === 'turret') this.updateTurret(e, dt, shadow);
      if (e.flash > 0) e.flash -= dt;

      // out of the threat range: hunters give up after a moment (den guards wander back home and
      // only vanish much further out; cargo thieves and event raiders never give up)
      if (e.faction === 'pirate' && !e.carrying && !e.final && !(e.targetObj && !e.targetObj.dead)) {
        const far = e.body.pos.distanceTo(P.pos) > (e.home ? 1300 : THREAT_RANGE);
        e.lost = far ? (e.lost || 0) + dt : 0;
        if (e.lost > 2.5) {
          e.dead = true;
          e.model.root.removeFromParent();
          if (e.kind === 'kade') { g.story.lockEl.classList.add('hidden'); g.story.kade.nextAt = g.time + 300; }
          if (!e.home && !this.friendly(e)) lost++;
          continue;
        }
      }

      // collisions with the player: you can smash them, and their war-rigs can smash you
      if (!P.dead && e.body) {
        const d = e.center.distanceTo(P.center);
        if (d < e.radius + 1.2) {
          const n = P.center.clone().sub(e.center).normalize();
          const rel = _v.copy(P.vel).sub(e.body.vel);
          const rs = rel.length();
          const closing = e.body.vel.dot(n) - P.vel.dot(n);
          if (rs > 22 && P.body.skating && P.vel.dot(n) < 0 && e.faction !== 'ally') {
            this.damage(e, (rs - 15) * 4);
            g.fx.pop('SMASH!', e.center.clone().addScaledVector(P.up, 3), { color: '#ffd23f', size: 70 });
            g.damagePlayer(4, 'ram');
            g.audio.thud(rs);
          } else if (e.kind === 'rover' && closing > 15 && !(e.ramCd > 0) && !this.friendly(e)) {
            // playtest tuning: rams need a real run-up, hurt less, and can't chain
            e.ramCd = 4;
            g.damagePlayer(Math.min(28, (closing - 12) * 1.1), 'ram');
            g.fx.pop('WHAM!', P.center.clone(), { color: '#7dff3a', size: 70 });
            g.audio.thud(closing);
            P.vel.addScaledVector(n, closing * 0.4).addScaledVector(P.up, 5);
            P.body.grounded = false;
            P.body.sinceContact = 1;
          }
          const vn = P.vel.dot(n) - e.body.vel.dot(n);
          if (vn < 0) P.vel.addScaledVector(n, -vn * 1.4);
          P.body.pos.addScaledVector(n, (e.radius + 1.2 - d) * 0.8);
        }
      }
    }
    this.list = this.list.filter((e) => !e.dead || e.respawn > 0);
    this.bossBar();
    if (lost && !P.dead) {
      // you shook them: say so, and give a breather before the next squad
      if (!this.hunters()) {
        g.fx.pop('LOST THEM!', P.pos.clone().addScaledVector(P.up, 4), { color: '#7dff3a', size: 52 });
        g.hud.toast('Pirates lost your trail.', 2);
      }
      this.darkTimer = Math.max(this.darkTimer, 30);
      this.pirateTimer = Math.max(this.pirateTimer, 25);
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.mesh.rotateY(dt * 2);
      if (!P.dead && d.pos.distanceTo(P.pos) < 5) {
        g.scene.remove(d.mesh);
        this.drops.splice(i, 1);
        ms.recoverCargo();
      }
    }
  }

  // A boss's health, upper-centre: the nearest named war machine (or Captain Kade) within 700 m.
  bossBar() {
    const P = this.game.player;
    if (!this.bossEl) {
      this.bossEl = document.createElement('div');
      this.bossEl.id = 'bossbar';
      this.bossEl.innerHTML = '<div class="bb-name"></div><div class="bb-track"><div class="bb-fill"></div></div>';
      document.getElementById('hud').appendChild(this.bossEl);
    }
    let boss = null, bd = 700;
    for (const e of this.list) {
      if (e.dead || !e.bossName || !e.center) continue;
      const d = e.center.distanceTo(P.pos);
      if (d < bd) { bd = d; boss = e; }
    }
    this.bossEl.classList.toggle('on', !!boss);
    if (!boss) return;
    this.bossEl.querySelector('.bb-name').textContent = boss.bossName;
    this.bossEl.querySelector('.bb-fill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  }

  updateCore(e, dt, time) {
    e.model.orb.scale.setScalar(1 + Math.sin(time * 4) * 0.12);
    e.model.root.visible = e.lair.active;
  }

  revive(e) {
    if (e.base && e.base.assault) { e.respawn = 5; return; } // nobody re-mans a gun mid-assault
    e.dead = false;
    e.hp = e.maxHp;
    if (e.kind === 'turret') e.model.head.visible = true;
    else if (e.kind === 'core') { e.model.root.visible = true; e.lair.destroyedUntil = 0; }
    else if (e.kind === 'milrover') {
      const a = Math.random() * Math.PI * 2;
      const R = e.patrolR || 120;
      const p = this.ground(this.game.world.toWorld(e.base.loc, Math.cos(a) * R, 0, Math.sin(a) * R));
      e.body = makeBody(p);
      e.base.group.add(e.model.root);
    }
  }

  updateBase(base, dt) {
    const g = this.game;
    const P = g.player;
    const loc = base.loc;
    const d = arcDist(P.pos, loc.dir);
    const awake = d < (loc.id === 'ilmb' ? 2000 : 1600);
    if (awake !== base.awake) {
      base.awake = awake;
      if (awake) g.scene.add(base.group); else g.scene.remove(base.group);
    }
    if (!awake) { base.inside = false; return; }
    // stormed in a story assault: every gun and patrol fights until it's over
    if (base.assault) { base.hostile = true; base.inside = false; return; }
    const rep = g.rep;
    const hostileRep = loc.type !== 'hometown' && rep.hostile(base.faction); // (your own town never turns on you)
    if (base.aggro > 0) base.aggro -= dt;
    if (base.restricted) {
      const inside = !P.dead && d < loc.zoneR;
      // a delivery you just made here keeps you cleared until you leave (or start shooting)
      if (!inside) base.grace = false;
      const authorized = base.grace || (!hostileRep && (g.missions.hasClearance(loc.id) || rep.cleared(base.faction) || g.events.hasClearance(loc.id)));
      base.inside = inside;
      base.authorized = authorized;
      if (inside && !authorized) {
        base.time += dt * (hostileRep ? 4 : 1);
        base.outside = 0;
        if (base.time > 4) base.hostile = true;
        base.warnBeep -= dt;
        if (base.warnBeep <= 0) { g.audio.alarm(); base.warnBeep = base.hostile ? 1.2 : 0.8; }
      } else {
        if (base.time > 0 && !base.hostile) base.time = Math.max(0, base.time - dt * 2);
        if (base.hostile && base.aggro <= 0) {
          base.outside += dt;
          if (base.outside > 8 || P.dead) { base.hostile = false; base.time = 0; }
        }
      }
      if (inside && !authorized && base.time > 9) this.artillery(base, dt);
      for (const z of g.world.zoneWalls) if (z.loc === loc) z.mat.uniforms.alert.value = base.hostile ? 1 : inside && !authorized ? 0.5 : 0;
    } else {
      // settlements only fight if you're an enemy, you're raiding them, or you shot first
      const raid = g.events.isRaidTarget(loc);
      if (base.hostileWall) { base.hostileWall.visible = hostileRep; base.hostileWall.material.uniforms.time.value = g.time; }
      base.inside = !P.dead && d < loc.r * 1.2;
      base.hostile = !P.dead && (hostileRep || base.aggro > 0 || raid) && d < loc.defense.ring + 500;
      if (loc.id === 'ilmb' && base.hostile && base.inside) this.artillery(base, dt);
    }
  }

  // You went down: every base and den you'd set off stands down (your reputation still counts: a
  // faction that hates you stays hostile).
  forgive() {
    for (const base of this.bases) Object.assign(base, { aggro: 0, hostile: false, time: 0, outside: 0, artyCd: 0 });
    for (const l of this.game.locations) if (l.civAlert) l.civAlert = 0;
    for (const e of this.list) if (e.kind !== 'kade' && !e.rogue) e.aggro = false;
  }

  // You just delivered to (or picked up from) this restricted base: its guns hold until you're out.
  grantGrace(loc) {
    const base = this.bases.find((b) => b.loc === loc && b.restricted);
    if (!base) return;
    base.grace = true;
    base.time = 0;
    if (base.aggro <= 0) base.hostile = false;
    if (base.inside) this.game.hud.toast(`${base.loc.name}: delivery signed for. Your clearance holds until you leave the zone. Don't shoot anything.`, 4);
  }

  artillery(base, dt) {
    const g = this.game;
    const P = g.player;
    base.artyCd -= dt;
    if (base.artyCd > 0) return;
    base.artyCd = base.loc.id === 'ilmb' ? 1.2 : 1.8;
    const tgt = P.pos.clone().addScaledVector(P.vel, 2.4 * 0.75);
    const side = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), P.up).normalize();
    tgt.addScaledVector(side, Math.random() * 18);
    const gp = this.ground(tgt);
    g.fx.warningRing(gp, 16, 2.4);
    g.schedule(2.4, () => {
      const up = gp.clone().normalize();
      g.fx.spawn(gp.clone().addScaledVector(up, 60), up.clone().multiplyScalar(-200), { color: 0xffd23f, size: 1.2, life: 0.3, count: 3, spread: 1 });
      g.explode(gp.clone().addScaledVector(up, 1), 16, 45, 'mil', 2.5, 0xff4f2e);
    });
  }

  // What a hostile unit is going after: you, or something you're protecting.
  victim(e) {
    const o = e.targetObj;
    if (o && !o.dead && e.center.distanceTo(o.center) < 600) return o;
    // chapter troops split their fire between you and your backup
    if (e.storyUnit && e.faction === 'pirate') {
      const g = this.game;
      if (!(e.allyT > g.time) || (e.allyPick && e.allyPick.dead)) {
        e.allyT = g.time + 3 + Math.random() * 3;
        e.allyPick = null;
        if (Math.random() < 0.5) {
          let bd = 240;
          for (const a of this.list) { if (a.faction !== 'ally' || a.dead) continue; const d = a.center.distanceTo(e.center); if (d < bd) { bd = d; e.allyPick = a; } }
        }
      }
      if (e.allyPick && !e.allyPick.dead) return e.allyPick;
    }
    // the Monolith's echo holograms: anyone after you picks one of the four of you at random,
    // every few seconds
    const D = this.game.decoys;
    if (D.length && this.isHostileTarget(e)) {
      if (!(e.decoyT > this.game.time) || (e.decoy && e.decoy.dead)) {
        e.decoyT = this.game.time + 2 + Math.random() * 2;
        e.decoy = Math.random() < D.length / (D.length + 1) ? D[Math.floor(Math.random() * D.length)] : null;
      }
      if (e.decoy && !e.decoy.dead) return e.decoy;
    }
    return null;
  }

  aimLead(from, speed, inaccuracy, center, vel) {
    const dist = from.distanceTo(center);
    const aim = center.clone().addScaledVector(vel, dist / speed);
    aim.x += randRange(-1, 1) * inaccuracy * dist;
    aim.y += randRange(-1, 1) * inaccuracy * dist;
    aim.z += randRange(-1, 1) * inaccuracy * dist;
    return aim.sub(from).normalize();
  }

  tryGrab(e, dt) {
    const g = this.game;
    const P = g.player;
    if (g.missions.cargoState !== 'held' || P.dead || this.victim(e)) { e.grab = 0; return; }
    if (e.center.distanceTo(P.center) < e.radius + 6) {
      e.grab += dt;
      const need = 1.1;
      g.hud.grab(Math.min(1, e.grab / need));
      if (e.grab > need) {
        e.grab = 0;
        e.carrying = true;
        e.state = 'flee';
        e.home = this.nearestLair(e.body.pos);
        g.missions.onStolen(e);
      }
    } else e.grab = Math.max(0, e.grab - dt * 0.6);
  }

  shoot(e, from, speed, dmg, color, inaccuracy) {
    const g = this.game;
    const P = g.player;
    const obj = this.victim(e);
    const center = obj ? obj.center : P.center;
    const vel = obj ? (obj.vel || _n.set(0, 0, 0)) : P.vel;
    if ((!obj && P.dead) || !g.planet.visible(from, center)) return;
    if (!obj) {
      // in the dark, a lamp-less runner is much harder to hit
      if (darkness(P.up) > 0.5 && P.lamp.intensity < 1) inaccuracy *= 2.4;
      inaccuracy *= 1 + (g.upgrades.shadow || 0) * 0.35;
      if (g.alchemy && g.alchemy.mutations.includes('void')) inaccuracy *= 1.6;
    }
    const dir = this.aimLead(from, speed, inaccuracy, center, vel);
    if (obj) dmg *= 0.6;
    g.projectiles.fire(e.faction, from, dir.multiplyScalar(speed), { damage: dmg, splash: 3, color, size: 0.5, knock: 0.6 });
    if (from.distanceTo(P.center) < 300) g.audio.enemyShot();
  }

  targetFor(e, lead) {
    const P = this.game.player;
    if (e.state === 'flee' && e.home) return e.home.pos;
    const obj = this.victim(e);
    if (obj) return obj.center.clone();
    if (this.friendly(e)) {
      // loiter around the den
      const home = e.home ? e.home.pos : e.body.pos;
      if (!e.wander || e.body.pos.distanceTo(e.wander) < 15) {
        const up = home.clone().normalize();
        const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
        e.wander = this.ground(greatCircle(up, t, 30 + Math.random() * 70));
      }
      return e.wander;
    }
    const dist = e.body.pos.distanceTo(P.pos);
    return P.pos.clone().addScaledVector(P.vel, Math.min(lead, dist / 60));
  }

  engageRange(e) {
    const P = this.game.player;
    const obj = this.victim(e);
    return obj ? e.center.distanceTo(obj.center) : P.dead ? Infinity : e.body.pos.distanceTo(P.pos);
  }

  updateSkater(e, dt, time) {
    const g = this.game;
    const b = e.body;
    const friendly = this.friendly(e);
    let target = this.targetFor(e, 2.5);
    const up = b.up.copy(b.pos).normalize();
    // gunfighters circle-strafe: once close, they orbit you at range and keep shooting instead of
    // skating straight into you. Grabbers still dive in while you hold cargo.
    e.orbiting = false;
    if (e.state === 'chase' && !friendly && !(e.dazed > 0) && !this.victim(e) && !g.player.dead) {
      const P = g.player;
      const grabber = g.missions.cargoState === 'held' && (e.grabber ?? (e.grabber = Math.random() < 0.5));
      const d = b.pos.distanceTo(P.pos);
      if (!grabber && d < 110) {
        if (!e.orbitDir || (e.orbitT = (e.orbitT || 0) - dt) <= 0) { e.orbitDir = e.orbitDir ? -e.orbitDir : (Math.random() < 0.5 ? 1 : -1); e.orbitT = randRange(5, 9); e.orbitR = randRange(26, 42); }
        const pu = _n.copy(P.pos).normalize();
        const r = tangent(b.pos.clone().sub(P.pos), pu);
        if (r.lengthSq() < 1e-4) r.copy(tangent(e.heading.clone(), pu));
        r.normalize();
        const side = new THREE.Vector3().crossVectors(pu, r).multiplyScalar(e.orbitDir);
        // aim for a point a little ahead on the circle, pulled in or out toward the orbit radius
        const pull = THREE.MathUtils.clamp((d - e.orbitR) / 25, -0.8, 0.8);
        target = P.pos.clone().addScaledVector(r, e.orbitR * (1 - pull * 0.6)).addScaledVector(side, e.orbitR * 0.8).addScaledVector(P.vel, 0.6);
        e.orbiting = true;
      }
    }
    const to = target.clone().sub(b.pos);
    const wish = tangent(to, up);
    const dist = wish.length();
    wish.normalize();
    const climb = to.dot(up);
    const sp = b.vel.length();
    const closing = b.vel.dot(wish);
    const dazed = e.dazed > 0;
    if (dazed) e.dazed -= dt;
    const ctrl = dazed ? { wish: wish.multiplyScalar(0), skates: false, thrust: false, jump: false, thrustDir: up } : {
      wish: friendly && dist < 10 ? wish.multiplyScalar(0) : wish,
      skates: friendly ? dist > 25 : e.orbiting || !(dist < 20 && closing > 20) || e.state === 'flee',
      thrust: !friendly && b.energy > 25 && (e.orbiting ? sp < 26 : (sp < 22 || (climb > 8 && dist < 200) || (dist > 200 && sp < 50))),
      jump: b.grounded && Math.random() < dt * 0.15,
      thrustDir: wish.clone().addScaledVector(up, 0.2).normalize(),
    };
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) { stepSkater(b, ctrl, dt / steps, g.planet, g.colliders, PIRATE_SKATER, e.impacts); ctrl.jump = false; }
    e.center.copy(b.pos).addScaledVector(up, 1.3);

    if (dazed) {
      // spin in place, seeing stars
      e.heading.applyAxisAngle(up, dt * 6);
    } else if (e.state === 'chase' && !friendly) {
      this.tryGrab(e, dt);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && this.engageRange(e) < 240) {
        e.fireCd = e.orbiting ? randRange(1.1, 1.8) : randRange(1.6, 2.6);
        this.shoot(e, e.center.clone().add(up), 80, 7, e.shotColor || 0x7dff3a, 0.03);
      }
    } else if (e.state === 'flee' && e.home && arcDist(b.pos, e.home.dir) < 60) this.fence(e);

    const m = e.model;
    const hv = tangent(b.vel, up);
    if (hv.lengthSq() > 4 && !dazed) e.heading.copy(hv.normalize());
    m.root.position.copy(b.pos);
    frameQuat(up, e.heading, m.root.quaternion);
    if (e.orbiting) {
      // shoulders and gun arm swing round to track you while the skates carry them sideways
      m.root.updateMatrixWorld();
      const lp = m.root.worldToLocal(g.player.center.clone());
      m.torso.rotation.y = THREE.MathUtils.clamp(Math.atan2(lp.x, lp.z), -1.3, 1.3);
    } else m.torso.rotation.y = 0;
    m.torso.rotation.x = b.grounded ? 0.5 : 0.1;
    m.body.position.y = m.bodyBase + (b.grounded ? -0.15 : 0);
    m.armL.rotation.z = -0.5; m.armR.rotation.z = 0.5;
    if (!e.scarfSim) e.scarfSim = new ScarfSim(m);
    e.scarfSim.update(dt, b.vel, up, e.carrying ? { back: 1.14, top: 1.0 } : undefined);
    m.glowM.color.setHex(e.flash > 0 ? 0xffffff : dazed ? 0xffd23f : friendly ? 0x2ee6ff : e.glowColor || 0x7dff3a);
    if (e.carrying && !m.loot) { m.loot = makeCrate(g.missions.active ? g.missions.active.cargo.color : 0xffd23f, 0.7); m.cargoSlot.add(m.loot); }
  }

  fence(e) {
    e.dead = true;
    e.model.root.removeFromParent();
    this.game.missions.onFenced(e.home);
  }

  updateRover(e, dt) {
    if (e.boss === 'convoy' || e.boss === 'warden') { this.updateBossRoute(e, dt); return; }
    const g = this.game;
    const b = e.body;
    const friendly = this.friendly(e);
    const target = this.targetFor(e, 2);
    if (e.ramCd > 0) e.ramCd -= dt;
    if (e.ramRest > 0) e.ramRest -= dt;
    let max = friendly ? 14 : e.state === 'flee' ? 50 : 56;
    let engine = 22;
    let aim = target.clone().sub(b.pos);
    // ram runs: line up on you from range, floor it straight through, overshoot, swing round, repeat
    if (e.state === 'chase' && !friendly && !this.victim(e) && !g.player.dead) {
      const P = g.player;
      const d = b.pos.distanceTo(P.pos);
      const up = _n.copy(b.pos).normalize();
      const toP = tangent(P.pos.clone().sub(b.pos), up).normalize();
      const facing = e.heading.dot(toP);
      if (!e.ram) e.ram = { phase: 'line', t: 0 };
      const R = e.ram;
      R.t += dt;
      if (R.phase === 'line') {
        // swing wide to get a run-up, then charge once pointed at you
        if (d < 45 && facing < 0.6) aim = toP.clone().negate().add(new THREE.Vector3().crossVectors(up, toP).multiplyScalar(1.4));
        // (one rig charges at a time, after a proper run-up; the rest keep their distance and shoot)
        const other = this.list.some((o) => o !== e && !o.dead && o.ram && o.ram.phase === 'charge');
        if (!other && R.t > 3 && !(e.ramRest > 0) && facing > 0.9 && d > 45 && d < 220) { R.phase = 'charge'; R.t = 0; if (d < 300) g.fx.pop('RAMMING!', e.center.clone().addScaledVector(up, 5), { color: '#7dff3a', size: 40, life: 0.8 }); }
        else if (d < 70) aim = toP.clone().negate().add(new THREE.Vector3().crossVectors(up, toP).multiplyScalar(1.6)); // hang back
      } else if (R.phase === 'charge') {
        aim = P.pos.clone().addScaledVector(P.vel, Math.min(1.4, d / 70)).sub(b.pos);
        max = 66; engine = 34;
        if (facing < 0 || R.t > 6 || d < 10 || e.ramCd > 0) { R.phase = 'overshoot'; R.t = 0; e.ramRest = 6 + Math.random() * 4; }
      } else if (R.phase === 'overshoot') {
        // keep going a moment, then loop back
        // peel off to one side, away from you, before looping back for another run
        if (!R.side) R.side = new THREE.Vector3().crossVectors(up, e.heading).dot(toP) > 0 ? -1 : 1;
        aim = e.heading.clone().add(new THREE.Vector3().crossVectors(up, e.heading).multiplyScalar(R.side * 0.9));
        if ((R.t > 1.6 && d > 30) || R.t > 4) { R.phase = 'line'; R.t = 0; R.side = 0; }
      }
    } else e.ram = null;
    stepRover(e, dt, g.planet, g.colliders, aim, max, { engine, grip: 14, turn: e.ram && e.ram.phase === 'line' ? 2.8 : 2.2, radius: 3.6, stick: 62 });
    this.poseVehicle(e, dt);
    if (e.state === 'chase' && !friendly) {
      this.tryGrab(e, dt);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && this.engageRange(e) < 260) {
        e.fireCd = randRange(1.1, 1.8);
        this.shoot(e, e.center.clone().addScaledVector(b.up, 3), 90, 8, e.shotColor || 0x7dff3a, 0.03);
      }
      // the Hammer's cannon: a slow, heavy shell every few seconds
      if (e.boss === 'hammer') {
        e.shellCd -= dt;
        if (e.shellCd <= 0 && this.engageRange(e) < 320) { e.shellCd = randRange(2.8, 3.6); this.shoot(e, e.center.clone().addScaledVector(b.up, 2.5), 70, 24, 0xff3b5c, 0.02); }
      }
    } else if (e.state === 'flee' && e.home && arcDist(b.pos, e.home.dir) < 60) this.fence(e);
    if (e.carrying && !e.model.loot) {
      e.model.loot = makeCrate(g.missions.active ? g.missions.active.cargo.color : 0xffd23f, 1.2);
      e.model.loot.position.set(0, 3.3, -1.5);
      e.model.chassis.add(e.model.loot);
    }
  }

  // The convoy keeps to its loop round the site at a steady clip, both cannons tracking you; the
  // Warden hovers at range, circling you, and every few seconds blinks sideways.
  updateBossRoute(e, dt) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    const up = b.up.copy(b.pos).normalize();
    let aim;
    if (e.boss === 'convoy') {
      e.routeA += dt * 0.19;
      const ru = e.route.clone().normalize();
      const t1 = tangent(new THREE.Vector3(1, 0, 0), ru).normalize();
      const t2 = new THREE.Vector3().crossVectors(ru, t1);
      const goal = e.route.clone().addScaledVector(t1, Math.cos(e.routeA) * 130).addScaledVector(t2, Math.sin(e.routeA) * 130);
      aim = goal.sub(b.pos);
      stepRover(e, dt, g.planet, g.colliders, aim, 25, { engine: 18, grip: 16, turn: 1.6, radius: 5, stick: 80 });
    } else {
      const victim = this.victim(e);
      const tp = victim ? victim.center : P.pos;
      const r = tangent(b.pos.clone().sub(tp), up);
      if (r.lengthSq() < 1e-4) r.copy(e.heading);
      r.normalize();
      const side = new THREE.Vector3().crossVectors(up, r);
      aim = tp.clone().addScaledVector(r, 70).addScaledVector(side, 60).sub(b.pos);
      stepRover(e, dt, g.planet, g.colliders, aim, 34, { engine: 26, grip: 6, turn: 2.6, radius: 5, stick: 40 });
      e.blinkCd -= dt;
      if (e.blinkCd <= 0) {
        // phase-blink: a sideways jump of thirty metres
        e.blinkCd = randRange(5, 8);
        const from = e.center.clone();
        b.pos.addScaledVector(side, (Math.random() < 0.5 ? -1 : 1) * 30);
        g.planet.ground(b.pos, b.pos, 0.5);
        g.fx.beam(from, b.pos.clone().addScaledVector(up, 2.5), 0xc77dff);
        if (from.distanceTo(P.pos) < 300) g.fx.pop('*BLINK*', from, { color: '#c77dff', size: 50, life: 0.7 });
      }
    }
    this.poseVehicle(e, dt);
    if (e.hover) e.model.chassis.position.y = 0.6 + Math.sin(g.time * 2.2) * 0.25;
    e.fireCd -= dt;
    if (e.fireCd <= 0 && this.engageRange(e) < 300) {
      e.fireCd = e.boss === 'convoy' ? randRange(0.8, 1.2) : randRange(1.6, 2.2);
      const from = e.center.clone().addScaledVector(up, 1.8);
      const n = e.boss === 'warden' ? 3 : 2;
      for (let i = 0; i < n; i++) g.schedule(i * 0.12, () => { if (!e.dead) this.shoot(e, from, e.boss === 'warden' ? 95 : 120, e.boss === 'warden' ? 9 : 10, e.shotColor || 0x7dff3a, 0.035); });
    }
  }

  updateMilRover(e, dt) {
    const g = this.game;
    const P = g.player;
    const base = e.base;
    const loc = base.loc;
    const b = e.body;
    let target, maxSp;
    const reach = (loc.zoneR || loc.defense.ring) + 250;
    if (base.hostile && !P.dead && arcDist(P.pos, loc.dir) < reach) {
      target = P.pos.clone().addScaledVector(P.vel, 1.5);
      maxSp = 48;
    } else {
      e.patrolA += dt * 0.07;
      const a = e.patrolA + e.slot * Math.PI;
      target = g.world.toWorld(loc, Math.cos(a) * e.patrolR, 0, Math.sin(a) * e.patrolR);
      maxSp = 16;
    }
    stepRover(e, dt, g.planet, g.colliders, target.sub(b.pos), maxSp, { engine: 16, grip: 8, turn: 2, stick: Infinity });
    this.poseVehicle(e, dt);
    if (base.hostile) {
      e.fireCd -= dt;
      if (e.fireCd <= 0 && b.pos.distanceTo(P.pos) < 300) {
        e.fireCd = randRange(1.0, 1.6);
        this.shoot(e, e.center.clone().addScaledVector(b.up, 2.5), 120, 11, 0xff2a4a, 0.02);
      }
    }
  }

  poseVehicle(e, dt) {
    const b = e.body;
    const m = e.model;
    m.root.position.copy(b.pos);
    const q = frameQuat(b.groundN, e.heading, new THREE.Quaternion());
    m.root.quaternion.slerp(q, Math.min(1, dt * 8));
    const sp = b.vel.length();
    for (const w of m.wheels) w.rotation.x += sp * dt / 0.85;
    e.center.copy(b.pos).addScaledVector(b.up, e.rideH || (e.kind === 'rover' ? 2.6 : 1.8));
    m.root.updateMatrixWorld();
    const obj = e.faction === 'pirate' ? this.victim(e) : e.faction === 'ally' ? e.target : null;
    const local = m.root.worldToLocal((obj ? obj.center : this.game.player.center).clone());
    m.gun.rotation.y = Math.atan2(local.x, local.z);
  }

  // Where a turret's shot leaves from: along the aim line, just outside its own collider
  // (raised wall guns shoot downward a lot, and must not clip their own base).
  muzzle(e, target) {
    const up = e.up || _v.copy(e.center).normalize();
    const dir = new THREE.Vector3().subVectors(target, e.center).normalize();
    const v = dir.dot(up), h = Math.sqrt(Math.max(1e-6, 1 - v * v));
    const r = e.radius + 0.5, top = (e.heavy ? 1 : 0.8) + 0.5; // collider radius / height above centre
    let k = Math.min(r / h, e.heavy ? 4.6 : 3.6);
    if (v > 0) k = Math.min(k, top / v);
    return dir.multiplyScalar(k + 0.3).add(e.center);
  }

  // Clear line of fire: terrain plus solid colliders (walls, bastions, buildings) along the
  // way, sampled every couple of metres; the last stretch next to the target is ignored.
  clearShot(from, to) {
    const g = this.game;
    if (!g.planet.visible(from, to)) return false;
    const C = g.colliders;
    const len = from.distanceTo(to);
    const n = Math.ceil(len / 2);
    for (let i = 0; i < n; i++) {
      if (len * (1 - i / n) < 2.5) break;
      _sv.lerpVectors(from, to, i / n);
      for (const c of C.query(_sv, 0.4, _near)) if (C.contact(c, _sv, 0.3, _sn) > 0) return false;
    }
    return true;
  }

  // Turrets fight you when their base is hostile; otherwise they shoot any pirate that
  // wanders into range (but give up on targets that leave it).
  updateTurret(e, dt) {
    const g = this.game;
    const P = g.player;
    const base = e.base;
    const head = e.model.head;
    const range = e.heavy ? 420 : base.restricted ? 360 : 300;
    let target = null, tvel = null;
    const dP = e.center.distanceTo(P.center);
    const dc = base.hostile ? this.victim(e) : null; // an echo hologram it's fooled by
    if (base.hostile && !P.dead && dP < (e.heavy ? 600 : 520)) { target = dc ? dc.center : P.center; tvel = dc ? dc.vel : P.vel; }
    if (base.assault) {
      let bd = target ? dP : (e.heavy ? 600 : 520);
      for (const a of this.list) {
        if (a.faction !== 'ally' || a.dead) continue;
        const d = a.center.distanceTo(e.center);
        if (d < bd) { bd = d; target = a.center; tvel = a.body.vel; }
      }
    }
    else {
      if (e.pirateT && (e.pirateT.dead || e.pirateT.center.distanceTo(e.center) > range)) e.pirateT = null;
      e.scanT = (e.scanT || 0) - dt;
      e.skipCd = (e.skipCd || 0) - dt;
      if (!e.pirateT && e.scanT <= 0) {
        e.scanT = 0.5;
        let bd = range;
        for (const p of this.list) {
          if (p.faction !== 'pirate' || p.kind === 'core' || p.dead || !p.body) continue;
          if (p === e.skipT && e.skipCd > 0) continue; // no line of fire to it a moment ago
          const d = p.center.distanceTo(e.center);
          if (d < bd) { bd = d; e.pirateT = p; }
        }
      }
      if (e.pirateT) { target = e.pirateT.center; tvel = e.pirateT.body.vel; }
    }
    const look = target || ((base.inside && base.time > 2) ? P.center : null);
    if (look) {
      e.model.root.updateMatrixWorld();
      const local = e.model.root.worldToLocal(look.clone());
      let dd = Math.atan2(local.x, local.z) - head.rotation.y;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      head.rotation.y += THREE.MathUtils.clamp(dd, -2.5 * dt, 2.5 * dt);
    } else head.rotation.y += dt * 0.3;
    if (!target) return;
    e.fireCd -= dt;
    if (e.fireCd > 0) return;
    e.fireCd = e.heavy ? 0.65 : 0.9;
    const from = this.muzzle(e, target);
    if (!this.clearShot(from, target)) {
      // walls, roofs or terrain in the way: hold fire (and look for another pirate)
      e.fireCd = 0.3;
      if (target !== P.center) { e.skipT = e.pirateT; e.skipCd = 3; e.pirateT = null; }
      return;
    }
    if (target === P.center || (dc && target === dc.center)) {
      this.shoot(e, from, e.heavy ? 170 : 150, e.heavy ? 15 : 12, 0xff2a4a, 0.012);
    } else {
      const speed = e.heavy ? 170 : 150;
      const dir = this.aimLead(from, speed, 0.01, target, tvel);
      g.projectiles.fire('mil', from, dir.multiplyScalar(speed), { damage: e.heavy ? 34 : 26, splash: 5, color: 0xffb02e, size: 0.5, knock: 0.6, spare: true });
    }
  }
}
