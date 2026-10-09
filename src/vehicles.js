import * as THREE from 'three';
import { makeRover, makeHoverCar, makeSkimmer } from './models.js';
import { makeBody } from './physics.js';
import { stepRover } from './enemies.js';
import { frameQuat, tangent } from './geo.js';
import { toon, glow, ink } from './toon.js';

// Faction vehicles unlocked through the story. V calls yours in (or hops out).
export const VEHICLES = {
  interceptor: { hp: 220, name: 'SPACECOM Lunar Interceptor', faction: 'spacecom', max: 88, engine: 38, turn: 2.6, grip: 12, armor: 0.75, color: 0xfff4e0, trim: 0xffd23f, desc: 'Fast, nimble, lightly armoured.' },
  apc: { hp: 480, name: 'Vostok BTR-M Moon APC', faction: 'vostok', max: 62, engine: 24, turn: 1.9, grip: 18, armor: 0.4, color: 0x6b6f78, trim: 0xff3b5c, scale: 1.35, desc: 'Slow tank of a thing. Shrugs off fire.' },
  skimmer: { hp: 180, name: 'Daedalus Phase Skimmer', faction: 'daedalus', max: 100, engine: 34, turn: 2.2, grip: 4, armor: 0.85, color: 0x1a1426, trim: 0xc77dff, hover: true, desc: 'Hovers. Drifts. Terrifyingly fast.' },
  mule: { hp: 300, name: 'Kepler Homestead Mule', faction: 'kepler', max: 58, engine: 26, turn: 2.2, grip: 16, armor: 0.6, color: 0x6a8f3a, trim: 0xff9f1c, scale: 1.2, cargoSafe: true, desc: 'Hauler. Cargo rides in a padded bed and takes no jostle damage.' },
  van: { hp: 200, name: 'Meridian Courier Hover-Van', faction: 'meridian', max: 82, engine: 30, turn: 2.3, grip: 6, armor: 0.8, color: 0x2ec4ff, trim: 0xffd23f, hover: true, van: true, desc: 'Smooth hover ride with a little boost of style.' },
  warrig: { hp: 340, name: 'Rustmoon Scrapjaw War-Rig', faction: 'rustmoon', max: 78, engine: 32, turn: 2.4, grip: 14, armor: 0.6, color: 0x7b2ff7, trim: 0x7dff3a, scale: 1.35, pirate: true, desc: 'Stolen, welded, painted green. Rams for damage.' },
};

const _v = new THREE.Vector3();
const REBUILD = 90; // seconds the orbital crane needs to replace a wrecked vehicle

export class Garage {
  constructor(game) {
    this.game = game;
    this.active = null; // { id, def, e, model }
    this.choice = null;
    this.hp = {}; // hull left on each vehicle (repairs slowly while you're not driving it)
    this.wreckedUntil = {}; // id -> game time it's rebuilt
    this.bar = document.createElement('div');
    this.bar.id = 'vehbar';
    this.bar.className = 'hidden';
    this.bar.innerHTML = '<span class="vb-name"></span><div class="vb-track"><div class="vb-fill"></div></div><span class="vb-num"></span>';
    document.getElementById('hud').appendChild(this.bar);
  }

  maxHp(id) { return Math.round(VEHICLES[id].hp * (1 + 0.15 * (this.game.upgrades.plating || 0))); }
  cooldown(id) { return Math.max(0, (this.wreckedUntil[id] || 0) - this.game.time); }

  // Damage to the vehicle you're driving. Returns how much spills through to you.
  hit(amount) {
    const g = this.game;
    const v = g.player.vehicle;
    if (!v) return amount;
    const max = this.maxHp(v.id);
    this.hp[v.id] = (this.hp[v.id] ?? max) - amount;
    v.flash = 0.15;
    if (this.hp[v.id] <= 0) { this.destroy(v); return 12; }
    return amount * v.def.armor * 0.25;
  }

  destroy(v) {
    const g = this.game;
    const P = g.player;
    const pos = v.e.body.pos.clone();
    const up = pos.clone().normalize();
    this.exit();
    P.body.vel.addScaledVector(up, 14);
    v.model.root.removeFromParent();
    if (this.active === v) this.active = null;
    this.hp[v.id] = this.maxHp(v.id);
    this.wreckedUntil[v.id] = g.time + REBUILD;
    g.fx.explosion(pos, 14, true);
    g.fx.pop('WRECKED!', pos.clone().addScaledVector(up, 6), { color: '#ff2a4a', size: 80, life: 1.6 });
    g.audio.boom(true);
    g.cam.shake = 1.2;
    g.hud.toast(`${v.def.name} destroyed. The crane can drop a replacement in ${REBUILD}s.`, 3.5);
  }

  owned() { return Object.keys(VEHICLES).filter((k) => this.game.story && this.game.story.vehicles.includes(k)); }

  build(id) {
    const def = VEHICLES[id];
    let m;
    if (id === 'skimmer') {
      // its own hover-racer model (it has a seat of its own, too)
      m = makeSkimmer({ color: def.color, trim: def.trim });
      return m;
    }
    if (def.van) {
      const c = makeHoverCar({ color: def.color, trim: def.trim });
      c.root.scale.setScalar(1.8);
      m = { root: c.root, chassis: c.root, wheels: [], gun: new THREE.Group() };
    } else {
      m = makeRover({ color: def.color, trim: def.trim, pirate: !!def.pirate, flag: def.trim, style: def.pirate ? 'pirate' : def.id === 'mule' || def.cargoSafe ? 'civil' : 'military' });
      if (def.hover) {
        for (const w of m.wheels) w.visible = false;
        for (const s of [-1, 1]) {
          const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12), glow(def.trim));
          pad.position.set(s * 1.7, 0.5, 0);
          m.root.add(pad);
        }
      }
      if (def.scale) m.root.scale.setScalar(def.scale);
    }
    // a seat-back so the runner looks like they're driving
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.3), toon(0x221d33));
    ink(seat, 0.04);
    seat.position.set(0, 2.4, -0.6);
    m.root.add(seat);
    return m;
  }

  // V: summon / board / leave
  toggle() {
    const g = this.game;
    const P = g.player;
    if (P.vehicle) { this.exit(); return; }
    const owned = this.owned();
    if (!owned.length) { g.hud.toast('No vehicles yet. Faction leaders hand them out as you rise in their story.', 3); return; }
    if (owned.length > 1 && !this.choice) { this.pick(); return; }
    let id = this.choice || owned[0];
    if (this.cooldown(id) > 0) {
      const alt = owned.find((k) => this.cooldown(k) <= 0);
      if (!alt) { g.hud.toast(`${VEHICLES[id].name} is being rebuilt: ready in ${Math.ceil(this.cooldown(id))}s.`, 2.5); return; }
      if (owned.length > 1) { this.pick(); return; }
      id = alt;
    }
    // already parked nearby? hop in; otherwise it gets dropped in next to you
    if (this.active && this.active.id === id && this.active.e.body.pos.distanceTo(P.pos) < 12) { this.enter(); return; }
    this.summon(id);
    this.enter();
  }

  pick() {
    const g = this.game;
    const owned = this.owned();
    g.dialog('YOUR VEHICLES', 'Which one should the orbital crane drop?', owned.map((k, i) => ({
      label: `${i + 1} · ${VEHICLES[k].name}${this.cooldown(k) > 0 ? ` (REBUILDING ${Math.ceil(this.cooldown(k))}s)` : ` (${Math.ceil(this.hp[k] ?? this.maxHp(k))}/${this.maxHp(k)} HULL)`}`,
      fn: () => {
        if (this.cooldown(k) > 0) { g.hud.toast(`Still being rebuilt: ready in ${Math.ceil(this.cooldown(k))}s.`, 2.5); return; }
        this.choice = k; this.summon(k); this.enter();
      },
    })).concat([{ label: `${owned.length + 1} · CANCEL` }]));
  }

  summon(id) {
    const g = this.game;
    const P = g.player;
    if (this.active) this.active.model.root.removeFromParent();
    const def = VEHICLES[id];
    const model = this.build(id);
    const pos = g.planet.ground(P.pos.clone().addScaledVector(g.cam.right, 5), new THREE.Vector3(), 0.5);
    const e = { body: makeBody(pos), heading: tangent(g.cam.fwd.clone(), pos.clone().normalize()).normalize() };
    model.root.position.copy(pos);
    g.scene.add(model.root);
    this.active = { id, def, e, model };
    g.fx.explosion(pos, 5, false);
    g.fx.pop('VEHICLE DROP!', null, { color: '#2ee6ff', size: 52 });
    g.audio.thud(30);
  }

  enter() {
    const g = this.game;
    const P = g.player;
    if (!this.active) return;
    P.vehicle = this.active;
    P.resetTrick();
    g.hud.toast(`${this.active.def.name}: W/S drive · A/D steer · SHIFT hop · V to get out`, 3.5);
  }

  exit() {
    const g = this.game;
    const P = g.player;
    const v = P.vehicle;
    P.vehicle = null;
    if (!v) return;
    const up = v.e.body.pos.clone().normalize();
    const side = new THREE.Vector3().crossVectors(v.e.heading, up).normalize();
    P.body.pos.copy(v.e.body.pos).addScaledVector(side, 4).addScaledVector(up, 1.5);
    P.body.vel.copy(v.e.body.vel);
    P.body.grounded = false;
    P.model.root.visible = true;
  }

  // Called from Player.update instead of skater physics while driving.
  drive(dt, input, cam) {
    const g = this.game;
    const P = g.player;
    const v = P.vehicle;
    const { e, def, model } = v;
    const b = e.body;
    const up = _v.copy(b.pos).normalize();
    const fwdIn = input.down('KeyW') ? 1 : 0, back = input.down('KeyS') ? 1 : 0;
    const steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    const along = b.vel.dot(e.heading);
    const reversing = back && along < 4;
    const target = e.heading.clone().applyAxisAngle(up, steer * (reversing ? -0.9 : 0.9));
    let max = fwdIn ? def.max : reversing ? -18 : 0;
    if (back && along > 4) max = -20; // brake
    if (!fwdIn && !back) b.vel.addScaledVector(e.heading, -Math.sign(along) * Math.min(Math.abs(along), 6 * dt));
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) stepRover(e, dt / steps, g.planet, g.colliders, target, max, { engine: fwdIn || back ? def.engine : 0, grip: def.grip, turn: def.turn, radius: 3.2 * (def.scale || 1) });
    if (def.hover) b.vel.multiplyScalar(1 - 0.15 * dt);
    if (b.grounded && (input.pressed('ShiftLeft') || input.pressed('ShiftRight'))) { b.vel.addScaledVector(up, 9); b.grounded = false; g.audio.jump(); }
    // pose
    model.root.position.copy(b.pos).addScaledVector(up, def.hover ? 0.8 + Math.sin(g.time * 3) * 0.15 : 0);
    const q = frameQuat(b.groundN, e.heading, new THREE.Quaternion());
    model.root.quaternion.slerp(q, Math.min(1, dt * 8));
    const sp = b.vel.length();
    for (const w of model.wheels) w.rotation.x += (along >= 0 ? 1 : -1) * sp * dt / 0.85;
    if (model.anim) model.anim(g.time, sp);
    // the runner sits in the seat
    P.body.pos.copy(b.pos).addScaledVector(up, 1.6 * (def.scale || 1));
    P.body.vel.copy(b.vel);
    P.body.up.copy(up);
    P.body.groundN.copy(b.groundN);
    P.body.grounded = true;
    P.body.skating = false;
    P.body.thrusting = false; // (the jet hiss would otherwise stay on from before you got in)
    P.heading.copy(e.heading);
    model.root.updateMatrixWorld();
    // ramming pirates
    if (sp > 20) {
      for (const en of g.enemies.list) {
        if (en.dead || en.faction !== 'pirate' || !en.center || g.enemies.friendly(en)) continue;
        if (en.center.distanceTo(b.pos) < (en.radius || 1.5) + 3.5 * (def.scale || 1)) {
          g.enemies.damage(en, sp * (def.pirate ? 3 : 2));
          g.fx.pop('ROADKILL!', en.center.clone(), { color: '#ffd23f', size: 60 });
          b.vel.multiplyScalar(0.8);
          if (en.kind === 'rover') { this.hit(sp * 0.25); if (!P.vehicle) return; }
        }
      }
    }
  }

  // leave a parked vehicle where it is; keep it posed
  update(dt) {
    const g = this.game;
    // field repairs: hull creeps back while you're not behind the wheel
    for (const id of Object.keys(this.hp)) if (!(g.player.vehicle && g.player.vehicle.id === id)) this.hp[id] = Math.min(this.maxHp(id), this.hp[id] + dt * 2);
    const pv = g.player.vehicle;
    this.bar.classList.toggle('hidden', !pv || g.state !== 'play');
    if (pv) {
      const max = this.maxHp(pv.id), hp = Math.max(0, this.hp[pv.id] ?? max);
      const k = hp / max;
      this.bar.querySelector('.vb-name').textContent = pv.def.name.toUpperCase();
      const fill = this.bar.querySelector('.vb-fill');
      fill.style.width = `${k * 100}%`;
      fill.style.background = k > 0.5 ? '#2ee6ff' : k > 0.25 ? '#ffd23f' : '#ff2a4a';
      this.bar.querySelector('.vb-num').textContent = `${Math.ceil(hp)}/${max}`;
      // smoke when it's hurting
      if (k < 0.35 && Math.random() < dt * 20) g.fx.spawn(pv.model.root.position.clone().addScaledVector(pv.e.body.pos.clone().normalize(), 3), pv.e.body.pos.clone().normalize().multiplyScalar(4), { color: k < 0.15 ? 0xff6a2a : 0x3a3550, size: 0.9, life: 0.9, count: 1, spread: 1 });
    }
    const v = this.active;
    if (!v || this.game.player.vehicle) return;
    if (v.model.anim) v.model.anim(g.time, 0);
    const b = v.e.body;
    if (b.vel.lengthSq() > 0.01) {
      stepRover(v.e, dt, this.game.planet, this.game.colliders, v.e.heading, 0, { engine: 10, grip: v.def.grip, turn: 0, radius: 3 });
      v.model.root.position.copy(b.pos);
    }
  }
}
