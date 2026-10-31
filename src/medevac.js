import * as THREE from 'three';
import { makeShuttle, makeFigure } from './models.js';
import { frameQuat } from './geo.js';
import { clamp, clamp01, smoothstep } from './rng.js';
import { toon, glow, ink } from './toon.js';
import { L, START_S, CORE_S, PAD_S, wrapW } from './spindleTerrain.js';
import { poseShuttle } from './recall.js';

// The Spindle's med-evac (spindle.recover): KO'd on the rock, a Meridian craft lands beside you, two medics
// stretcher you aboard and it lifts off; then a fade and spindle.finishRecovery sets you at the Monolith.
// Everything is a function of the scene clock (this.t), so SPACE can skip straight to the fade.
const AX = new THREE.Vector3(1, 0, 0);
const NEG_AX = new THREE.Vector3(-1, 0, 0);
const TEAL = 0x7dffd4;

const SCALE = 0.85; // craft scale (as the Moon recall shuttle)
const SET_BACK = 20; // craft centre this far behind you along the rock, rear ramp toward you
const LAT = 1.2; // stretcher set down this far beside you
const SP = 1.6; // each medic's distance from the stretcher's middle
const CARRY_H = 0.95, REST_H = 0.34; // stretcher height carried / set down
const CROUCH = 0.42; // medics' sink to set it down
const HIP = 0.84; // figure hip height (models.js makeFigure)

// scene clock (s)
const T = {};
T.hold = 0.9; // you lie there a moment
T.land = T.hold + 2.3; // touchdown
T.ramp0 = T.land + 0.3; // ramp drops
T.out0 = T.ramp0 + 0.4; // medics burst out...
T.out1 = T.out0 + 1.9; // ...and reach you
T.down1 = T.out1 + 0.55; // stretcher down
T.load1 = T.down1 + 1.0; // you're on it
T.up1 = T.load1 + 0.55; // and lifted
T.turn1 = T.up1 + 0.45; // turned for the craft
T.back1 = T.turn1 + 1.7; // aboard
T.lift0 = T.back1 + 0.7; // ramp up, engines spooling
T.fade0 = T.lift0 + 2.6;
T.end = T.fade0 + 1.1;

// no-landing spots: pad, shrine, lander (clear rock round each)
const KEEP_OUT = [PAD_S, CORE_S, START_S];

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const Q_LIE = new THREE.Quaternion().setFromAxisAngle(AX, -Math.PI / 2); // on your back, head toward -z
const easeOut = (k, p = 3) => 1 - Math.pow(1 - clamp01(k), p);
const ease2 = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(k));
const radial = (p, out = new THREE.Vector3()) => { out.set(0, p.y, p.z); if (out.lengthSq() < 1e-8) out.set(0, 1, 0); return out.normalize(); };
// frame with y = up, z = fwd, tilting with fwd (frameQuat levels; this follows a ramp)
function basisQuat(up, fwd, out = new THREE.Quaternion()) {
  _z.copy(fwd).normalize();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

// Meridian's stretcher: pale frame, teal mattress, glowing side rails, handles both ends, legs that unfold
// when set down. +z is the feet end.
export function makeStretcher() {
  const root = new THREE.Group();
  const part = (w, h, d, mat, x, y, z, t = 0.02) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (t) ink(m, t);
    root.add(m);
    return m;
  };
  const dark = toon(0x2a2540);
  part(0.66, 0.08, 2.2, toon(0xe8eef0), 0, 0, 0);
  part(0.54, 0.07, 1.9, toon(0x1fa89a), 0, 0.075, 0);
  part(0.46, 0.06, 0.38, toon(0xe8eef0), 0, 0.14, -0.78, 0.015);
  for (const sx of [-1, 1]) {
    part(0.05, 0.1, 2.2, dark, sx * 0.35, 0.02, 0);
    part(0.03, 0.02, 1.8, glow(TEAL), sx * 0.35, 0.085, 0, 0);
  }
  for (const sz of [-1, 1]) {
    part(0.8, 0.06, 0.06, dark, 0, 0.02, sz * 1.3);
    for (const sx of [-1, 1]) part(0.06, 0.06, 0.22, dark, sx * 0.35, 0.02, sz * 1.19);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, REST_H, 0.05).translate(0, -REST_H / 2, 0), dark);
      m.position.set(sx * 0.28, -0.04, sz * 0.9);
      root.add(m);
      legs.push(m);
    }
  }
  return { root, legs };
}

export class Medevac {
  // spindle: the Spindle (ground, sky, fall site); the scene starts at once
  constructor(game, spindle) {
    this.game = game;
    const g = game;
    const P = g.player;
    this.done = false;
    this.dawn = null;
    this.t = 0;
    this.caption = '';
    this.landed = this.lifted = this.away = this.loaded = false;
    this.lastU = 0;
    this.alt = 100;
    const ground = (s, w, lift = 0) => spindle.groundAt(s, w, lift);
    if (P.rag) { P.rag.release(); P.rag = null; }

    // where you lie: clear of the ends and the KEEP_OUT spots
    let [s, w] = g.planet.sw(P.pos);
    s = clamp(s, 80, L - 80);
    w = wrapW(w);
    if (Math.abs(w) < 70) for (const c of KEEP_OUT) if (s > c - 36 && s < c + 66) { s = s < c + 15 ? c - 36 : c + 66; break; }
    this.bodyC = ground(s, w);
    this.upB = radial(this.bodyC);
    this.stand = ground(s, w + LAT);

    // craft behind you, nose away, so its rear ramp drops toward you
    const ship = makeShuttle({ color: 0xeeecf6, stripe: 0x2ec4ff });
    ship.setSign('MEDEVAC');
    ship.root.scale.setScalar(SCALE);
    g.scene.add(ship.root);
    this.ship = ship;
    this.land = ground(s - SET_BACK, w + LAT);
    this.up = radial(this.land);
    // run from hold to stretcher spot: inside, ramp top, ramp foot, you
    ship.setGear(1);
    ship.setRamp(1);
    this.pose(0);
    ship.root.updateMatrixWorld(true);
    const W = (v) => ship.root.localToWorld(v.clone());
    this.pts = [W(ship.inside), W(ship.rampTop), W(ship.rampBottom), this.stand.clone()];
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.len = this.cum[this.cum.length - 1];
    this.tan0 = this.pts[1].clone().sub(this.pts[0]).normalize();
    this.tan1 = this.pts[3].clone().sub(this.pts[2]).normalize();
    ship.setGear(0);
    ship.setRamp(0);
    this.pose(this.alt);

    // medics and stretcher
    const medic = (seed, visor) => {
      const f = makeFigure({ suit: 0x1fa89a, helmet: 0xfff4e0, visor, look: 'eva', seed });
      f.root.visible = false;
      g.scene.add(f.root);
      return f;
    };
    this.medA = medic(21, 0x123a3a); // leads going out, carries the feet end
    this.medB = medic(34, 0xffd23f);
    this.str = makeStretcher();
    this.str.root.visible = false;
    g.scene.add(this.str.root);

    // you: out cold on your back
    P.model.root.visible = true;
    P.restPose(); // (otherwise lean, bob and scarf stay as when you went down)
    const m = P.model;
    m.armL.rotation.set(0.08, 0, -0.2); m.armR.rotation.set(0.08, 0, 0.2);
    this.putBody(this.groundPose());

    // wide and close shots
    this.camWide = ground(s - 6, w - 26, 6);
    this.camClose = ground(s + 3, w - 7, 2.5);
    this.focusWide = ground(s - 9, w + LAT, 2);

    // cinema bars: just picture and caption
    this.bars = g.recall.bars;
    this.bars.classList.remove('hidden', 'cb-out');
    document.body.classList.add('medevac');
    this.say('MERIDIAN MED-EVAC DISPATCHED…');
    g.hud.prompt(null);
    g.audio.tone(70, 2.6, 'sawtooth', 0.12, 0.6);
  }

  say(text) {
    if (text === this.caption) return;
    this.caption = text;
    this.bars.querySelector('.cb-cap').textContent = text;
  }

  pose(alt, tilt) { poseShuttle(this.ship, this.land, this.up, NEG_AX, alt, tilt); }

  // point on the run u metres from the hold (extrapolates straight past either end)
  pathAt(u, out) {
    const p = this.pts, c = this.cum;
    if (u <= 0) return out.copy(p[0]).addScaledVector(this.tan0, u);
    if (u >= this.len) return out.copy(p[3]).addScaledVector(this.tan1, u - this.len);
    let i = 1;
    while (c[i] < u) i++;
    return out.lerpVectors(p[i - 1], p[i], (u - c[i - 1]) / (c[i] - c[i - 1]));
  }

  // you on your back, feet along +x, head toward the craft; stretcher set beside you
  groundPose() {
    const pos = this.bodyC.clone().addScaledVector(AX, 0.9).addScaledVector(this.upB, 0.2);
    return { pos, quat: basisQuat(this.upB, AX).multiply(Q_LIE) };
  }

  putBody({ pos, quat }) {
    const r = this.game.player.model.root;
    r.position.copy(pos);
    r.quaternion.copy(quat);
  }

  update(dt) {
    const g = this.game;
    if (this.t > 1.5 && this.t < T.fade0 && (g.input.pressed('Space') || g.input.pressed('Enter'))) this.t = T.fade0; // (skip to the fade)
    this.t += dt;
    const t = this.t;
    this.updateCraft(t, dt);
    this.updateCrew(t, dt);
    this.updateCamera(t);
    // fade out, then home
    if (t >= T.fade0 && !this.dawn) {
      const el = document.createElement('div');
      el.id = 'dawn';
      el.innerHTML = '<div class="dw-t">RECOVERED</div><div class="dw-s">BACK AT THE LAUNCH COMPLEX</div>';
      document.body.appendChild(el);
      this.dawn = el;
    }
    if (t >= T.end) this.done = true;
  }

  updateCraft(t, dt) {
    const g = this.game;
    const s = this.ship;
    if (t < T.land) {
      // down on retro-thrusters
      this.alt = 100 * (1 - easeOut((t - T.hold) / (T.land - T.hold)));
      this.pose(this.alt, t > T.hold ? Math.sin(t * 3) * 0.04 : 0);
      s.setGear(clamp01(1 - (this.alt - 4) / 30));
      s.setThrust(0.3, 1, t);
      if (this.alt < 90 && Math.random() < dt * 40) g.fx.spawn(s.root.position.clone().addScaledVector(this.up, -3), this.up.clone().multiplyScalar(-18), { color: Math.random() < 0.5 ? 0xff9f1c : 0xffd23f, size: 0.6, life: 0.4, count: 2, spread: 2 });
    } else if (t < T.lift0) {
      this.alt = 0;
      this.pose(0);
      s.setGear(1);
      s.setThrust(0, Math.max(0, 1 - (t - T.land) * 2), t);
      if (!this.landed) {
        this.landed = true;
        g.fx.dust(this.land, new THREE.Vector3(), 30, this.up);
        g.audio.thud(30);
        g.fx.pop('TOUCHDOWN!', this.land.clone().addScaledVector(this.up, 7), { color: '#2ee6ff', size: 52 });
      }
      // ramp drops, rises once they're aboard
      const open = ease2((t - T.ramp0) / 0.6), shut = 1 - ease2((t - (T.back1 - 0.1)) / 0.65);
      s.setRamp(Math.min(open, shut));
    } else {
      // up and away
      const tt = t - T.lift0;
      s.setRamp(0);
      if (!this.lifted) { this.lifted = true; g.audio.tone(90, 2.4, 'sawtooth', 0.12, 0.6); }
      if (tt > 0.6) {
        this.alt = 15 * (tt - 0.6) * (tt - 0.6);
        s.setThrust(Math.min(1, (tt - 0.6) * 0.5), 1, tt);
        if (Math.random() < dt * 30) g.fx.spawn(s.root.position.clone().addScaledVector(this.up, -3), this.up.clone().multiplyScalar(-14), { color: 0xff9f1c, size: 0.5, life: 0.4, count: 1, spread: 1.5 });
      } else {
        this.alt = 0;
        s.setThrust(0, tt / 0.6, tt);
      }
      s.setGear(Math.max(0, 1 - tt * 0.6));
      this.pose(this.alt);
      if (tt > 0.9 && !this.away) {
        this.away = true;
        g.fx.pop('MED-EVAC AWAY!', this.land.clone().addScaledVector(this.up, 8), { color: '#7dffd4', size: 50 });
      }
    }
  }

  updateCrew(t, dt) {
    const g = this.game;
    const P = g.player;
    const len = this.len;
    const out = t < T.up1; // (before the turn the feet-end medic leads)
    const turning = t >= T.up1 && t < T.turn1;
    // party's middle along the run
    let uC;
    if (t < T.out0) uC = SP;
    else if (t < T.out1) uC = SP + (len - SP) * easeOut((t - T.out0) / (T.out1 - T.out0), 2);
    else if (t < T.turn1) uC = len;
    else uC = len + (-SP - len) * ease2((t - T.turn1) / (T.back1 - T.turn1));
    // crouched to set it down / lift it
    const ck = smoothstep(T.out1, T.down1, t) * (1 - smoothstep(T.load1, T.up1, t));
    const crouch = CROUCH * ck;
    const h = CARRY_H + (REST_H - CARRY_H) * ck;

    // feet: feet-end medic (A), head-end medic (B)
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    if (out) { this.pathAt(uC + SP, A); this.pathAt(uC - SP, B); }
    else if (turning) {
      const th = Math.PI * ease2((t - T.up1) / (T.turn1 - T.up1));
      const upS = radial(this.stand);
      const v = new THREE.Vector3().copy(this.tan1).addScaledVector(upS, -this.tan1.dot(upS)).normalize().multiplyScalar(SP).applyAxisAngle(upS, th);
      A.copy(this.stand).add(v);
      B.copy(this.stand).sub(v);
    } else { this.pathAt(uC - SP, A); this.pathAt(uC + SP, B); }
    const uA = out ? uC + SP : turning ? len : uC - SP, uB = out ? uC - SP : turning ? len : uC + SP;
    const shown = t >= T.ramp0 + 0.25;

    // stretcher between them, tilting with the ramp
    const M = A.clone().add(B).multiplyScalar(0.5);
    const upM = radial(M);
    const hS = A.clone().sub(B);
    const str = this.str;
    str.root.position.copy(M).addScaledVector(upM, h);
    basisQuat(upM, hS, str.root.quaternion);
    str.root.visible = shown && uC > 0.4;
    for (const l of str.legs) l.scale.y = Math.max(0.001, ck);
    str.root.updateMatrixWorld(true);

    // the medics
    const speed = dt > 0 ? clamp01(Math.abs(uC - this.lastU) / dt / 2.2) : 0;
    this.lastU = uC;
    const swing = turning ? Math.sin(t * 14) * 0.45 : Math.sin(uC * 2.6) * 0.95 * speed;
    const lunge = Math.acos(clamp01((HIP - crouch) / HIP));
    const dir = hS.clone().normalize();
    for (const [med, at, u, lead] of [[this.medA, A, uA, true], [this.medB, B, uB, false]]) {
      const up = radial(at);
      med.root.position.copy(at).addScaledVector(up, -crouch);
      frameQuat(up, dir, med.root.quaternion);
      const sw = swing * (1 - ck);
      med.legL.rotation.x = sw + lunge * ck;
      med.legR.rotation.x = -sw - lunge * ck;
      // hands on handles: behind the leader's back, in front of the trailer
      const arm = (lead ? 0.6 + 0.12 * ck : -0.6 - 0.1 * ck);
      med.armL.rotation.set(arm, 0, 0.08);
      med.armR.rotation.set(arm, 0, -0.08);
      med.root.visible = shown && u > 0.3;
    }

    // you: where you fell, lifted onto the stretcher, carried
    const onStr = { pos: str.root.localToWorld(new THREE.Vector3(0, 0.33, 0.9)), quat: str.root.quaternion.clone().multiply(Q_LIE) };
    const gp = this.groundPose();
    if (t < T.down1) this.putBody(gp);
    else if (t < T.load1) {
      const k = ease2((t - T.down1) / (T.load1 - T.down1));
      const pos = gp.pos.clone().lerp(onStr.pos, k).addScaledVector(this.upB, Math.sin(Math.PI * k) * 0.45);
      this.putBody({ pos, quat: gp.quat.clone().slerp(onStr.quat, k) });
    } else this.putBody(onStr);
    P.model.root.visible = t < T.load1 || uC > 0.4;

    // beats
    if (t >= T.down1 && !this.loaded) {
      this.loaded = true;
      g.audio.pickup();
      g.fx.pop('HUP!', this.stand.clone().addScaledVector(radial(this.stand), 3.2), { color: '#ffd23f', size: 50 });
    }
    if (t >= T.land + 0.6 && t < T.load1) this.say('MERIDIAN MED-EVAC ON SITE.');
    else if (t >= T.load1 && t < T.lift0) this.say('PATIENT SECURED. GO, GO, GO.');
    else if (t >= T.lift0) this.say('MERIDIAN TRANSIT · RECOVERY IN PROGRESS…');
  }

  updateCamera(t) {
    const g = this.game;
    const cam = g.camera;
    // in while the medics work, out as they run for the craft
    const m = smoothstep(0, 1, (t - (T.out1 - 0.9)) / 0.9) * (1 - smoothstep(T.up1, T.turn1 + 0.4, t));
    const pos = this.camWide.clone().lerp(this.camClose, m);
    const wide = this.focusWide.clone().addScaledVector(this.up, this.alt * 0.45);
    const close = this.stand.clone().addScaledVector(this.upB, 0.9);
    const focus = wide.lerp(close, m);
    if (t > T.land && t < T.land + 0.5) pos.addScaledVector(this.up, Math.sin(t * 60) * 0.12 * (1 - (t - T.land) / 0.5));
    cam.position.copy(pos);
    cam.up.copy(radial(pos));
    cam.lookAt(focus);
    g.cam.position.copy(pos);
  }

  // tear down (spindle.finishRecovery / endRecovery)
  dispose() {
    const P = this.game.player;
    for (const o of [this.ship.root, this.str.root, this.medA.root, this.medB.root]) o.removeFromParent();
    P.restPose();
    document.body.classList.remove('medevac');
  }
}
