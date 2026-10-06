import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeBody, stepSkater } from './physics.js';
import { makeRunner, makeRover, makeTurret, makeCrate } from './models.js';
import { randRange } from './rng.js';
import { FACTIONS } from './locations.js';
import { frameQuat, greatCircle, arcDist, darkness, tangent } from './geo.js';

const PIRATE_SKATER = { ...PHYS, skatePushMax: 34, thrustAccel: 13, maxEnergy: 120, carve: 12, thrustMode: 'up' };
const BASE_WAKE = 1600; // military bases sleep when you're further than this
const MAX_PIRATES = 6;
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _near = [];

function steerToward(heading, up, target, maxAngle) {
  const t = tangent(target, up).normalize();
  heading.addScaledVector(up, -heading.dot(up)).normalize();
  const ang = Math.atan2(_v.crossVectors(heading, t).dot(up), heading.dot(t));
  heading.applyQuaternion(_q.setFromAxisAngle(up, THREE.MathUtils.clamp(ang, -maxAngle, maxAngle)));
}

// Wheeled vehicle on the sphere: engine along heading, high lateral grip, terrain-following.
function stepRover(e, dt, planet, colliders, targetDir, maxSpeed, engine = 16) {
  const b = e.body;
  const up = b.up.copy(b.pos).normalize();
  steerToward(e.heading, up, targetDir, (1.8 / (1 + b.vel.length() / 40)) * dt);
  b.vel.addScaledVector(up, -PHYS.gravity * dt);
  if (b.grounded) {
    const n = b.groundN;
    const fwd = _v.copy(e.heading).addScaledVector(n, -e.heading.dot(n)).normalize();
    const along = b.vel.dot(fwd);
    b.vel.addScaledVector(fwd, along < maxSpeed ? engine * dt : -engine * 0.5 * dt);
    const vn = b.vel.dot(n);
    const lat = b.vel.clone().addScaledVector(fwd, -b.vel.dot(fwd)).addScaledVector(n, -vn);
    b.vel.addScaledVector(lat, -Math.min(1, 5 * dt));
  }
  b.pos.addScaledVector(b.vel, dt);
  const sr = planet.surface(b.pos, _n);
  const len = b.pos.length();
  if (len <= sr + 0.05) {
    b.pos.multiplyScalar(sr / len);
    const vn = b.vel.dot(_n);
    if (vn < 0) b.vel.addScaledVector(_n, -vn);
    b.grounded = true;
    b.groundN.lerp(_n, 0.3).normalize();
  } else b.grounded = len - sr < 0.4;
  if (colliders) {
    const cp = b.pos.clone().addScaledVector(up, 1.6);
    for (const c of colliders.query(cp, 5, _near)) {
      const pen = colliders.contact(c, cp, 2.4, _n);
      if (pen > 0) {
        b.pos.addScaledVector(_n, pen);
        cp.addScaledVector(_n, pen);
        const vn = b.vel.dot(_n);
        if (vn < 0) b.vel.addScaledVector(_n, -vn * 1.3);
      }
    }
  }
}

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
    for (const loc of game.locations.filter((l) => l.type === 'military')) this.setupBase(loc);
  }

  ground(dir, lift = 0) { return this.game.planet.ground(dir, new THREE.Vector3(), lift); }

  setupBase(loc) {
    const g = this.game;
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const base = { loc, time: 0, hostile: false, outside: 0, artyCd: 0, warnBeep: 0, turrets: [], patrols: [], awake: false };
    base.group = new THREE.Group();
    const spots = [];
    for (let i = 0; i < 4; i++) spots.push([(i / 4) * Math.PI * 2 + 0.4, 112]);
    for (let i = 0; i < 4; i++) spots.push([(i / 4) * Math.PI * 2 + 1.2, 290]);
    for (const [a, r] of spots) {
      const w = g.world.toWorld(loc, Math.cos(a) * r, 0, Math.sin(a) * r);
      const p = this.ground(w, -0.3);
      const up = p.clone().normalize();
      const t = makeTurret({ color: fc });
      t.root.position.copy(p);
      frameQuat(up, loc.dir.clone().sub(up), t.root.quaternion);
      base.group.add(t.root);
      const e = { kind: 'turret', faction: 'mil', base, model: t, hp: 220, maxHp: 220, fireCd: Math.random() * 2, center: p.clone().addScaledVector(up, 3), radius: 2.2, dead: false, respawn: 0 };
      base.turrets.push(e);
      this.list.push(e);
      g.colliders.add({ type: 'cyl', c: p.clone(), axis: up, y0: -1, y1: 3.8, r: 2.2 });
    }
    for (let i = 0; i < 2; i++) this.spawnPatrol(base, i);
    this.bases.push(base);
  }

  spawnPatrol(base, i) {
    const loc = base.loc;
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const a = i * Math.PI + Math.random();
    const p = this.ground(this.game.world.toWorld(loc, Math.cos(a) * 200, 0, Math.sin(a) * 200));
    const m = makeRover({ color: 0x55607a, trim: fc, pirate: false, flag: fc });
    m.root.scale.setScalar(1.15);
    base.group.add(m.root);
    const e = {
      kind: 'milrover', faction: 'mil', base, model: m, hp: 160, maxHp: 160, fireCd: 2,
      heading: tangent(loc.dir, p.clone().normalize()).normalize(),
      body: makeBody(p), center: new THREE.Vector3(), radius: 3.2, dead: false, patrolA: a, slot: i,
    };
    base.patrols.push(e);
    this.list.push(e);
    return e;
  }

  spawnPirate(kind, pos, home = null) {
    const g = this.game;
    pos = this.ground(pos, 0.5);
    let e;
    const up = pos.clone().normalize();
    if (kind === 'skater') {
      const m = makeRunner({ suit: 0x3a2b4f, accent: 0x7dff3a, helmet: 0x2b2b2b, visor: 0x7dff3a, scarf: 0xd7263d, pirate: true });
      g.scene.add(m.root);
      e = { kind, model: m, hp: 70, maxHp: 70, body: makeBody(pos) };
      e.body.maxEnergy = e.body.energy = PIRATE_SKATER.maxEnergy;
    } else {
      const m = makeRover({ color: 0x7b2ff7, trim: 0x7dff3a, pirate: true });
      g.scene.add(m.root);
      e = { kind: 'rover', model: m, hp: 140, maxHp: 140, body: makeBody(pos) };
    }
    const toP = tangent(g.player.pos.clone().sub(pos), up);
    if (toP.lengthSq() < 1e-4) toP.copy(tangent(new THREE.Vector3(1, 0, 0), up));
    Object.assign(e, { faction: 'pirate', state: 'chase', grab: 0, carrying: false, fireCd: randRange(1, 3), center: new THREE.Vector3(), radius: kind === 'skater' ? 1.3 : 3.2, dead: false, impacts: [], heading: toP.normalize(), home });
    this.list.push(e);
    if (pos.distanceTo(g.player.pos) < 700) g.fx.pop('PIRATES!', pos.clone().addScaledVector(up, 6), { color: '#7dff3a', size: 56 });
    return e;
  }

  pirateCount() { return this.list.filter((e) => e.faction === 'pirate' && !e.dead).length; }

  spawnSquad(n) {
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
      this.spawnPirate(Math.random() < 0.55 ? 'skater' : 'rover', d);
      spawned++;
    }
    if (spawned) {
      g.hud.alert('PIRATE INTERCEPT INBOUND!', '#7dff3a', 3);
      g.audio.alarm();
    }
  }

  targets() {
    const t = this._targets;
    t.length = 0;
    for (const e of this.list) if (!e.dead && (e.faction !== 'mil' || e.base.awake)) t.push(e);
    return t;
  }

  damage(e, amount, fromPlayer = true) {
    if (e.dead) return;
    e.hp -= amount;
    e.flash = 0.15;
    const g = this.game;
    if (e.faction === 'mil' && fromPlayer && !e.base.hostile) {
      e.base.hostile = true;
      e.base.time = Math.max(e.base.time, 6);
      g.hud.alert(`${FACTIONS[e.base.loc.faction].name.toUpperCase()} IS ENGAGING!`, '#ff2a4a', 3);
    }
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    const g = this.game;
    e.dead = true;
    g.fx.explosion(e.center, e.kind === 'skater' ? 6 : 10, true);
    g.fx.pop(e.kind === 'skater' ? 'KA-POW!' : 'KA-BOOM!', e.center.clone().addScaledVector(e.center.clone().normalize(), 4), { color: '#ff4f2e', size: 80 });
    g.audio.boom(true);
    if (e.faction === 'pirate') {
      const darkBonus = darkness(e.center.clone().normalize()) > 0.5 ? 1.5 : 1;
      g.addCredits(Math.round((e.kind === 'skater' ? 45 : 70) * darkBonus), 'Bounty');
    }
    if (e.carrying) {
      e.carrying = false;
      this.dropCargo(e.center.clone());
    }
    if (e.kind === 'turret') {
      e.model.head.visible = false;
      e.respawn = 90;
    } else {
      e.model.root.removeFromParent();
      if (e.kind === 'milrover') e.respawn = 60;
    }
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
    for (const e of this.list) if (e.faction === 'pirate') { e.model.root.removeFromParent(); e.dead = true; }
    this.list = this.list.filter((e) => e.faction !== 'pirate');
  }

  nearestLair(pos) {
    let best = null, bd = Infinity;
    for (const l of this.lairs) {
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

    // --- spawning ---
    const carrying = ms.active && ms.cargoState === 'held';
    const inSafe = g.currentZone && g.currentZone.safe;
    if (!P.dead && !inSafe) {
      if (carrying) {
        this.pirateTimer -= dt * (1 + dark);
        if (this.pirateTimer <= 0) {
          const hot = ms.active.cargo.hot;
          if ((hot > 0 || Math.random() < 0.35 + dark * 0.5) && this.pirateCount() < MAX_PIRATES) this.spawnSquad(Math.min(4, 1 + Math.floor(Math.max(1, hot) * 0.8 + Math.random() + dark)));
          this.pirateTimer = randRange(30, 50) / Math.max(1, hot * 0.8);
          this.darkTimer = Math.max(this.darkTimer, 14); // don't stack squads
        }
      }
      // the dark side is pirate country, cargo or not
      if (dark > 0.5) {
        this.darkTimer -= dt;
        if (this.darkTimer <= 0) {
          if (this.pirateCount() < 4) this.spawnSquad(1 + Math.floor(Math.random() * 2));
          this.darkTimer = randRange(20, 34);
          this.pirateTimer = Math.max(this.pirateTimer, 14);
        }
      }
    }
    // pirate settlements are guarded
    this.lairTimer -= dt;
    if (!P.dead && this.lairTimer <= 0) {
      this.lairTimer = 10;
      for (const l of this.lairs) {
        if (arcDist(P.pos, l.dir) > 650) continue;
        const guards = this.list.filter((e) => e.home === l && !e.dead).length;
        if (guards < (l.camp ? 2 : 3) && this.pirateCount() < MAX_PIRATES + 2) {
          const a = Math.random() * Math.PI * 2;
          this.spawnPirate(Math.random() < 0.5 ? 'skater' : 'rover', g.world.toWorld(l, Math.cos(a) * 50, 0, Math.sin(a) * 50), l);
        }
      }
    }

    for (const base of this.bases) this.updateBase(base, dt);

    for (const e of this.list) {
      if (e.dead) {
        if (e.respawn > 0) {
          e.respawn -= dt;
          if (e.respawn <= 0) this.revive(e);
        }
        continue;
      }
      if (e.faction === 'mil' && !e.base.awake) continue;
      if (e.kind === 'skater') this.updateSkater(e, dt, time);
      else if (e.kind === 'rover') this.updateRover(e, dt);
      else if (e.kind === 'milrover') this.updateMilRover(e, dt);
      else if (e.kind === 'turret') this.updateTurret(e, dt);
      if (e.flash > 0) e.flash -= dt;

      if (e.faction === 'pirate' && !e.carrying && e.body.pos.distanceTo(P.pos) > 1300) {
        e.dead = true;
        e.model.root.removeFromParent();
      }

      if (!P.dead && e.body) {
        const d = e.center.distanceTo(P.center);
        if (d < e.radius + 1.2) {
          const rel = _v.copy(P.vel).sub(e.body.vel);
          const rs = rel.length();
          const n = P.center.clone().sub(e.center).normalize();
          if (rs > 22 && P.body.skating) {
            this.damage(e, (rs - 15) * 4);
            g.fx.pop('SMASH!', e.center.clone().addScaledVector(P.up, 3), { color: '#ffd23f', size: 70 });
            g.damagePlayer(4, 'ram');
            g.audio.thud(rs);
          }
          const vn = P.vel.dot(n) - e.body.vel.dot(n);
          if (vn < 0) P.vel.addScaledVector(n, -vn * 1.4);
          P.body.pos.addScaledVector(n, (e.radius + 1.2 - d) * 0.8);
        }
      }
    }
    this.list = this.list.filter((e) => !e.dead || e.respawn > 0);

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

  revive(e) {
    e.dead = false;
    e.hp = e.maxHp;
    if (e.kind === 'turret') e.model.head.visible = true;
    else if (e.kind === 'milrover') {
      const a = Math.random() * Math.PI * 2;
      const p = this.ground(this.game.world.toWorld(e.base.loc, Math.cos(a) * 120, 0, Math.sin(a) * 120));
      e.body = makeBody(p);
      e.base.group.add(e.model.root);
    }
  }

  updateBase(base, dt) {
    const g = this.game;
    const P = g.player;
    const loc = base.loc;
    const d = arcDist(P.pos, loc.dir);
    const awake = d < BASE_WAKE;
    if (awake !== base.awake) {
      base.awake = awake;
      if (awake) g.scene.add(base.group); else g.scene.remove(base.group);
    }
    const inside = !P.dead && d < loc.zoneR;
    const authorized = g.missions.hasClearance(loc.id);
    base.inside = inside;
    if (inside && !authorized) {
      base.time += dt;
      base.outside = 0;
      if (base.time > 4) base.hostile = true;
      base.warnBeep -= dt;
      if (base.warnBeep <= 0) { g.audio.alarm(); base.warnBeep = base.hostile ? 1.2 : 0.8; }
    } else {
      if (base.time > 0 && !base.hostile) base.time = Math.max(0, base.time - dt * 2);
      if (base.hostile) {
        base.outside += dt;
        if (base.outside > 8 || P.dead) { base.hostile = false; base.time = 0; }
      }
    }
    if (inside && !authorized && base.time > 9) {
      base.artyCd -= dt;
      if (base.artyCd <= 0) {
        base.artyCd = 1.8;
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
    }
    for (const z of g.world.zoneWalls) if (z.loc === loc) z.mat.uniforms.alert.value = base.hostile ? 1 : inside && !authorized ? 0.5 : 0;
  }

  aimLead(from, speed, inaccuracy) {
    const P = this.game.player;
    const dist = from.distanceTo(P.center);
    const aim = P.center.clone().addScaledVector(P.vel, dist / speed);
    aim.x += randRange(-1, 1) * inaccuracy * dist;
    aim.y += randRange(-1, 1) * inaccuracy * dist;
    aim.z += randRange(-1, 1) * inaccuracy * dist;
    return aim.sub(from).normalize();
  }

  tryGrab(e, dt) {
    const g = this.game;
    const P = g.player;
    if (g.missions.cargoState !== 'held' || P.dead) { e.grab = 0; return; }
    if (e.center.distanceTo(P.center) < e.radius + 6) {
      e.grab += dt;
      g.hud.grab(Math.min(1, e.grab / 1.1));
      if (e.grab > 1.1) {
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
    if (P.dead || !g.planet.visible(from, P.center)) return;
    // in the dark, a lamp-less runner is much harder to hit
    const P2 = this.game.player;
    if (darkness(P2.up) > 0.5 && P2.lamp.intensity < 1) inaccuracy *= 2.4;
    const dir = this.aimLead(from, speed, inaccuracy);
    g.projectiles.fire(e.faction, from, dir.multiplyScalar(speed), { damage: dmg, splash: 3, color, size: 0.5, knock: 0.6 });
    if (from.distanceTo(P.center) < 300) g.audio.enemyShot();
  }

  targetFor(e, lead) {
    const P = this.game.player;
    if (e.state === 'flee' && e.home) return e.home.pos;
    const dist = e.body.pos.distanceTo(P.pos);
    return P.pos.clone().addScaledVector(P.vel, Math.min(lead, dist / 60));
  }

  updateSkater(e, dt, time) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    const target = this.targetFor(e, 2.5);
    const up = b.up.copy(b.pos).normalize();
    const to = target.clone().sub(b.pos);
    const wish = tangent(to, up);
    const dist = wish.length();
    wish.normalize();
    const climb = to.dot(up);
    const sp = b.vel.length();
    const closing = b.vel.dot(wish);
    const ctrl = {
      wish,
      skates: !(dist < 20 && closing > 20) || e.state === 'flee',
      thrust: b.energy > 25 && (sp < 22 || (climb > 8 && dist < 200) || (dist > 200 && sp < 50)),
      jump: b.grounded && Math.random() < dt * 0.15,
      thrustDir: wish.clone().multiplyScalar(0.8).add(up).normalize(),
    };
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) { stepSkater(b, ctrl, dt / steps, g.planet, g.colliders, PIRATE_SKATER, e.impacts); ctrl.jump = false; }
    e.center.copy(b.pos).addScaledVector(up, 1.3);

    if (e.state === 'chase') {
      this.tryGrab(e, dt);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && b.pos.distanceTo(P.pos) < 240) {
        e.fireCd = randRange(1.6, 2.6);
        this.shoot(e, e.center.clone().add(up), 80, 7, 0x7dff3a, 0.03);
      }
    } else if (e.home && arcDist(b.pos, e.home.dir) < 60) this.fence(e);

    const m = e.model;
    const hv = tangent(b.vel, up);
    if (hv.lengthSq() > 4) e.heading.copy(hv.normalize());
    m.root.position.copy(b.pos);
    frameQuat(up, e.heading, m.root.quaternion);
    m.torso.rotation.x = b.grounded ? 0.5 : 0.1;
    m.body.position.y = m.bodyBase + (b.grounded ? -0.15 : 0);
    m.armL.rotation.z = -0.5; m.armR.rotation.z = 0.5;
    m.scarf.rotation.x = -0.4 - Math.min(1.2, sp / 30) + Math.sin(time * 9) * 0.1;
    m.glowM.color.setHex(e.flash > 0 ? 0xffffff : 0x7dff3a);
    if (e.carrying && !m.loot) { m.loot = makeCrate(g.missions.active ? g.missions.active.cargo.color : 0xffd23f, 0.7); m.cargoSlot.add(m.loot); }
  }

  fence(e) {
    e.dead = true;
    e.model.root.removeFromParent();
    this.game.missions.onFenced(e.home);
  }

  updateRover(e, dt) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    const target = this.targetFor(e, 3);
    stepRover(e, dt, g.planet, g.colliders, target.clone().sub(b.pos), e.state === 'flee' ? 40 : 54, 18);
    this.poseVehicle(e, dt);
    if (e.state === 'chase') {
      this.tryGrab(e, dt);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && b.pos.distanceTo(P.pos) < 260) {
        e.fireCd = randRange(1.2, 2.0);
        this.shoot(e, e.center.clone().addScaledVector(b.up, 2), 85, 7, 0x7dff3a, 0.035);
      }
    } else if (e.home && arcDist(b.pos, e.home.dir) < 60) this.fence(e);
    if (e.carrying && !e.model.loot) {
      e.model.loot = makeCrate(g.missions.active ? g.missions.active.cargo.color : 0xffd23f, 1.2);
      e.model.loot.position.set(0, 3.3, -1.5);
      e.model.chassis.add(e.model.loot);
    }
  }

  updateMilRover(e, dt) {
    const g = this.game;
    const P = g.player;
    const base = e.base;
    const loc = base.loc;
    const b = e.body;
    let target, maxSp;
    if (base.hostile && !P.dead && arcDist(P.pos, loc.dir) < loc.zoneR + 250) {
      target = P.pos.clone().addScaledVector(P.vel, 1.5);
      maxSp = 46;
    } else {
      e.patrolA += dt * 0.07;
      const a = e.patrolA + e.slot * Math.PI;
      target = g.world.toWorld(loc, Math.cos(a) * 220, 0, Math.sin(a) * 220);
      maxSp = arcDist(b.pos, loc.dir) > loc.zoneR ? 30 : 16;
    }
    stepRover(e, dt, g.planet, g.colliders, target.sub(b.pos), maxSp, 14);
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
    e.center.copy(b.pos).addScaledVector(b.up, 1.8);
    m.root.updateMatrixWorld();
    const local = m.root.worldToLocal(this.game.player.center.clone());
    m.gun.rotation.y = Math.atan2(local.x, local.z);
  }

  updateTurret(e, dt) {
    const g = this.game;
    const P = g.player;
    const base = e.base;
    const head = e.model.head;
    const d = e.center.distanceTo(P.center);
    if (base.hostile || (base.inside && base.time > 2)) {
      e.model.root.updateMatrixWorld();
      const local = e.model.root.worldToLocal(P.center.clone());
      let dd = Math.atan2(local.x, local.z) - head.rotation.y;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      head.rotation.y += THREE.MathUtils.clamp(dd, -2.5 * dt, 2.5 * dt);
    } else head.rotation.y += dt * 0.3;
    if (base.hostile && !P.dead && d < 520) {
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = 0.9;
        this.shoot(e, e.center.clone().addScaledVector(e.center.clone().normalize(), 1), 150, 12, 0xff2a4a, 0.012);
      }
    }
  }
}
