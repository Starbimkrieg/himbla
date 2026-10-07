import * as THREE from 'three';
import { makeShuttle } from './models.js';
import { toon, ink } from './toon.js';
import { frameQuat, tangent } from './geo.js';

// Emergency recall: ₵100, and a little cutscene. A transport shuttle drops out of the sky at your
// home base, lands, drops its ramp, and you stroll out.
export const RECALL_COST = 100;

const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const _v = new THREE.Vector3();

export class Recall {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.leaving = null; // the shuttle flying off after the scene ends
    this.bars = document.createElement('div');
    this.bars.id = 'cinebars';
    this.bars.className = 'hidden';
    this.bars.innerHTML = '<div class="cb-top"></div><div class="cb-bot"></div><div class="cb-cap"></div><div class="cb-skip">SPACE · SKIP</div>';
    document.getElementById('hud').appendChild(this.bars);
  }

  request() {
    const g = this.game;
    if (this.active) return;
    if (g.player.vehicle) g.garage.exit();
    if (g.credits < RECALL_COST) { g.hud.toast(`Emergency recall costs ₵${RECALL_COST}. You can't afford the shuttle.`, 2.5); return; }
    g.credits -= RECALL_COST;
    g.audio.cash();
    if (g.missions.active) g.missions.fail('Emergency recall — contract forfeited.');
    this.start();
  }

  start() {
    const g = this.game;
    const P = g.player;
    const home = g.home();
    this.home = home;
    this.active = true;
    this.t = 0;
    this.landed = false;
    this.opened = false;
    this.walked = false;
    g.state = 'cutscene';
    if (this.leaving) { this.leaving.root.removeFromParent(); this.leaving = null; }
    // the landing spot: a little beside where you'll stand
    const up = home.point.clone().normalize();
    const fwd = home.facing.clone();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    g.planet.update(home.point, { budgetMs: 1e9 });
    this.land = g.planet.ground(home.point.clone().addScaledVector(fwd, -10), new THREE.Vector3());
    this.up = this.land.clone().normalize();
    this.fwd = tangent(fwd.clone(), this.up).normalize();
    this.right = right;
    // the shuttle (nose pointing the way you'll walk out, ramp at the back)
    const s = makeShuttle({ color: 0xfff4e0, stripe: g.rep.aligned() ? 0x7dff3a : 0x2ec4ff });
    const ramp = new THREE.Group();
    ramp.position.set(0, -2.2, -6.6);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 4), toon(0x3a3550));
    ink(plank, 0.04);
    plank.position.set(0, 0, -2);
    ramp.add(plank);
    ramp.rotation.x = -1.4; // closed
    s.root.add(ramp);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2.2, 6), toon(0x3a3550));
      leg.position.set(sx * 1.8, -2.6, sz * 3.5);
      s.root.add(leg);
    }
    s.root.scale.setScalar(0.85);
    g.scene.add(s.root);
    this.shuttle = { ...s, ramp };
    this.pose(140);
    // you're aboard, out of sight
    P.respawn(home.point, home.facing);
    P.model.root.visible = false;
    g.cam.fwd.copy(home.facing);
    // cinema bars + caption
    this.bars.querySelector('.cb-cap').textContent = `MEANWHILE, ABOVE ${home.loc.name.toUpperCase()}…`;
    this.bars.classList.remove('hidden', 'cb-out');
    g.hud.prompt(null);
    g.audio.tone(70, 2.6, 'sawtooth', 0.12, 0.6);
  }

  pose(alt, tilt = 0) {
    const s = this.shuttle;
    s.root.position.copy(this.land).addScaledVector(this.up, 2.4 + alt);
    frameQuat(this.up, this.fwd, s.root.quaternion);
    if (tilt) s.root.rotateX(tilt);
  }

  // cinematic camera off to the side
  camera() {
    const g = this.game;
    const cam = g.camera;
    const focus = this.land.clone().addScaledVector(this.up, 2.5 + Math.max(0, this.shuttleAlt || 0) * 0.6);
    cam.position.copy(this.land).addScaledVector(this.right, 17).addScaledVector(this.fwd, 9).addScaledVector(this.up, 5);
    cam.up.copy(this.up);
    cam.lookAt(focus);
    g.cam.position.copy(cam.position);
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    if (this.leaving) this.flyAway(dt);
    if (!this.active) return;
    if (g.input.pressed('Space') || g.input.pressed('Enter')) this.t = Math.max(this.t, 5.2);
    this.t += dt;
    const t = this.t;
    const s = this.shuttle;
    // 0–2.4 s: descend on retro-thrusters
    if (t < 2.4) {
      this.shuttleAlt = 140 * (1 - ease(t / 2.4));
      this.pose(this.shuttleAlt, Math.sin(t * 3) * 0.04);
      if (Math.random() < dt * 40) g.fx.spawn(s.root.position.clone().addScaledVector(this.up, -2.5), this.up.clone().multiplyScalar(-18), { color: Math.random() < 0.5 ? 0xff9f1c : 0xffd23f, size: 0.6, life: 0.4, count: 2, spread: 2 });
    } else {
      this.shuttleAlt = 0;
      this.pose(0);
      if (!this.landed) {
        this.landed = true;
        g.fx.dust(this.land, new THREE.Vector3(), 30, this.up);
        g.audio.thud(30);
        g.cam.shake = 0.5;
        g.fx.pop('TOUCHDOWN!', this.land.clone().addScaledVector(this.up, 7), { color: '#2ee6ff', size: 52 });
      }
    }
    // 2.8–3.4 s: ramp drops
    if (t > 2.8) s.ramp.rotation.x = -1.4 + 1.15 * ease((t - 2.8) / 0.6);
    // 3.4–4.6 s: you walk down the ramp
    if (t > 3.4) {
      const k = ease((t - 3.4) / 1.2);
      const from = this.land.clone().addScaledVector(this.fwd, -7.5).addScaledVector(this.up, 0.6);
      const to = this.home.point.clone();
      P.body.pos.lerpVectors(from, to, k);
      P.body.vel.set(0, 0, 0);
      P.model.root.visible = true;
      P.model.root.position.copy(P.body.pos);
      P.heading.copy(this.fwd).negate();
      frameQuat(this.up, P.heading, P.model.root.quaternion);
      const w = Math.sin(t * 10) * 0.6 * (1 - k);
      P.model.legL.rotation.x = w; P.model.legR.rotation.x = -w;
    }
    this.camera();
    if (t >= 5.2) this.end();
  }

  end() {
    const g = this.game;
    const P = g.player;
    this.active = false;
    P.respawn(this.home.point, this.home.facing);
    P.model.root.visible = true;
    g.cam.fwd.copy(this.home.facing);
    g.cam.pitch = -0.1;
    g.updateCamera(0.016, true);
    this.bars.classList.add('cb-out');
    setTimeout(() => this.bars.classList.add('hidden'), 400);
    g.state = 'play';
    g.hud.banner(this.home.loc);
    this.leaving = { root: this.shuttle.root, t: 0, vel: 0 };
  }

  // after the scene: the shuttle closes up and climbs away
  flyAway(dt) {
    const L = this.leaving;
    L.t += dt;
    if (L.t > 0.6) {
      L.vel += dt * 30;
      L.root.position.addScaledVector(this.up, L.vel * dt);
      this.shuttle.ramp.rotation.x = Math.max(-1.4, this.shuttle.ramp.rotation.x - dt * 3);
      if (Math.random() < dt * 30) this.game.fx.spawn(L.root.position.clone().addScaledVector(this.up, -2.5), this.up.clone().multiplyScalar(-14), { color: 0xff9f1c, size: 0.5, life: 0.4, count: 1, spread: 1.5 });
    }
    if (L.t > 8) { L.root.removeFromParent(); this.leaving = null; }
  }
}
