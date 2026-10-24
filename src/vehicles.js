import * as THREE from 'three';
import { makeRover, makeInterceptor, makeApc, makeSkimmer, makeLightBike, LightTrail } from './models.js';
import { fireCannon } from './weapons.js';
import { makeBody } from './physics.js';
import { stepRover, CRASH_SAFE } from './enemies.js';
import { frameQuat, tangent } from './geo.js';
import { toon, glow, ink } from './toon.js';
import { glyphHtml } from './glyphs.js';

// Faction vehicles unlocked through the story. V calls yours in (or hops out).
export const VEHICLES = {
  interceptor: { hp: 220, name: 'SPACECOM Lunar Interceptor', faction: 'spacecom', max: 88, engine: 38, turn: 2.6, grip: 12, armor: 0.75, color: 0xfff4e0, trim: 0xffd23f, desc: 'Fast, nimble, lightly armoured.' },
  apc: { hp: 480, name: 'Vostok BTR-M Moon APC', faction: 'vostok', max: 62, engine: 24, turn: 1.9, grip: 18, armor: 0.4, color: 0x6b6f78, trim: 0xff3b5c, scale: 1.35, hideRider: true, turret: true, desc: 'Slow tank of a thing. Shrugs off fire. The turret follows where you look and fires on left mouse.' },
  skimmer: { hp: 180, name: 'Daedalus Phase Skimmer', faction: 'daedalus', max: 100, engine: 34, turn: 2.2, grip: 4, armor: 0.85, color: 0x1a1426, trim: 0xc77dff, hover: true, desc: 'Hovers. Drifts. Terrifyingly fast.' },
  mule: { hp: 300, name: 'Kepler Homestead Mule', faction: 'kepler', max: 58, engine: 26, turn: 2.2, grip: 16, armor: 0.6, color: 0x6a8f3a, trim: 0xff9f1c, scale: 1.2, cargoSafe: true, desc: 'Hauler. Cargo rides in a padded bed and takes no jostle damage.' },
  // sold at Kepler Civic Center after the Council's Militia Pact: APC hull and cannon, militia paint, the Mule's padded bed
  carrier: { hp: 380, name: 'Kepler Militia Carrier', faction: 'kepler', max: 66, engine: 28, turn: 2.1, grip: 18, armor: 0.5, color: 0x5c8a2e, trim: 0xff9f1c, scale: 1.15, hideRider: true, turret: true, apcHull: true, cargoSafe: true, cannon: 'Militia 30 mm Cannon', desc: 'The Mule\'s big brother: a padded cargo bay, field armour and a turret cannon that follows where you look.' },
  // a light-bike; id 'van' kept for existing saves
  van: { hp: 190, name: 'Meridian Courier Light-Bike', faction: 'meridian', max: 96, engine: 34, turn: 2.7, grip: 10, armor: 0.8, color: 0x2ec4ff, trim: 0xffd23f, bike: true, seat: 1.42, seatZ: -0.88, radius: 2.1, desc: 'A sleek light-bike that leaves a glowing trail. Fast, sharp, and very stylish.' },
  warrig: { hp: 340, name: 'Rustmoon Scrapjaw War-Rig', faction: 'rustmoon', max: 78, engine: 32, turn: 2.4, grip: 14, armor: 0.6, color: 0x7b2ff7, trim: 0x7dff3a, scale: 1.35, pirate: true, desc: 'Stolen, welded, painted green. Rams for damage.' },
};

const _v = new THREE.Vector3(), _mu = new THREE.Vector3(), _mf = new THREE.Vector3();
const _ap = new THREE.Vector3(), _am = new THREE.Vector3(), _ad = new THREE.Vector3(), _aq = new THREE.Quaternion();
const _ex = new THREE.Vector3(), _exv = new THREE.Vector3();
const RIDE_LIFT = 0.2; // m wheeled vehicles ride above the physics ground (tyres and outlines reach below the origin and sank on slopes)
const REBUILD = 90; // s for the orbital crane to replace a wreck
const TURRET_YAW_RATE = 2.6; // rad/s turret swing
const TURRET_PITCH_RATE = 1.7; // rad/s barrel elevation
const TURRET_DOWN = -0.12, TURRET_UP = 0.75; // barrel travel (rad): slight depression, ~43 degrees up
const AIM_RANGE = 300; // m along the aim ray for the turret's convergence point
const SUMMON_MAX_SPEED = 2; // m/s: fastest you can move and still call a vehicle

// A faction vehicle's model as the Garage drives it (minus the light-bike's trail, which needs the live scene). Pure: the
// Asset Row uses it too.
export function buildVehicleModel(id) {
  const def = VEHICLES[id];
  let m;
  if (id === 'interceptor') {
    // own pursuit-car model, with its own seat
    m = makeInterceptor({ color: def.color, trim: def.trim });
    return m;
  }
  if (id === 'skimmer') {
    // own hover-racer model, with its own seat
    m = makeSkimmer({ color: def.color, trim: def.trim });
    return m;
  }
  if (id === 'apc' || def.apcHull) {
    m = makeApc({ color: def.color, trim: def.trim });
    m.root.scale.setScalar(def.scale);
    return m; // no seat-back: the runner is inside
  }
  if (def.bike) {
    m = makeLightBike({ color: def.color, trim: def.trim });
    return m; // no seat-back: ridden like a motorcycle
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
  // seat-back for the driver (the civil buggy has its own bench)
  if (m.ownSeat) return m;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.3), toon(0x221d33));
  ink(seat, 0.04);
  seat.position.set(0, 2.4, -0.6);
  if (!def.hideRider) m.root.add(seat);
  return m;
}

export class Garage {
  constructor(game) {
    this.game = game;
    this.active = null; // { id, def, e, model }
    this.choice = null;
    this.hp = {}; // hull per vehicle (slowly repairs while not driven)
    this.wreckedUntil = {}; // id -> game time it's rebuilt
    // while driving, two rows replace the HULL and JET bars: the vehicle's name, then its HP bar
    this.hullRow = document.getElementById('hp-fill').closest('.bar');
    this.jetRow = document.getElementById('en-fill').closest('.bar');
    this.nameRow = document.createElement('div');
    this.nameRow.className = 'bar veh-row hidden';
    this.nameRow.innerHTML = '<label class="veh-name"></label>';
    this.hpRow = document.createElement('div');
    this.hpRow.className = 'bar veh-row veh-hp hidden';
    this.hpRow.innerHTML = '<label>HP:</label><div class="track"><div class="fill vb-fill"></div></div><span class="vb-num"></span>';
    this.jetRow.after(this.nameRow, this.hpRow);
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
    // hits burst on the hull: a puff for a scrape, a fireball for a hard one
    if (amount >= 4 && (v.boomT || 0) < g.time) {
      v.boomT = g.time + 0.3;
      const pos = v.model.root.position.clone().addScaledVector(v.e.body.pos.clone().normalize(), 1.5);
      g.fx.explosion(pos, Math.min(6, 1.5 + amount * 0.06), amount > 40);
      g.audio.boom(amount > 40);
    }
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
    if (v.model.trail) v.model.trail.dispose();
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
    const m = buildVehicleModel(id);
    const def = VEHICLES[id];
    if (def.bike) m.trail = new LightTrail(this.game.scene, def.color);
    return m;
  }

  // V: summon / board / leave
  toggle() {
    const g = this.game;
    const P = g.player;
    if (P.rag) return; // not while ragdolled
    if (g.winch.on) return; // not on the Hitch-Line
    if (P.vehicle) { this.exit(); return; }
    const owned = this.owned();
    if (!owned.length) { g.hud.toast('No vehicles yet. Faction leaders hand them out as you rise in their story.', 3); return; }
    // a tap calls the last pick (hold V for the radial picker)
    let id = this.choice && owned.includes(this.choice) ? this.choice : owned[0];
    if (this.cooldown(id) > 0) {
      const alt = owned.find((k) => this.cooldown(k) <= 0);
      if (!alt) { g.hud.toast(`${VEHICLES[id].name} is being rebuilt: ready in ${Math.ceil(this.cooldown(id))}s.`, 2.5); return; }
      g.hud.toast(`${VEHICLES[id].name} is being rebuilt: calling the ${VEHICLES[alt].name}. (Hold V to choose.)`, 2.5);
      id = alt;
    }
    // parked nearby: hop in; otherwise drop it next to you
    if (this.active && this.active.id === id && this.active.e.body.pos.distanceTo(P.pos) < 12) { this.enter(); return; }
    if (!this.canSummon()) return;
    this.summon(id);
    this.enter();
  }

  // a drop needs you grounded and nearly still (boarding a parked one doesn't)
  canSummon() {
    const P = this.game.player;
    if (!P.body.grounded) { this.game.hud.toast("Can't call a vehicle while airborne.", 2); return false; }
    if (P.speed > SUMMON_MAX_SPEED) { this.game.hud.toast(`Slow down to call a vehicle (under ${SUMMON_MAX_SPEED} m/s).`, 2); return false; }
    return true;
  }

  // ---- vehicle wheel (same wheel as the controller menu: gamepad.js) ----
  // Hold V, move the mouse (or right stick) to a vehicle, release V to call it. Opened from the controller wheel it is
  // sticky: right stick picks, A calls, B cancels.
  openRadial(sticky = false) {
    const owned = this.owned();
    if (!owned.length || this.game.player.rag) return;
    if (!this.radialEl) {
      this.radialEl = document.createElement('div');
      this.radialEl.id = 'vradial';
      document.getElementById('hud').appendChild(this.radialEl);
    }
    this.radial = { ax: 0, ay: 0, sel: -1, items: owned, sticky, hub: '' };
    const n = owned.length;
    this.radialEl.innerHTML = '<div class="pr-ring"></div><div class="pr-hub"></div>' + owned.map((k, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const cd = this.cooldown(k);
      const hull = `${Math.ceil(this.hp[k] ?? this.maxHp(k))}/${this.maxHp(k)}`;
      return `<div class="pr-item${cd > 0 ? ' locked cd' : ''}" data-i="${i}" style="left:${50 + Math.cos(a) * 38}%;top:${50 + Math.sin(a) * 38}%">` +
        `<b>${VEHICLES[k].name}</b><small>${cd > 0 ? `REBUILDING ${Math.ceil(cd)}s` : `HULL ${hull}`}</small></div>`;
    }).join('');
    this.radialEl.classList.remove('hidden');
    this.radialHub();
    this.game.audio.tone(520, 0.08, 'triangle', 0.12);
  }

  // wheel hub: the picked vehicle (or the title) and button hints
  radialHub() {
    const R = this.radial;
    if (!R) return;
    const pad = this.game.input.padActive;
    const k = R.sel >= 0 ? R.items[R.sel] : null;
    const hint = pad
      ? `<span>${glyphHtml(['RS'])} pick</span><span>${R.sticky ? glyphHtml(['A']) + ' call' : 'release ' + glyphHtml(['Y']) + ' call'}</span><span>${glyphHtml(['B'])} cancel</span>`
      : '<span>move to pick</span><span>release V to call</span>';
    const hub = `<b>${k ? VEHICLES[k].name : 'VEHICLES'}</b><small>${hint}</small>`;
    if (R.hub !== hub) { R.hub = hub; this.radialEl.querySelector('.pr-hub').innerHTML = hub; }
  }

  // live labels while the wheel is up (rebuilds, hull mending, pad switching)
  radialRefresh() {
    const R = this.radial;
    if (!R) return;
    const els = this.radialEl.querySelectorAll('.pr-item');
    R.items.forEach((k, i) => {
      const el = els[i];
      if (!el) return;
      const cd = this.cooldown(k);
      const txt = cd > 0 ? `REBUILDING ${Math.ceil(cd)}s` : `HULL ${Math.ceil(this.hp[k] ?? this.maxHp(k))}/${this.maxHp(k)}`;
      el.classList.toggle('locked', cd > 0);
      el.classList.toggle('cd', cd > 0);
      const s = el.querySelector('small');
      if (s && s.textContent !== txt) s.textContent = txt;
    });
    this.radialHub();
  }

  // highlight: -1 for none
  radialSelect(sel) {
    const R = this.radial;
    if (!R || sel === R.sel) return;
    R.sel = sel;
    for (const el of this.radialEl.querySelectorAll('.pr-item')) el.classList.toggle('on', +el.dataset.i === sel);
    const au = this.game.audio;
    if (sel >= 0 && au && au.tone) au.tone(700 + sel * 40, 0.04, 'square', 0.04);
    this.radialHub();
  }

  // mouse movement while V is held, every frame the wheel is up. A still mouse must leave the pick alone (or it wipes
  // the right stick's). With a pad active the mouse is ignored (a captured-pointer bump would clear the pick).
  radialMove(dx, dy) {
    const R = this.radial;
    if (!R || (!dx && !dy) || this.game.input.padActive) return;
    R.ax += dx; R.ay += dy;
    const len = Math.hypot(R.ax, R.ay);
    if (len > 140) { R.ax *= 140 / len; R.ay *= 140 / len; }
    if (len > 28) this.radialSelect(this.wedge(Math.atan2(R.ay, R.ax) + Math.PI / 2));
    else this.radialSelect(-1);
  }

  // right stick picks a wedge; the pick stays until you push to another
  radialStick(rx, ry) {
    if (!this.radial || Math.hypot(rx, ry) <= 0.55) return;
    this.radialSelect(this.wedge(Math.atan2(rx, -ry)));
  }

  // wedge at an angle (0 at the top, clockwise)
  wedge(a) {
    const n = this.radial.items.length;
    return ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
  }

  closeRadial(commit) {
    const g = this.game;
    const R = this.radial;
    this.radial = null;
    if (this.radialEl) this.radialEl.classList.add('hidden');
    if (!commit || !R || R.sel < 0) return;
    const k = R.items[R.sel];
    if (g.rides.ride || g.player.dead || g.player.vehicle || g.winch.on) return; // a ride started, or you died or boarded something meanwhile
    if (this.cooldown(k) > 0) { g.hud.toast(`${VEHICLES[k].name} is being rebuilt: ready in ${Math.ceil(this.cooldown(k))}s.`, 2.5); return; }
    this.choice = k;
    if (this.active && this.active.id === k && this.active.e.body.pos.distanceTo(g.player.pos) < 12) { this.enter(); return; }
    if (!this.canSummon()) return;
    this.summon(k);
    this.enter();
  }

  // at / face: drop it there, nose along `face` (the town's motor pool); default beside you, facing your view
  summon(id, at = null, face = null) {
    const g = this.game;
    const P = g.player;
    if (this.active) { this.active.model.root.removeFromParent(); if (this.active.model.trail) this.active.model.trail.dispose(); }
    const def = VEHICLES[id];
    const model = this.build(id);
    const pos = g.planet.ground(at ? at.clone() : P.pos.clone().addScaledVector(g.cam.right, 5), new THREE.Vector3(), 0.5);
    const e = { body: makeBody(pos), heading: tangent((face || g.cam.fwd).clone(), pos.clone().normalize()).normalize() };
    model.root.position.copy(pos).addScaledVector(pos.clone().normalize(), def.hover ? 0.35 : RIDE_LIFT);
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
    // controls hint, as pad glyphs when a pad is in use
    const name = this.active.def.name.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    g.hud.toast(g.input.padActive
      ? `${name}: ${glyphHtml(['LS'])} drive / steer · ${glyphHtml(['A'])} hop · ${glyphHtml(['Y'])} get out`
      : `${name}: W/S drive · A/D steer · SHIFT hop · V to get out`, 3.5, g.input.padActive);
    if (this.active.def.turret) g.hud.toast(g.input.padActive
      ? `The turret follows where you look: ${glyphHtml(['RT'])} fires the cannon`
      : 'The turret follows where you look: left mouse fires the cannon', 3.5, g.input.padActive);
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

  // Replaces skater physics in Player.update while driving.
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
    // planted: wheeled ones get downforce and sideways bite, all stay glued over crests and bumps (only a real ramp at
    // speed throws them); hover ones keep some drift
    const tune = def.hover
      ? { grip: Math.max(def.grip, 10), stick: 70, traction: 7 }
      : { grip: Math.max(def.grip * 1.6, 24), stick: 55, traction: 15 };
    const crash = { speed: 0 };
    for (let i = 0; i < steps; i++) stepRover(e, dt / steps, g.planet, g.colliders, target, max, { engine: fwdIn || back ? def.engine : 0, turn: def.turn, radius: def.radius || 3.2 * (def.scale || 1), weight: def.hover ? 1.5 : 1.7, solidPlatforms: true, crash, ...tune });
    // hard hits on walls, buildings or traffic damage the vehicle (hit())
    if (crash.speed > CRASH_SAFE && (this.crashT || 0) < g.time) {
      this.crashT = g.time + 0.4;
      g.audio.thud(crash.speed);
      g.fx.pop('CRASH!', b.pos.clone().addScaledVector(up, 4), { color: '#ff4f2e', size: 54 });
      g.damagePlayer(Math.min((crash.speed - CRASH_SAFE) * 2.5, this.maxHp(v.id) * 0.5), 'crash');
      if (!P.vehicle) return; // wrecked: destroy() already got you out
    }
    if (def.hover) b.vel.multiplyScalar(1 - 0.15 * dt);
    if (b.grounded && (input.pressed('ShiftLeft') || input.pressed('ShiftRight'))) { b.vel.addScaledVector(up, 9); b.grounded = false; b.wasGround = false; g.audio.jump(); } // wasGround off so the ground snap can't swallow the hop
    // pose
    model.root.position.copy(b.pos).addScaledVector(up, def.hover ? 0.8 + Math.sin(g.time * 3) * 0.15 : RIDE_LIFT);
    const q = frameQuat(b.groundN, e.heading, new THREE.Quaternion());
    model.root.quaternion.slerp(q, Math.min(1, dt * 8));
    const sp = b.vel.length();
    for (const w of model.wheels) w.rotation.x += (along >= 0 ? 1 : -1) * sp * dt / (model.wheelR || 0.85);
    model.along = along;
    if (model.anim) model.anim(g.time, sp);
    this.trail(model, dt, true);
    // seat the runner in the model's own frame (tilt, hover bob) so rider and vehicle move as one; placing from the
    // physics body drifts. Seat heights are from the ground; a hover model already floats 0.8 above it.
    const mq = model.root.quaternion;
    // a Blender bike gives the rider's hip spot; a seated hip is 0.33 above the runner's origin
    const seatUp = model.seat ? model.seat.y - 0.33 : (def.seat ?? 1.6 * (def.scale || 1)) - (def.hover ? 0.8 : 0);
    P.body.pos.copy(model.root.position).addScaledVector(_mu.set(0, 1, 0).applyQuaternion(mq), seatUp);
    const seatZ = model.seat ? model.seat.z : def.seatZ;
    if (seatZ) P.body.pos.addScaledVector(_mf.set(0, 0, 1).applyQuaternion(mq), seatZ);
    v.riderQuat = mq;
    if (model.turret) this.aimTurret(v, dt, cam);
    if (model.exhaust) this.exhaustSmoke(v, dt, fwdIn ? 1 : 0, up);
    P.body.vel.copy(b.vel);
    P.body.up.copy(up);
    P.body.groundN.copy(b.groundN);
    P.body.grounded = true;
    P.body.skating = false;
    P.body.thrusting = false; // or the jet hiss stays on from before boarding
    P.heading.copy(e.heading);
    model.root.updateMatrixWorld();
    this.kickDust(v, dt, sp, up);
    // ramming at speed hurts pirates, turrets and patrols (an attack on their base), traffic, people and Moon Mites
    if (sp > 14) {
      const reach = def.radius || 3.5 * (def.scale || 1);
      const front = _mf.copy(b.pos).addScaledVector(up, 1.2);
      for (const en of g.enemies.targets()) {
        // hostile targets only
        if (!en.center || !g.enemies.isHostileTarget(en) || (en.ramT || 0) > g.time) continue;
        if (en.center.distanceTo(front) > (en.radius || 1.5) + reach) continue;
        en.ramT = g.time + 0.6;
        g.enemies.damage(en, sp * (def.pirate ? 3 : 2));
        g.fx.pop(en.kind === 'turret' ? 'CRUNCH!' : 'ROADKILL!', en.center.clone(), { color: '#ffd23f', size: 60 });
        b.vel.multiplyScalar(en.kind === 'turret' ? 0.55 : 0.8);
        if (en.kind === 'rover' || en.kind === 'turret') { this.hit(sp * 0.25); if (!P.vehicle) return; }
      }
      const tr = g.world.traffic;
      if (tr && tr.ram(front, reach, sp)) { b.vel.multiplyScalar(0.75); g.fx.pop('BASH!', front.clone(), { color: '#ff9f1c', size: 50 }); }
      if (g.civilians && (this.ramPeopleT || 0) < g.time) { this.ramPeopleT = g.time + 0.25; g.civilians.blast(front, reach * 0.8, sp * 1.5, 'player'); }
      if (g.alchemy) g.alchemy.blastMites(front, reach, 1, 'player');
    }
  }

  // wheel dust at speed (same puff as the skates'). Rear wheels throw more and bigger puffs the faster you go, front
  // wheels a steady lighter one; hover vehicles puff from under their pads, the rear just behind the engine plumes.
  kickDust(v, dt, sp, up) {
    if (sp < 18 || !v.e.body.grounded) return;
    const { def, model } = v;
    const sc = def.scale || 1;
    const k = Math.min(1, (sp - 18) / 60); // 0 at the dust threshold, 1 at 78 m/s
    let spots;
    if (model.dustSpots) spots = model.dustSpots.map(([x, z]) => [x * sc, z * sc]);
    else if (model.wheels.length) spots = model.wheels.map((w) => [w.position.x * sc, w.position.z * sc]);
    else {
      // skimmer plumes: pivots at x = +-1.78, z = -3.06, 2.2 long, stretched 0.35 to 1.25 with speed by model.anim
      const tail = -3.06 - 2.2 * (0.35 + 0.9 * Math.min(1, sp / 60)) - 0.4;
      spots = [[-1.78, tail], [1.78, tail], [-1.1, 1.6], [1.1, 1.6]];
    }
    const back = _mf.copy(v.e.body.vel).multiplyScalar(-0.2);
    for (const [x, z] of spots) {
      const rear = z < 0;
      const rate = rear ? dt * 30 * (1 + 3 * k) : dt * 30 * Math.min(2, sp / 40); // puffs this frame
      const n = Math.floor(rate + Math.random());
      if (!n) continue;
      // drop onto the ground plane under the body (hover vehicles float; tilted ones would puff from the hubs)
      const p = model.root.localToWorld(_mu.set(x, 0, z));
      p.addScaledVector(up, -p.clone().sub(v.e.body.pos).dot(up));
      const size = def.hover ? (rear ? 0.5 + 1.1 * k : 0.5) : (rear ? 0.5 + 0.7 * k : 0.7); // ground vehicles top out at 1.2
      this.game.fx.dust(p, back, n, up, 0xe8e2d8, size);
    }
  }

  // APC turret follows the camera: yaw about the hull's up, barrel pitch, both rate-limited. It converges where the aim
  // ray meets the ground (or AIM_RANGE out), so shells land on the crosshair.
  aimTurret(v, dt, cam) {
    const g = this.game;
    const m = v.model;
    const a = v.aim || (v.aim = { yaw: 0, pitch: 0, recoil: 0, cd: 0 });
    m.root.updateMatrixWorld(true);
    // step along the aim ray until it goes underground
    const end = _ap.copy(cam.position).addScaledVector(cam.look, AIM_RANGE);
    for (let t = 12; t <= AIM_RANGE; t += 12) {
      _am.copy(cam.position).addScaledVector(cam.look, t);
      if (g.planet.altitude(_am) < 0) { end.copy(_am); break; }
    }
    // hull frame: turret yaws about y, barrel pitches about x
    const pivot = m.barrel.getWorldPosition(_am);
    const d = _ad.copy(end).sub(pivot).applyQuaternion(_aq.copy(m.root.quaternion).invert());
    const yawT = Math.atan2(d.x, d.z);
    const pitchT = Math.max(TURRET_DOWN, Math.min(TURRET_UP, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    let dy = yawT - a.yaw;
    dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
    a.yaw += Math.max(-TURRET_YAW_RATE * dt, Math.min(TURRET_YAW_RATE * dt, dy));
    a.pitch += Math.max(-TURRET_PITCH_RATE * dt, Math.min(TURRET_PITCH_RATE * dt, pitchT - a.pitch));
    a.recoil = Math.max(0, a.recoil - dt * 3.2);
    m.turret.rotation.y = a.yaw;
    m.barrel.rotation.x = -a.pitch; // +z forward: raising is a negative turn about x
    m.barrel.position.copy(m.barrelRest).z -= 0.35 * a.recoil * a.recoil; // recoil kick, then runs out
    m.root.updateMatrixWorld(true);
  }

  // APC exhaust smoke: a trickle at idle, a plume on the power, each puff gone in ~0.25 s. It rises with the vehicle's
  // velocity, then drag leaves it behind.
  exhaustSmoke(v, dt, thr, up) {
    const m = v.model;
    m.root.updateMatrixWorld(true);
    const n = Math.floor((thr ? 30 : 8) * dt + Math.random());
    if (!n) return;
    m.exhaust.getWorldPosition(_ex);
    _exv.copy(up).multiplyScalar(2.2 + 2.2 * thr).addScaledVector(v.e.body.vel, 0.85);
    this.game.fx.spawn(_ex, _exv, { color: 0x0b0910, size: 0.3 + 0.22 * thr, life: 0.225 + 0.1 * thr, drag: 2.4, count: n, spread: 1.4 });
  }

  // Left mouse in the APC: a shell along the barrel (which may still be swinging to your aim). Called from
  // Player.updateWeapons in place of the runner's weapons.
  turretFire(dt, input) {
    const g = this.game;
    const P = g.player;
    const v = P.vehicle;
    if (!v || !v.aim) return;
    const a = v.aim;
    a.cd -= dt;
    if (!input.mouse[0] || a.cd > 0 || !input.locked || P.dead || P.rag) return;
    a.cd = 0.5;
    a.recoil = 1;
    const m = v.model;
    m.root.updateMatrixWorld(true);
    const muzzle = m.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = _am.set(0, 0, 1).applyQuaternion(m.muzzle.getWorldQuaternion(_aq)).clone();
    fireCannon(g, muzzle, dir, v.e.body.vel, P.damageMult || 1);
  }

  // the light-bike's trail streams from its rear wheel while moving, fading when it stops
  trail(model, dt, moving) {
    if (!model.trail) return;
    const sp = moving && this.game.player.vehicle ? this.game.player.vehicle.e.body.vel.length() : 0;
    const p = model.root.localToWorld(model.trailFrom.clone());
    model.trail.update(dt, p, model.root.position.clone().normalize(), sp > 3);
  }

  update(dt) {
    if (this.radial) this.radialRefresh();
    const g = this.game;
    // field repairs while not driven
    for (const id of Object.keys(this.hp)) if (!(g.player.vehicle && g.player.vehicle.id === id)) this.hp[id] = Math.min(this.maxHp(id), this.hp[id] + dt * 2);
    const pv = g.player.vehicle;
    const show = !!pv && g.state === 'play';
    if (show !== this.rowsShown) {
      this.rowsShown = show;
      this.nameRow.classList.toggle('hidden', !show);
      this.hpRow.classList.toggle('hidden', !show);
      this.hullRow.classList.toggle('hidden', show);
      this.jetRow.classList.toggle('hidden', show);
    }
    if (pv) {
      const max = this.maxHp(pv.id), hp = Math.max(0, this.hp[pv.id] ?? max);
      const k = hp / max;
      this.nameRow.firstChild.textContent = pv.def.name.toUpperCase();
      const fill = this.hpRow.querySelector('.vb-fill');
      fill.style.width = `${k * 100}%`;
      fill.style.background = k > 0.5 ? '#2ee6ff' : k > 0.25 ? '#ffd23f' : '#ff2a4a';
      this.hpRow.querySelector('.vb-num').textContent = `${Math.ceil(hp)}/${max}`;
      // smoke when badly damaged
      if (k < 0.35 && Math.random() < dt * 20) g.fx.spawn(pv.model.root.position.clone().addScaledVector(pv.e.body.pos.clone().normalize(), 3), pv.e.body.pos.clone().normalize().multiplyScalar(4), { color: k < 0.15 ? 0xff6a2a : 0x3a3550, size: 0.9, life: 0.9, count: 1, spread: 1 });
    }
    const v = this.active;
    if (!v || this.game.player.vehicle) return;
    if (v.model.anim) v.model.anim(g.time, 0);
    this.trail(v.model, dt, false);
    const b = v.e.body;
    if (b.vel.lengthSq() > 0.01) stepRover(v.e, dt, this.game.planet, this.game.colliders, v.e.heading, 0, { engine: 10, grip: v.def.grip, turn: 0, radius: 3, solidPlatforms: true });
    // parked: keep it posed; a hover car settles rather than floats (its hull reaches 0.24 below the origin)
    v.model.root.position.copy(b.pos).addScaledVector(_v.copy(b.pos).normalize(), v.def.hover ? 0.35 : RIDE_LIFT);
  }
}
