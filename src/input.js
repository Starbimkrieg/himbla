// Keyboard / mouse state with pointer lock.
//
// Key remapping lives here: the rest of the game always asks for the DEFAULT key code of an
// action (e.g. pressed('KeyG') for "scoop"). setBindings({ KeyG: 'KeyT' }) makes the physical
// T key report as 'KeyG', and the physical G key (no longer bound to anything) goes inert.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.onKey = null;
    this.binds = new Map(); // default code -> physical code (only entries that differ)
    this.rev = new Map(); // physical code -> default code

    window.addEventListener('keydown', (e) => {
      const code = this.translate(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) || code === 'Space') e.preventDefault();
      if (!this.keys.has(code)) this.justPressed.add(code);
      this.keys.add(code);
      if (this.onKey) this.onKey(code, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(this.translate(e.code)));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; });
    window.addEventListener('mousedown', (e) => { if (this.locked) this.mouse[e.button] = true; });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.mouse = [false, false, false];
    });
  }

  // map: { defaultCode: physicalCode }. Escape is never remapped.
  setBindings(map = {}) {
    this.binds.clear();
    this.rev.clear();
    for (const [def, phys] of Object.entries(map)) {
      if (!phys || phys === def || def === 'Escape' || phys === 'Escape') continue;
      this.binds.set(def, phys);
      this.rev.set(phys, def);
    }
    this.keys.clear();
    this.justPressed.clear();
  }

  // physical KeyboardEvent.code -> the default code the game listens for
  translate(code) {
    if (code === 'Escape') return code;
    const def = this.rev.get(code);
    if (def) return def;
    // this key's own action moved elsewhere and nothing took its place
    if (this.binds.has(code)) return 'Unbound:' + code;
    return code;
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignored: unsupported */ }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }

  consumeMouse() {
    const d = [this.dx, this.dy];
    this.dx = this.dy = 0;
    return d;
  }

  endFrame() { this.justPressed.clear(); }
}
