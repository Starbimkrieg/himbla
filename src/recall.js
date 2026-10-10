import * as THREE from 'three';
import { makeShuttle } from './models.js';
import { frameQuat, tangent } from './geo.js';

// Emergency recall: ₵100, and a little cutscene. A transport shuttle drops out of the sky at your
// home base, lands, drops its ramp, and you stroll out.
export const RECALL_COST = 100;

const SCALE = 0.85;
const SET_BACK = 15; // shuttle centre this far behind your stand point
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
    if (g.rides.ride) g.rides.exit();
    if (g.credits < RECALL_COST) { g.hud.toast(`Emergency recall costs ₵${RECALL_COST}. You can't afford the shuttle.`, 2.5); return; }
    g.credits -= RECALL_COST;
    g.audio.cash();
    if (g.missions.active) g.missions.failAll('Emergency recall — contract forfeited.');
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
    this.land = g.planet.ground(home.point.clone().addScaledVector(fwd, -SET_BACK), new THREE.Vector3());
    this.up = this.land.clone().normalize();
    this.fwd = tangent(fwd.clone(), this.up).normalize();
    this.right = right;
    // the shuttle sits behind where you'll stand, nose away, so its rear door drops toward you
    const s = makeShuttle({ color: 0xfff4e0, stripe: g.rep.aligned() ? 0x7dff3a : 0x2ec4ff });
    s.root.scale.setScalar(SCALE);
    s.setGear(0);
    s.setRamp(0);
    g.scene.add(s.root);
    this.shuttle = s;
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
    s.root.position.copy(this.land).addScaledVector(this.up, s.gearH * SCALE + alt);
    frameQuat(this.up, _v.copy(this.fwd).negate(), s.root.quaternion);
    if (tilt) s.root.rotateX(tilt);
  }

  // cinematic camera off to the side
  camera() {
    const g = this.game;
    const cam = g.camera;
    const focus = this.land.clone().addScaledVector(this.up, 2.5 + Math.max(0, this.shuttleAlt || 0) * 0.6);
    cam.position.copy(this.land).addScaledVector(this.right, 22).addScaledVector(this.fwd, 13).addScaledVector(this.up, 6);
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
      s.setGear(Math.min(1, Math.max(0, 1 - (this.shuttleAlt - 4) / 30)));
      s.setThrust(0.3, 1, t);
      if (Math.random() < dt * 40) g.fx.spawn(s.root.position.clone().addScaledVector(this.up, -3), this.up.clone().multiplyScalar(-18), { color: Math.random() < 0.5 ? 0xff9f1c : 0xffd23f, size: 0.6, life: 0.4, count: 2, spread: 2 });
    } else {
      this.shuttleAlt = 0;
      this.pose(0);
      s.setGear(1);
      s.setThrust(0, Math.max(0, 1 - (t - 2.4) * 2), t);
      if (!this.landed) {
        this.landed = true;
        g.fx.dust(this.land, new THREE.Vector3(), 30, this.up);
        g.audio.thud(30);
        g.cam.shake = 0.5;
        g.fx.pop('TOUCHDOWN!', this.land.clone().addScaledVector(this.up, 7), { color: '#2ee6ff', size: 52 });
      }
    }
    // 2.8–3.4 s: the rear door drops into a ramp
    if (t > 2.8) s.setRamp(ease((t - 2.8) / 0.6));
    // 3.4–4.6 s: you walk out of the hold, down the ramp and over to your spot
    if (t > 3.4) {
      const k = Math.min(1, (t - 3.4) / 1.2);
      s.root.updateMatrixWorld(true);
      const a = s.root.localToWorld(s.inside.clone()), b = s.root.localToWorld(s.rampBottom.clone());
      const to = this.home.point.clone();
      if (k < 0.55) P.body.pos.lerpVectors(a, b, ease(k / 0.55));
      else P.body.pos.lerpVectors(b, to, ease((k - 0.55) / 0.45));
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
    // you come out facing the shuttle (the camera sits behind you, clear of it - facing away put
    // the camera inside the hull) and watch it close up and lift off
    const toShip = this.home.facing.clone().negate();
    P.respawn(this.home.point, toShip);
    P.model.root.visible = true;
    g.cam.fwd.copy(toShip);
    g.cam.pitch = 0.12;
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
      const s = this.shuttle;
      s.setRamp(Math.max(0, s.rampK - dt * 2));
      s.setGear(Math.max(0, s.gearK - dt * 0.6));
      s.setThrust(Math.min(1, (L.t - 0.6) * 0.5), 1, L.t);
      if (Math.random() < dt * 30) this.game.fx.spawn(L.root.position.clone().addScaledVector(this.up, -3), this.up.clone().multiplyScalar(-14), { color: 0xff9f1c, size: 0.5, life: 0.4, count: 1, spread: 1.5 });
    } else {
      const s = this.shuttle;
      s.setRamp(Math.max(0, s.rampK - dt * 2));
      s.setThrust(0, L.t / 0.6, L.t);
    }
    if (L.t > 8) { L.root.removeFromParent(); this.leaving = null; }
  }
}
