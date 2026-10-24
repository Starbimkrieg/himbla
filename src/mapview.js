import * as THREE from 'three';
import { faceDir } from './planet.js';
import { PLANET } from './config.js';
import { SUN, E1, E2, arcDist } from './geo.js';
import { FACTIONS, SHOPS } from './locations.js';
import { pixelFont } from './fonts.js';
import { SWEEP } from './radio.js';

const RES = 32; // exploration cells per cube-face edge (~180 m)
const KEY = 'moonrunner-explore-v1';
const REVEAL = 480; // m uncovered around you
const DISCOVER = 950; // m: settlements get marked this close

// Draggable, zoomable globe with fog of war: only ground you've seen, and settlements you've found (or been sent to).
export class GlobeMap {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('globe');
    this.ctx = this.canvas.getContext('2d');
    this.tip = document.getElementById('globe-tip');
    const n = 6 * RES * RES;
    this.cells = new Float32Array(n * 3);
    const d = new THREE.Vector3();
    const N = PLANET.faceCells;
    let k = 0;
    for (let f = 0; f < 6; f++) for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      faceDir(f, ((i + 0.5) / RES) * N, ((j + 0.5) / RES) * N, d);
      this.cells[k * 3] = d.x; this.cells[k * 3 + 1] = d.y; this.cells[k * 3 + 2] = d.z;
      k++;
    }
    this.explored = new Uint8Array(n);
    this.discovered = new Set(['ilmb']);
    this.Q = new THREE.Quaternion();
    this.zoom = 1;
    this.revealT = 0;
    this.saveT = 0;
    this.laySig = null; // what the ground layer was last drawn for (see draw())
    this.mode = null; // 'radio': opened from the Radio Tower, a click in the fog sends a sweep (setMode)
    this.aim = null; // radio mode: point under the pointer, and its cell
    this.aimCell = -1;
    this.aimOk = false;
    this.radioMsg = ''; // the tower's reason for the last refused pick
    this.load();
    for (const l of game.locations) l.discovered = this.discovered.has(l.id);
    this.bindDrag();
    this.buildLegend();
    this.buildRadioPanel();
  }

  // The legend: each symbol drawn as the map draws it, plus faction colours. Folds to a tab (remembered).
  buildLegend() {
    const el = document.getElementById('globe-legend');
    if (!el) return;
    const icon = (draw) => {
      const cv = document.createElement('canvas');
      cv.width = 34; cv.height = 22;
      const c = cv.getContext('2d');
      c.translate(17, 11);
      c.lineJoin = 'round';
      draw(c);
      return cv;
    };
    const ink = '#120a1e';
    const star = (c, col, r = 8) => { c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = 2.5; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.5 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); };
    const dot = (c, col, r) => { c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke(); };
    const diamond = (c, col, rim, s2 = 6) => { c.fillStyle = col; c.strokeStyle = rim; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -s2); c.lineTo(s2, 0); c.lineTo(0, s2); c.lineTo(-s2, 0); c.closePath(); c.fill(); c.stroke(); };
    const rows = [
      ['PLACES', [
        [icon((c) => star(c, '#ffd23f')), 'Faction HQ'],
        [icon((c) => dot(c, '#2ec4ff', 6)), 'Settlement or base'],
        [icon((c) => dot(c, '#7dff3a', 4.5)), 'Pirate camp'],
        [icon((c) => { dot(c, '#ff3b5c', 4); c.strokeStyle = '#ff2a4a'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 9.5, 0, Math.PI * 2); c.stroke(); }), 'Restricted airspace'],
        [icon((c) => { diamond(c, '#ff9f1c', ink, 4.5); }), 'Outpost'],
        [icon((c) => { c.lineCap = 'round'; c.beginPath(); c.moveTo(-12, 3); c.quadraticCurveTo(0, -7, 12, 3); c.strokeStyle = 'rgba(18,10,30,0.8)'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#e9cf94'; c.lineWidth = 2.4; c.stroke(); }), 'Road'],
      ]],
      ['MARKERS', [
        [icon((c) => { c.rotate(Math.PI / 4); c.fillStyle = '#ff4f2e'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 7); c.lineTo(0, 3); c.lineTo(-7, 7); c.closePath(); c.fill(); c.stroke(); }), 'You'],
        [icon((c) => { c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.stroke(); }), 'Current objective'],
        [icon((c) => { c.fillStyle = '#ff3b5c'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -9); c.lineTo(8, 6); c.lineTo(-8, 6); c.closePath(); c.fill(); c.stroke(); c.fillStyle = ink; c.font = pixelFont(7); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 0, 2); }), 'Faction event'],
        [icon((c) => { c.fillStyle = 'rgba(255,79,46,0.4)'; c.strokeStyle = '#ff4f2e'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill(); c.stroke(); }), 'Meteor shower'],
      ]],
    ];
    const fac = Object.entries(FACTIONS).filter(([, f]) => f.color && f.name);
    let html = `<div class="lg-head"><span>LEGEND</span><button class="lg-fold" title="Hide the legend" aria-label="Hide the legend">▶</button></div><div class="lg-body">`;
    const slots = [];
    rows.forEach(([title, items]) => {
      html += `<div class="lg-sec">${title}</div>`;
      for (const [cv, label] of items) { slots.push(cv); html += `<div class="lg-row"><span class="lg-ic" data-slot="${slots.length - 1}"></span><span>${label}</span></div>`; }
    });
    html += `<div class="lg-sec">TERRITORY</div><div class="lg-fac">${fac.map(([, f]) => `<div class="lg-row"><span class="lg-sw" style="background:${f.color}"></span><span>${f.name}</span></div>`).join('')}</div>`;
    html += `<div class="lg-note">Ground is tinted by whoever holds it. Fog: ground you haven't seen yet.</div></div>`;
    html += `<button class="lg-tab" title="Show the legend" aria-label="Show the legend"><span class="lg-tab-ar">◀</span><span class="lg-tab-t">LEGEND</span></button>`;
    el.innerHTML = html;
    el.querySelectorAll('.lg-ic').forEach((sp) => sp.appendChild(slots[+sp.dataset.slot]));
    const KEYL = 'mr-map-legend';
    let folded = false;
    try { folded = localStorage.getItem(KEYL) === 'folded'; } catch { /* unavailable */ }
    const set = (f) => {
      folded = f;
      el.classList.toggle('folded', f);
      try { localStorage.setItem(KEYL, f ? 'folded' : 'open'); } catch { /* unavailable */ }
    };
    el.classList.toggle('folded', folded);
    el.querySelector('.lg-fold').addEventListener('click', (e) => { e.stopPropagation(); set(true); });
    el.querySelector('.lg-tab').addEventListener('click', (e) => { e.stopPropagation(); set(false); });
  }

  // Radio Tower panel (radio mode only): sweep status, finds, stop / resume button.
  buildRadioPanel() {
    const row = document.querySelector('.globe-row');
    if (!row) return;
    const el = this.radioEl = document.createElement('aside');
    el.id = 'globe-radio';
    el.className = 'hidden';
    el.innerHTML = '<div class="gr-head">RADIO TOWER</div><div class="gr-body"><div class="gr-name"></div>'
      + '<div class="gr-row"><label>STATUS</label><b class="gr-status"></b></div><div class="gr-row"><label>RADIUS</label><b class="gr-r cr"></b></div>'
      + `<div class="otm-meter"><div class="otm-bar"><i class="gr-bar"></i></div><span>MAX ${SWEEP.max.toLocaleString('en-US')} m</span></div><div class="gr-row"><label>NEW GROUND</label><b class="gr-cells cr"></b></div>`
      + '<div class="gr-found"></div><div class="gr-msg"></div><button class="gr-btn"></button><div class="gr-help"></div></div>';
    row.appendChild(el);
    this.gr = {};
    for (const k of ['name', 'status', 'r', 'bar', 'cells', 'found', 'msg', 'btn', 'help']) this.gr[k] = el.querySelector('.gr-' + k);
    this.gr.btn.addEventListener('click', (e) => { e.stopPropagation(); this.gr.btn.blur(); this.radioToggle(); });
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d) return;
      const bin = atob(d.cells);
      if (bin.length === this.explored.length) for (let i = 0; i < bin.length; i++) this.explored[i] = bin.charCodeAt(i);
      for (const id of d.discovered || []) this.discovered.add(id);
    } catch { /* fresh map */ }
  }

  save() {
    try {
      let bin = '';
      for (let i = 0; i < this.explored.length; i++) bin += String.fromCharCode(this.explored[i]);
      localStorage.setItem(KEY, JSON.stringify({ cells: btoa(bin), discovered: [...this.discovered] }));
    } catch { /* storage unavailable */ }
  }

  discover(loc, silent = false) {
    if (loc.discovered) return;
    loc.discovered = true;
    this.discovered.add(loc.id);
    if (!silent) this.game.hud.toast(`NEW LOCATION CHARTED: ${loc.name.toUpperCase()}`, 3);
  }

  // Uncover the map around the player.
  update(dt) {
    this.revealT -= dt;
    this.saveT -= dt;
    if (this.revealT > 0) return;
    this.revealT = 0.4;
    const P = this.game.player;
    const up = P.up;
    const cosR = Math.cos(REVEAL / PLANET.radius);
    const c = this.cells;
    for (let k = 0; k < this.explored.length; k++) {
      if (this.explored[k]) continue;
      if (c[k * 3] * up.x + c[k * 3 + 1] * up.y + c[k * 3 + 2] * up.z > cosR) this.explored[k] = 1;
    }
    for (const l of this.game.locations) if (!l.discovered && arcDist(up, l.dir) < DISCOVER) this.discover(l);
    if (this.saveT <= 0) { this.saveT = 10; this.save(); }
  }

  // Uncover fog within radius m of a direction (Signal Transponder pings).
  revealAround(dir, radius) {
    const d = dir.clone().normalize();
    const cosR = Math.cos(radius / PLANET.radius);
    const c = this.cells;
    for (let k = 0; k < this.explored.length; k++) if (!this.explored[k] && c[k * 3] * d.x + c[k * 3 + 1] * d.y + c[k * 3 + 2] * d.z > cosR) this.explored[k] = 1;
    for (const l of this.game.locations) if (!l.discovered && arcDist(d, l.dir) < radius) this.discover(l, true);
    this.save();
  }

  // Open with you in the middle, facing up.
  center() {
    const c = this.game.cam;
    const m = new THREE.Matrix4().makeBasis(c.right, c.fwd, c.up);
    this.Q.setFromRotationMatrix(m).invert();
    this.zoom = 1;
    this.cursor = null;
    this.laySig = null; // (territory may have changed since last open)
  }

  // Turn the globe as if dragged (dx, dy) screen px.
  spin(dx, dy) {
    const k = 0.006 / this.zoom;
    this.Q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k));
    this.Q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k));
  }

  bindDrag() {
    let drag = null;
    const cv = this.canvas;
    // (redraw on press: using the mouse hides the controller cursor)
    cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.style.cursor = 'grabbing'; this.aim = null; this.aimCell = -1; this.draw(); });
    window.addEventListener('mouseup', (e) => {
      // (a press that didn't turn the globe is a click: Radio Tower pick, or dev map teleport)
      if (drag && drag.moved < 4 && e.target === cv && e.button === 0) {
        const r = cv.getBoundingClientRect();
        this.clickAt(((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height);
      }
      drag = null; cv.style.cursor = this.mode === 'radio' ? 'crosshair' : 'grab';
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) { this.hover(e); return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.spin(dx, dy);
      this.draw();
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 1, 5);
      this.draw();
    }, { passive: false });
  }

  // Controller cursor (gamepad.js): (mx, my) moves it; while grab is held it drags the globe like the mouse. zoom: the
  // other stick. roll (-1 / 0 / 1, bumpers) turns the map round its middle, anticlockwise / clockwise.
  padUpdate(mx, my, grab, zoom, roll, dt) {
    const W = this.canvas.width, H = this.canvas.height;
    const cur = this.cursor || (this.cursor = { x: W / 2, y: H / 2, grab: false });
    // (slow near stick centre, full speed at the edge)
    const sp = Math.hypot(mx, my) * 620 * dt;
    const dx = mx * sp, dy = my * sp;
    cur.x = THREE.MathUtils.clamp(cur.x + dx, 0, W);
    cur.y = THREE.MathUtils.clamp(cur.y + dy, 0, H);
    const z = THREE.MathUtils.clamp(this.zoom * Math.exp(-zoom * 1.6 * dt), 1, 5);
    if (!dx && !dy && !roll && grab === cur.grab && z === this.zoom && this.cursorDrawn) return;
    this.zoom = z;
    if (roll) this.Q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -roll * 1.4 * dt));
    cur.grab = grab;
    const r = this.canvas.getBoundingClientRect();
    const s = r.width / W; // canvas pixels to screen pixels
    // (a held globe keeps turning with the cursor pinned at the edge)
    if (grab) { this.spin(dx * s, dy * s); this.tip.classList.add('hidden'); }
    else this.hover({ clientX: r.left + cur.x * s, clientY: r.top + cur.y * s });
    this.draw();
  }

  // Unit direction under a canvas point, or null off the globe (inverse of project()).
  dirAt(sx, sy) {
    const W = this.canvas.width, H = this.canvas.height, Rp = (Math.min(W, H) / 2 - 24) * this.zoom;
    const x = (sx - W / 2) / Rp, y = -(sy - H / 2) / Rp, r2 = x * x + y * y;
    if (r2 >= 1) return null;
    return new THREE.Vector3(x, y, Math.sqrt(1 - r2)).applyQuaternion(this.Q.clone().normalize().invert());
  }

  // 'radio': opened from the Radio Tower (main.openMap), a click in the fog sends a sweep; null: the plain map
  setMode(mode) {
    this.mode = mode;
    this.aim = null; this.aimCell = -1;
    this.radioMsg = '';
    document.getElementById('globe-wrap').classList.toggle('radio', mode === 'radio');
    if (this.radioEl) this.radioEl.classList.toggle('hidden', mode !== 'radio');
    this.canvas.style.cursor = mode === 'radio' ? 'crosshair' : 'grab';
  }

  // A click (or A on the controller cursor): in radio mode, a sweep from that point; else the dev map teleport to a pin.
  clickAt(sx, sy) {
    if (this.mode === 'radio') return this.radioPick(sx, sy);
    const g = this.game;
    if (!g.cheats.mapTeleport || !this.pins) return false;
    let best = null, bd = 16;
    for (const p of this.pins) { if (!p.loc) continue; const d = Math.hypot(p.x - sx, p.y - sy); if (d < bd) { bd = d; best = p; } }
    if (!best) return false;
    g.closeModal(false);
    g.cheats.teleport(best.loc);
    return true;
  }

  radioPick(sx, sy) {
    const g = this.game, S = g.town && g.town.radio, d = this.dirAt(sx, sy);
    if (!S || !d) return false;
    const why = S.start(d);
    this.radioMsg = why;
    if (why) g.audio.tone(180, 0.08, 'square', 0.05); else g.audio.click();
    this.aim = null; this.aimCell = -1;
    this.draw();
    return true;
  }

  // stop / resume the sweep (panel button, X)
  radioToggle() {
    const S = this.game.town && this.game.town.radio;
    if (!S) return;
    if (S.on) S.stop(); else S.resume();
    this.draw();
  }

  padClick() { return this.cursor ? this.clickAt(this.cursor.x, this.cursor.y) : false; }

  project(v, out) {
    const p = out.copy(v).normalize().applyQuaternion(this.Q);
    const W = this.canvas.width, H = this.canvas.height;
    const Rp = (Math.min(W, H) / 2 - 24) * this.zoom;
    return { x: W / 2 + p.x * Rp, y: H / 2 - p.y * Rp, z: p.z, Rp };
  }

  hover(e) {
    if (!this.pins || this.canvas.offsetParent === null) { if (this.tip) this.tip.classList.add('hidden'); return; }
    const r = this.canvas.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * this.canvas.width, sy = ((e.clientY - r.top) / r.height) * this.canvas.height;
    // radio mode: where a click would sweep. Redrawn only on entering another cell (~155 m)
    if (this.mode === 'radio') {
      const d = this.dirAt(sx, sy), cell = d ? this.cellOf(d) : -1;
      if (cell !== this.aimCell) { this.aimCell = cell; this.aim = d; this.aimOk = !!d && !this.explored[cell]; this.draw(); }
    }
    let best = null, bd = 16;
    for (const p of this.pins) { const d = Math.hypot(p.x - sx, p.y - sy); if (d < bd) { bd = d; best = p; } }
    // terminator line, if no pin is closer
    let onTerm = false;
    if (!best && this.termPts) {
      const T = this.termPts;
      for (let i = 0; i + 1 < T.length && !onTerm; i++) {
        if (T[i].brk) continue;
        const ax = T[i].x, ay = T[i].y, bx = T[i + 1].x, by = T[i + 1].y;
        const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((sx - ax) * (bx - ax) + (sy - ay) * (by - ay)) / L2));
        if (Math.hypot(ax + t * (bx - ax) - sx, ay + t * (by - ay) - sy) < 9) onTerm = true;
      }
    }
    if (onTerm !== !!this.termHover) { this.termHover = onTerm; this.draw(); }
    if (onTerm) best = { html: '<b>THE TERMINATOR</b><br>Edge of the <b>dark side</b>. Past this line the sun never rises: no solar power, frozen ground, deeper shadows. Your lamp matters out there, and dark-side deliveries pay extra.' };
    if (!best) { this.tip.classList.add('hidden'); return; }
    this.tip.innerHTML = best.html;
    this.tip.style.left = e.clientX + 14 + 'px';
    this.tip.style.top = e.clientY + 14 + 'px';
    this.tip.classList.remove('hidden');
  }

  draw() {
    const g = this.game;
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const v = new THREE.Vector3();
    const P0 = this.project(v.set(0, 0, 1), new THREE.Vector3());
    const Rp = P0.Rp;
    c.fillStyle = '#05030c';
    c.fillRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, Rp, 0, Math.PI * 2); c.clip();
    // fog base with hatching
    c.fillStyle = '#120e1f';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(120,100,170,0.12)';
    c.lineWidth = 1;
    for (let x = -H; x < W; x += 10) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + H, H); c.stroke(); }
    // explored ground, sunlit, on its own layer so the territory tint is per pixel (sharp borders), not per ~180 m cell
    const cell = ((Math.PI / 2) / RES) * Rp * 1.35;
    const cells = this.cells;
    const tmp = new THREE.Vector3();
    const lay = this.layer || (this.layer = document.createElement('canvas'));
    if (lay.width !== W || lay.height !== H) { lay.width = W; lay.height = H; this.layerCtx = null; this.laySig = null; }
    const lc = this.layerCtx || (this.layerCtx = lay.getContext('2d', { willReadFrequently: true }));
    // (rebuilt only when a cell is charted or the globe turns / zooms: the per-pixel tint is most of a draw's cost)
    const sum = this.explored.reduce((a, b) => a + b, 0);
    const sig = `${sum}|${W}|${this.zoom}|${this.Q.toArray()}`;
    if (sig !== this.laySig) {
      this.laySig = sig;
      lc.clearRect(0, 0, W, H);
      for (let k = 0; k < this.explored.length; k++) {
        if (!this.explored[k]) continue;
        tmp.set(cells[k * 3], cells[k * 3 + 1], cells[k * 3 + 2]);
        const p = this.project(tmp, v);
        if (p.z <= 0) continue;
        const lit = THREE.MathUtils.clamp(tmp.dot(SUN) * 1.3 + 0.12, 0, 1);
        lc.fillStyle = `rgb(${Math.round(28 + lit * 170)},${Math.round(22 + lit * 160)},${Math.round(48 + lit * 160)})`;
        const s = cell * (0.55 + 0.45 * p.z);
        lc.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      if (g.territory) this.tintTerritory(lc, W, H, Rp);
    }
    c.drawImage(lay, 0, 0);
    // craters & black lakes you've seen
    const seen = (d) => this.explored[this.cellOf(d)];
    // roads over charted ground (dark casing under a pale line, readable on lit and shadowed ground)
    const tr = g.world.traffic;
    if (tr && tr.mapChunks) {
      const road = new Path2D();
      for (const ch of tr.mapChunks()) {
        if (!seen(ch.c)) continue;
        let pen = false;
        for (const d of ch.pts) {
          const p = this.project(d, v);
          if (p.z <= 0) { pen = false; continue; }
          if (pen) road.lineTo(p.x, p.y); else road.moveTo(p.x, p.y);
          pen = true;
        }
      }
      c.lineJoin = c.lineCap = 'round';
      c.strokeStyle = 'rgba(18,10,30,0.8)'; c.lineWidth = 2.6 + this.zoom * 0.5; c.stroke(road);
      c.strokeStyle = '#e9cf94'; c.lineWidth = 1.2 + this.zoom * 0.4; c.stroke(road);
      c.lineJoin = 'miter'; c.lineCap = 'butt';
    }
    c.strokeStyle = 'rgba(20,10,30,0.55)';
    c.lineWidth = 1.2;
    for (const cr of g.planet.craters) {
      if (cr.R < 70 || !seen(cr.d)) continue;
      const p = this.project(cr.d, v);
      if (p.z <= 0.05) continue;
      const rr = (cr.R / PLANET.radius) * Rp;
      c.beginPath(); c.ellipse(p.x, p.y, rr, rr * p.z, Math.atan2(p.y - H / 2, p.x - W / 2) + Math.PI / 2, 0, Math.PI * 2); c.stroke();
    }
    for (const lk of g.world.lakes) {
      if (!seen(lk.d)) continue;
      const p = this.project(lk.d, v);
      if (p.z <= 0.05) continue;
      const rr = Math.max(2.5, (lk.rad / PLANET.radius) * Rp);
      c.fillStyle = '#05020c';
      c.beginPath(); c.ellipse(p.x, p.y, rr, rr * p.z, Math.atan2(p.y - H / 2, p.x - W / 2) + Math.PI / 2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#7b5cff'; c.stroke();
    }
    // terminator (dark-side edge): always drawn, fog or not; lights up when pointed at
    const hot = this.termHover;
    this.termPts = [];
    let best = null;
    c.setLineDash(hot ? [] : [10, 5]);
    const term = new Path2D();
    let pen = false;
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * Math.PI * 2;
      tmp.copy(E1).multiplyScalar(Math.cos(t)).addScaledVector(E2, Math.sin(t));
      const p = this.project(tmp, v);
      if (p.z > 0) {
        if (pen) term.lineTo(p.x, p.y); else term.moveTo(p.x, p.y);
        pen = true;
        this.termPts.push({ x: p.x, y: p.y, brk: false });
        if (!best || p.z > best.z) best = { ...p, d: tmp.clone() };
      } else { pen = false; if (this.termPts.length) this.termPts[this.termPts.length - 1].brk = true; }
    }
    // indigo casing under the violet line, readable on lit ground and fog
    c.strokeStyle = '#180c33'; c.lineWidth = hot ? 7 : 5; c.stroke(term);
    c.strokeStyle = hot ? '#d9b8ff' : '#a070ff'; c.lineWidth = hot ? 4 : 2.2;
    c.shadowColor = '#a070ff'; c.shadowBlur = hot ? 14 : 0;
    c.stroke(term);
    c.setLineDash([]); c.shadowBlur = 0;
    // label on the dark side, with a pointer into it
    if (best) {
      const q = this.project(best.d.clone().addScaledVector(SUN, -0.12), v);
      let ax = q.x - best.x, ay = q.y - best.y;
      const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
      const lx = best.x + ax * 26, ly = best.y + ay * 26;
      c.font = pixelFont(hot ? 10 : 8); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4; c.strokeStyle = '#120a1e'; c.strokeText('DARK SIDE', lx, ly);
      c.fillStyle = hot ? '#ffffff' : '#c9a8ff'; c.fillText('DARK SIDE', lx, ly);
      c.beginPath(); c.moveTo(lx + ax * 18 - ay * 5, ly + ay * 18 + ax * 5); c.lineTo(lx + ax * 26, ly + ay * 26); c.lineTo(lx + ax * 18 + ay * 5, ly + ay * 18 - ax * 5); c.closePath();
      c.fill();
    }
    c.restore();
    // limb
    const grad = c.createRadialGradient(W / 2, H / 2, Rp * 0.85, W / 2, H / 2, Rp * 1.08);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(123,92,255,0.35)');
    c.fillStyle = grad;
    c.beginPath(); c.arc(W / 2, H / 2, Rp * 1.08, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#120a1e'; c.lineWidth = 5;
    c.beginPath(); c.arc(W / 2, H / 2, Rp, 0, Math.PI * 2); c.stroke();

    this.drawSweep(c, v);
    // pins
    this.pins = [];
    c.textAlign = 'center';
    for (const l of g.locations) {
      if (!l.discovered) continue;
      const p = this.project(l.dir, v);
      if (p.z <= 0) continue;
      const f = FACTIONS[l.faction];
      const ruined = l.type === 'pirate' && l.destroyedUntil && g.time < l.destroyedUntil;
      c.fillStyle = ruined ? '#555' : f.color;
      c.strokeStyle = '#120a1e'; c.lineWidth = 3;
      const r = l.hq ? 9 : l.camp ? 5 : 7;
      c.beginPath();
      if (l.hq) { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.5 : r; c.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); } c.closePath(); }
      else c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fill(); c.stroke();
      if (l.restricted) { c.strokeStyle = '#ff2a4a'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, Math.max(10, (l.zoneR / PLANET.radius) * Rp), 0, Math.PI * 2); c.stroke(); }
      c.font = pixelFont(8 + this.zoom * 0.6);
      c.lineWidth = 3; c.strokeStyle = '#120a1e'; c.fillStyle = '#fff';
      c.strokeText(l.short, p.x, p.y - r - 4); c.fillText(l.short, p.x, p.y - r - 4);
      const feats = services(l);
      this.pins.push({ loc: l, x: p.x, y: p.y, html: `<b>${l.name}</b><br><span style="color:${f.color}">${f.name}</span>${l.hq ? ' · HQ' : ''}${ruined ? ' · RUINED' : ''}<br>${l.blurb}${feats ? `<br><small style="color:#9be7ff">${feats}</small>` : ''}` });
    }
    // active meteor shower: pulsing red zone (shown through fog: a public warning)
    const mw = g.meteors && g.meteors.warning;
    if (mw) {
      const e1 = new THREE.Vector3().crossVectors(mw.dir, Math.abs(mw.dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const e2 = new THREE.Vector3().crossVectors(mw.dir, e1);
      const a = Math.max(mw.r, 120) / PLANET.radius, q = new THREE.Vector3();
      c.beginPath();
      let pen = false, vis = false;
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        q.copy(mw.dir).multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a) * Math.cos(t)).addScaledVector(e2, Math.sin(a) * Math.sin(t));
        const pp = this.project(q, v);
        if (pp.z > 0) { if (pen) c.lineTo(pp.x, pp.y); else c.moveTo(pp.x, pp.y); pen = true; vis = true; } else pen = false;
      }
      c.closePath();
      if (vis) {
        c.fillStyle = `rgba(255,79,46,${0.28 + 0.12 * Math.sin(performance.now() / 220)})`; c.fill();
        c.strokeStyle = '#ff4f2e'; c.lineWidth = 2; c.stroke();
        const p = this.project(mw.dir, v);
        if (p.z > 0) {
          c.font = pixelFont(8 + this.zoom * 0.5); c.lineWidth = 3; c.strokeStyle = '#120a1e'; c.fillStyle = '#ff9f1c';
          c.strokeText('☄ METEORS', p.x, p.y - 10); c.fillText('☄ METEORS', p.x, p.y - 10);
          this.pins.push({ x: p.x, y: p.y, html: `<b style="color:#ff4f2e">☄ METEOR SHOWER</b><br>Rocks are falling over a ${(mw.r * 2 / 1000).toFixed(1)} km patch for about ${Math.max(1, Math.round(mw.left / 60))} more min. Stay clear, or go bounce off them for style.` });
        }
      }
    }
    // SAT-7's orbit (dashed) and position
    if (g.secrets && g.secrets.sat) {
      const S = g.secrets;
      // spring green: no faction uses it; dark casing as for roads
      c.setLineDash([6, 5]);
      const orbit = new Path2D();
      let pen = false;
      const q = new THREE.Vector3();
      for (let i = 0; i <= 240; i++) {
        S.orbitPoint((i / 240) * Math.PI * 2, q).normalize();
        const pp = this.project(q, v);
        if (pp.z > 0) { if (pen) orbit.lineTo(pp.x, pp.y); else orbit.moveTo(pp.x, pp.y); pen = true; } else pen = false;
      }
      c.strokeStyle = '#120a1e'; c.lineWidth = 4.5; c.stroke(orbit);
      c.strokeStyle = '#00ffa8'; c.lineWidth = 2.5; c.stroke(orbit);
      c.setLineDash([]);
      // the low pass, marked
      S.orbitPoint(S.lowAt, q).normalize();
      const lp = this.project(q, v);
      if (lp.z > 0) { c.fillStyle = '#ffd23f'; c.font = pixelFont(7); c.fillText('▼ LOW PASS', lp.x, lp.y - 6); }
      // chevrons ahead of it: direction of travel
      const th = S.satTheta();
      const at = (k) => this.project(S.orbitPoint(th + k, new THREE.Vector3()).normalize(), v);
      const chevron = (x, y, ang, size, alpha) => {
        c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha = alpha;
        c.fillStyle = '#ffd23f'; c.strokeStyle = '#120a1e'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(size, 0); c.lineTo(-size * 0.6, -size * 0.7); c.lineTo(-size * 0.2, 0); c.lineTo(-size * 0.6, size * 0.7); c.closePath();
        c.stroke(); c.fill(); c.restore();
      };
      for (let i = 1; i <= 4; i++) {
        const a0 = at(i * 0.07), a1 = at(i * 0.07 + 0.01);
        if (a0.z > 0 && a1.z > 0) chevron(a0.x, a0.y, Math.atan2(a1.y - a0.y, a1.x - a0.x), 6, 1 - i * 0.18);
      }
      const sp = this.project(q.copy(S.sat.pos).normalize(), v);
      if (sp.z > 0) {
        const a1 = at(0.02);
        if (a1.z > 0) {
          // heading arrow on the satellite
          const ang = Math.atan2(a1.y - sp.y, a1.x - sp.x);
          c.strokeStyle = '#ffd23f'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(sp.x, sp.y); c.lineTo(sp.x + Math.cos(ang) * 16, sp.y + Math.sin(ang) * 16); c.stroke();
          chevron(sp.x + Math.cos(ang) * 18, sp.y + Math.sin(ang) * 18, ang, 7, 1);
        }
        c.fillStyle = '#ffd23f'; c.strokeStyle = '#120a1e'; c.lineWidth = 2;
        c.beginPath(); c.rect(sp.x - 5, sp.y - 3, 10, 6); c.fill(); c.stroke();
        c.fillRect(sp.x - 11, sp.y - 1, 22, 2);
        c.font = pixelFont(8); c.lineWidth = 3; c.strokeText('SAT-7', sp.x, sp.y - 8); c.fillStyle = '#fff'; c.fillText('SAT-7', sp.x, sp.y - 8);
        const toLow = ((S.lowAt - th) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const secs = Math.round(toLow / (Math.PI * 2) * (Math.PI * 2 * 3750 / 55));
        this.pins.push({ x: sp.x, y: sp.y, html: `<b>SAT-7 "Lantern"</b><br>Derelict satellite, heading along the arrows. Skims low just past the ILMB once a lap: next low pass in about ${Math.floor(secs / 60)}m ${secs % 60}s.` });
      }
    }
    // charted outposts: small diamonds (yours: white rim and name)
    if (g.territory) {
      const mine = new Set(g.story ? g.story.founded.concat(g.story.capturedIds) : []);
      for (const o of g.territory.outposts) {
        if (!this.explored[this.cellOf(o.dir)]) continue;
        const p = this.project(o.dir, v);
        if (p.z <= 0) continue;
        const f = FACTIONS[o.faction];
        const own = mine.has(o.id);
        const s2 = own ? 6 : 3.5;
        c.fillStyle = f.color; c.strokeStyle = own ? '#fff' : '#120a1e'; c.lineWidth = own ? 2 : 1.2;
        c.beginPath(); c.moveTo(p.x, p.y - s2); c.lineTo(p.x + s2, p.y); c.lineTo(p.x, p.y + s2); c.lineTo(p.x - s2, p.y); c.closePath(); c.fill(); c.stroke();
        const nm = g.territory.name(o);
        if (own) { c.font = pixelFont(8); c.lineWidth = 3; c.strokeStyle = '#120a1e'; c.fillStyle = '#fff'; c.strokeText(nm, p.x, p.y - 9); c.fillText(nm, p.x, p.y - 9); }
        this.pins.push({ x: p.x, y: p.y, html: `<b>${nm}</b><br><span style="color:${f.color}">${f.name}</span>${own ? ' · YOURS' : ''}` });
      }
    }
    for (const ev of g.events.list) {
      const p = this.project(ev.stage || ev.start, v);
      if (p.z <= 0) continue;
      const f = FACTIONS[ev.faction];
      c.fillStyle = f.color; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(p.x, p.y - 11); c.lineTo(p.x + 9, p.y + 6); c.lineTo(p.x - 9, p.y + 6); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#120a1e'; c.font = pixelFont(8); c.fillText('!', p.x, p.y + 4);
      this.pins.push({ x: p.x, y: p.y, html: `<b>${ev.title}</b><br><span style="color:${f.color}">${f.name} event</span><br>${ev.brief}` });
    }
    const goal = g.objective();
    if (goal) {
      const p = this.project(goal.pos, v);
      if (p.z > 0) { c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, 13, 0, Math.PI * 2); c.stroke(); }
    }
    const pp = this.project(g.player.pos, v);
    if (pp.z > 0) {
      const ahead = this.project(g.player.pos.clone().normalize().addScaledVector(g.cam.fwd, 0.03), new THREE.Vector3());
      const a = Math.atan2(ahead.y - pp.y, ahead.x - pp.x);
      c.save(); c.translate(pp.x, pp.y); c.rotate(a + Math.PI / 2);
      c.fillStyle = '#ff4f2e'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    const pct = Math.round((sum / this.explored.length) * 100);
    c.font = pixelFont(11); c.textAlign = 'left'; c.fillStyle = '#ffd23f';
    c.fillText(`CHARTED ${pct}% · ${this.game.locations.filter((l) => l.discovered).length} LOCATIONS`, 14, 24);
    const sweep = g.town && g.town.radio;
    if (sweep && sweep.on) { c.fillStyle = '#7dffd4'; c.fillText(`RADIO SWEEP ${Math.round(sweep.frac * 100)}%`, 14, 42); }
    c.textAlign = 'right'; c.fillStyle = '#c9c3d9';
    const cur = g.input.padActive && this.cursor;
    const radio = this.mode === 'radio';
    // (radio hint kept short: on a narrow window the panel covers its left; the panel says the rest)
    c.fillText(cur ? (radio ? 'A SWEEP · X STOP · RT GRAB · B CLOSE' : 'L-STICK MOVE · RT GRAB · LB/RB TURN · R-STICK ZOOM · B CLOSE')
      : (radio ? 'CLICK THE FOG TO SWEEP · M / ESC TO CLOSE' : 'DRAG TO SPIN · SCROLL TO ZOOM · M / ESC TO CLOSE'), W - 14, H - 14);
    // controller cursor: open ring with a dot, closed while grabbing
    this.cursorDrawn = !!cur;
    if (cur) {
      const rr = cur.grab ? 7 : 11;
      const ring = () => {
        c.beginPath(); c.arc(cur.x, cur.y, rr, 0, Math.PI * 2);
        if (!cur.grab) for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; c.moveTo(cur.x + Math.cos(a) * rr, cur.y + Math.sin(a) * rr); c.lineTo(cur.x + Math.cos(a) * (rr + 6), cur.y + Math.sin(a) * (rr + 6)); }
        c.stroke();
      };
      c.strokeStyle = '#120a1e'; c.lineWidth = 6; ring();
      c.strokeStyle = '#ffd23f'; c.lineWidth = 2.5; ring();
      c.fillStyle = cur.grab ? '#ffd23f' : '#fff';
      c.beginPath(); c.arc(cur.x, cur.y, cur.grab ? rr - 1 : 2, 0, Math.PI * 2); c.fill();
    }
    if (radio) this.radioPanel();
  }

  // A ring of `metres` round a Moon point as a Path2D, far side left out (whole: none of it is round the back).
  ringPath(dir, metres, steps = 72) {
    const e1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const e2 = new THREE.Vector3().crossVectors(dir, e1);
    const a = metres / PLANET.radius, q = new THREE.Vector3(), v = new THREE.Vector3(), path = new Path2D();
    let pen = false, whole = true;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      q.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a) * Math.cos(t)).addScaledVector(e2, Math.sin(a) * Math.sin(t));
      const p = this.project(q, v);
      if (p.z > 0) { if (pen) path.lineTo(p.x, p.y); else path.moveTo(p.x, p.y); pen = true; } else { pen = false; whole = false; }
    }
    return { path, whole };
  }

  // The Radio Tower sweep (both modes): max reach (dashed), growing rim, start point; in radio mode also the ring a click
  // would send (green over fog, red over charted ground).
  drawSweep(c, v) {
    const T = this.game.town, S = T && T.radio, s = S && S.s, aim = this.mode === 'radio' && this.aim;
    if (!s && !aim) return;
    c.save();
    c.lineJoin = c.lineCap = 'round';
    if (aim) {
      const { path } = this.ringPath(aim, SWEEP.max);
      c.setLineDash([8, 6]); c.strokeStyle = 'rgba(18,10,30,0.8)'; c.lineWidth = 4.5; c.stroke(path);
      c.strokeStyle = this.aimOk ? '#7dffd4' : '#ff7a8a'; c.lineWidth = 2; c.stroke(path);
      c.setLineDash([]);
    }
    if (s) {
      const col = s.on ? '#7dffd4' : '#9aa6ff';
      const max = this.ringPath(s.dir, SWEEP.max).path;
      c.setLineDash([3, 7]); c.strokeStyle = 'rgba(18,10,30,0.7)'; c.lineWidth = 3.5; c.stroke(max);
      c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1.5; c.stroke(max);
      c.setLineDash([]); c.globalAlpha = 1;
      if (s.r > 1) {
        const rim = this.ringPath(s.dir, s.r);
        if (rim.whole) { c.fillStyle = s.on ? 'rgba(125,255,212,0.10)' : 'rgba(154,166,255,0.07)'; c.fill(rim.path); }
        c.strokeStyle = 'rgba(18,10,30,0.85)'; c.lineWidth = 5; c.stroke(rim.path);
        c.strokeStyle = col; c.lineWidth = 2.5; c.shadowColor = col; c.shadowBlur = s.on ? 10 : 0; c.stroke(rim.path); c.shadowBlur = 0;
      }
      const p = this.project(s.dir, v);
      if (p.z > 0) {
        c.strokeStyle = '#120a1e'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(p.x - 7, p.y); c.lineTo(p.x + 7, p.y); c.moveTo(p.x, p.y - 7); c.lineTo(p.x, p.y + 7); c.stroke();
        c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      }
    }
    c.restore();
  }

  // the panel's lines (radio mode: the end of every draw). Figures are set in the display face
  radioPanel() {
    const g = this.game, T = g.town, S = T && T.radio, el = this.gr;
    if (!el || !S) return;
    const s = S.s, max = SWEEP.max, n = (x) => Math.round(x).toLocaleString('en-US');
    const status = !s ? 'IDLE' : s.on ? 'SWEEPING' : s.r >= max ? 'MAX RANGE' : 'STOPPED';
    el.name.textContent = T.state ? T.state.name.toUpperCase() : '';
    el.status.textContent = status;
    el.status.className = 'gr-status' + (status === 'IDLE' || status === 'STOPPED' ? ' off' : status === 'MAX RANGE' ? ' done' : '');
    el.r.textContent = `${n(s ? s.r : 0)} m`;
    el.bar.style.width = `${Math.round(S.frac * 100)}%`;
    el.cells.textContent = `${s ? n(s.cells) : 0} cells`;
    const names = s ? s.found.map((id) => g.locations.find((l) => l.id === id)).filter(Boolean).map((l) => l.name) : [];
    el.found.textContent = names.length ? `Found: ${names.slice(-3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : '';
    el.msg.textContent = this.radioMsg;
    el.btn.disabled = !s || (!s.on && s.r >= max);
    el.btn.textContent = !s || (!s.on && s.r >= max) ? 'PICK A SPOT IN THE FOG' : s.on ? 'STOP SWEEP (X)' : 'RESUME SWEEP (X)';
    el.help.textContent = `${g.input.padActive ? 'Move the cursor into the fog and press A' : 'Click the fog'} to send a sweep. It grows to ${max / 1000} km, then you must pick a new spot.`;
  }

  // Tint each explored layer pixel by the faction holding the ground under it: one faction's colour, never a blend, so
  // borders are sharp.
  tintTerritory(lc, W, H, Rp) {
    const t = this.game.territory;
    const img = lc.getImageData(0, 0, W, H), px = img.data;
    // project() applies Q unnormalised, which scales the globe: undo that scale (s) and rotate back with the normalised Q
    const s = this.Q.lengthSq() || 1;
    const e = new THREE.Matrix4().makeRotationFromQuaternion(this.Q.clone().normalize().invert()).elements;
    const cx = W / 2, cy = H / 2, k = 1 / (Rp * s);
    for (let y = 0; y < H; y++) {
      const sy = -(y + 0.5 - cy) * k;
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        if (!px[o + 3]) continue;
        const sx = (x + 0.5 - cx) * k;
        const r2 = sx * sx + sy * sy;
        const sz = r2 < 1 ? Math.sqrt(1 - r2) : 0;
        const dx = e[0] * sx + e[4] * sy + e[8] * sz, dy = e[1] * sx + e[5] * sy + e[9] * sz, dz = e[2] * sx + e[6] * sy + e[10] * sz;
        const il = 1 / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1); // (rim pixels past the limb aren't on the unit sphere)
        const tc = t.mapColor(dx * il, dy * il, dz * il);
        px[o] = px[o] * 0.62 + tc[0] * 0.38;
        px[o + 1] = px[o + 1] * 0.62 + tc[1] * 0.38;
        px[o + 2] = px[o + 2] * 0.62 + tc[2] * 0.38;
      }
    }
    lc.putImageData(img, 0, 0);
  }

  cellOf(d) {
    // nearest cell centre (by face; cheap enough for drawing)
    const x = d.x, y = d.y, z = d.z;
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let f, a, b;
    if (ax >= ay && ax >= az) { if (x > 0) { f = 0; a = -z / x; b = y / x; } else { f = 1; a = z / -x; b = y / -x; } }
    else if (ay >= az) { if (y > 0) { f = 2; a = x / y; b = -z / y; } else { f = 3; a = x / -y; b = z / -y; } }
    else if (z > 0) { f = 4; a = x / z; b = y / z; } else { f = 5; a = x / z; b = y / -z; }
    const i = Math.min(RES - 1, Math.floor((Math.atan(a) / (Math.PI / 4) + 1) * 0.5 * RES));
    const j = Math.min(RES - 1, Math.floor((Math.atan(b) / (Math.PI / 4) + 1) * 0.5 * RES));
    return (f * RES + j) * RES + i;
  }
}

// What a place offers, for the map tooltip.
const SPECIAL = {
  ilmb: 'Repair-bay upgrades',
  meridian: 'Skate finishes',
  antimatter: 'Containment jars · reactor · splice pod · holding pen',
  downs: 'Chimera races · betting · race card',
  casino: 'Blackjack · Duck Derby · Plinko · prize counter',
  monolith: 'Touch it',
};
function services(l) {
  const out = [];
  if (l.jobs) out.push('Job board');
  if (l.repair) out.push('Repairs');
  if (SHOPS[l.id] || l.hq) out.push(l.faction === 'rustmoon' ? 'Gear (members only)' : 'Faction gear');
  if (SPECIAL[l.id]) out.push(SPECIAL[l.id]);
  if (l.restricted) out.push('Restricted zone');
  if (l.dark && l.type !== 'pirate') out.push('Dark side: hazard pay');
  return out.join(' · ');
}
