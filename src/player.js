import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeBody, stepSkater } from './physics.js';
import { makeRunner, makeCrate } from './models.js';
import { frameQuat } from './geo.js';
import { WEAPONS, weaponUnlocked, fireWeapon } from './weapons.js';

const SPEED_MARKS = [
  { kmh: 150, text: 'WHOOSH!' },
  { kmh: 250, text: 'ZOOOM!' },
  { kmh: 350, text: 'KA-ZOOM!!' },
  { kmh: 450, text: 'LUDICROUS!!!' },
];
const TAU = Math.PI * 2;
const FLIP_RATE = 11; // rad/s ≈ 1.75 rotations per second
const SPIN_RATE = 12;
const NUMS = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD ', 'QUINT '];

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class Player {
  constructor(game, spawn) {
    this.game = game;
    this.model = makeRunner({ suit: 0xff4f2e, accent: 0x2ee6ff, scarf: 0xffd23f, own: true });
    game.scene.add(this.model.root);
    this.body = makeBody(spawn);
    this.maxHealth = 100;
    this.health = 100;
    this.dead = false;
    this.center = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, 1);
    this.roll = 0;
    this.fireCd = 0;
    this.cargoMesh = null;
    this.speedMarks = SPEED_MARKS.map(() => false);
    this.launchCheck = -1;
    this.anim = 0;
    this.upSmooth = spawn.clone().normalize();
    this.impacts = [];
    this.params = { ...PHYS };
    this.trick = { flip: 0, spin: 0, active: false };

    // helmet lamp + a faint suit glow; intensities are driven by how dark it is
    this.lamp = new THREE.SpotLight(0xfff2c8, 0, 170, 0.5, 0.55, 1.2);
    this.lamp.castShadow = false;
    game.scene.add(this.lamp, this.lamp.target);
    this.glowLight = new THREE.PointLight(0x9be7ff, 0, 26, 1.5);
    game.scene.add(this.glowLight);
  }

  get pos() { return this.body.pos; }
  get vel() { return this.body.vel; }
  get speed() { return this.body.vel.length(); }
  get up() { return this.body.up; }

  applyUpgrades(up) {
    this.params.skateSafeImpact = PHYS.skateSafeImpact + up.dampers * 8;
    this.params.handling = PHYS.handling + (up.gyro || 0) * 0.55;
    this.body.maxEnergy = PHYS.maxEnergy + up.capacitor * 25;
    this.maxHealth = 100 + up.armor * 25 + (up.flak || 0) * 20 + (this.mutHealth || 0);
    this.damageMult = 1 + up.spinner * 0.3;
    this.fireDelay = 0.55 * (1 - 0.15 * (up.overcharge || 0)) * (this.mutFire || 1);
    this.homing = 0.9 + (up.seeker || 0) * 1.3; // rad/s the disc can turn toward a target
    this.knockResist = 1 - (up.flak || 0) * 0.15;
    // legendary Xenoglide skates: unrivalled handling and an antimatter-burning jet tank
    const alien = (up.alien || 0) > 0;
    if (alien) this.params.handling += 4;
    this.params.thrustAccel = alien ? PHYS.thrustAccel * 2.2 : PHYS.thrustAccel;
    this.params.energyRegen = alien ? PHYS.energyRegen * 2 : PHYS.energyRegen;
    if (alien) this.body.maxEnergy += 50;
  }

  respawn(pos, facing) {
    this.body.pos.copy(pos);
    this.body.vel.set(0, 0, 0);
    this.body.platform = null; // never keep riding a deck (or satellite) you've been teleported off
    this.body.up.copy(pos).normalize();
    this.body.groundN.copy(this.body.up);
    this.body.energy = this.body.maxEnergy;
    this.health = this.maxHealth;
    this.dead = false;
    this.model.root.visible = true;
    this.upSmooth.copy(this.body.up);
    if (facing) this.heading.copy(facing);
    this.resetTrick();
  }

  setCargo(color) {
    if (this.cargoMesh) { this.model.cargoSlot.remove(this.cargoMesh); this.cargoMesh = null; }
    if (color != null) {
      this.cargoMesh = makeCrate(color, 0.7);
      this.model.cargoSlot.add(this.cargoMesh);
    }
  }

  resetTrick() {
    const t = this.trick;
    t.flip = t.spin = 0;
    t.active = false;
    this.model.trick.rotation.set(0, 0, 0);
  }

  update(dt, input, cam) {
    const g = this.game;
    const b = this.body;
    if (this.dead) return;
    const up = b.up;

    const wish = new THREE.Vector3();
    const trickHeld = input.down('KeyQ') && !b.grounded && b.airTime > 0.12;
    if (!trickHeld) {
      if (input.down('KeyW')) wish.add(cam.fwd);
      if (input.down('KeyS')) wish.sub(cam.fwd);
      if (input.down('KeyD')) wish.add(cam.right);
      if (input.down('KeyA')) wish.sub(cam.right);
      if (wish.lengthSq() > 0) wish.normalize();
    }

    // Thrusters push mostly forward (where you aim / steer); only a little lift or dive.
    const thrustDir = (wish.lengthSq() > 0 ? wish.clone() : cam.fwd.clone());
    const tv = this.params.thrustVertical;
    thrustDir.addScaledVector(up, THREE.MathUtils.clamp(Math.sin(cam.pitch) * 0.6 + 0.06, -tv, tv)).normalize();

    const ctrl = {
      wish,
      skates: input.down('Space'),
      thrust: input.down('KeyE') || input.mouse[2],
      jump: b.grounded && (input.pressed('ShiftLeft') || input.pressed('ShiftRight')),
      thrustDir,
    };

    // driving a faction vehicle: the garage does the physics, you can still shoot
    if (this.vehicle) {
      g.garage.drive(dt, input, cam);
      this.center.copy(b.pos).addScaledVector(b.up, 1.3);
      this.updateWeapons(dt, input, cam);
      const m = this.model;
      m.root.position.copy(b.pos);
      frameQuat(b.up, this.heading, m.root.quaternion);
      m.legL.rotation.x = m.legR.rotation.x = -1.3;
      m.body.position.y = m.bodyBase - 0.5;
      this.upSmooth.copy(b.up);
      return;
    }

    const wasGrounded = b.grounded;
    const airBefore = b.airTime;
    b.jumped = false;
    // ride moving vehicles: carry along with the deck you're standing on
    const plat = b.platform;
    if (plat) b.pos.add(_v.subVectors(plat.pos, plat.prevPos));
    this.prevVel = (this.prevVel || new THREE.Vector3()).copy(b.vel);
    if (plat) this.prevVel.add(plat.vel);
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    let landed = false;
    for (let i = 0; i < steps; i++) {
      const before = b.grounded;
      const imp = stepSkater(b, ctrl, h, g.planet, g.colliders, this.params, this.impacts);
      if (!before && b.grounded) landed = true;
      for (const it of imp) this.onImpact(it, ctrl.skates);
      ctrl.jump = false;
    }
    if (b.jumped) { g.audio.jump(); g.fx.dust(b.pos, b.vel, 6, up); }
    if (b.bounced > 6) {
      g.fx.pop(b.bounced > 25 ? 'BOOOING!' : 'BOING!', null, { color: '#ff7ad9', size: 40 + Math.min(40, b.bounced) });
      g.audio.tone(220 + b.bounced * 8, 0.3, 'sine', 0.2, 2);
      if (b.bounced > 20) g.style(Math.round(b.bounced / 2), null);
    }
    b.bounced = 0;
    // velocities on a deck are relative to it; convert when stepping on or off
    if (!plat && b.platform) { b.vel.sub(b.platform.vel); g.fx.pop('ALL ABOARD!', null, { color: '#2ee6ff', size: 44, life: 1 }); }
    else if (plat && b.platform !== plat) { b.vel.add(plat.vel); if (b.platform) b.vel.sub(b.platform.vel); }
    // world-space acceleration (for sloshing fluids)
    const worldVel = _v.copy(b.vel);
    if (b.platform) worldVel.add(b.platform.vel);
    this.accel = (this.accel || new THREE.Vector3()).subVectors(worldVel, this.prevVel).divideScalar(Math.max(dt, 1e-3));

    this.updateTricks(dt, input, trickHeld, landed && !wasGrounded ? airBefore : -1);

    if (!wasGrounded && b.grounded && airBefore > 2.2 && !this.trickLanding) {
      g.style(Math.round(airBefore * 15), `BIG AIR ${airBefore.toFixed(1)}s`);
    }
    this.trickLanding = false;
    if (wasGrounded && !b.grounded && this.speed > 40 && b.vel.dot(up) > 6) this.launchCheck = 0.6;
    if (this.launchCheck > 0) {
      this.launchCheck -= dt;
      if (this.launchCheck <= 0 && !b.grounded && b.vel.dot(up) > 0) {
        g.fx.pop(this.speed > 70 ? 'SKY-HIGH!' : 'LAUNCH!', null, { color: '#2ee6ff', size: 72 });
        g.actionPanel('launch');
      }
    }

    const kmh = this.speed * 3.6;
    SPEED_MARKS.forEach((m, i) => {
      if (!this.speedMarks[i] && kmh > m.kmh) {
        this.speedMarks[i] = true;
        g.fx.pop(m.text, null, { color: i > 1 ? '#ff2e88' : '#ffd23f', size: 60 + i * 12 });
        g.style(10 + i * 10, null);
      } else if (this.speedMarks[i] && kmh < m.kmh - 60) this.speedMarks[i] = false;
    });

    this.updateWeapons(dt, input, cam);

    if (b.onLake && b.grounded && !b.skating) b.vel.multiplyScalar(1 - Math.min(1, 2.5 * dt)); // wading
    if (b.onLake && b.grounded && this.speed > 8 && Math.random() < dt * 20) g.fx.spawn(b.pos, up.clone().multiplyScalar(3), { color: 0x2a1f4f, size: 0.4, life: 0.6, gravity: 2, count: 2, spread: 3 });
    if (b.grounded && b.skating && this.speed > 25 && Math.random() < dt * 30) {
      g.fx.dust(b.pos, b.vel.clone().multiplyScalar(-0.2), 1, up, 0xe8e2d8);
    }
    if (b.thrusting && Math.random() < dt * 40) {
      const back = this.model.cargoSlot.getWorldPosition(new THREE.Vector3());
      g.fx.spawn(back, thrustDir.clone().multiplyScalar(-12).add(b.vel), { color: (g.upgrades.alien ? [0x7dffd4, 0xc77dff] : [0x2ee6ff, 0xffffff])[Math.random() < 0.5 ? 0 : 1], size: g.upgrades.alien ? 0.5 : 0.35, life: 0.35, spread: 2 });
    }

    this.center.copy(b.pos).addScaledVector(up, 1.3);
    this.animate(dt, cam, ctrl);

    // helmet lamp follows your gaze
    const head = this.model.head.getWorldPosition(_v);
    this.lamp.position.copy(head).addScaledVector(up, 0.3);
    this.lamp.target.position.copy(head).addScaledVector(cam.look, 30).addScaledVector(up, -4);
    this.glowLight.position.copy(head).addScaledVector(up, 1.5);
  }

  // weapons: 1-4 to switch, left mouse to fire
  updateWeapons(dt, input, cam) {
    const g = this.game;
    const b = this.body;
    const up = b.up;
    for (let i = 0; i < WEAPONS.length; i++) {
      if (!input.pressed('Digit' + (i + 1))) continue;
      if (weaponUnlocked(WEAPONS[i], g.upgrades)) { this.weapon = i; g.hud.toast(WEAPONS[i].name.toUpperCase(), 1.2); }
      else g.hud.toast(`${WEAPONS[i].name} — not unlocked yet`, 1.5);
    }
    const w = WEAPONS[this.weapon || 0];
    this.fireCd -= dt;
    if (input.mouse[0] && this.fireCd <= 0 && input.locked) {
      this.fireCd = w.delay * (1 - 0.15 * (g.upgrades.overcharge || 0)) * (this.mutFire || 1);
      const muzzle = this.center.clone().addScaledVector(cam.right, 0.5).addScaledVector(up, 0.3);
      const aim = cam.position.clone().addScaledVector(cam.look, 350);
      const dir = aim.sub(muzzle).normalize();
      fireWeapon(g, w, muzzle, dir, b.vel, this.damageMult || 1, this.homing || 0.9);
    }

  }

  // --- mid-air tricks: hold Q + W/S to flip, A/D to spin ---
  updateTricks(dt, input, held, landedAfter) {
    const t = this.trick;
    const b = this.body;
    const g = this.game;
    if (!b.grounded) {
      if (held) {
        if (input.down('KeyW')) { t.flip += FLIP_RATE * dt; t.active = true; }
        if (input.down('KeyS')) { t.flip -= FLIP_RATE * dt; t.active = true; }
        if (input.down('KeyD')) { t.spin -= SPIN_RATE * dt; t.active = true; }
        if (input.down('KeyA')) { t.spin += SPIN_RATE * dt; t.active = true; }
      } else {
        // auto-level toward the nearest full rotation when you let go
        const tf = Math.round(t.flip / TAU) * TAU, ts = Math.round(t.spin / TAU) * TAU;
        t.flip += (tf - t.flip) * Math.min(1, dt * 5);
        t.spin += (ts - t.spin) * Math.min(1, dt * 5);
      }
      this.model.trick.rotation.set(t.flip, t.spin, 0, 'YXZ');
    }
    if (landedAfter >= 0 && t.active) {
      const flips = Math.round(Math.abs(t.flip) / TAU);
      const spins = Math.round(Math.abs(t.spin) / TAU);
      const rf = Math.abs(t.flip - Math.round(t.flip / TAU) * TAU);
      const rs = Math.abs(t.spin - Math.round(t.spin / TAU) * TAU);
      const clean = rf < 0.75 && rs < 0.95;
      if (clean && (flips || spins)) {
        const parts = [];
        if (flips) parts.push(`${NUMS[Math.min(flips, 5)] || flips + 'x '}${t.flip > 0 ? 'FRONTFLIP' : 'BACKFLIP'}`);
        if (spins) parts.push(`${spins * 360} SPIN`);
        let pts = flips * 45 + spins * 25;
        if (parts.length > 1) pts = Math.round(pts * (1 + 0.5 * (parts.length - 1)));
        pts += Math.round(landedAfter * 5);
        const name = parts.join(' + ');
        g.style(pts, name);
        g.fx.pop('STUCK IT!', null, { color: '#7dff6a', size: 70, rot: 6 });
        this.trickLanding = true;
        g.stats.bestTrick = Math.max(g.stats.bestTrick || 0, pts);
        if (pts >= 60) g.actionPanel('trick', null, `${name}! +${pts}`);
      } else if (!clean) {
        g.fx.pop('WIPEOUT!', null, { color: '#ff2a4a', size: 84, rot: -8 });
        g.damagePlayer(8, 'impact');
        b.vel.multiplyScalar(0.55);
        g.missions.jostle(18, true);
        g.audio.thud(30);
        this.trickLanding = true;
      }
      this.resetTrick();
    } else if (b.grounded && !t.active) {
      this.model.trick.rotation.set(0, 0, 0);
    }
  }

  onImpact(it, skates) {
    const g = this.game;
    const safe = (g.alchemy && g.alchemy.buffs.cushion > 0) ? 1e9 : skates ? this.params.skateSafeImpact : this.params.bootSafeImpact;
    if (it.speed > 6) g.audio.thud(it.speed);
    if (g.alchemy && g.alchemy.buffs.bouncy > 0 && it.kind === 'ground' && it.speed > 5) {
      this.body.bounceReady = Math.max(this.body.bounceReady || 0, it.speed);
      g.fx.pop('BOING!', null, { color: '#ff7ad9', size: 44 });
      return;
    }
    if (it.speed > safe) {
      // capped so one bad landing hurts but rarely kills outright
      const dmg = Math.min(60, (it.speed - safe) * this.params.impactDamage);
      g.damagePlayer(dmg, 'impact');
      g.fx.pop(it.speed - safe > 12 ? 'KRA-KOOM!' : 'KRAK!', this.body.pos.clone().addScaledVector(this.up, 2), { color: '#ff4f2e', size: 54 });
      g.fx.dust(this.body.pos, this.body.vel, 14, this.up);
    } else if (it.speed > 9) {
      g.fx.dust(this.body.pos, this.body.vel, 5, this.up);
    }
    if (it.speed > 14) g.missions.jostle(it.speed - 14, skates);
    if (it.speed > 6) { g.events.onImpact(it.speed); g.story.onImpact(it.speed); }
  }

  animate(dt, cam, ctrl) {
    const b = this.body;
    const m = this.model;
    const up = b.up;
    const sp = this.speed;
    // keep heading tangent to the sphere
    this.heading.addScaledVector(up, -this.heading.dot(up));
    if (this.heading.lengthSq() < 1e-6) this.heading.copy(cam.fwd);
    this.heading.normalize();
    const hv = _v.copy(b.vel).addScaledVector(up, -b.vel.dot(up));
    let target = null;
    if (b.skating && hv.length() > 4) target = hv.normalize();
    else if (ctrl.wish.lengthSq() > 0) target = ctrl.wish.clone().normalize();
    else if (!b.skating) target = cam.fwd;
    let turnRate = 0;
    if (target) {
      const cross = new THREE.Vector3().crossVectors(this.heading, target).dot(up);
      const ang = Math.atan2(cross, this.heading.dot(target));
      const step = ang * Math.min(1, dt * 10);
      this.heading.applyQuaternion(_q.setFromAxisAngle(up, step));
      turnRate = step / Math.max(dt, 1e-3);
    }
    const targetRoll = THREE.MathUtils.clamp(-turnRate * sp * 0.012, -0.7, 0.7);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);

    const upT = b.grounded ? b.groundN : up;
    this.upSmooth.lerp(upT, Math.min(1, dt * 8)).normalize();
    frameQuat(this.upSmooth, this.heading, m.root.quaternion);
    m.root.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll));
    m.root.position.copy(b.pos);

    this.anim += dt * (2 + Math.min(sp, 10) * 1.1);
    const s = Math.sin(this.anim);
    const base = m.bodyBase;
    if (!b.grounded) {
      m.torso.rotation.x = 0.15;
      m.legL.rotation.x = -0.5; m.legR.rotation.x = 0.3;
      m.armL.rotation.z = -1.1; m.armR.rotation.z = 1.1;
      m.armL.rotation.x = m.armR.rotation.x = 0;
      m.body.position.y = base;
      if (this.trick.active && (this.trick.flip || this.trick.spin)) { m.legL.rotation.x = m.legR.rotation.x = -1.2; m.torso.rotation.x = 0.6; }
    } else if (b.skating) {
      const crouch = Math.min(1, sp / 40);
      m.body.position.y = base - 0.18 * crouch;
      m.torso.rotation.x = 0.25 + 0.35 * crouch;
      m.legL.rotation.x = 0.35 * crouch; m.legR.rotation.x = -0.35 * crouch;
      m.armL.rotation.x = m.armR.rotation.x = -0.9 * crouch;
      m.armL.rotation.z = -0.3; m.armR.rotation.z = 0.3;
    } else {
      const run = Math.min(1, sp / 6);
      m.body.position.y = base + Math.abs(s) * 0.12 * run;
      m.torso.rotation.x = 0.1 * run;
      m.legL.rotation.x = s * 0.9 * run; m.legR.rotation.x = -s * 0.9 * run;
      m.armL.rotation.x = -s * 0.8 * run; m.armR.rotation.x = s * 0.8 * run;
      m.armL.rotation.z = -0.15; m.armR.rotation.z = 0.15;
    }
    m.scarf.rotation.x = -0.2 - Math.min(1.2, sp / 30) + Math.sin(this.anim * 3) * 0.12 * Math.min(1, sp / 10);
    m.scarf.rotation.y = Math.sin(this.anim * 2.3) * 0.15;

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(m.root.quaternion);
    const strength = b.skating && b.grounded ? Math.min(1, sp / 30) : 0;
    const g = this.game;
    g.fx.updateTrail(0, b.pos.clone().addScaledVector(right, -0.2), right, strength, up);
    g.fx.updateTrail(1, b.pos.clone().addScaledVector(right, 0.2), right, strength, up);
  }
}
