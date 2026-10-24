import * as THREE from 'three';
import { upAt } from './geo.js';
import { glyphHtml, glyphState } from './glyphs.js';

// Free cam (Dev menu → Debug overlay → FREE CAM): the camera leaves the runner and flies free while the game runs on, to watch
// AI paths, pirate markers and traffic. The runner stands still: keys, mouse and wheel belong to the camera (the game gets a
// blank input each frame: takeInput() / giveBack()). View only: sun, shadow box and helmet lamp still follow the runner; nothing
// persists across a reload.
//
//   mouse look · W A S D fly along the view · E / Space up · Q / C down · Shift fast · wheel changes the speed
//   (the game's own bindings, so a remapped W is forward)
//   controller: right stick look · left stick fly · LB up · RB down · LT fast · d-pad ↑ / ↓ change the speed (repeats when held)
//   · d-pad → toggles the HUD (all of #hud: panels, speedometer and hull, prompts, popups, cracked visor; not menus or dialogs,
//   and the dev bits stay: this hint, the git chip, F3); turning free cam off always brings it back
//   (gamepad.js passes the pad's buttons in `pad` each frame; the keys the pad also sends are ignored, so A, B and L3 do nothing)

const SPEED_MIN = 2, SPEED_MAX = 3000, SPEED_START = 40; // m/s (Moon radius 3.6 km)
const FAST = 5; // Shift, LT: speed multiplier
const WHEEL_STEP = 1.25; // speed multiplier per wheel notch
const PAD_NOTCHES = 6; // notches per second while d-pad ↑ / ↓ is held
const PITCH = 1.5; // rad: just short of straight up or down
// states that show the Moon (cutscenes, title tour, Duck Derby etc. drive the camera themselves)
const VIEW_STATES = new Set(['play', 'paused', 'dialog', 'dead']);

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3(), _q = new THREE.Quaternion();
const clamp = THREE.MathUtils.clamp;

export class FreeCam {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.pos = new THREE.Vector3();
    this.fwd = new THREE.Vector3(); // ahead along the ground (yaw turns it about `up`)
    this.up = new THREE.Vector3(); // away from the ground below
    this.pitch = 0;
    this.speed = SPEED_START;
    this.lent = null; // real input state while the game holds the blank one (takeInput to giveBack)
    this.blank = { keys: new Set(), justPressed: new Set(), mouse: [false, false, false], padMove: { x: 0, y: 0, on: false } };
    this.pad = null; // { rise, fast, speed, hud }: this frame's pad buttons (set by gamepad.js play() while on and the pad is in use)
    this.hudOff = false;
    this.hint = null;
    this.hintSpeed = 0;
    this.hintKind = '';
  }

  toggle() {
    if (this.on) this.stop(); else this.start();
    return this.on;
  }

  // starts from the current view
  start() {
    const cam = this.game.camera;
    this.pos.copy(cam.position);
    cam.getWorldDirection(this.fwd);
    upAt(this.pos, this.up);
    this.pitch = clamp(Math.asin(clamp(this.fwd.dot(this.up), -1, 1)), -PITCH, PITCH);
    this.level();
    this.on = true;
    this.showHint();
  }

  stop() {
    this.on = false;
    this.giveBack();
    this.setHud(false);
    if (this.hint) { this.hint.remove(); this.hint = null; }
  }

  // style.css: body.hud-off hides #hud (but not this hint, nor the git chip inside it)
  setHud(off) {
    this.hudOff = off;
    document.body.classList.toggle('hud-off', off);
  }

  // keep the heading along the ground below (it turns away as you go round the sphere)
  level() {
    const f = this.fwd;
    upAt(this.pos, this.up);
    f.addScaledVector(this.up, -f.dot(this.up));
    if (f.lengthSq() < 1e-6) f.crossVectors(this.up, Math.abs(this.up.x) < 0.9 ? X : Y); // looking straight up or down
    f.normalize();
  }

  // main.js frame(), after the pad is read and before the game uses input: look, fly, hand the game a blank input
  takeInput(dt) {
    if (this.lent) this.giveBack(); // a frame threw before giveBack(): keep the real input
    const pd = this.pad;
    this.pad = null; // always consumed: buttons never carry to a later frame
    const g = this.game;
    if (!this.on || g.state !== 'play') return;
    const I = g.input;
    const sv = g.settings ? g.settings.v : null;
    if (pd && pd.hud) this.setHud(!this.hudOff);

    const [mx, my] = I.consumeMouse();
    const sens = 0.0022 * (sv ? sv.sensitivity : 1);
    this.level();
    this.fwd.applyQuaternion(_q.setFromAxisAngle(this.up, -mx * sens));
    this.pitch = clamp(this.pitch - my * sens * (sv && sv.invertY ? -1 : 1), -PITCH, PITCH);
    const wheel = I.consumeWheel(); // notch up is -1: faster
    if (wheel) this.speed = clamp(this.speed * WHEEL_STEP ** -wheel, SPEED_MIN, SPEED_MAX);

    _look.copy(this.fwd).multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up, Math.sin(this.pitch));
    _right.crossVectors(this.fwd, this.up);
    const held = (c) => I.keys.has(c);
    let ahead, side, rise, fast;
    if (pd) { // controller: analog left stick and buttons; its mirrored keys (stick as WASD, A as Shift, B as Q, L3 as E) are ignored
      const pm = I.padMove;
      ahead = pm.on ? -pm.y : 0;
      side = pm.on ? pm.x : 0;
      rise = pd.rise;
      fast = pd.fast;
      if (pd.speed) this.speed = clamp(this.speed * WHEEL_STEP ** (pd.speed * PAD_NOTCHES * dt), SPEED_MIN, SPEED_MAX);
    } else {
      ahead = (held('KeyW') ? 1 : 0) - (held('KeyS') ? 1 : 0);
      side = (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0);
      rise = (held('Space') || held('KeyE') ? 1 : 0) - (held('KeyC') || held('KeyQ') ? 1 : 0);
      fast = held('ShiftLeft') || held('ShiftRight');
    }
    _move.set(0, 0, 0).addScaledVector(_look, ahead).addScaledVector(_right, side).addScaledVector(this.up, rise);
    if (_move.lengthSq() > 1) _move.normalize();
    this.pos.addScaledVector(_move, this.speed * (fast ? FAST : 1) * dt);
    this.level();

    // the game reads these straight off Input: lend it empty ones until giveBack()
    this.lent = { keys: I.keys, justPressed: I.justPressed, mouse: I.mouse, padMove: I.padMove };
    const b = this.blank;
    b.keys.clear(); b.justPressed.clear(); b.mouse.fill(false); b.padMove.x = b.padMove.y = 0; b.padMove.on = false;
    Object.assign(I, b);
  }

  // main.js frame(), just before input.endFrame()
  giveBack() {
    if (!this.lent) return;
    Object.assign(this.game.input, this.lent);
    this.lent = null;
  }

  // main.js frame(), after the game's camera, before world and terrain update round it
  view() {
    if (!this.on || !VIEW_STATES.has(this.game.state)) return;
    const cam = this.game.camera;
    cam.position.copy(this.pos);
    cam.up.copy(this.up);
    _look.copy(this.fwd).multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up, Math.sin(this.pitch));
    cam.lookAt(_look.multiplyScalar(30).add(this.pos));
    this.showHint();
  }

  // key or pad hint (style.css shows one) plus the current speed
  showHint() {
    if (!this.hint) {
      this.hint = document.createElement('div');
      this.hint.id = 'free-cam';
      document.body.appendChild(this.hint);
      this.hintSpeed = 0;
    }
    if (this.hintSpeed === this.speed && this.hintKind === glyphState.kind) return;
    this.hintSpeed = this.speed;
    this.hintKind = glyphState.kind; // Xbox, PlayStation or Switch glyphs
    const s = this.speed;
    const kb = '<b>WASD</b> fly · <b>E</b>/<b>Space</b> up · <b>Q</b>/<b>C</b> down · <b>Shift</b> fast · <b>wheel</b> speed';
    const pad = glyphHtml(['LS', '#fly', 'RS', '#look', 'LB', '#up', 'RB', '#down', 'LT', '#fast', 'DU', 'DD', '#speed', 'DR', '#hud']);
    this.hint.innerHTML = `FREE CAM · <span class="fc-kb">${kb}</span><span class="fc-pad">${pad}</span> · ${s < 10 ? s.toFixed(1) : Math.round(s)} m/s`;
  }
}
