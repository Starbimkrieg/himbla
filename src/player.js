import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeBody, stepSkater } from './physics.js';
import { makeRunner, makeCrate } from './models.js';

const UP = new THREE.Vector3(0, 1, 0);
const SPEED_MARKS = [
  { kmh: 150, text: 'WHOOSH!' },
  { kmh: 250, text: 'ZOOOM!' },
  { kmh: 350, text: 'KA-ZOOM!!' },
  { kmh: 450, text: 'LUDICROUS!!!' },
];

export class Player {
  constructor(game, spawn) {
    this.game = game;
    this.model = makeRunner({ suit: 0xff4f2e, accent: 0x2ee6ff, scarf: 0xffd23f });
    game.scene.add(this.model.root);
    this.body = makeBody(spawn);
    this.maxHealth = 100;
    this.health = 100;
    this.dead = false;
    this.center = new THREE.Vector3();
    this.heading = 0;
    this.prevHeading = 0;
    this.roll = 0;
    this.fireCd = 0;
    this.cargoMesh = null;
    this.speedMarks = SPEED_MARKS.map(() => false);
    this.bigAirShown = false;
    this.launchCheck = -1;
    this.anim = 0;
    this.upSmooth = new THREE.Vector3(0, 1, 0);
    this.impacts = [];
    this.params = { ...PHYS };
    this.lastHurt = 0;
  }

  get pos() { return this.body.pos; }
  get vel() { return this.body.vel; }
  get speed() { return this.body.vel.length(); }

  applyUpgrades(up) {
    this.params.skateSafeImpact = PHYS.skateSafeImpact + up.dampers * 8;
    this.body.maxEnergy = PHYS.maxEnergy + up.capacitor * 25;
    this.maxHealth = 100 + up.armor * 25;
    this.damageMult = 1 + up.spinner * 0.3;
  }

  respawn(pos) {
    this.body.pos.copy(pos);
    this.body.vel.set(0, 0, 0);
    this.body.energy = this.body.maxEnergy;
    this.health = this.maxHealth;
    this.dead = false;
    this.model.root.visible = true;
  }

  setCargo(color) {
    if (this.cargoMesh) { this.model.cargoSlot.remove(this.cargoMesh); this.cargoMesh = null; }
    if (color != null) {
      this.cargoMesh = makeCrate(color, 0.7);
      this.model.cargoSlot.add(this.cargoMesh);
    }
  }

  update(dt, input, cam) {
    const g = this.game;
    const b = this.body;
    if (this.dead) return;

    const fwd = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (input.down('KeyW')) wish.add(fwd);
    if (input.down('KeyS')) wish.sub(fwd);
    if (input.down('KeyD')) wish.add(right);
    if (input.down('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const look = cam.forward;
    const thrustDir = new THREE.Vector3().copy(look).addScaledVector(UP, 0.9);
    if (wish.lengthSq() > 0) thrustDir.addScaledVector(wish, 0.4);
    thrustDir.normalize();

    const ctrl = {
      wish,
      skates: input.down('Space'),
      thrust: input.down('KeyE') || input.mouse[2],
      jump: input.pressed('ShiftLeft') || input.pressed('ShiftRight'),
      thrustDir,
    };

    const wasGrounded = b.grounded;
    const airBefore = b.airTime;
    b.jumped = false;
    // fixed sub-steps for stable high-speed contact
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const imp = stepSkater(b, ctrl, h, g.terrain, g.colliders, this.params, this.impacts);
      for (const it of imp) this.onImpact(it, ctrl.skates);
      ctrl.jump = false;
    }
    if (b.jumped) { g.audio.jump(); g.fx.dust(b.pos, b.vel, 6); }

    // landing / airtime style
    if (!wasGrounded && b.grounded && airBefore > 2.2) {
      g.style(Math.round(airBefore * 15), `BIG AIR ${airBefore.toFixed(1)}s`);
    }
    if (wasGrounded && !b.grounded && this.speed > 40 && b.vel.y > 6) this.launchCheck = 0.6;
    if (this.launchCheck > 0) {
      this.launchCheck -= dt;
      if (this.launchCheck <= 0 && !b.grounded && b.vel.y > 0) {
        g.fx.pop(this.speed > 70 ? 'SKY-HIGH!' : 'LAUNCH!', null, { color: '#2ee6ff', size: 72 });
        g.actionPanel('launch');
      }
    }

    // speed milestones
    const kmh = this.speed * 3.6;
    SPEED_MARKS.forEach((m, i) => {
      if (!this.speedMarks[i] && kmh > m.kmh) {
        this.speedMarks[i] = true;
        g.fx.pop(m.text, null, { color: i > 1 ? '#ff2e88' : '#ffd23f', size: 60 + i * 12 });
        g.style(10 + i * 10, null);
      } else if (this.speedMarks[i] && kmh < m.kmh - 60) this.speedMarks[i] = false;
    });

    // weapon: Pulse Spinner
    this.fireCd -= dt;
    if (input.mouse[0] && this.fireCd <= 0 && input.locked) {
      this.fireCd = 0.55;
      const muzzle = this.center.clone().addScaledVector(right, 0.5).addScaledVector(UP, 0.3);
      const aim = cam.position.clone().addScaledVector(look, 350);
      const dir = aim.sub(muzzle).normalize();
      const vel = dir.multiplyScalar(115).addScaledVector(b.vel, 0.5);
      g.projectiles.fire('player', muzzle, vel, { damage: 34 * (this.damageMult || 1), splash: 7, color: 0x9be7ff, size: 0.45, knock: 1.6 });
      g.audio.shoot();
    }

    // dust plumes while gliding fast
    if (b.grounded && b.skating && this.speed > 25 && Math.random() < dt * 30) {
      g.fx.dust(b.pos, b.vel.clone().multiplyScalar(-0.2), 1, 0xe8e2d8);
    }
    if (b.thrusting && Math.random() < dt * 40) {
      const back = this.model.cargoSlot.getWorldPosition(new THREE.Vector3());
      g.fx.spawn(back, thrustDir.clone().multiplyScalar(-12).add(b.vel), { color: Math.random() < 0.5 ? 0x2ee6ff : 0xffffff, size: 0.35, life: 0.35, spread: 2 });
    }

    this.center.copy(b.pos).addScaledVector(UP, 1.3);
    this.animate(dt, cam, ctrl);
  }

  onImpact(it, skates) {
    const g = this.game;
    const safe = skates ? this.params.skateSafeImpact : this.params.bootSafeImpact;
    if (it.speed > 6) g.audio.thud(it.speed);
    if (it.speed > safe) {
      const dmg = (it.speed - safe) * this.params.impactDamage;
      g.damagePlayer(dmg, 'impact');
      g.fx.pop(it.speed - safe > 12 ? 'KRA-KOOM!' : 'KRAK!', this.body.pos.clone().add(new THREE.Vector3(0, 2, 0)), { color: '#ff4f2e', size: 54 });
      g.fx.dust(this.body.pos, this.body.vel, 14);
    } else if (it.speed > 9) {
      g.fx.dust(this.body.pos, this.body.vel, 5);
    }
    if (it.speed > 14) g.missions.jostle(it.speed - 14, skates);
  }

  animate(dt, cam, ctrl) {
    const b = this.body;
    const m = this.model;
    const sp = this.speed;
    const hv = new THREE.Vector3(b.vel.x, 0, b.vel.z);
    let target = this.heading;
    if (b.skating && hv.length() > 4) target = Math.atan2(hv.x, hv.z);
    else if (ctrl.wish.lengthSq() > 0) target = Math.atan2(ctrl.wish.x, ctrl.wish.z);
    else if (!b.skating) target = cam.yaw;
    let d = target - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, dt * 10);
    const turnRate = Math.atan2(Math.sin(this.heading - this.prevHeading), Math.cos(this.heading - this.prevHeading)) / Math.max(dt, 1e-3);
    this.prevHeading = this.heading;
    const targetRoll = THREE.MathUtils.clamp(-turnRate * sp * 0.012, -0.7, 0.7);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);

    // orientation: align with ground when grounded
    const upT = b.grounded ? b.groundN : UP;
    this.upSmooth.lerp(upT, Math.min(1, dt * 8)).normalize();
    const qUp = new THREE.Quaternion().setFromUnitVectors(UP, this.upSmooth);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, this.heading);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll);
    m.root.quaternion.copy(qUp).multiply(qYaw).multiply(qRoll);
    m.root.position.copy(b.pos);

    this.anim += dt * (2 + Math.min(sp, 10) * 1.1);
    const s = Math.sin(this.anim);
    if (!b.grounded) {
      m.torso.rotation.x = 0.15;
      m.legL.rotation.x = -0.5; m.legR.rotation.x = 0.3;
      m.armL.rotation.z = -1.1; m.armR.rotation.z = 1.1;
      m.armL.rotation.x = m.armR.rotation.x = 0;
      m.body.position.y = 0;
    } else if (b.skating) {
      const crouch = Math.min(1, sp / 40);
      m.body.position.y = -0.18 * crouch;
      m.torso.rotation.x = 0.25 + 0.35 * crouch;
      m.legL.rotation.x = 0.35 * crouch; m.legR.rotation.x = -0.35 * crouch;
      m.armL.rotation.x = m.armR.rotation.x = -0.9 * crouch;
      m.armL.rotation.z = -0.3; m.armR.rotation.z = 0.3;
    } else {
      const run = Math.min(1, sp / 6);
      m.body.position.y = Math.abs(s) * 0.12 * run;
      m.torso.rotation.x = 0.1 * run;
      m.legL.rotation.x = s * 0.9 * run; m.legR.rotation.x = -s * 0.9 * run;
      m.armL.rotation.x = -s * 0.8 * run; m.armR.rotation.x = s * 0.8 * run;
      m.armL.rotation.z = -0.15; m.armR.rotation.z = 0.15;
    }
    m.scarf.rotation.x = -0.2 - Math.min(1.2, sp / 30) + Math.sin(this.anim * 3) * 0.12 * Math.min(1, sp / 10);
    m.scarf.rotation.y = Math.sin(this.anim * 2.3) * 0.15;
    m.glowM.color.setHex(b.skating ? 0x2ee6ff : 0x3a3550);

    // skate trails
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(m.root.quaternion);
    const strength = b.skating && b.grounded ? Math.min(1, sp / 30) : 0;
    const g = this.game;
    g.fx.updateTrail(0, b.pos.clone().addScaledVector(right, -0.2), right, strength);
    g.fx.updateTrail(1, b.pos.clone().addScaledVector(right, 0.2), right, strength);
  }
}
