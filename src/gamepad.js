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
//   RB           power (Z, hold for the winch)  LB / RB  previous / next tab (where there are tabs)
//   LT           thrusters / Rail Lance scope
//   RT           fire                           Start        pause / resume
//   L3           thrusters (E)                  View, tap    globe map (M)
//   R3           scoop into the jar (G)         View, hold   emergency recall (R)
//   d-pad ←/→    previous / next weapon
//   d-pad ↑      next power (the mouse wheel)
//   d-pad ↓      the quick slot: tap to use it, HOLD to pick what it is (left/right while holding,
//                or keep holding to step through): empty the jar, wardrobe, reputation log, pen
//                link, Teleporter, help, music. The chip under the power chip shows which.
import { WEAPONS, weaponUnlocked } from './weapons.js';

const DEAD = 0.18; // stick deadzone (radial)
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// buttons held straight onto default key codes in play
const HOLD = { [B.A]: 'ShiftLeft', [B.B]: 'KeyQ', [B.X]: 'KeyF', [B.Y]: 'KeyV', [B.LB]: 'Space', [B.RB]: 'KeyZ', [B.L3]: 'KeyE', [B.R3]: 'KeyG' };
// the quick slot on d-pad down: everything that has no button of its own (has: is it yours yet)
const QUICK = [
  { code: 'KeyX', name: 'EMPTY JAR', has: (g) => (g.upgrades.jar || 0) > 0 },
  { code: 'KeyC', name: 'WARDROBE' },
  { code: 'KeyJ', name: 'REPUTATION LOG' },
  { code: 'KeyP', name: 'PEN LINK', has: (g) => (g.upgrades.penlink || 0) > 0 },
  { code: 'KeyT', name: 'TELEPORTER', has: (g) => g.story && g.story.tech.includes('teleport') },
  { code: 'KeyH', name: 'HELP' },
  { code: 'KeyN', name: 'MUSIC ON / OFF' },
];
const QUICK_KEY = 'mr-pad-quick';
// the panels a highlight can work in, topmost first
const UI_ROOTS = ['settings', 'dialog', 'board', 'replog', 'wardrobe', 'casino', 'help', 'pause', 'death', 'globe-wrap'];
const FOCUSABLE = 'button, [data-i], [data-k], [data-f], [data-tab], a[href], input, select, .wd-tile, [role="button"]';

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
    this.downT = -1; // how long d-pad down has been held (tap = use the quick slot, hold = pick it)
    this.quickStepT = 0;
    try { this.quick = localStorage.getItem(QUICK_KEY) || 'KeyX'; } catch { this.quick = 'KeyX'; }
    this.input.padMove = { x: 0, y: 0, on: false };
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
    else { this.clearFocus(); this.releaseAll(); I.padMove.on = false; }
  }

  // ---- per frame ----
  update(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; if (p.mapping === 'standard') break; }
    if (!gp) return;
    const btn = gp.buttons.map((b) => !!b && (b.pressed || b.value > 0.5));
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
    if (!this.input.padActive) { this.prev = btn; return; }
    const pressed = (i) => btn[i] && !this.prev[i];
    const released = (i) => !btn[i] && this.prev[i];
    const g = this.game;
    const menu = g.menu && g.menu.open;
    const st = g.state;
    if (menu) this.titleMenu(btn, pressed, lx, ly, dt);
    else if (st === 'play') this.play(gp, btn, pressed, released, trig, lx, ly, rx, ry, dt);
    else if (st === 'derby') this.derby(btn, pressed, rx, ry, dt);
    else if (st === 'dead') { this.releaseAll(); if (pressed(B.A) || pressed(B.START)) document.getElementById('death').click(); }
    else this.ui(btn, pressed, lx, ly, ry, dt);
    this.prev = btn;
  }

  // ---- play ----
  play(gp, btn, pressed, released, trig, lx, ly, rx, ry, dt) {
    const g = this.game, I = this.input;
    this.clearFocus();
    // sticks: analog movement (and WASD past halfway, for vehicles, tricks and anything reading keys)
    I.padMove.x = lx; I.padMove.y = ly; I.padMove.on = !!(lx || ly);
    this.set('KeyW', ly < -0.45); this.set('KeyS', ly > 0.45); this.set('KeyA', lx < -0.45); this.set('KeyD', lx > 0.45);
    this.look(rx, ry, dt);
    for (const [i, code] of Object.entries(HOLD)) this.set(code, btn[i]);
    I.mouse[0] = trig(B.RT) > 0.35;
    I.mouse[2] = trig(B.LT) > 0.35;
    // (left/right are the weapons, except while d-pad down is held: then they pick the quick slot)
    if (pressed(B.LEFT) && !btn[B.DOWN]) this.cycleWeapon(-1);
    if (pressed(B.RIGHT) && !btn[B.DOWN]) this.cycleWeapon(1);
    if (pressed(B.UP)) I.wheelSteps += 1;
    // View: a tap opens the map, holding it is the emergency recall (R, held)
    if (btn[B.VIEW]) { this.viewT = this.viewT < 0 ? 0 : this.viewT + dt; this.set('KeyR', this.viewT > 0.35); }
    else if (this.viewT >= 0) { if (this.viewT <= 0.35) this.tap('KeyM'); this.set('KeyR', false); this.viewT = -1; }
    this.quickSlot(btn, pressed, dt);
    if (pressed(B.START)) this.pause();
  }

  // d-pad down: tap = use the quick slot; hold = pick it (left/right, or keep holding to step)
  quickSlot(btn, pressed, dt) {
    const g = this.game;
    const list = QUICK.filter((q) => !q.has || q.has(g));
    let i = Math.max(0, list.findIndex((q) => q.code === this.quick));
    if (btn[B.DOWN]) {
      this.downT = this.downT < 0 ? 0 : this.downT + dt;
      if (this.downT > 0.35) {
        // picking: left/right step it, and holding on steps it every so often
        let step = 0;
        if (pressed(B.LEFT)) step = -1;
        if (pressed(B.RIGHT)) step = 1;
        this.quickStepT -= dt;
        if (!this.picking) { this.picking = true; this.quickStepT = 0.9; }
        else if (!step && this.quickStepT <= 0) step = 1;
        if (step) {
          i = (i + step + list.length) % list.length;
          this.quick = list[i].code;
          this.quickStepT = 0.9;
          try { localStorage.setItem(QUICK_KEY, this.quick); } catch { /* unavailable */ }
          if (g.audio && g.audio.tone) g.audio.tone(760, 0.04, 'square', 0.04);
        }
      }
    } else if (this.downT >= 0) {
      // let go: a quick tap uses it; after picking, it just stays picked
      if (!this.picking && list[i]) this.pulse(list[i].code);
      this.downT = -1;
      this.picking = false;
    }
    this.drawQuick(list, i);
  }

  // the chip: which feature d-pad down does (and, while picking, the list to choose from)
  drawQuick(list, i) {
    let el = document.getElementById('padquick');
    if (!el) {
      el = document.createElement('div');
      el.id = 'padquick';
      el.className = 'chip';
      const p = document.getElementById('powerchip') || document.getElementById('weaponchip');
      if (p) p.after(el); else document.getElementById('hud').appendChild(el);
    }
    const cur = list[i] ? list[i].name : '—';
    const html = this.picking
      ? `<b>↓</b> ◀ <span class="pq-on">${cur}</span> ▶ <small>${i + 1}/${list.length}</small>`
      : `<b>↓</b> ${cur} <small>HOLD: CHANGE</small>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle('picking', !!this.picking);
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
    if (!this.focus || !items.includes(this.focus)) this.setFocus(items.find((el) => el.matches('.sel, .is-on, .pad-default')) || items.find((el) => !/close|✕|leave|back/i.test(el.textContent || '')) || items[0] || null);
    const dir = this.navigate(btn, lx, ly, dt);
    const f = this.focus;
    if (dir && f && f.type === 'range' && (dir === 'left' || dir === 'right')) {
      // a slider: left and right move it
      const step = +f.step || ((+f.max - +f.min) / 20) || 1;
      f.value = String(Math.max(+f.min, Math.min(+f.max, +f.value + (dir === 'right' ? step : -step))));
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (dir) this.setFocus(this.nearest(items, f, dir) || f);
    if (pressed(B.A) && this.focus) {
      const el = this.focus;
      if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else el.click();
    }
    if (pressed(B.B)) { if (g.state === 'paused') this.resume(); else this.key('Escape'); }
    if (pressed(B.START)) { if (g.state === 'paused') this.resume(); else this.key('Escape'); }
    if (pressed(B.LB) || pressed(B.RB)) this.tab(root, pressed(B.RB) ? 1 : -1);
    // the right stick scrolls whatever scrolls
    if (ry) {
      let s = this.focus && this.focus.parentElement;
      while (s && s !== document.body && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
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
      const s = along + side * 2.2;
      if (s < bestS) { bestS = s; best = el; }
    }
    return best;
  }

  setFocus(el) {
    if (this.focus === el) return;
    if (this.focus) this.focus.classList.remove('pad-focus');
    this.focus = el;
    if (!el) return;
    el.classList.add('pad-focus');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // (hover effects follow the highlight: the wardrobe previews what it's on, tips show)
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    if (this.game.audio && this.game.audio.tone) this.game.audio.tone(900, 0.03, 'square', 0.03);
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
