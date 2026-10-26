import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeBody, stepSkater } from './physics.js';
import { makeRunner, makeCrate, ScarfSim } from './models.js';
import { frameQuat, upAt } from './geo.js';
import { Ragdoll } from './ragdoll.js';
import { Idle } from './idles.js';
import { updateHalo } from './cosmetics.js';
import { Combo, BIG_AIR } from './combo.js';
import { grindLabel } from './rails.js';
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
// trick thrust: with the body turned in a trick the pack pushes where the body faces, at this share of the thrusters' power
const TRICK_THRUST = 0.7;
const NUMS = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD ', 'QUINT '];
const BIG_AIR_MIN = BIG_AIR; // s airborne before an air is called BIG AIR (shorter ones over 1.8 s still pay, as AIR); it keeps a style run open
const WINCH_FAST = 50; // m/s on the Hitch-Line before it pays style...
const WINCH_RATE = 7; // ...at this many points a second (a trick's air time pays 5)
const SKY_HIGH_GAIN = 40; // m climbed (radially) above a jump's start before SKY-HIGH! is called

// What a trick scores if you land it now: whole flips and spins, plus air time (the combo applies the multiplier).
// clean: upright enough to stick it; tilt: how far off that is (1 = the wipeout edge). Live and on landing.
export function trickScore(t, air) {
  const flips = Math.round(Math.abs(t.flip) / TAU), spins = Math.round(Math.abs(t.spin) / TAU);
  const rf = Math.abs(t.flip - Math.round(t.flip / TAU) * TAU), rs = Math.abs(t.spin - Math.round(t.spin / TAU) * TAU);
  const parts = [];
  if (flips) parts.push(`${flips < NUMS.length ? NUMS[flips] : flips + 'x '}${t.flip > 0 ? 'FRONTFLIP' : 'BACKFLIP'}`);
  if (spins) parts.push(`${spins * 360} SPIN`);
  const tilt = Math.max(rf / 0.75, rs / 0.95);
  return { flips, spins, parts, flipPts: flips * 45, spinPts: spins * 25, airPts: Math.round(air * 5), tilt, clean: tilt < 1 };
}

// a scored trick as combo moves: [label, points, kind]
function trickMoves(sc, air) {
  const out = [];
  if (sc.flips) out.push([sc.parts[0], sc.flipPts, 'flip']);
  if (sc.spins) out.push([sc.parts[sc.flips ? 1 : 0], sc.spinPts, 'spin']);
  out.push([`AIR ${air.toFixed(1)}s`, sc.airPts, 'air']);
  return out;
}
const airLabel = (s) => `${s >= BIG_AIR_MIN ? 'BIG AIR' : 'AIR'} ${s.toFixed(1)}s`;

const _q = new THREE.Quaternion();
const _Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _sp = new THREE.Vector3(), _sf = new THREE.Vector3();
const _tp = new THREE.Vector3(), _tl = new THREE.Vector3();

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
    this.airBase = null; // radius where this airborne spell began (SKY-HIGH! counts the climb from it)
    this.skyHigh = false; // whether this jump has had its SKY-HIGH!
    this.anim = 0;
    this.upSmooth = spawn.clone().normalize();
    this.impacts = [];
    this.params = { ...PHYS };
    this.trick = { flip: 0, spin: 0, active: false, tucked: false };
    this.combo = new Combo(game, this); // the style run (combo.js), shown by the style meter
    this.winchT = 0; // s on the Hitch-Line at WINCH_FAST this hitch
    this.idle = new Idle(); // breathing and idles when stopped (idles.js)

    // helmet lamp + faint suit glow; intensities follow how dark it is
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
    this.params.skateSafeImpact = PHYS.skateSafeImpact + up.dampers * 12;
    this.params.handling = PHYS.handling + (up.gyro || 0) * 0.55;
    this.body.maxEnergy = PHYS.maxEnergy + up.capacitor * 25;
    this.maxHealth = 100 + up.armor * 15 + (up.flak || 0) * 10 + (up.plating || 0) * 10 + (this.mutHealth || 0);
    this.regen = up.flak || 0; // Flak Weave: HP per 3 s tick (main.js)
    this.damageMult = 1 + up.spinner * 0.15;
    this.fireDelay = 0.55 * (1 - 0.15 * (up.overcharge || 0)) * (this.mutFire || 1);
    this.homing = 1.5 + (up.seeker || 0) * 0.7; // rad/s the disc can turn toward its target (the mortar and scattergun use a fraction)
    this.knockResist = 1 - (up.flak || 0) * 0.15;
    // Xenoglide skates: big handling boost and an antimatter jet tank
    const alien = (up.alien || 0) > 0;
    if (alien) this.params.handling += 2;
    this.params.thrustAccel = alien ? PHYS.thrustAccel * 1.5 : PHYS.thrustAccel;
    this.params.energyRegen = alien ? PHYS.energyRegen * 2 : PHYS.energyRegen;
    if (alien) this.body.maxEnergy += 50;
    // Dr. Zbornak's rewound coils (3 depot wiring, once; old saves may hold up to 3), plus the Root Grip mutation
    const gw = Math.min(1, up.gripwire || 0);
    this.params.grip = PHYS.grip * (1 + gw * 0.15 + (this.mutGrip || 0));
    this.params.handling += gw * 0.15;
  }

  // Ride the deck you stand on. Called after the world has moved it this frame (main.js), so you, the model and the camera follow
  // THIS frame's move (using last frame's lags the mesh and wobbles). The deck's turn is applied too, or a ship yawing and pitching
  // along its route would swing out from under you, worse the further out you stand.
  rideCarry() {
    const b = this.body, plat = b.platform;
    if (!plat) { this.platOn = null; return;  }
    const d = _v.subVectors(plat.pos, plat.prevPos);
    const pq = this.platQ || (this.platQ = new THREE.Quaternion());
    let rot = false;
    if (plat.quat) {
      if (this.platOn === plat) {
        _q.copy(pq).invert().premultiply(plat.quat);
        // apply however small: w = cos(angle/2) reads 1 under a milliradian, so test the vector part. Skipping tiny turns slides
        // you ~1 mm a frame, which is enough to fall off the deck
        rot = _q.w > 0.9 && Math.abs(_q.x) + Math.abs(_q.y) + Math.abs(_q.z) > 1e-13;
      }
      pq.copy(plat.quat);
      this.platOn = plat;
    } else this.platOn = null;
    const g = this.game, m = this.model.root;
    const move = (p) => { p.add(d); if (rot) p.sub(plat.pos).applyQuaternion(_q).add(plat.pos); };
    move(b.pos); move(m.position); move(this.center);
    if (rot) b.vel.applyQuaternion(_q);
    move(g.cam.position); move(g.camera.position);
  }

  respawn(pos, facing) {
    this.body.pos.copy(pos);
    this.body.vel.set(0, 0, 0);
    this.body.platform = null; // drop any deck (or satellite) you were teleported off
    this.body.velFrame = null;
    this.seat = null; // ...or ride (rides.js lets go too)
    if (this.game.grind) this.game.grind.active = null; // ...or grind rail
    upAt(pos, this.body.up);
    this.body.groundN.copy(this.body.up);
    this.body.energy = this.body.maxEnergy;
    this.health = this.maxHealth;
    this.dead = false;
    this.model.root.visible = true;
    this.upSmooth.copy(this.body.up);
    if (facing) this.heading.copy(facing);
    this.resetTrick();
    this.airBase = null;
    this.skyHigh = false;
  }

  // color2: a second crate stacked on top (the Twin Cradle)
  setCargo(color, color2 = null) {
    if (this.cargoMesh) { this.model.cargoSlot.remove(this.cargoMesh); this.cargoMesh = null; }
    if (color != null) {
      this.cargoMesh = makeCrate(color, 0.7);
      if (color2 != null) {
        const top = makeCrate(color2, 0.62);
        top.position.y = 0.55;
        top.rotation.y = 0.25;
        this.cargoMesh.add(top);
      }
      this.model.cargoSlot.add(this.cargoMesh);
    }
  }

  // reset the trick state and the model's trick pivot (nothing else)
  clearTrick() {
    const t = this.trick;
    t.flip = t.spin = 0;
    this.trickLive = null;
    t.active = t.tucked = false;
    this.model.trick.rotation.set(0, 0, 0);
    this.model.trick.position.y = 1.2;
  }

  resetTrick() {
    this.clearTrick();
    if (this.rag) { this.rag.release(); this.rag = null; }
  }

  // Wipeout or hard crash: the runner goes limp as a physics ragdoll (ragdoll.js). Pose only: momentum and controls stay.
  // sign: +1 tumbles forward, -1 back.
  startRagdoll(sign = 1) {
    if (this.rag || this.vehicle || this.dead || this.game.indoors) return; // (no tumbling inside the casino or Dr. Zbornak's lab)
    const downs = this.game.race && this.game.race.loc;
    if (downs && this.game.currentZone === downs) return;                   // (nor at Chimera Downs: a crowd, a rail, a race to watch)
    if (this.game.cheats && !this.game.cheats.ragdoll) return; // (the dev menu's RAGDOLL switch)
    this.combo.wipe(); // a crash loses the style run
    this.rag = new Ragdoll(this.game, this.model, this.body, sign);
  }

  // dev overlay laps each stage; every path out of step() ends in the 'animate' lap below
  update(dt, input, cam) {
    this.step(dt, input, cam);
    this.combo.update(dt);
    this.updateLamp(cam);
    this.game.devOverlay.lap('animate');
  }

  // helmet lamp follows your gaze every frame (skating, grinding, riding)
  updateLamp(cam) {
    const up = this.body.up;
    const head = this.model.head.getWorldPosition(_v);
    this.lamp.position.copy(head).addScaledVector(up, 0.3);
    this.lamp.target.position.copy(head).addScaledVector(cam.look, 30).addScaledVector(up, -4);
    this.glowLight.position.copy(head).addScaledVector(up, 1.5);
  }

  step(dt, input, cam) {
    const g = this.game;
    const b = this.body;
    if (this.dead) return;
    const up = b.up;

    // grinding a snake-rock crest (rails.js): the rail carries you
    const grinding = g.grind && g.grind.update(this, dt, input);
    g.devOverlay.lap('rail');
    if (grinding) {
      this.idle.cancel(this.model);
      if (this.trick.active) this.landTrick(b.airTime, true); // a clean trick onto the rail counts; a crooked one is dropped (or it would flip you on pop-off)
      const A = g.grind.active; // (null on the frame you pop off: rails.js has committed it)
      if (A) this.combo.addLive(grindLabel(A.r), Math.round(15 + A.t * 30), 'grind');
      return;
    }

    // riding (transit ship, carousel horse, gondola: rides.js): the seat carries you, no physics; the ride decides where you get off
    if (this.seat) {
      const s = this.seat;
      this.idle.cancel(this.model);
      if (this.trick.active) this.clearTrick();
      if (this.rag) { this.rag.release(); this.rag = null; } // a still-tumbling ragdoll would leave its camera focus behind (it only updates in the physics step)
      s.obj.updateMatrixWorld(true);
      const p = s.obj.localToWorld(_sp.copy(s.local));
      if (dt > 0) b.vel.copy(p).sub(b.pos).divideScalar(dt);
      if (b.vel.lengthSq() > 1e4) b.vel.set(0, 0, 0); // first frame aboard
      b.pos.copy(p);
      upAt(p, b.up);
      b.grounded = true;
      b.airTime = 0;
      if (s.face) {
        const f = s.obj.localToWorld(_sf.copy(s.local).add(s.face)).sub(p);
        f.addScaledVector(b.up, -f.dot(b.up));
        if (f.lengthSq() > 1e-6) this.heading.copy(f.normalize());
      }
      this.center.copy(b.pos).addScaledVector(b.up, 1.0);
      const m = this.model;
      m.root.visible = !s.hidden;
      m.root.position.copy(b.pos);
      frameQuat(b.up, this.heading, m.root.quaternion);
      m.legL.rotation.x = m.legR.rotation.x = -1.4;
      m.body.position.y = m.bodyBase - 0.55;
      this.upSmooth.copy(b.up);
      return;
    }

    const wish = new THREE.Vector3();
    // no tricks on the Hitch-Line
    const hitched = !!(g.winch && g.winch.on);
    if (hitched && this.trick.active) this.clearTrick();
    const trickHeld = input.down('KeyQ') && !b.grounded && b.airTime > 0.12 && !this.rag && !hitched;
    if (!trickHeld && input.padMove && input.padMove.on) {
      // controller left stick: analog
      wish.addScaledVector(cam.fwd, -input.padMove.y).addScaledVector(cam.right, input.padMove.x);
      if (wish.lengthSq() > 1) wish.normalize();
    } else if (!trickHeld) {
      if (input.down('KeyW')) wish.add(cam.fwd);
      if (input.down('KeyS')) wish.sub(cam.fwd);
      if (input.down('KeyD')) wish.add(cam.right);
      if (input.down('KeyA')) wish.sub(cam.right);
      if (wish.lengthSq() > 0) wish.normalize();
    }

    // Thrusters push mostly forward (where you aim / steer); only a little lift or dive.
    const thrustDir = (wish.lengthSq() > 0 ? wish.clone() : cam.fwd.clone());
    const tv = this.params.thrustVertical;
    // lift stays limited, but looking down lets the thrusters drive you down hard
    const pitchK = Math.sin(cam.pitch) * 0.6 + 0.06;
    thrustDir.addScaledVector(up, pitchK > 0 ? Math.min(pitchK, tv) : Math.max(pitchK * 2.2, -1.2)).normalize();

    // Trick thrust: turned in a trick, the pack pushes along the body's forward axis instead (a quarter backflip points
    // it up, a half spin is an air brake), at TRICK_THRUST power. The jet tank is the only limit on the lift.
    if (!b.grounded && this.trick.active && !this.rag) {
      const rq = this.model.root.quaternion; // last frame's pose, the one on screen
      const level = _tl.copy(_Z).applyQuaternion(rq);
      const pack = _tp.copy(_Z).applyQuaternion(this.model.trick.quaternion).applyQuaternion(rq);
      const k = Math.min(1, (1 - pack.dot(level)) * 2); // 0 upright, all the pack's way by 60° off
      if (k > 0) thrustDir.multiplyScalar(1 - k).addScaledVector(pack, k * TRICK_THRUST);
    }

    // jump presses are buffered briefly (pressed just before landing still jumps) and count within the floor buffer (stepSkater)
    const jumpKey = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    this.jumpBuf = jumpKey ? 0.15 : Math.max(0, (this.jumpBuf || 0) - dt);
    const nearFloor = b.grounded || ((b.altitude ?? 0) < (this.params.jumpBuffer ?? 1.2) && !b.jumpLock);
    const jumpNow = nearFloor && this.jumpBuf > 0;
    if (jumpNow) this.jumpBuf = 0;
    const ctrl = {
      wish,
      skates: input.down('Space'),
      // with the Rail Lance out, right mouse scopes instead of thrusting (pad L3 still thrusts)
      thrust: input.down('Thrust') || (input.mouse[2] && WEAPONS[this.weapon || 0].key !== 'rail'),
      jump: jumpNow,
      // dive: a fresh jump press while airborne, held (so the jump itself never dives)
      dive: this.diveLatch = !b.grounded && !jumpNow && (this.diveLatch || (jumpKey && b.airTime > 0.15)) && (input.down('ShiftLeft') || input.down('ShiftRight')),
      thrustDir,
    };
    // ragdolling: no skating, jets, jumping, diving or steering
    if (this.rag) {
      wish.set(0, 0, 0);
      ctrl.skates = ctrl.thrust = ctrl.jump = ctrl.dive = false;
      this.jumpBuf = 0; this.diveLatch = false;
    }

    // driving a faction vehicle: the garage does the physics, you can still shoot
    if (this.vehicle) {
      this.idle.cancel(this.model);
      g.garage.drive(dt, input, cam);
      g.devOverlay.lap('physics');
      this.center.copy(b.pos).addScaledVector(b.up, 1.3);
      this.updateWeapons(dt, input, cam);
      g.devOverlay.lap('weapons');
      const m = this.model;
      m.root.position.copy(b.pos);
      // the vehicle's own orientation (set by the garage this frame), so you don't wobble on it
      if (this.vehicle.riderQuat) m.root.quaternion.copy(this.vehicle.riderQuat);
      else frameQuat(b.up, this.heading, m.root.quaternion);
      // hands forward on the controls, leaning into the turn
      const steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
      this.steerLean = (this.steerLean || 0) + (steer - (this.steerLean || 0)) * Math.min(1, dt * 6);
      if (this.vehicle.def.bike) {
        // motorcycle crouch: low over the tank, arms to the clip-ons, leaning into the turn
        m.root.quaternion.multiply(_q.setFromAxisAngle(_Z, -this.steerLean * 0.28));
        // a Blender bike carries its own solved pose (hands on grips, legs clear of the shell): model.pose
        const bp = this.vehicle.model.pose;
        m.torso.rotation.x = bp ? bp.lean : 0.95;
        m.legL.rotation.x = m.legR.rotation.x = bp ? bp.thigh : -1.05;
        m.legL.rotation.z = bp ? -bp.spread : 0; m.legR.rotation.z = bp ? bp.spread : 0; // knees out round the tank
        m.body.position.y = m.bodyBase - 0.62;
        if (m.armL && m.armR) {
          m.armL.rotation.x = m.armR.rotation.x = bp ? bp.armX : -0.75;
          m.armL.rotation.z = bp ? -bp.armZ : -0.22; m.armR.rotation.z = bp ? bp.armZ : 0.22;
          const el = bp ? bp.elbow : -0.55, lean = bp ? 0.12 : 0.2; // elbows bend into the turn; less when hands are on solved grips
          m.foreL.rotation.x = el + lean * this.steerLean; m.foreR.rotation.x = el - lean * this.steerLean;
        }
      } else {
        m.torso.rotation.x = 0;
        m.legL.rotation.x = m.legR.rotation.x = -1.3;
        m.legL.rotation.z = m.legR.rotation.z = 0;
        m.body.position.y = m.bodyBase - 0.5;
        if (m.armL && m.armR) {
          m.armL.rotation.x = -1.15 + 0.15 * this.steerLean; m.armR.rotation.x = -1.15 - 0.15 * this.steerLean;
          m.armL.rotation.z = -0.12; m.armR.rotation.z = 0.12;
          m.foreL.rotation.x = -0.35 + 0.25 * this.steerLean; m.foreR.rotation.x = -0.35 - 0.25 * this.steerLean; // wheel hand pulls in
        }
      }
      this.upSmooth.copy(b.up);
      return;
    }

    // ragdolling: ragdoll.js carries your body until it rests; no skater physics
    if (this.rag) {
      if (this.trick.active) this.clearTrick(); // updateTricks doesn't run here
      b.jumped = false;
      // the tank still refills (stepSkater's regen doesn't run here) and unlocks the jets on the same terms
      b.thrusting = false;
      b.energy = Math.min(b.maxEnergy, b.energy + this.params.energyRegen * dt);
      if (b.jetLocked && b.energy >= b.maxEnergy * 0.25) b.jetLocked = false;
      g.devOverlay.lap('physics');
      this.updateWeapons(dt, input, cam);
      g.devOverlay.lap('weapons');
      this.center.copy(b.pos).addScaledVector(b.up, 1.3);
      this.animate(dt, cam, ctrl);
      g.devOverlay.lap('animate');
      if (this.rag) this.rag.sync(dt);
      g.devOverlay.lap('ragdoll');
      return;
    }

    const wasGrounded = b.grounded;
    const airBefore = b.airTime;
    b.jumped = false;
    // deck carry and turn happen in rideCarry, after the world moves it
    const plat = b.platform;
    this.prevVel = (this.prevVel || new THREE.Vector3()).copy(b.vel);
    if (plat) this.prevVel.add(plat.vel);
    // Quantum Slipstream Vanes (a timed power): some ground handling in the air
    const vanes = !!(g.story && g.story.vanesActive());
    this.params.airHandling = vanes ? 0.42 : 0;
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    // dev menu speed multiplier: scales every push and the survivable landing speeds
    const sm = g.cheats ? g.cheats.speed : 1;
    const pr = sm > 1 ? { ...this.params } : this.params;
    if (sm > 1) for (const k of ['runSpeed', 'runAccel', 'brakeDecel', 'skatePush', 'skatePushMax', 'airControl', 'thrustAccel', 'skateSafeImpact', 'bootSafeImpact']) pr[k] *= sm;
    let landed = false;
    for (let i = 0; i < steps; i++) {
      const before = b.grounded;
      const imp = stepSkater(b, ctrl, h, g.planet, g.colliders, pr, this.impacts);
      // velocities on a deck are relative to it: convert per substep when stepping on, off or across (b.velFrame is the deck b.vel
      // is in; stepSkater meets other decks at their closing speed). Converting at frame end bounced riders off descending ships.
      if (b.platform !== (b.velFrame || null)) {
        if (b.velFrame) b.vel.add(b.velFrame.vel);
        if (b.platform) b.vel.sub(b.platform.vel);
        b.velFrame = b.platform || null;
      }
      if (!before && b.grounded) landed = true;
      for (const it of imp) this.onImpact(it, ctrl.skates);
      ctrl.jump = false;
    }
    g.devOverlay.lap('physics');
    // Hitch-Line at speed: style builds while hitched at WINCH_FAST or more, committed when you let go
    const winchLabel = () => `HITCH-LINE ${this.winchT.toFixed(1)}s`;
    if (hitched) {
      if (this.speed >= WINCH_FAST) this.winchT += dt;
      if (this.winchT > 0) this.combo.addLive(winchLabel(), Math.round(this.winchT * WINCH_RATE), 'winch');
    } else if (this.winchT > 0) {
      this.combo.add(winchLabel(), Math.round(this.winchT * WINCH_RATE), 'winch');
      this.winchT = 0;
    }
    if (b.jumped) { g.audio.jump(); g.haptics.play('jump'); g.fx.dust(b.pos, b.vel, 6, up); }
    // Vanes active: teal and violet sparks off the skates
    this.vaneCarve = vanes && !b.grounded ? b.airCarve || 0 : 0;
    if (this.vaneCarve) {
      const k = Math.abs(this.vaneCarve);
      g.fx.spawn(b.pos.clone().addScaledVector(up, 0.15), b.vel.clone().multiplyScalar(0.25), { color: Math.random() < 0.5 ? 0x7dffd4 : 0xc77dff, size: 0.16 + 0.12 * k, life: 0.45, count: 2, spread: 1.4, drag: 3 });
      this.vaneT = (this.vaneT || 0) - dt;
      if (this.vaneT <= 0) {
        this.vaneT = 0.085;
        this.vaneN = ((this.vaneN || 0) + 1) % 4;
        // arpeggio climbing while you hold the carve
        g.audio.tone([880, 1175, 1480, 1760][this.vaneN] * (0.9 + 0.2 * k), 0.12, 'triangle', 0.035 + 0.03 * k, 1.12);
      }
    } else this.vaneN = 0;
    if (b.bounced > 6) {
      g.fx.pop(b.bounced > 25 ? 'BOOOING!' : 'BOING!', null, { color: '#ff7ad9', size: 40 + Math.min(40, b.bounced), prio: 1 });
      g.audio.tone(220 + b.bounced * 8, 0.3, 'sine', 0.2, 2);
      if (b.bounced > 20) g.style(Math.round(b.bounced / 2), null);
    }
    b.bounced = 0;
    // just stepped onto a deck
    if (!plat && b.platform) g.fx.pop('ALL ABOARD!', null, { color: '#2ee6ff', size: 44, life: 1, prio: 1 });
    // world-space acceleration (for sloshing fluids)
    const worldVel = _v.copy(b.vel);
    if (b.platform) worldVel.add(b.platform.vel);
    this.accel = (this.accel || new THREE.Vector3()).subVectors(worldVel, this.prevVel).divideScalar(Math.max(dt, 1e-3));

    this.updateTricks(dt, input, trickHeld, landed && !wasGrounded ? airBefore : -1);

    if (b.diveLanded) {
      g.fx.dust(b.pos, b.vel, 14, up);
      if (b.diveLanded > 20) this.combo.add('DIVE LANDING', Math.round(b.diveLanded / 3), 'dive', true);
      b.diveLanded = 0;
    }
    if (!wasGrounded && b.grounded && airBefore > 1.8 && !this.trickLanding) this.combo.add(airLabel(airBefore), Math.round(airBefore * 15), 'air', true);
    this.trickLanding = false;
    if (wasGrounded && !b.grounded && this.speed > 40 && b.vel.dot(up) > 6) this.launchCheck = 0.6;
    if (this.launchCheck > 0) {
      this.launchCheck -= dt;
      if (this.launchCheck <= 0 && !b.grounded && b.vel.dot(up) > 0) {
        g.fx.pop('LAUNCH!', null, { color: '#2ee6ff', size: 72, prio: 1 });
      }
    }
    // SKY-HIGH!: a jump climbed SKY_HIGH_GAIN m above its start (not falling off a cliff or a ride)
    if (b.grounded) { this.airBase = null; this.skyHigh = false; }
    else {
      this.airBase ??= b.pos.length(); // not b.altitude: height over ground jumps when the ground drops away at a rim or cliff
      if (!this.skyHigh && b.pos.length() - this.airBase >= SKY_HIGH_GAIN && b.vel.dot(up) > 0) {
        this.skyHigh = true;
        g.fx.pop('SKY-HIGH!', null, { color: '#2ee6ff', size: 72, prio: 1 });
      }
    }

    const kmh = this.speed * 3.6;
    SPEED_MARKS.forEach((m, i) => {
      if (!this.speedMarks[i] && kmh > m.kmh) {
        this.speedMarks[i] = true;
        g.fx.pop(m.text, null, { color: i > 1 ? '#ff2e88' : '#ffd23f', size: 60 + i * 12, prio: 1 });
        g.style(10 + i * 10, null);
      } else if (this.speedMarks[i] && kmh < m.kmh - 60) this.speedMarks[i] = false;
    });

    g.devOverlay.lap('tricks');
    this.updateWeapons(dt, input, cam);
    g.devOverlay.lap('weapons');

    if (b.onLake && b.grounded && !b.skating) b.vel.multiplyScalar(1 - Math.min(1, 2.5 * dt)); // wading
    if (b.onLake && b.grounded && this.speed > 8 && Math.random() < dt * 20) g.fx.spawn(b.pos, up.clone().multiplyScalar(3), { color: 0x2a1f4f, size: 0.4, life: 0.6, gravity: 2, count: 2, spread: 3 });
    if (b.grounded && b.skating && this.speed > 25 && Math.random() < dt * 30) {
      g.fx.dust(b.pos, b.vel.clone().multiplyScalar(-0.2), 1, up, 0xe8e2d8);
    }
    if (b.thrusting && Math.random() < dt * 40) {
      const back = this.model.cargoSlot.getWorldPosition(new THREE.Vector3());
      g.fx.spawn(back, thrustDir.clone().normalize().multiplyScalar(-12).add(b.vel), { color: (g.upgrades.alien ? [0x7dffd4, 0xc77dff] : [0x2ee6ff, 0xffffff])[Math.random() < 0.5 ? 0 : 1], size: g.upgrades.alien ? 0.5 : 0.35, life: 0.35, spread: 2 });
    }

    this.center.copy(b.pos).addScaledVector(up, 1.3);
    this.animate(dt, cam, ctrl);
  }

  // weapons: 1-4 to switch, left mouse to fire
  updateWeapons(dt, input, cam) {
    const g = this.game;
    const b = this.body;
    const up = b.up;
    // APC (vehicles.js): its turret replaces your weapons while driving
    if (this.vehicle && this.vehicle.def.turret) {
      if (this.scoped) { this.scoped = false; g.audio.tone(800, 0.06, 'square', 0.06); }
      g.garage.turretFire(dt, input);
      return;
    }
    const wasScoped = this.scoped;
    // no scope or shooting while ragdolled
    this.scoped = WEAPONS[this.weapon || 0].key === 'rail' && input.mouse[2] && input.locked && !this.dead && !this.rag;
    if (this.scoped !== wasScoped) g.audio.tone(this.scoped ? 1200 : 800, 0.06, 'square', 0.06);
    for (let i = 0; i < WEAPONS.length; i++) {
      if (!input.pressed('Digit' + (i + 1))) continue;
      if (weaponUnlocked(WEAPONS[i], g.upgrades)) { this.weapon = i; g.hud.toast(WEAPONS[i].name.toUpperCase(), 1.2); }
      else g.hud.toast(`${WEAPONS[i].name} — not unlocked yet`, 1.5);
    }
    const w = WEAPONS[this.weapon || 0];
    this.fireCd -= dt;
    if (input.mouse[0] && this.fireCd <= 0 && input.locked && !this.rag) {
      this.fireCd = w.delay * (1 - 0.15 * (g.upgrades.overcharge || 0)) * (this.mutFire || 1);
      const muzzle = this.center.clone().addScaledVector(cam.right, 0.5).addScaledVector(up, 0.3);
      const aim = cam.position.clone().addScaledVector(cam.look, 350);
      const dir = aim.sub(muzzle).normalize();
      fireWeapon(g, w, muzzle, dir, b.vel, this.damageMult || 1, this.homing || 1.5);
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
      // tuck while the trick button is held, then until the model levels out (flip/spin never return to exactly 0)
      const lf = Math.abs(t.flip - Math.round(t.flip / TAU) * TAU), ls = Math.abs(t.spin - Math.round(t.spin / TAU) * TAU);
      t.tucked = t.active && (held || lf > 0.2 || ls > 0.2);
      this.model.trick.rotation.set(t.flip, t.spin, 0, 'YXZ');
    }
    // the style meter reads trickLive every frame (null: no trick going); the air so far goes in as live moves
    this.trickLive = t.active && !b.grounded ? trickScore(t, b.airTime) : null;
    if (this.trickLive && this.trickLive.parts.length) for (const m of trickMoves(this.trickLive, b.airTime)) this.combo.addLive(...m);
    else if (!b.grounded && b.airTime > 1.8) this.combo.addLive(airLabel(b.airTime), Math.round(b.airTime * 15), 'air');
    if (landedAfter >= 0 && t.active) this.landTrick(landedAfter, false);
    else if (b.grounded) {
      // grounded with a trick still active (a landing updateTricks missed): nothing to score
      if (t.active || t.flip || t.spin) this.clearTrick();
      else this.model.trick.rotation.set(0, 0, 0);
    }
  }

  // A trick ends, on the ground (air: its air time) or on a rail. Clean, its moves join the combo; crooked on the ground
  // it's a wipeout and the combo is lost; crooked onto a rail, it's just dropped.
  landTrick(air, rail) {
    const t = this.trick, b = this.body, g = this.game;
    const sc = trickScore(t, air);
    let wiped = false;
    if (sc.clean && sc.parts.length) {
      for (const m of trickMoves(sc, air)) this.combo.add(...m, true);
      g.haptics.play('stick');
      this.trickLanding = true;
    } else if (!sc.clean && !rail) {
      this.combo.wipe();
      g.damagePlayer(8, 'impact');
      b.vel.multiplyScalar(0.55);
      g.missions.jostle(18, true);
      g.audio.thud(30);
      g.haptics.play('wipeout');
      this.trickLanding = true;
      wiped = true;
    }
    const ragFlip = t.flip;
    this.resetTrick();
    if (wiped) this.startRagdoll(ragFlip < 0 ? -1 : 1);
  }

  onImpact(it, skates) {
    const g = this.game;
    let safe = (g.alchemy && g.alchemy.buffs.cushion > 0) ? 1e9 : skates ? this.params.skateSafeImpact * (g.cheats ? g.cheats.speed : 1) : this.params.bootSafeImpact * (g.cheats ? g.cheats.speed : 1);
    if (g.winch && g.winch.on) safe += 14; // the winch's pull is controlled: hitting a wall at its pace is a bump, not a crash
    if (it.speed > 6) { g.audio.thud(it.speed); g.haptics.land(it.speed); }
    if (it.speed > 4 && this.model.halo) this.model.halo.kick(Math.min(1, it.speed / 25)); // a bump rings the halo
    if (g.alchemy && g.alchemy.buffs.bouncy > 0 && it.kind === 'ground' && it.speed > 5) {
      this.body.bounceReady = Math.max(this.body.bounceReady || 0, it.speed);
      g.fx.pop('BOING!', null, { color: '#ff7ad9', size: 44, prio: 1 });
      return;
    }
    if (it.speed > safe) {
      // soft-capped: damage rises with m/s over the safe speed but tops out at half max health, so one landing can't kill.
      // Speed along the ground makes it glancing (30 m/s of glide halves it). impactDamage (1.3) is the tuning knob.
      const glancing = it.kind === 'ground' ? 1 / (1 + (it.glide || 0) / 30) : 1;
      const dmg = 0.5 * this.maxHealth * (1 - Math.exp(-(it.speed - safe) / 60)) * (this.params.impactDamage / 1.3) * glancing;
      g.damagePlayer(dmg, 'impact');
      g.fx.pop(it.speed - safe > 12 ? 'KRA-KOOM!' : 'KRAK!', this.body.pos.clone().addScaledVector(this.up, 2), { color: '#ff4f2e', size: 54, prio: 1 });
      g.fx.dust(this.body.pos, this.body.vel, 14, this.up);
      this.startRagdoll(it.kind === 'ground' ? 1 : -1); // a wall throws you back-first
    } else if (it.speed > 9) {
      g.fx.dust(this.body.pos, this.body.vel, 5, this.up);
    }
    if (it.speed > 14) g.missions.jostle(it.speed - 14, skates);
    if (it.speed > 6) { g.events.onImpact(it.speed); g.story.onImpact(it.speed); }
  }

  // physics scarf: hangs at rest, streams with speed, drapes over whatever is on your back
  updateScarf(dt) {
    const b = this.body;
    if (!this.scarfSim) this.scarfSim = new ScarfSim(this.model);
    // crates on your back (two with the Twin Cradle) for the scarf to drape over
    const cargo = this.cargoMesh ? (this.cargoMesh.children.length > 3 ? 2 : 1) : 0;
    this.scarfSim.update(dt, this.vehicle ? this.vehicle.e.body.vel : b.vel, b.up, { cargo });
  }

  // Rest pose: upright, limbs level, no bob or roll, scarf hanging. animate() only runs in play, so cutscenes that take over
  // (recall shuttle, Spindle med-evac) call this first, or you'd stay frozen mid-pose.
  restPose() {
    const m = this.model;
    this.idle.cancel(m);
    m.torso.rotation.set(0, 0, 0);
    m.legL.rotation.set(0, 0, 0); m.legR.rotation.set(0, 0, 0);
    m.foreL.rotation.set(0, 0, 0); m.foreR.rotation.set(0, 0, 0);
    m.armL.rotation.set(0, 0, -0.15); m.armR.rotation.set(0, 0, 0.15); // arms slightly out, as animate's idle pose
    m.body.position.y = m.bodyBase;
    this.roll = 0;
    this.steerLean = 0;
    this.anim = 0;
    this.clearTrick();
    if (!this.scarfSim) this.scarfSim = new ScarfSim(m);
    this.scarfSim.settle();
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
    this.idle.begin(m); // clear last frame's idle: the poses below only set the angles they use
    m.legL.rotation.z = m.legR.rotation.z = 0; // drop a bike's knees-out spread
    if (!b.grounded && ctrl && ctrl.dive) {
      // dive: tuck, lean hard forward, arms swept back
      m.torso.rotation.x = 0.85;
      m.legL.rotation.x = m.legR.rotation.x = -0.35;
      m.armL.rotation.x = m.armR.rotation.x = 0.9;
      m.armL.rotation.z = -0.25; m.armR.rotation.z = 0.25;
      m.foreL.rotation.x = m.foreR.rotation.x = -0.2; // hands streamlined, slight bend
      if (Math.random() < dt * 20) this.game.fx.spawn(b.pos.clone().addScaledVector(up, 1.2), b.vel.clone().multiplyScalar(-0.2), { color: 0x9be7ff, size: 0.3, life: 0.3, count: 1, spread: 0.6 });
    } else if (!b.grounded) {
      m.torso.rotation.x = 0.15;
      m.legL.rotation.x = -0.5; m.legR.rotation.x = 0.3;
      m.armL.rotation.z = -1.1; m.armR.rotation.z = 1.1;
      m.armL.rotation.x = m.armR.rotation.x = 0;
      m.foreL.rotation.x = m.foreR.rotation.x = -0.35 + 0.1 * Math.sin(this.anim * 0.5); // loose elbows, balancing
      m.body.position.y = base;
      if (this.trick.tucked) { m.legL.rotation.x = m.legR.rotation.x = -1.2; m.torso.rotation.x = 0.6; }
    } else if (b.skating) {
      const crouch = Math.min(1, sp / 40);
      m.body.position.y = base - 0.18 * crouch;
      m.torso.rotation.x = 0.25 + 0.35 * crouch;
      m.legL.rotation.x = 0.35 * crouch; m.legR.rotation.x = -0.35 * crouch;
      m.armL.rotation.x = m.armR.rotation.x = -0.9 * crouch;
      m.armL.rotation.z = -0.3; m.armR.rotation.z = 0.3;
      // elbows bent, hands forward; in a turn the inside arm tucks, the outside reaches
      const bank = THREE.MathUtils.clamp(this.roll / 0.5, -1, 1);
      // at full crouch the hands are already forward, so the bend halves (0.85 -> 0.43)
      const bend = (0.3 + 0.55 * crouch) * (1 - 0.5 * crouch);
      m.foreL.rotation.x = -bend + 0.25 * bank * (1 - 0.5 * crouch);
      m.foreR.rotation.x = -bend - 0.25 * bank * (1 - 0.5 * crouch);
    } else {
      const run = Math.min(1, sp / 6);
      m.body.position.y = base + Math.abs(s) * 0.12 * run;
      m.torso.rotation.x = 0.1 * run;
      m.legL.rotation.x = s * 0.9 * run; m.legR.rotation.x = -s * 0.9 * run;
      m.armL.rotation.x = -s * 0.8 * run; m.armR.rotation.x = s * 0.8 * run;
      m.armL.rotation.z = -0.15; m.armR.rotation.z = 0.15;
      // elbows pump, most bent as the hand comes forward
      m.foreL.rotation.x = -run * (0.45 + 0.55 * Math.max(0, s)); m.foreR.rotation.x = -run * (0.45 + 0.55 * Math.max(0, -s));
    }
    // stopped: breathing and occasional idles (idles.js) over the rest pose
    this.idle.apply(m, dt, b.grounded && !b.skating && !this.rag && !!ctrl && ctrl.wish.lengthSq() === 0, sp, !b.grounded || !!this.rag);
    if (this.rag) {
      this.game.devOverlay.lap('animate');
      if (!this.rag.update(dt)) { this.rag.release(); this.rag = null; }
      this.game.devOverlay.lap('ragdoll');
    }
    this.updateScarf(dt);
    updateHalo(m, dt);

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(m.root.quaternion);
    const strength = b.skating && b.grounded ? Math.min(1, sp / 30) : this.vaneCarve ? 0.55 + 0.45 * Math.abs(this.vaneCarve) : 0; // the Vanes leave ribbons in the air
    const g = this.game;
    // lift onto the visible mesh (e.g. the Spindle's rock stands above the skate height in a hollow)
    const foot = b.pos.clone().addScaledVector(up, g.planet.meshLift ? g.planet.meshLift(b.pos) : 0);
    g.fx.updateTrail(0, foot.clone().addScaledVector(right, -0.2), right, strength, up, dt);
    g.fx.updateTrail(1, foot.clone().addScaledVector(right, 0.2), right, strength, up, dt);
  }
}
