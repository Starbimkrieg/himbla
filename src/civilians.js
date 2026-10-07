import * as THREE from 'three';
import { PHYS } from './config.js';
import { FACTIONS } from './locations.js';
import { frameQuat } from './geo.js';

// Civilian harm. The only damageable people are the three "crowd" lists:
//   - settlement residents  (world.figures,        src 'res')
//   - traffic passengers    (world.traffic.walkers, src 'pax')
//   - freed jar wanderers   (alchemy.wanderers,     src 'wand')
// Everyone else (skywalk walkers, casino staff, Dr. Zbornak, leaders, statues) is never looked at.
//
// A blast from the player knocks a person into a cheap ragdoll (one point mass + a tumble, limbs
// flailing), they bounce and lie flat; survivors get up, put their hands up and run, the dead lie
// there with a K.O. and are cleared away later (residents come back after a few minutes). Hurting
// anyone in sight of a settlement alerts its defenses and costs standing with its faction.

const HP = 55; // pulse disc: 34 dmg, ~34 on a direct hit, ~24 at 4 m -> 2-3 hits
const HP_SOLDIER = 80;
const KO_LINGER = 30; // seconds a knocked-out body stays before it's cleared
const RESPAWN = 150; // a cleared resident comes back after this (once nobody is looking)
const ALERT = 75; // seconds a settlement stays alerted after you hurt a civilian (refreshes)
const PANIC_R = 25; // bystanders this close panic too
const REP_HIT = -3, REP_KILL = -8;
const HANDS_UP = -2.8; // arm bone rotation.x: straight up (arms hang along -Y, face is +Z)
const LIE = 0.22, STAND = 0.9; // body-centre height above the root (x figure scale)

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _near = [];
const OOF = ['OOF!', 'YIKES!', 'HEY!', 'OW!', 'EEK!'];

function segDist2(a, b, c) {
  _w.subVectors(b, a);
  const L2 = _w.lengthSq();
  const t = L2 > 0 ? Math.max(0, Math.min(1, _u.subVectors(c, a).dot(_w) / L2)) : 0;
  return _u.copy(a).addScaledVector(_w, t).distanceToSquared(c);
}

export class Civilians {
  constructor(game) {
    this.g = game;
    this.list = []; // people currently out of their scripted routine: { f, src, ref, ...state }
    this.gone = []; // cleared residents waiting to respawn
    this.byLoc = null;
    game.blastHooks = game.blastHooks || [];
    game.blastHooks.push((pos, radius, damage, owner) => this.blast(pos, radius, damage, owner));
  }

  get world() { return this.g.world; }

  locFigures() {
    if (!this.byLoc) {
      this.byLoc = new Map();
      for (const f of this.world.figures) {
        if (!this.byLoc.has(f.loc)) this.byLoc.set(f.loc, []);
        this.byLoc.get(f.loc).push(f);
      }
    }
    return this.byLoc;
  }

  // Calls fn(fig, src, ref, centre) for every damageable person whose body centre may be within
  // `reach` of p. Cheap: whole settlements are skipped by distance first.
  each(p, reach, fn) {
    const W = this.world;
    for (const [loc, figs] of this.locFigures()) {
      if (!loc.active || loc.camDist > 450) continue;
      if (loc.pos.distanceTo(p) > loc.r + reach + 10) continue;
      const M = loc.group.matrixWorld;
      for (const f of figs) {
        if (f.civ || f.captured || !f.root.visible) continue;
        const s = f.root.scale.y;
        _v.copy(f.root.position); _v.y += STAND * s;
        _v.applyMatrix4(M);
        if (_v.distanceToSquared(p) < reach * reach) fn(f, 'res', f, _v);
      }
    }
    const T = W.traffic;
    if (T) for (const wk of T.walkers) {
      if (wk.done || !wk.loc.active || wk.fig.civ || !wk.fig.root.visible) continue;
      if (wk.loc.pos.distanceTo(p) > 600) continue;
      const f = wk.fig;
      _v.copy(f.root.position); _v.y += STAND * f.root.scale.y;
      _v.applyMatrix4(wk.loc.group.matrixWorld);
      if (_v.distanceToSquared(p) < reach * reach) fn(f, 'pax', wk, _v);
    }
    const A = this.g.alchemy;
    if (A) for (const w of A.wanderers) {
      if (w.civ) continue;
      _v.copy(w.root.position).addScaledVector(_n.copy(w.root.position).normalize(), STAND * w.root.scale.y);
      if (_v.distanceToSquared(p) < reach * reach) fn(w, 'wand', w, _v);
    }
    for (const c of this.list) {
      if (c.f.captured || c.state === 'gone') continue;
      if (c.center.distanceToSquared(p) < reach * reach) fn(c.f, c.src, c.ref, c.center);
    }
  }

  // Projectile direct hits (player shots only): does the segment a->b pass through a person?
  segHit(a, b) {
    let hit = false;
    const mid = _x.addVectors(a, b).multiplyScalar(0.5);
    const reach = a.distanceTo(b) * 0.5 + 2;
    const m = mid.clone();
    this.each(m, reach, (f, src, ref, c) => { if (!hit && segDist2(a, b, c) < 0.9 * 0.9) hit = true; });
    return hit;
  }

  blast(pos, radius, damage, owner) {
    if (owner !== 'player' || !(damage > 0)) return;
    const R = radius + 1;
    const hits = [];
    this.each(pos, R, (f, src, ref, c) => hits.push({ f, src, ref, d: c.distanceTo(pos) }));
    for (const h of hits) {
      const k = h.d / R;
      const dmg = damage * THREE.MathUtils.clamp(1.1 - k * 0.8, 0.35, 1);
      this.hurt(h.f, h.src, h.ref, dmg, pos, 1 - k);
    }
  }

  // Take a person out of their scripted routine; returns the controller.
  grab(f, src, ref) {
    if (f.civ) return f.civ;
    const scene = this.world.scene;
    if (src === 'pax' && this.world.traffic) this.world.traffic.detach(ref);
    if (f.root.parent !== scene) {
      f.root.parent && f.root.parent.updateMatrixWorld(true);
      scene.attach(f.root);
    }
    f.root.visible = true;
    const s = f.root.scale.y;
    const c = {
      f, src, ref, state: 'flee', t: 0, hurt: false, dead: false,
      hp: f.hp ?? (f.kind === 'soldier' ? HP_SOLDIER : HP),
      vel: new THREE.Vector3(), center: new THREE.Vector3(), quat: f.root.quaternion.clone(),
      axis: new THREE.Vector3(1, 0, 0), spin: 0, flee: 0, dir: new THREE.Vector3(), dirT: 0, s, repT: -9,
    };
    c.center.set(0, STAND * s, 0).applyQuaternion(c.quat).add(f.root.position);
    f.civ = c;
    this.list.push(c);
    return c;
  }

  hurt(f, src, ref, dmg, from, k) {
    const g = this.g;
    if (f.civ && f.civ.dead) return;
    const c = this.grab(f, src, ref);
    c.hp -= dmg;
    f.hp = c.hp;
    c.hurt = true;
    const up = _u.copy(c.center).normalize();
    // blast impulse: away from the centre, plus a big comic upward kick
    const away = _v.copy(c.center).sub(from);
    away.addScaledVector(up, -away.dot(up));
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    away.addScaledVector(up, -away.dot(up)).normalize();
    const power = Math.min(1.6, dmg / 30);
    c.vel.addScaledVector(away, 5 + 9 * power * Math.max(0.3, k)).addScaledVector(up, 4 + 6 * power);
    c.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    c.spin = 5 + Math.random() * 7;
    c.state = 'air'; c.t = 0;
    const killed = c.hp <= 0;
    if (killed) {
      c.dead = true;
      g.fx.pop('K.O.!', c.center.clone().addScaledVector(up, 2), { color: '#ffd23f', size: 56, life: 1.2 });
      g.fx.spawn(c.center, up.clone().multiplyScalar(4), { color: 0xffd23f, size: 0.35, life: 0.9, gravity: 2, count: 8, spread: 4 });
      g.audio && g.audio.thud && g.audio.thud(20);
    } else if (Math.random() < 0.7) {
      g.fx.pop(OOF[Math.floor(Math.random() * OOF.length)], c.center.clone().addScaledVector(up, 2), { color: '#fff4e0', size: 36, life: 0.8 });
    }
    // reputation + settlement aggro (rep throttled so a rail beam's several samples count once)
    const fresh = g.time - c.repT > 0.4;
    if (fresh || killed) c.repT = g.time;
    this.witnessed(c.center, fresh ? (killed ? REP_KILL : REP_HIT) : killed ? REP_KILL - REP_HIT : 0, killed);
    this.panic(c.center, f);
  }

  // Everybody nearby who saw it puts their hands up and runs.
  panic(at, except) {
    const list = [];
    this.each(at, PANIC_R, (f, src, ref) => { if (f !== except) list.push([f, src, ref]); });
    for (const [f, src, ref] of list) {
      const c = this.grab(f, src, ref);
      if (c.state === 'flee' || c.state === 'calm') { c.state = 'flee'; c.flee = Math.max(c.flee, 8 + Math.random() * 4); c.t = 0; }
    }
  }

  // Settlements (and pirate dens) that can see `at` get alerted, and their faction remembers.
  witnessed(at, rep, killed) {
    const g = this.g;
    const P = g.planet;
    const seen = new Set();
    for (const loc of g.locations) {
      if (!loc.faction || loc.faction === 'none' || !loc.pos) continue;
      const range = loc.zoneR || (loc.defense ? loc.defense.ring + 40 : loc.r * 1.4);
      if (loc.pos.distanceTo(at) > range) continue;
      const base = g.enemies.bases.find((b) => b.loc === loc);
      // line of sight from the settlement centre (raised), or from any standing turret
      let sees = P.visible(_v.copy(loc.pos).addScaledVector(loc.dir, 20), at, 16);
      if (!sees && base) for (const t of base.turrets) if (!t.dead && P.visible(t.center, at, 16)) { sees = true; break; }
      if (!sees) continue;
      if (rep && !seen.has(loc.faction)) {
        seen.add(loc.faction);
        g.rep.add(loc.faction, rep, killed ? 'Knocked out a civilian' : 'Attacked a civilian');
      }
      if (base) this.alertBase(base);
      else if (loc.type === 'pirate') this.alertDen(loc);
    }
  }

  alertBase(base) {
    const g = this.g;
    const loc = base.loc;
    const fresh = !base.hostile && base.aggro <= 0;
    base.aggro = Math.max(base.aggro, ALERT);
    if (base.restricted) { base.hostile = true; base.time = Math.max(base.time, 6); base.outside = 0; }
    if (fresh) {
      g.hud.alert(`${(loc.short || FACTIONS[base.faction].name).toUpperCase()} SECURITY ALERTED!`, '#ff2a4a', 3);
      g.audio && g.audio.alarm && g.audio.alarm();
    }
  }

  alertDen(l) {
    const g = this.g;
    const E = g.enemies;
    const fresh = !(l.civAlert > g.time);
    l.civAlert = g.time + ALERT;
    for (const e of E.list) if (e.home === l && !e.dead) e.aggro = true;
    if (!fresh) return;
    g.hud.alert('RUSTMOON PIRATES ALERTED!', '#7dff3a', 3);
    if (g.tutorial && g.tutorial.quiet()) return;
    if (!E.lairActive(l) || E.pirateCount() >= 8) return;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = E.spawnPirate(Math.random() < 0.5 ? 'skater' : 'rover', g.world.toWorld(l, Math.cos(a) * 50, 0, Math.sin(a) * 50), l);
      e.aggro = true;
    }
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.g;
    if (!g || !g.player) return;
    if (this.gone.length) this.respawns();
    if (!this.list.length || dt <= 0) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (this.step(c, dt) === false) this.list.splice(i, 1);
    }
  }

  // false = this controller is finished (handed back or cleared)
  step(c, dt) {
    const g = this.g;
    const f = c.f;
    // scooped up while running, or the wanderer list let go of it
    if (f.captured || (c.src === 'wand' && !f.root.parent)) { this.finish(c, false); return false; }
    const far = c.src === 'wand' ? c.center.distanceTo(g.camera.position) > 500 : (!c.ref.loc || !c.ref.loc.active || c.ref.loc.camDist > 450);
    if (far) { this.finish(c, c.dead); return false; }
    c.t += dt;
    const up = _n.copy(c.center).normalize();
    if (c.state === 'air') this.air(c, dt, up);
    else if (c.state === 'down') {
      const k = Math.min(1, c.t / 0.25);
      c.quat.slerpQuaternions(c.q0, c.q1, k);
      this.pose(c, LIE);
      if (c.dead) {
        if (c.t > KO_LINGER) { this.finish(c, true); return false; }
        if (Math.random() < dt * 1.5 && c.t < 8) g.fx.spawn(_v.copy(c.center).addScaledVector(up, 0.6), up.clone().multiplyScalar(1.2), { color: 0xffd23f, size: 0.2, life: 0.7, count: 1, spread: 0.6 });
      } else if (c.t > 1.4) {
        c.state = 'getup'; c.t = 0; c.q0 = c.quat.clone();
        this.fleeDir(c, up);
        c.q1 = frameQuat(up, c.dir, new THREE.Quaternion());
      }
    } else if (c.state === 'getup') {
      const k = Math.min(1, c.t / 0.6);
      c.quat.slerpQuaternions(c.q0, c.q1, k * k * (3 - 2 * k));
      this.pose(c, LIE + (STAND - LIE) * k);
      this.limbs(c, 'up', dt);
      if (k >= 1) { c.state = 'flee'; c.t = 0; c.flee = 10 + Math.random() * 5; }
    } else {
      if (!c.dir.lengthSq()) this.fleeDir(c, up);
      if (c.state === 'flee') {
        c.flee -= dt;
        if (c.flee <= 0) c.state = 'calm';
      }
      if (c.state === 'calm') {
        // residents and wanderers go back to their routine; passengers head off indoors
        if (c.src !== 'pax') { this.finish(c, false); return false; }
        c.flee -= dt;
        if (c.center.distanceTo(g.camera.position) > 45 || c.flee < -20) { this.finish(c, false); return false; }
      }
      this.run(c, dt, up);
    }
    return true;
  }

  // ragdoll: point mass + tumble, bounces off the ground and buildings, settles flat
  air(c, dt, up) {
    const g = this.g;
    const G = PHYS.gravity || 6;
    c.vel.addScaledVector(up, -G * dt);
    c.center.addScaledVector(c.vel, dt);
    c.quat.premultiply(_q.setFromAxisAngle(c.axis, c.spin * dt));
    // buildings
    for (const col of g.colliders.query(c.center, 1.5, _near)) {
      if (col.platform) continue;
      const pen = g.colliders.contact(col, c.center, 0.45, _w);
      if (pen > 0) {
        c.center.addScaledVector(_w, pen);
        const vn = c.vel.dot(_w);
        if (vn < 0) c.vel.addScaledVector(_w, -vn * 1.4);
        c.spin *= 0.7;
      }
    }
    // ground
    const sr = g.planet.surface(c.center, _w);
    const len = c.center.length();
    const floor = sr + LIE * c.s;
    if (len <= floor) {
      c.center.multiplyScalar(floor / len);
      const vn = c.vel.dot(_w);
      if (vn < 0) {
        c.vel.addScaledVector(_w, -vn * 1.35); // restitution ~0.35
        c.vel.multiplyScalar(0.6);
        c.spin *= 0.55;
        if (-vn > 3 && c.t > 0.1) g.fx.dust(c.center, c.vel, 3, up);
      }
      if (c.vel.length() < 1.6 || c.t > 6) {
        c.state = 'down'; c.t = 0;
        c.q0 = c.quat.clone();
        c.q1 = this.lying(c, up);
        c.vel.set(0, 0, 0);
      }
    }
    this.pose(c, null);
    this.limbs(c, 'flail', dt);
  }

  // flat on the back (or front), head pointing wherever it was tumbling to
  lying(c, up) {
    const head = _v.set(0, 1, 0).applyQuaternion(c.quat);
    head.addScaledVector(up, -head.dot(up));
    if (head.lengthSq() < 1e-4) head.set(1, 0, 0).addScaledVector(up, -up.x);
    head.normalize();
    const face = _u.copy(up).multiplyScalar(Math.random() < 0.7 ? 1 : -1);
    _x.crossVectors(head, face);
    _m.makeBasis(_x, head, face);
    this.limbs(c, 'sprawl', 0);
    return new THREE.Quaternion().setFromRotationMatrix(_m);
  }

  // place the root so the body centre sits at c.center (h: snap centre to h*scale above ground)
  pose(c, h) {
    const g = this.g;
    if (h !== null) {
      const sr = g.planet.surface(c.center);
      c.center.setLength(sr + h * c.s);
    }
    const r = c.f.root;
    r.quaternion.copy(c.quat);
    r.position.set(0, -STAND * c.s, 0).applyQuaternion(c.quat).add(c.center);
  }

  fleeDir(c, up) {
    const P = this.g.player;
    const d = c.dir.copy(c.center).sub(P.pos);
    d.addScaledVector(up, -d.dot(up));
    if (d.lengthSq() < 0.01) d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    d.applyAxisAngle(up, (Math.random() - 0.5) * 0.8);
    d.addScaledVector(up, -d.dot(up)).normalize();
    // residents stay in town: near the edge they veer back around
    const loc = c.ref && c.ref.loc;
    if (loc && c.center.distanceTo(loc.pos) > loc.r * 0.85) {
      const home = _v.copy(loc.pos).sub(c.center);
      home.addScaledVector(up, -home.dot(up)).normalize();
      d.addScaledVector(home, 1.2).addScaledVector(up, -d.dot(up)).normalize();
    }
  }

  // running on foot (hands up while panicking), sliding around buildings
  run(c, dt, up) {
    const g = this.g;
    const panicked = c.state === 'flee';
    c.dirT -= dt;
    if (c.dirT <= 0) {
      const old = _x.copy(c.dir);
      this.fleeDir(c, up);
      c.dir.lerp(old, 0.4).addScaledVector(up, -c.dir.dot(up)).normalize();
      c.dirT = 0.6 + Math.random() * 0.6;
    }
    const sp = panicked ? (c.f.kind === 'kid' ? 5.5 : 4.8) : 1.6;
    const foot = _w.copy(c.center).addScaledVector(up, -STAND * c.s).addScaledVector(c.dir, sp * dt);
    g.planet.ground(foot, foot);
    const body = _v.copy(foot).addScaledVector(up, STAND * c.s);
    for (const col of g.colliders.query(body, 1.4, _near)) {
      if (col.platform) continue;
      const pen = g.colliders.contact(col, body, 0.4, _u);
      if (pen > 0) {
        _u.addScaledVector(up, -_u.dot(up));
        body.addScaledVector(_u, pen);
        // slide along the wall instead of into it
        c.dir.addScaledVector(_u, Math.max(0, -c.dir.dot(_u)) * 1.1).normalize();
      }
    }
    c.center.copy(body);
    g.planet.ground(c.center, foot);
    const upN = _u.copy(foot).normalize();
    c.center.copy(foot).addScaledVector(upN, STAND * c.s);
    frameQuat(upN, c.dir, c.quat);
    c.f.phase = (c.f.phase || 0) + dt * (panicked ? 14 : 6);
    const bob = Math.abs(Math.sin(c.f.phase)) * (panicked ? 0.22 : 0.1);
    const r = c.f.root;
    r.quaternion.copy(c.quat);
    r.position.copy(foot).addScaledVector(upN, bob);
    this.limbs(c, panicked ? 'up' : 'walk', dt);
  }

  limbs(c, mode, dt) {
    const f = c.f;
    const t = (c.lt = (c.lt || Math.random() * 10) + dt);
    if (mode === 'flail') {
      f.legL.rotation.set(Math.sin(t * 13) * 1.1, 0, -0.3 + Math.sin(t * 7) * 0.3);
      f.legR.rotation.set(Math.cos(t * 11) * 1.1, 0, 0.3 + Math.cos(t * 9) * 0.3);
      if (f.armL) {
        f.armL.rotation.set(-1.5 + Math.sin(t * 15) * 1.4, 0, -1.2 + Math.sin(t * 10) * 0.6);
        f.armR.rotation.set(-1.5 + Math.cos(t * 14) * 1.4, 0, 1.2 + Math.cos(t * 12) * 0.6);
      }
    } else if (mode === 'sprawl') {
      f.legL.rotation.set(0.15, 0, -0.35);
      f.legR.rotation.set(-0.1, 0, 0.3);
      if (f.armL) { f.armL.rotation.set(-0.3, 0, -1.4); f.armR.rotation.set(0.2, 0, 1.3); }
    } else if (mode === 'up') {
      const ph = f.phase || 0;
      const a = c.state === 'flee' ? 0.9 : 0;
      f.legL.rotation.set(Math.sin(ph) * a, 0, 0);
      f.legR.rotation.set(-Math.sin(ph) * a, 0, 0);
      if (f.armL) {
        const k = Math.min(1, dt * 10);
        f.armL.rotation.x += (HANDS_UP + Math.sin(ph * 1.3) * 0.15 - f.armL.rotation.x) * k;
        f.armR.rotation.x += (HANDS_UP + Math.cos(ph * 1.3) * 0.15 - f.armR.rotation.x) * k;
        f.armL.rotation.z += (-0.3 - f.armL.rotation.z) * k;
        f.armR.rotation.z += (0.3 - f.armR.rotation.z) * k;
      }
    } else {
      const ph = f.phase || 0;
      f.legL.rotation.set(Math.sin(ph) * 0.6, 0, 0);
      f.legR.rotation.set(-Math.sin(ph) * 0.6, 0, 0);
      if (f.armL) {
        const k = Math.min(1, dt * 5);
        f.armL.rotation.x += (-Math.sin(ph) * (f.swing || 0.3) - f.armL.rotation.x) * k;
        f.armR.rotation.x += (Math.sin(ph) * (f.swing || 0.3) - f.armR.rotation.x) * k;
        f.armL.rotation.z += (-0.07 - f.armL.rotation.z) * k;
        f.armR.rotation.z += (0.07 - f.armR.rotation.z) * k;
      }
    }
  }

  // hand the person back to whoever scripts them (or clear the body away)
  finish(c, clear) {
    const f = c.f;
    const W = this.world;
    delete f.civ;
    this.limbsReset(f);
    if (c.src === 'pax') {
      // free the traffic pool slot (the walker itself was retired when we took it over)
      f.busy = false;
      f.hp = undefined;
      f.root.removeFromParent();
      f.root.rotation.set(0, 0, 0);
      return;
    }
    if (c.src === 'wand') {
      if (clear || c.dead) {
        f.root.removeFromParent();
        const A = this.g.alchemy;
        if (A) A.wanderers = A.wanderers.filter((w) => w !== f);
        return;
      }
      // updateWanderers takes over again (it re-grounds and re-orients them every frame)
      f.root.quaternion.copy(frameQuat(_u.copy(f.root.position).normalize(), f.dir || c.dir, _q));
      return;
    }
    // settlement resident
    const loc = f.loc;
    if (clear || c.dead) {
      f.root.removeFromParent();
      f.root.visible = false;
      f.civ = { state: 'gone' };
      this.gone.push({ f, at: this.g.time + RESPAWN });
      return;
    }
    if (f.captured) { loc.group.add(f.root); f.root.visible = false; return; }
    loc.group.attach(f.root);
    const p = f.root.position;
    const fwd = _v.set(0, 0, 1).applyQuaternion(f.root.quaternion);
    f.root.rotation.set(0, Math.atan2(fwd.x, fwd.z), 0);
    p.y = 0;
    f.vy = 0;
    // amble back into town
    const a = Math.random() * Math.PI * 2, rr = (0.25 + Math.random() * 0.5) * loc.r;
    f.target.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    f.wait = 0.5 + Math.random() * 2;
    if (f.hp !== undefined && f.hp > 0) f.hp = Math.min(f.kind === 'soldier' ? HP_SOLDIER : HP, f.hp + 20); // patched up a bit
  }

  limbsReset(f) {
    f.legL.rotation.set(0, 0, 0);
    f.legR.rotation.set(0, 0, 0);
    if (f.armL) { f.armL.rotation.set(0, 0, -0.07); f.armR.rotation.set(0, 0, 0.07); }
  }

  // cleared residents come back as somebody new once nobody's watching
  respawns() {
    const g = this.g;
    for (let i = this.gone.length - 1; i >= 0; i--) {
      const r = this.gone[i];
      const loc = r.f.loc;
      if (g.time < r.at) continue;
      if (loc.active && loc.camDist < 450 && g.time < r.at + 300) continue;
      this.gone.splice(i, 1);
      this.world.respawnFigure(r.f);
    }
  }
}
