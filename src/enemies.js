import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeBody, stepSkater } from './physics.js';
import { makeRunner, makeRover, makeTurret, makeCrate } from './models.js';
import { randRange } from './rng.js';
import { FACTIONS } from './locations.js';

const UP = new THREE.Vector3(0, 1, 0);
const PIRATE_SKATER = { ...PHYS, skatePushMax: 34, thrustAccel: 13, maxEnergy: 120, carve: 12 };
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

// Ground vehicle model: engine along heading, high lateral grip, terrain-following.
function stepRover(e, dt, terrain, colliders, targetDir, throttle, maxSpeed, engine = 16) {
  const b = e.body;
  const want = Math.atan2(targetDir.x, targetDir.z);
  let d = want - e.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const turn = 1.8 / (1 + b.vel.length() / 40);
  e.yaw += THREE.MathUtils.clamp(d, -turn * dt, turn * dt);
  b.vel.y -= PHYS.gravity * dt;
  const fwd = _v.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
  if (b.grounded) {
    const n = b.groundN;
    fwd.addScaledVector(n, -fwd.dot(n)).normalize();
    const along = b.vel.dot(fwd);
    if (along < maxSpeed * throttle) b.vel.addScaledVector(fwd, engine * dt);
    else b.vel.addScaledVector(fwd, -engine * 0.5 * dt);
    const vn = b.vel.dot(n);
    const lat = b.vel.clone().addScaledVector(fwd, -b.vel.dot(fwd)).addScaledVector(n, -vn);
    b.vel.addScaledVector(lat, -Math.min(1, 5 * dt));
  }
  b.pos.addScaledVector(b.vel, dt);
  const h = terrain.height(b.pos.x, b.pos.z);
  terrain.normal(b.pos.x, b.pos.z, _n);
  if (b.pos.y <= h + 0.05) {
    b.pos.y = h;
    const vn = b.vel.dot(_n);
    if (vn < 0) b.vel.addScaledVector(_n, -vn);
    b.grounded = true;
    b.groundN.lerp(_n, 0.3).normalize();
  } else b.grounded = b.pos.y - h < 0.4;
  if (colliders) {
    const cp = new THREE.Vector3(b.pos.x, b.pos.y + 1.6, b.pos.z);
    for (const c of colliders.query(cp.x, cp.z, 5)) {
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
    this.gulchTimer = 0;
    this.bases = [];
    this._targets = [];
    for (const loc of game.locations.filter((l) => l.type === 'military')) this.setupBase(loc);
  }

  setupBase(loc) {
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const base = { loc, time: 0, hostile: false, outside: 0, artyCd: 0, warnBeep: 0, turrets: [], patrols: [] };
    const spots = [];
    for (let i = 0; i < 4; i++) spots.push([(i / 4) * Math.PI * 2 + 0.4, 112]);
    for (let i = 0; i < 4; i++) spots.push([(i / 4) * Math.PI * 2 + 1.2, 300]);
    for (const [a, r] of spots) {
      const x = loc.x + Math.cos(a) * r, z = loc.z + Math.sin(a) * r;
      const t = makeTurret({ color: fc });
      t.root.position.set(x, this.game.terrain.height(x, z) - 0.3, z);
      this.game.scene.add(t.root);
      const e = { kind: 'turret', faction: 'mil', base, model: t, hp: 220, maxHp: 220, fireCd: Math.random() * 2, center: new THREE.Vector3(x, t.root.position.y + 3, z), radius: 2.2, dead: false, respawn: 0 };
      base.turrets.push(e);
      this.list.push(e);
      this.game.colliders.add({ type: 'cyl', x, z, y0: t.root.position.y - 1, y1: t.root.position.y + 3.8, r: 2.2 });
    }
    for (let i = 0; i < 2; i++) this.spawnPatrol(base, i);
    this.bases.push(base);
  }

  spawnPatrol(base, i) {
    const loc = base.loc;
    const fc = new THREE.Color(FACTIONS[loc.faction].color).getHex();
    const a = i * Math.PI + Math.random();
    const x = loc.x + Math.cos(a) * 200, z = loc.z + Math.sin(a) * 200;
    const m = makeRover({ color: 0x55607a, trim: fc, pirate: false, flag: fc });
    m.root.scale.setScalar(1.15);
    this.game.scene.add(m.root);
    const e = {
      kind: 'milrover', faction: 'mil', base, model: m, hp: 160, maxHp: 160, fireCd: 2, yaw: a,
      body: makeBody(new THREE.Vector3(x, this.game.terrain.height(x, z), z)),
      center: new THREE.Vector3(), radius: 3.2, dead: false, patrolA: a, slot: i,
    };
    base.patrols.push(e);
    this.list.push(e);
    return e;
  }

  spawnPirate(kind, pos) {
    const g = this.game;
    pos.y = g.terrain.height(pos.x, pos.z) + 0.5;
    let e;
    if (kind === 'skater') {
      const m = makeRunner({ suit: 0x3a2b4f, accent: 0x7dff3a, helmet: 0x2b2b2b, visor: 0x7dff3a, scarf: 0xd7263d, pirate: true });
      g.scene.add(m.root);
      e = { kind, model: m, hp: 70, maxHp: 70, body: makeBody(pos), heading: 0 };
      e.body.maxEnergy = e.body.energy = PIRATE_SKATER.maxEnergy;
    } else {
      const m = makeRover({ color: 0x7b2ff7, trim: 0x7dff3a, pirate: true });
      g.scene.add(m.root);
      e = { kind: 'rover', model: m, hp: 140, maxHp: 140, body: makeBody(pos), yaw: Math.random() * 6 };
    }
    Object.assign(e, { faction: 'pirate', state: 'chase', grab: 0, carrying: false, fireCd: randRange(1, 3), center: new THREE.Vector3(), radius: kind === 'skater' ? 1.3 : 3.2, dead: false, impacts: [] });
    this.list.push(e);
    g.fx.pop('PIRATES!', pos.clone().add(new THREE.Vector3(0, 6, 0)), { color: '#7dff3a', size: 56 });
    return e;
  }

  pirateCount() { return this.list.filter((e) => e.faction === 'pirate' && !e.dead).length; }

  spawnSquad(hot) {
    const g = this.game;
    const p = g.player.pos;
    const dir = new THREE.Vector3(g.player.vel.x, 0, g.player.vel.z);
    if (dir.lengthSq() < 4) dir.set(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw));
    dir.normalize();
    const n = Math.min(4, 1 + Math.floor(hot * 0.8 + Math.random()));
    let spawned = 0;
    for (let i = 0; i < n * 3 && spawned < n; i++) {
      const ang = (Math.random() - 0.5) * 2.2;
      const d = randRange(320, 520);
      const v = dir.clone().applyAxisAngle(UP, ang).multiplyScalar(d).add(p);
      if (Math.hypot(v.x, v.z) > 1750) continue;
      if (g.zoneAt(v.x, v.z, 1.4)) continue;
      this.spawnPirate(Math.random() < 0.55 ? 'skater' : 'rover', v);
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
    for (const e of this.list) if (!e.dead) t.push(e);
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
    g.fx.pop(e.kind === 'skater' ? 'KA-POW!' : 'KA-BOOM!', e.center.clone().add(new THREE.Vector3(0, 4, 0)), { color: '#ff4f2e', size: 80 });
    g.audio.boom(true);
    if (e.faction === 'pirate') g.addCredits(e.kind === 'skater' ? 45 : 70, 'Bounty');
    if (e.carrying) {
      e.carrying = false;
      this.dropCargo(e.center.clone());
    }
    if (e.kind === 'turret') {
      e.model.head.visible = false;
      e.respawn = 90;
    } else {
      g.scene.remove(e.model.root);
      if (e.kind === 'milrover') e.respawn = 60;
    }
  }

  dropCargo(pos) {
    const g = this.game;
    const color = g.missions.active ? g.missions.active.cargo.color : 0xffd23f;
    const crate = makeCrate(color, 1.4);
    pos.y = g.terrain.height(pos.x, pos.z) + 1.2;
    crate.position.copy(pos);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.35, depthWrite: false }));
    beam.position.y = 60;
    crate.add(beam);
    g.scene.add(crate);
    this.drops.push({ mesh: crate, pos: pos.clone() });
    g.missions.onCargoDropped(pos);
    g.fx.pop('CARGO DROPPED!', pos.clone().add(new THREE.Vector3(0, 5, 0)), { color: '#2ee6ff', size: 52 });
  }

  clearDrops() {
    for (const d of this.drops) this.game.scene.remove(d.mesh);
    this.drops.length = 0;
  }

  clearPirates() {
    for (const e of this.list) if (e.faction === 'pirate') { this.game.scene.remove(e.model.root); e.dead = true; }
    this.list = this.list.filter((e) => e.faction !== 'pirate');
  }

  update(dt, time) {
    const g = this.game;
    const P = g.player;
    const ms = g.missions;

    // --- spawning ---
    const carrying = ms.active && ms.cargoState === 'held';
    const inSafe = g.currentZone && g.currentZone.safe;
    if (!P.dead && carrying && !inSafe) {
      this.pirateTimer -= dt;
      if (this.pirateTimer <= 0) {
        const hot = ms.active.cargo.hot;
        if (hot > 0 || Math.random() < 0.35) {
          if (this.pirateCount() < 5) this.spawnSquad(Math.max(1, hot));
        }
        this.pirateTimer = randRange(30, 50) / Math.max(1, hot * 0.8);
      }
    }
    const gulch = g.locations.find((l) => l.id === 'gulch');
    this.gulchTimer -= dt;
    if (!P.dead && gulch && P.pos.distanceTo(new THREE.Vector3(gulch.x, P.pos.y, gulch.z)) < 650 && this.gulchTimer <= 0) {
      const nearGulch = this.list.filter((e) => e.faction === 'pirate' && !e.dead && Math.hypot(e.body.pos.x - gulch.x, e.body.pos.z - gulch.z) < 400).length;
      if (nearGulch < 3) {
        const a = Math.random() * Math.PI * 2;
        this.spawnPirate(Math.random() < 0.5 ? 'skater' : 'rover', new THREE.Vector3(gulch.x + Math.cos(a) * 60, 0, gulch.z + Math.sin(a) * 60));
      }
      this.gulchTimer = 12;
    }

    // --- military zones ---
    for (const base of this.bases) this.updateBase(base, dt, time);

    // --- entities ---
    for (const e of this.list) {
      if (e.dead) {
        if (e.respawn > 0) {
          e.respawn -= dt;
          if (e.respawn <= 0) this.revive(e);
        }
        continue;
      }
      if (e.kind === 'skater') this.updateSkater(e, dt, time);
      else if (e.kind === 'rover') this.updateRover(e, dt);
      else if (e.kind === 'milrover') this.updateMilRover(e, dt);
      else if (e.kind === 'turret') this.updateTurret(e, dt);
      if (e.flash > 0) e.flash -= dt;

      // despawn far pirates
      if (e.faction === 'pirate' && !e.carrying && e.body.pos.distanceTo(P.pos) > 1300) {
        e.dead = true;
        g.scene.remove(e.model.root);
      }

      // ramming
      if (!P.dead && e.body) {
        const d = e.center.distanceTo(P.center);
        if (d < e.radius + 1.2) {
          const rel = _v.copy(P.vel).sub(e.body.vel);
          const rs = rel.length();
          const n = P.center.clone().sub(e.center).normalize();
          if (rs > 22 && P.body.skating) {
            this.damage(e, (rs - 15) * 4);
            g.fx.pop('SMASH!', e.center.clone().add(new THREE.Vector3(0, 3, 0)), { color: '#ffd23f', size: 70 });
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

    // dropped cargo pickup
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.mesh.rotation.y += dt * 2;
      if (!P.dead && d.pos.distanceTo(P.pos) < 5) {
        g.scene.remove(d.mesh);
        this.drops.splice(i, 1);
        ms.recoverCargo();
      }
    }
  }

  revive(e) {
    const g = this.game;
    e.dead = false;
    e.hp = e.maxHp;
    if (e.kind === 'turret') e.model.head.visible = true;
    else if (e.kind === 'milrover') {
      const base = e.base;
      const a = Math.random() * Math.PI * 2;
      const x = base.loc.x + Math.cos(a) * 120, z = base.loc.z + Math.sin(a) * 120;
      e.body = makeBody(new THREE.Vector3(x, g.terrain.height(x, z), z));
      g.scene.add(e.model.root);
    }
  }

  updateBase(base, dt, time) {
    const g = this.game;
    const P = g.player;
    const loc = base.loc;
    const d = Math.hypot(P.pos.x - loc.x, P.pos.z - loc.z);
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
    // artillery bombardment after lingering
    if (inside && !authorized && base.time > 9) {
      base.artyCd -= dt;
      if (base.artyCd <= 0) {
        base.artyCd = 1.8;
        const tgt = P.pos.clone().addScaledVector(P.vel, 2.4 * 0.75);
        tgt.x += randRange(-16, 16); tgt.z += randRange(-16, 16);
        tgt.y = g.terrain.height(tgt.x, tgt.z);
        g.fx.warningRing(tgt, 16, 2.4);
        g.schedule(2.4, () => {
          g.fx.spawn(tgt.clone().add(new THREE.Vector3(0, 60, 0)), new THREE.Vector3(0, -200, 0), { color: 0xffd23f, size: 1.2, life: 0.3, count: 3, spread: 1 });
          g.explode(tgt.clone().add(new THREE.Vector3(0, 1, 0)), 16, 45, 'mil', 2.5, 0xff4f2e);
        });
      }
    }
    for (const z of g.world.zoneWalls) if (z.loc === loc) z.mat.uniforms.alert.value = base.hostile ? 1 : inside && !authorized ? 0.5 : 0;
  }

  aimLead(from, speed, inaccuracy) {
    const P = this.game.player;
    const dist = from.distanceTo(P.center);
    const t = dist / speed;
    const aim = P.center.clone().addScaledVector(P.vel, t);
    aim.x += randRange(-1, 1) * inaccuracy * dist;
    aim.y += randRange(-1, 1) * inaccuracy * dist * 0.5;
    aim.z += randRange(-1, 1) * inaccuracy * dist;
    return aim.sub(from).normalize();
  }

  tryGrab(e, dt) {
    const g = this.game;
    const P = g.player;
    if (g.missions.cargoState !== 'held' || P.dead) { e.grab = 0; return; }
    const d = e.center.distanceTo(P.center);
    if (d < e.radius + 6) {
      e.grab += dt;
      g.hud.grab(Math.min(1, e.grab / 1.1));
      if (e.grab > 1.1) {
        e.grab = 0;
        e.carrying = true;
        e.state = 'flee';
        g.missions.onStolen(e);
      }
    } else e.grab = Math.max(0, e.grab - dt * 0.6);
  }

  shoot(e, from, speed, dmg, color, inaccuracy) {
    const g = this.game;
    const P = g.player;
    if (P.dead || !g.terrain.visible(from, P.center)) return;
    const dir = this.aimLead(from, speed, inaccuracy);
    g.projectiles.fire(e.faction, from, dir.multiplyScalar(speed), { damage: dmg, splash: 3, color, size: 0.5, knock: 0.6 });
    if (from.distanceTo(P.center) < 300) g.audio.enemyShot();
  }

  updateSkater(e, dt, time) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    let target;
    if (e.state === 'flee') {
      const gulch = g.locations.find((l) => l.id === 'gulch');
      target = new THREE.Vector3(gulch.x, 0, gulch.z);
    } else {
      const dist = b.pos.distanceTo(P.pos);
      target = P.pos.clone().addScaledVector(P.vel, Math.min(2.5, dist / 60));
    }
    const to = target.clone().sub(b.pos);
    const dist = Math.hypot(to.x, to.z);
    const wish = new THREE.Vector3(to.x, 0, to.z).normalize();
    const sp = b.vel.length();
    const closing = b.vel.dot(wish);
    const ctrl = {
      wish,
      skates: !(dist < 20 && closing > 20) || e.state === 'flee',
      thrust: b.energy > 25 && (sp < 22 || (to.y > 8 && dist < 200) || (dist > 200 && sp < 50)),
      jump: Math.random() < dt * 0.15,
      thrustDir: wish.clone().multiplyScalar(0.8).add(UP).normalize(),
    };
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) { stepSkater(b, ctrl, dt / steps, g.terrain, g.colliders, PIRATE_SKATER, e.impacts); ctrl.jump = false; }
    e.center.copy(b.pos).addScaledVector(UP, 1.3);

    if (e.state === 'chase') {
      this.tryGrab(e, dt);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && b.pos.distanceTo(P.pos) < 240) {
        e.fireCd = randRange(1.6, 2.6);
        this.shoot(e, e.center.clone().add(UP), 80, 9, 0x7dff3a, 0.025);
      }
    } else if (dist < 60) this.fence(e);

    // animate
    const m = e.model;
    const hv = Math.hypot(b.vel.x, b.vel.z);
    if (hv > 2) e.heading = Math.atan2(b.vel.x, b.vel.z);
    m.root.position.copy(b.pos);
    m.root.rotation.set(0, e.heading, 0);
    m.torso.rotation.x = b.grounded ? 0.5 : 0.1;
    m.body.position.y = b.grounded ? -0.15 : 0;
    m.armL.rotation.z = -0.5; m.armR.rotation.z = 0.5;
    m.scarf.rotation.x = -0.4 - Math.min(1.2, sp / 30) + Math.sin(time * 9) * 0.1;
    m.glowM.color.setHex(e.flash > 0 ? 0xffffff : 0x7dff3a);
    if (e.carrying && !m.loot) { m.loot = makeCrate(g.missions.active ? g.missions.active.cargo.color : 0xffd23f, 0.7); m.cargoSlot.add(m.loot); }
  }

  fence(e) {
    const g = this.game;
    e.dead = true;
    g.scene.remove(e.model.root);
    g.missions.onFenced();
  }

  updateRover(e, dt) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    let target;
    if (e.state === 'flee') {
      const gulch = g.locations.find((l) => l.id === 'gulch');
      target = new THREE.Vector3(gulch.x, 0, gulch.z);
    } else {
      const dist = b.pos.distanceTo(P.pos);
      target = P.pos.clone().addScaledVector(P.vel, Math.min(3, dist / 50));
    }
    const to = target.clone().sub(b.pos);
    to.y = 0;
    const dist = to.length();
    stepRover(e, dt, g.terrain, g.colliders, to.normalize(), 1, e.state === 'flee' ? 40 : 54, 18);
    this.poseVehicle(e, dt);
    if (e.state === 'chase') {
      this.tryGrab(e, dt);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && b.pos.distanceTo(P.pos) < 260) {
        e.fireCd = randRange(1.2, 2.0);
        this.shoot(e, e.center.clone().add(new THREE.Vector3(0, 2, 0)), 85, 8, 0x7dff3a, 0.03);
      }
    } else if (dist < 60) this.fence(e);
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
    const dFromBase = Math.hypot(b.pos.x - loc.x, b.pos.z - loc.z);
    if (base.hostile && !P.dead && Math.hypot(P.pos.x - loc.x, P.pos.z - loc.z) < loc.zoneR + 250) {
      target = P.pos.clone().addScaledVector(P.vel, 1.5);
      maxSp = 46;
    } else {
      e.patrolA += dt * 0.07;
      const a = e.patrolA + e.slot * Math.PI;
      target = new THREE.Vector3(loc.x + Math.cos(a) * 220, 0, loc.z + Math.sin(a) * 220);
      maxSp = dFromBase > loc.zoneR ? 30 : 16;
    }
    const to = target.sub(b.pos);
    to.y = 0;
    stepRover(e, dt, g.terrain, g.colliders, to.normalize(), 1, maxSp, 14);
    this.poseVehicle(e, dt);
    if (base.hostile) {
      e.fireCd -= dt;
      if (e.fireCd <= 0 && b.pos.distanceTo(P.pos) < 300) {
        e.fireCd = randRange(1.0, 1.6);
        this.shoot(e, e.center.clone().add(new THREE.Vector3(0, 2.5, 0)), 120, 11, 0xff2a4a, 0.02);
      }
    }
  }

  poseVehicle(e, dt) {
    const b = e.body;
    const m = e.model;
    m.root.position.copy(b.pos);
    const qUp = new THREE.Quaternion().setFromUnitVectors(UP, b.groundN);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, e.yaw);
    m.root.quaternion.slerp(qUp.multiply(qYaw), Math.min(1, dt * 8));
    const sp = b.vel.length();
    for (const w of m.wheels) w.rotation.x += sp * dt / 0.85;
    e.center.copy(b.pos).addScaledVector(UP, 1.8);
    const P = this.game.player;
    const local = m.root.worldToLocal(P.center.clone());
    m.gun.rotation.y = Math.atan2(local.x, local.z);
  }

  updateTurret(e, dt) {
    const g = this.game;
    const P = g.player;
    const base = e.base;
    const head = e.model.head;
    const to = P.center.clone().sub(e.center);
    const d = to.length();
    if (base.hostile || (base.inside && base.time > 2)) {
      const want = Math.atan2(to.x, to.z);
      let dd = want - head.rotation.y;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      head.rotation.y += THREE.MathUtils.clamp(dd, -2.5 * dt, 2.5 * dt);
    } else head.rotation.y += dt * 0.3;
    if (base.hostile && !P.dead && d < 520) {
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = 0.9;
        this.shoot(e, e.center.clone().add(new THREE.Vector3(0, 1, 0)), 150, 12, 0xff2a4a, 0.012);
      }
    }
  }
}
