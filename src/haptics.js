// Controller feedback: rumble, and on a PlayStation pad the lightbar, player LEDs and adaptive triggers.
//
// RUMBLE has two ways out. Over WebHID (sonyout.js, a DualSense or DualShock 4 whose link is open: the desktop app
// opens it itself, a browser after CONNECT in Settings) the game writes the pad's own output report: this works
// over USB and Bluetooth and doesn't depend on what the browser exposes. Otherwise the Gamepad API's
// `vibrationActuator` (dual-rumble: `strong` is the big low-frequency motor, `weak` the small high-frequency one;
// older browsers only have `hapticActuators[0].pulse`, one intensity, which gets the louder of the two).
//
// Two layers are mixed into one effect and re-sent a dozen times a second (a pad can only play one effect, and a
// new one replaces it, so everything has to go out as a single mix):
//   impulses   short kicks the game asks for: play('jump'), land(speed), hit(damage), boom(distance, big), ...
//              each fades out over its own length, and several at once add up
//   continuous the skates' rumble with speed, the thrusters, a rail under the skates, a vehicle's engine
// Only while the pad is the thing being played with (Gamepad.setActive), scaled by the Settings' vibration
// strength, and off for the keyboard, a hidden tab, a pause (the continuous layer) or no way to rumble at all.
//
// THE LIGHTBAR (over the link only) is the colour of your skates, dimmer in menus and brighter in play, white-hot
// with the thrusters, red when you're hit and pulsing red when you're low; the five player LEDs count your health.
// THE TRIGGERS (DualSense only, in play, with the pad in use): RT is the weapon's trigger (a click that gives way;
// stiff again while it recharges), LT the thrusters (a light spring, a buzz while they burn, a wall when they're
// locked out) or the Rail Lance's scope.
import { WEAPONS } from './weapons.js';
import { feedback, weapon, vibration, TRIGGER_OFF } from './sonyout.js';

const SEND_MS = 80;   // re-send a steady effect this often (each one is played for LONG_MS, so there's no gap)
const LONG_MS = 140;
const MIN_MS = 40;    // but never changes faster than this (the pad takes a moment to spin up)
const EPS = 0.025;    // a change smaller than this isn't worth sending
const SONY = /054c|dualsense|dualshock|playstation|wireless controller/i;
const BLUE = [0, 0, 255]; // a Sony pad's own colour: what the lightbar goes back to when it's switched off here

// name: [strong, weak, seconds] (an impulse starts at that strength and fades to nothing)
const PRESETS = {
  jump:    [0.0, 0.35, 0.07],  // a tick off the ground
  grind:   [0.45, 0.7, 0.14],  // the skates biting a rail
  stick:   [0.55, 0.55, 0.16], // a trick landed clean
  wipeout: [1.0, 0.8, 0.45],   // a trick landed badly
  death:   [1.0, 1.0, 0.95],
  pulse:   [0.0, 0.5, 0.06],   // the pulse pistol
  scatter: [0.7, 0.9, 0.13],
  rail:    [1.0, 0.55, 0.28],
  mortar:  [0.8, 0.3, 0.2],
  cannon:  [1.0, 0.7, 0.3],    // the APC's turret
  pickup:  [0.0, 0.5, 0.09],
  cash:    [0.0, 0.45, 0.07],  // (twice, a moment apart)
  tick:    [0.0, 0.22, 0.04],  // a menu highlight moving
  press:   [0.12, 0.4, 0.06],  // a menu button pressed
  test:    [0.7, 0.7, 0.3],    // changing the strength in Settings
};
const ECHO = { cash: 0.09 }; // presets that play a second time this many seconds later

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// the triggers' feel (built once: one per frame would be garbage)
const FIRE = { pulse: weapon(4, 6, 3), scatter: weapon(2, 7, 7), rail: weapon(3, 8, 8), mortar: weapon(3, 6, 5), cannon: weapon(2, 6, 7) };
const COOLING = feedback(1, 3);   // RT while the weapon recharges
const SCOPE = feedback(3, 3);     // LT with the Rail Lance: a half pull to scope
const SPRING = feedback(3, 2);    // LT otherwise: a light spring, like a throttle
const LOCKED = feedback(0, 8);    // LT with the thrusters locked out
const BURN = vibration(0, 3, 38); // LT while they burn
const LOW = vibration(0, 6, 12);  // ...and the tank nearly out
const DEMO_R = weapon(2, 6, 8), DEMO_L = vibration(0, 4, 30);
const HEALTH_LEDS = [0x04, 0x0a, 0x15, 0x1b, 0x1f]; // 1..5 of the player LEDs, centred

export class Haptics {
  constructor(game) {
    this.game = game;
    this.on = true;       // Settings: controller vibration
    this.level = 1;       // Settings: strength
    this.light = true;    // Settings: lightbar and player LEDs
    this.trig = true;     // Settings: adaptive triggers
    this.act = null;      // the Gamepad API's actuator of the pad in use
    this.key = null;      // which pad that is
    this.padId = '';
    this.failed = false;  // the browser refused effects
    this.fails = 0;       // ...in a row
    this.lastResult = ''; // what the browser last said about an effect
    this.mode = 'none';   // the Gamepad API's: 'dual' | 'pulse' | 'none'
    this.lastVia = 'none';
    this.lit = false;     // the lightbar has been ours
    this.imp = [];        // live impulses: { s, w, t, d, at }
    this.t = 0;           // own clock (s)
    this.demo = 0;        // s left of the Settings TEST
    this.cont = { s: 0, w: 0 }; // the continuous layer, smoothed
    this.sent = { s: 0, w: 0 };
    this.sentAt = -9;
    this.ready = false;   // (the first configure() is the settings loading: no test buzz for that)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }

  get fx() { const p = this.game.pad; return p && p.fx; }

  // how rumble gets out right now: the pad's own report ('hid'), the browser's ('api') or not at all
  get via() {
    const fx = this.fx;
    if (fx && fx.ready) return 'hid';
    return this.mode === 'none' ? 'none' : 'api';
  }

  // the pad the Gamepad is reading this frame (null when there is none)
  attach(gp) {
    const act = gp && (gp.vibrationActuator && gp.vibrationActuator.playEffect ? gp.vibrationActuator : gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse ? gp.hapticActuators[0] : null);
    const key = gp ? `${gp.index}:${gp.id}` : null; // (some browsers hand out a fresh object for the same pad each poll)
    if (key !== this.key) { this.stop(); this.key = key; this.failed = false; this.fails = 0; this.lastResult = ''; this.padId = gp ? gp.id : ''; }
    this.act = act;
    this.mode = !act || this.failed ? 'none' : act.playEffect ? 'dual' : 'pulse';
  }

  get supported() { return this.via !== 'none'; }

  // Settings
  configure(on, level, light = true, trig = true) {
    const changed = on && (!this.on || level !== this.level);
    this.on = !!on; this.level = level; this.light = light !== false; this.trig = trig !== false;
    if (!this.on) this.stop();
    else if (changed && this.ready) this.play('test', 1, true);
    this.ready = true;
  }

  // A kick by name, scaled by `k` (0..1+). `force`: even when the keyboard is what's being played with.
  play(name, k = 1, force = false) {
    const p = PRESETS[name];
    if (!p || !this.live(force)) return;
    this.add(p[0] * k, p[1] * k, p[2]);
    if (ECHO[name]) this.add(p[0] * k, p[1] * k, p[2], ECHO[name]);
  }

  add(s, w, d, at = 0) {
    if (s <= 0.01 && w <= 0.01) return;
    if (this.imp.length > 24) this.imp.shift();
    this.imp.push({ s: clamp01(s), w: clamp01(w), t: 0, d, at });
    this.dirty = true;
  }

  // landing at `speed` m/s into the ground / a wall
  land(speed) {
    if (!this.live()) return;
    const k = clamp01((speed - 5) / 32);
    this.add(0.2 + 0.8 * k, 0.15 + 0.6 * k, 0.1 + 0.2 * k);
  }

  // the player took `amount` damage
  hit(amount) {
    if (!this.live()) return;
    const k = clamp01(amount / 30);
    this.add(0.3 + 0.7 * k, 0.5 + 0.4 * k, 0.16 + 0.3 * k);
  }

  // a blast `dist` m from the camera (big: a large one)
  boom(dist, big) {
    if (!this.live()) return;
    const reach = big ? 170 : 70;
    if (dist > reach) return;
    const k = 1 - dist / reach;
    this.add((big ? 1 : 0.65) * k, (big ? 0.8 : 0.6) * k, (big ? 0.55 : 0.28) * (0.5 + 0.5 * k));
  }

  // Settings TEST: three kicks, the lightbar white and both triggers working, for a second and a half
  test() {
    this.demo = 1.6;
    if (this.via === 'none') return;
    for (let i = 0; i < 3; i++) this.add(0.8, 0.8, 0.28, i * 0.5);
  }

  // is there a pad to feel it on, and is it the one in use?
  live(force = false) {
    if (!this.on || this.via === 'none' || document.hidden) return false;
    return force || !!(this.game.input && this.game.input.padActive);
  }

  // Per frame (real seconds), late in the frame so that this frame's events go out at once.
  update(dt) {
    this.t += dt;
    if (this.demo > 0) this.demo -= dt;
    const via = this.via, fx = this.fx;
    if (via !== this.lastVia) { // (the link came up or went: whatever the other way was playing stops)
      if (this.lastVia === 'hid' && fx) fx.quiet(); else this.silence();
      this.imp.length = 0; this.cont.s = this.cont.w = 0; this.sent = { s: 0, w: 0 };
      this.lastVia = via;
    }
    if (via === 'none') { this.imp.length = 0; return; }
    const g = this.game;
    let ts = 0, tw = 0;
    if (this.live() && g.state === 'play') {
      const P = g.player, b = P && P.body;
      if (b && !P.dead) {
        const sp = P.speed;
        if (g.grind && g.grind.active) { // metal under the skates
          const k = clamp01(sp / 60);
          ts = 0.1 + 0.1 * k; tw = 0.35 + 0.25 * k;
        } else if (P.vehicle) { // an engine, rising with speed
          const k = clamp01(sp / 70);
          ts = 0.1 + 0.25 * k; tw = 0.03 + 0.15 * k;
        } else if (b.skating && b.grounded && !P.rag && sp > 3) { // skates on the ground
          const k = clamp01(sp / 70);
          ts = 0.04 * k; tw = 0.06 + 0.3 * k;
        }
        if (b.thrusting) { ts = Math.max(ts, 0.25); tw = Math.max(tw, 0.32); }
      }
    }
    // (a little smoothing, so the layer swells in and out rather than jumping)
    const a = 1 - Math.exp(-dt * 12);
    this.cont.s += (ts - this.cont.s) * a;
    this.cont.w += (tw - this.cont.w) * a;
    if (this.cont.s < 0.01 && ts === 0) this.cont.s = 0;
    if (this.cont.w < 0.01 && tw === 0) this.cont.w = 0;

    // the impulses: a linear fade, summed softly with each other and with the continuous layer
    let is = 0, iw = 0;
    for (let i = this.imp.length - 1; i >= 0; i--) {
      const m = this.imp[i];
      if (m.at > 0) { m.at -= dt; continue; }
      const f = 1 - m.t / m.d; // (heard once at its full strength before it ages: a kick shorter than a frame still goes out)
      is = 1 - (1 - is) * (1 - m.s * f);
      iw = 1 - (1 - iw) * (1 - m.w * f);
      m.t += dt;
      if (m.t >= m.d) this.imp.splice(i, 1);
    }
    const k = this.level;
    const s = clamp01((1 - (1 - this.cont.s) * (1 - is)) * k);
    const w = clamp01((1 - (1 - this.cont.w) * (1 - iw)) * k);
    if (via === 'hid') {
      fx.rumble(s, w);
      this.feel(g, fx);
      fx.flush();
    } else this.send(s, w);
  }

  // ---- the lightbar and the triggers (over the link) ----
  feel(g, fx) {
    if (this.light || this.demo > 0) { const l = this.glow(g); fx.light(l.rgb, l.leds); this.lit = true; }
    else fx.light(this.lit ? BLUE : null, 0x04);
    if (fx.triggers) {
      const t = this.trig || this.demo > 0 ? this.triggerFx(g) : null;
      fx.triggerFx(t ? t[0] : TRIGGER_OFF, t ? t[1] : TRIGGER_OFF);
    }
  }

  glow(g) {
    const P = g.player, mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    if (this.demo > 0) { const v = 140 + 115 * Math.sin(this.t * 14); return { rgb: [v, v, v], leds: 0x1f }; }
    const sk = g.cosmetics && g.cosmetics.skate;
    const hex = sk ? (sk.trail === 'rainbow' ? g.cosmetics.trailColor(g.time) : sk.color) : 0x2ee6ff;
    const base = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const RED = [255, 24, 24];
    if (P.dead) return { rgb: dim(RED, 0.55), leds: 0x04 };
    if (g.state !== 'play') return { rgb: dim(base, 0.4), leds: 0x04 }; // (menus, pauses, the map, the casino)
    let c = dim(base, 0.7);
    const b = P.body;
    if (b.thrusting) c = mix(c, [255, 255, 255], 0.45);
    const frac = P.maxHealth > 0 ? clamp01(P.health / P.maxHealth) : 1;
    if (frac < 0.3) c = mix(c, dim(RED, 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 5))), 0.8);
    const flash = g.damageFlash || 0;
    if (flash > 0.02) c = mix(c, RED, clamp01(flash * 1.6));
    return { rgb: c, leds: HEALTH_LEDS[Math.max(0, Math.min(4, Math.ceil(frac * 5) - 1))] };
  }

  triggerFx(g) {
    if (this.demo > 0) return [DEMO_R, DEMO_L];
    const P = g.player;
    if (g.state !== 'play' || P.dead || P.rag || P.seat || !g.input.padActive) return [TRIGGER_OFF, TRIGGER_OFF];
    if (P.vehicle) return [P.vehicle.def.turret ? FIRE.cannon : TRIGGER_OFF, TRIGGER_OFF];
    const w = WEAPONS[P.weapon || 0], b = P.body;
    const rt = P.fireCd > 0 && w.delay > 0.7 ? COOLING : FIRE[w.key] || TRIGGER_OFF;
    let lt;
    if (w.key === 'rail') lt = SCOPE;
    else if (b.jetLocked) lt = LOCKED;
    else if (b.thrusting) lt = b.energy < b.maxEnergy * 0.25 ? LOW : BURN;
    else lt = SPRING;
    return [rt, lt];
  }

  // ---- the browser's rumble ----
  send(s, w) {
    const now = this.t;
    const since = (now - this.sentAt) * 1000;
    const sc = this.sent;
    const moved = Math.abs(s - sc.s) > EPS || Math.abs(w - sc.w) > EPS;
    const none = s < 0.01 && w < 0.01;
    if (none) {
      if (sc.s || sc.w) { this.silence(); this.sent = { s: 0, w: 0 }; this.sentAt = now; }
      this.dirty = false;
      return;
    }
    const rising = s > sc.s + EPS || w > sc.w + EPS;
    if (!(rising && this.dirty) && since < MIN_MS) return;       // (a fresh kick goes out at once)
    if (!moved && since < SEND_MS) return;
    this.dirty = false;
    this.sentAt = now; this.sent = { s, w };
    const bad = (err) => { this.lastResult = `refused (${(err && err.message) || err})`; if (++this.fails >= 8) { this.failed = true; this.mode = 'none'; } };
    try {
      if (this.mode === 'dual') {
        const p = this.act.playEffect('dual-rumble', { startDelay: 0, duration: LONG_MS, strongMagnitude: s, weakMagnitude: w });
        if (p && p.then) p.then((r) => { this.lastResult = String(r); this.fails = 0; }, bad);
      } else {
        const p = this.act.pulse(Math.max(s, w), LONG_MS);
        if (p && p.then) p.then((r) => { this.lastResult = String(r); this.fails = 0; }, bad);
      }
    } catch (err) { bad(err); }
  }

  silence() {
    if (!this.act || this.lastVia === 'hid') return;
    try {
      if (this.act.reset) { const p = this.act.reset(); if (p && p.catch) p.catch(() => {}); }
      else if (this.mode === 'dual') { const p = this.act.playEffect('dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }); if (p && p.catch) p.catch(() => {}); }
    } catch { /* the pad went away */ }
  }

  // everything off (a pause, the tab hidden, the pad gone, vibration switched off)
  stop() {
    this.imp.length = 0;
    this.cont.s = this.cont.w = 0;
    if (this.sent.s || this.sent.w) this.silence();
    this.sent = { s: 0, w: 0 };
    this.dirty = false;
    const fx = this.fx;
    if (fx && fx.ready) fx.quiet();
  }

  // a line for Settings: how this pad is being driven
  get status() {
    const fx = this.fx, gy = this.game.pad && this.game.pad.gyro;
    const sony = SONY.test(this.padId);
    if (!this.key) return 'No controller found. Press a button on it.';
    if (fx && fx.ready) {
      const name = (gy && gy.dev && gy.dev.productName) || 'PlayStation controller';
      return `${name}: rumble, lightbar${fx.triggers ? ' and adaptive triggers' : ''} through the PlayStation link (${fx.kind === 'bt' ? 'Bluetooth' : 'USB'})`;
    }
    const hint = sony && gy ? (gy.dev ? '' : ' Press CONNECT below for the lightbar and adaptive triggers, and for rumble that does not depend on the browser.') : '';
    if (fx && gy && gy.dev && fx.status) return `PlayStation link: ${fx.status}.${this.mode === 'none' ? '' : ' Rumbling through the browser instead.'}`;
    if (this.mode === 'none') return `The browser offers no rumble for this controller${this.failed ? ' (it refused the effects: ' + this.lastResult + ')' : ''}.${hint}`;
    return `Rumble through the browser (${this.mode === 'dual' ? 'dual-rumble' : 'single motor'}${this.lastResult ? ', last answer: ' + this.lastResult : ''}).${hint}`;
  }
}
