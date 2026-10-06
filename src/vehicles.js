import * as THREE from 'three';
import { makeRover, makeHoverCar } from './models.js';
import { makeBody } from './physics.js';
import { stepRover } from './enemies.js';
import { frameQuat, tangent } from './geo.js';
import { toon, glow, ink } from './toon.js';

// Faction vehicles unlocked through the story. V calls yours in (or hops out).
export const VEHICLES = {
  interceptor: { name: 'SPACECOM Lunar Interceptor', faction: 'spacecom', max: 88, engine: 38, turn: 2.6, grip: 12, armor: 0.75, color: 0xfff4e0, trim: 0xffd23f, desc: 'Fast, nimble, lightly armoured.' },
  apc: { name: 'Vostok BTR-M Moon APC', faction: 'vostok', max: 62, engine: 24, turn: 1.9, grip: 18, armor: 0.4, color: 0x6b6f78, trim: 0xff3b5c, scale: 1.35, desc: 'Slow tank of a thing. Shrugs off fire.' },
  skimmer: { name: 'Daedalus Phase Skimmer', faction: 'daedalus', max: 100, engine: 34, turn: 2.2, grip: 4, armor: 0.85, color: 0x1a1426, trim: 0xc77dff, hover: true, desc: 'Hovers. Drifts. Terrifyingly fast.' },
  mule: { name: 'Kepler Homestead Mule', faction: 'kepler', max: 58, engine: 26, turn: 2.2, grip: 16, armor: 0.6, color: 0x6a8f3a, trim: 0xff9f1c, scale: 1.2, cargoSafe: true, desc: 'Hauler. Cargo rides in a padded bed and takes no jostle damage.' },
  van: { name: 'Meridian Courier Hover-Van', faction: 'meridian', max: 82, engine: 30, turn: 2.3, grip: 6, armor: 0.8, color: 0x2ec4ff, trim: 0xffd23f, hover: true, van: true, desc: 'Smooth hover ride with a little boost of style.' },
  warrig: { name: 'Rustmoon Scrapjaw War-Rig', faction: 'rustmoon', max: 78, engine: 32, turn: 2.4, grip: 14, armor: 0.6, color: 0x7b2ff7, trim: 0x7dff3a, scale: 1.4, pirate: true, desc: 'Stolen, welded, painted green. Rams for damage.' },
};

const _v = new THREE.Vector3();

export class Garage {
  constructor(game) {
    this.game = game;
    this.active = null; // { id, def, e, model }
    this.choice = null;
  }

  owned() { return Object.keys(VEHICLES).filter((k) => this.game.story && this.game.story.vehicles.includes(k)); }

  build(id) {
    const def = VEHICLES[id];
    let m;
    if (def.van) {
      const c = makeHoverCar({ color: def.color, trim: def.trim });
      c.root.scale.setScalar(1.8);
      m = { root: c.root, chassis: c.root, wheels: [], gun: new THREE.Group() };
    } else {
      m = makeRover({ color: def.color, trim: def.trim, pirate: !!def.pirate, flag: def.trim });
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
    const id = this.choice || owned[0];
    // already parked nearby? hop in; otherwise it gets dropped in next to you
    if (this.active && this.active.id === id && this.active.e.body.pos.distanceTo(P.pos) < 12) { this.enter(); return; }
    this.summon(id);
    this.enter();
  }

  pick() {
    const g = this.game;
    const owned = this.owned();
    g.dialog('YOUR VEHICLES', 'Which one should the orbital crane drop?', owned.map((k, i) => ({
      label: `${i + 1} · ${VEHICLES[k].name}`,
      fn: () => { this.choice = k; this.summon(k); this.enter(); },
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
    // the runner sits in the seat
    P.body.pos.copy(b.pos).addScaledVector(up, 1.6 * (def.scale || 1));
    P.body.vel.copy(b.vel);
    P.body.up.copy(up);
    P.body.groundN.copy(b.groundN);
    P.body.grounded = true;
    P.body.skating = false;
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
        }
      }
    }
  }

  // leave a parked vehicle where it is; keep it posed
  update(dt) {
    const v = this.active;
    if (!v || this.game.player.vehicle) return;
    const b = v.e.body;
    if (b.vel.lengthSq() > 0.01) {
      stepRover(v.e, dt, this.game.planet, this.game.colliders, v.e.heading, 0, { engine: 10, grip: v.def.grip, turn: 0, radius: 3 });
      v.model.root.position.copy(b.pos);
    }
  }
}
