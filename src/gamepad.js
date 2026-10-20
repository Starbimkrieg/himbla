// Controller support (Gamepad API, standard mapping: Xbox / PlayStation / Switch Pro).
//
// In play the pad feeds default key codes straight into Input (so rebinding never interferes): left stick moves (analog,
// and WASD for key readers), right stick looks, triggers are the mouse buttons. In menus a highlight moves over what's on
// screen (d-pad / left stick): A presses, B backs out (Escape), right stick scrolls. The title menu does its own arrow
// navigation, so there the pad just sends arrows.
//
//   PLAY                                        DERBY (watching your chimera race)
//   left stick   move / steer / carve           A        cheer (Space)
//   right stick  look                           Y        switch camera (C)
//   A            mag-jump · dive (Shift)        right stick  orbit the camera
//   B            tricks, hold in the air (Q)
//   X            interact (F)                   MENUS
//   Y            vehicle (V)                    d-pad / left stick  move the highlight
//   LB           Quantum-Lock skates, hold      A  press   B  back   right stick  scroll
//   RB           power (E; again lets go of the winch)  LB / RB  previous / next tab (where there are tabs)
//   LT           thrusters / Rail Lance scope
//   RT           fire                           Start        pause / resume
//   L3           thrusters (like LT)            View, tap    globe map (M)
//   R3           scoop into the jar (G)         View, hold   emergency recall (R)
//   d-pad ←/→    previous / next weapon
//   d-pad ↑      next power (the mouse wheel)    GLOBE MAP
//                                               left stick  move the cursor   right stick  zoom
//                                               RT, hold    grab the globe and drag it round
//                                               LB / RB, hold  turn the map round
//                                               A  send a sweep, X  stop / resume it (from the Radio Tower)
//                                               B / View    close
//                                               PLINKO
//                                               left stick / d-pad ←/→  aim the chute
//                                               A / RT      drop a ball (hold: keep them coming)
//                                               LB / RB     lower / raise the bet   B  stand up
//                                               BLACKJACK
//                                               A  deal · hit   X  stand   Y  double   R3  zoom
//                                               LB / RB     lower / raise the bet   B  stand up
//                                               ROULETTE (the casino panel's table)
//                                               left stick  move the cursor
//                                               A / RT      a chip on what it's over (or press it)
//                                               d-pad ←/→   bet size   X  spin   Y  clear
//                                               DUCK DERBY
//                                               left stick / d-pad  pick a duck   A  race · new race
//                                               LB / RB     lower / raise the bet   B  stand up
//   (rumble, plus PlayStation lightbar and adaptive triggers: haptics.js, sonyout.js)
//   (dev free cam on: LB / RB up / down, LT fast, d-pad ↑ / ↓ speed, d-pad → hides the HUD: freecam.js)
//   d-pad ↓      radial menu (tap to open / close): vehicles, powers, wardrobe, rep log, empty the jar. Vehicles and
//                powers open their own wheel of what you own (same controls; the power picked there is RB's).
//                Right stick picks a wedge (glows like the minimap: purple on the dark side, white in the light),
//                A or d-pad ↓ uses it, B / Start cancels.
import { WEAPONS, weaponUnlocked } from './weapons.js';
import { Glyphs, glyphState, glyphHtml } from './glyphs.js';
import { GyroPad } from './gyro.js';
import { SonyOut } from './sonyout.js';
import { DEV_TOOLS } from './devtools.js';

const DEAD = 0.18; // stick deadzone (radial)
const AIM_SHOW = 10; // s the crosshair stays up after the last shot
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// buttons held as default key codes in play
const HOLD = { [B.A]: 'ShiftLeft', [B.B]: 'KeyQ', [B.X]: 'KeyF', [B.Y]: 'KeyV', [B.LB]: 'Space', [B.RB]: 'KeyE', [B.L3]: 'Thrust', [B.R3]: 'KeyG' };
// the d-pad-down radial: everything without its own button, clockwise from the top.
// `has`: owned yet (the wedge stays, dimmed, until it is); `code`: the key it presses
const RADIAL = [
  { id: 'vehicles', name: 'VEHICLES', has: (g) => g.garage && !g.player.rag && (g.garage.owned().length > 0 || !!g.player.vehicle), state: (g) => (g.player.vehicle ? 'GET OUT' : '') },
  { id: 'powers', name: 'POWERS', has: (g) => g.powers && !g.player.rag && g.powers.owned().length > 0 }, // includes pen link and Teleporter
  { code: 'KeyC', name: 'WARDROBE' },
  { code: 'KeyJ', name: 'REP LOG' },
  { id: 'jar', code: 'KeyX', name: 'EMPTY JAR', has: (g) => (g.upgrades.jar || 0) > 0 },
];
// panels the highlight works in, topmost first
const UI_ROOTS = ['settings', 'dialog', 'board', 'replog', 'wardrobe', 'casino', 'help', 'pause', 'death', 'globe-wrap'];
const FOCUSABLE = 'button, [data-i], [data-k], [data-f], [data-tab], [data-buy], a[href], input, select, .wd-tile, [role="button"]'; // [data-i]: a job-terminal contract, [data-buy]: one of its upgrades
const axis = (btn, plus, minus) => (btn[plus] ? 1 : 0) - (btn[minus] ? 1 : 0); // -1, 0 or 1 from a pair of buttons
const scrolls = (el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY); // more in it than shows

// glyph set: PlayStation (Sony 054c), Switch (Nintendo 057e), else Xbox
export function padKind(id = '') {
  if (/xbox|045e|xinput|microsoft/i.test(id)) return 'xbox'; // before the PS test: "Xbox Wireless Controller" matches "wireless controller"
  if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(id)) return 'ps';
  if (/057e|nintendo|switch|pro controller|joy-?con/i.test(id)) return 'switch';
  return 'xbox';
}

// the pad in use: the first connected one, preferring standard mapping (the input monitor, inputmon.js, reads it too)
export function activePad() {
  let gp = null;
  for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) if (p && p.connected) { gp = p; if (p.mapping === 'standard') break; }
  return gp;
}

export class Gamepad {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.prev = [];
    this.holding = new Set(); // codes this pad holds down in Input
    this.viewT = -1; // View held time (tap = map, hold = recall)
    this.navT = 0; // menu nav key-repeat
    this.navDir = null;
    this.focus = null;
    this.aimT = AIM_SHOW; // s since the last shot (starts faded out)
    this.radial = null; // open radial menu { sel }, or null
    this.kind = 'xbox';
    this.glyphs = new Glyphs();
    // PlayStation motion sensors (WebHID): while Circle is held, tilt stands in for the left stick
    this.gyro = new GyroPad();
    this.gyroOn = false;
    this.gyro.init();
    this.fx = new SonyOut(this.gyro); // same link: rumble, lightbar, adaptive triggers (haptics.js)
    window.addEventListener('gamepadconnected', (e) => {
      this.game.hud.toast(`Controller connected: ${(e.gamepad.id || 'gamepad').replace(/\(.*\)/, '').trim().slice(0, 40)}`, 2.5);
    });
    window.addEventListener('gamepaddisconnected', () => { this.releaseAll(); this.setActive(false); });
    // keyboard or mouse used: the pad steps aside
    window.addEventListener('keydown', (e) => { if (!e.padSynth) this.setActive(false); }, true);
    window.addEventListener('mousedown', () => this.setActive(false), true);
  }

  setActive(on) {
    const I = this.input;
    if (I.padActive === on) return;
    I.padActive = on;
    document.body.classList.toggle('pad-on', on);
    if (on) this.game.hud.show('clickhint', false);
    else { this.clearFocus(); this.hideCursor(); this.closeRadial(); const gr = this.game.garage && this.game.garage.radial; if (gr) { this.game.garage.closeRadial(false); this.game.vHold = 0; } this.game.powers.closeRadial(false); this.releaseAll(); I.padMove.on = false; this.gyroOn = false; this.gyro.end(); }
    // key names across the UI and help tables become this pad's buttons (and back)
    this.glyphs.set(on, this.kind);
    const s = this.game.settings;
    if (s) s.updateHelp();
    // settings controls tab shows pad buttons or key binds, whichever is in use
    if (s && s.open && s.tab === 'controls' && !s.rebinding) s.render();
  }

  // ---- per frame ----
  update(dt) {
    const gp = activePad();
    if (this.game.haptics) this.game.haptics.attach(gp);
    if (!gp) return;
    const kind = padKind(gp.id);
    if (kind !== this.kind) { this.kind = kind; if (this.input.padActive) { this.glyphs.set(false); this.glyphs.set(true, kind); } else glyphState.kind = kind; }
    const btn = gp.buttons.map((b) => !!b && (b.pressed || b.value > 0.5));
    if (this.comboMask && !btn[this.comboMask]) this.comboMask = 0;
    if (this.comboMask) btn[this.comboMask] = false; // the Y that finished the combo isn't also "vehicle"
    const trig = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    const stick = (ax, ay) => {
      const x = gp.axes[ax] || 0, y = gp.axes[ay] || 0;
      const m = Math.hypot(x, y);
      if (m < DEAD) return [0, 0];
      const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; // rescaled past the deadzone (no jump at its edge)
      return [x * k, y * k];
    };
    const [lx, ly] = stick(0, 1), [rx, ry] = stick(2, 3);
    const any = btn.some(Boolean) || lx || ly || rx || ry;
    if (any && !this.input.padActive) this.setActive(true);
    if (!this.input.padActive) { this.prev = btn; if (!btn.some(Boolean)) this.gwWas = false; return; } // gwWas: a keyboard-closed wheel is forgotten once the pad idles; a button held through the switch stays masked
    const pressed = (i) => btn[i] && !this.prev[i];
    const released = (i) => !btn[i] && this.prev[i];
    const g = this.game;
    const menu = g.menu && g.menu.open;
    const st = g.state;
    const setOpen = g.settings && g.settings.open;
    if (DEV_TOOLS && st === 'play' && !menu && !setOpen) this.devCombo(pressed, dt);
    const away = st !== 'play' || menu || setOpen; // a dialog or screen opened over the wheels or the gyro
    if (this.radial && away) this.closeRadial();
    if (g.garage && g.garage.radial && away) { g.garage.closeRadial(false); g.vHold = 0; }
    if (g.powers.radial && away) g.powers.closeRadial(false);
    if (this.gyroOn && away) { this.gyroOn = false; this.gyro.end(); }
    const roul = st === 'casino' && !g.casino.mode && g.casino.tab === 'roulette' && !setOpen && !menu;
    if (!roul) this.hideCursor();
    if (setOpen) this.ui(btn, pressed, lx, ly, ry, dt); // settings sit over the title / pause card and get the highlight
    else if (menu) this.titleMenu(btn, pressed, lx, ly, dt);
    else if (st === 'play') this.play(gp, btn, pressed, released, trig, lx, ly, rx, ry, dt);
    else if (st === 'derby') this.derby(btn, pressed, rx, ry, dt);
    else if (st === 'map') this.map(btn, pressed, released, trig, lx, ly, ry, dt);
    else if (roul) this.roulette(btn, pressed, trig, lx, ly, dt);
    else if (st === 'casino' && g.casino.mode) this.seated(g.casino.mode, btn, pressed, trig, lx, ly, dt);
    else if (st === 'dead') { this.releaseAll(); if (pressed(B.A) || pressed(B.START)) document.getElementById('death').click(); }
    else if (st === 'cutscene') { this.releaseAll(); if (pressed(B.A) || pressed(B.B) || pressed(B.START)) this.tap('Space'); } // cutscenes (recall, med-evac, council vote) skip on Space
    else this.ui(btn, pressed, lx, ly, ry, dt);
    this.prev = btn;
  }

  // hidden dev menu: B, B, X, Y, each within 1.5 s of the last
  devCombo(pressed, dt) {
    const SEQ = [B.B, B.B, B.X, B.Y];
    this.comboT = (this.comboT || 0) - dt;
    if (this.comboT <= 0) this.comboI = 0;
    for (const i of SEQ) {
      if (!pressed(i)) continue;
      this.comboI = i === SEQ[this.comboI || 0] ? (this.comboI || 0) + 1 : i === SEQ[0] ? 1 : 0;
      this.comboT = 1.5;
      if (this.comboI === SEQ.length) {
        this.comboI = 0;
        this.comboMask = B.Y;
        this.releaseAll();
        this.game.cheats.dev();
      }
      break;
    }
  }

  // crosshair (pad or mouse) shows while firing, fades AIM_SHOW s after the last shot; always up in a turret vehicle (APC)
  crosshair(dt) {
    const P = this.game.player;
    const firing = this.game.state === 'play' && (this.input.mouse[0] || !!(P && P.vehicle && P.vehicle.def.turret));
    this.aimT = firing ? 0 : Math.min(this.aimT + dt, AIM_SHOW);
    document.body.classList.toggle('aim', this.aimT < AIM_SHOW);
  }

  // ---- play ----
  play(gp, btn, pressed, released, trig, lx, ly, rx, ry, dt) {
    const g = this.game, I = this.input;
    this.clearFocus();
    // PlayStation gyro: with Circle held, the turn since Circle went down adds to the left stick (moves on the ground,
    // flips / spins in the air)
    const gy = this.gyroStick(btn);
    if (gy) {
      lx += gy.x; ly += gy.y;
      const m = Math.hypot(lx, ly);
      if (m > 1) { lx /= m; ly /= m; }
    }
    // analog movement, plus WASD past halfway for key readers (vehicles, tricks)
    I.padMove.x = lx; I.padMove.y = ly; I.padMove.on = !!(lx || ly);
    this.set('KeyW', ly < -0.45); this.set('KeyS', ly > 0.45); this.set('KeyA', lx < -0.45); this.set('KeyD', lx > 0.45);
    // While a radial is open the right stick picks a wedge (no look) and A / B are its buttons (no jump or trick).
    // Vehicle wheel (garage: VEHICLES wedge or hold Y) and power wheel (POWERS wedge) run before the menu, which may open them.
    const gw = g.garage && g.garage.radial;
    const pw = g.powers.radial;
    if (this.gwWas && !gw) this.radialMask = true; // closed from outside (Y let go): anything still held isn't a jump or trick
    this.gwWas = !!gw;
    const wheelUsed = gw ? this.vehicleWheel(gw, pressed, rx, ry) : pw ? this.powerWheel(pw, pressed, rx, ry) : false;
    if (!this.radial && !gw && !pw) this.look(rx, ry, dt);
    // A, B and Y are masked while a wheel is open and until released after, so the press that used or cancelled it
    // isn't also a jump, trick or vehicle key a frame later
    const hold = !!(this.radial || this.radialMask);
    const wheelOpen = !!(g.garage && g.garage.radial) || !!pw;
    const gwSticky = !!(gw && gw.sticky) || !!pw; // opened from the menu: Y isn't its key
    if (this.radialMask && !this.radial && !btn[B.A] && !btn[B.B] && !btn[B.Y]) this.radialMask = false;
    for (const [i, code] of Object.entries(HOLD)) this.set(code, btn[i] && !((hold || wheelOpen) && (i == B.A || i == B.B)) && !((hold || gwSticky) && i == B.Y));
    I.mouse[0] = trig(B.RT) > 0.35;
    I.mouse[2] = trig(B.LT) > 0.35;
    // dev free cam (freecam.js) takes the buttons while on: LB up, RB down, LT fast, d-pad ↑ / ↓ speed, d-pad → HUD toggle
    // (so the d-pad isn't weapon / power switching or the radial)
    const fc = g.cheats.freeCam;
    if (fc.on) fc.pad = { rise: axis(btn, B.LB, B.RB), fast: trig(B.LT) > 0.35, speed: axis(btn, B.UP, B.DOWN), hud: pressed(B.RIGHT) };
    // not while a wheel is open or d-pad ↓ is held: a diagonal on the way to ↓ isn't a weapon swap
    else if (!this.radial && !gw && !pw && !btn[B.DOWN]) {
      if (pressed(B.LEFT)) this.cycleWeapon(-1);
      if (pressed(B.RIGHT)) this.cycleWeapon(1);
      if (pressed(B.UP)) I.wheelSteps += 1;
    }
    // View: tap = map, hold = emergency recall (R held)
    if (btn[B.VIEW]) { this.viewT = this.viewT < 0 ? 0 : this.viewT + dt; this.set('KeyR', this.viewT > 0.35); }
    else if (this.viewT >= 0) { if (this.viewT <= 0.35) this.tap('KeyM'); this.set('KeyR', false); this.viewT = -1; }
    const wasOpen = !!this.radial || !!gw || !!pw; // Start cancels a wheel without also pausing
    if (!wheelUsed && !fc.on) this.radialMenu(btn, pressed, rx, ry);
    if (pressed(B.START) && !wasOpen) this.pause();
  }

  // Vehicle wheel, like the menu's: right stick picks (sticky), A calls (not ready: buzz, stays up), d-pad ↓ calls the
  // pick or closes, B / Start cancels. Opened by hold-Y, Y's release calls and only B / Start apply here.
  // Returns true when a press was used, so the menu doesn't also see it.
  vehicleWheel(gw, pressed, rx, ry) {
    const g = this.game, gar = g.garage;
    const cancel = () => { gar.closeRadial(false); g.vHold = 0; this.radialMask = true; return true; }; // vHold: or releasing Y would still call
    // on a ride, dead, or already in a vehicle: nothing to call
    if (g.rides.ride || g.player.dead || g.player.vehicle || g.player.rag) return cancel();
    gar.radialStick(rx, ry);
    if (pressed(B.B) || pressed(B.START)) return cancel();
    if (!gw.sticky) return false;
    const q = gw.sel >= 0 ? gw.items[gw.sel] : null;
    const notReady = !!q && (gar.cooldown(q) > 0 || g.boardCooldown > 0);
    if (pressed(B.A)) {
      if (notReady) { this.beep(180, 0.1, 'sawtooth', 0.05); return true; } // stays open, like a locked wedge
      gar.closeRadial(true); this.radialMask = true;
      return true;
    }
    if (pressed(B.DOWN)) { gar.closeRadial(!notReady); this.radialMask = true; return true; }
    return false;
  }

  // Power wheel: right stick picks (sticky), A equips (winch cable attached: buzz, stays up), d-pad ↓ equips the pick or
  // closes, B / Start cancels. Always true: the wheel is sticky, so the menu behind never sees a press.
  powerWheel(pw, pressed, rx, ry) {
    const g = this.game, pows = g.powers;
    const done = (commit) => { pows.closeRadial(commit); this.radialMask = true; };
    if (g.player.dead || g.player.rag) { done(false); return true; } // a ragdoll can't use powers
    pows.radialStick(rx, ry);
    const q = pows.radialPick();
    if (pressed(B.B) || pressed(B.START)) done(false);
    else if (pressed(B.A)) {
      if (!pows.pickable(q)) { this.beep(180, 0.1, 'sawtooth', 0.05); g.hud.toast('Let go of the cable first.', 1.5); } // stays open
      else done(true);
    } else if (pressed(B.DOWN)) done(pows.pickable(q));
    return true;
  }

  // gyro virtual stick while Circle is held on a PS pad (else null); starts / stops tracking on the press
  gyroStick(btn) {
    const G = this.gyro, S = this.game.settings;
    const on = this.kind === 'ps' && G.live() && !(S && S.v.gyro === false) && btn[B.B] && !this.radial && !this.radialMask && !this.gwWas && !(this.game.garage && this.game.garage.radial) && !this.game.powers.radial;
    if (on !== this.gyroOn) { this.gyroOn = on; if (on) G.begin(); else G.end(); }
    if (!on) return null;
    const v = S ? S.v : {};
    return G.stick(v.gyroRange || 30, 5, !!v.gyroInvX, !!v.gyroInvY);
  }

  // d-pad ↓ opens the radial, again uses the highlighted wedge (or closes if none). Right stick picks (sticky), A uses,
  // B / Start cancels.
  radialMenu(btn, pressed, rx, ry) {
    const g = this.game;
    if (!this.radial) {
      if (pressed(B.DOWN)) this.openRadial();
      return;
    }
    const R = this.radial;
    if (Math.hypot(rx, ry) > 0.55) {
      const n = RADIAL.length;
      const a = Math.atan2(rx, -ry); // 0 at the top, clockwise
      const sel = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
      if (sel !== R.sel) {
        R.sel = sel;
        this.beep(700 + sel * 40, 0.04, 'square', 0.06);
      }
    }
    if (pressed(B.B) || pressed(B.START)) { this.closeRadial(); return; }
    if (pressed(B.A) || pressed(B.DOWN)) {
      let q = R.sel >= 0 ? RADIAL[R.sel] : null;
      const locked = !!(q && q.has && !q.has(g));
      if (locked && pressed(B.A)) { this.beep(180, 0.1, 'sawtooth', 0.05); return; } // A on a locked wedge: stays open
      if (locked) q = null; // d-pad ↓ on one just closes
      this.closeRadial();
      // a held d-pad ↓ mustn't also step the highlight in the screen this opens
      if (pressed(B.DOWN)) { this.navDir = 'down'; this.navT = 0.38; }
      if (q) this.useRadial(q);
      return;
    }
    this.drawRadial();
  }

  useRadial(q) {
    const g = this.game;
    if (q.id === 'vehicles') {
      // V key's guards: nothing on a ride or right after a screen closes; in a vehicle it gets you out
      if (g.rides.ride || g.boardCooldown > 0) return;
      if (g.player.vehicle) g.garage.exit(); else g.garage.openRadial(true); // vehicle wheel, which takes stick, A and B
    } else if (q.id === 'powers') g.powers.openRadial(); // power wheel, which takes stick, A and B
    else if (q.id === 'jar') g.alchemy.empty(false); // X needs a 1 s hold; a wedge pick is already deliberate
    else this.pulse(q.code);
  }

  openRadial() {
    if ((this.game.garage && this.game.garage.radial) || this.game.powers.radial) return; // hold-Y vehicle picker or power wheel is up
    this.radial = { sel: -1, hub: '' };
    this.game.vHold = 0; // a vehicle key going down isn't a tap: Y is masked while the wheel is up
    this.set('KeyV', false); this.input.justPressed.delete('KeyV'); // nor one pressed this frame with d-pad ↓
    this.drawRadial(true);
    this.beep(520, 0.08, 'triangle', 0.12);
  }

  closeRadial() {
    if (this.radial) this.radialMask = true;
    this.radial = null;
    const el = document.getElementById('padradial');
    if (el) el.classList.add('hidden');
  }

  // the wheel: built once per opening, then only the highlight changes
  drawRadial(build) {
    const g = this.game, R = this.radial;
    let el = document.getElementById('padradial');
    if (!el) {
      el = document.createElement('div');
      el.id = 'padradial';
      document.getElementById('hud').appendChild(el);
      build = true;
    }
    if (build) {
      const n = RADIAL.length;
      el.innerHTML = '<div class="pr-ring"></div><div class="pr-hub"></div>' + RADIAL.map((q, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const locked = q.has && !q.has(g);
        const st = q.state ? `<small>${q.state(g)}</small>` : '';
        return `<div class="pr-item${locked ? ' locked' : ''}" data-i="${i}" style="left:${50 + Math.cos(a) * 38}%;top:${50 + Math.sin(a) * 38}%"><b>${q.name}</b>${locked ? '<small>LOCKED</small>' : st}</div>`;
      }).join('');
      el.classList.remove('hidden');
    }
    el.querySelectorAll('.pr-item').forEach((it) => {
      const i = +it.dataset.i, q = RADIAL[i];
      it.classList.toggle('on', i === R.sel);
      // state labels (VEHICLES' GET OUT) follow it while the wheel is up
      if (q.state && !it.classList.contains('locked')) { const s = it.querySelector('small'), t = q.state(g); if (s && s.textContent !== t) s.textContent = t; }
    });
    const q = R.sel >= 0 ? RADIAL[R.sel] : null;
    const hub = `${q ? `<b>${q.name}</b>` : 'MENU'}<small><span>${glyphHtml(['RS'])} pick</span><span>${glyphHtml(['A'])} use</span><span>${glyphHtml(['B'])} cancel</span></small>`;
    if (R.hub !== hub) { R.hub = hub; el.querySelector('.pr-hub').innerHTML = hub; }
  }

  // menu blips and the buzz of a locked choice (audio.js tone)
  beep(f, dur, type, vol) { const a = this.game.audio; if (a && a.tone) a.tone(f, dur, type, vol); }

  // a key held a couple of frames (some actions read held, some the press)
  pulse(code) {
    this.set(code, true);
    setTimeout(() => this.set(code, false), 60);
  }

  look(rx, ry, dt) {
    // curve: precise near the centre, full speed at the edge; in mouse pixels so look sensitivity and invert apply
    this.input.dx += Math.sign(rx) * rx * rx * 1450 * dt;
    this.input.dy += Math.sign(ry) * ry * ry * 1000 * dt;
  }

  cycleWeapon(dir) {
    const g = this.game;
    const P = g.player;
    const n = WEAPONS.length;
    let i = P.weapon || 0;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (weaponUnlocked(WEAPONS[i], g.upgrades)) { this.tap('Digit' + (i + 1)); return; }
    }
  }

  pause() {
    const g = this.game;
    this.releaseAll();
    g.resumeState = g.state;
    g.state = 'paused';
    g.hud.show('pause', true);
    g.input.unlock();
  }

  // ---- watching a race ----
  derby(btn, pressed, rx, ry, dt) {
    this.clearFocus();
    this.look(rx, ry, dt);
    if (pressed(B.A)) this.tap('Space');
    if (pressed(B.Y) || pressed(B.RB)) this.tap('KeyC');
    if (pressed(B.START)) this.pause();
  }

  // ---- globe map: left-stick cursor; RT held grabs the globe to drag it ----
  map(btn, pressed, released, trig, lx, ly, ry, dt) {
    this.releaseAll();
    this.clearFocus();
    this.game.globe.padUpdate(lx, ly, trig(B.RT) > 0.35, ry, axis(btn, B.RB, B.LB), dt);
    // View closes on release, so letting go can't read as the tap that opens the map
    if (pressed(B.B) || pressed(B.START)) this.key('Escape');
    else if (pressed(B.A)) this.game.globe.padClick(); // Radio Tower sweep, or dev click-to-teleport
    else if (pressed(B.X) && this.game.globe.mode === 'radio') this.game.globe.radioToggle(); // stop / resume the sweep
    else if (released(B.VIEW)) this.tap('KeyM');
  }

  // ---- seated at a casino game. Plinko: left stick / d-pad aims, A or RT drops (held: a stream). Blackjack: A deals /
  // hits, X stands, Y doubles. Duck Derby: left stick / d-pad picks a duck, A races. All: LB / RB bet, B stands up ----
  seated(mode, btn, pressed, trig, lx, ly, dt) {
    const I = this.input;
    const games = this.game.casino.games;
    this.clearFocus();
    // release whatever was held walking up; Space is Plinko's own
    for (const code of [...this.holding]) if (code !== 'Space') this.set(code, false);
    I.padMove.on = false; I.mouse[0] = false; I.mouse[2] = false;
    if (mode === 'plinko') {
      games.padAim(lx || axis(btn, B.RIGHT, B.LEFT), dt);
      this.set('Space', btn[B.A] || trig(B.RT) > 0.35);
    } else if (mode === 'claw') {
      // claw: left stick flies it (across, in / out), LB / RB lower / raise, A or RT is the beam (held)
      games.claw.padClaw(lx || axis(btn, B.RIGHT, B.LEFT), ly || axis(btn, B.DOWN, B.UP), axis(btn, B.RB, B.LB));
      this.set('Space', btn[B.A] || trig(B.RT) > 0.35);
      if (pressed(B.B) || pressed(B.START)) { this.set('Space', false); this.key('Escape'); }
      return;
    } else if (mode === 'duck') {
      this.set('Space', false);
      // ducks sit two by two on the bar: the highlight follows that layout
      const d = games.dk;
      const dir = this.navigate(btn, lx, ly, dt);
      const to = d.pick + ({ left: d.pick % 2 ? -1 : 0, right: d.pick % 2 ? 0 : 1, up: d.pick > 1 ? -2 : 0, down: d.pick < 2 ? 2 : 0 }[dir] || 0);
      if (to !== d.pick && (d.phase === 'bet' || d.phase === 'done')) this.tap('Digit' + (to + 1));
      if (pressed(B.A)) this.tap('Space');
    } else {
      this.set('Space', false);
      // A is the big button: deal between hands, hit during one
      if (pressed(B.A)) this.tap(games.bj.phase === 'play' ? 'KeyH' : 'Space');
      if (pressed(B.X)) this.tap('KeyS');
      if (pressed(B.Y)) this.tap('KeyD');
      if (pressed(B.R3)) this.tap('KeyZ');
    }
    if (pressed(B.LB)) this.tap('ArrowLeft');
    if (pressed(B.RB)) this.tap('ArrowRight');
    if (pressed(B.B) || pressed(B.START)) { this.set('Space', false); this.key('Escape'); }
  }

  // ---- roulette: a cursor again. Left stick moves it over the panel; A or RT drops a chip on what it's over (or
  // presses that button or tab) ----
  roulette(btn, pressed, trig, lx, ly, dt) {
    this.releaseAll();
    const root = this.game.casino.root;
    // cursor stays inside the table (tabs, header, leave are out of reach: LB / RB change tab, B leaves)
    const area = root.querySelector('.roul') || root;
    const r = area.getBoundingClientRect();
    let c = this.cur;
    if (!c) {
      c = this.cur = { el: document.createElement('div'), x: 0, y: 0, on: false, down: false };
      c.el.id = 'padcursor';
      document.body.appendChild(c.el);
    }
    if (!c.on) {
      // starts in the middle of the numbers
      const b = (root.querySelector('.rl-board') || root).getBoundingClientRect();
      c.x = b.left + b.width / 2; c.y = b.top + b.height / 2;
      c.on = true;
      c.el.style.display = '';
    }
    // curve: precise near the centre, full speed at the edge
    const sp = Math.hypot(lx, ly) * 700 * dt;
    c.x = Math.max(Math.max(0, r.left), Math.min(Math.min(window.innerWidth, r.right), c.x + lx * sp));
    c.y = Math.max(Math.max(0, r.top), Math.min(Math.min(window.innerHeight, r.bottom), c.y + ly * sp));
    c.el.style.left = c.x + 'px'; c.el.style.top = c.y + 'px';
    const under = document.elementFromPoint(c.x, c.y);
    let hit = under && area.contains(under) ? under.closest('[data-rb], button, [data-act], [data-tab]') : null;
    if (hit && (!area.contains(hit) || hit.disabled)) hit = null;
    this.setFocus(hit);
    const down = btn[B.A] || trig(B.RT) > 0.35;
    if (down && !c.down && hit) hit.click();
    c.down = down;
    c.el.classList.toggle('down', down);
    if (pressed(B.LEFT)) this.tap('ArrowLeft');
    if (pressed(B.RIGHT)) this.tap('ArrowRight');
    if (pressed(B.X)) this.tap('Space');
    if (pressed(B.Y)) this.tap('KeyC');
    if (pressed(B.LB) || pressed(B.RB)) this.tab(root, pressed(B.RB) ? 1 : -1);
    if (pressed(B.B) || pressed(B.START)) this.key('Escape');
  }

  hideCursor() {
    const c = this.cur;
    if (!c || !c.on) return;
    c.on = false; c.down = false;
    c.el.style.display = 'none';
  }

  // ---- title menu (navigates by arrow keys itself) ----
  titleMenu(btn, pressed, lx, ly, dt) {
    this.releaseAll();
    const dir = this.navigate(btn, lx, ly, dt);
    if (dir) this.key({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir]);
    if (pressed(B.A) || pressed(B.START)) this.key('Enter');
    if (pressed(B.B)) this.key('Escape');
  }

  // ---- every other screen: a highlight over its items ----
  ui(btn, pressed, lx, ly, ry, dt) {
    const g = this.game;
    this.releaseAll();
    const root = this.uiRoot();
    if (!root) { if (pressed(B.START) && g.state === 'paused') this.resume(); return; }
    const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    // start on what's selected, or the first real choice (not close)
    // a panel that redraws (settings after a toggle) replaces the highlighted element: move the highlight to its twin
    if (this.focus && !items.includes(this.focus) && this.focusSig) {
      const twin = items.find((el) => this.sig(el) === this.focusSig);
      if (twin) { this.focus = null; this.setFocus(twin, true); }
    }
    if (!this.focus || !items.includes(this.focus)) this.setFocus(items.find((el) => el.matches('.sel, .is-on, .pad-default')) || items.find((el) => !/close|✕|leave|back/i.test(el.textContent || '')) || items[0] || null);
    const dir = this.navigate(btn, lx, ly, dt);
    const f = this.focus;
    if (dir && f && f.type === 'range' && (dir === 'left' || dir === 'right')) {
      // slider: left / right move it
      const step = +f.step || ((+f.max - +f.min) / 20) || 1;
      f.value = String(Math.max(+f.min, Math.min(+f.max, +f.value + (dir === 'right' ? step : -step))));
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (dir && f && f.dataset.adj && (dir === 'left' || dir === 'right')) {
      // adjustable row (dev speed multiplier): left / right change it
      f.dispatchEvent(new CustomEvent('adj', { detail: dir === 'right' ? 1 : -1 }));
    } else if (dir) this.setFocus(this.nearest(items, f, dir) || f);
    if (pressed(B.A) && this.focus) {
      const el = this.focus;
      if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else { el.click(); g.haptics.play('press'); }
    }
    // settings close back to what opened them (resuming under them would leave them up)
    const setOpen = g.settings && g.settings.open;
    const helpOpen = !document.getElementById('help').classList.contains('hidden'); // pause card's HELP: B returns to the card, not resume
    if (pressed(B.B) || pressed(B.START)) { if (g.state === 'paused' && !setOpen && !helpOpen) this.resume(); else this.key('Escape'); }
    if (pressed(B.LB) || pressed(B.RB)) this.tab(root, pressed(B.RB) ? 1 : -1);
    // right stick scrolls whatever scrolls
    if (ry) {
      let s = this.focus && this.focus.parentElement;
      while (s && s !== document.body && !scrolls(s)) s = s.parentElement;
      // a tab or footer button sits outside the scroller: fall back to the panel's
      if (!s || s === document.body) s = [...root.querySelectorAll('*')].find((el) => scrolls(el) && el.getClientRects().length);
      if (s && s !== document.body) s.scrollTop += ry * 900 * dt;
    }
  }

  resume() {
    document.getElementById('pause').click();
    this.game.hud.show('clickhint', false);
  }

  uiRoot() {
    for (const id of UI_ROOTS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden') && el.getClientRects().length) return el;
    }
    return null;
  }

  // tabs: the selected one's siblings (wardrobe, casino, settings)
  tab(root, dir) {
    const tabs = [...root.querySelectorAll('[data-tab], .tabs button, .wd-tabs button, .set-tabs button')].filter((el) => el.getClientRects().length);
    if (!tabs.length) return;
    let i = tabs.findIndex((t) => t.classList.contains('on') || t.classList.contains('active') || t.getAttribute('aria-selected') === 'true');
    i = ((i < 0 ? 0 : i) + dir + tabs.length) % tabs.length;
    tabs[i].click();
    this.focus = null;
  }

  // d-pad or left stick with key repeat: 'up' | 'down' | 'left' | 'right' | null
  navigate(btn, lx, ly, dt) {
    let d = btn[B.UP] ? 'up' : btn[B.DOWN] ? 'down' : btn[B.LEFT] ? 'left' : btn[B.RIGHT] ? 'right' : null;
    if (!d && Math.hypot(lx, ly) > 0.55) d = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : (ly > 0 ? 'down' : 'up');
    if (!d) { this.navDir = null; return null; }
    if (d !== this.navDir) { this.navDir = d; this.navT = 0.38; return d; }
    this.navT -= dt;
    if (this.navT <= 0) { this.navT = 0.11; return d; }
    return null;
  }

  // closest item in that direction (straight ahead weighs more than off to the side)
  nearest(items, from, dir) {
    if (!from) return items[0];
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestS = Infinity;
    for (const el of items) {
      if (el === from || from.contains(el) || el.contains(from)) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 2) continue;
      // up / down: next row first, then closest across it (a slider's centre is far from a button at the row's end)
      let s = dir === 'up' || dir === 'down' ? along * 6 + side * 0.5 : along + side * 2.2;
      // and stay in their column when there is one (next upgrade on a terminal, not the contract beside it)
      if ((dir === 'up' || dir === 'down') && Math.min(r.right, a.right) - Math.max(r.left, a.left) <= 0) s += 1e5;
      if (s < bestS) { bestS = s; best = el; }
    }
    return best;
  }

  // identifies an element across a redraw: its data-* attributes (settings rows are keyed that way)
  sig(el) {
    return Object.entries(el.dataset).map(([k, v]) => `${k}=${v}`).join('&') || null;
  }

  setFocus(el, quiet) {
    if (this.focus === el) return;
    if (this.focus) this.focus.classList.remove('pad-focus');
    this.focus = el;
    this.focusSig = el ? this.sig(el) : null;
    if (!el) return;
    el.classList.add('pad-focus');
    if (quiet) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // hover effects follow the highlight (wardrobe previews, tips)
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    this.beep(900, 0.03, 'square', 0.06);
    this.game.haptics.play('tick');
  }

  clearFocus() { if (this.focus) { this.focus.classList.remove('pad-focus'); this.focus = null; } }

  // ---- into Input ----
  set(code, on) {
    const I = this.input;
    if (on) {
      if (this.holding.has(code)) return;
      this.holding.add(code);
      if (!I.keys.has(code)) I.justPressed.add(code);
      I.keys.add(code);
      if (I.onKey) I.onKey(code, { padSynth: true });
    } else if (this.holding.has(code)) {
      this.holding.delete(code);
      I.keys.delete(code);
    }
  }

  tap(code) {
    const I = this.input;
    I.justPressed.add(code);
    if (I.onKey) I.onKey(code, { padSynth: true });
  }

  // a real key event, for screens listening to the DOM (title menu, Escape everywhere)
  key(code) {
    for (const type of ['keydown', 'keyup']) {
      const e = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: type === 'keydown' });
      e.padSynth = true;
      window.dispatchEvent(e);
    }
  }

  releaseAll() {
    for (const code of [...this.holding]) this.set(code, false);
    const I = this.input;
    I.padMove.on = false;
    if (I.padActive) { I.mouse[0] = false; I.mouse[2] = false; }
  }
}
