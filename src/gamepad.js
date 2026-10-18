// Controller support (the browser Gamepad API, standard mapping: Xbox / PlayStation / Switch Pro).
//
// In play the pad drives the same actions the keyboard and mouse do, by their default key codes
// straight into Input (so keyboard rebinding never gets in the way): the left stick moves (analog,
// and as WASD for anything that reads keys), the right stick looks, the triggers are the mouse
// buttons. In menus it's a highlight you move with the d-pad or left stick over whatever is on
// screen (buttons, cards, tiles, sliders): A presses it, B backs out (Escape), the right stick
// scrolls. The title menu has its own arrow-key navigation, so there the pad just sends arrows.
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
//   (the pad rumbles too, and a PlayStation pad lights up and gets adaptive triggers: see haptics.js, sonyout.js)
//   (with the dev free cam on: LB / RB are its up / down, LT is fast, d-pad ↑ / ↓ change its speed, d-pad → hides the HUD: freecam.js)
//   d-pad ↓      the radial menu (tap to open, tap again to close): vehicles, powers, wardrobe, reputation log,
//                empty the jar (vehicles and powers open their own wheel of the ones you own:
//                same controls; a power you pick on its wheel is the one RB uses). The right stick picks a wedge (the
//                highlight glows like the minimap: purple on the dark side, white in the light), A or
//                d-pad ↓ again uses it, B / Start cancels.
import { WEAPONS, weaponUnlocked } from './weapons.js';
import { Glyphs, glyphState, glyphHtml } from './glyphs.js';
import { GyroPad } from './gyro.js';
import { SonyOut } from './sonyout.js';
import { DEV_TOOLS } from './devtools.js';

const DEAD = 0.18; // stick deadzone (radial)
const AIM_SHOW = 10; // seconds the crosshair stays up after the last shot
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// buttons held straight onto default key codes in play
const HOLD = { [B.A]: 'ShiftLeft', [B.B]: 'KeyQ', [B.X]: 'KeyF', [B.Y]: 'KeyV', [B.LB]: 'Space', [B.RB]: 'KeyE', [B.L3]: 'Thrust', [B.R3]: 'KeyG' };
// the radial menu on d-pad down: everything that has no button of its own, clockwise from the top.
// `has`: is it yours yet (the wedge stays in place, dimmed, until it is); `code`: the key it presses
const RADIAL = [
  { id: 'vehicles', name: 'VEHICLES', has: (g) => g.garage && !g.player.rag && (g.garage.owned().length > 0 || !!g.player.vehicle), state: (g) => (g.player.vehicle ? 'GET OUT' : '') },
  { id: 'powers', name: 'POWERS', has: (g) => g.powers && !g.player.rag && g.powers.owned().length > 0 }, // (the pen link and Teleporter are on it)
  { code: 'KeyC', name: 'WARDROBE' },
  { code: 'KeyJ', name: 'REP LOG' },
  { id: 'jar', code: 'KeyX', name: 'EMPTY JAR', has: (g) => (g.upgrades.jar || 0) > 0 },
];
// the panels a highlight can work in, topmost first
const UI_ROOTS = ['settings', 'dialog', 'board', 'replog', 'wardrobe', 'casino', 'help', 'pause', 'death', 'globe-wrap'];
const FOCUSABLE = 'button, [data-i], [data-k], [data-f], [data-tab], [data-buy], a[href], input, select, .wd-tile, [role="button"]'; // ([data-i]: a contract on a job terminal, [data-buy]: one of its upgrades)

// which glyph set to show: PlayStation (Sony 054c) and Switch (Nintendo 057e) pads, else Xbox
export function padKind(id = '') {
  if (/xbox|045e|xinput|microsoft/i.test(id)) return 'xbox'; // (before the PlayStation test: "Xbox Wireless Controller" would match its "wireless controller")
  if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(id)) return 'ps';
  if (/057e|nintendo|switch|pro controller|joy-?con/i.test(id)) return 'switch';
  return 'xbox';
}

export class Gamepad {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.prev = [];
    this.holding = new Set(); // codes this pad is holding down in Input
    this.viewT = -1; // how long View has been held (tap = map, hold = recall)
    this.navT = 0; // menu navigation key-repeat
    this.navDir = null;
    this.focus = null;
    this.aimT = AIM_SHOW; // seconds since the last shot (starts faded out)
    this.radial = null; // the open radial menu: { sel } (null while closed)
    this.input.padMove = { x: 0, y: 0, on: false };
    this.kind = 'xbox';
    this.glyphs = new Glyphs();
    // PlayStation motion sensors (WebHID): while Circle is held, tilting the pad stands in for the left stick
    this.gyro = new GyroPad();
    this.gyroOn = false;
    this.gyro.init();
    this.fx = new SonyOut(this.gyro); // ...and, over the same link, the pad's rumble, lightbar and adaptive triggers (haptics.js)
    window.addEventListener('gamepadconnected', (e) => {
      this.game.hud.toast(`Controller connected: ${(e.gamepad.id || 'gamepad').replace(/\(.*\)/, '').trim().slice(0, 40)}`, 2.5);
    });
    window.addEventListener('gamepaddisconnected', () => { this.releaseAll(); this.setActive(false); });
    // back on the keyboard or mouse: the pad steps aside
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
    // key names across the UI become this pad's buttons (and back), and so do the help tables
    this.glyphs.set(on, this.kind);
    const s = this.game.settings;
    if (s) s.updateHelp();
    // (the settings controls tab shows pad buttons or key binds, whichever is in use)
    if (s && s.open && s.tab === 'controls' && !s.rebinding) s.render();
  }

  // ---- per frame ----
  update(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; if (p.mapping === 'standard') break; }
    if (this.game.haptics) this.game.haptics.attach(gp);
    if (!gp) return;
    const kind = padKind(gp.id);
    if (kind !== this.kind) { this.kind = kind; if (this.input.padActive) { this.glyphs.set(false); this.glyphs.set(true, kind); } else glyphState.kind = kind; }
    const btn = gp.buttons.map((b) => !!b && (b.pressed || b.value > 0.5));
    if (this.comboMask && !btn[this.comboMask]) this.comboMask = 0;
    if (this.comboMask) btn[this.comboMask] = false; // (the Y that finished the combo isn't also "vehicle")
    const trig = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    const stick = (ax, ay) => {
      const x = gp.axes[ax] || 0, y = gp.axes[ay] || 0;
      const m = Math.hypot(x, y);
      if (m < DEAD) return [0, 0];
      const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; // (rescaled past the deadzone: no dead patch at the edge of it)
      return [x * k, y * k];
    };
    const [lx, ly] = stick(0, 1), [rx, ry] = stick(2, 3);
    const any = btn.some(Boolean) || lx || ly || rx || ry;
    if (any && !this.input.padActive) this.setActive(true);
    if (!this.input.padActive) { this.prev = btn; if (!btn.some(Boolean)) this.gwWas = false; return; } // (gwWas: a wheel the keyboard closed is forgotten once the pad is idle; a button held through the switch stays masked)
    const pressed = (i) => btn[i] && !this.prev[i];
    const released = (i) => !btn[i] && this.prev[i];
    const g = this.game;
    const menu = g.menu && g.menu.open;
    const st = g.state;
    if (DEV_TOOLS && st === 'play' && !menu && !(g.settings && g.settings.open)) this.devCombo(pressed, dt);
    const setOpen = g.settings && g.settings.open;
    if (this.radial && (st !== 'play' || menu || setOpen)) this.closeRadial(); // (a dialog or screen opened over it)
    if (g.garage && g.garage.radial && (st !== 'play' || menu || setOpen)) { g.garage.closeRadial(false); g.vHold = 0; }
    if (g.powers.radial && (st !== 'play' || menu || setOpen)) g.powers.closeRadial(false);
    if (this.gyroOn && (st !== 'play' || menu || setOpen)) { this.gyroOn = false; this.gyro.end(); }
    const roul = st === 'casino' && !g.casino.mode && g.casino.tab === 'roulette' && !setOpen && !menu;
    if (!roul) this.hideCursor();
    if (setOpen) this.ui(btn, pressed, lx, ly, ry, dt); // settings sit over the title / pause card: they get the highlight
    else if (menu) this.titleMenu(btn, pressed, lx, ly, dt);
    else if (st === 'play') this.play(gp, btn, pressed, released, trig, lx, ly, rx, ry, dt);
    else if (st === 'derby') this.derby(btn, pressed, rx, ry, dt);
    else if (st === 'map') this.map(btn, pressed, released, trig, lx, ly, ry, dt);
    else if (roul) this.roulette(btn, pressed, trig, lx, ly, dt);
    else if (st === 'casino' && g.casino.mode) this.seated(g.casino.mode, btn, pressed, trig, lx, ly, dt);
    else if (st === 'dead') { this.releaseAll(); if (pressed(B.A) || pressed(B.START)) document.getElementById('death').click(); }
    else if (st === 'cutscene') { this.releaseAll(); if (pressed(B.A) || pressed(B.B) || pressed(B.START)) this.tap('Space'); } // (the cutscenes skip on Space: the recall shuttle, the med-evac and the council's vote)
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

  // the crosshair (pad or mouse) shows while firing and fades away AIM_SHOW seconds after the last shot; in a
  // vehicle with a turret (the APC) it stays up the whole time, since that is where the turret is pointing
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
    // PlayStation gyro: with Circle held, how far the pad has been turned since Circle went down is added to the
    // left stick, so the same lines below move you on the ground and flip / spin you in the air
    const gy = this.gyroStick(btn);
    if (gy) {
      lx += gy.x; ly += gy.y;
      const m = Math.hypot(lx, ly);
      if (m > 1) { lx /= m; ly /= m; }
    }
    // sticks: analog movement (and WASD past halfway, for vehicles, tricks and anything reading keys)
    I.padMove.x = lx; I.padMove.y = ly; I.padMove.on = !!(lx || ly);
    this.set('KeyW', ly < -0.45); this.set('KeyS', ly > 0.45); this.set('KeyA', lx < -0.45); this.set('KeyD', lx > 0.45);
    // (the right stick picks a wedge while the radial menu is open, so it doesn't look round; A and B
    // are the radial's own buttons then, and aren't a jump or a trick)
    // the vehicle wheel (garage: from this menu's VEHICLES wedge, or hold Y) and the power wheel (from its POWERS wedge).
    // Before the menu below, which may be what opens them.
    const gw = g.garage && g.garage.radial;
    const pw = g.powers.radial;
    if (this.gwWas && !gw) this.radialMask = true; // (the wheel was just closed from outside, by letting go of Y: whatever else is held isn't a jump or a trick)
    this.gwWas = !!gw;
    const wheelUsed = gw ? this.vehicleWheel(gw, pressed, rx, ry) : pw ? this.powerWheel(pw, pressed, rx, ry) : false;
    if (!this.radial && !gw && !pw) this.look(rx, ry, dt);
    // (A, B and Y are held back while the wheel is open and until they're let go after it closes, so the press that
    // used or cancelled it isn't also a jump, a trick or the vehicle key a frame later)
    const hold = !!(this.radial || this.radialMask);
    const wheelOpen = !!(g.garage && g.garage.radial) || !!pw;
    const gwSticky = !!(gw && gw.sticky) || !!pw; // (opened from the menu: Y isn't its key, as it isn't the menu's)
    if (this.radialMask && !this.radial && !btn[B.A] && !btn[B.B] && !btn[B.Y]) this.radialMask = false;
    for (const [i, code] of Object.entries(HOLD)) this.set(code, btn[i] && !((hold || wheelOpen) && (i == B.A || i == B.B)) && !((hold || gwSticky) && i == B.Y));
    I.mouse[0] = trig(B.RT) > 0.35;
    I.mouse[2] = trig(B.LT) > 0.35;
    // the dev free cam (freecam.js) has the buttons while it is on: LB up, RB down, LT fast, d-pad ↑ / ↓ its speed, d-pad → the HUD on
    // and off (so the d-pad is not the weapon and power switch, nor the radial menu below)
    const fc = g.cheats.freeCam;
    if (fc.on) fc.pad = { rise: (btn[B.LB] ? 1 : 0) - (btn[B.RB] ? 1 : 0), fast: trig(B.LT) > 0.35, speed: (btn[B.UP] ? 1 : 0) - (btn[B.DOWN] ? 1 : 0), hud: pressed(B.RIGHT) };
    // (not while the wheel is open or d-pad down is down: a diagonal press on the way to ↓ isn't a weapon swap)
    else if (!this.radial && !gw && !pw && !btn[B.DOWN]) {
      if (pressed(B.LEFT)) this.cycleWeapon(-1);
      if (pressed(B.RIGHT)) this.cycleWeapon(1);
      if (pressed(B.UP)) I.wheelSteps += 1;
    }
    // View: a tap opens the map, holding it is the emergency recall (R, held)
    if (btn[B.VIEW]) { this.viewT = this.viewT < 0 ? 0 : this.viewT + dt; this.set('KeyR', this.viewT > 0.35); }
    else if (this.viewT >= 0) { if (this.viewT <= 0.35) this.tap('KeyM'); this.set('KeyR', false); this.viewT = -1; }
    const wasOpen = !!this.radial || !!gw || !!pw; // (Start cancels a wheel without also pausing)
    if (!wheelUsed && !fc.on) this.radialMenu(btn, pressed, rx, ry);
    if (pressed(B.START) && !wasOpen) this.pause();
  }

  // The vehicle wheel works like the menu's: the right stick picks (the pick stays until you pick another),
  // A calls it (a vehicle that can't come yet buzzes and the wheel stays up), d-pad ↓ again calls the pick or
  // closes the wheel if none is picked, B / Start cancels. (Opened by hold-Y instead, it's Y's release that calls,
  // and only B / Start are used here.) Returns true when a press was used here, so the menu doesn't also see it.
  vehicleWheel(gw, pressed, rx, ry) {
    const g = this.game, gar = g.garage;
    const cancel = () => { gar.closeRadial(false); g.vHold = 0; this.radialMask = true; return true; }; // (vHold: or letting go of Y would call it anyway)
    // (a ride, a death or a vehicle you're already in: nothing to call)
    if (g.rides.ride || g.player.dead || g.player.vehicle || g.player.rag) return cancel();
    gar.radialStick(rx, ry);
    if (pressed(B.B) || pressed(B.START)) return cancel();
    if (!gw.sticky) return false;
    const q = gw.sel >= 0 ? gw.items[gw.sel] : null;
    const notReady = !!q && (gar.cooldown(q) > 0 || g.boardCooldown > 0);
    if (pressed(B.A)) {
      if (notReady) { if (g.audio && g.audio.tone) g.audio.tone(180, 0.1, 'sawtooth', 0.05); return true; } // (stays open, like a locked wedge)
      gar.closeRadial(true); this.radialMask = true;
      return true;
    }
    if (pressed(B.DOWN)) { gar.closeRadial(!notReady); this.radialMask = true; return true; }
    return false;
  }

  // The power wheel: the right stick picks (the pick stays until you pick another), A equips it (the winch's cable
  // being on buzzes and the wheel stays up), d-pad ↓ equips the pick or closes the wheel if none is picked,
  // B / Start cancels. Always returns true: the wheel is sticky, so the menu behind it never sees a press.
  powerWheel(pw, pressed, rx, ry) {
    const g = this.game, pows = g.powers;
    const done = (commit) => { pows.closeRadial(commit); this.radialMask = true; };
    if (g.player.dead || g.player.rag) { done(false); return true; } // (a ragdoll can't use powers)
    pows.radialStick(rx, ry);
    const q = pows.radialPick();
    if (pressed(B.B) || pressed(B.START)) done(false);
    else if (pressed(B.A)) {
      if (!pows.pickable(q)) { if (g.audio && g.audio.tone) g.audio.tone(180, 0.1, 'sawtooth', 0.05); g.hud.toast('Let go of the cable first.', 1.5); } // (stays open)
      else done(true);
    } else if (pressed(B.DOWN)) done(pows.pickable(q));
    return true;
  }

  // the gyro's virtual stick while Circle is held on a PlayStation pad (null otherwise); starts and stops its tracking on the press
  gyroStick(btn) {
    const G = this.gyro, S = this.game.settings;
    const on = this.kind === 'ps' && G.live() && !(S && S.v.gyro === false) && btn[B.B] && !this.radial && !this.radialMask && !this.gwWas && !(this.game.garage && this.game.garage.radial) && !this.game.powers.radial;
    if (on !== this.gyroOn) { this.gyroOn = on; if (on) G.begin(); else G.end(); }
    if (!on) return null;
    const v = S ? S.v : {};
    return G.stick(v.gyroRange || 30, 5, !!v.gyroInvX, !!v.gyroInvY);
  }

  // d-pad down: tap to open the radial menu, tap again to use the highlighted wedge (or just close it
  // if none is picked). The right stick picks (the pick stays until you pick another), A uses it,
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
        if (g.audio && g.audio.tone) g.audio.tone(700 + sel * 40, 0.04, 'square', 0.06);
      }
    }
    if (pressed(B.B) || pressed(B.START)) { this.closeRadial(); return; }
    if (pressed(B.A) || pressed(B.DOWN)) {
      let q = R.sel >= 0 ? RADIAL[R.sel] : null;
      const locked = !!(q && q.has && !q.has(g));
      if (locked && pressed(B.A)) { if (g.audio && g.audio.tone) g.audio.tone(180, 0.1, 'sawtooth', 0.05); return; } // (A on a wedge that isn't yours yet: stays open)
      if (locked) q = null; // (d-pad ↓ on one just closes the wheel)
      this.closeRadial();
      // (a held d-pad ↓ must not also step the highlight in whatever screen this opens)
      if (pressed(B.DOWN)) { this.navDir = 'down'; this.navT = 0.38; }
      if (q) this.useRadial(q);
      return;
    }
    this.drawRadial();
  }

  useRadial(q) {
    const g = this.game;
    if (q.id === 'vehicles') {
      // (the same guards as the V key: nothing on a transit ride or right after a screen closes; inside a vehicle it gets you out)
      if (g.rides.ride || g.boardCooldown > 0) return;
      if (g.player.vehicle) g.garage.exit(); else g.garage.openRadial(true); // (the vehicle wheel, which then takes the stick, A and B)
    } else if (q.id === 'powers') g.powers.openRadial(); // (the power wheel, which then takes the stick, A and B)
    else if (q.id === 'jar') g.alchemy.empty(false); // (the X key needs a one-second hold: this is already a deliberate pick)
    else this.pulse(q.code);
  }

  openRadial() {
    if ((this.game.garage && this.game.garage.radial) || this.game.powers.radial) return; // (the hold-Y vehicle picker or the power wheel is up)
    this.radial = { sel: -1, hub: '' };
    this.game.vHold = 0; // (a vehicle key still going down isn't a tap: Y is held back while the wheel is up)
    this.set('KeyV', false); this.input.justPressed.delete('KeyV'); // (and one pressed this very frame, along with d-pad down, isn't either)
    this.drawRadial(true);
    if (this.game.audio && this.game.audio.tone) this.game.audio.tone(520, 0.08, 'triangle', 0.12);
  }

  closeRadial() {
    if (this.radial) this.radialMask = true;
    this.radial = null;
    const el = document.getElementById('padradial');
    if (el) el.classList.add('hidden');
  }

  // the wheel: built once per opening, then only the highlight moves
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
      // (labels that show a state, like VEHICLES' GET OUT, follow it while the wheel is up)
      if (q.state && !it.classList.contains('locked')) { const s = it.querySelector('small'), t = q.state(g); if (s && s.textContent !== t) s.textContent = t; }
    });
    const q = R.sel >= 0 ? RADIAL[R.sel] : null;
    const hub = `${q ? `<b>${q.name}</b>` : 'MENU'}<small><span>${glyphHtml(['RS'])} pick</span><span>${glyphHtml(['A'])} use</span><span>${glyphHtml(['B'])} cancel</span></small>`;
    if (R.hub !== hub) { R.hub = hub; el.querySelector('.pr-hub').innerHTML = hub; }
  }
  // a key held for a couple of frames (some actions read it held, some on the press)
  pulse(code) {
    this.set(code, true);
    setTimeout(() => this.set(code, false), 60);
  }

  look(rx, ry, dt) {
    // a curve for precision near the centre, full speed at the edge (in mouse-pixel terms, so the
    // game's own look sensitivity and invert settings apply)
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

  // ---- the globe map: a cursor on the left stick; RT, held, grabs the globe to drag it round ----
  map(btn, pressed, released, trig, lx, ly, ry, dt) {
    this.releaseAll();
    this.clearFocus();
    this.game.globe.padUpdate(lx, ly, trig(B.RT) > 0.35, ry, (btn[B.RB] ? 1 : 0) - (btn[B.LB] ? 1 : 0), dt);
    // (View closes on the release, so letting go of it can't be read as the tap that opens the map)
    if (pressed(B.B) || pressed(B.START)) this.key('Escape');
    else if (pressed(B.A)) this.game.globe.padClick(); // (the Radio Tower's sweep, or the dev menu's click-to-teleport)
    else if (pressed(B.X) && this.game.globe.mode === 'radio') this.game.globe.radioToggle(); // (stop / resume the sweep)
    else if (released(B.VIEW)) this.tap('KeyM');
  }

  // ---- seated at a casino game. Plinko: the left stick (or d-pad) aims, A or RT drops (held: a
  // stream). Blackjack: A deals and hits, X stands, Y doubles. Duck Derby: the left stick (or
  // d-pad) picks a duck, A starts the race. All three: LB / RB bet, B stands up ----
  seated(mode, btn, pressed, trig, lx, ly, dt) {
    const I = this.input;
    const games = this.game.casino.games;
    this.clearFocus();
    // (whatever was held walking up is let go; Space is Plinko's own)
    for (const code of [...this.holding]) if (code !== 'Space') this.set(code, false);
    I.padMove.on = false; I.mouse[0] = false; I.mouse[2] = false;
    if (mode === 'plinko') {
      games.padAim(lx || (btn[B.RIGHT] ? 1 : 0) - (btn[B.LEFT] ? 1 : 0), dt);
      this.set('Space', btn[B.A] || trig(B.RT) > 0.35);
    } else if (mode === 'claw') {
      // the claw: the left stick flies it (across and in and out), LB / RB lower and raise it, A or RT is the beam (held)
      games.claw.padClaw(lx || (btn[B.RIGHT] ? 1 : 0) - (btn[B.LEFT] ? 1 : 0), ly || (btn[B.DOWN] ? 1 : 0) - (btn[B.UP] ? 1 : 0), (btn[B.RB] ? 1 : 0) - (btn[B.LB] ? 1 : 0));
      this.set('Space', btn[B.A] || trig(B.RT) > 0.35);
      if (pressed(B.B) || pressed(B.START)) { this.set('Space', false); this.key('Escape'); }
      return;
    } else if (mode === 'duck') {
      this.set('Space', false);
      // (the ducks sit two by two on the bar: the highlight moves the way they're laid out)
      const d = games.dk;
      const dir = this.navigate(btn, lx, ly, dt);
      const to = d.pick + ({ left: d.pick % 2 ? -1 : 0, right: d.pick % 2 ? 0 : 1, up: d.pick > 1 ? -2 : 0, down: d.pick < 2 ? 2 : 0 }[dir] || 0);
      if (to !== d.pick && (d.phase === 'bet' || d.phase === 'done')) this.tap('Digit' + (to + 1));
      if (pressed(B.A)) this.tap('Space');
    } else {
      this.set('Space', false);
      // (A is whatever the big button is: deal between hands, hit during one)
      if (pressed(B.A)) this.tap(games.bj.phase === 'play' ? 'KeyH' : 'Space');
      if (pressed(B.X)) this.tap('KeyS');
      if (pressed(B.Y)) this.tap('KeyD');
      if (pressed(B.R3)) this.tap('KeyZ');
    }
    if (pressed(B.LB)) this.tap('ArrowLeft');
    if (pressed(B.RB)) this.tap('ArrowRight');
    if (pressed(B.B) || pressed(B.START)) { this.set('Space', false); this.key('Escape'); }
  }

  // ---- the casino's roulette table: the map's cursor again. The left stick moves it over the
  // panel; A or RT drops a chip on what it's over (or presses the button or tab it's on) ----
  roulette(btn, pressed, trig, lx, ly, dt) {
    this.releaseAll();
    const root = this.game.casino.root;
    // (the cursor stays inside the table itself: the tabs, header and leave button are out of its reach, LB / RB change tab and B leaves)
    const area = root.querySelector('.roul') || root;
    const r = area.getBoundingClientRect();
    let c = this.cur;
    if (!c) {
      c = this.cur = { el: document.createElement('div'), x: 0, y: 0, on: false, down: false };
      c.el.id = 'padcursor';
      document.body.appendChild(c.el);
    }
    if (!c.on) {
      // (it starts in the middle of the numbers)
      const b = (root.querySelector('.rl-board') || root).getBoundingClientRect();
      c.x = b.left + b.width / 2; c.y = b.top + b.height / 2;
      c.on = true;
      c.el.style.display = '';
    }
    // (a curve for precision near the centre, full speed at the edge)
    const sp = Math.hypot(lx, ly) * 700 * dt;
    c.x = Math.max(Math.max(0, r.left), Math.min(Math.min(window.innerWidth, r.right), c.x + lx * sp));
    c.y = Math.max(Math.max(0, r.top), Math.min(Math.min(window.innerHeight, r.bottom), c.y + ly * sp));
    c.el.style.left = c.x + 'px'; c.el.style.top = c.y + 'px';
    const under = document.elementFromPoint(c.x, c.y);
    let hit = under && area.contains(under) ? under.closest('[data-rb], button, [data-act], [data-tab]') : null;
    if (hit && !area.contains(hit)) hit = null;
    if (hit && hit.disabled) hit = null;
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

  // ---- the title menu (it navigates by arrow keys itself) ----
  titleMenu(btn, pressed, lx, ly, dt) {
    this.releaseAll();
    const dir = this.navigate(btn, lx, ly, dt);
    if (dir) this.key({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir]);
    if (pressed(B.A) || pressed(B.START)) this.key('Enter');
    if (pressed(B.B)) this.key('Escape');
  }

  // ---- every other screen: a highlight over what's on it ----
  ui(btn, pressed, lx, ly, ry, dt) {
    const g = this.game;
    this.releaseAll();
    const root = this.uiRoot();
    if (!root) { if (pressed(B.START) && g.state === 'paused') this.resume(); return; }
    const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    // (start on what's selected, or the first real choice: not the close button)
    // (a panel that redraws itself, like settings after a toggle, replaces the highlighted element: carry the highlight to its twin)
    if (this.focus && !items.includes(this.focus) && this.focusSig) {
      const twin = items.find((el) => this.sig(el) === this.focusSig);
      if (twin) { this.focus = null; this.setFocus(twin, true); }
    }
    if (!this.focus || !items.includes(this.focus)) this.setFocus(items.find((el) => el.matches('.sel, .is-on, .pad-default')) || items.find((el) => !/close|✕|leave|back/i.test(el.textContent || '')) || items[0] || null);
    const dir = this.navigate(btn, lx, ly, dt);
    const f = this.focus;
    if (dir && f && f.type === 'range' && (dir === 'left' || dir === 'right')) {
      // a slider: left and right move it
      const step = +f.step || ((+f.max - +f.min) / 20) || 1;
      f.value = String(Math.max(+f.min, Math.min(+f.max, +f.value + (dir === 'right' ? step : -step))));
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (dir && f && f.dataset.adj && (dir === 'left' || dir === 'right')) {
      // an adjustable row (the dev menu's speed multiplier): left and right change it
      f.dispatchEvent(new CustomEvent('adj', { detail: dir === 'right' ? 1 : -1 }));
    } else if (dir) this.setFocus(this.nearest(items, f, dir) || f);
    if (pressed(B.A) && this.focus) {
      const el = this.focus;
      if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else { el.click(); g.haptics.play('press'); }
    }
    // (settings close back to whatever opened them: resuming from under them would leave them up)
    const setOpen = g.settings && g.settings.open;
    const helpOpen = !document.getElementById('help').classList.contains('hidden'); // (the pause card's HELP: B goes back to the card rather than resuming)
    if (pressed(B.B) || pressed(B.START)) { if (g.state === 'paused' && !setOpen && !helpOpen) this.resume(); else this.key('Escape'); }
    if (pressed(B.LB) || pressed(B.RB)) this.tab(root, pressed(B.RB) ? 1 : -1);
    // the right stick scrolls whatever scrolls
    if (ry) {
      let s = this.focus && this.focus.parentElement;
      while (s && s !== document.body && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      // (focus on a tab or footer button sits outside the scroller: fall back to the panel's own)
      if (!s || s === document.body) s = [...root.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.getClientRects().length);
      if (s && s !== document.body) s.scrollTop += ry * 900 * dt;
    }
  }

  resume() {
    const g = this.game;
    document.getElementById('pause').click();
    g.hud.show('clickhint', false);
  }

  uiRoot() {
    for (const id of UI_ROOTS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden') && el.getClientRects().length) return el;
    }
    return null;
  }

  // tabs: the selected one's siblings (wardrobe tabs, casino tabs, settings tabs)
  tab(root, dir) {
    const tabs = [...root.querySelectorAll('[data-tab], .tabs button, .wd-tabs button, .set-tabs button')].filter((el) => el.getClientRects().length);
    if (!tabs.length) return;
    let i = tabs.findIndex((t) => t.classList.contains('on') || t.classList.contains('active') || t.getAttribute('aria-selected') === 'true');
    i = ((i < 0 ? 0 : i) + dir + tabs.length) % tabs.length;
    tabs[i].click();
    this.focus = null;
  }

  // d-pad or left stick, with a key repeat: 'up' | 'down' | 'left' | 'right' | null
  navigate(btn, lx, ly, dt) {
    let d = btn[B.UP] ? 'up' : btn[B.DOWN] ? 'down' : btn[B.LEFT] ? 'left' : btn[B.RIGHT] ? 'right' : null;
    if (!d && Math.hypot(lx, ly) > 0.55) d = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : (ly > 0 ? 'down' : 'up');
    if (!d) { this.navDir = null; return null; }
    if (d !== this.navDir) { this.navDir = d; this.navT = 0.38; return d; }
    this.navT -= dt;
    if (this.navT <= 0) { this.navT = 0.11; return d; }
    return null;
  }

  // the closest item in that direction (straight ahead counts for more than off to the side)
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
      // (up / down take the next row first, then the closest across it: a slider's centre is far from a button at the row's end)
      let s = dir === 'up' || dir === 'down' ? along * 6 + side * 0.5 : along + side * 2.2;
      // (and up / down stay in their own column when there is one: the next upgrade on a terminal, not the contract beside it)
      if ((dir === 'up' || dir === 'down') && Math.min(r.right, a.right) - Math.max(r.left, a.left) <= 0) s += 1e5;
      if (s < bestS) { bestS = s; best = el; }
    }
    return best;
  }

  // what identifies an element across a redraw: its data-* attributes (the settings rows are all keyed that way)
  sig(el) {
    return Object.entries(el.dataset).map(([k, v]) => `${k}=${v}`).join('&') || null;
  }

  setFocus(el, quiet) {
    if (this.focus === el) return;
    if (this.focus) this.focus.classList.remove('pad-focus');
    this.focus = el;
    this.focusSig = el ? this.sig(el) : null;
    if (!el) return;
    if (quiet) { el.classList.add('pad-focus'); return; }
    el.classList.add('pad-focus');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // (hover effects follow the highlight: the wardrobe previews what it's on, tips show)
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    if (this.game.audio && this.game.audio.tone) this.game.audio.tone(900, 0.03, 'square', 0.06);
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

  // a real key event, for screens that listen to the DOM (the title menu, Escape everywhere)
  key(code) {
    const e = new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true, cancelable: true });
    e.padSynth = true;
    window.dispatchEvent(e);
    const u = new KeyboardEvent('keyup', { code, key: code, bubbles: true });
    u.padSynth = true;
    window.dispatchEvent(u);
  }

  releaseAll() {
    for (const code of [...this.holding]) this.set(code, false);
    const I = this.input;
    I.padMove.on = false;
    if (I.padActive) { I.mouse[0] = false; I.mouse[2] = false; }
  }
}
