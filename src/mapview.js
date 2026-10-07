import * as THREE from 'three';
import { faceDir } from './planet.js';
import { PLANET } from './config.js';
import { SUN, E1, E2, arcDist } from './geo.js';
import { FACTIONS } from './locations.js';
import { pixelFont } from './fonts.js';

const RES = 32; // exploration cells per cube-face edge (~180 m)
const KEY = 'moonrunner-explore-v1';
const REVEAL = 480; // metres around you that get uncovered
const DISCOVER = 950; // settlements get marked when you come this close

// A draggable, zoomable globe with fog of war: only ground you've seen is mapped, and only
// settlements you've found (or been sent to) are marked.
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
    this.load();
    for (const l of game.locations) l.discovered = this.discovered.has(l.id);
    this.bindDrag();
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

  // Uncover the fog within radius metres of a direction (Signal Transponder pings).
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
  }

  bindDrag() {
    let drag = null;
    const cv = this.canvas;
    cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.style.cursor = 'grabbing'; });
    window.addEventListener('mouseup', () => { drag = null; cv.style.cursor = 'grab'; });
    window.addEventListener('mousemove', (e) => {
      if (!drag) { this.hover(e); return; }
      const k = 0.006 / this.zoom;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      this.Q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k));
      this.Q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k));
      this.draw();
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 1, 5);
      this.draw();
    }, { passive: false });
  }

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
    let best = null, bd = 16;
    for (const p of this.pins) { const d = Math.hypot(p.x - sx, p.y - sy); if (d < bd) { bd = d; best = p; } }
    // the terminator line, when no pin is closer
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
    // explored ground, lit by the sun
    const cell = ((Math.PI / 2) / RES) * Rp * 1.35;
    const cells = this.cells;
    const tmp = new THREE.Vector3();
    for (let k = 0; k < this.explored.length; k++) {
      if (!this.explored[k]) continue;
      tmp.set(cells[k * 3], cells[k * 3 + 1], cells[k * 3 + 2]);
      const p = this.project(tmp, v);
      if (p.z <= 0) continue;
      const lit = THREE.MathUtils.clamp(tmp.dot(SUN) * 1.3 + 0.12, 0, 1);
      let r = 28 + lit * 170, gg = 22 + lit * 160, b = 48 + lit * 160;
      // territory: every cell is tinted by the faction that holds it
      if (g.territory) {
        const tc = g.territory.cellColor(k, tmp.x, tmp.y, tmp.z);
        r = r * 0.62 + tc.r * 255 * 0.38; gg = gg * 0.62 + tc.g * 255 * 0.38; b = b * 0.62 + tc.b * 255 * 0.38;
      }
      c.fillStyle = `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(b)})`;
      const s = cell * (0.55 + 0.45 * p.z);
      c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    // craters & black lakes you've seen
    const seen = (d) => this.explored[this.cellOf(d)];
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
    // terminator: the edge of the dark side, in its own colour (SAT-7's orbit is the yellow dashes).
    // It's always drawn, fog or not, and lights up when you point at it.
    const hot = this.termHover;
    this.termPts = [];
    let best = null;
    c.strokeStyle = hot ? '#d9b8ff' : '#a070ff';
    c.shadowColor = '#a070ff'; c.shadowBlur = hot ? 14 : 0;
    c.setLineDash(hot ? [] : [10, 5]);
    c.lineWidth = hot ? 4 : 2.2;
    c.beginPath();
    let pen = false;
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * Math.PI * 2;
      tmp.copy(E1).multiplyScalar(Math.cos(t)).addScaledVector(E2, Math.sin(t));
      const p = this.project(tmp, v);
      if (p.z > 0) {
        if (pen) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
        pen = true;
        this.termPts.push({ x: p.x, y: p.y, brk: false });
        if (!best || p.z > best.z) best = { ...p, d: tmp.clone() };
      } else { pen = false; if (this.termPts.length) this.termPts[this.termPts.length - 1].brk = true; }
    }
    c.stroke();
    c.setLineDash([]); c.shadowBlur = 0;
    // label on the dark side of the line, with a little pointer into the dark
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
      this.pins.push({ x: p.x, y: p.y, html: `<b>${l.name}</b><br><span style="color:${f.color}">${f.name}</span>${l.hq ? ' · HQ' : ''}${ruined ? ' · RUINED' : ''}<br>${l.blurb}` });
    }
    // SAT-7's orbit (dashed) and where it is right now
    if (g.secrets && g.secrets.sat) {
      const S = g.secrets;
      c.strokeStyle = 'rgba(255,210,63,0.55)'; c.lineWidth = 1.5; c.setLineDash([3, 6]);
      c.beginPath();
      let pen = false;
      const q = new THREE.Vector3();
      for (let i = 0; i <= 240; i++) {
        S.orbitPoint((i / 240) * Math.PI * 2, q).normalize();
        const pp = this.project(q, v);
        if (pp.z > 0) { if (pen) c.lineTo(pp.x, pp.y); else c.moveTo(pp.x, pp.y); pen = true; } else pen = false;
      }
      c.stroke(); c.setLineDash([]);
      // the low pass, marked
      S.orbitPoint(S.lowAt, q).normalize();
      const lp = this.project(q, v);
      if (lp.z > 0) { c.fillStyle = '#ffd23f'; c.font = pixelFont(7); c.fillText('▼ LOW PASS', lp.x, lp.y - 6); }
      // chevrons along the orbit ahead of it, showing which way it's travelling
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
          // a heading arrow on the satellite itself
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
    // outposts you've charted: small diamonds (yours get a white rim and a name)
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
    const pct = Math.round((this.explored.reduce((a, b) => a + b, 0) / this.explored.length) * 100);
    c.font = pixelFont(11); c.textAlign = 'left'; c.fillStyle = '#ffd23f';
    c.fillText(`CHARTED ${pct}% · ${this.discovered.size} LOCATIONS`, 14, 24);
    c.textAlign = 'right'; c.fillStyle = '#c9c3d9';
    c.fillText('DRAG TO SPIN · SCROLL TO ZOOM · M / ESC TO CLOSE', W - 14, H - 14);
  }

  cellOf(d) {
    // nearest cell centre (coarse search by face, cheap enough for map drawing)
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
